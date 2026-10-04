// Handguns: self-loading pistols, revolvers, the flare pistol.
// Pistol frame: the trigger at x = 0, y = -0.022 (the frame's underside over the guard), the bore on y = 0; the slide
// ('slide') from xr to xf, its top at `top`; the grip's top front at ( -0.024, -0.018 ).
import { THREE, PI, Parts, circle, slot, grip, pistolGrip, trigger, triggerGuard, pins, screw } from './kit.js';

// a closed slide: a lower band, the top band chamfered (or rounded) and cut on the right by the ejection port, the barrel
// hood showing in the port, the extractor, the back plate with the firing pin, the muzzle and the guide rod at the front
function closedSlide( sl, mat, xr, xf, bot, top, hz, round ) {
	const yb = top - 0.0115, c = round ? 0.006 : 0.0038, px0 = - 0.016, px1 = 0.037;
	const band = ( z1, rightEdge ) => round
		? [ [ - hz, yb ], [ z1, yb ], rightEdge ? [ z1, top, c ] : [ z1, top ], [ - hz, top, c ] ]
		: rightEdge ? [ [ - hz, yb ], [ z1, yb ], [ z1, top - c ], [ z1 - c, top ], [ - hz + c, top ], [ - hz, top - c ] ] : [ [ - hz, yb ], [ z1, yb ], [ z1, top ], [ - hz + c, top ], [ - hz, top - c ] ];
	sl.extFront( mat, [ [ - hz, bot ], [ hz, bot ], [ hz, yb ], [ - hz, yb ] ], xr, xf, 0.0005 );
	sl.extFront( mat, band( hz, true ), xr, px0, 0.0005 );
	sl.extFront( mat, band( hz, true ), px1, xf, 0.0005 );
	sl.extFront( mat, band( - 0.0012, false ), px0, px1, 0.0005 );
	sl.box( 'blued', px0 + 0.0008, px1 - 0.0008, yb, top - 0.0009, - 0.0016, hz - 0.0022, 0.0007 );
	sl.box( 'steel', px1 - 0.004, px1 - 0.0008, yb + 0.001, top - 0.0012, - 0.0014, hz - 0.0026, 0.0005 );
	sl.box( 'blk', px0 - 0.017, px0 - 0.002, top - 0.0092, top - 0.0056, hz - 0.0003, hz + 0.0006, 0.0003 );
	sl.box( 'poly', xr - 0.0007, xr + 0.001, bot + 0.004, top - 0.004, - hz + 0.0028, hz - 0.0028, 0.001 );
	sl.cyl( 'rubber', xr - 0.0009, xr - 0.0005, 0.0019, 0.004, 0, 10 );
	sl.cyl( 'rubber', xf - 0.0003, xf + 0.0003, 0.0034, bot + 0.0048, 0, 10 );
}

// sights on the slide: the rear block with its notch at rx, the front blade at fx, the line at sh; style 'glock' (a white
// U round the notch, a white dot), 'dots' (three white dots), 'tritium' (green), 'plain'
function slideSights( sl, rx, fx, top, sh, style, mat = 'blk' ) {
	sl.extFront( mat, [ [ - 0.0068, top - 0.001 ], [ 0.0068, top - 0.001 ], [ 0.0064, sh + 0.0012, 0.001 ], [ 0.0018, sh + 0.0012 ], [ 0.0018, sh - 0.0018 ], [ - 0.0018, sh - 0.0018 ], [ - 0.0018, sh + 0.0012 ], [ - 0.0064, sh + 0.0012, 0.001 ] ], rx - 0.005, rx + 0.0055, 0.0006 );
	if ( fx != null ) sl.extFront( mat, [ [ - 0.0016, top - 0.001 ], [ 0.0016, top - 0.001 ], [ 0.0013, sh, 0.0006 ], [ - 0.0013, sh, 0.0006 ] ], fx - 0.0065, fx + 0.0005, 0.0003 );
	const dot = style === 'tritium' ? 'glow' : 'white';
	if ( style === 'glock' ) {
		sl.box( 'white', rx - 0.0052, rx - 0.0046, sh - 0.0022, sh + 0.0006, - 0.0025, - 0.0018, 0 );
		sl.box( 'white', rx - 0.0052, rx - 0.0046, sh - 0.0022, sh + 0.0006, 0.0018, 0.0025, 0 );
		sl.box( 'white', rx - 0.0052, rx - 0.0046, sh - 0.0026, sh - 0.0018, - 0.0025, 0.0025, 0 );
		if ( fx != null ) sl.box( 'white', fx - 0.0068, fx - 0.0062, sh - 0.0026, sh - 0.0008, - 0.0009, 0.0009, 0 );
	} else if ( style !== 'plain' ) {
		for ( const s of [ - 1, 1 ] ) sl.box( dot, rx - 0.0054, rx - 0.0048, sh - 0.0026, sh - 0.0008, s * 0.004 - 0.0009, s * 0.004 + 0.0009, 0 );
		if ( fx != null ) sl.box( style === 'tritium' ? 'glowO' : 'white', fx - 0.0068, fx - 0.0062, sh - 0.0026, sh - 0.0008, - 0.0009, 0.0009, 0 );
	}
}

// slanted grooves across the slide's flanks (cocking serrations): n grooves from x0 forward
function serrations( sl, x0, n, bot, top, hz, pitch = 0.0036, slant = 0 ) {
	for ( let i = 0; i < n; i ++ ) for ( const s of [ - 1, 1 ] ) sl.boxC( 'rubber', x0 + i * pitch, ( bot + top ) / 2, s * hz, 0.0011, top - bot, 0.0008, 0, [ 0, 0, slant ] );
}

