// The furniture kit (worker side): a local frame for drawing one piece of furniture into a storey (boxes,
// cylinders, tilted and rotated parts, merged into the storey mesh or into its fine mesh of small things), the
// gameplay records a piece carries (colliders, containers, loot spots, beds, taps, candles) and the shared
// interior materials. Local frame: origin on the floor, x along the wall, +z out of the wall into the room, y up.
import { F_IN, F_GLOW } from './geo.js';
import { L, artUV } from './data.js';
import { M } from './plan.js';

export const MAX_SPOTS = 10; // loose loot spots per room

// ---- materials (all interior) ----------------------------------------------------------------------------------

export const paint = ( c ) => M( L.plain, c, 1, F_IN );
export const gloss = ( c ) => M( L.gloss, c, 1, F_IN );
export const wood = ( c = [ 176, 132, 92 ] ) => M( L.wood, c, 1, F_IN );
export const metal = ( c = [ 170, 172, 174 ] ) => M( L.spandrel, c, 1, F_IN );
export const cloth = ( c, s = 0.8 ) => M( L.fabric, c, s, F_IN );
export const chrome = ( c = [ 220, 222, 224 ] ) => M( L.chrome, c, 1, F_IN );
export const card = () => M( L.cardboard, [ 255, 255, 255 ], 1, F_IN, { fit: [ 0, 0, 1, 1 ] } );
export const art = ( k, c = [ 255, 255, 255 ] ) => M( L.art, c, 1, F_IN, { fit: artUV( k ) } );
export const glow = ( c ) => M( L.plain, c, 1, F_IN | F_GLOW );
export const DARK = paint( [ 40, 40, 42 ] ), WHITE = paint( [ 236, 236, 232 ] ), BLACK = paint( [ 22, 22, 24 ] );
export const STEEL = metal( [ 190, 192, 194 ] ), CHROME = chrome(), PORCELAIN = gloss( [ 244, 244, 240 ] ), SCREEN = gloss( [ 12, 13, 15 ] );
export const PLASTIC = gloss( [ 50, 50, 54 ] );
export const SOFA = [ [ 120, 96, 80 ], [ 70, 90, 110 ], [ 150, 140, 120 ], [ 90, 110, 80 ], [ 140, 70, 60 ], [ 110, 110, 116 ], [ 196, 186, 160 ], [ 60, 64, 70 ] ];
export const BLANKET = [ [ 180, 60, 60 ], [ 60, 90, 150 ], [ 220, 210, 190 ], [ 90, 130, 100 ], [ 200, 150, 60 ], [ 150, 110, 170 ], [ 240, 240, 236 ], [ 70, 150, 160 ] ];
export const WOODS = [ [ 176, 132, 92 ], [ 130, 90, 60 ], [ 200, 170, 130 ], [ 96, 64, 44 ], [ 220, 196, 160 ] ];
// clothes: shirts, aloha prints, denim, khaki, black, white
export const CLOTHES = [ [ 200, 60, 50 ], [ 60, 110, 170 ], [ 230, 230, 220 ], [ 40, 40, 44 ], [ 60, 80, 120 ], [ 190, 170, 120 ], [ 230, 150, 60 ], [ 70, 140, 110 ], [ 180, 90, 140 ], [ 110, 110, 110 ] ];
export const pickOf = ( R, a ) => a[ ( R() * a.length ) | 0 ];

// ---- a local frame for one piece -------------------------------------------------------------------------------

