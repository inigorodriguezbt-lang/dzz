// Modern service rifles: FN SCAR-L, HK G36, Steyr AUG, FN FAL, M14 EBR.
import { THREE, PI, Parts, circle, slot, grip, pistolGrip, triggerGuard, trigger, pins, screw, swivel, buis, muzzleDevice } from './kit.js';

// ---- FN SCAR-L (Mk 16) ----
// A one-piece aluminium upper (FDE anodised) from the stock hinge to the end of the handguard, its top rail machined in,
// bolt-on side and bottom rails at the front; a polymer lower with the magwell and grip; the non-reciprocating
// charging handle on the left; a side-folding, telescoping stock with a cheek riser.
export function scar() {
	const P = new Parts();
	const bEnd = 0.39, hz = 0.0172, hw = 0.0205, top = 0.037;
	// upper: the receiver section, then the deeper, wider handguard section
	P.extFront( 'tanM', [ [ - hz, - 0.0165 ], [ hz, - 0.0165 ], [ hz, 0.03 ], [ hz - 0.0045, top ], [ - hz + 0.0045, top ], [ - hz, 0.03 ] ], - 0.179, 0.122, 0.0012 );
	P.extFront( 'tanM', [ [ - hw, - 0.0235 ], [ hw, - 0.0235 ], [ hw, 0.028 ], [ hz - 0.0045, top ], [ - hz + 0.0045, top ], [ - hw, 0.028 ] ], 0.116, 0.262, 0.0015 );
	// the step between them is chamfered down to the receiver's walls
	for ( const s of [ - 1, 1 ] ) P.extS( 'tanM', [ [ 0.104, - 0.0165 ], [ 0.12, - 0.0235 ], [ 0.12, 0.028 ], [ 0.104, 0.028 ] ], 0.0016, 0.0005, s * ( hz + 0.0012 ) );
	P.rail( 'tanM', - 0.175, 0.256, 0.043, 0.0105 );
	P.rail( 'blk', 0.132, 0.252, 0.0265, 0.0105, 'right' );
	P.rail( 'blk', 0.132, 0.252, - 0.0265, 0.0105, 'left' );
	P.rail( 'blk', 0.132, 0.252, - 0.0295, 0.0105, 'bottom' );
	// the rails' screws, and the cooling holes along the handguard's flanks under them
	for ( const x of [ 0.146, 0.238 ] ) for ( const s of [ - 1, 1 ] ) screw( P, x, - 0.0168, s * hw, 'z', s, 0.0019, 'blk', true );
	// charging handle slots (both sides: it can be swapped over), the ejection port and its deflector
	for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', slot( - 0.118, 0.11, 0.021, 0.0028 ), 0.0004, 0.0002, s * hz );
	P.box( 'rubber', - 0.036, 0.031, - 0.0095, 0.0145, hz - 0.0006, hz + 0.0002, 0.0018 );
	P.extS( 'tanM', [ [ - 0.06, - 0.004 ], [ - 0.038, - 0.006 ], [ - 0.038, 0.016 ], [ - 0.052, 0.016, 0.004 ] ], 0.0022, 0.0008, hz + 0.0016 );
	// the bolt carrier behind the port (it cycles: 'bolt')
	const bolt = P.sub( 'bolt', 0.0, 0.002, 0.012 );
	bolt.box( 'blk', - 0.1, 0.03, - 0.0075, 0.0125, 0.0105, 0.0162, 0.0012 );
	bolt.box( 'steel', 0.012, 0.03, - 0.004, 0.009, 0.0158, 0.0166, 0.0005 );
	bolt.box( 'blk', - 0.026, - 0.008, - 0.004, 0.005, 0.016, 0.0167, 0.0006 );
	// the hinge for the stock, and the sling point beside it
	P.box( 'tanM', - 0.191, - 0.177, - 0.0145, 0.034, - 0.0165, 0.0165, 0.003 );
	P.cylY( 'steel', - 0.186, - 0.012, 0.031, 0.0033, - 0.0172, 10 );
	P.cylZ( 'blk', - 0.165, 0.0, - hz - 0.004, - hz, 0.0055, 12 );
	P.cylZ( 'rubber', - 0.165, 0.0, - hz - 0.0045, - hz - 0.0035, 0.0028, 8 );
	// gas block and the regulator under the end of the handguard
	P.cyl( 'blk', 0.258, 0.292, 0.0138, - 0.002, 0, 16 );
	P.box( 'blk', 0.262, 0.29, - 0.0215, - 0.008, - 0.008, 0.008, 0.002 );
	P.boxC( 'blk', 0.288, - 0.019, 0.009, 0.006, 0.014, 0.003, 0.001, [ 0, 0, - 0.3 ] );
	// barrel: phosphate, a step down and the thread at the muzzle
	P.lathe( 'blk', [ [ 0.262, 0 ], [ 0.262, 0.0108 ], [ 0.3, 0.0104 ], [ 0.3, 0.0094 ], [ bEnd - 0.012, 0.0092 ], [ bEnd - 0.01, 0.0082 ], [ bEnd, 0.0082 ], [ bEnd, 0 ] ], 0, 0, 16 );
	const mz = muzzleDevice( P, 'prong', bEnd - 0.002, 0.0112, 0.054 );
	// lower: polymer, the magwell flared at the bottom, the guard moulded in, ambidextrous controls
	const lz = 0.0158;
	P.extS( 'tan', [ [ - 0.165, - 0.0165 ], [ 0.122, - 0.0165 ], [ 0.122, - 0.032, 0.002 ], [ 0.117, - 0.078 ], [ 0.048, - 0.078 ], [ 0.045, - 0.05 ], [ - 0.042, - 0.05 ], [ - 0.116, - 0.041, 0.006 ], [ - 0.165, - 0.027, 0.01 ] ], lz, 0.0025 );
	P.extFront( 'tan', [ [ - lz - 0.0016, - 0.087 ], [ lz + 0.0016, - 0.087 ], [ lz + 0.0016, - 0.077, 0.002 ], [ lz - 0.0004, - 0.071 ], [ - lz + 0.0004, - 0.071 ], [ - lz - 0.0016, - 0.077, 0.002 ] ], 0.044, 0.122, 0.0016 );
	// the magwell's side panels are recessed a little; a ridge runs along the top of the lower
	for ( const s of [ - 1, 1 ] ) P.extS( 'tan', [ [ 0.056, - 0.03 ], [ 0.11, - 0.03 ], [ 0.108, - 0.066, 0.003 ], [ 0.058, - 0.066, 0.003 ] ], 0.0012, 0.0006, s * ( lz + 0.0004 ) );
	triggerGuard( P, 'tan', - 0.038, 0.05, - 0.048, 0.03, 0.0052 );
	trigger( P, 0.0, - 0.05 );
	const g = pistolGrip( P, 'tan', - 0.036, - 0.046, 0.1, 0.34, 0.036, 0.032, 0.0145, 0.0045, 1 );
	// selector (lever left, stub right), mag release (button right, paddle in front of the guard), bolt release left
	P.cylZ( 'blk', - 0.062, - 0.03, - lz - 0.0016, - lz, 0.0058, 12 );
	P.extS( 'blk', [ [ - 0.064, - 0.027 ], [ - 0.04, - 0.031, 0.002 ], [ - 0.042, - 0.036, 0.002 ], [ - 0.064, - 0.033 ] ], 0.0009, 0.0003, - lz - 0.0024 );
	P.extS( 'blk', [ [ - 0.064, - 0.027 ], [ - 0.048, - 0.029, 0.002 ], [ - 0.05, - 0.034, 0.002 ], [ - 0.064, - 0.033 ] ], 0.0009, 0.0003, lz + 0.0024 );
	P.cylZ( 'blk', 0.04, - 0.036, lz - 0.0002, lz + 0.0022, 0.0052, 12 );
	P.extS( 'blk', [ [ 0.045, - 0.052 ], [ 0.058, - 0.052 ], [ 0.056, - 0.062, 0.002 ], [ 0.046, - 0.061 ] ], 0.0045, 0.001 );
	P.extS( 'blk', [ [ 0.012, - 0.019 ], [ 0.046, - 0.021, 0.002 ], [ 0.048, - 0.027, 0.002 ], [ 0.012, - 0.026 ] ], 0.0009, 0.0003, - lz - 0.0012 );
	pins( P, [ [ 0.113, - 0.022, 0.0028 ], [ - 0.152, - 0.022, 0.0028 ], [ - 0.014, - 0.036 ], [ 0.012, - 0.036 ] ], lz );
	// stock: the hinged front frame, the telescoping body with its cheek riser, the pad
	P.extS( 'tan', [ [ - 0.188, 0.031 ], [ - 0.31, 0.031 ], [ - 0.31, - 0.036 ], [ - 0.188, - 0.0175 ] ], 0.0158, 0.003,
		0, [ [ [ - 0.205, 0.021, 0.004 ], [ - 0.292, 0.021, 0.004 ], [ - 0.292, - 0.025, 0.004 ], [ - 0.205, - 0.011, 0.004 ] ] ] );
	P.extS( 'tan', [ [ - 0.288, 0.03 ], [ - 0.424, 0.03, 0.004 ], [ - 0.434, 0.019 ], [ - 0.434, - 0.074, 0.006 ], [ - 0.42, - 0.08, 0.004 ], [ - 0.3, - 0.037, 0.01 ], [ - 0.288, - 0.031 ] ], 0.0168, 0.0035,
		0, [ [ [ - 0.318, 0.018, 0.004 ], [ - 0.408, 0.018, 0.004 ], [ - 0.408, - 0.058, 0.006 ], [ - 0.336, - 0.029, 0.006 ] ] ] );
	P.extS( 'tan', [ [ - 0.312, 0.029 ], [ - 0.414, 0.029 ], [ - 0.414, 0.0405, 0.004 ], [ - 0.332, 0.0405, 0.008 ] ], 0.0176, 0.0035 );
	P.extS( 'rubber', [ [ - 0.433, 0.027 ], [ - 0.448, 0.027, 0.005 ], [ - 0.448, - 0.081, 0.006 ], [ - 0.433, - 0.081 ] ], 0.0182, 0.0035 );
	for ( let i = 0; i < 5; i ++ ) P.box( 'rubber', - 0.4492, - 0.4472, 0.015 - i * 0.022, 0.024 - i * 0.022, - 0.0165, 0.0165, 0 );
	P.cylY( 'blk', - 0.296, - 0.042, - 0.034, 0.0045, 0, 10 );
	swivel( P, - 0.4, - 0.066, 0, 0.0075 );
	buis( P, - 0.15, 0.24, 0.0468, 0.07 );
	// the charging handle: a stem out of the left slot, a knob angled forward
	const ch = P.sub( 'charge', 0.1, 0.02, - 0.018 );
	ch.box( 'blk', 0.095, 0.106, 0.0165, 0.0255, - 0.0285, - 0.0165, 0.0015 );
	ch.cylZ( 'blk', 0.101, 0.021, - 0.042, - 0.0265, 0.0058, 12, 0.0052 );
	ch.cylZ( 'rubber', 0.101, 0.021, - 0.0425, - 0.0418, 0.0045, 10 );
	return { P, info: {
		sightH: 0.07, rearX: - 0.15, eyeBack: 0.09, muzzle: [ mz, 0, 0 ], eject: [ 0.02, 0.012, 0.018 ], mag: { p: [ 0.083, - 0.022, 0 ], rake: 0 },
		optic: [ - 0.03, 0.0468 ], light: [ 0.2, 0.0, 0.0303 ], hideWithOptic: [ 'buisR', 'buisF' ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ 0.0, - 0.058, 0 ] } ), L: grip( [ 0.2, - 0.01, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.03 ) },
		stock: - 0.448, len: mz + 0.448, charge: 'charge', bolt: 'bolt', chargeTravel: 0.1, boltTravel: 0.07, chargeSide: - 1,
	} };
}

