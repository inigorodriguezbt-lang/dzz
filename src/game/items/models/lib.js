// Shared building blocks for the procedural item models: cached materials (all patched for the world's
// atmosphere), printed label / fabric textures drawn on canvases, and small geometry helpers.
// Models are real-world size in metres, origin at the centre of the bottom, long axis along +x.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { patchMaterial, tex } from '../../../render/Materials.js';

export const PI = Math.PI;

// ---- materials -----------------------------------------------------------------------------------------

const mats = new Map();

// A cached, patched MeshStandardMaterial. o: { rough, metal, map, emissive, emissiveIntensity, transparent,
// opacity, side, flat, key }. Transparent materials go to the post layer (userData.layer = 1).
export function M( color = 0x888888, o = {} ) {
	const key = [ typeof color === 'number' ? color : String( color ), o.rough ?? 0.7, o.metal ?? 0, o.map?.uuid || '', o.emissive ?? '', o.emissiveIntensity ?? '',
		o.transparent ? 't' + ( o.opacity ?? 0.4 ) : '', o.side ?? '', o.flat ? 'f' : '', o.key || '' ].join( '|' );
	let m = mats.get( key );
	if ( m ) return m;
	m = new THREE.MeshStandardMaterial( {
		color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, map: o.map || null,
		emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1, flatShading: !! o.flat,
		side: o.side ?? THREE.FrontSide,
	} );
	if ( o.transparent ) {
		m.transparent = true; m.opacity = o.opacity ?? 0.4; m.depthWrite = false;
		m.userData.layer = 1;
	}
	patchMaterial( m, 'item' );
	mats.set( key, m );
	return m;
}

// common surfaces
export const MAT = {
	metal: () => M( 0xb8bcc2, { rough: 0.32, metal: 0.9 } ),
	tin: () => M( 0xc9cdd2, { rough: 0.28, metal: 0.95 } ),
	gold: () => M( 0xd4a64a, { rough: 0.3, metal: 0.9 } ),
	darkMetal: () => M( 0x3a3d42, { rough: 0.45, metal: 0.8 } ),
	blackPlastic: () => M( 0x1e1f22, { rough: 0.55 } ),
	rubber: () => M( 0x141414, { rough: 0.9 } ),
	white: () => M( 0xeeeeea, { rough: 0.6 } ),
	glass: ( c = 0xcfe6ee, op = 0.32 ) => M( c, { rough: 0.05, transparent: true, opacity: op } ),
	wood: () => M( 0x8a5a33, { rough: 0.8 } ),
	lightWood: () => M( 0xc49a63, { rough: 0.75 } ),
	paper: () => M( 0xe9e2cf, { rough: 0.95 } ),
	cardboard: () => M( 0xb58a57, { rough: 0.95 } ),
};

// a clone of a world texture with its own repeat (the source image is shared)
export function worldTex( name, rx = 1, ry = 1 ) {
	const t = tex( name ).clone();
	t.repeat.set( rx, ry );
	t.needsUpdate = true;
	return t;
}

// ---- canvas textures -------------------------------------------------------------------------------------

const texCache = new Map();
export function canvasTex( key, w, h, draw, { repeat = false, srgb = true } = {} ) {
	let t = texCache.get( key );
	if ( t ) return t;
	const c = document.createElement( 'canvas' );
	c.width = w; c.height = h;
	const ctx = c.getContext( '2d' );
	draw( ctx, w, h );
	t = new THREE.CanvasTexture( c );
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	t.anisotropy = 4;
	if ( repeat ) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	texCache.set( key, t );
	return t;
}

export const css = ( c ) => typeof c === 'number' ? '#' + c.toString( 16 ).padStart( 6, '0' ) : c;
export function shade( c, k ) {
	const col = new THREE.Color( c );
	if ( k < 0 ) col.multiplyScalar( 1 + k ); else col.lerp( new THREE.Color( 1, 1, 1 ), k );
	return col.getHex();
}

function rng( seed ) {
	let s = seed >>> 0 || 7;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; };
}
export function hashStr( s ) { let h = 2166136261; for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); } return h >>> 0; }

// fit a line of text into a width
function fitText( ctx, text, maxW, size, weight = 'bold', family = 'Arial, Helvetica, sans-serif' ) {
	let s = size;
	ctx.font = `${weight} ${s}px ${family}`;
	while ( s > 8 && ctx.measureText( text ).width > maxW ) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
	return s;
}

