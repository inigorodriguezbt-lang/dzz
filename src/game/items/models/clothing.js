// Clothing and bags: folded tops and trousers (soft cloth panels with collars, plackets, pockets, seams and prints that
// run on across the folds), shoes in pairs, hats and helmets, masks, eyewear, vests and plate carriers, gloves, belts
// and backpacks. The cloth panels, straps and weave materials come from garment.js.
// Folded tops lie with the neck away from the viewer (towards -z), the chest print reading the right way up in the
// inventory icon; trousers lie along x with the waistband at +x.
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, shade, canvasTex, css } from './lib.js';
import { patchMaterial } from '../../../render/Materials.js';
import { cloth, panel, conform, band, seam, buttonGeo, curveLoop, roundRect, line, smooth, lerp, softBox, grid, smoothNormals, uvOf } from './garment.js';

// ---- shared bits ---------------------------------------------------------------------------------------------------

const lum = ( c ) => ( ( c >> 16 & 255 ) * 0.3 + ( c >> 8 & 255 ) * 0.59 + ( c & 255 ) * 0.11 ) / 255;
// sewing thread: a shade darker than the cloth (lighter on near-black cloth)
export const thread = ( c ) => M( lum( c ) < 0.13 ? shade( c, 0.25 ) : shade( c, - 0.3 ), { rough: 0.85 } );
// the weave a print or a style implies (a spec's own `weave` wins)
export function weaveOf( s, fallback ) {
	if ( s.weave ) return s.weave;
	switch ( String( s.print || '' ).split( ':' )[ 0 ] ) {
		case 'denim': case 'plaid': return 'twill';
		case 'leather': return 'leather';
		case 'canvas': return 'canvas';
		case 'multicam': case 'marpat': case 'woodland': case 'desert': return 'ripstop';
		case 'knit': return 'knit';
	}
	return fallback;
}
// add a detail laid onto a surface top( x, z )
const on = ( g, geo, mat, top, lift = 0.0006 ) => add( g, conform( geo, top, lift ), mat );
const mirror = ( P ) => P.map( p => [ - p[ 0 ], p[ 1 ] ] ).reverse();
const pathLen2 = ( P ) => { let l = 0; for ( let i = 1; i < P.length; i ++ ) l += Math.hypot( P[ i ][ 0 ] - P[ i - 1 ][ 0 ], P[ i ][ 1 ] - P[ i - 1 ][ 1 ] ); return l; };
// screen-printed lettering (a cutout over the cloth, a little worn)
const slogans = new Map();
export function sloganMat( text, color ) {
	const k = text + ':' + color;
	let m = slogans.get( k );
	if ( m ) return m;
	const t = canvasTex( 'slogan:' + k, 256, 256, ( ctx, w, h ) => {
		ctx.clearRect( 0, 0, w, h );
		ctx.fillStyle = css( color ); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		let fs = 120; ctx.font = `900 ${fs}px Arial, Helvetica, sans-serif`;
		while ( fs > 20 && ctx.measureText( text ).width > w * 0.92 ) { fs -= 6; ctx.font = `900 ${fs}px Arial, Helvetica, sans-serif`; }
		ctx.fillText( text, w / 2, h / 2 );
		ctx.globalCompositeOperation = 'destination-out';
		let r = 5; const rnd = () => ( r = ( r * 16807 ) % 2147483647 ) / 2147483647;
		for ( let i = 0; i < 260; i ++ ) ctx.fillRect( rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2 );
		ctx.globalCompositeOperation = 'source-over';
	} );
	m = new THREE.MeshStandardMaterial( { map: t, alphaTest: 0.5, roughness: 0.75, metalness: 0 } );
	patchMaterial( m, 'item' );
	slogans.set( k, m );
	return m;
}

// ---- folded tops ---------------------------------------------------------------------------------------------------
// { style: tee|tank|polo|aloha|dress|hoodie|jacket|coat|suit|wetsuit, color, color2, print, color3, rep, weave, trim,
//   button, zip, collar, closure, pockets, sleeves (short|long|none), stripes, badge, patch, quilt, hood, ghillie, rough }

const TOPS = {
	tee: { W: 0.25, L: 0.3, T: 0.026, weave: 'knit', sleeves: 'short', collar: 'crew' },
	tank: { W: 0.24, L: 0.3, T: 0.022, weave: 'knit', sleeves: 'none', collar: 'tank' },
	polo: { W: 0.25, L: 0.3, T: 0.028, weave: 'knit', sleeves: 'short', collar: 'polo', closure: 'polo' },
	aloha: { W: 0.25, L: 0.31, T: 0.026, weave: 'plain', sleeves: 'short', collar: 'camp', closure: 'buttons', pockets: 1 },
	dress: { W: 0.26, L: 0.32, T: 0.03, weave: 'plain', sleeves: 'short', collar: 'scoop' },
	hoodie: { W: 0.27, L: 0.31, T: 0.04, weave: 'fleece', sleeves: 'long', collar: 'hood', pockets: 'kangaroo' },
	jacket: { W: 0.28, L: 0.32, T: 0.04, weave: 'nylon', sleeves: 'long', collar: 'stand', closure: 'zip', pockets: 'slant' },
	coat: { W: 0.29, L: 0.34, T: 0.05, weave: 'twill', sleeves: 'long', collar: 'point', closure: 'zip', pockets: 'flap4' },
	suit: { W: 0.3, L: 0.34, T: 0.062, weave: 'plain', sleeves: 'long', collar: 'hood', closure: 'zip', hood: 'visor' },
	wetsuit: { W: 0.25, L: 0.32, T: 0.034, weave: 'neoprene', sleeves: 'long', collar: 'band', closure: 'chestzip' },
};
const NECK = { crew: [ 0.045, 0.03 ], vneck: [ 0.045, 0.072 ], scoop: [ 0.06, 0.06 ], stand: [ 0.045, 0.03 ], tall: [ 0.048, 0.03 ], band: [ 0.042, 0.026 ] };

// the folded body's outline (right half from the back of the neck round to the bottom, mirrored)
function topOutline( W, L, sleeves, flare = 0 ) {
	const x = W / 2, z = L / 2;
	const half = sleeves === 'none'
		? [ [ 0, - z + 0.052 ], [ 0.034, - z + 0.03 ], [ 0.048, - z + 0.003 ], [ 0.074, - z ], [ 0.086, - z + 0.012 ], [ x - 0.016, - z + 0.062 ], [ x, - z + 0.1 ] ]
		: [ [ 0, - z ], [ 0.06, - z - 0.001 ], [ x - 0.028, - z + 0.003 ],
			...( sleeves === 'short' ? [ [ x + 0.008, - z + 0.01 ], [ x + 0.024, - z + 0.04 ], [ x + 0.02, - z + 0.078 ], [ x + 0.001, - z + 0.094 ] ] : [ [ x - 0.004, - z + 0.03 ] ] ) ];
	half.push( [ x, 0 ], [ x + flare * 0.6 - 0.001, z - 0.04 ], [ x + flare - 0.02, z - 0.001 ], [ 0.06, z + 0.001 ], [ 0, z ] );
	return curveLoop( [ ...half, ...mirror( half.slice( 1, - 1 ) ) ], 96 );
}

function foldedTop( s ) {
	const g = group(), style = TOPS[ s.style ] ? s.style : 'tee', F = TOPS[ style ], c = s.color ?? 0x888888;
	const W = F.W, L = F.L, T = F.T, x = W / 2, z = L / 2;
	const sleeves = s.sleeves ?? F.sleeves, collar = s.collar ?? F.collar, closure = s.closure ?? F.closure ?? 'none';
	const pockets = s.pockets ?? F.pockets ?? 0;
	// (a text print is a slogan on the chest, not a pattern all over)
	const text = String( s.print || '' ).startsWith( 'text:' ) ? s.print.slice( 5 ) : null;
	const body = cloth( c, { print: text ? null : s.print, color2: s.color2 ?? 0xffffff, color3: s.color3, rep: s.rep ?? 1.4, weave: weaveOf( s, F.weave ), rough: s.rough } );
	const trimC = s.trim ?? shade( c, - 0.1 );
	const rib = cloth( trimC, { weave: style === 'wetsuit' ? 'neoprene' : 'rib', rough: s.rough } );
	const stitch = thread( s.print ? trimC : c ), lining = M( shade( lum( c ) < 0.1 ? 0x404040 : c, - 0.55 ), { rough: 0.95 } );
	const metal = M( s.button ?? 0xb8bcc2, { rough: 0.3, metal: 0.9 } );
	const neck = NECK[ collar ];
	const nW = neck?.[ 0 ] ?? 0.045, nD = neck?.[ 1 ] ?? 0.03;
	// the front of the neck opening at x (crew / scoop: round, vneck: a V)
	const neckZ = ( px ) => { const t = Math.min( 1, Math.abs( px ) / nW ); return - z + 0.004 + nD * ( collar === 'vneck' ? 1 - t : Math.sqrt( 1 - t * t ) ); };
	const open = !! neck && ! [ 'stand', 'tall', 'band' ].includes( collar ) ? 1 : neck ? 0.6 : 0;
	const quilt = !! s.quilt;
	const base = panel( topOutline( W, L, sleeves, style === 'dress' ? 0.022 : 0 ), {
		T, R: T * 0.8, cell: quilt ? 0.016 : W > 0.28 ? 0.026 : 0.022, uv: [ 0, - 0.03 ],
		disp: ( px, pz ) => {
			let h = sleeves === 'long' ? 0 : T * 0.22 * smooth( x - 0.05, x - 0.032, Math.abs( px ) ); // the sleeves folded in under the sides
			h += T * 0.14 * ( 1 - ( px / x ) ** 2 ) * ( 1 - ( pz / z ) ** 2 ); // a soft rise in the middle
			h -= T * 0.1 * Math.exp( - ( ( ( pz - 0.05 - px * 0.18 ) / 0.012 ) ** 2 ) ) * smooth( x, x * 0.3, Math.abs( px ) ); // a crease
			if ( open && Math.abs( px ) < nW + 0.006 ) h -= T * 0.42 * open * smooth( 0.004, - 0.006, pz - neckZ( px ) ) * smooth( nW + 0.006, nW - 0.008, Math.abs( px ) );
			if ( quilt ) h += T * 0.2 * ( Math.pow( Math.abs( Math.sin( ( pz + z ) / 0.042 * PI ) ), 0.6 ) - 0.7 );
			return h;
		},
	} );
	add( g, base.geo, body );
	const top = base.top, lay = ( geo, m, lift ) => on( g, geo, m, top, lift );
	const sew = ( pts, m = stitch ) => add( g, seam( pts, top ), m );
	const btn = ( px, pz, r = 0.0058, m = metal ) => lay( buttonGeo( r, r * 0.4 ).translate( px, 0, pz ), m, 0.0004 );
	const zip = ( pts, w = 0.009, pull = true ) => {
		const tape = M( s.zip ?? shade( c, - 0.45 ), { rough: 0.5, metal: s.zip ? 0.3 : 0 } );
		const n = Math.max( 2, Math.ceil( pathLen2( pts ) / 0.025 ) );
		add( g, band( pts.map( p => [ p[ 0 ], top( p[ 0 ], p[ 1 ] ) + 0.0008, p[ 1 ] ] ), w, 0.0012, { seg: n } ), tape );
		add( g, band( pts.map( p => [ p[ 0 ], top( p[ 0 ], p[ 1 ] ) + 0.0017, p[ 1 ] ] ), w * 0.38, 0.0012, { seg: n } ), M( s.zip ?? 0x2a2a2a, { rough: 0.35, metal: 0.6 } ) );
		if ( pull ) {
			const [ px, pz ] = pts[ 0 ], dx = pts[ 1 ][ 0 ] - px, dz = pts[ 1 ][ 1 ] - pz, a = Math.atan2( dx, dz );
			const tab = new THREE.Group(); tab.position.set( px + dx * 0.15, top( px, pz ) + 0.003, pz + dz * 0.15 ); tab.rotation.y = a;
			add( tab, G.box( 0.008, 0.003, 0.012 ), M( s.zip ?? 0x2a2a2a, { rough: 0.3, metal: 0.8 } ) );
			add( tab, G.box( 0.006, 0.0016, 0.016 ), M( 0x1a1a1a, { rough: 0.5 } ), [ 0, 0.001, 0.014 ] );
			g.add( tab );
		}
	};
	// a patch pocket, maybe with a flap and a button
	const pocket = ( px, pz, w, h, o = {} ) => {
		const m = o.mat ?? body;
		lay( panel( roundRect( w, h, [ 0.002, 0.002, h * 0.25, h * 0.25 ], px, pz, 3 ), { T: 0.0035, R: 0.0025, cell: 0.02, bottom: false, uv: [ 0, - 0.03 ] } ).geo, m, 0.0002 );
		sew( [ [ px - w / 2 + 0.003, pz - h / 2 + 0.006 ], [ px + w / 2 - 0.003, pz - h / 2 + 0.006 ] ] );
		if ( o.flap ) {
			const fh = h * 0.36, F2 = [ [ px - w / 2 - 0.002, pz - h / 2 - 0.004 ], [ px + w / 2 + 0.002, pz - h / 2 - 0.004 ], [ px + w / 2 + 0.002, pz - h / 2 + fh * 0.7 ], [ px, pz - h / 2 + fh ], [ px - w / 2 - 0.002, pz - h / 2 + fh * 0.7 ] ];
			lay( panel( F2, { T: 0.0045, R: 0.002, cell: 0.02, bottom: false, uv: [ 0, - 0.03 ] } ).geo, m, 0.0035 );
			if ( o.button !== false ) btn( px, pz - h / 2 + fh * 0.72, 0.005, o.btnMat ?? metal );
		}
	};

	// ---- the neck ----
	if ( neck && collar !== 'tank' ) {
		const front = [];
		for ( let i = 0; i <= 12; i ++ ) { const px = - nW + 2 * nW * i / 12; front.push( [ px, neckZ( px ) ] ); }
		// the inside of the back, seen through the opening, and a woven label
		lay( panel( [ ...front, [ nW, - z + 0.002 ], [ - nW, - z + 0.002 ] ], { T: 0.001, R: 0.001, cell: 0.012, bottom: false } ).geo, lining, 0.0003 );
		lay( G.box( 0.022, 0.0008, 0.012 ).translate( 0, 0, - z + 0.013 ), M( 0xeeeee8, { rough: 0.7 } ), 0.0012 );
		if ( collar === 'stand' || collar === 'tall' || collar === 'band' ) {
			// a collar standing up round the opening
			const hgt = collar === 'tall' ? 0.034 : collar === 'band' ? 0.012 : 0.022;
			const loop = [ ...front.filter( ( p, i ) => i % 2 === 0 ), [ nW * 0.6, - z + 0.006 ], [ - nW * 0.6, - z + 0.006 ] ];
			add( g, band( loop.map( p => [ p[ 0 ], top( p[ 0 ], p[ 1 ] ) + hgt * 0.42, p[ 1 ] ] ), hgt, 0.006, { closed: true, round: true, seg: 30, up: ( P, Tn ) => [ - Tn.z, 0, Tn.x ] } ), collar === 'band' ? rib : body );
			if ( collar === 'tall' ) { // a throat strap across the front
				add( g, G.box( 0.05, 0.004, 0.016 ), M( s.trim ?? 0x2a2a2a, { rough: 0.8 } ), [ 0.012, top( 0, neckZ( 0 ) ) + hgt * 0.75, neckZ( 0 ) + 0.004 ], [ 0.35, 0.15, 0 ] );
			}
		} else {
			// a ribbed band round the opening: down the front, back along the fold
			const loop = [ ...front.filter( ( p, i ) => i % 2 === 0 ), [ nW * 0.55, - z + 0.006 ], [ - nW * 0.55, - z + 0.006 ] ];
			add( g, band( loop.map( p => [ p[ 0 ], top( p[ 0 ], p[ 1 ] ) + 0.002, p[ 1 ] ] ), collar === 'scoop' ? 0.008 : 0.011, 0.0045, { closed: true, round: true, seg: 30 } ), collar === 'scoop' ? M( s.trim ?? 0xf4f0e6, { rough: 0.85 } ) : rib );
		}
	}
	if ( collar === 'tank' ) {
		// the back shows through the scoop; bound edges round the neck and the armholes
		add( g, panel( roundRect( 0.16, 0.07, 0.01, 0, - z + 0.035 ), { T: T * 0.55, R: T * 0.5, cell: 0.016 } ).geo, body );
		const bind = ( P ) => add( g, band( P.map( p => [ p[ 0 ], top( p[ 0 ], p[ 1 ] ) + 0.0015, p[ 1 ] ] ), 0.007, 0.004, { round: true, seg: 20 } ), rib );
		bind( [ [ - 0.05, - z + 0.006 ], [ - 0.036, - z + 0.03 ], [ 0, - z + 0.05 ], [ 0.036, - z + 0.03 ], [ 0.05, - z + 0.006 ] ] );
		for ( const k of [ - 1, 1 ] ) bind( [ [ k * 0.084, - z + 0.012 ], [ k * ( x - 0.03 ), - z + 0.05 ], [ k * ( x - 0.004 ), - z + 0.094 ] ] );
	}
	const wings = { point: [ [ 0.005, - z + 0.003 ], [ 0.058, - z + 0.002 ], [ 0.066, - z + 0.022 ], [ 0.032, - z + 0.072 ], [ 0.008, - z + 0.032 ] ],
		cord: [ [ 0.005, - z + 0.003 ], [ 0.06, - z + 0.002 ], [ 0.07, - z + 0.026 ], [ 0.036, - z + 0.078 ], [ 0.008, - z + 0.034 ] ],
		camp: [ [ 0.005, - z + 0.003 ], [ 0.06, - z + 0.002 ], [ 0.084, - z + 0.03 ], [ 0.068, - z + 0.09 ], [ 0.012, - z + 0.05 ] ],
		polo: [ [ 0.005, - z + 0.003 ], [ 0.056, - z + 0.002 ], [ 0.064, - z + 0.02 ], [ 0.036, - z + 0.066 ], [ 0.02, - z + 0.064 ], [ 0.008, - z + 0.03 ] ],
		notch: [ [ 0.005, - z + 0.003 ], [ 0.058, - z + 0.002 ], [ 0.07, - z + 0.03 ], [ 0.058, - z + 0.044 ], [ 0.076, - z + 0.05 ], [ 0.016, - z + 0.17 ], [ 0.006, - z + 0.06 ] ],
		biker: [ [ 0.005, - z + 0.003 ], [ 0.062, - z + 0.002 ], [ 0.1, - z + 0.06 ], [ 0.072, - z + 0.11 ], [ 0.02, - z + 0.05 ] ] }[ collar ];
	if ( wings ) {
		const wm = collar === 'polo' ? rib : collar === 'cord' ? cloth( s.trim ?? shade( c, - 0.35 ), { weave: 'cord' } ) : body;
		// the gap between the wings, the stand behind them, the two wings
		lay( panel( [ [ - 0.03, - z + 0.003 ], [ 0.03, - z + 0.003 ], [ 0, - z + 0.05 ] ], { T: 0.001, R: 0.001, cell: 0.012, bottom: false } ).geo, lining, 0.0003 );
		add( g, band( [ [ - 0.064, 0, - z + 0.008 ], [ 0, 0, - z + 0.006 ], [ 0.064, 0, - z + 0.008 ] ].map( p => [ p[ 0 ], top( p[ 0 ], p[ 2 ] ) + 0.004, p[ 2 ] ] ), 0.012, 0.006, { round: true, seg: 12 } ), wm );
		for ( const P of [ wings, mirror( wings ) ] ) {
			const wg = panel( curveLoop( P, 24 ), { T: 0.0045, R: 0.003, cell: 0.02, bottom: false, uv: [ 0, - 0.03 ] } );
			lay( wg.geo, wm, 0.0012 );
		}
	}

	// ---- how it closes ----
	const cz0 = wings ? - z + ( collar === 'notch' ? 0.17 : collar === 'camp' ? 0.05 : 0.035 ) : neck ? neckZ( 0 ) + 0.004 : - z + 0.1;
	if ( closure === 'buttons' || closure === 'snaps' || closure === 'polo' ) {
		const end = closure === 'polo' ? - z + 0.085 : z - 0.008;
		add( g, band( [ [ 0, 0, cz0 ], [ 0, 0, ( cz0 + end ) / 2 ], [ 0, 0, end ] ].map( p => [ 0, top( 0, p[ 2 ] ) + 0.0012, p[ 2 ] ] ), 0.022, 0.0025, { seg: 16 } ), collar === 'polo' ? rib : body );
		for ( const k of [ - 1, 1 ] ) sew( line( [ k * 0.0105, cz0 + 0.004 ], [ k * 0.0105, end ], 8 ) );
		const bm = closure === 'snaps' ? M( s.button ?? 0x9a8a6a, { rough: 0.3, metal: 0.85 } ) : M( s.button ?? 0xf0e8d0, { rough: 0.35 } );
		const n = closure === 'polo' ? 2 : Math.floor( ( end - cz0 - 0.02 ) / 0.052 ) + 1;
		for ( let i = 0; i < n; i ++ ) btn( 0, cz0 + 0.016 + i * ( closure === 'polo' ? 0.026 : 0.052 ), 0.0055, bm );
		if ( closure === 'polo' && s.patch ) lay( panel( curveLoop( [ [ 0.06, - z + 0.07 ], [ 0.074, - z + 0.066 ], [ 0.078, - z + 0.08 ], [ 0.066, - z + 0.086 ], [ 0.058, - z + 0.078 ] ], 16 ), { T: 0.0015, R: 0.001, cell: 0.01, bottom: false } ).geo, M( s.patch, { rough: 0.7 } ), 0.0004 );
	}
	if ( closure === 'double' ) {
		// a double-breasted front: the flap's edge, two rows of buttons
		sew( [ [ - 0.012, cz0 ], [ 0.03, - z + 0.06 ], [ 0.052, z - 0.01 ] ] );
		for ( let i = 0; i < 4; i ++ ) for ( const k of [ - 1, 1 ] ) btn( k * 0.034, - z + 0.07 + i * 0.05, 0.0062, M( s.button ?? 0x1a1a1a, { rough: 0.4 } ) );
	}
	if ( closure === 'zip' ) zip( [ [ 0, cz0 ], [ 0, ( cz0 + z ) / 2 ], [ 0, z - 0.006 ] ] );
	if ( closure === 'asym' ) zip( [ [ - 0.03, cz0 + 0.01 ], [ 0.02, 0.0 ], [ 0.04, z - 0.006 ] ] );
	if ( closure === 'chestzip' ) zip( [ [ - 0.07, - z + 0.06 ], [ 0, - z + 0.085 ], [ 0.07, - z + 0.06 ] ] );
	if ( closure === 'clips' ) {
		// the storm flap and its clips
		sew( line( [ 0.018, cz0 ], [ 0.018, z - 0.008 ], 8 ) );
		for ( let i = 0; i < 4; i ++ ) {
			const pz = - z + 0.07 + i * 0.06;
			lay( G.box( 0.026, 0.004, 0.012 ).translate( 0.01, 0, pz ), MAT.darkMetal(), 0.0005 );
			lay( G.torus( 0.006, 0.0016, 4, 10, PI ).rotateX( PI / 2 ).translate( - 0.006, 0, pz ), M( 0xb8bcc2, { rough: 0.3, metal: 0.9 } ), 0.002 );
		}
	}

	// ---- pockets ----
	if ( pockets === 1 ) pocket( 0.062, - z + 0.1, 0.052, 0.058 );
	if ( pockets === 2 || pockets === 'flap2' || pockets === 'flap4' ) for ( const k of [ - 1, 1 ] ) pocket( k * 0.064, - z + ( collar === 'notch' ? 0.2 : 0.105 ), 0.058, 0.064, { flap: pockets !== 2 || !! s.flaps } );
	if ( pockets === 'flap4' || pockets === 'flap2low' ) for ( const k of [ - 1, 1 ] ) pocket( k * 0.07, 0.085, 0.07, 0.075, { flap: true } );
	if ( pockets === 'lab' ) { pocket( 0.062, - z + 0.12, 0.05, 0.055 ); for ( const k of [ - 1, 1 ] ) pocket( k * 0.075, 0.09, 0.07, 0.07 ); lay( G.cylX( 0.0035, 0.06, 8 ).rotateY( PI / 2 ).translate( 0.07, 0.003, - z + 0.105 ), M( 0x1a3a8a, { rough: 0.4 } ), 0.0005 ); }
	if ( pockets === 'slant' ) for ( const k of [ - 1, 1 ] ) {
		const P = [ [ k * 0.06, 0.05 ], [ k * 0.09, 0.115 ] ];
		sew( P, M( shade( c, - 0.45 ), { rough: 0.8 } ) );
		if ( style === 'jacket' && ! s.print ) zip( P, 0.006, true );
	}
	if ( pockets === 'kangaroo' ) {
		const K = [ [ - 0.07, 0.03 ], [ 0.07, 0.03 ], [ 0.094, 0.07 ], [ 0.102, 0.128 ], [ - 0.102, 0.128 ], [ - 0.094, 0.07 ] ];
		lay( panel( K, { T: 0.005, R: 0.004, cell: 0.016, bottom: false, uv: [ 0, - 0.03 ] } ).geo, body, 0.0002 );
		sew( line( [ - 0.068, 0.035 ], [ 0.068, 0.035 ], 6 ) );
		for ( const k of [ - 1, 1 ] ) sew( [ [ k * 0.072, 0.034 ], [ k * 0.094, 0.072 ], [ k * 0.1, 0.124 ] ], M( shade( c, - 0.45 ) ) );
	}

	// ---- sleeves: short ones show their hems at the shoulders, long ones their cuffs under the bottom fold ----
	if ( sleeves === 'short' ) for ( const k of [ - 1, 1 ] ) {
		sew( [ [ k * ( x + 0.012 ), - z + 0.012 ], [ k * ( x + 0.019 ), - z + 0.045 ], [ k * ( x + 0.014 ), - z + 0.08 ] ] );
		sew( [ [ k * ( x - 0.03 ), - z + 0.006 ], [ k * ( x - 0.034 ), - z + 0.05 ], [ k * ( x - 0.024 ), - z + 0.092 ] ] );
	}
	if ( sleeves === 'long' ) for ( const k of [ - 1, 1 ] ) {
		// folded straight down the front, along the sides, the cuff just short of the bottom fold
		const sw = 0.056, x0 = k * ( x + 0.001 ), x1 = k * ( x - sw ), zb = z - 0.05;
		const S = curveLoop( [ [ x1, - z + 0.012 ], [ k * ( x - 0.02 ), - z + 0.002 ], [ x0, - z + 0.02 ], [ k * ( x - 0.004 ), zb ], [ k * ( x - sw * 0.5 ), zb + 0.004 ], [ k * ( x - sw + 0.006 ), zb ] ], 40 );
		const sl = panel( S, { T: T * 0.36, R: T * 0.3, cell: 0.022, bottom: false, uv: [ 0, - 0.03 ], disp: ( px, pz ) => - T * 0.06 * Math.exp( - ( ( ( pz - 0.02 ) / 0.01 ) ** 2 ) ) } );
		const slg = conform( sl.geo, top, 0.0004 );
		add( g, slg, body );
		const stop = ( px, pz ) => top( px, pz ) + sl.top( px, pz ) + 0.0004;
		add( g, seam( [ [ x1 + k * 0.004, - z + 0.03 ], [ k * ( x - 0.03 ), - z + 0.024 ], [ k * ( x - 0.004 ), - z + 0.03 ] ], stop ), stitch );
		const knit = style === 'hoodie' || style === 'wetsuit' || ( style === 'jacket' && collar === 'stand' );
		const cf = panel( roundRect( sw - 0.008, 0.036, 0.008, k * ( x - sw / 2 ), z - 0.034, 3 ), { T: T * 0.26, R: T * 0.2, cell: 0.02, bottom: false, uv: [ 0, - 0.03 ] } );
		add( g, conform( cf.geo, top, 0.0004 ), knit ? rib : body );
		const ctop = ( px, pz ) => top( px, pz ) + cf.top( px, pz ) + 0.0004;
		if ( ! knit ) {
			add( g, seam( line( [ k * ( x - sw + 0.006 ), z - 0.05 ], [ k * ( x - 0.006 ), z - 0.05 ], 4 ), ctop ), stitch );
			add( g, buttonGeo( 0.0045, 0.0018 ).translate( k * ( x - sw / 2 ), ctop( k * ( x - sw / 2 ), z - 0.03 ), z - 0.03 ), M( s.button ?? 0xf0e8d0, { rough: 0.4 } ) );
		}
		if ( style === 'wetsuit' ) add( g, conform( panel( roundRect( 0.012, zb + z - 0.03, 0.004, k * ( x - sw * 0.45 ), ( zb - z ) / 2 + 0.006 ), { T: 0.0012, R: 0.001, cell: 0.016, bottom: false } ).geo, stop, 0.0004 ), M( s.trim ?? 0x2a8ad6, { rough: 0.5 } ) );
	}
	if ( style === 'hoodie' ) // a ribbed waistband along the bottom fold
		lay( panel( roundRect( W - 0.012, 0.03, 0.008, 0, z - 0.017 ), { T: 0.003, R: 0.002, cell: 0.014, bottom: false } ).geo, rib, 0.0003 );

	// ---- hoods: a hoodie's laid down over the chest, a protective suit's with its window ----
	if ( collar === 'hood' ) {
		const hz = style === 'suit' ? 0.03 : - 0.05;
		const H = curveLoop( [ [ - 0.105, - z + 0.004 ], [ 0, - z + 0.0 ], [ 0.105, - z + 0.004 ], [ 0.112, ( - z + hz ) / 2 ], [ 0.08, hz - 0.004 ], [ 0, hz + 0.01 ], [ - 0.08, hz - 0.004 ], [ - 0.112, ( - z + hz ) / 2 ] ], 56 );
		const hood = panel( H, { T: 0.016, R: 0.012, cell: 0.024, uv: [ 0, - 0.03 ], disp: ( px, pz ) => 0.004 * ( 1 - ( px / 0.11 ) ** 2 ) } );
		const hg = conform( hood.geo, top, 0.0005 );
		add( g, hg, body );
		const htop = ( px, pz ) => top( px, pz ) + hood.top( px, pz ) + 0.0005;
		// the opening's edge: a turned hem along the hood's front
		const rim = [ [ - 0.1, ( - z + hz ) / 2 + 0.01 ], [ - 0.07, hz - 0.012 ], [ 0, hz ], [ 0.07, hz - 0.012 ], [ 0.1, ( - z + hz ) / 2 + 0.01 ] ];
		add( g, band( rim.map( p => [ p[ 0 ], htop( p[ 0 ], p[ 1 ] ) + 0.001, p[ 1 ] ] ), 0.012, 0.004, { round: true, seg: 30 } ), style === 'suit' ? body : rib );
		add( g, seam( line( [ 0, - z + 0.012 ], [ 0, hz - 0.008 ], 8 ), htop ), stitch );
		if ( style === 'suit' ) {
			// the face window: a clear visor (hazmat) or a dark mesh veil (beekeeper), taped round
			const veil = s.hood === 'veil';
			const win = panel( curveLoop( [ [ - 0.06, - 0.075 ], [ 0, - 0.088 ], [ 0.06, - 0.075 ], [ 0.07, - 0.04 ], [ 0, - 0.02 ], [ - 0.07, - 0.04 ] ], 32 ), { T: 0.003, R: 0.002, cell: 0.025, bottom: false } );
			add( g, conform( win.geo, htop, 0.0006 ), veil ? cloth( 0x1c1c1c, { weave: 'ripstop', wrep: 3, rough: 0.9 } ) : M( 0xb8d0d8, { rough: 0.06, metal: 0.2, transparent: true, opacity: 0.55 } ) );
			add( g, band( curveLoop( [ [ - 0.06, - 0.075 ], [ 0, - 0.088 ], [ 0.06, - 0.075 ], [ 0.07, - 0.04 ], [ 0, - 0.02 ], [ - 0.07, - 0.04 ] ], 32 ).map( p => [ p[ 0 ], htop( p[ 0 ], p[ 1 ] ) + 0.002, p[ 1 ] ] ), 0.006, 0.0025, { closed: true, seg: 24 } ), M( s.trim ?? 0x2a2a2a, { rough: 0.7 } ) );
		} else for ( const k of [ - 1, 1 ] ) {
			// drawstrings out of the hem, down over the chest, metal aglets
			const cord = [ [ k * 0.014, htop( k * 0.014, hz - 0.002 ) + 0.002, hz - 0.002 ], [ k * 0.02, top( k * 0.02, hz + 0.03 ) + 0.002, hz + 0.03 ], [ k * ( 0.012 + 0.012 * k ), top( 0, hz + 0.08 ) + 0.002, hz + 0.08 ] ];
			add( g, G.tube( cord, 0.0024, 12, 5 ), M( s.trim ?? 0xf0f0ea, { rough: 0.8 } ) );
			add( g, G.cyl( 0.0028, 0.0028, 0.012, 6 ).rotateX( PI / 2 ).translate( cord[ 2 ][ 0 ], cord[ 2 ][ 1 ], cord[ 2 ][ 2 ] + 0.006 ), M( 0xb8bcc2, { rough: 0.3, metal: 0.9 } ) );
			add( g, G.torus( 0.004, 0.0012, 4, 10 ).rotateX( PI / 2 ).translate( k * 0.014, htop( k * 0.014, hz - 0.006 ) + 0.0015, hz - 0.006 ), M( 0xb8bcc2, { rough: 0.3, metal: 0.9 } ) );
		}
	}

	// ---- a slogan printed on the chest ----
	if ( text ) {
		const tw = Math.min( 0.17, W - 0.11 ), th = tw * 0.42, tz = style === 'hoodie' ? - 0.012 : - z + 0.11;
		const d = panel( roundRect( tw, th, 0.004, 0, tz ), { T: 0.0006, R: 0.0005, cell: 0.03, bottom: false } );
		uvOf( d.geo, 0, tz, tw );
		lay( d.geo, sloganMat( text, s.color2 ?? 0xffffff ), 0.0007 );
	}

	// ---- trims ----
	if ( s.stripes ) {
		// reflective tape: two bands across, a silver line down each
		const tape = M( s.stripes, { rough: 0.35, metal: 0.2, emissive: s.stripes, emissiveIntensity: 0.12 } ), silver = M( 0xd4d8dc, { rough: 0.22, metal: 0.65 } );
		for ( const pz of [ 0.0, 0.1 ] ) {
			lay( panel( roundRect( W - 0.008, 0.026, 0.004, 0, pz, 2 ), { T: 0.0015, R: 0.001, cell: 0.04, bottom: false } ).geo, tape, 0.0006 );
			lay( panel( roundRect( W - 0.01, 0.008, 0.002, 0, pz, 2 ), { T: 0.0015, R: 0.001, cell: 0.04, bottom: false } ).geo, silver, 0.0014 );
		}
	}
	if ( s.badge ) {
		const B = curveLoop( [ [ 0.05, - z + 0.06 ], [ 0.064, - z + 0.054 ], [ 0.078, - z + 0.06 ], [ 0.076, - z + 0.078 ], [ 0.064, - z + 0.09 ], [ 0.052, - z + 0.078 ] ], 24 );
		lay( panel( B, { T: 0.003, R: 0.0015, cell: 0.008, bottom: false } ).geo, M( s.badge, { rough: 0.28, metal: 0.92 } ), pockets ? 0.006 : 0.0008 );
	}
	if ( s.patch && closure !== 'polo' ) {
		// a shoulder patch on a short sleeve, a name tape on a jacket's chest
		const P = sleeves === 'short' ? [ - x - 0.01, - z + 0.048, 0.026, 0.032 ] : [ - 0.064, - z + ( pockets ? 0.062 : 0.09 ), 0.05, 0.016 ];
		lay( panel( roundRect( P[ 2 ], P[ 3 ], Math.min( P[ 2 ], P[ 3 ] ) * 0.4, P[ 0 ], P[ 1 ] ), { T: 0.0015, R: 0.001, cell: 0.01, bottom: false } ).geo, M( s.patch, { rough: 0.7 } ), 0.0006 );
	}
	if ( quilt ) for ( let i = 1; i < 8; i ++ ) { const pz = - z + i * 0.042; if ( pz > z - 0.01 ) break; sew( line( [ - x + 0.004, pz ], [ x - 0.004, pz ], 10 ) ); }
	if ( s.ghillie ) {
		// jute strands tied on in tufts
		const cols = [ 0x4a5530, 0x5e6a3a, 0x3a3525, 0x6d6a45 ].map( v => M( v, { rough: 0.95 } ) );
		let r = 7; const rnd = () => ( r = ( r * 16807 ) % 2147483647 ) / 2147483647;
		for ( let i = 0; i < 46; i ++ ) {
			const px = ( rnd() - 0.5 ) * W * 0.9, pz = ( rnd() - 0.5 ) * L * 0.9, len = 0.05 + rnd() * 0.06, a = rnd() * PI * 2;
			add( g, G.box( 0.004, 0.0016, len ).translate( 0, 0, len * 0.4 ), cols[ i % 4 ], [ px, top( px, pz ) + 0.002 + rnd() * 0.004, pz ], [ ( rnd() - 0.5 ) * 0.3, a, 0 ] );
		}
	}
	return g;
}

