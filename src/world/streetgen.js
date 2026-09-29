// Street cells, built in the world workers: every road surface, sidewalk, curb, barrier, guardrail and
// fence inside one CELL x CELL square as merged typed arrays, plus the placements of the instanced street
// furniture, wrecked cars, ground decals and collider boxes (all deterministic from position hashes).
//
// msg: { ci, cj, lod }  lod 0 = full detail (props, curbs, colliders), 1 = far (surfaces only, coarse)
// Positions are relative to the cell origin (ci * CELL, 0, cj * CELL).
import {
	buildNetwork, CELL, RC, SK, roadPoint, hh, hashStr, mulberry32, segDist, highwayEdgeDist, armDir, MILE,
} from '../city/roads/network.js';
import {
	PROP, CAR, CAR_DIMS, CF, DECAL, SIGN_CELL, MISC, WIDE, MATS,
} from '../city/roads/kinds.js';

let NET = null;

// surface lifts above the ground: higher classes win where surfaces overlap
const LIFT = { 4: 0.075, 2: 0.066, 1: 0.058, street: 0.05, walk: 0.05, runway: 0.09, taxi: 0.085, conn: 0.08 };
const CURB = 0.15;
const STUB = [ 3.6, 3.2, 0, 0 ]; // crosswalk length at intersections by street kind
const CH = 24; // highway chunk length: chunks are assigned to cells by their midpoint

// ---- geometry accumulator ------------------------------------------------------------------------

class Geo {
	constructor( sizes ) {
		this.sizes = sizes; this.p = []; this.n = []; this.x = sizes.map( () => [] ); this.i = []; this.vc = 0;
	}
	// E: flat array of the extra attribute values for this vertex
	v( x, y, z, nx, ny, nz, E ) {
		this.p.push( x - OX, y, z - OZ );
		this.n.push( nx, ny, nz );
		let o = 0;
		for ( let a = 0; a < this.sizes.length; a ++ ) { const s = this.sizes[ a ], arr = this.x[ a ]; for ( let k = 0; k < s; k ++ ) arr.push( E[ o ++ ] ); }
		return this.vc ++;
	}
	t( a, b, c ) { this.i.push( a, b, c ); }
	q( a, b, c, d ) { this.i.push( a, b, c, b, d, c ); } // a b / c d grid quad (a->b = right, a->c = forward)
	finish( types, transfer ) {
		if ( ! this.vc ) return null;
		const pos = new Float32Array( this.p );
		const nor = new Int8Array( this.n.length );
		for ( let k = 0; k < this.n.length; k ++ ) nor[ k ] = Math.max( - 127, Math.min( 127, Math.round( this.n[ k ] * 127 ) ) );
		const ex = this.x.map( ( arr, a ) => types[ a ] === 'u8' ? Uint8Array.from( arr, v => Math.max( 0, Math.min( 255, Math.round( v * 255 ) ) ) ) : new Float32Array( arr ) );
		const idx = this.vc < 65536 ? new Uint16Array( this.i ) : new Uint32Array( this.i );
		transfer.push( pos.buffer, nor.buffer, idx.buffer, ...ex.map( e => e.buffer ) );
		return { pos, nor, ex, idx };
	}
}

let OX = 0, OZ = 0, hf = null, net = null;
const E = new Array( 16 ).fill( 0 );
const P = [ 0, 0, 0, 0, 0 ], P2 = [ 0, 0, 0, 0, 0 ];
const H = ( x, z ) => hf.heightAt( x, z );
const mine = ( x, z, ci, cj ) => Math.floor( x / CELL ) === ci && Math.floor( z / CELL ) === cj;

// a ribbon over rows (centre + right vector) and columns (across offsets); attr( row, col, E ) fills extras
function ribbon( G, rows, cols, lifts, attr ) {
	const R = rows.length, C = cols.length;
	if ( R < 2 ) return;
	const X = new Float64Array( R * C ), Y = new Float64Array( R * C ), Z = new Float64Array( R * C );
	for ( let r = 0; r < R; r ++ ) {
		const w = rows[ r ];
		for ( let c = 0; c < C; c ++ ) {
			const x = w.x + w.nx * cols[ c ], z = w.z + w.nz * cols[ c ];
			X[ r * C + c ] = x; Z[ r * C + c ] = z; Y[ r * C + c ] = H( x, z ) + lifts[ c ];
		}
	}
	const base = G.vc;
	for ( let r = 0; r < R; r ++ ) for ( let c = 0; c < C; c ++ ) {
		const ra = Math.max( 0, r - 1 ) * C + c, rb = Math.min( R - 1, r + 1 ) * C + c;
		const ca = r * C + Math.max( 0, c - 1 ), cb = r * C + Math.min( C - 1, c + 1 );
		// across x along -> up
		const ax = X[ cb ] - X[ ca ], ay = Y[ cb ] - Y[ ca ], az = Z[ cb ] - Z[ ca ];
		const bx = X[ rb ] - X[ ra ], by = Y[ rb ] - Y[ ra ], bz = Z[ rb ] - Z[ ra ];
		let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
		if ( ny < 0 ) { nx = - nx; ny = - ny; nz = - nz; }
		const l = Math.hypot( nx, ny, nz ) || 1;
		attr( rows[ r ], c, E );
		G.v( X[ r * C + c ], Y[ r * C + c ], Z[ r * C + c ], nx / l, ny / l, nz / l, E );
	}
	for ( let r = 0; r < R - 1; r ++ ) for ( let c = 0; c < C - 1; c ++ ) {
		const a = base + r * C + c;
		G.q( a, a + 1, a + C, a + C + 1 );
	}
}

// ---- entry ------------------------------------------------------------------------------------------

export function buildStreetCell( _hf, world, msg ) {
	hf = _hf;
	if ( ! NET ) NET = buildNetwork( world, hf );
	net = NET;
	const { ci, cj } = msg;
	const lod = msg.lod | 0;
	OX = ci * CELL; OZ = cj * CELL;
	const out = {
		road: new Geo( [ 4, 4 ] ), walk: new Geo( [ 4 ] ), kit: new Geo( [ 3, 3 ] ), fence: new Geo( [ 2 ] ),
		wires: [], props: [], signs: [], cars: [], decals: [], boxes: [],
	};
	const C = { ci, cj, lod, out };
	emitHighways( C );
	emitStreets( C );
	emitNodes( C );
	emitRunways( C );
	if ( ! lod ) { emitFences( C ); emitEvents( C ); }
	const transfer = [];
	const res = {
		ci, cj, lod, ox: OX, oz: OZ,
		road: out.road.finish( [ 'f', 'f' ], transfer ),
		walk: out.walk.finish( [ 'f' ], transfer ),
		kit: out.kit.finish( [ 'u8', 'u8' ], transfer ),
		fence: out.fence.finish( [ 'f' ], transfer ),
		wires: new Float32Array( out.wires ),
		props: new Float32Array( out.props ),
		signs: new Float32Array( out.signs ),
		cars: new Float32Array( out.cars ),
		decals: new Float32Array( out.decals ),
		boxes: new Float32Array( out.boxes ),
	};
	for ( const k of [ 'wires', 'props', 'signs', 'cars', 'decals', 'boxes' ] ) transfer.push( res[ k ].buffer );
	res.transfer = transfer;
	return res;
}

// ---- placement helpers --------------------------------------------------------------------------------

function prop( C, type, x, z, yaw, param = 0, sx = 1, tilt = 0, y = null ) {
	C.out.props.push( type, x - OX, y ?? H( x, z ), z - OZ, yaw, sx, tilt, param );
}
// sign board: cell (static atlas) or -1 - id (dynamic), centre position, facing yaw (front = local +z)
function sign( C, cell, x, y, z, yaw, w, h, dbl = 0, dyn = 0 ) {
	C.out.signs.push( dyn, cell, x - OX, y, z - OZ, yaw, w, h, dbl, 0 );
}
function decal( C, kind, x, z, yaw, sx, sz, alpha = 1, y = null ) {
	C.out.decals.push( kind, x - OX, y ?? H( x, z ) + 0.1, z - OZ, yaw, sx, sz, alpha );
}
function box( C, x, y, z, hx, hy, hz, yaw, mat ) {
	C.out.boxes.push( x - OX, y, z - OZ, hx, hy, hz, yaw, MATS.indexOf( mat ) );
}
// yaw that turns local +z towards (dx, dz)
const yawZ = ( dx, dz ) => Math.atan2( dx, dz );
// yaw that turns local +x towards (dx, dz)
const yawX = ( dx, dz ) => Math.atan2( - dz, dx );
// a car's yaw for travel direction (dx, dz): forward is local -z
const yawFwd = ( dx, dz ) => Math.atan2( - dx, - dz );

// a wrecked car resting on the ground: pitch / roll from the wheel contact heights
function car( C, type, x, z, yaw, rnd, o = {} ) {
	const d = CAR_DIMS[ type ];
	const s = Math.sin( yaw ), c = Math.cos( yaw );
	// local (lx, lz) -> world: right = (c, -s), back = (s, c)
	const at = ( lx, lz ) => H( x + c * lx + s * lz, z - s * lx + c * lz );
	let flags = o.flags ?? 0;
	const burn = o.burn ?? 0;
	if ( ! ( 'flags' in o ) ) {
		if ( rnd() < 0.35 ) flags |= CF.DOOR_FL;
		if ( rnd() < 0.15 ) flags |= CF.DOOR_FR;
		if ( rnd() < 0.12 && type !== CAR.PICKUP ) flags |= CF.DOOR_RL;
		if ( rnd() < 0.1 && type !== CAR.PICKUP ) flags |= CF.DOOR_RR;
		if ( rnd() < 0.12 ) flags |= CF.TRUNK;
		if ( rnd() < 0.08 ) flags |= CF.HOOD;
		const g = rnd();
		if ( g < 0.3 ) flags |= CF.GLASS_SOME; else if ( g < 0.42 ) flags |= CF.GLASS_ALL;
		for ( const f of [ CF.FLAT_FL, CF.FLAT_FR, CF.FLAT_RL, CF.FLAT_RR ] ) if ( rnd() < 0.18 ) flags |= f;
	}
	if ( burn > 0.5 ) flags = ( flags | CF.GLASS_ALL | CF.NO_TYRES ) & ~ CF.GLASS_SOME;
	const drop = ( f ) => ( flags & CF.NO_TYRES ) ? d.r * 0.55 : ( flags & f ) ? d.r * 0.3 : 0;
	const hFL = at( - d.tr, d.zf ) - drop( CF.FLAT_FL ), hFR = at( d.tr, d.zf ) - drop( CF.FLAT_FR );
	const hRL = at( - d.tr, d.zr ) - drop( CF.FLAT_RL ), hRR = at( d.tr, d.zr ) - drop( CF.FLAT_RR );
	let y = ( hFL + hFR + hRL + hRR ) / 4;
	let pitch = Math.atan2( ( hFL + hFR ) / 2 - ( hRL + hRR ) / 2, d.zr - d.zf );
	let roll = Math.atan2( ( hFR + hRR ) / 2 - ( hFL + hRL ) / 2, 2 * d.tr );
	if ( o.roll ) { roll += o.roll; if ( Math.abs( o.roll ) > 2 ) y += d.H - 0.05; else y += Math.abs( Math.sin( o.roll ) ) * d.W * 0.5; }
	if ( o.pitch ) pitch += o.pitch;
	if ( o.lift ) y += o.lift;
	if ( type !== CAR.MTRUCK && type !== CAR.HUMVEE && type !== CAR.BUS && burn < 0.5 && ! o.noLoot ) flags |= CF.LOOT;
	if ( type === CAR.HUMVEE || type === CAR.MTRUCK ) flags |= CF.LOOT;
	const color = o.color ?? Math.floor( rnd() * 16 );
	const rust = o.rust ?? rnd() * rnd() * 0.8;
	C.out.cars.push( type, x - OX, y, z - OZ, yaw, pitch, roll, color, rust, burn, flags, Math.floor( rnd() * 65536 ) );
	if ( burn > 0.5 ) decal( C, DECAL.SCORCH, x, z, yaw, d.W * 2.2, d.L * 1.5, 0.9 );
	if ( ( flags & CF.GLASS_ALL ) && rnd() < 0.6 ) decal( C, DECAL.GLASS, x + c * ( d.W * 0.7 ) * ( rnd() < 0.5 ? - 1 : 1 ), z, rnd() * 6.3, 1.6, 1.6, 0.8 );
}

// civilian body mix
function civType( rnd ) {
	const r = rnd();
	return r < 0.34 ? CAR.SEDAN : r < 0.52 ? CAR.HATCH : r < 0.7 ? CAR.SUV : r < 0.86 ? CAR.PICKUP : r < 0.97 ? CAR.VAN : CAR.POLICE;
}

