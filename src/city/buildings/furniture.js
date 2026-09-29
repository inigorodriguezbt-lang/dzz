// Room contents, built with the interior (worker side): furniture merged into the storey mesh, colliders,
// searchable containers, loot spots on tables, counters and shelves, beds and couches to sleep on, taps, candles,
// and the outbreak's dressing (blood, papers, tipped chairs). Pieces are drawn in a local frame: origin on the
// floor at the wall, x along the wall, +z out of the wall into the room.
import { F_IN, F_GLOW } from './geo.js';
import { L, hash32, DECAL } from './data.js';
import { M } from './plan.js';

const WALL_T = 0.25;
const MAX_SPOTS = 10; // loose loot spots per room

// materials (all interior)
const paint = ( c ) => M( L.plain, c, 1, F_IN );
const wood = ( c = [ 176, 132, 92 ] ) => M( L.wood, c, 1, F_IN );
const metal = ( c = [ 170, 172, 174 ] ) => M( L.metal, c, 1, F_IN );
const cloth = ( c ) => M( L.fabric, c, 0.8, F_IN );
const DARK = paint( [ 40, 40, 42 ] ), WHITE = paint( [ 236, 236, 232 ] ), STEEL = metal( [ 190, 192, 194 ] ), BLACK = paint( [ 22, 22, 24 ] );
const CHROME = metal( [ 220, 220, 222 ] ), PORCELAIN = M( L.plain, [ 244, 244, 240 ], 1, F_IN );
const SOFA = [ [ 120, 96, 80 ], [ 70, 90, 110 ], [ 150, 140, 120 ], [ 90, 110, 80 ], [ 140, 70, 60 ], [ 110, 110, 116 ] ];
const BLANKET = [ [ 180, 60, 60 ], [ 60, 90, 150 ], [ 220, 210, 190 ], [ 90, 130, 100 ], [ 200, 150, 60 ], [ 150, 110, 170 ], [ 240, 240, 236 ] ];
const WOODS = [ [ 176, 132, 92 ], [ 130, 90, 60 ], [ 200, 170, 130 ], [ 96, 64, 44 ] ];

// the loot table of a shop's floor by its kind
const SHOP_TABLE = {
	convenience: 'convenience', grocery: 'grocery', pharmacy: 'pharmacy', hardware: 'hardware', gunstore: 'gunstore', clothing: 'clothing_store',
	sports: 'sports', surf: 'surf', pawn: 'pawn', market: 'market', bank: 'bank', post: 'post', gas: 'gas_station', restaurant: 'restaurant',
	bar: 'bar', fastfood: 'fastfood', takeout: 'fastfood', bakery: 'fastfood', laundromat: 'trash', nails: 'trash', barber: 'trash', insurance: 'office',
	phone: 'office', vacant: 'trash',
};
const BIG_SHELVES = { grocery: 1, hardware: 1, market: 1, convenience: 1, pharmacy: 1, sports: 1, gas: 1 };

// ---- a local frame for one piece -------------------------------------------------------------------------------

function frame( O, x, y, z, rot ) {
	const cr = Math.cos( rot ), sr = Math.sin( rot );
	const T = ( lx, lz ) => [ x + lx * cr + lz * sr, z - lx * sr + lz * cr ];
	const g = O.g;
	const F = {
		O, x, y, z, rot, T,
		box( x0, y0, z0, x1, y1, z1, m, skip = 0 ) { g.push().translate( x, y, z ).rotY( rot ); g.box( x0, y0, z0, x1, y1, z1, m, skip ); g.pop(); return F; },
		cyl( cx, y0, cz, r, h, seg, m, caps = 3, r1 = r ) { g.push().translate( x, y, z ).rotY( rot ); g.cyl( cx, y0, cz, r, h, seg, m, caps, r1 ); g.pop(); return F; },
		// tilted box (tipped chairs, leaning boards): rotation about local x then z around the box centre
		tilt( cx, cy, cz, hx, hy, hz, ax, az, m ) { g.push().translate( x, y, z ).rotY( rot ).translate( cx, cy, cz ).rotX( ax ).rotZ( az ); g.box( - hx, - hy, - hz, hx, hy, hz, m ); g.pop(); return F; },
		col( x0, y0, z0, x1, y1, z1, mat = 1, kind = 0 ) {
			const [ cx, cz ] = T( ( x0 + x1 ) / 2, ( z0 + z1 ) / 2 );
			O.colR( cx, y + ( y0 + y1 ) / 2, cz, Math.abs( x1 - x0 ) / 2, Math.abs( y1 - y0 ) / 2, Math.abs( z1 - z0 ) / 2, rot, mat, kind );
			return F;
		},
		// a searchable container over the local box
		container( x0, y0, z0, x1, y1, z1, label, table, cap = 12, o = {} ) {
			if ( ! table ) return F;
			const [ cx, cz ] = T( ( x0 + x1 ) / 2, ( z0 + z1 ) / 2 );
			O.containers.push( {
				key: `${O.P.bid}:${O.si}:c${O.containers.length}`, label, table, cap, locked: o.locked || 0, n: o.n ?? null, empty: o.empty ?? 0.22,
				cx, cy: y + ( y0 + y1 ) / 2, cz, hx: Math.abs( x1 - x0 ) / 2 + 0.03, hy: Math.abs( y1 - y0 ) / 2 + 0.03, hz: Math.abs( z1 - z0 ) / 2 + 0.03, yaw: rot,
			} );
			return F;
		},
		// a place where a loose item may lie (chance p)
		spot( lx, ly, lz, table, p = 0.5 ) {
			if ( ! table || O.R() > p || ( O.roomSpots || 0 ) >= MAX_SPOTS ) return F;
			O.roomSpots = ( O.roomSpots || 0 ) + 1;
			const [ sx, sz ] = T( lx, lz );
			O.spots.push( { key: `${O.P.bid}:${O.si}:s${O.spots.length}`, x: sx, y: y + ly, z: sz, yaw: O.R() * Math.PI * 2, table } );
			return F;
		},
		bed( x0, y0, z0, x1, y1, z1, q = 1, label = 'Sleep' ) {
			const [ cx, cz ] = T( ( x0 + x1 ) / 2, ( z0 + z1 ) / 2 );
			O.beds.push( { key: `${O.P.bid}:${O.si}:b${O.beds.length}`, q, label, cx, cy: y + ( y0 + y1 ) / 2, cz, hx: Math.abs( x1 - x0 ) / 2, hy: Math.abs( y1 - y0 ) / 2 + 0.05, hz: Math.abs( z1 - z0 ) / 2, yaw: rot } );
			return F;
		},
		tap( lx, ly, lz ) {
			const [ tx, tz ] = T( lx, lz );
			O.taps.push( { key: `${O.P.bid}:${O.si}:t${O.taps.length}`, x: tx, y: y + ly, z: tz } );
			return F;
		},
		light( lx, ly, lz, kind = 'candle' ) {
			const [ lxw, lzw ] = T( lx, lz );
			const wax = M( L.plain, [ 240, 230, 200 ], 1, F_IN );
			const flame = M( L.plain, [ 255, 170, 70 ], 1, F_IN | F_GLOW );
			if ( kind === 'lantern' ) {
				F.cyl( lx, ly, lz, 0.08, 0.04, 8, DARK ).cyl( lx, ly + 0.04, lz, 0.06, 0.16, 8, flame ).cyl( lx, ly + 0.2, lz, 0.07, 0.05, 8, DARK, 1, 0.02 );
			} else {
				F.cyl( lx, ly, lz, 0.035, 0.12, 6, wax ).cyl( lx, ly + 0.12, lz, 0.012, 0.035, 4, flame, 1, 0.002 );
			}
			O.lights.push( { x: lxw, y: y + ly + 0.15, z: lzw, kind } );
			return F;
		},
	};
	return F;
}

// ---- the room: usable rect, walls, openings ---------------------------------------------------------------------

function roomCtx( O, P, st, rm ) {
	const inset = [ 0.07, 0.07, 0.07, 0.07 ];
	for ( const f of st.facades ) if ( f.inside === rm ) inset[ f.side ] = WALL_T + 0.02;
	for ( const w of st.walls ) {
		if ( w.A === rm ) inset[ w.axis === 'x' ? 2 : 1 ] = Math.max( inset[ w.axis === 'x' ? 2 : 1 ], w.t / 2 + 0.02 );
		else if ( w.B === rm ) inset[ w.axis === 'x' ? 0 : 3 ] = Math.max( inset[ w.axis === 'x' ? 0 : 3 ], w.t / 2 + 0.02 );
	}
	const C = {
		rm, st, P, O,
		x0: rm.x0 + inset[ 3 ], x1: rm.x1 - inset[ 1 ], z0: rm.z0 + inset[ 0 ], z1: rm.z1 - inset[ 2 ],
		blocked: [ [], [], [], [] ], // per side: [ a0, a1, maxH ] (maxH = Infinity: nothing fits)
		clear: [], // rects kept free in the room (door swings, walkways)
		used: [], // footprints of placed pieces
	};
	C.w = C.x1 - C.x0; C.d = C.z1 - C.z0;
	const addOpening = ( side, a0, a1, deep = 1.0 ) => {
		C.blocked[ side ].push( [ a0 - 0.18, a1 + 0.18, - 1 ] );
		if ( side === 0 ) C.clear.push( [ a0 - 0.1, C.z0, a1 + 0.1, C.z0 + deep ] );
		else if ( side === 2 ) C.clear.push( [ a0 - 0.1, C.z1 - deep, a1 + 0.1, C.z1 ] );
		else if ( side === 3 ) C.clear.push( [ C.x0, a0 - 0.1, C.x0 + deep, a1 + 0.1 ] );
		else C.clear.push( [ C.x1 - deep, a0 - 0.1, C.x1, a1 + 0.1 ] );
	};
	for ( const w of st.walls ) {
		const side = w.A === rm ? ( w.axis === 'x' ? 2 : 1 ) : w.B === rm ? ( w.axis === 'x' ? 0 : 3 ) : - 1;
		if ( side < 0 ) continue;
		const base = w.axis === 'x' ? w.x0 : w.z0;
		for ( const op of w.ops ) addOpening( side, base + op.c - op.w / 2, base + op.c + op.w / 2, op.w + 0.3 );
	}
	for ( const f of st.facades ) {
		if ( f.inside !== rm ) continue;
		const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
		const along = ( u ) => Math.abs( tx ) > 0.5 ? f.ax + tx * u : f.az + tz * u;
		for ( const p of f.pieces ) {
			if ( p.door ) { const a = along( p.door.u - p.door.w / 2 ), b = along( p.door.u + p.door.w / 2 ); addOpening( f.side, Math.min( a, b ), Math.max( a, b ), Math.min( 1.6, p.door.w + 0.4 ) ); continue; }
			if ( ! p.win ) continue;
			const n = Math.max( 1, Math.round( ( p.a1 - p.a0 ) / p.win.bay ) );
			for ( let bi = 0; bi < n; bi ++ ) {
				const u = p.a0 + ( bi + 0.5 ) * p.win.bay;
				const a = along( u - p.win.w / 2 ), b = along( u + p.win.w / 2 );
				C.blocked[ f.side ].push( [ Math.min( a, b ) - 0.05, Math.max( a, b ) + 0.05, p.win.sill - 0.04 ] );
			}
		}
	}
	// open-plan edges to neighbours: keep them clear
	for ( const l of st.links ) {
		if ( l.kind !== 'open' || ( l.a !== rm && l.b !== rm ) ) continue;
		const o = l.a === rm ? l.b : l.a;
		if ( Math.abs( o.z1 - rm.z0 ) < 0.05 ) addOpening( 0, Math.max( rm.x0, o.x0 ), Math.min( rm.x1, o.x1 ), 0.9 );
		if ( Math.abs( o.z0 - rm.z1 ) < 0.05 ) addOpening( 2, Math.max( rm.x0, o.x0 ), Math.min( rm.x1, o.x1 ), 0.9 );
		if ( Math.abs( o.x1 - rm.x0 ) < 0.05 ) addOpening( 3, Math.max( rm.z0, o.z0 ), Math.min( rm.z1, o.z1 ), 0.9 );
		if ( Math.abs( o.x0 - rm.x1 ) < 0.05 ) addOpening( 1, Math.max( rm.z0, o.z0 ), Math.min( rm.z1, o.z1 ), 0.9 );
	}
	return C;
}

const overlaps = ( a, b ) => a[ 0 ] < b[ 2 ] && a[ 2 ] > b[ 0 ] && a[ 1 ] < b[ 3 ] && a[ 3 ] > b[ 1 ];

// footprint rect [ x0, z0, x1, z1 ] of a wall piece
function wallRect( C, side, a, w, d ) {
	if ( side === 0 ) return [ a - w / 2, C.z0, a + w / 2, C.z0 + d ];
	if ( side === 2 ) return [ a - w / 2, C.z1 - d, a + w / 2, C.z1 ];
	if ( side === 3 ) return [ C.x0, a - w / 2, C.x0 + d, a + w / 2 ];
	return [ C.x1 - d, a - w / 2, C.x1, a + w / 2 ];
}

