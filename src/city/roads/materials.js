// Materials of the roads module. Every lit material goes through patchMaterial (aerial fog, cloud shadows,
// rain wetness); the road markings, wear, cracks, patches and puddles are procedural in the road shader so a
// whole street cell is one draw call.
//
// All of them share the same distance-growing depth pull: vertices slide towards the camera along the view
// ray (screen position unchanged) by ~0.3 % of their distance past 40 m. That keeps the road surfaces ahead
// of the coarser terrain LOD far away while standing objects on the road (whose depth grows much faster along
// a grazing ray) are practically unaffected.
import * as THREE from 'three';
import { G, COMMON_GLSL, SHARED_PARS, patchMaterial, tex } from '../../render/Materials.js';
import { noiseTexture, crackTexture, signAtlas, decalAtlas, ATLAS_H } from './textures.js';
import { ATLAS_SIZE, CAR_DIMS } from './kinds.js';
import { carLook } from './cars.js';

// Coarse terrain LODs rise above the road beds by up to ~0.1 m at 250 m, ~0.4 m at 500 m and ~1.4 m at 1 km (99th
// percentile over every highway, measured against the terrain's triangle grids), so far vertices are also lifted by
// that much (0 within 120 m, where shadows and gameplay happen). uRoadLift scales it with the terrain detail
// setting; `sign` lets the buried shoulder columns of a ribbon sink instead of rise.
export const ROAD_LIFT = { value: 1 };
export function pullGLSL( sign = '1.0' ) {
	return /* glsl */`
	vec4 mvPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		mvPosition = batchingMatrix * mvPosition;
	#endif
	#ifdef USE_INSTANCING
		mvPosition = instanceMatrix * mvPosition;
	#endif
	mvPosition = modelViewMatrix * mvPosition;
	{
		float pd = length( mvPosition.xyz );
		float lift = ( max( pd - 120.0, 0.0 ) * 0.0008 + max( pd - 400.0, 0.0 ) * 0.0012 ) * uRoadLift * ( ${sign} );
		mvPosition.xyz += ( viewMatrix * vec4( 0.0, lift, 0.0, 0.0 ) ).xyz;
		mvPosition.xyz *= 1.0 - max( pd - 40.0, 0.0 ) * 0.003 / max( pd, 1.0 );
	}
	gl_Position = projectionMatrix * mvPosition;
`;
}
export const PULL_GLSL = pullGLSL();

// swap the projection for the pulled one (patchMaterial keeps its world-position block after the include)
function pull( shader, sign ) {
	shader.uniforms.uRoadLift = ROAD_LIFT;
	shader.vertexShader = shader.vertexShader
		.replace( '#include <common>', '#include <common>\nuniform float uRoadLift;' )
		.replace( '#include <project_vertex>', pullGLSL( sign ) );
}

// declarations go right before main(), after three's and patchMaterial's common code
function beforeMain( src, code ) { return src.replace( 'void main() {', code + '\nvoid main() {' ); }

// AA helpers shared by the surface shaders
const LINES_GLSL = /* glsl */`
	// coverage of the band |x| < hw given the pixel footprint fw of x, fading to its average when sub-pixel
	float bandAA( float x, float hw, float fw ) {
		fw = max( fw, 1e-4 );
		return ( 1.0 - smoothstep( hw - fw, hw + fw, abs( x ) ) ) * min( 1.0, 2.0 * hw / fw );
	}
	float lineAA( float x, float hw ) { return bandAA( x, hw, fwidth( x ) ); }
	float boxAA( float x, float a, float b ) { return lineAA( x - ( a + b ) * 0.5, ( b - a ) * 0.5 ); }
	// periodic bands (stripes, ticks, keys): the footprint comes from the continuous coordinate, so the wrap of
	// the period never shows as a seam of half-covered pixels
	float stripeAA( float s, float period, float center, float hw ) {
		float fw = fwidth( s );
		float x = mod( s - center + period * 0.5, period ) - period * 0.5;
		return mix( bandAA( x, hw, fw ), 2.0 * hw / period, smoothstep( period * 0.25, period, fw * 2.0 ) );
	}
	float dashAA( float s, float period, float on ) { return stripeAA( s, period, on * 0.5, on * 0.5 ); }
`;

// A failing lamp: mostly on with short drop-outs and long dark spells. Built from a few sines of a wrapped time
// so the GPU (float32) and the CPU twin below agree: the real light the module hangs under the nearest
// flickering lamp blinks with its bulb.
const FLICKER_GLSL = /* glsl */`
	float flickerAt( float seed ) {
		float t = mod( uTime, 628.3185 );
		float w = sin( t * 13.0 + seed * 40.0 ) + 0.8 * sin( t * 31.7 + seed * 17.0 ) + 0.6 * sin( t * 5.3 + seed * 3.1 );
		float dead = step( 0.72, fract( t * 0.11 + seed * 3.7 ) );
		return step( - 0.9, w ) * ( 1.0 - dead * 0.9 ) * ( 0.85 + 0.15 * sin( t * 50.0 ) );
	}
`;
export function flickerAt( seed, time ) {
	const t = time % 628.3185;
	const w = Math.sin( t * 13 + seed * 40 ) + 0.8 * Math.sin( t * 31.7 + seed * 17 ) + 0.6 * Math.sin( t * 5.3 + seed * 3.1 );
	const f = t * 0.11 + seed * 3.7;
	const dead = f - Math.floor( f ) >= 0.72 ? 1 : 0;
	return ( w >= - 0.9 ? 1 : 0 ) * ( 1 - dead * 0.9 ) * ( 0.85 + 0.15 * Math.sin( t * 50 ) );
}

let _cache = null;
export function roadMaterials() {
	if ( _cache ) return _cache;
	_cache = {
		road: makeRoadMaterial(), walk: makeWalkMaterial(), kit: makeKitMaterial(), fence: makeFenceMaterial(), wire: makeWireMaterial(),
		prop: makePropMaterial(), decal: makeDecalMaterial(), glow: makeGlowMaterial(), sign: makeSignMaterial(),
	};
	return _cache;
}

// ---- road surfaces ----------------------------------------------------------------------------------------------

