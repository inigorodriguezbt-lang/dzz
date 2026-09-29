// Where vehicles stand when the world starts: every site is a pure function of the baked world data (and the
// height field), so the same car waits at the same curb in every game until the player touches it.
//   street parking  along the city grid (types by the kind of town), buses on the wide metro streets
//   curbside        in front of houses, garages, hospitals and hotels; police cruisers outside every station
//   lots            behind the big stores; a car at a pump in some gas stations
//   military        Humvees and army pickups along the base streets
//   highways        cars pulled over on the shoulders of the rural roads
//   harbours        boats moored off the main harbours and marinas, jet skis on the resort beaches (found by
//                   scanning the sea floor near the town, lazily, when the player gets close)
//   airports        light aircraft and a helicopter on the aprons beside each runway, tour helicopters on open
//                   ground near the tour towns
// A site: { key, type, x, z, yaw, cat, seed, water? }. vehicleState( site ) rolls its look and condition.
import { SPECS } from './specs.js';
import { hashKey, seeded } from './Vehicle.js';
import { getItem } from '../game/items/ItemDB.js';

export const CELL = 256;
const cellOf = ( x, z ) => ( Math.floor( x / CELL ) + 4096 ) * 8192 + ( Math.floor( z / CELL ) + 4096 );

const BT = { house: 1, grocery: 5, hardware: 8, hotel: 4, gas: 16, police: 17, hospital: 19, clinic: 20, warehouse: 23, garage: 24, market: 37 };

// weighted pick: [ [ value, weight ], ... ]
function pick( r, list ) {
	let t = 0;
	for ( const e of list ) t += e[ 1 ];
	let x = r() * t;
	for ( const e of list ) { x -= e[ 1 ]; if ( x <= 0 ) return e[ 0 ]; }
	return list[ list.length - 1 ][ 0 ];
}

const CIVIL = {
	metro: [ [ 'sedan', 34 ], [ 'suv', 20 ], [ 'pickup', 11 ], [ 'van', 12 ], [ 'sports_car', 4 ], [ 'jeep', 5 ], [ 'motorbike', 8 ], [ 'bus', 4 ] ],
	town: [ [ 'sedan', 30 ], [ 'suv', 20 ], [ 'pickup', 22 ], [ 'van', 10 ], [ 'jeep', 8 ], [ 'motorbike', 7 ], [ 'sports_car', 2 ], [ 'bus', 1 ] ],
	resort: [ [ 'sedan', 24 ], [ 'suv', 24 ], [ 'jeep', 16 ], [ 'sports_car', 12 ], [ 'van', 8 ], [ 'pickup', 8 ], [ 'motorbike', 8 ] ],
	village: [ [ 'pickup', 35 ], [ 'sedan', 20 ], [ 'suv', 15 ], [ 'jeep', 15 ], [ 'van', 8 ], [ 'motorbike', 7 ] ],
	rural: [ [ 'pickup', 30 ], [ 'suv', 20 ], [ 'sedan', 20 ], [ 'jeep', 15 ], [ 'van', 8 ], [ 'motorbike', 7 ] ],
	dirt: [ [ 'jeep', 40 ], [ 'pickup', 45 ], [ 'suv', 10 ], [ 'motorbike', 5 ] ],
};
// cars per 90 m of street, by kind of town
const STREET_DENSITY = { metro: 0.4, town: 0.42, resort: 0.4, village: 0.5 };

