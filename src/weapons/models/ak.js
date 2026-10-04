// The Kalashnikov family: AKM, AK-74M, Saiga-12, and the SVD (a long AK-type action under a thumbhole stock).
import { THREE, PI, Parts, circle, slot, grip, pistolGrip, triggerGuard, trigger, pins, swivel, muzzleDevice } from './kit.js';

// The stamped receiver every AK shares: the sheet-steel box (dimples over the magwell, the trunnions' rivets), the
// ribbed dust cover, the long selector lever down the right with the port behind it, the bolt carrier and its handle
// ('bolt': it cycles), the scope rail riveted on the left, the tangent rear sight on the front trunnion, the guard,
// the trigger and the mag paddle. x0 / x1: the receiver's ends; sightH: the notch height. -> { hz }
function akReceiver( P, { x0 = - 0.17, x1 = 0.115, sightH = 0.043, mat = 'blued', railLen = 0.11, dimples = true } = {} ) {
	const hz = 0.0135;
	P.extS( mat, [ [ x0, 0.011 ], [ x1, 0.011 ], [ x1, - 0.036 ], [ x1 - 0.012, - 0.046 ], [ 0.04, - 0.046 ], [ - 0.03, - 0.044 ], [ x0 + 0.05, - 0.04 ], [ x0, - 0.03 ] ], hz, 0.0012 );
	// the rails the carrier rides on, a lip along each top edge
	for ( const s of [ - 1, 1 ] ) P.box( mat, x0 + 0.01, x1 - 0.045, 0.006, 0.011, s * ( hz - 0.0016 ), s * ( hz + 0.0004 ), 0.0006 );
	// front trunnion (a little proud of the sheet), the rear trunnion and the stock tang
	P.box( mat, x1 - 0.045, x1 + 0.01, - 0.035, 0.012, - hz - 0.001, hz + 0.001, 0.0025 );
	P.box( mat, x0 - 0.002, x0 + 0.022, - 0.032, 0.008, - hz - 0.0008, hz + 0.0008, 0.002 );
	// rivets: front trunnion, rear trunnion, the trigger group's pins (the left ones held by the retaining spring)
	for ( const [ x, y ] of [ [ x1 - 0.037, - 0.03 ], [ x1 - 0.023, - 0.03 ], [ x1 - 0.009, - 0.03 ], [ x1 - 0.03, - 0.018 ], [ x1 - 0.016, - 0.018 ], [ x0 + 0.018, - 0.026 ], [ x0 + 0.03, - 0.026 ], [ - 0.02, - 0.036 ], [ 0.02, - 0.036 ], [ - 0.035, - 0.022 ] ] ) for ( const s of [ - 1, 1 ] ) P.cylZ( mat, x, y, s * ( hz + 0.0008 ), s * ( hz + 0.0018 ), 0.0022, 8, 0.0018 );
	P.extS( 'steel', [ [ - 0.024, - 0.0335 ], [ 0.023, - 0.0335 ], [ 0.023, - 0.0385, 0.002 ], [ - 0.024, - 0.0385, 0.002 ] ], 0.0005, 0.0002, - hz - 0.0016 );
	// the magwell's dimples (they guide the magazine)
	if ( dimples ) for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', [ [ 0.062, - 0.038 ], [ 0.098, - 0.038 ], [ 0.096, - 0.032, 0.003 ], [ 0.064, - 0.032, 0.003 ] ], 0.0004, 0.0002, s * ( hz + 0.0002 ) );
	// the scope rail on the left: a dovetailed bar riveted to the sheet
	const rx0 = - 0.005 - railLen;
	P.ext( mat, [ [ rx0, - 0.016 ], [ - 0.005, - 0.016 ], [ - 0.005, 0.005, 0.002 ], [ rx0, 0.005, 0.002 ] ], - hz - 0.0045, - hz, 0.0007 );
	for ( const s of [ - 1, 1 ] ) P.boxC( mat, ( rx0 - 0.005 ) / 2, - 0.0055 + s * 0.0098, - hz - 0.005, railLen, 0.0028, 0.0018, 0.0006 );
	for ( const x of [ rx0 + 0.012, - 0.017 ] ) P.cylZ( 'steel', x, - 0.0055, - hz - 0.0052, - hz - 0.0044, 0.0025, 8 );
	// dust cover: stamped and crowned, with stiffening ribs; its latch button at the back
	const cover = [ [ - 0.0138, 0.008 ], [ 0.0138, 0.008 ], [ 0.0138, 0.0198, 0.006 ], [ 0.0, 0.027, 0.012 ], [ - 0.0138, 0.0198, 0.006 ] ];
	P.extFront( mat, cover, x0 + 0.003, x1 - 0.04, 0.0008 );
	for ( let i = 0; i < 3; i ++ ) { const x = x0 + 0.04 + i * 0.075; P.extFront( mat, cover.map( ( [ z, y, r ] ) => [ z * 1.03, 0.008 + ( y - 0.008 ) * 1.06, r ] ), x, x + 0.007, 0 ); }
	P.box( mat, x0 - 0.008, x0 + 0.006, 0.006, 0.026, - 0.004, 0.004, 0.0018 );
	// selector: the long stamped lever down the right with its finger tab, closing the carrier's channel
	P.extS( mat, [ [ x0 + 0.042, 0.0 ], [ 0.0, - 0.006 ], [ 0.028, - 0.009, 0.003 ], [ 0.034, - 0.018, 0.004 ], [ 0.02, - 0.02, 0.002 ], [ 0.0, - 0.012 ], [ x0 + 0.042, - 0.007, 0.003 ] ], 0.0008, 0.0004, hz + 0.0012 );
	P.cylZ( mat, x0 + 0.044, - 0.0035, hz, hz + 0.0024, 0.0045, 12 );
	// the port (between the cover and the lever) with the carrier and its handle behind it
	P.box( 'rubber', - 0.03, 0.06, - 0.006, 0.0075, hz - 0.0004, hz + 0.0006, 0.0012 );
	const bolt = P.sub( 'bolt', 0.06, 0.004, 0.015 );
	bolt.box( mat, - 0.03, 0.074, - 0.004, 0.0105, 0.0112, 0.0152, 0.001 );
	bolt.box( 'steelD', - 0.026, 0.004, - 0.002, 0.0085, 0.0148, 0.0156, 0.0006 );
	bolt.box( 'blued', 0.02, 0.05, - 0.0015, 0.007, 0.0148, 0.0154, 0.0004 );
	bolt.extS( mat, [ [ 0.058, - 0.002 ], [ 0.074, - 0.002 ], [ 0.074, 0.01, 0.003 ], [ 0.058, 0.01, 0.003 ] ], 0.0012, 0.0005, 0.016 );
	bolt.cylZ( mat, 0.066, 0.004, 0.016, 0.034, 0.0034, 10, 0.0038 );
	bolt.sphere( mat, 0.066, 0.004, 0.0355, 0.0058, 10, [ 1, 1, 0.85 ] );
	// rear sight on the trunnion: the block, the ramp, the leaf with its slider (the notch at the leaf's back end)
	const rs = x1 + 0.003;
	P.extS( mat, [ [ rs, 0.0 ], [ rs + 0.05, 0.0 ], [ rs + 0.05, 0.022, 0.003 ], [ rs + 0.02, 0.029, 0.004 ], [ rs, 0.029, 0.003 ] ], 0.012, 0.0018 );
	P.extS( mat, [ [ rs + 0.012, 0.028 ], [ rs + 0.075, 0.03 ], [ rs + 0.076, 0.0335, 0.001 ], [ rs + 0.016, sightH + 0.004, 0.002 ], [ rs + 0.012, sightH + 0.004 ] ], 0.0082, 0.0008 );
	P.box( 'rubber', rs + 0.0115, rs + 0.0175, sightH - 0.0022, sightH + 0.0045, - 0.0011, 0.0011, 0 );
	P.box( mat, rs + 0.034, rs + 0.046, 0.03, 0.038, - 0.0098, 0.0098, 0.0015 );
	P.cylZ( mat, rs + 0.04, 0.0335, 0.0096, 0.0118, 0.0028, 8 );
	// the gas tube's lock lever on the right of the block
	P.extS( mat, [ [ rs + 0.04, 0.008 ], [ rs + 0.058, 0.012 ], [ rs + 0.058, 0.018, 0.002 ], [ rs + 0.04, 0.016 ] ], 0.0009, 0.0003, 0.0125 );
	// guard, trigger, the paddle mag release in front of the guard
	triggerGuard( P, mat, - 0.028, 0.058, - 0.045, 0.032, 0.005 );
	trigger( P, 0.005, - 0.047 );
	P.extS( mat, [ [ 0.052, - 0.045 ], [ 0.066, - 0.045 ], [ 0.067, - 0.06, 0.002 ], [ 0.054, - 0.062, 0.002 ] ], 0.0055, 0.0012 );
	return { hz };
}