function makeRoadMaterial() {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.9, metalness: 0 } );
	const U = {
		tAsph: { value: tex( 'asphalt_d' ) }, tAsphN: { value: tex( 'asphalt_n', { srgb: false } ) },
		tDirt: { value: tex( 'dirt_d' ) }, tConc: { value: tex( 'concrete_d' ) }, tWalk: { value: tex( 'sidewalk_d' ) },
		tNoise: { value: noiseTexture() }, tCrack: { value: crackTexture() }, tAtlas: { value: signAtlas() },
	};
	patchMaterial( mat, 'roads-road', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh, 'abs( rd.x ) > rd.w * 0.5 + 0.05 && rd.z < 2.5 ? - 1.0 : 1.0' );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec4 rd; attribute vec4 rd2; varying vec4 vRd; varying vec4 vRd2; varying vec3 vWN;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvRd = rd; vRd2 = rd2; vWN = normal;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, /* glsl */`
			uniform sampler2D tAsph, tAsphN, tDirt, tConc, tWalk, tNoise, tCrack, tAtlas;
			varying vec4 vRd; varying vec4 vRd2; varying vec3 vWN;
			${LINES_GLSL}
			float digitMask( float d, vec2 g ) {
				if ( g.x < 0.0 || g.x > 1.0 || g.y < 0.0 || g.y > 1.0 ) return 0.0;
				vec2 px = vec2( d * 64.0 + 4.0 + g.x * 56.0, 1280.0 + ( 1.0 - g.y ) * 96.0 );
				return texture2D( tAtlas, vec2( px.x / ${ATLAS_SIZE}.0, 1.0 - px.y / ${ATLAS_H}.0 ) ).r;
			}
		` );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <map_fragment>', /* glsl */`
				float rRough = 0.9;
				float rMetal = 0.0;
				vec3 rNT = vec3( 0.0 );
				float rNS = 0.55;
				float rEnv = 1.0;
				{
					float cls = floor( vRd.z + 0.5 );
					float u = vRd.x, s = vRd.y, W = vRd.w, hw = W * 0.5, au = abs( u );
					vec2 wp = vWorldPos.xz;
					vec3 a1 = texture2D( tAsph, wp * 0.21 ).rgb;
					vec3 a2 = texture2D( tAsph, vec2( wp.y, - wp.x ) * 0.071 + 0.37 ).rgb;
					vec4 nz = texture2D( tNoise, wp * 0.0125 );
					vec4 nf = texture2D( tNoise, wp * 0.09 );
					vec4 nh = texture2D( tNoise, wp * 0.8 );
					vec3 col = mix( a1, a2, 0.3 + 0.35 * nf.r );
					col *= 0.8 + 0.36 * nz.r + ( nf.g - 0.5 ) * 0.14;
					// sun-bleached old asphalt vs darker fresh overlays
					col = mix( col * vec3( 0.86, 0.87, 0.9 ), col * vec3( 1.1, 1.07, 1.0 ), smoothstep( 0.3, 0.7, nz.g ) );
					rNT = texture2D( tAsphN, wp * 0.21 ).xyz * 2.0 - 1.0;
					vec2 cr = texture2D( tCrack, wp / 14.0 ).rg;
					float crackAmt = smoothstep( 0.6, 1.05, nz.b + nz.r * 0.45 ) * 0.9 + 0.1;
					float paint = 0.0, yel = 0.0, gravel = 0.0, edgeWet = 0.0;
					vec3 paintCol = vec3( 0.74, 0.74, 0.7 );
					// repaired patches: rectangles of darker, fresher asphalt (no paint on them)
					vec2 pc = vec2( floor( s / 9.0 ), floor( ( u + 40.0 ) / 3.3 ) );
					vec2 pf = vec2( fract( s / 9.0 ), fract( ( u + 40.0 ) / 3.3 ) );
					float ph = hash12( pc + vec2( floor( vRd2.x * 0.37 ), cls * 7.0 ) );
					float patchM = step( ph, 0.04 ) * boxAA( pf.x, 0.08, 0.35 + 0.55 * hash12( pc + 3.1 ) ) * boxAA( pf.y, 0.1, 0.9 );
					// the lines stop short of a junction with a city street or another highway (vRd2.w: distance to it)
					float join = smoothstep( 4.0, 10.0, vRd2.w );
					if ( cls < 0.5 ) {
						// freeway: yellow inner edge by the median, dashed white lane divider, white outer edge
						yel += lineAA( au - 0.95, 0.075 ) * join;
						paint += lineAA( au - 4.4, 0.075 ) * dashAA( s + vRd2.x, 12.0, 3.0 ) * join;
						paint += lineAA( au - 7.9, 0.09 ) * join;
						// the concrete strip under the median barrier (which ends 14 m before a junction)
						col = mix( col, texture2D( tConc, wp * 0.3 ).rgb * 0.95, ( 1.0 - smoothstep( 0.5, 0.62, au ) ) * smoothstep( 13.0, 14.0, vRd2.w ) );
						// the outer shoulder is older and cracked, with rumble strips
						float sh = smoothstep( 7.95, 8.05, au );
						col *= 1.0 - sh * ( 0.08 + 0.1 * step( 0.5, fract( s * 1.6 ) ) * step( au, 8.4 ) );
						crackAmt = max( crackAmt, sh * 0.8 );
						col *= 1.0 - 0.07 * ( exp( - pow( ( au - 2.65 ) / 0.35, 2.0 ) ) + exp( - pow( ( au - 6.15 ) / 0.35, 2.0 ) ) );
						gravel = smoothstep( hw - 0.02, hw + 0.3, au );
						edgeWet = smoothstep( 7.2, 8.4, au );
					} else if ( cls < 1.5 ) {
						// two-lane highway: double yellow centre (one side dashed in passing zones), white edges
						float seg = hash12( vec2( floor( ( s + vRd2.x * 17.0 ) / 160.0 ), vRd2.x ) );
						float passA = step( 0.72, seg ), passB = step( seg, 0.18 );
						float dsh = dashAA( s, 12.0, 3.0 );
						yel += ( lineAA( u - 0.11, 0.05 ) * mix( 1.0, dsh, passA ) + lineAA( u + 0.11, 0.05 ) * mix( 1.0, dsh, passB ) ) * join;
						paint += lineAA( au - 3.78, 0.06 ) * join;
						col *= 1.0 - 0.07 * exp( - pow( ( au - 1.95 ) / 0.4, 2.0 ) );
						crackAmt = max( crackAmt, smoothstep( 3.6, 4.2, au ) * 0.7 );
						gravel = smoothstep( hw - 0.05, hw + 0.35, au );
						edgeWet = smoothstep( 3.2, 4.3, au );
					} else if ( cls < 2.5 ) {
						// dirt / rural track: two compacted ruts, grass down the middle, ragged edges into the terrain
						// packed earth: the scan's dried-mud cracks kept small and soft, warmer and darker than the bare texture
						vec3 d1 = texture2D( tDirt, wp * 0.45 ).rgb;
						vec3 d2 = texture2D( tDirt, vec2( wp.y, - wp.x ) * 0.11 ).rgb;
						col = mix( d1, d2, 0.45 );
						col = mix( col, vec3( dot( col, vec3( 0.3, 0.59, 0.11 ) ) ), 0.35 ) * vec3( 0.82, 0.7, 0.56 ) * ( 0.78 + 0.3 * nf.r );
						col = mix( col, col * vec3( 1.35, 0.72, 0.52 ), vRd2.z );
						float rut = exp( - pow( ( au - 0.85 ) / 0.3, 2.0 ) );
						col *= 1.0 - 0.16 * rut;
						rRough = 0.97 - 0.12 * rut;
						float gm = ( 1.0 - smoothstep( 0.2, 0.5, au ) ) * smoothstep( 0.45, 0.7, nf.b * 0.6 + nh.g * 0.6 );
						gm = max( gm, smoothstep( hw - 0.9, hw, au ) * smoothstep( 0.4, 0.6, nh.r ) );
						col = mix( col, vec3( 0.13, 0.2, 0.05 ) * ( 0.7 + 0.6 * nh.b ), gm * 0.8 );
						if ( au > hw - 0.55 + ( nh.g - 0.5 ) * 1.1 ) discard;
						crackAmt = 0.0;
						rNS = 0.35;
						edgeWet = rut;
					} else if ( cls < 3.5 ) {
						// city street
						float kind = floor( vRd2.z + 0.5 );
						float len = vRd2.x;
						float S = kind < 0.5 ? 3.6 : kind < 1.5 ? 3.2 : 0.0;
						float a0 = hw + S, a1 = len - hw - S;
						float pl = kind < 0.5 ? 3.7 : kind < 1.5 ? 3.25 : 0.0;
						if ( kind < 1.5 ) yel += lineAA( au - 0.11, 0.05 );
						else if ( kind > 2.5 ) yel += lineAA( u, 0.06 ) * dashAA( s, 9.0, 3.0 );
						if ( pl > 0.0 ) {
							paint += lineAA( au - pl, 0.05 ) * 0.9;
							// parking stall ticks
							paint += stripeAA( s - a0 + 1.0, 6.5, 3.25, 0.05 ) * boxAA( au, pl, pl + 0.7 ) * 0.9;
						}
						float fl = vRd2.w;
						float bA = mod( fl, 2.0 ), bB = floor( mod( fl * 0.5, 2.0 ) );
						float lane = pl > 0.0 ? pl : hw - 0.3;
						paint += bA * lineAA( s - ( a0 + 0.8 ), 0.22 ) * boxAA( u, - lane, - 0.2 );
						paint += bB * lineAA( s - ( a1 - 0.8 ), 0.22 ) * boxAA( u, 0.2, lane );
						// manhole covers and curb drains
						float mp = mod( s + vRd2.y * 3.0, 37.0 ) - 18.5;
						float mr = length( vec2( mp, u - ( fract( vRd2.y ) < 0.5 ? 1.6 : - 1.6 ) ) );
						float mh = 1.0 - smoothstep( 0.32, 0.345, mr );
						if ( mh > 0.0 ) {
							float grooves = 0.5 + 0.5 * sin( mr * 60.0 );
							col = mix( col, vec3( 0.045, 0.04, 0.036 ) * ( 0.8 + 0.4 * grooves ), mh );
							rRough = mix( rRough, 0.55, mh ); rMetal = mix( rMetal, 0.6, mh );
						}
						float dp = mod( s + vRd2.y * 5.0, 43.0 );
						float drain = boxAA( dp, 0.0, 0.9 ) * smoothstep( hw - 0.45, hw - 0.4, au );
						col = mix( col, vec3( 0.02 ) + 0.03 * step( 0.5, fract( s * 10.0 ) ), drain );
						crackAmt *= 0.8;
						// gutter grime by the curbs
						col *= 1.0 - 0.18 * smoothstep( hw - 0.6, hw, au );
						edgeWet = smoothstep( hw - 0.9, hw - 0.1, au );
						// the travel lanes: an oil-drip streak down the middle of each, tyre-polished wheel paths either side
						float lu = au - ( pl > 0.0 ? pl * 0.5 : hw * 0.5 );
						col *= 1.0 - 0.1 * exp( - lu * lu / 0.12 ) * ( 0.5 + nf.g );
						col *= 1.0 - 0.05 * exp( - pow( ( abs( lu ) - 0.85 ) / 0.3, 2.0 ) );
						// utility trenches cut across one half of the street and patched over
						float tp = s + vRd2.y * 11.0;
						float th = hash12( vec2( floor( tp / 23.0 ), vRd2.y ) );
						patchM = max( patchM, step( 0.8, th ) * boxAA( mod( tp, 23.0 ), 9.0, 9.9 ) * boxAA( u * sign( th - 0.9 ), - 0.3, hw ) * 0.85 );
					} else if ( cls < 4.5 ) {
						// intersection box and its crosswalk stubs; rd = (a, b) in the node frame
						float S = vRd2.x, kind = floor( vRd2.z + 0.5 );
						float aa = abs( vRd.x ), bb = abs( vRd.y );
						// oil darkens the middle of the box
						col *= 1.0 - 0.12 * ( 1.0 - smoothstep( 0.0, hw, max( aa, bb ) ) ) * nf.g;
						if ( S > 0.0 ) {
							float onA = boxAA( aa, hw, hw + S ) * boxAA( bb, - 1.0, hw - 0.25 );
							float onB = boxAA( bb, hw, hw + S ) * boxAA( aa, - 1.0, hw - 0.25 );
							if ( kind < 0.5 ) {
								float inA = boxAA( aa, hw + 0.35, hw + S - 0.35 ), inB = boxAA( bb, hw + 0.35, hw + S - 0.35 );
								paint += onA * inA * stripeAA( vRd.y + hw, 1.2, 0.6, 0.3 );
								paint += onB * inB * stripeAA( vRd.x + hw, 1.2, 0.6, 0.3 );
							} else {
								paint += onA * ( lineAA( aa - ( hw + 0.35 ), 0.15 ) + lineAA( aa - ( hw + S - 0.35 ), 0.15 ) );
								paint += onB * ( lineAA( bb - ( hw + 0.35 ), 0.15 ) + lineAA( bb - ( hw + S - 0.35 ), 0.15 ) );
							}
						}
						s = vRd.x * 0.7 + vRd.y;
						u = vRd.y;
						edgeWet = smoothstep( hw - 0.9, hw, min( aa, bb ) ) * step( hw, max( aa, bb ) );
					} else if ( cls < 5.5 ) {
						// runway: concrete, threshold keys, numbers, touchdown / aiming point bars, dashed centreline
						float len = vRd2.x;
						float sE = min( s, len - s );
						bool farEnd = s > len * 0.5;
						vec3 cc = texture2D( tConc, wp * 0.15 ).rgb;
						col = mix( col, cc * vec3( 0.95, 0.97, 1.0 ), 0.55 );
						paint += lineAA( au - ( hw - 1.2 ), 0.45 ) * step( 3.0, sE );
						paint += lineAA( u, 0.45 ) * dashAA( s - 70.0, 50.0, 30.0 ) * step( 70.0, sE );
						paint += boxAA( sE, 6.0, 36.0 ) * stripeAA( au - 3.0, 3.6, 1.8, 0.9 ) * boxAA( au, 3.0, hw - 3.0 );
						paint += boxAA( sE, 110.0, 140.0 ) * boxAA( au, 3.5, 8.5 );
						paint += ( boxAA( sE, 72.0, 90.0 ) + boxAA( sE, 160.0, 175.0 ) ) * ( boxAA( au, 4.0, 5.2 ) + boxAA( au, 6.4, 7.6 ) );
						paint += lineAA( sE - 3.0, 0.5 ) * step( au, hw - 1.2 );
						float num = farEnd ? vRd2.z : vRd2.y;
						float lx = farEnd ? - u : u;
						vec2 g = vec2( 0.0, ( sE - 42.0 ) / 18.0 );
						if ( num < 9.5 ) paint += digitMask( num, vec2( ( lx + 3.0 ) / 6.0, g.y ) );
						else {
							paint += digitMask( floor( num / 10.0 ), vec2( ( lx + 6.6 ) / 6.0, g.y ) );
							paint += digitMask( mod( num, 10.0 ), vec2( ( lx - 0.6 ) / 6.0, g.y ) );
						}
						// rubber from touchdowns
						float rub = boxAA( sE, 40.0, 230.0 ) * ( 1.0 - smoothstep( 4.0, 11.0, au ) ) * ( 0.4 + 0.6 * nf.g );
						col *= 1.0 - 0.55 * rub;
						paint *= 1.0 - 0.6 * rub;
						col *= 1.0 - 0.25 * smoothstep( hw - 0.1, hw + 0.2, au );
						paint *= step( au, hw );
						crackAmt *= 0.5;
						edgeWet = smoothstep( hw - 2.0, hw, au );
					} else if ( cls < 6.5 ) {
						// taxiway and connectors: yellow centreline, double yellow edges
						yel += lineAA( u, 0.08 );
						if ( vRd2.y < 0.5 ) yel += lineAA( au - ( hw - 0.25 ), 0.075 ) + lineAA( au - ( hw - 0.55 ), 0.075 );
						col *= 1.0 - 0.22 * smoothstep( hw - 0.05, hw + 0.2, au );
						yel *= step( au, hw );
						edgeWet = smoothstep( hw - 1.5, hw, au );
					} else if ( cls < 7.5 ) {
						// far sidewalks
						col = texture2D( tWalk, wp / 3.0 ).rgb * ( 0.9 + 0.2 * nf.r );
						rRough = 0.85;
						crackAmt = 0.0;
					} else if ( cls < 8.5 ) {
						// driveway apron across the sidewalk: broom-finished concrete, a joint down the middle and one
						// along the gutter, tyre grime in two wheel paths (rd2 = along from its start, its width)
						vec3 cc = texture2D( tConc, wp * 0.35 ).rgb;
						col = cc * vec3( 1.04, 1.02, 0.98 ) * ( 0.95 + 0.12 * nf.r );
						float mid = vRd2.x - vRd2.y * 0.5;
						col *= 1.0 - 0.4 * clamp( lineAA( mid, 0.012 ) + lineAA( u - 0.25, 0.012 ), 0.0, 1.0 );
						col *= 1.0 - 0.2 * nf.g * ( exp( - pow( ( abs( mid ) - 0.8 ) / 0.35, 2.0 ) ) );
						rRough = 0.88;
						crackAmt *= 0.3;
						rNS = 0.3;
						edgeWet = 1.0 - smoothstep( 0.0, 0.6, u );
					} else {
						// parking lot: older, sun-bleached asphalt; stall rows of 5.4 m on both sides of 7 m aisles in
						// 17.8 m periods from the back (rd.y), one more single row if it fits; a cross aisle at the far
						// end (rd.x > stalls). rd2 = ( depth, periods + 0.5 single, stalls, driveway position )
						float la = W, lb = vRd2.x, bb = s, a = u;
						float nP = floor( vRd2.y + 0.01 ), single = step( 0.25, fract( vRd2.y ) ), nS = vRd2.z, dA = vRd2.w;
						col = mix( col, col * vec3( 1.1, 1.08, 1.04 ), 0.55 + 0.3 * nz.g );
						crackAmt = max( crackAmt, 0.3 + 0.45 * nz.b );
						float p = floor( bb / 17.8 ), f = bb - p * 17.8;
						float rowF = - 1.0;
						if ( p < nP ) rowF = f < 5.4 ? f : f > 12.4 ? 17.8 - f : - 1.0;
						else if ( single > 0.5 && p < nP + 0.5 && f < 5.4 ) rowF = f;
						float inRow = step( 0.0, rowF );
						float aS = a - 0.4;
						float span = boxAA( aS, - 0.1, nS * 2.6 + 0.1 );
						float sep = stripeAA( aS, 2.6, 0.0, 0.055 ) * boxAA( rowF, 0.0, 5.1 ) * span;
						float kb = clamp( floor( bb / 17.8 + 0.5 ), 0.0, nP );
						float back = lineAA( bb - kb * 17.8, 0.055 ) * span;
						paint += ( sep + back ) * 0.85;
						// no stall paint where the driveway comes in through a row against the street
						paint *= 1.0 - boxAA( a, dA - 3.6, dA + 3.6 ) * step( lb - 6.0, bb );
						// oil dripped in the middle of the stalls, tyre-polished aisles
						float sf = fract( aS / 2.6 ) - 0.5;
						float oh = hash12( vec2( floor( aS / 2.6 ), floor( bb / 5.9 ) ) + la * 0.37 );
						float oil = inRow * span * ( 1.0 - smoothstep( 0.25, 1.0, length( vec2( sf * 2.6 / 0.75, ( rowF - 2.9 ) / 1.25 ) ) ) ) * step( 0.3, oh ) * ( 0.45 + 0.55 * nh.g );
						col *= 1.0 - 0.5 * oil;
						rRough = mix( rRough, 0.5, oil * 0.6 );
						col *= 1.0 - 0.06 * ( 1.0 - inRow ) * nf.g;
						edgeWet = oil * 0.5;
					}
					// cracks and sealed tar snakes
					col *= 1.0 - cr.r * 0.5 * crackAmt;
					col = mix( col, vec3( 0.035, 0.032, 0.03 ), cr.g * 0.6 * crackAmt );
					rRough = mix( rRough, 0.5, cr.g * crackAmt );
					// patches: newer, darker and smoother asphalt, a little blotchy where the roller left it (not a flat shadow)
					col = mix( col, col * ( 0.7 + 0.12 * nh.r ) + vec3( 0.004 ), patchM );
					rNS *= 1.0 - 0.5 * patchM;
					// paint: worn by traffic, flaking in spots
					float wear = smoothstep( 0.12, 0.55, texture2D( tNoise, vec2( s * 0.031, u * 0.23 ) ).g ) * ( 0.55 + 0.45 * smoothstep( 0.2, 0.5, nh.b ) );
					paint = clamp( paint, 0.0, 1.0 ) * wear * ( 1.0 - patchM );
					yel = clamp( yel, 0.0, 1.0 ) * wear * ( 1.0 - patchM );
					col = mix( col, paintCol * ( 0.88 + 0.12 * a1.r ), paint * 0.92 );
					col = mix( col, vec3( 0.62, 0.38, 0.05 ), yel * 0.9 );
					rRough = mix( rRough, 0.6, max( paint, yel ) );
					rNS *= 1.0 - 0.6 * max( paint, yel );
					// gravel shoulders beyond the asphalt edge
					if ( gravel > 0.0 ) {
						vec3 gr = texture2D( tDirt, wp * 0.4 ).rgb * vec3( 0.92, 0.9, 0.86 );
						col = mix( col, gr, gravel );
						rRough = mix( rRough, 0.97, gravel );
					}
					// puddles in the low spots when it rains (and for a while after)
					if ( uWet > 0.02 ) {
						// (in the ruts, the gutters and the dips first; the open surface stays mostly just wet)
						float pn = texture2D( tNoise, wp * 0.031 ).r * 0.6 + nf.g * 0.4 + edgeWet * 0.26;
						float pud = smoothstep( 0.69 - uWet * 0.1, 0.74 - uWet * 0.1, pn ) * smoothstep( 0.05, 0.5, uWet );
						col *= 1.0 - 0.55 * pud;
						// not below ~0.07: a sharper sun highlight overflows the half-float scene target into black specks
						rRough = mix( rRough, 0.07, pud );
						rNS *= 1.0 - pud;
						// the sky dome IBL is dimmer relative to the sunlit ground than the real sky: without a boost the
						// standing water reads as dark stains instead of mirrors of the sky
						rEnv = 1.0 + 0.6 * pud;
						// raindrop rings
						vec2 rp = wp * 2.0;
						vec2 ci = floor( rp );
						float rt = fract( uTime * 0.9 + hash12( ci ) );
						vec2 rv = fract( rp ) - 0.5 - ( vec2( hash12( ci + 1.3 ), hash12( ci + 2.7 ) ) - 0.5 ) * 0.4;
						float rr = length( rv );
						// (only while it is really wet, i.e. still raining; a gentle radial ripple so the tilted normals don't pick up the
						// dark ground in the IBL as black circles)
						float ring = ( 1.0 - smoothstep( 0.0, 0.03, abs( rr - rt * 0.45 ) ) ) * ( 1.0 - rt ) * pud * smoothstep( 0.6, 0.9, uWet );
						rNT.xy += rv / max( rr, 1e-3 ) * ring * 0.12;
						rNS = max( rNS, ring * 0.6 );
					}
					diffuseColor.rgb = col;
				}
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rRough;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = rMetal;' )
			.replace( '#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= rEnv;' )
			.replace( '#include <normal_fragment_maps>', /* glsl */`
				{
					vec3 nw = normalize( normalize( vWN ) + vec3( rNT.x, 0.0, rNT.y ) * rNS );
					normal = normalize( ( viewMatrix * vec4( nw, 0.0 ) ).xyz );
				}` );
	} );
	return mat;
}

