// Node check: every storey of a sample of buildings builds an interior without errors.
// node test/buildings-interior.mjs [step]
import fs from 'fs';
import { readBuilding, NF } from '../src/city/buildings/data.js';
import { makePlan } from '../src/city/buildings/plan.js';
import { buildStorey } from '../src/city/buildings/interior.js';
await import( '../src/game/items/defs/index.js' );
const { LOOT_TABLES } = await import( '../src/game/items/Loot.js' );

const W = JSON.parse( fs.readFileSync( new URL( '../public/data/world.json', import.meta.url ) ) );
const B = W.buildings.data, N = B.length / NF;
const step = + ( process.argv[ 2 ] || 7 );
let fails = 0, n = 0, t0 = performance.now(), maxT = [ 0 ];
const tot = { v: 0, tris: 0, fineV: 0, fineTris: 0, boxes: 0, doors: 0, cont: 0, spots: 0, beds: 0, taps: 0, lights: 0, dec: 0, glass: 0 };
const maxOf = { tris: [ 0 ], fineTris: [ 0 ] };
const seen = {};
for ( let i = 0; i < N; i ++ ) {
	const r = readBuilding( B, i );
	// every type at least a few times, the rest sampled
	seen[ r.type ] = ( seen[ r.type ] || 0 ) + 1;
	if ( seen[ r.type ] > 3 && i % step ) continue;
	try {
		const P = makePlan( r, W.cities );
		const sts = P.S.n > 6 ? [ 0, 1, Math.floor( P.S.n / 2 ), P.S.n - 1 ] : P.storeys.map( s => s.i );
		for ( const si of sts ) {
			const t = performance.now();
			const o = buildStorey( P, si, null );
			const dt = performance.now() - t;
			if ( dt > maxT[ 0 ] ) maxT = [ dt, i, r.type, si ];
			n ++;
			tot.v += o.geo ? o.geo.count : 0; tot.tris += o.geo ? o.geo.idx.length / 3 : 0; tot.fineV += o.fine ? o.fine.count : 0; tot.fineTris += o.fine ? o.fine.idx.length / 3 : 0;
			for ( const k of [ 'tris', 'fineTris' ] ) { const g = k === 'tris' ? o.geo : o.fine; const n = g ? g.idx.length / 3 : 0; if ( n > maxOf[ k ][ 0 ] ) maxOf[ k ] = [ n, i, r.type, si ]; }
			if ( o.geo && ! o.geo.lt ) throw new Error( 'no baked light' );
			// every container and loot spot rolls from a table that exists; keys are unique
			const keys = new Set();
			for ( const c of [ ...o.containers, ...o.spots ] ) {
				if ( ! LOOT_TABLES[ c.table ] ) throw new Error( `unknown loot table ${c.table} (${c.label || 'spot'})` );
				if ( keys.has( c.key ) ) throw new Error( 'duplicate key ' + c.key );
				keys.add( c.key );
				for ( const v of [ c.cx ?? c.x, c.cy ?? c.y, c.cz ?? c.z ] ) if ( ! Number.isFinite( v ) ) throw new Error( 'NaN container / spot ' + c.key );
			}
			// a loot spot knows how high above its storey's floor it is (Buildings re-rolls things too big for a shelf)
			for ( const sp of o.spots ) {
				if ( ! Number.isFinite( sp.h ) || sp.h < - 0.3 || sp.h > 4 ) throw new Error( `spot ${sp.key} height ${sp.h}` );
				if ( sp.h > 0.15 ) tot.raised = ( tot.raised || 0 ) + 1;
			}
			tot.boxes += o.boxes.length / 9; tot.doors += o.doors.length; tot.cont += o.containers.length; tot.spots += o.spots.length;
			tot.beds += o.beds.length; tot.taps += o.taps.length; tot.lights += o.lights.length; tot.dec += o.dec ? o.dec.count : 0; tot.glass += o.glass ? o.glass.pos.length / 3 : 0;
			if ( o.geo ) for ( let k = 0; k < o.geo.pos.length; k ++ ) if ( ! Number.isFinite( o.geo.pos[ k ] ) ) throw new Error( 'NaN in storey ' + si );
			for ( let k = 0; k < o.boxes.length; k ++ ) if ( ! Number.isFinite( o.boxes[ k ] ) ) throw new Error( 'NaN collider in storey ' + si );
			// each door carries the baked light on both sides of its doorway (doors.js lights the leaves with it)
			for ( const d of o.doors ) if ( ! d.lt || d.lt.length !== 2 || ! d.lt.every( Number.isFinite ) ) throw new Error( 'door without light in storey ' + si );
		}
	} catch ( e ) {
		fails ++;
		if ( fails < 8 ) console.log( 'building', i, r.type, e.stack.split( '\n' ).slice( 0, 4 ).join( ' | ' ) );
	}
}
console.log( 'storeys', n, 'fails', fails, 'ms', ( performance.now() - t0 ).toFixed( 0 ), 'slowest', maxT );
for ( const k in tot ) tot[ k ] = Math.round( tot[ k ] / n );
console.log( 'per storey', tot );
console.log( 'biggest', JSON.stringify( maxOf ) );
process.exit( fails ? 1 : 0 );
