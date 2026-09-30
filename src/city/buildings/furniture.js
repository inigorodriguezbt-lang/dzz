// Room contents, built with the interior (worker side): what furnishes each kind of room in each kind of building,
// placed against walls clear of doors and windows. The pieces themselves live in home.js (homes, hotel rooms),
// trade.js (shops, offices, hospitals, police, bases) and outbreak.js (the dead, bags, barricades, blood); kit.js
// has the local frame they draw in. Small things go into the storey's fine mesh (only drawn up close).
import { L, DECAL, winKey, winState } from './data.js';
import { M, slabT } from './plan.js';
import { F_IN } from './geo.js';
import {
	frame, paint, gloss, wood, metal, cloth, card, art, DARK, WHITE, BLACK, STEEL, CHROME, 	SOFA, BLANKET, WOODS, CLOTHES, pickOf, legs, scatter, SMALL, book,
} from './kit.js';
import * as H from './home.js';
import * as T from './trade.js';
import * as X from './outbreak.js';

const WALL_T = 0.25;

// the loot table of a shop's floor by its kind
const SHOP_TABLE = {
	convenience: 'convenience', grocery: 'grocery', pharmacy: 'pharmacy', hardware: 'hardware', gunstore: 'gunstore', clothing: 'clothing_store',
	sports: 'sports', surf: 'surf', pawn: 'pawn', market: 'market', bank: 'bank', post: 'post', gas: 'gas_station', restaurant: 'restaurant',
	bar: 'bar', fastfood: 'fastfood', takeout: 'fastfood', bakery: 'fastfood', laundromat: 'trash', nails: 'trash', barber: 'trash', insurance: 'office',
	phone: 'office', vacant: 'trash',
};
const HOMEY = { house: 1, walkup: 1 };
// pictures on the walls by building (art atlas cells, data.js ART)
const ART_HOME = [ 0, 1, 2, 3, 4, 5, 6, 7 ], ART_OFFICE = [ 0, 2, 5, 13, 14, 11 ], ART_POLICE = [ 10, 10, 11, 14, 13 ], ART_CARE = [ 11, 0, 2, 4, 13 ];
const ART_FOOD = [ 8, 9, 3, 12, 1 ], ART_HOTEL = [ 0, 1, 2, 3, 5 ], ART_SCHOOL = [ 14, 15, 13, 11 ];

// ---- the room: usable rect, walls, openings, windows ---------------------------------------------------------------

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
		blocked: [ [], [], [], [] ], // per side: [ a0, a1, maxH ] (maxH < 0: nothing fits)
		clear: [], // rects kept free in the room (door swings, walkways)
		used: [], // footprints of placed pieces
		windows: [], // { side, a0, a1, y0, y1, key, state }
		doors: [], // { side, a0, a1, ext, kind }
		open: [ 0, 0, 0, 0 ], // sides open to a neighbour (no wall)
		ceil: st.h - slabT( P ),
	};
	C.w = C.x1 - C.x0; C.d = C.z1 - C.z0;
	const addOpening = ( side, a0, a1, deep = 1.0, door = null ) => {
		C.blocked[ side ].push( [ a0 - 0.18, a1 + 0.18, - 1 ] );
		if ( side === 0 ) C.clear.push( [ a0 - 0.1, C.z0, a1 + 0.1, C.z0 + deep ] );
		else if ( side === 2 ) C.clear.push( [ a0 - 0.1, C.z1 - deep, a1 + 0.1, C.z1 ] );
		else if ( side === 3 ) C.clear.push( [ C.x0, a0 - 0.1, C.x0 + deep, a1 + 0.1 ] );
		else C.clear.push( [ C.x1 - deep, a0 - 0.1, C.x1, a1 + 0.1 ] );
		if ( door ) C.doors.push( { side, a0, a1, ...door } );
	};
	for ( const w of st.walls ) {
		const side = w.A === rm ? ( w.axis === 'x' ? 2 : 1 ) : w.B === rm ? ( w.axis === 'x' ? 0 : 3 ) : - 1;
		if ( side < 0 ) continue;
		const base = w.axis === 'x' ? w.x0 : w.z0;
		for ( const op of w.ops ) addOpening( side, base + op.c - op.w / 2, base + op.c + op.w / 2, op.w + 0.3, { ext: false, kind: op.kind } );
	}
	for ( const f of st.facades ) {
		if ( f.inside !== rm ) continue;
		const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
		const alongX = Math.abs( tx ) > 0.5;
		const along = ( u ) => alongX ? f.ax + tx * u : f.az + tz * u;
		for ( const p of f.pieces ) {
			// (a garage's roll-up door only needs its sill kept clear: the car parks right behind it)
			if ( p.door ) { const a = along( p.door.u - p.door.w / 2 ), b = along( p.door.u + p.door.w / 2 ); addOpening( f.side, Math.min( a, b ), Math.max( a, b ), p.door.kind === 'roll' || p.door.kind === 'hangar' ? 0.35 : Math.min( 1.6, p.door.w + 0.4 ), { ext: true, kind: p.door.kind } ); continue; }
			const w = p.win;
			if ( ! w ) continue;
			const n = Math.max( 1, Math.round( ( p.a1 - p.a0 ) / w.bay ) );
			const style = w.style & 31;
			for ( let bi = 0; bi < n; bi ++ ) {
				const u = p.a0 + ( bi + 0.5 ) * w.bay;
				const a = along( u - w.w / 2 ), b = along( u + w.w / 2 );
				C.blocked[ f.side ].push( [ Math.min( a, b ) - 0.05, Math.max( a, b ) + 0.05, w.sill - 0.04 ] );
				const h = Math.min( w.h, st.h - 0.12 - w.sill );
				C.windows.push( {
					side: f.side, a0: Math.min( a, b ), a1: Math.max( a, b ), y0: st.y + w.sill, y1: st.y + w.sill + h, style,
					key: winKey( f.ax + tx * u, f.az + tz * u, st.y + w.sill + h / 2 ), state: style === 6 || style === 11 || style === 13 ? 0 : winState( w.seed, bi ),
				} );
			}
		}
	}
	// open-plan edges to neighbours: keep them clear
	for ( const l of st.links ) {
		if ( l.kind !== 'open' || ( l.a !== rm && l.b !== rm ) ) continue;
		const o = l.a === rm ? l.b : l.a;
		if ( Math.abs( o.z1 - rm.z0 ) < 0.05 ) { addOpening( 0, Math.max( rm.x0, o.x0 ), Math.min( rm.x1, o.x1 ), 0.9 ); C.open[ 0 ] = 1; }
		if ( Math.abs( o.z0 - rm.z1 ) < 0.05 ) { addOpening( 2, Math.max( rm.x0, o.x0 ), Math.min( rm.x1, o.x1 ), 0.9 ); C.open[ 2 ] = 1; }
		if ( Math.abs( o.x1 - rm.x0 ) < 0.05 ) { addOpening( 3, Math.max( rm.z0, o.z0 ), Math.min( rm.z1, o.z1 ), 0.9 ); C.open[ 3 ] = 1; }
		if ( Math.abs( o.x0 - rm.x1 ) < 0.05 ) { addOpening( 1, Math.max( rm.z0, o.z0 ), Math.min( rm.z1, o.z1 ), 0.9 ); C.open[ 1 ] = 1; }
	}
	return C;
}

const overlaps = ( a, b ) => a[ 0 ] < b[ 2 ] && a[ 2 ] > b[ 0 ] && a[ 1 ] < b[ 3 ] && a[ 3 ] > b[ 1 ];
const free = ( C, r ) => r[ 0 ] >= C.x0 - 0.01 && r[ 2 ] <= C.x1 + 0.01 && r[ 1 ] >= C.z0 - 0.01 && r[ 3 ] <= C.z1 + 0.01 && ! C.used.some( u => overlaps( u, r ) ) && ! C.clear.some( u => overlaps( u, r ) );

// footprint rect [ x0, z0, x1, z1 ] of a wall piece
function wallRect( C, side, a, w, d ) {
	if ( side === 0 ) return [ a - w / 2, C.z0, a + w / 2, C.z0 + d ];
	if ( side === 2 ) return [ a - w / 2, C.z1 - d, a + w / 2, C.z1 ];
	if ( side === 3 ) return [ C.x0, a - w / 2, C.x0 + d, a + w / 2 ];
	return [ C.x1 - d, a - w / 2, C.x1, a + w / 2 ];
}

// find room for a piece against a wall: w wide, d deep, h high. sides in order of preference.
// Returns a frame (with .side and .a) or null. at: 'corner' | 'centre' | 'any'
function onWall( C, w, d, h, sides = [ 0, 1, 2, 3 ], at = 'any' ) {
	const R = C.O.R;
	for ( const side of sides ) {
		const lo = side === 0 || side === 2 ? C.x0 : C.z0, hi = side === 0 || side === 2 ? C.x1 : C.z1;
		const depthMax = side === 0 || side === 2 ? C.d : C.w;
		if ( d > depthMax - 0.6 || w > hi - lo ) continue;
		const cands = [];
		const n = Math.max( 1, Math.floor( ( hi - lo - w ) / 0.2 ) );
		for ( let k = 0; k <= n; k ++ ) cands.push( lo + w / 2 + ( hi - lo - w ) * ( n ? k / n : 0.5 ) );
		if ( at === 'centre' ) cands.sort( ( p, q ) => Math.abs( p - ( lo + hi ) / 2 ) - Math.abs( q - ( lo + hi ) / 2 ) );
		else if ( at === 'corner' ) cands.sort( ( p, q ) => Math.min( p - lo, hi - p ) - Math.min( q - lo, hi - q ) );
		else for ( let i = cands.length - 1; i > 0; i -- ) { const j = Math.floor( R() * ( i + 1 ) ); [ cands[ i ], cands[ j ] ] = [ cands[ j ], cands[ i ] ]; }
		for ( const a of cands ) {
			const a0 = a - w / 2, a1 = a + w / 2;
			if ( C.blocked[ side ].some( b => b[ 0 ] < a1 && b[ 1 ] > a0 && ( b[ 2 ] < 0 || h > b[ 2 ] ) ) ) continue;
			const r = wallRect( C, side, a, w, d );
			if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
			r[ 4 ] = h; // (pictures go above it, not behind it)
			C.used.push( r );
			return frameOnWall( C, side, a );
		}
	}
	return null;
}

function frameOnWall( C, side, a, g ) {
	const F = X.wallFrame( C, side, a, g );
	F.side = side; F.a = a;
	return F;
}

