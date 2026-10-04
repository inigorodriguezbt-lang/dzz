// Machine guns and bows: the M249 SAW, the PKM; the compound bow and the crossbow.
import { THREE, PI, Parts, circle, slot, grip, pistolGrip, trigger, triggerGuard, pins, screw, swivel, muzzleDevice } from './kit.js';

export function mg( o ) {
	return o.arch === 'pkm' ? pkm() : m249();
}

// ---- FN M249 SAW ----
// A stamped receiver with the feed tray cover on top ('cover', with its rail), the belt box under it and the side magwell
// for rifle magazines on the left, ejection out the bottom, the ribbed heat shield and the barrel's carry handle, the
// gas block with the bipod folded under the barrel, the ribbed polymer stock, the charging handle on the right.
function m249() {
	const P = new Parts();
	const bEnd = 0.62, hz = 0.029;
	P.extFront( 'blk', [ [ - hz, - 0.05 ], [ hz, - 0.05 ], [ hz, 0.036, 0.004 ], [ hz - 0.004, 0.04 ], [ - hz + 0.004, 0.04 ], [ - hz, 0.036, 0.004 ] ], - 0.18, 0.2, 0.0018 );
	// the stamping's ribs and rivets, the ejection chute underneath, the side magwell
	for ( const s of [ - 1, 1 ] ) {
		P.extS( 'blk', [ [ - 0.17, 0.008 ], [ 0.19, 0.008 ], [ 0.19, 0.013 ], [ - 0.17, 0.013 ] ], 0.0008, 0.0005, s * ( hz + 0.0004 ) );
		for ( let i = 0; i < 7; i ++ ) P.cylZ( 'steel', - 0.15 + i * 0.055, - 0.04, s * hz, s * ( hz + 0.0008 ), 0.0022, 8 );
	}
	P.box( 'rubber', - 0.03, 0.04, - 0.0508, - 0.0496, - 0.012, 0.012, 0.002 );
	P.extFront( 'blk', [ [ - 0.0485, - 0.018 ], [ - hz, - 0.018 ], [ - hz, 0.018 ], [ - 0.0485, 0.018 ] ], - 0.032, 0.032, 0.002 );
	P.box( 'rubber', - 0.026, 0.026, - 0.012, 0.012, - 0.0492, - 0.0478, 0.002 );
	P.box( 'blk', - 0.06, 0.06, - 0.056, - 0.05, - 0.035, 0.035, 0.002 ); // belt box hanger
	// feed cover, hinged at its back, a rail on top
	const cov = P.sub( 'cover', - 0.02, 0.05, 0 );
	cov.extFront( 'blk', [ [ - 0.0305, 0.039 ], [ 0.0305, 0.039 ], [ 0.0305, 0.058, 0.005 ], [ 0.026, 0.062 ], [ - 0.026, 0.062 ], [ - 0.0305, 0.058, 0.005 ] ], - 0.13, 0.12, 0.0016 );
	cov.rail( 'blk', - 0.12, 0.1, 0.068, 0.0105 );
	cov.cylZ( 'steel', - 0.125, 0.05, - 0.031, 0.031, 0.004, 10 );
	for ( const s of [ - 1, 1 ] ) cov.box( 'blk', 0.098, 0.12, 0.044, 0.056, s * 0.0305, s * 0.0325, 0.0015 );
	// barrel group: the front trunnion block, heat shield, barrel and its carry handle, gas block, bipod, flash hider
	P.extFront( 'blk', [ [ - 0.022, - 0.04, 0.004 ], [ 0.022, - 0.04, 0.004 ], [ 0.022, 0.03, 0.004 ], [ - 0.022, 0.03, 0.004 ] ], 0.198, 0.262, 0.002 );
	P.lathe( 'blk', [ [ 0.2, 0 ], [ 0.2, 0.0132 ], [ 0.25, 0.0128 ], [ bEnd - 0.004, 0.0108 ], [ bEnd, 0.0104 ], [ bEnd, 0 ] ], 0, 0, 16 );
	P.extFront( 'blk', [ [ - 0.0195, 0.006 ], [ 0.0195, 0.006 ], [ 0.0205, 0.018, 0.006 ], [ 0.0, 0.0265, 0.012 ], [ - 0.0205, 0.018, 0.006 ] ], 0.262, 0.45, 0.001, 3 );
	for ( let i = 0; i < 7; i ++ ) for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', slot( 0.275 + i * 0.024, 0.287 + i * 0.024, 0.014, 0.0026, 3 ), 0.0005, 0.0002, s * 0.0201 );
	P.extS( 'blk', [ [ 0.27, 0.025 ], [ 0.29, 0.1, 0.01 ], [ 0.35, 0.1, 0.01 ], [ 0.37, 0.025 ] ], 0.005, 0.002, 0, [ [ [ 0.292, 0.035 ], [ 0.348, 0.035 ], [ 0.338, 0.09, 0.006 ], [ 0.302, 0.09, 0.006 ] ] ] );
	P.box( 'poly', 0.3, 0.34, 0.088, 0.102, - 0.0062, 0.0062, 0.004 );
	P.extS( 'blk', [ [ 0.44, - 0.038 ], [ 0.47, - 0.038 ], [ 0.47, 0.012, 0.004 ], [ 0.44, 0.012, 0.004 ] ], 0.0145, 0.002 );
	P.cyl( 'blk', 0.262, 0.46, 0.0085, - 0.026, 0, 12 );
	for ( const s of [ - 1, 1 ] ) {
		P.box( 'blk', 0.45, 0.62, - 0.034, - 0.026, s * 0.012, s * 0.019, 0.003 );
		P.cyl( 'blk', 0.6, 0.632, 0.0048, - 0.03, s * 0.0155, 8 );
		P.cylZ( 'rubber', 0.632, - 0.03, s * 0.011, s * 0.02, 0.006, 10 );
	}
	const mz = muzzleDevice( P, 'birdcage', bEnd - 0.002, 0.0125, 0.054 );
	// front post (in its ears) over the muzzle end of the barrel, the rear aperture on the cover's back
	const fx = 0.535;
	P.box( 'blk', fx - 0.008, fx + 0.008, 0.008, 0.026, - 0.006, 0.006, 0.0015 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ fx - 0.007, 0.024 ], [ fx + 0.007, 0.024 ], [ fx + 0.004, 0.09, 0.003 ], [ fx - 0.004, 0.09, 0.003 ] ], s * 0.004, s * 0.0068, 0.0006 );
	P.box( 'blk', fx - 0.0015, fx + 0.0015, 0.024, 0.084, - 0.0012, 0.0012, 0.0003 );
	P.box( 'blk', - 0.125, - 0.095, 0.0625, 0.068, - 0.01, 0.01, 0.0012 );
	P.extFront( 'blk', [ [ - 0.0065, 0.066 ], [ 0.0065, 0.066 ], [ 0.006, 0.0885, 0.003 ], [ - 0.006, 0.0885, 0.003 ] ], - 0.1115, - 0.1085, 0.0004, 3, [ circle( 0, 0.084, 0.0019, 12 ) ] );
	P.cylZ( 'blk', - 0.105, 0.072, 0.0095, 0.0145, 0.0052, 12 );
	// lower handguard, the grip and guard, the ribbed fixed stock with its buffer pad
	P.extR( 'poly', [ [ - 0.022, - 0.042 ], [ 0.198, - 0.042 ], [ 0.198, - 0.068, 0.008 ], [ - 0.018, - 0.07, 0.008 ] ], 0.03, 0.006 );
	for ( let i = 0; i < 6; i ++ ) P.box( 'poly', 0.03 + i * 0.026, 0.038 + i * 0.026, - 0.073, - 0.066, - 0.026, 0.026, 0.002 );
	triggerGuard( P, 'blk', - 0.14, - 0.07, - 0.05, 0.03, 0.0055 );
	trigger( P, - 0.115, - 0.052 );
	const g = pistolGrip( P, 'poly', - 0.15, - 0.05, 0.1, 0.3, 0.036, 0.034, 0.015, 0.0045, 1 );
	P.extR( 'poly', [ [ - 0.18, 0.032 ], [ - 0.45, 0.022, 0.008 ], [ - 0.455, - 0.09, 0.01 ], [ - 0.42, - 0.095, 0.006 ], [ - 0.25, - 0.06, 0.02 ], [ - 0.18, - 0.05, 0.006 ] ], 0.0235, 0.007,
		0, [ [ [ - 0.24, 0.016, 0.006 ], [ - 0.41, 0.01, 0.008 ], [ - 0.414, - 0.06, 0.008 ], [ - 0.27, - 0.04, 0.01 ] ] ] );
	for ( let i = 0; i < 4; i ++ ) P.box( 'poly', - 0.39 + i * 0.04, - 0.384 + i * 0.04, - 0.064 + i * 0.008, 0.014 - i * 0.0015, - 0.019, 0.019, 0.0015 );
	P.extS( 'rubber', [ [ - 0.452, 0.026 ], [ - 0.468, 0.026, 0.005 ], [ - 0.468, - 0.098, 0.006 ], [ - 0.452, - 0.098 ] ], 0.025, 0.004 );
	swivel( P, - 0.4, - 0.088, 0, 0.0085 );
	// charging handle on the right
	const ch = P.sub( 'charge', 0.1, 0.0, 0.03 );
	ch.box( 'blk', 0.09, 0.11, - 0.008, 0.008, 0.029, 0.044, 0.003 );
	ch.cylZ( 'blk', 0.1, 0.0, 0.042, 0.054, 0.0068, 12 );
	return { P, info: {
		sightH: 0.084, rearX: - 0.11, eyeBack: 0.1, muzzle: [ mz, 0, 0 ], eject: [ 0.0, - 0.06, 0.0 ], mag: { p: [ 0.0, - 0.056, 0 ], rake: 0 }, magSide: { p: [ 0.0, 0.0, - 0.03 ], rot: [ - PI / 2, 0, 0 ] },
		optic: [ - 0.03, 0.0718 ], light: [ 0.4, 0.0, 0.026 ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ - 0.115, - 0.058, 0 ] } ), L: grip( [ 0.1, - 0.058, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.03 ) },
		stock: - 0.468, len: mz + 0.468, cover: 'cover', charge: 'charge', chargeTravel: 0.1, chargeSide: 1, heavy: 1, belt: 1,
	} };
}

