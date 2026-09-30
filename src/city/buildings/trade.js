// Furniture of shops, restaurants, offices, hotels, police stations, hospitals and bases (worker side). Local frame per
// piece as in kit.js: origin on the floor at the wall, x along the wall, +z into the room.
import { L } from './data.js';
import { M } from './plan.js';
import { F_IN } from './geo.js';
import {
	paint, gloss, wood, metal, cloth, chrome, card, art, DARK, WHITE, BLACK, STEEL, CHROME, PORCELAIN, SCREEN, PLASTIC,
	SOFA, BLANKET, WOODS, CLOTHES, pickOf, legs, plate, mug, can, bottle, carton, scatter, SMALL,
} from './kit.js';
import { officeChair, chair } from './home.js';

const PRODUCT_COLS = [ [ 220, 60, 40 ], [ 240, 200, 60 ], [ 60, 110, 180 ], [ 240, 240, 230 ], [ 60, 150, 70 ], [ 230, 120, 40 ], [ 120, 60, 140 ], [ 200, 190, 170 ] ];

// ---- shelving ------------------------------------------------------------------------------------------------------------

// a shelf unit against a wall (or one face of a gondola): a steel frame, shelves with price rails, the goods as a
// textured face set back from the edge; raided gaps show as dark bays; some goods knocked onto the floor
export function shelves( F, w, h = 1.9, d = 0.45, face = 'products', loot = null, label = 'Shelf', cont = true, pSpot = 0.25, o = {} ) {
	const R = F.O.R;
	const fm = o.frame || ( face === 'books' ? wood( WOODS[ 3 ] ) : metal( [ 196, 198, 200 ] ) );
	const n = Math.max( 2, Math.round( h / 0.42 ) );
	F.box( - w / 2, 0, 0, w / 2, h, 0.02, fm, 8 );
	F.box( - w / 2, 0, 0, - w / 2 + 0.03, h, d, fm, 8 ).box( w / 2 - 0.03, 0, 0, w / 2, h, d, fm, 8 );
	F.box( - w / 2 + 0.03, 0, d - 0.05, w / 2 - 0.03, 0.1, d, fm, 8 );
	const rail = o.rail || paint( [ 240, 240, 236 ] );
	for ( let k = 1; k <= n; k ++ ) {
		const y = k * h / n;
		F.box( - w / 2 + 0.03, y - 0.02, 0, w / 2 - 0.03, y + 0.01, d, fm, 0 );
		if ( k < n && face !== 'books' ) F.box( - w / 2 + 0.03, y - 0.05, d - 0.005, w / 2 - 0.03, y - 0.01, d + 0.005, rail, 8 );
	}
	if ( face ) {
		const L2 = face === 'books' ? L.books : face === 'rx' ? L.products : L.products;
		const tm = M( L2, o.tint || [ 255, 255, 255 ], 1, F_IN, { fit: [ R() * 3, 0, R() * 3 + w / 1.2, h / 1.6 ], uo: 0 } );
		F.box( - w / 2 + 0.04, 0.1, 0.03, w / 2 - 0.04, h - 0.04, d - 0.08, { pz: tm }, 1 + 2 + 4 + 8 + 32 );
		// a few loose goods sitting forward on the shelves, and some on the floor in front
		const f = F.fine();
		for ( let k = 0; k < Math.round( w * 1.2 ); k ++ ) {
			const y = ( ( R() * ( n - 1 ) | 0 ) + 1 ) * h / n + 0.01;
			SMALL[ pickOf( R, o.small || [ 'box', 'can', 'tin', 'bottle' ] ) ]( f, ( R() - 0.5 ) * ( w - 0.2 ), y, d - 0.1, R );
		}
		if ( R() < ( o.mess ?? 0.45 ) ) for ( let k = 0; k < 2 + ( R() * 5 | 0 ); k ++ ) {
			const x = ( R() - 0.5 ) * w, z = d + 0.15 + R() * 0.7;
			R() < 0.5 ? f.cylH( x, 0.035, z, 0.033, 0.11, 8, metal( pickOf( R, PRODUCT_COLS ) ), R() < 0.5 ? 'x' : 'z' ) : carton( f, x, 0, z, 0.1 + R() * 0.12, 0.05 + R() * 0.05, 0.14 + R() * 0.1, pickOf( R, PRODUCT_COLS ), R() * 3 );
		}
	}
	// the collider stops short of the shelf edge so loose items on the boards stay reachable
	F.col( - w / 2, 0, 0, w / 2, h, d - 0.13, face === 'books' ? 1 : 2 );
	if ( cont && loot ) F.container( - w / 2, 0, 0, w / 2, h, d - 0.16, label, loot, 30 );
	if ( loot ) for ( let k = 1; k < n; k ++ ) F.spot( ( R() - 0.5 ) * ( w - 0.3 ), k * h / n + 0.01, d - 0.06, loot, pSpot );
	F.shadow( - w / 2, 0, w / 2, d, 0.6 );
	return F;
}

// a double-sided gondola along local x (both faces), end caps with stacked cases
export function gondola( F, len, h, loot, o = {} ) {
	const R = F.O.R;
	const A = F.at( 0, 0, 0, 0 ), B = F.at( 0, 0, 0, Math.PI );
	shelves( A, len, h, 0.45, 'products', loot, 'Shelf', true, 0.25, o );
	shelves( B, len, h, 0.45, 'products', loot, 'Shelf', false, 0.2, o );
	F.box( - len / 2, h, - 0.46, len / 2, h + 0.02, 0.46, metal( [ 196, 198, 200 ] ) );
	// end caps: a stack of cases or a pyramid of cans
	for ( const s of [ - 1, 1 ] ) {
		if ( R() < 0.35 ) continue;
		const E = F.at( s * ( len / 2 + 0.3 ), 0, 0, 0 );
		if ( R() < 0.5 ) { for ( let k = 0; k < 3; k ++ ) E.box( - 0.28, k * 0.3, - 0.3, 0.28, k * 0.3 + 0.29, 0.3, card() ); E.col( - 0.3, 0, - 0.3, 0.3, 0.9, 0.3, 1 ); }
		else { E.box( - 0.3, 0, - 0.35, 0.3, 0.4, 0.35, gloss( pickOf( R, PRODUCT_COLS ) ) ); const f = E.fine(); for ( let r = 0; r < 3; r ++ ) for ( let i = 0; i < 4 - r; i ++ ) for ( let j = 0; j < 3; j ++ ) can( f, - 0.15 + i * 0.1 + r * 0.05, 0.4 + r * 0.12, - 0.1 + j * 0.1, pickOf( R, PRODUCT_COLS ) ); E.col( - 0.3, 0, - 0.35, 0.3, 0.8, 0.35, 2 ); }
	}
	return F;
}

// glass-door coolers along a wall, drinks on the shelves behind the glass
export function coolers( F, w, loot = 'fridge' ) {
	const R = F.O.R;
	const n = Math.max( 1, Math.round( w / 0.8 ) ), cw = w / n;
	F.box( - w / 2, 0, 0, w / 2, 2.2, 0.75, metal( [ 200, 200, 202 ] ), 8 );
	const drinks = M( L.products, [ 255, 255, 255 ], 1, F_IN, { fit: [ 0.5, 0, 0.5 + cw / 1.2 * n, 1.8 / 1.6 ] } );
	F.box( - w / 2 + 0.03, 0.1, 0.2, w / 2 - 0.03, 1.95, 0.7, { pz: drinks }, 1 + 2 + 4 + 8 + 32 );
	F.box( - w / 2, 2.0, 0.72, w / 2, 2.2, 0.8, gloss( pickOf( R, [ [ 30, 90, 170 ], [ 200, 30, 30 ], [ 40, 40, 44 ] ] ) ) );
	for ( let i = 0; i < n; i ++ ) {
		const a = - w / 2 + i * cw;
		const open = R() < 0.2;
		F.box( a, 0.05, 0.75, a + 0.04, 2.0, 0.78, STEEL ).box( a + cw - 0.04, 0.05, 0.75, a + cw, 2.0, 0.78, STEEL );
		if ( open ) { F.rbox( a + 0.04 + Math.cos( 1.2 ) * ( cw - 0.08 ) / 2, 1.02, 0.78 + Math.sin( 1.2 ) * ( cw - 0.08 ) / 2, ( cw - 0.08 ) / 2, 0.95, 0.015, STEEL, - 1.2, 0, 0, 0 ); continue; }
		F.box( a + cw - 0.12, 0.9, 0.78, a + cw - 0.09, 1.3, 0.82, CHROME );
		const p = ( lx, ly ) => { const [ gx, gz ] = F.T( lx, 0.77 ); return [ gx, F.y + ly, gz ]; };
		F.O.glass.quad( p( a + 0.04, 0.05 ), p( a + cw - 0.04, 0.05 ), p( a + cw - 0.04, 2.0 ), p( a + 0.04, 2.0 ), [ Math.sin( F.rot ), 0, Math.cos( F.rot ) ] );
	}
	F.col( - w / 2, 0, 0, w / 2, 2.2, 0.8, 2 );
	for ( let i = 0; i < n; i += 2 ) F.container( - w / 2 + i * cw, 0, 0, - w / 2 + Math.min( n, i + 2 ) * cw, 2.1, 0.8, 'Cooler', loot, 30 );
	F.shadow( - w / 2, 0, w / 2, 0.8, 0.7 );
	return F;
}

