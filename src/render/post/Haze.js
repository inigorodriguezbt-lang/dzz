// Ported from Tidewater src/post/AirHaze.js (MIT, see LICENSE-Tidewater.txt): the volumetric sun shafts and
// the screen-space god rays. The analytic aerial perspective / marine haze of every surface is the
// per-material half (atmosphereFog in render/Materials.js); this is the post half:
//  - the march: sun in-scatter of the haze ray-marched at half resolution (16 quadratic steps to 2.5 km)
//    through the cascaded sun shadows (one hard tap), the terrain hill shadow and the cloud shadow, jittered per pixel and frame,
//    accumulated temporally (it settles over ~10 frames);
//  - the composite: near the camera the lit in-scatter (bright shafts between shadowed air), far away and
//    on the sky only the shadowed deficit (crepuscular rays in the sky);
//  - god rays: the sky around the key light (sun disc + aureole x cloud transmittance) at quarter
//    resolution, radially blurred toward the light in 3 x 8 taps, strong at golden hour only.
// WebGL conventions: uv.y up, reversed-Z depth (0 = sky).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G, COMMON_GLSL, SHARED_PARS } from '../Materials.js';
import { CLOUD_VIEW_GLSL } from '../sky/Clouds.js';

const f = ( x ) => {
	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';
};

const STEPS = 16;
const MARCH_DIST = 2500; // m: shafts from clouds and hills reach this far
const FAR_CLAMP = 60000; // m (fits half float)
const SS_TAPS = 8;
const SS_DECAY = [ 0.9, 0.97, 1.0 ];
const SS_GAIN = 3.5;

const VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const PARS = /* glsl */`
	${SHARED_PARS}
	uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uCamWorld;
	uniform float uHzFrame; uniform float uShafts; uniform vec2 uSunUV; uniform float uSsFade; uniform float uHistValid;
	uniform float uShadowOn; uniform vec3 uCamFwd;
	uniform mat4 uPrevViewProj; uniform vec3 uPrevCamPos;
	varying vec2 vUv;
	${COMMON_GLSL}
	struct HazeRay { float dist; vec3 dir; bool sky; };
	// view distance of the pixel and its world direction
	HazeRay hazeRay( vec2 uv ) {
		ivec2 size = textureSize( tDepth, 0 );
		float d = texelFetch( tDepth, clamp( ivec2( uv * vec2( size ) ), ivec2( 0 ), size - 1 ), 0 ).r;
		HazeRay r;
		r.sky = d < 1e-7;
		vec4 v = uInvProj * vec4( uv * 2.0 - 1.0, r.sky ? 0.5 : d, 1.0 );
		vec3 vp = v.xyz / v.w;
		r.dist = r.sky ? ${f( FAR_CLAMP )} : min( length( vp ), ${f( FAR_CLAMP )} );
		r.dir = normalize( ( uCamWorld * vec4( vp, 0.0 ) ).xyz );
		return r;
	}
	// the march's sun visibility after the shadow map: hills, clouds
	float hazeVisibilityRest( vec3 P, float v0 ) {
		float v = v0;
		if ( v > 0.0 ) v *= terrainSunShadowAt( P );
		if ( v > 0.0 ) v *= cloudShadowAt( P );
		return v;
	}
`;

