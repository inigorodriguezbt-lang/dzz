// Ported from Tidewater src/sky/Clouds.js (the cirrus veil: cloudsBspline, cloudsFibres, cloudsHigh and the
// synoptic / fibre-flow / fibre kernels, with the clGnoise2 / clGfbm noise helpers) (MIT, see
// LICENSE-Tidewater.txt).
// A thin sheet of cirrus on a curved-earth shell 9 km up, over the cumulus: its coverage varies only over
// hundreds of km, long gently curved fibres follow the upper wind (a line integral convolution of sparse
// seeds along a meandering flow, mipmapped and filtered anisotropically by the pixel footprint, so distant
// fibres melt into a smooth veil). Lit by single scattering on ice (strong forward peak, a faint 22 degree
// halo) plus a little multiple scattering and sky light, and by the sun from below its horizon for a while
// after sunset. The three textures are built once with fragment passes.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G } from '../Materials.js';

const SYN_RES = 256, SYN_SIZE = 409600; // m
const FIB_RES = 1024, FIB_TILE = 40000; // m
const EARTH_R = 6360000;
const AP_DIST = 30000; // m, aerial perspective toward the horizon
const PI = Math.PI;

const f = ( x ) => {
	const s = Number( x ).toString();
	return /[.eE]/.test( s ) ? s : s + '.0';
};

const VERT = /* glsl */`
	void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// 2D noise helpers (Tidewater clHash2 / clMod2 / clVnoise2 / clGnoise2 / clGfbm; tileable per unit)
const NOISE2_GLSL = /* glsl */`
	float clHash2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
	vec2 clMod2( vec2 x, vec2 y ) { return x - y * floor( x / y ); }
	float clSat( float x ) { return clamp( x, 0.0, 1.0 ); }
	float clGh( vec2 i, vec2 fr, vec2 o, vec2 cells ) {
		vec2 c = clMod2( i + o, cells );
		float a = clHash2( c ) * ${ f( 2 * PI ) };
		return dot( vec2( cos( a ), sin( a ) ), fr - o );
	}
	float clGnoise2( vec2 p, vec2 cells ) {
		vec2 q = p * cells;
		vec2 i = floor( q );
		vec2 fr = fract( q );
		vec2 u = fr * fr * ( fr * ( fr * 6.0 - 15.0 ) + 10.0 ); // (sic: the original's fade)
		return mix( mix( clGh( i, fr, vec2( 0.0, 0.0 ), cells ), clGh( i, fr, vec2( 1.0, 0.0 ), cells ), u.x ),
			mix( clGh( i, fr, vec2( 0.0, 1.0 ), cells ), clGh( i, fr, vec2( 1.0, 1.0 ), cells ), u.x ), u.y );
	}
	// gradient noise fbm remapped to about 0..1
	float clGfbm( vec2 p, vec2 cells, float seed ) {
		return ( clGnoise2( p + seed, cells ) * 0.55 + clGnoise2( p + seed * 1.7, cells * 2.0 ) * 0.3 + clGnoise2( p + seed * 2.3, cells * 4.0 ) * 0.15 ) * 1.6 + 0.5;
	}