export function frame( O, x, y, z, rot, g = O.g ) {
	const cr = Math.cos( rot ), sr = Math.sin( rot );
	const T = ( lx, lz ) => [ x + lx * cr + lz * sr, z - lx * sr + lz * cr ];
	const F = {
		O, x, y, z, rot, T, g,
		box( x0, y0, z0, x1, y1, z1, m, skip = 0 ) { g.push().translate( x, y, z ).rotY( rot ); g.box( x0, y0, z0, x1, y1, z1, m, skip ); g.pop(); return F; },
		cyl( cx, y0, cz, r, h, seg, m, caps = 3, r1 = r ) { g.push().translate( x, y, z ).rotY( rot ); g.cyl( cx, y0, cz, r, h, seg, m, caps, r1 ); g.pop(); return F; },
		// a cylinder lying along local x (or z), centred at (cx, cy, cz)
		cylH( cx, cy, cz, r, len, seg, m, axis = 'x', caps = 3, r1 = r ) {
			g.push().translate( x, y, z ).rotY( rot ).translate( cx, cy, cz );
			if ( axis === 'x' ) g.rotZ( Math.PI / 2 ); else g.rotX( Math.PI / 2 );
			g.cyl( 0, - len / 2, 0, r, len, seg, m, caps, r1 );
			g.pop();
			return F;
		},
		// tilted box (tipped chairs, leaning boards): rotation about local x then z around the box centre
		tilt( cx, cy, cz, hx, hy, hz, ax, az, m ) { g.push().translate( x, y, z ).rotY( rot ).translate( cx, cy, cz ).rotX( ax ).rotZ( az ); g.box( - hx, - hy, - hz, hx, hy, hz, m ); g.pop(); return F; },
		// a box turned about y (ay), then tilted (ax, az), around its centre
		rbox( cx, cy, cz, hx, hy, hz, m, ay = 0, ax = 0, az = 0, skip = 0 ) { g.push().translate( x, y, z ).rotY( rot ).translate( cx, cy, cz ).rotY( ay ).rotX( ax ).rotZ( az ); g.box( - hx, - hy, - hz, hx, hy, hz, m, skip ); g.pop(); return F; },
		// a sub-frame at a local point, turned by a more
		at( lx, ly, lz, a = 0 ) { const [ px, pz ] = T( lx, lz ); return frame( O, px, y + ly, pz, rot + a, g ); },
		// the same frame drawing into the fine mesh (small things, only drawn up close)
		fine() { return g === O.gd ? F : frame( O, x, y, z, rot, O.gd ); },
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
			// h: how high above the storey's floor it lies (on a shelf, a table: no room there for a surfboard)
			const h = Math.round( ( y + ly - ( O.st?.y ?? y ) ) * 100 ) / 100;
			O.spots.push( { key: `${O.P.bid}:${O.si}:s${O.spots.length}`, x: sx, y: y + ly, z: sz, yaw: O.R() * Math.PI * 2, table, h } );
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
		// a candle or lantern someone left burning (a real light at night)
		light( lx, ly, lz, kind = 'candle' ) {
			const [ lxw, lzw ] = T( lx, lz );
			const wax = M( L.plain, [ 240, 230, 200 ], 1, F_IN );
			const flame = M( L.plain, [ 255, 170, 70 ], 1, F_IN | F_GLOW );
			if ( kind === 'lantern' ) {
				F.cyl( lx, ly, lz, 0.08, 0.04, 8, DARK ).cyl( lx, ly + 0.04, lz, 0.06, 0.16, 8, flame ).cyl( lx, ly + 0.2, lz, 0.07, 0.05, 8, DARK, 1, 0.02 );
				F.box( lx - 0.004, ly + 0.25, lz - 0.05, lx + 0.004, ly + 0.27, lz + 0.05, DARK );
			} else {
				F.cyl( lx, ly, lz, 0.035, 0.12, 6, wax ).cyl( lx, ly + 0.12, lz, 0.012, 0.035, 4, flame, 1, 0.002 );
				F.cyl( lx, ly, lz, 0.06, 0.012, 8, gloss( [ 200, 190, 170 ] ) );
			}
			O.lights.push( { x: lxw, y: y + ly + 0.15, z: lzw, kind } );
			return F;
		},
		// a soft contact shadow on the floor under the piece (a decal stretched over its footprint)
		shadow( x0, z0, x1, z1, k = 0.9 ) {
			const [ ax, az ] = T( x0 - 0.08, z0 - 0.08 ), [ bx, bz ] = T( x1 + 0.08, z0 - 0.08 ), [ cx, cz ] = T( x1 + 0.08, z1 + 0.08 ), [ dx, dz ] = T( x0 - 0.08, z1 + 0.08 );
			O.decalQuad( [ dx, y + 0.004, dz ], [ cx, y + 0.004, cz ], [ bx, y + 0.004, bz ], [ ax, y + 0.004, az ], 16, k );
			return F;
		},
	};
	return F;
}

