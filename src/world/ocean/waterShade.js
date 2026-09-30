// Ported from Tidewater src/ocean/WaterMaterial.js (MIT, see LICENSE-Tidewater.txt)
// The sea surface shading: exact dielectric Fresnel, sky reflection tilted by the unresolved slopes with
// horizon occlusion, screen-space reflections, GGX sun glitter, the Snell-refracted water column with
// absorption, single + multiple scattering of the sun and the sky, crest translucency and lit foam.
// GLSL ES 3.0 translation of _shadeWGSL (without the boat hull mask and the RefractionPass image: the
// refracted end point is looked up in the opaque scene copy, as Tidewater does where its image has nothing).

// uniforms the shading needs besides G (Materials.js) and the surface functions
export function waterShadeUniforms( THREE ) {
	return {
		uSceneColor: { value: null }, uSceneDepth: { value: null },
		uProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
		uViewport: { value: new THREE.Vector2( 1, 1 ) }, uCamFar: { value: 1 }, uCamWaterH: { value: 0 },
		uWindU: { value: 7 }, uSSR: { value: 1 },
		// WaterMaterial.js uniforms 71-80 and the Frame water medium (Frame.js 50-52)
		uBackscatter: { value: 0.035 }, uSss: { value: 1.0 }, uWaterRoughness: { value: 0.035 },
		uReflectionStrength: { value: 1.0 }, uFoamIntensity: { value: 1.0 },
		uWaterAbsorption: { value: new THREE.Vector3( 0.42, 0.075, 0.035 ) },
		uWaterScattering: { value: new THREE.Vector3( 0.012, 0.018, 0.024 ) },
	};
}

