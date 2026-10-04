// Model builders for the outdoors items (docs/ITEMS_PLAN.md "outdoors"), and the looks of the things this domain places
// (ext/outdoors/kinds.js reads OUT.look). register( reg ) is called once by render/ItemModels.js.
// Conventions (render/ItemModels.js): metres, origin at the centre of the bottom, long axis along +x. Parts are built
// with centred geometry and set on the ground at the end with ground().
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, canvasTex, labelTex, fabric, shade, css, facet } from '../lib.js';
import { patchMaterial } from '../../../../render/Materials.js';
import { compact } from '../../placeables/merge.js';
import { flame, glowSprite } from '../../placeables/fx.js';
import { OUT } from '../../ext/outdoors/kinds.js';
import { SMOKE, tanHours, STILL } from '../../ext/outdoors/logic.js';
import { getItem } from '../../ItemDB.js';

// ---- primitives (centred) --------------------------------------------------------------------------------------------

const B = ( w, h, d ) => new THREE.BoxGeometry( w, h, d );
const C = ( rt, rb, h, seg = 16, open = false ) => new THREE.CylinderGeometry( rt, rb, h, seg, 1, open );
const CX = ( r, len, seg = 12, r2 = r ) => G.cylX( r, len, seg, r2 );
const RB = ( w, h, d, r = 0.004 ) => G.rbox( w, h, d, r ).translate( 0, - h / 2, 0 );
const TORUS = ( R, r, rs = 6, ts = 24, arc = PI * 2 ) => new THREE.TorusGeometry( R, r, rs, ts, arc );
const tube = ( pts, r, seg = 16, rs = 6, closed = false ) => new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( ...p ) ), closed ), seg, r, rs, closed );
const disc = ( r, seg = 20 ) => new THREE.CircleGeometry( r, seg ).rotateX( - PI / 2 );

const steel = () => M( 0xc0c6cc, { rough: 0.25, metal: 0.95 } );
const dull = () => M( 0x8a8e94, { rough: 0.45, metal: 0.8 } );
const plastic = ( c, rough = 0.45 ) => M( c, { rough } );
const rubber = ( c = 0x18181a ) => M( c, { rough: 0.85 } );
const wood = ( c = 0x8a5a33, rough = 0.8 ) => M( c, { rough } );
const cord = ( c = 0x1a1a1a ) => M( c, { rough: 0.9 } );
const flat = ( spec, o = {} ) => M( 0xffffff, { map: labelTex( spec ), rough: o.rough ?? 0.55, metal: o.metal ?? 0 } );

// alpha-tested materials: nets, wire mesh, woven baskets, palm leaflets (see-through, still cast shadows)
const cutMats = new Map();
function cutout( key, tex, o = {} ) {
	let m = cutMats.get( key );
	if ( m ) return m;
	if ( o.repeat ) { tex = tex.clone(); tex.repeat.set( o.repeat[ 0 ], o.repeat[ 1 ] ); tex.needsUpdate = true; }
	m = new THREE.MeshStandardMaterial( { map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, color: o.color ?? 0xffffff } );
	patchMaterial( m, 'item' );
	cutMats.set( key, m );
	return m;
}

// ---- textures ----------------------------------------------------------------------------------------------------------

function rnd( seed ) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; }; }

// bamboo: green-gold with fine streaks along the culm (u runs round a cylinder, v along it)
function bambooTex( c1 = 0x8a9a32, c2 = 0xc8b65a ) {
	return canvasTex( `out:bamboo:${c1}:${c2}`, 64, 256, ( ctx, W, H ) => {
		const gr = ctx.createLinearGradient( 0, 0, W, 0 );
		gr.addColorStop( 0, css( c1 ) ); gr.addColorStop( 0.5, css( c2 ) ); gr.addColorStop( 1, css( c1 ) );
		ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
		const r = rnd( 7 );
		for ( let i = 0; i < 40; i ++ ) { ctx.fillStyle = `rgba(${r() < 0.5 ? '40,50,10' : '255,250,210'},${0.06 + r() * 0.08})`; ctx.fillRect( r() * W, 0, 1 + r() * 1.5, H ); }
	}, { repeat: true } );
}
// coconut husk and sennit fibre: brown streaks
function fibreTex( c = 0x8a6a40 ) {
	return canvasTex( `out:fibre:${c}`, 128, 128, ( ctx, W, H ) => {
		ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
		const r = rnd( 3 );
		for ( let i = 0; i < 260; i ++ ) {
			ctx.strokeStyle = `rgba(${r() < 0.5 ? '40,24,10' : '230,200,150'},${0.15 + r() * 0.25})`; ctx.lineWidth = 0.6 + r();
			const x = r() * W, y = r() * H;
			ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + ( r() - 0.5 ) * 8, y + 10 + r() * 20 ); ctx.stroke();
		}
	}, { repeat: true } );
}
// a knotted net: diamond mesh lines on nothing
function netTex( c = '#e8ece6', cells = 8, lw = 2.2 ) {
	return canvasTex( `out:net:${c}:${cells}:${lw}`, 256, 256, ( ctx, W, H ) => {
		ctx.clearRect( 0, 0, W, H );
		ctx.strokeStyle = c; ctx.lineWidth = lw;
		const s = W / cells;
		for ( let i = - cells; i <= cells * 2; i ++ ) {
			ctx.beginPath(); ctx.moveTo( i * s, 0 ); ctx.lineTo( i * s + H, H ); ctx.stroke();
			ctx.beginPath(); ctx.moveTo( i * s, 0 ); ctx.lineTo( i * s - H, H ); ctx.stroke();
		}
	}, { repeat: true } );
}
// welded wire: a square grid
function gridTex( c = '#b8bcc0', cells = 6, lw = 3 ) {
	return canvasTex( `out:grid:${c}:${cells}:${lw}`, 128, 128, ( ctx, W, H ) => {
		ctx.clearRect( 0, 0, W, H );
		ctx.fillStyle = c;
		const s = W / cells;
		for ( let i = 0; i < cells; i ++ ) { ctx.fillRect( i * s, 0, lw, H ); ctx.fillRect( 0, i * s, W, lw ); }
	}, { repeat: true } );
}
// an open basket weave (the ʻie): diagonal strips with gaps between
function basketTex( c1 = '#b8925a', c2 = '#8a6a3a' ) {
	return canvasTex( `out:basket:${c1}:${c2}`, 256, 256, ( ctx, W, H ) => {
		ctx.clearRect( 0, 0, W, H );
		const n = 10, s = W / n;
		for ( let i = - n; i < n * 2; i ++ ) {
			ctx.strokeStyle = c1; ctx.lineWidth = s * 0.42;
			ctx.beginPath(); ctx.moveTo( i * s, 0 ); ctx.lineTo( i * s + H, H ); ctx.stroke();
			ctx.strokeStyle = c2; ctx.lineWidth = s * 0.36;
			ctx.beginPath(); ctx.moveTo( i * s, 0 ); ctx.lineTo( i * s - H, H ); ctx.stroke();
		}
		ctx.fillStyle = 'rgba(40,24,8,0.35)';
		for ( let y = 0; y < H; y += s ) ctx.fillRect( 0, y, W, 2 );
	}, { repeat: true } );
}
// a palm leaflet: green with a pale midrib, cut to a long point
function leafletTex( c = 0x4a7a2a ) {
	return canvasTex( `out:leaflet:${c}`, 32, 256, ( ctx, W, H ) => {
		ctx.clearRect( 0, 0, W, H );
		const gr = ctx.createLinearGradient( 0, 0, W, 0 );
		gr.addColorStop( 0, css( shade( c, - 0.25 ) ) ); gr.addColorStop( 0.5, css( c ) ); gr.addColorStop( 1, css( shade( c, - 0.25 ) ) );
		ctx.fillStyle = gr;
		ctx.beginPath(); ctx.moveTo( W / 2, 0 ); ctx.quadraticCurveTo( W, H * 0.3, W * 0.85, H ); ctx.lineTo( W * 0.15, H ); ctx.quadraticCurveTo( 0, H * 0.3, W / 2, 0 ); ctx.fill();
		ctx.fillStyle = css( shade( c, 0.35 ) ); ctx.fillRect( W / 2 - 1, H * 0.05, 2, H * 0.95 );
	} );
}
// spots on a skin (squid, lobster)
function spotsTex( key, base, spot, n = 120, size = 3 ) {
	return canvasTex( `out:spots:${key}`, 128, 128, ( ctx, W, H ) => {
		ctx.fillStyle = css( base ); ctx.fillRect( 0, 0, W, H );
		const r = rnd( key.length * 31 );
		ctx.fillStyle = css( spot );
		for ( let i = 0; i < n; i ++ ) { ctx.globalAlpha = 0.4 + r() * 0.5; ctx.beginPath(); ctx.arc( r() * W, r() * H, size * ( 0.4 + r() ), 0, PI * 2 ); ctx.fill(); }
		ctx.globalAlpha = 1;
	}, { repeat: true } );
}
// rings along a rolled foam pad, and the spiral on its ends
function ridgeTex( c ) {
	return canvasTex( `out:ridge:${c}`, 64, 128, ( ctx, W, H ) => {
		ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
		for ( let y = 0; y < H; y += 8 ) { ctx.fillStyle = css( shade( c, - 0.18 ) ); ctx.fillRect( 0, y, W, 3 ); }
	}, { repeat: true } );
}
function spiralTex( c1, c2 = null ) {
	return canvasTex( `out:spiral:${c1}:${c2}`, 128, 128, ( ctx, W, H ) => {
		ctx.fillStyle = css( shade( c1, - 0.3 ) ); ctx.fillRect( 0, 0, W, H );
		ctx.translate( W / 2, H / 2 );
		ctx.lineWidth = 5;
		for ( let k = 0; k < 2; k ++ ) {
			ctx.strokeStyle = css( k && c2 != null ? c2 : c1 );
			ctx.beginPath();
			for ( let i = 0; i <= 200; i ++ ) { const t = i / 200, a = t * PI * 2 * 5 + k * PI, r = 4 + t * 58; ctx.lineTo( Math.cos( a ) * r, Math.sin( a ) * r ); }
			ctx.stroke();
		}
	} );
}
function mylarTex() {
	return canvasTex( 'out:mylar', 128, 128, ( ctx, W, H ) => {
		ctx.fillStyle = '#c4c8ce'; ctx.fillRect( 0, 0, W, H );
		const r = rnd( 9 );
		for ( let i = 0; i < 70; i ++ ) {
			const x = r() * W, y = r() * H, a = r() * PI, l = 8 + r() * 30;
			ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(60,64,70,0.35)'; ctx.lineWidth = 1 + r() * 2;
			ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + Math.cos( a ) * l, y + Math.sin( a ) * l ); ctx.stroke();
		}
	}, { repeat: true } );
}
function charTex() {
	return canvasTex( 'out:char', 64, 64, ( ctx, W, H ) => {
		ctx.fillStyle = '#7a5a3a'; ctx.fillRect( 0, 0, W, H );
		ctx.fillStyle = '#1a120c'; ctx.beginPath(); ctx.arc( 20, 32, 7, 0, PI * 2 ); ctx.fill(); ctx.beginPath(); ctx.arc( 44, 30, 5, 0, PI * 2 ); ctx.fill();
	} );
}

// ---- small shared parts ------------------------------------------------------------------------------------------------

// a closed ring through points (lying flat at height y)
const loop = ( pts, r, y = 0, seg = 32, rs = 6 ) => tube( pts.map( ( [ x, z ] ) => [ x, y, z ] ), r, seg, rs, true );

function carabinerPart( c = 0xe8641a ) {
	const g = group();
	const pts = [ [ - 0.03, - 0.016 ], [ 0.012, - 0.019 ], [ 0.032, - 0.01 ], [ 0.035, 0.004 ], [ 0.026, 0.017 ], [ - 0.004, 0.02 ], [ - 0.03, 0.016 ], [ - 0.038, 0 ] ];
	add( g, loop( pts, 0.0035, 0.0035, 40 ), M( c, { rough: 0.3, metal: 0.6 } ) );
	add( g, CX( 0.0022, 0.03, 8 ), steel(), [ - 0.004, 0.0035, 0.017 ] );
	return g;
}

// a fish shape for catches shown in traps (a reef fish or a lobster)
function smallFish( c = 0x3a6a9a ) {
	const g = group();
	const body = G.sph( 0.05, 12, 8 ); body.scale( 2.2, 0.8, 0.45 );
	add( g, body, M( c, { rough: 0.35 } ), [ 0, 0.045, 0 ] );
	add( g, new THREE.ConeGeometry( 0.035, 0.05, 4 ).rotateZ( PI / 2 ).scale( 1, 1, 0.25 ), M( shade( c, - 0.2 ), { rough: 0.4 } ), [ - 0.13, 0.045, 0 ] );
	return g;
}

// a spiral coil lying flat: n turns from r0 to r1 (mosquito coil, sennit, a coiled line)
function spiral( r0, r1, turns, thick, y, phase = 0, n = 140 ) {
	const pts = [];
	for ( let i = 0; i <= n; i ++ ) { const t = i / n, a = t * turns * PI * 2 + phase, r = r0 + t * ( r1 - r0 ); pts.push( [ Math.cos( a ) * r, y, Math.sin( a ) * r ] ); }
	return tube( pts, thick, n, 4 );
}

