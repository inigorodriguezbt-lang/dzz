// Printed packaging for the item models: label art laid out like real packaging (a front panel with the brand, the
// product name, an illustration and the net weight; a nutrition / drug facts panel; a back panel with the barcode,
// the small print and the HI-5 deposit mark) and the geometry that carries it (box atlases, wrapped tins, pillow
// bags, ridged caps). The label spec is the one lib.labelTex reads: { text, sub, bg, fg, band, accent, glyph, style,
// textColor, subColor, glyphColor, size, glyphX/Y, textX/Y } plus `brand` (a string, or false for none).
// Brands are invented. Textures are cached by spec and layout; canvases stay small (≤ 1024 px).
import * as THREE from 'three';
import { M, canvasTex, css, shade, hashStr, glyph, PI } from './lib.js';

const SANS = 'Arial, Helvetica, "Liberation Sans", "DejaVu Sans", sans-serif';
const HEAVY = '"Arial Black", "Helvetica Neue", Arial, "Liberation Sans", sans-serif';
const SERIF = 'Georgia, "Times New Roman", "Liberation Serif", serif';

export function rng( seed ) {
	let s = seed >>> 0 || 7;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; };
}

// a lit display: the print glows by itself (an emissive map), so screens read in the dark and in icons
export function screenMat( map, k = 0.45, rough = 0.12 ) {
	const m = M( 0xffffff, { map, rough, key: 'screen' + k } );
	if ( ! m.emissiveMap ) { m.emissiveMap = map; m.emissive.set( 0xffffff ); m.emissiveIntensity = k; m.needsUpdate = true; }
	return m;
}

// ---- colour ---------------------------------------------------------------------------------------------------

const _c = new THREE.Color();
export function lum( c ) { _c.set( c ); return 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b; }
// the first candidate that reads on `back` (falls back to the best of them)
export function readable( back, ...cands ) {
	const lb = lum( back );
	let best = null, bd = - 1;
	for ( const c of cands ) {
		if ( c == null ) continue;
		const d = Math.abs( lum( c ) - lb );
		if ( d > 0.3 ) return c;
		if ( d > bd ) { bd = d; best = c; }
	}
	const d2 = Math.abs( lum( 0xffffff ) - lb ) > Math.abs( lum( 0x161616 ) - lb ) ? 0xffffff : 0x161616;
	return bd > 0.18 ? best : d2;
}
const rgba = ( c, a ) => { _c.set( c ); return `rgba(${Math.round( _c.r * 255 )},${Math.round( _c.g * 255 )},${Math.round( _c.b * 255 )},${a})`; };

// ---- canvas helpers -------------------------------------------------------------------------------------------

export function rrect( ctx, x, y, w, h, r ) {
	r = Math.max( 0, Math.min( r, w / 2, h / 2 ) );
	ctx.beginPath();
	ctx.moveTo( x + r, y ); ctx.lineTo( x + w - r, y ); ctx.quadraticCurveTo( x + w, y, x + w, y + r );
	ctx.lineTo( x + w, y + h - r ); ctx.quadraticCurveTo( x + w, y + h, x + w - r, y + h );
	ctx.lineTo( x + r, y + h ); ctx.quadraticCurveTo( x, y + h, x, y + h - r );
	ctx.lineTo( x, y + r ); ctx.quadraticCurveTo( x, y, x + r, y );
	ctx.closePath();
}

// a line of text fitted into maxW: squeezed sideways first (down to 72 %), then smaller. align: 'center' | 'left' | 'right'
export function text( ctx, str, x, y, maxW, size, o = {} ) {
	if ( ! str ) return 0;
	const weight = o.weight ?? 'bold', family = o.family ?? SANS, style = o.italic ? 'italic ' : '';
	let s = Math.max( 4, size );
	ctx.font = `${style}${weight} ${s}px ${family}`;
	let w = ctx.measureText( str ).width || str.length * s * 0.55;
	let sx = 1;
	if ( w > maxW ) { sx = Math.max( o.minSqueeze ?? 0.72, maxW / w ); if ( w * sx > maxW ) { s = Math.max( 4, s * maxW / ( w * sx ) ); ctx.font = `${style}${weight} ${s}px ${family}`; w = ctx.measureText( str ).width || str.length * s * 0.55; } }
	ctx.save();
	ctx.translate( x, y );
	ctx.scale( sx, 1 );
	ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle';
	if ( o.shadow ) { ctx.fillStyle = o.shadow; ctx.fillText( str, s * 0.05 / sx, s * 0.06 ); }
	if ( o.outline ) { ctx.lineJoin = 'round'; ctx.lineWidth = s * ( o.outlineW ?? 0.16 ) / sx; ctx.strokeStyle = o.outline; ctx.strokeText( str, 0, 0 ); }
	ctx.fillStyle = o.color ?? '#111';
	ctx.fillText( str, 0, 0 );
	ctx.restore();
	return w * sx;
}

// a few lines of "small print" (real words: up close it reads as text, from afar as fine grey lines)
const WORDS = 'water salt sugar soybean oil wheat flour corn starch natural flavor citric acid sodium phosphate garlic onion powder spices yeast extract vitamin niacin iron riboflavin folic acid contains less than 2% of modified potassium sorbate cane honey ginger pepper vinegar tomato paste rice'.split( ' ' );
export function smallPrint( ctx, x, y, w, h, color, seed, size = 0, head = '' ) {
	const r = rng( seed );
	const fs = size || Math.max( 6, Math.min( 14, h / 6 ) );
	ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
	let yy = y;
	if ( head ) { ctx.font = `bold ${fs}px ${SANS}`; ctx.fillText( head, x, yy ); yy += fs * 1.2; }
	ctx.font = `${fs}px ${SANS}`;
	while ( yy + fs <= y + h ) {
		let line = '';
		while ( true ) { const wd = WORDS[ Math.floor( r() * WORDS.length ) ]; const next = line ? line + ' ' + wd : wd; if ( ( ctx.measureText( next ).width || next.length * fs * 0.5 ) > w ) break; line = next; if ( line.length > 200 ) break; }
		ctx.fillText( line + ( r() < 0.3 ? ',' : '' ), x, yy );
		yy += fs * 1.18;
	}
}

// an EAN-13-looking barcode with its digits, on a white plate
export function barcode( ctx, x, y, w, h, seed ) {
	const r = rng( seed );
	ctx.fillStyle = '#ffffff'; rrect( ctx, x, y, w, h, Math.min( w, h ) * 0.06 ); ctx.fill();
	const pad = w * 0.08, bw = w - pad * 2, bh = h * 0.7, unit = bw / 95;
	let pattern = '101';
	for ( let i = 0; i < 6; i ++ ) pattern += ( r() * 128 | 0 ).toString( 2 ).padStart( 7, '0' ).replace( /^1/, '0' ).replace( /0$/, '1' );
	pattern += '01010';
	for ( let i = 0; i < 6; i ++ ) pattern += ( r() * 128 | 0 ).toString( 2 ).padStart( 7, '0' ).replace( /^0/, '1' ).replace( /1$/, '0' );
	pattern += '101';
	ctx.fillStyle = '#111111';
	for ( let i = 0; i < pattern.length; i ++ ) {
		if ( pattern[ i ] !== '1' ) continue;
		const guard = i < 3 || ( i >= 45 && i < 50 ) || i >= 92;
		ctx.fillRect( x + pad + i * unit, y + h * 0.08, unit + 0.4, bh + ( guard ? h * 0.08 : 0 ) );
	}
	let digits = '0 ';
	for ( let i = 0; i < 12; i ++ ) { digits += ( r() * 10 | 0 ); if ( i === 5 ) digits += '  '; }
	text( ctx, digits, x + w / 2, y + h * 0.9, bw, h * 0.15, { weight: 'normal', color: '#111111' } );
}

