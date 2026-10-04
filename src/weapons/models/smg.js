// Submachine guns: MP5, Uzi, MP7, Vector, MAC-10, UMP45.
import { THREE, PI, Parts, circle, slot, grip, pistolGrip, trigger, triggerGuard, pins, screw, swivel, buis } from './kit.js';

export function smg( o ) {
	return { mp5, uzi, mp7, vector, mac10, ump }[ o.arch ]?.() || ump();
}

// ---- HK MP5A3 ----
// A pressed-steel receiver (round-topped, ribbed along the flanks) with the cocking tube over the barrel, the hooded front
// post and the rotary drum diopter, the polymer trigger group (grip and guard in one) pinned under it, a slim handguard,
// the three-lug barrel, the retractable stock on its two struts. The claw mount ('mount') shows with an optic.
function mp5() {
	const P = new Parts();
	const hz = 0.016;
	P.extFront( 'blk', [ [ - hz, - 0.03 ], [ hz, - 0.03 ], [ hz, 0.016, 0.005 ], [ 0.0065, 0.0285, 0.006 ], [ - 0.0065, 0.0285, 0.006 ], [ - hz, 0.016, 0.005 ] ], - 0.125, 0.125, 0.0012, 3 );
	// the pressed ribs along both flanks, the spot welds of the claw-mount studs on top
	for ( const s of [ - 1, 1 ] ) for ( const y of [ - 0.019, 0.003 ] ) P.extS( 'blk', [ [ - 0.112, y ], [ 0.112, y ], [ 0.115, y + 0.0018 ], [ 0.112, y + 0.0036 ], [ - 0.112, y + 0.0036 ], [ - 0.115, y + 0.0018 ] ], 0.0007, 0.0005, s * ( hz + 0.0002 ) );
	for ( const x of [ - 0.075, - 0.035, 0.02, 0.06 ] ) P.boxC( 'blk', x, 0.0275, 0, 0.006, 0.003, 0.009, 0.0012 );
	// ejection port and the bolt's carrier behind it
	P.box( 'rubber', - 0.004, 0.05, - 0.004, 0.016, hz - 0.0006, hz + 0.0002, 0.0018 );
	const bolt = P.sub( 'bolt', 0.02, 0.006, 0.012 );
	bolt.box( 'steel', - 0.07, 0.048, - 0.002, 0.014, 0.0105, 0.0152, 0.0012 );
	bolt.cylZ( 'steel', 0.044, 0.004, 0.011, 0.0156, 0.0028, 8 );
	// cocking tube with its end cap, the handle's slot on the left; the front sight's base and hooded post
	P.cyl( 'blk', 0.124, 0.212, 0.0112, 0.02, 0, 16 );
	P.lathe( 'blk', [ [ 0.21, 0.0115 ], [ 0.214, 0.0122 ], [ 0.222, 0.0122 ], [ 0.224, 0.009 ], [ 0.224, 0.0 ] ], 0.02, 0, 16 );
	P.extS( 'rubber', slot( 0.132, 0.196, 0.02, 0.0024 ), 0.0004, 0.0002, - 0.0112 );
	P.extS( 'blk', [ [ 0.19, 0.022 ], [ 0.212, 0.022 ], [ 0.21, 0.04, 0.003 ], [ 0.193, 0.04, 0.003 ] ], 0.0085, 0.0015 );
	P.torusX( 'blk', 0.2015, 0.0495, 0, 0.0102, 0.0021, 16 );
	P.box( 'blk', 0.198, 0.205, 0.038, 0.0415, - 0.0045, 0.0045, 0.001 );
	P.box( 'blk', 0.2, 0.203, 0.04, 0.0492, - 0.0012, 0.0012, 0.0003 );
	// barrel and the three lugs at the muzzle
	P.lathe( 'blk', [ [ 0.124, 0 ], [ 0.124, 0.0108 ], [ 0.135, 0.0098 ], [ 0.205, 0.0092 ], [ 0.207, 0.0082 ], [ 0.236, 0.0082 ], [ 0.237, 0.0062 ], [ 0.236, 0 ] ], 0, 0, 16 );
	for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2 + PI / 2; P.boxC( 'blk', 0.224, Math.sin( a ) * 0.0092, Math.cos( a ) * 0.0092, 0.016, 0.0042, 0.0042, 0.0008, [ a, 0, 0 ] ); }
	P.cyl( 'rubber', 0.2365, 0.2372, 0.0045, 0, 0, 10 );
	// slim polymer handguard: rounded, a row of finger grooves underneath
	P.extR( 'poly', [ [ 0.074, 0.009 ], [ 0.19, 0.0075, 0.006 ], [ 0.19, - 0.022, 0.01 ], [ 0.084, - 0.0365, 0.01 ], [ 0.074, - 0.03, 0.006 ] ], 0.0205, 0.006 );
	for ( let i = 0; i < 5; i ++ ) P.boxC( 'rubber', 0.105 + i * 0.016, - 0.031 + i * 0.0018, 0, 0.004, 0.0024, 0.03, 0.001, [ 0, 0, - 0.12 ] );
	// magwell with its flared lip, the paddle release behind it
	P.extFront( 'blk', [ [ - 0.0148, - 0.052, 0.002 ], [ 0.0148, - 0.052, 0.002 ], [ 0.0148, - 0.026 ], [ - 0.0148, - 0.026 ] ], 0.018, 0.068, 0.0012 );
	P.extFront( 'blk', [ [ - 0.0165, - 0.056 ], [ 0.0165, - 0.056 ], [ 0.0165, - 0.05, 0.002 ], [ - 0.0165, - 0.05, 0.002 ] ], 0.016, 0.07, 0.001 );
	P.extS( 'blk', [ [ 0.006, - 0.047 ], [ 0.017, - 0.047 ], [ 0.017, - 0.061, 0.002 ], [ 0.004, - 0.059 ] ], 0.0055, 0.001 );
	// trigger group: housing, guard and grip moulded together; the selector on the left; the two push pins
	P.extR( 'poly', [ [ - 0.117, - 0.0285 ], [ 0.018, - 0.0285 ], [ 0.014, - 0.046 ], [ - 0.075, - 0.048 ], [ - 0.117, - 0.041, 0.006 ] ], 0.0148, 0.003 );
	triggerGuard( P, 'poly', - 0.03, 0.016, - 0.044, 0.03, 0.006 );
	trigger( P, - 0.008, - 0.046, 0.016 );
	const g = pistolGrip( P, 'poly', - 0.036, - 0.044, 0.095, 0.3, 0.034, 0.032, 0.0145, 0.0045, 1 );
	P.cylZ( 'blk', - 0.07, - 0.037, - 0.0168, - 0.0148, 0.0058, 12 );
	P.extS( 'blk', [ [ - 0.072, - 0.034 ], [ - 0.05, - 0.04, 0.002 ], [ - 0.05, - 0.045, 0.002 ], [ - 0.072, - 0.04 ] ], 0.0009, 0.0003, - 0.0174 );
	pins( P, [ [ - 0.106, - 0.035, 0.0026 ], [ 0.01, - 0.035, 0.0026 ] ], 0.0148 );
	// the rotary diopter on its base at the back of the receiver
	P.box( 'blk', - 0.122, - 0.088, 0.024, 0.0335, - 0.0105, 0.0105, 0.002 );
	P.cylZ( 'blk', - 0.105, 0.041, - 0.0118, 0.0118, 0.0112, 18 );
	P.cylZ( 'blk', - 0.105, 0.041, - 0.0125, 0.0125, 0.0075, 12 );
	for ( const x of [ - 0.1165, - 0.0935 ] ) P.cyl( 'rubber', x - 0.0004, x + 0.0004, 0.0017, 0.0492, 0, 10 );
	// A3 stock: the end cap on the receiver, two struts, the butt plate and pad
	P.box( 'blk', - 0.135, - 0.122, - 0.031, 0.026, - 0.0172, 0.0172, 0.003 );
	P.box( 'blk', - 0.132, - 0.124, 0.026, 0.031, - 0.006, 0.006, 0.0015 );
	for ( const s of [ - 1, 1 ] ) P.cyl( 'blk', - 0.322, - 0.13, 0.0042, - 0.006, s * 0.0135, 10 );
	P.extFront( 'blk', [ [ - 0.019, - 0.074, 0.006 ], [ 0.019, - 0.074, 0.006 ], [ 0.0205, 0.02, 0.006 ], [ - 0.0205, 0.02, 0.006 ] ], - 0.333, - 0.318, 0.002 );
	P.extS( 'rubber', [ [ - 0.332, 0.022 ], [ - 0.344, 0.022, 0.004 ], [ - 0.344, - 0.076, 0.004 ], [ - 0.332, - 0.076 ] ], 0.0195, 0.003 );
	P.put( 'steel', new THREE.TorusGeometry( 0.0065, 0.0012, 5, 12 ), [ - 0.128, 0.0, - 0.019 ], [ 0, PI / 2, 0 ] );
	// claw mount (with an optic)
	const m = P.sub( 'mount', 0, 0.03, 0 );
	m.box( 'blk', - 0.06, 0.06, 0.03, 0.036, - 0.0115, 0.0115, 0.002 );
	for ( const x of [ - 0.05, 0.05 ] ) { m.box( 'blk', x - 0.007, x + 0.007, 0.022, 0.036, - 0.018, 0.018, 0.002 ); m.cylZ( 'steel', x, 0.027, 0.018, 0.022, 0.003, 8 ); }
	m.rail( 'blk', - 0.058, 0.058, 0.042, 0.0105 );
	// the cocking handle in its slot (it does not move with the bolt)
	const ch = P.sub( 'charge', 0.17, 0.02, - 0.012 );
	ch.box( 'blk', 0.165, 0.175, 0.016, 0.024, - 0.026, - 0.0105, 0.0015 );
	ch.cyl( 'blk', 0.163, 0.177, 0.0045, 0.02, - 0.03, 10 );
	return { P, info: { sightH: 0.0492, rearX: - 0.105, eyeBack: 0.08, muzzle: [ 0.237, 0, 0 ], eject: [ 0.03, 0.012, 0.017 ], mag: { p: [ 0.043, - 0.03, 0 ], rake: 0 },
		optic: [ 0.0, 0.0458 ], opticParts: [ 'mount' ], light: [ 0.16, - 0.012, 0.024 ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ - 0.008, - 0.055, 0 ] } ), L: grip( [ 0.14, - 0.014, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.025 ) },
		stock: - 0.344, len: 0.58, charge: 'charge', bolt: 'bolt', chargeTravel: 0.05, boltTravel: 0.05 } };
}

