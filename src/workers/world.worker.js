// World worker: builds terrain node meshes, vegetation scatter and other heavy geometry off the
// main thread. Receives the decoded terrain buffer once ('init'), then jobs by type.
import { HeightField, FLAG, vnoise, hash2 } from '../world/HeightField.js';
import { scatterCell } from '../world/scatter.js';
import { buildStreetCell } from '../world/streetgen.js';
import { renderMapTile } from '../ui/maptile.js';

let hf = null;
let world = null;

export const GRID = 32; // quads per node side

const handlers = {
	init( msg ) {
		hf = new HeightField( msg.buffer, msg.meta );
		world = msg.world;
		return { ok: true };
	},

	terrain( { x0, z0, size, skirt } ) {
		const N = GRID, V = N + 1, step = size / N;
		const nMain = V * V, nSkirt = V * 4;
		const pos = new Float32Array( ( nMain + nSkirt ) * 3 );
		const nor = new Int8Array( ( nMain + nSkirt ) * 4 );
		const surf = new Uint8Array( ( nMain + nSkirt ) * 4 );
		const mask = new Uint8Array( ( nMain + nSkirt ) * 4 );
		// heights on a 1-vertex border so normals are consistent across nodes
		const W = V + 2;
		const hs = new Float32Array( W * W );
		for ( let j = 0; j < W; j ++ ) for ( let i = 0; i < W; i ++ ) hs[ j * W + i ] = hf.heightAt( x0 + ( i - 1 ) * step, z0 + ( j - 1 ) * step );
		const s4 = [ 0, 0, 0, 0 ];
		let minY = Infinity, maxY = - Infinity;
		for ( let j = 0; j < V; j ++ ) for ( let i = 0; i < V; i ++ ) {
			const k = j * V + i;
			const x = x0 + i * step, z = z0 + j * step;
			const y = hs[ ( j + 1 ) * W + i + 1 ];
			pos[ k * 3 ] = i * step; pos[ k * 3 + 1 ] = y; pos[ k * 3 + 2 ] = j * step;
			minY = Math.min( minY, y ); maxY = Math.max( maxY, y );
			const hx = hs[ ( j + 1 ) * W + i + 2 ] - hs[ ( j + 1 ) * W + i ];
			const hz = hs[ ( j + 2 ) * W + i + 1 ] - hs[ j * W + i + 1 ];
			let nx = - hx, ny = 2 * step, nz = - hz;
			const l = Math.hypot( nx, ny, nz );
			nor[ k * 4 ] = Math.round( nx / l * 127 ); nor[ k * 4 + 1 ] = Math.round( ny / l * 127 ); nor[ k * 4 + 2 ] = Math.round( nz / l * 127 );
			hf.surfaceAt( x, z, s4 );
			surf[ k * 4 ] = s4[ 0 ] * 255; surf[ k * 4 + 1 ] = s4[ 1 ] * 255; surf[ k * 4 + 2 ] = s4[ 2 ] * 255;
			if ( step <= 16 ) {
				const fl = hf.flagsNear( x, z );
				surf[ k * 4 + 3 ] = ( fl & FLAG.FIELD ) ? ( s4[ 3 ] === 2 ? 170 : 85 ) : 0;
				mask[ k * 4 ] = hf.flagAt( x, z, FLAG.CITY | FLAG.BUILDING | FLAG.STREET ) * 255;
				mask[ k * 4 + 1 ] = hf.flagAt( x, z, FLAG.ROAD | FLAG.RUNWAY | FLAG.DIRT ) * 255;
				mask[ k * 4 + 2 ] = s4[ 3 ] === 3 ? 255 : 0;
				mask[ k * 4 + 3 ] = shoreness( x, z, y ) * 255;
			} else {
				surf[ k * 4 + 3 ] = s4[ 3 ] === 1 ? 85 : s4[ 3 ] === 2 ? 170 : 0;
				mask[ k * 4 + 2 ] = s4[ 3 ] === 3 ? 255 : 0;
				// far away the city shows as a grey tint from the coarse map
				mask[ k * 4 ] = hf.flagAt( x, z, FLAG.CITY ) * 255;
				mask[ k * 4 + 3 ] = y < 1.6 ? 220 : y < 3 ? 90 : 0;
			}
		}
		// skirts: copies of the edge vertices pulled down
		const edges = [];
		for ( let i = 0; i < V; i ++ ) edges.push( i ); // north (j = 0)
		for ( let j = 0; j < V; j ++ ) edges.push( j * V + N ); // east
		for ( let i = N; i >= 0; i -- ) edges.push( N * V + i ); // south
		for ( let j = N; j >= 0; j -- ) edges.push( j * V ); // west
		for ( let e = 0; e < nSkirt; e ++ ) {
			const src = edges[ e ], k = nMain + e;
			pos[ k * 3 ] = pos[ src * 3 ]; pos[ k * 3 + 1 ] = pos[ src * 3 + 1 ] - skirt; pos[ k * 3 + 2 ] = pos[ src * 3 + 2 ];
			for ( let c = 0; c < 4; c ++ ) { nor[ k * 4 + c ] = nor[ src * 4 + c ]; surf[ k * 4 + c ] = surf[ src * 4 + c ]; mask[ k * 4 + c ] = mask[ src * 4 + c ]; }
		}
		return { result: { pos, nor, surf, mask, minY: minY - skirt, maxY }, transfer: [ pos.buffer, nor.buffer, surf.buffer, mask.buffer ] };
	},

	scatter( msg ) {
		const r = scatterCell( hf, msg );
		return { result: r, transfer: r.transfer };
	},

	streets( msg ) {
		const r = buildStreetCell( hf, world, msg );
		return { result: r, transfer: r.transfer };
	},

	maptile( msg ) { const r = renderMapTile( hf, msg ); return { result: r, transfer: r.transfer }; },

	heights( { pts } ) {
		const out = new Float32Array( pts.length / 2 );
		for ( let i = 0; i < out.length; i ++ ) out[ i ] = hf.heightAt( pts[ i * 2 ], pts[ i * 2 + 1 ] );
		return { result: { h: out }, transfer: [ out.buffer ] };
	},
};

// 1 at the water's edge, fading to 0 about 45 m inland (beaches only form near the sea)
const DIRS = Array.from( { length: 10 }, ( _, i ) => [ Math.cos( i / 10 * Math.PI * 2 ), Math.sin( i / 10 * Math.PI * 2 ) ] );
function shoreness( x, z, y ) {
	if ( y < 0.2 ) return 1;
	if ( y > 9 ) return 0;
	for ( const r of [ 6, 14, 24, 34, 46 ] ) {
		for ( const [ dx, dz ] of DIRS ) if ( hf.baseHeight( x + dx * r, z + dz * r ) < 0 ) return 1 - r / 52;
	}
	return 0;
}

self.onmessage = ( e ) => {
	const msg = e.data;
	try {
		const r = handlers[ msg.type ]( msg );
		if ( r && r.result ) self.postMessage( { id: msg.id, result: r.result }, r.transfer || [] );
		else self.postMessage( { id: msg.id, result: r } );
	} catch ( err ) {
		self.postMessage( { id: msg.id, error: String( err && err.stack || err ) } );
	}
};

// keep the imports referenced for bundlers that tree-shake aggressively
void vnoise; void hash2;