// sidewalk slabs, curb stones and faces; wk = ( across, along, face, city angle )
function makeWalkMaterial() {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.85, metalness: 0 } );
	const U = {
		tWalk: { value: tex( 'sidewalk_d' ) }, tWalkN: { value: tex( 'sidewalk_n', { srgb: false } ) }, tConc: { value: tex( 'concrete_d' ) },
		tNoise: { value: noiseTexture() },
	};
	patchMaterial( mat, 'roads-walk', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec4 wk; varying vec4 vWk; varying vec3 vWN;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvWk = wk; vWN = normal;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, /* glsl */`
			uniform sampler2D tWalk, tWalkN, tConc, tNoise;
			varying vec4 vWk; varying vec3 vWN;
		` );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <map_fragment>', /* glsl */`
				float wRough = 0.85;
				vec3 wNT = vec3( 0.0 );
				{
					float face = floor( vWk.z + 0.5 );
					float ca = cos( vWk.w ), sa = sin( vWk.w );
					vec2 wp = vWorldPos.xz;
					vec2 gp = vec2( wp.x * ca + wp.y * sa, - wp.x * sa + wp.y * ca ); // city grid frame
					vec4 nf = texture2D( tNoise, wp * 0.07 );
					vec4 nh = texture2D( tNoise, wp * 0.9 );
					vec3 col;
					if ( face < 0.5 ) {
						col = texture2D( tWalk, gp / 3.0 ).rgb * ( 0.9 + 0.22 * nf.r );
						wNT = texture2D( tWalkN, gp / 3.0 ).xyz * 2.0 - 1.0;
						wNT.xy = vec2( wNT.x * ca - wNT.y * sa, wNT.x * sa + wNT.y * ca );
						// curb stone band along the street edge
						float band = 1.0 - smoothstep( 0.17, 0.2, vWk.x );
						vec3 cs = texture2D( tConc, gp * 0.5 ).rgb * 1.08;
						col = mix( col, cs, band );
						// grime, gum spots, dried stains
						col *= 1.0 - 0.18 * smoothstep( 0.55, 0.85, nf.g ) - 0.1 * step( 0.93, nh.a ) ;
						// painted curbs: red no-parking and yellow loading zones in stretches
						float pc = hash12( floor( vec2( vWk.y / 18.0, vWk.w * 13.0 ) ) );
						if ( pc < 0.14 ) col = mix( col, pc < 0.07 ? vec3( 0.45, 0.06, 0.04 ) : vec3( 0.62, 0.45, 0.06 ), band * 0.85 * smoothstep( 0.25, 0.5, nh.g ) );
						wRough = 0.88 - 0.1 * band;
					} else {
						col = texture2D( tConc, vec2( vWk.y * 0.5, vWorldPos.y * 0.5 ) ).rgb * 1.05;
						float pc = hash12( floor( vec2( vWk.y / 18.0, vWk.w * 13.0 ) ) );
						if ( face < 1.5 && pc < 0.14 ) col = mix( col, pc < 0.07 ? vec3( 0.45, 0.06, 0.04 ) : vec3( 0.62, 0.45, 0.06 ), 0.85 * smoothstep( 0.25, 0.5, nh.g ) );
						// the gutter: dark wet grime at the foot of the curb, soil on the outer face
						col *= 1.0 - 0.45 * smoothstep( - 0.1, - 0.2, vWk.x ) * step( face, 1.5 );
						if ( face > 1.5 ) col *= 0.7;
						wRough = 0.9;
					}
					diffuseColor.rgb = col;
				}
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = wRough;' )
			.replace( '#include <normal_fragment_maps>', /* glsl */`
				{
					vec3 n0 = normalize( vWN );
					vec3 nw = n0.y > 0.7 ? normalize( n0 + vec3( wNT.x, 0.0, wNT.y ) * 0.5 ) : n0;
					normal = normalize( ( viewMatrix * vec4( nw, 0.0 ) ).xyz );
				}` );
	} );
	return mat;
}