// a palm frond: a curving midrib with two rows of drooping leaflets
function frondPart( len = 1.5, n = 22, c = 0x4a7a2a, droop = 0.12 ) {
	const g = group();
	const rib = M( 0x8a8a3a, { rough: 0.8 } ), leaf = cutout( `leaflet:${c}`, leafletTex( c ), { rough: 0.7 } );
	const at = ( t ) => [ - len / 2 + t * len, 0.03 + Math.sin( t * PI ) * 0.04 - t * t * droop * 0.3, 0 ];
	add( g, tube( [ 0, 0.25, 0.5, 0.75, 1 ].map( at ), 0.009, 12, 5 ), rib );
	add( g, CX( 0.03, 0.2, 8, 0.012 ), rib, [ - len / 2 - 0.05, 0.03, 0 ] );
	const geo = new THREE.PlaneGeometry( 0.032, 1, 1, 1 ).translate( 0, 0.5, 0 );
	for ( let i = 0; i < n; i ++ ) {
		const t = 0.08 + i / n * 0.9, [ x, y ] = at( t ), L = 0.42 * Math.sin( Math.min( 1, t * 1.25 ) * PI * 0.92 + 0.15 );
		for ( const s of [ - 1, 1 ] ) {
			const m = add( g, geo, leaf, [ x, y, 0 ], [ - PI / 2 + droop * 2 * s, 0, 0 ], [ 1, Math.max( 0.12, L ), 1 ] );
			m.rotation.order = 'YXZ'; m.rotation.y = s * ( PI / 2 - 0.45 );
		}
	}
	return g;
}

