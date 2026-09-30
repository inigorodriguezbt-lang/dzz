// Floor plans: rooms per storey, the doors between them, the stairs, and every wall that follows from
// them (interior partitions and facades, with their window grids). Deterministic per building, so the
// far shell (windows drawn by the facade shader) and the real interior (real openings) always agree.
//
// Plan coordinates are building-local metres: x across the front, z from the front (-d/2) to the back.
// Sides: 0 front (-z), 1 right (+x), 2 back (+z), 3 left (-x). Along a side, u runs to the right of a
// viewer standing outside.
import { shapeOf, rectOf, hash32, rng, pick, PAL, L, winHash } from './data.js';

export const KINDS = {
	living: { hub: 2 }, kitchen: { hub: 1 }, bedroom: {}, bath: {}, hall: { hub: 3 }, stair: { hub: 2 },
	porch: { open: 1, hub: 2 }, gallery: { open: 1, hub: 3 }, loggia: { open: 1 }, garage: {},
	sales: { hub: 3 }, storage: {}, office: {}, restroom: {}, dining: { hub: 2 }, rkitchen: {}, bar: { hub: 2 },
	lobby: { hub: 3 }, corridor: { hub: 3 }, cells: {}, armory: {}, lockers: {}, briefing: {}, ward: {}, exam: {},
	waiting: { hub: 3 }, classroom: {}, nave: { hub: 2 }, vestry: {}, hallbig: { hub: 3 }, bay: { hub: 3 }, dayroom: { hub: 1 },
	dorm: {}, bunk: {}, latrine: {}, vault: {}, sorting: {}, workshop: {}, openoffice: { hub: 1 }, meeting: {}, breakroom: {},
	hotelroom: {}, hbath: {}, entry: { hub: 2 }, elevator: {}, utility: {}, rx: {}, tent: { hub: 1 }, observatory: { hub: 1 }, teller: { hub: 3 },
	checkin: { hub: 3 }, gate: { hub: 3 }, claim: { hub: 2 }, cab: { hub: 1 },
};

const EPS = 0.02;
const SIDE_N = [ [ 0, - 1 ], [ 1, 0 ], [ 0, 1 ], [ - 1, 0 ] ];
// direction of travel (u) along each side, seen from outside
const SIDE_T = [ [ - 1, 0 ], [ 0, - 1 ], [ 1, 0 ], [ 0, 1 ] ];

// material spec helper: { l: layer, c: [r,g,b], s: metres per texture repeat, f: flags }
export const M = ( l, c = [ 255, 255, 255 ], s = 2, f = 0, extra = null ) => extra ? Object.assign( { l, c, s, f }, extra ) : { l, c, s, f };

// ---- public ------------------------------------------------------------------------------------------

export function makePlan( r, cities ) {
	const S = shapeOf( r, cities );
	const R = rng( hash32( r.i, 0x91a7 ) );
	const rect = rectOf( S );
	const P = {
		r, S, R, rect, bid: r.i, storeys: [], stair: null, T: 0.25, feats: {},
		boarded: 0, broken: 0, frame: 0,
	};
	for ( let i = 0; i < S.n; i ++ ) P.storeys.push( { i, y: S.ys[ i ], h: S.Hs[ i ], rooms: [], links: [], ext: [], facades: [], walls: [], rails: [], doors: [], holes: [] } );
	palette( P );
	const fn = LAYOUT[ S.arch ] || LAYOUT.generic;
	fn( P );
	for ( const st of P.storeys ) derive( P, st );
	return P;
}

// ---- palettes and facade styles -----------------------------------------------------------------------

function palette( P ) {
	const { S, r, R } = P;
	const st = r.style;
	const mat = P.mat = {};
	const paint = ( list ) => list[ Math.floor( R() * list.length ) ];
	// the outbreak: some buildings were boarded up, some were broken into
	const u = R();
	P.boarded = u < 0.12 ? 0.25 + R() * 0.5 : u < 0.3 ? 0.04 : 0;
	P.broken = 0.02 + R() * 0.08;
	P.intWall = paint( PAL.wall_in );
	mat.plinth = M( L.concrete, [ 200, 196, 188 ], 3 );
	mat.trim = M( L.plain, [ 240, 238, 232 ], 1 );
	mat.fascia = mat.trim;
	P.frame = 0; // facade shader frame colour index (0 white, 1 bronze, 2 alu, 3 black, 4 green, 5 wood, 6 teal, 7 red)
	P.winStyle = 1;
	switch ( S.arch ) {
		case 'house': {
			if ( S.variant.startsWith( 'plantation' ) ) {
				mat.ext = M( L.planks, paint( PAL.siding ), 2.4 );
				const tr = paint( PAL.trim );
				mat.trim = M( L.plain, tr, 1 );
				P.frame = tr[ 0 ] > 200 ? 0 : tr[ 1 ] > 80 ? 4 : 5;
				mat.roof = M( L.tinroof, paint( PAL.tin ), 1.6, 0, { r: 1 } );
				mat.plinth = M( L.lattice, [ 238, 236, 228 ], 1.2 );
				P.winStyle = R() < 0.55 ? 2 : 1;
			} else if ( S.variant === 'cmu' ) {
				mat.ext = M( R() < 0.5 ? L.cmu : L.stucco, paint( PAL.stucco ), 2.4 );
				mat.roof = R() < 0.6 ? M( L.greyroof, [ 200, 200, 196 ], 2.5 ) : M( L.tinroof, paint( PAL.tin ), 1.6, 0, { r: 1 } );
				P.winStyle = R() < 0.6 ? 2 : 1; P.frame = R() < 0.5 ? 2 : 0;
			} else {
				mat.ext = M( L.stucco, paint( PAL.stucco ), 3 );
				mat.roof = S.roof === 'flat' ? M( L.bitumen, [ 190, 190, 190 ], 4 ) : M( L.roof, [ 230, 220, 210 ], 2.2 );
				P.winStyle = 1; P.frame = R() < 0.5 ? 3 : 0;
			}
			break;
		}
		case 'walkup':
			mat.ext = M( R() < 0.4 ? L.cmu : L.stucco, paint( PAL.stucco ), 2.6 );
			mat.roof = M( L.bitumen, [ 180, 180, 180 ], 4 );
			P.winStyle = R() < 0.6 ? 2 : 1; P.frame = 2;
			mat.rail = M( L.plain, paint( [ [ 240, 240, 236 ], [ 60, 90, 80 ], [ 80, 60, 50 ], [ 50, 70, 100 ] ] ), 1 );
			break;
		case 'tower': {
			const sub = S.variant;
			if ( sub === 'office' ) {
				const g = R() < 0.65;
				mat.ext = g ? M( L.panels, paint( PAL.concrete ), 3 ) : M( L.concrete, paint( PAL.concrete ), 4 );
				mat.glass = paint( PAL.glass );
				P.winStyle = g ? 3 : 12; P.frame = paint( [ 1, 2, 3, 2 ] );
			} else {
				mat.ext = M( R() < 0.5 ? L.stucco : L.concrete, sub === 'hotel' ? paint( PAL.stucco ) : paint( [ ...PAL.stucco, ...PAL.concrete ] ), 3.5 );
				P.winStyle = 5; P.frame = R() < 0.5 ? 2 : 0;
			}
			mat.roof = M( L.bitumen, [ 170, 170, 170 ], 4 );
			mat.rail = M( L.plain, paint( [ [ 236, 236, 232 ], [ 40, 44, 48 ], [ 150, 160, 168 ] ] ), 1 );
			break;
		}
		case 'office':
			mat.ext = M( R() < 0.5 ? L.concrete : L.stucco, paint( PAL.concrete ), 3 );
			mat.roof = M( L.bitumen, [ 170, 170, 170 ], 4 );
			P.winStyle = 12; P.frame = paint( [ 1, 2, 3 ] );
			break;
		case 'shop': case 'food': case 'bigbox': case 'gas':
			mat.ext = S.arch === 'bigbox' ? M( R() < 0.5 ? L.cmu : L.concrete, paint( PAL.stucco ), 3 ) : M( pick( R, [ L.stucco, L.stucco, L.cmu, L.brick, L.beige ] ), paint( PAL.stucco ), 2.6 );
			if ( mat.ext.l === L.brick ) mat.ext.c = [ 230, 220, 210 ];
			mat.roof = M( L.bitumen, [ 175, 175, 175 ], 4 );
			P.winStyle = 4; P.frame = paint( [ 1, 2, 3 ] );
			mat.awning = M( L.fabric, paint( PAL.awning ), 1.5 );
			break;
		case 'church':
			mat.ext = M( R() < 0.4 ? L.planks : L.stucco, [ 244, 242, 236 ], 2.4 );
			mat.roof = R() < 0.5 ? M( L.greyroof, [ 190, 190, 186 ], 2.5 ) : M( L.tinroof, paint( PAL.tin ), 1.6, 0, { r: 1 } );
			P.winStyle = 13; P.frame = 0;
			break;
		case 'warehouse': case 'hangar': case 'garage':
			mat.ext = S.arch === 'garage' ? M( L.cmu, paint( PAL.stucco ), 2.4 ) : M( L.tinroof, paint( [ [ 200, 204, 204 ], [ 190, 180, 160 ], [ 150, 170, 170 ], [ 180, 150, 120 ] ] ), 1.6, 0, { r: 1 } );
			mat.roof = S.arch === 'garage' ? M( L.bitumen, [ 175, 175, 175 ], 4 ) : M( L.tinroof, [ 180, 184, 186 ], 1.6, 0, { r: 1 } );
			P.winStyle = 6; P.frame = 3;
			break;
		case 'barracks': case 'hq': case 'armory':
			mat.ext = M( L.stucco, [ 214, 198, 168 ], 3 );
			mat.roof = S.roof === 'gable' ? M( L.tinroof, [ 150, 62, 44 ], 1.6, 0, { r: 1 } ) : M( L.bitumen, [ 170, 170, 170 ], 4 );
			P.winStyle = 1; P.frame = 0;
			break;
		case 'tent':
			mat.ext = M( L.fabric, [ 120, 118, 84 ], 1.5 );
			mat.roof = mat.ext;
			P.winStyle = 0;
			break;
		case 'terminal':
			mat.ext = M( L.panels, pick( R, [ [ 226, 226, 220 ], [ 214, 218, 222 ], [ 232, 226, 212 ] ] ), 3 );
			mat.roof = M( L.bitumen, [ 176, 176, 176 ], 4 );
			mat.awning = M( L.metal, [ 236, 236, 232 ], 2 );
			P.winStyle = 3; P.frame = 2;
			break;
		case 'ctower':
			mat.ext = M( L.concrete, [ 226, 224, 218 ], 3 );
			mat.roof = M( L.bitumen, [ 176, 176, 176 ], 4 );
			mat.rail = M( L.plain, [ 236, 236, 232 ], 1 );
			P.winStyle = 1; P.frame = 2;
			break;
		case 'dome':
			mat.ext = M( L.stucco, [ 236, 236, 232 ], 3 );
			// the Mauna Kea domes are painted white steel
			mat.roof = M( L.plain, [ 246, 246, 244 ], 3 );
			P.winStyle = 0;
			break;
		default:
			mat.ext = M( L.stucco, paint( PAL.stucco ), 3 );
			mat.roof = M( L.bitumen, [ 175, 175, 175 ], 4 );
			P.winStyle = 1; P.frame = paint( [ 0, 2 ] );
	}
	if ( ! mat.rail ) mat.rail = M( L.plain, mat.trim.c, 1 );
	// the frame colour follows the trim for wood houses
	P.boarded *= S.arch === 'tower' ? 0.3 : 1;
}

