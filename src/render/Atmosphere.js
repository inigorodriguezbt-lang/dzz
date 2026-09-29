// Ported from Tidewater src/sky/Atmosphere.js (MIT, see LICENSE-Tidewater.txt)
// Physically based sky (Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering
// Technique"): a transmittance LUT and a multiple-scattering LUT built once, a sun-relative sky-view LUT
// rebuilt when the sun or the (quantised) camera altitude changes, and the sky irradiance and horizon
// colour read back a few times a second for the CPU-side light colours. All distances in km inside the
// atmosphere code. The WGSL compute kernels are full-screen fragment passes into half float targets.
// The sun path (sunDirection) is ours: real latitude and day of year.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const RG = 6360.0;
const RT = 6460.0;

export const SUN_ILLUMINANCE = 11.0; // scene units (sun irradiance outside the atmosphere)
export const SUN_ANGULAR_RADIUS = 0.004675 * 1.15;
export const ATMO_RG = RG;

const T_W = 256, T_H = 64;
const MS_RES = 32;
export const SV_W = 192, SV_H = 108;
const LOG_STEP = Math.log( 1.02 );
const GROUND_ALBEDO = [ 0.06, 0.08, 0.1 ];
const MIE_G = 0.8;

const f = ( x ) => {
	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';
};

// medium, parameterisations and ray / sphere helpers (no textures: shared by the kernels and COMMON_GLSL)
export const ATMOS_CORE_GLSL = /* glsl */`
	#ifndef ATMO_CORE
	#define ATMO_CORE
	const float ATMO_RG = ${f( RG )};
	const float ATMO_RT = ${f( RT )};
	const float ATMO_PI = 3.141592653589793;
	struct AtmosphereMedium { vec3 rayScat; float mieScat; vec3 extinction; vec3 scattering; };
	AtmosphereMedium atmosphereMedium( float hKm ) {
		float rayDensity = exp( - hKm / 8.0 );
		float mieDensity = exp( - hKm / 1.2 );
		float ozoneDensity = max( 0.0, 1.0 - abs( hKm - 25.0 ) / 15.0 );
		AtmosphereMedium m;
		m.rayScat = vec3( 5.802e-3, 13.558e-3, 33.1e-3 ) * rayDensity;
		m.mieScat = 3.996e-3 * mieDensity;
		float mieExt = 4.440e-3 * mieDensity;
		vec3 ozoneAbs = vec3( 0.650e-3, 1.881e-3, 0.085e-3 ) * ozoneDensity;
		m.extinction = m.rayScat + mieExt + ozoneAbs;
		m.scattering = m.rayScat + m.mieScat;
		return m;
	}
	// (r, mu) -> transmittance LUT uv
	vec2 atmosphereTransmittanceUV( float r, float mu ) {
		float H = sqrt( ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG );
		float rho = sqrt( max( r * r - ATMO_RG * ATMO_RG, 0.0 ) );
		float disc = r * r * ( mu * mu - 1.0 ) + ATMO_RT * ATMO_RT;
		float d = max( 0.0, - r * mu + sqrt( max( disc, 0.0 ) ) );
		float dMin = ATMO_RT - r;
		float dMax = rho + H;
		float xMu = ( d - dMin ) / ( dMax - dMin );
		float xR = rho / H;
		return vec2( ( xMu + ${f( 0.5 / T_W )} ) * ${f( T_W / ( T_W + 1 ) )}, ( xR + ${f( 0.5 / T_H )} ) * ${f( T_H / ( T_H + 1 ) )} );
	}
	// nearest positive ray-sphere intersection from ro (km, planet centred), -1 if none
	float atmosphereRaySphereNearest( vec3 ro, vec3 rd, float radius ) {
		float b = dot( ro, rd );
		float c = dot( ro, ro ) - radius * radius;
		float disc = b * b - c;
		float sq = sqrt( max( disc, 0.0 ) );
		float t0 = - b - sq;
		float t1 = - b + sq;
		if ( disc < 0.0 ) return -1.0;
		return t0 > 0.0 ? t0 : ( t1 > 0.0 ? t1 : -1.0 );
	}
	#endif
`;

