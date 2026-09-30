// Furniture of homes, hotel rooms and staff rooms (worker side): kitchens, living rooms, bedrooms, bathrooms and
// garages, each piece with its colliders, containers, loot spots and the small things on and around it (drawn into
// the fine mesh). Local frame per piece: origin on the floor at the wall, x along the wall, +z into the room.
import { L } from './data.js';
import { M } from './plan.js';
import { F_IN } from './geo.js';
import {
	paint, gloss, wood, metal, cloth, card, art, DARK, WHITE, BLACK, STEEL, CHROME, PORCELAIN, SCREEN, PLASTIC,
	SOFA, BLANKET, WOODS, CLOTHES, pickOf, legs, plate, bowl, mug, glassCup, book, scatter, SMALL, goods,
} from './kit.js';

const MIRROR = gloss( [ 170, 184, 190 ] );

// ---- kitchens ---------------------------------------------------------------------------------------------------------

const CABINET = [ [ 238, 236, 228 ], [ 150, 110, 76 ], [ 90, 110, 100 ], [ 200, 190, 170 ], [ 120, 140, 160 ], [ 70, 60, 54 ], [ 214, 200, 170 ] ];
const COUNTER = [ [ 220, 214, 204 ], [ 60, 60, 62 ], [ 180, 170, 150 ], [ 236, 234, 228 ], [ 120, 100, 80 ] ];

// a door or drawer front: a panel with a handle, sometimes left open (the place was searched)
function front( F, a, b, y0, y1, d, m, handle = 'bar', open = 0 ) {
	const w = b - a;
	if ( open > 0 && w < 0.7 ) {
		// a door swung open on its hinge (left edge)
		F.rbox( a + Math.cos( open ) * w / 2, ( y0 + y1 ) / 2, d + Math.sin( open ) * w / 2, w / 2 - 0.004, ( y1 - y0 ) / 2 - 0.004, 0.009, m, - open );
		return;
	}
	F.box( a + 0.004, y0 + 0.004, d, b - 0.004, y1 - 0.004, d + 0.018, m, 8 );
	const hx = ( a + b ) / 2, hy = y1 - 0.07;
	if ( handle === 'bar' ) F.box( hx - Math.min( 0.07, w * 0.25 ), hy - 0.008, d + 0.018, hx + Math.min( 0.07, w * 0.25 ), hy + 0.008, d + 0.04, CHROME, 8 );
	else if ( handle === 'knob' ) F.box( b - 0.06, ( y0 + y1 ) / 2 - 0.012, d + 0.018, b - 0.04, ( y0 + y1 ) / 2 + 0.012, d + 0.04, CHROME );
}

// base cabinets with a worktop, a sink and a stove, wall cabinets and a hood; clutter on the worktop
export function kitchenRun( F, len, o = {} ) {
	const R = F.O.R;
	const loot = o.loot || 'house_kitchen', steel = !! o.steel;
	const bodyC = o.body || pickOf( R, CABINET );
	const body = steel ? STEEL : paint( bodyC ), door = steel ? STEEL : gloss( bodyC.map( v => v * 0.97 ) );
	const top = steel ? STEEL : M( L.terrazzo, o.top || pickOf( R, COUNTER ), 1.5, F_IN );
	const looted = o.looted ?? R() < 0.45;
	const n = Math.max( 1, Math.round( len / 0.6 ) ), cw = len / n;
	// the sink a third along, the stove further on (a dishwasher next to the sink sometimes)
	const si = Math.min( n - 1, Math.floor( n / 3 ) ), so = n > 2 ? Math.min( n - 1, si + 2 ) : - 1;
	const dw = ! steel && n > 3 && R() < 0.5 ? ( si > 0 ? si - 1 : si + 1 ) : - 1;
	F.box( - len / 2, 0.1, 0, len / 2, 0.88, 0.56, body, 8 );
	F.box( - len / 2, 0, 0.02, len / 2, 0.1, 0.5, BLACK, 8 );
	// worktop in pieces round the sink hole
	const sa = - len / 2 + si * cw + 0.07, sb = - len / 2 + ( si + 1 ) * cw - 0.07;
	F.box( - len / 2, 0.88, 0, sa, 0.92, 0.62, top ).box( sb, 0.88, 0, len / 2, 0.92, 0.62, top );
	F.box( sa, 0.88, 0, sb, 0.92, 0.1, top ).box( sa, 0.88, 0.5, sb, 0.92, 0.62, top );
	// the sink basin (its inside) and the tap
	F.box( sa, 0.7, 0.1, sb, 0.71, 0.5, STEEL ).box( sa, 0.7, 0.1, sa + 0.01, 0.9, 0.5, STEEL, 2 ).box( sb - 0.01, 0.7, 0.1, sb, 0.9, 0.5, STEEL, 1 );
	F.box( sa, 0.7, 0.1, sb, 0.9, 0.11, STEEL, 32 ).box( sa, 0.7, 0.49, sb, 0.9, 0.5, STEEL, 16 );
	const sx = ( sa + sb ) / 2;
	F.cyl( sx, 0.92, 0.06, 0.02, 0.26, 8, CHROME ).box( sx - 0.015, 1.15, 0.05, sx + 0.015, 1.18, 0.26, CHROME ).box( sx + 0.05, 0.92, 0.05, sx + 0.09, 0.97, 0.08, CHROME );
	F.tap( sx, 1.0, 0.3 );
	F.col( - len / 2, 0, 0, len / 2, 0.92, 0.62, 1, 2 );
	for ( let i = 0; i < n; i ++ ) {
		const a = - len / 2 + i * cw, b = a + cw;
		if ( i === so ) {
			// a slide-in range: oven door with its window, knobs, the cooktop and a pot or a kettle
			const oc = steel ? STEEL : R() < 0.5 ? gloss( [ 236, 236, 232 ] ) : STEEL;
			F.box( a + 0.01, 0.02, 0.02, b - 0.01, 0.9, 0.6, oc, 8 );
			F.box( a + 0.04, 0.2, 0.6, b - 0.04, 0.72, 0.615, oc ).box( a + 0.1, 0.3, 0.615, b - 0.1, 0.62, 0.618, SCREEN );
			F.box( a + 0.06, 0.66, 0.615, b - 0.06, 0.68, 0.65, CHROME );
			for ( let k = 0; k < 4; k ++ ) F.cyl( a + cw * ( 0.2 + k * 0.2 ), 0.78, 0.6, 0.018, 0.03, 6, BLACK );
			F.box( a + 0.02, 0.9, 0.02, b - 0.02, 0.93, 0.6, BLACK );
			for ( const [ bx, bz ] of [ [ 0.28, 0.17 ], [ 0.72, 0.17 ], [ 0.28, 0.43 ], [ 0.72, 0.43 ] ] ) F.cyl( a + cw * bx, 0.93, bz, 0.075, 0.008, 10, DARK );
			F.box( a + 0.02, 0.93, 0.02, b - 0.02, 1.02, 0.06, oc );
			const f = F.fine();
			if ( R() < 0.6 ) { const px = a + cw * ( R() < 0.5 ? 0.28 : 0.72 ); f.cyl( px, 0.938, 0.43, 0.11, 0.14, 12, STEEL, 2 ).box( px + 0.1, 1.03, 0.42, px + 0.26, 1.05, 0.44, BLACK ); }
			if ( R() < 0.5 ) f.cyl( a + cw * 0.28, 0.938, 0.17, 0.085, 0.16, 10, gloss( pickOf( R, [ [ 200, 40, 36 ], [ 236, 236, 232 ], [ 40, 40, 40 ] ] ) ), 3, 0.06 );
			continue;
		}
		if ( i === dw ) {
			F.box( a + 0.004, 0.1, 0.56, b - 0.004, 0.86, 0.575, STEEL ).box( a + 0.05, 0.78, 0.575, b - 0.05, 0.8, 0.6, CHROME );
			continue;
		}
		// cabinet doors under a drawer
		const ajar = looted && R() < 0.3 ? 0.6 + R() * 1.2 : 0;
		front( F, a, b, 0.12, 0.68, 0.56, door, 'bar', ajar );
		if ( looted && R() < 0.25 ) {
			// a drawer pulled out
			F.box( a + 0.02, 0.7, 0.56, b - 0.02, 0.86, 0.9, door ).box( a + 0.04, 0.72, 0.56, b - 0.04, 0.84, 0.88, DARK, 4 );
		} else front( F, a, b, 0.7, 0.86, 0.56, door, 'bar' );
		if ( i !== si ) F.container( a, 0.1, 0, b, 0.88, 0.58, 'Cabinet', loot, 20, { empty: looted ? 0.5 : 0.22 } );
	}
	if ( o.upper !== false ) {
		// wall cabinets (not in front of a window), a hood over the stove
		const ok = o.upperAt || ( () => true );
		let any = false;
		for ( let i = 0; i < n; i ++ ) {
			const a = - len / 2 + i * cw, b = a + cw;
			if ( ! ok( a, b ) ) continue;
			any = true;
			if ( i === so ) {
				F.box( a + 0.02, 1.62, 0, b - 0.02, 1.72, 0.48, steel ? STEEL : gloss( [ 60, 60, 62 ] ) ).box( a + 0.12, 1.72, 0, b - 0.12, 2.15, 0.28, steel ? STEEL : gloss( [ 60, 60, 62 ] ) );
				continue;
			}
			F.box( a, 1.45, 0, b, 2.15, 0.33, body, 0 );
			front( F, a, b, 1.46, 2.14, 0.33, door, 'knob', looted && R() < 0.2 ? 0.8 + R() : 0 );
			if ( i % 2 === 0 ) F.container( a, 1.45, 0, b, 2.15, 0.35, 'Cabinet', loot, 10, { n: 1, empty: looted ? 0.55 : 0.3 } );
			F.col( a, 1.45, 0, b, 2.15, 0.34, 1, 2 );
		}
		void any;
	}
	// on the worktop: an appliance or two, bottles, a dish rack, a knife block, a fruit bowl
	const f = F.fine();
	const slots = [];
	for ( let i = 0; i < n; i ++ ) if ( i !== si && i !== so ) slots.push( - len / 2 + ( i + 0.5 ) * cw );
	for ( const x of slots ) {
		const u = R();
		if ( u < 0.14 ) { f.box( x - 0.25, 0.92, 0.08, x + 0.25, 1.2, 0.42, gloss( R() < 0.5 ? [ 236, 236, 232 ] : [ 50, 50, 52 ] ) ).box( x - 0.2, 0.96, 0.42, x + 0.08, 1.16, 0.425, SCREEN ); }
		else if ( u < 0.26 ) { f.box( x - 0.12, 0.92, 0.12, x + 0.12, 1.1, 0.26, gloss( [ 200, 200, 204 ] ) ).box( x - 0.08, 1.1, 0.14, x - 0.01, 1.105, 0.24, BLACK ).box( x + 0.01, 1.1, 0.14, x + 0.08, 1.105, 0.24, BLACK ); }
		else if ( u < 0.36 ) { f.cyl( x, 0.92, 0.25, 0.08, 0.2, 10, gloss( pickOf( R, [ [ 200, 40, 36 ], [ 236, 236, 232 ], [ 60, 60, 62 ] ] ) ), 3, 0.06 ).box( x + 0.07, 0.98, 0.24, x + 0.12, 1.1, 0.26, BLACK ); }
		else if ( u < 0.48 ) { f.box( x - 0.2, 0.92, 0.12, x + 0.2, 0.94, 0.42, CHROME ); for ( let k = 0; k < 4; k ++ ) f.rbox( x - 0.14 + k * 0.08, 1.04, 0.27, 0.005, 0.11, 0.11, gloss( [ 240, 240, 236 ] ), 0, 0, 0.15 ); }
		else if ( u < 0.58 ) { f.rbox( x, 1.03, 0.14, 0.05, 0.11, 0.06, wood( WOODS[ 3 ] ), 0, - 0.3 ); for ( let k = 0; k < 4; k ++ ) f.box( x - 0.035 + k * 0.022, 1.12, 0.1, x - 0.025 + k * 0.022, 1.2, 0.13, BLACK ); }
		else if ( u < 0.68 ) { bowl( f, x, 0.92, 0.3, 0.13, [ 200, 180, 140 ] ); for ( let k = 0; k < 4; k ++ ) f.cyl( x + ( R() - 0.5 ) * 0.1, 0.96, 0.3 + ( R() - 0.5 ) * 0.1, 0.035, 0.06, 6, gloss( pickOf( R, [ [ 230, 200, 40 ], [ 200, 40, 30 ], [ 90, 160, 50 ], [ 240, 140, 30 ] ] ) ), 3, 0.02 ); }
		else scatter( F, x - 0.2, 0.1, x + 0.2, 0.45, 0.92, 2 + ( R() * 3 | 0 ), [ SMALL.bottle, SMALL.can, SMALL.tin, SMALL.box, SMALL.mug, SMALL.glass ] );
		F.spot( x + ( R() - 0.5 ) * 0.2, 0.92, 0.35, loot, 0.25 );
	}
	// dishes left in the sink
	if ( R() < 0.6 ) { plate( f, sx - 0.05, 0.71, 0.28, 0.11 ); if ( R() < 0.5 ) mug( f, sx + 0.1, 0.71, 0.36 ); }
	F.shadow( - len / 2, 0, len / 2, 0.62, 0.8 );
	return F;
}