// a chest freezer island, glass lids
export function chestFreezer( F, w = 2.0, loot = 'grocery' ) {
	F.box( - w / 2, 0, - 0.45, w / 2, 0.85, 0.45, gloss( [ 236, 236, 232 ] ), 8 ).box( - w / 2 + 0.05, 0.84, - 0.4, w / 2 - 0.05, 0.86, 0.4, DARK );
	const drinks = M( L.products, [ 200, 220, 255 ], 1, F_IN, { fit: [ 0, 0, w / 1.2, 0.6 ] } );
	F.box( - w / 2 + 0.06, 0.5, - 0.38, w / 2 - 0.06, 0.8, 0.38, { py: drinks }, 1 + 2 + 8 + 16 + 32 );
	const p = ( lx, lz ) => { const [ gx, gz ] = F.T( lx, lz ); return [ gx, F.y + 0.9, gz ]; };
	F.O.glass.quad( p( - w / 2, 0.45 ), p( w / 2, 0.45 ), p( w / 2, - 0.45 ), p( - w / 2, - 0.45 ), [ 0, 1, 0 ] );
	F.col( - w / 2, 0, - 0.45, w / 2, 0.9, 0.45, 2 );
	F.container( - w / 2, 0, - 0.45, w / 2, 0.9, 0.45, 'Freezer', loot, 30 );
	F.shadow( - w / 2, - 0.45, w / 2, 0.45, 0.7 );
	return F;
}

// a checkout: a counter with a belt, the register and a card reader, a rack of sweets at the end
export function checkout( F, len = 2.4, loot = 'convenience' ) {
	const R = F.O.R;
	const body = gloss( pickOf( R, [ [ 70, 76, 86 ], [ 200, 196, 186 ], [ 120, 40, 36 ] ] ) );
	F.box( - len / 2, 0, 0, len / 2, 0.86, 0.62, body, 8 ).box( - len / 2, 0.86, 0.02, len / 2 - 0.5, 0.88, 0.5, BLACK ).box( len / 2 - 0.5, 0.86, 0, len / 2, 0.9, 0.62, STEEL );
	F.box( - len / 2, 0.86, 0.5, len / 2 - 0.5, 0.92, 0.62, STEEL );
	// register on a post, the card reader, a bagging carousel
	F.box( len / 2 - 0.4, 0.9, 0.3, len / 2 - 0.1, 1.0, 0.55, PLASTIC ).rbox( len / 2 - 0.25, 1.15, 0.45, 0.16, 0.12, 0.02, SCREEN, 0, 0.3 ).box( len / 2 - 0.27, 1.0, 0.44, len / 2 - 0.23, 1.05, 0.47, BLACK );
	F.fine().box( len / 2 - 0.58, 0.9, 0.55, len / 2 - 0.48, 1.05, 0.6, PLASTIC ).box( - len / 2 + 0.2, 0.88, - 0.35, - len / 2 + 0.24, 1.2, - 0.31, CHROME );
	F.cyl( len / 2 - 0.2, 0, - 0.2, 0.025, 1.6, 6, CHROME ).box( len / 2 - 0.3, 1.6, - 0.24, len / 2 - 0.1, 1.8, - 0.16, gloss( [ 30, 30, 34 ] ) );
	// sweets rack facing the queue
	const S = F.at( - len / 2 + 0.3, 0, - 0.1, Math.PI );
	S.box( - 0.3, 0, 0, 0.3, 1.3, 0.25, metal( [ 200, 200, 204 ] ) ).box( - 0.28, 0.1, 0.25, 0.28, 1.25, 0.251, M( L.products, [ 255, 255, 255 ], 1, F_IN, { fit: [ 1, 0, 1.5, 0.8 ] } ) );
	F.col( - len / 2, 0, 0, len / 2, 0.92, 0.62, 1 );
	F.container( len / 2 - 0.4, 0.86, 0.3, len / 2 - 0.1, 1.0, 0.55, 'Register', loot, 4, { n: 1, empty: 0.5 } );
	F.spot( 0, 0.88, 0.3, loot, 0.4 );
	F.shadow( - len / 2, 0, len / 2, 0.62, 0.6 );
	return F;
}

// a shopping cart (or on its side)
export function cart( F, tipped = false ) {
	const m = chrome( [ 190, 192, 196 ] ), red = gloss( [ 190, 30, 30 ] );
	const G = tipped ? F.at( 0, 0.33, 0, 0 ) : F;
	const bars = ( x0, y0, z0, x1, y1, z1 ) => G.box( x0, y0, z0, x1, y1, z1, m, 0 );
	const tilt = tipped ? Math.PI / 2 : 0;
	if ( tipped ) {
		F.rbox( 0, 0.3, 0, 0.3, 0.02, 0.45, m, 0, 0, tilt ).rbox( 0, 0.3, 0.45, 0.3, 0.3, 0.012, m, 0, 0, tilt ).rbox( 0, 0.3, - 0.45, 0.3, 0.3, 0.012, m, 0, 0, tilt ).rbox( 0.3, 0.3, 0, 0.012, 0.3, 0.45, m, 0, 0, tilt ).rbox( - 0.3, 0.02, 0, 0.012, 0.012, 0.45, m );
		return F;
	}
	void bars;
	// basket: floor, sides as wire grids (thin bars)
	F.box( - 0.26, 0.45, - 0.42, 0.26, 0.47, 0.42, m );
	for ( let k = 0; k < 5; k ++ ) { const y = 0.47 + k * 0.1; F.box( - 0.28, y, - 0.44, 0.28, y + 0.012, - 0.43, m ).box( - 0.28, y, 0.43, 0.28, y + 0.012, 0.44, m ).box( - 0.28, y, - 0.44, - 0.27, y + 0.012, 0.44, m ).box( 0.27, y, - 0.44, 0.28, y + 0.012, 0.44, m ); }
	for ( let k = 0; k < 7; k ++ ) { const z = - 0.42 + k * 0.14; F.box( - 0.285, 0.45, z, - 0.275, 0.9, z + 0.012, m ).box( 0.275, 0.45, z, 0.285, 0.9, z + 0.012, m ); }
	F.box( - 0.28, 0.9, 0.44, 0.28, 1.0, 0.47, red ).box( - 0.26, 0.05, - 0.4, - 0.24, 0.45, - 0.38, m ).box( 0.24, 0.05, - 0.4, 0.26, 0.45, - 0.38, m ).box( - 0.26, 0.05, 0.38, - 0.24, 0.45, 0.4, m ).box( 0.24, 0.05, 0.38, 0.26, 0.45, 0.4, m );
	for ( const [ x, z ] of [ [ - 0.25, - 0.39 ], [ 0.25, - 0.39 ], [ - 0.25, 0.39 ], [ 0.25, 0.39 ] ] ) F.cyl( x, 0, z, 0.04, 0.05, 6, BLACK );
	F.col( - 0.3, 0, - 0.45, 0.3, 1.0, 0.47, 2, 2 );
	return F;
}

// ---- guns --------------------------------------------------------------------------------------------------------------

// a long gun on a wall rack (x along the wall, standing up), or lying flat in a case
function rifle( F, x, y0, z, kind, R ) {
	const blk = BLACK, stock = kind === 0 ? wood( [ 110, 70, 40 ] ) : kind === 1 ? paint( [ 40, 40, 38 ] ) : paint( [ 150, 130, 90 ] );
	F.box( x - 0.022, y0, z - 0.03, x + 0.022, y0 + 0.36, z + 0.05, stock );
	F.box( x - 0.018, y0 + 0.36, z - 0.02, x + 0.018, y0 + 0.62, z + 0.035, blk );
	F.box( x - 0.01, y0 + 0.62, z - 0.005, x + 0.01, y0 + 1.1 + R() * 0.12, z + 0.015, blk );
	if ( kind === 1 ) F.box( x - 0.015, y0 + 0.42, z + 0.035, x + 0.015, y0 + 0.55, z + 0.1, blk );
	if ( R() < 0.5 ) F.box( x - 0.02, y0 + 0.66, z - 0.06, x + 0.02, y0 + 0.86, z - 0.02, blk );
}

