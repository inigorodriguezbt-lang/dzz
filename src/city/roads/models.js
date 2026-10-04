// Procedural street furniture models (one merged geometry each, vertex coloured, pbr-tagged) and how a
// placement record from the worker expands into model instances. Real-world sizes: US / Honolulu street hardware
// (cobra-head lights on galvanised davit poles, wooden utility poles with crossarms, porcelain insulators and pole-top
// transformers, mast-arm signals, Board of Water Supply hydrants, Type III barricades, 55 gal drums ...). The prop
// shader adds the wear per material class (meshkit T): grain and creosote on timber, chipped paint and rust runs on
// painted steel, white rust on galvanised steel, faded plastic, settled dust.
//
// Each model has a full build for the near band (shadows) and, where it pays, a light `lod` build for the far band.
//
// Conventions (match streetgen.js): origin at the base on the ground, +y up, the "front" faces local +z,
// arms of streetlights / signal masts reach along local +x, long things (barriers, booms, razor wire)
// run along local x.
import * as THREE from 'three';
import { MB, T } from './meshkit.js';
import { PROP } from './kinds.js';

const GALV = 0x8e9396, DARK = 0x2a2c2e, BLACK = 0x121212, ALU = 0xa3a8ab, CONC = 0x9a9890;

// ---- lamps, poles and signals -----------------------------------------------------------------------------

// a cobra-head luminaire on the end of an arm at ( x, y ), pointing along dir: a flattened teardrop housing with a
// prismatic refractor bowl underneath (the bowl is the "bulb" that lights up) and a photocell on top
function cobraHead( b, x, y, dir = 1, s = 1, lod = 0 ) {
	const L = 0.8 * s;
	if ( lod ) {
		b.box( L, 0.15 * s, 0.34 * s, ALU, T.alu, { x: x + dir * L * 0.45, y: y + 0.02 * s } );
		b.box( L * 0.7, 0.06 * s, 0.24 * s, 0xd8d4c4, T.bulb, { x: x + dir * L * 0.48, y: y - 0.07 * s } );
		return;
	}
	b.cyl( 0.045 * s, 0.05 * s, 0.2 * s, 8, ALU, T.alu, { x: x + dir * 0.08 * s, y, axis: 'x' } ); // slipfitter
	b.sphere( 0.5, 12, 6, ALU, T.alu, { x: x + dir * L * 0.5, y: y + 0.03 * s, sx: L, sy: 0.19 * s, sz: 0.36 * s } );
	b.box( L * 0.9, 0.02 * s, 0.3 * s, 0x7d8285, T.alu, { x: x + dir * L * 0.5, y: y - 0.005 * s } ); // door seam / latch rim
	b.sphere( 0.5, 12, 4, 0xd8d4c4, T.bulb, { x: x + dir * L * 0.53, y: y - 0.02 * s, sx: L * 0.66, sy: 0.13 * s, sz: 0.24 * s } );
	b.cyl( 0.032 * s, 0.035 * s, 0.05 * s, 8, 0x34383a, T.plastic, { x: x + dir * L * 0.66, y: y + 0.12 * s } ); // photocell
}

// a galvanised pole on a concrete footing: base plate, anchor nuts, handhole
function lightPole( b, H, lod ) {
	b.cyl( 0.22, 0.24, 0.45, lod ? 8 : 12, CONC, T.concrete, { y: 0.225 } );
	b.cyl( 0.068, 0.11, H - 0.45, lod ? 6 : 12, GALV, T.galv, { y: 0.45 + ( H - 0.45 ) / 2 }, true );
	if ( lod ) return;
	b.box( 0.3, 0.025, 0.3, 0x7d8285, T.galv, { y: 0.462 } );
	b.cyl( 0.12, 0.12, 0.06, 10, GALV, T.galv, { y: 0.5 }, true ); // base collar weld
	b.box( 0.07, 0.17, 0.03, 0x80868a, T.galv, { y: 1.0, z: 0.1 } ); // handhole cover
	b.box( 0.06, 0.09, 0.01, 0xc4b44a, T.shiny, { y: 2.2, z: 0.085 } ); // pole number plate
}

function streetlight( double, lod = 0 ) {
	const b = new MB();
	const H = double ? 10 : 8.2;
	lightPole( b, H, lod );
	for ( const dir of double ? [ 1, - 1 ] : [ 1 ] ) {
		// curved davit arm
		const n = lod ? 3 : 8;
		const pts = [];
		for ( let k = 0; k <= n; k ++ ) { const t = k / n; pts.push( [ dir * t * 2.25, H - 0.3 + Math.sin( t * Math.PI * 0.5 ) * 0.45 - t * t * 0.1, 0 ] ); }
		b.tube( pts, 0.045, lod ? 5 : 7, GALV, T.galv );
		cobraHead( b, dir * 2.18, H + 0.04, dir, 1, lod );
	}
	b.cyl( 0.072, 0.072, 0.05, lod ? 6 : 10, GALV, T.galv, { y: H } ); // pole cap
	return b.build();
}

// a pin insulator: the steel pin and a two-skirted porcelain body ( top at y0 + 0.13 )
function insulator( b, x, y0, z = 0, lod = 0 ) {
	if ( lod ) { b.cyl( 0.03, 0.05, 0.13, 5, 0xa9aba6, T.porcelain, { x, y: y0 + 0.065, z } ); return; }
	b.cyl( 0.012, 0.012, 0.06, 4, 0x5a5a58, T.iron, { x, y: y0 + 0.02, z } );
	b.lathe( [ [ 0.018, 0 ], [ 0.062, 0.03 ], [ 0.038, 0.055 ], [ 0.052, 0.08 ], [ 0.03, 0.115 ], [ 0.02, 0.13 ] ], 7, 0xb3b5b0, T.porcelain, { x, y: y0 + 0.03, z } );
}

// wooden utility pole (Hawaii: ~12 m class poles; here 10.1 m above ground): crossarm with braces and pin insulators,
// a pole-top pin, the comms messenger with a splice case, a pole tag, the ground wire, stapled flyers. variant: 0
// plain, 1 pole-top transformer, 2 / 3 a streetlight arm to the left / right. The wires hang from WIRE_PTS in
// streetgen.js ( crossarm ends ±1.05 m at 9.72, the top at 10.12, the comms cable at x 0.3, 7.4 ).
const WOOD = 0x5f4d3c;
function utilityPole( variant, lod = 0 ) {
	const b = new MB();
	b.cyl( 0.112, 0.152, 10.1, lod ? 7 : 12, WOOD, T.wood, { y: 5.05 } );
	b.box( 2.44, 0.095, 0.12, 0x6b5842, T.wood, { y: 9.6 } ); // crossarm
	for ( const s of [ - 1, 1 ] ) b.beam( [ s * 0.72, 9.56, 0 ], [ 0, 9.02, 0.07 ], lod ? 0.05 : 0.045, 0.012, 0x6c6e6c, T.galv );
	b.box( 0.14, 0.2, 0.05, 0x6c6e6c, T.galv, { y: 9.55, z: 0.085 } ); // crossarm gain plate
	for ( const x of [ - 1.05, 1.05 ] ) insulator( b, x, 9.59, 0, lod );
	insulator( b, 0, 9.99, 0, lod );
	if ( ! lod ) for ( const x of [ - 0.45, 0.45 ] ) insulator( b, x, 9.59, 0, lod );
	// comms messenger clamp and splice case
	b.box( 0.34, 0.06, 0.07, 0x4a4a48, T.iron, { x: 0.17, y: 7.43 } );
	b.cyl( 0.055, 0.055, lod ? 0.4 : 0.48, lod ? 5 : 8, 0x1b1b1b, T.plastic, { x: 0.3, y: 7.3, axis: 'z' } );
	if ( ! lod ) {
		b.box( 0.05, 0.3, 0.012, ALU, T.alu, { y: 1.9, z: 0.15 } ); // pole tag
		b.box( 0.025, 2.4, 0.02, 0x1d1d1d, T.plastic, { y: 1.3, z: - 0.15 } ); // ground wire moulding
		b.box( 0.012, 2.6, 0.012, 0x1d1d1d, T.plastic, { x: 0.05, y: 6.0, z: - 0.13 } ); // cable drop
		// lost-pet flyers and gig posters stapled to the pole
		const fl = [ [ 0x5ab8b0, 1.55, 0.6, 0.21, 0.28 ], [ 0xe8e4d6, 1.75, 2.3, 0.22, 0.3 ], [ 0xe6d24a, 1.35, 4.0, 0.2, 0.26 ] ];
		for ( const [ hex, y, a, w, h ] of fl.slice( 0, variant === 1 ? 1 : variant + 2 ) ) {
			const r = 0.142 - ( y - 1.3 ) * 0.004;
			b.box( w, h, 0.003, hex, T.fabric, { x: Math.sin( a ) * r, y, z: Math.cos( a ) * r, ry: a } );
		}
	}
	if ( variant === 1 ) {
		// pole-top transformer can on its bracket, with the primary bushing and a cutout fuse on the crossarm
		b.cyl( 0.25, 0.25, 0.86, lod ? 7 : 14, 0x7d8588, T.galv, { y: 8.32, z: 0.4 } );
		b.cyl( 0.27, 0.26, 0.06, lod ? 7 : 14, 0x6d7578, T.galv, { y: 8.78, z: 0.4 } );
		b.box( 0.12, 0.5, 0.18, 0x6d7578, T.galv, { y: 8.25, z: 0.16 } );
		if ( ! lod ) {
			for ( const x of [ - 0.1, 0.1 ] ) b.cyl( 0.028, 0.04, 0.16, 6, 0x6a5444, T.porcelain, { x, y: 8.88, z: 0.45 } );
			b.cyl( 0.03, 0.03, 0.08, 6, 0x6d7578, T.galv, { x: 0.2, y: 8.0, z: 0.62, axis: 'z' } ); // secondary bushing
			b.beam( [ 0.6, 9.55, 0.06 ], [ 0.72, 9.25, 0.12 ], 0.03, 0.03, 0x8a6a4a, T.porcelain ); // cutout
			b.beam( [ 0.66, 9.4, 0.1 ], [ 0.1, 8.95, 0.42 ], 0.012, 0.012, 0x222222, T.plastic ); // lead
		}
	}
	if ( variant === 2 || variant === 3 ) {
		const dir = variant === 2 ? - 1 : 1;
		b.box( 0.18, 0.12, 0.05, GALV, T.galv, { x: dir * 0.1, y: 7.7, z: 0.13 } );
		b.tube( [ [ dir * 0.12, 7.7, 0 ], [ dir * 0.9, 7.86, 0 ], [ dir * 1.5, 7.9, 0 ] ], 0.035, lod ? 5 : 7, GALV, T.galv );
		cobraHead( b, dir * 1.45, 7.86, dir, 0.75, lod );
	}
	return b.build();
}

