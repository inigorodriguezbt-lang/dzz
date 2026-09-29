// City street grids, blocks, lots and building footprints, and the terrain flattening under them.
import { smoothstep, mulberry32, hashStr, fbm } from './grid.mjs';
import { lonLatToWorld } from './geo.mjs';
import { CITIES } from './places.mjs';

// building types; the runtime has matching interior generators and loot tables
export const BT = {
	house: 1, apartment: 2, office: 3, hotel: 4, grocery: 5, convenience: 6, pharmacy: 7, hardware: 8, gunstore: 9,
	clothing: 10, sports: 11, surf: 12, restaurant: 13, bar: 14, fastfood: 15, gas: 16, police: 17, fire: 18,
	hospital: 19, clinic: 20, school: 21, church: 22, warehouse: 23, garage: 24, barracks: 25, mil_hq: 26,
	armory: 27, hangar: 28, terminal: 29, tower: 30, observatory: 31, bank: 32, post: 33, pawn: 34, shed: 35,
	mil_tent: 36, market: 37,
};

const KIND = {
	metro: { block: [ 78, 96 ], street: 12, walk: 3, slope: 30 },
	town: { block: [ 72, 100 ], street: 10, walk: 2.5, slope: 26 },
	village: { block: [ 64, 90 ], street: 8, walk: 2, slope: 22 },
	resort: { block: [ 90, 110 ], street: 10, walk: 2.5, slope: 18 },
	military: { block: [ 110, 120 ], street: 10, walk: 0, slope: 16 },
	airport: { block: [ 120, 140 ], street: 10, walk: 0, slope: 14 },
	observatory: { block: [ 60, 60 ], street: 8, walk: 0, slope: 30 },
};

// the shops, services and landmarks each kind of settlement tries to have
const WANT = {
	metro: [ 'hospital', 'police', 'police', 'fire', 'fire', 'gunstore', 'gunstore', 'grocery', 'grocery', 'grocery', 'pharmacy', 'pharmacy',
		'pharmacy', 'hardware', 'hardware', 'clothing', 'clothing', 'clothing', 'sports', 'sports', 'surf', 'gas', 'gas', 'gas', 'gas', 'school',
		'school', 'church', 'church', 'bank', 'bank', 'post', 'pawn', 'pawn', 'bar', 'bar', 'bar', 'fastfood', 'fastfood', 'fastfood', 'restaurant',
		'restaurant', 'restaurant', 'restaurant', 'convenience', 'convenience', 'convenience', 'convenience', 'clinic', 'garage', 'garage', 'market' ],
	town: [ 'police', 'fire', 'clinic', 'grocery', 'grocery', 'pharmacy', 'hardware', 'gunstore', 'gas', 'gas', 'school', 'church', 'bank',
		'post', 'restaurant', 'restaurant', 'fastfood', 'fastfood', 'bar', 'convenience', 'convenience', 'clothing', 'sports', 'surf', 'garage', 'pawn' ],
	village: [ 'convenience', 'gas', 'church', 'restaurant', 'grocery', 'police', 'surf', 'bar', 'hardware', 'clinic' ],
	resort: [ 'hotel', 'hotel', 'hotel', 'hotel', 'restaurant', 'restaurant', 'bar', 'bar', 'convenience', 'convenience', 'surf', 'surf',
		'clothing', 'clothing', 'pharmacy', 'gas', 'fastfood' ],
	military: [ 'mil_hq', 'armory', 'armory', 'hangar', 'barracks', 'barracks', 'barracks', 'barracks', 'mil_tent', 'mil_tent', 'mil_tent',
		'warehouse', 'garage', 'clinic', 'fire' ],
	airport: [ 'terminal', 'tower', 'hangar', 'hangar', 'hangar', 'fire', 'warehouse', 'police' ],
	observatory: [ 'observatory', 'observatory', 'observatory', 'observatory' ],
};