function scatterDebris( C, x, z, r, rnd, n, blood = 0.5 ) {
	for ( let k = 0; k < n; k ++ ) {
		const a = rnd() * 6.283, d = Math.sqrt( rnd() ) * r;
		const px = x + Math.cos( a ) * d, pz = z + Math.sin( a ) * d;
		const t = rnd();
		if ( t < 0.28 ) prop( C, PROP.TRASH_BAG, px, pz, rnd() * 6.3, 0, 0.8 + rnd() * 0.5 );
		else if ( t < 0.5 ) prop( C, PROP.SUITCASE, px, pz, rnd() * 6.3, Math.floor( rnd() * 6 ), 1, rnd() < 0.5 ? 1.5708 : 0 );
		else if ( t < 0.62 ) prop( C, PROP.CARDBOARD, px, pz, rnd() * 6.3, 0, 0.7 + rnd() * 0.6 );
		else if ( t < 0.7 ) prop( C, PROP.TIRE, px, pz, rnd() * 6.3, 0, 1, 1.5708 );
		else if ( t < 0.8 ) decal( C, DECAL.PAPERS, px, pz, rnd() * 6.3, 2 + rnd() * 2, 2 + rnd() * 2, 0.9 );
		else if ( t < 0.8 + blood * 0.2 ) decal( C, rnd() < 0.5 ? DECAL.BLOOD_SPLAT : DECAL.BLOOD_POOL, px, pz, rnd() * 6.3, 1 + rnd() * 1.6, 1 + rnd() * 1.6, 0.85 );
		else decal( C, DECAL.STAIN, px, pz, rnd() * 6.3, 1.5 + rnd() * 2, 1.5 + rnd() * 2, 0.6 );
	}
}

// ---- highways -------------------------------------------------------------------------------------------

const COLS = {
	4: [ - 8.5, - 6.2, - 4.1, - 2.2, - 0.6, 0, 0.6, 2.2, 4.1, 6.2, 8.5 ],
	2: [ - 4.25, - 2.1, 0, 2.1, 4.25 ],
	1: [ - 2.75, - 1.4, 0, 1.4, 2.75 ],
};
const COLS_FAR = { 4: [ - 8.5, - 4.2, 0, 4.2, 8.5 ], 2: [ - 4.25, 0, 4.25 ], 1: [ - 2.75, 0, 2.75 ] };

function rowAt( r, s ) {
	roadPoint( r, s, P );
	return { x: P[ 0 ], z: P[ 1 ], tx: P[ 2 ], tz: P[ 3 ], nx: - P[ 3 ], nz: P[ 2 ], s };
}

function roadBox( r ) {
	if ( r.bb ) return r.bb;
	let a = Infinity, b = Infinity, c = - Infinity, d = - Infinity;
	for ( let k = 0; k < r.n; k ++ ) { a = Math.min( a, r.x[ k ] ); b = Math.min( b, r.z[ k ] ); c = Math.max( c, r.x[ k ] ); d = Math.max( d, r.z[ k ] ); }
	return ( r.bb = [ a - 40, b - 40, c + 40, d + 40 ] );
}

function emitHighways( C ) {
	const { ci, cj, lod } = C;
	const x0 = ci * CELL, z0 = cj * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
	for ( const r of net.roads ) {
		if ( ! r.runs.length ) continue;
		const bb = roadBox( r );
		if ( bb[ 2 ] < x0 || bb[ 0 ] > x1 || bb[ 3 ] < z0 || bb[ 1 ] > z1 ) continue;
		const rh = hashStr( r.name );
		for ( const q of r.runs ) {
			const j0 = Math.floor( q.s0 / CH ), j1 = Math.floor( ( q.s1 - 1e-6 ) / CH );
			let rows = null;
			const chunks = [];
			for ( let j = j0; j <= j1; j ++ ) {
				const a = Math.max( q.s0, j * CH ), b = Math.min( q.s1, ( j + 1 ) * CH );
				if ( b - a < 1e-3 ) continue;
				roadPoint( r, ( a + b ) / 2, P );
				if ( ! mine( P[ 0 ], P[ 1 ], ci, cj ) ) { if ( rows ) { highwayStrip( C, r, rh, q, rows ); rows = null; } continue; }
				chunks.push( [ a, b ] );
				if ( ! rows ) rows = [ rowAt( r, a ) ];
				const step = lod ? ( r.lanes === 1 ? 8 : 12 ) : 3;
				const n = Math.max( 1, Math.round( ( b - a ) / step ) );
				for ( let k = 1; k <= n; k ++ ) rows.push( rowAt( r, a + ( b - a ) * k / n ) );
			}
			if ( rows ) highwayStrip( C, r, rh, q, rows );
			if ( ! lod && chunks.length ) highwayProps( C, r, rh, q, chunks );
		}
	}
}

// distance (m) along the run to the nearest end where it joins a city street or another highway (99: none)
function joinDist( q, s ) { return Math.min( q.t0 ? s - q.s0 : 99, q.t1 ? q.s1 - s : 99, 99 ); }

function highwayStrip( C, r, rh, q, rows ) {
	const { lod, out } = C;
	const hw = r.hw;
	const base = lod ? COLS_FAR[ r.lanes ] : COLS[ r.lanes ];
	// soft shoulders: a column just past the edge, tucked under the ground
	const cols = [ - hw - 0.7, ...base, hw + 0.7 ];
	const L = LIFT[ r.lanes ];
	const lifts = cols.map( ( u, i ) => ( i === 0 || i === cols.length - 1 ) ? - 0.1 : L );
	const cls = r.lanes === 4 ? RC.FREEWAY : r.lanes === 2 ? RC.HIGHWAY : RC.DIRT;
	ribbon( out.road, rows, cols, lifts, ( row, c, e ) => {
		e[ 0 ] = cols[ c ]; e[ 1 ] = row.s; e[ 2 ] = cls; e[ 3 ] = r.w;
		e[ 4 ] = rh % 997; e[ 5 ] = r.lanes; e[ 6 ] = r.lanes === 1 ? redSoil( row ) : 0; e[ 7 ] = joinDist( q, row.s );
	} );
	// the median barrier on freeways, ending short of the junctions so it never sticks into a street or the
	// other highway's lanes
	if ( r.lanes === 4 ) {
		const mid = rows.filter( w => joinDist( q, w.s ) > 14 );
		if ( mid.length > 1 ) jersey( C, mid, 0, ! lod );
	}
	if ( ! lod && r.lanes >= 2 ) guardrails( C, r, q, rows );
}

// red dirt (Lānaʻi, Kauaʻi, upcountry Maui) tints the rural tracks
const S4 = [ 0, 0, 0, 0 ];
function redSoil( row ) {
	if ( row.red === undefined ) row.red = Math.min( 1, hf.surfaceAt( row.x, row.z, S4 )[ 2 ] * 1.4 );
	return row.red;
}

// Jersey barrier profile extruded along rows at across offset u
const JP = [ [ - 0.3, 0 ], [ - 0.3, 0.08 ], [ - 0.17, 0.33 ], [ - 0.09, 0.81 ], [ 0.09, 0.81 ], [ 0.17, 0.33 ], [ 0.3, 0.08 ], [ 0.3, 0 ] ];
function jersey( C, rows, u, colliders ) {
	const G = C.out.kit;
	const R = rows.length;
	const ys = rows.map( w => H( w.x + w.nx * u, w.z + w.nz * u ) + 0.02 );
	for ( let f = 0; f < JP.length - 1; f ++ ) {
		const [ a0, b0 ] = JP[ f ], [ a1, b1 ] = JP[ f + 1 ];
		// face normal in the (across, up) plane
		let fn = b1 - b0, fu = - ( a1 - a0 );
		const fl = Math.hypot( fn, fu ); fn /= fl; fu /= fl;
		// outward: faces on the -u side point -u
		const sgn = ( a0 + a1 ) < 0 || ( a0 === a1 && a0 < 0 ) ? - 1 : ( a0 + a1 ) > 0 || ( a0 === a1 && a0 > 0 ) ? 1 : 0;
		if ( sgn === 0 ) { fn = 0; fu = 1; } else fn = Math.abs( fn ) * sgn;
		const base = G.vc;
		for ( let k = 0; k < R; k ++ ) {
			const w = rows[ k ];
			const nx = w.nx * fn, nz = w.nz * fn;
			E[ 0 ] = 0.64; E[ 1 ] = 0.62; E[ 2 ] = 0.58; E[ 3 ] = 0.9; E[ 4 ] = 0; E[ 5 ] = 1;
			G.v( w.x + w.nx * ( u + a0 ), ys[ k ] + b0, w.z + w.nz * ( u + a0 ), nx, fu, nz, E );
			G.v( w.x + w.nx * ( u + a1 ), ys[ k ] + b1, w.z + w.nz * ( u + a1 ), nx, fu, nz, E );
		}
		for ( let k = 0; k < R - 1; k ++ ) {
			const a = base + k * 2;
			// winding: from profile point 0 -> 1 is "right"; rows forward
			if ( sgn >= 0 ) G.q( a, a + 1, a + 2, a + 3 ); else G.q( a + 1, a, a + 3, a + 2 );
		}
	}
	if ( colliders ) {
		for ( let k = 0; k < R - 1; k ++ ) {
			const a = rows[ k ], b = rows[ k + 1 ];
			const x = ( a.x + b.x ) / 2 + a.nx * u, z = ( a.z + b.z ) / 2 + a.nz * u;
			const L = Math.hypot( b.x - a.x, b.z - a.z );
			box( C, x, ( ys[ k ] + ys[ k + 1 ] ) / 2 + 0.41, z, 0.3, 0.41, L / 2 + 0.05, yawZ( b.x - a.x, b.z - a.z ), 'concrete' );
		}
	}
}

// W-beam guardrails where the road bends hard or runs along a drop
function guardrails( C, r, q, rows ) {
	const R = rows.length;
	for ( const side of [ - 1, 1 ] ) {
		const need = new Uint8Array( R );
		for ( let k = 0; k < R; k ++ ) {
			const w = rows[ k ];
			const u = side * ( r.hw + 0.9 );
			const ex = w.x + w.nx * u, ez = w.z + w.nz * u;
			const h0 = H( w.x + w.nx * side * r.hw, w.z + w.nz * side * r.hw );
			const d1 = h0 - H( ex + w.nx * side * 3, ez + w.nz * side * 3 ), d2 = h0 - H( ex + w.nx * side * 7, ez + w.nz * side * 7 );
			if ( d1 > 1.1 || d2 > 2.4 ) need[ k ] = 1;
			// outside of tight bends
			roadPoint( r, w.s + 12, P ); roadPoint( r, w.s - 12, P2 );
			const turn = ( P2[ 2 ] * P[ 3 ] - P2[ 3 ] * P[ 2 ] ); // + = turning right
			if ( Math.abs( turn ) > 0.22 && Math.sign( turn ) === - side ) need[ k ] = 1;
			// never across another road or into a street
			if ( highwayEdgeDist( net, ex, ez, 20 )[ 1 ] !== r && highwayEdgeDist( net, ex, ez, 20 )[ 0 ] < 1.5 ) need[ k ] = 0;
			if ( joinDist( q, w.s ) < 16 ) need[ k ] = 0;
		}
		// dilate, drop singles
		const m = new Uint8Array( R );
		for ( let k = 0; k < R; k ++ ) if ( need[ k ] ) for ( let d = - 2; d <= 2; d ++ ) if ( k + d >= 0 && k + d < R ) m[ k + d ] = 1;
		for ( let k = 0; k < R; k ++ ) if ( joinDist( q, rows[ k ].s ) < 12 ) m[ k ] = 0;
		let k = 0;
		while ( k < R ) {
			if ( ! m[ k ] ) { k ++; continue; }
			let e = k;
			while ( e + 1 < R && m[ e + 1 ] ) e ++;
			if ( e - k >= 2 ) railRun( C, rows.slice( k, e + 1 ), side * ( r.hw + 0.9 ), side );
			k = e + 1;
		}
	}
}

// profile of the W-beam (across offset towards the road, height)
const WB = [ [ 0, 0.5 ], [ 0.07, 0.56 ], [ 0.0, 0.63 ], [ 0.07, 0.7 ], [ 0.0, 0.76 ] ];
function railRun( C, rows, u, side ) {
	const G = C.out.kit;
	const R = rows.length;
	const pts = rows.map( w => { const x = w.x + w.nx * u, z = w.z + w.nz * u; return { x, z, y: H( x, z ), nx: w.nx, nz: w.nz }; } );
	// beam: both faces
	for ( const face of [ 1, - 1 ] ) {
		for ( let f = 0; f < WB.length - 1; f ++ ) {
			const [ a0, b0 ] = WB[ f ], [ a1, b1 ] = WB[ f + 1 ];
			const base = G.vc;
			for ( let k = 0; k < R; k ++ ) {
				const p = pts[ k ];
				// towards the road is -side along the row normal
				const t = - side;
				const dn = ( a1 - a0 ), dy = ( b1 - b0 );
				let nn = dy * face, ny = - dn * face;
				const l = Math.hypot( nn, ny ) || 1; nn /= l; ny /= l;
				E[ 0 ] = 0.62; E[ 1 ] = 0.62; E[ 2 ] = 0.6; E[ 3 ] = 0.5; E[ 4 ] = 0.6; E[ 5 ] = 0;
				const off = face === 1 ? 0 : - 0.004;
				G.v( p.x + p.nx * t * ( a0 + off ), p.y + b0, p.z + p.nz * t * ( a0 + off ), p.nx * t * nn, ny, p.nz * t * nn, E );
				G.v( p.x + p.nx * t * ( a1 + off ), p.y + b1, p.z + p.nz * t * ( a1 + off ), p.nx * t * nn, ny, p.nz * t * nn, E );
			}
			for ( let k = 0; k < R - 1; k ++ ) {
				const a = base + k * 2;
				if ( ( face === 1 ) === ( side > 0 ) ) G.q( a, a + 1, a + 2, a + 3 ); else G.q( a + 1, a, a + 3, a + 2 );
			}
		}
	}
	// posts every other row
	for ( let k = 0; k < R; k += 2 ) {
		const p = pts[ k ];
		const t = rows[ Math.min( R - 1, k + 1 ) ], s = rows[ Math.max( 0, k - 1 ) ];
		const yaw = yawZ( t.x - s.x, t.z - s.z );
		kitBox( C.out.kit, p.x - p.nx * side * 0.08, p.y + 0.35, p.z - p.nz * side * 0.08, 0.05, 0.4, 0.05, yaw, [ 0.5, 0.48, 0.44 ], [ 0.6, 0.5, 0 ] );
	}
	for ( let k = 0; k < R - 1; k ++ ) {
		const a = pts[ k ], b = pts[ k + 1 ];
		const L = Math.hypot( b.x - a.x, b.z - a.z );
		box( C, ( a.x + b.x ) / 2, ( a.y + b.y ) / 2 + 0.4, ( a.z + b.z ) / 2, 0.1, 0.4, L / 2 + 0.05, yawZ( b.x - a.x, b.z - a.z ), 'metal' );
	}
}