export function fridge( F, loot = 'fridge', o = {} ) {
	const R = F.O.R;
	const steel = !! o.steel;
	const m = steel ? STEEL : gloss( R() < 0.6 ? [ 238, 238, 234 ] : R() < 0.5 ? [ 190, 192, 194 ] : [ 60, 62, 64 ] );
	const open = ! steel && ( o.open ?? R() < 0.2 );
	F.box( - 0.38, 0, 0, 0.38, 1.8, 0.66, m, 8 );
	if ( open ) {
		// left open: the empty, stained shelves inside and the door swung wide
		F.box( - 0.34, 0.06, 0.64, 0.34, 1.74, 0.661, gloss( [ 200, 204, 200 ] ) );
		const f = F.fine();
		for ( let k = 1; k < 5; k ++ ) f.box( - 0.34, k * 0.34, 0.1, 0.34, k * 0.34 + 0.01, 0.64, gloss( [ 210, 226, 230 ] ) );
		for ( let k = 0; k < 3; k ++ ) if ( R() < 0.6 ) SMALL[ pickOf( R, [ 'bottle', 'can', 'box', 'tin' ] ) ]( f, ( R() - 0.5 ) * 0.5, 0.35 + ( k + 1 ) * 0.34 - 0.34, 0.4, R );
		F.rbox( 0.38 + Math.cos( 1.9 ) * 0.38, 0.9, 0.66 + Math.sin( 1.9 ) * 0.38, 0.38, 0.88, 0.035, m, - 1.9 );
	} else {
		F.box( - 0.37, 1.16, 0.66, 0.37, 1.18, 0.67, DARK );
		F.box( - 0.37, 0.02, 0.66, 0.37, 1.16, 0.7, m ).box( - 0.37, 1.18, 0.66, 0.37, 1.78, 0.7, m );
		F.box( 0.28, 0.75, 0.7, 0.31, 1.1, 0.74, CHROME ).box( 0.28, 1.26, 0.7, 0.31, 1.55, 0.74, CHROME );
		// magnets, a photo and a list on the door
		const f = F.fine();
		for ( let k = 0; k < 4; k ++ ) if ( R() < 0.7 ) f.box( - 0.3 + R() * 0.45, 1.25 + R() * 0.45, 0.7, - 0.2 + R() * 0.45, 1.33 + R() * 0.45, 0.703, k === 0 ? art( 7 ) : k === 1 ? WHITE : paint( pickOf( R, BLANKET ) ) );
	}
	F.col( - 0.38, 0, 0, 0.38, 1.8, 0.72, 2 );
	F.container( - 0.38, 0, 0, 0.38, 1.8, 0.72, 'Fridge', loot, 30, { empty: open ? 0.6 : 0.22 } );
	F.shadow( - 0.38, 0, 0.38, 0.7, 0.9 );
	return F;
}

// table with chairs round it and the table set (or left in a hurry)
export function diningSet( F, w, d, o = {} ) {
	const R = F.O.R;
	const m = o.m || wood( pickOf( R, WOODS ) );
	const h = 0.75;
	F.box( - w / 2, h - 0.04, - d / 2, w / 2, h, d / 2, m );
	F.box( - w / 2 + 0.04, h - 0.12, - d / 2 + 0.04, w / 2 - 0.04, h - 0.04, d / 2 - 0.04, m, 4 );
	legs( F, - w / 2 + 0.05, - d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, h - 0.04, m, 0.055 );
	F.col( - w / 2, 0, - d / 2, w / 2, h, d / 2, 1, 2 );
	if ( R() < 0.3 ) F.box( - w / 2 - 0.02, h, - d / 2 - 0.02, w / 2 + 0.02, h + 0.004, d / 2 + 0.02, cloth( pickOf( R, [ [ 236, 232, 220 ], [ 200, 60, 50 ], [ 90, 130, 170 ] ] ) ) );
	const cm = o.chair || wood( WOODS[ 1 ] );
	const seats = w > 1.1 ? [ [ - w / 4, - 1 ], [ w / 4, - 1 ], [ - w / 4, 1 ], [ w / 4, 1 ] ] : [ [ 0, - 1 ], [ 0, 1 ] ];
	const f = F.fine();
	for ( const [ sx, sd ] of seats ) {
		const pulled = 0.05 + R() * 0.25;
		const cf = F.at( sx + ( R() - 0.5 ) * 0.08, 0, sd * ( d / 2 + 0.12 + pulled ), sd < 0 ? 0 : Math.PI );
		chair( cf, cm, R() < ( o.tipped ?? 0.15 ) );
		if ( R() < 0.7 ) { const pz = sd * ( d / 2 - 0.2 ); plate( f, sx, h, pz ); if ( R() < 0.5 ) glassCup( f, sx + 0.16, h, pz ); }
	}
	scatter( F, - w / 2 + 0.15, - 0.1, w / 2 - 0.15, 0.1, h, R() * 3 | 0, [ SMALL.bottle, SMALL.bowl, SMALL.mug, SMALL.can, SMALL.paper ] );
	F.spot( ( R() - 0.5 ) * w * 0.5, h, 0, o.loot || 'house_kitchen', 0.5 );
	F.shadow( - w / 2, - d / 2, w / 2, d / 2, 0.6 );
	return F;
}

// a chair facing -z (its back towards +z... drawn around its seat centre), or knocked over
export function chair( F, m = wood( WOODS[ 1 ] ), tipped = false ) {
	if ( tipped ) {
		// on its back, legs in the air
		F.tilt( 0, 0.24, 0.25, 0.22, 0.02, 0.22, Math.PI / 2, 0, m );
		F.tilt( 0, 0.02, 0.55, 0.22, 0.02, 0.25, 0, 0, m );
		F.box( - 0.2, 0.02, 0.1, - 0.16, 0.46, 0.14, m ).box( 0.16, 0.02, 0.1, 0.2, 0.46, 0.14, m );
		F.box( - 0.2, 0.26, 0.42, - 0.16, 0.3, 0.84, m ).box( 0.16, 0.26, 0.42, 0.2, 0.3, 0.84, m );
		return F;
	}
	F.box( - 0.21, 0.43, - 0.21, 0.21, 0.47, 0.21, m );
	legs( F, - 0.2, - 0.2, 0.2, 0.2, 0.43, m, 0.035 );
	F.box( - 0.2, 0.47, 0.18, - 0.165, 0.95, 0.215, m ).box( 0.165, 0.47, 0.18, 0.2, 0.95, 0.215, m );
	F.box( - 0.19, 0.72, 0.185, 0.19, 0.93, 0.21, m ).box( - 0.19, 0.55, 0.19, 0.19, 0.6, 0.205, m );
	F.col( - 0.21, 0, - 0.21, 0.21, 0.5, 0.21, 1, 2 );
	return F;
}

// ---- living rooms -------------------------------------------------------------------------------------------------

