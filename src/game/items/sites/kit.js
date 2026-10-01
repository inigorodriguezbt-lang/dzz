// The sites' geometry kit: every prop of a site is built into one Kit and merged into a single mesh per material
// (a handful of draw calls per site whatever its prop count), coloured per vertex over a few shared materials, all
// patched for the world's atmosphere, shadows and wetness (render/Materials.js patchMaterial):
//   matte, plastic, metal,  grunge-mapped (box-projected UVs), vertex colours (paint: glossy car and drum enamel;
//   paint                   metal only for bare metal: painted metal is a dielectric under its paint)
//   cloth                   tents, tarps, towels' edges, parachutes: a weave, double sided
//   wood                    planks and logs: a grain along each part's longest axis
//   print                   the label atlas (towels, signs, stencils, livery, tape), double sided
//   glow                    embers and flare tips (emissive)
//   decal                   ground decals (blood, ash, soil, scorch, oil, papers, glass, skids): alpha atlas, no depth write
// Colliders added through the kit become physics boxes (yaw-only, as Physics.js has them).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { patchMaterial, releaseCanvasOnUpload } from '../../../render/Materials.js';

export const PI = Math.PI;
const _c = new THREE.Color();

// ---- textures ------------------------------------------------------------------------------------------------------

function canvas( w, h ) { const c = document.createElement( 'canvas' ); c.width = w; c.height = h; return c; }
function texOf( c, { srgb = true, repeat = true } = {} ) {
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	if ( repeat ) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 4;
	t.generateMipmaps = true;
	releaseCanvasOnUpload( t );
	return t;
}
function prng( seed ) { let s = seed >>> 0 || 7; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; }; }

// weathered near-white blotches: multiplies the vertex colour so flat plastic and paint read as used
function grungeTex() {
	const c = canvas( 256, 256 ), g = c.getContext( '2d' ), r = prng( 3 );
	g.fillStyle = '#f2f2f2'; g.fillRect( 0, 0, 256, 256 );
	for ( let i = 0; i < 260; i ++ ) {
		const x = r() * 256, y = r() * 256, rad = 4 + r() * 26, v = 200 + Math.floor( r() * 50 );
		const gr = g.createRadialGradient( x, y, 0, x, y, rad );
		gr.addColorStop( 0, `rgba(${v},${v},${v - 6},${0.18 + r() * 0.25})` ); gr.addColorStop( 1, `rgba(${v},${v},${v},0)` );
		g.fillStyle = gr;
		for ( const ox of [ - 256, 0, 256 ] ) for ( const oy of [ - 256, 0, 256 ] ) { g.save(); g.translate( ox, oy ); g.beginPath(); g.arc( x, y, rad, 0, PI * 2 ); g.fill(); g.restore(); }
	}
	for ( let i = 0; i < 1400; i ++ ) { const v = 170 + Math.floor( r() * 70 ); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect( r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2 ); }
	return texOf( c );
}

// canvas weave for fabric
function weaveTex() {
	const c = canvas( 128, 128 ), g = c.getContext( '2d' ), r = prng( 5 );
	g.fillStyle = '#ececec'; g.fillRect( 0, 0, 128, 128 );
	for ( let y = 0; y < 128; y += 2 ) { g.fillStyle = `rgba(150,150,150,${0.12 + r() * 0.1})`; g.fillRect( 0, y, 128, 1 ); }
	for ( let x = 0; x < 128; x += 2 ) { g.fillStyle = `rgba(160,160,160,${0.1 + r() * 0.1})`; g.fillRect( x, 0, 1, 128 ); }
	for ( let i = 0; i < 40; i ++ ) {
		const x = r() * 128, y = r() * 128, rad = 6 + r() * 20;
		const gr = g.createRadialGradient( x, y, 0, x, y, rad );
		gr.addColorStop( 0, 'rgba(120,110,90,0.18)' ); gr.addColorStop( 1, 'rgba(120,110,90,0)' );
		g.fillStyle = gr; g.fillRect( 0, 0, 128, 128 );
	}
	return texOf( c );
}

// wood grain along u
function woodTex() {
	const c = canvas( 256, 64 ), g = c.getContext( '2d' ), r = prng( 11 );
	g.fillStyle = '#e8e1d6'; g.fillRect( 0, 0, 256, 64 );
	for ( let i = 0; i < 70; i ++ ) {
		const y = r() * 64, v = 150 + Math.floor( r() * 70 );
		g.strokeStyle = `rgba(${v},${v - 12},${v - 26},${0.25 + r() * 0.35})`; g.lineWidth = 0.5 + r() * 1.6;
		g.beginPath(); g.moveTo( 0, y );
		for ( let x = 0; x <= 256; x += 16 ) g.lineTo( x, y + Math.sin( x * 0.05 + i ) * 1.5 );
		g.stroke();
	}
	for ( let i = 0; i < 6; i ++ ) { const x = r() * 256, y = r() * 64; g.fillStyle = 'rgba(90,60,40,0.35)'; g.beginPath(); g.ellipse( x, y, 4 + r() * 4, 2 + r() * 2, 0, 0, PI * 2 ); g.fill(); }
	return texOf( c );
}