// ---- HK G36 ----
// Glass-filled polymer everywhere (HK's dark grey-green): the receiver shell with its moulded panels, a ventilated
// handguard, the trigger module (grip and guard in one piece) pinned under it, the carry handle (here with a rail on
// top and the irons in it), a skeleton stock folding to the right, a four-prong flash hider.
export function g36() {
	const P = new Parts();
	const bEnd = 0.48, hz = 0.0185;
	// receiver: rounded shell, the top flat where the handle bolts on
	P.extFront( 'gray', [ [ - hz, - 0.03, 0.005 ], [ hz, - 0.03, 0.005 ], [ hz, 0.026, 0.004 ], [ hz - 0.004, 0.036, 0.003 ], [ - hz + 0.004, 0.036, 0.003 ], [ - hz, 0.026, 0.004 ] ], - 0.172, 0.08, 0.002, 2 );
	// the moulded panels on its flanks, the ejection port and the brass deflector bump behind it
	for ( const s of [ - 1, 1 ] ) P.extS( 'gray', [ [ - 0.15, - 0.022 ], [ - 0.075, - 0.022 ], [ - 0.07, 0.016, 0.004 ], [ - 0.15, 0.016, 0.004 ] ], 0.001, 0.0006, s * ( hz + 0.0006 ) );
	P.box( 'rubber', - 0.034, 0.03, - 0.006, 0.016, hz - 0.0004, hz + 0.0004, 0.002 );
	P.extS( 'gray', [ [ - 0.064, - 0.004 ], [ - 0.038, - 0.008, 0.004 ], [ - 0.036, 0.02 ], [ - 0.06, 0.02, 0.006 ] ], 0.0035, 0.0012, hz + 0.0025 );
	const bolt = P.sub( 'bolt', 0.0, 0.005, 0.012 );
	bolt.box( 'blk', - 0.09, 0.028, - 0.004, 0.014, 0.0105, 0.0168, 0.0012 );
	bolt.box( 'steel', 0.012, 0.028, - 0.001, 0.011, 0.016, 0.0172, 0.0005 );
	// handguard: deeper and wider, four rows of vent slots each side and a row underneath, the end cap
	const hg = [ [ - 0.0215, - 0.036, 0.008 ], [ 0.0215, - 0.036, 0.008 ], [ 0.0215, 0.024, 0.006 ], [ 0.015, 0.031, 0.004 ], [ - 0.015, 0.031, 0.004 ], [ - 0.0215, 0.024, 0.006 ] ];
	P.extFront( 'gray', hg, 0.074, 0.3, 0.003, 3 );
	for ( let i = 0; i < 5; i ++ ) for ( const s of [ - 1, 1 ] ) for ( const y of [ - 0.016, 0.006 ] ) P.extS( 'rubber', slot( 0.104 + i * 0.037, 0.126 + i * 0.037, y, 0.0035, 3 ), 0.0006, 0.0003, s * 0.0216 );
	for ( let i = 0; i < 5; i ++ ) P.box( 'rubber', 0.104 + i * 0.037, 0.126 + i * 0.037, - 0.0368, - 0.0356, - 0.008, 0.008, 0.002 );
	P.extFront( 'gray', [ [ - 0.019, - 0.034, 0.008 ], [ 0.019, - 0.034, 0.008 ], [ 0.019, 0.022, 0.006 ], [ 0.013, 0.028, 0.004 ], [ - 0.013, 0.028, 0.004 ], [ - 0.019, 0.022, 0.006 ] ], 0.3, 0.312, 0.002 );
	// the bayonet lug and front sling loop under the handguard's end, pins through the front
	P.box( 'blk', 0.3, 0.33, - 0.024, - 0.012, - 0.006, 0.006, 0.0015 );
	P.put( 'steel', new THREE.TorusGeometry( 0.0075, 0.0013, 5, 14 ), [ 0.292, - 0.045, 0 ] );
	pins( P, [ [ 0.06, - 0.022, 0.0022 ], [ 0.29, - 0.022, 0.0022 ] ], 0.0215 );
	// barrel, gas block and the flash hider
	P.lathe( 'blk', [ [ 0.31, 0 ], [ 0.31, 0.0115 ], [ 0.33, 0.0112 ], [ 0.335, 0.0098 ], [ bEnd - 0.01, 0.0094 ], [ bEnd - 0.008, 0.0085 ], [ bEnd, 0.0085 ], [ bEnd, 0 ] ], 0, 0, 16 );
	const mz = muzzleDevice( P, 'prong', bEnd - 0.002, 0.0118, 0.054 );
	// magwell with the mag latch lever behind it (G36 mags clip together: the studs on the mag)
	P.extFront( 'gray', [ [ - 0.0175, - 0.052, 0.004 ], [ 0.0175, - 0.052, 0.004 ], [ 0.0175, - 0.028 ], [ - 0.0175, - 0.028 ] ], 0.028, 0.09, 0.002 );
	P.extS( 'blk', [ [ 0.022, - 0.034 ], [ 0.03, - 0.034 ], [ 0.03, - 0.056, 0.002 ], [ 0.02, - 0.06, 0.003 ] ], 0.0062, 0.0012 );
	// trigger module: grip, guard and the selector in one moulding, pinned to the receiver
	const g = pistolGrip( P, 'gray', - 0.034, - 0.03, 0.1, 0.3, 0.036, 0.032, 0.015, 0.0045, 1 );
	P.extS( 'gray', [ [ - 0.062, - 0.0295 ], [ 0.028, - 0.0295 ], [ 0.026, - 0.064, 0.008 ], [ - 0.02, - 0.068, 0.004 ], [ - 0.04, - 0.04 ], [ - 0.062, - 0.036, 0.004 ] ], 0.0075, 0.002, 0,
		[ [ [ - 0.016, - 0.035 ], [ 0.02, - 0.035 ], [ 0.019, - 0.058, 0.006 ], [ - 0.012, - 0.06 ] ] ] );
	P.extS( 'gray', [ [ - 0.07, - 0.028 ], [ 0.026, - 0.028 ], [ 0.026, - 0.036 ], [ - 0.07, - 0.036, 0.003 ] ], 0.0172, 0.0015 );
	trigger( P, 0.0, - 0.032, 0.017 );
	for ( const s of [ - 1, 1 ] ) {
		P.cylZ( 'blk', - 0.05, - 0.032, s * 0.0172, s * 0.0192, 0.0055, 12 );
		P.extS( 'blk', [ [ - 0.052, - 0.029 ], [ - 0.032, - 0.024, 0.002 ], [ - 0.031, - 0.029, 0.002 ], [ - 0.052, - 0.035 ] ], 0.0008, 0.0003, s * 0.0198 );
	}
	pins( P, [ [ - 0.064, - 0.032, 0.0022 ], [ 0.02, - 0.032, 0.0022 ] ], 0.0172 );
	// carry handle: two posts and the bridge, the rail on top, the irons in its ends
	P.extS( 'gray', [ [ - 0.142, 0.035 ], [ 0.162, 0.035 ], [ 0.162, 0.05, 0.006 ], [ 0.13, 0.0655, 0.004 ], [ - 0.11, 0.0655, 0.004 ], [ - 0.142, 0.052, 0.006 ] ], 0.0125, 0.003,
		0, [ [ [ - 0.088, 0.041, 0.004 ], [ 0.104, 0.041, 0.004 ], [ 0.088, 0.057, 0.004 ], [ - 0.078, 0.057, 0.004 ] ] ] );
	P.rail( 'blk', - 0.098, 0.098, 0.071, 0.0105 );
	for ( const x of [ - 0.12, 0.14 ] ) for ( const s of [ - 1, 1 ] ) screw( P, x, 0.045, s * 0.0125, 'z', s, 0.0022, 'blk', true );
	P.box( 'gray', - 0.146, - 0.12, 0.062, 0.0835, - 0.0105, 0.0105, 0.003 );
	P.extFront( 'blk', [ [ - 0.0065, 0.074 ], [ 0.0065, 0.074 ], [ 0.0065, 0.0945, 0.003 ], [ - 0.0065, 0.0945, 0.003 ] ], - 0.0665, - 0.0615, 0.0005, 3, [ circle( 0, 0.09, 0.0022, 12 ) ] );
	for ( const s of [ - 1, 1 ] ) P.box( 'gray', - 0.074, - 0.054, 0.0705, 0.096, s * 0.0062, s * 0.0098, 0.0012 );
	P.box( 'gray', 0.074, 0.09, 0.0655, 0.0745, - 0.008, 0.008, 0.0015 );
	for ( const s of [ - 1, 1 ] ) P.box( 'gray', 0.074, 0.09, 0.07, 0.094, s * 0.0052, s * 0.0085, 0.0012 );
	P.box( 'blk', 0.0805, 0.0835, 0.072, 0.09, - 0.0011, 0.0011, 0.0003 );
	// skeleton stock folded open: the hinge on the right, top and bottom struts, the butt and its pad
	P.box( 'gray', - 0.186, - 0.17, - 0.024, 0.03, - 0.0175, 0.0195, 0.004 );
	P.cylY( 'blk', - 0.18, - 0.026, 0.032, 0.0038, 0.0205, 10 );
	P.extS( 'gray', [ [ - 0.184, 0.03 ], [ - 0.41, 0.03, 0.008 ], [ - 0.424, 0.018, 0.006 ], [ - 0.426, - 0.078, 0.01 ], [ - 0.398, - 0.082, 0.006 ], [ - 0.184, - 0.02, 0.006 ] ], 0.0155, 0.004,
		0, [ [ [ - 0.205, 0.0165, 0.006 ], [ - 0.395, 0.0165, 0.008 ], [ - 0.4, - 0.058, 0.01 ], [ - 0.226, - 0.011, 0.008 ] ] ] );
	P.extS( 'rubber', [ [ - 0.424, 0.032 ], [ - 0.437, 0.032, 0.005 ], [ - 0.437, - 0.084, 0.006 ], [ - 0.424, - 0.084 ] ], 0.0172, 0.003 );
	P.box( 'rubber', - 0.36, - 0.25, 0.029, 0.033, - 0.0145, 0.0145, 0.0015 );
	swivel( P, - 0.39, - 0.075, 0, 0.0072 );
	// charging handle on the carrier, under the handle's bridge (it folds out to either side)
	const ch = P.sub( 'charge', 0.12, 0.052, 0 );
	ch.box( 'blk', 0.112, 0.132, 0.0355, 0.046, - 0.0055, 0.0055, 0.0015 );
	ch.boxC( 'blk', 0.124, 0.0412, 0.0125, 0.012, 0.0055, 0.014, 0.002, [ 0, 0.35, 0 ] );
	return { P, info: {
		sightH: 0.09, rearX: - 0.064, eyeBack: 0.09, muzzle: [ mz, 0, 0 ], eject: [ 0.0, 0.01, 0.02 ], mag: { p: [ 0.058, - 0.03, 0 ], rake: 0 },
		optic: [ 0.0, 0.0748 ], light: [ 0.26, - 0.004, 0.024 ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ 0.0, - 0.04, 0 ] } ), L: grip( [ 0.19, - 0.008, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.032 ) },
		stock: - 0.437, len: mz + 0.437, charge: 'charge', bolt: 'bolt', chargeTravel: 0.08, boltTravel: 0.07,
	} };
}

