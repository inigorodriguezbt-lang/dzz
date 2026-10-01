// Where the outdoor loot sites are: a deterministic plan per 96 m cell (and per coarse cell for helicopter crashes
// and stashes) from the world seed and the world's own queries. Node-safe: everything it knows about the world comes
// through `env`, which the runtime builds from the game (Sites.js) and the Node test stubs:
//
//   env = {
//     seed,                                   unsigned int
//     height( x, z ), base( x, z )            the ground (hf.heightAt) and the baked height (hf.baseHeight; < 0 is sea)
//     flags( x, z )                           hf.flagsNear bits (ROAD 1, DIRT 2, STREET 4, RUNWAY 8, BUILDING 16, CITY 32, FIELD 64)
//     surface( x, z ) -> [ moist, lava, red, use ]
//     road( x, z, maxDist ) -> { x, z, dx, dz, dist, lanes, width, kind } | null      nearest drivable centreline
//     building( x, z, margin ) -> bool        inside (or within margin of) a building footprint
//     lot( x, z ) -> bool                     on a parking lot
//     cities: [ { x, z, radius, kind } ]
//     events( ci, cj ) -> [ { type, x, z, tx, tz, hw, sd } ]   the roads' outbreak events in a cell (roadblock,
//                                             checkpoint, crash, jam), t = outbound travel direction, hw = half width,
//                                             sd = ±1 the side of the checkpoint's guard post along local +z
//     memo                                    (set here) the rare grids' sites, by coarse cell
//   }
//
// A site record: { kind, key, x, z, yaw, seed, cls, ci, cj, ...extra }. Local frame of every layout: +z is "front"
// (towards the road centre for roadside kinds, the sea for beach kinds); yaw is three.js rotation.y, so local
// ( lx, lz ) is at world ( x + lx cos yaw + lz sin yaw, z - lx sin yaw + lz cos yaw ).
import { CELL, HELI_CELL, STASH_CELL, hash32, rng, range, pickWeighted } from './kinds.js';

const FLAG = { ROAD: 1, DIRT: 2, STREET: 4, RUNWAY: 8, BUILDING: 16, CITY: 32, FIELD: 64 };
const TAU = Math.PI * 2;

// chance that a cell of a class holds a free-standing site, and the kinds that fit it (weights; conditions below)
export const CLASS_P = { road: 0.5, street: 0.32, lot: 0.3, beach: 0.45, shore: 0.32, town: 0.08, forest: 0.15, open: 0.1 };
const CLASS_ORDER = [ 'road', 'beach', 'lot', 'street', 'shore', 'forest', 'open', 'town' ];
// footprint radius (m) each kind needs clear of buildings, water and steep ground
export const FOOT = {
	roadside: 2.2, bus_stop: 2.8, crash_car: 4, beach_camp: 3.2, campsite: 4.5, hiker: 2, fishing_spot: 2.4, checkpoint: 4,
	military_checkpoint: 5.5, heli_crash: 12, fema_camp: 14, farm_stand: 3.5, picnic: 3, body: 1.8, supply_drop: 4, stash: 1.5,
};

// ---- probing the world ---------------------------------------------------------------------------------------------

function slopeAt( env, x, z, e ) {
	const hx = env.height( x + e, z ) - env.height( x - e, z ), hz = env.height( x, z + e ) - env.height( x, z - e );
	return Math.hypot( hx, hz ) / ( 2 * e );
}

// the sea within 30 m: { dx, dz, d } (unit direction, distance band) or null
export function seaNear( env, x, z, rings = [ 8, 16, 30 ] ) {
	for ( const r of rings ) {
		let sx = 0, sz = 0, n = 0;
		for ( let k = 0; k < 8; k ++ ) {
			const a = k / 8 * TAU, cx = Math.cos( a ), cz = Math.sin( a );
			if ( env.base( x + cx * r, z + cz * r ) < 0 ) { sx += cx; sz += cz; n ++; }
		}
		if ( n ) { const l = Math.hypot( sx, sz ) || 1; return { dx: sx / l, dz: sz / l, d: r, n }; }
	}
	return null;
}

// nearest settlement and how far into it (d = distance / radius)
export function cityAt( cities, x, z ) {
	let best = null, bd = Infinity;
	for ( const c of cities || [] ) {
		const d = Math.hypot( c.x - x, c.z - z ) / Math.max( 60, c.radius || 150 );
		if ( d < bd ) { bd = d; best = c; }
	}
	return best ? { c: best, d: bd, m: bd * Math.max( 60, best.radius || 150 ) } : null;
}