// LUT lookups for any shader that declares uTransLUT / uMultiLUT (the kernels)
const TRANS_SAMPLE_GLSL = /* glsl */`
	vec3 atmosphereSampleTransmittance( float r, float mu ) {
		return texture2D( uTransLUT, atmosphereTransmittanceUV( r, mu ) ).rgb;
	}
`;
const MULTI_SAMPLE_GLSL = /* glsl */`
	vec3 atmosphereSampleMultiScat( float r, float cosSun ) {
		vec2 uv = vec2( cosSun * 0.5 + 0.5, ( r - ATMO_RG ) / ( ATMO_RT - ATMO_RG ) );
		vec2 suv = uv * ${f( ( MS_RES - 1 ) / MS_RES )} + ${f( 0.5 / MS_RES )};
		return texture2D( uMultiLUT, suv ).rgb;
	}
`;

// sky-view LUT uv for a world direction (sun-relative azimuth, horizon-aware elevation). Needs uAtmoR
// (view radius, km) and uSkySunDir (the real sun).
export const SKYVIEW_UV_GLSL = /* glsl */`
	vec2 atmosphereSkyViewUv( vec3 dir ) {
		float viewH = uAtmoR;
		float vHorizon = sqrt( max( viewH * viewH - ATMO_RG * ATMO_RG, 0.0 ) );
		float beta = acos( clamp( vHorizon / viewH, -1.0, 1.0 ) );
		float zenithHorizonAngle = ATMO_PI - beta;
		float viewZenithAngle = acos( clamp( dir.y, -1.0, 1.0 ) );
		float vCoordA = ( 1.0 - sqrt( max( 1.0 - viewZenithAngle / zenithHorizonAngle, 0.0 ) ) ) * 0.5;
		float vCoordB = sqrt( max( ( viewZenithAngle - zenithHorizonAngle ) / beta, 0.0 ) ) * 0.5 + 0.5;
		float v = viewZenithAngle < zenithHorizonAngle ? vCoordA : vCoordB;
		// azimuth relative to the sun
		vec2 sunH = normalize( uSkySunDir.xz + vec2( 1e-5, 0.0 ) );
		vec2 dirH = normalize( dir.xz + vec2( 1e-5, 0.0 ) );
		float lightViewCos = dot( sunH, dirH );
		float u = sqrt( clamp( lightViewCos * -0.5 + 0.5, 0.0, 1.0 ) );
		return vec2( u * ${f( ( SV_W - 1 ) / SV_W )} + ${f( 0.5 / SV_W )}, v * ${f( ( SV_H - 1 ) / SV_H )} + ${f( 0.5 / SV_H )} );
	}
`;

const FS_VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const TRANSMITTANCE_FRAG = /* glsl */`
	${ATMOS_CORE_GLSL}
	void main() {
		vec2 uv = gl_FragCoord.xy / vec2( ${f( T_W )}, ${f( T_H )} );
		float xMu = ( uv.x - ${f( 0.5 / T_W )} ) * ${f( T_W / ( T_W - 1 ) )};
		float xR = ( uv.y - ${f( 0.5 / T_H )} ) * ${f( T_H / ( T_H - 1 ) )};
		float H = sqrt( ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG );
		float rho = xR * H;
		float r = sqrt( rho * rho + ATMO_RG * ATMO_RG );
		float dMin = ATMO_RT - r;
		float dMax = rho + H;
		float d = dMin + xMu * ( dMax - dMin );
		float mu = clamp( d == 0.0 ? 1.0 : ( H * H - rho * rho - d * d ) / ( 2.0 * r * d ), -1.0, 1.0 );
		vec3 ro = vec3( 0.0, r, 0.0 );
		vec3 rd = vec3( sqrt( max( 1.0 - mu * mu, 0.0 ) ), mu, 0.0 );
		float tMax = atmosphereRaySphereNearest( ro, rd, ATMO_RT );
		const int steps = 40;
		float dt = tMax / float( steps );
		vec3 od = vec3( 0.0 );
		for ( int i = 0; i < steps; i ++ ) {
			float t = ( float( i ) + 0.5 ) * dt;
			vec3 p = ro + rd * t;
			float h = length( p ) - ATMO_RG;
			od += atmosphereMedium( h ).extinction * dt;
		}
		gl_FragColor = vec4( exp( - od ), 1.0 );
	}`;

