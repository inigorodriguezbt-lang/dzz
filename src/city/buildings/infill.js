// Infill: the bake leaves many city lots empty (its highways run through the grids and clear every lot near
// them, and some blocks never got lots). These buildings are derived deterministically from the street grid,
// the baked buildings, the roads and the ground, and appended to meta.buildings on the main thread and in
// every worker alike, so all sides index them identically (records after the baked ones).
import { NF, BT, hash32, rng, readBuilding, shapeOf, rectOf } from './data.js';

const FLAG_ROAD = 1, FLAG_RUNWAY = 8;
// zones by distance from the centre (fraction of the city radius) per kind of settlement
const ZONES = {
	metro: [ [ 0.3, 'core' ], [ 0.62, 'commercial' ], [ 9, 'residential' ] ],
	town: [ [ 0.3, 'commercial' ], [ 9, 'residential' ] ],
	resort: [ [ 0.75, 'resort' ], [ 9, 'residential' ] ],
	village: [ [ 0.22, 'commercial' ], [ 9, 'residential' ] ],
};
const COMMERCIAL = [ [ 'convenience', 20 ], [ 'restaurant', 15 ], [ 'clothing', 9 ], [ 'bar', 7 ], [ 'office', 10 ], [ 'pawn', 4 ], [ 'fastfood', 8 ],
	[ 'apartment', 14 ], [ 'sports', 3 ], [ 'surf', 4 ], [ 'pharmacy', 3 ], [ 'hardware', 2 ], [ 'garage', 3 ] ];
const CORE = [ [ 'office', 45 ], [ 'apartment', 32 ], [ 'hotel', 13 ] ];

function pickW( R, list ) {
	let t = 0;
	for ( const [ , w ] of list ) t += w;
	let x = R() * t;
	for ( const [ k, w ] of list ) { x -= w; if ( x <= 0 ) return k; }
	return list[ list.length - 1 ][ 0 ];
}

// oriented rects { x, z, hw, hd, c, s } overlap (separating axes)
function obbOverlap( a, b ) {
	const axes = [ [ a.c, a.s ], [ - a.s, a.c ], [ b.c, b.s ], [ - b.s, b.c ] ];
	const dx = b.x - a.x, dz = b.z - a.z;
	for ( const [ ax, az ] of axes ) {
		const ra = a.hw * Math.abs( a.c * ax + a.s * az ) + a.hd * Math.abs( - a.s * ax + a.c * az );
		const rb = b.hw * Math.abs( b.c * ax + b.s * az ) + b.hd * Math.abs( - b.s * ax + b.c * az );
		if ( Math.abs( dx * ax + dz * az ) > ra + rb ) return false;
	}
	return true;
}