// a wall rack of long guns, behind the counter; gaps where they were taken
export function rifleRack( F, w, loot, label = 'Gun rack' ) {
	const R = F.O.R;
	const m = wood( [ 110, 76, 48 ] );
	F.box( - w / 2, 0.85, 0, w / 2, 2.25, 0.03, m ).box( - w / 2, 0.85, 0.03, w / 2, 0.95, 0.22, m ).box( - w / 2, 1.75, 0.03, w / 2, 1.8, 0.14, m );
	const f = F.fine();
	const n = Math.floor( ( w - 0.1 ) / 0.2 );
	for ( let i = 0; i < n; i ++ ) {
		if ( R() < 0.35 ) continue;
		rifle( f, - w / 2 + 0.15 + i * 0.2, 0.95, 0.1, ( R() * 3 ) | 0, R );
	}
	F.col( - w / 2, 0.85, 0, w / 2, 2.25, 0.25, 1 );
	F.container( - w / 2, 0.85, 0, w / 2, 2.25, 0.3, label, loot, 60 );
	return F;
}

// a glass display counter; handguns and boxes on the felt, the glass smashed sometimes
export function gunCase( F, w, loot ) {
	const R = F.O.R;
	const m = paint( [ 50, 42, 36 ] );
	F.box( - w / 2, 0, 0, w / 2, 0.6, 0.62, m, 8 );
	F.box( - w / 2, 0.6, 0, w / 2, 0.62, 0.62, cloth( [ 30, 60, 40 ] ) );
	F.box( - w / 2, 0.62, 0, - w / 2 + 0.03, 1.0, 0.62, CHROME ).box( w / 2 - 0.03, 0.62, 0, w / 2, 1.0, 0.62, CHROME ).box( - w / 2, 0.98, 0.59, w / 2, 1.0, 0.62, CHROME ).box( - w / 2, 0.98, 0, w / 2, 1.0, 0.03, CHROME );
	const smashed = R() < 0.3;
	const f = F.fine();
	for ( let i = 0; i < Math.floor( w / 0.3 ); i ++ ) {
		if ( R() < ( smashed ? 0.6 : 0.25 ) ) continue;
		const x = - w / 2 + 0.2 + i * 0.3, z = 0.2 + R() * 0.25;
		// a pistol: slide, grip
		const P = f.at( x, 0.62, z, R() * 0.4 - 0.2 );
		P.box( - 0.1, 0.0, - 0.015, 0.08, 0.035, 0.015, BLACK ).box( - 0.1, 0.0, - 0.012, - 0.04, 0.02, 0.012, paint( [ 60, 44, 30 ] ) ).rbox( - 0.08, 0.012, 0.05, 0.03, 0.012, 0.05, BLACK, 0.3 );
	}
	for ( let i = 0; i < 3; i ++ ) if ( R() < 0.5 ) carton( f, ( R() - 0.5 ) * ( w - 0.3 ), 0.62, 0.45, 0.12, 0.06, 0.08, pickOf( R, [ [ 200, 60, 30 ], [ 40, 90, 60 ], [ 220, 200, 60 ] ] ), R() );
	const p = ( lx, ly, lz ) => { const [ gx, gz ] = F.T( lx, lz ); return [ gx, F.y + ly, gz ]; };
	F.O.glass.quad( p( - w / 2, 0.62, 0.62 ), p( w / 2, 0.62, 0.62 ), p( w / 2, 0.98, 0.62 ), p( - w / 2, 0.98, 0.62 ), [ Math.sin( F.rot ), 0, Math.cos( F.rot ) ] );
	if ( ! smashed ) F.O.glass.quad( p( - w / 2, 0.99, 0 ), p( - w / 2, 0.99, 0.62 ), p( w / 2, 0.99, 0.62 ), p( w / 2, 0.99, 0 ), [ 0, 1, 0 ] );
	else F.O.decalAt( F, 0, 1.0, 1.4, 'glass' );
	F.col( - w / 2, 0, 0, w / 2, 1.0, 0.62, 3 );
	F.container( - w / 2, 0, 0, w / 2, 1.0, 0.62, 'Display case', loot, 24, { empty: smashed ? 0.5 : 0.2 } );
	F.shadow( - w / 2, 0, w / 2, 0.62, 0.6 );
	return F;
}

export function gunSafe( F, loot = 'gun_safe' ) {
	const m = metal( [ 60, 64, 62 ] );
	F.box( - 0.4, 0, 0, 0.4, 1.55, 0.62, m );
	F.box( - 0.36, 0.05, 0.62, 0.36, 1.5, 0.635, paint( [ 40, 42, 40 ] ) );
	F.cyl( 0.15, 0.85, 0.635, 0.09, 0.03, 12, CHROME ).box( 0.12, 0.6, 0.635, 0.3, 0.63, 0.66, CHROME );
	F.col( - 0.4, 0, 0, 0.4, 1.55, 0.62, 2 );
	F.container( - 0.4, 0, 0, 0.4, 1.55, 0.64, 'Gun safe', loot, 50, { locked: 2, empty: 0.1 } );
	F.shadow( - 0.4, 0, 0.4, 0.62, 0.9 );
	return F;
}

// ammo boxes on steel shelves
export function ammoShelf( F, w, loot ) {
	const R = F.O.R;
	shelves( F, w, 1.8, 0.4, null, loot, 'Shelf', true, 0.3 );
	const f = F.fine();
	for ( let k = 1; k < 4; k ++ ) {
		let x = - w / 2 + 0.08;
		while ( x < w / 2 - 0.15 ) {
			if ( R() < 0.3 ) { x += 0.2; continue; }
			const c = pickOf( R, [ [ 200, 60, 30 ], [ 40, 90, 60 ], [ 220, 200, 60 ], [ 40, 40, 44 ], [ 90, 100, 60 ] ] );
			const bh = 0.06 + R() * 0.06;
			for ( let j = 0; j < 1 + ( R() * 3 | 0 ); j ++ ) carton( f, x + 0.06, k * 0.45 + 0.01 + j * bh, 0.2, 0.12, bh, 0.08, c );
			x += 0.14;
		}
	}
	return F;
}

// ---- clothes shops ---------------------------------------------------------------------------------------------------------

