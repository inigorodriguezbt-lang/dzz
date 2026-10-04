// Clothing and bags: folded tops and trousers (soft cloth panels with collars, plackets, pockets, seams and prints that
// run on across the folds), shoes in pairs, hats and helmets, masks, eyewear, vests and plate carriers, gloves, belts
// and backpacks. The cloth panels, straps and weave materials come from garment.js.
// Folded tops lie with the neck away from the viewer (towards -z), the chest print reading the right way up in the
// inventory icon; trousers lie along x with the waistband at +x.
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, fabric, shade, canvasTex, css } from './lib.js';
import { patchMaterial } from '../../../render/Materials.js';
import { cloth, panel, conform, band, seam, buttonGeo, curveLoop, roundRect, line, arc, smooth, lerp, softBox, grid, smoothNormals, uvOf } from './garment.js';

// ---- shared bits ---------------------------------------------------------------------------------------------------

const lum = ( c ) => ( ( c >> 16 & 255 ) * 0.3 + ( c >> 8 & 255 ) * 0.59 + ( c & 255 ) * 0.11 ) / 255;
// sewing thread: a shade darker than the cloth (lighter on near-black cloth)
const thread = ( c ) => M( lum( c ) < 0.13 ? shade( c, 0.25 ) : shade( c, - 0.3 ), { rough: 0.85 } );
// the weave a print or a style implies (a spec's own `weave` wins)
function weaveOf( s, fallback ) {
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
		T, R: T * 1.35, cell: quilt ? 0.014 : 0.022, uv: [ 0, - 0.03 ],
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
		const cf = panel( roundRect( sw - 0.008, 0.036, 0.008, k * ( x - sw / 2 ), z - 0.034, 3 ), { T: T * 0.34, R: T * 0.22, cell: 0.02, bottom: false, uv: [ 0, - 0.03 ] } );
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
	const seat = panel( seatP, { T, R: T * 1.3, cell: 0.022, uv: [ 0, 0 ],
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
		const leg = panel( legP, { T: T * 0.95, R: T * 1.1, cell: 0.022, uv: [ 0.01, 0.004 ], disp: ( px, pz ) => ( s.crease ? T * 0.12 * Math.exp( - ( ( ( pz + 0.01 ) / 0.01 ) ** 2 ) ) : 0 ) - T * 0.08 * Math.exp( - ( ( ( px + 0.02 - pz * 0.3 ) / 0.012 ) ** 2 ) ) } );
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
			lay( panel( roundRect( xh + x - 0.01, 0.012, 0.003, ( xh - x ) / 2, - z + 0.012, 2 ), { T: 0.001, R: 0.001, cell: 0.05, bottom: false } ).geo, M( s.stripes, { rough: 0.4, emissive: s.stripes, emissiveIntensity: 0.1 } ), 0.0006, ltop );
			if ( s.reflect ) for ( const px of [ - 0.07, - 0.03 ] ) {
				lay( panel( roundRect( 0.022, W - 0.03, 0.003, px, 0, 2 ), { T: 0.0012, R: 0.001, cell: 0.05, bottom: false } ).geo, M( s.stripes, { rough: 0.35, metal: 0.2, emissive: s.stripes, emissiveIntensity: 0.12 } ), 0.0009, ltop );
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
	if ( s.stripes && ! short ) lay( panel( roundRect( x - xh - 0.036, 0.012, 0.003, ( xh + x - 0.034 ) / 2, - z + 0.012, 2 ), { T: 0.001, R: 0.001, cell: 0.05, bottom: false } ).geo, M( s.stripes, { rough: 0.4 } ), 0.0006 );
	if ( s.suspenders ) for ( const pz of [ - 0.04, 0.05 ] ) add( g, buttonGeo( 0.006, 0.0025 ).translate( x - 0.016, wtop( x - 0.016, pz ), pz ), M( 0x2a2a2a, { rough: 0.4 } ) );
	return g;
}

export function registerClothingModels( reg ) {
	reg( 'shirt', foldedTop );

	reg( 'pants', foldedPants );

	// ---- a pair of shoes: { style: slippers|sneakers|boots|combat|rain|reef|work|dress|tabi|fins, color, color2, sole } ----
	reg( 'shoes', ( s ) => {
		const g = group(), style = s.style || 'sneakers';
		const upper = M( s.color ?? 0xdddddd, { rough: style === 'rain' ? 0.25 : style === 'dress' ? 0.3 : 0.8 } );
		const sole = M( s.sole ?? ( style === 'slippers' ? 0x2a2a2a : 0xeeeeee ), { rough: 0.9 } );
		const acc = M( s.color2 ?? shade( s.color ?? 0xdddddd, - 0.3 ), { rough: 0.7 } );
		const one = ( z, flip ) => {
			const L = style === 'fins' ? 0.5 : 0.27;
			if ( style === 'fins' ) {
				add( g, G.rbox( L, 0.012, 0.11, 0.005 ), M( s.color ?? 0x2a7ad6, { rough: 0.4 } ), [ 0.1, 0, z ] );
				add( g, G.rbox( 0.15, 0.05, 0.1, 0.02 ), M( s.color2 ?? 0x222222, { rough: 0.7 } ), [ - 0.05, 0.008, z ] );
				return;
			}
			const s0 = G.rbox( L, style === 'slippers' ? 0.018 : 0.025, 0.095, 0.02, 2 );
			add( g, s0, sole, [ 0, 0, z ] );
			if ( style === 'slippers' ) {
				// the thong: a toe post and two straps
				add( g, G.cyl( 0.004, 0.004, 0.02, 6 ), acc, [ 0.07, 0.018, z ] );
				for ( const k of [ - 1, 1 ] ) add( g, G.cylX( 0.005, 0.11, 6 ), acc, [ 0.03, 0.026, z + k * 0.025 ], [ 0, - k * 0.45 * ( flip ? - 1 : 1 ) * 0, k * 0.3 ] );
				add( g, G.box( 0.2, 0.003, 0.085 ), M( s.color ?? 0x3a7ad6, { rough: 0.8 } ), [ - 0.02, 0.018, z ] );
				return;
			}
			const tall = { boots: 0.14, combat: 0.18, rain: 0.3, work: 0.15, tabi: 0.12, firefighter: 0.3 }[ style ] || 0;
			const uH = style === 'reef' ? 0.05 : style === 'dress' ? 0.06 : 0.075;
			// the upper: half an ellipsoid standing on the sole (the origin stays at the bottom of the sole)
			const base = 0.02, rx = 0.126, rz = style === 'dress' ? 0.043 : 0.046, x0 = 0.01;
			add( g, G.dome( 0.07, 14, 7 ).scale( rx / 0.07, uH / 0.07, rz / 0.07 ), upper, [ x0, base, z ] );
			// the top of the upper at x (for laces and trims that sit on it)
			const topAt = ( x ) => base + uH * Math.sqrt( Math.max( 0, 1 - ( ( x - x0 ) / rx ) ** 2 ) );
			const side = flip ? - 1 : 1; // the outer side of this shoe
			if ( tall ) {
				// the shaft leans back a little and a heel counter joins it to the foot
				add( g, G.cyl( 0.046, 0.052, tall, 14 ), upper, [ - 0.075, base, z ], [ 0, 0, 0.1 ] );
				add( g, G.rbox( 0.1, 0.075, rz * 1.9, 0.02, 2 ), upper, [ - 0.065, base - 0.002, z ] );
				if ( style !== 'rain' && style !== 'firefighter' && style !== 'tabi' ) add( g, G.cyl( 0.05, 0.05, 0.018, 14, true ), acc, [ - 0.075 - Math.sin( 0.1 ) * tall, base + tall * Math.cos( 0.1 ) - 0.018, z ], [ 0, 0, 0.1 ] ); // collar
			}
			if ( style === 'sneakers' || style === 'combat' || style === 'boots' || style === 'work' ) {
				// laces across the top, a toe cap, a stripe along the sole
				const lace = M( s.laces ?? ( style === 'sneakers' ? 0xf5f5f5 : 0x2a2420 ) );
				for ( let i = 0; i < 4; i ++ ) { const x = 0.05 - i * 0.02; add( g, G.box( 0.006, 0.004, rz * 0.9 ), lace, [ x, topAt( x ) - 0.0015, z ], [ 0, 0, - 0.35 ] ); }
				add( g, G.dome( 0.05, 12, 5 ).scale( 0.8, 0.9, rz / 0.05 * 0.98 ), style === 'sneakers' ? sole : acc, [ 0.085, base, z ] );
				add( g, G.box( L * 0.9, 0.007, 0.003 ), acc, [ 0, 0.008, z + side * 0.0485 ] );
				if ( style === 'sneakers' ) add( g, G.box( 0.07, 0.01, 0.003 ), acc, [ 0, base + 0.012, z + side * rz * 0.97 ], [ 0, 0, 0.3 ] ); // side flash
			}
			if ( style === 'rain' || style === 'firefighter' ) add( g, G.torus( 0.048, 0.005, 5, 18 ), acc, [ - 0.075 - Math.sin( 0.1 ) * tall, base + tall * Math.cos( 0.1 ), z ], [ PI / 2, 0, 0.1 ] );
			if ( style === 'reef' ) add( g, G.box( 0.12, 0.004, rz * 1.6 ), acc, [ 0.02, topAt( 0.02 ) - 0.012, z ] );
		};
		one( - 0.06, false ); one( 0.06, true );
		return g;
	} );

	// ---- hats & helmets: { style, color, color2, visor } ----
	reg( 'hat', ( s ) => {
		const g = group(), style = s.style || 'cap', c = s.color ?? 0x3a5a8a;
		const mat = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: 1 } ) : M( c, { rough: /helmet|hardhat/.test( style ) ? 0.35 : 0.85, metal: s.metal ?? 0 } );
		const acc = M( s.color2 ?? shade( c, - 0.3 ), { rough: 0.6 } );
		switch ( style ) {
			case 'cap': case 'police_cap': {
				add( g, G.dome( 0.095, 16, 7 ).scale( 1, 0.75, 1 ), mat );
				const brim = G.cyl( 0.075, 0.075, 0.005, 16, false ); brim.scale( 1, 1, 0.9 );
				add( g, brim, acc, [ 0.095, 0.004, 0 ], [ 0, 0, 0.15 ] );
				add( g, G.cyl( 0.009, 0.009, 0.006, 8 ), acc, [ 0, 0.07, 0 ] );
				if ( style === 'police_cap' ) add( g, G.box( 0.004, 0.025, 0.02 ), MAT.gold(), [ 0.093, 0.035, 0 ], [ 0, 0, - 0.3 ] );
				if ( s.logo ) add( g, G.box( 0.004, 0.025, 0.04 ), M( s.logo ), [ 0.09, 0.03, 0 ], [ 0, 0, - 0.35 ] );
				break;
			}
			case 'bucket': case 'boonie': {
				add( g, G.cyl( 0.08, 0.095, 0.075, 16 ), mat, [ 0, 0.02, 0 ] );
				add( g, G.cyl( style === 'boonie' ? 0.15 : 0.13, 0.1, 0.03, 18, true ), mat, [ 0, 0, 0 ] );
				add( g, G.cyl( 0.097, 0.097, 0.012, 16, true ), acc, [ 0, 0.022, 0 ] );
				break;
			}
			case 'straw': case 'paniolo': {
				const straw = fabric( c ?? 0xd8b56a, 'weave', shade( c, 0.15 ), { color3: shade( c, - 0.15 ), rep: 3, rough: 0.9 } );
				add( g, G.cyl( 0.17, 0.17, 0.006, 22 ).scale( 1, 1, style === 'paniolo' ? 0.9 : 1 ), straw );
				add( g, G.cyl( 0.075, 0.09, 0.09, 18 ), straw, [ 0, 0.004, 0 ] );
				add( g, G.cyl( 0.092, 0.092, 0.018, 18, true ), M( s.color2 ?? 0x2a2a2a, { rough: 0.8 } ), [ 0, 0.008, 0 ] ); // hatband
				if ( style === 'paniolo' ) add( g, G.torus( 0.06, 0.009, 5, 14 ), M( 0xe8403a ), [ 0, 0.02, 0 ], [ PI / 2, 0, 0 ] );
				break;
			}
			case 'beanie': {
				add( g, G.dome( 0.09, 14, 7 ).scale( 1, 0.9, 1 ), s.print ? mat : fabric( c, 'knit', shade( c, - 0.2 ), { rep: 3 } ) );
				add( g, G.cyl( 0.093, 0.093, 0.035, 16, true ), acc );
				if ( s.pom ) add( g, G.sph( 0.022, 8, 6 ), acc, [ 0, 0.085, 0 ] );
				break;
			}
			case 'visor': {
				// headband open at the back, a curved bill over the forehead (+x)
				add( g, G.torus( 0.08, 0.012, 5, 18, PI * 1.3 ), mat, [ 0, 0.012, 0 ], [ PI / 2, 0, - PI * 0.65 ] );
				const bill = new THREE.CylinderGeometry( 0.09, 0.09, 0.005, 16, 1, false, 0, PI ).scale( 0.9, 1, 1.05 );
				add( g, bill, acc, [ 0.02, 0.004, 0 ], [ 0, 0, 0.12 ] );
				break;
			}
			case 'hardhat': {
				add( g, G.dome( 0.11, 16, 8 ).scale( 1.1, 0.9, 0.95 ), mat, [ 0, 0.012, 0 ] );
				add( g, G.cyl( 0.13, 0.13, 0.012, 18 ).scale( 1.1, 1, 1 ), mat );
				add( g, G.box( 0.2, 0.02, 0.02 ), mat, [ 0, 0.1, 0 ] );
				break;
			}
			case 'helmet_moto': {
				add( g, G.sph( 0.14, 18, 12 ).scale( 1.05, 0.95, 0.95 ), mat, [ 0, 0.12, 0 ] );
				const visor = G.sph( 0.143, 14, 8, - PI * 0.35, PI * 0.7, PI * 0.33, PI * 0.28 );
				visor.rotateY( PI / 2 );
				add( g, visor, M( s.visor ?? 0x1a1a22, { rough: 0.05, metal: 0.6 } ), [ 0, 0.12, 0 ], null, [ 1.06, 0.96, 0.96 ] );
				add( g, G.cyl( 0.12, 0.13, 0.03, 16, true ), MAT.rubber(), [ 0, 0.005, 0 ] );
				if ( s.stripe ) add( g, G.torus( 0.141, 0.006, 4, 24, PI ), M( s.stripe ), [ 0, 0.12, 0 ], [ 0, 0, PI / 2 ] );
				break;
			}
			case 'helmet_mil': {
				const shell = G.sph( 0.13, 16, 9, 0, PI * 2, 0, PI * 0.55 ); shell.scale( 1.08, 0.95, 1 );
				add( g, shell, s.print ? mat : M( c, { rough: 0.85 } ), [ 0, 0.01, 0 ] );
				add( g, G.box( 0.03, 0.04, 0.05 ), MAT.darkMetal(), [ 0.13, 0.07, 0 ], [ 0, 0, - 0.4 ] ); // NVG mount
				for ( const z of [ - 0.1, 0.1 ] ) add( g, G.box( 0.1, 0.012, 0.004 ), MAT.blackPlastic(), [ 0, 0.07, z * 1.05 ] ); // rails
				add( g, G.torus( 0.105, 0.005, 4, 20, PI ), M( 0x3a3a2a ), [ 0, 0.01, 0 ], [ - PI / 2, 0, PI / 2 ] ); // strap
				break;
			}
			case 'helmet_riot': {
				add( g, G.sph( 0.14, 16, 10, 0, PI * 2, 0, PI * 0.6 ).scale( 1.05, 1, 1 ), mat, [ 0, 0.02, 0 ] );
				const shield = G.sph( 0.16, 14, 6, - PI * 0.4, PI * 0.8, PI * 0.3, PI * 0.42 ); shield.rotateY( PI / 2 );
				add( g, shield, MAT.glass( 0xd8e8f0, 0.35 ), [ 0.01, 0.02, 0 ] );
				add( g, G.torus( 0.12, 0.007, 4, 16, PI * 0.6 ), MAT.blackPlastic(), [ 0, 0.1, 0 ], [ PI / 2, 0, - PI * 0.3 ] ); // visor hinge band, on the shell
				break;
			}
			case 'helmet_fire': {
				add( g, G.dome( 0.12, 16, 8 ).scale( 1, 1, 0.95 ), mat, [ 0, 0.02, 0 ] );
				const brim = G.cyl( 0.16, 0.18, 0.02, 20 ); brim.scale( 1.3, 1, 1 ); brim.translate( - 0.05, 0, 0 );
				add( g, brim, mat );
				add( g, G.box( 0.012, 0.09, 0.075 ), M( s.color2 ?? 0x2a2a2a, { rough: 0.5 } ), [ 0.11, 0.07, 0 ], [ 0, 0, - 0.35 ] ); // front shield
				add( g, G.box( 0.14, 0.02, 0.018 ), mat, [ 0, 0.13, 0 ] );
				break;
			}
			default: add( g, G.dome( 0.09, 14, 7 ), mat );
		}
		return ground( g );
	} );

	// ---- face: { style: bandana|surgical|gas|balaclava|respirator|n95, color, print } ----
	reg( 'mask', ( s ) => {
		const g = group(), c = s.color ?? 0xb02a2a;
		switch ( s.style ) {
			case 'bandana': {
				const t = G.prismX( 0.2, 0.012, 0.3 ); // a folded triangle lying flat
				add( g, G.rbox( 0.24, 0.012, 0.18, 0.004 ), fabric( c, s.print ?? 'paisley', s.color2 ?? 0xffffff, { rep: 1.2 } ) );
				t.dispose();
				add( g, G.box( 0.12, 0.004, 0.03 ), M( shade( c, - 0.2 ) ), [ 0.12, 0.004, 0.06 ], [ 0, 0.5, 0 ] );
				break;
			}
			case 'surgical': case 'n95': {
				const n95 = s.style === 'n95';
				const body = n95 ? G.dome( 0.06, 12, 6 ).scale( 1.1, 0.7, 1 ) : G.rbox( 0.17, 0.012, 0.09, 0.005 );
				add( g, body, M( c ?? 0x8ab8e0, { rough: 0.95 } ) );
				for ( const x of [ - 1, 1 ] ) add( g, G.torus( 0.035, 0.0015, 3, 14 ), M( 0xf5f5f5 ), [ x * ( n95 ? 0.07 : 0.1 ), 0.003, 0 ], [ PI / 2, 0, 0 ] );
				if ( ! n95 ) for ( let i = 0; i < 3; i ++ ) add( g, G.box( 0.168, 0.002, 0.003 ), M( shade( c, - 0.15 ) ), [ 0, 0.012, - 0.025 + i * 0.025 ] );
				break;
			}
			case 'gas': case 'respirator': {
				const rubber = M( c ?? 0x2a2a2a, { rough: 0.8 } );
				const face = G.sph( 0.09, 14, 9, 0, PI * 2, 0, PI / 2 ); face.scale( 1.1, 0.6, 0.9 );
				add( g, face, rubber );
				if ( s.style === 'gas' ) {
					for ( const z of [ - 0.035, 0.035 ] ) add( g, G.cyl( 0.024, 0.024, 0.01, 14 ), MAT.glass( 0x9ab8c0, 0.5 ), [ 0.02, 0.05, z ] );
					add( g, G.cyl( 0.035, 0.035, 0.045, 14 ), M( 0x5a5a4a, { rough: 0.5, metal: 0.5 } ), [ - 0.02, 0.035, 0 ], [ 0, 0, PI / 2 + 0.4 ] );
				} else for ( const z of [ - 0.05, 0.05 ] ) add( g, G.cyl( 0.028, 0.028, 0.02, 12 ), M( 0xd06a2a ), [ - 0.02, 0.03, z ], [ PI / 2, 0, 0 ] );
				add( g, G.torus( 0.08, 0.005, 4, 20, PI ), rubber, [ 0.02, 0.01, 0 ], [ PI / 2, 0, - PI / 2 ] );
				break;
			}
			default: { // balaclava / neck gaiter
				add( g, G.rbox( 0.24, 0.03, 0.17, 0.01 ), fabric( c ?? 0x1a1a1a, 'knit', shade( c ?? 0x1a1a1a, 0.15 ), { rep: 3 } ) );
				add( g, G.rbox( 0.08, 0.004, 0.04, 0.002 ), M( 0x080808 ), [ 0.05, 0.03, 0 ] );
			}
		}
		return ground( g );
	} );

	// ---- eyewear: { style: sun|aviator|ski|swim|dive|safety, color (frame), lens } ----
	reg( 'glasses', ( s ) => {
		const g = group(), frame = M( s.color ?? 0x1a1a1a, { rough: 0.3, metal: s.style === 'aviator' ? 0.9 : 0.1 } );
		const lens = M( s.lens ?? 0x1a1a22, { rough: 0.05, metal: 0.7, transparent: s.style === 'safety' || s.style === 'swim', opacity: 0.45 } );
		switch ( s.style ) {
			case 'ski': {
				// lying face up: a wide mirrored lens in a soft frame, the elastic strap looped behind
				add( g, G.rbox( 0.19, 0.028, 0.095, 0.02, 2 ), frame );
				add( g, G.rbox( 0.176, 0.008, 0.08, 0.018, 2 ), M( s.lens ?? 0xe08a2a, { rough: 0.08, metal: 0.85 } ), [ 0, 0.024, 0.002 ] );
				add( g, G.box( 0.03, 0.01, 0.012 ), frame, [ 0, 0.026, 0.044 ] ); // nose notch
				add( g, G.torus( 0.098, 0.006, 4, 24, PI ), M( s.strap ?? 0x2a2a2a, { rough: 0.9 } ), [ 0, 0.01, - 0.02 ], [ - PI / 2, 0, 0 ], [ 1, 0.9, 1 ] );
				break;
			}
			case 'dive': {
				const dive = true;
				const l = G.cyl( 0.045, 0.045, 0.04, 16 ); l.scale( dive ? 1.3 : 1.9, 1, 1 ); l.rotateZ( PI / 2 );
				add( g, l, dive ? MAT.glass( 0xd8eef5, 0.35 ) : M( s.lens ?? 0xe08a2a, { rough: 0.05, metal: 0.8 } ), [ 0, 0.045, 0 ] );
				add( g, G.torus( 0.07, 0.009, 5, 22, PI ), dive ? M( 0x1a1a1a, { rough: 0.6 } ) : frame, [ - 0.02, 0.045, 0 ], [ 0, PI / 2, 0 ], [ 1, 1, 1 ] );
				add( g, G.torus( 0.08, 0.006, 4, 22, PI ), M( s.strap ?? 0x2a2a2a ), [ - 0.02, 0.01, 0 ], [ PI / 2, 0, PI / 2 ] );
				if ( dive ) add( g, G.cyl( 0.009, 0.009, 0.35, 8 ), M( 0x2a8ad6, { rough: 0.5 } ), [ - 0.02, 0.01, 0.06 ], [ 0, 0, PI / 2 - 0.2 ] ); // snorkel
				break;
			}
			case 'swim': {
				for ( const z of [ - 0.022, 0.022 ] ) { add( g, G.sph( 0.02, 10, 6, 0, PI * 2, 0, PI / 2 ), lens, [ 0, 0, z ], [ 0, 0, - PI / 2 ] ); }
				add( g, G.torus( 0.06, 0.003, 3, 18, PI * 1.6 ), M( s.strap ?? 0x2a6ad6 ), [ - 0.06, 0.004, 0 ], [ PI / 2, 0, 0 ] );
				break;
			}
			default: {
				const av = s.style === 'aviator';
				for ( const z of [ - 0.034, 0.034 ] ) {
					const lg = G.cyl( 0.025, 0.025, 0.004, 16 ); lg.scale( 1, 1, av ? 1.2 : 1.15 ); lg.rotateZ( PI / 2 );
					add( g, lg, lens, [ 0.07, 0.028, z ] );
					if ( ! av ) add( g, G.torus( 0.025, 0.003, 4, 16 ), frame, [ 0.07, 0.028, z ], [ 0, PI / 2, 0 ], [ 1, 1, 1.15 ] );
				}
				add( g, G.box( 0.004, 0.004, 0.022 ), frame, [ 0.07, 0.04, 0 ] );
				for ( const z of [ - 0.065, 0.065 ] ) add( g, G.box( 0.14, 0.004, 0.003 ), frame, [ 0.0, 0.034, z ], [ 0, 0, 0.08 ] );
			}
		}
		return ground( g );
	} );

	// ---- vests: { style: plate|rig|hunting|fishing|hivis|life|press, color, color2, print } ----
	reg( 'vest', ( s ) => {
		const g = group(), c = s.color ?? 0x3a3f2a, style = s.style || 'plate';
		const mat = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: 1.2 } ) : M( c, { rough: 0.85 } );
		const acc = M( s.color2 ?? shade( c, - 0.3 ), { rough: 0.8 } );
		const T = style === 'plate' ? 0.07 : style === 'life' ? 0.08 : style === 'rig' ? 0.05 : 0.035;
		add( g, G.rbox( 0.36, T, 0.3, 0.015 ), mat );
		if ( style === 'plate' || style === 'rig' ) {
			// magazine pouches across the front
			for ( let i = 0; i < 3; i ++ ) add( g, G.rbox( 0.07, 0.035, 0.085, 0.006, 1 ), mat, [ - 0.02, T, - 0.09 + i * 0.09 ] );
			for ( let i = 0; i < 6; i ++ ) add( g, G.box( 0.008, 0.004, 0.28 ), acc, [ 0.1 - i * 0.025, T + ( i < 3 ? 0.035 : 0 ), 0 ] ); // MOLLE
			if ( s.patch ) add( g, G.box( 0.05, 0.003, 0.14 ), M( s.patch, { rough: 0.6 } ), [ 0.13, T, 0 ] );
		}
		if ( style === 'hunting' || style === 'fishing' ) {
			const n = style === 'fishing' ? 6 : 2;
			for ( let i = 0; i < n; i ++ ) add( g, G.rbox( 0.06, 0.012, 0.06, 0.004, 1 ), acc, [ 0.08 - Math.floor( i / 2 ) * 0.08, T, i % 2 ? 0.08 : - 0.08 ] );
		}
		if ( style === 'hivis' || s.stripes ) for ( const x of [ - 0.07, 0.05 ] ) add( g, G.box( 0.025, 0.003, 0.3 ), M( 0xd8d8d8, { rough: 0.2, metal: 0.6, emissive: 0x666666, emissiveIntensity: 0.3 } ), [ x, T, 0 ] );
		if ( style === 'life' ) for ( const z of [ - 0.08, 0.08 ] ) add( g, G.box( 0.3, 0.008, 0.02 ), M( 0x1a1a1a ), [ 0, T, z ] );
		// shoulder straps (+x is the top)
		for ( const z of [ - 0.09, 0.09 ] ) add( g, G.rbox( 0.08, T * 0.6, 0.05, 0.006, 1 ), mat, [ 0.2, 0, z ] );
		if ( s.text ) add( g, G.box( 0.05, 0.002, 0.16 ), M( 0xffffff, { map: null } ), [ - 0.12, T, 0 ] );
		return g;
	} );

	// ---- a pair of gloves: { color, style: work|tactical|latex|fingerless|fire|dive } ----
	reg( 'gloves', ( s ) => {
		const g = group(), m = M( s.color ?? 0x8a6a3a, { rough: s.style === 'latex' ? 0.4 : 0.85 } );
		const cuff = M( s.color2 ?? shade( s.color ?? 0x8a6a3a, - 0.25 ), { rough: 0.8 } );
		for ( const [ z, flip ] of [ [ - 0.055, 1 ], [ 0.055, - 1 ] ] ) {
			add( g, G.rbox( 0.1, 0.022, 0.085, 0.008, 1 ), m, [ 0, 0, z ] );
			const fl = s.style === 'fingerless' ? 0.025 : 0.07;
			for ( let i = 0; i < 4; i ++ ) add( g, G.capsX( 0.009, fl, 6, 2 ), m, [ 0.05 + fl / 2, 0.011, z - 0.03 + i * 0.02 ] );
			add( g, G.capsX( 0.01, 0.06, 6, 2 ), m, [ 0.02, 0.011, z + flip * 0.05 ], [ 0, flip * 0.7, 0 ] );
			add( g, G.rbox( 0.05, 0.026, 0.09, 0.008, 1 ), cuff, [ - 0.07, 0, z ] );
		}
		return g;
	} );

	// ---- belts: { color, holster, pouches, tools } ----
	reg( 'belt', ( s ) => {
		const g = group(), m = M( s.color ?? 0x3a2616, { rough: 0.6 } );
		const loop = G.torus( 0.13, 0.017, 4, 28 ); loop.scale( 1, 0.62, 0.35 ); loop.rotateX( PI / 2 );
		add( g, loop, m, [ 0, 0.006, 0 ] );
		add( g, G.box( 0.012, 0.04, 0.05 ), M( s.buckle ?? 0xb8b8b8, { rough: 0.25, metal: 0.95 } ), [ 0.13, 0, 0 ] );
		if ( s.holster ) add( g, G.rbox( 0.06, 0.035, 0.14, 0.01 ), MAT.blackPlastic(), [ - 0.08, 0.004, 0.02 ], [ 0, 0.4, 0 ] );
		if ( s.pouches ) for ( let i = 0; i < s.pouches; i ++ ) { const a = 0.4 + i * 0.7; add( g, G.rbox( 0.05, 0.035, 0.04, 0.006 ), M( s.color2 ?? 0x2a2a22, { rough: 0.8 } ), [ Math.cos( a ) * 0.12, 0.004, Math.sin( a ) * 0.075 ], [ 0, - a, 0 ] ); }
		if ( s.tools ) { add( g, G.box( 0.1, 0.012, 0.012 ), MAT.metal(), [ - 0.05, 0.03, - 0.07 ], [ 0, 0.3, 0 ] ); add( g, G.cylX( 0.008, 0.16, 6 ), M( 0xe0a020 ), [ 0.02, 0.03, 0.07 ], [ 0, - 0.2, 0 ] ); }
		return g;
	} );

	// ---- backpacks & bags: { style, color, color2, print } ----
	reg( 'backpack', ( s ) => {
		const g = group(), c = s.color ?? 0x2a4a6a, style = s.style || 'school';
		const mat = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: 1.2 } ) : M( c, { rough: style === 'dry' ? 0.35 : 0.85 } );
		const acc = M( s.color2 ?? shade( c, - 0.3 ), { rough: 0.8 } );
		const zip = M( 0x1a1a1a, { rough: 0.4, metal: 0.5 } );
		switch ( style ) {
			case 'duffel': {
				add( g, G.capsX( 0.14, 0.62, 14 ), mat, [ 0, 0.14, 0 ] );
				add( g, G.box( 0.46, 0.004, 0.008 ), zip, [ 0, 0.28, 0 ] );
				for ( const x of [ - 0.08, 0.08 ] ) add( g, G.torus( 0.05, 0.008, 4, 12, PI ), acc, [ x, 0.275, 0 ], [ 0, PI / 2, 0 ] );
				for ( const x of [ - 0.2, 0.2 ] ) add( g, G.cylX( 0.142, 0.03, 14 ), acc, [ x, 0.14, 0 ] );
				break;
			}
			case 'dry': {
				add( g, G.cylX( 0.1, 0.34, 16 ), mat, [ 0, 0.1, 0 ] );
				add( g, G.cylX( 0.1, 0.08, 16, 0.02 ), mat, [ 0.21, 0.1, 0 ] );
				add( g, G.box( 0.04, 0.02, 0.14 ), acc, [ 0.26, 0.1, 0 ] );
				add( g, G.cylX( 0.102, 0.02, 16 ), M( 0x1a1a1a ), [ - 0.12, 0.1, 0 ] );
				break;
			}
			case 'fanny': {
				add( g, G.capsX( 0.055, 0.25, 12 ).scale( 1, 1, 0.6 ), mat, [ 0, 0.055, 0 ] );
				add( g, G.box( 0.2, 0.003, 0.004 ), zip, [ 0, 0.11, 0.01 ] );
				add( g, G.torus( 0.18, 0.008, 3, 24, PI ), acc, [ 0, 0.005, - 0.02 ], [ PI / 2, 0, PI ] );
				add( g, G.box( 0.03, 0.012, 0.04 ), MAT.blackPlastic(), [ 0, 0.005, - 0.2 ] );
				break;
			}
			case 'cooler': {
				add( g, G.rbox( 0.36, 0.26, 0.24, 0.03 ), mat );
				add( g, G.rbox( 0.37, 0.04, 0.25, 0.02 ), acc, [ 0, 0.25, 0 ] );
				add( g, G.box( 0.3, 0.004, 0.004 ), zip, [ 0, 0.26, 0.125 ] );
				add( g, G.torus( 0.16, 0.01, 4, 16, PI ), acc, [ 0, 0.29, 0 ], [ 0, 0, 0 ] );
				add( g, G.box( 0.2, 0.08, 0.004 ), M( 0xffffff, { rough: 0.5 } ), [ 0, 0.1, 0.121 ] );
				break;
			}
			case 'improvised': {
				// a tarp gathered into a lumpy sack, tied off with rope that doubles as the shoulder strap
				const sack = G.sph( 0.2, 14, 10 );
				const P = sack.attributes.position;
				for ( let i = 0; i < P.count; i ++ ) {
					const x = P.getX( i ), y = P.getY( i ), z = P.getZ( i );
					const k = 1 + Math.sin( x * 31 + z * 17 ) * 0.06 + Math.sin( y * 23 - x * 13 ) * 0.05;
					P.setXYZ( i, x * k * 1.15, y * k * ( y > 0 ? 0.75 : 0.55 ), z * k * 0.8 );
				}
				sack.computeVertexNormals();
				add( g, sack, mat, [ 0, 0.11, 0 ] );
				add( g, G.cone( 0.07, 0.12, 10 ), mat, [ 0.2, 0.08, 0 ], [ 0, 0, - PI / 2 ] ); // the gathered neck
				const rope = M( s.color2 ?? 0xc8b07a, { rough: 0.95 } );
				add( g, G.torus( 0.045, 0.01, 5, 14 ), rope, [ 0.215, 0.08, 0 ], [ 0, PI / 2, 0 ] );
				add( g, G.torus( 0.2, 0.009, 4, 20, PI * 1.1 ), rope, [ 0.02, 0.1, 0 ], [ PI / 2, 0, 0.1 ] );
				return ground( g );
			}
			case 'tote': {
				add( g, G.cyl( 0.2 * Math.SQRT1_2 * 1.1, 0.2 * Math.SQRT1_2, 0.3, 4, false ).rotateY( PI / 4 ).scale( 1.6, 1, 0.5 ), mat );
				for ( const z of [ - 0.05, 0.05 ] ) add( g, G.torus( 0.08, 0.008, 4, 14, PI ), acc, [ 0, 0.3, z ] );
				break;
			}
			default: { // school | hiking | rucksack | assault | improvised | medic
				const big = style === 'hiking' ? 1.2 : style === 'rucksack' ? 1.3 : style === 'assault' ? 0.95 : style === 'improvised' ? 0.9 : 1;
				const H = 0.44 * big, W = 0.3 * big, D = 0.18 * big;
				add( g, G.rbox( W, H, D, 0.05 * big ), mat );
				add( g, G.rbox( W * 0.75, H * 0.4, D * 0.35, 0.03 ), mat, [ 0, H * 0.08, D * 0.55 ] ); // front pocket
				add( g, G.box( W * 0.6, 0.004, 0.004 ), zip, [ 0, H * 0.46, D * 0.72 ] );
				add( g, G.dome( W * 0.5, 12, 5 ).scale( 1, 0.45, D / W * 1.1 ), acc, [ 0, H - 0.02, 0.005 ] ); // lid
				for ( const x of [ - W * 0.28, W * 0.28 ] ) add( g, G.rbox( 0.05, H * 0.8, 0.02, 0.008, 1 ), M( 0x1c1c1c, { rough: 0.8 } ), [ x, H * 0.08, - D / 2 - 0.008 ] ); // straps
				add( g, G.torus( 0.035, 0.007, 4, 12, PI ), M( 0x1c1c1c ), [ 0, H + 0.005, - D * 0.2 ], [ 0, 0, 0 ] ); // grab handle
				if ( style === 'hiking' || style === 'rucksack' ) {
					for ( const x of [ - W / 2 - 0.02, W / 2 + 0.02 ] ) add( g, G.rbox( 0.05, H * 0.35, D * 0.6, 0.01, 1 ), acc, [ x, H * 0.05, 0 ] );
					add( g, G.cylX( 0.06 * big, W * 1.05, 12 ), M( s.roll ?? 0x3a6a3a, { rough: 0.8 } ), [ 0, 0.06 * big, D * 0.55 ] ); // bedroll
				}
				if ( style === 'rucksack' || style === 'assault' ) for ( let i = 0; i < 4; i ++ ) add( g, G.box( W * 0.7, 0.008, 0.006 ), acc, [ 0, H * ( 0.55 + i * 0.08 ), D * 0.5 ] );
				if ( style === 'medic' ) add( g, G.box( 0.08, 0.08, 0.004 ), M( 0xd02a2a ), [ 0, H * 0.72, D * 0.5 ] );
				// it stands upright, front pocket towards +z, so the pocket, lid and side pockets read at a glance
				return ground( g );
			}
		}
		return g;
	} );
}
