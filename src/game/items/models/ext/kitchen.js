// Model builders for the kitchen items (docs/ITEMS_PLAN.md "kitchen"). register( reg ) is called once by
// render/ItemModels.js with registerModelBuilder. Real-world sizes in metres, origin at the centre of the bottom, long
// axis along +x (lib.js conventions). Most of the pantry reuses the food builders (bottles, jars, bags, boxes, cans);
// these are the shapes that are new: produce and the sea, plate-lunch food, the evolved dishes in their pot, wok or
// bowl, mugs and cocktails, cookware, ice. Also the imu's look in the world (ext/kitchen/imu.js reads IMU.look).
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, labelTex, canvasTex, css, facet, gradientTex } from '../lib.js';
import { IMU } from '../../ext/kitchen/imu.js';
import { placedModel } from './placeables.js';
import { compact } from '../../placeables/merge.js';
import { flame, glowSprite } from '../../placeables/fx.js';

// ---- small helpers ------------------------------------------------------------------------------------------------

function rng( seed ) {
	let s = ( seed >>> 0 ) || 7;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; };
}

// a flat shape lying in the xz plane (ShapeGeometry), UVs 0..1 over its bounds, bent by fn( x, z ) -> y
function flatShape( shape, bend = null, seg = 12 ) {
	const geo = new THREE.ShapeGeometry( shape, seg );
	geo.rotateX( - PI / 2 );
	geo.computeBoundingBox();
	const bb = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), z = p.getZ( i );
		uv.setXY( i, ( x - bb.min.x ) / ( bb.max.x - bb.min.x || 1 ), ( z - bb.min.z ) / ( bb.max.z - bb.min.z || 1 ) );
		if ( bend ) p.setY( i, bend( x, z ) );
	}
	geo.computeVertexNormals();
	return geo;
}

// a leaf outline along +x: a lance (ti) or a heart (taro), length L, width W
function leafShape( kind, L, W ) {
	const s = new THREE.Shape();
	if ( kind === 'heart' ) {
		// a taro leaf: two rounded lobes either side of the notch where the stalk joins, a pointed tip
		s.moveTo( L * 0.16, 0 );
		s.quadraticCurveTo( L * 0.04, W * 0.1, - L * 0.03, W * 0.36 );
		s.bezierCurveTo( L * 0.12, W * 0.66, L * 0.55, W * 0.62, L, 0 );
		s.bezierCurveTo( L * 0.55, - W * 0.62, L * 0.12, - W * 0.66, - L * 0.03, - W * 0.36 );
		s.quadraticCurveTo( L * 0.04, - W * 0.1, L * 0.16, 0 );
		return s;
	}
	s.moveTo( 0, 0 );
	s.bezierCurveTo( L * 0.25, W * 0.5, L * 0.7, W * 0.5, L, 0 );
	s.bezierCurveTo( L * 0.7, - W * 0.5, L * 0.25, - W * 0.5, 0, 0 );
	return s;
}

// leaf surfaces: a midrib and veins over a green that shades lighter to the edge
function leafTex( kind, c1, c2, rib ) {
	return canvasTex( `k:leaf:${kind}:${c1}:${c2}`, 128, 128, ( ctx, w, h ) => {
		const g = ctx.createLinearGradient( 0, 0, 0, h );
		g.addColorStop( 0, css( c2 ) ); g.addColorStop( 0.5, css( c1 ) ); g.addColorStop( 1, css( c2 ) );
		ctx.fillStyle = g; ctx.fillRect( 0, 0, w, h );
		ctx.strokeStyle = css( rib ); ctx.lineWidth = 3;
		ctx.beginPath(); ctx.moveTo( 0, h / 2 ); ctx.lineTo( w, h / 2 ); ctx.stroke();
		ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6;
		const n = kind === 'heart' ? 7 : 16;
		for ( let i = 1; i < n; i ++ ) {
			const x = i / n * w;
			for ( const sy of [ - 1, 1 ] ) { ctx.beginPath(); ctx.moveTo( x, h / 2 ); ctx.quadraticCurveTo( x + w * 0.06, h / 2 + sy * h * 0.2, x + w * ( kind === 'heart' ? 0.16 : 0.1 ), h / 2 + sy * h * 0.48 ); ctx.stroke(); }
		}
		ctx.globalAlpha = 1;
	} );
}

// a bumpy lump (a stone, a clod) of radius r and height h
function lump( r, h, seed, seg = 7 ) {
	const geo = G.sph( 1, seg + 1, seg - 1 );
	const R = rng( seed * 7919 + 1 ), p = geo.attributes.position;
	const k = [];
	for ( let i = 0; i < 6; i ++ ) k.push( R() * 6 );
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const f = 1 + Math.sin( x * 3 + k[ 0 ] ) * 0.12 + Math.sin( z * 4 + k[ 1 ] ) * 0.1 + Math.sin( y * 5 + k[ 2 ] ) * 0.08;
		p.setXYZ( i, x * r * f, Math.max( 0, y ) * h * f, z * r * f );
	}
	return facet( geo );
}

// food chunks scattered on a surface: n little boxes of the given colours inside radius r at height y
function chunks( g, n, r, y, colors, size = 0.016, seed = 1, rough = 0.6 ) {
	const R = rng( seed );
	const mats = colors.map( c => M( c, { rough } ) );
	for ( let i = 0; i < n; i ++ ) {
		const a = R() * PI * 2, d = Math.sqrt( R() ) * r, s = size * ( 0.7 + R() * 0.6 );
		add( g, G.box( s, s * 0.8, s ), mats[ i % mats.length ], [ Math.cos( a ) * d, y - s * 0.3, Math.sin( a ) * d ], [ R() * 0.6, R() * PI, R() * 0.6 ] );
	}
}

// a plain disc (a liquid surface, a filling) lying flat at height y
const disc = ( r, seg = 24 ) => new THREE.CircleGeometry( r, seg ).rotateX( - PI / 2 );

// rice: white with a grain
const riceTex = () => canvasTex( 'k:rice', 128, 128, ( ctx, w, h ) => {
	ctx.fillStyle = '#efeae0'; ctx.fillRect( 0, 0, w, h );
	const R = rng( 5 );
	for ( let i = 0; i < 520; i ++ ) { ctx.fillStyle = R() < 0.5 ? '#ffffff' : '#d8d2c4'; ctx.save(); ctx.translate( R() * w, R() * h ); ctx.rotate( R() * PI ); ctx.fillRect( - 3, - 1.2, 6, 2.4 ); ctx.restore(); }
}, { repeat: true } );
// fried rice: browned grains with bits of egg, green onion and Spam
const friedTex = () => canvasTex( 'k:fried', 128, 128, ( ctx, w, h ) => {
	ctx.fillStyle = '#b8864a'; ctx.fillRect( 0, 0, w, h );
	const R = rng( 9 );
	for ( let i = 0; i < 520; i ++ ) { ctx.fillStyle = [ '#c99a5a', '#a87238', '#d8b07a' ][ i % 3 ]; ctx.save(); ctx.translate( R() * w, R() * h ); ctx.rotate( R() * PI ); ctx.fillRect( - 3, - 1.2, 6, 2.4 ); ctx.restore(); }
	for ( let i = 0; i < 40; i ++ ) { ctx.fillStyle = [ '#f2c63a', '#4a9a3a', '#d06a5a' ][ i % 3 ]; ctx.fillRect( R() * w, R() * h, 5 + R() * 4, 4 + R() * 3 ); }
}, { repeat: true } );
// stew: a thick brown with darker swirls
const stewTex = ( raw ) => canvasTex( 'k:stew' + ( raw ? 'r' : '' ), 128, 128, ( ctx, w, h ) => {
	ctx.fillStyle = raw ? '#9ab0b0' : '#6a3a1a'; ctx.fillRect( 0, 0, w, h );
	const R = rng( raw ? 4 : 3 );
	for ( let i = 0; i < 60; i ++ ) {
		ctx.strokeStyle = raw ? 'rgba(220,235,235,0.35)' : ( R() < 0.5 ? 'rgba(40,18,6,0.5)' : 'rgba(200,120,60,0.35)' );
		ctx.lineWidth = 2 + R() * 3; ctx.beginPath(); const x = R() * w, y = R() * h; ctx.arc( x, y, 4 + R() * 14, R() * 6, R() * 6 + 2 ); ctx.stroke();
	}
}, { repeat: true } );
// shredded pork
const shredTex = () => canvasTex( 'k:shred', 128, 128, ( ctx, w, h ) => {
	ctx.fillStyle = '#9a6a4a'; ctx.fillRect( 0, 0, w, h );
	const R = rng( 11 );
	for ( let i = 0; i < 260; i ++ ) {
		ctx.strokeStyle = [ '#c49070', '#7a4a2e', '#dcae8e', '#5a321e' ][ i % 4 ]; ctx.lineWidth = 1.5 + R() * 2;
		const x = R() * w, y = R() * h, a = R() * PI, l = 8 + R() * 18;
		ctx.beginPath(); ctx.moveTo( x, y ); ctx.quadraticCurveTo( x + Math.cos( a ) * l * 0.5 + 3, y + Math.sin( a ) * l * 0.5, x + Math.cos( a ) * l, y + Math.sin( a ) * l ); ctx.stroke();
	}
}, { repeat: true } );
// a speckled enamel mug
const enamelTex = ( c ) => canvasTex( 'k:enamel:' + c, 512, 256, ( ctx, w, h ) => {
	ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, w, h );
	const R = rng( 21 );
	for ( let i = 0; i < 2600; i ++ ) { ctx.fillStyle = R() < 0.75 ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.3)'; ctx.fillRect( R() * w, R() * h, 1.2, 1.2 ); }
}, { repeat: true } );

// a printed sticker / label on a flat face
const sticker = ( spec ) => M( 0xffffff, { map: labelTex( spec ), rough: 0.6 } );

// a clear plastic tub with a lid (deli counter)
function deliTub( g, r = 0.055, h = 0.05 ) {
	add( g, G.cyl( r, r * 0.88, h, 22, true ), MAT.glass( 0xf2f6f8, 0.28 ) );
	add( g, disc( r * 0.88 ), MAT.glass( 0xf2f6f8, 0.3 ), [ 0, 0.002, 0 ] );
	add( g, G.cyl( r * 1.04, r * 1.04, 0.006, 22 ), MAT.glass( 0xf2f6f8, 0.32 ), [ 0, h, 0 ] );
}

// a ceramic bowl: white with a blue rim line (a rice bowl)
function bowlShape( g, r = 0.068, h = 0.058, color = 0xf4f2ec, rim = 0x2a5aa8 ) {
	const outer = [ [ 0, 0 ], [ r * 0.45, 0 ], [ r * 0.46, 0.008 ], [ r * 0.7, 0.012 ], [ r * 0.92, h * 0.55 ], [ r, h ], [ r * 0.95, h ], [ r * 0.86, h * 0.55 ], [ r * 0.6, 0.016 ], [ 0, 0.016 ] ];
	add( g, G.lathe( outer, 24 ), M( color, { rough: 0.25 } ) );
	add( g, G.torus( r * 0.985, 0.0022, 4, 28 ), M( rim, { rough: 0.3 } ), [ 0, h * 0.94, 0 ], [ PI / 2, 0, 0 ] );
	return h;
}

