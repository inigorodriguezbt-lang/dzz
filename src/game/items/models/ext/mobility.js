// Model builders for the mobility equipment (defs/ext/mobility.js). register( reg ) is called once by
// render/ItemModels.js. Real sizes, origin at the centre of the bottom, long axis along +x (ItemModels.js conventions).
// Also here, for the runtime (ext/mobility/kinds.js MOB): the looks of the placed things (a rope down a wall, a ladder
// leant on it, a rope ladder, a zipline, carts standing about, a board afloat, a canopy spread on the grass) and the
// visuals of the modes (the wing over you, the reserve, a board under you, a trolley on the cable, the hook in flight,
// the paddle and the brake toggles in your hands).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, MAT, G, PI, add, group, ground, canvasTex, css, shade, glyph, fabric } from '../lib.js';
import { MOB } from '../../ext/mobility/kinds.js';
import { LADDERS, ZIP, zipShape } from '../../ext/mobility/logic.js';
import { compact } from '../../placeables/merge.js';
import { ghostify, itemModel } from '../../placeables/fx.js';
import { getItem } from '../../ItemDB.js';
import { setDynamic } from '../../../../render/post/Motion.js';
import { itemsOf } from '../../../Inventory.js';
import { modelInfo } from '../../../../render/ItemModels.js';

const V = ( x = 0, y = 0, z = 0 ) => new THREE.Vector3( x, y, z );
const UP = V( 0, 1, 0 );
const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
const smooth = ( t ) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * ( 3 - 2 * t );
function rng( seed ) {
	let s = ( seed >>> 0 ) || 7;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; };
}
const tx = ( key, w, h, draw, o ) => canvasTex( 'mob:' + key, w, h, draw, o );
function fit( ctx, text, maxW, size, weight = '900', family = 'Arial, Helvetica, sans-serif' ) {
	let s = size;
	ctx.font = `${weight} ${s}px ${family}`;
	while ( s > 8 && ctx.measureText( text ).width > maxW ) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
	return s;
}
const text = ( ctx, t, x, y, maxW, size, color, o = {} ) => {
	fit( ctx, t, maxW, size, o.weight || '900', o.family );
	ctx.fillStyle = css( color ); ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
	if ( o.stroke ) { ctx.lineWidth = o.lw || 6; ctx.strokeStyle = css( o.stroke ); ctx.strokeText( t, x, y ); }
	ctx.fillText( t, x, y );
};

// ---- materials ------------------------------------------------------------------------------------------------------

const MT = {
	alu: () => M( 0xc4c9cf, { rough: 0.34, metal: 0.85 } ),
	aluDark: () => M( 0x55595f, { rough: 0.4, metal: 0.8 } ),
	chrome: () => M( 0xdfe3e8, { rough: 0.16, metal: 1 } ),
	steel: () => M( 0x8a8e94, { rough: 0.38, metal: 0.9 } ),
	galv: () => M( 0xa9adb0, { rough: 0.5, metal: 0.75 } ),
	black: () => M( 0x18191b, { rough: 0.55 } ),
	rubber: () => M( 0x141414, { rough: 0.92 } ),
	tyre: () => M( 0x1c1c1c, { rough: 0.88 } ),
	plastic: ( c ) => M( c, { rough: 0.42 } ),
	paint: ( c ) => M( c, { rough: 0.38, metal: 0.25 } ),
	matte: ( c ) => M( c, { rough: 0.85 } ),
	web: ( c ) => fabric( c, 'weave', shade( c, - 0.25 ), { rep: 6, rough: 0.85 } ),
	nylon: ( c ) => fabric( c, 'canvas', 0xffffff, { rep: 3, rough: 0.8 } ),
};

// ---- geometry helpers -----------------------------------------------------------------------------------------------

// a round bar from a to b
function barGeo( a, b, r, seg = 8, r2 = r ) {
	const A = a.isVector3 ? a : V( ...a ), B = b.isVector3 ? b : V( ...b );
	const d = B.clone().sub( A ), L = d.length();
	const geo = new THREE.CylinderGeometry( r2, r, L, seg, 1, false );
	geo.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( UP, d.normalize() ) );
	geo.translate( ( A.x + B.x ) / 2, ( A.y + B.y ) / 2, ( A.z + B.z ) / 2 );
	return geo;
}
// a box from a to b with a w (across, toward `side`) x h cross-section
function beamGeo( a, b, w, h, side = [ 0, 0, 1 ] ) {
	const A = a.isVector3 ? a : V( ...a ), B = b.isVector3 ? b : V( ...b );
	const X = B.clone().sub( A ), L = X.length();
	X.normalize();
	const Z = V( ...side ).addScaledVector( X, - V( ...side ).dot( X ) ).normalize();
	const Y = Z.clone().cross( X ).normalize();
	const geo = new THREE.BoxGeometry( L, h, w );
	geo.applyMatrix4( new THREE.Matrix4().makeBasis( X, Y, Z ) );
	geo.translate( ( A.x + B.x ) / 2, ( A.y + B.y ) / 2, ( A.z + B.z ) / 2 );
	return geo;
}
const tubeGeo = ( pts, r, seg = 24, rs = 8, closed = false ) => new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts.map( p => p.isVector3 ? p : V( ...p ) ), closed ), seg, r, rs, closed );
// many geometries as one mesh
function merged( g, geos, mat, p = null, r = null ) {
	const list = geos.filter( Boolean ).map( x => x.index ? x.toNonIndexed() : x );
	for ( const x of list ) { for ( const k of Object.keys( x.attributes ) ) if ( ! [ 'position', 'normal', 'uv' ].includes( k ) ) x.deleteAttribute( k ); if ( ! x.attributes.uv ) x.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( x.attributes.position.count * 2 ), 2 ) ); }
	if ( ! list.length ) return null;
	return add( g, list.length > 1 ? mergeGeometries( list ) : list[ 0 ], mat, p, r );
}
// a flat strap along a polyline (w wide, t thick), its face turned towards `side`
function strapGeo( pts, w, t = 0.003, side = [ 0, 1, 0 ] ) {
	const out = [];
	for ( let i = 1; i < pts.length; i ++ ) out.push( beamGeo( pts[ i - 1 ], pts[ i ], w, t, side ) );
	return mergeGeometries( out.map( x => x.toNonIndexed() ) );
}

// A slab over a parametric outline (decks and boards): t 0..1 along x from -L/2 to L/2, s -1..1 across; hw( t ) the
// half width, yf( t, s ) the top surface's height, T the thickness, rr the rail's rounding. -> { top, bottom, rim }
// (the top's UVs run 0..1 along and across: the art goes on it)
function pslab( L, hw, yf, T, o = {} ) {
	const N = o.N ?? 48, Mc = o.M ?? 8, K = o.K ?? 2, rr = o.rr ?? Math.min( T * 0.5, 0.004 );
	const grid = ( down ) => {
		const pos = [], uv = [], idx = [];
		for ( let i = 0; i <= N; i ++ ) {
			const t = i / N;
			for ( let j = 0; j <= Mc; j ++ ) {
				const s = j / Mc * 2 - 1;
				pos.push( ( t - 0.5 ) * L, yf( t, s ) - ( down ? T : 0 ), s * hw( t ) );
				// (art reads the right way round seen from above, and from below for the bottom)
				uv.push( down ? 1 - t : t, ( 1 - s ) / 2 );
			}
		}
		for ( let i = 0; i < N; i ++ ) for ( let j = 0; j < Mc; j ++ ) {
			const a = i * ( Mc + 1 ) + j, b = a + Mc + 1;
			// (the top faces up, the bottom down)
			if ( down ) idx.push( a, b, a + 1, b, b + 1, a + 1 ); else idx.push( a, a + 1, b, b, a + 1, b + 1 );
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
		geo.setIndex( idx );
		geo.computeVertexNormals();
		return geo;
	};
	// the rim: round the border, a rounded profile from the top's edge to the bottom's
	const border = [];
	for ( let i = 0; i <= N; i ++ ) border.push( [ i / N, - 1 ] );
	for ( let j = 1; j <= Mc; j ++ ) border.push( [ 1, j / Mc * 2 - 1 ] );
	for ( let i = N - 1; i >= 0; i -- ) border.push( [ i / N, 1 ] );
	for ( let j = Mc - 1; j >= 1; j -- ) border.push( [ 0, j / Mc * 2 - 1 ] );
	const P0 = border.map( ( [ t, s ] ) => V( ( t - 0.5 ) * L, yf( t, s ), s * hw( t ) ) );
	const pos = [], uv = [], idx = [];
	const nb = border.length;
	for ( let b = 0; b < nb; b ++ ) {
		const p = P0[ b ], pn = P0[ ( b + 1 ) % nb ], pp = P0[ ( b - 1 + nb ) % nb ];
		const tx0 = pn.x - pp.x, tz0 = pn.z - pp.z, tl = Math.hypot( tx0, tz0 ) || 1;
		// outward: the border runs anticlockwise seen from above... check against the centre
		let nx = tz0 / tl, nz = - tx0 / tl;
		if ( nx * p.x + nz * p.z < 0 && Math.hypot( p.x, p.z ) > 1e-4 ) { nx = - nx; nz = - nz; }
		for ( let k = 0; k <= K; k ++ ) {
			const a = k / K * PI;
			pos.push( p.x + nx * rr * Math.sin( a ), p.y - T * ( 1 - Math.cos( a ) ) / 2, p.z + nz * rr * Math.sin( a ) );
			uv.push( b / nb, k / K );
		}
	}
	for ( let b = 0; b < nb; b ++ ) {
		const b2 = ( b + 1 ) % nb;
		for ( let k = 0; k < K; k ++ ) {
			const a = b * ( K + 1 ) + k, c = b2 * ( K + 1 ) + k;
			idx.push( a, c, a + 1, c, c + 1, a + 1 );
		}
	}
	const rim = new THREE.BufferGeometry();
	rim.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	rim.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	rim.setIndex( idx );
	rim.computeVertexNormals();
	return { top: grid( false ), bottom: grid( true ), rim };
}
// a patch lying on a slab's top (a deck pad, grip strips): t0..t1 along, s0..s1 across, raised by e
function patchOn( L, hw, yf, t0, t1, s0, s1, e = 0.002, N = 24, Mc = 6 ) {
	const pos = [], uv = [], idx = [];
	for ( let i = 0; i <= N; i ++ ) {
		const t = t0 + ( t1 - t0 ) * i / N;
		for ( let j = 0; j <= Mc; j ++ ) {
			const s = s0 + ( s1 - s0 ) * j / Mc;
			pos.push( ( t - 0.5 ) * L, yf( t, s ) + e, s * hw( t ) );
			uv.push( i / N, 1 - j / Mc );
		}
	}
	for ( let i = 0; i < N; i ++ ) for ( let j = 0; j < Mc; j ++ ) { const a = i * ( Mc + 1 ) + j, b = a + Mc + 1; idx.push( a, a + 1, b, b, a + 1, b + 1 ); }
	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	geo.setIndex( idx );
	geo.computeVertexNormals();
	return geo;
}

// A wheel rolling along x (its axle along z): a tyre (lathe: rounded tread, sidewalls), a rim / core and a hub.
// o: { tyre, rim, hub (materials), spokes (n), bearing, knobs }
function wheel( g, x, y, z, R, W, o = {} ) {
	const r0 = o.inner ?? R * 0.62;
	const prof = [ [ r0 * 0.98, - W * 0.42 ] ];
	const n = 10;
	for ( let i = 0; i <= n; i ++ ) {
		const a = - PI / 2 + i / n * PI;
		prof.push( [ r0 + ( R - r0 ) * ( 0.55 + 0.45 * Math.max( 0, Math.cos( a ) ) ** ( o.square ? 0.4 : 0.8 ) ), W / 2 * Math.sin( a ) ] );
	}
	prof.push( [ r0 * 0.98, W * 0.42 ] );
	const tyre = G.lathe( prof, o.seg ?? 24 ).rotateX( PI / 2 );
	add( g, tyre, o.tyre || MT.tyre(), [ x, y, z ] );
	// knobs on a knobbly tyre
	if ( o.knobs ) {
		const kg = [];
		const nk = o.knobs;
		for ( let i = 0; i < nk; i ++ ) {
			const a = i / nk * PI * 2;
			for ( const side of [ - 1, 1 ] ) {
				const b = new THREE.BoxGeometry( R * 0.13, R * 0.08, W * 0.32 );
				b.translate( 0, R + R * 0.02, side * W * 0.2 * ( i % 2 ? 1 : 0.6 ) );
				b.rotateZ( a + ( side > 0 ? 0.1 : 0 ) );
				kg.push( b );
			}
		}
		merged( g, kg, o.tyre || MT.tyre(), [ x, y, z ] );
	}
	// the rim (a dished disc) and the hub
	const rim = G.lathe( [ [ r0 * 0.25, - W * 0.42 ], [ r0, - W * 0.4 ], [ r0 * 1.02, - W * 0.3 ], [ r0 * 0.96, 0 ], [ r0 * 1.02, W * 0.3 ], [ r0, W * 0.4 ], [ r0 * 0.25, W * 0.42 ] ], o.seg ?? 24 ).rotateX( PI / 2 );
	add( g, rim, o.rim || MT.alu(), [ x, y, z ] );
	const hub = G.cylZ( r0 * 0.28, W * 1.05, 12 );
	add( g, hub, o.hub || MT.steel(), [ x, y, z ] );
	if ( o.spokes ) {
		const sg = [];
		for ( let i = 0; i < o.spokes; i ++ ) {
			const a = i / o.spokes * PI * 2;
			for ( const s of [ - 1, 1 ] ) sg.push( barGeo( [ 0, 0, s * W * 0.32 ], [ Math.cos( a ) * r0 * 0.95, Math.sin( a ) * r0 * 0.95, s * W * 0.12 ], r0 * 0.04, 4 ) );
		}
		merged( g, sg, o.hub || MT.steel(), [ x, y, z ] );
	}
	if ( o.bearing ) {
		add( g, G.cylZ( r0 * 0.55, W * 1.02, 16 ), MT.black(), [ x, y, z ] );
		add( g, G.cylZ( r0 * 0.25, W * 1.04, 10 ), MT.chrome(), [ x, y, z ] );
	}
}

// ---- textures --------------------------------------------------------------------------------------------------------

const gripTex = () => tx( 'grip', 256, 512, ( ctx, W, H ) => {
	ctx.fillStyle = '#141517'; ctx.fillRect( 0, 0, W, H );
	const r = rng( 3 );
	for ( let i = 0; i < 9000; i ++ ) { const v = 30 + r() * 40; ctx.fillStyle = `rgb(${v},${v},${v + 3})`; ctx.fillRect( r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5 ); }
	// worn pale where the feet go and on the kicks
	for ( const [ cy, s ] of [ [ 0.1, 0.12 ], [ 0.9, 0.12 ], [ 0.33, 0.1 ], [ 0.68, 0.1 ] ] ) {
		const gr = ctx.createRadialGradient( W / 2, H * cy, 0, W / 2, H * cy, W * 0.8 );
		gr.addColorStop( 0, `rgba(120,118,112,${s})` ); gr.addColorStop( 1, 'rgba(120,118,112,0)' );
		ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
	}
	// a slit cut through the tape and the bolt heads
	ctx.strokeStyle = 'rgba(200,180,140,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo( W * 0.2, H * 0.5 ); ctx.lineTo( W * 0.8, H * 0.47 ); ctx.stroke();
	ctx.fillStyle = '#7d7f84';
	for ( const by of [ 0.205, 0.235, 0.765, 0.795 ] ) for ( const bx of [ 0.38, 0.62 ] ) { ctx.beginPath(); ctx.arc( W * bx, H * by, 5, 0, PI * 2 ); ctx.fill(); }
}, { repeat: false } );
const plyTex = () => tx( 'ply', 256, 32, ( ctx, W, H ) => {
	const cols = [ '#e6cf9d', '#c43a2a', '#e6cf9d', '#2a5ab8', '#e6cf9d', '#e8b21a', '#e6cf9d' ];
	cols.forEach( ( c, i ) => { ctx.fillStyle = c; ctx.fillRect( 0, i * H / 7, W, H / 7 + 1 ); } );
} );
function deckArt( kind, color ) {
	return tx( 'deck:' + kind + ':' + color, 512, 128, ( ctx, W, H ) => {
		if ( kind === 'koa' ) {
			// a koa top: warm, curly grain
			ctx.fillStyle = '#9a5a2e'; ctx.fillRect( 0, 0, W, H );
			const r = rng( 21 );
			for ( let i = 0; i < 140; i ++ ) {
				const y = r() * H, a = 0.1 + r() * 0.25;
				ctx.strokeStyle = `rgba(${60 + r() * 40},${25 + r() * 20},${10},${a})`; ctx.lineWidth = 1 + r() * 2;
				ctx.beginPath(); for ( let x = 0; x <= W; x += 8 ) ctx.lineTo( x, y + Math.sin( x * 0.02 + i ) * 4 + Math.sin( x * 0.11 + i * 3 ) * 1.5 ); ctx.stroke();
			}
			for ( let i = 0; i < 30; i ++ ) { ctx.fillStyle = `rgba(255,220,170,${0.05 + r() * 0.06})`; ctx.fillRect( r() * W, 0, 6 + r() * 20, H ); }
			text( ctx, 'KOʻOLAU', W * 0.5, H * 0.5, W * 0.3, 40, 0x3a1a08, { family: 'Georgia, serif', weight: 'bold italic' } );
			return;
		}
		// a skate graphic: a sunburst, a big hibiscus, the brand down the middle
		ctx.fillStyle = css( color ); ctx.fillRect( 0, 0, W, H );
		ctx.save(); ctx.translate( W * 0.28, H * 0.5 );
		for ( let i = 0; i < 18; i ++ ) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.25)' : 'rgba(255,120,40,0.25)'; ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.arc( 0, 0, W, i / 18 * PI * 2, ( i + 1 ) / 18 * PI * 2 ); ctx.fill(); }
		ctx.restore();
		glyph( ctx, 'hibiscus', W * 0.28, H * 0.5, H * 0.95, '#d8282a', '#ffe28a' );
		text( ctx, 'MAKANI', W * 0.67, H * 0.46, W * 0.48, 76, 0x161616, { family: 'Impact, Arial Black, sans-serif', stroke: 0xffffff, lw: 5 } );
		text( ctx, 'SKATE CO · HONOLULU', W * 0.67, H * 0.8, W * 0.4, 18, 0x161616, { weight: 'bold' } );
		glyph( ctx, 'wave', W * 0.92, H * 0.5, H * 0.5, '#161616' );
	} );
}
// rope: kernmantle (a sheath of braided colours) or three-strand hemp
function ropeMat( kind = 'kern', c1 = 0x2a7ad8, c2 = 0xf2d22a ) {
	const t = tx( 'rope:' + kind + c1 + c2, 64, 128, ( ctx, W, H ) => {
		ctx.fillStyle = css( kind === 'hemp' ? 0x9a7a4a : c1 ); ctx.fillRect( 0, 0, W, H );
		if ( kind === 'hemp' ) {
			for ( let i = - H; i < H * 2; i += 22 ) { ctx.strokeStyle = 'rgba(60,40,20,0.45)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo( 0, i ); ctx.lineTo( W, i + 34 ); ctx.stroke(); ctx.strokeStyle = 'rgba(255,230,180,0.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo( 0, i + 9 ); ctx.lineTo( W, i + 43 ); ctx.stroke(); }
		} else {
			const r = rng( 9 );
			// the braided sheath: diagonal plaits, a coloured tracer spiralling round
			for ( let y = 0; y < H; y += 6 ) for ( let x = 0; x < W; x += 8 ) {
				const k = ( x / 8 + y / 6 ) % 8;
				ctx.fillStyle = k === 0 || k === 1 ? css( c2 ) : ( ( x / 8 + y / 6 ) % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)' );
				ctx.beginPath(); ctx.ellipse( x + 4 + ( y / 6 % 2 ) * 4, y + 3, 4, 2.4, 0.6, 0, PI * 2 ); ctx.fill();
				if ( r() < 0.03 ) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect( x, y, 8, 6 ); }
			}
		}
	}, { repeat: true } );
	const k = 'ropeMat:' + kind + c1 + c2;
	if ( ! ropeMat[ k ] ) { const tt = t.clone(); tt.repeat.set( 1, 24 ); tt.needsUpdate = true; ropeMat[ k ] = M( 0xffffff, { map: tt, rough: 0.9 } ); }
	return ropeMat[ k ];
}

