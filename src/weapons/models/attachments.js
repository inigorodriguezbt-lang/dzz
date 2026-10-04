// Attachments: optics, muzzle devices, lights (and the arms items' fittings, by kind).
// Optic frame: the base (its rail clamp) bottom at y = 0, centred on x = 0; the optical axis at y = axisH, looking +x.
// info: axisH, rearX / frontX (the ends), lensR (the reticle disc's radius), reticleX (its plane), eyeRelief, scope (a
// magnified overlay sight), window (the holo's square glass, lensH its half height). Muzzle devices start at x = 0 and
// extend +x (info.len). Lights clamp at the origin and hang out to +z.
import { ARMS_ATTACH } from '../../game/items/ext/arms/parts.js';
import { THREE, ARMS_H, PI, Parts, circle, slot, screw } from './kit.js';

// a clamp on a Picatinny rail: the body over the rail, its two jaws hooking under the dovetail, the cross bolt and its
// nut (or a throw lever) on the right
function railClamp( P, x0, x1, h = 0.01, hz = 0.013, mat = 'alu', lever = false ) {
	P.box( mat, x0, x1, 0.0, h, - hz, hz, 0.002 );
	P.box( mat, x0, x1, - 0.0045, 0.003, - hz, - hz + 0.0042, 0.001 );
	P.box( mat, x0, x1, - 0.0045, 0.003, hz - 0.0042, hz, 0.001 );
	const xc = ( x0 + x1 ) / 2;
	if ( lever ) {
		P.cylZ( mat, xc, - 0.0005, hz, hz + 0.003, 0.0055, 12 );
		P.extS( mat, [ [ xc - 0.004, - 0.004 ], [ xc + 0.026, - 0.006, 0.003 ], [ xc + 0.026, 0.0, 0.003 ], [ xc - 0.004, 0.003 ] ], 0.0014, 0.0005, hz + 0.0042 );
	} else {
		P.cylZ( 'steel', xc, - 0.0005, hz, hz + 0.0035, 0.0045, 6 );
		P.cylZ( 'steel', xc, - 0.0005, - hz - 0.0012, - hz, 0.0022, 8 );
	}
}

// knurled ridges round a cylinder (radius r, length h) along an axis through ( x, y, z )
function knurl( P, mat, x, y, z, r, h, axis = 'y', n = 20 ) {
	for ( let i = 0; i < n; i ++ ) {
		const a = i / n * PI * 2, c = Math.cos( a ) * r, s = Math.sin( a ) * r;
		if ( axis === 'y' ) P.boxC( mat, x + c, y, z + s, 0.0011, h, 0.0011, 0, [ 0, - a, 0 ] );
		else if ( axis === 'z' ) P.boxC( mat, x + c, y + s, z, 0.0011, 0.0011, h, 0, [ 0, 0, a ] );
		else P.boxC( mat, x, y + c, z + s, h, 0.0011, 0.0011, 0, [ a, 0, 0 ] );
	}
}

// an adjustment turret on a scope: the saddle boss, the knurled cap, its index marks; along +y (top) or +z (right) /
// -z (left), from the tube's surface at d from the axis
function turret( P, x, axisH, d, axis, r, h, mat = 'blk' ) {
	if ( axis === 'y' ) {
		P.cylY( mat, x, axisH + d - 0.003, axisH + d + h * 0.35, r * 1.12, 0, 16 );
		P.cylY( mat, x, axisH + d + h * 0.35, axisH + d + h, r, 0, 18, r * 0.96 );
		knurl( P, mat, x, axisH + d + h * 0.7, 0, r, h * 0.5, 'y', 18 );
		for ( let i = 0; i < 10; i ++ ) { const a = i / 10 * PI * 2; P.boxC( 'white', x + Math.cos( a ) * r * 1.13, axisH + d + h * 0.3, Math.sin( a ) * r * 1.13, 0.0004, 0.0016, 0.0004, 0, [ 0, - a, 0 ] ); }
	} else {
		const s = axis === 'z' ? 1 : - 1;
		P.cylZ( mat, x, axisH, s * ( d - 0.003 ), s * ( d + h * 0.35 ), r * 1.12, 16 );
		P.cylZ( mat, x, axisH, s * ( d + h * 0.35 ), s * ( d + h ), r, 18, r * 0.96 );
		knurl( P, mat, x, axisH, s * ( d + h * 0.7 ), r, h * 0.5, 'z', 18 );
	}
}