// a round rack of hanging clothes
export function roundRack( F, loot ) {
	const R = F.O.R;
	F.cyl( 0, 0, 0, 0.25, 0.03, 10, CHROME ).cyl( 0, 0.03, 0, 0.02, 1.25, 6, CHROME ).cyl( 0, 1.25, 0, 0.55, 0.02, 14, CHROME, 0 );
	const f = F.fine();
	for ( let k = 0; k < 18; k ++ ) {
		if ( R() < 0.3 ) continue;
		const a = k / 18 * Math.PI * 2;
		f.rbox( Math.cos( a ) * 0.55, 0.92, Math.sin( a ) * 0.55, 0.012, 0.32, 0.2, cloth( pickOf( R, CLOTHES ) ), - a + Math.PI / 2 );
	}
	F.col( - 0.6, 0, - 0.6, 0.6, 1.3, 0.6, 1, 2 );
	F.spot( 0.3, 0.02, 0.6, loot, 0.3 );
	return F;
}
// a straight rail of clothes on hangers
export function clothesRail( F, w, loot ) {
	const R = F.O.R;
	F.box( - w / 2, 0, 0.2, - w / 2 + 0.03, 1.5, 0.23, CHROME ).box( w / 2 - 0.03, 0, 0.2, w / 2, 1.5, 0.23, CHROME ).box( - w / 2, 1.47, 0.2, w / 2, 1.5, 0.23, CHROME );
	F.box( - w / 2 - 0.1, 0, 0.1, - w / 2 + 0.13, 0.03, 0.33, CHROME ).box( w / 2 - 0.13, 0, 0.1, w / 2 + 0.1, 0.03, 0.33, CHROME );
	const f = F.fine();
	for ( let k = 0; k < Math.floor( ( w - 0.1 ) / 0.1 ); k ++ ) if ( R() < 0.7 ) f.box( - w / 2 + 0.06 + k * 0.1, 0.6 + R() * 0.25, 0.02, - w / 2 + 0.085 + k * 0.1, 1.45, 0.42, cloth( pickOf( R, CLOTHES ) ) );
	F.col( - w / 2, 0, 0, w / 2, 1.5, 0.45, 1, 2 );
	F.spot( 0, 0.02, 0.8, loot, 0.3 );
	return F;
}
// wall shelving of folded clothes (stacks of colours)
export function foldedShelf( F, w, loot ) {
	const R = F.O.R;
	shelves( F, w, 2.0, 0.45, null, loot, 'Shelf', true, 0.2, { frame: wood( WOODS[ 4 ] ) } );
	const f = F.fine();
	for ( let k = 0; k < 5; k ++ ) {
		const y = k * 0.4 + 0.1;
		for ( let x = - w / 2 + 0.12; x < w / 2 - 0.15; x += 0.3 ) {
			if ( R() < 0.25 ) continue;
			const c = cloth( pickOf( R, CLOTHES ) ), n = 2 + ( R() * 5 | 0 );
			f.box( x, y, 0.06, x + 0.26, y + n * 0.035, 0.38, c );
		}
	}
	return F;
}
// a shop mannequin (sometimes knocked over)
export function mannequin( F, o = {} ) {
	const R = F.O.R;
	const skin = gloss( [ 236, 236, 232 ] ), top = cloth( pickOf( R, CLOTHES ) ), bottom = cloth( pickOf( R, CLOTHES ) );
	if ( R() < 0.3 ) {
		F.cyl( 0, 0, 0, 0.18, 0.02, 10, CHROME );
		const G = F.at( 0.9, 0.12, 0, R() * 3 );
		G.rbox( 0, 0, 0, 0.28, 0.1, 0.16, top ).rbox( - 0.45, 0, 0.08, 0.2, 0.07, 0.07, bottom ).rbox( - 0.45, 0, - 0.08, 0.2, 0.07, 0.07, bottom ).rbox( 0.38, 0, 0, 0.1, 0.1, 0.09, skin );
		return F;
	}
	F.cyl( 0, 0, 0, 0.18, 0.02, 10, CHROME ).cyl( 0, 0.02, 0, 0.015, 0.25, 6, CHROME );
	F.box( - 0.1, 0.27, - 0.07, - 0.02, 0.95, 0.07, bottom ).box( 0.02, 0.27, - 0.07, 0.1, 0.95, 0.07, bottom );
	F.box( - 0.18, 0.95, - 0.1, 0.18, 1.45, 0.1, top ).box( - 0.26, 1.0, - 0.05, - 0.18, 1.42, 0.05, top ).box( 0.18, 1.0, - 0.05, 0.26, 1.42, 0.05, top );
	F.cyl( 0, 1.45, 0, 0.04, 0.08, 6, skin ).box( - 0.09, 1.53, - 0.1, 0.09, 1.76, 0.1, skin );
	F.col( - 0.25, 0, - 0.12, 0.25, 1.76, 0.12, 1, 2 );
	void o;
	return F;
}

// ---- food and drink ------------------------------------------------------------------------------------------------------------

// a booth against the wall: two high-backed benches facing each other across a table (x along the wall)
export function booth( F, loot, o = {} ) {
	const R = F.O.R;
	const up = cloth( o.c || pickOf( R, [ [ 150, 30, 30 ], [ 40, 70, 110 ], [ 60, 100, 70 ], [ 170, 120, 50 ] ] ), 0.6 ), fr = wood( WOODS[ 3 ] );
	for ( const s of [ - 1, 1 ] ) {
		const B = F.at( s * 0.72, 0, 0.6, s < 0 ? - Math.PI / 2 : Math.PI / 2 );
		B.box( - 0.6, 0, - 0.25, 0.6, 0.42, 0.25, fr ).box( - 0.6, 0.42, - 0.25, 0.6, 0.5, 0.25, up ).box( - 0.6, 0.5, 0.17, 0.6, 1.15, 0.27, up ).box( - 0.6, 1.15, 0.15, 0.6, 1.2, 0.3, fr );
		B.col( - 0.6, 0, - 0.25, 0.6, 1.2, 0.3, 1, 2 );
	}
	F.box( - 0.35, 0.72, 0.12, 0.35, 0.76, 1.08, M( L.terrazzo, [ 230, 226, 216 ], 1.5, F_IN ) ).box( - 0.04, 0, 0.55, 0.04, 0.72, 0.65, CHROME ).box( - 0.2, 0, 0.45, 0.2, 0.02, 0.75, CHROME );
	F.col( - 0.35, 0, 0.12, 0.35, 0.76, 1.08, 1, 2 );
	const f = F.fine();
	f.box( - 0.05, 0.76, 0.2, 0.05, 0.86, 0.26, CHROME );
	bottle( f, 0.1, 0.76, 0.22, [ 180, 30, 20 ], 0.18 ); bottle( f, 0.16, 0.76, 0.22, [ 230, 190, 40 ], 0.18 );
	for ( const s of [ - 1, 1 ] ) if ( R() < 0.6 ) { plate( f, s * 0.2, 0.76, 0.6 + ( R() - 0.5 ) * 0.3 ); if ( R() < 0.6 ) SMALL.glass( f, s * 0.22, 0.76, 0.85 ); }
	F.spot( 0, 0.76, 0.7, loot, 0.4 );
	F.shadow( - 1.0, 0, 1.0, 1.2, 0.6 );
	return F;
}

export function barStool( F, c = [ 130, 30, 30 ] ) {
	F.cyl( 0, 0, 0, 0.18, 0.02, 10, CHROME ).cyl( 0, 0.02, 0, 0.025, 0.7, 6, CHROME ).cyl( 0, 0.7, 0, 0.19, 0.07, 12, cloth( c ) );
	F.cyl( 0, 0.28, 0, 0.16, 0.015, 10, CHROME, 0 );
	F.col( - 0.19, 0, - 0.19, 0.19, 0.77, 0.19, 1, 2 );
	return F;
}

export function poolTable( F ) {
	const R = F.O.R;
	const wd = wood( [ 90, 56, 34 ] ), felt = cloth( [ 30, 100, 60 ], 0.5 );
	F.box( - 1.25, 0.66, - 0.7, 1.25, 0.8, 0.7, wd ).box( - 1.13, 0.8, - 0.58, 1.13, 0.81, 0.58, felt );
	F.box( - 1.25, 0.8, - 0.7, 1.25, 0.86, - 0.58, wd ).box( - 1.25, 0.8, 0.58, 1.25, 0.86, 0.7, wd ).box( - 1.25, 0.8, - 0.58, - 1.13, 0.86, 0.58, wd ).box( 1.13, 0.8, - 0.58, 1.25, 0.86, 0.58, wd );
	for ( const [ x, z ] of [ [ - 1.05, - 0.5 ], [ 1.05, - 0.5 ], [ - 1.05, 0.5 ], [ 1.05, 0.5 ] ] ) F.box( x - 0.07, 0, z - 0.07, x + 0.07, 0.66, z + 0.07, wd );
	const f = F.fine();
	for ( let k = 0; k < 9; k ++ ) f.cyl( ( R() - 0.5 ) * 2, 0.81, ( R() - 0.5 ) * 1.0, 0.028, 0.05, 6, gloss( pickOf( R, [ [ 240, 240, 236 ], [ 220, 190, 40 ], [ 30, 60, 160 ], [ 190, 30, 30 ], [ 90, 30, 110 ], [ 230, 110, 30 ], [ 20, 20, 20 ] ] ) ) );
	f.rbox( 0.2, 0.83, 0.1, 0.72, 0.01, 0.01, wood( [ 200, 170, 120 ] ), R() );
	F.col( - 1.25, 0, - 0.7, 1.25, 0.86, 0.7, 1, 2 );
	F.shadow( - 1.25, - 0.7, 1.25, 0.7, 0.8 );
	return F;
}

// the menu over a counter, a soda fountain, a coffee machine
export function menuBoard( F, w, y = 2.0 ) {
	const n = Math.max( 1, Math.round( w / 0.8 ) );
	for ( let k = 0; k < n; k ++ ) F.box( - w / 2 + k * w / n + 0.02, y, 0.01, - w / 2 + ( k + 1 ) * w / n - 0.02, y + 0.6, 0.04, art( 12 ) );
	return F;
}
export function sodaFountain( F ) {
	F.box( - 0.35, 0.95, 0.05, 0.35, 1.65, 0.6, gloss( [ 30, 30, 34 ] ) ).box( - 0.3, 1.3, 0.6, 0.3, 1.6, 0.605, art( 8 ) ).box( - 0.33, 0.95, 0.35, 0.33, 1.0, 0.62, STEEL );
	for ( let k = 0; k < 4; k ++ ) F.box( - 0.27 + k * 0.17, 1.15, 0.58, - 0.21 + k * 0.17, 1.25, 0.62, BLACK );
	F.col( - 0.35, 0.95, 0.05, 0.35, 1.65, 0.62, 2 );
	return F;
}