// bamboo culm along x with nodes
function bambooPart( r, len, seg = 0.32 ) {
	const g = group(), m = M( 0xffffff, { map: bambooTex(), rough: 0.5 } ), node = M( 0x9a9a42, { rough: 0.55 } );
	add( g, CX( r, len, 14 ), m );
	for ( let x = - len / 2 + seg * 0.6; x < len / 2 - 0.05; x += seg ) add( g, TORUS( r * 1.01, r * 0.12, 5, 16 ).rotateY( PI / 2 ), node, [ x, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) add( g, disc( r * 0.98, 14 ).rotateZ( s * PI / 2 ), M( 0xd8c890, { rough: 0.8 } ), [ s * len / 2 * 1.0005, 0, 0 ] );
	return g;
}

// ======================================================================================================================

export function register( reg ) {
	// =================================== camp ===================================

	reg( 'out_ferro', () => {
		const g = group();
		add( g, CX( 0.0095, 0.05, 12 ), plastic( 0xe8641a, 0.5 ), [ - 0.03, 0, 0 ] );
		add( g, TORUS( 0.008, 0.002, 4, 12 ).rotateY( PI / 2 ), plastic( 0x1a1a1a ), [ - 0.057, 0, 0 ] );
		add( g, CX( 0.0045, 0.085, 10 ), M( 0x55585e, { rough: 0.6, metal: 0.7 } ), [ 0.037, 0, 0 ] );
		// the striker on its cord
		add( g, B( 0.045, 0.002, 0.014 ), steel(), [ 0.005, - 0.008, 0.03 ], [ 0, 0.3, 0 ] );
		add( g, tube( [ [ - 0.06, 0, 0 ], [ - 0.075, - 0.006, 0.02 ], [ - 0.04, - 0.008, 0.036 ], [ - 0.016, - 0.008, 0.035 ] ], 0.0012, 12, 4 ), cord() );
		return ground( g );
	} );

	reg( 'out_magnifier', () => {
		const g = group(), R = 0.038;
		add( g, TORUS( R, 0.0045, 8, 36 ).rotateX( PI / 2 ), M( 0x1a1a1a, { rough: 0.35 } ) );
		add( g, C( R, R, 0.004, 32 ), MAT.glass( 0xe2f2f8, 0.25 ) );
		add( g, CX( 0.006, 0.02, 10 ), steel(), [ R + 0.012, 0, 0 ] );
		add( g, CX( 0.0072, 0.085, 12, 0.0085 ), plastic( 0x2a1a12, 0.35 ), [ R + 0.064, 0, 0 ] );
		return ground( g );
	} );

	reg( 'out_mirror', () => {
		const g = group();
		add( g, RB( 0.078, 0.004, 0.052, 0.003 ), plastic( 0x2a2c2a, 0.6 ) );
		add( g, B( 0.071, 0.001, 0.045 ), M( 0xe6ecf0, { rough: 0.03, metal: 1 } ), [ 0, 0.0025, 0 ] );
		add( g, C( 0.003, 0.003, 0.0014, 10 ), M( 0x0a0a0a ), [ 0, 0.003, 0 ] );
		add( g, TORUS( 0.004, 0.0012, 4, 10 ).rotateX( PI / 2 ), dull(), [ - 0.042, 0, 0.018 ] );
		add( g, tube( [ [ - 0.045, 0, 0.02 ], [ - 0.07, - 0.002, 0.03 ], [ - 0.08, - 0.002, 0.0 ], [ - 0.06, - 0.002, - 0.02 ] ], 0.0016, 12, 4 ), cord( 0xe8641a ) );
		return ground( g );
	} );

	reg( 'out_hank', ( s ) => {
		const g = group(), c = s.color ?? 0xe8642a;
		// a coil of 550 cord, flecked weave, the end tucked through
		const m = fabric( c, 'weave', shade( c, - 0.15 ), { rep: 18, rough: 0.85, color3: shade( c, - 0.55 ) } );
		for ( let i = 0; i < 7; i ++ ) add( g, TORUS( 0.052 - ( i % 3 ) * 0.003, 0.0045, 6, 30 ).rotateX( PI / 2 ), m, [ ( i % 2 ) * 0.003, 0.0045 + i * 0.0055, ( i % 3 ) * 0.002 ], [ 0, 0, 0 ] );
		add( g, CX( 0.012, 0.03, 10 ), m, [ 0.052, 0.022, 0 ], null, [ 1, 1.2, 1.2 ] );
		add( g, tube( [ [ 0.055, 0.02, 0.005 ], [ 0.08, 0.008, 0.025 ], [ 0.1, 0.0045, 0.01 ], [ 0.12, 0.0045, 0.03 ] ], 0.0045, 12, 6 ), m );
		return ground( g );
	} );

	reg( 'out_carabiner', ( s ) => ground( carabinerPart( s.color ?? 0xe8641a ) ) );

	reg( 'out_mylar', () => {
		const g = group();
		add( g, RB( 0.13, 0.014, 0.09, 0.004 ), M( 0xffffff, { map: mylarTex(), rough: 0.22, metal: 0.85 } ) );
		add( g, B( 0.118, 0.0008, 0.078 ), flat( { bg: 0xe8641a, fg: 0xffffff, band: 0xc8ccd2, text: 'EMERGENCY BLANKET', sub: 'Thermal · Reflects body heat', style: 'band', size: 0.22 }, { rough: 0.4 } ), [ 0, 0.0075, 0 ] );
		return ground( g );
	} );

	reg( 'out_hammock_pack', () => {
		const g = group(), c = 0x1a7a8a;
		add( g, G.capsX( 0.055, 0.22, 14 ), fabric( c, 'canvas', 0xffffff, { rep: 3, rough: 0.8 } ) );
		add( g, CX( 0.057, 0.02, 14 ), M( shade( c, - 0.4 ), { rough: 0.8 } ), [ 0.07, 0, 0 ] );
		add( g, tube( [ [ 0.11, 0.0, 0 ], [ 0.13, 0.01, 0.01 ], [ 0.14, 0.0, - 0.01 ] ], 0.003, 8, 4 ), cord() );
		for ( const z of [ - 0.03, 0.03 ] ) { const cb = carabinerPart( z > 0 ? 0x2a8ad6 : 0xd02a2a ); cb.position.set( - 0.08, - 0.05, z * 2.2 ); cb.rotation.y = z * 8; g.add( cb ); }
		// a strap coiled beside it
		add( g, TORUS( 0.035, 0.004, 4, 22 ).rotateX( PI / 2 ), M( 0x1a1a1a, { rough: 0.85 } ), [ 0.02, - 0.051, 0.07 ], null, [ 1.6, 1, 1 ] );
		return ground( g );
	} );

	reg( 'out_pad', ( s ) => {
		const g = group(), c = s.color ?? 0xd8a82a, L = 0.5, R = 0.068;
		add( g, new THREE.CylinderGeometry( R, R, L, 24, 1, true ).rotateZ( - PI / 2 ), M( 0xffffff, { map: ridgeTex( c ), rough: 0.9, side: THREE.DoubleSide } ) );
		const end = M( 0xffffff, { map: spiralTex( c ), rough: 0.9 } );
		for ( const sx of [ - 1, 1 ] ) add( g, new THREE.CircleGeometry( R, 24 ).rotateY( sx * PI / 2 ), end, [ sx * L / 2, 0, 0 ] );
		for ( const x of [ - 0.15, 0.15 ] ) add( g, CX( R * 1.03, 0.022, 20 ), M( 0x1a1a1a, { rough: 0.8 } ), [ x, 0, 0 ] );
		return ground( g );
	} );

	reg( 'out_bedroll', () => {
		const g = group(), L = 0.46, R = 0.11, c = 0x2a4a8a;
		add( g, new THREE.CylinderGeometry( R, R, L, 26, 1, true ).rotateZ( - PI / 2 ), fabric( c, 'stripes', shade( c, - 0.25 ), { rep: 6, rough: 0.75 } ) );
		const end = M( 0xffffff, { map: spiralTex( 0xd8a82a, c ), rough: 0.85 } );
		for ( const sx of [ - 1, 1 ] ) add( g, new THREE.CircleGeometry( R, 26 ).rotateY( sx * PI / 2 ), end, [ sx * L / 2, 0, 0 ] );
		for ( const x of [ - 0.14, 0.14 ] ) {
			add( g, CX( R * 1.03, 0.026, 22 ), M( 0x1a1a1a, { rough: 0.8 } ), [ x, 0, 0 ] );
			add( g, B( 0.034, 0.02, 0.03 ), plastic( 0x1a1a1a, 0.4 ), [ x, R * 0.98, 0 ] );
		}
		return ground( g );
	} );

	reg( 'out_chair_bag', () => {
		const g = group(), c = 0x1f3a2a;
		add( g, G.capsX( 0.075, 0.86, 16 ), fabric( c, 'canvas', 0xffffff, { rep: 4, rough: 0.85 } ) );
		add( g, CX( 0.077, 0.03, 16 ), M( 0x101810, { rough: 0.8 } ), [ 0.33, 0, 0 ] );
		// the chair's feet poking out of the open end, and the shoulder strap
		for ( let i = 0; i < 4; i ++ ) add( g, CX( 0.011, 0.05, 8 ), rubber(), [ - 0.44, Math.cos( i * PI / 2 + 0.6 ) * 0.035, Math.sin( i * PI / 2 + 0.6 ) * 0.035 ] );
		add( g, tube( [ [ - 0.3, 0.07, 0 ], [ - 0.1, 0.1, 0.02 ], [ 0.1, 0.1, 0.02 ], [ 0.3, 0.07, 0 ] ], 0.006, 16, 4 ), M( 0x1a1a1a, { rough: 0.85 } ), null, null, [ 1, 1, 1.6 ] );
		return ground( g );
	} );

	reg( 'out_netpack', () => {
		const g = group();
		// the net bunched up under its hanging ring, the mesh showing
		const mesh = fabric( 0xf4f4ee, 'mesh', 0x9a9c96, { rep: 6, rough: 0.95 } );
		const body = G.sph( 0.09, 16, 10 ); body.scale( 1.5, 0.5, 1 );
		add( g, body, mesh, [ 0, 0.045, 0 ] );
		add( g, new THREE.ConeGeometry( 0.06, 0.1, 14, 1, true ).rotateZ( - PI / 2 ), cutout( 'mosqnet', netTex( '#f2f2ec', 16, 2 ), { rough: 0.9 } ), [ 0.15, 0.04, 0 ] );
		add( g, TORUS( 0.035, 0.004, 6, 24 ).rotateX( PI / 2 ), plastic( 0xf2f2ee, 0.4 ), [ - 0.02, 0.092, 0 ] );
		add( g, tube( [ [ - 0.02, 0.095, 0 ], [ - 0.07, 0.1, 0.03 ], [ - 0.12, 0.09, 0.05 ], [ - 0.16, 0.04, 0.06 ] ], 0.0015, 12, 4 ), cord( 0xd8d8d0 ) );
		return ground( g );
	} );

	reg( 'out_coil', () => {
		const g = group(), m = M( 0x3a6a2a, { rough: 0.95 } );
		add( g, spiral( 0.006, 0.058, 4.2, 0.0028, 0.009, 0 ), m );
		add( g, spiral( 0.006, 0.058, 4.2, 0.0028, 0.009, PI ), m );
		// the tin stand with its pin
		add( g, B( 0.05, 0.001, 0.012 ), dull(), [ 0, 0.0005, 0 ] );
		add( g, B( 0.012, 0.001, 0.05 ), dull(), [ 0, 0.0005, 0 ] );
		add( g, C( 0.0012, 0.0012, 0.018, 6 ), dull(), [ 0, 0.009, 0 ] );
		return ground( g );
	} );

	reg( 'out_tarp_kit', () => {
		const g = group();
		add( g, RB( 0.36, 0.07, 0.22, 0.02 ), M( 0x2a5aa8, { rough: 0.6 } ) );
		for ( let i = 1; i < 3; i ++ ) add( g, B( 0.362, 0.002, 0.004 ), M( 0x1a3a78 ), [ 0, - 0.035 + 0.07 * i / 3, 0.11 ] );
		for ( const x of [ - 0.14, 0.14 ] ) add( g, TORUS( 0.008, 0.002, 4, 10 ).rotateX( PI / 2 ), steel(), [ x, 0.036, 0.09 ] );
		for ( const z of [ - 0.05, - 0.02 ] ) add( g, CX( 0.011, 0.52, 10 ), M( 0x9aa0a8, { rough: 0.3, metal: 0.8 } ), [ 0.02, 0.046, z ] );
		for ( let i = 0; i < 4; i ++ ) add( g, new THREE.ConeGeometry( 0.008, 0.16, 6 ).rotateZ( - PI / 2 ), plastic( 0xe8641a, 0.5 ), [ - 0.05 + i * 0.03, 0.04, 0.045 + ( i % 2 ) * 0.012 ] );
		add( g, TORUS( 0.05, 0.004, 5, 22 ).rotateX( PI / 2 ), cord( 0xd8c8a0 ), [ 0.05, 0.04, 0.03 ], null, [ 1, 1, 0.6 ] );
		return ground( g );
	} );

	// =================================== water ===================================

	reg( 'out_straw', () => {
		const g = group(), blue = plastic( 0x2a8ad6, 0.35 );
		add( g, CX( 0.0135, 0.16, 16 ), M( 0xffffff, { map: labelTex( { bg: 0x2a8ad6, fg: 0xffffff, text: 'PURE STRAW', sub: 'Filters 1000 L', style: 'plain', size: 0.32, w: 256, h: 128 } ), rough: 0.35 } ) );
		add( g, CX( 0.0145, 0.02, 16 ), plastic( 0x1a1a1a, 0.5 ), [ 0.085, 0, 0 ] );
		add( g, CX( 0.007, 0.03, 12, 0.012 ), plastic( 0x3a3a3a, 0.5 ), [ 0.11, 0, 0 ] );
		add( g, CX( 0.0145, 0.025, 16 ), blue, [ - 0.09, 0, 0 ] );
		add( g, tube( [ [ - 0.1, 0.0, 0.012 ], [ - 0.13, - 0.008, 0.03 ], [ - 0.11, - 0.012, 0.05 ], [ - 0.07, - 0.012, 0.04 ] ], 0.0015, 12, 4 ), cord() );
		return ground( g );
	} );

	reg( 'out_gravity', () => {
		const g = group(), c = 0x2a6ad6;
		add( g, RB( 0.2, 0.06, 0.15, 0.02 ), M( c, { rough: 0.5 } ) );
		add( g, B( 0.04, 0.062, 0.152 ), M( shade( c, - 0.3 ), { rough: 0.5 } ), [ 0.08, 0, 0 ] );
		add( g, B( 0.02, 0.018, 0.04 ), plastic( 0x1a1a1a ), [ 0.1, 0.03, 0.05 ] );
		// the filter cartridge and its hose
		add( g, CX( 0.024, 0.13, 16 ), plastic( 0xf2f2ee, 0.35 ), [ - 0.02, - 0.006, 0.105 ] );
		for ( const x of [ - 0.085, 0.045 ] ) add( g, CX( 0.026, 0.014, 16 ), plastic( c, 0.4 ), [ x, - 0.006, 0.105 ] );
		add( g, tube( [ [ - 0.09, - 0.006, 0.105 ], [ - 0.13, - 0.02, 0.08 ], [ - 0.12, - 0.025, 0.02 ], [ - 0.09, - 0.025, - 0.02 ] ], 0.005, 16, 6 ), M( 0xd8e6e0, { rough: 0.2 } ) );
		return ground( g );
	} );

	reg( 'out_bottlefilter', () => {
		const g = group();
		// a water bottle cut and turned neck down; through it, the layers: gravel, sand, charcoal, a rag in the neck
		const prof = [ [ 0.0, 0.0 ], [ 0.013, 0.0 ], [ 0.013, 0.016 ], [ 0.011, 0.02 ], [ 0.012, 0.036 ], [ 0.026, 0.06 ], [ 0.034, 0.08 ], [ 0.035, 0.2 ] ];
		add( g, G.lathe( prof, 22 ), MAT.glass( 0xd8eef5, 0.3 ) );
		add( g, C( 0.0135, 0.0135, 0.014, 14 ), plastic( 0x2a6ad6, 0.4 ), [ 0, 0.007, 0 ] );
		add( g, C( 0.011, 0.011, 0.02, 12 ), M( 0xd8cfc0, { rough: 0.95 } ), [ 0, 0.028, 0 ] );
		add( g, G.lathe( [ [ 0.0, 0.04 ], [ 0.022, 0.06 ], [ 0.031, 0.08 ], [ 0.032, 0.1 ], [ 0, 0.1 ] ], 18 ), M( 0x1a1614, { rough: 0.95 } ) );
		add( g, C( 0.032, 0.032, 0.04, 18 ), M( 0xd2b884, { rough: 1 } ), [ 0, 0.12, 0 ] );
		add( g, C( 0.032, 0.032, 0.03, 18 ), M( 0x8a8680, { rough: 1 } ), [ 0, 0.155, 0 ] );
		for ( let i = 0; i < 6; i ++ ) add( g, facet( new THREE.IcosahedronGeometry( 0.008, 0 ) ), M( 0x6a6660, { rough: 0.9 } ), [ Math.cos( i ) * 0.018, 0.172, Math.sin( i * 1.7 ) * 0.018 ] );
		return ground( g );
	} );

	reg( 'out_still_kit', () => {
		const g = group();
		add( g, RB( 0.24, 0.035, 0.18, 0.012 ), M( 0xdfeef2, { rough: 0.15, transparent: true, opacity: 0.6 } ) );
		add( g, B( 0.2, 0.002, 0.14 ), M( 0xc8d8dc, { rough: 0.3 } ), [ 0, - 0.016, 0 ] );
		// a tin cup and a drinking tube on top, tied with cord
		add( g, C( 0.033, 0.033, 0.09, 18, true ), MAT.tin(), [ 0.04, 0.062, 0.01 ] );
		add( g, disc( 0.033, 18 ), MAT.tin(), [ 0.04, 0.018, 0.01 ] );
		add( g, tube( [ [ - 0.1, 0.02, 0.06 ], [ - 0.05, 0.03, 0.08 ], [ 0.0, 0.02, 0.06 ], [ 0.02, 0.02, 0.03 ] ], 0.004, 14, 6 ), M( 0xe8f2ee, { rough: 0.2 } ) );
		add( g, CX( 0.002, 0.25, 6 ), cord( 0xc8a870 ), [ 0, 0.019, - 0.04 ] );
		return ground( g );
	} );

	reg( 'out_sheet', () => {
		const g = group(), L = 0.5;
		add( g, CX( 0.06, L, 22 ), M( 0xe4f0f2, { rough: 0.12, transparent: true, opacity: 0.55 } ) );
		add( g, CX( 0.02, L + 0.012, 14 ), M( 0xb58a57, { rough: 0.9 } ) );
		add( g, new THREE.CylinderGeometry( 0.0605, 0.0605, 0.12, 22, 1, true, - 0.6, 1.2 ).rotateZ( - PI / 2 ), flat( { bg: 0xf2f2f2, fg: 0x1a1a1a, band: 0x2a6ad6, text: 'CLEAR POLY', sub: '10 × 25 FT · 4 MIL', style: 'band', size: 0.3 } ) );
		return ground( g );
	} );

	reg( 'out_bucket', ( s ) => {
		const g = group(), c = s.color ?? 0xe8642a, m = M( c, { rough: 0.45 } );
		add( g, G.lathe( [ [ 0.125, 0 ], [ 0.148, 0.36 ] ], 30 ), M( c, { rough: 0.45, side: THREE.DoubleSide } ) );
		add( g, G.lathe( [ [ 0.146, 0.36 ], [ 0.123, 0.004 ] ], 30 ), M( shade( c, - 0.25 ), { rough: 0.5, side: THREE.DoubleSide } ) );
		add( g, disc( 0.125, 30 ), m, [ 0, 0.004, 0 ] );
		add( g, TORUS( 0.15, 0.007, 6, 36 ).rotateX( PI / 2 ), m, [ 0, 0.355, 0 ] );
		for ( const y of [ 0.29, 0.31 ] ) add( g, TORUS( 0.1455 - ( 0.36 - y ) * 0.06, 0.004, 4, 36 ).rotateX( PI / 2 ), m, [ 0, y, 0 ] );
		add( g, new THREE.CylinderGeometry( 0.1385, 0.1335, 0.11, 30, 1, true, - 0.7, 1.4 ), flat( { bg: c, fg: 0xffffff, band: 0xffffff, text: 'ALL PURPOSE', sub: '5 GAL · 19 L', style: 'plain', size: 0.3 }, { rough: 0.45 } ), [ 0, 0.16, 0 ] );
		// the wire bail and its grip
		add( g, tube( [ [ - 0.152, 0.3, 0 ], [ - 0.12, 0.42, 0 ], [ 0, 0.47, 0 ], [ 0.12, 0.42, 0 ], [ 0.152, 0.3, 0 ] ], 0.0025, 24, 5 ), steel() );
		add( g, CX( 0.011, 0.1, 10 ), plastic( 0x1a1a1a ), [ 0, 0.47, 0 ] );
		return ground( g );
	} );

	reg( 'out_waterbag', () => {
		const g = group(), canvas = fabric( 0xc8b48a, 'canvas', 0xffffff, { rep: 3, rough: 0.95 } );
		const body = G.rbox( 0.36, 0.1, 0.28, 0.045 ); body.translate( 0, - 0.05, 0 );
		add( g, body, canvas );
		add( g, B( 0.362, 0.006, 0.006 ), M( 0x8a7450, { rough: 0.9 } ), [ 0, 0, 0.14 ] );
		add( g, CX( 0.016, 0.05, 12 ), M( 0x2a2a2a, { rough: 0.6 } ), [ 0.19, 0.005, - 0.1 ] );
		add( g, CX( 0.018, 0.012, 12 ), dull(), [ 0.215, 0.005, - 0.1 ] );
		add( g, tube( [ [ - 0.14, 0.02, - 0.13 ], [ - 0.05, 0.03, - 0.17 ], [ 0.05, 0.03, - 0.17 ], [ 0.14, 0.02, - 0.13 ] ], 0.007, 14, 6 ), M( 0xc8b48a, { rough: 0.95 } ) );
		return ground( g );
	} );

	reg( 'out_bamboo_can', () => {
		const g = group();
		g.add( bambooPart( 0.042, 0.3, 0.26 ) );
		add( g, CX( 0.03, 0.04, 12, 0.034 ), wood( 0xb08a5a ), [ 0.162, 0, 0 ] );
		add( g, tube( [ [ - 0.12, 0.042, 0 ], [ - 0.04, 0.07, 0.01 ], [ 0.06, 0.07, 0.01 ], [ 0.13, 0.042, 0 ] ], 0.003, 14, 4 ), cord( 0x8a6a40 ) );
		for ( const x of [ - 0.12, 0.13 ] ) add( g, TORUS( 0.043, 0.003, 4, 18 ).rotateY( PI / 2 ), cord( 0x8a6a40 ), [ x, 0, 0 ] );
		return ground( g );
	} );

	// =================================== fishing ===================================

	reg( 'out_castnet', () => {
		const g = group();
		const net = cutout( 'castnet', netTex( '#e8eee6', 10, 2.4 ), { rough: 0.8 } );
		// the net gathered in a heap, the lead line in a ring round it, the hand line coiled beside it
		add( g, new THREE.ConeGeometry( 0.22, 0.14, 24, 4, true ), net, [ 0, 0.07, 0 ] );
		add( g, new THREE.ConeGeometry( 0.17, 0.11, 20, 3, true ), net, [ 0.01, 0.06, 0.01 ], [ 0, 0.5, 0 ] );
		add( g, TORUS( 0.215, 0.004, 4, 40 ).rotateX( PI / 2 ), cord( 0xe8eee6 ), [ 0, 0.006, 0 ] );
		const lead = M( 0x5a5c62, { rough: 0.5, metal: 0.4 } );
		for ( let i = 0; i < 20; i ++ ) { const a = i / 20 * PI * 2; add( g, C( 0.008, 0.008, 0.022, 8 ), lead, [ Math.cos( a ) * 0.215, 0.008, Math.sin( a ) * 0.215 ], [ PI / 2, - a, 0 ] ); }
		add( g, spiral( 0.03, 0.07, 3, 0.0025, 0.003 ), cord( 0xf2f2e8 ) );
		g.children.at( - 1 ).position.set( 0.3, 0, 0.05 );
		add( g, TORUS( 0.02, 0.004, 6, 16 ).rotateX( PI / 2 ), plastic( 0x1a1a1a ), [ 0, 0.142, 0 ] );
		return ground( g );
	} );

	reg( 'out_sling', () => {
		const g = group(), L = 1.25;
		// the shaft through the handle, the three-prong paralyser tip, the surgical tubing loop
		add( g, CX( 0.0045, L, 8 ), steel(), [ 0, 0.02, 0 ] );
		for ( const z of [ - 0.008, 0, 0.008 ] ) add( g, new THREE.ConeGeometry( 0.003, 0.06, 5 ).rotateZ( - PI / 2 ), steel(), [ L / 2 + 0.025, 0.02, z * 1.5 ] );
		add( g, CX( 0.012, 0.03, 8 ), steel(), [ L / 2 - 0.02, 0.02, 0 ] );
		add( g, CX( 0.02, 0.22, 16 ), wood( 0x6a3a1a, 0.45 ), [ - L / 2 + 0.2, 0.02, 0 ] );
		add( g, CX( 0.0215, 0.025, 16 ), M( 0x1a1a1a, { rough: 0.5 } ), [ - L / 2 + 0.31, 0.02, 0 ] );
		add( g, tube( [ [ - L / 2 + 0.31, 0.02, 0.02 ], [ - L / 2 + 0.38, 0.02, 0.09 ], [ - L / 2 + 0.47, 0.02, 0.0 ], [ - L / 2 + 0.38, 0.02, - 0.09 ], [ - L / 2 + 0.31, 0.02, - 0.02 ] ], 0.008, 28, 8 ), M( 0xe8962a, { rough: 0.35 } ) );
		add( g, B( 0.018, 0.006, 0.016 ), M( 0x2a2a2a ), [ - L / 2 + 0.47, 0.02, 0 ] );
		return ground( g );
	} );

	reg( 'out_speargun', () => {
		const g = group(), teak = wood( 0x8a5226, 0.45 ), blk = plastic( 0x1a1a1a, 0.5 );
		const S = 0.82;
		add( g, RB( S, 0.05, 0.04, 0.01 ), teak, [ 0, 0.075, 0 ] );
		add( g, RB( 0.06, 0.06, 0.044, 0.01 ), blk, [ S / 2 - 0.02, 0.08, 0 ] );
		// the pistol grip, the trigger and its guard, a line reel under the stock
		add( g, RB( 0.04, 0.13, 0.034, 0.012 ), blk, [ - S / 2 + 0.12, 0.0, 0 ], [ 0, 0, - 0.25 ] );
		add( g, B( 0.006, 0.028, 0.008 ), steel(), [ - S / 2 + 0.17, 0.035, 0 ] );
		add( g, tube( [ [ - S / 2 + 0.15, 0.05, 0 ], [ - S / 2 + 0.16, 0.02, 0 ], [ - S / 2 + 0.2, 0.02, 0 ], [ - S / 2 + 0.21, 0.05, 0 ] ], 0.003, 10, 4 ), blk );
		add( g, C( 0.035, 0.035, 0.025, 18 ).rotateX( PI / 2 ), blk, [ 0.05, 0.035, 0 ] );
		add( g, C( 0.03, 0.03, 0.027, 18 ).rotateX( PI / 2 ), M( 0xf2c21a, { rough: 0.4 } ), [ 0.05, 0.035, 0 ] );
		// the shaft on top with its flopper tip; two thick rubber bands stretched back to their wishbones
		add( g, CX( 0.004, 1.05, 8 ), steel(), [ 0.12, 0.106, 0 ] );
		add( g, new THREE.ConeGeometry( 0.005, 0.035, 6 ).rotateZ( - PI / 2 ), steel(), [ 0.662, 0.106, 0 ] );
		add( g, B( 0.035, 0.002, 0.005 ), steel(), [ 0.62, 0.11, 0 ], [ 0, 0, 0.3 ] );
		for ( const z of [ - 0.026, 0.026 ] ) {
			add( g, tube( [ [ S / 2 - 0.01, 0.09, z ], [ 0.15, 0.106, z * 0.75 ], [ - 0.06, 0.112, z * 0.3 ] ], 0.0095, 14, 8 ), M( z > 0 ? 0x1a1a1a : 0xb81a1a, { rough: 0.5 } ) );
		}
		add( g, tube( [ [ - 0.06, 0.112, - 0.01 ], [ - 0.06, 0.12, 0 ], [ - 0.06, 0.112, 0.01 ] ], 0.0022, 6, 4 ), steel() );
		return ground( g );
	} );

	reg( 'out_spool', () => {
		const g = group(), end = plastic( 0x1a1a1a, 0.4 );
		for ( const y of [ 0.002, 0.036 ] ) add( g, C( 0.038, 0.038, 0.004, 28 ), end, [ 0, y, 0 ] );
		add( g, C( 0.03, 0.03, 0.03, 28 ), M( 0x3a9a6a, { rough: 0.2 } ), [ 0, 0.019, 0 ] );
		add( g, C( 0.009, 0.009, 0.0405, 12 ), M( 0x8a8a8a ), [ 0, 0.019, 0 ] );
		add( g, B( 0.034, 0.0006, 0.018 ), flat( { bg: 0xf2c21a, fg: 0x1a1a1a, text: 'MONO 20 LB', sub: '300 YD', style: 'plain', size: 0.38, w: 256, h: 128 } ), [ 0.012, 0.0382, 0 ] );
		return ground( g );
	} );

	reg( 'out_makau', () => {
		const g = group(), bone = M( 0xe8dcc0, { rough: 0.55 } );
		add( g, tube( [ [ - 0.03, 0, 0 ], [ - 0.005, 0, 0.001 ], [ 0.012, 0, 0.004 ], [ 0.024, 0, 0.016 ], [ 0.02, 0, 0.03 ], [ 0.006, 0, 0.032 ], [ - 0.002, 0, 0.026 ] ], 0.0028, 24, 6 ), bone );
		add( g, new THREE.ConeGeometry( 0.0026, 0.008, 6 ).rotateZ( PI / 2 ).rotateY( 0.8 ), bone, [ - 0.004, 0, 0.022 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, TORUS( 0.0034, 0.0011, 4, 10 ).rotateY( PI / 2 ), cord( 0x5a3a1a ), [ - 0.029 + i * 0.002, 0, 0 ] );
		add( g, tube( [ [ - 0.03, 0, 0 ], [ - 0.045, 0.0, - 0.004 ], [ - 0.06, 0, 0.002 ] ], 0.0011, 8, 4 ), cord( 0x5a3a1a ) );
		return ground( g );
	} );

	reg( 'out_handline', () => {
		const g = group(), w = wood( 0x9a6a3a, 0.6 );
		add( g, RB( 0.16, 0.012, 0.045, 0.004 ), w );
		for ( const x of [ - 0.075, 0.075 ] ) add( g, RB( 0.018, 0.012, 0.07, 0.004 ), w, [ x, 0, 0 ] );
		add( g, RB( 0.13, 0.022, 0.05, 0.008 ), M( 0x3a9a6a, { rough: 0.25 } ), [ 0, 0.005, 0 ] );
		// a sinker and a hook trailing off it
		add( g, tube( [ [ 0.08, 0.0, 0.02 ], [ 0.11, 0.0, 0.05 ], [ 0.14, 0.0, 0.06 ] ], 0.0006, 10, 3 ), cord( 0xd8e8e0 ) );
		add( g, G.sph( 0.006, 10, 8 ), M( 0x5a5c62, { rough: 0.5, metal: 0.5 } ), [ 0.12, 0.0, 0.056 ] );
		add( g, tube( [ [ 0.14, 0, 0.06 ], [ 0.152, 0, 0.06 ], [ 0.158, 0, 0.068 ], [ 0.152, 0, 0.074 ] ], 0.0012, 10, 4 ), M( 0xe8dcc0, { rough: 0.55 } ) );
		return ground( g );
	} );

	reg( 'out_lure', () => {
		const g = group();
		// a Kona trolling lure: a pearl-insert resin head with eyes, a flared skirt of strands, the leader and hook
		add( g, G.lathe( [ [ 0, 0 ], [ 0.01, 0.006 ], [ 0.016, 0.03 ], [ 0.016, 0.06 ], [ 0.013, 0.066 ] ], 20 ).rotateZ( - PI / 2 ), M( 0x2a8ab8, { rough: 0.08, metal: 0.2 } ), [ 0.065, 0, 0 ] );
		add( g, CX( 0.0165, 0.012, 16 ), M( 0xe8d8f2, { rough: 0.15, metal: 0.7 } ), [ 0.025, 0, 0 ] );
		for ( const z of [ - 1, 1 ] ) {
			add( g, G.sph( 0.005, 10, 8 ), M( 0xf2d21a, { rough: 0.2 } ), [ 0.046, 0.006, z * 0.013 ] );
			add( g, G.sph( 0.0028, 8, 6 ), M( 0x0a0a0a, { rough: 0.1 } ), [ 0.048, 0.006, z * 0.0165 ] );
		}
		const cols = [ 0xe84a8a, 0x2a6ad6, 0xf2f2f2, 0xe84a8a, 0x2a6ad6, 0xf2c21a, 0xe84a8a, 0x2a6ad6, 0xf2f2f2, 0xe84a8a, 0x2a6ad6, 0xf2c21a ];
		cols.forEach( ( c, i ) => {
			const a = i / cols.length * PI * 2, sp = 0.012 + ( i % 2 ) * 0.004;
			add( g, tube( [ [ 0.015, Math.sin( a ) * 0.012, Math.cos( a ) * 0.012 ], [ - 0.03, Math.sin( a ) * ( 0.012 + sp ), Math.cos( a ) * ( 0.012 + sp ) ], [ - 0.075, Math.sin( a ) * ( 0.014 + sp * 2.2 ), Math.cos( a ) * ( 0.014 + sp * 2.2 ) ] ], 0.0026, 6, 4 ), M( c, { rough: 0.35 } ) );
		} );
		add( g, tube( [ [ - 0.06, 0, 0 ], [ - 0.085, 0, 0 ], [ - 0.098, 0, 0.012 ], [ - 0.09, 0, 0.022 ] ], 0.0022, 12, 5 ), steel() );
		add( g, CX( 0.0012, 0.1, 5 ), cord( 0xd8e8e8 ), [ 0.13, 0, 0 ] );
		return ground( g );
	} );

	reg( 'out_jig', () => {
		const g = group();
		const body = G.lathe( [ [ 0, 0 ], [ 0.006, 0.006 ], [ 0.009, 0.025 ], [ 0.008, 0.06 ], [ 0.004, 0.075 ], [ 0, 0.08 ] ], 14 ).rotateZ( PI / 2 );
		add( g, body, fabric( 0xf28a2a, 'stripes', 0xc85a1a, { rep: 2, rough: 0.8 } ), [ 0.04, 0, 0 ] );
		for ( const z of [ - 1, 1 ] ) add( g, G.sph( 0.003, 8, 6 ), M( 0x1a1a1a, { rough: 0.2 } ), [ - 0.026, 0.004, z * 0.006 ] );
		add( g, TORUS( 0.003, 0.001, 4, 10 ), steel(), [ - 0.042, 0, 0 ] );
		// the crown of fine barbless pins at the tail
		for ( let r = 0; r < 2; r ++ ) for ( let i = 0; i < 10; i ++ ) {
			const a = i / 10 * PI * 2 + r * 0.3, R = 0.004 + r * 0.004;
			add( g, tube( [ [ 0.04, Math.sin( a ) * R, Math.cos( a ) * R ], [ 0.05, Math.sin( a ) * ( R + 0.006 ), Math.cos( a ) * ( R + 0.006 ) ], [ 0.05, Math.sin( a ) * ( R + 0.01 ), Math.cos( a ) * ( R + 0.01 ) ] ], 0.0005, 4, 3 ), steel() );
		}
		return ground( g );
	} );

	reg( 'out_squid', ( s ) => {
		const g = group(), cooked = !! s.cooked;
		const skin = cooked ? M( 0xf2e8dc, { rough: 0.45 } ) : M( 0xffffff, { map: spotsTex( 'squid', 0xe8d8e0, 0x8a3a5a, 160, 2.5 ), rough: 0.25 } );
		// the mantle (tip at -x), fins, the head with eyes, the arms
		const mantle = G.lathe( [ [ 0, 0 ], [ 0.012, 0.02 ], [ 0.024, 0.08 ], [ 0.027, 0.15 ], [ 0.024, 0.17 ] ], 16 ).rotateZ( - PI / 2 );
		mantle.scale( 1, 0.75, 1 );
		add( g, mantle, skin, [ - 0.12, 0, 0 ] );
		const fin = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0.05, 0, 0 ), new THREE.Vector3( 0.01, 0, 0.035 ) ] ); fin.setIndex( [ 0, 1, 2 ] ); fin.computeVertexNormals();
		for ( const z of [ - 1, 1 ] ) add( g, fin, M( cooked ? 0xf2e0d0 : 0xe8c8d8, { rough: 0.3, side: THREE.DoubleSide } ), [ - 0.115, 0, z * 0.004 ], null, [ 1, 1, z ] );
		add( g, G.sph( 0.02, 12, 10 ), skin, [ 0.06, 0, 0 ], null, [ 1.1, 0.8, 0.9 ] );
		for ( const z of [ - 1, 1 ] ) add( g, G.sph( 0.006, 8, 6 ), M( cooked ? 0x5a4a4a : 0x0a0a12, { rough: 0.1 } ), [ 0.066, 0.006, z * 0.016 ] );
		const arm = M( cooked ? 0xe8b0a0 : 0xd8b0c8, { rough: 0.3 } );
		for ( let i = 0; i < 8; i ++ ) {
			const a = ( i / 7 - 0.5 ) * 1.2, L = 0.07 + ( i % 3 ) * 0.01, curl = cooked ? 0.03 : 0.01;
			add( g, tube( [ [ 0.075, 0, a * 0.012 ], [ 0.075 + L * 0.5, 0, a * 0.03 + curl ], [ 0.075 + L, 0, a * 0.05 - curl ] ], 0.003, 8, 4 ), arm );
		}
		for ( const z of [ - 1, 1 ] ) add( g, tube( [ [ 0.075, 0, z * 0.005 ], [ 0.13, 0, z * 0.02 ], [ 0.18, 0, z * 0.012 ] ], 0.0018, 10, 4 ), arm );
		return ground( g );
	} );

	reg( 'out_lobster', ( s ) => {
		const g = group(), cooked = !! s.cooked;
		const shell = cooked ? M( 0xffffff, { map: spotsTex( 'lobster_c', 0xd8401a, 0xf2a060, 60, 3 ), rough: 0.4 } ) : M( 0xffffff, { map: spotsTex( 'lobster', 0x5a2a3a, 0xe8c87a, 70, 2.5 ), rough: 0.35 } );
		const dark = M( cooked ? 0xb8301a : 0x3a1a24, { rough: 0.4 } );
		// carapace with spines, a segmented tail fanning out, ten legs, two long spiny antennae (no claws: ula)
		add( g, G.sph( 0.05, 16, 12 ), shell, [ 0.05, 0.038, 0 ], null, [ 1.6, 0.8, 0.9 ] );
		for ( let i = 0; i < 10; i ++ ) add( g, new THREE.ConeGeometry( 0.004, 0.014, 5 ), dark, [ 0.02 + ( i % 5 ) * 0.02, 0.064, ( i < 5 ? - 1 : 1 ) * 0.012 ], [ 0, 0, - 0.3 ] );
		for ( let i = 0; i < 5; i ++ ) add( g, RB( 0.03, 0.026 - i * 0.002, 0.07 - i * 0.006, 0.008 ), shell, [ - 0.035 - i * 0.026, 0.03 - i * 0.002, 0 ] );
		for ( const a of [ - 0.6, - 0.2, 0.2, 0.6 ] ) add( g, B( 0.04, 0.003, 0.022 ), dark, [ - 0.17, 0.02, a * 0.04 ], [ 0, a, 0 ] );
		for ( const z of [ - 1, 1 ] ) {
			add( g, tube( [ [ 0.11, 0.045, z * 0.015 ], [ 0.17, 0.06, z * 0.045 ], [ 0.21, 0.05, z * 0.09 ], [ 0.2, 0.03, z * 0.14 ] ], 0.007, 16, 6 ), dark );
			for ( let i = 0; i < 5; i ++ ) add( g, tube( [ [ 0.02 + i * 0.022, 0.02, z * 0.03 ], [ 0.03 + i * 0.024, 0.02, z * 0.07 ], [ 0.03 + i * 0.026, 0.0, z * 0.09 ] ], 0.0022, 6, 4 ), dark );
		}
		return ground( g );
	} );

	// the cord in a loose coil (laid out straight, its icon was a hairline), the steel needle and the ring
	reg( 'out_stringer', () => {
		const g = group(), pts = [];
		for ( let i = 0; i <= 40; i ++ ) { const a = i / 40 * PI * 2.6, r = 0.07 - i * 0.0006; pts.push( [ Math.cos( a ) * r - 0.02, 0.004 + i * 0.0002, Math.sin( a ) * r ] ); }
		pts.push( [ 0.08, 0.006, 0.03 ] );
		add( g, tube( pts, 0.004, 80, 5 ), fabric( 0xf2c21a, 'weave', 0xc89a1a, { rep: 20, rough: 0.9 } ) );
		add( g, CX( 0.003, 0.09, 8, 0.0015 ), steel(), [ 0.125, 0.006, 0.04 ], [ 0, - 0.22, 0 ] );
		add( g, new THREE.ConeGeometry( 0.003, 0.02, 6 ).rotateZ( - PI / 2 ), steel(), [ 0.178, 0.006, 0.052 ], [ 0, - 0.22, 0 ] );
		add( g, TORUS( 0.02, 0.003, 6, 20 ).rotateX( PI / 2 ), steel(), [ 0.05, 0.003, - 0.005 ] );
		return ground( g );
	} );

	reg( 'out_diveknife', () => {
		const g = group();
		// a stainless spear-point blade with a serrated spine, a yellow rubber grip, a butt cap
		const sh = new THREE.Shape();
		sh.moveTo( 0, - 0.013 ); sh.lineTo( 0.09, - 0.013 ); sh.quadraticCurveTo( 0.12, - 0.01, 0.13, 0 ); sh.lineTo( 0.1, 0.012 );
		for ( let i = 0; i < 8; i ++ ) { sh.lineTo( 0.095 - i * 0.011, 0.012 ); sh.lineTo( 0.09 - i * 0.011, 0.016 ); }
		sh.lineTo( 0, 0.014 ); sh.closePath();
		add( g, new THREE.ExtrudeGeometry( sh, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1 } ).rotateX( PI / 2 ), steel(), [ 0.0, 0.004, 0 ] );
		add( g, RB( 0.012, 0.012, 0.042, 0.003 ), plastic( 0x1a1a1a ), [ - 0.005, 0.006, 0 ] );
		add( g, RB( 0.1, 0.022, 0.03, 0.009 ), M( 0xf2c21a, { rough: 0.75 } ), [ - 0.062, 0.011, 0 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, B( 0.006, 0.023, 0.031 ), rubber(), [ - 0.095 + i * 0.02, 0.011, 0 ] );
		add( g, RB( 0.014, 0.02, 0.026, 0.004 ), steel(), [ - 0.118, 0.01, 0 ] );
		return ground( g );
	} );

	reg( 'out_ie', () => ieBasket() );

	reg( 'out_crabtrap', () => {
		const g = group();
		g.add( crabTrapBody() );
		// a coil of rope and an orange float beside it
		add( g, spiral( 0.04, 0.09, 3, 0.005, 0.005 ), cord( 0xd8c8a0 ), [ 0.45, 0, 0 ] );
		add( g, G.sph( 0.06, 14, 10 ), plastic( 0xf26a1a, 0.4 ), [ 0.45, 0.06, 0.13 ], null, [ 1, 1, 1.25 ] );
		return ground( g );
	} );

	// =================================== hunting ===================================

	reg( 'out_deercall', () => {
		const g = group();
		add( g, CX( 0.013, 0.11, 16 ), plastic( 0x1a1a1a, 0.45 ), [ 0, 0, 0 ] );
		add( g, CX( 0.0145, 0.025, 16 ), wood( 0x8a5a2a, 0.5 ), [ - 0.05, 0, 0 ] );
		add( g, G.lathe( [ [ 0.013, 0 ], [ 0.016, 0.02 ], [ 0.024, 0.04 ] ], 16 ).rotateZ( - PI / 2 ), plastic( 0x3a4a2a, 0.5 ), [ 0.055, 0, 0 ] );
		add( g, CX( 0.007, 0.03, 12 ), plastic( 0x1a1a1a, 0.4 ), [ - 0.075, 0, 0 ] );
		add( g, tube( [ [ - 0.06, 0.013, 0 ], [ - 0.03, 0.03, 0.03 ], [ 0.03, 0.03, 0.03 ], [ 0.05, 0.013, 0 ] ], 0.0015, 12, 4 ), cord( 0x3a5a2a ) );
		return ground( g );
	} );

	// a small welded-wire cage, its drop door up in the guides (flat-packed panels read as a grille, not a trap)
	reg( 'out_pigtrap_pack', () => {
		const g = group(), L = 0.95, W = 0.5, H = 0.48, rod = M( 0x5a6a5a, { rough: 0.5, metal: 0.6 } );
		for ( const z of [ - W / 2, W / 2 ] ) { const p = wirePanel( L, H ); p.position.set( 0, H / 2, z ); g.add( p ); }
		{ const top = wirePanel( L, W ); top.rotation.x = PI / 2; top.position.set( 0, H, 0 ); g.add( top ); }
		{ const back = wirePanel( W, H ); back.rotation.y = PI / 2; back.position.set( - L / 2, H / 2, 0 ); g.add( back ); }
		const door = wirePanel( W, H, true ); door.rotation.y = PI / 2; door.position.set( L / 2, H / 2 + H * 0.8, 0 ); g.add( door );
		for ( const z of [ - W / 2, W / 2 ] ) add( g, C( 0.01, 0.01, H * 1.9, 6 ), rod, [ L / 2 + 0.02, H * 0.95, z ] );
		// the trip rod and the carry handle
		add( g, tube( [ [ L / 2 - 0.05, H * 1.75, 0 ], [ 0.1, H + 0.04, 0 ], [ - 0.1, H * 0.4, 0 ] ], 0.004, 8, 4 ), rod );
		add( g, tube( [ [ - 0.12, H, 0 ], [ - 0.1, H + 0.08, 0 ], [ 0.1, H + 0.08, 0 ], [ 0.12, H, 0 ] ], 0.008, 10, 5 ), dull() );
		return ground( g );
	} );

	reg( 'out_skinknife', () => {
		const g = group();
		// a drop-point blade with a gut hook on the spine, a walnut handle with brass pins
		const sh = new THREE.Shape();
		sh.moveTo( 0, - 0.011 ); sh.lineTo( 0.06, - 0.013 ); sh.quadraticCurveTo( 0.1, - 0.008, 0.105, 0.004 ); sh.lineTo( 0.09, 0.006 );
		sh.quadraticCurveTo( 0.082, 0.0, 0.074, 0.01 ); sh.lineTo( 0.06, 0.013 ); sh.lineTo( 0, 0.013 ); sh.closePath();
		add( g, new THREE.ExtrudeGeometry( sh, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1 } ).rotateX( PI / 2 ), steel(), [ 0, 0.004, 0 ] );
		add( g, RB( 0.008, 0.012, 0.032, 0.002 ), M( 0xc8a24a, { rough: 0.3, metal: 0.9 } ), [ - 0.002, 0.006, 0 ] );
		add( g, RB( 0.1, 0.02, 0.028, 0.008 ), wood( 0x5a3218, 0.45 ), [ - 0.056, 0.01, 0 ] );
		for ( const x of [ - 0.03, - 0.08 ] ) add( g, C( 0.0028, 0.0028, 0.021, 8 ), M( 0xc8a24a, { rough: 0.3, metal: 0.9 } ), [ x, 0.01, 0 ] );
		return ground( g );
	} );

	reg( 'out_meathook', () => {
		const g = group(), m = steel();
		const pts = [];
		for ( let i = 0; i <= 24; i ++ ) { const a = PI * 0.15 + i / 24 * PI * 1.3; pts.push( [ 0.035 + Math.cos( a ) * 0.03, 0, Math.sin( a ) * 0.03 ] ); }
		for ( let i = 0; i <= 24; i ++ ) { const a = PI * 1.15 + i / 24 * PI * 1.3; pts.push( [ - 0.035 + Math.cos( a ) * 0.03, 0, Math.sin( a ) * 0.03 ] ); }
		add( g, tube( pts, 0.0035, 60, 6 ), m );
		return ground( g );
	} );

	reg( 'out_rack_bundle', () => {
		const g = group(), bark = wood( 0x6a4a2e, 0.95 );
		for ( let i = 0; i < 4; i ++ ) add( g, CX( 0.022, 1.5, 7 ), bark, [ 0, 0.022 + ( i >= 2 ? 0.04 : 0 ), ( i % 2 - 0.5 ) * 0.045 + ( i >= 2 ? 0.02 : 0 ) ], [ 0, ( i - 1.5 ) * 0.02, 0 ] );
		// the cross sticks laid over the poles (long enough that the icon looks down on the bundle)
		for ( let i = 0; i < 5; i ++ ) add( g, CX( 0.012, 0.74, 6 ), bark, [ ( i - 2 ) * 0.04, 0.09, 0 ], [ 0, PI / 2 + ( i - 2 ) * 0.05, 0 ] );
		for ( const x of [ - 0.5, 0.5 ] ) add( g, CX( 0.06, 0.03, 10 ), cord( 0xc8b07a ), [ x, 0.045, 0.01 ], null, [ 1, 0.9, 1.3 ] );
		return ground( g );
	} );

	reg( 'out_frame_bundle', () => {
		const g = group(), bark = wood( 0x7a5a38, 0.95 );
		for ( let i = 0; i < 4; i ++ ) add( g, CX( 0.025, 1.45, 7 ), bark, [ 0, 0.025 + ( i >= 2 ? 0.045 : 0 ), ( i % 2 - 0.5 ) * 0.05 + ( i >= 2 ? 0.024 : 0 ) ], [ 0, ( i - 1.5 ) * 0.015, 0 ] );
		// the two cross bars of the frame laid across the poles, crossed
		for ( const a of [ - 0.5, 0.5 ] ) add( g, CX( 0.02, 0.8, 7 ), bark, [ a * 0.2, 0.11, 0 ], [ 0, PI / 2 + a, 0 ] );
		add( g, spiral( 0.03, 0.08, 3, 0.005, 0.11 ), cord( 0xc8b07a ), [ 0.3, 0.02, 0 ] );
		for ( const x of [ - 0.45, 0.45 ] ) add( g, CX( 0.065, 0.03, 10 ), cord( 0xc8b07a ), [ x, 0.05, 0.012 ], null, [ 1, 0.9, 1.3 ] );
		return ground( g );
	} );

	// =================================== from the wild ===================================

	reg( 'out_husk', () => {
		const g = group(), out = M( 0x6a4a28, { rough: 0.85, side: THREE.DoubleSide } ), fib = M( 0xffffff, { map: fibreTex( 0xb08a5a ), rough: 1, side: THREE.DoubleSide } );
		// two wedges of husk torn off a coconut, fibre side up, and loose fibres
		for ( let i = 0; i < 2; i ++ ) {
			const w = group();
			add( w, G.sph( 0.1, 10, 8, 0, 1.0, 0.3, 2.3 ), out );
			add( w, G.sph( 0.075, 10, 8, 0, 1.0, 0.3, 2.3 ), fib );
			w.rotation.set( 0, i * 2.3, PI / 2 );
			w.position.set( i * 0.08 - 0.04, 0, i * 0.03 );
			w.scale.set( 1, 1, 1 );
			g.add( w );
		}
		for ( let i = 0; i < 6; i ++ ) add( g, tube( [ [ - 0.05 + i * 0.02, 0.005, 0.06 ], [ - 0.03 + i * 0.02, 0.004, 0.09 ], [ - 0.04 + i * 0.022, 0.003, 0.12 ] ], 0.0012, 6, 3 ), fib );
		return ground( g );
	} );

	reg( 'out_sennit', () => {
		const g = group(), m = M( 0xffffff, { map: fibreTex( 0x8a6438 ), rough: 0.95 } );
		add( g, spiral( 0.012, 0.055, 6, 0.0035, 0.004 ), m );
		add( g, spiral( 0.012, 0.05, 5, 0.0035, 0.011, 1 ), m );
		add( g, tube( [ [ 0.055, 0.004, 0 ], [ 0.08, 0.003, 0.02 ], [ 0.1, 0.003, 0.0 ] ], 0.0035, 8, 5 ), m );
		return ground( g );
	} );

	reg( 'out_shell', () => {
		const g = group(), R = 0.065;
		add( g, G.sph( R, 22, 12, 0, PI * 2, PI / 2, PI / 2 ), M( 0xffffff, { map: fibreTex( 0x5a3a20 ), rough: 0.95 } ), [ 0, R, 0 ] );
		add( g, G.sph( R * 0.93, 22, 12, 0, PI * 2, PI / 2, PI / 2 ), M( 0x3a2414, { rough: 0.55, side: THREE.BackSide } ), [ 0, R, 0 ] );
		add( g, TORUS( R * 0.965, R * 0.035, 5, 30 ).rotateX( PI / 2 ), M( 0x4a2e18, { rough: 0.6 } ), [ 0, R, 0 ] );
		return ground( g );
	} );

	reg( 'out_bamboo', () => ground( bambooPart( 0.024, 1.7 ) ) );

	reg( 'out_frond', () => ground( frondPart( 1.5 ) ) );

	reg( 'out_thatch', () => {
		const g = group();
		add( g, RB( 0.8, 0.028, 0.5, 0.008 ), fabric( 0xb8a060, 'weave', 0x8a7a40, { rep: 4, rough: 0.95 } ) );
		const leaf = cutout( 'leaflet:0x9a8a4a', leafletTex( 0x9a8a4a ), { rough: 0.8 } );
		const geo = new THREE.PlaneGeometry( 0.03, 0.2 ).translate( 0, 0.1, 0 ).rotateX( - PI / 2 );
		for ( let i = 0; i < 16; i ++ ) add( g, geo, leaf, [ - 0.38 + i * 0.05, 0.012, 0.25 ], [ 0, ( i % 3 - 1 ) * 0.15, 0 ] );
		return ground( g );
	} );

	reg( 'out_thatch_kit', () => {
		const g = group();
		const m = fabric( 0xb8a060, 'weave', 0x8a7a40, { rep: 4, rough: 0.95 } );
		for ( let i = 0; i < 3; i ++ ) add( g, RB( 0.8, 0.028, 0.66, 0.008 ), m, [ ( i - 1 ) * 0.02, 0.014 + i * 0.03, ( i - 1 ) * 0.02 ], [ 0, ( i - 1 ) * 0.05, 0 ] );
		for ( const z of [ - 0.12, 0.12 ] ) add( g, CX( 0.025, 1.4, 7 ), wood( 0x6a4a2e, 0.95 ), [ 0, 0.12, z ] );
		for ( const x of [ - 0.3, 0.3 ] ) add( g, TORUS( 0.08, 0.005, 4, 16 ).rotateY( PI / 2 ), M( 0xffffff, { map: fibreTex( 0x8a6438 ), rough: 0.95 } ), [ x, 0.06, 0 ], null, [ 1, 1.0, 4.3 ] );
		return ground( g );
	} );

	reg( 'out_frond_bundle', () => {
		const g = group();
		for ( let i = 0; i < 3; i ++ ) { const f = frondPart( 1.0, 16, 0x5a7a2a, 0.05 ); f.position.set( 0, i * 0.035, ( i - 1 ) * 0.03 ); f.rotation.y = ( i - 1 ) * 0.08; f.scale.set( 1, 1, 0.55 ); g.add( f ); }
		for ( const x of [ - 0.25, 0.25 ] ) add( g, TORUS( 0.05, 0.004, 4, 14 ).rotateY( PI / 2 ), M( 0xffffff, { map: fibreTex( 0x8a6438 ), rough: 0.95 } ), [ x, 0.05, 0 ], null, [ 1, 1, 2.6 ] );
		return ground( g );
	} );

	reg( 'out_adze', () => {
		const g = group(), haft = wood( 0x7a5030, 0.7 );
		// the koʻi: a haft with an angled foot, a ground basalt blade lashed to it with sennit
		add( g, tube( [ [ - 0.24, 0, 0 ], [ 0.0, 0, 0 ], [ 0.06, 0, 0.02 ], [ 0.09, 0, 0.07 ] ], 0.016, 16, 8 ), haft );
		const blade = facet( new THREE.BoxGeometry( 0.16, 0.03, 0.06, 1, 1, 1 ) );
		const p = blade.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) if ( p.getX( i ) > 0 ) p.setY( i, p.getY( i ) * 0.25 );
		blade.computeVertexNormals();
		add( g, blade, M( 0x2c2c2e, { rough: 0.35 } ), [ 0.12, 0.012, 0.09 ], [ 0, - 0.9, 0 ] );
		const sen = M( 0xffffff, { map: fibreTex( 0x8a6438 ), rough: 0.95 } );
		for ( let i = 0; i < 5; i ++ ) add( g, TORUS( 0.024, 0.004, 4, 14 ), sen, [ 0.065 + i * 0.008, 0.012, 0.035 + i * 0.012 ], [ 0, - 0.9, 0 ] );
		return ground( g );
	} );

	reg( 'out_flake', () => {
		// two struck basalt flakes: thin, sharp-edged, the ripples of the blow running out from the striking platform
		const g = group();
		const tex = canvasTex( 'out:basalt', 128, 128, ( ctx, w, h ) => {
			ctx.fillStyle = '#2a2a2c'; ctx.fillRect( 0, 0, w, h );
			for ( let i = 0; i < 9; i ++ ) { ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc( 0, h / 2, 14 + i * 13, - 1.2, 1.2 ); ctx.stroke(); }
			let s2 = 5; const R = () => ( s2 = ( s2 * 16807 ) % 2147483647 ) / 2147483647;
			for ( let i = 0; i < 300; i ++ ) { ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.2)'; ctx.fillRect( R() * w, R() * h, 1, 1 ); }
		} );
		const m = M( 0xffffff, { map: tex, rough: 0.32, metal: 0.05 } );
		for ( const [ x, z, a, sc ] of [ [ 0, 0, 0.2, 1 ], [ 0.075, 0.035, 1.9, 0.75 ] ] ) {
			const sh = new THREE.Shape();
			const pts = [ [ 0, - 0.012 ], [ 0.03, - 0.026 ], [ 0.07, - 0.024 ], [ 0.095, - 0.006 ], [ 0.09, 0.016 ], [ 0.06, 0.03 ], [ 0.025, 0.024 ], [ 0, 0.012 ] ];
			pts.forEach( ( [ px, py ], i ) => i ? sh.lineTo( px * sc, py * sc ) : sh.moveTo( px * sc, py * sc ) );
			const geo = new THREE.ExtrudeGeometry( sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 2 } ).rotateX( - PI / 2 );
			const p = geo.attributes.position, uv = geo.attributes.uv;
			// thick at the platform (x = 0), feathering to a sharp edge
			for ( let i = 0; i < p.count; i ++ ) { const px = p.getX( i ), t = Math.min( 1, px / ( 0.095 * sc ) ); p.setY( i, ( p.getY( i ) + 0.004 ) * ( 1 - t * 0.8 ) + Math.sin( px * 260 ) * 0.0006 ); uv.setXY( i, px / ( 0.1 * sc ), 0.5 + p.getZ( i ) / ( 0.06 * sc ) ); }
			geo.computeVertexNormals();
			add( g, facet( geo ), m, [ x, 0, z ], [ 0, a, 0 ] );
		}
		return ground( g );
	} );

	reg( 'out_bowdrill', () => {
		const g = group(), bark = wood( 0x7a5a38, 0.9 ), pale = wood( 0xc8a070, 0.85 );
		// the bow and its cord, the spindle, the fireboard with its charred notches, the bearing block
		const bow = [];
		for ( let i = 0; i <= 10; i ++ ) { const t = i / 10; bow.push( [ - 0.26 + t * 0.52, 0, Math.sin( t * PI ) * 0.06 ] ); }
		add( g, tube( bow, 0.009, 20, 6 ), bark );
		add( g, tube( [ [ - 0.255, 0, 0.004 ], [ 0, 0, 0.01 ], [ 0.255, 0, 0.004 ] ], 0.0015, 8, 4 ), cord( 0x2a2a2a ) );
		add( g, CX( 0.009, 0.22, 8 ), pale, [ 0.0, 0.0, - 0.06 ] );
		add( g, RB( 0.26, 0.016, 0.06, 0.003 ), M( 0xffffff, { map: charTex(), rough: 0.9 } ), [ 0.02, - 0.003, - 0.17 ] );
		add( g, RB( 0.06, 0.03, 0.05, 0.01 ), bark, [ - 0.2, 0.0, - 0.07 ] );
		return ground( g );
	} );

	reg( 'out_bamboo_spear', () => {
		const g = group(), L = 2.1;
		g.add( bambooPart( 0.02, L, 0.36 ) );
		// cut on a slant and fire-hardened at the tip, lashed below the cut
		add( g, new THREE.ConeGeometry( 0.02, 0.18, 10 ).rotateZ( - PI / 2 ), M( 0x5a4a1a, { rough: 0.6 } ), [ L / 2 + 0.09, 0, 0 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, TORUS( 0.021, 0.0025, 4, 14 ).rotateY( PI / 2 ), M( 0xffffff, { map: fibreTex( 0x8a6438 ), rough: 0.95 } ), [ L / 2 - 0.08 + i * 0.006, 0, 0 ] );
		return ground( g );
	} );

	// ---- the placed things' looks (ext/outdoors/kinds.js) ----
	Object.assign( OUT.look, LOOKS );
}

