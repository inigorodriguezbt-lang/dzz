// Materials of the buildings module. One lit material draws every shell and interior surface: a texture
// array layer per vertex (data.js L) tinted by the vertex colour, normal mapped, with per-layer roughness.
// Shells add the facade shader: windows, shop fronts, doors, balconies and railings drawn procedurally from
// per-vertex window parameters (geo.js), with interior mapping behind the glass (a fake room: floor, walls,
// ceiling, furniture, curtains, a candle at night), boarded-up and broken panes, rain streaks and grime.
//
// A small state texture (one texel per building) lets the shells hide parts of themselves without a rebuild:
//   R bit 0  the far shell of this building is hidden (its near shell is loaded)
//   R bit 1  the hidden storeys are hidden in the shadow pass too (the interior casts the shadows instead)
//   G..B     storeys hidden in the near shell (their real interior is loaded), G > B = none
//   A        one more hidden storey + 1 (0 = none): the ground storey while upper storeys stream around you
// Interior surfaces carry flag 64: they see much less of the sky (dimmer image-based light).
import * as THREE from 'three';
import { patchMaterial } from '../../render/Materials.js';
import { buildingTextures, LAYERS } from './textures.js';

export const STATE_W = 256;

// per layer: roughness, metalness, normal strength
const SURF = [
	[ 0.8, 0, 0 ], [ 0.92, 0, 0.8 ], [ 0.9, 0, 0.7 ], [ 0.88, 0, 0.7 ], [ 0.85, 0, 0.7 ], [ 0.55, 0.1, 0.6 ], [ 0.8, 0, 0.9 ], [ 0.9, 0, 1 ], // 0-7
	[ 0.9, 0, 1 ], [ 0.5, 0.3, 0.8 ], [ 0.75, 0, 1 ], [ 0.85, 0, 0.9 ], [ 0.95, 0, 0.6 ], [ 0.45, 0, 0.6 ], [ 0.25, 0, 0.6 ], [ 1, 0, 0.6 ], // 8-15
	// painted steel reads darker than it should with much metalness (little sky to reflect in the streets)
	[ 0.9, 0, 0.8 ], [ 0.45, 0.35, 0.6 ], [ 0.8, 0.25, 1 ], [ 0.95, 0, 0.7 ], [ 0.9, 0, 0.8 ], [ 0.95, 0, 0.8 ], [ 0.55, 0, 0 ], [ 0.95, 0, 0.6 ], // 16-23
	[ 0.5, 0, 0 ], [ 0.8, 0, 0 ], [ 0.8, 0, 0.8 ], [ 0.35, 0, 0.3 ], [ 0.25, 0, 0 ], [ 0.9, 0, 0.9 ], [ 0.95, 0, 0.6 ], [ 0.18, 0, 0.8 ], // 24-31
	[ 0.5, 0, 0 ], [ 0.2, 0.35, 0.3 ], // 32 sign, 33 spandrel glass
];

const glslArr = ( type, n, fn ) => `const ${type} ${n}[ ${LAYERS} ] = ${type}[ ${LAYERS} ]( ${Array.from( { length: LAYERS }, ( _, i ) => fn( SURF[ i ] || SURF[ 0 ] ) ).join( ', ' )} );`;
const f = ( v ) => v.toFixed( 3 );

const PARS_V = /* glsl */`
	attribute vec2 aUv; attribute vec3 aCol; attribute float aMat;
	varying vec2 vTUv; varying vec3 vTint; flat varying float vMat;
	#ifdef FACADE
		attribute vec2 aTag; attribute vec4 aWin; attribute vec4 aWin2;
		uniform highp sampler2D uBState;
		varying vec2 vWinUV; flat varying vec4 vWinF; flat varying vec4 vWin2;
	#endif
`;

// shared by the lit material and the shadow depth material
export const HIDE_GLSL = /* glsl */`
	if ( aTag.x > 0.5 ) {
		int bid = int( aTag.x + 0.5 ) - 1;
		vec4 bs = floor( texelFetch( uBState, ivec2( bid % ${STATE_W}, bid / ${STATE_W} ), 0 ) * 255.0 + 0.5 );
		#ifdef LOD_FAR
			if ( mod( bs.r, 2.0 ) > 0.5 ) transformed = vec3( 0.0 );
		#else
			float sy = aTag.y;
			// in the shadow pass the shell keeps casting for its hidden storeys unless R bit 1 says the
			// interior casts instead (only near the player: interiors in the shadow pass are expensive)
			#ifdef DEPTH_PASS
				bool hideOn = mod( floor( bs.r / 2.0 ), 2.0 ) > 0.5;
			#else
				bool hideOn = true;
			#endif
			if ( hideOn && sy < 254.5 && ( ( sy >= bs.g - 0.5 && sy <= bs.b + 0.5 ) || abs( sy + 1.0 - bs.a ) < 0.5 ) ) transformed = vec3( 0.0 );
		#endif
	}
`;