// helpers: Fresnel, phase, GGX, depth reconstruction, SSR (WaterMaterial.js 17-31, 640-740)
export const WATER_HELPERS_GLSL = /* glsl */`
	uniform sampler2D uSceneColor; uniform highp sampler2D uSceneDepth;
	uniform mat4 uProj; uniform mat4 uCamWorld; uniform vec2 uViewport; uniform float uCamFar; uniform float uCamWaterH;
	uniform float uWindU; uniform float uSSR;
	uniform float uBackscatter; uniform float uSss; uniform float uWaterRoughness; uniform float uReflectionStrength; uniform float uFoamIntensity;
	uniform vec3 uWaterAbsorption; uniform vec3 uWaterScattering;
	#define W_PI 3.141592653589793
	#define W_INV_PI 0.3183098861837907
	const float WATER_IOR = 1.333;
	// a refracted sample is usable when it lies this far behind the water surface (view depth, m)
	const float WATER_BEHIND = 0.05;
	float wSat( float x ) { return clamp( x, 0.0, 1.0 ); }

	// exact unpolarized dielectric Fresnel, cosI > 0, eta = n2 / n1
	float fresnelDielectric( float cosI, float eta ) {
		float c = clamp( cosI, 0.0, 1.0 );
		float g2 = eta * eta - 1.0 + c * c;
		if ( g2 < 0.0 ) return 1.0;
		float g = sqrt( g2 );
		float a = ( g - c ) / ( g + c );
		float b = ( c * ( g + c ) - 1.0 ) / ( c * ( g - c ) + 1.0 );
		return 0.5 * ( a * a ) * ( b * b + 1.0 );
	}
	float waterPhaseHG( float cosT, float g ) {
		float g2 = g * g;
		return ( ( 1.0 - g2 ) / ( 4.0 * W_PI ) ) / pow( max( 1.0 + g2 - cosT * 2.0 * g, 1e-4 ), 1.5 );
	}
	float waterDGGX( float NdH, float a2 ) {
		float d = NdH * NdH * ( a2 - 1.0 ) + 1.0;
		return a2 / ( d * d * W_PI );
	}
	float waterVSmithGGX( float NdL, float NdV, float a2 ) {
		float gv = NdL * sqrt( NdV * NdV * ( 1.0 - a2 ) + a2 );
		float gl = NdV * sqrt( NdL * NdL * ( 1.0 - a2 ) + a2 );
		return 0.5 / max( gv + gl, 1e-5 );
	}
	// opaque depth via exact texel loads
	float waterSceneDepthAt( vec2 uv ) {
		vec2 size = vec2( textureSize( uSceneDepth, 0 ) );
		return texelFetch( uSceneDepth, ivec2( clamp( uv, vec2( 0.0 ), vec2( 0.9999 ) ) * size ), 0 ).r;
	}
	// positive linear view depth of a raw depth value (the projection this frame was drawn with)
	float waterViewDepth( float d ) {
		#if LOGDEPTH == 1
			return exp2( d * log2( uCamFar + 1.0 ) ) - 1.0;
		#elif REVERSED == 1
			return uProj[ 3 ][ 2 ] / ( d + uProj[ 2 ][ 2 ] );
		#else
			return uProj[ 3 ][ 2 ] / ( d * 2.0 - 1.0 + uProj[ 2 ][ 2 ] );
		#endif
	}
	bool waterIsSky( float d ) {
		#if REVERSED == 1 && LOGDEPTH == 0
			return d <= 0.0;
		#else
			return d >= 1.0;
		#endif
	}
	// view-space position from screen uv and (negative) view Z (includes the TAA jitter)
	vec3 waterViewPos( vec2 uv, float viewZ ) {
		vec2 ndc = uv * 2.0 - 1.0;
		return vec3( ( ndc.x + uProj[ 2 ][ 0 ] ) / uProj[ 0 ][ 0 ], ( ndc.y + uProj[ 2 ][ 1 ] ) / uProj[ 1 ][ 1 ], -1.0 ) * ( - viewZ );
	}
	float waterSceneZAt( vec2 uv ) { return - waterViewDepth( waterSceneDepthAt( uv ) ); }
	vec2 waterProject( vec3 p ) {
		vec4 clip = uProj * vec4( p, 1.0 );
		return clip.xy / max( clip.w, 1e-4 ) * 0.5 + 0.5;
	}

	// March the reflected ray through the opaque depth (view space, geometric steps, then a short
	// bisection). Returns ( color, weight ): weight fades at screen edges, for rays heading back toward
	// the camera and at the end of the search range. y0, ry: world height of the start and the ray's
	// rise per metre. A hit beyond 260 m, or below the water on a descending ray, is weighted 0.
	vec4 waterSSR( vec3 posV, vec3 Rv, float y0, float ry ) {
		bool hit = false;
		// steps grow with the distance: far away the first ones would all land in the same pixel
		float stepScale = max( - posV.z / 60.0, 1.0 );
		float t = 0.15 * stepScale;
		float dt = 0.25 * stepScale;
		float prevT = 0.0;
		for ( int i = 0; i < 11; i ++ ) {
			prevT = t;
			if ( prevT >= 260.0 || ( ry <= 0.0 && y0 + ry * prevT < uWaterLevel - 0.2 ) ) break;
			t += dt;
			dt *= 1.7;
			vec3 p = posV + Rv * t;
			vec2 uv = waterProject( p );
			if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || p.z > -0.1 ) break;
			float sz = waterSceneZAt( uv );
			// behind the visible surface, within a thickness covering the last step
			if ( p.z < sz && sz - p.z < max( dt * 1.3, max( t * 0.08, 0.3 ) ) ) { hit = true; break; }
		}
		vec3 color = vec3( 0.0 );
		float weight = 0.0;
		if ( hit ) {
			// refine between the last miss and the hit
			float a = prevT; float b = t;
			for ( int k = 0; k < 3; k ++ ) {
				float m = ( a + b ) * 0.5;
				vec3 p = posV + Rv * m;
				bool behind = p.z < waterSceneZAt( waterProject( p ) );
				b = behind ? m : b;
				a = behind ? a : m;
			}
			float hitT = b;
			vec3 hitV = posV + Rv * b;
			vec2 uv = waterProject( hitV );
			// the ray must really touch the surface there (a ray that only passed far behind a thin or
			// distant object is a false hit)
			float gap = abs( waterSceneZAt( uv ) - hitV.z );
			float touch = smoothstep( max( b * 0.04, 0.4 ), max( b * 0.02, 0.2 ), gap );
			// anything under the surface is not visible to a reflected ray: those rays run into the next wave
			float hitY = ( uCamWorld * vec4( hitV, 1.0 ) ).y;
			color = texture2D( uSceneColor, uv ).rgb;
			float edge = smoothstep( 0.0, 0.06, uv.x ) * smoothstep( 1.0, 0.94, uv.x ) * smoothstep( 0.0, 0.06, uv.y ) * smoothstep( 1.0, 0.94, uv.y );
			float facing = smoothstep( 0.5, 0.1, Rv.z ); // rays toward the camera leave the screen
			weight = edge * facing * touch * smoothstep( 260.0, 120.0, hitT ) * smoothstep( uWaterLevel - 0.15, uWaterLevel + 0.35, hitY );
		}
		return vec4( color, weight );
	}
`;