// ---- the print atlas: 4 x 4 cells of 256 px ---------------------------------------------------------------------------

export const CELLS = {
	towel0: 0, towel1: 1, towel2: 2, towel3: 3, fema: 4, police_board: 5, police_door: 6, army: 7,
	fruit: 8, papaya: 9, bus: 10, camo: 11, hdr: 12, water: 13, tape: 14, relief: 15,
};

function printAtlas() {
	const S = 256, c = canvas( S * 4, S * 4 ), g = c.getContext( '2d' );
	const cell = ( i, fn ) => { g.save(); g.translate( ( i % 4 ) * S, Math.floor( i / 4 ) * S ); g.beginPath(); g.rect( 0, 0, S, S ); g.clip(); fn( g, S ); g.restore(); };
	const font = ( w, px, fam = 'Arial, Helvetica, sans-serif' ) => `${w} ${px}px ${fam}`;
	// towels (u along the towel's length)
	cell( 0, ( g, S ) => { const cols = [ '#d8382e', '#f3efe4', '#f2b51e', '#f3efe4' ]; for ( let i = 0; i < 8; i ++ ) { g.fillStyle = cols[ i % 4 ]; g.fillRect( i * S / 8, 0, S / 8, S ); } } );
	cell( 1, ( g, S ) => {
		g.fillStyle = '#1d6f9c'; g.fillRect( 0, 0, S, S );
		g.strokeStyle = '#7fd0e6'; g.lineWidth = 7;
		for ( let y = 20; y < S; y += 36 ) { g.beginPath(); for ( let x = 0; x <= S; x += 8 ) g.lineTo( x, y + Math.sin( x * 0.08 ) * 7 ); g.stroke(); }
	} );
	cell( 2, ( g, S ) => {
		g.fillStyle = '#e46a95'; g.fillRect( 0, 0, S, S );
		const r = prng( 9 );
		for ( let i = 0; i < 14; i ++ ) {
			const x = r() * S, y = r() * S, s = 16 + r() * 14;
			g.fillStyle = '#fbe7ef';
			for ( let k = 0; k < 5; k ++ ) { const a = k / 5 * PI * 2; g.beginPath(); g.ellipse( x + Math.cos( a ) * s * 0.5, y + Math.sin( a ) * s * 0.5, s * 0.5, s * 0.32, a, 0, PI * 2 ); g.fill(); }
			g.fillStyle = '#f2c230'; g.beginPath(); g.arc( x, y, s * 0.18, 0, PI * 2 ); g.fill();
		}
	} );
	cell( 3, ( g, S ) => { const cols = [ '#e0412f', '#f08a24', '#f2cf2a', '#4aa84e', '#2f7ec2', '#7a4fb0' ]; for ( let i = 0; i < 12; i ++ ) { g.fillStyle = cols[ i % 6 ]; g.fillRect( i * S / 12, 0, S / 12 + 1, S ); } } );
	// FEMA panel
	cell( 4, ( g, S ) => {
		g.fillStyle = '#ecebe6'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#1f3c78'; g.beginPath(); g.arc( S * 0.5, S * 0.36, S * 0.2, 0, PI * 2 ); g.fill();
		g.fillStyle = '#ecebe6'; g.beginPath(); g.arc( S * 0.5, S * 0.36, S * 0.15, 0, PI * 2 ); g.fill();
		g.fillStyle = '#c9a63a'; g.beginPath(); g.moveTo( S * 0.5, S * 0.25 ); g.lineTo( S * 0.58, S * 0.44 ); g.lineTo( S * 0.42, S * 0.44 ); g.closePath(); g.fill();
		g.fillStyle = '#1f3c78'; g.font = font( 'bold', 64 ); g.textAlign = 'center'; g.fillText( 'FEMA', S * 0.5, S * 0.78 );
		g.font = font( 'bold', 18 ); g.fillText( 'RELIEF STATION', S * 0.5, S * 0.9 );
	} );
	// police barrier board: orange and white chevrons with POLICE
	cell( 5, ( g, S ) => {
		g.fillStyle = '#f3efe6'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#e2581c';
		for ( let x = - S; x < S * 2; x += 48 ) { g.beginPath(); g.moveTo( x, 0 ); g.lineTo( x + 24, 0 ); g.lineTo( x + 24 + S, S ); g.lineTo( x + S, S ); g.closePath(); g.fill(); }
		g.fillStyle = '#f3efe6'; g.fillRect( S * 0.12, S * 0.33, S * 0.76, S * 0.34 );
		g.fillStyle = '#1a2b5c'; g.font = font( 'bold', 56 ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'POLICE', S * 0.5, S * 0.51 );
	} );
	// police car door: white with a blue band and lettering
	cell( 6, ( g, S ) => {
		g.fillStyle = '#e9e9e5'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#1b3f8a'; g.fillRect( 0, S * 0.55, S, S * 0.14 );
		g.fillStyle = '#1b3f8a'; g.font = font( 'bold', 48 ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'POLICE', S * 0.5, S * 0.38 );
		g.fillStyle = '#e9e9e5'; g.font = font( 'bold', 20 ); g.fillText( 'HONOLULU', S * 0.5, S * 0.62 );
	} );
	// army stencil on olive drab
	cell( 7, ( g, S ) => {
		g.fillStyle = '#5b5e3c'; g.fillRect( 0, 0, S, S );
		const r = prng( 13 );
		for ( let i = 0; i < 300; i ++ ) { g.fillStyle = `rgba(30,30,10,${r() * 0.12})`; g.fillRect( r() * S, r() * S, 2 + r() * 8, 1 + r() * 3 ); }
		g.fillStyle = 'rgba(232,226,200,0.85)'; g.font = font( 'bold', 54, 'Courier New, monospace' ); g.textAlign = 'center';
		g.fillText( 'U.S.', S * 0.5, S * 0.42 ); g.font = font( 'bold', 22, 'Courier New, monospace' ); g.fillText( 'NSN 8970-01-321', S * 0.5, S * 0.62 ); g.fillText( 'CTG 5.56MM', S * 0.5, S * 0.76 );
	} );
	// hand-painted farm signs on plywood
	const ply = ( g, S ) => {
		g.fillStyle = '#c9a77a'; g.fillRect( 0, 0, S, S );
		const r = prng( 17 );
		for ( let i = 0; i < 40; i ++ ) { g.strokeStyle = `rgba(120,85,50,${0.15 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; const y = r() * S; g.beginPath(); g.moveTo( 0, y ); g.bezierCurveTo( S * 0.3, y + 6, S * 0.6, y - 6, S, y + 3 ); g.stroke(); }
	};
	cell( 8, ( g, S ) => { ply( g, S ); g.fillStyle = '#b8261d'; g.font = font( 'bold', 54, 'Impact, Arial Black, sans-serif' ); g.textAlign = 'center'; g.fillText( 'FRESH', S * 0.5, S * 0.42 ); g.fillStyle = '#2e6b2a'; g.fillText( 'FRUIT', S * 0.5, S * 0.75 ); } );
	cell( 9, ( g, S ) => { ply( g, S ); g.fillStyle = '#2e5a2a'; g.font = font( 'bold', 40, 'Impact, Arial Black, sans-serif' ); g.textAlign = 'center'; g.fillText( 'PAPAYA $1', S * 0.5, S * 0.36 ); g.fillStyle = '#b8261d'; g.fillText( 'BANANAS', S * 0.5, S * 0.62 ); g.fillStyle = '#1f2f6a'; g.font = font( 'bold', 28, 'Impact, Arial Black, sans-serif' ); g.fillText( 'MAHALO', S * 0.5, S * 0.86 ); } );
	// bus stop sign
	cell( 10, ( g, S ) => {
		g.fillStyle = '#f2f2ee'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#1f5fa8'; g.fillRect( 10, 10, S - 20, S * 0.5 );
		g.fillStyle = '#f2f2ee'; g.font = font( 'bold', 72 ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'BUS', S * 0.5, S * 0.29 );
		g.fillStyle = '#1f5fa8'; g.font = font( 'bold', 30 ); g.fillText( 'STOP', S * 0.5, S * 0.68 ); g.font = font( 'bold', 20 ); g.fillText( 'TheBus  52  55', S * 0.5, S * 0.84 );
	} );
	// woodland camouflage
	cell( 11, ( g, S ) => {
		g.fillStyle = '#5f6440'; g.fillRect( 0, 0, S, S );
		const r = prng( 21 );
		for ( const [ col, n ] of [ [ '#3e4a2a', 26 ], [ '#7b6a45', 18 ], [ '#23261a', 14 ] ] ) {
			g.fillStyle = col;
			for ( let i = 0; i < n; i ++ ) { const x = r() * S, y = r() * S; g.beginPath(); g.moveTo( x, y ); for ( let k = 0; k < 7; k ++ ) { const a = k / 7 * PI * 2; const rr = 14 + r() * 26; g.lineTo( x + Math.cos( a ) * rr * 1.6, y + Math.sin( a ) * rr ); } g.closePath(); g.fill(); }
		}
	} );
	// humanitarian ration boxes
	cell( 12, ( g, S ) => {
		g.fillStyle = '#e7c34a'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#7a2a1a'; g.font = font( 'bold', 30 ); g.textAlign = 'center';
		g.fillText( 'HUMANITARIAN', S * 0.5, S * 0.3 ); g.fillText( 'DAILY RATION', S * 0.5, S * 0.45 );
		g.font = font( 'bold', 20 ); g.fillText( 'FOOD GIFT OF THE', S * 0.5, S * 0.66 ); g.fillText( 'UNITED STATES', S * 0.5, S * 0.78 );
		g.strokeStyle = '#7a2a1a'; g.lineWidth = 4; g.strokeRect( 8, 8, S - 16, S - 16 );
	} );
	cell( 13, ( g, S ) => {
		g.fillStyle = '#d9e6ee'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#1f5fa8'; g.fillRect( 0, S * 0.3, S, S * 0.4 );
		g.fillStyle = '#ffffff'; g.font = font( 'bold', 60 ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'WATER', S * 0.5, S * 0.5 );
	} );
	// police tape (u along the tape)
	cell( 14, ( g, S ) => {
		g.fillStyle = '#f2d21b'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#111'; g.font = font( 'bold', 34 ); g.textBaseline = 'middle';
		g.save(); g.scale( 0.5, 1 ); g.fillText( 'POLICE LINE  DO NOT CROSS', 8, S * 0.5 ); g.restore();
		g.fillRect( 0, 4, S, 14 ); g.fillRect( 0, S - 18, S, 14 );
	} );
	// relief crate stencil on wood
	cell( 15, ( g, S ) => {
		g.fillStyle = '#b89464'; g.fillRect( 0, 0, S, S );
		const r = prng( 23 );
		for ( let i = 0; i < 30; i ++ ) { g.strokeStyle = `rgba(110,75,40,${0.2 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; const y = r() * S; g.beginPath(); g.moveTo( 0, y ); g.lineTo( S, y + ( r() - 0.5 ) * 8 ); g.stroke(); }
		g.fillStyle = 'rgba(30,30,30,0.85)'; g.font = font( 'bold', 40, 'Courier New, monospace' ); g.textAlign = 'center';
		g.fillText( 'RELIEF', S * 0.5, S * 0.38 ); g.font = font( 'bold', 24, 'Courier New, monospace' ); g.fillText( 'AIRDROP', S * 0.5, S * 0.56 ); g.fillText( 'THIS SIDE UP', S * 0.5, S * 0.74 );
		g.fillStyle = '#c0281e'; g.beginPath(); g.moveTo( S * 0.5, S * 0.8 ); g.lineTo( S * 0.56, S * 0.92 ); g.lineTo( S * 0.44, S * 0.92 ); g.closePath(); g.fill();
	} );
	const t = texOf( c, { repeat: false } );
	return t;
}

// ---- ground decals: 4 x 4 cells of 128 px with alpha ------------------------------------------------------------------

export const DECALS = { blood_pool: 0, blood_drag: 1, ash: 2, scorch: 3, soil: 4, oil: 5, papers: 6, glass: 7, skid: 8, hole: 9 };

function decalAtlas() {
	const S = 128, c = canvas( S * 4, S * 4 ), g = c.getContext( '2d' );
	const cell = ( i, fn ) => { g.save(); g.translate( ( i % 4 ) * S, Math.floor( i / 4 ) * S ); g.beginPath(); g.rect( 0, 0, S, S ); g.clip(); fn( g, S, prng( 31 + i * 7 ) ); g.restore(); };
	const blob = ( g, x, y, rad, col, a0, a1 = 0 ) => { const gr = g.createRadialGradient( x, y, 0, x, y, rad ); gr.addColorStop( 0, col( a0 ) ); gr.addColorStop( 0.7, col( a0 * 0.8 ) ); gr.addColorStop( 1, col( a1 ) ); g.fillStyle = gr; g.beginPath(); g.arc( x, y, rad, 0, PI * 2 ); g.fill(); };
	const blood = ( a ) => `rgba(62,10,8,${a})`;
	cell( 0, ( g, S, r ) => { for ( let i = 0; i < 9; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.35, S / 2 + ( r() - 0.5 ) * S * 0.35, S * ( 0.12 + r() * 0.16 ), blood, 0.9 ); for ( let i = 0; i < 20; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.8, S / 2 + ( r() - 0.5 ) * S * 0.8, 2 + r() * 5, blood, 0.8 ); } );
	cell( 1, ( g, S, r ) => { for ( let i = 0; i < 26; i ++ ) { const t = i / 26; blob( g, S * ( 0.1 + t * 0.8 ), S / 2 + Math.sin( t * 5 ) * 6 + ( r() - 0.5 ) * 8, S * ( 0.07 + ( 1 - t ) * 0.07 ), blood, 0.55 * ( 1 - t * 0.6 ) ); } } );
	cell( 2, ( g, S, r ) => {
		blob( g, S / 2, S / 2, S * 0.48, ( a ) => `rgba(40,36,32,${a})`, 0.85 );
		for ( let i = 0; i < 60; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.6, S / 2 + ( r() - 0.5 ) * S * 0.6, 2 + r() * 6, ( a ) => `rgba(${120 + r() * 60},${115 + r() * 50},${105 + r() * 40},${a})`, 0.6 );
		for ( let i = 0; i < 25; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.4, S / 2 + ( r() - 0.5 ) * S * 0.4, 2 + r() * 4, ( a ) => `rgba(10,8,6,${a})`, 0.9 );
	} );
	cell( 3, ( g, S, r ) => { for ( let i = 0; i < 14; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.4, S / 2 + ( r() - 0.5 ) * S * 0.4, S * ( 0.18 + r() * 0.22 ), ( a ) => `rgba(18,15,12,${a})`, 0.6 ); } );
	cell( 4, ( g, S, r ) => {
		blob( g, S / 2, S / 2, S * 0.46, ( a ) => `rgba(52,40,30,${a})`, 0.92 );
		for ( let i = 0; i < 70; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.75, S / 2 + ( r() - 0.5 ) * S * 0.75, 1.5 + r() * 4, ( a ) => `rgba(${36 + r() * 30},${28 + r() * 20},${20 + r() * 12},${a})`, 0.9 );
	} );
	cell( 5, ( g, S, r ) => { for ( let i = 0; i < 7; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.4, S / 2 + ( r() - 0.5 ) * S * 0.4, S * ( 0.12 + r() * 0.2 ), ( a ) => `rgba(8,8,10,${a})`, 0.75 ); } );
	cell( 6, ( g, S, r ) => {
		for ( let i = 0; i < 11; i ++ ) {
			g.save(); g.translate( S * ( 0.15 + r() * 0.7 ), S * ( 0.15 + r() * 0.7 ) ); g.rotate( r() * PI );
			const w = 16 + r() * 10, h = w * 1.3, v = 215 + Math.floor( r() * 30 );
			g.fillStyle = `rgba(${v},${v - 4},${v - 14},0.97)`; g.fillRect( - w / 2, - h / 2, w, h );
			g.fillStyle = 'rgba(60,60,70,0.5)'; for ( let y = - h / 2 + 4; y < h / 2 - 3; y += 3 ) g.fillRect( - w / 2 + 3, y, w * ( 0.5 + r() * 0.4 ), 1 );
			g.restore();
		}
	} );
	cell( 7, ( g, S, r ) => { for ( let i = 0; i < 90; i ++ ) { const x = S / 2 + ( r() - 0.5 ) * S * 0.85, y = S / 2 + ( r() - 0.5 ) * S * 0.85, s = 1 + r() * 4; g.fillStyle = `rgba(${200 + r() * 55},${220 + r() * 35},${230},${0.5 + r() * 0.5})`; g.beginPath(); g.moveTo( x, y - s ); g.lineTo( x + s, y ); g.lineTo( x, y + s * 0.6 ); g.closePath(); g.fill(); } } );
	cell( 8, ( g, S, r ) => { for ( const y of [ S * 0.3, S * 0.7 ] ) for ( let x = 0; x < S; x += 2 ) { g.fillStyle = `rgba(14,14,14,${0.5 * Math.sin( x / S * PI ) + r() * 0.1})`; g.fillRect( x, y - 6, 2, 12 ); } } );
	cell( 9, ( g, S, r ) => {
		blob( g, S / 2, S / 2, S * 0.48, ( a ) => `rgba(70,50,32,${a})`, 0.95 );
		blob( g, S / 2, S / 2, S * 0.33, ( a ) => `rgba(22,15,10,${a})`, 1, 0.9 );
		for ( let i = 0; i < 30; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.8, S / 2 + ( r() - 0.5 ) * S * 0.8, 1.5 + r() * 4, ( a ) => `rgba(60,42,26,${a})`, 0.9 );
	} );
	return texOf( c, { repeat: false } );
}

// ---- materials -------------------------------------------------------------------------------------------------------

let MATS = null;
export function siteMaterials() {
	if ( MATS ) return MATS;
	const grunge = grungeTex(), weave = weaveTex(), wood = woodTex(), atlas = printAtlas(), decals = decalAtlas();
	const std = ( key, o ) => patchMaterial( new THREE.MeshStandardMaterial( { color: 0xffffff, vertexColors: true, ...o } ), 'site-' + key );
	MATS = {
		matte: std( 'matte', { roughness: 0.9, map: grunge } ),
		plastic: std( 'plastic', { roughness: 0.45, map: grunge } ),
		metal: std( 'metal', { roughness: 0.48, metalness: 0.7, map: grunge } ),
		paint: std( 'paint', { roughness: 0.36, map: grunge } ),
		cloth: std( 'cloth', { roughness: 0.96, map: weave, side: THREE.DoubleSide } ),
		wood: std( 'wood', { roughness: 0.86, map: wood } ),
		print: std( 'print', { roughness: 0.82, map: atlas, side: THREE.DoubleSide } ),
		glow: patchMaterial( new THREE.MeshStandardMaterial( { color: 0x101010, emissive: 0xff5418, emissiveIntensity: 4, roughness: 1 } ), 'site-glow' ),
		decal: patchMaterial( new THREE.MeshStandardMaterial( {
			color: 0xffffff, map: decals, roughness: 0.85, transparent: true, depthWrite: false, alphaTest: 0.02,
			polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 4,
		} ), 'site-decal', null, { noWet: true } ),
	};
	// UV handling per material: box-projected tiles (metres per repeat), the atlas, or none
	MATS.matte.userData.uv = { box: 1.6 }; MATS.plastic.userData.uv = { box: 1.2 }; MATS.metal.userData.uv = { box: 1.4 }; MATS.paint.userData.uv = { box: 1.6 };
	MATS.cloth.userData.uv = { box: 0.5 }; MATS.wood.userData.uv = { grain: 1.1 }; MATS.print.userData.uv = { atlas: 4 };
	MATS.decal.userData.uv = { atlas: 4 }; MATS.glow.userData.uv = null;
	MATS.decal.userData.noShadow = true; MATS.glow.userData.noShadow = true;
	return MATS;
}

// ---- the kit -----------------------------------------------------------------------------------------------------------

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

export const geo = {
	box: ( w, h, d ) => new THREE.BoxGeometry( w, h, d ).translate( 0, h / 2, 0 ),
	rbox: ( w, h, d, r = 0.02, seg = 2 ) => new RoundedBoxGeometry( w, h, d, seg, Math.max( 1e-4, Math.min( r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4 ) ) ).translate( 0, h / 2, 0 ),
	cyl: ( rt, rb, h, seg = 12, open = false ) => new THREE.CylinderGeometry( rt, rb, h, seg, 1, open ).translate( 0, h / 2, 0 ),
	cylX: ( r, len, seg = 10, r2 = r ) => new THREE.CylinderGeometry( r2, r, len, seg ).rotateZ( - PI / 2 ),
	cylZ: ( r, len, seg = 10, r2 = r ) => new THREE.CylinderGeometry( r2, r, len, seg ).rotateX( PI / 2 ),
	sph: ( r, ws = 10, hs = 8 ) => new THREE.SphereGeometry( r, ws, hs ),
	dome: ( r, ws = 14, hs = 6 ) => new THREE.SphereGeometry( r, ws, hs, 0, PI * 2, 0, PI / 2 ),
	cone: ( r, h, seg = 12, open = false ) => new THREE.ConeGeometry( r, h, seg, 1, open ).translate( 0, h / 2, 0 ),
	torus: ( R, r, rs = 6, ts = 16, arc = PI * 2 ) => new THREE.TorusGeometry( R, r, rs, ts, arc ),
	plane: ( w, d, sx = 1, sz = 1 ) => new THREE.PlaneGeometry( w, d, sx, sz ).rotateX( - PI / 2 ),
	tube: ( pts, r, seg = 12, rs = 5 ) => new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( ...p ) ) ), seg, r, rs, false ),
	lathe: ( pts, seg = 14 ) => new THREE.LatheGeometry( pts.map( p => new THREE.Vector2( Math.max( 0, p[ 0 ] ), p[ 1 ] ) ), seg ),
	ico: ( r, d = 0 ) => new THREE.IcosahedronGeometry( r, d ),
	dodeca: ( r ) => new THREE.DodecahedronGeometry( r, 0 ),
};

