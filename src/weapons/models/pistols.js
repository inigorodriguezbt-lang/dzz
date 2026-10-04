// Handguns: self-loading pistols, revolvers, the flare pistol.
import { PI, Parts, grip, pistolGrip, trigger, triggerGuard } from './kit.js';

// ---- pistols ----
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
	sl.box( 'blk', px0 - 0.017, px0 - 0.002, top - 0.0092, top - 0.0056, hz - 0.0003, hz + 0.0006, 0.0003 );
	sl.box( 'poly', xr - 0.0007, xr + 0.001, bot + 0.004, top - 0.004, - hz + 0.0028, hz - 0.0028, 0.001 );
	sl.cyl( 'rubber', xr - 0.0009, xr - 0.0005, 0.0019, 0.004, 0, 10 );
	sl.cyl( 'rubber', xf - 0.0003, xf + 0.0003, 0.0034, bot + 0.0048, 0, 10 );
}

export function pistol( o ) {
	const P = new Parts();
	const v = o.v || 'glock';
	const S = {
		glock: { xr: - 0.07, xf: 0.113, top: 0.021, bot: - 0.009, hz: 0.0125, sb: 0.003, slide: 'blk', frame: 'poly', grip: 'poly', rake: 0.38, gh: 0.1, gd: 0.036, hammer: 0 },
		m9: { xr: - 0.078, xf: 0.12, top: 0.019, bot: - 0.009, hz: 0.0122, sb: 0.004, slide: 'blk', frame: 'alu', grip: 'poly', rake: 0.3, gh: 0.1, gd: 0.036, hammer: 1, open: 1 },
		'1911': { xr: - 0.082, xf: 0.128, top: 0.018, bot: - 0.008, hz: 0.0112, sb: 0.002, slide: 'blued', frame: 'blued', grip: 'walnut', rake: 0.32, gh: 0.098, gd: 0.032, hammer: 1, beaver: 1 },
		p226: { xr: - 0.074, xf: 0.114, top: 0.021, bot: - 0.009, hz: 0.0125, sb: 0.006, slide: 'blk', frame: 'alu', grip: 'poly', rake: 0.3, gh: 0.1, gd: 0.037, hammer: 1 },
		deagle: { xr: - 0.095, xf: 0.032, top: 0.028, bot: - 0.01, hz: 0.0165, sb: 0.004, slide: 'steel', frame: 'steel', grip: 'rubber', rake: 0.3, gh: 0.108, gd: 0.044, hammer: 1, deagle: 1 },
		makarov: { xr: - 0.062, xf: 0.097, top: 0.018, bot: - 0.008, hz: 0.0112, sb: 0.007, slide: 'blued', frame: 'blued', grip: 'bakelite', rake: 0.3, gh: 0.088, gd: 0.032, hammer: 1 },
		ruger: { xr: - 0.075, xf: 0.04, top: 0.02, bot: - 0.006, hz: 0.012, sb: 0.004, slide: 'blk', frame: 'blk', grip: 'poly', rake: 0.55, gh: 0.1, gd: 0.036, hammer: 0, ruger: 1 },
	}[ v ];
	const { xr, xf, top, bot, hz } = S;
	const sightH = top + 0.006;
	const slide = P.sub( 'slide', 0, 0, 0 );
	if ( S.ruger ) {
		// tubular receiver + bull barrel, the bolt is the "slide"
		P.cyl( 'blk', xr, 0.045, 0.0125, 0.008, 0, 16 );
		P.cyl( 'blk', 0.045, 0.165, 0.0112, 0.004, 0, 16 );
		P.box( 'blk', xr, 0.165, - 0.006, 0.006, - 0.009, 0.009, 0.002 );
		slide.box( 'steel', xr - 0.006, xr + 0.004, 0.004, 0.018, - 0.013, 0.013, 0.002 );
		P.box( 'blk', xr + 0.004, xr + 0.016, 0.018, sightH + 0.002, - 0.007, 0.007, 0.001 );
		P.box( 'blk', 0.152, 0.16, 0.012, sightH, - 0.0014, 0.0014, 0.0005 );
		P.box( 'blk', xr + 0.01, 0.05, - 0.024, - 0.004, - 0.011, 0.011, 0.003 );
	} else if ( S.deagle ) {
		// fixed triangular barrel with a top rail, slide at the back
		P.extFront( S.frame, [ [ - 0.012, - 0.012 ], [ 0.012, - 0.012 ], [ 0.012, 0.012, 0.003 ], [ 0.006, 0.03, 0.002 ], [ - 0.006, 0.03, 0.002 ], [ - 0.012, 0.012, 0.003 ] ], 0.028, 0.17, 0.0015 );
		P.box( 'blk', 0.03, 0.168, 0.03, 0.034, - 0.0045, 0.0045, 0.0008 );
		P.cyl( 'blk', 0.168, 0.172, 0.005, 0.0, 0, 10 );
		slide.box( S.slide, xr, xf, bot, top, - hz, hz, S.sb );
		for ( let i = 0; i < 7; i ++ ) slide.box( 'blk', xr + 0.006 + i * 0.005, xr + 0.008 + i * 0.005, bot + 0.006, top - 0.004, - hz - 0.0005, hz + 0.0005, 0 );
		slide.box( 'blk', xr + 0.002, xr + 0.014, top, top + 0.008, - 0.006, 0.006, 0.001 );
		P.box( 'blk', 0.158, 0.164, 0.03, 0.04, - 0.0014, 0.0014, 0.0005 );
		P.box( S.frame, xr + 0.01, 0.12, - 0.03, - 0.01, - 0.013, 0.013, 0.004 );
	} else {
		// slide
		if ( S.open ) {
			// M9 open-top slide: side walls with the barrel exposed
			slide.box( S.slide, xr, 0.005, bot, top, - hz, hz, S.sb );
			slide.box( S.slide, 0.005, xf, bot, top - 0.006, - hz, hz, S.sb );
			slide.box( S.slide, xf - 0.022, xf, bot, top, - hz, hz, S.sb );
			slide.cyl( 'steel', 0.0, xf - 0.02, 0.0072, 0.004, 0, 12 );
			slide.box( 'blk', xr + 0.008, xr + 0.02, top - 0.004, top + 0.001, - hz - 0.001, hz + 0.001, 0.001 ); // decocker
		} else closedSlide( slide, S.slide, xr, xf, bot, top, hz, v === '1911' || v === 'makarov' );
		// rear cocking serrations: dark grooves
		for ( let i = 0; i < 7; i ++ ) for ( const s of [ - 1, 1 ] ) slide.box( 'rubber', xr + 0.005 + i * 0.0036, xr + 0.0062 + i * 0.0036, bot + 0.004, top - 0.0045, s * hz - 0.0004, s * hz + 0.0002, 0 );
		slide.box( 'blk', xr + 0.001, xr + 0.011, top - 0.001, sightH + 0.001, - 0.0065, 0.0065, 0.001 ); // rear sight
		slide.box( 'blk', xf - 0.013, xf - 0.006, top - 0.001, sightH, - 0.0016, 0.0016, 0.0006 ); // front sight
		slide.box( 'glowO', xf - 0.0105, xf - 0.0085, sightH - 0.0035, sightH - 0.0015, - 0.0017, 0.0017, 0 );
		for ( const s of [ - 1, 1 ] ) slide.box( 'glow', xr + 0.0035, xr + 0.0055, sightH - 0.0035, sightH - 0.0015, s * 0.0038 - 0.001, s * 0.0038 + 0.001, 0 );
		P.cyl( 'blued', xf - 0.004, xf + 0.0006, 0.0064, 0.0, 0, 14 ); // barrel crown and bore
		P.cyl( 'rubber', xf + 0.0006, xf + 0.0009, 0.0046, 0.0, 0, 12 );
		// frame with the dust cover rail
		P.box( S.frame, xr + 0.006, xf - 0.012, - 0.026, bot + 0.002, - hz + 0.0008, hz - 0.0008, 0.003 );
		if ( v !== '1911' && v !== 'makarov' ) {
			// dust cover rail with its cross slot
			P.box( S.frame, 0.035, xf - 0.014, - 0.032, - 0.024, - 0.01, 0.01, 0.001 );
			P.box( 'rubber', 0.056, 0.061, - 0.0325, - 0.027, - 0.0102, 0.0102, 0 );
		}
		// controls: slide stop (left), takedown lever (both sides), magazine catch (left), frame pins
		P.box( 'blk', - 0.004, 0.02, - 0.0135, - 0.0105, - hz - 0.0005, - hz + 0.0008, 0.0005 );
		for ( const s of [ - 1, 1 ] ) P.box( 'blk', 0.011, 0.018, - 0.0165, - 0.0115, s > 0 ? hz - 0.0012 : - hz - 0.0004, s > 0 ? hz + 0.0004 : - hz + 0.0012, 0.0004 );
		P.box( S.frame === 'poly' ? 'poly' : 'blk', - 0.03, - 0.023, - 0.031, - 0.024, - hz - 0.001, - hz + 0.001, 0.0008 );
		for ( const [ x, y ] of [ [ - 0.011, - 0.016 ], [ 0.006, - 0.021 ], [ - 0.052, - 0.027 ] ] ) P.cylZ( 'steel', x, y, - hz + 0.0004, hz - 0.0004, 0.0013, 8 );
		if ( v === '1911' ) { P.cylZ( 'blued', xf - 0.006, - 0.003, - 0.0105, 0.0105, 0.0085, 12 ); P.box( 'blued', - 0.02, 0.01, - 0.02, - 0.012, - 0.0125, - 0.011, 0.001 ); }
	}
	triggerGuard( P, S.frame === 'poly' ? 'poly' : S.frame, - 0.022, S.deagle ? 0.045 : 0.034, - 0.022, S.deagle ? 0.032 : 0.027, 0.0045 );
	trigger( P, 0.0, - 0.022, 0.017 );
	const gtx = - 0.024, gty = - 0.018;
	const g = pistolGrip( P, S.frame === 'poly' ? 'poly' : S.frame, gtx, gty, S.gh, S.rake, S.gd, S.gd * 0.96, hz - 0.001, 0.004, v === 'glock' ? 1 : 0 );
	if ( S.grip !== S.frame ) {
		// grip panels
		const sx = Math.sin( S.rake ), cy = Math.cos( S.rake );
		const panel = [ [ gtx - 0.005 - sx * 0.01, gty - cy * 0.01 ], [ gtx - S.gd + 0.004 - sx * 0.01, gty - cy * 0.01 ], [ gtx - S.gd + 0.004 - sx * ( S.gh - 0.008 ), gty - cy * ( S.gh - 0.008 ), 0.006 ], [ gtx - 0.005 - sx * ( S.gh - 0.008 ), gty - cy * ( S.gh - 0.008 ), 0.006 ] ];
		for ( const s of [ - 1, 1 ] ) P.ext( S.grip, panel, s * ( hz - 0.002 ), s * ( hz + 0.0018 ), 0.0012 );
	}
	if ( S.beaver ) P.extS( S.frame, [ [ xr + 0.004, - 0.01 ], [ xr - 0.018, - 0.022, 0.008 ], [ xr - 0.01, - 0.03 ], [ xr + 0.012, - 0.026 ] ], hz - 0.002, 0.002 );
	if ( S.hammer ) {
		const h = P.sub( 'hammer', xr + 0.004, - 0.004, 0 );
		h.extS( 'blued', [ [ xr + 0.006, - 0.008 ], [ xr + 0.006, 0.006 ], [ xr - 0.006, 0.016, 0.004 ], [ xr - 0.012, 0.012 ], [ xr - 0.004, 0.0 ], [ xr - 0.002, - 0.01 ] ], 0.0035, 0.001 );
	}
	return {
		P, info: {
			sightH, rearX: S.ruger ? xr + 0.01 : xr + 0.006, eyeBack: 0.34, muzzle: [ S.deagle ? 0.172 : S.ruger ? 0.166 : xf + 0.002, 0, 0 ], eject: [ 0.0, top - 0.004, 0.012 ],
			mag: { p: [ gtx - S.gd * 0.5 + 0.002, gty + 0.002, 0 ], rake: - S.rake }, light: v === 'glock' || v === 'm9' || v === 'p226' ? [ 0.075, - 0.034, 0 ] : null, lightDown: 1,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.017, { trig: [ 0.0, - 0.03, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.012 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.026, { support: 1 } ),
			},
			stock: 0, len: xf - xr + 0.1, slide: 'slide', slideTravel: S.ruger ? 0.025 : 0.034,
		},
	};
}

