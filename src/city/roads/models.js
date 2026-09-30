// Procedural street furniture models (one merged geometry each, vertex coloured, pbr-tagged) and how a
// placement record from the worker expands into model instances.
//
// Conventions (match streetgen.js): origin at the base on the ground, +y up, the "front" faces local +z,
// arms of streetlights / signal masts reach along local +x, long things (barriers, booms, razor wire)
// run along local x.
import * as THREE from 'three';
import { MB, T } from './meshkit.js';
import { PROP } from './kinds.js';

const GALV = 0x8e9396, DARK = 0x2a2c2e, BLACK = 0x121212, WHITE = 0xd8d8d4;

// ---- lamps, poles and signals -----------------------------------------------------------------------------

function cobraHead( b, x, y, dir = 1, big = 1 ) {
	// the luminaire: a flattened housing with a glass bowl underneath (the bowl is the "bulb" part)
	b.box( 0.78 * big, 0.14 * big, 0.34 * big, 0x9aa0a3, T.galv, { x: x + dir * 0.3 * big, y } );
	b.box( 0.5 * big, 0.08 * big, 0.3 * big, 0x9aa0a3, T.galv, { x: x + dir * 0.36 * big, y: y + 0.09 * big, rz: - dir * 0.08 } );
	b.box( 0.56 * big, 0.06 * big, 0.26 * big, 0xcfcab8, T.bulb, { x: x + dir * 0.34 * big, y: y - 0.09 * big } );
}

function streetlight( double ) {
	const b = new MB();
	const H = double ? 10 : 8.2;
	b.cyl( 0.2, 0.22, 0.5, 10, 0x8a8883, T.concrete, { y: 0.25 } );
	b.cyl( 0.068, 0.105, H - 0.5, 10, GALV, T.galv, { y: 0.5 + ( H - 0.5 ) / 2 } );
	b.cyl( 0.13, 0.13, 0.3, 8, GALV, T.galv, { y: 0.65 } ); // base collar
	for ( const dir of double ? [ 1, - 1 ] : [ 1 ] ) {
		// curved davit arm
		const pts = [];
		for ( let k = 0; k <= 6; k ++ ) { const t = k / 6; pts.push( [ dir * t * 2.3, H - 0.25 + Math.sin( t * Math.PI * 0.5 ) * 0.42 - t * t * 0.1, 0 ] ); }
		b.tube( pts, 0.045, 6, GALV, T.galv );
		cobraHead( b, dir * 2.2, H + 0.02, dir );
	}
	b.cyl( 0.075, 0.075, 0.04, 8, GALV, T.galv, { y: H + 0.02 } );
	return b.build();
}

function utilityPole( variant ) {
	const b = new MB();
	const WOOD = 0x5d4c3b;
	b.cyl( 0.115, 0.155, 10.1, 9, WOOD, T.wood, { y: 5.05 } );
	b.box( 2.5, 0.1, 0.11, 0x6a5840, T.wood, { y: 9.6 } );
	b.beam( [ - 0.75, 9.55, 0 ], [ 0, 9.05, 0.06 ], 0.05, 0.05, 0x5a5a58, T.iron );
	b.beam( [ 0.75, 9.55, 0 ], [ 0, 9.05, 0.06 ], 0.05, 0.05, 0x5a5a58, T.iron );
	for ( const x of [ - 1.05, 1.05 ] ) {
		b.cyl( 0.045, 0.055, 0.14, 8, 0x7c8a7a, T.glass, { x, y: 9.72 } );
		b.cyl( 0.07, 0.07, 0.02, 8, 0x7c8a7a, T.glass, { x, y: 9.74 } );
	}
	b.cyl( 0.045, 0.055, 0.16, 8, 0x7c8a7a, T.glass, { y: 10.13 } );
	b.box( 0.3, 0.06, 0.06, 0x444, T.iron, { x: 0.18, y: 7.4 } ); // telephone cable clamp
	b.box( 0.06, 0.3, 0.02, 0xc9b24a, T.paint, { y: 1.9, z: 0.15 } ); // pole tag
	b.box( 0.02, 1.8, 0.02, 0x222222, T.plastic, { y: 1.2, z: - 0.15 } ); // ground wire moulding
	if ( variant === 1 ) {
		// pole-top transformer
		b.cyl( 0.24, 0.24, 0.9, 12, 0x7d8588, T.galv, { y: 8.35, z: 0.36 } );
		b.cyl( 0.26, 0.26, 0.05, 12, 0x6d7578, T.galv, { y: 8.83, z: 0.36 } );
		for ( const x of [ - 0.1, 0.1 ] ) b.cyl( 0.03, 0.035, 0.18, 6, 0x6f6f6f, T.glass, { x, y: 8.95, z: 0.36 } );
		b.box( 0.1, 0.4, 0.2, 0x6d7578, T.galv, { y: 8.2, z: 0.16 } );
	}
	if ( variant === 2 || variant === 3 ) {
		const dir = variant === 2 ? - 1 : 1;
		b.tube( [ [ 0, 7.7, 0 ], [ dir * 0.9, 7.85, 0 ], [ dir * 1.6, 7.9, 0 ] ], 0.035, 6, GALV, T.galv );
		cobraHead( b, dir * 1.45, 7.86, dir, 0.75 );
	}
	return b.build();
}