// ---- folded trousers -------------------------------------------------------------------------------------------------
// { style: long|shorts, color, print, color2, color3, rep, weave, cargo, belt, drawstring, stripes, band, button, crease,
//   lace (a lace-up fly), fray (cut-off hems), cuffs (ribbed ankles) }
// Long ones are folded in half lengthwise, then the lower legs back over the seat: the hem lies just short of the
// waistband, which shows beyond it with its loops, button and pockets. Shorts are folded once, the leg hems at -x.
function foldedPants( s ) {
	const g = group(), short = s.style === 'shorts', c = s.color ?? 0x3a4a6a;
	const L = short ? 0.25 : 0.34, W = 0.2, T = short ? 0.03 : 0.022, x = L / 2, z = W / 2;
	const jeans = s.print === 'denim', sweat = !! s.drawstring && ! short && s.button === false;
	const weave = weaveOf( s, sweat ? 'fleece' : short && s.drawstring ? 'nylon' : s.button === false ? 'nylon' : 'twill' );
	const body = cloth( c, { print: s.print, color2: s.color2 ?? 0xffffff, color3: s.color3, rep: s.rep ?? 1.3, weave, rough: s.rough } );
	const stitch = jeans ? M( 0xc8923a, { rough: 0.8 } ) : thread( s.print ? s.color3 ?? c : c );
	const dark = M( shade( c, - 0.5 ), { rough: 0.9 } );
	const metal = M( s.button ?? ( jeans ? 0xb87333 : 0x9a9ea4 ), { rough: 0.3, metal: 0.9 } );
	const elastic = !! s.drawstring || s.button === false;
	const rib = cloth( s.band ?? shade( c, - 0.08 ), { weave: 'rib', rough: 0.95 } );
	// the seat: waist at +x, the crotch curving out on the +z side, the outer seam along -z
	const seatP = curveLoop( short
		? [ [ x, - z + 0.004 ], [ x + 0.002, 0 ], [ x, z - 0.006 ], [ x - 0.05, z + 0.01 ], [ x - 0.11, z + 0.024 ], [ - x + 0.03, z + 0.018 ], [ - x, z - 0.004 ], [ - x - 0.002, 0 ], [ - x, - z + 0.004 ], [ 0, - z - 0.002 ] ]
		: [ [ x, - z + 0.004 ], [ x + 0.002, 0 ], [ x, z - 0.006 ], [ x - 0.06, z + 0.01 ], [ x - 0.12, z + 0.016 ], [ x - 0.17, z + 0.002 ], [ - x + 0.05, z - 0.004 ], [ - x, z - 0.02 ], [ - x - 0.002, 0 ], [ - x, - z + 0.012 ], [ - x + 0.05, - z ], [ 0, - z - 0.002 ] ], 80 );
	const seat = panel( seatP, { T, R: T * 0.9, cell: 0.022, uv: [ 0, 0 ],
		disp: ( px, pz ) => {
			let h = T * 0.12 * ( 1 - ( px / x ) ** 2 );
			// creases fanning out from the crotch (jeans' whiskers)
			if ( short || jeans ) for ( let i = 0; i < 3; i ++ ) h -= T * 0.16 * Math.exp( - ( ( ( pz - ( z - 0.03 - i * 0.022 ) + ( px - x + 0.12 ) * ( 0.35 + i * 0.15 ) ) / 0.005 ) ** 2 ) ) * smooth( x - 0.06, x - 0.13, px ) * smooth( - x * 0.2, x * 0.3, px );
			return h;
		} } );
	add( g, seat.geo, body );
	let top = seat.top;
	const sew = ( pts, m = stitch, t = top ) => add( g, seam( pts, t ), m );
	const lay = ( geo, m, lift, t = top ) => on( g, geo, m, t, lift );
	const xh = short ? - x : x - 0.075; // where the visible seat starts (the hem of the folded-over legs)
	if ( ! short ) {
		// the lower legs folded back over the seat: rounded at the knee fold (-x), the hem at xh
		const legP = curveLoop( [ [ - x - 0.004, - z + 0.012 ], [ 0, - z + 0.002 ], [ xh, - z + 0.006 ], [ xh + 0.002, 0 ], [ xh, z - 0.016 ], [ 0, z - 0.012 ], [ - x - 0.004, z - 0.02 ], [ - x - 0.008, 0 ] ], 64 );
		const leg = panel( legP, { T: T * 0.95, R: T * 0.8, cell: 0.022, uv: [ 0.01, 0.004 ], disp: ( px, pz ) => ( s.crease ? T * 0.12 * Math.exp( - ( ( ( pz + 0.01 ) / 0.01 ) ** 2 ) ) : 0 ) - T * 0.08 * Math.exp( - ( ( ( px + 0.02 - pz * 0.3 ) / 0.012 ) ** 2 ) ) } );
		add( g, conform( leg.geo, seat.top, 0.0004 ), body );
		const ltop = ( px, pz ) => seat.top( px, pz ) + leg.top( px, pz ) + 0.0004;
		// the hem: turned up and double stitched, the outer seam down the side
		sew( line( [ xh - 0.007, - z + 0.01 ], [ xh - 0.007, z - 0.02 ], 6 ), stitch, ltop );
		if ( jeans ) sew( line( [ xh - 0.012, - z + 0.01 ], [ xh - 0.012, z - 0.02 ], 6 ), stitch, ltop );
		sew( line( [ - x + 0.01, - z + 0.012 ], [ xh - 0.016, - z + 0.012 ], 8 ), stitch, ltop );
		if ( s.crease ) sew( line( [ - x + 0.02, - 0.01 ], [ xh - 0.02, - 0.01 ], 8 ), M( shade( c, - 0.22 ) ), ltop );
		if ( s.cuffs ) lay( panel( roundRect( 0.034, W - 0.032, 0.008, xh - 0.018, - 0.005, 3 ), { T: 0.003, R: 0.002, cell: 0.03, bottom: false } ).geo, rib, 0.0004, ltop );
		if ( s.cargo ) {
			// a calf pocket with a flap on the folded leg
			const cx0 = - 0.03, cz0 = - z + 0.055;
			lay( panel( roundRect( 0.075, 0.07, 0.006, cx0, cz0, 3 ), { T: 0.006, R: 0.004, cell: 0.03, bottom: false, uv: [ 0.01, 0.004 ] } ).geo, body, 0.0004, ltop );
			lay( panel( roundRect( 0.03, 0.074, 0.006, cx0 + 0.03, cz0, 3 ), { T: 0.005, R: 0.003, cell: 0.03, bottom: false, uv: [ 0.01, 0.004 ] } ).geo, body, 0.0065, ltop );
			add( g, buttonGeo( 0.005, 0.002 ).translate( cx0 + 0.035, ltop( cx0 + 0.035, cz0 ) + 0.011, cz0 ), metal );
		}
		if ( s.stripes ) {
			// a stripe down the outer seam; turnout pants also have reflective bands round the shin
			const tape = M( s.stripes, { rough: 0.35, metal: 0.2, emissive: s.stripes, emissiveIntensity: 0.12 } );
			lay( panel( roundRect( xh + x - 0.01, 0.012, 0.003, ( xh - x ) / 2, - z + 0.012, 2 ), { T: 0.001, R: 0.001, cell: 0.05, bottom: false } ).geo, s.reflect ? tape : M( s.stripes, { rough: 0.4 } ), 0.0006, ltop );
			if ( s.reflect ) for ( const px of [ - 0.07, - 0.03 ] ) {
				lay( panel( roundRect( 0.022, W - 0.03, 0.003, px, 0, 2 ), { T: 0.0012, R: 0.001, cell: 0.05, bottom: false } ).geo, tape, 0.0009, ltop );
				lay( panel( roundRect( 0.007, W - 0.032, 0.002, px, 0, 2 ), { T: 0.0012, R: 0.001, cell: 0.05, bottom: false } ).geo, M( 0xd4d8dc, { rough: 0.22, metal: 0.65 } ), 0.0018, ltop );
			}
		}
	} else {
		// the leg openings' hem at -x: stitched, cuffed, frayed or split
		if ( s.fray ) {
			const fr = M( shade( s.color2 ?? c, 0.35 ), { rough: 0.95 } );
			let r = 3; const rnd = () => ( r = ( r * 16807 ) % 2147483647 ) / 2147483647;
			for ( let i = 0; i < 34; i ++ ) { const pz = - z + 0.01 + i / 33 * ( W - 0.02 ), len = 0.008 + rnd() * 0.01; add( g, G.box( len, 0.0012, 0.0016 ), fr, [ - x - len * 0.25 + rnd() * 0.004, 0.001 + rnd() * 0.004, pz ], [ 0, ( rnd() - 0.5 ) * 0.8, 0 ] ); }
			sew( line( [ - x + 0.012, - z + 0.01 ], [ - x + 0.012, z - 0.006 ], 6 ), M( shade( c, 0.25 ) ) );
		} else if ( s.cargo ) {
			lay( panel( roundRect( 0.03, W - 0.01, 0.01, - x + 0.016, 0, 3 ), { T: 0.006, R: 0.004, cell: 0.03, bottom: false } ).geo, body, 0.0003 );
			sew( line( [ - x + 0.032, - z + 0.008 ], [ - x + 0.032, z ], 6 ) );
		} else {
			sew( line( [ - x + 0.012, - z + 0.008 ], [ - x + 0.012, z - 0.004 ], 6 ) );
			if ( s.lace ) sew( line( [ - x + 0.004, - z + 0.03 ], [ - x + 0.03, - z + 0.034 ], 3 ), M( shade( c, - 0.45 ) ) ); // the side vent
		}
		if ( s.cargo ) {
			// a bellows pocket on the thigh, its flap snapped down
			const cx0 = - 0.01, cz0 = - z + 0.05;
			lay( panel( roundRect( 0.08, 0.075, 0.008, cx0, cz0, 3 ), { T: 0.008, R: 0.005, cell: 0.03, bottom: false, uv: [ 0, 0 ] } ).geo, body, 0.0003 );
			lay( panel( roundRect( 0.032, 0.08, 0.008, cx0 + 0.03, cz0, 3 ), { T: 0.006, R: 0.004, cell: 0.03, bottom: false, uv: [ 0, 0 ] } ).geo, body, 0.0085 );
			add( g, buttonGeo( 0.0055, 0.002 ).translate( cx0 + 0.036, top( cx0 + 0.036, cz0 ) + 0.0145, cz0 ), metal );
		}
	}

	// ---- the waistband end ----
	const wb = panel( roundRect( 0.032, W - 0.004, [ 0.004, 0.012, 0.012, 0.004 ], x - 0.017, 0, 3 ), { T: 0.007, R: 0.004, cell: 0.03, bottom: false, uv: [ 0, 0 ],
		disp: elastic ? ( px, pz ) => 0.0015 * Math.sin( pz / 0.006 * PI ) : null } );
	const wbm = elastic ? rib : s.band ? cloth( s.band, { weave: 'twill' } ) : body;
	add( g, conform( wb.geo, top, 0.0003 ), wbm );
	const wtop = ( px, pz ) => top( px, pz ) + wb.top( px, pz ) + 0.0003;
	if ( ! elastic ) {
		sew( line( [ x - 0.034, - z + 0.004 ], [ x - 0.034, z - 0.006 ], 6 ) );
		// belt loops, the button and a rivet; the fly's J stitch and the front pocket's curve
		for ( const pz of [ - 0.062, 0.03 ] ) lay( panel( roundRect( 0.04, 0.009, 0.002, x - 0.016, pz, 2 ), { T: 0.003, R: 0.0015, cell: 0.03, bottom: false } ).geo, wbm, 0.0004, wtop );
		add( g, buttonGeo( jeans ? 0.0068 : 0.006, 0.003 ).translate( x - 0.016, wtop( x - 0.016, z - 0.016 ), z - 0.016 ), metal );
		sew( [ [ x - 0.034, z - 0.032 ], [ x - 0.07, z - 0.032 ], [ x - 0.082, z - 0.022 ], [ x - 0.086, z - 0.008 ] ].filter( p => short || p[ 0 ] > xh + 0.004 ) );
		const pk = [ [ x - 0.034, - 0.018 ], [ x - 0.05, - 0.048 ], [ x - 0.064, - z + 0.022 ], [ x - 0.07, - z + 0.004 ] ].filter( p => short || p[ 0 ] > xh + 0.004 );
		if ( pk.length > 1 ) { sew( pk, dark ); sew( pk.map( p => [ p[ 0 ] - 0.004, p[ 1 ] - 0.003 ] ) ); }
		if ( jeans ) {
			add( g, G.cyl( 0.0025, 0.0025, 0.0015, 6 ).translate( x - 0.037, top( x - 0.037, - 0.016 ) + 0.0005, - 0.016 ), metal );
			sew( [ [ x - 0.034, - 0.03 ], [ x - 0.054, - 0.03 ], [ x - 0.054, - 0.058 ] ].filter( p => short || p[ 0 ] > xh + 0.004 ) ); // the coin pocket
		}
	} else {
		// a drawstring out of the front, tied off
		const cord = M( typeof s.lace === 'number' ? s.lace : 0xf2f2ee, { rough: 0.8 } ), dz = z - 0.03;
		for ( const k of [ - 1, 1 ] ) {
			const pts = [ [ x - 0.012, wtop( x - 0.012, dz + k * 0.006 ) + 0.002, dz + k * 0.006 ], [ x - 0.03, top( x - 0.03, dz + k * 0.012 ) + 0.004, dz + k * 0.014 ], [ x - 0.07 - k * 0.01, top( x - 0.07, dz + k * 0.02 ) + 0.003, dz - 0.004 + k * 0.026 ] ];
			add( g, G.tube( pts, 0.0022, 10, 5 ), cord );
			add( g, G.cyl( 0.0026, 0.0026, 0.012, 6 ).rotateZ( PI / 2 ).translate( pts[ 2 ][ 0 ] - 0.005, pts[ 2 ][ 1 ], pts[ 2 ][ 2 ] ), M( 0xb8bcc2, { rough: 0.3, metal: 0.9 } ) );
		}
		if ( s.lace ) for ( let i = 0; i < 3; i ++ ) add( g, G.box( 0.0024, 0.0014, 0.02 ).translate( x - 0.044 - i * 0.012, top( x - 0.044 - i * 0.012, z - 0.02 ) + 0.0015, z - 0.02 ), cord, null, [ 0, ( i % 2 ? 0.5 : - 0.5 ), 0 ] );
	}
	if ( short ) sew( line( [ x - 0.04, - z + 0.012 ], [ - x + 0.03, - z + 0.012 ], 6 ) ); // the outer seam
	if ( s.stripes && short ) lay( panel( roundRect( L - 0.04, 0.012, 0.003, - 0.01, - z + 0.012, 2 ), { T: 0.001, R: 0.001, cell: 0.05, bottom: false } ).geo, M( s.stripes, { rough: 0.4 } ), 0.0006 );
	if ( s.stripes && ! short ) lay( panel( roundRect( x - xh - 0.036, 0.012, 0.003, ( xh + x - 0.034 ) / 2, - z + 0.012, 2 ), { T: 0.001, R: 0.001, cell: 0.05, bottom: false } ).geo, s.reflect ? M( s.stripes, { rough: 0.35, metal: 0.2, emissive: s.stripes, emissiveIntensity: 0.12 } ) : M( s.stripes, { rough: 0.4 } ), 0.0006 );
	if ( s.suspenders ) for ( const pz of [ - 0.04, 0.05 ] ) add( g, buttonGeo( 0.006, 0.0025 ).translate( x - 0.016, wtop( x - 0.016, pz ), pz ), M( 0x2a2a2a, { rough: 0.4 } ) );
	return g;
}