const VERT = /* glsl */`#include <begin_vertex>
	vTUv = aUv; vTint = pow( aCol, vec3( 2.2 ) ); vMat = aMat;
	#ifdef FACADE
		vWinUV = aWin.xy / 32.0;
		vWinF = vec4( aWin.z / 256.0, aWin.w, 0.0, 0.0 );
		vWin2 = vec4( aWin2.xyz / 20.0, aWin2.w );
		${HIDE_GLSL}
	#endif
`;

const PARS_F = /* glsl */`
	uniform highp sampler2DArray tArr; uniform highp sampler2DArray tNrm; uniform sampler2D tSign;
	uniform float uGain[ ${LAYERS} ]; uniform float uInAmb; uniform float uInSun;
	varying vec2 vTUv; varying vec3 vTint; flat varying float vMat;
	${glslArr( 'float', 'ROUGH', s => f( s[ 0 ] ) )}
	${glslArr( 'float', 'METAL', s => f( s[ 1 ] ) )}
	${glslArr( 'float', 'NSTR', s => f( s[ 2 ] ) )}
	mat3 bCotangent( vec3 N, vec3 p, vec2 uv ) {
		vec3 dp1 = dFdx( p ), dp2 = dFdy( p );
		vec2 duv1 = dFdx( uv ), duv2 = dFdy( uv );
		vec3 dp2perp = cross( dp2, N ), dp1perp = cross( N, dp1 );
		vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
		vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
		float im = inversesqrt( max( max( dot( T, T ), dot( B, B ) ), 1e-12 ) );
		return mat3( T * im, B * im, N );
	}
	#ifdef FACADE
		varying vec2 vWinUV; flat varying vec4 vWinF; flat varying vec4 vWin2;
		uint bWinHash( uint seed, uint bi ) {
			uint h = seed * 747796405u + ( bi + 1u ) * 2891336453u;
			h ^= h >> 16u; h *= 0x7feb352du;
			h ^= h >> 15u; h *= 0x846ca68bu;
			h ^= h >> 16u;
			return h;
		}
		const vec3 FRAME[ 8 ] = vec3[ 8 ]( vec3( 0.82, 0.82, 0.8 ), vec3( 0.07, 0.045, 0.03 ), vec3( 0.42, 0.43, 0.44 ), vec3( 0.025, 0.025, 0.028 ),
			vec3( 0.05, 0.14, 0.08 ), vec3( 0.2, 0.11, 0.05 ), vec3( 0.04, 0.16, 0.17 ), vec3( 0.3, 0.04, 0.03 ) );
		const vec3 WALLS[ 8 ] = vec3[ 8 ]( vec3( 0.78, 0.74, 0.66 ), vec3( 0.72, 0.72, 0.7 ), vec3( 0.62, 0.68, 0.64 ), vec3( 0.8, 0.7, 0.55 ),
			vec3( 0.6, 0.66, 0.74 ), vec3( 0.82, 0.8, 0.76 ), vec3( 0.74, 0.6, 0.52 ), vec3( 0.66, 0.62, 0.72 ) );
		const vec3 DOORS[ 8 ] = vec3[ 8 ]( vec3( 0.18, 0.08, 0.035 ), vec3( 0.32, 0.03, 0.025 ), vec3( 0.03, 0.09, 0.06 ), vec3( 0.78, 0.78, 0.74 ),
			vec3( 0.04, 0.06, 0.12 ), vec3( 0.12, 0.05, 0.02 ), vec3( 0.45, 0.32, 0.14 ), vec3( 0.5, 0.52, 0.5 ) );
		const float FLOORS[ 4 ] = float[ 4 ]( 13.0, 15.0, 14.0, 27.0 );

		// a fake room behind a window (interior mapping): p = point on the pane (x from the bay centre, y from the
		// storey floor), V = view ray in facade space (x along the wall, y up, z into the building)
		vec3 bRoom( vec2 p, float halfW, float roomH, float depth, vec3 V, uint h, int kind ) {
			vec3 d = V;
			d.z = max( d.z, 0.04 );
			vec3 o = vec3( p, 0.0 );
			float tx = ( ( d.x > 0.0 ? halfW : - halfW ) - o.x ) / ( abs( d.x ) > 1e-4 ? d.x : 1e-4 );
			float ty = ( ( d.y > 0.0 ? roomH : 0.0 ) - o.y ) / ( abs( d.y ) > 1e-4 ? d.y : ( d.y >= 0.0 ? 1e-4 : - 1e-4 ) );
			float tz = depth / d.z;
			float t = min( min( tx, ty ), tz );
			vec3 q = o + d * t;
			vec3 wall = WALLS[ int( ( h >> 24u ) & 7u ) ];
			vec3 c;
			if ( t == tz ) {
				c = wall * 0.92;
				// furniture against the back wall: a sofa, a cabinet or shelves
				float fx = ( float( ( h >> 4u ) & 7u ) / 7.0 - 0.5 ) * halfW;
				float fw = halfW * ( 0.35 + float( ( h >> 7u ) & 3u ) * 0.12 );
				float fh = kind == 1 ? 1.9 : 0.55 + float( ( h >> 9u ) & 3u ) * 0.35;
				if ( abs( q.x - fx ) < fw && q.y < fh ) {
					c = kind == 1 ? textureLod( tArr, vec3( q.x / 1.2, q.y / 0.4, 24.0 ), 1.0 ).rgb : vec3( 0.16, 0.11, 0.08 ) * ( 0.7 + 0.6 * float( ( h >> 11u ) & 3u ) / 3.0 );
				}
				// a picture on the wall
				else if ( kind == 0 && abs( q.x + fx * 0.6 ) < 0.35 && abs( q.y - 1.6 ) < 0.25 ) c = vec3( 0.25, 0.3, 0.35 ) * ( 0.5 + float( ( h >> 13u ) & 3u ) * 0.3 );
			} else if ( t == ty ) {
				if ( d.y > 0.0 ) c = vec3( 0.7, 0.7, 0.68 );
				else c = textureLod( tArr, vec3( q.xz * 0.6, FLOORS[ int( ( h >> 20u ) & 3u ) ] ), 2.0 ).rgb * ( kind == 1 ? 1.0 : 0.8 );
			} else {
				c = wall;
				if ( kind == 1 && q.y < 1.9 ) c = textureLod( tArr, vec3( q.z / 1.2, q.y / 0.4, 24.0 ), 1.0 ).rgb;
			}
			// daylight enters through the window and falls off towards the back
			c *= mix( 1.0, 0.28, clamp( q.z / depth, 0.0, 1.0 ) ) * ( 0.75 + 0.25 * smoothstep( 0.0, roomH, q.y ) );
			return c;
		}

		// the facade: writes albedo, roughness, metalness, emissive and a tangent-space normal
		void bFacade( inout vec3 alb, inout float rough, inout float metal, inout vec3 emit, inout vec3 nT, inout float nS, vec3 wN ) {
			int sty = int( vWin2.w + 0.5 ) & 31;
			int fr = int( vWin2.w + 0.5 ) >> 5;
			if ( sty == 0 ) return;
			float bay = vWinF.x;
			uint seed = uint( vWinF.y + 0.5 );
			float u = vWinUV.x, v = vWinUV.y;
			float ww = vWin2.x, wh = vWin2.y, sill = vWin2.z;
			float bi = floor( u / max( bay, 0.05 ) );
			vec2 p = vec2( u - ( bi + 0.5 ) * bay, v - sill );
			vec2 dpx = dFdx( p ), dpy = dFdy( p );
			uint h = bWinHash( seed, uint( max( bi, 0.0 ) ) );
			float r = float( h & 1023u ) / 1024.0;
			int state = r < float( seed >> 12u ) / 20.0 ? 1 : r > 0.955 ? 2 : 0;
			float hw = ww * 0.5;
			vec3 frame = FRAME[ fr ];
			float fmet = ( fr == 2 || fr == 1 ) ? 0.6 : 0.0;
			// facade frame of reference: t along the wall (u), up, n out of the building
			vec3 t = vec3( wN.z, 0.0, - wN.x );
			vec3 V = normalize( vWorldPos - cameraPosition );
			vec3 Vf = vec3( dot( V, t ), V.y, - dot( V, wN ) );
			float day = clamp( dot( uSunColor, vec3( 0.2126, 0.7152, 0.0722 ) ) / 3.0, 0.0, 1.0 );
			float lightIn = 0.015 + 0.2 * day;
			float flick = 0.8 + 0.2 * sin( uTime * 9.0 + float( h & 63u ) ) * sin( uTime * 3.7 + float( h & 31u ) );
			// power's out: about one window in thirty still shows a candle or a lantern
			bool candle = ( ( h >> 16u ) & 255u ) < 8u && uNight > 0.3;

			// the slab edge at each floor reads as a faint band on multi-storey walls
			if ( sty < 7 || sty >= 11 ) alb *= 1.0 - 0.1 * ( 1.0 - smoothstep( 0.06, 0.14, v ) );
			// rain streaks and grime under windows
			if ( sty < 7 || sty == 11 || sty == 12 || sty == 13 ) {
				float below = step( abs( p.x ), hw ) * step( p.y, 0.0 ) * smoothstep( - 1.6, 0.0, p.y );
				float streak = vnoise2( vec2( p.x * 9.0 + float( h & 255u ), p.y * 0.8 ) );
				alb *= 1.0 - below * streak * 0.18;
			}

			// ---- doors and panels that fill their piece ----
			if ( sty == 7 || sty == 8 || sty == 9 ) {
				if ( abs( p.x ) > hw || p.y > wh || p.y < 0.0 ) return;
				float e = min( hw - abs( p.x ), wh - p.y );
				if ( sty == 7 ) {
					// roll-up shutter: ribbed steel, a bottom rail, rust near the ground
					float rib = fract( p.y / 0.085 );
					alb = mix( vec3( 0.5, 0.51, 0.5 ), frame, 0.3 ) * ( 0.85 + 0.15 * smoothstep( 0.0, 0.5, rib ) );
					alb = mix( alb, vec3( 0.28, 0.14, 0.07 ), smoothstep( 0.7, 1.0, vnoise2( vec2( p.x * 3.0, p.y * 8.0 ) + float( h & 255u ) ) ) * smoothstep( 1.2, 0.0, p.y ) * 0.7 );
					nT = normalize( vec3( 0.0, sin( rib * 6.2832 ) * 0.5, 1.0 ) ); nS = 1.0;
					rough = 0.55; metal = 0.5;
					if ( p.y < 0.08 || e < 0.08 ) { alb = vec3( 0.2 ); metal = 0.7; }
					return;
				}
				if ( sty == 8 ) {
					// a painted panel door with a frame, four recessed panels and a knob
					if ( e < 0.07 ) { alb = FRAME[ fr ]; rough = 0.6; return; }
					alb = DOORS[ int( ( h >> 5u ) & 7u ) ];
					vec2 q = vec2( abs( p.x ), p.y );
					float pan = step( 0.14, hw - q.x ) * step( 0.18, q.x ) * ( step( 0.2, q.y ) * step( q.y, 0.95 ) + step( 1.15, q.y ) * step( q.y, wh - 0.22 ) );
					if ( pan > 0.5 ) alb *= 0.82;
					if ( length( vec2( p.x - ( ( h & 1u ) == 1u ? hw - 0.1 : - hw + 0.1 ), p.y - 1.0 ) ) < 0.035 ) { alb = vec3( 0.55, 0.5, 0.4 ); metal = 0.9; rough = 0.3; }
					rough = 0.55;
					return;
				}
				// glass door: aluminium frame, push bar, the shop or lobby behind
				if ( e < 0.08 || abs( p.y - 1.0 ) < 0.03 || ( ww > 1.3 && abs( p.x ) < 0.035 ) ) { alb = frame; metal = fmet; rough = 0.35; return; }
				vec3 room = bRoom( p, max( hw * 3.0, 3.0 ), 3.2, 6.0, Vf, h, 1 );
				alb = vec3( 0.02 ); rough = 0.06; metal = 0.0;
				emit += room * lightIn;
				return;
			}

			// ---- railing panels (galleries and balconies seen from afar) ----
			if ( sty == 15 ) {
				float bar = step( fract( u / 0.13 ), 0.25 );
				if ( v < 0.07 || v > wh - 0.07 || bar > 0.5 ) { alb = frame; metal = fmet; rough = 0.5; }
				else { alb = vec3( 0.03 ); rough = 1.0; emit += vec3( 0.55, 0.53, 0.5 ) * lightIn * 0.6; }
				return;
			}

			// ---- loggia seen from afar: a dark recess, a sliding door and a railing ----
			if ( sty == 14 ) {
				if ( v < 1.0 ) {
					float bar = step( fract( u / 0.13 ), 0.25 );
					if ( v > 0.93 || bar > 0.5 ) { alb = frame; metal = fmet; rough = 0.5; return; }
				}
				vec2 q = vec2( p.x, v );
				if ( abs( q.x ) < hw && q.y < wh ) {
					float e = min( hw - abs( q.x ), wh - q.y );
					if ( e < 0.05 || abs( q.x ) < 0.03 ) { alb = frame; metal = fmet; rough = 0.4; return; }
					alb = vec3( 0.02 ); rough = 0.07;
					emit += bRoom( q, hw, 2.6, 4.0, Vf, h, 0 ) * lightIn * 0.8;
					if ( candle ) emit += vec3( 1.0, 0.55, 0.2 ) * 0.25 * flick * exp( - dot( q - vec2( 0.0, 1.0 ), q - vec2( 0.0, 1.0 ) ) * 2.0 );
					return;
				}
				alb *= 0.35; // the shaded loggia walls
				return;
			}

			// ---- windows ----
			bool arch = sty == 13;
			float top = arch ? wh - hw : wh;
			bool inside = abs( p.x ) < hw && p.y > 0.0 && ( p.y < top || ( arch && length( vec2( p.x, p.y - top ) ) < hw ) );
			// sill shadow and a lintel line around the opening
			if ( ! inside ) {
				float ring = step( abs( p.x ), hw + 0.06 ) * step( - 0.06, p.y ) * step( p.y, wh + 0.06 );
				if ( ring > 0.5 && sty != 3 && sty != 4 ) alb *= 0.78;
				if ( sty == 3 ) { alb = mix( alb, frame * 0.8 + 0.08, 0.35 ); }
				return;
			}
			float e = min( hw - abs( p.x ), p.y );
			if ( ! arch ) e = min( e, wh - p.y ); else if ( p.y > top ) e = min( e, hw - length( vec2( p.x, p.y - top ) ) );
			float fw = sty == 3 ? 0.035 : sty == 4 ? 0.05 : 0.055;
			if ( e < fw ) { alb = frame; metal = fmet; rough = 0.45; nT = vec3( 0.0, 0.0, 1.0 ); return; }
			if ( state == 1 ) {
				// boarded up: weathered planks nailed across
				vec2 bq = vec2( p.x / 2.4 + float( h & 15u ) * 0.13, p.y / 2.4 );
				vec3 pl = textureGrad( tArr, vec3( bq.yx, 7.0 ), dpy.yx / 2.4, dpx.yx / 2.4 ).rgb;
				alb = pl * uGain[ 7 ] * vec3( 0.62, 0.5, 0.38 );
				float seam = smoothstep( 0.02, 0.0, abs( fract( p.y / 0.19 ) - 0.5 ) - 0.47 );
				alb *= 1.0 - seam * 0.6;
				rough = 0.9; metal = 0.0;
				return;
			}
			// mullions and louvres
			float bar = 0.0;
			if ( sty == 1 || sty == 5 ) bar = step( abs( p.x ), 0.025 );
			else if ( sty == 2 ) bar = step( fract( p.y / 0.105 ), 0.1 ) + step( abs( p.x ), 0.02 ) * step( 0.5, hw );
			else if ( sty == 6 ) bar = step( fract( p.x / 0.6 ), 0.04 ) + step( fract( p.y / 0.6 ), 0.04 );
			else if ( sty == 12 ) bar = step( abs( p.x ), 0.03 );
			else if ( sty == 4 ) bar = step( p.y, 0.3 );
			else if ( sty == 13 ) bar = step( fract( p.x / 0.28 + 0.5 ), 0.08 ) + step( fract( p.y / 0.4 ), 0.06 );
			if ( bar > 0.5 && state != 2 ) { alb = sty == 13 ? vec3( 0.04 ) : frame; metal = fmet; rough = 0.45; return; }
			if ( sty == 6 || sty == 11 ) {
				// wired / frosted glass: milky, lets a little light through
				alb = vec3( 0.55, 0.58, 0.58 ); rough = 0.35; metal = 0.0;
				emit += vec3( 0.6 ) * lightIn * 0.5;
				return;
			}
			if ( sty == 13 ) {
				// stained glass
				vec2 cell = floor( vec2( p.x / 0.28 + 0.5, p.y / 0.4 ) );
				uint ch = bWinHash( uint( cell.x + 17.0 ), uint( cell.y + 3.0 ) + h );
				vec3 sc = vec3( float( ch & 255u ), float( ( ch >> 8u ) & 255u ), float( ( ch >> 16u ) & 255u ) ) / 255.0;
				sc = mix( sc, vec3( 0.9, 0.75, 0.3 ), 0.3 );
				alb = sc * 0.08; rough = 0.2;
				emit += sc * sc * ( 0.02 + 0.35 * day );
				return;
			}
			// clear glass with a room behind
			float depth = sty == 4 ? 7.0 : sty == 3 || sty == 12 ? 6.0 : 3.6 + float( ( h >> 18u ) & 3u ) * 0.7;
			float roomH = max( sill + wh + 0.4, 2.6 );
			float halfW = sty == 4 || sty == 3 || sty == 12 ? max( hw * 2.5, 3.0 ) : max( bay * 0.5, hw + 0.2 );
			vec3 room = bRoom( vec2( p.x, p.y + sill ), halfW, roomH, depth, Vf, h, sty == 4 ? 1 : 0 );
			// curtains and blinds (homes, hotels, flats)
			int dress = int( ( h >> 28u ) & 7u );
			if ( sty != 4 && sty != 3 && sty != 12 ) {
				if ( dress == 0 || dress == 1 ) {
					float open = dress == 0 ? 0.3 : 0.05;
					if ( abs( p.x ) > hw * open ) room = WALLS[ int( ( h >> 14u ) & 7u ) ] * vec3( 0.9, 0.85, 0.8 ) * ( 0.75 + 0.25 * sin( p.x * 40.0 ) ) * 0.55;
				} else if ( dress == 2 ) {
					float down = wh * ( 0.3 + 0.6 * float( ( h >> 25u ) & 3u ) / 3.0 );
					if ( p.y > wh - down ) room = vec3( 0.7, 0.68, 0.62 ) * ( 0.7 + 0.3 * step( 0.3, fract( p.y / 0.05 ) ) ) * 0.5;
				}
			}
			if ( sty == 3 ) {
				// curtain wall: tinted, more reflective glass (bronze, blue-green or grey by the frame)
				vec3 tint = fr == 1 ? vec3( 0.5, 0.38, 0.25 ) : fr == 3 ? vec3( 0.3, 0.33, 0.36 ) : vec3( 0.32, 0.45, 0.48 );
				room *= tint * 0.6;
				alb = tint * 0.04; rough = 0.03; metal = 0.25;
			} else {
				alb = vec3( 0.02 ); rough = 0.05; metal = 0.0;
			}
			if ( state == 2 ) {
				// broken: a jagged hole, no reflection where the glass is gone
				float n = vnoise2( p * 6.0 + float( h & 255u ) );
				float hole = smoothstep( 0.52, 0.48, length( p - vec2( 0.0, wh * 0.5 ) ) / max( hw, 0.3 ) * 0.7 + n * 0.5 );
				rough = mix( rough, 1.0, hole ); alb = mix( alb, vec3( 0.0 ), hole );
			}
			// dust on the glass
			alb += vec3( 0.03, 0.028, 0.024 ) * vnoise2( p * 3.0 + float( h & 127u ) );
			emit += room * lightIn;
			if ( candle && sty != 3 && sty != 12 ) {
				vec2 c = p - vec2( ( float( ( h >> 3u ) & 7u ) / 7.0 - 0.5 ) * hw, wh * 0.35 );
				emit += vec3( 1.0, 0.5, 0.16 ) * ( 0.1 + 0.8 * exp( - dot( c, c ) * 4.0 ) ) * flick * uNight;
			}
		}
	#endif
`;