// window grid for a facade piece of length len, by room kind; null = blank wall
function windowsFor( P, room, len, st, side ) {
	const k = room.k, ws = P.winStyle, S = P.S;
	const ch = st.h;
	const w = ( bay, ww, h, sill, style = ws ) => {
		const n = Math.max( 1, Math.floor( len / bay + 0.15 ) );
		const b = len / n;
		ww = Math.min( ww, b - 0.35 );
		if ( ww < 0.45 || len < 0.9 ) return null;
		h = Math.min( h, ch - sill - 0.45 );
		return { bay: b, w: ww, h, sill, style };
	};
	if ( ws === 0 ) return null;
	// the control tower's cab is glass all round, above a desk-high sill
	if ( S.arch === 'ctower' && st.i === S.n - 1 ) return w( 1.6, 1.52, ch - 1.15, 0.95, 3 );
	switch ( k ) {
		case 'checkin': case 'gate': case 'claim':
			return w( 2.0, 1.92, ch - 1.0, 0.35, 3 );
		case 'bath': case 'hbath': case 'restroom': case 'latrine': return len >= 1.3 ? { bay: len, w: 0.65, h: 0.7, sill: 1.5, style: 11 } : null;
		case 'stair': return len >= 2 ? { bay: len, w: 0.9, h: Math.min( 1.6, ch - 1.6 ), sill: 1.1, style: ws === 3 ? 3 : ws === 4 ? 1 : ws } : null;
		case 'hall': case 'corridor': case 'entry': return len >= 1.5 && len < 4 ? { bay: len, w: Math.min( 1.1, len - 0.5 ), h: 1.3, sill: 0.95, style: ws === 4 ? 1 : ws } : null;
		case 'elevator': case 'vault': case 'utility': case 'cells': case 'armory': return len > 2 && k === 'cells' ? w( 3, 0.5, 0.3, 1.9, 6 ) : null;
		case 'storage': case 'sorting': case 'workshop': return len > 3 ? w( 4.5, 1.2, 0.8, Math.max( 1.8, ch - 1.4 ), 6 ) : null;
		case 'hallbig': case 'bay': return len > 6 ? w( 6, 2.4, 1.0, Math.max( 2.2, ch - 2.0 ), 6 ) : null;
		case 'garage': return len > 3 ? w( 3.5, 1.0, 0.7, 1.7, 6 ) : null;
		case 'sales': case 'dining': case 'bar': case 'waiting': case 'lobby': case 'teller':
			if ( ( side === 0 || S.arch === 'tower' ) && st.i === 0 && ( S.arch === 'shop' || S.arch === 'food' || S.arch === 'bigbox' || S.arch === 'gas' || S.arch === 'tower' || k === 'lobby' || k === 'waiting' || k === 'teller' ) ) {
				return w( S.arch === 'bigbox' ? 3.2 : 2.6, 3.0, Math.min( 2.7, ch - 1.0 ), 0.45, 4 );
			}
			if ( S.arch === 'bigbox' || k === 'sales' ) return null;
			return w( 2.6, 1.5, 1.4, 0.9, ws === 4 ? 1 : ws );
		case 'openoffice': case 'office': case 'meeting': case 'briefing': case 'breakroom':
			if ( ws === 3 ) return w( 1.5, 1.44, ch - 1.0, 0.75, 3 );
			if ( ws === 12 ) return w( 1.6, 1.5, 1.35, 0.95, 12 );
			return w( 2.4, 1.3, 1.4, 0.9, ws === 4 ? 1 : ws );
		case 'classroom': case 'ward': case 'exam': return w( 2.3, 1.9, 1.6, 0.85, ws === 4 ? 1 : ws === 13 ? 1 : ws );
		case 'nave': return w( 3.6, 1.2, Math.min( 3.6, ch - 2.2 ), 1.6, 13 );
		case 'hotelroom': case 'living': case 'dining2':
			if ( ws === 5 ) return w( len, 2.4, 2.25, 0.0, 5 );
			return w( 2.6, 1.5, 1.35, 0.85 );
		case 'bedroom': case 'bunk': case 'dorm': case 'dayroom':
			if ( ws === 5 ) return w( len, 1.6, 1.4, 0.9, 1 );
			return w( 2.8, 1.2, 1.25, 0.95, ws === 4 || ws === 13 ? 1 : ws );
		case 'kitchen': case 'rkitchen': return w( 2.6, 1.0, 1.0, 1.15, ws === 4 || ws === 5 || ws === 13 ? 1 : ws );
		case 'observatory': case 'tent': return null;
		default: return w( 2.8, 1.2, 1.3, 0.95, ws === 4 || ws === 13 ? 1 : ws );
	}
}

// ---- layout helpers ------------------------------------------------------------------------------------

function room( st, k, x0, z0, x1, z1, o = {} ) {
	if ( x1 - x0 < 0.3 || z1 - z0 < 0.3 ) return null;
	const R = { k, x0, z0, x1, z1, id: st.rooms.length, open: !! KINDS[ k ]?.open, ...o };
	st.rooms.push( R );
	return R;
}
function link( st, a, b, kind = 'door', o = {} ) { if ( a && b ) st.links.push( { a, b, kind, ...o } ); }
// exterior door on a room side; at: u fraction along the room's side (0.5 = centre) or absolute via o.u
function extDoor( st, rm, side, o = {} ) { if ( rm ) st.ext.push( { room: rm, side, at: 0.5, w: 0.95, h: 2.1, kind: 'ext', ...o } ); }

// split [a0, a1] by sizes (m); 0 = flexible share of what is left
function spans( a0, a1, sizes ) {
	const fixed = sizes.reduce( ( s, v ) => s + ( v > 0 ? v : 0 ), 0 );
	const flex = sizes.filter( v => v <= 0 ).length;
	const f = flex ? Math.max( 0, ( a1 - a0 - fixed ) / flex ) : 0;
	const out = [];
	let a = a0;
	for ( const v of sizes ) { const d = v > 0 ? v : f; out.push( [ a, a + d ] ); a += d; }
	if ( out.length ) out[ out.length - 1 ][ 1 ] = a1;
	return out;
}

// the stair's size for this building: width across, length along the run
function stairDims( P ) {
	const Hm = Math.max( ...P.S.Hs );
	const house = P.S.arch === 'house';
	const tread = house ? 0.25 : 0.27;
	const nR = Math.ceil( ( Hm / 2 ) / 0.19 );
	return { sw: house ? 2.1 : 2.6, sl: 1.2 + nR * tread + 1.05, tread, nR };
}

// reserve the same stair rect on every storey; e = entry side (the flights run away from it)
function setStair( P, x0, z0, x1, z1, e, roof = false ) {
	P.stair = { x0, z0, x1, z1, e, roof };
}

// a tower-like double-loaded corridor plan along the long axis. Builds every storey of `P` from index `from`.
// kindsFn( st, side, i, n ) -> room kind for the i-th module on side (-1 / +1)
function corridorFloors( P, o ) {
	const { rect } = P;
	const W = rect.x1 - rect.x0, D = rect.z1 - rect.z0;
	const alongZ = o.axis ? o.axis === 'z' : D >= W;
	// (a, b) frame: a along the corridor, b across. map(a0,b0,a1,b1) -> x/z rect
	const A0 = alongZ ? rect.z0 : rect.x0, A1 = alongZ ? rect.z1 : rect.x1;
	const B0 = alongZ ? rect.x0 : rect.z0, B1 = alongZ ? rect.x1 : rect.z1;
	const mk = ( st, k, a0, b0, a1, b1, x = {} ) => alongZ ? room( st, k, b0, a0, b1, a1, x ) : room( st, k, a0, b0, a1, b1, x );
	const cw = o.cw || 2.0;
	const bc = ( B0 + B1 ) / 2 + ( o.shift || 0 );
	const c0 = bc - cw / 2, c1 = bc + cw / 2;
	const sd = stairDims( P );
	// stair modules: across the corridor on the +b side, the run along b away from the corridor
	const stairsAt = o.stairs || [ ( A0 + A1 ) / 2 ];
	const stairRects = stairsAt.map( ac => [ ac - sd.sw / 2, ac + sd.sw / 2 ] );
	const sideDepth = Math.min( B1 - c1, c0 - B0 );
	const sl = Math.min( sd.sl, B1 - c1 );
	// entry side of the stair: the corridor side. In plan sides: along z the corridor side is -x (3); along x it is -z (0)
	const e = alongZ ? 3 : 0;
	const s0 = stairRects[ 0 ];
	if ( alongZ ) setStair( P, c1, s0[ 0 ], c1 + sl, s0[ 1 ], e, o.roof );
	else setStair( P, s0[ 0 ], c1, s0[ 1 ], c1 + sl, e, o.roof );
	P.stairs2 = stairRects.slice( 1 ).map( s => alongZ ? { x0: c1, z0: s[ 0 ], x1: c1 + sl, z1: s[ 1 ], e } : { x0: s[ 0 ], z0: c1, x1: s[ 1 ], z1: c1 + sl, e } );
	// the elevator core beside the first stair
	const elev = o.elevator ? [ s0[ 1 ], s0[ 1 ] + 2.6 ] : null;
	for ( const st of P.storeys ) {
		if ( st.i < ( o.from || 0 ) ) continue;
		const corr = mk( st, 'corridor', A0, c0, A1, c1 );
		// modules along a on both sides, skipping the stair / elevator cells
		const blocks = [];
		for ( const s of stairRects ) blocks.push( { a0: s[ 0 ], a1: s[ 1 ], side: 1, k: 'stair' } );
		if ( elev ) blocks.push( { a0: elev[ 0 ], a1: elev[ 1 ], side: 1, k: 'elevator' } );
		for ( const side of [ - 1, 1 ] ) {
			const bb0 = side < 0 ? B0 : c1, bb1 = side < 0 ? c0 : B1;
			const mine = blocks.filter( b => b.side === side ).sort( ( p, q ) => p.a0 - q.a0 );
			let a = A0;
			const free = [];
			for ( const b of mine ) { if ( b.a0 > a + 0.5 ) free.push( [ a, b.a0 ] ); a = Math.max( a, b.a1 ); }
			if ( A1 > a + 0.5 ) free.push( [ a, A1 ] );
			for ( const b of mine ) {
				if ( b.k === 'stair' ) {
					const sr = mk( st, 'stair', b.a0, bb0, b.a1, bb0 + sl );
					if ( sr ) link( st, corr, sr, st.i === 0 && o.stairDoor === false ? 'open' : 'door', { fire: true } );
					if ( bb1 - ( bb0 + sl ) > 0.3 ) mk( st, 'utility', b.a0, bb0 + sl, b.a1, bb1 );
				} else {
					const ed = bb1 - ( bb0 + 2.6 ) > 1.2 ? 2.6 : bb1 - bb0;
					const er = mk( st, 'elevator', b.a0, bb0, b.a1, bb0 + ed );
					if ( er ) link( st, corr, er, 'elevator' );
					if ( ed < bb1 - bb0 ) mk( st, 'utility', b.a0, bb0 + 2.6, b.a1, bb1 );
				}
			}
			for ( const [ f0, f1 ] of free ) {
				const len = f1 - f0;
				const mod = o.module || 4;
				const n = Math.max( 1, Math.round( len / mod ) );
				for ( let i = 0; i < n; i ++ ) {
					const a0 = f0 + len * i / n, a1 = f0 + len * ( i + 1 ) / n;
					const k = o.kinds( st, side, i, n, a0, a1 );
					if ( ! k ) continue;
					if ( o.unit ) o.unit( st, mk, corr, k, side, a0, a1, bb0, bb1, alongZ );
					else { const rm = mk( st, k, a0, bb0, a1, bb1 ); link( st, corr, rm, 'door' ); }
				}
			}
		}
	}
	return { alongZ, A0, A1, B0, B1, c0, c1, mk, sideDepth };
}