// what kind of place a point is, or null where nothing can go (sea, runways, inside buildings, cliffs)
export function probe( env, x, z ) {
	const h = env.height( x, z );
	if ( ! ( h > 0.6 ) ) return null;
	const fl = env.flags( x, z );
	if ( fl & FLAG.RUNWAY ) return null;
	if ( env.building( x, z, 2 ) ) return null;
	const sl = slopeAt( env, x, z, 2 );
	if ( sl > 0.55 ) return null;
	const s = env.surface( x, z );
	const road = env.road( x, z, 45 );
	const city = cityAt( env.cities, x, z );
	const inTown = !! city && city.d < 1.1 && city.c.kind !== 'observatory';
	const nearTown = !! city && city.m < ( city.c.radius || 150 ) + 1200;
	const military = !! city && city.c.kind === 'military' && city.m < ( city.c.radius || 150 ) + 900;
	const sea = h < 9 ? seaNear( env, x, z ) : null;
	const beach = !! sea && h < 3.5 && ! ( fl & ( FLAG.ROAD | FLAG.STREET | FLAG.BUILDING | FLAG.CITY ) );
	const lot = env.lot( x, z );
	const nearRoad = road && road.dist < road.width / 2 + 16;
	let cls;
	if ( lot ) cls = 'lot';
	else if ( nearRoad ) cls = inTown || road.kind === 'street' ? 'street' : 'road';
	else if ( beach ) cls = 'beach';
	else if ( sea && sea.d <= 16 ) cls = 'shore';
	else if ( inTown ) cls = 'town';
	else if ( s[ 0 ] > 0.42 && h > 4 && s[ 1 ] < 0.3 ) cls = 'forest';
	else cls = 'open';
	return { x, z, h, sl, fl, m: s[ 0 ], lava: s[ 1 ], use: s[ 3 ], road, city, inTown, nearTown, military, sea, beach, lot, cls };
}

// kind weights for a probed point
export function weightsFor( p ) {
	const rd = p.road, rural = ! p.inTown;
	const hw = rd && rd.lanes >= 2 && rd.kind !== 'street';
	switch ( p.cls ) {
		case 'road': return {
			roadside: 3, crash_car: 1.3, body: 0.8,
			bus_stop: hw && p.nearTown ? 1 : 0,
			checkpoint: hw && p.nearTown ? 0.35 : 0,
			military_checkpoint: p.military ? 2.2 : hw ? 0.12 : 0,
			farm_stand: rural && rd.lanes <= 2 && p.h < 420 && ( p.use > 0 || ( p.m > 0.2 && p.m < 0.75 ) ) ? 1 : 0,
			picnic: p.h < 60 && p.sea ? 0.6 : 0.15,
			hiker: rd.kind === 'dirt' ? 0.8 : 0,
			fema_camp: p.nearTown && hw ? 0.25 : 0,
		};
		case 'street': return { roadside: 2.5, body: 1, checkpoint: 0.45, crash_car: 0.5, military_checkpoint: p.military ? 1 : 0 };
		// parking lots are full of the street generator's parked-and-left cars: only small finds fit between them
		case 'lot': return { body: 0.6, roadside: 1 };
		case 'beach': return { beach_camp: 3, fishing_spot: 1.1, body: 0.5, picnic: 0.6, campsite: 0.35 };
		case 'shore': return { fishing_spot: 2.6, body: 0.35, campsite: 0.3, picnic: 0.3 };
		// a town's parks and fields: a relief camp on the grass
		case 'town': return { body: 0.8, picnic: 0.5, roadside: 0.5, fema_camp: p.sl < 0.08 ? 0.7 : 0 };
		case 'forest': return { campsite: 2, hiker: 1.2 + ( p.sl > 0.12 ? 1 : 0 ), body: 0.45 };
		case 'open': return { campsite: 1, hiker: 0.7 + ( p.sl > 0.15 ? 0.6 : 0 ), body: 0.5, picnic: p.h < 120 ? 0.25 : 0, military_checkpoint: p.military ? 1.2 : 0,
			fema_camp: p.nearTown && p.sl < 0.08 && p.h < 200 ? 0.3 : 0 };
	}
	return {};
}

