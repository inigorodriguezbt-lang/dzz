// Shotguns: Remington 870 / Mossberg 500, SPAS-12, double and sawed-off.
import { THREE, PI, Parts, circle, slot, grip, pistolGrip, trigger, triggerGuard, pins, screw, swivel } from './kit.js';

// ---- shotguns ----
// Remington 870 / Mossberg 500: a round-topped receiver with the port and the loading gate, a vent rib and bead, the
// magazine tube and its cap, a grooved walnut pump on its action bars, the trigger plate with the cross-bolt safety, and
// a pistol-grip stock with its recoil pad. The eye sits a little over the rib (eyeUp): the rib shows, running to the bead.
function pump870( o ) {
	const P = new Parts();
	const v = o.v || '870';
	const furn = v === '870' ? 'walnut' : 'poly';
	const bEnd = 0.59, hz = 0.0165, top = 0.019, bot = - 0.036;
	// receiver: rounded top, flat sides; the front shoulders down round the barrel
	P.extFront( 'blued', [ [ - hz, bot, 0.002 ], [ hz, bot, 0.002 ], [ hz, top - 0.004 ], [ hz - 0.003, top, 0.006 ], [ - hz + 0.003, top, 0.006 ], [ - hz, top - 0.004 ] ], - 0.078, 0.112, 0.0012 );
	P.extS( 'blued', [ [ 0.11, bot + 0.004 ], [ 0.124, bot + 0.012, 0.006 ], [ 0.124, 0.013, 0.004 ], [ 0.11, top - 0.001 ] ], hz - 0.0015, 0.0012 );
	// ejection port with the bolt behind it, the loading port and its lifter underneath
	P.box( 'rubber', 0.004, 0.074, - 0.013, 0.012, hz - 0.0003, hz + 0.0003, 0.0015 );
	P.box( 'steelD', 0.024, 0.072, - 0.0075, 0.0065, hz, hz + 0.0005, 0.0015 );
	P.box( 'rubber', - 0.02, 0.086, bot - 0.0006, bot + 0.0004, - 0.012, 0.012, 0.002 );
	P.box( 'blued', - 0.012, 0.078, bot - 0.0012, bot, - 0.009, 0.009, 0.0015 );
	// trigger plate: the guard, the cross-bolt safety, the action release, the pins
	P.extS( 'alu', [ [ - 0.078, bot + 0.001 ], [ 0.034, bot + 0.001 ], [ 0.034, bot - 0.006, 0.003 ], [ - 0.07, bot - 0.006 ] ], 0.013, 0.0012 );
	triggerGuard( P, 'alu', - 0.052, 0.03, bot - 0.004, 0.028, 0.0048 );
	trigger( P, - 0.02, bot - 0.004, 0.018 );
	P.cylZ( 'blk', - 0.046, bot - 0.0015, - 0.0152, 0.0152, 0.003, 12 );
	P.cylZ( 'rubber', - 0.046, bot - 0.0015, 0.0152, 0.0156, 0.0015, 8 );
	P.extS( 'blk', [ [ 0.03, bot - 0.004 ], [ 0.044, bot - 0.004, 0.002 ], [ 0.046, bot - 0.009, 0.002 ], [ 0.032, bot - 0.008 ] ], 0.0012, 0.0004, - 0.0135 );
	for ( const x of [ - 0.058, 0.09 ] ) P.cylZ( 'steel', x, - 0.026, - hz - 0.0005, hz + 0.0005, 0.0026, 10 );
	if ( v === '500' ) P.box( 'blk', - 0.068, - 0.05, top - 0.001, top + 0.005, - 0.005, 0.005, 0.002 ); // tang safety
	// barrel, vent rib with its posts, the bead
	P.lathe( 'blued', [ [ 0.112, 0 ], [ 0.112, 0.0135 ], [ 0.13, 0.0135 ], [ 0.14, 0.0118 ], [ bEnd - 0.004, 0.0112 ], [ bEnd, 0.0108 ], [ bEnd, 0.0092 ], [ bEnd - 0.002, 0 ] ], 0, 0, 18 );
	P.box( 'blued', 0.126, bEnd - 0.006, 0.0158, 0.0182, - 0.0042, 0.0042, 0.0008 );
	for ( let x = 0.14; x < bEnd - 0.01; x += 0.028 ) P.box( 'blued', x, x + 0.004, 0.0105, 0.0162, - 0.0028, 0.0028, 0 );
	for ( let x = 0.13; x < bEnd - 0.01; x += 0.01 ) P.box( 'rubber', x, x + 0.0025, 0.0181, 0.0184, - 0.0034, 0.0034, 0 );
	const sightH = 0.0203;
	P.sphere( 'white', bEnd - 0.012, sightH, 0, 0.0021, 10 );
	// magazine tube, its knurled cap and the barrel's ring on it
	P.cyl( 'blued', 0.112, bEnd - 0.1, 0.0112, - 0.028, 0, 16 );
	P.lathe( 'blued', [ [ bEnd - 0.1, 0 ], [ bEnd - 0.1, 0.0128 ], [ bEnd - 0.079, 0.0128 ], [ bEnd - 0.074, 0.0105 ], [ bEnd - 0.072, 0 ] ], - 0.028, 0, 16 );
	for ( let i = 0; i < 16; i ++ ) { const a = i / 16 * PI * 2; P.boxC( 'blued', bEnd - 0.09, - 0.028 + Math.cos( a ) * 0.0129, Math.sin( a ) * 0.0129, 0.014, 0.0014, 0.0014, 0, [ a, 0, 0 ] ); }
	P.extS( 'blued', [ [ bEnd - 0.12, - 0.004 ], [ bEnd - 0.1, - 0.004 ], [ bEnd - 0.1, - 0.03 ], [ bEnd - 0.118, - 0.03 ] ], 0.0085, 0.0015 );
	// pump: a rounded walnut forend with ring grooves, on two action bars into the receiver
	const pump = P.sub( 'pump', 0.26, - 0.028, 0 );
	const px0 = 0.19, px1 = 0.33;
	pump.extFront( furn, [ [ - 0.0205, - 0.004, 0.004 ], [ 0.0205, - 0.004, 0.004 ], [ 0.022, - 0.03, 0.01 ], [ 0.012, - 0.05, 0.012 ], [ - 0.012, - 0.05, 0.012 ], [ - 0.022, - 0.03, 0.01 ] ], px0, px1, 0.005, 4 );
	for ( let i = 0; i < 9; i ++ ) {
		const x = px0 + 0.016 + i * 0.0135;
		pump.extFront( 'rubber', [ [ - 0.0212, - 0.012 ], [ 0.0212, - 0.012 ], [ 0.0222, - 0.03, 0.01 ], [ 0.0124, - 0.0508, 0.012 ], [ - 0.0124, - 0.0508, 0.012 ], [ - 0.0222, - 0.03, 0.01 ] ], x, x + 0.0024, 0, 3 );
	}
	for ( const s of [ - 1, 1 ] ) pump.box( 'steel', px0 - 0.13, px0 + 0.01, - 0.03, - 0.0245, s * 0.0132, s * 0.0152, 0.0005 );
	// stock: a pistol grip into a butt with the comb dropping to the heel, rounded, with a pad
	// (a field gun's drop: the comb 38 mm under the rib, the heel 60)
	const stock = [ [ - 0.078, top - 0.002 ], [ - 0.13, 0.0, 0.03 ], [ - 0.43, - 0.03, 0.006 ], [ - 0.434, - 0.145, 0.01 ], [ - 0.4, - 0.148 ], [ - 0.2, - 0.088, 0.03 ], [ - 0.125, - 0.085, 0.02 ], [ - 0.098, - 0.06, 0.01 ], [ - 0.078, bot, 0.004 ] ];
	P.extR( furn, stock, 0.0175, 0.0075, 0, [], 5 );
	if ( v === '870' ) for ( const sd of [ - 1, 1 ] ) P.extS( 'walnutC', [ [ - 0.088, - 0.006 ], [ - 0.13, - 0.012 ], [ - 0.128, - 0.07, 0.008 ], [ - 0.1, - 0.058, 0.008 ] ], 0.0006, 0.0003, sd * 0.0176 );
	swivel( P, - 0.36, - 0.12, 0, 0.0075 );
	P.extS( 'rubber', [ [ - 0.434, - 0.027, 0.006 ], [ - 0.452, - 0.028, 0.006 ], [ - 0.456, - 0.148, 0.008 ], [ - 0.436, - 0.15, 0.004 ] ], 0.0185, 0.005 );
	P.extS( 'white', [ [ - 0.432, - 0.028 ], [ - 0.435, - 0.028 ], [ - 0.437, - 0.148 ], [ - 0.434, - 0.148 ] ], 0.0172, 0.001 );
	// grip cap
	P.extS( 'rubber', [ [ - 0.128, - 0.081 ], [ - 0.098, - 0.06 ], [ - 0.101, - 0.057 ], [ - 0.131, - 0.078 ] ], 0.013, 0.002 );
	const gR = grip( [ - 0.11, - 0.042, 0 ], [ 0.62, 0.78, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.02, - 0.045, 0 ] } );
	return {
		P, info: {
			sightH, rearX: - 0.07, eyeBack: 0.06, eyeX: - 0.13, eyeUp: 0.03, frontX: bEnd - 0.012, muzzle: [ bEnd, 0, 0 ], eject: [ 0.035, 0.004, 0.018 ], shellPort: [ 0.03, - 0.04, 0 ],
			optic: [ - 0.02, 0.03 ], opticParts: [ 'mount' ], light: [ 0.3, - 0.03, 0.024 ],
			grips: { R: gR, L: grip( [ 0.265, - 0.03, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.024 ) },
			stock: - 0.456, len: bEnd + 0.456, pump: 'pump', pumpTravel: 0.085,
		},
		mount: true,
	};
}