// a dead traffic signal head facing +z: three 12" sections with tunnel visors on a black backplate with a yellow
// retroreflective border (FHWA practice)
function signalHead( b, x, y, z, lod = 0, housing = 0x262722 ) {
	b.box( 0.36, 1.06, 0.24, housing, T.plastic, { x, y, z } );
	if ( ! lod ) b.box( 0.56, 1.24, 0.025, 0x141414, T.plastic, { x, y, z: z - 0.13 } );
	if ( ! lod ) for ( const [ w, h, bx, by ] of [ [ 0.56, 0.05, 0, 0.6 ], [ 0.56, 0.05, 0, - 0.6 ], [ 0.05, 1.24, 0.255, 0 ], [ 0.05, 1.24, - 0.255, 0 ] ] ) b.box( w, h, 0.006, 0xd8b21c, T.shiny, { x: x + bx, y: y + by, z: z - 0.114 } );
	const cols = [ 0x3c0a08, 0x3a2905, 0x082a16 ];
	for ( let i = 0; i < 3; i ++ ) {
		const yy = y + 0.34 - i * 0.34;
		if ( lod ) { b.box( 0.24, 0.24, 0.01, cols[ i ], T.lens, { x, y: yy, z: z + 0.125 } ); continue; }
		b.add( new THREE.CircleGeometry( 0.125, 12 ), cols[ i ], T.lens, { x, y: yy, z: z + 0.122 } );
		// tunnel visor: an open half pipe over the lens, both faces
		for ( const flip of [ false, true ] ) {
			const g = new THREE.CylinderGeometry( 0.145, 0.145, 0.24, 9, 1, true, Math.PI / 2, Math.PI );
			g.rotateX( Math.PI / 2 );
			b.add( g, housing, T.plastic, { x, y: yy, z: z + 0.24, flip } );
		}
	}
}

// pedestrian signal (hand / walking person) and its push button
function pedHead( b, x, y, z, ry, lod ) {
	b.box( 0.34, 0.34, 0.2, 0x262722, T.plastic, { x, y, z, ry } );
	if ( lod ) return;
	const s = Math.sin( ry ), c = Math.cos( ry );
	b.box( 0.28, 0.28, 0.01, 0x2a1a10, T.lens, { x: x + s * 0.1, y, z: z + c * 0.1, ry } );
	b.box( 0.34, 0.03, 0.16, 0x262722, T.plastic, { x: x + s * 0.16, y: y + 0.16, z: z + c * 0.16, ry } );
}

function signalMast( lod = 0 ) {
	const b = new MB();
	b.cyl( 0.26, 0.28, 0.3, lod ? 8 : 14, CONC, T.concrete, { y: 0.15 } );
	b.cyl( 0.12, 0.17, 6.6, lod ? 7 : 14, 0x737877, T.galv, { y: 3.6 } );
	b.cyl( 0.13, 0.13, 0.12, lod ? 7 : 14, 0x737877, T.galv, { y: 6.95 } ); // pole cap
	if ( ! lod ) {
		b.box( 0.4, 0.03, 0.4, 0x6a6f70, T.galv, { y: 0.315 } );
		for ( const [ x, z ] of [ [ - 0.15, - 0.15 ], [ 0.15, - 0.15 ], [ - 0.15, 0.15 ], [ 0.15, 0.15 ] ] ) b.box( 0.045, 0.05, 0.045, 0x55595a, T.iron, { x, y: 0.35, z } );
		b.box( 0.09, 0.2, 0.03, 0x80868a, T.galv, { y: 0.9, z: 0.16 } ); // handhole
		b.box( 0.06, 0.3, 0.3, 0x6a6f70, T.galv, { x: 0.16, y: 6.15 } ); // arm flange plate
	}
	// the tapered mast arm over the lanes, a little upswept, with a tie rod
	const n = lod ? 2 : 5;
	const arm = [];
	for ( let k = 0; k <= n; k ++ ) { const t = k / n; arm.push( [ 0.18 + t * 7.4, 6.12 + t * 0.24 + Math.sin( t * Math.PI ) * 0.04, 0 ] ); }
	for ( let k = 0; k < n; k ++ ) b.tube( [ arm[ k ], arm[ k + 1 ] ], 0.1 - ( k + 0.5 ) / n * 0.045, lod ? 6 : 10, 0x737877, T.galv );
	b.beam( [ 0.1, 6.9, 0 ], [ 2.6, 6.24, 0 ], 0.035, 0.035, 0x737877, T.galv );
	for ( const x of [ 4.1, 6.9 ] ) {
		b.box( 0.05, 0.36, 0.05, 0x333333, T.iron, { x, y: 6.04 } );
		signalHead( b, x, 5.32, 0, lod );
	}
	signalHead( b, 0.02, 3.35, 0.3, lod ); // pedestal head on the pole
	pedHead( b, 0.24, 2.6, 0, Math.PI / 2, lod );
	pedHead( b, 0, 2.6, 0.24, 0, lod );
	if ( ! lod ) {
		// push button with its sign
		b.box( 0.11, 0.16, 0.08, 0xc9a227, T.paint, { y: 1.1, z: 0.19 } );
		b.cyl( 0.025, 0.025, 0.02, 8, 0x2a2a2a, T.steel, { y: 1.1, z: 0.235, axis: 'z' } );
		b.box( 0.23, 0.3, 0.01, 0xdedbd2, T.shiny, { y: 1.38, z: 0.18 } );
	}
	// street name blade hung under the mast arm on two clamps: green with a white border
	for ( const x of [ 1.9, 2.7 ] ) b.box( 0.04, 0.16, 0.04, 0x333333, T.iron, { x, y: 6.1 } );
	b.box( 1.2, 0.3, 0.025, 0xdedbd2, T.shiny, { x: 2.3, y: 5.9 } );
	b.box( 1.16, 0.26, 0.03, 0x12603a, T.shiny, { x: 2.3, y: 5.9 } );
	return b.build();
}

function signPost( tall ) {
	const b = new MB();
	const h = tall ? 2.95 : 2.45;
	// perforated square tube in a ground sleeve
	b.box( 0.05, h, 0.05, GALV, T.galv, { y: h / 2 } );
	b.box( 0.064, 0.25, 0.064, 0x7f8487, T.galv, { y: 0.125 } );
	b.box( 0.06, 0.02, 0.06, GALV, T.galv, { y: h } );
	return b.build();
}

// ---- street furniture ------------------------------------------------------------------------------------------