// find room for a piece against a wall: w wide, d deep, h high. sides in order of preference.
// Returns a frame or null. at: 'corner' | 'centre' | 'any'
function onWall( C, w, d, h, sides = [ 0, 1, 2, 3 ], at = 'any' ) {
	const R = C.O.R;
	for ( const side of sides ) {
		const lo = side === 0 || side === 2 ? C.x0 : C.z0, hi = side === 0 || side === 2 ? C.x1 : C.z1;
		const depthMax = side === 0 || side === 2 ? C.d : C.w;
		if ( d > depthMax - 0.6 || w > hi - lo ) continue;
		// candidate positions along the wall
		const cands = [];
		const n = Math.max( 1, Math.floor( ( hi - lo - w ) / 0.25 ) );
		for ( let k = 0; k <= n; k ++ ) cands.push( lo + w / 2 + ( hi - lo - w ) * ( n ? k / n : 0.5 ) );
		if ( at === 'centre' ) cands.sort( ( p, q ) => Math.abs( p - ( lo + hi ) / 2 ) - Math.abs( q - ( lo + hi ) / 2 ) );
		else if ( at === 'corner' ) cands.sort( ( p, q ) => Math.min( p - lo, hi - p ) - Math.min( q - lo, hi - q ) );
		else for ( let i = cands.length - 1; i > 0; i -- ) { const j = Math.floor( R() * ( i + 1 ) ); [ cands[ i ], cands[ j ] ] = [ cands[ j ], cands[ i ] ]; }
		for ( const a of cands ) {
			const a0 = a - w / 2, a1 = a + w / 2;
			if ( C.blocked[ side ].some( b => b[ 0 ] < a1 && b[ 1 ] > a0 && ( b[ 2 ] < 0 || h > b[ 2 ] ) ) ) continue;
			const r = wallRect( C, side, a, w, d );
			if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
			C.used.push( r );
			return frameOnWall( C, side, a );
		}
	}
	return null;
}

function frameOnWall( C, side, a ) {
	const y = C.st.y;
	if ( side === 0 ) return frame( C.O, a, y, C.z0, 0 );
	if ( side === 2 ) return frame( C.O, a, y, C.z1, Math.PI );
	if ( side === 3 ) return frame( C.O, C.x0, y, a, Math.PI / 2 );
	return frame( C.O, C.x1, y, a, - Math.PI / 2 );
}

