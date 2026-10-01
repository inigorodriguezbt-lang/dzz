// Vehicle wrecks for the sites: a sedan (on its roof, on its side, burnt out, or a police cruiser with a door hanging
// open) and a Black Hawk-style helicopter down in the open (fuselage, separated tail boom, rotor blades). Same kit
// conventions as props.js: origin on the ground, +x along the vehicle (the nose), sizes in metres.
import * as THREE from 'three';
import { geo, PI, shade, CELLS } from './kit.js';

const HALF = PI / 2;

function extrude( pts, depth, bevel = 0.04 ) {
	const s = new THREE.Shape();
	s.moveTo( pts[ 0 ][ 0 ], pts[ 0 ][ 1 ] );
	for ( let i = 1; i < pts.length; i ++ ) s.lineTo( pts[ i ][ 0 ], pts[ i ][ 1 ] );
	s.closePath();
	const g = new THREE.ExtrudeGeometry( s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4 } );
	g.translate( 0, 0, - depth / 2 );
	return g;
}

// a semicircle of points over a wheel (an arch in the sill line)
function arch( cx, r, out ) { for ( let i = 0; i <= 8; i ++ ) { const a = PI - i / 8 * PI; out.push( [ cx + Math.cos( a ) * r, 0.3 + Math.sin( a ) * ( r + 0.05 ) ] ); } }

const BODY = ( () => {
	const p = [ [ - 2.28, 0.3 ] ];
	arch( - 1.42, 0.42, p );
	p.push( [ 0.98, 0.3 ] );
	arch( 1.42, 0.42, p );
	p.push( [ 2.24, 0.3 ], [ 2.33, 0.48 ], [ 2.3, 0.66 ], [ 2.1, 0.8 ], [ 0.95, 0.93 ], [ - 1.58, 0.97 ], [ - 2.2, 0.94 ], [ - 2.33, 0.76 ], [ - 2.33, 0.45 ] );
	return p;
} )();
const CABIN = [ [ 0.98, 0.9 ], [ 0.12, 1.38 ], [ - 0.95, 1.4 ], [ - 1.6, 0.94 ] ];
const SIDE_WIN = [ [ 0.82, 0.98 ], [ 0.1, 1.32 ], [ - 0.92, 1.34 ], [ - 1.44, 0.99 ] ];

