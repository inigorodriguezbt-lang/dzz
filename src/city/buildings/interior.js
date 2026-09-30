// The real interior of one storey, built in the world workers: thick walls with door and window openings
// (frames, sills, glass, boards over some windows, curtains matching what the facade shader showed), floors,
// ceilings, the stairs, the storey's outside parts (porches, galleries, loggias, railings), the roof deck on
// the top storey, and everything the runtime needs: colliders, doors, containers, loot spots, beds, taps and
// candles. All in building-local metres (x across the front, z from the front to the back, y world height).
import { Geo, GlassGeo, F_IN } from './geo.js';
import { L, hash32, rng, winState, winHash, DECAL, decalUV, pumpsOf } from './data.js';
import { M, slabT, extOf } from './plan.js';
import { storeyOutside, frontSteps, stepBoxes, groundAt, bulkhead, hoseTower, terminalCanopyOf, towerCatwalkOf, penthouseOf, portalOf } from './exterior.js';
import { furnishRoom } from './furniture.js';
import { bakeLight } from './light.js';

// physics materials: indices into data.js PMAT (collider records: data.js BOX_STRIDE)
export const PM = { concrete: 0, wood: 1, metal: 2, glass: 3, rock: 4 };

// the shader's window frame colours in sRGB bytes (materials.js FRAME)
export const FRAME_RGB = [ [ 236, 236, 232 ], [ 74, 60, 48 ], [ 176, 178, 180 ], [ 44, 44, 46 ], [ 64, 104, 80 ], [ 124, 90, 60 ], [ 60, 112, 116 ], [ 150, 56, 48 ] ];
const WALLS_RGB = [ [ 230, 224, 212 ], [ 222, 222, 218 ], [ 206, 216, 208 ], [ 232, 218, 194 ], [ 202, 212, 226 ], [ 234, 232, 226 ], [ 224, 204, 190 ], [ 214, 206, 224 ] ];

const T = 0.25; // exterior wall thickness (inward from the facade line)

// floor, wall and ceiling finishes by room kind
const HOME = { living: 1, bedroom: 1, hall: 1, kitchen: 1, bath: 1, dining: 1, hotelroom: 1, hbath: 1, entry: 1 };
function finishes( P, rm, R ) {
	const k = rm.k, home = P.S.arch === 'house' || P.S.arch === 'walkup' || ( P.S.arch === 'tower' && P.S.variant !== 'office' && P.storeys.length && rm.unit !== undefined );
	const wallC = WALLS_RGB[ ( hash32( P.bid, rm.id, 0x3a1 ) >>> 8 ) % WALLS_RGB.length ];
	let floor = M( L.lino, [ 226, 224, 216 ], 1.2, F_IN ), wall = M( L.plaster, wallC, 3, F_IN ), ceil = M( L.plaster, [ 240, 240, 236 ], 3, F_IN ), wain = null;
	switch ( k ) {
		case 'living': case 'bedroom': case 'hall': case 'dining': case 'entry':
			floor = k === 'bedroom' && R() < 0.5 ? M( L.carpet, [ 200, 190, 170 ], 2, F_IN ) : M( L.woodfloor, [ 255, 244, 232 ], 1.6, F_IN, { r: 1 } );
			if ( k === 'dining' && ! home ) { floor = M( L.terrazzo, [ 255, 255, 255 ], 2, F_IN ); ceil = M( L.ceiltile, [ 250, 250, 248 ], 1.2, F_IN ); }
			break;
		case 'hotelroom': floor = M( L.carpet, [ 180, 160, 150 ], 2, F_IN ); break;
		case 'kitchen': floor = M( R() < 0.5 ? L.lino : L.tiles, [ 236, 232, 222 ], 1.2, F_IN ); wain = M( L.tilewall, [ 236, 236, 232 ], 0.6, F_IN ); break;
		case 'bath': case 'hbath': case 'restroom': case 'latrine':
			floor = M( L.tiles, [ 220, 222, 222 ], 1.2, F_IN ); wain = M( L.tilewall, pick3( R, [ [ 236, 236, 232 ], [ 200, 222, 226 ], [ 226, 214, 200 ] ] ), 0.6, F_IN ); break;
		case 'garage': case 'workshop': case 'storage': case 'utility': case 'bay': case 'hallbig': case 'sorting': case 'vault': case 'armory': case 'cells': case 'lockers':
			floor = M( L.concrete, [ 190, 188, 182 ], 3, F_IN );
			wall = M( k === 'hallbig' && ( P.S.arch === 'warehouse' || P.S.arch === 'hangar' ) ? L.tinroof : L.cmu, k === 'cells' || k === 'armory' || k === 'vault' ? [ 214, 214, 206 ] : [ 226, 224, 216 ], 2.4, F_IN );
			ceil = M( L.concrete, [ 200, 198, 192 ], 3, F_IN );
			break;
		case 'sales': case 'lobby': case 'waiting': case 'teller': case 'corridor': case 'rx':
			floor = M( k === 'lobby' || k === 'teller' ? L.terrazzo : L.lino, [ 240, 238, 232 ], 2, F_IN );
			ceil = M( L.ceiltile, [ 250, 250, 248 ], 1.2, F_IN );
			wall = M( L.plaster, P.S.arch === 'tower' && k === 'lobby' ? [ 214, 200, 180 ] : [ 232, 230, 224 ], 3, F_IN );
			if ( home && k === 'corridor' ) floor = M( L.carpet, [ 150, 130, 120 ], 2, F_IN );
			break;
		case 'office': case 'openoffice': case 'meeting': case 'breakroom': case 'briefing':
			floor = M( L.carpet, pick3( R, [ [ 130, 136, 146 ], [ 150, 140, 130 ], [ 120, 130, 120 ] ] ), 2, F_IN );
			ceil = M( L.ceiltile, [ 250, 250, 248 ], 1.2, F_IN );
			wall = M( L.plaster, [ 232, 230, 224 ], 3, F_IN );
			break;
		case 'classroom': case 'ward': case 'exam': case 'dorm': case 'bunk': case 'dayroom':
			floor = M( L.lino, pick3( R, [ [ 232, 230, 220 ], [ 214, 226, 220 ], [ 226, 220, 206 ] ] ), 1.2, F_IN );
			ceil = M( L.ceiltile, [ 250, 250, 248 ], 1.2, F_IN );
			if ( k === 'ward' || k === 'exam' ) wall = M( L.plaster, [ 214, 228, 222 ], 3, F_IN );
			break;
		case 'nave': case 'vestry':
			floor = M( L.woodfloor, [ 236, 214, 190 ], 1.6, F_IN, { r: 1 } ); wall = M( L.plaster, [ 244, 242, 236 ], 3, F_IN ); ceil = M( L.wood, [ 190, 160, 130 ], 1, F_IN ); break;
		case 'rkitchen': floor = M( L.tiles, [ 170, 90, 70 ], 1.2, F_IN ); wain = M( L.tilewall, [ 240, 240, 236 ], 0.6, F_IN ); ceil = M( L.ceiltile, [ 240, 240, 238 ], 1.2, F_IN ); break;
		case 'bar': floor = M( L.woodfloor, [ 180, 140, 110 ], 1.6, F_IN, { r: 1 } ); wall = M( L.plaster, [ 120, 60, 40 ], 3, F_IN ); break;
		case 'elevator': floor = M( L.metal, [ 150, 150, 150 ], 1, F_IN ); wall = M( L.spandrel, [ 170, 170, 168 ], 1.5, F_IN ); break;
		case 'stair': floor = M( L.concrete, [ 200, 198, 192 ], 3, F_IN ); wall = M( L.plaster, [ 226, 226, 220 ], 3, F_IN ); break;
		case 'checkin': case 'gate': case 'claim':
			floor = M( L.terrazzo, [ 236, 234, 228 ], 2.5, F_IN ); ceil = M( L.ceiltile, [ 250, 250, 248 ], 1.2, F_IN );
			wall = M( L.plaster, [ 232, 232, 228 ], 3, F_IN );
			break;
		case 'cab': floor = M( L.carpet, [ 90, 96, 110 ], 2, F_IN ); ceil = M( L.ceiltile, [ 240, 240, 238 ], 1.2, F_IN ); break;
		case 'tent': floor = M( L.fabric, [ 70, 70, 52 ], 1.5, F_IN ); break;
		case 'observatory': floor = M( L.concrete, [ 170, 170, 172 ], 3, F_IN ); wall = M( L.plaster, [ 236, 236, 234 ], 3, F_IN ); break;
	}
	if ( P.S.arch === 'house' && ( k === 'hall' || k === 'stair' ) ) floor = M( L.woodfloor, [ 255, 244, 232 ], 1.6, F_IN, { r: 1 } );
	// big surfaces are cut into a grid for the baked light (light.js)
	for ( const m of [ floor, wall, ceil, wain ] ) if ( m ) m.sub = 0.9;
	return { floor, wall, ceil, wain };
}
const pick3 = ( R, a ) => a[ Math.floor( R() * a.length ) % a.length ];