// ---- shoes -----------------------------------------------------------------------------------------------------------
// { style: sneakers|boots|combat|work|rain|firefighter|tabi|reef|dress|slippers|fins, color, color2, sole, laces }
// One shoe is a sole (its outline extruded, sprung up at the toe) under an upper lofted over it: a cross-section round
// the foot at each step from heel to toe, the opening sunk into it (lined, a padded collar round it), a tongue under
// criss-crossed laces. Boots grow a shaft from the ankle. The pair: low shoes have one tipped on its side to show the
// tread; boots stand side by side.
const SHOE = {
	sneakers: { L: 0.28, sole: 0.026, hc: 0.056, hi: 0.072, ht: 0.036, open: [ 0.03, 0.4 ], laces: 5, weave: 'canvas', tipped: true, cap: true },
	boots: { L: 0.29, sole: 0.03, hc: 0.08, hi: 0.08, ht: 0.044, shaft: 0.15, laces: 3, hooks: 3, weave: 'leather', rough: 0.75, lug: true, rand: true },
	combat: { L: 0.3, sole: 0.032, hc: 0.08, hi: 0.08, ht: 0.042, shaft: 0.2, laces: 3, hooks: 5, weave: 'leather', rough: 0.6, lug: true, rand: true },
	work: { L: 0.3, sole: 0.034, hc: 0.08, hi: 0.086, ht: 0.052, shaft: 0.15, laces: 3, hooks: 3, weave: 'leather', rough: 0.8, lug: true, cap: true },
	rain: { L: 0.3, sole: 0.026, hc: 0.08, hi: 0.086, ht: 0.05, shaft: 0.3, wide: 1.18, gloss: true },
	firefighter: { L: 0.31, sole: 0.03, hc: 0.08, hi: 0.09, ht: 0.054, shaft: 0.3, wide: 1.18, gloss: true, lug: true },
	tabi: { L: 0.27, sole: 0.016, hc: 0.06, hi: 0.066, ht: 0.03, shaft: 0.1, split: true, weave: 'canvas' },
	reef: { L: 0.27, sole: 0.016, hc: 0.05, hi: 0.06, ht: 0.03, open: [ 0.03, 0.42 ], weave: 'neoprene', tipped: true },
	dress: { L: 0.29, sole: 0.01, heel: 0.022, hc: 0.052, hi: 0.066, ht: 0.03, open: [ 0.05, 0.36 ], laces: 3, weave: 'leather', rough: 0.28, tipped: true, pointy: true },
};
// a box from a to b (laces, straps)
function strut( a, b, w, h ) {
	const A = new THREE.Vector3( ...a ), B = new THREE.Vector3( ...b ), d = B.clone().sub( A ), l = d.length();
	const geo = new THREE.BoxGeometry( l, h, w );
	geo.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 1, 0, 0 ), d.normalize() ) );
	return geo.translate( ( A.x + B.x ) / 2, ( A.y + B.y ) / 2, ( A.z + B.z ) / 2 );
}

function shoeOne( s, F, side ) {
	const g = group(), L = F.L, wide = F.wide ?? 1;
	const upperM = F.gloss ? M( s.color ?? 0x2a4a2a, { rough: 0.22 } ) : cloth( s.color ?? 0xdddddd, { weave: F.weave, rough: F.rough, bump: 0.6 } );
	const soleM = M( s.sole ?? 0xeeeeee, { rough: 0.85 } ), outM = M( shade( s.sole ?? 0xeeeeee, F.lug ? - 0.25 : - 0.12 ), { rough: 0.9 } );
	const acc = M( s.color2 ?? shade( s.color ?? 0xdddddd, - 0.3 ), { rough: F.gloss ? 0.3 : 0.7 } );
	const lining = M( 0x24221f, { rough: 0.95 } );
	// the footprint: half widths on the outer (+side) and inner side at t (heel 0 .. toe 1)
	const hw = ( t ) => {
		let w = lerp( 0.03, 0.043, smooth( 0.12, 0.66, t ) ) * wide;
		if ( F.pointy ) w *= 1 - 0.25 * smooth( 0.7, 1, t );
		if ( t > 0.72 ) w *= Math.pow( Math.max( 0, 1 - ( ( t - 0.72 ) / 0.28 ) ** 2 ), 0.55 );
		if ( t < 0.12 ) w *= Math.pow( Math.max( 0, 1 - ( ( 0.12 - t ) / 0.12 ) ** 2 ), 0.5 );
		return w;
	};
	const arch = ( t ) => 1 - 0.2 * Math.exp( - ( ( ( t - 0.42 ) / 0.13 ) ** 2 ) );
	const X = ( t ) => - L / 2 + t * L;
	const heel = F.heel ?? 0;
	const spring = ( t ) => 0.014 * smooth( 0.72, 1, t ) ** 2 + 0.004 * smooth( 0.14, 0, t ) ** 2;
	const lift = ( t ) => heel * smooth( 0.4, 0.22, t ); // a heeled sole rises under the arch
	const soleTop = ( t ) => F.sole + spring( t ) + lift( t );
	// ---- the sole: the outline extruded, bent with the toe spring and the heel ----
	const NT = 20, outline = [];
	for ( let i = 0; i <= NT; i ++ ) { const t = i / NT; outline.push( [ X( t ), side * ( hw( t ) + 0.003 ) ] ); }
	for ( let i = NT - 1; i > 0; i -- ) { const t = i / NT; outline.push( [ X( t ), - side * ( hw( t ) * arch( t ) + 0.003 ) ] ); }
	const shape = new THREE.Shape( outline.map( p => new THREE.Vector2( p[ 0 ], - p[ 1 ] ) ) );
	const tOf = ( x ) => clamp01( ( x + L / 2 ) / L );
	const layer = ( y0, h, k, m ) => {
		const geo = new THREE.ExtrudeGeometry( shape, { depth: h, bevelEnabled: false, curveSegments: 4 } );
		geo.rotateX( - PI / 2 );
		const p = geo.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) {
			const t = tOf( p.getX( i ) );
			p.setXYZ( i, p.getX( i ) * k, p.getY( i ) + y0 + spring( t ) + ( y0 > 0.001 || heel === 0 ? lift( t ) : 0 ), p.getZ( i ) * k );
		}
		smoothNormals( geo, 1e-4 );
		add( g, geo, m );
	};
	if ( heel ) {
		// a thin leather sole and a stacked heel block
		layer( 0, F.sole, 1, soleM );
		const hp = []; for ( let i = 0; i <= 8; i ++ ) { const a = PI / 2 + i / 8 * PI; hp.push( new THREE.Vector2( X( 0.12 ) + Math.cos( a ) * 0.035, Math.sin( a ) * hw( 0.12 ) * 1.05 ) ); }
		hp.push( new THREE.Vector2( X( 0.24 ), - hw( 0.24 ) ), new THREE.Vector2( X( 0.24 ), hw( 0.24 ) ) );
		const hg = new THREE.ExtrudeGeometry( new THREE.Shape( hp ), { depth: heel + 0.002, bevelEnabled: false } ).rotateX( - PI / 2 );
		add( g, smoothNormals( hg, 1e-4 ), outM );
	} else if ( F.lug || F.gloss ) layer( 0, F.sole, 1, outM ); // one lugged rubber sole
	else {
		// a rubber outsole under a lighter midsole
		layer( 0, F.sole * 0.32, 1.012, outM );
		layer( F.sole * 0.3, F.sole * 0.7, 1, soleM );
	}
	// ---- the upper: x along the foot, the cross-section from the inner edge (a = 0) over the top to the outer (a = 1);
	// a boot's shaft is the same surface risen behind the instep, its sections boxier ----
	const hs = F.shaft ?? 0, ts0 = 0.3, ts1 = 0.46;
	const op = F.open ?? ( hs ? [ 0.03, ts0 + 0.01 ] : null );
	const ins = ( t ) => soleTop( t ) + 0.012;
	const shaftK = ( t ) => hs ? 1 - smooth( ts0, ts1, t ) : 0;
	const H = ( t ) => {
		let h = lerp( F.hc, F.hi, smooth( 0.08, 0.48, t ) );
		h = lerp( h, F.ht, smooth( 0.5, 0.92, t ) );
		if ( t > 0.88 ) h *= Math.sqrt( Math.max( 0, 1 - ( ( t - 0.88 ) / 0.12 ) ** 2 ) ) * 0.85 + 0.15;
		return hs ? lerp( h, hs, shaftK( t ) ) : h;
	};
	const opening = ( t ) => op ? smooth( op[ 0 ] - 0.02, op[ 0 ] + 0.04, t ) * smooth( op[ 1 ] + 0.02, op[ 1 ] - 0.05, t ) : 0;
	const RIM = 0.8;
	const up = ( t, a ) => {
		const th = a * PI, c = Math.cos( th ), sn = Math.sin( th ), k = shaftK( t );
		const zc = - Math.sign( c ) * Math.pow( Math.abs( c ), lerp( 0.72, 0.42, k ) ), yc = Math.pow( sn, lerp( 0.8, 0.3, k ) );
		const w = hw( t ) * ( c > 0 ? arch( t ) : 1 ) * lerp( 1, 1.12, k );
		let y = soleTop( t ) - 0.004 + H( t ) * yc;
		const o = opening( t );
		if ( o > 0 ) { const floor = Math.max( ins( t ), soleTop( t ) + H( t ) - 0.04 ); y = lerp( y, Math.min( y, floor ), o * smooth( RIM, RIM + 0.12, yc ) ); }
		return [ X( t ), y, side * zc * w ];
	};
	const NU = hs ? 20 : 16, NV = 12;
	// denser rows round the rim and (boots) down the steep front of the shaft
	const aOf = ( v ) => { const k = v * 2 - 1; return 0.5 + 0.5 * Math.sign( k ) * Math.pow( Math.abs( k ), 0.8 ); };
	const tOf2 = hs ? ( v ) => v < 0.2 ? v / 0.2 * 0.27 : v < 0.6 ? 0.27 + ( v - 0.2 ) / 0.4 * 0.23 : 0.5 + ( v - 0.6 ) / 0.4 * 0.5 : ( v ) => v;
	const surf = ( t0, t1, a0, a1, nu, nv, off = 0, full = false ) => grid( nv, nu, ( u, v ) => {
		const t = full ? tOf2( v ) : lerp( t0, t1, v ), a = lerp( a0, a1, aOf( u ) );
		const p = up( t, a );
		if ( off ) { const n = normalAt( t, a ); return [ p[ 0 ] + n[ 0 ] * off, p[ 1 ] + n[ 1 ] * off, p[ 2 ] + n[ 2 ] * off ]; }
		return p;
	} );
	const normalAt = ( t, a ) => {
		const e = 0.004, p0 = up( t, a ), pt = up( Math.min( 1, t + e ), a ), pa = up( t, Math.min( 1, a + e ) );
		const A = new THREE.Vector3( pt[ 0 ] - p0[ 0 ], pt[ 1 ] - p0[ 1 ], pt[ 2 ] - p0[ 2 ] ), B = new THREE.Vector3( pa[ 0 ] - p0[ 0 ], pa[ 1 ] - p0[ 1 ], pa[ 2 ] - p0[ 2 ] );
		const n = A.cross( B ).normalize().multiplyScalar( side );
		return [ n.x, n.y, n.z ];
	};
	const flip = ( geo ) => { if ( side < 0 ) { const ix = geo.index.array; for ( let i = 0; i < ix.length; i += 3 ) { const tmp = ix[ i + 1 ]; ix[ i + 1 ] = ix[ i + 2 ]; ix[ i + 2 ] = tmp; } geo.computeVertexNormals(); } return geo; };
	add( g, flip( surf( 0, 1, 0, 1, NU, NV, 0, true ) ), upperM );
	// overlays on the upper: a toe cap, a rand round the base, a heel counter, the side flash
	const over = ( t0, t1, a0, a1, m, nu = 5, nv = 6, off = 0.0012 ) => add( g, flip( surf( t0, t1, a0, a1, nu, nv, off ) ), m );
	if ( F.cap ) over( 0.8, 1, 0, 1, style( s ) === 'sneakers' ? soleM : acc, 4, 8 );
	if ( F.rand ) { over( 0.04, 1, 0, 0.14, acc, 10, 1 ); over( 0.04, 1, 0.86, 1, acc, 10, 1 ); over( 0.84, 1, 0.12, 0.88, acc, 3, 6 ); }
	if ( ! F.gloss && ! hs ) { over( 0, 0.15, 0.04, 0.3, acc, 3, 3 ); over( 0, 0.15, 0.7, 0.96, acc, 3, 3 ); } // the heel counter, outside the opening
	if ( style( s ) === 'sneakers' ) {
		// a stripe swept back along the outer side
		const fl = grid( 1, 6, ( u, v ) => { const t = lerp( 0.3, 0.72, v ), a0 = lerp( 0.84, 0.7, v ) + u * 0.07, a = side > 0 ? a0 : 1 - a0; const p = up( t, a ), n = normalAt( t, a ); return [ p[ 0 ] + n[ 0 ] * 0.0016, p[ 1 ] + n[ 1 ] * 0.0016, p[ 2 ] + n[ 2 ] * 0.0016 ]; } );
		add( g, side > 0 ? fl : flip( fl ), acc );
	}
	// ---- the opening: lining, padded collar, tongue ----
	if ( op ) {
		over( op[ 0 ] - 0.02, op[ 1 ] + 0.02, 0.32, 0.68, lining, 6, 6, 0.0009 );
		let aR = 0.5;
		{ // where the rim is: the section's top flattens to RIM there
			const k = shaftK( ( op[ 0 ] + op[ 1 ] ) / 2 ), pw = lerp( 0.8, 0.3, k );
			aR = Math.asin( Math.pow( RIM, 1 / pw ) ) / PI;
		}
		const rim = [];
		for ( let i = 0; i <= 4; i ++ ) rim.push( up( lerp( op[ 1 ] - 0.02, op[ 0 ] + 0.03, i / 4 ), aR ) );
		rim.push( up( op[ 0 ] - 0.004, 0.5 ) );
		for ( let i = 4; i >= 0; i -- ) rim.push( up( lerp( op[ 1 ] - 0.02, op[ 0 ] + 0.03, i / 4 ), 1 - aR ) );
		add( g, G.tube( rim.map( p => [ p[ 0 ], p[ 1 ] + 0.002, p[ 2 ] ] ), F.gloss ? 0.004 : F.pointy ? 0.003 : 0.0055, 16, 5 ), hs ? acc : upperM );
		if ( F.laces && ! hs && ! F.pointy ) {
			// the padded tongue, a little proud of the throat under the laces
			const tp = [ up( 0.6, 0.5 ), up( op[ 1 ] + 0.03, 0.5 ), up( op[ 1 ] - 0.03, 0.5 ) ];
			tp[ 1 ][ 1 ] += 0.003; tp[ 2 ][ 1 ] = tp[ 1 ][ 1 ] + 0.004;
			add( g, band( tp.map( p => [ p[ 0 ], p[ 1 ] + 0.001, p[ 2 ] ] ), 0.036, 0.006, { round: true, seg: 6 } ), upperM );
		}
	}
	// ---- laces: criss-crossed between eyelets either side of the vamp (up the front of a boot's shaft), a bow ----
	const laceM = M( s.laces ?? ( style( s ) === 'sneakers' ? 0xf5f5f5 : 0x2a2420 ), { rough: 0.8 } );
	const hookM = M( 0x8a8e94, { rough: 0.35, metal: 0.85 } );
	// a point on the surface 17 mm either side of the middle (k = -1 inner, 1 outer)
	const eye = ( t, k, gap = 0.017 ) => {
		let lo = 0.5, hi = k * side > 0 ? 1 : 0;
		for ( let i = 0; i < 18; i ++ ) { const m = ( lo + hi ) / 2; if ( Math.abs( up( t, m )[ 2 ] ) < gap ) lo = m; else hi = m; }
		const p = up( t, lo ), n = normalAt( t, lo );
		return [ p[ 0 ] + n[ 0 ] * 0.0025, p[ 1 ] + n[ 1 ] * 0.0025, p[ 2 ] + n[ 2 ] * 0.0025 ];
	};
	if ( F.laces ) {
		const n = F.laces + ( F.hooks ?? 0 );
		const T0 = hs ? ts0 + 0.012 : op[ 1 ] + 0.03, T1 = 0.64;
		const E = [];
		for ( let i = 0; i < n; i ++ ) { const t = lerp( T0, T1, i / ( n - 1 ) ); E.push( [ eye( t, - 1 ), eye( t, 1 ) ] ); }
		if ( hs ) for ( let i = 0; i < n - F.laces; i ++ ) for ( const P of E[ i ] ) add( g, G.cyl( 0.0028, 0.0028, 0.006, 6 ).rotateZ( PI / 2 ).translate( P[ 0 ] + 0.002, P[ 1 ], P[ 2 ] ), hookM );
		for ( let i = 0; i < n; i ++ ) {
			if ( i === n - 1 ) add( g, strut( E[ i ][ 0 ], E[ i ][ 1 ], 0.004, 0.0022 ), laceM );
			else { add( g, strut( E[ i ][ 0 ], E[ i + 1 ][ 1 ], 0.0036, 0.002 ), laceM ); add( g, strut( E[ i ][ 1 ], E[ i + 1 ][ 0 ], 0.0036, 0.002 ), laceM ); }
		}
		// the bow at the top
		const b = E[ 0 ][ 0 ].map( ( v, k ) => ( v + E[ 0 ][ 1 ][ k ] ) / 2 );
		for ( const k of [ - 1, 1 ] ) {
			add( g, G.torus( 0.011, 0.0018, 4, 10 ).scale( 1, 1, 0.55 ).rotateX( PI / 2 ).rotateY( k * 0.4 ).translate( b[ 0 ] - 0.004, b[ 1 ] + 0.003, b[ 2 ] + k * 0.012 ), laceM );
			add( g, strut( [ b[ 0 ], b[ 1 ] + 0.002, b[ 2 ] ], [ b[ 0 ] - ( hs ? 0.006 : 0.03 ), b[ 1 ] - ( hs ? 0.03 : 0.004 ), b[ 2 ] + k * 0.03 ], 0.0034, 0.002 ), laceM );
		}
		if ( hs ) {
			// the tongue's top above the laces
			const p = up( ts0 - 0.01, 0.5 );
			add( g, G.rbox( 0.014, 0.022, 0.04, 0.005, 1 ), acc, [ p[ 0 ] + 0.004, p[ 1 ] - 0.012, 0 ], [ 0, 0, 0.2 ] );
		}
	}
	if ( hs && style( s ) === 'firefighter' ) {
		// a reflective band round the top of the shaft, pull loops
		add( g, flip( surf( 0, ts0 + 0.06, 0, 1, 6, 12, 0.0014 ).translate( 0, 0, 0 ) ), M( 0x141414, { rough: 0.3 } ) );
		const yb = soleTop( 0.15 ) + hs * 0.74;
		add( g, grid( 16, 1, ( u, v ) => { const a = u * PI * 2, w = hw( 0.17 ) * 1.25 + 0.003; return [ X( 0.17 ) + Math.cos( a ) * 0.075, yb + v * 0.03, Math.sin( a ) * w ]; }, { closeU: true } ), M( s.color2 ?? 0xd8c020, { rough: 0.35, emissive: s.color2 ?? 0xd8c020, emissiveIntensity: 0.08 } ) );
	}
	if ( hs && style( s ) === 'rain' ) {
		// a strap and buckle near the top of the shaft
		const yb = soleTop( 0.15 ) + hs * 0.78;
		add( g, grid( 16, 1, ( u, v ) => { const a = u * PI * 2, w = hw( 0.17 ) * 1.3 + 0.002; return [ X( 0.17 ) + Math.cos( a ) * 0.074, yb + v * 0.018, Math.sin( a ) * w ]; }, { closeU: true } ), acc );
		add( g, G.box( 0.004, 0.026, 0.02 ), M( 0x8a8e94, { rough: 0.3, metal: 0.85 } ), [ X( 0.17 ), yb + 0.009, side * ( hw( 0.17 ) * 1.3 + 0.004 ) ], [ 0, PI / 2, 0 ] );
	}
	if ( F.split ) {
		// tabi: the split between the big toe and the rest, hooks up the back
		add( g, strut( [ X( 0.82 ), soleTop( 0.82 ) + 0.03, - side * 0.012 ], [ X( 1 ) + 0.004, soleTop( 1 ) + 0.01, - side * 0.012 ], 0.004, 0.03 ), lining );
		for ( let i = 0; i < 4; i ++ ) add( g, G.box( 0.004, 0.003, 0.01 ), MAT.gold(), [ X( 0 ) - 0.002, soleTop( 0 ) + 0.02 + i * 0.022, side * 0.004 ] );
	}
	// a pull tab at the heel
	if ( ! F.gloss && ! F.split && ! F.pointy ) add( g, G.rbox( 0.004, hs ? 0.026 : 0.016, 0.012, 0.002, 1 ), acc, [ X( 0 ) - 0.002, soleTop( 0 ) + H( 0.02 ) - ( hs ? 0.016 : 0.01 ), 0 ] );
	g.userData.tread = ( m ) => {
		// lugs under the sole (only the tipped shoe shows them)
		if ( heel ) return; // a smooth leather sole
		const lug = F.lug ? 0.004 : 0.0022;
		for ( let i = 0; i < 7; i ++ ) {
			const t = 0.07 + i / 6 * 0.86;
			const w = hw( t ) * 0.85, n = Math.max( 2, Math.min( 4, Math.round( w / 0.014 ) ) );
			for ( let j = 0; j < n; j ++ ) {
				const zz = lerp( - w, w, ( j + 0.5 ) / n ) * side;
				add( g, G.box( F.lug ? 0.014 : 0.01, lug, F.lug ? 0.008 : w * 2 / n * 0.7 ), m, [ X( t ), spring( t ) - lug / 2 + 0.0005 + ( heel ? 0 : 0 ), zz ], [ 0, F.lug ? ( j % 2 ? 0.5 : - 0.5 ) : 0, 0 ] );
			}
		}
	};
	return g;
}
const clamp01 = ( v ) => v < 0 ? 0 : v > 1 ? 1 : v;
const style = ( s ) => s.style || 'sneakers';