// a dead traffic signal head facing -z... turned to face +z (towards the approaching drivers)
function signalHead( b, x, y, z, housing = 0x2b2c24 ) {
	b.box( 0.36, 1.06, 0.26, housing, T.plastic, { x, y, z } );
	b.box( 0.52, 1.2, 0.03, 0x1a1a1a, T.plastic, { x, y, z: z - 0.14 } ); // backplate
	const cols = [ 0x3c0a08, 0x3a2905, 0x082a16 ];
	for ( let i = 0; i < 3; i ++ ) {
		const yy = y + 0.33 - i * 0.33;
		b.cyl( 0.12, 0.12, 0.02, 12, cols[ i ], T.lens, { x, y: yy, z: z + 0.135, axis: 'z' } );
		b.box( 0.3, 0.03, 0.2, housing, T.plastic, { x, y: yy + 0.14, z: z + 0.22, rx: 0.25 } ); // visor
	}
}

function signalMast() {
	const b = new MB();
	b.cyl( 0.24, 0.26, 0.35, 10, 0x8a8883, T.concrete, { y: 0.17 } );
	b.cyl( 0.12, 0.16, 6.6, 12, 0x6f7473, T.galv, { y: 3.4 } );
	// the mast arm reaching over the lanes, a little upswept
	b.tube( [ [ 0, 6.1, 0 ], [ 3.8, 6.22, 0 ], [ 7.6, 6.34, 0 ] ], 0.085, 8, 0x6f7473, T.galv );
	b.beam( [ 0, 6.9, 0 ], [ 2.4, 6.2, 0 ], 0.04, 0.04, 0x6f7473, T.galv ); // tie rod
	for ( const x of [ 4.1, 6.9 ] ) {
		b.box( 0.04, 0.3, 0.04, 0x333, T.iron, { x, y: 6.05 } );
		signalHead( b, x, 5.35, 0 );
	}
	signalHead( b, 0, 3.2, 0.3 ); // pedestal head on the pole
	b.box( 0.12, 0.16, 0.1, 0x2b2c24, T.plastic, { y: 1.1, z: 0.17 } ); // push button
	b.box( 0.3, 0.3, 0.2, 0x2b2c24, T.plastic, { x: 0.22, y: 2.6, rx: 0, ry: Math.PI / 2 } ); // ped head
	b.box( 0.9, 0.22, 0.02, 0x12603a, T.paint, { x: 2.2, y: 6.45, z: 0.1 } ); // street name on the mast arm
	return b.build();
}

function signPost( tall ) {
	const b = new MB();
	const h = tall ? 2.95 : 2.45;
	b.box( 0.05, h, 0.05, GALV, T.galv, { y: h / 2 } );
	b.box( 0.06, 0.02, 0.06, GALV, T.galv, { y: h } );
	return b.build();
}

// ---- street furniture ------------------------------------------------------------------------------------------

function hydrant() {
	const b = new MB();
	const SILVER = 0xb8b8b0;
	b.cyl( 0.17, 0.17, 0.05, 12, SILVER, T.steel, { y: 0.025 } );
	b.cyl( 0.12, 0.13, 0.52, 12, 0xffffff, T.tint, { y: 0.31 } );
	b.cyl( 0.14, 0.14, 0.05, 12, 0xffffff, T.tint, { y: 0.56 } );
	b.sphere( 0.115, 12, 6, SILVER, T.steel, { y: 0.585, sy: 0.7 } );
	b.cyl( 0.03, 0.04, 0.07, 5, SILVER, T.steel, { y: 0.69 } );
	for ( const s of [ - 1, 1 ] ) {
		b.cyl( 0.045, 0.05, 0.14, 10, 0xffffff, T.tint, { x: s * 0.16, y: 0.4, axis: 'x' } );
		b.cyl( 0.055, 0.055, 0.03, 6, SILVER, T.steel, { x: s * 0.235, y: 0.4, axis: 'x' } );
	}
	b.cyl( 0.07, 0.075, 0.12, 10, 0xffffff, T.tint, { y: 0.36, z: 0.15, axis: 'z' } );
	b.cyl( 0.08, 0.08, 0.035, 6, SILVER, T.steel, { y: 0.36, z: 0.22, axis: 'z' } );
	return b.build();
}

function trashCan( variant ) {
	const b = new MB();
	if ( variant === 0 ) {
		// city litter receptacle: slatted steel drum on a ring, domed lid with a side opening
		for ( let k = 0; k < 16; k ++ ) {
			const a = k / 16 * Math.PI * 2;
			b.box( 0.1, 0.84, 0.025, 0xffffff, T.tint, { x: Math.cos( a ) * 0.29, y: 0.5, z: Math.sin( a ) * 0.29, ry: - a + Math.PI / 2 } );
		}
		b.cyl( 0.27, 0.27, 0.8, 12, 0x151515, T.plastic, { y: 0.5 } ); // liner inside
		for ( const y of [ 0.14, 0.86 ] ) b.cyl( 0.305, 0.305, 0.05, 16, 0xffffff, T.tint, { y } );
		b.cyl( 0.2, 0.2, 0.1, 10, DARK, T.iron, { y: 0.05 } );
		b.sphere( 0.31, 16, 6, 0xffffff, T.tint, { y: 0.9, sy: 0.35 } );
		b.box( 0.3, 0.12, 0.05, 0x080808, T.plastic, { y: 0.98, z: 0.27 } );
	} else {
		// wheelie bin
		b.box( 0.58, 0.95, 0.7, 0xffffff, T.tintMatte, { y: 0.52 } );
		b.box( 0.62, 0.05, 0.76, 0xffffff, T.tintMatte, { y: 1.02, rx: - 0.03 } );
		b.box( 0.6, 0.06, 0.08, 0xffffff, T.tintMatte, { y: 0.95, z: - 0.4 } );
		for ( const x of [ - 0.26, 0.26 ] ) b.cyl( 0.1, 0.1, 0.06, 10, BLACK, T.rubber, { x, y: 0.1, z: - 0.33, axis: 'x' } );
	}
	return b.build();
}