// ---- output --------------------------------------------------------------------------------------------------

class Out {
	constructor( P, si ) {
		this.P = P; this.si = si; this.st = P.storeys[ si ];
		// g: the storey and its furniture; gd: small things (drawn only up close); dec: decals
		this.g = new Geo( 8192 ); this.gd = new Geo( 4096 ); this.dec = new Geo( 256 ); this.glass = new GlassGeo();
		this.boxes = []; this.doors = []; this.containers = []; this.spots = []; this.beds = []; this.taps = []; this.lights = []; this.statics = [];
		this.barred = new Set(); // windows boarded up from inside (data.js winKey)
		this.R = rng( hash32( P.bid, si, 0x1a7 ) );
		this.g.setTag( 0, 255 ); this.gd.setTag( 0, 255 ); this.dec.setTag( 0, 255 );
	}
	// axis-aligned collider in building-local coords
	col( x0, y0, z0, x1, y1, z1, mat = 0, kind = 0 ) {
		const ax = Math.min( x0, x1 ), bx = Math.max( x0, x1 ), ay = Math.min( y0, y1 ), by = Math.max( y0, y1 ), az = Math.min( z0, z1 ), bz = Math.max( z0, z1 );
		if ( bx - ax < 0.005 || by - ay < 0.005 || bz - az < 0.005 ) return;
		this.boxes.push( ( ax + bx ) / 2, ( ay + by ) / 2, ( az + bz ) / 2, ( bx - ax ) / 2, ( by - ay ) / 2, ( bz - az ) / 2, 0, mat, kind );
	}
	// rotated collider: centre, half extents, yaw
	colR( cx, cy, cz, hx, hy, hz, yaw, mat = 0, kind = 0 ) { this.boxes.push( cx, cy, cz, hx, hy, hz, yaw, mat, kind ); }
	// flat decal quad on the floor (y) or a wall; k = decal cell, s = size, a = rotation
	decalFloor( x, y, z, s, k, a = 0, tint = [ 255, 255, 255 ] ) {
		const uv = decalUV( k );
		const c = Math.cos( a ) * s / 2, sn = Math.sin( a ) * s / 2;
		const p = ( u, v ) => [ x + u * c - v * sn, y, z + u * sn + v * c ];
		this.dec.quadUV( p( - 1, 1 ), p( 1, 1 ), p( 1, - 1 ), p( - 1, - 1 ), [ uv[ 0 ], uv[ 1 ], uv[ 2 ], uv[ 1 ], uv[ 2 ], uv[ 3 ], uv[ 0 ], uv[ 3 ] ], { l: 0, c: tint, s: 1 }, [ 0, 1, 0 ] );
	}
	// a decal on any four corners (counter-clockwise seen from the front, normal n)
	decalQuad( a, b, c, d, k, tint = 1, n = [ 0, 1, 0 ] ) {
		const uv = decalUV( k ), t = typeof tint === 'number' ? [ 255 * tint, 255 * tint, 255 * tint ] : tint;
		this.dec.quadUV( a, b, c, d, [ uv[ 0 ], uv[ 1 ], uv[ 2 ], uv[ 1 ], uv[ 2 ], uv[ 3 ], uv[ 0 ], uv[ 3 ] ], { l: 0, c: t, s: 1 }, n );
	}
	// a floor decal at a piece's local point (kind: a DECAL key; lists pick one)
	decalAt( F, lx, lz, s, kind, ly = 0, a = null ) {
		const k = DECAL[ kind ], cell = Array.isArray( k ) ? k[ ( this.R() * k.length ) | 0 ] : k;
		const [ x, z ] = F.T( lx, lz );
		this.decalFloor( x, F.y + ly + 0.006, z, s, cell, a ?? this.R() * 6.3 );
	}
	decalWall( x, y, z, nx, nz, w, h, k, tint = [ 255, 255, 255 ] ) {
		const uv = decalUV( k );
		const tx = nz, tz = - nx; // along the wall, to the right seen from the front
		const p = ( u, v ) => [ x + tx * u * w / 2 + nx * 0.004, y + v * h / 2, z + tz * u * w / 2 + nz * 0.004 ];
		this.dec.quadUV( p( - 1, - 1 ), p( 1, - 1 ), p( 1, 1 ), p( - 1, 1 ), [ uv[ 0 ], uv[ 1 ], uv[ 2 ], uv[ 1 ], uv[ 2 ], uv[ 3 ], uv[ 0 ], uv[ 3 ] ], { l: 0, c: tint, s: 1 }, [ nx, 0, nz ] );
	}
}

// ---- walls with openings -----------------------------------------------------------------------------------

// A straight wall in building-local coords. axis 'x': runs along x from a0 to a1, occupies z in [line + o0, line + o1];
// axis 'z': runs along z, occupies x in [line + o0, line + o1]. mN / mP: the faces on the low / high side,
// mJ: jambs, sills and heads inside openings. ops: [ { c, w, y0, y1 } ] openings along the wall.
function wallRun( O, axis, line, o0, o1, a0, a1, y0, y1, mN, mP, mJ, ops, cmat = PM.concrete ) {
	const sorted = ops.slice().sort( ( p, q ) => p.c - q.c );
	const seg = ( s0, s1, b0, b1, lo, hi, top, bot ) => {
		if ( s1 - s0 < 0.004 || b1 - b0 < 0.004 ) return;
		const faces = axis === 'x' ? { nz: mN, pz: mP, nx: lo, px: hi, py: top, ny: bot } : { nx: mN, px: mP, nz: lo, pz: hi, py: top, ny: bot };
		let skip = 0;
		for ( const [ k, bit ] of [ [ 'px', 1 ], [ 'nx', 2 ], [ 'py', 4 ], [ 'ny', 8 ], [ 'pz', 16 ], [ 'nz', 32 ] ] ) if ( ! faces[ k ] ) skip |= bit;
		for ( const k in faces ) if ( ! faces[ k ] ) faces[ k ] = mJ;
		if ( axis === 'x' ) { O.g.box( s0, b0, line + o0, s1, b1, line + o1, faces, skip ); O.col( s0, b0, line + o0, s1, b1, line + o1, cmat ); }
		else { O.g.box( line + o0, b0, s0, line + o1, b1, s1, faces, skip ); O.col( line + o0, b0, s0, line + o1, b1, s1, cmat ); }
	};
	let prev = a0, prevOp = false;
	for ( const op of sorted ) {
		const l = Math.max( a0, op.c - op.w / 2 ), r = Math.min( a1, op.c + op.w / 2 );
		if ( r <= l ) continue;
		seg( prev, l, y0, y1, prevOp ? mJ : null, mJ, null, null );
		if ( op.y0 > y0 + 0.004 ) seg( l, r, y0, Math.min( op.y0, y1 ), null, null, mJ, null );
		if ( op.y1 < y1 - 0.004 ) seg( l, r, Math.max( op.y1, y0 ), y1, null, null, null, mJ );
		prev = r; prevOp = true;
	}
	seg( prev, a1, y0, y1, prevOp ? mJ : null, null, null, null );
}