const MARCH_FRAG = /* glsl */`
	${PARS}
	void main() {
		vec2 uv = vUv;
		HazeRay R = hazeRay( uv );
		vec4 outC = vec4( 0.0, 0.0, R.dist, 1.0 );
		if ( uShafts > 0.0 ) {
			vec3 cam = uCamPos;
			float tMax = min( R.dist, ${f( MARCH_DIST )} );
			// interleaved gradient noise, decorrelated per frame (golden ratio sequence)
			float jitter = fract( dtIGN( gl_FragCoord.xy ) + uHzFrame * 0.61803398875 );
			float sigM = HZ_MARINE_SIGMA * uHazeDensity;
			float sigA = HZ_AEROSOL_SIGMA * uHazeDensity;
			float lit = 0.0; float all = 0.0; float tau = 0.0; float tPrev = 0.0;
			// the ray in each cascade's light space is linear in t: its end points, once
			vec4 sc0[ 3 ]; vec4 scd[ 3 ];
			for ( int c = 0; c < 3; c ++ ) {
				sc0[ c ] = uCsmMat[ c ] * vec4( cam, 1.0 );
				scd[ c ] = uCsmMat[ c ] * vec4( R.dir, 0.0 );
			}
			float fwdK = dot( R.dir, uCamFwd );
			for ( int i = 0; i < ${STEPS}; i ++ ) {
				// quadratic spacing: dense near the camera (palm and pier shafts), sparse far out (clouds, hills)
				float u = ( float( i ) + jitter ) / ${f( STEPS )};
				float t = u * u * tMax;
				float dt = u * ${f( 2 / STEPS )} * tMax;
				vec3 P = cam + R.dir * t;
				float h = max( P.y, 0.0 );
				float sig = exp( h / - HZ_MARINE_H ) * sigM + exp( h / - HZ_AEROSOL_H ) * sigA;
				tau += sig * ( t - tPrev );
				tPrev = t;
				float Tr = exp( - tau );
				float w = sig * Tr * dt;
				// one hard tap in the cascade covering P (the cascades are spheres around the camera: by distance)
				float v = 1.0;
				if ( uShadowOn > 0.5 ) {
					int c = -1;
					for ( int k = 0; k < 3; k ++ ) if ( c < 0 && float( k ) < uCsmCount && t < uCsmInfo[ k ].x ) c = k;
					if ( c >= 0 ) {
						vec4 sc = c == 0 ? sc0[ 0 ] + scd[ 0 ] * t : ( c == 1 ? sc0[ 1 ] + scd[ 1 ] * t : sc0[ 2 ] + scd[ 2 ] * t );
						if ( ! ( any( lessThanEqual( sc.xy, vec2( 0.0 ) ) ) || any( greaterThanEqual( sc.xy, vec2( 1.0 ) ) ) || sc.z < 0.0 ) ) v = csmTap( c, sc.xy, sc.z + uCsmBias );
					}
				}
				lit += w * hazeVisibilityRest( P, v );
				all += w;
			}
			// the lit share of the in-scatter and the ratio of the marched in-scatter to its exact value over
			// this ray: both smooth across depth edges, unlike the in-scatter itself
			float exact = hazeInScatter( max( cam.y, 0.0 ), R.dir.y, tMax );
			outC = vec4( lit / max( all, 1e-12 ), all / max( exact, 1e-12 ), R.dist, 1.0 );
		}
		gl_FragColor = outC;
	}`;

// temporal accumulation of the march: last frame's result at this pixel's world point (no history across
// disocclusions), clamped to this frame's 3x3 neighbourhood, blended with the new march
const TEMPORAL_FRAG = /* glsl */`
	${PARS}
	uniform sampler2D tCur; uniform sampler2D tPrev;
	void main() {
		ivec2 size = textureSize( tCur, 0 );
		ivec2 p = ivec2( gl_FragCoord.xy );
		vec4 cur = texelFetch( tCur, p, 0 );
		vec4 outC = cur;
		if ( uHistValid > 0.5 ) {
			vec2 lo = cur.xy, hi = cur.xy;
			for ( int k = 0; k < 9; k ++ ) {
				vec2 s = texelFetch( tCur, clamp( p + ivec2( k % 3 - 1, k / 3 - 1 ), ivec2( 0 ), size - 1 ), 0 ).xy;
				lo = min( lo, s ); hi = max( hi, s );
			}
			HazeRay R = hazeRay( vUv );
			vec3 world = uCamPos + R.dir * cur.z;
			vec4 clip = uPrevViewProj * vec4( world, 1.0 );
			if ( clip.w > 1e-4 ) {
				vec2 puv = clip.xy / clip.w * 0.5 + 0.5;
				if ( all( greaterThanEqual( puv, vec2( 0.0 ) ) ) && all( lessThanEqual( puv, vec2( 1.0 ) ) ) ) {
					vec4 prev = texture2D( tPrev, puv );
					float expect = length( world - uPrevCamPos );
					if ( abs( prev.z - expect ) < expect * 0.05 + 0.3 ) outC = vec4( mix( clamp( prev.xy, lo, hi ), cur.xy, 0.12 ), cur.z, 1.0 );
				}
			}
		}
		gl_FragColor = outC;
	}`;

