// Shared uniforms, texture loading and the patch every lit material goes through: aerial perspective
// haze that samples the sky, the key-light visibility hook (cloud and hill shadows), the AO hook and rain
// wetness. The sky / haze / star functions are ported from Tidewater (MIT, see LICENSE-Tidewater.txt):
// src/sky/Atmosphere.js, src/sky/Sky.js, src/post/AirHaze.js, src/world/TerrainGPU.js.
import * as THREE from 'three';
import { ATMOS_CORE_GLSL, SKYVIEW_UV_GLSL } from './Atmosphere.js';

// 1x1 stand-ins until a system provides the real texture
function tex1( r, g, b, a ) {
	const t = new THREE.DataTexture( new Float32Array( [ r, g, b, a ] ), 1, 1, THREE.RGBAFormat, THREE.FloatType );
	t.needsUpdate = true;
	return t;
}

// 1x1 depth stand-ins for the cascade samplers a quality level leaves unused (medium has 2 cascades, off none):
// a sampler2DShadow must be bound to a depth texture in compare mode, and three's own empty stand-in is never
// uploaded, so every lit draw failed (GL_INVALID_OPERATION) while a slot was null
function depth1( compare ) {
	const t = new THREE.DepthTexture( 1, 1, THREE.UnsignedIntType );
	t.compareFunction = compare ? THREE.GreaterEqualCompare : null;
	t.minFilter = t.magFilter = THREE.NearestFilter;
	t.needsUpdate = true; // (a plain depth texture is allocated on first use in any renderer)
	return t;
}
export const CSM_FALLBACK = { raw: depth1( false ), cmp: depth1( true ) };

export const G = {
	uTime: { value: 0 },
	uCamPos: { value: new THREE.Vector3() },
	// the key light (the sun, the moon once the sun is 4 degrees below the horizon) and its colour
	uSunDir: { value: new THREE.Vector3( 0, 1, 0 ) },
	uSunColor: { value: new THREE.Color( 1, 1, 1 ) },
	uSkyLUT: { value: null }, // sun-relative sky-view LUT (Hillaire)
	uFogDensity: { value: 1 / 16000 }, // (unused since the haze port; kept for modules that still declare it)
	uFogFalloff: { value: 1 / 320 },
	uFogBoost: { value: 1 },
	uWet: { value: 0 },
	uCloudCover: { value: 0.45 },
	uCloudOffset: { value: new THREE.Vector2() },
	uCloudShadowK: { value: 1 }, // key-light shadow strength (clouds, hills, cascades; 0: off, e.g. icon renders)
	uWind: { value: new THREE.Vector2( - 0.88, 0.47 ) },
	uNight: { value: 0 },
	uUnderwater: { value: 0 },
	uWaterLevel: { value: 0 },
	// ---- declared by COMMON_GLSL itself (do not redeclare them)
	uFrame: { value: 0 }, // frame % 1024
	uSkyIrr: { value: new THREE.Vector3( 0.09, 0.18, 0.38 ) }, // sky irradiance / PI incl. the night ambient
	uHorizon: { value: new THREE.Vector3( 0.6, 0.7, 0.8 ) }, // mean sky radiance just above the horizon
	uSkySunDir: { value: new THREE.Vector3( 0, 1, 0 ) }, // the real sun (the sky is always scattered sunlight)
	uAtmoR: { value: 6360.002 }, // camera radius from the planet centre (km)
	uTransLUT: { value: null },
	uMoonDir: { value: new THREE.Vector3( 0, 1, 0 ) },
	uMoonBright: { value: 0 }, // moon phase brightness x above the horizon
	uNightGlow: { value: 0 }, // night sky glow: the moonlit sky, down to airglow and starlight without a moon
	uStarI: { value: 0 },
	uHazeDensity: { value: 1.6 },
	uHazeShafts: { value: 0 }, // 1 while the post shaft march runs (it adds the near sunlit in-scatter back)
	uHillShadow: { value: tex1( - 1e4, 0, 0, 0 ) }, // (top height, occluder distance) of the terrain's shadow
	uHillShadowRect: { value: new THREE.Vector4( 0, 0, 1, 1 ) }, // x0, z0, sizeX, sizeZ
	uHillShadowOn: { value: 0 },
	uCloudShadow: { value: tex1( 1, 1, 1, 1 ) }, // sun transmittance through the clouds
	uCloudShadowRect: { value: new THREE.Vector4( 0, 0, 1, 1 ) },
	uCloudShadowOn: { value: 0 },
	uCloudPano: { value: tex1( 0, 0, 0, 1 ) }, // clouds over the sky (rgb in-scatter, a transmittance)
	uCloudPanoOn: { value: 0 },
	uBounceMap: { value: tex1( 0, 0, 0, - 1e4 ) }, // ground bounce (rgb, w ground height)
	uBounceRect: { value: new THREE.Vector4( 0, 0, 1, 1 ) },
	uBounceOn: { value: 0 },
	// cascaded sun shadows (render/Shadows.js): matrices (world -> uv, reversed depth), per cascade far split /
	// texel (m) / normal bias (m) / depth range (m), seam blend ranges, cascade 0 raw depth, 1-2 compare mode
	uCsmOn: { value: 0 },
	uCsmSoft: { value: 1 }, // 1: contact-hardening (PCSS) on the near cascade; 0: the 5-tap PCF there too (cheaper)
	uCsmSlope: { value: 2 }, // the normal offset grows to ( 1 + uCsmSlope ) x toward grazing light
	uCsmCount: { value: 0 },
	// tap counts: PCSS blocker search, PCSS filter, PCF. (Uniform, not constant: loops with a constant count are
	// unrolled by the shader compilers, and this code is in every lit material: unrolled over the three
	// cascades it was most of each program's size, compile time and driver memory)
	uCsmTaps: { value: new THREE.Vector3( 8, 12, 5 ) },
	uCsmSize: { value: 2048 },
	uCsmBias: { value: 0.00002 },
	uCsmMat: { value: [ new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4() ] },
	uCsmInfo: { value: [ new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4() ] },
	uCsmBlend: { value: [ new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4() ] },
	uCsm0: { value: CSM_FALLBACK.raw },
	uCsm1: { value: CSM_FALLBACK.cmp },
	uCsm2: { value: CSM_FALLBACK.cmp },
};