// ======================================================================================================================
// parts shared by the items and the placed looks
// ======================================================================================================================

// the conical ʻie basket lying on its side: open mouth at -x with an inner funnel, closed tip at +x
function ieBasket() {
	const g = group(), weave = cutout( 'ie', basketTex(), { rough: 0.85 } ), rib = M( 0x7a5a30, { rough: 0.85 } );
	const prof = [ [ 0.24, - 0.42 ], [ 0.23, - 0.2 ], [ 0.19, 0.05 ], [ 0.12, 0.28 ], [ 0.05, 0.42 ], [ 0.012, 0.47 ] ];
	add( g, G.lathe( prof, 24 ).rotateZ( - PI / 2 ), weave );
	add( g, new THREE.ConeGeometry( 0.22, 0.3, 20, 2, true ).rotateZ( PI / 2 ), weave, [ - 0.28, 0, 0 ] );
	add( g, TORUS( 0.24, 0.012, 6, 30 ).rotateY( PI / 2 ), rib, [ - 0.42, 0, 0 ] );
	for ( const [ x, r ] of [ [ - 0.2, 0.23 ], [ 0.05, 0.19 ], [ 0.28, 0.12 ] ] ) add( g, TORUS( r, 0.006, 5, 26 ).rotateY( PI / 2 ), rib, [ x, 0, 0 ] );
	return ground( g );
}