function newsBox() {
	const b = new MB();
	b.box( 0.06, 0.4, 0.06, DARK, T.iron, { y: 0.2 } );
	b.box( 0.36, 0.04, 0.3, DARK, T.iron, { y: 0.02 } );
	b.box( 0.5, 0.66, 0.44, 0xffffff, T.tint, { y: 0.73 } );
	b.box( 0.52, 0.06, 0.46, 0xffffff, T.tint, { y: 1.08 } );
	b.box( 0.38, 0.26, 0.02, 0x1d2428, T.glass, { y: 0.84, z: 0.225 } ); // window
	b.box( 0.36, 0.12, 0.02, 0xd8d0b0, T.plastic, { y: 0.84, z: 0.23 } ); // paper behind
	b.box( 0.1, 0.16, 0.05, 0x9a9a9a, T.steel, { x: 0.16, y: 1.0, z: 0.23 } ); // coin box
	b.box( 0.34, 0.03, 0.03, 0x9a9a9a, T.steel, { y: 0.66, z: 0.24 } ); // handle
	return b.build();
}

function busShelter() {
	const b = new MB();
	const FR = 0x3b4245;
	for ( const x of [ - 1.95, 1.95 ] ) for ( const z of [ - 0.65, 0.7 ] ) b.box( 0.07, 2.5, 0.07, FR, T.steel, { x, y: 1.25, z } );
	b.box( 4.3, 0.08, 1.85, FR, T.steel, { y: 2.54, z: 0.05, rx: 0.04 } );
	b.box( 4.3, 0.18, 0.06, 0x1d6db5, T.paint, { y: 2.47, z: - 0.86 } ); // fascia
	b.box( 3.85, 2.05, 0.03, 0x6d8288, T.glass, { y: 1.3, z: 0.7 } ); // back glazing
	b.box( 3.85, 0.05, 0.05, FR, T.steel, { y: 0.26, z: 0.7 } );
	b.box( 0.03, 2.05, 1.25, 0x6d8288, T.glass, { x: - 1.95, y: 1.3, z: 0.05 } );
	// advertising panel at the open end
	b.box( 0.12, 1.8, 1.25, FR, T.steel, { x: 1.95, y: 1.2, z: 0.05 } );
	b.box( 0.02, 1.6, 1.1, 0xe8a54a, T.shiny, { x: 2.02, y: 1.25, z: 0.05 } );
	b.box( 0.02, 0.5, 0.8, 0x1d6db5, T.shiny, { x: 2.03, y: 1.6, z: 0.05 } );
	// perforated steel bench
	b.box( 2.4, 0.04, 0.42, 0x6b7275, T.steel, { y: 0.46, z: 0.4 } );
	for ( const x of [ - 1.0, 0, 1.0 ] ) b.box( 0.05, 0.44, 0.35, FR, T.steel, { x, y: 0.22, z: 0.42 } );
	return b.build();
}

function bench() {
	const b = new MB();
	const WOOD = 0x7a5836;
	for ( let k = 0; k < 3; k ++ ) b.box( 1.8, 0.035, 0.11, WOOD, T.wood, { y: 0.44, z: 0.14 - k * 0.13 } );
	for ( let k = 0; k < 2; k ++ ) b.box( 1.8, 0.1, 0.035, WOOD, T.wood, { y: 0.6 + k * 0.16, z: - 0.2 - k * 0.03, rx: - 0.18 } );
	for ( const x of [ - 0.78, 0.78 ] ) {
		b.box( 0.06, 0.44, 0.05, BLACK, T.iron, { x, y: 0.22, z: 0.16 } );
		b.box( 0.06, 0.86, 0.05, BLACK, T.iron, { x, y: 0.43, z: - 0.18, rx: - 0.12 } );
		b.box( 0.06, 0.05, 0.45, BLACK, T.iron, { x, y: 0.41, z: 0 } );
		b.box( 0.06, 0.05, 0.4, BLACK, T.iron, { x, y: 0.64, z: 0.02 } ); // armrest
	}
	return b.build();
}

function cone() {
	const b = new MB();
	b.box( 0.36, 0.035, 0.36, 0x1b1b1b, T.rubber, { y: 0.018 } );
	b.cyl( 0.028, 0.15, 0.66, 12, 0xd9531c, T.plastic, { y: 0.36 } );
	b.cyl( 0.073, 0.098, 0.1, 12, 0xe4e4e0, T.shiny, { y: 0.42 } );
	b.cyl( 0.05, 0.063, 0.06, 12, 0xe4e4e0, T.shiny, { y: 0.56 } );
	return b.build();
}