// Uniforms older modules declare themselves before pasting COMMON_GLSL
const PARS = /* glsl */`
	uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
	uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
	uniform float uWet; uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK;
	uniform vec2 uWind; uniform float uNight; uniform float uUnderwater; uniform float uWaterLevel;
`;
export const SHARED_PARS = PARS;

export const COMMON_GLSL = /* glsl */`
	#ifndef DT_COMMON
	#define DT_COMMON
	uniform float uFrame; uniform vec3 uSkyIrr; uniform vec3 uHorizon; uniform vec3 uSkySunDir; uniform float uAtmoR;
	uniform sampler2D uTransLUT; uniform vec3 uMoonDir; uniform float uMoonBright; uniform float uNightGlow; uniform float uStarI; uniform float uHazeDensity; uniform float uHazeShafts;
	uniform sampler2D uHillShadow; uniform vec4 uHillShadowRect; uniform float uHillShadowOn;
	uniform sampler2D uCloudShadow; uniform vec4 uCloudShadowRect; uniform float uCloudShadowOn;
	uniform sampler2D uCloudPano; uniform float uCloudPanoOn;
	uniform sampler2D uBounceMap; uniform vec4 uBounceRect; uniform float uBounceOn;
	uniform float uCsmOn; uniform float uCsmSoft; uniform float uCsmSlope; uniform float uCsmCount; uniform vec3 uCsmTaps; uniform float uCsmSize; uniform float uCsmBias;
	uniform mat4 uCsmMat[ 3 ]; uniform vec4 uCsmInfo[ 3 ]; uniform vec4 uCsmBlend[ 3 ];
	uniform sampler2D uCsm0; uniform sampler2DShadow uCsm1; uniform sampler2DShadow uCsm2;
	float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
	float vnoise2( vec2 p ) {
		vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( hash12( i ), hash12( i + vec2( 1, 0 ) ), u.x ), mix( hash12( i + vec2( 0, 1 ) ), hash12( i + vec2( 1, 1 ) ), u.x ), u.y );
	}
	float fbm2( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i ++ ) { s += a * vnoise2( p ); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
	float dtLum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
	// Jimenez interleaved gradient noise (0..1)
	float dtIGN( vec2 px ) { return fract( 52.9829189 * fract( dot( px, vec2( 0.06711056, 0.00583715 ) ) ) ); }

	// ---- atmosphere (Tidewater src/sky/Atmosphere.js)
	${ATMOS_CORE_GLSL}
	${SKYVIEW_UV_GLSL}
	vec2 skyLutUv( vec3 d ) { return atmosphereSkyViewUv( d ); }
	// sky luminance (no sun disc) toward a world direction
	vec3 skyLuminance( vec3 d ) { return texture2D( uSkyLUT, atmosphereSkyViewUv( d ) ).rgb; }
	vec3 atmosphereSampleTransmittance( float r, float mu ) { return texture2D( uTransLUT, atmosphereTransmittanceUV( r, mu ) ).rgb; }
	vec3 atmosphereTransmittanceToSpace( vec3 dir ) { return atmosphereSampleTransmittance( uAtmoR, dir.y ); }

	// ---- night sky (Tidewater src/sky/Sky.js)
	float skyHash13( vec3 p ) {
		vec3 p3 = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
		p3 += dot( p3, p3.yzx + 33.33 );
		return fract( ( p3.x + p3.y ) * p3.z );
	}
	// one star candidate per cell of a cube-face grid (160 per half face), a power law magnitude
	// distribution, denser along the Milky Way; they come out after civil twilight, the brightest first
	vec3 skyStars( vec3 dir ) {
		vec3 a = abs( dir );
		bool onX = a.x > a.y && a.x > a.z;
		bool onY = a.y > a.z;
		float face = onX ? sign( dir.x ) + 2.0 : ( onY ? sign( dir.y ) + 5.0 : sign( dir.z ) + 8.0 );
		vec2 uv = ( onX ? dir.yz / a.x : ( onY ? dir.xz / a.y : dir.xy / a.z ) ) * 160.0;
		vec3 cell = vec3( floor( uv ), face );
		float h = skyHash13( cell );
		float bx = dot( dir, vec3( 0.28222, 0.18814, 0.94072 ) ) * 4.0; // Milky Way pole normalize( 0.3, 0.2, 1 )
		float band = exp( - bx * bx );
		bool has = h < band * 0.035 + 0.025;
		float uc = max( skyHash13( cell + 7.7 ), 2e-4 );
		float m = log2( uc ) * 0.602 + 6.5;
		// limiting magnitude: -1 when the sun is 6 degrees below the horizon, 6.5 below 16 degrees
		float dark = 1.0 - smoothstep( -0.28, -0.1, uSkySunDir.y );
		float vis = smoothstep( m - 0.6, m + 0.6, dark * 7.5 - 1.0 ) * ( has ? 1.0 : 0.0 );
		vec2 sp = ( floor( uv ) + vec2( skyHash13( cell + 3.1 ), skyHash13( cell + 5.7 ) ) * 0.4 + 0.3 ) / 160.0;
		vec3 sdir = normalize( onX ? vec3( sign( dir.x ), sp ) : ( onY ? vec3( sp.x, sign( dir.y ), sp.y ) : vec3( sp, sign( dir.z ) ) ) );
		float d = length( dir - sdir ) * 160.0;
		// flux relative to a magnitude 6.5 star; bright stars look bigger (glare), not just clipped
		float flux = pow( uc, -0.8 );
		float size = log2( flux ) * 0.08 + 1.0;
		float psf = exp( d * d / ( size * size ) * -50.0 ) / ( size * size );
		float tw = sin( uTime * ( skyHash13( cell + 13.3 ) * 9.0 + 5.0 ) + h * 60.0 ) * mix( 0.18, 0.06, clamp( dir.y * 2.0, 0.0, 1.0 ) ) + 1.0;
		vec3 col = mix( vec3( 1.0, 0.8, 0.6 ), vec3( 0.75, 0.85, 1.0 ), skyHash13( cell + 17.0 ) ) * 0.5 + 0.5;
		vec3 star = col * ( psf * flux * vis * tw * 0.0075 );
		vec3 glow = vec3( 0.55, 0.6, 0.75 ) * ( band * dark * 0.0035 );
		return ( star + glow ) * uStarI * smoothstep( 0.0, 0.2, dir.y );
	}
	// faint blue-grey moonlit sky (a little brighter toward the horizon) and the moon's aureole. Tidewater's
	// moon is always up; ours follows its real path and phase, so the glow keeps a floor (airglow,
	// starlight) on moonless nights (uNightGlow), the aureole only with the moon up
	vec3 skyMoonSky( vec3 dir ) {
		float ang = acos( clamp( dot( dir, uMoonDir ), -1.0, 1.0 ) );
		float aureole = exp( ang * -14.0 ) * 2.4 + exp( ang * -2.5 ) * 0.9;
		float grad = mix( 1.7, 1.0, clamp( dir.y * 3.0, 0.0, 1.0 ) );
		float up = smoothstep( -0.05, 0.15, uMoonDir.y );
		return vec3( 0.005, 0.0068, 0.0105 ) * ( grad * uNightGlow + aureole * up * uMoonBright ) * uNight;
	}
	// everything behind the clouds but the sun and moon discs
	vec3 skyBackground( vec3 dir, float starK ) {
		vec3 L = skyLuminance( dir );
		if ( uStarI > 0.001 ) L += skyMoonSky( dir ) + skyStars( dir ) * starK;
		return L;
	}
	// the cloud panorama (rgb in-scatter, a transmittance; Tidewater SkyProClouds.js cloudsSample): azimuth
	// around, elevation -4..90 degrees with v = sqrt
	vec4 cloudsPanoSample( vec3 dir ) {
		if ( uCloudPanoOn < 0.5 ) return vec4( 0.0, 0.0, 0.0, 1.0 );
		float u = fract( atan( dir.z, dir.x ) / 6.283185307 );
		float elev = 1.5707963 - acos( clamp( dir.y, -1.0, 1.0 ) );
		float t = clamp( ( elev + 0.06981317 ) / 1.64060949, 0.0, 1.0 );
		vec4 s = texture2D( uCloudPano, vec2( u, sqrt( t ) ) );
		float below = smoothstep( -0.07, -0.03, dir.y );
		return vec4( s.rgb * below, mix( 1.0, s.a, below ) );
	}
	// the sun's disc behind the clouds: dark below ~0.4 % transmittance (the march stops early)
	float cloudsSunTransmittance( float T ) { return T * smoothstep( 0.004, 0.04, T ); }
	// water / glossy reflections: no moon disc and only a trace of the stars
	vec3 skyReflectionRadiance( vec3 dir ) {
		vec3 base = skyBackground( dir, 0.08 );
		vec4 c = cloudsPanoSample( dir );
		return base * c.a + c.rgb;
	}

	// ---- shadows on the key light
	float cloudCoverage( vec2 xz ) {
		vec2 p = ( xz + uCloudOffset ) / 2600.0;
		float n = fbm2( p ) * 0.7 + fbm2( p * 3.1 + 5.2 ) * 0.3;
		return smoothstep( 1.0 - uCloudCover, 1.0 - uCloudCover + 0.25, n );
	}
	// cloud shadow transmittance (1 = clear; Tidewater SkyProClouds.js cloudsShadow). The map is the
	// ground's shadow along the key light: follow the light down to the ground (AirHaze.js)
	float cloudShadowAt( vec3 wp ) {
		if ( uCloudShadowOn < 0.5 ) return 1.0;
		vec3 L = uSunDir;
		vec2 g = wp.xz - L.xz * ( max( wp.y, 0.0 ) / max( L.y, 0.08 ) );
		vec2 uv = ( g - uCloudShadowRect.xy ) / uCloudShadowRect.zw;
		float s = texture2D( uCloudShadow, uv ).r;
		vec2 e = abs( uv - 0.5 );
		float inside = smoothstep( 0.5, 0.42, max( e.x, e.y ) );
		return mix( 1.0, s, 0.85 * uCloudShadowK * inside );
	}
	// terrain hill shadow (Tidewater TerrainGPU.js terrainSunShadowAt): soft penumbra that widens with the
	// occluder distance
	float terrainSunShadowAt( vec3 P ) {
		if ( uHillShadowOn < 0.5 ) return 1.0;
		vec2 uv = ( P.xz - uHillShadowRect.xy ) / uHillShadowRect.zw;
		if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return 1.0;
		vec2 s = texture2D( uHillShadow, uv ).xy;
		float w = s.y * 0.012 + 0.35;
		return mix( 1.0, smoothstep( -w, w, P.y - s.x ), uHillShadowOn );
	}

	// ---- cascaded sun shadows (Tidewater src/engine/render/wgsl/lighting.js _sunShadowCascade / _sunShadow)
	// contact-hardening (PCSS) on the near cascade: blocker search, penumbra = occluder-receiver distance x the
	// sun's angular diameter, PCF over it; Vogel discs rotated per pixel and frame (the TAA resolves the
	// noise). Other cascades: 5 hardware PCF taps over one texel. Reversed depth: larger = nearer the light.
	vec2 dtVogel( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float theta = float( i ) * 2.399963229728653 + phi;
		return vec2( cos( theta ), sin( theta ) ) * r;
	}
	float csmDepth0( vec2 uv ) {
		ivec2 s = textureSize( uCsm0, 0 );
		return texelFetch( uCsm0, clamp( ivec2( uv * vec2( s ) ), ivec2( 0 ), s - 1 ), 0 ).r;
	}
	float csmTap( int c, vec2 uv, float z ) {
		if ( c == 0 ) return z >= csmDepth0( uv ) ? 1.0 : 0.0;
		return c == 1 ? textureLod( uCsm1, vec3( uv, z ), 0.0 ) : textureLod( uCsm2, vec3( uv, z ), 0.0 );
	}
	float csmCascade( vec3 P, vec3 N, int c, float noise, float pcfNoise, bool pcss ) {
		vec4 info = uCsmInfo[ c ];
		// normal offset, slope-scaled: up to ( 1 + uCsmSlope ) x where the light grazes the surface (floors and
		// trims beside thin walls leaked light along the junction, and grazing faces are where acne starts)
		float nb = info.z * ( 1.0 + uCsmSlope * ( 1.0 - abs( dot( N, uSunDir ) ) ) );
		vec4 sc = uCsmMat[ c ] * vec4( P + N * nb, 1.0 );
		vec3 uvz = sc.xyz;
		if ( any( lessThan( uvz.xy, vec2( 0.0 ) ) ) || any( greaterThan( uvz.xy, vec2( 1.0 ) ) ) || uvz.z < 0.0 ) return 1.0;
		float z = uvz.z + uCsmBias;
		float texel = 1.0 / uCsmSize;
		// (the tap loops run to uniform counts: see uCsmTaps)
		if ( pcss && c == 0 && uCsmSoft > 0.5 ) {
			float phi = noise * 6.283185307;
			float width = info.y * uCsmSize; // cascade width (m)
			float range = info.w; // depth range (m)
			const float SD = 0.00925; // the sun's angular diameter (rad)
			// 1. blockers within the widest penumbra an occluder 30 m up can cast; the texel on the light ray first
			float searchUV = max( min( 30.0 * SD / width, texel * 24.0 ), texel * 1.5 );
			float d0 = csmDepth0( uvz.xy );
			float blockSum = d0 > z ? d0 : 0.0;
			float blockCount = d0 > z ? 1.0 : 0.0;
			int nb = int( uCsmTaps.x ), nf = int( uCsmTaps.y );
			for ( int i = 0; i < nb; i ++ ) {
				float d = csmDepth0( uvz.xy + dtVogel( i, nb, phi ) * searchUV );
				if ( d > z ) { blockSum += d; blockCount += 1.0; }
			}
			if ( blockCount < 0.5 ) return 1.0;
			// 2. occluder-receiver distance (orthographic: depth is linear over the range)
			float dz = abs( blockSum / blockCount - z ) * range;
			float penumbraUV = clamp( dz * SD / width, texel * 1.2, texel * 32.0 );
			// 3. PCF over the penumbra
			float sum = 0.0;
			for ( int i = 0; i < nf; i ++ ) sum += z >= csmDepth0( uvz.xy + dtVogel( i, nf, phi + 1.7 ) * penumbraUV ) ? 1.0 : 0.0;
			return sum / float( nf );
		}
		float phiP = pcfNoise * 6.283185307;
		float sum = 0.0;
		int np = int( uCsmTaps.z );
		for ( int i = 0; i < np; i ++ ) sum += csmTap( c, uvz.xy + dtVogel( i, np, phiP ) * texel, z );
		return sum / float( np );
	}
	// sun visibility at P (1 = lit), N the geometric world normal; the seams blended over a quarter of the
	// break, the last cascade fading out over its final part. The cascades are spheres around the camera
	// (render/Shadows.js): picked by the distance to the camera, not the view depth. (At most two cascades
	// overlap at a point: the loop finds them, and one call below samples each, so csmCascade is compiled in
	// once, not once per cascade)
	float sunShadowCSM( vec3 P, vec3 N, bool pcss ) {
		if ( uCsmOn < 0.5 ) return 1.0;
		float dist = length( P - uCamPos );
		float noise = dtIGN( gl_FragCoord.xy + mod( uFrame, 64.0 ) * 5.588238 );
		float pcfNoise = dtIGN( gl_FragCoord.xy );
		int n = int( uCsmCount ), last = n - 1;
		int ca = -1, cb = -1;
		float ra = 0.0, rb = 0.0;
		for ( int i = 0; i < n; i ++ ) {
			vec4 b = uCsmBlend[ i ];
			float center = ( b.x + b.y ) * 0.5;
			float margin = max( dist < center ? b.z : b.w, 1e-5 );
			float csmX = b.x - margin * 0.5;
			float csmY = i == last ? b.y : b.y + margin * 0.5;
			if ( dist >= csmX && dist <= csmY ) {
				float ratio = clamp( min( dist - csmX, csmY - dist ) / margin, 0.0, 1.0 );
				if ( i == 0 && dist <= center ) ratio = 1.0;
				if ( ca < 0 ) { ca = i; ra = ratio; } else { cb = i; rb = ratio; }
			}
		}
		float ret = 1.0;
		int m = ca < 0 ? 0 : cb < 0 ? 1 : 2;
		for ( int k = 0; k < m; k ++ ) {
			int c = k == 0 ? ca : cb;
			ret -= ( 1.0 - csmCascade( P, N, c, noise, pcfNoise, pcss ) ) * ( k == 0 ? ra : rb );
		}
		return max( ret, 0.0 );
	}
	// the 5-tap PCF everywhere (surfaces whose own detail hides penumbrae: water)
	float sunShadowPCF( vec3 P, vec3 N ) { return sunShadowCSM( P, N, false ); }

	// ---- aerial perspective and marine haze (Tidewater src/post/AirHaze.js)
	const float HZ_MARINE_SIGMA = 1.5e-4;
	const float HZ_MARINE_H = 110.0;
	const float HZ_AEROSOL_SIGMA = 3.2e-5;
	const float HZ_AEROSOL_H = 1400.0;
	const float HZ_NEAR = 900.0;
	// optical depth of one exponential layer from height hc along a ray (direction y component vy) over d
	float hazeLayerDepth( float sigma, float H, float hc, float vy, float d ) {
		float base = exp( hc / - H ) * sigma;
		float k = vy * d / H;
		float fk = abs( k ) < 1e-3 ? d : H * ( 1.0 - exp( - k ) ) / vy;
		return base * fk;
	}
	float hazeInScatter( float hc, float vy, float d ) {
		return 1.0 - exp( - ( hazeLayerDepth( HZ_MARINE_SIGMA, HZ_MARINE_H, hc, vy, d ) + hazeLayerDepth( HZ_AEROSOL_SIGMA, HZ_AEROSOL_H, hc, vy, d ) ) * uHazeDensity );
	}
	// Cornette-Shanks (strong forward lobe) plus a little isotropic scattering
	float hazePhase( float cosT ) {
		float g = 0.62; float g2 = g * g;
		float cs = 3.0 * ( 1.0 - g2 ) / ( 8.0 * 3.14159265 * ( 2.0 + g2 ) ) * ( cosT * cosT + 1.0 ) / pow( max( 1.0 + g2 - cosT * 2.0 * g, 1e-4 ), 1.5 );
		return cs * 0.7 + 0.3 / ( 4.0 * 3.14159265 );
	}
	// the haze takes the colour of the sky just above the horizon in the view direction; near the camera
	// the sunlit share is left to the (shadowed) shaft march
	vec3 atmosphereFog( vec3 col, vec3 wp ) {
		vec3 dv = wp - uCamPos;
		float dist = length( dv );
		vec3 dir = dv / max( dist, 1e-4 );
		float camH = max( uCamPos.y, 0.0 );
		vec3 vh = normalize( vec3( dir.x, max( dir.y, 0.02 ), dir.z ) );
		vec3 fog = skyLuminance( vh );
		if ( uStarI > 0.001 ) fog += skyMoonSky( vh );
		// (ours) under an overcast deck the air is in the clouds' shade: grey, not the sunlit sky's blue
		fog = mix( fog, vec3( dtLum( fog ) * 0.8 ), smoothstep( 0.55, 0.85, uCloudCover ) * 0.85 );
		vec3 Ep = uSunColor * hazePhase( dot( dir, uSunDir ) );
		float eL = dtLum( Ep );
		float fSun = eL / ( eL + dtLum( uSkyIrr ) + 1e-5 ) * min( uHazeShafts, 1.0 );
		float h = smoothstep( 0.0, HZ_NEAR, dist );
		float tau = ( hazeLayerDepth( HZ_MARINE_SIGMA, HZ_MARINE_H, camH, dir.y, dist ) + hazeLayerDepth( HZ_AEROSOL_SIGMA, HZ_AEROSOL_H, camH, dir.y, dist ) ) * uHazeDensity;
		float T = exp( - tau );
		return col * T + fog * ( 1.0 - T ) * ( 1.0 - fSun * ( 1.0 - h ) );
	}

	// ---- ground bounce (Tidewater src/materials/GroundBounce.js hookBounce): irradiance E (three multiplies
	// the irradiance by diffuse / PI, as Tidewater adds E / PI x diffuse)
	vec3 groundBounce( vec3 P, vec3 N ) {
		if ( uBounceOn < 0.5 ) return vec3( 0.0 );
		float view = clamp( - N.y * 0.5 + 0.5, 0.0, 1.0 );
		if ( view <= 0.03 || P.y < -0.3 ) return vec3( 0.0 );
		vec2 uv = ( P.xz - uBounceRect.xy ) / uBounceRect.zw;
		if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return vec3( 0.0 );
		vec4 map = texture2D( uBounceMap, uv );
		float above = P.y - map.w;
		float fade = smoothstep( -0.3, 0.3, above ) * mix( 0.4, 1.0, smoothstep( 30.0, 4.0, above ) );
		vec2 sxz = uSunDir.xz / max( length( uSunDir.xz ), 1e-4 );
		float selfShade = 1.0 - clamp( - dot( N.xz, sxz ), 0.0, 1.0 ) * clamp( 1.0 - uSunDir.y, 0.0, 1.0 ) * 0.6;
		return map.rgb * uSunColor * cloudShadowAt( P ) * view * fade * selfShade * 0.6;
	}
	#endif
`;