// ---- Steyr AUG A1 ----
// A bullpup: the action and the magazine sit in the green polymer stock behind the grip, a big moulded guard encloses the
// trigger hand, the barrel (with its folding foregrip and the gas cylinder over it) plugs into the front of the
// aluminium receiver, which carries the 1.5x optic in its handle. The charging handle runs along the left.
export function aug() {
	const P = new Parts();
	const bEnd = 0.305, hz = 0.024;
	// stock: butt, the magwell behind the grip, the action body forward of it
	P.extS( 'green', [ [ - 0.43, 0.033, 0.008 ], [ - 0.2, 0.036 ], [ 0.072, 0.036, 0.014 ], [ 0.12, 0.012, 0.014 ], [ 0.114, - 0.022, 0.01 ], [ 0.07, - 0.032, 0.006 ],
		[ - 0.255, - 0.034, 0.004 ], [ - 0.262, - 0.034 ], [ - 0.34, - 0.034 ], [ - 0.354, - 0.07, 0.012 ], [ - 0.418, - 0.077, 0.01 ], [ - 0.43, - 0.062, 0.006 ] ], hz, 0.008, 0, [], 4 );
	// the magwell's walls round the mag
	P.extFront( 'green', [ [ - 0.0215, - 0.064, 0.004 ], [ - 0.0135, - 0.064 ], [ - 0.0135, - 0.034 ], [ 0.0135, - 0.034 ], [ 0.0135, - 0.064 ], [ 0.0215, - 0.064, 0.004 ], [ 0.0215, - 0.03 ], [ - 0.0215, - 0.03 ] ], - 0.342, - 0.258, 0.0025 );
	P.cylZ( 'blk', - 0.36, - 0.06, - 0.012, 0.012, 0.0045, 10 ); // mag release, behind the well
	// the ejection port (right; a cover plugs the left one), the bolt behind it
	P.box( 'rubber', - 0.31, - 0.24, - 0.012, 0.018, hz - 0.0006, hz + 0.0004, 0.004 );
	P.box( 'green', - 0.31, - 0.24, - 0.012, 0.018, - hz - 0.0016, - hz + 0.0004, 0.004 );
	const bolt = P.sub( 'bolt', - 0.27, 0.003, 0.015 );
	bolt.box( 'blk', - 0.32, - 0.22, - 0.006, 0.013, 0.012, 0.0222, 0.0015 );
	bolt.box( 'steel', - 0.25, - 0.232, - 0.003, 0.01, 0.022, 0.0228, 0.0006 );
	// the butt's rubber pad and its cheek-weld ridge, sling loop
	P.extS( 'rubber', [ [ - 0.428, 0.032 ], [ - 0.442, 0.031, 0.006 ], [ - 0.442, - 0.074, 0.008 ], [ - 0.428, - 0.076 ] ], hz - 0.001, 0.005 );
	for ( const s of [ - 1, 1 ] ) P.extS( 'green', [ [ - 0.42, 0.01 ], [ - 0.27, 0.014 ], [ - 0.27, - 0.012, 0.01 ], [ - 0.42, - 0.03, 0.01 ] ], 0.0012, 0.0008, s * ( hz + 0.0004 ) );
	swivel( P, - 0.4, - 0.075, 0, 0.0078 );
	// guard: a band from the stock's nose down round the hand to the grip's foot
	P.extS( 'green', [ [ 0.06, - 0.03 ], [ 0.104, - 0.03 ], [ 0.122, - 0.066, 0.016 ], [ 0.1, - 0.13, 0.016 ], [ - 0.05, - 0.133, 0.012 ], [ - 0.066, - 0.118, 0.006 ],
		[ - 0.048, - 0.117 ], [ 0.086, - 0.117, 0.012 ], [ 0.104, - 0.068, 0.012 ], [ 0.086, - 0.036 ] ], 0.0125, 0.004, 0, [], 4 );
	const g = pistolGrip( P, 'green', - 0.02, - 0.03, 0.1, 0.18, 0.036, 0.034, 0.0155, 0.0045, 1 );
	trigger( P, 0.01, - 0.034, 0.02 );
	// cross-bolt safety above the grip (red end out on the left: fire)
	P.cylZ( 'blk', - 0.006, - 0.024, - hz - 0.002, hz + 0.002, 0.0042, 12 );
	P.cylZ( 'red', - 0.006, - 0.024, - hz - 0.0026, - hz - 0.0018, 0.0034, 10 );
	// receiver on the stock, with the optic's handle cast on it
	P.extFront( 'olivM', [ [ - 0.0148, 0.033 ], [ 0.0148, 0.033 ], [ 0.0148, 0.04, 0.003 ], [ 0.011, 0.0435 ], [ - 0.011, 0.0435 ], [ - 0.0148, 0.04, 0.003 ] ], - 0.208, 0.088, 0.0015 );
	// the handle: two cast posts carry the optic, the hand goes through between them
	P.extS( 'olivM', [ [ - 0.205, 0.042 ], [ - 0.148, 0.042 ], [ - 0.14, 0.056, 0.006 ], [ - 0.168, 0.064 ], [ - 0.19, 0.06, 0.006 ] ], 0.011, 0.0025 );
	P.extS( 'olivM', [ [ 0.032, 0.042 ], [ 0.086, 0.042 ], [ 0.084, 0.058, 0.006 ], [ 0.07, 0.064 ], [ 0.024, 0.057, 0.008 ] ], 0.011, 0.0025 );
	// the optic: tube, objective bell, eyepiece with a rubber cup
	P.cyl( 'olivM', - 0.162, 0.054, 0.0182, 0.07, 0, 20 );
	P.lathe( 'olivM', [ [ 0.05, 0.0182 ], [ 0.068, 0.0222 ], [ 0.084, 0.0222 ], [ 0.086, 0.0205 ] ], 0.07, 0, 20 );
	P.lathe( 'olivM', [ [ - 0.18, 0.0195 ], [ - 0.164, 0.0195 ], [ - 0.158, 0.0182 ] ], 0.07, 0, 20 );
	P.lathe( 'rubber', [ [ - 0.196, 0.0215 ], [ - 0.181, 0.0205 ], [ - 0.179, 0.0196 ] ], 0.07, 0, 20 );
	P.cyl( 'coat', 0.0835, 0.0845, 0.019, 0.07, 0, 20 );
	P.cyl( 'lensDark', - 0.1815, - 0.1805, 0.0172, 0.07, 0, 20 );
	P.cyl( 'blk', - 0.03, - 0.01, 0.0186, 0.07, 0, 20 );
	// charging handle: its slot along the left of the receiver, the knob out to the side
	P.box( 'rubber', - 0.11, 0.07, 0.036, 0.042, - 0.0154, - 0.0144, 0.001 );
	const ch = P.sub( 'charge', 0.0, 0.03, - 0.02 );
	ch.box( 'blk', - 0.004, 0.01, 0.0355, 0.0425, - 0.028, - 0.014, 0.0015 );
	ch.cylZ( 'blk', 0.003, 0.039, - 0.04, - 0.027, 0.0055, 12, 0.005 );
	// barrel: the collar at the stock's nose, the gas cylinder and its regulator over it, the folding foregrip under it
	P.cyl( 'olivM', 0.1, 0.13, 0.0165, 0.004, 0, 16 );
	P.lathe( 'blk', [ [ 0.12, 0 ], [ 0.12, 0.0118 ], [ 0.23, 0.0112 ], [ 0.236, 0.0102 ], [ bEnd - 0.01, 0.0098 ], [ bEnd, 0.0092 ], [ bEnd, 0 ] ], 0, 0, 16 );
	for ( let i = 0; i < 4; i ++ ) P.cyl( 'blk', 0.15 + i * 0.012, 0.155 + i * 0.012, 0.0125, 0, 0, 16 );
	P.cyl( 'blk', 0.112, 0.222, 0.0108, 0.024, 0, 14 );
	P.cyl( 'blk', 0.214, 0.232, 0.0125, 0.024, 0, 14 );
	P.box( 'blk', 0.214, 0.232, 0.0, 0.024, - 0.009, 0.009, 0.002 );
	P.cylZ( 'blk', 0.224, 0.024, 0.0125, 0.017, 0.006, 10 );
	P.box( 'olivM', 0.128, 0.156, - 0.022, 0.0, - 0.01, 0.01, 0.003 );
	P.cylZ( 'steel', 0.142, - 0.016, - 0.0108, 0.0108, 0.0028, 10 );
	P.extS( 'green', [ [ 0.13, - 0.02 ], [ 0.155, - 0.02 ], [ 0.157, - 0.112, 0.006 ], [ 0.128, - 0.112, 0.006 ] ], 0.0125, 0.004 );
	for ( let i = 0; i < 5; i ++ ) P.box( 'green', 0.1265, 0.1585, - 0.04 - i * 0.015, - 0.035 - i * 0.015, - 0.0132, 0.0132, 0.0015 );
	const mz = muzzleDevice( P, 'prong', bEnd - 0.002, 0.0122, 0.057 );
	return { P, info: {
		sightH: 0.07, rearX: - 0.165, eyeBack: 0.07, muzzle: [ mz, 0, 0 ], eject: [ - 0.28, 0.012, 0.024 ], mag: { p: [ - 0.3, - 0.03, 0 ], rake: 0 },
		integratedOptic: { x0: - 0.16, x1: 0.08, y: 0.07, r: 0.017 },
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ 0.01, - 0.045, 0 ] } ), L: grip( [ 0.1425, - 0.07, 0 ], [ 0.05, 1, 0 ], [ - 0.2, 0, - 1 ], 0.014, { vert: 1 } ) },
		stock: - 0.442, len: mz + 0.442, charge: 'charge', bolt: 'bolt', chargeTravel: 0.08, boltTravel: 0.07, chargeSide: - 1, bullpup: 1,
	} };
}