// harbours and marinas: the town whose shore is searched, and what is moored there
export const HARBOURS = [
	{ city: 'honolulu', boats: [ 'fishing_boat', 'fishing_boat', 'speedboat', 'speedboat', 'jetski' ], r: 1300 },
	{ city: 'waikiki', boats: [ 'speedboat', 'jetski' ], beach: 3, r: 800 },
	{ city: 'hawaiikai', boats: [ 'speedboat', 'speedboat', 'jetski' ], r: 900 },
	{ city: 'haleiwa', boats: [ 'fishing_boat', 'fishing_boat', 'speedboat' ], r: 700 },
	{ city: 'waianae', boats: [ 'fishing_boat', 'speedboat' ], r: 700 },
	{ city: 'kaneohe', boats: [ 'speedboat', 'jetski' ], r: 1200 },
	{ city: 'pearlharbor', boats: [ 'speedboat', 'speedboat' ], paint: 0x5d6468, r: 900 },
	{ city: 'lihue', boats: [ 'fishing_boat', 'fishing_boat', 'speedboat' ], r: 1500 },
	{ city: 'hanalei', boats: [ 'speedboat', 'jetski' ], r: 900 },
	{ city: 'kaunakakai', boats: [ 'fishing_boat', 'speedboat' ], r: 700 },
	{ city: 'lahaina', boats: [ 'speedboat', 'speedboat', 'fishing_boat', 'jetski' ], r: 800 },
	{ city: 'kaanapali', boats: [ 'jetski' ], beach: 2, r: 700 },
	{ city: 'kahului', boats: [ 'fishing_boat', 'fishing_boat' ], r: 1200 },
	{ city: 'kihei', boats: [ 'speedboat' ], beach: 1, r: 900 },
	{ city: 'wailea', boats: [], beach: 2, r: 700 },
	{ city: 'hilo', boats: [ 'fishing_boat', 'fishing_boat', 'speedboat' ], r: 1500 },
	{ city: 'kona', boats: [ 'speedboat', 'speedboat', 'fishing_boat', 'fishing_boat', 'jetski' ], r: 1000 },
	{ city: 'waikoloabeach', boats: [], beach: 2, r: 700 },
];
// open ground near these towns where the tour helicopters wait
const HELIPADS = [ 'honolulu', 'lihue', 'princeville', 'hilo' ];

export class Spawner {
	constructor( meta, hf ) {
		this.meta = meta;
		this.hf = hf;
		this.sites = [];
		this.grid = new Map();
		this.pumps = []; // { key, x, z, y, station }
		this.harbourDone = new Set();
		this._streetGrid();
		this._streets();
		this._buildings();
		this._military();
		this._highways();
		this._airports();
		this._helipads();
	}

	add( s ) {
		s.seed = hashKey( s.key );
		this.sites.push( s );
		const k = cellOf( s.x, s.z );
		let a = this.grid.get( k );
		if ( ! a ) { a = []; this.grid.set( k, a ); }
		a.push( s );
		return s;
	}

	// sites within r of (x, z)
	near( x, z, r, out = [] ) {
		out.length = 0;
		const r2 = r * r;
		for ( let i = Math.floor( ( x - r ) / CELL ); i <= Math.floor( ( x + r ) / CELL ); i ++ ) for ( let j = Math.floor( ( z - r ) / CELL ); j <= Math.floor( ( z + r ) / CELL ); j ++ ) {
			const a = this.grid.get( ( i + 4096 ) * 8192 + ( j + 4096 ) );
			if ( ! a ) continue;
			for ( const s of a ) if ( ( s.x - x ) ** 2 + ( s.z - z ) ** 2 <= r2 ) out.push( s );
		}
		return out;
	}

	// dry, gentle ground for a vehicle of the given half length along yaw
	flat( x, z, yaw = 0, hl = 2.4, maxRise = 0.45 ) {
		const hf = this.hf;
		const y = hf.heightAt( x, z );
		if ( y < 0.35 ) return false;
		const fx = - Math.sin( yaw ) * hl, fz = - Math.cos( yaw ) * hl;
		const a = hf.heightAt( x + fx, z + fz ), b = hf.heightAt( x - fx, z - fz );
		const c = hf.heightAt( x + fz * 0.4, z - fx * 0.4 ), d = hf.heightAt( x - fz * 0.4, z + fx * 0.4 );
		return Math.max( a, b, c, d, y ) - Math.min( a, b, c, d, y ) < maxRise && Math.min( a, b, c, d ) > 0.3;
	}

	// ---- the city streets -----------------------------------------------------------------------------------------