// god ray sources: sky pixels near the key light (sun disc and aureole) x the cloud transmittance
const MASK_FRAG = /* glsl */`
	${PARS}
	${CLOUD_VIEW_GLSL}
	void main() {
		float outV = 0.0;
		if ( uSsFade > 0.001 ) {
			HazeRay R = hazeRay( vUv );
			float cloudT = cloudsSunTransmittance( cloudsSampleView( R.dir ).a );
			float c = dot( R.dir, uSunDir );
			float glow = exp( ( c - 1.0 ) * 600.0 ) + exp( ( c - 1.0 ) * 50.0 ) * 0.25;
			outV = R.sky ? glow * cloudT : 0.0;
		}
		gl_FragColor = vec4( outV, 0.0, 0.0, 1.0 );
	}`;

// one pass of the iterative radial blur toward the light: pass p spans 1 / 8^p of the way
function blurFrag( p ) {
	const span = 0.95 / Math.pow( SS_TAPS, p );
	const decay = SS_DECAY[ p ];
	let taps = '', wSum = 0;
	for ( let j = 0; j < SS_TAPS; j ++ ) {
		const w = Math.pow( decay, j );
		taps += `\t\tacc += texture2D( tSrc, vUv + stp * ( ${f( j )} + jit ) ).r * ${f( w )};\n`;
		wSum += w;
	}
	return /* glsl */`
		uniform sampler2D tSrc; uniform vec2 uSunUV; uniform float uSsFade; uniform float uHzFrame;
		varying vec2 vUv;
		float ign( vec2 px ) { return fract( 52.9829189 * fract( dot( px, vec2( 0.06711056, 0.00583715 ) ) ) ); }
		void main() {
			float outV = 0.0;
			if ( uSsFade > 0.001 ) {
				vec2 stp = ( uSunUV - vUv ) * ${f( span / SS_TAPS )};
				// taps shifted by a per pixel, per frame fraction of a step (centred on 0)
				float jit = fract( ign( gl_FragCoord.xy ) + uHzFrame * 0.61803398875 + ${f( p * 0.37 )} ) - 0.5;
				float acc = 0.0;
${taps}
				outV = acc / ${f( wSum )};
			}
			gl_FragColor = vec4( outV, 0.0, 0.0, 1.0 );
		}`;
}

// the composite over the lit scene: + near lit in-scatter - shadowed deficit + god rays
const COMPOSITE_FRAG = /* glsl */`
	${PARS}
	uniform sampler2D tColor; uniform sampler2D tLow; uniform sampler2D tSS;
	void main() {
		vec3 outC = texture2D( tColor, vUv ).rgb;
		HazeRay R = hazeRay( vUv );
		float dist = R.dist; vec3 dir = R.dir; bool sky = R.sky;
		float camH = max( uCamPos.y, 0.0 );
		vec3 vh = normalize( vec3( dir.x, max( dir.y, 0.02 ), dir.z ) );
		vec3 fog = skyLuminance( vh );
		if ( uStarI > 0.001 ) fog += skyMoonSky( vh );
		vec3 Ep = uSunColor * hazePhase( dot( dir, uSunDir ) );
		float eL = dtLum( Ep );
		float fSun = eL / ( eL + dtLum( uSkyIrr ) + 1e-5 ) * min( uShafts, 1.0 );
		float h = sky ? 1.0 : smoothstep( 0.0, HZ_NEAR, dist );
		if ( uShafts > 0.0 ) {
			// depth-aware upsample of the half resolution march
			ivec2 ls = textureSize( tLow, 0 );
			vec2 pa = vUv * vec2( ls ) - 0.5;
			vec2 i0 = floor( pa );
			vec2 fr = pa - i0;
			vec2 acc = vec2( 0.0 );
			float wSum = 1e-6;
			for ( int k = 0; k < 4; k ++ ) {
				ivec2 o = ivec2( k & 1, k >> 1 );
				vec4 s = texelFetch( tLow, clamp( ivec2( i0 ) + o, ivec2( 0 ), ls - 1 ), 0 );
				float wb = ( o.x == 1 ? fr.x : 1.0 - fr.x ) * ( o.y == 1 ? fr.y : 1.0 - fr.y );
				float rel = abs( s.z - dist ) / max( dist, 0.5 );
				float wt = wb / ( ( rel * 10.0 + 1.0 ) * ( rel * 10.0 + 1.0 ) ) + 1e-5;
				acc += s.xy * wt;
				wSum += wt;
			}
			// the upsample carries the lit share and the march's ratio to the exact in-scatter; the exact
			// in-scatter is then taken over this pixel's own ray
			vec2 sh = acc / wSum;
			float allS = sh.y * hazeInScatter( camH, dir.y, min( dist, ${f( MARCH_DIST )} ) );
			float lit = clamp( sh.x, 0.0, 1.0 ) * allS;
			vec3 nearS = Ep * lit * ( 1.0 - h ) * uShafts;
			vec3 deficit = fog * fSun * ( allS - lit ) * h;
			outC = max( outC + nearS - deficit, vec3( 0.0 ) );
		}
		// screen-space god rays: sun colour x phase x the near air's haze depth
		if ( uSsFade > 0.001 ) {
			float rays = texture2D( tSS, vUv ).r;
			float k = 1.0 - exp( - HZ_MARINE_SIGMA * 300.0 * uHazeDensity );
			outC += Ep * rays * k * uShafts * uSsFade * ${f( SS_GAIN )};
		}
		gl_FragColor = vec4( outC, 1.0 );
	}`;