// a free spot for a free-standing piece (w along its local x, d along local z, centred), anywhere in the room
function inRoom( C, w, d, margin = 0.6, tries = 24, rotFree = true ) {
	const R = C.O.R;
	for ( let t = 0; t < tries; t ++ ) {
		const rot = rotFree && R() < 0.5 ? Math.PI / 2 : 0;
		const ew = rot ? d : w, ed = rot ? w : d;
		if ( ew + 2 * margin > C.w + 0.01 || ed + 2 * margin > C.d + 0.01 ) return null;
		const x = C.x0 + margin + ew / 2 + R() * Math.max( 0, C.w - 2 * margin - ew );
		const z = C.z0 + margin + ed / 2 + R() * Math.max( 0, C.d - 2 * margin - ed );
		const r = [ x - ew / 2, z - ed / 2, x + ew / 2, z + ed / 2 ];
		const rr = [ r[ 0 ] - 0.3, r[ 1 ] - 0.3, r[ 2 ] + 0.3, r[ 3 ] + 0.3 ];
		if ( C.used.some( u => overlaps( u, rr ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
		C.used.push( r );
		return frame( C.O, x, C.st.y, z, rot );
	}
	return null;
}
// the room centre (tables, beds in the middle)
function centre( C, w, d, rot = 0, dx = 0, dz = 0 ) {
	const x = ( C.x0 + C.x1 ) / 2 + dx, z = ( C.z0 + C.z1 ) / 2 + dz;
	const ew = rot ? d : w, ed = rot ? w : d;
	const r = [ x - ew / 2, z - ed / 2, x + ew / 2, z + ed / 2 ];
	if ( ew > C.w - 1.0 || ed > C.d - 1.0 || C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) return null;
	C.used.push( r );
	return frame( C.O, x, C.st.y, z, rot );
}
// a frame relative to another at (lx, lz) turned by a, if its local footprint [ x0, z0, x1, z1 ] is free
function nextTo( C, F, lx, lz, a, fp ) {
	const G = F.at( lx, 0, lz, a );
	let x0 = Infinity, z0 = Infinity, x1 = - Infinity, z1 = - Infinity;
	for ( const [ px, pz ] of [ [ fp[ 0 ], fp[ 1 ] ], [ fp[ 2 ], fp[ 1 ] ], [ fp[ 2 ], fp[ 3 ] ], [ fp[ 0 ], fp[ 3 ] ] ] ) {
		const [ x, z ] = G.T( px, pz );
		x0 = Math.min( x0, x ); x1 = Math.max( x1, x ); z0 = Math.min( z0, z ); z1 = Math.max( z1, z );
	}
	const r = [ x0, z0, x1, z1 ];
	if ( ! free( C, r ) ) return null;
	C.used.push( r );
	return G;
}
const opposite = ( s ) => ( s + 2 ) % 4;
// sides by the free length of wall, longest first
function sidesByLength( C ) {
	const len = ( s ) => {
		const L0 = s === 0 || s === 2 ? C.w : C.d;
		return L0 - C.blocked[ s ].reduce( ( t, b ) => t + ( b[ 2 ] < 0 ? b[ 1 ] - b[ 0 ] : ( b[ 1 ] - b[ 0 ] ) * 0.5 ), 0 );
	};
	return [ 0, 1, 2, 3 ].sort( ( a, b ) => len( b ) - len( a ) );
}

// ---- small pieces kept here ------------------------------------------------------------------------------------------

function table( F, w, d, h = 0.75, m = wood( WOODS[ 0 ] ), lootTable = null, p = 0.5 ) {
	F.box( - w / 2, h - 0.04, 0, w / 2, h, d, m );
	legs( F, - w / 2 + 0.04, 0.04, w / 2 - 0.04, d - 0.04, h - 0.04, m );
	F.col( - w / 2, 0, 0, w / 2, h, d, 1, 2 );
	if ( lootTable ) F.spot( ( F.O.R() - 0.5 ) * w * 0.6, h, d * ( 0.3 + F.O.R() * 0.4 ), lootTable, p );
	return F;
}

function counter( F, w, d = 0.6, h = 1.0, m = gloss( [ 200, 196, 186 ] ), topM = M( L.terrazzo, [ 230, 226, 216 ], 1.5, F_IN ) ) {
	F.box( - w / 2, 0.06, 0, w / 2, h - 0.04, d, m, 8 ).box( - w / 2 + 0.03, 0, 0.03, w / 2 - 0.03, 0.06, d - 0.03, BLACK, 8 );
	F.box( - w / 2 - 0.02, h - 0.04, - 0.02, w / 2 + 0.02, h, d + 0.04, topM );
	F.col( - w / 2, 0, 0, w / 2, h, d, 1 );
	F.shadow( - w / 2, 0, w / 2, d, 0.6 );
	return F;
}

function register( F, x, h, z, loot = 'convenience' ) {
	F.box( x - 0.2, h, z - 0.18, x + 0.2, h + 0.12, z + 0.18, paint( [ 50, 50, 54 ] ) );
	F.rbox( x, h + 0.25, z - 0.08, 0.15, 0.1, 0.012, gloss( [ 20, 20, 22 ] ), 0, 0.3 );
	F.container( x - 0.2, h, z - 0.18, x + 0.2, h + 0.32, z + 0.18, 'Register', loot, 4, { n: 1, empty: 0.5 } );
	return F;
}

function bunk( F, loot = 'military_locker', double = true ) {
	const R = F.O.R;
	const fm = metal( [ 70, 84, 64 ] ), mat = cloth( [ 110, 116, 90 ] ), sheet = cloth( [ 214, 210, 196 ] ), blanket = cloth( pickOf( R, [ [ 90, 96, 70 ], [ 60, 70, 90 ], [ 120, 50, 40 ] ] ) );
	const L2 = 2.0, w = 0.9;
	for ( const [ px, pz ] of [ [ - w / 2, 0 ], [ w / 2 - 0.05, 0 ], [ - w / 2, L2 - 0.05 ], [ w / 2 - 0.05, L2 - 0.05 ] ] ) F.box( px, 0, pz, px + 0.05, double ? 1.75 : 0.8, pz + 0.05, fm );
	for ( const y of double ? [ 0.35, 1.3 ] : [ 0.35 ] ) {
		F.box( - w / 2, y, 0, w / 2, y + 0.06, L2, fm );
		F.box( - w / 2 + 0.03, y + 0.06, 0.02, w / 2 - 0.03, y + 0.2, L2 - 0.02, mat );
		F.rbox( 0, y + 0.22, L2 * 0.6, w / 2 - 0.02, 0.02, L2 * 0.38, blanket, R() * 0.1 - 0.05 );
		F.box( - 0.28, y + 0.2, 0.08, 0.28, y + 0.28, 0.4, sheet );
	}
	if ( double ) for ( let k = 0; k < 4; k ++ ) F.box( w / 2 - 0.05, 0.5 + k * 0.28, L2 - 0.05, w / 2, 0.52 + k * 0.28, L2, fm );
	F.col( - w / 2, 0, 0, w / 2, 0.6, L2, 2, 2 );
	F.bed( - w / 2, 0, 0, w / 2, 0.6, L2, 0.85, 'Sleep' );
	// footlocker at the foot, a helmet or a bag on the bunk sometimes
	F.box( - 0.35, 0, L2 + 0.05, 0.35, 0.4, L2 + 0.45, M( L.wood, [ 90, 100, 70 ], 1, F_IN ) ).box( - 0.36, 0.38, L2 + 0.04, 0.36, 0.42, L2 + 0.46, M( L.wood, [ 80, 90, 60 ], 1, F_IN ) );
	F.col( - 0.35, 0, L2 + 0.05, 0.35, 0.42, L2 + 0.45, 1, 2 );
	F.container( - 0.35, 0, L2 + 0.05, 0.35, 0.42, L2 + 0.45, 'Footlocker', loot, 30 );
	const f = F.fine();
	if ( R() < 0.4 ) f.cyl( ( R() - 0.5 ) * 0.4, 0.61, 1.2, 0.14, 0.12, 10, paint( [ 80, 90, 60 ] ), 3, 0.1 );
	if ( R() < 0.3 ) f.rbox( 0, 0.7, 1.5, 0.2, 0.12, 0.28, cloth( [ 90, 96, 70 ] ), R() );
	F.shadow( - w / 2, 0, w / 2, L2 + 0.45, 0.6 );
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
	F.shadow( - w / 2, 0, w / 2, d, 0.7 );
	return F;
}
// a stack of cardboard cartons (searchable)
function cartons( F, loot, label = 'Boxes' ) {
	const R = F.O.R;
	const n = 1 + ( R() * 3 | 0 );
	let y = 0;
	for ( let k = 0; k < n; k ++ ) {
		const w = 0.45 + R() * 0.2, d = 0.35 + R() * 0.15, h = 0.28 + R() * 0.15;
		F.rbox( ( R() - 0.5 ) * 0.1, y + h / 2, 0.3 + ( R() - 0.5 ) * 0.1, w / 2, h / 2, d / 2, card(), ( R() - 0.5 ) * 0.4 );
		y += h;
	}
	F.col( - 0.35, 0, 0.05, 0.35, y, 0.55, 1, 2 );
	F.container( - 0.35, 0, 0.05, 0.35, y, 0.55, label, loot, 30 );
	F.shadow( - 0.35, 0.05, 0.35, 0.55, 0.6 );
	return F;
}

function palletRack( F, len, loot = 'warehouse', levels = 3 ) {
	const R = F.O.R;
	const up = paint( [ 40, 80, 150 ] ), beam = paint( [ 230, 120, 30 ] );
	const d = 1.1, h = levels * 1.5;
	const bays = Math.max( 1, Math.round( len / 2.7 ) ), bw = len / bays;
	for ( let i = 0; i <= bays; i ++ ) {
		const x = - len / 2 + i * bw;
		F.box( x - 0.05, 0, 0, x + 0.05, h, 0.08, up ).box( x - 0.05, 0, d - 0.08, x + 0.05, h, d, up );
		for ( let k = 0; k < levels * 2; k ++ ) F.rbox( x, 0.4 + k * 0.7, d / 2, 0.015, 0.015, d / 2, up );
	}
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
		F.box( a + 0.05, y + 0.14, 0.12, a + bw - 0.35, y + 0.14 + bh, d - 0.12, R() < 0.7 ? card() : M( L.plain, [ [ 170, 170, 170 ], [ 60, 90, 140 ], [ 200, 190, 170 ] ][ ( R() * 3 ) | 0 ], 1, F_IN ) );
	}
	F.col( - len / 2, 0, 0, len / 2, h, d, 2 );
	for ( let i = 0; i < bays; i += 2 ) F.container( - len / 2 + i * bw, 0, 0, - len / 2 + ( i + 1 ) * bw, 1.4, d, 'Pallet', loot, 80 );
	F.shadow( - len / 2, 0, len / 2, d, 0.6 );
	return F;
}

function pew( F, w ) {
	const m = wood( [ 120, 80, 50 ] );
	F.box( - w / 2, 0.42, 0, w / 2, 0.46, 0.42, m );
	F.box( - w / 2, 0.46, 0.38, w / 2, 0.95, 0.43, m );
	F.box( - w / 2, 0, 0, - w / 2 + 0.05, 0.95, 0.45, m ).box( w / 2 - 0.05, 0, 0, w / 2, 0.95, 0.45, m );
	F.col( - w / 2, 0, 0, w / 2, 0.95, 0.45, 1, 2 );
	if ( F.O.R() < 0.3 ) { const f = F.fine(); book( f, ( F.O.R() - 0.5 ) * w * 0.8, 0.46, 0.2, F.O.R() * 3, [ 30, 30, 60 ] ); }
	return F;
}

function schoolDesk( F ) {
	const R = F.O.R;
	const m = wood( [ 200, 170, 120 ] ), fm = metal( [ 70, 90, 120 ] );
	F.box( - 0.35, 0.7, 0, 0.35, 0.73, 0.5, m );
	legs( F, - 0.33, 0.02, 0.33, 0.48, 0.7, fm, 0.03 );
	F.col( - 0.35, 0, 0, 0.35, 0.73, 0.5, 1, 2 );
	if ( R() < 0.5 ) { const f = F.fine(); book( f, ( R() - 0.5 ) * 0.3, 0.73, 0.25, R(), pickOf( R, [ [ 200, 60, 40 ], [ 40, 90, 160 ], [ 60, 140, 60 ] ] ), 0.2, 0.26, 0.012 ); }
	H.chair( F.at( 0, 0, - 0.3, 0 ), wood( [ 200, 170, 120 ] ), R() < 0.1 );
	return F;
}

function washer( F, n ) {
	const w = n * 0.7;
	for ( let i = 0; i < n; i ++ ) {
		const a = - w / 2 + i * 0.7;
		F.box( a + 0.02, 0, 0, a + 0.68, 0.9, 0.65, gloss( [ 236, 236, 232 ] ) ).box( a + 0.04, 0.9, 0.02, a + 0.66, 0.98, 0.12, gloss( [ 220, 220, 216 ] ) );
		F.cyl( a + 0.35, 0.45, 0.65, 0.2, 0.02, 14, gloss( [ 60, 70, 80 ] ) ).cyl( a + 0.35, 0.45, 0.67, 0.22, 0.01, 14, CHROME, 0 );
	}
	F.col( - w / 2, 0, 0, w / 2, 0.98, 0.65, 2 );
	F.shadow( - w / 2, 0, w / 2, 0.65, 0.7 );
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
	for ( const hy of [ 0.1, 1.05, 2.25 ] ) {
		if ( alongX ) O.g.box( x0, y + hy, z0 - 0.02, x1, y + hy + 0.05, z0 + 0.02, m );
		else O.g.box( x0 - 0.02, y + hy, z0, x0 + 0.02, y + hy + 0.05, z1, m );
	}
	O.col( x0 - 0.03, y, z0 - 0.03, alongX ? x1 : x0 + 0.03, y + 2.3, alongX ? z0 + 0.03 : z1, 2, 2 );
}

// ---- recipes -----------------------------------------------------------------------------------------------------------

export function furnishRoom( O, P, st, rm, fin ) {
	void fin;
	if ( rm.k === 'stair' || rm.k === 'elevator' || rm.roofOnly ) return;
	const C = roomCtx( O, P, st, rm );
	if ( C.w < 0.8 || C.d < 0.8 ) return;
	O.roomSpots = 0;
	const R = O.R;
	const t = P.S.type, arch = P.S.arch;
	const shop = rm.shop || P.S.shop || t;
	const mil = t === 'barracks' || t === 'mil_hq' || t === 'armory' || t === 'mil_tent';
	// (shop units carry a unit number too: only flats and hotel rooms in towers are homes)
	const home = !! HOMEY[ arch ] || ( arch === 'tower' && P.S.variant !== 'office' && rm.unit !== undefined );
	C.home = home; C.mil = mil;
	// a house someone held out in: windows boarded from inside, the back door blocked, a camp in the living room
	const fort = home && P.boarded > 0.2 && ! rm.open;
	if ( fort ) barricades( C );
	let violence = 1, deadP = 0.05;
	switch ( rm.k ) {
		case 'living': case 'dayroom': living( C, rm.k === 'dayroom' ? 'fire_station' : 'house_living', fort ); break;
		case 'bedroom': bedroom( C, false ); break;
		case 'hotelroom': bedroom( C, true ); deadP = 0.08; break;
		case 'kitchen': kitchen( C, 'house_kitchen' ); break;
		case 'breakroom': breakroom( C, t === 'police' ? 'police' : 'office' ); break;
		case 'bath': case 'hbath': bathroom( C ); deadP = 0.04; break;
		case 'restroom': case 'latrine': restroom( C ); break;
		case 'hall': case 'entry': hall( C ); deadP = 0.03; break;
		case 'garage': case 'workshop': workshop( C, t, arch ); break;
		case 'dining': dining( C, shop ); break;
		case 'bar': barRoom( C ); break;
		case 'rkitchen': restaurantKitchen( C ); break;
		case 'sales': salesFloor( C, shop ); deadP = 0.07; break;
		case 'teller': teller( C ); break;
		case 'vault': vault( C ); break;
		case 'storage': case 'utility': case 'sorting': case 'rx': storage( C, shop, mil ); deadP = 0.03; break;
		case 'office': case 'meeting': case 'briefing': office( C, t, mil ); break;
		case 'openoffice': openOffice( C, t ); break;
		case 'lobby': case 'waiting': lobby( C, t ); deadP = 0.08; break;
		case 'corridor': corridor( C, t ); deadP = 0.07; break;
		case 'cells': cells( C ); deadP = 0.15; violence = 1.5; break;
		case 'armory': armory( C, mil ); break;
		case 'lockers': lockerRoom( C, t, mil ); break;
		case 'bay': apparatusBay( C ); break;
		case 'ward': ward( C ); deadP = 0.25; violence = 1.5; break;
		case 'exam': exam( C, t ); deadP = 0.12; break;
		case 'classroom': classroom( C ); break;
		case 'nave': nave( C ); deadP = 0.12; break;
		case 'vestry': { const w = onWall( C, 1.2, 0.6, 2.0, [ 2, 1, 3 ] ); if ( w ) H.wardrobe( w, 1.2, 'church', { label: 'Cabinet' } ); const d = onWall( C, 1.2, 0.7, 0.8, [ 1, 3, 0 ] ); if ( d ) H.desk( d, 1.2, 'church', { pc: false } ); break; }
		case 'hallbig': hallBig( C, t, shop, mil ); break;
		case 'dorm': case 'bunk': dorm( C, rm.k, mil ); break;
		case 'tent': tent( C ); break;
		case 'observatory': observatory( C ); break;
		case 'checkin': checkin( C ); break;
		case 'gate': gate( C ); break;
		case 'claim': claim( C ); break;
		case 'cab': cab( C ); break;
		case 'porch': { if ( R() < 0.6 ) { const f = inRoom( C, 0.7, 0.7, 0.3 ); if ( f ) H.chair( f, wood( [ 120, 90, 60 ] ), R() < 0.2 ); } if ( R() < 0.4 ) { const p = inRoom( C, 0.5, 0.5, 0.2 ); if ( p ) H.pottedPlant( p.at( 0, 0, 0 ), { big: false } ); } break; }
		case 'loggia': loggia( C ); break;
	}
	// sandbags stacked beside the doors of the bases and of a police station that made a stand
	if ( ( mil || ( t === 'police' && P.boarded > 0 ) ) && ! rm.open ) for ( const d of C.doors ) {
		if ( ! d.ext || R() < 0.3 ) continue;
		for ( const s of [ - 1, 1 ] ) { const a = s < 0 ? d.a0 - 0.95 : d.a1 + 0.95; const lo = d.side === 0 || d.side === 2 ? C.x0 : C.z0, hi = d.side === 0 || d.side === 2 ? C.x1 : C.z1; if ( a - 0.8 < lo || a + 0.8 > hi ) continue; const r = wallRect( C, d.side, a, 1.5, 0.5 ); if ( ! free( C, r ) ) continue; C.used.push( r ); T.sandbags( frameOnWall( C, d.side, a ), 1.5, 1.05 ); }
	}
	if ( ! rm.open ) {
		X.dressRoom( C, rm.k, { violence } );
		X.deadOf( C, { p: deadP * ( fort ? 1.5 : 1 ), sheet: t === 'hospital' || t === 'clinic', bag: t === 'hospital' } );
		if ( R() < ( home ? 0.1 : 0.05 ) ) { const b = inRoom( C, 0.6, 0.5, 0.5, 8 ); if ( b ) X.bag( b, home ? 'house_bedroom' : rm.k === 'hotelroom' || t === 'hotel' ? 'hotel_room' : 'zombie_civilian' ); }
		fixtures( C, t, arch );
		const art = ART_N[ rm.k ];
		if ( art ) wallArt( C, art, artSet( C, t, rm.k ), home || rm.k === 'hotelroom' );
		candle( C, fort ? 0.5 : { living: 0.1, bedroom: 0.08, kitchen: 0.06, hotelroom: 0.06, dining: 0.05, bar: 0.1, nave: 0.3, dayroom: 0.1 }[ rm.k ] || 0.02 );
	}
}

// ---- homes ---------------------------------------------------------------------------------------------------------------

function living( C, loot, fort ) {
	const O = C.O, R = O.R;
	const long = Math.max( C.w, C.d );
	const sw = Math.min( 2.3, long - 1.4 );
	const c = pickOf( R, SOFA );
	let sf = sw > 1.3 ? onWall( C, sw, 0.95, 0.8, sidesByLength( C ), 'centre' ) : null;
	if ( ! sf && sw > 1.3 ) sf = onWall( C, 1.6, 0.95, 0.8, [ 0, 1, 2, 3 ] );
	let tvF = null;
	if ( sf ) {
		const w = C.used[ C.used.length - 1 ];
		const realW = sf.side === 0 || sf.side === 2 ? w[ 2 ] - w[ 0 ] : w[ 3 ] - w[ 1 ];
		H.sofa( sf, realW, c, { loot } );
		// coffee table in front, an armchair at the end turned in, a side table with a lamp
		const depth = sf.side === 0 || sf.side === 2 ? C.d : C.w;
		const ctw = Math.min( 1.1, realW - 0.5 ), ctz = Math.min( 1.45, depth * 0.4 );
		const ct = nextTo( C, sf, 0, ctz, 0, [ - ctw / 2, - 0.28, ctw / 2, 0.28 ] );
		if ( ct ) { H.coffeeTable( ct, ctw, 0.56, { loot } ); if ( R() < 0.75 ) { const [ rx, rz ] = ct.T( 0, 0 ); H.rugOn( C, Math.min( 2.6, realW + 0.4 ), Math.min( 1.8, depth - 1.8 ), rx, rz, sf.rot, pickOf( R, [ [ 255, 255, 255 ], [ 200, 220, 255 ], [ 255, 230, 200 ], [ 220, 255, 220 ] ] ) ); } }
		for ( const s of R() < 0.5 ? [ 1, - 1 ] : [ - 1, 1 ] ) {
			const ac = nextTo( C, sf, s * ( realW / 2 + 0.75 ), 0.7, - s * 0.9, [ - 0.5, - 0.05, 0.5, 0.95 ] );
			if ( ac ) { H.sofa( ac.at( 0, 0, 0, 0 ), 1.0, R() < 0.5 ? c : pickOf( R, SOFA ), { loot } ); break; }
		}
		for ( const s of [ - 1, 1 ] ) { const st2 = nextTo( C, sf, s * ( realW / 2 + 0.3 ), 0.02, 0, [ - 0.25, 0, 0.25, 0.45 ] ); if ( st2 ) { H.sideTable( st2 ); break; } }
		tvF = onWall( C, 1.5, 0.45, 0.6, [ opposite( sf.side ) ], 'centre' ) || onWall( C, 1.2, 0.45, 0.6, [ opposite( sf.side ) ] );
	}
	if ( ! tvF ) tvF = onWall( C, 1.4, 0.45, 0.6, [ 0, 1, 2, 3 ] );
	if ( tvF ) H.tvUnit( tvF, 1.4 + ( R() < 0.5 ? 0.2 : 0 ), { loot, old: R() < 0.15 } );
	const bc = onWall( C, 0.9, 0.34, 1.9, [ 1, 3, 2, 0 ] );
	if ( bc ) H.bookcase( bc, 0.9, 1.9, { loot } );
	if ( long > 5 && R() < 0.6 ) { const bc2 = onWall( C, 0.8, 0.34, 1.9, [ 1, 3, 2, 0 ] ); if ( bc2 ) H.bookcase( bc2, 0.8, 1.9, { loot } ); }
	const fl = onWall( C, 0.35, 0.35, 1.6, [ 0, 1, 2, 3 ], 'corner' );
	if ( fl ) H.floorLamp( fl.at( 0, 0, 0.2 ) );
	for ( let i = 0; i < 1 + ( R() < 0.5 ? 1 : 0 ); i ++ ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 2, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ) ); }
	if ( C.rm.k === 'dayroom' ) { const k = onWall( C, Math.min( 3, C.w * 0.5 ), 0.62, 2.2, [ 2, 1, 3, 0 ] ); if ( k ) H.kitchenRun( k, Math.min( 3, C.w * 0.5 ), { loot: 'fire_station' } ); const tb = inRoom( C, 1.6, 0.9, 0.8 ); if ( tb ) H.diningSet( tb.at( 0, 0, 0 ), 1.6, 0.9, { loot: 'fire_station' } ); }
	// shoes and a bag by the front door
	const d = C.doors.find( x => x.ext );
	if ( d ) { const F = frameOnWall( C, d.side, ( d.a0 + d.a1 ) / 2 ); H.shoes( F, ( d.a1 - d.a0 ) / 2 + 0.35, 0.2, R() ); if ( R() < 0.5 ) H.shoes( F, - ( d.a1 - d.a0 ) / 2 - 0.35, 0.25, R() ); }
	floorClutter( C, 1 + ( R() * 3 | 0 ), [ SMALL.paper, SMALL.book, SMALL.can, SMALL.remote, SMALL.box ] );
	if ( fort ) camp( C );
	if ( R() < 0.7 ) ceilingFan( C );
}

// someone lived in here after it started: a mattress on the floor, candles, empty cans, water bottles
function camp( C ) {
	const R = C.O.R;
	const F = inRoom( C, 1.9, 0.9, 0.5 );
	if ( ! F ) return;
	F.box( - 0.95, 0, - 0.45, 0.95, 0.16, 0.45, cloth( [ 214, 210, 196 ] ) ).rbox( 0.1, 0.19, 0, 0.8, 0.03, 0.44, cloth( pickOf( R, BLANKET ) ), R() * 0.2 - 0.1 );
	F.bed( - 0.95, 0, - 0.45, 0.95, 0.2, 0.45, 0.7, 'Sleep' );
	F.col( - 0.95, 0, - 0.45, 0.95, 0.16, 0.45, 1, 2 );
	const f = F.fine();
	for ( let k = 0; k < 6; k ++ ) { const x = - 1.2 + R() * 0.5, z = - 0.6 + R() * 1.2; R() < 0.5 ? f.cylH( x, 0.033, z, 0.033, 0.11, 8, metal( pickOf( R, [ [ 200, 40, 36 ], [ 220, 180, 60 ] ] ) ), R() < 0.5 ? 'x' : 'z' ) : f.cyl( x, 0, z, 0.035, 0.25, 8, gloss( [ 170, 200, 220 ] ) ); }
	F.light( 1.15, 0, 0.3, R() < 0.5 ? 'lantern' : 'candle' );
	F.container( - 1.4, 0, - 0.5, - 0.95, 0.3, 0.5, 'Supplies', 'house_kitchen', 12, { n: 2, empty: 0.2 } );
}