const MULTISCAT_FRAG = /* glsl */`
	uniform sampler2D uTransLUT;
	${ATMOS_CORE_GLSL}
	${TRANS_SAMPLE_GLSL}
	void main() {
		vec2 uv = ( gl_FragCoord.xy / ${f( MS_RES )} - ${f( 0.5 / MS_RES )} ) * ${f( MS_RES / ( MS_RES - 1 ) )};
		float cosSun = uv.x * 2.0 - 1.0;
		float r = ATMO_RG + clamp( uv.y, 0.001, 0.999 ) * ( ATMO_RT - ATMO_RG );
		vec3 sunDir = normalize( vec3( 0.0, cosSun, - sqrt( max( 1.0 - cosSun * cosSun, 0.0 ) ) ) );
		vec3 ro = vec3( 0.0, r, 0.0 );
		vec3 Lsum = vec3( 0.0 );
		vec3 fmsSum = vec3( 0.0 );
		const int SQ = 8;
		float isoPhase = 1.0 / ( 4.0 * ATMO_PI );
		vec3 groundAlbedo = vec3( ${GROUND_ALBEDO.map( f ).join( ', ' )} );
		for ( int i = 0; i < SQ * SQ; i ++ ) {
			float ii = ( float( i - ( i / SQ ) * SQ ) + 0.5 ) / float( SQ );
			float jj = ( float( i / SQ ) + 0.5 ) / float( SQ );
			float theta = ii * 2.0 * ATMO_PI;
			float phi = acos( 1.0 - jj * 2.0 );
			vec3 rd = vec3( cos( theta ) * sin( phi ), cos( phi ), sin( theta ) * sin( phi ) );
			float tBottom = atmosphereRaySphereNearest( ro, rd, ATMO_RG );
			float tTop = atmosphereRaySphereNearest( ro, rd, ATMO_RT );
			bool hitGround = tBottom > 0.0;
			float tMax = hitGround ? tBottom : tTop;
			const int steps = 20;
			float dt = tMax / float( steps );
			vec3 throughput = vec3( 1.0 );
			vec3 L = vec3( 0.0 );
			vec3 fms = vec3( 0.0 );
			for ( int s = 0; s < steps; s ++ ) {
				float t = ( float( s ) + 0.3 ) * dt;
				vec3 p = ro + rd * t;
				float pr = length( p );
				AtmosphereMedium m = atmosphereMedium( pr - ATMO_RG );
				vec3 up = p / pr;
				float cosSunP = dot( up, sunDir );
				vec3 Tsun = atmosphereSampleTransmittance( pr, cosSunP );
				float shadowT = atmosphereRaySphereNearest( p, sunDir, ATMO_RG );
				float earthShadow = shadowT > 0.0 ? 0.0 : 1.0;
				vec3 S = Tsun * earthShadow * m.scattering * isoPhase;
				vec3 Tstep = exp( - m.extinction * dt );
				vec3 ext = max( m.extinction, vec3( 1e-6 ) );
				L += throughput * ( S - S * Tstep ) / ext;
				fms += throughput * ( m.scattering - m.scattering * Tstep ) / ext;
				throughput *= Tstep;
			}
			if ( hitGround ) {
				vec3 p = ro + rd * tMax;
				vec3 up = normalize( p );
				float cosS = dot( up, sunDir );
				vec3 Tsun = atmosphereSampleTransmittance( ATMO_RG, cosS );
				L += Tsun * throughput * max( cosS, 0.0 ) * groundAlbedo / ATMO_PI;
			}
			Lsum += L * ( 4.0 * ATMO_PI / float( SQ * SQ ) );
			fmsSum += fms * ( 4.0 * ATMO_PI / float( SQ * SQ ) );
		}
		vec3 Lin = Lsum * isoPhase;
		vec3 fmsAvg = fmsSum * isoPhase;
		vec3 Lms = Lin / ( vec3( 1.0 ) - fmsAvg );
		gl_FragColor = vec4( Lms, 1.0 );
	}`;

