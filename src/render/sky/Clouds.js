// Ported from Tidewater src/sky/SkyProClouds.js and src/sky/Clouds.js (noise helpers) (MIT, see
// LICENSE-Tidewater.txt).
// Volumetric cumulus ("Partly cloudy" preset of sky-pro-webgpu as Tidewater runs it): a procedural weather
// map, a 64^3 Perlin-Worley shape noise with a height-dependent erosion, a cone-traced light march with
// three multiple-scattering octaves, powder and base darkening, a quarter-rate lattice trace reconstructed
// temporally at half resolution, a 512x160 panorama (reflections, environment) and a 256^2 ground shadow
// map. Lit by our Hillaire atmosphere: the key light (sun, or the moon at night) and the sky-view LUT.
// Above them the cirrus veil of Tidewater's previous cloud system (sky/Cirrus.js), in the panorama here and
// per pixel over the view clouds in the dome.
// The shape noise is generated here with Tidewater's Perlin-Worley code (not sky-pro's baked volume),
// remapped to the same per-channel mean and contrast; interleaved gradient noise replaces the blue noise.
// WebGPU compute kernels become fragment passes (MRT where a kernel wrote two textures).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G, COMMON_GLSL, SHARED_PARS } from '../Materials.js';
import { Cirrus, CIRRUS_GLSL } from './Cirrus.js';

const f = ( x ) => {
	const s = Number( x ).toString();
	return /[.eE]/.test( s ) ? s : s + '.0';
};

const DEG = Math.PI / 180;

// "Partly cloudy": scattered fair-weather cumulus
const PRESET = {
	atmosphere: { multipleScattering: 0.99 },
	shape: {
		altitude: 4000, thickness: 5200, density: 0.019, coverage: 0.49,
		horizonCoverageStart: 20000, horizonCoverageRamp: 45000, horizonCoverageAmount: 0.12,
		edgeSoftness: 0.095, edgeSoftnessFalloff: 1, weatherScale: 29000, baseScale: 7500, baseStrength: 0.69,
		erosionScaleBaseMultiplier: 0.13, erosionStrengthBase: 0.24, erosionStrengthPeak: 2.15, erosionShape: 1,
		baseWeatherStrength: 0.54, baseWeatherHeightStart: 0, baseWeatherHeightEnd: 0.13,
	},
	lighting: {
		scatteringAlbedo: 1, powderStrength: 0.7, ambientIntensity: 0.7,
		groundBounceAlbedo: [ 0.009134058699157796, 0.015208514418949472, 0.018500220124016652 ],
		baseShadowStrength: 0.88, baseShadowHeight: 0.13, moonGain: 0.65,
	},
	wind: { speed: 12, evolutionSpeed: 60.8 * 12 / 89, skew: 1750 },
	fade: { hazeDensityScale: 0.62, horizonMeltStart: 25000, horizonMeltEnd: 45000 },
	weather: { resolution: 1024, mainMass: [ 4, 5, 0, 1.32 ], detail: [ 6, 6, 1, 0.13 ], coverage: 0.26 },
};

// sky-pro "high" quality; "low": quarter-resolution history and half the steps
const QUALITY = {
	high: { historyDivisor: 2, lattice: 4, maxSteps: 256, lightTaps: 6, stepMeters: 25, fullLightingAlpha: 0.5, lightReuseSteps: 3, historyWeight: 0.9 },
	low: { historyDivisor: 4, lattice: 4, maxSteps: 128, lightTaps: 6, stepMeters: 25, fullLightingAlpha: 0.5, lightReuseSteps: 3, historyWeight: 0.9 },
};

const PANO_W = 512, PANO_H = 160; // elevation -4..90 deg, v = sqrt
const PANO_LATTICE = 4; // 1/16 of the panorama per frame
const SHADOW_RES = 256;
const SHADOW_SIZE = 12000;
const AP_DIST = 30000; // m: aerial perspective toward the horizon
const NOISE_RES = 64;
// per-channel mean / standard deviation of the generated Perlin-Worley, and those of the volume the preset
// was tuned for (the density thresholds depend on them)
const NOISE_STATS = [ [ 0.6048, 0.0996, 0.480, 0.118 ], [ 0.6081, 0.0985, 0.477, 0.120 ], [ 0.6141, 0.0998, 0.477, 0.119 ] ];

const FS_VERT = /* glsl */`
	void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// ------------------------------------------------------------------ GLSL: uniforms and shared core

const PARS_GLSL = /* glsl */`
	uniform vec4 scfPosition, scfRight, scfUp, scfForward;
	uniform vec4 scfPrevPosition, scfPrevRight, scfPrevUp, scfPrevForward;
	uniform vec4 scfViewport, scfSampling, scfClock, scfWind, scfWindDelta, scfMarch, scfTemporal, scfDisplay, scfPano, scfShadow;
	uniform vec4 scfLightOffsets[ 8 ];
	uniform vec4 scfLightLods[ 8 ];
	uniform vec4 scsShell, scsShape, scsErosion, scsBase, scsHorizon, scsCloudLight, scsShadow, scsBounce, scsWind, scsFade;
	uniform vec4 scsWeatherMass, scsWeatherDetail, scsWeather;
	uniform sampler3D scNoise; uniform sampler2D scWeatherMap; uniform sampler2D scWeatherBounds;