// three's lights_fragment_begin with the key-light hook: directional light 0 (the sun or the moon) is
// multiplied by dtSunVis (cloud shadow x hill shadow x the material's dtSunMod); lamps are untouched
const LIGHTS_BEGIN = THREE.ShaderChunk.lights_fragment_begin.replace(
	'getDirectionalLightInfo( directionalLight, directLight );',
	'getDirectionalLightInfo( directionalLight, directLight );\n\t\t#ifndef NO_SUN_VIS\n\t\tif ( UNROLLED_LOOP_INDEX == 0 ) directLight.color *= dtSunVis;\n\t\t#endif' );
if ( LIGHTS_BEGIN === THREE.ShaderChunk.lights_fragment_begin ) console.warn( 'patchMaterial: lights_fragment_begin did not match (three version?)' );

// three's AO chunk plus the material AO (dtAO): indirect diffuse, and Lagarde specular occlusion
const AO_FRAGMENT = THREE.ShaderChunk.aomap_fragment + /* glsl */`
	reflectedLight.indirectDiffuse *= dtAO;
	#if defined( STANDARD )
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( saturate( dot( geometryNormal, geometryViewDir ) ), dtAO, material.roughness );
	#endif
`;

const warned = new Set();
function replaceOnce( src, a, b, what ) {
	const out = src.replace( a, b );
	if ( out === src && ! warned.has( what ) ) { warned.add( what ); console.warn( `patchMaterial: ${what} not found` ); }
	return out;
}