// ---- layouts ---------------------------------------------------------------------------------------------

const LAYOUT = {
	house( P ) {
		const { rect, S, R } = P;
		const W = rect.x1 - rect.x0;
		const pd = S.porch || 0;
		const pw = pd ? W : 0;
		const pLeft = R() < 0.5;
		const zc0 = rect.z0 + pd;
		const { x0, x1, z1 } = rect;
		const D = z1 - zc0;
		const st0 = P.storeys[ 0 ];
		const porchRoom = ( st ) => pd ? ( pLeft ? room( st, 'porch', x0, rect.z0, x0 + pw, zc0 ) : room( st, 'porch', x1 - pw, rect.z0, x1, zc0 ) ) : null;
		if ( S.n === 1 ) {
			const porch = porchRoom( st0 );
			const kw = Math.min( 4.2, Math.max( 2.6, W * 0.38 ) );
			if ( D >= 7 && W >= 8 ) {
				// living + open kitchen, a short hall to two bedrooms and the bathroom
				const hallD = 1.1;
				const bdep = Math.max( 2.7, ( D - hallD ) * 0.46 );
				const fdep = D - hallD - bdep;
				const lw = Math.min( W - 2.7, Math.max( kw + 1.2, W * 0.56 ) );
				const zh0 = zc0 + fdep, zh1 = zh0 + hallD;
				const living = room( st0, 'living', x0, zc0, x0 + lw, zh0 );
				const bed1 = room( st0, 'bedroom', x0 + lw, zc0, x1, zh0 );
				const kitchen = room( st0, 'kitchen', x0, zh0, x0 + kw, z1 );
				const hall = room( st0, 'hall', x0 + kw, zh0, x1, zh1 );
				const bathW = W - kw >= 5.3 ? 2.2 : W - kw;
				const bath = room( st0, 'bath', x0 + kw, zh1, x0 + kw + bathW, z1 );
				const bed2 = W - kw - bathW >= 2.5 ? room( st0, 'bedroom', x0 + kw + bathW, zh1, x1, z1 ) : null;
				link( st0, living, kitchen, 'open' );
				link( st0, living, hall, 'arch' );
				link( st0, hall, bath ); link( st0, hall, bed1 ); link( st0, hall, bed2 );
				extDoor( st0, living, 0, { at: pLeft ? 0.6 : 0.4, kind: 'front' } );
				extDoor( st0, kitchen, 2, { at: 0.5, kind: 'back' } );
			} else {
				const fdep = D * 0.55;
				const b1 = W >= 8.5 ? 3 : 0;
				const living = room( st0, 'living', x0, zc0, x1 - b1, zc0 + fdep );
				const bed1 = b1 ? room( st0, 'bedroom', x1 - b1, zc0, x1, zc0 + fdep ) : null;
				// kitchen | bath | (bedroom): whatever is left over widens the kitchen
				const hasBed2 = W - 2.4 - 2.0 >= 2.6 && ! b1;
				const kx1 = hasBed2 ? x0 + Math.max( 2.4, W - 2.0 - 2.8 ) : x1 - 2.0;
				const kitchen = room( st0, 'kitchen', x0, zc0 + fdep, kx1, z1 );
				const bath = room( st0, 'bath', kx1, zc0 + fdep, hasBed2 ? kx1 + 2.0 : x1, z1 );
				const bed2 = hasBed2 ? room( st0, 'bedroom', kx1 + 2.0, zc0 + fdep, x1, z1 ) : null;
				link( st0, living, kitchen, 'open' );
				link( st0, living, bed1 );
				extDoor( st0, living, 0, { at: 0.5, kind: 'front' } );
				extDoor( st0, kitchen, 2, { kind: 'back' } );
				void bed2; void porch;
			}
			if ( porch ) link( st0, porch, st0.rooms[ 1 ], 'none' );
			return;
		}
		// two storeys: living downstairs, bedrooms upstairs, the stair in the back corner
		const sd = stairDims( P );
		const sw = sd.sw, sl = Math.min( sd.sl, D - 2.6 );
		const sx0 = pLeft ? x1 - sw : x0, sx1 = pLeft ? x1 : x0 + sw;
		setStair( P, sx0, z1 - sl, sx1, z1, 0 );
		porchRoom( st0 );
		const fz = z1 - sl;
		const living = room( st0, 'living', x0, zc0, x1, fz );
		const restX0 = pLeft ? x0 : sx1, restX1 = pLeft ? sx0 : x1;
		const kitchen = room( st0, 'kitchen', pLeft ? restX0 : restX0 + 1.9, fz, pLeft ? restX1 - 1.9 : restX1, z1 );
		const half = room( st0, 'bath', pLeft ? restX1 - 1.9 : restX0, fz, pLeft ? restX1 : restX0 + 1.9, z1 );
		const stair0 = room( st0, 'stair', sx0, z1 - sl, sx1, z1 );
		link( st0, living, kitchen, 'open' ); link( st0, living, half ); link( st0, living, stair0, 'open' );
		extDoor( st0, living, 0, { at: 0.5, kind: 'front' } );
		extDoor( st0, kitchen, 2, { kind: 'back' } );
		const st1 = P.storeys[ 1 ];
		if ( pd ) room( st1, 'porch', pLeft ? x0 : x1 - pw, rect.z0, pLeft ? x0 + pw : x1, zc0, { roofOnly: 1 } );
		const hallD = 1.05;
		const fd = fz - zc0 - hallD;
		const bm = x0 + W * ( 0.45 + R() * 0.1 );
		const bed1 = room( st1, 'bedroom', x0, zc0, bm, zc0 + fd );
		const bed2 = room( st1, 'bedroom', bm, zc0, x1, zc0 + fd );
		const hall = room( st1, 'hall', x0, zc0 + fd, x1, fz );
		const bath = room( st1, 'bath', pLeft ? restX0 : restX1 - 2.4, fz, pLeft ? restX0 + 2.4 : restX1, z1 );
		const bed3 = restX1 - restX0 - 2.4 >= 2.5 ? room( st1, 'bedroom', pLeft ? restX0 + 2.4 : restX0, fz, pLeft ? restX1 : restX1 - 2.4, z1 ) : null;
		const stair1 = room( st1, 'stair', sx0, z1 - sl, sx1, z1 );
		link( st1, hall, bed1 ); link( st1, hall, bed2 ); link( st1, hall, bath ); link( st1, hall, bed3 ); link( st1, hall, stair1, 'open' );
	},

	walkup( P ) {
		const { rect, R } = P;
		const W = rect.x1 - rect.x0, D = rect.z1 - rect.z0;
		const alongX = W >= D;
		const gd = 1.8;
		const sd = stairDims( P );
		// gallery side: the street side when the block runs along the street, else a side yard
		const gSide = alongX ? 0 : ( R() < 0.5 ? 1 : 3 );
		P.feats.gallery = gSide;
		for ( const st of P.storeys ) {
			if ( alongX ) {
				const g = room( st, 'gallery', rect.x0, rect.z0, rect.x1, rect.z0 + gd );
				const sx0 = rect.x1 - sd.sw;
				const sr = room( st, 'stair', sx0, rect.z0 + gd, rect.x1, rect.z0 + gd + sd.sl, { open: true, ostair: 1 } );
				if ( st.i === 0 ) setStair( P, sx0, rect.z0 + gd, rect.x1, rect.z0 + gd + sd.sl, 0 );
				link( st, g, sr, 'open' );
				if ( rect.z1 - ( rect.z0 + gd + sd.sl ) > 1.5 ) { const u = room( st, 'storage', sx0, rect.z0 + gd + sd.sl, rect.x1, rect.z1 ); link( st, g, u, 'none' ); }
				units( st, g, rect.x0, sx0, rect.z0 + gd, rect.z1, 'x' );
				if ( st.i === 0 ) P.feats.galleryRect = { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z0 + gd };
			} else {
				const left = gSide === 3;
				const gx0 = left ? rect.x0 : rect.x1 - gd, gx1 = left ? rect.x0 + gd : rect.x1;
				const g = room( st, 'gallery', gx0, rect.z0, gx1, rect.z1 );
				// open stair at the front end of the gallery, running inward across the block
				const bx0 = left ? gx1 : rect.x0, bx1 = left ? rect.x1 : gx0;
				const sl = Math.min( sd.sl, bx1 - bx0 - 1 );
				const sr = left ? room( st, 'stair', gx1, rect.z0, gx1 + sl, rect.z0 + sd.sw, { open: true, ostair: 1 } ) : room( st, 'stair', gx0 - sl, rect.z0, gx0, rect.z0 + sd.sw, { open: true, ostair: 1 } );
				if ( st.i === 0 ) setStair( P, sr.x0, sr.z0, sr.x1, sr.z1, left ? 3 : 1 );
				link( st, g, sr, 'open' );
				const rest = left ? room( st, 'storage', gx1 + sl, rect.z0, rect.x1, rect.z0 + sd.sw ) : room( st, 'storage', rect.x0, rect.z0, gx0 - sl, rect.z0 + sd.sw );
				link( st, g, rest, 'none' );
				units( st, g, rect.z0 + sd.sw, rect.z1, bx0, bx1, 'z', left );
			}
		}
		// apartments strung along the gallery: living + kitchen on the gallery, bedroom + bath behind
		function units( st, g, a0, a1, b0, b1, axis, left ) {
			const len = a1 - a0;
			const n = Math.max( 1, Math.round( len / 7.2 ) );
			for ( let i = 0; i < n; i ++ ) {
				const u0 = a0 + len * i / n, u1 = a0 + len * ( i + 1 ) / n;
				const uw = u1 - u0;
				const unit = st.i * 16 + i;
				const fr = ( b1 - b0 ) * 0.52;
				const lw = uw * 0.6;
				let living, kitchen, bed, bath;
				if ( axis === 'x' ) {
					living = room( st, 'living', u0, b0, u0 + lw, b0 + fr, { unit } );
					kitchen = room( st, 'kitchen', u0 + lw, b0, u1, b0 + fr, { unit } );
					bed = room( st, 'bedroom', u0, b0 + fr, u0 + lw, b1, { unit } );
					bath = room( st, 'bath', u0 + lw, b0 + fr, u1, b1, { unit } );
				} else {
					// b runs across x; the gallery is at b0 when left, at b1 otherwise
					const gb = left ? b0 : b1, dir = left ? 1 : - 1;
					const mid = gb + dir * fr;
					const r4 = ( k, za, zb, xa, xb ) => room( st, k, Math.min( xa, xb ), za, Math.max( xa, xb ), zb, { unit } );
					living = r4( 'living', u0, u0 + lw, gb, mid );
					kitchen = r4( 'kitchen', u0 + lw, u1, gb, mid );
					bed = r4( 'bedroom', u0, u0 + lw, mid, left ? b1 : b0 );
					bath = r4( 'bath', u0 + lw, u1, mid, left ? b1 : b0 );
				}
				link( st, g, living, 'door', { unitDoor: 1 } );
				link( st, living, kitchen, 'open' ); link( st, living, bed ); link( st, bed, bath );
			}
		}
	},

	tower( P ) {
		const { S, R } = P;
		const sub = S.variant;
		const office = sub === 'office';
		const W = P.rect.x1 - P.rect.x0, D = P.rect.z1 - P.rect.z0;
		const long = Math.max( W, D );
		const stairs = long > 42 ? [ Math.min( W, D ) === W ? P.rect.z0 + 7 : P.rect.x0 + 7, ( D >= W ? P.rect.z1 : P.rect.x1 ) - 7 ] : null;
		const alongZ = D >= W;
		const A0 = alongZ ? P.rect.z0 : P.rect.x0, A1 = alongZ ? P.rect.z1 : P.rect.x1;
		const loggia = ! office && R() < 0.85;
		const res = corridorFloors( P, {
			cw: office ? 2.4 : 2.0, module: office ? 7.5 : sub === 'hotel' ? 4.3 : 7.4, elevator: true, roof: true,
			stairs: stairs || [ ( A0 + A1 ) / 2 ], stairDoor: true,
			kinds: ( st, side, i, n ) => {
				if ( st.i === 0 ) {
					// street level: the listed shop fronts the street, the rest is back of house
					if ( S.shop && side === ( alongZ ? - 1 : - 1 ) ) return 'sales';
					return office ? pick( R, [ 'office', 'openoffice', 'storage', 'meeting' ] ) : pick( R, sub === 'hotel' ? [ 'dining', 'bar', 'sales', 'office', 'storage', 'restroom' ] : [ 'office', 'storage', 'sales', 'laundry' ] );
				}
				if ( office ) return ( i + st.i ) % 5 === 2 ? 'restroom' : ( i + side ) % 3 === 0 ? 'office' : ( i % 4 === 3 ? 'meeting' : 'openoffice' );
				return sub === 'hotel' ? 'hotelroom' : 'apt';
			},
			unit: ( st, mk, corr, k, side, a0, a1, bb0, bb1, az ) => {
				if ( k === 'laundry' ) k = 'utility';
				const inner = side < 0 ? bb1 : bb0; // corridor side
				const outer = side < 0 ? bb0 : bb1;
				const dir = side < 0 ? - 1 : 1;
				let ld = loggia && st.i > 0 && ( k === 'hotelroom' || k === 'apt' ) ? 1.6 : 0;
				const depth = Math.abs( outer - inner );
				if ( depth - ld < ( k === 'apt' ? 6.2 : 5.0 ) ) ld = 0;
				if ( depth < ( k === 'apt' ? 6.2 : 5.0 ) ) k = k === 'apt' ? 'living' : 'bedroom';
				const lg = ld ? mk( st, 'loggia', a0, Math.min( outer, outer - dir * ld ), a1, Math.max( outer, outer - dir * ld ) ) : null;
				const o2 = outer - dir * ld;
				const B = ( p, q ) => [ Math.min( p, q ), Math.max( p, q ) ];
				if ( k === 'hotelroom' ) {
					const bathD = 2.3;
					const [ hb0, hb1 ] = B( inner, inner + dir * bathD );
					const bw = Math.min( 2.2, ( a1 - a0 ) * 0.55 );
					const hb = mk( st, 'hbath', a0, hb0, a0 + bw, hb1 );
					const ent = mk( st, 'entry', a0 + bw, hb0, a1, hb1 );
					const [ r0, r1 ] = B( inner + dir * bathD, o2 );
					const hr = mk( st, 'hotelroom', a0, r0, a1, r1 );
					link( st, corr, ent, 'door', { unitDoor: 1 } ); link( st, ent, hr, 'open' ); link( st, ent, hb ); if ( lg ) link( st, hr, lg, 'slider' );
				} else if ( k === 'apt' ) {
					const w = a1 - a0;
					const eD = 2.4;
					const [ e0, e1 ] = B( inner, inner + dir * eD );
					const bath = mk( st, 'bath', a0, e0, a0 + 2.3, e1 );
					const kit = mk( st, 'kitchen', a0 + 2.3, e0, a1, e1 );
					const [ r0, r1 ] = B( inner + dir * eD, o2 );
					const liv = mk( st, 'living', a0 + w * 0.42, r0, a1, r1 );
					const bed = mk( st, 'bedroom', a0, r0, a0 + w * 0.42, r1 );
					link( st, corr, kit, 'door', { unitDoor: 1 } ); link( st, kit, liv, 'open' ); link( st, liv, bed ); link( st, bath, kit );
					if ( lg ) link( st, liv, lg, 'slider' );
				} else {
					const [ r0, r1 ] = B( bb0, bb1 );
					const rm = mk( st, k, a0, r0, a1, r1 );
					link( st, corr, rm, k === 'openoffice' ? ( R() < 0.5 ? 'double' : 'door' ) : 'door' );
				}
			},
		} );
		// the lobby: the ground storey's front end opens into a hall with the entrance
		const st0 = P.storeys[ 0 ];
		if ( res.alongZ ) {
			// replace the first module on each side with the lobby, open to the corridor
			const lob = st0.rooms.filter( rm => rm.k !== 'corridor' && rm.z0 < P.rect.z0 + 0.1 && rm.k !== 'stair' && rm.k !== 'elevator' );
			for ( const rm of lob ) rm.k = 'lobby';
			const corr = st0.rooms.find( rm => rm.k === 'corridor' );
			for ( const rm of lob ) { st0.links = st0.links.filter( l => ! ( l.a === rm || l.b === rm ) ); link( st0, corr, rm, 'open' ); }
			corr.k = 'lobby';
			extDoor( st0, corr, 0, { kind: 'glass2', w: 1.8, h: 2.4 } );
		} else {
			const corr = st0.rooms.find( rm => rm.k === 'corridor' );
			const front = st0.rooms.filter( rm => rm.z0 < P.rect.z0 + 0.1 && rm.k !== 'corridor' );
			// the middle front module becomes the lobby
			front.sort( ( p, q ) => Math.abs( ( p.x0 + p.x1 ) / 2 ) - Math.abs( ( q.x0 + q.x1 ) / 2 ) );
			const lob = front[ 0 ];
			if ( lob ) {
				lob.k = 'lobby';
				st0.links = st0.links.filter( l => ! ( l.a === lob || l.b === lob ) );
				link( st0, corr, lob, 'open' );
				extDoor( st0, lob, 0, { kind: 'glass2', w: 1.8, h: 2.4 } );
			}
		}
		// fire exit at the far end
		const corr0 = st0.rooms.find( rm => rm.k === 'corridor' || rm.k === 'lobby' );
		if ( corr0 && res.alongZ ) extDoor( st0, corr0, 2, { kind: 'metal' } );
		// street-level shops get their own doors
		for ( const rm of st0.rooms ) {
			if ( rm.k !== 'sales' ) continue;
			rm.shop = S.shop || pick( R, [ 'convenience', 'clothing', 'pharmacy', 'surf', 'sports' ] );
			const side = rm.z0 <= P.rect.z0 + 0.05 ? 0 : rm.x0 <= P.rect.x0 + 0.05 ? 3 : rm.x1 >= P.rect.x1 - 0.05 ? 1 : rm.z1 >= P.rect.z1 - 0.05 ? 2 : - 1;
			if ( side >= 0 ) extDoor( st0, rm, side, { kind: 'glass2', w: 1.6 } );
		}
	},

	office( P ) {
		const { R } = P;
		corridorFloors( P, {
			cw: 2.0, module: 5, roof: true, elevator: false, stairDoor: true,
			kinds: ( st, side, i, n ) => ( i + st.i ) % 4 === 1 ? 'restroom' : pick( R, [ 'office', 'office', 'openoffice', 'meeting', 'storage', 'breakroom' ] ),
		} );
		const st0 = P.storeys[ 0 ];
		const corr = st0.rooms.find( rm => rm.k === 'corridor' );
		const front = st0.rooms.filter( rm => rm.z0 < P.rect.z0 + 0.1 && rm !== corr && rm.k !== 'stair' );
		if ( corr.z0 < P.rect.z0 + 0.1 ) { corr.k = 'lobby'; extDoor( st0, corr, 0, { kind: 'glass2', w: 1.8 } ); } else if ( front.length ) {
			const lob = front[ Math.floor( front.length / 2 ) ];
			lob.k = 'lobby';
			extDoor( st0, lob, 0, { kind: 'glass2', w: 1.8 } );
		}
		extDoor( st0, corr, 2, { kind: 'metal' } );
	},

	shop( P ) { shopUnits( P, 'shop' ); },
	food( P ) { shopUnits( P, 'food' ); },
	bigbox( P ) { shopUnits( P, 'bigbox' ); },
	gas( P ) { shopUnits( P, 'gas' ); },

	police( P ) {
		const { rect } = P;
		const W = rect.x1 - rect.x0, D = rect.z1 - rect.z0;
		const sd = stairDims( P );
		const fz = 6.5, cz0 = rect.z0 + fz, cz1 = cz0 + 2.0;
		setStair( P, rect.x1 - sd.sw, cz1, rect.x1, cz1 + sd.sl, 0, true );
		const [ st0, st1 ] = P.storeys;
		for ( const st of P.storeys ) {
			const corr = room( st, 'corridor', rect.x0, cz0, rect.x1, cz1 );
			const sr = room( st, 'stair', rect.x1 - sd.sw, cz1, rect.x1, cz1 + sd.sl );
			link( st, corr, sr, 'door' );
			if ( rect.z1 - ( cz1 + sd.sl ) > 1.5 ) room( st, 'storage', rect.x1 - sd.sw, cz1 + sd.sl, rect.x1, rect.z1 );
			const bx1 = rect.x1 - sd.sw;
			if ( st === st0 ) {
				const lobby = room( st, 'lobby', rect.x0, rect.z0, rect.x0 + W * 0.5, cz0 );
				const rec = room( st, 'office', rect.x0 + W * 0.5, rect.z0, rect.x1, cz0, { name: 'Records' } );
				link( st, lobby, corr, 'door', { lock: 0.5 } ); link( st, corr, rec );
				extDoor( st, lobby, 0, { kind: 'glass2', w: 1.7 } );
				const [ a, b, c ] = spans( rect.x0, bx1, [ 0, 4.2, 0 ] );
				const cells = room( st, 'cells', a[ 0 ], cz1, a[ 1 ], rect.z1 );
				const arm = room( st, 'armory', b[ 0 ], cz1, b[ 1 ], rect.z1 );
				const lock = room( st, 'lockers', c[ 0 ], cz1, c[ 1 ], rect.z1 );
				link( st, corr, cells, 'door', { lock: 0.4, kind2: 'metal' } ); link( st, corr, arm, 'door', { lock: 1, kind2: 'metal' } ); link( st, corr, lock );
				extDoor( st, corr, 3, { kind: 'metal' } );
			} else {
				const [ a, b, c ] = spans( rect.x0, rect.x1, [ 0, 0, 0 ] );
				const br = room( st, 'briefing', a[ 0 ], rect.z0, a[ 1 ], cz0 ); link( st, corr, br );
				const of1 = room( st, 'office', b[ 0 ], rect.z0, b[ 1 ], cz0 ); link( st, corr, of1 );
				const of2 = room( st, 'office', c[ 0 ], rect.z0, c[ 1 ], cz0 ); link( st, corr, of2 );
				const [ d, e ] = spans( rect.x0, bx1, [ 0, 3.2 ] );
				const of3 = room( st, 'openoffice', d[ 0 ], cz1, d[ 1 ], rect.z1 ); link( st, corr, of3 );
				const rr = room( st, 'restroom', e[ 0 ], cz1, e[ 1 ], rect.z1 ); link( st, corr, rr );
			}
		}
		void st1; void D;
	},

	fire( P ) {
		const { rect } = P;
		const W = rect.x1 - rect.x0, D = rect.z1 - rect.z0;
		const sd = stairDims( P );
		const bz = rect.z0 + D * 0.62;
		setStair( P, rect.x1 - sd.sw, rect.z1 - sd.sl, rect.x1, rect.z1, 0, true );
		const [ st0, st1 ] = P.storeys;
		const bay = room( st0, 'bay', rect.x0, rect.z0, rect.x1, bz );
		const nb = Math.max( 1, Math.min( 3, Math.floor( W / 8 ) ) );
		for ( let i = 0; i < nb; i ++ ) extDoor( st0, bay, 0, { at: ( i + 0.5 ) / nb, kind: 'roll', w: 3.6, h: 4.2 } );
		const [ a, b ] = spans( rect.x0, rect.x1 - sd.sw, [ 0, 0 ] );
		const day = room( st0, 'dayroom', a[ 0 ], bz, a[ 1 ], rect.z1 );
		const gear = room( st0, 'lockers', b[ 0 ], bz, b[ 1 ], rect.z1 );
		const s0 = room( st0, 'stair', rect.x1 - sd.sw, rect.z1 - sd.sl, rect.x1, rect.z1 );
		if ( rect.z1 - sd.sl > bz + 1 ) { const u = room( st0, 'storage', rect.x1 - sd.sw, bz, rect.x1, rect.z1 - sd.sl ); link( st0, bay, u ); }
		link( st0, bay, day ); link( st0, bay, gear ); link( st0, bay, s0, 'door' ); link( st0, day, s0, 'door' );
		extDoor( st0, day, 3, { kind: 'metal' } );
		// upstairs: dorm, kitchen, office over the bays
		const hz0 = rect.z1 - sd.sl - 1.4;
		const hall = room( st1, 'hall', rect.x0, hz0, rect.x1, rect.z1 - sd.sl );
		const [ c, d, e ] = spans( rect.x0, rect.x1, [ 0, 0, 5 ] );
		const dorm = room( st1, 'dorm', c[ 0 ], rect.z0, c[ 1 ], hz0 );
		const kit = room( st1, 'kitchen', d[ 0 ], rect.z0, d[ 1 ], hz0 );
		const off = room( st1, 'office', e[ 0 ], rect.z0, e[ 1 ], hz0 );
		const s1 = room( st1, 'stair', rect.x1 - sd.sw, rect.z1 - sd.sl, rect.x1, rect.z1 );
		const bath = room( st1, 'bath', rect.x0, rect.z1 - sd.sl, rect.x0 + 3, rect.z1 );
		const bunk = room( st1, 'bunk', rect.x0 + 3, rect.z1 - sd.sl, rect.x1 - sd.sw, rect.z1 );
		link( st1, hall, dorm ); link( st1, hall, kit, 'open' ); link( st1, hall, off ); link( st1, hall, s1, 'open' ); link( st1, hall, bath ); link( st1, hall, bunk );
		if ( hz0 < rect.z1 - sd.sl && rect.x1 - sd.sw < rect.x1 ) { /* stair column beside the hall */ }
	},

	hospital( P ) {
		const { R, rect } = P;
		const W = rect.x1 - rect.x0, D = rect.z1 - rect.z0;
		corridorFloors( P, {
			cw: 2.6, module: 6.2, elevator: true, roof: true, axis: D >= W ? 'z' : 'x',
			kinds: ( st, side, i, n ) => st.i === 0 ? ( i === 0 ? 'waiting' : pick( R, [ 'exam', 'exam', 'office', 'storage', 'restroom', 'rx' ] ) ) : ( i % 4 === 3 ? pick( R, [ 'storage', 'restroom', 'office' ] ) : pick( R, [ 'ward', 'ward', 'ward', 'exam' ] ) ),
		} );
		const st0 = P.storeys[ 0 ];
		const corr = st0.rooms.find( rm => rm.k === 'corridor' );
		const front = st0.rooms.filter( rm => rm.z0 < rect.z0 + 0.1 && rm !== corr && rm.k !== 'stair' );
		if ( corr.z0 < rect.z0 + 0.1 ) { corr.k = 'lobby'; extDoor( st0, corr, 0, { kind: 'glass2', w: 2.0 } ); for ( const f of front ) { f.k = 'waiting'; st0.links = st0.links.filter( l => ! ( l.a === f || l.b === f ) ); link( st0, corr, f, 'open' ); } } else if ( front.length ) {
			const lob = front[ Math.floor( front.length / 2 ) ];
			lob.k = 'waiting'; extDoor( st0, lob, 0, { kind: 'glass2', w: 2.0 } );
		}
		extDoor( st0, corr, 2, { kind: 'glass2', w: 2.0, name: 'ER' } );
	},

	clinic( P ) {
		const { rect, R } = P;
		const st = P.storeys[ 0 ];
		const wz = rect.z0 + 5.5, cz = wz + 1.8;
		const wait = room( st, 'waiting', rect.x0, rect.z0, rect.x1, wz );
		const corr = room( st, 'corridor', rect.x0, wz, rect.x1, cz );
		link( st, wait, corr, 'door' );
		extDoor( st, wait, 0, { kind: 'glass2', w: 1.7 } );
		const W = rect.x1 - rect.x0;
		const n = Math.max( 2, Math.floor( W / 3.6 ) );
		for ( let i = 0; i < n; i ++ ) {
			const x0 = rect.x0 + W * i / n, x1 = rect.x0 + W * ( i + 1 ) / n;
			const k = i === n - 1 ? 'restroom' : i === 0 ? 'rx' : i === 1 ? 'office' : pick( R, [ 'exam', 'exam', 'storage' ] );
			const rm = room( st, k, x0, cz, x1, rect.z1 );
			link( st, corr, rm, 'door', { lock: k === 'rx' ? 0.6 : 0 } );
		}
		extDoor( st, corr, 1, { kind: 'metal' } );
	},

	school( P ) {
		const { R } = P;
		corridorFloors( P, {
			cw: 2.8, module: 8, roof: true, axis: 'z',
			kinds: ( st, side, i, n ) => st.i === 0 && i === 0 ? ( side < 0 ? 'office' : 'waiting' ) : i === n - 1 && side > 0 ? 'restroom' : pick( R, [ 'classroom', 'classroom', 'classroom', 'storage' ] ),
		} );
		const st0 = P.storeys[ 0 ];
		const corr = st0.rooms.find( rm => rm.k === 'corridor' );
		extDoor( st0, corr, 0, { kind: 'glass2', w: 1.8 } );
		extDoor( st0, corr, 2, { kind: 'metal' } );
	},

	church( P ) {
		const { rect } = P;
		const st = P.storeys[ 0 ];
		const vz = rect.z1 - 3.5;
		const nave = room( st, 'nave', rect.x0, rect.z0, rect.x1, vz );
		const [ a, b ] = spans( rect.x0, rect.x1, [ 0, 0 ] );
		const v1 = room( st, 'vestry', a[ 0 ], vz, a[ 1 ], rect.z1 );
		const v2 = room( st, 'storage', b[ 0 ], vz, b[ 1 ], rect.z1 );
		link( st, nave, v1 ); link( st, nave, v2 );
		extDoor( st, nave, 0, { kind: 'double', w: 1.8, h: 2.8 } );
		extDoor( st, v1, 3, { kind: 'back' } );
		P.feats.steeple = true;
	},

	warehouse( P ) {
		const { rect, R } = P;
		const st = P.storeys[ 0 ];
		const oz = rect.z0 + 5.5;
		const off = room( st, 'office', rect.x0, rect.z0, rect.x0 + 7, oz );
		const rr = room( st, 'restroom', rect.x0, oz, rect.x0 + 3, oz + 3 );
		const hall = room( st, 'hallbig', rect.x0 + 7, rect.z0, rect.x1, rect.z1 );
		const hall2 = room( st, 'hallbig', rect.x0, oz + 3, rect.x0 + 7, rect.z1 );
		const hall3 = room( st, 'hallbig', rect.x0 + 3, oz, rect.x0 + 7, oz + 3 );
		link( st, hall, off ); link( st, hall3, rr ); link( st, hall, hall2, 'open' ); link( st, hall, hall3, 'open' ); link( st, hall2, hall3, 'open' );
		extDoor( st, off, 0, { kind: 'metal' } );
		const W = rect.x1 - rect.x0 - 7;
		extDoor( st, hall, 0, { kind: 'roll', w: 4.2, h: 4.6, at: 0.55 } );
		if ( W > 20 ) extDoor( st, hall, 0, { kind: 'roll', w: 4.2, h: 4.6, at: 0.85 } );
		extDoor( st, hall, 2, { kind: 'roll', w: 4.2, h: 4.6, at: 0.5 } );
		extDoor( st, hall, 1, { kind: 'metal', at: 0.3 } );
		void R;
	},

	garage( P ) {
		const { rect } = P;
		const st = P.storeys[ 0 ];
		const W = rect.x1 - rect.x0;
		const ow = Math.min( 6, W * 0.3 );
		const bays = room( st, 'workshop', rect.x0, rect.z0, rect.x1 - ow, rect.z1 );
		const off = room( st, 'office', rect.x1 - ow, rect.z0, rect.x1, rect.z0 + 6 );
		const parts = room( st, 'storage', rect.x1 - ow, rect.z0 + 6, rect.x1, rect.z1 - 2.5 );
		const rr = room( st, 'restroom', rect.x1 - ow, rect.z1 - 2.5, rect.x1, rect.z1 );
		link( st, bays, off ); link( st, bays, parts ); link( st, bays, rr );
		const nb = Math.max( 1, Math.min( 3, Math.floor( ( W - ow ) / 5 ) ) );
		for ( let i = 0; i < nb; i ++ ) extDoor( st, bays, 0, { kind: 'roll', w: 3.2, h: 3.6, at: ( i + 0.5 ) / nb } );
		extDoor( st, off, 0, { kind: 'glass', w: 1.0 } );
		extDoor( st, bays, 2, { kind: 'metal' } );
	},

	barracks( P ) {
		const { R } = P;
		corridorFloors( P, {
			cw: 2.2, module: 6, axis: 'x', stairs: [ P.rect.x0 + 2, P.rect.x1 - 2 ].map( ( v, i ) => i ? v - 1.3 + 0 : v + 1.3 ),
			kinds: ( st, side, i, n ) => i === 1 && side > 0 ? 'latrine' : st.i === 0 && i === 2 && side < 0 ? 'office' : pick( R, [ 'bunk', 'bunk', 'bunk', 'lockers' ] ),
		} );
		const st0 = P.storeys[ 0 ];
		const corr = st0.rooms.find( rm => rm.k === 'corridor' );
		extDoor( st0, corr, 3, { kind: 'back' } ); extDoor( st0, corr, 1, { kind: 'back' } );
		const mid = st0.rooms.filter( rm => rm.z0 < P.rect.z0 + 0.1 && rm.k !== 'corridor' ).sort( ( p, q ) => Math.abs( p.x0 + p.x1 ) - Math.abs( q.x0 + q.x1 ) )[ 0 ];
		if ( mid ) { mid.k = 'hall'; st0.links = st0.links.filter( l => ! ( l.a === mid || l.b === mid ) ); link( st0, corr, mid, 'open' ); extDoor( st0, mid, 0, { kind: 'double', w: 1.7 } ); }
	},

	hq( P ) {
		const { R } = P;
		corridorFloors( P, {
			cw: 2.2, module: 5.5, axis: 'x', roof: true,
			kinds: ( st, side, i, n ) => i === n - 1 && side > 0 ? 'restroom' : pick( R, [ 'office', 'office', 'meeting', 'briefing', 'storage', 'openoffice' ] ),
		} );
		const st0 = P.storeys[ 0 ];
		const corr = st0.rooms.find( rm => rm.k === 'corridor' );
		const mid = st0.rooms.filter( rm => rm.z0 < P.rect.z0 + 0.1 && rm.k !== 'corridor' ).sort( ( p, q ) => Math.abs( p.x0 + p.x1 ) - Math.abs( q.x0 + q.x1 ) )[ 0 ];
		if ( mid ) { mid.k = 'lobby'; st0.links = st0.links.filter( l => ! ( l.a === mid || l.b === mid ) ); link( st0, corr, mid, 'open' ); extDoor( st0, mid, 0, { kind: 'glass2', w: 1.8 } ); }
		extDoor( st0, corr, 3, { kind: 'metal' } );
	},

	armory( P ) {
		const { rect } = P;
		const st = P.storeys[ 0 ];
		const fz = rect.z0 + 5;
		const [ a, b ] = spans( rect.x0, rect.x1, [ 0, 0 ] );
		const lob = room( st, 'lobby', a[ 0 ], rect.z0, a[ 1 ], fz );
		const off = room( st, 'office', b[ 0 ], rect.z0, b[ 1 ], fz );
		const arm = room( st, 'armory', rect.x0, fz, rect.x1 - 6, rect.z1 );
		const sto = room( st, 'storage', rect.x1 - 6, fz, rect.x1, rect.z1 );
		link( st, lob, off ); link( st, lob, arm, 'door', { lock: 1, kind2: 'vault' } ); link( st, lob, sto, 'door', { lock: 0.5, kind2: 'metal' } );
		extDoor( st, lob, 0, { kind: 'metal', w: 1.2 } );
		extDoor( st, sto, 1, { kind: 'roll', w: 3.2, h: 3.4 } );
	},

	hangar( P ) {
		const { rect } = P;
		const st = P.storeys[ 0 ];
		const bz = rect.z1 - 6;
		const hall = room( st, 'hallbig', rect.x0, rect.z0, rect.x1, bz );
		const [ a, b, c ] = spans( rect.x0, rect.x1, [ 8, 0, 8 ] );
		const off = room( st, 'office', a[ 0 ], bz, a[ 1 ], rect.z1 );
		const ws = room( st, 'workshop', b[ 0 ], bz, b[ 1 ], rect.z1 );
		const sto = room( st, 'storage', c[ 0 ], bz, c[ 1 ], rect.z1 );
		link( st, hall, off ); link( st, hall, ws, 'double' ); link( st, hall, sto );
		extDoor( st, hall, 0, { kind: 'hangar', w: ( rect.x1 - rect.x0 ) * 0.8, h: 9.5 } );
		extDoor( st, off, 2, { kind: 'metal' } );
	},

	// a small island airport: the check-in hall on the landside (front), the gate lounge, a café, a shop and
	// the baggage claim on the airside (back)
	terminal( P ) {
		const { rect } = P;
		const st = P.storeys[ 0 ];
		const W = rect.x1 - rect.x0, D = rect.z1 - rect.z0;
		const fz = rect.z0 + Math.min( 12, D * 0.45 );
		const ow = Math.min( 4.5, W * 0.1 );
		const off = room( st, 'office', rect.x0, rect.z0, rect.x0 + ow, fz );
		const rr1 = room( st, 'restroom', rect.x1 - ow, rect.z0, rect.x1, ( rect.z0 + fz ) / 2 );
		const rr2 = room( st, 'restroom', rect.x1 - ow, ( rect.z0 + fz ) / 2, rect.x1, fz );
		const hall = room( st, 'checkin', rect.x0 + ow, rect.z0, rect.x1 - ow, fz );
		const [ a, b, c, d ] = spans( rect.x0, rect.x1, [ 0, 10, 7, 9 ] );
		const gate = room( st, 'gate', a[ 0 ], fz, a[ 1 ], rect.z1 );
		const cafe = room( st, 'dining', b[ 0 ], fz, b[ 1 ], rect.z1 );
		const shop = room( st, 'sales', c[ 0 ], fz, c[ 1 ], rect.z1, { shop: 'convenience' } );
		const claim = room( st, 'claim', d[ 0 ], fz, d[ 1 ], rect.z1 );
		link( st, hall, gate, 'open' ); link( st, hall, cafe, 'open' ); link( st, gate, cafe, 'open' );
		link( st, hall, shop, 'door' ); link( st, hall, claim, 'open' );
		link( st, hall, off, 'door', { lock: 0.5 } ); link( st, hall, rr1 ); link( st, hall, rr2 );
		extDoor( st, hall, 0, { kind: 'glass2', w: 2.0, h: 2.4, at: 0.3 } );
		extDoor( st, hall, 0, { kind: 'glass2', w: 2.0, h: 2.4, at: 0.7 } );
		extDoor( st, gate, 2, { kind: 'glass2', w: 1.8, h: 2.4, at: 0.3 } );
		extDoor( st, gate, 2, { kind: 'glass2', w: 1.8, h: 2.4, at: 0.75 } );
		extDoor( st, claim, 2, { kind: 'roll', w: 3.0, h: 3.0, at: 0.5 } );
		extDoor( st, off, 3, { kind: 'metal' } );
	},

	// the control tower: a stair up the shaft, an equipment or office room per storey, the cab on top
	ctower( P ) {
		const { rect, S } = P;
		const sd = stairDims( P );
		const sl = Math.min( sd.sl, rect.z1 - rect.z0 - 2.2 );
		const sx1 = rect.x0 + sd.sw, sz0 = rect.z1 - sl;
		setStair( P, rect.x0, sz0, sx1, rect.z1, 0, false );
		for ( const st of P.storeys ) {
			const top = st.i === S.n - 1;
			const sr = room( st, 'stair', rect.x0, sz0, sx1, rect.z1 );
			const front = room( st, top ? 'cab' : st.i === 0 ? 'lobby' : 'hall', rect.x0, rect.z0, rect.x1, sz0 );
			const side = room( st, top ? 'cab' : st.i === 0 ? 'office' : st.i % 2 ? 'utility' : 'office', sx1, sz0, rect.x1, rect.z1 );
			link( st, front, sr, 'open' );
			link( st, front, side, top ? 'open' : 'door', { lock: st.i === 0 ? 0.4 : 0 } );
			if ( st.i === 0 ) extDoor( st, front, 0, { kind: 'metal', at: 0.6 } );
		}
	},

	tent( P ) {
		const { rect } = P;
		const st = P.storeys[ 0 ];
		const t = room( st, 'tent', rect.x0, rect.z0, rect.x1, rect.z1 );
		extDoor( st, t, 3, { kind: 'flap', w: 1.4, h: 1.9 } );
		extDoor( st, t, 1, { kind: 'flap', w: 1.4, h: 1.9 } );
	},

	dome( P ) {
		const { rect } = P;
		const st = P.storeys[ 0 ];
		const t = room( st, 'observatory', rect.x0, rect.z0, rect.x1, rect.z1 );
		extDoor( st, t, 0, { kind: 'metal' } );
		P.feats.round = true;
	},

	generic( P ) {
		const { rect } = P;
		for ( const st of P.storeys ) {
			const t = room( st, st.i === 0 ? 'hallbig' : 'storage', rect.x0, rect.z0, rect.x1, rect.z1 );
			if ( st.i === 0 ) extDoor( st, t, 0, { kind: 'metal' } );
		}
	},
};