`;

// r = cirrus coverage (hundreds of km), g = broad streets along the upper wind, b = patches (5 - 50 km)
const SYN_FRAG = /* glsl */`
	${ NOISE2_GLSL }
	void main() {
		vec2 p = floor( gl_FragCoord.xy ) / ${ f( SYN_RES ) } + ${ f( 0.5 / SYN_RES ) };
		float cov = clGfbm( p, vec2( 2.0, 3.0 ), 0.31 );
		float streets = clGfbm( p, vec2( 4.0, 14.0 ), 0.59 );
		float patches = clGfbm( p, vec2( 10.0, 14.0 ), 0.83 ) * 0.7 + clGfbm( p, vec2( 28.0, 40.0 ), 0.21 ) * 0.3;
		gl_FragColor = clamp( vec4( cov, streets, patches, 1.0 ), vec4( 0.0 ), vec4( 1.0 ) );
	}`;

// fibre seeds and the flow: r = seeds, g = flow angle, b = tufts, a = sideways sag downwind of them
const AUX_FRAG = /* glsl */`
	${ NOISE2_GLSL }
	float psi( vec2 q ) { return clGnoise2( q, vec2( 3.0 ) ) * 0.5 + clGnoise2( q + 0.37, vec2( 7.0 ) ) * 0.25 + clGnoise2( q + 0.71, vec2( 15.0 ) ) * 0.1; }
	// sparse jittered points: n cells per texture, probability, radius (cells), seed
	float points( vec2 p, float cluster, float n, float prob, float sigma, float seed ) {
		vec2 q = p * n;
		vec2 ip = floor( q );
		vec2 fp = fract( q );
		float v = 0.0;
		for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
			vec2 o = vec2( float( x ), float( y ) );
			vec2 c = clMod2( ip + o, vec2( n ) ) + seed;
			vec2 pos = o + vec2( clHash2( c ), clHash2( c + 19.7 ) ) * 0.8 + 0.1;
			float on = clHash2( c + 41.3 ) < cluster * prob ? 1.0 : 0.0;
			vec2 d = pos - fp;
			v = max( v, exp( dot( d, d ) * ( -0.5 / ( sigma * sigma ) ) ) * on * ( clHash2( c + 7.1 ) * 0.7 + 0.3 ) );
		}
		return v;
	}
	void main() {
		vec2 p = ( floor( gl_FragCoord.xy ) + 0.5 ) / ${ f( FIB_RES ) };
		float e = ${ f( 1 / FIB_RES ) };
		vec2 curl = vec2( psi( p + vec2( 0.0, e ) ) - psi( p - vec2( 0.0, e ) ), psi( p - vec2( e, 0.0 ) ) - psi( p + vec2( e, 0.0 ) ) ) / ( 2.0 * e );
		vec2 dir = normalize( vec2( 1.0, 0.0 ) + vec2( 0.0, clGnoise2( p + 0.13, vec2( 3.0 ) ) * 0.5 ) + curl * 0.05 );
		float cluster = clSat( clGfbm( p, vec2( 5.0 ), 0.9 ) * 1.6 - 0.3 );
		float seeds = max( points( p, cluster, 110.0, 0.3, 0.18, 0.0 ), points( p, cluster, 44.0, 0.3, 0.18, 3.3 ) * 0.8 );
		// tufts (heads of hooked filaments) and, just downwind of them, a sideways sag of the flow
		float tuft = points( p, cluster, 40.0, 0.4, 0.1, 6.1 );
		float droop = points( p, cluster, 40.0, 0.4, 0.3, 6.1 );
		gl_FragColor = vec4( seeds, atan( dir.y, dir.x ), tuft, droop );
	}`;

// short strands: each wisp fades in and out along its length and is broken up by fine noise
// (r = fibres, g = veil noise)
const FIB_FRAG = /* glsl */`
	${ NOISE2_GLSL }
	uniform sampler2D tAux;
	void main() {
		const int LIC_STEPS = 44;
		float LIC_STEP = ${ f( 1 / FIB_RES ) };
		vec2 p = ( floor( gl_FragCoord.xy ) + 0.5 ) / ${ f( FIB_RES ) };
		vec2 x1 = p; vec2 x2 = p;
		float fib = 0.0;
		float head = 0.0;
		for ( int i = 0; i < LIC_STEPS; i ++ ) {
			float k = float( i );
			vec4 a = textureLod( tAux, x1, 0.0 );
			fib += a.x * sin( ( k + 0.5 ) * ${ f( PI / 44 ) } );
			x1 -= vec2( cos( a.y ), sin( a.y ) ) * LIC_STEP;
			// hooked tails: from the tuft downwind, sagging sideways
			vec4 b = textureLod( tAux, x2, 0.0 );
			head += b.z * exp( k * ${ f( - 1 / 12 ) } );
			x2 -= normalize( vec2( cos( b.y ), sin( b.y ) + b.w * 1.2 ) ) * LIC_STEP;
		}
		float breakup = clSat( clGfbm( p, vec2( 24.0 ), 0.71 ) * 1.6 - 0.25 );
		float wisps = ( 1.0 - exp( fib * -0.8 ) ) * breakup;
		float hooks = 1.0 - exp( head * -0.5 );
		float veil = clGfbm( p, vec2( 4.0 ), 0.33 );
		gl_FragColor = vec4( clSat( max( wisps, hooks ) ), clSat( veil ), 0.0, 1.0 );
	}`;

// for shaders that include COMMON_GLSL: cloudsHigh( rd, pxAngle ) -> vec4( radiance, transmittance ) of the
// cirrus veil along rd (pxAngle: the pixel footprint in radians); clOver( a, b ): layer a in front of b
export const CIRRUS_GLSL = /* glsl */`
	uniform sampler2D uCirSyn; uniform sampler2D uCirFib;
	uniform vec4 uCirrus; // amount, altitude (m), cumulus coverage, on
	uniform vec4 uCirWind; // upper wind frame (cos, sin), drift offset (m)
	const float CL_EARTH_R = ${ f( EARTH_R ) };
	vec4 clOver( vec4 a, vec4 b ) { return vec4( a.rgb + b.rgb * a.a, a.a * b.a ); }
	float clPhaseHG( float c, float g ) { return ( ( 1.0 - g * g ) / ( 4.0 * ${ f( PI ) } ) ) / pow( max( 1.0 + g * g - c * 2.0 * g, 1e-4 ), 1.5 ); }
	// distance along rd from a point at height camY (on the planet axis) to the sphere at altitude H
	float cloudsShell( float camY, vec3 rd, float H ) {
		float b = rd.y * ( camY + CL_EARTH_R );
		float cc = ( camY - H ) * ( camY + H + 2.0 * CL_EARTH_R );
		return - b + sqrt( max( b * b - cc, 0.0 ) );
	}
	// cubic B-spline filtered lookup in 4 bilinear taps (GPU Gems 2, ch. 20): magnified fibres stay smooth
	vec4 cloudsBspline( vec2 uv, float lod ) {
		float size = ${ f( FIB_RES ) } / exp2( lod );
		vec2 st = uv * size - 0.5;
		vec2 i = floor( st );
		vec2 fr = st - i;
		vec2 f2 = fr * fr; vec2 f3 = f2 * fr;
		vec2 w0 = ( - f3 + f2 * 3.0 - fr * 3.0 + 1.0 ) / 6.0;
		vec2 w1 = ( f3 * 3.0 - f2 * 6.0 + 4.0 ) / 6.0;
		vec2 w3 = f3 / 6.0;
		vec2 w2 = 1.0 - w0 - w1 - w3;
		vec2 g0 = w0 + w1; vec2 g1 = w2 + w3;
		vec2 p0 = ( i - 0.5 + w1 / g0 ) / size; vec2 p1 = ( i + 1.5 + w3 / g1 ) / size;
		return textureLod( uCirFib, vec2( p0.x, p0.y ), lod ) * ( g0.x * g0.y )
			+ textureLod( uCirFib, vec2( p1.x, p0.y ), lod ) * ( g1.x * g0.y )
			+ textureLod( uCirFib, vec2( p0.x, p1.y ), lod ) * ( g0.x * g1.y )
			+ textureLod( uCirFib, vec2( p1.x, p1.y ), lod ) * ( g1.x * g1.y );
	}
	vec2 cloudsToWind( vec2 v ) { return vec2( v.x * uCirWind.x + v.y * uCirWind.y, v.y * uCirWind.x - v.x * uCirWind.y ); }
	// anisotropic filtering: n taps along the long axis of the footprint at the mip of its short axis
	vec4 cloudsFibres( vec2 q, vec2 fA, vec2 fB, float tile, float rot ) {
		float cr = cos( rot ); float sr = sin( rot );
		vec2 wq = cloudsToWind( q ); vec2 wa = cloudsToWind( fA ); vec2 wb = cloudsToWind( fB );
		vec2 uv = vec2( wq.x * cr + wq.y * sr, wq.y * cr - wq.x * sr ) / tile;
		vec2 a = vec2( wa.x * cr + wa.y * sr, wa.y * cr - wa.x * sr ) / tile;
		vec2 b = vec2( wb.x * cr + wb.y * sr, wb.y * cr - wb.x * sr ) / tile;
		float la = length( a ) * ${ f( FIB_RES ) }; float lb = length( b ) * ${ f( FIB_RES ) };
		vec2 major = la > lb ? a : b;
		const int n = 3;
		float lod = max( log2( max( min( la, lb ), max( la, lb ) / float( n ) ) ), 0.0 );
		vec4 sum = vec4( 0.0 );
		for ( int i = 0; i < n; i ++ ) sum += cloudsBspline( uv + major * ( ( float( i ) + 0.5 ) / float( n ) - 0.5 ), lod );
		return sum / float( n );
	}
	vec4 cloudsHigh( vec3 rd, float pxAngle ) {
		if ( uCirrus.w < 0.5 || rd.y < -0.01 ) return vec4( 0.0, 0.0, 0.0, 1.0 );
		float H = uCirrus.y;
		float camY = max( uCamPos.y, 1.0 );
		// the key light: the sun while it is the key light (seen from the sheet), else the moon
		bool isMoon = dot( uSunDir, uSkySunDir ) < 0.9999;
		vec3 sunDir = uSunDir;
		float cosT = dot( rd, sunDir );
		// geometry: hit point, local incidence, pixel footprint on the sheet
		float t = cloudsShell( camY, rd, H );
		vec2 pxz = rd.xz * t;
		vec3 up = normalize( vec3( pxz.x / CL_EARTH_R, 1.0, pxz.y / CL_EARTH_R ) );
		float mu = max( dot( rd, up ), 0.02 );
		vec2 radial = normalize( rd.xz + vec2( 1e-6, 0.0 ) );
		vec2 fA = vec2( - radial.y, radial.x ) * ( t * pxAngle );
		vec2 fB = radial * ( t * pxAngle / mu );
		vec2 q = pxz + uCamPos.xz - uCirWind.zw;
		// coverage: patches of 5 - 50 km with clear gaps, modulated over hundreds of km, broad bands
		vec4 syn = textureLod( uCirSyn, cloudsToWind( q ) * ${ f( 1 / SYN_SIZE ) }, 0.0 );
		float cov = smoothstep( 0.15, 0.85, syn.x ) * smoothstep( 0.4, 0.72, syn.z ) * ( syn.y * 0.4 + 0.6 );
		// fibres at two scales (hides the tiling of the texture)
		vec4 f1 = cloudsFibres( q, fA, fB, ${ f( FIB_TILE ) }, 0.0 );
		vec4 f2 = cloudsFibres( q, fA, fB, ${ f( FIB_TILE * 2.3 ) }, 0.5 );
		float fib = f1.x * 0.6 + f2.x * 0.4;
		float veil = f1.y * 0.5 + f2.y * 0.5;
		// vertical optical depth: faint wisps (opacity mostly 0.05 - 0.2) over a thinner veil
		float amount = uCirrus.x * ( uCirrus.z * 0.5 + 0.78 );
		float tau = amount * 0.4 * cov * ( fib * 0.75 + 0.25 ) * ( veil * 0.4 + 0.8 );
		// slant path, bounded so the veil doesn't turn into a white band at the horizon
		float alpha = 1.0 - exp( - tau / max( mu, 0.25 ) );
		// lighting: the key light at the sheet (sunset colours depend on the altitude), the earth's shadow
		float muS = dot( sunDir, up );
		float muE = sunDir.y + dot( sunDir.xz, pxz ) / CL_EARTH_R;
		float lit = isMoon ? 1.0 : smoothstep( -0.006, 0.006, muE + sqrt( max( H, 0.0 ) * ${ f( 2 / EARTH_R ) } ) );
		vec3 E = ( isMoon ? uSunColor : atmosphereSampleTransmittance( 6360.0 + H / 1000.0, muS ) * 11.0 ) * lit;
		// ice: strong forward peak, a faint 22 degree halo, some backscatter; thin: mostly single scattering
		float hd = ( acos( clamp( cosT, -1.0, 1.0 ) ) - 0.384 ) / 0.02;
		float halo = exp( - hd * hd ) * 0.04;
		float phase = clPhaseHG( cosT, 0.85 ) * 0.4 + clPhaseHG( cosT, 0.3 ) * 0.35 + clPhaseHG( cosT, -0.15 ) * 0.25 + halo;
		float Ts = exp( tau * -0.5 / max( muS, 0.1 ) );
		vec3 L = ( E * ( phase * Ts + ( 1.0 - Ts ) * 0.06 ) + uSkyIrr * 0.9 ) * alpha;
		// aerial perspective: haze in front of the sheet shows sky light where the sheet hides it
		float tr = exp( t * ${ f( - 0.25 / AP_DIST ) } );
		vec3 skyL = skyLuminance( rd );
		return vec4( L * tr + skyL * alpha * ( 1.0 - tr ), 1.0 - alpha );
	}
