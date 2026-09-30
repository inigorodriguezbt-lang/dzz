// Ported from Tidewater src/ocean/OceanFFT.js (MIT, see LICENSE-Tidewater.txt)
// Multi-cascade FFT ocean (Tessendorf) with a JONSWAP spectrum, on WebGL2. Tidewater's two compute
// dispatches (a row and a column kernel with the 256-point IFFT in workgroup memory) become fragment
// passes over a 1024 x 256 float atlas (the 4 cascades side by side):
//   init (once per spectrum): h0 and the wave data (kx, kz, 1 / k, omega); the conjugate pass
//   per frame: time evolution into 4 packed complex fields (written in bit-reversed order), 8 row and 8
//   column butterfly stages (ping-pong, 2 colour attachments), then per cascade the sign correction, the
//   Jacobian foam and the output into two mipmapped 256^2 x 4 half-float array textures:
//     uOceanDisp  ( Dx, Dy, Dz, foam )           uOceanDeriv ( dDy/dx, dDy/dz, dDx/dx, dDz/dz )
// Packed complex fields (two real fields per complex IFFT, as in Tidewater):
//   c0 = Dx + i Dz   c1 = Dy + i dDx/dz   c2 = dDy/dx + i dDy/dz   c3 = dDx/dx + i dDz/dz
// The persistent foam lives in disp.w: the two array targets swap every frame, the previous one holds it.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FFT_SIZE, SPECTRUM_GLSL, OCEAN_SEED } from './oceanSpectrum.js';

const C = 4;

const VERT = /* glsl */`
	in vec3 position;
	void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;
const HEAD = /* glsl */`
	precision highp float; precision highp int; precision highp sampler2D; precision highp sampler2DArray;
`;
const BITREV = ( log2n ) => /* glsl */`
	uint fftBitReverse( uint v ) {
		uint r = v;
		r = ( ( r & 0x55u ) << 1u ) | ( ( r >> 1u ) & 0x55u );
		r = ( ( r & 0x33u ) << 2u ) | ( ( r >> 2u ) & 0x33u );
		r = ( ( r & 0x0Fu ) << 4u ) | ( ( r >> 4u ) & 0x0Fu );
		return r >> ${ 8 - log2n }u;
	}