// a welded-wire panel in its own xy plane (w along x, h along y), a frame of rod round a mesh
function wirePanel( w, h, door = false ) {
	const g = group(), rod = M( 0x5a6a5a, { rough: 0.55, metal: 0.6 } );
	const mesh = cutout( 'pigwire', gridTex( '#6a7a6a', 5, 4 ), { rough: 0.6, metal: 0.5, repeat: [ 3, 2 ] } );
	add( g, new THREE.PlaneGeometry( w, h ), mesh );
	for ( const y of [ - h / 2, h / 2 ] ) add( g, CX( 0.007, w, 6 ), rod, [ 0, y, 0 ] );
	for ( const x of [ - w / 2, w / 2 ] ) add( g, C( 0.007, 0.007, h, 6 ), rod, [ x, 0, 0 ] );
	if ( door ) add( g, CX( 0.006, w * 0.9, 6 ), rod, [ 0, 0, 0.004 ] );
	return g;
}

// the crab trap: a wire box on runners with two funnel entrances and a bait cup
function crabTrapBody() {
	const g = group(), W = 0.6, H = 0.3, D = 0.45;
	const mesh = cutout( 'crabwire', gridTex( '#c0c4c4', 8, 3 ), { rough: 0.45, metal: 0.7 } );
	const rod = M( 0x8a8e90, { rough: 0.4, metal: 0.8 } );
	for ( const z of [ - D / 2, D / 2 ] ) add( g, new THREE.PlaneGeometry( W, H ), mesh, [ 0, H / 2, z ] );
	add( g, new THREE.PlaneGeometry( D, H ).rotateY( PI / 2 ), mesh, [ W / 2, H / 2, 0 ] );
	add( g, new THREE.PlaneGeometry( D, H ).rotateY( PI / 2 ), mesh, [ - W / 2, H / 2, 0 ] );
	add( g, new THREE.PlaneGeometry( W, D ).rotateX( PI / 2 ), mesh, [ 0, H, 0 ] );
	add( g, new THREE.PlaneGeometry( W, D ).rotateX( PI / 2 ), mesh, [ 0, 0.005, 0 ] );
	for ( const x of [ - W / 2, W / 2 ] ) for ( const z of [ - D / 2, D / 2 ] ) add( g, C( 0.006, 0.006, H, 6 ), rod, [ x, H / 2, z ] );
	for ( const y of [ 0, H ] ) for ( const z of [ - D / 2, D / 2 ] ) add( g, CX( 0.006, W, 6 ), rod, [ 0, y, z ] );
	for ( const y of [ 0, H ] ) for ( const x of [ - W / 2, W / 2 ] ) add( g, C( 0.006, 0.006, D, 6 ).rotateX( PI / 2 ), rod, [ x, y, 0 ] );
	for ( const x of [ - W / 2, W / 2 ] ) add( g, new THREE.ConeGeometry( 0.12, 0.2, 10, 1, true ).rotateZ( x > 0 ? PI / 2 : - PI / 2 ), mesh, [ x * 0.68, H * 0.5, 0 ] );
	add( g, C( 0.04, 0.04, 0.08, 10 ), plastic( 0xf2f2ee, 0.5 ), [ 0, H * 0.4, 0 ] );
	return g;
}

