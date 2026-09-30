// Bakes the game world from real elevation data:
//   node tools/bake/bake.mjs [tileCache] [outDir]
// Writes public/data/terrain.bin.gz (heights, surface maps, flags) and public/data/world.json
// (islands, cities, highways, streets, runways, buildings, map labels).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadMosaic, sampleGame } from './heights.mjs';
import { Grid, FS, CS, TILE, TILE_N } from './grid.mjs';
import { buildCoarse, labelIslands, buildSurface } from './surface.mjs';
import { layoutCities, placeBuildings, Claim } from './cities.mjs';
import { makePathGrid, route, simplify, chaikin, resample, profile, flattenAlong } from './roads.mjs';
import { lonLatToWorld, WORLD_HALF_X, WORLD_HALF_Z, H_SCALE, V_SCALE, BOUNDS } from './geo.mjs';
import { ISLANDS, CITIES, NODES, EDGES, LABELS } from './places.mjs';

const cache = process.argv[ 2 ] || '.tile-cache';
const outDir = process.argv[ 3 ] || 'public/data';
fs.mkdirSync( outDir, { recursive: true } );
const T = Date.now();
const log = ( ...a ) => console.log( `[${( ( Date.now() - T ) / 1000 ).toFixed( 1 )}s]`, ...a );

// flag bits in the fine mask
export const F = { ROAD: 1, DIRT: 2, STREET: 4, RUNWAY: 8, BUILDING: 16, CITY: 32, FIELD: 64 };

log( 'mosaic' );
const mosaic = loadMosaic( cache );
const fine = new Grid( FS );
for ( let j = 0; j < fine.nz; j ++ ) for ( let i = 0; i < fine.nx; i ++ ) fine.h[ fine.idx( i, j ) ] = sampleGame( mosaic, fine.xOf( i ), fine.zOf( j ) );
mosaic.data = null;
log( 'fine grid', fine.nx, fine.nz );

let coarse = buildCoarse( fine );
const islands = labelIslands( coarse );
log( 'surface' );
const surface = buildSurface( coarse, islands );

log( 'cities' );
const claim = new Claim( fine );
const lay = layoutCities( fine, claim );
log( 'cities', lay.cities.length, 'streets', lay.streets.length, 'lots', lay.lots.length );
console.log( lay.cities.map( c => c.id + ':' + c.blocks ).join( ' ' ) );

const mask = new Uint8Array( fine.nx * fine.nz );
for ( let i = 0; i < mask.length; i ++ ) if ( claim.a[ i ] ) mask[ i ] |= F.CITY;
// street raster (also the cheap cells for the highway router)
const pathMask = new Uint8Array( fine.nx * fine.nz );
for ( let i = 0; i < mask.length; i ++ ) if ( claim.a[ i ] ) pathMask[ i ] = 2;
for ( const s of lay.streets ) {
	const half = s.w / 2 + s.walk;
	const [ ax, az ] = s.a, [ bx, bz ] = s.b;
	const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
	const i0 = Math.floor( ( Math.min( ax, bx ) - half - fine.x0 ) / FS ), i1 = Math.ceil( ( Math.max( ax, bx ) + half - fine.x0 ) / FS );
	const j0 = Math.floor( ( Math.min( az, bz ) - half - fine.z0 ) / FS ), j1 = Math.ceil( ( Math.max( az, bz ) + half - fine.z0 ) / FS );
	for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
		if ( i < 0 || j < 0 || i >= fine.nx || j >= fine.nz ) continue;
		const x = fine.xOf( i ), z = fine.zOf( j );
		const t = Math.max( 0, Math.min( 1, ( ( x - ax ) * dx + ( z - az ) * dz ) / l2 ) );
		const d = Math.hypot( x - ax - t * dx, z - az - t * dz );
		if ( d <= half + 1 ) { const id = fine.idx( i, j ); mask[ id ] |= F.STREET; pathMask[ id ] = 1; }
	}
}