// the Hawaiʻi container-deposit mark, and a recycling loop
function deposit( ctx, x, y, s, color ) {
	text( ctx, 'HI 5¢', x, y, s * 2.4, s * 0.8, { weight: '900', family: HEAVY, color } );
}
function recycle( ctx, x, y, s, color ) {
	ctx.save(); ctx.translate( x, y ); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.09;
	for ( let i = 0; i < 3; i ++ ) {
		ctx.rotate( PI * 2 / 3 );
		ctx.beginPath(); ctx.moveTo( - s * 0.28, s * 0.22 ); ctx.lineTo( s * 0.18, s * 0.22 ); ctx.stroke();
		ctx.beginPath(); ctx.moveTo( s * 0.26, s * 0.22 ); ctx.lineTo( s * 0.12, s * 0.12 ); ctx.lineTo( s * 0.12, s * 0.32 ); ctx.closePath(); ctx.fill();
	}
	ctx.restore();
}

// ---- illustration ---------------------------------------------------------------------------------------------

// drawings for the glyphs that need more than lib's flat shapes (a can of beans showed a coffee bean)
const ILLUS = {
	bean( ctx, s, c ) { // a little heap of beans
		for ( const [ x, y, a ] of [ [ - 0.17, 0.08, 0.5 ], [ 0.15, 0.1, - 0.4 ], [ 0, - 0.08, 0.1 ], [ - 0.06, 0.2, 1.4 ], [ 0.2, - 0.12, 0.9 ] ] ) {
			ctx.save(); ctx.translate( x * s, y * s ); ctx.rotate( a );
			ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.17, s * 0.11, 0, 0, PI * 2 ); ctx.fill();
			ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse( - s * 0.05, - s * 0.04, s * 0.06, s * 0.03, 0, 0, PI * 2 ); ctx.fill();
			ctx.restore();
		}
	},
	meat( ctx, s, c ) { // a steak with its fat rim and a round of bone
		ctx.fillStyle = '#f4e4d2'; ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.44, s * 0.32, 0.25, 0, PI * 2 ); ctx.fill();
		ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse( - s * 0.02, s * 0.02, s * 0.38, s * 0.26, 0.25, 0, PI * 2 ); ctx.fill();
		ctx.strokeStyle = 'rgba(255,240,230,0.55)'; ctx.lineWidth = s * 0.025;
		for ( let i = 0; i < 4; i ++ ) { ctx.beginPath(); ctx.moveTo( - s * 0.25 + i * s * 0.12, - s * 0.15 ); ctx.quadraticCurveTo( - s * 0.15 + i * s * 0.12, 0, - s * 0.22 + i * s * 0.14, s * 0.16 ); ctx.stroke(); }
		ctx.fillStyle = '#f8f2e6'; ctx.beginPath(); ctx.arc( s * 0.2, - s * 0.05, s * 0.07, 0, PI * 2 ); ctx.fill();
	},
	cow( ctx, s, c ) { // a steer's head: horns, ears, the pale muzzle
		ctx.fillStyle = '#efe6d6';
		for ( const k of [ - 1, 1 ] ) { ctx.beginPath(); ctx.moveTo( k * s * 0.18, - s * 0.22 ); ctx.quadraticCurveTo( k * s * 0.42, - s * 0.3, k * s * 0.44, - s * 0.48 ); ctx.quadraticCurveTo( k * s * 0.3, - s * 0.3, k * s * 0.12, - s * 0.16 ); ctx.fill(); }
		ctx.fillStyle = c;
		for ( const k of [ - 1, 1 ] ) { ctx.beginPath(); ctx.ellipse( k * s * 0.32, - s * 0.12, s * 0.14, s * 0.06, k * 0.4, 0, PI * 2 ); ctx.fill(); }
		ctx.beginPath(); ctx.moveTo( - s * 0.22, - s * 0.24 ); ctx.quadraticCurveTo( 0, - s * 0.32, s * 0.22, - s * 0.24 ); ctx.quadraticCurveTo( s * 0.24, s * 0.1, s * 0.15, s * 0.24 ); ctx.lineTo( - s * 0.15, s * 0.24 ); ctx.quadraticCurveTo( - s * 0.24, s * 0.1, - s * 0.22, - s * 0.24 ); ctx.fill();
		ctx.fillStyle = '#e8b8a8'; ctx.beginPath(); ctx.ellipse( 0, s * 0.24, s * 0.19, s * 0.12, 0, 0, PI * 2 ); ctx.fill();
		ctx.fillStyle = '#3a2418'; for ( const k of [ - 1, 1 ] ) { ctx.beginPath(); ctx.arc( k * s * 0.07, s * 0.25, s * 0.03, 0, PI * 2 ); ctx.fill(); ctx.beginPath(); ctx.arc( k * s * 0.11, - s * 0.06, s * 0.035, 0, PI * 2 ); ctx.fill(); }
	},
	fruit( ctx, s, c ) { // a round fruit with its crease, a stalk and a leaf
		ctx.fillStyle = c; ctx.beginPath(); ctx.arc( 0, s * 0.06, s * 0.34, 0, PI * 2 ); ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.moveTo( 0, - s * 0.26 ); ctx.quadraticCurveTo( s * 0.12, s * 0.06, 0, s * 0.38 ); ctx.stroke();
		ctx.fillStyle = '#4a3a1a'; ctx.fillRect( - s * 0.02, - s * 0.4, s * 0.04, s * 0.14 );
		ctx.fillStyle = '#3f8a2e'; ctx.beginPath(); ctx.ellipse( s * 0.14, - s * 0.34, s * 0.14, s * 0.06, - 0.5, 0, PI * 2 ); ctx.fill();
	},
	dot( ctx, s, c ) { // pasta rings
		ctx.strokeStyle = c; ctx.lineWidth = s * 0.07;
		for ( const [ x, y ] of [ [ - 0.16, 0.05 ], [ 0.14, 0.1 ], [ 0, - 0.12 ], [ 0.22, - 0.16 ], [ - 0.22, - 0.2 ] ] ) { ctx.beginPath(); ctx.arc( x * s, y * s, s * 0.1, 0, PI * 2 ); ctx.stroke(); }
	},
};