	_streetGrid() {
		const st = this.meta.streets || [];
		this.sgrid = new Map();
		for ( let i = 0; i < st.length; i ++ ) {
			const s = st[ i ];
			const x0 = Math.min( s[ 1 ], s[ 4 ] ), x1 = Math.max( s[ 1 ], s[ 4 ] ), z0 = Math.min( s[ 2 ], s[ 5 ] ), z1 = Math.max( s[ 2 ], s[ 5 ] );
			for ( let a = Math.floor( x0 / 64 ); a <= Math.floor( x1 / 64 ); a ++ ) for ( let b = Math.floor( z0 / 64 ); b <= Math.floor( z1 / 64 ); b ++ ) {
				const k = a * 100003 + b;
				let l = this.sgrid.get( k );
				if ( ! l ) { l = []; this.sgrid.set( k, l ); }
				l.push( i );
			}
		}
	}

	// the curb spot nearest a point: on the street segment closest to (x, z), in the parking lane on the point's
	// side, `along` metres from the foot of the perpendicular; returns { x, z, yaw } or null
	curbSpot( x, z, along = 0, maxD = 45 ) {
		const st = this.meta.streets || [];
		let best = null, bd = maxD;
		for ( let a = Math.floor( ( x - maxD ) / 64 ); a <= Math.floor( ( x + maxD ) / 64 ); a ++ ) for ( let b = Math.floor( ( z - maxD ) / 64 ); b <= Math.floor( ( z + maxD ) / 64 ); b ++ ) {
			for ( const i of this.sgrid.get( a * 100003 + b ) || [] ) {
				const s = st[ i ];
				const dx = s[ 4 ] - s[ 1 ], dz = s[ 5 ] - s[ 2 ], L2 = dx * dx + dz * dz;
				if ( L2 < 1 ) continue;
				const t = Math.max( 0, Math.min( 1, ( ( x - s[ 1 ] ) * dx + ( z - s[ 2 ] ) * dz ) / L2 ) );
				const d = Math.hypot( x - s[ 1 ] - dx * t, z - s[ 2 ] - dz * t );
				if ( d < bd ) { bd = d; best = { s, t, L: Math.sqrt( L2 ) }; }
			}
		}
		if ( ! best ) return null;
		const { s, L } = best;
		const ux = ( s[ 4 ] - s[ 1 ] ) / L, uz = ( s[ 5 ] - s[ 2 ] ) / L;
		const nx = - uz, nz = ux;
		const side = ( ( x - s[ 1 ] ) * nx + ( z - s[ 2 ] ) * nz ) >= 0 ? 1 : - 1;
		const margin = s[ 7 ] / 2 + s[ 8 ] + 4;
		const a = Math.max( margin, Math.min( L - margin, best.t * L + along ) );
		if ( L < margin * 2 ) return null;
		const u = s[ 7 ] / 2 - 1.15;
		return { x: s[ 1 ] + ux * a + nx * u * side, z: s[ 2 ] + uz * a + nz * u * side, yaw: Math.atan2( - ux * side, - uz * side ) };
	}

	_streets() {
		const { streets = [], cities } = this.meta;
		for ( let i = 0; i < streets.length; i ++ ) {
			const s = streets[ i ];
			const city = cities[ s[ 0 ] ];
			if ( ! city || ! STREET_DENSITY[ city.kind ] ) continue;
			const dx = s[ 4 ] - s[ 1 ], dz = s[ 5 ] - s[ 2 ];
			const L = Math.hypot( dx, dz );
			const w = s[ 7 ], walk = s[ 8 ];
			const margin = w / 2 + walk + 6;
			if ( L < margin * 2 + 6 ) continue;
			const r = seeded( hashKey( 'st' + i ) );
			const n = Math.floor( L / 90 * STREET_DENSITY[ city.kind ] + r() );
			const ux = dx / L, uz = dz / L, nx = - uz, nz = ux;
			const u = w / 2 - ( city.kind === 'village' ? 1.0 : 1.15 );
			for ( let j = 0; j < n; j ++ ) {
				const a = margin + r() * ( L - 2 * margin );
				const side = r() < 0.5 ? - 1 : 1;
				let type = pick( r, CIVIL[ city.kind ] );
				if ( type === 'bus' && w < 10 ) type = 'sedan';
				// most sit square at the curb; a few were left askew in a hurry
				const askew = r() < 0.1;
				const x = s[ 1 ] + ux * a + nx * ( u - ( askew ? 0.6 : 0 ) ) * side, z = s[ 2 ] + uz * a + nz * ( u - ( askew ? 0.6 : 0 ) ) * side;
				const yaw = Math.atan2( - ux * side, - uz * side ) + ( askew ? ( r() - 0.5 ) * 0.7 : ( r() - 0.5 ) * 0.06 );
				if ( ! this.flat( x, z, yaw, type === 'bus' ? 6 : 2.4, type === 'bus' ? 0.8 : 0.5 ) ) continue;
				this.add( { key: `st:${i}:${j}`, type, x, z, yaw, cat: 'civil' } );
			}
		}
	}