function bedroom( C, hotel ) {
	const O = C.O, R = O.R;
	const loot = hotel ? 'hotel_room' : 'house_bedroom';
	const two = hotel && C.w > 4.6 && C.d > 3.6;
	const bw = hotel ? ( two ? 1.35 : 1.8 ) : C.w > 3.2 && C.d > 3.2 ? ( R() < 0.6 ? 1.55 : 1.35 ) : 0.95;
	const span = two ? bw * 2 + 0.7 : bw + 1.0;
	const cover = pickOf( R, BLANKET ), frameM = wood( pickOf( R, WOODS ) );
	let b = onWall( C, span, 2.05, 1.0, [ 2, 1, 3, 0 ], 'centre' );
	let tight = false;
	if ( ! b ) { b = onWall( C, bw + 0.04, 2.05, 1.0, [ 2, 1, 3, 0 ], 'centre' ); tight = true; }
	if ( b ) {
		const beds = two ? [ - ( bw / 2 + 0.35 ), bw / 2 + 0.35 ] : [ 0 ];
		for ( const x of beds ) H.bed( b.at( x, 0, 0 ), bw, 2.0, { cover: hotel ? [ 240, 240, 236 ] : cover, frameM, style: hotel ? 2 : undefined, messy: ! hotel || R() < 0.5 } );
		// nightstands on both sides (between the beds too)
		const ns = two ? [ 0, - ( bw + 0.65 ), bw + 0.65 ] : tight ? [] : [ - ( bw / 2 + 0.26 ), bw / 2 + 0.26 ];
		for ( const x of ns ) if ( hotel || R() < 0.8 ) H.nightstand( b.at( x, 0, 0 ), loot, { m: hotel ? wood( WOODS[ 3 ] ) : frameM } );
		// a suitcase on the bed, half packed
		if ( R() < ( hotel ? 0.35 : 0.15 ) ) H.openSuitcase( b, beds[ 0 ] + ( R() - 0.5 ) * 0.3, 0.56, 1.3, R() * 0.6 - 0.3, loot );
		if ( R() < 0.5 ) { const [ rx, rz ] = b.T( ( R() < 0.5 ? - 1 : 1 ) * ( span / 2 - 0.2 ), 1.2 ); if ( ! hotel ) H.rugOn( C, 0.8, 1.5, rx, rz, b.rot, pickOf( R, [ [ 255, 255, 255 ], [ 220, 220, 255 ] ] ) ); }
	}
	if ( hotel ) {
		const dr = onWall( C, 1.5, 0.5, 0.85, b ? [ opposite( b.side ), 1, 3, 0 ] : [ 0, 1, 3 ], 'centre' );
		if ( dr ) { H.dresser( dr, 1.5, loot, { mirror: false } ); dr.box( - 0.5, 0.88, 0.14, 0.5, 1.45, 0.18, BLACK ).box( - 0.48, 0.9, 0.18, 0.48, 1.43, 0.182, gloss( [ 12, 13, 15 ] ) ); }
		const d = onWall( C, 1.2, 0.6, 0.8, [ 1, 3, 0 ] );
		if ( d ) { H.desk( d, 1.2, loot, { pc: false, laptop: R() < 0.3, phone: true } ); }
		const ac = inRoom( C, 1.0, 1.0, 0.6 );
		if ( ac ) { H.sofa( ac.at( 0, 0, - 0.45, R() * 0.8 - 0.4 ), 0.95, pickOf( R, SOFA ), { loot } ); }
		const lr = onWall( C, 0.7, 0.45, 0.6, [ 0, 1, 3, 2 ] );
		if ( lr ) { lr.box( - 0.35, 0.45, 0.02, 0.35, 0.48, 0.44, gloss( [ 190, 160, 90 ] ) ); legs( lr, - 0.33, 0.04, 0.33, 0.42, 0.45, gloss( [ 190, 160, 90 ] ), 0.025 ); lr.col( - 0.35, 0, 0, 0.35, 0.48, 0.45, 1, 2 ); if ( R() < 0.7 ) H.openSuitcase( lr, 0, 0.48, 0.22, 0, loot ); }
		const fl = onWall( C, 0.35, 0.35, 1.6, [ 0, 1, 2, 3 ], 'corner' );
		if ( fl ) H.floorLamp( fl.at( 0, 0, 0.2 ) );
	} else {
		const wr = onWall( C, 1.2, 0.6, 2.0, [ 3, 1, 0, 2 ], 'corner' );
		if ( wr ) H.wardrobe( wr, 1.2, 'wardrobe' );
		const dr = onWall( C, 1.1, 0.5, 0.85, [ 0, 1, 3, 2 ] );
		if ( dr ) H.dresser( dr, 1.1, loot );
		if ( R() < 0.4 ) { const d = onWall( C, 1.1, 0.7, 0.8, [ 0, 1, 3 ] ); if ( d ) H.desk( d, 1.1, loot, { pc: R() < 0.3 } ); }
		if ( R() < 0.3 ) { const p = onWall( C, 0.4, 0.4, 1.0, [ 0, 1, 2, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.22 ), { big: false } ); }
		// clothes dropped on the floor, shoes, a laundry basket
		for ( let k = 0; k < 1 + ( R() * 3 | 0 ); k ++ ) { const f = inRoom( C, 0.5, 0.5, 0.4, 6 ); if ( f ) { C.used.pop(); H.clothesPile( f, 0, 0 ); } }
		const sh = inRoom( C, 0.3, 0.3, 0.3, 6 ); if ( sh ) { C.used.pop(); H.shoes( sh, 0, 0, R() * 3 ); }
		if ( R() < 0.4 ) { const lb = onWall( C, 0.45, 0.4, 0.6, [ 0, 1, 2, 3 ], 'corner' ); if ( lb ) { lb.cyl( 0, 0, 0.22, 0.18, 0.5, 10, gloss( pickOf( R, [ [ 240, 240, 236 ], [ 90, 140, 190 ] ] ) ), 2, 0.2 ); lb.fine().box( - 0.12, 0.45, 0.1, 0.14, 0.56, 0.32, cloth( pickOf( R, CLOTHES ) ) ); lb.col( - 0.2, 0, 0.02, 0.2, 0.5, 0.42, 1, 2 ); } }
		if ( R() < 0.12 ) { const ch = inRoom( C, 0.5, 0.5 ); if ( ch ) H.chair( ch, wood(), true ); }
	}
	if ( R() < 0.6 ) ceilingFan( C );
}

function kitchen( C, loot ) {
	const O = C.O, R = O.R;
	const sides = sidesByLength( C );
	const len = Math.min( 4.2, Math.max( C.w, C.d ) - 0.9 );
	let k = null, kl = 0;
	for ( const s of sides ) {
		const l = Math.floor( Math.min( len, ( s === 0 || s === 2 ? C.w : C.d ) - 0.9 ) / 0.6 ) * 0.6;
		if ( l < 1.2 ) continue;
		k = onWall( C, l, 0.62, 0.93, [ s ], 'corner' );
		if ( k ) { kl = l; break; }
	}
	if ( ! k ) { kl = 1.8; k = onWall( C, kl, 0.62, 0.93, [ 0, 1, 2, 3 ] ); }
	const body = pickOf( R, [ [ 238, 236, 228 ], [ 150, 110, 76 ], [ 90, 110, 100 ], [ 200, 190, 170 ], [ 120, 140, 160 ], [ 70, 60, 54 ] ] );
	if ( k ) {
		H.kitchenRun( k, kl, { loot, body, upperAt: upperFree( C, k ) } );
		// an L round the corner in a big kitchen
		for ( const side2 of [ ( k.side + 1 ) % 4, ( k.side + 3 ) % 4 ] ) {
			if ( Math.min( C.w, C.d ) < 2.8 || R() > 0.6 ) break;
			const k2 = onWall( C, 1.8, 0.62, 0.93, [ side2 ], 'corner' );
			if ( k2 ) { H.kitchenRun( k2, 1.8, { loot, body, upperAt: upperFree( C, k2 ) } ); break; }
		}
	}
	const f = onWall( C, 0.78, 0.74, 1.8, [ 1, 3, 2, 0 ], 'corner' );
	if ( f ) H.fridge( f, 'fridge' );
	for ( const [ tw, td ] of [ [ 1.4, 0.85 ], [ 1.1, 0.8 ], [ 0.8, 0.8 ] ] ) {
		if ( tw > C.w - 1.6 || td > C.d - 2.2 ) continue;
		let tb = null;
		for ( const [ dx, dz ] of [ [ 0, 0 ], [ 0, 0.4 ], [ 0, - 0.4 ], [ 0.6, 0 ], [ - 0.6, 0 ], [ 1.2, 0 ], [ - 1.2, 0 ], [ 0.6, 0.4 ], [ - 0.6, - 0.4 ], [ 1.2, 0.4 ], [ - 1.2, 0.4 ] ] ) if ( ( tb = centre( C, tw + 0.3, td + 1.0, 0, dx, dz ) ) ) break;
		if ( ! tb ) tb = inRoom( C, tw + 0.3, td + 1.0, 0.05, 40, true );
		if ( tb ) { H.diningSet( tb, tw, td, { loot } ); break; }
	}
	// a bin, a mop and bucket
	const bn = onWall( C, 0.35, 0.35, 0.6, [ 0, 1, 2, 3 ] );
	if ( bn ) { bn.cyl( 0, 0, 0.18, 0.15, 0.55, 10, gloss( pickOf( R, [ [ 200, 200, 204 ], [ 40, 40, 42 ], [ 240, 240, 236 ] ] ) ) ); bn.col( - 0.16, 0, 0.02, 0.16, 0.55, 0.34, 2, 2 ); if ( R() < 0.5 ) bn.fine().rbox( 0.3, 0.14, 0.3, 0.15, 0.14, 0.12, gloss( [ 30, 30, 32 ] ), R() ); }
	floorClutter( C, R() * 3 | 0, [ SMALL.can, SMALL.tin, SMALL.box, SMALL.bottle, SMALL.plate ] );
}

// which stretches of a counter run (local x of frame F) have wall above them for cabinets: not under windows
function upperFree( C, F ) {
	const sgn = F.side === 0 || F.side === 1 ? 1 : - 1;
	const spans = C.blocked[ F.side ].filter( b => b[ 2 ] >= 0 && b[ 2 ] < 2.1 || b[ 2 ] < 0 ).map( b => [ ( b[ 0 ] - F.a ) * sgn, ( b[ 1 ] - F.a ) * sgn ].sort( ( p, q ) => p - q ) );
	return ( a0, a1 ) => ! spans.some( ( [ p, q ] ) => p < a1 - 0.05 && q > a0 + 0.05 );
}

function breakroom( C, loot ) {
	const R = C.O.R;
	const k = onWall( C, Math.min( 3, Math.max( C.w, C.d ) - 1.2 ), 0.62, 2.2, sidesByLength( C ), 'corner' );
	if ( k ) H.kitchenRun( k, Math.min( 3, Math.max( C.w, C.d ) - 1.2 ), { loot, body: [ 200, 200, 196 ] } );
	const f = onWall( C, 0.78, 0.74, 1.8, [ 1, 3, 2, 0 ], 'corner' ); if ( f ) H.fridge( f, 'fridge' );
	const v = onWall( C, 0.9, 0.82, 1.9, [ 0, 1, 3, 2 ] ); if ( v ) T.vending( v, 'convenience' );
	const wc = onWall( C, 0.34, 0.34, 1.4, [ 0, 1, 3, 2 ] ); if ( wc ) T.waterCooler( wc );
	const tb = centre( C, 2.0, 1.8 ) || inRoom( C, 1.8, 1.7, 0.2 ); if ( tb ) H.diningSet( tb.at( 0, 0, 0 ), 1.2, 0.8, { loot, chair: metal( [ 60, 64, 70 ] ) } );
	void R;
}

function bathroom( C ) {
	const O = C.O, R = O.R;
	const long = Math.max( C.w, C.d );
	const tl = onWall( C, 0.5, 0.7, 0.8, [ 2, 1, 3, 0 ], 'corner' );
	if ( tl ) H.toilet( tl );
	const vw = C.w > 2 || C.d > 2 ? 0.8 : 0.62;
	const b = onWall( C, vw, 0.5, 1.0, [ 0, 1, 3, 2 ] ) || onWall( C, vw, 0.5, 2.0, [ 0, 1, 3, 2 ] );
	if ( b ) H.vanity( b, vw, 'medicine_cabinet' );
	const tubL = Math.min( 1.7, ( C.w > C.d ? C.w : C.d ) - 0.02 );
	let tub = null;
	if ( long > 1.65 && Math.min( C.w, C.d ) > 1.5 ) tub = onWall( C, tubL, 0.76, 2.1, [ 2, 3, 1, 0 ], 'corner' );
	if ( tub ) H.bathtub( tub, tubL );
	else { const sh = onWall( C, 0.9, 0.95, 2.1, [ 2, 3, 1, 0 ], 'corner' ); if ( sh ) H.showerStall( sh, 0.9 ); }
	const tr = onWall( C, 0.6, 0.12, 1.3, [ 1, 3, 0, 2 ] );
	if ( tr ) { H.towelRail( tr, 0.6 ); C.used.pop(); }
	const mat = inRoom( C, 0.8, 0.5, 0.3, 6 );
	if ( mat ) { C.used.pop(); mat.fine().box( - 0.4, 0, - 0.25, 0.4, 0.012, 0.25, cloth( pickOf( R, [ [ 90, 150, 190 ], [ 240, 240, 236 ], [ 200, 120, 110 ], [ 150, 200, 170 ] ] ) ), 8 ); }
	if ( R() < 0.5 ) { const bn = onWall( C, 0.25, 0.25, 0.5, [ 0, 1, 2, 3 ] ); if ( bn ) bn.cyl( 0, 0, 0.13, 0.11, 0.3, 10, gloss( [ 236, 236, 232 ] ) ); }
}

function restroom( C ) {
	const R = C.O.R;
	const n = Math.max( 1, Math.min( 5, Math.floor( ( Math.max( C.w, C.d ) - 1.2 ) / 1.0 ) ) );
	const alongX = C.w >= C.d;
	const part = gloss( pickOf( R, [ [ 190, 200, 196 ], [ 150, 170, 190 ], [ 200, 190, 170 ] ] ) );
	for ( let i = 0; i < n; i ++ ) {
		const f = onWall( C, 0.9, 0.7, 0.8, alongX ? [ 2, 0 ] : [ 1, 3 ] );
		if ( ! f ) break;
		H.toilet( f, { roll: true } );
		// stall partitions and a door left open
		f.box( 0.45, 0.15, 0, 0.48, 1.9, 1.35, part ).box( - 0.48, 0.15, 0, - 0.45, 1.9, 1.35, part ).col( 0.45, 0, 0, 0.48, 1.9, 1.35, 2 ).col( - 0.48, 0, 0, - 0.45, 1.9, 1.35, 2 );
		const a = 0.5 + R() * 1.1;
		f.rbox( - 0.45 + Math.cos( a ) * 0.42, 1.02, 1.35 + Math.sin( a ) * 0.42, 0.42, 0.87, 0.015, part, - a );
	}
	for ( let i = 0; i < Math.min( 3, n ); i ++ ) { const b = onWall( C, 0.62, 0.5, 1.0, alongX ? [ 0, 2 ] : [ 3, 1 ] ); if ( b ) H.vanity( b, 0.62, null, { mirror: i === 0 } ); }
	if ( R() < 0.5 ) { const bn = onWall( C, 0.4, 0.4, 0.9, [ 0, 1, 2, 3 ] ); if ( bn ) bn.box( - 0.18, 0, 0.02, 0.18, 0.75, 0.38, gloss( [ 200, 200, 204 ] ) ).col( - 0.18, 0, 0.02, 0.18, 0.75, 0.38, 2, 2 ); }
}

function hall( C ) {
	const R = C.O.R;
	if ( C.w > 1.3 && C.d > 1.3 && R() < 0.6 ) {
		const f = onWall( C, 1.0, 0.36, 0.85, [ 0, 1, 2, 3 ] );
		if ( f ) {
			const m = wood( pickOf( R, WOODS ) );
			f.box( - 0.5, 0.78, 0, 0.5, 0.82, 0.36, m ); legs( f, - 0.48, 0.02, 0.48, 0.34, 0.78, m, 0.035 );
			f.col( - 0.5, 0, 0, 0.5, 0.82, 0.36, 1, 2 ).container( - 0.5, 0.6, 0, 0.5, 0.82, 0.36, 'Drawers', 'house_living', 8, { n: 1 } );
			const ff = f.fine(); H.tableLamp( f, 0.3, 0.82, 0.18 ); SMALL.bowl( ff, - 0.15, 0.82, 0.18, R ); ff.box( - 0.1, 0.82, 0.12, - 0.02, 0.83, 0.18, CHROME );
			f.spot( 0, 0.82, 0.18, 'house_living', 0.35 );
		}
	}
	// coat hooks with a jacket or two, shoes below
	const hk = onWall( C, 0.8, 0.2, 1.9, [ 1, 3, 0, 2 ] );
	if ( hk ) { const f = hk.fine(); f.box( - 0.4, 1.6, 0, 0.4, 1.68, 0.03, wood( WOODS[ 3 ] ) ); for ( let k = 0; k < 2 + ( R() * 2 | 0 ); k ++ ) f.box( - 0.3 + k * 0.22, 0.95 + R() * 0.2, 0.03, - 0.12 + k * 0.22, 1.62, 0.16, cloth( pickOf( R, CLOTHES ) ) ); H.shoes( hk, ( R() - 0.5 ) * 0.4, 0.2, R() ); }
	floorClutter( C, R() * 2 | 0, [ SMALL.paper, SMALL.box ] );
}

function ceilingFan( C ) {
	const F = frame( C.O, ( C.x0 + C.x1 ) / 2, C.st.y, ( C.z0 + C.z1 ) / 2, C.O.R() * 3 );
	H.ceilingFan( F, C.ceil );
	C.fixture = true;
}