// ---- the storey -----------------------------------------------------------------------------------------------

export function buildStorey( P, si, gh ) {
	const O = new Out( P, si );
	const { S, rect } = P;
	const st = P.storeys[ si ];
	const sT = slabT( P );
	const top = st.y + st.h;
	const fin = new Map();
	for ( const rm of st.rooms ) fin.set( rm, finishes( P, rm, rng( hash32( P.bid, si * 64 + rm.id, 0xf1 ) ) ) );
	O.fin = fin;
	const stairOf = ( rm ) => {
		if ( rm.k !== 'stair' ) return null;
		for ( const s of [ P.stair, ...( P.stairs2 || [] ) ] ) if ( s && Math.abs( ( s.x0 + s.x1 ) / 2 - ( rm.x0 + rm.x1 ) / 2 ) < 0.3 && Math.abs( ( s.z0 + s.z1 ) / 2 - ( rm.z0 + rm.z1 ) / 2 ) < 0.3 ) return s;
		return null;
	};
	// the ground storey's front steps first: the porch railings leave gaps for them
	if ( si === 0 ) P.feats.steps = frontSteps( P, gh );
	const holes = st.holes || [];
	const holesAbove = si + 1 < S.n ? P.storeys[ si + 1 ].holes || [] : ( P.stair && P.stair.roof && S.n > 1 ? [ holeOf( P.stair ) ] : [] );

	// ---- floors, ceilings, slabs ----
	for ( const rm of st.rooms ) {
		if ( rm.open ) continue;
		const f = fin.get( rm );
		const fy = st.y + ( si === 0 ? 0.004 : 0 );
		for ( const r of subtract( rm, holes ) ) O.g.quad( [ r.x0, fy, r.z1 ], [ r.x1, fy, r.z1 ], [ r.x1, fy, r.z0 ], [ r.x0, fy, r.z0 ], f.floor );
		if ( S.arch !== 'tent' && ! P.feats.round ) {
			const cy = top - sT;
			for ( const r of subtract( rm, holesAbove ) ) O.g.quad( [ r.x0, cy, r.z0 ], [ r.x1, cy, r.z0 ], [ r.x1, cy, r.z1 ], [ r.x0, cy, r.z1 ], f.ceil );
		}
	}
	if ( si > 0 ) {
		for ( const r of subtract( rect, holes ) ) O.col( r.x0, st.y - sT, r.z0, r.x1, st.y, r.z1, P.S.arch === 'house' ? PM.wood : PM.concrete );
		// the edge of the slab in the stair hole
		for ( const h of holes ) {
			const under = M( L.plaster, [ 225, 222, 215 ], 3, F_IN );
			O.g.box( h.x0, st.y - sT, h.z0, h.x1, st.y, h.z1, { px: under, nx: under, pz: under, nz: under }, 4 + 8 );
		}
	} else {
		// the plinth under the ground storey (the shell draws it; the floor is its top)
		O.col( rect.x0, P.r.lo - 0.8, rect.z0, rect.x1, S.fy, rect.z1, PM.concrete );
	}

	// ---- exterior walls ----
	const walls = [];
	if ( S.arch === 'tent' ) tentWalls( O, P, st );
	else if ( P.feats.round ) roundWalls( O, P, st );
	else for ( const f of st.facades ) facadeWall( O, P, st, f, walls );
	// ---- interior walls ----
	for ( const w of st.walls ) if ( ! w.solid ) interiorWall( O, P, st, w, fin );
	// ---- stairs ----
	for ( const rm of st.rooms ) {
		const s = stairOf( rm );
		if ( ! s ) continue;
		const toRoof = si === S.n - 1 && s === P.stair && s.roof;
		if ( si < S.n - 1 || toRoof ) stairFlights( O, P, st, rm, s, toRoof ? S.top + 0.08 - st.y : st.h );
		else if ( si > 0 ) stairGuard( O, P, st, rm, s );
	}
	// ---- the storey's outside parts (porch decks, gallery slabs, railings, loggia walls) ----
	if ( S.arch !== 'tent' ) storeyOutside( O.g, P, st, 0, { interior: true } );
	outsideColliders( O, P, st );
	if ( si === 0 ) groundExtras( O, P, gh );
	if ( si === S.n - 1 ) roofTop( O, P );
	if ( si === S.n - 1 && S.arch === 'ctower' ) catwalk( O, P );
	// ---- doors ----
	for ( const d of st.doors ) doorRecord( O, P, st, d );
	// ---- furniture, loot, outbreak dressing ----
	for ( const rm of st.rooms ) furnishRoom( O, P, st, rm, fin.get( rm ) );

	bakeLight( P, st, [ O.g, O.gd ], O.dec, O.barred );
	const glass = O.glass.finish();
	return {
		geo: O.g.empty ? null : O.g.finish( false, true ), fine: O.gd.empty ? null : O.gd.finish( false, true ), dec: O.dec.empty ? null : O.dec.finish( false ), glass,
		boxes: new Float32Array( O.boxes ), doors: O.doors, containers: O.containers, spots: O.spots, beds: O.beds, taps: O.taps, lights: O.lights,
	};
}

function holeOf( s ) {
	if ( s.e === 0 ) return { x0: s.x0, z0: s.z0 + 1.2, x1: s.x1, z1: s.z1 };
	if ( s.e === 2 ) return { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 - 1.2 };
	if ( s.e === 3 ) return { x0: s.x0 + 1.2, z0: s.z0, x1: s.x1, z1: s.z1 };
	return { x0: s.x0, z0: s.z0, x1: s.x1 - 1.2, z1: s.z1 };
}

// a rect minus axis-aligned holes -> rects
export function subtract( r, holes ) {
	let out = [ { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 } ];
	for ( const h of holes ) {
		const next = [];
		for ( const a of out ) {
			if ( h.x1 <= a.x0 || h.x0 >= a.x1 || h.z1 <= a.z0 || h.z0 >= a.z1 ) { next.push( a ); continue; }
			const ix0 = Math.max( a.x0, h.x0 ), ix1 = Math.min( a.x1, h.x1 ), iz0 = Math.max( a.z0, h.z0 ), iz1 = Math.min( a.z1, h.z1 );
			if ( a.z0 < iz0 ) next.push( { x0: a.x0, z0: a.z0, x1: a.x1, z1: iz0 } );
			if ( iz1 < a.z1 ) next.push( { x0: a.x0, z0: iz1, x1: a.x1, z1: a.z1 } );
			if ( a.x0 < ix0 ) next.push( { x0: a.x0, z0: iz0, x1: ix0, z1: iz1 } );
			if ( ix1 < a.x1 ) next.push( { x0: ix1, z0: iz0, x1: a.x1, z1: iz1 } );
		}
		out = next;
	}
	return out.filter( a => a.x1 - a.x0 > 0.02 && a.z1 - a.z0 > 0.02 );
}

// ---- facades: the exterior walls with their real windows and doors ----------------------------------------------