export class Kit {
	constructor() {
		this.groups = new Map(); // material key -> [ part ]
		this.boxes = [];
		this.stack = [ new THREE.Matrix4() ];
		this.yaws = [ 0 ];
		// draping: parts made with { drape: true } follow the ground under each vertex (towels, clothes, a
		// collapsed parachute) instead of lying flat from their origin; ground( x, z ) in the kit's root frame and
		// base, the ground height the current prop stands on, are set by whoever places the props
		this.ground = null;
		this.base = 0;
	}
	get T() { return this.stack[ this.stack.length - 1 ]; }

	// enter a local frame: p = [ x, y, z ], r = [ rx, ry, rz ] (Euler XYZ), s = scale
	push( p = null, r = null, s = null ) {
		_e.set( r?.[ 0 ] || 0, r?.[ 1 ] || 0, r?.[ 2 ] || 0 );
		_q.setFromEuler( _e );
		_p.set( p?.[ 0 ] || 0, p?.[ 1 ] || 0, p?.[ 2 ] || 0 );
		if ( typeof s === 'number' ) _s.setScalar( s ); else _s.set( s?.[ 0 ] ?? 1, s?.[ 1 ] ?? 1, s?.[ 2 ] ?? 1 );
		const m = new THREE.Matrix4().compose( _p, _q, _s );
		this.stack.push( this.T.clone().multiply( m ) );
		this.yaws.push( this.yaws[ this.yaws.length - 1 ] + ( r?.[ 1 ] || 0 ) );
		return this;
	}
	pop() { if ( this.stack.length > 1 ) { this.stack.pop(); this.yaws.pop(); } return this; }