// little vector glyphs for labels
export function glyph( ctx, kind, x, y, s, color, color2 = '#ffffff' ) {
	ctx.save();
	ctx.translate( x, y );
	ctx.fillStyle = color; ctx.strokeStyle = color;
	switch ( kind ) {
		case 'fish':
			ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.55, s * 0.25, 0, 0, PI * 2 ); ctx.fill();
			ctx.beginPath(); ctx.moveTo( s * 0.45, 0 ); ctx.lineTo( s * 0.8, - s * 0.25 ); ctx.lineTo( s * 0.8, s * 0.25 ); ctx.closePath(); ctx.fill();
			ctx.fillStyle = color2; ctx.beginPath(); ctx.arc( - s * 0.32, - s * 0.05, s * 0.05, 0, PI * 2 ); ctx.fill();
			break;
		case 'fruit': case 'pineapple':
			ctx.beginPath(); ctx.ellipse( 0, s * 0.12, s * 0.28, s * 0.38, 0, 0, PI * 2 ); ctx.fill();
			ctx.fillStyle = '#3f8a2e';
			for ( let i = - 2; i <= 2; i ++ ) { ctx.beginPath(); ctx.moveTo( i * s * 0.06, - s * 0.2 ); ctx.lineTo( i * s * 0.14, - s * 0.55 ); ctx.lineTo( i * s * 0.06 + s * 0.05, - s * 0.2 ); ctx.fill(); }
			break;
		case 'flower': case 'hibiscus':
			for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; ctx.beginPath(); ctx.ellipse( Math.cos( a ) * s * 0.22, Math.sin( a ) * s * 0.22, s * 0.24, s * 0.15, a, 0, PI * 2 ); ctx.fill(); }
			ctx.fillStyle = color2; ctx.beginPath(); ctx.arc( 0, 0, s * 0.08, 0, PI * 2 ); ctx.fill();
			break;
		case 'wave':
			ctx.lineWidth = s * 0.1; ctx.lineCap = 'round';
			for ( let k = 0; k < 3; k ++ ) { ctx.beginPath(); for ( let i = 0; i <= 20; i ++ ) { const t = i / 20; ctx.lineTo( ( t - 0.5 ) * s, Math.sin( t * PI * 3 ) * s * 0.08 + ( k - 1 ) * s * 0.22 ); } ctx.stroke(); }
			break;
		case 'cross':
			ctx.fillRect( - s * 0.12, - s * 0.4, s * 0.24, s * 0.8 ); ctx.fillRect( - s * 0.4, - s * 0.12, s * 0.8, s * 0.24 );
			break;
		case 'star':
			ctx.beginPath(); for ( let i = 0; i < 10; i ++ ) { const a = i / 10 * PI * 2 - PI / 2, r = i % 2 ? s * 0.2 : s * 0.45; ctx.lineTo( Math.cos( a ) * r, Math.sin( a ) * r ); } ctx.fill();
			break;
		case 'leaf':
			ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.18, s * 0.42, 0.5, 0, PI * 2 ); ctx.fill();
			break;
		case 'bean': case 'coffee':
			ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.3, s * 0.4, 0.4, 0, PI * 2 ); ctx.fill();
			ctx.strokeStyle = color2; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.moveTo( - s * 0.1, - s * 0.3 ); ctx.quadraticCurveTo( s * 0.12, 0, - s * 0.05, s * 0.32 ); ctx.stroke();
			break;
		case 'drop':
			ctx.beginPath(); ctx.moveTo( 0, - s * 0.45 ); ctx.quadraticCurveTo( s * 0.4, s * 0.05, 0, s * 0.4 ); ctx.quadraticCurveTo( - s * 0.4, s * 0.05, 0, - s * 0.45 ); ctx.fill();
			break;
		case 'bolt':
			ctx.beginPath(); ctx.moveTo( s * 0.1, - s * 0.45 ); ctx.lineTo( - s * 0.25, s * 0.05 ); ctx.lineTo( 0, s * 0.05 ); ctx.lineTo( - s * 0.1, s * 0.45 ); ctx.lineTo( s * 0.25, - s * 0.05 ); ctx.lineTo( 0, - s * 0.05 ); ctx.closePath(); ctx.fill();
			break;
		case 'pill':
			ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.42, s * 0.18, - 0.6, 0, PI * 2 ); ctx.fill();
			ctx.fillStyle = color2; ctx.beginPath(); ctx.ellipse( s * 0.14, - s * 0.1, s * 0.2, s * 0.16, - 0.6, 0, PI * 2 ); ctx.fill();
			break;
		case 'sun':
			ctx.beginPath(); ctx.arc( 0, 0, s * 0.22, 0, PI * 2 ); ctx.fill();
			ctx.lineWidth = s * 0.06; for ( let i = 0; i < 10; i ++ ) { const a = i / 10 * PI * 2; ctx.beginPath(); ctx.moveTo( Math.cos( a ) * s * 0.3, Math.sin( a ) * s * 0.3 ); ctx.lineTo( Math.cos( a ) * s * 0.45, Math.sin( a ) * s * 0.45 ); ctx.stroke(); }
			break;
		case 'palm':
			ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.moveTo( 0, s * 0.45 ); ctx.quadraticCurveTo( s * 0.1, 0, 0, - s * 0.2 ); ctx.stroke();
			for ( let i = 0; i < 6; i ++ ) { const a = - PI / 2 + ( i - 2.5 ) * 0.5; ctx.beginPath(); ctx.ellipse( Math.cos( a ) * s * 0.2, - s * 0.2 + Math.sin( a ) * s * 0.2, s * 0.24, s * 0.06, a, 0, PI * 2 ); ctx.fill(); }
			break;
		case 'cow': case 'meat':
			ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.42, s * 0.28, 0.2, 0, PI * 2 ); ctx.fill();
			ctx.fillStyle = color2; ctx.beginPath(); ctx.arc( s * 0.18, - s * 0.02, s * 0.08, 0, PI * 2 ); ctx.fill();
			break;
		case 'mountain':
			ctx.beginPath(); ctx.moveTo( - s * 0.5, s * 0.3 ); ctx.lineTo( - s * 0.1, - s * 0.3 ); ctx.lineTo( s * 0.1, - s * 0.05 ); ctx.lineTo( s * 0.2, - s * 0.2 ); ctx.lineTo( s * 0.5, s * 0.3 ); ctx.closePath(); ctx.fill();
			break;
		case 'bar':
			ctx.fillRect( - s * 0.45, - s * 0.15, s * 0.9, s * 0.3 );
			break;
		default: // dot
			ctx.beginPath(); ctx.arc( 0, 0, s * 0.35, 0, PI * 2 ); ctx.fill();
	}
	ctx.restore();
}