function shoePair( s ) {
	const g = group(), st = style( s );
	if ( st === 'slippers' ) return slippers( s );
	if ( st === 'fins' ) return fins( s );
	const F = SHOE[ st ] || SHOE.sneakers;
	const R = shoeOne( s, F, 1 ), Lf = shoeOne( s, F, - 1 );
	if ( F.tipped ) {
		// the right shoe stands behind, the left lies on its outer side in front of it, the tread towards you
		R.position.set( 0.015, 0, - 0.04 ); R.rotation.y = 0.1;
		Lf.userData.tread( M( shade( s.sole ?? 0xeeeeee, F.lug ? - 0.25 : - 0.12 ), { rough: 0.9 } ) );
		Lf.rotation.set( - PI / 2 + 0.25, 0, 0, 'YXZ' ); Lf.rotation.y = - 0.12;
		Lf.position.set( - 0.02, 0, 0.12 );
	} else {
		R.position.set( 0.02, 0, 0.058 * ( F.wide ?? 1 ) ); R.rotation.y = 0.08;
		Lf.position.set( - 0.015, 0, - 0.058 * ( F.wide ?? 1 ) ); Lf.rotation.y = - 0.06;
	}
	g.add( R, Lf );
	return ground( g );
}

function slippers( s ) {
	// rubber slippahs: a two-tone footbed and a Y strap from the toe post
	const g = group(), top = M( s.color ?? 0xf2f2ee, { rough: 0.7 } ), bot = M( s.sole ?? 0x2a5ad6, { rough: 0.8 } ), strap = M( s.color2 ?? 0x2a5ad6, { rough: 0.55 } );
	for ( const [ side, zz, rot, dx ] of [ [ 1, 0.058, 0.1, 0.012 ], [ - 1, - 0.058, - 0.06, - 0.01 ] ] ) {
		const one = group(), L = 0.27;
		const P = [];
		for ( let i = 0; i <= 24; i ++ ) { const t = i / 24; let w = lerp( 0.034, 0.046, smooth( 0.1, 0.7, t ) ); if ( t > 0.75 ) w *= Math.pow( 1 - ( ( t - 0.75 ) / 0.25 ) ** 2, 0.5 ); if ( t < 0.1 ) w *= Math.pow( 1 - ( ( 0.1 - t ) / 0.1 ) ** 2, 0.5 ); P.push( [ - L / 2 + t * L, side * w ] ); }
		for ( let i = 23; i > 0; i -- ) { const t = i / 24; let w = lerp( 0.03, 0.042, smooth( 0.1, 0.7, t ) ) * ( 1 - 0.18 * Math.exp( - ( ( ( t - 0.42 ) / 0.13 ) ** 2 ) ) ); if ( t > 0.75 ) w *= Math.pow( 1 - ( ( t - 0.75 ) / 0.25 ) ** 2, 0.5 ); if ( t < 0.1 ) w *= Math.pow( 1 - ( ( 0.1 - t ) / 0.1 ) ** 2, 0.5 ); P.push( [ - L / 2 + t * L, - side * w ] ); }
		const base = panel( P, { T: 0.011, R: 0.004, cell: 0.03, lift: 0.004 } );
		add( one, base.geo, bot );
		const foot = panel( P.map( p => [ p[ 0 ] * 0.985, p[ 1 ] * 0.94 ] ), { T: 0.007, R: 0.004, cell: 0.03, y0: 0.008, disp: ( x, z ) => - 0.002 * Math.exp( - ( ( ( x - 0.06 ) / 0.04 ) ** 2 ) ) - 0.002 * Math.exp( - ( ( ( x + 0.08 ) / 0.04 ) ** 2 ) ) } );
		add( one, foot.geo, top );
		const post = [ 0.07, 0.017, side * 0.004 ];
		add( one, G.cyl( 0.0035, 0.004, 0.012, 6 ), strap, [ post[ 0 ], 0.013, post[ 2 ] ] );
		for ( const k of [ - 1, 1 ] ) add( one, G.tube( [ [ post[ 0 ], 0.024, post[ 2 ] ], [ 0.035, 0.032, side * 0.004 + k * 0.026 ], [ - 0.005, 0.018, side * 0.004 + k * 0.04 ] ], 0.0042, 10, 5 ).scale( 1, 0.7, 1 ), strap );
		one.position.set( dx, 0, zz ); one.rotation.y = rot;
		g.add( one );
	}
	return ground( g );
}

function fins( s ) {
	// two fins stacked: a foot pocket and a long ribbed blade
	const g = group(), blade = M( s.color ?? 0x2a7ad6, { rough: 0.35 } ), pocket = M( s.color2 ?? 0x1a1a1a, { rough: 0.7 } );
	for ( const [ k, y, rz ] of [ [ - 1, 0, - 0.2 ], [ 1, 0.0, 0.2 ] ] ) {
		const one = group();
		const P = curveLoop( [ [ - 0.16, - 0.045 ], [ 0.02, - 0.05 ], [ 0.24, - 0.1 ], [ 0.33, - 0.095 ], [ 0.34, 0 ], [ 0.33, 0.095 ], [ 0.24, 0.1 ], [ 0.02, 0.05 ], [ - 0.16, 0.045 ], [ - 0.2, 0 ] ], 48 );
		add( one, panel( P, { T: 0.008, R: 0.004, cell: 0.03, disp: ( x, z ) => - 0.003 * Math.abs( Math.sin( z / 0.1 * PI ) ) * smooth( 0.05, 0.25, x ) } ).geo, blade );
		for ( const z of [ - 1, 1 ] ) add( one, strut( [ - 0.02, 0.008, z * 0.045 ], [ 0.31, 0.008, z * 0.088 ], 0.008, 0.006 ), pocket );
		add( one, softBox( 0.17, 0.05, 0.095, 0.022, { seg: 3 } ), pocket, [ - 0.1, 0.002, 0 ] );
		add( one, G.cyl( 0.03, 0.03, 0.004, 12 ).scale( 1.3, 1, 1 ), M( 0x0c0c0c ), [ - 0.12, 0.051, 0 ] );
		one.position.set( 0, y, k * 0.085 ); one.rotation.set( 0, rz, 0 );
		g.add( one );
	}
	return ground( g );
}

// ---- gloves --------------------------------------------------------------------------------------------------------
// { color, color2 (cuff / accents), style: work|tactical|latex|fingerless|fire|dive } (the style also tells the
// first-person arms how to draw them). A pair laid out in a V, one showing its back, one its palm.

// a hand's outline, fingers towards +x, the thumb on the +z side
function handOutline( fl = 1 ) {
	const P = [ [ - 0.085, - 0.04 ], [ - 0.03, - 0.045 ], [ 0.02, - 0.044 ] ];
	const FING = [ [ - 0.029, 0.05, - 0.16 ], [ - 0.0098, 0.064, - 0.05 ], [ 0.0098, 0.068, 0.03 ], [ 0.029, 0.061, 0.12 ] ];
	FING.forEach( ( [ zc, len, a ], i ) => {
		const hw = i === 0 ? 0.0082 : 0.0092, l = Math.max( 0.016, len * fl ), bx = 0.042 - ( i === 0 ? 0.008 : 0 ) - Math.abs( zc ) * 0.15;
		const d = [ Math.cos( a ), Math.sin( a ) ], n = [ - Math.sin( a ), Math.cos( a ) ];
		const tip = [ bx + d[ 0 ] * ( l - hw ), zc + d[ 1 ] * ( l - hw ) ];
		P.push( [ bx - n[ 0 ] * hw, zc - n[ 1 ] * hw ], [ tip[ 0 ] - n[ 0 ] * hw, tip[ 1 ] - n[ 1 ] * hw ] );
		for ( let k = 1; k < 6; k ++ ) { const t = - PI / 2 + k / 6 * PI, c = Math.cos( t ), sn = Math.sin( t ); P.push( [ tip[ 0 ] + ( d[ 0 ] * c + n[ 0 ] * sn ) * hw, tip[ 1 ] + ( d[ 1 ] * c + n[ 1 ] * sn ) * hw ] ); }
		P.push( [ tip[ 0 ] + n[ 0 ] * hw, tip[ 1 ] + n[ 1 ] * hw ], [ bx + n[ 0 ] * hw, zc + n[ 1 ] * hw ] );
		if ( i < 3 ) P.push( [ bx - 0.004, ( zc + FING[ i + 1 ][ 0 ] ) / 2 ] );
	} );
	// down the index side to the thumb's crotch, round the thumb, back to the wrist
	P.push( [ 0.018, 0.043 ] );
	const tb = [ - 0.002, 0.044 ], a = 0.75, d = [ Math.cos( a ), Math.sin( a ) ], n = [ - Math.sin( a ), Math.cos( a ) ], hw = 0.0105, l = Math.max( 0.02, 0.052 * Math.max( 0.45, fl ) );
	const tip = [ tb[ 0 ] + d[ 0 ] * ( l - hw ), tb[ 1 ] + d[ 1 ] * ( l - hw ) ];
	P.push( [ tb[ 0 ] + n[ 0 ] * hw * - 1 + 0.008, tb[ 1 ] - n[ 1 ] * hw ], [ tip[ 0 ] - n[ 0 ] * hw, tip[ 1 ] - n[ 1 ] * hw ] );
	for ( let k = 1; k < 6; k ++ ) { const t = - PI / 2 + k / 6 * PI, c = Math.cos( t ), sn = Math.sin( t ); P.push( [ tip[ 0 ] + ( d[ 0 ] * c + n[ 0 ] * sn ) * hw, tip[ 1 ] + ( d[ 1 ] * c + n[ 1 ] * sn ) * hw ] ); }
	P.push( [ tip[ 0 ] + n[ 0 ] * hw, tip[ 1 ] + n[ 1 ] * hw ], [ - 0.03, 0.05 ], [ - 0.085, 0.042 ] );
	return P;
}

function glovePair( s ) {
	const g = group(), st = s.style || 'work', c = s.color ?? 0x8a6a3a;
	const latex = st === 'latex', fingerless = st === 'fingerless';
	const weave = latex ? 'none' : weaveOf( s, { tactical: 'nylon', dive: 'neoprene', fingerless: 'knit' }[ st ] ?? 'leather' );
	const back = latex ? M( c, { rough: 0.38 } ) : cloth( c, { weave, rough: weave === 'leather' ? 0.7 : undefined, bump: 0.7 } );
	const acc = s.color2 ?? shade( c, - 0.25 );
	const cuffM = latex ? back : cloth( acc, { weave: st === 'work' ? 'rib' : weave === 'leather' ? 'canvas' : weave, rough: 0.85 } );
	const stitch = thread( c );
	const P = handOutline( fingerless ? 0.3 : 1 );
	for ( const [ side, palm ] of [ [ 1, false ], [ - 1, true ] ] ) {
		const one = group();
		const Q = P.map( p => [ p[ 0 ], p[ 1 ] * side ] );
		const T = latex ? 0.01 : 0.015;
		const hand = panel( Q, { T, R: T * 0.9, cell: 0.012, uv: [ 0, 0 ],
			disp: ( x, z ) => 0.004 * Math.exp( - ( ( x / 0.05 ) ** 2 ) - ( ( z / 0.05 ) ** 2 ) ) + ( palm ? 0 : 0.0025 * Math.exp( - ( ( ( x - 0.04 ) / 0.008 ) ** 2 ) ) * smooth( 0.045, 0.03, Math.abs( z ) ) ) } );
		add( one, hand.geo, back );
		const top = hand.top;
		// the cuff (or a rolled rim on a thin glove), its seam
		const cuff = panel( roundRect( 0.036, 0.09, 0.008, - 0.07, 0, 3 ), { T: T + 0.003, R: 0.005, cell: 0.014, uv: [ 0, 0 ] } );
		if ( latex ) add( one, G.capsX( 0.003, 0.084, 6 ).rotateY( PI / 2 ).translate( - 0.084, 0.005, 0 ), back );
		else add( one, cuff.geo, cuffM );
		if ( ! latex ) add( one, seam( line( [ - 0.051, - 0.043 ], [ - 0.051, 0.043 ], 4 ), ( x, z ) => cuff.top( x, z ) || top( x, z ) ), stitch );
		// seams between the fingers, down the back
		if ( ! palm && ! latex ) for ( const zz of [ - 0.02, 0, 0.02 ] ) add( one, seam( line( [ 0.03, zz * side ], [ 0.05, zz * side * 1.1 ], 3 ), top ), stitch );
		if ( st === 'tactical' && ! palm ) {
			// a moulded knuckle guard and a wrist strap
			add( one, conform( panel( roundRect( 0.018, 0.074, 0.008, 0.038, 0, 3 ), { T: 0.006, R: 0.004, cell: 0.03, bottom: false } ).geo, top, 0.0004 ), M( 0x1c1c1c, { rough: 0.5 } ) );
			add( one, conform( panel( roundRect( 0.022, 0.07, 0.006, - 0.045, 0.006 * side, 3 ), { T: 0.003, R: 0.002, cell: 0.03, bottom: false } ).geo, top, 0.0004 ), cuffM );
		}
		if ( ( st === 'work' || st === 'fire' || ! s.style ) && palm ) {
			// a reinforced leather palm and fingertips
			add( one, conform( panel( roundRect( 0.06, 0.07, 0.014, 0.008, 0, 4 ), { T: 0.0025, R: 0.002, cell: 0.03, bottom: false } ).geo, top, 0.0003 ), cloth( shade( c, - 0.12 ), { weave: 'leather', rough: 0.8 } ) );
		}
		if ( ( st === 'work' || st === 'fire' || ! s.style ) && ! palm && s.color2 ) {
			// the cuff's colour shows as a band on the back
			add( one, conform( panel( roundRect( 0.012, 0.086, 0.004, - 0.046, 0, 2 ), { T: 0.0015, R: 0.001, cell: 0.03, bottom: false } ).geo, top, 0.0003 ), M( acc, { rough: 0.8 } ) );
		}
		if ( st === 'dive' && ! palm ) add( one, conform( panel( roundRect( 0.05, 0.012, 0.004, - 0.02, 0.03 * side, 2 ), { T: 0.0015, R: 0.001, cell: 0.03, bottom: false } ).geo, top, 0.0004 ), M( acc, { rough: 0.5 } ) );
		if ( fingerless ) for ( const zz of [ - 0.029, - 0.0098, 0.0098, 0.029 ] ) add( one, G.box( 0.004, 0.0016, 0.016 ), stitch, [ 0.054 - Math.abs( zz ) * 0.15, top( 0.05, zz * side ) * 0.7, zz * side ] );
		one.position.set( 0, 0, side * 0.06 );
		one.rotation.y = side * 0.32;
		g.add( one );
	}
	return ground( g );
}

// ---- belts ------------------------------------------------------------------------------------------------------------
// { color, color2, buckle, holster, pouches, tools }: a plain leather belt rolled up, its buckle outside; a loaded belt
// laid in a loop on its edge, the kit hung on it
function beltModel( s ) {
	const g = group(), c = s.color ?? 0x3a2616;
	const loaded = !! ( s.holster || s.pouches || s.tools );
	const nylon = c === 0x141414 || c === 0x6b6a45;
	const strapM = nylon ? cloth( c, { weave: 'canvas', wrep: 1.4, rough: 0.8 } ) : cloth( c, { weave: 'leather', rough: 0.5 } );
	const metal = M( s.buckle ?? 0xb8b8b8, { rough: 0.25, metal: 0.95 } ), stitch = thread( c );
	if ( ! loaded ) {
		// a coil standing on its edge: the strap wound round, the tip inside, the buckle end outside
		const W = 0.035, pts = [];
		const turns = 2.4, r0 = 0.022, r1 = 0.068;
		for ( let i = 0; i <= 40; i ++ ) { const t = i / 40, a = t * turns * PI * 2, r = lerp( r0, r1, t ); pts.push( [ Math.cos( a ) * r, W / 2, Math.sin( a ) * r ] ); }
		const radial = ( P ) => { const l = Math.hypot( P.x, P.z ) || 1; return [ P.x / l, 0, P.z / l ]; };
		add( g, band( pts, W, 0.0045, { seg: 80, up: radial } ), strapM );
		// edge stitching on the outer turn
		const outer = pts.slice( 24 );
		for ( const y of [ 0.004, W - 0.004 ] ) add( g, band( outer.map( p => { const l = Math.hypot( p[ 0 ], p[ 2 ] ); return [ p[ 0 ] * ( 1 + 0.0026 / l ), y, p[ 2 ] * ( 1 + 0.0026 / l ) ]; } ), 0.0012, 0.0006, { seg: 24, up: radial } ), stitch );
		// the buckle end: straight out from the coil, the frame and prong, a keeper
		const a = turns * PI * 2, ex = Math.cos( a ) * r1, ez = Math.sin( a ) * r1, tx = - Math.sin( a ), tz = Math.cos( a );
		const end = [ ex + tx * 0.045, ez + tz * 0.045 ];
		add( g, band( [ [ ex, W / 2, ez ], [ ( ex + end[ 0 ] ) / 2, W / 2, ( ez + end[ 1 ] ) / 2 ], [ end[ 0 ], W / 2, end[ 1 ] ] ], W, 0.0045, { seg: 2, up: [ - tz, 0, tx ] } ), strapM );
		const bk = new THREE.Group(); bk.position.set( end[ 0 ] + tx * 0.012, W / 2, end[ 1 ] + tz * 0.012 ); bk.rotation.y = - Math.atan2( tz, tx );
		add( bk, band( curveLoop( [ [ - 0.014, - 0.022 ], [ 0.016, - 0.022 ], [ 0.02, 0 ], [ 0.016, 0.022 ], [ - 0.014, 0.022 ], [ - 0.018, 0 ] ], 20 ).map( p => [ p[ 0 ], p[ 1 ], 0 ] ), 0.006, 0.004, { closed: true, seg: 20, up: [ 0, 0, 1 ] } ), metal );
		add( bk, G.box( 0.03, 0.003, 0.003 ), metal, [ 0.002, 0, - 0.004 ] );
		add( bk, G.box( 0.012, W + 0.004, 0.009 ), strapM, [ - 0.026, - W / 2 - 0.002, - 0.001 ] ); // the keeper
		g.add( bk );
		return ground( g );
	}
	// a loop on its edge (an oval), a quick-release or frame buckle at the front (+x)
	const RX = 0.15, RZ = 0.11, W = 0.045;
	const loop = []; for ( let i = 0; i < 28; i ++ ) { const a = i / 28 * PI * 2; loop.push( [ Math.cos( a ) * RX, W / 2, Math.sin( a ) * RZ ] ); }
	const outward = ( P ) => { const l = Math.hypot( P.x / RX, P.z / RZ ) || 1; return [ P.x / RX / l, 0, P.z / RZ / l ]; };
	add( g, band( loop, W, 0.006, { closed: true, seg: 56, up: outward } ), strapM );
	for ( const y of [ 0.005, W - 0.005 ] ) add( g, band( loop.map( p => [ p[ 0 ] * 1.03, y, p[ 2 ] * 1.04 ] ), 0.0014, 0.0006, { closed: true, seg: 40, up: outward } ), stitch );
	const at = ( a, out = 0 ) => { const x = Math.cos( a ) * RX, z = Math.sin( a ) * RZ, n = outward( { x, z } ); return [ x + n[ 0 ] * out, z + n[ 2 ] * out, Math.atan2( n[ 2 ], n[ 0 ] ) ]; };
	const hang = ( a, out, fn ) => { const [ x, z, r ] = at( a, out ); const h = new THREE.Group(); h.position.set( x, 0, z ); h.rotation.y = - r; fn( h ); g.add( h ); };
	// the buckle
	hang( 0, 0.008, ( h ) => {
		add( h, G.rbox( 0.012, W * 0.9, 0.05, 0.004, 1 ), nylon ? MAT.blackPlastic() : metal, [ 0, 0.003, 0 ] );
		if ( nylon ) add( h, G.rbox( 0.008, W * 0.5, 0.03, 0.003, 1 ), M( 0x2a2a2a, { rough: 0.5 } ), [ 0.006, W * 0.25, 0 ] );
	} );
	const kit = M( s.color2 ?? shade( c, - 0.1 ), { rough: 0.8 } ), kitCloth = cloth( s.color2 ?? shade( c, - 0.1 ), { weave: nylon ? 'canvas' : 'leather', rough: 0.75 } );
	// pouches with flaps and snaps
	const pouch = ( h, w, hh, d ) => {
		add( h, softBox( d, hh, w, 0.008, { seg: 2 } ), kitCloth, [ d / 2, 0.006, 0 ] );
		add( h, softBox( d + 0.004, 0.016, w + 0.004, 0.006, { seg: 1 } ), kitCloth, [ d / 2 + 0.001, hh - 0.006, 0 ] );
		add( h, G.cyl( 0.0045, 0.0045, 0.003, 8 ).rotateZ( PI / 2 ), MAT.darkMetal(), [ d + 0.004, hh - 0.004, 0 ] );
	};
	const n = s.pouches || 0;
	for ( let i = 0; i < n; i ++ ) hang( PI * ( 0.62 + i * 0.36 ), 0.006, ( h ) => pouch( h, 0.05, 0.065, 0.032 ) );
	if ( s.holster ) hang( - PI * 0.5, 0.006, ( h ) => {
		// a moulded holster, the pistol's grip out of the top
		const hol = softBox( 0.04, 0.13, 0.09, 0.012, { seg: 2, shape: ( x, y, z ) => [ x, y, z - y * 0.25 + ( y > 0.09 ? ( y - 0.09 ) * 0.4 : 0 ) ] } );
		add( h, hol, MAT.blackPlastic(), [ 0.022, - 0.04, 0 ] );
		add( h, G.rbox( 0.03, 0.06, 0.028, 0.006, 1 ), M( 0x2a2a2c, { rough: 0.6 } ), [ 0.022, 0.07, - 0.028 ], [ 0.3, 0, 0 ] );
		add( h, G.rbox( 0.012, 0.025, 0.06, 0.004, 1 ), M( 0x1a1a1a, { rough: 0.5 } ), [ 0.044, 0.06, - 0.004 ] );
	} );
	if ( s.tools ) {
		// a leather tool pouch: a hammer through the loop, a screwdriver and pliers in the pockets, a tape on the belt
		hang( PI * 0.8, 0.006, ( h ) => {
			add( h, softBox( 0.04, 0.09, 0.1, 0.01, { seg: 2, shape: ( x, y, z ) => [ x * ( 1 + ( 0.09 - y ) * 3 ), y, z ] } ), kitCloth, [ 0.024, - 0.03, 0 ] );
			add( h, G.cyl( 0.005, 0.005, 0.13, 8 ), M( 0xe0a020, { rough: 0.5 } ), [ 0.03, 0.0, 0.03 ], [ 0.1, 0, 0.15 ] );
			add( h, G.rbox( 0.012, 0.012, 0.06, 0.003, 1 ), MAT.metal(), [ 0.04, 0.13, 0.03 ] );
			add( h, G.cyl( 0.007, 0.006, 0.08, 8 ), M( 0xc02a2a, { rough: 0.5 } ), [ 0.02, 0.02, - 0.03 ], [ - 0.15, 0, 0.1 ] );
		} );
		hang( PI * 1.2, 0.006, ( h ) => {
			add( h, G.cyl( 0.026, 0.026, 0.03, 16 ).rotateZ( PI / 2 ), M( 0xe8c020, { rough: 0.4 } ), [ 0.018, 0.026, 0 ] );
			add( h, G.box( 0.004, 0.012, 0.024 ), MAT.metal(), [ 0.034, 0.012, 0.018 ] );
		} );
	}
	// keepers round the strap
	for ( const a of [ PI * 0.25, - PI * 0.2, PI * 1.45 ] ) hang( a, 0.002, ( h ) => add( h, G.rbox( 0.008, W + 0.006, 0.022, 0.002, 1 ), kit, [ 0.001, - 0.003, 0 ] ) );
	return ground( g );
}