export function sofa( F, w, c, o = {} ) {
	const R = F.O.R;
	const m = cloth( c ), base = cloth( c.map( v => v * 0.82 ) ), leg = o.leg || wood( WOODS[ 3 ] );
	const arm = 0.2, seatD = 0.9;
	F.box( - w / 2, 0.1, 0, w / 2, 0.4, seatD, base );
	F.box( - w / 2, 0.4, 0, w / 2, 0.82, 0.2, m ).box( - w / 2 + 0.01, 0.82, 0.02, w / 2 - 0.01, 0.86, 0.2, m, 8 );
	F.box( - w / 2, 0.1, 0.2, - w / 2 + arm, 0.62, seatD, m ).box( w / 2 - arm, 0.1, 0.2, w / 2, 0.62, seatD, m );
	F.box( - w / 2 + 0.01, 0.62, 0.21, - w / 2 + arm - 0.01, 0.65, seatD - 0.01, m, 8 ).box( w / 2 - arm + 0.01, 0.62, 0.21, w / 2 - 0.01, 0.65, seatD - 0.01, m, 8 );
	const n = Math.max( 1, Math.round( ( w - 2 * arm ) / 0.62 ) ), cw = ( w - 2 * arm ) / n;
	for ( let i = 0; i < n; i ++ ) {
		const a = - w / 2 + arm + i * cw;
		// seat cushions (one sunk in, one askew) and back cushions
		const sag = R() < 0.3 ? 0.03 : 0;
		F.rbox( a + cw / 2, 0.46 - sag, 0.56, cw / 2 - 0.012, 0.065, 0.33, m, R() < 0.15 ? 0.12 : 0 );
		F.rbox( a + cw / 2, 0.66, 0.29, cw / 2 - 0.015, 0.2, 0.08, m, 0, - 0.18 );
	}
	for ( const s of [ - 1, 1 ] ) F.box( s * ( w / 2 - 0.08 ) - 0.03, 0, 0.06, s * ( w / 2 - 0.08 ) + 0.03, 0.1, 0.12, leg ).box( s * ( w / 2 - 0.08 ) - 0.03, 0, seatD - 0.12, s * ( w / 2 - 0.08 ) + 0.03, 0.1, seatD - 0.06, leg );
	// throw pillows, a blanket over the arm
	const f = F.fine();
	const pc = cloth( pickOf( R, BLANKET ) );
	if ( w > 1 ) { f.rbox( - w / 2 + arm + 0.2, 0.66, 0.42, 0.18, 0.17, 0.06, pc, 0.2, - 0.35, 0.15 ); if ( R() < 0.7 ) f.rbox( w / 2 - arm - 0.2, 0.66, 0.42, 0.18, 0.17, 0.06, pc, - 0.2, - 0.35, - 0.1 ); }
	if ( R() < 0.35 ) { f.box( w / 2 - arm - 0.02, 0.2, 0.3, w / 2 + 0.02, 0.66, 0.8, cloth( pickOf( R, BLANKET ) ), 8 ); }
	F.col( - w / 2, 0, 0, w / 2, 0.5, seatD, 1, 2 ).col( - w / 2, 0.5, 0, w / 2, 0.86, 0.22, 1, 2 );
	F.bed( - w / 2, 0, 0, w / 2, 0.55, seatD, 0.65, 'Sleep' );
	F.spot( ( R() - 0.5 ) * w * 0.4, 0.52, 0.55, o.loot || 'house_living', 0.2 );
	F.shadow( - w / 2, 0, w / 2, seatD, 0.8 );
	return F;
}

export function coffeeTable( F, w, d, o = {} ) {
	const R = F.O.R;
	const glassTop = R() < 0.3;
	const m = wood( pickOf( R, WOODS ) ), h = 0.42;
	if ( glassTop ) {
		F.box( - w / 2, h - 0.02, - d / 2, w / 2, h, d / 2, gloss( [ 150, 180, 176 ] ) );
		for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) F.box( sx * ( w / 2 - 0.05 ) - 0.02, 0, sz * ( d / 2 - 0.05 ) - 0.02, sx * ( w / 2 - 0.05 ) + 0.02, h - 0.02, sz * ( d / 2 - 0.05 ) + 0.02, CHROME, 12 );
	} else {
		F.box( - w / 2, h - 0.04, - d / 2, w / 2, h, d / 2, m );
		F.box( - w / 2 + 0.05, 0.1, - d / 2 + 0.05, w / 2 - 0.05, 0.12, d / 2 - 0.05, m );
		legs( F, - w / 2 + 0.03, - d / 2 + 0.03, w / 2 - 0.03, d / 2 - 0.03, h - 0.04, m, 0.05 );
		// magazines on the shelf underneath
		const f = F.fine();
		for ( let k = 0; k < 3; k ++ ) f.rbox( ( R() - 0.5 ) * w * 0.4, 0.125 + k * 0.006, ( R() - 0.5 ) * d * 0.3, 0.11, 0.003, 0.14, art( pickOf( R, [ 8, 9, 5, 2 ] ) ), R() * 0.6 - 0.3 );
	}
	F.col( - w / 2, 0, - d / 2, w / 2, h, d / 2, 1, 2 );
	scatter( F, - w / 2 + 0.1, - d / 2 + 0.08, w / 2 - 0.1, d / 2 - 0.08, h, 2 + ( R() * 3 | 0 ), [ SMALL.mug, SMALL.remote, SMALL.book, SMALL.ashtray, SMALL.can, SMALL.bottle, SMALL.paper, SMALL.phone ] );
	F.spot( ( R() - 0.5 ) * w * 0.5, h, 0, o.loot || 'house_living', 0.5 );
	return F;
}

// a TV on a low unit (sometimes pulled down and smashed, or an old tube set)
export function tvUnit( F, w = 1.5, o = {} ) {
	const R = F.O.R;
	const m = wood( pickOf( R, WOODS ) );
	F.box( - w / 2, 0.06, 0, w / 2, 0.5, 0.42, m ).box( - w / 2 + 0.04, 0, 0.04, w / 2 - 0.04, 0.06, 0.38, BLACK );
	front( F, - w / 2, - w / 6, 0.08, 0.48, 0.42, m, 'bar' ); front( F, w / 6, w / 2, 0.08, 0.48, 0.42, m, 'bar' );
	F.box( - w / 6, 0.26, 0.04, w / 6, 0.27, 0.42, m );
	const f = F.fine();
	f.box( - 0.18, 0.08, 0.06, 0.12, 0.14, 0.34, PLASTIC ).box( - 0.15, 0.28, 0.06, 0.1, 0.33, 0.3, PLASTIC );
	const u = R();
	const tw = Math.min( 1.25, w - 0.1 );
	if ( o.old || u < 0.12 ) {
		// a tube TV
		F.box( - 0.36, 0.5, 0.05, 0.36, 1.02, 0.52, gloss( [ 60, 60, 60 ] ) ).box( - 0.3, 0.56, 0.52, 0.3, 0.96, 0.53, SCREEN );
	} else if ( u < 0.3 ) {
		// pulled off, face down on the floor
		F.rbox( 0, 0.03, 0.9, tw / 2, 0.03, 0.36, BLACK, R() * 0.4 - 0.2 );
		F.O.decalAt( F, 0, 0.9, 1.2, 'glass' );
	} else {
		F.box( - tw / 2, 0.58, 0.14, tw / 2, 0.58 + tw * 0.58, 0.18, BLACK ).box( - tw / 2 + 0.02, 0.6, 0.18, tw / 2 - 0.02, 0.56 + tw * 0.58, 0.182, SCREEN );
		F.box( - 0.12, 0.5, 0.1, 0.12, 0.52, 0.3, BLACK ).box( - 0.03, 0.52, 0.14, 0.03, 0.6, 0.17, BLACK );
		// a smashed screen: a web of cracks
		if ( R() < 0.25 ) for ( let k = 0; k < 6; k ++ ) F.fine().rbox( ( R() - 0.5 ) * 0.2, 0.58 + tw * 0.29 + ( R() - 0.5 ) * 0.1, 0.184, 0.18 + R() * 0.2, 0.003, 0.001, gloss( [ 170, 180, 186 ] ), 0, 0, R() * 3 );
	}
	F.col( - w / 2, 0, 0, w / 2, 0.5, 0.42, 1, 2 );
	F.container( - w / 2, 0, 0, w / 2, 0.5, 0.42, 'Cabinet', o.loot || 'house_living', 8, { n: 1, empty: 0.4 } );
	F.shadow( - w / 2, 0, w / 2, 0.42, 0.7 );
	return F;
}

// a bookcase: books on the shelves, a few ornaments, and some books on the floor
export function bookcase( F, w, h = 1.9, o = {} ) {
	const R = F.O.R;
	const m = wood( pickOf( R, WOODS ) ), d = 0.32;
	const n = Math.max( 3, Math.round( h / 0.38 ) );
	F.box( - w / 2, 0, 0, w / 2, h, 0.02, m ).box( - w / 2, 0, 0, - w / 2 + 0.025, h, d, m ).box( w / 2 - 0.025, 0, 0, w / 2, h, d, m );
	for ( let k = 0; k <= n; k ++ ) F.box( - w / 2 + 0.025, k * ( h - 0.02 ) / n, 0, w / 2 - 0.025, k * ( h - 0.02 ) / n + 0.02, d, m );
	for ( let k = 0; k < n; k ++ ) goods( F, - w / 2 + 0.03, w / 2 - 0.03, k * ( h - 0.02 ) / n + 0.02, ( k + 1 ) * ( h - 0.02 ) / n - 0.02, d - 0.07, L.books );
	const f = F.fine();
	for ( let k = 1; k < n; k ++ ) if ( R() < 0.4 ) { const y = k * ( h - 0.02 ) / n + 0.02; const x = ( R() - 0.5 ) * ( w - 0.3 ); R() < 0.5 ? f.cyl( x, y, d - 0.05, 0.04, 0.18, 8, gloss( pickOf( R, [ [ 60, 110, 150 ], [ 200, 190, 170 ], [ 150, 60, 40 ] ] ) ), 3, 0.025 ) : f.box( x - 0.08, y, d - 0.07, x + 0.08, y + 0.12, d - 0.06, art( pickOf( R, [ 6, 7, 0 ] ) ) ); }
	// books pulled out onto the floor
	if ( R() < ( o.mess ?? 0.5 ) ) for ( let k = 0; k < 3 + ( R() * 5 | 0 ); k ++ ) book( f, ( R() - 0.5 ) * w * 1.2, 0, d + 0.1 + R() * 0.6, R() * 6, pickOf( R, [ [ 120, 40, 40 ], [ 40, 60, 110 ], [ 50, 90, 60 ], [ 200, 190, 160 ] ] ) );
	F.col( - w / 2, 0, 0, w / 2, h, d - 0.1, 1 );
	for ( let k = 1; k < n; k ++ ) F.spot( ( R() - 0.5 ) * ( w - 0.3 ), k * ( h - 0.02 ) / n + 0.02, d - 0.05, o.loot || 'house_living', 0.15 );
	F.shadow( - w / 2, 0, w / 2, d, 0.7 );
	return F;
}

