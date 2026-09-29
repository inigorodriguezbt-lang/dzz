// Materials of the roads module. Every lit material goes through patchMaterial (aerial fog, cloud shadows,
// rain wetness); the road markings, wear, cracks, patches and puddles are procedural in the road shader so a
// whole street cell is one draw call.
//
// All of them share the same distance-growing depth pull: vertices slide towards the camera along the view
// ray (screen position unchanged) by ~0.3 % of their distance past 40 m. That keeps the road surfaces ahead
// of the coarser terrain LOD far away while standing objects on the road (whose depth grows much faster along
// a grazing ray) are practically unaffected.
import * as THREE from 'three';
import { G, COMMON_GLSL, patchMaterial, tex } from '../../render/Materials.js';
import { noiseTexture, crackTexture, signAtlas, decalAtlas, ATLAS_H } from './textures.js';
import { ATLAS_SIZE } from './kinds.js';

export const PULL_GLSL = /* glsl */`
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
		mvPosition.xyz *= 1.0 - max( pd - 40.0, 0.0 ) * 0.003 / max( pd, 1.0 );
	}
	gl_Position = projectionMatrix * mvPosition;
`;

// swap the projection for the pulled one (patchMaterial keeps its world-position block after the include)
function pull( shader ) {
	shader.vertexShader = shader.vertexShader.replace( '#include <project_vertex>', PULL_GLSL );
}

// declarations go right before main(), after three's and patchMaterial's common code
function beforeMain( src, code ) { return src.replace( 'void main() {', code + '\nvoid main() {' ); }