// ---- hats and helmets ------------------------------------------------------------------------------------------------
// { style: cap|police_cap|bucket|boonie|straw|paniolo|beanie|visor|hardhat|helmet_moto|helmet_mil|helmet_riot|
//   helmet_fire, color, color2, print, logo, stripe, visor }. The front faces +x.

// a point on an ellipsoid dome ( rx, ry, rz ) at azimuth a (0 = front, +x) and polar angle th (0 = top), pushed out
const domeAt = ( rx, ry, rz, a, th, out = 0, y0 = 0 ) => [ ( rx + out ) * Math.sin( th ) * Math.cos( a ), y0 + ( ry + out ) * Math.cos( th ), ( rz + out ) * Math.sin( th ) * Math.sin( a ) ];
// a dome surface over an azimuth range (a0 .. a1, 0 = front) down to the polar angle th1
const domeGeo = ( rx, ry, rz, a0, a1, th1 = PI / 2, nu = 24, nv = 8, y0 = 0 ) => {
	const geo = grid( nu, nv, ( u, v ) => domeAt( rx, ry, rz, lerp( a0, a1, u ), v * th1, 0, y0 ), { uvScale: [ ( a1 - a0 ) * rx / UVS, th1 * ry / UVS ] } );
	// (grid winds them inward for this parametrisation: flip)
	const ix = geo.index.array; for ( let i = 0; i < ix.length; i += 3 ) { const t = ix[ i + 1 ]; ix[ i + 1 ] = ix[ i + 2 ]; ix[ i + 2 ] = t; }
	geo.computeVertexNormals();
	return geo;
};
const UVS = 0.3;
// a seam running down a dome's meridian
const meridian = ( rx, ry, rz, a, th0, th1, y0 = 0, w = 0.0016 ) => { const P = []; for ( let i = 0; i <= 6; i ++ ) P.push( domeAt( rx, ry, rz, a, lerp( th0, th1, i / 6 ), 0.0008, y0 ) ); return band( P, w, 0.0008, { seg: 6, up: ( p ) => { const l = Math.hypot( p.x, p.y - y0, p.z ) || 1; return [ p.x / l, ( p.y - y0 ) / l, p.z / l ]; } } ); };
// a ring round a lathe (brims' stitching, bands): radius r at height y
const ringGeo = ( r, y, w, t = 0.001, n = 28, kx = 1 ) => { const P = []; for ( let i = 0; i < n; i ++ ) { const a = i / n * PI * 2; P.push( [ Math.cos( a ) * r * kx, y, Math.sin( a ) * r ] ); } return band( P, w, t, { closed: true, seg: n } ); };

function hatModel( s ) {
	const g = group(), style = s.style || 'cap', c = s.color ?? 0x3a5a8a;
	const soft = ! /helmet|hardhat/.test( style );
	const mat = soft ? cloth( c, { print: s.print, color2: s.color2 ?? 0xffffff, color3: s.color3, rep: 1.6, weave: weaveOf( s, 'twill' ) } ) : s.print ? cloth( c, { print: s.print, color2: s.color2 ?? 0xffffff, rep: 1.6, weave: 'ripstop' } ) : M( c, { rough: 0.32, metal: s.metal ?? 0 } );
	const acc = M( s.color2 ?? shade( c, - 0.3 ), { rough: 0.6 } ), stitch = thread( c );
	const dark = M( 0x1a1a1a, { rough: 0.7 } ), metal = M( 0xb8bcc2, { rough: 0.3, metal: 0.9 } );
	switch ( style ) {
		case 'cap': case 'police_cap': {
			if ( style === 'police_cap' ) {
				// a patrol cap: a flat round top wider than its band, a glossy peak, a cord and a badge
				add( g, G.cyl( 0.084, 0.088, 0.05, 28 ), mat, [ 0, 0.004, 0 ] );
				add( g, new THREE.CylinderGeometry( 0.12, 0.086, 0.035, 28 ).translate( 0, 0.072, 0 ).scale( 1.06, 1, 1 ), mat );
				add( g, G.cyl( 0.12, 0.12, 0.006, 28 ).scale( 1.06, 1, 1 ), mat, [ 0, 0.086, 0 ] );
				add( g, ringGeo( 0.089, 0.032, 0.02, 0.002 ), M( s.color2 ?? 0x10182a, { rough: 0.7 } ) );
				const peak = panel( curveLoop( [ [ 0.07, - 0.07 ], [ 0.13, - 0.05 ], [ 0.15, 0 ], [ 0.13, 0.05 ], [ 0.07, 0.07 ], [ 0.085, 0 ] ], 30 ), { T: 0.004, R: 0.002, cell: 0.03 } );
				const pp = peak.geo.attributes.position; for ( let i = 0; i < pp.count; i ++ ) pp.setY( i, pp.getY( i ) + 0.012 - ( pp.getX( i ) - 0.08 ) * 0.25 ); peak.geo.computeVertexNormals();
				add( g, peak.geo, M( 0x0c0c0e, { rough: 0.15 } ) );
				add( g, ringGeo( 0.09, 0.024, 0.004, 0.003, 28 ), MAT.gold() );
				add( g, panel( curveLoop( [ [ 0, - 0.012 ], [ 0.012, 0 ], [ 0, 0.014 ], [ - 0.012, 0 ] ], 16 ), { T: 0.003, R: 0.0015, cell: 0.03, bottom: false } ).geo.rotateZ( PI / 2 ).translate( 0.089, 0.06, 0 ), MAT.gold() );
				break;
			}
			// six panels sewn into a crown, a button on top, eyelets; a curved bill with rows of stitching
			const rx = 0.098, ry = 0.078, rz = 0.093, y0 = 0.004;
			const trucker = s.color2 !== undefined && lum( s.color2 ) > 0.8;
			if ( trucker ) {
				add( g, domeGeo( rx, ry, rz, - PI / 3, PI / 3, PI / 2, 10, 8, y0 ), mat );
				add( g, domeGeo( rx, ry, rz, PI / 3, PI * 5 / 3, PI / 2, 18, 8, y0 ), cloth( s.color2, { weave: 'ripstop', wrep: 3, rough: 0.9 } ) );
			} else add( g, domeGeo( rx, ry, rz, 0, PI * 2, PI / 2, 26, 8, y0 ), mat );
			for ( let i = 0; i < 6; i ++ ) add( g, meridian( rx, ry, rz, i / 6 * PI * 2 + PI / 6, 0.05, PI / 2 - 0.02, y0 ), stitch );
			add( g, G.dome( 0.009, 8, 3 ).scale( 1, 0.6, 1 ), mat, [ 0, y0 + ry - 0.001, 0 ] );
			for ( let i = 0; i < 6; i ++ ) { const p = domeAt( rx, ry, rz, i / 6 * PI * 2, 0.62, 0.0005, y0 ); add( g, G.cyl( 0.0028, 0.0028, 0.0015, 6 ).rotateZ( - 0.62 ).rotateY( - i / 6 * PI * 2 ), stitch, p ); }
			// the bill: a flat outline bent across, tipped down a little
			const B = curveLoop( [ [ 0.06, - 0.085 ], [ 0.12, - 0.07 ], [ 0.172, - 0.035 ], [ 0.182, 0 ], [ 0.172, 0.035 ], [ 0.12, 0.07 ], [ 0.06, 0.085 ], [ 0.085, 0 ] ], 40 );
			const bill = panel( B, { T: 0.005, R: 0.0025, cell: 0.03 } );
			const bend = ( x, z ) => 0.012 - ( z / 0.09 ) ** 2 * 0.016 - Math.max( 0, x - 0.09 ) * 0.12;
			const bp = bill.geo.attributes.position; for ( let i = 0; i < bp.count; i ++ ) bp.setY( i, bp.getY( i ) + bend( bp.getX( i ), bp.getZ( i ) ) ); bill.geo.computeVertexNormals();
			add( g, bill.geo, s.color2 !== undefined && ! trucker ? cloth( s.color2, { weave: 'twill' } ) : mat );
			const btop = ( x, z ) => bill.top( x, z ) + bend( x, z );
			for ( const k of [ 0.88, 0.76, 0.64 ] ) { const P = []; for ( let i = 0; i <= 10; i ++ ) { const t = - 1.25 + i / 10 * 2.5; P.push( [ 0.085 + Math.cos( t ) * 0.094 * k, Math.sin( t ) * 0.082 * k ] ); } add( g, seam( P, btop ), stitch ); }
			add( g, ringGeo( 0.094, 0.006, 0.008, 0.002, 28, 1.05 ), dark ); // the sweatband's edge
			if ( s.logo ) add( g, G.rbox( 0.004, 0.024, 0.042, 0.002, 1 ), M( s.logo, { rough: 0.7 } ), [ 0.093, 0.04, 0 ], [ 0, 0, - 0.55 ] );
			// the strap at the back
			add( g, G.box( 0.004, 0.014, 0.05 ), MAT.blackPlastic(), [ - 0.096, 0.012, 0 ], [ 0, 0, 0.15 ] );
			break;
		}
		case 'bucket': case 'boonie': {
			const boonie = style === 'boonie';
			// the crown, a domed top, a sloping brim stitched round in rows
			add( g, G.lathe( [ [ 0.0, 0.088 ], [ 0.05, 0.087 ], [ 0.072, 0.082 ], [ 0.078, 0.07 ], [ 0.086, 0.035 ], [ 0.09, 0.02 ] ].map( p => [ p[ 0 ], p[ 1 ] ] ).reverse(), 26 ), mat );
			const bw = boonie ? 0.16 : 0.14;
			add( g, G.lathe( [ [ bw, 0.0 ], [ bw - 0.002, 0.004 ], [ 0.09, 0.024 ], [ 0.088, 0.02 ], [ bw - 0.004, - 0.001 ] ], 30 ), mat );
			for ( let i = 1; i <= 4; i ++ ) { const r = lerp( 0.095, bw - 0.005, i / 4.5 ); add( g, ringGeo( r, 0.024 - ( r - 0.09 ) / ( bw - 0.09 ) * 0.022 + 0.0012, 0.0014, 0.0008, 30 ), stitch ); }
			add( g, ringGeo( 0.0875, 0.032, 0.014, 0.002, 28 ), boonie ? cloth( s.color2 ?? shade( c, - 0.2 ), { weave: 'canvas' } ) : acc );
			for ( const k of [ - 1, 1 ] ) add( g, G.torus( 0.003, 0.0012, 4, 8 ).rotateX( PI / 2 ).rotateZ( PI / 2 ), metal, [ 0, 0.06, k * 0.08 ] );
			if ( boonie ) {
				// foliage loops round the band, snaps holding the brim's sides up, a chin cord
				for ( let i = 0; i < 10; i ++ ) { const a = i / 10 * PI * 2; add( g, G.box( 0.006, 0.016, 0.003 ), dark, [ Math.cos( a ) * 0.091, 0.033, Math.sin( a ) * 0.091 ], [ 0, - a, 0 ] ); }
				add( g, G.tube( [ [ 0.0, 0.022, 0.086 ], [ 0.06, 0.004, 0.11 ], [ 0.11, 0.002, 0.03 ], [ 0.1, 0.004, - 0.05 ], [ 0.0, 0.022, - 0.086 ] ], 0.0016, 18, 4 ), dark );
			}
			break;
		}
		case 'straw': case 'paniolo': {
			const straw = cloth( c, { weave: 'straw', wrep: 0.8, rough: 0.85, bump: 1 } );
			const pan = style === 'paniolo';
			// the brim, flat (lauhala) or rolled up at the sides (paniolo); the crown, creased down the middle for a paniolo
			const brim = grid( 36, 3, ( u, v ) => { const a = u * PI * 2, r = lerp( 0.084, 0.17, v ), roll = pan ? Math.abs( Math.sin( a ) ) ** 2 * ( ( r - 0.1 ) / 0.07 ) ** 2 * 0.045 : - ( ( ( r - 0.09 ) / 0.08 ) ** 2 ) * 0.012; return [ Math.cos( a ) * r * ( pan ? 1.06 : 1 ), 0.012 + roll, Math.sin( a ) * r ]; }, { closeU: true, uvScale: [ 3.5, 0.3 ] } );
			const top2 = brim.clone(); top2.translate( 0, 0.0035, 0 );
			const ix = top2.index.array; for ( let i = 0; i < ix.length; i += 3 ) { const t = ix[ i + 1 ]; ix[ i + 1 ] = ix[ i + 2 ]; ix[ i + 2 ] = t; }
			top2.computeVertexNormals();
			add( g, brim, straw ); add( g, top2, straw );
			add( g, ringGeo( 0.17, 0.012 + ( pan ? 0.045 : - 0.012 ) * 0, 0.005, 0.004, 36, pan ? 1.06 : 1 ), straw );
			const crown = grid( 26, 5, ( u, v ) => {
				const a = u * PI * 2, h = pan ? 0.1 : 0.088, y = 0.012 + v * h, r = lerp( 0.086, pan ? 0.07 : 0.074, v ) * ( v > 0.85 ? Math.sqrt( Math.max( 0, 1 - ( ( v - 0.85 ) / 0.15 ) ** 2 ) ) * 0.4 + 0.6 : 1 );
				const crease = pan ? 0.02 * smooth( 0.55, 1, v ) * Math.exp( - ( ( Math.sin( a ) / 0.35 ) ** 2 ) ) : 0;
				return [ Math.cos( a ) * r * 1.08, y - crease, Math.sin( a ) * r ];
			}, { closeU: true, uvScale: [ 2.2, 0.4 ] } );
			{ const ix2 = crown.index.array; for ( let i = 0; i < ix2.length; i += 3 ) { const t = ix2[ i + 1 ]; ix2[ i + 1 ] = ix2[ i + 2 ]; ix2[ i + 2 ] = t; } crown.computeVertexNormals(); }
			add( g, crown, straw );
			add( g, G.cyl( 0.03, 0.03, 0.004, 12 ).scale( 1.08, 1, 1 ), straw, [ 0, 0.012 + ( pan ? 0.1 - 0.02 : 0.088 ) - 0.003, 0 ] );
			add( g, ringGeo( 0.087, 0.026, 0.02, 0.003, 30, 1.08 ), M( s.color2 ?? 0x2a1a10, { rough: 0.7 } ) ); // the hat band
			if ( pan ) for ( let i = 0; i < 22; i ++ ) { const a = i / 22 * PI * 2; add( g, G.sph( 0.008, 6, 4 ), M( i % 3 ? 0xe8403a : 0xf2c230, { rough: 0.7 } ), [ Math.cos( a ) * 0.094 * 1.08, 0.028 + ( i % 2 ) * 0.004, Math.sin( a ) * 0.094 ] ); }
			break;
		}
		case 'beanie': {
			// a ribbed knit dome over a folded-up cuff, a pom-pom if it has one
			const knit = cloth( c, { print: s.print, color2: s.color2, weave: 'rib', wrep: 1.4, rough: 0.95 } );
			add( g, domeGeo( 0.088, 0.1, 0.088, 0, PI * 2, PI / 2, 24, 8, 0.04 ), knit );
			add( g, G.cyl( 0.092, 0.094, 0.04, 26, true ), knit );
			add( g, ringGeo( 0.093, 0.04, 0.004, 0.004, 26 ), knit );
			if ( s.pom ) add( g, G.sph( 0.03, 10, 8 ), cloth( s.color2 ?? c, { weave: 'fleece', rough: 1 } ), [ 0, 0.142, 0 ] );
			break;
		}
		case 'visor': {
			// a headband open at the back, a curved peak over the forehead, a velcro tab
			const bandP = []; for ( let i = 0; i <= 20; i ++ ) { const a = - PI * 0.68 + i / 20 * PI * 1.36; bandP.push( [ Math.cos( a ) * 0.088, 0.018, Math.sin( a ) * 0.082 ] ); }
			add( g, band( bandP, 0.036, 0.004, { seg: 30, round: true, up: ( p ) => { const l = Math.hypot( p.x, p.z ) || 1; return [ p.x / l, 0, p.z / l ]; } } ), mat );
			add( g, band( bandP.map( p => [ p[ 0 ] * 0.97, 0.012, p[ 2 ] * 0.97 ] ), 0.022, 0.003, { seg: 30, up: ( p ) => { const l = Math.hypot( p.x, p.z ) || 1; return [ p.x / l, 0, p.z / l ]; } } ), M( 0xf2f2ee, { rough: 0.95 } ) );
			const B = curveLoop( [ [ 0.04, - 0.08 ], [ 0.12, - 0.075 ], [ 0.17, - 0.035 ], [ 0.18, 0 ], [ 0.17, 0.035 ], [ 0.12, 0.075 ], [ 0.04, 0.08 ], [ 0.085, 0 ] ], 40 );
			const bill = panel( B, { T: 0.004, R: 0.002, cell: 0.03 } );
			const bp = bill.geo.attributes.position; for ( let i = 0; i < bp.count; i ++ ) bp.setY( i, bp.getY( i ) + 0.006 - ( bp.getZ( i ) / 0.09 ) ** 2 * 0.014 - Math.max( 0, bp.getX( i ) - 0.09 ) * 0.1 ); bill.geo.computeVertexNormals();
			add( g, bill.geo, acc );
			for ( const k of [ - 1, 1 ] ) add( g, G.box( 0.022, 0.02, 0.004 ), acc, [ - 0.06, 0.018, k * 0.064 ], [ 0, k * 0.6, 0 ] );
			break;
		}
		case 'hardhat': {
			// a shell with three ribs over the top, a peak at the front, slots for ear muffs, a ratchet harness inside
			const sh = 0.11;
			add( g, domeGeo( sh * 1.12, sh * 0.95, sh * 0.96, 0, PI * 2, PI / 2, 26, 9, 0.016 ), mat );
			for ( const z of [ - 0.025, 0, 0.025 ] ) add( g, band( Array.from( { length: 9 }, ( _, i ) => { const a = - 1.2 + i / 8 * 2.4; const p = domeAt( sh * 1.12, sh * 0.95, sh * 0.96, a > 0 ? 0 : PI, Math.abs( a ), 0.001, 0.016 ); return [ p[ 0 ], p[ 1 ], z ]; } ), 0.01, 0.006, { round: true, seg: 16, up: ( p ) => { const l = Math.hypot( p.x, p.y - 0.016 ) || 1; return [ p.x / l, ( p.y - 0.016 ) / l, 0 ]; } } ), mat );
			add( g, G.lathe( [ [ sh * 1.0, 0.02 ], [ sh * 1.16, 0.006 ], [ sh * 1.18, 0.0 ], [ sh * 1.0, 0.012 ] ], 28 ).scale( 1.08, 1, 1 ), mat );
			add( g, panel( curveLoop( [ [ 0.1, - 0.07 ], [ 0.16, - 0.05 ], [ 0.17, 0 ], [ 0.16, 0.05 ], [ 0.1, 0.07 ] ], 24 ), { T: 0.005, R: 0.003, cell: 0.03 } ).geo.translate( 0, 0.012, 0 ), mat );
			for ( const k of [ - 1, 1 ] ) add( g, G.box( 0.03, 0.012, 0.006 ), dark, [ 0.0, 0.03, k * sh * 0.97 ] );
			add( g, ringGeo( 0.1, 0.03, 0.02, 0.003, 24, 1.08 ), dark );
			break;
		}
		case 'helmet_moto': {
			// a full-face shell: the eye port with its tinted visor, the chin bar's vents, a stripe, the rubber neck roll
			const R = 0.14;
			add( g, G.sph( R, 26, 18 ).scale( 1.05, 0.95, 0.95 ).translate( 0, 0.12, 0 ), mat );
			const visor = G.sph( R * 1.012, 18, 8, - PI * 0.36, PI * 0.72, PI * 0.36, PI * 0.25 ); visor.rotateY( PI / 2 );
			add( g, visor, M( s.visor ?? 0x1a1a22, { rough: 0.04, metal: 0.65 } ), [ 0, 0.12, 0 ], null, [ 1.05, 0.95, 0.95 ] );
			const vt = G.sph( R * 1.02, 18, 2, - PI * 0.38, PI * 0.76, PI * 0.34, PI * 0.03 ); vt.rotateY( PI / 2 );
			add( g, vt, dark, [ 0, 0.12, 0 ], null, [ 1.05, 0.95, 0.95 ] );
			for ( const k of [ - 1, 1 ] ) add( g, G.cyl( 0.016, 0.016, 0.006, 12 ).rotateX( PI / 2 ), dark, [ 0.03, 0.135, k * R * 0.95 ] );
			for ( let i = 0; i < 3; i ++ ) add( g, G.box( 0.004, 0.005, 0.022 ), dark, [ R * 1.03 + 0.004 - i * 0.004, 0.06 - i * 0.012, 0 ], [ 0, 0, 0.5 ] );
			add( g, G.cyl( 0.12, 0.13, 0.03, 22, true ), MAT.rubber(), [ 0, 0.005, 0 ] );
			if ( s.stripe ) add( g, G.torus( R * 1.005, 0.007, 4, 30, PI ).scale( 1.05, 0.95, 1 ), M( s.stripe, { rough: 0.35 } ), [ 0, 0.12, 0 ], [ 0, 0, PI / 2 ] );
			break;
		}
		case 'helmet_mil': {
			// a cut shell under a printed cover: the NVG shroud, side rails, velcro patches, the chin strap's buckle
			const R = 0.13;
			const shell = G.sph( R, 24, 10, 0, PI * 2, 0, PI * 0.55 ); shell.scale( 1.08, 0.95, 1 );
			add( g, shell, mat, [ 0, 0.01, 0 ] );
			add( g, ringGeo( R * 0.99, 0.01 + R * 0.95 * Math.cos( PI * 0.55 ) + 0.002, 0.008, 0.005, 28, 1.08 ), dark ); // the edge trim
			add( g, G.rbox( 0.028, 0.042, 0.05, 0.006, 1 ), MAT.darkMetal(), [ R * 1.06, 0.06, 0 ], [ 0, 0, - 0.5 ] );
			for ( const k of [ - 1, 1 ] ) add( g, G.rbox( 0.11, 0.014, 0.006, 0.002, 1 ), MAT.blackPlastic(), [ - 0.01, 0.055, k * R * 0.99 ] );
			add( g, G.rbox( 0.06, 0.004, 0.05, 0.004, 1 ), cloth( s.color2 ?? 0x6b6a45, { weave: 'fleece' } ), [ 0, 0.01 + R * 0.95 - 0.003, 0 ] );
			add( g, G.rbox( 0.004, 0.035, 0.05, 0.004, 1 ), cloth( s.color2 ?? 0x6b6a45, { weave: 'fleece' } ), [ - R * 1.04, 0.07, 0 ], [ 0, 0, 0.5 ] );
			add( g, G.tube( [ [ - 0.02, 0.03, - R * 0.98 ], [ 0.05, - 0.0, - 0.07 ], [ 0.07, 0.0, 0 ], [ 0.05, 0.0, 0.07 ], [ - 0.02, 0.03, R * 0.98 ] ], 0.004, 20, 4 ).scale( 1, 1, 1 ), dark );
			add( g, G.box( 0.018, 0.006, 0.026 ), MAT.blackPlastic(), [ 0.07, 0.003, 0 ] );
			break;
		}
		case 'helmet_riot': {
			// a shell, a full clear face shield on its pivots, a padded neck curtain at the back
			add( g, G.sph( 0.14, 24, 12, 0, PI * 2, 0, PI * 0.6 ).scale( 1.05, 1, 1 ), mat, [ 0, 0.02, 0 ] );
			const shield = G.sph( 0.162, 18, 8, - PI * 0.42, PI * 0.84, PI * 0.28, PI * 0.46 ); shield.rotateY( PI / 2 );
			add( g, shield, MAT.glass( 0xd8e8f0, 0.32 ), [ 0.01, 0.02, 0 ] );
			add( g, G.torus( 0.157, 0.006, 4, 20, PI * 0.84 ).rotateX( PI / 2 ).rotateY( - PI * 0.42 ), MAT.blackPlastic(), [ 0.01, 0.02 + 0.162 * Math.cos( PI * 0.28 ) * 0.98, 0 ] );
			for ( const k of [ - 1, 1 ] ) add( g, G.cyl( 0.016, 0.016, 0.01, 12 ).rotateX( PI / 2 ), MAT.darkMetal(), [ 0.0, 0.1, k * 0.146 ] );
			add( g, softBox( 0.03, 0.06, 0.18, 0.012, { seg: 2 } ), cloth( 0x1a1a1a, { weave: 'nylon' } ), [ - 0.12, 0.0, 0 ] );
			break;
		}
		case 'helmet_fire': {
			// a tall dome with combs along its crest, the long tail brim, a leather front shield
			add( g, domeGeo( 0.12, 0.13, 0.112, 0, PI * 2, PI / 2, 24, 9, 0.02 ), mat );
			for ( const z of [ - 0.03, 0, 0.03 ] ) add( g, band( Array.from( { length: 9 }, ( _, i ) => { const a = - 1.2 + i / 8 * 2.4; const p = domeAt( 0.12, 0.13, 0.112, a > 0 ? 0 : PI, Math.abs( a ), 0.001, 0.02 ); return [ p[ 0 ], p[ 1 ], z ]; } ), 0.008, 0.008, { round: true, seg: 16, up: ( p ) => { const l = Math.hypot( p.x, p.y - 0.02 ) || 1; return [ p.x / l, ( p.y - 0.02 ) / l, 0 ]; } } ), mat );
			const brim = grid( 36, 2, ( u, v ) => { const a = u * PI * 2, back = Math.max( 0, - Math.cos( a ) ), r = lerp( 0.11, 0.16 + back * back * 0.08, v ); return [ Math.cos( a ) * r - back * 0.02 * v, 0.02 - v * ( 0.006 + back * 0.03 ), Math.sin( a ) * r * 0.95 ]; }, { closeU: true } );
			const b2 = brim.clone().translate( 0, 0.005, 0 ); const ix = b2.index.array; for ( let i = 0; i < ix.length; i += 3 ) { const t = ix[ i + 1 ]; ix[ i + 1 ] = ix[ i + 2 ]; ix[ i + 2 ] = t; } b2.computeVertexNormals();
			add( g, brim, mat ); add( g, b2, mat );
			add( g, panel( curveLoop( [ [ - 0.04, - 0.035 ], [ 0.04, - 0.038 ], [ 0.05, 0 ], [ 0.04, 0.038 ], [ - 0.04, 0.035 ] ], 20 ), { T: 0.006, R: 0.003, cell: 0.03 } ).geo.rotateZ( PI / 2 - 0.35 ).translate( 0.115, 0.1, 0 ), M( s.color2 ?? 0x1a1a1a, { rough: 0.5 } ) );
			add( g, G.cyl( 0.014, 0.014, 0.003, 12 ).rotateZ( PI / 2 - 0.35 ), MAT.gold(), [ 0.122, 0.1, 0 ] );
			add( g, ringGeo( 0.112, 0.05, 0.016, 0.003, 26, 1.07 ), M( 0xd8e84a, { rough: 0.35, metal: 0.2, emissive: 0xd8e84a, emissiveIntensity: 0.1 } ) );
			break;
		}
		default: add( g, G.dome( 0.09, 14, 7 ), mat );
	}
	return ground( g );
}