// ---- PKM ----
// A stamped receiver with the long feed cover ('cover'), the belt box hanging on the right, the fluted barrel with its
// carry handle and the gas cylinder under it, the bipod folded at the gas block, the hooded front post, the long
// slotted flash hider, a skeleton stock, a wooden grip; the charging handle at the front right.
function pkm() {
	const P = new Parts();
	const bEnd = 0.7, hz = 0.021;
	P.extFront( 'blued', [ [ - hz, - 0.045 ], [ hz, - 0.045 ], [ hz, 0.026, 0.003 ], [ - hz, 0.026, 0.003 ] ], - 0.14, 0.22, 0.0016 );
	for ( const s of [ - 1, 1 ] ) {
		P.extS( 'blued', [ [ - 0.13, - 0.028 ], [ 0.21, - 0.028 ], [ 0.21, - 0.022 ], [ - 0.13, - 0.022 ] ], 0.0008, 0.0005, s * ( hz + 0.0004 ) );
		for ( const x of [ - 0.12, - 0.06, 0.09, 0.15, 0.2 ] ) P.cylZ( 'steel', x, - 0.036, s * hz, s * ( hz + 0.0008 ), 0.0022, 8 );
	}
	P.box( 'rubber', 0.0, 0.06, - 0.0458, - 0.0446, - 0.01, 0.01, 0.002 );
	const cov = P.sub( 'cover', - 0.02, 0.035, 0 );
	cov.extFront( 'blued', [ [ - 0.0215, 0.025 ], [ 0.0215, 0.025 ], [ 0.0215, 0.04, 0.005 ], [ 0.017, 0.044 ], [ - 0.017, 0.044 ], [ - 0.0215, 0.04, 0.005 ] ], - 0.12, 0.16, 0.0012 );
	cov.box( 'blued', 0.1, 0.13, 0.044, 0.05, - 0.012, 0.012, 0.002 );
	cov.cylZ( 'steel', - 0.115, 0.034, - 0.0225, 0.0225, 0.0038, 10 );
	// the cover latch and the rear sight's leaf ahead of the cover
	P.box( 'blued', 0.12, 0.2, 0.026, 0.044, - 0.0095, 0.0095, 0.002 );
	P.extS( 'blued', [ [ 0.13, 0.042 ], [ 0.19, 0.044 ], [ 0.19, 0.047, 0.001 ], [ 0.136, 0.0615, 0.002 ], [ 0.13, 0.0615 ] ], 0.0068, 0.0008 );
	P.box( 'rubber', 0.1575, 0.1625, 0.0555, 0.062, - 0.0011, 0.0011, 0 );
	// barrel: fluted, its carry handle (wood), the gas cylinder under it, the gas block with the folded bipod
	P.lathe( 'blued', [ [ 0.22, 0 ], [ 0.22, 0.0135 ], [ 0.26, 0.013 ], [ bEnd - 0.004, 0.0098 ], [ bEnd, 0.0095 ], [ bEnd, 0 ] ], 0, 0, 16 );
	for ( let i = 0; i < 8; i ++ ) { const a = i / 8 * PI * 2; P.boxC( 'rubber', 0.36, Math.cos( a ) * 0.0124, Math.sin( a ) * 0.0124, 0.18, 0.0012, 0.0028, 0, [ a, 0, 0 ] ); }
	P.cyl( 'blued', 0.22, 0.52, 0.009, - 0.028, 0, 12 );
	P.extS( 'blued', [ [ 0.26, 0.012 ], [ 0.27, 0.02 ], [ 0.34, 0.02 ], [ 0.35, 0.012 ] ], 0.004, 0.0012 );
	P.extR( 'walnut', [ [ 0.265, 0.018 ], [ 0.275, 0.07, 0.01 ], [ 0.335, 0.07, 0.01 ], [ 0.345, 0.018 ] ], 0.0065, 0.003, 0, [ [ [ 0.284, 0.026 ], [ 0.326, 0.026 ], [ 0.322, 0.058, 0.006 ], [ 0.288, 0.058, 0.006 ] ] ] );
	P.extS( 'blued', [ [ 0.5, - 0.04 ], [ 0.53, - 0.04 ], [ 0.53, 0.012, 0.004 ], [ 0.5, 0.012, 0.004 ] ], 0.0135, 0.002 );
	for ( const s of [ - 1, 1 ] ) {
		P.box( 'blued', 0.46, 0.66, - 0.028, - 0.02, s * 0.012, s * 0.02, 0.003 );
		P.extS( 'blued', [ [ 0.64, - 0.032 ], [ 0.67, - 0.032 ], [ 0.672, - 0.016, 0.003 ], [ 0.64, - 0.016 ] ], 0.0016, 0.0006, s * 0.016 );
	}
	// front sight base with the hood and post, the flash hider
	P.box( 'blued', bEnd - 0.022, bEnd, - 0.012, 0.03, - 0.01, 0.01, 0.003 );
	P.lathe( 'blued', [ [ bEnd - 0.019, 0.0108 ], [ bEnd - 0.003, 0.0108 ] ], 0.05, 0, 14 );
	P.box( 'blued', bEnd - 0.0125, bEnd - 0.0095, 0.028, 0.058, - 0.0012, 0.0012, 0.0003 );
	P.lathe( 'blued', [ [ bEnd - 0.002, 0 ], [ bEnd - 0.002, 0.0115 ], [ bEnd + 0.004, 0.0125 ], [ bEnd + 0.078, 0.0125 ], [ bEnd + 0.082, 0.0112 ], [ bEnd + 0.082, 0.006 ], [ bEnd + 0.08, 0 ] ], 0, 0, 18 );
	for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2 + PI / 2; P.boxC( 'rubber', bEnd + 0.048, Math.sin( a ) * 0.0124, Math.cos( a ) * 0.0124, 0.054, 0.0012, 0.0036, 0, [ a, 0, 0 ] ); }
	P.cyl( 'rubber', bEnd + 0.0814, bEnd + 0.0822, 0.006, 0, 0, 10 );
	// skeleton stock (laminate), the butt plate, the wooden grip and guard
	P.extR( 'lam', [ [ - 0.14, 0.02 ], [ - 0.46, - 0.01, 0.008 ], [ - 0.465, - 0.12, 0.01 ], [ - 0.43, - 0.125, 0.006 ], [ - 0.14, - 0.045, 0.006 ] ], 0.0175, 0.006,
		0, [ [ [ - 0.2, 0.004, 0.006 ], [ - 0.42, - 0.02, 0.008 ], [ - 0.42, - 0.1, 0.008 ], [ - 0.22, - 0.04, 0.008 ] ] ], 5 );
	P.extS( 'blued', [ [ - 0.462, - 0.006 ], [ - 0.477, - 0.007, 0.004 ], [ - 0.477, - 0.127, 0.005 ], [ - 0.462, - 0.127 ] ], 0.0188, 0.002 );
	triggerGuard( P, 'blued', - 0.07, 0.0, - 0.045, 0.03, 0.0052 );
	trigger( P, - 0.045, - 0.047 );
	const g = pistolGrip( P, 'walnut', - 0.08, - 0.045, 0.098, 0.3, 0.036, 0.034, 0.015, 0.0045, 0 );
	swivel( P, - 0.38, - 0.1, 0, 0.008 );
	// charging handle (front right, under the cover)
	const ch = P.sub( 'charge', 0.1, - 0.02, 0.02 );
	ch.box( 'blued', 0.09, 0.11, - 0.028, - 0.012, 0.021, 0.036, 0.003 );
	ch.cylZ( 'blued', 0.1, - 0.02, 0.034, 0.046, 0.0062, 12 );
	// optic side mount (shown with an optic)
	const m = P.sub( 'mount', - 0.04, 0.045, 0 );
	m.box( 'blued', - 0.1, 0.02, - 0.03, - 0.004, - 0.03, - 0.0215, 0.002 );
	m.box( 'blued', - 0.1, 0.02, - 0.004, 0.034, - 0.03, - 0.022, 0.003 );
	m.box( 'blued', - 0.098, 0.018, 0.032, 0.0422, - 0.0125, 0.0125, 0.002 );
	m.rail( 'blued', - 0.096, 0.016, 0.048, 0.0105 );
	return { P, info: {
		sightH: 0.058, rearX: 0.16, eyeBack: 0.28, muzzle: [ bEnd + 0.082, 0, 0 ], eject: [ 0.02, - 0.05, 0.0 ], mag: { p: [ 0.04, - 0.045, 0.012 ], rake: 0 },
		optic: [ - 0.04, 0.0518 ], opticParts: [ 'mount' ],
		grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ - 0.045, - 0.055, 0 ] } ), L: grip( [ - 0.3, - 0.08, 0 ], [ - 0.15, 1, 0 ], [ - 0.1, 0.1, - 1 ], 0.03, { under: 1 } ) },
		stock: - 0.477, len: bEnd + 0.082 + 0.48, cover: 'cover', charge: 'charge', chargeTravel: 0.1, chargeSide: 1, heavy: 1, belt: 1,
	}, mount: 'ak' };
}