export function layoutCities( fine, claim ) {
	const out = { cities: [], streets: [], blocks: [], lots: [], runways: [] };
	CITIES.forEach( ( c, cityIndex ) => {
		const [ cx, cz ] = lonLatToWorld( c.lon, c.lat );
		const K = KIND[ c.kind ];
		const rnd = mulberry32( hashStr( c.id ) );
		const a = c.angle * Math.PI / 180, ca = Math.cos( a ), sa = Math.sin( a );
		const PU = K.block[ 0 ] + K.street, PV = K.block[ 1 ] + K.street;
		const toW = ( u, v ) => [ cx + u * ca - v * sa, cz + u * sa + v * ca ];
		const R = c.size * 1.35;
		const nU = Math.ceil( R / PU ) + 1, nV = Math.ceil( R / PV ) + 1;
		const acc = new Map();
		const key = ( i, j ) => i + ',' + j;
		for ( let j = - nV; j < nV; j ++ ) for ( let i = - nU; i < nU; i ++ ) {
			const u0 = i * PU, v0 = j * PV;
			const [ mx, mz ] = toW( u0 + PU / 2, v0 + PV / 2 );
			const d = Math.hypot( mx - cx, mz - cz );
			const edge = R * ( 0.78 + fbm( mx / 260, mz / 260, 2, cityIndex ) * 0.45 );
			if ( d > edge ) continue;
			// the block and its surrounding half streets must be on gentle dry land, not claimed by another city
			let lo = Infinity, hi = - Infinity, ok = true;
			for ( let b = 0; b <= 4 && ok; b ++ ) for ( let q = 0; q <= 4; q ++ ) {
				const [ x, z ] = toW( u0 + q / 4 * PU, v0 + b / 4 * PV );
				const h = fine.sample( x, z );
				if ( h < 1.0 ) { ok = false; break; }
				lo = Math.min( lo, h ); hi = Math.max( hi, h );
				if ( claim.at( x, z ) ) { ok = false; break; }
			}
			if ( ! ok || hi - lo > K.slope ) continue;
			acc.set( key( i, j ), { i, j, d } );
		}
		// drop islands of one or two blocks that are cut off from the rest
		if ( acc.size === 0 ) return;
		const seen = new Set();
		let bestComp = null;
		for ( const b of acc.values() ) {
			if ( seen.has( key( b.i, b.j ) ) ) continue;
			const comp = [], st = [ b ];
			seen.add( key( b.i, b.j ) );
			while ( st.length ) {
				const q = st.pop(); comp.push( q );
				for ( const [ di, dj ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {
					const k2 = key( q.i + di, q.j + dj );
					if ( acc.has( k2 ) && ! seen.has( k2 ) ) { seen.add( k2 ); st.push( acc.get( k2 ) ); }
				}
			}
			const score = comp.length - Math.min( ...comp.map( q => q.d ) ) / 200;
			if ( ! bestComp || score > bestComp.score ) bestComp = { comp, score };
		}
		const blocks = bestComp.comp;
		if ( c.kind !== 'observatory' && blocks.length < 2 ) return;
		const inCity = new Set( blocks.map( b => key( b.i, b.j ) ) );

		// intersection heights: smoothed terrain, relaxed so streets stay drivable
		const ih = new Map();
		const corners = new Set();
		for ( const b of blocks ) for ( const [ di, dj ] of [ [ 0, 0 ], [ 1, 0 ], [ 0, 1 ], [ 1, 1 ] ] ) corners.add( key( b.i + di, b.j + dj ) );
		for ( const k of corners ) {
			const [ i, j ] = k.split( ',' ).map( Number );
			const [ x, z ] = toW( i * PU, j * PV );
			ih.set( k, Math.max( 1.8, fine.sampleAvg( x, z, 28 ) ) );
		}
		for ( let it = 0; it < 6; it ++ ) {
			const nh = new Map();
			for ( const k of corners ) {
				const [ i, j ] = k.split( ',' ).map( Number );
				let s = ih.get( k ) * 2, n = 2;
				for ( const [ di, dj ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {
					const k2 = key( i + di, j + dj );
					if ( ih.has( k2 ) ) { s += ih.get( k2 ); n ++; }
				}
				nh.set( k, Math.max( 1.8, s / n ) );
			}
			for ( const [ k, v ] of nh ) ih.set( k, v );
		}
		const surf = ( u, v ) => {
			const fi = u / PU, fj = v / PV, i = Math.floor( fi ), j = Math.floor( fj ), tu = fi - i, tv = fj - j;
			const g = ( a2, b2 ) => ih.get( key( a2, b2 ) );
			let h00 = g( i, j ), h10 = g( i + 1, j ), h01 = g( i, j + 1 ), h11 = g( i + 1, j + 1 );
			const any = [ h00, h10, h01, h11 ].find( v2 => v2 !== undefined );
			if ( any === undefined ) return null;
			h00 ??= any; h10 ??= any; h01 ??= any; h11 ??= any;
			return ( h00 * ( 1 - tu ) + h10 * tu ) * ( 1 - tv ) + ( h01 * ( 1 - tu ) + h11 * tu ) * tv;
		};

		const city = {
			index: out.cities.length, id: c.id, name: c.name, kind: c.kind, island: c.island, x: cx, z: cz, angle: a,
			pu: PU, pv: PV, street: K.street, walk: K.walk, radius: R, blocks: blocks.length,
		};
		out.cities.push( city );

		// flatten: inside accepted cells (and half a street beyond) the terrain is the bilinear city surface
		const margin = K.street / 2 + K.walk + 3, blend = 26;
		let umin = Infinity, umax = - Infinity, vmin = Infinity, vmax = - Infinity;
		for ( const b of blocks ) { umin = Math.min( umin, b.i * PU ); umax = Math.max( umax, ( b.i + 1 ) * PU ); vmin = Math.min( vmin, b.j * PV ); vmax = Math.max( vmax, ( b.j + 1 ) * PV ); }
		const ext = margin + blend;
		const wc = [ toW( umin - ext, vmin - ext ), toW( umax + ext, vmin - ext ), toW( umin - ext, vmax + ext ), toW( umax + ext, vmax + ext ) ];
		const xs = wc.map( p => p[ 0 ] ), zs = wc.map( p => p[ 1 ] );
		const i0 = Math.max( 0, Math.floor( ( Math.min( ...xs ) - fine.x0 ) / fine.s ) ), i1 = Math.min( fine.nx - 1, Math.ceil( ( Math.max( ...xs ) - fine.x0 ) / fine.s ) );
		const j0 = Math.max( 0, Math.floor( ( Math.min( ...zs ) - fine.z0 ) / fine.s ) ), j1 = Math.min( fine.nz - 1, Math.ceil( ( Math.max( ...zs ) - fine.z0 ) / fine.s ) );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
			const x = fine.xOf( i ) - cx, z = fine.zOf( j ) - cz;
			const u = x * ca + z * sa, v = - x * sa + z * ca;
			const bi = Math.floor( u / PU ), bj = Math.floor( v / PV );
			let dist = Infinity;
			for ( let b = - 1; b <= 1; b ++ ) for ( let q = - 1; q <= 1; q ++ ) {
				if ( ! inCity.has( key( bi + q, bj + b ) ) ) continue;
				const du = Math.max( ( bi + q ) * PU - u, 0, u - ( bi + q + 1 ) * PU );
				const dv = Math.max( ( bj + b ) * PV - v, 0, v - ( bj + b + 1 ) * PV );
				dist = Math.min( dist, Math.hypot( du, dv ) );
			}
			if ( dist > ext ) continue;
			const w = 1 - smoothstep( margin, ext, dist );
			const sh = surf( Math.min( Math.max( u, umin ), umax - 0.01 ), Math.min( Math.max( v, vmin ), vmax - 0.01 ) );
			if ( sh === null ) continue;
			const id = fine.idx( i, j );
			const cur = fine.h[ id ];
			if ( dist <= margin ) claim.set( i, j, city.index + 1 );
			// never raise the city out of the sea at the waterfront: the edge keeps the natural shore
			if ( cur < 0.5 && dist > margin ) continue;
			fine.h[ id ] = cur + ( sh - cur ) * w;
		}

		// streets: every edge of an accepted block, intersections at every corner
		const edges = new Map();
		for ( const b of blocks ) {
			const cs = [ [ b.i, b.j ], [ b.i + 1, b.j ], [ b.i + 1, b.j + 1 ], [ b.i, b.j + 1 ] ];
			for ( let e = 0; e < 4; e ++ ) {
				const p = cs[ e ], q = cs[ ( e + 1 ) % 4 ];
				const k = [ key( ...p ), key( ...q ) ].sort().join( '|' );
				edges.set( k, [ p, q ] );
			}
		}
		const streetW = c.kind === 'metro' && 0 ? K.street : K.street;
		for ( const [ p, q ] of edges.values() ) {
			const [ ax, az ] = toW( p[ 0 ] * PU, p[ 1 ] * PV ), [ bx, bz ] = toW( q[ 0 ] * PU, q[ 1 ] * PV );
			out.streets.push( { city: city.index, a: [ ax, az ], b: [ bx, bz ], w: streetW, walk: K.walk, ka: key( ...p ), kb: key( ...q ) } );
		}

		// lots and buildings
		const want = [ ...( WANT[ c.kind ] || [] ) ];
		if ( c.kind === 'metro' && c.size > 380 ) want.push( 'hospital', 'police', 'gunstore', 'grocery', 'hardware', 'sports', 'hotel', 'hotel' );
		const blocksByD = [ ...blocks ].sort( ( p, q ) => p.d - q.d );
		const coreR = ( c.core || 0 ) * R;
		const lots = [];
		for ( const b of blocksByD ) {
			const bu0 = b.i * PU + K.street / 2 + K.walk, bv0 = b.j * PV + K.street / 2 + K.walk;
			const bw = PU - K.street - 2 * K.walk, bd = PV - K.street - 2 * K.walk;
			const zone = pickZone( c, b.d, coreR, R, rnd );
			if ( c.kind === 'airport' && b === blocksByD[ 0 ] ) {
				// the runway runs through the first ring of blocks; the terminal side keeps buildings
				out.runways.push( { city: city.index, x: cx, z: cz, angle: a, len: Math.min( 520, R * 2.4 ), w: 34 } );
			}
			for ( const L of splitBlock( zone, bu0, bv0, bw, bd, rnd ) ) {
				const [ lx, lz ] = toW( L.u + L.w / 2, L.v + L.d / 2 );
				lots.push( { ...L, zone, x: lx, z: lz, angle: a + ( L.rot || 0 ), d2c: Math.hypot( lx - cx, lz - cz ), city: city.index } );
			}
		}
		// assign the wanted services to the commercial lots closest to the centre
		lots.sort( ( p, q ) => p.d2c - q.d2c );
		for ( const L of lots ) {
			if ( L.zone === 'core' || L.zone === 'commercial' || L.zone === 'military' || L.zone === 'airport' || L.zone === 'resort' || L.zone === 'observatory' ) {
				const fit = want.findIndex( t => fits( t, L ) );
				if ( fit >= 0 ) { L.type = want[ fit ]; want.splice( fit, 1 ); }
			}
			if ( ! L.type ) L.type = defaultType( L, rnd );
			L.floors = floorsFor( L.type, L, c, rnd );
			out.lots.push( L );
		}
	} );
	return out;
}

function pickZone( c, d, coreR, R, rnd ) {
	if ( c.kind === 'military' ) return 'military';
	if ( c.kind === 'airport' ) return 'airport';
	if ( c.kind === 'observatory' ) return 'observatory';
	if ( c.kind === 'resort' ) return d < R * 0.75 ? 'resort' : 'residential';
	if ( d < coreR ) return 'core';
	if ( c.industrial && rnd() < c.industrial * ( d / R ) ) return 'industrial';
	const comm = c.kind === 'metro' ? 0.55 : c.kind === 'town' ? 0.45 : 0.4;
	if ( d < R * comm || rnd() < 0.12 ) return 'commercial';
	return 'residential';
}

// lots are { u, v, w, d, rot } in the city's grid frame; w runs along u
function splitBlock( zone, u0, v0, W, D, rnd ) {
	const lots = [];
	if ( zone === 'core' ) {
		const nu = rnd() < 0.5 ? 1 : 2, nv = rnd() < 0.5 ? 1 : 2;
		for ( let a = 0; a < nu; a ++ ) for ( let b = 0; b < nv; b ++ ) lots.push( { u: u0 + a * W / nu, v: v0 + b * D / nv, w: W / nu, d: D / nv, big: true } );
		return lots;
	}
	if ( zone === 'resort' || zone === 'military' || zone === 'airport' || zone === 'industrial' || zone === 'observatory' ) {
		const nu = zone === 'observatory' ? 2 : 2, nv = zone === 'resort' ? 1 : 2;
		for ( let a = 0; a < nu; a ++ ) for ( let b = 0; b < nv; b ++ ) lots.push( { u: u0 + a * W / nu, v: v0 + b * D / nv, w: W / nu, d: D / nv, big: true } );
		return lots;
	}
	// commercial and residential: a row of lots facing each long street, backs meeting in the middle
	const depth = D / 2;
	const minW = zone === 'commercial' ? 14 : 16, maxW = zone === 'commercial' ? 28 : 24;
	for ( const side of [ 0, 1 ] ) {
		let u = u0;
		while ( u < u0 + W - minW * 0.8 ) {
			let w = minW + rnd() * ( maxW - minW );
			if ( u + w > u0 + W - minW * 0.8 ) w = u0 + W - u;
			lots.push( { u, v: v0 + side * depth, w, d: depth, face: side ? 1 : - 1 } );
			u += w;
		}
	}
	return lots;
}

const SIZE_NEEDS = {
	hospital: 40, grocery: 26, school: 30, police: 20, fire: 20, hotel: 30, warehouse: 26, terminal: 40, hangar: 36,
	mil_hq: 26, armory: 20, barracks: 30, gas: 18, church: 18, market: 24,
};
function fits( t, L ) { return Math.min( L.w, L.d ) >= ( SIZE_NEEDS[ t ] || 12 ) * ( L.big ? 1 : 0.6 ); }

function defaultType( L, rnd ) {
	switch ( L.zone ) {
		case 'core': return rnd() < 0.55 ? 'office' : rnd() < 0.6 ? 'apartment' : 'hotel';
		case 'resort': return rnd() < 0.6 ? 'hotel' : 'apartment';
		case 'industrial': return rnd() < 0.7 ? 'warehouse' : 'garage';
		case 'military': return [ 'barracks', 'barracks', 'warehouse', 'mil_tent', 'hangar', 'garage' ][ Math.floor( rnd() * 6 ) ];
		case 'airport': return rnd() < 0.5 ? 'hangar' : 'warehouse';
		case 'observatory': return 'observatory';
		case 'commercial': {
			const r = rnd();
			return r < 0.25 ? 'convenience' : r < 0.4 ? 'restaurant' : r < 0.5 ? 'clothing' : r < 0.58 ? 'bar' : r < 0.66 ? 'office' : r < 0.72 ? 'pawn' : r < 0.8 ? 'fastfood' : 'apartment';
		}
		default: return rnd() < 0.9 ? 'house' : 'apartment';
	}
}

function floorsFor( t, L, c, rnd ) {
	switch ( t ) {
		case 'office': return L.zone === 'core' ? ( c.kind === 'metro' ? 6 + Math.floor( rnd() * 18 ) : 3 + Math.floor( rnd() * 4 ) ) : 2 + Math.floor( rnd() * 2 );
		case 'apartment': return L.zone === 'core' ? 8 + Math.floor( rnd() * 16 ) : 2 + Math.floor( rnd() * 3 );
		case 'hotel': return c.kind === 'resort' || c.kind === 'metro' ? 5 + Math.floor( rnd() * 14 ) : 2 + Math.floor( rnd() * 2 );
		case 'hospital': return 3 + Math.floor( rnd() * 3 );
		case 'house': return rnd() < 0.3 ? 2 : 1;
		case 'police': case 'school': case 'mil_hq': case 'barracks': case 'fire': return 2;
		case 'tower': return 6;
		default: return 1;
	}
}

// claim map: which city owns each fine cell (prevents overlapping grids)
export class Claim {
	constructor( fine ) { this.g = fine; this.a = new Uint8Array( fine.nx * fine.nz ); }
	at( x, z ) {
		const i = Math.round( ( x - this.g.x0 ) / this.g.s ), j = Math.round( ( z - this.g.z0 ) / this.g.s );
		if ( i < 0 || j < 0 || i >= this.g.nx || j >= this.g.nz ) return 0;
		return this.a[ j * this.g.nx + i ];
	}
	set( i, j, v ) { this.a[ j * this.g.nx + i ] = v; }
}

// footprints inside lots, after highways have been routed (lots under a highway are dropped)
export function placeBuildings( lots, cities, fine, roadHit ) {
	const out = [];
	for ( const L of lots ) {
		const c = cities[ L.city ];
		const rnd = mulberry32( hashStr( c.id + ':' + out.length + ':' + Math.round( L.x ) ) );
		let setF, setS, setB;
		switch ( L.type ) {
			case 'house': setF = 4 + rnd() * 3; setS = 2 + rnd() * 1.5; setB = 3 + rnd() * 3; break;
			case 'gas': setF = 9; setS = 2; setB = 2; break;
			case 'mil_tent': setF = 6; setS = 6; setB = 6; break;
			case 'hangar': case 'terminal': case 'warehouse': setF = 4; setS = 3; setB = 3; break;
			default: setF = L.big ? 3 : 1; setS = L.big ? 3 : 0.6; setB = L.big ? 3 : 2 + rnd() * 3;
		}
		let w = L.w - setS * 2, d = L.d - setF - setB;
		if ( L.type === 'house' ) { w = Math.min( w, 9 + rnd() * 6 ); d = Math.min( d, 8 + rnd() * 5 ); }
		if ( L.type === 'mil_tent' ) { w = Math.min( w, 12 ); d = Math.min( d, 6 ); }
		if ( L.type === 'tower' ) { w = 8; d = 8; }
		if ( L.type === 'observatory' ) { w = Math.min( w, 22 ); d = Math.min( d, 22 ); }
		if ( w < 6 || d < 6 ) continue;
		// the front of the building faces the street: for the far row that is the +v side
		const front = L.face === 1 ? 1 : - 1;
		let cu = L.u + L.w / 2, cv;
		if ( L.face === 1 ) cv = L.v + L.d - setF - d / 2; else if ( L.face === - 1 ) cv = L.v + setF + d / 2; else cv = L.v + L.d / 2;
		const ca = Math.cos( c.angle ), sa = Math.sin( c.angle );
		const x = c.x + cu * ca - cv * sa, z = c.z + cu * sa + cv * ca;
		// the lot must stay clear of highways
		if ( roadHit( x, z, Math.hypot( w, d ) / 2 + 3 ) ) continue;
		// base height: the lowest ground under the footprint (the plinth fills the rest)
		let lo = Infinity, hi = - Infinity;
		for ( let b = - 1; b <= 1; b ++ ) for ( let a2 = - 1; a2 <= 1; a2 ++ ) {
			const px = x + ( a2 * w / 2 ) * ca - ( b * d / 2 ) * sa, pz = z + ( a2 * w / 2 ) * sa + ( b * d / 2 ) * ca;
			const h = fine.sample( px, pz );
			lo = Math.min( lo, h ); hi = Math.max( hi, h );
		}
		if ( lo < 0.6 ) continue;
		out.push( {
			x, z, w, d, angle: c.angle + ( front === 1 ? Math.PI : 0 ), base: hi, lo, type: BT[ L.type ], typeName: L.type, floors: L.floors,
			city: L.city, style: Math.floor( rnd() * 256 ),
		} );
	}
	return out;
}