function facadeWall( O, P, st, f, walls ) {
	const { mat } = P;
	const tx = ( f.bx - f.ax ) / f.len, tz = ( f.bz - f.az ) / f.len;
	const axis = Math.abs( tx ) > 0.5 ? 'x' : 'z';
	const line = axis === 'x' ? f.az : f.ax;
	const nOut = axis === 'x' ? f.nz : f.nx; // +1: outside is the high side
	const o0 = nOut > 0 ? - T : 0, o1 = nOut > 0 ? 0 : T;
	const inner = O.fin.get( f.inside );
	const ext = extOf( P, st, f );
	const mN = nOut > 0 ? inner.wall : ext, mP = nOut > 0 ? ext : inner.wall;
	const jamb = M( L.plaster, [ 232, 230, 224 ], 3, 0 );
	const y0 = st.y, y1 = st.y + st.h;
	const along = ( u ) => axis === 'x' ? f.ax + tx * u : f.az + tz * u;
	const ops = [];
	const frameC = FRAME_RGB[ P.frame ] || FRAME_RGB[ 0 ];
	for ( const p of f.pieces ) {
		if ( p.door ) {
			const o = p.door;
			const c = along( o.u );
			if ( o.kind === 'hangar' ) { ops.push( { c, w: o.w, y0, y1: y0 + o.h } ); continue; }
			ops.push( { c, w: o.w, y0, y1: y0 + o.h, door: o } );
			continue;
		}
		const w = p.win;
		if ( ! w ) continue;
		const style = w.style & 31;
		const n = Math.max( 1, Math.round( ( p.a1 - p.a0 ) / w.bay ) );
		for ( let bi = 0; bi < n; bi ++ ) {
			const u = p.a0 + ( bi + 0.5 ) * w.bay;
			const oy0 = y0 + w.sill, oy1 = Math.min( y1 - 0.12, y0 + w.sill + w.h );
			const state = style === 6 || style === 11 || style === 13 ? 0 : winState( w.seed, bi );
			ops.push( { c: along( u ), w: w.w, y0: oy0, y1: oy1, win: { style, seed: w.seed, bi, state, h: winHash( w.seed, bi ) } } );
		}
	}
	const a0 = Math.min( along( 0 ), along( f.len ) ), a1 = Math.max( along( 0 ), along( f.len ) );
	// ground storey walls of a raised house start at the joists, not at the ground
	wallRun( O, axis, line, o0, o1, a0, a1, y0, y1, mN, mP, jamb, ops, P.S.arch === 'house' && mat.ext.l === L.planks ? PM.wood : PM.concrete );
	// window and door dressing
	const mid = line + ( o0 + o1 ) / 2;
	const inSide = - nOut; // direction (along the wall normal axis) into the building
	for ( const op of ops ) {
		if ( op.win ) windowDressing( O, P, axis, line, mid, inSide, op, frameC, y0 );
		else if ( op.door ) doorCasing( O, axis, mid, T, op, mat.trim, inner.wall );
	}
	walls.push( { axis, line, a0, a1 } );
}

function windowDressing( O, P, axis, line, mid, inSide, op, frameC, y0 ) {
	const { c, w } = op, oy0 = op.y0, oy1 = op.y1;
	const W = op.win;
	const fm = M( L.plain, frameC, 1 );
	const fw = W.style === 3 ? 0.035 : 0.05, fd = 0.07;
	// box helper in (along, y, across) where across is measured from the wall line
	const B = ( a0, b0, n0, a1, b1, n1, m, skip = 0 ) => {
		if ( axis === 'x' ) O.g.box( a0, b0, line + n0, a1, b1, line + n1, m, skip );
		else O.g.box( line + n0, b0, a0, line + n1, b1, a1, m, skip );
	};
	const C = ( a0, b0, n0, a1, b1, n1, mat, kind ) => { if ( axis === 'x' ) O.col( a0, b0, line + n0, a1, b1, line + n1, mat, kind ); else O.col( line + n0, b0, a0, line + n1, b1, a1, mat, kind ); };
	const m0 = mid - line - fd / 2, m1 = mid - line + fd / 2;
	const l = c - w / 2, r = c + w / 2;
	// frame
	B( l, oy0, m0, r, oy0 + fw, m1, fm ); B( l, oy1 - fw, m0, r, oy1, m1, fm );
	B( l, oy0 + fw, m0, l + fw, oy1 - fw, m1, fm ); B( r - fw, oy0 + fw, m0, r, oy1 - fw, m1, fm );
	const s = W.style;
	if ( s === 1 || s === 5 || s === 12 || ( s === 2 && w > 1 ) ) B( c - 0.025, oy0 + fw, m0 - 0.01, c + 0.025, oy1 - fw, m1 + 0.01, fm );
	if ( s === 2 ) for ( let y = oy0 + 0.105; y < oy1 - 0.08; y += 0.105 ) B( l + fw, y - 0.008, m0 + 0.02, r - fw, y + 0.008, m1 - 0.02, fm );
	if ( s === 4 ) B( l + fw, oy0 + fw, m0, r - fw, oy0 + 0.3, m1, fm );
	const outN = - inSide; // sign of the outside along the across axis
	// outside sill and an inside ledge
	if ( s !== 3 && s !== 4 && s !== 5 ) {
		const o = mid - line, edge = outN > 0 ? T / 2 + 0.07 : - T / 2 - 0.07;
		B( l - 0.06, oy0 - 0.05, Math.min( o, o + edge ), r + 0.06, oy0 + 0.005, Math.max( o, o + edge ), M( L.concrete, [ 214, 210, 200 ], 2 ) );
		const ie = outN > 0 ? - T / 2 - 0.06 : T / 2 + 0.06;
		B( l - 0.04, oy0 - 0.02, Math.min( o, o + ie ), r + 0.04, oy0 + 0.02, Math.max( o, o + ie ), M( L.plain, [ 238, 236, 230 ], 1, F_IN ) );
	}
	// the pane, boards or nothing
	const across = mid - line;
	if ( W.state === 1 ) {
		// boarded up from outside: planks across the opening
		const pm = M( L.oldplanks, [ 170, 150, 125 ], 2.4, 0 );
		const o = across + outN * ( T / 2 + 0.02 );
		const n = Math.max( 3, Math.round( ( oy1 - oy0 ) / 0.3 ) );
		for ( let k = 0; k < n; k ++ ) {
			const y = oy0 + ( k + 0.5 ) * ( oy1 - oy0 ) / n + ( ( W.h >>> ( k * 3 ) ) & 7 ) * 0.01 - 0.035;
			B( l - 0.12, y - 0.09, Math.min( o, o + outN * 0.03 ), r + 0.12, y + 0.09, Math.max( o, o + outN * 0.03 ), pm );
		}
		C( l, oy0, m0, r, oy1, m1, PM.wood, 0 );
	} else if ( W.state === 2 ) {
		// broken: shards on the floor inside
		const fx = axis === 'x' ? c : line + across + inSide * 0.6, fz = axis === 'x' ? line + across + inSide * 0.6 : c;
		O.decalFloor( fx, y0 + 0.012, fz, Math.min( 1.6, w ), DECAL.glass, W.h * 0.001 );
		// a few teeth left in the frame
		const gm = O.glass;
		const q = ( a, b ) => axis === 'x' ? [ a, b, mid ] : [ mid, b, a ];
		gm.quad( q( l + fw, oy0 + fw ), q( l + w * 0.3, oy0 + fw ), q( l + fw, oy0 + ( oy1 - oy0 ) * 0.4 ), q( l + fw, oy0 + ( oy1 - oy0 ) * 0.4 ), axis === 'x' ? [ 0, 0, 1 ] : [ 1, 0, 0 ] );
	} else {
		const q = ( a, b ) => axis === 'x' ? [ a, b, mid ] : [ mid, b, a ];
		O.glass.quad( q( l + fw, oy0 + fw ), q( r - fw, oy0 + fw ), q( r - fw, oy1 - fw ), q( l + fw, oy1 - fw ), axis === 'x' ? [ 0, 0, 1 ] : [ 1, 0, 0 ] );
		C( l, oy0, mid - line - 0.02, r, oy1, mid - line + 0.02, PM.glass, 1 );
	}
	// curtains and blinds, the same ones the facade shader draws from outside
	const dress = ( W.h >>> 28 ) & 7;
	const homey = s === 1 || s === 2 || s === 5;
	if ( homey && W.state !== 1 && ( dress <= 2 ) ) {
		const o = across + inSide * ( T / 2 + 0.06 );
		const wc = WALLS_RGB[ ( W.h >>> 14 ) & 7 ];
		const cm = M( L.fabric, [ wc[ 0 ] * 0.9, wc[ 1 ] * 0.85, wc[ 2 ] * 0.8 ], 1.2, F_IN );
		if ( dress <= 1 ) {
			const open = dress === 0 ? 0.3 : 0.05;
			const cw = ( w / 2 ) * ( 1 - open ) + 0.1;
			B( l - 0.1, oy0 - 0.15, Math.min( o, o + inSide * 0.03 ), l - 0.1 + cw, oy1 + 0.15, Math.max( o, o + inSide * 0.03 ), cm );
			B( r + 0.1 - cw, oy0 - 0.15, Math.min( o, o + inSide * 0.03 ), r + 0.1, oy1 + 0.15, Math.max( o, o + inSide * 0.03 ), cm );
			B( l - 0.15, oy1 + 0.12, Math.min( o, o + inSide * 0.05 ), r + 0.15, oy1 + 0.16, Math.max( o, o + inSide * 0.05 ), M( L.spandrel, [ 150, 150, 150 ], 1, F_IN ) );
		} else {
			const down = ( oy1 - oy0 ) * ( 0.3 + 0.6 * ( ( W.h >>> 25 ) & 3 ) / 3 );
			B( l, oy1 - down, Math.min( o, o + inSide * 0.02 ), r, oy1, Math.max( o, o + inSide * 0.02 ), M( L.fabric, [ 214, 210, 196 ], 0.5, F_IN ) );
		}
	}
}