// ======================================================================================================================
// placed looks: cached per state, cloned per record (meshes merged per material once, except the parts a kind moves)
// ======================================================================================================================

const lookCache = new Map();
function cached( key, build ) {
	let t = lookCache.get( key );
	if ( ! t ) { t = build(); lookCache.set( key, t ); }
	return t.clone();
}
// merge the static parts, keep the rest (a float, a flame) as they are
function finish( stat, extra = null ) {
	const root = group();
	root.add( compact( stat ) );
	if ( extra ) for ( const c of [ ...extra.children ] ) root.add( c );
	return root;
}

// a float on a line: the kind puts it on the surface (userData.float)
function floatPart( c = 0xf26a1a ) {
	const f = group();
	add( f, G.sph( 0.07, 14, 10 ), plastic( c, 0.4 ), [ 0, 0.02, 0 ], null, [ 1, 0.8, 1 ] );
	add( f, C( 0.006, 0.006, 0.18, 6 ), plastic( 0x1a1a1a, 0.5 ), [ 0, 0.1, 0 ] );
	add( f, B( 0.08, 0.05, 0.002 ), plastic( 0xf2f2f2, 0.6 ), [ 0.04, 0.16, 0 ] );
	f.userData.keep = true;
	return f;
}

function trapLook( kind, p ) {
	const n = Math.min( 3, p.data?.catch?.length || 0 ), bait = !! p.data?.bait;
	const key = `${kind}:${n}:${bait}`;
	const obj = cached( key, () => {
		const stat = group();
		if ( kind === 'crab_trap' ) stat.add( crabTrapBody() );
		else stat.add( ieBasket() );
		// what is in it
		for ( let i = 0; i < n; i ++ ) {
			const f = smallFish( kind === 'crab_trap' ? 0x8a3a2a : [ 0x3a6a9a, 0xd8a03a, 0x5a8a5a ][ i ] );
			f.position.set( - 0.1 + i * 0.1, kind === 'crab_trap' ? 0.02 : 0.08, ( i - 1 ) * 0.05 );
			f.rotation.y = i * 1.3;
			if ( kind === 'crab_trap' ) f.scale.set( 0.7, 0.7, 1.6 );
			stat.add( f );
		}
		if ( bait ) add( stat, G.sph( 0.03, 8, 6 ), M( 0xe8d8d0, { rough: 0.6 } ), [ 0.1, 0.05, 0 ] );
		const extra = group();
		const fl = floatPart();
		fl.position.set( 0.15, 1, 0.25 );
		extra.add( fl );
		return finish( stat, extra );
	} );
	// the kind lifts it to the surface (show)
	obj.userData.float = obj.children.find( c => c.userData.keep ) || null;
	return obj;
}

