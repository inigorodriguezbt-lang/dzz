// The sites' geometry kit: every prop of a site is built into one Kit and merged into a single mesh per material
// (a handful of draw calls per site whatever its prop count), coloured per vertex over a few shared materials, all
// patched for the world's atmosphere, shadows and wetness (render/Materials.js patchMaterial):
//   matte, plastic, metal,  grunge-mapped (box-projected UVs), vertex colours (paint: glossy car and drum enamel;
//   paint                   metal only for bare metal: painted metal is a dielectric under its paint)
//   cloth                   tents, tarps, towels' edges, parachutes: a weave with its bumps, double sided
//   wood                    planks and logs: a grain along each part's longest axis
//   print                   the label atlas (towels, signs, stencils, livery, tape, soot, a camo net's cut-outs,
//                           an umbrella's fringe), alpha-tested, double sided
//   film                    shrink wrap: thin glossy plastic you see the load through (no shadow)
//   glow                    embers and flare tips (emissive)
//   decal                   ground decals (blood, ash, soil, scorch, oil, papers, glass, skids, brass, litter,
//                           trampled ground, char, boot prints, twigs): alpha atlas, no depth write
// Parts marked { fine: true } (litter, brass, guy lines, pegs) merge into meshes of their own that only draw within
// FINE_R of the camera: small things cost nothing past the distance where they'd be a pixel.
// Colliders added through the kit become physics boxes (yaw-only, as Physics.js has them).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { patchMaterial, releaseCanvasOnUpload, G } from '../../../render/Materials.js';