// ---- masks ------------------------------------------------------------------------------------------------------------
// { style: bandana|surgical|n95|balaclava|gas|respirator, color, color2, print }
function maskModel( s ) {
	const g = group(), c = s.color ?? 0xb02a2a, white = M( 0xf2f2ee, { rough: 0.85 } );
	switch ( s.style ) {
		case 'bandana': {
			// a square folded in four, one corner turned back over it
			const cl = cloth( c, { print: s.print ?? 'paisley', color2: s.color2 ?? 0xffffff, rep: 2.2, weave: 'plain' } );
			const sq = panel( roundRect( 0.2, 0.2, 0.006 ), { T: 0.007, R: 0.006, cell: 0.03, disp: ( x, z ) => 0.0015 * Math.sin( x * 40 + z * 25 ) } );
			add( g, sq.geo, cl );
			const flap = panel( [ [ 0.1, 0.1 ], [ - 0.02, 0.1 ], [ 0.1, - 0.02 ] ].map( p => [ p[ 0 ] - 0.004, p[ 1 ] - 0.004 ] ), { T: 0.003, R: 0.002, cell: 0.03, bottom: false, uv: [ 0.02, 0.03 ] } );
			add( g, conform( flap.geo, sq.top, 0.0004 ), cl );
			add( g, seam( [ [ - 0.016, 0.093 ], [ 0.093, - 0.016 ] ], sq.top, 0.0025, 0.0045 ), M( shade( c, - 0.35 ) ) ); // the fold's crease
			break;
		}
		case 'surgical': case 'n95': {
			if ( s.style === 'n95' ) {
				// a moulded cup on its rim, a nose clip, two head straps looped beside it
				const cup = G.sph( 0.065, 20, 10, 0, PI * 2, 0, PI / 2 ); cup.scale( 1.1, 0.75, 0.95 );
				add( g, cup, cloth( c, { weave: 'fleece', rough: 1 } ) );
				add( g, ringGeo( 0.066, 0.002, 0.008, 0.003, 28, 1.1 ), cloth( shade( c, - 0.05 ), { weave: 'fleece' } ) );
				add( g, band( Array.from( { length: 7 }, ( _, i ) => { const a = - 0.55 + i / 6 * 1.1; return domeAt( 0.0715, 0.049, 0.062, a, 1.05, 0.001 ); } ), 0.006, 0.0012, { seg: 10 } ), MAT.metal() );
				for ( const k of [ - 1, 1 ] ) add( g, G.torus( 0.07, 0.0016, 3, 28, PI * 1.2 ).rotateX( PI / 2 ), M( s.color2 ?? 0xe8e4d8, { rough: 0.8 } ), [ - 0.02, 0.003 + k * 0.001, 0 ], null, [ 1.2, 1, 0.8 + k * 0.08 ] );
				break;
			}
			// three pleats across, a bound edge each end, a nose wire, ear loops
			const blue = cloth( c, { weave: 'fleece', rough: 1 } );
			const m = panel( roundRect( 0.175, 0.095, 0.004 ), { T: 0.006, R: 0.004, cell: 0.012, disp: ( x, z ) => 0.0025 * Math.max( 0, Math.sin( ( z + 0.05 ) / 0.024 * PI * 2 ) ) * smooth( 0.09, 0.075, Math.abs( x ) ) } );
			add( g, m.geo, blue );
			for ( const k of [ - 1, 1 ] ) add( g, conform( panel( roundRect( 0.008, 0.095, 0.002, k * 0.0835, 0, 2 ), { T: 0.002, R: 0.001, cell: 0.05, bottom: false } ).geo, m.top, 0.0003 ), white );
			add( g, seam( line( [ - 0.082, - 0.043 ], [ 0.082, - 0.043 ], 6 ), m.top, 0.006, 0.001 ), white );
			for ( const k of [ - 1, 1 ] ) add( g, G.torus( 0.035, 0.0013, 3, 22 ).rotateX( PI / 2 ).scale( 0.75, 1, 1.15 ), white, [ k * 0.112, 0.002, 0 ] );
			break;
		}
		case 'gas': case 'respirator': {
			// (these masks are drawn by the senses domain's own builders; kept for older specs)
			const rubber = M( c ?? 0x2a2a2a, { rough: 0.8 } );
			add( g, G.sph( 0.09, 18, 10, 0, PI * 2, 0, PI / 2 ).scale( 1.1, 0.6, 0.9 ), rubber );
			for ( const z of [ - 0.05, 0.05 ] ) add( g, G.cyl( 0.028, 0.028, 0.02, 14 ).rotateX( PI / 2 ), M( 0xd06a2a ), [ - 0.02, 0.03, z ] );
			break;
		}
		default: { // balaclava: folded knit, the face opening's ribbed edge showing
			const knit = cloth( c ?? 0x1a1a1a, { weave: 'knit', wrep: 1.2, rough: 0.95 } );
			const b = panel( roundRect( 0.22, 0.17, 0.03 ), { T: 0.02, R: 0.018, cell: 0.02, disp: ( x, z ) => - 0.008 * smooth( 0.03, 0.018, Math.hypot( ( x - 0.03 ) / 1.8, z ) ) } );
			add( g, b.geo, knit );
			add( g, band( Array.from( { length: 16 }, ( _, i ) => { const a = i / 16 * PI * 2, x = 0.03 + Math.cos( a ) * 0.055, z = Math.sin( a ) * 0.028; return [ x, b.top( x, z ) + 0.002, z ]; } ), 0.008, 0.004, { closed: true, round: true, seg: 24 } ), cloth( shade( c ?? 0x1a1a1a, 0.08 ), { weave: 'rib' } ) );
			add( g, seam( line( [ - 0.1, - 0.07 ], [ - 0.1, 0.07 ], 4 ), b.top ), thread( c ?? 0x1a1a1a ) );
		}
	}
	return ground( g );
}

// ---- eyewear -----------------------------------------------------------------------------------------------------------
// { style: sun|aviator|sport|safety|ski|swim|dive, color (frame), lens, strap }. Open, facing +z, resting on the
// frame's bottom and the temples' tips.
function glassesModel( s ) {
	const g = group(), style = s.style || 'sun';
	const frame = M( s.color ?? 0x1a1a1a, { rough: style === 'aviator' ? 0.25 : 0.3, metal: style === 'aviator' ? 0.9 : 0.05 } );
	const lensC = s.lens ?? 0x1a1a22;
	const clear = style === 'safety' || style === 'swim' || style === 'dive';
	const lens = clear ? M( lensC, { rough: 0.04, metal: 0.1, transparent: true, opacity: 0.38, side: THREE.DoubleSide } ) : M( lensC, { rough: 0.05, metal: 0.75, side: THREE.DoubleSide } );
	const metal = M( 0xc8ccd2, { rough: 0.25, metal: 0.95 } );
	const shapeOf = ( P ) => new THREE.Shape( P.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ) );
	// temples from the hinges straight back, then down over the ears to the table
	const temples = ( hx, hy, w = 0.0035, h = 0.0045, m = frame, tips = null ) => {
		for ( const k of [ - 1, 1 ] ) {
			const P = [ [ k * hx, hy, - 0.004 ], [ k * ( hx + 0.003 ), hy + 0.002, - 0.05 ], [ k * ( hx + 0.002 ), hy + 0.001, - 0.1 ], [ k * ( hx - 0.002 ), hy * 0.45, - 0.128 ], [ k * ( hx - 0.004 ), 0.004, - 0.136 ] ];
			add( g, band( P, h, w, { seg: 14, round: true, up: [ k, 0, 0 ] } ), m );
			if ( tips ) add( g, band( P.slice( 2 ), h * 1.15, w * 1.3, { seg: 8, round: true, up: [ k, 0, 0 ] } ), tips );
			add( g, G.box( 0.006, 0.008, 0.006 ), metal, [ k * ( hx - 0.001 ), hy, - 0.002 ] ); // the hinge
		}
	};
	switch ( style ) {
		case 'ski': {
			// a curved foam frame round a mirrored lens, the wide strap looped back behind it
			const W = 0.19, Hh = 0.085, R = 0.16;
			const curved = ( geo, r ) => { const p = geo.attributes.position; for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), a = x / r; p.setX( i, Math.sin( a ) * ( r + p.getZ( i ) ) ); p.setZ( i, Math.cos( a ) * ( r + p.getZ( i ) ) - r ); } geo.computeVertexNormals(); return geo; };
			const outer = curveLoop( [ [ - W / 2, Hh * 0.1 ], [ - W * 0.45, Hh * 0.9 ], [ 0, Hh ], [ W * 0.45, Hh * 0.9 ], [ W / 2, Hh * 0.1 ], [ W * 0.15, 0.004 ], [ 0, 0.016 ], [ - W * 0.15, 0.004 ] ], 40 );
			const hole = curveLoop( [ [ - W * 0.42, Hh * 0.2 ], [ - W * 0.4, Hh * 0.8 ], [ 0, Hh * 0.88 ], [ W * 0.4, Hh * 0.8 ], [ W * 0.42, Hh * 0.2 ], [ W * 0.12, 0.014 ], [ 0, 0.024 ], [ - W * 0.12, 0.014 ] ], 40 );
			const sh = shapeOf( outer ); sh.holes.push( new THREE.Path( hole.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ) ) );
			add( g, curved( smoothNormals( new THREE.ExtrudeGeometry( sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 4 } ).translate( 0, 0, - 0.03 ), 1e-4 ), R ), frame );
			add( g, curved( new THREE.ShapeGeometry( shapeOf( hole ) ).translate( 0, 0, - 0.004 ), R ), M( lensC, { rough: 0.04, metal: 0.85, side: THREE.DoubleSide } ) );
			const strapM = cloth( s.strap ?? 0x2a2a2a, { weave: 'rib', rough: 0.85 } );
			const SP = []; for ( let i = 0; i <= 16; i ++ ) { const a = - PI * 0.42 + i / 16 * PI * 0.84; SP.push( [ Math.sin( a ) * 0.1, Hh * 0.5, - Math.cos( a ) * 0.11 - 0.012 ] ); }
			add( g, band( SP, 0.036, 0.003, { seg: 24, up: ( p ) => { const l = Math.hypot( p.x, p.z + 0.012 ) || 1; return [ p.x / l, 0, ( p.z + 0.012 ) / l ]; } } ), strapM );
			break;
		}
		case 'dive': {
			// a tempered glass window in a frame, the silicone skirt behind, the strap, a snorkel clipped on
			const sil = M( s.color ?? 0x1a1a1a, { rough: 0.55 } );
			const win = curveLoop( [ [ - 0.075, 0.012 ], [ - 0.07, 0.07 ], [ 0, 0.074 ], [ 0.07, 0.07 ], [ 0.075, 0.012 ], [ 0.03, 0.006 ], [ 0, 0.028 ], [ - 0.03, 0.006 ] ], 40 );
			const frameS = shapeOf( win.map( p => [ p[ 0 ] * 1.1, ( p[ 1 ] - 0.04 ) * 1.18 + 0.04 ] ) ); frameS.holes.push( new THREE.Path( win.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ) ) );
			add( g, smoothNormals( new THREE.ExtrudeGeometry( frameS, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 4 } ), 1e-4 ), frame );
			add( g, new THREE.ShapeGeometry( shapeOf( win ) ).translate( 0, 0, 0.005 ), lens );
			add( g, smoothNormals( new THREE.ExtrudeGeometry( shapeOf( win.map( p => [ p[ 0 ] * 1.12, ( p[ 1 ] - 0.04 ) * 1.25 + 0.04 ] ) ), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 2, curveSegments: 4 } ).translate( 0, 0, - 0.04 ), 1e-4 ), sil );
			const SP = []; for ( let i = 0; i <= 12; i ++ ) { const a = - PI * 0.45 + i / 12 * PI * 0.9; SP.push( [ Math.sin( a ) * 0.09, 0.04, - Math.cos( a ) * 0.09 - 0.03 ] ); }
			add( g, band( SP, 0.02, 0.003, { seg: 18, up: ( p ) => { const l = Math.hypot( p.x, p.z + 0.03 ) || 1; return [ p.x / l, 0, ( p.z + 0.03 ) / l ]; } } ), sil );
			add( g, G.tube( [ [ 0.095, 0.05, - 0.03 ], [ 0.11, 0.12, - 0.04 ], [ 0.11, 0.26, - 0.04 ], [ 0.115, 0.31, - 0.03 ] ], 0.009, 16, 8 ).rotateZ( - PI / 2 ).translate( 0.06, 0.1, 0 ), M( s.strap ?? 0x2a8ad6, { rough: 0.45 } ) );
			break;
		}
		case 'swim': {
			// two small cups on a nose bridge, the split strap behind
			const cup = M( s.color ?? 0x2a6ad6, { rough: 0.35 } );
			for ( const k of [ - 1, 1 ] ) {
				add( g, G.sph( 0.022, 12, 6, 0, PI * 2, 0, PI / 2 ).scale( 1.25, 1, 0.6 ).rotateX( PI / 2 ).translate( k * 0.032, 0.022, 0.0 ), lens );
				add( g, G.torus( 0.022, 0.003, 5, 16 ).scale( 1.25, 1, 1 ), cup, [ k * 0.032, 0.022, - 0.001 ] );
			}
			add( g, G.tube( [ [ - 0.01, 0.024, 0 ], [ 0, 0.02, 0.004 ], [ 0.01, 0.024, 0 ] ], 0.0025, 6, 4 ), cup );
			for ( const dy of [ - 0.006, 0.006 ] ) { const SP = []; for ( let i = 0; i <= 10; i ++ ) { const a = - PI * 0.48 + i / 10 * PI * 0.96; SP.push( [ Math.sin( a ) * 0.065, 0.022 + dy, - Math.cos( a ) * 0.08 + 0.002 ] ); } add( g, band( SP, 0.004, 0.0015, { seg: 14, up: ( p ) => { const l = Math.hypot( p.x, p.z ) || 1; return [ p.x / l, 0, p.z / l ]; } } ), M( s.strap ?? 0x2a6ad6, { rough: 0.6 } ) ); }
			break;
		}
		case 'aviator': {
			// teardrop lenses in thin wire rims, a double bridge, nose pads, wire temples with tips
			const L = curveLoop( [ [ 0.006, 0.04 ], [ 0.034, 0.044 ], [ 0.058, 0.038 ], [ 0.062, 0.02 ], [ 0.05, 0.002 ], [ 0.028, 0.0 ], [ 0.012, 0.014 ] ], 28 );
			for ( const k of [ - 1, 1 ] ) {
				const P = L.map( p => [ k * p[ 0 ], p[ 1 ] + 0.004 ] );
				add( g, new THREE.ShapeGeometry( shapeOf( k > 0 ? P : P.slice().reverse() ) ), lens );
				add( g, band( P.map( p => [ p[ 0 ], p[ 1 ], 0 ] ), 0.0024, 0.0024, { closed: true, seg: 28, up: [ 0, 0, 1 ] } ), frame );
				add( g, G.sph( 0.0045, 6, 4 ).scale( 0.7, 1, 0.4 ), MAT.glass( 0xe8f0f2, 0.5 ), [ k * 0.008, 0.016, - 0.006 ] );
			}
			for ( const [ y, sag ] of [ [ 0.044, 0.002 ], [ 0.035, - 0.002 ] ] ) add( g, band( [ [ - 0.008, y, 0 ], [ 0, y + sag, 0 ], [ 0.008, y, 0 ] ], 0.0018, 0.0018, { seg: 4, up: [ 0, 0, 1 ] } ), frame );
			temples( 0.062, 0.038, 0.0018, 0.0022, frame, M( 0x1a1a1a, { rough: 0.5 } ) );
			break;
		}
		case 'sport': case 'safety': {
			// one wraparound shield lens under a brow bar (safety: side shields, clear)
			const W = 0.15;
			const shield = curveLoop( [ [ - W / 2, 0.044 ], [ 0, 0.048 ], [ W / 2, 0.044 ], [ W / 2 + 0.002, 0.016 ], [ W * 0.32, 0.0 ], [ 0.012, 0.012 ], [ 0, 0.022 ], [ - 0.012, 0.012 ], [ - W * 0.32, 0.0 ], [ - W / 2 - 0.002, 0.016 ] ], 40 );
			const geo = new THREE.ShapeGeometry( shapeOf( shield ) ), p = geo.attributes.position;
			for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), a = x / 0.09; p.setX( i, Math.sin( a ) * 0.09 ); p.setZ( i, Math.cos( a ) * 0.09 - 0.09 ); }
			geo.computeVertexNormals();
			add( g, geo.translate( 0, 0.004, 0 ), style === 'safety' ? lens : M( lensC, { rough: 0.04, metal: 0.85, side: THREE.DoubleSide } ) );
			const brow = []; for ( let i = 0; i <= 12; i ++ ) { const x = - W / 2 + i / 12 * W, a = x / 0.09; brow.push( [ Math.sin( a ) * 0.091, 0.049 + 0.003 * Math.cos( x * 20 ), Math.cos( a ) * 0.091 - 0.09 ] ); }
			add( g, band( brow, 0.008, 0.005, { seg: 16, round: true, up: ( pp ) => { const l = Math.hypot( pp.x, pp.z + 0.09 ) || 1; return [ pp.x / l, 0, ( pp.z + 0.09 ) / l ]; } } ), frame );
			add( g, G.box( 0.016, 0.012, 0.006 ), frame, [ 0, 0.02, 0.0015 ] ); // the nose piece
			const ex = Math.sin( W / 2 / 0.09 ) * 0.091;
			temples( ex, 0.044, 0.004, style === 'safety' ? 0.012 : 0.007, frame );
			break;
		}
		default: { // sun: a thick acetate front with two lens holes, bevelled
			const lensP = curveLoop( [ [ 0.009, 0.042 ], [ 0.036, 0.046 ], [ 0.061, 0.042 ], [ 0.062, 0.022 ], [ 0.052, 0.006 ], [ 0.03, 0.004 ], [ 0.012, 0.012 ] ], 28 );
			const outer = curveLoop( [ [ - 0.071, 0.05 ], [ - 0.036, 0.053 ], [ 0, 0.05 ], [ 0.036, 0.053 ], [ 0.071, 0.05 ], [ 0.068, 0.02 ], [ 0.054, 0.0 ], [ 0.03, - 0.003 ], [ 0.009, 0.01 ], [ 0, 0.022 ], [ - 0.009, 0.01 ], [ - 0.03, - 0.003 ], [ - 0.054, 0.0 ], [ - 0.068, 0.02 ] ], 48 );
			const sh = shapeOf( outer );
			for ( const k of [ - 1, 1 ] ) { const P = lensP.map( p => [ k * p[ 0 ], p[ 1 ] ] ); sh.holes.push( new THREE.Path( ( k > 0 ? P.slice().reverse() : P ).map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ) ) ); add( g, new THREE.ShapeGeometry( shapeOf( k > 0 ? P : P.slice().reverse() ) ).translate( 0, 0.004, 0.0 ), lens ); }
			add( g, smoothNormals( new THREE.ExtrudeGeometry( sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 3 } ).translate( 0, 0.004, - 0.002 ), 1e-4 ), frame );
			for ( const k of [ - 1, 1 ] ) add( g, G.cyl( 0.0012, 0.0012, 0.0012, 6 ).rotateX( PI / 2 ), metal, [ k * 0.064, 0.047, 0.0035 ] ); // the rivets
			temples( 0.068, 0.046, 0.0035, 0.008, frame );
		}
	}
	return ground( g );
}