function sawhorse() {
	const b = new MB();
	for ( const x of [ - 0.95, 0.95 ] ) {
		for ( const s of [ - 1, 1 ] ) b.beam( [ x, 1.0, 0 ], [ x, 0, s * 0.32 ], 0.05, 0.05, 0xd6d0c4, T.plastic );
		b.box( 0.06, 0.05, 0.5, 0xd6d0c4, T.plastic, { x, y: 0.3 } );
	}
	// two striped rails
	for ( const y of [ 0.95, 0.58 ] ) for ( let k = 0; k < 8; k ++ ) {
		b.box( 0.3, 0.2, 0.025, k % 2 ? 0xe8e8e2 : 0xde6414, T.shiny, { x: - 1.05 + k * 0.3, y, z: 0.03 } );
	}
	b.box( 0.12, 0.12, 0.06, 0xf2c500, T.bulb, { x: 0.9, y: 1.12, z: 0.03 } ); // dead warning light
	return b.build();
}

// concrete Jersey barrier, 3 m along x
const JP = [ [ - 0.3, 0 ], [ 0.3, 0 ], [ 0.3, 0.08 ], [ 0.17, 0.33 ], [ 0.09, 0.81 ], [ - 0.09, 0.81 ], [ - 0.17, 0.33 ], [ - 0.3, 0.08 ] ];
function jersey() {
	const b = new MB();
	b.extrudeX( JP, - 1.5, 1.5, 0xa9a59b, T.concrete );
	b.box( 0.2, 0.08, 0.04, 0x8a8680, T.concrete, { x: - 1.3, y: 0.05, z: 0.29 } ); // drain slot shade
	b.box( 0.2, 0.08, 0.04, 0x8a8680, T.concrete, { x: 1.3, y: 0.05, z: 0.29 } );
	return b.build();
}

function sandbags() {
	// a 2 m x 0.9 m wall of bags laid like bricks, two bags deep
	const b = new MB();
	let s = 7;
	const rnd = () => { s = ( s * 16807 ) % 2147483647; return s / 2147483647; };
	const cols = [ 0xa99b76, 0x9d8f6b, 0xb3a57e, 0x8f8462 ];
	for ( let row = 0; row < 4; row ++ ) for ( const z of [ - 0.17, 0.17 ] ) {
		const off = ( row % 2 ) * 0.25;
		for ( let x = - 1.0 + 0.25 + off; x < 1.0 - 0.2; x += 0.5 ) {
			b.sphere( 0.5, 8, 5, cols[ Math.floor( rnd() * 4 ) ], T.fabric, { x: x + ( rnd() - 0.5 ) * 0.04, y: 0.12 + row * 0.215, z: z + ( rnd() - 0.5 ) * 0.03, sx: 0.54, sy: 0.3, sz: 0.36, ry: ( rnd() - 0.5 ) * 0.15 } );
		}
	}
	return b.build();
}

function hesco() {
	const b = new MB();
	const S = 1.1, H = 1.36;
	b.box( S - 0.04, H - 0.04, S - 0.04, 0xa38f6c, T.fabric, { y: H / 2 } );
	b.box( S - 0.1, 0.02, S - 0.1, 0x8f7a58, T.sand, { y: H - 0.02 } );
	const M = 0x7d7f7a;
	for ( const x of [ - S / 2, S / 2 ] ) for ( const z of [ - S / 2, S / 2 ] ) b.box( 0.03, H, 0.03, M, T.galv, { x, y: H / 2, z } );
	for ( const y of [ 0.02, H * 0.34, H * 0.67, H - 0.02 ] ) {
		for ( const z of [ - S / 2, S / 2 ] ) b.box( S, 0.02, 0.02, M, T.galv, { y, z } );
		for ( const x of [ - S / 2, S / 2 ] ) b.box( 0.02, 0.02, S, M, T.galv, { x, y } );
	}
	for ( const k of [ - 1, 0, 1 ] ) for ( const z of [ - S / 2, S / 2 ] ) b.box( 0.015, H, 0.015, M, T.galv, { x: k * S / 4, y: H / 2, z } );
	return b.build();
}

// concertina coil, 5 m along x
function razorWire() {
	const b = new MB();
	const R = 0.45, loops = 22, segs = 10, L = 5;
	const pts = [];
	for ( let k = 0; k <= loops * segs; k ++ ) {
		const t = k / segs * Math.PI * 2;
		const x = - L / 2 + k / ( loops * segs ) * L + Math.sin( t ) * 0.06;
		pts.push( [ x, R + Math.sin( t ) * R * 0.98, Math.cos( t ) * R ] );
	}
	// a flat ribbon, visible from both sides (two faces)
	const tri = [];
	for ( let k = 0; k < pts.length - 1; k ++ ) {
		const a = pts[ k ], c = pts[ k + 1 ];
		const w = 0.012;
		const a2 = [ a[ 0 ] + w, a[ 1 ], a[ 2 ] ], c2 = [ c[ 0 ] + w, c[ 1 ], c[ 2 ] ];
		tri.push( a, c, a2, a2, c, c2, a, a2, c, a2, c2, c );
	}
	b.tris( tri, 0x9a9da0, T.steel );
	// barbs as tiny tetrahedra every few segments
	return b.build();
}