export function pistol( o ) {
	const v = o.v || 'glock';
	if ( v === 'deagle' ) return deagle();
	if ( v === 'ruger' ) return ruger();
	const P = new Parts();
	const S = {
		glock: { xr: - 0.07, xf: 0.113, top: 0.021, bot: - 0.009, hz: 0.0125, slide: 'blk', frame: 'poly', grip: 'poly', rake: 0.38, gh: 0.1, gd: 0.036, hammer: 0, sights: 'glock' },
		m9: { xr: - 0.078, xf: 0.12, top: 0.019, bot: - 0.009, hz: 0.0122, slide: 'blk', frame: 'alu', grip: 'poly', rake: 0.3, gh: 0.1, gd: 0.036, hammer: 1, open: 1, sights: 'dots' },
		'1911': { xr: - 0.082, xf: 0.128, top: 0.018, bot: - 0.008, hz: 0.0112, slide: 'blued', frame: 'blued', grip: 'walnut', rake: 0.32, gh: 0.098, gd: 0.032, hammer: 1, beaver: 1, sights: 'plain' },
		p226: { xr: - 0.074, xf: 0.114, top: 0.021, bot: - 0.009, hz: 0.0125, slide: 'blk', frame: 'alu', grip: 'poly', rake: 0.3, gh: 0.1, gd: 0.037, hammer: 1, sights: 'tritium' },
		makarov: { xr: - 0.062, xf: 0.097, top: 0.018, bot: - 0.008, hz: 0.0112, slide: 'blued', frame: 'blued', grip: 'bakelite', rake: 0.3, gh: 0.088, gd: 0.032, hammer: 1, sights: 'plain' },
	}[ v ];
	const { xr, xf, top, bot, hz } = S;
	const sightH = top + 0.006;
	const slide = P.sub( 'slide', 0, 0, 0 );
	if ( S.open ) {
		// M9: an open-top slide, the barrel showing along the top, the decocking safety levers at the back
		slide.extFront( S.slide, [ [ - hz, bot ], [ hz, bot ], [ hz, top - 0.004, 0.003 ], [ hz - 0.0035, top ], [ - hz + 0.0035, top ], [ - hz, top - 0.004, 0.003 ] ], xr, 0.004, 0.0006 );
		for ( const s of [ - 1, 1 ] ) slide.ext( S.slide, [ [ 0.004, bot ], [ xf - 0.024, bot ], [ xf - 0.024, top - 0.006, 0.002 ], [ 0.004, top - 0.006, 0.002 ] ], s > 0 ? hz - 0.004 : - hz, s > 0 ? hz : - hz + 0.004, 0.0006 );
		slide.extFront( S.slide, [ [ - hz, bot ], [ hz, bot ], [ hz, top - 0.004, 0.003 ], [ hz - 0.0035, top ], [ - hz + 0.0035, top ], [ - hz, top - 0.004, 0.003 ] ], xf - 0.025, xf, 0.0006 );
		slide.box( S.slide, 0.004, xf - 0.024, bot, bot + 0.006, - hz, hz, 0.0005 );
		slide.cyl( 'steel', - 0.03, xf - 0.022, 0.0072, 0.006, 0, 14 );
		slide.cyl( 'rubber', xf - 0.0003, xf + 0.0003, 0.0034, bot + 0.0048, 0, 10 );
		slide.box( 'poly', xr - 0.0007, xr + 0.001, bot + 0.004, top - 0.004, - hz + 0.0028, hz - 0.0028, 0.001 );
		for ( const s of [ - 1, 1 ] ) slide.extS( 'blk', [ [ xr + 0.008, top - 0.007 ], [ xr + 0.022, top - 0.006, 0.002 ], [ xr + 0.022, top - 0.002 ], [ xr + 0.006, top - 0.001, 0.002 ] ], 0.0015, 0.0005, s * ( hz + 0.0012 ) );
		slide.box( 'blk', - 0.034, - 0.016, top - 0.0095, top - 0.0055, hz - 0.0003, hz + 0.0006, 0.0003 );
	} else closedSlide( slide, S.slide, xr, xf, bot, top, hz, v === '1911' || v === 'makarov' );
	serrations( slide, xr + 0.005, v === '1911' ? 9 : 7, bot + 0.004, top - 0.0045, hz, v === '1911' ? 0.0028 : 0.0036, v === 'makarov' ? - 0.25 : 0 );
	slideSights( slide, xr + 0.006, xf - 0.006, top, sightH, S.sights );
	// barrel crown and bore (the 1911: the barrel bushing round it, the recoil spring plug under)
	P.cyl( 'blued', xf - 0.004, xf + 0.0006, 0.0064, 0.0, 0, 16 );
	P.cyl( 'rubber', xf + 0.0006, xf + 0.0009, 0.0046, 0.0, 0, 12 );
	if ( v === '1911' ) {
		slide.lathe( 'blued', [ [ xf - 0.002, 0.0088 ], [ xf + 0.0012, 0.0088 ], [ xf + 0.0012, 0.0066 ] ], 0, 0, 16 );
		slide.cyl( 'blued', xf - 0.002, xf + 0.001, 0.0048, - 0.0045, 0, 12 );
	}
	// frame: dust cover (with a rail and its cross slot on the modern guns), the controls, the pins
	P.box( S.frame, xr + 0.006, xf - 0.012, - 0.026, bot + 0.002, - hz + 0.0008, hz - 0.0008, 0.003 );
	if ( v !== '1911' && v !== 'makarov' ) {
		P.box( S.frame, 0.035, xf - 0.014, - 0.032, - 0.024, - 0.01, 0.01, 0.001 );
		for ( const x of [ 0.056, 0.076 ] ) P.box( 'rubber', x, x + 0.005, - 0.0325, - 0.027, - 0.0102, 0.0102, 0 );
	}
	// slide stop (left), takedown lever (both sides), magazine catch (left), frame pins
	P.extS( 'blk', [ [ - 0.004, - 0.0105 ], [ 0.02, - 0.0105 ], [ 0.022, - 0.0125, 0.001 ], [ 0.004, - 0.0135 ], [ - 0.004, - 0.0135, 0.001 ] ], 0.0006, 0.0003, - hz - 0.0005 );
	for ( const s of [ - 1, 1 ] ) P.box( 'blk', 0.011, 0.018, - 0.0165, - 0.0115, s > 0 ? hz - 0.0012 : - hz - 0.0004, s > 0 ? hz + 0.0004 : - hz + 0.0012, 0.0004 );
	P.box( S.frame === 'poly' ? 'poly' : 'blk', - 0.03, - 0.023, - 0.031, - 0.024, - hz - 0.001, - hz + 0.001, 0.0008 );
	for ( const [ x, y ] of [ [ - 0.011, - 0.016 ], [ 0.006, - 0.021 ], [ - 0.052, - 0.027 ] ] ) P.cylZ( 'steel', x, y, - hz + 0.0004, hz - 0.0004, 0.0013, 8 );
	triggerGuard( P, S.frame === 'poly' ? 'poly' : S.frame, - 0.022, 0.034, - 0.022, 0.027, 0.0045 );
	const tr = trigger( P, 0.0, - 0.022, 0.017 );
	// the Glock's trigger safety: a blade down the middle of the shoe
	if ( v === 'glock' ) tr.extS( 'blk', [ [ 0.0025, - 0.026 ], [ 0.0045, - 0.026 ], [ 0.0, - 0.037, 0.003 ], [ - 0.0015, - 0.036 ] ], 0.0007, 0.0002 );
	const gtx = - 0.024, gty = - 0.018;
	const g = pistolGrip( P, S.frame === 'poly' ? 'poly' : S.frame, gtx, gty, S.gh, S.rake, S.gd, S.gd * 0.96, hz - 0.001, 0.004, v === 'glock' ? 1 : 0 );
	const sx = Math.sin( S.rake ), cy = Math.cos( S.rake );
	if ( S.grip !== S.frame ) {
		// grip panels (checkered), the 1911's with two screws each
		const panel = [ [ gtx - 0.005 - sx * 0.01, gty - cy * 0.01 ], [ gtx - S.gd + 0.004 - sx * 0.01, gty - cy * 0.01 ], [ gtx - S.gd + 0.004 - sx * ( S.gh - 0.008 ), gty - cy * ( S.gh - 0.008 ), 0.006 ], [ gtx - 0.005 - sx * ( S.gh - 0.008 ), gty - cy * ( S.gh - 0.008 ), 0.006 ] ];
		const pm = S.grip === 'walnut' ? 'walnutC' : S.grip === 'bakelite' ? 'bakelite' : 'poly';
		for ( const s of [ - 1, 1 ] ) P.ext( pm, panel, s * ( hz - 0.002 ), s * ( hz + 0.0018 ), 0.0012, [], 3 );
		if ( v === '1911' ) for ( const s of [ - 1, 1 ] ) for ( const t of [ 0.022, 0.078 ] ) screw( P, gtx - S.gd * 0.5 - sx * t, gty - cy * t, s * ( hz + 0.0018 ), 'z', s, 0.0024, 'blued' );
		if ( v === 'makarov' ) for ( const s of [ - 1, 1 ] ) P.cylZ( 'bakelite', gtx - S.gd * 0.5 - sx * 0.022, gty - cy * 0.022, s * ( hz + 0.0016 ), s * ( hz + 0.0026 ), 0.004, 12 );
	} else {
		// the moulded grip's texture panel and the Glock's backstrap ridge
		for ( const s of [ - 1, 1 ] ) P.extS( 'polyT', [ [ gtx - 0.007 - sx * 0.024, gty - cy * 0.024 ], [ gtx - S.gd + 0.006 - sx * 0.024, gty - cy * 0.024 ], [ gtx - S.gd + 0.008 - sx * 0.08, gty - cy * 0.08, 0.004 ], [ gtx - 0.007 - sx * 0.08, gty - cy * 0.08, 0.004 ] ], 0.0004, 0.0002, s * ( hz - 0.0008 ) );
	}
	// beavertail: the 1911's grip safety; a small tang on the others
	if ( S.beaver ) {
		P.extS( S.frame, [ [ xr + 0.004, - 0.01 ], [ xr - 0.02, - 0.021, 0.008 ], [ xr - 0.011, - 0.03 ], [ xr + 0.012, - 0.026 ] ], hz - 0.002, 0.002 );
		P.extS( S.frame, [ [ xr + 0.008, - 0.024 ], [ xr + 0.002, - 0.05, 0.006 ], [ xr + 0.008, - 0.07 ], [ xr + 0.014, - 0.03 ] ], hz - 0.003, 0.0015 );
		// thumb safety (left) with its shelf, the checkered mag catch
		P.extS( 'blued', [ [ xr + 0.012, - 0.008 ], [ xr + 0.034, - 0.006, 0.002 ], [ xr + 0.034, - 0.011, 0.002 ], [ xr + 0.016, - 0.014, 0.004 ] ], 0.0012, 0.0004, - hz - 0.001 );
		P.cylZ( 'blued', - 0.026, - 0.028, - hz - 0.0016, - hz, 0.0042, 12 );
	} else P.extS( S.frame === 'poly' ? 'poly' : S.frame, [ [ xr + 0.006, - 0.012 ], [ xr - 0.006, - 0.016, 0.004 ], [ xr - 0.002, - 0.022 ], [ xr + 0.012, - 0.022 ] ], hz - 0.0015, 0.0015 );
	if ( v === 'p226' ) P.extS( 'blk', [ [ - 0.034, - 0.016 ], [ - 0.016, - 0.019, 0.002 ], [ - 0.016, - 0.024, 0.002 ], [ - 0.034, - 0.022 ] ], 0.001, 0.0004, - hz - 0.0006 );
	if ( v === 'makarov' ) {
		// the safety / decocker on the slide's left, the hinged trigger guard's lip, the heel mag catch
		slide.extS( 'blued', [ [ xr + 0.006, 0.006 ], [ xr + 0.024, 0.008, 0.003 ], [ xr + 0.024, 0.013, 0.003 ], [ xr + 0.006, 0.012 ] ], 0.0012, 0.0004, - hz - 0.001 );
		P.box( 'blued', g.bottom.x - 0.012, g.bottom.x - 0.004, g.bottom.y - 0.002, g.bottom.y + 0.006, - 0.005, 0.005, 0.0015 );
	}
	if ( S.hammer ) {
		const h = P.sub( 'hammer', xr + 0.004, - 0.004, 0 );
		h.extS( 'blued', [ [ xr + 0.006, - 0.008 ], [ xr + 0.006, 0.006 ], [ xr - 0.006, 0.016, 0.004 ], [ xr - 0.012, 0.012 ], [ xr - 0.004, 0.0 ], [ xr - 0.002, - 0.01 ] ], 0.0035, 0.001 );
		for ( let i = 0; i < 3; i ++ ) h.box( 'blued', xr - 0.0105 + i * 0.0032, xr - 0.0092 + i * 0.0032, 0.011 + i * 0.0016, 0.0145 + i * 0.0016, - 0.0036, 0.0036, 0 );
	}
	return {
		P, info: {
			sightH, rearX: xr + 0.006, eyeBack: 0.34, muzzle: [ xf + 0.002, 0, 0 ], eject: [ 0.0, top - 0.004, 0.012 ],
			mag: { p: [ gtx - S.gd * 0.5 + 0.002, gty + 0.002, 0 ], rake: - S.rake }, light: v === 'glock' || v === 'm9' || v === 'p226' ? [ 0.075, - 0.034, 0 ] : null, lightDown: 1,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.017, { trig: [ 0.0, - 0.03, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.012 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.026, { support: 1 } ),
			},
			stock: 0, len: xf - xr + 0.1, slide: 'slide', slideTravel: 0.034,
		},
	};
}

