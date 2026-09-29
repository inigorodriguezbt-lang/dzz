import fs from 'node:fs';
import { PNG } from 'pngjs';
import { loadMosaic, sampleGame } from './heights.mjs';
import { lonLatToWorld } from './geo.mjs';
const m = loadMosaic( process.argv[ 2 ] );
const [ cx, cz ] = lonLatToWorld( +process.argv[ 4 ], +process.argv[ 5 ] );
const S = +process.argv[ 6 ], W = 800, H = 600;
const png = new PNG( { width: W, height: H } );
const hs = [];
for ( let y = 0; y < H; y ++ ) for ( let x = 0; x < W; x ++ ) hs.push( sampleGame( m, cx + ( x - W / 2 ) * S, cz + ( y - H / 2 ) * S ) );
for ( let y = 1; y < H - 1; y ++ ) for ( let x = 1; x < W - 1; x ++ ) {
	const h = hs[ y * W + x ], i = ( y * W + x ) * 4;
	const dx = ( hs[ y * W + x + 1 ] - hs[ y * W + x - 1 ] ) / ( 2 * S ), dy = ( hs[ ( y + 1 ) * W + x ] - hs[ ( y - 1 ) * W + x ] ) / ( 2 * S );
	const shade = Math.max( 0, Math.min( 1, 0.6 - dx * 1.5 - dy * 1.5 ) );
	let r, g, b;
	if ( h < 0 ) { const t = Math.min( 1, - h / 60 ); r = 40 * ( 1 - t ) + 10; g = 190 * ( 1 - t ) + 40; b = 170 * ( 1 - t ) + 80; }
	else { const t = Math.min( 1, h / 250 ); r = 80 + 150 * t; g = 130 + 90 * t; b = 60 + 150 * t; r *= 0.5 + shade; g *= 0.5 + shade; b *= 0.5 + shade; }
	png.data[ i ] = Math.min( 255, r ); png.data[ i + 1 ] = Math.min( 255, g ); png.data[ i + 2 ] = Math.min( 255, b ); png.data[ i + 3 ] = 255;
}
fs.writeFileSync( process.argv[ 3 ], PNG.sync.write( png ) );