function doorCasing( O, axis, mid, t, op, trimOut, wallIn ) {
	const { c, w } = op, y0 = op.y0, y1 = op.y1;
	const cm = M( L.plain, [ 238, 236, 230 ], 1, F_IN );
	void trimOut; void wallIn;
	// head and jamb casings on both faces
	for ( const s of [ - 1, 1 ] ) {
		const n0 = mid + s * t / 2, n1 = n0 + s * 0.02;
		const B = ( a0, b0, a1, b1 ) => {
			if ( axis === 'x' ) O.g.box( a0, b0, Math.min( n0, n1 ), a1, b1, Math.max( n0, n1 ), cm, 8 );
			else O.g.box( Math.min( n0, n1 ), b0, a0, Math.max( n0, n1 ), b1, a1, cm, 8 );
		};
		B( c - w / 2 - 0.07, y1, c + w / 2 + 0.07, y1 + 0.07 );
		B( c - w / 2 - 0.07, y0, c - w / 2, y1 );
		B( c + w / 2, y0, c + w / 2 + 0.07, y1 );
	}
}

// ---- interior walls ---------------------------------------------------------------------------------------------

function interiorWall( O, P, st, w, fin ) {
	const { rect } = P;
	const axis = w.axis;
	let a0 = axis === 'x' ? w.x0 : w.z0, a1 = axis === 'x' ? w.x1 : w.z1;
	const lo = axis === 'x' ? rect.x0 : rect.z0, hi = axis === 'x' ? rect.x1 : rect.z1;
	// stop at the inner face of the exterior walls
	if ( Math.abs( a0 - lo ) < 0.05 ) a0 = lo + T;
	if ( Math.abs( a1 - hi ) < 0.05 ) a1 = hi - T;
	if ( a1 - a0 < 0.05 ) return;
	const line = axis === 'x' ? w.z0 : w.x0;
	const t = w.t;
	const fa = fin.get( w.A ), fb = fin.get( w.B );
	const sT = slabT( P );
	// walls of the stairwell run up to the next floor (no ceiling over the flights)
	const y0 = st.y, y1 = st.y + st.h - ( w.A.k === 'stair' || w.B.k === 'stair' ? 0 : sT );
	const jamb = M( L.plaster, [ 236, 234, 228 ], 3, F_IN );
	const ops = [];
	for ( const op of w.ops ) {
		const c = ( axis === 'x' ? w.x0 : w.z0 ) + op.c;
		ops.push( { c, w: op.w, y0, y1: y0 + op.h, kind: op.kind } );
	}
	const mat = P.S.arch === 'house' ? PM.wood : PM.concrete;
	wallRun( O, axis, line, - t / 2, t / 2, a0, a1, y0, y1, fa.wall, fb.wall, jamb, ops, mat );
	// tiled wainscot in kitchens and bathrooms (a skin on the wall face)
	for ( const [ f, side ] of [ [ fa, - 1 ], [ fb, 1 ] ] ) {
		if ( ! f.wain ) continue;
		const n = side * ( t / 2 + 0.006 );
		const wh = 1.45;
		let prev = a0;
		const sorted = ops.slice().sort( ( p, q ) => p.c - q.c );
		const piece = ( s0, s1 ) => {
			if ( s1 - s0 < 0.02 ) return;
			if ( axis === 'x' ) O.g.box( s0, y0, line + Math.min( n, n - side * 0.006 ), s1, y0 + wh, line + Math.max( n, n - side * 0.006 ), f.wain, side > 0 ? 32 : 16 );
			else O.g.box( line + Math.min( n, n - side * 0.006 ), y0, s0, line + Math.max( n, n - side * 0.006 ), y0 + wh, s1, f.wain, side > 0 ? 2 : 1 );
		};
		for ( const op of sorted ) { piece( prev, op.c - op.w / 2 ); prev = op.c + op.w / 2; }
		piece( prev, a1 );
	}
	for ( const op of ops ) if ( op.kind !== 'arch' ) doorCasing( O, axis, line, t, op );
}

// ---- stairs -------------------------------------------------------------------------------------------------------

// maps (a along the run from the entry side, b across) of stair rect s to building-local x / z
function stairFrame( s ) {
	const alongZ = s.e === 0 || s.e === 2;
	const len = alongZ ? s.z1 - s.z0 : s.x1 - s.x0, sw = alongZ ? s.x1 - s.x0 : s.z1 - s.z0;
	const pt = ( a, b ) => {
		if ( s.e === 0 ) return [ s.x0 + b, s.z0 + a ];
		if ( s.e === 2 ) return [ s.x0 + b, s.z1 - a ];
		if ( s.e === 3 ) return [ s.x0 + a, s.z0 + b ];
		return [ s.x1 - a, s.z0 + b ];
	};
	const rect = ( a0, a1, b0, b1 ) => {
		const p = pt( a0, b0 ), q = pt( a1, b1 );
		return [ Math.min( p[ 0 ], q[ 0 ] ), Math.min( p[ 1 ], q[ 1 ] ), Math.max( p[ 0 ], q[ 0 ] ), Math.max( p[ 1 ], q[ 1 ] ) ];
	};
	return { len, sw, pt, rect };
}

