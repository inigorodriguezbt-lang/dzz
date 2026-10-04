// Manually operated rifles and the Barrett: bolt actions (Remington 700, M24, CZ 527), the lever action, the Mosin, the M82.
import { THREE, PI, Parts, circle, slot, grip, pistolGrip, trigger, triggerGuard, pins, screw, swivel } from './kit.js';

// ---- bolt actions: Remington 700 (walnut sporter), M24 SWS (OD composite, heavy barrel), CZ 527 (carbine, box mag) ----
// The round receiver with its port and the bolt body in it, the recoil lug and the tang, scope bases screwed on top;
// the bolt ('boltHandle': it turns up about the bore, then slides back) with its shroud and swept handle.
export function boltRifle( o ) {
	const P = new Parts();
	const v = o.v || '700';
	const m24 = v === 'm24', cz = v === 'cz';
	const stockM = m24 ? 'od' : 'walnut';
	const bEnd = m24 ? 0.66 : cz ? 0.52 : 0.66;
	const rr = cz ? 0.0158 : 0.0172;
	P.cyl( 'blued', - 0.105, 0.085, rr, 0, 0, 24 );
	P.lathe( 'blued', [ [ 0.085, 0 ], [ 0.085, rr ], [ 0.09, rr - 0.0014 ], [ 0.09, 0 ] ], 0, 0, 24 );
	P.box( 'rubber', - 0.036, 0.036, 0.0015, 0.0165, rr - 0.006, rr - 0.002, 0.004 );
	P.box( 'steel', - 0.034, 0.034, 0.003, 0.0135, rr - 0.0054, rr - 0.003, 0.004 );
	P.box( 'blued', 0.07, 0.085, - 0.026, - 0.012, - 0.012, 0.012, 0.002 );
	P.extS( 'blued', [ [ - 0.105, - 0.012 ], [ - 0.105, 0.012 ], [ - 0.128, 0.004, 0.006 ], [ - 0.13, - 0.012 ] ], 0.0105, 0.0015 );
	P.extS( 'blued', [ [ - 0.112, 0.0 ], [ - 0.098, 0.0 ], [ - 0.099, 0.006, 0.002 ], [ - 0.11, 0.006 ] ], 0.0012, 0.0004, 0.0118 ); // safety
	P.extS( 'blued', [ [ - 0.01, - 0.004 ], [ 0.012, - 0.004 ], [ 0.012, 0.002, 0.002 ], [ - 0.01, 0.002 ] ], 0.0008, 0.0003, - rr - 0.0004 ); // bolt release
	for ( const x of [ - 0.075, 0.05 ] ) {
		// scope bases, screwed down
		P.box( 'blued', x - 0.013, x + 0.013, 0.013, 0.021, - 0.009, 0.009, 0.002 );
		for ( const d of [ - 0.007, 0.007 ] ) screw( P, x + d, 0.0205, 0, 'y', 1, 0.0022, 'blued', true );
	}
	// barrel: a sporter taper (the M24's a heavy bull barrel) to a recessed crown
	const r0 = m24 ? 0.0145 : 0.0142, r1 = m24 ? 0.0122 : 0.0084;
	P.lathe( 'blued', [ [ 0.09, 0 ], [ 0.09, r0 ], [ 0.14, m24 ? 0.014 : 0.0128 ], [ bEnd - 0.004, r1 ], [ bEnd, r1 - 0.0006 ], [ bEnd, 0.0048 ], [ bEnd - 0.0015, 0.0042 ], [ bEnd - 0.002, 0 ] ], 0, 0, 20 );
	P.cyl( 'rubber', bEnd - 0.0022, bEnd - 0.0016, 0.004, 0, 0, 10 );
	// bolt: body, shroud, the swept handle and its knob
	const bolt = P.sub( 'boltHandle', - 0.07, 0, 0 );
	bolt.cyl( 'steel', - 0.125, - 0.02, 0.0092, 0, 0, 16 );
	bolt.lathe( 'blued', [ [ - 0.152, 0 ], [ - 0.152, 0.0065 ], [ - 0.146, 0.0092 ], [ - 0.13, 0.0132 ], [ - 0.12, 0.0135 ], [ - 0.12, 0 ] ], 0, 0, 16 );
	bolt.cyl( 'steel', - 0.154, - 0.151, 0.0035, 0, 0, 10 );
	bolt.rod( 'steel', [ - 0.08, 0.002, 0.008 ], [ - 0.084, - 0.012, 0.03 ], 0.0042, 10, 0.0038 );
	bolt.rod( 'steel', [ - 0.084, - 0.012, 0.03 ], [ - 0.089, - 0.031, 0.05 ], 0.0038, 10, 0.0034 );
	bolt.sphere( m24 ? 'poly' : 'blued', - 0.09, - 0.034, 0.054, m24 ? 0.0112 : 0.0098, 14 );
	if ( m24 ) {
		// composite stock: a near-vertical grip, a straight comb, a wide beavertail forend, the adjustable butt plate
		P.extFront( 'od', [ [ - 0.022, 0.001, 0.003 ], [ - 0.0135, 0.001 ], [ - 0.0135, - 0.012 ], [ 0.0135, - 0.012 ], [ 0.0135, 0.001 ], [ 0.022, 0.001, 0.003 ], [ 0.0225, - 0.036, 0.012 ], [ - 0.0225, - 0.036, 0.012 ] ], 0.075, 0.45, 0.004, 4 );
		P.extR( 'od', [ [ 0.08, - 0.006 ], [ 0.08, - 0.052, 0.008 ], [ - 0.02, - 0.058 ], [ - 0.11, - 0.058, 0.01 ], [ - 0.135, - 0.104, 0.012 ], [ - 0.188, - 0.104, 0.01 ], [ - 0.198, - 0.056, 0.012 ], [ - 0.42, - 0.082, 0.008 ], [ - 0.43, - 0.076 ], [ - 0.43, 0.012, 0.008 ], [ - 0.2, 0.01, 0.02 ], [ - 0.11, - 0.006 ] ], 0.021, 0.008, 0, [], 5 );
		P.extS( 'blk', [ [ - 0.428, 0.012 ], [ - 0.436, 0.012 ], [ - 0.436, - 0.078 ], [ - 0.428, - 0.078 ] ], 0.019, 0.001 );
		for ( let i = 0; i < 2; i ++ ) P.extS( 'blk', [ [ - 0.437 - i * 0.004, 0.008 ], [ - 0.439 - i * 0.004, 0.008 ], [ - 0.439 - i * 0.004, - 0.074 ], [ - 0.437 - i * 0.004, - 0.074 ] ], 0.017, 0.0005 );
		P.extS( 'rubber', [ [ - 0.446, 0.014 ], [ - 0.458, 0.014, 0.005 ], [ - 0.458, - 0.08, 0.005 ], [ - 0.446, - 0.08 ] ], 0.0195, 0.003 );
		for ( const [ x, y ] of [ [ 0.38, - 0.036 ], [ 0.33, - 0.036 ], [ - 0.36, - 0.074 ] ] ) swivel( P, x, y, 0, 0.0075 );
	} else {
		const fx1 = cz ? 0.36 : 0.415;
		// forend: the channelled walnut round the barrel, the black tip, the checkered panels
		const fe = [ [ - 0.0185, 0.001, 0.003 ], [ - 0.0128, 0.001 ], [ - 0.0128, - 0.012 ], [ 0.0128, - 0.012 ], [ 0.0128, 0.001 ], [ 0.0185, 0.001, 0.003 ], [ 0.0192, - 0.028, 0.012 ], [ 0.009, - 0.046, 0.012 ], [ - 0.009, - 0.046, 0.012 ], [ - 0.0192, - 0.028, 0.012 ] ];
		P.extFront( stockM, fe, 0.075, fx1, 0.004, 4 );
		if ( ! cz ) P.extFront( 'rubber', [ [ - 0.017, - 0.004, 0.003 ], [ 0.017, - 0.004, 0.003 ], [ 0.0178, - 0.028, 0.012 ], [ 0.008, - 0.043, 0.01 ], [ - 0.008, - 0.043, 0.01 ], [ - 0.0178, - 0.028, 0.012 ] ], fx1, fx1 + 0.016, 0.004, 4 );
		for ( const s of [ - 1, 1 ] ) P.extS( 'walnutC', [ [ 0.16, - 0.008 ], [ 0.3, - 0.008 ], [ 0.31, - 0.026, 0.006 ], [ 0.15, - 0.026, 0.006 ] ], 0.0006, 0.0003, s * 0.0189 );
		// action inletting, the wrist and the butt, rounded; the Monte Carlo comb and the cheek piece; checkering on the wrist
		P.extR( stockM, [ [ 0.08, - 0.006 ], [ 0.08, - 0.049, 0.01 ], [ - 0.062, - 0.052 ], [ - 0.098, - 0.07, 0.016 ], [ - 0.14, - 0.083, 0.008 ], [ - 0.2, - 0.078 ], [ - 0.43, - 0.126, 0.01 ], [ - 0.436, - 0.12, 0.004 ], [ - 0.436, 0.003, 0.008 ], [ - 0.25, 0.01, 0.04 ], [ - 0.19, - 0.004, 0.02 ], [ - 0.13, - 0.009 ] ], 0.0185, 0.0078, 0, [], 5 );
		P.extR( stockM, [ [ - 0.21, - 0.004 ], [ - 0.36, - 0.012, 0.02 ], [ - 0.37, - 0.05, 0.02 ], [ - 0.23, - 0.042, 0.02 ] ], 0.0028, 0.0024, - 0.0198 );
		for ( const s of [ - 1, 1 ] ) P.extS( 'walnutC', [ [ - 0.075, - 0.02 ], [ - 0.12, - 0.022 ], [ - 0.136, - 0.068, 0.008 ], [ - 0.098, - 0.062, 0.008 ] ], 0.0006, 0.0003, s * 0.0187 );
		P.extS( 'rubber', [ [ - 0.138, - 0.0845 ], [ - 0.098, - 0.0725 ], [ - 0.1, - 0.069 ], [ - 0.14, - 0.0805 ] ], 0.014, 0.002 ); // grip cap
		if ( ! cz ) {
			P.extS( 'rubber', [ [ - 0.434, 0.004, 0.006 ], [ - 0.455, 0.003, 0.006 ], [ - 0.458, - 0.126, 0.008 ], [ - 0.436, - 0.13, 0.004 ] ], 0.0192, 0.005 );
			P.extS( 'white', [ [ - 0.433, 0.003 ], [ - 0.4365, 0.003 ], [ - 0.4385, - 0.127 ], [ - 0.435, - 0.127 ] ], 0.0178, 0.001 );
		} else P.extS( 'blued', [ [ - 0.434, 0.003 ], [ - 0.446, 0.002, 0.004 ], [ - 0.446, - 0.124, 0.005 ], [ - 0.434, - 0.126 ] ], 0.0182, 0.002 );
		for ( const [ x, y ] of [ [ fx1 - 0.065, - 0.046 ], [ - 0.36, - 0.113 ] ] ) swivel( P, x, y + 0.001, 0, 0.0072 );
	}
	// trigger guard with the hinged floorplate (the CZ: its detachable magazine's well and latch)
	triggerGuard( P, 'blued', - 0.036, 0.04, - 0.05, 0.028, 0.0052 );
	trigger( P, - 0.012, - 0.052, 0.017 );
	if ( ! cz ) {
		P.extS( 'blued', [ [ 0.04, - 0.0495 ], [ 0.09, - 0.0495 ], [ 0.09, - 0.054, 0.003 ], [ 0.04, - 0.055 ] ], 0.011, 0.0012 );
		P.box( 'blued', 0.036, 0.042, - 0.056, - 0.05, - 0.004, 0.004, 0.001 );
	} else {
		P.extFront( 'blued', [ [ - 0.0132, - 0.05 ], [ 0.0132, - 0.05 ], [ 0.0132, - 0.034 ], [ - 0.0132, - 0.034 ] ], - 0.008, 0.05, 0.0012 );
		P.extS( 'blued', [ [ 0.048, - 0.045 ], [ 0.056, - 0.045 ], [ 0.056, - 0.052, 0.002 ], [ 0.048, - 0.052 ] ], 0.0045, 0.001 );
	}
	// low irons: a leaf on the barrel, a ramp and bead at the muzzle (the CZ's hooded)
	const sightH = 0.024;
	P.extS( 'blued', [ [ 0.244, 0.009 ], [ 0.268, 0.009 ], [ 0.264, 0.017 ], [ 0.258, sightH + 0.002 ], [ 0.254, sightH + 0.002 ], [ 0.248, 0.017 ] ], 0.007, 0.001 );
	P.box( 'rubber', 0.2545, 0.2575, sightH - 0.0025, sightH + 0.0025, - 0.001, 0.001, 0 );
	P.extS( 'blued', [ [ bEnd - 0.05, 0.007 ], [ bEnd - 0.008, 0.007 ], [ bEnd - 0.01, 0.017, 0.002 ], [ bEnd - 0.02, 0.018 ] ], 0.0035, 0.0008 );
	P.box( 'blued', bEnd - 0.02, bEnd - 0.012, 0.012, sightH, - 0.0015, 0.0015, 0.0005 );
	P.sphere( 'brass', bEnd - 0.016, sightH, 0, 0.0015, 8 );
	if ( cz ) P.lathe( 'blued', [ [ bEnd - 0.026, 0.0072 ], [ bEnd - 0.008, 0.0072 ] ], sightH, 0, 14 );
	return {
		P, info: {
			sightH, rearX: 0.256, eyeBack: 0.3, muzzle: [ bEnd, 0, 0 ], eject: [ 0.0, 0.012, 0.016 ], shellPort: [ 0.0, 0.02, 0 ],
			mag: cz ? { p: [ 0.02, - 0.036, 0 ], rake: 0 } : null, optic: [ - 0.012, 0.021 ],
			grips: { R: grip( [ - 0.14, - 0.045, 0 ], [ 0.5, 0.86, 0 ], [ 0.05, 0.15, 1 ], 0.02, { trig: [ - 0.012, - 0.06, 0 ] } ), L: grip( [ 0.27, - 0.028, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.024 ) },
			stock: - 0.458, len: bEnd + 0.46, boltHandle: 'boltHandle', boltTravel: 0.085,
		},
	};
}

// ---- lever action (.30-30, Marlin 336 / Winchester 94 pattern) ----
// A blued receiver with the loading gate on the right and the side ejection on top, the exposed hammer, the lever loop
// ('lever') under it, the tube magazine under the barrel held by a band, a straight-grip walnut stock with a curved butt
// plate, a buckhorn rear sight and a bead on a ramp.
export function leverRifle() {
	const P = new Parts();
	const bEnd = 0.6, sightH = 0.022;
	// receiver: flat sides with rounded top and front, the gate, the screws
	P.extS( 'blued', [ [ - 0.082, - 0.034 ], [ 0.07, - 0.034 ], [ 0.078, - 0.026, 0.006 ], [ 0.078, 0.012, 0.008 ], [ 0.066, 0.02, 0.008 ], [ - 0.07, 0.02, 0.008 ], [ - 0.082, 0.012, 0.006 ] ], 0.0155, 0.0018 );
	P.extS( 'blued', [ [ 0.0, - 0.024 ], [ 0.042, - 0.024, 0.004 ], [ 0.042, - 0.01, 0.004 ], [ 0.0, - 0.01 ] ], 0.0012, 0.0005, 0.0162 );
	P.box( 'rubber', 0.005, 0.038, - 0.0215, - 0.0125, 0.0167, 0.0172, 0.0012 );
	for ( const [ x, y ] of [ [ - 0.06, 0.005 ], [ - 0.035, - 0.024 ], [ 0.055, - 0.016 ] ] ) for ( const s of [ - 1, 1 ] ) screw( P, x, y, s * 0.0155, 'z', s, 0.0024, 'steel' );
	// the bolt's back end and the ejection port on top
	P.box( 'rubber', - 0.04, 0.055, 0.0175, 0.0205, - 0.0085, 0.0085, 0.002 );
	P.box( 'steel', - 0.07, - 0.03, 0.002, 0.016, - 0.007, 0.007, 0.002 );
	// barrel (octagon-to-round on the classic pattern: here round), the magazine tube and its cap, the barrel band
	P.lathe( 'blued', [ [ 0.075, 0 ], [ 0.075, 0.0112 ], [ 0.1, 0.0108 ], [ bEnd - 0.004, 0.0094 ], [ bEnd, 0.009 ], [ bEnd, 0.0042 ], [ bEnd - 0.001, 0 ] ], 0, 0, 18 );
	P.cyl( 'blued', 0.075, bEnd - 0.032, 0.0082, - 0.0205, 0, 14 );
	P.lathe( 'blued', [ [ bEnd - 0.034, 0.0086 ], [ bEnd - 0.026, 0.0086 ], [ bEnd - 0.024, 0.0068 ], [ bEnd - 0.024, 0.0 ] ], - 0.0205, 0, 14 );
	P.extS( 'blued', [ [ bEnd - 0.055, - 0.032 ], [ bEnd - 0.04, - 0.032 ], [ bEnd - 0.04, 0.012, 0.006 ], [ bEnd - 0.055, 0.012, 0.006 ] ], 0.0105, 0.0014 );
	P.cylZ( 'steel', bEnd - 0.0475, - 0.0205, - 0.0108, 0.0108, 0.0016, 8 );
	// forend round the tube and its band, the straight-grip stock with the curved steel butt plate
	P.extR( 'walnut', [ [ 0.078, 0.004 ], [ 0.31, 0.004, 0.006 ], [ 0.31, - 0.03, 0.008 ], [ 0.078, - 0.034 ] ], 0.0172, 0.0068 );
	P.extS( 'blued', [ [ 0.304, - 0.034 ], [ 0.316, - 0.034 ], [ 0.316, 0.008, 0.004 ], [ 0.304, 0.008, 0.004 ] ], 0.0182, 0.0014 );
	P.extR( 'walnut', [ [ - 0.082, 0.014 ], [ - 0.42, - 0.006, 0.004 ], [ - 0.43, - 0.12, 0.012 ], [ - 0.39, - 0.122 ], [ - 0.14, - 0.05, 0.02 ], [ - 0.082, - 0.034, 0.006 ] ], 0.017, 0.0072, 0, [], 5 );
	P.extS( 'blued', [ [ - 0.422, - 0.004 ], [ - 0.434, - 0.006, 0.006 ], [ - 0.442, - 0.06, 0.04 ], [ - 0.44, - 0.122, 0.008 ], [ - 0.428, - 0.124 ] ], 0.0175, 0.002 );
	swivel( P, - 0.36, - 0.1, 0, 0.007 );
	swivel( P, bEnd - 0.0475, - 0.032, 0, 0.007 );
	// hammer (with its spur) and the lever loop, the trigger
	const h = P.sub( 'hammer', - 0.07, 0.01, 0 );
	h.extS( 'blued', [ [ - 0.066, 0.004 ], [ - 0.07, 0.022 ], [ - 0.088, 0.03, 0.004 ], [ - 0.09, 0.024 ], [ - 0.078, 0.012 ], [ - 0.076, 0.0 ] ], 0.0035, 0.001 );
	for ( let i = 0; i < 4; i ++ ) h.box( 'rubber', - 0.0885 + i * 0.0035, - 0.087 + i * 0.0035, 0.025 + i * 0.0012, 0.031 + i * 0.0012, - 0.0036, 0.0036, 0 );
	const lv = P.sub( 'lever', 0.045, - 0.032, 0 );
	lv.extS( 'blued', [ [ 0.05, - 0.028 ], [ 0.04, - 0.038 ], [ - 0.04, - 0.042 ], [ - 0.13, - 0.075, 0.02 ], [ - 0.13, - 0.098, 0.014 ], [ - 0.09, - 0.1, 0.012 ], [ - 0.02, - 0.062, 0.012 ], [ 0.03, - 0.058, 0.01 ], [ 0.055, - 0.04 ] ], 0.005, 0.0015,
		0, [ [ [ - 0.085, - 0.078 ], [ - 0.035, - 0.055 ], [ 0.02, - 0.05, 0.006 ], [ 0.02, - 0.047 ], [ - 0.035, - 0.049 ], [ - 0.11, - 0.07, 0.01 ], [ - 0.11, - 0.09, 0.008 ] ] ] );
	lv.cylZ( 'steel', 0.045, - 0.032, - 0.0165, 0.0165, 0.0025, 10 );
	trigger( P, - 0.01, - 0.034, 0.014 );
	// buckhorn rear on the barrel, the bead on its ramp
	P.extS( 'blued', [ [ 0.186, 0.009 ], [ 0.204, 0.009 ], [ 0.204, sightH + 0.004 ], [ 0.198, sightH + 0.005 ], [ 0.192, sightH + 0.005 ], [ 0.186, sightH + 0.004 ] ], 0.0085, 0.0008 );
	P.box( 'rubber', 0.1885, 0.2015, sightH - 0.002, sightH + 0.0045, - 0.0012, 0.0012, 0 );
	P.extS( 'blued', [ [ bEnd - 0.046, 0.0085 ], [ bEnd - 0.01, 0.0085 ], [ bEnd - 0.012, 0.017, 0.002 ], [ bEnd - 0.022, sightH - 0.002 ] ], 0.0035, 0.0008 );
	P.box( 'blued', bEnd - 0.022, bEnd - 0.012, 0.012, sightH, - 0.0016, 0.0016, 0.0005 );
	P.sphere( 'brass', bEnd - 0.017, sightH, 0, 0.0017, 8 );
	return {
		P, info: {
			sightH, rearX: 0.195, eyeBack: 0.28, muzzle: [ bEnd, 0, 0 ], eject: [ 0.02, 0.02, 0.0 ], shellPort: [ 0.02, - 0.02, 0.016 ], optic: [ - 0.01, 0.021 ],
			grips: { R: grip( [ - 0.11, - 0.04, 0 ], [ 0.55, 0.83, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.01, - 0.042, 0 ] } ), L: grip( [ 0.2, - 0.014, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.022 ) },
			stock: - 0.445, len: bEnd + 0.45, lever: 'lever', hammer: 'hammer', mount: 1,
		},
	};
}

// ---- Mosin-Nagant M91/30 ----
// The round receiver with its hex front ring, the straight bolt handle sticking out to the right, the magazine box and
// guard under it, the long stock running almost to the muzzle with two barrel bands and their sling slots, the upper
// handguard, the tangent rear sight on the barrel and the hooded post at the muzzle.
export function mosin() {
	const P = new Parts();
	const bEnd = 0.8, sightH = 0.032;
	P.cyl( 'blued', - 0.1, 0.07, 0.0165, 0, 0, 20 );
	P.cyl( 'blued', 0.035, 0.07, 0.0185, 0, 0, 6, 0.0185, PI / 6 );
	P.box( 'blued', - 0.1, 0.03, - 0.008, 0.006, - 0.0175, 0.0175, 0.002 );
	P.box( 'rubber', - 0.06, 0.018, 0.004, 0.0165, - 0.0105, 0.0105, 0.003 );
	P.extS( 'blued', [ [ - 0.1, - 0.012 ], [ - 0.1, 0.01 ], [ - 0.122, 0.002, 0.006 ], [ - 0.125, - 0.012 ] ], 0.0095, 0.0015 );
	// barrel (stepped), the magazine box with its floor plate catch, the guard
	P.lathe( 'blued', [ [ 0.07, 0 ], [ 0.07, 0.0128 ], [ 0.2, 0.0118 ], [ 0.205, 0.0108 ], [ bEnd - 0.004, 0.0086 ], [ bEnd, 0.0082 ], [ bEnd, 0.004 ], [ bEnd - 0.001, 0 ] ], 0, 0, 18 );
	P.cyl( 'rubber', bEnd - 0.0004, bEnd + 0.0003, 0.004, 0, 0, 10 );
	P.extS( 'blued', [ [ - 0.008, - 0.04 ], [ 0.085, - 0.04 ], [ 0.08, - 0.07, 0.006 ], [ 0.0, - 0.072, 0.006 ] ], 0.0125, 0.002 );
	P.box( 'blued', 0.07, 0.078, - 0.074, - 0.066, - 0.004, 0.004, 0.001 );
	triggerGuard( P, 'blued', - 0.07, - 0.005, - 0.042, 0.026, 0.005 );
	trigger( P, - 0.04, - 0.044, 0.017 );
	// stock: the long forend to the front band, the straight wrist and the butt with its steel plate; two sling slots
	P.extR( 'walnut', [ [ 0.07, - 0.006 ], [ 0.7, - 0.006, 0.004 ], [ 0.7, - 0.026, 0.006 ], [ 0.08, - 0.042 ], [ - 0.03, - 0.048 ], [ - 0.09, - 0.04 ], [ - 0.2, - 0.056, 0.02 ], [ - 0.46, - 0.128, 0.008 ], [ - 0.47, - 0.12 ], [ - 0.47, - 0.004, 0.006 ], [ - 0.2, 0.004, 0.02 ], [ - 0.1, - 0.004 ] ], 0.0172, 0.0068, 0, [], 5 );
	for ( const x of [ - 0.3, 0.19 ] ) P.box( 'rubber', x - 0.012, x + 0.012, - 0.08 * ( x < 0 ? 1 : 0.3 ) - 0.006, - 0.08 * ( x < 0 ? 1 : 0.3 ) + 0.002, - 0.0178, 0.0178, 0.002 );
	P.extFront( 'walnut', [ [ - 0.0118, 0.004 ], [ 0.0118, 0.004 ], [ 0.0128, 0.012, 0.006 ], [ 0, 0.018, 0.008 ], [ - 0.0128, 0.012, 0.006 ] ], 0.16, 0.46, 0.002, 4 );
	for ( const x of [ 0.32, 0.62 ] ) {
		P.extFront( 'blued', [ [ - 0.0168, - 0.03, 0.008 ], [ 0.0168, - 0.03, 0.008 ], [ 0.0172, 0.008, 0.008 ], [ 0.0, 0.0175, 0.012 ], [ - 0.0172, 0.008, 0.008 ] ], x - 0.007, x + 0.007, 0.0012, 4 );
		P.box( 'rubber', x - 0.004, x + 0.004, - 0.024, - 0.016, - 0.0176, 0.0176, 0.0008 );
	}
	P.extS( 'blued', [ [ - 0.462, - 0.002 ], [ - 0.482, - 0.003, 0.004 ], [ - 0.482, - 0.13, 0.006 ], [ - 0.468, - 0.13 ] ], 0.0178, 0.002 );
	// tangent rear sight: the base on the barrel, the leaf, its slider
	P.extS( 'blued', [ [ 0.1, 0.008 ], [ 0.16, 0.008 ], [ 0.16, 0.017, 0.003 ], [ 0.1, 0.019, 0.003 ] ], 0.0092, 0.0015 );
	P.extS( 'blued', [ [ 0.112, 0.017 ], [ 0.158, 0.018 ], [ 0.158, 0.021, 0.001 ], [ 0.118, sightH + 0.002, 0.002 ], [ 0.112, sightH + 0.002 ] ], 0.0075, 0.0008 );
	P.box( 'rubber', 0.1325, 0.1375, sightH - 0.003, sightH + 0.0025, - 0.0011, 0.0011, 0 );
	P.box( 'blued', 0.13, 0.142, 0.019, 0.026, - 0.0088, 0.0088, 0.0012 );
	// front sight: the ring hood on its base, the post
	P.box( 'blued', bEnd - 0.03, bEnd - 0.012, 0.004, 0.019, - 0.008, 0.008, 0.002 );
	P.lathe( 'blued', [ [ bEnd - 0.03, 0.0118 ], [ bEnd - 0.012, 0.0118 ] ], 0.028, 0, 14 );
	P.box( 'blued', bEnd - 0.023, bEnd - 0.019, 0.017, sightH, - 0.0012, 0.0012, 0.0003 );
	// bolt: body, cocking knob, the straight handle with its ball
	const bolt = P.sub( 'boltHandle', - 0.07, 0, 0 );
	bolt.cyl( 'steel', - 0.13, - 0.02, 0.0095, 0, 0, 14 );
	bolt.lathe( 'steel', [ [ - 0.152, 0 ], [ - 0.152, 0.0095 ], [ - 0.14, 0.0125 ], [ - 0.128, 0.0125 ], [ - 0.126, 0 ] ], 0, 0, 14 );
	for ( let i = 0; i < 8; i ++ ) { const a = i / 8 * PI * 2; bolt.boxC( 'steel', - 0.146, Math.cos( a ) * 0.0118, Math.sin( a ) * 0.0118, 0.012, 0.0016, 0.0016, 0, [ a, 0, 0 ] ); }
	bolt.rod( 'steel', [ - 0.085, 0.002, 0.009 ], [ - 0.085, 0.0, 0.058 ], 0.004, 10 );
	bolt.sphere( 'steel', - 0.085, 0.0, 0.062, 0.0092, 12 );
	return {
		P, info: {
			sightH, rearX: 0.135, eyeBack: 0.28, muzzle: [ bEnd + 0.0003, 0, 0 ], eject: [ 0.0, 0.015, 0.016 ], shellPort: [ 0.0, 0.02, 0 ],
			grips: { R: grip( [ - 0.13, - 0.04, 0 ], [ 0.45, 0.89, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.04, - 0.052, 0 ] } ), L: grip( [ 0.27, - 0.022, 0 ], [ 1, 0.03, 0 ], [ 0, - 0.75, - 0.66 ], 0.022 ) },
			stock: - 0.482, len: bEnd + 0.48, boltHandle: 'boltHandle', boltTravel: 0.085,
		},
	};
}