`;

function pass( frag, uniforms ) {
	return new THREE.RawShaderMaterial( {
		glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: HEAD + frag, uniforms,
		depthTest: false, depthWrite: false, blending: THREE.NoBlending,
	} );
}

function atlasRT( N, count ) {
	return new THREE.WebGLRenderTarget( N * C, N, {
		count, type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false,
		minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
	} );
}

// size: the FFT resolution, 256 (Tidewater) or 128 (the 'low' water setting: the same modes up to |n| < 64,
// i.e. all of cascades 0-2 and the finest down to ~11 cm waves, with the same random numbers)
export class OceanFFT {
	constructor( renderer, sizes, size = FFT_SIZE ) {
		this.renderer = renderer;
		this.sizes = sizes.slice();
		this.N = size;
		this.log2n = Math.log2( size );
		const N = size;
		this.quad = new FullScreenQuad( null );
		this.spec = atlasRT( N, 2 ); // h0 (re, im), wave data (kx, kz, 1 / k, omega)
		this.h0c = atlasRT( N, 1 ); // ( h0( k ), conj( h0( -k ) ) )
		this.ping = atlasRT( N, 2 );
		this.pong = atlasRT( N, 2 );
		const arr = () => {
			const rt = new THREE.WebGLArrayRenderTarget( N, N, C, {
				count: 2, depth: C, type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
				wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
				minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
			} );
			for ( const t of rt.textures ) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.generateMipmaps = false; }
			return rt;
		};
		this.out = [ arr(), arr() ];
		this.cur = 0;
		this.time = 0;
		this.needsSpectrum = true;
		this.P = null;
		this.params = { choppiness: 0.9, foamBias: 0.58, foamGain: 3.0, foamDecay: 0.35, foamAdd: 2.5 };
		this._build();
	}

	get disp() { return this.out[ this.cur ].textures[ 0 ]; }
	get deriv() { return this.out[ this.cur ].textures[ 1 ]; }

	// P: oceanSpectrum.spectrumParams()
	setSpectrum( P ) {
		this.P = P;
		const u = this.initMat.uniforms;
		for ( let i = 0; i < C; i ++ ) {
			u.uSizes.value[ i ] = P.sizes[ i ];
			u.uCuts.value[ i ].set( P.cuts[ i ][ 0 ], P.cuts[ i ][ 1 ] );
		}
		for ( let i = 0; i < 2; i ++ ) { u.uSysA.value[ i ].fromArray( P.sysA[ i ] ); u.uSysB.value[ i ].fromArray( P.sysB[ i ] ); }
		u.uDepth.value = P.depth;
		this.needsSpectrum = true;
	}

	_build() {
		const N = this.N, HALF = FFT_SIZE / 2, OFF = ( FFT_SIZE - N ) / 2, FN = FFT_SIZE;
		const spectrumU = {
			uSizes: { value: [ 1, 1, 1, 1 ] }, uCuts: { value: [ 0, 1, 2, 3 ].map( () => new THREE.Vector2() ) },
			uSysA: { value: [ new THREE.Vector4(), new THREE.Vector4() ] }, uSysB: { value: [ new THREE.Vector4(), new THREE.Vector4() ] },
			uDepth: { value: 500 }, uSeed: { value: OCEAN_SEED },
		};
		// ---- init spectrum (OceanFFT.js 303-346)
		this.initMat = pass( /* glsl */`
			uniform float uSizes[ 4 ]; uniform vec2 uCuts[ 4 ]; uniform vec4 uSysA[ 2 ]; uniform vec4 uSysB[ 2 ];
			uniform float uDepth; uniform uint uSeed;
			layout( location = 0 ) out vec4 oH0;
			layout( location = 1 ) out vec4 oWave;
			${ SPECTRUM_GLSL }
			void main() {
				ivec2 p = ivec2( gl_FragCoord.xy );
				// the mode's index in Tidewater's 256^2 grid (the same random numbers at any FFT size)
				int c = p.x / ${ N }; int x = p.x - c * ${ N } + ${ OFF }; int y = p.y + ${ OFF };
				int idx = c * ${ FN * FN } + y * ${ FN } + x;
				float L = uSizes[ c ];
				float dk = TWO_PI / L;
				float kx = float( x - ${ HALF } ) * dk;
				float kz = float( y - ${ HALF } ) * dk;
				float kLen = length( vec2( kx, kz ) );
				vec4 outH = vec4( 0.0 );
				vec4 outW = vec4( kx, kz, 0.0, 0.0 );
				if ( kLen >= uCuts[ c ].x && kLen <= uCuts[ c ].y ) {
					float omega = dispersion( kLen );
					float dOmega = dispersionDerivative( kLen );
					float theta = atan( kz, kx );
					float S0 = jonswap( omega, uSysA[ 0 ], uSysB[ 0 ] ) * directionSpectrum( theta, omega, uSysA[ 0 ], uSysB[ 0 ] ) * shortWavesFade( kLen, uSysB[ 0 ] );
					float S1 = jonswap( omega, uSysA[ 1 ], uSysB[ 1 ] ) * directionSpectrum( theta, omega, uSysA[ 1 ], uSysB[ 1 ] ) * shortWavesFade( kLen, uSysB[ 1 ] );
					float S = max( S0 + S1, 0.0 );
					// E|h0|^2 = S(k) dk^2 / 2 so that var(height) = sum S(k) dk^2 (h has both +k and -k terms)
					float amp = sqrt( S * abs( dOmega ) / kLen * dk * dk ) * 0.5;
					// gaussian random pair (Box-Muller)
					uint seed = uint( idx ) * 4u + uSeed * 7919u;
					float u1 = fftToUnit( fftPcg( seed ) );
					float u2 = fftToUnit( fftPcg( seed + 1u ) );
					float r = sqrt( log( u1 ) * -2.0 );
					outH = vec4( r * cos( u2 * TWO_PI ) * amp, r * sin( u2 * TWO_PI ) * amp, 0.0, 0.0 );
					outW = vec4( kx, kz, 1.0 / kLen, omega );
				}
				oH0 = outH;
				oWave = outW;
			}`, spectrumU );

		// ---- conjugate pass (OceanFFT.js 349-366): ( h0( k ), conj( h0( -k ) ) )
		this.conjMat = pass( /* glsl */`
			uniform sampler2D tH0;
			layout( location = 0 ) out vec4 o;
			void main() {
				ivec2 p = ivec2( gl_FragCoord.xy );
				int c = p.x / ${ N }; int x = p.x - c * ${ N }; int y = p.y;
				int xm = ( ${ N } - x ) % ${ N }; int ym = ( ${ N } - y ) % ${ N };
				vec2 cur = texelFetch( tH0, p, 0 ).xy;
				vec2 hm = texelFetch( tH0, ivec2( c * ${ N } + xm, ym ), 0 ).xy;
				o = vec4( cur.x, cur.y, hm.x, - hm.y );
			}`, { tH0: { value: null } } );

		// ---- time evolution (the row kernel's first half, 422-451), written in bit-reversed order in x
		// and y so the butterfly stages below produce natural order (Tidewater loads into
		// fftShared[ bitReverse ] per row, then per column)
		this.timeMat = pass( /* glsl */`
			uniform sampler2D tH0c; uniform sampler2D tWave; uniform float uTime;
			layout( location = 0 ) out vec4 oA;
			layout( location = 1 ) out vec4 oB;
			${ BITREV( this.log2n ) }
			void main() {
				ivec2 p = ivec2( gl_FragCoord.xy );
				int c = p.x / ${ N };
				ivec2 src = ivec2( c * ${ N } + int( fftBitReverse( uint( p.x - c * ${ N } ) ) ), int( fftBitReverse( uint( p.y ) ) ) );
				vec4 w = texelFetch( tWave, src, 0 );
				vec4 hv = texelFetch( tH0c, src, 0 );
				float ph = w.w * uTime;
				float cs = cos( ph ); float sn = sin( ph );
				// h = h0 * e^{i w t} + conj(h0(-k)) * e^{-i w t}
				float hr = hv.x * cs - hv.y * sn + hv.z * cs + hv.w * sn;
				float hi = hv.x * sn + hv.y * cs - hv.z * sn + hv.w * cs;
				float kx = w.x; float kz = w.y; float ik = w.z;
				float fx = kx * ik; float fz = kz * ik;
				// Dx_hat = i kx/k h, Dz_hat = i kz/k h  ->  c0 = Dx + i Dz
				vec2 c0 = vec2( - ( fx * hi + fz * hr ), fx * hr - fz * hi );
				// c1 = Dy + i dDx/dz,  dDx/dz_hat = -kx kz / k h
				float q = - ( kx * kz * ik );
				vec2 c1 = vec2( hr - q * hi, hi + q * hr );
				// c2 = dDy/dx + i dDy/dz
				vec2 c2 = vec2( - ( kx * hi + kz * hr ), kx * hr - kz * hi );
				// c3 = dDx/dx + i dDz/dz
				float a = - ( kx * kx * ik ); float b = - ( kz * kz * ik );
				vec2 c3 = vec2( a * hr - b * hi, a * hi + b * hr );
				oA = vec4( c0, c1 );
				oB = vec4( c2, c3 );
			}`, { tH0c: { value: null }, tWave: { value: null }, uTime: { value: 0 } } );

		// ---- one butterfly stage (the stage loop of 383-404) along x (rows) or y (columns)
		this.stageMat = pass( /* glsl */`
			uniform sampler2D tA; uniform sampler2D tB; uniform int uStage; uniform int uVertical;
			layout( location = 0 ) out vec4 oA;
			layout( location = 1 ) out vec4 oB;
			// complex multiply of two packed complex numbers (v.xy, v.zw) by scalar complex w
			vec4 fftCmul2( vec4 v, vec2 w ) { return vec4( v.x * w.x - v.y * w.y, v.x * w.y + v.y * w.x, v.z * w.x - v.w * w.y, v.z * w.y + v.w * w.x ); }
			void main() {
				ivec2 p = ivec2( gl_FragCoord.xy );
				int c = p.x / ${ N };
				int e = uVertical == 1 ? p.y : p.x - c * ${ N };
				int half_ = 1 << uStage;
				int r = e & ( 2 * half_ - 1 );
				bool lower = r < half_;
				int pos = lower ? r : r - half_;
				int ei = lower ? e : e - half_;
				int ej = ei + half_;
				ivec2 pi = uVertical == 1 ? ivec2( p.x, ei ) : ivec2( c * ${ N } + ei, p.y );
				ivec2 pj = uVertical == 1 ? ivec2( p.x, ej ) : ivec2( c * ${ N } + ej, p.y );
				float ang = float( pos ) * ( 3.141592653589793 / float( half_ ) );
				vec2 w = vec2( cos( ang ), sin( ang ) );
				vec4 a0 = texelFetch( tA, pi, 0 ); vec4 a1 = texelFetch( tB, pi, 0 );
				vec4 b0 = fftCmul2( texelFetch( tA, pj, 0 ), w ); vec4 b1 = fftCmul2( texelFetch( tB, pj, 0 ), w );
				oA = lower ? a0 + b0 : a0 - b0;
				oB = lower ? a1 + b1 : a1 - b1;
			}`, { tA: { value: null }, tB: { value: null }, uStage: { value: 0 }, uVertical: { value: 0 } } );

		// ---- output of one cascade (the column kernel's end, 494-525): sign, Jacobian foam, textures
		this.outMat = pass( /* glsl */`
			uniform sampler2D tA; uniform sampler2D tB; uniform highp sampler2DArray tPrev; uniform int uCascade;
			uniform float uChop; uniform float uFoamBias; uniform float uFoamGain; uniform float uFoamDecay; uniform float uFoamAdd; uniform float uDt;
			layout( location = 0 ) out vec4 oDisp;
			layout( location = 1 ) out vec4 oDeriv;
			void main() {
				ivec2 p = ivec2( gl_FragCoord.xy );
				ivec2 q = ivec2( uCascade * ${ N } + p.x, p.y );
				float sgn = ( ( p.x + p.y ) & 1 ) == 0 ? 1.0 : -1.0;
				vec4 A = texelFetch( tA, q, 0 ) * sgn;
				vec4 B = texelFetch( tB, q, 0 ) * sgn;
				float Dx = A.x; float Dz = A.y; float Dy = A.z; float Dxz = A.w;
				float Dyx = B.x; float Dyz = B.y; float Dxx = B.z; float Dzz = B.w;
				float lambda = uChop;
				float jxx = lambda * Dxx + 1.0;
				float jzz = lambda * Dzz + 1.0;
				float jxz = lambda * Dxz;
				float J = jxx * jzz - jxz * jxz;
				// Persistent foam: generated where the surface compresses (J < bias),
				// then slowly decays so whitecaps leave trailing foam patches.
				float prev = texelFetch( tPrev, ivec3( p, uCascade ), 0 ).w;
				float gen = clamp( ( uFoamBias - J ) * uFoamGain, 0.0, 1.0 );
				float f = prev * exp( - uFoamDecay * uDt ) + gen * uFoamAdd * uDt;
				float fNew = clamp( max( f, gen * 0.5 ), 0.0, 1.5 );
				oDisp = vec4( lambda * Dx, Dy, lambda * Dz, fNew );
				oDeriv = vec4( Dyx, Dyz, lambda * Dxx, lambda * Dzz );
			}`, {
			tA: { value: null }, tB: { value: null }, tPrev: { value: null }, uCascade: { value: 0 },
			uChop: { value: 0.9 }, uFoamBias: { value: 0.58 }, uFoamGain: { value: 3 }, uFoamDecay: { value: 0.35 }, uFoamAdd: { value: 2.5 }, uDt: { value: 0 },
		} );
	}

	_draw( mat, rt, layer = 0 ) {
		this.quad.material = mat;
		this.renderer.setRenderTarget( rt, layer );
		this.quad.render( this.renderer );
	}

	// advance to time t (s) and rebuild the textures; dt for the foam decay
	update( t, dt ) {
		const gl = this.renderer;
		const prevRT = gl.getRenderTarget(), prevFace = gl.getActiveCubeFace(), prevMip = gl.getActiveMipmapLevel();
		const xr = gl.xr.enabled; gl.xr.enabled = false;
		if ( this.needsSpectrum && this.P ) {
			this.needsSpectrum = false;
			this._draw( this.initMat, this.spec );
			this.conjMat.uniforms.tH0.value = this.spec.textures[ 0 ];
			this._draw( this.conjMat, this.h0c );
		}
		this.time = t;
		const tm = this.timeMat.uniforms;
		tm.tH0c.value = this.h0c.texture; tm.tWave.value = this.spec.textures[ 1 ]; tm.uTime.value = t;
		this._draw( this.timeMat, this.ping );
		let src = this.ping, dst = this.pong;
		const sm = this.stageMat.uniforms;
		for ( let v = 0; v < 2; v ++ ) for ( let s = 0; s < this.log2n; s ++ ) {
			sm.tA.value = src.textures[ 0 ]; sm.tB.value = src.textures[ 1 ];
			sm.uStage.value = s; sm.uVertical.value = v;
			this._draw( this.stageMat, dst );
			const tmp = src; src = dst; dst = tmp;
		}
		// output into the other array target (the current one holds last frame's foam)
		const prev = this.out[ this.cur ];
		this.cur = 1 - this.cur;
		const out = this.out[ this.cur ];
		const P = this.params, om = this.outMat.uniforms;
		om.tA.value = src.textures[ 0 ]; om.tB.value = src.textures[ 1 ]; om.tPrev.value = prev.textures[ 0 ];
		om.uChop.value = P.choppiness; om.uFoamBias.value = P.foamBias; om.uFoamGain.value = P.foamGain;
		om.uFoamDecay.value = P.foamDecay; om.uFoamAdd.value = P.foamAdd; om.uDt.value = dt;
		for ( let c = 0; c < C; c ++ ) {
			om.uCascade.value = c;
			// mip chains once, after the last layer (three builds them after a draw into a mipmapped target)
			for ( const tx of out.textures ) tx.generateMipmaps = c === C - 1;
			this._draw( this.outMat, out, c );
		}
		for ( const tx of out.textures ) tx.generateMipmaps = false;
		gl.setRenderTarget( prevRT, prevFace, prevMip );
		gl.xr.enabled = xr;
	}

	dispose() {
		for ( const rt of [ this.spec, this.h0c, this.ping, this.pong, ...this.out ] ) rt.dispose();
		for ( const m of [ this.initMat, this.conjMat, this.timeMat, this.stageMat, this.outMat ] ) m.dispose();
		this.quad.dispose();
	}
}