log( 'highways' );
const used = new Uint8Array( Math.ceil( fine.nx / 2 ) * Math.ceil( fine.nz / 2 ) + 10 );
const pg = makePathGrid( fine, pathMask, used );
const nodePos = {};
for ( const c of CITIES ) nodePos[ c.id ] = lonLatToWorld( c.lon, c.lat );
for ( const [ k, v ] of Object.entries( NODES ) ) nodePos[ k ] = lonLatToWorld( v[ 0 ], v[ 1 ] );
const roads = [];
const edges = [ ...EDGES ].sort( ( a, b ) => b[ 2 ] - a[ 2 ] );
for ( const [ a, b, lanes ] of edges ) {
	if ( ! nodePos[ a ] || ! nodePos[ b ] ) { console.warn( 'missing node', a, b ); continue; }
	const p = route( pg, ...nodePos[ a ], ...nodePos[ b ], lanes );
	if ( ! p ) { console.warn( 'no route', a, b ); continue; }
	let pts = simplify( p, 7 );
	pts = chaikin( pts, 3 );
	pts = resample( pts, 6 );
	roads.push( { from: a, to: b, lanes, pts } );
}
log( 'routed', roads.length, 'of', EDGES.length );

const wBest = new Float32Array( fine.nx * fine.nz ), hBest = new Float32Array( fine.nx * fine.nz );
const WIDTH = { 4: 17, 2: 8.5, 1: 5.5 };
for ( const r of roads ) {
	r.w = WIDTH[ r.lanes ];
	r.hs = profile( fine, r.pts, 6 );
	flattenAlong( fine, r.pts, r.hs, r.w / 2, r.lanes === 4 ? 20 : 14, wBest, hBest, mask, r.lanes === 1 ? F.DIRT : F.ROAD );
}
// runways: flat strips on the airport's axis
for ( const rw of lay.runways ) {
	const ca = Math.cos( rw.angle ), sa = Math.sin( rw.angle );
	const a = [ rw.x - ca * rw.len / 2, rw.z - sa * rw.len / 2 ], b = [ rw.x + ca * rw.len / 2, rw.z + sa * rw.len / 2 ];
	const pts = resample( [ a, b ], 8 );
	const hs = profile( fine, pts, 8 );
	const avg = hs.reduce( ( s, v ) => s + v, 0 ) / hs.length;
	rw.pts = pts; rw.hs = hs.map( h => h * 0.3 + avg * 0.7 );
	flattenAlong( fine, pts, rw.hs, rw.w / 2 + 6, 24, wBest, hBest, mask, F.RUNWAY );
}
for ( let i = 0; i < fine.h.length; i ++ ) if ( wBest[ i ] > 0 ) fine.h[ i ] += ( hBest[ i ] - fine.h[ i ] ) * wBest[ i ];
// the road heights follow the final ground exactly
for ( const r of roads ) r.hs = r.pts.map( ( [ x, z ] ) => fine.sample( x, z ) );