`;

// y-up texture conventions throughout (WebGL): uv.y grows with the camera's up vector
const CORE_GLSL = /* glsl */`
	const float SC_EARTH = 6371.0;
	const float SC_FAR = 250000.0;
	const float SC_AP_DIST = ${f( AP_DIST )};
	const float SC_PI = 3.141592653589793;

	vec3 scRay( vec2 uv ) {
		vec2 ndc = uv * 2.0 - 1.0;
		return normalize( scfForward.xyz + scfRight.xyz * ( ndc.x * scfRight.w * scfPosition.w ) + scfUp.xyz * ( ndc.y * scfPosition.w ) );
	}
	vec2 scSourceUV( vec2 pixel ) {
		return ( pixel * scfSampling.z + scfSampling.xy + 0.5 ) / scfViewport.zw;
	}
	vec3 scProjectPrevious( vec3 p ) {
		vec3 v = p - scfPrevPosition.xyz;
		float z = dot( v, scfPrevForward.xyz );
		float denom = max( z, 0.001 ) * scfPrevPosition.w;
		return vec3( vec2( dot( v, scfPrevRight.xyz ) / ( denom * scfPrevRight.w ), dot( v, scfPrevUp.xyz ) / denom ) * 0.5 + 0.5, z );
	}
	float scHG( float mu, float g ) {
		float d = max( 1.0 + g * g - 2.0 * g * mu, 0.001 );
		return ( 1.0 - g * g ) / ( 4.0 * SC_PI * d * sqrt( d ) );
	}
	// normalised droplet phase: 80 % forward / 20 % backscatter; each higher order halves the asymmetry
	vec3 scPhases( float mu ) {
		return vec3( scHG( mu, 0.8 ), scHG( mu, 0.4 ), scHG( mu, 0.2 ) ) * 0.8
			+ vec3( scHG( mu, -0.2 ), scHG( mu, -0.1 ), scHG( mu, -0.05 ) ) * 0.2;
	}

	// ---- density (sky-pro density.wgsl)
	struct ScCandidate {
		float conservative; float edge; float top; float floorMask;
		float shellHeight; float localHeight; float coverage; vec3 position;
	};
	float scShellHeight( vec3 p ) {
		vec2 horizontal = p.xz - scfPosition.xz;
		// parabolic radial height avoids subtracting two ~6,371,000 m values
		float altitude = p.y + dot( horizontal, horizontal ) / ( 2.0 * SC_EARTH * 1000.0 );
		return ( altitude - scsShell.x ) / scsShell.y;
	}
	float scConeLod( float footprint, float scale ) { return max( 0.0, log2( max( footprint * 64.0 / scale, 1.0 ) ) ); }
	ScCandidate scCandidate( vec3 p, float coverage, float lod ) {
		float h = scShellHeight( p );
		ScCandidate result = ScCandidate( 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, vec3( 0.0 ) );
		if ( h < -0.1 || h > 1.3 || coverage <= 0.0 ) return result;
		vec2 windDirection = scsWind.xy;
		vec3 shapePosition = p - vec3( scfWind.x, 0.0, scfWind.y )
			- vec3( windDirection.x, 0.0, windDirection.y ) * ( scsWind.z * max( h, 0.0 ) - scfWind.z );
		float weather = textureLod( scWeatherMap, ( p.xz - scfWind.xy ) / scsShape.x, 0.0 ).r;
		float edge = max( scsBase.y * exp2( -max( h, 0.0 ) * scsBase.z ), 0.0001 );
		// an all-one noise sample bounds top dilation; a failed bound avoids the volume fetch
		float maximumTop = weather + coverage - 1.0 + 1.34 * scsShape.z * coverage;
		if ( maximumTop < h - edge ) return result;
		float required = ( 1.0 - smoothstep( scsBase.w, max( scsErosion.w, scsBase.w + 0.001 ), h ) ) * scsBase.x;
		float floorMask = smoothstep( required - 0.1, required, weather );
		if ( floorMask <= 0.0 ) return result;
		vec3 baseSample = textureLod( scNoise, shapePosition / scsShape.y, lod ).rgb;
		float dilation = dot( baseSample, vec3( 0.7, 0.41, 0.23 ) ) * scsShape.z;
		float top = weather + coverage - 1.0 + dilation * coverage;
		result.conservative = smoothstep( -edge, edge, top - h ) * smoothstep( -edge, edge, h ) * floorMask;
		result.edge = edge; result.top = top; result.floorMask = floorMask;
		result.shellHeight = h; result.localHeight = clamp( h / max( top, 0.001 ), 0.0, 1.0 );
		result.coverage = coverage; result.position = shapePosition;
		return result;
	}
	float scErodedDensity( ScCandidate c, float lod ) {
		if ( c.conservative <= 0.0 ) return 0.0;
		float strength = mix( scsErosion.x, scsErosion.y, c.localHeight );
		float maximumErosion = 0.173 * strength * c.coverage;
		if ( min( c.top - c.shellHeight, c.shellHeight ) >= maximumErosion + c.edge ) return c.floorMask;
		vec3 s = textureLod( scNoise, c.position / ( scsShape.y * scsShape.w ), lod ).rgb;
		vec3 field = mix( 1.0 - s, s, scsErosion.z );
		float erosion = dot( field, vec3( 0.113, 0.04, 0.02 ) ) * strength * c.coverage;
		return smoothstep( -c.edge, c.edge, c.top - erosion - c.shellHeight )
			* smoothstep( -c.edge, c.edge, c.shellHeight - erosion ) * c.floorMask;
	}
	float scLightDensity( vec3 p, float coverage, vec2 lods, bool cheap ) {
		ScCandidate c = scCandidate( p, coverage, lods.x );
		if ( cheap ) return c.conservative;
		return scErodedDensity( c, lods.y );
	}
	vec2 scShellRoots( vec3 direction, float altitude, float originHeight ) {
		float radius = SC_EARTH * 1000.0;
		float b = ( radius + originHeight ) * direction.y;
		float c = ( originHeight - altitude ) * ( 2.0 * radius + originHeight + altitude );
		float h = b * b - c;
		if ( h < 0.0 ) return vec2( -1.0 );
		float q = -b - ( b >= 0.0 ? sqrt( h ) : -sqrt( h ) );
		float other = c / ( abs( q ) > 0.0001 ? q : -0.0001 );
		return vec2( min( q, other ), max( q, other ) );
	}
	vec2 scCloudInterval( vec3 dir, float originHeight ) {
		vec2 inner = scShellRoots( dir, scsShell.x, originHeight );
		vec2 outer = scShellRoots( dir, scsShell.x + scsShell.y, originHeight );
		float start = 0.0; float end = min( outer.y, SC_FAR );
		if ( outer.y <= 0.0 ) return vec2( 0.0 );
		if ( originHeight < scsShell.x ) { start = max( inner.y, 0.0 ); }
		else {
			if ( originHeight > scsShell.x + scsShell.y ) start = max( outer.x, 0.0 );
			if ( inner.x >= 0.0 ) end = min( end, inner.x );
		}
		vec2 ground = scShellRoots( dir, 0.0, originHeight );
		if ( ground.x > 0.0 ) end = min( end, ground.x );
		return vec2( start, end );
	}