const SKYVIEW_FRAG = /* glsl */`
	uniform sampler2D uTransLUT; uniform sampler2D uMultiLUT;
	uniform float uViewH; uniform vec3 uSunDir;
	${ATMOS_CORE_GLSL}
	${TRANS_SAMPLE_GLSL}
	${MULTI_SAMPLE_GLSL}
	void main() {
		vec2 uv = gl_FragCoord.xy / vec2( ${f( SV_W )}, ${f( SV_H )} );
		float u = ( uv.x - ${f( 0.5 / SV_W )} ) * ${f( SV_W / ( SV_W - 1 ) )};
		float v = ( uv.y - ${f( 0.5 / SV_H )} ) * ${f( SV_H / ( SV_H - 1 ) )};
		float viewH = uViewH;
		float vHorizon = sqrt( max( viewH * viewH - ATMO_RG * ATMO_RG, 0.0 ) );
		float beta = acos( vHorizon / viewH );
		float zenithHorizonAngle = ATMO_PI - beta;
		float vzA = 0.0;
		if ( v < 0.5 ) {
			float c = v * 2.0;
			c = 1.0 - c;
			c = c * c;
			c = 1.0 - c;
			vzA = zenithHorizonAngle * c;
		} else {
			float c = v * 2.0 - 1.0;
			c = c * c;
			vzA = zenithHorizonAngle + beta * c;
		}
		float cosViewZenith = cos( vzA );
		float sinViewZenith = sin( vzA );
		float cu = u * u;
		float lightViewCos = - ( cu * 2.0 - 1.0 );
		float lightViewSin = sqrt( max( 1.0 - lightViewCos * lightViewCos, 0.0 ) );
		// local frame: up = +y, sun azimuth along +x
		float sunCosZ = uSunDir.y;
		float sunSinZ = sqrt( max( 1.0 - sunCosZ * sunCosZ, 0.0 ) );
		vec3 sunDir = vec3( sunSinZ, sunCosZ, 0.0 );
		vec3 rd = vec3( sinViewZenith * lightViewCos, cosViewZenith, sinViewZenith * lightViewSin );
		vec3 ro = vec3( 0.0, viewH, 0.0 );
		float tBottom = atmosphereRaySphereNearest( ro, rd, ATMO_RG );
		float tTop = atmosphereRaySphereNearest( ro, rd, ATMO_RT );
		float tMax = tBottom > 0.0 ? tBottom : tTop;
		const int steps = 32;
		float cosTheta = dot( rd, sunDir );
		float rayPhase = ${f( 3 / ( 16 * Math.PI ) )} * ( cosTheta * cosTheta + 1.0 );
		float g = ${f( MIE_G )};
		float g2 = g * g;
		// Cornette-Shanks
		float miePhase = ${f( 3 / ( 8 * Math.PI ) )} * ( ( 1.0 - g2 ) * ( cosTheta * cosTheta + 1.0 ) )
			/ ( ( g2 + 2.0 ) * pow( max( g2 + 1.0 - g * cosTheta * 2.0, 1e-4 ), 1.5 ) );
		vec3 throughput = vec3( 1.0 );
		vec3 L = vec3( 0.0 );
		for ( int i = 0; i < steps; i ++ ) {
			// quadratic step distribution
			float t0 = float( i ) / float( steps );
			float t1 = ( float( i ) + 1.0 ) / float( steps );
			float ta = t0 * t0 * tMax;
			float tb = t1 * t1 * tMax;
			float t = mix( ta, tb, 0.3 );
			float dt = tb - ta;
			vec3 p = ro + rd * t;
			float pr = length( p );
			AtmosphereMedium m = atmosphereMedium( pr - ATMO_RG );
			vec3 up = p / pr;
			float cosSunP = dot( up, sunDir );
			vec3 Tsun = atmosphereSampleTransmittance( pr, cosSunP );
			float shadowT = atmosphereRaySphereNearest( p, sunDir, ATMO_RG );
			float earthShadow = shadowT > 0.0 ? 0.0 : 1.0;
			vec3 ms = atmosphereSampleMultiScat( pr, cosSunP );
			vec3 phaseScat = m.rayScat * rayPhase + vec3( m.mieScat * miePhase );
			vec3 S = Tsun * earthShadow * phaseScat + ms * m.scattering;
			vec3 Tstep = exp( - m.extinction * dt );
			vec3 ext = max( m.extinction, vec3( 1e-6 ) );
			L += throughput * ( S - S * Tstep ) / ext;
			throughput *= Tstep;
		}
		gl_FragColor = vec4( L * ${f( SUN_ILLUMINANCE )}, 1.0 );
	}`;

