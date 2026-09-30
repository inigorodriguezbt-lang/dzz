// Node checks for the buildings module over every building on the islands (the baked ones and the infill):
//   plans and shells (near and far) build without exceptions; no NaN vertices; sane sizes (storeys, heights,
//   footprints inside their lots, vertex counts); every building has a street door; the infill is deterministic,
//   stays off roads and never overlaps a baked building; with --storeys, every storey's interior builds too.
//   node test/buildings.mjs [--storeys] [count]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { HeightField } from '../src/world/HeightField.js';
import { readBuilding, fitToGround, shapeOf, rectOf, NF } from '../src/city/buildings/data.js';
import { makePlan } from '../src/city/buildings/plan.js';
import { buildShell } from '../src/city/buildings/exterior.js';
import { buildStorey } from '../src/city/buildings/interior.js';
import { augmentBuildings } from '../src/city/buildings/infill.js';
import { Geo } from '../src/city/buildings/geo.js';

const args = process.argv.slice( 2 );
const withStoreys = args.includes( '--storeys' );
const lim = + ( args.find( a => /^\d+$/.test( a ) ) || Infinity );
const W = JSON.parse( fs.readFileSync( new URL( '../public/data/world.json', import.meta.url ) ) );
const raw = zlib.gunzipSync( fs.readFileSync( new URL( '../public/data/terrain.bin.gz', import.meta.url ) ) );
const hf = new HeightField( raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength ), W );

let fails = 0;
const fail = ( msg ) => { fails ++; if ( fails < 30 ) console.log( '  ✗ ' + msg ); };