	// a geometry part: mat is a key of siteMaterials(); color a hex (sRGB) or THREE.Color; o: { p, r, s, cell, a (alpha for decals) }
	part( g, mat, color, p = null, r = null, s = null, o = {} ) {
		_e.set( r?.[ 0 ] || 0, r?.[ 1 ] || 0, r?.[ 2 ] || 0 );
		_q.setFromEuler( _e );
		_p.set( p?.[ 0 ] || 0, p?.[ 1 ] || 0, p?.[ 2 ] || 0 );
		if ( typeof s === 'number' ) _s.setScalar( s ); else _s.set( s?.[ 0 ] ?? 1, s?.[ 1 ] ?? 1, s?.[ 2 ] ?? 1 );
		const m = this.T.clone().multiply( _m.compose( _p, _q, _s ) );
		let list = this.groups.get( mat );
		if ( ! list ) { list = []; this.groups.set( mat, list ); }
		_c.set( color ?? 0xffffff );
		list.push( { g, m, r: _c.r, g_: _c.g, b: _c.b, cell: o.cell ?? null, scale: [ _s.x, _s.y, _s.z ], drape: o.drape && this.ground ? this.base : null } );
		return this;
	}
	box( w, h, d, mat, color, p, r, o ) { return this.part( geo.box( w, h, d ), mat, color, p, r, null, o ); }
	rbox( w, h, d, rad, mat, color, p, r, o ) { return this.part( geo.rbox( w, h, d, rad ), mat, color, p, r, null, o ); }
	cyl( rt, rb, h, mat, color, p, r, seg = 12, o ) { return this.part( geo.cyl( rt, rb, h, seg ), mat, color, p, r, null, o ); }