// ---- offices ------------------------------------------------------------------------------------------------------------------

// a cubicle: two fabric partitions and the desk inside (opening towards local +z)
export function cubicle( F, w = 2.4, d = 2.2, deskFn ) {
	const R = F.O.R;
	const pm = cloth( pickOf( R, [ [ 120, 124, 130 ], [ 110, 120, 110 ], [ 140, 130, 120 ], [ 90, 100, 120 ] ] ) ), trim = paint( [ 70, 72, 76 ] );
	F.box( - w / 2, 0, 0, w / 2, 1.4, 0.05, pm ).box( - w / 2, 0, 0.05, - w / 2 + 0.05, 1.4, d, pm );
	F.box( - w / 2, 1.4, - 0.005, w / 2, 1.43, 0.055, trim ).box( - w / 2 - 0.005, 1.4, 0.05, - w / 2 + 0.055, 1.43, d, trim );
	// pinned papers, a calendar
	const f = F.fine();
	for ( let k = 0; k < 3; k ++ ) if ( R() < 0.7 ) f.box( - w / 2 + 0.3 + R() * ( w - 0.8 ), 0.95 + R() * 0.3, 0.05, - w / 2 + 0.5 + R() * ( w - 0.8 ), 1.2 + R() * 0.1, 0.052, k === 0 ? art( 13 ) : WHITE );
	F.col( - w / 2, 0, 0, w / 2, 1.43, 0.05, 1 ).col( - w / 2, 0, 0.05, - w / 2 + 0.05, 1.43, d, 1 );
	deskFn( F.at( 0.1, 0, 0.05, 0 ), Math.min( 1.6, w - 0.4 ) );
	return F;
}

export function filing( F, loot, o = {} ) {
	const R = F.O.R;
	const m = metal( o.c || [ 150, 154, 150 ] );
	F.box( - 0.25, 0, 0, 0.25, 1.33, 0.62, m );
	const open = R() < 0.3 ? ( R() * 4 ) | 0 : - 1;
	for ( let k = 0; k < 4; k ++ ) {
		const y = 0.05 + k * 0.32;
		if ( k === open ) { F.box( - 0.23, y + 0.02, 0.62, 0.23, y + 0.3, 0.98, m ).box( - 0.21, y + 0.28, 0.62, 0.21, y + 0.3, 0.96, DARK ); F.fine().box( - 0.2, y + 0.03, 0.64, 0.2, y + 0.28, 0.95, gloss( [ 220, 200, 140 ] ) ); continue; }
		F.box( - 0.23, y + 0.01, 0.62, 0.23, y + 0.31, 0.625, m ).box( - 0.07, y + 0.22, 0.625, 0.07, y + 0.24, 0.645, CHROME ).box( - 0.04, y + 0.25, 0.625, 0.04, y + 0.28, 0.628, WHITE );
	}
	F.col( - 0.25, 0, 0, 0.25, 1.33, 0.62, 2 );
	F.container( - 0.25, 0, 0, 0.25, 1.33, 0.62, 'Filing cabinet', loot, 20 );
	F.spot( 0, 1.33, 0.3, loot, 0.2 );
	F.shadow( - 0.25, 0, 0.25, 0.62, 0.8 );
	return F;
}

export function waterCooler( F ) {
	F.box( - 0.16, 0, 0, 0.16, 1.0, 0.32, gloss( [ 236, 236, 232 ] ) ).box( - 0.08, 0.72, 0.32, 0.08, 0.8, 0.34, BLACK );
	F.cyl( 0, 1.0, 0.16, 0.13, 0.36, 12, gloss( [ 120, 170, 210 ] ), 3, 0.12 ).cyl( 0, 1.36, 0.16, 0.05, 0.05, 8, gloss( [ 120, 170, 210 ] ) );
	F.col( - 0.16, 0, 0, 0.16, 1.4, 0.32, 2, 2 );
	return F;
}

export function copier( F, loot = 'office' ) {
	F.box( - 0.4, 0, 0, 0.4, 0.95, 0.65, gloss( [ 220, 220, 216 ] ) ).box( - 0.38, 0.95, 0.02, 0.38, 1.05, 0.62, gloss( [ 200, 200, 196 ] ) ).box( 0.1, 1.05, 0.45, 0.35, 1.07, 0.6, SCREEN );
	for ( let k = 0; k < 3; k ++ ) F.box( - 0.38, 0.1 + k * 0.25, 0.65, 0.38, 0.105 + k * 0.25, 0.655, DARK );
	F.box( 0.4, 0.8, 0.1, 0.62, 0.82, 0.55, gloss( [ 200, 200, 196 ] ) );
	F.fine().box( 0.42, 0.82, 0.14, 0.6, 0.86, 0.5, WHITE );
	F.col( - 0.4, 0, 0, 0.62, 1.07, 0.65, 2 );
	F.container( - 0.4, 0, 0, 0.4, 0.95, 0.65, 'Copier', loot, 6, { n: 1, empty: 0.6 } );
	return F;
}

export function whiteboard( F, w, y = 0.9 ) {
	F.box( - w / 2, y, 0, w / 2, y + 1.1, 0.03, gloss( [ 244, 244, 242 ] ) ).box( - w / 2, y - 0.03, 0, w / 2, y, 0.08, metal( [ 180, 180, 184 ] ) );
	F.box( - w / 2 + 0.1, y + 0.1, 0.03, - w / 2 + 0.1 + Math.min( 1.1, w * 0.45 ), y + 1.0, 0.032, art( 15 ) );
	return F;
}

export function meetingTable( F, w, d, loot ) {
	const R = F.O.R;
	const m = wood( pickOf( R, [ [ 90, 64, 44 ], [ 180, 150, 110 ], [ 60, 50, 44 ] ] ) );
	F.box( - w / 2, 0.72, - d / 2, w / 2, 0.76, d / 2, m ).box( - w / 2 + 0.3, 0, - 0.1, - w / 2 + 0.45, 0.72, 0.1, m ).box( w / 2 - 0.45, 0, - 0.1, w / 2 - 0.3, 0.72, 0.1, m );
	F.col( - w / 2, 0, - d / 2, w / 2, 0.76, d / 2, 1, 2 );
	const n = Math.max( 1, Math.floor( w / 0.75 ) );
	for ( let i = 0; i < n; i ++ ) for ( const s of [ - 1, 1 ] ) {
		const x = - w / 2 + ( i + 0.5 ) * w / n;
		officeChair( F.at( x + ( R() - 0.5 ) * 0.2, 0, s * ( d / 2 + 0.3 + R() * 0.2 ), s < 0 ? ( R() - 0.5 ) * 0.6 : Math.PI + ( R() - 0.5 ) * 0.6 ), R() < 0.1 );
	}
	scatter( F, - w / 2 + 0.2, - d / 2 + 0.15, w / 2 - 0.2, d / 2 - 0.15, 0.76, 3 + ( R() * 4 | 0 ), [ SMALL.paper, SMALL.paper, SMALL.mug, SMALL.glass, SMALL.bottle, SMALL.phone ] );
	F.spot( 0, 0.76, 0, loot, 0.5 );
	F.shadow( - w / 2, - d / 2, w / 2, d / 2, 0.5 );
	return F;
}

export function vending( F, loot = 'convenience' ) {
	const R = F.O.R;
	const c = pickOf( R, [ [ 190, 30, 30 ], [ 30, 70, 150 ], [ 40, 40, 44 ] ] );
	const smashed = R() < 0.35;
	F.box( - 0.45, 0, 0, 0.45, 1.85, 0.8, gloss( c ) );
	F.box( - 0.4, 0.5, 0.8, 0.18, 1.75, 0.805, M( L.products, [ 255, 255, 255 ], 1, F_IN, { fit: [ 2, 0, 2.5, 1.2 ] } ) );
	F.box( 0.22, 1.1, 0.8, 0.4, 1.5, 0.81, BLACK ).box( - 0.4, 0.15, 0.8, 0.18, 0.4, 0.81, BLACK );
	if ( ! smashed ) { const p = ( lx, ly ) => { const [ gx, gz ] = F.T( lx, 0.83 ); return [ gx, F.y + ly, gz ]; }; F.O.glass.quad( p( - 0.42, 0.48 ), p( 0.2, 0.48 ), p( 0.2, 1.77 ), p( - 0.42, 1.77 ), [ Math.sin( F.rot ), 0, Math.cos( F.rot ) ] ); }
	else F.O.decalAt( F, 0, 1.1, 1.2, 'glass' );
	F.col( - 0.45, 0, 0, 0.45, 1.85, 0.82, 2 );
	F.container( - 0.45, 0, 0, 0.45, 1.85, 0.82, 'Vending machine', loot, 20, { locked: smashed ? 0 : 1, empty: 0.3 } );
	F.shadow( - 0.45, 0, 0.45, 0.8, 0.9 );
	return F;
}