// ---- FN FAL (50.00, synthetic furniture) ----
// The machined steel upper with its stamped dust cover, the rear aperture on the cover's tail, the folding carry handle
// down the left and the non-reciprocating charging handle beside it; the light-alloy trigger frame with the magwell; a
// clamshell handguard with vents, the gas block and front sight, the long four-slot flash hider; the fixed stock.
export function fal() {
	const P = new Parts();
	const bEnd = 0.53, hz = 0.0158;
	P.extFront( 'blk', [ [ - hz, - 0.0135 ], [ hz, - 0.0135 ], [ hz, 0.022 ], [ hz - 0.003, 0.0255 ], [ - hz + 0.003, 0.0255 ], [ - hz, 0.022 ] ], - 0.166, 0.13, 0.001 );
	// dust cover (stamped, crowned) and the rear sight base on its tail
	P.extFront( 'blk', [ [ - 0.0148, 0.024 ], [ 0.0148, 0.024 ], [ 0.0148, 0.0315, 0.005 ], [ 0.0, 0.0375, 0.012 ], [ - 0.0148, 0.0315, 0.005 ] ], - 0.118, 0.026, 0.0008 );
	for ( const x of [ - 0.09, - 0.03 ] ) P.extFront( 'blk', [ [ - 0.0153, 0.024 ], [ 0.0153, 0.024 ], [ 0.0153, 0.0318, 0.005 ], [ 0.0, 0.0381, 0.012 ], [ - 0.0153, 0.0318, 0.005 ] ], x, x + 0.004, 0.0006 );
	P.box( 'blk', - 0.166, - 0.118, 0.024, 0.039, - 0.0125, 0.0125, 0.0025 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ - 0.158, 0.038 ], [ - 0.128, 0.038 ], [ - 0.132, 0.061, 0.004 ], [ - 0.154, 0.061, 0.004 ] ], s * 0.0072, s * 0.0108, 0.0008 );
	P.extFront( 'blk', [ [ - 0.0068, 0.037 ], [ 0.0068, 0.037 ], [ 0.0062, 0.0585, 0.003 ], [ - 0.0062, 0.0585, 0.003 ] ], - 0.1448, - 0.1412, 0.0005, 3, [ circle( 0, 0.054, 0.0018, 12 ) ] );
	P.cylZ( 'blk', - 0.133, 0.044, 0.0108, 0.0142, 0.0042, 10 );
	// the barrel nut ring at the front of the receiver
	P.lathe( 'blk', [ [ 0.126, 0 ], [ 0.126, 0.0172 ], [ 0.138, 0.0172 ], [ 0.142, 0.0155 ], [ 0.142, 0 ] ], 0, 0, 18 );
	// ejection port (right) with the carrier behind it
	P.box( 'rubber', 0.0, 0.074, - 0.0065, 0.0185, hz - 0.0006, hz + 0.0003, 0.002 );
	const bolt = P.sub( 'bolt', 0.03, 0.006, 0.012 );
	bolt.box( 'steel', - 0.05, 0.072, - 0.004, 0.016, 0.0095, 0.0152, 0.0012 );
	bolt.box( 'rubber', 0.012, 0.028, 0.0, 0.012, 0.015, 0.0155, 0.0005 );
	// charging handle slot (left) and the carry handle folded down along the left of the receiver
	P.extS( 'rubber', slot( - 0.02, 0.112, 0.012, 0.0025 ), 0.0004, 0.0002, - hz );
	P.ext( 'blk', [ [ 0.02, 0.03, 0.004 ], [ 0.106, 0.03, 0.004 ], [ 0.106, 0.0, 0.008 ], [ 0.02, 0.0, 0.008 ] ], - hz - 0.0045, - hz - 0.001, 0.0008,
		[ [ [ 0.032, 0.024, 0.003 ], [ 0.094, 0.024, 0.003 ], [ 0.094, 0.007, 0.005 ], [ 0.032, 0.007, 0.005 ] ] ] );
	P.cylZ( 'steel', 0.063, 0.027, - hz - 0.005, - hz, 0.0032, 10 );
	// trigger frame: magwell, guard, grip; selector and hold-open on the left, the takedown lever at the back
	const lz = 0.0165;
	P.extS( 'alu', [ [ - 0.166, - 0.0135 ], [ 0.13, - 0.0135 ], [ 0.128, - 0.036 ], [ 0.112, - 0.062, 0.004 ], [ 0.024, - 0.062, 0.004 ], [ 0.02, - 0.04 ], [ - 0.034, - 0.04 ], [ - 0.13, - 0.033, 0.006 ], [ - 0.166, - 0.022, 0.006 ] ], lz, 0.0016 );
	P.extFront( 'alu', [ [ - lz - 0.0012, - 0.067 ], [ lz + 0.0012, - 0.067 ], [ lz + 0.0012, - 0.06, 0.002 ], [ - lz - 0.0012, - 0.06, 0.002 ] ], 0.022, 0.114, 0.0012 );
	triggerGuard( P, 'alu', - 0.035, 0.03, - 0.038, 0.03, 0.005 );
	trigger( P, - 0.008, - 0.04 );
	const g = pistolGrip( P, 'poly', - 0.04, - 0.038, 0.098, 0.34, 0.036, 0.034, 0.015, 0.0045, 1 );
	P.cylZ( 'blk', - 0.07, - 0.025, - lz - 0.0016, - lz, 0.0058, 12 );
	P.extS( 'blk', [ [ - 0.072, - 0.022 ], [ - 0.048, - 0.018, 0.002 ], [ - 0.046, - 0.023, 0.002 ], [ - 0.072, - 0.028 ] ], 0.0009, 0.0003, - lz - 0.0024 );
	P.extS( 'blk', [ [ 0.0, - 0.017 ], [ 0.03, - 0.018, 0.002 ], [ 0.03, - 0.024, 0.002 ], [ 0.0, - 0.023 ] ], 0.0009, 0.0003, - lz - 0.0012 );
	P.extS( 'blk', [ [ 0.014, - 0.04 ], [ 0.022, - 0.04 ], [ 0.022, - 0.058, 0.002 ], [ 0.012, - 0.056 ] ], 0.0058, 0.001 );
	P.extS( 'blk', [ [ - 0.162, - 0.016 ], [ - 0.14, - 0.016 ], [ - 0.135, - 0.024, 0.003 ], [ - 0.162, - 0.026 ] ], 0.0012, 0.0004, lz + 0.0012 );
	pins( P, [ [ 0.12, - 0.022, 0.003 ], [ - 0.012, - 0.03 ], [ 0.012, - 0.03 ] ], lz );
	// handguard (two halves round the barrel and the gas piston), vent slots and the grooved grip panels
	const hg = [ [ - 0.0225, - 0.034, 0.01 ], [ 0.0225, - 0.034, 0.01 ], [ 0.0238, 0.008, 0.008 ], [ 0.016, 0.026, 0.008 ], [ - 0.016, 0.026, 0.008 ], [ - 0.0238, 0.008, 0.008 ] ];
	P.extFront( 'poly', hg, 0.142, 0.33, 0.004, 3 );
	for ( let i = 0; i < 6; i ++ ) for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', slot( 0.158 + i * 0.027, 0.172 + i * 0.027, 0.012, 0.003, 3 ), 0.0006, 0.0003, s * 0.0238 );
	for ( let i = 0; i < 9; i ++ ) for ( const s of [ - 1, 1 ] ) P.box( 'rubber', 0.155, 0.32, - 0.024 + i * 0.0032, - 0.0228 + i * 0.0032, s * 0.0234, s * 0.024, 0 );
	P.lathe( 'blk', [ [ 0.33, 0 ], [ 0.33, 0.0175 ], [ 0.336, 0.0175 ], [ 0.336, 0 ] ], 0, 0, 16 );
	// gas block, regulator and the front sight with its ears
	P.extS( 'blk', [ [ 0.336, - 0.013 ], [ 0.374, - 0.013 ], [ 0.372, 0.024, 0.004 ], [ 0.34, 0.03, 0.004 ] ], 0.0118, 0.0018 );
	P.cyl( 'blk', 0.37, 0.384, 0.0085, 0.018, 0, 12 );
	P.boxC( 'blk', 0.379, 0.018, 0.0, 0.004, 0.003, 0.02, 0.001 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ 0.346, 0.028 ], [ 0.364, 0.028 ], [ 0.362, 0.0585, 0.004 ], [ 0.348, 0.0585, 0.004 ] ], s * 0.0052, s * 0.0092, 0.0008 );
	P.box( 'blk', 0.3535, 0.3565, 0.028, 0.054, - 0.0013, 0.0013, 0.0003 );
	// barrel, bayonet lug, flash hider (four long slots)
	P.lathe( 'blk', [ [ 0.336, 0 ], [ 0.336, 0.0108 ], [ bEnd - 0.012, 0.0098 ], [ bEnd - 0.01, 0.0088 ], [ bEnd, 0.0088 ], [ bEnd, 0 ] ], 0, 0, 16 );
	P.box( 'blk', bEnd - 0.04, bEnd - 0.004, - 0.024, - 0.008, - 0.0042, 0.0042, 0.0012 );
	P.lathe( 'blk', [ [ bEnd - 0.002, 0 ], [ bEnd - 0.002, 0.0115 ], [ bEnd + 0.004, 0.0125 ], [ bEnd + 0.058, 0.0125 ], [ bEnd + 0.062, 0.0112 ], [ bEnd + 0.062, 0.0055 ], [ bEnd + 0.06, 0 ] ], 0, 0, 18 );
	for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2 + PI / 4; P.boxC( 'rubber', bEnd + 0.036, Math.cos( a ) * 0.0124, Math.sin( a ) * 0.0124, 0.042, 0.0012, 0.0034, 0, [ - a, 0, 0 ] ); }
	P.cyl( 'rubber', bEnd + 0.0614, bEnd + 0.0624, 0.0055, 0, 0, 12 );
	// fixed synthetic stock with its butt plate and sling swivel
	P.extS( 'poly', [ [ - 0.166, 0.022 ], [ - 0.2, 0.023, 0.01 ], [ - 0.45, 0.013, 0.006 ], [ - 0.455, - 0.11, 0.008 ], [ - 0.42, - 0.114, 0.006 ], [ - 0.2, - 0.052, 0.03 ], [ - 0.166, - 0.04, 0.008 ] ], 0.0172, 0.006, 0, [], 4 );
	P.extS( 'rubber', [ [ - 0.452, 0.0145 ], [ - 0.467, 0.0145, 0.004 ], [ - 0.467, - 0.116, 0.005 ], [ - 0.455, - 0.116 ] ], 0.0185, 0.003 );
	P.box( 'blk', - 0.4685, - 0.466, - 0.07, - 0.02, - 0.009, 0.009, 0.0012 );
	swivel( P, - 0.38, - 0.092, 0, 0.0078 );
	// the charging handle, folded flat when not in use
	const ch = P.sub( 'charge', 0.08, 0.018, - 0.018 );
	ch.box( 'blk', 0.075, 0.09, 0.008, 0.016, - 0.022, - hz, 0.0015 );
	ch.boxC( 'blk', 0.082, 0.012, - 0.03, 0.012, 0.009, 0.018, 0.0025, [ 0, 0.4, 0 ] );
	return { P, info: {
		sightH: 0.054, rearX: - 0.143, eyeBack: 0.09, muzzle: [ bEnd + 0.062, 0, 0 ], eject: [ 0.04, 0.012, 0.018 ], mag: { p: [ 0.068, - 0.042, 0 ], rake: 0 },
		optic: [ - 0.07, 0.052 ], opticParts: [ 'mount' ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ - 0.008, - 0.048, 0 ] } ), L: grip( [ 0.24, - 0.012, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.03 ) },
		stock: - 0.467, len: bEnd + 0.062 + 0.467, charge: 'charge', bolt: 'bolt', chargeTravel: 0.09, boltTravel: 0.07, chargeSide: - 1,
	}, mount: 'top' };
}