log( 'buildings' );
// spatial hash of highway segments for the lot test
const HC = 64, hash = new Map();
const hkey = ( x, z ) => Math.floor( x / HC ) + ',' + Math.floor( z / HC );
for ( const r of [ ...roads, ...lay.runways.map( rw => ( { pts: rw.pts, w: rw.w + 30 } ) ) ] ) {
	for ( let s = 0; s < r.pts.length - 1; s ++ ) {
		const k = hkey( ( r.pts[ s ][ 0 ] + r.pts[ s + 1 ][ 0 ] ) / 2, ( r.pts[ s ][ 1 ] + r.pts[ s + 1 ][ 1 ] ) / 2 );
		if ( ! hash.has( k ) ) hash.set( k, [] );
		hash.get( k ).push( [ r.pts[ s ], r.pts[ s + 1 ], r.w / 2 ] );
	}
}
const roadHit = ( x, z, rad ) => {
	for ( let b = - 1; b <= 1; b ++ ) for ( let a = - 1; a <= 1; a ++ ) {
		const list = hash.get( ( Math.floor( x / HC ) + a ) + ',' + ( Math.floor( z / HC ) + b ) );
		if ( ! list ) continue;
		for ( const [ p, q, hw ] of list ) {
			const dx = q[ 0 ] - p[ 0 ], dz = q[ 1 ] - p[ 1 ], l2 = dx * dx + dz * dz || 1;
			const t = Math.max( 0, Math.min( 1, ( ( x - p[ 0 ] ) * dx + ( z - p[ 1 ] ) * dz ) / l2 ) );
			if ( Math.hypot( x - p[ 0 ] - t * dx, z - p[ 1 ] - t * dz ) < rad + hw ) return true;
		}
	}
	return false;
};
const buildings = placeBuildings( lay.lots, lay.cities, fine, roadHit );
for ( const b of buildings ) {
	const ca = Math.cos( b.angle ), sa = Math.sin( b.angle );
	const r = Math.hypot( b.w, b.d ) / 2 + 2;
	for ( let j = Math.floor( ( b.z - r - fine.z0 ) / FS ); j <= Math.ceil( ( b.z + r - fine.z0 ) / FS ); j ++ ) {
		for ( let i = Math.floor( ( b.x - r - fine.x0 ) / FS ); i <= Math.ceil( ( b.x + r - fine.x0 ) / FS ); i ++ ) {
			if ( i < 0 || j < 0 || i >= fine.nx || j >= fine.nz ) continue;
			const dx = fine.xOf( i ) - b.x, dz = fine.zOf( j ) - b.z;
			const u = dx * ca + dz * sa, v = - dx * sa + dz * ca;
			if ( Math.abs( u ) < b.w / 2 + 2 && Math.abs( v ) < b.d / 2 + 2 ) mask[ fine.idx( i, j ) ] |= F.BUILDING;
		}
	}
}
log( 'buildings', buildings.length );
const typeCount = {};
for ( const b of buildings ) typeCount[ b.typeName ] = ( typeCount[ b.typeName ] || 0 ) + 1;
console.log( typeCount );

// fields: mark gentle cells of the land-use patches at fine resolution
for ( let j = 0; j < fine.nz; j ++ ) for ( let i = 0; i < fine.nx; i ++ ) {
	const ci = Math.round( i * FS / CS ), cj = Math.round( j * FS / CS );
	const u = surface.use[ cj * coarse.nx + ci ];
	if ( ( u === 1 || u === 2 ) && ! ( mask[ fine.idx( i, j ) ] & ( F.CITY | F.ROAD | F.DIRT | F.RUNWAY ) ) ) mask[ fine.idx( i, j ) ] |= F.FIELD;
}

coarse = buildCoarse( fine );

