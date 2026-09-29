// Shared uniforms, texture loading and the patch every lit material goes through: aerial perspective
// fog that samples the sky, cloud shadows and rain wetness.
import * as THREE from 'three';

export const G = {
	uTime: { value: 0 },
	uCamPos: { value: new THREE.Vector3() },
	uSunDir: { value: new THREE.Vector3( 0, 1, 0 ) },
	uSunColor: { value: new THREE.Color( 1, 1, 1 ) },
	uSkyLUT: { value: null },
	uFogDensity: { value: 1 / 16000 },
	uFogFalloff: { value: 1 / 320 },
	uFogBoost: { value: 1 },
	uWet: { value: 0 },
	uCloudCover: { value: 0.45 },
	uCloudOffset: { value: new THREE.Vector2() },
	uCloudShadowK: { value: 0.5 },
	uWind: { value: new THREE.Vector2( - 0.88, 0.47 ) },
	uNight: { value: 0 },
	uUnderwater: { value: 0 },
	uWaterLevel: { value: 0 },
};

export const COMMON_GLSL = /* glsl */`
	float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
	float vnoise2( vec2 p ) {
		vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( hash12( i ), hash12( i + vec2( 1, 0 ) ), u.x ), mix( hash12( i + vec2( 0, 1 ) ), hash12( i + vec2( 1, 1 ) ), u.x ), u.y );
	}
	float fbm2( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i ++ ) { s += a * vnoise2( p ); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
	vec2 skyLutUv( vec3 d ) {
		float az = atan( d.x, -d.z ); // 0 = north, clockwise
		float el = asin( clamp( d.y, -1.0, 1.0 ) );
		float v = 0.5 + 0.5 * sign( el ) * sqrt( abs( el ) / 1.5707963 );
		return vec2( az / 6.2831853 + 0.5, v );
	}
	// 2-D cloud coverage over the world (matches the sky's cloud layer), 0 clear .. 1 overcast
	float cloudCoverage( vec2 xz ) {
		vec2 p = ( xz + uCloudOffset ) / 2600.0;
		float n = fbm2( p ) * 0.7 + fbm2( p * 3.1 + 5.2 ) * 0.3;
		return smoothstep( 1.0 - uCloudCover, 1.0 - uCloudCover + 0.25, n );
	}
	float cloudShadowAt( vec3 wp ) {
		// project along the sun onto the cloud layer
		vec3 s = normalize( uSunDir );
		float t = ( 1100.0 - wp.y ) / max( s.y, 0.08 );
		return 1.0 - cloudCoverage( wp.xz + s.xz * t ) * uCloudShadowK;
	}
	vec3 atmosphereFog( vec3 col, vec3 wp ) {
		vec3 d = wp - uCamPos;
		float dist = length( d );
		vec3 v = d / max( dist, 1e-3 );
		float a = uFogDensity * uFogBoost, b = uFogFalloff;
		float h0 = max( uCamPos.y, -5.0 );
		float ry = v.y * dist * b;
		float fog = a * exp( -h0 * b ) * dist * ( abs( ry ) > 1e-3 ? ( 1.0 - exp( -ry ) ) / ry : 1.0 );
		float T = exp( -fog );
		vec3 hv = normalize( vec3( v.x, max( v.y, 0.035 ), v.z ) );
		vec3 sky = texture2D( uSkyLUT, skyLutUv( hv ) ).rgb;
		float sunAmt = pow( max( dot( v, normalize( uSunDir ) ), 0.0 ), 10.0 );
		vec3 ins = sky * 0.92 + uSunColor * sunAmt * 0.12;
		return col * T + ins * ( 1.0 - T );
	}
`;

const PARS = /* glsl */`
	uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
	uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
	uniform float uWet; uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK;
	uniform vec2 uWind; uniform float uNight; uniform float uUnderwater; uniform float uWaterLevel;
`;

// Wires the shared uniforms into a material and swaps its fog for the atmosphere. `extra(shader)` runs
// after the standard patch for material-specific code. `key` must be unique per distinct shader code.
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
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\nvarying vec3 vWorldPos;\n' + PARS + COMMON_GLSL )
			.replace( '#include <fog_fragment>', /* glsl */`
				#ifndef NO_ATMOS_FOG
				gl_FragColor.rgb = atmosphereFog( gl_FragColor.rgb, vWorldPos );
				#endif` );
		if ( ! opts.noWet ) {
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
					float wetUp = uWet * smoothstep( 0.2, 0.8, normalize( vNormal ).y * 0.5 + 0.5 );
					roughnessFactor = mix( roughnessFactor, 0.12, wetUp * 0.8 );
					diffuseColor.rgb *= 1.0 - 0.35 * wetUp;` );
		}
		if ( ! opts.noCloudShadow ) {
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
					{ float cs = cloudShadowAt( vWorldPos ); reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs; }` );
		}
		if ( extra ) extra( shader );
	};
	mat.customProgramCacheKey = () => key + ( opts.noWet ? '-nw' : '' ) + ( opts.noCloudShadow ? '-nc' : '' );
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
