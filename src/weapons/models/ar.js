// The AR-15 family: M4A1, M16A4, HK416, a civilian AR.
import { THREE, PI, Parts, circle, slot, grip, pistolGrip, trigger, triggerGuard, pins, screw, swivel, buis, muzzleDevice } from './kit.js';

// a polygon circle (for holes: sight apertures, slots)

// the flat-top upper (walls, the port with the carrier behind it, forward assist, brass deflector, rail), the lower (magwell
// flare, controls, pins, fences), an A2 grip, and the charging handle. Proportions from an M4A1: 22 mm upper, 24 mm lower.
function arReceiver( P, g0 ) {
	const uz = 0.0118, ux0 = - 0.128, ux1 = 0.104;
	// upper: two walls (the right one cut by the ejection port, chamfered), a dark core and a chamfered top under the rail
	const wall = [ [ ux0, - 0.017 ], [ ux1, - 0.017 ], [ ux1, 0.027 ], [ ux0, 0.027 ] ];
	P.ext( 'alu', wall, - uz, - 0.0086, 0.0008 );
	P.ext( 'alu', wall, 0.0086, uz, 0.0008, [ [ [ - 0.024, - 0.0065, 0.002 ], [ 0.05, - 0.0065, 0.002 ], [ 0.05, 0.0195, 0.002 ], [ - 0.024, 0.0195, 0.002 ] ] ] );
	P.extFront( 'blk', [ [ - 0.009, - 0.016 ], [ 0.009, - 0.016 ], [ 0.009, 0.026 ], [ - 0.009, 0.026 ] ], ux0 + 0.001, ux1 - 0.001, 0 );
	P.extFront( 'alu', [ [ - uz + 0.0002, 0.0262 ], [ uz - 0.0002, 0.0262 ], [ uz - 0.0002, 0.0286, 0.0012 ], [ 0.0098, 0.0348 ], [ - 0.0098, 0.0348 ], [ - uz + 0.0002, 0.0286, 0.0012 ] ], ux0, ux1, 0.0008 );
	P.rail( 'alu', ux0 + 0.004, ux1 - 0.003, 0.041 );
	// barrel nut
	P.cyl( 'alu', ux1, ux1 + 0.022, 0.0172, 0, 0, 18 );
	for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2 + 0.26; P.boxC( 'alu', ux1 + 0.011, Math.cos( a ) * 0.0172, Math.sin( a ) * 0.0172, 0.018, 0.004, 0.004, 0, [ a, 0, 0 ] ); }
	// forward assist: housing and the knurled plunger, angled up and back on the right
	P.rod( 'alu', [ - 0.056, 0.004, 0.0098 ], [ - 0.09, 0.013, 0.0172 ], 0.0074, 14 );
	P.rod( 'blk', [ - 0.088, 0.0125, 0.0168 ], [ - 0.108, 0.0178, 0.0212 ], 0.0068, 14 );
	for ( let i = 0; i < 3; i ++ ) { const t = 0.2 + i * 0.28; P.rod( 'blk', [ - 0.088 - 0.02 * t, 0.0125 + 0.0053 * t, 0.0168 + 0.0044 * t ], [ - 0.0895 - 0.02 * t, 0.0129 + 0.0053 * t, 0.0171 + 0.0044 * t ], 0.0072, 14 ); }
	// brass deflector behind the port
	P.extTop( 'alu', [ [ - 0.044, 0.0112 ], [ - 0.024, 0.0112 ], [ - 0.026, 0.0182, 0.002 ], [ - 0.037, 0.0172, 0.004 ] ], - 0.004, 0.0262, 0.0008 );
	// dust cover, open: hanging from its hinge under the port, ribbed
	P.cyl( 'steel', - 0.024, 0.05, 0.0013, - 0.0072, 0.0124, 8 );
	P.box( 'alu', - 0.022, 0.048, - 0.029, - 0.008, 0.0122, 0.0134, 0.0006 );
	for ( let i = 0; i < 3; i ++ ) P.box( 'alu', - 0.018 + i * 0.022, - 0.004 + i * 0.022, - 0.02, - 0.017, 0.0132, 0.0138, 0 );
	// lower: side profile (magwell, trigger guard bosses, grip tang, the buffer tower), then the flared magwell lip
	const lz = 0.0122;
	P.extS( 'alu', [ [ - 0.134, - 0.017 ], [ ux1, - 0.017 ], [ 0.107, - 0.024 ], [ 0.11, - 0.066 ], [ 0.046, - 0.066 ], [ 0.046, - 0.047 ], [ - 0.035, - 0.047 ], [ - 0.07, - 0.047 ], [ - 0.106, - 0.042, 0.006 ], [ - 0.134, - 0.03, 0.008 ] ], lz, 0.0012 );
	P.extFront( 'alu', [ [ - 0.0142, - 0.082 ], [ 0.0142, - 0.082 ], [ 0.0142, - 0.066, 0.002 ], [ 0.0122, - 0.058 ], [ - 0.0122, - 0.058 ], [ - 0.0142, - 0.066, 0.002 ] ], 0.044, 0.113, 0.0018 );
	// the buffer tower round the tube's threads
	P.extS( 'alu', [ [ - 0.134, - 0.03 ], [ - 0.122, - 0.03 ], [ - 0.122, - 0.017 ], [ - 0.134, - 0.017 ] ], 0.0135, 0.0015 );
	// trigger guard, trigger, pins
	triggerGuard( P, 'alu', - 0.036, 0.048, - 0.047, 0.031, 0.0045 );
	trigger( P, 0.0, - 0.049 );
	for ( const [ x, y, r ] of [ [ - 0.108, - 0.023, 0.0029 ], [ 0.098, - 0.023, 0.0029 ], [ - 0.016, - 0.034, 0.0017 ], [ 0.012, - 0.034, 0.0017 ] ] ) P.cylZ( r > 0.002 ? 'steelD' : 'blk', x, y, - lz - 0.0009, lz + 0.0009, r, 10 );
	// selector (left lever, right stub), bolt catch (left), mag release and its fence (right)
	P.cylZ( 'blk', - 0.061, - 0.028, - lz - 0.0016, - lz, 0.0056, 12 );
	P.extS( 'blk', [ [ - 0.063, - 0.025 ], [ - 0.04, - 0.029, 0.002 ], [ - 0.042, - 0.034, 0.002 ], [ - 0.063, - 0.031 ] ], 0.0008, 0.0003, - lz - 0.0022 );
	P.cylZ( 'blk', - 0.061, - 0.028, lz, lz + 0.0012, 0.0036, 10 );
	P.extS( 'blk', [ [ 0.03, - 0.021 ], [ 0.056, - 0.021, 0.002 ], [ 0.056, - 0.03, 0.003 ], [ 0.042, - 0.031 ], [ 0.034, - 0.028 ] ], 0.0012, 0.0004, - lz - 0.0012 );
	P.ext( 'alu', [ [ 0.027, - 0.026, 0.002 ], [ 0.05, - 0.026, 0.002 ], [ 0.05, - 0.045, 0.003 ], [ 0.027, - 0.045, 0.003 ] ], lz - 0.0002, lz + 0.0015, 0.0005, [ circle( 0.0385, - 0.0355, 0.0068, 12 ) ] );
	P.cylZ( 'blk', 0.0385, - 0.0355, lz - 0.0002, lz + 0.0021, 0.0055, 14 );
	// A2 pistol grip: rounded, a finger nub, stippled
	const g = pistolGrip( P, 'poly', - 0.036, - 0.046, 0.1, 0.36, 0.036, 0.032, 0.0135, 0.0055, 1 );
	// charging handle (animated with the bolt): the T and its latch
	const ch = P.sub( 'charge', - 0.13, 0.03, 0 );
	ch.extTop( 'alu', [ [ - 0.144, - 0.021, 0.004 ], [ - 0.131, - 0.021, 0.003 ], [ - 0.127, - 0.0065 ], [ - 0.127, 0.0065 ], [ - 0.131, 0.021, 0.003 ], [ - 0.144, 0.021, 0.004 ] ], 0.0266, 0.0344, 0.0012 );
	ch.box( 'alu', - 0.141, - 0.132, 0.0266, 0.0344, - 0.027, - 0.019, 0.0015 );
	// bolt carrier through the port (phosphate), the bolt's lugs at its face
	const bolt = P.sub( 'bolt', 0.0, 0.008, 0.01 );
	bolt.box( 'blk', - 0.03, 0.05, - 0.0055, 0.0185, 0.0072, 0.0096, 0.0012 );
	bolt.box( 'blk', - 0.01, 0.012, 0.0045, 0.011, 0.0092, 0.0099, 0.0005 );
	bolt.cyl( 'steel', 0.04, 0.052, 0.0062, 0.006, 0.004, 12 );
	return g;
}