function booth() {
	const b = new MB();
	const W = 0xffffff;
	b.box( 2.0, 1.0, 2.0, W, T.tintMatte, { y: 0.5 } );
	for ( const [ x, z ] of [ [ - 0.97, - 0.97 ], [ 0.97, - 0.97 ], [ - 0.97, 0.97 ], [ 0.97, 0.97 ] ] ) b.box( 0.1, 1.2, 0.1, W, T.tintMatte, { x, y: 1.6, z } );
	b.box( 1.86, 1.1, 1.86, 0x2a3236, T.glass, { y: 1.55 } );
	b.box( 2.1, 0.35, 2.1, W, T.tintMatte, { y: 2.33 } );
	b.box( 2.4, 0.1, 2.4, 0x3a3d3a, T.iron, { y: 2.55 } );
	b.box( 0.8, 1.9, 0.05, 0x3d4035, T.paint, { x: 0.45, y: 0.97, z: 1.01 } ); // door
	b.box( 0.3, 0.2, 0.2, 0x444, T.iron, { x: - 0.7, y: 2.3, z: 1.1 } ); // lamp
	return b.build();
}

function trashBag() {
	const b = new MB();
	// a lumpy, sagging sack (merged vertices so the creases shade smoothly), the neck tied off on top
	const g = mergeVerts( new THREE.IcosahedronGeometry( 0.3, 2 ) );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const n = 1 + 0.1 * Math.sin( x * 17 + z * 9 ) * Math.cos( y * 13 ) + 0.05 * Math.sin( x * 31 - y * 23 );
		p.setXYZ( i, x * n * ( y < 0 ? 1.08 : 1 ), ( y < 0 ? y * 0.5 : y * 0.95 ) * n, z * n * 0.9 );
	}
	g.computeVertexNormals();
	b.add( g, 0x141414, [ 0.28, 0, 0 ], { y: 0.16 } );
	b.cone( 0.07, 0.14, 8, 0x141414, [ 0.3, 0, 0 ], { y: 0.47 } );
	return b.build();
}

function suitcase() {
	const b = new MB();
	b.box( 0.46, 0.64, 0.25, 0xffffff, T.tintShiny, { y: 0.36 } );
	b.box( 0.47, 0.03, 0.26, 0x222222, T.plastic, { y: 0.36 } ); // zip seam
	b.box( 0.03, 0.2, 0.03, 0x333333, T.steel, { x: - 0.1, y: 0.78 } );
	b.box( 0.03, 0.2, 0.03, 0x333333, T.steel, { x: 0.1, y: 0.78 } );
	b.box( 0.23, 0.03, 0.04, 0x222222, T.plastic, { y: 0.88 } );
	for ( const x of [ - 0.18, 0.18 ] ) b.cyl( 0.035, 0.035, 0.03, 8, BLACK, T.rubber, { x, y: 0.035, z: - 0.09, axis: 'x' } );
	return b.build();
}

function cardboard() {
	const b = new MB();
	b.box( 0.5, 0.38, 0.42, 0x9c7a4d, T.fabric, { y: 0.19 } );
	b.box( 0.5, 0.005, 0.07, 0xc9b78d, T.shiny, { y: 0.383 } );
	b.box( 0.5, 0.01, 0.2, 0x8e6e44, T.fabric, { y: 0.44, z: 0.26, rx: 0.9 } );
	b.box( 0.5, 0.01, 0.2, 0x8e6e44, T.fabric, { y: 0.43, z: - 0.25, rx: - 1.1 } );
	return b.build();
}

function barrel() {
	const b = new MB();
	b.cyl( 0.29, 0.29, 0.88, 16, 0xffffff, T.tint, { y: 0.44 } );
	for ( const y of [ 0.3, 0.6 ] ) b.cyl( 0.3, 0.3, 0.035, 16, 0xffffff, T.tint, { y } );
	b.cyl( 0.27, 0.27, 0.01, 16, 0x555555, T.iron, { y: 0.885 } );
	b.cyl( 0.03, 0.03, 0.02, 6, 0x888888, T.steel, { x: 0.15, y: 0.89 } );
	return b.build();
}

function milePost() {
	const b = new MB();
	b.box( 0.07, 1.22, 0.05, 0x1e5a38, T.paint, { y: 0.61 } );
	b.box( 0.06, 0.1, 0.02, 0xd8d8d0, T.shiny, { y: 0.72, z: 0.03 } );
	return b.build();
}

function guidePosts( variant ) {
	const b = new MB();
	const h = variant ? 2.95 : 4.25;
	for ( const x of [ - 2.2, 2.2 ] ) {
		if ( variant ) b.box( 0.14, h, 0.14, 0x5b3d22, T.wood, { x, y: h / 2 } );
		else {
			b.box( 0.12, h, 0.02, GALV, T.galv, { x, y: h / 2, z: - 0.05 } );
			b.box( 0.12, h, 0.02, GALV, T.galv, { x, y: h / 2, z: - 0.13 } );
			b.box( 0.02, h, 0.1, GALV, T.galv, { x, y: h / 2, z: - 0.09 } );
			b.cyl( 0.22, 0.24, 0.25, 8, 0x8a8883, T.concrete, { x, y: 0.1, z: - 0.09 } );
		}
	}
	return b.build();
}

