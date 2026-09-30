// Node check: a walker with the player's collision rules (radius 0.3, 0.45 m auto-step, gravity, head room)
// climbs the stairs of a sample of buildings: flight A up to the half landing, across, flight B up to the
// next floor. Catches blocked landings, steps too high, low ceilings and missing treads.
//   node test/buildings-walk.mjs [count per arch]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { HeightField } from '../src/world/HeightField.js';
import { Physics } from '../src/game/Physics.js';
import { readBuilding, fitToGround, NF, BOX_STRIDE, PMAT, PK } from '../src/city/buildings/data.js';
import { makePlan } from '../src/city/buildings/plan.js';
import { buildStorey } from '../src/city/buildings/interior.js';

const meta = JSON.parse( fs.readFileSync( 'public/data/world.json', 'utf8' ) );
const raw = zlib.gunzipSync( fs.readFileSync( 'public/data/terrain.bin.gz' ) );
const hf = new HeightField( raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength ), meta );
const perArch = + ( process.argv[ 2 ] || 3 );

const R = 0.3, H = 1.75, STEP = 0.45, G = 20, SPEED = 3.2, DT = 1 / 60;

// ground heights around a building in its local frame (as the building worker samples them)
function groundGrid( r ) {
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

// one storey's colliders into the physics world (as Buildings.js places them); returns the storey's output
function addStorey( phys, P, si ) {
	const r = P.r, o = buildStorey( P, si, si === 0 ? groundGrid( r ) : null ), B = o.boxes;
	for ( let k = 0; k < B.length; k += BOX_STRIDE ) {
		const x = r.x + B[ k ] * r.c - B[ k + 2 ] * r.s, z = r.z + B[ k ] * r.s + B[ k + 2 ] * r.c;
		phys.add( { x, y: B[ k + 1 ], z, hx: B[ k + 3 ], hy: B[ k + 4 ], hz: B[ k + 5 ], yaw: - r.angle + B[ k + 6 ], mat: PMAT[ B[ k + 7 ] ], kind: PK[ B[ k + 8 ] ] } );
	}
	return o;
}

// walk along world direction d (unit xz) for t seconds; returns the walker
function walk( phys, w, d, t ) {
	for ( let i = 0; i < t / DT; i ++ ) {
		w.vx = d[ 0 ] * SPEED; w.vz = d[ 1 ] * SPEED; w.vy -= G * DT;
		w.pos.x += w.vx * DT; w.pos.z += w.vz * DT; w.pos.y += w.vy * DT;
		phys.resolveCylinder( w.pos, R, H, STEP );
		const gr = phys.ground( w.pos.x, w.pos.z, w.pos.y, STEP, R );
		if ( w.pos.y <= gr.y ) { w.pos.y = gr.y; w.vy = 0; w.on = true; } else if ( w.pos.y - gr.y < 0.3 && w.vy <= 0 && w.on ) { w.pos.y = gr.y; w.vy = 0; } else w.on = false;
		const ceil = phys.ceiling( w.pos.x, w.pos.z, w.pos.y + 0.5, R * 0.8 );
		if ( w.pos.y + H > ceil ) { w.pos.y = Math.min( w.pos.y, ceil - H ); if ( w.vy > 0 ) w.vy = 0; }
	}
	return w;
}

let fails = 0, runs = 0;
const seen = {};
for ( let i = 0; i < meta.buildings.data.length / NF; i ++ ) {
	const r = fitToGround( readBuilding( meta.buildings.data, i ), hf, meta.cities );
	const P = makePlan( r, meta.cities );
	const s = P.stair;
	if ( ! s || P.S.n < 2 ) continue;
	const arch = P.S.arch + ( P.S.variant ? ':' + P.S.variant : '' );
	if ( ( seen[ arch ] = ( seen[ arch ] || 0 ) + 1 ) > perArch ) continue;
	for ( const si of P.S.n > 3 ? [ 0, Math.floor( P.S.n / 2 ) ] : [ 0 ] ) {
		if ( si >= P.S.n - 1 ) continue;
		runs ++;
		const phys = new Physics( hf, null );
		addStorey( phys, P, si ); addStorey( phys, P, si + 1 );
		// the stair frame: a along the run from the entry side, b across
		const alongZ = s.e === 0 || s.e === 2;
		const len = alongZ ? s.z1 - s.z0 : s.x1 - s.x0, sw = alongZ ? s.x1 - s.x0 : s.z1 - s.z0;
		const pt = ( a, b ) => s.e === 0 ? [ s.x0 + b, s.z0 + a ] : s.e === 2 ? [ s.x0 + b, s.z1 - a ] : s.e === 3 ? [ s.x0 + a, s.z0 + b ] : [ s.x1 - a, s.z0 + b ];
		const toW = ( lx, lz ) => [ r.x + lx * r.c - lz * r.s, r.z + lx * r.s + lz * r.c ];
		const dirW = ( lx, lz ) => [ lx * r.c - lz * r.s, lx * r.s + lz * r.c ];
		const dA = s.e === 0 ? [ 0, 1 ] : s.e === 2 ? [ 0, - 1 ] : s.e === 3 ? [ 1, 0 ] : [ - 1, 0 ];
		const dB = alongZ ? [ 1, 0 ] : [ 0, 1 ];
		const A = dirW( ...dA ), Bw = dirW( ...dB );
		const [ sx, sz ] = toW( ...pt( 0.6, sw * 0.25 ) );
		const y0 = P.S.ys[ si ], y1 = P.S.ys[ si + 1 ];
		const w = { pos: { x: sx, y: y0 + 0.02, z: sz }, vx: 0, vy: 0, vz: 0, on: true };
		walk( phys, w, A, 4 );
		const half = w.pos.y;
		walk( phys, w, Bw, 1.2 );
		walk( phys, w, [ - A[ 0 ], - A[ 1 ] ], 4 );
		const ok = Math.abs( w.pos.y - y1 ) < 0.08 && Math.abs( half - ( y0 + y1 ) / 2 ) < 0.08;
		if ( ! ok ) {
			fails ++;
			console.log( `✗ ${i} ${arch} storey ${si}: half landing ${( half - y0 ).toFixed( 2 )} of ${( ( y1 - y0 ) / 2 ).toFixed( 2 )}, ended at ${( w.pos.y - y0 ).toFixed( 2 )} of ${( y1 - y0 ).toFixed( 2 )}` );
		}
	}
}
console.log( `stairs climbed: ${runs - fails} / ${runs}` );

// every exterior door of the ground storey (left open) can be walked through from the ground outside
let dRuns = 0, dFails = 0;
const seenD = {};
for ( let i = 0; i < meta.buildings.data.length / NF; i ++ ) {
	const r = fitToGround( readBuilding( meta.buildings.data, i ), hf, meta.cities );
	const P = makePlan( r, meta.cities );
	const arch = P.S.arch + ( P.S.variant ? ':' + P.S.variant : '' );
	if ( ( seenD[ arch ] = ( seenD[ arch ] || 0 ) + 1 ) > perArch ) continue;
	const phys = new Physics( hf, null );
	const o = addStorey( phys, P, 0 );
	const { rect } = P;
	const cx = ( rect.x0 + rect.x1 ) / 2, cz = ( rect.z0 + rect.z1 ) / 2;
	for ( const d of o.doors ) {
		if ( ! d.ext ) continue;
		dRuns ++;
		// the outward normal of the door's wall (away from the building centre)
		const n = d.axis === 'x' ? [ 0, Math.sign( d.z - cz ) || 1 ] : [ Math.sign( d.x - cx ) || 1, 0 ];
		const toW = ( lx, lz ) => [ r.x + lx * r.c - lz * r.s, r.z + lx * r.s + lz * r.c ];
		// only doors reached from outside the building's footprint (not the ones off an open stair)
		const ox = d.x + n[ 0 ] * 3.2, oz = d.z + n[ 1 ] * 3.2;
		if ( ox > rect.x0 && ox < rect.x1 && oz > rect.z0 && oz < rect.z1 ) { dRuns --; continue; }
		// doors off a walk-up's gallery are reached by the gallery's own steps
		const edge = d.axis === 'x' ? Math.min( Math.abs( d.z - rect.z0 ), Math.abs( d.z - rect.z1 ) ) : Math.min( Math.abs( d.x - rect.x0 ), Math.abs( d.x - rect.x1 ) );
		if ( edge > 0.4 && ! P.S.porch ) { dRuns --; continue; }
		const [ sx, sz ] = toW( ox, oz );
		const w = { pos: { x: sx, y: phys.ground( sx, sz, 1e4 ).y, z: sz }, vx: 0, vy: 0, vz: 0, on: true };
		const dir = [ - n[ 0 ] * r.c + n[ 1 ] * r.s, - n[ 0 ] * r.s - n[ 1 ] * r.c ];
		walk( phys, w, dir, 2.2 );
		// inside: past the wall line, on the floor
		const dx = w.pos.x - r.x, dz = w.pos.z - r.z;
		const lx = dx * r.c + dz * r.s, lz = - dx * r.s + dz * r.c;
		const past = ( lx - d.x ) * n[ 0 ] + ( lz - d.z ) * n[ 1 ];
		if ( past > - 0.6 || Math.abs( w.pos.y - P.S.fy ) > 0.1 ) {
			dFails ++;
			if ( dFails < 25 ) console.log( `✗ ${i} ${arch} ${d.kind} door: stopped ${( - past ).toFixed( 2 )} m past the wall line at y ${( w.pos.y - P.S.fy ).toFixed( 2 )} from the floor` );
		}
	}
}
console.log( `doors walked through: ${dRuns - dFails} / ${dRuns}` );
process.exit( fails || dFails ? 1 : 0 );