// a glyph drawn as a little illustration: soft drop shadow, the shape, a light from the upper left
export function art( ctx, kind, x, y, s, color, bg ) {
	if ( ! kind ) return;
	const shadow = rgba( 0x000000, 0.22 );
	if ( ILLUS[ kind ] ) {
		ctx.save(); ctx.translate( x + s * 0.03, y + s * 0.04 ); ctx.globalAlpha = 0.25; ILLUS[ kind ]( ctx, s, '#000000' ); ctx.restore();
		ctx.save(); ctx.translate( x, y ); ILLUS[ kind ]( ctx, s, css( color ) ); ctx.restore();
		return;
	}
	glyph( ctx, kind, x + s * 0.03, y + s * 0.04, s, shadow, shadow );
	glyph( ctx, kind, x, y, s, css( color ), css( bg ) );
	// the highlight: the same shape again, lighter, clipped to its upper left
	ctx.save();
	ctx.beginPath(); ctx.moveTo( x - s, y - s ); ctx.lineTo( x + s * 0.25, y - s ); ctx.lineTo( x - s, y + s * 0.2 ); ctx.closePath(); ctx.clip();
	ctx.globalAlpha = 0.28;
	glyph( ctx, kind, x, y, s, '#ffffff', '#ffffff' );
	ctx.restore();
}

// ---- what's printed: brand, net contents, servings -----------------------------------------------------------------

const BRANDS = {
	food: [ 'Hale Pantry', 'Kai Market', 'Mauka Farms', 'Pono Foods', 'Island Table', 'Ohana Brand', 'Makai & Co.', 'Lanakila' ],
	med: [ 'Kōkua Health', 'Lani Pharma', 'MedIsle', 'Mālama Care' ],
	chem: [ 'KAPENA', 'Hoʻoponopono Works', 'Island Pro', 'MAKANI' ],
};
const DRINK_ML = [ 50, 100, 200, 250, 296, 330, 355, 375, 473, 500, 591, 700, 750, 946, 1000, 1360, 1500, 1890, 3785 ];

// info for a def: { kind, brand, net, kcal, servings, seed, deposit }
export function packInfo( spec = {}, def = null, kind = null ) {
	const cat = def?.cat;
	kind = kind || ( cat === 'drink' ? 'drink' : cat === 'medical' ? 'med' : cat === 'food' ? 'food' : 'chem' );
	const seed = hashStr( ( spec.text || '' ) + ( spec.sub || '' ) + ( def?.id || '' ) );
	let brand = spec.brand;
	if ( brand === undefined ) {
		const list = kind === 'drink' ? null : BRANDS[ kind ] || BRANDS.food;
		brand = list && ! ( spec.style === 'military' ) ? list[ seed % list.length ] : false;
	}
	const kg = def?.weight ?? 0.3;
	let net = '';
	if ( kind === 'drink' ) {
		const ml0 = kg * 1000 * 0.9;
		const ml = DRINK_ML.reduce( ( a, b ) => Math.abs( b - ml0 ) < Math.abs( a - ml0 ) ? b : a );
		net = `${( ml / 29.57 ).toFixed( ml < 600 ? 1 : 0 ).replace( /\.0$/, '' )} FL OZ (${ml >= 1000 ? ( ml / 1000 ) + ' L' : ml + ' mL'})`;
	} else if ( kind === 'med' ) {
		const n = [ 24, 30, 50, 60, 100, 120 ][ seed % 6 ];
		net = /mL|fl|gel|cream|spray|lotion|syrup|drops|solution|tincture|oil/i.test( ( spec.sub || '' ) + ( spec.text || '' ) ) ? `${( kg * 1000 * 0.8 / 29.57 ).toFixed( 1 )} FL OZ` : `${n} TABLETS`;
	} else {
		const g = Math.max( 5, Math.round( kg * 1000 * 0.86 / 5 ) * 5 );
		const oz = g / 28.35;
		net = g >= 1000 ? `NET WT ${( g / 453.6 ).toFixed( 1 ).replace( /\.0$/, '' )} LB (${( g / 1000 ).toFixed( 2 ).replace( /0$/, '' )} kg)` : `NET WT ${oz < 10 ? oz.toFixed( 1 ).replace( /\.0$/, '' ) : Math.round( oz )} OZ (${g} g)`;
	}
	const kcal = def?.food?.kcal ?? def?.drink?.kcal ?? 0;
	const servings = def?.food?.portions ?? def?.drink?.portions ?? 1;
	return { kind, brand, net, kcal, servings: Math.max( 1, servings ), seed, deposit: kind === 'drink' && ! /carton|box/.test( spec.pack || '' ) };
}

// ---- panels ---------------------------------------------------------------------------------------------------------

// the label colours, resolved once
function palette( s ) {
	const bg = s.bg ?? 0xffffff, fg = s.fg ?? 0x222222, band = s.band ?? s.fg ?? 0x333333;
	return { bg, fg, band, accent: s.accent ?? s.band ?? 0xcc3333 };
}

// background and the style's bands, across a whole strip (continuous round a wrap)
function paintGround( ctx, x, y, w, h, s, P ) {
	const style = s.style || 'band';
	const g = ctx.createLinearGradient( 0, y, 0, y + h );
	g.addColorStop( 0, css( shade( P.bg, 0.07 ) ) ); g.addColorStop( 0.55, css( P.bg ) ); g.addColorStop( 1, css( shade( P.bg, - 0.08 ) ) );
	ctx.fillStyle = g; ctx.fillRect( x, y, w, h );
	ctx.fillStyle = css( P.band );
	if ( style === 'band' ) { ctx.fillRect( x, y + h * 0.6, w, h * 0.2 ); ctx.fillStyle = css( P.accent ); ctx.fillRect( x, y + h * 0.82, w, h * 0.035 ); ctx.fillRect( x, y + h * 0.045, w, h * 0.02 ); }
	if ( style === 'split' ) { ctx.fillRect( x, y, w, h * 0.42 ); ctx.fillStyle = css( P.accent ); ctx.fillRect( x, y + h * 0.42, w, h * 0.035 ); }
	if ( style === 'stripes' ) { ctx.globalAlpha = 0.85; for ( let i = 0; i < 7; i ++ ) ctx.fillRect( x, y + h * ( 0.04 + i * 0.145 ), w, h * 0.04 ); ctx.globalAlpha = 1; }
	if ( style === 'medical' ) { ctx.fillRect( x, y, w, h * 0.2 ); ctx.fillRect( x, y + h * 0.87, w, h * 0.13 ); ctx.fillStyle = css( P.accent ); ctx.fillRect( x, y + h * 0.2, w, h * 0.015 ); }
	if ( style === 'military' ) {
		const r = rng( 99 );
		ctx.fillStyle = 'rgba(0,0,0,0.07)';
		for ( let i = 0; i < w * h / 900; i ++ ) ctx.fillRect( x + r() * w, y + r() * h, 2 + r() * 30, 1 + r() * 2 );
	}
	if ( style === 'plain' || style === 'badge' ) {
		// a quiet sheen band so a plain print isn't a flat swatch
		const sh = ctx.createLinearGradient( 0, y, 0, y + h );
		sh.addColorStop( 0, 'rgba(255,255,255,0)' ); sh.addColorStop( 0.18, 'rgba(255,255,255,0.10)' ); sh.addColorStop( 0.3, 'rgba(255,255,255,0)' );
		ctx.fillStyle = sh; ctx.fillRect( x, y, w, h );
		ctx.fillStyle = css( P.band ); ctx.fillRect( x, y + h * 0.955, w, h * 0.045 );
	}
}

// what the region under (fx, fy) of the front is painted
function regionColour( s, P, fy ) {
	const style = s.style || 'band';
	if ( style === 'band' && fy > 0.6 && fy < 0.8 ) return P.band;
	if ( style === 'split' && fy < 0.42 ) return P.band;
	if ( style === 'medical' && ( fy < 0.2 || fy > 0.87 ) ) return P.band;
	return P.bg;
}