// A printed product label. spec: { bg, fg, text, sub, band (colour), band2, accent, glyph, style, w, h, split }
// style: 'plain' | 'band' | 'stripes' | 'badge' | 'split' | 'military' | 'medical'.
// `split` (0..1) reserves the right part of the texture for sides (box atlases); the art fills the left.
export function labelTex( spec ) {
	const key = 'label:' + JSON.stringify( spec );
	const W = spec.w || 512, H = spec.h || 256;
	return canvasTex( key, W, H, ( ctx ) => {
		const split = spec.split || 1;
		const w = W * split, h = H;
		const bg = css( spec.bg ?? 0xffffff ), fg = css( spec.fg ?? 0x222222 ), band = css( spec.band ?? spec.fg ?? 0x333333 );
		const accent = css( spec.accent ?? spec.band ?? 0xcc3333 );
		ctx.fillStyle = bg; ctx.fillRect( 0, 0, W, H );
		const r = rng( hashStr( key ) );
		const style = spec.style || 'band';
		if ( style === 'band' ) { ctx.fillStyle = band; ctx.fillRect( 0, h * 0.62, w, h * 0.2 ); ctx.fillStyle = accent; ctx.fillRect( 0, h * 0.84, w, h * 0.05 ); }
		if ( style === 'stripes' ) { ctx.fillStyle = band; for ( let i = 0; i < 6; i ++ ) ctx.fillRect( 0, h * ( 0.05 + i * 0.16 ), w, h * 0.05 ); }
		if ( style === 'split' ) { ctx.fillStyle = band; ctx.fillRect( 0, 0, w, h * 0.34 ); ctx.fillStyle = accent; ctx.fillRect( 0, h * 0.34, w, h * 0.04 ); }
		if ( style === 'badge' ) { ctx.fillStyle = band; ctx.beginPath(); ctx.ellipse( w * 0.5, h * 0.46, w * 0.36, h * 0.36, 0, 0, PI * 2 ); ctx.fill(); }
		if ( style === 'military' ) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; for ( let i = 0; i < 40; i ++ ) ctx.fillRect( r() * w, r() * h, 20 + r() * 60, 2 ); }
		if ( style === 'medical' ) { ctx.fillStyle = band; ctx.fillRect( 0, 0, w, h * 0.22 ); ctx.fillRect( 0, h * 0.86, w, h * 0.14 ); }
		// glyph
		if ( spec.glyph ) {
			const gx = spec.glyphX ?? ( style === 'badge' ? 0.5 : 0.18 ), gy = spec.glyphY ?? ( style === 'split' ? 0.17 : 0.4 );
			glyph( ctx, spec.glyph, w * gx, h * gy, h * ( spec.glyphS ?? 0.42 ), css( spec.glyphColor ?? accent ), bg );
		}
		// text
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		if ( spec.text ) {
			const tx = spec.textX ?? ( spec.glyph && style !== 'badge' && style !== 'split' ? 0.6 : 0.5 );
			const ty = spec.textY ?? ( style === 'band' ? 0.36 : style === 'split' ? 0.6 : style === 'medical' ? 0.5 : 0.42 );
			const maxW = w * ( spec.glyph && style !== 'badge' && style !== 'split' ? 0.62 : 0.86 );
			fitText( ctx, spec.text, maxW, h * ( spec.size ?? 0.3 ), spec.weight || '900', spec.font );
			ctx.fillStyle = css( spec.textColor ?? ( style === 'badge' ? bg : fg ) );
			if ( spec.outline ) { ctx.lineWidth = 6; ctx.strokeStyle = css( spec.outline ); ctx.strokeText( spec.text, w * tx, h * ty ); }
			ctx.fillText( spec.text, w * tx, h * ty );
		}
		if ( spec.sub ) {
			const sy = spec.subY ?? ( style === 'band' ? 0.72 : style === 'split' ? 0.84 : 0.78 );
			fitText( ctx, spec.sub, w * 0.88, h * 0.11, 'bold' );
			ctx.fillStyle = css( spec.subColor ?? ( style === 'band' ? bg : fg ) );
			ctx.fillText( spec.sub, w * 0.5, h * sy );
		}
		// the side strip of a box atlas: solid band colour with a barcode
		if ( split < 1 ) {
			ctx.fillStyle = css( spec.side ?? spec.band ?? spec.bg ); ctx.fillRect( w, 0, W - w, H );
			ctx.fillStyle = '#ffffff'; ctx.fillRect( w + ( W - w ) * 0.2, H * 0.62, ( W - w ) * 0.6, H * 0.28 );
			ctx.fillStyle = '#111111';
			for ( let x = w + ( W - w ) * 0.25; x < w + ( W - w ) * 0.75; x += 2 + Math.floor( r() * 3 ) ) ctx.fillRect( x, H * 0.65, 1 + Math.floor( r() * 2 ), H * 0.2 );
		}
		// a little print wear
		ctx.fillStyle = 'rgba(0,0,0,0.035)';
		for ( let i = 0; i < 60; i ++ ) ctx.fillRect( r() * W, r() * H, 1 + r() * 3, 1 + r() * 3 );
	} );
}

