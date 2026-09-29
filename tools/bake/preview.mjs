import fs from 'node:fs';
import { PNG } from 'pngjs';
import { loadMosaic, sampleGame } from './heights.mjs';
import { WORLD_HALF_X, WORLD_HALF_Z } from './geo.mjs';
const m = loadMosaic( process.argv[ 2 ] );
const S = 64, W = Math.floor( WORLD_HALF_X * 2 / S ), H = Math.floor( WORLD_HALF_Z * 2 / S );
const png = new PNG( { width: W, height: H } );
let mx = - 1e9, mn = 1e9;
for ( let y = 0; y < H; y ++ ) for ( let x = 0; x < W; x ++ ) {
	const h = sampleGame( m, - WORLD_HALF_X + x * S, - WORLD_HALF_Z + y * S );
	mx = Math.max( mx, h ); mn = Math.min( mn, h );
	const i = ( y * W + x ) * 4;
	if ( h < 0 ) { const t = Math.min( 1, - h / 200 ); png.data[ i ] = 30 * ( 1 - t ); png.data[ i + 1 ] = 160 * ( 1 - t ) + 30; png.data[ i + 2 ] = 200 * ( 1 - t ) + 80; }
	else { const t = Math.min( 1, h / 700 ); png.data[ i ] = 60 + 190 * t; png.data[ i + 1 ] = 140 + 100 * t; png.data[ i + 2 ] = 60 + 190 * t; }
	png.data[ i + 3 ] = 255;
}
fs.writeFileSync( process.argv[ 3 ], PNG.sync.write( png ) );
console.log( W, H, mn, mx );