// an oriented box into the kit mesh (flat shaded)
function kitBox( G, x, y, z, hx, hy, hz, yaw, col, pbr ) {
	const c = Math.cos( yaw ), s = Math.sin( yaw );
	const X = [ c, 0, - s ], Z = [ s, 0, c ];
	const faces = [
		[ X, [ 0, 1, 0 ], Z, hx, hy, hz ], [ [ - X[ 0 ], 0, - X[ 2 ] ], [ 0, 1, 0 ], [ - Z[ 0 ], 0, - Z[ 2 ] ], hx, hy, hz ],
		[ Z, [ 0, 1, 0 ], [ - X[ 0 ], 0, - X[ 2 ] ], hz, hy, hx ], [ [ - Z[ 0 ], 0, - Z[ 2 ] ], [ 0, 1, 0 ], X, hz, hy, hx ],
		[ [ 0, 1, 0 ], Z, X, hy, hz, hx ],
	];
	E[ 0 ] = col[ 0 ]; E[ 1 ] = col[ 1 ]; E[ 2 ] = col[ 2 ]; E[ 3 ] = pbr[ 0 ]; E[ 4 ] = pbr[ 1 ]; E[ 5 ] = pbr[ 2 ];
	for ( const [ n, u, v, dn, du, dv ] of faces ) {
		const cx = x + n[ 0 ] * dn, cy = y + n[ 1 ] * dn, cz = z + n[ 2 ] * dn;
		const b = G.vc;
		for ( const [ a, bb ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) {
			G.v( cx + u[ 0 ] * du * a + v[ 0 ] * dv * bb, cy + u[ 1 ] * du * a + v[ 1 ] * dv * bb, cz + u[ 2 ] * du * a + v[ 2 ] * dv * bb, n[ 0 ], n[ 1 ], n[ 2 ], E );
		}
		// n = u x v orientation check: choose winding so the face points along n
		const cr = [ u[ 1 ] * v[ 2 ] - u[ 2 ] * v[ 1 ], u[ 2 ] * v[ 0 ] - u[ 0 ] * v[ 2 ], u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ] ];
		if ( cr[ 0 ] * n[ 0 ] + cr[ 1 ] * n[ 1 ] + cr[ 2 ] * n[ 2 ] > 0 ) G.i.push( b, b + 1, b + 3, b, b + 3, b + 2 );
		else G.i.push( b, b + 3, b + 1, b, b + 2, b + 3 );
	}
}

function highwayProps( C, r, rh, q, chunks ) {
	const rnd = mulberry32( hashStr( r.name + ':' + Math.floor( chunks[ 0 ][ 0 ] ) ) );
	const inChunks = ( s ) => chunks.some( ( [ a, b ] ) => s >= a && s < b );
	const hw = r.hw;
	// utility poles with sagging lines along the two-lane highways (very Hawaiian)
	if ( r.lanes === 2 || ( r.lanes === 1 && hh( rh, 5 ) < 0.35 ) ) {
		const SP = 44;
		const side = hh( rh, 3, Math.floor( q.s0 ) ) < 0.5 ? 1 : - 1;
		const u = side * ( hw + 3.4 );
		for ( let k = Math.ceil( ( q.s0 + 20 ) / SP ); k * SP < q.s1 - 20; k ++ ) {
			const s = k * SP;
			if ( ! inChunks( s ) ) continue;
			const a = polePos( r, s, u ), b = ( k + 1 ) * SP < q.s1 - 20 ? polePos( r, ( k + 1 ) * SP, u ) : null;
			if ( ! a ) continue;
			const tr = hh( rh, k, 17 ) < 0.12;
			prop( C, tr ? PROP.POLE_T : PROP.POLE, a.x, a.z, a.yaw, 0, 1, ( hh( rh, k, 19 ) - 0.5 ) * 0.05 );
			if ( b ) spanWires( C, a, b );
		}
	}
	// freeway lighting on the median near the cities
	if ( r.lanes === 4 ) {
		for ( let k = Math.ceil( q.s0 / 50 ); k * 50 < q.s1; k ++ ) {
			const s = k * 50;
			if ( ! inChunks( s ) ) continue;
			const nearCity = ( q.t0 === 1 && s - q.s0 < 700 ) || ( q.t1 === 1 && q.s1 - s < 700 );
			if ( ! nearCity ) continue;
			const w = rowAt( r, s );
			const flick = hh( rh, k, 23 ) < 0.07 ? 1 : 0;
			prop( C, PROP.STREETLIGHT2, w.x, w.z, yawX( w.nx, w.nz ), flick, 1, 0, H( w.x, w.z ) + 0.8 );
		}
	}
	// mile markers
	for ( const m of net.markers ) {
		if ( m.road !== r || ! inChunks( m.s ) ) continue;
		const w = rowAt( r, m.s );
		const x = w.x + w.nx * ( hw + 1.1 ), z = w.z + w.nz * ( hw + 1.1 );
		const yaw = yawZ( - w.tx, - w.tz );
		prop( C, PROP.MILE_POST, x, z, yaw );
		sign( C, SIGN_CELL.mile( m.n ), x, H( x, z ) + 1.05, z, yaw, 0.32, 0.32, 0 );
	}
	// speed limits on the right shoulder
	for ( const g of net.regs ) {
		if ( g.road !== r || ! inChunks( g.s ) ) continue;
		const w = rowAt( r, g.s );
		const off = g.side * ( hw + 1.9 );
		const x = w.x + w.nx * off, z = w.z + w.nz * off;
		const yaw = yawZ( - w.tx * g.side, - w.tz * g.side );
		const y = H( x, z );
		prop( C, PROP.SIGN_POST, x, z, yaw );
		sign( C, SIGN_CELL.misc( g.misc ), x, y + 2.05, z, yaw, 0.75, 0.75, 0 );
	}
	// guide signs and welcome signs
	for ( const g of net.signs ) {
		if ( g.road !== r || ! inChunks( g.s ) ) continue;
		const w = rowAt( r, g.s );
		const side = g.side;
		const off = side * ( hw + 2.8 );
		const x = w.x + w.nx * off, z = w.z + w.nz * off;
		const yaw = yawZ( - w.tx * side, - w.tz * side );
		const y = H( x, z );
		if ( g.kind === 'guide' ) {
			prop( C, PROP.GUIDE_POSTS, x, z, yaw );
			sign( C, g.id, x, y + 3.0, z, yaw, 4.6, 2.3, 0, 1 );
		} else {
			prop( C, PROP.GUIDE_POSTS, x, z, yaw, 1, 0.62 );
			sign( C, g.id, x, y + 2.2, z, yaw, 3.0, 1.5, 0, 1 );
		}
	}
	// scattered wrecks, more close to the towns
	const dens = r.lanes === 4 ? 0.02 : r.lanes === 2 ? 0.011 : 0.004;
	for ( const [ a, b ] of chunks ) {
		for ( let s = Math.ceil( a / 6 ) * 6; s < b; s += 6 ) {
			const h = hh( rh, Math.round( s / 6 ), 31 );
			const near = ( q.t0 === 1 && s - q.s0 < 900 ) || ( q.t1 === 1 && q.s1 - s < 900 );
			if ( h > dens * ( near ? 2.2 : 1 ) ) continue;
			if ( s < q.s0 + 10 || s > q.s1 - 10 ) continue;
			const w = rowAt( r, s );
			const rr = mulberry32( hashStr( r.name + ':w:' + Math.round( s ) ) );
			const dir = rr() < 0.5 ? 1 : - 1;
			const where = rr();
			let u, yawOff = ( rr() - 0.5 ) * 0.35, o = {};
			const lw = r.lanes === 4 ? 3.5 : 3.6;
			if ( r.lanes === 1 ) { u = ( rr() - 0.5 ) * 1.5; }
			else if ( where < 0.45 ) { // on the shoulder, half off the road
				u = dir * ( hw - 0.4 + rr() * 1.6 );
				yawOff = ( rr() - 0.5 ) * 0.5;
			} else if ( where < 0.85 ) {
				u = dir * ( r.lanes === 4 ? 0.9 + lw * ( rr() < 0.5 ? 0.5 : 1.5 ) : lw * 0.5 );
			} else { // spun out across the lanes
				u = dir * rr() * hw * 0.6; yawOff = ( rr() - 0.5 ) * 2.6;
			}
			const x = w.x + w.nx * u, z = w.z + w.nz * u;
			if ( rr() < 0.05 && r.lanes >= 2 ) o.roll = rr() < 0.5 ? Math.PI : 1.5708 * ( rr() < 0.5 ? 1 : - 1 );
			if ( rr() < 0.14 ) o.burn = 0.6 + rr() * 0.4;
			car( C, civType( rr ), x, z, yawFwd( w.tx * dir, w.tz * dir ) + yawOff, rr, o );
			if ( rr() < 0.4 ) scatterDebris( C, x, z, 5, rr, 1 + Math.floor( rr() * 3 ), 0.6 );
			if ( rr() < 0.3 ) decal( C, DECAL.SKID, x - w.tx * dir * 9, z - w.tz * dir * 9, yawZ( w.tx, w.tz ) + ( rr() - 0.5 ) * 0.2, 2.2, 14, 0.8 );
		}
	}
}

function polePos( r, s, u ) {
	const w = rowAt( r, s );
	const x = w.x + w.nx * u, z = w.z + w.nz * u;
	// keep the poles off other roads and out of the city streets
	const [ d ] = highwayEdgeDist( net, x, z, 20 );
	if ( d < 1.2 ) return null;
	let bad = false;
	net.shash.query( x, z, 20, ( st ) => { if ( segDist( st, x, z ) < st.w / 2 + st.walk + 1 ) { bad = true; return false; } } );
	if ( bad ) return null;
	return { x, z, y: H( x, z ), yaw: yawX( w.nx, w.nz ), nx: w.nx, nz: w.nz };
}

// sagging conductors between two poles (crossarm local x = the pole's across vector)
const WIRE_PTS = [ [ - 1.05, 9.72 ], [ 0.0, 10.12 ], [ 1.05, 9.72 ], [ 0.3, 7.4 ] ];
function spanWires( C, a, b ) {
	const W = C.out.wires;
	const L = Math.hypot( b.x - a.x, b.z - a.z );
	if ( L > 70 ) return;
	const N = 10;
	for ( const [ lx, ly ] of WIRE_PTS ) {
		const ax = a.x + a.nx * lx, az = a.z + a.nz * lx, ay = a.y + ly;
		const bx = b.x + b.nx * lx, bz = b.z + b.nz * lx, by = b.y + ly;
		const sag = 0.00045 * L * L + 0.25;
		let px = ax, py = ay, pz = az;
		for ( let k = 1; k <= N; k ++ ) {
			const t = k / N;
			const x = ax + ( bx - ax ) * t, z = az + ( bz - az ) * t, y = ay + ( by - ay ) * t - sag * 4 * t * ( 1 - t );
			W.push( px - OX, py, pz - OZ, x - OX, y, z - OZ );
			px = x; py = y; pz = z;
		}
	}
}

// ---- city streets -----------------------------------------------------------------------------------------

function streetRows( st, a0, a1, step ) {
	const n = Math.max( 1, Math.round( ( a1 - a0 ) / step ) );
	const rows = [];
	// right of the street direction
	const nx = - st.dz, nz = st.dx;
	for ( let k = 0; k <= n; k ++ ) {
		const a = a0 + ( a1 - a0 ) * k / n;
		rows.push( { x: st.ax + st.dx * a, z: st.az + st.dz * a, nx, nz, tx: st.dx, tz: st.dz, s: a } );
	}
	return rows;
}

function onHighway( x, z, pad = 0.25 ) {
	return highwayEdgeDist( net, x, z, 20 )[ 0 ] < pad;
}