// AA helpers shared by the surface shaders
const LINES_GLSL = /* glsl */`
	// coverage of the band |x| < hw, fading to its average when thinner than a pixel
	float lineAA( float x, float hw ) {
		float fw = max( fwidth( x ), 1e-4 );
		return ( 1.0 - smoothstep( hw - fw, hw + fw, abs( x ) ) ) * min( 1.0, 2.0 * hw / fw );
	}
	float boxAA( float x, float a, float b ) { return lineAA( x - ( a + b ) * 0.5, ( b - a ) * 0.5 ); }
	float dashAA( float s, float period, float on ) {
		float fs = max( fwidth( s ), 1e-4 );
		float d = mod( s, period );
		float m = smoothstep( 0.0, fs, d ) * ( 1.0 - smoothstep( on - fs, on, d ) );
		return mix( m, on / period, smoothstep( period * 0.25, period, fs * 2.0 ) );
	}
`;

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
		pull( sh );
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
					vec2 cr = texture2D( tCrack, wp / 23.0 ).rg;
					float crackAmt = smoothstep( 0.35, 0.8, nz.b + nz.r * 0.45 );
					float paint = 0.0, yel = 0.0, gravel = 0.0, edgeWet = 0.0;
					vec3 paintCol = vec3( 0.74, 0.74, 0.7 );
					// repaired patches: rectangles of darker, fresher asphalt (no paint on them)
					vec2 pc = vec2( floor( s / 9.0 ), floor( ( u + 40.0 ) / 3.3 ) );
					vec2 pf = vec2( fract( s / 9.0 ), fract( ( u + 40.0 ) / 3.3 ) );
					float ph = hash12( pc + vec2( floor( vRd2.x * 0.37 ), cls * 7.0 ) );
					float patchM = step( ph, 0.075 ) * boxAA( pf.x, 0.08, 0.35 + 0.55 * hash12( pc + 3.1 ) ) * boxAA( pf.y, 0.1, 0.9 );
					if ( cls < 0.5 ) {
						// freeway: yellow inner edge by the median, dashed white lane divider, white outer edge
						yel += lineAA( au - 0.95, 0.075 );
						paint += lineAA( au - 4.4, 0.075 ) * dashAA( s + vRd2.x, 12.0, 3.0 );
						paint += lineAA( au - 7.9, 0.09 );
						col = mix( col, texture2D( tConc, wp * 0.3 ).rgb * 0.95, 1.0 - smoothstep( 0.5, 0.62, au ) );
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
						yel += lineAA( u - 0.11, 0.05 ) * mix( 1.0, dsh, passA ) + lineAA( u + 0.11, 0.05 ) * mix( 1.0, dsh, passB );
						paint += lineAA( au - 3.78, 0.06 );
						col *= 1.0 - 0.07 * exp( - pow( ( au - 1.95 ) / 0.4, 2.0 ) );
						crackAmt = max( crackAmt, smoothstep( 3.6, 4.2, au ) * 0.7 );
						gravel = smoothstep( hw - 0.05, hw + 0.35, au );
						edgeWet = smoothstep( 3.2, 4.3, au );
					} else if ( cls < 2.5 ) {
						// dirt / rural track: two compacted ruts, grass down the middle, ragged edges into the terrain
						vec3 d1 = texture2D( tDirt, wp * 0.27 ).rgb;
						vec3 d2 = texture2D( tDirt, vec2( wp.y, - wp.x ) * 0.09 ).rgb;
						col = mix( d1, d2, 0.4 ) * ( 0.85 + 0.3 * nf.r );
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
							paint += lineAA( mod( s - a0 + 1.0, 6.5 ) - 3.25, 0.05 ) * boxAA( au, pl, pl + 0.7 ) * 0.9;
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
								paint += onA * inA * lineAA( mod( vRd.y + hw, 1.2 ) - 0.6, 0.3 );
								paint += onB * inB * lineAA( mod( vRd.x + hw, 1.2 ) - 0.6, 0.3 );
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
						paint += boxAA( sE, 6.0, 36.0 ) * lineAA( mod( au - 3.0, 3.6 ) - 1.8, 0.9 ) * boxAA( au, 3.0, hw - 3.0 );
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
					} else {
						// far sidewalks / aprons
						col = texture2D( tWalk, wp / 3.0 ).rgb * ( 0.9 + 0.2 * nf.r );
						rRough = 0.85;
						crackAmt = 0.0;
					}
					// cracks and sealed tar snakes
					col *= 1.0 - cr.r * 0.6 * crackAmt;
					col = mix( col, vec3( 0.03, 0.028, 0.026 ), cr.g * 0.75 * crackAmt );
					rRough = mix( rRough, 0.5, cr.g * crackAmt );
					// patches
					col = mix( col, col * 0.62, patchM );
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
						float pn = texture2D( tNoise, wp * 0.031 ).r * 0.62 + nf.g * 0.38 + edgeWet * 0.22;
						float pud = smoothstep( 0.66 - uWet * 0.16, 0.69 - uWet * 0.16, pn ) * smoothstep( 0.05, 0.5, uWet );
						col *= 1.0 - 0.5 * pud;
						rRough = mix( rRough, 0.02, pud );
						rNS *= 1.0 - pud;
						// raindrop rings
						vec2 rp = wp * 2.0;
						vec2 ci = floor( rp );
						float rt = fract( uTime * 0.9 + hash12( ci ) );
						float rr = length( fract( rp ) - 0.5 - ( vec2( hash12( ci + 1.3 ), hash12( ci + 2.7 ) ) - 0.5 ) * 0.4 );
						float ring = ( 1.0 - smoothstep( 0.0, 0.03, abs( rr - rt * 0.45 ) ) ) * ( 1.0 - rt ) * pud * uWet;
						rNT.xy += vec2( ring ) * 0.8;
						rNS = max( rNS, ring );
					}
					diffuseColor.rgb = col;
				}
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rRough;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = rMetal;' )
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
						// tyre scuffs and grime near the foot
						kcol *= 1.0 - 0.35 * smoothstep( 0.35, 0.0, fract( wp.y + 10.0 ) ) * n1.g;
					} else {
						// galvanised steel with white rust and a few rust streaks
						kcol *= 0.85 + 0.3 * n1.r;
						vec3 rs = texture2D( tRust, wp.xz * 0.5 + wp.y ).rgb;
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

function makeWireMaterial() {
	const mat = new THREE.LineBasicMaterial( { color: 0x121212 } );
	patchMaterial( mat, 'roads-wire', ( sh ) => pull( sh ), { noWet: true, noCloudShadow: true } );
	return mat;
}

// ---- instanced props: vertex colour + pbr = ( roughness, metalness, flag ) --------------------------------------
// flag 0 plain, 0.5 takes the instance tint, 1 lamp bulb (lit at night on flickering lamps)
// instance attributes: iTint (rgb), iMisc = ( flicker, seed, dirt, - )

function makePropMaterial() {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.7, metalness: 0, vertexColors: true } );
	const U = { tNoise: { value: noiseTexture() } };
	patchMaterial( mat, 'roads-prop', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec3 pbr; attribute vec3 iTint; attribute vec4 iMisc; varying vec3 vPbr; varying vec3 vTint; varying vec4 vMisc; varying vec3 vObj;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr; vTint = iTint; vMisc = iMisc; vObj = position;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, /* glsl */`
			uniform sampler2D tNoise;
			varying vec3 vPbr; varying vec3 vTint; varying vec4 vMisc; varying vec3 vObj;
			float flickerAt( float seed ) {
				float t = uTime * ( 7.0 + seed * 9.0 ) + seed * 40.0;
				float f = step( 0.35, fract( sin( floor( t ) * 12.9898 + seed * 78.233 ) * 43758.5453 ) );
				float dead = step( 0.72, fract( uTime * 0.11 + seed * 3.7 ) ); // long dark spells
				return f * ( 1.0 - dead * 0.9 ) * ( 0.75 + 0.25 * sin( uTime * 50.0 ) );
			}
		` );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <color_fragment>', /* glsl */`#include <color_fragment>
				float pFlag = vPbr.z;
				if ( pFlag > 0.25 && pFlag < 0.75 ) diffuseColor.rgb *= vTint;
				{
					vec4 n1 = texture2D( tNoise, vWorldPos.xz * 0.37 + vWorldPos.y * 0.21 );
					diffuseColor.rgb *= 0.86 + 0.26 * n1.r;
					// grime creeping up from the ground, scaled by the instance's dirt
					diffuseColor.rgb *= 1.0 - vMisc.z * 0.35 * smoothstep( 0.9, 0.0, vObj.y ) * n1.g;
				}
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPbr.x;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPbr.y;' )
			.replace( '#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
				if ( pFlag > 0.75 ) {
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
		uniforms: Object.assign( { tDecal: { value: decalAtlas() } }, G ),
		vertexShader: /* glsl */`
			attribute vec2 duv; attribute vec4 iDec;
			varying vec2 vDuv; varying vec4 vDec; varying vec3 vWorldPos;
			void main() {
				vec3 transformed = position;
				vDuv = duv; vDec = iDec;
				vWorldPos = ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).xyz;
				${PULL_GLSL}
			}`,
		fragmentShader: /* glsl */`
			uniform sampler2D tDecal;
			uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
			uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
			uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK; uniform float uNight;
			varying vec2 vDuv; varying vec4 vDec; varying vec3 vWorldPos;
			${COMMON_GLSL}
			float flickerAt( float seed ) {
				float t = uTime * ( 7.0 + seed * 9.0 ) + seed * 40.0;
				float f = step( 0.35, fract( sin( floor( t ) * 12.9898 + seed * 78.233 ) * 43758.5453 ) );
				float dead = step( 0.72, fract( uTime * 0.11 + seed * 3.7 ) );
				return f * ( 1.0 - dead * 0.9 ) * ( 0.75 + 0.25 * sin( uTime * 50.0 ) );
			}
			void main() {
				vec2 cuv = ( vec2( 0.0, 0.0 ) + 0.02 + vDuv * 0.96 ) / 4.0; // cell 12 = column 0, bottom row
				float a = texture2D( tDecal, cuv ).a;
				float lit = smoothstep( 0.3, 0.7, uNight ) * flickerAt( vDec.y ) * vDec.z;
				vec3 c = vec3( 1.0, 0.72, 0.4 ) * a * lit * 0.5;
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
			if ( vFace < 0.5 ) diffuseColor *= texture2D( map, vSuv );
			else diffuseColor.rgb = vec3( 0.3, 0.31, 0.31 );
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
// ranges, uDoorY = ( door bottom, door top, belt, roof ), uLids = trunk / hood z ranges, uLidY = ( trunk min y, hood min y )

const PALETTE = [
	0xe8e8e4, 0xa8acaf, 0x5b5f63, 0x16171a, 0x8e1b1b, 0x1f2f55, 0x5d7fa3, 0x2f5a3c, 0xb8a888, 0x5a3d2a, 0xc9a227, 0x2a6b6b,
	0x4e1a22, 0xcbbf9e, 0xb5561d, 0x1e3326, 0x4b5320, 0x9c8a5e, 0x6b6b60, 0x3a3a3a, 0xeceeee, 0xd8d8d8, 0x222222, 0x777777,
];

export function makeCarMaterial( u ) {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.4, metalness: 0.2, vertexColors: true, side: THREE.DoubleSide } );
	const U = {
		uPal: { value: PALETTE.map( h => new THREE.Color( h ) ) },
		uArch: { value: new THREE.Vector4( ...( u.arch || [ 0, 0, 0, 0 ] ) ) },
		uDoors: { value: new THREE.Vector4( ...( u.doors || [ 0, 0, 0, 0 ] ) ) },
		uDoorY: { value: new THREE.Vector4( ...( u.doorY || [ 0, 0, 0, 0 ] ) ) },
		uLids: { value: new THREE.Vector4( ...( u.lids || [ 0, 0, 0, 0 ] ) ) },
		uLidY: { value: new THREE.Vector4( ...( u.lidY || [ 0, 0, 0, 0 ] ) ) },
		uPanel: { value: u.panel ? 1 : 0 },
		tNoise: { value: noiseTexture() }, tRust: { value: tex( 'rust_d' ) },
	};
	patchMaterial( mat, 'roads-car', ( sh ) => {
		Object.assign( sh.uniforms, U );
		pull( sh );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec3 cpart; attribute vec4 iCar; attribute vec4 iCar2; varying vec3 vPart; varying vec4 vCar; varying vec4 vCar2; varying vec3 vLoc;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvPart = cpart; vCar = iCar; vCar2 = iCar2; vLoc = position;' );
		sh.fragmentShader = beforeMain( sh.fragmentShader, /* glsl */`
			uniform vec3 uPal[ 24 ];
			uniform vec4 uArch, uDoors, uDoorY, uLids, uLidY;
			uniform float uPanel;
			uniform sampler2D tNoise, tRust;
			varying vec3 vPart; varying vec4 vCar; varying vec4 vCar2; varying vec3 vLoc;
			${LINES_GLSL}
		` );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <color_fragment>', /* glsl */`#include <color_fragment>
				float cRough = vPart.y, cMetal = vPart.z;
				{
					int part = int( vPart.x + 0.5 );
					int fl = int( vCar.w + 0.5 );
					float rust = vCar.y, burn = vCar.z;
					vec3 lp = vLoc;
					vec4 n1 = texture2D( tNoise, lp.xz * 0.35 + lp.y * 0.2 + vCar2.x * 13.0 );
					vec4 n2 = texture2D( tNoise, lp.zy * 1.3 + lp.x * 0.7 + vCar2.x * 7.0 );
					vec3 col = diffuseColor.rgb;
					bool glassPart = part == 5 || part == 6;
					if ( part == 0 ) {
						int ci = int( vCar.x + 0.5 );
						col = uPal[ ci ];
						if ( ci == 20 ) col = mix( col, vec3( 0.015, 0.05, 0.3 ), boxAA( lp.y, uDoorY.z - 0.25, uDoorY.z - 0.1 ) * step( 0.5, abs( lp.x ) / max( uArch.x, 0.01 ) ) );
						// a week in the sun and salt air: faded, dusty clear coat
						float fade = 0.3 + 0.35 * n1.g;
						col = mix( col, vec3( dot( col, vec3( 0.3, 0.59, 0.11 ) ) ) * 1.08 + 0.015, fade * 0.3 );
						cRough = mix( 0.28, 0.6, n1.r * fade );
					}
					// wheel wells behind the tyres
					if ( uArch.x > 0.0 && abs( lp.x ) > uArch.x * 0.78 && part <= 1 ) {
						float dA = min( length( vec2( lp.z - uArch.y, lp.y - uArch.w ) ), length( vec2( lp.z - uArch.z, lp.y - uArch.w ) ) );
						if ( dA < uArch.w + 0.08 ) { col = vec3( 0.012 ); cRough = 1.0; cMetal = 0.0; }
					}
					// rust patches growing from the sills, the wheel arches and panel edges
					float rm = smoothstep( 1.0 - rust, 1.0 - rust + 0.08, n1.b * 0.65 + n2.r * 0.35 + ( 1.0 - smoothstep( 0.15, 0.8, lp.y ) ) * rust * 0.45 );
					if ( part <= 2 || part == 4 ) {
						vec3 rc = texture2D( tRust, lp.zy * 0.8 + lp.x ).rgb * vec3( 0.8, 0.6, 0.45 );
						col = mix( col, rc, rm );
						cRough = mix( cRough, 0.92, rm ); cMetal = mix( cMetal, 0.05, rm );
					}
					// road dust and dried mud low on the body
					if ( ! glassPart ) col = mix( col, vec3( 0.27, 0.23, 0.18 ), ( 1.0 - smoothstep( 0.1, 0.8, lp.y ) ) * 0.45 * ( 0.4 + n2.g ) );
					// fire
					if ( burn > 0.01 ) {
						vec3 ch = mix( vec3( 0.014 ), vec3( 0.17, 0.075, 0.03 ), smoothstep( 0.4, 0.8, n1.r ) );
						ch = mix( ch, vec3( 0.32, 0.3, 0.28 ), smoothstep( 0.72, 0.95, n2.b ) * 0.55 );
						col = mix( col, ch, burn );
						cRough = mix( cRough, 0.95, burn ); cMetal = mix( cMetal, 0.0, burn );
						if ( burn > 0.5 && ( part == 3 || glassPart || part == 7 || part == 8 || part == 13 ) ) discard;
					}
					if ( part == 3 && ( fl & 4096 ) != 0 ) discard;
					// broken glass: side windows gone (a few shards left in the frame), the laminated screen crazed
					if ( glassPart ) {
						bool all = ( fl & 128 ) != 0, some = ( fl & 64 ) != 0;
						if ( part == 5 ) {
							float win = floor( ( lp.z + 20.0 ) / 0.95 ) + ( lp.x > 0.0 ? 50.0 : 0.0 );
							float h = fract( sin( win * 12.9898 + vCar2.x * 78.233 ) * 43758.5453 );
							if ( ( all || ( some && h < 0.45 ) ) && n2.a > 0.16 ) discard;
						} else if ( all || ( some && fract( vCar2.x * 3.3 ) < 0.5 ) ) {
							vec2 c = vec2( lp.x - ( fract( vCar2.x * 7.1 ) - 0.5 ) * uArch.x, lp.y - uDoorY.w + 0.28 );
							float r = length( c ), a = atan( c.y, c.x );
							float rad = 1.0 - smoothstep( 0.0, 0.02, abs( fract( a * 2.2 + n2.r * 0.25 ) - 0.5 ) * r * 4.0 );
							float ring = 1.0 - smoothstep( 0.0, 0.08, abs( fract( r * 7.0 + n2.g * 0.4 ) - 0.5 ) );
							float web = max( rad, ring * 0.7 ) * ( 1.0 - smoothstep( 0.15, 0.8, r ) );
							col = mix( col, vec3( 0.5, 0.52, 0.52 ), web * 0.75 );
							cRough = mix( cRough, 0.7, web );
						}
					}
					// open doors / trunk / hood: the body panel is gone from its opening
					if ( uPanel < 0.5 && uArch.x > 0.0 ) {
						bool side = abs( lp.x ) > uArch.x * 0.8;
						bool inY = lp.y > uDoorY.x && lp.y < uDoorY.y;
						bool left = lp.x < 0.0;
						bool hole = false;
						if ( side && inY ) {
							if ( lp.z > uDoors.x && lp.z < uDoors.y - 0.05 ) hole = ( fl & ( left ? 1 : 2 ) ) != 0;
							else if ( lp.z > uDoors.z + 0.05 && lp.z < uDoors.w ) hole = ( fl & ( left ? 4 : 8 ) ) != 0;
						}
						if ( ( fl & 16 ) != 0 && lp.z > uLids.x && lp.z < uLids.y && lp.y > uLidY.x && abs( lp.x ) < uArch.x * 0.92 && part != 3 && part != 4 ) hole = true;
						if ( hole && part != 9 ) discard;
						if ( ( fl & 32 ) != 0 && lp.z > uLids.z && lp.z < uLids.w && lp.y > uLidY.y && abs( lp.x ) < uArch.x * 0.9 && part != 3 && part != 4 ) { col = vec3( 0.03, 0.028, 0.026 ); cRough = 1.0; cMetal = 0.2; }
					}
					// the inside of the shell (seen through the holes) is dark
					if ( ! gl_FrontFacing ) { col = vec3( 0.018 ); cRough = 1.0; cMetal = 0.0; }
					if ( part == 7 ) { cRough = 0.08; }
					diffuseColor.rgb = col;
				}
			` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = cRough;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = cMetal;' );
	} );
	return mat;
}