`;

// the ray march (sky-pro clouds.wgsl main(), as a function of the ray)
const MARCH_GLSL = /* glsl */`
	float scCoverageAt( float t ) {
		return scsShell.w + scsHorizon.z * smoothstep( scsHorizon.x, scsHorizon.x + max( scsHorizon.y, 1.0 ), t );
	}
	float scHeightAlongRay( float t, vec3 dir, float originHeight ) {
		float altitude = originHeight + dir.y * t + dot( dir.xz, dir.xz ) * t * t / ( 2.0 * SC_EARTH * 1000.0 );
		return ( altitude - scsShell.x ) / scsShell.y;
	}
	bool scCellIsEmpty( float t, float end, vec3 dir, float originHeight, float maximumWeather ) {
		float turningPoint = -dir.y * SC_EARTH * 1000.0 / max( dot( dir.xz, dir.xz ), 0.000001 );
		float minHeight = scHeightAlongRay( clamp( turningPoint, t, end ), dir, originHeight );
		float maxHeight = max( scHeightAlongRay( t, dir, originHeight ), scHeightAlongRay( end, dir, originHeight ) );
		float coverage = scCoverageAt( end );
		float maximumTop = maximumWeather + coverage - 1.0 + 1.34 * scsShape.z * coverage;
		float edgeHeight = scsBase.z >= 0.0 ? minHeight : maxHeight;
		float edge = max( scsBase.y * exp2( -max( edgeHeight, 0.0 ) * scsBase.z ), 0.0001 );
		float required = ( 1.0 - smoothstep( scsBase.w, max( scsErosion.w, scsBase.w + 0.001 ), maxHeight ) ) * scsBase.x;
		return maximumTop < minHeight - edge || maximumWeather <= required - 0.1;
	}
	float scLightOpticalDepth( vec3 p, float coverage, vec2 lods, bool cheap ) {
		float opticalDepth = 0.0;
		for ( int i = 1; i < 8; i ++ ) {
			if ( float( i ) >= scfMarch.z ) break;
			vec4 tap = scfLightOffsets[ i ];
			opticalDepth += scLightDensity( p + tap.xyz, coverage, max( lods, scfLightLods[ i ].xy ), cheap ) * tap.w * scsShell.z;
			if ( opticalDepth >= 32.0 ) break;
		}
		return opticalDepth;
	}
	float scLightEnergy( float opticalDepth, vec3 phase ) {
		float quarter = exp( -opticalDepth * 0.25 );
		float halfT = quarter * quarter;
		return dot( vec3( halfT * halfT, halfT * 0.5, quarter * 0.25 ), phase );
	}
	// the sky (sky-view LUT) and the night sky's ambient
	vec3 scSky( vec3 dir ) {
		return skyLuminance( dir ) + uSkyIrr * uNight;
	}
	// key light: the sun seen from cloud altitude while it is the key light, else the moon
	vec3 scDirect() {
		bool isMoon = dot( uSunDir, uSkySunDir ) < 0.9999;
		vec3 sunE = atmosphereSampleTransmittance( 6360.0 + scsShell.x * 0.001, uSunDir.y ) * 11.0;
		return isMoon ? uSunColor : sunE;
	}

	struct ScMarch { vec3 color; float alpha; float depth; float steps; };

	ScMarch scMarch( vec3 origin, vec3 dir, float dither, float pixelConeAngle, float stepConeAngle, int maxSteps, bool useBounds ) {
		ScMarch outM;
		outM.color = vec3( 0.0 ); outM.alpha = 0.0; outM.depth = SC_FAR; outM.steps = 0.0;
		vec2 interval = scCloudInterval( dir, origin.y );
		vec3 color = vec3( 0.0 ); float transmission = 1.0; float weightedDepth = 0.0;
		float steps = 0.0;
		if ( interval.y > interval.x && scsShell.w > 0.0 && scsShell.z > 0.0 ) {
			vec3 L = uSunDir;
			float lightCosine = dot( dir, L );
			vec3 phase = scPhases( lightCosine );
			vec3 direct = scDirect();
			vec3 zenith = scSky( vec3( 0.0, 1.0, 0.0 ) );
			vec3 horizon = scSky( normalize( vec3( L.x, 0.03, L.z ) + vec3( 1e-5, 0.0, 0.0 ) ) );
			vec3 bounce = scsBounce.rgb * direct * max( L.y, 0.0 );
			float t = interval.x + dither * scfMarch.x;
			bool coarse = true; int emptyRun = 0; float accumulatedDepth = 0.0;
			float refineEnd = -1.0;
			float cellEnd = -1.0; float cellStart = -1.0; float maximumWeather = 1.0;
			float shadowAt = -SC_FAR; float shadowDensity = -1.0; float shadowTau = 0.0; float skyTau = 0.0; bool shadowCheap = false;
			bool hasDirectLight = max( direct.x, max( direct.y, direct.z ) ) > 0.00001;
			for ( int i = 0; i < 256; i ++ ) {
				if ( i >= maxSteps ) break;
				if ( t >= interval.y || transmission < 0.003 ) break;
				steps += 1.0;
				if ( coarse && useBounds ) {
					if ( t >= cellEnd || t < cellStart ) {
						ivec2 size = textureSize( scWeatherBounds, 0 );
						vec2 grid = ( origin.xz + dir.xz * t - scfWind.xy ) / scsShape.x * vec2( size );
						ivec2 cell = ivec2( floor( grid ) );
						maximumWeather = texelFetch( scWeatherBounds, ( ( cell % size ) + size ) % size, 0 ).r;
						vec2 fg = fract( grid );
						vec2 distance = vec2( dir.x >= 0.0 ? 1.0 - fg.x : fg.x, dir.z >= 0.0 ? 1.0 - fg.y : fg.y )
							/ max( abs( dir.xz ) * vec2( size ) / scsShape.x, vec2( 0.0000001 ) );
						cellStart = t; cellEnd = min( interval.y, t + max( min( distance.x, distance.y ), 0.05 ) );
					}
					if ( scCellIsEmpty( t, cellEnd, dir, origin.y, maximumWeather ) ) { t = cellEnd + 0.05; continue; }
				}
				float footprint = t * pixelConeAngle;
				float fineStep = max( scfMarch.x, t * stepConeAngle * 1.5 );
				vec3 p = origin + dir * t;
				float coverage = scCoverageAt( t );
				float baseLod = scConeLod( footprint, scsShape.y );
				ScCandidate c = scCandidate( p, coverage, baseLod );
				float erosionLod = scConeLod( footprint, scsShape.y * scsShape.w );
				if ( coarse ) {
					if ( c.conservative > 0.0 ) {
						if ( scErodedDensity( c, erosionLod ) > 0.0 ) {
							refineEnd = t;
							t = max( interval.x, t - fineStep * 4.0 ) + fineStep;
							t = min( t, refineEnd );
							coarse = false; emptyRun = 0;
							continue;
						}
					}
					t += fineStep * 4.0;
					continue;
				}
				float density = scErodedDensity( c, erosionLod );
				if ( density <= 0.0 ) {
					shadowAt = -SC_FAR;
					emptyRun ++;
					if ( t < refineEnd ) { t = min( t + fineStep, refineEnd ); continue; }
					if ( emptyRun >= 4 ) coarse = true;
					t += coarse ? fineStep * 4.0 : fineStep;
					continue;
				}
				emptyRun = 0; refineEnd = -1.0;
				float sigmaT = density * scsShell.z;
				float surfaceStep = clamp( 0.5 / max( sigmaT, 0.000001 ), fineStep * 0.15, fineStep );
				float stepLength = min( mix( surfaceStep, fineStep * 3.0, smoothstep( 1.0, 3.0, accumulatedDepth ) ), interval.y - t );
				float height = clamp( c.shellHeight, 0.0, 1.0 );
				float baseShadow = mix( 1.0, mix( 0.15, 1.0, smoothstep( 0.0, max( scsShadow.y, 0.001 ), height ) ), scsShadow.x );
				// darken thin margins away from the sun; keep the forward scattered silver linings
				float powderWeight = scsCloudLight.y * ( 1.0 - smoothstep( 0.2, 0.95, lightCosine ) );
				float powder = mix( 1.0, 1.0 - exp( -density * 2.0 ), powderWeight );
				float energy = 0.0;
				bool cheap = ( 1.0 - transmission ) >= scfMarch.w;
				float reuseDistance = min( fineStep * scfDisplay.y, max( 20.0, scsShape.y * scsShape.w * 0.03 ) );
				if ( abs( t - shadowAt ) >= reuseDistance || abs( density - shadowDensity ) > 0.08 || cheap != shadowCheap ) {
					vec2 lods = vec2( baseLod, erosionLod );
					if ( hasDirectLight ) shadowTau = scLightOpticalDepth( p, coverage, lods, cheap );
					vec2 skyLods = lods + vec2( 1.0 );
					skyTau = ( scLightDensity( p + vec3( 0.0, 125.0, 0.0 ), coverage, skyLods, true ) * 250.0
						+ scLightDensity( p + vec3( 0.0, 600.0, 0.0 ), coverage, skyLods, true ) * 700.0 ) * scsShell.z;
					shadowAt = t; shadowDensity = density; shadowCheap = cheap;
				}
				float tauL = shadowTau + sigmaT * scfLightOffsets[ 0 ].w;
				if ( hasDirectLight ) energy = scLightEnergy( tauL, phase );
				// (ours) overcast decks: the sunlight diffused down through the whole layer (two-stream
				// transmission, g 0.8, isotropic) that the three octaves cannot carry past an optical depth of
				// ~10; it is what makes an overcast base grey instead of sky-blue. Weighted in with the coverage
				// (scsShadow.w): none for Tidewater's scattered cumulus
				float diffuse = hasDirectLight ? scsShadow.w * ( 1.0 - exp( -tauL * 0.25 ) ) / ( 1.0 + 0.15 * tauL ) * 0.0795775 : 0.0;
				float skyVisibility = 0.2 + 0.8 / ( 1.0 + ( skyTau + sigmaT * 25.0 ) * 0.35 );
				vec3 ambient = ( mix( mix( zenith, horizon, 0.55 ), zenith, sqrt( height ) ) * skyVisibility + bounce * ( 1.0 - height ) )
					* scsCloudLight.z * ( 1.0 + scsCloudLight.w );
				vec3 light = ( direct * ( energy * powder * baseShadow + diffuse ) + ambient ) * scsCloudLight.x;
				float stepT = exp( -sigmaT * stepLength );
				float alpha = transmission * ( 1.0 - stepT );
				color += alpha * light; weightedDepth += alpha * t;
				transmission *= stepT; accumulatedDepth += sigmaT * stepLength; t += stepLength;
			}
		}
		float alpha = 1.0 - transmission;
		float depth = SC_FAR;
		if ( alpha > 0.0 ) {
			depth = weightedDepth / alpha;
			// aerial perspective (distance toward the sky behind), then the far melt into the sky
			vec3 sky = scSky( dir );
			// (ours) the air under an overcast deck is in its shade: grey airlight (as atmosphereFog)
			sky = mix( sky, vec3( dot( sky, vec3( 0.2126, 0.7152, 0.0722 ) ) * 0.8 ), scsShadow.w * 0.85 );
			float ap = exp( -depth / SC_AP_DIST );
			color = color * ap + sky * alpha * ( 1.0 - ap );
			float melt = smoothstep( scsFade.y, max( scsFade.z, scsFade.y + 1.0 ), depth );
			color = mix( color, sky * alpha, melt );
		}
		outM.color = color; outM.alpha = alpha; outM.depth = depth; outM.steps = steps;
		return outM;
	}