// small things dropped on the floor, clear of doors
function floorClutter( C, n, makers ) {
	const R = C.O.R;
	for ( let i = 0; i < n; i ++ ) {
		const x = C.x0 + 0.3 + R() * Math.max( 0, C.w - 0.6 ), z = C.z0 + 0.3 + R() * Math.max( 0, C.d - 0.6 );
		const r = [ x - 0.15, z - 0.15, x + 0.15, z + 0.15 ];
		if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
		pickOf( R, makers )( frame( C.O, x, C.st.y, z, 0, C.O.gd ), 0, 0, 0, R );
	}
}

// ---- garages and workshops ---------------------------------------------------------------------------------------------------

// the frame for H.car() with the car's centre at (x, z) and its nose along the world direction d = [ dx, dz ]
function carFrame( O, x, y, z, d ) {
	const th = Math.atan2( - d[ 1 ], d[ 0 ] );
	return frame( O, x - Math.sin( th ) * 1.19, y, z - Math.cos( th ) * 1.19, th );
}

function workshop( C, t, arch ) {
	const O = C.O, R = O.R;
	const shopFloor = t === 'garage' || t === 'hangar' || arch === 'hangar';
	const loot = shopFloor ? ( t === 'hangar' ? 'hangar' : 'garage_shop' ) : 'house_garage';
	// the cars: one up on a lift, one on the floor with its bonnet up (a big workshop)
	if ( shopFloor && C.w > 6 && C.d > 7 ) {
		const alongZ = C.d > C.w;
		const lanes = Math.max( 1, Math.min( 3, Math.floor( ( alongZ ? C.w : C.d ) / 4.2 ) ) );
		for ( let i = 0; i < lanes; i ++ ) {
			const across = ( alongZ ? C.x0 : C.z0 ) + ( i + 0.5 ) * ( alongZ ? C.w : C.d ) / lanes;
			const mid = alongZ ? ( C.z0 + C.z1 ) / 2 + 0.8 : ( C.x0 + C.x1 ) / 2 + 0.8;
			// the car's local x runs along the bay, its body centred 1.19 m from the frame's z = 0
			const F = alongZ ? frame( O, across + 1.19, C.st.y, mid, - Math.PI / 2 ) : frame( O, mid, C.st.y, across - 1.19, 0 );
			const r = alongZ ? [ across - 1.6, mid - 2.5, across + 1.6, mid + 2.5 ] : [ mid - 2.5, across - 1.6, mid + 2.5, across + 1.6 ];
			if ( ! free( C, r ) ) continue;
			C.used.push( r );
			if ( i === 0 || R() < 0.4 ) H.carLift( F, 4.6, 1.5 + R() * 0.3 );
			else if ( R() < 0.7 ) H.car( F, { hood: R() < 0.6 } );
			O.decalAt( F, ( R() - 0.5 ) * 2, 1.2, 1.4, 'oil' );
		}
	} else if ( Math.min( C.w, C.d ) > 3.2 && Math.max( C.w, C.d ) > 4.5 && R() < 0.65 ) {
		// the family car, driven in nose first
		const roll = C.doors.find( d => d.ext && d.kind === 'roll' );
		const side = roll ? roll.side : C.d > C.w ? 0 : 3;
		const alongZ = side === 0 || side === 2;
		const len = Math.min( 4.4, ( alongZ ? C.d : C.w ) - 0.3 );
		// up against the garage door or shifted aside, clear of the door into the house
		const room = ( alongZ ? C.d : C.w ) - len;
		for ( const [ da, db ] of [ [ 0, 0 ], [ - 1, 0 ], [ 0, - 0.4 ], [ 0, 0.4 ], [ - 1, - 0.4 ], [ - 1, 0.4 ], [ 1, 0 ] ] ) {
			// da: along the car (-1 = right behind the garage door), db: sideways
			const off = da * ( room / 2 - 0.35 ) * ( side === 0 || side === 3 ? 1 : - 1 );
			const mx = ( C.x0 + C.x1 ) / 2 + ( alongZ ? db : off ), mz = ( C.z0 + C.z1 ) / 2 + ( alongZ ? off : db );
			const r = alongZ ? [ mx - 1.0, mz - len / 2, mx + 1.0, mz + len / 2 ] : [ mx - len / 2, mz - 1.0, mx + len / 2, mz + 1.0 ];
			if ( ! free( C, r ) || len < 3.8 ) continue;
			C.used.push( r );
			const F = carFrame( O, mx, C.st.y, mz, [ [ 0, 1 ], [ - 1, 0 ], [ 0, - 1 ], [ 1, 0 ] ][ side ] );
			H.car( F, { hood: R() < 0.3, len } ); O.decalAt( F, 0, 1.19, 1.4, 'oil' );
			break;
		}
	}
	const nb = shopFloor ? 3 : 1;
	for ( let i = 0; i < nb; i ++ ) { const wb = onWall( C, 1.8, 0.72, 1.95, [ 2, 1, 3 ] ); if ( wb ) H.workbench( wb, 1.8, 'toolbox', loot ); }
	for ( let i = 0; i < ( shopFloor ? 3 : 1 ); i ++ ) { const sh = onWall( C, 1.8, 0.5, 1.9, [ 1, 3, 2 ] ); if ( sh ) H.storageShelf( sh, 1.8, 1.9, 0.5, loot ); }
	const tc = onWall( C, 0.8, 0.5, 1.35, [ 2, 1, 3 ] ); if ( tc ) H.toolChest( tc, 'toolbox' );
	for ( let i = 0; i < ( shopFloor ? 4 : 2 ); i ++ ) { const f = onWall( C, 0.7, 0.72, 1.0, [ 3, 1, 2 ] ); if ( f ) ( i % 2 ? H.drum( f, pickOf( R, [ [ 150, 40, 30 ], [ 40, 80, 150 ], [ 60, 90, 60 ] ] ) ) : H.tyreStack( f, 2 + ( R() * 4 | 0 ) ) ); }
	for ( let i = 0; i < 2; i ++ ) { const j = inRoom( C, 0.4, 0.3, 0.3, 8 ); if ( j ) { C.used.pop(); H.jerryCan( j, 0, 0, R() * 3 ); } }
	if ( ! shopFloor && R() < 0.5 ) { const b = onWall( C, 1.2, 0.4, 1.1, [ 1, 3, 0, 2 ] ); if ( b ) H.bicycle( b, 0, 0.2, 0 ); }
	for ( let i = 0; i < 2; i ++ ) if ( R() < 0.7 ) O.decalFloor( C.x0 + 1 + R() * Math.max( 0, C.w - 2 ), C.st.y + 0.006, C.z0 + 1 + R() * Math.max( 0, C.d - 2 ), 1.2 + R(), DECAL.oil, R() * 6 );
	floorClutter( C, 2, [ SMALL.can, SMALL.bottle, SMALL.box ] );
}

// ---- food and drink --------------------------------------------------------------------------------------------------------------

function dining( C, shop ) {
	const R = C.O.R;
	if ( C.home ) {
		// a family dining room: the table, a sideboard with the good plates, pictures
		for ( const [ tw, td ] of [ [ 1.8, 0.95 ], [ 1.4, 0.85 ], [ 1.0, 0.8 ] ] ) { const tb = centre( C, tw + 0.3, td + 1.0 ); if ( tb ) { H.diningSet( tb, tw, td, { loot: 'house_kitchen' } ); break; } }
		const sb = onWall( C, 1.4, 0.46, 0.9, [ 0, 1, 2, 3 ] ); if ( sb ) H.dresser( sb, 1.4, 'house_kitchen', { mirror: false } );
		const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 2, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ) );
		return;
	}
	const food = shop === 'bar' ? 'bar' : SHOP_TABLE[ shop ] || 'restaurant';
	const ctw = Math.min( 4, C.w - 1.5 );
	const ct = ctw > 1.5 ? onWall( C, ctw, 0.64, 2.2, [ 2, 1, 3 ] ) : null;
	if ( ct ) { counter( ct, ctw, 0.6, 1.05, wood( [ 150, 100, 60 ] ) ); register( ct, ctw / 2 - 0.4, 1.05, 0.3, food ); ct.spot( - 0.6, 1.05, 0.3, food, 0.5 ); T.menuBoard( ct, ctw, 1.9 ); }
	// booths down a side wall
	for ( const s of [ 1, 3 ] ) for ( let i = 0; i < 4; i ++ ) { const b = onWall( C, 2.0, 1.25, 1.2, [ s ] ); if ( b ) T.booth( b, food ); }
	tableGrid( C, 0.8, 0.8, 1.9, food );
	for ( let i = 0; i < 2; i ++ ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ) ); }
}

function barRoom( C ) {
	const O = C.O, R = O.R;
	const len = Math.min( 5, Math.max( C.w, C.d ) - 1.6 );
	const bb = onWall( C, len, 0.45, 2.2, [ 2, 1, 3 ] );
	if ( bb ) {
		// the back bar: bottles on shelves before a mirror, a cabinet under
		bb.box( - len / 2, 0, 0, len / 2, 0.9, 0.45, wood( [ 90, 60, 40 ] ) ).col( - len / 2, 0, 0, len / 2, 0.9, 0.45, 1 );
		bb.box( - len / 2 + 0.1, 1.15, 0.005, len / 2 - 0.1, 2.2, 0.01, gloss( [ 150, 160, 166 ] ) );
		const f = bb.fine();
		for ( let k = 0; k < 3; k ++ ) {
			bb.box( - len / 2, 1.2 + k * 0.35, 0, len / 2, 1.23 + k * 0.35, 0.25, wood( [ 90, 60, 40 ] ) );
			for ( let i = 0; i < len / 0.11; i ++ ) if ( R() < 0.65 ) f.cyl( - len / 2 + 0.06 + i * 0.11, 1.23 + k * 0.35, 0.12, 0.035, 0.18, 6, gloss( pickOf( R, [ [ 60, 110, 50 ], [ 120, 70, 30 ], [ 220, 220, 210 ], [ 40, 40, 30 ], [ 170, 40, 30 ] ] ) ), 1, 0.012 ).cyl( - len / 2 + 0.06 + i * 0.11, 1.41 + k * 0.35, 0.12, 0.012, 0.07, 4, BLACK );
		}
		bb.container( - len / 2, 0, 0, len / 2, 0.9, 0.45, 'Cabinet', 'bar', 12 );
		bb.spot( 0.5, 0.9, 0.25, 'bar', 0.6 );
		const fc = bb.at( 0, 0, 1.4, 0 );
		counter( fc, len, 0.6, 1.1, wood( [ 120, 80, 50 ] ), wood( [ 70, 40, 24 ] ) );
		const [ cx, cz ] = fc.T( 0, 0.3 );
		C.used.push( [ cx - len / 2 - 0.5, cz - 1.0, cx + len / 2 + 0.5, cz + 1.0 ] );
		fc.spot( 0, 1.1, 0.3, 'bar', 0.5 );
		for ( let i = 0; i < Math.floor( len / 0.7 ); i ++ ) { const sx = - len / 2 + 0.35 + i * 0.7; if ( R() < 0.15 ) fc.rbox( sx, 0.2, 1.1, 0.19, 0.2, 0.19, CHROME, 0, 1.4 ); else T.barStool( fc.at( sx, 0, 0.95 ) ); }
		scatter( fc, - len / 2 + 0.2, 0.1, len / 2 - 0.2, 0.5, 1.1, 3 + ( R() * 4 | 0 ), [ SMALL.glass, SMALL.bottle, SMALL.ashtray, SMALL.glass ] );
	}
	if ( C.w > 5 && C.d > 5 ) { const p = centre( C, 3.4, 2.4, 0, 0, 0.5 ); if ( p ) T.poolTable( p ); }
	tableGrid( C, 0.7, 0.7, 2.0, 'bar' );
	void O;
}

function restaurantKitchen( C ) {
	const R = C.O.R;
	const len = Math.max( C.w, C.d ) - 1.2;
	const a = onWall( C, Math.min( len, 4.2 ), 0.62, 2.2, sidesByLength( C ) );
	if ( a ) H.kitchenRun( a, Math.min( len, 4.2 ), { loot: 'restaurant_kitchen', steel: true } );
	const f = onWall( C, 0.78, 0.74, 1.8, [ 1, 3, 0, 2 ], 'corner' ); if ( f ) H.fridge( f, 'restaurant_kitchen', { steel: true } );
	for ( let i = 0; i < 2; i ++ ) { const s = onWall( C, 1.2, 0.45, 1.9, [ 3, 1, 0 ] ); if ( s ) H.storageShelf( s, 1.2, 1.9, 0.45, 'restaurant_kitchen', 'Shelf', { m: STEEL } ); }
	const isl = centre( C, 1.8, 0.8 );
	if ( isl ) { counter( isl.at( 0, 0, - 0.4 ), 1.8, 0.8, 0.92, STEEL, STEEL ); isl.spot( 0, 0.92, 0, 'restaurant_kitchen', 0.5 ); scatter( isl, - 0.8, - 0.3, 0.8, 0.3, 0.92, 3 + ( R() * 3 | 0 ), [ SMALL.bowl, SMALL.plate, SMALL.tin, SMALL.bottle ] ); }
}

// ---- shops ------------------------------------------------------------------------------------------------------------------------

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