export function legs( F, x0, z0, x1, z1, h, m, t = 0.05 ) {
	F.box( x0, 0, z0, x0 + t, h, z0 + t, m, 12 ).box( x1 - t, 0, z0, x1, h, z0 + t, m, 12 ).box( x0, 0, z1 - t, x0 + t, h, z1, m, 12 ).box( x1 - t, 0, z1 - t, x1, h, z1, m, 12 );
}

// a face of goods (the products or books layer: 4 rows of 0.4 m per repeat) from x0 to x1 and y0 to y1 at depth z,
// one random row of the texture per shelf (the array layers keep the canvas rows as painted: v grows down)
export function goods( F, x0, x1, y0, y1, z, layer = L.products, tint = [ 255, 255, 255 ] ) {
	const R = F.O.R, r = ( R() * 4 ) | 0, u = R() * 4;
	const m = M( layer, tint, 1, F_IN, { fit: [ u, ( r + 1 ) / 4 - 0.004, u + ( x1 - x0 ) / 1.2, r / 4 + ( 1 - Math.min( 1, ( y1 - y0 ) / 0.4 ) ) / 4 ] } );
	F.box( x0, y0, z - 0.01, x1, y1, z, { pz: m }, 1 + 2 + 4 + 8 + 32 );
}

// ---- small things (drawn into the fine mesh by the callers) -------------------------------------------------------

// a flat plate / bowl / mug / glass / can / bottle / box at (lx, ly, lz) of frame F (usually F.fine())
export function plate( F, lx, ly, lz, r = 0.12, c = [ 240, 240, 236 ] ) { F.cyl( lx, ly, lz, r * 0.7, 0.012, 10, gloss( c ), 1 ).cyl( lx, ly + 0.012, lz, r * 0.7, 0.012, 10, gloss( c ), 1, r ); }
export function bowl( F, lx, ly, lz, r = 0.08, c = [ 236, 236, 230 ] ) { F.cyl( lx, ly, lz, r * 0.55, 0.06, 8, gloss( c ), 3, r ); }
export function mug( F, lx, ly, lz, c = [ 230, 230, 224 ] ) { F.cyl( lx, ly, lz, 0.04, 0.095, 8, gloss( c ) ).box( lx + 0.035, ly + 0.025, lz - 0.006, lx + 0.06, ly + 0.075, lz + 0.006, gloss( c ) ); }
export function glassCup( F, lx, ly, lz ) { F.cyl( lx, ly, lz, 0.032, 0.11, 8, gloss( [ 190, 206, 210 ] ), 2, 0.036 ); }
export function can( F, lx, ly, lz, c = [ 200, 40, 36 ] ) { F.cyl( lx, ly, lz, 0.033, 0.115, 8, metal( c ) ).cyl( lx, ly + 0.115, lz, 0.03, 0.004, 8, STEEL, 1 ); }
export function tin( F, lx, ly, lz, c = [ 220, 180, 60 ] ) { F.cyl( lx, ly, lz, 0.038, 0.1, 8, metal( [ 200, 200, 204 ] ) ).cyl( lx, ly + 0.02, lz, 0.039, 0.06, 8, paint( c ), 0 ); }
export function bottle( F, lx, ly, lz, c = [ 60, 110, 50 ], h = 0.26 ) { F.cyl( lx, ly, lz, 0.035, h * 0.62, 8, gloss( c ) ).cyl( lx, ly + h * 0.62, lz, 0.035, h * 0.16, 8, gloss( c ), 0, 0.013 ).cyl( lx, ly + h * 0.78, lz, 0.013, h * 0.22, 6, gloss( c ) ); }
export function carton( F, lx, ly, lz, w, h, d, c, a = 0 ) { F.rbox( lx, ly + h / 2, lz, w / 2, h / 2, d / 2, paint( c ), a, 0, 0, 8 ); }
export function book( F, lx, ly, lz, a = 0, c = [ 120, 40, 40 ], w = 0.16, d = 0.23, t = 0.03 ) { F.rbox( lx, ly + t / 2, lz, w / 2, t / 2, d / 2, paint( c ), a, 0, 0, 8 ); F.rbox( lx + Math.cos( a ) * 0.006, ly + t / 2, lz - Math.sin( a ) * 0.006, w / 2 - 0.004, t / 2 - 0.004, d / 2 + 0.001, WHITE, a, 0, 0, 8 + 4 ); }
export function paperSheet( F, lx, ly, lz, a = 0 ) { F.rbox( lx, ly + 0.002, lz, 0.105, 0.002, 0.148, WHITE, a, 0, 0, 8 ); }

