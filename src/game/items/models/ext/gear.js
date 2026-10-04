// Model builders for the gear items (docs/ITEMS_PLAN.md "gear"). register( reg ) is called once by render/ItemModels.js.
// Conventions (render/ItemModels.js): metres, origin at the centre of the bottom, long axis along +x. Garments lie
// flat (the neck towards +x) so the silhouette says what they are; bags and cases stand or lie as they would be left.
//   gear_dress    { style: sundress | gown | skirt | wrap, color, print, color2, color3, rep, trim }
//   gear_smock    { style: poncho | trash | apron | kihei, color, trim }
//   gear_hat      { style: sou_wester | veil | boonie_net | ghillie | lei, color, color2, color3, print }
//   gear_helmet   { style: motocross | bike | pilot | football, color, color2, stripe, visor }
//   gear_mask     { style: hockey | civil, color, color2 }
//   gear_pads     { style: chest | skate, color, color2 }
//   gear_vest     { style: tactical | bandolier | legrig, plates: steel | scrap, color, color2 }
//   gear_plate    { style: steel | scrap }
//   gear_suitcase { color, color2 }
//   gear_case     { style: briefcase | pistol | ammo | lunch, color, color2 }
//   gear_bag      { style: grocery | trash | drawstring | sling | messenger | tackle | waist | hydration | lauhala | rifle
//                   | camera, color, color2, print }
//   gear_small    { style: dogtags | lanyard | marker | pouch | feathers | kapa | needle | denim, color, color2 }
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, canvasTex, labelTex, fabric, shade, css } from '../lib.js';
import { cloth, panel, conform, band, seam, softBox, grid, roundRect, curveLoop, line, uvOf, smoothNormals } from '../garment.js';
// (garment.js's smooth and lerp match this file's own)
import { vestModel, zipLine, sloganMat, pouchOn, thread } from '../clothing.js';
import { patchMaterial } from '../../../../render/Materials.js';

// ---- helpers ----------------------------------------------------------------------------------------------------------

function rng( seed ) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; }; }
const V2 = ( x, y ) => new THREE.Vector2( x, y );

// a flat shape (x along +x, shape y towards -z) extruded upwards to height h, lying on y = 0; `uv` scales the cap UVs
// so a fabric print tiles at the density the folded shirts use
function slab( shape, h, { bevel = 0.004, uv = 3, curve = 18 } = {} ) {
	const geo = new THREE.ExtrudeGeometry( shape, { depth: Math.max( 0.001, h - bevel * 2 ), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve, steps: 1 } );
	geo.rotateX( - PI / 2 );
	geo.translate( 0, bevel, 0 );
	const a = geo.attributes.uv;
	for ( let i = 0; i < a.count; i ++ ) a.setXY( i, a.getX( i ) * uv, a.getY( i ) * uv );
	geo.computeVertexNormals();
	return geo;
}
// the same flat shape as a soft cloth panel (garment.js): rounded edges that fall away like cloth, a print running on
function soft( shape, T, { R = T * 1.2, cell = 0.024, uv = [ 0, 0 ], disp = null, y0 = 0 } = {} ) {
	const P = shape.getPoints( 12 ).map( p => [ p.x, - p.y ] );
	const a = P[ 0 ], z = P[ P.length - 1 ];
	if ( Math.hypot( a[ 0 ] - z[ 0 ], a[ 1 ] - z[ 1 ] ) < 1e-6 ) P.pop();
	return panel( P, { T, R, cell, uv, disp, y0 } ).geo;
}
// a symmetric outline from a half-width function along x (hem at x0, top at x1); `edge( t )` wiggles the hem
function outline( x0, x1, w, { n = 28, edge = null, top = null } = {} ) {
	const pts = [];
	const hem = 14;
	// the hem, from +z side to -z side (shape y = -z)
	for ( let i = 0; i <= hem; i ++ ) { const t = i / hem, y = w( x0 ) * ( 1 - 2 * t ); pts.push( V2( x0 + ( edge ? edge( t ) : 0 ), y ) ); }
	for ( let i = 1; i <= n; i ++ ) { const x = x0 + ( x1 - x0 ) * i / n; pts.push( V2( x, - w( x ) ) ); }
	for ( let i = 1; i < hem; i ++ ) { const t = i / hem, y = - w( x1 ) * ( 1 - 2 * t ); pts.push( V2( x1 + ( top ? top( t ) : 0 ), y ) ); }
	for ( let i = n; i >= 1; i -- ) { const x = x0 + ( x1 - x0 ) * i / n; pts.push( V2( x, w( x ) ) ); }
	return new THREE.Shape( pts );
}
const smooth = ( a, b, x ) => { const t = Math.max( 0, Math.min( 1, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };
const lerp = ( a, b, t ) => a + ( b - a ) * t;
// a rounded rectangle shape centred on the origin
function rrect( w, d, r ) {
	const s = new THREE.Shape(), x = w / 2, y = d / 2;
	s.moveTo( - x + r, - y ); s.lineTo( x - r, - y ); s.quadraticCurveTo( x, - y, x, - y + r ); s.lineTo( x, y - r ); s.quadraticCurveTo( x, y, x - r, y );
	s.lineTo( - x + r, y ); s.quadraticCurveTo( - x, y, - x, y - r ); s.lineTo( - x, - y + r ); s.quadraticCurveTo( - x, - y, - x + r, - y );
	return s;
}
// bend a geometry's top up into a gentle dome (plates, pads)
function bulge( geo, k, ax = 1, az = 1 ) {
	const p = geo.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ) * ax, z = p.getZ( i ) * az; p.setY( i, p.getY( i ) + Math.max( 0, k - ( x * x + z * z ) * k * 8 ) ); }
	geo.computeVertexNormals();
	return geo;
}
// a lumpy sack from a sphere (bags full of something)
function lump( r, sx, sy, sz, seed = 3, amt = 0.07 ) {
	const g = G.sph( r, 18, 12 ), P = g.attributes.position;
	for ( let i = 0; i < P.count; i ++ ) {
		const x = P.getX( i ), y = P.getY( i ), z = P.getZ( i );
		const k = 1 + Math.sin( x * 29 + z * 13 + seed ) * amt + Math.sin( y * 21 - x * 17 + seed * 2 ) * amt * 0.8;
		P.setXYZ( i, x * k * sx, y * k * sy * ( y < 0 ? 0.8 : 1 ), z * k * sz );
	}
	g.computeVertexNormals();
	return g;
}
const tube = ( pts, r, seg = 24, rs = 6 ) => G.tube( pts, r, seg, rs );
const webbing = ( c = 0x1a1a1a ) => M( c, { rough: 0.9 } );
const buckle = () => M( 0x1e1f22, { rough: 0.5 } );
const steel = () => M( 0xb8bcc2, { rough: 0.35, metal: 0.9 } );
const brass = () => M( 0xc8a050, { rough: 0.3, metal: 0.9 } );

// a printed flat decal: a thin box whose top (y) face shows the label
function decal( g, spec, w, d, pos, rot = null, o = {} ) {
	const geo = new THREE.BoxGeometry( w, 0.0012, d ).translate( 0, 0.0006, 0 );
	// the top face shows the label upright when read from +z
	return add( g, geo, M( 0xffffff, { map: labelTex( spec ), rough: o.rough ?? 0.6, metal: o.metal ?? 0 } ), pos, rot );
}
// a decal standing on a side face (normal along +z), w wide and h tall
function sideDecal( g, spec, w, h, pos, rotY = 0, o = {} ) {
	const geo = new THREE.PlaneGeometry( w, h );
	const m = add( g, geo, M( 0xffffff, { map: labelTex( spec ), rough: o.rough ?? 0.6, metal: o.metal ?? 0 } ), pos, [ 0, rotY, 0 ] );
	m.castShadow = false;
	return m;
}