// ---- write terrain.bin -------------------------------------------------------------------------
log( 'write' );
const TX = Math.ceil( ( fine.nx - 1 ) / TILE_N ), TZ = Math.ceil( ( fine.nz - 1 ) / TILE_N );
const TS = TILE_N + 1;
const tileIndex = new Int16Array( TX * TZ ).fill( - 1 );
const tiles = [];
for ( let tj = 0; tj < TZ; tj ++ ) for ( let ti = 0; ti < TX; ti ++ ) {
	let keep = false;
	for ( let j = 0; j <= TILE_N && ! keep; j += 2 ) for ( let i = 0; i <= TILE_N; i += 2 ) {
		if ( fine.get( ti * TILE_N + i, tj * TILE_N + j ) > - 8 ) { keep = true; break; }
	}
	if ( ! keep ) continue;
	tileIndex[ tj * TX + ti ] = tiles.length;
	tiles.push( [ ti, tj ] );
}
const Q = 20; // height quantisation: 1 / 20 m
const q = h => Math.max( - 32767, Math.min( 32767, Math.round( h * Q ) ) );
const header = new Uint32Array( 16 );
const cN = coarse.nx * coarse.nz;
const parts = [];
parts.push( header );
const coarseH = new Int16Array( cN );
for ( let i = 0; i < cN; i ++ ) coarseH[ i ] = q( coarse.h[ i ] );
// delta-code rows for better compression
const deltaRows = ( arr, w ) => {
	const o = new Int16Array( arr.length );
	for ( let r = 0; r < arr.length / w; r ++ ) { let p = 0; for ( let c = 0; c < w; c ++ ) { const v = arr[ r * w + c ]; o[ r * w + c ] = v - p; p = v; } }
	return o;
};
parts.push( deltaRows( coarseH, coarse.nx ) );
const surf = new Uint8Array( cN * 4 );
for ( let i = 0; i < cN; i ++ ) {
	surf[ i * 4 ] = Math.round( surface.moist[ i ] * 255 );
	surf[ i * 4 + 1 ] = Math.round( Math.min( 1, surface.lava[ i ] ) * 255 );
	surf[ i * 4 + 2 ] = Math.round( surface.red[ i ] * 255 );
	surf[ i * 4 + 3 ] = surface.use[ i ];
}
parts.push( surf );
parts.push( islands );
parts.push( tileIndex );
const fineH = new Int16Array( tiles.length * TS * TS ), fineM = new Uint8Array( tiles.length * TS * TS );
tiles.forEach( ( [ ti, tj ], k ) => {
	for ( let j = 0; j < TS; j ++ ) for ( let i = 0; i < TS; i ++ ) {
		const gi = Math.min( fine.nx - 1, ti * TILE_N + i ), gj = Math.min( fine.nz - 1, tj * TILE_N + j );
		fineH[ k * TS * TS + j * TS + i ] = q( fine.h[ gj * fine.nx + gi ] );
		fineM[ k * TS * TS + j * TS + i ] = mask[ gj * fine.nx + gi ];
	}
} );
parts.push( deltaRows( fineH, TS ) );
parts.push( fineM );
header.set( [ 0x44545731, 1, coarse.nx, coarse.nz, TX, TZ, tiles.length, TS, Q, CS, FS, TILE, 0, 0, 0, 0 ] );
// align every part to 4 bytes
const bufs = [];
let off = 0;
for ( const p of parts ) {
	const b = Buffer.from( p.buffer, p.byteOffset, p.byteLength );
	bufs.push( b ); off += b.length;
	const pad = ( 4 - ( off % 4 ) ) % 4;
	if ( pad ) { bufs.push( Buffer.alloc( pad ) ); off += pad; }
}
const raw = Buffer.concat( bufs );
const gz = zlib.gzipSync( raw, { level: 9 } );
fs.writeFileSync( path.join( outDir, 'terrain.bin.gz' ), gz );
log( 'terrain.bin', ( raw.length / 1e6 ).toFixed( 1 ), 'MB raw,', ( gz.length / 1e6 ).toFixed( 1 ), 'MB gz,', tiles.length, 'fine tiles' );

// ---- write world.json -------------------------------------------------------------------------
const r1 = v => Math.round( v * 10 ) / 10;
const r2 = v => Math.round( v * 100 ) / 100;
// angles to 1e-5 rad: at 0.01 rad a city grid 1 km across drifts metres off its own streets
const r5 = v => Math.round( v * 1e5 ) / 1e5;
const world = {
	version: 1,
	bounds: BOUNDS, hScale: H_SCALE, vScale: V_SCALE, halfX: WORLD_HALF_X, halfZ: WORLD_HALF_Z,
	islands: ISLANDS.map( i => { const [ x, z ] = lonLatToWorld( i.lon, i.lat ); return { id: i.id, name: i.name, x: r1( x ), z: r1( z ) }; } ),
	cities: lay.cities.map( c => ( { name: c.name, id: c.id, kind: c.kind, island: c.island, x: r1( c.x ), z: r1( c.z ), angle: r5( c.angle ), pu: c.pu, pv: c.pv, street: c.street, walk: c.walk, radius: c.radius } ) ),
	roads: roads.map( r => ( { lanes: r.lanes, w: r.w, name: r.from + '-' + r.to, pts: r.pts.flatMap( ( p, i ) => [ r1( p[ 0 ] ), r1( p[ 1 ] ), r2( r.hs[ i ] ) ] ) } ) ),
	streets: lay.streets.map( s => [ s.city, r1( s.a[ 0 ] ), r1( s.a[ 1 ] ), r2( fine.sample( ...s.a ) ), r1( s.b[ 0 ] ), r1( s.b[ 1 ] ), r2( fine.sample( ...s.b ) ), s.w, s.walk ] ),
	runways: lay.runways.map( rw => ( { x: r1( rw.x ), z: r1( rw.z ), angle: r5( rw.angle ), len: rw.len, w: rw.w, y: r2( rw.hs.reduce( ( s, v ) => s + v, 0 ) / rw.hs.length ) } ) ),
	buildings: {
		fields: [ 'x', 'z', 'w', 'd', 'angle', 'base', 'lo', 'type', 'floors', 'city', 'style' ],
		data: buildings.flatMap( b => [ r1( b.x ), r1( b.z ), r1( b.w ), r1( b.d ), r5( b.angle ), r2( b.base ), r2( b.lo ), b.type, b.floors, b.city, b.style ] ),
	},
	labels: LABELS.map( l => { const [ x, z ] = lonLatToWorld( l.lon, l.lat ); return { name: l.name, kind: l.kind, x: r1( x ), z: r1( z ) }; } ),
};
fs.writeFileSync( path.join( outDir, 'world.json' ), JSON.stringify( world ) );
log( 'world.json', ( fs.statSync( path.join( outDir, 'world.json' ) ).size / 1e6 ).toFixed( 2 ), 'MB' );