// the wok's shape: a shallow round steel bowl, a long wooden handle and a loop on the far side
function wokShape( g, R = 0.17 ) {
	const steel = M( 0x2c2a28, { rough: 0.45, metal: 0.7 } );
	const prof = [];
	for ( let i = 0; i <= 10; i ++ ) { const t = i / 10, a = t * PI * 0.42; prof.push( [ Math.sin( a ) * R * 1.12, ( 1 - Math.cos( a ) ) * R * 0.9 ] ); }
	const inner = prof.slice().reverse().map( ( [ x, y ] ) => [ x * 0.97, y + 0.003 ] );
	add( g, G.lathe( prof.concat( inner ), 28 ), steel );
	const top = prof[ prof.length - 1 ][ 1 ];
	add( g, G.torus( R * 1.12 * Math.sin( PI * 0.42 ) / Math.sin( PI * 0.42 ) * 0.995, 0.004, 5, 32 ), steel, [ 0, top, 0 ], [ PI / 2, 0, 0 ] );
	// the handle: a steel stub, then wood
	add( g, G.cylX( 0.008, 0.06, 8 ), steel, [ R * 1.1 + 0.02, top - 0.01, 0 ], [ 0, 0, 0.2 ] );
	add( g, G.cylX( 0.016, 0.18, 10, 0.014 ), M( 0x6a4226, { rough: 0.6 } ), [ R * 1.1 + 0.14, top + 0.01, 0 ], [ 0, 0, 0.2 ] );
	add( g, G.torus( 0.03, 0.005, 5, 12, PI ), steel, [ - R * 1.1 - 0.012, top - 0.005, 0 ], [ PI / 2, 0, PI / 2 ] );
	return top;
}

// the cooking pot (the gear builder's dimensions, so a pot of stew is the pot you put down)
function potShape( g, r = 0.1, h = 0.11 ) {
	const m = M( 0xa8acb2, { rough: 0.35, metal: 0.9 } );
	add( g, G.lathe( [ [ 0, 0 ], [ r * 0.97, 0 ], [ r, h * 0.05 ], [ r, h ], [ r * 0.96, h ], [ r * 0.96, h * 0.06 ], [ 0, h * 0.06 ] ], 22 ), m );
	add( g, G.cylX( 0.012, 0.13, 8 ), MAT.blackPlastic(), [ r + 0.06, h * 0.8, 0 ] );
	return h;
}

// a cocktail umbrella: a paper cone on a stick
function umbrella( g, x, y, z, color, tilt = 0.5 ) {
	const u = group();
	add( u, G.cyl( 0.0012, 0.0012, 0.1, 4 ), M( 0xd8c8a0 ), [ 0, 0, 0 ] );
	add( u, G.cone( 0.035, 0.018, 10 ), M( color, { rough: 0.7, side: THREE.DoubleSide } ), [ 0, 0.085, 0 ] );
	u.position.set( x, y, z ); u.rotation.z = tilt;
	g.add( u );
}

// a pineapple wedge on a rim
function pineWedge( g, x, y, z, ry = 0 ) {
	const w = group();
	const shape = new THREE.Shape(); shape.moveTo( 0, 0 ); shape.lineTo( 0.05, 0 ); shape.lineTo( 0, 0.03 ); shape.closePath();
	const geo = new THREE.ExtrudeGeometry( shape, { depth: 0.012, bevelEnabled: false } );
	add( w, geo, M( 0xf2d04a, { rough: 0.5 } ), [ 0, 0, - 0.006 ] );
	add( w, G.box( 0.05, 0.004, 0.013 ), M( 0x8a6a2a, { rough: 0.8 } ), [ 0.025, - 0.002, 0 ] );
	w.position.set( x, y, z ); w.rotation.set( 0, ry, - 0.4 );
	g.add( w );
}

// ======================================================================================================================