`;

// sky-pro weather.wgsl (procedural fbm coverage)
const WEATHER_GLSL = /* glsl */`
	uvec3 scHash33( uvec3 cell ) {
		uvec3 p = cell * 1664525u + 1013904223u;
		p.x += p.y * p.z; p.y += p.z * p.x; p.z += p.x * p.y;
		p = p ^ ( p >> uvec3( 16u ) );
		p.x += p.y * p.z; p.y += p.z * p.x; p.z += p.x * p.y;
		return p;
	}
	float scGradient( ivec3 cell, int period, vec3 offset ) {
		uvec3 wrapped = uvec3( ( ( cell % ivec3( period ) ) + ivec3( period ) ) % ivec3( period ) );
		uint h = ( scHash33( wrapped ).x >> 24u ) & 15u;
		float u = h < 8u ? offset.x : offset.y;
		float v = h < 4u ? offset.y : ( ( h == 12u || h == 14u ) ? offset.x : offset.z );
		return ( ( h & 1u ) == 0u ? u : -u ) + ( ( h & 2u ) == 0u ? v : -v );
	}
	float scPerlin( vec3 p, int period ) {
		ivec3 cell = ivec3( floor( p ) ); vec3 fr = fract( p ); vec3 w = fr * fr * fr * ( fr * ( fr * 6.0 - 15.0 ) + 10.0 );
		return mix( mix( mix( scGradient( cell, period, fr ), scGradient( cell + ivec3( 1, 0, 0 ), period, fr - vec3( 1, 0, 0 ) ), w.x ),
			mix( scGradient( cell + ivec3( 0, 1, 0 ), period, fr - vec3( 0, 1, 0 ) ), scGradient( cell + ivec3( 1, 1, 0 ), period, fr - vec3( 1, 1, 0 ) ), w.x ), w.y ),
			mix( mix( scGradient( cell + ivec3( 0, 0, 1 ), period, fr - vec3( 0, 0, 1 ) ), scGradient( cell + ivec3( 1, 0, 1 ), period, fr - vec3( 1, 0, 1 ) ), w.x ),
			mix( scGradient( cell + ivec3( 0, 1, 1 ), period, fr - vec3( 0, 1, 1 ) ), scGradient( cell + ivec3( 1, 1, 1 ), period, fr - vec3( 1, 1, 1 ) ), w.x ), w.y ), w.z );
	}
	float scFbm( vec2 uv, vec4 profile ) {
		float frequency = max( 1.0, floor( profile.x + 0.5 ) ); float weight = 0.5;
		float sum = 0.0; float weights = 0.0;
		for ( int i = 0; i < 8; i ++ ) {
			if ( float( i ) >= profile.y ) break;
			sum += scPerlin( vec3( uv, profile.z * 13.37 + 0.5 ) * frequency, int( frequency ) ) * weight;
			weights += weight; weight *= 0.5; frequency *= 2.0;
		}
		return sum / max( weights, 0.001 ) * 0.5 + 0.5;
	}
`;

// Tidewater Clouds.js noise helpers (clWorley3, clGnoise, clBillows, clPerlinFbm) and its shape kernel
const NOISE_GLSL = /* glsl */`
	float clMod( float x, float y ) { return x - y * floor( x / y ); }
	vec3 clMod3( vec3 x, float y ) { return x - y * floor( x / y ); }
	float clHash3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
	// tileable 3D worley (F1) with cells cells per unit
	float clWorley3( vec3 p, float cells ) {
		vec3 q = p * cells;
		vec3 ip = floor( q );
		vec3 fp = fract( q );
		float d = 1e3;
		for ( int z = -1; z <= 1; z ++ ) for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
			vec3 o = vec3( float( x ), float( y ), float( z ) );
			vec3 cell = clMod3( ip + o, cells );
			vec3 h = vec3( clHash3( cell ), clHash3( cell + 19.7 ), clHash3( cell + 41.3 ) );
			d = min( d, length( o + h - fp ) );
		}
		return d;
	}
	// tileable 3D gradient (perlin) noise, about -1..1
	float clGrad3( vec3 i, vec3 f, vec3 o, float cells ) {
		vec3 c = clMod3( i + o, cells );
		vec3 gv = vec3( clHash3( c ), clHash3( c + 13.1 ), clHash3( c + 27.7 ) ) * 2.0 - 1.0;
		return dot( gv, f - o );
	}
	float clGnoise( vec3 p, float cells ) {
		vec3 q = p * cells;
		vec3 i = floor( q );
		vec3 f = fract( q );
		vec3 u = f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
		float x00 = mix( clGrad3( i, f, vec3( 0.0, 0.0, 0.0 ), cells ), clGrad3( i, f, vec3( 1.0, 0.0, 0.0 ), cells ), u.x );
		float x10 = mix( clGrad3( i, f, vec3( 0.0, 1.0, 0.0 ), cells ), clGrad3( i, f, vec3( 1.0, 1.0, 0.0 ), cells ), u.x );
		float x01 = mix( clGrad3( i, f, vec3( 0.0, 0.0, 1.0 ), cells ), clGrad3( i, f, vec3( 1.0, 0.0, 1.0 ), cells ), u.x );
		float x11 = mix( clGrad3( i, f, vec3( 0.0, 1.0, 1.0 ), cells ), clGrad3( i, f, vec3( 1.0, 1.0, 1.0 ), cells ), u.x );
		return mix( mix( x00, x10, u.y ), mix( x01, x11, u.y ), u.z );
	}
	// billows: inverted worley fbm (1 at the feature points)
	float clBillows( vec3 p, float c ) { return 1.0 - ( clWorley3( p, c ) * 0.625 + clWorley3( p, c * 2.0 ) * 0.25 + clWorley3( p, c * 4.0 ) * 0.125 ); }
	float clPerlinFbm( vec3 p, float c ) { return clGnoise( p, c ) * 0.5 + clGnoise( p, c * 2.0 ) * 0.25 + clGnoise( p, c * 4.0 ) * 0.125; }
	// perlin-worley: remap( perlin, 0, 1, worley, 1 ) keeps the billows, breaks their regularity
	float clPerlinWorley( vec3 p, float c ) {
		float b = clBillows( p, c );
		float pn = clPerlinFbm( p, c ) * 0.9 + 0.5;
		return b + clamp( pn, 0.0, 1.0 ) * ( 1.0 - b ) * 0.5;
	}