// a free spot for a free-standing piece (w along its local x, d along local z), anywhere in the room
function inRoom( C, w, d, margin = 0.6, tries = 24, rotFree = true ) {
	const R = C.O.R;
	for ( let t = 0; t < tries; t ++ ) {
		const rot = rotFree && R() < 0.5 ? Math.PI / 2 : 0;
		const ew = rot ? d : w, ed = rot ? w : d;
		const x = C.x0 + margin + ew / 2 + R() * Math.max( 0, C.w - 2 * margin - ew );
		const z = C.z0 + margin + ed / 2 + R() * Math.max( 0, C.d - 2 * margin - ed );
		if ( ew + 2 * margin > C.w + 0.01 || ed + 2 * margin > C.d + 0.01 ) return null;
		const r = [ x - ew / 2, z - ed / 2, x + ew / 2, z + ed / 2 ];
		const rr = [ r[ 0 ] - 0.3, r[ 1 ] - 0.3, r[ 2 ] + 0.3, r[ 3 ] + 0.3 ];
		if ( C.used.some( u => overlaps( u, rr ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
		C.used.push( r );
		return frame( C.O, x, C.st.y, z, rot );
	}
	return null;
}
// the room centre (tables, beds in the middle)
function centre( C, w, d, rot = 0 ) {
	const x = ( C.x0 + C.x1 ) / 2, z = ( C.z0 + C.z1 ) / 2;
	const ew = rot ? d : w, ed = rot ? w : d;
	const r = [ x - ew / 2, z - ed / 2, x + ew / 2, z + ed / 2 ];
	if ( ew > C.w - 1.0 || ed > C.d - 1.0 || C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) return null;
	C.used.push( r );
	return frame( C.O, x, C.st.y, z, rot );
}

// ---- pieces (local frame: x along the wall, z into the room, y up) ------------------------------------------------

function legs( F, x0, z0, x1, z1, h, m, t = 0.05 ) {
	F.box( x0, 0, z0, x0 + t, h, z0 + t, m, 12 ).box( x1 - t, 0, z0, x1, h, z0 + t, m, 12 ).box( x0, 0, z1 - t, x0 + t, h, z1, m, 12 ).box( x1 - t, 0, z1 - t, x1, h, z1, m, 12 );
}

function table( F, w, d, h = 0.75, m = wood( WOODS[ 0 ] ), lootTable = null, p = 0.5 ) {
	F.box( - w / 2, h - 0.04, 0, w / 2, h, d, m );
	legs( F, - w / 2 + 0.04, 0.04, w / 2 - 0.04, d - 0.04, h - 0.04, m );
	F.col( - w / 2, 0, 0, w / 2, h, d, 1, 2 );
	if ( lootTable ) { F.spot( ( F.O.R() - 0.5 ) * w * 0.6, h, d * ( 0.3 + F.O.R() * 0.4 ), lootTable, p ); }
	return F;
}

function chair( F, m = wood( WOODS[ 1 ] ), tipped = false ) {
	if ( tipped ) {
		// knocked over on its back
		F.tilt( 0, 0.24, 0.25, 0.22, 0.02, 0.22, Math.PI / 2, 0, m );
		F.tilt( 0, 0.02, 0.55, 0.22, 0.02, 0.25, 0, 0, m );
		F.box( - 0.2, 0.02, 0.1, - 0.16, 0.46, 0.14, m ).box( 0.16, 0.02, 0.1, 0.2, 0.46, 0.14, m );
		return F;
	}
	F.box( - 0.22, 0.44, - 0.22, 0.22, 0.48, 0.22, m );
	legs( F, - 0.22, - 0.22, 0.22, 0.22, 0.44, m, 0.04 );
	F.box( - 0.22, 0.48, - 0.24, 0.22, 0.95, - 0.2, m );
	F.col( - 0.22, 0, - 0.24, 0.22, 0.5, 0.22, 1, 2 );
	return F;
}

function sofa( F, w, c ) {
	const m = cloth( c ), base = cloth( [ c[ 0 ] * 0.8, c[ 1 ] * 0.8, c[ 2 ] * 0.8 ] );
	F.box( - w / 2, 0.08, 0, w / 2, 0.42, 0.88, base );
	F.box( - w / 2, 0.42, 0, w / 2, 0.85, 0.22, m );
	F.box( - w / 2, 0.42, 0.22, - w / 2 + 0.18, 0.62, 0.88, m ).box( w / 2 - 0.18, 0.42, 0.22, w / 2, 0.62, 0.88, m );
	const n = Math.max( 1, Math.round( ( w - 0.36 ) / 0.62 ) );
	for ( let i = 0; i < n; i ++ ) {
		const a = - w / 2 + 0.18 + ( w - 0.36 ) * i / n, b = a + ( w - 0.36 ) / n;
		F.box( a + 0.01, 0.42, 0.22, b - 0.01, 0.52, 0.86, m );
	}
	F.box( - w / 2 + 0.05, 0, 0.05, - w / 2 + 0.1, 0.08, 0.1, DARK ).box( w / 2 - 0.1, 0, 0.05, w / 2 - 0.05, 0.08, 0.1, DARK );
	F.col( - w / 2, 0, 0, w / 2, 0.52, 0.88, 1, 2 ).col( - w / 2, 0.52, 0, w / 2, 0.85, 0.22, 1, 2 );
	F.bed( - w / 2, 0, 0, w / 2, 0.55, 0.88, 0.65, 'Sleep' );
	F.spot( ( F.O.R() - 0.5 ) * w * 0.5, 0.52, 0.55, 'house_living', 0.2 );
	return F;
}

function bed( F, w, len, c, frameM = wood( WOODS[ ( F.O.R() * 4 ) | 0 ] ), q = 1 ) {
	const blanket = cloth( c ), sheet = cloth( [ 238, 236, 228 ] );
	F.box( - w / 2 - 0.04, 0, 0, w / 2 + 0.04, 1.0, 0.06, frameM ); // headboard
	F.box( - w / 2, 0.12, 0.06, w / 2, 0.32, len, frameM );
	F.box( - w / 2 + 0.03, 0.32, 0.08, w / 2 - 0.03, 0.52, len - 0.02, sheet );
	// blanket, turned back at the head, slept in (a little crumpled)
	const t = F.O.R() * 0.3;
	F.box( - w / 2 + 0.01, 0.46 + t * 0.05, 0.5 + t, w / 2 - 0.01, 0.55, len, blanket );
	const np = w > 1.2 ? 2 : 1;
	for ( let i = 0; i < np; i ++ ) {
		const cx = np === 1 ? 0 : ( i ? w / 4 : - w / 4 );
		F.box( cx - 0.3, 0.52, 0.12, cx + 0.3, 0.64, 0.45, sheet );
	}
	F.col( - w / 2, 0, 0, w / 2, 0.55, len, 1, 2 );
	F.bed( - w / 2, 0, 0, w / 2, 0.6, len, q, 'Sleep' );
	return F;
}

function nightstand( F, loot = 'house_bedroom' ) {
	const m = wood( WOODS[ 2 ] );
	F.box( - 0.23, 0, 0, 0.23, 0.55, 0.42, m );
	F.box( - 0.19, 0.3, 0.42, 0.19, 0.31, 0.425, DARK ).box( - 0.04, 0.4, 0.42, 0.04, 0.42, 0.44, CHROME );
	F.col( - 0.23, 0, 0, 0.23, 0.55, 0.42, 1, 2 );
	F.container( - 0.23, 0, 0, 0.23, 0.55, 0.42, 'Nightstand', loot, 6, { n: 1, empty: 0.35 } );
	// a lamp
	F.cyl( - 0.08, 0.55, 0.2, 0.06, 0.25, 8, CHROME ).cyl( - 0.08, 0.8, 0.2, 0.15, 0.18, 10, cloth( [ 230, 220, 190 ] ), 0, 0.1 );
	F.spot( 0.1, 0.55, 0.22, loot, 0.25 );
	return F;
}

function wardrobe( F, w = 1.2, loot = 'wardrobe', label = 'Wardrobe' ) {
	const m = wood( WOODS[ ( F.O.R() * 4 ) | 0 ] );
	F.box( - w / 2, 0, 0, w / 2, 2.0, 0.6, m );
	F.box( - 0.005, 0.1, 0.6, 0.005, 1.95, 0.605, DARK );
	F.box( - 0.08, 1.0, 0.6, - 0.05, 1.2, 0.63, CHROME ).box( 0.05, 1.0, 0.6, 0.08, 1.2, 0.63, CHROME );
	F.col( - w / 2, 0, 0, w / 2, 2.0, 0.6, 1 );
	F.container( - w / 2, 0, 0, w / 2, 2.0, 0.6, label, loot, 40 );
	return F;
}

function dresser( F, w = 1.1, loot = 'house_bedroom' ) {
	const m = wood( WOODS[ ( F.O.R() * 4 ) | 0 ] );
	F.box( - w / 2, 0, 0, w / 2, 0.85, 0.48, m );
	for ( let k = 0; k < 3; k ++ ) {
		const y = 0.1 + k * 0.25;
		F.box( - w / 2 + 0.04, y + 0.22, 0.48, w / 2 - 0.04, y + 0.23, 0.485, DARK );
		F.box( - 0.08, y + 0.1, 0.48, 0.08, y + 0.12, 0.5, CHROME );
	}
	F.col( - w / 2, 0, 0, w / 2, 0.85, 0.48, 1, 2 );
	F.container( - w / 2, 0, 0, w / 2, 0.85, 0.48, 'Drawers', loot, 16 );
	F.spot( ( F.O.R() - 0.5 ) * w * 0.6, 0.85, 0.25, loot, 0.35 );
	return F;
}

function desk( F, w = 1.3, loot = 'desk', withChair = true, pc = true ) {
	const m = wood( WOODS[ ( F.O.R() * 4 ) | 0 ] );
	F.box( - w / 2, 0.72, 0, w / 2, 0.76, 0.7, m );
	F.box( w / 2 - 0.42, 0, 0.02, w / 2 - 0.02, 0.72, 0.68, m );
	F.box( - w / 2 + 0.02, 0, 0.02, - w / 2 + 0.06, 0.72, 0.68, m );
	for ( let k = 0; k < 3; k ++ ) F.box( w / 2 - 0.4, 0.08 + k * 0.21, 0.68, w / 2 - 0.04, 0.09 + k * 0.21, 0.685, DARK );
	F.col( - w / 2, 0, 0, w / 2, 0.76, 0.7, 1, 2 );
	F.container( w / 2 - 0.42, 0, 0, w / 2, 0.72, 0.7, 'Desk', loot, 12, { n: 1 } );
	if ( pc ) {
		F.box( - 0.25, 0.76, 0.1, 0.25, 1.08, 0.13, BLACK ).box( - 0.04, 0.76, 0.13, 0.04, 0.9, 0.2, BLACK );
		F.box( - 0.22, 0.76, 0.35, 0.22, 0.78, 0.5, paint( [ 60, 60, 64 ] ) );
	}
	// papers
	F.box( - w / 2 + 0.1, 0.76, 0.3, - w / 2 + 0.4, 0.77, 0.6, WHITE );
	F.spot( - w / 2 + 0.3, 0.76, 0.45, loot === 'desk' ? 'office' : loot, 0.3 );
	if ( withChair ) {
		// an office chair pushed back (sometimes knocked over)
		const cm = cloth( [ 50, 52, 58 ] );
		const cx = ( F.O.R() - 0.5 ) * 0.3, cz = 0.95 + F.O.R() * 0.2;
		if ( F.O.R() < 0.12 ) F.tilt( cx, 0.28, cz, 0.25, 0.28, 0.06, Math.PI / 2 - 0.2, 0.3, cm );
		else {
			F.box( cx - 0.25, 0.45, cz - 0.25, cx + 0.25, 0.53, cz + 0.25, cm ).box( cx - 0.23, 0.53, cz + 0.2, cx + 0.23, 1.05, cz + 0.27, cm );
			F.cyl( cx, 0.05, cz, 0.03, 0.4, 6, BLACK ).box( cx - 0.28, 0, cz - 0.03, cx + 0.28, 0.05, cz + 0.03, BLACK ).box( cx - 0.03, 0, cz - 0.28, cx + 0.03, 0.05, cz + 0.28, BLACK );
			F.col( cx - 0.25, 0, cz - 0.25, cx + 0.25, 0.55, cz + 0.25, 1, 2 );
		}
	}
	return F;
}

// shelving along a wall: a frame, shelves, and a textured face of products or books
function shelves( F, w, h = 1.9, d = 0.45, face = 'products', loot = null, label = 'Shelf', cont = true, pSpot = 0.25 ) {
	const fm = face === 'books' ? wood( WOODS[ 3 ] ) : metal( [ 196, 198, 200 ] );
	const n = Math.max( 2, Math.round( h / 0.42 ) );
	F.box( - w / 2, 0, 0, w / 2, h, 0.02, fm );
	F.box( - w / 2, 0, 0, - w / 2 + 0.03, h, d, fm ).box( w / 2 - 0.03, 0, 0, w / 2, h, d, fm );
	for ( let k = 0; k <= n; k ++ ) F.box( - w / 2 + 0.03, k * h / n - 0.02, 0, w / 2 - 0.03, k * h / n + 0.01, d, fm, 0 );
	if ( face ) {
		// the goods: a slab of texture set back a little from the shelf edge
		const L2 = face === 'books' ? L.books : L.products;
		const tm = M( L2, [ 255, 255, 255 ], 1, F_IN, { fit: [ 0, 0, w / 1.2, h / 1.6 ] } );
		F.box( - w / 2 + 0.04, 0.02, 0.03, w / 2 - 0.04, h - 0.06, d - 0.08, { pz: tm }, 1 + 2 + 4 + 8 + 32 );
	}
	// the collider stops short of the shelf edge so loose items on the boards stay reachable
	F.col( - w / 2, 0, 0, w / 2, h, d - 0.13, face === 'books' ? 1 : 2 );
	if ( cont && loot ) F.container( - w / 2, 0, 0, w / 2, h, d - 0.16, label, loot, 30 );
	if ( loot ) for ( let k = 1; k < n; k ++ ) F.spot( ( F.O.R() - 0.5 ) * ( w - 0.3 ), k * h / n + 0.01, d - 0.06, loot, pSpot );
	return F;
}

function kitchenRun( F, len, withUpper = true, loot = 'house_kitchen', steel = false ) {
	const body = steel ? STEEL : paint( [ [ 238, 236, 228 ], [ 150, 110, 76 ], [ 90, 110, 100 ], [ 200, 190, 170 ] ][ ( F.O.R() * 4 ) | 0 ] );
	const top = steel ? STEEL : M( L.terrazzo, [ 220, 214, 204 ], 1.5, F_IN );
	F.box( - len / 2, 0.1, 0, len / 2, 0.88, 0.58, body );
	F.box( - len / 2, 0, 0.05, len / 2, 0.1, 0.52, BLACK );
	F.box( - len / 2, 0.88, 0, len / 2, 0.92, 0.62, top );
	F.col( - len / 2, 0, 0, len / 2, 0.92, 0.62, 1, 2 );
	const n = Math.max( 1, Math.round( len / 0.6 ) ), cw = len / n;
	// the sink sits a third along, the stove further on
	const si = Math.min( n - 1, Math.floor( n / 3 ) ), so = n > 2 ? Math.min( n - 1, si + 2 ) : - 1;
	for ( let i = 0; i < n; i ++ ) {
		const a = - len / 2 + i * cw, b = a + cw;
		F.box( a + 0.005, 0.12, 0.58, a + 0.01, 0.86, 0.585, DARK );
		F.box( ( a + b ) / 2 - 0.08, 0.75, 0.58, ( a + b ) / 2 + 0.08, 0.77, 0.6, CHROME );
		if ( i === si ) {
			F.box( a + 0.06, 0.8, 0.12, b - 0.06, 0.925, 0.5, STEEL, 4 );
			F.box( a + 0.08, 0.8, 0.14, b - 0.08, 0.81, 0.48, paint( [ 90, 92, 96 ] ) );
			F.cyl( ( a + b ) / 2, 0.92, 0.07, 0.02, 0.25, 6, CHROME ).box( ( a + b ) / 2 - 0.015, 1.12, 0.07, ( a + b ) / 2 + 0.015, 1.15, 0.25, CHROME );
			F.tap( ( a + b ) / 2, 1.0, 0.3 );
		} else if ( i === so ) {
			F.box( a + 0.02, 0.92, 0.04, b - 0.02, 0.94, 0.58, BLACK );
			for ( const [ bx, bz ] of [ [ 0.3, 0.18 ], [ 0.7, 0.18 ], [ 0.3, 0.42 ], [ 0.7, 0.42 ] ] ) F.cyl( a + cw * bx, 0.94, bz, 0.08, 0.01, 10, DARK );
			F.box( a + 0.04, 0.2, 0.58, b - 0.04, 0.7, 0.59, BLACK ).box( a + 0.06, 0.72, 0.585, b - 0.06, 0.74, 0.61, CHROME );
		} else if ( i % 2 === 0 || n <= 2 ) {
			F.container( a, 0.1, 0, b, 0.88, 0.58, steel ? 'Cabinet' : 'Cabinet', loot, 20 );
			F.spot( ( a + b ) / 2, 0.92, 0.3, loot, 0.3 );
		}
	}
	if ( withUpper ) {
		F.box( - len / 2, 1.45, 0, len / 2, 2.15, 0.34, body );
		for ( let i = 0; i < n; i ++ ) F.box( - len / 2 + i * cw + 0.005, 1.47, 0.34, - len / 2 + i * cw + 0.01, 2.13, 0.345, DARK );
		F.col( - len / 2, 1.45, 0, len / 2, 2.15, 0.34, 1, 2 );
		if ( n >= 3 ) F.container( - len / 2, 1.45, 0, - len / 2 + cw * 2, 2.15, 0.34, 'Cabinet', loot, 10, { n: 1 } );
	}
	return F;
}

function fridge( F, loot = 'fridge', steel = false ) {
	const m = steel ? STEEL : paint( F.O.R() < 0.5 ? [ 238, 238, 234 ] : [ 190, 192, 194 ] );
	F.box( - 0.38, 0, 0, 0.38, 1.8, 0.72, m );
	F.box( - 0.36, 1.18, 0.72, 0.36, 1.19, 0.725, DARK );
	F.box( 0.28, 0.8, 0.72, 0.31, 1.1, 0.76, CHROME ).box( 0.28, 1.3, 0.72, 0.31, 1.6, 0.76, CHROME );
	F.col( - 0.38, 0, 0, 0.38, 1.8, 0.72, 2 );
	F.container( - 0.38, 0, 0, 0.38, 1.8, 0.72, 'Fridge', loot, 30 );
	return F;
}

function toilet( F ) {
	F.box( - 0.2, 0, 0, 0.2, 0.75, 0.2, PORCELAIN );
	F.box( - 0.18, 0, 0.2, 0.18, 0.4, 0.62, PORCELAIN );
	F.box( - 0.19, 0.4, 0.22, 0.19, 0.43, 0.66, WHITE );
	F.col( - 0.2, 0, 0, 0.2, 0.45, 0.66, 1, 2 );
	return F;
}

function basin( F, loot = 'medicine_cabinet', mirror = true ) {
	F.box( - 0.3, 0.72, 0, 0.3, 0.86, 0.48, PORCELAIN );
	F.box( - 0.25, 0.8, 0.05, 0.25, 0.87, 0.42, paint( [ 200, 204, 206 ] ), 4 );
	F.box( - 0.06, 0, 0.1, 0.06, 0.72, 0.22, PORCELAIN );
	F.cyl( 0, 0.86, 0.06, 0.02, 0.16, 6, CHROME ).box( - 0.015, 0.99, 0.06, 0.015, 1.02, 0.2, CHROME );
	F.tap( 0, 0.95, 0.2 );
	F.col( - 0.3, 0, 0, 0.3, 0.86, 0.48, 1, 2 );
	if ( mirror ) {
		F.box( - 0.3, 1.15, 0, 0.3, 1.8, 0.12, paint( [ 230, 230, 226 ] ) );
		F.box( - 0.27, 1.18, 0.12, 0.27, 1.77, 0.125, metal( [ 200, 214, 220 ] ) );
		if ( loot ) F.container( - 0.3, 1.15, 0, 0.3, 1.8, 0.14, 'Medicine cabinet', loot, 6 );
	}
	F.spot( 0.18, 0.86, 0.3, loot === 'medicine_cabinet' ? 'house_bathroom' : loot, 0.25 );
	return F;
}

function bathtub( F, len = 1.6 ) {
	F.box( - len / 2, 0, 0, len / 2, 0.55, 0.75, PORCELAIN, 4 );
	F.box( - len / 2 + 0.06, 0.1, 0.06, len / 2 - 0.06, 0.55, 0.69, paint( [ 220, 224, 226 ] ), 4 );
	F.box( - len / 2, 0.52, 0, len / 2, 0.55, 0.06, PORCELAIN ).box( - len / 2, 0.52, 0.69, len / 2, 0.55, 0.75, PORCELAIN );
	F.box( - len / 2, 0.52, 0, - len / 2 + 0.06, 0.55, 0.75, PORCELAIN ).box( len / 2 - 0.06, 0.52, 0, len / 2, 0.55, 0.75, PORCELAIN );
	F.cyl( - len / 2 + 0.15, 0.55, 0.05, 0.02, 0.35, 6, CHROME );
	F.tap( - len / 2 + 0.15, 0.7, 0.2 );
	F.col( - len / 2, 0, 0, len / 2, 0.55, 0.75, 1, 2 );
	return F;
}

function tv( F, w = 1.4 ) {
	const m = wood( WOODS[ 3 ] );
	F.box( - w / 2, 0, 0, w / 2, 0.5, 0.45, m );
	F.box( - 0.55, 0.5, 0.15, 0.55, 1.15, 0.2, BLACK ).box( - 0.1, 0.5, 0.12, 0.1, 0.53, 0.3, BLACK );
	F.col( - w / 2, 0, 0, w / 2, 0.5, 0.45, 1, 2 );
	F.container( - w / 2, 0, 0, w / 2, 0.5, 0.45, 'Cabinet', 'house_living', 8, { n: 1, empty: 0.4 } );
	return F;
}

function lockers( F, n, loot, label = 'Locker', c = [ 90, 110, 130 ] ) {
	const m = metal( c ), w = n * 0.42;
	F.box( - w / 2, 0, 0, w / 2, 1.9, 0.5, m );
	for ( let i = 0; i < n; i ++ ) {
		const a = - w / 2 + i * 0.42;
		F.box( a + 0.005, 0.05, 0.5, a + 0.01, 1.85, 0.505, DARK );
		for ( let k = 0; k < 4; k ++ ) F.box( a + 0.12, 1.6 + k * 0.04, 0.5, a + 0.3, 1.615 + k * 0.04, 0.505, DARK );
		F.box( a + 0.33, 0.95, 0.5, a + 0.36, 1.05, 0.52, CHROME );
	}
	F.col( - w / 2, 0, 0, w / 2, 1.9, 0.5, 2 );
	for ( let i = 0; i < n; i += 2 ) F.container( - w / 2 + i * 0.42, 0, 0, - w / 2 + Math.min( n, i + 2 ) * 0.42, 1.9, 0.5, label, loot, 30, { n: 1 } );
	return F;
}

function bunk( F, loot = 'military_locker', double = true ) {
	const fm = metal( [ 70, 84, 64 ] ), mat = cloth( [ 110, 116, 90 ] ), sheet = cloth( [ 214, 210, 196 ] );
	const L2 = 2.0, w = 0.9;
	for ( const [ px, pz ] of [ [ - w / 2, 0 ], [ w / 2 - 0.05, 0 ], [ - w / 2, L2 - 0.05 ], [ w / 2 - 0.05, L2 - 0.05 ] ] ) F.box( px, 0, pz, px + 0.05, double ? 1.7 : 0.8, pz + 0.05, fm );
	for ( const y of double ? [ 0.35, 1.3 ] : [ 0.35 ] ) {
		F.box( - w / 2, y, 0, w / 2, y + 0.06, L2, fm );
		F.box( - w / 2 + 0.03, y + 0.06, 0.02, w / 2 - 0.03, y + 0.2, L2 - 0.02, mat );
		F.box( - w / 2 + 0.03, y + 0.2, 0.9, w / 2 - 0.03, y + 0.23, L2 - 0.02, sheet );
	}
	F.col( - w / 2, 0, 0, w / 2, 0.6, L2, 2, 2 );
	F.bed( - w / 2, 0, 0, w / 2, 0.6, L2, 0.85, 'Sleep' );
	// footlocker at the foot
	F.box( - 0.35, 0, L2 + 0.05, 0.35, 0.4, L2 + 0.45, M( L.wood, [ 90, 100, 70 ], 1, F_IN ) );
	F.col( - 0.35, 0, L2 + 0.05, 0.35, 0.4, L2 + 0.45, 1, 2 );
	F.container( - 0.35, 0, L2 + 0.05, 0.35, 0.4, L2 + 0.45, 'Footlocker', loot, 30 );
	return F;
}

function crate( F, s = 1, loot = 'warehouse', label = 'Crate', mil = false ) {
	const m = mil ? M( L.wood, [ 110, 120, 80 ], 1, F_IN ) : M( L.oldplanks, [ 200, 170, 130 ], 1.2, F_IN );
	const w = 0.8 * s, h = 0.6 * s, d = 0.6 * s;
	F.box( - w / 2, 0, 0, w / 2, h, d, m );
	F.box( - w / 2 - 0.01, h * 0.45, - 0.01, w / 2 + 0.01, h * 0.55, d + 0.01, M( L.wood, [ 90, 70, 50 ], 1, F_IN ) );
	if ( mil ) F.box( - w / 4, h * 0.65, d, w / 4, h * 0.85, d + 0.005, paint( [ 220, 220, 200 ] ) );
	F.col( - w / 2, 0, 0, w / 2, h, d, 1 );
	F.container( - w / 2, 0, 0, w / 2, h, d, label, loot, 50 );
	return F;
}

function palletRack( F, len, loot = 'warehouse', levels = 3 ) {
	const up = paint( [ 40, 80, 150 ] ), beam = paint( [ 230, 120, 30 ] );
	const d = 1.1, h = levels * 1.5;
	const bays = Math.max( 1, Math.round( len / 2.7 ) ), bw = len / bays;
	for ( let i = 0; i <= bays; i ++ ) {
		const x = - len / 2 + i * bw;
		F.box( x - 0.05, 0, 0, x + 0.05, h, 0.08, up ).box( x - 0.05, 0, d - 0.08, x + 0.05, h, d, up );
	}
	const R = F.O.R;
	for ( let k = 1; k <= levels; k ++ ) {
		const y = k * 1.5 - 0.1;
		F.box( - len / 2, y - 0.12, 0, len / 2, y, 0.06, beam ).box( - len / 2, y - 0.12, d - 0.06, len / 2, y, d, beam );
	}
	for ( let i = 0; i < bays; i ++ ) for ( let k = 0; k < levels; k ++ ) {
		if ( R() < 0.25 ) continue;
		const a = - len / 2 + i * bw + 0.15, y = k * 1.5;
		// a pallet with a wrapped load of boxes
		F.box( a, y, 0.08, a + bw - 0.3, y + 0.14, d - 0.08, M( L.wood, [ 190, 160, 120 ], 1, F_IN ) );
		const bh = 0.5 + R() * 0.7;
		F.box( a + 0.05, y + 0.14, 0.12, a + bw - 0.35, y + 0.14 + bh, d - 0.12, M( L.plain, [ [ 190, 150, 100 ], [ 200, 170, 120 ], [ 170, 170, 170 ], [ 60, 90, 140 ] ][ ( R() * 4 ) | 0 ], 1, F_IN ) );
	}
	F.col( - len / 2, 0, 0, len / 2, h, d, 2 );
	for ( let i = 0; i < bays; i += 2 ) F.container( - len / 2 + i * bw, 0, 0, - len / 2 + ( i + 1 ) * bw, 1.4, d, 'Pallet', loot, 80 );
	return F;
}

function workbench( F, w = 1.8, loot = 'toolbox', table = 'house_garage' ) {
	const m = wood( [ 150, 120, 80 ] );
	F.box( - w / 2, 0.86, 0, w / 2, 0.92, 0.7, m );
	legs( F, - w / 2, 0.02, w / 2, 0.68, 0.86, metal( [ 90, 90, 90 ] ), 0.06 );
	F.box( - w / 2, 0.15, 0.02, w / 2, 0.18, 0.68, m );
	// pegboard with tools
	F.box( - w / 2, 1.0, 0, w / 2, 1.9, 0.02, M( L.plain, [ 170, 140, 100 ], 1, F_IN ) );
	for ( let i = 0; i < 6; i ++ ) F.box( - w / 2 + 0.2 + i * ( w - 0.4 ) / 6, 1.3 + ( i % 2 ) * 0.2, 0.02, - w / 2 + 0.26 + i * ( w - 0.4 ) / 6, 1.6 + ( i % 2 ) * 0.2, 0.04, DARK );
	// a red toolbox on top
	F.box( 0.1, 0.92, 0.15, 0.6, 1.14, 0.45, paint( [ 180, 30, 26 ] ) );
	F.col( - w / 2, 0, 0, w / 2, 0.92, 0.7, 2, 2 );
	F.container( 0.1, 0.92, 0.15, 0.6, 1.14, 0.45, 'Toolbox', loot, 16 );
	F.spot( - w / 4, 0.92, 0.35, table, 0.5 );
	return F;
}

function gunRack( F, w, loot, label = 'Gun rack' ) {
	const m = wood( [ 120, 84, 52 ] );
	F.box( - w / 2, 0.9, 0, w / 2, 2.1, 0.05, m );
	F.box( - w / 2, 0.9, 0.05, w / 2, 0.98, 0.25, m );
	const n = Math.floor( w / 0.22 );
	for ( let i = 0; i < n; i ++ ) {
		if ( F.O.R() < 0.35 ) continue; // gaps: taken already
		const x = - w / 2 + 0.11 + i * 0.22;
		F.box( x - 0.025, 0.98, 0.12, x + 0.025, 1.95, 0.17, BLACK ).box( x - 0.03, 0.98, 0.1, x + 0.03, 1.2, 0.2, wood( [ 90, 60, 40 ] ) );
	}
	F.col( - w / 2, 0.9, 0, w / 2, 2.1, 0.25, 1 );
	F.container( - w / 2, 0.9, 0, w / 2, 2.1, 0.3, label, loot, 60 );
	return F;
}

function gunSafe( F, loot = 'gun_safe' ) {
	const m = metal( [ 60, 64, 62 ] );
	F.box( - 0.4, 0, 0, 0.4, 1.5, 0.6, m );
	F.box( - 0.36, 0.05, 0.6, 0.36, 1.45, 0.61, paint( [ 40, 42, 40 ] ) );
	F.cyl( 0.15, 0.8, 0.61, 0.09, 0.03, 12, CHROME );
	F.col( - 0.4, 0, 0, 0.4, 1.5, 0.6, 2 );
	F.container( - 0.4, 0, 0, 0.4, 1.5, 0.61, 'Gun safe', loot, 50, { locked: 2, empty: 0.1 } );
	return F;
}

function counter( F, w, d = 0.6, h = 1.0, m = paint( [ 200, 196, 186 ] ), topM = M( L.terrazzo, [ 230, 226, 216 ], 1.5, F_IN ) ) {
	F.box( - w / 2, 0, 0, w / 2, h - 0.04, d, m );
	F.box( - w / 2 - 0.02, h - 0.04, - 0.02, w / 2 + 0.02, h, d + 0.04, topM );
	F.col( - w / 2, 0, 0, w / 2, h, d, 1 );
	return F;
}

function register( F, x, h, z, loot = 'convenience' ) {
	F.box( x - 0.2, h, z - 0.18, x + 0.2, h + 0.12, z + 0.18, paint( [ 50, 50, 54 ] ) );
	F.box( x - 0.15, h + 0.12, z - 0.1, x + 0.15, h + 0.32, z - 0.08, BLACK );
	F.container( x - 0.2, h, z - 0.18, x + 0.2, h + 0.32, z + 0.18, 'Register', loot, 4, { n: 1, empty: 0.5 } );
	return F;
}

function coolers( F, w, loot = 'fridge' ) {
	const n = Math.max( 1, Math.round( w / 0.8 ) ), cw = w / n;
	F.box( - w / 2, 0, 0, w / 2, 2.1, 0.75, metal( [ 200, 200, 202 ] ) );
	const drinks = M( L.products, [ 255, 255, 255 ], 1, F_IN, { fit: [ 0, 0, cw / 1.2 * n, 1.8 / 1.6 ] } );
	F.box( - w / 2 + 0.03, 0.1, 0.2, w / 2 - 0.03, 1.95, 0.7, { pz: drinks }, 1 + 2 + 4 + 8 + 32 );
	for ( let i = 0; i < n; i ++ ) {
		const a = - w / 2 + i * cw;
		F.box( a, 0.05, 0.75, a + 0.04, 2.0, 0.78, STEEL ).box( a + cw - 0.04, 0.05, 0.75, a + cw, 2.0, 0.78, STEEL );
		F.box( a + cw - 0.12, 0.9, 0.78, a + cw - 0.09, 1.3, 0.82, CHROME );
		F.O.glass.setMatrix( null );
		const p = ( lx, ly ) => { const [ gx, gz ] = F.T( lx, 0.77 ); return [ gx, F.y + ly, gz ]; };
		F.O.glass.quad( p( a + 0.04, 0.05 ), p( a + cw - 0.04, 0.05 ), p( a + cw - 0.04, 2.0 ), p( a + 0.04, 2.0 ), [ Math.sin( F.rot ), 0, Math.cos( F.rot ) ] );
	}
	F.col( - w / 2, 0, 0, w / 2, 2.1, 0.8, 2 );
	for ( let i = 0; i < n; i += 2 ) F.container( - w / 2 + i * cw, 0, 0, - w / 2 + Math.min( n, i + 2 ) * cw, 2.1, 0.8, 'Cooler', loot, 30 );
	return F;
}

function displayCase( F, w, loot ) {
	const m = paint( [ 60, 50, 44 ] );
	F.box( - w / 2, 0, 0, w / 2, 0.55, 0.6, m );
	F.box( - w / 2, 0.55, 0, w / 2, 0.58, 0.6, paint( [ 230, 230, 226 ] ) );
	F.box( - w / 2, 0.58, 0, - w / 2 + 0.03, 1.0, 0.6, CHROME ).box( w / 2 - 0.03, 0.58, 0, w / 2, 1.0, 0.6, CHROME );
	F.box( - w / 2, 0.98, 0, w / 2, 1.0, 0.6, CHROME, 4 );
	const p = ( lx, ly, lz ) => { const [ gx, gz ] = F.T( lx, lz ); return [ gx, F.y + ly, gz ]; };
	F.O.glass.quad( p( - w / 2, 0.58, 0.6 ), p( w / 2, 0.58, 0.6 ), p( w / 2, 0.98, 0.6 ), p( - w / 2, 0.98, 0.6 ), [ Math.sin( F.rot ), 0, Math.cos( F.rot ) ] );
	F.O.glass.quad( p( - w / 2, 0.99, 0 ), p( - w / 2, 0.99, 0.6 ), p( w / 2, 0.99, 0.6 ), p( w / 2, 0.99, 0 ), [ 0, 1, 0 ] );
	F.col( - w / 2, 0, 0, w / 2, 1.0, 0.6, 3 );
	F.container( - w / 2, 0, 0, w / 2, 1.0, 0.6, 'Display case', loot, 24 );
	return F;
}

function hospitalBed( F, loot = 'hospital' ) {
	const fm = metal( [ 210, 212, 214 ] );
	bed( F, 0.95, 2.05, [ 170, 200, 210 ], fm, 0.9 );
	F.box( - 0.5, 0.55, 0.3, - 0.47, 0.8, 1.7, fm ).box( 0.47, 0.55, 0.3, 0.5, 0.8, 1.7, fm );
	// curtain rail and a half-drawn curtain
	F.box( - 0.7, 2.3, 0, - 0.68, 2.33, 2.3, CHROME );
	F.box( - 0.72, 0.35, 0.2, - 0.69, 2.28, 0.2 + 0.8 + F.O.R() * 1.2, cloth( [ 150, 190, 200 ] ) );
	// bedside cabinet and an IV stand
	F.box( 0.6, 0, 0.1, 1.05, 0.8, 0.55, WHITE );
	F.col( 0.6, 0, 0.1, 1.05, 0.8, 0.55, 2, 2 );
	F.container( 0.6, 0, 0.1, 1.05, 0.8, 0.55, 'Cabinet', loot, 8, { n: 1 } );
	F.cyl( - 0.6, 0, 1.2, 0.02, 1.9, 6, CHROME ).box( - 0.7, 1.85, 1.18, - 0.5, 1.87, 1.22, CHROME );
	return F;
}

function pew( F, w ) {
	const m = wood( [ 120, 80, 50 ] );
	F.box( - w / 2, 0.42, 0, w / 2, 0.46, 0.42, m );
	F.box( - w / 2, 0.46, 0.38, w / 2, 0.95, 0.43, m );
	F.box( - w / 2, 0, 0, - w / 2 + 0.05, 0.95, 0.45, m ).box( w / 2 - 0.05, 0, 0, w / 2, 0.95, 0.45, m );
	F.col( - w / 2, 0, 0, w / 2, 0.95, 0.45, 1, 2 );
	return F;
}

function schoolDesk( F ) {
	const m = wood( [ 200, 170, 120 ] ), fm = metal( [ 70, 90, 120 ] );
	F.box( - 0.35, 0.7, 0, 0.35, 0.73, 0.5, m );
	legs( F, - 0.33, 0.02, 0.33, 0.48, 0.7, fm, 0.03 );
	F.col( - 0.35, 0, 0, 0.35, 0.73, 0.5, 1, 2 );
	chair( frame( F.O, ...rotOffset( F, 0, - 0.3 ), F.rot ), wood( [ 200, 170, 120 ] ), F.O.R() < 0.08 );
	return F;
}
const rotOffset = ( F, lx, lz ) => { const [ x, z ] = F.T( lx, lz ); return [ x, F.y, z ]; };

function cubicle( F, w = 2.4, d = 2.2 ) {
	const pm = cloth( [ 120, 124, 130 ] );
	F.box( - w / 2, 0, 0, w / 2, 1.4, 0.05, pm ).box( - w / 2, 0, 0.05, - w / 2 + 0.05, 1.4, d, pm );
	F.col( - w / 2, 0, 0, w / 2, 1.4, 0.05, 1 ).col( - w / 2, 0, 0.05, - w / 2 + 0.05, 1.4, d, 1 );
	const D = frame( F.O, ...rotOffset( F, 0.1, 0.05 ), F.rot );
	desk( D, Math.min( 1.6, w - 0.4 ), 'desk', true, true );
	return F;
}

function plant( F ) {
	F.cyl( 0, 0, 0, 0.2, 0.4, 8, paint( [ 150, 90, 60 ] ), 1, 0.16 );
	const g = M( L.plain, [ 60, 110, 50 ], 1, F_IN );
	for ( let i = 0; i < 5; i ++ ) { const a = i * 1.3; F.tilt( Math.cos( a ) * 0.12, 0.7, Math.sin( a ) * 0.12, 0.1, 0.35, 0.02, 0.3 * Math.sin( a ), 0.3 * Math.cos( a ), g ); }
	F.col( - 0.2, 0, - 0.2, 0.2, 0.9, 0.2, 6, 2 );
	return F;
}

function washer( F, n ) {
	const w = n * 0.7;
	for ( let i = 0; i < n; i ++ ) {
		const a = - w / 2 + i * 0.7;
		F.box( a + 0.02, 0, 0, a + 0.68, 0.9, 0.65, WHITE );
		F.cyl( a + 0.35, 0.45, 0.65, 0.2, 0.02, 14, paint( [ 60, 70, 80 ] ) );
	}
	F.col( - w / 2, 0, 0, w / 2, 0.9, 0.65, 2 );
	return F;
}

function drum( F, c = [ 40, 80, 150 ] ) {
	F.cyl( 0, 0, 0.3, 0.29, 0.88, 12, M( L.metal, c, 1, F_IN ) );
	F.col( - 0.29, 0, 0.01, 0.29, 0.88, 0.59, 2 );
	return F;
}

function tires( F ) {
	for ( let i = 0; i < 4; i ++ ) F.cyl( 0, i * 0.22, 0.35, 0.34, 0.2, 12, BLACK ), F.cyl( 0, i * 0.22 + 0.2, 0.35, 0.2, 0.005, 10, paint( [ 90, 90, 90 ] ) );
	F.col( - 0.34, 0, 0.01, 0.34, 0.9, 0.69, 5 );
	return F;
}

function telescope( F ) {
	const w = paint( [ 236, 236, 236 ] );
	F.cyl( 0, 0, 0, 0.6, 1.0, 16, paint( [ 90, 90, 96 ] ) );
	F.box( - 0.5, 1.0, - 0.3, 0.5, 1.8, 0.3, paint( [ 60, 60, 66 ] ) );
	F.tilt( 0, 2.6, 0, 0.45, 0.45, 1.8, 0.7, 0, w );
	F.col( - 0.6, 0, - 0.6, 0.6, 1.8, 0.6, 2 );
	return F;
}

function chalkboard( F, w ) {
	F.box( - w / 2, 0.9, 0, w / 2, 2.1, 0.03, paint( [ 40, 64, 50 ] ) );
	F.box( - w / 2, 0.88, 0, w / 2, 0.9, 0.08, wood() );
	for ( let i = 0; i < 6; i ++ ) F.box( - w / 2 + 0.3 + i * 0.4, 1.6 - ( i % 3 ) * 0.2, 0.03, - w / 2 + 0.6 + i * 0.4, 1.62 - ( i % 3 ) * 0.2, 0.032, paint( [ 200, 206, 200 ] ) );
	return F;
}

function cellBars( C, x0, z0, x1, z1, y ) {
	const m = metal( [ 120, 124, 128 ] );
	const O = C.O;
	const alongX = x1 - x0 > z1 - z0;
	const len = alongX ? x1 - x0 : z1 - z0;
	const n = Math.floor( len / 0.14 );
	for ( let i = 0; i <= n; i ++ ) {
		const t = alongX ? x0 + i * len / n : z0 + i * len / n;
		if ( alongX ) O.g.box( t - 0.015, y, z0 - 0.015, t + 0.015, y + 2.3, z0 + 0.015, m, 12 );
		else O.g.box( x0 - 0.015, y, t - 0.015, x0 + 0.015, y + 2.3, t + 0.015, m, 12 );
	}
	O.col( x0 - 0.03, y, z0 - 0.03, alongX ? x1 : x0 + 0.03, y + 2.3, alongX ? z0 + 0.03 : z1, 2, 2 );
}

// ---- outbreak dressing ---------------------------------------------------------------------------------------------

function dressing( C, kind ) {
	const O = C.O, R = O.R, y = C.st.y + 0.006;
	const px = () => C.x0 + 0.4 + R() * Math.max( 0, C.w - 0.8 ), pz = () => C.z0 + 0.4 + R() * Math.max( 0, C.d - 0.8 );
	const area = C.w * C.d;
	const violent = { ward: 2, exam: 1.5, waiting: 1.5, cells: 1.5, lobby: 1.2, corridor: 1.2, bedroom: 1, living: 1, sales: 1, bunk: 1 }[ kind ] || 0.6;
	if ( R() < 0.1 * violent ) O.decalFloor( px(), y, pz(), 1.2 + R() * 1.2, DECAL.blood[ ( R() * 4 ) | 0 ], R() * 6.3 );
	if ( R() < 0.07 * violent ) O.decalFloor( px(), y, pz(), 2 + R() * 1.5, DECAL.smear[ ( R() * 3 ) | 0 ], R() * 6.3 );
	if ( R() < 0.05 * violent && C.w > 1.5 ) {
		// bloody hand prints on a wall
		const side = ( R() * 4 ) | 0;
		const wx = side === 1 ? C.x1 : side === 3 ? C.x0 : C.x0 + 0.5 + R() * ( C.w - 1 ), wz = side === 0 ? C.z0 : side === 2 ? C.z1 : C.z0 + 0.5 + R() * ( C.d - 1 );
		const n = [ [ 0, 1 ], [ - 1, 0 ], [ 0, - 1 ], [ 1, 0 ] ][ side ];
		O.decalWall( wx, C.st.y + 1.1 + R() * 0.3, wz, n[ 0 ], n[ 1 ], 1.0, 1.0, DECAL.hands );
	}
	const papers = { office: 3, openoffice: 4, classroom: 3, briefing: 2, meeting: 2, lobby: 1, waiting: 2, corridor: 1, sorting: 4, teller: 2 }[ kind ] || 0;
	for ( let i = 0; i < papers; i ++ ) if ( R() < 0.6 ) O.decalFloor( px(), y + 0.001, pz(), 0.9 + R() * 0.6, DECAL.paper[ ( R() * 4 ) | 0 ], R() * 6.3 );
	if ( R() < 0.15 && area > 6 ) O.decalFloor( px(), y, pz(), 1.5, DECAL.dirt, R() * 6.3 );
	if ( R() < 0.08 * violent ) O.decalFloor( px(), y + 0.002, pz(), 1.4, DECAL.steps, R() * 6.3 );
}

// ---- recipes -------------------------------------------------------------------------------------------------------

const HOMEY = { house: 1, walkup: 1 };

export function furnishRoom( O, P, st, rm, fin ) {
	if ( rm.k === 'stair' || rm.k === 'elevator' || rm.roofOnly ) return;
	const C = roomCtx( O, P, st, rm );
	if ( C.w < 0.8 || C.d < 0.8 ) return;
	O.roomSpots = 0;
	const R = O.R;
	const t = P.S.type, arch = P.S.arch;
	const shop = rm.shop || P.S.shop || t;
	const mil = t === 'barracks' || t === 'mil_hq' || t === 'armory' || t === 'mil_tent';
	void fin;
	switch ( rm.k ) {
		case 'living': case 'dayroom': {
			const sw = Math.min( 2.2, C.w - 0.8 );
			const sf = sw > 1.2 && onWall( C, sw, 0.9, 0.9, [ 2, 1, 3, 0 ], 'centre' );
			if ( sf ) sofa( sf, sw, SOFA[ ( R() * SOFA.length ) | 0 ] );
			const tvF = onWall( C, 1.4, 0.45, 0.6, [ 0, 3, 1, 2 ], 'centre' );
			if ( tvF ) tv( tvF );
			const ct = centre( C, 1.0, 0.55 );
			if ( ct ) table( ct, 1.0, 0.55, 0.42, wood( WOODS[ 2 ] ), 'house_living', 0.6 );
			const bs = onWall( C, 0.9, 0.35, 1.9, [ 1, 3, 2, 0 ] );
			if ( bs ) shelves( bs, 0.9, 1.9, 0.35, 'books', 'house_living', 'Bookshelf', false, 0.3 );
			const ac = onWall( C, 0.9, 0.9, 0.9, [ 3, 1, 2, 0 ], 'corner' );
			if ( ac ) { sofa( ac, 0.9, SOFA[ ( R() * SOFA.length ) | 0 ] ); }
			if ( rm.k === 'dayroom' ) { const k = onWall( C, Math.min( 3, C.w * 0.5 ), 0.62, 2.2, [ 2, 1, 3, 0 ] ); if ( k ) kitchenRun( k, Math.min( 3, C.w * 0.5 ), true, 'fire_station' ); }
			if ( R() < 0.5 ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 2, 3 ], 'corner' ); if ( p ) plant( p ); }
			rug( C );
			candle( C, 0.12 );
			break;
		}
		case 'bedroom': case 'hotelroom': {
			const hotel = rm.k === 'hotelroom';
			const bw = hotel ? 1.6 : C.w > 3.2 && C.d > 3.2 ? ( R() < 0.6 ? 1.5 : 1.0 ) : 0.95;
			const b = onWall( C, bw + 0.02, 2.05, 1.0, [ 2, 1, 3, 0 ], 'centre' );
			if ( b ) {
				bed( b, bw, 2.0, BLANKET[ ( R() * BLANKET.length ) | 0 ] );
				for ( const s of [ - 1, 1 ] ) {
					if ( R() < 0.3 && ! hotel ) continue;
					const [ nx, nz ] = b.T( s * ( bw / 2 + 0.3 ), 0 );
					const r = [ nx - 0.25, nz - 0.25, nx + 0.25, nz + 0.25 ];
					if ( nx < C.x0 || nx > C.x1 || nz < C.z0 || nz > C.z1 || C.clear.some( u => overlaps( u, r ) ) ) continue;
					C.used.push( r );
					nightstand( frame( O, nx, st.y, nz, b.rot ), hotel ? 'hotel_room' : 'house_bedroom' );
				}
			}
			const wr = onWall( C, 1.2, 0.6, 2.0, [ 3, 1, 0, 2 ], 'corner' );
			if ( wr ) wardrobe( wr, 1.2, hotel ? 'hotel_room' : 'wardrobe' );
			const dr = onWall( C, 1.1, 0.5, 0.85, [ 0, 1, 3, 2 ] );
			if ( dr ) dresser( dr, 1.1, hotel ? 'hotel_room' : 'house_bedroom' );
			if ( hotel ) { const tv2 = onWall( C, 1.2, 0.45, 0.6, [ 0, 1, 3 ] ); if ( tv2 ) tv( tv2, 1.2 ); const ch = inRoom( C, 0.9, 0.9 ); if ( ch ) sofa( ch, 0.9, SOFA[ ( R() * SOFA.length ) | 0 ] ); }
			else if ( R() < 0.4 ) { const d = onWall( C, 1.1, 0.7, 0.8, [ 0, 1, 3 ] ); if ( d ) desk( d, 1.1, 'house_bedroom', true, R() < 0.3 ); }
			if ( R() < 0.12 ) { const ch = inRoom( C, 0.5, 0.5 ); if ( ch ) chair( ch, wood(), true ); }
			candle( C, 0.1 );
			break;
		}
		case 'kitchen': case 'breakroom': {
			const len = Math.min( C.w > C.d ? C.w - 0.4 : C.d - 0.4, 3.6 );
			const loot = rm.k === 'breakroom' ? 'office' : 'house_kitchen';
			let kl = len, upper = true;
			let k = onWall( C, kl, 0.62, 2.2, [ 2, 1, 3, 0 ], 'corner' );
			if ( ! k ) { kl = Math.min( len, 1.8 ); upper = false; k = onWall( C, kl, 0.62, 0.95, [ 2, 1, 3, 0 ] ); }
			if ( k ) kitchenRun( k, kl, upper, loot );
			const f = onWall( C, 0.78, 0.74, 1.8, [ 1, 3, 2, 0 ], 'corner' );
			if ( f ) fridge( f );
			const tb = centre( C, 1.2, 0.8 ) || inRoom( C, 1.0, 0.7, 0.5 );
			if ( tb ) {
				table( tb, 1.2, 0.8, 0.75, wood( WOODS[ ( R() * 4 ) | 0 ] ), rm.k === 'breakroom' ? 'office' : 'house_kitchen', 0.6 );
				for ( const [ cx, cz, r ] of [ [ - 0.35, - 0.35, 0 ], [ 0.35, 1.15, Math.PI ] ] ) {
					const [ wx, wz ] = tb.T( cx, cz );
					chair( frame( O, wx, st.y, wz, tb.rot + r ), wood( WOODS[ 1 ] ), R() < 0.15 );
				}
			}
			candle( C, 0.08 );
			break;
		}
		case 'bath': case 'hbath': {
			const tl = onWall( C, 0.45, 0.7, 0.8, [ 2, 1, 3, 0 ], 'corner' );
			if ( tl ) toilet( tl );
			const b = onWall( C, 0.62, 0.5, 1.0, [ 0, 1, 3, 2 ] ) || onWall( C, 0.62, 0.5, 2.0, [ 0, 1, 3, 2 ] );
			if ( b ) basin( b, 'medicine_cabinet', true );
			if ( C.w > 1.6 || C.d > 1.6 ) { const tb = onWall( C, 1.6, 0.76, 0.6, [ 2, 3, 1, 0 ] ); if ( tb ) bathtub( tb, 1.6 ); }
			break;
		}
		case 'restroom': case 'latrine': {
			const n = Math.max( 1, Math.min( 5, Math.floor( ( Math.max( C.w, C.d ) - 1.2 ) / 1.0 ) ) );
			const alongX = C.w >= C.d;
			for ( let i = 0; i < n; i ++ ) {
				const f = onWall( C, 0.9, 0.7, 0.8, alongX ? [ 2, 0 ] : [ 1, 3 ] );
				if ( ! f ) break;
				toilet( f );
				f.box( 0.45, 0, 0, 0.48, 1.9, 1.3, paint( [ 190, 200, 196 ] ) ).col( 0.45, 0, 0, 0.48, 1.9, 1.3, 2 );
			}
			for ( let i = 0; i < Math.min( 3, n ); i ++ ) { const b = onWall( C, 0.62, 0.5, 1.0, alongX ? [ 0, 2 ] : [ 3, 1 ] ); if ( b ) basin( b, null, i === 0 ); }
			break;
		}
		case 'hall': case 'entry': {
			if ( C.w > 1.4 && C.d > 1.4 && R() < 0.5 ) { const f = onWall( C, 0.9, 0.35, 0.8, [ 0, 1, 2, 3 ] ); if ( f ) { counter( f, 0.9, 0.35, 0.8, wood( WOODS[ 2 ] ), wood( WOODS[ 2 ] ) ); f.spot( 0, 0.8, 0.18, 'house_living', 0.35 ); f.container( - 0.45, 0, 0, 0.45, 0.8, 0.35, 'Drawers', 'house_living', 8, { n: 1 } ); } }
			break;
		}
		case 'garage': case 'workshop': {
			const garageShop = t === 'garage' || t === 'hangar' || arch === 'hangar';
			const table = garageShop ? ( t === 'hangar' ? 'hangar' : 'garage_shop' ) : 'house_garage';
			const wb = onWall( C, 1.8, 0.72, 1.9, [ 2, 1, 3 ] );
			if ( wb ) workbench( wb, 1.8, 'toolbox', table );
			const sh = onWall( C, 1.8, 0.5, 1.9, [ 1, 3, 2 ] );
			if ( sh ) shelves( sh, 1.8, 1.9, 0.5, 'products', table, 'Shelf', true, 0.3 );
			if ( garageShop ) {
				for ( let i = 0; i < 3; i ++ ) { const f = onWall( C, 0.7, 0.7, 1.0, [ 3, 1, 2 ] ); if ( f ) ( i ? drum( f, [ 150, 40, 30 ] ) : tires( f ) ); }
				const tb = onWall( C, 0.7, 0.5, 1.1, [ 2, 3, 1 ] );
				if ( tb ) { tb.box( - 0.35, 0, 0, 0.35, 1.05, 0.5, paint( [ 180, 30, 26 ] ) ); for ( let k = 0; k < 5; k ++ ) tb.box( - 0.33, 0.1 + k * 0.19, 0.5, 0.33, 0.11 + k * 0.19, 0.505, DARK ); tb.col( - 0.35, 0, 0, 0.35, 1.05, 0.5, 2 ); tb.container( - 0.35, 0, 0, 0.35, 1.05, 0.5, 'Tool chest', 'toolbox', 30 ); }
			}
			break;
		}
		case 'dining': {
			const food = shop === 'bar' ? 'bar' : SHOP_TABLE[ shop ] || 'restaurant';
			// a counter at the back with a register, tables in rows
			const ct = onWall( C, Math.min( 4, C.w - 1.5 ), 0.62, 1.1, [ 2, 1, 3 ] );
			if ( ct ) { counter( ct, Math.min( 4, C.w - 1.5 ), 0.6, 1.05, paint( [ 150, 100, 60 ] ) ); register( ct, 0.6, 1.05, 0.3, food ); ct.spot( - 0.6, 1.05, 0.3, food, 0.5 ); }
			tableGrid( C, 0.8, 0.8, 1.9, food );
			candle( C, 0.06 );
			break;
		}
		case 'bar': {
			const len = Math.min( 5, Math.max( C.w, C.d ) - 1.6 );
			const bb = onWall( C, len, 0.45, 2.0, [ 2, 1, 3 ] );
			if ( bb ) {
				// back bar: bottles on shelves
				bb.box( - len / 2, 0, 0, len / 2, 0.9, 0.45, wood( [ 90, 60, 40 ] ) ).col( - len / 2, 0, 0, len / 2, 0.9, 0.45, 1 );
				for ( let k = 0; k < 3; k ++ ) {
					bb.box( - len / 2, 1.2 + k * 0.35, 0, len / 2, 1.23 + k * 0.35, 0.25, wood( [ 90, 60, 40 ] ) );
					for ( let i = 0; i < len / 0.12; i ++ ) if ( R() < 0.7 ) bb.cyl( - len / 2 + 0.06 + i * 0.12, 1.23 + k * 0.35, 0.12, 0.035, 0.24, 6, M( L.plain, [ [ 60, 110, 50 ], [ 120, 70, 30 ], [ 220, 220, 210 ], [ 40, 40, 30 ] ][ ( R() * 4 ) | 0 ], 1, F_IN ), 1, 0.012 );
				}
				bb.container( - len / 2, 0, 0, len / 2, 0.9, 0.45, 'Cabinet', 'bar', 12 );
				bb.spot( 0.5, 0.9, 0.25, 'bar', 0.6 );
				// the bar counter in front of it
				const [ fx, fz ] = bb.T( 0, 1.4 );
				const fc = frame( O, fx, st.y, fz, bb.rot );
				counter( fc, len, 0.6, 1.1, wood( [ 120, 80, 50 ] ), wood( [ 70, 40, 24 ] ) );
				C.used.push( [ fx - len / 2 - 0.5, fz - 0.8, fx + len / 2 + 0.5, fz + 0.8 ] );
				fc.spot( 0, 1.1, 0.3, 'bar', 0.5 );
				for ( let i = 0; i < Math.floor( len / 0.7 ); i ++ ) { const sx = - len / 2 + 0.35 + i * 0.7; fc.cyl( sx, 0, 0.95, 0.03, 0.72, 6, CHROME ).cyl( sx, 0.72, 0.95, 0.18, 0.06, 10, cloth( [ 130, 30, 30 ] ) ); }
			}
			tableGrid( C, 0.7, 0.7, 2.0, 'bar' );
			candle( C, 0.15 );
			break;
		}
		case 'rkitchen': {
			const len = Math.max( C.w, C.d ) - 1.2;
			const a = onWall( C, Math.min( len, 4 ), 0.62, 2.2, [ 2, 1, 3, 0 ] );
			if ( a ) kitchenRun( a, Math.min( len, 4 ), false, 'restaurant_kitchen', true );
			const f = onWall( C, 0.78, 0.74, 1.8, [ 1, 3, 0, 2 ], 'corner' );
			if ( f ) fridge( f, 'restaurant_kitchen', true );
			const s = onWall( C, 1.2, 0.45, 1.9, [ 3, 1, 0 ] );
			if ( s ) shelves( s, 1.2, 1.9, 0.45, 'products', 'restaurant_kitchen', 'Shelf', true, 0.3 );
			const isl = centre( C, 1.8, 0.8 );
			if ( isl ) { counter( isl, 1.8, 0.8, 0.92, STEEL, STEEL ); isl.spot( 0, 0.92, 0.4, 'restaurant_kitchen', 0.5 ); }
			break;
		}
		case 'sales': salesFloor( C, shop ); break;
		case 'teller': {
			const len = C.w - 1.0;
			const f = onWall( C, len, 0.7, 1.2, [ 2 ], 'centre' );
			if ( f ) {
				counter( f, len, 0.7, 1.1, wood( [ 120, 90, 60 ] ) );
				f.box( - len / 2, 1.1, 0.3, len / 2, 2.3, 0.33, paint( [ 150, 150, 150 ] ) );
				for ( let i = 0; i < Math.floor( len / 1.5 ); i ++ ) register( f, - len / 2 + 0.75 + i * 1.5, 1.1, 0.15, 'bank' );
			}
			const tb = inRoom( C, 1.2, 0.6 ); if ( tb ) table( tb, 1.2, 0.6, 1.0, wood(), 'bank', 0.4 );
			for ( let i = 0; i < 2; i ++ ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 3 ], 'corner' ); if ( p ) plant( p ); }
			break;
		}
		case 'vault': {
			const f = onWall( C, Math.min( 3, C.w - 0.6 ), 0.45, 2.0, [ 2, 1, 3 ] );
			if ( f ) {
				const w = Math.min( 3, C.w - 0.6 );
				f.box( - w / 2, 0, 0, w / 2, 2.0, 0.45, metal( [ 170, 150, 110 ] ) );
				for ( let i = 0; i < w / 0.3; i ++ ) for ( let k = 0; k < 6; k ++ ) f.box( - w / 2 + i * 0.3 + 0.02, 0.1 + k * 0.31, 0.45, - w / 2 + i * 0.3 + 0.28, 0.38 + k * 0.31, 0.455, metal( [ 190, 170, 120 ] ) );
				f.col( - w / 2, 0, 0, w / 2, 2.0, 0.45, 2 );
				f.container( - w / 2, 0, 0, w / 2, 2.0, 0.46, 'Deposit boxes', 'bank', 20, { locked: 1 } );
			}
			const s = onWall( C, 0.8, 0.6, 1.5, [ 1, 3, 0 ] ); if ( s ) gunSafe( s, 'bank' );
			break;
		}
		case 'storage': case 'utility': case 'sorting': case 'rx': {
			const loot = rm.k === 'rx' ? 'pharmacy' : rm.k === 'sorting' ? 'post' : storageTable( P, shop, mil );
			if ( rm.k === 'utility' && R() < 0.6 ) { const wh = onWall( C, 0.6, 0.6, 1.6, [ 2, 1, 3, 0 ], 'corner' ); if ( wh ) { wh.cyl( 0, 0, 0.3, 0.28, 1.5, 12, WHITE ); wh.col( - 0.28, 0, 0.02, 0.28, 1.5, 0.58, 2 ); } }
			const n = rm.k === 'utility' ? 1 : 4;
			for ( let i = 0; i < n; i ++ ) {
				const w = Math.min( 2.4, Math.max( C.w, C.d ) - 1.0 );
				const s = onWall( C, w, 0.5, 1.9, [ 2, 1, 3, 0 ] );
				if ( ! s ) break;
				shelves( s, w, 1.9, 0.5, rm.k === 'sorting' ? null : 'products', loot, 'Shelf', true, 0.3 );
			}
			if ( rm.k === 'sorting' ) tableGrid( C, 1.6, 0.8, 1.2, 'post', 4 );
			for ( let i = 0; i < 3; i ++ ) { const c = inRoom( C, 0.8, 0.6, 0.4 ); if ( c ) crate( c, 0.8 + R() * 0.3, loot, 'Box' ); }
			break;
		}
		case 'office': case 'meeting': case 'briefing': {
			const loot = t === 'police' ? 'police' : t === 'school' ? 'school' : t === 'hospital' || t === 'clinic' ? 'clinic' : t === 'church' ? 'church' : mil ? 'military' : t === 'fire' ? 'fire_station' : 'office';
			if ( rm.k === 'meeting' ) {
				const tb = centre( C, Math.min( 3.2, C.w - 1.6 ), Math.min( 1.2, C.d - 1.6 ) );
				if ( tb ) { const w = Math.min( 3.2, C.w - 1.6 ); table( tb, w, Math.min( 1.2, C.d - 1.6 ), 0.75, wood( [ 90, 64, 44 ] ), loot, 0.5 ); }
			} else if ( rm.k === 'briefing' ) {
				rows( C, 0.5, 0.5, 0.9, 0.9, ( F ) => chair( F, metal( [ 60, 60, 66 ] ), R() < 0.1 ) );
				const lec = onWall( C, 0.6, 0.5, 1.2, [ 2, 0 ], 'centre' ); if ( lec ) { lec.box( - 0.3, 0, 0, 0.3, 1.15, 0.5, wood() ).col( - 0.3, 0, 0, 0.3, 1.15, 0.5, 1 ); }
			} else {
				const d = onWall( C, 1.4, 0.72, 0.8, [ 2, 1, 3, 0 ] );
				if ( d ) desk( d, 1.4, t === 'police' ? 'police' : 'desk' );
				if ( C.w * C.d > 12 ) { const d2 = onWall( C, 1.4, 0.72, 0.8, [ 0, 1, 3 ] ); if ( d2 ) desk( d2, 1.4 ); }
			}
			const fc = onWall( C, 0.5, 0.62, 1.35, [ 1, 3, 2, 0 ], 'corner' );
			if ( fc ) filing( fc, loot );
			const bs = onWall( C, 0.9, 0.35, 1.9, [ 3, 1, 0, 2 ] );
			if ( bs ) shelves( bs, 0.9, 1.9, 0.35, 'books', loot, 'Bookshelf', false, 0.2 );
			if ( R() < 0.5 ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 2, 3 ], 'corner' ); if ( p ) plant( p ); }
			break;
		}
		case 'openoffice': {
			const loot = t === 'police' ? 'police' : 'office';
			rows( C, 2.4, 2.2, 0.4, 0.9, ( F ) => cubicle( F ) );
			const fc = onWall( C, 0.5, 0.62, 1.35, [ 1, 3, 2, 0 ] ); if ( fc ) filing( fc, loot );
			break;
		}
		case 'lobby': case 'waiting': {
			const rec = onWall( C, Math.min( 3, C.w - 1.4 ), 0.7, 1.1, [ 2, 1, 3 ], 'centre' );
			if ( rec ) { counter( rec, Math.min( 3, C.w - 1.4 ), 0.7, 1.1, wood( [ 150, 110, 80 ] ) ); rec.container( - 0.6, 0, 0, 0.6, 1.1, 0.7, 'Desk', t === 'hospital' || t === 'clinic' ? 'clinic' : t === 'police' ? 'police' : t === 'hotel' ? 'hotel_room' : 'desk', 8, { n: 1 } ); rec.spot( 0.5, 1.1, 0.35, 'office', 0.3 ); }
			for ( let i = 0; i < ( rm.k === 'waiting' ? 4 : 2 ); i ++ ) {
				const bench = onWall( C, 1.8, 0.55, 0.9, [ 0, 1, 3 ] );
				if ( bench ) { for ( let k = 0; k < 3; k ++ ) bench.box( - 0.9 + k * 0.6 + 0.03, 0.42, 0.05, - 0.3 + k * 0.6 - 0.03, 0.46, 0.5, cloth( [ 70, 90, 120 ] ) ).box( - 0.9 + k * 0.6 + 0.03, 0.46, 0.02, - 0.3 + k * 0.6 - 0.03, 0.85, 0.07, cloth( [ 70, 90, 120 ] ) ); bench.box( - 0.9, 0, 0.2, 0.9, 0.42, 0.3, metal() ).col( - 0.9, 0, 0, 0.9, 0.5, 0.55, 2, 2 ); }
			}
			for ( let i = 0; i < 2; i ++ ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 3 ], 'corner' ); if ( p ) plant( p ); }
			break;
		}
		case 'corridor': {
			if ( R() < 0.3 ) { const f = onWall( C, 0.2, 0.2, 1.0, [ 0, 1, 2, 3 ] ); if ( f ) f.cyl( 0, 0.2, 0.12, 0.08, 0.5, 8, paint( [ 190, 30, 26 ] ) ); }
			break;
		}
		case 'cells': {
			// two or three cells along the back with bars facing the room
			const n = Math.max( 1, Math.min( 3, Math.floor( C.w / 2.2 ) ) );
			const cd = Math.min( 2.4, C.d - 1.4 );
			for ( let i = 0; i < n; i ++ ) {
				const x0 = C.x0 + C.w * i / n, x1 = C.x0 + C.w * ( i + 1 ) / n;
				const zb = C.z1 - cd;
				cellBars( C, x0, zb, x1 - 0.05, zb, st.y );
				if ( i < n - 1 ) { O.g.box( x1 - 0.06, st.y, zb, x1, st.y + 2.4, C.z1, paint( [ 200, 200, 196 ] ) ); O.col( x1 - 0.06, st.y, zb, x1, st.y + 2.4, C.z1, 0 ); }
				const b = frame( O, x0 + 0.5, st.y, C.z1, Math.PI );
				b.box( - 0.4, 0.4, 0, 0.4, 0.5, 1.9, metal( [ 120, 124, 128 ] ) ).box( - 0.38, 0.5, 0.05, 0.38, 0.6, 1.85, cloth( [ 90, 110, 100 ] ) ).col( - 0.4, 0, 0, 0.4, 0.6, 1.9, 2, 2 ).bed( - 0.4, 0, 0, 0.4, 0.6, 1.9, 0.6 );
				const tl = frame( O, x1 - 0.5, st.y, C.z1, Math.PI );
				toilet( tl );
			}
			C.used.push( [ C.x0, C.z1 - cd, C.x1, C.z1 ] );
			break;
		}
		case 'armory': {
			const loot = mil ? 'military_armory' : 'police';
			for ( let i = 0; i < 4; i ++ ) { const w = Math.min( 2.4, Math.max( C.w, C.d ) - 1.2 ); const f = onWall( C, w, 0.3, 2.1, [ 2, 1, 3, 0 ] ); if ( f ) gunRack( f, w, loot ); }
			for ( let i = 0; i < 2; i ++ ) { const s = onWall( C, 0.8, 0.6, 1.5, [ 1, 3, 0, 2 ] ); if ( s ) gunSafe( s, mil ? 'military_armory' : 'gun_safe' ); }
			for ( let i = 0; i < 3; i ++ ) { const c = inRoom( C, 0.8, 0.6, 0.5 ); if ( c ) crate( c, 1, mil ? 'military' : 'police', 'Crate', mil ); }
			break;
		}
		case 'lockers': {
			const loot = t === 'police' ? 'police_locker' : t === 'fire' ? 'fire_station' : mil ? 'military_locker' : 'office';
			for ( let i = 0; i < 4; i ++ ) { const n = Math.min( 8, Math.floor( ( Math.max( C.w, C.d ) - 1.0 ) / 0.42 ) ); if ( n < 2 ) break; const f = onWall( C, n * 0.42, 0.5, 1.9, [ 2, 0, 1, 3 ] ); if ( f ) lockers( f, n, loot, 'Locker', t === 'fire' ? [ 170, 40, 30 ] : [ 90, 110, 130 ] ); }
			const b = centre( C, 1.8, 0.35 ); if ( b ) b.box( - 0.9, 0.4, 0, 0.9, 0.45, 0.35, wood() ).box( - 0.8, 0, 0.1, - 0.75, 0.4, 0.25, metal() ).box( 0.75, 0, 0.1, 0.8, 0.4, 0.25, metal() ).col( - 0.9, 0, 0, 0.9, 0.45, 0.35, 1, 2 );
			break;
		}
		case 'bay': {
			// fire station apparatus bay: turnout gear lockers along the walls, hose racks
			for ( let i = 0; i < 3; i ++ ) { const f = onWall( C, 3.4, 0.5, 1.9, [ 2, 1, 3 ] ); if ( f ) lockers( f, 8, 'fire_station', 'Gear locker', [ 170, 40, 30 ] ); }
			for ( let i = 0; i < 2; i ++ ) { const d = onWall( C, 0.6, 0.6, 1.0, [ 1, 3 ] ); if ( d ) drum( d, [ 170, 40, 30 ] ); }
			break;
		}
		case 'ward': {
			const n = Math.max( 1, Math.floor( Math.max( C.w, C.d ) / 2.4 ) );
			for ( let i = 0; i < n * 2; i ++ ) { const f = onWall( C, 1.9, 2.1, 1.0, C.w > C.d ? [ 2, 0 ] : [ 1, 3 ] ); if ( f ) hospitalBed( f ); }
			break;
		}
		case 'exam': {
			const f = onWall( C, 0.8, 2.0, 1.0, [ 2, 1, 3 ], 'centre' );
			if ( f ) { f.box( - 0.35, 0, 0, 0.35, 0.8, 1.9, WHITE ).box( - 0.35, 0.8, 0, 0.35, 0.88, 1.9, cloth( [ 90, 120, 130 ] ) ).box( - 0.3, 0.88, 0.1, 0.3, 0.9, 1.8, WHITE ).col( - 0.35, 0, 0, 0.35, 0.9, 1.9, 2, 2 ); }
			const c = onWall( C, 1.2, 0.5, 1.0, [ 0, 1, 3 ] );
			if ( c ) { counter( c, 1.2, 0.5, 0.9, WHITE ); c.container( - 0.6, 0, 0, 0.6, 0.9, 0.5, 'Cabinet', t === 'hospital' ? 'hospital' : 'clinic', 10 ); c.spot( 0.3, 0.9, 0.25, 'clinic', 0.6 ); basin( frame( O, ...rotOffset( c, - 0.9, 0 ), c.rot ), 'medicine_cabinet', false ); }
			const d = onWall( C, 1.1, 0.7, 0.8, [ 0, 1, 3 ] ); if ( d ) desk( d, 1.1, 'clinic', true, false );
			break;
		}
		case 'classroom': {
			const cb = onWall( C, Math.min( 4, C.w - 1.5 ), 0.1, 2.2, [ 2, 1, 3 ], 'centre' );
			if ( cb ) chalkboard( cb, Math.min( 4, C.w - 1.5 ) );
			const td = onWall( C, 1.3, 0.72, 0.8, [ 3, 1, 0 ] ) || inRoom( C, 1.3, 0.72 );
			if ( td ) desk( td, 1.3, 'school', true, false );
			rows( C, 0.7, 1.35, 0.35, 0.9, ( F ) => schoolDesk( F ) );
			break;
		}
		case 'nave': {
			const alt = onWall( C, 2.0, 1.0, 1.1, [ 2 ], 'centre' );
			if ( alt ) { alt.box( - 1.0, 0, 0.2, 1.0, 1.0, 1.0, cloth( [ 240, 236, 226 ] ) ).col( - 1.0, 0, 0.2, 1.0, 1.0, 1.0, 1 ); alt.light( - 0.7, 1.0, 0.6, 'candle' ).light( 0.7, 1.0, 0.6, 'candle' ); alt.spot( 0, 1.0, 0.6, 'church', 0.6 ); alt.box( - 0.04, 1.6, 0.02, 0.04, 2.8, 0.06, wood( [ 90, 60, 40 ] ) ).box( - 0.4, 2.3, 0.02, 0.4, 2.38, 0.06, wood( [ 90, 60, 40 ] ) ); }
			const pw = Math.min( 3.2, ( C.w - 1.6 ) / 2 );
			for ( let r = 0; r < 20; r ++ ) {
				const z = C.z0 + 1.2 + r * 1.0;
				if ( z > C.z1 - 2.5 ) break;
				for ( const s of [ - 1, 1 ] ) {
					const x = ( C.x0 + C.x1 ) / 2 + s * ( pw / 2 + 0.6 );
					const rr = [ x - pw / 2, z, x + pw / 2, z + 0.45 ];
					if ( C.clear.some( u => overlaps( u, rr ) ) ) continue;
					pew( frame( O, x, st.y, z, 0 ), pw );
				}
			}
			break;
		}
		case 'vestry': { const w = onWall( C, 1.2, 0.6, 2.0, [ 2, 1, 3 ] ); if ( w ) wardrobe( w, 1.2, 'church', 'Cabinet' ); const d = onWall( C, 1.2, 0.7, 0.8, [ 1, 3, 0 ] ); if ( d ) desk( d, 1.2, 'church', true, false ); break; }
		case 'hallbig': {
			if ( t === 'warehouse' ) {
				// pallet racks in rows with aisles between
				const alongX = C.w >= C.d;
				const len = ( alongX ? C.w : C.d ) - 5;
				const n = Math.floor( ( ( alongX ? C.d : C.w ) - 4 ) / 3.6 );
				for ( let i = 0; i < n; i ++ ) {
					const c = ( alongX ? C.z0 : C.x0 ) + 2.5 + i * 3.6;
					const F = alongX ? frame( O, ( C.x0 + C.x1 ) / 2, st.y, c, 0 ) : frame( O, c, st.y, ( C.z0 + C.z1 ) / 2, Math.PI / 2 );
					if ( len > 3 ) palletRack( F, len, 'warehouse', 2 );
				}
			} else {
				const loot = t === 'hangar' ? 'hangar' : storageTable( P, shop, mil );
				for ( let i = 0; i < 3; i ++ ) { const f = onWall( C, 1.8, 0.72, 1.9, [ 2, 1, 3 ] ); if ( f ) workbench( f, 1.8, 'toolbox', loot ); }
				for ( let i = 0; i < 8; i ++ ) { const c = inRoom( C, 0.8, 0.6, 1.0 ); if ( c ) ( R() < 0.3 ? drum( c ) : crate( c, 1 + R() * 0.4, loot, 'Crate', mil ) ); }
			}
			break;
		}
		case 'dorm': case 'bunk': {
			const dbl = rm.k === 'bunk' || mil;
			for ( let i = 0; i < 10; i ++ ) { const f = onWall( C, 1.1, 2.5, 1.8, C.w > C.d ? [ 2, 0 ] : [ 1, 3 ] ); if ( f ) bunk( f, mil ? 'military_locker' : 'fire_station', dbl ); else break; }
			const l = onWall( C, 1.7, 0.5, 1.9, [ 3, 1, 0, 2 ] ); if ( l ) lockers( l, 4, mil ? 'military_locker' : 'fire_station' );
			break;
		}
		case 'tent': {
			const cz = ( C.z0 + C.z1 ) / 2;
			for ( let i = 0; i < 6; i ++ ) {
				const x = C.x0 + 0.5 + i * 1.1;
				if ( x + 0.4 > C.x1 - 0.8 ) break;
				for ( const s of [ - 1, 1 ] ) {
					const F = frame( O, x + 0.35, st.y, s < 0 ? C.z0 + 0.1 : C.z1 - 0.1, s < 0 ? 0 : Math.PI );
					F.box( - 0.35, 0.35, 0, 0.35, 0.4, 1.9, cloth( [ 100, 104, 70 ] ) ).box( - 0.35, 0, 0.1, - 0.32, 0.35, 0.13, metal( [ 60, 60, 50 ] ) ).box( 0.32, 0, 1.75, 0.35, 0.35, 1.78, metal( [ 60, 60, 50 ] ) ).col( - 0.35, 0, 0, 0.35, 0.4, 1.9, 1, 2 ).bed( - 0.35, 0, 0, 0.35, 0.45, 1.9, 0.7 );
				}
			}
			const cr = frame( O, C.x1 - 0.9, st.y, cz - 0.3, - Math.PI / 2 );
			crate( cr, 1, 'military', 'Crate', true );
			void cz;
			break;
		}
		case 'observatory': {
			const tc = frame( O, ( C.x0 + C.x1 ) / 2, st.y, ( C.z0 + C.z1 ) / 2, 0 );
			telescope( tc );
			C.used.push( [ tc.x - 1.2, tc.z - 1.2, tc.x + 1.2, tc.z + 1.2 ] );
			const r = Math.min( C.w, C.d ) / 2 - 1.2;
			for ( let i = 0; i < 3; i ++ ) {
				const a = Math.PI * 0.25 + i * Math.PI * 0.5;
				const F = frame( O, tc.x + Math.cos( a ) * r, st.y, tc.z + Math.sin( a ) * r, Math.atan2( - Math.cos( a ), - Math.sin( a ) ) + Math.PI );
				desk( F, 1.4, 'observatory', true, true );
			}
			break;
		}
		case 'porch': {
			if ( R() < 0.6 ) { const f = inRoom( C, 0.7, 0.7, 0.3 ); if ( f ) chair( f, wood( [ 120, 90, 60 ] ), R() < 0.2 ); }
			break;
		}
		case 'loggia': {
			if ( R() < 0.5 ) { const f = inRoom( C, 0.6, 0.6, 0.2 ); if ( f ) { table( f, 0.6, 0.6, 0.7, metal( [ 230, 230, 226 ] ) ); } }
			break;
		}
	}
	if ( ! rm.open ) { dressing( C, rm.k ); barricade( C ); }
}