// a scatter of small things on a surface (local rect x0..x1, z0..z1 at height y): kinds from a list of makers
export function scatter( F, x0, z0, x1, z1, y, n, makers ) {
	const R = F.O.R, f = F.fine();
	for ( let i = 0; i < n; i ++ ) {
		const mk = makers[ ( R() * makers.length ) | 0 ];
		mk( f, x0 + R() * ( x1 - x0 ), y, z0 + R() * ( z1 - z0 ), R );
	}
}
// the usual makers for scatter()
export const SMALL = {
	plate: ( f, x, y, z ) => plate( f, x, y, z ),
	bowl: ( f, x, y, z, R ) => bowl( f, x, y, z, 0.08, R() < 0.5 ? [ 236, 236, 230 ] : [ 90, 130, 170 ] ),
	mug: ( f, x, y, z, R ) => mug( f, x, y, z, pickOf( R, [ [ 230, 230, 224 ], [ 180, 50, 40 ], [ 50, 90, 140 ], [ 40, 40, 40 ] ] ) ),
	glass: ( f, x, y, z ) => glassCup( f, x, y, z ),
	can: ( f, x, y, z, R ) => can( f, x, y, z, pickOf( R, [ [ 200, 40, 36 ], [ 40, 90, 170 ], [ 230, 200, 40 ], [ 40, 140, 70 ], [ 230, 230, 230 ] ] ) ),
	tin: ( f, x, y, z, R ) => tin( f, x, y, z, pickOf( R, [ [ 220, 180, 60 ], [ 190, 40, 40 ], [ 60, 120, 60 ], [ 230, 120, 40 ] ] ) ),
	bottle: ( f, x, y, z, R ) => bottle( f, x, y, z, pickOf( R, [ [ 60, 110, 50 ], [ 120, 70, 30 ], [ 200, 210, 214 ], [ 40, 40, 30 ], [ 220, 60, 40 ] ] ), 0.22 + R() * 0.1 ),
	box: ( f, x, y, z, R ) => carton( f, x, y, z, 0.12 + R() * 0.1, 0.18 + R() * 0.14, 0.06 + R() * 0.05, pickOf( R, [ [ 220, 60, 40 ], [ 240, 200, 60 ], [ 60, 110, 180 ], [ 240, 240, 230 ], [ 60, 150, 70 ] ] ), R() * 0.6 - 0.3 ),
	book: ( f, x, y, z, R ) => book( f, x, y, z, R() * 3, pickOf( R, [ [ 120, 40, 40 ], [ 40, 60, 110 ], [ 50, 90, 60 ], [ 200, 190, 160 ], [ 30, 30, 30 ] ] ) ),
	paper: ( f, x, y, z, R ) => paperSheet( f, x, y, z, R() * 3 ),
	pills: ( f, x, y, z, R ) => { f.cyl( x, y, z, 0.022, 0.07, 8, gloss( pickOf( R, [ [ 230, 130, 40 ], [ 240, 240, 236 ], [ 200, 60, 60 ] ] ) ) ).cyl( x, y + 0.07, z, 0.024, 0.02, 8, WHITE ); },
	phone: ( f, x, y, z, R ) => { f.rbox( x, y + 0.005, z, 0.035, 0.005, 0.075, SCREEN, R() * 3, 0, 0, 8 ); },
	remote: ( f, x, y, z, R ) => { f.rbox( x, y + 0.012, z, 0.025, 0.012, 0.09, PLASTIC, R() * 3, 0, 0, 8 ); },
	ashtray: ( f, x, y, z ) => { f.cyl( x, y, z, 0.06, 0.03, 8, gloss( [ 150, 160, 170 ] ), 1, 0.07 ); },
};