// Wires the shared uniforms into a material and swaps its fog for the atmosphere. `extra(shader)` runs
// after the standard patch for material-specific code. `key` must be unique per distinct shader code.
// Locals every patched fragment shader has: dtAO (material AO, 1), dtSunMod (key-light multiplier, 1)
// and dtSunVis (cascaded sun shadow x cloud x hill shadow x dtSunMod, computed just before the lights).
// Defines: NO_ATMOS_FOG, NO_SUN_VIS (opts.noCloudShadow), NO_SUN_SHADOW (no cascade shadow received),
// NO_GROUND_BOUNCE, SUN_SHADOW_PCF (opts.pcf: the 5-tap PCF on every cascade instead of the contact-hardening
// search on the near one; for thin, many-layered surfaces like grass blades, where the 21-tap search is costly
// and its soft penumbrae are lost in the detail anyway).
export function patchMaterial( mat, key = 'std', extra = null, opts = {} ) {
	const prev = mat.onBeforeCompile;
	mat.fog = false;
	mat.onBeforeCompile = ( shader, renderer ) => {
		if ( prev && prev !== THREE.Material.prototype.onBeforeCompile ) prev( shader, renderer );
		Object.assign( shader.uniforms, G );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nvarying vec3 vWorldPos;' )
			.replace( '#include <project_vertex>', /* glsl */`#include <project_vertex>
				{
					vec4 wpos = vec4( transformed, 1.0 );
					#ifdef USE_INSTANCING
						wpos = instanceMatrix * wpos;
					#endif
					#ifdef USE_BATCHING
						wpos = batchingMatrix * wpos;
					#endif
					vWorldPos = ( modelMatrix * wpos ).xyz;
				}` );
		let fs = shader.fragmentShader;
		// (view models: no world-space key-light shadows and no ground bounce)
		if ( opts.noCloudShadow ) fs = '#define NO_SUN_VIS\n#define NO_GROUND_BOUNCE\n' + fs;
		if ( opts.pcf ) fs = '#define SUN_SHADOW_PCF\n' + fs;
		fs = fs.replace( '#include <common>', '#include <common>\nvarying vec3 vWorldPos;\n' + PARS + COMMON_GLSL );
		fs = replaceOnce( fs, 'void main() {', 'void main() {\n\tfloat dtAO = 1.0; float dtSunMod = 1.0; float dtSunVis = 1.0;', 'main' );
		fs = fs.replace( '#include <fog_fragment>', /* glsl */`
			#ifndef NO_ATMOS_FOG
			gl_FragColor.rgb = atmosphereFog( gl_FragColor.rgb, vWorldPos );
			#endif` );
		fs = fs.replace( '#include <lights_fragment_begin>', /* glsl */`
			#ifndef NO_SUN_VIS
			{
				float shadowVis = terrainSunShadowAt( vWorldPos );
				#ifndef NO_SUN_SHADOW
				#ifdef SUN_SHADOW_PCF
				const bool dtPcss = false;
				#else
				const bool dtPcss = true;
				#endif
				if ( shadowVis > 0.0 ) shadowVis *= sunShadowCSM( vWorldPos, normalize( inverseTransformDirection( nonPerturbedNormal, viewMatrix ) ), dtPcss );
				#endif
				// (uCloudShadowK 0: no world shadows at all, e.g. item icons rendered in their own scene)
				dtSunVis = cloudShadowAt( vWorldPos ) * mix( 1.0, shadowVis, uCloudShadowK ) * dtSunMod;
			}
			#endif
			${LIGHTS_BEGIN}` );
		fs = fs.replace( '#include <lights_fragment_maps>', /* glsl */`#include <lights_fragment_maps>
			#if defined( RE_IndirectDiffuse ) && ! defined( NO_GROUND_BOUNCE )
			irradiance += groundBounce( vWorldPos, inverseTransformDirection( geometryNormal, viewMatrix ) );
			#endif` );
		fs = fs.replace( '#include <aomap_fragment>', AO_FRAGMENT );
		shader.fragmentShader = fs;
		if ( ! opts.noWet ) {
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
					float wetUp = uWet * smoothstep( 0.2, 0.8, normalize( vNormal ).y * 0.5 + 0.5 );
					roughnessFactor = mix( roughnessFactor, 0.12, wetUp * 0.8 );
					diffuseColor.rgb *= 1.0 - 0.35 * wetUp;` );
		}
		if ( extra ) extra( shader );
	};
	mat.customProgramCacheKey = () => key + ( opts.noWet ? '-nw' : '' ) + ( opts.noCloudShadow ? '-nc' : '' ) + ( opts.pcf ? '-pcf' : '' );
	return mat;
}

// ---- textures ----------------------------------------------------------------------------------------

const loader = new THREE.TextureLoader();
const cache = new Map();
let maxAniso = 8;
export function setMaxAnisotropy( a ) { maxAniso = a; }

export function tex( name, { srgb = true, repeat = true } = {} ) {
	const key = name + ( srgb ? ':s' : ':l' );
	if ( cache.has( key ) ) return cache.get( key );
	const t = loader.load( `textures/${name}.jpg` );
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	if ( repeat ) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = maxAniso;
	cache.set( key, t );
	return t;
}

export function preloadTextures( names, onProgress ) {
	let done = 0;
	return Promise.all( names.map( n => new Promise( ( resolve ) => {
		const srgb = n.endsWith( '_d' );
		const key = n + ( srgb ? ':s' : ':l' );
		if ( cache.has( key ) ) { resolve(); return; }
		const t = loader.load( `textures/${n}.jpg`, () => { done ++; onProgress && onProgress( done / names.length ); resolve(); }, undefined, () => { done ++; resolve(); } );
		t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.anisotropy = maxAniso;
		cache.set( key, t );
	} ) ) );
}

// a canvas texture drawn by fn( ctx, w, h )
export function canvasTexture( w, h, fn, { srgb = true, repeat = true } = {} ) {
	const c = document.createElement( 'canvas' );
	c.width = w; c.height = h;
	fn( c.getContext( '2d' ), w, h );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	if ( repeat ) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = maxAniso;
	return t;
}