const MAP_F = /* glsl */`
	vec3 bAlb = vec3( 1.0 ), bEmit = vec3( 0.0 ), bNT = vec3( 0.0, 0.0, 1.0 );
	int bL = int( vMat + 0.5 ) & 63;
	int bFl = int( vMat + 0.5 );
	float bRough = ROUGH[ bL ], bMetal = METAL[ bL ], bNS = NSTR[ bL ];
	if ( bL == 32 ) bAlb = texture2D( tSign, vTUv ).rgb;
	else if ( bL > 0 ) {
		bAlb = texture( tArr, vec3( vTUv, float( bL ) ) ).rgb * uGain[ bL ];
		bNT = texture( tNrm, vec3( vTUv, float( bL ) ) ).xyz * 2.0 - 1.0;
	}
	bAlb *= vTint;
	#ifdef FACADE
	{
		vec3 wN = normalize( inverseTransformDirection( normalize( vNormal ), viewMatrix ) );
		// weathering: large blotches and a darker band near the ground
		if ( bL != 32 ) bAlb *= 0.9 + 0.1 * vnoise2( vWorldPos.xz * 0.35 + vWorldPos.y * 0.6 );
		if ( abs( wN.y ) < 0.5 ) bFacade( bAlb, bRough, bMetal, bEmit, bNT, bNS, wN );
	}
	#endif
	if ( ( bFl & 128 ) != 0 ) bEmit += bAlb * ( 2.5 + 1.2 * sin( uTime * 11.0 + vWorldPos.x * 3.0 ) * sin( uTime * 4.3 ) );
	diffuseColor.rgb *= min( bAlb, vec3( 1.0 ) );
`;