// ---- IMI Uzi ----
// A stamped box receiver with the long pressed grooves down its sides, the top cover with the cocking knob, sights in
// protective ears at both ends, the knurled barrel nut; the grip (the magazine goes up through it) with its grip safety;
// the folding metal stock, open.
function uzi() {
	const P = new Parts();
	const hz = 0.019;
	P.extFront( 'blk', [ [ - hz, - 0.024 ], [ hz, - 0.024 ], [ hz, 0.03, 0.003 ], [ - hz, 0.03, 0.003 ] ], - 0.13, 0.16, 0.0018 );
	for ( const s of [ - 1, 1 ] ) for ( const y of [ - 0.012, 0.005 ] ) P.extS( 'blk', [ [ - 0.12, y ], [ 0.15, y ], [ 0.153, y + 0.004 ], [ 0.15, y + 0.008 ], [ - 0.12, y + 0.008 ], [ - 0.123, y + 0.004 ] ], 0.0009, 0.0007, s * ( hz + 0.0002 ) );
	// top cover: a ribbed lid, the cocking knob's slot down the middle
	P.extFront( 'blk', [ [ - hz + 0.001, 0.029 ], [ hz - 0.001, 0.029 ], [ hz - 0.002, 0.035, 0.003 ], [ - hz + 0.002, 0.035, 0.003 ] ], - 0.122, 0.142, 0.001 );
	for ( let i = 0; i < 9; i ++ ) P.box( 'blk', - 0.1 + i * 0.024, - 0.093 + i * 0.024, 0.0345, 0.037, - 0.0168, 0.0168, 0.0008 );
	P.box( 'rubber', - 0.04, 0.11, 0.0362, 0.0376, - 0.0028, 0.0028, 0.001 );
	// ejection port on the right
	P.box( 'rubber', 0.02, 0.07, 0.004, 0.024, hz - 0.0006, hz + 0.0003, 0.002 );
	// knurled barrel nut and the short barrel
	P.lathe( 'blk', [ [ 0.158, 0.0 ], [ 0.158, 0.0178 ], [ 0.162, 0.019 ], [ 0.174, 0.019 ], [ 0.178, 0.0168 ], [ 0.178, 0.0 ] ], 0, 0, 20 );
	for ( let i = 0; i < 20; i ++ ) { const a = i / 20 * PI * 2; P.boxC( 'blk', 0.168, Math.cos( a ) * 0.0191, Math.sin( a ) * 0.0191, 0.012, 0.0012, 0.0012, 0, [ a, 0, 0 ] ); }
	P.lathe( 'blk', [ [ 0.176, 0 ], [ 0.176, 0.0088 ], [ 0.21, 0.0085 ], [ 0.214, 0.0072 ], [ 0.214, 0.0 ] ], 0, 0, 14 );
	P.cyl( 'rubber', 0.2138, 0.2145, 0.0048, 0, 0, 10 );
	// front sight in its ears, rear sight (flip apertures) in its ears
	P.box( 'blk', 0.138, 0.158, 0.034, 0.042, - 0.0125, 0.0125, 0.002 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ 0.141, 0.041 ], [ 0.155, 0.041 ], [ 0.153, 0.064, 0.003 ], [ 0.143, 0.064, 0.003 ] ], s * 0.0052, s * 0.0085, 0.0007 );
	P.box( 'blk', 0.1475, 0.1505, 0.04, 0.058, - 0.0012, 0.0012, 0.0003 );
	P.box( 'blk', - 0.12, - 0.098, 0.034, 0.042, - 0.0125, 0.0125, 0.002 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ - 0.118, 0.041 ], [ - 0.1, 0.041 ], [ - 0.102, 0.065, 0.003 ], [ - 0.116, 0.065, 0.003 ] ], s * 0.0068, s * 0.01, 0.0007 );
	P.extFront( 'blk', [ [ - 0.0055, 0.04 ], [ 0.0055, 0.04 ], [ 0.005, 0.062, 0.002 ], [ - 0.005, 0.062, 0.002 ] ], - 0.1105, - 0.1075, 0.0004, 3, [ circle( 0, 0.058, 0.0017, 10 ) ] );
	// grip: the frame, the bakelite panels, the grip safety at its back; the long guard
	const g = pistolGrip( P, 'blk', 0.012, - 0.022, 0.1, 0.12, 0.044, 0.044, 0.0145, 0.003, 0 );
	const sx = Math.sin( 0.12 ), cy = Math.cos( 0.12 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'polyS', [ [ 0.006 - sx * 0.012, - 0.034 ], [ - 0.028 - sx * 0.012, - 0.034 ], [ - 0.028 - sx * 0.09, - 0.022 - cy * 0.09, 0.006 ], [ 0.006 - sx * 0.09, - 0.022 - cy * 0.09, 0.006 ] ], s * 0.0142, s * 0.0168, 0.0014 );
	for ( let i = 0; i < 6; i ++ ) for ( const s of [ - 1, 1 ] ) P.boxC( 'rubber', - 0.012 - sx * ( 0.025 + i * 0.011 ), - 0.022 - cy * ( 0.025 + i * 0.011 ), s * 0.0169, 0.026, 0.0016, 0.0006, 0, [ 0, 0, - 0.12 ] );
	P.extS( 'blk', [ [ - 0.031, - 0.03 ], [ - 0.025, - 0.03 ], [ - 0.034, - 0.08, 0.004 ], [ - 0.04, - 0.076 ] ], 0.0085, 0.0012 );
	triggerGuard( P, 'blk', 0.012, 0.075, - 0.024, 0.036, 0.005 );
	trigger( P, 0.03, - 0.026, 0.018 );
	P.cylZ( 'blk', 0.04, - 0.018, - hz - 0.0016, - hz, 0.0055, 12 );
	P.extS( 'blk', [ [ 0.038, - 0.015 ], [ 0.06, - 0.012, 0.002 ], [ 0.06, - 0.018, 0.002 ], [ 0.038, - 0.021 ] ], 0.0008, 0.0003, - hz - 0.0022 );
	// folding stock, open: the hinge block, two arms, the butt plate
	P.box( 'blk', - 0.142, - 0.128, - 0.022, 0.02, - 0.0205, 0.0205, 0.003 );
	for ( const s of [ - 1, 1 ] ) P.extS( 'blk', [ [ - 0.14, 0.004 ], [ - 0.358, - 0.0 ], [ - 0.358, - 0.012, 0.004 ], [ - 0.14, - 0.008 ] ], 0.002, 0.0008, s * 0.0168 );
	for ( const s of [ - 1, 1 ] ) P.cylZ( 'steel', - 0.137, - 0.002, s * 0.0185, s * 0.0215, 0.004, 10 );
	P.extS( 'blk', [ [ - 0.356, 0.018 ], [ - 0.372, 0.018, 0.004 ], [ - 0.372, - 0.07, 0.006 ], [ - 0.356, - 0.07, 0.004 ] ], 0.02, 0.0025,
		0, [ [ [ - 0.36, 0.006, 0.002 ], [ - 0.368, 0.006, 0.002 ], [ - 0.368, - 0.056, 0.002 ], [ - 0.36, - 0.056, 0.002 ] ] ] );
	P.put( 'steel', new THREE.TorusGeometry( 0.0065, 0.0012, 5, 12 ), [ 0.14, - 0.03, - 0.0205 ], [ 0, PI / 2, 0 ] );
	// the cocking knob on the cover (it rides with the bolt)
	const ch = P.sub( 'charge', 0.09, 0.038, 0 );
	ch.box( 'blk', 0.086, 0.094, 0.034, 0.041, - 0.0025, 0.0025, 0.001 );
	ch.extS( 'blk', [ [ 0.08, 0.04 ], [ 0.1, 0.04 ], [ 0.098, 0.047, 0.003 ], [ 0.082, 0.047, 0.003 ] ], 0.0065, 0.0015 );
	for ( let i = 0; i < 4; i ++ ) ch.box( 'rubber', 0.0835 + i * 0.0045, 0.0848 + i * 0.0045, 0.0466, 0.0475, - 0.0055, 0.0055, 0 );
	return { P, info: { sightH: 0.058, rearX: - 0.109, eyeBack: 0.08, muzzle: [ 0.2145, 0, 0 ], eject: [ 0.04, 0.02, 0.02 ], mag: { p: [ g.p.x, - 0.02, 0 ], rake: - 0.12 },
		grips: { R: grip( [ g.p.x - 0.002, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.02, { trig: [ 0.03, - 0.035, 0 ] } ), L: grip( [ 0.13, - 0.022, 0 ], [ 1, 0, 0 ], [ 0, - 0.75, - 0.66 ], 0.024 ) },
		stock: - 0.372, len: 0.59, charge: 'charge', chargeTravel: 0.06, magInGrip: 1 } };
}