// pixel 0: sky irradiance / PI (cosine-weighted hemisphere of the sky view LUT); pixel 1: the horizon colour
const IRRADIANCE_FRAG = /* glsl */`
	uniform sampler2D uSkyLUT; uniform float uAtmoR; uniform vec3 uSkySunDir;
	${ATMOS_CORE_GLSL}
	${SKYVIEW_UV_GLSL}
	vec3 atmosphereSkyLuminance( vec3 dir ) { return texture2D( uSkyLUT, atmosphereSkyViewUv( dir ) ).rgb; }
	void main() {
		if ( gl_FragCoord.x < 1.0 ) {
			vec3 sum = vec3( 0.0 );
			const int N = 16;
			for ( int i = 0; i < N * N; i ++ ) {
				float a = ( float( i - ( i / N ) * N ) + 0.5 ) / float( N );
				float b = ( float( i / N ) + 0.5 ) / float( N );
				// cosine-weighted hemisphere
				float r = sqrt( b );
				float phi = a * 2.0 * ATMO_PI;
				vec3 dir = vec3( r * cos( phi ), sqrt( max( 1.0 - b, 0.0 ) ), r * sin( phi ) );
				sum += atmosphereSkyLuminance( dir );
			}
			// E = PI * mean( L ) for cosine-weighted samples; store E / PI (radiance-equivalent irradiance)
			gl_FragColor = vec4( sum / float( N * N ), 1.0 );
		} else {
			vec3 hs = vec3( 0.0 );
			for ( int i = 0; i < 16; i ++ ) {
				float phi = float( i ) * ( 2.0 * ATMO_PI / 16.0 );
				hs += atmosphereSkyLuminance( normalize( vec3( cos( phi ), 0.03, sin( phi ) ) ) );
			}
			gl_FragColor = vec4( hs / 16.0, 1.0 );
		}
	}`;

function lutTarget( w, h, type = THREE.HalfFloatType ) {
	const rt = new THREE.WebGLRenderTarget( w, h, { type, depthBuffer: false } );
	const t = rt.texture;
	t.minFilter = t.magFilter = type === THREE.FloatType ? THREE.NearestFilter : THREE.LinearFilter;
	t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
	t.generateMipmaps = false;
	return rt;
}

function pass( frag, uniforms = {} ) {
	return new FullScreenQuad( new THREE.ShaderMaterial( { uniforms, vertexShader: FS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false } ) );
}