// ---- debug preview ------------------------------------------------------------------------------
if ( process.env.PREVIEW ) {
	const { PNG } = await import( 'pngjs' );
	const S = 16, W = Math.floor( fine.nx * FS / S ), H = Math.floor( fine.nz * FS / S );
	const png = new PNG( { width: W, height: H } );
	for ( let y = 0; y < H; y ++ ) for ( let x = 0; x < W; x ++ ) {
		const wx = fine.x0 + x * S, wz = fine.z0 + y * S;
		const h = fine.sample( wx, wz ), i = ( y * W + x ) * 4;
		const ci = Math.round( ( wx - coarse.x0 ) / CS ), cj = Math.round( ( wz - coarse.z0 ) / CS );
		const cid = cj * coarse.nx + ci;
		const m = mask[ Math.round( ( wz - fine.z0 ) / FS ) * fine.nx + Math.round( ( wx - fine.x0 ) / FS ) ];
		let r, g, b;
		if ( h < 0 ) { const t = Math.min( 1, - h / 40 ); r = 20; g = 150 * ( 1 - t ) + 40; b = 150 * ( 1 - t ) + 90; }
		else {
			const mo = surface.moist[ cid ], la = surface.lava[ cid ], re = surface.red[ cid ];
			r = 150 - mo * 110; g = 140 + mo * 40; b = 80 - mo * 30;
			r = r * ( 1 - re ) + 170 * re; g = g * ( 1 - re ) + 80 * re; b = b * ( 1 - re ) + 50 * re;
			r = r * ( 1 - la ) + 40 * la; g = g * ( 1 - la ) + 38 * la; b = b * ( 1 - la ) + 40 * la;
			const sh = ( fine.sample( wx + S, wz ) - fine.sample( wx - S, wz ) + fine.sample( wx, wz + S ) - fine.sample( wx, wz - S ) ) / ( 2 * S );
			const k = Math.max( 0.4, Math.min( 1.4, 1 - sh * 3 ) );
			r *= k; g *= k; b *= k;
			if ( m & F.FIELD ) { g += 30; }
			if ( m & F.CITY ) { r = r * 0.5 + 90; g = g * 0.5 + 90; b = b * 0.5 + 90; }
			if ( m & F.STREET ) { r = g = b = 60; }
			if ( m & F.BUILDING ) { r = 230; g = 220; b = 200; }
			if ( m & ( F.ROAD | F.RUNWAY ) ) { r = 30; g = 30; b = 30; }
			if ( m & F.DIRT ) { r = 120; g = 80; b = 50; }
		}
		png.data[ i ] = Math.max( 0, Math.min( 255, r ) ); png.data[ i + 1 ] = Math.max( 0, Math.min( 255, g ) ); png.data[ i + 2 ] = Math.max( 0, Math.min( 255, b ) ); png.data[ i + 3 ] = 255;
	}
	fs.writeFileSync( process.env.PREVIEW, PNG.sync.write( png ) );
	log( 'preview', W, H );
}
