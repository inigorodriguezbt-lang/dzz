// Where the infected are and what they were: density from the baked world (building counts and kinds,
// settlements by kind, roads), the kind of place (police station, hospital, base, resort, airport, industry)
// that decides who shambles there, and the local population thinned by kills, recovering over days.
import * as THREE from 'three';

const CELL = 64; // density cache cell (m)
const KILL_CELL = 512; // kill bookkeeping cell (m)
const REGEN_H = 72; // game hours for a cleared area to fill back up (e-folding)

// building type codes (tools/bake/cities.mjs BT) -> weight in the density and zone tags
const BT_W = { 1: 1, 2: 3.5, 3: 3, 4: 5, 5: 2.5, 6: 1.5, 7: 2, 8: 1.5, 9: 1, 10: 2, 11: 1.5, 12: 1.2, 13: 2, 14: 2, 15: 2, 16: 1, 17: 3, 18: 2, 19: 6,
	20: 2.5, 21: 3.5, 22: 2, 23: 1.5, 24: 1, 25: 4, 26: 4, 27: 3, 28: 2, 29: 6, 30: 1, 31: 0.5, 32: 1.5, 33: 1.5, 34: 1, 35: 0.3, 36: 2, 37: 2.5 };
const TAG = { 17: 'police', 19: 'hospital', 20: 'hospital', 7: 'hospital', 18: 'fire', 25: 'military', 26: 'military', 27: 'military', 36: 'military',
	4: 'resort', 12: 'resort', 29: 'airport', 30: 'airport', 28: 'airport', 23: 'industrial', 24: 'industrial', 8: 'industrial', 16: 'industrial' };
const CITY_K = { metro: 1, resort: 0.95, town: 0.72, village: 0.45, military: 1, airport: 0.7, observatory: 0.15 };

// who the infected are, by the kind of place: [ zombie kind, weight ]
const MIX = {
	city: [ [ 'civilian', 62 ], [ 'tourist', 10 ], [ 'worker', 8 ], [ 'police', 5 ], [ 'medic', 3 ], [ 'firefighter', 1 ], [ 'runner', 7 ], [ 'crawler', 3 ], [ 'brute', 2 ] ],
	resort: [ [ 'tourist', 55 ], [ 'civilian', 25 ], [ 'worker', 3 ], [ 'police', 3 ], [ 'runner', 8 ], [ 'crawler', 3 ], [ 'brute', 2 ] ],
	police: [ [ 'police', 45 ], [ 'civilian', 35 ], [ 'runner', 8 ], [ 'crawler', 4 ], [ 'brute', 4 ], [ 'medic', 4 ] ],
	hospital: [ [ 'medic', 45 ], [ 'civilian', 30 ], [ 'tourist', 6 ], [ 'crawler', 10 ], [ 'runner', 6 ], [ 'brute', 3 ] ],
	fire: [ [ 'firefighter', 40 ], [ 'civilian', 40 ], [ 'medic', 6 ], [ 'runner', 8 ], [ 'brute', 4 ] ],
	military: [ [ 'military', 78 ], [ 'medic', 5 ], [ 'firefighter', 2 ], [ 'runner', 8 ], [ 'crawler', 3 ], [ 'brute', 4 ] ],
	airport: [ [ 'civilian', 30 ], [ 'tourist', 35 ], [ 'pilot', 10 ], [ 'police', 8 ], [ 'worker', 6 ], [ 'runner', 7 ], [ 'crawler', 2 ], [ 'brute', 2 ] ],
	industrial: [ [ 'worker', 45 ], [ 'civilian', 30 ], [ 'brute', 8 ], [ 'runner', 8 ], [ 'crawler', 4 ], [ 'firefighter', 3 ] ],
	rural: [ [ 'civilian', 55 ], [ 'worker', 20 ], [ 'tourist', 10 ], [ 'runner', 6 ], [ 'crawler', 5 ], [ 'brute', 3 ], [ 'military', 1 ] ],
	beach: [ [ 'tourist', 60 ], [ 'civilian', 25 ], [ 'runner', 8 ], [ 'crawler', 5 ], [ 'brute', 2 ] ],
};

const bkey = ( i, j ) => i * 100003 + j;