// Owns the LUTs. update() once per frame with the real sun direction and the camera altitude (real metres).
export class AtmosphereLUT {
	constructor( renderer ) {
		this.gl = renderer;
		this.trans = lutTarget( T_W, T_H );
		this.multi = lutTarget( MS_RES, MS_RES );
		this.skyView = lutTarget( SV_W, SV_H );
		this.transPass = pass( TRANSMITTANCE_FRAG );
		this.multiPass = pass( MULTISCAT_FRAG, { uTransLUT: { value: this.trans.texture } } );
		this.skyViewPass = pass( SKYVIEW_FRAG, {
			uTransLUT: { value: this.trans.texture }, uMultiLUT: { value: this.multi.texture },
			uViewH: { value: RG + 0.002 }, uSunDir: { value: new THREE.Vector3( 0, 1, 0 ) },
		} );
		this.viewHeight = RG + 0.002; // km
		this.sunDir = new THREE.Vector3( 0.3, 0.6, - 0.7 ).normalize();
		this.needsStatic = true;
		this._svSun = new THREE.Vector3( 0, - 2, 0 );
		this._svH = - 1;
		this._svValid = false;
		// irradiance readback (float render + async read; a missing extension keeps the CPU fallback)
		this.canRead = renderer.extensions.has( 'EXT_color_buffer_float' );
		this.irrRT = lutTarget( 2, 1, THREE.FloatType );
		this.irrPass = pass( IRRADIANCE_FRAG, {
			uSkyLUT: { value: this.skyView.texture }, uAtmoR: { value: RG + 0.002 }, uSkySunDir: { value: new THREE.Vector3() },
		} );
		this.irrBuf = new Float32Array( 8 );
		this._irrTimer = 0;
		this._irrPending = false;
		this.skyIrradiance = null; // [ r, g, b ] (E / PI)
		this.horizon = null;
		this.onIrradiance = null;
	}

	get transmittanceTexture() { return this.trans.texture; }
	get multiScatTexture() { return this.multi.texture; }
	get skyViewTexture() { return this.skyView.texture; }

	_draw( quad, rt ) {
		const gl = this.gl;
		gl.setRenderTarget( rt );
		quad.render( gl );
	}

	// sun: the real sun direction (may be below the horizon); altitudeM: camera height above the sea in real metres
	update( dt, sun, altitudeM ) {
		const gl = this.gl;
		const prev = gl.getRenderTarget();
		// camera height quantised (2 m near the sea, 2 % higher up): the sky view LUT is rebuilt only when a
		// parameter changes, not every frame the camera bobs
		const y = Math.max( 0.5, altitudeM + 0.5 );
		const yq = y < 100 ? Math.round( y / 2 ) * 2 : Math.exp( Math.round( Math.log( y ) / LOG_STEP ) * LOG_STEP );
		this.viewHeight = RG + Math.max( 0.001, yq / 1000 );
		this.sunDir.copy( sun );
		let dirty = false;
		if ( this.needsStatic ) {
			this.needsStatic = false;
			dirty = true;
			this._draw( this.transPass, this.trans );
			this._draw( this.multiPass, this.multi );
		}
		// sky view LUT: only when the sun moved or the height step changed
		if ( dirty || ! this._svValid || this.viewHeight !== this._svH || this._svSun.angleTo( sun ) > 0.0005 ) {
			this._svValid = true;
			this._svH = this.viewHeight;
			this._svSun.copy( sun );
			const u = this.skyViewPass.material.uniforms;
			u.uViewH.value = this.viewHeight;
			u.uSunDir.value.copy( sun );
			this._draw( this.skyViewPass, this.skyView );
			this.rebuilt = true;
		} else this.rebuilt = false;
		// periodically integrate the irradiance and read it back for the CPU-side uniforms / lights
		this._irrTimer -= dt;
		if ( this.canRead && this._irrTimer <= 0 && ! this._irrPending ) {
			this._irrTimer = 0.25;
			const u = this.irrPass.material.uniforms;
			u.uAtmoR.value = this.viewHeight;
			u.uSkySunDir.value.copy( sun );
			this._draw( this.irrPass, this.irrRT );
			this._irrPending = true;
			gl.readRenderTargetPixelsAsync( this.irrRT, 0, 0, 2, 1, this.irrBuf ).then( () => {
				const b = this.irrBuf;
				this.skyIrradiance = [ b[ 0 ], b[ 1 ], b[ 2 ] ];
				this.horizon = [ b[ 4 ], b[ 5 ], b[ 6 ] ];
				this._irrPending = false;
				if ( this.onIrradiance ) this.onIrradiance( this );
			} ).catch( () => { this._irrPending = false; this.canRead = false; } );
		}
		gl.setRenderTarget( prev );
	}