export function pumpShotgun( o ) {
	return o.arch === 'spas' ? spas() : pump870( o );
}

// ---- Franchi SPAS-12 ----
// A black stamped receiver with the ghost ring on it, the perforated heat shield over the barrel and the front post at
// its end, the magazine tube and its cap, the ribbed polymer pump with the pump / semi button, a pistol grip, and the
// folding stock open (its arms, the butt plate, the forearm hook folded on top).
function spas() {
	const P = new Parts();
	const bEnd = 0.5, hz = 0.0165, sightH = 0.04;
	P.extS( 'blk', [ [ - 0.078, - 0.036 ], [ 0.112, - 0.036 ], [ 0.122, - 0.026, 0.006 ], [ 0.122, 0.016, 0.006 ], [ 0.11, 0.024, 0.006 ], [ - 0.07, 0.024, 0.006 ], [ - 0.078, 0.016 ] ], hz, 0.0018 );
	P.box( 'rubber', 0.002, 0.072, - 0.012, 0.016, hz - 0.0004, hz + 0.0004, 0.002 );
	P.box( 'steelD', 0.024, 0.07, - 0.007, 0.011, hz, hz + 0.0006, 0.0015 );
	P.box( 'rubber', - 0.02, 0.084, - 0.0368, - 0.0356, - 0.0115, 0.0115, 0.002 );
	pins( P, [ [ - 0.06, - 0.026, 0.0026 ], [ 0.096, - 0.026, 0.0026 ] ], hz );
	P.cylZ( 'blk', - 0.045, - 0.022, - hz - 0.0015, hz + 0.0015, 0.0032, 12 );
	// ghost ring rear sight, the barrel and the heat shield (perforated top half), its front post, the muzzle
	P.box( 'blk', - 0.058, - 0.026, 0.023, 0.03, - 0.011, 0.011, 0.0015 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'blk', [ [ - 0.054, 0.029 ], [ - 0.03, 0.029 ], [ - 0.034, sightH + 0.009, 0.003 ], [ - 0.05, sightH + 0.009, 0.003 ] ], s * 0.0068, s * 0.0102, 0.0007 );
	P.torusX( 'blk', - 0.04, sightH, 0, 0.0045, 0.0017, 14 );
	P.box( 'blk', - 0.0415, - 0.0385, 0.029, sightH - 0.0055, - 0.0012, 0.0012, 0.0003 );
	P.lathe( 'blk', [ [ 0.12, 0 ], [ 0.12, 0.0128 ], [ bEnd - 0.004, 0.0122 ], [ bEnd, 0.0118 ], [ bEnd, 0.0094 ], [ bEnd - 0.002, 0 ] ], 0, 0, 18 );
	P.cyl( 'rubber', bEnd - 0.0022, bEnd - 0.0018, 0.0094, 0, 0, 12 );
	const hs = [];
	for ( let i = 0; i <= 8; i ++ ) { const a = PI * ( 0.06 + i / 8 * 0.88 ); hs.push( [ Math.cos( a ) * 0.0168, Math.sin( a ) * 0.0168 + 0.002 ] ); }
	for ( let i = 8; i >= 0; i -- ) { const a = PI * ( 0.06 + i / 8 * 0.88 ); hs.push( [ Math.cos( a ) * 0.0152, Math.sin( a ) * 0.0152 + 0.002 ] ); }
	P.extFront( 'blk', hs, 0.124, 0.43, 0.0005, 2 );
	for ( let i = 0; i < 10; i ++ ) for ( const s of [ - 1, 0, 1 ] ) P.boxC( 'rubber', 0.142 + i * 0.029, 0.002 + Math.cos( s * 0.75 ) * 0.0169, Math.sin( s * 0.75 ) * 0.0169, 0.012, 0.0015, 0.0055, 0.0007, [ - s * 0.75, 0, 0 ] );
	P.box( 'blk', 0.4, 0.43, 0.012, 0.022, - 0.006, 0.006, 0.0015 );
	P.box( 'blk', 0.412, 0.418, 0.02, sightH, - 0.0014, 0.0014, 0.0004 );
	for ( const s of [ - 1, 1 ] ) P.box( 'blk', 0.408, 0.422, 0.02, sightH + 0.004, s * 0.0045, s * 0.0072, 0.0008 );
	// magazine tube and its cap, the barrel clamp
	P.cyl( 'blk', 0.122, bEnd - 0.1, 0.011, - 0.028, 0, 16 );
	P.lathe( 'blk', [ [ bEnd - 0.1, 0 ], [ bEnd - 0.1, 0.0124 ], [ bEnd - 0.086, 0.0124 ], [ bEnd - 0.082, 0.009 ], [ bEnd - 0.082, 0 ] ], - 0.028, 0, 16 );
	P.extS( 'blk', [ [ bEnd - 0.12, - 0.004 ], [ bEnd - 0.1, - 0.004 ], [ bEnd - 0.1, - 0.03 ], [ bEnd - 0.12, - 0.03 ] ], 0.0085, 0.0015 );
	swivel( P, bEnd - 0.11, - 0.04, 0, 0.0075 );
	// pump: ribbed polymer round the tube, the mode button underneath; its action bars into the receiver
	const pump = P.sub( 'pump', 0.26, - 0.028, 0 );
	const px0 = 0.2, px1 = 0.37;
	const pp = [ [ - 0.0215, - 0.004, 0.006 ], [ 0.0215, - 0.004, 0.006 ], [ 0.0225, - 0.034, 0.01 ], [ 0.012, - 0.05, 0.012 ], [ - 0.012, - 0.05, 0.012 ], [ - 0.0225, - 0.034, 0.01 ] ];
	pump.extFront( 'poly', pp, px0, px1, 0.005, 4 );
	for ( let i = 0; i < 8; i ++ ) pump.extFront( 'poly', pp.map( ( [ z, y, r ] ) => [ z * 1.07, - 0.027 + ( y + 0.027 ) * 1.07, r ] ), px0 + 0.018 + i * 0.018, px0 + 0.024 + i * 0.018, 0.0015, 3 );
	pump.box( 'blk', px0 + 0.01, px0 + 0.024, - 0.054, - 0.048, - 0.0045, 0.0045, 0.0015 );
	for ( const s of [ - 1, 1 ] ) pump.box( 'blk', px0 - 0.12, px0 + 0.01, - 0.03, - 0.024, s * 0.0135, s * 0.0155, 0.0005 );
	triggerGuard( P, 'blk', - 0.045, 0.025, - 0.035, 0.028, 0.005 );
	trigger( P, - 0.02, - 0.037, 0.017 );
	const g = pistolGrip( P, 'poly', - 0.05, - 0.034, 0.095, 0.3, 0.034, 0.032, 0.015, 0.0045, 1 );
	// folding stock, open: the hinge, two pressed arms, the butt plate, the hook folded along the top
	P.box( 'blk', - 0.086, - 0.074, - 0.016, 0.012, - 0.0175, 0.0175, 0.002 );
	for ( const s of [ - 1, 1 ] ) P.extS( 'blk', [ [ - 0.078, 0.006 ], [ - 0.38, - 0.0 ], [ - 0.38, - 0.012, 0.004 ], [ - 0.078, - 0.006 ] ], 0.0018, 0.0007, s * 0.0145 );
	P.extS( 'blk', [ [ - 0.372, 0.014 ], [ - 0.39, 0.014, 0.005 ], [ - 0.39, - 0.1, 0.008 ], [ - 0.372, - 0.1, 0.004 ] ], 0.0185, 0.0025,
		0, [ [ [ - 0.376, - 0.012, 0.003 ], [ - 0.386, - 0.012, 0.003 ], [ - 0.386, - 0.084, 0.003 ], [ - 0.376, - 0.084, 0.003 ] ] ] );
	P.extS( 'blk', [ [ - 0.32, 0.008 ], [ - 0.26, 0.008 ], [ - 0.26, 0.016, 0.004 ], [ - 0.29, 0.022, 0.006 ], [ - 0.32, 0.016, 0.004 ] ], 0.0025, 0.0008 );
	return {
		P, info: {
			sightH, rearX: - 0.04, eyeBack: 0.13, muzzle: [ bEnd, 0, 0 ], eject: [ 0.035, 0.004, 0.018 ], shellPort: [ 0.03, - 0.04, 0 ],
			optic: null, opticParts: null, light: null,
			grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ - 0.02, - 0.045, 0 ] } ), L: grip( [ 0.265, - 0.03, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.024 ) },
			stock: - 0.39, len: bEnd + 0.39, pump: 'pump', pumpTravel: 0.085,
		},
		mount: false,
	};
}