// Honolulu Board of Water Supply hydrant: flanged base, barrel with a break-off flange, domed bonnet with a pentagon
// operating nut, two hose nozzles and a pumper nozzle with caps
function hydrant( lod = 0 ) {
	const b = new MB();
	const CAP = 0xb8b8b0;
	if ( lod ) {
		b.cyl( 0.15, 0.16, 0.06, 8, 0xffffff, T.tint, { y: 0.03 } );
		b.cyl( 0.11, 0.12, 0.58, 8, 0xffffff, T.tint, { y: 0.33 } );
		b.sphere( 0.12, 8, 4, 0xffffff, T.tint, { y: 0.62, sy: 0.6 } );
		b.box( 0.4, 0.09, 0.09, 0xffffff, T.tint, { y: 0.42 } );
		return b.build();
	}
	b.cyl( 0.16, 0.17, 0.045, 12, 0xffffff, T.tint, { y: 0.022 } );
	b.lathe( [ [ 0.112, 0.04 ], [ 0.104, 0.12 ], [ 0.102, 0.3 ] ], 12, 0xffffff, T.tint );
	b.cyl( 0.13, 0.13, 0.045, 12, 0xffffff, T.tint, { y: 0.31 } ); // break-off flange
	b.lathe( [ [ 0.104, 0.33 ], [ 0.108, 0.5 ], [ 0.13, 0.55 ], [ 0.13, 0.575 ] ], 12, 0xffffff, T.tint );
	b.lathe( [ [ 0.125, 0.575 ], [ 0.105, 0.63 ], [ 0.06, 0.67 ], [ 0.03, 0.68 ] ], 12, CAP, T.paint ); // bonnet
	b.cyl( 0.032, 0.036, 0.055, 5, CAP, T.paint, { y: 0.705 } ); // operating nut
	for ( const s of [ - 1, 1 ] ) {
		b.cyl( 0.046, 0.05, 0.12, 10, 0xffffff, T.tint, { x: s * 0.15, y: 0.44, axis: 'x' } );
		b.cyl( 0.052, 0.052, 0.035, 5, CAP, T.paint, { x: s * 0.225, y: 0.44, axis: 'x' } );
		b.torus( 0.025, 0.004, 3, 5, 0x777770, T.steel, { x: s * 0.19, y: 0.38, rz: Math.PI / 2 } ); // cap chain
	}
	b.cyl( 0.07, 0.076, 0.11, 10, 0xffffff, T.tint, { y: 0.42, z: 0.15, axis: 'z' } );
	b.cyl( 0.08, 0.08, 0.04, 5, CAP, T.paint, { y: 0.42, z: 0.225, axis: 'z' } );
	return b.build();
}

function trashCan( variant, lod = 0 ) {
	const b = new MB();
	if ( variant === 0 ) {
		// city litter receptacle: slatted steel drum on a ring base, domed lid with a side opening, black liner
		if ( lod ) {
			b.cyl( 0.3, 0.29, 0.82, 10, 0xffffff, T.tint, { y: 0.5 } );
			b.sphere( 0.31, 10, 4, 0xffffff, T.tint, { y: 0.91, sy: 0.35 } );
			return b.build();
		}
		for ( let k = 0; k < 18; k ++ ) {
			const a = k / 18 * Math.PI * 2;
			b.box( 0.085, 0.76, 0.022, 0xffffff, T.tint, { x: Math.cos( a ) * 0.29, y: 0.52, z: Math.sin( a ) * 0.29, ry: - a + Math.PI / 2 } );
		}
		b.cyl( 0.27, 0.27, 0.78, 12, 0x151515, T.plastic, { y: 0.52 } ); // liner
		for ( const y of [ 0.16, 0.88 ] ) b.cyl( 0.305, 0.305, 0.05, 16, 0xffffff, T.tint, { y }, true );
		b.cyl( 0.22, 0.25, 0.14, 10, DARK, T.iron, { y: 0.07 } );
		b.sphere( 0.31, 16, 5, 0xffffff, T.tint, { y: 0.9, sy: 0.33 } );
		b.box( 0.28, 0.11, 0.06, 0x080808, T.plastic, { y: 0.97, z: 0.265, rx: - 0.35 } ); // opening
		b.box( 0.14, 0.09, 0.006, 0xd8d4c4, T.shiny, { y: 0.6, z: 0.31 } ); // city decal
		return b.build();
	}
	// 96 gal wheelie bin: tapered body, overhanging hinged lid, handle bar and wheels at the back
	b.taper( 0.56, 0.62, 0.6, 0.72, 0.96, 0xffffff, T.tintMatte, { y: 0.05 } );
	b.box( 0.64, 0.05, 0.78, 0xffffff, T.tintMatte, { y: 1.04, z: 0.01, rx: - 0.02 } );
	b.box( 0.62, 0.035, 0.04, 0xffffff, T.tintMatte, { y: 1.0, z: 0.39 } ); // lid lip
	if ( lod ) return b.build();
	b.cyl( 0.018, 0.018, 0.6, 6, 0x222222, T.plastic, { y: 1.0, z: - 0.42, axis: 'x' } ); // handle bar
	b.box( 0.6, 0.08, 0.06, 0xffffff, T.tintMatte, { y: 0.95, z: - 0.38 } ); // hinge block
	for ( const x of [ - 0.25, 0.25 ] ) {
		b.cyl( 0.1, 0.1, 0.06, 12, BLACK, T.rubber, { x, y: 0.1, z: - 0.33, axis: 'x' } );
		b.cyl( 0.05, 0.05, 0.065, 8, 0x555555, T.plastic, { x, y: 0.1, z: - 0.33, axis: 'x' } );
	}
	b.box( 0.5, 0.06, 0.04, 0xffffff, T.tintMatte, { y: 0.5, z: 0.35 } ); // front grip rib
	b.box( 0.2, 0.1, 0.005, 0xe8e4d6, T.shiny, { y: 0.75, z: 0.35, rx: - 0.05 } ); // address sticker
	return b.build();
}

// newspaper vending box on its pedestal: slanted top, window door with the day's paper behind it, coin mechanism
function newsBox() {
	const b = new MB();
	b.box( 0.07, 0.36, 0.07, DARK, T.iron, { y: 0.2 } );
	b.box( 0.34, 0.03, 0.28, DARK, T.iron, { y: 0.015 } );
	b.box( 0.4, 0.04, 0.34, DARK, T.iron, { y: 0.39 } );
	b.box( 0.5, 0.6, 0.44, 0xffffff, T.tint, { y: 0.71 } );
	b.box( 0.52, 0.05, 0.47, 0xffffff, T.tint, { y: 1.02, z: - 0.005, rx: 0.08 } ); // slanted lid
	b.box( 0.44, 0.34, 0.025, 0xffffff, T.tint, { y: 0.8, z: 0.225 } ); // door frame
	b.box( 0.36, 0.25, 0.02, 0x1d2428, T.glass, { y: 0.81, z: 0.236 } ); // window
	b.box( 0.33, 0.18, 0.01, 0xd8d0b0, T.fabric, { y: 0.78, z: 0.23 } ); // paper behind it
	b.box( 0.22, 0.03, 0.012, 0x222222, T.plastic, { y: 0.86, z: 0.232 } ); // headline
	b.box( 0.11, 0.17, 0.06, 0x9a9a9a, T.steel, { x: 0.16, y: 1.0, z: 0.22 } ); // coin mechanism
	b.box( 0.04, 0.012, 0.01, 0x111111, T.plastic, { x: 0.16, y: 1.05, z: 0.252 } );
	b.box( 0.3, 0.03, 0.03, 0x9a9a9a, T.steel, { y: 0.6, z: 0.25 } ); // handle
	b.box( 0.34, 0.12, 0.005, 0xffffff, T.shiny, { y: 0.5, z: 0.223 } ); // masthead plate
	return b.build();
}