export function floorLamp( F, o = {} ) {
	const R = F.O.R, f = F.fine();
	if ( R() < 0.2 ) {
		// knocked over
		f.cyl( 0, 0, 0, 0.14, 0.03, 10, BLACK ).tilt( 0.7, 0.05, 0, 0.7, 0.012, 0.012, 0, 0, CHROME ).rbox( 1.45, 0.14, 0, 0.14, 0.12, 0.14, cloth( [ 230, 220, 190 ] ), 0.3, 0, 1.2 );
		return F;
	}
	f.cyl( 0, 0, 0, 0.14, 0.03, 10, BLACK ).cyl( 0, 0.03, 0, 0.012, 1.45, 6, o.m || CHROME ).cyl( 0, 1.38, 0, 0.2, 0.28, 12, cloth( [ 232, 222, 196 ] ), 0, 0.13 );
	F.col( - 0.14, 0, - 0.14, 0.14, 1.6, 0.14, 2, 2 );
	return F;
}
export function tableLamp( F, lx, ly, lz ) {
	const f = F.fine(), R = F.O.R;
	f.cyl( lx, ly, lz, 0.07, 0.03, 8, gloss( pickOf( R, [ [ 200, 190, 170 ], [ 40, 40, 40 ], [ 90, 120, 150 ] ] ) ) ).cyl( lx, ly + 0.03, lz, 0.05, 0.2, 8, gloss( pickOf( R, [ [ 220, 210, 190 ], [ 150, 90, 60 ], [ 60, 80, 110 ] ] ) ), 0, 0.02 ).cyl( lx, ly + 0.22, lz, 0.14, 0.2, 10, cloth( [ 236, 226, 200 ] ), 0, 0.09 );
}
export function sideTable( F, o = {} ) {
	const R = F.O.R, m = wood( pickOf( R, WOODS ) );
	F.box( - 0.25, 0.52, 0, 0.25, 0.56, 0.45, m ).box( - 0.22, 0.08, 0.03, 0.22, 0.1, 0.42, m );
	legs( F, - 0.24, 0.01, 0.24, 0.44, 0.52, m, 0.04 );
	F.col( - 0.25, 0, 0, 0.25, 0.56, 0.45, 1, 2 );
	if ( o.lamp !== false ) tableLamp( F, - 0.08, 0.56, 0.22 );
	scatter( F, 0.03, 0.1, 0.2, 0.35, 0.56, 1, [ SMALL.mug, SMALL.book, SMALL.phone, SMALL.glass ] );
	return F;
}

// a potted plant: a palm, a monstera or a dead one
export function pottedPlant( F, o = {} ) {
	const R = F.O.R, f = F.fine();
	const big = o.big ?? R() < 0.5;
	const pr = big ? 0.2 : 0.14, ph = big ? 0.38 : 0.26;
	F.cyl( 0, 0, 0, pr * 0.8, ph, 10, gloss( pickOf( R, [ [ 170, 100, 70 ], [ 236, 236, 230 ], [ 50, 54, 58 ], [ 90, 120, 130 ] ] ) ), 2, pr );
	F.cyl( 0, ph - 0.03, 0, pr - 0.02, 0.02, 10, paint( [ 60, 44, 30 ] ), 1 );
	const dead = R() < 0.3;
	const leaf = paint( dead ? [ 120, 100, 60 ] : pickOf( R, [ [ 50, 100, 45 ], [ 40, 90, 50 ], [ 70, 120, 50 ] ] ) );
	const nL = big ? 9 : 6, H = big ? 1.1 : 0.55;
	for ( let i = 0; i < nL; i ++ ) {
		const a = i * 2.4 + R(), up = H * ( 0.5 + R() * 0.5 ), lean = 0.35 + R() * 0.5 + ( dead ? 0.6 : 0 );
		const r = up * 0.5 * Math.sin( lean );
		f.rbox( Math.cos( a ) * r * 0.6, ph + up * 0.5 * Math.cos( lean ), Math.sin( a ) * r * 0.6, 0.012, up * 0.5, 0.012, leaf, - a, 0, - lean );
		f.rbox( Math.cos( a ) * r * 1.25, ph + up * Math.cos( lean ) * 0.95, Math.sin( a ) * r * 1.25, big ? 0.16 : 0.09, 0.008, big ? 0.07 : 0.05, leaf, - a, 0, - lean * 0.6 );
	}
	F.col( - pr, 0, - pr, pr, ph + 0.4, pr, 6, 2 );
	return F;
}

// ceiling fan (the islands' living rooms and bedrooms) or a plain light fitting
export function ceilingFan( F, h, o = {} ) {
	const R = F.O.R, f = F.fine();
	const m = gloss( pickOf( R, [ [ 236, 236, 230 ], [ 90, 64, 44 ], [ 40, 40, 42 ] ] ) );
	f.cyl( 0, h - 0.3, 0, 0.012, 0.3, 6, m ).cyl( 0, h - 0.42, 0, 0.09, 0.14, 10, m, 3, 0.07 ).cyl( 0, h - 0.5, 0, 0.07, 0.08, 10, gloss( [ 236, 230, 210 ] ), 3, 0.04 );
	const a0 = R() * 3;
	const blade = wood( pickOf( R, WOODS ) );
	for ( let k = 0; k < 5; k ++ ) { const a = a0 + k * Math.PI * 2 / 5; f.rbox( Math.cos( a ) * 0.4, h - 0.37, Math.sin( a ) * 0.4, 0.33, 0.006, 0.065, blade, - a, 0.08 ); }
	void o;
	return F;
}
export function ceilingLight( F, h, kind = 'dome' ) {
	const f = F.fine();
	if ( kind === 'tube' ) { f.box( - 0.62, h - 0.08, - 0.1, 0.62, h, 0.1, WHITE ).box( - 0.6, h - 0.1, - 0.08, 0.6, h - 0.08, 0.08, gloss( [ 240, 240, 236 ] ) ); return F; }
	if ( kind === 'panel' ) { f.box( - 0.3, h - 0.02, - 0.3, 0.3, h, 0.3, gloss( [ 236, 236, 232 ] ) ); return F; }
	f.cyl( 0, h - 0.1, 0, 0.2, 0.1, 12, gloss( [ 236, 234, 228 ] ), 2, 0.14 ).cyl( 0, h - 0.012, 0, 0.12, 0.012, 8, WHITE );
	return F;
}

export function rugOn( C, w, d, x, z, rot = 0, c = [ 255, 255, 255 ] ) {
	const O = C.O, y = C.st.y;
	O.g.push().translate( x, y, z ).rotY( rot );
	O.g.box( - w / 2, 0.004, - d / 2, w / 2, 0.016, d / 2, { py: M( L.rug, c, 1, F_IN, { fit: [ 0, 0, 1, 1 ] } ), px: cloth( [ 160, 150, 130 ] ), nx: cloth( [ 160, 150, 130 ] ), pz: cloth( [ 160, 150, 130 ] ), nz: cloth( [ 160, 150, 130 ] ) }, 8 );
	O.g.pop();
}

// ---- bedrooms ---------------------------------------------------------------------------------------------------------

// a made or slept-in bed: frame, headboard, mattress, a rumpled duvet, pillows
export function bed( F, w, len, o = {} ) {
	const R = F.O.R;
	const frameM = o.frameM || wood( pickOf( R, WOODS ) );
	const c = o.cover || pickOf( R, BLANKET );
	const cover = R() < 0.35 ? M( L.wallpaper, c, 0.5, F_IN ) : cloth( c ), sheet = cloth( o.sheet || [ 238, 236, 228 ] );
	const style = o.style ?? ( R() * 3 | 0 );
	if ( style === 0 ) F.box( - w / 2 - 0.04, 0, 0, w / 2 + 0.04, 1.05, 0.06, frameM );
	else if ( style === 1 ) { F.box( - w / 2 - 0.04, 0, 0, - w / 2, 1.1, 0.06, frameM ).box( w / 2, 0, 0, w / 2 + 0.04, 1.1, 0.06, frameM ).box( - w / 2, 1.0, 0, w / 2, 1.08, 0.05, frameM ); for ( let k = 1; k < 6; k ++ ) F.box( - w / 2 + k * w / 6 - 0.02, 0.35, 0.01, - w / 2 + k * w / 6 + 0.02, 1.0, 0.05, frameM ); }
	else F.box( - w / 2 - 0.1, 0.3, 0, w / 2 + 0.1, 1.25, 0.1, cloth( pickOf( R, SOFA ) ) );
	F.box( - w / 2, 0.12, 0.06, w / 2, 0.3, len, frameM );
	for ( const s of [ - 1, 1 ] ) F.box( s * ( w / 2 - 0.03 ) - 0.03, 0, len - 0.06, s * ( w / 2 - 0.03 ) + 0.03, 0.12, len, frameM );
	F.box( - w / 2 + 0.02, 0.3, 0.07, w / 2 - 0.02, 0.5, len - 0.02, sheet );
	// the duvet: turned back over itself, thick with rounded edges, hanging over the sides; rumpled when slept in
	const t = 0.4 + R() * 0.4, messy = o.messy ?? R() < 0.6;
	const top = 0.6;
	F.box( - w / 2 - 0.02, 0.5, t, w / 2 + 0.02, top - 0.02, len + 0.01, cover );
	F.box( - w / 2 + 0.02, top - 0.02, t + 0.03, w / 2 - 0.02, top, len - 0.02, cover, 8 );
	F.box( - w / 2 - 0.045, 0.24, t + 0.02, - w / 2 - 0.02, 0.56, len - 0.02, cover ).box( w / 2 + 0.02, 0.24, t + 0.02, w / 2 + 0.045, 0.56, len - 0.02, cover );
	F.box( - w / 2 - 0.02, 0.24, len + 0.01, w / 2 + 0.02, 0.56, len + 0.04, cover );
	// the turned-back fold
	F.box( - w / 2 - 0.02, top - 0.01, t - 0.02, w / 2 + 0.02, top + 0.05, t + 0.22, cover ).box( - w / 2, top + 0.05, t + 0.01, w / 2, top + 0.065, t + 0.19, cover, 8 );
	if ( messy ) {
		// low bulges, mostly sunk into the duvet (tall slabs read as planks)
		for ( let k = 0; k < 3; k ++ ) F.rbox( ( R() - 0.5 ) * w * 0.5, top + 0.005, t + 0.45 + R() * ( len - t - 0.8 ), w * ( 0.12 + R() * 0.1 ), 0.025, 0.1 + R() * 0.1, cover, ( R() - 0.5 ) * 0.8, 0, ( R() - 0.5 ) * 0.1 );
	}
	const np = w > 1.2 ? 2 : 1;
	for ( let i = 0; i < np; i ++ ) {
		const cx = np === 1 ? 0 : ( i ? w / 4 : - w / 4 ), pw = Math.min( 0.32, w / np / 2 - 0.03 );
		const a = R() * 0.24 - 0.12, P = F.at( cx + ( R() - 0.5 ) * 0.06, 0.52, 0.3, a );
		P.rbox( 0, 0.06, 0, pw, 0.06, 0.2, sheet, 0, 0.18 ).rbox( 0, 0.11, 0.01, pw - 0.04, 0.035, 0.16, sheet, 0, 0.18 );
	}
	F.col( - w / 2, 0, 0, w / 2, 0.56, len, 1, 2 );
	F.bed( - w / 2, 0, 0, w / 2, 0.6, len, o.q ?? 1, 'Sleep' );
	F.shadow( - w / 2, 0, w / 2, len, 0.9 );
	return F;
}