function meter() {
	const b = new MB();
	b.cyl( 0.035, 0.04, 1.08, 8, 0x4a4d50, T.iron, { y: 0.54 } );
	b.box( 0.22, 0.3, 0.16, 0x3a3d3f, T.iron, { y: 1.22 } );
	b.sphere( 0.11, 10, 5, 0x9aa0a4, T.steel, { y: 1.37, sy: 0.9, sz: 0.75 } );
	b.box( 0.12, 0.07, 0.02, 0x9ab0a8, T.glass, { y: 1.38, z: 0.085 } );
	b.box( 0.09, 0.04, 0.02, 0x9ab0a8, T.glass, { y: 1.26, z: 0.085 } );
	return b.build();
}

function boomBase() {
	const b = new MB();
	b.box( 0.4, 1.0, 0.36, 0xd4a020, T.paint, { y: 0.5 } );
	b.box( 0.44, 0.06, 0.4, 0x333333, T.iron, { y: 1.02 } );
	b.box( 0.3, 0.3, 0.3, 0x333333, T.iron, { x: - 0.3, y: 0.9 } ); // counterweight
	return b.build();
}
// unit-length arm along +x (scaled by the boom length)
function boomArm() {
	const b = new MB();
	for ( let k = 0; k < 10; k ++ ) b.box( 0.1, 0.09, 0.07, k % 2 ? 0xe8e8e2 : 0xc1281c, T.shiny, { x: 0.2 + ( k + 0.5 ) * 0.1, y: 0.92 } );
	return b.build();
}

function floodlight() {
	const b = new MB();
	const Y = 0xd8a41c;
	b.box( 1.3, 0.7, 2.0, Y, T.paint, { y: 0.75 } );
	b.box( 1.34, 0.08, 2.04, 0x333333, T.iron, { y: 1.12 } );
	for ( const x of [ - 0.72, 0.72 ] ) b.cyl( 0.3, 0.3, 0.2, 12, BLACK, T.rubber, { x, y: 0.3, axis: 'x' } );
	b.beam( [ 0, 0.5, - 1.0 ], [ 0, 0.45, - 1.8 ], 0.08, 0.08, 0x333333, T.iron );
	for ( const [ x, z ] of [ [ - 0.6, - 0.9 ], [ 0.6, - 0.9 ], [ - 0.6, 0.9 ], [ 0.6, 0.9 ] ] ) b.box( 0.06, 0.5, 0.06, 0x333333, T.iron, { x, y: 0.25, z } );
	b.cyl( 0.06, 0.09, 6.2, 8, GALV, T.galv, { y: 4.2, z: 0.6 } );
	b.box( 1.5, 0.1, 0.1, GALV, T.galv, { y: 7.2, z: 0.6 } );
	for ( const x of [ - 0.55, - 0.18, 0.18, 0.55 ] ) {
		b.box( 0.32, 0.32, 0.18, 0x2d2f30, T.iron, { x, y: 7.1, z: 0.72, rx: 0.3 } );
		b.box( 0.26, 0.26, 0.02, 0xd0d0c0, T.bulb, { x, y: 7.06, z: 0.82, rx: 0.3 } );
	}
	return b.build();
}

function bodyBag() {
	const b = new MB();
	b.sphere( 0.5, 12, 6, 0xffffff, T.tintShiny, { y: 0.14, sx: 0.55, sy: 0.3, sz: 1.85 } );
	b.sphere( 0.5, 8, 5, 0xffffff, T.tintShiny, { y: 0.2, z: - 0.72, sx: 0.4, sy: 0.3, sz: 0.4 } );
	b.box( 0.02, 0.01, 1.4, 0x9a9a9a, T.steel, { y: 0.285, z: 0.05 } );
	return b.build();
}

// a loose tyre standing on its tread, rolling along x
function tire() {
	const b = new MB();
	b.torus( 0.29, 0.11, 8, 16, 0x151515, T.rubber, { y: 0.4 } );
	b.cyl( 0.2, 0.2, 0.16, 12, 0x5a5a5a, T.steel, { y: 0.4, axis: 'z' } );
	return b.build();
}

function spikes() {
	const b = new MB();
	for ( let k = 0; k < 12; k ++ ) {
		const x = - 1.8 + ( k + 0.5 ) * 0.3;
		b.box( 0.3, 0.04, 0.05, 0x222222, T.iron, { x, y: 0.03, z: 0.1, ry: k % 2 ? 0.5 : - 0.5 } );
		b.box( 0.3, 0.04, 0.05, 0x222222, T.iron, { x, y: 0.03, z: - 0.1, ry: k % 2 ? - 0.5 : 0.5 } );
		b.cone( 0.012, 0.07, 4, 0xbbbbbb, T.steel, { x, y: 0.08 } );
	}
	b.box( 0.3, 0.1, 0.3, 0xd9531c, T.plastic, { x: - 1.95, y: 0.05 } );
	return b.build();
}