// ---- revolvers ----
export function revolver( o ) {
	const P = new Parts();
	const big = o.v === '44';
	const mat = big ? 'steel' : 'blued';
	const bl = big ? 0.155 : 0.1;
	const cx0 = - 0.034, cx1 = 0.01, cy = - 0.0135, cr = big ? 0.0205 : 0.0195;
	// frame
	P.box( mat, cx1, cx1 + 0.012, - 0.035, 0.013, - 0.012, 0.012, 0.003 );
	P.box( mat, cx0 - 0.012, cx1 + 0.002, 0.006, 0.016, - 0.011, 0.011, 0.003 ); // top strap
	P.box( mat, cx0 - 0.02, cx0 - 0.002, - 0.036, 0.016, - 0.0125, 0.0125, 0.004 ); // recoil shield
	P.box( mat, cx0 - 0.004, cx1 + 0.004, - 0.042, - 0.034, - 0.011, 0.011, 0.002 );
	// barrel, rib, full underlug
	P.cyl( mat, cx1 + 0.01, cx1 + 0.012 + bl, 0.0098, 0, 0, 14 );
	P.box( mat, cx1 + 0.01, cx1 + 0.012 + bl, 0.004, 0.0125, - 0.004, 0.004, 0.0015 );
	P.box( mat, cx1 + 0.01, cx1 + 0.012 + bl, - 0.026, - 0.004, - 0.0075, 0.0075, 0.004 );
	P.extS( mat, [ [ cx1 + bl, 0.0125 ], [ cx1 + bl + 0.01, 0.0125 ], [ cx1 + bl + 0.01, 0.02, 0.002 ], [ cx1 + bl - 0.01, 0.0135 ] ], 0.0016, 0.0005 ); // front ramp
	P.box( 'fiber', cx1 + bl + 0.0045, cx1 + bl + 0.0085, 0.0175, 0.0198, - 0.0017, 0.0017, 0 );
	P.box( 'blk', cx0 - 0.012, cx0 - 0.004, 0.015, 0.0205, - 0.0055, 0.0055, 0.001 ); // rear notch
	// crane + cylinder (swing out to the left)
	const crane = P.sub( 'crane', cx1, - 0.032, - 0.006 );
	crane.box( mat, cx1 - 0.002, cx1 + 0.008, - 0.036, - 0.018, - 0.009, 0.004, 0.002 );
	crane.cyl( 'steel', cx1, cx1 + bl * 0.9, 0.0032, - 0.021, 0, 8 ); // ejector rod
	const cyl = crane.sub( 'cyl', 0, cy, 0 );
	cyl.cyl( mat, cx0, cx1, cr, cy, 0, 20 );
	cyl.cyl( mat, cx0 - 0.002, cx0, cr * 0.85, cy, 0, 16 );
	for ( let i = 0; i < 6; i ++ ) {
		const a = i / 6 * PI * 2 + PI / 6;
		cyl.boxC( 'rubber', ( cx0 + cx1 ) / 2 + 0.002, cy + Math.sin( a ) * cr, Math.cos( a ) * cr, 0.028, 0.0045, 0.0045, 0.0018, [ a, 0, 0 ] );
		const b = i / 6 * PI * 2;
		cyl.cyl( 'rubber', cx1 - 0.0004, cx1 + 0.0004, 0.0045, cy + Math.sin( b ) * cr * 0.62, Math.cos( b ) * cr * 0.62, 8 );
	}
	// hammer, trigger, guard, grip
	const h = P.sub( 'hammer', cx0 - 0.016, 0.002, 0 );
	h.extS( mat, [ [ cx0 - 0.012, - 0.006 ], [ cx0 - 0.012, 0.012 ], [ cx0 - 0.03, 0.022, 0.004 ], [ cx0 - 0.034, 0.016 ], [ cx0 - 0.022, 0.004 ], [ cx0 - 0.02, - 0.01 ] ], 0.0035, 0.0012 );
	triggerGuard( P, mat, - 0.025, 0.012, - 0.036, 0.024, 0.004 );
	trigger( P, - 0.008, - 0.038, 0.016 );
	const g = pistolGrip( P, 'walnut', - 0.036, - 0.034, 0.092, 0.26, 0.03, 0.036, 0.0165, 0.006, 0 );
	P.extS( mat, [ [ - 0.036, - 0.028 ], [ - 0.068, - 0.022 ], [ - 0.068, - 0.036 ], [ - 0.036, - 0.04 ] ], 0.011, 0.002 );
	return {
		P, info: {
			sightH: 0.0195, rearX: cx0 - 0.008, eyeBack: 0.36, muzzle: [ cx1 + 0.012 + bl, 0, 0 ], eject: null,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.018, { trig: [ - 0.008, - 0.045, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.013 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.027, { support: 1 } ),
			},
			cylAxis: [ 0, cy, 0 ], cylR: cr, stock: 0, len: bl + 0.15, crane: 'crane', cyl: 'cyl', hammer: 'hammer',
		},
	};
}