function salesFloor( C, shop ) {
	const O = C.O, R = O.R, st = C.st;
	const loot = SHOP_TABLE[ shop ] || 'convenience';
	const ext = C.doors.find( d => d.ext );
	// the till near the front door
	const tillSides = ext ? [ ( ext.side + 1 ) % 4, ( ext.side + 3 ) % 4, ext.side ] : [ 3, 1 ];
	const big = shop === 'grocery' || shop === 'market' || shop === 'hardware';
	switch ( shop ) {
		case 'gunstore': case 'pawn': return gunShop( C, shop, loot );
		case 'clothing': case 'surf': case 'sports': return clothesShop( C, shop, loot, tillSides );
		case 'laundromat': {
			for ( let i = 0; i < 3; i ++ ) { const f = onWall( C, 2.8, 0.65, 1.0, [ 2, 1, 3 ] ); if ( f ) washer( f, 4 ); }
			const b = centre( C, 2.4, 0.9 ); if ( b ) { table( b.at( 0, 0, - 0.45 ), 2.4, 0.9, 0.9, wood( WOODS[ 4 ] ), 'trash', 0.4 ); scatter( b, - 1, - 0.3, 1, 0.3, 0.9, 3, [ ( f, x, y, z, R2 ) => f.rbox( x, y + 0.03, z, 0.18, 0.03, 0.14, cloth( pickOf( R2, CLOTHES ) ), R2() ) ] ); }
			for ( let i = 0; i < 2; i ++ ) { const s = onWall( C, 1.8, 0.55, 0.9, [ 0, 1, 3 ] ); if ( s ) T.seats( s, 3, [ 190, 60, 50 ] ); }
			return;
		}
		case 'nails': case 'barber': {
			for ( let i = 0; i < 4; i ++ ) { const f = onWall( C, 0.95, 0.9, 1.9, [ 2, 1, 3 ] ); if ( f ) { H.sofa( f, 0.8, [ 60, 60, 64 ], { loot: 'trash' } ); f.box( - 0.45, 1.05, 0, 0.45, 1.9, 0.03, gloss( [ 170, 184, 190 ] ) ).box( - 0.45, 0.9, 0, 0.45, 0.95, 0.25, gloss( [ 236, 236, 232 ] ) ); } }
			const co = onWall( C, 1.4, 0.6, 1.1, tillSides, 'corner' ); if ( co ) { counter( co, 1.4, 0.6, 1.0 ); register( co, 0.3, 1.0, 0.3, 'convenience' ); }
			return;
		}
		case 'vacant': { for ( let i = 0; i < 3; i ++ ) { const c = inRoom( C, 0.7, 0.55, 0.6 ); if ( c ) cartons( c.at( 0, 0, - 0.3 ), 'trash' ); } return; }
		case 'insurance': case 'phone': case 'bank': case 'post': {
			const f = onWall( C, Math.min( 3.4, C.w - 1.5 ), 0.7, 1.2, [ 2 ], 'centre' );
			if ( f ) { counter( f, Math.min( 3.4, C.w - 1.5 ), 0.7, 1.05, wood( [ 150, 110, 80 ] ) ); f.container( - 0.6, 0, 0, 0.6, 1.05, 0.7, 'Desk', shop === 'post' ? 'post' : shop === 'bank' ? 'bank' : 'desk', 8 ); scatter( f, - 1, 0.1, 1, 0.6, 1.05, 3, [ SMALL.paper, SMALL.phone, SMALL.mug ] ); }
			for ( let i = 0; i < 2; i ++ ) { const d = onWall( C, 1.3, 0.72, 0.8, [ 1, 3 ] ); if ( d ) H.desk( d, 1.3, 'desk' ); }
			const s = onWall( C, 1.8, 0.55, 0.9, [ 0, 1, 3 ] ); if ( s ) T.seats( s, 3, [ 60, 80, 110 ] );
			return;
		}
		case 'bar': return barRoom( C );
		case 'restaurant': case 'fastfood': case 'takeout': case 'bakery': {
			const cw = Math.min( 4.4, C.w - 1.5 );
			const ct = cw > 1.5 ? onWall( C, cw, 0.64, 2.3, [ 2 ] ) : null;
			if ( ct ) {
				counter( ct, cw, 0.62, 1.05, gloss( pickOf( R, [ [ 200, 40, 30 ], [ 236, 236, 232 ], [ 60, 60, 64 ], [ 150, 100, 60 ] ] ) ) );
				register( ct, cw / 2 - 0.4, 1.05, 0.3, loot ); ct.spot( 0, 1.05, 0.3, loot, 0.6 );
				T.menuBoard( ct, cw, 1.85 );
				if ( shop === 'fastfood' || shop === 'takeout' ) T.sodaFountain( ct.at( - cw / 2 + 0.5, 0, 0, 0 ) );
				if ( shop === 'bakery' ) { const f = ct.fine(); for ( let k = 0; k < 6; k ++ ) f.cyl( - cw / 2 + 0.4 + k * 0.3, 1.05, 0.35, 0.09, 0.05, 8, paint( [ 200, 150, 90 ] ), 1, 0.07 ); }
			}
			for ( const s of [ 1, 3 ] ) for ( let i = 0; i < 3; i ++ ) { const b = onWall( C, 2.0, 1.25, 1.2, [ s ] ); if ( b ) T.booth( b, loot ); }
			tableGrid( C, 0.8, 0.8, 1.9, loot, 8 );
			const bn = onWall( C, 0.45, 0.45, 1.1, [ 0, 1, 3 ] ); if ( bn ) bn.box( - 0.22, 0, 0.02, 0.22, 1.0, 0.44, gloss( [ 90, 60, 40 ] ) ).col( - 0.22, 0, 0.02, 0.22, 1.0, 0.44, 1, 2 );
			return;
		}
	}
	// general merchandise: checkouts by the door, coolers along the back wall, gondola aisles, shelves on the side walls
	const nCheck = big ? Math.max( 1, Math.min( 4, Math.floor( ( C.w - 5 ) / 3.2 ) ) ) : 1;
	if ( big && ext && ext.side === 0 && C.d > 12 ) {
		// checkout lanes across the front, running back from the doors
		for ( let i = 0; i < nCheck; i ++ ) {
			const x = C.x0 + 1.4 + i * 3.2 + ( ext.a1 < C.x0 + 4 ? 3.5 : 0 );
			const z = C.z0 + 2.6;
			const r = [ x - 0.4, z - 1.3, x + 0.8, z + 1.3 ];
			if ( x > C.x1 - 1.5 || ! free( C, r ) ) continue;
			C.used.push( r );
			T.checkout( frame( O, x, st.y, z, - Math.PI / 2 ), 2.4, loot );
		}
		// carts and baskets by the door
		for ( let i = 0; i < 3; i ++ ) { const c = inRoom( C, 0.6, 1.0, 0.8, 10 ); if ( c ) T.cart( c.at( 0, 0, 0, R() * 0.6 ), R() < 0.25 ); }
	} else {
		const co = onWall( C, 1.8, 0.7, 1.1, tillSides, 'corner' );
		if ( co ) { counter( co, 1.8, 0.7, 1.0, gloss( [ 200, 196, 186 ] ) ); register( co, 0.3, 1.0, 0.35, loot === 'trash' ? 'convenience' : loot ); co.spot( - 0.5, 1.0, 0.35, loot, 0.4 ); scatter( co, - 0.8, 0.05, - 0.1, 0.6, 1.0, 2, [ SMALL.box, SMALL.paper ] ); if ( shop === 'convenience' || shop === 'gas' ) { const cg = onWall( C, 1.4, 0.3, 2.0, [ co.side ] ); if ( cg ) T.shelves( cg, 1.4, 1.8, 0.3, 'products', loot, 'Shelf', false, 0.3, { mess: 0.2 } ); } }
	}
	if ( shop !== 'hardware' ) {
		const cw = Math.min( 8, C.w - 1.6 );
		if ( cw > 1.6 ) { const cf = onWall( C, cw, 0.82, 2.2, [ 2 ], 'centre' ); if ( cf ) T.coolers( cf, cw, shop === 'grocery' || shop === 'market' ? 'grocery' : 'fridge' ); }
	} else {
		for ( const s of [ 2, 1, 3 ] ) { const len = Math.min( 8, ( s === 2 ? C.w : C.d ) - 2.4 ); if ( len > 3 ) { const f = onWall( C, len, 1.12, 4.6, [ s ] ); if ( f ) palletRack( f, len, 'hardware', 2 ); } }
	}
	for ( const side of [ 1, 3 ] ) { const w = Math.min( 6, C.d - 2.4 ); if ( w > 1.2 ) { const f = onWall( C, w, 0.5, 1.9, [ side ] ); if ( f ) T.shelves( f, w, 1.9, 0.5, 'products', loot, 'Shelf', false, 0.3, shop === 'pharmacy' ? { small: [ 'box', 'pills' ], tint: [ 240, 250, 255 ] } : {} ); } }
	// the aisles: double-sided gondolas running front to back
	const alongZ = C.d >= C.w * 0.7;
	const len = ( alongZ ? C.d : C.w ) - ( big ? 7.5 : 4.4 );
	const span = alongZ ? C.w : C.d;
	const pitch = big ? 2.9 : 2.5;
	const n = Math.max( 1, Math.floor( ( span - 3.2 ) / pitch ) );
	if ( len > 1.5 ) {
		const h = shop === 'hardware' ? 2.2 : big ? 1.8 : 1.55;
		for ( let i = 0; i < n; i ++ ) {
			const c = ( alongZ ? C.x0 : C.z0 ) + ( span - ( n - 1 ) * pitch ) / 2 + i * pitch;
			const mid = alongZ ? ( C.z0 + C.z1 ) / 2 + ( big ? 1.0 : 0.3 ) : ( C.x0 + C.x1 ) / 2;
			const r = alongZ ? [ c - 0.5, mid - len / 2 - 0.6, c + 0.5, mid + len / 2 + 0.6 ] : [ mid - len / 2 - 0.6, c - 0.5, mid + len / 2 + 0.6, c + 0.5 ];
			if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
			C.used.push( r );
			const F = alongZ ? frame( O, c, st.y, mid, Math.PI / 2 ) : frame( O, mid, st.y, c, 0 );
			T.gondola( F, len, h, loot, shop === 'pharmacy' ? { small: [ 'box', 'pills' ], tint: [ 240, 250, 255 ] } : shop === 'hardware' ? { small: [ 'box', 'tin' ] } : {} );
			// a hanging aisle sign
			const sg = F.fine();
			const sw = Math.min( 0.8, len * 0.15 ), sy = Math.min( 2.5, C.ceil - 0.5 );
			sg.cyl( - sw * 0.8, sy + 0.3, 0, 0.005, C.ceil - sy - 0.3, 4, CHROME ).cyl( sw * 0.8, sy + 0.3, 0, 0.005, C.ceil - sy - 0.3, 4, CHROME );
			sg.box( - sw, sy, - 0.015, sw, sy + 0.3, 0.015, gloss( pickOf( R, [ [ 30, 90, 170 ], [ 200, 40, 30 ], [ 40, 120, 70 ] ] ) ) ).box( - sw * 0.7, sy + 0.08, - 0.02, sw * 0.7, sy + 0.22, 0.02, WHITE );
		}
	}
	if ( ( shop === 'grocery' || shop === 'market' ) && C.w > 12 ) { for ( let i = 0; i < 2; i ++ ) { const fz = inRoom( C, 2.0, 0.9, 1.4 ); if ( fz ) T.chestFreezer( fz, 2.0, 'grocery' ); } }
	// fruit and vegetables near the door
	if ( shop === 'grocery' || shop === 'market' ) for ( let i = 0; i < ( shop === 'market' ? 5 : 3 ); i ++ ) { const ps = inRoom( C, 2.4, 1.0, 1.2 ); if ( ps ) T.produceStand( ps, 2.4, shop === 'market' ? 'market' : 'grocery' ); }
	if ( shop === 'pharmacy' ) { const f = onWall( C, 2.6, 0.72, 1.2, [ 2, 1 ] ); if ( f ) { counter( f, 2.6, 0.7, 1.05, gloss( [ 236, 236, 232 ] ) ); f.container( - 1.3, 0, 0, 1.3, 1.05, 0.7, 'Cabinet', 'pharmacy', 12, { locked: 1 } ); register( f, 0.8, 1.05, 0.35, 'pharmacy' ); scatter( f, - 1.1, 0.1, 0.4, 0.6, 1.05, 3, [ SMALL.pills, SMALL.paper ] ); } }
	if ( ! big ) { const v = onWall( C, 0.9, 0.82, 1.9, [ 0, 1, 3 ] ); if ( v && R() < 0.5 ) T.vending( v, loot ); }
	if ( R() < 0.5 ) { const c = inRoom( C, 0.6, 1.0, 1.0, 8 ); if ( c && big ) T.cart( c, true ); }
}

function gunShop( C, shop, loot ) {
	const O = C.O, R = O.R;
	// racks of long guns on the walls, a counter of glass cases before the back wall, cases and ammunition in
	// the middle, the till by the door
	for ( const s of [ 2, 1, 3 ] ) for ( let k = 0; k < 2; k ++ ) { const w = Math.min( 3.4, ( s === 2 ? C.w : C.d ) / 2 - 0.6 ); if ( w > 1 ) { const f = onWall( C, w, 0.3, 2.3, [ s ] ); if ( f ) T.rifleRack( f, w, loot ); } }
	const cw = Math.min( 4.2, C.w - 3.2 );
	if ( cw > 1.2 ) {
		const cz = C.z1 - 1.5;
		const F = frame( O, ( C.x0 + C.x1 ) / 2, C.st.y, cz, Math.PI );
		const r = [ ( C.x0 + C.x1 ) / 2 - cw / 2, cz - 0.7, ( C.x0 + C.x1 ) / 2 + cw / 2, cz + 0.05 ];
		if ( free( C, r ) ) {
			C.used.push( r );
			T.gunCase( F, cw, loot );
			register( F, - cw / 2 + 0.35, 1.0, 0.3, loot );
			// the staff side behind the counter stays clear
			C.used.push( [ r[ 0 ] - 0.3, cz, r[ 2 ] + 0.3, C.z1 - 0.3 ] );
		}
	}
	// island cases back to back, an ammunition gondola
	const iz = ( C.z0 + C.z1 ) / 2 + 0.3;
	for ( const dx of C.w > 8 ? [ - 1.8, 1.8 ] : [ 0 ] ) {
		const x = ( C.x0 + C.x1 ) / 2 + dx;
		const r = [ x - 1.0, iz - 0.66, x + 1.0, iz + 0.66 ];
		if ( ! free( C, r ) ) continue;
		C.used.push( r );
		T.gunCase( frame( O, x, C.st.y, iz, 0 ), 2.0, loot );
		T.gunCase( frame( O, x, C.st.y, iz, Math.PI ), 2.0, loot );
	}
	if ( C.d > 9 ) {
		const gz = C.z0 + 3.2, len = Math.min( 3.6, C.w - 4 );
		const r = [ ( C.x0 + C.x1 ) / 2 - len / 2 - 0.3, gz - 0.5, ( C.x0 + C.x1 ) / 2 + len / 2 + 0.3, gz + 0.5 ];
		if ( len > 1.2 && free( C, r ) ) { C.used.push( r ); const G = frame( O, ( C.x0 + C.x1 ) / 2, C.st.y, gz, 0 ); T.ammoShelf( G.at( 0, 0, 0 ), len, loot ); T.ammoShelf( G.at( 0, 0, 0, Math.PI ), len, loot ); }
	}
	for ( let i = 0; i < 2; i ++ ) { const a = onWall( C, 1.6, 0.42, 1.8, [ 0, 1, 3 ] ); if ( a ) T.ammoShelf( a, 1.6, shop === 'gunstore' ? 'gunstore' : loot ); }
	const co = onWall( C, 1.6, 0.7, 1.1, [ 3, 1 ], 'corner' );
	if ( co ) { counter( co, 1.6, 0.7, 1.0, wood( [ 90, 64, 44 ] ) ); register( co, 0.3, 1.0, 0.35, loot ); }
	if ( shop === 'gunstore' ) {
		const s = onWall( C, 0.8, 0.62, 1.55, [ 1, 3, 0 ], 'corner' ); if ( s ) T.gunSafe( s, 'gun_safe' );
		const fl = onWall( C, 0.4, 0.5, 2.4, [ 0, 1, 3 ], 'corner' ); if ( fl ) T.flag( fl );
		const m = inRoom( C, 0.5, 0.4, 0.8, 8 ); if ( m ) T.mannequin( m );
		const cr = onWall( C, 1.4, 0.45, 1.5, [ 0, 1, 3 ] ); if ( cr ) T.clothesRail( cr, 1.4, 'sports' );
	} else {
		for ( let i = 0; i < 2; i ++ ) { const w = onWall( C, 1.8, 0.45, 1.9, [ 0, 1, 3 ] ); if ( w ) T.shelves( w, 1.8, 1.9, 0.45, 'products', 'pawn', 'Shelf', true, 0.3 ); }
	}
	// spent cases on the floor where someone held the shop, a body behind the counter sometimes
	if ( R() < 0.6 ) { for ( let k = 0; k < 18; k ++ ) { const x = C.x0 + 1 + R() * Math.max( 0, C.w - 2 ), z = C.z0 + 1 + R() * Math.max( 0, C.d - 2 ); frame( O, x, C.st.y, z, R() * 3, O.gd ).cylH( 0, 0.006, 0, 0.006, 0.03, 5, gloss( [ 200, 160, 70 ] ), 'x' ); } }
	if ( R() < 0.35 ) { const F = frame( O, ( C.x0 + C.x1 ) / 2 + ( R() - 0.5 ) * 2, C.st.y, C.z1 - 0.9, R() * 0.6 - 0.3 ); X.body( F, ( R() * 2 ) | 0, { table: 'zombie_civilian', clothes: [ [ 60, 70, 50 ], [ 50, 50, 44 ] ] } ); }
}

function clothesShop( C, shop, loot, tillSides ) {
	const O = C.O, R = O.R;
	const co = onWall( C, 1.8, 0.7, 1.1, tillSides, 'corner' );
	if ( co ) { counter( co, 1.8, 0.7, 1.0, wood( WOODS[ 4 ] ) ); register( co, 0.3, 1.0, 0.35, loot ); }
	for ( let i = 0; i < 3; i ++ ) { const w = Math.min( 2.4, C.w - 1.5 ); const f = onWall( C, w, 0.45, 2.0, [ 2, 1, 3 ] ); if ( f ) T.foldedShelf( f, w, loot ); }
	// fitting rooms: booths with curtains along the back
	if ( C.w > 6 ) { const fr = onWall( C, 2.4, 1.2, 2.2, [ 2, 1, 3 ] ); if ( fr ) { const pm = wood( WOODS[ 4 ] ); for ( const x of [ - 1.2, 0, 1.2 ] ) fr.box( x - 0.03, 0, 0, x + 0.03, 2.1, 1.2, pm ).col( x - 0.03, 0, 0, x + 0.03, 2.1, 1.2, 1 ); for ( const x of [ - 0.6, 0.6 ] ) { fr.box( x - 0.57, 2.0, 1.17, x + 0.57, 2.02, 1.19, CHROME ); const cl = 0.3 + R() * 0.6; fr.box( x - 0.57, 0.15, 1.16, x - 0.57 + cl, 2.0, 1.2, cloth( [ 120, 40, 50 ] ) ); } } }
	for ( let i = 0; i < 8; i ++ ) { const f = inRoom( C, 1.3, 1.3, 0.8 ); if ( ! f ) break; T.roundRack( f.at( 0, 0, 0 ), loot ); }
	for ( let i = 0; i < 3; i ++ ) { const f = inRoom( C, 1.5, 0.5, 0.8 ); if ( ! f ) break; T.clothesRail( f.at( 0, 0, - 0.22 ), 1.5, loot ); }
	for ( let i = 0; i < 3; i ++ ) { const m = inRoom( C, 0.5, 0.4, 0.6, 8 ); if ( m ) T.mannequin( m ); }
	if ( shop === 'surf' ) {
		// boards on a wall rack
		const f = onWall( C, 2.6, 0.5, 2.3, [ 1, 3, 2 ] );
		if ( f ) { for ( let k = 0; k < 7; k ++ ) { const c = pickOf( R, BLANKET ); f.rbox( - 1.15 + k * 0.38, 1.12, 0.2, 0.26, 1.05, 0.035, gloss( c ), 0, - 0.12 ); f.box( - 1.15 + k * 0.38 - 0.01, 0.2, 0.235, - 1.15 + k * 0.38 + 0.01, 2.0, 0.24, WHITE ); } f.col( - 1.3, 0, 0, 1.3, 2.2, 0.35, 1 ); f.container( - 1.3, 0, 0, 1.3, 2.2, 0.35, 'Rack', 'surf', 20 ); }
	}
	if ( shop === 'sports' ) {
		const b = onWall( C, 1.4, 0.5, 1.2, [ 1, 3, 0 ] ); if ( b ) H.bicycle( b, 0, 0.25, 0 );
		const bn = inRoom( C, 0.8, 0.8, 0.8 ); if ( bn ) { bn.box( - 0.4, 0, - 0.4, 0.4, 0.7, 0.4, metal( [ 60, 60, 64 ] ) ); const f = bn.fine(); for ( let k = 0; k < 8; k ++ ) f.cyl( ( R() - 0.5 ) * 0.5, 0.6 + ( k % 2 ) * 0.1, ( R() - 0.5 ) * 0.5, 0.11, 0.2, 8, gloss( pickOf( R, [ [ 240, 120, 30 ], [ 240, 240, 236 ], [ 60, 90, 170 ] ] ) ), 3, 0.06 ); bn.col( - 0.4, 0, - 0.4, 0.4, 0.8, 0.4, 2, 2 ); bn.container( - 0.4, 0, - 0.4, 0.4, 0.8, 0.4, 'Bin', 'sports', 20 ); }
	}
	floorClutter( C, 2 + ( R() * 4 | 0 ), [ ( F ) => H.clothesPile( F, 0, 0 ), ( F ) => H.shoes( F, 0, 0, R() * 3 ) ] );
}

function teller( C ) {
	const len = C.w - 1.0;
	const f = onWall( C, len, 0.7, 1.2, [ 2 ], 'centre' );
	if ( f ) {
		T.frontDesk( f, len, 'bank', { glass: true, m: wood( [ 120, 90, 60 ] ), chair: false } );
		for ( let i = 0; i < Math.floor( len / 1.5 ); i ++ ) register( f, - len / 2 + 0.75 + i * 1.5, 1.14, 0.15, 'bank' );
	}
	const tb = inRoom( C, 1.2, 0.6 ); if ( tb ) table( tb, 1.2, 0.6, 1.0, wood(), 'bank', 0.4 );
	for ( let i = 0; i < 2; i ++ ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ) ); }
	const s = onWall( C, 1.8, 0.55, 0.9, [ 0, 1, 3 ] ); if ( s ) T.seats( s, 3, [ 60, 80, 110 ] );
}