`;

function target( res, type, mips = false ) {
	const t = new THREE.WebGLRenderTarget( res, res, { type, depthBuffer: false, generateMipmaps: mips } );
	const x = t.texture;
	x.wrapS = x.wrapT = THREE.RepeatWrapping;
	x.magFilter = THREE.LinearFilter;
	x.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
	x.generateMipmaps = mips;
	return t;
}

export class Cirrus {
	constructor( gl ) {
		this.gl = gl;
		this.amount = 0.5;
		this.altitude = 9000;
		this.syn = target( SYN_RES, THREE.UnsignedByteType );
		this.aux = target( FIB_RES, THREE.HalfFloatType );
		this.fib = target( FIB_RES, THREE.UnsignedByteType, true );
		this.fib.texture.anisotropy = 1;
		// the upper wind veers 0.6 rad from the trades (Tidewater helpersWGSL)
		const w = G.uWind.value;
		const ha = Math.atan2( w.y, w.x ) + 0.6;
		this.uniforms = {
			uCirSyn: { value: this.syn.texture }, uCirFib: { value: this.fib.texture },
			uCirrus: { value: new THREE.Vector4( this.amount, this.altitude, 0.49, 0 ) },
			uCirWind: { value: new THREE.Vector4( Math.cos( ha ), Math.sin( ha ), 0, 0 ) },
		};
		this.built = false;
		this.offset = new THREE.Vector2();
	}

	_build() {
		const gl = this.gl;
		const prev = gl.getRenderTarget();
		const q = new FullScreenQuad();
		const run = ( frag, rt, uniforms = {} ) => {
			const m = new THREE.ShaderMaterial( { vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false } );
			q.material = m;
			gl.setRenderTarget( rt );
			q.render( gl );
			m.dispose();
		};
		run( SYN_FRAG, this.syn );
		run( AUX_FRAG, this.aux );
		run( FIB_FRAG, this.fib, { tAux: { value: this.aux.texture } } );
		// (the mip chain of the fibres is generated when the target is unbound)
		gl.setRenderTarget( prev );
		q.dispose();
		this.aux.dispose(); // only needed to build the fibres
		this.built = true;
	}

	// coverage: the cumulus cover (0..1), on: false hides the veil
	update( dt, coverage, on ) {
		if ( on && ! this.built ) this._build();
		// drift with the upper wind (1.6 x the cumulus layer's 12 m/s)
		const w = G.uWind.value, l = Math.hypot( w.x, w.y ) || 1;
		this.offset.x += w.x / l * 12 * 1.6 * dt;
		this.offset.y += w.y / l * 12 * 1.6 * dt;
		const U = this.uniforms;
		U.uCirrus.value.set( this.amount, this.altitude, coverage, on ? 1 : 0 );
		U.uCirWind.value.z = this.offset.x;
		U.uCirWind.value.w = this.offset.y;
	}
}