export function register( reg ) {
	// ---- produce and the sea: { kind } ----
	reg( 'kitchen_produce', ( s ) => {
		const g = group(), k = s.kind;
		switch ( k ) {
			case 'luau': {
				// a bundle of three taro leaves, broad and arrow-shaped, laid on each other, their cut stalks tied (full
				// size and a fresh mid-green: smaller and darker, they vanished on asphalt)
				const L = 0.4, W = 0.34;
				const mat = M( 0xffffff, { map: leafTex( 'heart', 0x4a9a3a, 0x62ae4c, 0xb8e08e ), rough: 0.65, side: THREE.DoubleSide } );
				for ( let i = 0; i < 3; i ++ ) {
					const geo = flatShape( leafShape( 'heart', L, W ), ( x, z ) => 0.004 + i * 0.007 + Math.abs( z ) * 0.18 + Math.sin( x / L * PI ) * 0.012, 16 );
					add( g, geo, mat, [ - L / 2 + i * 0.015, 0, ( i - 1 ) * 0.02 ], [ 0, ( i - 1 ) * 0.22, 0 ] );
				}
				const stalk = M( 0x7a5a6a, { rough: 0.5 } );
				for ( let i = 0; i < 3; i ++ ) add( g, G.cylX( 0.006, 0.14, 7 ), stalk, [ - L / 2 - 0.02 + i * 0.01, 0.014 + i * 0.006, ( i - 1 ) * 0.008 ], [ 0, ( i - 1 ) * 0.12, 0 ] );
				add( g, G.cylX( 0.015, 0.014, 8 ), M( 0xd8c8a0, { rough: 0.9 } ), [ - L / 2 - 0.05, 0.016, 0 ] );
				return ground( g );
			}
			case 'ti': {
				// a bundle of long glossy ti leaves lying side by side (not fanned out), the stems bound with raffia
				const L = 0.5, W = 0.115, n = 6;
				const mat = M( 0xffffff, { map: leafTex( 'lance', 0x3a9a3a, 0x5ab84a, 0xb8e890 ), rough: 0.35, side: THREE.DoubleSide } );
				for ( let i = 0; i < n; i ++ ) {
					const k = i - ( n - 1 ) / 2;
					const geo = flatShape( leafShape( 'lance', L - Math.abs( k ) * 0.02, W ), ( x, z ) => 0.004 + i * 0.004 + Math.abs( z ) * 0.22 + Math.sin( x / L * PI ) * 0.01, 14 );
					add( g, geo, mat, [ - L / 2 + Math.abs( k ) * 0.012, 0, k * 0.01 ], [ 0, k * 0.075, 0 ] );
				}
				// the stems, gathered and tied
				const stem = M( 0x6a8a3a, { rough: 0.5 } );
				for ( let i = 0; i < n; i ++ ) add( g, G.cylX( 0.0035, 0.09, 6 ), stem, [ - L / 2 - 0.04, 0.008 + ( i % 3 ) * 0.004, ( i - ( n - 1 ) / 2 ) * 0.005 ] );
				add( g, G.cylX( 0.016, 0.012, 8 ), M( 0xc8b088, { rough: 0.9 } ), [ - L / 2 - 0.03, 0.012, 0 ], null, [ 1, 0.8, 1.6 ] );
				return ground( g );
			}
			case 'ginger': {
				// a hand of ginger: a fat rhizome with knobbly fingers off it, ringed tan skin, pink growing tips
				const skin = M( 0xffffff, { map: canvasTex( 'k:ginger', 128, 64, ( ctx, w, h ) => {
					ctx.fillStyle = '#b8874c'; ctx.fillRect( 0, 0, w, h );
					const R = rng( 17 );
					for ( let i = 0; i < 300; i ++ ) { ctx.fillStyle = R() < 0.5 ? 'rgba(110,70,30,0.4)' : 'rgba(230,200,150,0.35)'; ctx.fillRect( R() * w, R() * h, 2, 1 ); }
					ctx.strokeStyle = 'rgba(90,55,25,0.7)'; ctx.lineWidth = 2;
					for ( let i = 0; i < 9; i ++ ) { const x = ( i + 0.5 ) / 9 * w + ( R() - 0.5 ) * 4; ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.quadraticCurveTo( x + 4, h / 2, x - 2, h ); ctx.stroke(); }
				}, { repeat: true } ), rough: 0.85 } );
				const tip = M( 0xd8c08a, { rough: 0.7 } );
				add( g, G.capsX( 0.018, 0.12, 10 ), skin, [ 0, 0.016, 0 ], [ 0, 0.1, 0 ], [ 1, 0.85, 1.1 ] );
				const fingers = [ [ 0.035, 0.012, - 0.7, 0.055, 0.014 ], [ - 0.01, 0.01, 0.8, 0.05, 0.013 ], [ - 0.045, - 0.008, - 0.9, 0.045, 0.012 ], [ 0.055, 0.004, 0.5, 0.04, 0.011 ] ];
				for ( const [ x, z, ry, l, r ] of fingers ) {
					const fx = x + Math.cos( - ry ) * l * 0.45, fz = z + Math.sin( - ry ) * l * 0.45;
					add( g, G.capsX( r, l, 9 ), skin, [ fx, 0.016, fz ], [ 0, ry, 0.12 ], [ 1, 0.85, 1 ] );
					// a knob where it was broken off the plant, pale and fibrous
					add( g, G.sph( r * 1.15, 8, 6 ), skin, [ x + Math.cos( - ry ) * l * 0.85, 0.017, z + Math.sin( - ry ) * l * 0.85 ], null, [ 1, 0.9, 1 ] );
					add( g, disc( r * 0.7 ).rotateZ( PI / 2 ), tip, [ x + Math.cos( - ry ) * ( l * 0.85 + r * 1.12 ), 0.018, z + Math.sin( - ry ) * ( l * 0.85 + r * 1.12 ) ], [ 0, ry, 0 ] );
				}
				return ground( g );
			}
			case 'garlic': {
				// a bulb: lobed papery cloves round a neck, a tuft of roots underneath
				const geo = G.lathe( [ [ 0, 0.004 ], [ 0.012, 0 ], [ 0.026, 0.012 ], [ 0.03, 0.026 ], [ 0.024, 0.042 ], [ 0.01, 0.054 ], [ 0.004, 0.07 ], [ 0, 0.072 ] ], 16 );
				const p = geo.attributes.position;
				for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), z = p.getZ( i ), a = Math.atan2( z, x ), f = 1 + Math.abs( Math.sin( a * 4 ) ) * 0.08; p.setXYZ( i, x * f, p.getY( i ), z * f ); }
				geo.computeVertexNormals();
				add( g, geo, M( 0xffffff, { map: gradientTex( [ [ 0, 0xd8c8c8 ], [ 0.4, 0xf2ece4 ], [ 1, 0xe8dcd0 ] ], 60, '#a07a8a', 23 ), rough: 0.8 } ) );
				for ( let i = 0; i < 7; i ++ ) add( g, G.cyl( 0.0008, 0.0008, 0.008, 3 ), M( 0xc8b89a ), [ Math.cos( i ) * 0.004, - 0.004, Math.sin( i * 2 ) * 0.004 ], [ Math.sin( i ) * 0.6, 0, Math.cos( i ) * 0.6 ] );
				// a second bulb beside it
				const g2 = group(); add( g2, geo, M( 0xffffff, { map: gradientTex( [ [ 0, 0xd8c8c8 ], [ 0.4, 0xf2ece4 ], [ 1, 0xe8dcd0 ] ], 60, '#a07a8a', 23 ), rough: 0.8 } ) );
				g2.position.set( 0.05, 0, 0.01 ); g2.rotation.set( 0, 0, - 1.2 ); g2.scale.setScalar( 0.9 ); g.add( g2 );
				return ground( g );
			}
			case 'green_onion': {
				// a bunch: white bulbs and roots at one end, hollow green tops, a rubber band
				const green = M( 0x3f9a3a, { rough: 0.45 } ), white = M( 0xf2f0e2, { rough: 0.5 } );
				for ( let i = 0; i < 8; i ++ ) {
					const z = ( i - 3.5 ) * 0.009, y = 0.007 + ( i % 2 ) * 0.007;
					add( g, G.cylX( 0.0065, 0.06, 8 ), white, [ - 0.12, y, z ] );
					add( g, G.cylX( 0.0058, 0.2, 8, 0.0035 ), green, [ - 0.0, y, z * 1.5 ], [ 0, ( i - 3.5 ) * 0.03, 0 ] );
				}
				for ( let i = 0; i < 9; i ++ ) add( g, G.cylX( 0.0007, 0.02, 3 ), M( 0xd8ccb0 ), [ - 0.16, 0.008, ( i - 4 ) * 0.004 ], [ 0, ( i - 4 ) * 0.15, 0 ] );
				add( g, G.cylX( 0.017, 0.008, 10 ), M( 0x2a5ad8, { rough: 0.5 } ), [ - 0.1, 0.009, 0 ], null, [ 1, 0.7, 1.4 ] );
				return ground( g );
			}
			case 'chili': {
				// a handful of small red Hawaiian chilies with green caps
				const red = M( 0xd8201a, { rough: 0.25 } ), cap = M( 0x3a7a2a, { rough: 0.5 } );
				const R = rng( 31 );
				for ( let i = 0; i < 7; i ++ ) {
					const x = ( R() - 0.5 ) * 0.06, z = ( R() - 0.5 ) * 0.05, ry = R() * PI * 2, y = i > 4 ? 0.008 : 0.004;
					const c = group();
					add( c, G.lathe( [ [ 0, 0 ], [ 0.0035, 0.004 ], [ 0.004, 0.014 ], [ 0.0028, 0.026 ], [ 0, 0.032 ] ], 8 ).rotateZ( - PI / 2 ), red );
					add( c, G.cylX( 0.003, 0.006, 6 ), cap, [ - 0.002, 0, 0 ] );
					add( c, G.cylX( 0.0008, 0.012, 4 ), cap, [ - 0.01, 0.001, 0 ], [ 0, 0, 0.3 ] );
					c.position.set( x, y, z ); c.rotation.set( 0, ry, 0 );
					g.add( c );
				}
				return ground( g );
			}
			case 'limu': {
				// seaweed in a clear produce bag: branching wet strands, brown-red and green
				const R = rng( 41 );
				const cols = [ M( 0x6a3a2a, { rough: 0.25 } ), M( 0x4a6a2a, { rough: 0.25 } ), M( 0x8a4a3a, { rough: 0.25 } ) ];
				for ( let i = 0; i < 30; i ++ ) {
					const pts = [];
					let x = ( R() - 0.5 ) * 0.07, z = ( R() - 0.5 ) * 0.06, y = 0.006 + R() * 0.025;
					for ( let k = 0; k < 4; k ++ ) { pts.push( [ x, y, z ] ); x += ( R() - 0.5 ) * 0.05; z += ( R() - 0.5 ) * 0.05; y = Math.max( 0.005, y + ( R() - 0.5 ) * 0.014 ); }
					add( g, G.tube( pts, 0.004 + R() * 0.002, 8, 5 ), cols[ i % 3 ] );
				}
				// the produce bag round it, gathered and tied at one end
				add( g, G.rbox( 0.15, 0.05, 0.12, 0.022, 3 ), MAT.glass( 0xf2f8f6, 0.2 ), [ 0, 0, 0 ] );
				add( g, G.cylX( 0.012, 0.03, 8 ), MAT.glass( 0xf2f8f6, 0.32 ), [ - 0.09, 0.022, 0 ] );
				add( g, G.box( 0.004, 0.026, 0.006 ), M( 0xd8402a ), [ - 0.083, 0.022, 0 ] );
				return ground( g );
			}
			case 'opihi': {
				// limpets in a clear deli tub (ribbed low cones, one turned over to show the meat), one loose beside it
				const shell = M( 0xffffff, { map: canvasTex( 'k:opihi', 64, 64, ( ctx, w, h ) => {
					ctx.fillStyle = '#4a4238'; ctx.fillRect( 0, 0, w, h );
					for ( let i = 0; i < 14; i ++ ) { ctx.strokeStyle = i % 2 ? '#7a705c' : '#2a2620'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo( i / 14 * w, 0 ); ctx.lineTo( i / 14 * w, h ); ctx.stroke(); }
				}, { repeat: true } ), rough: 0.8 } );
				const meat = M( 0xe8b030, { rough: 0.35 } );
				const R = rng( 51 );
				const cone = ( x, y, z, r, up ) => {
					if ( up ) add( g, G.cone( r, 0.012, 14 ), shell, [ x, y, z ], [ 0, R() * PI, 0 ], [ 1, 1, 0.82 ] );
					else { add( g, G.cone( r, 0.012, 14 ).rotateX( PI ).translate( 0, 0.012, 0 ), shell, [ x, y, z ], null, [ 1, 1, 0.82 ] ); add( g, disc( r * 0.75 ), meat, [ x, y + 0.0125, z ], null, [ 1, 1, 0.8 ] ); }
				};
				deliTub( g, 0.055, 0.04 );
				for ( let i = 0; i < 7; i ++ ) { const a = i / 7 * PI * 2 + R(), d = i ? 0.028 : 0; cone( Math.cos( a ) * d, 0.003 + ( i % 2 ) * 0.008, Math.sin( a ) * d, 0.017 + R() * 0.004, i !== 3 ); }
				cone( 0.085, 0, 0.02, 0.02, true );
				return ground( g );
			}
			case 'cabbage': {
				// a head: overlapping leaf caps over a pale core, a cut stalk underneath
				const pale = M( 0xffffff, { map: leafTex( 'heart', 0xa8d080, 0xc8e4a0, 0xe8f4d0 ), rough: 0.55 } );
				add( g, G.sph( 0.075, 18, 14 ), M( 0xc8e0a0, { rough: 0.6 } ), [ 0, 0.07, 0 ], null, [ 1, 0.92, 1 ] );
				for ( let i = 0; i < 6; i ++ ) {
					const a = i / 6 * PI * 2;
					add( g, G.sph( 0.082, 14, 8, a - 0.9, 1.9, 0.5, 1.6 ), pale, [ 0, 0.07, 0 ], [ 0, 0, 0 ], [ 1.02 + ( i % 2 ) * 0.03, 0.96, 1.02 + ( i % 2 ) * 0.03 ] );
				}
				add( g, G.cyl( 0.016, 0.018, 0.012, 10 ), M( 0xe8e4c0 ), [ 0, - 0.002, 0 ] );
				return ground( g );
			}
		}
		return g;
	} );

	// ---- crab: { cooked } — a wide carapace, four pairs of jointed legs splayed to the sides, two fat claws in front ----
	reg( 'kitchen_crab', ( s ) => {
		const g = group(), ck = !! s.cooked;
		const top = M( 0xffffff, { map: gradientTex( ck ? [ [ 0, 0xd8401e ], [ 0.6, 0xe86a34 ], [ 1, 0xf09a5a ] ] : [ [ 0, 0x4a3a2a ], [ 0.6, 0x6a5038 ], [ 1, 0x8a6a48 ] ], 160, ck ? '#a82a10' : '#2a2018', ck ? 61 : 63 ), rough: 0.4 } );
		const leg = M( ck ? 0xe0582a : 0x5a4632, { rough: 0.45 } ), under = M( ck ? 0xf6dcb0 : 0xd8ccb0, { rough: 0.6 } );
		const tipM = M( ck ? 0x3a1a0a : 0x1a1410, { rough: 0.3 } );
		const Y = 0.034;
		// the shell: a broad flattened dome, wider than long, over a pale belly
		add( g, G.sph( 1, 22, 12, 0, PI * 2, 0, PI / 2 ), top, [ 0, Y - 0.004, 0 ], null, [ 0.062, 0.03, 0.088 ] );
		add( g, G.sph( 1, 18, 6, 0, PI * 2, PI / 2, PI / 2 ), under, [ 0, Y - 0.004, 0 ], null, [ 0.058, 0.014, 0.082 ] );
		// little spines along the front edge, eyes on stalks
		for ( let i = - 3; i <= 3; i ++ ) { const a = i * 0.22; add( g, G.cone( 0.004, 0.012, 5 ), leg, [ Math.cos( a ) * 0.06, Y - 0.002, Math.sin( a ) * 0.086 ], [ 0, 0, - PI / 2 ] ); }
		for ( const z of [ - 0.014, 0.014 ] ) { add( g, G.cylX( 0.002, 0.012, 5 ), leg, [ 0.062, Y + 0.004, z ] ); add( g, G.sph( 0.0035, 6, 4 ), tipM, [ 0.068, Y + 0.006, z ] ); }
		for ( const sz of [ - 1, 1 ] ) {
			// walking legs: out and up to the knee, then down to a pointed foot, each pair further back
			for ( let i = 0; i < 4; i ++ ) {
				const ax = 0.028 - i * 0.022, az = sz * 0.07;
				const kx = ax - 0.006 - i * 0.012, kz = sz * ( 0.125 - i * 0.004 ), fx = kx - 0.012 - i * 0.008, fz = sz * ( 0.165 - i * 0.006 );
				add( g, G.tube( [ [ ax, Y, az ], [ ( ax + kx ) / 2, Y + 0.016, ( az + kz ) / 2 ], [ kx, Y + 0.024, kz ] ], 0.0055, 6, 5 ), leg );
				add( g, G.tube( [ [ kx, Y + 0.024, kz ], [ ( kx + fx ) / 2, Y + 0.012, ( kz + fz ) / 2 ], [ fx, 0.003, fz ] ], 0.0038, 6, 5 ), leg );
				add( g, G.sph( 0.003, 5, 4 ), tipM, [ fx, 0.003, fz ] );
			}
			// the claw arm reaching forward, then a fat claw turned in, with its two fingers
			add( g, G.tube( [ [ 0.045, Y, sz * 0.05 ], [ 0.075, Y + 0.012, sz * 0.085 ], [ 0.1, Y + 0.008, sz * 0.08 ] ], 0.008, 7, 6 ), leg );
			const claw = group();
			add( claw, G.sph( 1, 12, 8 ), leg, [ 0, 0, 0 ], null, [ 0.03, 0.017, 0.02 ] );
			add( claw, G.cone( 0.007, 0.03, 6 ), tipM, [ 0.026, 0.004, 0 ], [ 0, 0, - PI / 2 - 0.12 ] );
			add( claw, G.cone( 0.006, 0.026, 6 ), tipM, [ 0.024, - 0.006, sz * 0.004 ], [ 0, 0, - PI / 2 + 0.25 ] );
			claw.position.set( 0.125, Y + 0.004, sz * 0.068 ); claw.rotation.y = sz * 0.55;
			g.add( claw );
		}
		return ground( g );
	} );

	// ---- Portuguese sausage: two links in a vacuum pack ----
	reg( 'kitchen_sausage', () => {
		const g = group();
		const skin = M( 0xffffff, { map: canvasTex( 'k:sausage', 64, 64, ( ctx, w, h ) => {
			ctx.fillStyle = '#7a1e12'; ctx.fillRect( 0, 0, w, h );
			const R = rng( 61 );
			for ( let i = 0; i < 90; i ++ ) { ctx.fillStyle = R() < 0.6 ? 'rgba(240,200,170,0.55)' : 'rgba(40,10,5,0.5)'; ctx.fillRect( R() * w, R() * h, 2 + R() * 2, 2 ); }
		}, { repeat: true } ), rough: 0.35 } );
		for ( const z of [ - 0.021, 0.021 ] ) {
			add( g, G.capsX( 0.019, 0.24, 14 ), skin, [ 0, 0.019, z ] );
			add( g, G.cylX( 0.006, 0.012, 6 ), M( 0xd8c8a0 ), [ 0.125, 0.019, z ] );
		}
		add( g, G.rbox( 0.27, 0.042, 0.095, 0.012 ), MAT.glass( 0xf2f6f8, 0.08 ) );
		add( g, G.box( 0.07, 0.001, 0.05 ), sticker( { bg: 0xf2d21a, fg: 0xc0282a, text: 'PORTUGUESE', sub: 'Hot · Smoked', style: 'plain', size: 0.26 } ), [ 0.04, 0.0425, 0 ] );
		return g;
	} );

	// ---- a sliced loaf in its bag, a twist tie at the end ----
	reg( 'kitchen_loaf', () => {
		const g = group();
		const crust = M( 0xffffff, { map: gradientTex( [ [ 0, 0x8a4a1a ], [ 0.4, 0xc07a34 ], [ 1, 0xd8a868 ] ], 40, '#6a3a12', 71 ), rough: 0.7 } );
		const crumb = M( 0xf2e8d0, { rough: 0.9 } );
		const L = 0.24, H = 0.1, D = 0.11;
		add( g, G.rbox( L, H * 0.7, D, 0.012 ), crust );
		add( g, G.cylX( D / 2, L, 18 ), crust, [ 0, H * 0.7, 0 ], null, [ 1, 0.6, 1 ] );
		// slice lines on the near end and a cut face
		add( g, G.box( 0.002, H * 0.85, D * 0.9 ), crumb, [ L / 2 + 0.001, H * 0.43, 0 ] );
		for ( let i = 1; i < 12; i ++ ) add( g, G.box( 0.0012, 0.004, D * 1.005 ), M( 0x6a3a14 ), [ - L / 2 + i * L / 12, H * 0.96, 0 ] );
		// the bag: clear plastic with a printed band, gathered at the end
		add( g, G.rbox( L + 0.03, H * 1.08, D + 0.012, 0.03 ), MAT.glass( 0xf6f8fa, 0.16 ) );
		const band = M( 0xffffff, { map: labelTex( { bg: 0xf2f2ee, fg: 0xd02a2a, text: 'ISLANDER', sub: 'Enriched white bread', band: 0x2a5ab8, style: 'band', glyph: 'sun', glyphColor: 0xf2c21a, size: 0.3 } ), rough: 0.5 } );
		add( g, G.cyl( 0.06, 0.06, 0.07, 20, true ).rotateZ( PI / 2 ), band, [ - 0.01, H * 0.55, 0 ], null, [ 1, 0.95, 1.02 ] );
		add( g, G.cylX( 0.012, 0.03, 8 ), MAT.glass( 0xf6f8fa, 0.3 ), [ - L / 2 - 0.03, H * 0.6, 0 ] );
		add( g, G.box( 0.004, 0.03, 0.006 ), M( 0x2a8a3a ), [ - L / 2 - 0.022, H * 0.6, 0 ] );
		return ground( g, false );
	} );

	// ---- plate-lunch food: { kind, cooked, color } ----
	reg( 'kitchen_food', ( s ) => {
		const g = group();
		switch ( s.kind ) {
			case 'kalua': {
				// shredded smoky pork heaped in a foil tray
				const foil = M( 0xc8ccd2, { rough: 0.35, metal: 0.85 } );
				add( g, G.lathe( [ [ 0, 0 ], [ 0.07, 0 ], [ 0.085, 0.035 ], [ 0.08, 0.035 ], [ 0.066, 0.004 ], [ 0, 0.004 ] ], 4 ).rotateY( PI / 4 ), foil, null, null, [ 1.3, 1, 1 ] );
				add( g, lump( 0.085, 0.05, 3, 9 ), M( 0xffffff, { map: shredTex(), rough: 0.75 } ), [ 0, 0.012, 0 ], null, [ 1.15, 1, 0.8 ] );
				add( g, flatShape( leafShape( 'lance', 0.16, 0.06 ), ( x, z ) => Math.abs( z ) * 0.3 ), M( 0xffffff, { map: leafTex( 'lance', 0x2a7a32, 0x4a9a3a, 0x9ad07a ), side: THREE.DoubleSide, rough: 0.4 } ), [ - 0.1, 0.04, 0.02 ], [ 0, 0.4, 0.15 ] );
				return ground( g, false );
			}
			case 'laulau': {
				// a flat parcel wrapped in ti leaves, one leaf folded across it, the stems twisted together and tied off at
				// one end with the leaf tips fanning out
				const ck = !! s.cooked;
				const leaf = M( 0xffffff, { map: leafTex( 'lance', ck ? 0x4a5222 : 0x2a7a32, ck ? 0x5a5a2a : 0x4a9a3a, ck ? 0x7a7a3a : 0x9ad07a ), side: THREE.DoubleSide, rough: ck ? 0.75 : 0.35 } );
				const leaf2 = M( 0xffffff, { map: leafTex( 'lance', ck ? 0x3e4a1e : 0x22682a, ck ? 0x4e5426 : 0x3a8a32, ck ? 0x6e7034 : 0x8ac06a ), side: THREE.DoubleSide, rough: ck ? 0.75 : 0.35 } );
				add( g, G.rbox( 0.11, 0.045, 0.085, 0.02, 3 ), leaf );
				add( g, G.rbox( 0.04, 0.047, 0.088, 0.014, 2 ), leaf2, [ - 0.012, - 0.001, 0 ] );
				// the twisted stems and the tie
				const stem = M( ck ? 0x6a6a3a : 0x5a8a3a, { rough: 0.7 } );
				add( g, G.cylX( 0.008, 0.022, 7, 0.011 ), stem, [ 0.064, 0.024, 0 ] );
				const tail = flatShape( leafShape( 'lance', 0.1, 0.042 ), ( x, z ) => Math.abs( z ) * 0.3 + Math.sin( x / 0.1 * PI ) * 0.006 );
				for ( const [ ry, rz ] of [ [ 0.75, 0.15 ], [ - 0.7, 0.2 ], [ 0.15, 0.35 ], [ - 0.25, 0.1 ] ] ) add( g, tail, leaf, [ 0.072, 0.024, 0 ], [ 0, ry, rz ] );
				return ground( g );
			}
			case 'lomi': {
				// a deli tub of diced salmon, tomato and onion
				deliTub( g, 0.055, 0.05 );
				add( g, disc( 0.05 ), M( 0xe8604a, { rough: 0.4 } ), [ 0, 0.03, 0 ] );
				chunks( g, 26, 0.042, 0.036, [ 0xf0805a, 0xd8301a, 0xf2eee0, 0xe8704a, 0x4a9a3a ], 0.013, 7, 0.35 );
				return g;
			}
			case 'squares': {
				// squares cut in a foil pan: haupia white, kulolo sticky brown
				const c = s.color ?? 0xf6f3ea;
				add( g, G.box( 0.17, 0.012, 0.13 ), M( 0xc8ccd2, { rough: 0.35, metal: 0.85 } ) );
				for ( let i = 0; i < 6; i ++ ) add( g, G.rbox( 0.05, 0.026, 0.055, 0.003, 1 ), M( c, { rough: s.sheen ? 0.3 : 0.6 } ), [ - 0.054 + ( i % 3 ) * 0.054, 0.011, - 0.029 + Math.floor( i / 3 ) * 0.058 ] );
				return g;
			}
			case 'pie': {
				// a pie in its tin: a crust rim, a dark chocolate layer under white haupia, one slice gone
				const tin = M( 0xc8ccd2, { rough: 0.35, metal: 0.85 } ), crust = M( 0xc89050, { rough: 0.8 } );
				const R = 0.11, cut = PI / 3;
				add( g, G.lathe( [ [ 0, 0 ], [ R * 0.86, 0 ], [ R, 0.035 ], [ R * 1.02, 0.036 ], [ R * 0.88, 0.003 ], [ 0, 0.003 ] ], 28, cut, PI * 2 - cut ), tin );
				add( g, new THREE.CylinderGeometry( R * 0.94, R * 0.86, 0.016, 28, 1, false, cut, PI * 2 - cut ).translate( 0, 0.012, 0 ), M( 0x3a1e10, { rough: 0.45 } ) );
				add( g, new THREE.CylinderGeometry( R * 0.95, R * 0.94, 0.016, 28, 1, false, cut, PI * 2 - cut ).translate( 0, 0.028, 0 ), M( 0xf6f3ea, { rough: 0.55 } ) );
				add( g, G.torus( R * 0.96, 0.008, 6, 28, PI * 2 - cut ), crust, [ 0, 0.036, 0 ], [ PI / 2, 0, cut + PI / 2 ] );
				add( g, G.box( R * 0.9, 0.034, 0.003 ), crust, [ R * 0.45 * Math.sin( cut ) , 0.018, R * 0.45 * Math.cos( cut ) ], [ 0, cut - PI / 2, 0 ] );
				add( g, G.box( R * 0.9, 0.034, 0.003 ), crust, [ 0, 0.018, R * 0.45 ], [ 0, - PI / 2, 0 ] );
				// whipped topping dots
				for ( let i = 0; i < 7; i ++ ) { const a = cut + 0.3 + i * 0.7; add( g, G.dome( 0.011, 8, 4 ), M( 0xffffff, { rough: 0.6 } ), [ Math.sin( a ) * R * 0.72, 0.036, Math.cos( a ) * R * 0.72 ] ); }
				return g;
			}
			case 'lihing': {
				// mango slices dusted red in a zip bag
				const R = rng( 81 );
				const mango = M( 0xf0a030, { rough: 0.35 } ), dust = M( 0xc0283a, { rough: 0.9 } );
				for ( let i = 0; i < 6; i ++ ) {
					const x = ( R() - 0.5 ) * 0.08, z = ( R() - 0.5 ) * 0.06;
					add( g, G.rbox( 0.05, 0.01, 0.022, 0.005 ), mango, [ x, 0.006 + ( i % 2 ) * 0.008, z ], [ 0, R() * PI, 0 ] );
					add( g, G.box( 0.03, 0.002, 0.014 ), dust, [ x, 0.016 + ( i % 2 ) * 0.008, z ], [ 0, R() * PI, 0 ] );
				}
				add( g, G.rbox( 0.15, 0.035, 0.12, 0.015 ), MAT.glass( 0xf8f8f8, 0.16 ) );
				add( g, G.box( 0.15, 0.006, 0.006 ), M( 0x2a5ad8 ), [ 0, 0.03, - 0.052 ] );
				return g;
			}
			case 'shave_ice': {
				// a paper cup with a dome of ice in three syrups, a spoon-straw
				add( g, G.cyl( 0.042, 0.03, 0.07, 18, true ), M( 0xffffff, { map: labelTex( { bg: 0xf2f2ee, fg: 0x2a8ad6, text: 'SHAVE ICE', style: 'stripes', band: 0x7ac8f0, size: 0.24 } ), rough: 0.8 } ) );
				add( g, disc( 0.03 ), M( 0xf2f2ee ), [ 0, 0.002, 0 ] );
				const cols = [ 0xe0203a, 0xf2c21a, 0x1a8ad8 ];
				for ( let i = 0; i < 3; i ++ ) add( g, G.sph( 0.052, 12, 10, i * PI * 2 / 3, PI * 2 / 3, 0, PI / 2 ), M( cols[ i ], { rough: 0.85 } ), [ 0, 0.068, 0 ], null, [ 1, 1.05, 1 ] );
				add( g, G.cyl( 0.003, 0.003, 0.15, 6 ), M( 0xe0405a ), [ 0.012, 0.06, 0 ], [ 0, 0, - 0.25 ] );
				return g;
			}
			case 'mac': {
				// a scoop of mac salad in a paper cup
				// a low paper cup heaped with it
				add( g, G.cyl( 0.048, 0.04, 0.026, 18, true ), M( 0xf6f6f2, { rough: 0.85 } ) );
				add( g, disc( 0.04 ), M( 0xf6f6f2 ), [ 0, 0.002, 0 ] );
				add( g, G.dome( 0.047, 14, 7 ), M( 0xe6d48a, { rough: 0.4 } ), [ 0, 0.022, 0 ], null, [ 1, 0.85, 1 ] );
				const pasta = M( 0xe8c060, { rough: 0.3 } ), R = rng( 91 );
				for ( let i = 0; i < 34; i ++ ) {
					const a = R() * PI * 2, t = R() * PI * 0.45, d = Math.sin( t ) * 0.046, y = 0.022 + Math.cos( t ) * 0.04;
					add( g, G.torus( 0.008, 0.0036, 5, 8, PI * 0.9 ), pasta, [ Math.cos( a ) * d, y, Math.sin( a ) * d ], [ R() * PI, R() * PI, 0 ] );
				}
				chunks( g, 7, 0.03, 0.06, [ 0xe8803a, 0x6aa83a ], 0.006, 93 );
				return g;
			}
			case 'salt_meat': {
				// a slab of meat packed in coarse salt, wrapped in cloth
				const crust = M( 0xffffff, { map: canvasTex( 'k:saltcrust', 64, 64, ( ctx, w, h ) => {
					ctx.fillStyle = '#9a4a3a'; ctx.fillRect( 0, 0, w, h );
					const R = rng( 101 );
					for ( let i = 0; i < 500; i ++ ) { ctx.fillStyle = R() < 0.75 ? 'rgba(250,248,240,0.9)' : 'rgba(120,40,30,0.6)'; ctx.fillRect( R() * w, R() * h, 1.5 + R() * 2, 1.5 + R() * 2 ); }
				}, { repeat: true } ), rough: 0.9 } );
				add( g, G.rbox( 0.16, 0.045, 0.1, 0.014 ), crust );
				add( g, G.box( 0.2, 0.003, 0.15 ), M( 0xe8e0cc, { rough: 1 } ), [ 0, - 0.002, 0 ] );
				add( g, G.torus( 0.06, 0.0025, 4, 16 ), M( 0xc8b890, { rough: 0.9 } ), [ 0.03, 0.023, 0 ], [ 0, PI / 2, 0 ], [ 1, 0.45, 1 ] );
				return ground( g );
			}
			case 'salmon': {
				// a slab of salt-cured salmon: orange flesh with white fat lines and salt, silver skin under, on paper
				const flesh = M( 0xffffff, { map: canvasTex( 'k:salmon', 128, 64, ( ctx, w, h ) => {
					ctx.fillStyle = '#e8724a'; ctx.fillRect( 0, 0, w, h );
					ctx.strokeStyle = 'rgba(255,236,220,0.75)'; ctx.lineWidth = 2;
					for ( let i = 0; i < 9; i ++ ) { ctx.beginPath(); ctx.moveTo( i * 15 + 4, 0 ); ctx.quadraticCurveTo( i * 15 + 12, h / 2, i * 15 + 2, h ); ctx.stroke(); }
					const R = rng( 171 );
					for ( let i = 0; i < 160; i ++ ) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect( R() * w, R() * h, 1.5, 1.5 ); }
				} ), rough: 0.45 } );
				add( g, G.box( 0.22, 0.002, 0.15 ), M( 0xf2ece0, { rough: 1 } ) );
				add( g, G.rbox( 0.16, 0.006, 0.085, 0.003 ), M( 0x9aa0a8, { rough: 0.3, metal: 0.4 } ), [ 0, 0.002, 0 ] );
				add( g, G.rbox( 0.16, 0.028, 0.085, 0.008 ), flesh, [ 0, 0.006, 0 ] );
				return g;
			}
			case 'salt_fish': {
				// a fish split open and flattened, white with salt
				const sh = new THREE.Shape();
				sh.moveTo( - 0.14, 0 ); sh.bezierCurveTo( - 0.1, 0.07, 0.06, 0.07, 0.1, 0.012 ); sh.lineTo( 0.15, 0.04 ); sh.lineTo( 0.15, - 0.04 ); sh.lineTo( 0.1, - 0.012 ); sh.bezierCurveTo( 0.06, - 0.07, - 0.1, - 0.07, - 0.14, 0 );
				const geo = new THREE.ExtrudeGeometry( sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 2 } ).rotateX( - PI / 2 );
				add( g, geo, M( 0xffffff, { map: canvasTex( 'k:saltfish', 64, 64, ( ctx, w, h ) => {
					ctx.fillStyle = '#d8d0c0'; ctx.fillRect( 0, 0, w, h );
					const R = rng( 111 );
					for ( let i = 0; i < 300; i ++ ) { ctx.fillStyle = R() < 0.6 ? '#ffffff' : '#a89a88'; ctx.fillRect( R() * w, R() * h, 1.5, 1.5 ); }
					ctx.strokeStyle = 'rgba(140,110,90,0.5)'; ctx.lineWidth = 2; for ( let i = 0; i < 9; i ++ ) { ctx.beginPath(); ctx.moveTo( i * 7 + 4, h * 0.2 ); ctx.lineTo( i * 7 + 8, h * 0.8 ); ctx.stroke(); }
				}, { repeat: true } ), rough: 0.85 } ) );
				return ground( g );
			}
			case 'smoked_meat': {
				// dark smoked strips tied in a bundle with string
				const meat = M( 0xffffff, { map: canvasTex( 'k:smoked', 64, 64, ( ctx, w, h ) => {
					ctx.fillStyle = '#4a2010'; ctx.fillRect( 0, 0, w, h );
					const R = rng( 121 );
					for ( let i = 0; i < 40; i ++ ) { ctx.strokeStyle = R() < 0.5 ? 'rgba(20,8,2,0.7)' : 'rgba(140,60,30,0.6)'; ctx.lineWidth = 1 + R() * 2; ctx.beginPath(); ctx.moveTo( 0, R() * h ); ctx.lineTo( w, R() * h ); ctx.stroke(); }
				}, { repeat: true } ), rough: 0.55 } );
				for ( let i = 0; i < 5; i ++ ) add( g, G.rbox( 0.2, 0.012, 0.022, 0.005 ), meat, [ ( i % 2 ) * 0.01, 0.006 + Math.floor( i / 2 ) * 0.011, ( i - 2 ) * 0.02 ], [ 0, ( i - 2 ) * 0.04, ( i % 3 - 1 ) * 0.05 ] );
				for ( const x of [ - 0.05, 0.05 ] ) add( g, G.torus( 0.03, 0.0018, 4, 14 ), M( 0xd8c8a0, { rough: 0.9 } ), [ x, 0.018, 0 ], [ 0, PI / 2, 0 ], [ 1, 0.65, 1.8 ] );
				return ground( g );
			}
		}
		return g;
	} );

	// ---- evolved dishes in what they were made in: { kind: pot|wok|salad|sandwich|rice_bowl, cooked } ----
	reg( 'kitchen_dish', ( s ) => {
		const g = group(), ck = !! s.cooked;
		switch ( s.kind ) {
			case 'pot': {
				const h = potShape( g );
				// raw: chunks floating in water; cooked: a thick brown stew
				add( g, disc( 0.096 ), M( 0xffffff, { map: stewTex( ! ck ), rough: ck ? 0.35 : 0.08 } ), [ 0, h * 0.8, 0 ] );
				chunks( g, ck ? 14 : 12, 0.075, h * 0.8 + 0.004, ck ? [ 0x8a4a1a, 0xc8783a, 0xe8c88a, 0x5a8a3a, 0xa83a2a ] : [ 0xe8a8a0, 0x7a5a44, 0xf2eee0, 0x5a9a3a, 0xd86a5a ], 0.018, ck ? 13 : 17 );
				if ( ck ) add( g, G.cylX( 0.006, 0.14, 6 ), M( 0x8a5a32, { rough: 0.6 } ), [ 0.04, h * 0.95, 0.02 ], [ 0, 0.5, 0.35 ] );
				return g;
			}
			case 'wok': {
				const top = wokShape( g );
				add( g, G.dome( 0.115, 18, 6 ), M( 0xffffff, { map: ck ? friedTex() : riceTex(), rough: ck ? 0.55 : 0.8 } ), [ 0, 0.018, 0 ], null, [ 1, 0.3, 1 ] );
				chunks( g, 14, 0.09, 0.048, ck ? [ 0xd8584a, 0xf2c63a, 0x4a9a3a, 0x8a4a22 ] : [ 0xe8a8a0, 0xf2e0a0, 0x5aaa4a, 0xf0d8c8 ], 0.014, ck ? 23 : 27 );
				if ( ! ck ) add( g, disc( 0.1 ), M( 0xe8c040, { rough: 0.05, transparent: true, opacity: 0.35 } ), [ 0, 0.02, 0 ] );
				void top;
				return g;
			}
			case 'salad': {
				const h = bowlShape( g, 0.075, 0.06, 0xf4f2ec, 0x2a5aa8 );
				add( g, G.dome( 0.068, 14, 6 ), M( 0x6ab04a, { rough: 0.55 } ), [ 0, h * 0.62, 0 ], null, [ 1, 0.32, 1 ] );
				chunks( g, 22, 0.055, h * 0.62 + 0.016, [ 0xd8301a, 0xf0a030, 0xc0283a, 0x3a8a2a, 0xf2eee0, 0xe8703a ], 0.014, 33, 0.35 );
				return g;
			}
			case 'sandwich': {
				// two triangles of white bread with the filling showing
				const bread = M( 0xe8d4a8, { rough: 0.9 } ), crust = M( 0xb8783a, { rough: 0.8 } );
				const tri = new THREE.Shape(); tri.moveTo( - 0.055, - 0.055 ); tri.lineTo( 0.055, - 0.055 ); tri.lineTo( - 0.055, 0.055 ); tri.closePath();
				const slice = ( t ) => new THREE.ExtrudeGeometry( tri, { depth: t, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 1 } ).rotateX( - PI / 2 );
				for ( const [ x, ry ] of [ [ - 0.03, 0 ], [ 0.04, PI ] ] ) {
					const sw = group();
					add( sw, slice( 0.012 ), bread, [ 0, 0.003, 0 ] );
					add( sw, slice( 0.007 ), M( 0xd8726a, { rough: 0.5 } ), [ 0.004, 0.018, 0.004 ], null, [ 1.1, 1, 1.1 ] );
					add( sw, slice( 0.004 ), M( 0x5aaa3a, { rough: 0.6 } ), [ 0.006, 0.027, 0.006 ], null, [ 1.16, 1, 1.16 ] );
					add( sw, slice( 0.012 ), bread, [ - 0.003, 0.033, - 0.003 ] );
					add( sw, G.box( 0.11, 0.012, 0.004 ), crust, [ 0, 0.038, - 0.057 ] );
					sw.position.set( x, 0, 0 ); sw.rotation.y = ry;
					g.add( sw );
				}
				return ground( g );
			}
			case 'rice_bowl': {
				const h = bowlShape( g, 0.07, 0.058, 0x2a2a2a, 0xc0282a );
				add( g, G.dome( 0.064, 16, 8 ), M( 0xffffff, { map: riceTex(), rough: 0.9 } ), [ 0, h * 0.75, 0 ], null, [ 1, 0.45, 1 ] );
				// a patty and an egg on top
				add( g, G.cyl( 0.03, 0.032, 0.014, 16 ), M( 0x5a2e16, { rough: 0.8 } ), [ - 0.012, h * 0.75 + 0.022, 0 ] );
				add( g, G.cyl( 0.026, 0.026, 0.004, 16 ), M( 0xfaf8f0, { rough: 0.45 } ), [ - 0.008, h * 0.75 + 0.036, 0.004 ] );
				add( g, G.dome( 0.011, 10, 5 ), M( 0xf5b52a, { rough: 0.25 } ), [ - 0.008, h * 0.75 + 0.04, 0.004 ] );
				chunks( g, 6, 0.04, h * 0.75 + 0.026, [ 0x4aa83a ], 0.005, 41 );
				return g;
			}
		}
		return g;
	} );

	// ---- a speckled enamel camp mug, empty or with a drink: { liquid, clear, foam } ----
	reg( 'kitchen_mug', ( s ) => {
		const g = group(), r = 0.045, h = 0.085;
		const enamel = M( 0xffffff, { map: enamelTex( 0x2a4a8a ), rough: 0.3, metal: 0.1 } );
		add( g, G.lathe( [ [ 0, 0 ], [ r * 0.96, 0 ], [ r, 0.004 ], [ r, h ], [ r * 0.95, h ], [ r * 0.95, 0.006 ], [ 0, 0.006 ] ], 24 ), enamel );
		add( g, G.torus( r * 0.975, 0.0025, 5, 28 ), M( 0x2a2a2a, { rough: 0.4, metal: 0.6 } ), [ 0, h, 0 ], [ PI / 2, 0, 0 ] );
		add( g, G.torus( 0.026, 0.005, 6, 14, PI ), enamel, [ r + 0.002, h * 0.52, 0 ], [ 0, 0, - PI / 2 ] );
		if ( s.liquid != null ) {
			add( g, disc( r * 0.94 ), M( s.liquid, { rough: 0.08, metal: 0.1 } ), [ 0, h * 0.82, 0 ] );
			if ( s.foam ) add( g, disc( r * 0.6 ), M( 0xd8b890, { rough: 0.7 } ), [ 0.008, h * 0.823, 0 ] );
		}
		return g;
	} );

	// ---- cocktails: { kind: mai_tai | blue_hawaii | lava_flow } ----
	reg( 'kitchen_cocktail', ( s ) => {
		const g = group();
		const glass = MAT.glass( 0xe8f4f8, 0.22 );
		if ( s.kind === 'mai_tai' ) {
			// a double rocks glass: amber over ice with a dark rum float, a lime wedge and mint, an umbrella
			const r = 0.042, h = 0.095;
			add( g, G.cyl( r, r * 0.92, h, 22, true ), glass );
			add( g, G.cyl( r * 0.92, r * 0.92, 0.012, 22 ), MAT.glass( 0xe8f4f8, 0.4 ) );
			add( g, G.cyl( r * 0.9, r * 0.86, h * 0.55, 20 ), M( 0xe89a3a, { rough: 0.15, transparent: true, opacity: 0.8 } ), [ 0, 0.012, 0 ] );
			add( g, G.cyl( r * 0.9, r * 0.9, h * 0.18, 20 ), M( 0x8a3a12, { rough: 0.15, transparent: true, opacity: 0.85 } ), [ 0, 0.012 + h * 0.55, 0 ] );
			for ( let i = 0; i < 4; i ++ ) add( g, G.rbox( 0.022, 0.022, 0.022, 0.004, 1 ), MAT.glass( 0xf8fcff, 0.45 ), [ Math.cos( i * 1.7 ) * 0.016, h * 0.72 + ( i % 2 ) * 0.008, Math.sin( i * 1.7 ) * 0.016 ], [ i, i * 2, 0 ] );
			add( g, G.sph( 0.012, 10, 6, 0, PI ), M( 0x6ab83a, { rough: 0.4 } ), [ r * 0.8, h + 0.004, 0 ], [ 0, 0, PI / 2 ] );
			for ( let i = 0; i < 3; i ++ ) add( g, flatShape( leafShape( 'lance', 0.03, 0.016 ) ), M( 0x2a8a2a, { side: THREE.DoubleSide, rough: 0.5 } ), [ - 0.01, h + 0.006, - 0.01 ], [ 0.3, i * 2.1, 0.4 ] );
			umbrella( g, - 0.012, h * 0.5, 0.01, 0xe0405a, 0.45 );
			return g;
		}
		// a hurricane glass on a short stem
		const prof = [ [ 0, 0 ], [ 0.034, 0 ], [ 0.034, 0.004 ], [ 0.006, 0.01 ], [ 0.005, 0.035 ], [ 0.028, 0.06 ], [ 0.036, 0.1 ], [ 0.028, 0.14 ], [ 0.034, 0.185 ] ];
		add( g, G.lathe( prof, 24 ), glass );
		const fill = [ [ 0, 0.042 ], [ 0.026, 0.064 ], [ 0.033, 0.1 ], [ 0.026, 0.14 ], [ 0.03, 0.165 ], [ 0, 0.165 ] ];
		if ( s.kind === 'blue_hawaii' ) {
			add( g, G.lathe( fill, 20 ), M( 0x1a8ad8, { rough: 0.1, transparent: true, opacity: 0.82 } ) );
			for ( let i = 0; i < 3; i ++ ) add( g, G.rbox( 0.02, 0.02, 0.02, 0.004, 1 ), MAT.glass( 0xf8fcff, 0.45 ), [ Math.cos( i * 2 ) * 0.012, 0.155, Math.sin( i * 2 ) * 0.012 ], [ i, i, 0 ] );
			add( g, G.sph( 0.008, 10, 8 ), M( 0xc0101a, { rough: 0.2 } ), [ - 0.015, 0.175, 0.012 ] );
			pineWedge( g, 0.03, 0.18, 0, 0 );
			umbrella( g, - 0.008, 0.11, - 0.012, 0xf2c21a, 0.35 );
		} else {
			// lava flow: white coconut cream with a red strawberry swirl running down the glass
			const swirl = M( 0xffffff, { map: canvasTex( 'k:lava', 128, 128, ( ctx, w, h ) => {
				ctx.fillStyle = '#f6f2ea'; ctx.fillRect( 0, 0, w, h );
				ctx.strokeStyle = '#d8203a'; ctx.lineWidth = 9; ctx.lineCap = 'round';
				for ( let k = 0; k < 3; k ++ ) { ctx.beginPath(); for ( let i = 0; i <= 20; i ++ ) { const t = i / 20; ctx.lineTo( ( k / 3 + t * 0.4 ) * w % w, ( 1 - t ) * h + Math.sin( t * 9 + k ) * 6 ); } ctx.stroke(); }
			} ), rough: 0.5 } );
			add( g, G.lathe( fill, 20 ), swirl );
			pineWedge( g, 0.03, 0.17, 0, 0 );
			add( g, G.cyl( 0.003, 0.003, 0.17, 6 ), M( 0xe0405a ), [ 0.008, 0.08, 0 ], [ 0, 0, - 0.2 ] );
		}
		return g;
	} );

	// ---- chili pepper water: a reused bottle with peppers steeping in it, a tape label ----
	reg( 'kitchen_cpw', () => {
		const g = group(), H = 0.19, R = 0.03;
		const prof = [ [ 0, 0 ], [ R, 0 ], [ R, H * 0.62 ], [ R * 0.55, H * 0.78 ], [ R * 0.36, H * 0.86 ], [ R * 0.36, H * 0.96 ] ];
		add( g, G.lathe( prof.concat( [ [ 0, H * 0.96 ] ] ), 18 ), MAT.glass( 0xe8f2e8, 0.3 ) );
		add( g, G.cyl( R * 0.9, R * 0.9, H * 0.6, 16 ), M( 0xf0b070, { rough: 0.1, transparent: true, opacity: 0.55 } ), [ 0, 0.003, 0 ] );
		const red = M( 0xe0201a, { rough: 0.3, emissive: 0x400000 } ), R2 = rng( 131 );
		for ( let i = 0; i < 16; i ++ ) add( g, G.capsX( 0.0048, 0.03, 6 ), red, [ ( R2() - 0.5 ) * R * 1.1, 0.012 + R2() * H * 0.5, ( R2() - 0.5 ) * R * 1.1 ], [ R2() * PI, R2() * PI, R2() * PI ] );
		for ( let i = 0; i < 3; i ++ ) add( g, G.sph( 0.004, 6, 4 ), M( 0xf2eedc ), [ ( R2() - 0.5 ) * R, 0.008 + R2() * 0.04, ( R2() - 0.5 ) * R ] );
		add( g, G.cyl( R * 0.4, R * 0.4, H * 0.07, 12 ), M( 0xc0282a, { rough: 0.5 } ), [ 0, H * 0.95, 0 ] );
		add( g, G.cyl( R * 1.008, R * 1.008, 0.03, 18, true ), M( 0xffffff, { map: labelTex( { bg: 0xf2ead0, fg: 0x2a2a2a, text: 'CHILI WATER', style: 'plain', size: 0.3, font: 'Comic Sans MS, cursive' } ), rough: 0.9 } ), [ 0, H * 0.3, 0 ] );
		return g;
	} );

	// ---- cookware: { kind } ----
	reg( 'kitchen_ware', ( s ) => {
		const g = group();
		switch ( s.kind ) {
			case 'wok': wokShape( g ); return g;
			case 'bowl': {
				const h = bowlShape( g, 0.068, 0.058, 0xf4f2ec, 0x2a5aa8 );
				if ( s.fill != null ) add( g, disc( 0.06 ), M( s.fill, { rough: 0.15 } ), [ 0, h * 0.78, 0 ] );
				return g;
			}
			case 'rice_cooker': {
				// a white electric rice cooker: a round body with a flower print, a domed lid, a carry handle and a switch
				const body = M( 0xffffff, { map: canvasTex( 'k:cooker', 256, 64, ( ctx, w, h ) => {
					ctx.fillStyle = '#f4f2ec'; ctx.fillRect( 0, 0, w, h );
					for ( let i = 0; i < 6; i ++ ) glyphFlower( ctx, ( i + 0.5 ) / 6 * w, h * 0.55, 10 );
				} ), rough: 0.35 } );
				const R = 0.12, H = 0.16;
				add( g, G.lathe( [ [ 0, 0 ], [ R * 0.9, 0 ], [ R, 0.02 ], [ R, H ], [ 0, H ] ], 28 ), body );
				add( g, G.dome( R * 0.98, 24, 8 ), M( 0xf2f2ee, { rough: 0.3 } ), [ 0, H, 0 ], null, [ 1, 0.35, 1 ] );
				add( g, G.cyl( 0.012, 0.012, 0.01, 10 ), M( 0x8a8a8a, { rough: 0.3, metal: 0.8 } ), [ 0, H + R * 0.34, 0 ] );
				add( g, G.torus( 0.07, 0.008, 6, 16, PI ), M( 0x5a5a5a, { rough: 0.5 } ), [ 0, H + 0.015, 0 ], [ 0, 0, 0 ], [ 1, 0.5, 1 ] );
				add( g, G.rbox( 0.06, 0.05, 0.03, 0.008 ), M( 0x7a7a72, { rough: 0.4 } ), [ R * 0.98, 0.03, 0 ], [ 0, PI / 2, 0 ] );
				add( g, G.box( 0.012, 0.022, 0.012 ), M( 0xd8402a, { rough: 0.4 } ), [ R + 0.01, 0.05, 0 ] );
				add( g, G.tube( [ [ - R, 0.03, 0 ], [ - R - 0.05, 0.01, 0.02 ], [ - R - 0.1, 0.004, 0.06 ] ], 0.004, 8, 5 ), MAT.blackPlastic() );
				return g;
			}
			case 'shaker': {
				// a cobbler shaker: a steel tumbler, a strainer top and a cap
				const steel = M( 0xc8ccd2, { rough: 0.18, metal: 1 } );
				add( g, G.lathe( [ [ 0, 0 ], [ 0.038, 0 ], [ 0.044, 0.12 ], [ 0.044, 0.13 ], [ 0, 0.13 ] ], 24 ), steel );
				add( g, G.lathe( [ [ 0.045, 0.125 ], [ 0.046, 0.15 ], [ 0.02, 0.19 ], [ 0.016, 0.2 ], [ 0, 0.2 ] ], 24 ), steel );
				add( g, G.cyl( 0.017, 0.017, 0.02, 16 ), steel, [ 0, 0.198, 0 ] );
				add( g, G.torus( 0.045, 0.0015, 4, 24 ), M( 0x8a8a8a, { rough: 0.3, metal: 1 } ), [ 0, 0.128, 0 ], [ PI / 2, 0, 0 ] );
				return ground( lieDown( g ) );
			}
			case 'grate': {
				// a wire grill grate in a frame, two little handles
				const steel = M( 0x8a8c90, { rough: 0.4, metal: 0.85 } );
				const W = 0.44, D = 0.3;
				for ( const z of [ - D / 2, D / 2 ] ) add( g, G.cylX( 0.006, W, 6 ), steel, [ 0, 0.006, z ] );
				for ( const x of [ - W / 2, W / 2 ] ) add( g, G.cylZ( 0.006, D, 6 ), steel, [ x, 0.006, 0 ] );
				for ( const z of [ - D / 4, D / 4 ] ) add( g, G.cylX( 0.004, W, 6 ), steel, [ 0, 0.003, z ] );
				for ( let i = 1; i < 12; i ++ ) add( g, G.cylZ( 0.0035, D, 5 ), steel, [ - W / 2 + i * W / 12, 0.008, 0 ] );
				for ( const x of [ - W / 2 - 0.03, W / 2 + 0.03 ] ) add( g, G.torus( 0.025, 0.004, 4, 10, PI ), steel, [ x, 0.004, 0 ], [ PI / 2, 0, x > 0 ? - PI / 2 : PI / 2 ] );
				return g;
			}
			case 'grater': {
				// a four-sided box grater with a handle on top (punched holes painted on)
				const holes = M( 0xffffff, { map: canvasTex( 'k:grater', 64, 128, ( ctx, w, h ) => {
					ctx.fillStyle = '#c8ccd2'; ctx.fillRect( 0, 0, w, h );
					ctx.fillStyle = '#2a2c30';
					for ( let y = 6; y < h - 4; y += 9 ) for ( let x = 5 + ( y % 18 ? 4 : 0 ); x < w - 3; x += 9 ) ctx.fillRect( x, y, 4, 3 );
				}, { repeat: true } ), rough: 0.3, metal: 0.85 } );
				const geo = new THREE.CylinderGeometry( 0.035 * Math.SQRT2, 0.05 * Math.SQRT2, 0.2, 4, 1, true ).rotateY( PI / 4 ).translate( 0, 0.1, 0 );
				add( g, geo, holes );
				add( g, G.box( 0.05, 0.004, 0.05 ), MAT.metal(), [ 0, 0.2, 0 ] );
				add( g, G.torus( 0.025, 0.006, 6, 12, PI ), MAT.blackPlastic(), [ 0, 0.2, 0 ] );
				return ground( lieDown( g ) );
			}
			case 'grinder': {
				// a hand coffee mill: a wooden box with a drawer, a steel hopper and a crank
				const wood = M( 0xffffff, { map: gradientTex( [ [ 0, 0x6a3a1a ], [ 0.5, 0x8a5228 ], [ 1, 0x5a3014 ] ], 80, '#3a1a0a', 141 ), rough: 0.55 } );
				const steel = M( 0xb8a070, { rough: 0.3, metal: 0.85 } );
				add( g, G.rbox( 0.1, 0.1, 0.1, 0.006 ), wood );
				add( g, G.box( 0.05, 0.025, 0.004 ), M( 0x5a3014, { rough: 0.6 } ), [ 0, 0.025, 0.051 ] );
				add( g, G.sph( 0.006, 8, 6 ), steel, [ 0, 0.025, 0.056 ] );
				add( g, G.lathe( [ [ 0.02, 0 ], [ 0.045, 0.035 ], [ 0.045, 0.04 ], [ 0.02, 0.005 ] ], 20 ), steel, [ 0, 0.1, 0 ] );
				add( g, G.cyl( 0.006, 0.006, 0.05, 8 ), steel, [ 0, 0.1, 0 ] );
				add( g, G.box( 0.08, 0.006, 0.01 ), steel, [ 0.035, 0.148, 0 ] );
				add( g, G.cyl( 0.007, 0.009, 0.025, 10 ), wood, [ 0.075, 0.15, 0 ] );
				return g;
			}
			case 'musubi_mold': {
				// a clear plastic Spam-shaped frame, open top and bottom, with its press lying across it
				const plastic = MAT.glass( 0xe8f0f4, 0.45 ), W = 0.095, D = 0.052, H = 0.045, t = 0.003;
				for ( const z of [ - D / 2, D / 2 ] ) add( g, G.box( W, H, t ), plastic, [ 0, 0, z ] );
				for ( const x of [ - W / 2, W / 2 ] ) add( g, G.box( t, H, D ), plastic, [ x, 0, 0 ] );
				add( g, G.box( W + 0.006, 0.003, D + 0.006 ), plastic, [ 0, H - 0.002, 0 ] );
				// the press: a plate and a grip, resting on the rim
				const press = M( 0xf2f2ee, { rough: 0.35 } );
				add( g, G.rbox( W - 0.008, 0.005, D - 0.008, 0.002, 1 ), press, [ 0.03, H + 0.002, 0.012 ], [ 0, 0.25, 0 ] );
				add( g, G.rbox( 0.05, 0.02, 0.012, 0.004, 1 ), press, [ 0.03, H + 0.007, 0.012 ], [ 0, 0.25, 0 ] );
				return g;
			}
			case 'jar': {
				// a mason jar: ribbed glass, a gold screw band; contents (pickles) when filled
				const r = 0.04, h = 0.13;
				add( g, G.lathe( [ [ 0, 0 ], [ r * 0.94, 0 ], [ r, 0.006 ], [ r, h * 0.78 ], [ r * 0.8, h * 0.88 ], [ r * 0.8, h * 0.94 ], [ 0, h * 0.94 ] ], 24 ), MAT.glass( 0xe8f2f0, 0.26 ) );
				for ( let i = 0; i < 3; i ++ ) add( g, G.torus( r * 1.002, 0.0012, 3, 24 ), MAT.glass( 0xe8f2f0, 0.4 ), [ 0, 0.02 + i * 0.012, 0 ], [ PI / 2, 0, 0 ] );
				add( g, G.cyl( r * 0.84, r * 0.84, h * 0.08, 22 ), M( 0xd4a64a, { rough: 0.3, metal: 0.9 } ), [ 0, h * 0.9, 0 ] );
				add( g, G.cyl( r * 0.78, r * 0.78, 0.003, 22 ), M( 0xc0a050, { rough: 0.35, metal: 0.8 } ), [ 0, h * 0.98, 0 ] );
				if ( s.fill != null ) {
					add( g, G.cyl( r * 0.92, r * 0.92, h * 0.68, 20 ), M( s.fill, { rough: 0.1, transparent: true, opacity: 0.55 } ), [ 0, 0.004, 0 ] );
					if ( s.pickles ) chunksIn( g, r * 0.8, h * 0.65, [ 0x9aa83a, 0xe8e0c0, 0xc0402a, 0x7a9a2a ], 151 );
					add( g, G.cyl( r * 1.006, r * 1.006, 0.035, 22, true ), M( 0xffffff, { map: labelTex( { bg: 0xf2ead0, fg: 0x2a2a2a, text: 'PICKLES', style: 'plain', size: 0.32, font: 'Comic Sans MS, cursive' } ), rough: 0.9 } ), [ 0, h * 0.35, 0 ] );
				}
				return g;
			}
		}
		return g;
	} );

	// ---- ice: a bag of ice cubes, a blue gel freezer pack: { kind } ----
	reg( 'kitchen_ice', ( s ) => {
		const g = group();
		if ( s.kind === 'pack' ) {
			const geo = G.rbox( 0.2, 0.026, 0.13, 0.012, 3 );
			add( g, geo, M( 0x3aa8e8, { rough: 0.2, metal: 0.05 } ) );
			add( g, G.box( 0.12, 0.001, 0.07 ), sticker( { bg: 0x3aa8e8, fg: 0xffffff, text: 'FREEZER PACK', sub: 'Reusable · Keep frozen', style: 'plain', glyph: 'drop', glyphColor: 0xffffff, size: 0.26 } ), [ 0, 0.0265, 0 ] );
			return g;
		}
		// a bag of ice: clear plastic pillow with cubes inside, a printed band, the knot
		const R = rng( 161 );
		const cube = MAT.glass( 0xe0f2ff, 0.6 );
		for ( let i = 0; i < 26; i ++ ) add( g, G.rbox( 0.03, 0.026, 0.03, 0.006, 1 ), cube, [ ( R() - 0.5 ) * 0.22, 0.012 + R() * 0.06, ( R() - 0.5 ) * 0.14 ], [ R() * PI, R() * PI, R() * PI ] );
		add( g, G.rbox( 0.3, 0.1, 0.19, 0.045, 3 ), MAT.glass( 0xf2faff, 0.22 ) );
		add( g, G.box( 0.12, 0.001, 0.19 ), M( 0xffffff, { map: labelTex( { bg: 0x1a6ad8, fg: 0xffffff, text: 'ICE', sub: 'Relief supply · 10 lb', style: 'plain', glyph: 'drop', glyphColor: 0xffffff, size: 0.4, w: 256, h: 256 } ), rough: 0.5 } ), [ 0, 0.1005, 0 ], [ 0, PI / 2, 0 ] );
		add( g, G.sph( 0.02, 10, 8 ), MAT.glass( 0xf2faff, 0.4 ), [ 0.17, 0.05, 0 ] );
		add( g, G.cone( 0.03, 0.05, 8 ), MAT.glass( 0xf2faff, 0.3 ), [ 0.21, 0.05, 0 ], [ 0, 0, - PI / 2 ] );
		return ground( g, false );
	} );

	// ---- the imu, placed in the world: its look per stage ----
	IMU.look = imuLook;
}