// the front: brand, illustration, name, descriptor, net contents
function paintFront( ctx, x, y, w, h, s, P, info ) {
	const style = s.style || 'band';
	// keep the art to a sensible box inside a very wide or very tall panel
	const cw = Math.min( w, h * 1.7 ), ch = Math.min( h, w * 2.2 ), cx = x + w / 2, top = y + ( h - ch ) / 2;
	const wide = cw / ch > 1.15;
	const Y = ( f ) => top + ch * f;
	// brand ribbon
	if ( info.brand && style !== 'military' ) {
		const by = style === 'split' ? 0.085 : style === 'medical' ? 0.1 : wide ? 0.1 : 0.075;
		const back = regionColour( s, P, by );
		const bc = readable( back, s.brandColor, P.accent, P.fg, P.band );
		text( ctx, info.brand, cx, Y( by ), cw * 0.6, ch * 0.075, { family: SERIF, italic: true, weight: 'bold', color: css( bc ) } );
	}
	// illustration
	const hasG = !! s.glyph;
	let tx = cx, tw = cw * 0.86, ty = Y( s.textY ?? ( style === 'band' ? 0.38 : style === 'split' ? 0.24 : style === 'medical' ? 0.48 : style === 'badge' ? 0.47 : 0.42 ) );
	if ( hasG ) {
		let gx, gy, gs;
		if ( s.glyphX != null || s.glyphY != null ) { gx = x + w * ( s.glyphX ?? 0.2 ); gy = top + ch * ( s.glyphY ?? 0.4 ); gs = ch * ( s.glyphS ?? 0.34 ); }
		else if ( style === 'badge' ) { gx = cx; gy = Y( 0.3 ); gs = ch * 0.2; }
		else if ( style === 'split' ) { gx = cx; gy = Y( 0.71 ); gs = ch * 0.26; }
		else if ( wide ) { gx = cx - cw * 0.3; gy = Y( style === 'band' ? 0.36 : 0.46 ); gs = ch * 0.38; tx = cx + cw * 0.12; tw = cw * 0.6; }
		else { gx = cx; gy = Y( style === 'band' ? 0.25 : 0.27 ); gs = ch * 0.22; ty = Y( style === 'band' ? 0.47 : 0.52 ); }
		// a soft disc behind it
		const gc = s.glyphColor ?? P.accent;
		const ring = ctx.createRadialGradient( gx, gy, 0, gx, gy, gs * 0.62 );
		const back = regionColour( s, P, ( gy - top ) / ch );
		ring.addColorStop( 0, rgba( lum( gc ) > 0.6 ? shade( back, - 0.25 ) : shade( back, 0.45 ), 0.85 ) ); ring.addColorStop( 1, rgba( back, 0 ) );
		ctx.fillStyle = ring; ctx.beginPath(); ctx.arc( gx, gy, gs * 0.62, 0, PI * 2 ); ctx.fill();
		art( ctx, s.glyph, gx, gy, gs, gc, back );
	}
	if ( style === 'badge' ) {
		ctx.fillStyle = css( P.band );
		ctx.beginPath(); ctx.ellipse( cx, Y( 0.5 ), cw * 0.4, ch * 0.2, 0, 0, PI * 2 ); ctx.fill();
		ctx.strokeStyle = css( readable( P.band, P.accent, P.bg ) ); ctx.lineWidth = ch * 0.012;
		ctx.beginPath(); ctx.ellipse( cx, Y( 0.5 ), cw * 0.37, ch * 0.175, 0, 0, PI * 2 ); ctx.stroke();
		ty = Y( s.textY ?? 0.5 ); tw = cw * 0.66;
	}
	if ( style === 'stripes' ) { ctx.fillStyle = css( P.bg ); rrect( ctx, tx - tw * 0.56, ty - ch * 0.13, tw * 1.12, ch * 0.26, ch * 0.04 ); ctx.fill(); }
	// the name
	if ( s.text ) {
		const back = style === 'badge' ? P.band : regionColour( s, P, ( ty - top ) / ch );
		const col = readable( back, s.textColor, P.fg, P.bg );
		const outline = s.outline != null ? css( s.outline ) : null;
		text( ctx, s.text, tx + ( s.textX != null ? x + w * s.textX - cx : 0 ), ty, tw, ch * ( s.size ?? 0.3 ) * 0.92, { weight: '900', family: HEAVY, color: css( col ), outline, shadow: rgba( lum( col ) > 0.5 ? 0x000000 : 0xffffff, 0.22 ) } );
	}
	// the descriptor
	if ( s.sub ) {
		const sy = s.subY ?? ( style === 'band' ? 0.7 : style === 'split' ? 0.51 : style === 'badge' ? 0.8 : style === 'medical' ? 0.7 : 0.73 );
		const col = readable( regionColour( s, P, sy ), s.subColor, P.fg, P.bg );
		text( ctx, s.sub, cx, Y( sy ), cw * 0.86, ch * 0.095, { weight: 'bold', color: css( col ) } );
	}
	// net contents along the bottom
	if ( info.net ) {
		const ny = style === 'band' ? 0.915 : style === 'medical' ? 0.935 : 0.9;
		const col = readable( regionColour( s, P, ny ), P.fg, P.bg );
		text( ctx, info.net, cx, Y( ny ), cw * 0.7, ch * 0.055, { weight: 'bold', color: css( col ) } );
	}
	// a seal now and then
	const r = rng( info.seed );
	if ( info.kind === 'food' && style !== 'military' && r() < 0.45 && cw > ch * 0.6 ) {
		const sx = cx + cw * 0.38, sy = Y( style === 'split' ? 0.74 : wide ? 0.2 : 0.17 ), sr = ch * 0.07;
		ctx.fillStyle = css( P.accent ); ctx.beginPath();
		for ( let i = 0; i < 24; i ++ ) { const a = i / 24 * PI * 2, rr = i % 2 ? sr : sr * 0.86; ctx.lineTo( sx + Math.cos( a ) * rr, sy + Math.sin( a ) * rr ); }
		ctx.fill();
		const words = [ 'NEW', 'NO MSG', 'ISLAND MADE', 'ʻONO!', '100%', 'NATURAL' ];
		text( ctx, words[ Math.floor( r() * words.length ) ], sx, sy, sr * 1.5, sr * 0.5, { weight: '900', color: css( readable( P.accent, 0xffffff, 0x111111 ) ) } );
	}
	if ( style === 'military' ) {
		const col = css( P.fg );
		ctx.strokeStyle = col; ctx.lineWidth = ch * 0.012; ctx.strokeRect( x + w * 0.05, y + h * 0.08, w * 0.9, h * 0.84 );
		smallPrint( ctx, x + w * 0.1, Y( 0.76 ), w * 0.8, ch * 0.12, col, info.seed, ch * 0.035, 'NSN 8970-01-' + ( 100 + info.seed % 900 ) + '-' + ( 1000 + info.seed % 9000 ) );
	}
}