// someone tried to hold the place: planks and a door leaning by the entrance, a table on its side
function barricade( C ) {
	const O = C.O, R = O.R, P = C.P;
	if ( R() > ( P.boarded > 0 ? 0.45 : 0.07 ) ) return;
	const pm = M( L.oldplanks, [ 190, 165, 130 ], 2.4, F_IN );
	for ( const f of C.st.facades ) {
		if ( f.inside !== C.rm ) continue;
		for ( const p of f.pieces ) {
			if ( ! p.door || ! p.door.ext || p.door.kind === 'roll' || p.door.kind === 'hangar' ) continue;
			const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
			const side = R() < 0.5 ? 1 : - 1;
			const u = p.door.u + side * ( p.door.w / 2 + 0.55 );
			if ( u < 0.4 || u > f.len - 0.4 ) continue;
			const x = f.ax + tx * u - f.nx * ( WALL_T + 0.02 ), z = f.az + tz * u - f.nz * ( WALL_T + 0.02 );
			// local x along the wall, local +z into the room
			const F = frame( O, x, C.st.y, z, Math.atan2( - tz, tx ) + Math.PI );
			for ( let k = 0; k < 4; k ++ ) F.tilt( - 0.35 + k * 0.22, 0.98, 0.22, 0.09, 1.0, 0.014, - 0.22, ( R() - 0.5 ) * 0.12, pm );
			F.col( - 0.5, 0, 0, 0.5, 1.9, 0.45, 1, 2 );
			const [ ax, az ] = F.T( 0, 0.2 );
			C.used.push( [ ax - 0.55, az - 0.55, ax + 0.55, az + 0.55 ] );
			if ( R() < 0.5 ) {
				// a table tipped on its side as cover
				const T2 = frame( O, ...rotOffset( F, side * - 0.1, 1.3 ), F.rot );
				const tm = wood( WOODS[ ( R() * 4 ) | 0 ] );
				T2.tilt( 0, 0.45, 0, 0.6, 0.02, 0.4, Math.PI / 2, 0, tm );
				T2.tilt( - 0.55, 0.45, 0.35, 0.025, 0.025, 0.36, 0, 0, tm ).tilt( 0.55, 0.45, 0.35, 0.025, 0.025, 0.36, 0, 0, tm );
				T2.tilt( - 0.55, 0.05, 0.35, 0.025, 0.025, 0.36, 0, 0, tm ).tilt( 0.55, 0.05, 0.35, 0.025, 0.025, 0.36, 0, 0, tm );
				T2.col( - 0.6, 0, - 0.03, 0.6, 0.85, 0.03, 1, 2 );
			}
			return;
		}
	}
}