// alpha-tested materials (nets, veils, jute strands)
const cutMats = new Map();
function cutout( key, tex, o = {} ) {
	let m = cutMats.get( key );
	if ( m ) return m;
	m = new THREE.MeshStandardMaterial( { map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: o.rough ?? 0.85, metalness: 0, color: o.color ?? 0xffffff } );
	patchMaterial( m, 'item' );
	cutMats.set( key, m );
	return m;
}
// a fine mesh net: threads on a transparent ground
function netTex( color, cell = 8, line = 2 ) {
	return canvasTex( `gear:net:${color}:${cell}:${line}`, 128, 128, ( ctx, W, H ) => {
		ctx.clearRect( 0, 0, W, H );
		ctx.strokeStyle = css( color ); ctx.lineWidth = line;
		for ( let i = 0; i <= W; i += cell ) { ctx.beginPath(); ctx.moveTo( i, 0 ); ctx.lineTo( i, H ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( 0, i ); ctx.lineTo( W, i ); ctx.stroke(); }
	}, { repeat: true } );
}
function netMat( color, rep = 6, cell = 8 ) {
	const key = `${color}:${rep}:${cell}`;
	let m = cutMats.get( 'net:' + key );
	if ( m ) return m;
	const t = netTex( color, cell ).clone(); t.repeat.set( rep, rep ); t.needsUpdate = true;
	m = cutout( 'net:' + key, t, { rough: 0.9 } );
	return m;
}

// a copy of a flat part scaled about its own centre in x and z: laid under it, it shows as a rim round the edge
function rimOf( geo, kx, kz ) {
	const r = geo.clone();
	r.computeBoundingBox();
	const c = r.boundingBox.getCenter( new THREE.Vector3() );
	return r.translate( - c.x, 0, - c.z ).scale( kx, 1, kz ).translate( c.x, 0, c.z );
}

// fine netting seen as dark gauze
const gauze = ( c = 0x1a1a1a, op = 0.45 ) => M( c, { rough: 0.9, transparent: true, opacity: op, side: THREE.DoubleSide } );

// kapa (bark cloth): rust-brown ground stamped with black niho (shark-tooth) rows, lines and dots
function kapaTex() {
	return canvasTex( 'gear:kapa', 256, 256, ( ctx, W, H ) => {
		ctx.fillStyle = '#c99c66'; ctx.fillRect( 0, 0, W, H );
		const r = rng( 11 );
		// beaten bark fibres
		for ( let i = 0; i < 1400; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(90,50,20,0.10)' : 'rgba(255,235,200,0.10)'; ctx.fillRect( r() * W, r() * H, 1 + r() * 9, 1 ); }
		const ink = '#24160c', ochre = '#8a3418';
		// a band of big niho (shark teeth), a red diamond band, a band of small teeth, a dotted line: stamped by hand
		ctx.fillStyle = ink;
		for ( let x = 0; x < W; x += 32 ) { ctx.beginPath(); ctx.moveTo( x, 52 ); ctx.lineTo( x + 16, 8 ); ctx.lineTo( x + 32, 52 ); ctx.closePath(); ctx.fill(); }
		ctx.fillRect( 0, 56, W, 4 );
		ctx.fillStyle = ochre;
		for ( let x = 0; x < W; x += 32 ) { ctx.beginPath(); ctx.moveTo( x + 16, 68 ); ctx.lineTo( x + 30, 86 ); ctx.lineTo( x + 16, 104 ); ctx.lineTo( x + 2, 86 ); ctx.closePath(); ctx.fill(); }
		ctx.fillStyle = ink;
		ctx.fillRect( 0, 110, W, 3 );
		for ( let x = 0; x < W; x += 16 ) { ctx.beginPath(); ctx.moveTo( x, 140 ); ctx.lineTo( x + 8, 118 ); ctx.lineTo( x + 16, 140 ); ctx.closePath(); ctx.fill(); }
		ctx.fillRect( 0, 144, W, 3 );
		for ( let x = 8; x < W; x += 16 ) { ctx.beginPath(); ctx.arc( x, 162, 3.5, 0, PI * 2 ); ctx.fill(); }
		ctx.fillRect( 0, 178, W, 6 );
		ctx.fillStyle = ochre; ctx.fillRect( 0, 190, W, 10 );
		ctx.fillStyle = ink;
		for ( let x = 0; x < W; x += 24 ) { ctx.fillRect( x, 210, 12, 12 ); ctx.fillRect( x + 12, 222, 12, 12 ); }
		ctx.fillRect( 0, 240, W, 4 );
	}, { repeat: true } );
}
function kapaMat( rep = 1.5 ) {
	const k = 'kapa:' + rep;
	let m = cutMats.get( k );
	if ( m ) return m;
	const t = kapaTex().clone(); t.repeat.set( rep, rep ); t.needsUpdate = true;
	m = M( 0xffffff, { map: t, rough: 0.95 } );
	cutMats.set( k, m );
	return m;
}

// woven lauhala / straw
const weave = ( c, rep = 3 ) => cloth( c, { weave: 'straw', wrep: rep / 3.5, rough: 0.85, bump: 1 } );

// ======================================================================================================================

export function register( reg ) {
	// ---- dresses and skirts laid flat ----
	reg( 'gear_dress', ( s ) => {
		const g = group(), style = s.style || 'sundress', c = s.color ?? 0xc8283a;
		const clm = cloth( c, { print: s.print, color2: s.color2 ?? 0xffffff, rep: s.rep ?? 1.4, color3: s.color3, weave: 'plain' } );
		const dark = M( shade( c, - 0.3 ), { rough: 0.9 } );
		const trim = M( s.trim ?? shade( c, 0.5 ), { rough: 0.85 } );
		const T = 0.016;
		if ( style === 'sundress' || style === 'gown' ) {
			const gown = style === 'gown';
			const x0 = gown ? - 0.36 : - 0.27, xw = 0.05, x1 = gown ? 0.24 : 0.2, hemW = gown ? 0.25 : 0.21;
			const w = ( x ) => x < xw ? lerp( hemW, 0.075, smooth( x0, xw, x ) ** 0.8 ) : 0.075 + 0.02 * smooth( xw, xw + 0.08, x ) - ( gown ? 0 : 0.01 * smooth( x1 - 0.04, x1, x ) );
			const wave = ( t ) => Math.sin( t * PI * ( gown ? 9 : 7 ) ) * 0.006;
			add( g, soft( outline( x0, x1, w, { edge: wave } ), T, { R: T * 1.6, disp: ( x, z ) => T * 0.25 * Math.sin( z * 40 + x * 8 ) * smooth( x0 + 0.25, x0, x ) } ), clm );
			// a lace or ruffle edge peeking out at the hem
			if ( gown ) add( g, soft( outline( x0 - 0.012, x0 + 0.08, ( x ) => w( Math.max( x0, x ) ) + 0.012, { edge: wave } ), T * 0.7 ), trim, [ 0, - 0.001, 0 ] );
			// the waist seam and the neckline
			add( g, G.box( 0.012, 0.003, w( xw ) * 2 ), dark, [ xw, T, 0 ] );
			if ( gown ) {
				// a high collar and long sleeves laid out from the shoulders, angled back towards the hem (-x), cuffed
				add( g, G.cyl( 0.03, 0.034, 0.012, 14 ).scale( 0.7, 1, 1.2 ), trim, [ x1 - 0.012, T * 0.6, 0 ] );
				const SL = 0.19, ang = 2.35;
				for ( const z of [ - 1, 1 ] ) {
					// a slab's local +x runs down the sleeve: turned to point out to ±z and back
					const rot = - z * ang, dx = Math.cos( ang ), dz = Math.sin( ang ) * z, sx = x1 - 0.06, sz = z * 0.085;
					const sl = soft( outline( 0, SL, ( x ) => lerp( 0.042, 0.03, x / SL ) + Math.sin( x / SL * PI ) * 0.006 ), T * 0.9, { cell: 0.02 } );
					add( g, sl, clm, [ sx, 0, sz ], [ 0, rot, 0 ] );
					add( g, G.box( 0.014, 0.003, 0.066 ), trim, [ sx + dx * ( SL - 0.01 ), T * 0.9, sz + dz * ( SL - 0.01 ) ], [ 0, rot, 0 ] );
				}
				for ( let i = 0; i < 5; i ++ ) add( g, G.cyl( 0.004, 0.004, 0.003, 8 ), trim, [ x1 - 0.04 - i * 0.03, T, 0 ] );
			} else {
				// shoulder straps and a scooped neckline
				for ( const z of [ - 0.055, 0.055 ] ) add( g, G.box( 0.07, 0.006, 0.014 ), clm, [ x1 + 0.03, T * 0.5, z ] );
				add( g, G.cyl( 0.045, 0.045, 0.004, 16, false, ).scale( 0.6, 1, 1 ), dark, [ x1 - 0.004, T - 0.001, 0 ] );
			}
			return ground( g );
		}
		if ( style === 'skirt' ) {
			// pāʻū: three gathered tiers on an elastic waistband
			const x0 = - 0.2, x1 = 0.18;
			const w = ( x ) => lerp( 0.27, 0.17, smooth( x0, x1, x ) );
			const wave = ( t ) => Math.sin( t * PI * 16 ) * 0.007;
			for ( let k = 0; k < 3; k ++ ) {
				const a = x0 + k * 0.09;
				add( g, soft( outline( a, x1, ( x ) => w( x ) + ( 2 - k ) * 0.004, { edge: wave } ), T * 0.9, { R: T, disp: ( x, z ) => T * 0.3 * Math.max( 0, Math.sin( z * 60 ) ) } ), clm, [ 0, k * T * 0.55, 0 ] );
				// gathers: soft ridges running down each tier
				for ( let i = - 3; i <= 3; i ++ ) add( g, G.box( 0.06, 0.002, 0.003 ), dark, [ a + 0.045, k * T * 0.55 + T * 0.75, i * w( a + 0.04 ) * 0.26 ] );
			}
			add( g, G.rbox( 0.03, T * 2.2, w( x1 ) * 2 + 0.01, 0.006 ), M( s.trim ?? shade( c, - 0.2 ), { rough: 0.85 } ), [ x1 - 0.012, 0, 0 ] );
			return ground( g );
		}
		// wrap (lavalava): a length of printed clm folded in three, one end left hanging out with a knot tied in it
		// (squarish, so it still reads as clm in a square icon)
		const L = 0.3, D = 0.24, H = 0.009;
		const hem = M( s.trim ?? shade( c, 0.55 ), { rough: 0.85 } );
		for ( let k = 0; k < 3; k ++ ) {
			add( g, G.rbox( L - k * 0.004, H, D - k * 0.006, 0.004 ), clm, [ k * 0.002, k * H * 0.92, 0 ] );
			add( g, G.box( L - k * 0.004 - 0.01, H * 0.8, 0.006 ), hem, [ k * 0.002, k * H * 0.92 + H * 0.1, ( D - k * 0.006 ) / 2 - 0.001 ] );
		}
		// the folds show as soft ridges across the top
		for ( const x of [ - 0.06, 0.07 ] ) add( g, G.capsX( 0.004, D * 0.9, 6 ).rotateY( PI / 2 ), dark, [ x, H * 2.8, 0 ] );
		// the loose end draped off one side and its knot
		const tail = G.rbox( 0.15, H * 0.8, 0.11, 0.004 ), P = tail.attributes.position;
		for ( let i = 0; i < P.count; i ++ ) P.setY( i, P.getY( i ) - Math.max( 0, P.getX( i ) ) * 0.12 );
		tail.computeVertexNormals();
		add( g, tail, clm, [ L / 2 - 0.01, H * 1.6, 0.05 ], [ 0, - 0.35, 0 ] );
		add( g, G.sph( 0.028, 12, 8 ).scale( 1.25, 0.65, 1 ), clm, [ L / 2 + 0.05, 0.016, 0.085 ] );
		for ( const a of [ - 0.5, 0.6 ] ) add( g, G.sph( 0.022, 10, 6 ).scale( 1.6, 0.3, 0.7 ), clm, [ L / 2 + 0.08, 0.008, 0.085 + a * 0.04 ], [ 0, a, 0 ] );
		return ground( g );
	} );

	// ---- ponchos, an apron, a kapa wrap ----
	reg( 'gear_smock', ( s ) => {
		const g = group(), style = s.style || 'poncho', c = s.color ?? 0x2a5ab0;
		if ( style === 'poncho' ) {
			// folded glossy nylon in a clear store pack, a printed header card across the top end
			const nylon = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: 1, rough: 0.35 } ) : M( c, { rough: 0.3 } ), seam = M( shade( c, - 0.3 ), { rough: 0.5 } );
			add( g, G.rbox( 0.2, 0.026, 0.15, 0.008, 2 ), nylon );
			for ( const z of [ - 0.04, 0.035 ] ) add( g, G.box( 0.18, 0.002, 0.004 ), seam, [ 0, 0.026, z ] );
			add( g, G.rbox( 0.214, 0.03, 0.164, 0.01, 2 ), MAT.glass( 0xe8f0f4, 0.22 ), [ 0, - 0.001, 0 ] );
			decal( g, { bg: 0xf2f2ee, fg: 0x1a3a7a, text: 'RAIN PONCHO', sub: 'ONE SIZE · HOOD', style: 'band', band: c, glyph: 'drop', glyphColor: c, w: 384, h: 160 }, 0.07, 0.15, [ 0.075, 0.03, 0 ], [ 0, PI / 2, 0 ] );
			return ground( g );
		}
		if ( style === 'trash' ) {
			// a black bag slit open and laid out: a hole for the head at the closed end (+x), slits for the arms, the
			// drawstring hem at the open end; crumpled, so the glossy plastic catches the light (a grid, cells in the
			// holes left out)
			const bl = M( c, { rough: 0.16, side: THREE.DoubleSide } );
			const X = 0.31, Z = 0.22, NX = 44, NZ = 30;
			const hole = ( x, z ) => ( ( x - 0.22 ) / 0.045 ) ** 2 + ( z / 0.06 ) ** 2 < 1 || ( Math.abs( x - 0.09 ) < 0.05 && Math.abs( Math.abs( z ) - 0.155 ) < 0.007 );
			const fold = ( v, at, w ) => Math.exp( - ( ( ( v - at ) / w ) ** 2 ) );
			const hgt = ( x, z ) => 0.002 + 0.003 * ( 1 + Math.sin( x * 31 + z * 7 ) ) * ( 0.5 + 0.5 * Math.sin( z * 23 - x * 11 ) )
				+ 0.012 * fold( z, 0.075, 0.014 ) * ( 0.7 + 0.3 * Math.sin( x * 9 ) ) + 0.009 * fold( z, - 0.09, 0.012 ) + 0.006 * fold( x, - 0.05, 0.02 );
			const pos = [], idx = [];
			for ( let j = 0; j <= NZ; j ++ ) for ( let i = 0; i <= NX; i ++ ) { const x = - X + 2 * X * i / NX, z = - Z + 2 * Z * j / NZ; pos.push( x, hgt( x, z ), z ); }
			for ( let j = 0; j < NZ; j ++ ) for ( let i = 0; i < NX; i ++ ) {
				const x = - X + 2 * X * ( i + 0.5 ) / NX, z = - Z + 2 * Z * ( j + 0.5 ) / NZ;
				if ( hole( x, z ) ) continue;
				const a0 = j * ( NX + 1 ) + i, a1 = a0 + 1, b0 = a0 + NX + 1, b1 = b0 + 1;
				idx.push( a0, b0, a1, a1, b0, b1 );
			}
			const sheet = new THREE.BufferGeometry();
			sheet.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
			sheet.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( pos.length / 3 * 2 ), 2 ) );
			sheet.setIndex( idx );
			sheet.computeVertexNormals();
			add( g, sheet, bl );
			// a rolled edge round the head hole (hides the grid's steps)
			add( g, G.torus( 0.05, 0.0045, 4, 28 ).rotateX( PI / 2 ).scale( 0.95, 1, 1.22 ), bl, [ 0.22, hgt( 0.22, 0.06 ) + 0.002, 0 ] );
			// the drawstring hem at the open end and its yellow tie
			add( g, G.capsX( 0.006, 2 * Z, 8 ).rotateY( PI / 2 ), bl, [ - X + 0.004, 0.004, 0 ] );
			add( g, tube( [ [ - X, 0.006, 0.19 ], [ - X - 0.05, 0.005, 0.23 ], [ - X - 0.09, 0.004, 0.19 ], [ - X - 0.07, 0.004, 0.15 ] ], 0.0035, 16 ), M( 0xe8c820, { rough: 0.45 } ) );
			return ground( g );
		}
		if ( style === 'apron' ) {
			// a leather apron laid out: the bib narrower than the skirt, a neck loop and waist ties
			const lea = cloth( c, { weave: 'leather', rough: 0.6 } );
			const w = ( x ) => x > 0.12 ? 0.11 : lerp( 0.2, 0.11, smooth( 0.02, 0.12, x ) );
			add( g, soft( outline( - 0.3, 0.26, w ), 0.008, { R: 0.004, cell: 0.03 } ), lea );
			const stitch = thread( c );
			for ( const k of [ - 1, 1 ] ) add( g, G.box( 0.5, 0.0008, 0.0016 ), stitch, [ - 0.03, 0.0085, k * 0.19 ] );
			add( g, G.torus( 0.08, 0.006, 4, 18, PI ), M( shade( c, - 0.4 ) ), [ 0.26, 0.004, 0 ], [ PI / 2, 0, - PI / 2 ] );
			for ( const z of [ - 1, 1 ] ) add( g, G.box( 0.018, 0.004, 0.2 ), M( shade( c, - 0.4 ) ), [ 0.06, 0.004, z * 0.25 ], [ 0, z * 0.25, 0 ] );
			add( g, G.rbox( 0.12, 0.006, 0.18, 0.005 ), lea, [ - 0.08, 0.008, 0 ] ); // the front pocket
			for ( const z of [ - 0.088, 0.088 ] ) add( g, G.cyl( 0.004, 0.004, 0.002, 8 ), brass(), [ - 0.025, 0.014, z ] );
			return ground( g );
		}
		// kihei: a kapa cape laid out, two corners knotted at the shoulder
		const kapa = kapaMat( 1.1 );
		const w = ( x ) => lerp( 0.25, 0.17, smooth( - 0.24, 0.2, x ) );
		const geo = soft( outline( - 0.24, 0.2, w, { edge: ( t ) => Math.sin( t * PI * 3 ) * 0.01 } ), 0.008, { R: 0.006, cell: 0.02, disp: ( x, z ) => Math.max( 0, Math.sin( z * 26 ) * 0.006 ) } );
		{ const u = geo.attributes.uv; for ( let i = 0; i < u.count; i ++ ) u.setXY( i, u.getX( i ) * 0.66, u.getY( i ) * 0.66 ); }
		add( g, geo, kapa );
		add( g, G.sph( 0.035, 12, 8 ).scale( 1.2, 0.75, 1 ), kapa, [ 0.21, 0.012, 0.12 ] );
		for ( const a of [ - 0.4, 0.5 ] ) add( g, G.cone( 0.022, 0.08, 8 ).rotateZ( - PI / 2 ).scale( 1, 0.35, 1 ), kapa, [ 0.25, 0.008, 0.12 ], [ 0, a, 0 ] );
		return ground( g );
	} );

	// ---- hats with something extra: a long-backed rain hat, a beekeeper veil, nets, a ghillie hood, a feather band ----
	reg( 'gear_hat', ( s ) => {
		const g = group(), style = s.style || 'sou_wester', c = s.color ?? 0xf0c020;
		switch ( style ) {
			case 'sou_wester': {
				const oil = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: 1, rough: 0.35 } ) : M( c, { rough: 0.3 } );
				const crown = G.sph( 0.095, 18, 10, 0, PI * 2, 0, PI / 2 ); crown.scale( 1, 0.72, 0.95 );
				add( g, crown, oil, [ 0, 0.012, 0 ] );
				add( g, G.cyl( 0.096, 0.098, 0.016, 18, true ), oil, [ 0, 0.004, 0 ] );
				// the brim: short over the eyes, long down the back (towards -x), drooping
				const sh = new THREE.Shape(), hole = new THREE.Path();
				for ( let i = 0; i <= 40; i ++ ) { const a = i / 40 * PI * 2, back = Math.max( 0, - Math.cos( a ) ); const r = 0.15 + back * back * 0.09; ( i ? sh.lineTo.bind( sh ) : sh.moveTo.bind( sh ) )( Math.cos( a ) * r - back * 0.03, Math.sin( a ) * r * 0.95 ); }
				hole.absellipse( 0, 0, 0.098, 0.093, 0, PI * 2, true );
				sh.holes.push( hole );
				const brim = slab( sh, 0.006, { bevel: 0.001, uv: 1 } ), P = brim.attributes.position;
				for ( let i = 0; i < P.count; i ++ ) { const d = Math.hypot( P.getX( i ), P.getZ( i ) ); P.setY( i, P.getY( i ) - Math.max( 0, d - 0.1 ) * 0.45 ); }
				brim.computeVertexNormals();
				add( g, brim, oil, [ 0, 0.04, 0 ] );
				// stitching round the brim and up the crown
				for ( const rr of [ 0.12, 0.14 ] ) add( g, G.torus( rr, 0.0013, 3, 32 ), M( shade( c, - 0.3 ) ), [ 0, 0.04 - ( rr - 0.1 ) * 0.45 + 0.004, 0 ], [ PI / 2, 0, 0 ] );
				for ( let i = 0; i < 6; i ++ ) add( g, G.torus( 0.094, 0.0013, 3, 18, PI / 2 ), M( shade( c, - 0.3 ) ), [ 0, 0.012, 0 ], [ 0, i * PI / 3, 0 ], [ 1, 0.72, 0.95 ] );
				add( g, G.torus( 0.09, 0.003, 4, 20, PI ), M( 0x2a2a2a ), [ 0, 0.03, 0 ], [ PI / 2, 0, PI / 2 ] ); // chin strap
				break;
			}
			case 'veil': {
				// a round white hat, its black mesh veil slumped round it in folds down to a white cloth hem
				const hat = M( c, { rough: 0.6 } ), white = M( 0xf2f2ee, { rough: 0.85, side: THREE.DoubleSide } );
				// an open frustum with folds that deepen towards the bottom (k0 at the top, k1 at the bottom)
				const drape = ( r0, r1, h, k0, k1 ) => {
					const geo = new THREE.CylinderGeometry( r0, r1, h, 48, 3, true ), P = geo.attributes.position;
					for ( let i = 0; i < P.count; i ++ ) {
						const x = P.getX( i ), z = P.getZ( i ), t = 0.5 - P.getY( i ) / h, a = Math.atan2( z, x );
						const f = 1 + ( Math.sin( a * 11 ) + 0.5 * Math.sin( a * 5 + 1.3 ) ) * lerp( k0, k1, t );
						P.setX( i, x * f ); P.setZ( i, z * f );
					}
					geo.computeVertexNormals();
					return geo.translate( 0, h / 2, 0 );
				};
				const R0 = 0.15, R1 = 0.215, VH = 0.11, HEM = 0.022, CO = 0.02;
				add( g, drape( R1, R1 + 0.01, HEM, 0.05, 0.055 ), white );
				const net = drape( R0, R1, VH, 0.004, 0.05 );
				add( g, net, gauze( 0x121212, 0.5 ), [ 0, HEM, 0 ] );
				add( g, net, netMat( 0x080808, 12, 8 ), [ 0, HEM, 0 ] );
				add( g, drape( R0 - 0.002, R0, CO, 0.004, 0.004 ), white, [ 0, HEM + VH, 0 ] ); // the cloth collar under the brim
				const top = HEM + VH + CO;
				add( g, G.cyl( 0.19, 0.19, 0.005, 32 ), hat, [ 0, top, 0 ] );
				add( g, G.torus( 0.19, 0.004, 4, 40 ), hat, [ 0, top + 0.0025, 0 ], [ PI / 2, 0, 0 ] );
				const dome = G.sph( 0.105, 20, 9, 0, PI * 2, 0, PI / 2 ); dome.scale( 1.05, 0.85, 1 );
				add( g, dome, hat, [ 0, top + 0.004, 0 ] );
				add( g, G.cyl( 0.108, 0.11, 0.018, 24, true ), M( shade( c, - 0.12 ), { rough: 0.7 } ), [ 0, top + 0.004, 0 ] );
				for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2; add( g, G.box( 0.026, 0.004, 0.006 ), M( 0x8a8a84 ), [ Math.cos( a ) * 0.075, top + 0.06, Math.sin( a ) * 0.075 ], [ 0, - a, 0.6 ] ); }
				break;
			}
			case 'boonie_net': {
				const clm = cloth( c, { print: s.print || 'woodland', color2: s.color2 ?? 0x3a3525, rep: 1.6, weave: 'ripstop' } );
				add( g, G.cyl( 0.08, 0.095, 0.075, 16 ), clm, [ 0, 0.02, 0 ] );
				add( g, G.cyl( 0.15, 0.1, 0.03, 18, true ), clm, [ 0, 0, 0 ] );
				add( g, G.cyl( 0.097, 0.097, 0.012, 16, true ), M( shade( c, - 0.3 ) ), [ 0, 0.022, 0 ] );
				// the net rolled round the crown, a fold of it hanging over the brim
				add( g, G.torus( 0.1, 0.014, 6, 24 ), M( 0x3a4028, { rough: 0.95 } ), [ 0, 0.05, 0 ], [ PI / 2, 0, 0 ] );
				const drape = new THREE.CylinderGeometry( 0.105, 0.17, 0.07, 22, 1, true, - PI * 0.45, PI * 0.9 );
				add( g, drape, gauze( 0x2e3420, 0.55 ), [ 0, 0.015, 0 ] );
				break;
			}
			case 'ghillie': {
				// a hood shell hidden under jute strands in four colours
				const base = M( 0x3a4228, { rough: 0.95 } );
				const hood = G.sph( 0.12, 16, 10, 0, PI * 2, 0, PI * 0.55 ); hood.scale( 1.15, 1, 1 );
				add( g, hood, base, [ 0, 0.01, 0 ] );
				const cols = [ 0x4a5530, 0x5e6a3a, 0x3a3525, 0x6d6a45 ].map( x => M( x, { rough: 0.95 } ) );
				const r = rng( 21 );
				// strands rooted over the hood, hanging and splaying outwards
				for ( let i = 0; i < 220; i ++ ) {
					const a = r() * PI * 2, el = 0.15 + r() * 1.3, len = 0.06 + r() * 0.12;
					const cx = Math.cos( a ) * Math.cos( el ) * 0.14, cz = Math.sin( a ) * Math.cos( el ) * 0.12, cy = 0.015 + Math.sin( el ) * 0.115;
					const tilt = 0.5 + ( 1.4 - el ) * 0.7 + r() * 0.4;
					const geo = G.box( 0.002 + r() * 0.002, len, 0.006 + r() * 0.006 ).translate( 0, - len * 0.5, 0 );
					add( g, geo, cols[ i % 4 ], [ cx, cy + 0.01, cz ], [ Math.sin( a ) * tilt, r() * PI, - Math.cos( a ) * tilt ] );
				}
				return ground( g );
			}
			default: { // lei: a lauhala hat with a band of red and yellow feathers
				const straw = weave( c, 3 );
				add( g, G.cyl( 0.17, 0.17, 0.006, 24 ), straw );
				add( g, G.cyl( 0.075, 0.09, 0.09, 18 ), straw, [ 0, 0.004, 0 ] );
				const red = M( s.color2 ?? 0xd83a2a, { rough: 0.8 } ), yel = M( s.color3 ?? 0xf2c230, { rough: 0.8 } );
				for ( let i = 0; i < 34; i ++ ) {
					const a = i / 34 * PI * 2;
					add( g, G.sph( 0.016, 8, 5 ).scale( 1.5, 0.55, 0.7 ), i % 3 ? red : yel, [ Math.cos( a ) * 0.091, 0.022 + ( i % 2 ) * 0.008, Math.sin( a ) * 0.091 ], [ 0, - a + PI / 2, 0.35 ] );
				}
			}
		}
		return ground( g );
	} );

	// ---- helmets ----
	reg( 'gear_helmet', ( s ) => {
		const g = group(), style = s.style || 'bike', c = s.color ?? 0x2a8ad6;
		const shell = M( c, { rough: 0.3 } ), acc = M( s.color2 ?? 0x1a1a1a, { rough: 0.45 } ), black = M( 0x0c0c0e, { rough: 0.6 } );
		switch ( style ) {
			case 'motocross': {
				add( g, G.sph( 0.135, 20, 14 ).scale( 1.12, 0.98, 0.92 ), shell, [ 0, 0.14, 0 ] );
				// the eye port, the chin bar pushed forward, the peak
				add( g, G.rbox( 0.06, 0.07, 0.17, 0.02 ), black, [ 0.125, 0.12, 0 ] );
				const chin = G.rbox( 0.1, 0.075, 0.19, 0.03 );
				add( g, chin, acc, [ 0.13, 0.03, 0 ], [ 0, 0, - 0.25 ] );
				for ( let i = 0; i < 3; i ++ ) add( g, G.box( 0.012, 0.006, 0.05 ), black, [ 0.175, 0.045 + i * 0.016, 0 ], [ 0, 0, - 0.25 ] ); // vents
				const peak = G.rbox( 0.11, 0.007, 0.17, 0.004 );
				add( g, peak, M( s.visor ?? s.color2 ?? 0xe8601a, { rough: 0.35 } ), [ 0.13, 0.225, 0 ], [ 0, 0, 0.42 ] );
				for ( const z of [ - 0.1, 0.1 ] ) add( g, G.box( 0.12, 0.02, 0.004 ), M( s.stripe ?? 0x1a1a1a ), [ - 0.02, 0.17, z * 1.18 ], [ 0, 0, - 0.2 ] );
				add( g, G.cyl( 0.12, 0.13, 0.03, 18, true ), black, [ 0, 0.005, 0 ] );
				// goggles strapped round the back
				add( g, G.torus( 0.135, 0.01, 4, 26, PI * 1.2 ), M( s.color2 ?? 0xe8601a, { rough: 0.6 } ), [ - 0.005, 0.15, 0 ], [ PI / 2, 0, PI * 0.4 ] );
				break;
			}
			case 'pilot': {
				add( g, G.sph( 0.135, 20, 14 ).scale( 1.05, 1, 0.95 ), shell, [ 0, 0.13, 0 ] );
				// the visor housing over the brow, the tinted visor down, a boom mic
				add( g, G.torus( 0.128, 0.016, 6, 24, PI * 0.6 ), shell, [ 0, 0.15, 0 ], [ PI / 2, 0, - PI * 0.3 ] );
				const visor = G.sph( 0.138, 16, 8, - PI * 0.32, PI * 0.64, PI * 0.38, PI * 0.25 ); visor.rotateY( PI / 2 );
				add( g, visor, M( s.visor ?? 0x2a2a30, { rough: 0.05, metal: 0.7 } ), [ 0, 0.13, 0 ], null, [ 1.07, 1, 0.98 ] );
				add( g, G.cyl( 0.12, 0.125, 0.025, 18, true ), black, [ 0, 0.005, 0 ] );
				add( g, tube( [ [ 0, 0.06, 0.125 ], [ 0.08, 0.04, 0.12 ], [ 0.14, 0.04, 0.05 ] ], 0.004, 16 ), black );
				add( g, G.sph( 0.012, 8, 6 ), black, [ 0.145, 0.04, 0.04 ] );
				for ( const z of [ - 1, 1 ] ) add( g, G.cyl( 0.035, 0.035, 0.02, 14 ), acc, [ - 0.005, 0.09, z * 0.122 ], [ PI / 2, 0, 0 ] ); // ear cups
				break;
			}
			case 'football': {
				add( g, G.sph( 0.135, 20, 14 ).scale( 1.1, 1, 0.95 ), shell, [ 0, 0.14, 0 ] );
				const cage = M( s.color2 ?? 0x9aa0a6, { rough: 0.4, metal: 0.3 } );
				for ( const [ y, r ] of [ [ 0.05, 0.12 ], [ 0.09, 0.13 ], [ 0.13, 0.13 ] ] ) add( g, G.torus( r, 0.006, 6, 20, PI * 0.75 ), cage, [ 0.03, y, 0 ], [ PI / 2, 0, - PI * 0.375 ] );
				for ( const z of [ - 0.045, 0.045 ] ) add( g, G.cyl( 0.006, 0.006, 0.1, 6 ), cage, [ 0.155, 0.09, z ] );
				add( g, G.torus( 0.137, 0.012, 4, 24, PI ), M( s.stripe ?? 0xf2f2ee ), [ 0, 0.14, 0 ], [ 0, 0, 0 ] );
				for ( const z of [ - 1, 1 ] ) add( g, G.cyl( 0.016, 0.016, 0.006, 12 ), black, [ - 0.005, 0.11, z * 0.128 ], [ PI / 2, 0, 0 ] );
				add( g, G.cyl( 0.12, 0.125, 0.03, 18, true ), black, [ 0, 0.005, 0 ] );
				// a chin cup on its strap
				add( g, G.sph( 0.03, 10, 6, 0, PI * 2, 0, PI / 2 ).scale( 1, 0.5, 1.3 ), M( 0xf2f2ee, { rough: 0.5 } ), [ 0.14, 0, 0 ] );
				break;
			}
			default: { // bike: a long vented shell
				const sh = G.sph( 0.13, 24, 10, 0, PI * 2, 0, PI / 2 ), P = sh.attributes.position;
				// stretch the back out into a tail
				for ( let i = 0; i < P.count; i ++ ) { const x = P.getX( i ); if ( x < 0 ) P.setX( i, x * ( 1.25 + ( 0.13 - P.getY( i ) ) * 1.5 ) ); }
				sh.scale( 1.18, 0.72, 0.92 ); sh.computeVertexNormals();
				add( g, sh, shell, [ 0, 0.01, 0 ] );
				// vents: a row down the middle and two on each side, following the shell
				const yAt = ( x, z ) => 0.01 + 0.13 * 0.72 * Math.sqrt( Math.max( 0, 1 - ( x / ( 0.13 * 1.18 * ( x < 0 ? 1.4 : 1 ) ) ) ** 2 - ( z / ( 0.13 * 0.92 ) ) ** 2 ) );
				for ( const z of [ - 0.06, - 0.03, 0, 0.03, 0.06 ] ) for ( let i = 0; i < 3; i ++ ) {
					const x = 0.07 - i * 0.065 + Math.abs( z ) * 0.3;
					add( g, G.rbox( 0.045, 0.02, 0.012, 0.005 ), black, [ x, yAt( x, z ) - 0.016, z ], [ z * 4, 0, 0 ] );
				}
				add( g, G.rbox( 0.05, 0.006, 0.17, 0.003 ), acc, [ 0.15, 0.04, 0 ], [ 0, 0, 0.35 ] ); // the peak
				add( g, G.cyl( 0.13, 0.14, 0.012, 24, true ).scale( 1.2, 1, 0.9 ), black, [ - 0.01, 0.004, 0 ] );
				for ( const z of [ - 1, 1 ] ) add( g, tube( [ [ 0.02, 0.01, z * 0.1 ], [ 0.07, - 0.002, z * 0.16 ], [ 0.12, - 0.002, z * 0.08 ] ], 0.004, 10 ), black );
			}
		}
		return ground( g );
	} );

	// ---- masks ----
	reg( 'gear_mask', ( s ) => {
		const g = group(), c = s.color ?? 0xf0ece0;
		if ( s.style === 'hockey' ) {
			// the goalie mask lying face up: a shallow white shell, eye holes, breathing holes, red flashes
			const a = 0.12, b = 0.09, h = 0.055;
			const shell = G.sph( 1, 22, 12, 0, PI * 2, 0, PI / 2 ); shell.scale( a, h, b );
			add( g, shell, M( c, { rough: 0.35 } ) );
			const hole = M( 0x0a0a0a, { rough: 0.9 } );
			const at = ( x, z ) => h * Math.sqrt( Math.max( 0, 1 - ( x / a ) ** 2 - ( z / b ) ** 2 ) );
			for ( const z of [ - 0.03, 0.03 ] ) add( g, G.cyl( 0.016, 0.016, 0.004, 14 ).scale( 1.3, 1, 1 ), hole, [ 0.03, at( 0.03, z ) - 0.001, z ] );
			for ( let i = 0; i < 4; i ++ ) for ( let j = 0; j < 3; j ++ ) { const x = - 0.025 - i * 0.017, z = ( j - 1 ) * 0.016; add( g, G.cyl( 0.004, 0.004, 0.004, 8 ), hole, [ x, at( x, z ) - 0.001, z ] ); }
			const red = M( s.color2 ?? 0xc8282a, { rough: 0.4 } );
			const tri = ( x, z, size, rot ) => add( g, G.cyl( size, size, 0.004, 3 ), red, [ x, at( x, z ) - 0.0015, z ], [ 0, rot, 0 ] );
			tri( 0.085, 0, 0.014, PI / 2 ); tri( 0.072, - 0.03, 0.01, PI / 2 ); tri( 0.072, 0.03, 0.01, PI / 2 );
			for ( const z of [ - 1, 1 ] ) tri( - 0.01, z * 0.055, 0.012, - PI / 2 );
			for ( const z of [ - 1, 1 ] ) add( g, G.box( 0.012, 0.003, 0.09 ), M( 0x1a1a1a ), [ 0.0, 0.003, z * 0.13 ] );
			return ground( g );
		}
		// civil defence mask: a rubber face, two round eyepieces, one filter at the chin, the harness spread out
		const rubber = M( c, { rough: 0.85 } );
		const face = G.sph( 0.09, 18, 10, 0, PI * 2, 0, PI / 2 ); face.scale( 1.35, 0.62, 0.9 );
		add( g, face, rubber );
		add( g, G.torus( 0.088, 0.006, 5, 24 ), rubber, [ 0, 0.003, 0 ], [ PI / 2, 0, 0 ], [ 1.35, 0.9, 1 ] );
		for ( const z of [ - 0.035, 0.035 ] ) {
			add( g, G.cyl( 0.026, 0.026, 0.012, 16 ), M( 0x6a6a60, { rough: 0.4, metal: 0.6 } ), [ 0.03, 0.045, z ] );
			add( g, G.cyl( 0.021, 0.021, 0.013, 16 ), MAT.glass( 0x8aa8b0, 0.5 ), [ 0.03, 0.046, z ] );
		}
		const can = M( 0x4a5034, { rough: 0.5, metal: 0.4 } );
		add( g, G.cylX( 0.045, 0.06, 18 ), can, [ - 0.135, 0.045, 0 ], [ 0, 0, 0.35 ] );
		for ( let i = 0; i < 3; i ++ ) add( g, G.cylX( 0.047, 0.004, 18 ), M( 0x2a2e1e, { rough: 0.6 } ), [ - 0.115 - i * 0.02, 0.038 + i * 0.007, 0 ], [ 0, 0, 0.35 ] );
		for ( const z of [ - 1, 1 ] ) add( g, G.box( 0.14, 0.003, 0.014 ), rubber, [ 0.12, 0.003, z * 0.07 ], [ 0, z * 0.35, 0 ] );
		return ground( g );
	} );

	// ---- pads ----
	reg( 'gear_pads', ( s ) => {
		const g = group(), c = s.color ?? 0xf2f2ee;
		const hard = M( c, { rough: 0.35 } ), acc = M( s.color2 ?? 0x1a1a1a, { rough: 0.6 } ), strap = webbing();
		if ( s.style === 'chest' ) {
			// a motocross roost guard laid face up: a moulded chest plate (neck scoop at +x) over a hinged belly plate,
			// shoulder caps of two overlapping shells, every plate edged in black foam, vent slots, a flash down each side
			const edge = M( 0x151515, { rough: 0.85 } ), vent = M( 0x2a2a2a, { rough: 0.7 } );
			const chest = new THREE.Shape();
			chest.moveTo( - 0.02, - 0.15 ); chest.lineTo( 0.12, - 0.15 ); chest.quadraticCurveTo( 0.16, - 0.12, 0.16, - 0.06 ); chest.quadraticCurveTo( 0.11, 0, 0.16, 0.06 );
			chest.quadraticCurveTo( 0.16, 0.12, 0.12, 0.15 ); chest.lineTo( - 0.02, 0.15 ); chest.quadraticCurveTo( - 0.045, 0, - 0.02, - 0.15 );
			const K = 0.018, AX = 1.4, AZ = 1.15, CX = 0.06;
			const cg = slab( chest, 0.008, { bevel: 0.002, uv: 1, curve: 8 } ).translate( - CX, 0, 0 );
			bulge( cg, K, AX, AZ ).translate( CX, 0, 0 );
			add( g, cg, hard, [ 0, 0.01, 0 ] );
			add( g, rimOf( cg, 1.045, 1.04 ), edge, [ 0, 0.007, 0 ] );
			// the plate's height at (x, z): vents and flashes sit on it
			const yAt = ( x, z ) => 0.01 + 0.01 + Math.max( 0, K - ( ( ( x - CX ) * AX ) ** 2 + ( z * AZ ) ** 2 ) * K * 8 );
			const belly = bulge( slab( rrect( 0.15, 0.24, 0.045 ), 0.008, { bevel: 0.002, uv: 1, curve: 6 } ), 0.012, 1.6, 1.2 );
			add( g, belly, hard, [ - 0.115, 0.004, 0 ] );
			add( g, rimOf( belly, 1.06, 1.04 ), edge, [ - 0.115, 0.001, 0 ] );
			for ( const z of [ - 0.06, 0.06 ] ) add( g, G.box( 0.05, 0.006, 0.03 ), edge, [ - 0.035, 0.012, z ] ); // the hinge straps
			for ( const z of [ - 1, 1 ] ) {
				// the shoulder cap: a long half dome over the plate's corner, open side in, edged, a moulded ridge across it
				const cap = G.sph( 0.065, 12, 5, 0, PI, 0, PI / 2 ); cap.scale( 1.35, 0.32, 0.8 );
				const cp = [ 0.1, 0.014, z * 0.13 ], cr = [ 0, z > 0 ? 0 : PI, 0 ];
				add( g, cap, hard, cp, cr );
				const rim = G.torus( 0.065, 0.0045, 3, 14, PI ); rim.rotateX( PI / 2 ).scale( 1.35, 1, 0.8 );
				add( g, rim, edge, cp, cr );
				add( g, G.torus( 0.045, 0.0025, 3, 12, PI ).rotateX( PI / 2 ).scale( 1.35, 1, 0.8 ), edge, [ cp[ 0 ], 0.03, cp[ 2 ] ], cr );
				// a flash of colour down the side of the chest plate, three vent slots beside it
				const fx = 0.06, fz = z * 0.105;
				add( g, G.rbox( 0.17, 0.004, 0.022, 0.003, 1 ), acc, [ fx, yAt( fx, fz ) - 0.001, fz ], [ z * 0.12, - z * 0.12, 0 ] );
				for ( let i = 0; i < 3; i ++ ) { const vx = 0.02 + i * 0.035, vz = z * 0.05; add( g, G.box( 0.024, 0.004, 0.007 ), vent, [ vx, yAt( vx, vz ) - 0.001, vz ], [ 0, z * 0.5, 0 ] ); }
				// side straps with buckles
				add( g, G.box( 0.025, 0.004, 0.11 ), strap, [ - 0.13, 0.003, z * 0.165 ] );
				add( g, G.box( 0.03, 0.008, 0.02 ), buckle(), [ - 0.13, 0.005, z * 0.215 ] );
			}
			// a maker's badge at the neck
			add( g, G.rbox( 0.03, 0.003, 0.05, 0.004 ), acc, [ 0.125, yAt( 0.125, 0 ) - 0.0005, 0 ] );
			return ground( g );
		}
		// skate pads: two knee pads and two elbow pads, hard caps over foam
		const foam = M( c, { rough: 0.85 } );
		const one = ( x, z, k ) => {
			add( g, G.rbox( 0.13 * k, 0.04 * k, 0.1 * k, 0.018 * k, 2 ), foam, [ x, 0, z ] );
			const cap = G.sph( 0.06 * k, 14, 8, 0, PI * 2, 0, PI / 2 ); cap.scale( 1.1, 0.5, 0.8 );
			add( g, cap, acc, [ x, 0.036 * k, z ] );
			for ( const dx of [ - 0.045, 0.045 ] ) add( g, G.box( 0.022 * k, 0.004, 0.14 * k ), strap, [ x + dx * k, 0.02 * k, z ] );
		};
		one( 0.08, - 0.07, 1 ); one( 0.08, 0.07, 1 ); one( - 0.08, - 0.06, 0.78 ); one( - 0.08, 0.06, 0.78 );
		return ground( g );
	} );

	// ---- vests and rigs ----
	reg( 'gear_vest', ( s ) => {
		const c = s.color ?? 0x2a2e26, style = s.style || 'tactical';
		const cl = cloth( c, { print: s.print, color2: s.color2 ?? 0xffffff, rep: 1.6, weave: s.print ? 'ripstop' : 'canvas' } );
		const strap = webbing( shade( c, - 0.35 ) );
		if ( style === 'tactical' ) {
			// the carrier (clothing.js), thin and slack when its plate pockets are empty; scrap plates poke out, taped
			return vestModel( { style: 'plate', color: c, print: s.print, color2: s.color2 ?? shade( c, - 0.2 ), thick: s.plates ? 0.036 : 0.016,
				onFront: ( g, top, T ) => {
					if ( ! s.plates ) add( g, G.box( 0.16, 0.004, 0.006 ), M( 0x0c0c0c, { rough: 0.9 } ), [ 0, top( 0, - 0.138 ) - 0.002, - 0.138 ] ); // the empty pocket's mouth
					if ( s.plates === 'scrap' ) {
						const sheet = M( 0x8a8e94, { rough: 0.4, metal: 0.8 } ), tape = M( 0x9a9ea4, { rough: 0.5, metal: 0.35 } );
						add( g, G.box( 0.17, 0.012, 0.03 ), sheet, [ 0.005, T - 0.016, - 0.155 ], [ 0.12, 0.03, 0 ] );
						for ( const x of [ - 0.06, 0.05 ] ) add( g, G.box( 0.036, 0.016, 0.034 ), tape, [ x, T - 0.017, - 0.152 ], [ 0.12, 0.03, 0 ] );
					}
				} } );
		}
		const g = group();
		if ( style === 'bandolier' ) {
			// a leather sash laid in a loop, shotgun shells in elastic loops along the front half
			const lea = cloth( c, { weave: 'leather', rough: 0.6 } ), shell = M( s.color2 ?? 0xc8282a, { rough: 0.5 } ), b = brass(), loop = M( shade( c, - 0.3 ), { rough: 0.8 } );
			const RX = 0.24, RZ = 0.13, at = ( a ) => [ Math.cos( a ) * RX, Math.sin( a ) * RZ ];
			const P = []; for ( let i = 0; i < 24; i ++ ) { const [ x, z ] = at( i / 24 * PI * 2 ); P.push( [ x, 0.003, z ] ); }
			add( g, band( P, 0.05, 0.006, { closed: true, seg: 56, round: true } ), lea );
			for ( const y of [ 0.0062, 0.0064 ] ) add( g, band( P.map( p => [ p[ 0 ] * ( y > 0.0063 ? 1.085 : 0.915 ), y, p[ 2 ] * ( y > 0.0063 ? 1.16 : 0.84 ) ] ), 0.0014, 0.0006, { closed: true, seg: 48 } ), thread( c ) );
			for ( let i = 0; i < 14; i ++ ) {
				const a = PI * 0.15 + i / 13 * PI * 0.7, [ x, z ] = at( a ), tang = Math.atan2( Math.cos( a ) * RZ, - Math.sin( a ) * RX );
				const grp = new THREE.Group(); grp.position.set( x, 0.006, z ); grp.rotation.set( 0, - tang + PI / 2, 0 );
				add( grp, G.cylX( 0.0105, 0.048, 10 ), shell, [ 0.004, 0.0105, 0 ] );
				add( grp, G.cylX( 0.011, 0.014, 10 ), b, [ - 0.027, 0.0105, 0 ] );
				add( grp, G.box( 0.024, 0.023, 0.012 ), loop, [ 0.004, 0, 0 ] );
				g.add( grp );
			}
			add( g, G.rbox( 0.045, 0.012, 0.06, 0.003, 1 ), b, [ - RX, 0.003, 0 ] );
			add( g, G.box( 0.034, 0.004, 0.004 ), M( 0x2a2a2a, { rough: 0.5, metal: 0.6 } ), [ - RX + 0.004, 0.016, 0 ] );
			return ground( g );
		}
		// legrig: a thigh panel, two magazine pouches, leg straps and the drop strap up to the belt
		const w = ( x ) => 0.075 + 0.012 * Math.sin( ( x + 0.14 ) / 0.28 * PI );
		const P = []; for ( let i = 0; i <= 12; i ++ ) { const x = - 0.14 + i / 12 * 0.28; P.push( [ x, - w( x ) ] ); } for ( let i = 12; i >= 0; i -- ) { const x = - 0.14 + i / 12 * 0.28; P.push( [ x, w( x ) ] ); }
		const pn = panel( P, { T: 0.014, R: 0.008, cell: 0.03, uv: [ 0, 0 ] } );
		add( g, pn.geo, cl );
		for ( const z of [ - 0.035, 0.035 ] ) pouchOn( g, pn.top, - 0.01, z, 0.11, 0.055, 0.03, cl, { snap: false, bungee: false } );
		for ( const z of [ - 0.035, 0.035 ] ) add( g, G.rbox( 0.04, 0.008, 0.06, 0.004, 1 ), cl, [ 0.04, pn.top( 0.04, z ) + 0.028, z ] );
		for ( const x of [ - 0.09, 0.07 ] ) {
			add( g, band( [ [ x, 0.004, - 0.15 ], [ x, pn.top( x, 0 ) + 0.002, - 0.06 ], [ x, pn.top( x, 0 ) + 0.002, 0.06 ], [ x, 0.004, 0.15 ] ], 0.025, 0.003, { seg: 10 } ), strap );
			add( g, G.rbox( 0.03, 0.01, 0.026, 0.003, 1 ), buckle(), [ x, 0.006, 0.13 ] );
		}
		add( g, band( [ [ 0.13, 0.008, 0 ], [ 0.2, 0.005, 0.004 ], [ 0.27, 0.004, 0 ] ], 0.03, 0.003, { seg: 6 } ), strap );
		add( g, G.rbox( 0.025, 0.012, 0.04, 0.004, 1 ), buckle(), [ 0.29, 0.004, 0 ] );
		return ground( g );
	} );

	// ---- armour plates ----
	reg( 'gear_plate', ( s ) => {
		const g = group(), scrap = s.style === 'scrap';
		// shooter's cut corners at +x
		const sh = new THREE.Shape(), X = 0.15, Z = 0.125, cut = 0.05;
		const r = rng( 9 ), j = ( v ) => v + ( scrap ? ( r() - 0.5 ) * 0.012 : 0 );
		sh.moveTo( j( - X ), j( - Z ) ); sh.lineTo( j( X - cut ), j( - Z ) ); sh.lineTo( j( X ), j( - Z + cut ) ); sh.lineTo( j( X ), j( Z - cut ) ); sh.lineTo( j( X - cut ), j( Z ) ); sh.lineTo( j( - X ), j( Z ) ); sh.closePath();
		const geo = slab( sh, 0.012, { bevel: 0.003, uv: 1 } );
		const P = geo.attributes.position;
		for ( let i = 0; i < P.count; i ++ ) { const z = P.getZ( i ), x = P.getX( i ); P.setY( i, P.getY( i ) + 0.022 - z * z * 1.4 + ( scrap ? Math.sin( x * 60 ) * Math.sin( z * 50 ) * 0.002 : 0 ) ); }
		geo.computeVertexNormals();
		add( g, geo, scrap ? M( 0x8a8e94, { rough: 0.45, metal: 0.85 } ) : M( 0x7d6a4c, { rough: 0.85 } ) );
		// a steel plate is coated (coyote bedliner) with a dark edge seal
		if ( ! scrap ) add( g, rimOf( geo, 1.04, 1.05 ), M( 0x232325, { rough: 0.7 } ), [ 0, - 0.002, 0 ] );
		if ( scrap ) {
			// duct tape round the edges, rivets where two sheets were joined
			const tape = M( 0x9a9ea4, { rough: 0.5, metal: 0.4 } );
			for ( const x of [ - X + 0.015, X - 0.03 ] ) add( g, G.box( 0.035, 0.003, 0.2 ), tape, [ x, 0.035, 0 ] );
			for ( let i = 0; i < 5; i ++ ) add( g, G.sph( 0.005, 6, 4 ), M( 0x6a6e74, { rough: 0.4, metal: 0.9 } ), [ - 0.06 + i * 0.03, 0.036, 0 ] );
		} else decal( g, { bg: 0xf2f2ee, fg: 0x1a1a1a, text: 'LEVEL III', sub: 'STAND ALONE · 10x12', style: 'plain', w: 256, h: 128 }, 0.08, 0.05, [ 0, 0.035, 0 ], [ 0, PI / 2, 0 ] );
		return ground( g );
	} );

	// ---- a rolling suitcase standing on its spinner wheels ----
	reg( 'gear_suitcase', ( s ) => {
		const g = group(), c = s.color ?? 0x2a4a7a;
		const shell = M( c, { rough: 0.28 } ), dark = M( s.color2 ?? 0x1a1a1a, { rough: 0.55 } ), metal = M( 0xa8acb2, { rough: 0.3, metal: 0.85 } );
		const W = 0.44, H = 0.64, D = 0.27, y0 = 0.055;
		// two shells (front deeper), ribbed in long grooves, zipped together round the middle
		const rib = ( x, y, z ) => { const front = z > 0 ? 1 : - 1, f = Math.abs( z ) > D * 0.3 ? 1 : 0; const groove = Math.pow( Math.abs( Math.cos( x / ( W / 5 ) * PI ) ), 14 ); return [ x, y, z + front * ( 0.012 * ( 1 - ( 2 * x / W ) ** 4 ) * ( 1 - ( 2 * ( y - H / 2 ) / H ) ** 4 ) - 0.004 * groove ) * f ]; };
		add( g, softBox( W, H, D, 0.045, { seg: 8, shape: rib } ), shell, [ 0, y0, 0 ] );
		add( g, softBox( W + 0.006, H + 0.006, 0.02, 0.045, { seg: 3 } ), dark, [ 0, y0 - 0.003, - 0.02 ] ); // the zip band
		add( g, softBox( W + 0.008, H + 0.008, 0.004, 0.046, { seg: 3 } ), M( 0x2a2a2a, { rough: 0.35, metal: 0.5 } ), [ 0, y0 - 0.004, - 0.02 ] );
		// corner guards, the telescopic handle's housing and the handle down in it, carry handles on top and side
		for ( const k of [ - 1, 1 ] ) for ( const z of [ - 1, 1 ] ) add( g, G.sph( 0.03, 8, 6 ).scale( 1, 0.9, 0.7 ), dark, [ k * ( W / 2 - 0.022 ), y0 + 0.02, z * ( D / 2 - 0.02 ) ] );
		add( g, softBox( 0.24, 0.016, 0.05, 0.008, { seg: 2 } ), dark, [ 0, y0 + H - 0.006, - D / 2 + 0.035 ] );
		for ( const k of [ - 1, 1 ] ) add( g, G.cyl( 0.007, 0.007, 0.03, 8 ), metal, [ k * 0.09, y0 + H + 0.004, - D / 2 + 0.035 ] );
		add( g, softBox( 0.21, 0.022, 0.03, 0.01, { seg: 2 } ), dark, [ 0, y0 + H + 0.03, - D / 2 + 0.035 ] );
		add( g, band( [ [ - 0.07, y0 + H - 0.002, 0.03 ], [ - 0.05, y0 + H + 0.028, 0.03 ], [ 0.05, y0 + H + 0.028, 0.03 ], [ 0.07, y0 + H - 0.002, 0.03 ] ], 0.028, 0.012, { seg: 10, round: true, up: [ 0, 0, 1 ] } ), dark );
		add( g, band( [ [ W / 2 - 0.002, y0 + H * 0.42, 0.05 ], [ W / 2 + 0.026, y0 + H * 0.46, 0.05 ], [ W / 2 + 0.026, y0 + H * 0.58, 0.05 ], [ W / 2 - 0.002, y0 + H * 0.62, 0.05 ] ], 0.026, 0.012, { seg: 10, round: true, up: [ 0, 0, 1 ] } ), dark );
		// four spinner wheels: a housing, a fork, twin wheels
		for ( const k of [ - 1, 1 ] ) for ( const z of [ - 1, 1 ] ) {
			const x = k * ( W / 2 - 0.045 ), zz = z * ( D / 2 - 0.045 );
			add( g, G.rbox( 0.06, 0.02, 0.06, 0.008, 1 ), dark, [ x, y0 - 0.014, zz ] );
			add( g, G.box( 0.012, 0.024, 0.05 ), dark, [ x, y0 - 0.034, zz ] );
			for ( const d of [ - 0.012, 0.012 ] ) add( g, G.cylZ( 0.022, 0.012, 16 ).rotateY( PI / 2 ), M( 0x2a2a2a, { rough: 0.7 } ), [ x + d, 0.022, zz ] );
		}
		// a TSA lock by the zip, a luggage tag on the side handle
		add( g, G.rbox( 0.04, 0.024, 0.012, 0.004, 1 ), dark, [ - W / 2 + 0.06, y0 + H - 0.08, - 0.004 ] );
		add( g, G.rbox( 0.014, 0.006, 0.004, 0.002, 1 ), MAT.metal(), [ - W / 2 + 0.06, y0 + H - 0.08, 0.003 ] );
		add( g, G.tube( [ [ W / 2 + 0.024, y0 + H * 0.5, 0.05 ], [ W / 2 + 0.03, y0 + H * 0.44, 0.06 ], [ W / 2 + 0.03, y0 + H * 0.38, 0.065 ] ], 0.0015, 6, 3 ), M( 0x1a1a1a ) );
		add( g, G.rbox( 0.004, 0.08, 0.05, 0.004, 1 ), M( s.tag ?? 0xf2c230, { rough: 0.6 } ), [ W / 2 + 0.03, y0 + H * 0.33, 0.065 ] );
		return ground( g );
	} );

	// ---- hard cases ----
	reg( 'gear_case', ( s ) => {
		const g = group(), style = s.style || 'briefcase', c = s.color ?? 0x2a1a12;
		switch ( style ) {
			case 'briefcase': {
				const lea = cloth( c, { weave: 'leather', rough: 0.45 } );
				add( g, softBox( 0.44, 0.1, 0.32, 0.012, { seg: 3 } ), lea );
				add( g, G.box( 0.442, 0.006, 0.322 ), M( shade( c, - 0.4 ), { rough: 0.6 } ), [ 0, 0.06, 0 ] );
				// saddle stitching round the lid, brass corner caps, feet on the bottom edge
				const st = thread( c );
				for ( const y of [ 0.067, 0.054 ] ) add( g, band( [ [ - 0.214, y, - 0.154 ], [ 0.214, y, - 0.154 ], [ 0.214, y, 0.154 ], [ - 0.214, y, 0.154 ] ], 0.0016, 0.0008, { closed: true, seg: 16, up: ( p ) => [ Math.abs( p.x ) > 0.2 ? Math.sign( p.x ) : 0, 0, Math.abs( p.x ) > 0.2 ? 0 : Math.sign( p.z ) ] } ).scale( 1.0075, 1, 1.0105 ), st );
				for ( const x of [ - 1, 1 ] ) for ( const z of [ - 1, 1 ] ) add( g, G.sph( 0.012, 6, 4 ).scale( 1, 0.9, 1 ), brass(), [ x * 0.214, 0.09, z * 0.154 ] );
				for ( const x of [ - 0.16, 0.16 ] ) add( g, G.cyl( 0.006, 0.006, 0.004, 8 ).rotateX( PI / 2 ), brass(), [ x, 0.02, - 0.161 ] );
				// the handle on the long edge (+z), two brass combination locks beside it
				add( g, G.torus( 0.05, 0.011, 6, 14, PI ), M( 0x1a120c, { rough: 0.5 } ), [ 0, 0.05, 0.165 ], [ PI / 2, 0, 0 ] );
				for ( const x of [ - 0.13, 0.13 ] ) {
					add( g, G.box( 0.05, 0.03, 0.006 ), brass(), [ x, 0.05, 0.162 ] );
					for ( let i = 0; i < 3; i ++ ) add( g, G.cylX( 0.005, 0.008, 8 ), M( 0x2a2a2a, { rough: 0.4, metal: 0.6 } ), [ x - 0.012 + i * 0.012, 0.05, 0.166 ] );
				}
				return ground( g );
			}
			case 'pistol': {
				const pl = M( c, { rough: 0.5 } );
				add( g, G.rbox( 0.33, 0.085, 0.25, 0.015, 2 ), pl );
				for ( let i = 0; i < 6; i ++ ) add( g, G.rbox( 0.28, 0.006, 0.012, 0.003 ), pl, [ 0, 0.085, - 0.09 + i * 0.036 ] );
				for ( const x of [ - 0.1, 0.1 ] ) add( g, G.rbox( 0.035, 0.03, 0.012, 0.004 ), M( s.color2 ?? 0x8a8e94, { rough: 0.35, metal: 0.7 } ), [ x, 0.03, 0.128 ] );
				add( g, G.rbox( 0.1, 0.022, 0.02, 0.008 ), pl, [ 0, 0.04, 0.135 ] );
				add( g, G.box( 0.335, 0.004, 0.252 ), M( 0x0c0c0c ), [ 0, 0.042, 0 ] );
				return ground( g );
			}
			case 'ammo': {
				// an olive drab steel can standing up, the lid lever on top, stencilled sides
				const paint = M( c, { rough: 0.6, metal: 0.4 } );
				const L = 0.28, H = 0.17, D = 0.1;
				add( g, G.rbox( L, H, D, 0.004 ), paint );
				add( g, G.rbox( L + 0.012, 0.025, D + 0.01, 0.004 ), paint, [ 0, H - 0.005, 0 ] );
				add( g, G.rbox( 0.11, 0.012, 0.05, 0.004 ), paint, [ - 0.06, H + 0.02, 0 ], [ 0, 0, - 0.12 ] );
				add( g, G.rbox( 0.11, 0.008, 0.022, 0.004 ), M( shade( c, - 0.3 ), { rough: 0.5, metal: 0.5 } ), [ 0.05, H + 0.02, 0 ] );
				for ( const z of [ - 1, 1 ] ) sideDecal( g, { bg: c, fg: s.color2 ?? 0xd8c860, text: '5.56 MM', sub: 'BALL M855 · 840 RDS', style: 'plain', textColor: s.color2 ?? 0xd8c860, subColor: s.color2 ?? 0xd8c860, w: 384, h: 192 },
					0.2, 0.09, [ 0, H * 0.48, z * ( D / 2 + 0.0008 ) ], z > 0 ? 0 : PI );
				return ground( g );
			}
			default: { // lunch: a dome-lid tin with a painted picture and a chrome latch
				const tin = M( c, { rough: 0.35, metal: 0.3 } ), chrome = M( s.color2 ?? 0xb8bcc2, { rough: 0.25, metal: 0.9 } );
				const L = 0.24, H = 0.1, D = 0.1;
				add( g, G.rbox( L, H, D, 0.006 ), tin );
				// the domed lid: half a barrel, squashed
				add( g, new THREE.CylinderGeometry( D / 2, D / 2, L, 18, 1, false, 0, PI ).rotateZ( PI / 2 ).rotateX( PI / 2 ).scale( 1, 0.6, 1 ), tin, [ 0, H, 0 ] );
				add( g, G.box( L + 0.004, 0.006, D + 0.004 ), chrome, [ 0, H - 0.003, 0 ] );
				add( g, G.torus( 0.04, 0.006, 6, 14, PI ), chrome, [ 0, H + 0.03, 0 ], [ 0, 0, 0 ] );
				add( g, G.box( 0.02, 0.03, 0.006 ), chrome, [ 0, H - 0.02, D / 2 + 0.002 ] );
				for ( const z of [ - 1, 1 ] ) sideDecal( g, { bg: 0x2a8ad6, fg: 0xf2f2ee, text: 'ALOHA', sub: 'SURF CLUB', style: 'badge', band: 0xf2c230, glyph: 'palm', glyphColor: 0x1f6a3a, glyphY: 0.5, textY: 0.8, w: 256, h: 128 },
					0.17, 0.075, [ 0, H * 0.5, z * ( D / 2 + 0.0008 ) ], z > 0 ? 0 : PI );
				return ground( g );
			}
		}
	} );

	// ---- soft bags ----
	reg( 'gear_bag', ( s ) => {
		const g = group(), style = s.style || 'sling', c = s.color ?? 0x3a3e46;
		const text = String( s.print || '' ).startsWith( 'text:' ) ? s.print.slice( 5 ) : null;
		const cl = cloth( c, { print: text ? null : s.print, color2: s.color2 ?? 0xffffff, rep: s.rep ?? 1.4, weave: style === 'messenger' ? 'canvas' : style === 'drawstring' ? 'nylon' : 'canvas', rough: style === 'messenger' ? 0.7 : undefined } );
		const acc = M( s.color2 ?? shade( c, - 0.35 ), { rough: 0.7 } ), strap = webbing(), stitch = thread( c );
		switch ( style ) {
			case 'grocery': {
				// a thin white bag with the handles knotted, MAHALO printed on the front
				const t = labelTex( { bg: 0xf2f2ee, fg: s.color2 ?? 0xc8282a, text: 'MAHALO', sub: 'THANK YOU · COME AGAIN', style: 'plain', textColor: s.color2 ?? 0xc8282a, subColor: s.color2 ?? 0xc8282a, w: 512, h: 256 } ).clone();
				t.wrapS = THREE.RepeatWrapping; t.repeat.set( 2, 1 ); t.offset.set( 0.5, 0 ); t.needsUpdate = true;
				add( g, lump( 0.13, 1.15, 1.05, 0.62, 7, 0.08 ), M( 0xffffff, { map: t, rough: 0.35 } ), [ 0, 0.13, 0 ] );
				const pl = M( 0xf2f2ee, { rough: 0.35 } );
				add( g, G.cone( 0.05, 0.08, 10 ), pl, [ 0, 0.24, 0 ] );
				for ( const x of [ - 0.035, 0.035 ] ) add( g, G.torus( 0.04, 0.006, 5, 14 ), pl, [ x, 0.33, 0 ], [ 0, 0, x * 8 ] );
				break;
			}
			case 'trash': {
				// a big black bag, full, its neck tied in a knot
				const bl = M( c, { rough: 0.22 } );
				add( g, lump( 0.2, 1.05, 1.15, 0.85, 4, 0.09 ), bl, [ 0, 0.2, 0 ] );
				add( g, G.cone( 0.06, 0.11, 10 ), bl, [ 0, 0.38, 0 ] );
				for ( const z of [ - 1, 1 ] ) add( g, G.sph( 0.035, 10, 6 ).scale( 1.6, 0.5, 0.7 ), bl, [ 0.02, 0.48, z * 0.03 ], [ 0.3 * z, z * 0.8, 0.3 ] );
				break;
			}
			case 'drawstring': {
				// a cinch sack lying flat: the channel at the top, cords to grommets at the bottom corners, the print
				const pn = panel( roundRect( 0.4, 0.33, [ 0.02, 0.006, 0.006, 0.02 ] ), { T: 0.02, R: 0.016, cell: 0.03, uv: [ 0, 0 ], disp: ( x, z ) => 0.003 * Math.sin( x * 18 + z * 9 ) - 0.004 * smooth( 0.16, 0.2, x ) } );
				add( g, pn.geo, cl );
				add( g, conform( panel( roundRect( 0.03, 0.33, 0.004, 0.185, 0, 2 ), { T: 0.006, R: 0.004, cell: 0.05, bottom: false } ).geo, pn.top, 0.0003 ), acc );
				const cord = M( s.color2 ?? 0xf2f2ee, { rough: 0.8 } );
				for ( const z of [ - 1, 1 ] ) add( g, G.tube( [ [ 0.19, pn.top( 0.19, z * 0.01 ) + 0.008, z * 0.01 ], [ 0.22, 0.012, z * 0.12 ], [ 0.05, pn.top( 0.05, z * 0.19 ) + 0.004, z * 0.185 ], [ - 0.19, pn.top( - 0.19, z * 0.155 ) + 0.003, z * 0.155 ] ], 0.0035, 24, 5 ), cord );
				for ( const z of [ - 0.155, 0.155 ] ) add( g, G.torus( 0.006, 0.002, 4, 10 ).rotateX( PI / 2 ), MAT.metal(), [ - 0.19, pn.top( - 0.19, z ) + 0.002, z ] );
				if ( text ) { const d = panel( roundRect( 0.26, 0.12, 0.004, - 0.02, 0 ), { T: 0.0006, R: 0.0005, cell: 0.06, bottom: false } ); uvOf( d.geo, - 0.02, 0, 0.26 ); add( g, conform( d.geo, pn.top, 0.0006 ), sloganMat( text, s.color2 ?? 0xf2f2ee ) ); }
				break;
			}
			case 'sling': {
				// a teardrop body lying on its back, a zip round it and a pocket zip, the padded strap looped beside
				const L = 0.34, H = 0.1;
				const body = softBox( L, H, 0.2, 0.045, { seg: 5, shape: ( x, y, z ) => [ x, y * ( 1 - 0.35 * smooth( 0, L / 2, x ) ), z * ( 1 - 0.5 * smooth( - 0.02, L / 2, x ) ) ] } );
				add( g, body, cl );
				const yt = ( x ) => H * ( 1 - 0.35 * smooth( 0, L / 2, x ) ) + 0.001;
				zipLine( g, Array.from( { length: 8 }, ( _, i ) => { const x = - L / 2 + 0.04 + i / 7 * ( L - 0.08 ); return [ x, yt( x ), 0.06 * ( 1 - 0.5 * smooth( - 0.02, L / 2, x ) ) ]; } ), { up: [ 0, 1, 0 ], pulls: [ 0 ], tape: shade( c, - 0.4 ) } );
				zipLine( g, Array.from( { length: 5 }, ( _, i ) => { const x = - 0.1 + i / 4 * 0.14; return [ x, yt( x ), - 0.02 ]; } ), { up: [ 0, 1, 0 ], pulls: [ 4 ], w: 0.008, tape: shade( c, - 0.4 ) } );
				add( g, band( [ [ L / 2 - 0.02, 0.05, 0 ], [ 0.3, 0.012, - 0.08 ], [ 0.1, 0.006, - 0.2 ], [ - 0.2, 0.006, - 0.16 ], [ - L / 2 + 0.01, 0.04, - 0.06 ] ], 0.04, 0.005, { seg: 24, round: true } ), strap );
				add( g, G.rbox( 0.034, 0.012, 0.045, 0.004, 1 ), buckle(), [ 0.1, 0.012, - 0.2 ] );
				break;
			}
			case 'messenger': {
				// a canvas bag standing up, the flap folded over the top and down the front, two buckled straps,
				// the shoulder strap arched over it
				const H = 0.27, L = 0.38, D = 0.1;
				add( g, softBox( L, H, D, 0.018, { seg: 4 } ), cl );
				const flap = grid( 6, 10, ( u, v ) => {
					const x = ( u - 0.5 ) * ( L + 0.008 ), t = v * ( D + H * 0.68 ), r = 0.012;
					let y, z;
					if ( t < D ) { y = H + 0.004; z = - D / 2 + t; } else { y = H + 0.004 - ( t - D ); z = D / 2 + 0.004; }
					const near = Math.abs( t - D );
					if ( near < r ) { const a = ( t - D + r ) / ( 2 * r ) * PI / 2; y = H - r + 0.004 + Math.cos( a ) * r; z = D / 2 - r + 0.004 + Math.sin( a ) * r; }
					return [ x, y, z ];
				}, { uvScale: [ 1.3, 1.1 ] } );
				const ix = flap.index.array; for ( let i = 0; i < ix.length; i += 3 ) { const t = ix[ i + 1 ]; ix[ i + 1 ] = ix[ i + 2 ]; ix[ i + 2 ] = t; } flap.computeVertexNormals();
				add( g, flap, cl );
				add( g, G.box( L + 0.008, 0.008, 0.004 ), M( shade( c, - 0.4 ), { rough: 0.8 } ), [ 0, H * 0.32 - 0.004, D / 2 + 0.006 ] );
				for ( const x of [ - 0.1, 0.1 ] ) {
					add( g, G.box( 0.022, H * 0.5, 0.003 ), cloth( s.color2 ?? 0x2a2018, { weave: 'leather', rough: 0.6 } ), [ x, H * 0.12, D / 2 + 0.009 ] );
					add( g, G.torus( 0.012, 0.002, 4, 12 ).scale( 1.1, 1.3, 1 ), brass(), [ x, H * 0.38, D / 2 + 0.012 ] );
					add( g, G.box( 0.003, 0.024, 0.002 ), brass(), [ x, H * 0.38, D / 2 + 0.013 ] );
				}
				add( g, band( [ [ - L / 2 + 0.01, H * 0.55, 0 ], [ - L / 2 - 0.02, H + 0.12, 0 ], [ 0, H + 0.2, 0 ], [ L / 2 + 0.02, H + 0.12, 0 ], [ L / 2 - 0.01, H * 0.55, 0 ] ], 0.035, 0.004, { seg: 20, up: [ 0, 0, 1 ] } ), strap );
				add( g, softBox( 0.11, 0.012, 0.05, 0.005, { seg: 1 } ), strap, [ - 0.04, H + 0.19, 0 ], [ 0, 0, 0.18 ] );
				for ( const k of [ - 1, 1 ] ) add( g, G.torus( 0.01, 0.0025, 4, 10 ), MAT.metal(), [ k * ( L / 2 + 0.002 ), H * 0.58, 0 ], [ 0, PI / 2, 0 ] );
				break;
			}
			case 'tackle': {
				// a soft tackle box: a padded lid zipped round, end pockets, a front pocket, piping, carry straps
				const H = 0.24, L = 0.4, D = 0.26;
				const pipe = M( s.color2 ?? 0xe8601a, { rough: 0.6 } );
				add( g, softBox( L, H, D, 0.024, { seg: 4 } ), cl );
				add( g, softBox( L + 0.006, 0.036, D + 0.006, 0.016, { seg: 2, shape: ( x, y, z ) => [ x, y + ( y > 0.03 ? 0.006 * ( 1 - ( 2 * x / L ) ** 2 ) * ( 1 - ( 2 * z / D ) ** 2 ) : 0 ), z ] } ), cl, [ 0, H - 0.024, 0 ] );
				add( g, softBox( L + 0.01, 0.006, D + 0.01, 0.02, { seg: 1 } ), pipe, [ 0, H - 0.026, 0 ] );
				zipLine( g, [ [ - L / 2 + 0.03, H - 0.018, D / 2 + 0.005 ], [ 0, H - 0.018, D / 2 + 0.006 ], [ L / 2 - 0.03, H - 0.018, D / 2 + 0.005 ] ], { pulls: [ 0, 2 ] } );
				for ( const x of [ - 1, 1 ] ) {
					add( g, softBox( 0.05, H * 0.62, D * 0.72, 0.016, { seg: 2 } ), cl, [ x * ( L / 2 + 0.02 ), 0.016, 0 ] );
					zipLine( g, [ [ x * ( L / 2 + 0.046 ), H * 0.58, - D * 0.28 ], [ x * ( L / 2 + 0.047 ), H * 0.6, 0 ], [ x * ( L / 2 + 0.046 ), H * 0.58, D * 0.28 ] ], { up: [ x, 0, 0 ], pulls: [ 0 ], w: 0.008 } );
				}
				add( g, softBox( L * 0.72, H * 0.56, 0.05, 0.016, { seg: 2 } ), cl, [ 0, 0.016, D / 2 + 0.02 ] );
				add( g, softBox( L * 0.74, 0.006, 0.052, 0.003, { seg: 1 } ), pipe, [ 0, 0.016 + H * 0.56 - 0.004, D / 2 + 0.02 ] );
				zipLine( g, [ [ - L * 0.3, H * 0.5, D / 2 + 0.046 ], [ 0, H * 0.51, D / 2 + 0.047 ], [ L * 0.3, H * 0.5, D / 2 + 0.046 ] ], { pulls: [ 2 ], w: 0.008 } );
				for ( const x of [ - 0.08, 0.08 ] ) add( g, band( [ [ x, H * 0.4, D / 2 + 0.003 ], [ x, H + 0.016, D / 2 - 0.02 ], [ x, H + 0.016, - D / 2 + 0.02 ], [ x, H * 0.4, - D / 2 - 0.003 ] ], 0.03, 0.003, { seg: 14, up: ( p ) => [ 0, p.y > H ? 1 : 0, p.y > H ? 0 : Math.sign( p.z ) ] } ), strap );
				add( g, G.capsX( 0.016, 0.2, 10 ), strap, [ 0, H + 0.035, 0 ] );
				break;
			}
			case 'waist': {
				// a hip pack, a water bottle in a mesh pocket at each end, the belt looped behind
				const W = 0.26, H = 0.13, D = 0.1;
				add( g, softBox( W, H, D, 0.04, { seg: 4, shape: ( x, y, z ) => [ x, y, z + ( z > 0 ? 0.018 * ( 1 - ( 2 * x / W ) ** 2 ) : 0 ) ] } ), cl );
				zipLine( g, Array.from( { length: 7 }, ( _, i ) => { const x = - 0.1 + i / 6 * 0.2; return [ x, H - 0.006, 0.012 + 0.012 * ( 1 - ( 2 * x / W ) ** 2 ) ]; } ), { up: [ 0, 1, 0.4 ], pulls: [ 0, 6 ] } );
				add( g, softBox( 0.16, 0.07, 0.02, 0.012, { seg: 2 } ), cl, [ 0, 0.02, D / 2 + 0.012 ] );
				zipLine( g, [ [ - 0.06, 0.08, D / 2 + 0.024 ], [ 0.06, 0.08, D / 2 + 0.024 ] ], { pulls: [ 1 ], w: 0.007 } );
				const meshM = netMat( shade( c, - 0.5 ), 3, 10 );
				for ( const x of [ - 1, 1 ] ) {
					add( g, G.cyl( 0.036, 0.034, 0.08, 14, true ), meshM, [ x * 0.17, 0, 0 ] );
					add( g, G.cyl( 0.03, 0.03, 0.12, 14 ), M( 0x2a8ad6, { rough: 0.25 } ), [ x * 0.17, 0.002, 0 ] );
					add( g, G.cyl( 0.015, 0.015, 0.02, 10 ), M( 0x1a1a1a ), [ x * 0.17, 0.12, 0 ] );
				}
				add( g, band( Array.from( { length: 13 }, ( _, i ) => { const a = - PI * 0.12 + i / 12 * PI * 1.24; return [ Math.cos( a ) * 0.25, 0.014, - Math.sin( a ) * 0.19 - 0.03 ]; } ), 0.028, 0.004, { seg: 24, up: ( p ) => { const l = Math.hypot( p.x, p.z + 0.03 ) || 1; return [ p.x / l, 0, ( p.z + 0.03 ) / l ]; } } ), strap );
				add( g, G.rbox( 0.04, 0.03, 0.014, 0.004, 1 ), buckle(), [ 0, 0.012, - 0.222 ] );
				break;
			}
			case 'hydration': {
				// a slim pack: bungee criss-crossed over the front, shoulder straps, the drink tube over one of them
				const H = 0.42, W = 0.26, D = 0.075;
				add( g, softBox( W, H, D, 0.03, { seg: 4, shape: ( x, y, z ) => [ x * ( 1 - 0.1 * y / H ), y, z + ( z > 0 ? 0.012 * ( 1 - ( 2 * x / W ) ** 2 ) * Math.sin( y / H * PI ) : 0 ) ] } ), cl );
				const bungee = M( s.color2 ?? 0x1a1a1a, { rough: 0.6 } ), fz = ( x, y ) => D / 2 + 0.012 * ( 1 - ( 2 * x / W ) ** 2 ) * Math.sin( y / H * PI ) + 0.004;
				for ( const [ a, b ] of [ [ [ - 0.09, 0.08 ], [ 0.09, 0.3 ] ], [ [ 0.09, 0.08 ], [ - 0.09, 0.3 ] ] ] ) add( g, G.tube( [ [ a[ 0 ], a[ 1 ], fz( a[ 0 ], a[ 1 ] ) ], [ 0, ( a[ 1 ] + b[ 1 ] ) / 2, fz( 0, 0.19 ) + 0.002 ], [ b[ 0 ], b[ 1 ], fz( b[ 0 ], b[ 1 ] ) ] ], 0.003, 8, 4 ), bungee );
				for ( const [ x, y ] of [ [ - 0.09, 0.08 ], [ 0.09, 0.3 ], [ 0.09, 0.08 ], [ - 0.09, 0.3 ] ] ) add( g, G.box( 0.012, 0.012, 0.006 ), buckle(), [ x, y, fz( x, y ) ] );
				zipLine( g, Array.from( { length: 7 }, ( _, i ) => { const a = - PI * 0.45 + i / 6 * PI * 0.9; return [ Math.sin( a ) * W * 0.42, H * 0.7 + Math.cos( a ) * H * 0.26, fz( Math.sin( a ) * W * 0.42, H * 0.7 + Math.cos( a ) * H * 0.26 ) - 0.002 ]; } ), { pulls: [ 0 ], up: [ 0, 0.3, 1 ] } );
				for ( const k of [ - 1, 1 ] ) {
					const xs = k * 0.065;
					add( g, band( [ [ xs * 0.7, H * 0.9, - D / 2 - 0.004 ], [ xs, H * 0.72, - D / 2 - 0.022 ], [ xs * 1.15, H * 0.42, - D / 2 - 0.024 ], [ xs * 1.3, H * 0.16, - D / 2 - 0.012 ] ], 0.05, 0.012, { seg: 12, round: true, up: [ 0, 0, - 1 ] } ), cl );
				}
				add( g, G.tube( [ [ 0.06, H - 0.01, - 0.01 ], [ 0.1, H + 0.04, - 0.03 ], [ 0.085, H * 0.7, - D / 2 - 0.036 ], [ 0.08, H * 0.35, - D / 2 - 0.036 ] ], 0.006, 24, 6 ), M( 0x2a2a2a, { rough: 0.5 } ) );
				add( g, G.cyl( 0.009, 0.009, 0.03, 10 ), M( 0x2a8ad6, { rough: 0.4 } ), [ 0.08, H * 0.32, - D / 2 - 0.036 ] );
				break;
			}
			case 'lauhala': {
				const straw = cloth( c, { weave: 'straw', wrep: 0.9, rough: 0.85, bump: 1 } ), dark = cloth( shade( c, - 0.15 ), { weave: 'straw', wrep: 1.3, rough: 0.85 } );
				add( g, softBox( 0.32, 0.24, 0.1, 0.012, { seg: 3, shape: ( x, y, z ) => [ x * ( 0.86 + 0.14 * y / 0.24 ), y, z * ( 0.75 + 0.25 * y / 0.24 ) ] } ), straw );
				add( g, softBox( 0.326, 0.024, 0.105, 0.008, { seg: 1 } ), dark, [ 0, 0.222, 0 ] );
				for ( const z of [ - 0.035, 0.035 ] ) add( g, band( [ [ - 0.07, 0.235, z ], [ - 0.07, 0.29, z ], [ 0, 0.33, z ], [ 0.07, 0.29, z ], [ 0.07, 0.235, z ] ], 0.02, 0.005, { seg: 14, round: true, up: [ 0, 0, 1 ] } ), dark );
				// a red hibiscus pinned on
				const fl = M( 0xd8283a, { rough: 0.7 } );
				for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; add( g, G.sph( 0.017, 8, 5 ).scale( 1, 0.3, 0.6 ), fl, [ 0.07 + Math.cos( a ) * 0.014, 0.13 + Math.sin( a ) * 0.014, 0.058 ], [ PI / 2, 0, a ] ); }
				add( g, G.sph( 0.006, 6, 4 ), M( 0xf2c230 ), [ 0.07, 0.13, 0.064 ] );
				break;
			}
			case 'rifle': {
				// a long padded case lying flat: zipped round, carry handles, an accessory pocket, padlock loops
				const L = 1.12, D = 0.26, H = 0.075;
				add( g, softBox( L, H, D, 0.03, { seg: 6, shape: ( x, y, z ) => [ x, y + ( y > H * 0.6 ? 0.008 * ( 1 - ( 2 * z / D ) ** 2 ) * ( 1 - ( 2 * x / L ) ** 8 ) : 0 ), z ] } ), cl );
				zipLine( g, [ [ - L / 2 + 0.04, H * 0.52, D / 2 + 0.001 ], [ 0, H * 0.52, D / 2 + 0.002 ], [ L / 2 - 0.04, H * 0.52, D / 2 + 0.001 ] ], { pulls: [ 0, 2 ] } );
				add( g, softBox( 0.34, 0.03, 0.18, 0.012, { seg: 2 } ), cl, [ 0.2, H - 0.004, 0 ] );
				zipLine( g, [ [ 0.05, H + 0.027, 0.07 ], [ 0.35, H + 0.027, 0.07 ] ], { up: [ 0, 1, 0 ], pulls: [ 1 ], w: 0.008 } );
				for ( const x of [ - 0.16, - 0.04 ] ) add( g, G.box( 0.03, 0.006, D + 0.012 ), strap, [ x, H + 0.006, 0 ] );
				add( g, G.capsX( 0.016, 0.16, 10 ), strap, [ - 0.1, H + 0.02, 0 ] );
				for ( const x of [ - L / 2 + 0.06, L / 2 - 0.06 ] ) add( g, G.torus( 0.012, 0.003, 4, 10 ), steel(), [ x, H * 0.5, D / 2 + 0.006 ], [ 0, PI / 2, 0 ] );
				break;
			}
			default: { // camera: a padded box bag, a flap lid, a red stripe, end pockets, the strap
				const H = 0.16, L = 0.22, D = 0.15;
				add( g, softBox( L, H, D, 0.02, { seg: 3 } ), cl );
				add( g, softBox( L + 0.008, 0.03, D + 0.008, 0.012, { seg: 2 } ), cl, [ 0, H - 0.016, 0 ] );
				add( g, softBox( L + 0.008, 0.06, 0.01, 0.004, { seg: 1 } ), cl, [ 0, H - 0.062, D / 2 + 0.002 ] );
				add( g, G.box( L + 0.01, 0.008, 0.004 ), M( s.color2 ?? 0xc8282a ), [ 0, H * 0.3, D / 2 + 0.003 ] );
				add( g, G.rbox( 0.036, 0.016, 0.006, 0.003, 1 ), buckle(), [ 0, H - 0.05, D / 2 + 0.009 ] );
				for ( const x of [ - 1, 1 ] ) add( g, softBox( 0.04, H * 0.6, D * 0.7, 0.01, { seg: 2 } ), cl, [ x * ( L / 2 + 0.018 ), 0.01, 0 ] );
				add( g, band( [ [ - L / 2 - 0.035, H * 0.5, 0 ], [ - L / 2 - 0.04, H + 0.12, 0 ], [ 0, H + 0.18, 0 ], [ L / 2 + 0.04, H + 0.12, 0 ], [ L / 2 + 0.035, H * 0.5, 0 ] ], 0.03, 0.003, { seg: 18, up: [ 0, 0, 1 ] } ), strap );
			}
		}
		return ground( g );
	} );

	// ---- small things ----
	reg( 'gear_small', ( s ) => {
		const g = group(), style = s.style || 'pouch';
		switch ( style ) {
			case 'dogtags': {
				// two tags, one in a black rubber silencer, on a ball chain coiled beside them (kept close so the tags
				// fill the icon)
				const tag = M( 0xb8bcc2, { rough: 0.35, metal: 0.9 } ), rub = M( 0x141414, { rough: 0.85 } );
				add( g, G.rbox( 0.054, 0.0018, 0.032, 0.009 ), rub, [ 0, 0, 0 ] );
				add( g, G.rbox( 0.05, 0.002, 0.028, 0.008 ), tag, [ 0, 0.0004, 0 ] );
				add( g, G.rbox( 0.05, 0.002, 0.028, 0.008 ), tag, [ 0.016, 0.0024, 0.016 ], [ 0, 0.35, 0 ] );
				for ( let i = 0; i < 4; i ++ ) add( g, G.box( 0.03, 0.0006, 0.002 ), M( 0x5a5e64, { metal: 0.8, rough: 0.5 } ), [ 0.018, 0.0046, 0.009 + i * 0.005 ], [ 0, 0.35, 0 ] );
				for ( const [ x, z ] of [ [ - 0.019, 0 ], [ - 0.003, 0.025 ] ] ) add( g, G.cyl( 0.0022, 0.0022, 0.004, 8 ), rub, [ x, 0.001, z ] ); // the holes
				const chain = M( 0xa8acb2, { rough: 0.3, metal: 0.9 } );
				for ( const [ R, x, z, y ] of [ [ 0.034, - 0.05, - 0.004, 0.0016 ], [ 0.026, - 0.056, 0.006, 0.0036 ] ] ) {
					const loop = G.torus( R, 0.0017, 4, 36 ); loop.rotateX( PI / 2 ); loop.scale( 1.15, 1, 0.8 );
					add( g, loop, chain, [ x, y, z ] );
				}
				break;
			}
			case 'lanyard': {
				// a work lanyard laid in a loop: the ribbon, its clip, an ID badge in a clear sleeve, a ring of keys
				const rib = M( s.color ?? 0x1a4a8a, { rough: 0.8 } ), metal = M( 0xb8bcc2, { rough: 0.35, metal: 0.9 } );
				const RX = 0.085, RZ = 0.03, N = 26, cx = - 0.05;
				for ( let i = 0; i < N; i ++ ) {
					const a0 = i / N * PI * 2, a1 = ( i + 1 ) / N * PI * 2;
					const x0 = Math.cos( a0 ) * RX, z0 = Math.sin( a0 ) * RZ, x1 = Math.cos( a1 ) * RX, z1 = Math.sin( a1 ) * RZ;
					add( g, G.box( Math.hypot( x1 - x0, z1 - z0 ) + 0.001, 0.0015, 0.014 ), rib, [ cx + ( x0 + x1 ) / 2, 0, ( z0 + z1 ) / 2 ], [ 0, - Math.atan2( z1 - z0, x1 - x0 ), 0 ] );
				}
				// white stitching dots along the ribbon so it reads as one at a glance
				for ( let i = 0; i < 12; i ++ ) { const a = i / 12 * PI * 2; add( g, G.box( 0.008, 0.0004, 0.003 ), M( 0xf2f2ee ), [ cx + Math.cos( a ) * RX, 0.0016, Math.sin( a ) * RZ ], [ 0, - a - PI / 2, 0 ] ); }
				add( g, G.rbox( 0.026, 0.006, 0.016, 0.003 ), M( 0x1a1a1a, { rough: 0.5 } ), [ cx + RX + 0.01, 0, 0 ] ); // the clip
				add( g, G.torus( 0.006, 0.0015, 4, 10 ), metal, [ cx + RX + 0.028, 0.002, 0 ], [ PI / 2, 0, 0 ] );
				// the badge: a card in a clear sleeve
				add( g, G.rbox( 0.058, 0.0016, 0.088, 0.004 ), MAT.glass( 0xe8f0f4, 0.35 ), [ 0.085, 0.001, 0 ] );
				decal( g, { bg: 0xf8f8f4, fg: 0x1a3a6a, text: 'STAFF', sub: 'HALE KAI HOTEL', style: 'band', band: s.color ?? 0x1a4a8a, glyph: 'palm', glyphColor: s.color ?? 0x1a4a8a, w: 160, h: 256 }, 0.05, 0.08, [ 0.085, 0.0012, 0 ] );
				// a key ring with three keys fanned out
				add( g, G.torus( 0.014, 0.0016, 4, 18 ), metal, [ 0.0, 0.002, 0.045 ], [ PI / 2, 0, 0 ] );
				const brass2 = M( 0xc8a050, { rough: 0.3, metal: 0.9 } );
				for ( const [ a, m ] of [ [ 0.2, metal ], [ 0.75, brass2 ], [ 1.3, metal ] ] ) {
					const k = new THREE.Group(); k.position.set( 0.0, 0.002, 0.045 ); k.rotation.y = - a;
					add( k, G.cyl( 0.009, 0.009, 0.002, 12 ), m, [ 0.022, 0, 0 ] );
					add( k, G.box( 0.032, 0.002, 0.007 ), m, [ 0.045, 0, 0 ] );
					for ( let t = 0; t < 3; t ++ ) add( k, G.box( 0.004, 0.002, 0.003 ), m, [ 0.038 + t * 0.008, 0, 0.004 ] );
					g.add( k );
				}
				break;
			}
			case 'marker': {
				const t = labelTex( { bg: 0x1a1a1c, fg: 0xf2f2ee, text: 'INKMARK', sub: 'PERMANENT · FINE', style: 'band', band: 0xf2f2ee, w: 256, h: 64 } ).clone();
				t.wrapS = THREE.RepeatWrapping; t.repeat.set( 1, 1 ); t.needsUpdate = true;
				const body = G.cylX( 0.0085, 0.1, 14 );
				add( g, body, M( 0xffffff, { map: t, rough: 0.5 } ), [ - 0.01, 0.0085, 0 ] );
				add( g, G.cylX( 0.0095, 0.045, 14 ), M( 0x141414, { rough: 0.45 } ), [ 0.06, 0.0095, 0 ] );
				add( g, G.box( 0.035, 0.004, 0.004 ), M( 0x141414, { rough: 0.45 } ), [ 0.055, 0.02, 0 ] );
				add( g, G.cylX( 0.0085, 0.006, 14 ), M( 0x141414 ), [ - 0.063, 0.0085, 0 ] );
				break;
			}
			case 'pouch': {
				const c = s.color ?? 0x4a5034, clm = cloth( c, { weave: 'canvas' } );
				add( g, softBox( 0.1, 0.06, 0.07, 0.01, { seg: 2 } ), clm );
				add( g, softBox( 0.104, 0.008, 0.074, 0.004, { seg: 1 } ), clm, [ 0, 0.056, 0 ] );
				add( g, softBox( 0.104, 0.03, 0.006, 0.003, { seg: 1 } ), clm, [ 0, 0.033, 0.036 ] );
				add( g, G.box( 0.03, 0.012, 0.004 ), buckle(), [ 0, 0.03, 0.04 ] );
				for ( const x of [ - 0.03, 0.03 ] ) add( g, G.box( 0.02, 0.05, 0.004 ), webbing( shade( c, - 0.3 ) ), [ x, 0.005, - 0.037 ] );
				break;
			}
			case 'feathers': {
				// a hat band of tight-packed feathers, red with yellow bands
				const red = M( s.color ?? 0xd83a2a, { rough: 0.8 } ), yel = M( s.color2 ?? 0xf2c230, { rough: 0.8 } );
				const rr = rng( 17 );
				for ( let i = 0; i < 90; i ++ ) {
					const a = i / 90 * PI * 2 + rr() * 0.05, k = i % 3;
					const rad = 0.082 + ( k - 1 ) * 0.008;
					add( g, G.sph( 0.014, 7, 4 ).scale( 1.9, 0.45, 0.6 ), ( Math.floor( i / 6 ) % 4 ) === 0 ? yel : red, [ Math.cos( a ) * rad, 0.008 + k * 0.004, Math.sin( a ) * rad ], [ ( rr() - 0.5 ) * 0.6, - a + PI / 2 + ( rr() - 0.5 ) * 0.5, 0.3 ] );
				}
				add( g, G.torus( 0.085, 0.003, 4, 30 ), M( 0x2a1a10 ), [ 0, 0.004, 0 ], [ PI / 2, 0, 0 ] );
				break;
			}
			case 'kapa': {
				const kapa = kapaMat( 1.2 );
				add( g, G.rbox( 0.26, 0.03, 0.2, 0.006, 2 ), kapa );
				for ( let i = 1; i < 3; i ++ ) add( g, G.box( 0.262, 0.002, 0.004 ), M( 0x4a2a14 ), [ 0, 0.03 * i / 3, 0.1 ] );
				break;
			}
			case 'needle': {
				// a card with three heavy needles, one curved
				decal( g, { bg: 0xf2eedc, fg: 0x1a3a6a, text: 'HEAVY DUTY', sub: 'UPHOLSTERY NEEDLES · 3', style: 'band', band: 0x1a3a6a, w: 256, h: 160 }, 0.1, 0.065, [ 0, 0.001, 0 ], [ 0, 0, 0 ] );
				add( g, G.box( 0.1, 0.002, 0.065 ), M( 0xd8d4c4, { rough: 0.9 } ), [ 0, - 0.001, 0 ] );
				for ( const z of [ - 0.012, 0.004 ] ) add( g, G.cylX( 0.0012, 0.075, 6, 0.0003 ), steel(), [ 0, 0.004, z ] );
				add( g, G.torus( 0.025, 0.0012, 4, 14, PI * 0.8 ), steel(), [ 0, 0.004, 0.02 ], [ PI / 2, 0, 0 ] );
				break;
			}
			default: { // denim scraps: two ragged pieces
				const den = cloth( s.color ?? 0x2f4a78, { print: 'denim', color2: s.color2 ?? 0x5a7ab0, color3: 0x1a2a4a, rep: 2, weave: 'twill' } );
				const r = rng( 13 );
				for ( let k = 0; k < 2; k ++ ) {
					const pts = [];
					for ( let i = 0; i < 12; i ++ ) { const a = i / 12 * PI * 2, rr = 0.07 + r() * 0.02; pts.push( V2( Math.cos( a ) * rr * 1.3, Math.sin( a ) * rr ) ); }
					add( g, slab( new THREE.Shape( pts ), 0.004, { bevel: 0.001, uv: 5 } ), den, [ k * 0.05, k * 0.004, k * 0.03 ], [ 0, k * 0.7, 0 ] );
				}
			}
		}
		return ground( g );
	} );
}