// ---- the infill: deterministic, clear of roads and of the baked buildings -----------------------------------------
const N0 = W.buildings.data.length / NF;
const t0 = performance.now();
const inf = augmentBuildings( W, hf );
const tInf = performance.now() - t0;
const copy = JSON.parse( fs.readFileSync( new URL( '../public/data/world.json', import.meta.url ) ) );
augmentBuildings( copy, hf );
if ( JSON.stringify( copy.buildings.data ) !== JSON.stringify( W.buildings.data ) ) fail( 'infill is not deterministic' );
if ( inf.from !== N0 || inf.count < 100 ) fail( `infill appended ${inf.count} buildings after ${inf.from} (baked ${N0})` );
const B = W.buildings.data, N = B.length / NF;
const obb = ( r, S ) => { const R = S ? rectOf( S ) : { x0: - r.w / 2, x1: r.w / 2, z0: - r.d / 2, z1: r.d / 2 }; const lx = ( R.x0 + R.x1 ) / 2, lz = ( R.z0 + R.z1 ) / 2; return { x: r.x + lx * r.c - lz * r.s, z: r.z + lx * r.s + lz * r.c, hw: ( R.x1 - R.x0 ) / 2, hd: ( R.z1 - R.z0 ) / 2, c: r.c, s: r.s }; };
const overlap = ( a, b ) => {
	for ( const [ ax, az ] of [ [ a.c, a.s ], [ - a.s, a.c ], [ b.c, b.s ], [ - b.s, b.c ] ] ) {
		const ra = a.hw * Math.abs( a.c * ax + a.s * az ) + a.hd * Math.abs( - a.s * ax + a.c * az );
		const rb = b.hw * Math.abs( b.c * ax + b.s * az ) + b.hd * Math.abs( - b.s * ax + b.c * az );
		if ( Math.abs( ( b.x - a.x ) * ax + ( b.z - a.z ) * az ) > ra + rb ) return false;
	}
	return true;
};
const built = [];
for ( let i = 0; i < N; i ++ ) { const r = readBuilding( B, i ); built.push( obb( r, shapeOf( r, W.cities ) ) ); }
let overlaps = 0;
for ( let i = N0; i < N; i ++ ) for ( let j = 0; j < N; j ++ ) {
	if ( j === i || Math.abs( built[ i ].x - built[ j ].x ) > 120 || Math.abs( built[ i ].z - built[ j ].z ) > 120 ) continue;
	if ( overlap( built[ i ], built[ j ] ) ) { overlaps ++; if ( overlaps < 5 ) fail( `infill building ${i} overlaps building ${j}` ); }
}
let onRoad = 0;
for ( let i = N0; i < N; i ++ ) {
	const o = built[ i ];
	for ( const [ a, b ] of [ [ 0, 0 ], [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ] ) {
		const x = o.x + a * o.hw * o.c - b * o.hd * o.s, z = o.z + a * o.hw * o.s + b * o.hd * o.c;
		if ( hf.flagsNear( x, z ) & ( 1 | 8 ) ) { onRoad ++; break; }
	}
}
if ( onRoad ) fail( `${onRoad} infill buildings stand on a highway or runway` );
console.log( `infill: ${inf.count} buildings in ${tInf.toFixed( 0 )} ms, ${overlaps} overlaps, ${onRoad} on roads` );

// ---- every building: plan, shells, sanity ----------------------------------------------------------------------------
const stats = { v0: 0, v1: 0, max0: [ 0 ], max1: [ 0 ], rooms: 0, doors: 0, storeys: 0, storeyMs: 0, slowStorey: [ 0 ] };
const byArch = {};
let t1 = performance.now();
for ( let i = 0; i < Math.min( N, lim ); i ++ ) {
	const r = fitToGround( readBuilding( B, i ), hf, W.cities );
	const arch = () => byArch[ P?.S.arch ] ||= { n: 0, noFront: 0, maxN: 0, maxH: 0 };
	let P = null;
	try {
		P = makePlan( r, W.cities );
		const { S, rect } = P;
		const a = arch();
		a.n ++; a.maxN = Math.max( a.maxN, S.n ); a.maxH = Math.max( a.maxH, Math.round( S.top - S.fy ) );
		if ( S.n < 1 || S.n > 34 ) fail( `${i} ${S.arch}: ${S.n} storeys` );
		if ( ! ( S.top > S.fy ) || S.top - S.fy > 34 * 5.5 ) fail( `${i} ${S.arch}: height ${S.top - S.fy}` );
		if ( S.bw < 4 || S.bd < 3.5 ) fail( `${i} ${S.arch}: tiny ${S.bw}x${S.bd}` );
		// the built rect stays inside the lot (the airport tower and the tents are placed inside it on purpose)
		if ( rect.x0 < - r.w / 2 - 0.05 || rect.x1 > r.w / 2 + 0.05 || rect.z0 < - r.d / 2 - 0.05 || rect.z1 > r.d / 2 + 0.05 ) fail( `${i} ${S.arch}: built rect outside the lot` );
		if ( ! Number.isFinite( S.fy ) || Math.abs( S.fy - r.base ) > 2 ) fail( `${i} ${S.arch}: floor ${S.fy} vs ground ${r.base}` );
		for ( const lod of [ 0, 1 ] ) {
			const g = new Geo( 1024 );
			g.frame( r.x, 0, r.z, r.angle );
			buildShell( g, P, lod, null );
			const n = g.n;
			if ( lod === 0 ) { stats.v0 += n; if ( n > stats.max0[ 0 ] ) stats.max0 = [ n, i, S.arch, S.n ]; } else { stats.v1 += n; if ( n > stats.max1[ 0 ] ) stats.max1 = [ n, i, S.arch, S.n ]; }
			for ( let k = 0; k < n * 3; k ++ ) if ( ! Number.isFinite( g.pos[ k ] ) ) throw new Error( 'NaN vertex, lod ' + lod );
			if ( n > 200000 ) fail( `${i} ${S.arch}: ${n} vertices at lod ${lod}` );
		}
		for ( const st of P.storeys ) { stats.rooms += st.rooms.length; stats.doors += st.doors.length; }
		if ( ! P.storeys[ 0 ].doors.some( d => d.ext ) ) fail( `${i} ${S.arch}: no way in` );
		if ( ! P.storeys[ 0 ].doors.some( d => d.ext && d.nz < - 0.5 ) && S.arch !== 'walkup' && S.arch !== 'tent' ) a.noFront ++;
		if ( withStoreys ) {
			for ( const st of P.storeys ) {
				const ts = performance.now();
				const o = buildStorey( P, st.i, null );
				const dt = performance.now() - ts;
				stats.storeys ++; stats.storeyMs += dt;
				if ( dt > stats.slowStorey[ 0 ] ) stats.slowStorey = [ +dt.toFixed( 1 ), i, S.arch, st.i ];
				if ( o.geo ) for ( let k = 0; k < o.geo.pos.length; k ++ ) if ( ! Number.isFinite( o.geo.pos[ k ] ) ) throw new Error( 'NaN in storey ' + st.i );
				for ( let k = 0; k < o.boxes.length; k ++ ) if ( ! Number.isFinite( o.boxes[ k ] ) ) throw new Error( 'NaN collider in storey ' + st.i );
				if ( ! o.boxes.length ) fail( `${i} ${S.arch} storey ${st.i}: no colliders` );
			}
		}
	} catch ( e ) {
		fail( `building ${i} ${r.type} ${P?.S.arch || ''}: ${e.stack.split( '\n' ).slice( 0, 3 ).join( ' | ' )}` );
	}
}
const count = Math.min( N, lim );
console.log( `buildings ${count} (baked ${Math.min( N0, count )}, infill ${Math.max( 0, count - N0 )}) in ${( ( performance.now() - t1 ) / 1000 ).toFixed( 1 )} s` );
console.log( `vertices near ${( stats.v0 / 1e6 ).toFixed( 2 )} M, far ${( stats.v1 / 1e6 ).toFixed( 2 )} M; biggest near ${JSON.stringify( stats.max0 )}, far ${JSON.stringify( stats.max1 )}` );
console.log( `rooms ${stats.rooms}, doors ${stats.doors}` + ( withStoreys ? `; storeys ${stats.storeys} in ${( stats.storeyMs / 1000 ).toFixed( 1 )} s, slowest ${JSON.stringify( stats.slowStorey )}` : '' ) );
console.log( Object.entries( byArch ).map( ( [ k, v ] ) => `${k} ${v.n} (max ${v.maxN} storeys, ${v.maxH} m${v.noFront ? `, ${v.noFront} without a street door` : ''})` ).join( '\n' ) );
console.log( fails ? `${fails} failures` : 'ok' );
process.exit( fails ? 1 : 0 );