// ---- HK MP7A1 ----
// A compact moulded receiver (rounded, with ribs), the top rail and two short side rails, the folding vertical
// foregrip, the T charging handle at the back, the retractable stock on two rods.
function mp7() {
	const P = new Parts();
	const hz = 0.0175;
	P.extR( 'poly', [ [ - 0.13, 0.035 ], [ 0.084, 0.035, 0.006 ], [ 0.106, 0.012, 0.01 ], [ 0.101, - 0.028, 0.008 ], [ 0.03, - 0.03 ], [ - 0.02, - 0.028 ], [ - 0.13, - 0.024, 0.008 ] ], hz, 0.0045 );
	for ( const s of [ - 1, 1 ] ) {
		P.extS( 'poly', [ [ - 0.118, 0.012 ], [ 0.07, 0.012 ], [ 0.072, 0.017 ], [ - 0.118, 0.017 ] ], 0.0008, 0.0005, s * ( hz + 0.0004 ) );
		P.extS( 'rubber', slot( - 0.1, - 0.04, - 0.008, 0.0028, 3 ), 0.0005, 0.0003, s * ( hz + 0.0001 ) );
	}
	P.rail( 'blk', - 0.126, 0.086, 0.041, 0.0105 );
	P.box( 'poly', - 0.128, 0.088, 0.033, 0.0352, - 0.012, 0.012, 0.001 );
	P.rail( 'blk', 0.035, 0.085, 0.0218, 0.0085, 'right' );
	P.rail( 'blk', 0.035, 0.085, - 0.0218, 0.0085, 'left' );
	// ejection port, barrel and its nut
	P.box( 'rubber', - 0.01, 0.034, 0.004, 0.022, hz - 0.0006, hz + 0.0002, 0.002 );
	P.lathe( 'blk', [ [ 0.1, 0 ], [ 0.1, 0.0098 ], [ 0.112, 0.0098 ], [ 0.114, 0.0072 ], [ 0.152, 0.0068 ], [ 0.153, 0.0052 ], [ 0.152, 0 ] ], 0, 0, 14 );
	P.cyl( 'blk', 0.13, 0.148, 0.0088, 0, 0, 14 );
	P.cyl( 'rubber', 0.1525, 0.1532, 0.0035, 0, 0, 10 );
	const g = pistolGrip( P, 'poly', - 0.022, - 0.026, 0.1, 0.26, 0.036, 0.034, 0.015, 0.0045, 1 );
	triggerGuard( P, 'poly', - 0.02, 0.04, - 0.026, 0.03, 0.006 );
	trigger( P, 0.0, - 0.028, 0.017 );
	for ( const s of [ - 1, 1 ] ) {
		P.cylZ( 'blk', - 0.055, - 0.014, s * hz, s * ( hz + 0.0018 ), 0.0058, 12 );
		P.extS( 'blk', [ [ - 0.057, - 0.011 ], [ - 0.036, - 0.006, 0.002 ], [ - 0.035, - 0.011, 0.002 ], [ - 0.057, - 0.017 ] ], 0.0008, 0.0003, s * ( hz + 0.0024 ) );
	}
	// folding foregrip, down
	P.box( 'blk', 0.06, 0.086, - 0.034, - 0.026, - 0.0105, 0.0105, 0.0015 );
	P.extR( 'poly', [ [ 0.062, - 0.032 ], [ 0.084, - 0.032 ], [ 0.086, - 0.09, 0.006 ], [ 0.06, - 0.09, 0.006 ] ], 0.012, 0.004 );
	for ( let i = 0; i < 4; i ++ ) P.box( 'poly', 0.0595, 0.0865, - 0.048 - i * 0.011, - 0.044 - i * 0.011, - 0.0125, 0.0125, 0.0012 );
	// retractable stock: two rods, the butt plate
	for ( const s of [ - 1, 1 ] ) P.cyl( 'blk', - 0.178, - 0.13, 0.0038, 0.0, s * 0.0118, 10 );
	P.extR( 'poly', [ [ - 0.172, 0.03 ], [ - 0.186, 0.03 ], [ - 0.186, - 0.036, 0.004 ], [ - 0.172, - 0.036, 0.004 ] ], 0.02, 0.004 );
	buis( P, - 0.1, 0.075, 0.0448, 0.061 );
	const ch = P.sub( 'charge', - 0.13, 0.03, 0 );
	ch.extTop( 'blk', [ [ - 0.142, - 0.02, 0.003 ], [ - 0.13, - 0.02, 0.003 ], [ - 0.127, - 0.005 ], [ - 0.127, 0.005 ], [ - 0.13, 0.02, 0.003 ], [ - 0.142, 0.02, 0.003 ] ], 0.026, 0.0335, 0.0012 );
	return { P, info: { sightH: 0.061, rearX: - 0.1, eyeBack: 0.08, muzzle: [ 0.153, 0, 0 ], eject: [ 0.02, 0.02, 0.018 ], mag: { p: [ g.p.x + 0.002, - 0.022, 0 ], rake: - 0.26 },
		optic: [ - 0.02, 0.0448 ], light: [ 0.06, 0.0, 0.0256 ], hideWithOptic: [ 'buisR', 'buisF' ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ 0.0, - 0.036, 0 ] } ), L: grip( [ 0.073, - 0.06, 0 ], [ 0.05, 1, 0 ], [ - 0.2, 0, - 1 ], 0.013, { vert: 1 } ) },
		stock: - 0.186, len: 0.4, charge: 'charge', chargeTravel: 0.04, magInGrip: 1 } };
}

