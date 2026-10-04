// Attachments: optics, muzzle devices, lights (the arms items' fittings by kind).
import { ARMS_ATTACH } from '../../game/items/ext/arms/parts.js';
import { ARMS_H, Parts } from './kit.js';

// ---- attachments -----------------------------------------------------------------------------------------------------
// Optic frame: base (rail clamp) bottom at y = 0, centred on x = 0; optical axis at y = axisH.
// Muzzle devices start at x = 0 and extend +x. Lights clamp at the origin and hang to +z.

function railClamp( P, x0, x1, h = 0.01, hz = 0.013 ) {
	P.box( 'alu', x0, x1, 0.0, h, - hz, hz, 0.002 );
	P.box( 'alu', x0, x1, - 0.004, 0.003, - hz, - hz + 0.004, 0.001 );
	P.box( 'alu', x0, x1, - 0.004, 0.003, hz - 0.004, hz, 0.001 );
	P.cylZ( 'steel', ( x0 + x1 ) / 2, 0.003, hz, hz + 0.004, 0.004, 8 );
}
function ring( P, x, axisH, r, w = 0.012 ) {
	P.box( 'blk', x - w / 2, x + w / 2, 0.0, axisH - r * 0.6, - 0.011, 0.011, 0.002 );
	P.lathe( 'blk', [ [ x - w / 2, r + 0.0035 ], [ x + w / 2, r + 0.0035 ] ], axisH, 0, 18 );
	railClamp( P, x - w / 2, x + w / 2, 0.006, 0.012 );
}
function scopeTube( P, mat, x0, x1, r, axisH, seg = 20 ) { P.cyl( mat, x0, x1, r, axisH, 0, seg ); }