// a little five-petal flower on a canvas (the rice cooker's print)
function glyphFlower( ctx, x, y, s ) {
	ctx.save(); ctx.translate( x, y );
	ctx.fillStyle = '#e07a9a';
	for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; ctx.beginPath(); ctx.ellipse( Math.cos( a ) * s * 0.45, Math.sin( a ) * s * 0.45, s * 0.42, s * 0.26, a, 0, PI * 2 ); ctx.fill(); }
	ctx.fillStyle = '#f2c63a'; ctx.beginPath(); ctx.arc( 0, 0, s * 0.2, 0, PI * 2 ); ctx.fill();
	ctx.fillStyle = '#5a9a4a'; ctx.beginPath(); ctx.ellipse( s * 0.9, s * 0.4, s * 0.4, s * 0.14, 0.6, 0, PI * 2 ); ctx.fill();
	ctx.restore();
}

// chunks stacked inside a jar
function chunksIn( g, r, h, colors, seed ) {
	const R = rng( seed ), mats = colors.map( c => M( c, { rough: 0.4 } ) );
	for ( let i = 0; i < 22; i ++ ) {
		const a = R() * PI * 2, d = Math.sqrt( R() ) * r * 0.8, s = 0.012 + R() * 0.008;
		add( g, G.box( s, s * 0.7, s ), mats[ i % mats.length ], [ Math.cos( a ) * d, 0.008 + R() * h, Math.sin( a ) * d ], [ R(), R() * PI, R() ] );
	}
}