// nutrition / drug facts / warning box
function paintFacts( ctx, x, y, w, h, s, P, info ) {
	const bw = Math.min( w * 0.84, h * 0.72 ), bh = h * 0.8, bx = x + ( w - bw ) / 2, by = y + h * 0.1;
	const chem = info.kind === 'chem';
	ctx.fillStyle = '#ffffff'; ctx.fillRect( bx, by, bw, bh );
	ctx.strokeStyle = '#111111'; ctx.lineWidth = Math.max( 1, bw * 0.012 ); ctx.strokeRect( bx, by, bw, bh );
	const L = ( f ) => by + bh * f, pad = bw * 0.06, iw = bw - pad * 2;
	const head = info.kind === 'med' ? 'Drug Facts' : chem ? 'CAUTION' : 'Nutrition Facts';
	text( ctx, head, bx + pad, L( 0.07 ), iw, bh * 0.09, { weight: '900', align: 'left', color: chem ? '#b01818' : '#111111' } );
	const rule = ( f, t ) => { ctx.fillStyle = '#111111'; ctx.fillRect( bx + pad, L( f ), iw, Math.max( 1, bh * t ) ); };
	rule( 0.13, 0.004 );
	if ( info.kind === 'food' || info.kind === 'drink' ) {
		const per = Math.round( info.kcal / info.servings );
		text( ctx, `${info.servings} serving${info.servings > 1 ? 's' : ''} per container`, bx + pad, L( 0.17 ), iw, bh * 0.04, { weight: 'normal', align: 'left', color: '#111' } );
		text( ctx, 'Serving size', bx + pad, L( 0.22 ), iw * 0.5, bh * 0.045, { align: 'left', color: '#111' } );
		rule( 0.26, 0.03 );
		text( ctx, 'Calories', bx + pad, L( 0.34 ), iw * 0.6, bh * 0.08, { weight: '900', align: 'left', color: '#111' } );
		text( ctx, String( per ), bx + bw - pad, L( 0.34 ), iw * 0.4, bh * 0.1, { weight: '900', align: 'right', color: '#111' } );
		rule( 0.4, 0.015 );
		const rows = [ [ 'Total Fat', 'g' ], [ 'Sodium', 'mg' ], [ 'Total Carbohydrate', 'g' ], [ 'Dietary Fiber', 'g' ], [ 'Total Sugars', 'g' ], [ 'Protein', 'g' ] ];
		const r = rng( info.seed + 3 );
		rows.forEach( ( [ n, u ], i ) => {
			const f = 0.45 + i * 0.075;
			text( ctx, `${n} ${Math.round( r() * ( u === 'mg' ? 900 : 24 ) )}${u}`, bx + pad, L( f ), iw * 0.75, bh * 0.04, { weight: i % 3 === 0 ? 'bold' : 'normal', align: 'left', color: '#111' } );
			text( ctx, `${Math.round( r() * 30 )}%`, bx + bw - pad, L( f ), iw * 0.25, bh * 0.04, { align: 'right', color: '#111' } );
			rule( f + 0.035, 0.002 );
		} );
		smallPrint( ctx, bx + pad, L( 0.92 ), iw, bh * 0.06, '#333', info.seed, bh * 0.022 );
	} else {
		const lines = info.kind === 'med' ? [ 'Active ingredient', 'Purpose', 'Uses', 'Warnings', 'Directions' ] : [ 'Keep out of reach of children', 'Avoid contact with eyes', 'First aid', 'Storage' ];
		let f = 0.18;
		for ( const l of lines ) {
			text( ctx, l, bx + pad, L( f ), iw, bh * 0.045, { weight: 'bold', align: 'left', color: '#111' } );
			smallPrint( ctx, bx + pad, L( f + 0.03 ), iw, bh * 0.1, '#333', info.seed + f * 100, bh * 0.026 );
			f += 0.16;
		}
		if ( chem ) {
			// a hazard diamond
			const dx = bx + bw - pad - bh * 0.06, dy = L( 0.07 ), ds = bh * 0.055;
			ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#c01818'; ctx.lineWidth = ds * 0.2;
			ctx.beginPath(); ctx.moveTo( dx, dy - ds ); ctx.lineTo( dx + ds, dy ); ctx.lineTo( dx, dy + ds ); ctx.lineTo( dx - ds, dy ); ctx.closePath(); ctx.fill(); ctx.stroke();
			text( ctx, '!', dx, dy, ds, ds * 1.3, { weight: '900', color: '#111' } );
		}
	}
}

// the back: ingredients, the maker, the barcode, recycling and the deposit mark
function paintBack( ctx, x, y, w, h, s, P, info ) {
	const cw = Math.min( w, h * 1.1 ), cx = x + w / 2, x0 = cx - cw / 2;
	const ink = css( readable( P.bg, P.fg, 0x111111, 0xffffff ) );
	smallPrint( ctx, x0 + cw * 0.08, y + h * 0.1, cw * 0.84, h * 0.32, ink, info.seed + 7, Math.max( 6, h * 0.04 ), info.kind === 'chem' ? 'DIRECTIONS:' : info.kind === 'med' ? 'INACTIVE INGREDIENTS:' : 'INGREDIENTS:' );
	const maker = ( info.brand || s.text || 'Island' ).toString().toUpperCase();
	text( ctx, `DIST. BY ${maker} · HONOLULU, HI 96813`, cx, y + h * 0.47, cw * 0.86, h * 0.04, { color: ink } );
	const bw = Math.min( cw * 0.7, h * 0.6 ), bh = Math.min( h * 0.3, bw * 0.55 );
	barcode( ctx, cx - bw / 2, y + h * 0.56, bw, bh, info.seed );
	const my = y + h * 0.56 + bh + h * 0.08;
	if ( info.deposit ) deposit( ctx, cx - bw * 0.3, my, h * 0.07, ink );
	recycle( ctx, cx + bw * 0.3, my, h * 0.09, ink );
}

// a narrow side: the name turned upright, and the brand
function paintSide( ctx, x, y, w, h, s, P, info ) {
	const col = css( readable( P.bg, s.textColor, P.fg ) );
	if ( w < h * 0.5 ) {
		ctx.save(); ctx.translate( x + w / 2, y + h / 2 ); ctx.rotate( - PI / 2 );
		text( ctx, s.text || '', 0, 0, h * 0.7, w * 0.55, { weight: '900', family: HEAVY, color: col } );
		ctx.restore();
	} else {
		text( ctx, s.text || '', x + w / 2, y + h * 0.4, w * 0.7, Math.min( h * 0.2, w * 0.2 ), { weight: '900', family: HEAVY, color: col } );
		if ( info.brand ) text( ctx, info.brand, x + w / 2, y + h * 0.18, w * 0.66, Math.min( h * 0.08, w * 0.1 ), { family: SERIF, italic: true, color: col } );
		if ( s.glyph ) art( ctx, s.glyph, x + w / 2, y + h * 0.68, Math.min( w, h ) * 0.3, s.glyphColor ?? P.accent, P.bg );
	}
}

// the top of a box: brand and the glued flap lines
function paintTop( ctx, x, y, w, h, s, P, info ) {
	ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = Math.max( 1, h * 0.012 );
	ctx.beginPath(); ctx.moveTo( x, y + h * 0.5 ); ctx.lineTo( x + w, y + h * 0.5 ); ctx.stroke();
	const col = css( readable( P.bg, s.textColor, P.fg ) );
	text( ctx, s.text || '', x + w / 2, y + h * 0.28, w * 0.8, h * 0.22, { weight: '900', family: HEAVY, color: col } );
	if ( info.brand ) text( ctx, info.brand, x + w / 2, y + h * 0.72, w * 0.7, h * 0.14, { family: SERIF, italic: true, color: col } );
}