export function attachmentParts( def ) {
	const P = new Parts();
	const k = def.model?.kind;
	let info = { axisH: 0.03, rearX: - 0.02, lensR: 0.012, eyeRelief: 0.16 };
	if ( ARMS_ATTACH[ k ] ) return { P, info: ARMS_ATTACH[ k ]( P, ARMS_H ) };
	if ( k === 'reddot' ) {
		railClamp( P, - 0.02, 0.02, 0.012 );
		P.box( 'alu', - 0.018, 0.018, 0.01, 0.018, - 0.01, 0.01, 0.002 );
		P.lathe( 'alu', [ [ - 0.024, 0.0135 ], [ - 0.022, 0.0155 ], [ 0.022, 0.0155 ], [ 0.026, 0.0145 ] ], 0.032, 0, 20 );
		P.cylY( 'alu', 0.0, 0.044, 0.051, 0.0065, 0, 10 );
		P.cylZ( 'alu', 0.0, 0.032, 0.014, 0.021, 0.0065, 10 );
		P.cyl( 'lens', 0.018, 0.019, 0.013, 0.032, 0, 20 );
		info = { axisH: 0.032, rearX: - 0.024, frontX: 0.026, lensR: 0.012, eyeRelief: 0.2, reticleX: 0.018 };
	} else if ( k === 'holo' ) {
		railClamp( P, - 0.045, 0.04, 0.014, 0.016 );
		P.box( 'blk', - 0.045, 0.04, 0.012, 0.022, - 0.017, 0.017, 0.004 );
		// the window: an open hood (sides and top) over the base; the battery housing and buttons sit low at the back
		P.box( 'blk', - 0.047, - 0.028, 0.019, 0.026, - 0.017, 0.017, 0.003 );
		for ( const z of [ - 0.007, 0.007 ] ) P.cylZ( 'rubber', - 0.04, 0.0225, z - 0.003, z + 0.003, 0.0035, 8 );
		P.box( 'blk', - 0.03, 0.03, 0.022, 0.055, 0.0145, 0.019, 0.002 );
		P.box( 'blk', - 0.03, 0.03, 0.022, 0.055, - 0.019, - 0.0145, 0.002 );
		P.box( 'blk', - 0.03, 0.03, 0.051, 0.056, - 0.019, 0.019, 0.002 );
		P.box( 'lens', 0.018, 0.02, 0.023, 0.051, - 0.0145, 0.0145, 0 );
		P.box( 'rubber', - 0.047, - 0.04, 0.013, 0.02, - 0.012, 0.012, 0.002 );
		info = { axisH: 0.037, rearX: - 0.03, frontX: 0.03, lensR: 0.014, lensH: 0.012, eyeRelief: 0.2, reticleX: 0.019, window: 1 };
	} else if ( k === 'prism' ) {
		railClamp( P, - 0.03, 0.03, 0.012 );
		P.box( 'blk', - 0.03, 0.03, 0.01, 0.047, - 0.0165, 0.0165, 0.004 );
		P.lathe( 'blk', [ [ - 0.048, 0.0155 ], [ - 0.03, 0.0145 ] ], 0.032, 0, 18 );
		P.lathe( 'blk', [ [ 0.03, 0.015 ], [ 0.048, 0.0165 ] ], 0.032, 0, 18 );
		P.cylY( 'blk', 0.0, 0.047, 0.054, 0.007, 0, 10 );
		P.cyl( 'lensDark', 0.046, 0.047, 0.014, 0.032, 0, 18 );
		P.cyl( 'lens', - 0.047, - 0.046, 0.013, 0.032, 0, 18 );
		info = { axisH: 0.032, rearX: - 0.048, frontX: 0.048, lensR: 0.013, eyeRelief: 0.09, reticleX: - 0.046 };
	} else if ( k === 'acog' ) {
		railClamp( P, - 0.03, 0.03, 0.012 );
		P.box( 'blk', - 0.05, 0.05, 0.012, 0.045, - 0.0135, 0.0135, 0.006 );
		P.lathe( 'blk', [ [ - 0.085, 0.018 ], [ - 0.06, 0.017 ], [ - 0.05, 0.014 ] ], 0.035, 0, 20 );
		P.lathe( 'blk', [ [ 0.045, 0.015 ], [ 0.06, 0.0215 ], [ 0.088, 0.0215 ] ], 0.035, 0, 20 );
		P.box( 'blk', - 0.03, 0.035, 0.045, 0.058, - 0.006, 0.006, 0.003 );
		P.box( 'fiber', - 0.028, 0.033, 0.055, 0.0585, - 0.003, 0.003, 0.001 );
		P.cylZ( 'blk', 0.0, 0.035, 0.012, 0.02, 0.007, 10 );
		P.cyl( 'lensDark', 0.086, 0.087, 0.019, 0.035, 0, 18 );
		P.cyl( 'lens', - 0.084, - 0.083, 0.016, 0.035, 0, 18 );
		info = { axisH: 0.035, rearX: - 0.085, frontX: 0.088, lensR: 0.016, eyeRelief: 0.07, scope: 1, reticleX: - 0.083 };
	} else if ( k === 'hunting' || k === 'sniper' ) {
		const big = k === 'sniper';
		const r = big ? 0.015 : 0.0127, axisH = big ? 0.05 : 0.038, ro = big ? 0.029 : 0.022, re = big ? 0.021 : 0.019;
		const x0 = big ? - 0.15 : - 0.13, x1 = big ? 0.14 : 0.12;
		scopeTube( P, 'blued', x0, x1, r, axisH );
		P.lathe( 'blued', [ [ x1, r ], [ x1 + 0.04, ro ], [ x1 + 0.075, ro ], [ x1 + 0.077, ro - 0.002 ] ], axisH, 0, 22 );
		P.lathe( 'blued', [ [ x0 - 0.07, re - 0.001 ], [ x0 - 0.068, re ], [ x0 - 0.03, re ], [ x0, r ] ], axisH, 0, 20 );
		P.lathe( 'rubber', [ [ x0 - 0.082, re + 0.001 ], [ x0 - 0.07, re + 0.001 ] ], axisH, 0, 20 );
		P.cylY( 'blued', 0.0, axisH + r - 0.002, axisH + r + ( big ? 0.022 : 0.014 ), big ? 0.013 : 0.01, 0, 14 );
		P.cylZ( 'blued', 0.0, axisH, r - 0.002, r + ( big ? 0.02 : 0.013 ), big ? 0.013 : 0.01, 14 );
		if ( big ) P.cylZ( 'blued', 0.0, axisH, - r - 0.016, - r + 0.002, 0.011, 12 );
		ring( P, - 0.063, axisH, r ); ring( P, 0.052, axisH, r );
		P.cyl( 'lensDark', x1 + 0.074, x1 + 0.075, ro - 0.003, axisH, 0, 20 );
		P.cyl( 'lens', x0 - 0.08, x0 - 0.079, re - 0.003, axisH, 0, 20 );
		info = { axisH, rearX: x0 - 0.082, frontX: x1 + 0.077, lensR: re - 0.003, eyeRelief: 0.08, scope: 1, reticleX: x0 - 0.079 };
	} else if ( k === 'pso' ) {
		railClamp( P, - 0.05, 0.05, 0.012 );
		P.box( 'blk', - 0.05, 0.05, 0.01, 0.03, - 0.02, 0.008, 0.004 );
		scopeTube( P, 'blk', - 0.09, 0.08, 0.013, 0.045 );
		P.lathe( 'blk', [ [ 0.08, 0.013 ], [ 0.095, 0.016 ], [ 0.11, 0.016 ] ], 0.045, 0, 18 );
		P.lathe( 'rubber', [ [ - 0.16, 0.021 ], [ - 0.12, 0.018 ], [ - 0.09, 0.014 ] ], 0.045, 0, 18 );
		P.cylY( 'blk', - 0.005, 0.055, 0.074, 0.011, 0, 14 );
		P.cylZ( 'blk', - 0.005, 0.045, - 0.034, - 0.012, 0.011, 14 );
		P.cylY( 'blk', 0.035, 0.055, 0.065, 0.008, 0, 10 );
		P.cyl( 'lensDark', 0.109, 0.11, 0.014, 0.045, 0, 18 );
		P.cyl( 'lens', - 0.12, - 0.119, 0.012, 0.045, 0, 18 );
		info = { axisH: 0.045, rearX: - 0.16, frontX: 0.11, lensR: 0.012, eyeRelief: 0.06, scope: 1, reticleX: - 0.119 };
	} else if ( k === 'supp' ) {
		const len = def.model.len || 0.16, r = def.model.r || 0.018;
		P.lathe( 'blk', [ [ 0.0, 0.009 ], [ 0.006, r * 0.8 ], [ 0.012, r ], [ len - 0.008, r ], [ len, r * 0.75 ], [ len + 0.0005, 0.006 ] ], 0, 0, 20 );
		for ( const t of [ 0.25, 0.5, 0.75 ] ) P.lathe( 'blued', [ [ len * t - 0.002, r + 0.0005 ], [ len * t + 0.002, r + 0.0005 ] ], 0, 0, 20 );
		info = { len };
	} else if ( k === 'light' ) {
		P.box( 'alu', - 0.02, 0.02, - 0.009, 0.009, 0.0, 0.01, 0.002 );
		P.cyl( 'alu', - 0.05, 0.05, 0.0115, 0, 0.022, 16 );
		P.lathe( 'alu', [ [ 0.045, 0.0115 ], [ 0.058, 0.015 ], [ 0.075, 0.015 ] ], 0, 0.022, 18 );
		P.cyl( 'rubber', - 0.058, - 0.05, 0.009, 0, 0.022, 12 );
		const lamp = P.sub( 'lamp', 0.075, 0, 0.022 );
		lamp.cyl( 'white', 0.073, 0.0755, 0.0135, 0, 0.022, 18 );
		info = { lamp: [ 0.076, 0, 0.022 ] };
	} else {
		P.box( 'blk', - 0.03, 0.03, 0, 0.03, - 0.015, 0.015, 0.003 );
	}
	return { P, info };
}