// barriers, guardrails, posts and rails built in the worker: vertex colour + (roughness, metalness, concrete)
function makeKitMaterial() {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.8, metalness: 0 } );
	const U = { tConc: { value: tex( 'concrete_d' ) }, tNoise: { value: noiseTexture() }, tRust: { value: tex( 'rust_d' ) } };
	patchMaterial( mat, 'roads-kit', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec3 kc; attribute vec3 kp; varying vec3 vKc; varying vec3 vKp; varying vec3 vWN;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvKc = kc; vKp = kp; vWN = normal;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, /* glsl */`
			uniform sampler2D tConc, tNoise, tRust;
			varying vec3 vKc; varying vec3 vKp; varying vec3 vWN;
		` );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <map_fragment>', /* glsl */`
				vec3 kcol = pow( vKc, vec3( 2.2 ) );
				float kRough = vKp.x, kMetal = vKp.y;
				{
					vec3 wp = vWorldPos;
					vec3 an = abs( normalize( vWN ) );
					vec4 n1 = texture2D( tNoise, wp.xz * 0.2 + wp.y * 0.3 );
					if ( vKp.z > 0.5 ) {
						// concrete: triplanar
						vec3 t = texture2D( tConc, wp.zy * 0.4 ).rgb * an.x + texture2D( tConc, wp.xz * 0.4 ).rgb * an.y + texture2D( tConc, wp.xy * 0.4 ).rgb * an.z;
						// the texture is a warm mid-grey (~0.16 linear): normalise it and keep a little of its hue
						kcol *= mix( vec3( dot( t, vec3( 0.3, 0.59, 0.11 ) ) ), t, 0.35 ) / 0.16;
						// (grime and tyre scuffs at the foot come with the vertex colour)
						kcol *= 0.9 + 0.2 * n1.g;
					} else {
						// galvanised steel with white rust and a few rust streaks
						kcol *= 0.85 + 0.3 * n1.r;
						vec3 rs = vec3( 0.29, 0.1, 0.04 ) * dot( texture2D( tRust, wp.xz * 0.5 + wp.y ).rgb, vec3( 0.3, 0.59, 0.11 ) ) / 0.3;
						float rm = smoothstep( 0.62, 0.8, n1.b );
						kcol = mix( kcol, rs * 0.55, rm );
						kRough = mix( kRough, 0.85, rm ); kMetal = mix( kMetal, 0.2, rm );
					}
				}
				diffuseColor.rgb = kcol;
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = kRough;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = kMetal;' );
	} );
	return mat;
}

// chain-link fabric: diamond mesh with a dithered alpha that averages out smoothly with distance
function makeFenceMaterial() {
	const mat = new THREE.MeshStandardMaterial( { color: 0x9aa0a2, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide } );
	patchMaterial( mat, 'roads-fence', ( sh ) => {
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec2 fuv; varying vec2 vFuv;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvFuv = fuv;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, 'varying vec2 vFuv;' );
		sh.fragmentShader = sh.fragmentShader.replace( '#include <map_fragment>', /* glsl */`
			{
				// 5 cm diamonds (fuv is in units of 0.9 m)
				vec2 q = vFuv * 18.0;
				vec2 d = vec2( q.x + q.y, q.x - q.y );
				vec2 f = abs( fract( d ) - 0.5 );
				float fw = max( fwidth( d.x ), fwidth( d.y ) );
				float wire = 1.0 - smoothstep( 0.5 - 0.09 - fw, 0.5 - 0.09 + fw, min( f.x, f.y ) + 0.5 - max( f.x, f.y ) );
				wire = max( wire, smoothstep( 0.5 - 0.06 - fw, 0.5 - 0.06 + fw, max( f.x, f.y ) ) );
				float cov = mix( wire, 0.3, smoothstep( 0.2, 0.7, fw ) );
				// bottom tension wire and top selvage read as denser
				float thr = fract( dot( gl_FragCoord.xy, vec2( 0.7548776, 0.5698403 ) ) + fract( gl_FragCoord.x * 0.0625 ) );
				if ( cov < thr * 0.999 ) discard;
				diffuseColor.rgb *= 0.9 + 0.2 * hash12( floor( vFuv * 3.0 ) );
			}
		` );
	} );
	return mat;
}

// power lines and barbed wire: 1 px lines, faded by distance to the coverage a ~2 cm cable really has (a full
// pixel at 200 m would read as a thick dark band)
function makeWireMaterial() {
	const mat = new THREE.LineBasicMaterial( { color: 0x121212, transparent: true, depthWrite: false } );
	patchMaterial( mat, 'roads-wire', ( sh ) => {
		pull( sh );
		sh.fragmentShader = sh.fragmentShader.replace( '#include <premultiplied_alpha_fragment>', /* glsl */`
			gl_FragColor.a *= clamp( 14.0 / length( vWorldPos - cameraPosition ), 0.03, 0.95 );
			#include <premultiplied_alpha_fragment>` );
	}, { noWet: true, noCloudShadow: true } );
	return mat;
}

// ---- instanced props: vertex colour + pbr = ( roughness, metalness, flag ) --------------------------------------
// flag: whole part = material class (meshkit T: 1 lamp bulb, 2 timber, 3 concrete, 4 bare / galvanised metal, 5 painted
// metal, 6 plastic, 7 rubber, 8 fabric, 9 retroreflective, 10 hazard stripes, 11 HESCO mesh), + 0.5 takes the tint;
// instance attributes: iTint (rgb), iMisc = ( flicker, seed, dirt, - ). The wear is laid out in the model's own space
// so it stays put on the prop (and differs per instance by its seed).

function makePropMaterial() {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.7, metalness: 0, vertexColors: true } );
	const U = { tNoise: { value: noiseTexture() }, tConc: { value: tex( 'concrete_d' ) } };
	patchMaterial( mat, 'roads-prop', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec3 pbr; attribute vec3 iTint; attribute vec4 iMisc; varying vec3 vPbr; varying vec3 vTint; varying vec4 vMisc; varying vec3 vObj; varying vec3 vObjN;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr; vTint = iTint; vMisc = iMisc; vObj = position; vObjN = normal;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, /* glsl */`
			uniform sampler2D tNoise, tConc;
			varying vec3 vPbr; varying vec3 vTint; varying vec4 vMisc; varying vec3 vObj; varying vec3 vObjN;
			${FLICKER_GLSL}
		` );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <color_fragment>', /* glsl */`#include <color_fragment>
				float pFlag = vPbr.z;
				float pCls = floor( pFlag + 0.01 );
				float pRough = vPbr.x, pMetal = vPbr.y;
				// (a varying constant can come out a hair under its value: compare against the class, not fract)
				if ( pFlag - pCls > 0.25 ) diffuseColor.rgb *= vTint;
				{
					vec3 op = vObj;
					vec3 on = normalize( vObjN );
					float sd = vMisc.y * 17.0;
					vec4 n1 = texture2D( tNoise, vWorldPos.xz * 0.37 + vWorldPos.y * 0.21 );
					vec4 nO = texture2D( tNoise, op.xz * 0.55 + op.y * 0.31 + sd );
					// streaks that run down the prop (rain, rust, grime)
					vec4 nV = texture2D( tNoise, vec2( ( op.x + op.z ) * 2.7 + sd, op.y * 0.07 ) );
					vec3 col = diffuseColor.rgb * ( 0.88 + 0.22 * n1.r );
					vec3 rustC = vec3( 0.14, 0.05, 0.016 ) * ( 0.7 + 0.6 * nO.g );
					if ( pCls > 1.5 && pCls < 2.5 ) {
						// weathered timber: grain along its length, drying checks, a creosote-dark wet butt, sun-greyed top
						float grain = texture2D( tNoise, vec2( ( op.x - op.z ) * 2.3 + sd, op.y * 0.05 ) ).g;
						col *= 0.74 + 0.5 * grain;
						float check = smoothstep( 0.74, 0.8, texture2D( tNoise, vec2( ( op.x + op.z ) * 4.0 + sd, op.y * 0.018 ) ).b );
						col *= 1.0 - 0.6 * check;
						col = mix( col * vec3( 0.5, 0.45, 0.4 ), col, smoothstep( 0.25, 1.7, op.y ) );
						col = mix( col, vec3( dot( col, vec3( 0.3, 0.59, 0.11 ) ) ) * 1.2, smoothstep( 3.0, 9.0, op.y ) * 0.45 );
					} else if ( pCls > 2.5 && pCls < 3.5 ) {
						// concrete: triplanar scan, rain streaks, darker at the foot
						vec3 an = abs( on );
						vec3 t = texture2D( tConc, op.zy * 0.45 + sd ).rgb * an.x + texture2D( tConc, op.xz * 0.45 + sd ).rgb * an.y + texture2D( tConc, op.xy * 0.45 + sd ).rgb * an.z;
						col *= mix( vec3( dot( t, vec3( 0.3, 0.59, 0.11 ) ) ), t, 0.35 ) / 0.16;
						col *= 1.0 - 0.16 * smoothstep( 0.55, 0.85, nV.r );
						col *= 0.85 + 0.15 * smoothstep( 0.0, 0.25, op.y );
					} else if ( pCls > 3.5 && pCls < 4.5 ) {
						// galvanised / bare metal: spangle, white-rust bloom, dark runs, a few rust spots
						col *= 0.9 + 0.2 * texture2D( tNoise, op.xy * 2.3 + op.z * 1.7 + sd ).a;
						col = mix( col, vec3( 0.36, 0.36, 0.34 ), smoothstep( 0.6, 0.8, nO.g ) * 0.3 );
						col *= 1.0 - 0.28 * smoothstep( 0.62, 0.9, nV.r );
						float rs = smoothstep( 0.8, 0.9, nO.b );
						col = mix( col, rustC, rs );
						pRough = mix( pRough, 0.85, rs + 0.2 ); pMetal = mix( pMetal, 0.15, rs );
					} else if ( pCls > 4.5 && pCls < 5.5 ) {
						// painted steel: chipped through to rust at edges and low down, rust weeping below the chips,
						// paint chalky and faded on top
						float chip = smoothstep( 0.7, 0.76, nO.r * 0.75 + nO.b * 0.25 + ( 1.0 - smoothstep( 0.0, 0.35, op.y ) ) * 0.22 );
						col = mix( col, rustC, chip );
						pRough = mix( pRough, 0.9, chip ); pMetal = mix( pMetal, 0.2, chip );
						float run = smoothstep( 0.62, 0.86, nV.b ) * smoothstep( 0.5, 0.72, nO.r );
						col = mix( col, rustC * 1.2, run * 0.45 );
						col = mix( col, vec3( dot( col, vec3( 0.3, 0.59, 0.11 ) ) ) * 1.15 + 0.015, 0.28 * smoothstep( 0.3, 0.9, on.y ) );
					} else if ( pCls > 5.5 && pCls < 6.5 ) {
						// plastic: UV-faded where the sun hits, scuffed
						col = mix( col, vec3( dot( col, vec3( 0.3, 0.59, 0.11 ) ) ) * 1.15 + 0.02, 0.1 + 0.3 * smoothstep( 0.0, 0.9, on.y ) );
						col *= 1.0 - 0.15 * smoothstep( 0.72, 0.9, nO.r );
					} else if ( pCls > 6.5 && pCls < 7.5 ) {
						col = mix( col, vec3( 0.09, 0.085, 0.08 ), 0.45 * smoothstep( 0.2, 0.9, on.y ) );
					} else if ( pCls > 7.5 && pCls < 8.5 ) {
						col *= 0.86 + 0.28 * texture2D( tNoise, op.xy * 7.0 + op.z * 5.0 + sd ).a;
					} else if ( pCls > 9.5 && pCls < 10.5 ) {
						// hazard stripes: orange (or red) and white, sloping down to the middle
						float st = fract( ( abs( op.x ) - op.y ) / 0.32 );
						float w = smoothstep( 0.46, 0.5, st ) - smoothstep( 0.96, 1.0, st );
						col = mix( col, vec3( 0.72, 0.72, 0.68 ), w );
						col *= 1.0 - 0.25 * smoothstep( 0.7, 0.9, nO.r );
					} else if ( pCls > 10.5 && pCls < 11.5 ) {
						// HESCO: beige geotextile behind a 7.6 cm welded wire grid
						vec3 an = abs( on );
						vec2 q = an.x > 0.5 ? op.zy : an.z > 0.5 ? op.xy : op.xz;
						vec2 g = abs( fract( q / 0.076 ) - 0.5 );
						float fw = max( fwidth( q.x ), fwidth( q.y ) ) / 0.076;
						float wire = 1.0 - smoothstep( 0.06 - fw, 0.06 + fw, 0.5 - max( g.x, g.y ) );
						wire = mix( wire, 0.25, smoothstep( 0.15, 0.5, fw ) );
						col *= 0.85 + 0.25 * texture2D( tNoise, q * 3.0 + sd ).g;
						col = mix( col, vec3( 0.2, 0.2, 0.19 ), wire * 0.8 );
						pMetal = wire * 0.6; pRough = mix( pRough, 0.5, wire );
					}
					// dust and debris settle on what faces up
					col = mix( col, vec3( 0.3, 0.28, 0.24 ), smoothstep( 0.6, 0.95, on.y ) * ( 0.1 + 0.3 * nO.g ) * step( pCls, 8.5 ) );
					// grime creeping up from the ground, scaled by the instance's dirt
					col *= 1.0 - vMisc.z * 0.35 * smoothstep( 0.9, 0.0, vObj.y ) * n1.g;
					diffuseColor.rgb = col;
				}
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = pRough;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = pMetal;' )
			.replace( '#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
				if ( pCls > 0.5 && pCls < 1.5 ) {
					float lit = vMisc.x * smoothstep( 0.3, 0.7, uNight ) * flickerAt( vMisc.y );
					totalEmissiveRadiance += vec3( 9.0, 6.4, 3.4 ) * lit;
					diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.85, 0.6 ), lit );
				}
			` );
	} );
	return mat;
}

// ---- ground decals: instance iDec = ( atlas cell, alpha, roughness, - ) --------------------------------------------

function makeDecalMaterial() {
	const mat = new THREE.MeshStandardMaterial( {
		color: 0xffffff, roughness: 0.8, metalness: 0, transparent: true, depthWrite: false,
		polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 4,
	} );
	const U = { tDecal: { value: decalAtlas() } };
	patchMaterial( mat, 'roads-decal', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec2 duv; attribute vec4 iDec; varying vec2 vDuv; varying vec4 vDec;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvDuv = duv; vDec = iDec;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, 'uniform sampler2D tDecal; varying vec2 vDuv; varying vec4 vDec;' );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <map_fragment>', /* glsl */`
				{
					float cell = vDec.x;
					vec2 cuv = ( vec2( mod( cell, 4.0 ), 3.0 - floor( cell / 4.0 ) ) + 0.02 + vDuv * 0.96 ) / 4.0;
					vec4 d = texture2D( tDecal, cuv );
					diffuseColor.rgb = d.rgb;
					diffuseColor.a = d.a * vDec.y;
					if ( diffuseColor.a < 0.01 ) discard;
				}
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vDec.z;' );
	}, { noWet: true } );
	return mat;
}