// ---- side-by-side double (and the sawed-off) ----
// A box-lock action with case-hardened side plates, the top lever ('toplever'), two exposed hammers, the two barrels
// with the rib between them and a brass bead, a splinter forend; the barrels ('barrels') drop open on the hinge and
// the shells ('shells') sit in the chambers. The sawed-off: barrels cut short, the stock cut down to a grip.
export function doubleBarrel( o ) {
	const P = new Parts();
	const sawed = o.v === 'sawed';
	const bEnd = sawed ? 0.36 : 0.78;
	// action body and its rounded fences round the barrels' breech
	P.extS( 'case', [ [ - 0.048, - 0.03 ], [ 0.068, - 0.03 ], [ 0.07, - 0.024, 0.004 ], [ 0.07, 0.006 ], [ 0.062, 0.017, 0.006 ], [ - 0.04, 0.017, 0.006 ], [ - 0.048, 0.008, 0.004 ] ], 0.0225, 0.0025 );
	for ( const s of [ - 1, 1 ] ) P.ext( 'case', [ [ - 0.04, - 0.024 ], [ 0.05, - 0.024 ], [ 0.05, 0.008, 0.008 ], [ - 0.04, 0.008, 0.008 ] ], s > 0 ? 0.0222 : - 0.0236, s > 0 ? 0.0236 : - 0.0222, 0.0008 );
	for ( const s of [ - 1, 1 ] ) { screw( P, - 0.03, - 0.014, s * 0.0236, 'z', s, 0.0025, 'steel' ); screw( P, 0.04, - 0.014, s * 0.0236, 'z', s, 0.0025, 'steel' ); }
	P.cylZ( 'blued', 0.068, - 0.022, - 0.0235, 0.0235, 0.0042, 14 );
	const tl = P.sub( 'toplever', - 0.03, 0.017, 0 );
	tl.extTop( 'blued', [ [ - 0.054, 0.004, 0.004 ], [ - 0.02, 0.006, 0.004 ], [ - 0.016, 0.02, 0.006 ], [ - 0.028, 0.024, 0.004 ], [ - 0.05, 0.016 ] ], 0.0158, 0.0215, 0.001 );
	for ( const s of [ - 1, 1 ] ) {
		const h = P.sub( s > 0 ? 'hammerR' : 'hammerL', - 0.035, 0.012, s * 0.012 );
		h.extS( 'blued', [ [ - 0.03, 0.005 ], [ - 0.02, 0.012 ], [ - 0.03, 0.032, 0.004 ], [ - 0.038, 0.028 ], [ - 0.034, 0.012 ] ], 0.003, 0.001, s * 0.013 );
		for ( let i = 0; i < 3; i ++ ) h.box( 'blued', - 0.037 + i * 0.003, - 0.0358 + i * 0.003, 0.027 + i * 0.0012, 0.031 + i * 0.0012, s * 0.013 - 0.0032, s * 0.013 + 0.0032, 0 );
	}
	// the barrels, the top rib and the joining rib underneath, the bead; the forend (they swing together)
	const b = P.sub( 'barrels', 0.07, - 0.022, 0 );
	for ( const s of [ - 1, 1 ] ) {
		b.lathe( 'blued', [ [ 0.068, 0 ], [ 0.068, 0.0128 ], [ 0.11, 0.0124 ], [ bEnd - 0.003, 0.0114 ], [ bEnd, 0.011 ], [ bEnd, 0.0095 ], [ bEnd - 0.002, 0 ] ], 0, s * 0.0115, 18 );
		b.cyl( 'rubber', bEnd - 0.0022, bEnd - 0.0016, 0.0095, 0, s * 0.0115, 12 );
	}
	b.extFront( 'blued', [ [ - 0.0058, 0.0085 ], [ 0.0058, 0.0085 ], [ 0.0046, 0.0145 ], [ - 0.0046, 0.0145 ] ], 0.07, bEnd - 0.002, 0.0006 );
	b.box( 'blued', 0.068, bEnd - 0.004, - 0.014, - 0.006, - 0.008, 0.008, 0.002 );
	b.sphere( 'brass', bEnd - 0.01, 0.0158, 0, 0.0022, 10 );
	b.extR( 'walnut', [ [ 0.1, - 0.01 ], [ sawed ? 0.24 : 0.33, - 0.01 ], [ sawed ? 0.244 : 0.334, - 0.024, 0.006 ], [ sawed ? 0.23 : 0.32, - 0.032, 0.006 ], [ 0.11, - 0.034, 0.006 ] ], 0.0195, 0.007 );
	b.box( 'blued', 0.104, 0.124, - 0.036, - 0.026, - 0.006, 0.006, 0.0015 );
	const sh = b.sub( 'shells', 0.068, 0, 0 );
	for ( const s of [ - 1, 1 ] ) { sh.cyl( 'brass', 0.066, 0.07, 0.0118, 0, s * 0.0115, 14 ); sh.cyl( 'brass', 0.0655, 0.0662, 0.0028, 0, s * 0.0115, 8 ); }
	// two triggers in the guard
	triggerGuard( P, 'blued', - 0.035, 0.04, - 0.029, 0.026, 0.005 );
	trigger( P, - 0.012, - 0.03, 0.017 );
	P.extS( 'blued', [ [ 0.01, - 0.03 ], [ 0.017, - 0.03 ], [ 0.014, - 0.04, 0.004 ], [ 0.009, - 0.046, 0.002 ], [ 0.006, - 0.044 ], [ 0.01, - 0.04, 0.004 ] ], 0.0028, 0.0007 );
	let gR;
	if ( sawed ) {
		P.extR( 'walnut', [ [ - 0.045, 0.012 ], [ - 0.07, 0.006 ], [ - 0.15, - 0.07, 0.012 ], [ - 0.13, - 0.095, 0.012 ], [ - 0.1, - 0.085 ], [ - 0.045, - 0.03, 0.006 ] ], 0.0165, 0.0065 );
		P.extS( 'rubber', [ [ - 0.152, - 0.072 ], [ - 0.132, - 0.098 ], [ - 0.128, - 0.094 ], [ - 0.148, - 0.068 ] ], 0.0145, 0.002 );
		gR = grip( [ - 0.095, - 0.05, 0 ], [ 0.62, 0.78, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.012, - 0.038, 0 ] } );
	} else {
		P.extR( 'walnut', [ [ - 0.045, 0.012 ], [ - 0.42, - 0.018, 0.004 ], [ - 0.425, - 0.13, 0.008 ], [ - 0.39, - 0.132 ], [ - 0.14, - 0.058, 0.02 ], [ - 0.045, - 0.03, 0.006 ] ], 0.0175, 0.0075, 0, [], 5 );
		for ( const sd of [ - 1, 1 ] ) P.extS( 'walnutC', [ [ - 0.058, 0.004 ], [ - 0.12, - 0.004 ], [ - 0.12, - 0.05, 0.008 ], [ - 0.062, - 0.03, 0.008 ] ], 0.0006, 0.0003, sd * 0.0176 );
		P.extS( 'rubber', [ [ - 0.42, - 0.017 ], [ - 0.437, - 0.018, 0.004 ], [ - 0.437, - 0.134, 0.005 ], [ - 0.424, - 0.134 ] ], 0.019, 0.0035 );
		swivel( P, - 0.34, - 0.11, 0, 0.0072 );
		gR = grip( [ - 0.105, - 0.036, 0 ], [ 0.62, 0.78, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.012, - 0.038, 0 ] } );
	}
	return {
		P, info: {
			sightH: 0.0185, rearX: - 0.02, eyeBack: 0.13, muzzle: [ bEnd, 0, 0.0115 ], muzzle2: [ bEnd, 0, - 0.0115 ], eject: null,
			grips: { R: gR, L: grip( [ sawed ? 0.19 : 0.23, - 0.025, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.026 ) },
			stock: sawed ? 0 : - 0.437, len: bEnd + ( sawed ? 0.15 : 0.44 ), barrels: 'barrels', breakAxis: 'z', breakAngle: - 0.62,
		},
	};
}