function target( type = THREE.HalfFloatType, format = THREE.RGBAFormat ) {
	const t = new THREE.WebGLRenderTarget( 1, 1, { type, format, depthBuffer: false } );
	t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
	t.texture.generateMipmaps = false;
	return t;
}

export class Haze {
	constructor() {
		this.low = target();
		this.hist = [ target(), target() ];
		this.ss = [ 0, 1, 2, 3 ].map( () => target( THREE.HalfFloatType, THREE.RedFormat ) );
		this._hc = 0;
		this._histValid = false;
		this.frame = 0;
		this.cloudSource = null; // render/sky/Clouds (the view clouds for the god ray mask)
		const U = this.U = Object.assign( {
			tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
			uHzFrame: { value: 0 }, uShafts: { value: 1 }, uSunUV: { value: new THREE.Vector2( 0.5, 0.5 ) }, uSsFade: { value: 0 }, uHistValid: { value: 0 },
			uShadowOn: { value: 0 }, uCamFwd: { value: new THREE.Vector3() },
			uPrevViewProj: { value: new THREE.Matrix4() }, uPrevCamPos: { value: new THREE.Vector3() },
			uCloudView: { value: null }, uCvRight: { value: new THREE.Vector3() }, uCvUp: { value: new THREE.Vector3() },
			uCvFwd: { value: new THREE.Vector3() }, uCvTan: { value: new THREE.Vector2( 1, 1 ) }, uCvValid: { value: 0 },
		}, G );
		const m = ( frag, extra = {} ) => new THREE.ShaderMaterial( { vertexShader: VERT, fragmentShader: frag, uniforms: Object.assign( extra, U ), depthTest: false, depthWrite: false } );
		this.marchMat = m( MARCH_FRAG );
		this.temporalMat = m( TEMPORAL_FRAG, { tCur: { value: this.low.texture }, tPrev: { value: null } } );
		this.maskMat = m( MASK_FRAG );
		this.blurMats = [ 0, 1, 2 ].map( ( p ) => new THREE.ShaderMaterial( {
			vertexShader: VERT, fragmentShader: blurFrag( p ), depthTest: false, depthWrite: false,
			uniforms: { tSrc: { value: this.ss[ p ].texture }, uSunUV: U.uSunUV, uSsFade: U.uSsFade, uHzFrame: U.uHzFrame },
		} ) );
		this.compositeMat = m( COMPOSITE_FRAG, { tColor: { value: null }, tLow: { value: null }, tSS: { value: this.ss[ 3 ].texture } } );
		this.quad = new FullScreenQuad();
		this._prevVP = new THREE.Matrix4();
		this._prevCam = new THREE.Vector3();
		this._hasPrev = false;
		this._vp = new THREE.Matrix4();
	}

	setSize( w, h ) {
		const hw = Math.max( 1, Math.round( w * 0.5 ) ), hh = Math.max( 1, Math.round( h * 0.5 ) );
		this.low.setSize( hw, hh );
		for ( const r of this.hist ) r.setSize( hw, hh );
		for ( const r of this.ss ) r.setSize( Math.max( 1, Math.round( w * 0.25 ) ), Math.max( 1, Math.round( h * 0.25 ) ) );
		this._histValid = false;
	}

	_draw( m, t ) {
		this.quad.material = m;
		this.gl.setRenderTarget( t );
		this.quad.render( this.gl );
	}