	// a physics box: centre p in the current frame, half sizes, extra yaw; mat drives impact sounds
	collider( hx, hy, hz, p = [ 0, 0, 0 ], yaw = 0, mat = 'wood', kind = 'solid' ) {
		_v.set( p[ 0 ], p[ 1 ], p[ 2 ] ).applyMatrix4( this.T );
		this.boxes.push( { x: _v.x, y: _v.y, z: _v.z, hx, hy, hz, yaw: this.yaws[ this.yaws.length - 1 ] + yaw, mat, kind } );
		return this;
	}

	// a flat decal conformed to the ground: heightAt( lx, lz ) in this kit's root frame
	decal( kind, x, z, size, yaw, heightAt, a = 1 ) {
		const n = size > 4 ? 6 : 3;
		const pg = new THREE.PlaneGeometry( size, size, n, n ).rotateX( - PI / 2 ).rotateY( yaw );
		const pos = pg.attributes.position;
		for ( let i = 0; i < pos.count; i ++ ) {
			const px = pos.getX( i ) + x, pz = pos.getZ( i ) + z;
			pos.setXYZ( i, px, heightAt( px, pz ) + 0.03 + size * 0.002, pz );
		}
		pg.computeVertexNormals();
		const list = this.groups.get( 'decal' ) || this.groups.set( 'decal', [] ).get( 'decal' );
		list.push( { g: pg, m: null, r: 1, g_: 1, b: 1, cell: DECALS[ kind ] ?? 0, a, scale: [ 1, 1, 1 ] } );
		return this;
	}