function vault( C ) {
	const f = onWall( C, Math.min( 3, C.w - 0.6 ), 0.45, 2.0, [ 2, 1, 3 ] );
	if ( f ) {
		const w = Math.min( 3, C.w - 0.6 );
		f.box( - w / 2, 0, 0, w / 2, 2.0, 0.45, metal( [ 170, 150, 110 ] ) );
		for ( let i = 0; i < w / 0.3; i ++ ) for ( let k = 0; k < 6; k ++ ) f.box( - w / 2 + i * 0.3 + 0.02, 0.1 + k * 0.31, 0.45, - w / 2 + i * 0.3 + 0.28, 0.38 + k * 0.31, 0.455, metal( [ 190, 170, 120 ] ) );
		f.col( - w / 2, 0, 0, w / 2, 2.0, 0.45, 2 );
		f.container( - w / 2, 0, 0, w / 2, 2.0, 0.46, 'Deposit boxes', 'bank', 20, { locked: 1 } );
	}
	const s = onWall( C, 0.8, 0.62, 1.55, [ 1, 3, 0 ] ); if ( s ) T.gunSafe( s, 'bank' );
}

function storage( C, shop, mil ) {
	const R = C.O.R, P = C.P, k = C.rm.k;
	const loot = k === 'rx' ? 'pharmacy' : k === 'sorting' ? 'post' : storageTable( P, shop, mil );
	if ( k === 'utility' ) {
		if ( R() < 0.6 ) { const wh = onWall( C, 0.6, 0.6, 1.6, [ 2, 1, 3, 0 ], 'corner' ); if ( wh ) { wh.cyl( 0, 0, 0.3, 0.28, 1.5, 12, gloss( [ 236, 236, 232 ] ) ).cyl( 0, 1.5, 0.3, 0.05, 0.3, 6, CHROME ); wh.col( - 0.28, 0, 0.02, 0.28, 1.5, 0.58, 2 ); } }
		const mb = inRoom( C, 0.4, 0.4, 0.3, 6 ); if ( mb ) { mb.cyl( 0, 0, 0, 0.17, 0.3, 10, gloss( [ 230, 200, 40 ] ), 2, 0.19 ).fine().rbox( 0.05, 0.6, 0, 0.012, 0.6, 0.012, wood( WOODS[ 2 ] ), 0, 0, 0.2 ); }
	}
	const n = k === 'utility' ? 1 : 4;
	for ( let i = 0; i < n; i ++ ) {
		const w = Math.min( 2.4, Math.max( C.w, C.d ) - 1.0 );
		const s = onWall( C, w, 0.5, 1.9, [ 2, 1, 3, 0 ] );
		if ( ! s ) break;
		if ( k === 'rx' ) T.shelves( s, w, 1.9, 0.5, 'products', loot, 'Shelf', true, 0.3, { small: [ 'pills', 'box' ], tint: [ 240, 250, 255 ] } );
		else H.storageShelf( s, w, 1.9, 0.5, loot, 'Shelf' );
	}
	if ( k === 'sorting' ) tableGrid( C, 1.6, 0.8, 1.2, 'post', 4 );
	for ( let i = 0; i < 3; i ++ ) { const c = inRoom( C, 0.7, 0.55, 0.4 ); if ( c ) cartons( c.at( 0, 0, - 0.3 ), loot ); }
	if ( R() < 0.3 ) { const c = inRoom( C, 0.8, 0.6, 0.4 ); if ( c ) crate( c, 0.8 + R() * 0.3, loot, 'Crate', mil ); }
}

// ---- offices and the civic buildings ----------------------------------------------------------------------------------------

function office( C, t, mil ) {
	const R = C.O.R, k = C.rm.k;
	const loot = t === 'police' ? 'police' : t === 'school' ? 'school' : t === 'hospital' || t === 'clinic' ? 'clinic' : t === 'church' ? 'church' : mil ? 'military' : t === 'fire' ? 'fire_station' : 'office';
	if ( k === 'meeting' ) {
		const w = Math.min( 3.6, C.w - 2.2, C.d - 2.2 > 1.6 ? 3.6 : C.w - 2.2 );
		const d = Math.min( 1.2, C.d - 2.2 );
		if ( w > 1.2 && d > 0.7 ) { const tb = centre( C, w + 1.2, d + 1.4 ); if ( tb ) T.meetingTable( tb, w, d, loot ); }
		const wb = onWall( C, 1.8, 0.1, 2.1, [ 2, 0, 1, 3 ], 'centre' ); if ( wb ) T.whiteboard( wb, 1.8 );
		const tv = onWall( C, 1.3, 0.12, 2.0, [ 0, 1, 3 ], 'centre' ); if ( tv ) tv.box( - 0.65, 1.2, 0.02, 0.65, 1.95, 0.07, BLACK ).box( - 0.63, 1.22, 0.07, 0.63, 1.93, 0.072, gloss( [ 12, 13, 15 ] ) );
	} else if ( k === 'briefing' ) {
		rows( C, 0.5, 0.5, 0.35, 0.8, ( F ) => H.chair( F.at( 0, 0, 0.25, Math.PI ), metal( [ 60, 60, 66 ] ), R() < 0.12 ) );
		const lec = onWall( C, 0.6, 0.5, 1.2, [ 2, 0 ], 'centre' ); if ( lec ) { lec.box( - 0.3, 0, 0.05, 0.3, 1.1, 0.5, wood() ).rbox( 0, 1.15, 0.25, 0.32, 0.03, 0.25, wood(), 0, 0.25 ).col( - 0.3, 0, 0, 0.3, 1.15, 0.5, 1 ); }
		const wb = onWall( C, 2.4, 0.1, 2.1, [ 2, 0 ] ); if ( wb ) T.whiteboard( wb, 2.4 );
		const mp = onWall( C, 1.2, 0.05, 2.0, [ 1, 3 ] ); if ( mp ) mp.box( - 0.6, 1.1, 0.01, 0.6, 1.9, 0.03, art( 14 ) );
		if ( mil || t === 'police' ) { const fl = onWall( C, 0.4, 0.5, 2.4, [ 2, 1, 3 ], 'corner' ); if ( fl ) T.flag( fl ); }
	} else {
		const d = onWall( C, 1.5, 0.72, 0.8, [ 2, 1, 3, 0 ] );
		if ( d ) {
			H.desk( d, 1.5, t === 'police' ? 'police' : 'desk', { phone: true } );
			// visitor chairs across the desk
			for ( const s of [ - 1, 1 ] ) { const vc = nextTo( C, d, s * 0.35, 1.9, 0, [ - 0.25, - 0.25, 0.25, 0.25 ] ); if ( vc ) H.chair( vc.at( 0, 0, 0, R() * 0.4 - 0.2 ), cloth( [ 60, 64, 80 ] ), R() < 0.1 ); }
		}
		if ( C.w * C.d > 12 ) { const d2 = onWall( C, 1.4, 0.72, 0.8, [ 0, 1, 3 ] ); if ( d2 ) H.desk( d2, 1.4, 'desk' ); }
		if ( t === 'police' && R() < 0.5 ) { const s = onWall( C, 0.8, 0.62, 1.55, [ 1, 3, 0 ], 'corner' ); if ( s ) T.gunSafe( s, 'gun_safe' ); }
		if ( mil ) { const r = onWall( C, 1.2, 0.6, 1.0, [ 1, 3, 0 ] ); if ( r ) { table( r, 1.2, 0.6, 0.75, metal( [ 90, 100, 70 ] ) ); r.box( - 0.4, 0.75, 0.1, 0.1, 1.05, 0.45, paint( [ 70, 80, 50 ] ) ).box( - 0.35, 0.8, 0.45, 0.05, 1.0, 0.452, DARK ); } const mp = onWall( C, 1.4, 0.05, 2.0, [ 1, 3, 2 ] ); if ( mp ) mp.box( - 0.7, 1.1, 0.01, 0.7, 1.95, 0.03, art( 14 ) ); }
	}
	for ( let i = 0; i < ( C.w * C.d > 16 ? 2 : 1 ); i ++ ) { const fc = onWall( C, 0.5, 0.62, 1.35, [ 1, 3, 2, 0 ], 'corner' ); if ( fc ) T.filing( fc, loot ); }
	const bs = onWall( C, 0.9, 0.34, 1.9, [ 3, 1, 0, 2 ] ); if ( bs ) H.bookcase( bs, 0.9, 1.9, { loot, mess: 0.4 } );
	if ( R() < 0.6 ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 2, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ) ); }
	if ( R() < 0.35 ) { const wc = onWall( C, 0.34, 0.34, 1.4, [ 0, 1, 3, 2 ] ); if ( wc ) T.waterCooler( wc ); }
	floorClutter( C, R() * 3 | 0, [ SMALL.paper, SMALL.paper, SMALL.box, SMALL.mug ] );
}

function openOffice( C, t ) {
	const R = C.O.R;
	const loot = t === 'police' ? 'police' : 'office';
	if ( t === 'police' ) {
		// a bullpen: desks in facing pairs
		rows( C, 1.5, 1.6, 0.9, 0.9, ( F ) => { H.desk( F.at( 0, 0, 0.75, 0 ), 1.4, 'police', { phone: true } ); } );
	} else rows( C, 2.4, 2.2, 0.35, 0.95, ( F ) => T.cubicle( F, 2.4, 2.2, ( G, w ) => H.desk( G, w, 'desk', {} ) ) );
	for ( let i = 0; i < 3; i ++ ) { const fc = onWall( C, 0.5, 0.62, 1.35, [ 1, 3, 2, 0 ] ); if ( fc ) T.filing( fc, loot ); }
	const cp = onWall( C, 1.1, 0.7, 1.1, [ 1, 3, 0, 2 ] ); if ( cp ) T.copier( cp, loot );
	const wc = onWall( C, 0.34, 0.34, 1.4, [ 0, 1, 3, 2 ] ); if ( wc ) T.waterCooler( wc );
	for ( let i = 0; i < 2; i ++ ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 2, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ) ); }
	const wb = onWall( C, 1.8, 0.1, 2.1, [ 1, 3, 2, 0 ] ); if ( wb ) T.whiteboard( wb, 1.8 );
	floorClutter( C, 3 + ( R() * 4 | 0 ), [ SMALL.paper, SMALL.paper, SMALL.box, SMALL.mug, SMALL.phone ] );
}

function lobby( C, t ) {
	const R = C.O.R, k = C.rm.k;
	const deskLoot = t === 'hospital' || t === 'clinic' ? 'clinic' : t === 'police' ? 'police' : t === 'hotel' ? 'hotel_room' : 'desk';
	const narrow = Math.min( C.w, C.d ) < 3.2;
	if ( ! narrow ) {
		const rw = Math.min( 3.2, Math.max( C.w, C.d ) - 2 );
		const rec = onWall( C, rw, 1.25, 1.2, [ 2, 1, 3 ], 'centre' );
		if ( rec ) T.frontDesk( rec.at( 0, 0, 0.5, 0 ), rw, deskLoot, { glass: t === 'police', m: t === 'hotel' ? wood( [ 110, 70, 40 ] ) : t === 'hospital' || t === 'clinic' ? gloss( [ 236, 236, 232 ] ) : wood( [ 150, 110, 80 ] ) } );
	}
	if ( t === 'hotel' || t === 'apartment' ) {
		// a lounge: sofas and armchairs round a low table, a luggage trolley
		const sf = onWall( C, 2.1, 0.95, 0.9, [ 1, 3, 0 ] );
		if ( sf ) { H.sofa( sf, 2.1, pickOf( R, SOFA ), { loot: 'hotel_room' } ); const ct = nextTo( C, sf, 0, 1.45, 0, [ - 0.55, - 0.3, 0.55, 0.3 ] ); if ( ct ) H.coffeeTable( ct, 1.1, 0.6, { loot: 'hotel_room' } ); }
		if ( t === 'hotel' && ! narrow ) { const lc = inRoom( C, 1.2, 0.7, 0.8, 8 ); if ( lc ) T.luggageCart( lc ); }
	} else {
		for ( let i = 0; i < ( k === 'waiting' ? 4 : 2 ); i ++ ) { const s = onWall( C, 1.8, 0.55, 0.9, [ 0, 1, 3, 2 ] ); if ( s ) T.seats( s, 3, t === 'hospital' || t === 'clinic' ? [ 80, 120, 150 ] : [ 70, 90, 120 ] ); }
		if ( k === 'waiting' && ! narrow ) { const mt = centre( C, 1.0, 0.6 ); if ( mt ) { table( mt.at( 0, 0, - 0.3 ), 1.0, 0.6, 0.45, wood( WOODS[ 4 ] ) ); scatter( mt, - 0.4, - 0.2, 0.4, 0.2, 0.45, 3, [ ( f, x, y, z, R2 ) => f.rbox( x, y + 0.003, z, 0.11, 0.003, 0.14, art( pickOf( R2, [ 8, 9, 2, 5 ] ) ), R2() ) ] ); } }
		if ( k === 'waiting' ) { const tv = onWall( C, 1.2, 0.12, 2.3, [ 0, 1, 3, 2 ] ); if ( tv ) tv.box( - 0.6, 1.6, 0.02, 0.6, 2.28, 0.08, BLACK ).box( - 0.58, 1.62, 0.08, 0.58, 2.26, 0.082, gloss( [ 12, 13, 15 ] ) ); }
		if ( R() < 0.6 ) { const v = onWall( C, 0.9, 0.82, 1.9, [ 0, 1, 3 ] ); if ( v ) T.vending( v, 'convenience' ); }
		if ( R() < 0.5 ) { const wc = onWall( C, 0.34, 0.34, 1.4, [ 0, 1, 3 ] ); if ( wc ) T.waterCooler( wc ); }
	}
	if ( t === 'police' ) { const fl = onWall( C, 0.4, 0.5, 2.4, [ 2, 1, 3 ], 'corner' ); if ( fl ) T.flag( fl ); }
	for ( let i = 0; i < 2; i ++ ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ), { big: true } ); }
	if ( t === 'hospital' || t === 'clinic' ) { for ( let i = 0; i < 2; i ++ ) { const g = onWall( C, 2.0, 0.7, 1.0, [ 0, 1, 3, 2 ] ); if ( g ) T.gurney( g, { table: 'zombie_medic' } ); } const wh = inRoom( C, 0.7, 0.7, 0.8, 8 ); if ( wh ) T.wheelchair( wh ); }
}

function corridor( C, t ) {
	const O = C.O, R = O.R;
	const along = C.w > C.d ? [ 0, 2 ] : [ 1, 3 ];
	const narrow = Math.min( C.w, C.d ) < 2.1;
	const len = Math.max( C.w, C.d );
	if ( t === 'hospital' || t === 'clinic' ) {
		for ( let i = 0; i < Math.floor( len / 7 ); i ++ ) { const g = onWall( C, 2.0, 0.7, 1.0, along ); if ( g ) T.gurney( g, { table: 'zombie_medic' } ); }
		for ( let i = 0; i < Math.floor( len / 12 ); i ++ ) { const w = onWall( C, 0.7, 0.7, 1.0, along ); if ( w ) T.wheelchair( w.at( 0, 0, 0.35, R() * 3 ) ); }
		for ( let i = 0; i < Math.floor( len / 10 ); i ++ ) { const s = onWall( C, 0.6, 0.46, 1.1, along ); if ( s ) T.supplyCart( s, 'hospital' ); }
		for ( let i = 0; i < 2; i ++ ) { const f = inRoom( C, 0.3, 0.3, 0.3, 8 ); if ( f ) { C.used.pop(); T.ivPole( f, 0, 0 ); } }
	} else if ( t === 'hotel' ) {
		for ( let i = 0; i < Math.floor( len / 4 ); i ++ ) { const s = onWall( C, 0.2, 0.15, 2.0, along ); if ( s ) { T.sconce( s, 1.75 ); C.used.pop(); } }
		if ( R() < 0.6 ) { const hk = onWall( C, 1.8, 0.52, 1.3, along ); if ( hk ) T.housekeeping( hk.at( - 0.2, 0, 0 ) ); }
		if ( R() < 0.4 && ! narrow ) { const lc = onWall( C, 1.2, 0.62, 1.9, along ); if ( lc ) T.luggageCart( lc.at( 0, 0, 0.31 ) ); }
		for ( let i = 0; i < 2; i ++ ) if ( R() < 0.5 ) { const d = C.doors[ ( R() * C.doors.length ) | 0 ]; if ( d && ! d.ext ) { const F = frameOnWall( C, d.side, d.a1 + 0.35 ); T.tray( F, 0, 0.3 ); } }
	} else if ( t === 'police' ) {
		for ( let i = 0; i < 2; i ++ ) { const b = onWall( C, 1.8, 0.36, 0.5, along ); if ( b ) T.bench( b, 1.8, wood( WOODS[ 2 ] ) ); }
		if ( R() < 0.5 ) { const wc = onWall( C, 0.34, 0.34, 1.4, along ); if ( wc ) T.waterCooler( wc ); }
	} else if ( t === 'apartment' || t === 'walkup' ) {
		for ( let i = 0; i < 3; i ++ ) if ( R() < 0.5 ) { const d = C.doors[ ( R() * C.doors.length ) | 0 ]; if ( d && ! d.ext ) { const F = frameOnWall( C, d.side, d.a0 - 0.35 ); if ( R() < 0.5 ) H.shoes( F, 0, 0.18, 0 ); else F.fine().box( - 0.15, 0, 0.05, 0.15, 0.012, 0.4, cloth( pickOf( R, BLANKET ) ), 8 ); } }
	} else {
		if ( R() < 0.5 ) { const wc = onWall( C, 0.34, 0.34, 1.4, along ); if ( wc ) T.waterCooler( wc ); }
		if ( R() < 0.5 ) { const p = onWall( C, 0.45, 0.45, 1.0, along ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ) ); }
	}
	// a fire extinguisher
	if ( R() < 0.5 ) { const f = onWall( C, 0.2, 0.15, 1.0, along ); if ( f ) { f.cyl( 0, 0.5, 0.1, 0.075, 0.45, 8, gloss( [ 190, 30, 26 ] ) ).box( - 0.02, 0.95, 0.07, 0.02, 1.02, 0.13, BLACK ); C.used.pop(); } }
}