// additive light pools under the few lamps that still flicker at night
function makeGlowMaterial() {
	const mat = new THREE.ShaderMaterial( {
		uniforms: Object.assign( { tDecal: { value: decalAtlas() }, uRoadLift: ROAD_LIFT }, G ),
		vertexShader: /* glsl */`
			uniform float uRoadLift;
			attribute vec2 duv; attribute vec4 iDec;
			varying vec2 vDuv; varying vec4 vDec; varying vec3 vWorldPos;
			void main() {
				vec3 transformed = position;
				vDuv = duv; vDec = iDec;
				vWorldPos = ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).xyz;
				// 0.3 m towards the eye as well, so the curb and sidewalk (the lamps stand on them) don't cut the pool
				${PULL_GLSL.replace( 'gl_Position =', 'mvPosition.xyz *= max( 0.0, 1.0 - 0.3 / max( length( mvPosition.xyz ), 0.5 ) );\n\t\tgl_Position =' )}
			}`,
		fragmentShader: /* glsl */`
			uniform sampler2D tDecal;
			${SHARED_PARS}
			varying vec2 vDuv; varying vec4 vDec; varying vec3 vWorldPos;
			${COMMON_GLSL}
			${FLICKER_GLSL}
			void main() {
				float lit = smoothstep( 0.3, 0.7, uNight ) * flickerAt( vDec.y ) * vDec.z;
				if ( lit < 0.002 ) discard;
				vec2 cuv = ( vec2( 0.0, 0.0 ) + 0.02 + vDuv * 0.96 ) / 4.0; // cell 12 = column 0, bottom row
				float a = texture2D( tDecal, cuv ).a;
				vec3 c = vec3( 1.0, 0.72, 0.4 ) * a * lit * 0.35;
				// fade with the atmosphere like everything else
				vec3 fogged = atmosphereFog( c, vWorldPos ) - atmosphereFog( vec3( 0.0 ), vWorldPos );
				gl_FragColor = vec4( max( fogged, vec3( 0.0 ) ), 1.0 );
			}`,
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		polygonOffset: true, polygonOffsetFactor: - 3, polygonOffsetUnits: - 6,
	} );
	return mat;
}

// ---- sign boards: unit box, attribute face ( 0 front, 1 back, 2 edge ) + uv; instance iRect ( atlas uv rect ), iSide ( x: double sided )

function makeSignMaterial() {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.45, metalness: 0.1 } );
	const U = { tAtlas: { value: signAtlas() }, tNoise: { value: noiseTexture() } };
	patchMaterial( mat, 'roads-sign', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute float face; attribute vec2 suv; attribute vec4 iRect; attribute vec4 iSide; varying float vFace; varying vec2 vSuv; varying vec4 vRect; varying vec4 vSide;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvFace = face; vSuv = suv; vRect = iRect; vSide = iSide;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, 'uniform sampler2D tAtlas; uniform sampler2D tNoise; varying float vFace; varying vec2 vSuv; varying vec4 vRect; varying vec4 vSide;' );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <map_fragment>', /* glsl */`
				float sMetal = 0.1;
				{
					// shaped signs are cut out of the board by the atlas alpha (the back face sees it mirrored); their
					// thin edge faces would outline the empty square, so shaped boards drop them
					vec2 fuv = vFace < 0.5 || vSide.x > 0.5 ? vSuv : vec2( 1.0 - vSuv.x, vSuv.y );
					if ( vFace < 1.5 && texture2D( tAtlas, mix( vRect.xy, vRect.zw, fuv ) ).a < 0.5 ) discard;
					if ( vFace > 1.5 && vSide.y > 0.5 ) discard;
					vec3 back = vec3( 0.32, 0.33, 0.33 ) * ( 0.8 + 0.4 * texture2D( tNoise, vSuv * 2.0 + vRect.xy * 7.0 ).r );
					vec3 col = back;
					bool front = vFace < 0.5 || ( vFace < 1.5 && vSide.x > 0.5 );
					if ( front ) {
						// the back face's uvs are laid out to read correctly from behind
						col = texture2D( tAtlas, mix( vRect.xy, vRect.zw, vSuv ) ).rgb;
						// retroreflective sheeting reads a bit brighter
						col *= 1.08;
						sMetal = 0.0;
					} else sMetal = 0.5;
					diffuseColor.rgb = col;
				}
			` )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = sMetal;' );
	} );
	return mat;
}

// one highway guide / welcome sign: the same board geometry with its own canvas texture
export function makeDynSignMaterial( texture ) {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.5, metalness: 0.05, map: texture } );
	patchMaterial( mat, 'roads-dynsign', ( sh ) => {
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute float face; attribute vec2 suv; varying float vFace; varying vec2 vSuv;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvFace = face; vSuv = suv;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, 'varying float vFace; varying vec2 vSuv;' );
		sh.fragmentShader = sh.fragmentShader.replace( '#include <map_fragment>', /* glsl */`
			{
				// rounded corners are cut out (the back face sees the canvas mirrored)
				vec4 t = texture2D( map, vFace < 0.5 ? vSuv : vec2( 1.0 - vSuv.x, vSuv.y ) );
				if ( vFace < 1.5 && t.a < 0.5 ) discard;
				if ( vFace < 0.5 ) diffuseColor.rgb *= t.rgb;
				else diffuseColor.rgb = vec3( 0.3, 0.31, 0.31 );
			}
		` );
	} );
	return mat;
}

// the board every sign is drawn with: a unit box (x -0.5..0.5, y -0.5..0.5, z -0.02..0.02) with face / suv attributes
export function signBoardGeometry() {
	const pos = [], nor = [], face = [], uv = [], idx = [];
	const quad = ( p, n, f, uvs ) => {
		const b = pos.length / 3;
		for ( let k = 0; k < 4; k ++ ) { pos.push( ...p[ k ] ); nor.push( ...n ); face.push( f ); uv.push( ...uvs[ k ] ); }
		idx.push( b, b + 1, b + 2, b, b + 2, b + 3 );
	};
	const T = 0.02;
	quad( [ [ - 0.5, - 0.5, T ], [ 0.5, - 0.5, T ], [ 0.5, 0.5, T ], [ - 0.5, 0.5, T ] ], [ 0, 0, 1 ], 0, [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ] );
	quad( [ [ 0.5, - 0.5, - T ], [ - 0.5, - 0.5, - T ], [ - 0.5, 0.5, - T ], [ 0.5, 0.5, - T ] ], [ 0, 0, - 1 ], 1, [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ] );
	quad( [ [ - 0.5, 0.5, T ], [ 0.5, 0.5, T ], [ 0.5, 0.5, - T ], [ - 0.5, 0.5, - T ] ], [ 0, 1, 0 ], 2, [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ] );
	quad( [ [ - 0.5, - 0.5, - T ], [ 0.5, - 0.5, - T ], [ 0.5, - 0.5, T ], [ - 0.5, - 0.5, T ] ], [ 0, - 1, 0 ], 2, [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ] );
	quad( [ [ 0.5, - 0.5, T ], [ 0.5, - 0.5, - T ], [ 0.5, 0.5, - T ], [ 0.5, 0.5, T ] ], [ 1, 0, 0 ], 2, [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ] );
	quad( [ [ - 0.5, - 0.5, - T ], [ - 0.5, - 0.5, T ], [ - 0.5, 0.5, T ], [ - 0.5, 0.5, - T ] ], [ - 1, 0, 0 ], 2, [ [ 0, 0 ], [ 1, 0 ], [ 1, 1 ], [ 0, 1 ] ] );
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( nor, 3 ) );
	g.setAttribute( 'face', new THREE.Float32BufferAttribute( face, 1 ) );
	g.setAttribute( 'suv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	return g;
}

// a flat decal quad (1 x 1 on the xz plane, facing up), slightly subdivided so long skids bend less
export function decalGeometry() {
	const g = new THREE.PlaneGeometry( 1, 1, 1, 4 );
	g.rotateX( - Math.PI / 2 );
	const uv = g.attributes.uv;
	g.setAttribute( 'duv', new THREE.Float32BufferAttribute( Array.from( uv.array ), 2 ) );
	return g;
}

// ---- wrecked cars ----------------------------------------------------------------------------------------------------
// attribute cpart = ( part, roughness, metalness ); instance iCar = ( colour index, rust, burn, flags ), iCar2 = ( seed, - )
// Per body type uniforms: uArch = ( half width, front axle z, rear axle z, wheel radius ), uDoors = front / rear door z
// ranges, uDoorY = ( door bottom, door top, belt, roof ), uLids = trunk / hood z ranges, uLidY = ( trunk min y, hood min y ),
// and what the shader paints on the shell (cars.js carLook): lamps, grille, plates, wheel layout and rim style. The lamps,
// grille, panel gaps, handles, plates and rim patterns are painted here in car-local space, so all three LODs share them.

const PALETTE = [
	0xe8e8e4, 0xa8acaf, 0x5b5f63, 0x16171a, 0x8e1b1b, 0x1f2f55, 0x5d7fa3, 0x2f5a3c, 0xb8a888, 0x5a3d2a, 0xc9a227, 0x2a6b6b,
	0x4e1a22, 0xcbbf9e, 0xb5561d, 0x1e3326, 0x4b5320, 0x9c8a5e, 0x6b6b60, 0x3a3a3a, 0xeceeee, 0xd8d8d8, 0x222222, 0x777777,
];

// the body type of a material's arch data (every type has its own axle layout)
function carTypeOf( u ) {
	if ( u.type !== undefined ) return u.type;
	if ( ! u.arch ) return - 1;
	return CAR_DIMS.findIndex( D => Math.abs( D.zf - u.arch[ 1 ] ) < 1e-4 && Math.abs( D.zr - u.arch[ 2 ] ) < 1e-4 && Math.abs( D.r - u.arch[ 3 ] ) < 1e-4 );
}

const CAR_VERT_PARS = /* glsl */`
	attribute vec3 cpart; attribute vec4 iCar; attribute vec4 iCar2;
	varying vec3 vPart; varying vec4 vCar; varying vec4 vCar2; varying vec3 vLoc; varying vec3 vLocN; varying float vMir;
	uniform vec4 uArch; uniform vec4 uWheel; uniform float uPanel;