// is a disc of radius r clear for a site: dry, not too steep, off buildings (and, unless allowed, off the road)
export function fits( env, x, z, r, { slope = 0.26, minH = 0.6, offRoad = true } = {} ) {
	if ( env.building( x, z, r + 1 ) ) return false;
	let lo = Infinity, hi = - Infinity;
	for ( let k = 0; k <= 8; k ++ ) {
		const a = k / 8 * TAU, rr = k === 8 ? 0 : r;
		const px = x + Math.cos( a ) * rr, pz = z + Math.sin( a ) * rr;
		const h = env.height( px, pz );
		if ( ! ( h >= minH ) ) return false;
		if ( h < lo ) lo = h;
		if ( h > hi ) hi = h;
		if ( env.flags( px, pz ) & FLAG.RUNWAY ) return false;
	}
	if ( hi - lo > slope * 2 * r + 0.25 ) return false;
	if ( offRoad ) {
		const rd = env.road( x, z, r + 25 );
		if ( rd && rd.dist < rd.width / 2 + r * 0.8 + 0.8 ) return false;
	}
	return true;
}

const yawOf = ( fx, fz ) => Math.atan2( fx, fz ); // local +z faces (fx, fz)

// ---- a kind at a probed point -----------------------------------------------------------------------------------------

// roadside kinds sit at an offset from the centreline, facing it; returns the extra fields or null
function atRoad( env, p, R, kind, off ) {
	const rd = p.road;
	if ( ! rd ) return null;
	const nx = - rd.dz, nz = rd.dx;
	const side = R() < 0.5 ? 1 : - 1;
	const o = rd.width / 2 + off;
	const x = rd.x + nx * side * o, z = rd.z + nz * side * o;
	const fr = FOOT[ kind ];
	// the shoulder may touch the road; the rest of the footprint must not
	if ( ! fits( env, x, z, fr, { offRoad: false, slope: 0.3 } ) ) return null;
	const back = env.road( x, z, rd.width / 2 + off + 30 );
	if ( back && back.dist < rd.width / 2 + Math.min( off, 1.2 ) - 0.3 ) return null; // another road crosses here
	return { x, z, yaw: yawOf( - nx * side, - nz * side ), ro: o, rw: rd.width, lanes: rd.lanes, rk: rd.kind };
}

export function placeKind( env, p, kind, R ) {
	const rd = p.road;
	switch ( kind ) {
		case 'roadside': return rd && p.cls !== 'town' ? atRoad( env, p, R, kind, range( R, 1.4, 3.6 ) ) : free( env, p, kind, R );
		case 'bus_stop': return atRoad( env, p, R, kind, 3.4 );
		case 'crash_car': {
			if ( ! rd ) return null;
			const s = atRoad( env, p, R, kind, range( R, 5.5, 9 ) );
			return s && { ...s, flip: R() < 0.4 };
		}
		case 'checkpoint': case 'military_checkpoint': {
			if ( rd && ( p.cls === 'road' || p.cls === 'street' ) ) return atRoad( env, p, R, kind, kind === 'checkpoint' ? 3.2 : 5.5 );
			return free( env, p, kind, R, { slope: 0.16 } );
		}
		case 'farm_stand': return atRoad( env, p, R, kind, 4.2 );
		case 'picnic': return rd && p.cls === 'road' ? atRoad( env, p, R, kind, range( R, 7, 11 ) ) : free( env, p, kind, R, { slope: 0.2 } );
		case 'fema_camp': {
			if ( rd && p.cls !== 'lot' ) {
				const s = atRoad( env, p, R, kind, 18 );
				return s && fits( env, s.x, s.z, FOOT.fema_camp, { slope: 0.1 } ) ? s : null;
			}
			return free( env, p, kind, R, { slope: 0.1 } );
		}
		case 'beach_camp': case 'fishing_spot': return shoreSpot( env, p, kind, R );
		case 'hiker': return free( env, p, kind, R, { slope: 0.55 } );
		case 'body': return free( env, p, kind, R, { slope: 0.4, offRoad: false } );
		default: return free( env, p, kind, R );
	}
}

function free( env, p, kind, R, o = {} ) {
	if ( ! fits( env, p.x, p.z, FOOT[ kind ], o ) ) return null;
	return { x: p.x, z: p.z, yaw: R() * TAU };
}