// strip malls, restaurants, big boxes and the gas station kiosk: storefront units side by side
const UNIT_POOL = [ 'laundromat', 'nails', 'barber', 'takeout', 'vacant', 'clothing', 'convenience', 'insurance', 'pawn', 'surf', 'phone', 'bakery' ];
function shopUnits( P, arch ) {
	const { rect, S, R, r } = P;
	const st = P.storeys[ 0 ];
	const n = S.units || 1;
	const W = rect.x1 - rect.x0, D = rect.z1 - rect.z0;
	P.units = [];
	for ( let u = 0; u < n; u ++ ) {
		const x0 = rect.x0 + W * u / n, x1 = rect.x0 + W * ( u + 1 ) / n;
		const uw = x1 - x0;
		// the first unit is the listed business; the rest of a strip mall fills up with the usual suspects
		let shop = u === 0 ? r.type : UNIT_POOL[ hash32( r.i, u ) % UNIT_POOL.length ];
		if ( arch === 'food' && u > 0 ) shop = pick( R, [ 'restaurant', 'fastfood', 'bar', 'takeout' ] );
		P.units.push( { x0, x1, shop } );
		const food = arch === 'food' || shop === 'takeout' || shop === 'bakery';
		const fzr = arch === 'bigbox' ? 0.8 : food ? 0.58 : arch === 'gas' ? 0.62 : 0.68;
		const fz = rect.z0 + D * fzr;
		const frontK = food ? ( shop === 'bar' ? 'bar' : 'dining' ) : shop === 'bank' ? 'teller' : shop === 'post' ? 'teller' : 'sales';
		const front = room( st, frontK, x0, rect.z0, x1, fz, { unit: u, shop } );
		extDoor( st, front, 0, { kind: arch === 'bigbox' ? 'glass2' : food && R() < 0.5 ? 'glassd' : 'glass2', w: arch === 'bigbox' ? 2.4 : uw > 7 ? 1.8 : 1.0, at: arch === 'gas' ? 0.3 : 0.5 } );
		let back = [];
		if ( food ) back = [ [ 'rkitchen', 0 ], [ 'restroom', 2.2 ] ];
		else if ( shop === 'bank' ) back = [ [ 'vault', 3.4 ], [ 'office', 0 ], [ 'restroom', 2.0 ] ];
		else if ( shop === 'post' ) back = [ [ 'sorting', 0 ], [ 'restroom', 2.0 ] ];
		else if ( shop === 'pharmacy' ) back = [ [ 'rx', 0 ], [ 'storage', 0 ], [ 'restroom', 2.0 ] ];
		else if ( shop === 'gunstore' || shop === 'pawn' ) back = [ [ 'storage', 0 ], [ 'office', 3 ] ];
		else if ( arch === 'bigbox' ) back = [ [ 'storage', 0 ], [ 'office', 4 ], [ 'restroom', 2.4 ] ];
		else if ( arch === 'gas' ) back = [ [ 'storage', 0 ], [ 'restroom', 2.2 ] ];
		else back = uw > 6 ? [ [ 'storage', 0 ], [ 'restroom', 2.0 ] ] : [ [ 'storage', 0 ] ];
		const sp = spans( x0, x1, back.map( b => b[ 1 ] ) );
		back.forEach( ( b, i ) => {
			const rm = room( st, b[ 0 ], sp[ i ][ 0 ], fz, sp[ i ][ 1 ], rect.z1, { unit: u, shop } );
			if ( ! rm ) return;
			const lock = b[ 0 ] === 'vault' ? 1 : b[ 0 ] === 'rx' ? 0.6 : shop === 'gunstore' && b[ 0 ] === 'storage' ? 0.8 : b[ 0 ] === 'office' ? 0.3 : 0;
			link( st, front, rm, 'door', { lock, kind2: b[ 0 ] === 'vault' ? 'vault' : b[ 0 ] === 'rkitchen' ? 'swing' : null } );
			if ( i === 0 ) extDoor( st, rm, 2, { kind: 'metal', at: 0.5 } );
		} );
	}
	if ( arch === 'gas' ) P.feats.canopy = true;
}