// =====================================================================================================================
// builders
// =====================================================================================================================

export function register( reg ) {
	// ---- boards ------------------------------------------------------------------------------------------------------

	// a skateboard (popsicle deck, kicked nose and tail, concave) or a longboard (pintail, flat, soft wheels)
	reg( 'mob_deck', ( s ) => deckModel( s ) );

	// a kick scooter, standing on its kickstand: aluminium deck, rear fender brake, folding stem, T-bar, foam grips
	reg( 'mob_scooter', ( s ) => {
		const g = group(), c = s.color ?? 0x2ab8d8, alu = MT.alu(), paint = MT.paint( c ), blk = MT.black();
		const R = 0.05, W = 0.024, deckY = 0.075;
		// deck: a rounded slab with grip tape and coloured side caps
		const hw = ( t ) => 0.055 * ( t < 0.08 ? Math.sin( t / 0.08 * PI / 2 ) ** 0.4 : t > 0.9 ? Math.sin( ( 1 - t ) / 0.1 * PI / 2 ) ** 0.4 : 1 );
		const S = pslab( 0.52, hw, () => deckY + 0.025, 0.025, { N: 24, M: 4, K: 3, rr: 0.008 } );
		add( g, S.top, M( 0xffffff, { map: gripTex(), rough: 0.95 } ), [ 0.02, 0, 0 ] );
		add( g, S.bottom, alu, [ 0.02, 0, 0 ] );
		add( g, S.rim, paint, [ 0.02, 0, 0 ] );
		// rear wheel under the fender brake, front wheel in the fork
		wheel( g, - 0.3, R, 0, R, W, { tyre: M( 0xd8e2e8, { rough: 0.35, transparent: false } ), rim: MT.aluDark(), inner: R * 0.66, bearing: true } );
		wheel( g, 0.33, R, 0, R, W, { tyre: M( 0xd8e2e8, { rough: 0.35 } ), rim: MT.aluDark(), inner: R * 0.66, bearing: true } );
		const fender = G.lathe( [ [ R + 0.006, - 0.016 ], [ R + 0.012, - 0.016 ], [ R + 0.012, 0.016 ], [ R + 0.006, 0.016 ] ], 16, 0, PI * 0.55 ).rotateX( PI / 2 ).rotateZ( PI * 0.25 );
		add( g, fender, blk, [ - 0.3, R, 0 ] );
		merged( g, [ beamGeo( [ - 0.24, deckY + 0.012, - 0.015 ], [ - 0.33, R + 0.01, - 0.015 ], 0.008, 0.012 ), beamGeo( [ - 0.24, deckY + 0.012, 0.015 ], [ - 0.33, R + 0.01, 0.015 ], 0.008, 0.012 ) ], alu );
		// the fork and the stem, raked back a little, the fold clamp at the deck
		const top = V( 0.27, 0.82, 0 ), base = V( 0.33, R, 0 );
		merged( g, [ barGeo( [ 0.33, R, - 0.02 ], [ 0.31, 0.16, - 0.02 ], 0.007 ), barGeo( [ 0.33, R, 0.02 ], [ 0.31, 0.16, 0.02 ], 0.007 ) ], alu );
		add( g, barGeo( [ 0.31, 0.15, 0 ], top, 0.016, 12 ), alu );
		add( g, barGeo( [ 0.3, 0.32, 0 ], [ 0.295, 0.42, 0 ], 0.0185, 12 ), paint );
		add( g, new THREE.BoxGeometry( 0.06, 0.05, 0.06 ), paint, [ 0.3, deckY + 0.03, 0 ] );
		add( g, barGeo( [ 0.27, deckY + 0.06, 0.035 ], [ 0.31, deckY + 0.01, 0.035 ], 0.005 ), MT.chrome() );
		// the T-bar and its foam grips
		add( g, barGeo( [ top.x, top.y, - 0.27 ], [ top.x, top.y, 0.27 ], 0.011, 10 ), alu );
		for ( const z of [ - 1, 1 ] ) {
			add( g, barGeo( [ top.x, top.y, z * 0.27 ], [ top.x, top.y, z * 0.14 ], 0.017, 12 ), MT.black() );
			add( g, barGeo( [ top.x, top.y, z * 0.275 ], [ top.x, top.y, z * 0.268 ], 0.019, 12 ), paint );
		}
		add( g, new THREE.BoxGeometry( 0.03, 0.04, 0.04 ), paint, [ top.x, top.y - 0.02, 0 ] );
		// the kickstand, out to the side
		add( g, barGeo( [ - 0.05, deckY + 0.005, 0.05 ], [ - 0.12, 0.0, 0.14 ], 0.005 ), MT.steel() );
		g.rotation.x = 0.06;
		g.userData.iconDir = [ 0.15, 0.35, 1 ];
		g.userData.bar = { y: 0.82, x: 0.27, half: 0.21 };
		// carried by the stem under the T-bar, the bar running forward (the deck hangs out of sight)
		g.userData.hold = { p: [ 0.283, 0.62, 0 ], a: [ - 0.06, 1, 0 ], f: [ 1, 0, 0 ], r: 0.016 };
		g.userData.view = { at: [ 0.26, - 0.27, - 0.42 ], axis: [ 0.06, 1, 0.1 ], front: [ 1, 0, 0.15 ] };
		return grounded( g );
	} );

	// inline skates, a pair: hard shells with a coloured cuff and buckle, laced liners, four wheels in an aluminium frame,
	// a heel brake
	reg( 'mob_skates', ( s ) => {
		const g = group();
		for ( const z of [ - 0.075, 0.075 ] ) skate( g, z, s, z > 0 ? 0.08 : - 0.05 );
		ground( g );
		g.userData.iconDir = [ 0.7, 0.55, 1 ];
		return g;
	} );

	// a set of wheels with their bearings
	reg( 'mob_wheels', ( s ) => {
		const g = group(), ure = M( s.color ?? 0xf2f0e6, { rough: 0.5 } );
		const R = 0.027, W = 0.033;
		// two pairs side by side, the front pair stood on edge
		for ( const [ x, z ] of [ [ - 0.032, - 0.02 ], [ 0.032, - 0.02 ] ] ) {
			const w = group();
			wheel( w, 0, 0, 0, R, W, { tyre: ure, rim: M( 0x2a2a2e, { rough: 0.5 } ), inner: R * 0.62, bearing: true, square: true } );
			w.position.set( x, R, z ); g.add( w );
		}
		for ( const x of [ - 0.03, 0.03 ] ) {
			const w = group();
			wheel( w, 0, 0, 0, R, W, { tyre: ure, rim: M( 0x2a2a2e, { rough: 0.5 } ), inner: R * 0.62, bearing: true, square: true } );
			w.rotation.x = PI / 2; w.position.set( x, W / 2, 0.045 ); g.add( w );
		}
		// a printed card the set came on
		add( g, new THREE.BoxGeometry( 0.15, 0.002, 0.11 ), M( 0xffffff, { rough: 0.7, map: tx( 'wheelcard', 256, 192, ( ctx, Wc, Hc ) => {
			ctx.fillStyle = '#1a1a1e'; ctx.fillRect( 0, 0, Wc, Hc );
			text( ctx, 'MAKANI', Wc / 2, Hc * 0.2, Wc * 0.7, 40, 0xf2c21a, { family: 'Impact, Arial Black, sans-serif' } );
			text( ctx, '54 mm · 99A', Wc / 2, Hc * 0.85, Wc * 0.7, 22, 0xffffff );
		} ) } ), [ 0, 0, 0.005 ] );
		ground( g );
		g.userData.iconDir = [ 0.5, 1, 0.8 ];
		return g;
	} );

	// a papa hōlua: two long runners of dark hardwood, cross pieces lashed on with sennit, a slatted bed, the nose turned up
	reg( 'mob_holua', () => {
		const g = group(), wood = M( 0xffffff, { rough: 0.6, map: tx( 'kauila', 256, 32, ( ctx, W, H ) => {
			ctx.fillStyle = '#8a5a32'; ctx.fillRect( 0, 0, W, H );
			const r = rng( 5 );
			for ( let i = 0; i < 40; i ++ ) { ctx.strokeStyle = `rgba(20,10,4,${0.2 + r() * 0.3})`; ctx.lineWidth = 1; ctx.beginPath(); const y = r() * H; ctx.moveTo( 0, y ); for ( let x = 0; x < W; x += 16 ) ctx.lineTo( x, y + Math.sin( x * 0.05 + i ) * 2 ); ctx.stroke(); }
		}, { repeat: true } ) } ), cord = ropeMat( 'hemp' );
		const L = 3.4;
		const rise = ( x ) => x > L / 2 - 0.45 ? ( ( x - ( L / 2 - 0.45 ) ) / 0.45 ) ** 2 * 0.16 : 0;
		for ( const z of [ - 0.07, 0.07 ] ) {
			const pts = [];
			for ( let i = 0; i <= 24; i ++ ) { const x = - L / 2 + i / 24 * L; pts.push( V( x, 0.05 + rise( x ), z ) ); }
			// a runner: a narrow deep rail, rounded underneath
			const shape = new THREE.Shape(); shape.moveTo( - 0.018, 0.05 ); shape.lineTo( 0.018, 0.05 ); shape.lineTo( 0.016, - 0.03 ); shape.quadraticCurveTo( 0, - 0.052, - 0.016, - 0.03 ); shape.lineTo( - 0.018, 0.05 );
			const geo = new THREE.ExtrudeGeometry( shape, { steps: 24, extrudePath: new THREE.CatmullRomCurve3( pts ), bevelEnabled: false } );
			add( g, geo, wood );
		}
		// cross pieces and the lashings
		for ( let i = 0; i < 9; i ++ ) {
			const x = - L / 2 + 0.2 + i * ( L - 0.7 ) / 8;
			add( g, new THREE.BoxGeometry( 0.05, 0.022, 0.2 ), wood, [ x, 0.115 + rise( x ), 0 ] );
			const wr = [];
			for ( const z of [ - 0.07, 0.07 ] ) for ( let k = 0; k < 3; k ++ ) wr.push( new THREE.TorusGeometry( 0.032, 0.0038, 4, 10 ).rotateY( PI / 2 ).translate( x - 0.009 + k * 0.009, 0.1 + rise( x ), z ) );
			merged( g, wr, cord );
		}
		// the bed: three long slats along the top
		for ( const z of [ - 0.06, 0, 0.06 ] ) add( g, new THREE.BoxGeometry( L - 0.9, 0.012, 0.04 ), wood, [ - 0.25, 0.132, z ] );
		ground( g );
		g.userData.hold = { p: [ 0, 0.1, 0.08 ], a: [ 1, 0, 0 ], f: [ 0, 0, 1 ] };
		g.userData.view = UNDERARM;
		return g;
	} );

	// a stand-up paddleboard: square tail, round nose, rounded rails, an EVA deck pad with a kick at the tail, a carry
	// handle, bungees over the nose, a leash plug; the fin's off for carrying (its box shows underneath)
	reg( 'mob_sup', ( s ) => supModel( s ) );

	// a SUP paddle: T-grip, a carbon shaft with an adjustment clamp, an angled teardrop blade
	reg( 'mob_paddle', ( s ) => {
		return grounded( paddleModel( s ) );
	} );

	// a coiled urethane leash with its velcro ankle cuff and swivel
	reg( 'mob_leash', ( s ) => {
		const g = group(), cord = M( s.color ?? 0x2a3a5a, { rough: 0.3 } );
		const pts = [];
		for ( let i = 0; i <= 260; i ++ ) { const t = i / 260, a = t * PI * 2 * 11; pts.push( V( - 0.12 + t * 0.24, 0.035 + Math.sin( a ) * 0.03, Math.cos( a ) * 0.03 ) ); }
		add( g, tubeGeo( pts, 0.0035, 260, 6 ), cord );
		// the cuff: a neoprene band with a velcro tab and a printed logo
		const cuff = M( 0xffffff, { rough: 0.8, map: tx( 'cuff', 256, 64, ( ctx, W, H ) => { ctx.fillStyle = '#121214'; ctx.fillRect( 0, 0, W, H ); text( ctx, 'KAIMANA', W * 0.3, H / 2, W * 0.4, 30, 0xf2c21a ); ctx.fillStyle = '#2a2a2e'; ctx.fillRect( W * 0.65, 0, W * 0.35, H ); } ) } );
		add( g, new THREE.CylinderGeometry( 0.055, 0.055, 0.06, 20, 1, true ), M( 0x121214, { rough: 0.85, side: THREE.DoubleSide } ), [ 0.18, 0.055, 0 ], [ PI / 2, 0, 0 ] );
		add( g, new THREE.CylinderGeometry( 0.057, 0.057, 0.056, 20, 1, true, 0, PI * 1.3 ), M( 0xffffff, { rough: 0.8, map: cuff.map, side: THREE.DoubleSide } ), [ 0.18, 0.055, 0 ], [ PI / 2, 0, 0 ] );
		// swivel and the rail saver strap at the far end
		add( g, G.cylX( 0.009, 0.03, 10 ), MT.chrome(), [ - 0.135, 0.035, 0 ] );
		add( g, strapGeo( [ [ - 0.15, 0.035, 0 ], [ - 0.2, 0.012, 0.01 ], [ - 0.24, 0.004, - 0.01 ] ], 0.022, 0.004 ), MT.web( 0x121214 ) );
		ground( g );
		g.userData.iconDir = [ 0.3, 1, 0.7 ];
		return g;
	} );

	// a tube of UV-curing ding resin and a sanding pad
	reg( 'mob_resin', () => {
		const g = group();
		const lbl = M( 0xffffff, { rough: 0.45, map: tx( 'resin', 256, 128, ( ctx, W, H ) => {
			ctx.fillStyle = '#f2f2ec'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#e8701a'; ctx.fillRect( 0, 0, W, H * 0.3 );
			glyph( ctx, 'sun', W * 0.15, H * 0.62, H * 0.5, '#e8701a' );
			text( ctx, 'SUN CURE', W * 0.6, H * 0.15, W * 0.7, 30, 0xffffff );
			text( ctx, 'DING FIX', W * 0.6, H * 0.55, W * 0.66, 40, 0x1a1a1a );
			text( ctx, 'Sets in sunlight', W * 0.6, H * 0.83, W * 0.66, 16, 0x555555, { weight: 'bold' } );
		} ) } );
		const prof = [ [ 0.001, 0 ], [ 0.017, 0.002 ], [ 0.018, 0.09 ], [ 0.014, 0.115 ], [ 0.005, 0.118 ], [ 0.001, 0.118 ] ];
		const tube = G.lathe( prof, 20 );
		tube.scale( 1, 1, 0.55 );
		add( g, tube, lbl, [ 0, 0, 0 ], [ 0, 0, - PI / 2 ] );
		add( g, G.cylX( 0.008, 0.025, 12 ), MT.plastic( 0xe8701a ), [ 0.13, 0, 0 ] );
		add( g, new THREE.BoxGeometry( 0.07, 0.012, 0.05 ), M( 0xd8c89a, { rough: 0.95 } ), [ - 0.02, 0.006, 0.05 ], [ 0, 0.3, 0 ] );
		ground( g );
		g.userData.iconDir = [ 0.3, 1, 0.6 ];
		return g;
	} );

	// ---- air -----------------------------------------------------------------------------------------------------------

	// a paraglider in its rucksack: a tall rounded pack, the wing's bright fabric showing at the open lid, compression
	// straps with buckles, shoulder straps, the risers' carabiners clipped on top
	reg( 'mob_glider', ( s ) => {
		const g = group(), c = s.color ?? 0xd8402a, c2 = s.color2 ?? 0x1f2a3a;
		const body = fabric( c2, 'canvas', 0xffffff, { rep: 3 } );
		add( g, G.rbox( 0.42, 0.62, 0.3, 0.1, 4 ), body );
		// the lid zipped round, the wing folded concertina-style peeking out
		add( g, G.rbox( 0.4, 0.06, 0.28, 0.025, 2 ), fabric( shade( c2, 0.12 ), 'canvas', 0xffffff, { rep: 3 } ), [ 0, 0.6, 0 ] );
		const wing = fabric( c, 'stripes', 0xf2f0e8, { rep: 2 } );
		for ( let i = 0; i < 5; i ++ ) add( g, G.rbox( 0.36, 0.022, 0.07, 0.009, 2 ), i % 2 ? wing : M( 0xf2f0e8, { rough: 0.8 } ), [ 0, 0.42 + i * 0.024, 0.15 ], [ 0, 0, ( i % 2 - 0.5 ) * 0.04 ] );
		// front: a logo patch and two compression straps with buckles
		add( g, new THREE.PlaneGeometry( 0.22, 0.09 ), M( 0xffffff, { rough: 0.6, map: tx( 'mauna', 256, 104, ( ctx, W, H ) => {
			ctx.fillStyle = '#e8e4da'; ctx.fillRect( 0, 0, W, H );
			glyph( ctx, 'mountain', W * 0.17, H * 0.52, H * 0.85, css( c ) );
			text( ctx, 'MAUNA AIR', W * 0.62, H * 0.4, W * 0.62, 34, 0x1f2a3a, { family: 'Arial Black, Arial, sans-serif' } );
			text( ctx, 'EN-A · 22 m²', W * 0.62, H * 0.78, W * 0.6, 18, 0x555555, { weight: 'bold' } );
		} ) } ), [ 0, 0.2, 0.152 ] );
		const web = MT.web( 0x111214 );
		for ( const y of [ 0.12, 0.34 ] ) {
			add( g, strapGeo( [ [ - 0.215, y, - 0.02 ], [ - 0.212, y, 0.14 ], [ - 0.17, y, 0.155 ], [ 0.17, y, 0.155 ], [ 0.212, y, 0.14 ], [ 0.215, y, - 0.02 ] ], 0.025, 0.004, [ 0, 1, 0 ] ), web );
			add( g, new THREE.BoxGeometry( 0.045, 0.032, 0.012 ), MT.black(), [ 0.08, y, 0.158 ] );
		}
		// shoulder straps on the back
		for ( const x of [ - 0.1, 0.1 ] ) add( g, strapGeo( [ [ x, 0.58, - 0.15 ], [ x * 1.1, 0.5, - 0.2 ], [ x * 1.2, 0.3, - 0.205 ], [ x * 1.25, 0.1, - 0.18 ], [ x * 1.3, 0.04, - 0.15 ] ], 0.055, 0.016, [ 0, 0, 1 ] ), MT.matte( 0x1a1a1c ) );
		// the risers' carabiners on the lid, and a grab loop
		for ( const x of [ - 0.08, 0.08 ] ) add( g, new THREE.TorusGeometry( 0.028, 0.0045, 6, 16 ), MT.alu(), [ x, 0.66, 0.02 ], [ 0, PI / 2, 0 ] );
		add( g, tubeGeo( [ [ - 0.05, 0.63, - 0.12 ], [ 0, 0.68, - 0.13 ], [ 0.05, 0.63, - 0.12 ] ], 0.007, 10, 5 ), web );
		g.userData.iconDir = [ 0.7, 0.45, 1 ];
		g.userData.hold = { p: [ 0, 0.672, - 0.13 ], a: [ 1, 0, 0 ], f: [ 0, 0, 1 ], r: 0.01 };
		g.userData.view = BYHANDLE;
		return grounded( g );
	} );

	// a reserve container: a padded square pouch, stitched, the red handle on its side, a pin flap
	reg( 'mob_reserve', ( s ) => {
		const g = group(), c = s.color ?? 0x3a4a34;
		add( g, G.rbox( 0.28, 0.12, 0.22, 0.035, 3 ), fabric( c, 'canvas', 0xffffff, { rep: 2 } ) );
		// stitched seams round the lid
		const seam = M( shade( c, - 0.4 ), { rough: 0.9 } );
		add( g, strapGeo( [ [ - 0.13, 0.121, - 0.1 ], [ 0.13, 0.121, - 0.1 ], [ 0.13, 0.121, 0.1 ], [ - 0.13, 0.121, 0.1 ], [ - 0.13, 0.121, - 0.1 ] ], 0.004, 0.0015 ), seam );
		// the pin flap with a printed warning, and the handle
		add( g, new THREE.BoxGeometry( 0.1, 0.006, 0.07 ), M( 0xffffff, { rough: 0.7, map: tx( 'reserve', 200, 140, ( ctx, W, H ) => {
			ctx.fillStyle = css( shade( c, 0.1 ) ); ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#e8e4da'; ctx.fillRect( W * 0.08, H * 0.15, W * 0.84, H * 0.7 );
			text( ctx, 'RESERVE', W / 2, H * 0.36, W * 0.76, 34, 0xc0202a );
			text( ctx, 'PULL HANDLE', W / 2, H * 0.68, W * 0.76, 20, 0x222222, { weight: 'bold' } );
		} ) } ), [ 0.02, 0.125, 0 ] );
		const red = MT.plastic( 0xd0202a );
		add( g, tubeGeo( [ [ 0.141, 0.035, - 0.05 ], [ 0.17, 0.06, - 0.04 ], [ 0.175, 0.06, 0.04 ], [ 0.141, 0.035, 0.05 ] ], 0.009, 16, 8 ), red );
		add( g, new THREE.BoxGeometry( 0.012, 0.03, 0.12 ), MT.web( 0xd0202a ), [ 0.142, 0.03, 0 ] );
		// risers folded under the side flaps
		for ( const z of [ - 0.11, 0.11 ] ) add( g, new THREE.BoxGeometry( 0.22, 0.05, 0.008 ), MT.web( 0x1a1a1a ), [ 0, 0.05, z ] );
		ground( g );
		g.userData.iconDir = [ 0.75, 0.9, 1 ];
		return g;
	} );

	// a variometer: a slim instrument with an LCD (the climb rate and a bar), three buttons, a strap
	reg( 'mob_vario', () => {
		const g = group();
		add( g, G.rbox( 0.11, 0.028, 0.068, 0.012, 3 ), MT.plastic( 0x232528 ) );
		add( g, G.rbox( 0.112, 0.012, 0.07, 0.006, 2 ), MT.plastic( 0xf2c21a ), [ 0, 0, 0 ] );
		add( g, new THREE.PlaneGeometry( 0.07, 0.046 ).rotateX( - PI / 2 ), M( 0xffffff, { rough: 0.25, map: tx( 'varioLCD', 200, 130, ( ctx, W, H ) => {
			ctx.fillStyle = '#b7c4a0'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#1a2214';
			text( ctx, '+1.8', W * 0.42, H * 0.36, W * 0.6, 58, 0x1a2214, { family: 'Courier New, monospace', weight: 'bold' } );
			text( ctx, 'm/s', W * 0.85, H * 0.42, W * 0.25, 20, 0x1a2214 );
			text( ctx, 'ALT 1240 m', W * 0.42, H * 0.78, W * 0.75, 22, 0x1a2214, { family: 'Courier New, monospace', weight: 'bold' } );
			for ( let i = 0; i < 6; i ++ ) ctx.fillRect( W * 0.88, H * ( 0.9 - i * 0.12 ) - 6, 14, 8 );
		} ) } ), [ - 0.012, 0.0285, 0 ] );
		for ( let i = 0; i < 3; i ++ ) add( g, G.cyl( 0.005, 0.005, 0.004, 10 ), MT.plastic( i === 1 ? 0xd0202a : 0x5a5e66 ), [ 0.038, 0.027, - 0.02 + i * 0.02 ] );
		add( g, strapGeo( [ [ - 0.06, 0.008, - 0.05 ], [ - 0.06, 0.008, 0.05 ] ], 0.02, 0.003 ), MT.web( 0x111111 ) );
		ground( g );
		g.userData.iconDir = [ 0.25, 1, 0.6 ];
		return g;
	} );

	// a roll of ripstop repair tape on a printed core
	reg( 'mob_tape', ( s ) => {
		const g = group(), c = s.color ?? 0xe8b12a;
		const rip = M( 0xffffff, { rough: 0.6, map: tx( 'ripstop' + c, 64, 64, ( ctx, W, H ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = css( shade( c, - 0.25 ) ); ctx.lineWidth = 1.5;
			for ( let i = 0; i <= W; i += 8 ) { ctx.beginPath(); ctx.moveTo( i, 0 ); ctx.lineTo( i, H ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( 0, i ); ctx.lineTo( W, i ); ctx.stroke(); }
		}, { repeat: true } ) } );
		const roll = G.lathe( [ [ 0.022, - 0.025 ], [ 0.045, - 0.025 ], [ 0.046, - 0.023 ], [ 0.046, 0.023 ], [ 0.045, 0.025 ], [ 0.022, 0.025 ] ], 28 );
		add( g, roll, rip );
		add( g, G.cyl( 0.022, 0.022, 0.05, 24, true ), M( 0xffffff, { rough: 0.8, side: THREE.DoubleSide, map: tx( 'tapecore', 128, 32, ( ctx, W, H ) => { ctx.fillStyle = '#d8cfb8'; ctx.fillRect( 0, 0, W, H ); text( ctx, 'RIPSTOP REPAIR', W / 2, H / 2, W * 0.9, 16, 0x333333, { weight: 'bold' } ); } ) } ), [ 0, - 0.025, 0 ] );
		// the loose end lifted off the roll
		add( g, new THREE.BoxGeometry( 0.05, 0.001, 0.05 ), rip, [ 0.06, - 0.025 + 0.001, 0.0 ], [ 0, 0, 0.12 ] );
		const r = group(); r.add( ...g.children ); r.rotation.x = PI / 2; r.position.y = 0.025;
		const root = group(); root.add( r );
		ground( root );
		return root;
	} );

	// ---- climbing --------------------------------------------------------------------------------------------------------

	// a folding grappling hook: a knurled shank with an eye, four curved tines with sharpened points, a short chain
	reg( 'mob_grapple', () => {
		const g = grappleModel();
		ground( g );
		g.userData.iconDir = [ 0.5, 1, 0.8 ];
		return g;
	} );

	// a climbing rope in a butterfly coil, its tails wrapped round the middle and knotted
	reg( 'mob_coil', ( s ) => {
		const g = group(), mat = ropeMat( 'kern', s.color ?? 0x1a4fb0, s.color2 ?? 0xf2c21a );
		const r = rng( 13 ), loops = 14;
		const geos = [];
		for ( let i = 0; i < loops; i ++ ) {
			// each loop a flattened ellipse, fanned a little, folded over the middle (a butterfly)
			const a0 = ( r() - 0.5 ) * 0.25, len = 0.24 + r() * 0.03, wid = 0.13 + r() * 0.02, lift = 0.012 + i * 0.0045;
			const pts = [];
			for ( let k = 0; k <= 22; k ++ ) {
				const t = k / 22 * PI * 2;
				const x = Math.cos( t ) * len, z = Math.sin( t ) * wid * ( Math.abs( Math.cos( t ) ) * 0.5 + 0.5 );
				pts.push( V( x * Math.cos( a0 ) - z * Math.sin( a0 ), lift + Math.abs( Math.sin( t * 0.5 ) ) * 0.01, x * Math.sin( a0 ) + z * Math.cos( a0 ) ) );
			}
			geos.push( tubeGeo( pts, 0.0052, 36, 5, true ) );
		}
		merged( g, geos, mat );
		// the wraps round the middle and a tail
		const wraps = [];
		for ( let k = 0; k < 5; k ++ ) wraps.push( new THREE.TorusGeometry( 0.04, 0.0055, 6, 16 ).rotateY( PI / 2 ).scale( 1, 1.1, 1.75 ).translate( - 0.02 + k * 0.011, 0.045, 0 ) );
		wraps.push( tubeGeo( [ [ 0.02, 0.08, 0 ], [ 0.06, 0.07, 0.04 ], [ 0.13, 0.03, 0.08 ], [ 0.2, 0.012, 0.07 ] ], 0.0052, 16, 6 ) );
		merged( g, wraps, mat );
		ground( g );
		g.userData.iconDir = [ 0.35, 1, 0.75 ];
		return g;
	} );

	// a sit harness laid flat: a padded waist belt with its buckle, two leg loops, the belay loop, gear loops
	reg( 'mob_harness', ( s ) => {
		const g = group(), c = s.color ?? 0xd8562a, c2 = s.color2 ?? 0x2a2a2e;
		const pad = fabric( c, 'mesh', shade( c, - 0.25 ), { rep: 4 } ), web = MT.web( c2 );
		const ring = ( cx, cz, rx, rz, y, w, mat, n = 32, skip = 0 ) => {
			const pts = [];
			for ( let i = 0; i <= n - skip; i ++ ) { const a = i / n * PI * 2; pts.push( V( cx + Math.cos( a ) * rx, y + Math.sin( a * 2 ) * 0.004, cz + Math.sin( a ) * rz ) ); }
			add( g, strapGeo( pts, w, 0.008 ), mat );
		};
		ring( 0, - 0.06, 0.2, 0.15, 0.012, 0.075, pad, 36, 3 );
		ring( 0, - 0.06, 0.2, 0.15, 0.022, 0.025, web, 36, 3 );
		for ( const x of [ - 0.11, 0.11 ] ) { ring( x, 0.17, 0.085, 0.07, 0.01, 0.045, pad ); ring( x, 0.17, 0.085, 0.07, 0.018, 0.016, web ); }
		// the belay loop joining them, and the buckle
		add( g, strapGeo( [ [ 0, 0.025, 0.08 ], [ 0.02, 0.03, 0.11 ], [ 0, 0.03, 0.135 ], [ - 0.02, 0.03, 0.11 ], [ 0, 0.025, 0.08 ] ], 0.022, 0.006 ), MT.web( 0x7a7e86 ) );
		add( g, new THREE.BoxGeometry( 0.05, 0.012, 0.03 ), MT.aluDark(), [ 0.0, 0.03, 0.09 ] );
		add( g, new THREE.BoxGeometry( 0.045, 0.01, 0.035 ), MT.alu(), [ 0.17, 0.03, - 0.16 ], [ 0, 0.7, 0 ] );
		// gear loops (stiff plastic) and a carabiner left on one
		for ( const a of [ 2.3, 2.9, 3.6, 4.2 ] ) add( g, new THREE.TorusGeometry( 0.02, 0.003, 4, 10, PI ), MT.plastic( 0x3a3a3e ), [ Math.cos( a ) * 0.21, 0.025, - 0.06 + Math.sin( a ) * 0.155 ], [ PI / 2, 0, a ] );
		add( g, new THREE.TorusGeometry( 0.024, 0.004, 6, 14 ), MT.paint( 0xe8b21a ), [ - 0.2, 0.03, - 0.02 ], [ PI / 2, 0, 0.3 ] );
		ground( g );
		g.userData.iconDir = [ 0.3, 1, 0.55 ];
		return g;
	} );

	// a figure-eight descender: anodised aluminium, a big ring and a small one, bevelled
	reg( 'mob_eight', () => {
		const g = group();
		const sh = new THREE.Shape();
		sh.absarc( 0, 0, 0.045, 0, PI * 2 );
		const h1 = new THREE.Path(); h1.absarc( 0, 0, 0.028, 0, PI * 2 ); sh.holes.push( h1 );
		const sh2 = new THREE.Shape();
		sh2.absarc( 0.068, 0, 0.026, 0, PI * 2 );
		const h2 = new THREE.Path(); h2.absarc( 0.068, 0, 0.013, 0, PI * 2 ); sh2.holes.push( h2 );
		const opts = { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0025, bevelSegments: 2, curveSegments: 24 };
		const mat = M( 0xc8202a, { rough: 0.3, metal: 0.7 } );
		const geo = mergeGeometries( [ new THREE.ExtrudeGeometry( sh, opts ), new THREE.ExtrudeGeometry( sh2, opts ), new THREE.BoxGeometry( 0.03, 0.022, 0.011 ).translate( 0.046, 0, 0.003 ) ].map( x => { x.deleteAttribute( 'uv' ); return x.index ? x.toNonIndexed() : x; } ) );
		geo.rotateX( - PI / 2 );
		add( g, geo, mat, [ - 0.03, 0, 0 ] );
		ground( g );
		g.userData.iconDir = [ 0.2, 1, 0.5 ];
		return g;
	} );

	// a handled rope ascender: an anodised frame, the toothed cam and its safety, a rubber handle, holes for slings
	reg( 'mob_ascender', () => {
		const g = group(), frame = M( 0xe8c21a, { rough: 0.3, metal: 0.6 } );
		// the frame: a long hand loop with the cam head at its top end (built in xy, laid flat)
		const sh = new THREE.Shape();
		sh.moveTo( 0, 0 ); sh.lineTo( 0.19, 0 ); sh.quadraticCurveTo( 0.23, 0.0, 0.232, 0.035 ); sh.lineTo( 0.228, 0.075 ); sh.quadraticCurveTo( 0.22, 0.095, 0.19, 0.095 );
		sh.lineTo( 0.15, 0.095 ); sh.quadraticCurveTo( 0.13, 0.06, 0.08, 0.058 ); sh.lineTo( 0.02, 0.05 ); sh.quadraticCurveTo( - 0.012, 0.04, - 0.006, 0.012 ); sh.quadraticCurveTo( - 0.002, 0, 0, 0 );
		const hole = new THREE.Path(); hole.moveTo( 0.025, 0.016 ); hole.lineTo( 0.14, 0.016 ); hole.quadraticCurveTo( 0.15, 0.03, 0.14, 0.042 ); hole.lineTo( 0.03, 0.038 ); hole.quadraticCurveTo( 0.02, 0.03, 0.025, 0.016 ); sh.holes.push( hole );
		const ch = new THREE.Path(); ch.moveTo( 0.175, 0.07 ); ch.lineTo( 0.215, 0.07 ); ch.lineTo( 0.215, 0.083 ); ch.lineTo( 0.175, 0.083 ); ch.lineTo( 0.175, 0.07 ); sh.holes.push( ch );
		const geo = new THREE.ExtrudeGeometry( sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 10 } );
		geo.rotateX( - PI / 2 );
		add( g, geo, frame, [ - 0.11, 0, 0.045 ] );
		// the rubber grip moulded round the bottom bar of the loop
		add( g, G.rbox( 0.115, 0.016, 0.022, 0.007, 2 ), MT.rubber(), [ - 0.025, - 0.002, 0.037 ] );
		// the toothed cam on its pivot, its safety catch, the rope channel's side plate
		add( g, G.cyl( 0.016, 0.016, 0.016, 16 ), MT.steel(), [ 0.085, 0.0, - 0.01 ] );
		for ( let i = 0; i < 9; i ++ ) add( g, new THREE.ConeGeometry( 0.0028, 0.007, 4 ), MT.steel(), [ 0.085 + Math.cos( i / 9 * PI * 1.3 + 2.4 ) * 0.018, 0.008, - 0.01 + Math.sin( i / 9 * PI * 1.3 + 2.4 ) * 0.018 ], [ PI / 2, 0, - ( i / 9 * PI * 1.3 + 2.4 ) - PI / 2 ] );
		add( g, G.cyl( 0.004, 0.004, 0.018, 8 ), MT.chrome(), [ 0.085, 0.0, - 0.01 ] );
		add( g, G.rbox( 0.022, 0.01, 0.012, 0.004, 2 ), MT.plastic( 0x1a1a1c ), [ 0.06, 0.004, - 0.028 ] );
		ground( g );
		g.userData.iconDir = [ 0.2, 1, 0.5 ];
		return g;
	} );

	// a chalk bag: a fleece-lined cylinder, the drawcord and toggle, a brush loop, a dusting of chalk on it
	reg( 'mob_chalk', ( s ) => {
		const g = group(), c = s.color ?? 0x2a6a5a;
		const bag = M( 0xffffff, { rough: 0.85, map: tx( 'chalkbag' + c, 256, 128, ( ctx, W, H ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
			const r = rng( 6 );
			for ( let i = 0; i < 400; i ++ ) { ctx.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`; ctx.beginPath(); ctx.arc( r() * W, H * ( 0.3 + r() * 0.7 ), 1 + r() * 4, 0, PI * 2 ); ctx.fill(); }
			text( ctx, 'PALI GRIP', W * 0.5, H * 0.55, W * 0.4, 22, 0xffffff, { family: 'Arial Black, Arial, sans-serif' } );
		} ) } );
		add( g, G.lathe( [ [ 0.001, 0 ], [ 0.055, 0.004 ], [ 0.068, 0.03 ], [ 0.07, 0.12 ], [ 0.066, 0.135 ] ], 22 ), bag );
		// the fleece rim folded over
		add( g, new THREE.TorusGeometry( 0.066, 0.012, 8, 24 ), M( 0xf2f0ea, { rough: 1 } ), [ 0, 0.138, 0 ], [ PI / 2, 0, 0 ] );
		add( g, G.cyl( 0.055, 0.055, 0.004, 20 ), M( 0xf6f6f2, { rough: 1 } ), [ 0, 0.128, 0 ] );
		// drawcord, toggle, brush loop and a waist strap clip
		add( g, tubeGeo( [ [ 0.06, 0.13, 0.03 ], [ 0.08, 0.1, 0.05 ], [ 0.085, 0.06, 0.04 ] ], 0.0025, 10, 4 ), MT.black() );
		add( g, G.rbox( 0.012, 0.022, 0.012, 0.004, 2 ), MT.plastic( 0x1a1a1a ), [ 0.085, 0.05, 0.04 ] );
		add( g, G.cylX( 0.006, 0.05, 8 ).rotateZ( 0.4 ), MT.plastic( 0xd8b030 ), [ - 0.075, 0.1, 0.015 ] );
		add( g, new THREE.BoxGeometry( 0.014, 0.05, 0.03 ), MT.web( 0x111111 ), [ - 0.071, 0.07, - 0.02 ] );
		ground( g );
		return g;
	} );

	// a ladder for carrying: a folding ladder folded into its four sections, or an extension ladder closed up
	reg( 'mob_ladder', ( s ) => {
		const g = grounded( s.kind === 'extension' ? ladderItemExt() : ladderItemFold() );
		if ( s.kind !== 'extension' ) g.userData.iconDir = [ 0.6, 0.9, 1 ];
		return g;
	} );

	// an escape ladder rolled up: two steel hooks, webbing rails, steel rungs bundled with a strap
	reg( 'mob_rope_ladder', () => {
		const g = group(), web = MT.web( 0x1a1a1c ), steel = M( 0x3a3d42, { rough: 0.45, metal: 0.7 } );
		// the rungs stacked flat
		const rungs = [];
		for ( let i = 0; i < 7; i ++ ) rungs.push( barGeo( [ - 0.03 + i * 0.012, 0.03 + i * 0.016, - 0.19 ], [ - 0.03 + i * 0.012, 0.03 + i * 0.016, 0.19 ], 0.012, 10 ) );
		merged( g, rungs, steel );
		for ( const z of [ - 0.16, 0.16 ] ) add( g, strapGeo( [ [ - 0.06, 0.15, z ], [ 0.06, 0.13, z ], [ 0.12, 0.05, z ], [ 0.17, 0.014, z ], [ 0.22, 0.012, z ] ], 0.03, 0.004, [ 0, 1, 0 ] ), web );
		// the hooks, black powder coat, lying flat where the straps end
		for ( const z of [ - 0.16, 0.16 ] ) { const hk = add( g, hookGeo( 0.15, 0.022 ), M( 0x18181a, { rough: 0.5, metal: 0.4 } ), [ 0.2, 0.012, z - ( z > 0 ? 0.1 : 0 ) ] ); hk.quaternion.copy( FLAT ); }
		add( g, strapGeo( [ [ 0, 0.14, - 0.22 ], [ 0.02, 0.16, 0 ], [ 0, 0.14, 0.22 ] ], 0.03, 0.004 ), MT.web( 0xd0202a ) );
		add( g, new THREE.PlaneGeometry( 0.12, 0.06 ).rotateX( - PI / 2 ), M( 0xffffff, { rough: 0.6, map: tx( 'escape', 200, 100, ( ctx, W, H ) => { ctx.fillStyle = '#d0202a'; ctx.fillRect( 0, 0, W, H ); text( ctx, 'FIRE ESCAPE', W / 2, H * 0.35, W * 0.9, 30, 0xffffff ); text( ctx, '2 STOREY · 7.5 m', W / 2, H * 0.72, W * 0.9, 20, 0xffffff ); } ) } ), [ 0.0, 0.17, 0 ], [ 0, 0, 0 ] );
		ground( g );
		g.userData.iconDir = [ 0.6, 0.8, 1 ];
		return g;
	} );

	// ---- hauling -----------------------------------------------------------------------------------------------------

	reg( 'mob_cart', () => { const g = cartModel(); ground( g ); return g; } );
	reg( 'mob_barrow', ( s ) => { const g = barrowModel( s ); ground( g ); return g; } );
	// the item is the wagon folded up (the placed one is unfolded: MOB.look.mob_hauler)
	reg( 'mob_wagon', ( s ) => grounded( wagonFolded( s ) ) );
	reg( 'mob_truck', ( s ) => {
		const g = truckModel( s );
		g.userData.iconDir = [ 1, 0.5, 0.75 ];
		// carried upright by the loop at the top
		g.userData.hold = { p: [ - 0.07, 1.31, 0 ], a: [ 0, 0, 1 ], f: [ - 1, 0, 0 ], r: 0.016 };
		g.userData.view = BYHANDLE;
		return grounded( g );
	} );

	// ---- the zipline -----------------------------------------------------------------------------------------------------

	// a zipline kit: a coil of galvanised cable, two orange tree-saver straps, a turnbuckle and shackles
	reg( 'mob_zipkit', () => {
		const g = group(), cable = MT.galv();
		const geos = [];
		for ( let i = 0; i < 12; i ++ ) {
			const pts = [], r = 0.17 + ( i % 4 ) * 0.007, y = 0.006 + Math.floor( i / 4 ) * 0.009;
			for ( let k = 0; k <= 24; k ++ ) { const a = k / 24 * PI * 2 + i; pts.push( V( Math.cos( a ) * r, y + Math.sin( a * 3 + i ) * 0.002, Math.sin( a ) * r * 0.92 ) ); }
			geos.push( tubeGeo( pts, 0.0045, 40, 4, true ) );
		}
		merged( g, geos, cable );
		// straps, folded over the coil
		const web = MT.web( 0xe8701a );
		add( g, strapGeo( [ [ - 0.2, 0.01, - 0.06 ], [ - 0.12, 0.05, - 0.07 ], [ 0.08, 0.05, - 0.08 ], [ 0.16, 0.035, - 0.06 ], [ 0.12, 0.06, 0.0 ], [ - 0.1, 0.065, 0.01 ] ], 0.075, 0.005 ), web );
		add( g, strapGeo( [ [ - 0.15, 0.07, 0.06 ], [ 0.05, 0.075, 0.07 ], [ 0.18, 0.05, 0.08 ] ], 0.075, 0.005 ), web );
		// a turnbuckle and two shackles on top
		add( g, G.cylX( 0.012, 0.13, 10 ), MT.steel(), [ 0, 0.09, 0.03 ] );
		for ( const x of [ - 0.08, 0.08 ] ) add( g, new THREE.TorusGeometry( 0.016, 0.004, 6, 12 ), MT.steel(), [ x, 0.09, 0.03 ], [ 0, PI / 2, 0 ] );
		for ( const x of [ - 0.06, 0.07 ] ) add( g, new THREE.TorusGeometry( 0.022, 0.006, 6, 14, PI * 1.4 ), MT.paint( 0xd8b21a ), [ x, 0.085, - 0.05 ], [ PI / 2, 0, 0.6 ] );
		ground( g );
		g.userData.iconDir = [ 0.4, 1, 0.8 ];
		return g;
	} );

	// a zip trolley: anodised side plates, twin pulleys between them, a T-bar on a stem below, a lanyard and carabiner
	reg( 'mob_trolley', () => { const g = trolleyModel(); ground( g ); g.userData.iconDir = [ 0.8, 0.5, 1 ]; return g; } );

	// ---- on foot -------------------------------------------------------------------------------------------------------

	// trekking poles, a pair: three sections with flick locks, cork grips with wrist straps, carbide tips and baskets
	reg( 'mob_poles', ( s ) => {
		const g = group();
		for ( const z of [ - 0.022, 0.022 ] ) pole( g, z, s.color ?? 0x3a5ad8, z > 0 ? 0.01 : 0 );
		// the two cork grips in the fist, the poles down and forward
		g.userData.hold = { p: [ - 0.065, 0.017, 0 ], a: [ 1, 0, 0 ], f: [ 0, 0, 1 ], r: 0.022 };
		g.userData.view = { at: [ 0.2, - 0.19, - 0.36 ], axis: [ 0.08, - 0.82, - 0.56 ], front: [ 1, 0, 0 ] };
		return grounded( g );
	} );

	// an umbrella: furled with its strap snapped, or open (eight panels over steel ribs, the handle a hooked J)
	reg( 'mob_umbrella', ( s ) => {
		const g = umbrellaModel( s );
		return g;
	} );

	// =====================================================================================================================
	// the placed looks and the modes' visuals (MOB, kinds.js / runtime.js)
	// =====================================================================================================================

	MOB.look.mob_rope = ( p ) => ropeLook( p );
	MOB.look.mob_ladder = ( p ) => ladderLook( p );
	MOB.look.mob_rope_ladder = ( p ) => ropeLadderLook( p );
	MOB.look.mob_zipline = ( p ) => zipLook( p );
	MOB.look.mob_hauler = ( p ) => haulerLook( p );
	MOB.look.mob_board = ( p ) => itemModel( getItem( p.item ) );
	MOB.look.mob_canopy = ( p ) => spreadLook( p );
	MOB.visual.canopy = ( kind ) => kind === 'chute' ? flyingChute() : flyingWing();
	MOB.visual.board = ( stack ) => { const o = itemModel( getItem( stack.id ) ); setDynamic( o ); return o; };
	MOB.visual.trolley = () => { const o = compactCopy( 'trolleyVis', () => { const g = trolleyModel(); return g; } ); setDynamic( o ); return o; };
	MOB.visual.hook = ( rope ) => hookFlight( rope );
	MOB.visual.cable = () => cableLine();
	MOB.visual.viewPaddle = ( id ) => viewPaddle( id );
	MOB.visual.viewBrakes = () => viewBrakes();
	MOB.visual.ghostify = ( o ) => ghostify( o, true );
}

// ---- builders' parts ---------------------------------------------------------------------------------------------------

// ground() moves the parts; a hold written in the builder's own frame moves with them
function grounded( g, centre = true ) {
	g.updateMatrixWorld( true );
	const bb = new THREE.Box3().setFromObject( g ), c = bb.getCenter( V() );
	ground( g, centre );
	const h = g.userData.hold;
	if ( h && isFinite( bb.min.y ) ) h.p = [ h.p[ 0 ] - ( centre ? c.x : 0 ), h.p[ 1 ] - bb.min.y, h.p[ 2 ] - ( centre ? c.z : 0 ) ];
	return g;
}

function deckModel( s ) {
	const g = group(), long = s.kind === 'long';
	const L = long ? 1.0 : 0.81, W = long ? 0.245 : 0.21, Rw = long ? 0.035 : 0.027, Ww = long ? 0.05 : 0.032;
	const truckH = long ? 0.058 : 0.048, T = long ? 0.014 : 0.012;
	const deckY = Rw + truckH + T;
	const hw = long
		? ( t ) => W / 2 * Math.pow( Math.sin( clamp( t, 0, 1 ) * PI ), 0.42 ) * ( t > 0.5 ? 1 : 0.97 )
		: ( t ) => { const x = Math.abs( t - 0.5 ) * L, e = L / 2 - W / 2; return x <= e ? W / 2 : W / 2 * Math.sqrt( Math.max( 0, 1 - ( ( x - e ) / ( W / 2 ) ) ** 2 ) ); };
	const kick = ( t ) => { if ( long ) return - 0.004 * Math.sin( t * PI ); const x = Math.abs( t - 0.5 ) * L; return x > 0.235 ? ( ( x - 0.235 ) / ( L / 2 - 0.235 ) ) ** 1.8 * 0.058 : 0; };
	const yf = ( t, s2 ) => deckY + kick( t ) + ( long ? 0.002 : 0.006 ) * s2 * s2;
	const S = pslab( L, hw, yf, T, { N: 56, M: 10, K: 3, rr: T * 0.45 } );
	const art = deckArt( s.art || 'shaka', s.color ?? 0xe8d84a );
	add( g, S.top, long ? M( 0xffffff, { map: art, rough: 0.55 } ) : M( 0xffffff, { map: gripTex(), rough: 0.95 } ) );
	add( g, S.bottom, long ? M( 0xffffff, { map: deckArt( 'shaka', s.color2 ?? 0x2a8a6a ), rough: 0.5 } ) : M( 0xffffff, { map: art, rough: 0.45 } ) );
	const ply = plyTex().clone(); ply.repeat.set( 12, 1 ); ply.wrapS = THREE.RepeatWrapping; ply.needsUpdate = true;
	add( g, S.rim, M( 0xffffff, { map: ply, rough: 0.6 } ) );
	// grip strips on the longboard's koa
	if ( long ) for ( const [ t0, t1 ] of [ [ 0.16, 0.36 ], [ 0.62, 0.84 ] ] ) add( g, patchOn( L, hw, yf, t0, t1, - 0.86, 0.86, 0.0012 ), M( 0xffffff, { map: gripTex(), rough: 0.95 } ) );
	// trucks and wheels
	const tx0 = long ? 0.33 : 0.215;
	const alu = MT.alu(), base = MT.aluDark(), bush = MT.plastic( long ? 0xd8282a : 0xf2c21a );
	const ure = long ? M( s.wheel ?? 0x3ad87a, { rough: 0.35 } ) : M( 0xf2ead8, { rough: 0.5 } );
	for ( const sx of [ - 1, 1 ] ) {
		const x = sx * tx0;
		const by = deckY - T - kick( 0.5 + x / L );
		// baseplate, kingpin, bushings, hanger, axle
		add( g, G.rbox( 0.07, 0.012, 0.055, 0.004, 2 ), base, [ x, by - 0.012, 0 ] );
		add( g, G.cyl( 0.004, 0.004, truckH * 0.9, 8 ), MT.steel(), [ x - sx * 0.012, by - truckH * 0.9, 0 ] );
		add( g, G.cyl( 0.0105, 0.0105, 0.012, 12 ), bush, [ x - sx * 0.012, by - 0.03, 0 ] );
		add( g, G.cyl( 0.0105, 0.0105, 0.01, 12 ), bush, [ x - sx * 0.012, by - 0.045, 0 ] );
		const hanger = new THREE.CylinderGeometry( 0.014, 0.017, long ? 0.17 : 0.13, 10 ).rotateX( PI / 2 );
		add( g, hanger, alu, [ x, Rw + 0.004, 0 ] );
		add( g, new THREE.BoxGeometry( 0.03, truckH * 0.6, 0.03 ), alu, [ x + sx * 0.004, Rw + truckH * 0.35, 0 ], [ 0, 0, sx * 0.4 ] );
		add( g, G.cylZ( 0.004, long ? 0.24 : 0.205, 8 ), MT.steel(), [ x, Rw, 0 ] );
		for ( const z of [ - 1, 1 ] ) {
			const wz = z * ( long ? 0.1 : 0.084 );
			wheel( g, x, Rw, wz, Rw, Ww, { tyre: ure, rim: M( long ? 0xf2f2f2 : 0xe8e0c8, { rough: 0.5 } ), inner: Rw * 0.6, bearing: true, square: true, seg: 18 } );
			add( g, G.cylZ( 0.005, 0.006, 8 ), MT.chrome(), [ x, Rw, z * ( ( long ? 0.1 : 0.084 ) + Ww / 2 + 0.003 ) ] );
		}
		// the bolt heads through the deck
		for ( const bx of [ - 0.022, 0.022 ] ) for ( const bz of [ - 0.016, 0.016 ] ) add( g, G.cyl( 0.0035, 0.0035, 0.0015, 6 ), MT.steel(), [ x + bx, yf( 0.5 + ( x + bx ) / L, 0 ) + 0.0005, bz ] );
	}
	ground( g, false );
	g.userData.iconDir = [ 0.55, 0.75, 1 ];
	// carried by the front truck's hanger between the wheels, nose up, the graphic towards you
	g.userData.hold = { p: [ tx0, Rw + 0.006, 0 ], a: [ 0, 0, 1 ], f: [ 0, 1, 0 ], r: 0.016 };
	g.userData.view = { at: [ 0.27, - 0.21, - 0.5 ], axis: [ - 0.9, 0.42, 0.15 ], front: [ 0.1, - 0.1, - 1 ] };
	return g;
}
// carried at the side by a handle (a hand truck, a folded wagon, a wing's pack): the handle runs forward, the load
// hangs below the fist
const BYHANDLE = { at: [ 0.26, - 0.15, - 0.46 ], axis: [ 0.12, 0, - 1 ], front: [ 1, 0, 0.1 ] };

function skate( g, z, s, rot ) {
	const c = s.color ?? 0x2a2a30, c2 = s.color2 ?? 0x3ad8a8;
	const k = group();
	const shell = MT.plastic( c ), cuff = MT.plastic( c2 );
	// boot: a lathe-ish shell made of rounded boxes: toe box, foot, heel, the cuff around the ankle
	add( k, G.rbox( 0.26, 0.09, 0.1, 0.04, 3 ), shell, [ 0.01, 0.085, 0 ] );
	add( k, G.rbox( 0.11, 0.16, 0.1, 0.045, 3 ), shell, [ - 0.065, 0.12, 0 ] );
	add( k, G.rbox( 0.12, 0.09, 0.108, 0.04, 2 ), cuff, [ - 0.06, 0.23, 0 ], [ 0, 0, 0.12 ] );
	// liner and laces down the front
	add( k, G.rbox( 0.08, 0.1, 0.07, 0.03, 2 ), fabric( 0x1a1a1c, 'mesh', 0x3a3a3e, { rep: 3 } ), [ - 0.04, 0.24, 0 ] );
	const laces = [];
	for ( let i = 0; i < 5; i ++ ) laces.push( barGeo( [ 0.04 - i * 0.022, 0.135 + i * 0.012, - 0.03 ], [ 0.03 - i * 0.022, 0.14 + i * 0.012, 0.03 ], 0.0025, 4 ) );
	merged( k, laces, M( 0xf2f2f2, { rough: 0.8 } ) );
	// the cuff buckle and power strap
	add( k, new THREE.BoxGeometry( 0.025, 0.012, 0.11 ), MT.web( 0x111111 ), [ - 0.02, 0.2, 0 ], [ 0, 0, 0.5 ] );
	add( k, new THREE.BoxGeometry( 0.03, 0.022, 0.012 ), MT.alu(), [ - 0.03, 0.25, 0.055 ] );
	// frame, four wheels, heel brake
	add( k, new THREE.BoxGeometry( 0.27, 0.03, 0.012 ), MT.alu(), [ 0, 0.05, - 0.016 ] );
	add( k, new THREE.BoxGeometry( 0.27, 0.03, 0.012 ), MT.alu(), [ 0, 0.05, 0.016 ] );
	for ( let i = 0; i < 4; i ++ ) wheel( k, - 0.105 + i * 0.07, 0.04, 0, 0.04, 0.024, { tyre: M( 0xd8e8ec, { rough: 0.35 } ), rim: MT.plastic( c2 ), inner: 0.023, seg: 14 } );
	add( k, G.rbox( 0.06, 0.05, 0.04, 0.012, 2 ), MT.rubber(), [ - 0.165, 0.05, 0 ], [ 0, 0, - 0.5 ] );
	k.position.z = z; k.rotation.y = rot;
	g.add( k );
}

function supModel( s ) {
	const g = group(), c = s.color ?? 0xf2f0e8, c2 = s.color2 ?? 0x1e8aa8;
	const L = 3.2, W = 0.8, T = 0.12;
	const hw = ( t ) => {
		if ( t < 0.04 ) return W / 2 * ( 0.82 + 0.1 * Math.sin( t / 0.04 * PI / 2 ) );
		if ( t < 0.45 ) return W / 2 * ( 0.92 + 0.08 * Math.sin( ( t - 0.04 ) / 0.41 * PI / 2 ) );
		return W / 2 * Math.pow( Math.max( 0, 1 - ( ( t - 0.45 ) / 0.55 ) ** 2.4 ), 0.5 );
	};
	// rocker: the nose lifts
	const yf = ( t, s2 ) => T + ( t > 0.72 ? ( ( t - 0.72 ) / 0.28 ) ** 2 * 0.1 : 0 ) + ( t < 0.06 ? ( 0.06 - t ) * 0.2 : 0 ) - 0.006 * s2 * s2;
	const S = pslab( L, hw, yf, T, { N: 64, M: 10, K: 6, rr: 0.05 } );
	const top = M( 0xffffff, { rough: 0.35, map: tx( 'supTop' + c + c2, 1024, 256, ( ctx, Wc, Hc ) => {
		ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, Wc, Hc );
		// a colour band round the rails and the brand on the nose
		ctx.fillStyle = css( c2 ); ctx.fillRect( 0, 0, Wc, Hc * 0.08 ); ctx.fillRect( 0, Hc * 0.92, Wc, Hc * 0.08 );
		ctx.fillStyle = css( shade( c2, 0.35 ) ); ctx.fillRect( 0, Hc * 0.08, Wc, Hc * 0.015 ); ctx.fillRect( 0, Hc * 0.905, Wc, Hc * 0.015 );
		glyph( ctx, 'wave', Wc * 0.74, Hc * 0.5, Hc * 0.38, css( c2 ) );
		text( ctx, 'KAIMANA', Wc * 0.86, Hc * 0.5, Wc * 0.16, 64, c2, { family: 'Arial Black, Arial, sans-serif' } );
		text( ctx, "10'6\"  ALL ROUND", Wc * 0.12, Hc * 0.5, Wc * 0.12, 22, c2, { weight: 'bold' } );
	} ) } );
	add( g, S.top, top );
	add( g, S.bottom, M( shade( c, - 0.05 ), { rough: 0.4 } ) );
	add( g, S.rim, M( c2, { rough: 0.35 } ) );
	// the deck pad: diamond-grooved EVA, a raised kick at the tail
	const padTex = tx( 'supPad', 512, 256, ( ctx, Wc, Hc ) => {
		ctx.fillStyle = '#3a3e44'; ctx.fillRect( 0, 0, Wc, Hc );
		ctx.strokeStyle = '#26292e'; ctx.lineWidth = 3;
		for ( let i = - Hc; i < Wc + Hc; i += 18 ) { ctx.beginPath(); ctx.moveTo( i, 0 ); ctx.lineTo( i + Hc, Hc ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( i + Hc, 0 ); ctx.lineTo( i, Hc ); ctx.stroke(); }
		ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect( Wc * 0.45, Hc * 0.4, Wc * 0.1, Hc * 0.2 );
	} );
	add( g, patchOn( L, hw, yf, 0.07, 0.55, - 0.82, 0.82, 0.004, 30, 8 ), M( 0xffffff, { map: padTex, rough: 0.95 } ) );
	add( g, patchOn( L, hw, yf, 0.07, 0.12, - 0.6, 0.6, 0.012, 6, 6 ), M( 0x2a2d32, { rough: 0.95 } ) );
	// the carry handle: a recess in the pad and a strap across it
	const mid = 0.43;
	add( g, new THREE.BoxGeometry( 0.14, 0.004, 0.05 ), M( 0x101012, { rough: 0.9 } ), [ ( mid - 0.5 ) * L, yf( mid, 0 ) + 0.006, 0 ] );
	add( g, strapGeo( [ [ ( mid - 0.5 ) * L - 0.06, yf( mid, 0 ) + 0.006, 0 ], [ ( mid - 0.5 ) * L, yf( mid, 0 ) + 0.018, 0 ], [ ( mid - 0.5 ) * L + 0.06, yf( mid, 0 ) + 0.006, 0 ] ], 0.035, 0.004 ), MT.web( 0x111214 ) );
	// bungees over the nose: four D-rings and the cords in a cross
	const bx = ( 0.74 - 0.5 ) * L, bz = 0.2, by = yf( 0.74, 0 ) + 0.006;
	const rings = [ [ bx - 0.22, - bz ], [ bx + 0.22, - bz * 0.8 ], [ bx + 0.22, bz * 0.8 ], [ bx - 0.22, bz ] ];
	for ( const [ x, z ] of rings ) add( g, new THREE.TorusGeometry( 0.018, 0.004, 6, 12 ), MT.chrome(), [ x, by + 0.004, z ], [ PI / 2, 0, 0 ] );
	const cords = [];
	for ( const [ a, b ] of [ [ 0, 2 ], [ 1, 3 ], [ 0, 1 ], [ 3, 2 ] ] ) cords.push( barGeo( [ rings[ a ][ 0 ], by + 0.008, rings[ a ][ 1 ] ], [ rings[ b ][ 0 ], by + 0.008, rings[ b ][ 1 ] ], 0.0045, 6 ) );
	merged( g, cords, M( 0x141416, { rough: 0.6 } ) );
	// the leash plug at the tail and the fin box underneath
	add( g, G.cyl( 0.016, 0.016, 0.006, 12 ), M( 0x101012, { rough: 0.6 } ), [ - L / 2 + 0.1, yf( 0.03, 0 ) - 0.002, 0 ] );
	add( g, G.cylZ( 0.004, 0.022, 6 ), MT.steel(), [ - L / 2 + 0.1, yf( 0.03, 0 ) + 0.004, 0 ] );
	add( g, new THREE.BoxGeometry( 0.22, 0.004, 0.03 ), M( 0x101012, { rough: 0.6 } ), [ - L / 2 + 0.25, 0.001, 0 ] );
	ground( g, false );
	g.userData.iconDir = [ 0.35, 0.9, 0.55 ];
	g.userData.hold = { p: [ - 0.05, 0.06, W / 2 ], a: [ 1, 0, 0 ], f: [ 0, 0, 1 ] };
	g.userData.view = UNDERARM;
	return g;
}
// carried under the right arm on its rail: nose forward, the deck facing in
const UNDERARM = { at: [ 0.3, - 0.36, - 0.05 ], axis: [ 0.03, 0.06, - 1 ], front: [ 0, 1, 0 ] };

function paddleModel( s ) {
	const g = group(), c = s.color ?? 0x1e8aa8, y = 0.0145;
	// the blade: a teardrop slab, its face printed, a spine down the back to the neck
	const bw = ( t ) => 0.105 * Math.pow( Math.sin( clamp( t, 0, 1 ) * PI * 0.92 + 0.12 ), 0.6 ) * ( 1 - 0.25 * t );
	const S = pslab( 0.46, bw, () => y + 0.006, 0.012, { N: 24, M: 6, K: 2, rr: 0.004 } );
	const face = M( 0xffffff, { rough: 0.35, map: tx( 'blade' + c, 256, 128, ( ctx, W, H ) => {
		ctx.fillStyle = '#1c1d20'; ctx.fillRect( 0, 0, W, H );
		ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W * 0.35, H );
		text( ctx, 'KAIMANA', W * 0.62, H * 0.5, W * 0.5, 34, c, { family: 'Arial Black, Arial, sans-serif' } );
	} ) } );
	add( g, S.top, face, [ 0.23, 0, 0 ] ); add( g, S.bottom, M( 0x1c1d20, { rough: 0.35 } ), [ 0.23, 0, 0 ] ); add( g, S.rim, M( 0x2a2b2e, { rough: 0.4 } ), [ 0.23, 0, 0 ] );
	add( g, G.cylX( 0.005, 0.3, 8, 0.012 ), M( 0x1c1d20, { rough: 0.4 } ), [ 0.31, y + 0.006, 0 ] );
	// shaft: carbon, a coloured band, the adjustment clamp; the T-grip
	const carbon = M( 0x26282c, { rough: 0.28, metal: 0.2 } );
	add( g, G.cylX( 0.0145, 1.46, 14 ), carbon, [ 1.16, y, 0 ] );
	add( g, G.cylX( 0.0155, 0.12, 14 ), M( c, { rough: 0.3 } ), [ 0.55, y, 0 ] );
	add( g, G.cylX( 0.019, 0.05, 14 ), MT.plastic( 0x18191b ), [ 1.35, y, 0 ] );
	add( g, new THREE.BoxGeometry( 0.06, 0.012, 0.01 ), MT.plastic( c ), [ 1.35, y, 0.021 ] );
	add( g, G.rbox( 0.04, 0.029, 0.13, 0.012, 2 ), MT.plastic( 0x18191b ), [ 1.91, 0, 0 ] );
	add( g, G.cylX( 0.016, 0.06, 10 ), MT.plastic( 0x18191b ), [ 1.87, y, 0 ] );
	// held like a staff, blade down
	g.userData.hold = { p: [ 1.2, y, 0 ], a: [ 1, 0, 0 ], f: [ 0, 0, 1 ] };
	g.userData.view = { at: [ 0.22, - 0.18, - 0.38 ], axis: [ 0.25, 0.92, - 0.25 ], front: [ 1, 0, 0.2 ] };
	return g;
}

function grappleModel() {
	const g = group(), steel = M( 0x2e3136, { rough: 0.4, metal: 0.85 } ), bright = MT.steel();
	// the shank and the eye
	add( g, G.cylX( 0.012, 0.24, 10 ), steel, [ 0.0, 0.03, 0 ] );
	for ( let i = 0; i < 6; i ++ ) add( g, G.cylX( 0.0128, 0.006, 10 ), bright, [ - 0.07 + i * 0.015, 0.03, 0 ] );
	add( g, new THREE.TorusGeometry( 0.024, 0.0065, 8, 18 ), steel, [ - 0.142, 0.03, 0 ] );
	// the hub and four tines, curved back towards the eye, sharpened
	add( g, G.cylX( 0.02, 0.03, 10 ), steel, [ 0.12, 0.03, 0 ] );
	for ( let i = 0; i < 4; i ++ ) {
		const a = i / 4 * PI * 2 + PI / 4;
		const dy = Math.cos( a ), dz = Math.sin( a );
		const pts = [ [ 0.12, 0.03, 0 ], [ 0.15, 0.03 + dy * 0.04, dz * 0.04 ], [ 0.15, 0.03 + dy * 0.1, dz * 0.1 ], [ 0.1, 0.03 + dy * 0.13, dz * 0.13 ], [ 0.05, 0.03 + dy * 0.12, dz * 0.12 ] ];
		add( g, tubeGeo( pts, 0.007, 16, 6 ), steel );
		add( g, new THREE.ConeGeometry( 0.007, 0.03, 6 ).rotateZ( PI / 2 ), bright, [ 0.035, 0.03 + dy * 0.118, dz * 0.118 ] );
	}
	// a short chain to the rope
	for ( let i = 0; i < 4; i ++ ) add( g, new THREE.TorusGeometry( 0.011, 0.003, 5, 10 ).scale( 1.5, 1, 1 ), bright, [ - 0.18 - i * 0.026, 0.03, 0 ], [ i % 2 ? PI / 2 : 0, 0, 0 ] );
	return g;
}

// a J hook (escape ladder, rope anchor): rising d, the bite r
function hookGeo( d = 0.12, r = 0.02 ) {
	const pts = [ [ 0, 0, 0 ], [ 0, d * 0.7, 0 ], [ 0.02, d, 0 ], [ 0.07, d + 0.02, 0 ], [ 0.12, d, 0 ], [ 0.13, d * 0.75, 0 ] ];
	return tubeGeo( pts, r * 0.5, 20, 6 );
}

function ladderRails( g, len, w, o = {} ) {
	// rails rising along +y in the ladder's own frame, rungs between them
	const rail = o.rail || MT.alu(), rung = o.rung || MT.alu();
	const geos = [];
	for ( const x of [ - w / 2, w / 2 ] ) geos.push( new THREE.BoxGeometry( 0.024, len, o.depth ?? 0.075 ).translate( x, len / 2, 0 ) );
	merged( g, geos, rail );
	const rg = [];
	for ( let y = o.first ?? 0.25; y < len - 0.12; y += o.step ?? 0.3 ) {
		const b = new THREE.CylinderGeometry( 0.016, 0.016, w, 8, 1 ).rotateZ( PI / 2 ).scale( 1, 0.7, 1 ).translate( 0, y, 0.004 );
		rg.push( b );
	}
	merged( g, rg, rung );
	// rubber feet and caps
	for ( const x of [ - w / 2, w / 2 ] ) {
		add( g, new THREE.BoxGeometry( 0.04, 0.05, o.depth ?? 0.08 ), MT.rubber(), [ x, 0.025, 0 ] );
		add( g, new THREE.BoxGeometry( 0.03, 0.03, ( o.depth ?? 0.075 ) + 0.004 ), MT.black(), [ x, len - 0.015, 0 ] );
	}
}

// a ladder's own frame (rails up +y, rungs across x) laid flat: rails along x, rungs across z
const FLAT = new THREE.Quaternion().setFromRotationMatrix( new THREE.Matrix4().makeBasis( V( 0, 0, 1 ), V( 1, 0, 0 ), V( 0, 1, 0 ) ) );

function ladderItemFold() {
	// four 0.93 m sections folded flat on each other, the locking hinges at the joints
	const g = group(), w = 0.42, d = 0.06;
	for ( let i = 0; i < 4; i ++ ) {
		const sec = group();
		ladderRails( sec, 0.93, w, { depth: d, first: 0.16, step: 0.3 } );
		sec.quaternion.copy( FLAT );
		sec.position.set( - 0.465, d / 2 + i * 0.066, 0 );
		g.add( sec );
	}
	for ( const z of [ - w / 2 - 0.022, w / 2 + 0.022 ] ) for ( let i = 0; i < 3; i ++ ) {
		const x = i % 2 ? 0.475 : - 0.475;
		add( g, G.rbox( 0.07, 0.11, 0.03, 0.01, 2 ), MT.black(), [ x, 0.035 + i * 0.066, z ] );
		add( g, new THREE.BoxGeometry( 0.05, 0.03, 0.012 ), MT.plastic( 0xd0202a ), [ x, 0.06 + i * 0.066, z + Math.sign( z ) * 0.02 ] );
	}
	add( g, new THREE.PlaneGeometry( 0.2, 0.08 ).rotateX( - PI / 2 ), M( 0xffffff, { rough: 0.6, map: tx( 'foldlbl', 200, 80, ( ctx, W, H ) => { ctx.fillStyle = '#f2c21a'; ctx.fillRect( 0, 0, W, H ); text( ctx, 'MULTI-POSITION', W / 2, H * 0.35, W * 0.9, 20, 0x111111 ); text( ctx, '3.6 m · 136 kg', W / 2, H * 0.72, W * 0.9, 20, 0x111111 ); } ) } ), [ 0.1, 3 * 0.066 + d + 0.002, 0 ] );
	g.userData.hold = { p: [ 0, 0.1, w / 2 ], a: [ 1, 0, 0 ], f: [ 0, 0, 1 ] };
	g.userData.view = SHOULDER;
	return g;
}

function ladderItemExt() {
	// the base and the fly closed up together, its rope and pulley, rung locks; fibreglass rails
	const g = group(), w = 0.44, len = 3.6, fg = M( 0xe8b21a, { rough: 0.45 } );
	const a = group(); ladderRails( a, len, w, { rail: fg, depth: 0.075 } ); a.quaternion.copy( FLAT ); a.position.set( - len / 2, 0.04, 0 ); g.add( a );
	const b = group(); ladderRails( b, len * 0.96, w - 0.07, { rail: fg, depth: 0.07, first: 0.4 } ); b.quaternion.copy( FLAT ); b.position.set( - len / 2 + 0.1, 0.115, 0 ); g.add( b );
	for ( const z of [ - w / 2 + 0.04, w / 2 - 0.04 ] ) add( g, G.rbox( 0.08, 0.03, 0.05, 0.008, 2 ), MT.alu(), [ - 1.3, 0.15, z ] );
	add( g, G.cylZ( 0.03, 0.02, 14 ), MT.alu(), [ len / 2 - 0.2, 0.12, 0 ] );
	add( g, tubeGeo( [ [ len / 2 - 0.2, 0.12, 0 ], [ 0.2, 0.1, 0.05 ], [ - 1.0, 0.09, 0.06 ], [ - 1.25, 0.13, 0.02 ] ], 0.005, 24, 5 ), ropeMat( 'hemp' ) );
	add( g, new THREE.PlaneGeometry( 0.22, 0.06 ), M( 0xffffff, { rough: 0.6, map: tx( 'extlbl', 220, 60, ( ctx, W, H ) => { ctx.fillStyle = '#ffffff'; ctx.fillRect( 0, 0, W, H ); ctx.fillStyle = '#d0202a'; ctx.fillRect( 0, 0, W, H * 0.4 ); text( ctx, 'DANGER', W / 2, H * 0.2, W * 0.8, 18, 0xffffff ); text( ctx, '75° · 6.5 m', W / 2, H * 0.7, W * 0.8, 18, 0x111111 ); } ) } ), [ - 0.6, 0.04, w / 2 + 0.0135 ] );
	g.userData.hold = { p: [ 0, 0.04, w / 2 ], a: [ 1, 0, 0 ], f: [ 0, 0, 1 ] };
	g.userData.view = SHOULDER;
	return g;
}
// carried over the right shoulder: the long axis forward, the rungs upright
const SHOULDER = { at: [ 0.27, - 0.12, - 0.15 ], axis: [ 0.06, 0.08, - 1 ], front: [ 0, 1, 0 ] };

function cartModel() {
	const g = group(), wire = MT.chrome(), frame = MT.chrome();
	const L = 0.88, back = 0.55, front = 0.47, y0 = 0.42, y1 = 0.98, x0 = - 0.42, x1 = 0.46;
	const halfAt = ( x ) => ( back + ( front - back ) * ( x - x0 ) / ( x1 - x0 ) ) / 2;
	const geos = [];
	// side walls: verticals and three horizontals
	for ( let x = x0 + 0.02; x <= x1; x += 0.04 ) for ( const s of [ - 1, 1 ] ) geos.push( barGeo( [ x, y0, s * halfAt( x ) ], [ x, y1, s * halfAt( x ) ], 0.0025, 4 ) );
	for ( const y of [ 0.56, 0.7, 0.84 ] ) for ( const s of [ - 1, 1 ] ) geos.push( barGeo( [ x0, y, s * halfAt( x0 ) ], [ x1, y, s * halfAt( x1 ) ], 0.0025, 4 ) );
	// the front wall and the back gate
	for ( let z = - front / 2 + 0.02; z < front / 2; z += 0.04 ) geos.push( barGeo( [ x1, y0, z ], [ x1, y1, z ], 0.0025, 4 ) );
	for ( let z = - back / 2 + 0.02; z < back / 2; z += 0.04 ) geos.push( barGeo( [ x0 - 0.01, y0 + 0.06, z ], [ x0 - 0.04, y1, z ], 0.0025, 4 ) );
	for ( const y of [ 0.6, 0.78 ] ) { geos.push( barGeo( [ x1, y, - front / 2 ], [ x1, y, front / 2 ], 0.0025, 4 ) ); geos.push( barGeo( [ x0 - 0.02, y, - back / 2 ], [ x0 - 0.03, y, back / 2 ], 0.0025, 4 ) ); }
	// the floor grid
	for ( let x = x0 + 0.02; x <= x1; x += 0.04 ) geos.push( barGeo( [ x, y0, - halfAt( x ) ], [ x, y0, halfAt( x ) ], 0.0022, 4 ) );
	for ( let z = - 0.22; z <= 0.22; z += 0.055 ) geos.push( barGeo( [ x0, y0, z ], [ x1, y0, z * front / back ], 0.0022, 4 ) );
	merged( g, geos, wire );
	// thicker rims round the top and the bottom edge
	const rim = [];
	const top = [ [ x0 - 0.04, y1, - back / 2 ], [ x1, y1, - front / 2 ], [ x1, y1, front / 2 ], [ x0 - 0.04, y1, back / 2 ], [ x0 - 0.04, y1, - back / 2 ] ];
	for ( let i = 1; i < top.length; i ++ ) rim.push( barGeo( top[ i - 1 ], top[ i ], 0.006, 6 ) );
	const bot = [ [ x0, y0, - back / 2 ], [ x1, y0, - front / 2 ], [ x1, y0, front / 2 ], [ x0, y0, back / 2 ], [ x0, y0, - back / 2 ] ];
	for ( let i = 1; i < bot.length; i ++ ) rim.push( barGeo( bot[ i - 1 ], bot[ i ], 0.005, 6 ) );
	// the chassis: base rails, uprights to the handle, the lower tray
	const cy = 0.11;
	for ( const s of [ - 1, 1 ] ) {
		rim.push( barGeo( [ - 0.38, cy, s * 0.23 ], [ 0.42, cy, s * 0.19 ], 0.011, 8 ) );
		rim.push( barGeo( [ - 0.38, cy, s * 0.23 ], [ - 0.47, 1.0, s * 0.26 ], 0.011, 8 ) );
		rim.push( barGeo( [ 0.42, cy, s * 0.19 ], [ x1, y0, s * front / 2 ], 0.008, 6 ) );
	}
	for ( let x = - 0.3; x <= 0.36; x += 0.06 ) rim.push( barGeo( [ x, cy + 0.03, - 0.2 ], [ x, cy + 0.03, 0.2 ], 0.003, 4 ) );
	merged( g, rim, frame );
	// the handle (red plastic) and the child seat flap
	const red = MT.plastic( 0xc8202a );
	add( g, G.cylZ( 0.019, 0.56, 14 ), red, [ - 0.475, 1.01, 0 ] );
	add( g, G.rbox( 0.012, 0.18, 0.4, 0.004, 2 ), MT.plastic( 0xc8202a ), [ x0 - 0.03, 0.88, 0 ], [ 0, 0, 0.1 ] );
	add( g, new THREE.PlaneGeometry( 0.3, 0.1 ), M( 0xffffff, { rough: 0.5, map: tx( 'cartseat', 256, 90, ( ctx, W, H ) => { ctx.fillStyle = '#c8202a'; ctx.fillRect( 0, 0, W, H ); text( ctx, 'MAKAI MART', W / 2, H * 0.42, W * 0.85, 40, 0xffffff, { family: 'Arial Black, Arial, sans-serif' } ); text( ctx, 'Please return cart', W / 2, H * 0.8, W * 0.85, 16, 0xffffff ); } ) } ), [ x0 - 0.045, 0.88, 0 ], [ 0, - PI / 2, - 0.1 ] );
	// four swivel casters
	for ( const [ x, z ] of [ [ - 0.38, - 0.23 ], [ - 0.38, 0.23 ], [ 0.42, - 0.19 ], [ 0.42, 0.19 ] ] ) {
		add( g, G.cyl( 0.016, 0.016, 0.012, 10 ), MT.chrome(), [ x, cy - 0.016, z ] );
		merged( g, [ new THREE.BoxGeometry( 0.05, 0.05, 0.004 ).translate( 0, 0, 0.018 ), new THREE.BoxGeometry( 0.05, 0.05, 0.004 ).translate( 0, 0, - 0.018 ) ], MT.chrome(), [ x + 0.012, cy - 0.045, z ] );
		wheel( g, x + 0.02, 0.05, z, 0.05, 0.028, { tyre: M( 0x2a2a2e, { rough: 0.7 } ), rim: MT.plastic( 0x8a8e94 ), inner: 0.032, seg: 16 } );
	}
	return g;
}

function barrowModel( s ) {
	const g = group(), c = s.color ?? 0x2a6a3a;
	const paint = M( c, { rough: 0.42, metal: 0.35, side: THREE.DoubleSide } );
	// the tray: rounded rectangles lofted from a small floor to a wide top, the front sloping out to tip the load
	// half sizes (along, across) and a shift forward: a small floor, a wide top, the front sloping out
	const rings = [ [ 0.2, 0.15, 0, 0.0 ], [ 0.27, 0.22, 0, 0.02 ], [ 0.4, 0.31, 0, 0.06 ], [ 0.45, 0.34, 0, 0.09 ] ];
	const N = 32, pos = [], idx = [];
	const yAt = [ 0.4, 0.47, 0.6, 0.66 ];
	for ( let r = 0; r < rings.length; r ++ ) {
		const [ hx, hz, cr, sx ] = rings[ r ];
		for ( let i = 0; i < N; i ++ ) {
			const a = i / N * PI * 2;
			// a superellipse: rounded corners
			const cx = Math.sign( Math.cos( a ) ) * Math.pow( Math.abs( Math.cos( a ) ), 0.45 ), cz = Math.sign( Math.sin( a ) ) * Math.pow( Math.abs( Math.sin( a ) ), 0.45 );
			const front = Math.cos( a ) > 0 ? 1 + r * 0.08 : 1;
			pos.push( cx * hx * front + sx, yAt[ r ], cz * hz );
			void cr;
		}
	}
	for ( let r = 0; r < rings.length - 1; r ++ ) for ( let i = 0; i < N; i ++ ) { const a = r * N + i, b = r * N + ( i + 1 ) % N, c2 = a + N, d = b + N; idx.push( a, b, c2, b, d, c2 ); }
	// the floor
	const cIdx = pos.length / 3; pos.push( 0, yAt[ 0 ], 0 );
	for ( let i = 0; i < N; i ++ ) idx.push( cIdx, ( i + 1 ) % N, i );
	const tray = new THREE.BufferGeometry();
	tray.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	tray.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( pos.length / 3 * 2 ), 2 ) );
	tray.setIndex( idx ); tray.computeVertexNormals();
	add( g, tray, paint, [ 0.08, 0, 0 ] );
	// the rolled rim
	const rimPts = [];
	for ( let i = 0; i <= N; i ++ ) { const k = ( rings.length - 1 ) * N + ( i % N ); rimPts.push( V( pos[ k * 3 ] + 0.08, pos[ k * 3 + 1 ], pos[ k * 3 + 2 ] ) ); }
	add( g, tubeGeo( rimPts, 0.012, 64, 6, true ), M( shade( c, - 0.15 ), { rough: 0.4, metal: 0.35 } ) );
	// handles from the grips under the tray to the wheel's fork
	const steel = M( 0x3a3d40, { rough: 0.45, metal: 0.7 } );
	for ( const z of [ - 0.27, 0.27 ] ) {
		add( g, barGeo( [ - 0.8, 0.55, z * 1.05 ], [ 0.6, 0.2, z * 0.22 ], 0.016, 10 ), steel );
		add( g, barGeo( [ - 0.81, 0.552, z * 1.05 ], [ - 0.64, 0.51, z * 1.0 ], 0.02, 10 ), MT.rubber() );
		// legs
		add( g, tubeGeo( [ [ - 0.24, 0.43, z * 0.8 ], [ - 0.27, 0.25, z * 0.86 ], [ - 0.29, 0.02, z * 0.9 ], [ - 0.22, 0.012, z * 0.9 ] ], 0.011, 12, 6 ), steel );
		// tray brackets down to the handles
		add( g, barGeo( [ - 0.12, 0.41, z * 0.55 ], [ - 0.12, 0.42, z * 0.62 ], 0.01, 6 ), steel );
		add( g, barGeo( [ 0.3, 0.4, z * 0.45 ], [ 0.3, 0.31, z * 0.4 ], 0.009, 6 ), steel );
	}
	// the wheel: a knobbly pneumatic tyre on a red rim, in its fork
	wheel( g, 0.6, 0.19, 0, 0.19, 0.085, { tyre: MT.tyre(), rim: MT.paint( 0xd0302a ), inner: 0.105, knobs: 22, hub: MT.steel() } );
	add( g, G.cylZ( 0.009, 0.16, 8 ), MT.steel(), [ 0.6, 0.19, 0 ] );
	add( g, new THREE.BoxGeometry( 0.12, 0.03, 0.03 ), steel, [ 0.62, 0.42, 0 ], [ 0, 0, - 1.0 ] );
	return g;
}

function wagonFolded( s ) {
	// folded: the fabric tub collapsed into a tall bundle between the frame's folded legs, standing on its four fat wheels,
	// a strap round it, the pull handle folded up its side
	const g = group(), c = s.color ?? 0x1e7ab8;
	const fab = fabric( c, 'canvas', 0xffffff, { rep: 3 } );
	const y0 = 0.2, H = 0.6;
	// the fabric in folds: a few pleats stacked side by side
	for ( let i = 0; i < 5; i ++ ) add( g, G.rbox( 0.055, H, 0.26, 0.025, 2 ), i % 2 ? fab : fabric( shade( c, - 0.12 ), 'canvas', 0xffffff, { rep: 3 } ), [ - 0.11 + i * 0.055, y0, 0 ] );
	// the frame: four corner tubes and the folded X-legs
	const fr = [];
	for ( const [ x, z ] of [ [ - 0.15, - 0.14 ], [ 0.15, - 0.14 ], [ - 0.15, 0.14 ], [ 0.15, 0.14 ] ] ) fr.push( barGeo( [ x, 0.12, z ], [ x, y0 + H + 0.02, z ], 0.01, 8 ) );
	for ( const z of [ - 0.15, 0.15 ] ) { fr.push( barGeo( [ - 0.14, 0.18, z ], [ 0.14, y0 + H - 0.05, z ], 0.008, 6 ) ); fr.push( barGeo( [ 0.14, 0.18, z ], [ - 0.14, y0 + H - 0.05, z ], 0.008, 6 ) ); }
	fr.push( barGeo( [ - 0.15, 0.12, 0 ], [ 0.15, 0.12, 0 ], 0.01, 8 ) );
	merged( g, fr, MT.black() );
	add( g, strapGeo( [ [ - 0.16, 0.5, - 0.15 ], [ 0.16, 0.5, - 0.15 ], [ 0.16, 0.5, 0.15 ], [ - 0.16, 0.5, 0.15 ], [ - 0.16, 0.5, - 0.15 ] ], 0.035, 0.004, [ 0, 1, 0 ] ), MT.web( 0x141414 ) );
	add( g, new THREE.BoxGeometry( 0.04, 0.03, 0.012 ), MT.black(), [ 0.0, 0.5, 0.158 ] );
	// four balloon wheels side by side
	for ( const [ x, z ] of [ [ - 0.13, - 0.2 ], [ 0.13, - 0.2 ], [ - 0.13, 0.2 ], [ 0.13, 0.2 ] ] ) wheel( g, x, 0.11, z, 0.11, 0.09, { tyre: M( 0xd8d8d2, { rough: 0.75 } ), rim: MT.plastic( 0x2a2a2e ), inner: 0.045, square: true, seg: 20 } );
	// the handle folded up the side, its T-grip at the top
	add( g, barGeo( [ 0.17, 0.14, 0 ], [ 0.17, 0.92, 0 ], 0.012, 8 ), MT.alu() );
	add( g, G.cylZ( 0.016, 0.16, 10 ), MT.rubber(), [ 0.17, 0.93, 0 ] );
	g.userData.iconDir = [ 0.8, 0.45, 1 ];
	g.userData.hold = { p: [ 0.17, 0.93, 0 ], a: [ 0, 0, 1 ], f: [ - 1, 0, 0 ], r: 0.016 };
	g.userData.view = BYHANDLE;
	return g;
}

function wagonOpen( s ) {
	// unfolded: a fabric tub on a steel frame, four balloon wheels, the pull handle out in front (+x)
	const g = group(), c = s.color ?? 0x1e7ab8;
	const fab = fabric( c, 'canvas', 0xffffff, { rep: 3, side: THREE.DoubleSide } );
	const L = 0.9, W = 0.5, H = 0.34, y0 = 0.28;
	// the tub: an open box of fabric (inside visible), piping on the edges, a mesh pocket
	add( g, new THREE.BoxGeometry( L, 0.004, W ), fab, [ 0, y0, 0 ] );
	for ( const s2 of [ - 1, 1 ] ) {
		add( g, new THREE.BoxGeometry( L, H, 0.004 ), fab, [ 0, y0 + H / 2, s2 * W / 2 ] );
		add( g, new THREE.BoxGeometry( 0.004, H, W ), fab, [ s2 * L / 2, y0 + H / 2, 0 ] );
	}
	const pipe = [];
	for ( const s2 of [ - 1, 1 ] ) { pipe.push( barGeo( [ - L / 2, y0 + H, s2 * W / 2 ], [ L / 2, y0 + H, s2 * W / 2 ], 0.008, 6 ) ); pipe.push( barGeo( [ s2 * L / 2, y0 + H, - W / 2 ], [ s2 * L / 2, y0 + H, W / 2 ], 0.008, 6 ) ); }
	merged( g, pipe, M( shade( c, - 0.4 ), { rough: 0.8 } ) );
	add( g, new THREE.PlaneGeometry( 0.3, 0.16 ), fabric( 0x1a1a1c, 'mesh', 0x3a3a3e, { rep: 3 } ), [ 0.1, y0 + 0.18, W / 2 + 0.006 ] );
	// the frame: corner posts, X-braces down the sides, axles
	const steel = MT.black(), fr = [];
	for ( const [ x, z ] of [ [ - L / 2, - W / 2 ], [ L / 2, - W / 2 ], [ - L / 2, W / 2 ], [ L / 2, W / 2 ] ] ) fr.push( barGeo( [ x, 0.12, z ], [ x, y0 + H, z ], 0.01, 8 ) );
	for ( const z of [ - W / 2 - 0.01, W / 2 + 0.01 ] ) { fr.push( barGeo( [ - L / 2, y0, z ], [ L / 2, y0 + H * 0.6, z ], 0.008, 6 ) ); fr.push( barGeo( [ - L / 2, y0 + H * 0.6, z ], [ L / 2, y0, z ], 0.008, 6 ) ); }
	for ( const x of [ - L / 2, L / 2 ] ) fr.push( barGeo( [ x, 0.12, - W / 2 - 0.06 ], [ x, 0.12, W / 2 + 0.06 ], 0.01, 8 ) );
	merged( g, fr, steel );
	for ( const [ x, z ] of [ [ - L / 2, - W / 2 - 0.06 ], [ - L / 2, W / 2 + 0.06 ], [ L / 2, - W / 2 - 0.06 ], [ L / 2, W / 2 + 0.06 ] ] ) wheel( g, x, 0.12, z, 0.12, 0.1, { tyre: M( 0xd8d8d2, { rough: 0.75 } ), rim: MT.plastic( 0x2a2a2e ), inner: 0.05, square: true, seg: 22 } );
	// the handle: a telescoping bar to a T-grip resting on the ground
	add( g, barGeo( [ L / 2, 0.14, 0 ], [ L / 2 + 0.85, 0.03, 0 ], 0.012, 8 ), MT.alu() );
	add( g, G.cylZ( 0.016, 0.16, 10 ), MT.rubber(), [ L / 2 + 0.86, 0.03, 0 ] );
	return g;
}

function truckModel( s, load = false ) {
	const g = group(), c = s.color ?? 0xd8302a, paint = MT.paint( c );
	const fr = [];
	// two rails up from the toe plate, the loop handle, cross braces
	for ( const z of [ - 0.18, 0.18 ] ) fr.push( barGeo( [ 0.03, 0.03, z ], [ - 0.04, 1.18, z ], 0.014, 10 ) );
	fr.push( tubeGeo( [ [ - 0.04, 1.18, - 0.18 ], [ - 0.06, 1.28, - 0.12 ], [ - 0.07, 1.31, 0 ], [ - 0.06, 1.28, 0.12 ], [ - 0.04, 1.18, 0.18 ] ], 0.014, 20, 8 ) );
	for ( const y of [ 0.35, 0.65, 0.95 ] ) fr.push( barGeo( [ 0.03 - y * 0.06, y, - 0.18 ], [ 0.03 - y * 0.06, y, 0.18 ], 0.009, 6 ) );
	merged( g, fr, paint );
	for ( const z of [ - 0.12, 0.12 ] ) add( g, barGeo( [ - 0.065, 1.29, z * 0.9 ], [ - 0.068, 1.305, z * 0.2 ], 0.019, 10 ), MT.rubber() );
	// the toe plate, its lip, the axle bracket
	add( g, new THREE.BoxGeometry( 0.2, 0.008, 0.38 ), MT.steel(), [ 0.12, 0.012, 0 ] );
	add( g, new THREE.BoxGeometry( 0.01, 0.02, 0.38 ), MT.steel(), [ 0.22, 0.02, 0 ] );
	add( g, new THREE.BoxGeometry( 0.08, 0.06, 0.32 ), paint, [ - 0.04, 0.13, 0 ] );
	add( g, G.cylZ( 0.01, 0.52, 8 ), MT.steel(), [ - 0.08, 0.13, 0 ] );
	for ( const z of [ - 0.24, 0.24 ] ) wheel( g, - 0.08, 0.13, z, 0.13, 0.07, { tyre: MT.tyre(), rim: MT.plastic( 0x8a8e94 ), inner: 0.065, seg: 22, knobs: 0 } );
	add( g, new THREE.PlaneGeometry( 0.14, 0.05 ), M( 0xffffff, { rough: 0.6, map: tx( 'truck', 160, 60, ( ctx, W, H ) => { ctx.fillStyle = '#f2f2ec'; ctx.fillRect( 0, 0, W, H ); text( ctx, '275 kg MAX', W / 2, H / 2, W * 0.9, 26, 0x111111 ); } ) } ), [ 0.0, 0.5, 0 ], [ 0, PI / 2, 0 ] );
	void load;
	return g;
}

function trolleyModel() {
	const g = group(), plate = M( 0xd8402a, { rough: 0.3, metal: 0.6 } );
	// side plates (two), pulleys between, the cable groove on top
	for ( const z of [ - 0.02, 0.02 ] ) {
		const sh = new THREE.Shape(); sh.moveTo( - 0.11, 0.0 ); sh.lineTo( 0.11, 0.0 ); sh.quadraticCurveTo( 0.13, 0.05, 0.08, 0.08 ); sh.lineTo( - 0.08, 0.08 ); sh.quadraticCurveTo( - 0.13, 0.05, - 0.11, 0 );
		const hole = new THREE.Path(); hole.absarc( 0, 0.025, 0.012, 0, PI * 2 ); sh.holes.push( hole );
		const geo = new THREE.ExtrudeGeometry( sh, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1 } );
		add( g, geo, plate, [ 0, 0.18, z - 0.0025 ] );
	}
	for ( const x of [ - 0.06, 0.06 ] ) {
		add( g, G.lathe( [ [ 0.005, - 0.014 ], [ 0.028, - 0.014 ], [ 0.03, - 0.01 ], [ 0.022, 0 ], [ 0.03, 0.01 ], [ 0.028, 0.014 ], [ 0.005, 0.014 ] ], 18 ).rotateX( PI / 2 ), MT.steel(), [ x, 0.235, 0 ] );
		add( g, G.cylZ( 0.006, 0.05, 8 ), MT.chrome(), [ x, 0.235, 0 ] );
	}
	// the stem and the handlebar below, its grips
	add( g, barGeo( [ 0, 0.18, 0 ], [ 0, 0.03, 0 ], 0.012, 10 ), MT.alu() );
	add( g, G.cylZ( 0.013, 0.44, 12 ), MT.alu(), [ 0, 0.025, 0 ] );
	for ( const z of [ - 1, 1 ] ) add( g, barGeo( [ 0, 0.025, z * 0.22 ], [ 0, 0.025, z * 0.1 ], 0.019, 12 ), MT.rubber() );
	// the lanyard and its locking carabiner
	add( g, strapGeo( [ [ 0.0, 0.17, 0.03 ], [ 0.04, 0.12, 0.05 ], [ 0.05, 0.07, 0.06 ] ], 0.02, 0.004, [ 1, 0, 0 ] ), MT.web( 0x111111 ) );
	add( g, new THREE.TorusGeometry( 0.024, 0.005, 6, 14 ).scale( 1, 1.5, 1 ), MT.paint( 0xd8b21a ), [ 0.05, 0.045, 0.06 ] );
	return g;
}

function pole( g, z, c, dx ) {
	const L = 0.68;
	const sec = [ [ 0, 0.36, 0.009, M( c, { rough: 0.3, metal: 0.5 } ) ], [ 0.34, 0.56, 0.0075, M( 0x26282c, { rough: 0.3, metal: 0.6 } ) ], [ 0.54, 0.62, 0.0065, MT.alu() ] ];
	const k = group();
	for ( const [ a, b, r, m ] of sec ) add( k, G.cylX( r, b - a, 12 ), m, [ ( a + b ) / 2, 0, 0 ] );
	// flick locks
	for ( const x of [ 0.34, 0.54 ] ) { add( k, G.cylX( 0.012, 0.025, 12 ), MT.plastic( 0x1a1a1c ), [ x, 0, 0 ] ); add( k, new THREE.BoxGeometry( 0.025, 0.006, 0.014 ), MT.plastic( c ), [ x, 0.012, 0 ] ); }
	// the cork grip, a foam extension under it, the wrist strap
	add( k, G.lathe( [ [ 0.001, 0 ], [ 0.016, 0.004 ], [ 0.017, 0.05 ], [ 0.014, 0.09 ], [ 0.016, 0.12 ], [ 0.012, 0.13 ], [ 0.001, 0.131 ] ], 14 ).rotateZ( - PI / 2 ), M( 0xb8885a, { rough: 0.95 } ), [ - 0.13, 0, 0 ] );
	add( k, G.cylX( 0.013, 0.08, 12 ), MT.plastic( 0x1a1a1c ), [ 0.04, 0, 0 ] );
	add( k, strapGeo( [ [ - 0.125, 0.012, 0 ], [ - 0.09, 0.05, 0.03 ], [ - 0.02, 0.06, 0.035 ], [ 0.02, 0.03, 0.02 ] ], 0.018, 0.003, [ 0, 1, 0 ] ), MT.web( c ) );
	// basket and carbide tip
	add( k, G.cyl( 0.03, 0.026, 0.006, 14 ).rotateZ( PI / 2 ), MT.plastic( 0x1a1a1c ), [ L - 0.03, 0, 0 ] );
	add( k, new THREE.ConeGeometry( 0.0065, 0.03, 8 ).rotateZ( - PI / 2 ), MT.steel(), [ L + 0.005, 0, 0 ] );
	k.position.set( dx, 0.017, z );
	g.add( k );
}

function umbrellaModel( s ) {
	const g = group(), c = s.color ?? 0x1e3a6a;
	const panels = tx( 'brolly' + c, 512, 64, ( ctx, W, H ) => {
		for ( let i = 0; i < 8; i ++ ) { ctx.fillStyle = i % 2 ? css( c ) : css( shade( c, 0.65 ) ); ctx.fillRect( i * W / 8, 0, W / 8 + 1, H ); }
		ctx.fillStyle = 'rgba(0,0,0,0.12)'; for ( let i = 0; i < 8; i ++ ) ctx.fillRect( i * W / 8 - 1, 0, 2, H );
	} );
	const handle = M( 0x5a3418, { rough: 0.45 } );
	// built upright (the shaft up +y, the hand just above the J handle at the origin), then laid down for the world
	const up = group();
	if ( s.open ) {
		// eight panels over eight ribs: a shallow dome, each panel sagging a little between its ribs
		const R = 0.52, H = 0.22, top = 0.86, geo = new THREE.SphereGeometry( 1, 64, 10, 0, PI * 2, 0, PI * 0.42 );
		const p = geo.attributes.position, s0 = Math.sin( PI * 0.42 ), c0 = Math.cos( PI * 0.42 );
		for ( let i = 0; i < p.count; i ++ ) {
			const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
			const a = Math.atan2( z, x ), sag = 1 - 0.06 * Math.pow( Math.abs( Math.sin( a * 4 ) ), 1.5 ) * ( 1 - y );
			p.setXYZ( i, x * R / s0 * sag, top - H + ( y - c0 ) / ( 1 - c0 ) * H, z * R / s0 * sag );
		}
		geo.computeVertexNormals();
		add( up, geo, M( 0xffffff, { rough: 0.7, map: panels, side: THREE.DoubleSide } ) );
		const rib = [];
		for ( let i = 0; i < 8; i ++ ) {
			const a = i / 8 * PI * 2 + PI / 8;
			const tip = V( Math.cos( a ) * R * 0.99, top - H - 0.005, Math.sin( a ) * R * 0.99 );
			rib.push( tubeGeo( [ [ 0, top - 0.01, 0 ], [ Math.cos( a ) * R * 0.5, top - H * 0.28, Math.sin( a ) * R * 0.5 ], tip ], 0.0025, 10, 4 ) );
			rib.push( barGeo( [ 0, top - 0.22, 0 ], [ Math.cos( a ) * R * 0.45, top - H * 0.26, Math.sin( a ) * R * 0.45 ], 0.002, 4 ) );
			add( up, G.cyl( 0.004, 0.006, 0.014, 6 ), MT.black(), [ tip.x, tip.y - 0.008, tip.z ] );
		}
		merged( up, rib, MT.steel() );
		add( up, G.cyl( 0.009, 0.009, 0.05, 10 ), MT.black(), [ 0, top - 0.24, 0 ] );
		add( up, G.cyl( 0.006, 0.006, 0.05, 8 ), MT.black(), [ 0, top, 0 ] );
		add( up, G.cyl( 0.0055, 0.0055, top, 10 ), MT.steel(), [ 0, 0, 0 ] );
	} else {
		// furled: the fabric wrapped round the shaft, a strap snapped round it, the ferrule
		const furl = G.lathe( [ [ 0.003, 0 ], [ 0.012, 0.02 ], [ 0.026, 0.28 ], [ 0.018, 0.5 ], [ 0.008, 0.6 ], [ 0.004, 0.62 ] ], 8 );
		const p = furl.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i ), a = Math.atan2( z, x ) + y * 7; const r = Math.hypot( x, z ); p.setXYZ( i, Math.cos( a ) * r, y, Math.sin( a ) * r ); }
		furl.computeVertexNormals();
		add( up, furl, M( 0xffffff, { rough: 0.7, map: panels } ), [ 0, 0.1, 0 ] );
		add( up, G.cyl( 0.004, 0.004, 0.1, 8 ), MT.steel(), [ 0, 0.0, 0 ] );
		add( up, G.cyl( 0.006, 0.003, 0.05, 8 ), MT.black(), [ 0, 0.72, 0 ] );
		add( up, G.cyl( 0.027, 0.027, 0.02, 12, true ), MT.web( c ), [ 0, 0.36, 0 ] );
		add( up, G.cyl( 0.006, 0.006, 0.006, 8 ), MT.chrome(), [ 0.026, 0.37, 0 ] );
	}
	add( up, tubeGeo( [ [ 0, 0.0, 0 ], [ 0, - 0.12, 0 ], [ 0.02, - 0.18, 0 ], [ 0.06, - 0.18, 0 ], [ 0.075, - 0.14, 0 ] ], 0.014, 16, 8 ), handle );
	// lying down: furled along x; open on its side, the rim and the handle on the ground
	up.rotation.z = s.open ? PI / 2 - 0.42 : - PI / 2;
	g.add( up );
	ground( g );
	g.updateMatrixWorld( true );
	// where the hand closes (just above the J) and the shaft's way, in the laid-down frame
	const m = up.matrix;
	const hp = V( 0, - 0.06, 0 ).applyMatrix4( m ), ha = V( 0, 1, 0 ).transformDirection( m ), hf = V( 1, 0, 0 ).transformDirection( m );
	g.userData.hold = { p: hp.toArray(), a: ha.toArray(), f: hf.toArray() };
	// open, it is held up over your head; furled, carried at the side
	// (open, tipped forward a little: the canopy's underside shows across the top of the view)
	g.userData.view = s.open ? { at: [ 0.16, - 0.17, - 0.34 ], axis: [ - 0.15, 1, - 0.36 ], front: [ 1, 0.2, 0 ] } : { at: [ 0.2, - 0.2, - 0.36 ], axis: [ 0.1, - 0.9, - 0.45 ], front: [ 1, 0, 0 ] };
	g.userData.iconDir = s.open ? [ 0.3, 0.6, 1 ] : [ 0.2, 0.5, 1 ];
	return g;
}

// =====================================================================================================================
// placed looks
// =====================================================================================================================

// clones of a compacted template, cached by key
const CACHE = new Map();
function compactCopy( key, build ) {
	let t = CACHE.get( key );
	if ( ! t ) { t = build(); t.updateMatrixWorld( true ); t = compact( t ); CACHE.set( key, t ); }
	return t.clone();
}
const lenKey = ( v ) => Math.round( v * 20 ) / 20;

// a rope hanging from the lip down to the ground: a grappling hook biting the edge, or a sling and a knot round an
// anchor; the slack piled at the bottom. In the record's frame (its position is the foot of the rope).
function ropeLook( p ) {
	const d = p.data, top = V( d.top[ 0 ] - p.pos.x, d.top[ 1 ] - p.pos.y, d.top[ 2 ] - p.pos.z );
	const out = V( Math.sin( d.face ), 0, Math.cos( d.face ) );
	const kind = p.item === 'climbing_rope' || p.stack?.data?.rope === 'climbing_rope' ? 'kern' : 'hemp';
	const key = `rope:${kind}:${lenKey( top.y )}:${d.hook ? 1 : 0}`;
	const o = compactCopy( key, () => {
		const g = group(), mat = kind === 'kern' ? ropeMat( 'kern', 0x1a4fb0, 0xf2c21a ) : ropeMat( 'hemp' );
		// built facing +z (out from the wall), turned to the face below
		const H = top.y;
		const pts = [ [ 0, H + 0.02, - 0.06 ], [ 0, H - 0.02, 0.02 ], [ 0, H - 0.25, 0.035 ], [ 0, H * 0.5, 0.05 ], [ 0.01, 0.4, 0.06 ], [ 0.03, 0.06, 0.1 ] ];
		add( g, tubeGeo( pts, 0.0055, Math.max( 12, Math.round( H * 4 ) ), 6 ), mat );
		// the slack coiled at the foot
		const coil = [];
		for ( let i = 0; i < 3; i ++ ) { const pc = []; for ( let k = 0; k <= 20; k ++ ) { const a = k / 20 * PI * 2; pc.push( V( 0.05 + Math.cos( a ) * ( 0.14 + i * 0.02 ), 0.01 + i * 0.008, 0.18 + Math.sin( a ) * ( 0.12 + i * 0.015 ) ) ); } coil.push( tubeGeo( pc, 0.0055, 30, 5, true ) ); }
		merged( g, coil, mat );
		if ( d.hook ) {
			const hk = grappleModel();
			hk.rotation.set( 0, PI / 2, - PI / 2 + 0.25 );
			hk.position.set( 0, H + 0.04, - 0.12 );
			g.add( hk );
		} else {
			// a sling round something on the roof, the knot at the lip
			add( g, new THREE.TorusGeometry( 0.06, 0.01, 6, 14 ), mat, [ 0, H + 0.03, - 0.35 ], [ PI / 2, 0, 0 ] );
			add( g, tubeGeo( [ [ 0, H + 0.03, - 0.3 ], [ 0, H + 0.04, - 0.1 ], [ 0, H + 0.02, - 0.02 ] ], 0.0065, 8, 5 ), mat );
			add( g, G.sph( 0.022, 8, 6 ), mat, [ 0, H + 0.01, 0.0 ] );
		}
		return g;
	} );
	o.rotation.y = Math.atan2( out.x, out.z );
	return o;
}

// a ladder leant on a wall (or lying pulled up on the roof): rails, rungs, feet; the extension's fly section overlapping
function ladderLook( p ) {
	const d = p.data, kind = p.item === 'extension_ladder' ? 'extension' : 'folding', S = LADDERS[ p.item ] || LADDERS.folding_ladder;
	const top = V( d.top[ 0 ], d.top[ 1 ], d.top[ 2 ] ), bot = V( d.bot[ 0 ], d.bot[ 1 ], d.bot[ 2 ] );
	const span = top.distanceTo( bot ), H = top.y - bot.y, run = Math.hypot( top.x - bot.x, top.z - bot.z );
	const len = span + ( d.ledge ? 0.9 : 0.15 );
	const lean = Math.atan2( run, H );
	const key = `ladder:${kind}:${lenKey( len )}:${d.up ? 1 : 0}`;
	return compactCopy( key + ':' + lenKey( lean ), () => {
		const g = group(), w = S.w;
		const lad = group();
		if ( kind === 'extension' ) {
			const fg = M( 0xe8b21a, { rough: 0.45 } );
			const base = Math.min( len, 3.7 );
			ladderRails( lad, base, w, { rail: fg } );
			if ( len > 3.6 ) {
				const fly = group(); ladderRails( fly, len - 2.9, w - 0.07, { rail: fg, depth: 0.07, first: 0.25 } );
				fly.position.set( 0, 2.9, 0.08 ); lad.add( fly );
				for ( const x of [ - w / 2 + 0.04, w / 2 - 0.04 ] ) add( lad, G.rbox( 0.05, 0.08, 0.05, 0.008, 2 ), MT.alu(), [ x, 3.0, 0.07 ] );
				add( lad, tubeGeo( [ [ 0, 3.6, 0.04 ], [ 0.02, 2.4, 0.06 ], [ 0.03, 1.2, 0.05 ], [ 0.01, 0.9, 0.04 ] ], 0.005, 20, 5 ), ropeMat( 'hemp' ) );
			}
		} else {
			ladderRails( lad, len, w, { step: 0.3 } );
			for ( let y = 0.95; y < len; y += 0.95 ) for ( const x of [ - w / 2 - 0.02, w / 2 + 0.02 ] ) {
				add( lad, G.rbox( 0.03, 0.08, 0.08, 0.01, 2 ), MT.black(), [ x, y, 0 ] );
				add( lad, new THREE.BoxGeometry( 0.012, 0.03, 0.05 ), MT.plastic( 0xd0202a ), [ x + Math.sign( x ) * 0.02, y, 0 ] );
			}
		}
		if ( d.up ) {
			// lying flat on the roof along the edge
			lad.quaternion.copy( FLAT ); lad.position.set( - len / 2, 0.04, 0 );
		} else {
			// leaning towards the wall (local -z), its foot at the origin
			lad.rotation.x = - lean;
		}
		g.add( lad );
		return g;
	} );
}

// an escape ladder hooked over the lip: webbing rails, steel rungs, stand-offs from the wall
function ropeLadderLook( p ) {
	const d = p.data, top = V( d.top[ 0 ] - p.pos.x, d.top[ 1 ] - p.pos.y, d.top[ 2 ] - p.pos.z );
	const H = top.y;
	const o = compactCopy( 'rladder:' + lenKey( H ), () => {
		const g = group(), web = MT.web( 0x1a1a1c ), steel = M( 0x3a3d42, { rough: 0.45, metal: 0.7 } ), w = LADDERS.rope_ladder.w;
		for ( const x of [ - w / 2, w / 2 ] ) {
			add( g, strapGeo( [ [ x, H, - 0.05 ], [ x, H - 0.1, 0.03 ], [ x, 0.3, 0.06 ], [ x, 0.02, 0.1 ] ], 0.03, 0.004, [ 0, 0, 1 ] ), web );
			add( g, hookGeo( 0.14, 0.022 ), M( 0x18181a, { rough: 0.5, metal: 0.4 } ), [ x, H - 0.12, 0.03 ], [ 0, PI / 2, 0 ] );
		}
		const rungs = [];
		for ( let y = H - 0.35; y > 0.15; y -= LADDERS.rope_ladder.rungs ) rungs.push( barGeo( [ - w / 2, y, 0.05 + ( H - y ) / H * 0.03 ], [ w / 2, y, 0.05 + ( H - y ) / H * 0.03 ], 0.012, 8 ) );
		merged( g, rungs, steel );
		const so = [];
		for ( let y = H - 0.7; y > 0.4; y -= 1.3 ) for ( const x of [ - w / 2 - 0.02, w / 2 + 0.02 ] ) so.push( beamGeo( [ x, y, 0.06 ], [ x, y, - 0.06 ], 0.02, 0.02 ) );
		merged( g, so, M( 0x18181a, { rough: 0.5 } ) );
		return g;
	} );
	o.rotation.y = d.face;
	return o;
}

// a zipline: the cable from one anchor to the other (sagging under its own weight), a tree strap at each end, a
// turnbuckle; strung to one end only, the rest of the cable coiled at its foot
function zipLook( p ) {
	const d = p.data, a = d.a, b = d.b;
	const g = group(), cable = MT.galv(), web = MT.web( 0xe8701a );
	const rel = ( q ) => V( q.x - p.pos.x, q.y - p.pos.y, q.z - p.pos.z );
	const strap = ( q ) => { const v = rel( q ); add( g, new THREE.TorusGeometry( 0.13, 0.012, 4, 16 ).scale( 1, 1, 0.35 ), web, [ v.x, v.y, v.z ], [ PI / 2, 0, 0 ] ); add( g, G.cylX( 0.012, 0.12, 8 ), MT.steel(), [ v.x, v.y - 0.08, v.z ] ); };
	strap( a );
	if ( b ) {
		strap( b );
		const pts = [];
		for ( let i = 0; i <= 40; i ++ ) { const q = zipShape( a, b, i / 40, d.sag ?? ZIP.sag, {} ); pts.push( rel( q ) ); }
		add( g, tubeGeo( pts, 0.0055, 80, 5 ), cable );
	} else {
		const c = [];
		for ( let i = 0; i < 8; i ++ ) { const pc = []; for ( let k = 0; k <= 20; k ++ ) { const t = k / 20 * PI * 2; pc.push( V( Math.cos( t ) * 0.22 + 0.3, 0.02 + i * 0.008, Math.sin( t ) * 0.2 ) ); } c.push( tubeGeo( pc, 0.004, 30, 4, true ) ); }
		merged( g, c, cable );
		const v = rel( a );
		add( g, tubeGeo( [ [ v.x, v.y - 0.08, v.z ], [ v.x * 0.5 + 0.15, v.y * 0.4, v.z * 0.5 ], [ 0.3, 0.06, 0 ] ], 0.0055, 16, 5 ), cable );
	}
	g.updateMatrixWorld( true );
	return compact( g );
}

// a cart standing about: the item's own model, a wagon unfolded, a hand truck with what it carries, things tipped over
function haulerLook( p ) {
	const id = p.stack?.id || p.item, def = getItem( id );
	let o;
	if ( id === 'beach_wagon' ) o = compactCopy( 'wagonOpen', () => wagonOpen( def?.model || {} ) );
	else o = itemModel( def );
	// a load: on the wagon's / cart's floor (a few of the things in it), on the hand truck's toe plate
	const items = itemsOf( p.stack || { data: {} } );
	const g = group();
	g.add( o );
	if ( p.data.load ) {
		const ld = getItem( p.data.load.it );
		if ( ld ) { const m = itemModel( ld ); m.position.set( 0.16, 0.02, 0 ); m.rotation.y = PI / 2; g.add( m ); }
	} else if ( items.length && id !== 'hand_truck' ) {
		// a 3 x 2 grid on the floor; each thing turned along the basket and shrunk to its cell if it's bigger (a cooler
		// mustn't poke through the wires)
		const floor = id === 'shopping_cart' ? 0.43 : id === 'wheelbarrow' ? 0.4 : 0.29;
		const cx = id === 'wheelbarrow' ? 0.2 : 0.28, cz = id === 'wheelbarrow' ? 0.2 : 0.23, top = id === 'wheelbarrow' ? 0.3 : 0.45;
		items.slice( 0, 6 ).forEach( ( s, i ) => {
			const d = getItem( s.id );
			if ( ! d ) return;
			const m = itemModel( d ), sz = modelInfo( d ).size;
			const k = Math.min( 1, cx / Math.max( 0.01, sz.x ), cz / Math.max( 0.01, sz.z ), top / Math.max( 0.01, sz.y ) );
			m.position.set( ( i % 3 - 1 ) * cx + ( id === 'shopping_cart' ? 0.02 : 0 ), floor, ( Math.floor( i / 3 ) - 0.5 ) * cz );
			m.rotation.y = ( i % 2 ) * 0.25 - 0.1;
			m.scale.setScalar( k * 0.95 );
			g.add( m );
		} );
	}
	if ( p.data.tipped ) { g.rotation.x = PI / 2 - 0.15; g.position.y = 0.25; }
	const root = group(); root.add( g );
	return root;
}

// a canopy spread out where you landed: the wing laid out flat as a crescent (lines gathered to the risers), or the round
// reserve collapsed in a heap of gores
function spreadLook( p ) {
	if ( p.data.chute ) return compactCopy( 'spreadChute', () => {
		const g = group(), gores = [ M( 0x5a6a4a, { rough: 0.85, side: THREE.DoubleSide } ), M( 0xe8e4d8, { rough: 0.85, side: THREE.DoubleSide } ) ];
		const r = rng( 8 );
		for ( let i = 0; i < 12; i ++ ) {
			const a0 = i / 12 * PI * 2, a1 = ( i + 1 ) / 12 * PI * 2;
			const geo = new THREE.CircleGeometry( 2.4, 6, a0, a1 - a0 ).rotateX( - PI / 2 );
			const pp = geo.attributes.position;
			for ( let k = 0; k < pp.count; k ++ ) { const x = pp.getX( k ), z = pp.getZ( k ), d = Math.hypot( x, z ); pp.setY( k, 0.03 + Math.sin( d * 3 + i ) * 0.05 * ( 1 - d / 2.4 ) + r() * 0.03 ); }
			geo.computeVertexNormals();
			add( g, geo, gores[ i % 2 ] );
		}
		const lines = [];
		for ( let i = 0; i < 12; i ++ ) { const a = i / 12 * PI * 2; lines.push( barGeo( [ Math.cos( a ) * 2.3, 0.04, Math.sin( a ) * 2.3 ], [ 3.2, 0.03, 0 ], 0.004, 3 ) ); }
		merged( g, lines, M( 0xd8d4c8, { rough: 0.8 } ) );
		add( g, G.rbox( 0.28, 0.1, 0.2, 0.03, 2 ), fabric( 0x3a4a34, 'canvas', 0xffffff ), [ 3.3, 0, 0 ] );
		return g;
	} );
	return compactCopy( 'spreadWing', () => {
		const g = wingMesh( { flat: true } );
		// the lines from the wing to the risers in a heap behind it
		const lines = [];
		for ( let i = - 6; i <= 6; i ++ ) lines.push( barGeo( [ i * 0.75, 0.03, 0.9 ], [ i * 0.08, 0.04, 5.6 ], 0.004, 3 ) );
		merged( g, lines, M( 0xe8c21a, { rough: 0.7 } ) );
		add( g, G.rbox( 0.36, 0.14, 0.3, 0.04, 2 ), fabric( 0x1f2a3a, 'canvas', 0xffffff ), [ 0, 0, 5.8 ] );
		return g;
	} );
}

// =====================================================================================================================
// the modes' visuals
// =====================================================================================================================

// The paraglider's wing: an arc of cells, the airfoil thick at the front tapering to the trailing edge, coloured panels on
// top, the cell openings at the leading edge, ribs. In its own frame: the pilot at the origin, the wing ~7 m above,
// flying towards -z. flat: laid out on the ground instead.
function wingMesh( o = {} ) {
	const g = group();
	const NS = 44, NC = 14, span = 0.95, Rarc = o.flat ? 60 : 6.3, Hc = o.flat ? 0.06 : 7.2;
	const chord = ( u ) => 2.55 * Math.sqrt( Math.max( 0.06, 1 - ( u * 0.97 ) ** 2 ) );
	const foil = ( x ) => 0.6 * ( 0.2969 * Math.sqrt( x ) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4 ); // NACA-ish, 12%
	const build = ( upper ) => {
		const pos = [], uv = [], idx = [];
		for ( let i = 0; i <= NS; i ++ ) {
			const u = i / NS * 2 - 1, phi = u * span;
			const c = chord( u );
			const cx = Math.sin( phi ) * Rarc, cy = Hc - Rarc * ( 1 - Math.cos( phi ) );
			const nx = - Math.sin( phi ), ny = Math.cos( phi ); // the arc's normal (up, tilted in at the tips)
			for ( let j = 0; j <= NC; j ++ ) {
				const x = j / NC, t = foil( Math.max( 1e-4, x ) ) * c * ( upper ? 1 : - 0.35 ) * ( o.flat ? 0.25 : 1 );
				// a ripple along the span at each rib
				const rib = 1 - 0.06 * Math.abs( Math.sin( i * PI / 2 ) ) * ( upper ? 1 : 0 );
				const zc = ( x - 0.3 ) * c;
				pos.push( cx - nx * t * rib, cy + ny * t * rib, zc );
				uv.push( i / NS, upper ? j / NC : 1 - j / NC );
			}
		}
		for ( let i = 0; i < NS; i ++ ) for ( let j = 0; j < NC; j ++ ) { const a = i * ( NC + 1 ) + j, b = a + NC + 1; if ( upper ) idx.push( a, b, a + 1, b, b + 1, a + 1 ); else idx.push( a, a + 1, b, b, a + 1, b + 1 ); }
		const geo = new THREE.BufferGeometry();
		geo.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
		geo.setIndex( idx ); geo.computeVertexNormals();
		return geo;
	};
	const topTex = tx( 'wingTop', 1024, 128, ( ctx, W, H ) => {
		// panels: red tips, white and navy bands, the brand big on the centre cells
		const cells = 44;
		for ( let i = 0; i < cells; i ++ ) {
			const u = Math.abs( i / cells * 2 - 1 + 1 / cells );
			ctx.fillStyle = u > 0.72 ? '#d8402a' : u > 0.5 ? '#f2f0e8' : u > 0.38 ? '#1f2a3a' : '#f2f0e8';
			ctx.fillRect( i * W / cells, 0, W / cells + 1, H );
		}
		ctx.fillStyle = '#d8402a'; ctx.fillRect( 0, H * 0.72, W, H * 0.06 );
		text( ctx, 'MAUNA AIR', W / 2, H * 0.42, W * 0.32, 60, 0xd8402a, { family: 'Arial Black, Arial, sans-serif' } );
		// the ribs' seams
		ctx.fillStyle = 'rgba(0,0,0,0.12)';
		for ( let i = 0; i <= cells; i ++ ) ctx.fillRect( i * W / cells - 1, 0, 2, H );
	} );
	const botTex = tx( 'wingBot', 1024, 128, ( ctx, W, H ) => {
		ctx.fillStyle = '#e8e2d2'; ctx.fillRect( 0, 0, W, H );
		const cells = 44;
		// cell openings along the leading edge (the bottom's last row of the texture is the front)
		ctx.fillStyle = '#2a2420';
		for ( let i = 1; i < cells - 1; i ++ ) ctx.fillRect( i * W / cells + 3, H * 0.9, W / cells - 6, H * 0.1 );
		ctx.fillStyle = 'rgba(0,0,0,0.1)';
		for ( let i = 0; i <= cells; i ++ ) ctx.fillRect( i * W / cells - 1, 0, 2, H * 0.9 );
		for ( let i = 0; i < cells; i ++ ) { const u = Math.abs( i / cells * 2 - 1 ); if ( u > 0.72 ) { ctx.fillStyle = 'rgba(216,64,42,0.45)'; ctx.fillRect( i * W / cells, 0, W / cells, H * 0.9 ); } }
	} );
	const up = build( true ), lo = build( false );
	add( g, up, M( 0xffffff, { rough: 0.55, map: topTex, side: o.flat ? THREE.DoubleSide : THREE.FrontSide } ) );
	add( g, lo, M( 0xffffff, { rough: 0.7, map: botTex, side: THREE.DoubleSide } ) );
	if ( o.flat ) { g.scale.set( 1, 1, 1 ); g.position.y = 0; }
	return g;
}

function flyingWing() {
	const root = group();
	const inner = compactCopy( 'wingFly', () => {
		const g = wingMesh();
		// lines: A, B, C rows at eight stations a side, cascading into four risers each side at the pilot's carabiners
		const lines = [], brakes = [];
		const Rarc = 6.3, Hc = 7.2, span = 0.95;
		for ( const side of [ - 1, 1 ] ) {
			const ris = V( side * 0.22, 0.1, 0 );
			for ( let k = 0; k < 8; k ++ ) {
				const u = side * ( 0.06 + k * 0.12 ), phi = u * span;
				const c = 2.55 * Math.sqrt( Math.max( 0.06, 1 - ( u * 0.97 ) ** 2 ) );
				const ax = Math.sin( phi ) * Rarc, ay = Hc - Rarc * ( 1 - Math.cos( phi ) ) - 0.06;
				for ( const [ f, col ] of [ [ 0.12, 0 ], [ 0.38, 1 ], [ 0.65, 1 ] ] ) {
					const p = V( ax, ay, ( f - 0.3 ) * c );
					// a cascade: one line to a junction 2.2 m up, then down to the riser
					const j = p.clone().lerp( ris, 0.55 );
					( col ? brakes : lines ).push( barGeo( p, j, 0.006, 3 ), barGeo( j, V( ris.x, ris.y, ( f - 0.35 ) * 0.08 ), 0.009, 3 ) );
				}
				// the brake lines from the trailing edge
				brakes.push( barGeo( V( ax, ay, 0.7 * c ), V( side * 0.3, 0.2, 0.15 ), 0.005, 3 ) );
			}
			// the risers themselves: webbing from the carabiner up 0.5 m
			lines.push( beamGeo( [ side * 0.22, 0.1, 0 ], [ side * 0.24, 0.6, - 0.02 ], 0.025, 0.005 ) );
		}
		merged( g, lines, M( 0xd0202a, { rough: 0.6 } ) );
		merged( g, brakes, M( 0xe8c21a, { rough: 0.6 } ) );
		return g;
	} );
	root.add( inner );
	// opening: the wing grows out of a tangle into its arc
	root.userData.open = ( k ) => {
		const e = smooth( k );
		inner.scale.set( 0.25 + 0.75 * e, 0.55 + 0.45 * e, 0.5 + 0.5 * e );
	};
	setDynamic( root );
	return root;
}

function flyingChute() {
	const root = group();
	const inner = compactCopy( 'chuteFly', () => {
		const g = group();
		const gores = [ M( 0x5a6a4a, { rough: 0.85, side: THREE.DoubleSide } ), M( 0xe8e4d8, { rough: 0.85, side: THREE.DoubleSide } ) ];
		const R = 3.3, H = 6.2, n = 16;
		for ( let i = 0; i < n; i ++ ) {
			const geo = new THREE.SphereGeometry( R, 4, 10, i / n * PI * 2, PI * 2 / n, 0.12, PI * 0.42 );
			// gores billow between the lines
			const pp = geo.attributes.position;
			for ( let k = 0; k < pp.count; k ++ ) { const x = pp.getX( k ), y = pp.getY( k ), z = pp.getZ( k ); const a = Math.atan2( z, x ); const b = 1 + 0.05 * Math.sin( ( a - i / n * PI * 2 ) / ( PI * 2 / n ) * PI ); pp.setXYZ( k, x * b, y * 0.72, z * b ); }
			geo.computeVertexNormals();
			add( g, geo, gores[ i % 2 ], [ 0, H - R * 0.72 * Math.cos( 0.12 ), 0 ] );
		}
		const lines = [];
		for ( let i = 0; i < n; i ++ ) { const a = i / n * PI * 2; const rr = R * Math.sin( PI * 0.54 ) * 1.0; lines.push( barGeo( [ Math.cos( a ) * rr, H - R * 0.72 * Math.cos( 0.12 ) + R * 0.72 * Math.cos( PI * 0.54 ), Math.sin( a ) * rr ], [ Math.cos( a ) * 0.22, 0.25, Math.sin( a ) * 0.1 ], 0.006, 3 ) ); }
		merged( g, lines, M( 0xd8d4c8, { rough: 0.8 } ) );
		return g;
	} );
	root.add( inner );
	root.userData.open = ( k ) => { const e = smooth( k ); inner.scale.set( 0.2 + 0.8 * e, 0.7 + 0.3 * e, 0.2 + 0.8 * e ); };
	setDynamic( root );
	return root;
}

// the hook flying to the ledge, the rope paying out behind it (update( from, at, t ) places both, in the world)
function hookFlight( rope ) {
	const root = group();
	const hk = compactCopy( 'hookFly', () => grappleModel() );
	root.add( hk );
	const mat = rope === 'climbing_rope' ? ropeMat( 'kern', 0x1a4fb0, 0xf2c21a ) : ropeMat( 'hemp' );
	const geo = new THREE.CylinderGeometry( 0.006, 0.006, 1, 5, 1, true ).translate( 0, 0.5, 0 );
	const line = new THREE.Mesh( geo, mat );
	line.frustumCulled = false;
	root.add( line );
	root.userData.update = ( from, at, t ) => {
		hk.position.copy( at );
		hk.rotation.set( t * 9, t * 3, 0 );
		_w.copy( at ).sub( from );
		const L = _w.length();
		line.position.copy( from );
		line.quaternion.setFromUnitVectors( UP, _w.normalize() );
		line.scale.set( 1, Math.max( 0.01, L ), 1 );
	};
	root.userData.dispose = () => geo.dispose();
	setDynamic( root );
	return root;
}
const _w = new THREE.Vector3();

// the cable paying out from the first anchor to you while you walk to the far end (set( a, b, sag ): world points)
function cableLine() {
	const geo = new THREE.CylinderGeometry( 0.005, 0.005, 1, 5, 16, true ).translate( 0, 0.5, 0 );
	const base = geo.attributes.position.array.slice();
	const m = new THREE.Mesh( geo, MT.galv() );
	m.frustumCulled = false;
	m.castShadow = false;
	m.userData.set = ( a, b, sag ) => {
		const pa = geo.attributes.position, L = Math.hypot( b.x - a.x, b.y - a.y, b.z - a.z );
		const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, hl = Math.hypot( dx, dz ) || 1;
		const ux = - dz / hl, uz = dx / hl;
		for ( let i = 0; i < pa.count; i ++ ) {
			const x0 = base[ i * 3 ], t = base[ i * 3 + 1 ], z0 = base[ i * 3 + 2 ];
			const cy = a.y + dy * t - sag * L * 4 * t * ( 1 - t );
			pa.setXYZ( i, a.x + dx * t + ux * x0, cy + z0, a.z + dz * t + uz * x0 );
		}
		pa.needsUpdate = true;
		geo.computeBoundingSphere();
	};
	m.userData.dispose = () => geo.dispose();
	setDynamic( m );
	return m;
}

// the paddle in the hands (first-person view): the T-grip at the origin, the blade down along -x
function viewPaddle( id ) {
	const g = paddleModel( getItem( id )?.model || {} );
	const inner = group(); inner.add( ...g.children );
	inner.position.set( - 1.91, - 0.0145, 0 );
	const root = group(); root.add( inner );
	return root;
}

// the brake toggles in the hands, their lines running up out of view
function viewBrakes() {
	const root = group();
	for ( let i = 0; i < 2; i ++ ) {
		const t = group();
		add( t, G.rbox( 0.025, 0.07, 0.03, 0.01, 2 ), MT.plastic( 0xd0202a ), [ 0, - 0.035, 0 ] );
		add( t, G.cyl( 0.0025, 0.0025, 0.9, 4 ), M( 0xe8c21a, { rough: 0.6 } ), [ 0, 0.0, 0 ] );
		root.add( t );
	}
	return root;
}