// beach camps a little above the surf, fishing spots right at the water's edge; both face the sea
function shoreSpot( env, p, kind, R ) {
	const sea = p.sea || seaNear( env, p.x, p.z );
	if ( ! sea ) return null;
	let x = p.x, z = p.z;
	if ( kind === 'fishing_spot' ) {
		// walk down to the water's edge, short of the swash
		for ( let k = 0; k < 16; k ++ ) {
			const nx = x + sea.dx * 1.5, nz = z + sea.dz * 1.5;
			if ( env.height( nx, nz ) < 0.85 ) break;
			x = nx; z = nz;
		}
	} else {
		// up the beach out of the swash
		for ( let k = 0; k < 8 && env.height( x, z ) < 1.3; k ++ ) { x -= sea.dx * 3; z -= sea.dz * 3; }
	}
	if ( ! fits( env, x, z, kind === 'fishing_spot' ? 1.4 : FOOT[ kind ], { minH: kind === 'fishing_spot' ? 0.45 : 0.95, slope: 0.32 } ) ) return null;
	return { x, z, yaw: yawOf( sea.dx, sea.dz ) + ( R() - 0.5 ) * 0.5 };
}

// ---- a cell -----------------------------------------------------------------------------------------------------------

const EVENT_KIND = { roadblock: [ 'checkpoint', 1 ], checkpoint: [ 'military_checkpoint', 1 ], crash: [ 'crash_car', 0.85 ], jam: [ 'roadside', 0.6 ] };

export function planCell( env, ci, cj ) {
	const R = rng( hash32( ci, cj, ( env.seed ^ 0x51e5 ) | 0 ) );
	const out = [];
	const add = ( s, kind, cls ) => {
		const n = out.length;
		out.push( { kind, key: `site:${ci}:${cj}:${n}`, seed: hash32( ci, cj, ( ( env.seed | 0 ) + n * 7919 ) | 0 ), cls, ci, cj, ...s } );
	};
	// the roads' outbreak scenes get the loot their props promise
	for ( const e of env.events?.( ci, cj ) || [] ) {
		const ek = EVENT_KIND[ e.type ];
		if ( ! ek || R() > ek[ 1 ] ) continue;
		// local +x runs outbound along the road, local +z = the road normal times the travel direction
		add( { x: e.x, z: e.z, yaw: Math.atan2( - e.tz, e.tx ), ev: e.type, hw: e.hw, sd: e.sd ?? 1 }, ek[ 0 ], 'event' );
	}
	// a handful of probes; the best kind of place wins
	const probes = [];
	for ( let k = 0; k < 6; k ++ ) {
		const p = probe( env, ( ci + 0.06 + R() * 0.88 ) * CELL, ( cj + 0.06 + R() * 0.88 ) * CELL );
		if ( p ) probes.push( p );
	}
	probes.sort( ( a, b ) => CLASS_ORDER.indexOf( a.cls ) - CLASS_ORDER.indexOf( b.cls ) );
	let want = 0;
	if ( probes.length ) {
		const roll = R();
		const P = CLASS_P[ probes[ 0 ].cls ] * ( out.length ? 0.5 : 1 );
		if ( roll < P ) want = 1;
		// busy stretches of road and beach sometimes have a second find
		if ( want && ( probes[ 0 ].cls === 'road' || probes[ 0 ].cls === 'beach' ) && R() < 0.16 ) want = 2;
	}
	const kindsUsed = new Set();
	// the road scenes of the cells around (a site from this cell must not land in one) ...
	const scenes = [];
	if ( want > 0 && env.events ) for ( let di = - 1; di <= 1; di ++ ) for ( let dj = - 1; dj <= 1; dj ++ ) if ( di || dj ) scenes.push( ...env.events( ci + di, cj + dj ) );
	// ... and a footprint stays inside its own cell, so neighbouring cells' sites never overlap
	const x0 = ci * CELL, z0 = cj * CELL;
	const clear = ( s, kind ) => {
		const r = FOOT[ kind ];
		if ( s.x - r < x0 || s.x + r > x0 + CELL || s.z - r < z0 || s.z + r > z0 + CELL ) return false;
		if ( out.some( o => ( o.x - s.x ) ** 2 + ( o.z - s.z ) ** 2 < 30 * 30 ) ) return false;
		if ( scenes.some( e => ( e.x - s.x ) ** 2 + ( e.z - s.z ) ** 2 < ( 24 + r ) ** 2 ) ) return false;
		// nor in a helicopter wreck or on a stash (each lies well inside its own coarse cell)
		const h = heliAt( env, Math.floor( s.x / HELI_CELL ), Math.floor( s.z / HELI_CELL ) );
		if ( h && ( h.x - s.x ) ** 2 + ( h.z - s.z ) ** 2 < ( FOOT.heli_crash + r + 4 ) ** 2 ) return false;
		const st = stashAt( env, Math.floor( s.x / STASH_CELL ), Math.floor( s.z / STASH_CELL ) );
		return ! ( st && ( st.x - s.x ) ** 2 + ( st.z - s.z ) ** 2 < ( FOOT.stash + r + 2 ) ** 2 );
	};
	for ( const p of probes ) {
		if ( want <= 0 ) break;
		if ( out.some( s => ( s.x - p.x ) ** 2 + ( s.z - p.z ) ** 2 < 35 * 35 ) ) continue;
		const w = weightsFor( p );
		for ( const k of kindsUsed ) w[ k ] = 0;
		// a couple of tries: a kind that doesn't fit gives way to another
		for ( let t = 0; t < 3; t ++ ) {
			const kind = pickWeighted( R, w );
			if ( ! kind ) break;
			const s = placeKind( env, p, kind, R );
			if ( s && clear( s, kind ) ) {
				add( s, kind, p.cls );
				kindsUsed.add( kind );
				want --;
				break;
			}
			w[ kind ] = 0;
		}
	}
	return out;
}