// ---- derivation: walls, facades, doors, rails -------------------------------------------------------------

const snap = v => Math.round( v * 100 ) / 100;

function derive( P, st ) {
	const rect = P.rect;
	const rooms = st.rooms;
	for ( const rm of rooms ) { rm.x0 = snap( rm.x0 ); rm.x1 = snap( rm.x1 ); rm.z0 = snap( rm.z0 ); rm.z1 = snap( rm.z1 ); }
	// shared edges between rooms
	const edges = []; // { x0,z0,x1,z1 (on the line), A (low side), B (high side), axis: 'x'|'z' }
	const touch = ( p, q ) => {
		// p's high side against q's low side: a vertical line (constant x), then a horizontal one
		if ( Math.abs( p.x1 - q.x0 ) < EPS ) {
			const z0 = Math.max( p.z0, q.z0 ), z1 = Math.min( p.z1, q.z1 );
			if ( z1 - z0 > 0.05 ) edges.push( { axis: 'z', x0: p.x1, z0, x1: p.x1, z1, A: p, B: q } );
		}
		if ( Math.abs( p.z1 - q.z0 ) < EPS ) {
			const x0 = Math.max( p.x0, q.x0 ), x1 = Math.min( p.x1, q.x1 );
			if ( x1 - x0 > 0.05 ) edges.push( { axis: 'x', x0, z0: p.z1, x1, z1: p.z1, A: p, B: q } );
		}
	};
	for ( let i = 0; i < rooms.length; i ++ ) for ( let j = i + 1; j < rooms.length; j ++ ) {
		const A = rooms[ i ], B = rooms[ j ];
		// rooms that don't even touch (the common case in big plans) are skipped cheaply
		if ( A.x1 < B.x0 - EPS || B.x1 < A.x0 - EPS || A.z1 < B.z0 - EPS || B.z1 < A.z0 - EPS ) continue;
		touch( A, B ); touch( B, A );
	}
	// each room's edges (the lookups below would otherwise scan every edge of the storey)
	const byRoom = new Map();
	const addTo = ( m, k, v ) => { const a = m.get( k ); if ( a ) a.push( v ); else m.set( k, [ v ] ); };
	for ( const e of edges ) { addTo( byRoom, e.A, e ); addTo( byRoom, e.B, e ); }
	// connectivity: explicit links first, then every unreached room joins its best reachable neighbour
	const adj = new Map();
	for ( const e of edges ) {
		const len = e.axis === 'z' ? e.z1 - e.z0 : e.x1 - e.x0;
		addTo( adj, e.A, { r: e.B, e, len } ); addTo( adj, e.B, { r: e.A, e, len } );
	}
	const linked = new Set();
	const reach = new Set();
	for ( const x of st.ext ) reach.add( x.room );
	for ( const rm of rooms ) if ( rm.open || rm.k === 'stair' ) reach.add( rm );
	const keyOf = ( a, b ) => a.id < b.id ? a.id * 65536 + b.id : b.id * 65536 + a.id;
	const linkMap = new Map();
	for ( const l of st.links ) linkMap.set( keyOf( l.a, l.b ), l );
	let changed = true;
	while ( changed ) {
		changed = false;
		for ( const l of st.links ) {
			if ( l.kind === 'none' ) continue;
			if ( reach.has( l.a ) !== reach.has( l.b ) ) { reach.add( l.a ); reach.add( l.b ); changed = true; }
		}
	}
	for ( let guard = 0; guard < rooms.length * 2; guard ++ ) {
		let best = null;
		for ( const rm of rooms ) {
			if ( reach.has( rm ) ) continue;
			for ( const n of adj.get( rm ) || [] ) {
				if ( ! reach.has( n.r ) || n.len < 1.1 ) continue;
				if ( linkMap.get( keyOf( rm, n.r ) )?.kind === 'none' ) continue;
				const score = ( KINDS[ n.r.k ]?.hub || 0 ) * 10 + n.len - ( n.r.k === 'kitchen' && rm.k === 'bath' ? 20 : 0 ) - ( n.r.unit !== rm.unit ? 50 : 0 );
				if ( ! best || score > best.score ) best = { rm, n, score };
			}
		}
		if ( ! best ) break;
		const l = { a: best.n.r, b: best.rm, kind: 'door' };
		st.links.push( l ); linkMap.set( keyOf( l.a, l.b ), l );
		reach.add( best.rm );
	}
	void linked;

	// walls and facades
	st.walls = []; st.facades = []; st.rails = []; st.doors = [];
	const doorOf = ( l ) => l.kind === 'door' || l.kind === 'double' || l.kind === 'slider' || l.kind === 'elevator';
	const openings = new Map(); // edge -> [ openings ]
	// place link openings on their longest shared edge
	for ( const l of st.links ) {
		if ( l.kind === 'none' || l.kind === 'open' ) continue;
		const cand = ( byRoom.get( l.a ) || [] ).filter( e => ( e.A === l.a && e.B === l.b ) || ( e.A === l.b && e.B === l.a ) );
		if ( ! cand.length ) continue;
		cand.sort( ( p, q ) => ( q.x1 - q.x0 + q.z1 - q.z0 ) - ( p.x1 - p.x0 + p.z1 - p.z0 ) );
		const e = cand[ 0 ];
		const len = e.axis === 'z' ? e.z1 - e.z0 : e.x1 - e.x0;
		const w = l.kind === 'double' ? Math.min( 1.7, len - 0.4 ) : l.kind === 'slider' ? Math.min( 2.4, len - 0.6 ) : l.kind === 'arch' ? Math.min( 1.4, len - 0.3 ) : l.kind === 'elevator' ? 1.1 : Math.min( 0.92, len - 0.3 );
		if ( w < 0.7 ) continue;
		// position: centred on hubs, near a corner otherwise (the way real rooms are entered)
		const hubA = KINDS[ e.A.k ]?.hub || 0, hubB = KINDS[ e.B.k ]?.hub || 0;
		const private_ = hubA >= hubB ? e.B : e.A;
		let c;
		const mid = len / 2;
		if ( l.kind === 'arch' || l.kind === 'slider' || l.kind === 'double' || l.kind === 'elevator' || ( hubA >= 2 && hubB >= 2 ) ) c = mid;
		else {
			const h = hash32( P.bid, st.i * 97 + e.A.id * 7 + e.B.id );
			const nearStart = ( h & 1 ) === 0;
			c = nearStart ? 0.25 + w / 2 + 0.12 : len - 0.25 - w / 2 - 0.12;
			// doors off a corridor sit near the corridor's end of the room (keeps furniture walls free)
			if ( len > 4 && ( KINDS[ e.A.k ]?.hub || KINDS[ e.B.k ]?.hub ) ) c = mid + ( nearStart ? - 1 : 1 ) * Math.min( len / 2 - w / 2 - 0.4, 1.2 );
		}
		c = Math.max( w / 2 + 0.2, Math.min( len - w / 2 - 0.2, c ) );
		const op = { c, w, h: l.kind === 'arch' ? Math.min( 2.3, st.h - 0.5 ) : l.kind === 'slider' ? 2.2 : 2.08, kind: l.kind, link: l, into: private_, lock: l.lock || 0, kind2: l.kind2 || null, unitDoor: l.unitDoor };
		if ( ! openings.has( e ) ) openings.set( e, [] );
		openings.get( e ).push( op );
	}
	for ( const e of edges ) {
		const l = linkMap.get( keyOf( e.A, e.B ) );
		const aOpen = e.A.open, bOpen = e.B.open;
		const ops = openings.get( e ) || [];
		if ( l && l.kind === 'open' ) continue; // open plan: no wall
		if ( aOpen && bOpen ) {
			if ( e.A.k === 'loggia' && e.B.k === 'loggia' ) st.walls.push( { ...lineOf( e ), t: 0.15, A: e.A, B: e.B, ops: [], solid: true } );
			continue;
		}
		if ( aOpen !== bOpen ) {
			// the enclosed room's wall faces the open room like a facade (and keeps the exterior doors asked
			// for on that side: a house's front door opens onto its lānai)
			const inside = aOpen ? e.B : e.A, out = aOpen ? e.A : e.B;
			addFacade( P, st, inside, out, e, ops.concat( extDoorsOn( st, inside, e ) ) );
			continue;
		}
		st.walls.push( { ...lineOf( e ), t: wallT( e ), A: e.A, B: e.B, ops } );
	}
	// outside: every room side minus what neighbouring rooms cover
	for ( const rm of rooms ) {
		for ( let side = 0; side < 4; side ++ ) {
			const axis = side === 0 || side === 2 ? 'x' : 'z';
			const line = side === 0 ? rm.z0 : side === 1 ? rm.x1 : side === 2 ? rm.z1 : rm.x0;
			const lo = axis === 'x' ? rm.x0 : rm.z0, hi = axis === 'x' ? rm.x1 : rm.z1;
			const cover = [];
			for ( const e of byRoom.get( rm ) || [] ) {
				if ( e.axis !== axis ) continue;
				const el = axis === 'x' ? e.z0 : e.x0;
				if ( Math.abs( el - line ) > EPS ) continue;
				cover.push( axis === 'x' ? [ e.x0, e.x1 ] : [ e.z0, e.z1 ] );
			}
			cover.sort( ( p, q ) => p[ 0 ] - q[ 0 ] );
			const free = [];
			let a = lo;
			for ( const [ c0, c1 ] of cover ) { if ( c0 > a + 0.05 ) free.push( [ a, c0 ] ); a = Math.max( a, c1 ); }
			if ( hi > a + 0.05 ) free.push( [ a, hi ] );
			for ( const [ f0, f1 ] of free ) {
				const e = axis === 'x' ? { axis, x0: f0, z0: line, x1: f1, z1: line } : { axis, x0: line, z0: f0, x1: line, z1: f1 };
				if ( rm.open ) { st.rails.push( { ...e, side, room: rm } ); continue; }
				// exterior doors requested on this side that fall into this stretch
				addFacade( P, st, rm, null, e, extOps( st, rm, side, f0, f1 ) );
			}
		}
	}
	// doors (for the interior builder and the runtime)
	for ( const w of st.walls ) for ( const op of w.ops ) if ( op.kind !== 'arch' ) st.doors.push( doorRec( P, st, w, op, false ) );
	for ( const f of st.facades ) for ( const op of f.ops ) if ( op.kind !== 'arch' ) st.doors.push( doorRec( P, st, f, op, true ) );
	st.doors.forEach( ( d, i ) => { d.idx = i; } );
	// the floor opening above the flights below
	if ( P.stair && st.i > 0 ) st.holes.push( stairHole( P.stair ) );
	if ( P.stairs2 && st.i > 0 ) for ( const s of P.stairs2 ) st.holes.push( stairHole( s ) );
}