function car( k, o, R ) {
	const burnt = !! o.burnt;
	const c = burnt ? 0x2e2925 : ( o.c ?? 0x8a8f96 );
	const glass = burnt ? 0x0b0a09 : 0x161b20;
	const glassMat = burnt ? 'matte' : 'plastic';
	const sink = burnt ? 0.13 : 0;
	if ( o.flip ) k.push( [ 0, 1.38 - 0.06, 0 ], [ PI, 0, ( R() - 0.5 ) * 0.06 ] );
	else if ( o.side ) k.push( [ 0, 0.9, 0 ], [ HALF, 0, 0 ] );
	else k.push( [ 0, - sink, 0 ], [ ( R() - 0.5 ) * 0.04, 0, ( R() - 0.5 ) * 0.03 ] );
	k.part( extrude( BODY, 1.72, 0.05 ), burnt ? 'matte' : 'paint', c );
	k.part( extrude( CABIN, 1.34, 0.05 ), burnt ? 'matte' : 'paint', c, null, null, o.flip ? [ 1, 0.86, 1 ] : null );
	// windows: the sides, the windscreen and the rear glass
	for ( const z of [ - 0.725, 0.725 ] ) {
		k.part( extrude( SIDE_WIN, 0.01, 0 ), glassMat, glass, [ 0, 0, z ], null, o.flip ? [ 1, 0.86, 1 ] : null );
		k.box( 0.07, 0.36, 0.012, 'paint', c, [ - 0.36, 1.0 * ( o.flip ? 0.86 : 1 ), z * 1.006 ] );
	}
	const ws = ( a, b, w, n ) => {
		const off = 0.03, nx = n[ 0 ] * off, ny = n[ 1 ] * off;
		const pts = [ [ a[ 0 ] + nx, a[ 1 ] + ny, - w ], [ a[ 0 ] + nx, a[ 1 ] + ny, w ], [ b[ 0 ] + nx, b[ 1 ] + ny, w * 0.93 ], [ b[ 0 ] + nx, b[ 1 ] + ny, - w * 0.93 ] ];
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ ...pts[ 0 ], ...pts[ 1 ], ...pts[ 2 ], ...pts[ 0 ], ...pts[ 2 ], ...pts[ 3 ] ], 3 ) );
		g.computeVertexNormals();
		k.part( g, glassMat, glass, null, null, o.flip ? [ 1, 0.86, 1 ] : null );
	};
	ws( [ 0.97, 0.94 ], [ 0.14, 1.38 ], 0.62, [ 0.49, 0.87 ] );
	ws( [ - 1.58, 0.97 ], [ - 0.96, 1.39 ], - 0.6, [ - 0.56, 0.83 ] );
	// bumpers, lights, grille, mirrors
	k.box( 0.14, 0.2, 1.74, 'plastic', 0x1d1e20, [ 2.3, 0.28, 0 ] );
	k.box( 0.14, 0.2, 1.74, 'plastic', 0x1d1e20, [ - 2.3, 0.3, 0 ] );
	k.box( 0.05, 0.12, 0.7, 'plastic', 0x101113, [ 2.34, 0.52, 0 ] );
	for ( const z of [ - 0.62, 0.62 ] ) {
		k.box( 0.05, 0.1, 0.32, 'plastic', burnt ? 0x222222 : 0xdedcd2, [ 2.3, 0.62, z ] );
		k.box( 0.05, 0.12, 0.32, 'plastic', burnt ? 0x222222 : 0x8a1a16, [ - 2.33, 0.68, z ] );
		k.box( 0.16, 0.09, 0.08, 'paint', c, [ 0.82, 0.96, z * 1.5 ] );
	}
	// the underside (it shows when the car is on its roof or its side): floor pan, axles, exhaust, tank
	k.box( 3.9, 0.06, 1.5, 'matte', 0x1d1c1b, [ 0, 0.27, 0 ] );
	for ( const x of [ - 1.42, 1.42 ] ) k.part( geo.cylZ( 0.04, 1.5, 6 ), 'metal', 0x2e2c2a, [ x, 0.33, 0 ] );
	k.part( geo.cylX( 0.035, 3.6, 6 ), 'metal', 0x4a4038, [ - 0.4, 0.22, 0.42 ] );
	k.part( geo.cylX( 0.09, 0.5, 8 ), 'metal', 0x4a4038, [ - 1.4, 0.22, 0.42 ] );
	k.box( 0.7, 0.16, 0.9, 'matte', 0x262422, [ - 1.0, 0.12, - 0.15 ] );
	k.box( 0.5, 0.12, 0.4, 'metal', 0x2a2826, [ 1.6, 0.16, 0 ] );
	// wheels (a burnt-out car sits on its rims)
	for ( const x of [ - 1.42, 1.42 ] ) for ( const z of [ - 0.78, 0.78 ] ) {
		if ( ! burnt ) k.part( geo.cylZ( 0.33, 0.22, 14 ), 'matte', 0x18181a, [ x, 0.33, z ] );
		k.part( geo.cylZ( 0.2, 0.235, 10 ), 'metal', burnt ? 0x3a3530 : 0x9a9ea2, [ x, 0.33, z ] );
	}
	if ( o.police ) {
		for ( const z of [ - 1, 1 ] ) k.box( 1.6, 0.36, 0.01, 'print', 0xffffff, [ 0.1, 0.47, z * 0.905 ], z < 0 ? [ 0, PI, 0 ] : null, { cell: CELLS.police_door } );
		k.box( 0.22, 0.1, 1.05, 'plastic', 0x202226, [ - 0.4, 1.42, 0 ] );
		k.box( 0.2, 0.08, 0.48, 'plastic', 0xb0201c, [ - 0.4, 1.47, - 0.26 ] );
		k.box( 0.2, 0.08, 0.48, 'plastic', 0x1c3cb0, [ - 0.4, 1.47, 0.26 ] );
	}
	if ( o.doors ) {
		// the driver's door hanging open
		k.push( [ 0.92, 0.36, - 0.87 ], [ 0, - 0.95, 0 ] );
		k.box( 1.0, 0.62, 0.05, 'paint', c, [ - 0.5, 0, 0 ] );
		k.part( extrude( [ [ 0, 0.62 ], [ - 0.05, 0.98 ], [ - 0.9, 1.0 ], [ - 0.95, 0.62 ] ], 0.01, 0 ), glassMat, glass, [ 0, 0, 0 ] );
		if ( o.police ) k.box( 0.9, 0.36, 0.01, 'print', 0xffffff, [ - 0.48, 0.1, - 0.03 ], [ 0, PI, 0 ], { cell: CELLS.police_door } );
		k.pop();
	}
	if ( burnt ) for ( let i = 0; i < 5; i ++ ) k.box( 0.4 + R() * 0.6, 0.012, 0.3 + R() * 0.4, 'matte', shade( 0x6a3a22, ( R() - 0.5 ) * 0.3 ), [ ( R() - 0.5 ) * 3.5, 0.95 + R() * 0.02, ( R() - 0.5 ) * 1.2 ] );
	k.pop();
	if ( o.side ) k.collider( 2.3, 0.88, 0.7, [ 0, 0.88, 0 ], 0, 'metal' );
	else k.collider( 2.3, 0.62, 0.88, [ 0, 0.68, 0 ], 0, 'metal' );
}