// Fabric prints (tiling). kind: plain | hibiscus | plumeria | monstera | pineapple | honu | multicam | woodland | marpat
// | desert | plaid | stripes | floral | paisley | weave | knit | denim | hivis | tiedye | text:<string> | leather | canvas | mesh
export function printTex( kind = 'plain', c1 = 0x888888, c2 = 0xffffff, c3 = null ) {
	const key = `print:${kind}:${c1}:${c2}:${c3}`;
	return canvasTex( key, 256, 256, ( ctx, W, H ) => {
		const r = rng( hashStr( key ) );
		const A = css( c1 ), B = css( c2 ), C = css( c3 ?? shade( c2, - 0.3 ) );
		ctx.fillStyle = A; ctx.fillRect( 0, 0, W, H );
		// wrap-around stamp so prints tile
		const stamp = ( fn, x, y ) => { for ( const dx of [ - W, 0, W ] ) for ( const dy of [ - H, 0, H ] ) { ctx.save(); ctx.translate( x + dx, y + dy ); fn(); ctx.restore(); } };
		const blotches = ( cols, n, s0, s1 ) => { for ( let i = 0; i < n; i ++ ) { const c = cols[ i % cols.length ], x = r() * W, y = r() * H, s = s0 + r() * ( s1 - s0 ), a = r() * PI; stamp( () => { ctx.fillStyle = c; ctx.rotate( a ); ctx.beginPath(); for ( let k = 0; k < 9; k ++ ) { const t = k / 9 * PI * 2, rr = s * ( 0.6 + r() * 0.5 ); ctx.lineTo( Math.cos( t ) * rr * 1.5, Math.sin( t ) * rr ); } ctx.fill(); }, x, y ); } };
		switch ( kind.split( ':' )[ 0 ] ) {
			case 'hibiscus':
				for ( let i = 0; i < 9; i ++ ) { const x = r() * W, y = r() * H, s = 38 + r() * 26, a = r() * PI; stamp( () => { ctx.rotate( a ); glyph( ctx, 'leaf', s * 0.5, s * 0.3, s * 1.2, C ); glyph( ctx, 'hibiscus', 0, 0, s, B, css( shade( c2, 0.6 ) ) ); }, x, y ); }
				break;
			case 'plumeria':
				for ( let i = 0; i < 14; i ++ ) { const x = r() * W, y = r() * H, s = 22 + r() * 16, a = r() * PI; stamp( () => { ctx.rotate( a ); for ( let k = 0; k < 5; k ++ ) { const t = k / 5 * PI * 2; ctx.fillStyle = B; ctx.beginPath(); ctx.ellipse( Math.cos( t ) * s * 0.3, Math.sin( t ) * s * 0.3, s * 0.32, s * 0.16, t + 0.4, 0, PI * 2 ); ctx.fill(); } ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc( 0, 0, s * 0.12, 0, PI * 2 ); ctx.fill(); }, x, y ); }
				break;
			case 'monstera':
				for ( let i = 0; i < 7; i ++ ) { const x = r() * W, y = r() * H, s = 50 + r() * 30, a = r() * PI; stamp( () => { ctx.rotate( a ); ctx.fillStyle = r() < 0.5 ? B : C; ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.5, s * 0.42, 0, 0, PI * 2 ); ctx.fill(); ctx.strokeStyle = A; ctx.lineWidth = 3; for ( let k = - 3; k <= 3; k ++ ) { ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( Math.cos( k * 0.4 ) * s * 0.55, Math.sin( k * 0.4 ) * s * 0.5 ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( - Math.cos( k * 0.4 ) * s * 0.55, Math.sin( k * 0.4 ) * s * 0.5 ); ctx.stroke(); } }, x, y ); }
				break;
			case 'pineapple':
				for ( let i = 0; i < 12; i ++ ) { const x = ( i % 4 ) * 64 + 32 + ( Math.floor( i / 4 ) % 2 ) * 32, y = Math.floor( i / 4 ) * 85 + 40; stamp( () => glyph( ctx, 'pineapple', 0, 0, 44, B ), x, y ); }
				break;
			case 'honu':
				for ( let i = 0; i < 8; i ++ ) { const x = r() * W, y = r() * H, s = 30 + r() * 12, a = r() * PI * 2; stamp( () => { ctx.rotate( a ); ctx.fillStyle = B; ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.45, s * 0.35, 0, 0, PI * 2 ); ctx.fill(); ctx.beginPath(); ctx.arc( s * 0.52, 0, s * 0.13, 0, PI * 2 ); ctx.fill(); for ( const [ fx, fy ] of [ [ 0.25, 0.4 ], [ 0.25, - 0.4 ], [ - 0.3, 0.33 ], [ - 0.3, - 0.33 ] ] ) { ctx.beginPath(); ctx.ellipse( fx * s, fy * s, s * 0.18, s * 0.08, fy > 0 ? 0.6 : - 0.6, 0, PI * 2 ); ctx.fill(); } ctx.strokeStyle = A; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse( 0, 0, s * 0.25, s * 0.18, 0, 0, PI * 2 ); ctx.stroke(); }, x, y ); }
				break;
			case 'multicam': blotches( [ '#b5a47a', '#8b7a52', '#6b6a45', '#c8bd96', '#5a4a33' ], 60, 8, 22 ); break;
			case 'woodland': blotches( [ '#56613b', '#3a3525', '#7a6a45', '#1f1f1a' ], 55, 10, 26 ); break;
			case 'marpat': for ( let i = 0; i < 2600; i ++ ) { ctx.fillStyle = [ '#4a5234', '#6d6a4b', '#2c2e22', '#8a8260' ][ Math.floor( r() * 4 ) ]; ctx.fillRect( Math.floor( r() * 64 ) * 4, Math.floor( r() * 64 ) * 4, 4, 4 ); } break;
			case 'desert': blotches( [ '#c9b48a', '#a88f65', '#e0d0a8' ], 50, 10, 26 ); break;
			case 'plaid':
				for ( let i = 0; i < 4; i ++ ) { ctx.fillStyle = B; ctx.globalAlpha = 0.55; ctx.fillRect( i * 64 + 10, 0, 22, H ); ctx.fillRect( 0, i * 64 + 10, W, 22 ); ctx.globalAlpha = 0.8; ctx.fillStyle = C; ctx.fillRect( i * 64 + 44, 0, 4, H ); ctx.fillRect( 0, i * 64 + 44, W, 4 ); }
				ctx.globalAlpha = 1;
				break;
			case 'stripes': ctx.fillStyle = B; for ( let i = 0; i < 8; i ++ ) ctx.fillRect( 0, i * 32, W, 12 ); break;
			case 'floral': for ( let i = 0; i < 22; i ++ ) { const x = r() * W, y = r() * H; stamp( () => glyph( ctx, 'flower', 0, 0, 16 + r() * 12, r() < 0.5 ? B : C, '#ffe28a' ), x, y ); } break;
			case 'paisley':
				for ( let i = 0; i < 16; i ++ ) { const x = r() * W, y = r() * H, a = r() * PI * 2; stamp( () => { ctx.rotate( a ); ctx.strokeStyle = B; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc( 0, 0, 12, 0, PI * 2 ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( 12, 0 ); ctx.quadraticCurveTo( 26, 18, 4, 26 ); ctx.stroke(); ctx.fillStyle = B; ctx.beginPath(); ctx.arc( 0, 0, 4, 0, PI * 2 ); ctx.fill(); }, x, y ); }
				break;
			case 'weave':
				for ( let y = 0; y < H; y += 16 ) for ( let x = 0; x < W; x += 16 ) { ctx.fillStyle = ( ( x + y ) / 16 ) % 2 ? B : C; ctx.fillRect( x + 1, y + 1, ( ( x + y ) / 16 ) % 2 ? 30 : 14, 14 ); }
				break;
			case 'knit': ctx.strokeStyle = B; ctx.lineWidth = 3; for ( let y = 0; y < H; y += 10 ) for ( let x = 0; x < W; x += 10 ) { ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + 5, y + 8 ); ctx.lineTo( x + 10, y ); ctx.stroke(); } break;
			case 'denim':
				for ( let i = 0; i < 4000; i ++ ) { ctx.fillStyle = r() < 0.5 ? B : C; ctx.globalAlpha = 0.25; const x = r() * W, y = r() * H; ctx.fillRect( x, y, 6, 1 ); }
				ctx.globalAlpha = 1;
				break;
			case 'hivis': ctx.fillStyle = B; ctx.fillRect( 0, H * 0.3, W, 26 ); ctx.fillRect( 0, H * 0.7, W, 26 ); break;
			case 'tiedye':
				for ( let k = 12; k > 0; k -- ) { ctx.fillStyle = [ '#e64a7a', '#f5a623', '#f8e71c', '#50c878', '#4a90e2', '#9b59b6' ][ k % 6 ]; ctx.beginPath(); ctx.arc( W / 2, H / 2, k * 20, 0, PI * 2 ); ctx.fill(); }
				break;
			case 'text': {
				const t = kind.slice( 5 );
				ctx.fillStyle = B; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
				fitText( ctx, t, W * 0.8, 90, '900' );
				ctx.fillText( t, W / 2, H / 2 );
				break;
			}
			case 'leather': for ( let i = 0; i < 900; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)'; ctx.fillRect( r() * W, r() * H, 3, 2 ); } break;
			case 'mesh': ctx.strokeStyle = B; ctx.lineWidth = 2; for ( let i = 0; i < W; i += 8 ) { ctx.beginPath(); ctx.moveTo( i, 0 ); ctx.lineTo( i, H ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( 0, i ); ctx.lineTo( W, i ); ctx.stroke(); } break;
			case 'canvas': default:
				for ( let i = 0; i < 2500; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; ctx.fillRect( r() * W, r() * H, 2, 2 ); }
		}
	}, { repeat: true } );
}