// the exterior doors asked for on side `side` of room rm that fall into the stretch [f0, f1] of that side
// (positions from f0, the start of the stretch along x or z)
function extOps( st, rm, side, f0, f1 ) {
	const ops = [];
	const len = f1 - f0;
	const lo = side === 0 || side === 2 ? rm.x0 : rm.z0, hi = side === 0 || side === 2 ? rm.x1 : rm.z1;
	for ( const xd of st.ext ) {
		if ( xd.room !== rm || xd.side !== side ) continue;
		const w = Math.min( xd.w, len - 0.4 );
		if ( w < 0.7 ) continue;
		// `at` runs along u (to the right seen from outside); sides 0 and 1 run against x / z
		const uFrac = side === 0 || side === 1 ? 1 - xd.at : xd.at;
		const pos = lo + ( hi - lo ) * uFrac;
		if ( pos < f0 || pos > f1 ) continue;
		const c = Math.max( w / 2 + 0.15, Math.min( len - w / 2 - 0.15, pos - f0 ) );
		ops.push( { c, w, h: Math.min( xd.h, st.h - 0.35 ), kind: xd.kind, ext: true, lock: xd.lock ?? null, name: xd.name } );
	}
	return ops;
}

// exterior doors of an enclosed room on an edge it shares with an open room (porch, gallery)
function extDoorsOn( st, rm, e ) {
	let side;
	if ( e.axis === 'x' ) side = Math.abs( rm.z0 - e.z0 ) < EPS ? 0 : 2;
	else side = Math.abs( rm.x0 - e.x0 ) < EPS ? 3 : 1;
	return e.axis === 'x' ? extOps( st, rm, side, e.x0, e.x1 ) : extOps( st, rm, side, e.z0, e.z1 );
}

