// Vehicle wrecks for the sites: a sedan (on its roof, on its side, burnt out, or a police cruiser with a door hanging
// open) and a UH-1Y-style helicopter down in the open (fuselage on its side, skids crushed, the cabin door open on the
// troop seats, the cowling torn off the engine bay, soot over it all; the tail boom and rotor blades lie apart).
// Same kit conventions as props.js: origin on the ground, +x along the vehicle (the nose), sizes in metres.
import * as THREE from 'three';
import { geo, PI, shade, CELLS, rod, faces } from './kit.js';

const HALF = PI / 2;
const FINE = { fine: true };

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
	const burnt = !! o.burnt, crash = ! o.police;
	const c = burnt ? 0x2e2925 : ( o.c ?? 0x8a8f96 );
	const glass = burnt ? 0x0b0a09 : 0x161b20;
	const glassMat = burnt ? 'matte' : 'plastic';
	const trim = burnt ? 0x1a1816 : 0x1d1e20, seam = burnt ? 0x141210 : shade( c, - 0.55 );
	const sink = burnt ? 0.13 : 0;
	if ( o.flip ) k.push( [ 0, 1.38 - 0.06, 0 ], [ PI, 0, ( R() - 0.5 ) * 0.06 ] );
	else if ( o.side ) k.push( [ 0, 0.9, 0 ], [ HALF, 0, 0 ] );
	else k.push( [ 0, - sink, 0 ], [ ( R() - 0.5 ) * 0.04, 0, ( R() - 0.5 ) * 0.03 ] );
	const sy = o.flip ? [ 1, 0.86, 1 ] : null;
	k.part( extrude( BODY, 1.72, 0.05 ), burnt ? 'matte' : 'paint', c, null, null, null, { grime: burnt ? 0 : 0.25 } );
	k.part( extrude( CABIN, 1.34, 0.05 ), burnt ? 'matte' : 'paint', c, null, null, sy );
	// windows: the sides, the windscreen and the rear glass; the pillars between
	for ( const z of [ - 0.725, 0.725 ] ) {
		k.part( extrude( SIDE_WIN, 0.01, 0 ), glassMat, glass, [ 0, 0, z ], null, sy );
		k.box( 0.07, 0.36, 0.012, 'paint', c, [ - 0.36, 1.0 * ( o.flip ? 0.86 : 1 ), z * 1.006 ] );
	}
	const ws = ( a, b, w, n ) => {
		const off = 0.03, nx = n[ 0 ] * off, ny = n[ 1 ] * off;
		const pts = [ [ a[ 0 ] + nx, a[ 1 ] + ny, - w ], [ a[ 0 ] + nx, a[ 1 ] + ny, w ], [ b[ 0 ] + nx, b[ 1 ] + ny, w * 0.93 ], [ b[ 0 ] + nx, b[ 1 ] + ny, - w * 0.93 ] ];
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ ...pts[ 0 ], ...pts[ 1 ], ...pts[ 2 ], ...pts[ 0 ], ...pts[ 2 ], ...pts[ 3 ] ], 3 ) );
		g.computeVertexNormals();
		k.part( g, glassMat, glass, null, null, sy );
	};
	ws( [ 0.97, 0.94 ], [ 0.14, 1.38 ], 0.62, [ 0.49, 0.87 ] );
	ws( [ - 1.58, 0.97 ], [ - 0.96, 1.39 ], - 0.6, [ - 0.56, 0.83 ] );
	// door seams, sills, handles, mirrors
	// (the body's sides are at z = +-0.91: its extrusion and bevel)
	for ( const s of [ - 1, 1 ] ) {
		for ( const x of [ 0.95, - 0.32, - 1.48 ] ) k.box( 0.012, 0.55, 0.006, 'matte', seam, [ x, 0.36, s * 0.912 ] );
		for ( const x of [ 0.35, - 0.9 ] ) k.box( 0.12, 0.025, 0.02, 'metal', burnt ? 0x2a2622 : 0xb8bcc0, [ x, 0.8, s * 0.915 ] );
		k.box( 1.8, 0.06, 0.02, 'plastic', trim, [ - 0.25, 0.48, s * 0.915 ] );
	}
	// bumpers, lights, grille, plates
	k.box( 0.14, 0.2, 1.74, 'plastic', trim, [ 2.3, 0.28, 0 ], crash && ! o.flip ? [ 0.05, 0.15, 0.08 ] : null );
	k.box( 0.14, 0.2, 1.74, 'plastic', trim, [ - 2.3, 0.3, 0 ] );
	k.box( 0.05, 0.12, 0.7, 'plastic', 0x101113, [ 2.34, 0.52, 0 ] );
	for ( let i = 0; i < 3; i ++ ) k.box( 0.02, 0.012, 0.66, 'metal', burnt ? 0x2a2622 : 0x9a9ea2, [ 2.37, 0.48 + i * 0.04, 0 ] );
	for ( const z of [ - 0.62, 0.62 ] ) {
		const broken = crash && z > 0;
		k.box( 0.05, 0.1, 0.32, 'plastic', burnt || broken ? 0x1a1a1a : 0xdedcd2, [ 2.3, 0.62, z ] );
		k.box( 0.05, 0.12, 0.32, 'plastic', burnt ? 0x222222 : 0x8a1a16, [ - 2.33, 0.68, z ] );
		k.box( 0.16, 0.09, 0.08, 'paint', c, [ 0.82, 0.96, z * 1.5 ] );
	}
	if ( ! burnt ) for ( const s of [ 1, - 1 ] ) k.box( 0.01, 0.15, 0.32, 'print', 0xffffff, [ s * 2.375, s > 0 ? 0.24 : 0.36, 0 ], null, { cell: CELLS.plate } );
	// the underside (it shows when the car is on its roof or its side): floor pan, axles, exhaust, tank
	k.box( 3.9, 0.06, 1.5, 'matte', 0x1d1c1b, [ 0, 0.27, 0 ] );
	for ( const x of [ - 1.42, 1.42 ] ) k.part( geo.cylZ( 0.04, 1.5, 6 ), 'metal', 0x2e2c2a, [ x, 0.33, 0 ] );
	k.part( geo.cylX( 0.035, 3.6, 6 ), 'metal', 0x4a4038, [ - 0.4, 0.22, 0.42 ] );
	k.part( geo.cylX( 0.09, 0.5, 8 ), 'metal', 0x4a4038, [ - 1.4, 0.22, 0.42 ] );
	k.box( 0.7, 0.16, 0.9, 'matte', 0x262422, [ - 1.0, 0.12, - 0.15 ] );
	k.box( 0.5, 0.12, 0.4, 'metal', 0x2a2826, [ 1.6, 0.16, 0 ] );
	// the arches' dark insides
	for ( const x of [ - 1.42, 1.42 ] ) k.part( geo.cylZ( 0.43, 1.6, 10 ), 'matte', 0x121212, [ x, 0.36, 0 ], null, [ 1, 0.9, 1 ] );
	// wheels: tyres with a tread band and a hubcap (a burnt-out car sits on its rims)
	for ( const x of [ - 1.42, 1.42 ] ) for ( const z of [ - 0.78, 0.78 ] ) {
		if ( ! burnt ) {
			k.part( geo.cylZ( 0.33, 0.22, 14 ), 'matte', 0x18181a, [ x, 0.33, z ] );
			k.part( geo.cylZ( 0.21, 0.01, 10 ), 'metal', 0xa8acb0, [ x, 0.33, z * 1.15 ] );
			k.part( geo.cylZ( 0.06, 0.02, 6 ), 'metal', 0x7a7e82, [ x, 0.33, z * 1.16 ] );
		} else k.part( geo.cylZ( 0.2, 0.235, 10 ), 'metal', 0x3a3530, [ x, 0.33, z ] );
	}
	if ( o.police ) {
		for ( const z of [ - 1, 1 ] ) k.box( 1.6, 0.36, 0.01, 'print', 0xffffff, [ 0.1, 0.47, z * 0.905 ], z < 0 ? [ 0, PI, 0 ] : null, { cell: CELLS.police_door } );
		// the light bar on its feet, a spotlight by the A-pillar, a push bar
		k.box( 0.24, 0.1, 1.08, 'plastic', 0x202226, [ - 0.4, 1.42, 0 ] );
		k.box( 0.2, 0.08, 0.48, 'plastic', 0xb0201c, [ - 0.4, 1.48, - 0.26 ] );
		k.box( 0.2, 0.08, 0.48, 'plastic', 0x1c3cb0, [ - 0.4, 1.48, 0.26 ] );
		k.box( 0.21, 0.03, 0.04, 'plastic', 0xd8d8d0, [ - 0.4, 1.5, 0 ] );
		k.cyl( 0.05, 0.05, 0.08, 'metal', 0xc8ccd0, [ 0.95, 0.98, - 0.86 ], [ 0, 0, HALF ], 8 );
		for ( const z of [ - 0.45, 0.45 ] ) rod( k, [ 2.4, 0.2, z ], [ 2.5, 0.75, z * 0.9 ], 0.025, 'metal', 0x1a1a1a, 5 );
		rod( k, [ 2.5, 0.68, - 0.42 ], [ 2.5, 0.68, 0.42 ], 0.025, 'metal', 0x1a1a1a, 5 );
		k.cyl( 0.004, 0.003, 0.8, 'metal', 0x111111, [ - 1.3, 1.38, 0.3 ], null, 3 );
	}
	if ( o.doors ) {
		// the driver's door hanging open
		k.push( [ 0.92, 0.36, - 0.87 ], [ 0, - 0.95, 0 ] );
		k.box( 1.0, 0.62, 0.05, 'paint', c, [ - 0.5, 0, 0 ] );
		k.box( 0.96, 0.58, 0.01, 'matte', 0x2a2a2c, [ - 0.5, 0.02, 0.03 ] );
		k.part( extrude( [ [ 0, 0.62 ], [ - 0.05, 0.98 ], [ - 0.9, 1.0 ], [ - 0.95, 0.62 ] ], 0.01, 0 ), glassMat, glass, [ 0, 0, 0 ] );
		if ( o.police ) k.box( 0.9, 0.36, 0.01, 'print', 0xffffff, [ - 0.48, 0.1, - 0.03 ], [ 0, PI, 0 ], { cell: CELLS.police_door } );
		k.pop();
	}
	if ( crash && ! o.flip && ! burnt ) {
		// the bonnet buckled up off its catch, the boot sprung open
		k.push( [ 2.12, 0.86, 0 ], [ 0, 0, 0.12 ] );
		k.part( geo.quad( [ - 1.1, 0, 0.82 ], [ 0, 0, 0.82 ], [ 0, 0, - 0.82 ], [ - 1.1, 0, - 0.82 ], 4, 3, ( u, v ) => Math.sin( PI * u ) * Math.sin( PI * v ) * 0.12 ), 'paint', c );
		k.pop();
		k.box( 0.62, 0.012, 1.45, 'matte', 0x141414, [ - 1.92, 0.95, 0 ] );
		k.push( [ - 1.58, 0.98, 0 ], [ 0, 0, - 1.1 ] );
		k.box( 0.65, 0.04, 1.6, 'paint', c, [ - 0.33, 0, 0 ] );
		k.box( 0.6, 0.01, 1.5, 'matte', 0x2a2a2c, [ - 0.33, - 0.022, 0 ] );
		k.pop();
	}
	if ( burnt ) for ( let i = 0; i < 5; i ++ ) k.box( 0.4 + R() * 0.6, 0.012, 0.3 + R() * 0.4, 'matte', shade( 0x6a3a22, ( R() - 0.5 ) * 0.3 ), [ ( R() - 0.5 ) * 3.5, 0.95 + R() * 0.02, ( R() - 0.5 ) * 1.2 ] );
	k.pop();
	if ( o.side ) k.collider( 2.3, 0.88, 0.7, [ 0, 0.88, 0 ], 0, 'metal' );
	else k.collider( 2.3, 0.62, 0.88, [ 0, 0.68, 0 ], 0, 'metal' );
}