`;
const CAR_VERT = /* glsl */`
	vPart = cpart; vCar = iCar; vCar2 = iCar2; vLoc = position; vLocN = normal;
	// a mirrored instance (the left doors) flips the winding: the fragment stage needs it to tell outside from inside
	vMir = 1.0;
	#ifdef USE_INSTANCING
		vMir = determinant( mat3( instanceMatrix ) ) < 0.0 ? - 1.0 : 1.0;
	#endif
	// a flat tyre sags onto the ground and bulges (the placement sank the car by 0.3 r at that corner)
	if ( uPanel < 0.5 && cpart.x > 2.5 && cpart.x < 3.5 && uArch.w > 0.0 ) {
		int fl = int( iCar.w + 0.5 );
		bool front = position.z < ( uArch.y + uArch.z ) * 0.5;
		int bit = front ? ( position.x < 0.0 ? 256 : 512 ) : ( position.x < 0.0 ? 1024 : 2048 );
		if ( ( fl & bit ) != 0 ) {
			float g = uArch.w * 0.3;
			float sq = max( 0.0, g - transformed.y );
			float low = max( 0.0, uArch.w - transformed.y ) / uArch.w;
			transformed.y += sq;
			transformed.x += sign( normal.x ) * ( sq * 0.7 + low * low * 0.035 ) * abs( normal.x );
		}
	}