// fabric material: a print, tiled `rep` times over the UV square
const fabricTex = new Map();
export function fabric( color, print = 'plain', color2 = 0xffffff, o = {} ) {
	if ( print === 'plain' || ! print ) return M( color, { rough: o.rough ?? 0.92, ...o } );
	const k = `${print}:${color}:${color2}:${o.color3 ?? ''}:${o.rep ?? 1.5}`;
	let t = fabricTex.get( k );
	if ( ! t ) {
		t = printTex( print, color, color2, o.color3 ?? null ).clone();
		t.repeat.set( o.rep ?? 1.5, o.rep ?? 1.5 );
		t.needsUpdate = true;
		fabricTex.set( k, t );
	}
	return M( 0xffffff, { rough: o.rough ?? 0.9, map: t, metal: o.metal, emissive: o.emissive } );
}

// a vertical gradient (fruit skins): stops = [ [ t, colour ], ... ] top (v=1) .. bottom (v=0), speckles
export function gradientTex( stops, speck = 0, speckColor = '#000000', seed = 1 ) {
	const key = 'grad:' + JSON.stringify( stops ) + speck + speckColor + seed;
	return canvasTex( key, 64, 128, ( ctx, W, H ) => {
		const g = ctx.createLinearGradient( 0, 0, 0, H );
		for ( const [ t, c ] of stops ) g.addColorStop( t, css( c ) );
		ctx.fillStyle = g; ctx.fillRect( 0, 0, W, H );
		const r = rng( seed );
		ctx.fillStyle = speckColor;
		for ( let i = 0; i < speck; i ++ ) { ctx.globalAlpha = 0.25 + r() * 0.4; ctx.fillRect( r() * W, r() * H, 1 + r() * 2, 1 + r() * 2 ); }
		ctx.globalAlpha = 1;
	} );
}