	// ---- buildings: curbside, lots, pumps, police --------------------------------------------------------------------

	_buildings() {
		const B = this.meta.buildings;
		if ( ! B?.data ) return;
		const D = B.data, NF = 11;
		const cities = this.meta.cities;
		for ( let bi = 0; bi * NF < D.length; bi ++ ) {
			const k = bi * NF;
			const bx = D[ k ], bz = D[ k + 1 ], W = D[ k + 2 ], Dp = D[ k + 3 ], ang = D[ k + 4 ], base = D[ k + 5 ], type = D[ k + 7 ], ci = D[ k + 9 ];
			const c = Math.cos( ang ), s = Math.sin( ang );
			const world = ( lx, lz ) => [ bx + lx * c - lz * s, bz + lx * s + lz * c ];
			const front = world( 0, - Dp / 2 );
			const r = seeded( hashKey( 'b' + bi ) );
			const city = cities[ ci ];
			const kind = city?.kind || 'village';
			const curb = ( n, cat, types, along = 7 ) => {
				for ( let j = 0; j < n; j ++ ) {
					const sp = this.curbSpot( front[ 0 ], front[ 1 ], ( j - ( n - 1 ) / 2 ) * along + ( r() - 0.5 ) * 2 );
					if ( ! sp ) return;
					const t = typeof types === 'string' ? types : pick( r, types );
					if ( ! this.flat( sp.x, sp.z, sp.yaw ) ) continue;
					this.add( { key: `b:${bi}:${j}`, type: t, x: sp.x, z: sp.z, yaw: sp.yaw + ( r() - 0.5 ) * 0.05, cat } );
				}
			};
			switch ( type ) {
				case BT.police: {
					curb( 2, 'police', 'police_car', 7 );
					// the lot behind the station
					const bd = 24;
					if ( Dp - bd > 9 && r() < 0.7 ) {
						const lz = - Dp / 2 + bd + 3.5, lx = ( r() - 0.5 ) * Math.max( 0, W - 6 );
						const [ x, z ] = world( lx, lz );
						if ( this.flat( x, z, - ang ) ) this.add( { key: `b:${bi}:lot`, type: 'police_car', x, z, yaw: - ang, cat: 'police' } );
					}
					break;
				}
				case BT.gas: {
					// pumps: two island rows in front of the kiosk (the buildings module draws them there too)
					const bdRaw = Math.min( Dp - 16, 10 ), bd = Math.max( 4, bdRaw );
					const oz = Dp / 2 - bdRaw / 2 - 1.5;
					const zc = oz - bd / 2 - 7.5;
					const nx = W > 30 ? 3 : 2;
					const fy = base + 0.25;
					const pumps = [];
					for ( let i = 0; i < nx; i ++ ) for ( const dz of [ - 1.6, 1.6 ] ) {
						const lx = ( i - ( nx - 1 ) / 2 ) * 7;
						const [ x, z ] = world( lx, zc + dz );
						const p = { key: `pump:${bi}:${i}:${dz > 0 ? 1 : 0}`, station: `gas:${bi}`, x, z, y: fy, lx, lz: zc + dz };
						pumps.push( p ); this.pumps.push( p );
					}
					if ( r() < 0.4 && pumps.length ) {
						const p = pumps[ Math.floor( r() * pumps.length ) ];
						const side = p.lz > zc ? 1 : - 1;
						const [ x, z ] = world( p.lx + 2.4, p.lz + side * 0.2 );
						const yaw = - ang + ( r() < 0.5 ? Math.PI / 2 : - Math.PI / 2 );
						this.add( { key: `b:${bi}:pump`, type: pick( r, CIVIL.town ), x, z, yaw, cat: 'civil' } );
					}
					break;
				}
				case BT.grocery: case BT.hardware: case BT.market: case BT.warehouse: {
					// the paved lot behind the store: a row of stalls, some taken
					const bd = type === BT.warehouse ? Math.min( 44, Dp ) : Math.min( 40, Math.max( 24, W * 0.8 ) );
					if ( Dp - bd < 9 ) { if ( r() < 0.5 ) curb( 1, 'civil', CIVIL[ kind ] || CIVIL.town ); break; }
					const lz = - Dp / 2 + bd + 3.6;
					const stalls = Math.floor( ( W - 4 ) / 2.9 );
					let j = 0;
					for ( let i = 0; i < stalls; i ++ ) {
						if ( r() > 0.42 ) continue;
						const lx = ( i - ( stalls - 1 ) / 2 ) * 2.9;
						const [ x, z ] = world( lx, lz );
						const yaw = - ang + ( r() < 0.8 ? 0 : Math.PI ) + ( r() - 0.5 ) * 0.08;
						const t = type === BT.warehouse ? pick( r, [ [ 'van', 3 ], [ 'pickup', 3 ], [ 'bus', 0.3 ] ] ) : pick( r, CIVIL[ kind ] || CIVIL.town );
						if ( t === 'bus' || ! this.flat( x, z, yaw ) ) continue;
						this.add( { key: `b:${bi}:s${j ++}`, type: t, x, z, yaw, cat: 'civil' } );
					}
					break;
				}
				case BT.garage: curb( 1 + ( r() < 0.5 ? 1 : 0 ), 'garage', CIVIL[ kind ] || CIVIL.town ); break;
				case BT.hospital: curb( 2, 'civil', [ [ 'van', 3 ], [ 'suv', 1 ] ] ); break;
				case BT.clinic: if ( r() < 0.6 ) curb( 1, 'civil', [ [ 'van', 2 ], [ 'sedan', 1 ] ] ); break;
				case BT.hotel: if ( r() < 0.6 ) curb( 1 + ( r() < 0.4 ? 1 : 0 ), 'civil', CIVIL.resort ); break;
				case BT.house: if ( r() < 0.12 ) curb( 1, 'civil', CIVIL[ kind ] || CIVIL.village ); break;
			}
		}
	}