export let STATS = null;
export function infillStats( on ) { STATS = on ? {} : null; return STATS; }
export function augmentBuildings( meta, hf ) {
	const B = meta.buildings;
	if ( B.infill ) return B.infill;
	const D = B.data;
	const N0 = Math.floor( D.length / NF );
	// the baked footprints (with a margin for their yards) in a 64 m hash
	const H = 64, grid = new Map();
	const hk = ( i, j ) => ( i + 2048 ) * 4096 + ( j + 2048 );
	const addRect = ( o ) => {
		const r = Math.hypot( o.hw, o.hd );
		for ( let i = Math.floor( ( o.x - r ) / H ); i <= Math.floor( ( o.x + r ) / H ); i ++ ) for ( let j = Math.floor( ( o.z - r ) / H ); j <= Math.floor( ( o.z + r ) / H ); j ++ ) {
			const k = hk( i, j );
			let a = grid.get( k );
			if ( ! a ) grid.set( k, a = [] );
			a.push( o );
		}
	};
	const occupied = ( x, z, list = grid.get( hk( Math.floor( x / H ), Math.floor( z / H ) ) ) ) => {
		if ( ! list ) return false;
		for ( const b of list ) {
			const dx = x - b.x, dz = z - b.z;
			if ( Math.abs( dx * b.c + dz * b.s ) < b.hw && Math.abs( - dx * b.s + dz * b.c ) < b.hd ) return true;
		}
		return false;
	};
	const blocked = ( o ) => {
		const r = Math.hypot( o.hw, o.hd );
		for ( let i = Math.floor( ( o.x - r ) / H ); i <= Math.floor( ( o.x + r ) / H ); i ++ ) for ( let j = Math.floor( ( o.z - r ) / H ); j <= Math.floor( ( o.z + r ) / H ); j ++ ) {
			for ( const b of grid.get( hk( i, j ) ) || [] ) if ( obbOverlap( o, b ) ) return true;
		}
		return false;
	};
	// what a baked building really occupies: its whole lot where the lot is part of it (forecourts, car parks,
	// yards, compounds), else the built rect and a margin (a tower on a big downtown lot leaves room for more)
	const WHOLE = { barracks: 1, hq: 1, armory: 1, hangar: 1, terminal: 1, ctower: 1, dome: 1, tent: 1, house: 1 };
	// margins round the built rect: [ front, back, sides ] (a forecourt, a car park, a compound)
	const MARGIN = { gas: [ 22, 3, 6 ], bigbox: [ 20, 5, 5 ], police: [ 8, 6, 6 ], fire: [ 12, 6, 6 ], hospital: [ 12, 8, 8 ], school: [ 10, 10, 8 ], church: [ 8, 6, 6 ],
		clinic: [ 8, 5, 5 ], warehouse: [ 10, 8, 6 ], garage: [ 10, 4, 4 ] };
	const tmp = {};
	for ( let i = 0; i < N0; i ++ ) {
		const r = readBuilding( D, i, tmp ), S = shapeOf( r, meta.cities );
		if ( WHOLE[ S.arch ] ) { addRect( { x: r.x, z: r.z, hw: r.w / 2 + 3, hd: r.d / 2 + 3, c: r.c, s: r.s } ); continue; }
		const R = rectOf( S ), [ mf, mb, ms ] = MARGIN[ S.arch ] || [ 4, 4, 4 ];
		const x0 = Math.max( - r.w / 2 - 3, R.x0 - ms ), x1 = Math.min( r.w / 2 + 3, R.x1 + ms ), z0 = Math.max( - r.d / 2 - 3, R.z0 - mf ), z1 = Math.min( r.d / 2 + 3, R.z1 + mb );
		const lx = ( x0 + x1 ) / 2, lz = ( z0 + z1 ) / 2;
		addRect( { x: r.x + lx * r.c - lz * r.s, z: r.z + lx * r.s + lz * r.c, hw: ( x1 - x0 ) / 2, hd: ( z1 - z0 ) / 2, c: r.c, s: r.s } );
	}
	// road and runway centre lines in the same hash (segments with their half widths)
	const segs = new Map();
	const addSeg = ( ax, az, bx, bz, hw ) => {
		const r = hw + 2;
		for ( let i = Math.floor( ( Math.min( ax, bx ) - r ) / H ); i <= Math.floor( ( Math.max( ax, bx ) + r ) / H ); i ++ ) for ( let j = Math.floor( ( Math.min( az, bz ) - r ) / H ); j <= Math.floor( ( Math.max( az, bz ) + r ) / H ); j ++ ) {
			const k = hk( i, j );
			let a = segs.get( k );
			if ( ! a ) segs.set( k, a = [] );
			a.push( [ ax, az, bx, bz, hw ] );
		}
	};
	// (the roads are sampled every few metres: ~25 m chords are enough, with a metre of slack for the curves)
	for ( const r of meta.roads || [] ) {
		const p = r.pts;
		let ax = p[ 0 ], az = p[ 1 ];
		for ( let q = 3; q < p.length; q += 3 ) {
			const bx = p[ q ], bz = p[ q + 1 ];
			if ( q + 3 < p.length && Math.hypot( bx - ax, bz - az ) < 25 ) continue;
			addSeg( ax, az, bx, bz, ( r.w || 8 ) / 2 + 1 );
			ax = bx; az = bz;
		}
	}
	for ( const rw of meta.runways || [] ) {
		const c = Math.cos( rw.angle ), s = Math.sin( rw.angle ), h = rw.len / 2 + 60;
		addSeg( rw.x - c * h, rw.z - s * h, rw.x + c * h, rw.z + s * h, rw.w / 2 + 40 );
	}
	const nearRoad = ( x, z, clear, list = segs.get( hk( Math.floor( x / H ), Math.floor( z / H ) ) ) ) => {
		if ( ! list ) return false;
		for ( const [ ax, az, bx, bz, hw ] of list ) {
			const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
			const t = Math.max( 0, Math.min( 1, ( ( x - ax ) * ex + ( z - az ) * ez ) / l2 ) );
			if ( Math.hypot( x - ax - t * ex, z - az - t * ez ) < hw + clear ) return true;
		}
		return false;
	};

	const out = [];
	const cities = meta.cities || [];
	// the blocks of each city: grid cells whose four edges are streets
	const edges = cities.map( () => new Set() );
	const ek = ( i0, j0, i1, j1 ) => i0 < i1 || ( i0 === i1 && j0 < j1 ) ? `${i0},${j0},${i1},${j1}` : `${i1},${j1},${i0},${j0}`;
	for ( const st of meta.streets || [] ) {
		const c = cities[ st[ 0 ] ];
		if ( ! c || ! c.pu ) continue;
		const ca = Math.cos( c.angle ), sa = Math.sin( c.angle );
		const g = ( x, z ) => { const dx = x - c.x, dz = z - c.z; return [ Math.round( ( dx * ca + dz * sa ) / c.pu ), Math.round( ( - dx * sa + dz * ca ) / c.pv ) ]; };
		const [ i0, j0 ] = g( st[ 1 ], st[ 2 ] ), [ i1, j1 ] = g( st[ 4 ], st[ 5 ] );
		edges[ st[ 0 ] ].add( ek( i0, j0, i1, j1 ) );
	}
	cities.forEach( ( c, ci ) => {
		const zones = ZONES[ c.kind ];
		if ( ! zones || ! c.pu ) return;
		const E = edges[ ci ];
		const blocks = new Set();
		for ( const e of E ) {
			const [ i0, j0, i1, j1 ] = e.split( ',' ).map( Number );
			// a block has its low corner at (i, j): try the cells on both sides of this edge
			if ( j0 === j1 ) { blocks.add( `${Math.min( i0, i1 )},${j0}` ); blocks.add( `${Math.min( i0, i1 )},${j0 - 1}` ); } else { blocks.add( `${i0},${Math.min( j0, j1 )}` ); blocks.add( `${i0 - 1},${Math.min( j0, j1 )}` ); }
		}
		const ca = Math.cos( c.angle ), sa = Math.sin( c.angle );
		const toW = ( u, v ) => [ c.x + u * ca - v * sa, c.z + u * sa + v * ca ];
		const street = c.street || 10, walk = c.walk || 0;
		for ( const b of [ ...blocks ].sort() ) {
			const [ i, j ] = b.split( ',' ).map( Number );
			if ( ! ( E.has( ek( i, j, i + 1, j ) ) && E.has( ek( i, j + 1, i + 1, j + 1 ) ) && E.has( ek( i, j, i, j + 1 ) ) && E.has( ek( i + 1, j, i + 1, j + 1 ) ) ) ) continue;
			if ( STATS ) STATS.blocks = ( STATS.blocks || 0 ) + 1;
			const u0 = i * c.pu + street / 2 + walk, v0 = j * c.pv + street / 2 + walk;
			const W = c.pu - street - 2 * walk, Dd = c.pv - street - 2 * walk;
			const [ mx, mz ] = toW( u0 + W / 2, v0 + Dd / 2 );
			const dc = Math.hypot( mx - c.x, mz - c.z ) / Math.max( 1, c.radius );
			const zone = zones.find( z => dc < z[ 0 ] )[ 1 ];
			const R = rng( hash32( ci + 1, i * 977 + j * 131, 0x1f11 ) );
			// what is still free in this block, on a 2 m raster (u across, v deep): not taken by the baked buildings,
			// clear of the highways, on the ground
			const CS = 2, nu = Math.floor( W / CS ), nv = Math.floor( Dd / CS );
			const free = new Uint8Array( nu * nv );
			// the footprints and road chords that reach this block, burnt into the raster
			const rad = Math.hypot( W, Dd ) / 2 + 2;
			const near = ( map, pad ) => {
				const set = new Set();
				for ( let gi = Math.floor( ( mx - rad - pad ) / H ); gi <= Math.floor( ( mx + rad + pad ) / H ); gi ++ ) for ( let gj = Math.floor( ( mz - rad - pad ) / H ); gj <= Math.floor( ( mz + rad + pad ) / H ); gj ++ ) for ( const o of map.get( hk( gi, gj ) ) || [] ) set.add( o );
				return set;
			};
			free.fill( 1 );
			// world -> raster cell ranges of a disc / box around a point list
			const lu = ( x, z ) => ( x - c.x ) * ca + ( z - c.z ) * sa - u0, lv = ( x, z ) => - ( x - c.x ) * sa + ( z - c.z ) * ca - v0;
			const burn = ( pts, r, test ) => {
				let umin = Infinity, umax = - Infinity, vmin = Infinity, vmax = - Infinity;
				for ( let k = 0; k < pts.length; k += 2 ) { const u = lu( pts[ k ], pts[ k + 1 ] ), v = lv( pts[ k ], pts[ k + 1 ] ); umin = Math.min( umin, u ); umax = Math.max( umax, u ); vmin = Math.min( vmin, v ); vmax = Math.max( vmax, v ); }
				const a0 = Math.max( 0, Math.floor( ( umin - r ) / CS ) ), a1 = Math.min( nu - 1, Math.floor( ( umax + r ) / CS ) );
				const q0 = Math.max( 0, Math.floor( ( vmin - r ) / CS ) ), q1 = Math.min( nv - 1, Math.floor( ( vmax + r ) / CS ) );
				for ( let a = a0; a <= a1; a ++ ) for ( let q = q0; q <= q1; q ++ ) {
					if ( ! free[ a * nv + q ] ) continue;
					const u = u0 + ( a + 0.5 ) * CS, v = v0 + ( q + 0.5 ) * CS;
					if ( test( c.x + u * ca - v * sa, c.z + u * sa + v * ca ) ) free[ a * nv + q ] = 0;
				}
			};
			for ( const o of near( grid, 0 ) ) {
				const ex = Math.abs( o.c ) * o.hw + Math.abs( o.s ) * o.hd, ez = Math.abs( o.s ) * o.hw + Math.abs( o.c ) * o.hd;
				burn( [ o.x - ex, o.z - ez, o.x + ex, o.z - ez, o.x + ex, o.z + ez, o.x - ex, o.z + ez ], 0, ( x, z ) => { const dx = x - o.x, dz = z - o.z; return Math.abs( dx * o.c + dz * o.s ) < o.hw && Math.abs( - dx * o.s + dz * o.c ) < o.hd; } );
			}
			for ( const sg of near( segs, 12 ) ) {
				const [ ax, az, bx, bz, hw ] = sg, r = hw + 3;
				const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
				burn( [ ax, az, bx, bz ], r, ( x, z ) => { const t = Math.max( 0, Math.min( 1, ( ( x - ax ) * ex + ( z - az ) * ez ) / l2 ) ); const dx = x - ax - t * ex, dz = z - az - t * ez; return dx * dx + dz * dz < r * r; } );
			}
			let nFree = 0;
			for ( let k = 0; k < free.length; k ++ ) nFree += free[ k ];
			if ( nFree < 30 ) continue;
			const isFree = ( a0, a1, q0, q1 ) => {
				if ( a0 < 0 || q0 < 0 || a1 > nu || q1 > nv ) return false;
				for ( let a = a0; a < a1; a ++ ) for ( let q = q0; q < q1; q ++ ) if ( ! free[ a * nv + q ] ) return false;
				return true;
			};
			const take = ( a0, a1, q0, q1 ) => { for ( let a = Math.max( 0, a0 ); a < Math.min( nu, a1 ); a ++ ) for ( let q = Math.max( 0, q0 ); q < Math.min( nv, q1 ); q ++ ) free[ a * nv + q ] = 0; };
			// lots along both long streets, as deep as the free ground allows (up to half the block)
			const lots = [];
			const minW = zone === 'core' ? 18 : zone === 'resort' ? 22 : zone === 'commercial' ? 14 : 16;
			const maxW = zone === 'core' ? 30 : zone === 'resort' ? 34 : zone === 'commercial' ? 26 : 22;
			const minD = zone === 'residential' ? 14 : 12, half = Math.floor( nv / 2 );
			for ( const side of [ 0, 1 ] ) {
				let a = 0;
				while ( a < nu ) {
					const wc = Math.max( 3, Math.round( ( minW + R() * ( maxW - minW ) ) / CS ) );
					const a1 = Math.min( nu, a + wc );
					if ( ( a1 - a ) * CS < minW * 0.75 ) break;
					// the front strip must be free; then as deep as it stays free
					let dc = 0;
					while ( dc < half && ( side ? isFree( a, a1, nv - dc - 1, nv - dc ) : isFree( a, a1, dc, dc + 1 ) ) ) dc ++;
					if ( dc * CS < minD ) { a ++; continue; }
					lots.push( { u: u0 + a * CS, v: side ? v0 + ( nv - dc ) * CS : v0, w: ( a1 - a ) * CS, d: dc * CS, face: side ? 1 : - 1, big: zone === 'core' || zone === 'resort' } );
					take( a, a1, side ? nv - dc : 0, side ? nv : dc );
					a = a1;
				}
			}
			for ( const L of lots ) {
				const R2 = rng( hash32( ci + 1, Math.round( L.u * 10 ), Math.round( L.v * 10 ) ) );
				// a few lots stay open: car parks, a church yard, a patch of lawn
				if ( R2() < ( zone === 'residential' ? 0.1 : 0.12 ) ) continue;
				let type = zone === 'core' ? pickW( R2, CORE ) : zone === 'resort' ? ( R2() < 0.55 ? 'hotel' : 'apartment' ) : zone === 'commercial' ? pickW( R2, COMMERCIAL ) : ( R2() < 0.88 ? 'house' : 'apartment' );
				if ( c.kind === 'village' && ( type === 'office' || type === 'hotel' ) ) type = 'house';
				// footprint inside the lot (setbacks as the bake places buildings)
				let setF, setS, setB;
				if ( type === 'house' ) { setF = 4 + R2() * 3; setS = 2 + R2() * 1.5; setB = 3 + R2() * 3; } else { setF = L.big ? 3 : 1; setS = L.big ? 2 : 0.6; setB = L.big ? 3 : 2 + R2() * 3; }
				let w = L.w - setS * 2, d = L.d - setF - setB;
				if ( type === 'house' ) { w = Math.min( w, 9 + R2() * 6 ); d = Math.min( d, 8 + R2() * 5 ); }
				if ( w < 6 || d < 6 ) { if ( STATS ) STATS.small = ( STATS.small || 0 ) + 1; continue; }
				const cu = L.u + L.w / 2;
				const cv = L.face === 1 ? L.v + L.d - setF - d / 2 : L.v + setF + d / 2;
				const [ x, z ] = toW( cu, cv );
				const angle = c.angle + ( L.face === 1 ? Math.PI : 0 );
				const o = { x, z, hw: w / 2, hd: d / 2, c: Math.cos( angle ), s: Math.sin( angle ) };
				// dry, gentle ground
				let lo = Infinity, hi = - Infinity;
				for ( let a = - 1; a <= 1; a ++ ) for ( let q = - 1; q <= 1; q ++ ) {
					const h = hf.heightAt( x + a * w / 2 * o.c - q * d / 2 * o.s, z + a * w / 2 * o.s + q * d / 2 * o.c );
					lo = Math.min( lo, h ); hi = Math.max( hi, h );
				}
				if ( lo < 0.6 || hi - lo > 5 ) { if ( STATS ) STATS.ground = ( STATS.ground || 0 ) + 1; continue; }
				const floors = type === 'office' ? ( zone === 'core' ? 6 + Math.floor( R2() * 14 ) : 2 + Math.floor( R2() * 2 ) ) : type === 'apartment' ? ( zone === 'core' || zone === 'resort' ? 6 + Math.floor( R2() * 12 ) : 2 + Math.floor( R2() * 3 ) )
					: type === 'hotel' ? 5 + Math.floor( R2() * 12 ) : type === 'house' ? ( R2() < 0.3 ? 2 : 1 ) : 1;
				addRect( { ...o, hw: o.hw + 3, hd: o.hd + 3 } );
				out.push( x, z, w, d, angle, hi, lo, BT[ type ], floors, ci, Math.floor( R2() * 256 ) );
			}
		}
	} );
	for ( const v of out ) D.push( v );
	B.infill = { from: N0, count: out.length / NF };
	return B.infill;
}