function makeLit( key, defines, T, state ) {
	const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 1, metalness: 0 } );
	mat.defines = { ...defines };
	const U = {
		tArr: { value: T.albedo }, tNrm: { value: T.normal }, tSign: { value: T.signs }, uGain: { value: T.gains },
		uInAmb: { value: 0.55 }, uInSun: { value: 1 }, uBState: { value: state },
	};
	mat.userData.u = U;
	patchMaterial( mat, key, ( sh ) => {
		Object.assign( sh.uniforms, U );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\n' + PARS_V )
			.replace( '#include <begin_vertex>', VERT );
		sh.fragmentShader = sh.fragmentShader
			.replace( 'void main() {', PARS_F + '\nvoid main() {' )
			.replace( '#include <map_fragment>', MAP_F )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = bRough;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = bMetal;' )
			.replace( '#include <normal_fragment_maps>', /* glsl */`
				if ( bNS > 0.0 ) {
					vec3 nt = bNT; nt.xy *= bNS;
					normal = normalize( bCotangent( normal, - vViewPosition, vTUv ) * nt );
				}` )
			.replace( '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bEmit;' )
			.replace( '#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
				if ( ( bFl & 64 ) != 0 ) {
					// inside, the sky's light arrives bounced off floors and walls: dimmer, greyer and warmer
					vec3 ind = reflectedLight.indirectDiffuse;
					float il = dot( ind, vec3( 0.2126, 0.7152, 0.0722 ) );
					// ceilings catch the light bounced off the floor
					float bUp = inverseTransformDirection( normal, viewMatrix ).y;
					reflectedLight.indirectDiffuse = mix( vec3( il ), ind, 0.3 ) * vec3( 1.06, 1.0, 0.9 ) * uInAmb * ( 1.0 + 0.6 * max( - bUp, 0.0 ) );
					reflectedLight.indirectSpecular *= uInAmb * 0.6;
					reflectedLight.directDiffuse *= uInSun; reflectedLight.directSpecular *= uInSun;
				}` );
	} );
	return mat;
}

function makeDepth( key, far, state ) {
	const mat = new THREE.MeshDepthMaterial();
	mat.defines = { FACADE: '', DEPTH_PASS: '' };
	if ( far ) mat.defines.LOD_FAR = '';
	mat.onBeforeCompile = ( sh ) => {
		sh.uniforms.uBState = { value: state };
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec2 aTag; uniform highp sampler2D uBState;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n' + HIDE_GLSL );
	};
	mat.customProgramCacheKey = () => key;
	return mat;
}

let _mats = null;
export function buildingMaterials( nBuildings ) {
	if ( _mats ) return _mats;
	const T = buildingTextures();
	const rows = Math.max( 1, Math.ceil( nBuildings / STATE_W ) );
	const data = new Uint8Array( STATE_W * rows * 4 );
	for ( let i = 0; i < STATE_W * rows; i ++ ) { data[ i * 4 + 1 ] = 255; }
	const state = new THREE.DataTexture( data, STATE_W, rows, THREE.RGBAFormat, THREE.UnsignedByteType );
	state.magFilter = state.minFilter = THREE.NearestFilter;
	state.generateMipmaps = false;
	state.needsUpdate = true;
	const glass = patchMaterial( new THREE.MeshStandardMaterial( {
		color: 0x9fb4b4, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
	} ), 'bld-glass', ( sh ) => {
		// dusty, smudged panes: a little more opaque in patches
		sh.fragmentShader = sh.fragmentShader.replace( '#include <alphamap_fragment>', /* glsl */`#include <alphamap_fragment>
			diffuseColor.a *= 0.8 + 0.5 * vnoise2( vWorldPos.xz * 2.3 + vWorldPos.y * 3.1 );` );
	} );
	const decal = patchMaterial( new THREE.MeshStandardMaterial( {
		map: T.decals, roughness: 0.75, metalness: 0, transparent: true, depthWrite: false, vertexColors: true,
		polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 4,
	} ), 'bld-decal' );
	_mats = {
		T, state, stateData: data, rows,
		near: makeLit( 'bld-near', { FACADE: '' }, T, state ),
		far: makeLit( 'bld-far', { FACADE: '', LOD_FAR: '' }, T, state ),
		interior: makeLit( 'bld-int', {}, T, state ),
		depthNear: makeDepth( 'bld-depth-near', false, state ),
		depthFar: makeDepth( 'bld-depth-far', true, state ),
		glass, decal,
	};
	return _mats;
}

// set a building's hide state (see the header); call commitState() once per frame after changes
export function setBuildingState( M, bi, farHidden, s0 = 255, s1 = 0, extra = 0, shadowHide = false ) {
	const o = bi * 4, d = M.stateData;
	const r = ( farHidden ? 1 : 0 ) | ( shadowHide ? 2 : 0 );
	if ( d[ o ] === r && d[ o + 1 ] === s0 && d[ o + 2 ] === s1 && d[ o + 3 ] === extra ) return false;
	d[ o ] = r; d[ o + 1 ] = s0; d[ o + 2 ] = s1; d[ o + 3 ] = extra;
	M.stateDirty = true;
	return true;
}
export function commitState( M ) {
	if ( ! M.stateDirty ) return;
	M.stateDirty = false;
	M.state.needsUpdate = true;
}

// interior light when the sun can't be shadowed (shadows off): keep the sun off interior floors
export function setShadowsEnabled( M, on ) {
	for ( const m of [ M.near, M.far, M.interior ] ) m.userData.u.uInSun.value = on ? 1 : 0.2;
}

// once on the GPU the CPU copies are dead weight (bounds are set up front, nothing raycasts these meshes)
function freeAfterUpload( b ) {
	const free = function () { this.array = new this.array.constructor( 1 ); };
	for ( const k in b.attributes ) b.attributes[ k ].onUpload( free );
	if ( b.index ) b.index.onUpload( free );
	return b;
}

// three.js attributes for a Geo.finish() result
export function geoToBuffer( g ) {
	const b = new THREE.BufferGeometry();
	b.setAttribute( 'position', new THREE.BufferAttribute( g.pos, 3 ) );
	b.setAttribute( 'normal', new THREE.BufferAttribute( g.nor, 3, true ) );
	b.setAttribute( 'aUv', new THREE.BufferAttribute( g.uv, 2 ) );
	b.setAttribute( 'aCol', new THREE.BufferAttribute( g.col, 3, true ) );
	b.setAttribute( 'aMat', new THREE.BufferAttribute( g.mat, 1 ) );
	if ( g.wn ) {
		b.setAttribute( 'aTag', new THREE.BufferAttribute( g.tag, 2 ) );
		b.setAttribute( 'aWin', new THREE.BufferAttribute( g.wn, 4 ) );
		b.setAttribute( 'aWin2', new THREE.BufferAttribute( g.wn2, 4 ) );
	}
	b.setIndex( new THREE.BufferAttribute( g.idx, 1 ) );
	const bb = g.bounds;
	b.boundingBox = new THREE.Box3( new THREE.Vector3( bb[ 0 ], bb[ 1 ], bb[ 2 ] ), new THREE.Vector3( bb[ 3 ], bb[ 4 ], bb[ 5 ] ) );
	b.boundingSphere = b.boundingBox.getBoundingSphere( new THREE.Sphere() );
	return freeAfterUpload( b );
}

// decals share the Geo format: uv + vertex colour into a standard material
export function decalToBuffer( g ) {
	const b = new THREE.BufferGeometry();
	b.setAttribute( 'position', new THREE.BufferAttribute( g.pos, 3 ) );
	b.setAttribute( 'normal', new THREE.BufferAttribute( g.nor, 3, true ) );
	b.setAttribute( 'uv', new THREE.BufferAttribute( g.uv, 2 ) );
	b.setAttribute( 'color', new THREE.BufferAttribute( g.col, 3, true ) );
	b.setIndex( new THREE.BufferAttribute( g.idx, 1 ) );
	const bb = g.bounds;
	b.boundingBox = new THREE.Box3( new THREE.Vector3( bb[ 0 ], bb[ 1 ], bb[ 2 ] ), new THREE.Vector3( bb[ 3 ], bb[ 4 ], bb[ 5 ] ) );
	b.boundingSphere = b.boundingBox.getBoundingSphere( new THREE.Sphere() );
	return b;
}

export function glassToBuffer( g ) {
	const b = new THREE.BufferGeometry();
	b.setAttribute( 'position', new THREE.BufferAttribute( g.pos, 3 ) );
	b.setAttribute( 'normal', new THREE.BufferAttribute( g.nor, 3 ) );
	b.setIndex( new THREE.BufferAttribute( g.idx, 1 ) );
	b.computeBoundingSphere();
	return b;
}