// ---- Desert Eagle Mark XIX .50 AE ----
// The fixed barrel (triangular, fluted, a rail along its top) carries the front sight; the short slide rides the frame
// behind it; a big frame with a long guard, ambidextrous safeties on the slide, the wraparound rubber grip, the hammer.
function deagle() {
	const P = new Parts();
	const xr = - 0.095, xf = 0.032, top = 0.028, bot = - 0.01, hz = 0.0165, sightH = 0.038;
	// barrel: the triangular block, its side flutes, the rail on top, the muzzle and its crown, the front sight
	P.extFront( 'steel', [ [ - 0.0125, - 0.013 ], [ 0.0125, - 0.013 ], [ 0.0125, 0.012, 0.003 ], [ 0.0065, 0.029, 0.002 ], [ - 0.0065, 0.029, 0.002 ], [ - 0.0125, 0.012, 0.003 ] ], 0.028, 0.17, 0.0015 );
	for ( const s of [ - 1, 1 ] ) for ( const y of [ - 0.004, 0.006 ] ) P.extS( 'rubber', slot( 0.05, 0.15, y, 0.0022, 3 ), 0.0004, 0.0002, s * 0.0126 );
	P.rail( 'steel', 0.034, 0.152, 0.033, 0.0062 );
	P.cyl( 'rubber', 0.1698, 0.1705, 0.0062, 0.0, 0, 12 );
	P.box( 'steel', 0.156, 0.166, 0.032, 0.035, - 0.0045, 0.0045, 0.0008 );
	P.extS( 'blk', [ [ 0.157, 0.034 ], [ 0.165, 0.034 ], [ 0.164, sightH, 0.001 ], [ 0.1585, sightH ] ], 0.0014, 0.0004 );
	P.box( 'white', 0.1572, 0.1578, sightH - 0.0026, sightH - 0.0008, - 0.0009, 0.0009, 0 );
	// slide: the rear section, serrations, safeties, the rear sight; it carries the bolt behind the barrel
	const slide = P.sub( 'slide', 0, 0, 0 );
	slide.extFront( 'steel', [ [ - hz, bot ], [ hz, bot ], [ hz, top - 0.008, 0.003 ], [ hz - 0.005, top ], [ - hz + 0.005, top ], [ - hz, top - 0.008, 0.003 ] ], xr, xf, 0.0008 );
	serrations( slide, xr + 0.006, 8, bot + 0.004, top - 0.008, hz, 0.0045 );
	serrations( slide, xf - 0.03, 5, bot + 0.004, top - 0.008, hz, 0.0045 );
	for ( const s of [ - 1, 1 ] ) slide.extS( 'blk', [ [ xr + 0.004, top - 0.012 ], [ xr + 0.026, top - 0.011, 0.003 ], [ xr + 0.026, top - 0.005 ], [ xr + 0.002, top - 0.004, 0.003 ] ], 0.0018, 0.0006, s * ( hz + 0.0016 ) );
	slideSights( slide, xr + 0.009, null, top, sightH, 'dots' );
	slide.box( 'rubber', - 0.04, 0.01, top - 0.0185, top - 0.008, hz - 0.0004, hz + 0.0004, 0.002 );
	slide.box( 'poly', xr - 0.0008, xr + 0.001, bot + 0.005, top - 0.006, - hz + 0.003, hz - 0.003, 0.001 );
	// frame: the dust cover under the barrel, the long guard, the controls; the grip
	P.extS( 'steel', [ [ xr + 0.012, - 0.01 ], [ 0.152, - 0.01 ], [ 0.152, - 0.026, 0.004 ], [ 0.05, - 0.028 ], [ - 0.022, - 0.026 ], [ xr + 0.012, - 0.03, 0.004 ] ], 0.0135, 0.0015 );
	triggerGuard( P, 'steel', - 0.022, 0.045, - 0.026, 0.032, 0.0052 );
	trigger( P, 0.0, - 0.026, 0.017 );
	P.extS( 'blk', [ [ - 0.004, - 0.012 ], [ 0.03, - 0.012 ], [ 0.032, - 0.015, 0.001 ], [ 0.004, - 0.016 ] ], 0.0007, 0.0003, - 0.0142 );
	P.cylZ( 'blk', - 0.028, - 0.034, - 0.0148, - 0.0132, 0.0045, 12 );
	pins( P, [ [ - 0.012, - 0.02, 0.0016 ], [ 0.012, - 0.022, 0.0016 ] ], 0.0135 );
	const gtx = - 0.024, gty = - 0.018, gd = 0.044, rake = 0.3;
	const g = pistolGrip( P, 'rubber', gtx, gty, 0.108, rake, gd, gd * 0.96, 0.0165, 0.0055, 1 );
	const h = P.sub( 'hammer', xr + 0.004, - 0.004, 0 );
	h.extS( 'steel', [ [ xr + 0.006, - 0.008 ], [ xr + 0.006, 0.008 ], [ xr - 0.008, 0.02, 0.004 ], [ xr - 0.014, 0.015 ], [ xr - 0.004, 0.0 ], [ xr - 0.002, - 0.01 ] ], 0.0042, 0.0012 );
	return { P, info: {
		sightH, rearX: xr + 0.009, eyeBack: 0.34, muzzle: [ 0.1705, 0, 0 ], eject: [ 0.0, top - 0.004, 0.012 ],
		mag: { p: [ gtx - gd * 0.5 + 0.002, gty + 0.002, 0 ], rake: - rake }, light: null, lightDown: 1,
		grips: {
			R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.017, { trig: [ 0.0, - 0.03, 0 ] } ),
			L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.012 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.026, { support: 1 } ),
		},
		stock: 0, len: xf - xr + 0.1, slide: 'slide', slideTravel: 0.034,
	} };
}