function filing( F, loot ) {
	const m = metal( [ 150, 154, 150 ] );
	F.box( - 0.25, 0, 0, 0.25, 1.33, 0.62, m );
	for ( let k = 0; k < 4; k ++ ) F.box( - 0.22, 0.05 + k * 0.33 + 0.3, 0.62, 0.22, 0.05 + k * 0.33 + 0.31, 0.625, DARK ).box( - 0.07, 0.05 + k * 0.33 + 0.2, 0.62, 0.07, 0.05 + k * 0.33 + 0.22, 0.64, CHROME );
	F.col( - 0.25, 0, 0, 0.25, 1.33, 0.62, 2 );
	F.container( - 0.25, 0, 0, 0.25, 1.33, 0.62, 'Filing cabinet', loot, 20 );
	return F;
}

function rug( C ) {
	if ( C.O.R() > 0.6 ) return;
	const w = Math.min( 2.4, C.w - 1.2 ), d = Math.min( 1.7, C.d - 1.2 );
	if ( w < 1 || d < 1 ) return;
	const x = ( C.x0 + C.x1 ) / 2, z = ( C.z0 + C.z1 ) / 2, y = C.st.y;
	C.O.g.box( x - w / 2, y, z - d / 2, x + w / 2, y + 0.012, z + d / 2, cloth( BLANKET[ ( C.O.R() * BLANKET.length ) | 0 ] ), 8 );
}