// ---- the helicopter ---------------------------------------------------------------------------------------------------

const OD = 0x4e5546, DARK = 0x262826, SOOT = 0x1a1816, GLASS = 0x18222a, INNER = 0x2a2e28;

// the fuselage: rounded-rectangle sections along +x [ x, centre y, half width, half height, roundness ]
const HULL = [
	[ 4.15, 1.05, 0.05, 0.05, 2 ], [ 4.02, 1.03, 0.42, 0.38, 2.2 ], [ 3.62, 1.08, 0.74, 0.68, 2.6 ], [ 3.0, 1.18, 0.92, 0.92, 3.2 ],
	[ 2.2, 1.25, 1.0, 1.0, 4.5 ], [ 0.62, 1.25, 1.02, 1.0, 5 ], [ - 0.9, 1.25, 1.02, 1.0, 5 ], [ - 1.7, 1.32, 0.9, 0.86, 4 ],
	[ - 2.4, 1.48, 0.62, 0.55, 3 ], [ - 3.0, 1.62, 0.42, 0.36, 2.5 ], [ - 3.7, 1.7, 0.34, 0.28, 2.2 ],
];
// the engine and transmission fairing on the roof
const FAIRING = [ [ 1.75, 2.12, 0.28, 0.1, 3 ], [ 1.25, 2.28, 0.6, 0.3, 4 ], [ - 1.6, 2.3, 0.62, 0.32, 4 ], [ - 2.35, 2.12, 0.42, 0.2, 3 ], [ - 2.8, 1.98, 0.22, 0.1, 2.5 ] ];
// the tail boom off the stump, its far end at the fin
const BOOM = [ [ 0, 0, 0.34, 0.28, 2.2 ], [ 1.6, 0.05, 0.28, 0.25, 2.3 ], [ 3.4, 0.12, 0.22, 0.22, 2.4 ], [ 5.2, 0.2, 0.16, 0.2, 2.5 ] ];