function rackLook( p ) {
	const D = p.data || {}, load = D.load || [], lit = !! D.lit;
	const key = `rack:${load.map( e => ( e.done ? 'd' : 'r' ) + ( getItem( e.id )?.tags?.includes( 'fish' ) ? 'f' : 'm' ) ).join( '' )}:${lit}:${D.fuel > 0}:${D.hooks || 0}`;
	return cached( key, () => {
		const stat = group(), bark = wood( 0x5a3a22, 0.95 ), H = 1.25, W = 1.2;
		// two A-frames, a ridge pole, a grate of sticks below it; meat and fish hang from the ridge; a fire underneath
		for ( const x of [ - W / 2, W / 2 ] ) for ( const s of [ - 1, 1 ] ) add( stat, C( 0.02, 0.025, H * 1.08, 7 ), bark, [ x, H / 2, s * 0.2 ], [ s * 0.33, 0, 0 ] );
		add( stat, CX( 0.022, W + 0.2, 7 ), bark, [ 0, H, 0 ] );
		for ( const s of [ - 1, 1 ] ) add( stat, CX( 0.016, W + 0.1, 6 ), bark, [ 0, 0.55, s * 0.12 ] );
		for ( let i = 0; i < 9; i ++ ) add( stat, C( 0.008, 0.008, 0.28, 5 ).rotateX( PI / 2 ), bark, [ - 0.48 + i * 0.12, 0.565, 0 ] );
		const raw = M( 0x9a2a30, { rough: 0.6 } ), smoked = M( 0x5a2a14, { rough: 0.7 } ), fishRaw = M( 0x8aa0b0, { rough: 0.4 } ), fishSm = M( 0x8a5a24, { rough: 0.55 } );
		load.forEach( ( e, i ) => {
			const fish = getItem( e.id )?.tags?.includes( 'fish' );
			const x = - W / 2 + 0.18 + i * ( W - 0.36 ) / Math.max( 1, Math.max( SMOKE.cap, load.length ) - 1 );
			add( stat, C( 0.0015, 0.0015, 0.2, 4 ), cord( 0xc8b07a ), [ x, H - 0.1, 0 ] );
			const piece = fish ? G.sph( 0.05, 10, 8 ) : G.rbox( 0.08, 0.2, 0.04, 0.015 );
			if ( fish ) piece.scale( 0.45, 2.2, 1 );
			add( stat, piece, fish ? ( e.done ? fishSm : fishRaw ) : ( e.done ? smoked : raw ), [ x, fish ? H - 0.3 : H - 0.4, 0 ] );
		} );
		for ( let i = 0; i < ( D.hooks || 0 ); i ++ ) add( stat, TORUS( 0.02, 0.003, 4, 12, PI * 1.4 ), steel(), [ ( i ? 0.55 : - 0.55 ), H - 0.04, 0 ] );
		// the fire pit: stones, logs, embers when burning
		for ( let i = 0; i < 8; i ++ ) { const a = i / 8 * PI * 2; add( stat, facet( new THREE.IcosahedronGeometry( 0.06, 0 ) ), M( 0x4a4844, { rough: 0.95 } ), [ Math.cos( a ) * 0.28, 0.03, Math.sin( a ) * 0.22 ], null, [ 1.2, 0.7, 1 ] ); }
		if ( D.fuel > 0 || lit ) for ( let i = 0; i < 4; i ++ ) add( stat, CX( 0.03, 0.4, 7 ), wood( 0x3a2414 ), [ 0, 0.04 + ( i % 2 ) * 0.03, 0 ], [ 0, i * PI / 4, 0 ] );
		add( stat, disc( 0.2, 16 ), lit ? M( 0x2a1a10, { emissive: 0xff5a1a, emissiveIntensity: 1.4, rough: 1 } ) : M( 0x2a2622, { rough: 1 } ), [ 0, 0.012, 0 ] );
		const extra = group();
		if ( lit ) { const f = flame( 0.35 ); f.position.set( 0, 0.04, 0 ); extra.add( f ); }
		return finish( stat, extra );
	} );
}

function frameLook( p ) {
	const D = p.data || {};
	const cure = D.hide ? Math.min( 1, ( D.t || 0 ) / tanHours( D.salted ) ) : - 1;
	const stage = cure < 0 ? 'e' : cure >= 1 ? 'l' : cure > 0.5 ? 'h' : 'r';
	return cached( `frame:${stage}:${D.salted ? 1 : 0}`, () => {
		const stat = group(), bark = wood( 0x6a4a2e, 0.95 ), S = 1.3;
		// a square of poles lashed at the corners, leaning on two props
		const frame = group();
		for ( const y of [ 0, S ] ) add( frame, CX( 0.025, S + 0.2, 7 ), bark, [ 0, y, 0 ] );
		for ( const x of [ - S / 2, S / 2 ] ) add( frame, C( 0.025, 0.025, S + 0.2, 7 ), bark, [ x, S / 2, 0 ] );
		if ( stage !== 'e' ) {
			const col = stage === 'r' ? 0x8a4a3a : stage === 'h' ? 0xa87a5a : 0xc89a6a;
			const geo = new THREE.CircleGeometry( 0.42, 16 );
			const pos = geo.attributes.position;
			for ( let i = 1; i < pos.count; i ++ ) { const a = Math.atan2( pos.getY( i ), pos.getX( i ) ); const k = 1 + 0.22 * Math.sin( a * 4 ) + 0.08 * Math.sin( a * 7 ); pos.setXY( i, pos.getX( i ) * k * 1.15, pos.getY( i ) * k ); }
			add( frame, geo, M( col, { rough: stage === 'l' ? 0.7 : 0.9, side: THREE.DoubleSide } ), [ 0, S / 2, 0.005 ] );
			if ( D.salted && stage !== 'l' ) add( frame, new THREE.CircleGeometry( 0.25, 12 ), M( 0xe8e4dc, { rough: 1, side: THREE.DoubleSide } ), [ 0.05, S / 2, 0.008 ] );
			// the lacing out to the frame
			for ( let i = 0; i < 12; i ++ ) {
				const a = i / 12 * PI * 2, r = 0.42;
				const x0 = Math.cos( a ) * r * 1.1, y0 = Math.sin( a ) * r + S / 2;
				const x1 = Math.abs( Math.cos( a ) ) > Math.abs( Math.sin( a ) ) ? Math.sign( Math.cos( a ) ) * S / 2 : x0, y1 = Math.abs( Math.cos( a ) ) > Math.abs( Math.sin( a ) ) ? y0 : ( Math.sin( a ) > 0 ? S : 0 );
				add( frame, tube( [ [ x0, y0, 0.005 ], [ x1, y1, 0 ] ], 0.0025, 2, 3 ), cord( 0xc8b07a ) );
			}
		}
		frame.rotation.x = - 0.25;
		frame.position.y = 0.05;
		stat.add( frame );
		for ( const x of [ - S / 2, S / 2 ] ) add( stat, C( 0.02, 0.02, 1.1, 6 ), bark, [ x, 0.5, - 0.3 ], [ - 0.5, 0, 0 ] );
		return finish( stat );
	} );
}

function pigLook( p ) {
	const D = p.data || {}, pig = D.pig != null, set = !! D.set;
	return cached( `pig:${pig}:${set}:${!! D.bait}`, () => {
		const stat = group(), L = 1.5, W = 0.75, H = 0.8;
		for ( const z of [ - W / 2, W / 2 ] ) { const pnl = wirePanel( L, H ); pnl.position.set( 0, H / 2, z ); stat.add( pnl ); }
		{ const top = wirePanel( L, W ); top.rotation.x = PI / 2; top.position.set( 0, H, 0 ); stat.add( top ); }
		{ const back = wirePanel( W, H ); back.rotation.y = PI / 2; back.position.set( - L / 2, H / 2, 0 ); stat.add( back ); }
		// the drop door: up in its guides when set, down when sprung
		const door = wirePanel( W, H, true );
		door.rotation.y = PI / 2;
		door.position.set( L / 2, H / 2 + ( set ? H * 0.85 : 0 ), 0 );
		stat.add( door );
		for ( const z of [ - W / 2, W / 2 ] ) add( stat, C( 0.012, 0.012, H * 1.9, 6 ), M( 0x5a6a5a, { rough: 0.5, metal: 0.6 } ), [ L / 2 + 0.02, H * 0.95, z ] );
		if ( D.bait ) for ( let i = 0; i < 4; i ++ ) add( stat, G.sph( 0.05, 8, 6 ), M( [ 0xf2c21a, 0x6a3a1a, 0xe8642a, 0x8ac04a ][ i ], { rough: 0.6 } ), [ - 0.45 + ( i % 2 ) * 0.1, 0.05, ( i - 1.5 ) * 0.08 ] );
		if ( pig ) {
			// a black feral pig standing in the cage
			const hide = M( 0x2a2220, { rough: 0.9 } ), snout = M( 0x6a4a44, { rough: 0.7 } );
			const body = G.sph( 0.22, 14, 10 ); body.scale( 1.7, 1, 0.85 );
			add( stat, body, hide, [ 0, 0.4, 0 ] );
			add( stat, G.sph( 0.13, 12, 10 ), hide, [ 0.38, 0.42, 0 ], null, [ 1.3, 1, 0.9 ] );
			add( stat, C( 0.05, 0.06, 0.08, 10 ).rotateZ( PI / 2 ), snout, [ 0.55, 0.38, 0 ] );
			for ( const z of [ - 1, 1 ] ) add( stat, new THREE.ConeGeometry( 0.04, 0.08, 5 ), hide, [ 0.38, 0.55, z * 0.06 ], [ 0, 0, - 0.4 ] );
			for ( const [ x, z ] of [ [ 0.22, 0.1 ], [ 0.22, - 0.1 ], [ - 0.22, 0.1 ], [ - 0.22, - 0.1 ] ] ) add( stat, C( 0.035, 0.03, 0.26, 7 ), hide, [ x, 0.13, z ] );
		}
		return finish( stat );
	} );
}