// ---- Ruger Mark IV .22 ----
// A tubular receiver flat on top with an adjustable rear sight, the tapered bull barrel and its front blade, the bolt
// ('slide': it cycles) with the cocking ears out the back, the grip frame raked steeply like a Luger's.
function ruger() {
	const P = new Parts();
	const xr = - 0.075, top = 0.02, sightH = 0.026;
	P.lathe( 'blk', [ [ xr, 0 ], [ xr, 0.0118 ], [ xr + 0.002, 0.0128 ], [ 0.045, 0.0128 ], [ 0.047, 0.0118 ], [ 0.047, 0 ] ], 0.008, 0, 20 );
	P.box( 'blk', xr + 0.004, 0.045, 0.016, 0.0205, - 0.0075, 0.0075, 0.0012 );
	P.lathe( 'blk', [ [ 0.045, 0 ], [ 0.045, 0.0118 ], [ 0.06, 0.0112 ], [ 0.162, 0.0102 ], [ 0.166, 0.0094 ], [ 0.166, 0.0028 ], [ 0.165, 0 ] ], 0.004, 0, 20 );
	P.cyl( 'rubber', 0.1658, 0.1664, 0.0028, 0.004, 0, 10 );
	P.box( 'blk', xr, 0.165, - 0.006, 0.004, - 0.0088, 0.0088, 0.002 );
	P.box( 'rubber', - 0.03, 0.008, 0.003, 0.015, 0.0124, 0.013, 0.0015 );
	// rear sight (adjustable, on the receiver), front blade on the barrel
	P.box( 'blk', xr + 0.004, xr + 0.018, 0.0195, 0.0225, - 0.0072, 0.0072, 0.0012 );
	slideSights( P, xr + 0.01, 0.16, 0.0215, sightH, 'plain' );
	P.cylZ( 'steel', xr + 0.012, 0.0215, 0.0072, 0.0088, 0.0018, 8 );
	// bolt with its ears, out the back of the receiver
	const slide = P.sub( 'slide', 0, 0, 0 );
	slide.cyl( 'steel', xr - 0.006, xr + 0.004, 0.0072, 0.008, 0, 14 );
	slide.box( 'steel', xr - 0.008, xr + 0.002, 0.003, 0.0135, - 0.0145, 0.0145, 0.0018 );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 3; i ++ ) slide.box( 'rubber', xr - 0.007 + i * 0.003, xr - 0.006 + i * 0.003, 0.004, 0.0125, s * 0.0144, s * 0.0148, 0 );
	// grip frame, guard, trigger, the mag release behind the guard, the safety lever
	P.box( 'blk', xr + 0.01, 0.05, - 0.024, - 0.004, - 0.0105, 0.0105, 0.003 );
	triggerGuard( P, 'blk', - 0.022, 0.034, - 0.022, 0.027, 0.0045 );
	trigger( P, 0.0, - 0.022, 0.017 );
	const gtx = - 0.024, gty = - 0.018, gd = 0.036, rake = 0.55;
	const g = pistolGrip( P, 'blk', gtx, gty, 0.1, rake, gd, gd * 0.96, 0.0105, 0.003, 0 );
	const sx = Math.sin( rake ), cy = Math.cos( rake );
	const panel = [ [ gtx - 0.005 - sx * 0.01, gty - cy * 0.01 ], [ gtx - gd + 0.004 - sx * 0.01, gty - cy * 0.01 ], [ gtx - gd + 0.004 - sx * 0.092, gty - cy * 0.092, 0.006 ], [ gtx - 0.005 - sx * 0.092, gty - cy * 0.092, 0.006 ] ];
	for ( const s of [ - 1, 1 ] ) P.ext( 'poly', panel, s * 0.0095, s * 0.0135, 0.0012, [], 3 );
	P.extS( 'blk', [ [ - 0.06, - 0.004 ], [ - 0.044, - 0.004, 0.002 ], [ - 0.044, - 0.01, 0.002 ], [ - 0.06, - 0.01 ] ], 0.0012, 0.0004, - 0.0118 );
	P.cylZ( 'blk', - 0.03, - 0.026, - 0.0115, 0.0115, 0.003, 10 );
	return { P, info: {
		sightH, rearX: xr + 0.01, eyeBack: 0.34, muzzle: [ 0.1664, 0, 0 ], eject: [ 0.0, top - 0.004, 0.012 ],
		mag: { p: [ gtx - gd * 0.5 + 0.002, gty + 0.002, 0 ], rake: - rake }, light: null, lightDown: 1,
		grips: {
			R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.017, { trig: [ 0.0, - 0.03, 0 ] } ),
			L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.012 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.026, { support: 1 } ),
		},
		stock: 0, len: 0.115 + 0.1, slide: 'slide', slideTravel: 0.025,
	} };
}