// a point on a lofted surface at x and angle a (0: +z, HALF: up), pushed out by off
function surf( secs, x, a, off = 0 ) {
	const down = secs[ 0 ][ 0 ] > secs[ 1 ][ 0 ];
	let i = 0;
	while ( i < secs.length - 2 && ( down ? x < secs[ i + 1 ][ 0 ] : x > secs[ i + 1 ][ 0 ] ) ) i ++;
	const s0 = secs[ i ], s1 = secs[ i + 1 ], t = Math.max( 0, Math.min( 1, ( x - s0[ 0 ] ) / ( s1[ 0 ] - s0[ 0 ] ) ) );
	const L = ( j ) => s0[ j ] + ( s1[ j ] - s0[ j ] ) * t;
	const e = 2 / L( 4 ), c = Math.cos( a ), sn = Math.sin( a );
	return [ x, L( 1 ) + Math.sign( sn ) * Math.abs( sn ) ** e * ( L( 3 ) + off ), Math.sign( c ) * Math.abs( c ) ** e * ( L( 2 ) + off ) ];
}
// the loft through secs, seg around, its faces facing out; hole( x, a ) leaves a face out (a door, a missing panel)
function loft( secs, seg, hole = null, inside = false ) {
	const pos = [], uv = [], idx = [], nv = secs.length - 1;
	for ( let j = 0; j <= nv; j ++ ) for ( let i = 0; i <= seg; i ++ ) {
		const a = i / seg * PI * 2;
		pos.push( ...surf( secs, secs[ j ][ 0 ], a ) ); uv.push( i / seg, j / nv );
	}
	// the angle turns +z to +y: with the sections running towards -x, a b c faces out
	const out = ( secs[ nv ][ 0 ] < secs[ 0 ][ 0 ] ) !== inside;
	for ( let j = 0; j < nv; j ++ ) for ( let i = 0; i < seg; i ++ ) {
		if ( hole && hole( ( secs[ j ][ 0 ] + secs[ j + 1 ][ 0 ] ) / 2, ( i + 0.5 ) / seg * PI * 2 ) ) continue;
		const a = j * ( seg + 1 ) + i, b = a + 1, c = a + seg + 2, d = a + seg + 1;
		if ( out ) idx.push( a, b, c, a, c, d ); else idx.push( a, d, c, a, c, b );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;
}
// a patch conforming to a loft over x0 < x1 and angles a0 < a1 (glazing, livery, soot), off above the skin; on the
// -z flank (the angle round PI) its texture turns half a turn so lettering reads from outside
// (its chords must not dip under the hull's facets: two cells per hull segment round and a few along, or for
// seams and soot, coarse, one a segment held a little further out)
function patch( secs, x0, x1, a0, a1, off, nu = 3, nv = 3, coarse = false ) {
	nu = Math.max( nu, Math.ceil( ( x1 - x0 ) / ( coarse ? 0.6 : 0.35 ) ) ); nv = Math.max( nv, Math.ceil( ( a1 - a0 ) / ( coarse ? PI / 8 : PI / 16 ) ) );
	off = Math.max( off, coarse ? 0.022 : 0.012 );
	const g = geo.grid( nu, nv, ( u, v ) => surf( secs, x0 + ( x1 - x0 ) * u, a0 + ( a1 - a0 ) * v, off ) );
	if ( Math.cos( ( a0 + a1 ) / 2 ) < 0 ) { const uv = g.attributes.uv.array; for ( let i = 0; i < uv.length; i ++ ) uv[ i ] = 1 - uv[ i ]; }
	return g;
}
// an angle range in (a0, a1) that may wrap past 2 PI
const inArc = ( a, a0, a1 ) => { const t = ( ( a - a0 ) % ( PI * 2 ) + PI * 2 ) % ( PI * 2 ); return t <= ( ( a1 - a0 ) % ( PI * 2 ) + PI * 2 ) % ( PI * 2 ); };

function heli( k, o, R ) {
	const roll = o.roll ?? 0.3, up = roll > 0 ? - 1 : 1;
	// the side that faces the sky: its angle on the hull (0 is +z)
	const sideA = up > 0 ? 0 : PI;
	// raised so the lower flank and the crushed skid rest on the ground
	const lift = Math.max( 0, 1.02 * Math.sin( Math.abs( roll ) ) - 0.25 * Math.cos( roll ) ) + 0.03;
	k.push( [ 0, lift, 0 ], [ roll, 0, - 0.07 ] );
	// the hull, with the cabin door open on the top side and the cowling torn off the engine bay beside it
	const door = ( x, a ) => x < 0.62 && x > - 0.9 && inArc( a, sideA - 0.75, sideA + 0.75 );
	k.part( loft( HULL, 16, door ), 'matte', OD, null, null, null, { grime: 0.3 } );
	k.part( new THREE.CircleGeometry( 1, 12 ).scale( 0.34, 0.28, 1 ).rotateY( - HALF ).translate( - 3.7, 1.7, 0 ), 'matte', 0x141412 );
	const bay = ( x, a ) => x < - 0.4 && x > - 1.7 && inArc( a, sideA - 0.2, sideA + 1.0 );
	k.part( loft( FAIRING, 12, bay ), 'matte', shade( OD, 0.05 ) );
	// inside: the cabin's lining, the floor, troop seats along the far wall; the engine bay's dark cavity and engines
	k.part( loft( HULL.slice( 3, 8 ).map( s => [ s[ 0 ], s[ 1 ], s[ 2 ] - 0.05, s[ 3 ] - 0.05, s[ 4 ] ] ), 12, null, true ), 'matte', INNER );
	k.box( 3.2, 0.05, 1.8, 'matte', 0x1e201c, [ - 0.4, 0.42, 0 ] );
	for ( let i = 0; i < 4; i ++ ) {
		const x = - 0.75 + i * 0.42, z = - up * 0.78;
		k.box( 0.38, 0.05, 0.36, 'cloth', 0x7a2a22, [ x, 0.82, z * 0.95 ] );
		k.box( 0.38, 0.45, 0.04, 'cloth', 0x7a2a22, [ x, 0.88, z ] );
		rod( k, [ x - 0.17, 0.45, z * 0.75 ], [ x - 0.17, 0.82, z * 0.75 ], 0.012, 'metal', 0x6a6e72, 4 );
	}
	k.part( loft( FAIRING.slice( 1, 4 ).map( s => [ s[ 0 ], s[ 1 ] - 0.02, s[ 2 ] - 0.05, s[ 3 ] - 0.05, s[ 4 ] ] ), 10, null, true ), 'matte', 0x161614 );
	for ( const z of [ - 0.25, 0.25 ] ) {
		k.part( geo.cylX( 0.17, 1.2, 10 ), 'metal', 0x3a3834, [ - 1.05, 2.3, z ] );
		k.part( geo.cylX( 0.1, 0.4, 8 ), 'metal', 0x2a2826, [ - 0.3, 2.3, z ] );
	}
	rod( k, [ - 1.6, 2.45, - 0.1 ], [ - 0.4, 2.42, 0.2 ], 0.02, 'metal', 0x6a5a40, 4 );
	rod( k, [ - 1.5, 2.15, 0.3 ], [ - 0.5, 2.5, - 0.25 ], 0.015, 'plastic', 0x1a1a1a, 4 );
	// the door slid back along its rail, its window; the frame round the opening
	const da = sideA;
	k.part( patch( HULL, - 2.25, - 0.85, da - 0.72, da + 0.72, 0.045, 2, 4 ), 'matte', shade( OD, 0.04 ) );
	k.part( patch( HULL, - 1.95, - 1.25, da - 0.15, da + 0.42, 0.06, 1, 1 ), 'plastic', GLASS );
	for ( const a of [ da - 0.77, da + 0.77 ] ) k.part( patch( HULL, - 2.3, 0.65, a - 0.03, a + 0.03, 0.02, 3, 1 ), 'metal', 0x3a3e36 );
	// cockpit glazing: the windscreen (one pane out), the side windows, the chin windows
	k.part( patch( HULL, 2.85, 3.55, HALF - 0.75, HALF - 0.02, 0.012, 2, 2 ), 'plastic', GLASS );
	k.part( patch( HULL, 2.85, 3.55, HALF + 0.02, HALF + 0.75, 0.012, 2, 2 ), 'matte', 0x0a0a0a );
	k.part( patch( HULL, 2.8, 3.6, HALF - 0.025, HALF + 0.025, 0.02, 2, 1 ), 'matte', DARK );
	for ( const a of [ 0.05, PI - 0.05 ] ) {
		const a0 = a < 1 ? - 0.4 : PI - 0.65, a1 = a < 1 ? 0.65 : PI + 0.4;
		k.part( patch( HULL, 2.25, 3.25, a0, a1, 0.012, 2, 2 ), 'plastic', GLASS );
	}
	k.part( patch( HULL, 3.45, 3.95, - HALF - 0.55, - HALF + 0.55, 0.012, 2, 2 ), 'plastic', GLASS );
	// the sensor turret under the nose, pitot tubes, a beacon and aerials
	k.part( geo.sph( 0.2, 10, 8 ), 'plastic', 0x1c1e1c, [ 3.75, 0.32, 0 ] );
	k.part( geo.sph( 0.09, 8, 6 ), 'plastic', 0x2a3a48, [ 3.82, 0.26, 0.1 ] );
	for ( const z of [ - 0.2, 0.2 ] ) rod( k, [ 3.95, 1.25, z ], [ 4.4, 1.25, z ], 0.012, 'metal', 0x9a9a9a, 4 );
	k.box( 0.12, 0.08, 0.08, 'plastic', 0x8a1a16, [ - 2.6, 2.05, 0 ] );
	rod( k, [ - 2.0, 2.3, 0 ], [ - 2.6, 2.9, 0 ], 0.006, 'metal', 0x2a2a2a, 3 );
	// panel seams round the hull
	for ( const x of [ 2.22, 0.62, - 0.9, - 1.72 ] ) for ( const [ a0, a1 ] of [ [ - 0.8, 0.8 ], [ 0.8, 2.4 ], [ 2.4, 3.9 ], [ 3.9, 5.5 ] ] ) {
		if ( x < 0.7 && x > - 1 && inArc( ( a0 + a1 ) / 2, sideA - 0.75, sideA + 0.75 ) ) continue;
		k.part( patch( HULL, x - 0.012, x + 0.012, a0, a1, 0.006, 1, 3, true ), 'matte', shade( OD, - 0.4 ) );
	}
	// engine intakes and exhausts, black with soot behind them
	for ( const z of [ - 0.35, 0.35 ] ) {
		k.part( geo.cylX( 0.16, 0.06, 10 ), 'matte', 0x0c0c0c, [ 1.27, 2.36, z ] );
		k.part( geo.cylX( 0.15, 0.55, 10, 0.12 ), 'metal', SOOT, [ - 2.4, 2.2, z * 1.1 ], [ 0, z * 0.5, 0.5 ] );
	}
	// livery and markings, and the soot blown back over them
	for ( const s of [ 0, PI ] ) {
		k.part( patch( HULL, - 2.5, - 1.75, s - 0.4, s + 0.4, 0.008, 2, 2 ), 'print', 0xffffff, null, null, null, { cell: CELLS.marines } );
		if ( s !== sideA ) k.part( patch( HULL, - 0.85, 0.55, s - 0.6, s + 0.3, 0.008, 2, 2 ), 'print', 0xffffff, null, null, null, { cell: CELLS.rescue } );
	}
	k.part( patch( FAIRING, - 2.6, - 0.2, - 0.6, HALF + 0.8, 0.012, 3, 3, true ), 'print', 0xffffff, null, null, null, { cell: CELLS.soot } );
	k.part( patch( HULL, - 3.7, - 2.4, - PI, PI, 0.012, 2, 6, true ), 'print', 0xffffff, null, null, null, { cell: CELLS.soot } );
	// the mast and rotor head, two blades still on it, snapped short and drooping
	k.cyl( 0.12, 0.15, 0.6, 'metal', DARK, [ 0.3, 2.55, 0 ], null, 8 );
	k.cyl( 0.3, 0.3, 0.18, 'metal', 0x303234, [ 0.3, 3.12, 0 ], null, 10 );
	for ( let i = 0; i < 4; i ++ ) {
		const a = i / 4 * PI * 2 + 0.3, len = [ 1.5, 0.35, 0.9, 0.3 ][ i ];
		k.push( [ 0.3 + Math.cos( a ) * 0.3, 3.2, Math.sin( a ) * 0.3 ], [ 0, - a, 0 ] );
		k.box( 0.32, 0.1, 0.16, 'metal', 0x3a3c3e, [ 0.16, - 0.05, 0 ] );
		if ( len > 0.5 ) {
			k.push( [ 0.32, 0, 0 ], [ ( R() - 0.5 ) * 0.2, 0, - 0.12 - R() * 0.15 ] );
			k.box( len, 0.06, 0.52, 'matte', 0x2c2e30, [ len / 2, - 0.03, 0 ] );
			k.part( faces( [ [ [ len, 0, - 0.26 ], [ len + 0.25, 0, 0.05 ], [ len, 0, 0.26 ] ] ] ), 'print', 0x2c2e30, null, null, null, { cell: CELLS.plain } );
			k.pop();
		}
		k.pop();
	}
	// skids: the top side's still on its cross tubes, the bottom one torn away, its tubes bent flat
	for ( const s of [ - 1, 1 ] ) {
		const z = s * 0.72, free = s === up;
		for ( const x of [ 1.35, - 0.75 ] ) {
			if ( free ) { rod( k, [ x, 0.42, z ], [ x + 0.05, 0.12, s * 1.15 ], 0.045, 'metal', 0x4a4e44, 6 ); rod( k, [ x + 0.05, 0.12, s * 1.15 ], [ x + 0.05, 0.03, s * 1.25 ], 0.045, 'metal', 0x4a4e44, 6 ); }
			else rod( k, [ x, 0.42, z ], [ x + 0.25, 0.3, s * 1.05 ], 0.045, 'metal', 0x4a4e44, 6 );
		}
		if ( free ) {
			rod( k, [ - 1.7, 0.03, s * 1.25 ], [ 2.3, 0.03, s * 1.25 ], 0.04, 'metal', 0x3e4238, 6 );
			rod( k, [ 2.3, 0.03, s * 1.25 ], [ 2.75, 0.32, s * 1.25 ], 0.04, 'metal', 0x3e4238, 6 );
			k.box( 0.3, 0.025, 0.14, 'metal', 0x2a2c28, [ 0.9, 0.08, s * 1.18 ] );
		}
	}
	// the tail boom torn off at the stump: shards of skin peeled back, cables and the drive shaft hanging out
	for ( let i = 0; i < 6; i ++ ) {
		const a = i / 6 * PI * 2 + R() * 0.4, p = surf( HULL, - 3.68, a, 0 ), l = 0.25 + R() * 0.3;
		const q = [ p[ 0 ] - l, p[ 1 ] + Math.sin( a ) * l * 0.8, p[ 2 ] + Math.cos( a ) * l * 0.8 ];
		const p2 = surf( HULL, - 3.68, a + 0.45, 0 );
		k.part( faces( [ [ p, q, p2 ] ] ), 'print', OD, null, null, null, { cell: CELLS.plain } );
	}
	rod( k, [ - 3.4, 1.85, 0 ], [ - 4.3, 1.8, 0.05 ], 0.04, 'metal', 0x5a5a56, 6 );
	for ( let i = 0; i < 3; i ++ ) {
		const pts = [ [ - 3.6, 1.6 + i * 0.08, ( i - 1 ) * 0.1 ], [ - 4.0, 1.3 + R() * 0.2, ( i - 1 ) * 0.2 ], [ - 4.3, 0.9 - R() * 0.3, ( i - 1 ) * 0.3 + R() * 0.2 ] ];
		k.part( geo.tube( pts, 0.012, 6, 3 ), 'plastic', [ 0x1a1a1a, 0xb8261d, 0xd9a52a ][ i ], null, null, null, FINE );
	}
	k.pop();
	k.groundDecal( 'brass', 2.5, 2.8 * up, 2.2, R() * 6 );
	k.collider( 3.4, 1.3, 1.3, [ - 0.3, 1.3, 0 ], 0, 'metal' );
	k.collider( 1.3, 0.9, 1.0, [ 3.0, 0.9, 0 ], 0, 'metal' );
}

function heliTail( k, o, R ) {
	k.push( [ 0, 0.36, 0 ], [ 1.15, 0, 0.06 ] );
	k.part( loft( BOOM, 12 ), 'matte', OD, null, null, null, { grime: 0.2 } );
	k.part( new THREE.CircleGeometry( 1, 10 ).scale( 0.34, 0.28, 1 ).rotateY( - HALF ), 'matte', 0x141412 );
	k.part( patch( BOOM, 0.4, 1.6, - 0.4, 0.4, 0.008, 2, 2 ), 'print', 0xffffff, null, null, null, { cell: CELLS.marines } );
	k.part( patch( BOOM, 0, 1.2, - PI, PI, 0.01, 2, 6, true ), 'print', 0xffffff, null, null, null, { cell: CELLS.soot } );
	// the synchronised elevator
	for ( const s of [ - 1, 1 ] ) k.part( faces( [ [ [ 2.0, 0.12, s * 0.22 ], [ 2.75, 0.12, s * 0.22 ], [ 2.6, 0.12, s * 0.95 ], [ 2.25, 0.12, s * 0.95 ] ] ] ), 'print', OD, null, null, null, { cell: CELLS.plain } );
	// the swept fin with its gearbox, the tail rotor on the right, a tail skid under it
	k.push( [ 5.1, 0.2, 0 ], [ 0, 0, 0.45 ] );
	k.part( faces( [ [ [ - 0.45, 0, 0.07 ], [ 0.45, 0, 0.07 ], [ 0.25, 1.55, 0.05 ], [ - 0.1, 1.55, 0.05 ] ], [ [ 0.45, 0, - 0.07 ], [ - 0.45, 0, - 0.07 ], [ - 0.1, 1.55, - 0.05 ], [ 0.25, 1.55, - 0.05 ] ] ] ), 'matte', OD );
	k.box( 0.9, 0.06, 0.14, 'matte', shade( OD, - 0.1 ), [ 0, - 0.03, 0 ] );
	k.cyl( 0.13, 0.13, 0.25, 'metal', DARK, [ 0.1, 1.45, 0.08 ], [ HALF, 0, 0 ], 8 );
	for ( let i = 0; i < 4; i ++ ) { k.push( [ 0.1, 1.45, 0.25 ], [ 0, 0, i * HALF + 0.3 ] ); k.box( 0.85, 0.035, 0.13, 'matte', 0x2c2e30, [ 0.43, 0, 0 ] ); k.box( 0.08, 0.036, 0.13, 'paint', 0xd2b438, [ 0.82, 0, 0 ] ); k.pop(); }
	rod( k, [ 0.0, 0, 0 ], [ 0.3, - 0.45, 0 ], 0.02, 'metal', 0x3a3e36, 5 );
	k.pop();
	// the torn end: shards of skin, the drive shaft, cables
	for ( let i = 0; i < 5; i ++ ) {
		const a = i / 5 * PI * 2 + R(), p = surf( BOOM, 0.01, a ), p2 = surf( BOOM, 0.01, a + 0.5 ), l = 0.2 + R() * 0.25;
		k.part( faces( [ [ p2, [ p[ 0 ] - l, p[ 1 ] + Math.sin( a ) * l * 0.6, p[ 2 ] + Math.cos( a ) * l * 0.6 ], p ] ] ), 'print', OD, null, null, null, { cell: CELLS.plain } );
	}
	rod( k, [ 0.3, 0.15, 0 ], [ - 0.35, 0.12, 0.04 ], 0.035, 'metal', 0x5a5a56, 6 );
	k.pop();
	k.collider( 2.6, 0.45, 0.48, [ 0, 0.45, 0 ], 0, 'metal' );
}

function rotorBlade( k, o, R ) {
	const B = 0x2c2e30;
	// the root fitting and the inboard half lying flat, the outboard half bent up off it
	k.box( 0.4, 0.12, 0.3, 'metal', 0x3a3c3e, [ - 3.45, 0, 0 ] );
	k.box( 3.4, 0.07, 0.52, 'matte', B, [ - 1.7, 0.02, 0 ], [ 0, 0, 0.02 ] );
	k.box( 3.4, 0.072, 0.06, 'metal', 0x8a8e92, [ - 1.7, 0.02, 0.27 ], [ 0, 0, 0.02 ] );
	k.push( [ 0, 0.05, 0 ], [ 0.15, 0.4 + R() * 0.3, 0.1 ] );
	k.box( 2.9, 0.07, 0.52, 'matte', B, [ 1.45, 0, 0 ] );
	k.box( 0.35, 0.072, 0.52, 'paint', 0xd2b438, [ 2.75, 0, 0 ] );
	k.part( faces( [ [ [ 2.9, 0.035, - 0.26 ], [ 3.15, 0.035, - 0.05 ], [ 2.9, 0.035, 0.26 ] ] ] ), 'print', 0xd2b438, null, null, null, { cell: CELLS.plain } );
	k.pop();
	// a torn strip of the skin at the break
	k.part( faces( [ [ [ - 0.05, 0.06, - 0.26 ], [ 0.3, 0.2, - 0.1 ], [ 0.05, 0.08, 0.1 ] ] ] ), 'print', B, null, null, null, { cell: CELLS.plain } );
}

export const VEHICLE_PROPS = { car, heli, heli_tail: heliTail, rotor_blade: rotorBlade };