// ---- vests --------------------------------------------------------------------------------------------------------------
// { style: plate|rig|stab|hunting|fishing|hivis|life, color, color2, print, patch, text }. Laid flat, the neck away (-z).

// MOLLE: rows of webbing across a surface, bar-tacked into channels
export function molle( g, top, x0, x1, z0, rows, m, tack ) {
	for ( let r = 0; r < rows; r ++ ) {
		const z = z0 + r * 0.034;
		add( g, conform( panel( roundRect( x1 - x0, 0.024, 0.002, ( x0 + x1 ) / 2, z, 2 ), { T: 0.0022, R: 0.001, cell: 0.06, bottom: false } ).geo, top, 0.0004 ), m );
		for ( let x = x0 + 0.004; x <= x1 - 0.003; x += 0.05 ) add( g, G.box( 0.003, 0.0012, 0.024 ).translate( x, top( x, z ) + 0.0026, z ), tack );
	}
}
// a pouch standing up off a surface: a soft box, its flap, a bungee or snap
export function pouchOn( g, top, x, z, w, d, h, m, o = {} ) {
	const y = top( x, z );
	add( g, softBox( w, h, d, Math.min( 0.008, h * 0.4 ), { seg: 2 } ), m, [ x, y - 0.002, z ] );
	add( g, softBox( w + 0.003, 0.007, d * 0.42, 0.003, { seg: 1 } ), m, [ x, y + h - 0.004, z - d * 0.3 ] );
	if ( o.snap ) add( g, G.cyl( 0.0045, 0.0045, 0.002, 8 ), MAT.darkMetal(), [ x, y + h + 0.003, z - d * 0.12 ] );
	if ( o.bungee ) add( g, G.box( 0.0035, 0.004, d * 0.5 ), M( 0x1a1a1a, { rough: 0.6 } ), [ x, y + h + 0.0015, z - d * 0.05 ] );
}

export function vestModel( s ) {
	const g = group(), c = s.color ?? 0x3a3f2a, style = s.style || 'plate';
	const tac = style === 'plate' || style === 'rig' || style === 'stab';
	const body = cloth( c, { print: s.print, color2: s.color2 ?? 0xffffff, rep: 1.6, weave: weaveOf( s, tac ? 'canvas' : style === 'hivis' ? 'ripstop' : style === 'life' ? 'nylon' : 'canvas' ), wrep: style === 'hivis' ? 2.2 : 1, rough: s.rough } );
	const web = M( s.color2 ?? shade( c, - 0.22 ), { rough: 0.85 } ), stitch = thread( c ), dark = M( 0x1a1a1a, { rough: 0.7 } );
	const buckle = MAT.blackPlastic();
	if ( tac ) {
		// ---- carriers: a front panel (a plate inside), shoulder straps, cummerbund wings; webbing, pouches ----
		const rig = style === 'rig', stab = style === 'stab';
		const F = rig ? curveLoop( [ [ - 0.135, 0.0 ], [ 0.135, 0.0 ], [ 0.14, 0.16 ], [ 0, 0.165 ], [ - 0.14, 0.16 ] ], 40 )
			: curveLoop( stab ? [ [ - 0.12, 0.16 ], [ 0.12, 0.16 ], [ 0.13, - 0.04 ], [ 0.1, - 0.09 ], [ 0.085, - 0.15 ], [ 0.05, - 0.16 ], [ 0, - 0.12 ], [ - 0.05, - 0.16 ], [ - 0.085, - 0.15 ], [ - 0.1, - 0.09 ], [ - 0.13, - 0.04 ] ]
				: [ [ - 0.13, 0.16 ], [ 0.13, 0.16 ], [ 0.132, - 0.09 ], [ 0.095, - 0.15 ], [ 0.05, - 0.162 ], [ 0, - 0.14 ], [ - 0.05, - 0.162 ], [ - 0.095, - 0.15 ], [ - 0.132, - 0.09 ] ], 64 );
		const T = s.thick ?? ( rig ? 0.018 : stab ? 0.02 : 0.034 );
		const front = panel( F, { T, R: T * 0.55, cell: 0.024, uv: [ 0, 0 ], disp: ( x, z ) => T * 0.12 * ( 1 - ( x / 0.13 ) ** 2 ) } );
		add( g, front.geo, body );
		const top = front.top;
		// shoulder straps up off the top edge, padded, and the cummerbund wings out to the sides
		const strapZ0 = rig ? 0.01 : - 0.14;
		for ( const k of [ - 1, 1 ] ) {
			const S = panel( roundRect( 0.048, rig ? 0.24 : 0.12, 0.016, k * ( rig ? 0.09 : 0.075 ), strapZ0 - ( rig ? 0.12 : 0.055 ), 3 ), { T: 0.012, R: 0.008, cell: 0.03, uv: [ 0, 0 ] } );
			add( g, S.geo, body );
			if ( rig ) add( g, G.box( 0.03, 0.01, 0.022 ), buckle, [ k * 0.09, 0.011, strapZ0 - 0.06 ] );
			const C = panel( roundRect( rig ? 0.16 : 0.12, rig ? 0.035 : 0.14, 0.012, k * ( rig ? 0.2 : 0.18 ), rig ? 0.08 : 0.075, 3 ), { T: rig ? 0.006 : 0.012, R: 0.005, cell: 0.03, uv: [ 0, 0 ] } );
			add( g, C.geo, rig ? web : body );
			if ( ! rig && ! stab ) molle( g, C.top, k > 0 ? 0.13 : - 0.235, k > 0 ? 0.235 : - 0.13, 0.025, 3, web, stitch );
			add( g, G.rbox( 0.024, 0.01, 0.03, 0.003, 1 ), buckle, [ k * ( rig ? 0.27 : 0.235 ), 0.006, rig ? 0.08 : 0.075 ] );
		}
		if ( stab ) {
			// a slim covert panel: an ID patch, side straps' velcro tabs, an edge binding
			add( g, band( F.map( p => [ p[ 0 ], top( p[ 0 ], p[ 1 ] ) + 0.001, p[ 1 ] ] ), 0.008, 0.004, { closed: true, round: true, seg: 64 } ), dark );
			const id = panel( roundRect( 0.11, 0.035, 0.005, 0, - 0.06, 3 ), { T: 0.0015, R: 0.001, cell: 0.05, bottom: false } );
			add( g, conform( id.geo, top, 0.0004 ), dark );
			const d = panel( roundRect( 0.1, 0.03, 0.004, 0, - 0.06, 2 ), { T: 0.0004, R: 0.0003, cell: 0.06, bottom: false } ); uvOf( d.geo, 0, - 0.06, 0.1 );
			add( g, conform( d.geo, top, 0.0024 ), sloganMat( s.text ?? 'SECURITY', 0xf2f2ee ) );
		} else if ( rig ) {
			// four tall rifle mag pouches in a row, a smaller one each end
			for ( let i = 0; i < 4; i ++ ) pouchOn( g, top, - 0.075 + i * 0.05, 0.085, 0.045, 0.1, 0.034, body, { snap: true } );
			for ( const k of [ - 1, 1 ] ) pouchOn( g, top, k * 0.125, 0.09, 0.035, 0.07, 0.03, body, { snap: true } );
		} else {
			// three mag pouches across the lower front over the webbing, an admin pouch, a loop panel for patches
			molle( g, top, - 0.12, 0.12, 0.03, 4, web, stitch );
			for ( let i = 0; i < 3; i ++ ) pouchOn( g, top, - 0.075 + i * 0.075, 0.095, 0.066, 0.085, 0.032, body, { bungee: true } );
			const ad = panel( roundRect( 0.14, 0.07, 0.01, 0, - 0.045, 3 ), { T: 0.008, R: 0.005, cell: 0.03, bottom: false, uv: [ 0, 0 ] } );
			add( g, conform( ad.geo, top, 0.0003 ), body );
			const atop = ( x, z ) => top( x, z ) + ad.top( x, z ) + 0.0003;
			add( g, seam( line( [ - 0.06, - 0.068 ], [ 0.06, - 0.068 ], 3 ), atop, 0.004, 0.0004 ), dark );
			add( g, G.box( 0.006, 0.003, 0.014 ), MAT.metal(), [ 0.058, atop( 0.058, - 0.068 ) + 0.002, - 0.062 ] );
			const lp = panel( roundRect( 0.12, 0.042, 0.004, 0, - 0.11, 2 ), { T: 0.0018, R: 0.001, cell: 0.06, bottom: false } );
			add( g, conform( lp.geo, top, 0.0004 ), cloth( s.patch ? 0x16181c : shade( c, - 0.1 ), { weave: 'fleece', rough: 1 } ) );
			if ( s.patch ) {
				const d = panel( roundRect( 0.11, 0.032, 0.004, 0, - 0.11, 2 ), { T: 0.0004, R: 0.0003, cell: 0.06, bottom: false } ); uvOf( d.geo, 0, - 0.11, 0.11 );
				add( g, conform( d.geo, top, 0.0026 ), sloganMat( s.text ?? 'POLICE', s.patch ) );
			}
		}
		if ( s.onFront ) s.onFront( g, top, T ); // (the gear domain's vests add their plates)
		return ground( g );
	}
	// ---- garment vests: two fronts either side of a zip, armholes, a V neck ----
	const L = 0.34, half = [ [ 0.006, - L / 2 + 0.12 ], [ 0.04, - L / 2 + 0.035 ], [ 0.062, - L / 2 ], [ 0.112, - L / 2 + 0.006 ], [ 0.116, - L / 2 + 0.04 ], [ 0.096, - L / 2 + 0.09 ], [ 0.138, - L / 2 + 0.15 ], [ 0.142, L / 2 - 0.03 ], [ 0.125, L / 2 ], [ 0.006, L / 2 + 0.004 ] ];
	const life = style === 'life', T = life ? 0.05 : 0.02;
	const fronts = [];
	for ( const k of [ - 1, 1 ] ) {
		const P = curveLoop( half.map( p => [ k * p[ 0 ], p[ 1 ] ] ), 48 );
		const f = panel( P, { T, R: life ? T * 0.6 : T, cell: life ? 0.016 : 0.024, uv: [ 0, 0 ],
			disp: life ? ( x, z ) => - T * 0.18 * Math.pow( Math.abs( Math.cos( ( Math.abs( x ) - 0.01 ) / 0.042 * PI ) ), 6 ) : ( x, z ) => T * 0.1 * Math.sin( z * 30 + x * 10 ) } );
		add( g, f.geo, body );
		fronts.push( [ k, f.top ] );
	}
	const top = ( x, z ) => ( x >= 0 ? fronts[ 1 ][ 1 ] : fronts[ 0 ][ 1 ] )( x, z );
	// the back's collar shows through the V; binding round the armholes
	add( g, panel( roundRect( 0.11, 0.06, 0.02, 0, - L / 2 + 0.04, 3 ), { T: T * 0.5, R: T * 0.4, cell: 0.03, uv: [ 0, 0 ] } ).geo, body );
	if ( life ) {
		// a pillow collar, three straps and buckles across, reflective patches
		add( g, G.capsX( 0.022, 0.13, 10, 4 ), body, [ 0, 0.02, - L / 2 - 0.004 ] );
		for ( const z of [ - 0.02, 0.05, 0.12 ] ) {
			add( g, band( [ [ - 0.142, top( - 0.12, z ) * 0.6, z ], [ - 0.08, top( - 0.08, z ) + 0.002, z ], [ 0, top( 0.004, z ) + 0.003, z ], [ 0.08, top( 0.08, z ) + 0.002, z ], [ 0.142, top( 0.12, z ) * 0.6, z ] ], 0.024, 0.0025, { seg: 16 } ), dark );
			add( g, G.rbox( 0.04, 0.012, 0.032, 0.004, 1 ), buckle, [ 0, top( 0.004, z ) + 0.004, z ] );
		}
		for ( const k of [ - 1, 1 ] ) add( g, conform( panel( roundRect( 0.03, 0.05, 0.004, k * 0.09, - L / 2 + 0.03, 2 ), { T: 0.0015, R: 0.001, cell: 0.05, bottom: false } ).geo, top, 0.0004 ), M( 0xd4d8dc, { rough: 0.22, metal: 0.65 } ) );
		return ground( g );
	}
	// the zip up the middle
	const zt = M( shade( c, - 0.4 ), { rough: 0.5 } );
	add( g, band( [ [ 0, top( 0.01, L / 2 - 0.01 ) + 0.001, L / 2 - 0.008 ], [ 0, top( 0.01, 0 ) + 0.001, 0 ], [ 0, top( 0.01, - L / 2 + 0.12 ) + 0.001, - L / 2 + 0.122 ] ], 0.01, 0.0015, { seg: 6 } ), zt );
	add( g, G.box( 0.008, 0.004, 0.014 ), MAT.darkMetal(), [ 0.002, top( 0.01, - L / 2 + 0.13 ) + 0.003, - L / 2 + 0.135 ] );
	if ( style === 'hivis' ) {
		// reflective tape: two bands round, braces over the shoulders
		const tape = M( 0xd8dcdc, { rough: 0.2, metal: 0.6, emissive: 0x666666, emissiveIntensity: 0.3 } );
		for ( const z of [ 0.04, 0.115 ] ) for ( const k of [ - 1, 1 ] ) add( g, conform( panel( roundRect( 0.13, 0.026, 0.003, k * 0.075, z, 2 ), { T: 0.0015, R: 0.001, cell: 0.06, bottom: false } ).geo, top, 0.0005 ), tape );
		for ( const k of [ - 1, 1 ] ) add( g, conform( panel( [ [ k * 0.07, - L / 2 + 0.004 ], [ k * 0.1, - L / 2 + 0.006 ], [ k * 0.1, 0.03 ], [ k * 0.07, 0.03 ] ], { T: 0.0015, R: 0.001, cell: 0.06, bottom: false } ).geo, top, 0.0007 ), tape );
		return ground( g );
	}
	// pockets: flap pockets low on both fronts; a fishing vest's chest is all pockets, a fly patch and a D-ring
	const pocket = ( x, z, w, h, flap = true, zip = false ) => {
		add( g, conform( panel( roundRect( w, h, 0.006, x, z, 3 ), { T: 0.006, R: 0.004, cell: 0.03, bottom: false, uv: [ 0, 0 ] } ).geo, top, 0.0003 ), body );
		if ( flap ) add( g, conform( panel( roundRect( w + 0.004, h * 0.32, 0.004, x, z - h * 0.36, 2 ), { T: 0.005, R: 0.003, cell: 0.03, bottom: false, uv: [ 0, 0 ] } ).geo, top, 0.0065 ), body );
		if ( zip ) add( g, G.box( w * 0.8, 0.0015, 0.004 ).translate( x, top( x, z ) + 0.0095, z - h * 0.2 ), zt );
	};
	for ( const k of [ - 1, 1 ] ) pocket( k * 0.075, 0.1, 0.085, 0.085 );
	if ( style === 'fishing' ) {
		for ( const k of [ - 1, 1 ] ) { pocket( k * 0.05, - 0.02, 0.05, 0.06, true ); pocket( k * 0.105, - 0.02, 0.045, 0.065, false, true ); }
		add( g, conform( panel( roundRect( 0.05, 0.035, 0.008, - 0.07, - 0.1, 3 ), { T: 0.006, R: 0.004, cell: 0.03, bottom: false } ).geo, top, 0.0004 ), cloth( 0x8a8a7a, { weave: 'fleece', rough: 1 } ) );
		add( g, G.torus( 0.008, 0.0016, 4, 10, PI ).rotateX( - PI / 2 ), MAT.metal(), [ 0.07, top( 0.07, - 0.1 ) + 0.002, - 0.1 ] );
	}
	if ( style === 'hunting' ) for ( let i = 0; i < 5; i ++ ) {
		// shell loops on the left chest
		const x = - 0.105 + i * 0.016, z = - 0.03;
		add( g, G.cyl( 0.006, 0.006, 0.045, 8 ).rotateX( PI / 2 ).translate( x, top( x, z ) + 0.007, z + 0.006 ), M( 0xc8282a, { rough: 0.5 } ) );
		add( g, G.cyl( 0.0062, 0.0062, 0.012, 8 ).rotateX( PI / 2 ).translate( x, top( x, z ) + 0.007, z - 0.022 ), MAT.gold() );
		add( g, G.box( 0.014, 0.014, 0.012 ).translate( x, top( x, z ) + 0.002, z + 0.004 ), web );
	}
	return ground( g );
}

// ---- backpacks and bags -------------------------------------------------------------------------------------------------
// { style: school|hiking|rucksack|assault|medic|duffel|dry|fanny|cooler|tote|improvised, color, color2, print, roll }
// Packs stand up, the front towards +z, the harness behind; bags lie as they'd be dropped.

// a zip along points [ x, y, z ] (on a surface already), its slider and pull at the start
export function zipLine( g, P, o = {} ) {
	const tape = M( o.tape ?? 0x1c1c1c, { rough: 0.6 } ), teeth = M( o.teeth ?? 0x2a2a2a, { rough: 0.35, metal: 0.5 } );
	const up = o.up ?? [ 0, 0, 1 ];
	add( g, band( P, o.w ?? 0.01, 0.0016, { seg: Math.max( 2, P.length * 2 ), up } ), tape );
	add( g, band( P.map( p => [ p[ 0 ] + up[ 0 ] * 0.001, p[ 1 ] + up[ 1 ] * 0.001, p[ 2 ] + up[ 2 ] * 0.001 ] ), ( o.w ?? 0.01 ) * 0.4, 0.0016, { seg: Math.max( 2, P.length * 2 ), up } ), teeth );
	for ( const i of o.pulls ?? [ 0 ] ) {
		const p = P[ i ], q = P[ Math.min( P.length - 1, i + 1 ) === i ? i - 1 : i + 1 ];
		const slider = new THREE.Group(); slider.position.set( p[ 0 ] + up[ 0 ] * 0.003, p[ 1 ] + up[ 1 ] * 0.003, p[ 2 ] + up[ 2 ] * 0.003 );
		slider.lookAt( slider.position.x + up[ 0 ], slider.position.y + up[ 1 ], slider.position.z + up[ 2 ] );
		add( slider, G.box( 0.01, 0.014, 0.004 ), MAT.darkMetal() );
		add( slider, G.tube( [ [ 0, - 0.004, 0.002 ], [ 0.004, - 0.02, 0.004 ], [ 0, - 0.03, 0.003 ], [ - 0.004, - 0.02, 0.004 ], [ 0, - 0.004, 0.002 ] ], 0.0016, 10, 4 ), M( o.cord ?? 0x1a1a1a, { rough: 0.7 } ) );
		void q;
		g.add( slider );
	}
}