function emitStreets( C ) {
	const { ci, cj, lod, out } = C;
	for ( const st of net.streets ) {
		const mx = ( st.ax + st.bx ) / 2, mz = ( st.az + st.bz ) / 2;
		if ( ! mine( mx, mz, ci, cj ) ) continue;
		const S = STUB[ st.kind ];
		const a0 = st.w / 2 + S, a1 = st.len - st.w / 2 - S;
		if ( a1 - a0 < 1 ) continue;
		const rows = streetRows( st, a0, a1, lod ? 16 : 4 );
		const hw = st.w / 2;
		const cols = lod ? [ - hw, 0, hw ] : [ - hw, - hw / 2, 0, hw / 2, hw ];
		const flags = ( st.a.deg >= 3 ? 1 : 0 ) | ( st.b.deg >= 3 ? 2 : 0 );
		const seed = hh( st.id, 7 ) * 997;
		ribbon( out.road, rows, cols, cols.map( () => LIFT.street ), ( row, c, e ) => {
			e[ 0 ] = cols[ c ]; e[ 1 ] = row.s; e[ 2 ] = RC.STREET; e[ 3 ] = st.w;
			e[ 4 ] = st.len; e[ 5 ] = seed; e[ 6 ] = st.kind; e[ 7 ] = flags;
		} );
		if ( st.walk > 0 ) {
			if ( lod ) {
				// far: flat sidewalk strips in the road mesh
				for ( const side of [ - 1, 1 ] ) {
					const rs = streetRows( st, hw, st.len - hw, 20 );
					const c2 = side > 0 ? [ hw, hw + st.walk ] : [ - hw - st.walk, - hw ];
					ribbon( out.road, rs, c2, [ LIFT.walk + CURB, LIFT.walk + CURB ], ( row, c, e ) => {
						e[ 0 ] = Math.abs( c2[ c ] ) - hw; e[ 1 ] = row.s; e[ 2 ] = RC.WALK; e[ 3 ] = st.walk; e[ 4 ] = 0; e[ 5 ] = seed; e[ 6 ] = 0; e[ 7 ] = 0;
					} );
				}
			} else {
				for ( const side of [ - 1, 1 ] ) walkStrip( C, st, side, st.w / 2 + st.walk, st.len - st.w / 2 - st.walk );
			}
		}
		if ( ! lod ) streetProps( C, st );
	}
}

// sidewalk strip along a street side: curb face, top, outer face; broken where a highway crosses
function walkStrip( C, st, side, a0, a1 ) {
	if ( a1 - a0 < 0.5 ) return;
	const G = C.out.walk;
	const hw = st.w / 2, wk = st.walk;
	const nx = - st.dz * side, nz = st.dx * side; // outward from the street centre
	const n = Math.max( 1, Math.round( ( a1 - a0 ) / 3 ) );
	const samples = [];
	for ( let k = 0; k <= n; k ++ ) {
		const a = a0 + ( a1 - a0 ) * k / n;
		const bx = st.ax + st.dx * a, bz = st.az + st.dz * a;
		const ok = ! onHighway( bx + nx * ( hw + wk * 0.5 ), bz + nz * ( hw + wk * 0.5 ), 0.6 ) && ! onHighway( bx + nx * hw, bz + nz * hw, 0.2 ) && ! onHighway( bx + nx * ( hw + wk ), bz + nz * ( hw + wk ), 0.2 );
		samples.push( { a, bx, bz, ok } );
	}
	let k = 0;
	while ( k < samples.length ) {
		if ( ! samples[ k ].ok ) { k ++; continue; }
		let e = k;
		while ( e + 1 < samples.length && samples[ e + 1 ].ok ) e ++;
		if ( e > k ) walkPiece( C, G, samples.slice( k, e + 1 ), st, side, nx, nz, k > 0, e < samples.length - 1 );
		k = e + 1;
	}
}

function walkPiece( C, G, sm, st, side, nx, nz, capStart, capEnd ) {
	const hw = st.w / 2, wk = st.walk;
	const R = sm.length;
	const seed = net.cities[ st.city ].angle; // the paving pattern follows the city grid
	// along coordinate increases along st.d; for side -1 the "right" order flips
	const rowV = [];
	for ( const s of sm ) {
		const ix = s.bx + nx * hw, iz = s.bz + nz * hw, ox = s.bx + nx * ( hw + wk ), oz = s.bz + nz * ( hw + wk );
		const hi = H( ix, iz ) + LIFT.walk, ho = H( ox, oz ) + LIFT.walk;
		const cx = s.bx + nx * ( hw + 0.18 ), cz = s.bz + nz * ( hw + 0.18 );
		const hc = H( cx, cz ) + LIFT.walk;
		rowV.push( { ix, iz, ox, oz, cx, cz, hi, ho, hc, a: s.a } );
	}
	// faces: 0 top (curb stone + slab), 1 curb face, 2 outer face
	const put = ( list ) => {
		const base = G.vc;
		for ( const r of rowV ) for ( const p of list( r ) ) { E[ 0 ] = p[ 6 ]; E[ 1 ] = r.a; E[ 2 ] = p[ 7 ]; E[ 3 ] = seed; G.v( p[ 0 ], p[ 1 ], p[ 2 ], p[ 3 ], p[ 4 ], p[ 5 ], E ); }
		return base;
	};
	const flip = side < 0;
	const quadRows = ( base, cols ) => {
		for ( let r = 0; r < R - 1; r ++ ) for ( let c = 0; c < cols - 1; c ++ ) {
			const a = base + r * cols + c;
			if ( ! flip ) G.q( a, a + 1, a + cols, a + cols + 1 ); else G.q( a + 1, a, a + cols + 1, a + cols );
		}
	};
	// top: inner edge -> curb stone edge -> outer edge (outward is "right" for side +1)
	let b = put( ( r ) => [ [ r.ix, r.hi + CURB, r.iz, 0, 1, 0, 0, 0 ], [ r.cx, r.hc + CURB, r.cz, 0, 1, 0, 0.18, 0 ], [ r.ox, r.ho + CURB, r.oz, 0, 1, 0, wk, 0 ] ] );
	quadRows( b, 3 );
	// curb face toward the street (normal -outward): bottom -> top is the "right" direction for side +1 viewed from the street
	b = put( ( r ) => [ [ r.ix, r.hi - 0.06, r.iz, - nx, 0, - nz, - 0.2, 1 ], [ r.ix, r.hi + CURB, r.iz, - nx, 0, - nz, 0, 1 ] ] );
	for ( let r = 0; r < R - 1; r ++ ) { const a = b + r * 2; if ( ! flip ) G.q( a, a + 1, a + 2, a + 3 ); else G.q( a + 1, a, a + 3, a + 2 ); }
	// outer face
	b = put( ( r ) => [ [ r.ox, r.ho + CURB, r.oz, nx, 0, nz, wk, 2 ], [ r.ox, r.ho - 0.35, r.oz, nx, 0, nz, wk + 0.5, 2 ] ] );
	for ( let r = 0; r < R - 1; r ++ ) { const a = b + r * 2; if ( ! flip ) G.q( a, a + 1, a + 2, a + 3 ); else G.q( a + 1, a, a + 3, a + 2 ); }
	// end caps where a highway cut the strip
	const cap = ( r, dir ) => {
		const tx = st.dx * dir, tz = st.dz * dir;
		const base = G.vc;
		for ( const p of [ [ r.ix, r.hi - 0.06, r.iz ], [ r.ox, r.ho - 0.3, r.oz ], [ r.ix, r.hi + CURB, r.iz ], [ r.ox, r.ho + CURB, r.oz ] ] ) {
			E[ 0 ] = 0; E[ 1 ] = r.a; E[ 2 ] = 1; E[ 3 ] = seed;
			G.v( p[ 0 ], p[ 1 ], p[ 2 ], tx, 0, tz, E );
		}
		// choose winding facing (tx, tz)
		const ux = r.ox - r.ix, uz = r.oz - r.iz; // "right" along the cap bottom
		const cr = ( uz * 0 - 0 * 1 ); void cr;
		// normal of (u x up) = (-uz?..): u x up = ( uy*0 - uz*1, uz*0 - ux*0, ux*1 - uy*0 ) = ( -uz, 0, ux )
		const nxx = - uz, nzz = ux;
		if ( nxx * tx + nzz * tz > 0 ) G.q( base, base + 1, base + 2, base + 3 ); else G.q( base + 1, base, base + 3, base + 2 );
	};
	if ( capStart ) cap( rowV[ 0 ], - 1 );
	if ( capEnd ) cap( rowV[ R - 1 ], 1 );
	// walkable slabs: runs of samples merged while the top stays within 5 cm
	if ( C.lod ) return;
	const yaw = yawZ( st.dx, st.dz );
	let k = 0;
	while ( k < R - 1 ) {
		let e = k + 1, lo = Math.min( rowV[ k ].hi, rowV[ k ].ho, rowV[ e ].hi, rowV[ e ].ho ), hi = Math.max( rowV[ k ].hi, rowV[ k ].ho, rowV[ e ].hi, rowV[ e ].ho );
		while ( e < R - 1 ) {
			const r = rowV[ e + 1 ];
			const nlo = Math.min( lo, r.hi, r.ho ), nhi = Math.max( hi, r.hi, r.ho );
			if ( nhi - nlo > 0.05 || r.a - rowV[ k ].a > 24 ) break;
			lo = nlo; hi = nhi; e ++;
		}
		const a = rowV[ k ], b = rowV[ e ];
		const cx = ( a.ix + a.ox + b.ix + b.ox ) / 4, cz = ( a.iz + a.oz + b.iz + b.oz ) / 4;
		const top = ( lo + hi ) / 2 + CURB, bot = lo - 0.4;
		box( C, cx, ( top + bot ) / 2, cz, wk / 2, ( top - bot ) / 2, ( b.a - a.a ) / 2 + 0.02, yaw, 'concrete' );
		k = e;
	}
}

const NOTICES = [ WIDE.SHELTER, WIDE.CURFEW, WIDE.INFECTED, WIDE.QUARANTINE, WIDE.ROAD_CLOSED ];
const NOTICES_OAHU = [ WIDE.EVAC, ...NOTICES ];