// a scope ring: the base clamping the rail, the ring round the tube split on top with its cap screws
function ring( P, x, axisH, r, w = 0.013, mat = 'blk' ) {
	P.extFront( mat, [ [ - 0.0115, 0.0 ], [ 0.0115, 0.0 ], [ 0.0115, 0.006 ], [ r * 0.7, axisH - r * 0.55 ], [ - r * 0.7, axisH - r * 0.55 ], [ - 0.0115, 0.006 ] ], x - w / 2, x + w / 2, 0.001 );
	P.lathe( mat, [ [ x - w / 2, r + 0.0005 ], [ x - w / 2, r + 0.0038 ], [ x + w / 2, r + 0.0038 ], [ x + w / 2, r + 0.0005 ] ], axisH, 0, 22 );
	for ( const s of [ - 1, 1 ] ) {
		P.box( mat, x - w / 2, x + w / 2, axisH + r * 0.1, axisH + r * 0.6, s * ( r + 0.002 ), s * ( r + 0.0058 ), 0.0012 );
		for ( const dx of [ - w * 0.25, w * 0.25 ] ) screw( P, x + dx, axisH + r * 0.35, s * ( r + 0.0058 ), 'z', s, 0.0016, 'steel', true );
	}
	railClamp( P, x - w / 2, x + w / 2, 0.006, 0.012, mat );
}

// a flip-up lens cap, open: the band round the tube's end at x, its hinge block on top, the lid swung up and away from
// the glass about the hinge (dir: +1 at the front, -1 at the back)
function flipCap( P, x, axisH, r, dir ) {
	P.lathe( 'poly', [ [ x - 0.004, r + 0.0004 ], [ x - 0.004, r + 0.0018 ], [ x + 0.004, r + 0.0018 ], [ x + 0.004, r + 0.0004 ] ], axisH, 0, 20 );
	P.box( 'poly', x - 0.003, x + 0.003, axisH + r, axisH + r + 0.0045, - 0.0045, 0.0045, 0.0012 );
	const hx = x + dir * 0.0045, hy = axisH + r + 0.004;
	const g = new THREE.CylinderGeometry( r + 0.0015, r + 0.0015, 0.0025, 22 ).rotateZ( PI / 2 );
	g.translate( dir * 0.0007, axisH - hy, 0 ).rotateZ( dir * 1.75 ).translate( hx, hy, 0 );
	P.put( 'poly', g );
	P.cylZ( 'poly', hx, hy, - 0.0042, 0.0042, 0.0018, 8 );
}