export function flareGun() {
	const P = new Parts();
	const b = P.sub( 'barrels', 0.0, - 0.018, 0 );
	b.cyl( 'orange', - 0.005, 0.13, 0.0175, 0.004, 0, 16 );
	b.cyl( 'orange', 0.125, 0.135, 0.02, 0.004, 0, 16 );
	b.box( 'orange', 0.0, 0.1, - 0.016, - 0.006, - 0.008, 0.008, 0.003 );
	P.box( 'orange', - 0.055, 0.005, - 0.02, 0.022, - 0.013, 0.013, 0.005 );
	const h = P.sub( 'hammer', - 0.05, 0.015, 0 );
	h.box( 'blk', - 0.062, - 0.048, 0.012, 0.03, - 0.004, 0.004, 0.002 );
	triggerGuard( P, 'orange', - 0.03, 0.02, - 0.018, 0.026, 0.005 );
	trigger( P, - 0.012, - 0.02, 0.016 );
	const g = pistolGrip( P, 'orange', - 0.028, - 0.016, 0.092, 0.35, 0.032, 0.036, 0.0145, 0.005, 1 );
	return {
		P, info: {
			sightH: 0.026, rearX: - 0.05, eyeBack: 0.3, muzzle: [ 0.135, 0.004, 0 ], eject: null,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.017, { trig: [ - 0.012, - 0.026, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.013 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.026, { support: 1 } ),
			},
			stock: 0, len: 0.25, barrels: 'barrels', breakAxis: 'z', breakAngle: - 0.7,
		},
	};
}

