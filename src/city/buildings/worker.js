// Worker side of the buildings module (job type "buildings", see src/workers/world.worker.js):
//   { op: 'cell', ids, lod, ox, oz }  merged shells of the listed buildings around origin (ox, 0, oz)
//   { op: 'storey', i, si }           the real interior of storey si of building i (building-local coords)
import { Geo, transferOf } from './geo.js';
import { readBuilding, fitToGround } from './data.js';
import { makePlan } from './plan.js';
import { buildShell } from './exterior.js';
import { buildStorey } from './interior.js';
import { augmentBuildings } from './infill.js';

const plans = new Map();
function planOf( hf, world, i ) {
	let P = plans.get( i );
	if ( P ) { plans.delete( i ); plans.set( i, P ); return P; }
	const r = fitToGround( readBuilding( world.buildings.data, i ), hf, world.cities );
	P = makePlan( r, world.cities );
	plans.set( i, P );
	// keep the most recently used plans (towers take a few ms to lay out)
	if ( plans.size > 96 ) plans.delete( plans.keys().next().value );
	return P;
}

// ground heights around a building in its local frame (paved lots and front steps follow the terrain)
function groundGrid( hf, r ) {
	const span = Math.max( r.w, r.d ) + 8;
	const n = Math.max( 4, Math.min( 14, Math.ceil( span / 4 ) + 1 ) );
	const step = span / ( n - 1 ), x0 = - span / 2, z0 = - span / 2;
	const h = new Float32Array( n * n );
	for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {
		const lx = x0 + i * step, lz = z0 + j * step;
		h[ j * n + i ] = hf.heightAt( r.x + lx * r.c - lz * r.s, r.z + lx * r.s + lz * r.c );
	}
	return { n, x0, z0, step, h };
}

export function buildingJob( hf, world, msg ) {
	// the same infill records the main thread appended (see infill.js)
	if ( ! world.buildings.infill ) augmentBuildings( world, hf );
	if ( msg.op === 'storey' ) {
		const P = planOf( hf, world, msg.i );
		const gh = msg.si === 0 ? groundGrid( hf, P.r ) : null;
		const o = buildStorey( P, msg.si, gh );
		const transfer = [ ...transferOf( o.geo ), ...transferOf( o.fine ), ...transferOf( o.dec ), o.boxes.buffer ];
		if ( o.glass ) transfer.push( o.glass.pos.buffer, o.glass.nor.buffer, o.glass.idx.buffer );
		if ( o.beam ) transfer.push( o.beam.pos.buffer, o.beam.bmin.buffer, o.beam.bmax.buffer, o.beam.idx.buffer );
		return { result: o, transfer };
	}
	// shells
	const g = new Geo( 16384 );
	for ( const i of msg.ids ) {
		const P = planOf( hf, world, i );
		const r = P.r;
		g.frame( r.x - msg.ox, 0, r.z - msg.oz, r.angle );
		buildShell( g, P, msg.lod, msg.lod === 0 ? groundGrid( hf, r ) : null );
	}
	const geo = g.empty ? null : g.finish( true );
	return { result: { geo }, transfer: transferOf( geo ) };
}