function streetProps( C, st ) {
	const rnd = mulberry32( hashStr( 'st' + st.id ) );
	const hw = st.w / 2, wk = st.walk;
	const nx = - st.dz, nz = st.dx;
	const a0 = hw + wk + 2, a1 = st.len - hw - wk - 2;
	if ( a1 - a0 < 6 ) return;
	const town = st.kind === SK.METRO || st.kind === SK.TOWN;
	const at = ( a, u ) => [ st.ax + st.dx * a + nx * u, st.az + st.dz * a + nz * u ];
	const blocked = ( a, u ) => { const [ x, z ] = at( a, u ); return onHighway( x, z, 1.5 ); };
	const taken = []; // along positions per side used by furniture (keeps parked cars off hydrants)
	const free = ( a, side, r ) => ! taken.some( t => t[ 1 ] === side && Math.abs( t[ 0 ] - a ) < r );
	const curbU = ( side ) => side * ( hw + ( wk > 0 ? 0.55 : 1.2 ) );
	const onWalk = ( x, z, u ) => H( x, z ) + ( wk > 0 && Math.abs( u ) > hw && Math.abs( u ) < hw + wk ? LIFT.walk + CURB : 0 );
	// streetlights (towns and resorts), utility poles with lines (villages and one side of town streets)
	if ( st.kind !== SK.VILLAGE ) {
		const SP = st.kind === SK.METRO ? 32 : 38;
		let k = 0;
		for ( let a = a0 + 4 + rnd() * 6; a < a1 - 3; a += SP, k ++ ) {
			const side = st.kind === SK.METRO ? ( k % 2 ? 1 : - 1 ) : ( st.axis ? 1 : - 1 );
			const u = curbU( side );
			if ( blocked( a, u ) ) continue;
			const [ x, z ] = at( a, u );
			const flick = hh( st.id, k, 41 ) < 0.06 ? 1 : 0;
			// the arm points over the street: local +x towards the centre line
			const tilt = hh( st.id, k, 43 ) < 0.04 ? ( 0.25 + hh( st.id, k, 44 ) * 0.3 ) : 0;
			prop( C, PROP.STREETLIGHT, x, z, yawX( - nx * side, - nz * side ), tilt ? 0 : flick, 1, tilt, onWalk( x, z, u ) );
			taken.push( [ a, side ] );
		}
	}
	if ( st.kind === SK.VILLAGE || st.kind === SK.TOWN || st.kind === SK.BASE ) {
		const SP = 40;
		const side = st.axis ? - 1 : 1;
		const u = side * ( hw + wk + 0.6 );
		const poles = [];
		for ( let a = a0 + 2; a <= a1; a += SP ) {
			const [ x, z ] = at( a, u );
			if ( onHighway( x, z, 1.5 ) ) { poles.push( null ); continue; }
			poles.push( { x, z, y: H( x, z ), yaw: yawX( nx, nz ), nx, nz, a } );
		}
		poles.forEach( ( p, i ) => {
			if ( ! p ) return;
			const lamp = st.kind === SK.VILLAGE && i % 2 === 0;
			prop( C, hh( st.id, i, 51 ) < 0.1 ? PROP.POLE_T : PROP.POLE, p.x, p.z, p.yaw, lamp ? ( side > 0 ? 2 : 3 ) : 0 );
			if ( poles[ i + 1 ] ) spanWires( C, p, poles[ i + 1 ] );
			taken.push( [ p.a, side ] );
		} );
	}
	// fire hydrants (yellow in Honolulu)
	if ( st.kind !== SK.BASE ) {
		const n = st.len > 90 ? 2 : 1;
		for ( let k = 0; k < n; k ++ ) {
			const a = a0 + 6 + rnd() * ( a1 - a0 - 12 ), side = rnd() < 0.5 ? 1 : - 1;
			if ( ! free( a, side, 3 ) || blocked( a, curbU( side ) ) ) continue;
			const hu = side * ( hw + ( wk > 0 ? 0.45 : 1.0 ) );
			const [ x, z ] = at( a, hu );
			prop( C, PROP.HYDRANT, x, z, rnd() * 6.3, st.kind === SK.VILLAGE ? 1 : 0, 1, 0, onWalk( x, z, hu ) );
			taken.push( [ a, side ] );
		}
	}
	// bus stop with shelter (metro) or sign and bench (town)
	if ( town && wk > 0 && rnd() < ( st.kind === SK.METRO ? 0.3 : 0.16 ) ) {
		const side = rnd() < 0.5 ? 1 : - 1, a = a0 + ( a1 - a0 ) * ( 0.3 + rnd() * 0.4 );
		if ( free( a, side, 8 ) && ! blocked( a, curbU( side ) ) ) {
			// shelter back against the outer edge of the sidewalk, open to the street
			const bu = side * ( hw + wk - 0.95 );
			const [ x, z ] = at( a, bu );
			if ( st.kind === SK.METRO && wk >= 3 ) prop( C, PROP.BUS_SHELTER, x, z, yawZ( nx * side, nz * side ), 0, 1, 0, onWalk( x, z, bu ) );
			else prop( C, PROP.BENCH, x, z, yawZ( - nx * side, - nz * side ), 0, 1, 0, onWalk( x, z, bu ) );
			const [ sx, sz ] = at( a - 3, side * ( hw + 0.5 ) );
			const sy = onWalk( sx, sz, side * ( hw + 0.5 ) );
			prop( C, PROP.SIGN_POST, sx, sz, 0, 0, 1, 0, sy );
			sign( C, SIGN_CELL.misc( MISC.BUS ), sx, sy + 2.2, sz, yawZ( st.dx * side, st.dz * side ), 0.45, 0.45, 1 );
			taken.push( [ a, side ], [ a - 3, side ] );
		}
	}
	// notices from the first days of the outbreak, on sawhorses in the parking lane
	if ( town && rnd() < 0.08 ) {
		const side = rnd() < 0.5 ? 1 : - 1, a = a0 + ( a1 - a0 ) * ( 0.2 + rnd() * 0.6 );
		const u = side * ( hw - 1.2 );
		const [ x, z ] = at( a, u );
		if ( free( a, side, 5 ) && ! onHighway( x, z, 2 ) ) {
			const pool = net.cities[ st.city ].island === 3 ? NOTICES_OAHU : NOTICES;
			const dir = rnd() < 0.5 ? 1 : - 1;
			prop( C, PROP.SAWHORSE, x, z, yawX( nx, nz ) + ( rnd() - 0.5 ) * 0.2 );
			sign( C, SIGN_CELL.wide( pool[ Math.floor( rnd() * pool.length ) ] ), x, H( x, z ) + 1.27, z, yawZ( st.dx * dir, st.dz * dir ), 1.9, 0.48, 1 );
			taken.push( [ a, side ] );
		}
	}
	// metro downtown: parking meters and newspaper boxes
	if ( st.kind === SK.METRO && st.a.distC < 0.45 && wk > 0 ) {
		for ( const side of [ - 1, 1 ] ) for ( let a = a0 + 3; a < a1 - 2; a += 6.4 ) {
			if ( ! free( a, side, 1.5 ) || rnd() < 0.2 || blocked( a, curbU( side ) ) ) continue;
			const [ x, z ] = at( a, side * ( hw + 0.4 ) );
			prop( C, PROP.METER, x, z, yawZ( - nx * side, - nz * side ), 0, 1, rnd() < 0.05 ? 0.6 : 0, onWalk( x, z, side * ( hw + 0.4 ) ) );
		}
	}
	// parked (abandoned) cars along the curbs
	const pP = [ 0.5, 0.36, 0.24, 0.12 ][ st.kind ];
	const cu = hw - ( st.kind === SK.VILLAGE ? 1.0 : 1.15 );
	for ( const side of [ - 1, 1 ] ) {
		for ( let a = a0 + 2 + rnd() * 3; a < a1 - 3; a += 6.3 + rnd() * 0.8 ) {
			if ( rnd() > pP ) continue;
			if ( ! free( a, side, 3.5 ) ) continue;
			const [ x, z ] = at( a, side * cu );
			if ( onHighway( x, z, 2 ) ) continue;
			const dir = side;
			const type = st.base ? ( rnd() < 0.6 ? CAR.HUMVEE : rnd() < 0.5 ? CAR.MTRUCK : CAR.PICKUP ) : civType( rnd );
			const o = {};
			if ( st.base ) o.color = type === CAR.PICKUP ? 17 : 16;
			if ( rnd() < 0.05 ) o.burn = 0.7 + rnd() * 0.3;
			car( C, type, x, z, yawFwd( st.dx * dir, st.dz * dir ) + ( rnd() - 0.5 ) * 0.08, rnd, o );
			taken.push( [ a, side ] );
			if ( type === CAR.MTRUCK ) a += 3;
		}
	}
	// abandoned mid-street, doors flung open
	if ( rnd() < ( st.base ? 0.05 : 0.3 ) ) {
		const a = a0 + 8 + rnd() * Math.max( 1, a1 - a0 - 16 ), u = ( rnd() - 0.5 ) * hw;
		const [ x, z ] = at( a, u );
		if ( ! onHighway( x, z, 2 ) ) {
			const dir = rnd() < 0.5 ? 1 : - 1;
			car( C, civType( rnd ), x, z, yawFwd( st.dx * dir, st.dz * dir ) + ( rnd() - 0.5 ) * 1.2, rnd, { flags: CF.DOOR_FL | ( rnd() < 0.5 ? CF.DOOR_FR : 0 ) | ( rnd() < 0.4 ? CF.GLASS_SOME : 0 ) | ( rnd() < 0.3 ? CF.DOOR_RL : 0 ), burn: rnd() < 0.1 ? 0.8 : 0 } );
			scatterDebris( C, x, z, 6, rnd, 2 + Math.floor( rnd() * 4 ), 0.8 );
		}
	}
	// trash bags, boxes and stains along the sidewalks, blood here and there
	if ( ! st.base ) {
		const n = Math.floor( rnd() * ( town ? 5 : 3 ) );
		for ( let k = 0; k < n; k ++ ) {
			const side = rnd() < 0.5 ? 1 : - 1, a = a0 + rnd() * ( a1 - a0 );
			const [ x, z ] = at( a, side * ( hw + wk * ( 0.6 + rnd() * 0.35 ) + ( wk ? 0 : 1.5 ) ) );
			if ( onHighway( x, z, 1 ) ) continue;
			const y = H( x, z ) + ( wk > 0 ? LIFT.walk + CURB : 0 );
			const t = rnd();
			if ( t < 0.5 ) { for ( let b = 0; b < 1 + rnd() * 3; b ++ ) prop( C, PROP.TRASH_BAG, x + ( rnd() - 0.5 ) * 1.2, z + ( rnd() - 0.5 ) * 1.2, rnd() * 6.3, 0, 0.8 + rnd() * 0.4, 0, y ); }
			else if ( t < 0.7 ) prop( C, PROP.CARDBOARD, x, z, rnd() * 6.3, 0, 0.7 + rnd() * 0.6, 0, y );
			else if ( t < 0.8 ) prop( C, PROP.CART, x, z, rnd() * 6.3, 0, 1, rnd() < 0.3 ? 1.4 : 0, y );
			else if ( t < 0.87 ) prop( C, PROP.SUITCASE, x, z, rnd() * 6.3, Math.floor( rnd() * 6 ), 1, 1.5708, y );
			else decal( C, rnd() < 0.5 ? DECAL.BLOOD_DRAG : DECAL.BLOOD_SPLAT, x, z, rnd() * 6.3, 1.2 + rnd(), 2 + rnd() * 2.5, 0.85, y + 0.012 );
		}
		if ( rnd() < 0.35 ) {
			const [ x, z ] = at( a0 + rnd() * ( a1 - a0 ), ( rnd() - 0.5 ) * st.w * 0.8 );
			decal( C, [ DECAL.BLOOD_POOL, DECAL.BLOOD_DRAG, DECAL.OIL, DECAL.TIRE_MARKS ][ Math.floor( rnd() * 4 ) ], x, z, rnd() * 6.3, 1.5 + rnd() * 2, 2 + rnd() * 4, 0.85 );
		}
	}
}

// ---- intersections ---------------------------------------------------------------------------------------

function emitNodes( C ) {
	const { ci, cj, lod, out } = C;
	for ( const n of net.nodes.values() ) {
		if ( ! mine( n.x, n.z, ci, cj ) ) continue;
		const w = n.w, hw = w / 2, S = STUB[ n.kind ], wk = n.walk;
		const eu = [ n.ca, n.sa ], ev = [ - n.sa, n.ca ];
		const toW = ( a, b ) => [ n.x + eu[ 0 ] * a + ev[ 0 ] * b, n.z + eu[ 1 ] * a + ev[ 1 ] * b ];
		const has = ( d ) => ( n.arms >> ( ( d + 4 ) % 4 ) ) & 1;
		const seed = hh( n.key % 1e9, 13 ) * 997;
		const patch = ( as, bs ) => {
			// grid in node-local (a along eu, b along ev = right of eu)
			const rows = as.map( a => { const [ x, z ] = toW( a, 0 ); return { x, z, nx: ev[ 0 ], nz: ev[ 1 ], a }; } );
			ribbon( out.road, rows, bs, bs.map( () => LIFT.street ), ( row, c, e ) => {
				e[ 0 ] = row.a; e[ 1 ] = bs[ c ]; e[ 2 ] = RC.INTER; e[ 3 ] = w; e[ 4 ] = S; e[ 5 ] = n.arms; e[ 6 ] = n.kind; e[ 7 ] = seed;
			} );
		};
		const mid = lod ? [ - hw, 0, hw ] : [ - hw, - hw / 2, 0, hw / 2, hw ];
		patch( mid, mid );
		if ( S > 0 ) {
			if ( has( 0 ) ) patch( [ hw, hw + S ], mid );
			if ( has( 2 ) ) patch( [ - hw - S, - hw ], mid );
			if ( has( 1 ) ) patch( mid, [ hw, hw + S ] );
			if ( has( 3 ) ) patch( mid, [ - hw - S, - hw ] );
		}
		if ( wk > 0 && ! lod ) {
			// asphalt under the rounded corners
			for ( let q = 0; q < 4; q ++ ) {
				if ( ! has( q ) || ! has( q + 1 ) ) continue;
				const [ sa, sb ] = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ][ q ];
				const A = [ sa * hw, sa * ( hw + wk ) ].sort( ( x, y ) => x - y ), B = [ sb * hw, sb * ( hw + wk ) ].sort( ( x, y ) => x - y );
				patch( A, B );
			}
			nodeWalks( C, n, toW, eu, ev, has );
		} else if ( wk > 0 && lod ) {
			// far: flat corner squares and caps
			for ( let q = 0; q < 4; q ++ ) {
				const [ sa, sb ] = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ][ q ];
				const A = [ sa * hw, sa * ( hw + wk ) ].sort( ( x, y ) => x - y ), B = [ sb * hw, sb * ( hw + wk ) ].sort( ( x, y ) => x - y );
				const rows = A.map( a => { const [ x, z ] = toW( a, 0 ); return { x, z, nx: ev[ 0 ], nz: ev[ 1 ], s: a }; } );
				ribbon( out.road, rows, B, [ LIFT.walk + CURB, LIFT.walk + CURB ], ( row, c, e ) => { e[ 0 ] = 1; e[ 1 ] = row.s; e[ 2 ] = RC.WALK; e[ 3 ] = wk; e[ 4 ] = 0; e[ 5 ] = seed; e[ 6 ] = 0; e[ 7 ] = 0; } );
			}
		}
		if ( ! lod ) nodeProps( C, n, toW, has );
	}
}

