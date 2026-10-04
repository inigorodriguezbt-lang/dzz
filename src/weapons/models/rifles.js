// Classic self-loading rifles in wood: the Ruger Mini-14 and the SKS.
import { THREE, PI, Parts, circle, slot, grip, trigger, triggerGuard, pins, screw, swivel } from './kit.js';

// ---- Ruger Mini-14 Ranch ----
// The M14's scaled-down action in a hardwood stock: the receiver with its integral scope bases and open top (the bolt
// and the op rod's handle on the right ride back together: 'charge'), a ghost-ring rear sight, a ventilated heat
// shield over the barrel, the gas block with the front swivel, a winged blade at the muzzle, the M14-style guard.
export function mini14() {
	const P = new Parts();
	const bEnd = 0.47, sightH = 0.035;
	// receiver
	P.extFront( 'blued', [ [ - 0.0138, - 0.013 ], [ 0.0138, - 0.013 ], [ 0.0138, 0.012, 0.003 ], [ 0.0092, 0.0188, 0.004 ], [ - 0.0092, 0.0188, 0.004 ], [ - 0.0138, 0.012, 0.003 ] ], - 0.1, 0.1, 0.0012 );
	P.box( 'rubber', - 0.026, 0.058, 0.012, 0.0192, - 0.0068, 0.0068, 0.0015 );
	for ( const x of [ - 0.062, 0.07 ] ) { P.box( 'blued', x - 0.012, x + 0.012, 0.0175, 0.0222, - 0.0088, 0.0088, 0.0015 ); P.box( 'rubber', x - 0.0015, x + 0.0015, 0.0215, 0.0224, - 0.0085, 0.0085, 0 ); }
	P.box( 'rubber', - 0.02, 0.05, - 0.002, 0.012, 0.0136, 0.0142, 0.0012 );
	// ghost-ring rear sight with its wings
	P.box( 'blued', - 0.096, - 0.064, 0.0175, 0.0255, - 0.009, 0.009, 0.002 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blued', [ [ - 0.092, 0.024 ], [ - 0.07, 0.024 ], [ - 0.074, 0.041, 0.003 ], [ - 0.088, 0.041, 0.003 ] ], s * 0.0058, s * 0.009, 0.0007 );
	P.torusX( 'blued', - 0.08, sightH, 0, 0.0036, 0.0016, 14 );
	P.box( 'blued', - 0.0815, - 0.0785, 0.024, sightH - 0.0045, - 0.0012, 0.0012, 0.0003 );
	// barrel, the ventilated heat shield over it, gas block and front swivel, the winged front blade
	P.lathe( 'blued', [ [ 0.1, 0 ], [ 0.1, 0.0105 ], [ 0.13, 0.0102 ], [ bEnd - 0.004, 0.0088 ], [ bEnd, 0.0084 ], [ bEnd, 0.004 ], [ bEnd - 0.001, 0 ] ], 0, 0, 16 );
	P.cyl( 'rubber', bEnd - 0.0004, bEnd + 0.0003, 0.0042, 0, 0, 10 );
	P.extFront( 'polyS', [ [ - 0.0132, 0.003 ], [ 0.0132, 0.003 ], [ 0.0138, 0.012, 0.006 ], [ 0.0, 0.021, 0.012 ], [ - 0.0138, 0.012, 0.006 ] ], 0.108, 0.318, 0.0015 );
	for ( let i = 0; i < 6; i ++ ) for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', slot( 0.13 + i * 0.03, 0.146 + i * 0.03, 0.011, 0.0024, 3 ), 0.0004, 0.0002, s * 0.0138 );
	P.extS( 'blued', [ [ 0.39, - 0.018 ], [ 0.418, - 0.018 ], [ 0.418, 0.012, 0.003 ], [ 0.39, 0.012, 0.003 ] ], 0.0105, 0.0018 );
	swivel( P, 0.404, - 0.018, 0, 0.0075 );
	const fx = bEnd - 0.022;
	P.box( 'blued', fx - 0.01, fx + 0.01, 0.006, 0.013, - 0.0075, 0.0075, 0.0015 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blued', [ [ fx - 0.008, 0.012 ], [ fx + 0.008, 0.012 ], [ fx + 0.004, sightH + 0.005, 0.002 ], [ fx - 0.004, sightH + 0.005, 0.002 ] ], s * 0.0045, s * 0.0072, 0.0006 );
	P.box( 'blued', fx - 0.0018, fx + 0.0018, 0.012, sightH, - 0.0011, 0.0011, 0.0003 );
	// hardwood stock: forend, the receiver's inletting, a pistol-grip wrist, the butt; a rubber pad and the rear swivel
	P.extR( 'wood', [ [ 0.33, - 0.004 ], [ 0.33, - 0.026, 0.008 ], [ 0.2, - 0.034 ], [ 0.1, - 0.038 ], [ - 0.04, - 0.042 ], [ - 0.085, - 0.048, 0.01 ], [ - 0.135, - 0.068, 0.016 ], [ - 0.43, - 0.128, 0.008 ], [ - 0.432, - 0.118 ], [ - 0.432, - 0.002, 0.006 ], [ - 0.2, 0.007, 0.03 ], [ - 0.12, 0.0, 0.01 ], [ - 0.1, - 0.008 ], [ 0.1, - 0.008 ], [ 0.12, - 0.004 ] ], 0.0172, 0.0072, 0, [], 5 );
	P.extS( 'rubber', [ [ - 0.431, 0.0 ], [ - 0.443, - 0.001, 0.004 ], [ - 0.443, - 0.128, 0.005 ], [ - 0.431, - 0.13 ] ], 0.0175, 0.003 );
	swivel( P, - 0.36, - 0.112, 0, 0.0075 );
	P.extS( 'rubber', [ [ - 0.136, - 0.066 ], [ - 0.098, - 0.054 ], [ - 0.1, - 0.051 ], [ - 0.138, - 0.063 ] ], 0.0135, 0.002 );
	// the M14-style guard with its safety tab at the front, the mag latch behind the well
	triggerGuard( P, 'blued', - 0.035, 0.035, - 0.041, 0.028, 0.0052 );
	trigger( P, - 0.01, - 0.045, 0.017 );
	P.extS( 'blued', [ [ 0.024, - 0.042 ], [ 0.032, - 0.042 ], [ 0.03, - 0.054, 0.002 ], [ 0.024, - 0.052 ] ], 0.0035, 0.001 );
	P.extS( 'blued', [ [ 0.092, - 0.04 ], [ 0.1, - 0.04 ], [ 0.102, - 0.05, 0.002 ], [ 0.094, - 0.05 ] ], 0.0045, 0.001 );
	// the bolt (seen through the open top) and the op rod's slide with its handle, moving together
	const ch = P.sub( 'charge', 0.05, 0.005, 0.015 );
	ch.cyl( 'steel', - 0.02, 0.05, 0.0062, 0.01, 0.0, 14 );
	ch.box( 'blued', - 0.04, 0.12, - 0.0055, 0.0045, 0.0135, 0.0175, 0.0012 );
	ch.extS( 'blued', [ [ 0.054, - 0.006 ], [ 0.074, - 0.006 ], [ 0.076, 0.008, 0.003 ], [ 0.058, 0.009, 0.003 ] ], 0.0025, 0.0008, 0.0182 );
	ch.cylZ( 'blued', 0.066, 0.003, 0.019, 0.031, 0.0045, 12, 0.0042 );
	return { P, info: {
		sightH, rearX: - 0.08, eyeBack: 0.09, muzzle: [ bEnd + 0.0003, 0, 0 ], eject: [ 0.02, 0.01, 0.017 ],
		mag: { p: [ 0.06, - 0.03, 0 ], rake: 0 }, optic: [ 0.0, 0.022 ], shellPort: [ 0.03, 0.02, 0 ],
		grips: { R: grip( [ - 0.125, - 0.045, 0 ], [ 0.5, 0.86, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.01, - 0.053, 0 ] } ), L: grip( [ 0.24, - 0.018, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.023 ) },
		stock: - 0.443, len: bEnd + 0.443, charge: 'charge', boltTravel: 0.07, chargeSide: 1,
	} };
}

// ---- SKS ----
// A milled receiver under a stamped cover, the carrier and its handle on the right ('bolt'), the fixed ten-round
// magazine ahead of the guard, the tangent rear sight, the gas tube under a wooden cap, the hooded front post, and the
// folding blade bayonet lying back under the barrel; a shellac-finished stock with a straight wrist and a steel butt plate.
export function sks() {
	const P = new Parts();
	const bEnd = 0.52, sightH = 0.036;
	P.extFront( 'blued', [ [ - 0.0138, - 0.022 ], [ 0.0138, - 0.022 ], [ 0.0138, 0.011 ], [ - 0.0138, 0.011 ] ], - 0.1, 0.1, 0.0012 );
	const cover = [ [ - 0.0132, 0.009 ], [ 0.0132, 0.009 ], [ 0.0132, 0.0185, 0.005 ], [ 0.0, 0.025, 0.011 ], [ - 0.0132, 0.0185, 0.005 ] ];
	P.extFront( 'blued', cover, - 0.098, 0.062, 0.0008 );
	P.box( 'blued', - 0.106, - 0.096, 0.004, 0.022, - 0.0042, 0.0042, 0.0016 );
	P.box( 'rubber', - 0.02, 0.06, - 0.004, 0.0085, 0.0134, 0.0142, 0.0012 );
	pins( P, [ [ - 0.085, - 0.012, 0.0024 ], [ 0.085, - 0.014, 0.0024 ] ], 0.0138 );
	// the fixed magazine and its floor plate latch, the guard with the safety at its back
	P.extS( 'blued', [ [ 0.034, - 0.022 ], [ 0.1, - 0.022 ], [ 0.098, - 0.058, 0.006 ], [ 0.04, - 0.062, 0.006 ], [ 0.034, - 0.05 ] ], 0.0118, 0.0016 );
	P.box( 'blued', 0.026, 0.036, - 0.05, - 0.04, - 0.006, 0.006, 0.0015 );
	triggerGuard( P, 'blued', - 0.035, 0.03, - 0.04, 0.028, 0.005 );
	trigger( P, - 0.01, - 0.045, 0.017 );
	P.extS( 'blued', [ [ - 0.04, - 0.044 ], [ - 0.032, - 0.042 ], [ - 0.03, - 0.054, 0.002 ], [ - 0.038, - 0.056 ] ], 0.0035, 0.001 );
	// rear sight: the tangent leaf on its block, the notch at the leaf's back
	P.extS( 'blued', [ [ 0.1, 0.0 ], [ 0.162, 0.0 ], [ 0.162, 0.02, 0.003 ], [ 0.13, 0.026, 0.004 ], [ 0.1, 0.026, 0.003 ] ], 0.0105, 0.0016 );
	P.extS( 'blued', [ [ 0.124, 0.025 ], [ 0.18, 0.027 ], [ 0.181, 0.03, 0.001 ], [ 0.128, sightH + 0.004, 0.002 ], [ 0.124, sightH + 0.004 ] ], 0.0072, 0.0008 );
	P.box( 'rubber', 0.1265, 0.1325, sightH - 0.002, sightH + 0.0045, - 0.0011, 0.0011, 0 );
	P.box( 'blued', 0.148, 0.158, 0.026, 0.033, - 0.0088, 0.0088, 0.0012 );
	// gas tube and its wooden cap, the barrel, the gas block, the hooded front post
	P.cyl( 'blued', 0.162, 0.37, 0.0088, 0.026, 0, 14 );
	P.extFront( 'shellac', [ [ - 0.0145, 0.012 ], [ 0.0145, 0.012 ], [ 0.0155, 0.026, 0.008 ], [ 0, 0.038, 0.012 ], [ - 0.0155, 0.026, 0.008 ] ], 0.168, 0.33, 0.003, 4 );
	for ( const x of [ 0.164, 0.33 ] ) P.extFront( 'blued', [ [ - 0.0158, 0.011 ], [ 0.0158, 0.011 ], [ 0.0166, 0.027, 0.008 ], [ 0, 0.0395, 0.012 ], [ - 0.0166, 0.027, 0.008 ] ], x, x + 0.008, 0.0008, 4 );
	P.lathe( 'blued', [ [ 0.1, 0 ], [ 0.1, 0.0108 ], [ 0.13, 0.0102 ], [ bEnd - 0.004, 0.0088 ], [ bEnd, 0.0084 ], [ bEnd, 0.004 ], [ bEnd - 0.001, 0 ] ], 0, 0, 16 );
	P.cyl( 'rubber', bEnd - 0.0004, bEnd + 0.0003, 0.0042, 0, 0, 10 );
	P.extS( 'blued', [ [ 0.362, - 0.014 ], [ 0.39, - 0.014 ], [ 0.39, 0.03, 0.004 ], [ 0.374, 0.038, 0.004 ], [ 0.362, 0.034 ] ], 0.011, 0.0018 );
	const fx = bEnd - 0.024;
	P.extS( 'blued', [ [ fx - 0.014, - 0.012 ], [ fx + 0.014, - 0.012 ], [ fx + 0.014, 0.012, 0.004 ], [ fx - 0.014, 0.012, 0.004 ] ], 0.0105, 0.0018 );
	P.lathe( 'blued', [ [ fx - 0.007, 0.0098 ], [ fx + 0.007, 0.0098 ] ], 0.027, 0, 14 );
	P.box( 'blued', fx - 0.0015, fx + 0.0015, 0.012, sightH, - 0.0011, 0.0011, 0.0003 );
	// the bayonet folded back under the barrel: its hinge block, the spike-free blade, the handle
	P.box( 'blued', bEnd - 0.06, bEnd - 0.036, - 0.026, - 0.008, - 0.0085, 0.0085, 0.002 );
	P.extS( 'steel', [ [ bEnd - 0.06, - 0.019 ], [ 0.33, - 0.019 ], [ 0.31, - 0.0145, 0.004 ], [ bEnd - 0.06, - 0.013 ] ], 0.0012, 0.0006 );
	P.box( 'blued', bEnd - 0.1, bEnd - 0.06, - 0.022, - 0.012, - 0.0042, 0.0042, 0.0015 );
	// stock: forend under the gas system, the receiver's inletting, a straight wrist, the butt; the steel butt plate
	P.extR( 'shellac', [ [ 0.35, - 0.002 ], [ 0.35, - 0.024, 0.008 ], [ 0.2, - 0.032 ], [ 0.1, - 0.036 ], [ - 0.04, - 0.042 ], [ - 0.11, - 0.052, 0.014 ], [ - 0.42, - 0.128, 0.008 ], [ - 0.432, - 0.12 ], [ - 0.432, - 0.004, 0.006 ], [ - 0.2, 0.006, 0.03 ], [ - 0.12, - 0.002, 0.01 ], [ - 0.1, - 0.012 ], [ 0.1, - 0.012 ], [ 0.12, - 0.004 ] ], 0.0172, 0.0072, 0, [], 5 );
	P.extS( 'blued', [ [ - 0.431, - 0.003 ], [ - 0.443, - 0.004, 0.004 ], [ - 0.443, - 0.129, 0.005 ], [ - 0.431, - 0.131 ] ], 0.018, 0.002 );
	P.box( 'blued', - 0.4442, - 0.4425, - 0.09, - 0.04, - 0.0105, 0.0105, 0.0008 );
	P.box( 'blued', - 0.34, - 0.31, - 0.09, - 0.08, - 0.019, - 0.0168, 0.001 );
	swivel( P, 0.3, - 0.03, 0, 0.007 );
	// the carrier with its handle, in the port (it cycles)
	const bolt = P.sub( 'bolt', 0.05, 0.005, 0.015 );
	bolt.box( 'blued', - 0.03, 0.07, - 0.0035, 0.0085, 0.0112, 0.0152, 0.001 );
	bolt.box( 'steel', - 0.026, 0.004, - 0.002, 0.007, 0.0148, 0.0156, 0.0005 );
	bolt.cylZ( 'blued', 0.06, 0.003, 0.0152, 0.028, 0.0034, 10, 0.0038 );
	bolt.sphere( 'blued', 0.06, 0.003, 0.0292, 0.0052, 10, [ 1, 1, 0.85 ] );
	return { P, info: {
		sightH, rearX: 0.13, eyeBack: 0.28, muzzle: [ bEnd + 0.0003, 0, 0 ], eject: [ 0.02, 0.01, 0.017 ],
		mag: null, optic: null, shellPort: [ 0.03, 0.02, 0 ],
		grips: { R: grip( [ - 0.125, - 0.045, 0 ], [ 0.5, 0.86, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.01, - 0.053, 0 ] } ), L: grip( [ 0.24, - 0.018, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.023 ) },
		stock: - 0.443, len: bEnd + 0.443, bolt: 'bolt', boltTravel: 0.07, chargeSide: 1,
	} };
}