// ---- revolvers ----
// A solid frame with its top strap over the cylinder window, the recoil shield and the side plate's screws, the latch;
// the barrel with its rib and full-length underlug shrouding the ejector rod; the crane ('crane') swinging the cylinder
// ('cyl': fluted, the chamber mouths at the front, the extractor star at the back) out to the left; the hammer
// ('hammer') with its checkered spur; an adjustable rear sight and a ramp with a red insert; a finger-grooved grip.
export function revolver( o ) {
	const P = new Parts();
	const big = o.v === '44';
	const mat = big ? 'steel' : 'blued';
	const bl = big ? 0.155 : 0.1;
	const cx0 = - 0.034, cx1 = 0.01, cy = - 0.0135, cr = big ? 0.0205 : 0.0195, sightH = 0.0195;
	const fz = 0.0125;
	// frame: the top strap over the cylinder's window, the front round the barrel's shank sweeping back under the
	// yoke, the bottom into the guard, the back curving up from the grip behind the hammer (its slot on top)
	P.extS( mat, [ [ cx0 - 0.012, 0.0165, 0.003 ], [ cx1 + 0.012, 0.0165, 0.002 ], [ cx1 + 0.0165, 0.012, 0.002 ], [ cx1 + 0.0165, - 0.007 ],
		[ cx1 + 0.012, - 0.027, 0.006 ], [ cx1 + 0.001, - 0.037, 0.004 ], [ - 0.014, - 0.0385 ], [ - 0.038, - 0.041, 0.004 ], [ - 0.06, - 0.033, 0.008 ],
		[ cx0 - 0.027, - 0.012, 0.012 ], [ cx0 - 0.021, 0.008, 0.008 ] ], fz, 0.0015,
		0, [ [ [ cx0 - 0.001, 0.0065 ], [ cx1 + 0.001, 0.0065 ], [ cx1 + 0.001, - 0.0335 ], [ cx0 - 0.001, - 0.0335 ] ] ] );
	P.box( 'rubber', cx0 - 0.024, cx0 - 0.01, 0.004, 0.0168, - 0.0036, 0.0036, 0 );
	P.box( mat, cx0 - 0.002, cx1 + 0.002, 0.012, 0.018, - 0.0098, 0.0098, 0.003 );
	P.box( mat, cx0 - 0.0035, cx0 - 0.0005, - 0.032, 0.006, - 0.0118, 0.0118, 0.0015 );
	// side plate seam and screws (right), the cylinder latch (left)
	P.extS( 'rubber', [ [ cx0 - 0.02, 0.006 ], [ cx0 - 0.006, 0.006 ], [ cx0 - 0.006, - 0.03 ], [ cx0 - 0.02, - 0.028 ] ], 0.0002, 0.0001, fz );
	for ( const [ x, y ] of [ [ cx0 - 0.016, 0.002 ], [ cx0 - 0.012, - 0.024 ], [ cx1 + 0.008, - 0.03 ] ] ) screw( P, x, y, fz, 'z', 1, 0.0019, mat );
	P.extS( mat, [ [ cx0 - 0.02, - 0.004 ], [ cx0 - 0.007, - 0.004, 0.002 ], [ cx0 - 0.007, - 0.011, 0.002 ], [ cx0 - 0.02, - 0.011 ] ], 0.0012, 0.0004, - fz - 0.0012 );
	for ( let i = 0; i < 4; i ++ ) P.box( 'rubber', cx0 - 0.018 + i * 0.003, cx0 - 0.017 + i * 0.003, - 0.0105, - 0.0045, - fz - 0.0025, - fz - 0.0022, 0 );
	// barrel: the round tube, the rib on top with the ramp and its insert, the full underlug
	P.lathe( mat, [ [ cx1 + 0.01, 0 ], [ cx1 + 0.01, 0.0098 ], [ cx1 + 0.012 + bl, 0.0098 ], [ cx1 + 0.012 + bl, 0.0042 ], [ cx1 + 0.0112 + bl, 0 ] ], 0, 0, 18 );
	P.cyl( 'rubber', cx1 + 0.0118 + bl, cx1 + 0.0124 + bl, 0.0042, 0, 0, 10 );
	P.extFront( mat, [ [ - 0.0052, 0.004 ], [ 0.0052, 0.004 ], [ 0.0048, 0.0125, 0.0012 ], [ - 0.0048, 0.0125, 0.0012 ] ], cx1 + 0.01, cx1 + 0.012 + bl, 0.0006 );
	for ( let i = 0; i < Math.floor( bl / 0.006 ); i ++ ) P.box( 'rubber', cx1 + 0.014 + i * 0.006, cx1 + 0.0155 + i * 0.006, 0.0124, 0.0127, - 0.003, 0.003, 0 );
	P.extFront( mat, [ [ - 0.0078, - 0.004 ], [ 0.0078, - 0.004 ], [ 0.0078, - 0.022, 0.004 ], [ - 0.0078, - 0.022, 0.004 ] ], cx1 + 0.01, cx1 + 0.012 + bl, 0.0012 );
	P.extS( mat, [ [ cx1 + bl - 0.012, 0.0125 ], [ cx1 + bl + 0.01, 0.0125 ], [ cx1 + bl + 0.01, sightH, 0.002 ], [ cx1 + bl - 0.004, sightH - 0.0004 ] ], 0.0016, 0.0005 );
	P.box( 'fiber', cx1 + bl + 0.0045, cx1 + bl + 0.0085, sightH - 0.0028, sightH - 0.0002, - 0.0017, 0.0017, 0 );
	// adjustable rear sight on the top strap
	P.box( 'blk', cx0 - 0.014, cx0 + 0.006, 0.016, 0.0205, - 0.0055, 0.0055, 0.0012 );
	P.extFront( 'blk', [ [ - 0.0058, 0.016 ], [ 0.0058, 0.016 ], [ 0.0058, sightH + 0.0018, 0.001 ], [ 0.0015, sightH + 0.0018 ], [ 0.0015, sightH - 0.002 ], [ - 0.0015, sightH - 0.002 ], [ - 0.0015, sightH + 0.0018 ], [ - 0.0058, sightH + 0.0018, 0.001 ] ], cx0 - 0.012, cx0 - 0.007, 0.0004 );
	P.cylZ( 'steel', cx0 - 0.0035, 0.018, 0.0055, 0.0068, 0.0016, 8 );
	// crane and cylinder (swing out to the left)
	const crane = P.sub( 'crane', cx1, - 0.032, - 0.006 );
	crane.box( mat, cx1 - 0.002, cx1 + 0.009, - 0.036, - 0.018, - 0.009, 0.004, 0.002 );
	crane.cyl( mat, cx1, cx1 + bl * 0.9, 0.0032, - 0.021, 0, 10 ); // ejector rod
	crane.cyl( mat, cx1 + bl * 0.9, cx1 + bl * 0.9 + 0.006, 0.0044, - 0.021, 0, 12 );
	const cyl = crane.sub( 'cyl', 0, cy, 0 );
	cyl.lathe( mat, [ [ cx0, 0 ], [ cx0, cr * 0.82 ], [ cx0 + 0.002, cr ], [ cx1 - 0.002, cr ], [ cx1, cr * 0.9 ], [ cx1, 0 ] ], cy, 0, 24 );
	cyl.cyl( mat, cx0 - 0.0018, cx0 + 0.0002, cr * 0.84, cy, 0, 18 );
	for ( let i = 0; i < 6; i ++ ) {
		// flutes between the chambers, the chamber mouths at the front, the rims in the star at the back
		const a = i / 6 * PI * 2 + PI / 6;
		cyl.boxC( big ? 'satin' : 'rubber', ( cx0 + cx1 ) / 2 + 0.003, cy + Math.sin( a ) * cr * 0.99, Math.cos( a ) * cr * 0.99, 0.024, 0.0044, 0.0036, 0.0016, [ a, 0, 0 ] );
		const b = i / 6 * PI * 2;
		cyl.cyl( 'rubber', cx1 - 0.0004, cx1 + 0.0004, 0.0047, cy + Math.sin( b ) * cr * 0.6, Math.cos( b ) * cr * 0.6, 10 );
		cyl.cyl( 'brass', cx0 - 0.002, cx0 - 0.0016, 0.0056, cy + Math.sin( b ) * cr * 0.6, Math.cos( b ) * cr * 0.6, 10 );
	}
	// hammer with its checkered spur, trigger, guard
	const h = P.sub( 'hammer', cx0 - 0.016, 0.002, 0 );
	h.extS( mat, [ [ cx0 - 0.012, - 0.006 ], [ cx0 - 0.012, 0.012 ], [ cx0 - 0.03, 0.022, 0.004 ], [ cx0 - 0.034, 0.016 ], [ cx0 - 0.022, 0.004 ], [ cx0 - 0.02, - 0.01 ] ], 0.0035, 0.0012 );
	for ( let i = 0; i < 4; i ++ ) h.box( mat, cx0 - 0.0335 + i * 0.0035, cx0 - 0.0322 + i * 0.0035, 0.0165 + i * 0.0012, 0.0205 + i * 0.0012, - 0.0036, 0.0036, 0 );
	triggerGuard( P, mat, - 0.025, 0.012, - 0.036, 0.024, 0.004 );
	trigger( P, - 0.008, - 0.038, 0.016 );
	// grip: the frame's strap, the stocks (wood on the .357, finger-grooved rubber on the .44)
	const g = pistolGrip( P, big ? 'rubber' : 'walnut', - 0.036, - 0.034, 0.092, 0.26, 0.03, 0.036, 0.0165, 0.0065, big ? 1 : 0 );
	if ( ! big ) for ( const s of [ - 1, 1 ] ) {
		P.extS( 'walnutC', [ [ - 0.044, - 0.05 ], [ - 0.066, - 0.046 ], [ - 0.078, - 0.096, 0.006 ], [ - 0.056, - 0.1, 0.006 ] ], 0.0006, 0.0003, s * 0.0165 );
		screw( P, - 0.054, - 0.072, s * 0.0166, 'z', s, 0.0026, 'steel' );
	}
	return {
		P, info: {
			sightH, rearX: cx0 - 0.0095, eyeBack: 0.36, muzzle: [ cx1 + 0.0124 + bl, 0, 0 ], eject: null,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.018, { trig: [ - 0.008, - 0.045, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.013 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.027, { support: 1 } ),
			},
			cylAxis: [ 0, cy, 0 ], cylR: cr, stock: 0, len: bl + 0.15, crane: 'crane', cyl: 'cyl', hammer: 'hammer',
		},
	};
}