function cells( C ) {
	const O = C.O, R = O.R, st = C.st;
	// cells along the long back wall, barred fronts facing the room, a walkway in front
	const deep = C.d > C.w * 1.3;
	const L0 = deep ? C.d : C.w, D0 = deep ? C.w : C.d;
	const n = Math.max( 1, Math.min( 5, Math.floor( L0 / 2.4 ) ) );
	const cd = Math.min( 2.4, D0 - 1.3 );
	if ( cd < 1.6 ) return;
	const bars = metal( [ 120, 124, 128 ] );
	for ( let i = 0; i < n; i ++ ) {
		const a0 = ( deep ? C.z0 : C.x0 ) + L0 * i / n, a1 = ( deep ? C.z0 : C.x0 ) + L0 * ( i + 1 ) / n;
		// the cell's own frame: x along the bars, +z from the bars into the cell
		const F = deep ? frame( O, C.x1 - cd, st.y, ( a0 + a1 ) / 2, - Math.PI / 2 ) : frame( O, ( a0 + a1 ) / 2, st.y, C.z1 - cd, 0 );
		const cw = a1 - a0;
		const open = R() < 0.4;
		const nb = Math.floor( ( cw - 0.1 ) / 0.14 );
		const gate = open ? [ - cw / 2 + 0.3, - cw / 2 + 1.1 ] : [ 99, 99 ];
		for ( let k = 0; k <= nb; k ++ ) { const x = - cw / 2 + 0.05 + k * ( cw - 0.1 ) / nb; if ( x > gate[ 0 ] && x < gate[ 1 ] ) continue; F.box( x - 0.015, 0, - 0.015, x + 0.015, 2.3, 0.015, bars, 12 ); }
		for ( const hy of [ 0.1, 1.05, 2.25 ] ) F.box( - cw / 2 + 0.05, hy, - 0.02, cw / 2 - 0.05, hy + 0.05, 0.02, bars );
		if ( open ) { const G = F.at( gate[ 0 ], 0, 0, 1.1 ); for ( let k = 0; k < 6; k ++ ) G.box( k * 0.14 - 0.015, 0, - 0.015, k * 0.14 + 0.015, 2.3, 0.015, bars, 12 ); for ( const hy of [ 0.1, 1.05, 2.25 ] ) G.box( 0, hy, - 0.02, 0.75, hy + 0.05, 0.02, bars ); }
		F.col( - cw / 2, 0, - 0.03, open ? gate[ 0 ] : cw / 2, 2.3, 0.03, 2, 2 );
		if ( open ) F.col( gate[ 1 ], 0, - 0.03, cw / 2, 2.3, 0.03, 2, 2 );
		if ( i < n - 1 ) { F.box( cw / 2 - 0.03, 0, 0, cw / 2 + 0.03, 2.4, cd, paint( [ 200, 200, 196 ] ) ); F.col( cw / 2 - 0.03, 0, 0, cw / 2 + 0.03, 2.4, cd, 0 ); }
		// a bunk along the back, a steel toilet in the corner
		const b = F.at( - cw / 2 + 0.45, 0, cd, Math.PI );
		b.box( - 0.4, 0.4, 0, 0.4, 0.5, 1.9, bars ).box( - 0.38, 0.5, 0.05, 0.38, 0.6, 1.85, cloth( [ 90, 110, 100 ] ) ).box( - 0.4, 0, 0.1, - 0.36, 0.4, 0.14, bars ).box( 0.36, 0, 1.76, 0.4, 0.4, 1.8, bars );
		b.col( - 0.4, 0, 0, 0.4, 0.6, 1.9, 2, 2 ).bed( - 0.4, 0, 0, 0.4, 0.6, 1.9, 0.6 );
		if ( R() < 0.5 ) b.rbox( 0, 0.63, 1.1, 0.35, 0.03, 0.5, cloth( [ 140, 130, 110 ] ), R() * 0.3 );
		if ( cw > 1.9 ) H.toilet( F.at( cw / 2 - 0.4, 0, cd, Math.PI ), { roll: false } );
		if ( R() < 0.45 ) O.decalAt( F, 0, cd / 2, 1.3, 'blood' );
		if ( R() < 0.3 ) X.body( F.at( 0.2, 0, cd * 0.55, R() * 6 ), ( R() * 3 ) | 0, { table: 'zombie_civilian', clothes: [ [ 230, 120, 40 ], [ 230, 120, 40 ] ] } );
	}
	C.used.push( deep ? [ C.x1 - cd - 0.2, C.z0, C.x1, C.z1 ] : [ C.x0, C.z1 - cd - 0.2, C.x1, C.z1 ] );
	for ( let i = 0; i < 2; i ++ ) { const bn = onWall( C, 1.8, 0.36, 0.5, [ 0, 1, 3, 2 ] ); if ( bn ) T.bench( bn, 1.8, wood( WOODS[ 2 ] ) ); }
	const dk = onWall( C, 1.3, 0.72, 0.8, [ 0, 3, 1 ] ); if ( dk ) H.desk( dk, 1.3, 'police', { pc: true } );
}

function armory( C, mil ) {
	const R = C.O.R;
	const loot = mil ? 'military_armory' : 'police';
	for ( let i = 0; i < 4; i ++ ) { const w = Math.min( 2.4, Math.max( C.w, C.d ) - 1.2 ); const f = onWall( C, w, 0.3, 2.3, [ 2, 1, 3, 0 ] ); if ( f ) T.rifleRack( f, w, loot ); }
	for ( let i = 0; i < 2; i ++ ) { const s = onWall( C, 0.8, 0.62, 1.55, [ 1, 3, 0, 2 ] ); if ( s ) T.gunSafe( s, mil ? 'military_armory' : 'gun_safe' ); }
	const a = onWall( C, 1.6, 0.42, 1.8, [ 1, 3, 0, 2 ] ); if ( a ) T.ammoShelf( a, 1.6, loot );
	for ( let i = 0; i < 3; i ++ ) { const c = inRoom( C, 0.8, 0.6, 0.5 ); if ( c ) crate( c, 1, mil ? 'military' : 'police', 'Crate', mil ); }
	for ( let i = 0; i < 4; i ++ ) { const f = inRoom( C, 0.35, 0.2, 0.4, 6 ); if ( f ) { C.used.pop(); T.ammoCan( f, 0, 0, R() * 3 ); } }
}

function lockerRoom( C, t, mil ) {
	const loot = t === 'police' ? 'police_locker' : t === 'fire' ? 'fire_station' : mil ? 'military_locker' : 'office';
	for ( let i = 0; i < 4; i ++ ) { const n = Math.min( 8, Math.floor( ( Math.max( C.w, C.d ) - 1.0 ) / 0.42 ) ); if ( n < 2 ) break; const f = onWall( C, n * 0.42, 0.5, 1.9, [ 2, 0, 1, 3 ] ); if ( f ) T.lockers( f, n, loot, 'Locker', t === 'fire' ? [ 170, 40, 30 ] : t === 'police' ? [ 60, 70, 90 ] : [ 90, 110, 130 ] ); }
	const b = centre( C, 1.8, 0.35 ); if ( b ) T.bench( b.at( 0, 0, - 0.18 ), 1.8, wood() );
	floorClutter( C, 2, [ ( F ) => H.shoes( F, 0, 0, C.O.R() * 3 ), ( F ) => H.clothesPile( F, 0, 0 ) ] );
}

function apparatusBay( C ) {
	const R = C.O.R;
	for ( let i = 0; i < 3; i ++ ) { const f = onWall( C, 3.4, 0.5, 1.9, [ 2, 1, 3 ] ); if ( f ) T.lockers( f, 8, 'fire_station', 'Gear locker', [ 170, 40, 30 ] ); }
	for ( let i = 0; i < 2; i ++ ) { const d = onWall( C, 0.6, 0.6, 1.0, [ 1, 3 ] ); if ( d ) H.drum( d, [ 170, 40, 30 ] ); }
	// hose rolls on a rack, a helmet and boots by the lockers
	const hr = onWall( C, 1.6, 0.5, 1.6, [ 1, 3, 2 ] ); if ( hr ) { for ( let k = 0; k < 3; k ++ ) hr.cylH( - 0.5 + k * 0.5, 0.6 + ( k % 2 ) * 0.5, 0.25, 0.22, 0.12, 12, cloth( [ 200, 190, 160 ] ), 'z' ); hr.box( - 0.8, 0, 0, 0.8, 1.4, 0.05, metal() ).col( - 0.8, 0, 0, 0.8, 1.4, 0.5, 2 ); }
	for ( let i = 0; i < 3; i ++ ) if ( R() < 0.6 ) { const f = inRoom( C, 0.4, 0.4, 0.5, 6 ); if ( f ) { C.used.pop(); H.shoes( f, 0, 0, R() * 3 ); } }
}

function ward( C ) {
	const R = C.O.R;
	const n = Math.max( 1, Math.floor( Math.max( C.w, C.d ) / 2.5 ) );
	for ( let i = 0; i < n * 2; i ++ ) { const f = onWall( C, 2.0, 2.1, 1.0, C.w > C.d ? [ 2, 0 ] : [ 1, 3 ] ); if ( f ) T.hospitalBed( f.at( - 0.2, 0, 0 ) ); }
	const s = onWall( C, 0.7, 0.5, 1.0, [ 0, 1, 3, 2 ] ); if ( s ) H.vanity( s, 0.62, null, { mirror: false } );
	const sc = onWall( C, 0.6, 0.46, 1.1, [ 0, 1, 3, 2 ] ); if ( sc ) T.supplyCart( sc, 'hospital' );
	const wh = inRoom( C, 0.7, 0.7, 0.6, 8 ); if ( wh ) T.wheelchair( wh );
	floorClutter( C, 2, [ SMALL.pills, SMALL.paper, SMALL.glass ] );
	void R;
}

function exam( C, t ) {
	const loot = t === 'hospital' ? 'hospital' : 'clinic';
	const f = onWall( C, 0.8, 2.0, 1.0, [ 2, 1, 3 ], 'centre' );
	if ( f ) { T.examTable( f, loot ); T.ivPole( f, 0.6, 0.6 ); }
	const c = onWall( C, 1.8, 0.5, 2.1, [ 0, 1, 3 ] );
	if ( c ) {
		counter( c.at( 0.3, 0, 0 ), 1.2, 0.5, 0.9, gloss( [ 236, 236, 232 ] ) );
		c.container( - 0.3, 0, 0, 0.9, 0.9, 0.5, 'Cabinet', loot, 10 );
		c.box( - 0.3, 1.4, 0, 0.9, 2.0, 0.33, gloss( [ 236, 236, 232 ] ) ).container( - 0.3, 1.4, 0, 0.9, 2.0, 0.35, 'Cabinet', loot, 8, { n: 1 } );
		c.spot( 0.5, 0.9, 0.25, 'clinic', 0.6 );
		scatter( c, 0, 0.1, 0.8, 0.4, 0.9, 3, [ SMALL.pills, SMALL.pills, SMALL.glass, SMALL.box ] );
		H.vanity( c.at( - 0.62, 0, 0 ), 0.6, null, { mirror: false } );
	}
	const d = onWall( C, 1.1, 0.7, 0.8, [ 0, 1, 3 ] ); if ( d ) H.desk( d, 1.1, 'clinic', { pc: true } );
	const sc = onWall( C, 0.6, 0.46, 1.1, [ 0, 1, 3, 2 ] ); if ( sc ) T.supplyCart( sc, loot );
	// the sharps bin and a stool
	const st = inRoom( C, 0.4, 0.4, 0.5, 6 ); if ( st ) { st.cyl( 0, 0, 0, 0.2, 0.03, 8, CHROME ).cyl( 0, 0.03, 0, 0.02, 0.5, 6, CHROME ).cyl( 0, 0.53, 0, 0.18, 0.06, 10, cloth( [ 40, 60, 90 ] ) ); st.col( - 0.2, 0, - 0.2, 0.2, 0.6, 0.2, 2, 2 ); }
}

function classroom( C ) {
	const cb = onWall( C, Math.min( 4, C.w - 1.5 ), 0.1, 2.2, [ 2, 1, 3 ], 'centre' );
	if ( cb ) chalkboard( cb, Math.min( 4, C.w - 1.5 ) );
	const td = onWall( C, 1.3, 0.72, 0.8, [ 3, 1, 0 ] ) || inRoom( C, 1.3, 0.72 );
	if ( td ) H.desk( td, 1.3, 'school', { pc: false } );
	rows( C, 0.7, 1.35, 0.35, 0.9, ( F ) => schoolDesk( F ) );
	for ( let i = 0; i < 2; i ++ ) { const s = onWall( C, 1.8, 0.35, 1.9, [ 0, 1, 3 ] ); if ( s ) H.bookcase( s, 1.8, 1.2, { loot: 'school', mess: 0.4 } ); }
}

function nave( C ) {
	const O = C.O, st = C.st;
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
			// people sheltered here: some pews pushed askew
			pew( frame( O, x, st.y, z, O.R() < 0.15 ? ( O.R() - 0.5 ) * 0.4 : 0 ), pw );
		}
	}
	// bedding on the floor where people slept
	for ( let i = 0; i < 3; i ++ ) if ( O.R() < 0.4 ) { const f = inRoom( C, 1.9, 0.8, 0.4, 8 ); if ( f ) { f.box( - 0.95, 0, - 0.4, 0.95, 0.04, 0.4, cloth( pickOf( O.R, BLANKET ) ) ).bed( - 0.95, 0, - 0.4, 0.95, 0.1, 0.4, 0.6 ); } }
}

function hallBig( C, t, shop, mil ) {
	const O = C.O, R = O.R, st = C.st;
	if ( t === 'warehouse' ) {
		// pallet racks in rows with aisles between, a forklift aisle, loose pallets
		const alongX = C.w >= C.d;
		const len = ( alongX ? C.w : C.d ) - 5;
		const n = Math.floor( ( ( alongX ? C.d : C.w ) - 4 ) / 3.6 );
		for ( let i = 0; i < n; i ++ ) {
			const c = ( alongX ? C.z0 : C.x0 ) + 2.5 + i * 3.6;
			const F = alongX ? frame( O, ( C.x0 + C.x1 ) / 2, st.y, c, 0 ) : frame( O, c, st.y, ( C.z0 + C.z1 ) / 2, Math.PI / 2 );
			if ( len > 3 ) palletRack( F, len, 'warehouse', 2 );
		}
		for ( let i = 0; i < 4; i ++ ) { const c = inRoom( C, 1.2, 1.0, 0.6 ); if ( c ) { c.box( - 0.6, 0, - 0.5, 0.6, 0.14, 0.5, M( L.wood, [ 190, 160, 120 ], 1, F_IN ) ); if ( R() < 0.7 ) cartons( c.at( 0, 0.14, - 0.3 ), 'warehouse' ); } }
	} else {
		const loot = t === 'hangar' ? 'hangar' : storageTable( C.P, shop, mil );
		for ( let i = 0; i < 3; i ++ ) { const f = onWall( C, 1.8, 0.72, 1.95, [ 2, 1, 3 ] ); if ( f ) H.workbench( f, 1.8, 'toolbox', loot ); }
		for ( let i = 0; i < 2; i ++ ) { const f = onWall( C, 1.8, 0.5, 1.9, [ 2, 1, 3 ] ); if ( f ) H.storageShelf( f, 1.8, 1.9, 0.5, loot ); }
		const tc = onWall( C, 0.8, 0.5, 1.35, [ 2, 1, 3 ] ); if ( tc ) H.toolChest( tc, 'toolbox' );
		for ( let i = 0; i < 8; i ++ ) { const c = inRoom( C, 0.8, 0.6, 1.0 ); if ( c ) ( R() < 0.3 ? H.drum( c ) : crate( c, 1 + R() * 0.4, loot, 'Crate', mil ) ); }
		if ( t === 'hangar' && C.w > 12 && C.d > 12 ) { const F = centre( C, 5, 3, 0 ); if ( F ) H.car( F.at( 0, 0, - 1.19 ), { len: 4.8, c: [ 220, 220, 216 ] } ); }
	}
}

function dorm( C, k, mil ) {
	const dbl = k === 'bunk' || mil;
	for ( let i = 0; i < 10; i ++ ) { const f = onWall( C, 1.1, 2.5, 1.8, C.w > C.d ? [ 2, 0 ] : [ 1, 3 ] ); if ( f ) bunk( f, mil ? 'military_locker' : 'fire_station', dbl ); else break; }
	const l = onWall( C, 1.7, 0.5, 1.9, [ 3, 1, 0, 2 ] ); if ( l ) T.lockers( l, 4, mil ? 'military_locker' : 'fire_station' );
	if ( mil ) { const fl = onWall( C, 0.4, 0.5, 2.4, [ 0, 1, 3, 2 ], 'corner' ); if ( fl ) T.flag( fl ); for ( let i = 0; i < 2; i ++ ) { const f = inRoom( C, 0.35, 0.2, 0.4, 6 ); if ( f ) { C.used.pop(); T.ammoCan( f, 0, 0, C.O.R() * 3 ); } } }
	floorClutter( C, 3, [ ( F ) => H.shoes( F, 0, 0, C.O.R() * 3 ), ( F ) => H.clothesPile( F, 0, 0 ), SMALL.can ] );
}

function tent( C ) {
	const O = C.O, st = C.st;
	const cz = ( C.z0 + C.z1 ) / 2;
	for ( let i = 0; i < 6; i ++ ) {
		const x = C.x0 + 0.5 + i * 1.1;
		if ( x + 0.4 > C.x1 - 0.8 ) break;
		for ( const s of [ - 1, 1 ] ) {
			const F = frame( O, x + 0.35, st.y, s < 0 ? C.z0 + 0.1 : C.z1 - 0.1, s < 0 ? 0 : Math.PI );
			F.box( - 0.35, 0.35, 0, 0.35, 0.4, 1.9, cloth( [ 100, 104, 70 ] ) ).box( - 0.35, 0, 0.1, - 0.32, 0.35, 0.13, metal( [ 60, 60, 50 ] ) ).box( 0.32, 0, 1.75, 0.35, 0.35, 1.78, metal( [ 60, 60, 50 ] ) ).col( - 0.35, 0, 0, 0.35, 0.4, 1.9, 1, 2 ).bed( - 0.35, 0, 0, 0.35, 0.45, 1.9, 0.7 );
			if ( O.R() < 0.4 ) F.fine().rbox( 0, 0.5, 1.2, 0.2, 0.1, 0.28, cloth( [ 90, 96, 70 ] ), O.R() );
		}
	}
	const cr = frame( O, C.x1 - 0.9, st.y, cz - 0.3, - Math.PI / 2 );
	crate( cr, 1, 'military', 'Crate', true );
}