function cart() {
	const b = new MB();
	const C = 0xb5b8ba;
	const W = 0.54, D = 0.9, y0 = 0.45, y1 = 1.0;
	const corners = [ [ - W / 2, - D / 2 ], [ W / 2, - D / 2 ], [ W / 2, D / 2 ], [ - W / 2, D / 2 ] ];
	for ( let i = 0; i < 4; i ++ ) {
		const a = corners[ i ], c = corners[ ( i + 1 ) % 4 ];
		for ( const y of [ y0, y1, ( y0 + y1 ) / 2 ] ) b.beam( [ a[ 0 ], y, a[ 1 ] ], [ c[ 0 ], y, c[ 1 ] ], 0.015, 0.015, C, T.steel );
		b.beam( [ a[ 0 ], y0, a[ 1 ] ], [ a[ 0 ], y1, a[ 1 ] ], 0.015, 0.015, C, T.steel );
	}
	for ( let k = 1; k < 6; k ++ ) for ( const x of [ - W / 2, W / 2 ] ) b.beam( [ x, y0, - D / 2 + k * D / 6 ], [ x, y1, - D / 2 + k * D / 6 ], 0.01, 0.01, C, T.steel );
	b.beam( [ - W / 2, y1 + 0.05, D / 2 + 0.1 ], [ W / 2, y1 + 0.05, D / 2 + 0.1 ], 0.035, 0.035, 0xc1281c, T.plastic );
	for ( const x of [ - W / 2, W / 2 ] ) {
		b.beam( [ x, y1, D / 2 ], [ x, y1 + 0.05, D / 2 + 0.1 ], 0.02, 0.02, C, T.steel );
		b.beam( [ x * 0.8, 0.1, - D / 2 ], [ x, y0, - D / 2 ], 0.02, 0.02, C, T.steel );
		b.beam( [ x * 0.8, 0.1, D / 2 ], [ x, y0, D / 2 ], 0.02, 0.02, C, T.steel );
	}
	for ( const x of [ - 0.22, 0.22 ] ) for ( const z of [ - 0.42, 0.42 ] ) b.cyl( 0.05, 0.05, 0.03, 8, BLACK, T.rubber, { x, y: 0.05, z, axis: 'x' } );
	b.box( W, 0.01, D, 0x9a9da0, T.steel, { y: y0 } );
	return b.build();
}

function tent() {
	const b = new MB();
	const O = 0x4f5a3a, HX = 2.4, HZ = 1.9, WALL = 0.7, RIDGE = 2.25;
	const tri = [];
	for ( const s of [ - 1, 1 ] ) {
		// roof plane and side wall on each side (z = s * HZ)
		const p = ( x, y, z ) => [ x, y, z ];
		tri.push( p( - HX, WALL, s * HZ ), p( HX, WALL, s * HZ ), p( HX, RIDGE, 0 ), p( - HX, WALL, s * HZ ), p( HX, RIDGE, 0 ), p( - HX, RIDGE, 0 ) );
		tri.push( p( - HX, 0, s * HZ ), p( HX, 0, s * HZ ), p( HX, WALL, s * HZ ), p( - HX, 0, s * HZ ), p( HX, WALL, s * HZ ), p( - HX, WALL, s * HZ ) );
	}
	b.tris( tri, O, T.fabric, [ 0, 0.4, 0 ] );
	// gable ends: the -x end closed, the +x end dark (flaps tied open)
	for ( const s of [ - 1, 1 ] ) {
		const x = s * HX;
		const end = [ [ x, 0, - HZ ], [ x, 0, HZ ], [ x, WALL, HZ ], [ x, 0, - HZ ], [ x, WALL, HZ ], [ x, WALL, - HZ ], [ x, WALL, - HZ ], [ x, WALL, HZ ], [ x, RIDGE, 0 ] ];
		b.tris( end, s > 0 ? 0x161a12 : 0x48532f, T.fabric, [ 0, 0.4, 0 ] );
	}
	b.cyl( 0.04, 0.04, RIDGE, 6, 0x333, T.iron, { x: HX + 0.02, y: RIDGE / 2 } );
	return b.build();
}

// weld the duplicated vertices of a non-indexed three.js primitive (smooth normals over its facets)
function mergeVerts( g ) {
	const P = g.attributes.position, map = new Map(), pos = [], idx = [];
	for ( let i = 0; i < P.count; i ++ ) {
		const k = Math.round( P.getX( i ) * 1e4 ) + ',' + Math.round( P.getY( i ) * 1e4 ) + ',' + Math.round( P.getZ( i ) * 1e4 );
		let j = map.get( k );
		if ( j === undefined ) { j = pos.length / 3; map.set( k, j ); pos.push( P.getX( i ), P.getY( i ), P.getZ( i ) ); }
		idx.push( j );
	}
	g.dispose();
	const o = new THREE.BufferGeometry();
	o.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	o.setIndex( idx );
	return o;
}

// ---- registry ---------------------------------------------------------------------------------------------------------
// maxD: draw distance (m), cast: casts sun shadows in the near band