const PAINT = { front: paintFront, facts: paintFacts, back: paintBack, side: paintSide, top: paintTop, plain: () => {} };

// ---- textures -------------------------------------------------------------------------------------------------------

// pixels for a physical size (m), capped
function pxFor( wm, hm, max = 1024, min = 96 ) {
	const k = Math.min( max / Math.max( wm, 1e-4 ), max / Math.max( hm, 1e-4 ) );
	return [ Math.max( 8, Math.round( wm * k ) ), Math.max( min, Math.round( hm * k ) ) ];
}

// A label wrapped round a cylinder once: a strip of physical size circ × h (m). The front faces u = `front`
// (0.1: towards the icon camera); the facts panel sits to its left, the back panel to its right.
export function wrapTex( spec, info, circ, h, o = {} ) {
	const max = o.max ?? 640;
	let W = max, H = Math.round( max * h / circ );
	if ( H > 320 ) { H = 320; W = Math.round( 320 * circ / h ); }
	if ( H < 64 ) { H = 64; }
	const front = o.front ?? 0.1;
	const key = 'pack:wrap:' + JSON.stringify( spec ) + info.kind + info.net + info.brand + W + 'x' + H + ( o.panels || '' );
	const t = canvasTex( key, W, H, ( ctx ) => {
		const P = palette( spec );
		paintGround( ctx, 0, 0, W, H, spec, P );
		const fw = Math.max( H * 0.8, Math.min( W * 0.4, H * 2.4 ) );
		const fx = W / 2 - fw / 2;
		paintFront( ctx, fx, 0, fw, H, spec, P, info );
		const side = W / 2 - fw / 2;
		if ( o.panels !== 'front' && side > H * 0.25 ) {
			const pw = Math.min( side * 0.92, H * 0.85 );
			paintFacts( ctx, fx - pw, 0, pw, H, spec, P, info );
			paintBack( ctx, fx + fw, 0, pw, H, spec, P, info );
		}
		// the glued overlap at the seam
		ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect( 0, 0, Math.max( 1, W * 0.004 ), H );
		wear( ctx, W, H, info.seed );
	}, { repeat: true } );
	if ( ! t.userData.offsetSet ) { t.offset.x = 0.5 - front; t.userData.offsetSet = true; t.needsUpdate = true; }
	return t;
}

// one panel at a physical aspect (a front label, a lid, a tag)
export function panelTex( spec, info, wm, hm, kind = 'front', o = {} ) {
	const [ W, H ] = pxFor( wm, hm, o.max ?? 512, 32 );
	const key = 'pack:panel:' + kind + JSON.stringify( spec ) + info.kind + info.net + info.brand + W + 'x' + H;
	return canvasTex( key, W, H, ( ctx ) => {
		const P = palette( spec );
		if ( kind !== 'clear' ) paintGround( ctx, 0, 0, W, H, spec, P );
		PAINT[ kind === 'clear' ? 'front' : kind ]( ctx, 0, 0, W, H, spec, P, info );
		if ( o.border ) { ctx.strokeStyle = css( o.border ); ctx.lineWidth = Math.max( 2, H * 0.03 ); ctx.strokeRect( 0, 0, W, H ); }
		wear( ctx, W, H, info.seed );
	} );
}

// panels laid along a strip in u (a tin's four sides: [ { kind, u0, u1 } ], u in 0..1 of physical length L × h)
export function stripTex( spec, info, L, h, panels, o = {} ) {
	const [ W, H ] = pxFor( L, h, o.max ?? 768, 64 );
	const key = 'pack:strip:' + JSON.stringify( spec ) + JSON.stringify( panels ) + info.kind + info.net + info.brand + W + 'x' + H;
	return canvasTex( key, W, H, ( ctx ) => {
		const P = palette( spec );
		paintGround( ctx, 0, 0, W, H, spec, P );
		// a panel whose range crosses the seam (u1 < u0) is drawn twice, half of it showing each side
		for ( const p of panels ) {
			if ( p.u1 >= p.u0 ) PAINT[ p.kind ]( ctx, p.u0 * W, 0, ( p.u1 - p.u0 ) * W, H, spec, P, info );
			else for ( const x0 of [ p.u0 - 1, p.u0 ] ) PAINT[ p.kind ]( ctx, x0 * W, 0, ( p.u1 - p.u0 + 1 ) * W, H, spec, P, info );
		}
		wear( ctx, W, H, info.seed );
	}, { repeat: true } );
}

function wear( ctx, W, H, seed ) {
	const r = rng( seed + 11 );
	ctx.fillStyle = 'rgba(0,0,0,0.03)';
	for ( let i = 0; i < 40; i ++ ) ctx.fillRect( r() * W, r() * H, 1 + r() * 3, 1 + r() * 3 );
	ctx.fillStyle = 'rgba(255,255,255,0.05)';
	for ( let i = 0; i < 20; i ++ ) ctx.fillRect( r() * W, r() * H, 1 + r() * 6, 1 );
}

// ---- box atlas --------------------------------------------------------------------------------------------------------