`;

const v4 = () => new THREE.Vector4();

function rt( w, h, opts = {} ) {
	const t = new THREE.WebGLRenderTarget( w, h, Object.assign( { type: THREE.HalfFloatType, depthBuffer: false }, opts ) );
	for ( const x of t.textures ) {
		x.minFilter = x.magFilter = opts.filter || THREE.LinearFilter;
		x.wrapS = x.wrapT = opts.wrap || THREE.ClampToEdgeWrapping;
		x.generateMipmaps = false;
	}
	return t;
}

export class Clouds {
	constructor( gl ) {
		this.gl = gl;
		const P = PRESET, s = P.shape, l = P.lighting;
		this.quality = 'high';
		// ---- uniforms (sky-pro Frame and Settings), shared by every pass
		const U = this.U = {
			scfPosition: { value: v4() }, scfRight: { value: v4() }, scfUp: { value: v4() }, scfForward: { value: v4() },
			scfPrevPosition: { value: v4() }, scfPrevRight: { value: v4() }, scfPrevUp: { value: v4() }, scfPrevForward: { value: v4() },
			scfViewport: { value: v4() }, scfSampling: { value: v4() }, scfClock: { value: v4() }, scfWind: { value: v4() }, scfWindDelta: { value: v4() },
			scfMarch: { value: v4() }, scfTemporal: { value: v4() }, scfDisplay: { value: v4() }, scfPano: { value: v4() }, scfShadow: { value: v4() },
			scfLightOffsets: { value: new Float32Array( 32 ) }, scfLightLods: { value: new Float32Array( 32 ) },
			scsShell: { value: new THREE.Vector4( s.altitude, s.thickness, s.density, s.coverage ) },
			scsShape: { value: new THREE.Vector4( s.weatherScale, s.baseScale, s.baseStrength, s.erosionScaleBaseMultiplier ) },
			scsErosion: { value: new THREE.Vector4( s.erosionStrengthBase, s.erosionStrengthPeak, s.erosionShape, s.baseWeatherHeightEnd ) },
			// exponential softness falloff per shell height fraction
			scsBase: { value: new THREE.Vector4( s.baseWeatherStrength, s.edgeSoftness, Math.log2( Math.max( s.edgeSoftnessFalloff, 0.001 ) ) * s.thickness * 0.001, s.baseWeatherHeightStart ) },
			scsHorizon: { value: new THREE.Vector4( s.horizonCoverageStart, s.horizonCoverageRamp, s.horizonCoverageAmount, 0 ) },
			// w: the atmosphere's multiple scattering term of the ambient
			scsCloudLight: { value: new THREE.Vector4( l.scatteringAlbedo, l.powderStrength, l.ambientIntensity, P.atmosphere.multipleScattering ) },
			scsShadow: { value: new THREE.Vector4( l.baseShadowStrength, l.baseShadowHeight, l.moonGain, 0 ) },
			scsBounce: { value: new THREE.Vector4( ...l.groundBounceAlbedo, 0 ) },
			scsWind: { value: new THREE.Vector4( 0, 1, P.wind.skew, 0 ) },
			scsFade: { value: new THREE.Vector4( P.fade.hazeDensityScale, P.fade.horizonMeltStart, P.fade.horizonMeltEnd, 0 ) },
			scsWeatherMass: { value: new THREE.Vector4( ...P.weather.mainMass ) },
			scsWeatherDetail: { value: new THREE.Vector4( ...P.weather.detail ) },
			scsWeather: { value: new THREE.Vector4( P.weather.coverage, 0, 0, 0 ) },
			scNoise: { value: null }, scWeatherMap: { value: null }, scWeatherBounds: { value: null },
		};
		this.baseDensity = s.density;
		this.baseAmbient = l.ambientIntensity;

		// ---- textures
		this.noiseRT = new THREE.WebGL3DRenderTarget( NOISE_RES, NOISE_RES, NOISE_RES, { type: THREE.UnsignedByteType, depthBuffer: false } );
		const nt = this.noiseRT.texture;
		nt.wrapS = nt.wrapT = nt.wrapR = THREE.RepeatWrapping;
		nt.minFilter = THREE.LinearMipmapLinearFilter; nt.magFilter = THREE.LinearFilter;
		nt.generateMipmaps = false;
		const W = P.weather.resolution;
		this.weatherRT = rt( W, W, { type: THREE.UnsignedByteType, wrap: THREE.RepeatWrapping } );
		this.boundsRT = rt( 64, 64, { type: THREE.UnsignedByteType, filter: THREE.NearestFilter } );
		U.scNoise.value = nt;
		U.scWeatherMap.value = this.weatherRT.texture;
		U.scWeatherBounds.value = this.boundsRT.texture;
		this.source = rt( 4, 4, { count: 2, filter: THREE.NearestFilter } ); // colour, meta (depth km, 1, cost)
		this.history = [ rt( 4, 4, { count: 2 } ), rt( 4, 4, { count: 2 } ) ];
		this.panorama = rt( PANO_W, PANO_H, { wrap: THREE.RepeatWrapping } );
		this.panorama.texture.wrapT = THREE.ClampToEdgeWrapping;
		this.shadowMap = rt( SHADOW_RES, SHADOW_RES );
		this._pp = 0;
		this.viewTex = this.history[ 0 ].textures[ 0 ];
		this.cirrus = new Cirrus( gl );

		this._buildPasses();

		// ---- the sampling side (the dome): the view camera the history was resolved for
		this.viewRight = new THREE.Vector3( 1, 0, 0 );
		this.viewUp = new THREE.Vector3( 0, 1, 0 );
		this.viewFwd = new THREE.Vector3( 0, 0, - 1 );
		this.viewTan = new THREE.Vector2( 1, 1 );
		this.viewValid = 0;
		this.shadowCenter = new THREE.Vector2();
		this.shadowSize = SHADOW_SIZE;

		// ---- CPU state
		this._w = 0; this._h = 0;
		this.sourceWidth = 1; this.sourceHeight = 1; this.historyWidth = 1; this.historyHeight = 1;
		this.frameIndex = 0;
		this.historyValid = false;
		this.weatherDirty = true;
		this.noiseDirty = true;
		this.panoWarm = true;
		this._shadowInit = false;
		this._windX = 0; this._windZ = 0; this._evolution = 0; this._elapsed = 0;
		this._prevCam = null;
		this._prevLight = new THREE.Vector3();
		this._lastCoverage = - 1;
	}

	_buildPasses() {
		const U = this.U;
		const common = SHARED_PARS + COMMON_GLSL + PARS_GLSL;
		const mat = ( name, frag, extra = {}, glsl3 = false ) => new THREE.ShaderMaterial( {
			name, uniforms: Object.assign( extra, U, G, this.cirrus.uniforms ), vertexShader: FS_VERT, fragmentShader: frag,
			depthTest: false, depthWrite: false, glslVersion: glsl3 ? THREE.GLSL3 : null,
		} );
		this.quad = new FullScreenQuad();

		// ---- 64^3 shape noise, one slice per draw: r g b = Perlin-Worley at 4 / 8 / 16 cells per period
		this.noiseMat = mat( 'CloudNoise', NOISE_GLSL + /* glsl */`
			uniform float uZ;
			void main() {
				vec3 p = vec3( gl_FragCoord.xy, uZ + 0.5 ) / ${f( NOISE_RES )};
				vec3 v = vec3( clPerlinWorley( p, 4.0 ), clPerlinWorley( p, 8.0 ), clPerlinWorley( p, 16.0 ) );
				v = ( v - vec3( ${NOISE_STATS.map( s => f( s[ 0 ] ) ).join( ', ' )} ) ) / vec3( ${NOISE_STATS.map( s => f( s[ 1 ] ) ).join( ', ' )} )
					* vec3( ${NOISE_STATS.map( s => f( s[ 3 ] ) ).join( ', ' )} ) + vec3( ${NOISE_STATS.map( s => f( s[ 2 ] ) ).join( ', ' )} );
				gl_FragColor = vec4( clamp( v, 0.0, 1.0 ), 1.0 );
			}`, { uZ: { value: 0 } } );

		this.weatherMat = mat( 'CloudWeather', PARS_GLSL + WEATHER_GLSL + /* glsl */`
			void main() {
				vec2 size = vec2( ${f( PRESET.weather.resolution )} );
				vec2 uv = floor( gl_FragCoord.xy ) / size;
				float mass = clamp( ( scFbm( uv, scsWeatherMass ) - 0.5 ) * scsWeatherMass.w + 0.5, 0.0, 1.0 );
				float detail = ( scFbm( uv, scsWeatherDetail ) * 2.0 - 1.0 ) * scsWeatherDetail.w;
				gl_FragColor = vec4( clamp( mass + detail + scsWeather.x - 0.5, 0.0, 1.0 ), 0.0, 0.0, 1.0 );
			}` );

		this.boundsMat = mat( 'CloudWeatherBounds', PARS_GLSL + /* glsl */`
			void main() {
				ivec2 id = ivec2( gl_FragCoord.xy );
				ivec2 sourceSize = textureSize( scWeatherMap, 0 );
				vec2 scale = vec2( sourceSize ) / 64.0;
				// both bilinear neighbours at cell boundaries, including the repeat seam
				ivec2 lo = ivec2( floor( vec2( id ) * scale - 0.5 ) );
				ivec2 hi = ivec2( ceil( vec2( id + 1 ) * scale - 0.5 ) );
				float maximum = 0.0;
				for ( int y = lo.y; y <= hi.y; y ++ ) for ( int x = lo.x; x <= hi.x; x ++ ) {
					ivec2 p = ( ( ivec2( x, y ) % sourceSize ) + sourceSize ) % sourceSize;
					maximum = max( maximum, texelFetch( scWeatherMap, p, 0 ).r );
				}
				gl_FragColor = vec4( min( 1.0, maximum + 1.0 / 255.0 ), 0.0, 0.0, 1.0 );
			}` );

		// the view: one lattice slot of every block per frame
		this.traceMat = mat( 'CloudsTrace', common + CORE_GLSL + MARCH_GLSL + /* glsl */`
			layout( location = 0 ) out vec4 oColor;
			layout( location = 1 ) out vec4 oMeta;
			void main() {
				vec2 id = floor( gl_FragCoord.xy );
				vec2 uv = scSourceUV( id );
				vec3 dir = scRay( uv );
				float noise = dtIGN( id + mod( scfClock.x, 64.0 ) * vec2( 5.588238, 5.588238 ) );
				float dither = scfTemporal.x > 0.0 ? fract( noise + scfClock.x * 0.61803398875 ) : 0.5;
				float pixelConeAngle = 2.0 * scfPosition.w / scfViewport.y;
				float stepConeAngle = 2.0 * scfPosition.w / scfViewport.w;
				ScMarch m = scMarch( scfPosition.xyz, dir, dither, pixelConeAngle, stepConeAngle, int( scfMarch.y ), scfDisplay.y > 0.0 );
				oColor = vec4( m.color, m.alpha );
				// km depth fits half float; the metadata also records the normalised primary sample cost
				oMeta = vec4( m.depth * 0.001, 1.0, m.steps / scfMarch.y, 0.0 );
			}`, {}, true );

		// temporal reconstruction (sky-pro temporal.wgsl), ping-pong history
		this.temporalMat = mat( 'CloudsResolve', common + CORE_GLSL + /* glsl */`
			uniform sampler2D scCurrentColor; uniform sampler2D scCurrentMeta; uniform sampler2D scPreviousColor; uniform sampler2D scPreviousMeta;
			layout( location = 0 ) out vec4 oColor;
			layout( location = 1 ) out vec4 oMeta;
			ivec2 scSourceClamp( ivec2 p ) { return clamp( p, ivec2( 0 ), textureSize( scCurrentColor, 0 ) - 1 ); }
			vec4 scHistoryAt( vec2 uv, vec2 size ) {
				// five tap Catmull-Rom: detail survives repeated history warps
				vec2 position = uv * size;
				vec2 center = floor( position - 0.5 ) + 0.5;
				vec2 fr = position - center;
				vec2 w0 = fr * ( fr * ( -0.5 * fr + 1.0 ) - 0.5 );
				vec2 w1 = fr * fr * ( 1.5 * fr - 2.5 ) + 1.0;
				vec2 w2 = fr * ( fr * ( -1.5 * fr + 2.0 ) + 0.5 );
				vec2 w3 = fr * fr * ( 0.5 * fr - 0.5 );
				vec2 w12 = w1 + w2;
				vec2 uv0 = ( center - 1.0 ) / size;
				vec2 uv3 = ( center + 2.0 ) / size;
				vec2 uv12 = ( center + w2 / w12 ) / size;
				vec4 weights = vec4( w12.x * w0.y, w0.x * w12.y, w12.x * w12.y, w3.x * w12.y );
				float bottomWeight = w12.x * w3.y;
				vec4 value = textureLod( scPreviousColor, vec2( uv12.x, uv0.y ), 0.0 ) * weights.x
					+ textureLod( scPreviousColor, vec2( uv0.x, uv12.y ), 0.0 ) * weights.y
					+ textureLod( scPreviousColor, uv12, 0.0 ) * weights.z
					+ textureLod( scPreviousColor, vec2( uv3.x, uv12.y ), 0.0 ) * weights.w
					+ textureLod( scPreviousColor, vec2( uv12.x, uv3.y ), 0.0 ) * bottomWeight;
				return value / ( dot( weights, vec4( 1.0 ) ) + bottomWeight );
			}
			float scFreshHistoryWeight( vec4 color, float depth ) {
				float retain = color.a < 0.0001 ? 0.25 : mix( 0.25, 0.65, smoothstep( 8.0, 30.0, depth ) );
				return min( scfTemporal.x, retain ) * ( 1.0 - scfTemporal.y );
			}
			void scResolve( vec4 color, float depth, float carriedDepth, float cost, float weight ) {
				oColor = vec4( max( color.rgb, vec3( 0.0 ) ), clamp( color.a, 0.0, 1.0 ) );
				oMeta = vec4( depth, carriedDepth, cost, weight );
			}
			void main() {
				ivec2 id = ivec2( gl_FragCoord.xy );
				ivec2 size = ivec2( scfViewport.zw );
				vec2 uv = ( vec2( id ) + 0.5 ) / vec2( size );
				int lattice = int( scfSampling.z );
				bool fresh = ( id.x % lattice ) == int( scfSampling.x ) && ( id.y % lattice ) == int( scfSampling.y );
				vec2 source = ( vec2( id ) - scfSampling.xy ) / scfSampling.z;
				ivec2 center = scSourceClamp( ivec2( floor( source + 0.5 ) ) );
				vec4 metadata = texelFetch( scCurrentMeta, center, 0 );
				vec4 central = texelFetch( scCurrentColor, center, 0 );
				float currentDepth = max( metadata.x, 0.001 );
				vec4 stored = texelFetch( scPreviousMeta, id, 0 );
				bool historyValid = scfSampling.w > 0.5 && scfTemporal.x > 0.0;

				// a still view: untouched slots keep their colour and depth exactly
				if ( scfTemporal.z > 0.5 && historyValid && stored.y >= 0.001 ) {
					vec4 history = texelFetch( scPreviousColor, id, 0 );
					if ( fresh ) {
						float weight = scFreshHistoryWeight( central, currentDepth );
						scResolve( mix( central, history, weight ), currentDepth, currentDepth, metadata.z, weight );
					} else scResolve( history, stored.x, stored.y, stored.z, 1.0 );
					return;
				}

				// (ours) the current trace upsampled with a cubic B-spline over 4 x 4 source texels (premultiplied
				// in-scatter and opacity blend correctly across cloud edges), depth-weighted only between two cloud
				// taps. sky-pro's edge-stopping 2 x 2 weights (the alpha difference, and the 250 km sky depth against
				// a cloud's few km) were nearest-like at every cloud edge: 8-pixel stair steps wherever the history
				// was new (a cut, a fast turn, the screen edges) until the lattice filled in
				vec4 smoothC = vec4( 0.0 ); float weightSum = 0.0;
				ivec2 base = ivec2( floor( source ) ); vec2 fr = fract( source );
				vec2 fr2 = fr * fr, fr3 = fr2 * fr;
				vec2 bw[ 4 ];
				bw[ 0 ] = ( 1.0 - 3.0 * fr + 3.0 * fr2 - fr3 ) / 6.0;
				bw[ 1 ] = ( 4.0 - 6.0 * fr2 + 3.0 * fr3 ) / 6.0;
				bw[ 2 ] = ( 1.0 + 3.0 * fr + 3.0 * fr2 - 3.0 * fr3 ) / 6.0;
				bw[ 3 ] = fr3 / 6.0;
				for ( int y = 0; y < 4; y ++ ) for ( int x = 0; x < 4; x ++ ) {
					ivec2 pos = scSourceClamp( base + ivec2( x - 1, y - 1 ) );
					vec4 tap = texelFetch( scCurrentColor, pos, 0 );
					float weight = bw[ x ].x * bw[ y ].y;
					if ( tap.a > 0.02 && central.a > 0.02 ) {
						float depth = texelFetch( scCurrentMeta, pos, 0 ).x;
						weight *= exp( -abs( depth - metadata.x ) / max( 0.5, metadata.x * 0.3 ) );
					}
					smoothC += tap * weight; weightSum += weight;
				}
				smoothC = weightSum > 0.00001 ? smoothC / weightSum : central;
				vec4 color = fresh ? central : smoothC;
				if ( ! historyValid ) {
					scResolve( smoothC, currentDepth, currentDepth, metadata.z, 0.0 );
					return;
				}

				vec4 low = color; vec4 high = color;
				float reprojectionDepth = stored.y >= 0.001 ? stored.y : SC_FAR * 0.001;
				for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
					vec4 tap = texelFetch( scCurrentColor, scSourceClamp( center + ivec2( x, y ) ), 0 );
					low = min( low, tap ); high = max( high, tap );
					ivec2 neighbor = clamp( id + ivec2( x, y ), ivec2( 0 ), size - 1 );
					float depth = texelFetch( scPreviousMeta, neighbor, 0 ).y;
					if ( depth >= 0.001 ) reprojectionDepth = min( reprojectionDepth, depth );
				}
				if ( stored.y < 0.001 ) reprojectionDepth = min( reprojectionDepth, currentDepth );
				vec3 world = scfPosition.xyz + scRay( uv ) * ( reprojectionDepth * 1000.0 );
				world -= vec3( scfWindDelta.x, 0.0, scfWindDelta.y );
				vec3 previous = scProjectPrevious( world );
				ivec2 previousPixel = clamp( ivec2( previous.xy * vec2( size ) ), ivec2( 0 ), size - 1 );
				vec4 oldMeta = texelFetch( scPreviousMeta, previousPixel, 0 );
				bool valid = previous.z > 0.0 && all( greaterThanEqual( previous.xy, vec2( 0.0 ) ) ) && all( lessThanEqual( previous.xy, vec2( 1.0 ) ) ) && oldMeta.y >= 0.001;
				float carriedDepth = currentDepth; float historyFraction = 0.0;
				// newly revealed pixels: the smooth upsample (an exact sample alone there shows as a dot)
				if ( ! valid ) color = smoothC;
				if ( valid ) {
					vec4 history = clamp( scHistoryAt( previous.xy, vec2( size ) ), low, high );
					float motionPixels = length( ( previous.xy - uv ) * vec2( size ) );
					historyFraction = fresh ? scFreshHistoryWeight( central, currentDepth ) : 1.0;
					color = mix( color, history, historyFraction );
					float expectedDepth = length( world - scfPrevPosition.xyz ) * 0.001;
					if ( ! fresh && ( motionPixels <= 0.5 || abs( oldMeta.y - expectedDepth ) < max( 0.001, expectedDepth * 0.15 ) ) ) carriedDepth = oldMeta.y;
				}
				scResolve( color, currentDepth, carriedDepth, metadata.z, historyFraction );
			}`, { scCurrentColor: { value: null }, scCurrentMeta: { value: null }, scPreviousColor: { value: null }, scPreviousMeta: { value: null } }, true );

		// panorama (reflections, environment): one lattice slot per frame, all after a reset
		this.panoMat = mat( 'CloudsPanorama', common + CORE_GLSL + MARCH_GLSL + CIRRUS_GLSL + /* glsl */`
			void main() {
				ivec2 texel = ivec2( gl_FragCoord.xy );
				ivec2 lat = ivec2( scfPano.z );
				if ( texel.x % lat.x != int( scfPano.x ) || texel.y % lat.y != int( scfPano.y ) ) discard;
				vec2 uv = ( vec2( texel ) + 0.5 ) / vec2( ${f( PANO_W )}, ${f( PANO_H )} );
				float elev = uv.y * uv.y * ${f( 94 * DEG )} - ${f( 4 * DEG )};
				float az = uv.x * ${f( 2 * Math.PI )};
				vec3 dir = vec3( cos( elev ) * cos( az ), sin( elev ), cos( elev ) * sin( az ) );
				float cone = ${f( 2 * Math.PI / PANO_W )};
				ScMarch m = scMarch( scfPosition.xyz, dir, 0.5, cone, cone, 128, true );
				gl_FragColor = clOver( vec4( m.color, 1.0 - m.alpha ), cloudsHigh( dir, cone ) );
			}` );

		// cloud shadow on the ground (sea level) around the camera: optical depth along the key light
		this.shadowMat = mat( 'CloudsShadow', common + CORE_GLSL + MARCH_GLSL + /* glsl */`
			void main() {
				ivec2 texel = ivec2( gl_FragCoord.xy );
				// a quarter of the rows per frame (w = phase), or all of them (w < 0)
				if ( scfShadow.w >= 0.0 && ( texel.y % 4 ) != int( scfShadow.w ) ) discard;
				vec2 xz = scfShadow.xy + ( ( vec2( texel ) + 0.5 ) / ${f( SHADOW_RES )} - 0.5 ) * scfShadow.z;
				vec3 L = uSunDir;
				float ly = max( L.y, 0.08 );
				float t0 = scsShell.x / ly;
				float t1 = ( scsShell.x + scsShell.y ) / ly;
				const int n = 16;
				float dt = ( t1 - t0 ) / float( n );
				float tau = 0.0;
				for ( int i = 0; i < n; i ++ ) {
					float t = t0 + ( float( i ) + 0.5 ) * dt;
					vec3 p = vec3( xz.x, 0.0, xz.y ) + vec3( L.x, ly, L.z ) * t;
					tau += scLightDensity( p, scsShell.w, vec2( 2.0, 2.0 ), false ) * scsShell.z * dt;
					if ( tau > 12.0 ) break;
				}
				// multiple scattering lets some light through even thick cloud (as the view's octaves do)
				float T = exp( -tau ) * 0.8 + exp( -tau * 0.25 ) * 0.2;
				gl_FragColor = vec4( T, T, T, 1.0 );
			}` );
	}

	_draw( m, target, layer = 0 ) {
		this.quad.material = m;
		this.gl.setRenderTarget( target, layer );
		this.quad.render( this.gl );
	}

	_generateNoise() {
		const gl = this.gl;
		for ( let z = 0; z < NOISE_RES; z ++ ) {
			this.noiseMat.uniforms.uZ.value = z;
			// the mip chain once, with the last slice
			this.noiseRT.texture.generateMipmaps = z === NOISE_RES - 1;
			this._draw( this.noiseMat, this.noiseRT, z );
		}
		this.noiseRT.texture.generateMipmaps = false;
		gl.setRenderTarget( null );
	}

	_allocate( w, h ) {
		const q = QUALITY[ this.quality ];
		this.sourceWidth = Math.max( 1, Math.ceil( w / q.historyDivisor / q.lattice ) );
		this.sourceHeight = Math.max( 1, Math.ceil( h / q.historyDivisor / q.lattice ) );
		this.historyWidth = this.sourceWidth * q.lattice;
		this.historyHeight = this.sourceHeight * q.lattice;
		this.source.setSize( this.sourceWidth, this.sourceHeight );
		for ( const t of this.history ) t.setSize( this.historyWidth, this.historyHeight );
		this.historyValid = false;
	}

	// sets the cloud cover (0..1), a density and ambient scale (overcast skies), then renders this frame's passes
	update( dt, camera, width, height, { coverage = 0.49, densityK = 1, ambientK = 1, quality = 'high' } = {} ) {
		const P = PRESET, U = this.U;
		const gl = this.gl;
		const prevTarget = gl.getRenderTarget();
		dt = Math.min( 0.1, Math.max( 0, dt ) );
		if ( this.noiseDirty ) { this._generateNoise(); this.noiseDirty = false; }
		if ( quality !== this.quality ) { this.quality = quality; this._w = 0; }
		const q = QUALITY[ this.quality ];

		// ---- output size
		if ( width !== this._w || height !== this._h ) {
			this._w = width; this._h = height;
			this._allocate( width, height );
		}

		// ---- settings: coverage, density, wind direction
		U.scsShell.value.z = this.baseDensity * densityK;
		U.scsCloudLight.value.z = this.baseAmbient * ambientK;
		if ( Math.abs( coverage - this._lastCoverage ) > 0.002 ) {
			U.scsShell.value.w = coverage;
			U.scsShadow.value.w = THREE.MathUtils.smoothstep( coverage, 0.55, 0.85 );
			this._lastCoverage = coverage;
			this.historyValid = false;
			this.panoWarm = true;
		}
		this.cirrus.update( dt, coverage, true );
		const wd = G.uWind.value;
		const wl = Math.hypot( wd.x, wd.y ) || 1;
		const wx = wd.x / wl, wz = wd.y / wl;
		U.scsWind.value.x = wx; U.scsWind.value.y = wz;

		if ( this.weatherDirty ) {
			this._draw( this.weatherMat, this.weatherRT );
			this._draw( this.boundsMat, this.boundsRT );
			this.weatherDirty = false;
		}

		// ---- camera
		camera.updateMatrixWorld();
		const e = camera.matrixWorld.elements;
		const cp = camera.position;
		const tanY = Math.tan( THREE.MathUtils.degToRad( camera.fov * 0.5 ) ) / ( camera.zoom || 1 );
		const aspect = camera.aspect;
		const nrm = ( v ) => {
			const L = Math.hypot( v[ 0 ], v[ 1 ], v[ 2 ] ) || 1;
			return [ v[ 0 ] / L, v[ 1 ] / L, v[ 2 ] / L ];
		};
		const R = nrm( [ e[ 0 ], e[ 1 ], e[ 2 ] ] ), Up = nrm( [ e[ 4 ], e[ 5 ], e[ 6 ] ] ), Fw = nrm( [ - e[ 8 ], - e[ 9 ], - e[ 10 ] ] );
		const cur = { position: [ cp.x, cp.y, cp.z, tanY ], right: [ ...R, aspect ], up: [ ...Up, 0 ], forward: [ ...Fw, 0 ] };
		const prev = this._prevCam;
		// camera cuts: teleports, big turns, zoom
		if ( ! prev
			|| Math.hypot( cp.x - prev.position[ 0 ], cp.y - prev.position[ 1 ], cp.z - prev.position[ 2 ] ) > 1000
			|| Fw[ 0 ] * prev.forward[ 0 ] + Fw[ 1 ] * prev.forward[ 1 ] + Fw[ 2 ] * prev.forward[ 2 ] < 0.7
			|| Math.abs( tanY - prev.position[ 3 ] ) > 0.01 ) this.historyValid = false;
		const L = G.uSunDir.value;
		if ( L.dot( this._prevLight ) < 0.999 ) {
			this.historyValid = false;
			this.panoWarm = true;
		}
		this._prevLight.copy( L );
		const src = this.historyValid && prev ? prev : cur;
		U.scfPosition.value.fromArray( cur.position ); U.scfRight.value.fromArray( cur.right ); U.scfUp.value.fromArray( cur.up ); U.scfForward.value.fromArray( cur.forward );
		U.scfPrevPosition.value.fromArray( src.position ); U.scfPrevRight.value.fromArray( src.right ); U.scfPrevUp.value.fromArray( src.up ); U.scfPrevForward.value.fromArray( src.forward );
		this._prevCam = cur;

		// ---- sampling lattice (Morton-style permutation over the 4x4 cycle)
		const lat = q.lattice, index = this.frameIndex % ( lat * lat );
		let lx = 0, ly = 0;
		for ( let bit = 0; ( 1 << bit ) < lat; bit ++ ) {
			const pair = ( index >> ( bit * 2 ) ) & 3;
			lx |= ( ( pair >> 1 ) ^ ( pair & 1 ) ) << ( Math.log2( lat ) - bit - 1 );
			ly |= ( pair & 1 ) << ( Math.log2( lat ) - bit - 1 );
		}
		U.scfViewport.value.set( width, height, this.historyWidth, this.historyHeight );
		U.scfSampling.value.set( lx, ly, lat, this.historyValid ? 1 : 0 );

		// ---- clock and wind
		this._elapsed += dt;
		const speed = P.wind.speed;
		const dx = wx * speed * dt, dz = wz * speed * dt;
		this._windX += dx; this._windZ += dz; this._evolution += P.wind.evolutionSpeed * dt;
		U.scfClock.value.set( this.frameIndex % 4096, this._elapsed, dt, 0 );
		U.scfWind.value.set( this._windX, this._windZ, this._evolution, 0 );
		U.scfWindDelta.value.set( dx, dz, 0, 0 );
		U.scfMarch.value.set( q.stepMeters, q.maxSteps, q.lightTaps, q.fullLightingAlpha );
		U.scfTemporal.value.set( q.historyWeight, Math.min( 1, P.wind.evolutionSpeed * dt / 100 ), 0, 0 );
		U.scfDisplay.value.set( 0, q.lightReuseSteps, 0, 0 );

		// ---- light march taps: a 25 m local segment, then geometric growth to ~2.5 km over a cone
		const lxd = L.x, lyd = L.y, lzd = L.z;
		let tx = lzd, ty = 0, tz = - lxd;
		if ( Math.abs( lyd ) > 0.99 ) { tx = 0; ty = - lzd; tz = lyd; }
		const inv = 1 / ( Math.hypot( tx, ty, tz ) || 1 );
		tx *= inv; ty *= inv; tz *= inv;
		const bx = lyd * tz - lzd * ty, by = lzd * tx - lxd * tz, bz = lxd * ty - lyd * tx;
		const off = U.scfLightOffsets.value, lods = U.scfLightLods.value;
		off[ 0 ] = 0; off[ 1 ] = 0; off[ 2 ] = 0; off[ 3 ] = 25;
		const sh = P.shape;
		for ( let i = 1; i < 8; i ++ ) {
			const growth = 1.7 ** i, mid = 25 * ( ( growth - 1 ) / 0.7 + growth * 0.5 );
			const angle = i * 2.399963, radius = Math.sqrt( ( i + 0.5 ) / q.lightTaps );
			const u = Math.cos( angle ) * radius * 0.05 * mid, v = Math.sin( angle ) * radius * 0.05 * mid;
			const o = i * 4;
			off[ o ] = lxd * mid + tx * u + bx * v; off[ o + 1 ] = lyd * mid + ty * u + by * v; off[ o + 2 ] = lzd * mid + tz * u + bz * v; off[ o + 3 ] = 25 * growth;
			const footprint = mid * 0.1;
			lods[ o ] = Math.max( 0, Math.log2( footprint * 64 / sh.baseScale ) );
			lods[ o + 1 ] = Math.max( 0, Math.log2( footprint * 64 / ( sh.baseScale * sh.erosionScaleBaseMultiplier ) ) );
		}

		// ---- shadow map: a quarter of the rows per frame around a snapped centre
		const phase = this.frameIndex % 4;
		if ( phase === 0 || ! this._shadowInit ) {
			const cell = this.shadowSize / SHADOW_RES * 4;
			this.shadowCenter.set( Math.round( cp.x / cell ) * cell, Math.round( cp.z / cell ) * cell );
		}
		U.scfShadow.value.set( this.shadowCenter.x, this.shadowCenter.y, this.shadowSize, this._shadowInit ? phase : - 1 );
		this._draw( this.shadowMat, this.shadowMap );
		this._shadowInit = true;

		if ( this.panoWarm ) {
			U.scfPano.value.set( 0, 0, 1, 0 );
			this.panoWarm = false;
		} else {
			const k = this.frameIndex % ( PANO_LATTICE * PANO_LATTICE );
			U.scfPano.value.set( k % PANO_LATTICE, Math.floor( k / PANO_LATTICE ), PANO_LATTICE, 0 );
		}
		this._draw( this.panoMat, this.panorama );

		const underwater = G.uUnderwater.value > 0.5;
		if ( underwater ) {
			this.viewValid = 0;
			this.historyValid = false;
		} else {
			this._draw( this.traceMat, this.source );
			const tu = this.temporalMat.uniforms;
			const out = this.history[ this._pp ], prevH = this.history[ 1 - this._pp ];
			tu.scCurrentColor.value = this.source.textures[ 0 ];
			tu.scCurrentMeta.value = this.source.textures[ 1 ];
			tu.scPreviousColor.value = prevH.textures[ 0 ];
			tu.scPreviousMeta.value = prevH.textures[ 1 ];
			this._draw( this.temporalMat, out );
			this.viewTex = out.textures[ 0 ];
			this._pp = 1 - this._pp;
			this.viewRight.set( R[ 0 ], R[ 1 ], R[ 2 ] );
			this.viewUp.set( Up[ 0 ], Up[ 1 ], Up[ 2 ] );
			this.viewFwd.set( Fw[ 0 ], Fw[ 1 ], Fw[ 2 ] );
			this.viewTan.set( tanY * aspect, tanY );
			this.viewValid = 1;
			this.historyValid = true;
		}
		this.frameIndex ++;
		gl.setRenderTarget( prevTarget );

		// ---- publish for the materials
		G.uCloudPano.value = this.panorama.texture;
		G.uCloudPanoOn.value = 1;
		G.uCloudShadow.value = this.shadowMap.texture;
		G.uCloudShadowRect.value.set( this.shadowCenter.x - this.shadowSize / 2, this.shadowCenter.y - this.shadowSize / 2, this.shadowSize, this.shadowSize );
		G.uCloudShadowOn.value = 1;
	}

	disable() {
		this.cirrus.update( 0, 0, false );
		G.uCloudPanoOn.value = 0;
		G.uCloudShadowOn.value = 0;
		this.viewValid = 0;
		this.historyValid = false;
		this.panoWarm = true;
	}

	resetHistory() { this.historyValid = false; }
	invalidate() { this.panoWarm = true; this.resetHistory(); }
}

// the main view's clouds for the dome: the reconstructed history looked up with the camera it was resolved
// for; outside it the panorama (Tidewater SkyProClouds.js cloudsSampleView)
export const CLOUD_VIEW_GLSL = /* glsl */`
	uniform sampler2D uCloudView; uniform vec3 uCvRight; uniform vec3 uCvUp; uniform vec3 uCvFwd; uniform vec2 uCvTan; uniform float uCvValid;
	// uv of dir in the view history; false outside it
	bool cloudsViewUv( vec3 dir, out vec2 uv ) {
		float x = dot( dir, uCvRight );
		float y = dot( dir, uCvUp );
		float z = dot( dir, uCvFwd );
		uv = vec2( x / max( z, 1e-4 ) / uCvTan.x * 0.5 + 0.5, y / max( z, 1e-4 ) / uCvTan.y * 0.5 + 0.5 );
		return uCvValid > 0.5 && z > 0.01 && all( greaterThanEqual( uv, vec2( 0.0 ) ) ) && all( lessThanEqual( uv, vec2( 1.0 ) ) );
	}
	// the cumulus of the view history (rgb in-scatter, a transmittance)
	vec4 cloudsViewAt( vec2 uv, vec3 dir ) {
		vec4 v = max( texture2D( uCloudView, uv ), vec4( 0.0 ) );
		float above = smoothstep( -0.05, -0.03, dir.y );
		return vec4( v.rgb * above, 1.0 - min( v.a, 1.0 ) * above );
	}
	vec4 cloudsSampleView( vec3 dir ) {
		vec2 uv;
		if ( cloudsViewUv( dir, uv ) ) return cloudsViewAt( uv, dir );
		return cloudsPanoSample( dir );
	}
`;