// TheBus stop shelter: steel posts on base plates, a sloped roof with a fascia, glazed back and end, advertising panel,
// perforated bench
function busShelter( lod = 0 ) {
	const b = new MB();
	const FR = 0x3b4245;
	for ( const x of [ - 1.95, 1.95 ] ) for ( const z of [ - 0.65, 0.7 ] ) {
		b.box( 0.08, 2.5, 0.08, FR, T.paint, { x, y: 1.25, z } );
		if ( ! lod ) b.box( 0.18, 0.02, 0.18, FR, T.paint, { x, y: 0.01, z } );
	}
	b.box( 4.3, 0.08, 1.85, FR, T.paint, { y: 2.54, z: 0.05, rx: 0.04 } );
	b.box( 4.32, 0.22, 0.06, 0xd9a520, T.paint, { y: 2.47, z: - 0.86 } ); // fascia
	// the glazed back and end: frames and rails; the tempered panes have shattered (shelters are the first thing
	// broken) and left a fringe of shards in their frames
	b.box( 3.85, 0.05, 0.05, FR, T.paint, { y: 0.28, z: 0.7 } );
	b.box( 3.85, 0.05, 0.05, FR, T.paint, { y: 2.3, z: 0.7 } );
	for ( const x of [ - 0.65, 0.65 ] ) b.box( 0.05, 2.05, 0.05, FR, T.paint, { x, y: 1.3, z: 0.7 } );
	b.box( 0.05, 0.05, 1.25, FR, T.paint, { x: - 1.95, y: 0.28, z: 0.05 } );
	b.box( 0.05, 0.05, 1.25, FR, T.paint, { x: - 1.95, y: 2.3, z: 0.05 } );
	if ( ! lod ) {
		let sd = 11;
		const rnd = () => { sd = ( sd * 16807 ) % 2147483647; return sd / 2147483647; };
		const tri = [];
		// a pane from ( u0, v0 ) to ( u1, v1 ) in its plane; at( u, v ) -> [ x, y, z ]
		const pane = ( u0, u1, v0, v1, at, keep ) => {
			const W = u1 - u0;
			for ( const [ v, dir, hmax ] of [ [ v0, 1, 0.32 ], [ v1, - 1, 0.14 ] ] ) {
				// a jagged fringe along the rail: teeth of random height, a few long daggers
				const n = Math.max( 3, Math.round( W / 0.11 ) );
				for ( let k = 0; k < n; k ++ ) {
					const a = u0 + W * k / n, c = u0 + W * ( k + 1 ) / n;
					const h = ( rnd() < 0.15 ? 2.2 : 1 ) * hmax * ( 0.15 + 0.85 * rnd() ) * keep;
					tri.push( at( a, v ), at( c, v ), at( a + ( c - a ) * rnd(), v + dir * h ) );
				}
			}
			// corners that held
			for ( const [ u, v, du, dv ] of [ [ u0, v0, 1, 1 ], [ u1, v1, - 1, - 1 ] ] ) if ( rnd() < 0.7 ) tri.push( at( u, v ), at( u + du * ( 0.15 + 0.3 * rnd() ), v ), at( u, v + dv * ( 0.2 + 0.4 * rnd() ) ) );
		};
		const back = ( u, v ) => [ u, v, 0.7 ], end = ( u, v ) => [ - 1.95, v, u ];
		pane( - 1.9, - 0.675, 0.305, 2.275, back, 1 );
		pane( - 0.625, 0.625, 0.305, 2.275, back, 0.6 );
		pane( 0.675, 1.9, 0.305, 2.275, back, 1.2 );
		pane( - 0.6, 0.65, 0.305, 2.275, end, 0.8 );
		// both faces (a pane has no thickness)
		const two = [];
		for ( let i = 0; i < tri.length; i += 3 ) two.push( tri[ i ], tri[ i + 1 ], tri[ i + 2 ], tri[ i ], tri[ i + 2 ], tri[ i + 1 ] );
		b.tris( two, 0x8fa4a8, T.glass );
		b.box( 0.6, 0.12, 0.006, 0x1d6db5, T.shiny, { x: - 1.4, y: 2.45, z: - 0.893 } ); // TheBus logo plate
	}
	// advertising case at the open end, a faded tourism poster on both faces (sea, sand, sun, headline)
	b.box( 0.14, 1.85, 1.3, FR, T.paint, { x: 1.95, y: 1.2, z: 0.05 } );
	for ( const s of [ - 1, 1 ] ) {
		const x = 1.95 + s * 0.072;
		b.box( 0.006, 1.6, 1.1, 0xd9cfa8, T.shiny, { x, y: 1.25, z: 0.05 } );
		if ( lod ) continue;
		b.box( 0.006, 0.82, 1.06, 0x3f93b0, T.shiny, { x: x + s * 0.002, y: 1.6, z: 0.05 } );
		b.box( 0.006, 0.12, 1.06, 0x2a6f8f, T.shiny, { x: x + s * 0.003, y: 1.25, z: 0.05 } );
		b.cyl( 0.16, 0.16, 0.006, 12, 0xeea23a, T.shiny, { x: x + s * 0.004, y: 1.72, z: 0.05 + s * 0.22, axis: 'x' } );
		b.box( 0.006, 0.1, 0.8, 0xf2f0e8, T.shiny, { x: x + s * 0.004, y: 1.92, z: 0.05 } );
		b.box( 0.006, 0.05, 0.5, 0x2a2622, T.shiny, { x: x + s * 0.004, y: 0.68, z: 0.05 } );
		b.box( 0.006, 0.12, 0.12, 0xb8231d, T.shiny, { x: x + s * 0.004, y: 0.6, z: 0.05 - s * 0.38 } );
	}
	// perforated steel bench
	b.box( 2.4, 0.04, 0.42, 0x6b7275, T.steel, { y: 0.46, z: 0.4 } );
	if ( ! lod ) b.box( 2.4, 0.3, 0.03, 0x6b7275, T.steel, { y: 0.66, z: 0.62, rx: - 0.12 } );
	for ( const x of [ - 1.0, 0, 1.0 ] ) b.box( 0.05, 0.44, 0.35, FR, T.paint, { x, y: 0.22, z: 0.42 } );
	return b.build();
}

// park bench: cast iron ends, five seat slats and three back slats
function bench() {
	const b = new MB();
	const WD = 0x7a5836;
	for ( let k = 0; k < 4; k ++ ) b.box( 1.8, 0.035, 0.085, WD, T.wood, { y: 0.44, z: 0.17 - k * 0.1 } );
	for ( let k = 0; k < 3; k ++ ) b.box( 1.8, 0.085, 0.03, WD, T.wood, { y: 0.56 + k * 0.12, z: - 0.2 - k * 0.022, rx: - 0.18 } );
	for ( const x of [ - 0.78, 0.78 ] ) {
		b.beam( [ x, 0, 0.2 ], [ x, 0.43, 0.15 ], 0.06, 0.045, BLACK, T.iron );
		b.beam( [ x, 0, - 0.23 ], [ x, 0.9, - 0.27 ], 0.06, 0.045, BLACK, T.iron );
		b.box( 0.06, 0.05, 0.48, BLACK, T.iron, { x, y: 0.41, z: - 0.02 } );
		b.beam( [ x, 0.64, - 0.24 ], [ x, 0.64, 0.18 ], 0.06, 0.04, BLACK, T.iron ); // armrest
		b.beam( [ x, 0.64, 0.18 ], [ x, 0.43, 0.19 ], 0.045, 0.04, BLACK, T.iron );
		b.box( 0.1, 0.02, 0.08, BLACK, T.iron, { x, y: 0.01, z: 0.2 } ); // feet
		b.box( 0.1, 0.02, 0.08, BLACK, T.iron, { x, y: 0.01, z: - 0.23 } );
	}
	return b.build();
}

// 28" traffic cone: square base, two reflective collars
function cone() {
	const b = new MB();
	b.box( 0.38, 0.035, 0.38, 0x1b1b1b, T.rubber, { y: 0.018 } );
	b.lathe( [ [ 0.16, 0.035 ], [ 0.03, 0.71 ], [ 0.0, 0.715 ] ], 12, 0xd9531c, T.plastic );
	b.cyl( 0.084, 0.104, 0.11, 12, 0xe4e4e0, T.shiny, { y: 0.44 }, true );
	b.cyl( 0.061, 0.073, 0.06, 12, 0xe4e4e0, T.shiny, { y: 0.585 }, true );
	return b.build();
}

// Type III barricade: A-frame legs, three diagonally striped rails, a dead warning light
function sawhorse( lod = 0 ) {
	const b = new MB();
	for ( const x of [ - 0.95, 0.95 ] ) {
		for ( const s of [ - 1, 1 ] ) b.beam( [ x, 1.12, 0 ], [ x, 0, s * 0.34 ], 0.05, 0.05, 0xd6d0c4, T.plastic );
		if ( ! lod ) for ( const s of [ - 1, 1 ] ) b.box( 0.12, 0.04, 0.16, 0x2a2a2a, T.rubber, { x, y: 0.02, z: s * 0.34 } );
		b.box( 0.06, 0.05, 0.52, 0xd6d0c4, T.plastic, { x, y: 0.3 } );
	}
	// rails: orange and white stripes sloping to the middle (shader)
	for ( const y of [ 1.0, 0.7, 0.4 ] ) b.box( 2.4, 0.2, 0.025, 0xd65a14, T.stripes, { y, z: 0.03 } );
	if ( ! lod ) {
		b.cyl( 0.08, 0.08, 0.05, 10, 0xe2b400, T.bulb, { x: 0.9, y: 1.22, z: 0.03, axis: 'z' } ); // warning light
		b.box( 0.12, 0.12, 0.05, 0x1a1a1a, T.plastic, { x: 0.9, y: 1.22 } );
	}
	return b.build();
}