	// ---- military bases -------------------------------------------------------------------------------------------------

	_military() {
		const { streets = [], cities } = this.meta;
		for ( let i = 0; i < streets.length; i ++ ) {
			const s = streets[ i ];
			const city = cities[ s[ 0 ] ];
			if ( city?.kind !== 'military' ) continue;
			const dx = s[ 4 ] - s[ 1 ], dz = s[ 5 ] - s[ 2 ], L = Math.hypot( dx, dz );
			const margin = s[ 7 ] / 2 + 6;
			if ( L < margin * 2 + 6 ) continue;
			const r = seeded( hashKey( 'mil' + i ) );
			const n = Math.floor( L / 60 * 0.5 + r() );
			const ux = dx / L, uz = dz / L, nx = - uz, nz = ux;
			for ( let j = 0; j < n; j ++ ) {
				const a = margin + r() * ( L - 2 * margin ), side = r() < 0.5 ? - 1 : 1;
				const u = s[ 7 ] / 2 - 1.4;
				const x = s[ 1 ] + ux * a + nx * u * side, z = s[ 2 ] + uz * a + nz * u * side;
				const yaw = Math.atan2( - ux * side, - uz * side ) + ( r() - 0.5 ) * 0.06;
				if ( ! this.flat( x, z, yaw ) ) continue;
				this.add( { key: `mil:${i}:${j}`, type: r() < 0.72 ? 'humvee' : 'pickup', x, z, yaw, cat: 'military' } );
			}
		}
	}

	// ---- rural highways: pulled over on the shoulder ---------------------------------------------------------------------

