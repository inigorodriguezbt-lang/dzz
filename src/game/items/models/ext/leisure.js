// Model builders for the leisure items (docs/ITEMS_PLAN.md "leisure"). register( reg ) is called once by
// render/ItemModels.js with registerModelBuilder. Real-world sizes in metres, origin at the centre of the bottom, long
// axis along +x (lib.js conventions); printed faces are canvas textures on a plane over the top face, the art's top
// edge towards -z (away from a camera looking down from +z).
//   reading: a glossy magazine (masthead, cover art, issue strip); the books reuse the catalogue's 'book'
//   games and toys: playing cards and hanafuda (a tuck box and a fan of cards), dice, a kōnane board set with lava and
//     coral pebbles, a harmonica, a yo-yo, a puzzle cube, a handheld game, a frisbee, a bodyboard, a surfboard, a plush
//     honu
//   vices: a cigarette pack and carton, a cigar, rolled cigarettes, rolling papers, a chewing tobacco tin, a vape pen,
//     a hip flask
//   keepsakes: a snow globe of Waikīkī, a hula dashboard figure, a koa bowl, a Niʻihau shell lei, a whale tooth
//     pendant, a quarter set, a surf trophy, a vintage surf poster (and its upright look on display), a signed
//     baseball, a vinyl record, a pocket watch, gold coins, a luxury watch
//   seasonal: a party popper, glow bracelets
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, MAT, G, PI, add, group, ground, canvasTex, css, shade, glyph, fabric } from '../lib.js';
import { LEIS } from '../../ext/leisure/decor.js';

// ---- small helpers ------------------------------------------------------------------------------------------------

function rng( seed ) {
	let s = ( seed >>> 0 ) || 7;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; };
}
// fit a line of text into a width (the label helper's, for our own canvases)
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
// a printed face over the top of a part: a plane (w along x, d along z) at height y
function top( g, w, d, y, mat, p = [ 0, 0, 0 ] ) {
	const geo = new THREE.PlaneGeometry( w, d ).rotateX( - PI / 2 );
	return add( g, geo, mat, [ p[ 0 ], y + 0.0004, p[ 2 ] ] );
}
const tex = ( key, w, h, draw ) => M( 0xffffff, { map: canvasTex( 'leis:' + key, w, h, draw ), rough: 0.55 } );
const glossy = ( key, w, h, draw ) => M( 0xffffff, { map: canvasTex( 'leis:' + key, w, h, draw ), rough: 0.25 } );
// a heart and a spade for the cards
function suit( ctx, kind, x, y, s, color ) {
	ctx.save(); ctx.translate( x, y ); ctx.fillStyle = color; ctx.beginPath();
	if ( kind === 'heart' ) {
		ctx.moveTo( 0, s * 0.35 ); ctx.bezierCurveTo( - s * 0.6, - s * 0.05, - s * 0.3, - s * 0.5, 0, - s * 0.2 ); ctx.bezierCurveTo( s * 0.3, - s * 0.5, s * 0.6, - s * 0.05, 0, s * 0.35 );
	} else {
		ctx.moveTo( 0, - s * 0.4 ); ctx.bezierCurveTo( s * 0.6, s * 0.05, s * 0.3, s * 0.4, 0, s * 0.15 ); ctx.bezierCurveTo( - s * 0.3, s * 0.4, - s * 0.6, s * 0.05, 0, - s * 0.4 );
		ctx.moveTo( 0, s * 0.1 ); ctx.lineTo( s * 0.12, s * 0.42 ); ctx.lineTo( - s * 0.12, s * 0.42 );
	}
	ctx.fill(); ctx.restore();
}
// a rounded-rectangle outline in the xz plane, as a shape (x right, y = -z)
function roundRect( w, d, r ) {
	const s = new THREE.Shape(), x0 = - w / 2, y0 = - d / 2;
	s.moveTo( x0 + r, y0 ); s.lineTo( x0 + w - r, y0 ); s.quadraticCurveTo( x0 + w, y0, x0 + w, y0 + r ); s.lineTo( x0 + w, y0 + d - r );
	s.quadraticCurveTo( x0 + w, y0 + d, x0 + w - r, y0 + d ); s.lineTo( x0 + r, y0 + d ); s.quadraticCurveTo( x0, y0 + d, x0, y0 + d - r ); s.lineTo( x0, y0 + r );
	s.quadraticCurveTo( x0, y0, x0 + r, y0 );
	return s;
}
// a flat slab from an outline (shape in x / -z), thickness h, bevelled, lying on y = 0
function slab( shape, h, bevel = 0, seg = 3 ) {
	const geo = new THREE.ExtrudeGeometry( shape, { depth: h - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 12 } );
	geo.rotateX( - PI / 2 );
	geo.translate( 0, bevel, 0 );
	return geo;
}
// planar UVs over the xz bounds (for a slab's top art)
function planarUV( geo ) {
	geo.computeBoundingBox();
	const bb = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
	for ( let i = 0; i < p.count; i ++ ) uv.setXY( i, ( p.getX( i ) - bb.min.x ) / ( bb.max.x - bb.min.x ), 1 - ( p.getZ( i ) - bb.min.z ) / ( bb.max.z - bb.min.z ) );
	uv.needsUpdate = true;
	return geo;
}
// an extruded slab's faces by material group: [ caps (top and bottom), sides ] (ExtrudeGeometry is non-indexed), so
// each part takes its own material (the item instancer merges per material, not per group)
function splitGroups( geo ) {
	const parts = [];
	for ( const gr of geo.groups ) {
		const sub = new THREE.BufferGeometry();
		for ( const name in geo.attributes ) {
			const a = geo.attributes[ name ], n = a.itemSize;
			sub.setAttribute( name, new THREE.BufferAttribute( a.array.slice( gr.start * n, ( gr.start + gr.count ) * n ), n ) );
		}
		( parts[ gr.materialIndex ] ||= [] ).push( sub );
	}
	geo.dispose();
	return parts.map( list => list.length > 1 ? mergeGeometries( list ) : list[ 0 ] );
}
// lay a group built standing (y up) onto its side, long axis along x
function onSide( g, rz = - PI / 2 ) {
	const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
	inner.rotation.z = rz; g.add( inner );
	return ground( g );
}
// wood with a figure: koa's curly grain, warm and glossy
function koaTex( key, base = 0x8a4a22 ) {
	return canvasTex( 'leis:koa:' + key, 256, 256, ( ctx, W, H ) => {
		ctx.fillStyle = css( base ); ctx.fillRect( 0, 0, W, H );
		const r = rng( 41 );
		for ( let i = 0; i < 70; i ++ ) {
			const y = r() * H, a = 0.12 + r() * 0.2;
			ctx.strokeStyle = r() < 0.5 ? `rgba(40,16,4,${a})` : `rgba(230,150,80,${a * 0.7})`; ctx.lineWidth = 1 + r() * 3;
			ctx.beginPath(); for ( let x = 0; x <= W; x += 8 ) ctx.lineTo( x, y + Math.sin( x * 0.05 + i ) * 6 + Math.sin( x * 0.21 + i * 3 ) * 2 ); ctx.stroke();
		}
		// the chatoyant curl: soft light bands across the grain
		for ( let x = 0; x < W; x += 18 ) { ctx.fillStyle = `rgba(255,200,140,${0.05 + r() * 0.06})`; ctx.fillRect( x, 0, 7, H ); }
	}, { repeat: true } );
}