// a candle or a lantern someone left burning (seen at night through the windows)
function candle( C, p ) {
	if ( C.O.R() > p ) return;
	const f = inRoom( C, 0.3, 0.3, 0.5, 6 );
	if ( ! f ) return;
	C.used.pop();
	f.light( 0, 0, 0, C.O.R() < 0.4 ? 'lantern' : 'candle' );
}

// free-standing tables with chairs, in a grid
function tableGrid( C, tw, td, pitch, loot, maxN = 16 ) {
	const O = C.O;
	let n = 0;
	for ( let z = C.z0 + 1.2; z + td < C.z1 - 1.0; z += pitch ) {
		for ( let x = C.x0 + 1.0; x + tw < C.x1 - 0.8; x += pitch ) {
			if ( n >= maxN ) return;
			const r = [ x - 0.5, z - 0.5, x + tw + 0.5, z + td + 0.5 ];
			if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
			C.used.push( r );
			const F = frame( O, x + tw / 2, C.st.y, z, 0 );
			table( F, tw, td, 0.75, wood( WOODS[ n % 4 ] ), loot, 0.25 );
			chair( frame( O, x + tw / 2, C.st.y, z - 0.35, 0 ), wood( WOODS[ 1 ] ), O.R() < 0.15 );
			chair( frame( O, x + tw / 2, C.st.y, z + td + 0.35, Math.PI ), wood( WOODS[ 1 ] ), O.R() < 0.15 );
			n ++;
		}
	}
}