	_highways() {
		const { roads = [], cities } = this.meta;
		const inTown = ( x, z ) => cities.some( c => ( c.x - x ) ** 2 + ( c.z - z ) ** 2 < ( c.radius * 1.05 ) ** 2 );
		for ( let ri = 0; ri < roads.length; ri ++ ) {
			const road = roads[ ri ];
			const p = road.pts;
			if ( ! p || p.length < 6 ) continue;
			const r = seeded( hashKey( 'rd' + ri ) );
			let next = 250 + r() * 500, acc = 0, j = 0;
			for ( let k = 0; k + 5 < p.length; k += 3 ) {
				const ax = p[ k ], az = p[ k + 1 ], bx = p[ k + 3 ], bz = p[ k + 4 ];
				const L = Math.hypot( bx - ax, bz - az );
				if ( L < 1e-3 ) continue;
				while ( acc + L >= next ) {
					const t = ( next - acc ) / L;
					next += 450 + r() * 700;
					if ( r() > 0.55 ) continue;
					const ux = ( bx - ax ) / L, uz = ( bz - az ) / L, nx = - uz, nz = ux;
					const side = r() < 0.5 ? - 1 : 1;
					const off = road.w / 2 + 1.1;
					const x = ax + ( bx - ax ) * t + nx * off * side, z = az + ( bz - az ) * t + nz * off * side;
					if ( inTown( x, z ) ) continue;
					const yaw = Math.atan2( - ux * side, - uz * side ) + ( r() - 0.5 ) * 0.4;
					if ( ! this.flat( x, z, yaw, 2.4, 0.6 ) ) continue;
					this.add( { key: `rd:${ri}:${j ++}`, type: pick( r, road.lanes === 1 ? CIVIL.dirt : CIVIL.rural ), x, z, yaw, cat: 'civil' } );
				}
				acc += L;
			}
		}
	}

	// ---- airports and helipads --------------------------------------------------------------------------------------------

	_airports() {
		const rws = this.meta.runways || [];
		for ( let i = 0; i < rws.length; i ++ ) {
			const rw = rws[ i ];
			const c = Math.cos( rw.angle ), s = Math.sin( rw.angle );
			// the runway runs along its local x; try an apron on either side
			const place = ( lx, lz, yaw ) => [ rw.x + lx * c - lz * s, rw.z + lx * s + lz * c, yaw ];
			let placed = 0;
			for ( const side of [ 1, - 1 ] ) {
				if ( placed ) break;
				const lz = side * ( rw.w / 2 + 38 );
				const faceRunway = - rw.angle + ( side > 0 ? 0 : Math.PI ); // nose towards the runway
				const slots = [ [ - 70, 'plane' ], [ - 40, 'plane' ], [ - 10, 'plane' ], [ 30, 'helicopter' ], [ 55, 'helicopter' ] ];
				const ok = slots.every( ( [ lx ] ) => { const [ x, z ] = place( lx, lz, 0 ); return this.flat( x, z, faceRunway, 5, 0.8 ) && ! ( this.hf.flagsNear( x, z ) & 16 ); } );
				if ( ! ok ) continue;
				slots.forEach( ( [ lx, type ], j ) => {
					const [ x, z ] = place( lx, lz, 0 );
					this.add( { key: `air:${i}:${j}`, type, x, z, yaw: faceRunway, cat: 'air' } );
					placed ++;
				} );
			}
		}
	}

	_helipads() {
		const cities = this.meta.cities;
		for ( const id of HELIPADS ) {
			const c = cities.find( cc => cc.id === id );
			if ( ! c ) continue;
			const r = seeded( hashKey( 'heli' + id ) );
			// open, level ground clear of buildings and streets, towards the edge of town
			for ( let tries = 0; tries < 300; tries ++ ) {
				const a = r() * Math.PI * 2, d = c.radius * ( 0.7 + r() * 0.9 );
				const x = c.x + Math.cos( a ) * d, z = c.z + Math.sin( a ) * d;
				if ( this.hf.flagsNear( x, z ) & ( 1 | 4 | 16 ) ) continue;
				if ( ! this.flat( x, z, 0, 7, 0.5 ) || ! this.flat( x, z, Math.PI / 2, 7, 0.5 ) ) continue;
				this.add( { key: `heli:${id}`, type: 'helicopter', x, z, yaw: r() * Math.PI * 2, cat: 'air' } );
				break;
			}
		}
	}