// ---- the helicopter ---------------------------------------------------------------------------------------------------

const OD = 0x474c37, DARK = 0x262826, SOOT = 0x1a1816;

function heli( k, o, R ) {
	const roll = o.roll ?? 0.3;
	k.push( [ 0, 0.05 + Math.abs( roll ) * 0.6, 0 ], [ roll, 0, - 0.07 ] );
	// cabin and belly
	k.rbox( 6.0, 1.95, 2.3, 0.32, 'matte', OD, [ - 0.4, 0.25, 0 ] );
	k.rbox( 5.2, 0.35, 1.9, 0.12, 'matte', shade( OD, - 0.1 ), [ - 0.2, 0.0, 0 ] );
	// nose and cockpit glazing
	k.part( geo.sph( 1, 16, 10 ), 'matte', OD, [ 2.75, 1.1, 0 ], null, [ 1.75, 0.92, 1.12 ] );
	k.part( geo.sph( 1, 14, 8 ), 'matte', shade( OD, 0.04 ), [ 4.1, 0.86, 0 ], null, [ 0.9, 0.58, 0.82 ] );
	k.part( geo.sph( 1, 14, 8 ), 'plastic', 0x1a2126, [ 3.05, 1.42, 0 ], null, [ 1.32, 0.68, 0.98 ] );
	for ( const z of [ - 0.5, 0, 0.5 ] ) k.box( 0.06, 0.06, 0.04, 'matte', OD, [ 3.8, 1.55, z ], [ 0, 0, - 0.9 ] );
	// engines, exhausts, the rotor head with broken blade roots
	k.rbox( 3.4, 0.78, 1.55, 0.28, 'matte', shade( OD, - 0.04 ), [ 0.1, 2.12, 0 ] );
	for ( const z of [ - 0.62, 0.62 ] ) {
		k.part( geo.cylX( 0.26, 0.5, 10 ), 'matte', DARK, [ 1.85, 2.5, z ] );
		k.part( geo.cylX( 0.18, 0.7, 8 ), 'metal', 0x2b2b2b, [ - 1.75, 2.55, z * 1.25 ], [ 0, z * 0.6, 0 ] );
	}
	k.cyl( 0.2, 0.24, 0.55, 'metal', DARK, [ 0.6, 2.85, 0 ], null, 10 );
	k.cyl( 0.5, 0.5, 0.22, 'metal', 0x303234, [ 0.6, 3.3, 0 ], null, 12 );
	for ( let i = 0; i < 4; i ++ ) {
		const a = i / 4 * PI * 2 + 0.3, len = i % 2 ? 0.9 : 1.6;
		k.push( [ 0.6 + Math.cos( a ) * ( 0.45 + len / 2 ), 3.4, Math.sin( a ) * ( 0.45 + len / 2 ) ], [ 0, - a, ( R() - 0.5 ) * 0.4 ] );
		k.box( len, 0.07, 0.52, 'matte', 0x2c2e30, [ 0, - 0.035, 0 ] );
		k.pop();
	}
	// the cabin door slid back on one side, a dark doorway; small windows; stencils
	k.box( 1.85, 1.35, 0.02, 'matte', 0x0e0f0e, [ - 0.2, 0.55, 1.16 ] );
	k.box( 1.7, 1.3, 0.05, 'matte', shade( OD, 0.03 ), [ - 2.05, 0.58, 1.2 ] );
	k.box( 1.85, 1.35, 0.02, 'matte', 0x0e0f0e, [ - 0.2, 0.55, - 1.16 ] );
	for ( const z of [ - 1, 1 ] ) {
		k.box( 0.5, 0.42, 0.02, 'plastic', 0x1a2126, [ 1.25, 1.35, z * 1.16 ] );
		k.box( 1.3, 0.62, 0.012, 'print', 0xffffff, [ - 2.3, 1.5, z * 1.17 ], z < 0 ? [ 0, PI, 0 ] : null, { cell: CELLS.army } );
	}
	// a broken tail-boom stump with torn skin
	k.part( geo.cylX( 0.58, 1.7, 10, 0.46 ), 'matte', OD, [ - 4.15, 1.35, 0 ] );
	for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; k.box( 0.5, 0.03, 0.3, 'matte', shade( OD, - 0.1 ), [ - 5.05, 1.35 + Math.sin( a ) * 0.45, Math.cos( a ) * 0.45 ], [ a, 0.4 + R() * 0.5, 0.3 ] ); }
	// landing gear (one side collapsed)
	for ( const z of [ - 1.2, 1.2 ] ) {
		k.part( geo.cylZ( 0.3, 0.2, 12 ), 'matte', 0x161616, [ 1.4, 0.05, z * ( z < 0 ? 1.05 : 1 ) ], z < 0 ? [ 0.5, 0, 0 ] : null );
		k.box( 0.12, 0.6, 0.12, 'metal', DARK, [ 1.4, 0.1, z * 0.9 ], [ z * 0.4, 0, 0 ] );
	}
	k.part( geo.cylZ( 0.15, 0.12, 10 ), 'matte', 0x161616, [ - 5.4, 0.9, 0 ] );
	// soot over the engine bay and where the fuel burned
	for ( let i = 0; i < 6; i ++ ) k.box( 0.6 + R() * 1.2, 0.02, 0.5 + R() * 0.8, 'matte', SOOT, [ - 0.5 + ( R() - 0.5 ) * 3, 2.5 + R() * 0.03, ( R() - 0.5 ) * 1.0 ], [ ( R() - 0.5 ) * 0.2, R() * 3, 0 ] );
	for ( let i = 0; i < 3; i ++ ) k.box( 1.0 + R(), 0.9 + R() * 0.4, 0.02, 'matte', SOOT, [ - 1 + ( R() - 0.5 ) * 3, 1.0, 1.17 * ( i % 2 ? 1 : - 1 ) * 1.003 ] );
	k.pop();
	k.collider( 3.4, 1.3, 1.3, [ - 0.3, 1.3, 0 ], 0, 'metal' );
	k.collider( 1.3, 0.9, 1.0, [ 3.0, 0.9, 0 ], 0, 'metal' );
}

