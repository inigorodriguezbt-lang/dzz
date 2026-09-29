// Worker side: renders one map tile (RGBA) from the height field — shaded relief, land cover,
// sea depth, contour lines. Roads, buildings and labels are drawn as vectors on the main thread.
import { FLAG } from '../world/HeightField.js';

const SEA = [
	[ 0, [ 104, 214, 208 ] ], [ - 0.6, [ 70, 190, 200 ] ], [ - 3, [ 40, 150, 185 ] ], [ - 12, [ 28, 108, 160 ] ],
	[ - 40, [ 22, 76, 132 ] ], [ - 150, [ 16, 52, 100 ] ], [ - 600, [ 12, 36, 74 ] ],
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

export function renderMapTile( hf, { x0, z0, size, px } ) {
	const N = px, step = size / N, W = N + 2;
	const hs = new Float32Array( W * W );
	const fine = step <= 12;
	for ( let j = 0; j < W; j ++ ) for ( let i = 0; i < W; i ++ ) {
		const x = x0 + ( i - 1 + 0.5 ) * step, z = z0 + ( j - 1 + 0.5 ) * step;
		hs[ j * W + i ] = fine ? hf.baseHeight( x, z ) : hf.coarseBilinear( x, z );
	}
	const out = new Uint8ClampedArray( N * N * 4 );
	const s4 = [ 0, 0, 0, 0 ], c = [ 0, 0, 0 ];
	for ( let j = 0; j < N; j ++ ) for ( let i = 0; i < N; i ++ ) {
		const h = hs[ ( j + 1 ) * W + i + 1 ];
		const x = x0 + ( i + 0.5 ) * step, z = z0 + ( j + 0.5 ) * step;
		const k = ( j * N + i ) * 4;
		if ( h < 0 ) {
			seaColor( h, c );
			// a pale fringe where the reef meets the sand
			const shore = sm( - 0.8, 0, h );
			c[ 0 ] = mix( c[ 0 ], 190, shore * 0.35 ); c[ 1 ] = mix( c[ 1 ], 232, shore * 0.35 ); c[ 2 ] = mix( c[ 2 ], 222, shore * 0.35 );
		} else {
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
			if ( h < 2.2 ) { const s = 1 - sm( 1.2, 2.2, h ); r = mix( r, 232, s * 0.7 ); g = mix( g, 218, s * 0.7 ); b = mix( b, 178, s * 0.7 ); }
			if ( fine ) {
				const fl = hf.flagsNear( x, z );
				if ( fl & FLAG.CITY ) { r = mix( r, 214, 0.55 ); g = mix( g, 210, 0.55 ); b = mix( b, 200, 0.55 ); }
			} else {
				const city = hf.flagAt( x, z, FLAG.CITY );
				if ( city > 0 ) { r = mix( r, 214, city * 0.55 ); g = mix( g, 210, city * 0.55 ); b = mix( b, 200, city * 0.55 ); }
			}
			// hillshade from the north-west
			const dx = ( hs[ ( j + 1 ) * W + i + 2 ] - hs[ ( j + 1 ) * W + i ] ) / ( 2 * step );
			const dz = ( hs[ ( j + 2 ) * W + i + 1 ] - hs[ j * W + i + 1 ] ) / ( 2 * step );
			const shade = Math.max( 0.45, Math.min( 1.35, 1 + ( - dx * 0.7 - dz * 0.7 ) * 3.2 ) );
			r *= shade; g *= shade; b *= shade;
			// contour lines every 25 m (bolder every 100 m)
			const iv = 25;
			const a = Math.floor( h / iv ), n = Math.floor( hs[ ( j + 1 ) * W + i + 2 ] / iv ), s = Math.floor( hs[ ( j + 2 ) * W + i + 1 ] / iv );
			if ( step < 40 && ( a !== n || a !== s ) && h > 3 ) {
				const major = ( Math.max( a, n, s ) * iv ) % 100 === 0;
				const k2 = major ? 0.72 : 0.86;
				r *= k2; g *= k2; b *= k2 * 0.98;
			}
			c[ 0 ] = r; c[ 1 ] = g; c[ 2 ] = b;
		}
		out[ k ] = c[ 0 ]; out[ k + 1 ] = c[ 1 ]; out[ k + 2 ] = c[ 2 ]; out[ k + 3 ] = 255;
	}
	return { rgba: out, transfer: [ out.buffer ] };
}
