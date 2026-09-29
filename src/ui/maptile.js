// Worker side: renders one map tile (RGBA) from the height field: shaded relief, land cover, sea depth,
// contour lines. Roads, buildings and labels are vectors drawn on the main thread (MapView.js).
// Palette per docs/UI_SPEC.md 8.2: a quiet, slightly desaturated relief so roads, markers and labels lead.
import { FLAG } from '../world/HeightField.js';

// depth stops (m) -> colour, shallow reef to the deep channel; the last stop is also the out-of-world fill
const SEA = [
	[ 0, [ 134, 201, 204 ] ], [ - 0.6, [ 94, 178, 191 ] ], [ - 3, [ 60, 143, 174 ] ], [ - 12, [ 43, 110, 150 ] ],
	[ - 40, [ 34, 85, 127 ] ], [ - 150, [ 27, 63, 102 ] ], [ - 600, [ 21, 46, 77 ] ],
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

// built-up ground: a neutral grey a step darker than the land around it, so white streets and dark
// building footprints both read on it
const CITY = [ 150, 150, 146 ];

function landColor( hf, x, z, h, s4, c, relief, i, j, at, G, step ) {
	hf.surfaceAt( x, z, s4 );
	const moist = s4[ 0 ], lava = s4[ 1 ], red = s4[ 2 ], use = s4[ 3 ];
	// land cover
	let r = mix( 196, 104, sm( 0.2, 0.7, moist ) ), g = mix( 184, 150, sm( 0.2, 0.7, moist ) ), b = mix( 132, 88, sm( 0.2, 0.7, moist ) );
	r = mix( r, 72, sm( 0.62, 0.9, moist ) ); g = mix( g, 122, sm( 0.62, 0.9, moist ) ); b = mix( b, 70, sm( 0.62, 0.9, moist ) );
	r = mix( r, 176, red * 0.8 ); g = mix( g, 112, red * 0.8 ); b = mix( b, 84, red * 0.8 );
	if ( use === 1 ) { r = mix( r, 150, 0.4 ); g = mix( g, 150, 0.4 ); b = mix( b, 96, 0.4 ); }
	if ( use === 2 ) { r = mix( r, 120, 0.4 ); g = mix( g, 168, 0.4 ); b = mix( b, 90, 0.4 ); }
	r = mix( r, 70, sm( 0.25, 0.6, lava ) ); g = mix( g, 66, sm( 0.25, 0.6, lava ) ); b = mix( b, 66, sm( 0.25, 0.6, lava ) );
	const snow = sm( 600, 680, h );
	r = mix( r, 236, snow ); g = mix( g, 240, snow ); b = mix( b, 244, snow );
	if ( h < 2.2 ) { const s = 1 - sm( 1.2, 2.2, h ); r = mix( r, 226, s * 0.7 ); g = mix( g, 214, s * 0.7 ); b = mix( b, 180, s * 0.7 ); }
	// coverage from the 8 m mask, sharpened but still anti-aliased (a hard mask draws saw teeth along the rotated grids)
	const city = sm( 0.2, 0.8, hf.flagAt( x, z, FLAG.CITY ) );
	if ( city > 0 ) { r = mix( r, CITY[ 0 ], city * 0.7 ); g = mix( g, CITY[ 1 ], city * 0.7 ); b = mix( b, CITY[ 2 ], city * 0.7 ); }
	// 25% toward grey: the terrain is backdrop, not content
	const l = 0.299 * r + 0.587 * g + 0.114 * b;
	r = mix( r, l, 0.25 ); g = mix( g, l, 0.25 ); b = mix( b, l, 0.25 );
	// hillshade from the north-west
	const dx = ( at( i + G, j ) - at( i - G, j ) ) / ( 2 * G * step );
	const dz = ( at( i, j + G ) - at( i, j - G ) ) / ( 2 * G * step );
	// built-up ground is graded flat in pads: its relief would only draw the pad edges
	const shade = Math.max( 0.6, Math.min( 1.25, 1 + ( - dx * 0.7 - dz * 0.7 ) * 3.2 * relief * ( 1 - city * 0.85 ) ) );
	r *= shade; g *= shade; b *= shade;
	// contour lines every 25 m (a little stronger every 100 m), where a pixel is small enough to hold one: about a
	// pixel wide, anti-aliased by the distance to the nearest contour level (height gap over the slope)
	if ( step < 40 && h > 3 ) {
		const iv = 25, q = h / iv, lvl = Math.round( q );
		const px = Math.abs( q - lvl ) * iv / ( Math.hypot( dx, dz ) + 1e-4 ) / step;
		const w = 1 - sm( 0.35, 1.1, px );
		if ( w > 0 && lvl > 0 ) { const k2 = 1 - w * ( lvl % 4 === 0 ? 0.18 : 0.1 ); r *= k2; g *= k2; b *= k2; }
	}
	c[ 0 ] = r; c[ 1 ] = g; c[ 2 ] = b;
	return c;
}

export function renderMapTile( hf, { x0, z0, size, px } ) {
	const N = px, step = size / N;
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
			// a pale fringe where the reef meets the sand
			const shore = sm( - 0.8, 0, h ) * 0.3;
			sea[ 0 ] = mix( sea[ 0 ], 180, shore ); sea[ 1 ] = mix( sea[ 1 ], 220, shore ); sea[ 2 ] = mix( sea[ 2 ], 214, shore );
		}
		if ( t > 0 ) landColor( hf, x, z, h, s4, land, relief, i, j, at, G, step );
		out[ k ] = mix( sea[ 0 ], land[ 0 ], t ); out[ k + 1 ] = mix( sea[ 1 ], land[ 1 ], t ); out[ k + 2 ] = mix( sea[ 2 ], land[ 2 ], t ); out[ k + 3 ] = 255;
	}
	return { rgba: out, transfer: [ out.buffer ] };
}