// ---- bows ----
export function bow( o ) {
	return o.arch === 'crossbow' ? crossbow() : compound();
}

// A compound bow held upright (riser along y), the arrow along +x: the machined riser with its cut-outs and grip, split
// limbs in their pockets, the eccentric cams (the string runs off them: the view model redraws it to the nock), the
// cable guard, a pin sight with glowing fibres, the rest and a short stabiliser.
function compound() {
	const P = new Parts();
	P.extS( 'blk', [ [ 0.0, - 0.3 ], [ 0.03, - 0.28 ], [ 0.05, - 0.1 ], [ 0.02, - 0.05 ], [ 0.03, 0.05 ], [ 0.05, 0.12 ], [ 0.03, 0.28 ], [ 0.0, 0.3 ], [ - 0.01, 0.12 ], [ 0.0, 0.03 ], [ - 0.02, - 0.03 ], [ - 0.02, - 0.1 ], [ - 0.01, - 0.12 ] ], 0.012, 0.004,
		0, [ [ [ 0.012, 0.09, 0.006 ], [ 0.03, 0.12, 0.006 ], [ 0.02, 0.24, 0.006 ], [ 0.008, 0.2, 0.006 ] ], [ [ 0.012, - 0.14, 0.006 ], [ 0.03, - 0.12, 0.006 ], [ 0.02, - 0.24, 0.006 ], [ 0.008, - 0.2, 0.006 ] ] ] );
	P.extR( 'rubber', [ [ - 0.022, - 0.1 ], [ 0.018, - 0.1 ], [ 0.016, - 0.028, 0.006 ], [ - 0.024, - 0.03, 0.006 ] ], 0.0155, 0.006 );
	for ( const s of [ - 1, 1 ] ) {
		// limb pocket, the split limbs, the cam (an eccentric wheel with cut-outs) on its axle
		P.box( 'blk', - 0.008, 0.032, s * 0.27 - 0.016, s * 0.27 + 0.016, - 0.015, 0.015, 0.004 );
		for ( const z of [ - 0.0085, 0.0085 ] ) P.extS( 'od', [ [ 0.0, s * 0.278 ], [ 0.028, s * 0.282 ], [ - 0.042, s * 0.476 ], [ - 0.058, s * 0.468 ] ], 0.0042, 0.0012, z );
		P.ext( 'aluBright', [ ...circle( - 0.055, s * 0.475, 0.026, 18 ) ], - 0.0035, 0.0035, 0.0008, [ circle( - 0.05, s * 0.468, 0.007, 8 ), circle( - 0.062, s * 0.484, 0.006, 8 ) ] );
		P.cylZ( 'steel', - 0.055, s * 0.475, - 0.011, 0.011, 0.0035, 8 );
	}
	// cable guard and its slide, the rest, the sight with three fibres, the stabiliser
	P.rod( 'blk', [ - 0.01, 0.06, 0.0 ], [ - 0.1, 0.08, 0.014 ], 0.0035, 8 );
	P.box( 'poly', - 0.098, - 0.088, 0.072, 0.09, 0.008, 0.02, 0.002 );
	P.box( 'blk', 0.0, 0.03, 0.0, 0.008, - 0.02, - 0.012, 0.0015 );
	P.box( 'blk', 0.02, 0.1, 0.015, 0.03, - 0.02, - 0.012, 0.002 );
	P.ext( 'blk', [ [ 0.075, 0.018 ], [ 0.105, 0.018 ], [ 0.105, 0.076, 0.008 ], [ 0.075, 0.076, 0.008 ] ], - 0.032, - 0.012, 0.0015, [ circle( 0.09, 0.047, 0.012, 14 ) ] );
	for ( let i = 0; i < 3; i ++ ) P.box( 'glow', 0.084, 0.093, 0.04 + i * 0.006, 0.0414 + i * 0.006, - 0.0238, - 0.0202, 0 );
	P.cyl( 'blk', 0.04, 0.2, 0.009, - 0.06, 0, 12 );
	P.cyl( 'rubber', 0.2, 0.22, 0.014, - 0.06, 0, 14 );
	const str = P.sub( 'string', - 0.16, 0.0, 0 );
	str.rod( 'string', [ - 0.07, 0.475, 0 ], [ - 0.16, 0.0, 0 ], 0.002, 4 );
	str.rod( 'string', [ - 0.07, - 0.475, 0 ], [ - 0.16, 0.0, 0 ], 0.002, 4 );
	const ar = P.sub( 'arrow', - 0.16, 0.0, 0 );
	ar.cyl( 'poly', - 0.156, 0.5, 0.0038, 0.0, 0, 8 );
	ar.cyl( 'orange', - 0.162, - 0.156, 0.0042, 0.0, 0, 8 );
	ar.lathe( 'steel', [ [ 0.498, 0.0045 ], [ 0.51, 0.0052 ], [ 0.53, 0.0012 ] ], 0, 0, 8 );
	for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2; ar.boxC( i ? 'white' : 'orange', - 0.12, Math.sin( a ) * 0.008, Math.cos( a ) * 0.008, 0.06, 0.001, 0.014, 0, [ a, 0, 0 ] ); }
	return { P, info: {
		sightH: 0.052, rearX: - 0.2, eyeBack: 0.45, muzzle: [ 0.5, 0, 0 ], eject: null,
		grips: { R: grip( [ - 0.17, - 0.01, 0.0 ], [ 0.0, 1, 0 ], [ - 0.2, 0.0, 1 ], 0.004, { draw: 1 } ), L: grip( [ 0.0, - 0.065, 0 ], [ 0.05, 1, 0 ], [ 0.2, 0, - 1 ], 0.02, { vert: 1, bow: 1 } ) },
		stock: 0, len: 0.8, string: 'string', arrow: 'arrow', bow: 1,
	} };
}