function stairFlights( O, P, st, rm, s, H ) {
	const F = stairFrame( s );
	const house = P.S.arch === 'house';
	const tread = M( house ? L.woodfloor : L.concrete, house ? [ 236, 220, 200 ] : [ 196, 194, 188 ], house ? 1.6 : 2, F_IN );
	const side = M( house ? L.wood : L.plaster, house ? [ 220, 210, 196 ] : [ 214, 212, 206 ], 2, F_IN );
	const nosing = M( L.spandrel, [ 90, 90, 90 ], 1, F_IN );
	const y0 = st.y;
	const run = Math.max( 0.6, F.len - 1.2 - 1.0 );
	let nR = Math.ceil( ( H / 2 ) / 0.19 );
	if ( run / nR < 0.2 ) nR = Math.max( 2, Math.floor( run / 0.2 ) );
	const rise = ( H / 2 ) / nR, tr = run / nR;
	const wA0 = 0, wA1 = F.sw / 2 - 0.06, wB0 = F.sw / 2 + 0.06, wB1 = F.sw;
	const pmat = house ? PM.wood : PM.concrete;
	const step = ( a0, a1, b0, b1, yt ) => {
		const [ x0, z0, x1, z1 ] = F.rect( a0, a1, b0, b1 );
		const yb = yt - rise - 0.18;
		O.g.box( x0, yb, z0, x1, yt, z1, { py: tread, ny: side, px: side, nx: side, pz: side, nz: side } );
		O.col( x0, yb, z0, x1, yt, z1, pmat );
		// a nosing strip at the front of commercial stairs
		if ( ! house ) {
			const [ nx0, nz0, nx1, nz1 ] = F.rect( a0, a0 + 0.04, b0, b1 );
			O.g.box( nx0, yt - 0.004, nz0, nx1, yt + 0.004, nz1, nosing, 8 );
		}
	};
	// flight A: up and away from the entry
	for ( let k = 0; k < nR; k ++ ) step( 1.2 + k * tr, 1.2 + ( k + 1 ) * tr, wA0, wA1, y0 + ( k + 1 ) * rise );
	// half landing across the far end
	{
		const [ x0, z0, x1, z1 ] = F.rect( 1.2 + run, F.len, 0, F.sw );
		O.g.box( x0, y0 + H / 2 - 0.22, z0, x1, y0 + H / 2, z1, { py: tread, ny: side, px: side, nx: side, pz: side, nz: side } );
		O.col( x0, y0 + H / 2 - 0.22, z0, x1, y0 + H / 2, z1, pmat );
	}
	// flight B: back towards the entry, up to the next floor
	for ( let k = 0; k < nR; k ++ ) step( 1.2 + run - ( k + 1 ) * tr, 1.2 + run - k * tr, wB0, wB1, y0 + H / 2 + ( k + 1 ) * rise );
	// the wall between the flights (a railing on open-air stairs)
	const [ x0, z0, x1, z1 ] = F.rect( 1.2, 1.2 + run, wA1, wB0 );
	if ( rm.open ) {
		const rmat = P.mat.rail;
		for ( let k = 0; k <= nR; k ++ ) {
			const a = 1.2 + run - k * tr;
			const [ px0, pz0, px1, pz1 ] = F.rect( a - 0.03, a + 0.03, wA1, wB0 );
			const yA = y0 + Math.max( 0, Math.min( nR, ( a - 1.2 ) / tr ) ) * rise, yB = y0 + H / 2 + k * rise;
			O.g.box( px0, yA, pz0, px1, Math.max( yA, yB ) + 1.0, pz1, rmat );
		}
		O.col( x0, y0, z0, x1, y0 + H + 1, z1, PM.metal, 2 );
		// outer handrails along both flights
		for ( const [ b0, b1 ] of [ [ 0, 0.05 ], [ F.sw - 0.05, F.sw ] ] ) {
			for ( let k = 0; k < nR; k ++ ) {
				const flightA = b0 < 0.1;
				const a0 = flightA ? 1.2 + k * tr : 1.2 + run - ( k + 1 ) * tr, a1 = a0 + tr;
				const yt = flightA ? y0 + ( k + 1 ) * rise : y0 + H / 2 + ( k + 1 ) * rise;
				const [ rx0, rz0, rx1, rz1 ] = F.rect( a0, a1, b0, b1 );
				O.g.box( rx0, yt + 0.9, rz0, rx1, yt + 0.95, rz1, rmat );
				if ( k % 2 === 0 ) { const [ qx0, qz0, qx1, qz1 ] = F.rect( a0, a0 + 0.04, b0, b1 ); O.g.box( qx0, yt, qz0, qx1, yt + 0.9, qz1, rmat ); }
				O.col( rx0, yt, rz0, rx1, yt + 0.95, rz1, PM.metal, 2 );
			}
		}
		openStairRails( O, P, st, rm, s, F, run, true );
	} else {
		const wm = M( L.plaster, [ 222, 222, 216 ], 3, F_IN );
		O.g.box( x0, y0, z0, x1, y0 + H, z1, wm );
		O.col( x0, y0, z0, x1, y0 + H, z1, PM.concrete );
		// handrails on the wall
		const hm = M( L.spandrel, [ 120, 120, 118 ], 1, F_IN );
		const [ hx0, hz0, hx1, hz1 ] = F.rect( 1.2, 1.2 + run, wA1 - 0.06, wB0 + 0.06 );
		void hx0; void hz0; void hx1; void hz1;
		for ( const [ b0, b1, flightA ] of [ [ wA1 - 0.06, wA1, true ], [ wB0, wB0 + 0.06, false ] ] ) {
			for ( let k = 0; k < nR; k += 1 ) {
				const a0 = flightA ? 1.2 + k * tr : 1.2 + run - ( k + 1 ) * tr, a1 = a0 + tr;
				const yt = flightA ? y0 + ( k + 1 ) * rise : y0 + H / 2 + ( k + 1 ) * rise;
				const [ rx0, rz0, rx1, rz1 ] = F.rect( a0, a1, b0, b1 );
				O.g.box( rx0, yt + 0.86, rz0, rx1, yt + 0.9, rz1, hm, 0 );
			}
		}
	}
}

// the top storey's stairwell with no flight up: a railing round the opening
function stairGuard( O, P, st, rm, s ) {
	const F = stairFrame( s );
	const rmat = house( P ) ? M( L.wood, [ 190, 160, 120 ], 1, F_IN ) : M( L.spandrel, [ 110, 110, 108 ], 1, F_IN );
	const y = st.y;
	// along the edge of the landing strip, except where flight B arrives
	const [ x0, z0, x1, z1 ] = F.rect( 1.18, 1.24, 0, F.sw / 2 );
	O.g.box( x0, y, z0, x1, y + 1.0, z1, rmat );
	O.col( x0, y, z0, x1, y + 1.0, z1, PM.metal, 2 );
	if ( rm.open ) openStairRails( O, P, st, rm, s, F, 0, false );
}