export function nightstand( F, loot = 'house_bedroom', o = {} ) {
	const R = F.O.R;
	const m = o.m || wood( pickOf( R, WOODS ) );
	F.box( - 0.23, 0.04, 0, 0.23, 0.56, 0.42, m ).box( - 0.21, 0, 0.02, 0.21, 0.04, 0.4, BLACK );
	front( F, - 0.23, 0.23, 0.36, 0.54, 0.42, m, 'bar' );
	front( F, - 0.23, 0.23, 0.06, 0.34, 0.42, m, 'bar', R() < 0.15 ? 1.2 : 0 );
	F.col( - 0.23, 0, 0, 0.23, 0.56, 0.42, 1, 2 );
	F.container( - 0.23, 0, 0, 0.23, 0.56, 0.42, 'Nightstand', loot, 6, { n: 1, empty: 0.35 } );
	if ( o.lamp !== false ) tableLamp( F, - 0.08, 0.56, 0.2 );
	const f = F.fine();
	if ( R() < 0.6 ) f.box( 0.06, 0.56, 0.12, 0.18, 0.64, 0.18, PLASTIC ).box( 0.075, 0.57, 0.18, 0.165, 0.62, 0.181, glowless( [ 30, 40, 30 ] ) );
	scatter( F, 0.02, 0.22, 0.2, 0.36, 0.56, R() * 2 | 0, [ SMALL.book, SMALL.glass, SMALL.pills, SMALL.phone ] );
	F.spot( 0.1, 0.56, 0.3, loot, 0.25 );
	return F;
}
const glowless = ( c ) => gloss( c );

export function wardrobe( F, w = 1.2, loot = 'wardrobe', o = {} ) {
	const R = F.O.R;
	const m = o.m || wood( pickOf( R, WOODS ) );
	const h = o.h || 2.0, d = 0.6;
	F.box( - w / 2, 0, 0, w / 2, h, d - 0.02, m, 8 );
	const open = R() < ( o.openP ?? 0.3 );
	const nd = w > 1 ? 2 : 1;
	for ( let k = 0; k < nd; k ++ ) {
		const a = - w / 2 + k * w / nd, b = a + w / nd;
		if ( open && k === nd - 1 ) {
			// one door open: the clothes on the rail inside
			F.box( a + 0.02, 0.04, d - 0.03, b - 0.02, h - 0.04, d - 0.02, DARK );
			const f = F.fine();
			f.box( a + 0.03, h - 0.35, 0.28, b - 0.03, h - 0.33, 0.3, CHROME );
			for ( let i = 0; i < ( b - a - 0.08 ) / 0.07; i ++ ) if ( R() < 0.75 ) f.box( a + 0.05 + i * 0.07, h - 0.35 - 0.6 - R() * 0.35, 0.12, a + 0.085 + i * 0.07, h - 0.36, 0.46, cloth( pickOf( R, CLOTHES ) ) );
			F.rbox( b + Math.cos( 1.3 ) * ( b - a ) / 2 - ( b - a ), h / 2, d + Math.sin( 1.3 ) * ( b - a ) / 2, ( b - a ) / 2 - 0.005, h / 2 - 0.02, 0.012, m, - 1.3 );
		} else {
			F.box( a + 0.004, 0.04, d - 0.02, b - 0.004, h - 0.04, d, m );
			F.box( k ? a + 0.05 : b - 0.07, h * 0.45, d, k ? a + 0.07 : b - 0.05, h * 0.58, d + 0.03, CHROME );
		}
	}
	F.box( - w / 2 - 0.02, h, - 0.01, w / 2 + 0.02, h + 0.04, d + 0.02, m );
	// bags and boxes on top
	if ( R() < 0.5 ) F.fine().box( - w / 2 + 0.1, h + 0.04, 0.08, - w / 2 + 0.5, h + 0.3, 0.5, pickOf( R, [ card(), paint( pickOf( R, CLOTHES ) ) ] ) );
	F.col( - w / 2, 0, 0, w / 2, h, d, 1 );
	F.container( - w / 2, 0, 0, w / 2, h, d, o.label || 'Wardrobe', loot, 40, { empty: open ? 0.4 : 0.2 } );
	F.shadow( - w / 2, 0, w / 2, d, 0.9 );
	return F;
}

export function dresser( F, w = 1.1, loot = 'house_bedroom', o = {} ) {
	const R = F.O.R;
	const m = o.m || wood( pickOf( R, WOODS ) );
	F.box( - w / 2, 0.06, 0, w / 2, 0.85, 0.46, m ).box( - w / 2 + 0.03, 0, 0.03, w / 2 - 0.03, 0.06, 0.43, BLACK ).box( - w / 2 - 0.01, 0.85, - 0.005, w / 2 + 0.01, 0.88, 0.48, m );
	const looted = R() < 0.4;
	for ( let k = 0; k < 3; k ++ ) {
		const y0 = 0.08 + k * 0.255, y1 = y0 + 0.245;
		if ( looted && k === 2 - ( R() * 2 | 0 ) ) {
			F.box( - w / 2 + 0.03, y0 + 0.01, 0.46, w / 2 - 0.03, y1 - 0.02, 0.78, m ).box( - w / 2 + 0.05, y0 + 0.03, 0.46, w / 2 - 0.05, y1 - 0.03, 0.76, DARK, 4 );
			F.fine().box( - w / 2 + 0.1, y1 - 0.06, 0.55, - 0.1, y1 + 0.03, 0.72, cloth( pickOf( R, CLOTHES ) ) );
		} else front( F, - w / 2 + 0.01, w / 2 - 0.01, y0, y1, 0.46, m, 'bar' );
	}
	if ( o.mirror ?? R() < 0.6 ) {
		F.box( - w * 0.35, 0.88, 0.02, w * 0.35, 1.7, 0.05, m ).box( - w * 0.35 + 0.04, 0.92, 0.05, w * 0.35 - 0.04, 1.66, 0.052, MIRROR );
	}
	F.col( - w / 2, 0, 0, w / 2, 0.88, 0.48, 1, 2 );
	F.container( - w / 2, 0, 0, w / 2, 0.88, 0.48, 'Drawers', loot, 16, { empty: looted ? 0.45 : 0.22 } );
	const f = F.fine();
	for ( let k = 0; k < 3; k ++ ) if ( R() < 0.6 ) { const x = - w / 2 + 0.12 + R() * ( w - 0.24 ); R() < 0.5 ? f.cyl( x, 0.88, 0.2 + R() * 0.15, 0.025, 0.1, 6, gloss( pickOf( R, [ [ 230, 180, 200 ], [ 200, 220, 230 ], [ 240, 220, 150 ] ] ) ) ) : f.box( x - 0.06, 0.88, 0.1, x + 0.06, 1.03, 0.12, art( pickOf( R, [ 7, 6, 0 ] ) ) ); }
	F.spot( ( R() - 0.5 ) * w * 0.6, 0.88, 0.3, loot, 0.35 );
	F.shadow( - w / 2, 0, w / 2, 0.48, 0.8 );
	return F;
}

// clothes dropped on the floor, a pair of shoes
export function clothesPile( F, lx, lz ) {
	const R = F.O.R, f = F.fine();
	const n = 2 + ( R() * 3 | 0 );
	for ( let k = 0; k < n; k ++ ) f.rbox( lx + ( R() - 0.5 ) * 0.4, 0.012 + k * 0.022, lz + ( R() - 0.5 ) * 0.4, 0.14 + R() * 0.16, 0.012, 0.12 + R() * 0.16, cloth( pickOf( R, CLOTHES ) ), R() * 3, ( R() - 0.5 ) * 0.2, ( R() - 0.5 ) * 0.2 );
}
export function shoes( F, lx, lz, a = 0 ) {
	const R = F.O.R, f = F.fine(), m = paint( pickOf( R, [ [ 40, 40, 40 ], [ 230, 230, 226 ], [ 120, 70, 40 ], [ 180, 40, 40 ] ] ) );
	for ( const s of [ - 1, 1 ] ) f.rbox( lx + s * 0.07, 0.04, lz, 0.045, 0.04, 0.13, m, a + ( R() - 0.5 ) * 0.5 );
}

// a suitcase open on the floor or the bed, clothes spilling out (someone packed in a hurry)
export function openSuitcase( F, lx, ly, lz, a = 0, loot = 'house_bedroom' ) {
	const R = F.O.R;
	const S = F.at( lx, ly, lz, a );
	const m = paint( pickOf( R, [ [ 40, 44, 52 ], [ 120, 30, 36 ], [ 30, 70, 110 ], [ 170, 150, 110 ] ] ) );
	S.box( - 0.34, 0, - 0.22, 0.34, 0.14, 0.22, m, 0 ).box( - 0.32, 0.12, - 0.2, 0.32, 0.13, 0.2, DARK, 8 );
	S.rbox( 0, 0.2, - 0.28, 0.34, 0.08, 0.02, m, 0, 1.2 );
	const f = S.fine();
	for ( let k = 0; k < 4; k ++ ) f.rbox( ( R() - 0.5 ) * 0.4, 0.13 + k * 0.015, ( R() - 0.5 ) * 0.2, 0.1 + R() * 0.08, 0.012, 0.08 + R() * 0.06, cloth( pickOf( R, CLOTHES ) ), R() * 3 );
	S.col( - 0.34, 0, - 0.22, 0.34, 0.14, 0.22, 1, 2 );
	S.container( - 0.34, 0, - 0.22, 0.34, 0.2, 0.22, 'Suitcase', loot, 20, { n: 2, empty: 0.3 } );
	return S;
}