// ---- geometry helpers ----------------------------------------------------------------------------------------

// all sit on y = 0 unless noted
export const G = {
	box: ( w, h, d ) => new THREE.BoxGeometry( w, h, d ).translate( 0, h / 2, 0 ),
	rbox: ( w, h, d, r = 0.01, seg = 2 ) => new RoundedBoxGeometry( w, h, d, seg, Math.max( 1e-4, Math.min( r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4 ) ) ).translate( 0, h / 2, 0 ),
	cyl: ( rt, rb, h, seg = 16, open = false ) => new THREE.CylinderGeometry( rt, rb, h, seg, 1, open ).translate( 0, h / 2, 0 ),
	// a horizontal cylinder along x, centred at the origin
	cylX: ( r, len, seg = 14, r2 = r, open = false ) => new THREE.CylinderGeometry( r2, r, len, seg, 1, open ).rotateZ( - PI / 2 ),
	cylZ: ( r, len, seg = 14, r2 = r ) => new THREE.CylinderGeometry( r2, r, len, seg ).rotateX( PI / 2 ),
	sph: ( r, ws = 14, hs = 10, ps = 0, pl = PI * 2, ts = 0, tl = PI ) => new THREE.SphereGeometry( r, ws, hs, ps, pl, ts, tl ),
	dome: ( r, ws = 16, hs = 8 ) => new THREE.SphereGeometry( r, ws, hs, 0, PI * 2, 0, PI / 2 ),
	torus: ( R, r, rs = 8, ts = 24, arc = PI * 2 ) => new THREE.TorusGeometry( R, r, rs, ts, arc ),
	lathe: ( pts, seg = 18, ps = 0, pl = PI * 2 ) => new THREE.LatheGeometry( pts.map( p => new THREE.Vector2( Math.max( 0, p[ 0 ] ), p[ 1 ] ) ), seg, ps, pl ),
	cone: ( r, h, seg = 12 ) => new THREE.ConeGeometry( r, h, seg ).translate( 0, h / 2, 0 ),
	capsX: ( r, len, seg = 10 ) => new THREE.CapsuleGeometry( r, Math.max( 0.001, len - r * 2 ), 4, seg ).rotateZ( PI / 2 ),
	tube: ( pts, r, seg = 12, rs = 6 ) => new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( ...p ) ) ), seg, r, rs, false ),
	// rectangular tin with a wrapped label: a 4-sided open cylinder turned 45° and stretched
	rectWrap: ( w, h, d, topScale = 1 ) => {
		const g = new THREE.CylinderGeometry( Math.SQRT1_2 * topScale, Math.SQRT1_2, h, 4, 1, true ).rotateY( PI / 4 );
		g.scale( w, 1, d );
		return g.translate( 0, h / 2, 0 );
	},
	prismX: ( w, h, len ) => new THREE.CylinderGeometry( 0.5, 0.5, len, 3 ).rotateZ( PI / 2 ).rotateX( PI / 2 ).scale( 1, h / 0.75, w / 0.866 ).translate( 0, h * 0.333, 0 ),
};