// concrete Jersey barrier, 3 m along x: lifting holes, drain slots, end connectors
const JP = [ [ - 0.3, 0 ], [ 0.3, 0 ], [ 0.3, 0.08 ], [ 0.17, 0.33 ], [ 0.09, 0.81 ], [ - 0.09, 0.81 ], [ - 0.17, 0.33 ], [ - 0.3, 0.08 ] ];
function jersey( lod = 0 ) {
	const b = new MB();
	b.extrudeX( JP, - 1.5, 1.5, 0xaaa69c, T.concrete );
	if ( lod ) return b.build();
	for ( const x of [ - 1.0, 1.0 ] ) for ( const s of [ - 1, 1 ] ) b.box( 0.18, 0.1, 0.02, 0x3a3936, T.concrete, { x, y: 0.62, z: s * 0.115, rx: s * 0.17 } ); // lifting holes
	for ( const x of [ - 1.3, 1.3 ] ) for ( const s of [ - 1, 1 ] ) b.box( 0.22, 0.07, 0.02, 0x4a4844, T.concrete, { x, y: 0.035, z: s * 0.3 } ); // drain slots
	for ( const x of [ - 1.5, 1.5 ] ) b.box( 0.06, 0.12, 0.12, 0x5a3a28, T.iron, { x, y: 0.55 } ); // rusty connector loops
	return b.build();
}

// a sandbag: a pillow (a flattened sphere with squared ends)
function bag( b, x, y, z, ry, hex, lod ) {
	const g = new THREE.SphereGeometry( 0.5, lod ? 5 : 7, lod ? 3 : 4 );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {
		const px = p.getX( i ), py = p.getY( i ), pz = p.getZ( i );
		p.setXYZ( i, Math.sign( px ) * Math.min( 0.5, Math.abs( px ) * 1.25 ), Math.sign( py ) * Math.min( 0.5, Math.abs( py ) * 1.3 ), pz );
	}
	g.computeVertexNormals();
	b.add( g, hex, T.fabric, { x, y, z, ry, sx: 0.5, sy: 0.2, sz: 0.32 } );
}
function sandbags( lod = 0 ) {
	// a 2 m x 0.9 m wall of bags laid like bricks, two bags deep (the far band: the front row only)
	const b = new MB();
	let s = 7;
	const rnd = () => { s = ( s * 16807 ) % 2147483647; return s / 2147483647; };
	const cols = [ 0xa99b76, 0x9d8f6b, 0xb3a57e, 0x8f8462 ];
	for ( let row = 0; row < 4; row ++ ) for ( const z of lod ? [ 0.17 ] : [ - 0.17, 0.17 ] ) {
		const off = ( row % 2 ) * 0.25;
		for ( let x = - 1.0 + 0.25 + off; x < 1.0 - 0.2; x += 0.5 ) {
			const c = cols[ Math.floor( rnd() * 4 ) ];
			bag( b, x + ( rnd() - 0.5 ) * 0.04, 0.1 + row * 0.215, z + ( rnd() - 0.5 ) * 0.03, ( rnd() - 0.5 ) * 0.15, c, lod );
		}
	}
	if ( lod ) b.box( 2.0, 0.86, 0.3, 0x8f8462, T.fabric, { y: 0.43, z: - 0.15 } );
	return b.build();
}

// HESCO bastion: geotextile-lined welded-mesh cube filled with sand (the mesh is the shader's), coil hinges at the corners
function hesco() {
	const b = new MB();
	const S = 1.06, H = 1.37;
	b.box( S, H - 0.02, S, 0xa38f6c, T.hesco, { y: H / 2 - 0.01 } );
	b.box( S - 0.06, 0.03, S - 0.06, 0x8f7a58, T.sand, { y: H - 0.03 } );
	for ( const x of [ - S / 2, S / 2 ] ) for ( const z of [ - S / 2, S / 2 ] ) b.cyl( 0.014, 0.014, H, 4, 0x7d7f7a, T.galv, { x, y: H / 2, z } );
	return b.build();
}

// concertina coil, 5 m along x: a flat ribbon whose width jumps at every barb
function razorWire() {
	const b = new MB();
	const R = 0.45, loops = 22, segs = 10, L = 5;
	const pts = [];
	for ( let k = 0; k <= loops * segs; k ++ ) {
		const t = k / segs * Math.PI * 2;
		const x = - L / 2 + k / ( loops * segs ) * L + Math.sin( t ) * 0.06;
		pts.push( [ x, R + Math.sin( t ) * R * 0.98, Math.cos( t ) * R ] );
	}
	const tri = [];
	for ( let k = 0; k < pts.length - 1; k ++ ) {
		const a = pts[ k ], c = pts[ k + 1 ];
		const wa = k % 2 ? 0.035 : 0.01, wc = ( k + 1 ) % 2 ? 0.035 : 0.01;
		const a2 = [ a[ 0 ] + wa, a[ 1 ], a[ 2 ] ], c2 = [ c[ 0 ] + wc, c[ 1 ], c[ 2 ] ];
		tri.push( a, c, a2, a2, c, c2, a, a2, c, a2, c2, c );
	}
	b.tris( tri, 0x9a9da0, T.steel );
	// the pickets that hold it
	for ( const x of [ - 2.2, 0, 2.2 ] ) b.box( 0.04, 1.0, 0.04, 0x4a4d3c, T.iron, { x, y: 0.5 } );
	return b.build();
}

// guard booth: steel lower walls, a band of windows with mullions, a door, an overhanging roof, a lamp
function booth( lod = 0 ) {
	const b = new MB();
	const W = 0xffffff;
	b.box( 2.0, 1.0, 2.0, W, T.tintMatte, { y: 0.5 } );
	b.box( 1.9, 1.1, 1.9, 0x2a3236, T.glass, { y: 1.55 } );
	for ( const [ x, z ] of [ [ - 0.96, - 0.96 ], [ 0.96, - 0.96 ], [ - 0.96, 0.96 ], [ 0.96, 0.96 ] ] ) b.box( 0.1, 1.2, 0.1, W, T.tintMatte, { x, y: 1.6, z } );
	if ( ! lod ) for ( const s of [ - 1, 1 ] ) {
		b.box( 0.05, 1.1, 0.05, W, T.tintMatte, { x: s * 0.33, y: 1.55, z: 0.96 } );
		b.box( 0.05, 1.1, 0.05, W, T.tintMatte, { x: s * 0.33, y: 1.55, z: - 0.96 } );
		b.box( 0.05, 1.1, 0.05, W, T.tintMatte, { x: s * 0.96, y: 1.55, z: 0 } );
	}
	b.box( 2.1, 0.35, 2.1, W, T.tintMatte, { y: 2.28 } );
	b.box( 2.5, 0.1, 2.5, 0x3a3d3a, T.iron, { y: 2.5 } );
	b.box( 0.8, 1.95, 0.05, 0x3d4035, T.paint, { x: 0.45, y: 0.99, z: 1.01 } ); // door
	if ( ! lod ) {
		b.box( 0.5, 0.6, 0.02, 0x2a3236, T.glass, { x: 0.45, y: 1.5, z: 1.04 } );
		b.box( 0.03, 0.12, 0.05, 0x999999, T.steel, { x: 0.12, y: 1.0, z: 1.05 } );
		b.box( 0.9, 0.12, 0.4, CONC, T.concrete, { x: 0.45, y: 0.06, z: 1.2 } ); // step
		b.box( 0.3, 0.18, 0.2, 0x444444, T.iron, { x: - 0.7, y: 2.25, z: 1.13 } ); // lamp
		b.box( 0.24, 0.04, 0.16, 0xd0d0c0, T.bulb, { x: - 0.7, y: 2.15, z: 1.13 } );
		b.box( 0.6, 0.4, 0.45, 0xa0a39a, T.paint, { x: - 1.25, y: 1.6, z: 0 } ); // AC unit
	}
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
	for ( const s of [ - 1, 1 ] ) b.cone( 0.03, 0.1, 5, 0x141414, [ 0.3, 0, 0 ], { x: s * 0.05, y: 0.56, rz: - s * 0.9 } ); // tied ears
	return b.build();
}