export const PI = Math.PI;
const _c = new THREE.Color();
export const FINE_R = 55;

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
	// runs and drips (streaks down from edges read as rain-weathered)
	for ( let i = 0; i < 40; i ++ ) { const x = r() * 256, y = r() * 256, l = 20 + r() * 60, v = 175 + Math.floor( r() * 40 ); g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.18)`; g.fillRect( x, y, 1 + r() * 2, l ); }
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

// the weave's bumps as a normal map, worked out from a height field (threads over and under each other)
function weaveNormalTex() {
	const N = 128, c = canvas( N, N ), g = c.getContext( '2d' ), img = g.createImageData( N, N ), r = prng( 9 );
	const h = new Float32Array( N * N );
	for ( let y = 0; y < N; y ++ ) for ( let x = 0; x < N; x ++ ) {
		// a plain weave: warp and weft threads alternate every 4 px, each a rounded ridge
		const wx = Math.sin( ( x % 4 ) / 4 * PI ), wy = Math.sin( ( y % 4 ) / 4 * PI );
		const over = ( ( x >> 2 ) + ( y >> 2 ) ) & 1;
		h[ y * N + x ] = over ? wx * 0.8 + wy * 0.2 : wy * 0.8 + wx * 0.2;
	}
	for ( let i = 0; i < N * N; i ++ ) h[ i ] += ( r() - 0.5 ) * 0.25;
	const at = ( x, y ) => h[ ( ( y + N ) % N ) * N + ( x + N ) % N ];
	for ( let y = 0; y < N; y ++ ) for ( let x = 0; x < N; x ++ ) {
		const dx = ( at( x + 1, y ) - at( x - 1, y ) ) * 0.9, dy = ( at( x, y + 1 ) - at( x, y - 1 ) ) * 0.9;
		const l = Math.hypot( dx, dy, 1 ), o = ( y * N + x ) * 4;
		img.data[ o ] = ( - dx / l * 0.5 + 0.5 ) * 255; img.data[ o + 1 ] = ( dy / l * 0.5 + 0.5 ) * 255; img.data[ o + 2 ] = ( 1 / l * 0.5 + 0.5 ) * 255; img.data[ o + 3 ] = 255;
	}
	g.putImageData( img, 0, 0 );
	return texOf( c, { srgb: false } );
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

// ---- the print atlas: 8 x 5 cells of 256 px ---------------------------------------------------------------------------

export const ATLAS = [ 8, 5 ];
export const CELLS = {
	towel0: 0, towel1: 1, towel2: 2, towel3: 3, fema: 4, police_board: 5, police_door: 6, army: 7,
	fruit: 8, papaya: 9, bus: 10, camo: 11, hdr: 12, water: 13, tape: 14, relief: 15,
	cooler: 16, fringe: 17, hesco: 18, camo_net: 19, mre: 20, ammo: 21, medical: 22, can: 23,
	chalk: 24, carton: 25, restricted: 26, missing: 27, flag: 28, tag: 29, ammo_can: 30, marines: 31,
	soot: 32, rescue: 33, gingham: 34, stripes: 35, help: 36, news: 37, plate: 38, plain: 39,
};

function printAtlas() {
	const S = 256, [ AC, AR ] = ATLAS, c = canvas( S * AC, S * AR ), g = c.getContext( '2d' );
	const cell = ( i, fn ) => { g.save(); g.translate( ( i % AC ) * S, Math.floor( i / AC ) * S ); g.beginPath(); g.rect( 0, 0, S, S ); g.clip(); fn( g, S ); g.restore(); };
	const font = ( w, px, fam = 'Arial, Helvetica, sans-serif' ) => `${w} ${px}px ${fam}`;
	const STEN = 'Courier New, monospace', IMPACT = 'Impact, Arial Black, sans-serif';
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
		g.fillStyle = 'rgba(232,226,200,0.85)'; g.font = font( 'bold', 54, STEN ); g.textAlign = 'center';
		g.fillText( 'U.S.', S * 0.5, S * 0.42 ); g.font = font( 'bold', 22, STEN ); g.fillText( 'NSN 8970-01-321', S * 0.5, S * 0.62 ); g.fillText( 'CTG 5.56MM', S * 0.5, S * 0.76 );
	} );
	// hand-painted farm signs on plywood
	const ply = ( g, S ) => {
		g.fillStyle = '#c9a77a'; g.fillRect( 0, 0, S, S );
		const r = prng( 17 );
		for ( let i = 0; i < 40; i ++ ) { g.strokeStyle = `rgba(120,85,50,${0.15 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; const y = r() * S; g.beginPath(); g.moveTo( 0, y ); g.bezierCurveTo( S * 0.3, y + 6, S * 0.6, y - 6, S, y + 3 ); g.stroke(); }
	};
	cell( 8, ( g, S ) => { ply( g, S ); g.fillStyle = '#b8261d'; g.font = font( 'bold', 54, IMPACT ); g.textAlign = 'center'; g.fillText( 'FRESH', S * 0.5, S * 0.42 ); g.fillStyle = '#2e6b2a'; g.fillText( 'FRUIT', S * 0.5, S * 0.75 ); } );
	cell( 9, ( g, S ) => { ply( g, S ); g.fillStyle = '#2e5a2a'; g.font = font( 'bold', 40, IMPACT ); g.textAlign = 'center'; g.fillText( 'PAPAYA $1', S * 0.5, S * 0.36 ); g.fillStyle = '#b8261d'; g.fillText( 'BANANAS', S * 0.5, S * 0.62 ); g.fillStyle = '#1f2f6a'; g.font = font( 'bold', 28, IMPACT ); g.fillText( 'MAHALO', S * 0.5, S * 0.86 ); } );
	// bus stop sign
	cell( 10, ( g, S ) => {
		g.fillStyle = '#f2f2ee'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#1f5fa8'; g.fillRect( 10, 10, S - 20, S * 0.5 );
		g.fillStyle = '#f2f2ee'; g.font = font( 'bold', 72 ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'BUS', S * 0.5, S * 0.29 );
		g.fillStyle = '#1f5fa8'; g.font = font( 'bold', 30 ); g.fillText( 'STOP', S * 0.5, S * 0.68 ); g.font = font( 'bold', 20 ); g.fillText( 'TheBus  52  55', S * 0.5, S * 0.84 );
	} );
	// woodland camouflage
	const camo = ( g, S ) => {
		g.fillStyle = '#5f6440'; g.fillRect( 0, 0, S, S );
		const r = prng( 21 );
		for ( const [ col, n ] of [ [ '#3e4a2a', 26 ], [ '#7b6a45', 18 ], [ '#23261a', 14 ] ] ) {
			g.fillStyle = col;
			for ( let i = 0; i < n; i ++ ) { const x = r() * S, y = r() * S; g.beginPath(); g.moveTo( x, y ); for ( let k = 0; k < 7; k ++ ) { const a = k / 7 * PI * 2; const rr = 14 + r() * 26; g.lineTo( x + Math.cos( a ) * rr * 1.6, y + Math.sin( a ) * rr ); } g.closePath(); g.fill(); }
		}
	};
	cell( 11, camo );
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
		g.fillStyle = '#1f5fa8'; g.font = font( 'bold', 18 ); g.fillText( 'EMERGENCY DRINKING WATER', S * 0.5, S * 0.84 ); g.fillText( '24 x 500 mL', S * 0.5, S * 0.16 );
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
		// plank joints
		g.fillStyle = 'rgba(60,40,22,0.55)'; for ( const y of [ 0.25, 0.5, 0.75 ] ) g.fillRect( 0, S * y - 1, S, 2 );
		g.fillStyle = 'rgba(30,30,30,0.85)'; g.font = font( 'bold', 40, STEN ); g.textAlign = 'center';
		g.fillText( 'RELIEF', S * 0.5, S * 0.38 ); g.font = font( 'bold', 24, STEN ); g.fillText( 'AIRDROP', S * 0.5, S * 0.56 ); g.fillText( 'THIS SIDE UP', S * 0.5, S * 0.74 );
		g.fillStyle = '#c0281e'; g.beginPath(); g.moveTo( S * 0.5, S * 0.8 ); g.lineTo( S * 0.56, S * 0.92 ); g.lineTo( S * 0.44, S * 0.92 ); g.closePath(); g.fill();
	} );
	// a cooler's printed band and badge (white parts take the cooler's colour)
	cell( 16, ( g, S ) => {
		g.fillStyle = '#ffffff'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#e8e8e4'; g.fillRect( 0, S * 0.3, S, S * 0.4 );
		g.fillStyle = '#1a1a1a'; g.beginPath(); g.roundRect?.( S * 0.2, S * 0.36, S * 0.6, S * 0.28, 12 ); g.fill();
		g.fillStyle = '#f2f2f2'; g.font = font( 'bold', 44, IMPACT ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'ISLAND', S * 0.5, S * 0.45 );
		g.font = font( 'bold', 16 ); g.fillText( 'COOLER  48 QT', S * 0.5, S * 0.58 );
	} );
	// fringe: a hem and tassels, cut out (white: takes the canopy's colour)
	cell( 17, ( g, S ) => {
		g.clearRect( 0, 0, S, S );
		g.fillStyle = '#ffffff'; g.fillRect( 0, 0, S, S * 0.34 );
		g.fillStyle = '#d6d6d6'; g.fillRect( 0, S * 0.3, S, S * 0.04 );
		for ( let x = 0; x < S; x += 16 ) {
			// a scallop with a tassel hanging from its point
			g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo( x, S * 0.33 ); g.quadraticCurveTo( x + 8, S * 0.62, x + 16, S * 0.33 ); g.fill();
			g.fillStyle = '#ececec'; g.fillRect( x + 7, S * 0.45, 2.5, S * 0.47 );
			g.beginPath(); g.ellipse( x + 8.2, S * 0.93, 3.5, 6, 0, 0, PI * 2 ); g.fill();
		}
	} );
	// HESCO: geotextile behind welded wire, a dirt line at the foot
	cell( 18, ( g, S ) => {
		g.fillStyle = '#b5a37c'; g.fillRect( 0, 0, S, S );
		const r = prng( 29 );
		for ( let i = 0; i < 400; i ++ ) { g.fillStyle = `rgba(${90 + r() * 40},${80 + r() * 30},${55 + r() * 20},${r() * 0.15})`; g.fillRect( r() * S, r() * S, 1 + r() * 3, 4 + r() * 18 ); }
		const gr = g.createLinearGradient( 0, S * 0.7, 0, S ); gr.addColorStop( 0, 'rgba(70,55,35,0)' ); gr.addColorStop( 1, 'rgba(70,55,35,0.55)' );
		g.fillStyle = gr; g.fillRect( 0, 0, S, S );
		// the fabric puckers around each weld
		const n = 11, st = S / n;
		for ( let i = 0; i <= n; i ++ ) for ( let j = 0; j <= n; j ++ ) { g.fillStyle = 'rgba(60,50,35,0.25)'; g.beginPath(); g.arc( i * st, j * st, 5, 0, PI * 2 ); g.fill(); }
		g.strokeStyle = 'rgba(40,40,38,0.45)'; g.lineWidth = 5;
		for ( let i = 0; i <= n; i ++ ) { g.beginPath(); g.moveTo( i * st + 2, 0 ); g.lineTo( i * st + 2, S ); g.stroke(); g.beginPath(); g.moveTo( 0, i * st + 2 ); g.lineTo( S, i * st + 2 ); g.stroke(); }
		g.strokeStyle = '#9a9b95'; g.lineWidth = 3;
		for ( let i = 0; i <= n; i ++ ) { g.beginPath(); g.moveTo( i * st, 0 ); g.lineTo( i * st, S ); g.stroke(); g.beginPath(); g.moveTo( 0, i * st ); g.lineTo( S, i * st ); g.stroke(); }
	} );
	// camouflage netting: the garnish cut into tongues, holes through
	cell( 19, ( g, S ) => {
		camo( g, S );
		const r = prng( 31 );
		g.globalCompositeOperation = 'destination-out';
		for ( let i = 0; i < 70; i ++ ) {
			const x = r() * S, y = r() * S, w = 5 + r() * 9, h = 9 + r() * 16, a = r() * PI;
			g.save(); g.translate( x, y ); g.rotate( a ); g.beginPath(); g.moveTo( 0, - h ); g.lineTo( w, 0 ); g.lineTo( 0, h ); g.lineTo( - w, 0 ); g.closePath(); g.fill(); g.restore();
			for ( const ox of [ - S, S ] ) { g.save(); g.translate( x + ox, y ); g.rotate( a ); g.beginPath(); g.moveTo( 0, - h ); g.lineTo( w, 0 ); g.lineTo( 0, h ); g.lineTo( - w, 0 ); g.closePath(); g.fill(); g.restore(); }
		}
		g.globalCompositeOperation = 'source-over';
	} );
	// MRE case
	cell( 20, ( g, S ) => {
		g.fillStyle = '#b39a6c'; g.fillRect( 0, 0, S, S );
		g.fillStyle = 'rgba(40,30,20,0.9)'; g.font = font( 'bold', 24, STEN ); g.textAlign = 'center';
		g.fillText( 'MEAL, READY-TO-EAT', S * 0.5, S * 0.3 ); g.fillText( 'INDIVIDUAL', S * 0.5, S * 0.42 );
		g.font = font( 'bold', 18, STEN ); g.fillText( '12 MEALS  MENUS 1-12', S * 0.5, S * 0.58 ); g.fillText( 'NSN 8970-00-149-1094', S * 0.5, S * 0.7 );
		g.fillStyle = 'rgba(200,190,160,0.6)'; g.fillRect( S * 0.45, 0, S * 0.1, S );
	} );
	// ammunition crate end: plank lines, stencil, a lot number
	cell( 21, ( g, S ) => {
		g.fillStyle = '#4f5530'; g.fillRect( 0, 0, S, S );
		const r = prng( 37 );
		for ( let i = 0; i < 26; i ++ ) { g.strokeStyle = `rgba(30,32,18,${0.2 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; const y = r() * S; g.beginPath(); g.moveTo( 0, y ); g.lineTo( S, y + ( r() - 0.5 ) * 6 ); g.stroke(); }
		g.fillStyle = 'rgba(20,22,12,0.7)'; for ( const y of [ 0.33, 0.66 ] ) g.fillRect( 0, S * y - 1.5, S, 3 );
		g.fillStyle = 'rgba(236,224,170,0.9)'; g.font = font( 'bold', 26, STEN ); g.textAlign = 'center';
		g.fillText( 'CARTRIDGES', S * 0.5, S * 0.2 ); g.fillText( '5.56 MM BALL M855', S * 0.5, S * 0.4 );
		g.font = font( 'bold', 20, STEN ); g.fillText( '1680 ROUNDS', S * 0.5, S * 0.58 ); g.fillText( 'LOT LC-21E229-031', S * 0.5, S * 0.76 );
		g.fillStyle = '#c9a43a'; g.fillRect( S * 0.1, S * 0.86, S * 0.8, S * 0.05 );
	} );
	// first aid: a red cross on white canvas
	cell( 22, ( g, S ) => {
		g.fillStyle = '#efeee8'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#c3222a'; g.fillRect( S * 0.38, S * 0.14, S * 0.24, S * 0.56 ); g.fillRect( S * 0.22, S * 0.3, S * 0.56, S * 0.24 );
		g.font = font( 'bold', 34 ); g.textAlign = 'center'; g.fillText( 'FIRST AID', S * 0.5, S * 0.88 );
	} );
	// a drink can's wrap (white takes the can's colour; u around the can)
	cell( 23, ( g, S ) => {
		g.fillStyle = '#ffffff'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#2a2a2a'; g.beginPath(); g.moveTo( 0, S * 0.42 ); for ( let x = 0; x <= S; x += 8 ) g.lineTo( x, S * 0.42 + Math.sin( x / S * PI * 4 ) * 14 ); g.lineTo( S, S * 0.62 ); g.lineTo( 0, S * 0.62 ); g.fill();
		g.fillStyle = '#f4f4f4'; g.font = font( 'bold', 36, IMPACT ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'COLA', S * 0.25, S * 0.53 ); g.fillText( 'COLA', S * 0.75, S * 0.53 );
		g.fillStyle = '#bdbdbd'; g.fillRect( 0, 0, S, S * 0.06 ); g.fillRect( 0, S * 0.94, S, S * 0.06 );
	} );
	// a farm stand's chalkboard
	cell( 24, ( g, S ) => {
		g.fillStyle = '#6b4a2c'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#23292a'; g.fillRect( 12, 12, S - 24, S - 24 );
		const r = prng( 41 );
		for ( let i = 0; i < 30; i ++ ) { g.fillStyle = `rgba(200,200,200,${r() * 0.05})`; g.fillRect( 12 + r() * ( S - 40 ), 12 + r() * ( S - 40 ), 20 + r() * 40, 6 + r() * 10 ); }
		g.textAlign = 'left'; g.font = font( 'bold', 22, 'Comic Sans MS, Chalkboard, cursive' );
		const rows = [ [ 'AVOCADO', '3/$5', '#e8e6d8' ], [ 'APPLE BANANA', '$1/lb', '#f2e27a' ], [ 'LILIKOI', '$4', '#e8e6d8' ], [ 'MANGO', '$2 ea', '#f2a86a' ], [ 'PAPAYA', '$1', '#e8e6d8' ], [ 'EGGS', '$6 dz', '#9ad0f2' ] ];
		rows.forEach( ( [ a, b, col ], i ) => { g.fillStyle = col; g.fillText( a, 24, 46 + i * 34 ); g.textAlign = 'right'; g.fillText( b, S - 24, 46 + i * 34 ); g.textAlign = 'left'; } );
	} );
	// a cardboard carton: kraft board, packing tape, arrows
	cell( 25, ( g, S ) => {
		g.fillStyle = '#b48a58'; g.fillRect( 0, 0, S, S );
		const r = prng( 43 );
		for ( let i = 0; i < 60; i ++ ) { g.fillStyle = `rgba(90,60,30,${r() * 0.12})`; g.fillRect( 0, r() * S, S, 1 ); }
		g.fillStyle = 'rgba(210,190,150,0.55)'; g.fillRect( 0, S * 0.44, S, S * 0.12 );
		g.fillStyle = 'rgba(40,30,20,0.75)'; g.font = font( 'bold', 20 ); g.textAlign = 'center';
		for ( const x of [ 0.2, 0.8 ] ) { g.beginPath(); g.moveTo( S * x, S * 0.12 ); g.lineTo( S * x + 12, S * 0.24 ); g.lineTo( S * x - 12, S * 0.24 ); g.fill(); g.fillRect( S * x - 4, S * 0.24, 8, 16 ); }
		g.fillText( 'THIS SIDE UP', S * 0.5, S * 0.22 ); g.font = font( 'bold', 16 ); g.fillText( 'KEEP DRY', S * 0.5, S * 0.8 );
	} );
	// a military post's warning sign
	cell( 26, ( g, S ) => {
		g.fillStyle = '#f2f1ec'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#b3171d'; g.fillRect( 0, 0, S, S * 0.3 );
		g.fillStyle = '#ffffff'; g.font = font( 'bold', 34 ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'WARNING', S * 0.5, S * 0.15 );
		g.fillStyle = '#111'; g.font = font( 'bold', 28 ); g.fillText( 'RESTRICTED', S * 0.5, S * 0.42 ); g.fillText( 'AREA', S * 0.5, S * 0.55 );
		g.font = font( 'bold', 17 ); g.fillText( 'KEEP OUT', S * 0.5, S * 0.72 ); g.fillText( 'USE OF DEADLY FORCE', S * 0.5, S * 0.83 ); g.fillText( 'AUTHORIZED', S * 0.5, S * 0.92 );
		g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect( 3, 3, S - 6, S - 6 );
	} );
	// missing-person flyers taped up, overlapping
	cell( 27, ( g, S ) => {
		g.fillStyle = '#3a3c3a'; g.fillRect( 0, 0, S, S );
		const r = prng( 47 );
		for ( let i = 0; i < 5; i ++ ) {
			g.save(); g.translate( 50 + ( i % 3 ) * 78 + r() * 10, 64 + Math.floor( i / 3 ) * 120 + r() * 10 ); g.rotate( ( r() - 0.5 ) * 0.25 );
			g.fillStyle = i === 2 ? '#f1e68a' : '#f4f2ea'; g.fillRect( - 38, - 54, 76, 104 );
			g.fillStyle = '#b3171d'; g.font = font( 'bold', 15 ); g.textAlign = 'center'; g.fillText( i === 4 ? 'HAVE YOU' : 'MISSING', 0, - 38 );
			g.fillStyle = `rgb(${110 + r() * 60},${100 + r() * 50},${90 + r() * 40})`; g.fillRect( - 22, - 32, 44, 44 );
			g.fillStyle = 'rgba(60,40,30,0.6)'; g.beginPath(); g.arc( 0, - 16, 11, 0, PI * 2 ); g.fill(); g.fillRect( - 16, - 4, 32, 16 );
			g.fillStyle = '#333'; for ( let l = 0; l < 4; l ++ ) g.fillRect( - 30, 20 + l * 7, 30 + r() * 30, 2 );
			g.fillStyle = 'rgba(220,220,200,0.6)'; g.fillRect( - 10, - 58, 20, 8 );
			g.restore();
		}
	} );
	// the flag
	cell( 28, ( g, S ) => {
		for ( let i = 0; i < 13; i ++ ) { g.fillStyle = i % 2 ? '#f0eee6' : '#b3222c'; g.fillRect( 0, i * S / 13, S, S / 13 + 1 ); }
		g.fillStyle = '#2a356e'; g.fillRect( 0, 0, S * 0.42, S * 7 / 13 );
		g.fillStyle = '#f0eee6';
		for ( let j = 0; j < 9; j ++ ) for ( let i = 0; i < ( j % 2 ? 5 : 6 ); i ++ ) { g.beginPath(); g.arc( S * 0.035 + i * S * 0.07 + ( j % 2 ? S * 0.035 : 0 ), S * 0.03 + j * S * 0.054, 2.6, 0, PI * 2 ); g.fill(); }
	} );
	// a manila toe tag
	cell( 29, ( g, S ) => {
		g.fillStyle = '#e2cf98'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#7a6a40'; g.beginPath(); g.arc( S * 0.15, S * 0.5, 14, 0, PI * 2 ); g.fill();
		g.fillStyle = '#333'; for ( let l = 0; l < 5; l ++ ) g.fillRect( S * 0.3, S * 0.22 + l * S * 0.14, S * 0.6, 3 );
		g.fillStyle = '#1d2a55'; g.font = font( 'bold', 22, 'Comic Sans MS, cursive' ); g.fillText( 'UNKNOWN', S * 0.32, S * 0.33 );
	} );
	// an ammo can's side: olive drab, yellow stencil
	cell( 30, ( g, S ) => {
		g.fillStyle = '#4c5232'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#d9c043'; g.font = font( 'bold', 26, STEN ); g.textAlign = 'center';
		g.fillText( '840', S * 0.5, S * 0.22 ); g.fillText( 'CTG 5.56MM', S * 0.5, S * 0.42 ); g.fillText( 'M855', S * 0.5, S * 0.58 );
		g.font = font( 'bold', 18, STEN ); g.fillText( '10 RD CLIPS', S * 0.5, S * 0.74 ); g.fillText( 'BANDOLEER', S * 0.5, S * 0.86 );
	} );
	// helicopter livery: the service name and a tail number on low-visibility grey-green
	cell( 31, ( g, S ) => {
		g.fillStyle = '#525a48'; g.fillRect( 0, 0, S, S );
		const r = prng( 53 );
		for ( let i = 0; i < 160; i ++ ) { g.fillStyle = `rgba(30,30,25,${r() * 0.1})`; g.fillRect( r() * S, r() * S, 4 + r() * 20, 1 + r() * 2 ); }
		g.fillStyle = 'rgba(25,26,24,0.85)'; g.font = font( 'bold', 50, STEN ); g.textAlign = 'center'; g.fillText( 'MARINES', S * 0.5, S * 0.45 );
		g.font = font( 'bold', 34, STEN ); g.fillText( '168791', S * 0.5, S * 0.7 );
		g.fillStyle = 'rgba(25,26,24,0.85)'; g.fillRect( S * 0.1, S * 0.82, S * 0.8, 4 );
	} );
	// soot and scorch blown over a hull: black blotches, cut out
	cell( 32, ( g, S ) => {
		g.clearRect( 0, 0, S, S );
		const r = prng( 59 );
		for ( let i = 0; i < 26; i ++ ) {
			const x = S * ( 0.15 + r() * 0.7 ), y = S * ( 0.15 + r() * 0.7 ), rad = 14 + r() * 40;
			const gr = g.createRadialGradient( x, y, 0, x, y, rad );
			gr.addColorStop( 0, 'rgba(12,10,9,1)' ); gr.addColorStop( 0.55, 'rgba(18,15,13,0.9)' ); gr.addColorStop( 1, 'rgba(25,22,20,0)' );
			g.fillStyle = gr; g.beginPath(); g.arc( x, y, rad, 0, PI * 2 ); g.fill();
		}
		// streaks blown back by the rotor wash
		for ( let i = 0; i < 30; i ++ ) { g.fillStyle = `rgba(14,12,10,${0.4 + r() * 0.5})`; g.fillRect( S * r(), S * ( 0.2 + r() * 0.6 ), 20 + r() * 60, 2 + r() * 5 ); }
	} );
	// helicopter markings: RESCUE arrow, NO STEP, a hazard stripe
	cell( 33, ( g, S ) => {
		g.fillStyle = '#4e5546'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#c9a43a'; g.beginPath(); g.moveTo( S * 0.1, S * 0.18 ); g.lineTo( S * 0.62, S * 0.18 ); g.lineTo( S * 0.62, S * 0.1 ); g.lineTo( S * 0.86, S * 0.27 ); g.lineTo( S * 0.62, S * 0.44 ); g.lineTo( S * 0.62, S * 0.36 ); g.lineTo( S * 0.1, S * 0.36 ); g.closePath(); g.fill();
		g.fillStyle = '#1b1b1b'; g.font = font( 'bold', 26 ); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText( 'RESCUE', S * 0.14, S * 0.27 );
		g.fillStyle = 'rgba(20,20,20,0.85)'; g.font = font( 'bold', 22, STEN ); g.textAlign = 'center'; g.fillText( 'NO STEP', S * 0.5, S * 0.58 );
		for ( let x = - 40; x < S; x += 28 ) { g.fillStyle = '#c9a43a'; g.beginPath(); g.moveTo( x, S * 0.92 ); g.lineTo( x + 14, S * 0.92 ); g.lineTo( x + 30, S * 0.76 ); g.lineTo( x + 16, S * 0.76 ); g.fill(); }
		g.fillStyle = '#1b1b1b'; g.globalCompositeOperation = 'destination-over'; g.fillRect( 0, S * 0.76, S, S * 0.16 ); g.globalCompositeOperation = 'source-over';
	} );
	// gingham tablecloth
	cell( 34, ( g, S ) => {
		g.fillStyle = '#f2efe8'; g.fillRect( 0, 0, S, S );
		g.fillStyle = 'rgba(190,36,40,0.55)';
		for ( let i = 0; i < S; i += 32 ) { g.fillRect( i, 0, 16, S ); g.fillRect( 0, i, S, 16 ); }
	} );
	// deck-chair canvas: wide stripes along u
	cell( 35, ( g, S ) => {
		const cols = [ '#2a5aa8', '#f2efe6', '#2a5aa8', '#f2efe6', '#e2a23a', '#f2efe6' ];
		for ( let i = 0; i < 12; i ++ ) { g.fillStyle = cols[ i % 6 ]; g.fillRect( 0, i * S / 12, S, S / 12 + 1 ); }
	} );
	// a cardboard sign, hand lettered
	cell( 36, ( g, S ) => {
		g.fillStyle = '#b48a58'; g.fillRect( 0, 0, S, S );
		const r = prng( 61 );
		for ( let i = 0; i < 50; i ++ ) { g.fillStyle = `rgba(90,60,30,${r() * 0.12})`; g.fillRect( 0, r() * S, S, 1 ); }
		g.fillStyle = '#16161a'; g.textAlign = 'center'; g.textBaseline = 'middle';
		g.font = font( 'bold', 70, 'Comic Sans MS, Marker Felt, cursive' ); g.fillText( 'HELP', S * 0.5, S * 0.36 );
		g.font = font( 'bold', 30, 'Comic Sans MS, Marker Felt, cursive' ); g.fillText( 'NEED WATER', S * 0.5, S * 0.64 ); g.fillText( 'KIDS INSIDE', S * 0.5, S * 0.82 );
	} );
	// a newspaper page
	cell( 37, ( g, S ) => {
		g.fillStyle = '#e8e4d8'; g.fillRect( 0, 0, S, S );
		g.fillStyle = '#1a1a1a'; g.font = font( 'bold', 22, 'Times New Roman, serif' ); g.textAlign = 'center'; g.fillText( 'The Island Star', S * 0.5, S * 0.1 );
		g.fillRect( S * 0.06, S * 0.13, S * 0.88, 2 );
		g.font = font( 'bold', 30, 'Times New Roman, serif' ); g.fillText( 'OUTBREAK', S * 0.5, S * 0.25 ); g.font = font( 'bold', 18, 'Times New Roman, serif' ); g.fillText( 'STAY INDOORS, OFFICIALS SAY', S * 0.5, S * 0.33 );
		g.fillStyle = '#7a7a76'; g.fillRect( S * 0.06, S * 0.38, S * 0.4, S * 0.26 );
		g.fillStyle = 'rgba(30,30,30,0.6)';
		for ( let y = 0.4; y < 0.94; y += 0.03 ) { g.fillRect( S * 0.5, S * y, S * 0.44, 2 ); if ( y > 0.66 ) g.fillRect( S * 0.06, S * y, S * 0.4, 2 ); }
	} );
	// a Hawaii plate: the rainbow arc over white
	cell( 38, ( g, S ) => {
		g.fillStyle = '#f4f2ec'; g.fillRect( 0, 0, S, S );
		const cols = [ '#d8382e', '#f08a24', '#f2cf2a', '#4aa84e', '#2f7ec2', '#7a4fb0' ];
		cols.forEach( ( c, i ) => { g.strokeStyle = c; g.lineWidth = 6; g.beginPath(); g.arc( S * 0.5, S * 1.1, S * ( 0.75 - i * 0.025 ), PI * 1.15, PI * 1.85 ); g.stroke(); } );
		g.fillStyle = '#16161a'; g.font = font( 'bold', 64 ); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( 'KPD 214', S * 0.5, S * 0.62 );
		g.font = font( 'bold', 20 ); g.fillText( 'HAWAII', S * 0.5, S * 0.2 ); g.fillText( 'ALOHA STATE', S * 0.5, S * 0.88 );
	} );
	// plain: light grey with scratches (a double-sided sheet that takes its part's colour)
	cell( 39, ( g, S ) => {
		g.fillStyle = '#e6e6e2'; g.fillRect( 0, 0, S, S );
		const r = prng( 67 );
		for ( let i = 0; i < 80; i ++ ) { g.strokeStyle = `rgba(${150 + r() * 80},${150 + r() * 80},${150 + r() * 80},0.4)`; g.lineWidth = 0.5 + r(); g.beginPath(); const x = r() * S, y = r() * S; g.moveTo( x, y ); g.lineTo( x + ( r() - 0.5 ) * 40, y + ( r() - 0.5 ) * 40 ); g.stroke(); }
		for ( let i = 0; i < 30; i ++ ) { g.fillStyle = `rgba(170,166,160,${r() * 0.25})`; g.beginPath(); g.arc( r() * S, r() * S, 4 + r() * 16, 0, PI * 2 ); g.fill(); }
	} );
	return texOf( c, { repeat: false } );
}

// ---- ground decals: 4 x 4 cells of 256 px with alpha ------------------------------------------------------------------

export const DECALS = { blood_pool: 0, blood_drag: 1, ash: 2, scorch: 3, soil: 4, oil: 5, papers: 6, glass: 7, skid: 8, hole: 9,
	brass: 10, litter: 11, trampled: 12, char: 13, boots: 14, twigs: 15 };

function decalAtlas() {
	const S = 256, c = canvas( S * 4, S * 4 ), g = c.getContext( '2d' );
	const cell = ( i, fn ) => { g.save(); g.translate( ( i % 4 ) * S, Math.floor( i / 4 ) * S ); g.beginPath(); g.rect( 0, 0, S, S ); g.clip(); g.scale( S / 128, S / 128 ); fn( g, 128, prng( 31 + i * 7 ) ); g.restore(); };
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
			// a muddy footprint or a fold across some
			if ( r() < 0.4 ) { g.fillStyle = 'rgba(80,70,55,0.3)'; g.fillRect( - w / 2, - 1, w, 2 ); }
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
	// spent brass: casings flung in a fan, a few darker (fired a while ago), the odd link
	cell( 10, ( g, S, r ) => {
		for ( let i = 0; i < 46; i ++ ) {
			const a = ( r() - 0.5 ) * 2.2, d = S * ( 0.05 + r() * 0.42 );
			g.save(); g.translate( S / 2 + Math.cos( a ) * d, S / 2 + Math.sin( a ) * d ); g.rotate( r() * PI );
			const v = r() < 0.2 ? 0.6 : 1;
			g.fillStyle = `rgba(${Math.round( 196 * v )},${Math.round( 150 * v )},${Math.round( 62 * v )},1)`; g.fillRect( - 2.2, - 0.7, 4.4, 1.5 );
			g.fillStyle = 'rgba(255,236,170,0.9)'; g.fillRect( - 2, - 0.6, 3.6, 0.5 );
			g.fillStyle = 'rgba(40,30,15,0.5)'; g.fillRect( - 2.2, 0.8, 4.4, 0.5 );
			g.restore();
		}
	} );
	// litter: wrappers, butts, bottle caps, a receipt
	cell( 11, ( g, S, r ) => {
		const cols = [ '#c8322a', '#2a62b0', '#e8c22a', '#f2f2ee', '#3a8a4a', '#f08a24' ];
		for ( let i = 0; i < 16; i ++ ) {
			g.save(); g.translate( S * ( 0.1 + r() * 0.8 ), S * ( 0.1 + r() * 0.8 ) ); g.rotate( r() * PI );
			const k = r();
			if ( k < 0.35 ) { g.fillStyle = cols[ Math.floor( r() * cols.length ) ]; g.beginPath(); g.moveTo( - 6, - 3 ); g.lineTo( 5, - 4 ); g.lineTo( 7, 2 ); g.lineTo( - 4, 4 ); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect( - 3, - 1, 5, 1 ); }
			else if ( k < 0.65 ) { g.fillStyle = '#ece6d6'; g.fillRect( - 3, - 0.8, 4.5, 1.6 ); g.fillStyle = '#c88a3a'; g.fillRect( 1.5, - 0.8, 1.6, 1.6 ); }
			else if ( k < 0.85 ) { g.fillStyle = r() < 0.5 ? '#b8b8b4' : '#c8322a'; g.beginPath(); g.arc( 0, 0, 1.6, 0, PI * 2 ); g.fill(); }
			else { g.fillStyle = '#f4f2ec'; g.fillRect( - 3, - 7, 6, 14 ); g.fillStyle = 'rgba(60,60,60,0.5)'; for ( let y = - 5; y < 6; y += 2 ) g.fillRect( - 2, y, 4, 0.6 ); }
			g.restore();
		}
	} );
	// trampled ground: worn, dusty, the grass flattened and bare in places
	cell( 12, ( g, S, r ) => {
		blob( g, S / 2, S / 2, S * 0.48, ( a ) => `rgba(112,96,70,${a})`, 0.5 );
		for ( let i = 0; i < 40; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.7, S / 2 + ( r() - 0.5 ) * S * 0.7, S * ( 0.04 + r() * 0.1 ), ( a ) => `rgba(${96 + r() * 30},${82 + r() * 24},${58 + r() * 18},${a})`, 0.35 );
		for ( let i = 0; i < 60; i ++ ) { g.fillStyle = `rgba(70,58,40,${0.15 + r() * 0.2})`; g.fillRect( S / 2 + ( r() - 0.5 ) * S * 0.7, S / 2 + ( r() - 0.5 ) * S * 0.7, 1, 1 ); }
	} );
	// a fire's scar: charcoal and white ash in a burnt ring
	cell( 13, ( g, S, r ) => {
		blob( g, S / 2, S / 2, S * 0.49, ( a ) => `rgba(30,24,20,${a})`, 0.75 );
		blob( g, S / 2, S / 2, S * 0.3, ( a ) => `rgba(14,12,10,${a})`, 0.95, 0.8 );
		for ( let i = 0; i < 70; i ++ ) blob( g, S / 2 + ( r() - 0.5 ) * S * 0.45, S / 2 + ( r() - 0.5 ) * S * 0.45, 1 + r() * 3.5, ( a ) => `rgba(${150 + r() * 70},${146 + r() * 66},${140 + r() * 60},${a})`, 0.7 );
		for ( let i = 0; i < 40; i ++ ) { g.fillStyle = 'rgba(5,4,3,0.85)'; const x = S / 2 + ( r() - 0.5 ) * S * 0.55, y = S / 2 + ( r() - 0.5 ) * S * 0.55; g.fillRect( x, y, 1 + r() * 3, 1 + r() * 2 ); }
	} );
	// boot prints: a few walks crossing
	cell( 14, ( g, S, r ) => {
		for ( let w = 0; w < 3; w ++ ) {
			const a = r() * PI * 2, cx = S / 2 + ( r() - 0.5 ) * 30, cy = S / 2 + ( r() - 0.5 ) * 30;
			for ( let i = - 4; i <= 4; i ++ ) {
				const x = cx + Math.cos( a ) * i * 12 + Math.cos( a + PI / 2 ) * ( i % 2 ? 3 : - 3 ), y = cy + Math.sin( a ) * i * 12 + Math.sin( a + PI / 2 ) * ( i % 2 ? 3 : - 3 );
				g.save(); g.translate( x, y ); g.rotate( a + PI / 2 );
				g.fillStyle = 'rgba(52,42,30,0.45)'; g.beginPath(); g.ellipse( 0, - 2, 2.2, 3, 0, 0, PI * 2 ); g.fill(); g.beginPath(); g.ellipse( 0, 3.2, 1.8, 1.8, 0, 0, PI * 2 ); g.fill();
				g.restore();
			}
		}
	} );
	// twigs, leaves and grit
	cell( 15, ( g, S, r ) => {
		for ( let i = 0; i < 26; i ++ ) { g.save(); g.translate( S * ( 0.1 + r() * 0.8 ), S * ( 0.1 + r() * 0.8 ) ); g.rotate( r() * PI ); g.fillStyle = `rgba(${70 + r() * 40},${52 + r() * 30},${30 + r() * 20},0.9)`; g.fillRect( - 6 - r() * 6, - 0.6, 12 + r() * 10, 1.2 ); g.restore(); }
		for ( let i = 0; i < 30; i ++ ) { g.save(); g.translate( S * ( 0.1 + r() * 0.8 ), S * ( 0.1 + r() * 0.8 ) ); g.rotate( r() * PI ); g.fillStyle = `rgba(${110 + r() * 50},${90 + r() * 40},${40 + r() * 20},0.85)`; g.beginPath(); g.ellipse( 0, 0, 3, 1.4, 0, 0, PI * 2 ); g.fill(); g.restore(); }
		for ( let i = 0; i < 80; i ++ ) { g.fillStyle = `rgba(${90 + r() * 60},${85 + r() * 50},${75 + r() * 40},0.7)`; g.fillRect( S * r(), S * r(), 1, 1 ); }
	} );
	return texOf( c, { repeat: false } );
}

// ---- materials -------------------------------------------------------------------------------------------------------

let MATS = null;
export function siteMaterials() {
	if ( MATS ) return MATS;
	const grunge = grungeTex(), weave = weaveTex(), weaveN = weaveNormalTex(), wood = woodTex(), atlas = printAtlas(), decals = decalAtlas();
	const std = ( key, o ) => patchMaterial( new THREE.MeshStandardMaterial( { color: 0xffffff, vertexColors: true, ...o } ), 'site-' + key );
	MATS = {
		matte: std( 'matte', { roughness: 0.9, map: grunge } ),
		plastic: std( 'plastic', { roughness: 0.45, map: grunge } ),
		metal: std( 'metal', { roughness: 0.48, metalness: 0.7, map: grunge } ),
		paint: std( 'paint', { roughness: 0.36, map: grunge } ),
		cloth: std( 'cloth', { roughness: 0.96, map: weave, normalMap: weaveN, normalScale: new THREE.Vector2( 0.55, 0.55 ), side: THREE.DoubleSide } ),
		wood: std( 'wood', { roughness: 0.86, map: wood } ),
		// alpha-tested: the camo net's cut-outs and an umbrella's fringe (every other cell is opaque)
		print: std( 'print', { roughness: 0.82, map: atlas, side: THREE.DoubleSide, alphaTest: 0.5 } ),
		film: patchMaterial( new THREE.MeshStandardMaterial( { color: 0xffffff, vertexColors: true, roughness: 0.16, transparent: true, opacity: 0.42, depthWrite: false } ), 'site-film', null, { noWet: true } ),
		glow: patchMaterial( new THREE.MeshStandardMaterial( { color: 0x101010, emissive: 0xff5418, emissiveIntensity: 4, roughness: 1 } ), 'site-glow' ),
		decal: patchMaterial( new THREE.MeshStandardMaterial( {
			color: 0xffffff, map: decals, roughness: 0.85, transparent: true, depthWrite: false, alphaTest: 0.02,
			polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 4,
		} ), 'site-decal', null, { noWet: true } ),
	};
	// UV handling per material: box-projected tiles (metres per repeat), the atlas, or none
	MATS.matte.userData.uv = { box: 1.6 }; MATS.plastic.userData.uv = { box: 1.2 }; MATS.metal.userData.uv = { box: 1.4 }; MATS.paint.userData.uv = { box: 1.6 };
	MATS.cloth.userData.uv = { box: 0.5 }; MATS.wood.userData.uv = { grain: 1.1 }; MATS.print.userData.uv = { atlas: ATLAS };
	MATS.decal.userData.uv = { atlas: [ 4, 4 ] }; MATS.glow.userData.uv = null; MATS.film.userData.uv = null;
	MATS.decal.userData.noShadow = true; MATS.glow.userData.noShadow = true; MATS.film.userData.noShadow = true;
	MATS.film.renderOrder = 3;
	return MATS;
}

// ---- geometry helpers ----------------------------------------------------------------------------------------------------

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _v = new THREE.Vector3(), _nm = new THREE.Matrix3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

// an indexed grid of ( nu + 1 ) x ( nv + 1 ) vertices from at( u, v, out ) -> [ x, y, z ]; uv ( u, v )
function grid( nu, nv, at ) {
	const pos = [], uv = [], idx = [];
	for ( let j = 0; j <= nv; j ++ ) for ( let i = 0; i <= nu; i ++ ) { const u = i / nu, v = j / nv; pos.push( ...at( u, v ) ); uv.push( u, v ); }
	for ( let j = 0; j < nv; j ++ ) for ( let i = 0; i < nu; i ++ ) {
		const a = j * ( nu + 1 ) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
		idx.push( a, b, c, a, c, d );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;
}

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
	grid,
	// a cloth panel over the quad a, b, c, d (counter-clockwise from the front; d = c makes a triangle), nu x nv
	// cells, pushed along its normal by disp( u, v ) metres (negative: sagging in); uv ( u, v ) over the panel
	quad( a, b, c, d, nu = 4, nv = 4, disp = null ) {
		_a.set( c[ 0 ] - a[ 0 ], c[ 1 ] - a[ 1 ], c[ 2 ] - a[ 2 ] ); _b.set( d[ 0 ] - b[ 0 ], d[ 1 ] - b[ 1 ], d[ 2 ] - b[ 2 ] );
		_n.crossVectors( _a, _b ).normalize();
		const nx = _n.x, ny = _n.y, nz = _n.z;
		return grid( nu, nv, ( u, v ) => {
			const k = disp ? disp( u, v ) : 0, out = [];
			for ( let i = 0; i < 3; i ++ ) out.push( ( a[ i ] * ( 1 - u ) + b[ i ] * u ) * ( 1 - v ) + ( d[ i ] * ( 1 - u ) + c[ i ] * u ) * v );
			return [ out[ 0 ] + nx * k, out[ 1 ] + ny * k, out[ 2 ] + nz * k ];
		} );
	},
	// a loft along +x through rounded-rectangle sections [ x, y, halfWidth, halfHeight, roundness (2: ellipse, 4+:
	// boxy) ], seg around; closed with caps when caps is set
	loft( secs, seg = 16, caps = false ) {
		const g = grid( seg, secs.length - 1, ( u, v ) => {
			const s = secs[ Math.round( v * ( secs.length - 1 ) ) ], a = - u * PI * 2;
			const c = Math.cos( a ), sn = Math.sin( a ), e = 2 / ( s[ 4 ] ?? 2 );
			return [ s[ 0 ], s[ 1 ] + Math.sign( sn ) * Math.abs( sn ) ** e * s[ 3 ], Math.sign( c ) * Math.abs( c ) ** e * s[ 2 ] ];
		} );
		if ( ! caps ) return g;
		const parts = [ g ];
		for ( const end of [ 0, secs.length - 1 ] ) {
			const s = secs[ end ], cap = new THREE.CircleGeometry( 1, seg ).scale( s[ 2 ], s[ 3 ], 1 ).rotateY( end ? PI / 2 : - PI / 2 ).translate( s[ 0 ], s[ 1 ], 0 );
			parts.push( cap );
		}
		return mergeSimple( parts );
	},
};

// several plain geometries (position, normal, uv) as one
export function mergeSimple( list ) {
	let nv = 0, ni = 0;
	for ( const g of list ) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
	const pos = new Float32Array( nv * 3 ), nor = new Float32Array( nv * 3 ), uv = new Float32Array( nv * 2 ), idx = [];
	let o = 0;
	for ( const g of list ) {
		const n = g.attributes.position.count;
		pos.set( g.attributes.position.array, o * 3 );
		if ( g.attributes.normal ) nor.set( g.attributes.normal.array, o * 3 );
		if ( g.attributes.uv ) uv.set( g.attributes.uv.array, o * 2 );
		if ( g.index ) for ( const i of g.index.array ) idx.push( i + o ); else for ( let i = 0; i < n; i ++ ) idx.push( i + o );
		o += n;
		g.dispose();
	}
	const out = new THREE.BufferGeometry();
	out.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	out.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	out.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	out.setIndex( idx );
	return out;
}

// a merged mesh of small things: drawn (and casting) only within FINE_R of the camera; three asks `visible` of every
// object it draws, in the main view and in each shadow map, so the test sits there (G.uCamPos: the main camera)
const _fv = new THREE.Vector3();
class FineMesh extends THREE.Mesh {
	get visible() {
		if ( ! this._shown ) return false;
		const bs = this.geometry.boundingSphere, cam = G.uCamPos.value;
		if ( ! bs ) return true;
		_fv.copy( bs.center ).applyMatrix4( this.matrixWorld );
		return _fv.distanceTo( cam ) - bs.radius < FINE_R;
	}
	set visible( v ) { this._shown = v; }
}

// ---- the kit -----------------------------------------------------------------------------------------------------------

const baseKey = ( k ) => k.endsWith( ':fine' ) ? k.slice( 0, - 5 ) : k;

export class Kit {
	constructor() {
		this.groups = new Map(); // material key (':fine' for small things) -> [ part ]
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

	// a geometry part: mat is a key of siteMaterials(); color a hex (sRGB) or THREE.Color; o: { cell (print atlas),
	// drape (follow the ground), fine (small: drawn near only), grime (0-1: darker towards the ground, the dirt a
	// tent's hem or a sandbag's foot picks up) }
	part( g, mat, color, p = null, r = null, s = null, o = {} ) {
		_e.set( r?.[ 0 ] || 0, r?.[ 1 ] || 0, r?.[ 2 ] || 0 );
		_q.setFromEuler( _e );
		_p.set( p?.[ 0 ] || 0, p?.[ 1 ] || 0, p?.[ 2 ] || 0 );
		if ( typeof s === 'number' ) _s.setScalar( s ); else _s.set( s?.[ 0 ] ?? 1, s?.[ 1 ] ?? 1, s?.[ 2 ] ?? 1 );
		const m = this.T.clone().multiply( _m.compose( _p, _q, _s ) );
		const key = o.fine ? mat + ':fine' : mat;
		let list = this.groups.get( key );
		if ( ! list ) { list = []; this.groups.set( key, list ); }
		_c.set( color ?? 0xffffff );
		list.push( { g, m, r: _c.r, g_: _c.g, b: _c.b, cell: o.cell ?? null, scale: [ _s.x, _s.y, _s.z ], drape: o.drape && this.ground ? this.base : null, grime: o.grime || 0, gb: this.base } );
		return this;
	}
	box( w, h, d, mat, color, p, r, o ) { return this.part( geo.box( w, h, d ), mat, color, p, r, null, o ); }
	rbox( w, h, d, rad, mat, color, p, r, o ) { return this.part( geo.rbox( w, h, d, rad, o?.seg ?? 2 ), mat, color, p, r, null, o ); }
	cyl( rt, rb, h, mat, color, p, r, seg = 12, o ) { return this.part( geo.cyl( rt, rb, h, seg ), mat, color, p, r, null, o ); }

	// how far the ground lies above ( lx, 0, lz ) of the current frame: 0 on the flat, so a peg or a can a few metres
	// out from its prop still meets a slope (frames are only ever yawed where this is used)
	groundAt( lx, lz ) {
		if ( ! this.ground ) return 0;
		_v.set( lx, 0, lz ).applyMatrix4( this.T );
		return this.ground( _v.x, _v.z ) - _v.y;
	}

	// a physics box: centre p in the current frame, half sizes, extra yaw; mat drives impact sounds
	collider( hx, hy, hz, p = [ 0, 0, 0 ], yaw = 0, mat = 'wood', kind = 'solid' ) {
		_v.set( p[ 0 ], p[ 1 ], p[ 2 ] ).applyMatrix4( this.T );
		this.boxes.push( { x: _v.x, y: _v.y, z: _v.z, hx, hy, hz, yaw: this.yaws[ this.yaws.length - 1 ] + yaw, mat, kind } );
		return this;
	}

	// a flat decal conformed to the ground: heightAt( lx, lz ) in this kit's root frame
	decal( kind, x, z, size, yaw, heightAt, a = 1 ) {
		const n = size > 4 ? 6 : size > 1.5 ? 3 : 1;
		const pg = new THREE.PlaneGeometry( size, size, n, n ).rotateX( - PI / 2 ).rotateY( yaw );
		const pos = pg.attributes.position;
		for ( let i = 0; i < pos.count; i ++ ) {
			const px = pos.getX( i ) + x, pz = pos.getZ( i ) + z;
			pos.setXYZ( i, px, heightAt( px, pz ) + 0.03 + size * 0.002, pz );
		}
		pg.computeVertexNormals();
		const list = this.groups.get( 'decal' ) || this.groups.set( 'decal', [] ).get( 'decal' );
		list.push( { g: pg, m: null, r: 1, g_: 1, b: 1, cell: DECALS[ kind ] ?? 0, a, scale: [ 1, 1, 1 ], grime: 0 } );
		return this;
	}
	// a ground decal from inside a prop: at ( lx, lz ) of the current frame, turned with it
	groundDecal( kind, lx, lz, size, yaw = 0 ) {
		_v.set( lx, 0, lz ).applyMatrix4( this.T );
		const y0 = _v.y, x = _v.x, z = _v.z;
		return this.decal( kind, x, z, size, this.yaws[ this.yaws.length - 1 ] + yaw, this.ground || ( () => y0 - 0.025 ) );
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
		this._m = { name, group, tris: 0, list: [ ...this.groups ].filter( ( [ k, parts ] ) => M[ baseKey( k ) ] && parts.length ), gi: 0, pi: 0, cur: null };
		return this;
	}

	// merge parts until the time runs out; true when every material is done
	step( until = Infinity ) {
		const B = this._m, M = siteMaterials();
		while ( B.gi < B.list.length ) {
			const [ key, parts ] = B.list[ B.gi ];
			const mat = M[ baseKey( key ) ];
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
			const mesh = key.endsWith( ':fine' ) ? new FineMesh( bg, mat ) : new THREE.Mesh( bg, mat );
			mesh.name = B.name + ':' + key;
			mesh.castShadow = ! mat.userData.noShadow;
			mesh.receiveShadow = true;
			mesh.userData.shadow = mesh.castShadow;
			if ( key === 'decal' ) mesh.renderOrder = 2;
			if ( mat.renderOrder ) mesh.renderOrder = mat.renderOrder;
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
		const AC = uvMode?.atlas ? ( Array.isArray( uvMode.atlas ) ? uvMode.atlas[ 0 ] : uvMode.atlas ) : 1;
		const AR = uvMode?.atlas ? ( Array.isArray( uvMode.atlas ) ? uvMode.atlas[ 1 ] : uvMode.atlas ) : 1;
		for ( let i = 0; i < gp.count; i ++ ) {
			const i3 = i * 3;
			let x = pa[ i3 ], y = pa[ i3 + 1 ], z = pa[ i3 + 2 ];
			let nx = 0, ny = 1, nz = 0;
			if ( na ) { nx = na[ i3 ]; ny = na[ i3 + 1 ]; nz = na[ i3 + 2 ]; }
			if ( uv ) {
				let u = 0, w = 0;
				if ( uvMode.atlas ) {
					const k = p.cell ?? 0, cu = ( k % AC ) / AC, cv = 1 - ( Math.floor( k / AC ) + 1 ) / AR;
					const su = ua ? ua[ i * 2 ] : 0, sv = ua ? ua[ i * 2 + 1 ] : 0;
					// (a small inset keeps mip filtering inside the cell)
					u = cu + ( 0.01 + Math.min( 1, Math.max( 0, su ) ) * 0.98 ) / AC; w = cv + ( 0.01 + Math.min( 1, Math.max( 0, sv ) ) * 0.98 ) / AR;
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
			// dirt up from the ground: a soft band over the lowest 60 cm
			let f = 1;
			if ( p.grime ) { const h = Math.max( 0, y - p.gb ) / 0.6; f = 1 - p.grime * ( h < 1 ? ( 1 - h ) * ( 1 - h ) : 0 ); }
			col[ o ] = p.r * f; col[ o + 1 ] = p.g_ * f; col[ o + 2 ] = p.b * f * ( 0.85 + 0.15 * f );
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

// ---- shapes the prop builders share ----------------------------------------------------------------------------------

// smooth value noise for lumps, sags and crumples
export function vnoise( x, z, seed ) {
	const h = ( i, j ) => { let n = Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) + Math.imul( seed, 1442695041 ); n = Math.imul( n ^ ( n >>> 13 ), 1274126177 ); return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296; };
	const i = Math.floor( x ), j = Math.floor( z ), fx = x - i, fz = z - j;
	const sx = fx * fx * ( 3 - 2 * fx ), sz = fz * fz * ( 3 - 2 * fz );
	return ( h( i, j ) * ( 1 - sx ) + h( i + 1, j ) * sx ) * ( 1 - sz ) + ( h( i, j + 1 ) * ( 1 - sx ) + h( i + 1, j + 1 ) * sx ) * sz;
}

// a custom face set: quads [ a, b, c, d ] (counter-clockwise seen from the front) and triangles [ a, b, c ]
export function faces( list ) {
	const pos = [], uv = [];
	for ( const f of list ) {
		const tri = ( a, b, c, ua, ub, uc ) => { pos.push( ...a, ...b, ...c ); uv.push( ...ua, ...ub, ...uc ); };
		if ( f.length === 4 ) { tri( f[ 0 ], f[ 1 ], f[ 2 ], [ 0, 0 ], [ 1, 0 ], [ 1, 1 ] ); tri( f[ 0 ], f[ 2 ], f[ 3 ], [ 0, 0 ], [ 1, 1 ], [ 0, 1 ] ); }
		else tri( f[ 0 ], f[ 1 ], f[ 2 ], [ 0, 0 ], [ 1, 0 ], [ 0.5, 1 ] );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.computeVertexNormals();
	return g;
}

// a plane (xz, facing up) with its vertices moved by fn( x, z ) -> y; uv over the whole plane
export function sheet( w, d, sx, sz, fn ) {
	const g = new THREE.PlaneGeometry( w, d, sx, sz ).rotateX( - PI / 2 );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) p.setY( i, fn( p.getX( i ), p.getZ( i ) ) );
	g.computeVertexNormals();
	return g;
}

// the same surface seen from the other side (a dark lining inside a tent: only the inside faces draw)
export function inward( g ) {
	if ( ! g.index ) g = g.toNonIndexed();
	const ix = g.index ? g.index.array : null;
	if ( ix ) for ( let i = 0; i < ix.length; i += 3 ) { const t = ix[ i + 1 ]; ix[ i + 1 ] = ix[ i + 2 ]; ix[ i + 2 ] = t; }
	const n = g.attributes.normal.array;
	for ( let i = 0; i < n.length; i ++ ) n[ i ] = - n[ i ];
	return g;
}

const _ru = new THREE.Vector3( 0, 1, 0 ), _rd = new THREE.Vector3(), _rq = new THREE.Quaternion(), _re = new THREE.Euler();
// a rod between two points (a, b = [ x, y, z ])
export function rod( k, a, b, r, mat, color, seg = 6, o ) {
	const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ], dz = b[ 2 ] - a[ 2 ];
	const len = Math.hypot( dx, dy, dz );
	if ( len < 1e-4 ) return;
	_rq.setFromUnitVectors( _ru, _rd.set( dx / len, dy / len, dz / len ) );
	_re.setFromQuaternion( _rq );
	k.part( new THREE.CylinderGeometry( r, r, len, seg, 1, seg <= 4 ), mat, color, [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 ], [ _re.x, _re.y, _re.z ], null, o );
}

// a rope hanging between two points (sag: the drop at its middle)
export function rope( k, a, b, sag, r = 0.006, color = 0xcfc8b2, n = 8, o = { fine: true } ) {
	const pts = [];
	for ( let i = 0; i <= n; i ++ ) { const t = i / n; pts.push( [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t - sag * 4 * t * ( 1 - t ), a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ] ); }
	k.part( geo.tube( pts, r, n, 3 ), 'matte', color, null, null, null, o );
}
