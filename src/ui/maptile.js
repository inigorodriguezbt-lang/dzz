// Worker side: renders one map tile (RGBA) from the height field: land cover, soft relief, sea depth, the
// coastline and contour lines. Roads, buildings and labels are vectors drawn on the main thread (MapView.js).
// A paper map (docs/UI_DAYZ.md, UI_SPEC.md 8.2): cream paper, pale greens where it is wet or wooded, muted
// grey-blue water, brown contours and a thin dark coastline, so the dark roads, markers and labels lead.
import { FLAG } from '../world/HeightField.js';

// depth stops (m) -> colour, shallow reef to the deep channel: printed-map blues, only a few steps apart. The
// last stop is also the out-of-world fill (MapView INK.void, map.css)
const SEA = [
	[ 0, [ 198, 220, 216 ] ], [ - 0.6, [ 188, 213, 213 ] ], [ - 3, [ 176, 205, 209 ] ], [ - 12, [ 165, 196, 204 ] ],
	[ - 40, [ 154, 187, 199 ] ], [ - 150, [ 145, 178, 194 ] ], [ - 600, [ 137, 170, 189 ] ],
];

function seaColor( h, out ) {
	for ( let i = 0; i < SEA.length - 1; i ++ ) {
		const [ h0, c0 ] = SEA[ i ], [ h1, c1 ] = SEA[ i + 1 ];
		if ( h >= h1 ) {
			const t = ( h0 - h ) / ( h0 - h1 );
			out[ 0 ] = c0[ 0 ] + ( c1[ 0 ] - c0[ 0 ] ) * t; out[ 1 ] = c0[ 1 ] + ( c1[ 1 ] - c0[ 1 ] ) * t; out[ 2 ] = c0[ 2 ] + ( c1[ 2 ] - c0[ 2 ] ) * t;
			return out;
		}
	}
	const c = SEA[ SEA.length - 1 ][ 1 ];
	out[ 0 ] = c[ 0 ]; out[ 1 ] = c[ 1 ]; out[ 2 ] = c[ 2 ];
	return out;
}

const mix = ( a, b, t ) => a + ( b - a ) * t;
const sm = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };

// paper, and the inks printed on it
const PAPER = [ 236, 229, 207 ];
const WOOD = [ 199, 211, 166 ]; // wet ground and forest: a pale green tint, not a fill
const SCRUB = [ 221, 222, 186 ];
const LAVA = [ 205, 198, 186 ];
const SAND = [ 241, 230, 196 ];
// built-up ground: a grey a step darker than the paper, so pale streets and dark footprints both read on it
const CITY = [ 202, 195, 181 ];
const CONTOUR = [ 150, 104, 62 ];

function landColor( hf, x, z, h, s4, c, relief, i, j, at, G, step ) {
	hf.surfaceAt( x, z, s4 );
	const moist = s4[ 0 ], lava = s4[ 1 ], red = s4[ 2 ], use = s4[ 3 ];
	// land cover as tints of the paper
	const m1 = sm( 0.25, 0.7, moist ), m2 = sm( 0.6, 0.9, moist );
	let r = mix( PAPER[ 0 ], SCRUB[ 0 ], m1 ), g = mix( PAPER[ 1 ], SCRUB[ 1 ], m1 ), b = mix( PAPER[ 2 ], SCRUB[ 2 ], m1 );
	r = mix( r, WOOD[ 0 ], m2 ); g = mix( g, WOOD[ 1 ], m2 ); b = mix( b, WOOD[ 2 ], m2 );
	r = mix( r, 232, red * 0.5 ); g = mix( g, 210, red * 0.5 ); b = mix( b, 188, red * 0.5 );
	if ( use === 1 ) { r = mix( r, 230, 0.4 ); g = mix( g, 226, 0.4 ); b = mix( b, 190, 0.4 ); }
	if ( use === 2 ) { r = mix( r, 212, 0.4 ); g = mix( g, 222, 0.4 ); b = mix( b, 180, 0.4 ); }
	const lv = sm( 0.25, 0.6, lava );
	r = mix( r, LAVA[ 0 ], lv ); g = mix( g, LAVA[ 1 ], lv ); b = mix( b, LAVA[ 2 ], lv );
	const snow = sm( 600, 680, h );
	r = mix( r, 246, snow ); g = mix( g, 245, snow ); b = mix( b, 240, snow );
	if ( h < 2.2 ) { const s = 1 - sm( 1.2, 2.2, h ); r = mix( r, SAND[ 0 ], s * 0.8 ); g = mix( g, SAND[ 1 ], s * 0.8 ); b = mix( b, SAND[ 2 ], s * 0.8 ); }
	// coverage from the 8 m mask, sharpened but still anti-aliased (a hard mask draws saw teeth along the rotated grids)
	const city = sm( 0.2, 0.8, hf.flagAt( x, z, FLAG.CITY ) );
	if ( city > 0 ) { r = mix( r, CITY[ 0 ], city * 0.8 ); g = mix( g, CITY[ 1 ], city * 0.8 ); b = mix( b, CITY[ 2 ], city * 0.8 ); }
	// soft hillshade from the north-west: printed relief, not a photograph
	const dx = ( at( i + G, j ) - at( i - G, j ) ) / ( 2 * G * step );
	const dz = ( at( i, j + G ) - at( i, j - G ) ) / ( 2 * G * step );
	// built-up ground is graded flat in pads: its relief would only draw the pad edges
	const shade = Math.max( 0.8, Math.min( 1.06, 1 + ( - dx * 0.7 - dz * 0.7 ) * 1.8 * relief * ( 1 - city * 0.85 ) ) );
	r *= shade; g *= shade; b *= shade;
	// brown contour lines every 25 m (stronger every 100 m), where a pixel is small enough to hold one: about a
	// pixel wide, anti-aliased by the distance to the nearest contour level (height gap over the slope)
	if ( step < 40 && h > 3 ) {
		const iv = 25, q = h / iv, lvl = Math.round( q );
		const px = Math.abs( q - lvl ) * iv / ( Math.hypot( dx, dz ) + 1e-4 ) / step;
		const w = ( 1 - sm( 0.35, 1.1, px ) ) * ( lvl % 4 === 0 ? 0.6 : 0.34 ) * ( 1 - city * 0.7 );
		if ( w > 0 && lvl > 0 ) { r = mix( r, CONTOUR[ 0 ], w ); g = mix( g, CONTOUR[ 1 ], w ); b = mix( b, CONTOUR[ 2 ], w ); }
	}
	c[ 0 ] = r; c[ 1 ] = g; c[ 2 ] = b;
	return c;
}