// ---- hospitals -----------------------------------------------------------------------------------------------------------------

export function hospitalBed( F, loot = 'hospital', o = {} ) {
	const R = F.O.R;
	const fm = metal( [ 210, 212, 214 ] ), sheet = cloth( [ 230, 234, 236 ] ), blanket = cloth( pickOf( R, [ [ 150, 190, 210 ], [ 200, 210, 190 ], [ 230, 230, 226 ] ] ) );
	const w = 0.95, len = 2.05;
	F.box( - w / 2 - 0.02, 0.2, 0, w / 2 + 0.02, 1.0, 0.05, gloss( [ 200, 206, 210 ] ) ).box( - w / 2 - 0.02, 0.2, len - 0.05, w / 2 + 0.02, 0.75, len, gloss( [ 200, 206, 210 ] ) );
	F.box( - w / 2, 0.38, 0.05, w / 2, 0.46, len - 0.05, fm );
	for ( const [ x, z ] of [ [ - w / 2 + 0.05, 0.1 ], [ w / 2 - 0.05, 0.1 ], [ - w / 2 + 0.05, len - 0.1 ], [ w / 2 - 0.05, len - 0.1 ] ] ) F.box( x - 0.02, 0.06, z - 0.02, x + 0.02, 0.38, z + 0.02, fm ).cyl( x, 0, z, 0.05, 0.06, 8, BLACK );
	// the head raised, mattress, sheet, a blanket thrown back; the rails
	F.box( - w / 2 + 0.03, 0.46, 0.7, w / 2 - 0.03, 0.6, len - 0.07, sheet );
	F.rbox( 0, 0.72, 0.4, w / 2 - 0.03, 0.07, 0.34, sheet, 0, - 0.5 );
	F.rbox( 0, 0.95, 0.22, 0.28, 0.06, 0.13, sheet, 0, - 0.5 );
	F.rbox( 0, 0.63, 1.5, w / 2, 0.03, 0.5, blanket, R() * 0.2 - 0.1 );
	for ( const s of [ - 1, 1 ] ) if ( R() < 0.7 ) F.box( s * ( w / 2 + 0.01 ) - 0.01, 0.62, 0.35, s * ( w / 2 + 0.01 ) + 0.01, 0.82, 1.3, fm ).box( s * ( w / 2 + 0.01 ) - 0.015, 0.8, 0.35, s * ( w / 2 + 0.01 ) + 0.015, 0.83, 1.3, fm );
	F.col( - w / 2, 0, 0, w / 2, 0.62, len, 2, 2 );
	F.bed( - w / 2, 0, 0, w / 2, 0.62, len, 0.9, 'Sleep' );
	// privacy curtain on a ceiling rail, drawn part way
	F.box( - w / 2 - 0.3, 2.35, - 0.02, - w / 2 - 0.28, 2.38, len + 0.3, CHROME );
	const cl = 0.6 + R() * 1.3;
	F.box( - w / 2 - 0.31, 0.35, 0.1, - w / 2 - 0.27, 2.33, 0.1 + cl, cloth( pickOf( R, [ [ 150, 190, 200 ], [ 180, 210, 190 ], [ 220, 200, 170 ] ] ) ) );
	// bedside cabinet, IV pole with a bag, a monitor on a stand, a chair
	F.box( w / 2 + 0.12, 0, 0.1, w / 2 + 0.57, 0.8, 0.55, gloss( [ 236, 236, 232 ] ) ).box( w / 2 + 0.12, 0.8, 0.08, w / 2 + 0.57, 0.83, 0.57, gloss( [ 190, 200, 210 ] ) );
	F.col( w / 2 + 0.12, 0, 0.1, w / 2 + 0.57, 0.83, 0.55, 2, 2 );
	F.container( w / 2 + 0.12, 0, 0.1, w / 2 + 0.57, 0.83, 0.55, 'Cabinet', loot, 8, { n: 1 } );
	const f = F.fine();
	f.cyl( - w / 2 - 0.12, 0, 0.9, 0.2, 0.02, 5, CHROME ).cyl( - w / 2 - 0.12, 0.02, 0.9, 0.012, 1.9, 6, CHROME ).box( - w / 2 - 0.3, 1.9, 0.89, - w / 2 + 0.06, 1.91, 0.91, CHROME );
	if ( R() < 0.7 ) f.box( - w / 2 - 0.2, 1.62, 0.87, - w / 2 - 0.1, 1.86, 0.93, gloss( [ 220, 230, 236 ] ) ).box( - w / 2 - 0.152, 0.7, 0.895, - w / 2 - 0.148, 1.62, 0.905, gloss( [ 220, 230, 236 ] ) );
	if ( o.monitor ?? R() < 0.5 ) { f.cyl( w / 2 + 0.35, 0.83, 0.3, 0.015, 0.4, 6, CHROME ).box( w / 2 + 0.2, 1.23, 0.22, w / 2 + 0.5, 1.45, 0.38, gloss( [ 60, 64, 70 ] ) ).box( w / 2 + 0.23, 1.26, 0.38, w / 2 + 0.47, 1.42, 0.381, SCREEN ); }
	scatter( F, w / 2 + 0.16, 0.14, w / 2 + 0.52, 0.5, 0.83, 1 + ( R() * 2 | 0 ), [ SMALL.pills, SMALL.glass, SMALL.paper ] );
	if ( R() < 0.5 ) chair( F.at( w / 2 + 0.4, 0, 1.3, - Math.PI / 2 + ( R() - 0.5 ) * 0.5 ), metal( [ 90, 110, 130 ] ), R() < 0.2 );
	F.spot( w / 2 + 0.35, 0.83, 0.3, loot, 0.3 );
	F.shadow( - w / 2, 0, w / 2, len, 0.7 );
	return F;
}

// a gurney along a corridor wall (maybe with someone on it under a sheet, or overturned)
export function gurney( F, o = {} ) {
	const R = F.O.R;
	const fm = metal( [ 200, 202, 206 ] );
	if ( R() < 0.15 ) {
		F.rbox( 0, 0.3, 0.3, 0.95, 0.03, 0.3, fm, 0, Math.PI / 2 - 0.1 );
		for ( const x of [ - 0.8, 0.8 ] ) F.rbox( x, 0.35, 0.6, 0.02, 0.02, 0.3, fm );
		return F;
	}
	F.box( - 0.95, 0.7, 0.05, 0.95, 0.76, 0.65, fm ).box( - 0.93, 0.76, 0.07, 0.93, 0.82, 0.63, cloth( [ 60, 70, 90 ] ) );
	for ( const [ x, z ] of [ [ - 0.85, 0.1 ], [ 0.85, 0.1 ], [ - 0.85, 0.6 ], [ 0.85, 0.6 ] ] ) F.box( x - 0.015, 0.06, z - 0.015, x + 0.015, 0.7, z + 0.015, fm ).cyl( x, 0, z, 0.05, 0.06, 8, BLACK );
	F.box( - 0.9, 0.2, 0.1, 0.9, 0.22, 0.6, fm );
	if ( o.body ?? R() < 0.5 ) {
		// a shape under a stained sheet
		const sh = cloth( [ 226, 226, 220 ] );
		F.rbox( - 0.1, 0.92, 0.35, 0.8, 0.1, 0.24, sh ).rbox( 0.75, 0.93, 0.35, 0.13, 0.11, 0.12, sh );
		F.box( - 0.92, 0.55, 0.06, 0.92, 0.82, 0.08, sh ).box( - 0.92, 0.55, 0.62, 0.92, 0.82, 0.64, sh );
		F.container( - 0.9, 0.7, 0.05, 0.9, 1.05, 0.65, 'Body', o.table || 'zombie_medic', 12, { n: 2, empty: 0.35 } );
	}
	F.col( - 0.95, 0, 0.05, 0.95, 0.9, 0.65, 2, 2 );
	return F;
}