// planar label UVs: faces pointing along `axis` (x|y|z) get the art (u in 0..split), other faces the side strip
export function labelUV( geo, axis = 'z', split = 0.8 ) {
	geo.computeBoundingBox();
	const bb = geo.boundingBox, pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
	const ax = { x: 0, y: 1, z: 2 }[ axis ];
	const size = new THREE.Vector3(); bb.getSize( size );
	for ( let i = 0; i < pos.count; i ++ ) {
		const n = [ nor.getX( i ), nor.getY( i ), nor.getZ( i ) ];
		const p = [ pos.getX( i ), pos.getY( i ), pos.getZ( i ) ];
		// the two in-plane axes of the art face
		const ua = ax === 0 ? 2 : 0, va = ax === 1 ? 2 : 1;
		const fu = ( p[ ua ] - bb.min.getComponent( ua ) ) / Math.max( 1e-6, size.getComponent( ua ) );
		const fv = ( p[ va ] - bb.min.getComponent( va ) ) / Math.max( 1e-6, size.getComponent( va ) );
		if ( Math.abs( n[ ax ] ) >= 0.55 ) {
			let u = n[ ax ] > 0 ? fu : 1 - fu;
			if ( ax === 0 ) u = 1 - u;
			const v = ax === 1 ? 1 - fv : fv;
			uv.setXY( i, u * split, v );
		} else {
			uv.setXY( i, split + ( 1 - split ) * ( 0.1 + 0.8 * fu ), fv );
		}
	}
	uv.needsUpdate = true;
	return geo;
}