export function desk( F, w = 1.3, loot = 'desk', o = {} ) {
	const R = F.O.R;
	const m = o.m || wood( pickOf( R, WOODS ) );
	F.box( - w / 2, 0.72, 0, w / 2, 0.76, 0.7, m );
	F.box( w / 2 - 0.42, 0, 0.02, w / 2 - 0.02, 0.72, 0.68, m );
	F.box( - w / 2 + 0.02, 0, 0.02, - w / 2 + 0.06, 0.72, 0.68, m ).box( - w / 2 + 0.06, 0.3, 0.02, w / 2 - 0.42, 0.7, 0.04, m );
	for ( let k = 0; k < 3; k ++ ) front( F, w / 2 - 0.41, w / 2 - 0.03, 0.04 + k * 0.225, 0.26 + k * 0.225, 0.68, m, 'bar', 0 );
	F.col( - w / 2, 0, 0, w / 2, 0.76, 0.7, 1, 2 );
	F.container( w / 2 - 0.42, 0, 0, w / 2, 0.72, 0.7, 'Desk', loot, 12, { n: 1 } );
	const f = F.fine();
	if ( o.pc ?? true ) {
		if ( R() < 0.15 ) {
			// the monitor knocked off onto the floor
			f.rbox( ( R() - 0.5 ) * 0.4, 0.04, 1.0, 0.27, 0.02, 0.17, BLACK, R() * 0.6 );
		} else {
			f.box( - 0.28, 0.82, 0.12, 0.28, 1.14, 0.15, BLACK ).box( - 0.26, 0.84, 0.15, 0.26, 1.12, 0.152, SCREEN ).box( - 0.03, 0.76, 0.1, 0.03, 0.84, 0.13, BLACK ).box( - 0.12, 0.76, 0.06, 0.12, 0.775, 0.2, BLACK );
		}
		f.box( - 0.22, 0.76, 0.32, 0.22, 0.785, 0.46, PLASTIC ).box( 0.3, 0.76, 0.38, 0.36, 0.78, 0.46, PLASTIC );
		f.box( w / 2 - 0.36, 0, 0.1, w / 2 - 0.16, 0.42, 0.55, PLASTIC );
	} else if ( o.laptop ?? R() < 0.4 ) {
		f.box( - 0.17, 0.76, 0.2, 0.17, 0.775, 0.44, gloss( [ 150, 150, 154 ] ) ).rbox( 0, 0.88, 0.2, 0.17, 0.12, 0.006, gloss( [ 150, 150, 154 ] ), 0, - 0.3 );
	}
	// papers, a mug, a pen pot; a desk phone sometimes
	f.rbox( - w / 2 + 0.25, 0.765, 0.4, 0.105, 0.004, 0.148, WHITE, R() * 0.5 ).rbox( - w / 2 + 0.28, 0.77, 0.42, 0.105, 0.004, 0.148, WHITE, R() * 0.5 );
	if ( R() < 0.6 ) mug( f, - w / 2 + 0.12, 0.76, 0.2, pickOf( R, [ [ 230, 230, 224 ], [ 180, 50, 40 ], [ 50, 90, 140 ] ] ) );
	if ( R() < 0.5 ) f.cyl( w / 2 - 0.12, 0.76, 0.15, 0.035, 0.1, 8, PLASTIC ).box( w / 2 - 0.13, 0.86, 0.14, w / 2 - 0.12, 0.93, 0.15, paint( [ 40, 60, 160 ] ) );
	if ( o.phone ?? R() < 0.4 ) f.box( w / 2 - 0.35, 0.76, 0.1, w / 2 - 0.15, 0.82, 0.3, PLASTIC );
	F.spot( - w / 2 + 0.3, 0.76, 0.45, loot === 'desk' ? 'office' : loot, 0.3 );
	if ( o.chair !== false ) officeChair( F.at( ( R() - 0.5 ) * 0.3, 0, 0.95 + R() * 0.25, Math.PI + ( R() - 0.5 ) * 0.8 ), R() < 0.12 );
	F.shadow( - w / 2, 0, w / 2, 0.7, 0.5 );
	return F;
}

// a swivel chair on five castors (or on its side)
export function officeChair( F, tipped = false, c = [ 46, 48, 54 ] ) {
	const cm = cloth( c );
	if ( tipped ) {
		F.rbox( 0, 0.27, 0, 0.25, 0.04, 0.25, cm, 0, Math.PI / 2 - 0.15 ).rbox( 0, 0.27, 0.3, 0.23, 0.26, 0.04, cm, 0, 0.2 ).cylH( 0, 0.27, - 0.25, 0.025, 0.35, 6, BLACK, 'z' );
		F.rbox( 0, 0.27, - 0.45, 0.28, 0.02, 0.03, BLACK ).rbox( 0, 0.27, - 0.45, 0.03, 0.28, 0.02, BLACK );
		return F;
	}
	F.box( - 0.25, 0.45, - 0.24, 0.25, 0.53, 0.24, cm ).rbox( 0, 0.82, 0.25, 0.23, 0.27, 0.035, cm, 0, - 0.1 );
	F.box( - 0.02, 0.53, 0.2, 0.02, 0.6, 0.24, BLACK );
	F.cyl( 0, 0.08, 0, 0.025, 0.37, 6, BLACK );
	for ( let k = 0; k < 5; k ++ ) { const a = k * Math.PI * 2 / 5; F.rbox( Math.cos( a ) * 0.15, 0.06, Math.sin( a ) * 0.15, 0.15, 0.015, 0.02, BLACK, - a ); F.cyl( Math.cos( a ) * 0.28, 0, Math.sin( a ) * 0.28, 0.025, 0.045, 6, BLACK ); }
	for ( const s of [ - 1, 1 ] ) F.box( s * 0.26 - 0.02, 0.53, - 0.12, s * 0.26 + 0.02, 0.7, - 0.08, BLACK ).box( s * 0.26 - 0.025, 0.7, - 0.2, s * 0.26 + 0.025, 0.72, 0.1, BLACK );
	F.col( - 0.28, 0, - 0.28, 0.28, 0.55, 0.28, 1, 2 );
	return F;
}

// ---- bathrooms ----------------------------------------------------------------------------------------------------------

export function toilet( F, o = {} ) {
	const R = F.O.R;
	F.box( - 0.19, 0.4, 0.02, 0.19, 0.78, 0.2, PORCELAIN ).box( - 0.2, 0.78, 0.01, 0.2, 0.8, 0.21, PORCELAIN ).box( 0.1, 0.72, 0.2, 0.15, 0.735, 0.22, CHROME );
	F.cyl( 0, 0, 0.42, 0.13, 0.3, 12, PORCELAIN, 0, 0.19 ).cyl( 0, 0.3, 0.42, 0.19, 0.1, 12, PORCELAIN, 0, 0.2 );
	F.box( - 0.1, 0.02, 0.18, 0.1, 0.4, 0.3, PORCELAIN, 8 );
	const up = R() < 0.4;
	F.cyl( 0, 0.4, 0.42, 0.2, 0.025, 12, gloss( [ 250, 250, 248 ] ), 3, 0.2 );
	if ( up ) F.rbox( 0, 0.66, 0.2, 0.19, 0.24, 0.015, gloss( [ 250, 250, 248 ] ), 0, 0.12 );
	else F.cyl( 0, 0.425, 0.42, 0.19, 0.02, 12, gloss( [ 250, 250, 248 ] ) );
	if ( o.roll !== false ) F.fine().box( 0.3, 0.62, 0.05, 0.32, 0.64, 0.22, CHROME ).cylH( 0.36, 0.6, 0.14, 0.055, 0.1, 10, WHITE, 'x' );
	F.col( - 0.2, 0, 0, 0.2, 0.45, 0.64, 1, 2 ).col( - 0.2, 0.45, 0, 0.2, 0.8, 0.22, 1, 2 );
	return F;
}

// a bath with a shower over it, the curtain half drawn; bottles on the rim
export function bathtub( F, len = 1.6, o = {} ) {
	const R = F.O.R, d = 0.75;
	F.box( - len / 2, 0, 0, len / 2, 0.55, d, PORCELAIN, 4 );
	F.box( - len / 2 + 0.07, 0.12, 0.07, len / 2 - 0.07, 0.13, d - 0.07, PORCELAIN );
	F.box( - len / 2, 0.52, 0, len / 2, 0.56, 0.07, PORCELAIN ).box( - len / 2, 0.52, d - 0.07, len / 2, 0.56, d, PORCELAIN );
	F.box( - len / 2, 0.52, 0, - len / 2 + 0.07, 0.56, d, PORCELAIN ).box( len / 2 - 0.07, 0.52, 0, len / 2, 0.56, d, PORCELAIN );
	F.box( - len / 2 + 0.07, 0.13, 0.07, len / 2 - 0.07, 0.52, 0.071, PORCELAIN ).box( - len / 2 + 0.07, 0.13, d - 0.071, len / 2 - 0.07, 0.52, d - 0.07, PORCELAIN );
	F.box( - len / 2 + 0.07, 0.13, 0.07, - len / 2 + 0.071, 0.52, d - 0.07, PORCELAIN ).box( len / 2 - 0.071, 0.13, 0.07, len / 2 - 0.07, 0.52, d - 0.07, PORCELAIN );
	F.box( - len / 2 + 0.1, 0.62, 0.02, - len / 2 + 0.2, 0.66, 0.1, CHROME ).cyl( - len / 2 + 0.15, 0.66, 0.06, 0.012, 1.3, 6, CHROME ).cyl( - len / 2 + 0.15, 1.96, 0.14, 0.06, 0.03, 10, CHROME );
	F.tap( - len / 2 + 0.15, 0.66, 0.18 );
	if ( o.shower !== false ) {
		// curtain rail along the open side, the curtain drawn part way: pleats hanging from the rings
		F.box( - len / 2, 2.0, d - 0.02, len / 2, 2.02, d, CHROME );
		const cw = 0.35 + R() * ( len - 0.5 ), cm = cloth( pickOf( R, [ [ 236, 236, 230 ], [ 150, 190, 210 ], [ 200, 220, 200 ], [ 240, 200, 200 ] ] ) );
		const np = Math.ceil( cw / 0.09 );
		for ( let k = 0; k < np; k ++ ) { const x = len / 2 - cw + k * cw / np; F.rbox( x + cw / np / 2, 1.28, d - 0.03 + ( k % 2 ) * 0.035, cw / np / 2 + 0.012, 0.71, 0.006, cm, ( k % 2 ? 0.6 : - 0.6 ) ); }
	}
	scatter( F, - len / 2 + 0.2, 0.01, len / 2 - 0.1, 0.06, 0.56, 1 + ( R() * 3 | 0 ), [ SMALL.bottle, SMALL.pills, ( f, x, y, z, R ) => f.cyl( x, y, z, 0.03, 0.18, 8, gloss( pickOf( R, [ [ 240, 240, 236 ], [ 60, 150, 200 ], [ 240, 150, 60 ] ] ) ) ) ] );
	if ( R() < 0.12 ) F.O.decalAt( F, 0, d / 2, Math.min( 1.2, len - 0.3 ), 'blood', 0.135 );
	F.col( - len / 2, 0, 0, len / 2, 0.56, d, 1, 2 );
	return F;
}

// a shower stall: a tray, a glass screen and the shower head
export function showerStall( F, w = 0.9 ) {
	F.box( - w / 2, 0, 0, w / 2, 0.06, w, PORCELAIN ).box( - 0.04, 0.059, w / 2 - 0.04, 0.04, 0.062, w / 2 + 0.04, CHROME );
	F.box( - w / 2 + 0.05, 1.0, 0.02, - w / 2 + 0.15, 1.05, 0.06, CHROME ).cyl( - w / 2 + 0.1, 1.05, 0.04, 0.012, 0.95, 6, CHROME ).cyl( - w / 2 + 0.1, 1.98, 0.14, 0.07, 0.03, 10, CHROME );
	F.tap( - w / 2 + 0.1, 1.0, 0.2 );
	const p = ( lx, ly, lz ) => { const [ gx, gz ] = F.T( lx, lz ); return [ gx, F.y + ly, gz ]; };
	F.O.glass.quad( p( - w / 2, 0.06, w ), p( w / 2 - 0.45, 0.06, w ), p( w / 2 - 0.45, 2.0, w ), p( - w / 2, 2.0, w ), [ Math.sin( F.rot ), 0, Math.cos( F.rot ) ] );
	F.box( - w / 2, 0.06, w - 0.01, - w / 2 + 0.02, 2.0, w + 0.01, CHROME ).box( w / 2 - 0.47, 0.06, w - 0.01, w / 2 - 0.45, 2.0, w + 0.01, CHROME );
	F.col( - w / 2, 0.06, w - 0.02, w / 2 - 0.45, 2.0, w + 0.02, 3, 1 );
	return F;
}