export class Population {
	constructor( game ) {
		this.game = game;
		const meta = game.world.meta;
		this.meta = meta;
		this.cache = new Map();
		this.zoneCache = new Map();
		this.killed = new Map(); // "i,j" -> [ count, hour ]
		// buildings per cell: summed weight and tag counts
		this.cells = new Map();
		const B = meta.buildings, D = B.data, F = B.fields.length;
		const ix = B.fields.indexOf( 'x' ), iz = B.fields.indexOf( 'z' ), it = B.fields.indexOf( 'type' ), iF = B.fields.indexOf( 'floors' );
		for ( let k = 0; k < D.length; k += F ) {
			const x = D[ k + ix ], z = D[ k + iz ], t = D[ k + it ], fl = D[ k + iF ] || 1;
			const key = bkey( Math.floor( x / CELL ), Math.floor( z / CELL ) );
			let c = this.cells.get( key );
			if ( ! c ) this.cells.set( key, c = { w: 0, tags: {} } );
			c.w += ( BT_W[ t ] || 1 ) * ( t === 2 || t === 3 || t === 4 ? Math.min( 3, 0.6 + fl * 0.2 ) : 1 );
			const tag = TAG[ t ];
			if ( tag ) c.tags[ tag ] = ( c.tags[ tag ] || 0 ) + 1;
		}
		// roads as sample points for highway hordes: [ x, z, dx, dz ] per ~60 m of the larger roads
		this.roadPts = new Map();
		for ( const r of meta.roads || [] ) {
			if ( ( r.lanes || 2 ) < 2 ) continue;
			const p = r.pts;
			let acc = 0;
			for ( let k = 3; k < p.length; k += 3 ) {
				const dx = p[ k ] - p[ k - 3 ], dz = p[ k + 1 ] - p[ k - 2 ];
				const L = Math.hypot( dx, dz );
				acc += L;
				if ( acc < 60 || L < 1e-3 ) continue;
				acc = 0;
				const key = bkey( Math.floor( p[ k ] / 256 ), Math.floor( p[ k + 1 ] / 256 ) );
				let a = this.roadPts.get( key );
				if ( ! a ) this.roadPts.set( key, a = [] );
				a.push( p[ k ], p[ k + 1 ], dx / L, dz / L );
			}
		}
	}

	// 0..1 how crowded with the infected this spot is (before kills and time of day)
	density( x, z ) {
		const i = Math.floor( x / CELL ), j = Math.floor( z / CELL );
		const key = bkey( i, j );
		let d = this.cache.get( key );
		if ( d !== undefined ) return d;
		const cx = ( i + 0.5 ) * CELL, cz = ( j + 0.5 ) * CELL;
		// buildings in the 3 x 3 neighbourhood (~190 m)
		let w = 0;
		for ( let a = - 1; a <= 1; a ++ ) for ( let b = - 1; b <= 1; b ++ ) {
			const c = this.cells.get( bkey( i + a, j + b ) );
			if ( c ) w += c.w * ( a === 0 && b === 0 ? 1 : 0.6 );
		}
		const db = 1 - Math.exp( - w / 14 );
		// settlements
		let dc = 0, mil = false;
		for ( const c of this.meta.cities ) {
			const dist = Math.hypot( cx - c.x, cz - c.z );
			const R = c.radius || 300;
			if ( dist > R * 1.6 ) continue;
			const k = ( CITY_K[ c.kind ] ?? 0.5 ) * ( 1 - THREE.MathUtils.smoothstep( dist, R * 0.45, R * 1.6 ) );
			if ( k > dc ) { dc = k; mil = c.kind === 'military'; }
		}
		const hf = this.game.hf;
		const road = hf.flagsNear( cx, cz ) & ( 1 | 4 ) ? 0.05 : 0;
		// the settlement itself counts most (the baked blocks hold a sample of its buildings, not all of them)
		d = Math.max( 0.012 + road, db * 0.55 + dc * 0.62 );
		if ( mil ) d = Math.min( 1, d * 1.3 );
		if ( hf.baseHeight( cx, cz ) < 0 ) d *= 0.2;
		d = Math.min( 1, d );
		this.cache.set( key, d );
		return d;
	}