// ---- flare pistol (an Orion-style 12-gauge signal pistol) ----
// Orange moulded plastic: the fat barrel drops open on its hinge ('barrels'), the hammer, the guard and grip moulded in.
export function flareGun() {
	const P = new Parts();
	const b = P.sub( 'barrels', 0.0, - 0.018, 0 );
	b.lathe( 'orange', [ [ - 0.005, 0 ], [ - 0.005, 0.0175 ], [ 0.12, 0.0175 ], [ 0.124, 0.0205 ], [ 0.136, 0.0205 ], [ 0.138, 0.0185 ], [ 0.138, 0.012 ], [ 0.134, 0.0115 ], [ 0.134, 0 ] ], 0.004, 0, 20 );
	b.cyl( 'rubber', 0.1335, 0.1342, 0.0112, 0.004, 0, 14 );
	for ( let i = 0; i < 4; i ++ ) b.lathe( 'orange', [ [ 0.02 + i * 0.025, 0.0175 ], [ 0.024 + i * 0.025, 0.0186 ], [ 0.028 + i * 0.025, 0.0175 ] ], 0.004, 0, 20 );
	b.box( 'orange', 0.0, 0.1, - 0.016, - 0.006, - 0.008, 0.008, 0.003 );
	b.box( 'orange', 0.11, 0.122, 0.02, 0.026, - 0.0016, 0.0016, 0.0005 );
	P.extS( 'orange', [ [ - 0.058, - 0.018 ], [ 0.006, - 0.018 ], [ 0.006, 0.0, 0.004 ], [ - 0.004, 0.022, 0.006 ], [ - 0.05, 0.022, 0.006 ], [ - 0.058, 0.012, 0.004 ] ], 0.0135, 0.0045 );
	P.cylZ( 'blk', - 0.002, - 0.012, - 0.0142, 0.0142, 0.0032, 10 );
	P.box( 'blk', - 0.02, - 0.006, 0.0, 0.006, - 0.0142, - 0.0132, 0.001 );
	const h = P.sub( 'hammer', - 0.05, 0.015, 0 );
	h.extS( 'blk', [ [ - 0.048, 0.008 ], [ - 0.048, 0.022 ], [ - 0.06, 0.03, 0.003 ], [ - 0.064, 0.026 ], [ - 0.056, 0.016 ], [ - 0.054, 0.006 ] ], 0.004, 0.0012 );
	triggerGuard( P, 'orange', - 0.03, 0.02, - 0.018, 0.026, 0.005 );
	trigger( P, - 0.012, - 0.02, 0.016 );
	const g = pistolGrip( P, 'orange', - 0.028, - 0.016, 0.092, 0.35, 0.032, 0.036, 0.0145, 0.005, 1 );
	return {
		P, info: {
			sightH: 0.026, rearX: - 0.05, eyeBack: 0.3, muzzle: [ 0.138, 0.004, 0 ], eject: null,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.017, { trig: [ - 0.012, - 0.026, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.013 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.026, { support: 1 } ),
			},
			stock: 0, len: 0.25, barrels: 'barrels', breakAxis: 'z', breakAngle: - 0.7,
		},
	};
}