// corner pieces (rounded where two streets meet) and end caps where an arm is missing
function nodeWalks( C, n, toW, eu, ev, has ) {
	const G = C.out.walk;
	const hw = n.w / 2, wk = n.walk;
	const seed = net.cities[ n.city ].angle;
	const nodeYaw = yawX( eu[ 0 ], eu[ 1 ] );
	// a walkable slab over a node-frame rectangle (local x along eu, local z along ev)
	const slab = ( A0, A1, B0, B1 ) => {
		const hs = [ [ A0, B0 ], [ A1, B0 ], [ A0, B1 ], [ A1, B1 ] ].map( ( [ a, b ] ) => lw( a, b )[ 1 ] );
		const top = ( Math.max( ...hs ) + Math.min( ...hs ) ) / 2 + CURB, bot = Math.min( ...hs ) - 0.4;
		const [ cx, cz ] = toW( ( A0 + A1 ) / 2, ( B0 + B1 ) / 2 );
		box( C, cx, ( top + bot ) / 2, cz, ( A1 - A0 ) / 2, ( top - bot ) / 2, ( B1 - B0 ) / 2, nodeYaw, 'concrete' );
	};
	const lw = ( a, b ) => { const [ x, z ] = toW( a, b ); return [ x, H( x, z ) + LIFT.walk, z ]; };
	const dirW = ( a, b ) => [ eu[ 0 ] * a + ev[ 0 ] * b, eu[ 1 ] * a + ev[ 1 ] * b ];
	const hitHw = ( pts ) => pts.some( ( [ a, b ] ) => { const [ x, z ] = toW( a, b ); return onHighway( x, z, 0.3 ); } );
	for ( let q = 0; q < 4; q ++ ) {
		const [ sa, sb ] = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ][ q ];
		const armA = q % 2 === 0 ? q : ( q + 1 ) % 4; // the arm along a (u axis) in this quadrant
		const armB = q % 2 === 0 ? q + 1 : q; // the arm along b
		void armA; void armB;
		// quadrant corner in (a, b): outer corner C = (sa (hw+wk), sb (hw+wk))
		const ca = sa * ( hw + wk ), cb = sb * ( hw + wk );
		const hasA = has( sa > 0 ? 0 : 2 ), hasB = has( sb > 0 ? 1 : 3 );
		if ( hitHw( [ [ sa * ( hw + wk / 2 ), sb * ( hw + wk / 2 ) ], [ sa * hw, sb * hw ], [ ca, cb ] ] ) ) continue;
		if ( hasA && hasB ) {
			// rounded: fan from the outer corner; arc from (sa hw, cb) to (ca, sb hw)
			const N = 7;
			const arc = [];
			for ( let k = 0; k <= N; k ++ ) {
				const t = k / N * Math.PI / 2;
				arc.push( [ ca - sa * wk * Math.cos( t ), cb - sb * wk * Math.sin( t ) ] );
			}
			const c0 = lw( ca, cb );
			const base = G.vc;
			E[ 0 ] = wk; E[ 1 ] = 0; E[ 2 ] = 0; E[ 3 ] = seed;
			G.v( c0[ 0 ], c0[ 1 ] + CURB, c0[ 2 ], 0, 1, 0, E );
			for ( const [ a, b ] of arc ) { const p = lw( a, b ); E[ 0 ] = 0; E[ 1 ] = Math.hypot( a - ca, b - cb ); G.v( p[ 0 ], p[ 1 ] + CURB, p[ 2 ], 0, 1, 0, E ); }
			const up = ( sa * sb ) > 0; // winding in the (a, b) frame
			for ( let k = 0; k < N; k ++ ) { if ( up ) G.t( base, base + 2 + k, base + 1 + k ); else G.t( base, base + 1 + k, base + 2 + k ); }
			// curb face along the arc
			const fb = G.vc;
			for ( let k = 0; k <= N; k ++ ) {
				const [ a, b ] = arc[ k ];
				const p = lw( a, b );
				const [ nxw, nzw ] = dirW( ( a - ca ) / wk, ( b - cb ) / wk );
				E[ 0 ] = - 0.2; E[ 1 ] = k * wk * 1.5708 / N; E[ 2 ] = 1; E[ 3 ] = seed;
				G.v( p[ 0 ], p[ 1 ] - 0.06, p[ 2 ], nxw, 0, nzw, E );
				E[ 0 ] = 0;
				G.v( p[ 0 ], p[ 1 ] + CURB, p[ 2 ], nxw, 0, nzw, E );
			}
			for ( let k = 0; k < N; k ++ ) { const a = fb + k * 2; if ( up ) G.q( a + 1, a, a + 3, a + 2 ); else G.q( a, a + 1, a + 2, a + 3 ); }
			// the part of the quarter disc a square slab can cover
			const q = wk * 0.7;
			slab( Math.min( ca, ca - sa * q ), Math.max( ca, ca - sa * q ), Math.min( cb, cb - sb * q ), Math.max( cb, cb - sb * q ) );
		} else {
			// square corner: top + faces towards any street and the outside
			const A0 = Math.min( sa * hw, ca ), A1 = Math.max( sa * hw, ca ), B0 = Math.min( sb * hw, cb ), B1 = Math.max( sb * hw, cb );
			walkBox( G, lw, dirW, A0, A1, B0, B1, seed, {
				a0: sa > 0 ? ( hasB ? 1 : 0 ) : ( hasA ? 0 : 2 ), a1: sa > 0 ? ( hasA ? 0 : 2 ) : ( hasB ? 1 : 0 ),
				b0: sb > 0 ? ( hasA ? 1 : 0 ) : ( hasB ? 0 : 2 ), b1: sb > 0 ? ( hasB ? 0 : 2 ) : ( hasA ? 1 : 0 ),
			} );
			slab( A0, A1, B0, B1 );
		}
	}
	// caps across missing arms
	for ( let d = 0; d < 4; d ++ ) {
		if ( has( d ) ) continue;
		const s = d >= 2 ? - 1 : 1;
		let A0, A1, B0, B1, faces;
		if ( d % 2 === 0 ) { A0 = Math.min( s * hw, s * ( hw + wk ) ); A1 = Math.max( s * hw, s * ( hw + wk ) ); B0 = - hw; B1 = hw; faces = { a0: s > 0 ? 1 : 2, a1: s > 0 ? 2 : 1, b0: 0, b1: 0 }; }
		else { B0 = Math.min( s * hw, s * ( hw + wk ) ); B1 = Math.max( s * hw, s * ( hw + wk ) ); A0 = - hw; A1 = hw; faces = { b0: s > 0 ? 1 : 2, b1: s > 0 ? 2 : 1, a0: 0, a1: 0 }; }
		const mids = [ [ ( A0 + A1 ) / 2, ( B0 + B1 ) / 2 ], [ A0, B0 ], [ A1, B1 ], [ A0, B1 ], [ A1, B0 ] ];
		if ( hitHw( mids ) ) continue;
		walkBox( G, lw, dirW, A0, A1, B0, B1, seed, faces );
		slab( A0, A1, B0, B1 );
	}
}

// an axis-aligned (node frame) sidewalk slab; faces: 0 none, 1 curb (to a street), 2 outer drop
function walkBox( G, lw, dirW, A0, A1, B0, B1, seed, f ) {
	const corners = [ [ A0, B0 ], [ A1, B0 ], [ A0, B1 ], [ A1, B1 ] ];
	const P4 = corners.map( ( [ a, b ] ) => lw( a, b ) );
	let base = G.vc;
	for ( let k = 0; k < 4; k ++ ) { E[ 0 ] = 1; E[ 1 ] = corners[ k ][ 0 ] + corners[ k ][ 1 ]; E[ 2 ] = 0; E[ 3 ] = seed; G.v( P4[ k ][ 0 ], P4[ k ][ 1 ] + CURB, P4[ k ][ 2 ], 0, 1, 0, E ); }
	// a increases along eu, b along ev = right of eu: (a0,b0)->(a0,b1) is "right", (a0,b0)->(a1,b0) is "forward"
	G.q( base, base + 2, base + 1, base + 3 );
	const side = ( i, j, kind, na, nb ) => {
		if ( ! kind ) return;
		const [ nxw, nzw ] = dirW( na, nb );
		const p = P4[ i ], q = P4[ j ];
		const lo = kind === 1 ? - 0.06 : - 0.35;
		base = G.vc;
		for ( const [ pt, y ] of [ [ p, p[ 1 ] + lo ], [ q, q[ 1 ] + lo ], [ p, p[ 1 ] + CURB ], [ q, q[ 1 ] + CURB ] ] ) {
			E[ 0 ] = kind === 1 ? 0 : 1; E[ 1 ] = 0; E[ 2 ] = kind; E[ 3 ] = seed;
			G.v( pt[ 0 ], y, pt[ 2 ], nxw, 0, nzw, E );
		}
		// winding: face towards (nxw, nzw)
		const ux = q[ 0 ] - p[ 0 ], uz = q[ 2 ] - p[ 2 ];
		if ( - uz * nxw + ux * nzw > 0 ) G.q( base, base + 1, base + 2, base + 3 ); else G.q( base + 1, base, base + 3, base + 2 );
	};
	side( 0, 2, f.a0, - 1, 0 ); // a = A0 face, normal -eu
	side( 1, 3, f.a1, 1, 0 );
	side( 0, 1, f.b0, 0, - 1 );
	side( 2, 3, f.b1, 0, 1 );
}

function nodeProps( C, n, toW, has ) {
	const rnd = mulberry32( n.key % 2147483647 );
	const hw = n.w / 2, wk = n.walk;
	const dir = ( d ) => armDir( n, ( d + 4 ) % 4 );
	const corner = ( q, off ) => { const [ sa, sb ] = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ][ q ]; return toW( sa * ( hw + off ), sb * ( hw + off ) ); };
	const cornerOk = ( q, off ) => { const [ x, z ] = corner( q, off ); return ! onHighway( x, z, 1 ); };
	// deep enough into the corner to stay inside the rounded curb
	const inset = wk > 0 ? wk * 0.45 : 1.4;
	const walkY = ( x, z ) => H( x, z ) + ( wk > 0 ? LIFT.walk + CURB : 0 );
	const big = ( n.kind === SK.METRO && n.deg >= 3 ) || ( n.kind === SK.TOWN && n.deg >= 4 && n.distC < 0.55 );
	if ( n.kind !== SK.BASE && n.deg >= 3 ) {
		if ( big ) {
			// signal masts at two diagonal corners, arms over the street to their right
			for ( const q of [ 0, 2 ] ) {
				const a = q, b = q + 1;
				if ( ! has( b ) || ! cornerOk( q, inset ) ) continue;
				const [ x, z ] = corner( q, inset );
				const da = dir( a );
				// arm along -dirA, heads facing dirB
				prop( C, PROP.SIGNAL, x, z, yawX( - da[ 0 ], - da[ 1 ] ), 0, 1, 0, walkY( x, z ) );
			}
			for ( const q of [ 1, 3 ] ) {
				const a = q, b = q + 1;
				if ( ! has( b ) || ! cornerOk( q, inset ) ) continue;
				const [ x, z ] = corner( q, inset );
				const da = dir( a );
				prop( C, PROP.SIGNAL, x, z, yawX( - da[ 0 ], - da[ 1 ] ), 1, 1, 0, walkY( x, z ) );
			}
		} else {
			// all-way stop
			for ( let d = 0; d < 4; d ++ ) {
				if ( ! has( d ) ) continue;
				const dd = dir( d ), right = dir( d + 3 ); // driver coming in along -dd has -dir(d+1) on the right == dir(d+3)
				const x = n.x + dd[ 0 ] * ( hw + STUB[ n.kind ] + 1.2 ) + right[ 0 ] * ( hw + inset ), z = n.z + dd[ 1 ] * ( hw + STUB[ n.kind ] + 1.2 ) + right[ 1 ] * ( hw + inset );
				if ( onHighway( x, z, 1 ) ) continue;
				const yaw = yawZ( dd[ 0 ], dd[ 1 ] );
				const ly = hh( n.key % 1e9, d, 3 ) < 0.08 ? 0.35 : 0;
				const py = walkY( x, z );
				prop( C, PROP.SIGN_POST, x, z, yaw, 0, 1, ly, py );
				// a leaning post takes its sign with it
				if ( ! ly ) sign( C, SIGN_CELL.misc( MISC.STOP ), x, py + 2.15, z, yaw, 0.76, 0.76, 0 );
			}
		}
	}
	// street name blades on one corner post
	let nameQ = - 1;
	if ( n.deg >= 3 || ( n.deg === 2 && ( n.arms === 3 || n.arms === 6 || n.arms === 12 || n.arms === 9 ) ) ) {
		let q = [ 3, 1, 0, 2 ].find( qq => has( qq ) && has( qq + 1 ) && cornerOk( qq, inset + 0.4 ) );
		if ( q !== undefined ) {
			nameQ = q;
			const [ x, z ] = corner( q, inset + 0.35 );
			const su = n.streets[ 0 ] || n.streets[ 2 ], sv = n.streets[ 1 ] || n.streets[ 3 ];
			const y = H( x, z ) + ( wk ? LIFT.walk + CURB : 0 );
			if ( ! big ) prop( C, PROP.SIGN_POST, x, z, 0, 1, 1, 0, y );
			const top = big ? 3.2 : 2.75;
			if ( su ) sign( C, SIGN_CELL.street( su.base ? 80 + su.name : su.name ), x, y + top, z, yawZ( n.sa, - n.ca ), 0.95, 0.2, 1 );
			if ( sv ) sign( C, SIGN_CELL.street( sv.base ? 80 + sv.name : sv.name ), x, y + top - 0.24, z, yawZ( n.ca, n.sa ), 0.95, 0.2, 1 );
			if ( big ) prop( C, PROP.SIGN_POST, x, z, 0, 1, 1.15, 0, y );
		}
	}
	// tsunami evacuation zone signs in the low-lying coastal blocks (they are everywhere along Hawaiian shores)
	if ( n.kind !== SK.BASE && n.deg >= 3 && H( n.x, n.z ) < 6 && hh( n.key % 1e9, 71 ) < 0.14 ) {
		const q = [ 0, 2, 1, 3 ].find( qq => qq !== nameQ && has( qq ) && has( qq + 1 ) && cornerOk( qq, inset + 0.4 ) );
		if ( q !== undefined ) {
			const [ x, z ] = corner( q, inset + 0.2 );
			const d = dir( q ), y = walkY( x, z );
			prop( C, PROP.SIGN_POST, x, z, 0, 0, 1, 0, y );
			sign( C, SIGN_CELL.misc( MISC.TSUNAMI ), x, y + 2.0, z, yawZ( d[ 0 ], d[ 1 ] ), 0.62, 0.62, 0 );
		}
	}
	// corner furniture
	if ( wk > 0 && ( n.kind === SK.METRO || n.kind === SK.TOWN ) ) {
		for ( let q = 0; q < 4; q ++ ) {
			if ( ! has( q ) || ! has( q + 1 ) ) continue;
			if ( rnd() < 0.45 ) {
				const off = hw + wk - 0.45;
				const [ sa, sb ] = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ][ q ];
				const [ x, z ] = toW( sa * ( off + 2.2 ), sb * off );
				if ( ! onHighway( x, z, 1 ) ) prop( C, PROP.TRASH_CAN, x, z, rnd() * 6.3, Math.floor( rnd() * 2 ), 1, rnd() < 0.12 ? 1.5708 : 0, H( x, z ) + LIFT.walk + CURB );
			}
			if ( n.kind === SK.METRO && rnd() < 0.3 ) {
				const off = hw + wk - 0.4;
				const [ sa, sb ] = [ [ 1, 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ] ][ q ];
				const cnt = 1 + Math.floor( rnd() * 3 );
				for ( let k = 0; k < cnt; k ++ ) {
					const [ x, z ] = toW( sa * off, sb * ( off + 2.5 + k * 0.58 ) );
					if ( onHighway( x, z, 1 ) ) continue;
					const e = dir( sa > 0 ? 0 : 2 );
					prop( C, PROP.NEWS_BOX, x, z, yawZ( - e[ 0 ], - e[ 1 ] ), Math.floor( rnd() * 5 ), 1, rnd() < 0.1 ? 1.5708 : 0, H( x, z ) + LIFT.walk + CURB );
				}
			}
		}
	}
	// a collision in the box: two cars, glass, blood
	if ( n.kind !== SK.BASE && n.deg >= 3 && rnd() < ( n.kind === SK.METRO ? 0.16 : 0.1 ) ) {
		const d1 = [ 0, 1, 2, 3 ].filter( d => has( d ) )[ Math.floor( rnd() * n.deg ) ];
		const a = dir( d1 ), b = dir( d1 + 1 );
		const t1 = civType( rnd ), t2 = civType( rnd );
		const burn = rnd() < 0.25 ? 0.8 : 0;
		const x1 = n.x + a[ 0 ] * 2.5 - b[ 0 ] * 1.6, z1 = n.z + a[ 1 ] * 2.5 - b[ 1 ] * 1.6;
		car( C, t1, x1, z1, yawFwd( - a[ 0 ], - a[ 1 ] ) + ( rnd() - 0.5 ) * 0.6, rnd, { burn } );
		const x2 = n.x - a[ 0 ] * 1.2 + b[ 0 ] * 1.3, z2 = n.z - a[ 1 ] * 1.2 + b[ 1 ] * 1.3;
		car( C, t2, x2, z2, yawFwd( b[ 0 ], b[ 1 ] ) + 0.4 + ( rnd() - 0.5 ) * 0.8, rnd, { burn: burn && rnd() < 0.5 ? 0.9 : 0 } );
		decal( C, DECAL.GLASS, n.x, n.z, rnd() * 6.3, 3, 3, 0.9 );
		decal( C, DECAL.SKID, n.x + a[ 0 ] * 9, n.z + a[ 1 ] * 9, yawZ( a[ 0 ], a[ 1 ] ), 2, 11, 0.8 );
		scatterDebris( C, n.x, n.z, 7, rnd, 3, 1 );
	}
}