// The six faces of a w × h × d box laid out on one texture. axis: which way the front faces ('z': +z, 'y': +y).
// Returns { tex, rects } for boxUV.
export function boxAtlas( spec, info, w, h, d, axis = 'z', o = {} ) {
	// physical face sizes (u extent, v extent) and what each carries
	const F = axis === 'y'
		? { py: [ w, d, 'front' ], ny: [ w, d, 'back' ], pz: [ w, h, 'side' ], nz: [ w, h, 'side' ], px: [ d, h, 'side' ], nx: [ d, h, 'side' ] }
		: { pz: [ w, h, 'front' ], nz: [ w, h, 'back' ], px: [ d, h, 'facts' ], nx: [ d, h, 'side' ], py: [ w, d, 'top' ], ny: [ w, d, 'plain' ] };
	const rowA = [ axis === 'y' ? 'py' : 'pz', axis === 'y' ? 'ny' : 'nz' ];
	const rowB = Object.keys( F ).filter( k => ! rowA.includes( k ) );
	const wA = F[ rowA[ 0 ] ][ 0 ] * 2, hA = F[ rowA[ 0 ] ][ 1 ];
	const wB = rowB.reduce( ( a, k ) => a + F[ k ][ 0 ], 0 ), hB = Math.max( ...rowB.map( k => F[ k ][ 1 ] ) );
	const MAX = Math.min( 768, o.max ?? 768 ), gap = 2;
	const k = Math.min( ( MAX - gap * 4 ) / Math.max( wA, wB ), ( MAX - gap * 3 ) / ( hA + hB ) );
	const CW = Math.ceil( Math.max( wA, wB ) * k ) + gap * 5, CH = Math.ceil( ( hA + hB ) * k ) + gap * 3;
	const rects = {};
	let x = gap;
	for ( const f of rowA ) { rects[ f ] = [ x, gap, F[ f ][ 0 ] * k, F[ f ][ 1 ] * k ]; x += F[ f ][ 0 ] * k + gap; }
	x = gap;
	for ( const f of rowB ) { rects[ f ] = [ x, gap * 2 + hA * k, F[ f ][ 0 ] * k, F[ f ][ 1 ] * k ]; x += F[ f ][ 0 ] * k + gap; }
	const key = 'pack:box:' + JSON.stringify( spec ) + axis + [ w, h, d ].join( ',' ) + info.kind + info.net + info.brand + ( o.inset || '' );
	const tex = canvasTex( key, CW, CH, ( ctx ) => {
		const P = palette( spec );
		for ( let [ f, [ rx, ry, rw, rh ] ] of Object.entries( rects ) ) {
			// bleed a little past each face so the atlas never shows a seam
			paintGround( ctx, rx - gap, ry - gap, rw + gap * 2, rh + gap * 2, spec, P );
			const kind = F[ f ][ 2 ];
			// a pouch's front wraps round its puffed edges and the crimps: keep the print off them
			if ( o.inset && ( f === 'pz' || f === 'nz' ) ) { const [ ix, iy ] = o.inset; rx += rw * ix; ry += rh * iy; rw *= 1 - ix * 2; rh *= 1 - iy * 2; }
			if ( kind === 'back' && rw > rh * 1.2 ) { paintFacts( ctx, rx, ry, rw * 0.45, rh, spec, P, info ); paintBack( ctx, rx + rw * 0.45, ry, rw * 0.55, rh, spec, P, info ); } else PAINT[ kind ]( ctx, rx, ry, rw, rh, spec, P, info );
		}
		wear( ctx, CW, CH, info.seed );
	} );
	const uvr = {};
	for ( const [ f, [ rx, ry, rw, rh ] ] of Object.entries( rects ) ) uvr[ f ] = [ rx / CW, 1 - ( ry + rh ) / CH, ( rx + rw ) / CW, 1 - ry / CH ];
	return { tex, rects: uvr };
}

// UVs for a box-ish geometry (rounded boxes too) from an atlas: each vertex goes to the face its normal points at
export function boxUV( geo, rects ) {
	geo.computeBoundingBox();
	const bb = geo.boundingBox, pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
	const sx = bb.max.x - bb.min.x || 1, sy = bb.max.y - bb.min.y || 1, sz = bb.max.z - bb.min.z || 1;
	for ( let i = 0; i < pos.count; i ++ ) {
		const nx = nor.getX( i ), ny = nor.getY( i ), nz = nor.getZ( i ), ax = Math.abs( nx ), ay = Math.abs( ny ), az = Math.abs( nz );
		const fx = ( pos.getX( i ) - bb.min.x ) / sx, fy = ( pos.getY( i ) - bb.min.y ) / sy, fz = ( pos.getZ( i ) - bb.min.z ) / sz;
		let f, u, v;
		if ( az >= ax && az >= ay ) { f = nz > 0 ? 'pz' : 'nz'; u = nz > 0 ? fx : 1 - fx; v = fy; }
		else if ( ax >= ay ) { f = nx > 0 ? 'px' : 'nx'; u = nx > 0 ? 1 - fz : fz; v = fy; }
		else { f = ny > 0 ? 'py' : 'ny'; u = fx; v = ny > 0 ? 1 - fz : fz; }
		const r = rects[ f ];
		uv.setXY( i, r[ 0 ] + ( r[ 2 ] - r[ 0 ] ) * u, r[ 1 ] + ( r[ 3 ] - r[ 1 ] ) * v );
	}
	uv.needsUpdate = true;
	return geo;
}

// ---- shapes -----------------------------------------------------------------------------------------------------------

// a knurled cap / ridged knob: a cylinder whose side alternates in and out (n ridges); sits on y = 0
export function ridged( r, h, n = 18, depth = 0.06, top = true ) {
	const g = new THREE.CylinderGeometry( r, r, h, n * 2, 1, ! top );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), z = p.getZ( i ), rr = Math.hypot( x, z );
		if ( rr < r * 0.99 ) continue;
		const a = Math.atan2( x, z ), k = Math.round( a / ( PI / n ) ) % 2 ? 1 - depth : 1;
		p.setX( i, x * k ); p.setZ( i, z * k );
	}
	const out = g.toNonIndexed(); out.computeVertexNormals();
	return out.translate( 0, h / 2, 0 );
}

// a crown cap: the skirt pleated into teeth
export function crown( r, h, n = 21 ) {
	const pts = [];
	for ( let i = 0; i <= n * 2; i ++ ) { const a = i / ( n * 2 ) * PI * 2, k = i % 2 ? 1.08 : 0.98; pts.push( new THREE.Vector2( Math.sin( a ) * r * k, Math.cos( a ) * r * k ) ); }
	const shape = new THREE.Shape( pts );
	const g = new THREE.ExtrudeGeometry( shape, { depth: h, bevelEnabled: true, bevelThickness: h * 0.25, bevelSize: r * 0.06, bevelSegments: 1, curveSegments: 1 } );
	g.rotateX( - PI / 2 );
	return g;
}

