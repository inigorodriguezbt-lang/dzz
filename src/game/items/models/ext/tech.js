// Model builders for the tech items (docs/ITEMS_PLAN.md "tech"): hand tools, cells and chargers, devices, power
// equipment and the junk they come apart into. register( reg ) is called once by render/ItemModels.js.
// Conventions (render/ItemModels.js): metres, origin at the centre of the bottom, long axis along +x. Parts are built
// with centred geometry (B, C below) and set on the ground at the end with ground().
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, labelTex, canvasTex, shade, css, hashStr } from '../lib.js';

// centred primitives (lib's G.box / G.cyl sit on y = 0; these don't)
const B = ( w, h, d ) => new THREE.BoxGeometry( w, h, d );
const C = ( rt, rb, h, seg = 16, open = false ) => new THREE.CylinderGeometry( rt, rb, h, seg, 1, open );
// a part of a cylinder's side (a torn label, an arm cuff)
const CP = ( r, h, ts, tl, seg = 16 ) => new THREE.CylinderGeometry( r, r, h, seg, 1, true, ts, tl );
const RB = ( w, h, d, r = 0.004 ) => G.rbox( w, h, d, r ).translate( 0, - h / 2, 0 );

const chrome = () => M( 0xd4d8de, { rough: 0.18, metal: 1 } );
const steel = () => M( 0x9ea3aa, { rough: 0.35, metal: 0.9 } );
const dark = () => M( 0x2a2c30, { rough: 0.45, metal: 0.6 } );
const plastic = ( c, rough = 0.45 ) => M( c, { rough } );
const rubber = ( c = 0x18181a ) => M( c, { rough: 0.85 } );
const brass = () => M( 0xc8a24a, { rough: 0.3, metal: 0.9 } );
const flat = ( spec, o = {} ) => M( 0xffffff, { map: labelTex( spec ), rough: o.rough ?? 0.55, metal: o.metal ?? 0 } );
const glow = ( c, k = 0.6 ) => M( c, { rough: 0.3, emissive: c, emissiveIntensity: k } );

// ---- printed faces ---------------------------------------------------------------------------------------------------------

function pcbTex() {
	return canvasTex( 'tech:pcb', 256, 160, ( ctx, W, H ) => {
		ctx.fillStyle = '#1e6a3a'; ctx.fillRect( 0, 0, W, H );
		let s = 9;
		const r = () => { s = ( s * 16807 ) % 2147483647; return s / 2147483647; };
		ctx.strokeStyle = '#c8a850'; ctx.lineWidth = 2;
		for ( let i = 0; i < 40; i ++ ) {
			let x = r() * W, y = r() * H;
			ctx.beginPath(); ctx.moveTo( x, y );
			for ( let k = 0; k < 3; k ++ ) { if ( r() < 0.5 ) x += ( r() - 0.5 ) * 120; else y += ( r() - 0.5 ) * 80; ctx.lineTo( x, y ); }
			ctx.stroke();
			ctx.fillStyle = '#d8c070'; ctx.beginPath(); ctx.arc( x, y, 3, 0, PI * 2 ); ctx.fill();
		}
		ctx.fillStyle = '#e8ece8'; ctx.font = 'bold 12px monospace';
		ctx.fillText( 'R12', 20, 20 ); ctx.fillText( 'C4', 200, 140 ); ctx.fillText( 'U1', 120, 30 );
		ctx.strokeStyle = '#e8ece8'; ctx.lineWidth = 1; ctx.strokeRect( 4, 4, W - 8, H - 8 );
	} );
}

function solarTex() {
	return canvasTex( 'tech:solar', 256, 320, ( ctx, W, H ) => {
		ctx.fillStyle = '#c8ccd2'; ctx.fillRect( 0, 0, W, H );
		const cw = W / 4, ch = H / 5;
		for ( let i = 0; i < 4; i ++ ) for ( let j = 0; j < 5; j ++ ) {
			const x = i * cw + 2, y = j * ch + 2, w = cw - 4, h = ch - 4;
			const gr = ctx.createLinearGradient( x, y, x + w, y + h );
			gr.addColorStop( 0, '#1a2a5a' ); gr.addColorStop( 1, '#0e1838' );
			ctx.fillStyle = gr; ctx.fillRect( x, y, w, h );
			ctx.fillStyle = 'rgba(200,210,230,0.55)';
			for ( let k = 1; k < 3; k ++ ) ctx.fillRect( x + w * k / 3 - 1, y, 2, h );
			for ( let k = 1; k < 6; k ++ ) ctx.fillRect( x, y + h * k / 6, w, 0.6 );
		}
	} );
}

function lcdTex( key, text, bg = '#8fa88a', fg = '#1a2a1a', w = 128, h = 48 ) {
	return canvasTex( 'tech:lcd:' + key, w, h, ( ctx, W, H ) => {
		ctx.fillStyle = bg; ctx.fillRect( 0, 0, W, H );
		ctx.fillStyle = fg; ctx.font = `bold ${Math.round( H * 0.55 )}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText( text, W / 2, H / 2 + 1 );
	} );
}

function spangleTex() {
	return canvasTex( 'tech:spangle', 256, 256, ( ctx, W, H ) => {
		ctx.fillStyle = '#b4bac0'; ctx.fillRect( 0, 0, W, H );
		let s = 77;
		const r = () => { s = ( s * 16807 ) % 2147483647; return s / 2147483647; };
		for ( let i = 0; i < 160; i ++ ) {
			const x = r() * W, y = r() * H, n = 5 + Math.floor( r() * 3 ), rad = 8 + r() * 22;
			ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,66,72'},${0.03 + r() * 0.05})`;
			ctx.beginPath();
			for ( let k = 0; k < n; k ++ ) { const a = k / n * PI * 2 + r(); ctx.lineTo( x + Math.cos( a ) * rad * ( 0.6 + r() * 0.5 ), y + Math.sin( a ) * rad * ( 0.6 + r() * 0.5 ) ); }
			ctx.fill();
		}
	}, { repeat: true } );
}

// a band of label wrapped round a cylinder (cells, cans)
function wrapTex( key, spec ) {
	return canvasTex( 'tech:wrap:' + key, 256, 128, ( ctx, W, H ) => {
		ctx.fillStyle = css( spec.bg ); ctx.fillRect( 0, 0, W, H );
		if ( spec.band ) { ctx.fillStyle = css( spec.band ); ctx.fillRect( 0, H * 0.68, W, H * 0.32 ); }
		// the label is printed twice round the cylinder: each copy fits its half ("MAP-PLUS" overran into the other)
		const fit = ( text, px, weight ) => { ctx.font = `${weight} ${px}px Arial`; const k = Math.min( 1, W * 0.44 / Math.max( 1, ctx.measureText( text ).width ) ); if ( k < 1 ) ctx.font = `${weight} ${Math.floor( px * k )}px Arial`; };
		ctx.fillStyle = css( spec.fg ); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		fit( spec.text, Math.round( H * 0.34 ), 900 );
		for ( const x of [ W * 0.25, W * 0.75 ] ) { ctx.fillText( spec.text, x, H * 0.36 ); }
		if ( spec.sub ) { ctx.fillStyle = css( spec.subColor ?? spec.bg ); fit( spec.sub, Math.round( H * 0.17 ), 'bold' ); for ( const x of [ W * 0.25, W * 0.75 ] ) ctx.fillText( spec.sub, x, H * 0.84 ); }
	} );
}

// a helix along +x: a spring, a coiled cord
function helix( r, len, turns, tube, seg = 0, rs = 5 ) {
	const pts = [], n = seg || Math.max( 24, Math.round( turns * 12 ) );
	for ( let i = 0; i <= n; i ++ ) { const t = i / n, a = t * turns * PI * 2; pts.push( new THREE.Vector3( ( t - 0.5 ) * len, Math.cos( a ) * r, Math.sin( a ) * r ) ); }
	return new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), n * 2, tube, rs, false );
}
const tube = ( pts, r, seg = 24, rs = 6 ) => new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( ...p ) ) ), seg, r, rs, false );

// a case lid hinged at the back top edge (y, z), opened past upright; a printed label inside it faces the front
function lid( g, w, d, t, y, z, mat, label = null, open = 1.75 ) {
	const pv = group();
	add( pv, RB( w, t, d, Math.min( 0.008, t / 2 ) ), mat, [ 0, t / 2, d / 2 ] );
	if ( label ) add( pv, new THREE.PlaneGeometry( w * 0.55, d * 0.3 ).rotateX( PI / 2 ), label, [ 0, - 0.0008, d * 0.5 ] );
	pv.position.set( 0, y, z );
	pv.rotation.x = - open;
	g.add( pv );
	return pv;
}

// a ring of flutes round a grip along x
function flutes( g, x, y, r, len, n, mat ) {
	for ( let i = 0; i < n; i ++ ) { const a = i / n * PI * 2; add( g, B( len, 0.003, r * 0.45 ), mat, [ x, y + Math.cos( a ) * r * 0.97, Math.sin( a ) * r * 0.97 ], [ a, 0, 0 ] ); }
}