// ---- KRISS Vector ----
// The tall polymer upper with a full-length top rail, the inclined block of the recoil mechanism dropping in front of
// the guard (the magwell is in it), a short shroud over the barrel with a rail underneath, the folding stock.
function vector() {
	const P = new Parts();
	const hz = 0.0172;
	P.extR( 'tan', [ [ - 0.122, 0.044 ], [ 0.12, 0.044 ], [ 0.122, 0.012 ], [ - 0.12, 0.012 ] ], hz, 0.004 );
	P.rail( 'blk', - 0.12, 0.116, 0.048, 0.0105 );
	// the lower: the "V" housing sloping down in front of the trigger, the magwell in it
	P.extR( 'tan', [ [ - 0.12, 0.014 ], [ 0.124, 0.014 ], [ 0.124, - 0.01, 0.004 ], [ 0.11, - 0.032 ], [ 0.102, - 0.1, 0.008 ], [ 0.04, - 0.106, 0.006 ], [ 0.034, - 0.03 ], [ - 0.07, - 0.024 ], [ - 0.12, 0.0, 0.01 ] ], 0.0198, 0.005 );
	for ( const s of [ - 1, 1 ] ) {
		P.extS( 'tan', [ [ 0.048, - 0.03 ], [ 0.1, - 0.03 ], [ 0.094, - 0.094, 0.004 ], [ 0.05, - 0.098, 0.004 ] ], 0.0008, 0.0006, s * 0.0202 );
		P.extS( 'rubber', slot( - 0.09, 0.0, 0.03, 0.0026, 3 ), 0.0005, 0.0003, s * hz );
	}
	// the shroud over the barrel, its under-rail; barrel and the thread cap
	P.extR( 'tan', [ [ 0.12, 0.012 ], [ 0.168, 0.012 ], [ 0.17, - 0.014, 0.004 ], [ 0.12, - 0.014 ] ], 0.0145, 0.004 );
	P.rail( 'blk', 0.124, 0.166, - 0.0145, 0.0095, 'bottom' );
	P.lathe( 'blk', [ [ 0.165, 0 ], [ 0.165, 0.0085 ], [ 0.19, 0.0078 ], [ 0.192, 0.0068 ], [ 0.2, 0.0068 ], [ 0.2, 0 ] ], 0, 0, 14 );
	P.cyl( 'rubber', 0.1998, 0.2004, 0.0048, 0, 0, 10 );
	// ejection port right, the grip, the guard, ambidextrous selector
	P.box( 'rubber', - 0.03, 0.03, 0.016, 0.036, hz - 0.0006, hz + 0.0002, 0.002 );
	const g = pistolGrip( P, 'tan', - 0.012, - 0.026, 0.098, 0.22, 0.034, 0.032, 0.015, 0.0045, 1 );
	triggerGuard( P, 'tan', - 0.012, 0.038, - 0.026, 0.03, 0.006 );
	trigger( P, 0.008, - 0.028, 0.017 );
	for ( const s of [ - 1, 1 ] ) {
		P.cylZ( 'blk', - 0.06, - 0.004, s * 0.0198, s * 0.0215, 0.0055, 12 );
		P.extS( 'blk', [ [ - 0.062, - 0.001 ], [ - 0.042, 0.002, 0.002 ], [ - 0.041, - 0.004, 0.002 ], [ - 0.062, - 0.007 ] ], 0.0008, 0.0003, s * 0.022 );
	}
	P.extS( 'blk', [ [ 0.105, - 0.044 ], [ 0.112, - 0.044 ], [ 0.11, - 0.062, 0.002 ], [ 0.103, - 0.06 ] ], 0.007, 0.0012 );
	pins( P, [ [ - 0.1, - 0.004, 0.0024 ], [ 0.112, 0.0, 0.0024 ] ], 0.0198 );
	// folding stock (open) on the hinge at the back
	P.box( 'blk', - 0.134, - 0.12, - 0.0, 0.04, - 0.016, 0.016, 0.003 );
	P.cyl( 'blk', - 0.3, - 0.13, 0.0128, 0.022, 0, 16 );
	P.extR( 'tan', [ [ - 0.235, 0.037 ], [ - 0.306, 0.04, 0.006 ], [ - 0.315, - 0.058, 0.008 ], [ - 0.292, - 0.062, 0.006 ], [ - 0.25, 0.0 ], [ - 0.235, 0.004 ] ], 0.0168, 0.0045,
		0, [ [ [ - 0.262, 0.004, 0.004 ], [ - 0.292, 0.006, 0.004 ], [ - 0.296, - 0.038, 0.004 ] ] ] );
	P.extS( 'rubber', [ [ - 0.305, 0.042 ], [ - 0.318, 0.042, 0.004 ], [ - 0.318, - 0.062, 0.004 ], [ - 0.305, - 0.062 ] ], 0.0175, 0.003 );
	buis( P, - 0.1, 0.1, 0.0518, 0.07 );
	const ch = P.sub( 'charge', 0.06, 0.03, - 0.02 );
	ch.box( 'blk', 0.055, 0.067, 0.025, 0.035, - 0.03, - hz, 0.0015 );
	ch.cylZ( 'blk', 0.061, 0.03, - 0.034, - 0.027, 0.0055, 10 );
	return { P, info: { sightH: 0.07, rearX: - 0.1, eyeBack: 0.08, muzzle: [ 0.2004, 0, 0 ], eject: [ 0.02, 0.03, 0.02 ], mag: { p: [ 0.068, - 0.03, 0 ], rake: 0 },
		optic: [ - 0.01, 0.0518 ], light: [ 0.1, 0.0, 0.0215 ], hideWithOptic: [ 'buisR', 'buisF' ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ 0.008, - 0.036, 0 ] } ), L: grip( [ 0.14, - 0.004, 0 ], [ 1, 0, 0 ], [ 0, - 0.75, - 0.66 ], 0.018 ) },
		stock: - 0.318, len: 0.52, charge: 'charge', chargeTravel: 0.05 } };
}