export function attachmentParts( def ) {
	const P = new Parts();
	const k = def.model?.kind;
	let info = { axisH: 0.03, rearX: - 0.02, lensR: 0.012, eyeRelief: 0.16 };
	if ( ARMS_ATTACH[ k ] ) return { P, info: ARMS_ATTACH[ k ]( P, ARMS_H ) };
	if ( k === 'reddot' ) {
		// a micro red dot (T-2 pattern) on its riser: the short tube with front and rear glass, the hood's protective
		// ears over the front, the elevation turret under its cap on top, the battery cap on the right, flip caps open
		const ax = 0.032;
		railClamp( P, - 0.02, 0.02, 0.009, 0.013, 'alu', false );
		P.extFront( 'alu', [ [ - 0.0118, 0.008 ], [ 0.0118, 0.008 ], [ 0.0092, 0.022 ], [ - 0.0092, 0.022 ] ], - 0.018, 0.018, 0.0012 );
		P.lathe( 'alu', [ [ - 0.027, 0.0108 ], [ - 0.027, 0.0122 ], [ - 0.024, 0.0128 ], [ - 0.008, 0.0128 ], [ - 0.006, 0.012 ], [ 0.006, 0.012 ], [ 0.008, 0.0134 ], [ 0.024, 0.0134 ], [ 0.027, 0.0126 ], [ 0.027, 0.0114 ], [ 0.026, 0.0112 ], [ - 0.026, 0.0106 ], [ - 0.027, 0.0108 ] ], ax, 0, 24 );
		P.cyl( 'lens', - 0.0255, - 0.0248, 0.0109, ax, 0, 20 );
		P.cyl( 'lensF', 0.0178, 0.0186, 0.0116, ax, 0, 20 );
		// the front ears and the bridge between them
		for ( const s of [ - 1, 1 ] ) P.extFront( 'alu', [ [ s * 0.0118, ax - 0.006 ], [ s * 0.0148, ax - 0.006 ], [ s * 0.0148, ax + 0.012, 0.003 ], [ s * 0.0118, ax + 0.012 ] ], 0.008, 0.028, 0.0008 );
		P.extFront( 'alu', [ [ - 0.0148, ax + 0.0128 ], [ 0.0148, ax + 0.0128 ], [ 0.0148, ax + 0.0158, 0.002 ], [ - 0.0148, ax + 0.0158, 0.002 ] ], 0.016, 0.028, 0.0008 );
		// elevation cap (top), battery cap (right, big and knurled), windage cap (left)
		P.cylY( 'alu', - 0.005, ax + 0.011, ax + 0.0185, 0.0072, 0, 14 );
		knurl( P, 'alu', - 0.005, ax + 0.0158, 0, 0.0072, 0.004, 'y', 14 );
		P.cylZ( 'alu', - 0.002, ax, 0.011, 0.0195, 0.0085, 16 );
		knurl( P, 'alu', - 0.002, ax, 0.0165, 0.0085, 0.005, 'z', 16 );
		P.cylZ( 'alu', - 0.002, ax, - 0.0175, - 0.011, 0.0062, 14 );
		P.cylZ( 'rubber', - 0.012, ax - 0.008, 0.0118, 0.0124, 0.0016, 8 );
		flipCap( P, - 0.027, ax, 0.0125, - 1 );
		flipCap( P, 0.028, ax, 0.0134, 1 );
		info = { axisH: ax, rearX: - 0.027, frontX: 0.028, lensR: 0.0108, eyeRelief: 0.2, reticleX: 0.018 };
	} else if ( k === 'holo' ) {
		// holographic sight (EXPS pattern): the hood's two walls and roof with sloped ends round the window, the base
		// with the battery under the hood, the rear buttons, the QD lever on the right
		railClamp( P, - 0.045, 0.04, 0.0135, 0.016, 'blk', true );
		P.extS( 'blk', [ [ - 0.048, 0.0115 ], [ 0.042, 0.0115 ], [ 0.044, 0.021, 0.004 ], [ - 0.046, 0.022, 0.004 ] ], 0.0168, 0.0025 );
		const hood = [ [ - 0.026, 0.021 ], [ 0.028, 0.021 ], [ 0.032, 0.05, 0.003 ], [ 0.024, 0.0565, 0.004 ], [ - 0.022, 0.0565, 0.004 ], [ - 0.03, 0.05, 0.003 ] ];
		for ( const s of [ - 1, 1 ] ) P.ext( 'blk', hood, s > 0 ? 0.0146 : - 0.0192, s > 0 ? 0.0192 : - 0.0146, 0.0012 );
		P.extS( 'blk', [ [ - 0.022, 0.051 ], [ 0.024, 0.051 ], [ 0.024, 0.0565, 0.004 ], [ - 0.022, 0.0565, 0.004 ] ], 0.0192, 0.0015 );
		// the window: the rear glass (where the reticle shows) and the tinted front glass
		P.box( 'lens', 0.0188, 0.0198, 0.0232, 0.0508, - 0.0145, 0.0145, 0 );
		P.box( 'lensF', 0.0236, 0.0246, 0.0232, 0.0508, - 0.0145, 0.0145, 0 );
		// the battery cap at the front of the base (right), the buttons at the back, the windage / elevation screws
		P.cylZ( 'blk', 0.034, 0.016, 0.0168, 0.0198, 0.0068, 14 );
		knurl( P, 'blk', 0.034, 0.016, 0.0186, 0.0068, 0.0022, 'z', 14 );
		P.box( 'blk', - 0.05, - 0.044, 0.0125, 0.021, - 0.0125, 0.0125, 0.0015 );
		for ( const z of [ - 0.0065, 0.0065 ] ) P.cylZ( 'rubber', - 0.0505, 0.017, z - 0.0035, z + 0.0035, 0.0034, 10 );
		for ( const z of [ - 0.0065, 0.0065 ] ) P.cyl( 'rubber', - 0.0525, - 0.0505, 0.0032, 0.017, z, 10 );
		screw( P, - 0.008, 0.0565, 0, 'y', 1, 0.0022, 'steel' );
		screw( P, - 0.008, 0.04, 0.0192, 'z', 1, 0.0022, 'steel' );
		info = { axisH: 0.037, rearX: - 0.03, frontX: 0.032, lensR: 0.014, lensH: 0.012, eyeRelief: 0.2, reticleX: 0.019, window: 1 };
	} else if ( k === 'prism' ) {
		// a compact 2x prism sight: the squared prism housing between a short ocular and objective, the illumination
		// dial on the left, the capped turrets, an integrated mount
		const ax = 0.032;
		railClamp( P, - 0.03, 0.03, 0.012, 0.013, 'blk', true );
		P.extFront( 'blk', [ [ - 0.0155, 0.011 ], [ 0.0155, 0.011 ], [ 0.0165, 0.04, 0.005 ], [ 0.012, 0.0475, 0.005 ], [ - 0.012, 0.0475, 0.005 ], [ - 0.0165, 0.04, 0.005 ] ], - 0.03, 0.032, 0.0018 );
		P.lathe( 'blk', [ [ - 0.03, 0.0145 ], [ - 0.032, 0.0145 ], [ - 0.036, 0.0158 ], [ - 0.046, 0.0158 ], [ - 0.049, 0.0148 ], [ - 0.049, 0.0136 ], [ - 0.046, 0.0134 ] ], ax, 0, 22 );
		P.lathe( 'rubber', [ [ - 0.0505, 0.0145 ], [ - 0.0505, 0.016 ], [ - 0.046, 0.0162 ] ], ax, 0, 22 );
		P.lathe( 'blk', [ [ 0.032, 0.0145 ], [ 0.036, 0.0158 ], [ 0.047, 0.0168 ], [ 0.049, 0.0162 ], [ 0.049, 0.0146 ] ], ax, 0, 22 );
		P.cyl( 'coat', 0.0455, 0.0462, 0.0146, ax, 0, 20 );
		P.cyl( 'lens', - 0.047, - 0.046, 0.013, ax, 0, 20 );
		turret( P, 0.0, ax, 0.0155, 'y', 0.0068, 0.008 );
		turret( P, 0.0, ax, 0.0165, 'z', 0.0068, 0.007 );
		turret( P, 0.0, ax, 0.0165, '-z', 0.0082, 0.006 );
		info = { axisH: ax, rearX: - 0.0505, frontX: 0.049, lensR: 0.013, eyeRelief: 0.09, reticleX: - 0.046 };
	} else if ( k === 'acog' ) {
		// the ACOG (TA31 pattern): a cast housing tapering from the ocular to the big objective, the fibre optic in its
		// housing on top, capped turrets top and right, the flat-top mount with two thumb nuts on the left
		const ax = 0.035;
		railClamp( P, - 0.032, 0.032, 0.011, 0.013, 'blk' );
		for ( const x of [ - 0.016, 0.016 ] ) { P.cylZ( 'blk', x, 0.004, - 0.022, - 0.013, 0.0065, 12 ); knurl( P, 'blk', x, 0.004, - 0.019, 0.0065, 0.005, 'z', 12 ); }
		P.extS( 'blk', [ [ - 0.05, 0.01 ], [ 0.05, 0.01 ], [ 0.046, 0.026, 0.006 ], [ - 0.046, 0.026, 0.006 ] ], 0.0118, 0.002 );
		P.lathe( 'blk', [ [ - 0.087, 0.0165 ], [ - 0.086, 0.0182 ], [ - 0.062, 0.0182 ], [ - 0.054, 0.0152 ], [ - 0.03, 0.0148 ], [ 0.02, 0.0148 ], [ 0.05, 0.016 ], [ 0.062, 0.0218 ], [ 0.088, 0.0218 ], [ 0.09, 0.0205 ], [ 0.09, 0.0186 ] ], ax, 0, 24 );
		P.extFront( 'blk', [ [ - 0.0125, ax ], [ 0.0125, ax ], [ 0.0125, ax + 0.012, 0.004 ], [ - 0.0125, ax + 0.012, 0.004 ] ], - 0.05, 0.045, 0.0015 );
		P.lathe( 'rubber', [ [ - 0.0895, 0.0168 ], [ - 0.0895, 0.0186 ], [ - 0.086, 0.019 ] ], ax, 0, 24 );
		P.cyl( 'coat', 0.0868, 0.0876, 0.0188, ax, 0, 20 );
		P.cyl( 'lens', - 0.086, - 0.085, 0.016, ax, 0, 20 );
		// fibre optic: its housing along the top, the glowing fibre under the clear cover
		P.extS( 'blk', [ [ - 0.034, ax + 0.012 ], [ 0.038, ax + 0.012 ], [ 0.034, ax + 0.0215, 0.003 ], [ - 0.03, ax + 0.0215, 0.003 ] ], 0.0062, 0.0015 );
		P.box( 'fiber', - 0.028, 0.032, ax + 0.0208, ax + 0.0232, - 0.0024, 0.0024, 0.0008 );
		P.box( 'smoke', - 0.03, 0.034, ax + 0.021, ax + 0.0252, - 0.0042, 0.0042, 0.0012 );
		turret( P, 0.0, ax, 0.0148, 'z', 0.0072, 0.007 );
		info = { axisH: ax, rearX: - 0.0895, frontX: 0.09, lensR: 0.016, eyeRelief: 0.07, scope: 1, reticleX: - 0.085 };
	} else if ( k === 'hunting' || k === 'sniper' ) {
		// a variable scope: the 1" (30 mm) tube, the objective bell (and the sniper scope's sunshade), the eyepiece with its
		// power ring and the rubber eyecup, the turrets on their saddle (the sniper's big target turrets and side
		// parallax knob), two rings on the rail
		const big = k === 'sniper';
		const r = big ? 0.015 : 0.0127, ax = big ? 0.05 : 0.038, ro = big ? 0.029 : 0.022, re = big ? 0.021 : 0.019;
		const x0 = big ? - 0.15 : - 0.13, x1 = big ? 0.14 : 0.12;
		P.lathe( 'blued', [ [ x0, r ], [ x1, r ] ], ax, 0, 24 );
		// the objective: the bell, the sunshade (sniper), the coated glass
		P.lathe( 'blued', [ [ x1 - 0.002, r ], [ x1 + 0.006, r + 0.0008 ], [ x1 + 0.038, ro ], [ x1 + 0.074, ro ], [ x1 + 0.077, ro - 0.0018 ], [ x1 + 0.077, ro - 0.003 ] ], ax, 0, 26 );
		if ( big ) P.lathe( 'blued', [ [ x1 + 0.076, ro - 0.0005 ], [ x1 + 0.13, ro - 0.0005 ], [ x1 + 0.13, ro - 0.0025 ] ], ax, 0, 26 );
		P.cyl( 'coat', x1 + 0.07, x1 + 0.071, ro - 0.003, ax, 0, 24 );
		// the eyepiece: the power ring (knurled, its throw lever on the sniper), the ocular bell, the eyecup and glass
		P.lathe( 'blued', [ [ x0 + 0.002, r ], [ x0 - 0.002, r + 0.0018 ], [ x0 - 0.026, r + 0.0018 ], [ x0 - 0.03, re ], [ x0 - 0.068, re ], [ x0 - 0.07, re - 0.0012 ] ], ax, 0, 24 );
		knurl( P, 'blued', x0 - 0.014, ax, 0, r + 0.0018, 0.018, 'x', 26 );
		if ( big ) P.box( 'blued', x0 - 0.018, x0 - 0.01, ax - 0.003, ax + 0.003, r + 0.001, r + 0.012, 0.0015 );
		P.lathe( 'rubber', [ [ x0 - 0.069, re + 0.0004 ], [ x0 - 0.08, re + 0.0014 ], [ x0 - 0.082, re + 0.0005 ], [ x0 - 0.082, re - 0.002 ] ], ax, 0, 24 );
		P.cyl( 'lens', x0 - 0.08, x0 - 0.079, re - 0.003, ax, 0, 22 );
		// saddle and turrets
		P.lathe( 'blued', [ [ - 0.026, r ], [ - 0.02, r + 0.0045 ], [ 0.02, r + 0.0045 ], [ 0.026, r ] ], ax, 0, 24 );
		turret( P, 0.0, ax, r + 0.0045, 'y', big ? 0.0125 : 0.0095, big ? 0.02 : 0.013, 'blued' );
		turret( P, 0.0, ax, r + 0.0045, 'z', big ? 0.0125 : 0.0095, big ? 0.018 : 0.012, 'blued' );
		if ( big ) turret( P, 0.0, ax, r + 0.0045, '-z', 0.014, 0.01, 'blued' );
		ring( P, - 0.063, ax, r, 0.013, 'blk' ); ring( P, 0.052, ax, r, 0.013, 'blk' );
		info = { axisH: ax, rearX: x0 - 0.082, frontX: x1 + ( big ? 0.13 : 0.077 ), lensR: re - 0.003, eyeRelief: 0.08, scope: 1, reticleX: x0 - 0.079 };
	} else if ( k === 'pso' ) {
		// PSO-1: the long tube with its big rubber eyecup and the sunshade, the elevation drum on top, the windage drum on
		// the right, the reticle lamp's battery housing on the left, the side bracket (here on a rail clamp)
		const ax = 0.045;
		railClamp( P, - 0.05, 0.05, 0.012, 0.013, 'blk' );
		P.extFront( 'blk', [ [ - 0.022, 0.01 ], [ 0.009, 0.01 ], [ 0.009, 0.03, 0.004 ], [ - 0.014, 0.038, 0.004 ], [ - 0.022, 0.03 ] ], - 0.05, 0.05, 0.002 );
		P.cylZ( 'blk', 0.0, 0.02, - 0.03, - 0.022, 0.009, 14 );
		P.extS( 'blk', [ [ - 0.004, 0.012 ], [ 0.03, 0.006, 0.003 ], [ 0.03, 0.0 ], [ - 0.004, 0.003 ] ], 0.0015, 0.0005, - 0.0315 );
		P.lathe( 'blk', [ [ - 0.092, 0.0132 ], [ 0.08, 0.0132 ], [ 0.086, 0.0158 ], [ 0.112, 0.0158 ], [ 0.112, 0.014 ] ], ax, 0, 22 );
		P.lathe( 'rubber', [ [ - 0.162, 0.021 ], [ - 0.158, 0.0225 ], [ - 0.13, 0.0195 ], [ - 0.11, 0.0158 ], [ - 0.092, 0.0142 ] ], ax, 0, 22 );
		for ( let i = 0; i < 3; i ++ ) P.lathe( 'rubber', [ [ - 0.152 + i * 0.012, 0.0205 - i * 0.0012 ], [ - 0.148 + i * 0.012, 0.0215 - i * 0.0012 ], [ - 0.144 + i * 0.012, 0.0205 - i * 0.0012 ] ], ax, 0, 22 );
		P.cyl( 'coat', 0.104, 0.105, 0.0138, ax, 0, 20 );
		P.cyl( 'lens', - 0.12, - 0.119, 0.012, ax, 0, 20 );
		turret( P, - 0.005, ax, 0.0132, 'y', 0.011, 0.018 );
		turret( P, - 0.005, ax, 0.0132, 'z', 0.011, 0.016 );
		P.cylY( 'blk', 0.035, ax + 0.0125, ax + 0.021, 0.0072, 0, 12 );
		P.cylZ( 'blk', 0.035, ax, - 0.022, - 0.012, 0.0062, 12 );
		info = { axisH: ax, rearX: - 0.162, frontX: 0.112, lensR: 0.012, eyeRelief: 0.06, scope: 1, reticleX: - 0.119 };
	} else if ( k === 'supp' ) {
		// a suppressor: the threaded mount and its knurled collar at the back, the tube with its seams, the end cap with
		// wrench flats round the exit hole
		// the pistol can has its recoil booster in a slim housing at the back; the rifle can a quick-detach collar
		// with its latch; the long .308 can is in flat dark earth with a fluted front
		const len = def.model.len || 0.16, r = def.model.r || 0.018;
		const pis = def.id === 'supp_pistol', big = def.id === 'supp_sniper', m = big ? 'tanM' : 'supp';
		const x0 = pis ? 0.03 : 0.0;
		P.lathe( m, [ [ x0 - 0.001, 0.0 ], [ x0 - 0.001, r * 0.72 ], [ x0 + 0.003, r * 0.9 ], [ x0 + 0.008, r ], [ len - 0.008, r ], [ len - 0.003, r * 0.94 ], [ len, r * 0.76 ], [ len, r * 0.34 ], [ len - 0.0015, 0.0 ] ], 0, 0, 24 );
		if ( pis ) {
			P.lathe( 'supp', [ [ - 0.001, 0.0 ], [ - 0.001, r * 0.66 ], [ 0.002, r * 0.76 ], [ 0.031, r * 0.76 ] ], 0, 0, 20 );
			knurl( P, 'supp', 0.012, 0, 0, r * 0.76 + 0.0003, 0.016, 'x', 20 );
		} else {
			knurl( P, m, 0.021, 0, 0, r + 0.0003, 0.02, 'x', 24 );
			if ( ! big ) {
				// the QD latch on the collar
				P.box( 'blk', 0.006, 0.026, r + 0.0004, r + 0.0034, - 0.0035, 0.0035, 0.001 );
				P.cylZ( 'steel', 0.023, r + 0.002, - 0.0042, 0.0042, 0.0012, 8 );
			}
		}
		for ( const t of big ? [ 0.3, 0.5 ] : [ 0.3, 0.55, 0.8 ] ) P.lathe( 'rubber', [ [ len * t - 0.0006, r + 0.0001 ], [ len * t + 0.0006, r + 0.0001 ] ], 0, 0, 24 );
		if ( big ) for ( let i = 0; i < 8; i ++ ) { const a = i / 8 * PI * 2; P.boxC( 'rubber', len * 0.76, Math.cos( a ) * ( r - 0.0006 ), Math.sin( a ) * ( r - 0.0006 ), len * 0.36, 0.0016, 0.0042, 0.0008, [ a, 0, 0 ] ); }
		for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2; P.boxC( m, len - 0.004, Math.cos( a ) * r * 0.88, Math.sin( a ) * r * 0.88, 0.006, 0.0018, r * 0.5, 0.0005, [ a, 0, 0 ] ); }
		P.cyl( 'rubber', len - 0.0008, len + 0.0002, r * 0.3, 0, 0, 14 );
		info = { len };
	} else if ( k === 'light' ) {
		// a weapon light: the rail clamp with its thumb screw, the body (knurled grip ring, cooling fins at the head), the
		// crenellated bezel, the lens and reflector, the tail switch
		P.box( 'alu', - 0.02, 0.02, - 0.009, 0.009, 0.0, 0.01, 0.002 );
		P.box( 'alu', - 0.02, 0.02, - 0.009, - 0.006, - 0.003, 0.0, 0.0008 );
		P.box( 'alu', - 0.02, 0.02, 0.006, 0.009, - 0.003, 0.0, 0.0008 );
		P.cylY( 'steel', 0.0, - 0.013, - 0.009, 0.0045, 0.004, 8 );
		P.box( 'alu', - 0.02, 0.02, - 0.008, 0.008, 0.008, 0.016, 0.002 );
		P.lathe( 'alu', [ [ - 0.05, 0.0098 ], [ - 0.048, 0.0115 ], [ 0.04, 0.0115 ], [ 0.046, 0.0125 ], [ 0.058, 0.0152 ], [ 0.074, 0.0152 ], [ 0.076, 0.014 ], [ 0.076, 0.0118 ] ], 0, 0.022, 22 );
		for ( let i = 0; i < 4; i ++ ) P.lathe( 'alu', [ [ 0.024 + i * 0.005, 0.0115 ], [ 0.025 + i * 0.005, 0.0128 ], [ 0.027 + i * 0.005, 0.0128 ], [ 0.028 + i * 0.005, 0.0115 ] ], 0, 0.022, 22 );
		knurl( P, 'alu', - 0.03, 0, 0.022, 0.0116, 0.02, 'x', 20 );
		for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2; P.boxC( 'alu', 0.0768, Math.cos( a ) * 0.0142, 0.022 + Math.sin( a ) * 0.0142, 0.004, 0.0035, 0.004, 0.0006, [ a, 0, 0 ] ); }
		P.lathe( 'steel', [ [ 0.0735, 0.0118 ], [ 0.0705, 0.004 ], [ 0.07, 0.0 ] ], 0, 0.022, 18 );
		P.cyl( 'rubber', - 0.058, - 0.05, 0.0092, 0, 0.022, 14 );
		P.cyl( 'rubber', - 0.0595, - 0.0575, 0.0068, 0, 0.022, 12 );
		const lamp = P.sub( 'lamp', 0.075, 0, 0.022 );
		lamp.cyl( 'lensW', 0.0738, 0.0748, 0.0118, 0, 0.022, 20 );
		info = { lamp: [ 0.076, 0, 0.022 ] };
	} else {
		P.box( 'blk', - 0.03, 0.03, 0, 0.03, - 0.015, 0.015, 0.003 );
	}
	return { P, info };
}