export function wheelchair( F ) {
	const R = F.O.R;
	const m = chrome( [ 170, 172, 176 ] ), seat = cloth( [ 30, 34, 40 ] );
	const tip = R() < 0.25;
	const G = tip ? F.at( 0, 0.3, 0, 0 ) : F;
	if ( tip ) { G.rbox( 0, 0, 0, 0.25, 0.3, 0.3, seat, 0, 0, Math.PI / 2 ); G.cylH( 0, 0.02, 0, 0.3, 0.03, 14, m, 'z' ); return F; }
	for ( const s of [ - 1, 1 ] ) F.cylH( s * 0.28, 0.3, 0.1, 0.3, 0.03, 14, m, 'x', 0 ).cyl( s * 0.2, 0, - 0.3, 0.05, 0.08, 6, BLACK );
	F.box( - 0.24, 0.48, - 0.2, 0.24, 0.52, 0.22, seat ).box( - 0.24, 0.52, 0.2, 0.24, 0.92, 0.23, seat );
	F.box( - 0.25, 0.1, - 0.3, 0.25, 0.14, - 0.25, m ).box( - 0.26, 0.52, 0.2, - 0.24, 1.0, 0.26, m ).box( 0.24, 0.52, 0.2, 0.26, 1.0, 0.26, m );
	F.col( - 0.32, 0, - 0.32, 0.32, 0.95, 0.3, 2, 2 );
	return F;
}

export function examTable( F, loot = 'clinic' ) {
	F.box( - 0.35, 0.08, 0, 0.35, 0.75, 1.9, gloss( [ 236, 236, 232 ] ) ).box( - 0.33, 0, 0.02, 0.33, 0.08, 1.88, BLACK );
	F.box( - 0.36, 0.75, 0, 0.36, 0.84, 1.9, cloth( [ 90, 120, 130 ], 0.5 ) ).rbox( 0, 0.95, 0.25, 0.36, 0.05, 0.28, cloth( [ 90, 120, 130 ], 0.5 ), 0, - 0.5 );
	F.box( - 0.28, 0.845, 0.4, 0.28, 0.85, 1.9, WHITE );
	F.col( - 0.36, 0, 0, 0.36, 0.86, 1.9, 2, 2 );
	void loot;
	return F;
}

export function ivPole( F, lx, lz ) {
	const f = F.fine();
	f.cyl( lx, 0, lz, 0.22, 0.02, 5, CHROME ).cyl( lx, 0.02, lz, 0.012, 1.9, 6, CHROME ).box( lx - 0.15, 1.9, lz - 0.01, lx + 0.15, 1.91, lz + 0.01, CHROME ).box( lx - 0.05, 1.62, lz - 0.03, lx + 0.05, 1.86, lz + 0.03, gloss( [ 220, 230, 236 ] ) );
}

// a supply cart: drawers, boxes of gloves on top
export function supplyCart( F, loot = 'hospital' ) {
	const R = F.O.R;
	const m = gloss( pickOf( R, [ [ 90, 140, 190 ], [ 236, 236, 232 ], [ 200, 60, 60 ] ] ) );
	F.box( - 0.3, 0.1, 0, 0.3, 1.0, 0.45, m );
	for ( let k = 0; k < 5; k ++ ) F.box( - 0.28, 0.14 + k * 0.17, 0.45, 0.28, 0.145 + k * 0.17, 0.455, DARK ).box( - 0.1, 0.24 + k * 0.17, 0.45, 0.1, 0.26 + k * 0.17, 0.47, CHROME );
	for ( const [ x, z ] of [ [ - 0.25, 0.05 ], [ 0.25, 0.05 ], [ - 0.25, 0.4 ], [ 0.25, 0.4 ] ] ) F.cyl( x, 0, z, 0.04, 0.1, 6, BLACK );
	const f = F.fine();
	for ( let k = 0; k < 3; k ++ ) if ( R() < 0.7 ) carton( f, - 0.2 + k * 0.2, 1.0, 0.22, 0.14, 0.08, 0.26, pickOf( R, [ [ 240, 240, 236 ], [ 120, 180, 230 ], [ 200, 160, 220 ] ] ) );
	F.col( - 0.3, 0, 0, 0.3, 1.1, 0.45, 2, 2 );
	F.container( - 0.3, 0.1, 0, 0.3, 1.0, 0.45, 'Cart', loot, 16 );
	return F;
}

// ---- police and the military --------------------------------------------------------------------------------------------------

// a reception counter behind a screen of glass (police front desk, hospital reception with open = true)
export function frontDesk( F, w, loot, o = {} ) {
	const R = F.O.R;
	const body = o.m || wood( [ 150, 110, 80 ] );
	F.box( - w / 2, 0, 0, w / 2, 1.1, 0.7, body, 8 ).box( - w / 2 - 0.02, 1.1, - 0.03, w / 2 + 0.02, 1.14, 0.74, M( L.terrazzo, [ 220, 214, 204 ], 1.5, F_IN ) );
	F.box( - w / 2, 0.72, - 0.45, w / 2, 0.76, - 0.05, body ).box( - w / 2, 0, - 0.45, - w / 2 + 0.04, 0.72, - 0.05, body );
	if ( o.glass ) {
		const p = ( lx, ly, lz ) => { const [ gx, gz ] = F.T( lx, lz ); return [ gx, F.y + ly, gz ]; };
		F.O.glass.quad( p( - w / 2, 1.14, 0.55 ), p( w / 2, 1.14, 0.55 ), p( w / 2, 2.3, 0.55 ), p( - w / 2, 2.3, 0.55 ), [ Math.sin( F.rot ), 0, Math.cos( F.rot ) ] );
		for ( let k = 0; k <= Math.round( w / 1.2 ); k ++ ) F.box( - w / 2 + k * w / Math.round( w / 1.2 ) - 0.02, 1.14, 0.53, - w / 2 + k * w / Math.round( w / 1.2 ) + 0.02, 2.3, 0.57, metal( [ 120, 120, 124 ] ) );
		F.col( - w / 2, 1.14, 0.52, w / 2, 2.3, 0.58, 3, 1 );
	}
	const f = F.fine();
	f.box( - 0.3, 0.76, - 0.35, 0.2, 1.08, - 0.32, BLACK ).box( - 0.28, 0.78, - 0.32, 0.18, 1.06, - 0.318, SCREEN );
	scatter( F, - w / 2 + 0.2, 0.1, w / 2 - 0.2, 0.6, 1.14, 2 + ( R() * 3 | 0 ), [ SMALL.paper, SMALL.paper, SMALL.mug, SMALL.phone ] );
	F.col( - w / 2, 0, 0, w / 2, 1.14, 0.74, 1 );
	F.container( - w / 2 + 0.1, 0, - 0.45, - w / 2 + 1.0, 0.76, 0.0, 'Desk', loot, 10, { n: 1 } );
	if ( o.chair !== false ) officeChair( F.at( ( R() - 0.5 ) * w * 0.5, 0, - 0.75, R() * 0.6 - 0.3 ), R() < 0.2 );
	F.shadow( - w / 2, - 0.45, w / 2, 0.74, 0.5 );
	return F;
}

export function lockers( F, n, loot, label = 'Locker', c = [ 90, 110, 130 ] ) {
	const R = F.O.R;
	const m = metal( c ), w = n * 0.42;
	F.box( - w / 2, 0.08, 0, w / 2, 1.9, 0.5, m ).box( - w / 2 + 0.02, 0, 0.02, w / 2 - 0.02, 0.08, 0.48, BLACK );
	const f = F.fine();
	for ( let i = 0; i < n; i ++ ) {
		const a = - w / 2 + i * 0.42;
		const open = R() < 0.18;
		if ( open ) {
			F.box( a + 0.02, 0.1, 0.48, a + 0.4, 1.88, 0.49, DARK );
			F.rbox( a + 0.02 + Math.cos( 1.4 ) * 0.19, 1.0, 0.5 + Math.sin( 1.4 ) * 0.19, 0.19, 0.88, 0.01, m, - 1.4 );
			if ( R() < 0.6 ) f.box( a + 0.08, 1.0, 0.1, a + 0.34, 1.7, 0.4, cloth( pickOf( R, [ [ 30, 40, 70 ], [ 60, 70, 50 ], [ 170, 40, 30 ] ] ) ) );
			continue;
		}
		F.box( a + 0.005, 0.1, 0.5, a + 0.415, 1.88, 0.505, m );
		for ( let k = 0; k < 4; k ++ ) F.box( a + 0.12, 1.6 + k * 0.04, 0.505, a + 0.3, 1.615 + k * 0.04, 0.507, DARK );
		F.box( a + 0.33, 0.95, 0.505, a + 0.36, 1.05, 0.525, CHROME );
	}
	F.col( - w / 2, 0, 0, w / 2, 1.9, 0.5, 2 );
	for ( let i = 0; i < n; i += 2 ) F.container( - w / 2 + i * 0.42, 0, 0, - w / 2 + Math.min( n, i + 2 ) * 0.42, 1.9, 0.5, label, loot, 30, { n: 1 } );
	F.shadow( - w / 2, 0, w / 2, 0.5, 0.8 );
	return F;
}