// hard-shell spinner suitcase: bumper frame, zip line, telescoping handle, carry handle, four spinner wheels
function suitcase() {
	const b = new MB();
	b.box( 0.44, 0.62, 0.24, 0xffffff, T.tintShiny, { y: 0.37 } );
	b.box( 0.46, 0.64, 0.025, 0x222222, T.plastic, { y: 0.37 } ); // zip / seam frame
	for ( const x of [ - 0.12, 0.12 ] ) b.box( 0.06, 0.58, 0.012, 0xffffff, T.tintShiny, { x, y: 0.37, z: 0.125 } ); // ribs
	for ( const x of [ - 0.1, 0.1 ] ) b.box( 0.025, 0.16, 0.025, 0x333333, T.alu, { x, y: 0.76, z: - 0.08 } );
	b.box( 0.24, 0.03, 0.04, 0x222222, T.plastic, { y: 0.845, z: - 0.08 } );
	b.box( 0.03, 0.14, 0.03, 0x222222, T.plastic, { x: 0.235, y: 0.45 } ); // side carry handle
	for ( const x of [ - 0.18, 0.18 ] ) for ( const z of [ - 0.08, 0.08 ] ) {
		b.box( 0.04, 0.04, 0.04, 0x222222, T.plastic, { x, y: 0.055, z } );
		b.cyl( 0.025, 0.025, 0.02, 8, BLACK, T.rubber, { x, y: 0.028, z, axis: 'x' } );
	}
	return b.build();
}

function cardboard() {
	const b = new MB();
	b.box( 0.5, 0.38, 0.42, 0x9c7a4d, T.fabric, { y: 0.19 } );
	b.box( 0.5, 0.005, 0.07, 0xc9b78d, T.shiny, { y: 0.383 } ); // tape
	b.box( 0.5, 0.01, 0.2, 0x8e6e44, T.fabric, { y: 0.44, z: 0.26, rx: 0.9 } );
	b.box( 0.5, 0.01, 0.2, 0x8e6e44, T.fabric, { y: 0.43, z: - 0.25, rx: - 1.1 } );
	b.box( 0.18, 0.12, 0.003, 0x2a2a2a, T.fabric, { x: - 0.1, y: 0.2, z: 0.211 } ); // printed mark
	b.box( 0.12, 0.08, 0.003, 0xe8e4d6, T.fabric, { x: 0.14, y: 0.27, z: 0.211 } ); // shipping label
	return b.build();
}

// 55 gal steel drum: rolling hoops, chimes top and bottom, two bungs in the lid
function barrel( lod = 0 ) {
	const b = new MB();
	const seg = lod ? 8 : 14;
	b.cyl( 0.286, 0.286, 0.84, seg, 0xffffff, T.tint, { y: 0.44 } );
	for ( const y of [ 0.3, 0.59 ] ) b.cyl( 0.297, 0.297, 0.03, seg, 0xffffff, T.tint, { y } );
	if ( lod ) return b.build();
	for ( const y of [ 0.02, 0.865 ] ) b.cyl( 0.292, 0.292, 0.035, seg, 0xffffff, T.tint, { y } ); // chimes
	b.cyl( 0.27, 0.27, 0.01, seg, 0xffffff, T.tint, { y: 0.855 } );
	b.cyl( 0.03, 0.03, 0.02, 6, 0x888888, T.steel, { x: 0.17, y: 0.87 } );
	b.cyl( 0.02, 0.02, 0.02, 6, 0x888888, T.steel, { x: - 0.18, y: 0.87 } );
	b.box( 0.22, 0.16, 0.004, 0xe8e4d6, T.shiny, { y: 0.45, z: 0.288 } ); // hazard label
	return b.build();
}

// Hawaii mile marker: a green post with its reflector (the number plate is a sign board)
function milePost() {
	const b = new MB();
	b.box( 0.07, 1.22, 0.05, 0x1e5a38, T.paint, { y: 0.61 } );
	b.box( 0.06, 0.1, 0.02, 0xd8d8d0, T.shiny, { y: 0.72, z: 0.03 } );
	b.box( 0.09, 0.15, 0.07, 0x5b5a54, T.concrete, { y: 0.07 } );
	return b.build();
}

function guidePosts( variant ) {
	const b = new MB();
	const h = variant ? 2.95 : 4.25;
	for ( const x of [ - 2.2, 2.2 ] ) {
		if ( variant ) {
			b.box( 0.14, h, 0.14, 0x5b3d22, T.wood, { x, y: h / 2 } );
			b.box( 0.16, 0.04, 0.16, 0x4a3220, T.wood, { x, y: h } );
		} else {
			// W-beam posts on breakaway slip bases
			b.box( 0.12, h, 0.02, GALV, T.galv, { x, y: h / 2, z: - 0.05 } );
			b.box( 0.12, h, 0.02, GALV, T.galv, { x, y: h / 2, z: - 0.13 } );
			b.box( 0.02, h, 0.1, GALV, T.galv, { x, y: h / 2, z: - 0.09 } );
			b.box( 0.26, 0.03, 0.2, 0x7d8285, T.galv, { x, y: 0.28, z: - 0.09 } );
			b.box( 0.26, 0.03, 0.2, 0x7d8285, T.galv, { x, y: 0.24, z: - 0.09 } );
			b.cyl( 0.22, 0.24, 0.25, 10, CONC, T.concrete, { x, y: 0.1, z: - 0.09 } );
		}
	}
	return b.build();
}

// single-space parking meter: post, vault, domed head with two windows, coin slot, handle
function meter() {
	const b = new MB();
	b.cyl( 0.035, 0.04, 1.02, 8, 0x4a4d50, T.iron, { y: 0.51 } );
	b.box( 0.1, 0.06, 0.1, 0x3a3d3f, T.iron, { y: 0.02 } );
	b.box( 0.18, 0.24, 0.14, 0x55595c, T.paint, { y: 1.12 } ); // vault
	b.lathe( [ [ 0.0, 1.24 ], [ 0.1, 1.25 ], [ 0.11, 1.33 ], [ 0.1, 1.42 ], [ 0.06, 1.47 ], [ 0.0, 1.48 ] ], 12, 0x9aa0a4, T.paint, { sz: 0.78 } );
	b.box( 0.12, 0.07, 0.02, 0x9ab0a8, T.glass, { y: 1.38, z: 0.075 } );
	b.box( 0.12, 0.07, 0.02, 0x9ab0a8, T.glass, { y: 1.38, z: - 0.075 } );
	b.box( 0.02, 0.05, 0.03, 0x111111, T.plastic, { x: 0.08, y: 1.3, z: 0.05 } ); // coin slot
	b.cyl( 0.025, 0.025, 0.04, 8, 0xb0b0b0, T.steel, { x: 0.105, y: 1.27, axis: 'x' } ); // handle
	b.box( 0.12, 0.06, 0.005, 0xd9a520, T.shiny, { y: 1.08, z: 0.073 } ); // time-limit plate
	return b.build();
}

// boom barrier: the drive cabinet on a plinth (tapered, with a hooded top, the door and its lock), the pivot hub with
// the arm clamp on the road side and the counterweight behind it
function boomBase() {
	const b = new MB();
	const Y = 0xd4a020, HUB = 0x3a3c3e;
	b.box( 0.5, 0.08, 0.44, CONC, T.concrete, { y: 0.04 } );
	b.box( 0.36, 0.02, 0.3, 0x55595c, T.galv, { y: 0.09 } ); // base flange
	b.taper( 0.32, 0.28, 0.29, 0.26, 0.86, Y, T.paint, { y: 0.1 } );
	b.box( 0.34, 0.05, 0.31, Y, T.paint, { y: 0.985, rx: 0.06 } ); // hooded top
	b.box( 0.006, 0.6, 0.2, 0x8c6a14, T.paint, { x: - 0.151, y: 0.5 } ); // door seam
	b.box( 0.006, 0.56, 0.17, Y, T.paint, { x: - 0.153, y: 0.5 } );
	b.cyl( 0.012, 0.012, 0.02, 8, 0xb0b0b0, T.steel, { x: - 0.16, y: 0.62, z: 0.06, axis: 'x' } ); // lock
	b.box( 0.006, 0.08, 0.2, 0x1a1a1a, T.plastic, { x: - 0.152, y: 0.85 } ); // vent
	// pivot: hub disc, shaft, the arm clamp reaching out over the road, the counterweight plate behind
	b.cyl( 0.11, 0.11, 0.07, 14, HUB, T.iron, { x: 0.18, y: 0.92, axis: 'x' } );
	b.cyl( 0.03, 0.03, 0.05, 8, 0x8a8d90, T.steel, { x: 0.235, y: 0.92, axis: 'x' } );
	b.box( 0.26, 0.13, 0.09, 0xb4b8bb, T.alu, { x: 0.33, y: 0.92 } );
	b.cyl( 0.03, 0.03, 0.08, 8, 0x8a8d90, T.steel, { x: - 0.19, y: 0.92, axis: 'x' } );
	b.box( 0.07, 0.24, 0.2, 0x2a2b2c, T.iron, { x: - 0.25, y: 0.9 } ); // counterweight
	return b.build();
}
// unit-length arm along +x (scaled by the boom length): a flattened aluminium tube in red and white bands, a rubber tip
function boomArm() {
	const b = new MB();
	const n = 10, x0 = 0.05;
	for ( let k = 0; k < n; k ++ ) b.cyl( 0.05, 0.05, ( 1 - x0 ) / n, 8, k % 2 ? 0xe8e8e2 : 0xc1281c, T.shiny, { x: x0 + ( k + 0.5 ) * ( 1 - x0 ) / n, y: 0.92, axis: 'x', sz: 0.65 } );
	b.cyl( 0.052, 0.052, 0.012, 8, BLACK, T.rubber, { x: 1.0, y: 0.92, axis: 'x', sz: 0.66 } );
	return b.build();
}

