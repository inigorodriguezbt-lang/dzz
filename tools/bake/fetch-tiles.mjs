// Downloads Terrarium elevation tiles (AWS Terrain Tiles, public domain / open data sources:
// USGS NED, SRTM, ETOPO1, GMRT) covering the Hawaiian Islands into a local cache.
//   node tools/bake/fetch-tiles.mjs <cacheDir>
import fs from 'node:fs';
import path from 'node:path';
import { BOUNDS, ZOOM, lonToTileX, latToTileY } from './geo.mjs';

const cache = process.argv[ 2 ] || '.tile-cache';
fs.mkdirSync( cache, { recursive: true } );
const x0 = Math.floor( lonToTileX( BOUNDS.west, ZOOM ) ), x1 = Math.floor( lonToTileX( BOUNDS.east, ZOOM ) );
const y0 = Math.floor( latToTileY( BOUNDS.north, ZOOM ) ), y1 = Math.floor( latToTileY( BOUNDS.south, ZOOM ) );
const jobs = [];
for ( let y = y0; y <= y1; y ++ ) for ( let x = x0; x <= x1; x ++ ) jobs.push( [ x, y ] );
console.log( `zoom ${ZOOM}: x ${x0}..${x1}, y ${y0}..${y1} -> ${jobs.length} tiles` );
let done = 0;
async function worker() {
	while ( jobs.length ) {
		const [ x, y ] = jobs.shift();
		const file = path.join( cache, `${ZOOM}_${x}_${y}.png` );
		if ( fs.existsSync( file ) && fs.statSync( file ).size > 100 ) { done ++; continue; }
		for ( let attempt = 0; attempt < 5; attempt ++ ) {
			try {
				const res = await fetch( `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png` );
				if ( ! res.ok ) throw new Error( res.status );
				fs.writeFileSync( file, Buffer.from( await res.arrayBuffer() ) );
				break;
			} catch ( e ) {
				await new Promise( r => setTimeout( r, 500 * 2 ** attempt ) );
			}
		}
		if ( ++ done % 50 === 0 ) console.log( done );
	}
}
await Promise.all( Array.from( { length: 16 }, worker ) );
console.log( 'done', done );