// the height data ends in open ocean at the edge of the world, often shallower than the last stop: the sea fades
// into the out-of-world fill over this many metres so that edge never shows as a straight seam
const EDGE = 4000;
const DEEP = SEA[ SEA.length - 1 ][ 1 ];
const COAST = [ 74, 102, 118 ]; // the coastline's ink

export function renderMapTile( hf, { x0, z0, size, px } ) {
	const N = px, step = size / N;
	const X0 = hf.x0, X1 = hf.x0 + 2 * hf.halfX, Z0 = hf.z0, Z1 = hf.z0 + 2 * hf.halfZ;
	// the hillshade gradient spans at least one 8 m height-grid cell, else the finest level shows every facet
	const G = Math.max( 1, Math.round( 8 / step ) ), W = N + 2 * G;
	const hs = new Float32Array( W * W );
	const fine = step <= 12;
	for ( let j = 0; j < W; j ++ ) for ( let i = 0; i < W; i ++ ) {
		const x = x0 + ( i - G + 0.5 ) * step, z = z0 + ( j - G + 0.5 ) * step;
		hs[ j * W + i ] = fine ? hf.baseHeight( x, z ) : hf.coarseBilinear( x, z );
	}
	const at = ( i, j ) => hs[ ( j + G ) * W + i + G ];
	const out = new Uint8ClampedArray( N * N * 4 );
	const s4 = [ 0, 0, 0, 0 ], sea = [ 0, 0, 0 ], land = [ 0, 0, 0 ];
	// the finest level shows every graded pad and cut of the city terrain: keep its relief quieter
	const relief = step <= 4 ? 0.6 : 1;
	for ( let j = 0; j < N; j ++ ) for ( let i = 0; i < N; i ++ ) {
		let h = at( i, j );
		const x = x0 + ( i + 0.5 ) * step, z = z0 + ( j + 0.5 ) * step;
		const k = ( j * N + i ) * 4;
		// the terrain data holds exactly 0 where it has no samples (a strip at the south-west corner): open sea
		if ( h === 0 && ! hf.islandAt( x, z ) ) h = - 600;
		// the coast blends over half a metre either side of sea level, so it is smooth at any zoom
		const t = sm( - 0.5, 0.5, h );
		if ( t < 1 ) {
			seaColor( Math.min( h, 0 ), sea );
			const e = sm( 0, EDGE, Math.min( x - X0, X1 - x, z - Z0, Z1 - z ) );
			if ( e < 1 ) { sea[ 0 ] = mix( DEEP[ 0 ], sea[ 0 ], e ); sea[ 1 ] = mix( DEEP[ 1 ], sea[ 1 ], e ); sea[ 2 ] = mix( DEEP[ 2 ], sea[ 2 ], e ); }
		}
		if ( t > 0 ) landColor( hf, x, z, h, s4, land, relief, i, j, at, G, step );
		let r = mix( sea[ 0 ], land[ 0 ], t ), gg = mix( sea[ 1 ], land[ 1 ], t ), b = mix( sea[ 2 ], land[ 2 ], t );
		// a thin dark coastline, about a pixel wide at any level (the distance to sea level over the slope, like
		// the contours)
		if ( h > - 12 && h < 12 ) {
			const sl = Math.hypot( at( i + 1, j ) - at( i - 1, j ), at( i, j + 1 ) - at( i, j - 1 ) ) / ( 2 * step );
			const w = ( 1 - sm( 0.3, 0.9, Math.abs( h ) / ( sl + 1e-4 ) / step ) ) * 0.6;
			if ( w > 0 ) { r = mix( r, COAST[ 0 ], w ); gg = mix( gg, COAST[ 1 ], w ); b = mix( b, COAST[ 2 ], w ); }
		}
		out[ k ] = r; out[ k + 1 ] = gg; out[ k + 2 ] = b; out[ k + 3 ] = 255;
	}
	return { rgba: out, transfer: [ out.buffer ] };
}