	// ---- harbours (lazy: scanning the shore takes a few thousand height samples) -------------------------------------------

	// build the moorings of every harbour within `r` of (x, z) that hasn't been scanned yet
	harbours( x, z, r = 2500 ) {
		const cities = this.meta.cities;
		for ( const H of HARBOURS ) {
			if ( this.harbourDone.has( H.city ) ) continue;
			const c = cities.find( cc => cc.id === H.city );
			if ( ! c ) { this.harbourDone.add( H.city ); continue; }
			if ( Math.hypot( c.x - x, c.z - z ) > r + H.r ) continue;
			this.harbourDone.add( H.city );
			this._harbour( H, c );
		}
	}

	_harbour( H, c ) {
		const hf = this.hf;
		const step = 10, R = H.r;
		const water = [], sand = [];
		const shoreWithin = ( x, z, d, above = 0.3 ) => {
			for ( let k = 0; k < 8; k ++ ) { const a = k / 8 * Math.PI * 2; for ( const f of [ 0.5, 1 ] ) if ( hf.heightAt( x + Math.cos( a ) * d * f, z + Math.sin( a ) * d * f ) > above ) return true; }
			return false;
		};
		const deepWithin = ( x, z, d ) => {
			for ( let k = 0; k < 8; k ++ ) { const a = k / 8 * Math.PI * 2; if ( hf.heightAt( x + Math.cos( a ) * d, z + Math.sin( a ) * d ) < - 0.6 ) return true; }
			return false;
		};
		for ( let gz = - R; gz <= R; gz += step ) for ( let gx = - R; gx <= R; gx += step ) {
			if ( gx * gx + gz * gz > R * R ) continue;
			const x = c.x + gx, z = c.z + gz;
			const h = hf.heightAt( x, z );
			if ( h < - 1.8 && h > - 7 ) water.push( [ x, z, Math.hypot( gx, gz ) ] );
			else if ( H.beach && h > 0.2 && h < 1.1 ) sand.push( [ x, z, Math.hypot( gx, gz ) ] );
		}
		water.sort( ( a, b ) => a[ 2 ] - b[ 2 ] );
		sand.sort( ( a, b ) => a[ 2 ] - b[ 2 ] );
		const taken = [];
		const free = ( x, z, d ) => taken.every( t => ( t[ 0 ] - x ) ** 2 + ( t[ 1 ] - z ) ** 2 > d * d );
		// the bow points away from the shore (down the slope of the sea floor)
		const seaward = ( x, z ) => {
			const gx = hf.heightAt( x + 6, z ) - hf.heightAt( x - 6, z ), gz = hf.heightAt( x, z + 6 ) - hf.heightAt( x, z - 6 );
			return Math.atan2( gx, gz );
		};
		let j = 0;
		for ( const type of H.boats ) {
			const big = type === 'fishing_boat';
			const spot = water.find( ( [ x, z ] ) => free( x, z, big ? 24 : 16 ) && ( hf.heightAt( x, z ) < ( big ? - 2.2 : - 1.8 ) ) && shoreWithin( x, z, big ? 60 : 45 ) );
			if ( ! spot ) break;
			taken.push( spot );
			this.add( { key: `hb:${H.city}:${j ++}`, type, x: spot[ 0 ], z: spot[ 1 ], yaw: seaward( spot[ 0 ], spot[ 1 ] ), cat: 'boat', water: true, paint: H.paint } );
		}
		for ( let b = 0; b < ( H.beach || 0 ); b ++ ) {
			const spot = sand.find( ( [ x, z ] ) => free( x, z, 30 ) && deepWithin( x, z, 14 ) && this.flat( x, z, 0, 1.6, 0.6 ) && ! ( hf.flagsNear( x, z ) & ( 1 | 4 | 16 ) ) );
			if ( ! spot ) break;
			taken.push( spot );
			this.add( { key: `hb:${H.city}:b${b}`, type: 'jetski', x: spot[ 0 ], z: spot[ 1 ], yaw: seaward( spot[ 0 ], spot[ 1 ] ), cat: 'boat' } );
		}
	}
}