`;

export function makeCarMaterial( u ) {
	// bodies are single-sided (late depth testing with discard would shade the inside of every shell too); the loose
	// door and lid panels are double-sided (the left doors are mirrored instances)
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.4, metalness: 0.2, vertexColors: true, side: u.panel ? THREE.DoubleSide : THREE.FrontSide } );
	const type = u.panel ? - 1 : carTypeOf( u );
	const L = type >= 0 ? carLook( type ) : null;
	const v4 = ( a ) => ( { value: new THREE.Vector4( ...( a || [ 0, 0, 0, 0 ] ) ) } );
	const U = {
		uPal: { value: PALETTE.map( h => new THREE.Color( h ) ) },
		uArch: v4( u.arch ), uDoors: v4( u.doors ), uDoorY: v4( u.doorY ), uLids: v4( u.lids ), uLidY: v4( u.lidY ),
		uHead: v4( L?.head ), uTail: v4( L?.tail ), uGrille: v4( L?.grille ), uEnds: v4( L?.ends ), uWheel: v4( L?.wheel ), uMisc: v4( L?.misc ),
		uPanel: { value: u.panel ? 1 : 0 },
		tNoise: { value: noiseTexture() }, tRust: { value: tex( 'rust_d' ) },
	};
	patchMaterial( mat, 'roads-car', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\n' + CAR_VERT_PARS )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n' + CAR_VERT );
		sh.fragmentShader = beforeMain( sh.fragmentShader, /* glsl */`
			uniform vec3 uPal[ 24 ];
			uniform vec4 uArch, uDoors, uDoorY, uLids, uLidY, uHead, uTail, uGrille, uEnds, uWheel, uMisc;
			uniform float uPanel;
			uniform sampler2D tNoise, tRust;
			varying vec3 vPart; varying vec4 vCar; varying vec4 vCar2; varying vec3 vLoc; varying vec3 vLocN; varying float vMir;
			${LINES_GLSL}
			float hashC( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
			// a rectangle's coverage with antialiased edges, and its outline
			float rectAA( vec2 p, vec2 a, vec2 b ) { return boxAA( p.x, a.x, b.x ) * boxAA( p.y, a.y, b.y ); }
			// Hawaii's rainbow plate: white, a rainbow arch over three letters and three digits, HAWAII on top
			vec3 plateColor( vec2 uv, float seed ) {
				vec3 c = vec3( 0.8, 0.8, 0.77 );
				float d = length( vec2( uv.x * 0.92, uv.y + 1.45 ) );
				float t = ( d - 1.3 ) / 0.42;
				if ( t > 0.0 && t < 1.0 && uv.y > - 0.35 ) {
					vec3 rb = t < 0.2 ? vec3( 0.75, 0.16, 0.12 ) : t < 0.4 ? vec3( 0.85, 0.5, 0.12 ) : t < 0.6 ? vec3( 0.85, 0.78, 0.25 ) : t < 0.8 ? vec3( 0.3, 0.6, 0.3 ) : vec3( 0.3, 0.4, 0.75 );
					c = mix( c, rb, 0.55 );
				}
				// characters: blocky 3 x 5 glyphs
				if ( abs( uv.x ) < 0.82 && uv.y > - 0.62 && uv.y < 0.3 ) {
					float cell = floor( ( uv.x + 0.82 ) / 0.2343 );
					vec2 g = vec2( fract( ( uv.x + 0.82 ) / 0.2343 ), ( uv.y + 0.62 ) / 0.92 );
					vec2 gi = floor( vec2( ( g.x - 0.15 ) / 0.7 * 3.0, g.y * 5.0 ) );
					bool inG = g.x > 0.15 && g.x < 0.85 && cell != 3.0;
					float on = step( 0.42, hashC( gi + cell * 7.3 + seed * 91.0 ) );
					// a stroke down the left and along the top of most glyphs reads as letters from afar
					if ( gi.x < 0.5 || gi.y > 3.5 ) on = max( on, step( 0.3, hashC( vec2( cell, seed ) ) ) );
					if ( inG ) c = mix( c, vec3( 0.03, 0.04, 0.08 ), on );
				}
				if ( uv.y > 0.48 && uv.y < 0.78 && abs( uv.x ) < 0.36 ) c = mix( c, vec3( 0.1, 0.1, 0.18 ), step( 0.35, fract( uv.x * 8.5 ) ) * 0.8 );
				// the stamped rim
				c *= 1.0 - 0.5 * ( 1.0 - boxAA( uv.x, - 0.95, 0.95 ) * boxAA( uv.y, - 0.9, 0.9 ) );
				return c;
			}
		` );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <color_fragment>', /* glsl */`#include <color_fragment>
				float cRough = vPart.y, cMetal = vPart.z, cEnv = 1.0;
				{
					int part = int( vPart.x + 0.5 );
					int fl = int( vCar.w + 0.5 );
					float rust = vCar.y, burn = vCar.z;
					vec3 lp = vLoc;
					vec3 ln = normalize( vLocN );
					bool outside = gl_FrontFacing == ( vMir > 0.0 );
					vec4 n1 = texture2D( tNoise, lp.xz * 0.35 + lp.y * 0.2 + vCar2.x * 13.0 );
					vec4 n2 = texture2D( tNoise, lp.zy * 1.3 + lp.x * 0.7 + vCar2.x * 7.0 );
					vec3 col = diffuseColor.rgb;
					bool glassPart = part == 5 || part == 6;
					bool body = uPanel < 0.5 && uArch.x > 0.0;
					float lens = 0.0; // lamp lens / plate coverage: no rust or dirt film on it
					if ( part == 0 ) {
						int ci = int( vCar.x + 0.5 );
						col = uPal[ ci ];
						if ( ci == 20 ) col = mix( col, vec3( 0.015, 0.05, 0.3 ), boxAA( lp.y, uDoorY.z - 0.25, uDoorY.z - 0.1 ) * step( 0.5, abs( lp.x ) / max( uArch.x, 0.01 ) ) );
						// TheBus: gold below, orange and red bands, white round the windows
						if ( uMisc.z > 1.5 ) col = lp.y < 0.72 ? vec3( 0.8, 0.46, 0.02 ) : lp.y < 0.84 ? vec3( 0.75, 0.15, 0.01 ) : lp.y < 0.94 ? vec3( 0.42, 0.012, 0.01 ) : vec3( 0.78, 0.78, 0.75 );
						// a week in the sun and salt air: faded, dusty clear coat
						float fade = 0.3 + 0.35 * n1.g;
						col = mix( col, vec3( dot( col, vec3( 0.3, 0.59, 0.11 ) ) ) * 1.08 + 0.015, fade * 0.3 );
						cRough = mix( 0.28, 0.6, n1.r * fade );
					}
					// the cabin trim: charcoal, grey or tan per car (the vertex colour is its shade)
					if ( part == 9 ) {
						float it = fract( vCar2.x * 5.3 );
						col *= it < 0.45 ? vec3( 0.6 ) : it < 0.8 ? vec3( 1.0, 0.98, 0.95 ) : vec3( 1.22, 1.0, 0.72 );
					}
					// ---- what is painted on the shell: lamps, grille, panel gaps, handles, fuel door ----
					if ( body && part <= 1 && outside ) {
						float ax = abs( lp.x );
						float fz = lp.z - uEnds.x, rz = uEnds.y - lp.z;
						if ( fz < 0.22 ) {
							// grille (style: 0 slats, 1 mesh, 2 chrome frame and bars, 3 military slots)
							float g = boxAA( ax, - 1.0, uGrille.z ) * boxAA( lp.y, uGrille.x, uGrille.y ) * ( 1.0 - smoothstep( 0.05, 0.09, fz ) );
							if ( g > 0.0 ) {
								float st = uGrille.w;
								vec3 gc = vec3( 0.012 );
								if ( st < 0.5 ) gc = mix( gc, vec3( 0.07 ), stripeAA( lp.y, 0.035, 0.0, 0.007 ) );
								else if ( st < 1.5 ) gc = mix( gc, vec3( 0.06 ), stripeAA( lp.y, 0.03, 0.0, 0.005 ) * stripeAA( lp.x + floor( lp.y / 0.03 ) * 0.015, 0.03, 0.0, 0.01 ) );
								else if ( st < 2.5 ) {
									float inner = boxAA( ax, - 1.0, uGrille.z - 0.04 ) * boxAA( lp.y, uGrille.x + 0.04, uGrille.y - 0.04 );
									gc = mix( vec3( 0.42, 0.43, 0.45 ), mix( vec3( 0.015 ), vec3( 0.3 ), stripeAA( lp.x, 0.11, 0.0, 0.012 ) ), inner );
									cMetal = mix( cMetal, 0.9, g * ( 1.0 - inner ) );
								} else gc = mix( col, vec3( 0.01 ), stripeAA( lp.x, 0.075, 0.0375, 0.016 ) * boxAA( lp.y, uGrille.x + 0.03, uGrille.y - 0.03 ) );
								col = mix( col, gc, g );
								cRough = mix( cRough, 0.5, g );
								lens = max( lens, g );
							}
							// headlamps: a chrome reflector behind clear glass, a projector ring, amber corner markers
							float hh = boxAA( ax, uHead.z, uHead.w + 0.04 ) * boxAA( lp.y, uHead.x - uHead.y, uHead.x + uHead.y ) * ( 1.0 - smoothstep( 0.12, 0.2, fz ) );
							if ( hh > 0.0 ) {
								float u = ( ax - uHead.z ) / max( uHead.w - uHead.z, 0.01 );
								float v = ( lp.y - uHead.x ) / max( uHead.y, 0.01 );
								vec3 hc = vec3( 0.5, 0.52, 0.54 ) * ( 0.75 + 0.25 * v );
								float ring = 1.0 - smoothstep( 0.45, 0.55, length( vec2( ( u - 0.32 ) * ( uHead.w - uHead.z ) / max( uHead.y, 0.01 ), v ) ) );
								hc = mix( hc, vec3( 0.12, 0.125, 0.13 ), ring * 0.8 );
								hc = mix( hc, vec3( 0.72, 0.32, 0.04 ), step( 0.9, u ) * step( 1.0, u + ( fz > 0.04 ? 1.0 : 0.0 ) ) );
								// the housing's dark edge
								hc *= 0.35 + 0.65 * boxAA( ax, uHead.z + 0.012, uHead.w - 0.006 ) * boxAA( lp.y, uHead.x - uHead.y + 0.01, uHead.x + uHead.y - 0.01 );
								// some are smashed
								if ( fract( vCar2.x * 17.3 + ( lp.x > 0.0 ? 0.5 : 0.0 ) ) < 0.18 ) hc = mix( hc * 0.3, vec3( 0.04 ), step( 0.5, n2.r ) );
								col = mix( col, hc, hh );
								cRough = mix( cRough, 0.06, hh ); cMetal = mix( cMetal, 0.85, hh );
								lens = max( lens, hh );
							}
						}
						if ( rz < 0.22 ) {
							// tail lamps: red lens with a white reverse light inboard and a dark housing edge
							float th = boxAA( ax, uTail.z, uTail.w + 0.04 ) * boxAA( lp.y, uTail.x - uTail.y, uTail.x + uTail.y ) * ( 1.0 - smoothstep( 0.12, 0.2, rz ) );
							if ( th > 0.0 ) {
								float u = ( ax - uTail.z ) / max( uTail.w - uTail.z, 0.01 );
								vec3 tc = mix( vec3( 0.4, 0.015, 0.012 ), vec3( 0.25, 0.008, 0.008 ), stripeAA( lp.y, 0.025, 0.0, 0.004 ) * 0.6 );
								tc = mix( tc, vec3( 0.55, 0.55, 0.53 ), step( u, 0.22 ) * step( lp.y, uTail.x ) );
								tc *= 0.35 + 0.65 * boxAA( ax, uTail.z + 0.01, uTail.w - 0.005 ) * boxAA( lp.y, uTail.x - uTail.y + 0.01, uTail.x + uTail.y - 0.01 );
								col = mix( col, tc, th );
								cRough = mix( cRough, 0.12, th ); cMetal = mix( cMetal, 0.1, th );
								lens = max( lens, th );
							}
						}
						// panel gaps, door handles and the fuel door: hairlines, so only up close (one pair of
						// derivatives for all of them)
						bool closeUp = length( vWorldPos - cameraPosition ) < 40.0;
						vec2 fw = max( vec2( fwidth( lp.z ), fwidth( lp.y ) ), vec2( 1e-4 ) );
						float fwx = max( fwidth( ax ), 1e-4 );
						if ( closeUp && abs( ln.x ) > 0.55 && lp.y > uDoorY.x - 0.04 && lp.y < uDoorY.z + 0.02 ) {
							float gap = 0.0;
							float yIn = step( uDoorY.x, lp.y );
							float yG = bandAA( lp.y - uDoorY.x, 0.003, fw.y );
							if ( uDoors.x < 90.0 ) gap += ( bandAA( lp.z - uDoors.x, 0.003, fw.x ) + bandAA( lp.z - uDoors.y, 0.003, fw.x ) ) * yIn + yG * step( uDoors.x, lp.z ) * step( lp.z, uDoors.y );
							if ( uDoors.z < 90.0 ) gap += ( bandAA( lp.z - uDoors.z, 0.003, fw.x ) + bandAA( lp.z - uDoors.w, 0.003, fw.x ) ) * yIn + yG * step( uDoors.z, lp.z ) * step( lp.z, uDoors.w );
							col *= 1.0 - 0.75 * clamp( gap, 0.0, 1.0 );
							float hy = bandAA( lp.y - ( uDoorY.z - 0.1 ), 0.022, fw.y );
							float hdl = 0.0;
							if ( uDoors.x < 90.0 ) hdl += bandAA( lp.z - ( uDoors.y - 0.17 ), 0.07, fw.x );
							if ( uDoors.z < 90.0 ) hdl += bandAA( lp.z - ( uDoors.w - 0.17 ), 0.07, fw.x );
							col = mix( col, uMisc.y > 0.5 ? vec3( 0.03 ) : mix( vec3( 0.02 ), vec3( 0.3 ), step( 0.4, fract( vCar2.x * 5.1 ) ) ), clamp( hdl, 0.0, 1.0 ) * hy );
							// the fuel door on the rear quarter
							if ( ( lp.x > 0.0 ) == ( fract( vCar2.x * 3.7 ) < 0.5 ) && uDoors.x < 90.0 ) {
								vec2 d = abs( vec2( lp.z, lp.y ) - vec2( max( uDoors.y, uDoors.z < 90.0 ? uDoors.w : uDoors.y ) + 0.3, uDoorY.z - 0.13 ) );
								col *= 1.0 - 0.6 * bandAA( max( d.x, d.y ) - 0.075, 0.003, max( fw.x, fw.y ) );
							}
						}
						// hood and trunk lid gaps on top
						if ( closeUp && ln.y > 0.35 ) {
							float hg = 0.0;
							if ( uLids.z < 90.0 ) hg += ( bandAA( lp.z - uLids.w, 0.003, fw.x ) * step( ax, uArch.x * 0.9 ) + bandAA( ax - uArch.x * 0.88, 0.003, fwx ) * step( uLids.z, lp.z ) * step( lp.z, uLids.w ) ) * step( uLidY.y, lp.y );
							if ( uLids.x < 90.0 ) hg += ( bandAA( lp.z - uLids.x, 0.003, fw.x ) * step( ax, uArch.x * 0.88 ) + bandAA( ax - uArch.x * 0.86, 0.003, fwx ) * step( uLids.x, lp.z ) * step( lp.z, uLids.y ) ) * step( uLidY.x, lp.y );
							col *= 1.0 - 0.7 * clamp( hg, 0.0, 1.0 );
						}
					}
					// door panels: the handle and the gap round the skin (unit coordinates)
					if ( uPanel > 0.5 && part == 0 && ln.x > 0.5 ) col = mix( col, vec3( 0.03 ), rectAA( vec2( lp.z, lp.y ), vec2( 0.76, 0.42 ), vec2( 0.9, 0.46 ) ) );
					// licence plates
					if ( part == 12 ) {
						vec2 uv = vec2( lp.x / 0.15 * ( lp.z < 0.0 ? - 1.0 : 1.0 ), ( lp.y - ( lp.z < 0.0 ? uEnds.z : uEnds.w ) ) / 0.075 );
						col = plateColor( uv, fract( vCar2.x * 3.1 ) );
						cRough = 0.45; cMetal = 0.25;
						lens = 1.0;
					}
					// tyres and rims: the nearest axle's wheel frame
					if ( part == 3 || part == 4 ) {
						float za = uArch.y;
						if ( abs( lp.z - uArch.z ) < abs( lp.z - za ) ) za = uArch.z;
						if ( abs( lp.z - uWheel.z ) < abs( lp.z - za ) ) za = uWheel.z;
						vec2 w = vec2( lp.z - za, lp.y - uArch.w );
						float rho = length( w ) / uArch.w, ang = atan( w.y, w.x );
						float lat = abs( lp.x ) - uWheel.x;
						if ( part == 3 ) {
							col = vec3( 0.022 );
							if ( abs( ln.x ) > 0.6 ) {
								// sidewall: a band of raised lettering, sun-greyed rubber
								float letters = boxAA( rho, 0.8, 0.9 ) * step( 0.55, fract( ang * 9.5 ) ) * step( 0.3, n2.g );
								col = mix( col, vec3( 0.05 ), letters * 0.7 );
								cRough = 0.75;
							} else {
								// tread: two grooves round the tyre and the sipes across it
								float tg = lineAA( abs( lat ) - uWheel.y * 0.3, 0.008 );
								float sip = stripeAA( ang * uArch.w, 0.045, 0.0, 0.006 ) * step( uWheel.y * 0.3, abs( lat ) );
								col *= 1.0 - 0.6 * clamp( tg + sip, 0.0, 1.0 );
								cRough = 0.95;
							}
							col = mix( col, vec3( 0.075, 0.068, 0.06 ), ( 0.25 + 0.4 * n2.g ) * 0.6 );
						} else {
							float rr = rho / 0.64;
							float st = uWheel.w;
							float hole = 0.0, nut = 0.0;
							float N = st < 1.5 ? uMisc.w : st < 2.5 ? 8.0 : 6.0;
							float sec = fract( ang / 6.2832 * N );
							vec3 rc = col;
							if ( st < 0.5 ) {
								// steel wheel under a ribbed hubcap
								rc *= mix( 1.0, 0.85 + 0.15 * cos( ang * 16.0 ), boxAA( rr, 0.35, 0.86 ) );
								rc *= 1.0 - 0.6 * lineAA( rr - 0.88, 0.02 );
								rc = mix( rc, vec3( 0.06 ), 1.0 - smoothstep( 0.1, 0.13, rr ) );
							} else if ( st < 1.5 ) {
								// alloy spokes: windows between them show the dark brake behind
								hole = boxAA( rr, 0.34, 0.86 ) * boxAA( sec, 0.16 + 0.12 * ( 1.0 - rr ), 0.84 - 0.12 * ( 1.0 - rr ) );
								float la = ang - floor( ang / 1.2566 + 0.5 ) * 1.2566;
								nut = 1.0 - smoothstep( 0.035, 0.05, length( vec2( rr * cos( la ) - 0.22, rr * sin( la ) ) ) );
							} else if ( st < 2.5 ) {
								// military steel: bolt circles of the split rim and the hub
								float bolts = 1.0 - smoothstep( 0.03, 0.045, length( vec2( rr - 0.78, ( fract( ang / 6.2832 * 12.0 ) - 0.5 ) * 0.4 ) ) );
								nut = max( bolts, 1.0 - smoothstep( 0.035, 0.05, length( vec2( rr - 0.3, ( sec - 0.5 ) * 0.25 ) ) ) );
							} else if ( st < 3.5 ) {
								// truck steel: round hand holes, lug nuts
								hole = 1.0 - smoothstep( 0.1, 0.12, length( vec2( rr - 0.6, ( fract( ang / 6.2832 * 6.0 ) - 0.5 ) * 6.2832 / 6.0 * 0.6 ) ) );
								nut = 1.0 - smoothstep( 0.03, 0.045, length( vec2( rr - 0.3, ( fract( ang / 6.2832 * 8.0 ) - 0.5 ) * 0.24 ) ) );
							} else {
								// police black steelies: slots and a small chrome cap
								hole = boxAA( rr, 0.5, 0.7 ) * boxAA( sec, 0.3, 0.7 );
								rc = mix( rc, vec3( 0.5, 0.52, 0.55 ), 1.0 - smoothstep( 0.2, 0.23, rr ) );
							}
							rc = mix( rc, vec3( 0.07, 0.055, 0.045 ), hole );
							rc = mix( rc, vec3( 0.35, 0.35, 0.33 ), nut );
							// brake dust
							rc = mix( rc, vec3( 0.12, 0.09, 0.06 ), ( 0.2 + 0.3 * n2.r ) * smoothstep( 0.3, 0.9, rr ) );
							col = rc;
							cRough = mix( cRough, 0.9, hole );
							cMetal = mix( cMetal, 0.1, hole );
						}
					}
					// rust: only old beaters have it (a week of apocalypse doesn't rust a car), in spots growing from the
					// sills, the wheel arches and panel edges
					float ra = rust * rust;
					// (the loose door / lid panels are in unit coordinates: no sills there)
					float low = uPanel > 0.5 ? 0.0 : 1.0 - smoothstep( 0.2, 0.75, lp.y - uArch.w * 0.5 );
					float rm = smoothstep( 1.0 - ra * 0.55, 1.04 - ra * 0.55, n1.b * 0.55 + n2.r * 0.45 + low * 0.45 * sqrt( ra ) ) * ( 1.0 - lens );
					// (most wrecks have no rust at all: skip its texture work)
					if ( ( part <= 2 || part == 4 ) && ( rm > 0.002 || ra > 0.05 ) ) {
						// the rust texture is a light, yellowish scan: keep its detail, give it iron oxide's dark red-brown
						float rl = min( 1.5, dot( texture2D( tRust, lp.zy * 0.8 + lp.x ).rgb, vec3( 0.3, 0.59, 0.11 ) ) / 0.3 );
						vec3 rc = mix( vec3( 0.07, 0.025, 0.01 ), vec3( 0.2, 0.07, 0.02 ), smoothstep( 0.5, 1.3, rl ) ) * ( 0.6 + 0.4 * rl );
						col = mix( col, rc, rm );
						cRough = mix( cRough, 0.92, rm ); cMetal = mix( cMetal, 0.05, rm );
						// and it bleeds down the paint below the spots
						if ( part == 0 && ra > 0.05 ) {
							float run = smoothstep( 0.55, 0.9, texture2D( tNoise, vec2( lp.z * 2.3 + lp.x, lp.y * 0.12 ) ).b ) * smoothstep( 0.6, 0.85, n1.b );
							col = mix( col, vec3( 0.16, 0.07, 0.03 ), run * ra * 0.5 );
						}
					}
					if ( ! glassPart && lens < 0.5 ) {
						// road dust and dried mud low on the body
						col = mix( col, vec3( 0.27, 0.23, 0.18 ), ( 1.0 - smoothstep( 0.1, 0.8, lp.y ) ) * 0.45 * ( 0.4 + n2.g ) * ( uPanel > 0.5 ? 0.3 : 1.0 ) );
						// a week of dust, pollen and ash settled on what faces up, rain-streaked grime on the sides
						float up = smoothstep( 0.5, 0.92, ln.y ) * ( 0.25 + 0.45 * n1.g ) * ( uPanel > 0.5 ? 0.5 : 1.0 );
						col = mix( col, vec3( 0.3, 0.28, 0.24 ), up * 0.45 );
						cRough = mix( cRough, 0.75, up );
						if ( part == 0 && abs( ln.x ) > 0.6 && lp.y < uDoorY.z + 0.05 ) col *= 1.0 - 0.16 * smoothstep( 0.55, 0.85, texture2D( tNoise, vec2( lp.z * 3.1, lp.y * 0.07 ) ).r ) * smoothstep( uDoorY.z + 0.05, uDoorY.z - 0.3, lp.y );
					}
					// fire
					if ( burn > 0.01 ) {
						vec3 ch = mix( vec3( 0.014 ), vec3( 0.17, 0.075, 0.03 ), smoothstep( 0.4, 0.8, n1.r ) );
						ch = mix( ch, vec3( 0.32, 0.3, 0.28 ), smoothstep( 0.72, 0.95, n2.g ) * 0.45 );
						// white ash on top, rust bloom low down
						ch = mix( ch, vec3( 0.38, 0.37, 0.35 ), smoothstep( 0.6, 0.95, ln.y ) * smoothstep( 0.4, 0.75, n1.g ) * 0.6 );
						ch = mix( ch, vec3( 0.14, 0.05, 0.02 ), smoothstep( 0.45, 0.8, n1.b ) * 0.6 * smoothstep( 1.2, 0.3, lp.y ) );
						col = mix( col, ch, burn );
						cRough = mix( cRough, 0.95, burn ); cMetal = mix( cMetal, 0.0, burn );
						if ( burn > 0.5 && ( part == 3 || glassPart || part == 7 || part == 8 || part == 12 || part == 13 ) ) discard;
					}
					if ( part == 3 && ( fl & 4096 ) != 0 ) discard;
					// broken glass: tempered side / rear windows shatter and fall out (a few shards stay in the frame),
					// the laminated windscreen crazes around the impact
					if ( glassPart ) {
						bool all = ( fl & 128 ) != 0, some = ( fl & 64 ) != 0;
						bool screen = part == 6 && lp.z < 0.0;
						if ( ! screen ) {
							float win = floor( ( lp.z + 20.0 ) / 0.95 ) + ( lp.x > 0.0 ? 50.0 : 0.0 ) + ( part == 6 ? 100.0 : 0.0 );
							float h = fract( sin( win * 12.9898 + vCar2.x * 78.233 ) * 43758.5453 );
							// a jagged row of shards stays in the bottom of the frame (door panels: unit y, glass from 0.58 up)
							float keep = ( uPanel > 0.5 ? 0.6 : uDoorY.z + 0.16 ) + 0.07 * n2.r - 0.03 * n2.a;
							if ( ( all || ( some && h < 0.45 ) ) && lp.y > keep ) discard;
						} else if ( all || ( some && fract( vCar2.x * 3.3 ) < 0.5 ) ) {
							vec2 c = vec2( lp.x - ( fract( vCar2.x * 7.1 ) - 0.5 ) * uArch.x * 0.8, lp.y - ( uDoorY.z + uDoorY.w ) * 0.5 );
							float r = length( c );
							float a = atan( c.y, c.x ) / 6.2832 + 0.5;
							// a star of hairline cracks of random length around the impact, short arcs between them close
							// to it and a milky crushed spot in the middle; thin lines fade to their average coverage when
							// they get smaller than a pixel so the web never turns into a solid white disc far away
							float ai = a * 14.0 + n2.r * 0.35;
							float id = floor( ai );
							float len = 0.14 + 0.42 * fract( sin( id * 91.7 + vCar2.x * 17.3 ) * 43758.5453 );
							float rad = abs( fract( ai ) - 0.5 ) / 14.0 * 6.2832 * r;
							float fw = max( fwidth( r ), 1e-4 );
							float thin = min( 1.0, 0.004 / fw );
							float radial = ( 1.0 - smoothstep( 0.0, 0.0015 + fw, rad ) ) * ( 1.0 - smoothstep( len * 0.55, len, r ) ) * thin;
							float ring = abs( fract( r * 9.0 + n2.g * 0.8 ) - 0.5 ) / 9.0;
							float arcs = ( 1.0 - smoothstep( 0.0, 0.001 + fw, ring ) ) * step( 0.45, fract( sin( id * 12.3 + floor( r * 9.0 ) * 7.1 ) * 4375.85 ) ) * ( 1.0 - smoothstep( 0.06, 0.2, r ) ) * thin;
							float web = max( radial, arcs * 0.8 );
							web = max( web, ( 1.0 - smoothstep( 0.012, 0.045, r ) ) * 0.85 );
							col = mix( col, vec3( 0.36, 0.38, 0.39 ), web * 0.6 );
							cRough = mix( cRough, 0.55, web );
						}
						// a film of dust on the glass, heaviest on what faces up
						float film = ( 0.12 + 0.3 * smoothstep( 0.2, 0.8, ln.y ) ) * ( 0.5 + 0.7 * n1.g );
						col = mix( col, vec3( 0.2, 0.19, 0.17 ), film * 0.4 );
						cRough = mix( cRough, 0.35, film );
					}
					// open doors / trunk / hood: the body panel is gone from its opening (the door took its skin, window
					// frame and trim card with it; the wheel arch stays)
					if ( body ) {
						bool side = abs( lp.x ) > uArch.x * 0.78;
						bool inY = lp.y > uDoorY.x && lp.y < uDoorY.y;
						bool left = lp.x < 0.0;
						bool hole = false;
						float dA = min( length( vec2( lp.z - uArch.y, lp.y - uArch.w ) ), length( vec2( lp.z - uArch.z, lp.y - uArch.w ) ) );
						if ( side && inY && part != 3 && part != 4 && dA > uArch.w + 0.14 ) {
							if ( lp.z > uDoors.x && lp.z < uDoors.y - 0.05 ) hole = ( fl & ( left ? 1 : 2 ) ) != 0;
							else if ( lp.z > uDoors.z + 0.05 && lp.z < uDoors.w ) hole = ( fl & ( left ? 4 : 8 ) ) != 0;
						}
						if ( ( fl & 16 ) != 0 && lp.z > uLids.x && lp.z < uLids.y && lp.y > uLidY.x && abs( lp.x ) < uArch.x * 0.92 && part != 3 && part != 4 && part != 9 ) hole = true;
						// an open hood: its skin went up with the lid, the modelled engine bay (part 9) shows
						if ( ( fl & 32 ) != 0 && lp.z > uLids.z && lp.z < uLids.w && lp.y > uLidY.y && abs( lp.x ) < uArch.x * 0.9 && part != 3 && part != 4 && part != 9 ) hole = true;
						if ( hole ) discard;
					}
					// the inside of the shell (seen through the holes) is dark; an open door or lid shows its trim panel
					if ( ! outside ) { col = uPanel > 0.5 ? vec3( 0.07, 0.066, 0.06 ) * ( 0.8 + 0.4 * n2.g ) : vec3( 0.018 ); cRough = 0.9; cMetal = 0.0; }
					if ( part == 7 ) { cRough = 0.08; }
					// the sky IBL is dim next to the sun: let glass and clear coat mirror a bit more of it so windows don't read
					// as black holes and the paint doesn't look like plastic
					cEnv = glassPart ? 1.7 : part == 0 ? 1.4 : 1.0;
					diffuseColor.rgb = col;
				}
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = cRough;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = cMetal;' )
			// (three flips a double-sided normal by the screen winding, which a mirrored instance reverses)
			.replace( '#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal *= vMir; nonPerturbedNormal = normal;' )
			.replace( '#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= cEnv;' );
	} );
	return mat;
}