// ---- assembling --------------------------------------------------------------------------------------------

export function group() { return new THREE.Group(); }

// add a mesh: p = [x, y, z], r = [rx, ry, rz], s = [sx, sy, sz] or a number
export function add( g, geo, mat, p = null, r = null, s = null ) {
	const m = new THREE.Mesh( geo, mat );
	if ( p ) m.position.set( p[ 0 ], p[ 1 ], p[ 2 ] );
	if ( r ) m.rotation.set( r[ 0 ], r[ 1 ], r[ 2 ] );
	if ( s != null ) { if ( typeof s === 'number' ) m.scale.setScalar( s ); else m.scale.set( s[ 0 ], s[ 1 ], s[ 2 ] ); }
	if ( mat.userData.layer ) m.layers.set( mat.userData.layer );
	m.castShadow = ! mat.transparent;
	m.receiveShadow = true;
	g.add( m );
	return m;
}

// put a group's lowest point on y = 0 and centre it in x / z
export function ground( g, centre = true ) {
	g.updateMatrixWorld( true );
	const bb = new THREE.Box3().setFromObject( g );
	if ( ! isFinite( bb.min.y ) ) return g;
	const c = bb.getCenter( new THREE.Vector3() );
	for ( const ch of g.children ) { ch.position.y -= bb.min.y; if ( centre ) { ch.position.x -= c.x; ch.position.z -= c.z; } }
	return g;
}

export const col = ( c, d ) => c ?? d;