// AKM / AK-74M / Saiga-12. AKM: laminated furniture, a bakelite grip, the slant brake; AK-74M: plum-black polymer, the
// side-folding stock, the big two-port brake; Saiga: a 12-gauge AK, polymer, sight on the gas block.
export function akRifle( o ) {
	const P = new Parts();
	const v = o.v || 'm';
	const is74 = v === '74', saiga = v === 'saiga';
	const furn = saiga ? 'poly' : is74 ? 'polyP' : 'lam';
	const bEnd = saiga ? 0.52 : 0.485;
	const br = saiga ? 0.0128 : 0.0088;
	const sightH = saiga ? 0.04 : 0.043;
	akReceiver( P, { sightH, mat: 'blued', dimples: ! saiga } );
	// gas tube, the upper handguard round it (with its steel cap ring), the lower handguard and its retainers
	P.cyl( 'blued', 0.16, 0.36, 0.0092, 0.028, 0, 14 );
	for ( let i = 0; i < 3; i ++ ) P.cylZ( 'rubber', 0.34 + i * 0.006, 0.028, - 0.0094, 0.0094, 0.0018, 6 );
	const uhg = [ [ - 0.0158, 0.0135 ], [ 0.0158, 0.0135 ], [ 0.0168, 0.03, 0.008 ], [ 0, 0.0425, 0.012 ], [ - 0.0168, 0.03, 0.008 ] ];
	P.extFront( furn, uhg, 0.17, 0.326, 0.003, 4 );
	P.extFront( 'blued', uhg.map( ( [ z, y, r ] ) => [ z * 1.05, 0.0135 + ( y - 0.0135 ) * 1.04, r ] ), 0.164, 0.172, 0.0008, 4 );
	if ( is74 ) for ( let i = 0; i < 4; i ++ ) P.boxC( 'rubber', 0.2 + i * 0.03, 0.033, 0, 0.012, 0.003, 0.03, 0.0012 );
	const lhg = [ [ - 0.0255, 0.012, 0.004 ], [ 0.0255, 0.012, 0.004 ], [ 0.0265, - 0.012, 0.008 ], [ 0.017, - 0.034, 0.012 ], [ - 0.017, - 0.034, 0.012 ], [ - 0.0265, - 0.012, 0.008 ] ];
	P.extFront( furn, lhg, 0.134, 0.322, 0.005, 4 );
	// the swells either side (the AKM's finger grooves), the 74's ribs
	for ( const s of [ - 1, 1 ] ) {
		if ( is74 ) for ( let i = 0; i < 6; i ++ ) P.box( furn, 0.16 + i * 0.026, 0.168 + i * 0.026, - 0.026, 0.006, s * 0.0255, s * 0.0275, 0.0018 );
		else P.ext( furn, [ [ 0.16, - 0.02 ], [ 0.3, - 0.02 ], [ 0.3, - 0.012, 0.004 ], [ 0.16, - 0.012, 0.004 ] ], s > 0 ? 0.0255 : - 0.0272, s > 0 ? 0.0272 : - 0.0255, 0.0015 );
	}
	P.box( 'blued', 0.125, 0.136, - 0.036, 0.016, - 0.0222, 0.0222, 0.002 );
	P.extS( 'blued', [ [ 0.126, - 0.034 ], [ 0.142, - 0.034 ], [ 0.142, - 0.026, 0.002 ], [ 0.126, - 0.028 ] ], 0.0012, 0.0004, 0.0236 );
	P.box( 'blued', 0.322, 0.334, - 0.033, 0.015, - 0.0205, 0.0205, 0.0025 );
	// barrel, the gas block (its port angled up at 45°), the cleaning rod under the barrel
	P.lathe( 'blued', [ [ 0.12, 0 ], [ 0.12, br + 0.0018 ], [ 0.14, br + 0.0012 ], [ 0.142, br ], [ bEnd - 0.006, br ], [ bEnd, br - 0.0008 ], [ bEnd, 0 ] ], 0, 0, 16 );
	P.extS( 'blued', [ [ 0.336, - 0.012 ], [ 0.374, - 0.012 ], [ 0.374, 0.012, 0.004 ], [ 0.364, 0.038, 0.006 ], [ 0.338, 0.04, 0.004 ], [ 0.336, 0.018 ] ], 0.012, 0.0022 );
	P.put( 'steelD', new THREE.TorusGeometry( 0.0058, 0.0012, 5, 12 ), [ 0.354, - 0.0012, - 0.0135 ], [ 0, PI / 2, 0 ] );
	if ( ! saiga ) {
		P.cyl( 'blued', 0.336, 0.446, 0.0026, - 0.0158, 0, 8 );
		P.cyl( 'blued', 0.446, 0.452, 0.0036, - 0.0158, 0, 8 );
	}
	if ( ! saiga ) {
		// front sight base: the triangle on the barrel, the bayonet lug under it, the post between its ears
		const fx = bEnd - 0.04;
		P.extS( 'blued', [ [ fx - 0.012, - 0.02 ], [ fx + 0.014, - 0.02 ], [ fx + 0.014, 0.018, 0.003 ], [ fx + 0.004, 0.024 ], [ fx - 0.012, 0.012 ] ], 0.0105, 0.002 );
		P.cyl( 'blued', fx - 0.012, fx + 0.014, 0.0122, 0, 0, 14 );
		for ( const s of [ - 1, 1 ] ) P.ext( 'blued', [ [ fx - 0.002, 0.018 ], [ fx + 0.012, 0.018 ], [ fx + 0.01, sightH + 0.012, 0.003 ], [ fx + 0.001, sightH + 0.012, 0.003 ] ], s > 0 ? 0.0062 : - 0.0102, s > 0 ? 0.0102 : - 0.0062, 0.0008 );
		P.cylY( 'blued', fx + 0.005, 0.02, sightH - 0.006, 0.0022, 0, 8 );
		P.box( 'blued', fx + 0.0035, fx + 0.0065, 0.02, sightH, - 0.0012, 0.0012, 0.0003 );
		P.box( 'blued', fx - 0.012, fx + 0.004, - 0.026, - 0.016, - 0.0055, 0.0055, 0.0015 );
	} else {
		P.box( 'blued', 0.36, 0.372, 0.038, sightH, - 0.0015, 0.0015, 0.0004 );
		for ( const s of [ - 1, 1 ] ) P.box( 'blued', 0.356, 0.376, 0.036, sightH + 0.006, s * 0.0055, s * 0.0085, 0.0008 );
	}
	// muzzle device
	const mz = is74 ? muzzleDevice( P, 'ak74', bEnd, 0.0118, 0.083, 'blued' ) : saiga ? muzzleDevice( P, 'plain', bEnd, 0.0148, 0.03, 'blued' ) : muzzleDevice( P, 'slant', bEnd, 0.0112, 0.038, 'blued' );
	// pistol grip (AKM: bakelite with its grooves; 74: black polymer)
	const g = pistolGrip( P, is74 || saiga ? 'poly' : 'bakelite', - 0.032, - 0.045, 0.098, 0.4, 0.034, 0.03, 0.0135, 0.0045, 0 );
	if ( ! is74 && ! saiga ) for ( let i = 0; i < 5; i ++ ) for ( const s of [ - 1, 1 ] ) P.boxC( 'rubber', - 0.044 - Math.sin( 0.4 ) * ( 0.02 + i * 0.014 ), - 0.045 - Math.cos( 0.4 ) * ( 0.02 + i * 0.014 ), s * 0.0136, 0.024, 0.0018, 0.0005, 0, [ 0, 0, - 0.4 ] );
	if ( is74 || saiga ) {
		// side-folding skeleton stock (open), its hinge on the left of the rear trunnion, a rubber pad
		P.box( 'blued', - 0.186, - 0.168, - 0.03, 0.01, - 0.0168, 0.0148, 0.003 );
		P.cylY( 'blued', - 0.18, - 0.032, 0.012, 0.0036, - 0.0175, 10 );
		P.extR( 'poly', [ [ - 0.184, 0.006 ], [ - 0.37, - 0.012, 0.004 ], [ - 0.374, - 0.13, 0.008 ], [ - 0.35, - 0.135, 0.004 ], [ - 0.27, - 0.07 ], [ - 0.184, - 0.04, 0.004 ] ], 0.0165, 0.005,
			0, [ [ [ - 0.256, - 0.016, 0.004 ], [ - 0.34, - 0.026, 0.004 ], [ - 0.34, - 0.086, 0.01 ], [ - 0.29, - 0.062, 0.006 ] ] ] );
		P.extS( 'rubber', [ [ - 0.372, - 0.01 ], [ - 0.384, - 0.01, 0.004 ], [ - 0.384, - 0.137, 0.005 ], [ - 0.372, - 0.137 ] ], 0.018, 0.003 );
		swivel( P, - 0.33, - 0.11, 0, 0.007 );
	} else {
		// laminated fixed stock: rounded, the steel butt plate with its trap door, the sling loop on the left
		P.extR( 'lam', [ [ - 0.168, 0.006 ], [ - 0.366, - 0.024, 0.006 ], [ - 0.372, - 0.138, 0.008 ], [ - 0.338, - 0.142, 0.004 ], [ - 0.22, - 0.082, 0.03 ], [ - 0.168, - 0.046, 0.006 ] ], 0.0172, 0.0075, 0, [], 5 );
		P.extS( 'blued', [ [ - 0.368, - 0.024 ], [ - 0.378, - 0.025, 0.004 ], [ - 0.38, - 0.142, 0.006 ], [ - 0.372, - 0.143 ] ], 0.0182, 0.0022 );
		P.box( 'blued', - 0.3795, - 0.377, - 0.1, - 0.05, - 0.0105, 0.0105, 0.0015 );
		P.put( 'steelD', new THREE.TorusGeometry( 0.0062, 0.0012, 5, 12 ), [ - 0.25, - 0.075, - 0.0185 ], [ 0, PI / 2, 0 ] );
	}
	// optic side mount (shown with an optic): clamps the rail on the left, a bridge over the cover with a rail on top
	const m = P.sub( 'mount', - 0.03, 0.045, 0 );
	m.box( 'blued', - 0.09, 0.0, - 0.018, 0.006, - 0.0245, - 0.018, 0.002 );
	m.cylZ( 'blued', - 0.045, - 0.006, - 0.03, - 0.024, 0.006, 12 );
	m.box( 'blued', - 0.09, 0.0, 0.0, 0.034, - 0.024, - 0.016, 0.003 );
	m.box( 'blued', - 0.088, 0.024, 0.032, 0.0422, - 0.0125, 0.0125, 0.002 );
	m.rail( 'blued', - 0.086, 0.022, 0.048, 0.0105 );
	return {
		P, info: {
			sightH, rearX: 0.131, eyeBack: 0.24, muzzle: [ mz, 0, 0 ], eject: [ 0.02, 0.006, 0.016 ],
			mag: { p: [ 0.078, - 0.042, 0 ], rake: 0 }, optic: [ - 0.03, 0.0518 ], opticParts: [ 'mount' ], light: [ 0.29, - 0.01, 0.0275 ],
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.016, { trig: [ 0.005, - 0.055, 0 ] } ),
				L: grip( [ 0.25, - 0.012, 0 ], [ 1, 0.08, 0 ], [ 0, - 0.75, - 0.66 ], 0.028 ),
			},
			stock: is74 || saiga ? - 0.384 : - 0.38, len: mz + 0.38, bolt: 'bolt', boltTravel: 0.09, chargeSide: 1,
		},
	};
}