// ---- rare grids ---------------------------------------------------------------------------------------------------------

// a helicopter down in the open or the forest, away from towns and roads: about one coarse cell in three
export function planHeli( env, I, J ) {
	const R = rng( hash32( I, J, ( env.seed ^ 0x4e11 ) | 0 ) );
	if ( R() > 0.34 ) return null;
	for ( let k = 0; k < 14; k ++ ) {
		const x = ( I + 0.1 + R() * 0.8 ) * HELI_CELL, z = ( J + 0.1 + R() * 0.8 ) * HELI_CELL;
		const p = probe( env, x, z );
		if ( ! p || ( p.cls !== 'forest' && p.cls !== 'open' ) || p.h < 4 || p.inTown ) continue;
		if ( p.road && p.road.dist < 30 ) continue;
		if ( ! fits( env, x, z, FOOT.heli_crash, { slope: 0.3 } ) || env.building( x, z, 40 ) ) continue;
		return { kind: 'heli_crash', key: `heli:${I}:${J}`, x, z, yaw: R() * TAU, seed: hash32( I, J, 0x4e12 ^ env.seed ), cls: p.cls, I, J };
	}
	return null;
}

// a buried stash somewhere quiet; one in four is a richer cache (what a treasure map leads to)
export function planStash( env, I, J ) {
	const R = rng( hash32( I, J, ( env.seed ^ 0x57a5 ) | 0 ) );
	if ( R() > 0.5 ) return null;
	const rich = R() < 0.25;
	for ( let k = 0; k < 8; k ++ ) {
		const x = ( I + 0.1 + R() * 0.8 ) * STASH_CELL, z = ( J + 0.1 + R() * 0.8 ) * STASH_CELL;
		const p = probe( env, x, z );
		if ( ! p || p.inTown || p.cls === 'beach' || p.cls === 'lot' || p.cls === 'street' || p.lava > 0.5 ) continue;
		if ( ! fits( env, x, z, FOOT.stash, { slope: 0.4 } ) ) continue;
		return { kind: 'stash', key: `stash:${I}:${J}`, x, z, yaw: R() * TAU, seed: hash32( I, J, 0x57a6 ^ env.seed ), cls: p.cls, rich, I, J };
	}
	return null;
}

// the rare grids' sites, remembered on env (the runtime looks them up often, and each fine cell checks its own)
export const heliAt = ( env, I, J ) => memo( env, 'h', I, J, planHeli );
export const stashAt = ( env, I, J ) => memo( env, 's', I, J, planStash );
function memo( env, t, I, J, fn ) {
	const m = env.memo || ( env.memo = new Map() );
	const k = t + I + ':' + J;
	let v = m.get( k );
	if ( v === undefined ) { v = fn( env, I, J ); m.set( k, v ); }
	return v;
}

// cells around a point, nearest first: [ [ i, j, d ] ] (d = distance to the cell's nearest edge)
export function cellsAround( x, z, r, size = CELL ) {
	const out = [];
	const i0 = Math.floor( ( x - r ) / size ), i1 = Math.floor( ( x + r ) / size );
	const j0 = Math.floor( ( z - r ) / size ), j1 = Math.floor( ( z + r ) / size );
	for ( let i = i0; i <= i1; i ++ ) for ( let j = j0; j <= j1; j ++ ) {
		const dx = Math.max( i * size - x, 0, x - ( i + 1 ) * size ), dz = Math.max( j * size - z, 0, z - ( j + 1 ) * size );
		const d = Math.hypot( dx, dz );
		if ( d <= r ) out.push( [ i, j, d ] );
	}
	return out.sort( ( a, b ) => a[ 2 ] - b[ 2 ] );
}