export const MODELS = {
	streetlight: { build: () => streetlight( false ), maxD: 620 },
	streetlight2: { build: () => streetlight( true ), maxD: 800 },
	pole: { build: () => utilityPole( 0 ), maxD: 560 },
	poleT: { build: () => utilityPole( 1 ), maxD: 560 },
	poleL: { build: () => utilityPole( 2 ), maxD: 560 },
	poleR: { build: () => utilityPole( 3 ), maxD: 560 },
	signal: { build: signalMast, maxD: 380 },
	signPost: { build: () => signPost( false ), maxD: 220 },
	signPostTall: { build: () => signPost( true ), maxD: 260 },
	hydrant: { build: hydrant, maxD: 130 },
	litter: { build: () => trashCan( 0 ), maxD: 130 },
	wheelie: { build: () => trashCan( 1 ), maxD: 170 },
	newsBox: { build: newsBox, maxD: 120 },
	shelter: { build: busShelter, maxD: 400 },
	bench: { build: bench, maxD: 170 },
	cone: { build: cone, maxD: 180 },
	sawhorse: { build: sawhorse, maxD: 260 },
	jersey: { build: jersey, maxD: 450 },
	sandbags: { build: sandbags, maxD: 260 },
	hesco: { build: hesco, maxD: 450 },
	razor: { build: razorWire, maxD: 160 },
	booth: { build: booth, maxD: 450 },
	trashBag: { build: trashBag, maxD: 150 },
	suitcase: { build: suitcase, maxD: 130 },
	cardboard: { build: cardboard, maxD: 140 },
	barrel: { build: barrel, maxD: 220 },
	milePost: { build: milePost, maxD: 220 },
	guidePosts: { build: () => guidePosts( 0 ), maxD: 700 },
	welcomePosts: { build: () => guidePosts( 1 ), maxD: 500 },
	meter: { build: meter, maxD: 110 },
	boomBase: { build: boomBase, maxD: 300 },
	boomArm: { build: boomArm, maxD: 300 },
	floodlight: { build: floodlight, maxD: 450 },
	bodyBag: { build: bodyBag, maxD: 140 },
	tire: { build: tire, maxD: 150 },
	spikes: { build: spikes, maxD: 110 },
	cart: { build: cart, maxD: 140 },
	tent: { build: tent, maxD: 450 },
};

const HYD = [ 0xd9ad1f, 0xb8231d ];
const NEWS = [ 0x1d4f91, 0xa3161b, 0xd6a312, 0xdcdcdc, 0x2e6b35 ];
const BAGS = [ 0x1c1c1c, 0x7a1a1a, 0x1a3a6a, 0x4a5a2a, 0xb0a080, 0x5a2a6a ];
const BARRELS = [ 0x2a4a8a, 0x8a2a1a, 0x3a5a2a, 0xa8a8a0 ];
const _col = new THREE.Color();
const tint = ( hex ) => { _col.setHex( hex ); return [ _col.r, _col.g, _col.b ]; };

// placement record -> [ { key, sx: scale mode ('u' uniform, 'x', 'y', null), tint: [r, g, b], flicker } ]
export function expandProp( type, param, seed ) {
	const one = ( key, o = {} ) => [ { key, ...o } ];
	switch ( type ) {
		case PROP.STREETLIGHT: return one( 'streetlight', { flicker: param } );
		case PROP.STREETLIGHT2: return one( 'streetlight2', { flicker: param } );
		case PROP.POLE: return one( param === 2 ? 'poleL' : param === 3 ? 'poleR' : 'pole' );
		case PROP.POLE_T: return one( 'poleT' );
		case PROP.SIGNAL: return one( 'signal' );
		case PROP.SIGN_POST: return one( param === 1 ? 'signPostTall' : 'signPost', { sx: 'y' } );
		case PROP.HYDRANT: return one( 'hydrant', { tint: tint( HYD[ param | 0 ] || HYD[ 0 ] ) } );
		case PROP.TRASH_CAN: return one( param ? 'wheelie' : 'litter', { tint: tint( param ? 0x2b3a2e : [ 0x2f4a36, 0x3a3f44, 0x24323f ][ Math.floor( seed * 3 ) ] ) } );
		case PROP.NEWS_BOX: return one( 'newsBox', { tint: tint( NEWS[ param | 0 ] || NEWS[ 0 ] ) } );
		case PROP.BUS_SHELTER: return one( 'shelter' );
		case PROP.BENCH: return one( 'bench' );
		case PROP.CONE: return one( 'cone' );
		case PROP.SAWHORSE: return one( 'sawhorse' );
		case PROP.JERSEY: return one( 'jersey' );
		case PROP.SANDBAGS: return one( 'sandbags' );
		case PROP.HESCO: return one( 'hesco' );
		case PROP.RAZOR: return one( 'razor' );
		case PROP.BOOTH: return one( 'booth', { tint: tint( 0x5d6444 ) } );
		case PROP.TRASH_BAG: return one( 'trashBag', { sx: 'u' } );
		case PROP.SUITCASE: return one( 'suitcase', { tint: tint( BAGS[ param | 0 ] || BAGS[ 0 ] ) } );
		case PROP.CARDBOARD: return one( 'cardboard', { sx: 'u' } );
		case PROP.BARREL: return one( 'barrel', { tint: tint( BARRELS[ Math.floor( seed * 4 ) ] ) } );
		case PROP.MILE_POST: return one( 'milePost' );
		case PROP.GUIDE_POSTS: return one( param === 1 ? 'welcomePosts' : 'guidePosts', { sx: 'x' } );
		case PROP.METER: return one( 'meter' );
		case PROP.BOOM: return [ { key: 'boomBase' }, { key: 'boomArm', sx: 'x' } ];
		case PROP.FLOODLIGHT: return one( 'floodlight' );
		case PROP.BODY_BAG: return one( 'bodyBag', { tint: tint( seed < 0.8 ? 0x141414 : 0xd8d8d0 ) } );
		case PROP.TIRE: return one( 'tire' );
		case PROP.SPIKES: return one( 'spikes' );
		case PROP.CART: return one( 'cart' );
		case PROP.TENT: return one( 'tent' );
		default: return [];
	}
}