export function register( reg ) {
	// ================= reading =================
	// a glossy magazine: masthead across the top, a big cover picture, a strip of cover lines, the issue and a barcode
	reg( 'leis_mag', ( s ) => {
		const g = group(), w = 0.276, d = 0.21, h = 0.004;
		const key = `mag:${s.title}:${s.bg}:${s.art}:${s.artColor}:${s.fg}`;
		const cover = glossy( key, 512, 390, ( ctx, W, H ) => {
			const bg = css( s.bg ?? 0x1a6ab8 );
			ctx.fillStyle = bg; ctx.fillRect( 0, 0, W, H );
			// a lighter wash behind the picture
			const gr = ctx.createLinearGradient( 0, H * 0.25, 0, H );
			gr.addColorStop( 0, css( shade( s.bg ?? 0x1a6ab8, 0.25 ) ) ); gr.addColorStop( 1, bg );
			ctx.fillStyle = gr; ctx.fillRect( 0, H * 0.24, W, H * 0.76 );
			glyph( ctx, s.art || 'star', W * 0.64, H * 0.6, H * 0.62, css( s.artColor ?? 0xffffff ), bg );
			// the masthead
			text( ctx, s.title, W * 0.5, H * 0.13, W * 0.92, H * 0.2, s.fg ?? 0xffffff, { stroke: shade( s.bg ?? 0x1a6ab8, - 0.5 ), lw: 5 } );
			ctx.fillStyle = css( s.accent ?? 0xf2c21a ); ctx.fillRect( W * 0.04, H * 0.26, W * 0.92, H * 0.012 );
			// cover lines down the left
			text( ctx, ( s.sub || '' ).toUpperCase(), W * 0.05, H * 0.36, W * 0.5, H * 0.07, s.accent ?? 0xf2c21a, { align: 'left' } );
			ctx.fillStyle = 'rgba(255,255,255,0.75)';
			for ( let i = 0; i < 4; i ++ ) ctx.fillRect( W * 0.05, H * ( 0.46 + i * 0.08 ), W * ( 0.22 + ( i % 2 ) * 0.1 ), H * 0.025 );
			// the issue and a barcode
			ctx.fillStyle = '#ffffff'; ctx.fillRect( W * 0.05, H * 0.82, W * 0.14, H * 0.13 );
			ctx.fillStyle = '#111111'; const r = rng( 9 );
			for ( let x = W * 0.06; x < W * 0.18; x += 2 + Math.floor( r() * 3 ) ) ctx.fillRect( x, H * 0.84, 1 + Math.floor( r() * 2 ), H * 0.09 );
			text( ctx, 'No. 7 · $4.99', W * 0.95, H * 0.94, W * 0.4, H * 0.05, 0xffffff, { align: 'right', weight: 'bold' } );
		} );
		add( g, G.box( w * 0.99, h * 0.92, d * 0.985 ), M( 0xf2f0ea, { rough: 0.85 } ), [ 0.001, 0, 0 ] );
		top( g, w, d, h * 0.92, cover );
		// the spine and the back cover
		add( g, G.box( 0.002, h, d ), M( s.bg ?? 0x1a6ab8, { rough: 0.35 } ), [ - w / 2, 0, 0 ] );
		add( g, G.box( w, 0.0005, d ), M( s.bg ?? 0x1a6ab8, { rough: 0.35 } ) );
		return g;
	} );

	// ================= cards and games =================
	// a tuck box and a fan of cards beside it: a red-backed poker deck, or hanafuda's small stiff flower cards
	reg( 'leis_cards', ( s ) => {
		const g = group(), hana = s.style === 'hanafuda';
		const cw = hana ? 0.054 : 0.089, cd = hana ? 0.034 : 0.064, ct = hana ? 0.0011 : 0.0004;
		const back = canvasTex( 'leis:cardback:' + ( hana ? 'h' : 'c' ), 128, 192, ( ctx, W, H ) => {
			ctx.fillStyle = hana ? '#1a1a1a' : '#ffffff'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = hana ? '#8a1a1a' : '#b8202a'; ctx.fillRect( 8, 8, W - 16, H - 16 );
			if ( ! hana ) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; for ( let i = - H; i < W + H; i += 12 ) { ctx.beginPath(); ctx.moveTo( i, 8 ); ctx.lineTo( i + H, H ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( i + H, 8 ); ctx.lineTo( i, H ); ctx.stroke(); } }
		} );
		// the faces: an ace of spades, a king of hearts, a queen; or pine with the crane, a plum, the moon over grass
		const faces = hana ? [ 'pine', 'plum', 'moon' ] : [ 'as', 'kh', 'qh' ];
		const faceMat = ( f ) => M( 0xffffff, { rough: 0.5, map: canvasTex( 'leis:card:' + f, 128, 192, ( ctx, W, H ) => {
			ctx.fillStyle = hana ? '#f2ead8' : '#fbfbf8'; ctx.fillRect( 0, 0, W, H );
			if ( hana ) {
				ctx.fillStyle = '#1a1a1a'; ctx.fillRect( 0, 0, W, 6 ); ctx.fillRect( 0, H - 6, W, 6 ); ctx.fillRect( 0, 0, 6, H ); ctx.fillRect( W - 6, 0, 6, H );
				if ( f === 'pine' ) { ctx.fillStyle = '#c02020'; ctx.beginPath(); ctx.arc( W * 0.5, H * 0.3, W * 0.3, 0, PI * 2 ); ctx.fill(); ctx.fillStyle = '#1a4a1a'; for ( let i = 0; i < 5; i ++ ) { ctx.beginPath(); ctx.ellipse( W * ( 0.2 + i * 0.15 ), H * ( 0.62 + ( i % 2 ) * 0.08 ), W * 0.16, H * 0.06, 0, 0, PI * 2 ); ctx.fill(); } ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse( W * 0.55, H * 0.82, W * 0.22, H * 0.06, - 0.4, 0, PI * 2 ); ctx.fill(); }
				else if ( f === 'plum' ) { ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo( 10, H * 0.9 ); ctx.quadraticCurveTo( W * 0.5, H * 0.4, W - 10, H * 0.2 ); ctx.stroke(); for ( let i = 0; i < 7; i ++ ) glyph( ctx, 'flower', W * ( 0.2 + ( i * 37 % 60 ) / 100 ), H * ( 0.2 + ( i * 23 % 60 ) / 100 ), 26, '#e02a4a', '#f2c21a' ); }
				else { ctx.fillStyle = '#c02020'; ctx.fillRect( 6, 6, W - 12, H * 0.55 ); ctx.fillStyle = '#f2ead8'; ctx.beginPath(); ctx.arc( W * 0.5, H * 0.35, W * 0.28, 0, PI * 2 ); ctx.fill(); ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo( 6, H * 0.6 ); for ( let x = 6; x <= W - 6; x += 10 ) ctx.lineTo( x, H * ( 0.6 - ( x / 10 % 2 ) * 0.08 ) ); ctx.lineTo( W - 6, H - 6 ); ctx.lineTo( 6, H - 6 ); ctx.fill(); }
				return;
			}
			const red = f[ 1 ] === 'h', col = red ? '#c0141e' : '#111111', sk = red ? 'heart' : 'spade';
			text( ctx, f[ 0 ].toUpperCase(), 18, 22, 30, 30, col, { weight: 'bold' } );
			suit( ctx, sk, 18, 48, 22, col );
			if ( f[ 0 ] === 'a' ) suit( ctx, sk, W / 2, H / 2, 70, col );
			else { ctx.fillStyle = red ? '#e8c040' : '#3a5ab8'; ctx.fillRect( 30, 40, W - 60, H - 80 ); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect( 30, 40, W - 60, H - 80 ); suit( ctx, sk, W / 2, H / 2, 40, col ); }
		} ) } );
		// the box (card back art on top, a label band)
		const bw = cw + 0.004, bd = cd + 0.003, bh = hana ? 0.024 : 0.019;
		add( g, G.box( bw, bh, bd ), M( hana ? 0x1a1a1a : 0xf2f2f0, { rough: 0.5 } ), [ - cw * 0.35, 0, - cd * 0.25 ] );
		const label = M( 0xffffff, { rough: 0.45, map: canvasTex( 'leis:cardbox:' + ( hana ? 'h' : 'c' ), 256, 180, ( ctx, W, H ) => {
			ctx.fillStyle = hana ? '#1a1a1a' : '#b8202a'; ctx.fillRect( 0, 0, W, H );
			if ( hana ) { ctx.fillStyle = '#c02020'; ctx.fillRect( W * 0.32, 0, W * 0.36, H ); glyph( ctx, 'flower', W * 0.5, H * 0.32, 60, '#f2ead8', '#f2c21a' ); text( ctx, 'HANAFUDA', W * 0.5, H * 0.75, W * 0.34, 26, 0xf2ead8 ); }
			else { ctx.fillStyle = '#ffffff'; ctx.fillRect( 10, 10, W - 20, H - 20 ); ctx.fillStyle = '#b8202a'; ctx.fillRect( 18, 18, W - 36, H - 36 ); suit( ctx, 'spade', W / 2, H * 0.4, 70, '#ffffff' ); text( ctx, 'ACES HIGH', W / 2, H * 0.8, W * 0.7, 26, 0xffffff ); }
		} ) } );
		top( g, bw, bd, bh, label, [ - cw * 0.35, 0, - cd * 0.25 ] );
		// the fan, fanned out to the front right
		faces.forEach( ( f, i ) => {
			const c = group();
			add( c, G.box( cw, ct, cd ), M( 0xffffff, { map: back, rough: 0.5 } ) );
			top( c, cw, cd, ct, faceMat( f ) );
			c.position.set( cw * 0.35 + i * cw * 0.12, i * ct * 1.2, cd * 0.32 + i * cd * 0.05 );
			c.rotation.y = 0.35 - i * 0.28;
			g.add( c );
		} );
		return ground( g );
	} );

	// two white dice with black pips (a red one-pip), rounded corners
	reg( 'leis_dice', () => {
		const g = group(), a = 0.016, pip = M( 0x111111, { rough: 0.4 } ), red = M( 0xc0141e, { rough: 0.4 } ), body = M( 0xf6f4ee, { rough: 0.25 } );
		const PIPS = { 1: [ [ 0, 0 ] ], 2: [ [ - 1, - 1 ], [ 1, 1 ] ], 3: [ [ - 1, - 1 ], [ 0, 0 ], [ 1, 1 ] ], 4: [ [ - 1, - 1 ], [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ] ],
			5: [ [ - 1, - 1 ], [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ 0, 0 ] ], 6: [ [ - 1, - 1 ], [ - 1, 0 ], [ - 1, 1 ], [ 1, - 1 ], [ 1, 0 ], [ 1, 1 ] ] };
		const die = ( faces, pos, ry ) => {
			const d = group();
			add( d, G.rbox( a, a, a, 0.0028, 3 ), body );
			const q = a * 0.27, r = a * 0.085, e = a / 2 + 0.0003;
			// faces: top (+y), front (+z), right (+x)
			const put = ( n, map ) => { for ( const [ u, v ] of PIPS[ n ] ) { const m = n === 1 ? red : pip; add( d, G.cyl( r * ( n === 1 ? 1.5 : 1 ), r * ( n === 1 ? 1.5 : 1 ), 0.0006, 10 ), m, map( u * q, v * q ), map.rot ); } };
			const topMap = ( u, v ) => [ u, a + 0.0001 - 0.0005, v ]; topMap.rot = null;
			const frontMap = ( u, v ) => [ u, a / 2 + v, e - 0.0003 ]; frontMap.rot = [ PI / 2, 0, 0 ];
			const rightMap = ( u, v ) => [ e - 0.0003, a / 2 + v, u ]; rightMap.rot = [ 0, 0, - PI / 2 ];
			put( faces[ 0 ], topMap ); put( faces[ 1 ], frontMap ); put( faces[ 2 ], rightMap );
			d.position.set( ...pos ); d.rotation.y = ry;
			g.add( d );
		};
		die( [ 5, 3, 1 ], [ - 0.011, 0, 0 ], 0.3 );
		die( [ 6, 2, 4 ], [ 0.012, 0, 0.006 ], - 0.5 );
		return g;
	} );

	// kōnane: a koa board with an 8 x 8 grid of hollows, set with black lava and white coral pebbles alternately
	reg( 'leis_konane', () => {
		const g = group(), W = 0.34, T = 0.028, N = 8, step = W * 0.86 / N;
		const board = M( 0xffffff, { map: canvasTex( 'leis:konane', 256, 256, ( ctx, w, h ) => {
			ctx.drawImage( koaTex( 'board', 0x9a5a2a ).image, 0, 0, w, h );
			ctx.strokeStyle = 'rgba(40,16,4,0.6)'; ctx.lineWidth = 3; ctx.strokeRect( 8, 8, w - 16, h - 16 );
			for ( let i = 0; i < N; i ++ ) for ( let j = 0; j < N; j ++ ) { ctx.fillStyle = 'rgba(30,12,4,0.75)'; ctx.beginPath(); ctx.arc( w * ( 0.07 + ( i + 0.5 ) * 0.86 / N ), h * ( 0.07 + ( j + 0.5 ) * 0.86 / N ), 9, 0, PI * 2 ); ctx.fill(); }
		} ), rough: 0.45 } );
		add( g, G.rbox( W, T, W, 0.006 ), M( 0x7a4420, { rough: 0.5 } ) );
		top( g, W * 0.985, W * 0.985, T, board );
		const lava = M( 0x1e1c1c, { rough: 0.85 } ), coral = M( 0xf2eee2, { rough: 0.8 } );
		const peb = G.sph( step * 0.32, 8, 6 ); peb.scale( 1, 0.62, 1 );
		const r = rng( 5 );
		for ( let i = 0; i < N; i ++ ) for ( let j = 0; j < N; j ++ ) {
			// a game under way: a few holes already emptied
			if ( r() < 0.16 ) continue;
			const m = add( g, peb, ( i + j ) % 2 ? coral : lava, [ ( i - ( N - 1 ) / 2 ) * step, T + step * 0.12, ( j - ( N - 1 ) / 2 ) * step ] );
			m.rotation.y = r() * PI;
		}
		return g;
	} );

	// a ten-hole harmonica: chrome covers over a black comb, the holes along the front, a stamped brand
	reg( 'leis_harmonica', () => {
		const g = group(), L = 0.101, D = 0.027, chrome = M( 0xd8dce2, { rough: 0.18, metal: 1 } );
		add( g, G.box( L * 0.97, 0.011, D * 0.92 ), M( 0x1a1a1a, { rough: 0.4 } ), [ 0, 0.007, 0 ] );
		for ( const y of [ 0, 0.0175 ] ) add( g, G.rbox( L, 0.0075, D, 0.003 ), chrome, [ 0, y, 0 ] );
		// the holes: dark squares along the front of the comb
		for ( let i = 0; i < 10; i ++ ) add( g, G.box( 0.0055, 0.0065, 0.002 ), M( 0x050505 ), [ ( i - 4.5 ) * 0.0094, 0.0085, D * 0.46 ] );
		const stamp = M( 0xffffff, { rough: 0.2, metal: 0.9, map: canvasTex( 'leis:harp', 256, 64, ( ctx, W, H ) => {
			ctx.fillStyle = '#d8dce2'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = 'rgba(60,60,70,0.7)'; ctx.lineWidth = 2; ctx.strokeRect( 6, 6, W - 12, H - 12 );
			text( ctx, 'KANI BLUES · C', W / 2, H / 2, W * 0.8, 30, 0x3a3a46, { family: 'Georgia, serif' } );
		} ) } );
		top( g, L * 0.9, D * 0.8, 0.025, stamp );
		return g;
	} );

	// a yo-yo lying on one face, the string looped out beside it
	reg( 'leis_yoyo', ( s ) => {
		const g = group(), c = s.color ?? 0xd82a2a, R = 0.028;
		const half = G.lathe( [ [ 0, 0 ], [ R * 0.9, 0 ], [ R, 0.004 ], [ R * 0.98, 0.014 ], [ R * 0.4, 0.016 ], [ 0, 0.016 ] ], 28 );
		add( g, half, M( c, { rough: 0.3 } ) );
		add( g, half, M( c, { rough: 0.3 } ), [ 0, 0.036, 0 ], [ PI, 0, 0 ] );
		add( g, G.cyl( 0.006, 0.006, 0.004, 14 ), M( 0xf2f2ee, { rough: 0.8 } ), [ 0, 0.016, 0 ] );
		const logo = M( 0xffffff, { rough: 0.3, map: canvasTex( 'leis:yoyo:' + c, 128, 128, ( ctx, W, H ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc( W / 2, H / 2, W * 0.36, 0, PI * 2 ); ctx.stroke();
			glyph( ctx, 'star', W / 2, H / 2, W * 0.55, '#f2c21a' );
		} ) } );
		add( g, new THREE.CircleGeometry( R * 0.8, 24 ).rotateX( - PI / 2 ), logo, [ 0, 0.0362, 0 ] );
		// the string, out to a finger loop
		const pts = [ [ R * 0.95, 0.018, 0 ], [ R * 1.6, 0.004, 0.01 ], [ R * 2.6, 0.003, - 0.01 ], [ R * 3.3, 0.003, 0.012 ], [ R * 3.6, 0.003, 0.03 ] ];
		add( g, G.tube( pts, 0.0011, 16, 4 ), M( 0xf2f2ee, { rough: 0.9 } ) );
		add( g, G.torus( 0.009, 0.0011, 4, 14 ), M( 0xf2f2ee, { rough: 0.9 } ), [ R * 3.6, 0.002, 0.04 ], [ PI / 2, 0, 0 ] );
		return ground( g );
	} );

	// a 3 x 3 puzzle cube, scrambled
	reg( 'leis_cube', () => {
		const g = group(), a = 0.057, cell = a / 3, st = cell * 0.86;
		add( g, G.rbox( a, a, a, 0.004, 3 ), M( 0x111111, { rough: 0.35 } ) );
		const COLS = [ 0xf2f2f2, 0xf2c21a, 0xd8201e, 0xf2701a, 0x1a8a3a, 0x1a4ad6 ].map( c => M( c, { rough: 0.25 } ) );
		const r = rng( 21 );
		const sticker = G.rbox( st, 0.0012, st, 0.0016, 1 );
		for ( let i = 0; i < 3; i ++ ) for ( let j = 0; j < 3; j ++ ) {
			const u = ( i - 1 ) * cell, v = ( j - 1 ) * cell;
			add( g, sticker, COLS[ Math.floor( r() * 6 ) ], [ u, a - 0.0003, v ] );
			add( g, sticker, COLS[ Math.floor( r() * 6 ) ], [ u, a / 2 + v, a / 2 - 0.0003 ], [ PI / 2, 0, 0 ] );
			add( g, sticker, COLS[ Math.floor( r() * 6 ) ], [ a / 2 - 0.0003, a / 2 + v, u ], [ 0, 0, - PI / 2 ] );
			add( g, sticker, COLS[ Math.floor( r() * 6 ) ], [ u, a / 2 + v, - a / 2 + 0.0003 ], [ - PI / 2, 0, 0 ] );
			add( g, sticker, COLS[ Math.floor( r() * 6 ) ], [ - a / 2 + 0.0003, a / 2 + v, u ], [ 0, 0, PI / 2 ] );
		}
		return g;
	} );

	// a handheld game: grey brick, a green screen with a game on it, a cross pad, two magenta buttons
	reg( 'leis_handheld', ( s ) => {
		const g = group(), L = 0.148, D = 0.09, H = 0.03, c = s.color ?? 0x9aa0a8;
		add( g, G.rbox( L, H, D, 0.008, 3 ), M( c, { rough: 0.55 } ) );
		const face = M( 0xffffff, { rough: 0.45, map: canvasTex( 'leis:handheld', 512, 312, ( ctx, W, Hh ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, Hh );
			// the screen bezel (the screen end toward -x: the left of the art)
			ctx.fillStyle = '#4a4e5a'; ctx.fillRect( W * 0.05, Hh * 0.1, W * 0.48, Hh * 0.8 );
			ctx.fillStyle = '#9ab83a'; ctx.fillRect( W * 0.1, Hh * 0.18, W * 0.38, Hh * 0.64 );
			// a little platform game in four greens
			ctx.fillStyle = '#3a5a1a';
			for ( let x = 0; x < 8; x ++ ) ctx.fillRect( W * 0.1 + x * W * 0.048, Hh * 0.7, W * 0.044, Hh * 0.04 );
			ctx.fillRect( W * 0.2, Hh * 0.56, W * 0.03, Hh * 0.14 ); ctx.fillRect( W * 0.36, Hh * 0.46, W * 0.07, Hh * 0.04 );
			ctx.fillStyle = '#5a7a2a'; ctx.beginPath(); ctx.arc( W * 0.4, Hh * 0.28, 10, 0, PI * 2 ); ctx.fill();
			ctx.fillStyle = '#c0281e'; ctx.beginPath(); ctx.arc( W * 0.06, Hh * 0.3, 4, 0, PI * 2 ); ctx.fill();
			text( ctx, 'POCKET PAL', W * 0.29, Hh * 0.94, W * 0.4, 22, 0x2a2a6a, { family: 'Georgia, serif', weight: 'bold italic' } );
			text( ctx, 'START  SELECT', W * 0.78, Hh * 0.92, W * 0.3, 16, 0x2a2a6a, { weight: 'bold' } );
		} ) } );
		top( g, L * 0.96, D * 0.92, H, face );
		// the controls (toward +x)
		const dark = M( 0x1e1e22, { rough: 0.45 } ), mag = M( 0x8a1a5a, { rough: 0.35 } );
		add( g, G.box( 0.026, 0.004, 0.008 ), dark, [ 0.035, H, - 0.016 ] );
		add( g, G.box( 0.008, 0.004, 0.026 ), dark, [ 0.035, H, - 0.016 ] );
		for ( const [ x, z ] of [ [ 0.05, 0.02 ], [ 0.03, 0.03 ] ] ) add( g, G.cyl( 0.0062, 0.0062, 0.004, 16 ), mag, [ x, H, z ] );
		for ( const z of [ - 0.008, 0.004 ] ) add( g, G.rbox( 0.004, 0.0025, 0.01, 0.0012 ), M( 0x5a5e66, { rough: 0.5 } ), [ 0.064, H, z ], [ 0, - 0.5, 0 ] );
		return g;
	} );

	// a frisbee: a shallow dome with a curled rim and a printed top
	reg( 'leis_frisbee', ( s ) => {
		const g = group(), c = s.color ?? 0xf2702a, R = 0.135;
		add( g, G.lathe( [ [ 0, 0.026 ], [ R * 0.7, 0.0245 ], [ R * 0.93, 0.02 ], [ R, 0.012 ], [ R * 0.995, 0.002 ], [ R * 0.97, 0 ], [ R * 0.95, 0.008 ], [ R * 0.9, 0.017 ], [ 0, 0.021 ] ], 40 ),
			M( c, { rough: 0.35, side: THREE.DoubleSide } ) );
		const art = M( 0xffffff, { rough: 0.35, map: canvasTex( 'leis:frisbee:' + c, 256, 256, ( ctx, W, H ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 5;
			for ( const rr of [ 0.46, 0.4 ] ) { ctx.beginPath(); ctx.arc( W / 2, H / 2, W * rr, 0, PI * 2 ); ctx.stroke(); }
			text( ctx, 'AIR LOA', W / 2, H * 0.5, W * 0.6, 50, 0xffffff, { family: 'Georgia, serif', weight: 'bold italic' } );
			text( ctx, 'PRO 175 G', W / 2, H * 0.66, W * 0.4, 18, 0xffffff, { weight: 'bold' } );
		} ) } );
		add( g, new THREE.CircleGeometry( R * 0.8, 32 ).rotateX( - PI / 2 ), art, [ 0, 0.0258, 0 ] );
		return g;
	} );

	// a bodyboard: a foam slab with a wide nose and a crescent tail, a slick bottom, a coiled wrist leash
	reg( 'leis_bodyboard', ( s ) => {
		const g = group(), L = 1.04, W = 0.54, T = 0.055;
		const sh = new THREE.Shape();
		sh.moveTo( - L / 2, - W * 0.4 );
		sh.quadraticCurveTo( - L * 0.42, 0, - L / 2, W * 0.4 ); // the crescent tail
		sh.lineTo( L * 0.2, W * 0.5 );
		sh.quadraticCurveTo( L * 0.5, W * 0.5, L * 0.5, W * 0.25 ); sh.lineTo( L * 0.5, - W * 0.25 );
		sh.quadraticCurveTo( L * 0.5, - W * 0.5, L * 0.2, - W * 0.5 ); sh.lineTo( - L / 2, - W * 0.4 );
		const geo = planarUV( slab( sh, T, 0.012 ) );
		const deck = M( 0xffffff, { rough: 0.7, map: canvasTex( 'leis:bodyboard:' + s.color, 512, 266, ( ctx, Wc, Hc ) => {
			ctx.fillStyle = css( s.color ?? 0x1a8ad6 ); ctx.fillRect( 0, 0, Wc, Hc );
			ctx.fillStyle = css( s.color2 ?? 0xf2c21a ); ctx.fillRect( 0, Hc * 0.08, Wc, Hc * 0.05 ); ctx.fillRect( 0, Hc * 0.87, Wc, Hc * 0.05 );
			text( ctx, 'MOKU', Wc * 0.6, Hc * 0.5, Wc * 0.35, 80, 0xffffff, { family: 'Georgia, serif', weight: 'bold italic', stroke: 0x0a3a6a, lw: 6 } );
			// the dimpled foam: a few channels
			ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 3; for ( const y of [ 0.3, 0.7 ] ) { ctx.beginPath(); ctx.moveTo( Wc * 0.05, Hc * y ); ctx.lineTo( Wc * 0.4, Hc * y ); ctx.stroke(); }
		} ) } );
		const [ caps, sides ] = splitGroups( geo );
		add( g, caps, deck );
		add( g, sides, M( 0xf2f2ee, { rough: 0.4 } ) );
		add( g, G.box( L * 0.86, 0.004, W * 0.82 ), M( 0xf2f2ee, { rough: 0.3 } ), [ L * 0.03, - 0.001, 0 ] );
		// the leash: a coil of black cord at the tail
		const coil = [];
		for ( let i = 0; i <= 36; i ++ ) { const a = i / 36 * PI * 4; coil.push( [ - L * 0.36 + Math.cos( a ) * 0.06, T + 0.004 + i * 0.0003, - W * 0.2 + Math.sin( a ) * 0.05 + i * 0.001 ] ); }
		add( g, G.tube( coil, 0.004, 64, 5 ), M( 0x1a1a1a, { rough: 0.6 } ) );
		add( g, G.rbox( 0.06, 0.01, 0.03, 0.004 ), M( 0x1a1a1a, { rough: 0.7 } ), [ - L * 0.36, T, - W * 0.08 ] );
		return g;
	} );

	// a shortboard: pointed nose, squash tail, a stringer and coloured rails, a traction pad, three fins, the leash
	reg( 'leis_surfboard', ( s ) => {
		const g = group(), L = 2.03, W = 0.52, T = 0.065;
		const half = ( t ) => { // half-width at t (0 tail .. 1 nose)
			const nose = t > 0.62 ? Math.pow( Math.max( 0, 1 - ( t - 0.62 ) / 0.38 ), 0.62 ) : 1;
			const tail = t < 0.24 ? 0.5 + 0.5 * Math.sin( t / 0.24 * PI / 2 ) : 1;
			return W / 2 * Math.sin( Math.min( 1, 0.55 + t * 1.1 ) * PI / 2 ) * nose * tail;
		};
		const sh = new THREE.Shape(), N = 40;
		sh.moveTo( - L / 2, - half( 0 ) * 0.92 );
		for ( let i = 0; i <= N; i ++ ) { const t = i / N; sh.lineTo( ( t - 0.5 ) * L, - half( t ) ); }
		for ( let i = N; i >= 0; i -- ) { const t = i / N; sh.lineTo( ( t - 0.5 ) * L, half( t ) ); }
		const geo = planarUV( slab( sh, T, 0.022, 3 ) );
		// rocker: the nose and tail lift
		const p = geo.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const t = p.getX( i ) / ( L / 2 ); p.setY( i, p.getY( i ) + Math.pow( Math.abs( t ), 2.6 ) * ( t > 0 ? 0.11 : 0.05 ) ); }
		geo.computeVertexNormals();
		const deck = M( 0xffffff, { rough: 0.3, map: canvasTex( 'leis:surfboard:' + s.color + ':' + s.stripe, 1024, 256, ( ctx, Wc, Hc ) => {
			ctx.fillStyle = css( s.color ?? 0xf4efe2 ); ctx.fillRect( 0, 0, Wc, Hc );
			// coloured rails and the stringer
			ctx.fillStyle = css( s.stripe ?? 0x1a8ad6 ); ctx.fillRect( 0, 0, Wc, Hc * 0.1 ); ctx.fillRect( 0, Hc * 0.9, Wc, Hc * 0.1 );
			ctx.fillStyle = '#8a6a3a'; ctx.fillRect( 0, Hc * 0.495, Wc, Hc * 0.012 );
			// the shaper's logo
			glyph( ctx, 'wave', Wc * 0.62, Hc * 0.5, Hc * 0.32, css( s.stripe ?? 0x1a8ad6 ) );
			text( ctx, 'KOʻOLAU SHAPES', Wc * 0.75, Hc * 0.5, Wc * 0.14, 30, s.stripe ?? 0x1a8ad6, { family: 'Georgia, serif', weight: 'bold italic' } );
			// wax smudges
			const r = rng( 3 ); ctx.fillStyle = 'rgba(255,255,255,0.35)';
			for ( let i = 0; i < 90; i ++ ) ctx.fillRect( Wc * ( 0.15 + r() * 0.45 ), Hc * ( 0.15 + r() * 0.7 ), 6 + r() * 14, 3 + r() * 6 );
		} ) } );
		const [ caps, sides ] = splitGroups( geo );
		add( g, caps, deck );
		add( g, sides, M( s.stripe ?? 0x1a8ad6, { rough: 0.3 } ) );
		// the traction pad at the tail
		const pad = new THREE.Shape(); pad.moveTo( - 0.15, - 0.15 ); pad.lineTo( 0.12, - 0.14 ); pad.quadraticCurveTo( 0.16, 0, 0.12, 0.14 ); pad.lineTo( - 0.15, 0.15 ); pad.quadraticCurveTo( - 0.12, 0, - 0.15, - 0.15 );
		const padGeo = slab( pad, 0.008, 0.002, 1 );
		add( g, padGeo, M( 0x1e2024, { rough: 0.9 } ), [ - L * 0.39, T - 0.002 + Math.pow( 0.78, 2.6 ) * 0.05, 0 ], [ 0, 0, 0.06 ] );
		// three fins underneath, toward the tail
		const fin = new THREE.Shape(); fin.moveTo( 0, 0 ); fin.lineTo( 0.11, 0 ); fin.quadraticCurveTo( 0.04, - 0.03, - 0.03, - 0.11 ); fin.quadraticCurveTo( - 0.01, - 0.04, 0, 0 );
		const finGeo = new THREE.ExtrudeGeometry( fin, { depth: 0.006, bevelEnabled: false } ).translate( 0, 0, - 0.003 );
		const finMat = M( 0x2a2e36, { rough: 0.35 } );
		add( g, finGeo, finMat, [ - L * 0.44, 0.03, 0 ] );
		for ( const z of [ - 0.17, 0.17 ] ) add( g, finGeo, finMat, [ - L * 0.36, 0.024, z ], [ z > 0 ? - 0.08 : 0.08, 0, 0 ], [ 0.85, 0.85, 1 ] );
		// the leash coiled on the deck
		const coil = [];
		for ( let i = 0; i <= 40; i ++ ) { const a = i / 40 * PI * 4; coil.push( [ - L * 0.3 + Math.cos( a ) * 0.08, T + 0.018 + i * 0.0002, 0.04 + Math.sin( a ) * 0.06 + i * 0.001 ] ); }
		add( g, G.tube( coil, 0.0035, 72, 5 ), M( 0x1a3a6a, { rough: 0.55 } ) );
		return ground( g );
	} );

	// a plush sea turtle: a soft domed shell with scutes, a round head, four flippers
	reg( 'leis_plush', () => {
		const g = group();
		const shellTex = canvasTex( 'leis:honu', 256, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#4a8a3a'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = '#2a5a22'; ctx.lineWidth = 7;
			const hex = ( x, y, r ) => { ctx.beginPath(); for ( let k = 0; k <= 6; k ++ ) { const a = k / 6 * PI * 2; ctx.lineTo( x + Math.cos( a ) * r, y + Math.sin( a ) * r ); } ctx.stroke(); };
			hex( W / 2, H / 2, 40 ); for ( let k = 0; k < 6; k ++ ) { const a = k / 6 * PI * 2 + PI / 6; hex( W / 2 + Math.cos( a ) * 72, H / 2 + Math.sin( a ) * 72, 36 ); }
			for ( let i = 0; i < 1200; i ++ ) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; ctx.fillRect( ( i * 53 ) % W, ( i * 97 ) % H, 2, 2 ); }
		} );
		const shell = G.sph( 0.1, 20, 12, 0, PI * 2, 0, PI / 2 ); shell.scale( 1.15, 0.55, 0.95 );
		add( g, shell, M( 0xffffff, { map: shellTex, rough: 0.95 } ), [ 0, 0.02, 0 ] );
		const skin = M( 0x9ac87a, { rough: 0.95 } ), belly = M( 0xe8e0b8, { rough: 0.95 } );
		const under = G.sph( 0.1, 18, 8, 0, PI * 2, PI / 2, PI / 2 ); under.scale( 1.12, 0.18, 0.92 );
		add( g, under, belly, [ 0, 0.022, 0 ] );
		add( g, G.sph( 0.042, 14, 10 ), skin, [ 0.135, 0.04, 0 ] );
		for ( const z of [ - 0.016, 0.016 ] ) add( g, G.sph( 0.0065, 8, 6 ), M( 0x111111, { rough: 0.2 } ), [ 0.168, 0.052, z ] );
		const flip = G.sph( 0.05, 12, 8 ); flip.scale( 1.1, 0.22, 0.5 );
		for ( const [ x, z, a ] of [ [ 0.06, 0.1, - 0.7 ], [ 0.06, - 0.1, 0.7 ], [ - 0.08, 0.08, 0.6 ], [ - 0.08, - 0.08, - 0.6 ] ] ) add( g, flip, skin, [ x, 0.014, z ], [ 0, a, 0 ], x < 0 ? 0.7 : 1 );
		return ground( g );
	} );

	// ================= vices =================
	// the pack's printed faces: the flip-top lid in the brand colour with a white chevron, the brand, a warning box
	const packTex = ( s, carton ) => tex( `pack:${s.brand}:${s.color}:${carton ? 1 : 0}`, 512, carton ? 170 : 320, ( ctx, W, H ) => {
		const c = css( s.color ?? 0xc0282a );
		ctx.fillStyle = css( s.band ?? 0xf2f2f2 ); ctx.fillRect( 0, 0, W, H );
		ctx.fillStyle = c; ctx.fillRect( 0, 0, W * 0.34, H );
		ctx.fillStyle = css( s.band ?? 0xf2f2f2 ); ctx.beginPath(); ctx.moveTo( W * 0.06, H * 0.2 ); ctx.lineTo( W * 0.3, H * 0.5 ); ctx.lineTo( W * 0.06, H * 0.8 ); ctx.lineTo( W * 0.12, H * 0.5 ); ctx.fill();
		text( ctx, s.brand || 'MAUKA', W * 0.66, H * 0.3, W * 0.56, H * 0.24, s.color ?? 0xc0282a, { family: 'Georgia, serif' } );
		text( ctx, s.sub || '', W * 0.66, H * 0.48, W * 0.56, H * 0.09, 0x3a3a3a, { weight: 'bold' } );
		ctx.fillStyle = '#ffffff'; ctx.fillRect( W * 0.4, H * 0.62, W * 0.54, H * 0.3 ); ctx.strokeStyle = '#111111'; ctx.lineWidth = 3; ctx.strokeRect( W * 0.4, H * 0.62, W * 0.54, H * 0.3 );
		text( ctx, 'WARNING', W * 0.67, H * 0.7, W * 0.4, H * 0.08, 0x111111 );
		ctx.fillStyle = '#555555'; for ( let i = 0; i < 2; i ++ ) ctx.fillRect( W * 0.44, H * ( 0.79 + i * 0.06 ), W * 0.46, H * 0.025 );
	} );
	reg( 'leis_pack', ( s ) => {
		const g = group(), L = 0.088, D = 0.055, H = 0.022;
		add( g, G.box( L, H, D ), M( s.band ?? 0xf2f2f2, { rough: 0.5 } ) );
		add( g, G.box( L * 0.34, H * 1.005, D * 1.005 ), M( s.color ?? 0xc0282a, { rough: 0.45 } ), [ - L * 0.33, 0, 0 ] );
		top( g, L, D, H, packTex( s, false ) );
		// the foil and a filter peeking out of the open lid
		add( g, G.box( 0.003, H * 0.8, D * 0.9 ), M( 0xd8d8dc, { rough: 0.25, metal: 0.8 } ), [ - L / 2 - 0.0015, H * 0.1, 0 ] );
		add( g, G.cylX( 0.0042, 0.012, 10 ), M( 0xd89a4a, { rough: 0.7 } ), [ - L / 2 - 0.005, H * 0.55, D * 0.2 ] );
		return g;
	} );
	reg( 'leis_carton', ( s ) => {
		const g = group(), L = 0.272, D = 0.09, H = 0.052;
		add( g, G.box( L, H, D ), M( s.band ?? 0xf2f2f2, { rough: 0.5 } ) );
		top( g, L, D, H, packTex( s, true ) );
		add( g, G.box( L * 0.34, H * 1.004, D * 1.004 ), M( s.color ?? 0xc0282a, { rough: 0.45 } ), [ - L * 0.33, 0, 0 ] );
		return g;
	} );
	// a cigar: dark wrapper leaf, a gold and red band near the rounded head, the cut foot
	reg( 'leis_cigar', () => {
		const g = group(), L = 0.15, r = 0.0095;
		const leaf = M( 0xffffff, { rough: 0.85, map: canvasTex( 'leis:cigarleaf', 256, 32, ( ctx, W, H ) => {
			ctx.fillStyle = '#5a3418'; ctx.fillRect( 0, 0, W, H );
			const rr = rng( 11 ); for ( let i = 0; i < 40; i ++ ) { ctx.strokeStyle = `rgba(30,14,4,${0.2 + rr() * 0.3})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo( rr() * W, 0 ); ctx.lineTo( rr() * W + 40, H ); ctx.stroke(); }
		} ) } );
		add( g, G.capsX( r, L, 14, 5 ), leaf, [ 0, r, 0 ] );
		add( g, G.cylX( r * 0.97, 0.003, 14 ), M( 0x8a6a3a, { rough: 0.95 } ), [ - L / 2 + 0.0015, r, 0 ] );
		const band = M( 0xffffff, { rough: 0.35, metal: 0.4, map: canvasTex( 'leis:cigarband', 128, 32, ( ctx, W, H ) => {
			ctx.fillStyle = '#b8202a'; ctx.fillRect( 0, 0, W, H ); ctx.fillStyle = '#d4a64a'; ctx.fillRect( 0, 0, W, 5 ); ctx.fillRect( 0, H - 5, W, 5 );
			text( ctx, 'KONA', W / 2, H / 2, W * 0.5, 16, 0xd4a64a, { family: 'Georgia, serif' } );
		} ) } );
		add( g, G.cylX( r * 1.04, 0.016, 16 ), band, [ L * 0.3, r, 0 ] );
		return g;
	} );
	// rolled cigarettes: thin, a little uneven, twisted at one end
	reg( 'leis_cig', () => {
		const g = group(), paper = M( 0xf4f0e6, { rough: 0.9 } );
		for ( let i = 0; i < 3; i ++ ) {
			const c = group();
			add( c, G.cylX( 0.0042, 0.066, 10, 0.0038 ), paper, [ 0, 0.0042, 0 ] );
			add( c, G.cone( 0.0038, 0.008, 8 ).rotateZ( - PI / 2 ), paper, [ 0.037, 0.0042, 0 ] );
			add( c, G.cylX( 0.0043, 0.001, 10 ), M( 0x6a4a22, { rough: 0.95 } ), [ - 0.033, 0.0042, 0 ] );
			c.position.set( i * 0.004, 0, ( i - 1 ) * 0.011 ); c.rotation.y = ( i - 1 ) * 0.18;
			g.add( c );
		}
		return g;
	} );
	// a booklet of rolling papers, one paper standing out of the slot
	reg( 'leis_papers', () => {
		const g = group(), L = 0.07, D = 0.037, H = 0.004;
		add( g, G.box( L, H, D ), M( 0xd86a1a, { rough: 0.6 } ) );
		top( g, L, D, H, tex( 'papers', 256, 136, ( ctx, W, Hc ) => {
			ctx.fillStyle = '#d86a1a'; ctx.fillRect( 0, 0, W, Hc );
			ctx.fillStyle = '#f2e6c8'; ctx.fillRect( 0, Hc * 0.08, W, Hc * 0.06 ); ctx.fillRect( 0, Hc * 0.86, W, Hc * 0.06 );
			text( ctx, 'PAU HANA', W / 2, Hc * 0.42, W * 0.8, 40, 0xf2e6c8, { family: 'Georgia, serif' } );
			text( ctx, 'Rolling papers · 32', W / 2, Hc * 0.68, W * 0.7, 18, 0x3a1a0a, { weight: 'bold' } );
		} ) );
		add( g, G.box( 0.05, 0.0004, 0.02 ), M( 0xfaf8f2, { rough: 0.95, side: THREE.DoubleSide } ), [ 0.004, H + 0.0004, - D * 0.42 ], [ 0.5, 0, 0 ] );
		return g;
	} );
	// a round chewing tobacco tin with a printed lid
	reg( 'leis_tin', ( s ) => {
		const g = group(), R = 0.034, H = 0.022;
		add( g, G.cyl( R, R, H * 0.85, 28 ), M( 0xb8bcc2, { rough: 0.3, metal: 0.9 } ) );
		add( g, G.cyl( R * 1.01, R * 1.01, H * 0.3, 28 ), M( s.color ?? 0x1a3a2a, { rough: 0.35, metal: 0.5 } ), [ 0, H * 0.7, 0 ] );
		const lid = M( 0xffffff, { rough: 0.35, metal: 0.3, map: canvasTex( 'leis:tin:' + s.text, 256, 256, ( ctx, W, Hc ) => {
			ctx.fillStyle = css( s.color ?? 0x1a3a2a ); ctx.fillRect( 0, 0, W, Hc );
			ctx.strokeStyle = '#d4a64a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc( W / 2, Hc / 2, W * 0.44, 0, PI * 2 ); ctx.stroke();
			glyph( ctx, 'leaf', W / 2, Hc * 0.3, 70, '#9ac87a' );
			text( ctx, s.text || 'KOA LEAF', W / 2, Hc * 0.56, W * 0.72, 40, 0xf2e6c8, { family: 'Georgia, serif' } );
			text( ctx, s.sub || '', W / 2, Hc * 0.72, W * 0.6, 22, 0xd4a64a, { weight: 'bold' } );
		} ) } );
		add( g, new THREE.CircleGeometry( R * 1.01, 28 ).rotateX( - PI / 2 ), lid, [ 0, H + 0.0003, 0 ] );
		return g;
	} );
	// a vape pen: dark metal body, a clear tank with juice, the mouthpiece, a glowing button
	reg( 'leis_vape', ( s ) => {
		const g = group(), r = 0.0085, body = M( s.color ?? 0x2a2e36, { rough: 0.3, metal: 0.8 } );
		add( g, G.cylX( r, 0.075, 18 ), body, [ - 0.02, r, 0 ] );
		add( g, G.cylX( r * 0.98, 0.032, 18 ), M( 0xd8e4ea, { rough: 0.05, transparent: true, opacity: 0.35 } ), [ 0.034, r, 0 ] );
		add( g, G.cylX( r * 0.7, 0.026, 14 ), M( 0xe8a040, { rough: 0.2 } ), [ 0.034, r, 0 ] );
		add( g, G.cylX( r * 1.02, 0.004, 18 ), MAT.metal(), [ 0.019, r, 0 ] );
		add( g, G.cylX( r * 0.6, 0.014, 14, r * 0.85 ), M( 0x111111, { rough: 0.3 } ), [ 0.057, r, 0 ] );
		add( g, G.cyl( 0.003, 0.003, 0.002, 10 ), M( 0x4ad8ff, { emissive: 0x2ab8ff, emissiveIntensity: 1.5 } ), [ - 0.01, r * 1.95, 0 ] );
		return g;
	} );
	// a hip flask: a stainless body with shoulders up to the neck, a stitched leather wrap, the screw cap on its hinge
	reg( 'leis_flask', () => {
		const g = group(), L = 0.125, D = 0.092, H = 0.024;
		const sh = new THREE.Shape();
		sh.moveTo( - L / 2, - D * 0.4 ); sh.quadraticCurveTo( - L / 2, - D / 2, - L * 0.4, - D / 2 ); sh.lineTo( L * 0.12, - D / 2 );
		sh.quadraticCurveTo( L * 0.34, - D * 0.48, L * 0.42, - D * 0.14 ); sh.lineTo( L * 0.42, D * 0.14 ); sh.quadraticCurveTo( L * 0.34, D * 0.48, L * 0.12, D / 2 );
		sh.lineTo( - L * 0.4, D / 2 ); sh.quadraticCurveTo( - L / 2, D / 2, - L / 2, D * 0.4 ); sh.lineTo( - L / 2, - D * 0.4 );
		const geo = slab( sh, H, 0.008, 4 );
		// the curve to fit a hip: bowed across its width
		const bow = ( z ) => ( 1 - z * z ) * 0.006;
		const p = geo.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) p.setY( i, p.getY( i ) + bow( p.getZ( i ) / ( D / 2 ) ) );
		geo.computeVertexNormals();
		const steel = M( 0xc8ccd2, { rough: 0.2, metal: 1 } );
		add( g, geo, steel );
		// the leather wrap over the middle: a band a little proud of the steel, with its stitching
		const wrap = M( 0xffffff, { rough: 0.7, map: canvasTex( 'leis:flaskwrap', 256, 192, ( ctx, W, Hc ) => {
			ctx.fillStyle = '#5a3018'; ctx.fillRect( 0, 0, W, Hc );
			const r = rng( 7 ); for ( let i = 0; i < 500; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,220,180,0.05)'; ctx.fillRect( r() * W, r() * Hc, 3, 2 ); }
			ctx.strokeStyle = '#d8b878'; ctx.lineWidth = 2; ctx.setLineDash( [ 8, 6 ] );
			for ( const x of [ 12, W - 12 ] ) { ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x, Hc ); ctx.stroke(); }
			ctx.setLineDash( [] ); ctx.strokeStyle = '#d4a64a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc( W / 2, Hc / 2, 40, 0, PI * 2 ); ctx.stroke();
			glyph( ctx, 'palm', W / 2, Hc / 2, 60, '#d4a64a' );
		} ) } );
		const bw = L * 0.5, band = G.box( bw, H + 0.004, D + 0.003, 1, 1, 6 );
		{ const q = band.attributes.position; for ( let i = 0; i < q.count; i ++ ) if ( q.getY( i ) > H / 2 ) q.setY( i, q.getY( i ) + bow( q.getZ( i ) / ( D / 2 ) ) ); band.computeVertexNormals(); }
		add( g, band, M( 0x5a3018, { rough: 0.7 } ), [ - L * 0.13, - 0.0015, 0 ] );
		const face = new THREE.PlaneGeometry( bw * 0.98, D, 1, 6 ).rotateX( - PI / 2 );
		{ const q = face.attributes.position; for ( let i = 0; i < q.count; i ++ ) q.setY( i, bow( q.getZ( i ) / ( D / 2 ) ) ); face.computeVertexNormals(); }
		add( g, face, wrap, [ - L * 0.13, H + 0.0027, 0 ] );
		// the neck, the cap and its hinge arm
		add( g, G.cylX( 0.008, 0.008, 16 ), steel, [ L * 0.455, H * 0.55, 0 ] );
		add( g, G.cylX( 0.0125, 0.014, 20 ), steel, [ L * 0.52, H * 0.55, 0 ] );
		add( g, G.box( 0.02, 0.003, 0.005 ), MAT.darkMetal(), [ L * 0.47, H * 0.55 + 0.012, 0 ] );
		// stood up on its base, the cap at the top, the wrap facing the front
		const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
		inner.rotation.set( 0, PI / 2, PI / 2 );
		g.add( inner );
		return ground( g );
	} );

	// ================= keepsakes =================
	// a snow globe: a black base with WAIKĪKĪ on it, under the glass Diamond Head, a palm and the sand, snow in the water
	reg( 'leis_globe', () => {
		const g = group(), R = 0.05;
		add( g, G.lathe( [ [ 0, 0 ], [ 0.047, 0 ], [ 0.045, 0.03 ], [ 0.036, 0.036 ], [ 0, 0.036 ] ], 28 ), M( 0x1a1a1e, { rough: 0.3 } ) );
		const band = M( 0xffffff, { rough: 0.3, map: canvasTex( 'leis:globeband', 512, 48, ( ctx, W, H ) => {
			ctx.fillStyle = '#1a1a1e'; ctx.fillRect( 0, 0, W, H );
			for ( const x of [ 0.25, 0.75 ] ) text( ctx, 'WAIKĪKĪ', W * x, H / 2, W * 0.4, 34, 0xd4a64a, { family: 'Georgia, serif' } );
		} ) } );
		add( g, G.cyl( 0.0462, 0.0472, 0.02, 28, true ), band, [ 0, 0.005, 0 ] );
		const cy = 0.036 + R * 0.86;
		// the scene inside
		add( g, G.cyl( R * 0.7, R * 0.7, 0.004, 24 ), M( 0xe8d4a0, { rough: 0.9 } ), [ 0, 0.038, 0 ] );
		const hill = G.cone( 0.03, 0.028, 10 ); hill.scale( 1.4, 1, 0.8 );
		add( g, hill, M( 0x6a7a3a, { rough: 0.9 } ), [ - 0.008, 0.041, - 0.012 ] );
		add( g, G.cyl( 0.0018, 0.0024, 0.04, 6 ), M( 0x7a5a3a ), [ 0.016, 0.041, 0.01 ], [ 0, 0, - 0.15 ] );
		for ( let k = 0; k < 6; k ++ ) { const a = k / 6 * PI * 2; const lf = G.sph( 0.011, 6, 4 ); lf.scale( 1, 0.2, 0.35 ); add( g, lf, M( 0x2a8a3a, { rough: 0.7 } ), [ 0.021 + Math.cos( a ) * 0.008, 0.081, 0.01 + Math.sin( a ) * 0.008 ], [ 0, - a, - 0.4 ] ); }
		const r = rng( 13 ), snow = M( 0xffffff, { rough: 0.6 } );
		for ( let k = 0; k < 18; k ++ ) add( g, G.sph( 0.0012, 4, 3 ), snow, [ ( r() - 0.5 ) * 0.06, cy - 0.03 + r() * 0.06, ( r() - 0.5 ) * 0.06 ] );
		add( g, G.sph( R, 28, 18 ), M( 0xdff0f8, { rough: 0.04, transparent: true, opacity: 0.22 } ), [ 0, cy, 0 ] );
		return g;
	} );

	// a hula dancer on a spring: grass skirt, lei, arms out to one side, a flower in her hair
	reg( 'leis_hula', () => {
		const g = group(), skin = M( 0xb07a52, { rough: 0.45 } ), hair = M( 0x1a120c, { rough: 0.5 } );
		add( g, G.cyl( 0.026, 0.028, 0.008, 20 ), M( 0x1a1a1a, { rough: 0.4 } ) );
		add( g, G.tube( Array.from( { length: 14 }, ( _, i ) => [ Math.cos( i * 1.6 ) * 0.008, 0.008 + i * 0.0012, Math.sin( i * 1.6 ) * 0.008 ] ), 0.0012, 40, 4 ), MAT.metal() );
		const skirt = M( 0xffffff, { rough: 0.85, map: canvasTex( 'leis:grassskirt', 128, 64, ( ctx, W, H ) => {
			ctx.fillStyle = '#7a9a3a'; ctx.fillRect( 0, 0, W, H );
			for ( let x = 0; x < W; x += 3 ) { ctx.fillStyle = x % 6 ? '#5a7a2a' : '#a8b85a'; ctx.fillRect( x, 0, 2, H ); }
		} ) } );
		add( g, G.cyl( 0.012, 0.024, 0.045, 18 ), skirt, [ 0, 0.026, 0 ] );
		for ( const z of [ - 0.006, 0.006 ] ) add( g, G.cyl( 0.0042, 0.004, 0.012, 8 ), skin, [ 0, 0.016, z ] );
		const torso = G.sph( 0.013, 12, 10 ); torso.scale( 0.8, 1.6, 1 );
		add( g, torso, skin, [ 0, 0.088, 0 ] );
		const lei = [ 0xf2e6c8, 0xe85a7a, 0xf2c21a ];
		for ( let k = 0; k < 12; k ++ ) { const a = k / 12 * PI * 2; add( g, G.sph( 0.0032, 6, 4 ), M( lei[ k % 3 ], { rough: 0.7 } ), [ Math.cos( a ) * 0.011, 0.1 - Math.abs( Math.sin( a ) ) * 0.004, Math.sin( a ) * 0.013 ] ); }
		add( g, G.sph( 0.011, 14, 10 ), skin, [ 0, 0.122, 0 ] );
		const hd = G.sph( 0.0118, 14, 10, 0, PI * 2, 0, PI * 0.6 ); add( g, hd, hair, [ - 0.001, 0.123, 0 ] );
		add( g, G.cyl( 0.007, 0.004, 0.03, 8 ), hair, [ - 0.006, 0.094, 0 ], [ 0, 0, 0.15 ] );
		glyphFlower( g, [ 0.004, 0.13, 0.009 ] );
		// the arms, swaying out to her right
		for ( const [ z, a ] of [ [ - 0.014, - 0.9 ], [ 0.014, - 0.5 ] ] ) {
			const pts = [ [ 0, 0.098, z ], [ 0.008, 0.096, z * 1.8 ], [ 0.02, 0.1 + ( a > - 0.7 ? 0.004 : - 0.006 ), z * 2.4 ] ];
			add( g, G.tube( pts, 0.0032, 8, 6 ), skin );
		}
		return g;
	} );
	function glyphFlower( g, p ) {
		for ( let k = 0; k < 5; k ++ ) { const a = k / 5 * PI * 2; const pt = G.sph( 0.0035, 6, 4 ); pt.scale( 1, 0.5, 0.6 ); add( g, pt, M( 0xf2f2ee, { rough: 0.6 } ), [ p[ 0 ] + Math.cos( a ) * 0.003, p[ 1 ], p[ 2 ] + Math.sin( a ) * 0.003 ], [ 0, - a, 0 ] ); }
		add( g, G.sph( 0.0015, 6, 4 ), M( 0xf2c21a ), [ p[ 0 ], p[ 1 ] + 0.001, p[ 2 ] ] );
	}

	// a hand-turned koa bowl (with ʻawa in it when `fill`)
	reg( 'leis_bowl', ( s ) => {
		const g = group(), R = 0.12, H = 0.07, t = 0.007;
		const wood = M( 0xffffff, { map: koaTex( 'bowl' ), rough: 0.32 } );
		const prof = [ [ 0, 0 ], [ R * 0.45, 0 ], [ R * 0.5, 0.004 ], [ R * 0.82, H * 0.35 ], [ R, H ], [ R - t, H + 0.001 ], [ R * 0.8, H * 0.42 ], [ R * 0.45, t ], [ 0, t ] ];
		add( g, G.lathe( prof, 40 ), wood );
		if ( s.fill ) add( g, G.cyl( R * 0.82, R * 0.82, 0.002, 32 ), M( s.fill, { rough: 0.15 } ), [ 0, H * 0.5, 0 ] );
		return g;
	} );

	// a Niʻihau shell lei: several strands of tiny pink, white and brown shells, a gold clasp
	reg( 'leis_shells', () => {
		const g = group(), cols = [ 0xf2d8d0, 0xe8a8a0, 0xfaf2e8, 0x8a5a3a ].map( c => M( c, { rough: 0.35 } ) );
		// (low-poly shells and three strands: a lei is a few hundred tiny shells, kept to about 3k triangles)
		const shell = G.sph( 0.003, 5, 3 ); shell.scale( 1.5, 0.8, 1 );
		const r = rng( 17 );
		for ( let st = 0; st < 3; st ++ ) {
			const rx = 0.075 + st * 0.008, rz = 0.06 + st * 0.007, n = 44 + st * 5;
			for ( let i = 0; i < n; i ++ ) {
				const a = i / n * PI * 2;
				add( g, shell, cols[ ( i + st ) % 4 === 3 && r() < 0.5 ? 3 : Math.floor( r() * 3 ) ], [ Math.cos( a ) * rx, 0.0022 + st * 0.0015, Math.sin( a ) * rz ], [ 0, - a, 0 ] );
			}
		}
		add( g, G.box( 0.012, 0.004, 0.01 ), MAT.gold(), [ 0.096, 0.004, 0 ] );
		return g;
	} );

	// a lei niho palaoa (a replica): a hooked tongue of white resin on a braided cord
	reg( 'leis_pendant', () => {
		const g = group();
		const sh = new THREE.Shape();
		sh.moveTo( 0, 0 ); sh.quadraticCurveTo( 0.03, 0.004, 0.034, 0.03 ); sh.quadraticCurveTo( 0.035, 0.05, 0.02, 0.058 ); sh.quadraticCurveTo( 0.026, 0.044, 0.018, 0.03 );
		sh.quadraticCurveTo( 0.01, 0.016, - 0.004, 0.012 ); sh.lineTo( 0, 0 );
		const geo = slab( sh, 0.012, 0.004, 3 );
		add( g, geo, M( 0xf2ead8, { rough: 0.3 } ), [ - 0.016, 0, 0.03 ] );
		const cord = M( 0x3a2414, { rough: 0.9 } );
		const loop = G.torus( 0.06, 0.003, 5, 40 ); loop.scale( 1, 0.8, 1 );
		add( g, loop, cord, [ - 0.06, 0.003, 0.0 ], [ PI / 2, 0, 0 ] );
		add( g, G.cyl( 0.006, 0.006, 0.01, 10 ), cord, [ - 0.002, 0.001, 0.0 ], [ 0, 0, PI / 2 ] );
		return ground( g );
	} );

	// a quarter set: a blue card folder with five silver coins in its hollows
	reg( 'leis_coins', () => {
		const g = group(), L = 0.2, D = 0.11;
		add( g, G.box( L, 0.003, D ), M( 0x1a3a7a, { rough: 0.5 } ) );
		top( g, L, D, 0.003, tex( 'quarters', 512, 282, ( ctx, W, H ) => {
			ctx.fillStyle = '#1a3a7a'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = '#d4a64a'; ctx.lineWidth = 5; ctx.strokeRect( 10, 10, W - 20, H - 20 );
			text( ctx, 'HAWAIʻI QUARTERS', W / 2, H * 0.15, W * 0.8, 40, 0xf2e6c8, { family: 'Georgia, serif' } );
			for ( let i = 0; i < 5; i ++ ) { ctx.fillStyle = '#0a1a3a'; ctx.beginPath(); ctx.arc( W * ( 0.13 + i * 0.185 ), H * 0.58, 38, 0, PI * 2 ); ctx.fill(); }
			text( ctx, 'Proof set · 2008', W / 2, H * 0.88, W * 0.5, 22, 0xd4a64a, { weight: 'bold' } );
		} ) );
		const face = M( 0xffffff, { rough: 0.25, metal: 0.9, map: canvasTex( 'leis:quarter', 128, 128, ( ctx, W, H ) => {
			ctx.fillStyle = '#c8ccd2'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = '#8a8e94'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc( W / 2, H / 2, W * 0.44, 0, PI * 2 ); ctx.stroke();
			ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.ellipse( W * 0.5, H * 0.5, W * 0.18, H * 0.24, 0, 0, PI * 2 ); ctx.fill();
			ctx.beginPath(); ctx.arc( W * 0.5, H * 0.25, W * 0.1, 0, PI * 2 ); ctx.fill();
		} ) } );
		for ( let i = 0; i < 5; i ++ ) {
			const x = ( - 0.5 + ( 0.13 + i * 0.185 ) ) * L, z = ( 0.58 - 0.5 ) * D;
			add( g, G.cyl( 0.0121, 0.0121, 0.0017, 24 ), M( 0xc8ccd2, { rough: 0.25, metal: 0.9 } ), [ x, 0.003, z ] );
			add( g, new THREE.CircleGeometry( 0.012, 24 ).rotateX( - PI / 2 ), face, [ x, 0.0049, z ] );
		}
		return g;
	} );

	// a surf trophy: a two-step black plinth with a brass plate, a gold surfboard standing on its tail on a gold wave
	reg( 'leis_trophy', () => {
		// a satin gold: a vertical mirror would only show the dark ground and horizon
		const g = group(), gold = M( 0xe0b040, { rough: 0.38, metal: 0.72 } );
		add( g, G.box( 0.1, 0.04, 0.08 ), M( 0x1a1a1a, { rough: 0.25 } ) );
		add( g, G.box( 0.075, 0.03, 0.06 ), M( 0x242424, { rough: 0.25 } ), [ 0, 0.04, 0 ] );
		const plate = M( 0xffffff, { rough: 0.25, metal: 0.8, map: canvasTex( 'leis:trophyplate', 256, 96, ( ctx, W, H ) => {
			ctx.fillStyle = '#c8a040'; ctx.fillRect( 0, 0, W, H );
			text( ctx, '1ST PLACE', W / 2, H * 0.32, W * 0.8, 34, 0x3a2a0a, { family: 'Georgia, serif' } );
			text( ctx, 'MĀKAHA OPEN', W / 2, H * 0.72, W * 0.8, 26, 0x3a2a0a, { weight: 'bold' } );
		} ) } );
		add( g, new THREE.PlaneGeometry( 0.07, 0.026 ), plate, [ 0, 0.02, 0.0405 ] );
		// a little gold wave at the board's foot
		const curl = [];
		for ( let i = 0; i <= 20; i ++ ) { const t = i / 20, a = t * PI * 1.25; curl.push( [ - 0.028 + t * 0.02 + Math.sin( a ) * 0.016, 0.07 + ( 1 - Math.cos( a ) ) * 0.018, 0 ] ); }
		add( g, G.tube( curl, 0.007, 24, 8 ), gold );
		// the board, standing on its tail
		const half = ( t ) => 0.022 * Math.pow( Math.sin( PI * Math.min( 1, 0.12 + t * 0.95 ) ), 0.7 );
		const sh = new THREE.Shape(), N = 20;
		sh.moveTo( - half( 0 ), 0 );
		for ( let i = 0; i <= N; i ++ ) sh.lineTo( - half( i / N ), i / N * 0.17 );
		for ( let i = N; i >= 0; i -- ) sh.lineTo( half( i / N ), i / N * 0.17 );
		const board = new THREE.ExtrudeGeometry( sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 4 } );
		add( g, board, gold, [ 0.006, 0.07, - 0.002 ], [ 0, 0, - 0.12 ] );
		add( g, G.box( 0.002, 0.016, 0.012 ), gold, [ 0.011, 0.08, - 0.009 ], [ 0, 0, - 0.12 ] );
		return g;
	} );

	// a vintage surf poster: sunset, a big blue wave, a surfer's silhouette, THE DUKE
	const posterMat = () => M( 0xffffff, { rough: 0.7, side: THREE.DoubleSide, map: canvasTex( 'leis:poster', 384, 512, ( ctx, W, H ) => {
		const sky = ctx.createLinearGradient( 0, 0, 0, H * 0.6 );
		sky.addColorStop( 0, '#f2a83a' ); sky.addColorStop( 0.6, '#f2703a' ); sky.addColorStop( 1, '#c83a3a' );
		ctx.fillStyle = sky; ctx.fillRect( 0, 0, W, H );
		ctx.fillStyle = '#f8e6a0'; ctx.beginPath(); ctx.arc( W * 0.68, H * 0.3, W * 0.16, 0, PI * 2 ); ctx.fill();
		// the wave
		ctx.fillStyle = '#1a5a9a'; ctx.beginPath(); ctx.moveTo( 0, H * 0.82 ); ctx.quadraticCurveTo( W * 0.2, H * 0.36, W * 0.62, H * 0.42 ); ctx.quadraticCurveTo( W * 0.4, H * 0.5, W * 0.45, H * 0.64 );
		ctx.quadraticCurveTo( W * 0.7, H * 0.6, W, H * 0.66 ); ctx.lineTo( W, H ); ctx.lineTo( 0, H ); ctx.fill();
		ctx.strokeStyle = '#eef6ff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo( W * 0.08, H * 0.6 ); ctx.quadraticCurveTo( W * 0.25, H * 0.4, W * 0.6, H * 0.43 ); ctx.stroke();
		// the surfer on his board
		ctx.fillStyle = '#1a1210';
		ctx.beginPath(); ctx.ellipse( W * 0.5, H * 0.66, W * 0.16, H * 0.012, - 0.15, 0, PI * 2 ); ctx.fill();
		ctx.fillRect( W * 0.485, H * 0.57, W * 0.03, H * 0.08 ); ctx.beginPath(); ctx.arc( W * 0.5, H * 0.555, W * 0.022, 0, PI * 2 ); ctx.fill();
		ctx.lineWidth = 5; ctx.strokeStyle = '#1a1210'; ctx.beginPath(); ctx.moveTo( W * 0.43, H * 0.58 ); ctx.lineTo( W * 0.57, H * 0.6 ); ctx.stroke();
		// the title
		ctx.fillStyle = '#f2e6c8'; ctx.fillRect( 0, H * 0.84, W, H * 0.16 );
		text( ctx, 'THE DUKE', W / 2, H * 0.1, W * 0.86, 76, 0xf8f0d8, { family: 'Georgia, serif', stroke: 0x6a1a1a, lw: 8 } );
		text( ctx, 'WAIKĪKĪ · 1890 – 1968', W / 2, H * 0.915, W * 0.8, 26, 0x6a1a1a, { family: 'Georgia, serif' } );
		ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = 10; ctx.strokeRect( 0, 0, W, H );
	} ) } );
	reg( 'leis_poster', () => {
		const g = group(), L = 0.61, D = 0.46;
		// a sheet lying flat (the picture upright from the front, so its long side runs along z), the ends curling up
		const geo = new THREE.PlaneGeometry( D, L, 4, 16 ).rotateX( - PI / 2 );
		const p = geo.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const t = Math.abs( p.getZ( i ) ) / ( L / 2 ); p.setY( i, Math.pow( Math.max( 0, t - 0.75 ) / 0.25, 2 ) * 0.03 + 0.001 ); }
		geo.computeVertexNormals();
		add( g, geo, posterMat() );
		return g;
	} );
	// on display: the poster standing in a thin black frame on a little stand
	LEIS.look.duke_poster = () => {
		const g = group(), L = 0.61, D = 0.46, frame = M( 0x1a1a1a, { rough: 0.4 } );
		add( g, new THREE.PlaneGeometry( D, L ), posterMat(), [ 0, 0.06 + L / 2, 0.012 ] );
		add( g, G.box( D + 0.03, L + 0.03, 0.02 ), frame, [ 0, 0.045, 0 ] );
		add( g, G.box( 0.04, 0.05, 0.25 ), frame, [ 0, 0, - 0.08 ] );
		g.rotation.x = 0;
		return g;
	};

	// a signed baseball: white leather, the red double stitching, a signature in blue ink
	reg( 'leis_ball', () => {
		const g = group(), R = 0.0366;
		const leather = M( 0xffffff, { rough: 0.7, map: canvasTex( 'leis:baseball', 512, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#f4f0e6'; ctx.fillRect( 0, 0, W, H );
			// the seam: a sine round the equirectangular map, stitched in red
			for ( const off of [ 0, PI ] ) {
				ctx.strokeStyle = '#b8202a'; ctx.lineWidth = 3;
				for ( const side of [ - 1, 1 ] ) { ctx.beginPath(); for ( let x = 0; x <= W; x += 4 ) { const y = H / 2 + Math.sin( x / W * PI * 2 + off ) * H * 0.28 + side * 5; ctx.lineTo( x, y ); } ctx.stroke(); }
				ctx.lineWidth = 2;
				for ( let x = 0; x <= W; x += 10 ) { const y = H / 2 + Math.sin( x / W * PI * 2 + off ) * H * 0.28; ctx.beginPath(); ctx.moveTo( x - 4, y - 8 ); ctx.lineTo( x + 4, y + 8 ); ctx.stroke(); }
			}
			ctx.strokeStyle = '#1a3aa8'; ctx.lineWidth = 3; ctx.beginPath();
			for ( let x = 0; x < 120; x += 2 ) ctx.lineTo( W * 0.42 + x, H * 0.48 + Math.sin( x * 0.3 ) * 9 + Math.sin( x * 0.07 ) * 6 );
			ctx.stroke();
		} ) } );
		add( g, G.sph( R, 24, 16 ), leather, [ 0, R, 0 ], [ 0, 0.4, 0 ] );
		return g;
	} );

	// a vinyl record half out of its sleeve: sunset and palms, SLACK KEY NIGHTS
	reg( 'leis_vinyl', () => {
		const g = group(), S = 0.315;
		add( g, G.box( S, 0.003, S ), M( 0xe8dcc0, { rough: 0.7 } ) );
		top( g, S, S, 0.003, tex( 'vinyl', 384, 384, ( ctx, W, H ) => {
			const sky = ctx.createLinearGradient( 0, 0, 0, H );
			sky.addColorStop( 0, '#3a1a5a' ); sky.addColorStop( 0.55, '#e8603a' ); sky.addColorStop( 1, '#f2c24a' );
			ctx.fillStyle = sky; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#f8e6a0'; ctx.beginPath(); ctx.arc( W * 0.5, H * 0.66, W * 0.18, PI, 0 ); ctx.fill();
			ctx.fillStyle = '#1a0e14'; ctx.fillRect( 0, H * 0.66, W, H * 0.34 );
			glyph( ctx, 'palm', W * 0.18, H * 0.52, H * 0.5, '#1a0e14' ); glyph( ctx, 'palm', W * 0.84, H * 0.56, H * 0.4, '#1a0e14' );
			text( ctx, 'SLACK KEY NIGHTS', W / 2, H * 0.12, W * 0.86, 42, 0xf8f0d8, { family: 'Georgia, serif' } );
			text( ctx, 'The Mākaha Trio', W / 2, H * 0.22, W * 0.6, 24, 0xf2c24a, { family: 'Georgia, serif' } );
		} ) );
		// the record sliding out of the open edge
		const disc = M( 0xffffff, { rough: 0.25, map: canvasTex( 'leis:record', 256, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#0c0c0e'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; for ( let rr = 40; rr < 128; rr += 3 ) { ctx.beginPath(); ctx.arc( W / 2, H / 2, rr, 0, PI * 2 ); ctx.stroke(); }
			ctx.fillStyle = '#d8402a'; ctx.beginPath(); ctx.arc( W / 2, H / 2, 40, 0, PI * 2 ); ctx.fill();
			ctx.fillStyle = '#0c0c0e'; ctx.beginPath(); ctx.arc( W / 2, H / 2, 4, 0, PI * 2 ); ctx.fill();
		} ) } );
		add( g, G.cyl( 0.15, 0.15, 0.0016, 48 ), M( 0x0c0c0e, { rough: 0.25 } ), [ S * 0.28, 0.0001, 0 ] );
		add( g, new THREE.CircleGeometry( 0.15, 48 ).rotateX( - PI / 2 ), disc, [ S * 0.28, 0.0018, 0 ] );
		return g;
	} );

	// a gold pocket watch, face up, its chain coiled beside it
	reg( 'leis_pocketwatch', () => {
		const g = group(), R = 0.025, gold = M( 0xe0b040, { rough: 0.2, metal: 1 } );
		add( g, G.lathe( [ [ 0, 0 ], [ R * 0.9, 0 ], [ R, 0.004 ], [ R, 0.009 ], [ R * 0.92, 0.012 ], [ 0, 0.012 ] ], 32 ), gold );
		const dial = M( 0xffffff, { rough: 0.15, map: canvasTex( 'leis:pocketdial', 256, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#f8f4ea'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 26px Georgia, serif';
			const RN = [ 'XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI' ];
			for ( let k = 0; k < 12; k ++ ) { const a = k / 12 * PI * 2 - PI / 2; ctx.fillText( RN[ k ], W / 2 + Math.cos( a ) * W * 0.36, H / 2 + Math.sin( a ) * H * 0.36 ); }
			ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo( W / 2, H / 2 ); ctx.lineTo( W / 2 + W * 0.2, H / 2 - H * 0.12 ); ctx.stroke();
			ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo( W / 2, H / 2 ); ctx.lineTo( W / 2 - W * 0.04, H / 2 - H * 0.3 ); ctx.stroke();
		} ) } );
		add( g, new THREE.CircleGeometry( R * 0.86, 32 ).rotateX( - PI / 2 ), dial, [ 0, 0.0121, 0 ] );
		add( g, G.cyl( R * 0.9, R * 0.9, 0.001, 32 ), MAT.glass( 0xffffff, 0.15 ), [ 0, 0.0122, 0 ] );
		add( g, G.cylX( 0.003, 0.006, 12 ), gold, [ R + 0.003, 0.006, 0 ] );
		add( g, G.torus( 0.007, 0.0014, 6, 18 ), gold, [ R + 0.011, 0.006, 0 ], [ PI / 2, 0, 0 ] );
		const chain = [];
		for ( let i = 0; i <= 30; i ++ ) { const a = i / 30 * PI * 1.6; chain.push( [ R + 0.018 + Math.sin( a ) * 0.03, 0.0016, Math.cos( a ) * 0.035 - 0.035 ] ); }
		add( g, G.tube( chain, 0.0014, 48, 4 ), gold );
		return g;
	} );

	// gold coins: one face up, one leaning on it
	reg( 'leis_coin', () => {
		const g = group(), R = 0.0165, gold = M( 0xe2b443, { rough: 0.2, metal: 1 } );
		const face = M( 0xffffff, { rough: 0.22, metal: 0.95, map: canvasTex( 'leis:goldcoin', 256, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#e2b443'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = '#a87a1a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc( W / 2, H / 2, W * 0.45, 0, PI * 2 ); ctx.stroke();
			// a crowned profile in relief
			ctx.fillStyle = '#c8962a'; ctx.beginPath(); ctx.ellipse( W * 0.5, H * 0.52, W * 0.16, H * 0.22, 0.1, 0, PI * 2 ); ctx.fill();
			ctx.beginPath(); ctx.moveTo( W * 0.6, H * 0.46 ); ctx.lineTo( W * 0.7, H * 0.5 ); ctx.lineTo( W * 0.6, H * 0.54 ); ctx.fill();
			ctx.font = 'bold 26px Georgia, serif'; ctx.fillStyle = '#8a5a10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			const t = 'UA MAU KE EA · 1883 · ';
			for ( let k = 0; k < t.length; k ++ ) { const a = k / t.length * PI * 2 - PI / 2; ctx.save(); ctx.translate( W / 2 + Math.cos( a ) * W * 0.37, H / 2 + Math.sin( a ) * H * 0.37 ); ctx.rotate( a + PI / 2 ); ctx.fillText( t[ k ], 0, 0 ); ctx.restore(); }
		} ) } );
		const coin = ( p, r ) => {
			const c = group();
			add( c, G.cyl( R, R, 0.0024, 32 ), gold );
			add( c, new THREE.CircleGeometry( R * 0.97, 32 ).rotateX( - PI / 2 ), face, [ 0, 0.00245, 0 ] );
			c.position.set( ...p ); if ( r ) c.rotation.set( ...r );
			g.add( c );
		};
		coin( [ 0, 0, 0 ], null );
		coin( [ 0.026, 0.002, 0.004 ], [ 0, 0.6, 0.35 ] );
		return ground( g );
	} );

	// a luxury watch put down on a table: the two-tone bracelet closed in a flat loop, the case face up at its front, a
	// fluted gold bezel round a navy dial
	reg( 'leis_watch', () => {
		const g = group(), gold = M( 0xe0b040, { rough: 0.2, metal: 1 } ), steel = M( 0xc8ccd2, { rough: 0.2, metal: 1 } );
		const linkTex = canvasTex( 'leis:bracelet', 256, 32, ( ctx, W, H ) => {
			for ( let x = 0; x < W; x += 8 ) { ctx.fillStyle = '#c8ccd2'; ctx.fillRect( x, 0, 8, H ); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect( x + 7, 0, 1, H ); }
			ctx.fillStyle = '#e0b040'; ctx.fillRect( 0, H * 0.36, W, H * 0.28 );
		} );
		// the bracelet: a flat band round an oval (the case covers its front)
		const N = 48, RX = 0.034, RZ = 0.026, BW = 0.019, pos = [], uv = [], idx = [];
		for ( let i = 0; i <= N; i ++ ) {
			const a = i / N * PI * 2, c = Math.cos( a ), s2 = Math.sin( a );
			for ( const k of [ - 0.5, 0.5 ] ) { pos.push( c * ( RX + k * BW ), 0.004 + ( c > 0.6 ? ( c - 0.6 ) * 0.02 : 0 ), s2 * ( RZ + k * BW ) ); uv.push( i / N * 6, k + 0.5 ); }
			if ( i < N ) { const b = i * 2; idx.push( b, b + 2, b + 1, b + 1, b + 2, b + 3 ); }
		}
		const band = new THREE.BufferGeometry();
		band.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		band.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
		band.setIndex( idx ); band.computeVertexNormals();
		const links = M( 0xffffff, { rough: 0.2, metal: 1, map: linkTex, side: THREE.DoubleSide } );
		links.map.wrapS = THREE.RepeatWrapping;
		add( g, band, links );
		const cx = RX + 0.004;
		add( g, G.cyl( 0.02, 0.02, 0.011, 32 ), steel, [ cx, 0.004, 0 ] );
		add( g, G.torus( 0.0185, 0.0026, 8, 40 ), gold, [ cx, 0.015, 0 ], [ PI / 2, 0, 0 ] );
		const dial = M( 0xffffff, { rough: 0.15, map: canvasTex( 'leis:luxdial', 256, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#16244a'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#e8d080';
			for ( let k = 0; k < 12; k ++ ) { const a = k / 12 * PI * 2; ctx.save(); ctx.translate( W / 2 + Math.cos( a ) * W * 0.38, H / 2 + Math.sin( a ) * H * 0.38 ); ctx.rotate( a ); ctx.fillRect( - 14, - 5, 28, 10 ); ctx.restore(); }
			text( ctx, 'KALĀKAUA', W / 2, H * 0.3, W * 0.5, 26, 0xe8d080, { family: 'Georgia, serif' } );
			text( ctx, 'CHRONOMETER', W / 2, H * 0.72, W * 0.4, 14, 0xe8d080, { weight: 'bold' } );
			ctx.strokeStyle = '#e8d080'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo( W / 2, H / 2 ); ctx.lineTo( W * 0.7, H * 0.6 ); ctx.stroke();
			ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo( W / 2, H / 2 ); ctx.lineTo( W * 0.42, H * 0.16 ); ctx.stroke();
		} ) } );
		add( g, new THREE.CircleGeometry( 0.0165, 32 ).rotateX( - PI / 2 ), dial, [ cx, 0.0152, 0 ] );
		add( g, G.cyl( 0.0165, 0.0165, 0.0008, 32 ), MAT.glass( 0xffffff, 0.12 ), [ cx, 0.0156, 0 ] );
		add( g, G.cylZ( 0.0028, 0.005, 12 ), gold, [ cx, 0.0095, 0.022 ] );
		return ground( g );
	} );

	// ================= seasonal =================
	// a party popper: a foil cone with the pull string out of the narrow end
	reg( 'leis_popper', () => {
		const g = group();
		const foil = M( 0xffffff, { rough: 0.25, metal: 0.6, map: canvasTex( 'leis:popper', 128, 64, ( ctx, W, H ) => {
			const cols = [ '#e83a8a', '#f2c21a', '#2ab8e8', '#e83a8a' ];
			for ( let i = 0; i < 8; i ++ ) { ctx.fillStyle = cols[ i % 4 ]; ctx.beginPath(); ctx.moveTo( i * 16 - 16, 0 ); ctx.lineTo( i * 16, 0 ); ctx.lineTo( i * 16 + 16, H ); ctx.lineTo( i * 16, H ); ctx.fill(); }
		} ) } );
		add( g, G.cylX( 0.016, 0.075, 18, 0.005 ), foil, [ 0, 0.016, 0 ] );
		add( g, new THREE.CircleGeometry( 0.016, 18 ).rotateY( - PI / 2 ), M( 0xf2f2ee, { rough: 0.8 } ), [ - 0.0376, 0.016, 0 ] );
		add( g, G.tube( [ [ 0.037, 0.016, 0 ], [ 0.05, 0.008, 0.006 ], [ 0.06, 0.002, - 0.004 ], [ 0.068, 0.002, 0.004 ] ], 0.0009, 12, 4 ), M( 0xf2f2ee, { rough: 0.8 } ) );
		add( g, G.torus( 0.005, 0.0012, 4, 12 ), M( 0xf2f2ee, { rough: 0.8 } ), [ 0.072, 0.002, 0.004 ], [ PI / 2, 0, 0 ] );
		return g;
	} );
	// glow bracelets: thin glowing tubes closed with a clear connector
	reg( 'leis_glow', ( s ) => {
		const g = group(), c = s.color ?? 0xff4ad8;
		const glow = M( c, { rough: 0.3, emissive: c, emissiveIntensity: 0.9 } ), glow2 = M( 0x6aff6a, { rough: 0.3, emissive: 0x6aff6a, emissiveIntensity: 0.9 } );
		add( g, G.torus( 0.034, 0.0028, 6, 40 ), glow, [ 0, 0.003, 0 ], [ PI / 2, 0, 0 ] );
		add( g, G.torus( 0.034, 0.0028, 6, 40 ), glow2, [ 0.022, 0.0085, 0.012 ], [ PI / 2 - 0.1, 0, 0.05 ] );
		for ( const [ p, m ] of [ [ [ 0.034, 0.003, 0 ], 0 ], [ [ 0.056, 0.009, 0.012 ], 1 ] ] ) add( g, G.cylZ( 0.0034, 0.008, 10 ), M( 0xeef2f2, { rough: 0.2 } ), p, null );
		return ground( g );
	} );
}