// ---- airfields -------------------------------------------------------------------------------------------

function emitRunways( C ) {
	const { ci, cj, lod, out } = C;
	for ( const rw of net.runways ) {
		if ( ! mine( rw.x, rw.z, ci, cj ) ) continue;
		const step = lod ? 24 : 6;
		const n = Math.round( rw.len / step );
		const line = ( ox, oz, dx, dz, len, st ) => {
			const rows = [];
			const m = Math.max( 1, Math.round( len / st ) );
			for ( let k = 0; k <= m; k ++ ) { const v = len * k / m; rows.push( { x: ox + dx * v, z: oz + dz * v, nx: - dz, nz: dx, s: v } ); }
			return rows;
		};
		const ax = rw.x - rw.cx * rw.len / 2, az = rw.z - rw.sx * rw.len / 2;
		const hw = rw.w / 2;
		const cols = lod ? [ - hw - 4, - hw, 0, hw, hw + 4 ] : [ - hw - 4, - hw, - 12.75, - 8.5, - 4.25, 0, 4.25, 8.5, 12.75, hw, hw + 4 ];
		const lifts = cols.map( ( u, i ) => i === 0 || i === cols.length - 1 ? LIFT.runway - 0.05 : LIFT.runway );
		void n;
		ribbon( out.road, line( ax, az, rw.cx, rw.sx, rw.len, step ), cols, lifts, ( row, c, e ) => {
			e[ 0 ] = cols[ c ]; e[ 1 ] = row.s; e[ 2 ] = RC.RUNWAY; e[ 3 ] = rw.w; e[ 4 ] = rw.len; e[ 5 ] = rw.numA; e[ 6 ] = rw.numB; e[ 7 ] = 0;
		} );
		// parallel taxiway and connectors
		const tw = rw.taxiW / 2;
		const tcols = lod ? [ - tw, 0, tw ] : [ - tw - 1.5, - tw, - tw / 2, 0, tw / 2, tw, tw + 1.5 ];
		const tl = tcols.map( ( u, i ) => Math.abs( u ) > tw ? LIFT.taxi - 0.04 : LIFT.taxi );
		const tlen = rw.len - 40;
		const tx0 = ax + rw.cx * 20 + rw.nx * rw.taxiOff, tz0 = az + rw.sx * 20 + rw.nz * rw.taxiOff;
		ribbon( out.road, line( tx0, tz0, rw.cx, rw.sx, tlen, step ), tcols, tl, ( row, c, e ) => {
			e[ 0 ] = tcols[ c ]; e[ 1 ] = row.s; e[ 2 ] = RC.TAXIWAY; e[ 3 ] = rw.taxiW; e[ 4 ] = tlen; e[ 5 ] = 0; e[ 6 ] = 0; e[ 7 ] = 0;
		} );
		for ( const s of rw.connectors ) {
			const side = Math.sign( rw.taxiOff );
			const ox = rw.x + rw.cx * s + rw.nx * side * ( hw - 2 ), oz = rw.z + rw.sx * s + rw.nz * side * ( hw - 2 );
			const len = Math.abs( rw.taxiOff ) - hw + 2 + tw - 1;
			const dx = rw.nx * side, dz = rw.nz * side;
			ribbon( out.road, line( ox, oz, dx, dz, len, lod ? len : 4 ), tcols, tcols.map( ( u ) => Math.abs( u ) > tw ? LIFT.conn - 0.04 : LIFT.conn ), ( row, c, e ) => {
				e[ 0 ] = tcols[ c ]; e[ 1 ] = row.s; e[ 2 ] = RC.TAXIWAY; e[ 3 ] = rw.taxiW; e[ 4 ] = len; e[ 5 ] = 1; e[ 6 ] = 0; e[ 7 ] = 0;
			} );
		}
		if ( ! lod ) {
			// windsock-less but lit: edge lights as tiny barrels would be noise; a few cones and a crashed plane are left to the vehicles module
			const rnd = mulberry32( 991 + rw.i );
			for ( let k = 0; k < 3; k ++ ) {
				const v = rnd() * rw.len - rw.len / 2;
				const x = rw.x + rw.cx * v + rw.nx * ( rnd() - 0.5 ) * rw.w * 0.6, z = rw.z + rw.sx * v + rw.nz * ( rnd() - 0.5 ) * rw.w * 0.6;
				car( C, civType( rnd ), x, z, rnd() * 6.3, rnd, { burn: rnd() < 0.4 ? 0.9 : 0 } );
			}
		}
	}
}

// ---- fences ---------------------------------------------------------------------------------------------------

function emitFences( C ) {
	const { ci, cj, out } = C;
	for ( const f of net.fences ) {
		if ( ! mine( ( f.ax + f.bx ) / 2, ( f.az + f.bz ) / 2, ci, cj ) ) continue;
		const L = Math.hypot( f.bx - f.ax, f.bz - f.az );
		const n = Math.max( 1, Math.round( L / 3 ) );
		const dx = ( f.bx - f.ax ) / L, dz = ( f.bz - f.az ) / L;
		const yaw = yawZ( dx, dz );
		const HT = f.military ? 2.4 : 2.2;
		const pts = [];
		for ( let k = 0; k <= n; k ++ ) { const t = k / n; const x = f.ax + ( f.bx - f.ax ) * t, z = f.az + ( f.bz - f.az ) * t; pts.push( [ x, H( x, z ) - 0.05, z, t * L ] ); }
		for ( let k = 0; k <= n; k ++ ) {
			const [ x, y, z ] = pts[ k ];
			kitBox( out.kit, x, y + HT / 2 + 0.05, z, 0.035, HT / 2 + 0.05, 0.035, yaw, [ 0.55, 0.57, 0.58 ], [ 0.45, 0.8, 0 ] );
			if ( f.military ) {
				// outrigger arm for barbed wire, leaning outwards
				wireArm( out, x, y + HT, z, dx, dz );
			}
		}
		// warning signs on the outside every ~70 m
		const nS = Math.floor( L / 70 );
		for ( let k = 0; k < nS; k ++ ) {
			const t = ( k + 0.5 ) / nS;
			const x = f.ax + ( f.bx - f.ax ) * t + f.ox * 0.07, z = f.az + ( f.bz - f.az ) * t + f.oz * 0.07;
			const y = H( x, z );
			if ( f.military ) sign( C, SIGN_CELL.misc( MISC.MILITARY ), x, y + 1.45, z, yawZ( f.ox, f.oz ), 0.62, 0.62, 0 );
			else sign( C, SIGN_CELL.wide( WIDE.RESTRICTED ), x, y + 1.45, z, yawZ( f.ox, f.oz ), 1.3, 0.33, 0 );
		}
		// fabric
		const G = out.fence;
		for ( let k = 0; k < n; k ++ ) {
			const a = pts[ k ], b = pts[ k + 1 ];
			const nx = - dz, nz = dx;
			const base = G.vc;
			for ( const [ p, v ] of [ [ a, 0 ], [ b, 0 ], [ a, 1 ], [ b, 1 ] ] ) { E[ 0 ] = p[ 3 ] / 0.9; E[ 1 ] = v * HT / 0.9; G.v( p[ 0 ], p[ 1 ] + 0.06 + v * ( HT - 0.02 ), p[ 2 ], nx, 0, nz, E ); }
			G.q( base, base + 1, base + 2, base + 3 );
			box( C, ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2 + HT / 2, ( a[ 2 ] + b[ 2 ] ) / 2, 0.05, HT / 2, Math.hypot( b[ 0 ] - a[ 0 ], b[ 2 ] - a[ 2 ] ) / 2, yaw, 'metal' );
			// top rail
			railTube( out.kit, a[ 0 ], a[ 1 ] + HT, a[ 2 ], b[ 0 ], b[ 1 ] + HT, b[ 2 ] );
			// barbed strands
			if ( f.military ) for ( const [ o, h ] of [ [ 0.12, 0.12 ], [ 0.24, 0.25 ], [ 0.36, 0.38 ] ] ) {
				out.wires.push( a[ 0 ] - OX + nx * o, a[ 1 ] + HT + h, a[ 2 ] - OZ + nz * o, b[ 0 ] - OX + nx * o, b[ 1 ] + HT + h, b[ 2 ] - OZ + nz * o );
			}
		}
	}
}

function wireArm( out, x, y, z, dx, dz ) {
	const nx = - dz, nz = dx;
	const yaw = yawZ( nx, nz );
	kitBox( out.kit, x + nx * 0.2, y + 0.2, z + nz * 0.2, 0.02, 0.26, 0.02, yaw, [ 0.5, 0.52, 0.53 ], [ 0.5, 0.8, 0 ] );
}

function railTube( G, ax, ay, az, bx, by, bz ) {
	const L = Math.hypot( bx - ax, bz - az );
	kitBox( G, ( ax + bx ) / 2, ( ay + by ) / 2, ( az + bz ) / 2, 0.025, 0.025, L / 2, yawZ( bx - ax, bz - az ), [ 0.55, 0.57, 0.58 ], [ 0.4, 0.8, 0 ] );
}

// ---- outbreak events: roadblocks, checkpoints, jams, crashes ---------------------------------------------------

function emitEvents( C ) {
	const { ci, cj } = C;
	for ( const e of net.events ) {
		if ( ! mine( e.x, e.z, ci, cj ) ) continue;
		const r = e.road;
		const rnd = mulberry32( e.seed );
		if ( e.type === 'jam' ) jam( C, e, r, rnd );
		else if ( e.type === 'roadblock' ) roadblock( C, e, r, rnd );
		else if ( e.type === 'checkpoint' ) checkpoint( C, e, r, rnd );
		else if ( e.type === 'crash' ) crash( C, e, r, rnd );
	}
}

// lane centre offsets for the direction of travel dir (+1 along s, -1 against)
function lanes( r, dir ) {
	if ( r.lanes === 4 ) return [ 2.65 * dir, 6.15 * dir ];
	if ( r.lanes === 2 ) return [ 1.9 * dir ];
	return [ 0 ];
}

function jam( C, e, r, rnd ) {
	const dir = e.dir;
	const L = Math.abs( e.s1 - e.s );
	const outL = lanes( r, dir );
	let placed = 0;
	for ( const u0 of [ ...outL, dir * ( r.hw + 0.3 ) ] ) {
		const shoulder = Math.abs( u0 ) > r.hw - 0.5;
		let d = 2 + rnd() * 4;
		while ( d < L ) {
			const s = e.s + dir * d;
			const w = rowAt( r, s );
			const u = u0 + ( rnd() - 0.5 ) * 0.6;
			const x = w.x + w.nx * u, z = w.z + w.nz * u;
			if ( shoulder && rnd() < 0.55 ) { d += 7 + rnd() * 12; continue; }
			const type = rnd() < 0.03 ? CAR.BUS : civType( rnd );
			const o = { burn: rnd() < 0.05 ? 0.8 : 0 };
			car( C, type, x, z, yawFwd( w.tx * dir, w.tz * dir ) + ( rnd() - 0.5 ) * 0.22, rnd, o );
			placed ++;
			if ( rnd() < 0.18 ) scatterDebris( C, x + w.nx * dir * 2.5, z + w.nz * dir * 2.5, 3, rnd, 1 + Math.floor( rnd() * 2 ), 0.9 );
			d += CAR_DIMS[ type ].L + 1.2 + rnd() * 2.5;
		}
	}
	// people fled on foot: luggage and blood towards the city
	for ( let k = 0; k < 6; k ++ ) {
		const w = rowAt( r, e.s + dir * rnd() * L );
		const u = ( rnd() - 0.5 ) * r.w;
		scatterDebris( C, w.x + w.nx * u, w.z + w.nz * u, 2, rnd, 2, 1 );
	}
	// the crash that started it
	if ( e.front ) crash( C, { s: e.s + dir * ( L + 8 ), dir }, r, rnd );
	void placed;
}