function stillLook( p ) {
	const D = p.data || {}, L = Math.round( ( D.L || 0 ) / STILL.cap * 4 ), sea = ( D.sea || 0 ) > 0.05;
	return cached( `still:${L}:${sea}`, () => {
		const stat = group(), soil = M( 0x6a5438, { rough: 1 } );
		// the pit and its heaped spoil, the clear sheet sagging to a stone over the cup, rocks weighing the edge
		add( stat, disc( 0.62, 24 ), M( 0x6a5a44, { rough: 1 } ), [ 0, 0.004, 0 ] );
		for ( let i = 0; i < 14; i ++ ) {
			const a = i / 14 * PI * 2 + ( i % 3 ) * 0.1, d = 0.74 + ( i % 2 ) * 0.06;
			add( stat, facet( new THREE.IcosahedronGeometry( 0.13 + ( i % 3 ) * 0.03, 1 ) ), soil, [ Math.cos( a ) * d, 0.0, Math.sin( a ) * d ], null, [ 1.3, 0.38, 1 ] );
		}
		add( stat, new THREE.ConeGeometry( 0.64, 0.24, 28, 2, true ).rotateX( PI ), M( 0xf2f8fa, { rough: 0.05, metal: 0.25, transparent: true, opacity: 0.6, side: THREE.DoubleSide } ), [ 0, - 0.06, 0 ] );
		add( stat, facet( new THREE.IcosahedronGeometry( 0.05, 0 ) ), M( 0x5a5650, { rough: 0.95 } ), [ 0, - 0.14, 0 ] );
		add( stat, C( 0.05, 0.045, 0.1, 14, true ), MAT.tin(), [ 0, - 0.24, 0 ] );
		if ( L > 0 ) add( stat, C( 0.046, 0.046, 0.003, 14 ), M( 0x2a4850, { rough: 0.05 } ), [ 0, - 0.29 + L * 0.02, 0 ] );
		if ( sea ) add( stat, new THREE.RingGeometry( 0.12, 0.5, 24 ).rotateX( - PI / 2 ), M( 0x2a4a5a, { rough: 0.05, metal: 0.1 } ), [ 0, - 0.17, 0 ] );
		for ( let i = 0; i < 9; i ++ ) { const a = i / 9 * PI * 2 + 0.2; add( stat, facet( new THREE.IcosahedronGeometry( 0.075, 0 ) ), M( 0x5a5650, { rough: 0.95 } ), [ Math.cos( a ) * 0.63, 0.04, Math.sin( a ) * 0.63 ], null, [ 1.2, 0.7, 1 ] ); }
		add( stat, tube( [ [ 0, - 0.2, 0 ], [ 0.3, 0.02, 0.1 ], [ 0.7, 0.1, 0.2 ], [ 0.9, 0.04, 0.25 ] ], 0.007, 14, 6 ), M( 0xe8f2ee, { rough: 0.2 } ) );
		return finish( stat );
	} );
}

function leanLook( p ) {
	const shape = getItem( p.item )?.place?.shape || 'tarp';
	return cached( `lean:${shape}`, () => {
		const stat = group(), bark = wood( 0x6a4a2e, 0.95 ), W = 2.6, H = 1.4, Dp = 1.8;
		// two poles holding a ridge line; the roof slopes back to the ground and is staked
		if ( shape === 'tarp' ) {
			for ( const x of [ - W / 2, W / 2 ] ) add( stat, C( 0.015, 0.015, H, 8 ), M( 0x9aa0a8, { rough: 0.3, metal: 0.8 } ), [ x, H / 2, 0 ] );
			// the ridge line over the poles and guyed out to stakes either side
			add( stat, CX( 0.004, W, 4 ), cord( 0xd8c8a0 ), [ 0, H, 0 ] );
			for ( const s of [ - 1, 1 ] ) {
				const dx = 0.7, L = Math.hypot( dx, H );
				add( stat, C( 0.004, 0.004, L, 4 ), cord( 0xd8c8a0 ), [ s * ( W / 2 + dx / 2 ), H / 2, 0 ], [ 0, 0, s * Math.atan2( dx, H ) ] );
				add( stat, new THREE.ConeGeometry( 0.01, 0.15, 6 ).rotateX( PI ), plastic( 0xe8641a ), [ s * ( W / 2 + dx ), 0.03, 0 ] );
			}
			const roof = new THREE.PlaneGeometry( W + 0.1, Math.hypot( H, Dp ), 6, 4 );
			const pos = roof.attributes.position;
			for ( let i = 0; i < pos.count; i ++ ) { const x = pos.getX( i ) / ( W / 2 ); pos.setZ( i, - 0.06 * ( 1 - x * x ) ); }
			roof.computeVertexNormals();
			add( stat, roof, M( 0x2a5aa8, { rough: 0.6, side: THREE.DoubleSide } ), [ 0, H / 2, - Dp / 2 ], [ Math.atan2( Dp, H ), 0, 0 ] );
			for ( const x of [ - W / 2, 0, W / 2 ] ) add( stat, new THREE.ConeGeometry( 0.01, 0.15, 6 ).rotateX( PI ), plastic( 0xe8641a ), [ x, 0.03, - Dp - 0.05 ] );
		} else {
			for ( const x of [ - W / 2, W / 2 ] ) add( stat, C( 0.03, 0.035, H * 1.05, 7 ), bark, [ x, H / 2, 0 ] );
			add( stat, CX( 0.03, W + 0.3, 7 ), bark, [ 0, H, 0 ] );
			for ( const x of [ - W / 2, 0, W / 2 ] ) add( stat, C( 0.022, 0.022, Math.hypot( H, Dp ) + 0.1, 6 ), bark, [ x, H / 2, - Dp / 2 ], [ Math.atan2( Dp, H ), 0, 0 ] );
			const th = fabric( 0xb8a060, 'weave', 0x8a7a40, { rep: 6, rough: 0.95 } );
			// three thatch panels down the slope, overlapping like shingles
			for ( let i = 0; i < 3; i ++ ) {
				const t = 0.17 + i * 0.33;
				add( stat, RB( W, 0.03, 0.85, 0.01 ), th, [ 0, H * ( 1 - t ) + 0.03, - Dp * t ], [ - Math.atan2( H, Dp ), 0, 0 ] );
			}
		}
		return finish( stat );
	} );
}

function hammockLook() {
	return cached( 'hammock', () => {
		const stat = group(), post = wood( 0x6a4a2e, 0.9 ), Lh = 2.6;
		// two posts, straps, the hammock sagging between them
		for ( const x of [ - Lh / 2 - 0.25, Lh / 2 + 0.25 ] ) { add( stat, C( 0.05, 0.06, 1.6, 8 ), post, [ x, 0.8, 0 ] ); add( stat, C( 0.052, 0.052, 0.05, 8 ), M( 0x1a1a1a, { rough: 0.8 } ), [ x, 1.35, 0 ] ); }
		for ( const s of [ - 1, 1 ] ) add( stat, tube( [ [ s * ( Lh / 2 + 0.25 ), 1.35, 0 ], [ s * ( Lh / 2 + 0.05 ), 1.15, 0 ], [ s * ( Lh / 2 - 0.15 ), 1.0, 0 ] ], 0.008, 6, 4 ), cord( 0x1a1a1a ) );
		const geo = new THREE.PlaneGeometry( Lh - 0.3, 0.9, 16, 6 );
		const pos = geo.attributes.position;
		for ( let i = 0; i < pos.count; i ++ ) { const x = pos.getX( i ) / ( ( Lh - 0.3 ) / 2 ), y = pos.getY( i ) / 0.45; const w = 1 - Math.abs( x ) * 0.55; pos.setXYZ( i, pos.getX( i ), - 0.45 * ( 1 - x * x ) - 0.08 * ( 1 - y * y ), pos.getY( i ) * w ); }
		geo.computeVertexNormals();
		add( stat, geo, M( 0xffffff, { map: fabric( 0x2a8aa8, 'stripes', 0xe8c84a, { rep: 3 } ).map, rough: 0.8, side: THREE.DoubleSide } ), [ 0, 1.0, 0 ] );
		return finish( stat );
	} );
}

function chairLook() {
	return cached( 'chair', () => {
		const stat = group(), frame = M( 0x2a2a2a, { rough: 0.35, metal: 0.7 } ), seat = fabric( 0x1f5a3a, 'canvas', 0xffffff, { rep: 2, rough: 0.85 } );
		// the folding quad chair: X-braced legs, a sagging seat and back, armrests with a cup holder
		for ( const [ x, z ] of [ [ - 0.25, - 0.25 ], [ 0.25, - 0.25 ], [ - 0.25, 0.25 ], [ 0.25, 0.25 ] ] ) add( stat, C( 0.01, 0.01, 0.48, 6 ), frame, [ x, 0.24, z ] );
		for ( const z of [ - 0.25, 0.25 ] ) for ( const s of [ - 1, 1 ] ) add( stat, C( 0.008, 0.008, 0.68, 6 ), frame, [ 0, 0.24, z ], [ 0, 0, s * 0.82 ] );
		for ( const x of [ - 0.25, 0.25 ] ) for ( const s of [ - 1, 1 ] ) add( stat, C( 0.008, 0.008, 0.68, 6 ), frame, [ x, 0.24, 0 ], [ s * 0.82, 0, 0 ] );
		const sg = new THREE.PlaneGeometry( 0.52, 0.5, 6, 6 ).rotateX( - PI / 2 );
		const sp = sg.attributes.position;
		for ( let i = 0; i < sp.count; i ++ ) { const x = sp.getX( i ) / 0.26, z = sp.getZ( i ) / 0.25; sp.setY( i, - 0.05 * ( 1 - x * x ) * ( 1 - z * z ) ); }
		sg.computeVertexNormals();
		add( stat, sg, seat, [ 0, 0.46, 0 ] );
		add( stat, new THREE.PlaneGeometry( 0.52, 0.45 ), seat, [ 0, 0.7, - 0.27 ], [ - 0.2, 0, 0 ] );
		for ( const x of [ - 0.25, 0.25 ] ) { add( stat, C( 0.01, 0.01, 0.5, 6 ), frame, [ x, 0.72, - 0.27 ], [ - 0.2, 0, 0 ] ); add( stat, CX( 0.012, 0.5, 6 ).rotateY( PI / 2 ), frame, [ x, 0.62, 0 ] ); }
		add( stat, C( 0.035, 0.03, 0.06, 12, true ), M( 0x1a1a1a, { rough: 0.7, side: THREE.DoubleSide } ), [ 0.3, 0.6, 0.15 ] );
		return finish( stat );
	} );
}

function bedLook( p ) {
	const shape = getItem( p.item )?.place?.shape || 'pad';
	return cached( `bed:${shape}`, () => {
		const stat = group();
		if ( shape === 'fronds' ) {
			// fronds laid crosswise, a thick soft heap off the damp ground
			for ( let i = 0; i < 6; i ++ ) { const f = frondPart( 1.9, 18, i % 2 ? 0x5a7a2a : 0x6a7a32, 0.02 ); f.position.set( 0, i * 0.03, ( i - 2.5 ) * 0.1 ); f.rotation.y = ( i % 2 ? 0.1 : - 0.1 ); f.scale.set( 1, 1, 1.4 ); stat.add( f ); }
		} else {
			const padM = M( 0xffffff, { map: ridgeTex( 0xd8a82a ), rough: 0.9 } );
			add( stat, RB( 1.85, 0.02, 0.55, 0.008 ), padM, [ 0, 0.01, 0 ] );
			if ( shape === 'bedroll' ) {
				// the sleeping bag on the pad, opened at the head, the hood bunched
				const bag = fabric( 0x2a4a8a, 'stripes', 0x1a3a6a, { rep: 4, rough: 0.75 } );
				add( stat, RB( 1.75, 0.12, 0.72, 0.05 ), bag, [ 0, 0.08, 0 ], null, [ 1, 1, 0.75 ] );
				add( stat, G.capsX( 0.07, 0.48, 10 ).rotateY( PI / 2 ), bag, [ - 0.78, 0.12, 0 ] );
				add( stat, B( 0.4, 0.004, 0.5 ), M( 0x1a3a6a, { rough: 0.8 } ), [ 0.5, 0.145, 0 ] );
			}
		}
		return finish( stat );
	} );
}

function coilLook( p ) {
	const D = p.data || {}, burnt = ( D.left ?? 1 ) <= 0, lit = !! D.lit;
	return cached( `coil:${burnt}:${lit}`, () => {
		const stat = group();
		const m = burnt ? M( 0xb8b4ac, { rough: 1 } ) : M( 0x3a6a2a, { rough: 0.95 } );
		add( stat, spiral( 0.006, 0.058, 4.2, 0.0028, 0.03, 0 ), m );
		add( stat, spiral( 0.006, 0.058, 4.2, 0.0028, 0.03, PI ), m );
		add( stat, B( 0.05, 0.002, 0.012 ), dull(), [ 0, 0.001, 0 ] );
		add( stat, B( 0.012, 0.002, 0.05 ), dull(), [ 0, 0.001, 0 ] );
		add( stat, C( 0.0015, 0.0015, 0.04, 6 ), dull(), [ 0, 0.02, 0 ] );
		add( stat, disc( 0.07, 16 ), M( 0x8a8478, { rough: 1 } ), [ 0, 0.002, 0 ] );
		const extra = group();
		if ( lit ) {
			add( extra, G.sph( 0.004, 8, 6 ), M( 0xff5a1a, { emissive: 0xff5a1a, emissiveIntensity: 3, rough: 1 } ), [ 0.058, 0.03, 0 ] );
			const gl = glowSprite( 0xff6a2a, 0.12 ); gl.position.set( 0.058, 0.03, 0 ); extra.add( gl );
		}
		return finish( stat, extra );
	} );
}

const LOOKS = {
	fish_trap: ( p ) => trapLook( 'fish_trap', p ),
	crab_trap: ( p ) => trapLook( 'crab_trap', p ),
	smoking_rack: rackLook,
	tanning_frame: frameLook,
	pig_trap: pigLook,
	solar_still: stillLook,
	lean_to: leanLook,
	hammock: hammockLook,
	camp_seat: chairLook,
	camp_bed: bedLook,
	mosquito_coil: coilLook,
};