function stairHole( s ) {
	// everything except the 1.2 m entry landing strip
	const e = s.e;
	if ( e === 0 ) return { x0: s.x0, z0: s.z0 + 1.2, x1: s.x1, z1: s.z1 };
	if ( e === 2 ) return { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 - 1.2 };
	if ( e === 3 ) return { x0: s.x0 + 1.2, z0: s.z0, x1: s.x1, z1: s.z1 };
	return { x0: s.x0, z0: s.z0, x1: s.x1 - 1.2, z1: s.z1 };
}

function wallT( e ) {
	const k = e.A.k + e.B.k;
	if ( k.includes( 'vault' ) || k.includes( 'armory' ) ) return 0.3;
	if ( k.includes( 'stair' ) || k.includes( 'elevator' ) ) return 0.2;
	return 0.12;
}

function lineOf( e ) { return { x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1, axis: e.axis }; }

// a facade: the wall of `inside` facing outside (out = null) or an open room. Oriented so that the
// outward normal is the right-hand side of the direction of travel; ops are positions from x0/z0.
function addFacade( P, st, inside, out, e, ops ) {
	// which way is out? compare the room centre with the line
	let nx = 0, nz = 0;
	if ( e.axis === 'x' ) nz = ( ( inside.z0 + inside.z1 ) / 2 < e.z0 ) ? 1 : - 1;
	else nx = ( ( inside.x0 + inside.x1 ) / 2 < e.x0 ) ? 1 : - 1;
	// travel direction t with n = t x up => t = (nz, -nx)... check: n = (-tz, tx) => tx = nz, tz = -nx
	const tx = nz, tz = - nx;
	let ax = e.x0, az = e.z0, bx = e.x1, bz = e.z1;
	let flip = false;
	if ( ( bx - ax ) * tx + ( bz - az ) * tz < 0 ) { [ ax, bx ] = [ bx, ax ]; [ az, bz ] = [ bz, az ]; flip = true; }
	const len = Math.hypot( bx - ax, bz - az );
	const side = nz < 0 ? 0 : nx > 0 ? 1 : nz > 0 ? 2 : 3;
	// ops were measured from (x0, z0); flip them into u
	const uops = ops.map( o => ( { ...o, u: flip ? len - o.c : o.c } ) ).sort( ( p, q ) => p.u - q.u );
	const u0 = ax * tx + az * tz; // continuous texture u along the building side
	const f = { ax, az, bx, bz, nx, nz, side, len, u0, inside, out, ops: uops, pieces: [], idx: st.facades.length };
	// pieces: window runs between doors
	let a = 0;
	let pi = 0;
	// low 12 bits vary the windows, the top 4 carry the building's boarded-up share (see data.js winState)
	// (people boarded up the ground floor; high up hardly anyone did)
	const share = P.boarded * ( st.i === 0 ? 1 : st.i === 1 ? 0.45 : 0.06 );
	const boardBits = Math.min( 15, Math.round( share * 20 ) ) << 12;
	const seedOf = () => ( hash32( P.bid, st.i * 1024 + f.idx * 16 + pi ) & 0x0fff ) | boardBits;
	const winRun = ( a0, a1 ) => {
		const L = a1 - a0;
		if ( L < 0.05 ) return;
		const win = windowsFor( P, inside, L, st, side );
		f.pieces.push( { a0, a1, win: win ? { ...win, seed: seedOf(), style: win.style | ( P.frame << 5 ) } : null } );
		pi ++;
	};
	for ( const o of uops ) {
		const d0 = o.u - o.w / 2 - 0.06, d1 = o.u + o.w / 2 + 0.06;
		winRun( a, d0 );
		f.pieces.push( { a0: d0, a1: d1, door: o, win: doorWin( P, o, st, seedOf() ) } );
		pi ++;
		a = d1;
	}
	winRun( a, len );
	st.facades.push( f );
}