// light tower trailer: generator box on a single axle, tongue and outrigger jacks, telescoping mast, four lamp heads
function floodlight( lod = 0 ) {
	const b = new MB();
	const Y = 0xd8a41c;
	b.box( 1.3, 0.7, 2.0, Y, T.paint, { y: 0.75 } );
	b.box( 1.34, 0.08, 2.04, 0x333333, T.iron, { y: 1.12 } );
	for ( const x of [ - 0.72, 0.72 ] ) {
		b.cyl( 0.3, 0.3, 0.2, lod ? 8 : 14, BLACK, T.rubber, { x, y: 0.3, axis: 'x' } );
		if ( ! lod ) b.cyl( 0.17, 0.17, 0.21, 10, 0x777777, T.steel, { x, y: 0.3, axis: 'x' } );
		if ( ! lod ) b.box( 0.24, 0.05, 0.75, Y, T.paint, { x: x * 1.02, y: 0.62 } ); // fender
	}
	b.beam( [ 0, 0.5, - 1.0 ], [ 0, 0.45, - 1.8 ], 0.08, 0.08, 0x333333, T.iron );
	for ( const [ x, z ] of [ [ - 0.6, - 0.9 ], [ 0.6, - 0.9 ], [ - 0.6, 0.9 ], [ 0.6, 0.9 ] ] ) b.box( 0.06, 0.5, 0.06, 0x333333, T.iron, { x, y: 0.25, z } );
	if ( ! lod ) {
		for ( let k = 0; k < 6; k ++ ) b.box( 0.006, 0.3, 0.04, 0x222222, T.iron, { x: 0.652, y: 0.8, z: - 0.5 + k * 0.08 } ); // louvres
		b.box( 0.006, 0.25, 0.35, 0xe8e4d6, T.shiny, { x: - 0.652, y: 0.8, z: 0.3 } ); // rental decal
	}
	b.cyl( 0.06, 0.09, 6.2, lod ? 6 : 10, GALV, T.galv, { y: 4.2, z: 0.6 } );
	b.box( 1.5, 0.1, 0.1, GALV, T.galv, { y: 7.2, z: 0.6 } );
	for ( const x of [ - 0.55, - 0.18, 0.18, 0.55 ] ) {
		b.box( 0.32, 0.32, 0.18, 0x2d2f30, T.iron, { x, y: 7.1, z: 0.72, rx: 0.3 } );
		b.box( 0.26, 0.26, 0.02, 0xd0d0c0, T.bulb, { x, y: 7.06, z: 0.82, rx: 0.3 } );
	}
	return b.build();
}

// a filled body bag lying on the ground, head at -z: heavy vinyl slumped over the body (head, shoulders, chest, hips,
// legs, the feet tenting it up), flat underneath, a U-shaped zip and webbing handles
const BAG_W = [ [ - 0.95, 0.1, 0.06 ], [ - 0.85, 0.2, 0.14 ], [ - 0.68, 0.19, 0.15 ], [ - 0.55, 0.27, 0.15 ], [ - 0.42, 0.3, 0.2 ], [ - 0.15, 0.29, 0.21 ], [ 0.1, 0.28, 0.19 ], [ 0.35, 0.24, 0.14 ], [ 0.6, 0.2, 0.12 ], [ 0.8, 0.18, 0.17 ], [ 0.93, 0.13, 0.13 ], [ 0.98, 0.06, 0.05 ] ];
function bodyBag() {
	const b = new MB();
	// lofted half-ellipse sections ( z, half width, height ), the top a little flattened like slack vinyl
	const seg = 10, rows = BAG_W.length;
	const g = new THREE.BufferGeometry(), pos = [], idx = [];
	for ( const [ z, w, h ] of BAG_W ) for ( let k = 0; k <= seg; k ++ ) {
		const a = Math.PI * k / seg, c = Math.cos( a ), s = Math.sin( a );
		pos.push( c * w * ( 1 + 0.06 * s ), Math.pow( s, 0.75 ) * h + 0.005, z );
	}
	for ( let r = 0; r < rows - 1; r ++ ) for ( let k = 0; k < seg; k ++ ) {
		const i = r * ( seg + 1 ) + k, j = i + seg + 1;
		idx.push( i, i + 1, j, i + 1, j + 1, j );
	}
	// close the ends
	for ( const r of [ 0, rows - 1 ] ) for ( let k = 1; k < seg; k ++ ) {
		const o = r * ( seg + 1 );
		if ( r ) idx.push( o, o + k, o + k + 1 ); else idx.push( o, o + k + 1, o + k );
	}
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	// (wound for outward faces: the index runs round the section counter-clockwise seen from the head)
	g.computeVertexNormals();
	b.add( g, 0xffffff, [ 0.62, 0, 6.5 ] );
	// zip: down the middle and round the head end, the pull at the shoulder
	const zip = [];
	for ( let r = 1; r < rows - 2; r ++ ) zip.push( [ 0, BAG_W[ r ][ 2 ] + 0.006, BAG_W[ r ][ 0 ] ] );
	b.tube( zip, 0.008, 4, 0x2a2a2a, T.plastic );
	b.box( 0.03, 0.012, 0.06, 0x9a9a9a, T.steel, { x: 0.03, y: BAG_W[ 4 ][ 2 ] + 0.012, z: BAG_W[ 4 ][ 0 ] } );
	// webbing carry handles along both sides
	for ( const z of [ - 0.5, 0.05, 0.6 ] ) for ( const s of [ - 1, 1 ] ) {
		const r = BAG_W.findIndex( q => q[ 0 ] > z );
		const w = BAG_W[ r ][ 1 ];
		b.box( 0.03, 0.06, 0.14, 0x1a1a1a, T.fabric, { x: s * ( w + 0.01 ), y: 0.05, z } );
	}
	return b.build();
}

// a loose tyre standing on its tread, rolling along x: lathed casing with a rusty rim
function tire() {
	const b = new MB();
	const r = 0.33, h = 0.11, ri = 0.21;
	b.lathe( [ [ ri, - h * 0.9 ], [ r * 0.95, - h * 0.95 ], [ r, - h * 0.5 ], [ r, h * 0.5 ], [ r * 0.95, h * 0.95 ], [ ri, h * 0.9 ] ], 20, 0x161616, T.rubber, { y: r, axis: 'z' } );
	// the steel wheel: a dish set in from both faces (painted, so the shader chips it to rust), the dark hub bore
	b.lathe( [ [ 0.0, - h * 0.4 ], [ ri * 0.35, - h * 0.4 ], [ ri * 0.8, - h * 0.55 ], [ ri, - h * 0.85 ] ], 14, 0x45484a, T.iron, { y: r, axis: 'z' } );
	b.lathe( [ [ ri, h * 0.85 ], [ ri * 0.8, h * 0.55 ], [ ri * 0.35, h * 0.4 ], [ 0.0, h * 0.4 ] ], 14, 0x45484a, T.iron, { y: r, axis: 'z' } );
	for ( const s of [ - 1, 1 ] ) b.cyl( ri * 0.22, ri * 0.22, 0.004, 10, 0x0c0c0c, T.rubber, { y: r, z: s * h * 0.41, axis: 'z' } );
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
	for ( let k = 1; k < 4; k ++ ) b.beam( [ - W / 2 + k * W / 4, y0, - D / 2 ], [ - W / 2 + k * W / 4, y1, - D / 2 ], 0.01, 0.01, C, T.steel );
	b.beam( [ - W / 2, y1 + 0.05, D / 2 + 0.1 ], [ W / 2, y1 + 0.05, D / 2 + 0.1 ], 0.035, 0.035, 0xc1281c, T.plastic );
	b.box( W - 0.04, 0.25, 0.01, 0xc1281c, T.plastic, { y: y1 - 0.14, z: D / 2 - 0.02 } ); // child seat flap
	for ( const x of [ - W / 2, W / 2 ] ) {
		b.beam( [ x, y1, D / 2 ], [ x, y1 + 0.05, D / 2 + 0.1 ], 0.02, 0.02, C, T.steel );
		b.beam( [ x * 0.8, 0.1, - D / 2 ], [ x, y0, - D / 2 ], 0.02, 0.02, C, T.steel );
		b.beam( [ x * 0.8, 0.1, D / 2 ], [ x, y0, D / 2 ], 0.02, 0.02, C, T.steel );
		b.beam( [ x * 0.8, 0.1, - D / 2 ], [ x * 0.8, 0.1, D / 2 ], 0.02, 0.02, C, T.steel ); // lower rack
	}
	for ( const x of [ - 0.22, 0.22 ] ) for ( const z of [ - 0.42, 0.42 ] ) {
		b.cyl( 0.05, 0.05, 0.03, 10, BLACK, T.rubber, { x, y: 0.05, z, axis: 'x' } );
		b.box( 0.04, 0.06, 0.03, 0x666666, T.steel, { x, y: 0.1, z } );
	}
	b.box( W, 0.01, D, 0x9a9da0, T.steel, { y: y0 } );
	return b.build();
}