	invalidate() {
		this.needsStatic = true;
		this._svValid = false;
	}
}

// ---- CPU twin of the transmittance kernel (the sun colour, no readback lag) ----------------------------

function mediumExtinction( hKm, out ) {
	const rd = Math.exp( - hKm / 8 ), md = Math.exp( - hKm / 1.2 ), od = Math.max( 0, 1 - Math.abs( hKm - 25 ) / 15 );
	out[ 0 ] = 5.802e-3 * rd + 4.44e-3 * md + 0.650e-3 * od;
	out[ 1 ] = 13.558e-3 * rd + 4.44e-3 * md + 1.881e-3 * od;
	out[ 2 ] = 33.1e-3 * rd + 4.44e-3 * md + 0.085e-3 * od;
}

function raySphereNearest( ox, oy, oz, dx, dy, dz, radius ) {
	const b = ox * dx + oy * dy + oz * dz;
	const c = ox * ox + oy * oy + oz * oz - radius * radius;
	const disc = b * b - c;
	if ( disc < 0 ) return - 1;
	const sq = Math.sqrt( disc );
	const t0 = - b - sq, t1 = - b + sq;
	return t0 > 0 ? t0 : t1 > 0 ? t1 : - 1;
}

const _ext = [ 0, 0, 0 ];
// transmittance to the top of the atmosphere from radius r (km) at zenith cosine mu (40 midpoint steps)
export function atmosphereTransmittance( r, mu, out = new THREE.Vector3() ) {
	const sx = Math.sqrt( Math.max( 1 - mu * mu, 0 ) );
	const tMax = raySphereNearest( 0, r, 0, sx, mu, 0, RT );
	const steps = 40, dt = Math.max( tMax, 0 ) / steps;
	let o0 = 0, o1 = 0, o2 = 0;
	for ( let i = 0; i < steps; i ++ ) {
		const t = ( i + 0.5 ) * dt;
		const px = sx * t, py = r + mu * t;
		mediumExtinction( Math.hypot( px, py ) - RG, _ext );
		o0 += _ext[ 0 ] * dt; o1 += _ext[ 1 ] * dt; o2 += _ext[ 2 ] * dt;
	}
	return out.set( Math.exp( - o0 ), Math.exp( - o1 ), Math.exp( - o2 ) );
}

// sea-level transmittance toward a direction (the sun colour)
export function transmittanceCPU( alt, l, _haze = 1, out = new THREE.Vector3() ) {
	return atmosphereTransmittance( RG + Math.max( 0.001, alt / 1000 ), l.y, out );
}

// sun position for a latitude (deg), day of year and local solar hour; returns a world vector
// (+x east, +y up, +z south)
export function sunDirection( hour, day = 172, lat = 20.5, out = new THREE.Vector3() ) {
	const D = Math.PI / 180;
	const decl = - 23.44 * Math.cos( 2 * Math.PI / 365 * ( day + 10 ) ) * D;
	const H = ( hour - 12 ) * 15 * D;
	const phi = lat * D;
	const sinAlt = Math.sin( phi ) * Math.sin( decl ) + Math.cos( phi ) * Math.cos( decl ) * Math.cos( H );
	const alt = Math.asin( sinAlt );
	// azimuth from north, clockwise
	const cosAz = ( Math.sin( decl ) - Math.sin( alt ) * Math.sin( phi ) ) / ( Math.cos( alt ) * Math.cos( phi ) );
	let az = Math.acos( Math.max( - 1, Math.min( 1, cosAz ) ) );
	if ( H > 0 ) az = 2 * Math.PI - az;
	const ca = Math.cos( alt );
	return out.set( Math.sin( az ) * ca, Math.sin( alt ), - Math.cos( az ) * ca );
}