export function register( reg ) {
	// =================================== hand tools ===================================

	reg( 'tech_screwdriver', ( s ) => {
		const g = group(), c = s.color ?? 0xd8302a, y = 0.016;
		const handle = G.lathe( [ [ 0.006, 0 ], [ 0.013, 0.004 ], [ 0.016, 0.03 ], [ 0.015, 0.08 ], [ 0.011, 0.1 ], [ 0.008, 0.105 ] ], 14 ).rotateZ( - PI / 2 );
		add( g, handle, M( c, { rough: 0.25 } ), [ - 0.105, y, 0 ] );
		flutes( g, - 0.06, y, 0.0155, 0.05, 6, M( shade( c, - 0.45 ), { rough: 0.5 } ) );
		add( g, C( 0.0042, 0.0042, 0.11, 10 ).rotateZ( - PI / 2 ), M( 0xc8ccd2, { rough: 0.22, metal: 0.95 } ), [ 0.052, y, 0 ] );
		add( g, B( 0.012, 0.0016, 0.0075 ), steel(), [ 0.112, y, 0 ] );
		return ground( g );
	} );

	reg( 'tech_screwset', () => {
		const g = group();
		add( g, RB( 0.17, 0.022, 0.11, 0.006 ), plastic( 0x2a2c30 ), [ 0, 0.011, 0 ] );
		add( g, B( 0.16, 0.002, 0.1 ), plastic( 0xc0282a, 0.7 ), [ 0, 0.021, 0 ] );
		const cols = [ 0xd8302a, 0x1a1a1a, 0xf2c21a, 0xd8302a, 0x1a1a1a, 0xf2c21a, 0x2a6ad6 ];
		cols.forEach( ( c, i ) => {
			const z = - 0.042 + i * 0.014;
			add( g, C( 0.0055, 0.0055, 0.055, 10 ).rotateZ( - PI / 2 ), M( c, { rough: 0.3 } ), [ - 0.04, 0.028, z ] );
			add( g, C( 0.0015, 0.0015, 0.05, 6 ).rotateZ( - PI / 2 ), chrome(), [ 0.012, 0.028, z ] );
		} );
		// the clear lid, open behind
		lid( g, 0.17, 0.11, 0.004, 0.022, - 0.055, MAT.glass( 0xd8e6f0, 0.3 ), null, 1.9 );
		return ground( g );
	} );

	reg( 'tech_pliers', ( s ) => {
		const g = group(), c = s.color ?? 0x2a5ad0, y = 0.006;
		for ( const side of [ - 1, 1 ] ) {
			const grip = new THREE.CapsuleGeometry( 0.0075, 0.1, 4, 8 ).rotateZ( PI / 2 ); grip.scale( 1, 0.7, 1 );
			add( g, grip, M( c, { rough: 0.6 } ), [ - 0.04, y, side * 0.016 ], [ 0, side * 0.16, 0 ] );
			add( g, B( 0.04, 0.007, 0.008 ), steel(), [ 0.025, y, side * 0.005 ], [ 0, side * 0.12, 0 ] );
			add( g, C( 0.0015, 0.0048, 0.055, 5 ).rotateZ( - PI / 2 ), M( 0x5a5e64, { rough: 0.4, metal: 0.9 } ), [ 0.075, y, side * 0.0032 ] );
		}
		add( g, C( 0.0065, 0.0065, 0.013, 12 ), chrome(), [ 0.045, y, 0 ] );
		return ground( g );
	} );

	reg( 'tech_hacksaw', () => {
		const g = group(), u = group(), frame = M( 0xc0282a, { rough: 0.35, metal: 0.5 } );
		add( u, B( 0.37, 0.012, 0.018 ), frame, [ 0, 0.115, 0 ] );
		for ( const x of [ - 0.18, 0.18 ] ) add( u, B( 0.014, 0.12, 0.016 ), frame, [ x, 0.06, 0 ] );
		add( u, B( 0.36, 0.013, 0.0008 ), M( 0x2a5ab0, { rough: 0.3, metal: 0.8 } ), [ 0, 0.008, 0 ] );
		const grip = RB( 0.03, 0.11, 0.026, 0.01 );
		add( u, grip, rubber( 0x1a1a1a ), [ - 0.215, 0.05, 0 ], [ 0, 0, - 0.35 ] );
		for ( const x of [ - 0.18, 0.18 ] ) add( u, C( 0.005, 0.005, 0.02, 8 ).rotateX( PI / 2 ), chrome(), [ x, 0.008, 0 ] );
		u.rotation.x = - PI / 2;
		g.add( u );
		return ground( g );
	} );

	reg( 'tech_boltcutter', () => {
		const g = group(), y = 0.012, red = rubber( 0xc8281e ), metal = M( 0x3a3d42, { rough: 0.4, metal: 0.85 } );
		for ( const side of [ - 1, 1 ] ) {
			add( g, C( 0.0095, 0.0095, 0.36, 10 ).rotateZ( - PI / 2 ), metal, [ - 0.04, y, side * 0.03 ], [ 0, side * 0.09, 0 ] );
			add( g, C( 0.013, 0.013, 0.18, 12 ).rotateZ( - PI / 2 ), red, [ - 0.17, y, side * 0.042 ], [ 0, side * 0.09, 0 ] );
			add( g, B( 0.09, 0.016, 0.022 ), metal, [ 0.18, y, side * 0.013 ], [ 0, - side * 0.08, 0 ] );
			add( g, C( 0.003, 0.012, 0.06, 4 ).rotateZ( - PI / 2 ), M( 0x5a5e64, { rough: 0.35, metal: 0.9 } ), [ 0.25, y, side * 0.006 ] );
		}
		add( g, B( 0.06, 0.008, 0.07 ), metal, [ 0.15, y + 0.012, 0 ] );
		for ( const x of [ 0.13, 0.17 ] ) add( g, C( 0.008, 0.008, 0.035, 10 ), chrome(), [ x, y + 0.01, 0 ] );
		return ground( g );
	} );

	reg( 'tech_socketset', () => {
		const g = group(), cs = plastic( 0x1e1f22, 0.5 );
		add( g, RB( 0.36, 0.045, 0.21, 0.01 ), cs, [ 0, 0.0225, 0 ] );
		add( g, B( 0.34, 0.002, 0.19 ), plastic( 0xb0242a, 0.7 ), [ 0, 0.044, 0 ] );
		for ( let row = 0; row < 2; row ++ ) for ( let i = 0; i < 9; i ++ ) {
			const r = 0.007 + i * 0.0011;
			add( g, C( r, r, 0.03, 12 ), chrome(), [ - 0.15 + i * 0.026 + row * 0.01, 0.055, - 0.06 + row * 0.04 ] );
			add( g, C( r * 0.55, r * 0.55, 0.031, 6 ), M( 0x1a1a1a ), [ - 0.15 + i * 0.026 + row * 0.01, 0.0555, - 0.06 + row * 0.04 ] );
		}
		// the ratchet
		add( g, RB( 0.2, 0.012, 0.02, 0.005 ), chrome(), [ - 0.02, 0.054, 0.055 ] );
		add( g, C( 0.017, 0.017, 0.016, 16 ), chrome(), [ 0.09, 0.054, 0.055 ] );
		add( g, RB( 0.09, 0.016, 0.024, 0.008 ), rubber(), [ - 0.08, 0.054, 0.055 ] );
		// the lid, opened back, the maker's card inside it
		lid( g, 0.36, 0.21, 0.025, 0.045, - 0.105, cs, flat( { bg: 0x1e1f22, fg: 0xf2c21a, text: 'SOCKET SET', sub: '40 PC · KAPENA', style: 'plain', size: 0.3 } ) );
		for ( const x of [ - 0.12, 0.12 ] ) add( g, B( 0.03, 0.02, 0.008 ), plastic( 0xd8302a ), [ x, 0.03, 0.107 ] );
		return ground( g );
	} );

	reg( 'tech_solderiron', () => {
		const g = group(), y = 0.014;
		add( g, C( 0.012, 0.012, 0.11, 14 ).rotateZ( - PI / 2 ), plastic( 0x2a5ab0, 0.35 ), [ - 0.04, y, 0 ] );
		add( g, B( 0.06, 0.004, 0.006 ), chrome(), [ - 0.05, y + 0.013, 0 ] );
		add( g, C( 0.0125, 0.0125, 0.02, 14 ).rotateZ( - PI / 2 ), plastic( 0x1a1a1a ), [ - 0.105, y, 0 ] );
		add( g, C( 0.009, 0.012, 0.025, 12 ).rotateZ( - PI / 2 ), plastic( 0x1a1a1a ), [ 0.027, y, 0 ] );
		add( g, C( 0.005, 0.0075, 0.05, 10 ).rotateZ( - PI / 2 ), chrome(), [ 0.064, y, 0 ] );
		add( g, C( 0.0008, 0.0035, 0.025, 8 ).rotateZ( - PI / 2 ), M( 0x8a6a3a, { rough: 0.3, metal: 0.9 } ), [ 0.1, y, 0 ] );
		// a reel of solder beside it
		const reel = group();
		add( reel, C( 0.022, 0.022, 0.003, 18 ), plastic( 0xd02a2a ), [ 0, 0.0015, 0 ] );
		add( reel, C( 0.017, 0.017, 0.016, 18 ), M( 0xc8ccd0, { rough: 0.3, metal: 0.85 } ), [ 0, 0.011, 0 ] );
		add( reel, C( 0.022, 0.022, 0.003, 18 ), plastic( 0xd02a2a ), [ 0, 0.0205, 0 ] );
		reel.position.set( - 0.02, 0, 0.045 );
		g.add( reel );
		return ground( g );
	} );

	reg( 'tech_blowtorch', () => {
		const g = group(), can = M( 0xf2c21a, { rough: 0.3, metal: 0.45 } );
		add( g, C( 0.033, 0.033, 0.19, 18 ), M( 0xffffff, { map: wrapTex( 'mapp', { bg: 0xf2c21a, fg: 0x1a1a1a, text: 'MAP-PLUS', sub: 'KAPENA · 14 oz', band: 0x1a1a1a, subColor: 0xf2c21a } ), rough: 0.3, metal: 0.4 } ), [ 0, 0.095, 0 ] );
		add( g, G.lathe( [ [ 0.033, 0 ], [ 0.024, 0.025 ], [ 0.01, 0.035 ] ], 18 ), can, [ 0, 0.19, 0 ] );
		add( g, C( 0.016, 0.018, 0.035, 12 ), brass(), [ 0, 0.24, 0 ] );
		add( g, C( 0.011, 0.011, 0.012, 12 ).rotateX( PI / 2 ), M( 0x1a1a1a ), [ 0, 0.245, 0.02 ] );
		add( g, B( 0.012, 0.03, 0.014 ), plastic( 0x1a1a1a ), [ - 0.02, 0.24, 0 ] );
		const noz = C( 0.007, 0.006, 0.11, 10 ).rotateZ( - 0.9 );
		add( g, noz, chrome(), [ 0.04, 0.29, 0 ] );
		add( g, C( 0.009, 0.007, 0.022, 10 ).rotateZ( - 0.9 ), dark(), [ 0.083, 0.32, 0 ] );
		return ground( g );
	} );

	reg( 'tech_handdrill', () => {
		const g = group(), y = 0.02, red = M( 0xc0282a, { rough: 0.35, metal: 0.5 } );
		add( g, C( 0.0055, 0.0055, 0.24, 10 ).rotateZ( - PI / 2 ), steel(), [ 0.01, y, 0 ] );
		add( g, new THREE.CapsuleGeometry( 0.018, 0.07, 4, 10 ).rotateZ( PI / 2 ), MAT.wood(), [ - 0.14, y, 0 ] );
		add( g, C( 0.05, 0.05, 0.007, 28 ), red, [ 0.0, y + 0.005, - 0.03 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, B( 0.09, 0.004, 0.006 ), red, [ 0, y + 0.005, - 0.03 ], [ 0, i * PI / 4, 0 ] );
		add( g, C( 0.0035, 0.0035, 0.05, 8 ), steel(), [ 0.015, y + 0.012, - 0.055 ], [ PI / 2, 0, 0.6 ] );
		add( g, new THREE.CapsuleGeometry( 0.008, 0.035, 4, 8 ), MAT.wood(), [ 0.03, y + 0.03, - 0.075 ] );
		add( g, new THREE.CapsuleGeometry( 0.011, 0.05, 4, 8 ), MAT.wood(), [ 0.02, y, 0.04 ], [ PI / 2, 0, 0 ] );
		add( g, C( 0.009, 0.011, 0.025, 12 ).rotateZ( - PI / 2 ), dark(), [ 0.14, y, 0 ] );
		add( g, C( 0.002, 0.003, 0.06, 8 ).rotateZ( - PI / 2 ), steel(), [ 0.18, y, 0 ] );
		return ground( g );
	} );

	reg( 'tech_drill', ( s ) => {
		const g = group(), c = s.color ?? 0x1f8a4a, body = M( c, { rough: 0.4 } ), blk = plastic( 0x1e1f22, 0.6 );
		add( g, C( 0.034, 0.03, 0.16, 16 ).rotateZ( - PI / 2 ), body, [ 0, 0.19, 0 ] );
		add( g, C( 0.034, 0.034, 0.03, 16 ).rotateZ( - PI / 2 ), blk, [ - 0.09, 0.19, 0 ] );
		add( g, C( 0.024, 0.02, 0.045, 14 ).rotateZ( - PI / 2 ), blk, [ 0.1, 0.19, 0 ] );
		add( g, C( 0.008, 0.012, 0.016, 12 ).rotateZ( - PI / 2 ), chrome(), [ 0.13, 0.19, 0 ] );
		add( g, C( 0.002, 0.002, 0.05, 6 ).rotateZ( - PI / 2 ), steel(), [ 0.16, 0.19, 0 ] );
		const grip = RB( 0.04, 0.12, 0.034, 0.012 );
		add( g, grip, blk, [ - 0.02, 0.125, 0 ], [ 0, 0, 0.18 ] );
		add( g, B( 0.012, 0.022, 0.012 ), M( 0xd8302a ), [ 0.008, 0.155, 0 ] );
		add( g, RB( 0.095, 0.05, 0.075, 0.01 ), blk, [ - 0.035, 0.025, 0 ] );
		add( g, B( 0.096, 0.012, 0.076 ), body, [ - 0.035, 0.04, 0 ] );
		add( g, B( 0.06, 0.016, 0.0015 ), flat( { bg: c, fg: 0xffffff, text: 'MAKANI', sub: '18 V', style: 'plain', size: 0.4 } ), [ 0, 0.2, 0.031 ] );
		return ground( g );
	} );

	reg( 'tech_epoxy', () => {
		const g = group();
		add( g, B( 0.17, 0.003, 0.1 ), flat( { bg: 0x1a3a8a, fg: 0xf2f2f2, text: 'EPOXY', sub: '5 MINUTE · KAPENA', style: 'band', band: 0xf2c21a, size: 0.34 } ), [ 0, 0.0015, 0 ] );
		const clear = MAT.glass( 0xf2ead0, 0.55 );
		for ( const z of [ - 0.011, 0.011 ] ) {
			add( g, C( 0.0095, 0.0095, 0.11, 12 ).rotateZ( - PI / 2 ), clear, [ 0, 0.013, z ] );
			add( g, C( 0.0075, 0.0075, 0.1, 12 ).rotateZ( - PI / 2 ), M( z < 0 ? 0xf2ead0 : 0xd8b860, { rough: 0.3 } ), [ 0.003, 0.013, z ] );
		}
		add( g, B( 0.012, 0.01, 0.045 ), plastic( 0xf2f2f2 ), [ - 0.06, 0.013, 0 ] );
		add( g, C( 0.003, 0.006, 0.02, 8 ).rotateZ( - PI / 2 ), plastic( 0xf2f2f2 ), [ 0.065, 0.013, 0 ] );
		return ground( g );
	} );

	// =================================== stock and parts ===================================

	reg( 'tech_springs', () => {
		const g = group(), m = M( 0xc0c4ca, { rough: 0.25, metal: 0.95 } );
		// coarse coils: a handful of 10 cm springs at 12 segments a turn drew 6500 triangles
		add( g, helix( 0.011, 0.09, 10, 0.0019, 80, 4 ), m, [ 0, 0.013, - 0.03 ] );
		add( g, helix( 0.016, 0.065, 6, 0.0024, 48, 4 ), m, [ 0.012, 0.018, 0.015 ], [ 0, 0.5, 0 ] );
		add( g, helix( 0.008, 0.06, 11, 0.0014, 88, 4 ), M( 0x8a7a5a, { rough: 0.35, metal: 0.9 } ), [ - 0.03, 0.009, 0.05 ], [ 0, - 0.4, 0 ] );
		return ground( g );
	} );

	reg( 'tech_sheet', () => {
		// galvanised: duller than chrome, so a sheet lying flat doesn't mirror the sky blue
		const g = group(), m = M( 0xffffff, { map: spangleTex(), rough: 0.55, metal: 0.55 } );
		add( g, B( 0.45, 0.003, 0.32 ), m, [ 0, 0.0015, 0 ] );
		add( g, B( 0.45, 0.003, 0.32 ), m, [ 0.02, 0.0045, 0.012 ], [ 0, 0.05, 0 ] );
		// a bent corner
		add( g, B( 0.07, 0.003, 0.07 ), m, [ 0.22, 0.012, 0.15 ], [ 0.35, 0.8, 0.2 ] );
		return ground( g );
	} );

	reg( 'tech_escrap', () => {
		const g = group(), pcb = M( 0xffffff, { map: pcbTex(), rough: 0.5 } );
		add( g, B( 0.07, 0.0016, 0.05 ), pcb, [ - 0.02, 0.004, 0 ], [ 0.08, 0.4, 0.05 ] );
		add( g, B( 0.05, 0.0016, 0.035 ), pcb, [ 0.035, 0.01, 0.01 ], [ - 0.12, - 0.6, 0.1 ] );
		add( g, B( 0.018, 0.004, 0.012 ), plastic( 0x141414 ), [ - 0.02, 0.008, 0.005 ] );
		add( g, C( 0.005, 0.005, 0.012, 10 ), plastic( 0x2a4ab0 ), [ 0.03, 0.017, 0.012 ] );
		add( g, C( 0.004, 0.004, 0.01, 10 ), plastic( 0x1a1a1a ), [ - 0.035, 0.009, - 0.015 ] );
		for ( const [ c, z ] of [ [ 0xd02a2a, - 0.025 ], [ 0x1a1a1a, - 0.02 ], [ 0xf2c21a, 0.03 ] ] ) add( g, tube( [ [ - 0.05, 0.004, z ], [ - 0.01, 0.012, z + 0.01 ], [ 0.02, 0.005, z - 0.012 ], [ 0.055, 0.009, z + 0.004 ] ], 0.0016, 18, 5 ), plastic( c ) );
		return ground( g );
	} );

	reg( 'tech_pcb', () => {
		const g = group();
		add( g, B( 0.12, 0.0016, 0.08 ), M( 0xffffff, { map: pcbTex(), rough: 0.45 } ), [ 0, 0.0008, 0 ] );
		add( g, B( 0.028, 0.004, 0.028 ), plastic( 0x141414 ), [ - 0.02, 0.0036, 0.008 ] );
		for ( let i = 0; i < 8; i ++ ) for ( const z of [ - 0.016, 0.032 ] ) add( g, B( 0.0015, 0.001, 0.003 ), chrome(), [ - 0.031 + i * 0.0032, 0.002, z * 0.5 + 0.008 ] );
		add( g, B( 0.016, 0.003, 0.008 ), plastic( 0x141414 ), [ 0.03, 0.003, - 0.025 ] );
		for ( const [ x, z, c, r, h ] of [ [ 0.04, 0.02, 0x2a4ab0, 0.0045, 0.011 ], [ 0.028, 0.025, 0x1a1a1a, 0.0035, 0.008 ], [ - 0.045, - 0.025, 0x2a4ab0, 0.006, 0.014 ] ] ) add( g, C( r, r, h, 12 ), plastic( c, 0.3 ), [ x, 0.0016 + h / 2, z ] );
		add( g, B( 0.03, 0.007, 0.006 ), plastic( 0xf2f2f2 ), [ 0.035, 0.005, 0.036 ] );
		return ground( g );
	} );

	reg( 'tech_speaker', () => {
		const g = group(), frame = M( 0x3a3d42, { rough: 0.45, metal: 0.7 } );
		add( g, C( 0.026, 0.026, 0.022, 20 ), dark(), [ 0, 0.011, 0 ] );
		add( g, G.lathe( [ [ 0.025, 0.02 ], [ 0.03, 0.026 ], [ 0.062, 0.052 ], [ 0.066, 0.055 ] ], 20 ), frame );
		add( g, G.lathe( [ [ 0.016, 0.03 ], [ 0.03, 0.036 ], [ 0.058, 0.052 ] ], 22 ), M( 0x1a1a1c, { rough: 0.9, side: THREE.DoubleSide } ) );
		add( g, G.dome( 0.017, 16, 6 ), M( 0x2a2a2c, { rough: 0.5 } ), [ 0, 0.03, 0 ] );
		add( g, new THREE.TorusGeometry( 0.061, 0.0035, 6, 28 ).rotateX( PI / 2 ), rubber( 0x222224 ), [ 0, 0.054, 0 ] );
		return ground( g );
	} );

	reg( 'tech_motor', () => {
		const g = group(), y = 0.02;
		add( g, C( 0.018, 0.018, 0.045, 18 ).rotateZ( - PI / 2 ), M( 0xc8ccd2, { rough: 0.3, metal: 0.85 } ), [ 0, y, 0 ] );
		add( g, C( 0.0175, 0.0175, 0.01, 18 ).rotateZ( - PI / 2 ), plastic( 0x6a3a1a, 0.5 ), [ - 0.027, y, 0 ] );
		add( g, C( 0.0015, 0.0015, 0.015, 8 ).rotateZ( - PI / 2 ), steel(), [ 0.03, y, 0 ] );
		add( g, C( 0.006, 0.006, 0.005, 12 ).rotateZ( - PI / 2 ), brass(), [ 0.036, y, 0 ] );
		for ( const z of [ - 0.007, 0.007 ] ) add( g, B( 0.006, 0.004, 0.002 ), brass(), [ - 0.034, y + 0.008, z ] );
		add( g, tube( [ [ - 0.035, y + 0.009, - 0.007 ], [ - 0.05, y + 0.006, - 0.012 ], [ - 0.07, 0.002, - 0.008 ] ], 0.0012, 10, 4 ), plastic( 0xd02a2a ) );
		add( g, tube( [ [ - 0.035, y + 0.009, 0.007 ], [ - 0.052, y + 0.004, 0.012 ], [ - 0.072, 0.002, 0.01 ] ], 0.0012, 10, 4 ), plastic( 0x1a1a1a ) );
		return ground( g );
	} );

	reg( 'tech_leather', () => {
		const g = group(), m = M( 0x6e4024, { rough: 0.72 } );
		add( g, C( 0.034, 0.034, 0.2, 18 ).rotateZ( - PI / 2 ), m, [ 0, 0.034, 0 ] );
		for ( const x of [ - 0.1, 0.1 ] ) add( g, new THREE.TorusGeometry( 0.018, 0.012, 6, 16 ).rotateY( PI / 2 ), M( 0x5a3018, { rough: 0.75 } ), [ x, 0.034, 0 ] );
		add( g, B( 0.12, 0.004, 0.07 ), m, [ 0.02, 0.002, 0.03 ], [ 0, 0.1, 0 ] );
		for ( const x of [ - 0.05, 0.05 ] ) add( g, new THREE.TorusGeometry( 0.0355, 0.0025, 4, 18 ).rotateY( PI / 2 ), M( 0x2a1a0e, { rough: 0.8 } ), [ x, 0.034, 0 ] );
		const off = new THREE.Shape();
		[ [ 0, 0 ], [ 0.09, - 0.01 ], [ 0.12, 0.03 ], [ 0.1, 0.07 ], [ 0.04, 0.08 ], [ - 0.01, 0.05 ] ].forEach( ( [ x, y ], i ) => i ? off.lineTo( x, y ) : off.moveTo( x, y ) );
		add( g, new THREE.ExtrudeGeometry( off, { depth: 0.004, bevelEnabled: false } ).rotateX( PI / 2 ), m, [ - 0.06, 0.004, 0.06 ] );
		return ground( g );
	} );

	reg( 'tech_oilbottle', ( s ) => {
		const g = group(), c = s.color ?? 0x1a1a1a, body = M( c, { rough: 0.35 } );
		add( g, RB( 0.1, 0.17, 0.06, 0.012 ), body, [ 0, 0.085, 0 ] );
		add( g, G.lathe( [ [ 0.03, 0 ], [ 0.026, 0.02 ], [ 0.014, 0.035 ] ], 14 ).scale( 1.5, 1, 0.9 ), body, [ 0.015, 0.165, 0 ] );
		add( g, C( 0.015, 0.015, 0.025, 14 ), body, [ 0.02, 0.21, 0 ] );
		add( g, C( 0.017, 0.017, 0.02, 14 ), plastic( s.cap ?? 0xf2c21a ), [ 0.02, 0.232, 0 ] );
		add( g, B( 0.022, 0.09, 0.03 ), M( 0x0a0a0a, { transparent: true, opacity: 0.35 } ), [ - 0.04, 0.1, 0 ] );
		add( g, B( 0.084, 0.11, 0.001 ), flat( s.label || { bg: 0xf2c21a, fg: 0x1a1a1a, text: 'OIL', style: 'band' } ), [ 0.004, 0.075, 0.0305 ] );
		return ground( g );
	} );

	reg( 'tech_magnet', () => {
		const g = group(), red = M( 0xc8201a, { rough: 0.3, metal: 0.4 } ), y = 0.009;
		add( g, new THREE.TorusGeometry( 0.024, 0.009, 8, 20, PI ).rotateX( - PI / 2 ).rotateY( PI / 2 ), red, [ - 0.012, y, 0 ] );
		for ( const z of [ - 0.024, 0.024 ] ) {
			add( g, B( 0.035, 0.016, 0.017 ), red, [ 0.012, y, z ] );
			add( g, B( 0.012, 0.016, 0.017 ), chrome(), [ 0.035, y, z ] );
		}
		return ground( g );
	} );

	reg( 'tech_spool', ( s ) => {
		const g = group(), c = s.color ?? 0xc0282a, end = plastic( 0xf0e8d8, 0.5 );
		add( g, C( 0.017, 0.017, 0.004, 18 ), end, [ 0, 0.002, 0 ] );
		add( g, C( 0.014, 0.014, 0.034, 18 ), M( 0xffffff, { map: labelTex( { bg: c, fg: shade( c, - 0.25 ), style: 'stripes', band: shade( c, - 0.2 ) } ), rough: 0.85 } ), [ 0, 0.021, 0 ] );
		add( g, C( 0.017, 0.017, 0.004, 18 ), end, [ 0, 0.04, 0 ] );
		add( g, C( 0.004, 0.004, 0.0425, 10 ), M( 0x2a2a2a ), [ 0, 0.021, 0 ] );
		// a second, smaller one lying beside it
		add( g, C( 0.012, 0.012, 0.022, 14 ).rotateZ( PI / 2 ), plastic( 0x2a4ab0, 0.8 ), [ 0.035, 0.013, 0.006 ] );
		for ( const x of [ 0.023, 0.047 ] ) add( g, C( 0.0135, 0.0135, 0.003, 14 ).rotateZ( PI / 2 ), end, [ x, 0.0135, 0.006 ] );
		return ground( g );
	} );

	reg( 'tech_hose', ( s ) => {
		const g = group();
		if ( s.clear ) {
			const m = M( s.color ?? 0xd8e6d0, { rough: 0.15, transparent: true, opacity: 0.55 } );
			for ( let i = 0; i < 3; i ++ ) add( g, new THREE.TorusGeometry( 0.085 - i * 0.004, 0.006, 6, 26 ).rotateX( PI / 2 ), m, [ ( i % 2 ) * 0.004, 0.006 + i * 0.011, 0 ] );
			add( g, G.sph( 0.022, 14, 10 ).scale( 1.6, 1, 1 ), rubber( 0x1e1f22 ), [ 0.12, 0.02, 0 ] );
			add( g, tube( [ [ 0.08, 0.03, 0.02 ], [ 0.095, 0.025, 0.01 ], [ 0.108, 0.02, 0 ] ], 0.006, 8, 6 ), m );
			add( g, tube( [ [ 0.155, 0.02, 0 ], [ 0.2, 0.012, 0.02 ], [ 0.24, 0.006, 0.05 ] ], 0.006, 10, 6 ), m );
			return ground( g );
		}
		const m = M( s.color ?? 0x2a8a3a, { rough: 0.5 } );
		for ( let i = 0; i < 4; i ++ ) add( g, new THREE.TorusGeometry( 0.15 - i * 0.003, 0.0115, 7, 32 ).rotateX( PI / 2 ), m, [ ( i % 2 ) * 0.005, 0.0115 + i * 0.021, ( i % 2 ) * 0.004 ] );
		add( g, C( 0.016, 0.016, 0.04, 10 ).rotateZ( - PI / 2 ), brass(), [ 0.17, 0.07, 0.02 ] );
		add( g, tube( [ [ 0.15, 0.07, 0 ], [ 0.152, 0.07, 0.012 ] ], 0.0115, 4, 7 ), m );
		return ground( g );
	} );

	// a fanned bundle of natural nylon ties held by one round the middle, and two closed loops beside it (the loops are
	// what read as "zip tie" from above)
	reg( 'tech_zipties', () => {
		const g = group(), nat = plastic( 0xe8e2d0, 0.4 ), blk = plastic( 0x141416, 0.45 );
		// heads together at -x, tails spreading towards +x (rotation.y turns +x towards -z, so fan the other way)
		for ( let i = 0; i < 12; i ++ ) {
			const k = ( i - 5.5 ) / 5.5, lay = i % 2;
			const t = group();
			add( t, B( 0.19, 0.0012, 0.0046 ), nat, [ 0.095, 0, 0 ] );
			add( t, B( 0.008, 0.0045, 0.0064 ), nat, [ 0.003, 0.0016, 0 ] );
			t.position.set( - 0.09, 0.0008 + lay * 0.0013, k * 0.018 ); t.rotation.y = - k * 0.2;
			g.add( t );
		}
		add( g, new THREE.TorusGeometry( 0.0075, 0.0018, 5, 16 ).rotateY( PI / 2 ).scale( 1, 0.55, 3.4 ), blk, [ - 0.055, 0.0035, 0 ] );
		add( g, B( 0.006, 0.006, 0.008 ), blk, [ - 0.055, 0.0075, 0.012 ] );
		// one closed loop, its tail sticking out of the head
		const r = 0.028, lx = - 0.04, lz = 0.072;
		add( g, new THREE.TorusGeometry( r, 0.0024, 4, 28 ).rotateX( PI / 2 ).scale( 1, 0.5, 1 ), nat, [ lx, 0.0013, lz ] );
		add( g, B( 0.008, 0.0055, 0.0068 ), nat, [ lx + r, 0.003, lz ] );
		add( g, B( 0.09, 0.0012, 0.0046 ), nat, [ lx + r + 0.046, 0.0008, lz + 0.012 ], [ 0, - 0.25, 0 ] );
		return ground( g );
	} );

	reg( 'tech_emptycan', () => {
		const g = group(), r = 0.037, h = 0.11, tin = M( 0xc4c8cc, { rough: 0.32, metal: 0.92, side: THREE.DoubleSide } );
		add( g, C( r, r, h, 22, true ), tin, [ 0, h / 2, 0 ] );
		add( g, C( r * 0.99, r * 0.99, 0.002, 22 ), tin, [ 0, 0.001, 0 ] );
		add( g, new THREE.TorusGeometry( r, 0.0022, 4, 22 ).rotateX( PI / 2 ), tin, [ 0, h, 0 ] );
		// a strip of the label still on, and the lid bent up
		add( g, CP( r * 1.008, h * 0.74, 0.6, 4.3, 22 ), M( 0xffffff, { map: wrapTex( 'oldcan', { bg: 0xb8281a, fg: 0xf2e6c8, text: 'BEANS', sub: 'PORK & BEANS', band: 0xf2e6c8, subColor: 0xb8281a } ), rough: 0.85, side: THREE.DoubleSide } ), [ 0, h * 0.5, 0 ] );
		const top = C( r * 0.97, r * 0.97, 0.0015, 22 ); top.translate( - r * 0.97, 0, 0 );
		add( g, top, tin, [ r * 0.97, h, 0 ], [ 0, 0, 1.35 ] );
		return ground( g, false );
	} );

	reg( 'tech_antenna', () => {
		const g = group(), y = 0.008;
		const segs = [ [ 0.006, 0.09 ], [ 0.0048, 0.085 ], [ 0.0038, 0.08 ], [ 0.0028, 0.075 ] ];
		let x = - 0.15;
		for ( const [ r, L ] of segs ) { add( g, C( r, r, L, 10 ).rotateZ( - PI / 2 ), chrome(), [ x + L / 2, y, 0 ] ); x += L - 0.005; }
		add( g, G.sph( 0.0045, 10, 8 ), chrome(), [ x + 0.002, y, 0 ] );
		add( g, C( 0.008, 0.008, 0.025, 10 ).rotateZ( - PI / 2 ), plastic( 0x1a1a1a ), [ - 0.16, y, 0 ] );
		add( g, B( 0.012, 0.004, 0.016 ), plastic( 0x1a1a1a ), [ - 0.178, y - 0.004, 0 ] );
		return ground( g );
	} );

	// =================================== cells and chargers ===================================

	reg( 'tech_dcell', () => {
		const g = group(), r = 0.0165, L = 0.058;
		const lab = M( 0xffffff, { map: wrapTex( 'dcell', { bg: 0x141414, fg: 0xd8a830, text: 'MANA D', sub: 'ALKALINE 1.5V', band: 0xd8a830, subColor: 0x141414 } ), rough: 0.3, metal: 0.4 } );
		for ( const z of [ - r * 1.05, r * 1.05 ] ) {
			add( g, C( r, r, L, 20 ).rotateZ( - PI / 2 ), lab, [ 0, r, z ], [ PI / 2 * ( z > 0 ? 1 : 0 ), 0, 0 ] );
			add( g, C( 0.005, 0.005, 0.004, 12 ).rotateZ( - PI / 2 ), chrome(), [ L / 2 + 0.002, r, z ] );
			add( g, C( r * 0.92, r * 0.92, 0.002, 18 ).rotateZ( - PI / 2 ), chrome(), [ - L / 2 - 0.001, r, z ] );
		}
		return ground( g );
	} );

	reg( 'tech_9v', () => {
		const g = group();
		const face = flat( { bg: 0x141414, fg: 0xd8a830, text: 'MANA 9V', sub: 'ALKALINE', style: 'band', band: 0xd8a830, subColor: 0x141414, size: 0.32 }, { rough: 0.35, metal: 0.3 } );
		for ( const [ z, yaw ] of [ [ - 0.016, 0.1 ], [ 0.016, - 0.15 ] ] ) {
			const b = group();
			add( b, RB( 0.046, 0.017, 0.026, 0.002 ), plastic( 0x141414, 0.35 ), [ 0, 0.0085, 0 ] );
			add( b, B( 0.036, 0.0005, 0.022 ), face, [ - 0.002, 0.0172, 0 ] );
			add( b, C( 0.0035, 0.0035, 0.004, 6 ).rotateZ( - PI / 2 ), chrome(), [ 0.025, 0.0085, - 0.0065 ] );
			add( b, C( 0.0035, 0.0035, 0.004, 12 ).rotateZ( - PI / 2 ), chrome(), [ 0.025, 0.0085, 0.0065 ] );
			b.position.z = z; b.rotation.y = yaw;
			g.add( b );
		}
		return ground( g );
	} );

	reg( 'tech_powerbank', ( s ) => {
		const g = group(), c = s.color ?? 0x2a2c30;
		add( g, RB( 0.14, 0.016, 0.07, 0.007 ), M( c, { rough: 0.35, metal: 0.4 } ), [ 0, 0.008, 0 ] );
		add( g, B( 0.07, 0.0005, 0.03 ), flat( { bg: c, fg: 0xd8dce2, text: 'MANA', sub: '10000 mAh', style: 'plain', size: 0.42, subColor: 0x8a9098 } ), [ - 0.02, 0.0162, 0 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, C( 0.0015, 0.0015, 0.001, 8 ), glow( 0x3a8aff, 0.9 ), [ 0.045 + i * 0.005, 0.0162, 0.022 ] );
		for ( const z of [ - 0.012, 0.012 ] ) add( g, B( 0.002, 0.004, 0.011 ), M( 0x0a0a0a ), [ 0.0705, 0.008, z ] );
		add( g, tube( [ [ 0.072, 0.006, 0.012 ], [ 0.1, 0.004, 0.03 ], [ 0.09, 0.003, 0.06 ], [ 0.03, 0.003, 0.055 ], [ 0.0, 0.004, 0.045 ] ], 0.0018, 24, 5 ), plastic( 0xf2f2f2 ) );
		return ground( g );
	} );

	reg( 'tech_inverter', () => {
		const g = group(), alu = M( 0xb8bcc2, { rough: 0.35, metal: 0.85 } );
		add( g, RB( 0.18, 0.055, 0.1, 0.006 ), alu, [ 0, 0.0275, 0 ] );
		for ( let i = 0; i < 9; i ++ ) add( g, B( 0.16, 0.008, 0.003 ), alu, [ 0, 0.058, - 0.04 + i * 0.01 ] );
		add( g, B( 0.003, 0.05, 0.096 ), plastic( 0x1e1f22 ), [ 0.0915, 0.0275, 0 ] );
		for ( const z of [ - 0.022, 0.022 ] ) {
			add( g, B( 0.002, 0.02, 0.016 ), plastic( 0xf2f2ee ), [ 0.094, 0.03, z ] );
			for ( const dz of [ - 0.003, 0.003 ] ) add( g, B( 0.002, 0.007, 0.0015 ), M( 0x0a0a0a ), [ 0.0955, 0.033, z + dz ] );
		}
		add( g, B( 0.006, 0.01, 0.008 ), plastic( 0xd02a2a ), [ 0.094, 0.012, 0.04 ] );
		for ( const [ c, z ] of [ [ 0xd02a2a, - 0.02 ], [ 0x1a1a1a, 0.02 ] ] ) {
			add( g, tube( [ [ - 0.09, 0.02, z ], [ - 0.13, 0.008, z * 1.5 ], [ - 0.17, 0.006, z * 3 ], [ - 0.2, 0.012, z * 3.6 ] ], 0.003, 16, 5 ), plastic( c ) );
			add( g, B( 0.035, 0.012, 0.014 ), plastic( c ), [ - 0.215, 0.012, z * 3.6 ], [ 0, - z * 6, 0 ] );
		}
		return ground( g );
	} );

	reg( 'tech_jumper', () => {
		const g = group();
		for ( const [ c, off ] of [ [ 0xc8201a, 0 ], [ 0x1a1a1a, 0.006 ] ] ) {
			const m = plastic( c, 0.5 );
			for ( let i = 0; i < 3; i ++ ) add( g, new THREE.TorusGeometry( 0.12 - i * 0.004 - off, 0.006, 5, 26 ).rotateX( PI / 2 ), m, [ off, 0.006 + i * 0.012 + off * 2, off ] );
		}
		// four clamps resting on the coil
		const clamp = ( c, x, z, yaw ) => {
			const k = group(), m = plastic( c, 0.4 ), cu = M( 0xb87333, { rough: 0.3, metal: 0.9 } );
			for ( const s of [ - 1, 1 ] ) {
				add( k, G.rbox( 0.075, 0.012, 0.016, 0.005, 1 ).translate( 0, - 0.006, 0 ), m, [ - 0.01, 0.006 + ( s > 0 ? 0.013 : 0 ), 0 ], [ 0, 0, s * 0.12 ] );
				add( k, B( 0.03, 0.006, 0.014 ), cu, [ 0.04, 0.007 + ( s > 0 ? 0.008 : 0 ), 0 ], [ 0, 0, - s * 0.08 ] );
			}
			add( k, helix( 0.006, 0.014, 3, 0.0012, 18, 4 ).rotateY( PI / 2 ), steel(), [ 0.015, 0.012, 0 ] );
			k.position.set( x, 0.05, z ); k.rotation.y = yaw;
			g.add( k );
		};
		clamp( 0xc8201a, - 0.05, - 0.04, 0.3 ); clamp( 0xc8201a, 0.05, 0.03, 2.2 );
		clamp( 0x1a1a1a, 0.0, 0.07, - 1.2 ); clamp( 0x1a1a1a, - 0.07, 0.05, 3.6 );
		return ground( g );
	} );

	// a palm dynamo: the crank arm swung out past the case with its knob standing up, a torch lens at one end, a USB lead
	reg( 'tech_crank', () => {
		const g = group(), body = M( 0xf28a1a, { rough: 0.45 } ), blk = plastic( 0x2a2c30, 0.45 );
		add( g, RB( 0.11, 0.042, 0.064, 0.016 ), body, [ 0, 0.021, 0 ] );
		add( g, RB( 0.112, 0.012, 0.066, 0.005 ), blk, [ 0, 0.021, 0 ] );
		// the hub on top, the arm out beyond the case, the knob up
		add( g, C( 0.017, 0.017, 0.007, 20 ), blk, [ 0.018, 0.0455, 0 ] );
		add( g, C( 0.005, 0.005, 0.009, 10 ), chrome(), [ 0.018, 0.047, 0 ] );
		add( g, RB( 0.095, 0.007, 0.015, 0.003 ), blk, [ - 0.022, 0.0525, 0.01 ], [ 0, - 0.28, 0 ] );
		add( g, C( 0.0085, 0.0085, 0.032, 14 ), M( 0xd8302a, { rough: 0.35 } ), [ - 0.064, 0.072, 0.023 ] );
		add( g, G.dome( 0.0085, 12, 5 ), M( 0xd8302a, { rough: 0.35 } ), [ - 0.064, 0.088, 0.023 ] );
		add( g, B( 0.028, 0.0005, 0.024 ), M( 0xffffff, { map: solarTex(), rough: 0.25, metal: 0.4 } ), [ 0.03, 0.0425, - 0.018 ] );
		// the torch lens and a lead
		add( g, C( 0.013, 0.013, 0.008, 16 ).rotateZ( - PI / 2 ), blk, [ 0.057, 0.021, 0 ] );
		add( g, C( 0.0105, 0.0105, 0.002, 16 ).rotateZ( - PI / 2 ), M( 0xfff6e0, { rough: 0.1, emissive: 0xfff0d0, emissiveIntensity: 0.25 } ), [ 0.0615, 0.021, 0 ] );
		add( g, tube( [ [ - 0.055, 0.012, - 0.015 ], [ - 0.085, 0.004, - 0.03 ], [ - 0.11, 0.003, - 0.01 ], [ - 0.12, 0.003, 0.02 ] ], 0.0018, 14, 5 ), plastic( 0x1a1a1a ) );
		add( g, B( 0.014, 0.005, 0.008 ), plastic( 0xf2f2f2 ), [ - 0.123, 0.003, 0.03 ], [ 0, 1.2, 0 ] );
		return ground( g );
	} );

	reg( 'tech_solarpanel', () => {
		const g = group(), alu = M( 0xb0b4ba, { rough: 0.35, metal: 0.85 } ), cells = M( 0xffffff, { map: solarTex(), rough: 0.18, metal: 0.4 } );
		const tilt = 1.0, W = 0.4, H = 0.52;
		const panel = group();
		for ( const x of [ - W / 2 - 0.006, W / 2 + 0.006 ] ) {
			add( panel, B( W, H, 0.006 ), cells, [ x, 0, 0.004 ] );
			add( panel, B( W + 0.014, H + 0.014, 0.008 ), alu, [ x, 0, 0 ] );
		}
		add( panel, B( 0.06, 0.04, 0.02 ), plastic( 0x1e1f22 ), [ - 0.1, - 0.15, - 0.012 ] );
		panel.rotation.x = - ( PI / 2 - tilt );
		panel.position.y = Math.sin( tilt ) * H / 2 + 0.01;
		g.add( panel );
		// kickstand legs behind
		for ( const x of [ - 0.3, 0.3 ] ) add( g, C( 0.006, 0.006, 0.42, 8 ), alu, [ x, 0.17, - 0.16 ], [ 0.62, 0, 0 ] );
		add( g, tube( [ [ - 0.1, 0.12, - 0.06 ], [ - 0.16, 0.03, - 0.1 ], [ - 0.3, 0.004, - 0.12 ] ], 0.003, 12, 5 ), plastic( 0x1a1a1a ) );
		return ground( g );
	} );

	reg( 'tech_generator', () => {
		const g = group(), red = M( 0xc0201a, { rough: 0.35, metal: 0.4 } ), frame = M( 0x1e1f22, { rough: 0.5, metal: 0.6 } ), eng = M( 0x5a5e64, { rough: 0.55, metal: 0.6 } );
		const L = 0.58, Wd = 0.44, Ht = 0.44;
		// the tubular frame: two loops joined
		for ( const z of [ - Wd / 2, Wd / 2 ] ) {
			add( g, tube( [ [ - L / 2, 0.015, z ], [ - L / 2, Ht - 0.04, z ], [ - L / 2 + 0.04, Ht, z ], [ L / 2 - 0.04, Ht, z ], [ L / 2, Ht - 0.04, z ], [ L / 2, 0.015, z ] ], 0.014, 40, 8 ), frame );
			add( g, C( 0.014, 0.014, L, 8 ).rotateZ( - PI / 2 ), frame, [ 0, 0.015, z ] );
		}
		for ( const x of [ - L / 2, L / 2 ] ) add( g, C( 0.012, 0.012, Wd, 8 ).rotateX( PI / 2 ), frame, [ x, 0.015, 0 ] );
		// the fuel tank on top
		add( g, RB( 0.34, 0.11, 0.28, 0.04 ), red, [ 0.02, Ht - 0.07, 0 ] );
		add( g, C( 0.03, 0.03, 0.02, 16 ), M( 0x1a1a1a ), [ 0.1, Ht + 0.0, 0.04 ] );
		add( g, B( 0.16, 0.05, 0.002 ), flat( { bg: 0xc0201a, fg: 0xffffff, text: 'KONA 3500', sub: 'Portable generator', style: 'plain', size: 0.38 } ), [ 0.02, Ht - 0.075, 0.141 ] );
		// the engine with its recoil starter, and the alternator
		add( g, RB( 0.2, 0.2, 0.22, 0.02 ), eng, [ - 0.12, 0.13, 0 ] );
		add( g, C( 0.075, 0.075, 0.05, 20 ).rotateX( PI / 2 ), plastic( 0x1e1f22 ), [ - 0.12, 0.14, 0.13 ] );
		add( g, B( 0.04, 0.012, 0.015 ), plastic( 0x1a1a1a ), [ - 0.12, 0.14, 0.165 ] );
		add( g, C( 0.075, 0.075, 0.16, 20 ).rotateZ( - PI / 2 ), red, [ 0.14, 0.13, 0 ] );
		add( g, C( 0.077, 0.077, 0.02, 20 ).rotateZ( - PI / 2 ), plastic( 0x1e1f22 ), [ 0.22, 0.13, 0 ] );
		// the panel with outlets, and the muffler
		add( g, B( 0.12, 0.09, 0.006 ), plastic( 0x1e1f22 ), [ 0.12, 0.14, 0.125 ] );
		for ( const x of [ 0.09, 0.15 ] ) { add( g, B( 0.024, 0.03, 0.004 ), plastic( 0xe8e8e2 ), [ x, 0.15, 0.13 ] ); for ( const dx of [ - 0.004, 0.004 ] ) add( g, B( 0.002, 0.009, 0.002 ), M( 0x0a0a0a ), [ x + dx, 0.155, 0.132 ] ); }
		add( g, B( 0.015, 0.02, 0.008 ), plastic( 0xd02a2a ), [ 0.12, 0.11, 0.13 ] );
		add( g, C( 0.045, 0.045, 0.16, 16 ).rotateZ( - PI / 2 ), M( 0xa8acb2, { rough: 0.3, metal: 0.9 } ), [ - 0.12, 0.08, - 0.15 ] );
		add( g, B( 0.18, 0.004, 0.07 ), M( 0x6a6e74, { rough: 0.4, metal: 0.8 } ), [ - 0.12, 0.13, - 0.15 ] );
		return ground( g );
	} );

	reg( 'tech_worklight', () => {
		const g = group(), yel = M( 0xf2c21a, { rough: 0.4 } ), blk = M( 0x1e1f22, { rough: 0.5, metal: 0.5 } );
		// an H-frame foot
		for ( const z of [ - 0.12, 0.12 ] ) add( g, C( 0.009, 0.009, 0.3, 8 ).rotateZ( - PI / 2 ), blk, [ 0, 0.009, z ] );
		add( g, C( 0.009, 0.009, 0.24, 8 ).rotateX( PI / 2 ), blk, [ 0, 0.009, 0 ] );
		add( g, C( 0.011, 0.011, 0.24, 10 ), blk, [ 0, 0.13, 0 ] );
		// the U bracket and the lamp head
		add( g, B( 0.27, 0.012, 0.03 ), blk, [ 0, 0.255, 0 ] );
		for ( const x of [ - 0.13, 0.13 ] ) add( g, B( 0.01, 0.12, 0.025 ), blk, [ x, 0.31, 0 ] );
		const head = group();
		add( head, RB( 0.22, 0.17, 0.08, 0.015 ), yel, [ 0, 0, 0 ] );
		add( head, B( 0.19, 0.14, 0.004 ), M( 0xf4f6f8, { rough: 0.15, emissive: 0xf4f0e0, emissiveIntensity: 0.3 } ), [ 0, 0, 0.041 ] );
		for ( let i = 0; i < 5; i ++ ) add( head, B( 0.004, 0.15, 0.006 ), blk, [ - 0.08 + i * 0.04, 0, 0.044 ] );
		for ( let i = 0; i < 5; i ++ ) add( head, B( 0.004, 0.12, 0.014 ), M( 0x2a2c30, { rough: 0.5, metal: 0.6 } ), [ - 0.08 + i * 0.04, 0, - 0.046 ] );
		for ( const x of [ - 0.12, 0.12 ] ) add( head, C( 0.012, 0.012, 0.012, 10 ).rotateZ( PI / 2 ), blk, [ x, 0, 0 ] );
		head.position.set( 0, 0.33, 0.0 ); head.rotation.x = 0.3;
		g.add( head );
		return ground( g );
	} );

	reg( 'tech_solarlight', () => {
		const g = group(), y = 0.04, blk = plastic( 0x1e1f22, 0.4 );
		add( g, C( 0.0005, 0.009, 0.1, 8 ).rotateZ( PI / 2 ), blk, [ - 0.21, y, 0 ] );
		add( g, C( 0.009, 0.009, 0.2, 10 ).rotateZ( - PI / 2 ), M( 0x3a3d42, { rough: 0.35, metal: 0.8 } ), [ - 0.06, y, 0 ] );
		add( g, C( 0.03, 0.03, 0.06, 16 ).rotateZ( - PI / 2 ), M( 0xf2f0e8, { rough: 0.2, transparent: true, opacity: 0.6 } ), [ 0.07, y, 0 ] );
		add( g, C( 0.008, 0.008, 0.02, 10 ).rotateZ( - PI / 2 ), M( 0xfff2d0, { rough: 0.3, emissive: 0xfff0c0, emissiveIntensity: 0.3 } ), [ 0.07, y, 0 ] );
		add( g, C( 0.04, 0.034, 0.018, 18 ).rotateZ( - PI / 2 ), blk, [ 0.109, y, 0 ] );
		add( g, B( 0.002, 0.045, 0.045 ), M( 0xffffff, { map: solarTex(), rough: 0.2, metal: 0.4 } ), [ 0.119, y, 0 ] );
		add( g, C( 0.032, 0.032, 0.006, 16 ).rotateZ( - PI / 2 ), blk, [ 0.038, y, 0 ] );
		return ground( g );
	} );

	// =================================== devices ===================================

	reg( 'tech_scanner', () => {
		const g = group(), body = plastic( 0x1e1f22, 0.55 ), y = 0.016;
		add( g, RB( 0.135, 0.032, 0.066, 0.01 ), body, [ 0, y, 0 ] );
		add( g, B( 0.04, 0.001, 0.05 ), M( 0xffffff, { map: lcdTex( 'scan', '154.80', '#a8c890', '#16241a' ), rough: 0.2, emissive: 0x2a3a20, emissiveIntensity: 0.5 } ), [ 0.03, 0.0325, 0 ] );
		for ( let i = 0; i < 4; i ++ ) for ( let j = 0; j < 3; j ++ ) add( g, G.rbox( 0.008, 0.003, 0.012, 0.0015, 1 ).translate( 0, - 0.0015, 0 ), plastic( i === 3 && j === 2 ? 0xd02a2a : 0x4a4d52, 0.4 ), [ - 0.045 + i * 0.013, 0.0335, - 0.017 + j * 0.017 ] );
		for ( let i = 0; i < 5; i ++ ) add( g, B( 0.012, 0.0006, 0.002 ), M( 0x0a0a0a ), [ 0.058, 0.0322, - 0.01 + i * 0.005 ] );
		add( g, C( 0.005, 0.0028, 0.13, 8 ).rotateZ( - PI / 2 ), rubber(), [ 0.13, 0.02, - 0.018 ] );
		add( g, C( 0.008, 0.008, 0.012, 10 ).rotateZ( - PI / 2 ), dark(), [ 0.072, 0.02, - 0.018 ] );
		add( g, C( 0.006, 0.006, 0.01, 12 ).rotateZ( - PI / 2 ), dark(), [ 0.071, 0.02, 0.016 ] );
		return ground( g );
	} );

	// a mobile CB set (the kind bolted under a truck's dash): the case in its bracket, the channel readout and knobs on
	// the front, and the palm mic on its coiled cord — the mic is what says "CB" at a glance
	reg( 'tech_cb', () => {
		const g = group(), body = M( 0x2a2c30, { rough: 0.45, metal: 0.45 } ), face = plastic( 0x141416, 0.5 ), knob = plastic( 0x4a4d52, 0.35 );
		const W = 0.17, H = 0.052, D = 0.13, y0 = 0.004, cz = - 0.035, fz = cz + D / 2;
		add( g, RB( W, H, D, 0.006 ), body, [ 0, y0 + H / 2, cz ] );
		for ( let i = 0; i < 8; i ++ ) add( g, B( W * 0.78, 0.0012, 0.0035 ), M( 0x0a0a0a ), [ 0, y0 + H + 0.0005, cz - 0.045 + i * 0.012 ] );
		// the U bracket and its thumb screws
		add( g, B( W + 0.014, 0.004, 0.05 ), steel(), [ 0, 0.002, cz ] );
		for ( const sx of [ - 1, 1 ] ) {
			add( g, B( 0.004, 0.044, 0.05 ), steel(), [ sx * ( W / 2 + 0.005 ), y0 + 0.022, cz ] );
			add( g, C( 0.009, 0.009, 0.008, 14 ).rotateZ( PI / 2 ), plastic( 0x1a1a1a ), [ sx * ( W / 2 + 0.011 ), y0 + 0.028, cz ] );
		}
		// the front panel
		add( g, B( W - 0.01, H - 0.012, 0.002 ), face, [ 0, y0 + H / 2, fz + 0.001 ] );
		add( g, B( 0.036, 0.02, 0.001 ), M( 0xffffff, { map: lcdTex( 'cb', '19', '#1a0a0a', '#ff3a2a' ), rough: 0.2, emissive: 0x401010, emissiveIntensity: 0.6 } ), [ 0.018, y0 + H * 0.55, fz + 0.0025 ] );
		for ( const [ x, r ] of [ [ - 0.064, 0.0085 ], [ - 0.04, 0.0085 ], [ 0.062, 0.011 ] ] ) {
			add( g, C( r, r, 0.012, 16 ).rotateX( PI / 2 ), knob, [ x, y0 + H / 2, fz + 0.007 ] );
			add( g, B( 0.0015, r * 0.9, 0.001 ), plastic( 0xe8e8e2 ), [ x, y0 + H / 2 + r * 0.45, fz + 0.0135 ] );
		}
		add( g, C( 0.0065, 0.0065, 0.006, 14 ).rotateX( PI / 2 ), chrome(), [ - 0.014, y0 + 0.016, fz + 0.004 ] );
		add( g, B( 0.012, 0.004, 0.001 ), plastic( 0xd8a020 ), [ 0.018, y0 + 0.012, fz + 0.0025 ] );
		// the palm mic lying in front, its grille up, the talk bar on its side
		const mic = group(), mz = fz + 0.085, mx = 0.035;
		add( mic, RB( 0.062, 0.03, 0.09, 0.012 ), plastic( 0x1a1a1c, 0.45 ), [ 0, 0.015, 0 ] );
		for ( let i = 0; i < 6; i ++ ) add( mic, B( 0.036, 0.001, 0.003 ), M( 0x050505 ), [ 0, 0.0302, - 0.024 + i * 0.007 ] );
		add( mic, RB( 0.006, 0.014, 0.05, 0.003 ), plastic( 0x3a3d42 ), [ 0.032, 0.015, - 0.005 ] );
		add( mic, C( 0.006, 0.0045, 0.014, 10 ).rotateX( PI / 2 ), plastic( 0x1a1a1c ), [ 0, 0.012, - 0.051 ] );
		mic.position.set( mx, 0, mz ); mic.rotation.y = 0.25;
		g.add( mic );
		// the coiled cord from the socket to the mic
		add( g, helix( 0.0055, 0.05, 11, 0.0013, 66, 4 ).rotateY( - PI / 2 ), plastic( 0x141416 ), [ - 0.012, 0.012, fz + 0.03 ], [ 0, - 0.35, 0 ] );
		return ground( g );
	} );

	reg( 'tech_detector', () => {
		const g = group(), blk = M( 0x1e1f22, { rough: 0.5, metal: 0.5 } ), yel = plastic( 0xf2c21a, 0.4 ), y = 0.03;
		// the coil, flat on the ground at the front
		const coil = new THREE.TorusGeometry( 1, 0.12, 6, 32 ).rotateX( PI / 2 ); coil.scale( 0.13, 0.12, 0.095 );
		add( g, coil, blk, [ 0.42, 0.014, 0 ] );
		add( g, C( 0.13, 0.13, 0.006, 28 ).scale( 1, 1, 0.095 / 0.13 ), M( 0x2a2c30, { rough: 0.6 } ), [ 0.42, 0.007, 0 ] );
		add( g, B( 0.04, 0.03, 0.03 ), blk, [ 0.42, 0.03, 0 ] );
		// the shaft with its bend, the control box and the arm cuff
		add( g, C( 0.009, 0.009, 0.62, 10 ).rotateZ( - PI / 2 ), blk, [ 0.06, y + 0.03, 0 ], [ 0, 0, - 0.07 ] );
		add( g, C( 0.011, 0.011, 0.2, 10 ).rotateZ( - PI / 2 ), M( 0x3a3d42, { rough: 0.4, metal: 0.8 } ), [ - 0.28, y + 0.055, 0 ] );
		add( g, RB( 0.12, 0.045, 0.075, 0.012 ), yel, [ - 0.16, y + 0.075, 0 ] );
		add( g, B( 0.05, 0.001, 0.04 ), M( 0xffffff, { map: lcdTex( 'det', 'IRON', '#a8c0a0', '#1a2a1a' ), rough: 0.2 } ), [ - 0.17, y + 0.098, 0 ] );
		add( g, new THREE.CapsuleGeometry( 0.016, 0.08, 4, 10 ).rotateZ( PI / 2 ), rubber(), [ - 0.25, y + 0.04, 0 ] );
		add( g, CP( 0.04, 0.06, PI * 0.15, PI * 1.2 ).rotateZ( - PI / 2 ), M( 0x2a2c30, { rough: 0.5, side: THREE.DoubleSide } ), [ - 0.36, y + 0.07, 0 ] );
		add( g, helix( 0.012, 0.3, 9, 0.0015, 72, 4 ), plastic( 0x141414 ), [ 0.15, y + 0.04, 0 ], [ 0, 0, - 0.07 ] );
		return ground( g );
	} );

	reg( 'tech_magnetrope', () => {
		const g = group(), c = 0xd8c07a;
		const m = M( c, { rough: 0.95 } );
		for ( let i = 0; i < 4; i ++ ) add( g, new THREE.TorusGeometry( 0.1 - i * 0.004, 0.006, 6, 28 ).rotateX( PI / 2 ), m, [ ( i % 2 ) * 0.004, 0.006 + i * 0.011, 0 ] );
		add( g, C( 0.04, 0.04, 0.025, 24 ), M( 0xc8ccd2, { rough: 0.25, metal: 1 } ), [ 0.15, 0.0125, 0 ] );
		add( g, C( 0.03, 0.03, 0.0255, 24 ), M( 0x8a8e94, { rough: 0.35, metal: 1 } ), [ 0.15, 0.0126, 0 ] );
		add( g, new THREE.TorusGeometry( 0.011, 0.0028, 6, 14 ), chrome(), [ 0.15, 0.036, 0 ] );
		add( g, tube( [ [ 0.15, 0.045, 0 ], [ 0.13, 0.04, 0.01 ], [ 0.105, 0.03, 0.005 ], [ 0.095, 0.03, 0 ] ], 0.005, 10, 6 ), m );
		return ground( g );
	} );

	reg( 'tech_camera', () => {
		const g = group(), body = M( 0x8e9298, { rough: 0.3, metal: 0.75 } );
		add( g, RB( 0.1, 0.058, 0.028, 0.008 ), body, [ 0, 0.029, 0 ] );
		add( g, B( 0.1, 0.012, 0.0285 ), plastic( 0x1e1f22, 0.6 ), [ 0, 0.008, 0 ] );
		add( g, C( 0.019, 0.019, 0.014, 22 ).rotateX( PI / 2 ), dark(), [ 0.012, 0.03, 0.019 ] );
		add( g, C( 0.013, 0.013, 0.002, 22 ).rotateX( PI / 2 ), M( 0x1a2a4a, { rough: 0.05, metal: 0.6 } ), [ 0.012, 0.03, 0.027 ] );
		add( g, B( 0.02, 0.009, 0.002 ), M( 0xe8eef2, { rough: 0.1, metal: 0.4 } ), [ - 0.033, 0.047, 0.015 ] );
		add( g, C( 0.0055, 0.0055, 0.004, 12 ), chrome(), [ 0.036, 0.06, 0 ] );
		add( g, B( 0.012, 0.004, 0.006 ), plastic( 0x1e1f22 ), [ - 0.02, 0.059, 0 ] );
		add( g, B( 0.03, 0.013, 0.0015 ), flat( { bg: 0x8e9298, fg: 0x1e1f22, text: 'KILO', sub: '12 MP', style: 'plain', size: 0.5 }, { metal: 0.5 } ), [ - 0.03, 0.03, 0.0143 ] );
		add( g, new THREE.TorusGeometry( 0.02, 0.002, 5, 16 ), rubber(), [ - 0.06, 0.04, 0 ], [ 0, PI / 2, 0.3 ] );
		return ground( g );
	} );

	reg( 'tech_cassette', () => {
		const g = group(), body = M( 0x2a4ab0, { rough: 0.35, metal: 0.4 } );
		add( g, RB( 0.112, 0.03, 0.082, 0.006 ), body, [ 0, 0.015, 0 ] );
		add( g, B( 0.08, 0.001, 0.05 ), MAT.glass( 0x404850, 0.5 ), [ - 0.005, 0.0305, 0 ] );
		add( g, B( 0.075, 0.0006, 0.045 ), plastic( 0x141414 ), [ - 0.005, 0.0302, 0 ] );
		for ( const x of [ - 0.027, 0.017 ] ) add( g, C( 0.008, 0.008, 0.0008, 14 ), plastic( 0xf2f2f2 ), [ x, 0.0305, 0 ] );
		add( g, B( 0.04, 0.0007, 0.012 ), plastic( 0xf28a1a ), [ - 0.005, 0.0306, 0.015 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, B( 0.012, 0.006, 0.006 ), chrome(), [ - 0.035 + i * 0.016, 0.028, - 0.044 ] );
		// the headphones beside it: the band and the orange foam pads
		const hp = group();
		add( hp, new THREE.TorusGeometry( 0.055, 0.0022, 5, 24, PI ), chrome(), [ 0, 0.0, 0 ], [ - PI / 2, 0, 0 ] );
		for ( const x of [ - 0.055, 0.055 ] ) add( hp, C( 0.019, 0.019, 0.012, 16 ), M( 0xf26a1a, { rough: 0.95 } ), [ x, 0.003, 0 ] );
		hp.position.set( 0.02, 0.0, 0.1 ); hp.rotation.y = 0.2;
		g.add( hp );
		add( g, tube( [ [ 0.056, 0.012, 0.02 ], [ 0.08, 0.004, 0.06 ], [ 0.075, 0.006, 0.1 ] ], 0.0012, 12, 4 ), plastic( 0x1a1a1a ) );
		return ground( g );
	} );

	reg( 'tech_boombox', () => {
		const g = group(), silver = M( 0xb8bcc2, { rough: 0.3, metal: 0.7 } ), blk = plastic( 0x1a1a1c, 0.5 );
		add( g, RB( 0.5, 0.24, 0.13, 0.02 ), silver, [ 0, 0.12, 0 ] );
		add( g, B( 0.49, 0.2, 0.005 ), blk, [ 0, 0.11, 0.064 ] );
		for ( const x of [ - 0.16, 0.16 ] ) {
			add( g, C( 0.075, 0.075, 0.008, 28 ).rotateX( PI / 2 ), silver, [ x, 0.11, 0.066 ] );
			add( g, C( 0.066, 0.066, 0.006, 28 ).rotateX( PI / 2 ), M( 0x141414, { rough: 0.95 } ), [ x, 0.11, 0.069 ] );
			add( g, G.dome( 0.022, 14, 6 ).rotateX( PI / 2 ), silver, [ x, 0.11, 0.07 ] );
		}
		add( g, B( 0.12, 0.07, 0.004 ), MAT.glass( 0x303840, 0.6 ), [ 0, 0.1, 0.068 ] );
		for ( const x of [ - 0.023, 0.023 ] ) add( g, C( 0.01, 0.01, 0.002, 12 ).rotateX( PI / 2 ), plastic( 0xf2f2f2 ), [ x, 0.1, 0.069 ] );
		add( g, B( 0.12, 0.022, 0.004 ), M( 0xffffff, { map: lcdTex( 'bb', '88.5 FM', '#101820', '#40d0ff' ), rough: 0.2, emissive: 0x0a2030, emissiveIntensity: 0.5 } ), [ 0, 0.175, 0.066 ] );
		for ( let i = 0; i < 6; i ++ ) add( g, B( 0.018, 0.01, 0.02 ), blk, [ - 0.06 + i * 0.024, 0.244, 0.035 ] );
		add( g, tube( [ [ - 0.17, 0.24, 0 ], [ - 0.17, 0.3, 0 ], [ 0.17, 0.3, 0 ], [ 0.17, 0.24, 0 ] ], 0.011, 24, 8 ), blk );
		add( g, C( 0.003, 0.003, 0.38, 6 ).rotateZ( - PI / 2 ), chrome(), [ 0.03, 0.25, - 0.05 ] );
		return ground( g );
	} );

	reg( 'tech_drone', () => {
		const g = group(), white = M( 0xe8eaee, { rough: 0.35 } ), gray = M( 0x4a4d52, { rough: 0.4 } );
		add( g, RB( 0.14, 0.05, 0.09, 0.02 ), white, [ 0, 0.07, 0 ] );
		add( g, RB( 0.06, 0.012, 0.06, 0.005 ), gray, [ 0.015, 0.099, 0 ] );
		for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) {
			const a = Math.atan2( sz, sx ), r = 0.15;
			add( g, B( 0.13, 0.012, 0.016 ), white, [ Math.cos( a ) * 0.075, 0.075, Math.sin( a ) * 0.075 ], [ 0, - a, 0 ] );
			const mx = Math.cos( a ) * r, mz = Math.sin( a ) * r;
			add( g, C( 0.014, 0.014, 0.022, 14 ), gray, [ mx, 0.08, mz ] );
			add( g, C( 0.004, 0.004, 0.008, 8 ), chrome(), [ mx, 0.094, mz ] );
			for ( const pa of [ 0.4, 0.4 + PI ] ) add( g, B( 0.065, 0.002, 0.013 ), plastic( 0x1e1f22, 0.35 ), [ mx + Math.cos( a + pa ) * 0.032, 0.098, mz + Math.sin( a + pa ) * 0.032 ], [ 0, - a - pa, 0.08 ] );
			add( g, C( 0.003, 0.003, 0.06, 6 ), white, [ mx * 0.75, 0.03, mz * 0.75 ] );
		}
		add( g, G.sph( 0.022, 14, 10 ), gray, [ 0.065, 0.04, 0 ] );
		add( g, C( 0.01, 0.01, 0.006, 14 ).rotateZ( - PI / 2 ), M( 0x1a2a4a, { rough: 0.05, metal: 0.6 } ), [ 0.085, 0.04, 0 ] );
		return ground( g );
	} );

	reg( 'tech_satphone', () => {
		const g = group(), body = plastic( 0x3a3d42, 0.5 ), y = 0.014;
		add( g, RB( 0.14, 0.028, 0.058, 0.01 ), body, [ 0, y, 0 ] );
		add( g, B( 0.035, 0.001, 0.042 ), M( 0xffffff, { map: lcdTex( 'sat', 'SAT ▮▮▮', '#c8d8e0', '#1a2a3a' ), rough: 0.2, emissive: 0x2a3a4a, emissiveIntensity: 0.4 } ), [ 0.03, 0.0285, 0 ] );
		for ( let i = 0; i < 4; i ++ ) for ( let j = 0; j < 3; j ++ ) add( g, G.rbox( 0.008, 0.003, 0.012, 0.0015, 1 ).translate( 0, - 0.0015, 0 ), plastic( 0x1e1f22, 0.4 ), [ - 0.04 + i * 0.012, 0.0295, - 0.016 + j * 0.016 ] );
		add( g, C( 0.009, 0.007, 0.13, 10 ).rotateZ( - PI / 2 ), plastic( 0x1e1f22, 0.6 ), [ 0.13, y + 0.004, - 0.012 ] );
		add( g, C( 0.011, 0.011, 0.02, 10 ).rotateZ( - PI / 2 ), plastic( 0x1e1f22 ), [ 0.07, y + 0.004, - 0.012 ] );
		add( g, B( 0.02, 0.008, 0.012 ), M( 0xd02a2a ), [ 0.05, 0.03, 0.02 ] );
		return ground( g );
	} );

	reg( 'tech_siren', () => {
		const g = group(), horn = M( 0xb8bcc2, { rough: 0.35, metal: 0.7, side: THREE.DoubleSide } );
		add( g, RB( 0.08, 0.05, 0.06, 0.006 ), plastic( 0x1e1f22 ), [ 0, 0.025, 0 ] );
		add( g, G.lathe( [ [ 0.018, 0 ], [ 0.022, 0.03 ], [ 0.045, 0.075 ], [ 0.06, 0.09 ] ], 20 ).rotateZ( - PI / 2 ), horn, [ 0.035, 0.065, 0 ] );
		add( g, C( 0.026, 0.026, 0.03, 16 ).rotateZ( - PI / 2 ), dark(), [ 0.02, 0.065, 0 ] );
		const bat = group();
		add( bat, RB( 0.046, 0.017, 0.026, 0.002 ), plastic( 0x141414, 0.35 ), [ 0, 0.0085, 0 ] );
		add( bat, B( 0.03, 0.0005, 0.022 ), plastic( 0xd8a830 ), [ 0, 0.0172, 0 ] );
		bat.position.set( - 0.01, 0.05, 0 );
		g.add( bat );
		add( g, B( 0.09, 0.022, 0.065 ), M( 0xa8acb2, { rough: 0.6 } ), [ - 0.005, 0.03, 0 ] );
		add( g, tube( [ [ - 0.03, 0.06, 0.01 ], [ - 0.05, 0.07, 0.03 ], [ 0.0, 0.08, 0.035 ], [ 0.02, 0.07, 0.02 ] ], 0.0018, 14, 5 ), plastic( 0xd02a2a ) );
		add( g, tube( [ [ - 0.03, 0.06, - 0.01 ], [ - 0.05, 0.075, - 0.03 ], [ 0.0, 0.082, - 0.033 ], [ 0.02, 0.07, - 0.02 ] ], 0.0018, 14, 5 ), plastic( 0x1a1a1a ) );
		add( g, B( 0.012, 0.012, 0.004 ), glow( 0xff2a1a, 0.8 ), [ - 0.035, 0.04, 0.031 ] );
		return ground( g );
	} );

	reg( 'tech_smoke', () => {
		const g = group(), w = plastic( 0xf2f0ea, 0.45 );
		add( g, C( 0.06, 0.065, 0.026, 32 ), w, [ 0, 0.013, 0 ] );
		add( g, C( 0.05, 0.06, 0.012, 32 ), w, [ 0, 0.032, 0 ] );
		for ( let i = 0; i < 16; i ++ ) { const a = i / 16 * PI * 2; add( g, B( 0.012, 0.008, 0.003 ), M( 0x8a8a86 ), [ Math.cos( a ) * 0.056, 0.032, Math.sin( a ) * 0.056 ], [ 0, - a, 0 ] ); }
		add( g, C( 0.012, 0.012, 0.004, 16 ), plastic( 0xe8e6e0, 0.4 ), [ 0, 0.04, 0 ] );
		add( g, C( 0.0025, 0.0025, 0.002, 8 ), glow( 0xff2a1a, 0.5 ), [ 0.028, 0.039, 0.0 ] );
		add( g, B( 0.03, 0.0005, 0.008 ), flat( { bg: 0xf2f0ea, fg: 0x8a2a1a, text: 'PUSH TO TEST', style: 'plain', size: 0.6 } ), [ 0, 0.0422, 0.018 ] );
		return ground( g );
	} );

	reg( 'tech_remote', () => {
		const g = group(), body = plastic( 0x1e1f22, 0.4 );
		add( g, RB( 0.19, 0.018, 0.045, 0.008 ), body, [ 0, 0.009, 0 ] );
		add( g, C( 0.004, 0.004, 0.003, 10 ), plastic( 0xd02a2a ), [ 0.08, 0.019, 0.012 ] );
		for ( let i = 0; i < 4; i ++ ) for ( let j = 0; j < 3; j ++ ) add( g, C( 0.0035, 0.0035, 0.003, 8 ), plastic( 0x6a6d72, 0.4 ), [ 0.045 - i * 0.012, 0.019, - 0.012 + j * 0.012 ] );
		add( g, C( 0.011, 0.011, 0.003, 16 ), plastic( 0x4a4d52, 0.4 ), [ - 0.025, 0.019, 0 ] );
		[ 0xd02a2a, 0x2aa04a, 0xf2c21a, 0x2a6ad6 ].forEach( ( c, i ) => add( g, B( 0.007, 0.003, 0.006 ), plastic( c ), [ - 0.055, 0.019, - 0.015 + i * 0.01 ] ) );
		for ( let i = 0; i < 3; i ++ ) add( g, B( 0.012, 0.003, 0.006 ), plastic( 0x6a6d72 ), [ - 0.075, 0.019, - 0.012 + i * 0.012 ] );
		add( g, B( 0.008, 0.008, 0.006 ), M( 0x2a0a0a, { rough: 0.1 } ), [ 0.094, 0.009, 0 ] );
		return ground( g );
	} );

	reg( 'tech_fan', () => {
		const g = group(), w = plastic( 0xf2f0ea, 0.45 ), cage = M( 0xe8e8e4, { rough: 0.4, metal: 0.3 } ), blue = plastic( 0x5aa0d8, 0.35 );
		add( g, C( 0.08, 0.09, 0.03, 24 ), w, [ 0, 0.015, 0 ] );
		add( g, C( 0.013, 0.013, 0.16, 10 ), w, [ 0, 0.11, 0 ] );
		add( g, C( 0.035, 0.035, 0.07, 18 ).rotateX( PI / 2 ), w, [ 0, 0.21, - 0.03 ] );
		const head = group(), R = 0.12;
		for ( const z of [ - 0.02, 0.02 ] ) for ( const rr of [ R, R * 0.66, R * 0.33 ] ) add( head, new THREE.TorusGeometry( rr, 0.0018, 4, 32 ), cage, [ 0, 0, z ] );
		for ( let i = 0; i < 12; i ++ ) { const a = i / 12 * PI * 2; for ( const z of [ - 0.02, 0.02 ] ) add( head, C( 0.0015, 0.0015, R, 4 ), cage, [ Math.cos( a ) * R / 2, Math.sin( a ) * R / 2, z ], [ 0, 0, a - PI / 2 ] ); }
		add( head, C( 0.02, 0.02, 0.025, 14 ).rotateX( PI / 2 ), w, [ 0, 0, 0.0 ] );
		for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2 + 0.3; add( head, new THREE.CircleGeometry( 0.05, 12 ).scale( 1, 0.55, 1 ), M( 0x5aa0d8, { rough: 0.35, side: THREE.DoubleSide } ), [ Math.cos( a ) * 0.055, Math.sin( a ) * 0.055, 0.003 ], [ 0.3, 0, a ] ); }
		add( head, new THREE.TorusGeometry( R, 0.004, 5, 32 ), blue, [ 0, 0, 0 ] );
		head.position.set( 0, 0.21, 0.025 );
		g.add( head );
		return ground( g );
	} );

	reg( 'tech_lockbox', () => {
		const g = group(), body = M( 0x3a4a3a, { rough: 0.45, metal: 0.6 } );
		add( g, RB( 0.25, 0.085, 0.18, 0.008 ), body, [ 0, 0.0425, 0 ] );
		add( g, B( 0.252, 0.004, 0.182 ), M( 0x2a3a2a, { rough: 0.5, metal: 0.6 } ), [ 0, 0.07, 0 ] );
		add( g, new THREE.TorusGeometry( 0.035, 0.005, 6, 16, PI ), chrome(), [ 0, 0.085, 0 ] );
		// a hasp and padlock on the front
		add( g, B( 0.03, 0.04, 0.006 ), chrome(), [ 0, 0.06, 0.092 ] );
		add( g, RB( 0.035, 0.03, 0.014, 0.004 ), brass(), [ 0, 0.025, 0.104 ] );
		add( g, new THREE.TorusGeometry( 0.011, 0.0028, 6, 14, PI ), chrome(), [ 0, 0.04, 0.104 ] );
		add( g, C( 0.0025, 0.0025, 0.002, 8 ).rotateX( PI / 2 ), M( 0x2a2a2a ), [ 0, 0.016, 0.1115 ] );
		return ground( g );
	} );

	// =================================== added in review ===================================

	// a yellow-holstered meter on its back: the readout, the big dial, the jacks and the red and black probes
	reg( 'tech_multimeter', () => {
		const g = group(), yel = M( 0xf2c21a, { rough: 0.7 } ), face = plastic( 0x2a2c30, 0.5 ), y = 0.034;
		add( g, RB( 0.15, 0.034, 0.08, 0.012 ), yel, [ 0, y / 2, 0 ] );
		add( g, B( 0.13, 0.002, 0.064 ), face, [ 0, y + 0.001, 0 ] );
		add( g, B( 0.046, 0.001, 0.042 ), M( 0xffffff, { map: lcdTex( 'mm', '12.6', '#9ab090', '#16241a' ), rough: 0.2 } ), [ 0.04, y + 0.0025, 0 ] );
		add( g, C( 0.023, 0.023, 0.001, 24 ), plastic( 0x8a8e94, 0.4 ), [ - 0.014, y + 0.0025, 0 ] );
		add( g, C( 0.016, 0.016, 0.008, 20 ), plastic( 0x141416, 0.4 ), [ - 0.014, y + 0.006, 0 ] );
		add( g, B( 0.026, 0.003, 0.004 ), plastic( 0xe8e8e2 ), [ - 0.014, y + 0.0105, 0 ], [ 0, 0.6, 0 ] );
		const jacks = [ [ 0.02, 0xd02a2a ], [ 0, 0x141416 ], [ - 0.02, 0x141416 ] ];
		for ( const [ z, c ] of jacks ) add( g, C( 0.0045, 0.0045, 0.004, 12 ), plastic( c, 0.4 ), [ - 0.054, y + 0.003, z ] );
		// the probes, lying in front, on their leads
		for ( const [ c, z0, pz ] of [ [ 0xd02a2a, 0.02, 0.07 ], [ 0x141416, 0, 0.088 ] ] ) {
			const m = plastic( c, 0.45 );
			add( g, tube( [ [ - 0.054, y + 0.004, z0 ], [ - 0.085, 0.012, z0 + 0.01 ], [ - 0.095, 0.004, pz - 0.01 ], [ - 0.06, 0.004, pz ], [ - 0.035, 0.005, pz ] ], 0.0018, 18, 5 ), m );
			add( g, C( 0.0045, 0.004, 0.075, 10 ).rotateZ( - PI / 2 ), m, [ 0.003, 0.005, pz ] );
			add( g, C( 0.0055, 0.0055, 0.004, 10 ).rotateZ( - PI / 2 ), m, [ 0.042, 0.0055, pz ] );
			add( g, C( 0.0008, 0.0016, 0.026, 6 ).rotateZ( - PI / 2 ), chrome(), [ 0.057, 0.005, pz ] );
		}
		return ground( g );
	} );

	// a solar security light: a squat sensor body on a foot, the white motion-sensor dome, twin lamp heads and the panel
	reg( 'tech_motionlight', () => {
		const g = group(), body = M( 0x2a2c30, { rough: 0.45, metal: 0.3 } ), lens = M( 0xf4f6f8, { rough: 0.15, emissive: 0xf0f2ff, emissiveIntensity: 0.15 } );
		add( g, RB( 0.12, 0.018, 0.09, 0.006 ), body, [ 0, 0.009, 0 ] );
		add( g, C( 0.012, 0.014, 0.06, 12 ), body, [ 0, 0.048, 0 ] );
		add( g, RB( 0.1, 0.06, 0.06, 0.012 ), body, [ 0, 0.105, 0 ] );
		add( g, G.dome( 0.019, 16, 8 ).rotateX( PI / 2 ), M( 0xf2f0ea, { rough: 0.35, transparent: true, opacity: 0.92 } ), [ 0, 0.095, 0.03 ] );
		for ( const sx of [ - 1, 1 ] ) {
			const h = group();
			add( h, RB( 0.068, 0.05, 0.032, 0.008 ), body, [ 0, 0, 0 ] );
			add( h, B( 0.056, 0.038, 0.002 ), lens, [ 0, 0, 0.0165 ] );
			for ( let i = 0; i < 4; i ++ ) add( h, B( 0.002, 0.04, 0.01 ), body, [ - 0.024 + i * 0.016, 0, - 0.02 ] );
			h.position.set( sx * 0.042, 0.155, 0.018 ); h.rotation.set( 0.45, sx * 0.25, 0 );
			g.add( h );
		}
		add( g, C( 0.006, 0.006, 0.11, 8 ).rotateZ( PI / 2 ), body, [ 0, 0.14, 0 ] );
		const pv = group();
		add( pv, B( 0.13, 0.006, 0.085 ), body, [ 0, 0, 0 ] );
		add( pv, B( 0.122, 0.001, 0.077 ), M( 0xffffff, { map: solarTex(), rough: 0.2, metal: 0.4 } ), [ 0, 0.0035, 0 ] );
		pv.position.set( 0, 0.2, - 0.025 ); pv.rotation.x = - 0.45;
		g.add( pv );
		add( g, B( 0.008, 0.06, 0.008 ), body, [ 0, 0.165, - 0.03 ] );
		return ground( g );
	} );

	// a 1990s battery TV: colour bars on the little screen, the grille and knobs beside it, the handle and a short aerial
	reg( 'tech_tv', () => {
		const g = group(), body = M( 0x34363a, { rough: 0.45 } ), blk = plastic( 0x141416, 0.5 ), W = 0.2, H = 0.16, D = 0.17, fz = D / 2;
		add( g, RB( W, H, D, 0.014 ), body, [ 0, H / 2, 0 ] );
		add( g, B( W - 0.012, H - 0.012, 0.003 ), blk, [ 0, H / 2, fz + 0.001 ] );
		add( g, B( 0.124, 0.094, 0.002 ), M( 0xffffff, { map: barsTex(), rough: 0.12 } ), [ - 0.026, H / 2 + 0.006, fz + 0.003 ] );
		for ( let i = 0; i < 6; i ++ ) add( g, B( 0.04, 0.003, 0.002 ), M( 0x050505 ), [ 0.066, H * 0.72 - i * 0.008, fz + 0.003 ] );
		for ( const y of [ 0.05, 0.026 ] ) add( g, C( 0.009, 0.009, 0.01, 16 ).rotateX( PI / 2 ), plastic( 0x8a8e94, 0.35 ), [ 0.066, y, fz + 0.007 ] );
		add( g, B( 0.004, 0.004, 0.002 ), glow( 0x2aff4a, 0.8 ), [ 0.046, 0.026, fz + 0.003 ] );
		add( g, B( 0.034, 0.008, 0.001 ), flat( { bg: 0x141416, fg: 0xd8dce2, text: 'MANA', style: 'plain', size: 0.7 } ), [ - 0.026, 0.012, fz + 0.003 ] );
		add( g, tube( [ [ - 0.07, H - 0.002, 0 ], [ - 0.06, H + 0.032, 0 ], [ 0.06, H + 0.032, 0 ], [ 0.07, H - 0.002, 0 ] ], 0.007, 20, 8 ), blk );
		// the aerial: a pivot at the back corner, swung back and out
		add( g, C( 0.008, 0.008, 0.01, 10 ), blk, [ 0.08, H + 0.004, - 0.065 ] );
		add( g, C( 0.0018, 0.003, 0.16, 8 ).translate( 0, 0.08, 0 ), chrome(), [ 0.08, H + 0.006, - 0.065 ], [ - 0.75, 0, - 0.45 ] );
		return ground( g );
	} );

	// a fish finder head on its swivel bracket, a sonar trace on the screen, and the transducer on its lead
	reg( 'tech_fishfinder', () => {
		const g = group(), blk = plastic( 0x1a1a1c, 0.45 ), grey = plastic( 0x6a6e74, 0.45 );
		add( g, RB( 0.11, 0.008, 0.06, 0.003 ), blk, [ 0, 0.004, 0 ] );
		for ( const sx of [ - 1, 1 ] ) {
			add( g, B( 0.006, 0.06, 0.022 ), blk, [ sx * 0.078, 0.036, 0 ] );
			add( g, C( 0.011, 0.011, 0.01, 14 ).rotateZ( PI / 2 ), grey, [ sx * 0.085, 0.058, 0 ] );
		}
		const head = group();
		add( head, RB( 0.145, 0.1, 0.05, 0.01 ), blk, [ 0, 0, 0 ] );
		add( head, B( 0.098, 0.074, 0.001 ), M( 0xffffff, { map: sonarTex(), rough: 0.15 } ), [ - 0.014, 0, 0.0255 ] );
		for ( let i = 0; i < 4; i ++ ) add( head, RB( 0.014, 0.009, 0.004, 0.002 ), grey, [ 0.054, 0.03 - i * 0.019, 0.026 ] );
		head.position.set( 0, 0.064, 0 ); head.rotation.x = - 0.2;
		g.add( head );
		// the transducer puck and its lead
		add( g, C( 0.028, 0.03, 0.016, 20 ), grey, [ - 0.13, 0.008, 0.05 ] );
		add( g, B( 0.024, 0.01, 0.012 ), blk, [ - 0.11, 0.018, 0.05 ] );
		add( g, tube( [ [ - 0.03, 0.04, - 0.025 ], [ - 0.06, 0.01, - 0.04 ], [ - 0.11, 0.004, - 0.01 ], [ - 0.11, 0.02, 0.04 ] ], 0.0022, 18, 5 ), blk );
		return ground( g );
	} );
}

// colour bars: the test card that says "television" at a glance
function barsTex() {
	return canvasTex( 'tech:bars', 140, 100, ( ctx, W, H ) => {
		const cols = [ '#e8e8e8', '#e8e020', '#20e0e0', '#20d020', '#e020e0', '#e02020', '#2020e0' ];
		cols.forEach( ( c, i ) => { ctx.fillStyle = c; ctx.fillRect( i * W / 7, 0, W / 7 + 1, H * 0.68 ); } );
		[ '#2020e0', '#141414', '#e020e0', '#141414', '#20e0e0', '#141414', '#e8e8e8' ].forEach( ( c, i ) => { ctx.fillStyle = c; ctx.fillRect( i * W / 7, H * 0.68, W / 7 + 1, H * 0.08 ); } );
		ctx.fillStyle = '#101820'; ctx.fillRect( 0, H * 0.76, W, H * 0.24 );
		ctx.fillStyle = '#f2f2f2'; ctx.fillRect( W * 0.18, H * 0.78, W * 0.18, H * 0.2 );
	} );
}

// a sonar trace: dark water, a red-and-yellow bottom contour, fish arches, the depth in the corner
function sonarTex() {
	return canvasTex( 'tech:sonar', 160, 120, ( ctx, W, H ) => {
		const gr = ctx.createLinearGradient( 0, 0, 0, H );
		gr.addColorStop( 0, '#0a1a3a' ); gr.addColorStop( 1, '#04081a' );
		ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
		const bottom = ( x ) => H * 0.72 + Math.sin( x * 0.05 ) * 8 + Math.sin( x * 0.13 ) * 4;
		for ( const [ c, off ] of [ [ '#f2d02a', 0 ], [ '#e8402a', 4 ], [ '#8a1a2a', 12 ] ] ) {
			ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo( 0, H );
			for ( let x = 0; x <= W; x += 4 ) ctx.lineTo( x, bottom( x ) + off );
			ctx.lineTo( W, H ); ctx.fill();
		}
		ctx.lineWidth = 3;
		for ( const [ x, y, c ] of [ [ 40, 48, '#f2d02a' ], [ 92, 62, '#e8402a' ], [ 120, 36, '#f2d02a' ], [ 66, 30, '#f2d02a' ] ] ) {
			ctx.strokeStyle = c; ctx.beginPath(); ctx.arc( x, y + 8, 9, PI * 1.15, PI * 1.85 ); ctx.stroke();
		}
		ctx.fillStyle = '#f2f2f2'; ctx.font = 'bold 22px monospace'; ctx.fillText( '18.4', 6, 22 );
	} );
}