// military GP-medium tent: canvas walls and roof, a closed end, the open door flap, ridge pole, guy lines and stakes
function tent( lod = 0 ) {
	const b = new MB();
	const O = 0x4f5a3a, HX = 2.4, HZ = 1.9, WALL = 0.75, RIDGE = 2.3;
	const tri = [];
	// the canvas sags between the poles: three roof bays, each dipping in the middle
	const bays = lod ? 1 : 3, sag = lod ? 0 : 0.07;
	for ( const s of [ - 1, 1 ] ) {
		for ( let k = 0; k < bays * 2; k ++ ) {
			const x0 = - HX + 2 * HX * k / ( bays * 2 ), x1 = - HX + 2 * HX * ( k + 1 ) / ( bays * 2 );
			const d0 = k % 2 ? sag : 0, d1 = k % 2 ? 0 : sag;
			const e = ( x, d ) => [ x, WALL - d * 0.5, s * HZ ], r = ( x, d ) => [ x, RIDGE - d * 0.3, 0 ];
			tri.push( e( x0, d0 ), e( x1, d1 ), r( x1, d1 ), e( x0, d0 ), r( x1, d1 ), r( x0, d0 ) );
		}
		tri.push( [ - HX, 0, s * HZ * 1.03 ], [ HX, 0, s * HZ * 1.03 ], [ HX, WALL, s * HZ ], [ - HX, 0, s * HZ * 1.03 ], [ HX, WALL, s * HZ ], [ - HX, WALL, s * HZ ] );
	}
	b.tris( tri, O, T.fabric, [ 0, 0.4, 0 ] );
	if ( ! lod ) for ( const s of [ - 1, 1 ] ) b.box( HX * 2, 0.06, 0.04, 0x3e472c, T.fabric, { y: WALL + 0.02, z: s * HZ } ); // eave hem
	for ( const s of [ - 1, 1 ] ) {
		const x = s * HX;
		const end = [ [ x, 0, - HZ * 1.03 ], [ x, 0, HZ * 1.03 ], [ x, WALL, HZ ], [ x, 0, - HZ * 1.03 ], [ x, WALL, HZ ], [ x, WALL, - HZ ], [ x, WALL, - HZ ], [ x, WALL, HZ ], [ x, RIDGE, 0 ] ];
		b.tris( end, s > 0 ? 0x161a12 : 0x48532f, T.fabric, [ 0, 0.4, 0 ] );
	}
	// the tied-back door flaps of the open end
	for ( const z of [ - 0.75, 0.75 ] ) b.box( 0.06, 1.9, 0.5, 0x454f32, T.fabric, { x: HX + 0.04, y: 0.95, z, rx: z > 0 ? - 0.1 : 0.1 } );
	b.cyl( 0.04, 0.04, RIDGE, 6, 0x333, T.iron, { x: HX + 0.02, y: RIDGE / 2 } );
	b.cyl( 0.04, 0.04, RIDGE, 6, 0x333, T.iron, { x: - HX - 0.02, y: RIDGE / 2 } );
	if ( ! lod ) {
		// guy lines from the eaves out to stakes
		for ( const s of [ - 1, 1 ] ) for ( const x of [ - 1.6, 0, 1.6 ] ) {
			b.beam( [ x, WALL, s * HZ ], [ x, 0.05, s * ( HZ + 1.1 ) ], 0.012, 0.012, 0x8a8068, T.fabric );
			b.box( 0.03, 0.12, 0.03, 0x555555, T.iron, { x, y: 0.05, z: s * ( HZ + 1.12 ) } );
		}
		b.box( HX * 2, 0.02, 0.06, 0x3e472c, T.fabric, { y: RIDGE + 0.005 } ); // ridge seam
	}
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
// maxD: draw distance (m); lod: a lighter build for the far band (beyond the 75 m shadow band)

export const MODELS = {
	streetlight: { build: () => streetlight( false ), lod: () => streetlight( false, 1 ), maxD: 620 },
	streetlight2: { build: () => streetlight( true ), lod: () => streetlight( true, 1 ), maxD: 800 },
	pole: { build: () => utilityPole( 0 ), lod: () => utilityPole( 0, 1 ), maxD: 560 },
	poleT: { build: () => utilityPole( 1 ), lod: () => utilityPole( 1, 1 ), maxD: 560 },
	poleL: { build: () => utilityPole( 2 ), lod: () => utilityPole( 2, 1 ), maxD: 560 },
	poleR: { build: () => utilityPole( 3 ), lod: () => utilityPole( 3, 1 ), maxD: 560 },
	signal: { build: () => signalMast(), lod: () => signalMast( 1 ), maxD: 380 },
	signPost: { build: () => signPost( false ), maxD: 220 },
	signPostTall: { build: () => signPost( true ), maxD: 260 },
	hydrant: { build: () => hydrant(), lod: () => hydrant( 1 ), maxD: 130 },
	litter: { build: () => trashCan( 0 ), lod: () => trashCan( 0, 1 ), maxD: 130 },
	wheelie: { build: () => trashCan( 1 ), lod: () => trashCan( 1, 1 ), maxD: 170 },
	newsBox: { build: newsBox, maxD: 120 },
	shelter: { build: () => busShelter(), lod: () => busShelter( 1 ), maxD: 400 },
	bench: { build: bench, maxD: 170 },
	cone: { build: cone, maxD: 180 },
	sawhorse: { build: () => sawhorse(), lod: () => sawhorse( 1 ), maxD: 260 },
	jersey: { build: () => jersey(), lod: () => jersey( 1 ), maxD: 450 },
	sandbags: { build: () => sandbags(), lod: () => sandbags( 1 ), maxD: 260 },
	hesco: { build: hesco, maxD: 450 },
	razor: { build: razorWire, maxD: 160 },
	booth: { build: () => booth(), lod: () => booth( 1 ), maxD: 450 },
	trashBag: { build: trashBag, maxD: 150 },
	suitcase: { build: suitcase, maxD: 130 },
	cardboard: { build: cardboard, maxD: 140 },
	barrel: { build: () => barrel(), lod: () => barrel( 1 ), maxD: 220 },
	milePost: { build: milePost, maxD: 220 },
	guidePosts: { build: () => guidePosts( 0 ), maxD: 700 },
	welcomePosts: { build: () => guidePosts( 1 ), maxD: 500 },
	meter: { build: meter, maxD: 110 },
	boomBase: { build: boomBase, maxD: 300 },
	boomArm: { build: boomArm, maxD: 300 },
	floodlight: { build: () => floodlight(), lod: () => floodlight( 1 ), maxD: 450 },
	bodyBag: { build: bodyBag, maxD: 140 },
	tire: { build: tire, maxD: 150 },
	spikes: { build: spikes, maxD: 110 },
	cart: { build: cart, maxD: 140 },
	tent: { build: () => tent(), lod: () => tent( 1 ), maxD: 450 },
};

const HYD = [ 0xd9ad1f, 0xb8231d ];
const NEWS = [ 0x1d4f91, 0xa3161b, 0xd6a312, 0xdcdcdc, 0x2e6b35 ];
const BAGS = [ 0x1c1c1c, 0x7a1a1a, 0x1a3a6a, 0x4a5a2a, 0xb0a080, 0x5a2a6a ];
const BARRELS = [ 0x2a4a8a, 0x8a2a1a, 0x3a5a2a, 0xa8a8a0 ];
const BINS = [ 0x2b3a2e, 0x2a3d5c, 0x4a4d50 ];
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
		case PROP.TRASH_CAN: return one( param ? 'wheelie' : 'litter', { tint: tint( param ? BINS[ Math.floor( seed * 3 ) ] : [ 0x2f4a36, 0x3a3f44, 0x24323f ][ Math.floor( seed * 3 ) ] ) } );
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