// a vanity: a cabinet with a basin top, the mirror cabinet above
export function vanity( F, w = 0.7, loot = 'medicine_cabinet', o = {} ) {
	const R = F.O.R;
	const m = gloss( pickOf( R, [ [ 240, 240, 236 ], [ 150, 110, 76 ], [ 90, 110, 120 ] ] ) );
	F.box( - w / 2, 0.08, 0, w / 2, 0.82, 0.48, m ).box( - w / 2 + 0.03, 0, 0.03, w / 2 - 0.03, 0.08, 0.45, BLACK );
	front( F, - w / 2, 0, 0.1, 0.8, 0.48, m, 'knob', R() < 0.2 ? 1.1 : 0 ); front( F, 0, w / 2, 0.1, 0.8, 0.48, m, 'knob' );
	F.box( - w / 2 - 0.01, 0.82, - 0.005, w / 2 + 0.01, 0.86, 0.5, PORCELAIN, 0 );
	F.cyl( 0, 0.8, 0.26, 0.17, 0.065, 12, gloss( [ 220, 224, 226 ] ), 1, 0.2 );
	F.cyl( 0, 0.86, 0.06, 0.018, 0.14, 6, CHROME ).box( - 0.012, 0.98, 0.05, 0.012, 1.0, 0.18, CHROME );
	F.tap( 0, 0.95, 0.2 );
	F.col( - w / 2, 0, 0, w / 2, 0.86, 0.5, 1, 2 );
	F.container( - w / 2, 0.08, 0, w / 2, 0.82, 0.48, 'Cabinet', 'house_bathroom', 8, { n: 1, empty: 0.35 } );
	if ( o.mirror !== false ) {
		const open = R() < 0.25;
		F.box( - 0.3, 1.15, 0, 0.3, 1.8, 0.12, gloss( [ 236, 236, 232 ] ) );
		if ( open ) { F.box( - 0.28, 1.17, 0.11, 0.28, 1.78, 0.115, DARK ); F.rbox( - 0.3 + Math.cos( 1.4 ) * 0.29, 1.475, 0.12 + Math.sin( 1.4 ) * 0.29, 0.29, 0.32, 0.01, MIRROR, - 1.4 ); }
		else F.box( - 0.28, 1.17, 0.12, 0.28, 1.78, 0.125, MIRROR );
		if ( loot ) F.container( - 0.3, 1.15, 0, 0.3, 1.8, 0.14, 'Medicine cabinet', loot, 6, { empty: open ? 0.55 : 0.25 } );
	}
	scatter( F, - w / 2 + 0.06, 0.03, - 0.18, 0.2, 0.86, 1 + ( R() * 2 | 0 ), [ SMALL.pills, ( f, x, y, z ) => f.cyl( x, y, z, 0.035, 0.1, 8, gloss( [ 200, 220, 230 ] ) ).box( x - 0.004, y + 0.1, z - 0.004, x + 0.004, y + 0.18, z + 0.004, paint( [ 60, 140, 200 ] ) ), SMALL.bottle ] );
	F.spot( w / 2 - 0.12, 0.86, 0.3, 'house_bathroom', 0.25 );
	return F;
}

// towels over a rail on the wall (and one dropped)
export function towelRail( F, w = 0.6 ) {
	const R = F.O.R, f = F.fine();
	f.box( - w / 2, 1.2, 0.05, w / 2, 1.22, 0.07, CHROME ).box( - w / 2, 1.18, 0, - w / 2 + 0.02, 1.24, 0.07, CHROME ).box( w / 2 - 0.02, 1.18, 0, w / 2, 1.24, 0.07, CHROME );
	const n = w > 0.5 ? 2 : 1;
	for ( let k = 0; k < n; k ++ ) { const c = cloth( pickOf( R, [ [ 240, 240, 236 ], [ 90, 150, 190 ], [ 220, 120, 110 ], [ 150, 200, 170 ], [ 240, 220, 160 ] ] ) ); const a = - w / 2 + 0.04 + k * w / n, b = a + w / n - 0.06; f.box( a, 0.72, 0.03, b, 1.23, 0.05, c ).box( a, 0.8, 0.07, b, 1.23, 0.09, c ).box( a, 1.21, 0.03, b, 1.24, 0.09, c ); }
	if ( R() < 0.4 ) f.rbox( ( R() - 0.5 ) * 0.4, 0.02, 0.5, 0.3, 0.02, 0.2, cloth( [ 240, 240, 236 ] ), R() * 3, 0, 0.05 );
	return F;
}

// ---- garages and workshops ------------------------------------------------------------------------------------------------

// a car: a static body (sedan or hatch) with wheels, glass and lights; optionally raised on a two-post lift
export function car( F, o = {} ) {
	const R = F.O.R;
	const L2 = o.len || 4.4, W = 1.78, lift = o.lift || 0;
	const paintC = o.c || pickOf( R, [ [ 180, 30, 30 ], [ 30, 60, 120 ], [ 220, 220, 216 ], [ 40, 40, 44 ], [ 140, 144, 150 ], [ 60, 90, 70 ], [ 200, 170, 60 ] ] );
	const body = gloss( paintC ), glassM = gloss( [ 20, 26, 30 ] ), tyre = paint( [ 26, 26, 28 ] ), rim = metal( [ 170, 170, 172 ] );
	const y = lift;
	// along local x (the car's length), across local z (centred at W/2 + 0.2 from the wall)
	const cz = o.cz ?? W / 2 + 0.3;
	const b = ( x0, y0, z0, x1, y1, z1, m ) => F.box( x0, y + y0, cz + z0, x1, y + y1, cz + z1, m );
	b( - L2 / 2 + 0.05, 0.3, - W / 2, L2 / 2 - 0.05, 0.72, W / 2, body );
	// bonnet and boot slope, the cabin
	F.rbox( L2 / 2 - 0.55, y + 0.76, cz, 0.5, 0.05, W / 2 - 0.02, body, 0, 0, - 0.08 );
	F.rbox( - L2 / 2 + 0.45, y + 0.76, cz, 0.4, 0.05, W / 2 - 0.02, body, 0, 0, 0.06 );
	b( - 0.9, 0.72, - W / 2 + 0.08, 0.7, 1.2, W / 2 - 0.08, glassM );
	b( - 0.85, 1.2, - W / 2 + 0.1, 0.62, 1.26, W / 2 - 0.1, body );
	F.rbox( 0.86, y + 0.97, cz, 0.22, 0.02, W / 2 - 0.12, glassM, 0, 0, 0.95 );
	F.rbox( - 1.04, y + 0.97, cz, 0.18, 0.02, W / 2 - 0.12, glassM, 0, 0, - 1.0 );
	// pillars
	for ( const s of [ - 1, 1 ] ) { b( - 0.1, 0.72, s * ( W / 2 - 0.08 ) - 0.03, - 0.04, 1.22, s * ( W / 2 - 0.08 ) + 0.03, body ); }
	// lights and bumpers
	b( L2 / 2 - 0.06, 0.55, - W / 2 + 0.1, L2 / 2 - 0.02, 0.66, - W / 2 + 0.4, gloss( [ 240, 240, 230 ] ) ); b( L2 / 2 - 0.06, 0.55, W / 2 - 0.4, L2 / 2 - 0.02, 0.66, W / 2 - 0.1, gloss( [ 240, 240, 230 ] ) );
	b( - L2 / 2 + 0.02, 0.55, - W / 2 + 0.1, - L2 / 2 + 0.06, 0.66, - W / 2 + 0.4, gloss( [ 170, 20, 20 ] ) ); b( - L2 / 2 + 0.02, 0.55, W / 2 - 0.4, - L2 / 2 + 0.06, 0.66, W / 2 - 0.1, gloss( [ 170, 20, 20 ] ) );
	b( L2 / 2 - 0.08, 0.28, - W / 2 + 0.02, L2 / 2 + 0.03, 0.42, W / 2 - 0.02, PLASTIC ); b( - L2 / 2 - 0.03, 0.28, - W / 2 + 0.02, - L2 / 2 + 0.08, 0.42, W / 2 - 0.02, PLASTIC );
	b( - L2 / 2 + 0.3, 0.2, - W / 2 + 0.1, L2 / 2 - 0.3, 0.3, W / 2 - 0.1, DARK );
	for ( const wx of [ L2 / 2 - 0.8, - L2 / 2 + 0.75 ] ) for ( const s of [ - 1, 1 ] ) {
		if ( o.noWheel && wx > 0 && s > 0 ) continue;
		F.cylH( wx, y + 0.31, cz + s * ( W / 2 - 0.1 ), 0.31, 0.2, 12, tyre, 'z' ).cylH( wx, y + 0.31, cz + s * ( W / 2 - 0.0 ), 0.19, 0.02, 10, rim, 'z' );
	}
	if ( o.hood ) F.rbox( L2 / 2 - 0.55, y + 1.05, cz, 0.05, 0.4, W / 2 - 0.05, body, 0, 0, 0.3 );
	F.col( - L2 / 2 - 0.03, y + 0.1, cz - W / 2, L2 / 2 + 0.03, y + 1.26, cz + W / 2, 2 );
	F.container( - 0.8, y + 0.3, cz - W / 2, 0.7, y + 1.2, cz + W / 2, 'Car', 'car_glovebox', 8, { n: 1, empty: 0.4 } );
	F.container( - L2 / 2 - 0.05, y + 0.3, cz - W / 2, - L2 / 2 + 0.9, y + 0.8, cz + W / 2, 'Trunk', 'car_trunk', 30, { empty: 0.35 } );
	if ( ! lift ) F.shadow( - L2 / 2, cz - W / 2, L2 / 2, cz + W / 2, 1 );
	return F;
}