	// merge each material's parts into one mesh; returns { group, boxes, tris }. begin() / step( until ) / end() do
	// the same a few parts at a time (a camp is ~20k vertices: tens of ms in one go in a browser)
	build( name = 'site' ) {
		this.begin( name );
		this.step( Infinity );
		return this.end();
	}

	begin( name = 'site' ) {
		const M = siteMaterials();
		const group = new THREE.Group();
		group.name = name;
		this._m = { name, group, tris: 0, list: [ ...this.groups ].filter( ( [ k, parts ] ) => M[ k ] && parts.length ), gi: 0, pi: 0, cur: null };
		return this;
	}

	// merge parts until the time runs out; true when every material is done
	step( until = Infinity ) {
		const B = this._m, M = siteMaterials();
		while ( B.gi < B.list.length ) {
			const [ key, parts ] = B.list[ B.gi ];
			const mat = M[ key ];
			if ( ! B.cur ) {
				let nv = 0, ni = 0;
				for ( const p of parts ) {
					const c = p.g.attributes.position.count;
					nv += c; ni += p.g.index ? p.g.index.count : c;
				}
				B.cur = {
					pos: new Float32Array( nv * 3 ), nor: new Float32Array( nv * 3 ), col: new Float32Array( nv * 3 ),
					uv: mat.userData.uv ? new Float32Array( nv * 2 ) : null, idx: nv > 65535 ? new Uint32Array( ni ) : new Uint16Array( ni ), vo: 0, io: 0,
				};
			}
			while ( B.pi < parts.length ) {
				this._merge( B.cur, parts[ B.pi ++ ], mat.userData.uv );
				if ( performance.now() > until && B.pi < parts.length ) return false;
			}
			const { pos, nor, col, uv, idx, io } = B.cur;
			const bg = new THREE.BufferGeometry();
			bg.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
			bg.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
			bg.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
			if ( uv ) bg.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
			bg.setIndex( new THREE.BufferAttribute( idx, 1 ) );
			bg.computeBoundingSphere();
			bg.computeBoundingBox();
			const mesh = new THREE.Mesh( bg, mat );
			mesh.name = B.name + ':' + key;
			mesh.castShadow = ! mat.userData.noShadow;
			mesh.receiveShadow = true;
			mesh.userData.shadow = mesh.castShadow;
			if ( key === 'decal' ) mesh.renderOrder = 2;
			B.group.add( mesh );
			B.tris += io / 3;
			B.cur = null; B.pi = 0; B.gi ++;
			if ( performance.now() > until ) return B.gi >= B.list.length;
		}
		return true;
	}