function heliTail( k, o, R ) {
	k.push( [ 0, 0.42, 0 ], [ 1.15, 0, 0.06 ] );
	k.part( geo.cylX( 0.42, 5.2, 10, 0.24 ), 'matte', OD );
	k.box( 0.9, 0.05, 0.4, 'matte', shade( OD, - 0.1 ), [ 2.3, - 0.02, 0 ] );
	k.box( 1.6, 0.05, 0.5, 'matte', OD, [ 2.25, 0, 0 ], [ HALF, 0, 0 ] );
	// the swept fin with its rotor
	k.push( [ 2.55, 0.15, 0 ], [ 0, 0, 0.45 ] );
	k.box( 0.8, 1.6, 0.14, 'matte', OD );
	k.cyl( 0.13, 0.13, 0.25, 'metal', DARK, [ 0.1, 1.45, 0.08 ], [ HALF, 0, 0 ], 8 );
	for ( let i = 0; i < 4; i ++ ) { k.push( [ 0.1, 1.45, 0.25 ], [ 0, 0, i * HALF + 0.3 ] ); k.box( 0.85, 0.035, 0.13, 'matte', 0x2c2e30, [ 0.43, 0, 0 ] ); k.pop(); }
	k.pop();
	for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2; k.box( 0.4, 0.03, 0.25, 'matte', shade( OD, - 0.15 ), [ - 2.65, Math.sin( a ) * 0.38, Math.cos( a ) * 0.38 ], [ a, 0.5, 0.2 ] ); }
	k.pop();
	k.collider( 2.6, 0.45, 0.48, [ 0, 0.45, 0 ], 0, 'metal' );
}

function rotorBlade( k, o, R ) {
	const B = 0x2c2e30;
	k.box( 3.4, 0.07, 0.52, 'matte', B, [ - 1.7, 0.02, 0 ], [ 0, 0, 0.02 ] );
	k.push( [ 0, 0.05, 0 ], [ 0.15, 0.4 + R() * 0.3, 0.1 ] );
	k.box( 2.9, 0.07, 0.52, 'matte', B, [ 1.45, 0, 0 ] );
	k.box( 0.35, 0.072, 0.52, 'paint', 0xd2b438, [ 2.75, 0, 0 ] );
	k.pop();
}

export const VEHICLE_PROPS = { car, heli, heli_tail: heliTail, rotor_blade: rotorBlade };