// ---- the condition a site's vehicle is found in -------------------------------------------------------------------------

// { look, fuel, health, tyres, crack, needs, keysIn } — deterministic from the site
export function vehicleState( site ) {
	const spec = SPECS[ site.type ];
	const r = seeded( site.seed ^ 0x9e3779b9 );
	const cat = site.cat;
	const paints = spec.paints || [ 0xb0b4b8 ];
	const look = {
		paint: site.paint ?? paints[ Math.floor( r() * paints.length ) ],
		paint2: spec.paints2 ? spec.paints2[ Math.floor( r() * spec.paints2.length ) ] : 0xf2f2f0,
		metallic: spec.metallic ? spec.metallic[ 0 ] + r() * ( spec.metallic[ 1 ] - spec.metallic[ 0 ] ) : 0.3,
	};
	if ( site.type === 'pickup' && cat === 'military' ) { look.paint = 0x4b5320; look.metallic = 0.05; }
	const tank = spec.fuel.tank;
	let fuel, health, dirt, rust = 0, fade = 0, gdirt, crack = 0, keysIn = false;
	const needs = {};
	const tyres = [];
	if ( cat === 'civil' || cat === 'garage' ) {
		const f = r();
		fuel = tank * ( f < 0.1 ? 0 : f < 0.65 ? 0.05 + r() * 0.3 : f < 0.9 ? 0.35 + r() * 0.35 : 0.7 + r() * 0.25 );
		health = spec.health * ( cat === 'garage' ? 0.35 + r() * 0.35 : r() < 0.08 ? 0.3 + r() * 0.2 : 0.55 + r() * 0.45 );
		dirt = 0.3 + r() * 0.55;
		rust = r() < 0.22 ? 0.2 + r() * 0.45 : r() * 0.12;
		fade = r() * 0.5;
		gdirt = 0.2 + r() * 0.45;
		if ( r() < 0.12 ) crack = 0.1 + r() * 0.3;
		if ( r() < ( cat === 'garage' ? 0.4 : 0.15 ) ) needs.battery = true;
		if ( r() < ( cat === 'garage' ? 0.3 : 0.1 ) ) needs.spark = true;
		keysIn = r() < 0.1;
		if ( r() < 0.1 ) tyres.push( Math.floor( r() * 4 ) );
	} else if ( cat === 'police' ) {
		fuel = tank * ( 0.25 + r() * 0.5 );
		health = spec.health * ( 0.7 + r() * 0.3 );
		dirt = 0.12 + r() * 0.25; gdirt = 0.1 + r() * 0.2;
		keysIn = r() < 0.25;
		if ( r() < 0.08 ) needs.battery = true;
	} else if ( cat === 'military' ) {
		fuel = tank * ( 0.4 + r() * 0.5 );
		health = spec.health * ( 0.7 + r() * 0.3 );
		dirt = 0.35 + r() * 0.4; gdirt = 0.2 + r() * 0.3;
		keysIn = r() < 0.6;
	} else if ( cat === 'boat' ) {
		fuel = tank * ( 0.2 + r() * 0.6 );
		health = spec.health * ( 0.7 + r() * 0.3 );
		dirt = 0.1 + r() * 0.3; rust = r() * 0.15; gdirt = 0.2 + r() * 0.3;
	} else {
		fuel = tank * ( 0.25 + r() * 0.65 );
		health = spec.health * ( 0.8 + r() * 0.2 );
		dirt = 0.05 + r() * 0.15; gdirt = 0.05 + r() * 0.15;
	}
	// dings and dents on the abandoned ones, more on the rusty old ones
	const dent = cat === 'civil' || cat === 'garage' ? ( r() < 0.35 ? 0.15 + r() * 0.35 + rust * 0.5 : r() * 0.08 ) : cat === 'military' ? r() * 0.2 : 0;
	Object.assign( look, { dirt, rust, fade, gdirt, crack, dent } );
	// a part nobody can find would strand the car for good
	if ( ! getItem( 'car_battery' ) ) delete needs.battery;
	if ( ! getItem( 'spark_plug' ) ) delete needs.spark;
	return { look, fuel, health, crack, needs, keysIn, flat: tyres };
}
