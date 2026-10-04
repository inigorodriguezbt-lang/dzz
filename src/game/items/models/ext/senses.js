// Model builders for the senses, hazards and diving equipment (defs/ext/senses.js). register( reg ) is called once by
// render/ItemModels.js. Conventions (render/ItemModels.js): metres and real-world proportions, origin at the centre of the
// bottom, long axis along +x; each builder works with centred parts and sets the result on the ground with ground().
// Detail that reads at arm's length and as an icon: coated glass (a purple-green or germanium sheen), rubber eyecups,
// knurled rings (a texture, not geometry), webbing straps (a ribbon along a curve), corrugated hoses, printed gauge faces,
// LCDs and labels. Untextured opaque parts collapse into a few shared materials when the world draws them
// (ItemModels.instanceParts), so the cost is the few textured ones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, G, PI, add, group, ground, labelTex, canvasTex, css, facet } from '../lib.js';

// ---- geometry ---------------------------------------------------------------------------------------------------------------

const V3 = ( x, y, z ) => new THREE.Vector3( x, y, z );
const B = ( w, h, d ) => new THREE.BoxGeometry( w, h, d );
// a rounded box centred on the origin
const RB = ( w, h, d, r = 0.004, seg = 2 ) => G.rbox( w, h, d, r, seg ).translate( 0, - h / 2, 0 );
// cylinders: along y (centred), along x (radius r at -x, r2 at +x), along z
const CY = ( r, h, seg = 20, r2 = r, open = false ) => new THREE.CylinderGeometry( r2, r, h, seg, 1, open );
const CX = ( r, len, seg = 20, r2 = r, open = false ) => new THREE.CylinderGeometry( r2, r, len, seg, 1, open ).rotateZ( - PI / 2 );
const CZ = ( r, len, seg = 20, r2 = r ) => new THREE.CylinderGeometry( r2, r, len, seg ).rotateX( PI / 2 );
// a lathe round the x axis: pts [ [ x, r ], … ]
const LX = ( pts, seg = 24 ) => new THREE.LatheGeometry( pts.map( ( p ) => new THREE.Vector2( Math.max( 0, p[ 1 ] ), p[ 0 ] ) ), seg ).rotateZ( - PI / 2 );
// a lathe round the y axis: pts [ [ r, y ], … ]
const LY = ( pts, seg = 24 ) => new THREE.LatheGeometry( pts.map( ( p ) => new THREE.Vector2( Math.max( 0, p[ 0 ] ), p[ 1 ] ) ), seg );
const TOR = ( R, r, rs = 8, ts = 28, arc = PI * 2 ) => new THREE.TorusGeometry( R, r, rs, ts, arc );
// a lens: a shallow dome of radius r bulging b towards +x, its base at x = 0
function lensGeo( r, b = r * 0.12, seg = 24 ) {
	const R = ( r * r + b * b ) / ( 2 * b ), th = Math.asin( Math.min( 1, r / R ) );
	return new THREE.SphereGeometry( R, seg, 5, 0, PI * 2, 0, th ).translate( 0, - R + b, 0 ).rotateZ( - PI / 2 );
}
// a flat strap (webbing, a silicone band) along a curve: w wide, t thick; `up` keeps the width across it
function band( pts, w, t, seg = 40, up = [ 0, 1, 0 ] ) {
	const curve = new THREE.CatmullRomCurve3( pts.map( ( p ) => V3( ...p ) ) );
	const U = V3( ...up ).normalize(), P = [], S = [], N = [];
	for ( let i = 0; i <= seg; i ++ ) {
		const u = i / seg, p = curve.getPointAt( u ), T = curve.getTangentAt( u );
		const s = new THREE.Vector3().crossVectors( T, U );
		if ( s.lengthSq() < 1e-8 ) s.set( 0, 0, 1 );
		s.normalize();
		P.push( p ); S.push( s ); N.push( new THREE.Vector3().crossVectors( s, T ).normalize() );
	}
	const geos = [];
	for ( const [ fn, fs ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {
		const pos = [], nor = [], uv = [], idx = [];
		for ( let i = 0; i <= seg; i ++ ) {
			const p = P[ i ], s = S[ i ], n = N[ i ];
			const off = fn ? n.clone().multiplyScalar( fn * t / 2 ) : s.clone().multiplyScalar( fs * w / 2 );
			const ax = fn ? s.clone().multiplyScalar( w / 2 ) : n.clone().multiplyScalar( t / 2 );
			const a = p.clone().add( off ).sub( ax ), b = p.clone().add( off ).add( ax ), nn = fn ? n.clone().multiplyScalar( fn ) : s.clone().multiplyScalar( fs );
			pos.push( a.x, a.y, a.z, b.x, b.y, b.z );
			nor.push( nn.x, nn.y, nn.z, nn.x, nn.y, nn.z );
			uv.push( i / seg, 0, i / seg, 1 );
			if ( i < seg ) { const k = i * 2; idx.push( k, k + 1, k + 2, k + 1, k + 3, k + 2 ); }
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( nor, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
		g.setIndex( idx );
		geos.push( g );
	}
	return mergeGeometries( geos );
}
// a hose along a curve; ribs > 0 corrugates it (a breathing hose, an inflator hose)
function hose( pts, r, seg = 32, ribs = 0, rs = 7 ) {
	const curve = new THREE.CatmullRomCurve3( pts.map( ( p ) => V3( ...p ) ) );
	const g = new THREE.TubeGeometry( curve, seg, r, rs, false );
	if ( ribs > 0 ) {
		const pos = g.attributes.position, nor = g.attributes.normal;
		for ( let i = 0; i <= seg; i ++ ) {
			const k = 0.82 + 0.18 * Math.cos( i / seg * ribs * PI * 2 );
			for ( let j = 0; j <= rs; j ++ ) {
				const v = i * ( rs + 1 ) + j, p = curve.getPointAt( i / seg );
				pos.setXYZ( v, p.x + ( pos.getX( v ) - p.x ) * k, p.y + ( pos.getY( v ) - p.y ) * k, p.z + ( pos.getZ( v ) - p.z ) * k );
			}
		}
		nor.needsUpdate = true;
		g.computeVertexNormals();
	}
	return g;
}
// a helix along +x (a coiled cable)
function coil( R, len, turns, r, x0 = 0, y0 = 0, z0 = 0 ) {
	const pts = [], n = Math.round( turns * 14 );
	for ( let i = 0; i <= n; i ++ ) { const t = i / n, a = t * turns * PI * 2; pts.push( V3( x0 + t * len, y0 + Math.cos( a ) * R, z0 + Math.sin( a ) * R ) ); }
	return new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts ), n, r, 4, false );
}
// orient a part (made along +y) along a direction, at a point
function along( m, dir, at ) {
	m.quaternion.setFromUnitVectors( V3( 0, 1, 0 ), V3( ...dir ).normalize() );
	if ( at ) m.position.set( ...at );
	return m;
}

// ---- surfaces -----------------------------------------------------------------------------------------------------------------

const D2 = THREE.DoubleSide;
const plastic = ( c, rough = 0.5 ) => M( c, { rough } );
const rubber = ( c = 0x161616, side ) => M( c, { rough: 0.88, side } );
const steel = () => M( 0xb4b8be, { rough: 0.28, metal: 0.92 } );
const chrome = () => M( 0xd8dce2, { rough: 0.12, metal: 1 } );
const darkMetal = () => M( 0x2c2e32, { rough: 0.38, metal: 0.75 } );
const brass = () => M( 0xc9a24a, { rough: 0.3, metal: 0.9 } );
const anod = ( c, rough = 0.32 ) => M( c, { rough, metal: 0.65 } );
// coated optics: a purple-green anti-reflection sheen, a thermal core's germanium, an IR filter's deep ruby
const coat = () => M( 0x2a1c48, { rough: 0.04, metal: 0.82 } );
const coatGreen = () => M( 0x173d30, { rough: 0.04, metal: 0.82 } );
const germanium = () => M( 0x5a523e, { rough: 0.12, metal: 0.95 } );
const ruby = () => M( 0x3a0608, { rough: 0.04, metal: 0.6 } );
const glass = ( c = 0xdfeef4, op = 0.28 ) => M( c, { rough: 0.05, transparent: true, opacity: op } );
const glow = ( c, k = 2 ) => M( c, { rough: 0.3, emissive: c, emissiveIntensity: k } );
const print = ( spec, rough = 0.5 ) => M( 0xffffff, { map: labelTex( spec ), rough } );

// repeating textures, one cached clone per repeat
const reps = new Map();
function rep( base, key, rx, ry ) {
	const k = key + ':' + rx + ':' + ry;
	let t = reps.get( k );
	if ( t ) return t;
	t = base().clone();
	t.repeat.set( rx, ry );
	t.needsUpdate = true;
	reps.set( k, t );
	return t;
}
const knurlBase = () => canvasTex( 'senses:knurl', 64, 64, ( ctx, W, H ) => {
	ctx.fillStyle = '#b4b4b4'; ctx.fillRect( 0, 0, W, H );
	ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 5;
	for ( let i = - W; i < W * 2; i += 16 ) { ctx.beginPath(); ctx.moveTo( i, 0 ); ctx.lineTo( i + H, H ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( i, H ); ctx.lineTo( i + H, 0 ); ctx.stroke(); }
}, { repeat: true } );
// knurling on a ring: `n` diamonds round it
const knurl = ( c = 0x2a2a2a, n = 18, metal = 0.3 ) => M( c === 0x2a2a2a ? 0x6a6a6a : c, { map: rep( knurlBase, 'knurl', n, 1 ), rough: 0.55, metal } );
const ribBase = () => canvasTex( 'senses:ribs', 64, 64, ( ctx, W, H ) => {
	ctx.fillStyle = '#d0d0d0'; ctx.fillRect( 0, 0, W, H );
	ctx.fillStyle = '#404040'; for ( let y = 0; y < H; y += 16 ) ctx.fillRect( 0, y, W, 6 );
}, { repeat: true } );
const ribs = ( c, n = 8 ) => M( c, { map: rep( ribBase, 'ribs', 1, n ), rough: 0.8 } );
// nylon webbing: a fine weave with a darker edge
const webBase = () => canvasTex( 'senses:web', 64, 64, ( ctx, W, H ) => {
	ctx.fillStyle = '#cfcfcf'; ctx.fillRect( 0, 0, W, H );
	ctx.fillStyle = 'rgba(0,0,0,0.18)'; for ( let x = 0; x < W; x += 4 ) ctx.fillRect( x, 0, 2, H );
	ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect( 0, 0, W, 6 ); ctx.fillRect( 0, H - 6, W, 6 );
}, { repeat: true } );
const webbing = ( c, n = 20 ) => M( c, { map: rep( webBase, 'web', n, 1 ), rough: 0.85, side: D2 } );
// a speaker or sensor grille: holes in rows
const grilleBase = () => canvasTex( 'senses:grille', 128, 128, ( ctx, W, H ) => {
	ctx.fillStyle = '#c8c8c8'; ctx.fillRect( 0, 0, W, H );
	ctx.fillStyle = '#121212';
	for ( let y = 6; y < H; y += 12 ) for ( let x = 6 + ( ( y / 12 ) % 2 ) * 6; x < W; x += 12 ) { ctx.beginPath(); ctx.arc( x, y, 3.6, 0, PI * 2 ); ctx.fill(); }
}, { repeat: true } );
const grille = ( c = 0x9a9a9a, n = 2 ) => M( c, { map: rep( grilleBase, 'grille', n, n ), rough: 0.6, metal: 0.3 } );

// ---- printed faces ---------------------------------------------------------------------------------------------------------

// a pressure gauge's dial: 0..max bar, the red reserve, the needle at `at`
function gaugeTex( max = 300, at = 200, unit = 'BAR', red = 50 ) {
	return canvasTex( `senses:gauge:${max}:${at}:${unit}`, 256, 256, ( ctx, W, H ) => {
		const cx = W / 2, cy = H / 2, R = W * 0.47;
		ctx.fillStyle = '#16181a'; ctx.fillRect( 0, 0, W, H );
		const face = ctx.createRadialGradient( cx, cy * 0.85, R * 0.1, cx, cy, R );
		face.addColorStop( 0, '#ffffff' ); face.addColorStop( 1, '#e6e8e4' );
		ctx.fillStyle = face; ctx.beginPath(); ctx.arc( cx, cy, R, 0, PI * 2 ); ctx.fill();
		const a0 = PI * 0.75, a1 = PI * 2.25, ang = ( v ) => a0 + ( a1 - a0 ) * v / max;
		ctx.lineWidth = 16; ctx.strokeStyle = '#d82a22'; ctx.beginPath(); ctx.arc( cx, cy, R * 0.8, ang( 0 ), ang( red ) ); ctx.stroke();
		ctx.strokeStyle = '#3aa040'; ctx.beginPath(); ctx.arc( cx, cy, R * 0.8, ang( max * 0.66 ), ang( max ) ); ctx.stroke();
		ctx.strokeStyle = '#111'; ctx.fillStyle = '#111';
		for ( let v = 0; v <= max; v += max / 30 ) {
			const a = ang( v ), big = Math.round( v / ( max / 6 ) ) * ( max / 6 ) === Math.round( v );
			ctx.lineWidth = big ? 4 : 2;
			ctx.beginPath(); ctx.moveTo( cx + Math.cos( a ) * R * ( big ? 0.66 : 0.72 ), cy + Math.sin( a ) * R * ( big ? 0.66 : 0.72 ) ); ctx.lineTo( cx + Math.cos( a ) * R * 0.88, cy + Math.sin( a ) * R * 0.88 ); ctx.stroke();
		}
		ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		for ( let v = 0; v <= max; v += max / 6 ) { const a = ang( v ); ctx.fillText( String( Math.round( v ) ), cx + Math.cos( a ) * R * 0.5, cy + Math.sin( a ) * R * 0.5 ); }
		ctx.font = 'bold 22px Arial'; ctx.fillText( unit, cx, cy + R * 0.42 );
		ctx.save(); ctx.translate( cx, cy ); ctx.rotate( ang( at ) );
		ctx.fillStyle = '#e8521a'; ctx.beginPath(); ctx.moveTo( - 14, - 5 ); ctx.lineTo( R * 0.84, 0 ); ctx.lineTo( - 14, 5 ); ctx.closePath(); ctx.fill();
		ctx.restore();
		ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc( cx, cy, 11, 0, PI * 2 ); ctx.fill();
	} );
}
// an LCD (key: one per design); draw( ctx, W, H ) on a backlit panel
function lcd( key, w, h, bg, draw ) {
	return canvasTex( 'senses:lcd:' + key, w, h, ( ctx, W, H ) => {
		ctx.fillStyle = bg; ctx.fillRect( 0, 0, W, H );
		const sh = ctx.createLinearGradient( 0, 0, 0, H ); sh.addColorStop( 0, 'rgba(255,255,255,0.08)' ); sh.addColorStop( 1, 'rgba(0,0,0,0.12)' );
		draw( ctx, W, H );
		ctx.fillStyle = sh; ctx.fillRect( 0, 0, W, H );
	} );
}
// a label printed twice round a cylinder (so one copy faces you whichever way it lies): a band colour, big text, a line
function wrapPrint( key, { bg, fg, text, sub, stripe, stripe2 } ) {
	return M( 0xffffff, { rough: 0.45, map: canvasTex( 'senses:wrap:' + key, 512, 192, ( ctx, W, H ) => {
		ctx.fillStyle = css( bg ); ctx.fillRect( 0, 0, W, H );
		if ( stripe != null ) { ctx.fillStyle = css( stripe ); ctx.fillRect( 0, H * 0.06, W, H * 0.07 ); ctx.fillRect( 0, H * 0.87, W, H * 0.07 ); }
		if ( stripe2 != null ) { ctx.fillStyle = css( stripe2 ); ctx.fillRect( 0, H * 0.16, W, H * 0.03 ); ctx.fillRect( 0, H * 0.81, W, H * 0.03 ); }
		ctx.fillStyle = css( fg ); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		for ( const x of [ W * 0.25, W * 0.75 ] ) {
			ctx.font = '900 76px Arial'; ctx.fillText( text, x, H * 0.46 );
			if ( sub ) { ctx.font = 'bold 20px Arial'; ctx.fillText( sub, x, H * 0.7 ); }
		}
	} ) } );
}
// a flat printed panel (plane) lying on +y at height y, centred at x, z
function decal( g, mat, w, d, x, y, z, rotY = 0 ) {
	const m = add( g, new THREE.PlaneGeometry( w, d ).rotateX( - PI / 2 ), mat, [ x, y, z ] );
	m.rotation.y = rotY;
	return m;
}
// a band of label round a cylinder along x, radius r, from x0 to x1
function labelBand( g, mat, r, x0, x1, y = 0, z = 0, seg = 32 ) {
	const geo = new THREE.CylinderGeometry( r, r, x1 - x0, seg, 1, true ).rotateZ( - PI / 2 );
	return add( g, geo, mat, [ ( x0 + x1 ) / 2, y, z ] );
}

// ---- shared parts --------------------------------------------------------------------------------------------------------------

// a rubber eyecup flaring towards -x from x, on axis y, z
function eyecup( g, x, y, z, r = 0.017, len = 0.022, mat = rubber( 0x141414, D2 ) ) {
	add( g, LX( [ [ - len, r * 1.28 ], [ - len + 0.002, r * 1.32 ], [ - len * 0.55, r * 1.2 ], [ 0, r ] ], 22 ), mat, [ x, y, z ] );
	add( g, TOR( r * 1.3, 0.0018, 6, 22 ).rotateY( PI / 2 ), mat, [ x - len + 0.001, y, z ] );
}
// a webbing head strap looping behind (-x) from two anchor points, lying on the ground
function headStrap( g, x, z, mat, back = 0.15, w = 0.022 ) {
	const pts = [ [ x, 0.022, z ], [ x - 0.045, 0.006, z * 1.3 ], [ x - back * 0.6, 0.003, z * 1.35 ], [ x - back, 0.003, z * 0.8 ], [ x - back - 0.012, 0.003, 0 ],
		[ x - back, 0.003, - z * 0.8 ], [ x - back * 0.6, 0.003, - z * 1.35 ], [ x - 0.045, 0.006, - z * 1.3 ], [ x, 0.022, - z ] ];
	add( g, band( pts, w, 0.0025, 60 ), mat );
	// a padded patch at the back of the head
	add( g, RB( 0.04, 0.007, 0.06, 0.003 ), plastic( 0x1a1a1a, 0.85 ), [ x - back + 0.008, 0.005, 0 ] );
}
// a gas mask canister: olive, ribbed, its label band, the threaded neck (axis +y from y = 0)
function canister( g, at = [ 0, 0, 0 ], dir = [ 0, 1, 0 ], color = 0x4a5236, cap = true ) {
	const c = group();
	const body = M( color, { rough: 0.62 } ), ribM = M( color, { rough: 0.5 } );
	add( c, LY( [ [ 0, 0 ], [ 0.046, 0 ], [ 0.051, 0.004 ], [ 0.051, 0.06 ], [ 0.049, 0.066 ], [ 0.036, 0.078 ], [ 0.022, 0.083 ], [ 0.02, 0.083 ] ], 32 ), body );
	for ( const y of [ 0.012, 0.052 ] ) add( c, CY( 0.0525, 0.004, 32 ), ribM, [ 0, y, 0 ] );
	const lab = print( { bg: 0xd8d2b4, fg: 0x1a1a1a, text: 'NBC FILTER', sub: 'A2B2E2K2-P3 · 40 MM', band: 0x1a1a1a, style: 'band', w: 512, h: 128, size: 0.42 } );
	add( c, new THREE.CylinderGeometry( 0.0515, 0.0515, 0.034, 32, 1, true, 0.2, PI * 1.6 ), lab, [ 0, 0.032, 0 ] );
	add( c, CY( 0.0195, 0.016, 20 ), darkMetal(), [ 0, 0.09, 0 ] );
	for ( const y of [ 0.085, 0.089, 0.093 ] ) add( c, TOR( 0.0198, 0.0012, 4, 20 ).rotateX( PI / 2 ), darkMetal(), [ 0, y, 0 ] );
	if ( cap ) add( c, CY( 0.0215, 0.012, 20 ), plastic( 0xc0282a, 0.45 ), [ 0, 0.1, 0 ] );
	// the inlet under it: a perforated plate
	add( c, CY( 0.042, 0.002, 28 ), grille( 0x3a3e30, 3 ), [ 0, - 0.0005, 0 ] );
	along( c, dir, at );
	g.add( c );
	return c;
}
// a respirator cartridge: a low round body, the magenta P100 pad over olive, the bayonet under it (axis +y)
function cartridge( g, at, dir = [ 0, 1, 0 ] ) {
	const c = group();
	add( c, LY( [ [ 0, 0 ], [ 0.038, 0 ], [ 0.041, 0.003 ], [ 0.041, 0.024 ], [ 0.038, 0.028 ], [ 0, 0.028 ] ], 32 ), plastic( 0x2a2c2a, 0.5 ) );
	const lab = print( { bg: 0xc23a8a, fg: 0xffffff, text: 'P100', sub: 'OV/AG', band: 0x6a7a3a, style: 'band', w: 512, h: 96, size: 0.5 } );
	add( c, new THREE.CylinderGeometry( 0.0412, 0.0412, 0.016, 32, 1, true ), lab, [ 0, 0.014, 0 ] );
	add( c, CY( 0.035, 0.0025, 28 ), grille( 0xc23a8a, 2 ), [ 0, 0.029, 0 ] );
	add( c, CY( 0.016, 0.008, 18 ), plastic( 0xe8e8e2, 0.4 ), [ 0, - 0.004, 0 ] );
	for ( const a of [ 0, PI ] ) add( c, B( 0.008, 0.004, 0.006 ), plastic( 0xe8e8e2, 0.4 ), [ Math.cos( a ) * 0.017, - 0.006, Math.sin( a ) * 0.017 ] );
	along( c, dir, at );
	g.add( c );
	return c;
}
// a regulator second stage (axis +y: the mouthpiece faces +x): body, purge button, exhaust tee
function secondStage( g, at, color = 0x1a1a1a, rotY = 0 ) {
	const s = group();
	const body = plastic( color, 0.45 );
	add( s, CY( 0.031, 0.034, 28 ), body, [ 0, 0.017, 0 ] );
	add( s, CY( 0.026, 0.004, 28 ), plastic( color === 0x1a1a1a ? 0x6a6e74 : 0x1a1a1a, 0.6 ), [ 0, 0.036, 0 ] );
	add( s, CY( 0.012, 0.004, 20 ), rubber( 0x3a3a3a ), [ 0, 0.039, 0 ] );
	add( s, RB( 0.05, 0.012, 0.03, 0.005 ), plastic( 0x1a1a1a, 0.5 ), [ 0, 0.006, - 0.03 ] );
	add( s, RB( 0.028, 0.02, 0.026, 0.008 ), rubber( 0xb89a6a ), [ 0.034, 0.017, 0 ] );
	add( s, CX( 0.007, 0.018, 12 ), steel(), [ - 0.036, 0.017, 0 ] );
	s.rotation.y = rotY;
	s.position.set( ...at );
	g.add( s );
	return s;
}
// a pressure gauge console: a rubber boot and the dial under glass, facing +y
function gaugeConsole( g, at, max = 300, val = 200, rotY = 0 ) {
	const s = group();
	add( s, CY( 0.036, 0.028, 28, 0.034 ), rubber( 0x1c1c1c ), [ 0, 0.014, 0 ] );
	add( s, CY( 0.03, 0.0015, 32 ), M( 0xffffff, { map: gaugeTex( max, val ), rough: 0.4 } ), [ 0, 0.0285, 0 ] );
	add( s, new THREE.SphereGeometry( 0.031, 24, 4, 0, PI * 2, 0, 0.35 ).translate( 0, - 0.0295, 0 ), glass( 0xe8f4f8, 0.22 ), [ 0, 0.028, 0 ] );
	add( s, CX( 0.008, 0.024, 12 ), rubber( 0x1c1c1c ), [ - 0.044, 0.014, 0 ] );
	s.rotation.y = rotY;
	s.position.set( ...at );
	g.add( s );
	return s;
}

export function register( reg ) {
	// ================================================================ vision ================================================================

	// night-vision and thermal goggles on a head mount, lying with the objectives forward (+x)
	reg( 'senses_nvg', ( s ) => {
		const g = group(), body = plastic( s.color ?? 0x3c4232, 0.62 ), rub = rubber( 0x141414, D2 ), k = knurl( 0x2a2a2a, 20 );
		const y0 = 0.026;
		if ( s.style === 'thermal' ) {
			// one core in the middle, a binocular display behind it
			add( g, RB( 0.08, 0.05, 0.11, 0.012 ), body, [ 0, y0, 0 ] );
			add( g, CX( 0.021, 0.024, 28 ), plastic( 0x1a1a1a, 0.5 ), [ 0.052, y0, 0 ] );
			add( g, CX( 0.023, 0.016, 28, 0.026, true ), rubber( 0x161616, D2 ), [ 0.071, y0, 0 ] );
			add( g, lensGeo( 0.0165, 0.0025 ), germanium(), [ 0.061, y0, 0 ] );
			add( g, TOR( 0.017, 0.0014, 6, 28 ).rotateY( PI / 2 ), darkMetal(), [ 0.062, y0, 0 ] );
			for ( const z of [ - 0.032, 0.032 ] ) {
				add( g, CX( 0.016, 0.03, 24 ), plastic( 0x1e1e1e, 0.5 ), [ - 0.052, y0, z ] );
				add( g, CX( 0.0172, 0.008, 24 ), k, [ - 0.045, y0, z ] );
				eyecup( g, - 0.067, y0, z, 0.016, 0.02, rub );
				add( g, lensGeo( 0.011, 0.0015 ).rotateZ( PI ), coatGreen(), [ - 0.064, y0, z ] );
			}
			// battery box, buttons and a status light on top
			add( g, RB( 0.05, 0.018, 0.034, 0.005 ), plastic( 0x222222, 0.55 ), [ - 0.004, y0 + 0.032, 0 ] );
			for ( const [ x, c ] of [ [ - 0.018, 0x2a2a2a ], [ 0, 0x2a2a2a ], [ 0.018, 0x2a6a2a ] ] ) add( g, CY( 0.0045, 0.004, 14 ), rubber( c ), [ x, y0 + 0.043, 0.024 ] );
			add( g, CY( 0.002, 0.002, 8 ), glow( 0x30ff60, 1.2 ), [ 0.03, y0 + 0.026, 0.028 ] );
			add( g, B( 0.034, 0.008, 0.024 ), darkMetal(), [ - 0.004, y0 + 0.045, 0 ] );
			headStrap( g, - 0.04, 0.05, webbing( 0x1c1c1c ), 0.085 );
		} else {
			// two tubes on a hinged bridge (PVS-15 style)
			for ( const z of [ - 0.034, 0.034 ] ) {
				eyecup( g, - 0.054, y0, z, 0.0165, 0.022, rub );
				add( g, lensGeo( 0.012, 0.0016 ).rotateZ( PI ), coatGreen(), [ - 0.058, y0, z ] );
				add( g, CX( 0.0165, 0.024, 24 ), body, [ - 0.042, y0, z ] );
				add( g, CX( 0.0178, 0.012, 24 ), k, [ - 0.038, y0, z ] );
				add( g, CX( 0.0196, 0.06, 28 ), body, [ 0, y0, z ] );
				add( g, CX( 0.0216, 0.017, 28 ), k, [ 0.039, y0, z ] );
				add( g, CX( 0.0205, 0.016, 28, 0.0228 ), body, [ 0.055, y0, z ] );
				add( g, lensGeo( 0.0178, 0.0022 ), coat(), [ 0.0605, y0, z ] );
				add( g, TOR( 0.0192, 0.0016, 6, 28 ).rotateY( PI / 2 ), darkMetal(), [ 0.0628, y0, z ] );
				// the objective cap hanging from its tether
				add( g, CY( 0.022, 0.006, 24 ), rubber( 0x1a1a1a ), [ 0.05, 0.003, z * 2.05 ], [ 0, 0, 0.1 ] );
				add( g, hose( [ [ 0.045, y0 - 0.012, z * 1.25 ], [ 0.05, 0.006, z * 1.6 ], [ 0.05, 0.004, z * 1.85 ] ], 0.0016, 10 ), rubber( 0x1a1a1a ) );
			}
			add( g, RB( 0.046, 0.034, 0.05, 0.006 ), body, [ - 0.004, y0 + 0.002, 0 ] );
			add( g, CX( 0.0098, 0.052, 20 ), body, [ - 0.004, y0 + 0.024, 0 ] );
			add( g, CX( 0.0108, 0.01, 20 ), k, [ 0.026, y0 + 0.024, 0 ] );
			add( g, CY( 0.0062, 0.008, 16 ), rubber( 0x1e1e1e ), [ - 0.022, y0 + 0.02, 0.016 ] );
			add( g, B( 0.002, 0.0012, 0.006 ), plastic( 0xf2f2ee ), [ - 0.022, y0 + 0.0245, 0.016 ] );
			// the mount shoe and its dovetail
			add( g, B( 0.03, 0.007, 0.022 ), darkMetal(), [ - 0.006, y0 + 0.036, 0 ] );
			add( g, B( 0.03, 0.003, 0.03 ), darkMetal(), [ - 0.006, y0 + 0.041, 0 ] );
			// a little IR diode at the bridge
			add( g, CX( 0.0045, 0.006, 14 ), plastic( 0x1a1a1a ), [ 0.02, y0 - 0.006, 0 ] );
			add( g, lensGeo( 0.0035, 0.0008 ), ruby(), [ 0.023, y0 - 0.006, 0 ] );
			headStrap( g, - 0.045, 0.052, webbing( 0x1c1c1c ), 0.085 );
		}
		return ground( g );
	} );

	// handheld night vision (a Gen-1 with its IR lamp) and a thermal monocular
	reg( 'senses_monocular', ( s ) => {
		const g = group(), rub = rubber( 0x141414, D2 );
		if ( s.style === 'thermal' ) {
			const y0 = 0.028, body = plastic( s.color ?? 0x2a2c2e, 0.55 );
			add( g, RB( 0.165, 0.052, 0.054, 0.016 ), body, [ 0, y0, 0 ] );
			add( g, RB( 0.08, 0.048, 0.057, 0.014 ), ribs( 0x222222, 10 ), [ - 0.012, y0, 0 ] );
			add( g, CX( 0.02, 0.016, 26, 0.023, true ), rubber( 0x161616, D2 ), [ 0.09, y0, 0 ] );
			add( g, lensGeo( 0.0155, 0.0022 ), germanium(), [ 0.083, y0, 0 ] );
			add( g, TOR( 0.0165, 0.0015, 6, 26 ).rotateY( PI / 2 ), darkMetal(), [ 0.084, y0, 0 ] );
			eyecup( g, - 0.082, y0, 0, 0.017, 0.022, rub );
			add( g, lensGeo( 0.009, 0.0012 ).rotateZ( PI ), coatGreen(), [ - 0.086, y0, 0 ] );
			for ( const [ x, c ] of [ [ - 0.03, 0x2a2a2a ], [ - 0.012, 0x2a2a2a ], [ 0.006, 0x2a2a2a ], [ 0.03, 0x3a8a3a ] ] ) add( g, CY( 0.0055, 0.004, 14 ), rubber( c ), [ x, y0 + 0.027, 0 ] );
			add( g, CY( 0.006, 0.002, 14 ), steel(), [ 0.02, 0.002, 0 ] );
			add( g, band( [ [ - 0.07, y0 - 0.02, 0.026 ], [ - 0.1, 0.006, 0.05 ], [ - 0.14, 0.003, 0.03 ], [ - 0.13, 0.003, 0.0 ], [ - 0.09, 0.006, - 0.01 ], [ - 0.07, y0 - 0.02, 0.02 ] ], 0.008, 0.002, 40 ), webbing( 0x1a1a1a, 30 ) );
			const plate = print( { bg: 0x2a2c2e, fg: 0xe8e8e2, text: 'THERMAL', sub: '384 · 50 Hz', style: 'plain', w: 256, h: 64, size: 0.5 } );
			add( g, new THREE.PlaneGeometry( 0.05, 0.0125 ), plate, [ 0.035, y0, 0.0276 ] );
		} else {
			const y0 = 0.034, body = rubber( s.color ?? 0x24272a ), k = knurl( 0x2a2a2a, 22 );
			add( g, RB( 0.12, 0.066, 0.058, 0.02 ), body, [ 0, y0, 0 ] );
			add( g, CX( 0.026, 0.026, 28, 0.029 ), plastic( 0x1c1c1c, 0.55 ), [ 0.07, y0, 0 ] );
			add( g, CX( 0.0305, 0.015, 28 ), k, [ 0.076, y0, 0 ] );
			add( g, lensGeo( 0.023, 0.003 ), M( 0x3a1834, { rough: 0.04, metal: 0.8 } ), [ 0.0835, y0, 0 ] );
			add( g, TOR( 0.0245, 0.002, 6, 28 ).rotateY( PI / 2 ), darkMetal(), [ 0.0838, y0, 0 ] );
			add( g, CX( 0.015, 0.03, 22 ), plastic( 0x1c1c1c, 0.55 ), [ - 0.074, y0, 0 ] );
			add( g, CX( 0.016, 0.01, 22 ), k, [ - 0.067, y0, 0 ] );
			eyecup( g, - 0.089, y0, 0, 0.015, 0.02, rub );
			add( g, lensGeo( 0.0095, 0.0012 ).rotateZ( PI ), coatGreen(), [ - 0.092, y0, 0 ] );
			// the IR lamp on the side, the battery cap underneath
			add( g, CX( 0.0095, 0.022, 18 ), plastic( 0x1c1c1c ), [ 0.045, y0 + 0.016, 0.032 ] );
			add( g, lensGeo( 0.0075, 0.0012 ), ruby(), [ 0.056, y0 + 0.016, 0.032 ] );
			add( g, CZ( 0.012, 0.006, 22 ), k, [ - 0.02, y0 - 0.008, - 0.031 ] );
			for ( const [ x, c ] of [ [ - 0.02, 0x3a3a3a ], [ 0.005, 0x8a2020 ] ] ) add( g, CY( 0.0058, 0.005, 14 ), rubber( c ), [ x, y0 + 0.034, 0 ] );
			const plate = print( { bg: 0x1e2022, fg: 0xd8d8d0, text: 'NIGHT VISION 2.5×', sub: 'GEN 1 · IR', style: 'plain', w: 256, h: 64, size: 0.42 } );
			add( g, new THREE.PlaneGeometry( 0.055, 0.0138 ), plate, [ - 0.015, y0 + 0.005, 0.0296 ] );
			add( g, band( [ [ - 0.05, 0.01, - 0.028 ], [ - 0.08, 0.003, - 0.06 ], [ - 0.12, 0.003, - 0.05 ], [ - 0.125, 0.003, - 0.02 ], [ - 0.09, 0.004, - 0.012 ], [ - 0.05, 0.012, - 0.026 ] ], 0.008, 0.002, 40 ), webbing( 0x1a1a1a, 30 ) );
		}
		return ground( g );
	} );

	// an infrared illuminator: a tan torch with a ruby filter, its rail clamp and the remote pressure switch on a coiled cord
	reg( 'senses_ir', ( s ) => {
		const g = group(), y0 = 0.032, body = M( s.color ?? 0x8a7a5a, { rough: 0.62, metal: 0.15 } ), k = knurl( s.color ?? 0x8a7a5a, 20, 0.15 );
		add( g, CX( 0.0128, 0.02, 22 ), k, [ - 0.058, y0, 0 ] );
		add( g, CX( 0.0118, 0.082, 22 ), body, [ - 0.008, y0, 0 ] );
		add( g, CX( 0.0118, 0.022, 24, 0.0172 ), body, [ 0.044, y0, 0 ] );
		add( g, CX( 0.0188, 0.018, 26 ), k, [ 0.064, y0, 0 ] );
		add( g, lensGeo( 0.0152, 0.0018 ), ruby(), [ 0.073, y0, 0 ] );
		add( g, TOR( 0.0162, 0.0016, 6, 26 ).rotateY( PI / 2 ), darkMetal(), [ 0.0735, y0, 0 ] );
		for ( const x of [ - 0.03, - 0.018 ] ) add( g, CX( 0.0122, 0.003, 22 ), M( 0x5a5038, { rough: 0.5, metal: 0.5 } ), [ x, y0, 0 ] );
		// the clamp
		add( g, B( 0.034, 0.014, 0.024 ), darkMetal(), [ 0.0, y0 - 0.019, 0 ] );
		add( g, B( 0.034, 0.005, 0.03 ), darkMetal(), [ 0.0, y0 - 0.028, 0 ] );
		add( g, CZ( 0.0055, 0.01, 14 ), knurl( 0x2a2a2a, 10 ), [ 0.0, y0 - 0.019, 0.017 ] );
		// the remote switch
		add( g, coil( 0.0055, 0.045, 7, 0.0012, - 0.105, 0.008, 0.03 ), rubber( 0x161616 ) );
		add( g, hose( [ [ - 0.068, y0, 0 ], [ - 0.08, 0.022, 0.012 ], [ - 0.095, 0.009, 0.028 ], [ - 0.105, 0.008, 0.03 ] ], 0.0013, 14 ), rubber( 0x161616 ) );
		add( g, RB( 0.04, 0.009, 0.017, 0.004 ), rubber( 0x202020 ), [ - 0.04, 0.0045, 0.045 ], [ 0, 0.3, 0 ] );
		add( g, B( 0.024, 0.002, 0.01 ), rubber( 0x3a3a3a ), [ - 0.04, 0.0095, 0.045 ], [ 0, 0.3, 0 ] );
		add( g, hose( [ [ - 0.06, 0.008, 0.03 ], [ - 0.05, 0.005, 0.042 ] ], 0.0013, 4 ), rubber( 0x161616 ) );
		return ground( g );
	} );

	// a spotting scope: a 45° eyepiece, the armoured body, the focus collar, a sun shade; `tripod`: on its table tripod
	reg( 'senses_scope', ( s ) => {
		const g = group(), arm = rubber( s.color ?? 0x3c4a3a ), k = knurl( 0x2a2a2a, 30 ), blk = plastic( 0x1c1c1c, 0.5 );
		const y0 = s.tripod ? 0.3 : 0.047;
		add( g, CX( 0.036, 0.2, 30 ), arm, [ 0.02, y0, 0 ] );
		add( g, CX( 0.036, 0.06, 30, 0.047 ), arm, [ 0.15, y0, 0 ] );
		add( g, CX( 0.048, 0.06, 32, 0.048, true ), M( s.color ?? 0x3c4a3a, { rough: 0.85, side: D2 } ), [ 0.21, y0, 0 ] );
		add( g, lensGeo( 0.043, 0.004 ), coat(), [ 0.18, y0, 0 ] );
		add( g, TOR( 0.044, 0.0022, 6, 32 ).rotateY( PI / 2 ), darkMetal(), [ 0.182, y0, 0 ] );
		add( g, CX( 0.039, 0.05, 30 ), k, [ - 0.04, y0, 0 ] );
		add( g, RB( 0.07, 0.07, 0.064, 0.016 ), arm, [ - 0.11, y0, 0 ] );
		// the angled eyepiece
		const ep = group();
		add( ep, CY( 0.019, 0.06, 22 ), blk, [ 0, 0.03, 0 ] );
		add( ep, CY( 0.021, 0.014, 22 ), k, [ 0, 0.045, 0 ] );
		add( ep, LY( [ [ 0.018, 0.06 ], [ 0.024, 0.076 ], [ 0.0255, 0.08 ], [ 0.02, 0.08 ] ], 22 ), rubber( 0x141414, D2 ) );
		add( ep, lensGeo( 0.011, 0.0014 ).rotateZ( PI / 2 ), coatGreen(), [ 0, 0.074, 0 ] );
		ep.position.set( - 0.13, y0 + 0.02, 0 ); ep.rotation.z = PI / 4;
		g.add( ep );
		// the foot and its knob
		add( g, B( 0.06, 0.03, 0.026 ), blk, [ 0.02, y0 - 0.048, 0 ] );
		add( g, CZ( 0.007, 0.012, 14 ), k, [ 0.02, y0 - 0.048, 0.02 ] );
		if ( s.tripod ) {
			add( g, CY( 0.014, 0.05, 16 ), darkMetal(), [ 0.02, y0 - 0.085, 0 ] );
			add( g, CY( 0.022, 0.03, 18 ), blk, [ 0.02, y0 - 0.12, 0 ] );
			for ( let i = 0; i < 3; i ++ ) {
				const a = i / 3 * PI * 2 + 0.4, fx = 0.02 + Math.cos( a ) * 0.2, fz = Math.sin( a ) * 0.2;
				add( g, hose( [ [ 0.02, y0 - 0.13, 0 ], [ ( 0.02 + fx ) / 2, ( y0 - 0.13 ) / 2, fz / 2 ], [ fx, 0.012, fz ] ], 0.007, 6 ), anod( 0x2a2c30 ) );
				add( g, CY( 0.011, 0.016, 10 ), rubber( 0x161616 ), [ fx, 0.008, fz ] );
			}
		}
		return ground( g );
	} );

	// ================================================================ hearing ================================================================

	// electronic ear defenders: two cups on a sprung headband, a volume knob and a battery door
	reg( 'senses_earmuffs', ( s ) => {
		const g = group(), shell = plastic( s.color ?? 0x3c4232, 0.55 ), pad = M( 0x141414, { rough: 0.55 } ), wire = steel();
		for ( const sd of [ - 1, 1 ] ) {
			const z = sd * 0.074;
			add( g, RB( 0.072, 0.088, 0.034, 0.016 ), shell, [ 0, 0.05, z ] );
			add( g, RB( 0.058, 0.072, 0.006, 0.01 ), plastic( 0x1a1a1a, 0.6 ), [ 0, 0.05, z + sd * 0.0175 ] );
			add( g, TOR( 0.03, 0.0095, 8, 30 ), pad, [ 0, 0.05, z - sd * 0.02 ], null, [ 1, 1.22, 0.8 ] );
			add( g, B( 0.012, 0.02, 0.012 ), plastic( 0x1a1a1a ), [ 0, 0.1, z ] );
		}
		// the right cup: volume knobs and a speaker grille; the left: the battery door
		for ( const x of [ - 0.016, 0.016 ] ) add( g, CZ( 0.0068, 0.011, 16 ), knurl( 0x2a2a2a, 12 ), [ x, 0.022, 0.074 + 0.022 ] );
		add( g, CZ( 0.012, 0.002, 18 ), grille( 0x2a2a2a, 1 ), [ 0.0, 0.058, 0.074 + 0.021 ] );
		add( g, RB( 0.036, 0.024, 0.004, 0.006 ), plastic( 0x2a2e26, 0.5 ), [ 0, 0.06, - 0.074 - 0.0195 ] );
		// the headband: two spring wires and the padded strap between them
		for ( const x of [ - 0.022, 0.022 ] ) add( g, hose( [ [ x, 0.104, - 0.074 ], [ x, 0.15, - 0.06 ], [ x, 0.178, - 0.025 ], [ x, 0.183, 0 ], [ x, 0.178, 0.025 ], [ x, 0.15, 0.06 ], [ x, 0.104, 0.074 ] ], 0.0021, 40 ), wire );
		add( g, band( [ [ 0, 0.118, - 0.07 ], [ 0, 0.158, - 0.052 ], [ 0, 0.176, - 0.02 ], [ 0, 0.179, 0 ], [ 0, 0.176, 0.02 ], [ 0, 0.158, 0.052 ], [ 0, 0.118, 0.07 ] ], 0.036, 0.007, 40, [ 1, 0, 0 ] ), webbing( s.color ?? 0x3c4232, 12 ) );
		return ground( g );
	} );

	// corded foam earplugs: two orange tapered plugs on a blue cord
	reg( 'senses_earplugs', () => {
		const g = group(), foam = M( 0xf26a1a, { rough: 0.95 } );
		const plug = () => LX( [ [ 0, 0 ], [ 0.001, 0.0045 ], [ 0.005, 0.0062 ], [ 0.019, 0.0058 ], [ 0.023, 0.0045 ], [ 0.0245, 0 ] ], 16 );
		add( g, plug(), foam, [ - 0.012, 0.0062, - 0.012 ], [ 0, 0.5, 0 ] );
		add( g, plug(), foam, [ 0.008, 0.0062, 0.016 ], [ 0, - 0.9, 0 ] );
		add( g, hose( [ [ - 0.012, 0.004, - 0.012 ], [ - 0.03, 0.002, 0.01 ], [ - 0.01, 0.002, 0.045 ], [ 0.03, 0.002, 0.05 ], [ 0.045, 0.002, 0.03 ], [ 0.01, 0.004, 0.016 ] ], 0.0011, 40 ), plastic( 0x2a6ad6, 0.6 ) );
		return ground( g );
	} );

	// a parabolic microphone: the dish, the capsule at its focus, the pistol grip and amp box behind
	reg( 'senses_parabolic', () => {
		const g = group(), dishM = M( 0x5a6048, { rough: 0.45, side: D2 } ), blk = plastic( 0x1a1a1a, 0.55 );
		const R = 0.2, dep = 0.06, pts = [];
		for ( let i = 0; i <= 12; i ++ ) { const r = i / 12 * R; pts.push( [ r * r / ( R * R ) * dep, r ] ); }
		add( g, LX( pts, 40 ), dishM, [ 0, 0, 0 ] );
		add( g, TOR( R, 0.004, 6, 48 ).rotateY( PI / 2 ), M( 0x3a3e30, { rough: 0.5 } ), [ dep, 0, 0 ] );
		add( g, CX( 0.0028, 0.15, 10 ), steel(), [ 0.075, 0, 0 ] );
		add( g, new THREE.SphereGeometry( 0.012, 16, 10 ), M( 0x1a1a1a, { rough: 1 } ), [ 0.155, 0, 0 ] );
		add( g, CX( 0.007, 0.02, 14 ), blk, [ 0.138, 0, 0 ] );
		// behind the dish: the amp box, a knob, the grip
		add( g, RB( 0.05, 0.05, 0.06, 0.008 ), blk, [ - 0.03, - 0.01, 0 ] );
		add( g, CZ( 0.007, 0.01, 14 ), knurl( 0x2a2a2a, 10 ), [ - 0.03, 0.0, 0.034 ] );
		add( g, CY( 0.003, 0.004, 10 ), glow( 0x40ff40, 1.5 ), [ - 0.045, 0.016, 0.0 ] );
		add( g, RB( 0.032, 0.11, 0.03, 0.01 ), ribs( 0x1c1c1c, 9 ), [ - 0.045, - 0.085, 0 ], [ 0, 0, - 0.18 ] );
		add( g, B( 0.008, 0.02, 0.008 ), plastic( 0x3a3a3a ), [ - 0.022, - 0.06, 0 ] );
		add( g, hose( [ [ - 0.055, - 0.03, 0.02 ], [ - 0.09, - 0.08, 0.06 ], [ - 0.06, - 0.17, 0.08 ], [ 0.0, - 0.19, 0.05 ] ], 0.0018, 24 ), rubber( 0x161616 ) );
		return ground( g );
	} );

	// ================================================================ air ================================================================

	reg( 'senses_filter', ( s ) => {
		const g = group();
		canister( g, [ 0, 0.0012, 0 ], [ 0, 1, 0 ], s.color ?? 0x4a5236, true );
		return ground( g );
	} );

	// a pair of respirator cartridges, one leaning on the other
	reg( 'senses_cartridges', () => {
		const g = group();
		cartridge( g, [ - 0.024, 0.0085, 0 ] );
		cartridge( g, [ 0.036, 0.022, 0.006 ], [ - 0.75, 0.66, 0 ] );
		return ground( g );
	} );

	// a single-gas detector: yellow overmould, the LCD, alarm windows, the sensor port and the steel clip
	reg( 'senses_detector', () => {
		const g = group(), y0 = 0.016;
		add( g, RB( 0.092, 0.028, 0.052, 0.009 ), M( 0xf2c21a, { rough: 0.7 } ), [ 0, y0, 0 ] );
		add( g, RB( 0.072, 0.004, 0.04, 0.006 ), plastic( 0x1a1a1a, 0.35 ), [ - 0.004, y0 + 0.014, 0 ] );
		const face = M( 0xffffff, { map: lcd( 'so2', 192, 128, '#a8b8a0', ( ctx, W, H ) => {
			ctx.fillStyle = '#1a2418'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'left'; ctx.fillText( 'SO2', 10, 26 );
			ctx.font = 'bold 64px Arial'; ctx.textAlign = 'right'; ctx.fillText( '0.0', W - 14, 92 );
			ctx.font = 'bold 18px Arial'; ctx.fillText( 'PPM', W - 14, 118 ); ctx.textAlign = 'left'; ctx.fillText( '▮▮▮', 10, 118 );
		} ), rough: 0.25, emissive: 0x2a3a2a, emissiveIntensity: 0.25 } );
		decal( g, face, 0.04, 0.027, 0.004, y0 + 0.0165, 0, - PI / 2 );
		for ( const z of [ - 0.017, 0.017 ] ) add( g, RB( 0.012, 0.006, 0.008, 0.002 ), M( 0xd81a1a, { rough: 0.1, metal: 0.2 } ), [ 0.044, y0 + 0.008, z ] );
		add( g, CY( 0.008, 0.004, 18 ), grille( 0x2a2a2a, 1 ), [ - 0.034, y0 + 0.0155, 0 ] );
		add( g, CY( 0.0055, 0.004, 14 ), rubber( 0x1a1a1a ), [ 0.027, y0 + 0.0155, 0 ] );
		add( g, B( 0.056, 0.0018, 0.016 ), steel(), [ 0.0, y0 - 0.0155, 0 ] );
		add( g, B( 0.012, 0.004, 0.018 ), steel(), [ 0.028, y0 - 0.017, 0 ] );
		return ground( g );
	} );

	// a firefighter's SCBA: the back frame, the carbon bottle and its valve, shoulder straps, the gauge on its hose
	reg( 'senses_scba', () => {
		const g = group(), frame = plastic( 0x1e1f22, 0.55 ), web = webbing( 0x1a1a1a, 16 ), hiv = M( 0xd8e23a, { rough: 0.6 } );
		add( g, RB( 0.52, 0.026, 0.25, 0.03 ), frame, [ 0, 0.013, 0 ] );
		add( g, RB( 0.08, 0.04, 0.32, 0.015 ), plastic( 0x2a2a2a, 0.75 ), [ - 0.25, 0.02, 0 ] );
		const y = 0.026 + 0.082;
		add( g, LX( [ [ - 0.26, 0 ], [ - 0.26, 0.06 ], [ - 0.25, 0.078 ], [ - 0.23, 0.082 ], [ 0.17, 0.082 ], [ 0.21, 0.076 ], [ 0.24, 0.055 ], [ 0.255, 0.025 ], [ 0.258, 0.018 ] ], 32 ), M( 0x1a1a1c, { rough: 0.32, metal: 0.2 } ), [ 0, y, 0 ] );
		labelBand( g, wrapPrint( 'scba', { bg: 0xf2f2ee, fg: 0x1a1a1a, text: 'AIR', sub: 'BREATHING AIR · 300 BAR', stripe: 0xd82a1a, stripe2: 0xd8e23a } ), 0.0825, - 0.02, 0.1, y );
		add( g, CX( 0.02, 0.02, 18 ), chrome(), [ 0.268, y, 0 ] );
		add( g, RB( 0.045, 0.05, 0.036, 0.006 ), chrome(), [ 0.3, y, 0 ] );
		add( g, CX( 0.026, 0.016, 24 ), ribs( 0x1a1a1a, 4 ), [ 0.33, y, 0 ] );
		for ( const x of [ - 0.12, 0.08 ] ) add( g, TOR( 0.085, 0.006, 6, 32 ).rotateY( PI / 2 ), web, [ x, y, 0 ], null, [ 1, 1, 1 ] );
		add( g, B( 0.03, 0.012, 0.03 ), steel(), [ - 0.12, y + 0.088, 0 ] );
		for ( const sd of [ - 1, 1 ] ) {
			add( g, band( [ [ 0.2, 0.028, sd * 0.08 ], [ 0.24, 0.01, sd * 0.17 ], [ 0.1, 0.006, sd * 0.24 ], [ - 0.08, 0.006, sd * 0.22 ], [ - 0.22, 0.012, sd * 0.15 ] ], 0.05, 0.008, 40 ), web );
			add( g, band( [ [ 0.2, 0.034, sd * 0.08 ], [ 0.24, 0.016, sd * 0.17 ], [ 0.1, 0.012, sd * 0.24 ], [ - 0.08, 0.012, sd * 0.22 ], [ - 0.22, 0.018, sd * 0.15 ] ], 0.014, 0.002, 40 ), hiv );
		}
		add( g, hose( [ [ 0.3, y + 0.02, 0.018 ], [ 0.28, 0.08, 0.12 ], [ 0.15, 0.03, 0.2 ], [ 0.08, 0.03, 0.22 ] ], 0.0055, 30 ), rubber( 0x1a1a1a ) );
		gaugeConsole( g, [ 0.05, 0.002, 0.22 ], 300, 280, PI );
		return ground( g );
	} );

	// a gas mask lying face up: the moulded facepiece and seal, twin eyepieces, the voicemitter, a canister on the left
	// cheek, the drink tube, a head harness of straps to a pad
	reg( 'senses_gasmask', ( s ) => {
		const g = group(), rub = M( s.color ?? 0x2a2c2a, { rough: 0.72 } ), A = 0.105, Bh = 0.07, Cz = 0.085;
		add( g, new THREE.SphereGeometry( 1, 32, 16, 0, PI * 2, 0, PI / 2 ), rub, [ 0, 0.012, 0 ], null, [ A, Bh, Cz ] );
		add( g, TOR( 1, 0.08, 8, 40 ).rotateX( PI / 2 ), rub, [ 0, 0.012, 0 ], null, [ A, 0.09, Cz ] );
		// a point on the shell and its normal (for parts set into it)
		const on = ( x, z, lift = 0 ) => {
			const k = 1 - ( x / A ) ** 2 - ( z / Cz ) ** 2, y = Bh * Math.sqrt( Math.max( 0, k ) );
			const n = V3( x / ( A * A ), y / ( Bh * Bh ), z / ( Cz * Cz ) ).normalize();
			return { p: [ x + n.x * lift, 0.012 + y + n.y * lift, z + n.z * lift ], n: [ n.x, n.y, n.z ] };
		};
		for ( const z of [ - 0.036, 0.036 ] ) {
			const { p, n } = on( - 0.034, z, 0.002 );
			const e = group();
			add( e, CY( 0.026, 0.008, 28 ), darkMetal(), [ 0, 0, 0 ] );
			add( e, TOR( 0.025, 0.0028, 6, 28 ).rotateX( PI / 2 ), steel(), [ 0, 0.004, 0 ] );
			add( e, CY( 0.0225, 0.002, 28 ), M( 0x1c2a34, { rough: 0.04, metal: 0.7 } ), [ 0, 0.0045, 0 ] );
			along( e, n, p );
			g.add( e );
		}
		{
			const { p, n } = on( 0.04, 0, 0.004 );
			const v = group();
			add( v, CY( 0.022, 0.018, 24 ), darkMetal(), [ 0, 0, 0 ] );
			add( v, CY( 0.019, 0.002, 24 ), grille( 0x6a6e74, 2 ), [ 0, 0.0095, 0 ] );
			along( v, n, p );
			g.add( v );
		}
		{
			const { p, n } = on( 0.082, 0, 0.004 );
			const o = group();
			add( o, RB( 0.03, 0.014, 0.03, 0.006 ), plastic( 0x1a1a1a, 0.6 ), [ 0, 0, 0 ] );
			along( o, n, p );
			g.add( o );
		}
		// the canister on the left cheek, its port and the drink tube's coupler
		const c = on( 0.045, 0.066, 0.002 ), cd = V3( 0.35, 0.3, 1 ).normalize();
		add( g, CY( 0.024, 0.016, 22 ), darkMetal(), c.p ).quaternion.setFromUnitVectors( V3( 0, 1, 0 ), cd );
		canister( g, [ c.p[ 0 ] + cd.x * 0.008, c.p[ 1 ] + cd.y * 0.008, c.p[ 2 ] + cd.z * 0.008 ], [ cd.x, cd.y, cd.z ], 0x4a5236, false );
		add( g, hose( [ [ 0.055, 0.062, - 0.03 ], [ 0.09, 0.03, - 0.055 ], [ 0.11, 0.01, - 0.045 ] ], 0.0032, 16 ), rubber( 0x1a1a1a ) );
		add( g, CX( 0.005, 0.016, 12 ), plastic( 0x3a3a3a ), [ 0.118, 0.008, - 0.042 ] );
		// the head harness
		const strap = rubber( 0x1a1a1a, D2 );
		const pad = [ - 0.24, 0.004, 0 ];
		for ( const [ x, z ] of [ [ - 0.06, 0.07 ], [ - 0.06, - 0.07 ], [ 0.02, 0.085 ], [ 0.02, - 0.085 ], [ - 0.1, 0 ] ] ) {
			add( g, band( [ [ x, 0.02, z ], [ ( x + pad[ 0 ] ) * 0.5 - 0.02, 0.006, z * 1.25 ], [ pad[ 0 ] + 0.03, 0.004, z * 0.35 ] ], 0.013, 0.002, 24 ), strap );
			add( g, B( 0.012, 0.004, 0.016 ), steel(), [ x - 0.008, 0.02, z * 1.02 ] );
		}
		add( g, new THREE.CircleGeometry( 0.042, 5 ).rotateX( - PI / 2 ), M( 0x1a1a1a, { rough: 0.8, side: D2 } ), pad );
		return ground( g );
	} );

	// a half-face respirator lying face up: the silicone body, two cartridges on the cheeks, the exhalation valve, straps
	reg( 'senses_halfmask', ( s ) => {
		const g = group(), sil = M( 0x5c6670, { rough: 0.5 } ), frame = plastic( s.color ?? 0x2a2b2e, 0.45 );
		// a nose cup: narrower at the nose (-x), wide at the chin
		const cup = new THREE.SphereGeometry( 1, 28, 14, 0, PI * 2, 0, PI / 2 );
		const cp = cup.attributes.position;
		for ( let i = 0; i < cp.count; i ++ ) { const x = cp.getX( i ); cp.setZ( i, cp.getZ( i ) * ( 0.78 + 0.22 * ( x + 1 ) / 2 ) ); }
		cup.computeVertexNormals();
		add( g, cup, sil, [ 0, 0.008, 0 ], null, [ 0.074, 0.046, 0.064 ] );
		add( g, TOR( 1, 0.09, 8, 36 ).rotateX( PI / 2 ), sil, [ 0, 0.008, 0 ], null, [ 0.074, 0.08, 0.06 ] );
		add( g, RB( 0.05, 0.02, 0.086, 0.008 ), frame, [ 0.008, 0.045, 0 ] );
		add( g, RB( 0.03, 0.006, 0.03, 0.004 ), grille( 0x3a3c40, 1 ), [ 0.03, 0.058, 0 ] );
		for ( const sd of [ - 1, 1 ] ) {
			cartridge( g, [ 0.006, 0.03, sd * 0.052 ], [ 0.15, 0.55, sd * 0.82 ] );
			add( g, band( [ [ - 0.01, 0.04, sd * 0.05 ], [ - 0.07, 0.012, sd * 0.09 ], [ - 0.15, 0.004, sd * 0.07 ], [ - 0.19, 0.004, sd * 0.02 ] ], 0.014, 0.002, 24 ), webbing( 0x3a5a8a, 14 ) );
			add( g, band( [ [ 0.04, 0.02, sd * 0.05 ], [ 0.02, 0.004, sd * 0.1 ], [ - 0.04, 0.003, sd * 0.11 ] ], 0.012, 0.002, 18 ), webbing( 0x3a5a8a, 10 ) );
		}
		add( g, RB( 0.05, 0.004, 0.06, 0.008 ), plastic( 0x3a5a8a, 0.6 ), [ - 0.19, 0.003, 0 ] );
		return ground( g );
	} );

	// ================================================================ diving ================================================================

	// an aluminium 80 lying on its side: painted, its rubber boot, the K-valve and handwheel, the AIR label; `reg`: with the
	// regulator on it (first stage, second stage, the yellow octopus, the gauge console, the inflator hose)
	reg( 'senses_tank', ( s ) => {
		const g = group(), R = 0.092, y = R + 0.004, paint = M( s.color ?? 0xd8b82a, { rough: 0.32, metal: 0.15 } );
		add( g, LX( [ [ - 0.33, 0 ], [ - 0.33, 0.055 ], [ - 0.326, 0.08 ], [ - 0.312, R ], [ 0.23, R ], [ 0.27, 0.087 ], [ 0.3, 0.07 ], [ 0.322, 0.042 ], [ 0.33, 0.024 ], [ 0.333, 0.02 ] ], 36 ), paint, [ 0, y, 0 ] );
		add( g, LX( [ [ - 0.345, 0 ], [ - 0.345, 0.07 ], [ - 0.34, 0.09 ], [ - 0.33, 0.096 ], [ - 0.24, 0.096 ], [ - 0.236, 0.093 ] ], 36 ), rubber( 0x161616 ), [ 0, y, 0 ] );
		for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2; add( g, CX( 0.007, 0.004, 10 ), plastic( 0x050505 ), [ - 0.346, y + Math.cos( a ) * 0.05, Math.sin( a ) * 0.05 ] ); }
		labelBand( g, wrapPrint( 'air', { bg: 0xf4f4ee, fg: 0x1a1a1a, text: 'AIR', sub: 'AL80 · 207 BAR', stripe: 0x1a6ad6 } ), R + 0.0006, 0.06, 0.17, y );
		add( g, new THREE.CylinderGeometry( R + 0.0008, R + 0.0008, 0.05, 36, 1, true, - 0.5, 0.9 ).rotateZ( - PI / 2 ), print( { bg: 0x2a9a3a, fg: 0xffffff, text: 'VIP', sub: 'INSPECTED', style: 'plain', w: 256, h: 128, size: 0.5 } ), [ - 0.12, y, 0 ] );
		// the valve
		add( g, CX( 0.02, 0.022, 18 ), chrome(), [ 0.343, y, 0 ] );
		add( g, RB( 0.036, 0.046, 0.034, 0.006 ), chrome(), [ 0.37, y, 0 ] );
		add( g, CY( 0.006, 0.02, 12 ), chrome(), [ 0.37, y + 0.032, 0 ] );
		add( g, CY( 0.022, 0.014, 24 ), ribs( 0x1a1a1a, 3 ), [ 0.37, y + 0.046, 0 ] );
		add( g, CZ( 0.011, 0.012, 18 ), chrome(), [ 0.37, y, 0.022 ] );
		add( g, TOR( 0.0075, 0.0016, 6, 16 ), rubber( 0x1a1a1a ), [ 0.37, y, 0.0285 ] );
		if ( s.reg ) {
			// the first stage on the valve, hoses running round the tank to the stages and the console
			add( g, CZ( 0.02, 0.05, 22 ), chrome(), [ 0.37, y, 0.06 ] );
			add( g, CZ( 0.026, 0.012, 22 ), knurl( 0x2a2a2a, 16 ), [ 0.37, y, 0.036 ] );
			const blk = rubber( 0x161616 );
			add( g, hose( [ [ 0.37, y + 0.02, 0.07 ], [ 0.33, y + 0.11, 0.06 ], [ 0.18, y + 0.11, 0.0 ], [ 0.06, y + 0.05, - 0.11 ], [ 0.02, 0.03, - 0.16 ] ], 0.0062, 40 ), blk );
			secondStage( g, [ 0.02, 0.0, - 0.19 ], 0x1a1a1a, PI / 2 );
			add( g, hose( [ [ 0.38, y - 0.01, 0.085 ], [ 0.36, 0.06, 0.16 ], [ 0.24, 0.02, 0.2 ], [ 0.17, 0.02, 0.18 ] ], 0.0062, 30 ), M( 0xf2c21a, { rough: 0.6 } ) );
			secondStage( g, [ 0.14, 0.0, 0.17 ], 0xf2c21a, - 0.6 );
			add( g, hose( [ [ 0.36, y - 0.02, 0.08 ], [ 0.3, 0.05, 0.14 ], [ 0.12, 0.02, 0.16 ], [ - 0.02, 0.02, 0.16 ], [ - 0.08, 0.02, 0.16 ] ], 0.0065, 40 ), blk );
			gaugeConsole( g, [ - 0.12, 0.0, 0.16 ], 300, 200, PI );
			add( g, hose( [ [ 0.37, y - 0.02, 0.06 ], [ 0.34, 0.03, - 0.04 ], [ 0.28, 0.012, - 0.12 ] ], 0.0075, 24, 9 ), blk );
			add( g, CX( 0.009, 0.024, 14 ), chrome(), [ 0.27, 0.012, - 0.13 ], [ 0, 0.8, 0 ] );
		}
		return ground( g );
	} );

	// a regulator set on its own: first stage, hoses fanned out, both second stages and the console
	reg( 'senses_regulator', () => {
		const g = group(), blk = rubber( 0x161616 ), y = 0.022;
		add( g, CY( 0.02, 0.05, 22 ), chrome(), [ 0, y, 0 ], [ PI / 2, 0, 0 ] );
		add( g, TOR( 0.034, 0.006, 8, 24 ), chrome(), [ 0, y, - 0.03 ] );
		add( g, CZ( 0.012, 0.03, 16 ), knurl( 0x2a2a2a, 12 ), [ 0, y, - 0.07 ] );
		for ( const [ a, b ] of [ [ 0.02, - 0.01 ], [ - 0.02, 0.0 ], [ 0.0, 0.02 ] ] ) add( g, CX( 0.005, 0.012, 10 ), chrome(), [ a, y + b, 0.012 ] );
		add( g, hose( [ [ 0.02, y, 0.01 ], [ 0.09, 0.012, 0.05 ], [ 0.15, 0.01, 0.0 ], [ 0.14, 0.01, - 0.07 ] ], 0.0062, 30 ), blk );
		secondStage( g, [ 0.13, 0.0, - 0.1 ], 0x1a1a1a, 0.9 );
		add( g, hose( [ [ 0.0, y, 0.025 ], [ 0.02, 0.01, 0.09 ], [ 0.06, 0.01, 0.13 ], [ 0.1, 0.01, 0.14 ] ], 0.0062, 30 ), M( 0xf2c21a, { rough: 0.6 } ) );
		secondStage( g, [ 0.13, 0.0, 0.15 ], 0xf2c21a, - 0.3 );
		add( g, hose( [ [ - 0.02, y, 0.01 ], [ - 0.07, 0.012, 0.06 ], [ - 0.12, 0.01, 0.04 ], [ - 0.13, 0.01, - 0.01 ] ], 0.0065, 30 ), blk );
		gaugeConsole( g, [ - 0.15, 0.0, - 0.05 ], 300, 0, PI * 0.6 );
		return ground( g );
	} );

	// a jacket BCD lying front up: the bladder panels, pockets, D-rings, the tank band, the corrugated inflator hose
	reg( 'senses_bcd', ( s ) => {
		const g = group(), cord = M( s.color ?? 0x1c1d22, { rough: 0.85 } ), acc = M( s.color2 ?? 0x1f6ad8, { rough: 0.6 } ), web = webbing( 0x161616, 14 );
		for ( const sd of [ - 1, 1 ] ) {
			add( g, RB( 0.4, 0.05, 0.15, 0.03, 3 ), cord, [ - 0.01, 0.025, sd * 0.115 ] );
			add( g, RB( 0.39, 0.004, 0.006, 0.002 ), acc, [ - 0.01, 0.05, sd * 0.188 ] );
			add( g, RB( 0.14, 0.03, 0.12, 0.012 ), cord, [ - 0.1, 0.06, sd * 0.11 ] );
			add( g, B( 0.13, 0.002, 0.004 ), acc, [ - 0.1, 0.0755, sd * 0.06 ] );
			add( g, TOR( 0.012, 0.003, 6, 16 ), chrome(), [ 0.09, 0.052, sd * 0.05 ], [ PI / 2, 0, 0 ] );
			add( g, band( [ [ 0.19, 0.04, sd * 0.1 ], [ 0.23, 0.05, sd * 0.06 ], [ 0.26, 0.05, sd * 0.02 ] ], 0.04, 0.005, 12 ), web );
			add( g, B( 0.03, 0.01, 0.03 ), plastic( 0x1a1a1a, 0.5 ), [ 0.12, 0.055, sd * 0.17 ] );
		}
		add( g, RB( 0.12, 0.054, 0.4, 0.03, 3 ), cord, [ 0.22, 0.027, 0 ] );
		add( g, band( [ [ - 0.1, 0.055, - 0.17 ], [ - 0.1, 0.06, - 0.06 ], [ - 0.1, 0.06, 0.06 ], [ - 0.1, 0.055, 0.17 ] ], 0.05, 0.004, 16 ), web );
		add( g, B( 0.04, 0.012, 0.03 ), plastic( 0x1a1a1a, 0.4 ), [ - 0.1, 0.064, 0 ] );
		add( g, hose( [ [ 0.27, 0.06, 0.13 ], [ 0.25, 0.09, 0.2 ], [ 0.12, 0.07, 0.22 ], [ - 0.04, 0.06, 0.21 ] ], 0.011, 40, 26 ), plastic( 0x1a1a1a, 0.6 ) );
		add( g, CX( 0.014, 0.06, 16 ), plastic( 0x6a6e74, 0.45 ), [ - 0.075, 0.06, 0.21 ] );
		for ( const [ x, c ] of [ [ - 0.06, 0x1f6ad8 ], [ - 0.088, 0x1a1a1a ] ] ) add( g, CY( 0.007, 0.01, 14 ), plastic( c, 0.4 ), [ x, 0.074, 0.21 ] );
		const back = print( { bg: 0x1c1d22, fg: 0x1f6ad8, text: 'REEF PRO', sub: 'BCD · L', style: 'plain', w: 256, h: 96, size: 0.5 } );
		decal( g, back, 0.08, 0.03, - 0.1, 0.0758, - 0.11, - PI / 2 );
		return ground( g );
	} );

	// a wrist dive computer: the puck, steel bezel and buttons, its LCD, the strap round an invisible wrist
	reg( 'senses_divecomp', () => {
		const g = group(), y = 0.07;
		add( g, RB( 0.052, 0.016, 0.052, 0.009 ), plastic( 0x1a1a1c, 0.45 ), [ 0, y, 0 ] );
		add( g, RB( 0.054, 0.004, 0.054, 0.009 ), steel(), [ 0, y + 0.007, 0 ] );
		const face = M( 0xffffff, { map: lcd( 'dive', 192, 192, '#a7b49e', ( ctx, W, H ) => {
			ctx.fillStyle = '#152015'; ctx.textAlign = 'right';
			ctx.font = 'bold 74px Arial'; ctx.fillText( '18.4', W - 30, 90 ); ctx.font = 'bold 22px Arial'; ctx.fillText( 'm', W - 10, 90 );
			ctx.textAlign = 'left'; ctx.font = 'bold 22px Arial'; ctx.fillText( 'NDL', 14, 132 ); ctx.fillText( 'TIME', 104, 132 );
			ctx.font = 'bold 36px Arial'; ctx.fillText( '24', 14, 170 ); ctx.fillText( '47\'', 104, 170 );
			for ( let i = 0; i < 5; i ++ ) ctx.fillRect( 14, 20 + i * 12, 10, 8 );
			ctx.strokeStyle = '#152015'; ctx.lineWidth = 2; ctx.strokeRect( 6, 104, W - 12, 80 );
		} ), rough: 0.2, emissive: 0x24301f, emissiveIntensity: 0.3 } );
		decal( g, face, 0.04, 0.04, 0, y + 0.0092, 0, - PI / 2 );
		for ( const [ x, z ] of [ [ 0.014, 0.027 ], [ - 0.014, 0.027 ], [ 0.014, - 0.027 ], [ - 0.014, - 0.027 ] ] ) add( g, CZ( 0.0032, 0.005, 12 ), steel(), [ x, y - 0.004, z ] );
		add( g, band( [ [ 0.025, y - 0.006, 0 ], [ 0.045, y - 0.012, 0 ], [ 0.05, y - 0.04, 0 ], [ 0.03, y - 0.064, 0 ], [ 0, y - 0.07, 0 ], [ - 0.03, y - 0.064, 0 ], [ - 0.05, y - 0.04, 0 ], [ - 0.045, y - 0.012, 0 ], [ - 0.025, y - 0.006, 0 ] ], 0.024, 0.003, 50, [ 0, 0, 1 ] ), rubber( 0x161618, D2 ) );
		add( g, B( 0.012, 0.004, 0.028 ), steel(), [ 0, y - 0.068, 0 ] );
		g.userData.iconDir = [ 0.35, 1, 0.55 ];
		return ground( g );
	} );

	// a canister dive light: the yellow body, rubber grip rings, the head with its reflector and LED behind glass, a lanyard
	reg( 'senses_divelight', ( s ) => {
		const g = group(), y = 0.029, body = M( s.color ?? 0xf2c21a, { rough: 0.35 } ), blk = rubber( 0x161616 );
		add( g, CX( 0.02, 0.026, 22 ), blk, [ - 0.09, y, 0 ] );
		add( g, CX( 0.0195, 0.13, 24 ), body, [ - 0.012, y, 0 ] );
		for ( const x of [ - 0.05, - 0.03, - 0.01 ] ) add( g, CX( 0.021, 0.008, 22 ), blk, [ x, y, 0 ] );
		add( g, CX( 0.0195, 0.03, 26, 0.028 ), body, [ 0.068, y, 0 ] );
		add( g, CX( 0.029, 0.012, 28 ), blk, [ 0.088, y, 0 ] );
		add( g, LX( [ [ 0.072, 0.006 ], [ 0.092, 0.025 ] ], 28 ), M( 0xe8ecf0, { rough: 0.08, metal: 1, side: D2 } ), [ 0, y, 0 ] );
		add( g, CX( 0.005, 0.004, 14 ), glow( 0xfff4e0, 1.5 ), [ 0.074, y, 0 ] );
		add( g, CX( 0.025, 0.003, 28 ), glass( 0xe8f4ff, 0.3 ), [ 0.093, y, 0 ] );
		add( g, CY( 0.005, 0.006, 12 ), rubber( 0x3a3a3a ), [ - 0.075, y + 0.021, 0 ] );
		add( g, band( [ [ - 0.102, y, 0 ], [ - 0.13, 0.01, 0.03 ], [ - 0.19, 0.004, 0.04 ], [ - 0.2, 0.004, 0.0 ], [ - 0.16, 0.005, - 0.03 ], [ - 0.12, 0.012, - 0.012 ], [ - 0.102, y, 0 ] ], 0.007, 0.0018, 40 ), webbing( 0x1a1a1a, 30 ) );
		return ground( g );
	} );

	// a chest-worn oxygen rebreather: the green case, its clasps and stencil, the two corrugated hoses to the mouthpiece,
	// the oxygen bottle, harness straps
	reg( 'senses_rebreather', ( s ) => {
		const g = group(), cas = M( s.color ?? 0x3a4232, { rough: 0.6 } ), y = 0.06;
		add( g, RB( 0.32, 0.12, 0.24, 0.035, 4 ), cas, [ 0, y, 0 ] );
		add( g, RB( 0.3, 0.008, 0.22, 0.03, 4 ), M( shadeHex( s.color ?? 0x3a4232, - 0.15 ), { rough: 0.55 } ), [ 0, y + 0.063, 0 ] );
		for ( const z of [ - 0.123, 0.123 ] ) for ( const x of [ - 0.08, 0.08 ] ) add( g, B( 0.024, 0.03, 0.006 ), steel(), [ x, y + 0.045, z ] );
		decal( g, print( { bg: 0x2f3629, fg: 0xe8d84a, text: 'O2 REBREATHER', sub: 'NO DEEPER THAN 7 M', style: 'plain', w: 512, h: 128, size: 0.32 } ), 0.2, 0.05, - 0.01, y + 0.068, 0.02 );
		const blk = plastic( 0x161616, 0.7 );
		for ( const sd of [ - 1, 1 ] ) add( g, hose( [ [ 0.14, y + 0.04, sd * 0.06 ], [ 0.2, y + 0.11, sd * 0.07 ], [ 0.27, y + 0.12, sd * 0.04 ], [ 0.3, y + 0.1, sd * 0.012 ] ], 0.016, 40, 22 ), blk );
		add( g, CZ( 0.02, 0.07, 22 ), plastic( 0x1a1a1a, 0.5 ), [ 0.31, y + 0.1, 0 ] );
		add( g, CY( 0.004, 0.03, 10 ), steel(), [ 0.31, y + 0.12, 0.03 ] );
		add( g, RB( 0.03, 0.024, 0.026, 0.008 ), rubber( 0xb89a6a ), [ 0.335, y + 0.1, 0 ] );
		add( g, CX( 0.026, 0.17, 24 ), M( 0x2a7a3a, { rough: 0.4, metal: 0.3 } ), [ - 0.02, 0.026, 0.15 ] );
		add( g, CX( 0.012, 0.03, 14 ), brass(), [ 0.08, 0.026, 0.15 ] );
		add( g, CY( 0.012, 0.01, 14 ), ribs( 0x1a1a1a, 3 ), [ 0.08, 0.044, 0.15 ] );
		for ( const sd of [ - 1, 1 ] ) add( g, band( [ [ - 0.16, 0.06, sd * 0.1 ], [ - 0.22, 0.01, sd * 0.12 ], [ - 0.3, 0.004, sd * 0.06 ], [ - 0.32, 0.004, 0.0 ] ], 0.04, 0.004, 24 ), webbing( 0x2a3020, 14 ) );
		return ground( g );
	} );

	// a rebreather refill: the absorbent canister and a small oxygen bottle
	reg( 'senses_scrubber', () => {
		const g = group();
		add( g, CY( 0.055, 0.15, 32 ), plastic( 0xd8dcd8, 0.5 ), [ - 0.05, 0.075, 0 ] );
		add( g, new THREE.CylinderGeometry( 0.0555, 0.0555, 0.08, 32, 1, true ), print( { bg: 0xf2f2ee, fg: 0x1a1a1a, text: 'CO2 ABSORBENT', sub: 'SODA LIME · ONE DIVE', band: 0x2a7a3a, style: 'band', w: 512, h: 160, size: 0.32 } ), [ - 0.05, 0.075, 0 ] );
		add( g, CY( 0.057, 0.012, 32 ), darkMetal(), [ - 0.05, 0.152, 0 ] );
		add( g, TOR( 0.02, 0.003, 6, 20 ).rotateX( PI / 2 ), steel(), [ - 0.05, 0.16, 0 ] );
		add( g, LX( [ [ - 0.11, 0 ], [ - 0.11, 0.03 ], [ 0.07, 0.03 ], [ 0.09, 0.022 ], [ 0.1, 0.01 ], [ 0.102, 0.008 ] ], 24 ), M( 0x2a7a3a, { rough: 0.4, metal: 0.3 } ), [ 0.08, 0.031, 0.08 ], [ 0, 0.5, 0 ] );
		add( g, LX( [ [ 0.04, 0.0305 ], [ 0.07, 0.0305 ], [ 0.09, 0.0225 ] ], 24 ), M( 0xf2f2ee, { rough: 0.4 } ), [ 0.08, 0.031, 0.08 ], [ 0, 0.5, 0 ] );
		add( g, CX( 0.01, 0.03, 14 ), brass(), [ 0.08 + Math.cos( 0.5 ) * 0.115, 0.031, 0.08 - Math.sin( 0.5 ) * 0.115 ], [ 0, 0.5, 0 ] );
		return ground( g );
	} );

	// a petrol dive compressor in its tube frame: the engine and fuel tank, the finned compressor block, the filter tower,
	// the gauge and the fill whip coiled on top
	reg( 'senses_compressor', () => {
		const g = group(), tube = M( 0xd84a1a, { rough: 0.4, metal: 0.3 } ), r = 0.011, L = 0.31, W = 0.2, H = 0.4;
		for ( const z of [ - W, W ] ) {
			add( g, CX( r, L * 2, 12 ), tube, [ 0, r, z ] );
			add( g, CX( r, L * 2, 12 ), tube, [ 0, H, z ] );
			for ( const x of [ - L, L ] ) add( g, CY( r, H, 12 ), tube, [ x, H / 2, z ] );
		}
		for ( const x of [ - L, L ] ) for ( const yy of [ r, H ] ) add( g, CZ( r, W * 2, 12 ), tube, [ x, yy, 0 ] );
		add( g, B( L * 2, 0.008, W * 2 - 0.02 ), M( 0x2a2a2a, { rough: 0.6, metal: 0.4 } ), [ 0, 0.025, 0 ] );
		// the engine
		add( g, RB( 0.22, 0.18, 0.2, 0.02 ), M( 0x8a8e94, { rough: 0.45, metal: 0.5 } ), [ - 0.15, 0.12, 0 ] );
		add( g, RB( 0.19, 0.075, 0.17, 0.025 ), M( 0xc8281e, { rough: 0.3 } ), [ - 0.15, 0.25, 0 ] );
		add( g, CY( 0.018, 0.016, 16 ), plastic( 0x1a1a1a, 0.5 ), [ - 0.12, 0.295, 0.04 ] );
		add( g, CZ( 0.075, 0.035, 28 ), plastic( 0x1a1a1a, 0.45 ), [ - 0.15, 0.13, - 0.12 ] );
		add( g, B( 0.05, 0.012, 0.012 ), plastic( 0x1a1a1a ), [ - 0.15, 0.13, - 0.145 ] );
		add( g, RB( 0.08, 0.07, 0.06, 0.01 ), plastic( 0x1a1a1a, 0.6 ), [ - 0.24, 0.2, 0.09 ] );
		add( g, CX( 0.035, 0.12, 20 ), M( 0x5a5e64, { rough: 0.35, metal: 0.8 } ), [ - 0.12, 0.09, 0.14 ] );
		// the compressor block and its fins
		const alu = M( 0xc8ccd2, { rough: 0.3, metal: 0.85 } );
		add( g, CY( 0.042, 0.14, 24 ), alu, [ 0.12, 0.13, - 0.05 ] );
		for ( let i = 0; i < 9; i ++ ) add( g, CY( 0.06, 0.004, 24 ), alu, [ 0.12, 0.08 + i * 0.012, - 0.05 ] );
		add( g, RB( 0.1, 0.03, 0.1, 0.01 ), alu, [ 0.12, 0.215, - 0.05 ] );
		add( g, RB( 0.06, 0.14, 0.05, 0.008 ), plastic( 0x1a1a1a, 0.5 ), [ 0.0, 0.12, - 0.13 ] );
		// the filter tower and the gauge
		add( g, CY( 0.034, 0.24, 24 ), chrome(), [ 0.22, 0.15, 0.09 ] );
		add( g, CY( 0.037, 0.02, 24 ), darkMetal(), [ 0.22, 0.28, 0.09 ] );
		add( g, CZ( 0.034, 0.024, 24 ), darkMetal(), [ 0.22, 0.33, 0.12 ] );
		add( g, CZ( 0.03, 0.0015, 28 ), M( 0xffffff, { map: gaugeTex( 300, 0 ), rough: 0.4 } ), [ 0.22, 0.33, 0.1325 ], [ 0, 0, PI / 2 ] );
		// the fill whip coiled on the frame, its yoke hanging
		for ( let i = 0; i < 3; i ++ ) add( g, TOR( 0.08 - i * 0.008, 0.006, 6, 30 ), rubber( 0x161616 ), [ 0.1, H + 0.008 + i * 0.012, 0.08 ], [ PI / 2, 0, 0 ] );
		add( g, hose( [ [ 0.17, H + 0.01, 0.08 ], [ 0.24, H + 0.02, 0.12 ], [ L + 0.02, 0.3, 0.16 ], [ L + 0.03, 0.18, 0.17 ] ], 0.006, 24 ), rubber( 0x161616 ) );
		add( g, TOR( 0.022, 0.006, 8, 20 ), chrome(), [ L + 0.03, 0.15, 0.17 ] );
		return ground( g );
	} );

	// ================================================================ gadgets ================================================================

	// a smartwatch: the aluminium case, the black glass and its face, crown and button, the silicone band
	reg( 'senses_watch', () => {
		const g = group(), y = 0.066;
		add( g, RB( 0.044, 0.011, 0.038, 0.008 ), M( 0x3a3c42, { rough: 0.25, metal: 0.85 } ), [ 0, y, 0 ] );
		add( g, RB( 0.041, 0.002, 0.035, 0.007 ), M( 0x050608, { rough: 0.04, metal: 0.3 } ), [ 0, y + 0.0055, 0 ] );
		const face = M( 0xffffff, { map: lcd( 'watch', 160, 192, '#000000', ( ctx, W, H ) => {
			ctx.textAlign = 'center';
			ctx.fillStyle = '#ff9a2a'; ctx.font = 'bold 20px Arial'; ctx.fillText( 'TUE 6', W / 2, 30 );
			ctx.fillStyle = '#ffffff'; ctx.font = 'bold 54px Arial'; ctx.fillText( '10:42', W / 2, 84 );
			ctx.lineWidth = 9; ctx.lineCap = 'round';
			[ [ '#ff2a5a', 30, 0.8 ], [ '#9aff2a', 21, 0.55 ], [ '#2ae8ff', 12, 0.7 ] ].forEach( ( [ c, r, k ] ) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc( 44, 140, r, - PI / 2, - PI / 2 + PI * 2 * k ); ctx.stroke(); } );
			ctx.fillStyle = '#ff3a4a'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'left'; ctx.fillText( '♥72', 84, 150 );
		} ), rough: 0.1, emissive: 0xffffff, emissiveIntensity: 0.06 } );
		decal( g, face, 0.033, 0.04, 0, y + 0.0067, 0, - PI / 2 );
		add( g, CZ( 0.0032, 0.004, 16 ), knurl( 0x8a8c92, 10, 0.7 ), [ 0.008, y - 0.002, 0.021 ] );
		add( g, CZ( 0.0016, 0.0008, 12 ), M( 0xd81a1a, { rough: 0.3 } ), [ 0.008, y - 0.002, 0.0233 ] );
		add( g, RB( 0.01, 0.003, 0.002, 0.001 ), M( 0x5a5c62, { rough: 0.3, metal: 0.8 } ), [ - 0.008, y - 0.003, 0.0195 ] );
		add( g, band( [ [ 0.021, y - 0.004, 0 ], [ 0.04, y - 0.012, 0 ], [ 0.046, y - 0.038, 0 ], [ 0.028, y - 0.06, 0 ], [ 0, y - 0.066, 0 ], [ - 0.028, y - 0.06, 0 ], [ - 0.046, y - 0.038, 0 ], [ - 0.04, y - 0.012, 0 ], [ - 0.021, y - 0.004, 0 ] ], 0.022, 0.0028, 50, [ 0, 0, 1 ] ), M( 0x2a2e3a, { rough: 0.6, side: D2 } ) );
		g.userData.iconDir = [ 0.35, 1, 0.55 ];
		return ground( g );
	} );

	// a laser pointer: anodised tube, pocket clip, button collar, the emitter tip, a warning label
	reg( 'senses_laser', () => {
		const g = group(), y = 0.0068, body = anod( 0x1a3a2a, 0.3 );
		add( g, CX( 0.0065, 0.11, 20 ), body, [ - 0.005, y, 0 ] );
		add( g, CX( 0.0068, 0.014, 20 ), knurl( 0x9a9a9a, 12, 0.8 ), [ - 0.065, y, 0 ] );
		add( g, CX( 0.0065, 0.016, 20, 0.0048 ), chrome(), [ 0.058, y, 0 ] );
		add( g, CX( 0.0022, 0.002, 12 ), plastic( 0x050505 ), [ 0.066, y, 0 ] );
		add( g, CX( 0.0072, 0.012, 20 ), body, [ 0.018, y, 0 ] );
		add( g, CY( 0.0028, 0.002, 12 ), rubber( 0xd82a1a ), [ 0.018, y + 0.0078, 0 ] );
		add( g, B( 0.055, 0.0012, 0.004 ), steel(), [ - 0.045, y + 0.0085, 0 ] );
		add( g, B( 0.004, 0.003, 0.004 ), steel(), [ - 0.071, y + 0.0072, 0 ] );
		labelBand( g, print( { bg: 0xf2d01a, fg: 0x1a1a1a, text: 'CLASS 3R LASER', sub: '5 mW · 532 nm', style: 'plain', w: 512, h: 96, size: 0.42 } ), 0.0066, - 0.03, - 0.006, y );
		return ground( g );
	} );

	// a PIR motion sensor: the white housing, the faceted lens, an LED, the ground spike
	reg( 'senses_sensor', () => {
		const g = group(), wht = plastic( 0xeeeeea, 0.45 );
		add( g, RB( 0.095, 0.034, 0.064, 0.012 ), wht, [ 0, 0.017, 0 ] );
		add( g, facet( new THREE.SphereGeometry( 0.022, 10, 5, 0, PI * 2, 0, PI / 2 ) ), M( 0xf6f4ee, { rough: 0.3 } ), [ 0.018, 0.034, 0 ], null, [ 1, 0.75, 1 ] );
		add( g, CY( 0.002, 0.002, 8 ), glow( 0xff2020, 1 ), [ - 0.012, 0.0345, 0.018 ] );
		add( g, B( 0.05, 0.001, 0.03 ), plastic( 0xd8d8d2, 0.6 ), [ - 0.022, 0.0345, - 0.008 ] );
		add( g, CX( 0.007, 0.012, 14 ), plastic( 0x1a1a1a ), [ - 0.052, 0.017, 0 ] );
		add( g, CX( 0.0075, 0.08, 10, 0.0005 ), plastic( 0x1a1a1a, 0.6 ), [ - 0.098, 0.017, 0 ] );
		return ground( g );
	} );

	// an alarm receiver: the speaker grille, four zone lights, the antenna, a belt clip
	reg( 'senses_receiver', () => {
		const g = group(), y = 0.017;
		add( g, RB( 0.095, 0.032, 0.062, 0.012 ), plastic( 0xe8e8e4, 0.45 ), [ 0, y, 0 ] );
		const top = M( 0xffffff, { map: canvasTex( 'senses:rxtop', 256, 160, ( ctx, W, H ) => {
			ctx.fillStyle = '#e8e8e4'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#2a2c2e';
			for ( let r = 10; r < 62; r += 9 ) for ( let a = 0; a < 6.28; a += 9 / r ) { ctx.beginPath(); ctx.arc( 170 + Math.cos( a ) * r, 80 + Math.sin( a ) * r, 2.6, 0, PI * 2 ); ctx.fill(); }
			ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillText( 'ZONE', 48, 34 );
			for ( let i = 0; i < 4; i ++ ) { ctx.fillText( String( i + 1 ), 22 + i * 18, 128 ); }
			ctx.strokeStyle = '#8a8c90'; ctx.lineWidth = 3; ctx.strokeRect( 8, 8, W - 16, H - 16 );
		} ), rough: 0.45 } );
		decal( g, top, 0.08, 0.05, 0, y + 0.0161, 0, 0 );
		for ( let i = 0; i < 4; i ++ ) add( g, CY( 0.0022, 0.002, 10 ), glow( i === 1 ? 0xff3020 : 0x30ff40, i === 1 ? 2 : 0.4 ), [ - 0.0335 + i * 0.0056, y + 0.0165, 0.001 ] );
		add( g, CX( 0.0042, 0.04, 10 ), rubber( 0x1a1a1a ), [ 0.065, y + 0.006, - 0.024 ] );
		add( g, B( 0.05, 0.003, 0.022 ), plastic( 0x2a2a2a, 0.5 ), [ 0, y - 0.0175, 0 ] );
		return ground( g );
	} );

	// a weather radio: the orange body in rubber bumpers, the front with its LCD, grille and buttons, the solar strip, the
	// crank folded on the side and the antenna laid along the top
	reg( 'senses_wxradio', () => {
		const g = group(), H = 0.085, body = M( 0xd8501a, { rough: 0.55 } ), bump = rubber( 0x2a2c2e );
		add( g, RB( 0.15, H, 0.05, 0.01 ), body, [ 0, H / 2, 0 ] );
		for ( const x of [ - 0.07, 0.07 ] ) add( g, RB( 0.018, H + 0.004, 0.056, 0.008 ), bump, [ x, H / 2, 0 ] );
		const front = M( 0xffffff, { map: canvasTex( 'senses:wxfront', 384, 224, ( ctx, W, Hh ) => {
			ctx.fillStyle = '#2a2c2e'; ctx.fillRect( 0, 0, W, Hh );
			ctx.fillStyle = '#121314'; for ( let y = 26; y < Hh - 14; y += 12 ) for ( let x = 18 + ( ( y / 12 ) % 2 ) * 6; x < 170; x += 12 ) { ctx.beginPath(); ctx.arc( x, y, 4, 0, PI * 2 ); ctx.fill(); }
			ctx.fillStyle = '#9fb6a0'; ctx.fillRect( 196, 20, 172, 70 );
			ctx.fillStyle = '#152015'; ctx.font = 'bold 22px Arial'; ctx.fillText( 'WX 1', 206, 46 ); ctx.font = 'bold 30px Arial'; ctx.fillText( '162.400', 206, 80 );
			ctx.fillStyle = '#d82a1a'; ctx.fillRect( 196, 110, 80, 36 ); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px Arial'; ctx.fillText( 'ALERT', 208, 134 );
			ctx.fillStyle = '#4a4c4e'; for ( let i = 0; i < 3; i ++ ) ctx.fillRect( 288 + i * 28, 112, 22, 32 );
			ctx.fillStyle = '#e8e8e2'; ctx.font = 'bold 17px Arial'; ctx.fillText( 'WEATHER ALERT', 196, 186 );
		} ), rough: 0.5 } );
		add( g, new THREE.PlaneGeometry( 0.118, 0.069 ), front, [ 0, H / 2, 0.0253 ] );
		add( g, B( 0.11, 0.002, 0.03 ), M( 0xffffff, { map: canvasTex( 'senses:solar', 128, 64, ( ctx, W, Hh ) => {
			ctx.fillStyle = '#c8ccd2'; ctx.fillRect( 0, 0, W, Hh );
			for ( let i = 0; i < 8; i ++ ) { ctx.fillStyle = '#16244a'; ctx.fillRect( i * 16 + 1, 2, 14, Hh - 4 ); }
		} ), rough: 0.2, metal: 0.4 } ), [ - 0.005, H + 0.001, - 0.004 ] );
		add( g, CX( 0.0035, 0.15, 10 ), chrome(), [ 0.0, H + 0.005, 0.016 ] );
		add( g, new THREE.SphereGeometry( 0.0055, 12, 8 ), chrome(), [ 0.076, H + 0.005, 0.016 ] );
		add( g, RB( 0.008, 0.06, 0.012, 0.003 ), plastic( 0x1a1a1a, 0.5 ), [ 0.083, H / 2, 0.012 ] );
		add( g, CX( 0.006, 0.016, 12 ), plastic( 0x1a1a1a, 0.5 ), [ 0.091, 0.02, 0.012 ] );
		return ground( g );
	} );

	// two CR123A lithium cells
	reg( 'senses_cr123', () => {
		const g = group(), r = 0.0085, L = 0.0345;
		const wrap = M( 0xffffff, { map: canvasTex( 'senses:cr123', 256, 128, ( ctx, W, H ) => {
			ctx.fillStyle = '#121212'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#c8742a'; ctx.fillRect( 0, H * 0.7, W, H * 0.18 );
			ctx.fillStyle = '#f2f2ee'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center';
			for ( const x of [ W * 0.25, W * 0.75 ] ) { ctx.fillText( 'CR123A', x, H * 0.38 ); ctx.font = 'bold 16px Arial'; ctx.fillText( '3V LITHIUM', x, H * 0.6 ); ctx.font = 'bold 30px Arial'; }
		} ), rough: 0.4 } );
		for ( const z of [ - r * 1.02, r * 1.02 ] ) {
			add( g, CX( r, L, 24 ), wrap, [ 0, r, z ], [ z > 0 ? PI : 0, 0, 0 ] );
			add( g, CX( r * 0.98, 0.0008, 24 ), steel(), [ - L / 2 - 0.0004, r, z ] );
			add( g, CX( r * 0.35, 0.0016, 14 ), steel(), [ L / 2 + 0.0008, r, z ] );
			add( g, CX( r * 0.75, 0.0006, 20 ), plastic( 0x1a1a1a ), [ L / 2 + 0.0003, r, z ] );
		}
		return ground( g );
	} );
}

function shadeHex( c, k ) {
	const col = new THREE.Color( c );
	col.multiplyScalar( 1 + k );
	return col.getHex();
}