function observatory( C ) {
	const O = C.O, st = C.st;
	const tc = frame( O, ( C.x0 + C.x1 ) / 2, st.y, ( C.z0 + C.z1 ) / 2, 0 );
	telescope( tc );
	C.used.push( [ tc.x - 1.2, tc.z - 1.2, tc.x + 1.2, tc.z + 1.2 ] );
	const r = Math.min( C.w, C.d ) / 2 - 1.2;
	for ( let i = 0; i < 3; i ++ ) {
		const a = Math.PI * 0.25 + i * Math.PI * 0.5;
		const F = frame( O, tc.x + Math.cos( a ) * r, st.y, tc.z + Math.sin( a ) * r, Math.atan2( - Math.cos( a ), - Math.sin( a ) ) + Math.PI );
		H.desk( F, 1.4, 'observatory', { pc: true } );
	}
}

function checkin( C ) {
	const O = C.O, st = C.st;
	const n = Math.max( 1, Math.min( 4, Math.floor( ( C.w - 4 ) / 5.5 ) ) );
	const cz = C.z0 + Math.min( 6.5, C.d * 0.55 );
	for ( let i = 0; i < n; i ++ ) {
		const x = ( C.x0 + C.x1 ) / 2 + ( i - ( n - 1 ) / 2 ) * 5.5;
		const r = [ x - 2.1, cz, x + 2.1, cz + 2.0 ];
		if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
		C.used.push( r );
		checkinDesk( frame( O, x, st.y, cz, 0 ), 3.8 );
	}
	for ( let i = 0; i < 4; i ++ ) { const f = inRoom( C, 0.5, 0.35, 0.8 ); if ( f ) suitcase( f ); }
	for ( let i = 0; i < 3; i ++ ) { const b = onWall( C, 1.8, 0.55, 0.9, [ 0, 1, 3 ] ); if ( b ) T.seats( b, 3, [ 60, 80, 110 ] ); }
	for ( let i = 0; i < 2; i ++ ) { const p = onWall( C, 0.45, 0.45, 1.0, [ 0, 1, 3 ], 'corner' ); if ( p ) H.pottedPlant( p.at( 0, 0, 0.24 ), { big: true } ); }
	for ( let i = 0; i < 2; i ++ ) { const lc = inRoom( C, 1.2, 0.7, 1.0, 8 ); if ( lc ) T.luggageCart( lc ); }
}

function gate( C ) {
	const O = C.O, R = O.R, st = C.st;
	const gd = onWall( C, 2.2, 0.7, 1.1, [ 3, 1 ], 'centre' );
	if ( gd ) { counter( gd, 2.2, 0.7, 1.05, gloss( [ 60, 70, 90 ] ) ); gd.container( - 0.6, 0, 0, 0.6, 1.05, 0.7, 'Desk', 'office', 8, { n: 1 } ); gd.box( - 0.25, 1.05, 0.1, 0.25, 1.37, 0.13, BLACK ); }
	const m = [ [ 50, 70, 110 ], [ 40, 44, 50 ], [ 120, 40, 40 ] ][ ( R() * 3 ) | 0 ];
	for ( let z = C.z0 + 1.6; z + 1.15 < C.z1 - 2.2; z += 2.75 ) {
		for ( let x = C.x0 + 1.4; x + 3.0 < C.x1 - 1.0; x += 4.2 ) {
			const r = [ x, z, x + 3.0, z + 1.15 ];
			if ( C.used.some( u => overlaps( u, r ) ) || C.clear.some( u => overlaps( u, r ) ) ) continue;
			C.used.push( r );
			T.seats( frame( O, x + 1.5, st.y, z + 0.55, Math.PI ), 5, m );
			T.seats( frame( O, x + 1.5, st.y, z + 0.6, 0 ), 5, m );
		}
	}
	for ( let i = 0; i < 3; i ++ ) { const f = inRoom( C, 0.5, 0.35, 0.6 ); if ( f ) suitcase( f ); }
	for ( let i = 0; i < 2; i ++ ) { const b = inRoom( C, 0.6, 0.5, 0.6, 8 ); if ( b ) X.bag( b, 'zombie_tourist' ); }
}

function claim( C ) {
	const lw = Math.min( 7, C.w - 2.6 ), ld = Math.min( 2.2, C.d - 3 );
	const F = centre( C, lw, ld );
	if ( F ) carousel( F.at( 0, 0, - ld / 2 ), lw, ld );
	for ( let i = 0; i < 3; i ++ ) { const f = inRoom( C, 0.5, 0.35, 0.6 ); if ( f ) suitcase( f ); }
	const b = onWall( C, 1.8, 0.55, 0.9, [ 1, 3, 0 ] ); if ( b ) T.seats( b, 3, [ 60, 80, 110 ] );
}

function cab( C ) {
	const R = C.O.R;
	for ( let i = 0; i < 4; i ++ ) {
		const w = Math.min( 2.4, Math.max( C.w, C.d ) - 1.2 );
		const f = onWall( C, w, 0.75, 0.9, [ 0, 1, 2, 3 ] );
		if ( ! f ) break;
		console_( f, w );
	}
	for ( let i = 0; i < 2; i ++ ) { const c = inRoom( C, 0.6, 0.6, 0.4 ); if ( c ) H.officeChair( c, R() < 0.3 ); }
}

function loggia( C ) {
	const R = C.O.R;
	// a small table and two chairs, a lounger, a plant
	if ( R() < 0.75 && C.w > 1.2 && C.d > 1.2 ) {
		const f = inRoom( C, 1.4, 0.7, 0.15 );
		if ( f ) {
			const m = gloss( pickOf( R, [ [ 236, 236, 232 ], [ 60, 60, 64 ], [ 150, 110, 70 ] ] ) );
			f.cyl( 0, 0, 0, 0.25, 0.02, 10, m ).cyl( 0, 0.02, 0, 0.025, 0.68, 6, m ).cyl( 0, 0.7, 0, 0.3, 0.02, 12, m );
			f.col( - 0.3, 0, - 0.3, 0.3, 0.72, 0.3, 1, 2 );
			for ( const s of [ - 1, 1 ] ) H.chair( f.at( s * 0.52, 0, 0, s * Math.PI / 2 ), m, R() < 0.15 );
			if ( R() < 0.6 ) { const ff = f.fine(); SMALL[ pickOf( R, [ 'glass', 'mug', 'ashtray', 'bottle' ] ) ]( ff, 0.1, 0.72, 0.05, R ); }
		}
	}
	if ( R() < 0.5 ) { const p = inRoom( C, 0.5, 0.5, 0.1 ); if ( p ) H.pottedPlant( p.at( 0, 0, 0 ), { big: R() < 0.5 } ); }
}

// ---- airport, tower pieces kept here -----------------------------------------------------------------------------------------------

function checkinDesk( F, w ) {
	const body = paint( [ 70, 80, 96 ] ), top = M( L.terrazzo, [ 230, 226, 216 ], 1.5, F_IN );
	F.box( - w / 2, 0, 0, w / 2, 1.02, 0.6, body );
	F.box( - w / 2 - 0.02, 1.02, - 0.04, w / 2 + 0.02, 1.06, 0.62, top );
	F.box( - 0.4, 0, - 0.02, 0.4, 0.28, 0.58, STEEL );
	for ( const s of [ - 1, 1 ] ) {
		F.box( s * w / 4 - 0.25, 1.06, 0.3, s * w / 4 + 0.25, 1.38, 0.33, BLACK );
		F.container( s * w / 4 - 0.5, 0, 0.1, s * w / 4 + 0.5, 1.06, 0.6, 'Desk', 'office', 8, { n: 1 } );
	}
	F.col( - w / 2, 0, 0, w / 2, 1.06, 0.62, 1 );
	F.box( - w / 2, 0, 1.3, w / 2, 0.42, 1.95, STEEL );
	F.box( - w / 2 + 0.03, 0.42, 1.34, w / 2 - 0.03, 0.44, 1.91, BLACK );
	F.col( - w / 2, 0, 1.3, w / 2, 0.44, 1.95, 2, 2 );
	F.spot( w / 4, 1.06, 0.3, 'office', 0.35 );
	F.spot( - w / 4, 0.44, 1.6, 'hotel_room', 0.3 );
	return F;
}

function suitcase( F ) {
	const O = F.O, R = O.R;
	const c = [ [ 40, 44, 52 ], [ 120, 30, 36 ], [ 30, 70, 110 ], [ 60, 90, 70 ], [ 170, 150, 110 ] ][ ( R() * 5 ) | 0 ];
	const m = gloss( c );
	if ( R() < 0.5 ) {
		F.box( - 0.22, 0.03, - 0.13, 0.22, 0.68, 0.13, m ).box( - 0.12, 0.68, - 0.02, - 0.1, 0.95, 0.0, BLACK ).box( 0.1, 0.68, - 0.02, 0.12, 0.95, 0.0, BLACK ).box( - 0.12, 0.93, - 0.02, 0.12, 0.96, 0.0, BLACK );
		F.col( - 0.22, 0, - 0.13, 0.22, 0.68, 0.13, 1, 2 );
		F.container( - 0.22, 0, - 0.13, 0.22, 0.68, 0.13, 'Suitcase', 'hotel_room', 20, { n: 2, empty: 0.3 } );
	} else {
		F.box( - 0.34, 0, - 0.22, 0.34, 0.26, 0.22, m ).box( - 0.08, 0.26, - 0.03, 0.08, 0.3, 0.03, BLACK );
		F.col( - 0.34, 0, - 0.22, 0.34, 0.26, 0.22, 1, 2 );
		F.container( - 0.34, 0, - 0.22, 0.34, 0.26, 0.22, 'Suitcase', 'hotel_room', 20, { n: 2, empty: 0.3 } );
	}
	return F;
}

function carousel( F, w, d ) {
	const r = d / 2, ex = w / 2 - r;
	F.box( - ex, 0, 0, ex, 0.45, d, STEEL );
	F.box( - ex, 0.45, 0.04, ex, 0.47, d - 0.04, BLACK );
	F.cyl( - ex, 0, r, r, 0.45, 12, STEEL ).cyl( ex, 0, r, r, 0.45, 12, STEEL );
	F.cyl( - ex, 0.45, r, r - 0.04, 0.02, 12, BLACK ).cyl( ex, 0.45, r, r - 0.04, 0.02, 12, BLACK );
	F.box( - ex, 0.47, r - 0.3, ex, 0.9, r + 0.3, metal( [ 150, 152, 156 ] ) );
	F.col( - w / 2, 0, 0, w / 2, 0.47, d, 2, 2 ).col( - ex, 0.47, r - 0.3, ex, 0.9, r + 0.3, 2, 2 );
	const O = F.O;
	for ( let i = 0; i < 4; i ++ ) {
		if ( O.R() < 0.35 ) continue;
		const x = - ex + ( i + 0.5 ) * ( 2 * ex ) / 4, z = O.R() < 0.5 ? 0.35 : d - 0.35;
		const [ tx, tz ] = F.T( x, z );
		suitcase( frame( O, tx, F.y + 0.47, tz, F.rot + O.R() * 0.6 - 0.3 ) );
	}
	return F;
}

function console_( F, w ) {
	const body = paint( [ 70, 74, 80 ] );
	F.box( - w / 2, 0, 0.1, w / 2, 0.78, 0.75, body );
	F.box( - w / 2, 0.78, 0.05, w / 2, 0.82, 0.78, paint( [ 40, 42, 46 ] ) );
	const n = Math.max( 1, Math.floor( w / 0.7 ) );
	for ( let k = 0; k < n; k ++ ) {
		const x = - w / 2 + ( k + 0.5 ) * w / n;
		F.box( x - 0.26, 0.82, 0.12, x + 0.26, 1.2, 0.16, BLACK ).box( x - 0.24, 0.84, 0.16, x + 0.24, 1.18, 0.162, gloss( [ 12, 13, 15 ] ) );
		F.box( x - 0.2, 0.82, 0.35, x + 0.2, 0.86, 0.55, paint( [ 50, 52, 58 ] ) );
	}
	F.col( - w / 2, 0, 0.05, w / 2, 0.82, 0.78, 2, 2 );
	F.container( - w / 2, 0, 0.1, - w / 2 + 0.6, 0.78, 0.75, 'Cabinet', 'office', 10, { n: 1 } );
	F.spot( w / 2 - 0.3, 0.82, 0.5, 'office', 0.4 );
	return F;
}

// ---- windows, doors: barricades ---------------------------------------------------------------------------------------------------

function barricades( C ) {
	const R = C.O.R;
	for ( const w of C.windows ) {
		if ( w.state === 1 ) continue; // boarded from outside already
		const u = R();
		if ( u < 0.55 ) X.boardWindow( C, w );
		else if ( u < 0.65 && w.y0 - C.st.y < 1.0 ) X.mattressOverWindow( C, w );
	}
	// the back door blocked with furniture (the front door stays usable)
	for ( const d of C.doors ) if ( d.ext && d.kind === 'back' && R() < 0.6 ) X.doorPile( C, d.side, ( d.a0 + d.a1 ) / 2, d.a1 - d.a0 );
}

// ---- walls and ceilings ---------------------------------------------------------------------------------------------------------------

const ART_N = { living: 3, bedroom: 2, hotelroom: 2, lobby: 2, office: 2, meeting: 1, dining: 3, hall: 1, entry: 1, waiting: 2, dayroom: 2, vestry: 1, corridor: 2, sales: 1, bar: 2, classroom: 2, briefing: 1, ward: 1, exam: 1, openoffice: 2, kitchen: 1, breakroom: 1, lockers: 1 };
function artSet( C, t, k ) {
	if ( C.home ) return k === 'kitchen' ? [ 13, 4, 7 ] : ART_HOME;
	if ( t === 'police' ) return ART_POLICE;
	if ( t === 'hospital' || t === 'clinic' ) return ART_CARE;
	if ( t === 'school' ) return ART_SCHOOL;
	if ( t === 'hotel' ) return ART_HOTEL;
	if ( k === 'dining' || k === 'bar' || t === 'restaurant' || t === 'fastfood' || t === 'bar' ) return ART_FOOD;
	if ( t === 'gunstore' ) return [ 10, 11, 14 ];
	return ART_OFFICE;
}

// pictures and posters on the walls, clear of doors and windows; some hang crooked or lie on the floor
function wallArt( C, n, set, home ) {
	const O = C.O, R = O.R;
	const frameM = paint( home ? pickOf( R, WOODS ) : [ 40, 40, 42 ] );
	for ( let k = 0, tries = 0; k < n && tries < 16; tries ++ ) {
		const side = ( R() * 4 ) | 0;
		const lo = side === 0 || side === 2 ? C.x0 : C.z0, hi = side === 0 || side === 2 ? C.x1 : C.z1;
		const cell = pickOf( R, set );
		const poster = cell >= 8;
		const w = poster ? 0.45 + R() * 0.2 : 0.45 + R() * 0.55, h = poster ? w * 1.35 : w * ( 0.65 + R() * 0.3 );
		if ( hi - lo < w + 0.7 ) continue;
		const a = lo + 0.35 + w / 2 + R() * ( hi - lo - w - 0.7 );
		if ( C.blocked[ side ].some( b => b[ 0 ] < a + w / 2 + 0.15 && b[ 1 ] > a - w / 2 - 0.15 ) ) continue;
		const y0 = Math.min( C.ceil - h - 0.25, 1.3 + R() * 0.25 );
		// not behind tall furniture, not over another picture
		const wr = wallRect( C, side, a, w + 0.1, 0.3 );
		if ( C.used.some( u => ( u[ 4 ] ?? 0 ) > y0 - 0.05 && overlaps( u, wr ) ) ) continue;
		C.blocked[ side ].push( [ a - w / 2 - 0.1, a + w / 2 + 0.1, - 1 ] );
		const F = frameOnWall( C, side, a );
		const img = art( cell );
		if ( R() < 0.1 && ! poster ) {
			// knocked off the wall, face down
			F.fine().rbox( 0, 0.02, 0.25 + h / 2, w / 2, 0.015, h / 2, frameM, R() * 0.5 - 0.25 );
		} else if ( poster ) {
			F.rbox( 0, y0 + h / 2, 0.006, w / 2, h / 2, 0.002, img, 0, 0, R() < 0.2 ? ( R() - 0.5 ) * 0.1 : 0 );
		} else {
			const tilt = R() < 0.2 ? ( R() - 0.5 ) * 0.12 : 0;
			F.rbox( 0, y0 + h / 2, 0.016, w / 2, h / 2, 0.012, frameM, 0, 0, tilt );
			F.rbox( 0, y0 + h / 2, 0.029, w / 2 - 0.035, h / 2 - 0.035, 0.002, img, 0, 0, tilt );
		}
		k ++;
	}
}

// a light fitting on the ceiling (the power is out): fans or domes in homes, tubes in shops and workshops, panels in offices
function fixtures( C, t, arch ) {
	if ( C.fixture || C.rm.open ) return;
	const O = C.O, R = O.R, k = C.rm.k;
	const kind = C.home || k === 'hotelroom' || k === 'hbath' || k === 'bath' ? 'dome'
		: k === 'office' || k === 'openoffice' || k === 'meeting' || k === 'lobby' || k === 'corridor' || k === 'waiting' || k === 'ward' || k === 'exam' || k === 'classroom' || k === 'briefing' ? 'panel' : 'tube';
	if ( kind === 'dome' ) { H.ceilingLight( frame( O, ( C.x0 + C.x1 ) / 2, C.st.y, ( C.z0 + C.z1 ) / 2, 0, O.gd ), C.ceil, 'dome' ); return; }
	if ( arch === 'tent' || k === 'nave' || k === 'hallbig' && C.ceil > 6 ) return;
	const pitch = kind === 'panel' ? 2.4 : 3.0;
	const nx = Math.max( 1, Math.round( C.w / pitch ) ), nz = Math.max( 1, Math.round( C.d / pitch ) );
	if ( nx * nz > 80 ) return;
	for ( let i = 0; i < nx; i ++ ) for ( let j = 0; j < nz; j ++ ) {
		const x = C.x0 + ( i + 0.5 ) * C.w / nx, z = C.z0 + ( j + 0.5 ) * C.d / nz;
		const F = frame( O, x, C.st.y, z, C.w > C.d ? 0 : Math.PI / 2, O.gd );
		// one hanging loose
		if ( kind === 'tube' && R() < 0.04 ) { F.rbox( 0.3, C.ceil - 0.5, 0, 0.62, 0.04, 0.1, WHITE, 0, 0, 0.7 ); continue; }
		H.ceilingLight( F, C.ceil, kind );
	}
	void t;
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
			const F = frame( O, x + tw / 2, C.st.y, z + td / 2, 0 );
			H.diningSet( F, tw, td, { loot, tipped: 0.2 } );
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