export function carLift( F, len = 4.6, h = 1.6 ) {
	const R = F.O.R;
	const post = paint( pickOf( R, [ [ 40, 80, 150 ], [ 200, 40, 30 ], [ 60, 60, 64 ] ] ) );
	const W = 1.78, cz = W / 2 + 0.3;
	for ( const s of [ - 1, 1 ] ) {
		F.box( - 0.18, 0, cz + s * ( W / 2 + 0.35 ) - 0.15, 0.18, 3.0, cz + s * ( W / 2 + 0.35 ) + 0.15, post );
		F.col( - 0.18, 0, cz + s * ( W / 2 + 0.35 ) - 0.15, 0.18, 3.0, cz + s * ( W / 2 + 0.35 ) + 0.15, 2 );
		for ( const ax of [ - 1, 1 ] ) F.rbox( ax * 0.55, h + 0.02, cz + s * ( W / 2 - 0.1 ), 0.6, 0.04, 0.05, post, ax * s * 0.5 );
	}
	F.box( - 0.2, 2.95, cz - W / 2 - 0.5, 0.2, 3.05, cz + W / 2 + 0.5, post );
	car( F, { lift: h - 0.18, len: len - 0.2, noWheel: R() < 0.3 } );
	return F;
}

export function tyreStack( F, n = 4 ) {
	const R = F.O.R, t = paint( [ 26, 26, 28 ] );
	for ( let i = 0; i < n; i ++ ) F.cyl( ( R() - 0.5 ) * 0.04, i * 0.21, 0.36 + ( R() - 0.5 ) * 0.04, 0.33, 0.2, 14, t ).cyl( 0, i * 0.21 + 0.2, 0.36, 0.2, 0.006, 12, paint( [ 60, 60, 62 ] ), 1 );
	F.col( - 0.34, 0, 0.02, 0.34, n * 0.21, 0.7, 5 );
	return F;
}

// a red roll cabinet of drawers with a top box
export function toolChest( F, loot = 'toolbox' ) {
	const R = F.O.R, m = gloss( pickOf( R, [ [ 180, 30, 26 ], [ 30, 60, 130 ], [ 40, 40, 44 ] ] ) );
	F.box( - 0.4, 0.08, 0, 0.4, 1.0, 0.5, m ).box( - 0.36, 1.0, 0.04, 0.36, 1.35, 0.46, m );
	for ( let k = 0; k < 6; k ++ ) F.box( - 0.37, 0.14 + k * 0.14, 0.5, 0.37, 0.145 + k * 0.14, 0.505, DARK ).box( - 0.3, 0.2 + k * 0.14, 0.5, 0.3, 0.212 + k * 0.14, 0.52, CHROME );
	for ( const [ x, z ] of [ [ - 0.33, 0.06 ], [ 0.33, 0.06 ], [ - 0.33, 0.44 ], [ 0.33, 0.44 ] ] ) F.cyl( x, 0, z, 0.035, 0.08, 6, BLACK );
	F.col( - 0.4, 0, 0, 0.4, 1.35, 0.5, 2 );
	F.container( - 0.4, 0, 0, 0.4, 1.35, 0.5, 'Tool chest', loot, 30 );
	F.shadow( - 0.4, 0, 0.4, 0.5, 0.8 );
	return F;
}

// a workbench with a vice and a pegboard of tools, a toolbox on top
export function workbench( F, w = 1.8, loot = 'toolbox', table = 'house_garage' ) {
	const R = F.O.R;
	const m = wood( [ 150, 120, 80 ] );
	F.box( - w / 2, 0.86, 0, w / 2, 0.92, 0.7, m );
	legs( F, - w / 2, 0.02, w / 2, 0.68, 0.86, metal( [ 90, 90, 90 ] ), 0.06 );
	F.box( - w / 2 + 0.04, 0.15, 0.04, w / 2 - 0.04, 0.18, 0.66, m );
	// pegboard with tool silhouettes
	F.box( - w / 2, 1.0, 0, w / 2, 1.95, 0.02, M( L.plain, [ 170, 140, 100 ], 1, F_IN ) );
	const f = F.fine();
	for ( let i = 0; i < 7; i ++ ) {
		const x = - w / 2 + 0.18 + i * ( w - 0.36 ) / 6, k = i % 4;
		const tm = paint( [ [ 60, 60, 64 ], [ 190, 40, 30 ], [ 200, 200, 204 ], [ 40, 90, 170 ] ][ ( i * 7 ) % 4 ] );
		if ( k === 0 ) f.box( x - 0.012, 1.3, 0.02, x + 0.012, 1.62, 0.035, tm ).box( x - 0.05, 1.58, 0.02, x + 0.05, 1.63, 0.04, tm );
		else if ( k === 1 ) f.box( x - 0.015, 1.25, 0.02, x + 0.015, 1.6, 0.03, tm ).box( x - 0.03, 1.55, 0.02, x + 0.03, 1.62, 0.035, tm );
		else if ( k === 2 ) f.rbox( x, 1.45, 0.028, 0.012, 0.18, 0.008, tm, 0, 0, 0.3 );
		else f.box( x - 0.07, 1.35, 0.02, x + 0.07, 1.42, 0.05, tm ).box( x - 0.02, 1.42, 0.02, x + 0.02, 1.52, 0.04, tm );
	}
	// the vice at one end
	f.box( w / 2 - 0.3, 0.92, 0.5, w / 2 - 0.1, 1.02, 0.66, paint( [ 50, 70, 110 ] ) ).box( w / 2 - 0.27, 1.02, 0.52, w / 2 - 0.13, 1.1, 0.64, paint( [ 50, 70, 110 ] ) );
	// a toolbox on top
	F.box( 0.1, 0.92, 0.15, 0.6, 1.14, 0.45, gloss( [ 180, 30, 26 ] ) ).box( 0.25, 1.14, 0.28, 0.45, 1.18, 0.32, BLACK );
	scatter( F, - w / 2 + 0.1, 0.2, - 0.1, 0.6, 0.92, 2, [ SMALL.can, SMALL.bottle, ( f2, x, y, z, R2 ) => f2.rbox( x, y + 0.02, z, 0.12, 0.02, 0.02, paint( [ 60, 60, 64 ] ), R2() * 3 ) ] );
	F.col( - w / 2, 0, 0, w / 2, 0.92, 0.7, 2, 2 );
	F.container( 0.1, 0.92, 0.15, 0.6, 1.14, 0.45, 'Toolbox', loot, 16 );
	F.spot( - w / 4, 0.92, 0.35, table, 0.5 );
	F.shadow( - w / 2, 0, w / 2, 0.7, 0.7 );
	return F;
}

// steel shelving with cartons and paint cans
export function storageShelf( F, w = 1.8, h = 1.9, d = 0.5, loot = 'house_garage', label = 'Shelf', o = {} ) {
	const R = F.O.R;
	const fm = o.m || metal( [ 150, 154, 156 ] );
	const n = Math.max( 3, Math.round( h / 0.5 ) );
	for ( const x of [ - w / 2, w / 2 - 0.04 ] ) for ( const z of [ 0, d - 0.04 ] ) F.box( x, 0, z, x + 0.04, h, z + 0.04, fm, 12 );
	const f = F.fine();
	for ( let k = 0; k <= n; k ++ ) {
		const y = 0.08 + k * ( h - 0.1 ) / n;
		F.box( - w / 2, y - 0.02, 0, w / 2, y, d, fm );
		if ( k === n ) break;
		// what's on this shelf: cartons, tins, jugs; gaps where it was taken
		let x = - w / 2 + 0.06;
		const sh = ( h - 0.1 ) / n - 0.06;
		while ( x < w / 2 - 0.15 ) {
			const u = R();
			if ( u < 0.22 ) { x += 0.15 + R() * 0.3; continue; }
			if ( u < 0.62 ) { const bw = 0.25 + R() * 0.2, bh = Math.min( sh, 0.18 + R() * 0.2 ); if ( x + bw > w / 2 - 0.04 ) break; ( R() < 0.5 ? F : f ).box( x, y, 0.04 + R() * 0.05, x + bw, y + bh, d - 0.04, o.goods || card() ); x += bw + 0.02; }
			else if ( u < 0.82 ) { f.cyl( x + 0.09, y, d / 2, 0.085, Math.min( sh, 0.19 ), 10, metal( pickOf( R, [ [ 200, 200, 204 ], [ 190, 60, 40 ], [ 40, 90, 160 ] ] ) ) ); x += 0.2; }
			else { f.box( x, y, 0.1, x + 0.14, y + Math.min( sh, 0.28 ), 0.24, gloss( pickOf( R, [ [ 230, 200, 40 ], [ 40, 120, 60 ], [ 200, 40, 30 ], [ 240, 240, 236 ] ] ) ) ); x += 0.17; }
		}
		F.spot( ( R() - 0.5 ) * ( w - 0.3 ), y, d - 0.08, loot, 0.2 );
	}
	F.col( - w / 2, 0, 0, w / 2, h, d - 0.12, 2 );
	F.container( - w / 2, 0, 0, w / 2, h, d - 0.14, label, loot, 30 );
	F.shadow( - w / 2, 0, w / 2, d, 0.6 );
	return F;
}

export function drum( F, c = [ 40, 80, 150 ] ) {
	F.cyl( 0, 0, 0.3, 0.29, 0.88, 12, M( L.spandrel, c, 1, F_IN ) ).cyl( 0, 0.3, 0.3, 0.295, 0.03, 12, metal( c.map( v => v * 0.8 ) ), 0 ).cyl( 0, 0.6, 0.3, 0.295, 0.03, 12, metal( c.map( v => v * 0.8 ) ), 0 );
	F.col( - 0.29, 0, 0.01, 0.29, 0.88, 0.59, 2 );
	return F;
}

export function jerryCan( F, lx, lz, a = 0 ) {
	const f = F.fine();
	f.rbox( lx, 0.24, lz, 0.17, 0.24, 0.08, gloss( [ 190, 30, 26 ] ), a ).rbox( lx, 0.5, lz, 0.1, 0.02, 0.02, gloss( [ 190, 30, 26 ] ), a );
}

// a pull-down aluminium ladder / a bicycle / a lawnmower: garage odds and ends
export function bicycle( F, lx, lz, a = 0 ) {
	const f = F.fine(), R = F.O.R, m = paint( pickOf( R, [ [ 190, 30, 30 ], [ 30, 90, 160 ], [ 40, 40, 44 ], [ 230, 230, 230 ] ] ) );
	const B = f.at( lx, 0, lz, a );
	for ( const x of [ - 0.52, 0.52 ] ) B.cylH( x, 0.34, 0, 0.34, 0.035, 16, paint( [ 30, 30, 32 ] ), 'z' ).cylH( x, 0.34, 0, 0.05, 0.06, 8, CHROME, 'z' );
	B.rbox( - 0.2, 0.52, 0, 0.3, 0.018, 0.018, m, 0, 0, 0.35 ).rbox( 0.15, 0.62, 0, 0.3, 0.018, 0.018, m ).rbox( 0.3, 0.5, 0, 0.018, 0.2, 0.018, m, 0, 0, 0.4 );
	B.box( - 0.3, 0.75, - 0.08, - 0.12, 0.79, 0.08, BLACK ).box( 0.38, 0.86, - 0.25, 0.42, 0.89, 0.25, BLACK );
}