// ---- SVD Dragunov ----
// A long AK-type receiver (its scope rail on the left), the tangent sight, a slim laminated handguard with vents round the
// gas tube, the long barrel with the five-slot flash hider and the hooded front post, the skeleton thumbhole stock with
// its cheek rest.
export function svd() {
	const P = new Parts();
	const bEnd = 0.62, sightH = 0.047;
	akReceiver( P, { sightH, mat: 'blk', railLen: 0.13, dimples: false } );
	// gas tube and the two-piece handguard (oval, three big vents a side)
	P.cyl( 'blk', 0.16, 0.44, 0.0092, 0.03, 0, 14 );
	const hg = [ [ - 0.0205, - 0.026, 0.01 ], [ 0.0205, - 0.026, 0.01 ], [ 0.0215, 0.022, 0.01 ], [ 0.0, 0.043, 0.016 ], [ - 0.0215, 0.022, 0.01 ] ];
	P.extFront( 'lam', hg, 0.162, 0.4, 0.004, 4 );
	for ( let i = 0; i < 3; i ++ ) for ( const s of [ - 1, 1 ] ) P.extS( 'rubber', slot( 0.19 + i * 0.07, 0.23 + i * 0.07, 0.008, 0.0055, 4 ), 0.0006, 0.0003, s * 0.0214 );
	P.box( 'blk', 0.398, 0.408, - 0.022, 0.038, - 0.0185, 0.0185, 0.003 );
	P.box( 'blk', 0.155, 0.164, - 0.024, 0.036, - 0.0195, 0.0195, 0.002 );
	// gas block with the front sling swivel, the long barrel, front sight with its hood, bayonet lug
	P.extS( 'blk', [ [ 0.418, - 0.014 ], [ 0.446, - 0.014 ], [ 0.446, 0.03, 0.004 ], [ 0.438, 0.042, 0.004 ], [ 0.418, 0.042, 0.004 ] ], 0.0118, 0.002 );
	swivel( P, 0.432, - 0.014, 0, 0.0072 );
	P.lathe( 'blk', [ [ 0.12, 0 ], [ 0.12, 0.0112 ], [ 0.42, 0.0098 ], [ bEnd - 0.004, 0.0088 ], [ bEnd, 0.0084 ], [ bEnd, 0 ] ], 0, 0, 16 );
	const fx = bEnd - 0.012;
	P.extS( 'blk', [ [ fx - 0.008, - 0.012 ], [ fx + 0.008, - 0.012 ], [ fx + 0.008, 0.03 ], [ fx - 0.008, 0.03 ] ], 0.0085, 0.0018 );
	P.lathe( 'blk', [ [ fx - 0.0075, 0.0105 ], [ fx + 0.0075, 0.0105 ] ], 0.04, 0, 14 );
	P.box( 'blk', fx - 0.0015, fx + 0.0015, 0.028, sightH, - 0.0012, 0.0012, 0.0003 );
	P.box( 'blk', bEnd - 0.05, bEnd - 0.022, - 0.024, - 0.012, - 0.005, 0.005, 0.0015 );
	// the five-slot flash hider
	P.lathe( 'blk', [ [ bEnd - 0.002, 0 ], [ bEnd - 0.002, 0.0108 ], [ bEnd + 0.004, 0.0118 ], [ bEnd + 0.077, 0.0118 ], [ bEnd + 0.08, 0.0108 ], [ bEnd + 0.08, 0.006 ], [ bEnd + 0.078, 0 ] ], 0, 0, 18 );
	for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2 + PI / 2; P.boxC( 'rubber', bEnd + 0.046, Math.sin( a ) * 0.0117, Math.cos( a ) * 0.0117, 0.05, 0.0012, 0.0036, 0, [ a, 0, 0 ] ); }
	P.cyl( 'rubber', bEnd + 0.0794, bEnd + 0.0802, 0.006, 0, 0, 10 );
	// thumbhole stock: the comb, the hole, the grip formed in its front; the cheek rest on the left, the pad
	P.extR( 'lam', [ [ - 0.168, 0.008 ], [ - 0.2, 0.033 ], [ - 0.33, 0.037, 0.02 ], [ - 0.44, 0.012, 0.006 ], [ - 0.445, - 0.128, 0.008 ], [ - 0.41, - 0.134, 0.006 ], [ - 0.3, - 0.07, 0.01 ], [ - 0.142, - 0.158, 0.012 ], [ - 0.1, - 0.153, 0.01 ], [ - 0.04, - 0.048, 0.006 ] ], 0.0168, 0.0065,
		0, [ [ [ - 0.176, - 0.04, 0.006 ], [ - 0.272, - 0.034, 0.012 ], [ - 0.278, - 0.062, 0.006 ], [ - 0.142, - 0.128, 0.01 ] ] ], 5 );
	P.extR( 'lam', [ [ - 0.21, 0.03 ], [ - 0.36, 0.024, 0.02 ], [ - 0.37, - 0.006, 0.01 ], [ - 0.22, 0.004, 0.01 ] ], 0.0045, 0.003, - 0.0198 );
	P.extS( 'rubber', [ [ - 0.441, 0.013 ], [ - 0.457, 0.012, 0.004 ], [ - 0.457, - 0.135, 0.005 ], [ - 0.444, - 0.136 ] ], 0.0188, 0.003 );
	swivel( P, - 0.38, - 0.112, 0, 0.0075 );
	// scope mount (shown with an optic)
	const m = P.sub( 'mount', - 0.04, 0.045, 0 );
	m.box( 'blk', - 0.12, 0.0, - 0.018, 0.006, - 0.0245, - 0.018, 0.002 );
	m.cylZ( 'blk', - 0.06, - 0.006, - 0.03, - 0.024, 0.006, 12 );
	m.box( 'blk', - 0.12, 0.0, 0.0, 0.034, - 0.024, - 0.016, 0.003 );
	m.box( 'blk', - 0.118, 0.024, 0.032, 0.0422, - 0.0125, 0.0125, 0.002 );
	m.rail( 'blk', - 0.116, 0.022, 0.048, 0.0105 );
	return { P, info: {
		sightH, rearX: 0.13, eyeBack: 0.22, muzzle: [ bEnd + 0.08, 0, 0 ], eject: [ 0.02, 0.006, 0.016 ], mag: { p: [ 0.078, - 0.042, 0 ], rake: 0 },
		optic: [ - 0.04, 0.0518 ], opticParts: [ 'mount' ],
		grips: { R: grip( [ - 0.105, - 0.1, 0 ], [ 0.34, 0.94, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ 0.005, - 0.055, 0 ] } ), L: grip( [ 0.27, - 0.012, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.026 ) },
		stock: - 0.457, len: bEnd + 0.08 + 0.457, bolt: 'bolt', boltTravel: 0.09,
	}, mount: 'ak' };
}