function packModel( s ) {
	const g = group(), c = s.color ?? 0x2a4a6a, style = s.style || 'school';
	const body = cloth( c, { print: s.print?.startsWith?.( 'text:' ) ? null : s.print, color2: s.color2 ?? 0xffffff, rep: s.rep ?? 1.6, weave: weaveOf( s, style === 'dry' ? 'none' : style === 'tote' ? 'canvas' : style === 'improvised' ? 'none' : 'canvas' ), rough: style === 'dry' ? 0.3 : style === 'improvised' ? 0.5 : undefined } );
	const accC = s.color2 ?? shade( c, - 0.3 );
	const acc = cloth( accC, { weave: 'canvas', rough: 0.8 } );
	const web = M( 0x1c1c1c, { rough: 0.85 } ), buckle = MAT.blackPlastic(), stitch = thread( c );
	// (stretch mesh and the back panel's spacer mesh: plain, so they share the matte draw)
	const mesh = M( shade( c, - 0.45 ), { rough: 0.9 } );
	switch ( style ) {
		case 'duffel': {
			// a long barrel bag: round end panels, two carry straps over the top, a zip along it, the shoulder strap beside
			const L = 0.6, R = 0.14;
			add( g, grid( 24, 12, ( u, v ) => { const a = u * PI * 2, x = ( v - 0.5 ) * L, k = 1 - 0.12 * ( 2 * v - 1 ) ** 6, sag = Math.sin( a ) < 0 ? 1 : 0; return [ x, R + Math.sin( a ) * R * k * ( 1 - 0.12 * sag ), Math.cos( a ) * R * k * 1.05 ]; }, { closeU: true, uvScale: [ 2.9, 2 ] } ), body );
			for ( const k of [ - 1, 1 ] ) {
				add( g, G.cylX( R * 0.89, 0.012, 22 ).scale( 1, 1, 1.05 ), acc, [ k * ( L / 2 - 0.003 ), R, 0 ] );
				add( g, G.torus( R * 0.9, 0.006, 5, 22 ).rotateY( PI / 2 ).scale( 1, 1, 1.05 ), web, [ k * ( L / 2 - 0.004 ), R, 0 ] );
				add( g, band( Array.from( { length: 9 }, ( _, i ) => { const a = - 0.3 + i / 8 * ( PI + 0.6 ); return [ k * 0.1, R + Math.sin( a ) * R * 1.03, Math.cos( a ) * R * 1.08 ]; } ), 0.032, 0.0025, { seg: 16, up: ( p ) => [ 0, p.y - R, p.z ] } ), web );
				add( g, G.rbox( 0.006, 0.022, 0.03, 0.002, 1 ), MAT.darkMetal(), [ k * ( L / 2 + 0.002 ), R * 1.6, 0 ] );
			}
			add( g, band( [ [ - 0.1, 2 * R + 0.035, 0 ], [ 0, 2 * R + 0.05, 0 ], [ 0.1, 2 * R + 0.035, 0 ] ], 0.04, 0.008, { seg: 6, round: true } ), web ); // the handle wrap
			zipLine( g, [ [ - 0.22, 2 * R + 0.002, 0.03 ], [ 0, 2 * R + 0.004, 0.032 ], [ 0.22, 2 * R + 0.002, 0.03 ] ], { up: [ 0, 1, 0 ], pulls: [ 0, 2 ] } );
			add( g, band( [ [ - 0.25, 0.004, 0.17 ], [ - 0.05, 0.003, 0.2 ], [ 0.18, 0.003, 0.19 ], [ 0.27, 0.004, 0.15 ] ], 0.035, 0.003, { seg: 12 } ), web );
			add( g, G.rbox( 0.06, 0.012, 0.042, 0.004, 1 ), web, [ 0.0, 0.003, 0.195 ] );
			break;
		}
		case 'dry': {
			// a roll-top drum lying down: welded seam, the top rolled three times and clipped, a D-ring
			const R = 0.1, L = 0.32;
			add( g, G.cylX( R, L, 24 ), body, [ 0, R, 0 ] );
			add( g, G.cylX( R * 0.98, 0.01, 24 ), body, [ - L / 2 - 0.004, R, 0 ] );
			const roll = M( s.color2 ?? 0x1a1a1a, { rough: 0.45 } );
			add( g, G.cylX( R, 0.05, 24, R * 0.4 ), body, [ L / 2 + 0.025, R, 0 ] );
			add( g, G.rbox( 0.06, 0.026, 0.14, 0.012, 2 ), body, [ L / 2 + 0.07, R - 0.013, 0 ] );
			add( g, G.cylX( 0.013, 0.05, 10 ).rotateY( PI / 2 ).scale( 1, 1, 2.9 ), body, [ L / 2 + 0.07, R + 0.006, 0 ] );
			add( g, G.cylX( R * 1.005, 0.026, 24 ), roll, [ - 0.06, R, 0 ] );
			add( g, G.rbox( 0.02, 0.024, 0.04, 0.005, 1 ), buckle, [ L / 2 + 0.1, R - 0.01, 0 ] );
			add( g, G.torus( 0.012, 0.003, 4, 10, PI ).rotateY( PI / 2 ), MAT.metal(), [ - L / 2 + 0.03, R * 2 - 0.004, 0 ] );
			add( g, G.box( L * 0.9, 0.004, 0.006 ), M( shade( c, - 0.15 ), { rough: 0.3 } ), [ 0, 0.002 + R * 2 - 0.001, 0 ] );
			break;
		}
		case 'fanny': {
			// a curved hip pack, two zips across its face, the belt looped behind it
			const W = 0.26, H = 0.12, D = 0.08;
			add( g, softBox( W, H, D, 0.04, { seg: 4, shape: ( x, y, z ) => [ x, y, z + 0.03 * ( 1 - ( 2 * x / W ) ** 2 ) * ( z > 0 ? 1 : - 0.3 ) - ( 2 * x / W ) ** 2 * 0.03 ] } ), body, [ 0, 0, 0 ] );
			const fz = ( x, y ) => D / 2 + 0.03 * ( 1 - ( 2 * x / W ) ** 2 ) - ( 2 * x / W ) ** 2 * 0.03 + 0.002;
			zipLine( g, Array.from( { length: 7 }, ( _, i ) => { const x = - 0.1 + i / 6 * 0.2; return [ x, H * 0.86 - Math.abs( x ) * 0.15, fz( x ) - 0.008 ]; } ), { pulls: [ 0 ] } );
			zipLine( g, Array.from( { length: 5 }, ( _, i ) => { const x = - 0.08 + i / 4 * 0.16; return [ x, H * 0.45, fz( x ) ]; } ), { pulls: [ 4 ], w: 0.008 } );
			add( g, band( Array.from( { length: 13 }, ( _, i ) => { const a = - PI * 0.1 + i / 12 * PI * 1.2; return [ Math.cos( a ) * 0.22, 0.012, - Math.sin( a ) * 0.18 - 0.02 ]; } ), 0.025, 0.003, { seg: 20, up: ( p ) => { const l = Math.hypot( p.x, p.z + 0.02 ) || 1; return [ p.x / l, 0, ( p.z + 0.02 ) / l ]; } } ), web );
			add( g, G.rbox( 0.035, 0.03, 0.012, 0.004, 1 ), buckle, [ 0, 0.0, - 0.205 ] );
			break;
		}
		case 'cooler': {
			// a soft cooler: a padded box, its lid zipped round, carry straps over the top, a label window
			const W = 0.36, H = 0.25, D = 0.24;
			add( g, softBox( W, H, D, 0.03, { seg: 4 } ), body );
			add( g, softBox( W + 0.006, 0.05, D + 0.006, 0.026, { seg: 3, shape: ( x, y, z ) => [ x, y + ( 1 - ( 2 * x / W ) ** 2 ) * ( 1 - ( 2 * z / D ) ** 2 ) * 0.01 * ( y > 0.02 ? 1 : 0 ), z ] } ), cloth( shade( c, - 0.08 ), { weave: 'canvas' } ), [ 0, H - 0.026, 0 ] );
			zipLine( g, [ [ - W / 2 + 0.02, H - 0.024, D / 2 + 0.004 ], [ 0, H - 0.024, D / 2 + 0.005 ], [ W / 2 - 0.02, H - 0.024, D / 2 + 0.004 ] ], { pulls: [ 0 ] } );
			for ( const k of [ - 1, 1 ] ) add( g, band( [ [ k * 0.08, 0.05, D / 2 + 0.003 ], [ k * 0.08, H, D / 2 + 0.004 ], [ k * 0.06, H + 0.07, 0.03 ], [ k * 0.06, H + 0.07, - 0.03 ], [ k * 0.08, H, - D / 2 - 0.004 ], [ k * 0.08, 0.05, - D / 2 - 0.003 ] ], 0.03, 0.003, { seg: 30, up: ( p ) => [ 0, p.y > H ? 1 : 0, p.y > H ? 0 : Math.sign( p.z ) ] } ), M( s.color2 ?? 0xf2f2f2, { rough: 0.7 } ) );
			add( g, softBox( 0.16, 0.035, 0.05, 0.012, { seg: 2 } ), web, [ 0, H + 0.065, 0 ] );
			const lb = panel( roundRect( 0.18, 0.085, 0.01 ), { T: 0.002, R: 0.001, cell: 0.06, bottom: false } );
			add( g, lb.geo.rotateX( PI / 2 ).translate( 0, 0.1, D / 2 + 0.001 ), M( 0xf2f2f0, { rough: 0.4 } ) );
			add( g, panel( roundRect( 0.2, 0.1, 0.014 ), { T: 0.012, R: 0.008, cell: 0.06, bottom: false } ).geo.rotateX( PI / 2 ).translate( 0, 0.1, D / 2 - 0.009 ), mesh );
			break;
		}
		case 'tote': {
			// a canvas tote, slumped a little, long handles in loops, the print on its face
			const W = 0.34, H = 0.32, D = 0.1;
			add( g, softBox( W, H, D, 0.012, { seg: 4, shape: ( x, y, z ) => [ x * ( 0.94 + 0.06 * y / H ), y - ( 1 - ( 2 * x / W ) ** 2 ) * 0.012 * ( y / H ), z * ( 0.6 + 0.4 * Math.min( 1, ( H - y ) / 0.08 ) ) ] } ), body );
			const hm = cloth( s.color2 ?? 0x2a6a4a, { weave: 'canvas' } );
			for ( const k of [ - 1, 1 ] ) add( g, band( [ [ - 0.075, H - 0.06, k * 0.032 ], [ - 0.08, H + 0.04, k * 0.03 ], [ 0, H + 0.11, k * 0.026 ], [ 0.08, H + 0.04, k * 0.03 ], [ 0.075, H - 0.06, k * 0.032 ] ], 0.024, 0.003, { seg: 20, up: [ 0, 0, k ] } ), hm );
			add( g, ringGeo( 0.001, H - 0.012, 0.016, 0.002, 4 ).scale( 1, 1, 1 ), stitch );
			if ( String( s.print || '' ).startsWith( 'text:' ) ) {
				const d = panel( roundRect( 0.22, 0.11, 0.004 ), { T: 0.0006, R: 0.0005, cell: 0.06, bottom: false } ); uvOf( d.geo, 0, 0, 0.22 );
				add( g, d.geo.rotateX( PI / 2 ).translate( 0, H * 0.48, D / 2 + 0.0015 ), sloganMat( s.print.slice( 5 ), s.color2 ?? 0x2a6a4a ) );
			}
			break;
		}
		case 'improvised': {
			// a tarp gathered into a sack: creased, grommets showing, the neck tied off with rope that is also the strap
			const sack = G.sph( 0.2, 22, 14 ), P = sack.attributes.position;
			for ( let i = 0; i < P.count; i ++ ) {
				const x = P.getX( i ), y = P.getY( i ), z = P.getZ( i );
				const k = 1 + Math.sin( x * 31 + z * 17 ) * 0.05 + Math.sin( y * 23 - x * 13 ) * 0.04 + Math.max( 0, Math.sin( Math.atan2( z, x ) * 7 ) ) * 0.05 * ( y > 0 ? y / 0.2 : 0 );
				P.setXYZ( i, x * k * 1.15 - Math.max( 0, y ) * x * 0.6, y * k * ( y > 0 ? 0.8 : 0.55 ), z * k * 0.85 - Math.max( 0, y ) * z * 0.6 );
			}
			sack.computeVertexNormals();
			add( g, sack, body, [ 0, 0.11, 0 ] );
			add( g, G.cone( 0.06, 0.1, 12 ).translate( 0, - 0.05, 0 ).rotateZ( PI ), body, [ 0, 0.31, 0 ] );
			for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2 + 0.4; add( g, G.torus( 0.007, 0.0022, 4, 10 ), MAT.metal(), [ Math.cos( a ) * 0.045, 0.33, Math.sin( a ) * 0.04 ], [ 0.4, a, 0 ] ); }
			const rope = M( s.color2 ?? 0xc8b07a, { rough: 0.95 } );
			add( g, G.torus( 0.034, 0.008, 5, 14 ).rotateX( PI / 2 ), rope, [ 0, 0.275, 0 ] );
			add( g, G.tube( [ [ 0.03, 0.28, 0.01 ], [ 0.17, 0.25, 0.12 ], [ 0.22, 0.12, 0.16 ], [ 0.12, 0.02, 0.19 ], [ - 0.12, 0.02, 0.16 ], [ - 0.2, 0.08, 0.08 ] ], 0.007, 26, 5 ), rope );
			return ground( g );
		}
		default: { // school | hiking | rucksack | assault | medic
			const big = { hiking: 1.14, rucksack: 1.26, assault: 0.98, medic: 1 }[ style ] ?? 0.94;
			const H = 0.44 * big, W = 0.3 * big, D = ( style === 'medic' ? 0.2 : 0.17 ) * big;
			const B = style === 'medic' ? 0.012 : 0.03 * big, tp = style === 'medic' ? 0.04 : 0.1;
			const bulge = ( x, y ) => B * ( 1 - ( 2 * x / W ) ** 2 ) * Math.sin( Math.min( 1, y / H ) * PI );
			const shape = ( x, y, z ) => [ x * ( 1 - tp * y / H ), y, z > 0 ? z + bulge( x, y ) : z ];
			add( g, softBox( W, H, D, style === 'medic' ? 0.03 : 0.07 * big, { seg: 5, shape } ), body );
			const front = ( x, y, out = 0 ) => [ x * ( 1 - tp * y / H ), y, D / 2 + bulge( x, y ) + out ];
			// the main zip over the top, two pulls; a front pocket with its own zip; a patch or a cross
			zipLine( g, Array.from( { length: 9 }, ( _, i ) => { const a = - PI * 0.5 + i / 8 * PI, r = W * 0.43; const x = Math.sin( a ) * r; const y = H * 0.66 + Math.cos( a ) * ( H * 0.33 - 0.01 ); return front( x, y, 0.0005 + ( 1 - Math.cos( a ) ) * 0 ); } ).map( ( p, i, A ) => { const t = i / ( A.length - 1 ), lift = Math.sin( t * PI ) * 0.0; return [ p[ 0 ], p[ 1 ] + lift, p[ 2 ] - Math.sin( t * PI ) * D * 0.42 * ( t > 0.2 && t < 0.8 ? 1 : 0.6 ) ]; } ), { pulls: [ 3, 5 ], up: [ 0, 0.4, 1 ] } );
			const pw = W * 0.74, ph = H * 0.4, pd = 0.05 * big;
			add( g, softBox( pw, ph, pd, 0.03, { seg: 3, shape: ( x, y, z ) => [ x, y, z + ( z > 0 ? 0.012 * ( 1 - ( 2 * x / pw ) ** 2 ) : 0 ) ] } ), style === 'hiking' ? mesh : body, [ 0, H * 0.06, D / 2 + bulge( 0, H * 0.26 ) - pd * 0.35 ] );
			const pfz = D / 2 + bulge( 0, H * 0.26 ) - pd * 0.35 + pd / 2;
			if ( style !== 'hiking' ) zipLine( g, Array.from( { length: 7 }, ( _, i ) => { const a = - PI * 0.5 + i / 6 * PI; return [ Math.sin( a ) * pw * 0.42, H * 0.06 + ph * 0.6 + Math.cos( a ) * ph * 0.3, pfz + 0.009 * Math.cos( a ) + 0.002 ]; } ), { pulls: [ 1 ], w: 0.008, tape: style === 'school' ? accC : 0x1c1c1c } );
			if ( style === 'school' ) add( g, G.rbox( 0.06, 0.03, 0.004, 0.006, 1 ), M( accC, { rough: 0.6 } ), [ 0, H * 0.18, pfz + 0.011 ] );
			if ( style === 'medic' ) {
				add( g, G.rbox( 0.1, 0.1, 0.004, 0.008, 1 ), M( 0xf2f2ee, { rough: 0.6 } ), [ 0, H * 0.58, D / 2 + bulge( 0, H * 0.6 ) + 0.001 ] );
				for ( const [ w, h ] of [ [ 0.024, 0.07 ], [ 0.07, 0.024 ] ] ) add( g, G.box( w, h, 0.004 ), M( accC, { rough: 0.6 } ), [ 0, H * 0.58 + 0.015 - h / 2 + 0.02, D / 2 + bulge( 0, H * 0.6 ) + 0.003 ] );
				add( g, G.box( W * 0.9, 0.018, 0.003 ), M( 0xd4d8dc, { rough: 0.2, metal: 0.6, emissive: 0x555555, emissiveIntensity: 0.3 } ), [ 0, H * 0.42, D / 2 + bulge( 0, H * 0.42 ) + 0.001 ] );
			}
			if ( style === 'rucksack' || style === 'assault' ) {
				// webbing rows across the front above the pocket
				for ( let r = 0; r < ( style === 'rucksack' ? 3 : 4 ); r ++ ) {
					const y = H * 0.56 + r * 0.032;
					add( g, band( Array.from( { length: 5 }, ( _, i ) => front( - W * 0.36 + i / 4 * W * 0.72, y, 0.0012 ) ), 0.024, 0.002, { seg: 8 } ), M( style === 'rucksack' ? shade( accC, - 0.1 ) : accC, { rough: 0.85 } ) );
					for ( let i = 0; i <= 6; i ++ ) { const p = front( - W * 0.34 + i / 6 * W * 0.68, y, 0.0026 ); add( g, G.box( 0.003, 0.024, 0.0012 ), stitch, [ p[ 0 ], p[ 1 ] - 0.012, p[ 2 ] ] ); }
				}
				add( g, G.rbox( W * 0.4, 0.05, 0.004, 0.006, 1 ), cloth( shade( c, - 0.1 ), { weave: 'fleece' } ), [ 0, H * 0.88, D / 2 + bulge( 0, H * 0.88 ) + 0.001 ] );
			}
			// side pockets (mesh bottle pockets, or big side pouches on a rucksack), side compression straps
			for ( const k of [ - 1, 1 ] ) {
				const sx = k * ( W / 2 * ( 1 - tp * 0.15 ) );
				if ( style === 'rucksack' ) add( g, softBox( 0.06, H * 0.42, D * 0.7, 0.02, { seg: 3 } ), body, [ sx + k * 0.026, H * 0.06, 0 ] );
				else if ( style !== 'medic' ) add( g, softBox( 0.03, H * 0.3, D * 0.75, 0.012, { seg: 2 } ), style === 'assault' ? body : mesh, [ sx + k * 0.012, 0.012, 0 ] );
				for ( const y of style === 'school' || style === 'medic' ? [] : [ H * 0.48, H * 0.72 ] ) {
					// a compression strap round the side (over the side pouch on a rucksack), its ladder lock at the front
					const R = 0.07 * big, hx = W / 2 * ( 1 - tp * y / H ) + ( style === 'rucksack' ? 0.054 : 0.0025 );
					const sideX = ( z ) => { const zz = Math.abs( z ) - ( D / 2 - R ); return zz > 0 ? hx - R + Math.sqrt( Math.max( 0, R * R - zz * zz ) ) : hx; };
					const P = []; for ( let i = 0; i <= 8; i ++ ) { const z = lerp( - D * 0.42, D * 0.44, i / 8 ); P.push( [ k * sideX( z ), y, z ] ); }
					add( g, band( P, 0.02, 0.0025, { seg: 10, up: [ k, 0, 0 ] } ), web );
					add( g, G.rbox( 0.008, 0.026, 0.026, 0.003, 1 ), buckle, [ k * ( sideX( D * 0.3 ) + 0.003 ), y - 0.013, D * 0.3 ] );
				}
			}
			// a lid over the top with straps down to buckles (hiking, rucksack)
			if ( style === 'hiking' || style === 'rucksack' ) {
				const lw = W * ( 1 - tp ) + 0.02;
				add( g, softBox( lw, 0.075, D * 1.08, 0.03, { seg: 3, shape: ( x, y, z ) => [ x, y + ( 1 - ( 2 * x / lw ) ** 2 ) * 0.012 * ( y > 0.04 ? 1 : 0 ), z + ( z > 0 ? 0.015 : 0 ) ] } ), style === 'hiking' ? acc : body, [ 0, H - 0.05, 0.004 ] );
				zipLine( g, [ [ - lw * 0.35, H + 0.018, D * 0.54 + 0.016 ], [ 0, H + 0.019, D * 0.54 + 0.017 ], [ lw * 0.35, H + 0.018, D * 0.54 + 0.016 ] ], { pulls: [ 0 ], w: 0.008 } );
				for ( const k of [ - 1, 1 ] ) {
					add( g, band( [ front( k * W * 0.22, H - 0.02, 0.016 ), front( k * W * 0.22, H * 0.82, 0.004 ), front( k * W * 0.22, H * 0.66, 0.002 ) ], 0.022, 0.002, { seg: 6 } ), web );
					add( g, G.rbox( 0.03, 0.03, 0.008, 0.004, 1 ), buckle, front( k * W * 0.22, H * 0.74, 0.006 ) );
				}
			}
			// a hip belt's wings (hiking, rucksack) and a sleeping mat strapped under
			if ( style === 'hiking' || style === 'rucksack' ) {
				for ( const k of [ - 1, 1 ] ) add( g, softBox( 0.08, 0.07, 0.04, 0.018, { seg: 2 } ), style === 'hiking' ? acc : body, [ k * ( W / 2 + 0.03 ), 0.02, - D / 2 + 0.01 ], [ 0, - k * 0.5, 0 ] );
				add( g, G.cylX( 0.058 * big, W * 1.08, 18 ), cloth( s.roll ?? 0x3a6a3a, { weave: 'ripstop', rough: 0.7 } ), [ 0, 0.058 * big, D * 0.5 + 0.03 ] );
				add( g, G.cylX( 0.056 * big, W * 1.083, 18 ).scale( 1, 0.94, 0.94 ), M( shade( s.roll ?? 0x3a6a3a, - 0.3 ), { rough: 0.8 } ), [ 0, 0.058 * big, D * 0.5 + 0.03 ] );
				for ( const k of [ - 1, 1 ] ) add( g, G.torus( 0.058 * big + 0.003, 0.004, 4, 18 ).rotateY( PI / 2 ).scale( 1, 1, 1 ), web, [ k * W * 0.3, 0.058 * big, D * 0.5 + 0.03 ] );
			}
			// the harness behind: padded S-shaped straps, a grab handle, a back panel
			for ( const k of [ - 1, 1 ] ) {
				const xs = k * W * 0.24;
				add( g, band( [ [ xs * 0.7, H * 0.92, - D / 2 - 0.006 ], [ xs, H * 0.75, - D / 2 - 0.028 ], [ xs * 1.1, H * 0.45, - D / 2 - 0.03 ], [ xs * 1.25, H * 0.2, - D / 2 - 0.018 ] ], 0.06, 0.016, { seg: 12, round: true, up: [ 0, 0, - 1 ] } ), style === 'hiking' ? acc : body );
				add( g, band( [ [ xs * 1.25, H * 0.19, - D / 2 - 0.016 ], [ xs * 1.35, H * 0.08, - D / 2 - 0.006 ], [ xs * 1.5, 0.012, - D / 2 + 0.004 ] ], 0.022, 0.002, { seg: 4, up: [ 0, 0, - 1 ] } ), web );
				add( g, G.rbox( 0.026, 0.03, 0.008, 0.003, 1 ), buckle, [ xs * 1.3, H * 0.14, - D / 2 - 0.015 ] );
			}
			add( g, softBox( W * 0.66, H * 0.62, 0.016, 0.008, { seg: 2 } ), style === 'hiking' ? mesh : M( shade( c, - 0.25 ), { rough: 0.9 } ), [ 0, H * 0.18, - D / 2 - 0.004 ] );
			add( g, band( [ [ - 0.04, H * 0.97, - D * 0.2 ], [ 0, H + 0.03, - D * 0.22 ], [ 0.04, H * 0.97, - D * 0.2 ] ], 0.022, 0.004, { seg: 6, up: [ 0, 0, 1 ] } ), web );
			return ground( g );
		}
	}
	return ground( g );
}

export function registerClothingModels( reg ) {
	reg( 'shirt', foldedTop );

	reg( 'pants', foldedPants );

	reg( 'shoes', shoePair );

	reg( 'hat', hatModel );

	reg( 'mask', maskModel );

	reg( 'glasses', glassesModel );

	reg( 'vest', vestModel );

	reg( 'gloves', glovePair );

	reg( 'belt', beltModel );

	reg( 'backpack', packModel );
}