// ---- M14 EBR ----
// The M14 action (blued, its op rod and handle on the right) bedded in an aluminium chassis: rails on four sides at the
// front, a scope rail bridged over the action, the M14's trigger guard under a pistol grip, a telescoping stock on a
// tube with a cheek riser.
export function ebr() {
	const P = new Parts();
	const bEnd = 0.56, hz = 0.021;
	// chassis: the bed under the action, the handguard, the magwell
	P.extFront( 'alu', [ [ - hz, - 0.03 ], [ hz, - 0.03 ], [ hz, 0.006 ], [ hz - 0.004, 0.01 ], [ - hz + 0.004, 0.01 ], [ - hz, 0.006 ] ], - 0.14, 0.126, 0.0015 );
	P.extFront( 'alu', [ [ - hz, - 0.0298 ], [ hz, - 0.0298 ], [ hz, 0.026 ], [ hz - 0.004, 0.03 ], [ - hz + 0.004, 0.03 ], [ - hz, 0.026 ] ], 0.12, 0.345, 0.002 );
	P.rail( 'alu', - 0.13, 0.336, 0.036, 0.0105 );
	P.rail( 'alu', 0.142, 0.33, 0.0275, 0.0105, 'right' );
	P.rail( 'alu', 0.142, 0.33, - 0.0275, 0.0105, 'left' );
	P.rail( 'alu', 0.142, 0.33, - 0.0358, 0.0105, 'bottom' );
	for ( let i = 0; i < 4; i ++ ) for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', slot( 0.16 + i * 0.044, 0.186 + i * 0.044, 0.012, 0.0032, 3 ), 0.0006, 0.0003, s * hz );
	// the rail bridge over the action, on its left-side mount
	P.box( 'alu', - 0.13, 0.12, 0.024, 0.0305, - 0.0115, 0.0115, 0.002 );
	P.box( 'alu', - 0.09, 0.07, 0.004, 0.03, - 0.021, - 0.0135, 0.002 );
	for ( const x of [ - 0.07, 0.05 ] ) screw( P, x, 0.017, - 0.021, 'z', - 1, 0.0028, 'blk', true );
	// the action: receiver, the op rod down the right, the bolt's roller showing
	P.extFront( 'blued', [ [ - 0.0125, 0.006 ], [ 0.0125, 0.006 ], [ 0.0125, 0.019, 0.005 ], [ - 0.0125, 0.019, 0.005 ] ], - 0.122, 0.11, 0.001 );
	P.box( 'rubber', - 0.04, 0.05, 0.008, 0.0175, 0.0118, 0.0128, 0.0015 );
	// trigger guard (the M14's, under the chassis) and the grip
	triggerGuard( P, 'blued', - 0.04, 0.03, - 0.03, 0.03, 0.005 );
	trigger( P, - 0.01, - 0.032 );
	const g = pistolGrip( P, 'poly', - 0.042, - 0.03, 0.1, 0.34, 0.036, 0.032, 0.0145, 0.0045, 1 );
	P.extFront( 'alu', [ [ - 0.0185, - 0.06, 0.003 ], [ 0.0185, - 0.06, 0.003 ], [ 0.0185, - 0.03 ], [ - 0.0185, - 0.03 ] ], 0.034, 0.106, 0.0016 );
	P.extS( 'blued', [ [ 0.107, - 0.036 ], [ 0.114, - 0.036 ], [ 0.114, - 0.056, 0.002 ], [ 0.106, - 0.054 ] ], 0.007, 0.0012 );
	pins( P, [ [ - 0.12, - 0.018, 0.003 ], [ 0.11, - 0.018, 0.003 ] ], hz );
	// buffer tube, the telescoping stock with its cheek riser, the pad
	P.cyl( 'alu', - 0.37, - 0.14, 0.0155, 0.004, 0, 16 );
	P.cyl( 'alu', - 0.152, - 0.14, 0.019, 0.004, 0, 16 );
	P.extS( 'poly', [ [ - 0.262, 0.026 ], [ - 0.398, 0.028, 0.006 ], [ - 0.4, - 0.082, 0.008 ], [ - 0.37, - 0.086, 0.006 ], [ - 0.29, - 0.03, 0.02 ], [ - 0.262, - 0.016, 0.004 ] ], 0.0175, 0.004,
		0, [ [ [ - 0.32, - 0.03, 0.006 ], [ - 0.375, - 0.03, 0.006 ], [ - 0.375, - 0.066, 0.006 ] ] ] );
	P.extS( 'poly', [ [ - 0.27, 0.022 ], [ - 0.392, 0.022 ], [ - 0.392, 0.046, 0.006 ], [ - 0.29, 0.046, 0.01 ] ], 0.0145, 0.004 );
	for ( const s of [ - 1, 1 ] ) P.cylY( 'steel', - 0.3, 0.026, 0.04, 0.0028, s * 0.012, 8 );
	P.extS( 'rubber', [ [ - 0.397, 0.03 ], [ - 0.413, 0.03, 0.004 ], [ - 0.413, - 0.088, 0.005 ], [ - 0.397, - 0.088 ] ], 0.0195, 0.0035 );
	P.box( 'poly', - 0.3, - 0.27, - 0.028, - 0.018, - 0.008, 0.008, 0.002 );
	// barrel, the flash suppressor
	P.lathe( 'blued', [ [ 0.345, 0 ], [ 0.345, 0.0118 ], [ 0.36, 0.0112 ], [ bEnd - 0.012, 0.0104 ], [ bEnd - 0.01, 0.0094 ], [ bEnd, 0.0094 ], [ bEnd, 0 ] ], 0, 0, 16 );
	const mz = muzzleDevice( P, 'birdcage', bEnd - 0.002, 0.0125, 0.06 );
	swivel( P, 0.32, - 0.04, 0, 0.0078 );
	buis( P, - 0.11, 0.31, 0.0398, 0.068 );
	// the op rod handle (reciprocating, on the right)
	const ch = P.sub( 'charge', 0.06, 0.004, 0.02 );
	ch.box( 'blued', - 0.03, 0.08, - 0.0035, 0.0115, 0.0128, 0.0175, 0.0012 );
	ch.extS( 'blued', [ [ 0.06, - 0.004 ], [ 0.08, - 0.004 ], [ 0.082, 0.012, 0.004 ], [ 0.064, 0.013, 0.004 ] ], 0.003, 0.001, 0.019 );
	ch.cylZ( 'blued', 0.072, 0.004, 0.02, 0.034, 0.0052, 12, 0.0048 );
	return { P, info: {
		sightH: 0.068, rearX: - 0.11, eyeBack: 0.09, muzzle: [ mz, 0, 0 ], eject: [ 0.0, 0.015, 0.02 ], mag: { p: [ 0.07, - 0.03, 0 ], rake: 0 },
		optic: [ 0.0, 0.0398 ], light: [ 0.28, 0.0, 0.0313 ], hideWithOptic: [ 'buisR', 'buisF' ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ - 0.01, - 0.04, 0 ] } ), L: grip( [ 0.24, - 0.01, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.033 ) },
		stock: - 0.413, len: mz + 0.413, charge: 'charge', chargeTravel: 0.09, chargeSide: 1,
	} };
}