// an upright thing laid on its side (long axis along +x) so it rests on a shelf the way it falls
function lieDown( g ) {
	const inner = group();
	while ( g.children.length ) inner.add( g.children[ 0 ] );
	inner.rotation.z = - PI / 2;
	g.add( inner );
	return g;
}

// ---- the imu ----------------------------------------------------------------------------------------------------------

const imuCache = new Map();
function imuLook( stage, o = {} ) {
	const key = stage + ( o.sand ? 's' : '' ) + ( stage === 'hot' || stage === 'pit' ? Math.min( 8, o.food || 0 ) : '' ) + ( stage === 'pit' && o.stones ? 'k' : '' );
	let t = imuCache.get( key );
	if ( ! t ) { t = buildImu( stage, o ); imuCache.set( key, t ); }
	return t.clone();
}

function buildImu( stage, o ) {
	const root = group();
	const soil = M( o.sand ? 0x8a7450 : 0x4a3a28, { rough: 1 } );
	if ( stage === 'cooking' || stage === 'done' ) {
		// covered: a low mound of earth, burlap and banana leaves showing at the edge, a wisp of steam when it's ready
		root.add( placedModel( 'mound', { sand: !! o.sand } ) );
		const extra = group();
		add( extra, lump( 0.55, 0.16, 7, 9 ), soil, [ 0, - 0.02, 0 ] );
		for ( let i = 0; i < 5; i ++ ) {
			const a = i / 5 * PI * 2 + 0.4;
			add( extra, flatShape( leafShape( 'lance', 0.32, 0.12 ), ( x, z ) => Math.abs( z ) * 0.3 ), M( 0xffffff, { map: leafTex( 'lance', 0x5a6a2a, 0x6a7a32, 0x9aa85a ), side: THREE.DoubleSide, rough: 0.6 } ),
				[ Math.cos( a ) * 0.5, 0.015, Math.sin( a ) * 0.5 ], [ 0, - a, 0 ] );
		}
		add( extra, G.box( 0.4, 0.01, 0.3 ), M( 0xa8885a, { rough: 1 } ), [ 0.35, 0.03, - 0.2 ], [ 0.15, 0.6, 0.1 ] );
		if ( stage === 'done' ) for ( let i = 0; i < 3; i ++ ) add( extra, G.sph( 0.05 + i * 0.02, 8, 6 ), M( 0xf2f2f2, { transparent: true, opacity: 0.18, rough: 1 } ), [ 0.05 * i, 0.2 + i * 0.12, 0.02 * i ] );
		root.add( compact( extra ) );
		return root;
	}
	// open: the dug pit, wider than a stash hole, with the spoil heaped round it
	const pit = placedModel( 'hole', { sand: !! o.sand } );
	pit.scale.set( 1.6, 1, 1.6 );
	root.add( pit );
	const extra = group();
	const stone = M( stage === 'hot' ? 0x6a3a2a : 0x4a4844, { rough: 0.9, emissive: stage === 'hot' ? 0xff4a10 : 0x000000, emissiveIntensity: stage === 'hot' ? 0.6 : 1 } );
	// the stones: on the fire, glowing, or cold in the pit after a fire went out
	if ( stage === 'fire' || stage === 'hot' || o.stones ) for ( let i = 0; i < 7; i ++ ) {
		const a = i / 7 * PI * 2, d = 0.18 + ( i % 2 ) * 0.1;
		add( extra, lump( 0.07, 0.06, i + 11 ), stone, [ Math.cos( a ) * d, 0.0, Math.sin( a ) * d ] );
	}
	if ( stage === 'fire' ) {
		// a log fire burning on the stones: the placed lights' licking flames (animated, additive), a tall one in the
		// middle and a ring round it, and a glow, so it reads as a big fire at noon too (three small cones did not)
		const wood = M( 0x3a2414, { rough: 0.9 } ), ember = M( 0x2a1a10, { emissive: 0xff6a20, emissiveIntensity: 1.6, rough: 1 } );
		for ( let i = 0; i < 5; i ++ ) add( extra, G.cylX( 0.04, 0.55, 8 ), wood, [ 0, 0.06 + ( i % 2 ) * 0.05, 0 ], [ 0, i * PI / 5, 0.12 ] );
		add( extra, disc( 0.26 ), ember, [ 0, 0.03, 0 ] );
		const core = flame( 0.95 ); core.position.set( 0, 0.06, 0 ); root.add( core );
		for ( let i = 0; i < 5; i ++ ) {
			const a = i / 5 * PI * 2 + 0.5, f = flame( 0.5 + ( i % 3 ) * 0.1 );
			f.position.set( Math.cos( a ) * 0.17, 0.05, Math.sin( a ) * 0.17 );
			f.rotation.y = a;
			root.add( f );
		}
		const gl = glowSprite( 0xff7a2a, 1.4 ); gl.position.set( 0, 0.45, 0 ); root.add( gl );
	}
	if ( stage === 'hot' ) add( extra, disc( 0.3 ), M( 0x1a1008, { emissive: 0xff3a0a, emissiveIntensity: 0.9, rough: 1 } ), [ 0, 0.02, 0 ] );
	if ( stage === 'hot' || stage === 'pit' ) {
		// the wrapped food laid on the stones (glowing under banana leaves, or gone cold)
		const n = Math.min( 8, o.food || 0 );
		const leaf = M( 0xffffff, { map: leafTex( 'lance', 0x2a7a32, 0x4a9a3a, 0x9ad07a ), side: THREE.DoubleSide, rough: 0.4 } );
		for ( let i = 0; i < n; i ++ ) {
			const a = i / Math.max( 1, n ) * PI * 2, d = n > 1 ? 0.15 : 0;
			add( extra, G.sph( 0.07, 10, 8 ), leaf, [ Math.cos( a ) * d, 0.07, Math.sin( a ) * d ], null, [ 1.2, 0.7, 1 ] );
		}
	}
	root.add( compact( extra ) );
	return root;
}