// the M4's collapsible stock on its buffer tube: a sleeve round the tube, the web with its pocket, the butt pad, the
// adjustment lever and the sling slot. x0: where the tube leaves the receiver
function carStock( P, x0 ) {
	P.cyl( 'alu', x0 - 0.21, x0, 0.0152, 0.004, 0, 18 );
	P.box( 'alu', x0 - 0.2, x0 - 0.014, - 0.0162, - 0.0098, - 0.0045, 0.0045, 0.001 );
	for ( let i = 0; i < 6; i ++ ) P.box( 'blk', x0 - 0.19 + i * 0.018, x0 - 0.184 + i * 0.018, - 0.0166, - 0.0142, - 0.0035, 0.0035, 0 );
	// castle nut (notched) and the end plate with its sling loop
	P.cyl( 'alu', x0 - 0.014, x0 - 0.002, 0.0188, 0.004, 0, 18 );
	for ( let i = 0; i < 8; i ++ ) { const a = i / 8 * PI * 2; P.boxC( 'blk', x0 - 0.012, 0.004 + Math.cos( a ) * 0.0184, Math.sin( a ) * 0.0184, 0.006, 0.003, 0.0034, 0, [ a, 0, 0 ] ); }
	P.cyl( 'blk', x0 - 0.002, x0 + 0.001, 0.0205, 0.004, 0, 18 );
	P.put( 'steel', new THREE.TorusGeometry( 0.0065, 0.0014, 6, 12, PI ), [ x0 - 0.001, 0.004, - 0.024 ], [ PI / 2, PI / 2, 0 ] );
	// the stock slides on the tube: body from xb to the butt
	const xb = x0 - 0.235, xe = x0 - 0.087;
	P.cyl( 'poly', xb, xe, 0.0196, 0.004, 0, 18, 0.0186 );
	P.cyl( 'poly', xe, xe + 0.004, 0.0186, 0.004, 0, 18, 0.0172 );
	// web under the sleeve: an outer frame round a pocket, the pocket's floor, the butt
	const web = [ [ xe, - 0.008 ], [ xb + 0.004, - 0.008 ], [ xb + 0.002, - 0.07, 0.006 ], [ xb + 0.024, - 0.073, 0.004 ], [ xe - 0.046, - 0.03, 0.012 ], [ xe - 0.012, - 0.015, 0.006 ] ];
	const pocket = [ [ xb + 0.066, - 0.02, 0.003 ], [ xb + 0.012, - 0.02, 0.003 ], [ xb + 0.012, - 0.058, 0.005 ], [ xb + 0.026, - 0.06, 0.004 ] ];
	P.extS( 'poly', web, 0.0128, 0.0035, 0, [ pocket ] );
	P.extS( 'poly', web, 0.0086, 0.001 );
	P.extS( 'rubber', [ [ xb + 0.004, 0.0255, 0.007 ], [ xb - 0.011, 0.0245, 0.006 ], [ xb - 0.013, - 0.072, 0.008 ], [ xb + 0.004, - 0.076, 0.005 ] ], 0.0168, 0.0045 );
	for ( let i = 0; i < 5; i ++ ) P.box( 'rubber', xb - 0.0135, xb - 0.011, 0.012 - i * 0.018, 0.016 - i * 0.018, - 0.013, 0.013, 0 );
	// adjustment lever under the front, sling slot at the toe
	P.extS( 'poly', [ [ xe - 0.03, - 0.013 ], [ xe + 0.004, - 0.013 ], [ xe + 0.004, - 0.019, 0.003 ], [ xe - 0.012, - 0.024, 0.004 ], [ xe - 0.03, - 0.02 ] ], 0.0055, 0.0015 );
	P.ext( 'blk', [ [ xb + 0.012, - 0.068 ], [ xb + 0.03, - 0.07 ], [ xb + 0.03, - 0.082, 0.004 ], [ xb + 0.012, - 0.08, 0.004 ] ], - 0.004, 0.004, 0.0008, [ [ [ xb + 0.016, - 0.073 ], [ xb + 0.026, - 0.074 ], [ xb + 0.026, - 0.078 ], [ xb + 0.016, - 0.077 ] ] ] );
	return xb - 0.013;
}