// The shading (WaterMaterial.js _shadeWGSL 211-600). Expects in scope: pos (world), lagXZ, vDepth,
// vHeight, surf (WaterSurfaceFrag: normal, foam, rough, aeration, jacobian), groundH (seabed height
// under the pixel), and writes outCol. seenFromBelow is set for the caller.
export const WATER_SHADE_GLSL = /* glsl */`
	vec2 screenUV = gl_FragCoord.xy / uViewport;
	vec3 posV = ( viewMatrix * vec4( pos, 1.0 ) ).xyz;
	vec3 toCam = cameraPosition - pos;
	float dist = length( toCam );
	vec3 V = toCam / dist;
	vec3 L = uSunDir;
	// the sun light reaching the surface: key light x cascades (5-tap PCF: the waves break up any
	// penumbra detail) x clouds x the island's own shadow
	vec3 sunLight = uSunColor * mix( 1.0, sunShadowPCF( pos, vec3( 0.0, 1.0, 0.0 ) ) * terrainSunShadowAt( pos ), uCloudShadowK ) * cloudShadowAt( pos );

	// water film thickness at this pixel (no swash sheet: shore waves are not in yet)
	float thickness = pos.y - groundH;
	float frontD = 1e3;
	float uprush = 0.0;
	float lipW = 0.0;

	vec4 whaleW = vec4( 0.0 );
	float foam = surf.foam;

	// which medium is the view ray in before it reaches this fragment? front faces are seen from the air;
	// in folds of the surface, and away from it, the camera's own medium decides
	float camH = cameraPosition.y - uCamWaterH;
	bool folded = surf.jacobian < 0.1;
	bool nearSurface = abs( camH ) < 1.5;
	bool viewFromBelow = ( nearSurface && ! folded ) ? ! gl_FrontFacing : camH < 0.0;
	seenFromBelow = viewFromBelow ? 1.0 : 0.0;
	// shading normal on the viewer's side; facets that face away are bent to grazing instead of flipped
	vec3 Nup = surf.normal;
	vec3 Nside = viewFromBelow ? - Nup : Nup;
	vec3 Nview = normalize( Nside + V * max( - dot( Nside, V ) + 0.03, 0.0 ) );

	// roughness from unresolved slope variance (Cox-Munk: mss = 0.003 + 0.00512 U)
	float mss = ( 0.003 + uWindU * 0.00512 ) * uSlopeScale;
	float kpx = W_PI / footprint;
	float unresolved = wSat( log2( 110.0 / kpx ) / 9.0 );
	float roughVar = surf.rough * surf.rough;
	float alpha2 = uWaterRoughness * uWaterRoughness + mss * 2.0 * unresolved * roughVar + foam * 0.2 + surf.aeration * 0.03;
	// slope spread the mesh / normal maps can't show at this distance (for the reflection)
	float sigmaUnres = sqrt( mss * unresolved * roughVar );

	vec3 outCol = vec3( 0.0 );
	if ( ! viewFromBelow ) {
		// ================= ABOVE WATER =================
		vec3 N = Nview;
		float NdV = max( dot( N, V ), 1e-4 );
		float F = fresnelDielectric( NdV, WATER_IOR );

		// ---- reflection: unresolved facets tilt the average reflection toward the higher, darker sky
		vec3 Rraw = reflect( - V, N );
		float Rup = max( Rraw.y, 0.004 ) + sigmaUnres * 1.3 * ( 1.0 - max( Rraw.y, 0.0 ) );
		vec3 R = normalize( vec3( Rraw.x, Rup, Rraw.z ) );
		// reflections pointing below the horizon hit other waves: fade toward a dark sea colour
		float horizonOcc = max( smoothstep( -0.12, 0.08, Rraw.y ), smoothstep( 0.25, 0.06, thickness ) );
		vec3 skyRefl = vec3( 0.0 );
		if ( horizonOcc > 0.0 || frontD < 0.1 ) skyRefl = skyReflectionRadiance( R );
		vec3 reflCol = mix( uHorizon * 0.35, skyRefl, horizonOcc );
		// objects reflected from the screen; only rays close to the horizon can hit anything
		#if WQ > 0
		if ( Rraw.y < 0.45 && F > 0.05 && uSSR > 0.5 ) {
			vec3 Rv = normalize( ( viewMatrix * vec4( Rraw, 0.0 ) ).xyz );
			if ( Rv.z < 0.5 ) {
				vec4 r = waterSSR( posV, Rv, pos.y, Rraw.y );
				reflCol = mix( reflCol, r.rgb, r.a );
			}
		}
		#endif
		reflCol *= uReflectionStrength;

		// ---- sun specular (GGX), the sun light already includes shadowing
		vec3 H = normalize( L + V );
		float NdL = max( dot( N, L ), 0.0 );
		float NdH = max( dot( N, H ), 0.0 );
		float VdH = max( dot( V, H ), 0.0 );
		float Fs = fresnelDielectric( VdH, WATER_IOR );
		float spec = waterDGGX( NdH, alpha2 ) * waterVSmithGGX( NdL, NdV, alpha2 ) * Fs * NdL;
		// physically the glint is ~1e5x brighter than the sky; clamp to stay inside fp16 range
		vec3 sunSpec = sunLight * min( spec, 400.0 );

		// ---- refraction / water volume: the refracted view ray (Snell) traced to the sea floor; at grazing
		// angles the straight screen ray overestimates the water path ~10x
		vec3 Tr = refract( - V, N, 1.0 / WATER_IOR );
		vec3 Tv = normalize( vec3( Tr.x, min( Tr.y, -0.08 ), Tr.z ) );
		float tDown = max( - Tv.y, 0.04 );
		float surfViewZ = posV.z;
		// water column below the surface along the refracted ray (the seabed heights from the opaque
		// depth, 2 refinements)
		float L0 = max( pos.y - groundH, 0.0 ) / tDown;
		float Lt = L0;
		if ( L0 < 100.0 ) {
			float L1 = max( pos.y - waterGroundAt( pos + Tv * min( L0, 200.0 ), groundH, posV.z, pos.y ), 0.0 ) / tDown;
			Lt = max( pos.y - waterGroundAt( pos + Tv * min( L1 * 0.5 + L0 * 0.5, 200.0 ), groundH, posV.z, pos.y ), 0.0 ) / tDown;
		}
		float Lter = clamp( Lt, 0.0, 400.0 );
		float crestT = 1e4;

		// project the refracted end point to the screen
		vec3 pEnd = pos + Tv * min( Lter, 80.0 );
		vec2 uvR = waterProject( ( viewMatrix * vec4( pEnd, 1.0 ) ).xyz );
		bool onScreen = all( greaterThan( uvR, vec2( 0.0 ) ) ) && all( lessThan( uvR, vec2( 1.0 ) ) );
		// the opaque copy where the refracted sample lies behind the water surface, else the unrefracted pixel
		float dO = waterSceneDepthAt( uvR );
		bool valid = onScreen && surfViewZ + waterViewDepth( dO ) > WATER_BEHIND;
		vec2 uvF = valid ? uvR : screenUV;
		float dR = valid ? dO : waterSceneDepthAt( screenUV );
		vec3 sceneCol = texture2D( uSceneColor, uvF ).rgb;

		// objects in front of the sea floor (piles, rocks, reef) shorten the path
		vec3 qView = waterViewPos( uvF, - waterViewDepth( dR ) );
		float qDist = length( qView - posV );
		float pathLen = clamp( min( Lter, qDist ), 0.0, 400.0 );
		pathLen = min( pathLen, crestT );

		// bubbles mixed into the water (surf, wakes): a strong scatterer, milky turquoise
		float aer = surf.aeration;
		vec3 sigA = uWaterAbsorption;
		vec3 sigS = uWaterScattering + aer * 1.6;
		vec3 sigT = sigA + sigS;

		// refracted sun direction (toward the sun from underwater)
		vec3 Ls = - refract( - L, vec3( 0.0, 1.0, 0.0 ), 1.0 / WATER_IOR );
		float muS = max( Ls.y, 0.1 );
		float muV = max( - Tv.y, 0.15 );
		vec3 Tview = exp( - sigT * pathLen );

		// in-scattered light along the view ray (single scattering sun + ambient), analytic:
		// light at depth z is E0 exp( -sigT z / mu ); along the view ray z = s muV
		vec3 sunIn = sunLight * ( 1.0 - fresnelDielectric( max( L.y, 0.02 ), WATER_IOR ) );
		vec3 kSun = sigT * ( 1.0 + muV / muS );
		vec3 kAmb = sigT * ( 1.0 + muV / 0.75 );
		float cosPh = dot( Tv, Ls );
		float phase = waterPhaseHG( cosPh, 0.86 ) * 0.7 + 0.3 / ( 4.0 * W_PI );
		vec3 bb = sigS * mix( uBackscatter, 0.06, wSat( aer * 2.0 ) );
		// multiple-scattering boosted backscatter (Gordon R = 0.33 bb / ( a + bb ))
		vec3 albedoMS = bb * ( 0.33 * 4.0 ) / ( sigA + bb );
		vec3 inSun = sunIn * ( sigS * phase + albedoMS * sigT * W_INV_PI ) * ( 1.0 - exp( - kSun * pathLen ) ) / kSun;
		vec3 inAmb = uSkyIrr * ( sigS * 0.25 + albedoMS * sigT ) * ( 1.0 - exp( - kAmb * pathLen ) ) / kAmb;

		// crest translucency (sun shining through thin wave tips; side-lit waves glow green too)
		vec2 vH = normalize( V.xz + 1e-5 );
		vec2 lH = normalize( L.xz + 1e-5 );
		float back = pow( wSat( dot( vH, - lH ) * 0.6 + 0.4 ), 2.5 );
		float crest = wSat( vHeight * 0.9 + 0.1 ) * ( wSat( ( 1.0 - N.y ) * 4.0 ) + 0.25 );
		vec3 sssCol = vec3( 0.12, 0.55, 0.45 ) * 0.06;
		vec3 sss = sunLight * sssCol * back * crest * uSss * smoothstep( 0.0, 0.25, L.y );

		vec3 transmitted = sceneCol * Tview * ( 1.0 - 0.3 * lipW ) + inSun + inAmb + sss;

		// ---- foam: bright diffuse scatterer (albedo ~0.85), wrapped sun + sky irradiance (E / PI)
		vec3 foamLit = WATER_FOAM_LIGHT;
		vec3 foamCol = foamLit * uFoamIntensity;

		float rim = smoothstep( 0.0, 0.025, frontD ) * smoothstep( 0.1, 0.035, frontD ) * uprush;
		vec3 water = mix( transmitted, reflCol, F ) + sunSpec + skyRefl * ( 0.22 * rim );
		vec3 shaded = mix( water, foamCol + sunSpec * 0.05, wSat( foam ) );
		// fade into the sand right at the leading edge (anti-aliased by the film thickness)
		float edgeAA = smoothstep( 0.0, max( fwidth( thickness ) * 1.5, 0.004 ), thickness );
		outCol = shaded;
		if ( edgeAA < 1.0 ) {
			float contact = smoothstep( -0.16, -0.005, frontD ) * ( 1.0 - edgeAA ) * uprush;
			vec3 sandC = texture2D( uSceneColor, screenUV ).rgb * ( 1.0 - 0.3 * contact );
			outCol = mix( sandC, shaded, edgeAA );
		}
	} else {
		// ================= BELOW WATER (looking up at the surface) =================
		vec3 N = Nview;
		float NdV = max( dot( N, V ), 1e-4 );
		// from water ( n = 1.333 ) into air
		float F = fresnelDielectric( NdV, 1.0 / WATER_IOR );
		vec3 Tt = refract( - V, N, WATER_IOR );
		bool tValid = dot( Tt, Tt ) > 0.5;
		vec3 Td = normalize( tValid ? Tt : vec3( 0.0, 1.0, 0.0 ) );
		// sky through Snell's window
		vec3 skyT = min( skyReflectionRadiance( Td ), vec3( 60.0 ) );
		// total internal reflection mirrors the lit water body below: the radiance of an infinitely long
		// view ray through the medium in the reflected direction
		vec3 sigA = uWaterAbsorption; vec3 sigS = uWaterScattering; vec3 sigT = sigA + sigS;
		vec3 bb = sigS * uBackscatter;
		vec3 albedoMS = bb * ( 0.33 * 4.0 ) / ( sigA + bb );
		vec3 Rr = reflect( - V, N );
		vec3 LsU = - refract( - L, vec3( 0.0, 1.0, 0.0 ), 1.0 / WATER_IOR );
		float muU = max( LsU.y, 0.15 );
		float phR = waterPhaseHG( dot( Rr, LsU ), 0.86 ) * 0.7 + 0.3 / ( 4.0 * W_PI );
		vec3 kS = sigT * ( 1.0 - min( Rr.y, 0.0 ) / muU );
		vec3 kA = sigT * ( 1.0 - min( Rr.y, 0.0 ) / 0.8 );
		vec3 eSunU = sunLight * ( 1.0 - fresnelDielectric( max( L.y, 0.02 ), WATER_IOR ) );
		vec3 deepCol = eSunU * ( sigS * phR + albedoMS * sigT * W_INV_PI ) / kS
			+ uSkyIrr * W_PI * ( sigS * ( 1.0 / ( 4.0 * W_PI ) ) + albedoMS * sigT * W_INV_PI ) / kA;
		// objects above the water seen through Snell's window (from the viewport)
		float sceneDepthC = waterSceneDepthAt( screenUV );
		float sceneZ = - waterViewDepth( sceneDepthC );
		bool hasObj = posV.z - sceneZ > 0.0 && sceneZ > - uCamFar * 0.9;
		vec3 objCol = texture2D( uSceneColor, screenUV ).rgb;
		vec3 transmittedU = hasObj ? objCol : skyT;
		vec3 foamUnder = ( uSkyIrr + sunLight * 0.5 ) * 0.25;
		outCol = mix( transmittedU * ( 1.0 - F ) + deepCol * F, foamUnder, wSat( foam ) * 0.7 );
	}
	outCol = min( outCol, vec3( 16000.0 ) );
`;

// foam lighting without the surf-foam shading (WaterMaterial.js 541)
export const FOAM_LIGHT_SIMPLE = '( ( sunLight * ( max( dot( N, L ), 0.0 ) * 0.75 + 0.25 ) * W_INV_PI + uSkyIrr * 0.95 ) * 0.85 )';