// rows of identical pieces facing the front (desks, chairs, cubicles)
function rows( C, w, d, gapX, gapZ, fn ) {
	const O = C.O;
	for ( let z = C.z0 + 1.0; z + d < C.z1 - 1.4; z += d + gapZ ) {
		for ( let x = C.x0 + 0.8; x + w < C.x1 - 0.6; x += w + gapX ) {
			const r = [ x, z, x + w, z + d ];
			if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
			C.used.push( r );
			fn( frame( O, x + w / 2, C.st.y, z, 0 ) );
		}
	}
}

function storageTable( P, shop, mil ) {
	if ( mil ) return 'military';
	const t = P.S.type;
	if ( t === 'police' ) return 'police';
	if ( t === 'hospital' ) return 'hospital';
	if ( t === 'clinic' ) return 'clinic';
	if ( t === 'fire' ) return 'fire_station';
	if ( t === 'school' ) return 'school';
	if ( t === 'warehouse' ) return 'warehouse';
	if ( t === 'garage' ) return 'garage_shop';
	if ( t === 'hangar' ) return 'hangar';
	if ( t === 'church' ) return 'church';
	if ( t === 'hotel' ) return 'hotel_room';
	if ( t === 'office' ) return 'office';
	if ( t === 'house' || t === 'apartment' ) return 'house_garage';
	return SHOP_TABLE[ shop ] || 'warehouse';
}