// ---- Ingram MAC-10 ----
// Two stamped halves welded into a box, the cocking knob on top (it rides with the open bolt), a peep sight at the back
// and a post in ears at the front, the threaded barrel, the strap loop for the other hand, the wire stock retracted.
function mac10() {
	const P = new Parts();
	const hz = 0.022;
	P.extFront( 'blk', [ [ - hz, - 0.026 ], [ hz, - 0.026 ], [ hz, 0.033, 0.003 ], [ hz - 0.003, 0.036 ], [ - hz + 0.003, 0.036 ], [ - hz, 0.033, 0.003 ] ], - 0.09, 0.11, 0.0015 );
	// the weld seam down the middle of the top and the bottom, the slot for the knob
	P.box( 'blk', - 0.088, 0.108, 0.0355, 0.0372, - 0.0009, 0.0009, 0.0004 );
	P.box( 'rubber', - 0.03, 0.068, 0.0362, 0.0372, - 0.0032, 0.0032, 0.001 );
	for ( const s of [ - 1, 1 ] ) for ( const [ x, y ] of [ [ - 0.08, 0.026 ], [ 0.1, 0.026 ], [ - 0.08, - 0.016 ], [ 0.1, - 0.016 ] ] ) P.cylZ( 'steel', x, y, s * hz, s * ( hz + 0.0007 ), 0.0022, 8 );
	P.box( 'rubber', 0.02, 0.07, 0.004, 0.026, hz - 0.0006, hz + 0.0002, 0.002 );
	// threaded barrel
	P.lathe( 'blk', [ [ 0.108, 0 ], [ 0.108, 0.0102 ], [ 0.112, 0.0098 ], [ 0.145, 0.0098 ], [ 0.146, 0.0076 ], [ 0.146, 0.0 ] ], 0, 0, 16 );
	for ( let i = 0; i < 6; i ++ ) P.cyl( 'blk', 0.114 + i * 0.0045, 0.1165 + i * 0.0045, 0.0105, 0, 0, 16 );
	P.cyl( 'rubber', 0.1455, 0.1462, 0.0058, 0, 0, 10 );
	// sights: the peep in its block, the post in its ears
	P.box( 'blk', - 0.086, - 0.066, 0.036, 0.046, - 0.012, 0.012, 0.002 );
	P.extFront( 'blk', [ [ - 0.008, 0.044 ], [ 0.008, 0.044 ], [ 0.007, 0.0535, 0.003 ], [ - 0.007, 0.0535, 0.003 ] ], - 0.0775, - 0.0745, 0.0005, 3, [ circle( 0, 0.048, 0.0019, 10 ) ] );
	P.box( 'blk', 0.088, 0.108, 0.036, 0.04, - 0.011, 0.011, 0.0015 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ 0.09, 0.039 ], [ 0.106, 0.039 ], [ 0.104, 0.052, 0.002 ], [ 0.092, 0.052, 0.002 ] ], s * 0.0045, s * 0.0085, 0.0006 );
	P.box( 'blk', 0.0965, 0.0995, 0.038, 0.048, - 0.0012, 0.0012, 0.0003 );
	// grip (the magazine goes up through it), guard, the safety lever; the strap loop under the front
	const g = pistolGrip( P, 'blk', 0.012, - 0.024, 0.1, 0.1, 0.038, 0.038, 0.017, 0.0035, 0 );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 7; i ++ ) P.boxC( 'rubber', - 0.006 - Math.sin( 0.1 ) * ( 0.02 + i * 0.011 ), - 0.024 - Math.cos( 0.1 ) * ( 0.02 + i * 0.011 ), s * 0.0171, 0.03, 0.0022, 0.0006, 0, [ 0, 0, - 0.1 ] );
	triggerGuard( P, 'blk', 0.012, 0.07, - 0.026, 0.03, 0.005 );
	trigger( P, 0.03, - 0.028, 0.016 );
	P.extS( 'blk', [ [ 0.06, - 0.022 ], [ 0.082, - 0.024, 0.002 ], [ 0.082, - 0.03, 0.002 ], [ 0.06, - 0.028 ] ], 0.0008, 0.0003, hz + 0.0012 );
	P.cylZ( 'blk', 0.1, - 0.028, - 0.012, 0.012, 0.009, 12 );
	P.extS( 'cloth', [ [ 0.084, - 0.036 ], [ 0.112, - 0.036 ], [ 0.112, - 0.048, 0.004 ], [ 0.084, - 0.048, 0.004 ] ], 0.0042, 0.0012, 0, [ [ [ 0.088, - 0.04 ], [ 0.108, - 0.04 ], [ 0.108, - 0.044 ], [ 0.088, - 0.044 ] ] ] );
	// wire stock, retracted: two rods along the sides, the butt plate behind
	for ( const s of [ - 1, 1 ] ) P.cyl( 'blk', - 0.13, - 0.088, 0.0042, - 0.01, s * 0.0185, 10 );
	P.extS( 'blk', [ [ - 0.13, 0.012 ], [ - 0.14, 0.012, 0.002 ], [ - 0.14, - 0.032, 0.003 ], [ - 0.13, - 0.032 ] ], 0.023, 0.0015, 0, [ [ [ - 0.132, 0.002 ], [ - 0.138, 0.002 ], [ - 0.138, - 0.022 ], [ - 0.132, - 0.022 ] ] ] );
	// the cocking knob (it rides with the bolt)
	const ch = P.sub( 'charge', 0.05, 0.04, 0 );
	ch.cylY( 'blk', 0.05, 0.034, 0.044, 0.0035, 0, 10 );
	ch.cylY( 'blk', 0.05, 0.043, 0.0505, 0.0068, 0, 14, 0.006 );
	for ( let i = 0; i < 10; i ++ ) { const a = i / 10 * PI * 2; ch.boxC( 'rubber', 0.05 + Math.cos( a ) * 0.0066, 0.047, Math.sin( a ) * 0.0066, 0.0012, 0.0065, 0.0012, 0, [ 0, - a, 0 ] ); }
	return { P, info: { sightH: 0.048, rearX: - 0.076, eyeBack: 0.2, muzzle: [ 0.146, 0, 0 ], eject: [ 0.03, 0.025, 0.024 ], mag: { p: [ g.p.x + 0.002, - 0.02, 0 ], rake: - 0.1 },
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ 0.03, - 0.034, 0 ] } ), L: grip( [ 0.1, - 0.03, 0 ], [ 1, 0, 0 ], [ 0, - 0.75, - 0.66 ], 0.02 ) },
		stock: - 0.14, len: 0.3, charge: 'charge', chargeTravel: 0.07, magInGrip: 1 } };
}