function across( C, r, s, rnd, type, uFrom, uTo, spacing, fn ) {
	const w = rowAt( r, s );
	for ( let u = uFrom; u <= uTo + 1e-6; u += spacing ) fn( w.x + w.nx * u, w.z + w.nz * u, w, u );
	void C; void rnd; void type;
}

function roadblock( C, e, r, rnd ) {
	const dir = e.dir;
	const w = rowAt( r, e.s );
	const tx = w.tx * dir, tz = w.tz * dir; // outbound
	const hw = r.hw;
	// two cruisers nose to nose across the outbound lanes, light bars dead
	const cx = w.x + w.nx * dir * hw * 0.45, cz = w.z + w.nz * dir * hw * 0.45;
	car( C, CAR.POLICE, cx + tx * 1.5, cz + tz * 1.5, yawFwd( w.nx * dir, w.nz * dir ) + 0.35, rnd, { flags: CF.DOOR_FL | CF.LOOT, color: 20 } );
	car( C, CAR.POLICE, cx - w.nx * dir * hw * 0.5 - tx * 2, cz - w.nz * dir * hw * 0.5 - tz * 2, yawFwd( - w.nx * dir, - w.nz * dir ) - 0.4, rnd, { flags: CF.DOOR_FL | CF.DOOR_FR | CF.LOOT | ( rnd() < 0.5 ? CF.GLASS_SOME : 0 ), color: 20 } );
	// sawhorses and cones in a line across the whole road
	across( C, r, e.s + dir * 5, rnd, 0, - hw + 0.8, hw - 0.8, 2.8, ( x, z, ww ) => {
		if ( rnd() < 0.2 ) return;
		const yaw = yawX( ww.nx, ww.nz ) + ( rnd() - 0.5 ) * 0.3;
		if ( rnd() < 0.55 ) prop( C, PROP.SAWHORSE, x, z, yaw, 0, 1, rnd() < 0.15 ? 1.5708 : 0 );
		else prop( C, PROP.CONE, x, z, rnd() * 6.3, 0, 1, rnd() < 0.3 ? 1.5708 : 0 );
	} );
	across( C, r, e.s + dir * 12, rnd, 0, - hw + 0.5, hw - 0.5, 1.8, ( x, z ) => { if ( rnd() < 0.6 ) prop( C, PROP.CONE, x, z, rnd() * 6.3, 0, 1, rnd() < 0.3 ? 1.5708 : 0 ); } );
	// spike strip and signs
	const s2 = rowAt( r, e.s - dir * 6 );
	prop( C, PROP.SPIKES, s2.x + s2.nx * dir * 1.8, s2.z + s2.nz * dir * 1.8, yawX( s2.nx, s2.nz ) );
	const sgx = w.x + w.nx * ( hw + 1.5 ) * dir - tx * 18, sgz = w.z + w.nz * ( hw + 1.5 ) * dir - tz * 18;
	prop( C, PROP.SAWHORSE, sgx, sgz, yawX( w.nx, w.nz ) );
	sign( C, SIGN_CELL.wide( rnd() < 0.5 ? WIDE.ROAD_CLOSED : WIDE.QUARANTINE ), sgx, H( sgx, sgz ) + 1.27, sgz, yawZ( - tx, - tz ), 1.9, 0.48, 1 );
	// the last stand: casings of blood, bags, a body bag or two
	for ( let k = 0; k < 8; k ++ ) {
		const a = rnd() * 6.283, d = 2 + rnd() * 9;
		const x = cx + Math.cos( a ) * d, z = cz + Math.sin( a ) * d;
		const t = rnd();
		if ( t < 0.45 ) decal( C, rnd() < 0.5 ? DECAL.BLOOD_POOL : DECAL.BLOOD_DRAG, x, z, rnd() * 6.3, 1.4 + rnd(), 2 + rnd() * 2, 0.9 );
		else if ( t < 0.6 ) prop( C, PROP.BODY_BAG, x, z, rnd() * 6.3 );
		else if ( t < 0.75 ) decal( C, DECAL.BLOOD_PRINTS, x, z, rnd() * 6.3, 1.2, 3, 0.8 );
		else scatterDebris( C, x, z, 1.5, rnd, 1, 1 );
	}
	// a few cars that were turned back, abandoned on the inbound side
	for ( let k = 0; k < 2; k ++ ) {
		const ww = rowAt( r, e.s - dir * ( 14 + k * 9 + rnd() * 5 ) );
		const u = - dir * ( r.lanes === 4 ? 4 : 1.9 );
		car( C, civType( rnd ), ww.x + ww.nx * u, ww.z + ww.nz * u, yawFwd( - tx, - tz ) + ( rnd() - 0.5 ) * 0.9, rnd, {} );
	}
}

function checkpoint( C, e, r, rnd ) {
	const dir = e.dir;
	const w = rowAt( r, e.s );
	const tx = w.tx * dir, tz = w.tz * dir;
	const nx = w.nx, nz = w.nz;
	const hw = r.hw;
	const side = hh( e.seed, 1 ) < 0.5 ? 1 : - 1;
	// HESCO walls on both shoulders, a chicane of Jersey barriers in the lanes
	for ( const sd of [ - 1, 1 ] ) {
		for ( let k = - 3; k <= 3; k ++ ) {
			const x = w.x + nx * sd * ( hw + 1.2 ) + tx * k * 1.12, z = w.z + nz * sd * ( hw + 1.2 ) + tz * k * 1.12;
			prop( C, PROP.HESCO, x, z, yawZ( tx, tz ) );
		}
	}
	const ww = rowAt( r, e.s + dir * 6 );
	for ( let u = - hw + 1.5, k = 0; u < hw - 1; u += 3.2, k ++ ) {
		if ( k % 3 === 1 ) continue; // gaps to snake through
		const x = ww.x + nx * u, z = ww.z + nz * u;
		prop( C, PROP.JERSEY, x, z, yawX( nx, nz ) + ( rnd() - 0.5 ) * 0.1 );
	}
	const w2 = rowAt( r, e.s - dir * 4 );
	for ( let u = - hw + 2.8, k = 0; u < hw - 1; u += 3.2, k ++ ) {
		if ( k % 3 === 0 ) continue;
		prop( C, PROP.JERSEY, w2.x + nx * u, w2.z + nz * u, yawX( nx, nz ) + ( rnd() - 0.5 ) * 0.1 );
	}
	// sandbag nest with a floodlight, razor wire out front, the guard booth and the boom
	const bx = w.x + nx * side * ( hw + 4.5 ) - tx * 2, bz = w.z + nz * side * ( hw + 4.5 ) - tz * 2;
	for ( let k = 0; k < 4; k ++ ) {
		const a = k * 1.5708;
		const px = bx + Math.cos( a ) * 1.9, pz = bz + Math.sin( a ) * 1.9;
		if ( k === 3 ) continue;
		prop( C, PROP.SANDBAGS, px, pz, yawZ( Math.cos( a ), Math.sin( a ) ) );
	}
	prop( C, PROP.FLOODLIGHT, bx - tx * 3.5, bz - tz * 3.5, yawZ( tx, tz ) );
	const gx = w.x + nx * side * ( hw + 2.4 ) + tx * 9, gz = w.z + nz * side * ( hw + 2.4 ) + tz * 9;
	prop( C, PROP.BOOTH, gx, gz, yawZ( - nx * side, - nz * side ) );
	const bmx = w.x + nx * side * ( hw + 0.4 ) + tx * 12, bmz = w.z + nz * side * ( hw + 0.4 ) + tz * 12;
	prop( C, PROP.BOOM, bmx, bmz, yawX( - nx * side, - nz * side ), 0, r.w * 0.95 );
	for ( const s of [ - 16, - 22 ] ) {
		const w3 = rowAt( r, e.s + dir * s );
		for ( let u = - hw + 2.5; u < hw - 2; u += 5 ) if ( rnd() < 0.8 ) prop( C, PROP.RAZOR, w3.x + nx * u, w3.z + nz * u, yawX( nx, nz ) + ( rnd() - 0.5 ) * 0.2 );
	}
	// signs
	for ( const [ s, k ] of [ [ - 30, WIDE.ARMY_HALT ], [ - 60, WIDE.CHECKPOINT_AHEAD ] ] ) {
		const w4 = rowAt( r, e.s + dir * s );
		const sx = w4.x + nx * dir * ( hw + 1.6 ), sz = w4.z + nz * dir * ( hw + 1.6 );
		prop( C, PROP.SAWHORSE, sx, sz, yawX( nx, nz ) );
		sign( C, SIGN_CELL.wide( k ), sx, H( sx, sz ) + 1.27, sz, yawZ( - tx, - tz ), 1.9, 0.48, 1 );
	}
	// vehicles: humvees at the gate, a truck on the shoulder
	car( C, CAR.HUMVEE, w.x + nx * side * ( hw - 1.5 ) + tx * 16, w.z + nz * side * ( hw - 1.5 ) + tz * 16, yawFwd( - tx, - tz ) + 0.3, rnd, { color: 16, flags: CF.LOOT | ( rnd() < 0.5 ? CF.DOOR_FL : 0 ) } );
	car( C, CAR.MTRUCK, w.x - nx * side * ( hw + 3.5 ) + tx * 20, w.z - nz * side * ( hw + 3.5 ) + tz * 20, yawFwd( tx, tz ), rnd, { color: 16, flags: CF.LOOT } );
	if ( rnd() < 0.6 ) car( C, CAR.HUMVEE, w.x + nx * side * ( hw + 5 ) - tx * 8, w.z + nz * side * ( hw + 5 ) - tz * 8, yawFwd( nx * side, nz * side ), rnd, { color: 16, burn: rnd() < 0.3 ? 0.9 : 0 } );
	// it didn't hold: body bags, blood, a tent
	const tx0 = w.x - nx * side * ( hw + 9 ) + tx * 6, tz0 = w.z - nz * side * ( hw + 9 ) + tz * 6;
	prop( C, PROP.TENT, tx0, tz0, yawZ( tx, tz ) );
	for ( let k = 0; k < 5; k ++ ) prop( C, PROP.BODY_BAG, tx0 + nx * side * 3.2 + tx * ( k - 2 ) * 0.9, tz0 + nz * side * 3.2 + tz * ( k - 2 ) * 0.9, yawZ( nx, nz ) + ( rnd() - 0.5 ) * 0.2 );
	for ( let k = 0; k < 10; k ++ ) {
		const x = w.x + nx * ( rnd() - 0.5 ) * r.w * 1.4 + tx * ( rnd() - 0.5 ) * 30, z = w.z + nz * ( rnd() - 0.5 ) * r.w * 1.4 + tz * ( rnd() - 0.5 ) * 30;
		decal( C, [ DECAL.BLOOD_POOL, DECAL.BLOOD_SPLAT, DECAL.BLOOD_DRAG, DECAL.PAPERS ][ Math.floor( rnd() * 4 ) ], x, z, rnd() * 6.3, 1.3 + rnd() * 1.5, 2 + rnd() * 2, 0.85 );
	}
}

function crash( C, e, r, rnd ) {
	const dir = e.dir;
	const w = rowAt( r, e.s );
	const n = 2 + Math.floor( rnd() * ( r.lanes === 1 ? 1 : 4 ) );
	const tx = w.tx * dir, tz = w.tz * dir;
	let x = w.x + w.nx * dir * 1.5, z = w.z + w.nz * dir * 1.5;
	for ( let k = 0; k < n; k ++ ) {
		const o = {};
		if ( k === 0 && rnd() < 0.35 ) o.roll = rnd() < 0.5 ? Math.PI : 1.5708 * ( rnd() < 0.5 ? 1 : - 1 );
		if ( rnd() < 0.35 ) o.burn = 0.7 + rnd() * 0.3;
		const type = k === 0 && r.lanes >= 2 && rnd() < 0.2 ? CAR.VAN : civType( rnd );
		car( C, type, x, z, yawFwd( tx, tz ) + ( rnd() - 0.5 ) * 2.4, rnd, o );
		const step = 3.5 + rnd() * 3.5;
		x -= tx * step - w.nx * ( rnd() - 0.5 ) * 4; z -= tz * step - w.nz * ( rnd() - 0.5 ) * 4;
	}
	decal( C, DECAL.SKID, w.x - tx * 14, w.z - tz * 14, yawZ( tx, tz ) + ( rnd() - 0.5 ) * 0.3, 2.2, 18, 0.9 );
	decal( C, DECAL.OIL, w.x, w.z, rnd() * 6.3, 3, 4, 0.8 );
	scatterDebris( C, w.x, w.z, 9, rnd, 5 + Math.floor( rnd() * 4 ), 1 );
	// cones where someone tried to manage it
	if ( rnd() < 0.4 ) for ( let k = 0; k < 5; k ++ ) prop( C, PROP.CONE, w.x - tx * ( 10 + k * 3 ) + w.nx * dir * ( 3 - k * 0.6 ), w.z - tz * ( 10 + k * 3 ) + w.nz * dir * ( 3 - k * 0.6 ), 0, 0, 1, rnd() < 0.3 ? 1.5708 : 0 );
}