// how the shell draws a door opening (shader style 7 roll-up, 8 panel door, 9 glass door)
function doorWin( P, o, st, seed ) {
	const k = o.kind;
	const style = k === 'roll' || k === 'hangar' ? 7 : k === 'glass' || k === 'glass2' || k === 'glassd' || k === 'slider' ? 9 : 8;
	const fr = style === 9 ? 1 : style === 7 ? 2 : P.frame;
	return { bay: o.w + 0.12, w: o.w, h: o.h, sill: 0, style: style | ( fr << 5 ), seed };
}

function doorRec( P, st, w, op, facade ) {
	// centre on the wall line and the axis of the wall
	let x, z, axis, nx = 0, nz = 0;
	if ( facade ) {
		const tx = ( w.bx - w.ax ) / w.len, tz = ( w.bz - w.az ) / w.len;
		x = w.ax + tx * op.u; z = w.az + tz * op.u;
		axis = Math.abs( tx ) > 0.5 ? 'x' : 'z';
		nx = w.nx; nz = w.nz;
		// the door leaf sits in the middle of the exterior wall thickness
		x -= nx * P.T / 2; z -= nz * P.T / 2;
	} else {
		axis = w.axis;
		if ( axis === 'x' ) { x = w.x0 + op.c; z = w.z0; nz = 1; } else { x = w.x0; z = w.z0 + op.c; nx = 1; }
	}
	const k = op.kind2 || ( op.kind === 'door' ? ( op.unitDoor ? 'front' : 'int' ) : op.kind );
	// swing into the private room (interior) or into the building (exterior)
	let swing = 1;
	if ( facade ) swing = - 1; // towards -n: inside
	else if ( op.into ) {
		const cx = ( op.into.x0 + op.into.x1 ) / 2, cz = ( op.into.z0 + op.into.z1 ) / 2;
		swing = ( axis === 'x' ? cz - z : cx - x ) >= 0 ? 1 : - 1;
	}
	const h = hash32( P.bid, st.i * 131 + Math.round( x * 10 ) * 7 + Math.round( z * 10 ) );
	let locked;
	if ( op.lock !== null && op.lock !== undefined ) locked = ( h % 1000 ) / 1000 < op.lock;
	else if ( facade ) locked = ( h % 1000 ) / 1000 < lockChance( P, op );
	else locked = op.unitDoor ? ( h % 1000 ) / 1000 < 0.35 : false;
	if ( k === 'hangar' || k === 'flap' || k === 'elevator' ) locked = k === 'elevator';
	return {
		x, z, axis, nx, nz, w: op.w, h: op.h, kind: k, swing, hinge: ( h >> 3 ) & 1 ? 1 : - 1, locked, ext: facade, name: op.name || null,
	};
}

function lockChance( P, op ) {
	const t = P.r.type;
	if ( op.kind === 'roll' ) return 0.7;
	if ( op.kind === 'metal' ) return 0.55;
	switch ( t ) {
		case 'house': return op.kind === 'back' ? 0.25 : 0.4;
		case 'gunstore': case 'bank': case 'pawn': return 0.8;
		case 'police': case 'armory': case 'mil_hq': return 0.5;
		case 'pharmacy': return 0.5;
		default: return 0.3;
	}
}

// ---- queries used by the builders -------------------------------------------------------------------------

export function storeyTopY( P, i ) { return P.S.ys[ i ] + P.S.Hs[ i ]; }
export function slabT( P ) { return P.S.arch === 'house' ? 0.22 : 0.3; }
export { SIDE_N, SIDE_T, winHash };