// guard rails round the landings of an open stair (walk-ups): on its open sides, at the storey's landing and
// (below a storey with flights) round the half landing
function openStairRails( O, P, st, rm, s, F, run, flights ) {
	const toAB = ( x, z ) => s.e === 0 ? [ z - s.z0, x - s.x0 ] : s.e === 2 ? [ s.z1 - z, x - s.x0 ] : s.e === 3 ? [ x - s.x0, z - s.z0 ] : [ s.x1 - x, z - s.z0 ];
	const rmat = P.mat.rail, t = 0.05;
	const yh = st.y + st.h / 2;
	const bar = ( a0, a1, b0, b1, y ) => {
		if ( a1 - a0 < 0.04 || b1 - b0 < 0.04 ) return;
		const [ x0, z0, x1, z1 ] = F.rect( a0, a1, b0, b1 );
		O.g.box( x0, y + 0.94, z0, x1, y + 1.0, z1, rmat );
		O.g.box( x0, y + 0.1, z0, x1, y + 0.14, z1, rmat );
		const along = a1 - a0 > b1 - b0, len = along ? a1 - a0 : b1 - b0, n = Math.max( 1, Math.round( len / 0.12 ) );
		for ( let k = 0; k <= n; k ++ ) {
			const f = k / n, a = along ? a0 + len * f : ( a0 + a1 ) / 2, b = along ? ( b0 + b1 ) / 2 : b0 + len * f;
			const [ px0, pz0, px1, pz1 ] = F.rect( a - 0.012, a + 0.012, b - 0.012, b + 0.012 );
			O.g.box( px0, y + 0.14, pz0, px1, y + 0.94, pz1, rmat, 12 );
		}
		O.col( x0, y, z0, x1, y + 1.0, z1, PM.metal, 2 );
	};
	for ( const rl of st.rails ) {
		if ( rl.room !== rm ) continue;
		const [ a0, b0 ] = toAB( rl.x0, rl.z0 ), [ a1, b1 ] = toAB( rl.x1, rl.z1 );
		if ( Math.abs( a0 - a1 ) < 0.01 ) {
			// the far end, across the half landing (the entry end opens onto the gallery)
			if ( flights && a0 > F.len - 0.05 ) bar( F.len - t, F.len, Math.min( b0, b1 ), Math.max( b0, b1 ), yh );
			continue;
		}
		// a side along the run: the storey's own landing, and the half landing
		const bb = Math.min( b0, b1 ) < 0.05 ? [ 0, t ] : [ F.sw - t, F.sw ];
		const lo = Math.min( a0, a1 ), hi = Math.max( a0, a1 );
		if ( lo < 1.2 ) bar( Math.max( lo, 0 ), Math.min( hi, 1.2 ), bb[ 0 ], bb[ 1 ], st.y );
		if ( flights && hi > 1.2 + run ) bar( Math.max( lo, 1.2 + run ), hi, bb[ 0 ], bb[ 1 ], yh );
	}
}
const house = ( P ) => P.S.arch === 'house';

// ---- the storey's outside: colliders for decks, slabs, railings and posts ------------------------------------------

function outsideColliders( O, P, st ) {
	const sT = slabT( P );
	const y0 = st.y;
	for ( const rm of st.rooms ) {
		if ( ! rm.open || rm.k === 'stair' ) continue;
		if ( st.i === 0 ) {
			if ( rm.k === 'porch' ) O.col( rm.x0, P.r.lo - 0.5, rm.z0, rm.x1, y0, rm.z1, PM.wood );
		} else O.col( rm.x0, y0 - sT, rm.z0, rm.x1, y0, rm.z1, PM.concrete );
	}
	const raised = st.i > 0 || P.S.raise > 0.45;
	if ( ! raised ) return;
	for ( const rl of st.rails ) {
		if ( rl.room.k === 'stair' ) continue;
		const x0 = Math.min( rl.x0, rl.x1 ), x1 = Math.max( rl.x0, rl.x1 ), z0 = Math.min( rl.z0, rl.z1 ), z1 = Math.max( rl.z0, rl.z1 );
		const e = 0.05;
		// leave the porch steps open
		const gaps = st.i === 0 && rl.room.k === 'porch' && P.feats.steps ? P.feats.steps.filter( s => s.side === rl.side ) : [];
		const along = x1 - x0 > z1 - z0 ? 'x' : 'z';
		let segs = [ [ along === 'x' ? x0 : z0, along === 'x' ? x1 : z1 ] ];
		for ( const gp of gaps ) {
			const c = along === 'x' ? gp.x : gp.z;
			segs = segs.flatMap( ( [ a, b ] ) => ( c + gp.w / 2 <= a || c - gp.w / 2 >= b ) ? [ [ a, b ] ] : [ [ a, c - gp.w / 2 ], [ c + gp.w / 2, b ] ].filter( ( [ p, q ] ) => q - p > 0.1 ) );
		}
		for ( const [ a, b ] of segs ) {
			if ( along === 'x' ) O.col( a, y0, z0 - e, b, y0 + 1.0, z1 + e, PM.metal, 2 );
			else O.col( x0 - e, y0, a, x1 + e, y0 + 1.0, b, PM.metal, 2 );
		}
	}
}

// ---- ground storey: front steps, the plinth, porch posts ----------------------------------------------------------

function groundExtras( O, P, gh ) {
	for ( const s of P.feats.steps ) for ( const b of stepBoxes( P, s ) ) O.col( b[ 0 ], b[ 1 ], b[ 2 ], b[ 3 ], b[ 4 ], b[ 5 ], P.S.arch === 'house' ? PM.wood : PM.concrete );
	// the shell's solid bits outside the walls: pump islands, canopy columns, the fire station's hose tower
	const S = P.S;
	for ( const [ px, pz ] of pumpsOf( P.r, S ) ) { const y = gh ? groundAt( P, gh, px, pz ) : S.fy; O.col( px - 0.7, y - 0.5, pz - 1.3, px + 0.7, y + 1.7, pz + 1.3, PM.metal ); }
	if ( S.arch === 'fire' ) { const [ x0, z0, x1, z1 ] = hoseTower( P ); O.col( x0, P.r.lo - 0.5, z0, x1, S.top + 5.2, z1, PM.concrete ); }
	if ( S.arch === 'terminal' ) { const c = terminalCanopyOf( P ); for ( const [ x, z ] of c.cols ) O.col( x - 0.2, P.r.lo - 0.5, z - 0.2, x + 0.2, c.y, z + 0.2, PM.metal ); }
	const po = portalOf( P );
	if ( po ) { O.col( po.x0, P.r.lo - 0.5, po.z0, po.x0 + po.pw, po.y1, po.z1 ); O.col( po.x1 - po.pw, P.r.lo - 0.5, po.z0, po.x1, po.y1, po.z1 ); }
}

// the control tower's catwalk round the cab (reachable through a broken pane)
function catwalk( O, P ) {
	const { rect } = P, c = towerCatwalkOf( P ), y = c.y;
	O.col( c.x0, y - 0.3, c.z0, c.x1, y, rect.z0 );
	O.col( c.x0, y - 0.3, rect.z1, c.x1, y, c.z1 );
	O.col( c.x0, y - 0.3, rect.z0, rect.x0, y, rect.z1 );
	O.col( rect.x1, y - 0.3, rect.z0, c.x1, y, rect.z1 );
	const r = 0.05;
	O.col( c.x0, y, c.z0, c.x1, y + 1.0, c.z0 + r, PM.metal, 2 );
	O.col( c.x0, y, c.z1 - r, c.x1, y + 1.0, c.z1, PM.metal, 2 );
	O.col( c.x0, y, c.z0, c.x0 + r, y + 1.0, c.z1, PM.metal, 2 );
	O.col( c.x1 - r, y, c.z0, c.x1, y + 1.0, c.z1, PM.metal, 2 );
}

// ---- the roof over the top storey: deck with the stair opening, parapet and bulkhead colliders --------------------