	// what kind of place: decides the mix of infected
	zone( x, z ) {
		const i = Math.floor( x / CELL ), j = Math.floor( z / CELL );
		const key = bkey( i, j );
		let zn = this.zoneCache.get( key );
		if ( zn ) return zn;
		const tags = {};
		let w = 0;
		for ( let a = - 1; a <= 1; a ++ ) for ( let b = - 1; b <= 1; b ++ ) {
			const c = this.cells.get( bkey( i + a, j + b ) );
			if ( ! c ) continue;
			w += c.w;
			for ( const t in c.tags ) tags[ t ] = ( tags[ t ] || 0 ) + c.tags[ t ] * ( a === 0 && b === 0 ? 2 : 1 );
		}
		let city = null, cd = Infinity;
		for ( const c of this.meta.cities ) {
			const dist = Math.hypot( x - c.x, z - c.z );
			if ( dist < ( c.radius || 300 ) * 1.3 && dist < cd ) { cd = dist; city = c; }
		}
		if ( city?.kind === 'military' || ( tags.military || 0 ) >= 2 ) zn = 'military';
		else if ( city?.kind === 'airport' || tags.airport ) zn = 'airport';
		else if ( tags.police ) zn = 'police';
		else if ( tags.hospital ) zn = 'hospital';
		else if ( tags.fire ) zn = 'fire';
		else if ( city?.kind === 'resort' || ( tags.resort || 0 ) >= 1 ) zn = 'resort';
		else if ( ( tags.industrial || 0 ) >= 3 ) zn = 'industrial';
		else if ( w > 6 || city ) zn = 'city';
		else zn = this.game.world.isBeach?.( x, z ) ? 'beach' : 'rural';
		this.zoneCache.set( key, zn );
		return zn;
	}

	// a random kind of infected for this spot (runners are more common at night)
	pickKind( x, z, night = 0, rnd = Math.random ) {
		const mix = MIX[ this.zone( x, z ) ] || MIX.city;
		let tot = 0;
		for ( const [ k, w ] of mix ) tot += k === 'runner' ? w * ( 1 + night ) : w;
		let r = rnd() * tot;
		for ( const [ k, w ] of mix ) { r -= k === 'runner' ? w * ( 1 + night ) : w; if ( r <= 0 ) return k; }
		return 'civilian';
	}

	// ---- kills thin the local population; it recovers over days -----------------------------------------------

	killKey( x, z ) { return Math.floor( x / KILL_CELL ) + ',' + Math.floor( z / KILL_CELL ); }

	addKill( x, z, hour ) {
		const k = this.killKey( x, z );
		const e = this.killed.get( k );
		const n = e ? e[ 0 ] * Math.exp( - ( hour - e[ 1 ] ) / REGEN_H ) : 0;
		this.killed.set( k, [ n + 1, hour ] );
	}

	// 0.12..1 multiplier on how many are left here
	killFactor( x, z, hour ) {
		const e = this.killed.get( this.killKey( x, z ) );
		if ( ! e ) return 1;
		const n = e[ 0 ] * Math.exp( - ( hour - e[ 1 ] ) / REGEN_H );
		const cap = 10 + this.density( x, z ) * 60;
		return Math.max( 0.12, 1 - n / cap );
	}

	// a point on a highway 100-200 m from p (for a passing horde), with the road direction
	roadNear( p, rMin, rMax, rnd = Math.random ) {
		const cands = [];
		const i0 = Math.floor( p.x / 256 ), j0 = Math.floor( p.z / 256 );
		for ( let a = - 1; a <= 1; a ++ ) for ( let b = - 1; b <= 1; b ++ ) {
			const arr = this.roadPts.get( bkey( i0 + a, j0 + b ) );
			if ( ! arr ) continue;
			for ( let k = 0; k < arr.length; k += 4 ) {
				const d = Math.hypot( arr[ k ] - p.x, arr[ k + 1 ] - p.z );
				if ( d >= rMin && d <= rMax ) cands.push( k, arr );
			}
		}
		if ( ! cands.length ) return null;
		const n = Math.floor( rnd() * cands.length / 2 ) * 2;
		const k = cands[ n ], arr = cands[ n + 1 ];
		return { x: arr[ k ], z: arr[ k + 1 ], dx: arr[ k + 2 ], dz: arr[ k + 3 ] };
	}

	serialize() {
		const o = {};
		for ( const [ k, v ] of this.killed ) if ( v[ 0 ] > 0.5 ) o[ k ] = [ Math.round( v[ 0 ] * 10 ) / 10, Math.round( v[ 1 ] * 100 ) / 100 ];
		return o;
	}
	load( o ) {
		this.killed.clear();
		for ( const k in o || {} ) if ( Array.isArray( o[ k ] ) ) this.killed.set( k, [ + o[ k ][ 0 ] || 0, + o[ k ][ 1 ] || 0 ] );
	}
}