// A sealed pouch (a chip bag, a jerky pack, a wrapper): puffed in the middle, pressed flat at the crimped ends.
// w × h, puffed to d at its fattest; ends: 'y' (top and bottom crimps, a bag standing up) or 'x' (a bar wrapper).
// The front (+z) maps to rects.pz, the back to rects.nz (an atlas from boxAtlas with axis 'z').
export function pillow( w, h, d, rects, o = {} ) {
	const nx = o.nx ?? 10, ny = o.ny ?? 14, ends = o.ends ?? 'y', crimp = o.crimp ?? 0.08, pow = o.pow ?? 0.55;
	const pos = [], uv = [], idx = [];
	const r = rng( o.seed ?? 5 );
	for ( const side of [ 1, - 1 ] ) {
		const base = pos.length / 3, rc = rects[ side > 0 ? 'pz' : 'nz' ];
		for ( let j = 0; j <= ny; j ++ ) for ( let i = 0; i <= nx; i ++ ) {
			const fx = i / nx, fy = j / ny;
			const x = ( fx - 0.5 ) * w, y = fy * h;
			// along the crimped axis the bag is flat inside the crimp and swells past it; across it, rounds over the edge
			const a = ends === 'y' ? fy : fx, b = ends === 'y' ? fx : fy;
			const ea = Math.min( 1, Math.max( 0, ( Math.min( a, 1 - a ) - crimp ) / 0.22 ) );
			const eb = Math.pow( Math.max( 0, Math.sin( b * PI ) ), pow );
			const wob = 1 + ( r() - 0.5 ) * 0.12 * ea;
			let z = d / 2 * Math.pow( ea, 0.7 ) * eb * wob;
			z = Math.max( z, 0.0008 );
			// the sides pull in a little where the bag is fattest
			const pull = ends === 'y' ? 1 - 0.06 * ea * ( 1 - eb ) : 1;
			pos.push( x * ( ends === 'y' ? pull : 1 ), y * ( ends === 'x' ? 1 - 0.06 * ea * ( 1 - eb ) : 1 ), z * side );
			const u = side > 0 ? fx : 1 - fx;
			uv.push( rc[ 0 ] + ( rc[ 2 ] - rc[ 0 ] ) * u, rc[ 1 ] + ( rc[ 3 ] - rc[ 1 ] ) * fy );
		}
		for ( let j = 0; j < ny; j ++ ) for ( let i = 0; i < nx; i ++ ) {
			const a = base + j * ( nx + 1 ) + i, b = a + 1, c = a + nx + 1, e = c + 1;
			if ( side > 0 ) idx.push( a, b, e, a, e, c ); else idx.push( a, e, b, a, c, e );
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;
}

// a rounded-rectangle outline (centred), `n` points per corner, starting on +x going towards -z (the way a
// cylinder's u runs round from +z through +x)
export function roundRectOutline( w, d, r, n = 4 ) {
	r = Math.min( r, w / 2 - 1e-4, d / 2 - 1e-4 );
	const pts = [];
	const corners = [ [ w / 2 - r, - d / 2 + r, 0 ], [ - w / 2 + r, - d / 2 + r, PI * 0.5 ], [ - w / 2 + r, d / 2 - r, PI ], [ w / 2 - r, d / 2 - r, PI * 1.5 ] ];
	// start at the middle of the +x side
	pts.push( [ w / 2, 0 ] );
	for ( const [ cx, cz, a0 ] of corners ) for ( let i = 0; i <= n; i ++ ) { const a = a0 + i / n * PI / 2; pts.push( [ cx + Math.cos( a ) * r, cz - Math.sin( a ) * r ] ); }
	pts.push( [ w / 2, 0 ] );
	return pts;
}

// the side wall of a rounded-rect tin, open top and bottom, u along the perimeter (0 at +x, through -z, -x, +z);
// `taper` narrows the top. Returns { geo, len, faces: { px, nz, nx, pz: [ u0, u1 ] } }
export function tinWall( w, h, d, r, taper = 1, n = 4 ) {
	const out = roundRectOutline( w, d, r, n );
	const L = [ 0 ];
	for ( let i = 1; i < out.length; i ++ ) L.push( L[ i - 1 ] + Math.hypot( out[ i ][ 0 ] - out[ i - 1 ][ 0 ], out[ i ][ 1 ] - out[ i - 1 ][ 1 ] ) );
	const len = L[ L.length - 1 ];
	const pos = [], uv = [], idx = [];
	for ( let j = 0; j <= 1; j ++ ) for ( let i = 0; i < out.length; i ++ ) {
		const k = j ? taper : 1;
		pos.push( out[ i ][ 0 ] * k, j * h, out[ i ][ 1 ] * k );
		uv.push( L[ i ] / len, j );
	}
	const m = out.length;
	for ( let i = 0; i < m - 1; i ++ ) { const a = i, b = i + 1, c = i + m, e = i + m + 1; idx.push( a, b, e, a, e, c ); }
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	// u ranges of the four sides (each with half of its two corners)
	const q = ( d / 2 ) / len, s1 = w / len, s2 = d / len;
	const faces = { px: [ 1 - q, q ], nz: [ q, q + s1 ], nx: [ q + s1, q + s1 + s2 ], pz: [ q + s1 + s2, 1 - q ] };
	return { geo: g, len, faces };
}

// a flat rounded-rect plate (a tin lid) on y = 0, its UVs planar 0..1
export function roundRectPlate( w, d, r, t = 0.002, n = 4 ) {
	const out = roundRectOutline( w, d, r, n );
	const shape = new THREE.Shape( out.map( ( [ x, z ] ) => new THREE.Vector2( x, - z ) ) );
	const g = new THREE.ExtrudeGeometry( shape, { depth: t, bevelEnabled: false, curveSegments: 1 } );
	g.rotateX( - PI / 2 );
	const p = g.attributes.position, uv = g.attributes.uv;
	for ( let i = 0; i < p.count; i ++ ) uv.setXY( i, p.getX( i ) / w + 0.5, - p.getZ( i ) / d + 0.5 );
	return g;
}

// A label round a tube lying along x (an ointment tube, a flare, an auto-injector): the print runs along the length.
// Canvas: x along the length L, y round the circumference C. The front panel faces +y (up, the icon's side), the
// back panel the other half. Map with tubeUV (u = along, v = round from -z through +y).
export function tubeTex( spec, info, L, C, o = {} ) {
	const [ W, H ] = pxFor( L, C, o.max ?? 512, 64 );
	const key = 'pack:tube:' + JSON.stringify( spec ) + info.kind + info.net + info.brand + W + 'x' + H + ( o.back ?? '' );
	return canvasTex( key, W, H, ( ctx ) => {
		const P = palette( spec );
		paintGround( ctx, 0, 0, W, H, spec, P );
		// v = 0.5 is straight up: the front panel is the middle half of the canvas
		paintFront( ctx, W * ( o.x0 ?? 0 ), H * 0.25, W * ( ( o.x1 ?? 1 ) - ( o.x0 ?? 0 ) ), H * 0.5, spec, P, info );
		if ( o.back !== false ) {
			ctx.save(); ctx.translate( W, H * 0.25 ); ctx.rotate( PI );
			paintBack( ctx, 0, 0, W, H * 0.25, spec, P, info );
			ctx.restore();
		}
		wear( ctx, W, H, info.seed );
	} );
}

// planar-by-angle UVs for a body lying along x: u from x (minX..maxX), v from the angle round x (0 at -y, 0.5 at +y)
export function tubeUV( geo ) {
	geo.computeBoundingBox();
	const bb = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv, cy = ( bb.min.y + bb.max.y ) / 2, cz = ( bb.min.z + bb.max.z ) / 2;
	for ( let i = 0; i < p.count; i ++ ) {
		const a = Math.atan2( p.getZ( i ) - cz, - ( p.getY( i ) - cy ) ); // 0 at -y, ±π at +y
		uv.setXY( i, ( p.getX( i ) - bb.min.x ) / ( bb.max.x - bb.min.x || 1 ), ( a / ( 2 * PI ) + 1 ) % 1 );
	}
	uv.needsUpdate = true;
	return geo;
}

// How a printed upright container sits in the first-person hand (render ViewModel reads userData.hold / view): the
// hand round its body, upright, the front of the label (u = 0.1 of a turn, as wrapTex prints it) turned to the eye.
// The hold's own front is a quarter turn round from the label's, so the fingers close on the side, not across it.
const rotY = ( [ x, y, z ], t ) => [ x * Math.cos( t ) + z * Math.sin( t ), y, - x * Math.sin( t ) + z * Math.cos( t ) ];
export function holdUpright( g, h, r, o = {} ) {
	const turn = o.turn ?? - PI / 2;
	g.userData.hold = { p: [ 0, h * ( o.at ?? 0.42 ), 0 ], a: [ 0, 1, 0 ], f: rotY( o.front ?? [ Math.sin( 0.2 * PI ), 0, Math.cos( 0.2 * PI ) ], turn ), r: Math.min( 0.04, r ) };
	// bigger things sit further out and lower, so a cereal box doesn't fill the screen
	const k = Math.max( 0, h - 0.12 );
	g.userData.view = { at: o.view ?? [ 0.15 + k * 0.3, - 0.15 - k * 0.5, - 0.36 - k * 2.2 ], axis: [ 0.1, 1, 0.12 ], front: rotY( [ - 0.3, 0.05, 1 ], turn ) };
	return g;
}