	// key light on screen and the god ray fade (Tidewater AirHaze.update)
	_sunOnScreen( camera, proj ) {
		const m = camera.matrixWorld.elements, L = G.uSunDir.value, P = proj.elements;
		// view space = camera rotation transposed times the light direction
		const vx = m[ 0 ] * L.x + m[ 1 ] * L.y + m[ 2 ] * L.z;
		const vy = m[ 4 ] * L.x + m[ 5 ] * L.y + m[ 6 ] * L.z;
		const vz = m[ 8 ] * L.x + m[ 9 ] * L.y + m[ 10 ] * L.z;
		const ss = THREE.MathUtils.smoothstep;
		let fade = 0;
		if ( vz < - 0.02 ) {
			const u = 0.5 + 0.5 * ( vx / - vz ) * P[ 0 ], v = 0.5 + 0.5 * ( vy / - vz ) * P[ 5 ];
			this.U.uSunUV.value.set( u, v );
			// fades out as the light leaves the frame, and as it climbs (strong at golden hour only)
			fade = ( 1 - ss( Math.max( Math.abs( u - 0.5 ), Math.abs( v - 0.5 ) ), 0.6, 1.15 ) ) * ss( - vz, 0.02, 0.25 ) * ( 1 - ss( L.y, 0.3, 0.75 ) );
		}
		return fade;
	}

	// gl, the lit colour and depth (with water), the frame's camera, the output, whether the cascaded sun
	// shadows are on (their uniforms are in G), and whether the shafts run this frame.
	// Returns false when there is nothing to add (out untouched)
	render( gl, color, depth, camera, out, shadow, shaftsOn ) {
		this.gl = gl;
		const U = this.U;
		this.frame = ( this.frame + 1 ) % 1024;
		U.uHzFrame.value = this.frame;
		U.tDepth.value = depth;
		U.uInvProj.value.copy( camera.projectionMatrixInverse );
		U.uCamWorld.value.copy( camera.matrixWorld );
		U.uShafts.value = shaftsOn ? 1 : 0;
		U.uShadowOn.value = shadow ? 1 : 0;
		camera.getWorldDirection( U.uCamFwd.value );
		let fade = shaftsOn ? this._sunOnScreen( camera, camera.projectionMatrix ) : 0;
		if ( G.uUnderwater.value > 0.5 ) fade = 0;
		U.uSsFade.value = fade;
		if ( ! shaftsOn && fade <= 0.001 ) {
			this._histValid = false;
			this._hasPrev = false;
			return false;
		}
		const cs = this.cloudSource;
		U.uCvValid.value = cs && cs.viewValid ? 1 : 0;
		if ( cs ) {
			U.uCloudView.value = cs.viewTex;
			U.uCvRight.value.copy( cs.viewRight ); U.uCvUp.value.copy( cs.viewUp ); U.uCvFwd.value.copy( cs.viewFwd ); U.uCvTan.value.copy( cs.viewTan );
		}
		U.uPrevViewProj.value.copy( this._prevVP );
		U.uPrevCamPos.value.copy( this._prevCam );
		if ( shaftsOn ) {
			this._draw( this.marchMat, this.low );
			// accumulate: 16 jittered steps per pixel are noisy; here they settle over ~10 frames
			U.uHistValid.value = this._histValid && this._hasPrev ? 1 : 0;
			this.temporalMat.uniforms.tPrev.value = this.hist[ this._hc ].texture;
			this._draw( this.temporalMat, this.hist[ 1 - this._hc ] );
			this._hc = 1 - this._hc;
			this._histValid = true;
		} else this._histValid = false;
		if ( fade > 0.001 ) {
			this._draw( this.maskMat, this.ss[ 0 ] );
			for ( let i = 0; i < 3; i ++ ) this._draw( this.blurMats[ i ], this.ss[ i + 1 ] );
		}
		const c = this.compositeMat.uniforms;
		c.tColor.value = color;
		c.tLow.value = this.hist[ this._hc ].texture;
		this._draw( this.compositeMat, out );
		// this frame's camera for the next temporal pass
		this._prevVP.multiplyMatrices( camera.userData.projNoJitter || camera.projectionMatrix, camera.matrixWorldInverse );
		this._prevCam.copy( camera.position );
		this._hasPrev = true;
		return true;
	}

	dispose() {
		for ( const t of [ this.low, ...this.hist, ...this.ss ] ) t.dispose();
	}
}