// ---- shop floors ----------------------------------------------------------------------------------------------

function salesFloor( C, shop ) {
	const O = C.O, R = O.R, st = C.st;
	const loot = SHOP_TABLE[ shop ] || 'convenience';
	// checkout near the front door
	const co = onWall( C, 1.8, 0.7, 1.1, [ 3, 1 ], 'corner' );
	if ( co ) { counter( co, 1.8, 0.7, 1.0, paint( [ 200, 196, 186 ] ) ); register( co, 0.3, 1.0, 0.35, shop === 'bank' ? 'bank' : loot === 'trash' ? 'convenience' : loot ); co.spot( - 0.5, 1.0, 0.35, loot, 0.4 ); }
	switch ( shop ) {
		case 'gunstore': case 'pawn': {
			for ( let i = 0; i < 3; i ++ ) { const w = Math.min( 3, C.w - 1.5 ); const f = onWall( C, w, 0.3, 2.1, [ 2, 1, 3 ] ); if ( f ) gunRack( f, w, loot ); }
			for ( let i = 0; i < 3; i ++ ) { const f = inRoom( C, 2.0, 0.6, 1.0 ); if ( f ) displayCase( f, 2.0, loot ); }
			if ( shop === 'gunstore' ) { const s = onWall( C, 0.8, 0.6, 1.5, [ 1, 3, 0 ] ); if ( s ) gunSafe( s, 'gun_safe' ); }
			return;
		}
		case 'clothing': case 'surf': case 'sports': {
			for ( let i = 0; i < 6; i ++ ) {
				const f = inRoom( C, 1.4, 0.5, 0.9 );
				if ( ! f ) break;
				// a clothes rail
				f.box( - 0.7, 0, 0.2, - 0.67, 1.5, 0.23, CHROME ).box( 0.67, 0, 0.2, 0.7, 1.5, 0.23, CHROME ).box( - 0.7, 1.47, 0.2, 0.7, 1.5, 0.23, CHROME );
				for ( let k = 0; k < 10; k ++ ) if ( R() < 0.7 ) f.box( - 0.62 + k * 0.13, 0.6 + R() * 0.2, 0.05, - 0.58 + k * 0.13, 1.45, 0.4, cloth( BLANKET[ ( R() * BLANKET.length ) | 0 ] ) );
				f.col( - 0.7, 0, 0, 0.7, 1.5, 0.45, 1, 2 );
				f.spot( 0, 0.02, 0.8, loot, 0.3 );
			}
			for ( let i = 0; i < 3; i ++ ) { const w = Math.min( 2.4, C.w - 1.5 ); const f = onWall( C, w, 0.45, 1.9, [ 2, 1, 3 ] ); if ( f ) shelves( f, w, 1.9, 0.45, 'products', loot, 'Shelf', true, 0.3 ); }
			if ( shop === 'surf' ) { const f = onWall( C, 2.4, 0.5, 2.2, [ 1, 3, 2 ] ); if ( f ) for ( let k = 0; k < 6; k ++ ) f.tilt( - 1.0 + k * 0.4, 1.1, 0.2, 0.2, 1.0, 0.03, - 0.15, 0, paint( BLANKET[ k % BLANKET.length ] ) ); }
			return;
		}
		case 'laundromat': {
			for ( let i = 0; i < 3; i ++ ) { const f = onWall( C, 2.8, 0.65, 0.9, [ 2, 1, 3 ] ); if ( f ) washer( f, 4 ); }
			const b = centre( C, 2.0, 0.5 ); if ( b ) b.box( - 1, 0.42, 0, 1, 0.46, 0.5, wood() ).col( - 1, 0, 0, 1, 0.46, 0.5, 1, 2 );
			return;
		}
		case 'nails': case 'barber': {
			for ( let i = 0; i < 4; i ++ ) { const f = onWall( C, 0.9, 0.9, 1.0, [ 2, 1, 3 ] ); if ( f ) { sofa( f, 0.8, [ 60, 60, 64 ] ); f.box( - 0.45, 1.1, 0, 0.45, 1.9, 0.03, metal( [ 200, 214, 220 ] ) ); } }
			return;
		}
		case 'vacant': return;
		case 'insurance': case 'phone': case 'bank': case 'post': {
			const f = onWall( C, Math.min( 3.4, C.w - 1.5 ), 0.7, 1.2, [ 2 ], 'centre' );
			if ( f ) { counter( f, Math.min( 3.4, C.w - 1.5 ), 0.7, 1.05, wood( [ 150, 110, 80 ] ) ); f.container( - 0.6, 0, 0, 0.6, 1.05, 0.7, 'Desk', shop === 'post' ? 'post' : shop === 'bank' ? 'bank' : 'desk', 8 ); }
			for ( let i = 0; i < 2; i ++ ) { const d = inRoom( C, 1.3, 0.72, 0.9 ); if ( d ) desk( d, 1.3, 'desk' ); }
			return;
		}
		case 'restaurant': case 'fastfood': case 'takeout': case 'bakery': case 'bar': {
			const ct = onWall( C, Math.min( 4, C.w - 1.5 ), 0.62, 1.1, [ 2 ] );
			if ( ct ) { counter( ct, Math.min( 4, C.w - 1.5 ), 0.6, 1.05 ); ct.spot( 0, 1.05, 0.3, loot, 0.6 ); }
			tableGrid( C, 0.8, 0.8, 1.9, loot, 8 );
			return;
		}
	}
	// general merchandise: coolers on the back wall, gondola aisles in the middle, shelves on the side walls
	const big = BIG_SHELVES[ shop ];
	const cw = Math.min( 6.4, C.w - 1.6 );
	if ( shop !== 'hardware' && cw > 1.6 ) { const cf = onWall( C, cw, 0.8, 2.1, [ 2 ], 'centre' ); if ( cf ) coolers( cf, cw, shop === 'grocery' || shop === 'market' ? 'grocery' : 'fridge' ); }
	for ( const side of [ 1, 3 ] ) { const w = Math.min( 4.8, C.d - 2.0 ); if ( w > 1.2 ) { const f = onWall( C, w, 0.5, 1.9, [ side ] ); if ( f ) shelves( f, w, 1.9, 0.5, 'products', loot, 'Shelf', false, 0.3 ); } }
	if ( big ) {
		const alongZ = C.d >= C.w * 0.8;
		const len = ( alongZ ? C.d : C.w ) - 4.2;
		const span = alongZ ? C.w : C.d;
		const n = Math.max( 1, Math.floor( ( span - 3.0 ) / 2.4 ) );
		if ( len > 1.5 ) {
			for ( let i = 0; i < n; i ++ ) {
				const c = ( alongZ ? C.x0 : C.z0 ) + 1.8 + i * 2.4 + 0.45;
				const mid = alongZ ? ( C.z0 + C.z1 ) / 2 + 0.3 : ( C.x0 + C.x1 ) / 2;
				const r = alongZ ? [ c - 0.5, mid - len / 2, c + 0.5, mid + len / 2 ] : [ mid - len / 2, c - 0.5, mid + len / 2, c + 0.5 ];
				if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
				C.used.push( r );
				// a double-sided gondola: two shelf faces back to back
				const h = shop === 'hardware' ? 2.2 : 1.6;
				const F1 = alongZ ? frame( O, c, st.y, mid, - Math.PI / 2 ) : frame( O, mid, st.y, c, 0 );
				const F2 = alongZ ? frame( O, c, st.y, mid, Math.PI / 2 ) : frame( O, mid, st.y, c, Math.PI );
				shelves( F1, len, h, 0.45, 'products', loot, 'Shelf', i % 2 === 0, 0.25 );
				shelves( F2, len, h, 0.45, 'products', loot, 'Shelf', false, 0.2 );
				// end caps: a tipped-over display in the aisle sometimes
				if ( R() < 0.25 ) { const [ ex, ez ] = F1.T( len / 2 + 0.6, 0.2 ); O.decalFloor( ex, st.y + 0.006, ez, 1.3, DECAL.dirt, R() * 6 ); }
			}
		}
	} else {
		for ( let i = 0; i < 2; i ++ ) { const f = inRoom( C, 2.0, 0.9, 1.0 ); if ( f ) { shelves( f, 2.0, 1.4, 0.45, 'products', loot, 'Shelf', true, 0.3 ); } }
	}
	if ( shop === 'pharmacy' ) { const f = onWall( C, 2.4, 0.7, 1.2, [ 2, 1 ] ); if ( f ) { counter( f, 2.4, 0.7, 1.05, WHITE ); f.container( - 1.2, 0, 0, 1.2, 1.05, 0.7, 'Cabinet', 'pharmacy', 12, { locked: 1 } ); } }
	void hash32;
}