export function bench( F, w = 1.8, m = wood() ) {
	F.box( - w / 2, 0.4, 0, w / 2, 0.45, 0.35, m ).box( - w / 2 + 0.1, 0, 0.1, - w / 2 + 0.15, 0.4, 0.25, metal() ).box( w / 2 - 0.15, 0, 0.1, w / 2 - 0.1, 0.4, 0.25, metal() );
	F.col( - w / 2, 0, 0, w / 2, 0.45, 0.35, 1, 2 );
	return F;
}

// a row of joined waiting-room seats (n seats), facing +z
export function seats( F, n, c ) {
	const cm = cloth( c ), w = n * 0.6;
	for ( let k = 0; k < n; k ++ ) {
		const a = - w / 2 + k * 0.6 + 0.03, b = a + 0.54;
		F.box( a, 0.42, 0.05, b, 0.47, 0.5, cm ).box( a, 0.47, 0.02, b, 0.86, 0.08, cm );
		if ( k ) F.box( a - 0.05, 0.47, 0.15, a - 0.01, 0.65, 0.45, metal() );
	}
	F.box( - w / 2, 0.3, 0.2, w / 2, 0.36, 0.3, metal() );
	F.box( - w / 2 + 0.1, 0, 0.2, - w / 2 + 0.16, 0.3, 0.3, metal() ).box( w / 2 - 0.16, 0, 0.2, w / 2 - 0.1, 0.3, 0.3, metal() );
	F.col( - w / 2, 0, 0, w / 2, 0.5, 0.55, 2, 2 );
	F.spot( ( F.O.R() - 0.5 ) * w * 0.8, 0.47, 0.3, 'hotel_room', 0.12 );
	return F;
}

// sandbags stacked across a doorway or under a window (w along the wall)
export function sandbags( F, w, h = 0.9 ) {
	const R = F.O.R;
	const m = cloth( [ 150, 136, 100 ], 0.6 );
	const rows = Math.round( h / 0.15 );
	for ( let r = 0; r < rows; r ++ ) {
		const off = r % 2 ? 0.25 : 0;
		for ( let x = - w / 2 + off; x < w / 2 - 0.2; x += 0.5 ) F.rbox( x + 0.25, r * 0.15 + 0.075, 0.25 + ( R() - 0.5 ) * 0.04, 0.26, 0.075, 0.17, m, ( R() - 0.5 ) * 0.1 );
	}
	F.col( - w / 2, 0, 0.05, w / 2, rows * 0.15, 0.45, 1, 2 );
	return F;
}

export function ammoCan( F, lx, lz, a = 0 ) {
	const f = F.fine();
	f.rbox( lx, 0.09, lz, 0.14, 0.09, 0.05, paint( [ 70, 80, 50 ] ), a ).rbox( lx, 0.185, lz, 0.05, 0.008, 0.012, BLACK, a );
}

// a flag on a pole in a stand
export function flag( F, c = [ [ 180, 30, 40 ], [ 240, 240, 236 ], [ 40, 50, 110 ] ] ) {
	F.cyl( 0, 0, 0.3, 0.14, 0.05, 8, gloss( [ 190, 160, 60 ] ) ).cyl( 0, 0.05, 0.3, 0.015, 2.3, 6, wood( [ 150, 110, 60 ] ) ).cyl( 0, 2.35, 0.3, 0.035, 0.06, 6, gloss( [ 200, 170, 60 ] ) );
	for ( let k = 0; k < 6; k ++ ) F.box( 0.02, 2.2 - k * 0.1, 0.28, 0.9, 2.3 - k * 0.1, 0.3 + ( k % 2 ) * 0.02, cloth( c[ k % 2 ] ) );
	F.box( 0.02, 1.8, 0.27, 0.4, 2.3, 0.33, cloth( c[ 2 ] ) );
	F.col( - 0.14, 0, 0.16, 0.14, 2.4, 0.44, 2, 2 );
	return F;
}

// hotel: a luggage trolley, a housekeeping cart, a tray left by a door
export function luggageCart( F ) {
	const R = F.O.R, br = chrome( [ 200, 170, 90 ] );
	F.box( - 0.55, 0.15, - 0.3, 0.55, 0.2, 0.3, cloth( [ 130, 30, 30 ] ) );
	for ( const x of [ - 0.52, 0.52 ] ) F.box( x - 0.02, 0.2, - 0.02, x + 0.02, 1.8, 0.02, br );
	F.cylH( 0, 1.8, 0, 0.02, 1.08, 6, br, 'x' );
	for ( const [ x, z ] of [ [ - 0.45, - 0.25 ], [ 0.45, - 0.25 ], [ - 0.45, 0.25 ], [ 0.45, 0.25 ] ] ) F.cyl( x, 0, z, 0.06, 0.15, 8, BLACK );
	for ( let k = 0; k < 1 + ( R() * 3 | 0 ); k ++ ) F.box( - 0.4 + k * 0.28, 0.2, - 0.2, - 0.18 + k * 0.28, 0.75, 0.15, paint( pickOf( R, [ [ 40, 44, 52 ], [ 120, 30, 36 ], [ 30, 70, 110 ] ] ) ) );
	F.col( - 0.55, 0, - 0.3, 0.55, 1.8, 0.3, 2, 2 );
	F.container( - 0.55, 0.15, - 0.3, 0.55, 0.8, 0.3, 'Luggage', 'hotel_room', 30, { n: 2, empty: 0.3 } );
	return F;
}
export function housekeeping( F ) {
	const R = F.O.R;
	F.box( - 0.7, 0.1, 0, 0.7, 1.1, 0.5, gloss( [ 60, 60, 64 ] ) ).box( - 0.68, 0.4, 0.5, 0.68, 0.41, 0.52, DARK );
	const f = F.fine();
	for ( let k = 0; k < 6; k ++ ) f.box( - 0.6 + ( k % 3 ) * 0.4, 1.1 + ( k / 3 | 0 ) * 0.1, 0.08, - 0.25 + ( k % 3 ) * 0.4, 1.19 + ( k / 3 | 0 ) * 0.1, 0.42, cloth( [ 244, 244, 240 ] ) );
	f.box( 0.7, 0.1, 0.05, 1.05, 1.0, 0.45, cloth( [ 60, 70, 110 ] ) );
	for ( let k = 0; k < 3; k ++ ) SMALL.bottle( f, - 0.5 + k * 0.1, 0.41, 0.44, R );
	for ( const [ x, z ] of [ [ - 0.62, 0.05 ], [ 0.62, 0.05 ], [ - 0.62, 0.45 ], [ 0.62, 0.45 ] ] ) F.cyl( x, 0, z, 0.05, 0.1, 6, BLACK );
	F.col( - 0.7, 0, 0, 1.05, 1.3, 0.5, 2, 2 );
	F.container( - 0.7, 0.1, 0, 0.7, 1.1, 0.5, 'Cart', 'hotel_room', 20 );
	return F;
}
export function tray( F, lx, lz ) {
	const f = F.fine(), R = F.O.R;
	f.box( lx - 0.25, 0, lz - 0.18, lx + 0.25, 0.02, lz + 0.18, gloss( [ 60, 60, 60 ] ) );
	plate( f, lx - 0.08, 0.02, lz, 0.13 ); if ( R() < 0.6 ) SMALL.glass( f, lx + 0.14, 0.02, lz - 0.08 ); mug( f, lx + 0.15, 0.02, lz + 0.08 );
}

// a sconce on a corridor wall and a room-number plate by a door
export function sconce( F, y = 1.8 ) {
	F.fine().box( - 0.06, y - 0.1, 0, 0.06, y + 0.1, 0.03, gloss( [ 190, 160, 90 ] ) ).cyl( 0, y - 0.02, 0.1, 0.07, 0.14, 8, cloth( [ 236, 224, 196 ] ), 2, 0.1 );
	return F;
}

export function unused() { return [ SOFA, BLANKET, card, PORCELAIN, legs, bottle, STEEL ]; }