	end() {
		const B = this._m;
		this._m = null;
		this.groups.clear();
		return { group: B.group, boxes: this.boxes, tris: B.tris };
	}

	// one part into its material's arrays (C: { pos, nor, col, uv, idx, vo, io })
	_merge( C, p, uvMode ) {
		const { pos, nor, col, uv, idx } = C;
		const vo = C.vo;
		let io = C.io;
		// plain arrays, not getX() per vertex
		const gp = flat( p.g.attributes.position ), gn = flat( p.g.attributes.normal ), gu = flat( p.g.attributes.uv );
		const pa = gp.array, na = gn ? gn.array : null, ua = gu ? gu.array : null;
		const m = p.m, me = m ? m.elements : null, ne = _nm.elements;
		if ( m ) _nm.getNormalMatrix( m );
		const drape = p.drape !== null && p.drape !== undefined;
		// the grain runs along the part's longest axis
		let ga = 0;
		if ( uvMode?.grain ) {
			p.g.computeBoundingBox();
			const b = p.g.boundingBox, sx = ( b.max.x - b.min.x ) * p.scale[ 0 ], sy = ( b.max.y - b.min.y ) * p.scale[ 1 ], sz = ( b.max.z - b.min.z ) * p.scale[ 2 ];
			ga = sx >= sy && sx >= sz ? 0 : sz >= sy ? 2 : 1;
		}
		for ( let i = 0; i < gp.count; i ++ ) {
			const i3 = i * 3;
			let x = pa[ i3 ], y = pa[ i3 + 1 ], z = pa[ i3 + 2 ];
			let nx = 0, ny = 1, nz = 0;
			if ( na ) { nx = na[ i3 ]; ny = na[ i3 + 1 ]; nz = na[ i3 + 2 ]; }
			if ( uv ) {
				let u = 0, w = 0;
				if ( uvMode.atlas ) {
					const k = p.cell ?? 0, A = uvMode.atlas, cu = ( k % A ) / A, cv = 1 - ( Math.floor( k / A ) + 1 ) / A;
					const su = ua ? ua[ i * 2 ] : 0, sv = ua ? ua[ i * 2 + 1 ] : 0;
					// (a small inset keeps mip filtering inside the cell)
					u = cu + ( 0.01 + Math.min( 1, Math.max( 0, su ) ) * 0.98 ) / A; w = cv + ( 0.01 + Math.min( 1, Math.max( 0, sv ) ) * 0.98 ) / A;
				} else {
					// box projection in part space (scaled), tiled by the material's repeat
					const lx = x * p.scale[ 0 ], ly = y * p.scale[ 1 ], lz = z * p.scale[ 2 ];
					const ax = Math.abs( nx ), ay = Math.abs( ny ), az = Math.abs( nz );
					if ( uvMode.grain ) {
						const t = uvMode.grain;
						const along = ga === 0 ? lx : ga === 1 ? ly : lz;
						const across = ga === 0 ? ( ay > az ? lz : ly ) : ga === 1 ? ( ax > az ? lz : lx ) : ( ay > ax ? lx : ly );
						u = along / t; w = across / ( t * 0.25 );
					} else {
						const t = uvMode.box;
						if ( ay >= ax && ay >= az ) { u = lx / t; w = lz / t; } else if ( ax >= az ) { u = lz / t; w = ly / t; } else { u = lx / t; w = ly / t; }
					}
				}
				uv[ ( vo + i ) * 2 ] = u; uv[ ( vo + i ) * 2 + 1 ] = w;
			}
			if ( me ) {
				// affine (the kit only composes translations, rotations and scales)
				const px = x, py = y, pz = z;
				x = me[ 0 ] * px + me[ 4 ] * py + me[ 8 ] * pz + me[ 12 ];
				y = me[ 1 ] * px + me[ 5 ] * py + me[ 9 ] * pz + me[ 13 ];
				z = me[ 2 ] * px + me[ 6 ] * py + me[ 10 ] * pz + me[ 14 ];
				const qx = ne[ 0 ] * nx + ne[ 3 ] * ny + ne[ 6 ] * nz, qy = ne[ 1 ] * nx + ne[ 4 ] * ny + ne[ 7 ] * nz, qz = ne[ 2 ] * nx + ne[ 5 ] * ny + ne[ 8 ] * nz;
				const l = Math.hypot( qx, qy, qz ) || 1;
				nx = qx / l; ny = qy / l; nz = qz / l;
			}
			if ( drape ) y += this.ground( x, z ) - p.drape + 0.015;
			const o = ( vo + i ) * 3;
			pos[ o ] = x; pos[ o + 1 ] = y; pos[ o + 2 ] = z;
			nor[ o ] = nx; nor[ o + 1 ] = ny; nor[ o + 2 ] = nz;
			col[ o ] = p.r; col[ o + 1 ] = p.g_; col[ o + 2 ] = p.b;
		}
		// a mirrored part (negative scale) would turn its faces inside out
		const flip = m && m.determinant() < 0;
		if ( p.g.index ) {
			const ia = p.g.index.array;
			for ( let i = 0; i < ia.length; i += 3 ) {
				idx[ io ++ ] = ia[ i ] + vo;
				idx[ io ++ ] = ia[ i + ( flip ? 2 : 1 ) ] + vo;
				idx[ io ++ ] = ia[ i + ( flip ? 1 : 2 ) ] + vo;
			}
		} else {
			for ( let i = 0; i < gp.count; i += 3 ) { idx[ io ++ ] = vo + i; idx[ io ++ ] = vo + i + ( flip ? 2 : 1 ); idx[ io ++ ] = vo + i + ( flip ? 1 : 2 ); }
		}
		C.vo = vo + gp.count;
		C.io = io;
		p.g.dispose();
	}
}

// an interleaved attribute as a plain one
const flat = ( a ) => a && ( a.isInterleavedBufferAttribute ? a.clone() : a );

export function shade( c, k ) {
	const col = new THREE.Color( c );
	if ( k < 0 ) col.multiplyScalar( 1 + k ); else col.lerp( new THREE.Color( 1, 1, 1 ), k );
	return col.getHex();
}