// A modern hunting crossbow: the polymer stock with its thumbhole grip, the aluminium barrel and flight rail, the
// riser with the limbs swept forward to the pulleys (the string runs from them: the view model redraws it), the foot
// stirrup, the scope rail and a fibre front sight.
function crossbow() {
	const P = new Parts();
	P.extR( 'poly', [ [ - 0.45, 0.02 ], [ - 0.2, 0.02 ], [ - 0.1, 0.0 ], [ 0.02, 0.0 ], [ 0.02, - 0.02 ], [ - 0.07, - 0.025 ], [ - 0.1, - 0.1, 0.012 ], [ - 0.13, - 0.1 ], [ - 0.14, - 0.035 ], [ - 0.2, - 0.035 ], [ - 0.44, - 0.1, 0.01 ], [ - 0.455, - 0.09 ] ], 0.018, 0.006,
		0, [ [ [ - 0.12, - 0.03 ], [ - 0.2, - 0.02 ], [ - 0.2, 0.004 ], [ - 0.15, 0.004 ] ] ] );
	P.extS( 'rubber', [ [ - 0.445, 0.022 ], [ - 0.462, 0.022, 0.004 ], [ - 0.462, - 0.095, 0.005 ], [ - 0.447, - 0.098 ] ], 0.019, 0.003 );
	// barrel and flight rail, the forend under it, the scope rail
	P.extFront( 'blk', [ [ - 0.014, - 0.015, 0.003 ], [ 0.014, - 0.015, 0.003 ], [ 0.014, 0.006 ], [ - 0.014, 0.006 ] ], - 0.12, 0.44, 0.0015 );
	P.box( 'alu', - 0.1, 0.44, 0.006, 0.012, - 0.006, 0.006, 0.001 );
	for ( const s of [ - 1, 1 ] ) P.box( 'rubber', 0.02, 0.4, 0.0, 0.004, s * 0.0141, s * 0.0144, 0.001 );
	P.rail( 'blk', - 0.12, 0.0, 0.028, 0.0105 );
	P.box( 'blk', - 0.12, 0.0, 0.006, 0.022, - 0.01, 0.01, 0.002 );
	P.extR( 'poly', [ [ 0.1, - 0.015 ], [ 0.3, - 0.015 ], [ 0.3, - 0.042, 0.01 ], [ 0.11, - 0.05, 0.01 ] ], 0.02, 0.006 );
	for ( let i = 0; i < 6; i ++ ) P.box( 'poly', 0.13 + i * 0.026, 0.138 + i * 0.026, - 0.052, - 0.044, - 0.0185, 0.0185, 0.002 );
	// riser, limbs, pulleys on their axles, the stirrup
	P.extFront( 'blk', [ [ - 0.04, - 0.012, 0.006 ], [ 0.04, - 0.012, 0.006 ], [ 0.03, 0.012, 0.006 ], [ - 0.03, 0.012, 0.006 ] ], 0.4, 0.46, 0.003 );
	for ( const s of [ - 1, 1 ] ) {
		for ( const y of [ - 0.006, 0.006 ] ) P.rod( 'blk', [ 0.44, y, s * 0.032 ], [ 0.39, y, s * 0.322 ], 0.0062, 8, 0.0045 );
		P.cylY( 'aluBright', 0.385, - 0.008, 0.008, 0.018, s * 0.33, 16 );
		P.cylY( 'steel', 0.385, - 0.014, 0.014, 0.0028, s * 0.33, 8 );
	}
	P.extS( 'blk', [ [ 0.45, 0.005 ], [ 0.52, 0.005, 0.02 ], [ 0.52, - 0.04, 0.02 ], [ 0.45, - 0.04 ] ], 0.03, 0.004, 0, [ [ [ 0.46, - 0.005 ], [ 0.51, - 0.005 ], [ 0.51, - 0.03 ], [ 0.46, - 0.03 ] ] ] );
	P.box( 'rubber', 0.5, 0.52, - 0.04, 0.005, - 0.024, 0.024, 0.004 );
	const str = P.sub( 'string', 0.02, 0.012, 0 );
	for ( const s of [ - 1, 1 ] ) str.rod( 'string', [ 0.02, 0.012, 0 ], [ 0.385, 0.012, s * 0.33 ], 0.0018, 4 );
	const bolt = P.sub( 'arrow', 0.02, 0.018, 0 );
	bolt.cyl( 'alu', 0.02, 0.4, 0.0042, 0.018, 0, 8 );
	bolt.lathe( 'steel', [ [ 0.398, 0.0048 ], [ 0.41, 0.0055 ], [ 0.43, 0.0012 ] ], 0.018, 0, 8 );
	for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2; bolt.boxC( i ? 'white' : 'orange', 0.05, 0.018 + Math.sin( a ) * 0.008, Math.cos( a ) * 0.008, 0.05, 0.001, 0.012, 0, [ a, 0, 0 ] ); }
	triggerGuard( P, 'poly', - 0.1, - 0.03, - 0.02, 0.025, 0.005 );
	trigger( P, - 0.075, - 0.022, 0.016 );
	// the safety on the tang, the rear peep and the fibre front sight
	P.box( 'blk', - 0.13, - 0.112, 0.018, 0.024, - 0.004, 0.004, 0.0015 );
	P.box( 'blk', - 0.06, - 0.05, 0.012, 0.04, - 0.006, 0.006, 0.002 );
	P.box( 'blk', 0.355, 0.375, 0.012, 0.03, - 0.006, 0.006, 0.0015 );
	P.box( 'fiber', 0.36, 0.37, 0.03, 0.04, - 0.0015, 0.0015, 0 );
	return { P, info: {
		sightH: 0.04, rearX: - 0.055, eyeBack: 0.12, muzzle: [ 0.44, 0.018, 0 ], eject: null, optic: [ - 0.06, 0.0318 ],
		grips: { R: grip( [ - 0.115, - 0.06, 0 ], [ 0.3, 0.95, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ - 0.075, - 0.03, 0 ] } ), L: grip( [ 0.2, - 0.034, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.026 ) },
		stock: - 0.462, len: 0.95, string: 'string', arrow: 'arrow', crossbow: 1,
	} };
}