// ---- Barrett M82A1 ----
// Stamped sheet-steel upper and lower receivers with their lightening cuts and rivets, the barrel recoiling in the
// upper's perforated front, the big two-chamber brake, the carry handle, the folded bipod, the butt with its pad and
// the monopod socket, a long top rail with flip irons.
export function barrett() {
	const P = new Parts();
	const bEnd = 0.95;
	// upper receiver: a long box with a rail on top, lightening holes along the front half, the barrel's spring housing
	P.extFront( 'blk', [ [ - 0.03, - 0.03 ], [ 0.03, - 0.03 ], [ 0.03, 0.04, 0.004 ], [ 0.026, 0.045 ], [ - 0.026, 0.045 ], [ - 0.03, 0.04, 0.004 ] ], - 0.4, 0.28, 0.002 );
	P.rail( 'blk', - 0.3, 0.2, 0.052, 0.0105 );
	P.box( 'blk', - 0.302, 0.202, 0.044, 0.046, - 0.0125, 0.0125, 0.001 );
	P.extFront( 'blk', [ [ - 0.034, - 0.03, 0.006 ], [ 0.034, - 0.03, 0.006 ], [ 0.034, 0.038, 0.008 ], [ - 0.034, 0.038, 0.008 ] ], 0.28, 0.5, 0.003 );
	for ( let i = 0; i < 6; i ++ ) for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', slot( 0.302 + i * 0.032, 0.318 + i * 0.032, 0.006, 0.011, 4 ), 0.0005, 0.0003, s * 0.0342 );
	for ( let i = 0; i < 9; i ++ ) for ( const s of [ - 1, 1 ] ) P.cylZ( 'steel', - 0.37 + i * 0.075, 0.034, s * 0.03, s * 0.0308, 0.0024, 8 );
	P.box( 'rubber', 0.0, 0.1, - 0.012, 0.03, 0.0298, 0.0306, 0.003 );
	// lower receiver: magwell, the guard and grip, the butt; rivets down its flank
	P.extS( 'blk', [ [ - 0.4, - 0.03 ], [ 0.28, - 0.03 ], [ 0.28, - 0.07, 0.006 ], [ 0.06, - 0.07 ], [ 0.03, - 0.07 ], [ - 0.06, - 0.07 ], [ - 0.06, - 0.04 ], [ - 0.4, - 0.04 ] ], 0.028, 0.002 );
	for ( let i = 0; i < 8; i ++ ) for ( const s of [ - 1, 1 ] ) P.cylZ( 'steel', - 0.36 + i * 0.085, - 0.036, s * 0.028, s * 0.0288, 0.0022, 8 );
	triggerGuard( P, 'blk', - 0.12, - 0.04, - 0.03, 0.034, 0.006 );
	trigger( P, - 0.09, - 0.032, 0.02 );
	const g = pistolGrip( P, 'poly', - 0.125, - 0.03, 0.105, 0.3, 0.04, 0.036, 0.016, 0.0045, 1 );
	P.extS( 'blk', [ [ - 0.4, 0.045 ], [ - 0.6, 0.045, 0.012 ], [ - 0.62, - 0.1, 0.012 ], [ - 0.56, - 0.105 ], [ - 0.4, - 0.03 ] ], 0.028, 0.006,
		0, [ [ [ - 0.43, 0.03, 0.006 ], [ - 0.57, 0.03, 0.008 ], [ - 0.585, - 0.07, 0.01 ], [ - 0.55, - 0.075 ] ] ] );
	P.extS( 'rubber', [ [ - 0.618, 0.05 ], [ - 0.642, 0.05, 0.008 ], [ - 0.642, - 0.11, 0.008 ], [ - 0.618, - 0.11 ] ], 0.032, 0.006 );
	P.extS( 'rubber', [ [ - 0.55, 0.045 ], [ - 0.42, 0.045 ], [ - 0.42, 0.058, 0.004 ], [ - 0.53, 0.058, 0.006 ] ], 0.024, 0.005 );
	P.cylY( 'blk', - 0.56, - 0.105, - 0.085, 0.009, 0, 12 );
	// barrel: fluted forward of the upper, the big brake
	P.lathe( 'blk', [ [ 0.5, 0 ], [ 0.5, 0.0185 ], [ 0.52, 0.0172 ], [ bEnd, 0.0165 ], [ bEnd, 0 ] ], 0, 0, 18 );
	for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2; P.boxC( 'rubber', 0.72, Math.cos( a ) * 0.0163, Math.sin( a ) * 0.0163, 0.36, 0.0016, 0.0036, 0, [ a, 0, 0 ] ); }
	P.extFront( 'blk', [ [ - 0.042, - 0.02, 0.008 ], [ 0.042, - 0.02, 0.008 ], [ 0.042, 0.022, 0.008 ], [ - 0.042, 0.022, 0.008 ] ], bEnd - 0.005, bEnd + 0.13, 0.004 );
	for ( const t of [ 0.03, 0.075 ] ) for ( const s of [ - 1, 1 ] ) P.box( 'rubber', bEnd + t, bEnd + t + 0.032, - 0.016, 0.018, s * 0.0418, s * 0.0426, 0.004 );
	P.cyl( 'rubber', bEnd + 0.1296, bEnd + 0.1306, 0.012, 0, 0, 12 );
	// carry handle, the folded bipod, the sling loops
	P.extS( 'blk', [ [ 0.22, 0.045 ], [ 0.22, 0.09, 0.012 ], [ 0.36, 0.09, 0.012 ], [ 0.36, 0.045 ] ], 0.005, 0.002, 0, [ [ [ 0.24, 0.05 ], [ 0.34, 0.05 ], [ 0.34, 0.078, 0.006 ], [ 0.24, 0.078, 0.006 ] ] ] );
	P.box( 'rubber', 0.24, 0.34, 0.078, 0.09, - 0.0062, 0.0062, 0.004 );
	for ( const s of [ - 1, 1 ] ) {
		P.box( 'blk', 0.2, 0.46, - 0.05, - 0.04, s * 0.02, s * 0.028, 0.003 );
		P.cylY( 'rubber', 0.205, - 0.052, - 0.038, 0.007, s * 0.024, 10 );
	}
	P.box( 'blk', 0.44, 0.47, - 0.06, - 0.03, - 0.03, 0.03, 0.004 );
	swivel( P, - 0.5, - 0.098, 0, 0.009 );
	// charging handle on the right of the upper
	const ch = P.sub( 'charge', 0.1, 0.02, 0.03 );
	ch.box( 'blk', 0.082, 0.1, 0.01, 0.03, 0.03, 0.044, 0.003 );
	ch.cylZ( 'blk', 0.091, 0.02, 0.042, 0.056, 0.008, 12 );
	// flip irons on the rail
	// (the front post stands on the carry handle, so the tall rear leaf brings the line up over it)
	const sightH = 0.1;
	P.box( 'blk', - 0.284, - 0.256, 0.0558, 0.064, - 0.0112, 0.0112, 0.0015 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ - 0.282, 0.063 ], [ - 0.258, 0.063 ], [ - 0.262, sightH + 0.008, 0.003 ], [ - 0.278, sightH + 0.008, 0.003 ] ], s * 0.0068, s * 0.0098, 0.0007 );
	P.extFront( 'blk', [ [ - 0.0065, 0.062 ], [ 0.0065, 0.062 ], [ 0.006, sightH + 0.0048, 0.003 ], [ - 0.006, sightH + 0.0048, 0.003 ] ], - 0.2715, - 0.2685, 0.0004, 3, [ circle( 0, sightH, 0.0019, 12 ) ] );
	P.box( 'blk', 0.32, 0.346, 0.0895, 0.0955, - 0.009, 0.009, 0.0015 );
	for ( const s of [ - 1, 1 ] ) P.box( 'blk', 0.325, 0.341, 0.095, sightH + 0.008, s * 0.0045, s * 0.008, 0.0008 );
	P.box( 'blk', 0.3315, 0.3345, 0.095, sightH, - 0.0012, 0.0012, 0.0003 );
	return {
		P, info: {
			sightH, rearX: - 0.27, eyeBack: 0.09, muzzle: [ bEnd + 0.13, 0, 0 ], eject: [ - 0.02, 0.02, 0.032 ], mag: { p: [ - 0.01, - 0.066, 0 ], rake: 0 },
			optic: [ - 0.1, 0.0558 ],
			grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ - 0.09, - 0.04, 0 ] } ), L: grip( [ - 0.5, - 0.07, 0 ], [ - 0.2, 1, 0 ], [ - 0.1, 0.1, - 1 ], 0.03, { under: 1 } ) },
			stock: - 0.642, len: bEnd + 0.13 + 0.642, charge: 'charge', chargeTravel: 0.1, chargeSide: 1, heavy: 1,
		},
	};
}