export function arRifle( o ) {
	const P = new Parts();
	const v = o.v || 'm4';
	// the barrel's length runs from the chamber (x 0.065, inside the upper): 14.5" carbines, the M16's 20", a 16" civilian
	const barrelL = { m4: 0.368, m16: 0.508, '416': 0.368, civ: 0.406 }[ v ];
	const bEnd = 0.065 + barrelL - ( v === 'm4' ? 0.025 : 0 );
	const hgEnd = { m4: 0.292, m16: 0.43, '416': 0.37, civ: 0.4 }[ v ];
	const g = arReceiver( P );
	// stock
	let stockX;
	if ( v === 'm16' ) {
		// fixed A2 stock: the tube is inside it
		P.cyl( 'alu', - 0.14, - 0.128, 0.019, 0.004, 0, 16 );
		P.extR( 'poly', [ [ - 0.14, 0.022, 0.003 ], [ - 0.43, 0.025, 0.006 ], [ - 0.436, - 0.088, 0.006 ], [ - 0.4, - 0.09, 0.004 ], [ - 0.2, - 0.045, 0.02 ], [ - 0.14, - 0.032, 0.006 ] ], 0.0172, 0.0055 );
		P.extS( 'rubber', [ [ - 0.432, 0.026 ], [ - 0.447, 0.026, 0.004 ], [ - 0.447, - 0.09, 0.004 ], [ - 0.432, - 0.09 ] ], 0.0185, 0.003 );
		P.box( 'poly', - 0.425, - 0.39, - 0.07, - 0.024, 0.0165, 0.0185, 0.0015 ); // trapdoor
		for ( let i = 0; i < 6; i ++ ) P.box( 'rubber', - 0.4482, - 0.4472, 0.016 - i * 0.02, 0.022 - i * 0.02, - 0.016, 0.016, 0 );
		swivel( P, - 0.35, - 0.062, 0, 0.008 );
		stockX = - 0.447;
	} else stockX = carStock( P, - 0.128 );
	// barrel: phosphate, the M4 profile steps down past the front sight
	const fsx = v === 'm16' ? bEnd - 0.055 : v === 'm4' ? bEnd - 0.096 : 0;
	const step = Math.min( 0.29, bEnd - 0.12 );
	P.lathe( 'blk', [ [ 0.126, 0 ], [ 0.126, 0.0096 ], [ step, 0.0094 ], [ step + 0.002, 0.0082 ], [ bEnd - 0.004, 0.0078 ], [ bEnd, 0.0074 ], [ bEnd, 0 ] ], 0, 0, 16 );
	// handguard
	if ( v === 'm4' || v === 'm16' ) {
		// rail system: an octagon with a rail on each flat, vents on the chamfers, ladder covers left and below
		const a = 0.0105, b = 0.029;
		P.extFront( 'alu', [ [ a, b, 0.0015 ], [ b, a, 0.0015 ], [ b, - a, 0.0015 ], [ a, - b, 0.0015 ], [ - a, - b, 0.0015 ], [ - b, - a, 0.0015 ], [ - b, a, 0.0015 ], [ - a, b, 0.0015 ] ], 0.126, hgEnd, 0.0015 );
		P.rail( 'alu', 0.13, hgEnd - 0.003, 0.035, 0.0105, 'top' );
		P.rail( 'alu', 0.13, hgEnd - 0.003, 0.035, 0.0105, 'right' );
		for ( const [ sy, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) {
			for ( let i = 0; i < 5; i ++ ) {
				const x = 0.15 + i * ( hgEnd - 0.175 ) / 4;
				P.boxC( 'rubber', x, sy * 0.0203, sz * 0.0203, 0.014, 0.0012, 0.0052, 0, [ sy * sz * PI / 4, 0, 0 ] );
			}
		}
		// ladder covers over the left and bottom rails (where the support hand sits)
		P.box( 'poly', 0.134, hgEnd - 0.008, - 0.0118, 0.0118, - 0.0372, - 0.0288, 0.0022 );
		P.box( 'poly', 0.134, hgEnd - 0.008, - 0.0372, - 0.0288, - 0.0118, 0.0118, 0.0022 );
		for ( let x = 0.142; x < hgEnd - 0.012; x += 0.012 ) {
			P.box( 'poly', x, x + 0.004, - 0.0112, 0.0112, - 0.0386, - 0.0366, 0 );
			P.box( 'poly', x, x + 0.004, - 0.0386, - 0.0366, - 0.0112, 0.0112, 0 );
		}
		P.cyl( 'blk', hgEnd, hgEnd + 0.006, 0.0222, 0, 0, 16 );
		for ( const s of [ - 1, 1 ] ) P.cylZ( 'steel', 0.138, - 0.018, s * 0.0265, s * 0.0292, 0.0022, 8 );
	} else if ( v === '416' ) {
		P.box( 'alu', 0.126, hgEnd, - 0.027, 0.027, - 0.027, 0.027, 0.01 );
		P.rail( 'alu', 0.128, hgEnd - 0.002, 0.041, 0.0105, 'top' );
		P.box( 'alu', 0.128, hgEnd - 0.002, 0.027, 0.035, - 0.011, 0.011, 0.001 );
		P.rail( 'alu', 0.13, hgEnd - 0.004, - 0.036, 0.0105, 'bottom' );
		P.rail( 'alu', 0.13, hgEnd - 0.004, 0.036, 0.0105, 'right' );
		P.rail( 'alu', 0.13, hgEnd - 0.004, - 0.036, 0.0105, 'left' );
	} else {
		// free-float M-LOK handguard: a slim octagon, the slots down its flanks and belly, the top rail
		const o8 = [];
		for ( let i = 0; i < 8; i ++ ) { const a = ( i + 0.5 ) / 8 * PI * 2; o8.push( [ Math.cos( a ) * 0.0272, Math.sin( a ) * 0.0272 - 0.002, 0.002 ] ); }
		P.extFront( 'alu', o8, 0.126, hgEnd, 0.0015 );
		P.rail( 'alu', 0.128, hgEnd - 0.002, 0.041, 0.0105, 'top' );
		P.box( 'alu', 0.128, hgEnd - 0.002, 0.022, 0.035, - 0.011, 0.011, 0.001 );
		for ( let i = 0; i < 6; i ++ ) {
			const x = 0.15 + i * ( hgEnd - 0.18 ) / 5;
			for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', slot( x, x + 0.03, - 0.002, 0.0036, 3 ), 0.0004, 0.0002, s * 0.0252 );
			P.boxC( 'rubber', x + 0.015, - 0.0275, 0, 0.032, 0.0006, 0.0072, 0.0012 );
		}
		P.lathe( 'alu', [ [ 0.126, 0.0262 ], [ 0.134, 0.0262 ] ], 0, 0, 18 );
	}
	// front sight: the A2 base on the gas block (m4, m16) or a folding sight (416, civ)
	const sightH = 0.066;
	if ( fsx ) {
		P.cyl( 'blk', fsx - 0.018, fsx + 0.018, 0.0138, 0, 0, 16 );
		P.extS( 'blk', [ [ fsx - 0.02, 0.004 ], [ fsx + 0.017, 0.004 ], [ fsx + 0.012, 0.028, 0.004 ], [ fsx + 0.009, 0.045 ], [ fsx - 0.01, 0.045 ], [ fsx - 0.016, 0.028, 0.004 ] ], 0.0085, 0.0015 );
		for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ fsx - 0.0095, 0.043 ], [ fsx + 0.0095, 0.043 ], [ fsx + 0.0095, 0.069, 0.007 ], [ fsx - 0.0095, 0.069, 0.007 ] ], s > 0 ? 0.0056 : - 0.0096, s > 0 ? 0.0096 : - 0.0056, 0.001 );
		P.cylY( 'blk', fsx, 0.043, 0.05, 0.0042, 0, 10 );
		P.box( 'blk', fsx - 0.0019, fsx + 0.0019, 0.049, sightH, - 0.0015, 0.0015, 0.0003 );
		P.box( 'blk', fsx - 0.005, fsx + 0.015, - 0.028, - 0.012, - 0.0038, 0.0038, 0.0012 ); // bayonet lug
		swivel( P, fsx - 0.004, - 0.012, 0, 0.0085 );
		P.cylZ( 'steel', fsx - 0.012, 0.0, - 0.0142, 0.0142, 0.0016, 8 ); // taper pins
		P.cylZ( 'steel', fsx + 0.012, 0.0, - 0.0142, 0.0142, 0.0016, 8 );
	} else {
		const f = P.sub( 'buisF', hgEnd - 0.02, 0.045, 0 );
		const x = hgEnd - 0.02;
		f.box( 'blk', x - 0.012, x + 0.012, 0.045, 0.052, - 0.011, 0.011, 0.001 );
		for ( const s of [ - 1, 1 ] ) f.ext( 'blk', [ [ x - 0.005, 0.05 ], [ x + 0.005, 0.05 ], [ x + 0.005, 0.071, 0.004 ], [ x - 0.005, 0.071, 0.004 ] ], s > 0 ? 0.005 : - 0.009, s > 0 ? 0.009 : - 0.005, 0.0008 );
		f.box( 'blk', x - 0.0019, x + 0.0019, 0.05, sightH, - 0.0015, 0.0015, 0.0003 );
	}
	// A2 birdcage: five slots round the top and sides, the bottom closed
	const mz = muzzleDevice( P, 'birdcage', bEnd, 0.0109, 0.052 );
	// rear sight: a folding aperture (the M16's is in its carry handle)
	const rearX = - 0.1;
	if ( v === 'm16' ) {
		const c = P.sub( 'carry', 0, 0.045, 0 );
		c.extS( 'alu', [ [ - 0.118, 0.045 ], [ 0.05, 0.045 ], [ 0.05, 0.058, 0.006 ], [ 0.03, 0.098, 0.01 ], [ - 0.078, 0.098, 0.004 ], [ - 0.084, 0.08 ], [ - 0.118, 0.08, 0.004 ] ], 0.0105, 0.0025,
			0, [ [ [ - 0.07, 0.055 ], [ 0.02, 0.055 ], [ 0.02, 0.085, 0.01 ], [ - 0.07, 0.085, 0.005 ] ] ] );
		c.box( 'blk', - 0.106, - 0.094, 0.06, 0.074, - 0.009, 0.009, 0.0015 );
		c.torusX( 'blk', - 0.1, sightH, 0, 0.0032, 0.0014, 10 );
		c.cylZ( 'blk', - 0.09, 0.07, 0.0105, 0.016, 0.006, 10 ); // windage knob
	} else {
		const r = P.sub( 'buisR', rearX, 0.045, 0 );
		r.box( 'blk', rearX - 0.015, rearX + 0.012, 0.0448, 0.0525, - 0.011, 0.011, 0.0012 );
		r.cylZ( 'blk', rearX - 0.004, 0.049, 0.011, 0.016, 0.0045, 12 ); // clamp knob
		for ( const s of [ - 1, 1 ] ) r.ext( 'blk', [ [ rearX - 0.0055, 0.051 ], [ rearX + 0.0055, 0.051 ], [ rearX + 0.004, 0.075, 0.004 ], [ rearX - 0.004, 0.075, 0.004 ] ], s > 0 ? 0.0062 : - 0.0102, s > 0 ? 0.0102 : - 0.0062, 0.0008 );
		r.extFront( 'blk', [ [ - 0.0064, 0.0515 ], [ 0.0064, 0.0515 ], [ 0.0064, 0.071, 0.003 ], [ - 0.0064, 0.071, 0.003 ] ], rearX - 0.0016, rearX + 0.0016, 0.0005, 3, [ circle( 0, sightH, 0.0021, 12 ) ] );
	}
	const hideWithOptic = v === 'm16' ? [ 'carry' ] : [ 'buisR', 'buisF' ];
	return {
		P, info: {
			sightH, rearX, eyeBack: 0.085, muzzle: [ mz, 0, 0 ], eject: [ 0.01, 0.01, 0.018 ],
			mag: { p: [ 0.083, - 0.022, 0 ], rake: 0 },
			optic: [ - 0.03, 0.0448 ], light: [ hgEnd - 0.05, 0.0, 0.0388 ], hideWithOptic,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ 0.0, - 0.058, 0 ] } ),
				L: grip( [ Math.min( 0.23, hgEnd - 0.07 ), - 0.004, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.03 ),
			},
			stock: stockX, len: mz - stockX, charge: 'charge', bolt: 'bolt', boltTravel: 0.075,
		},
	};
}