function roofTop( O, P ) {
	const { S, rect, mat } = P;
	if ( S.roof !== 'flat' ) return;
	const top = S.top;
	const hole = P.stair && P.stair.roof && S.n > 1 ? holeOf( P.stair ) : null;
	const deck = M( L.bitumen, [ 170, 168, 162 ], 4 );
	if ( hole ) {
		for ( const r of subtract( rect, [ hole ] ) ) O.g.box( r.x0, top - 0.02, r.z0, r.x1, top + 0.08, r.z1, { py: deck, px: mat.ext, nx: mat.ext, pz: mat.ext, nz: mat.ext } );
		const under = M( L.plaster, [ 225, 222, 215 ], 3, F_IN );
		O.g.box( hole.x0, top - slabT( P ), hole.z0, hole.x1, top + 0.08, hole.z1, { px: under, nx: under, pz: under, nz: under }, 4 + 8 );
		void bulkhead;
	}
	for ( const r of subtract( rect, hole ? [ hole ] : [] ) ) O.col( r.x0, top - slabT( P ), r.z0, r.x1, top + 0.08, r.z1, PM.concrete );
	// parapet
	const ph = S.arch === 'tower' ? 1.1 : S.arch === 'house' ? 0.35 : 0.8, t = 0.22;
	O.col( rect.x0, top, rect.z0, rect.x1, top + ph, rect.z0 + t, PM.concrete );
	O.col( rect.x0, top, rect.z1 - t, rect.x1, top + ph, rect.z1, PM.concrete );
	O.col( rect.x0, top, rect.z0, rect.x0 + t, top + ph, rect.z1, PM.concrete );
	O.col( rect.x1 - t, top, rect.z0, rect.x1, top + ph, rect.z1, PM.concrete );
	// a tower's plant room (drawn by the shell)
	if ( S.arch === 'tower' && P.look?.crown !== 'hip' ) { const pr = penthouseOf( P, rect.x0, rect.z0, rect.x1, rect.z1 ); O.col( pr.x0, top, pr.z0, pr.x1, top + 3.6, pr.z1 ); }
	// the stair bulkhead (drawn by the shell): walls and roof, open on the entry side
	if ( P.stair && P.stair.roof && S.n > 1 ) {
		const s = P.stair, h = 2.6, w = 0.2, door = 1.0;
		const sides = [ [ s.x0, s.z0, s.x1, s.z0 + w, 0 ], [ s.x1 - w, s.z0, s.x1, s.z1, 1 ], [ s.x0, s.z1 - w, s.x1, s.z1, 2 ], [ s.x0, s.z0, s.x0 + w, s.z1, 3 ] ];
		for ( const [ a, b, c, d, side ] of sides ) {
			if ( side === s.e ) {
				if ( side === 0 || side === 2 ) { const mx = ( a + c ) / 2; O.col( a, top, b, mx - door / 2, top + h, d ); O.col( mx + door / 2, top, b, c, top + h, d ); }
				else { const mz = ( b + d ) / 2; O.col( a, top, b, c, top + h, mz - door / 2 ); O.col( a, top, mz + door / 2, c, top + h, d ); }
			} else O.col( a, top, b, c, top + h, d );
		}
		O.col( s.x0 - 0.1, top + h, s.z0 - 0.1, s.x1 + 0.1, top + h + 0.15, s.z1 + 0.1 );
	}
}

// ---- tents and the observatory ----------------------------------------------------------------------------------------

// military tent: the shell keeps its canvas; the interior adds colliders for the canvas walls (door flaps open)
function tentWalls( O, P, st ) {
	const r = P.rect, y = st.y, h = 1.3, t = 0.03;
	const cz = ( r.z0 + r.z1 ) / 2;
	O.col( r.x0, y, r.z0 - t, r.x1, y + h, r.z0 + t, PM.wood );
	O.col( r.x0, y, r.z1 - t, r.x1, y + h, r.z1 + t, PM.wood );
	for ( const x of [ r.x0, r.x1 ] ) {
		O.col( x - t, y, r.z0, x + t, y + 2.2, cz - 0.7, PM.wood );
		O.col( x - t, y, cz + 0.7, x + t, y + 2.2, r.z1, PM.wood );
	}
}

// observatory: a round wall with the door at the front, and the inside of the dome
function roundWalls( O, P, st ) {
	const { rect, S, mat } = P;
	const cx = ( rect.x0 + rect.x1 ) / 2, cz = ( rect.z0 + rect.z1 ) / 2, R0 = S.bw / 2;
	const y0 = st.y, y1 = st.y + st.h;
	const inner = M( L.plaster, [ 232, 232, 230 ], 3, F_IN );
	const n = 28;
	const t = 0.3;
	for ( let k = 0; k < n; k ++ ) {
		const a0 = k / n * Math.PI * 2, a1 = ( k + 1 ) / n * Math.PI * 2, am = ( a0 + a1 ) / 2;
		// the door gap faces the front (-z): angle -PI/2 in this parametrisation (x = cos, z = sin)
		const d = Math.abs( Math.atan2( Math.sin( am + Math.PI / 2 ), Math.cos( am + Math.PI / 2 ) ) );
		const door = d < Math.PI / n * 1.01;
		const segW = 2 * R0 * Math.sin( Math.PI / n ) + 0.02;
		const rc = R0 - t / 2;
		const px = cx + Math.cos( am ) * rc, pz = cz + Math.sin( am ) * rc;
		// a box whose local z points at the centre: yaw so that local z = inward
		const yaw = Math.atan2( - Math.cos( am ), - Math.sin( am ) );
		O.g.push().translate( px, 0, pz ).rotY( yaw );
		if ( door ) {
			O.g.box( - segW / 2, y0 + 2.1, - t / 2, segW / 2, y1, t / 2, { pz: inner, nz: mat.ext, ny: inner, px: inner, nx: inner }, 4 );
			O.colR( px, ( y0 + 2.1 + y1 ) / 2, pz, segW / 2, ( y1 - y0 - 2.1 ) / 2, t / 2, yaw, PM.concrete );
		} else {
			O.g.box( - segW / 2, y0, - t / 2, segW / 2, y1, t / 2, { pz: inner, nz: mat.ext }, 1 + 2 + 4 + 8 );
			O.colR( px, ( y0 + y1 ) / 2, pz, segW / 2, ( y1 - y0 ) / 2, t / 2, yaw, PM.concrete );
		}
		O.g.pop();
	}
	// the inside of the dome and its slit
	const top = S.top, rr = S.bw / 2 + 0.15;
	const prof = [];
	for ( let i = 12; i >= 0; i -- ) { const a = i / 12 * Math.PI / 2 * 0.98; prof.push( [ Math.cos( a ) * ( rr - 0.12 ), top + Math.sin( a ) * ( rr - 0.12 ) ] ); }
	O.g.lathe( cx, cz, prof, 32, M( L.spandrel, [ 200, 200, 200 ], 3, F_IN ) );
	O.g.cyl( cx, top - 0.3, cz, rr - 0.1, 0.3, 32, M( L.spandrel, [ 150, 150, 150 ], 2, F_IN ), 0 );
}

// ---- doors ---------------------------------------------------------------------------------------------------------

const STATIC_DOOR = { elevator: 1 };
function doorRecord( O, P, st, d ) {
	const k = d.kind;
	if ( k === 'hangar' || k === 'flap' ) return;
	if ( STATIC_DOOR[ k ] ) {
		// closed elevator doors: brushed steel panels in the opening, a collider
		const mm = M( L.spandrel, [ 190, 190, 190 ], 1, F_IN );
		const hw = d.w / 2, t = 0.03;
		if ( d.axis === 'x' ) { O.g.box( d.x - hw, st.y, d.z - t, d.x + hw, st.y + d.h, d.z + t, mm ); O.col( d.x - hw, st.y, d.z - t, d.x + hw, st.y + d.h, d.z + t, PM.metal ); O.g.box( d.x - 0.004, st.y, d.z - t - 0.004, d.x + 0.004, st.y + d.h, d.z + t + 0.004, M( L.plain, [ 30, 30, 30 ], 1, F_IN ) ); }
		else { O.g.box( d.x - t, st.y, d.z - hw, d.x + t, st.y + d.h, d.z + hw, mm ); O.col( d.x - t, st.y, d.z - hw, d.x + t, st.y + d.h, d.z + hw, PM.metal ); O.g.box( d.x - t - 0.004, st.y, d.z - 0.004, d.x + t + 0.004, st.y + d.h, d.z + 0.004, M( L.plain, [ 30, 30, 30 ], 1, F_IN ) ); }
		return;
	}
	O.doors.push( {
		idx: d.idx, x: d.x, y: st.y, z: d.z, axis: d.axis, w: d.w, h: d.h, kind: k, swing: d.swing, hinge: d.hinge, locked: d.locked, ext: d.ext,
	} );
}

export { stairFrame, T as WALL_T };