// ---- HK UMP45 ----
// A polymer receiver with the top rail, short side rails at the front and a long rail underneath, the cocking tube's
// handle at the front left, the big moulded guard with the magwell ahead of it, the side-folding skeleton stock, open.
function ump() {
	const P = new Parts();
	const hz = 0.02;
	P.extR( 'poly', [ [ - 0.142, - 0.028 ], [ 0.16, - 0.028, 0.004 ], [ 0.162, 0.03, 0.006 ], [ - 0.142, 0.034, 0.006 ] ], hz, 0.006 );
	P.rail( 'blk', - 0.13, 0.1, 0.041, 0.0105 );
	P.box( 'poly', - 0.132, 0.102, 0.03, 0.036, - 0.0118, 0.0118, 0.002 );
	P.rail( 'blk', 0.11, 0.155, 0.0262, 0.0085, 'right' );
	P.rail( 'blk', 0.11, 0.155, - 0.0262, 0.0085, 'left' );
	P.rail( 'blk', 0.1, 0.156, - 0.034, 0.0095, 'bottom' );
	P.box( 'poly', 0.098, 0.158, - 0.034, - 0.026, - 0.0105, 0.0105, 0.002 );
	// the moulded panel lines and cooling slots, ejection port
	for ( const s of [ - 1, 1 ] ) {
		P.extS( 'poly', [ [ - 0.13, - 0.016 ], [ 0.09, - 0.016 ], [ 0.09, 0.02, 0.004 ], [ - 0.13, 0.02, 0.004 ] ], 0.001, 0.0006, s * ( hz + 0.0004 ) );
		for ( let i = 0; i < 3; i ++ ) P.extS( 'rubber', slot( 0.104 + i * 0.016, 0.112 + i * 0.016, 0.004, 0.006, 3 ), 0.0005, 0.0003, s * ( hz + 0.0001 ) );
	}
	P.box( 'rubber', - 0.02, 0.05, 0.002, 0.024, hz + 0.0002, hz + 0.0012, 0.002 );
	P.lathe( 'blk', [ [ 0.16, 0 ], [ 0.16, 0.0092 ], [ 0.188, 0.0088 ], [ 0.19, 0.0074 ], [ 0.196, 0.0074 ], [ 0.196, 0 ] ], 0, 0, 14 );
	P.cyl( 'rubber', 0.1958, 0.1965, 0.0055, 0, 0, 10 );
	// magwell and the release lever, the guard (open at the back: a thumb hole for a gloved hand), grip, selector
	P.extFront( 'poly', [ [ - 0.0165, - 0.044, 0.002 ], [ 0.0165, - 0.044, 0.002 ], [ 0.0165, - 0.026 ], [ - 0.0165, - 0.026 ] ], 0.038, 0.088, 0.0016 );
	P.extS( 'blk', [ [ 0.088, - 0.034 ], [ 0.096, - 0.034 ], [ 0.096, - 0.05, 0.002 ], [ 0.086, - 0.048 ] ], 0.0065, 0.0012 );
	const g = pistolGrip( P, 'poly', - 0.03, - 0.028, 0.098, 0.3, 0.036, 0.034, 0.016, 0.0045, 1 );
	P.extR( 'poly', [ [ - 0.03, - 0.028 ], [ 0.04, - 0.028 ], [ 0.036, - 0.06, 0.008 ], [ - 0.015, - 0.064, 0.004 ] ], 0.0075, 0.0025, 0, [ [ [ - 0.012, - 0.034 ], [ 0.028, - 0.034 ], [ 0.026, - 0.054, 0.006 ], [ - 0.01, - 0.056 ] ] ] );
	trigger( P, - 0.002, - 0.03, 0.017 );
	for ( const s of [ - 1, 1 ] ) {
		P.cylZ( 'blk', - 0.062, - 0.018, s * hz, s * ( hz + 0.0018 ), 0.0058, 12 );
		P.extS( 'blk', [ [ - 0.064, - 0.015 ], [ - 0.044, - 0.01, 0.002 ], [ - 0.043, - 0.016, 0.002 ], [ - 0.064, - 0.021 ] ], 0.0008, 0.0003, s * ( hz + 0.0024 ) );
	}
	pins( P, [ [ - 0.115, - 0.018, 0.0026 ], [ 0.02, - 0.018, 0.0026 ] ], hz );
	// folding stock: hinge, skeleton frame, pad
	P.box( 'poly', - 0.152, - 0.138, - 0.022, 0.028, - 0.0175, 0.0215, 0.004 );
	P.cylY( 'blk', - 0.146, - 0.024, 0.03, 0.0036, 0.0215, 10 );
	P.extR( 'poly', [ [ - 0.148, 0.024 ], [ - 0.375, 0.02, 0.008 ], [ - 0.385, - 0.078, 0.01 ], [ - 0.355, - 0.08, 0.006 ], [ - 0.148, - 0.018, 0.006 ] ], 0.0135, 0.004,
		0, [ [ [ - 0.172, 0.012, 0.004 ], [ - 0.345, 0.008, 0.006 ], [ - 0.345, - 0.055, 0.008 ], [ - 0.198, - 0.01, 0.006 ] ] ] );
	P.extS( 'rubber', [ [ - 0.383, 0.024 ], [ - 0.396, 0.024, 0.004 ], [ - 0.396, - 0.082, 0.005 ], [ - 0.383, - 0.082 ] ], 0.016, 0.003 );
	swivel( P, - 0.36, - 0.07, 0, 0.007 );
	buis( P, - 0.11, 0.09, 0.0448, 0.062 );
	// cocking handle at the front left
	const ch = P.sub( 'charge', 0.13, 0.02, - 0.02 );
	P.extS( 'rubber', slot( 0.08, 0.142, 0.018, 0.0028 ), 0.0004, 0.0002, - hz );
	ch.box( 'blk', 0.125, 0.137, 0.013, 0.023, - 0.031, - hz + 0.0005, 0.0015 );
	ch.cyl( 'blk', 0.122, 0.14, 0.0048, 0.018, - 0.034, 10 );
	return { P, info: { sightH: 0.062, rearX: - 0.11, eyeBack: 0.08, muzzle: [ 0.1965, 0, 0 ], eject: [ 0.02, 0.015, 0.02 ], mag: { p: [ 0.062, - 0.03, 0 ], rake: 0 },
		optic: [ - 0.02, 0.0448 ], light: [ 0.12, 0.0, 0.03 ], hideWithOptic: [ 'buisR', 'buisF' ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ - 0.002, - 0.04, 0 ] } ), L: grip( [ 0.125, - 0.012, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.026 ) },
		stock: - 0.396, len: 0.6, charge: 'charge', chargeTravel: 0.05 } };
}
