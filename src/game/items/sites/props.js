// Prop builders for the outdoor sites. Each builder draws one prop into a Kit (kit.js) in the prop's own frame:
// origin on the ground, +z the prop's front, +x its right; real sizes in metres. Builders add physics boxes for the
// things you bump into or put things on (tables, crates, walls), and nothing for what you'd step over.
//   PROPS[ type ]( k, o, R )   o: the layout's prop record (type params), R: a seeded [0,1) generator
// Decor never copies a lootable item's look (a backpack, a jerrycan, a rod, a full can or bottle): what looks
// takeable is a real item. Litter is crushed, torn or spent. Small things (litter, brass, pegs, guy lines) are
// { fine: true } parts: drawn near the camera only.
import * as THREE from 'three';
import { geo, PI, shade, CELLS, vnoise, faces, sheet, inward, rod, rope } from './kit.js';
import { VEHICLE_PROPS } from './vehicles.js';

const HALF = PI / 2;
const ROPE = 0xcfc8b2;
const FINE = { fine: true };

// the height of a body lying on its back under cloth (x along the body, head at +x), as a smooth union of
// ellipsoids: head, chest, hips, legs, an arm
function bodyHeight( k = 1, R = Math.random ) {
	const lean = ( R() - 0.5 ) * 0.1;
	const parts = [ [ 0.8, lean, 0.13, 0.13, 0.12 ], [ 0.42, 0, 0.3, 0.19, 0.24 ], [ 0.0, 0, 0.24, 0.16, 0.2 ], [ - 0.5, 0.1, 0.36, 0.11, 0.09 ], [ - 0.5, - 0.1, 0.36, 0.11, 0.09 ], [ 0.3, 0.29, 0.26, 0.07, 0.06 ] ];
	return ( x, z ) => {
		let h = 0;
		for ( const [ px, pz, sx, sy, sz ] of parts ) {
			const d = ( ( x - px ) / ( sx * 1.3 ) ) ** 2 + ( ( z - pz ) / ( sz * 1.45 ) ) ** 2;
			if ( d < 1 ) h = Math.max( h, sy * k * Math.sqrt( 1 - d ) );
		}
		return h;
	};
}

// a peg driven in at ( x, z ) of the prop's frame, wherever the ground is there
function peg( k, x, z, c = 0x9a9a9a ) {
	const y = k.groundAt( x, z );
	k.part( geo.cyl( 0.005, 0.004, 0.12, 4, true ), 'metal', c, [ x, y - 0.065, z ], [ 0.3, 0, 0 ], null, FINE );
	k.part( geo.box( 0.035, 0.008, 0.008 ), 'metal', c, [ x, y + 0.045, z ], null, null, FINE );
}
// a wooden stake for the big tents
function stake( k, x, z ) {
	const y = k.groundAt( x, z );
	k.box( 0.04, 0.3, 0.04, 'wood', 0x8a6e4c, [ x, y - 0.12, z ], [ 0.2, 0, 0 ], FINE );
}
// a taut line from a point to a peg in the ground
function guy( k, a, x, z, big = false ) {
	const y = k.groundAt( x, z );
	rod( k, a, [ x, y + ( big ? 0.14 : 0.04 ), z ], big ? 0.006 : 0.0035, 'matte', ROPE, 3, FINE );
	if ( big ) stake( k, x, z ); else peg( k, x, z );
}

const pickc = ( R, a ) => a[ Math.floor( R() * a.length ) % a.length ];
const CLOTH_COLS = [ 0x2f4f7f, 0xb33a2e, 0xe0d8c8, 0x3d6b45, 0x1f1f22, 0xd9a032, 0x7b4a8a, 0x5a7fa8, 0xc96a8a, 0x8a8f96 ];
const CAN_COLS = [ 0xc8322a, 0x2a62b0, 0x3a8a4a, 0xb8bcc0, 0xe0b028, 0x2a2a2e ];

// a sandbag: a superellipsoid slumped flat underneath, its top sagging, a seam pinched round the middle
function bagGeo( L, H, W, R ) {
	const g = new THREE.SphereGeometry( 1, 8, 6 );
	const p = g.attributes.position;
	const bulge = 0.85 + R() * 0.25, lean = ( R() - 0.5 ) * 0.12, twist = ( R() - 0.5 ) * 0.1;
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		let X = Math.sign( x ) * Math.abs( x ) ** 0.4 * L / 2, Y = Math.sign( y ) * Math.abs( y ) ** 0.7 * H / 2, Z = Math.sign( z ) * Math.abs( z ) ** 0.5 * W / 2;
		if ( Math.abs( y ) < 0.05 ) { X *= 0.97; Z *= 0.93; }
		if ( Y < 0 ) { Y *= 0.7; X *= 1.03; Z *= 1.08; } else Y *= bulge * ( 1 - 0.18 * ( X / ( L / 2 ) ) ** 2 );
		X += Y * lean; Z += X * twist;
		p.setXYZ( i, X, Y + H * 0.35, Z );
	}
	g.computeVertexNormals();
	return g;
}
const BAG = 0xb19d76;
function bag( k, x, y, z, yaw, R, c = BAG, o = {} ) {
	k.part( bagGeo( 0.56, 0.17, 0.34, R ), 'cloth', shade( c, ( R() - 0.5 ) * 0.22 ), [ x, y, z ], [ ( R() - 0.5 ) * 0.04, yaw, ( R() - 0.5 ) * 0.05 ], null, { grime: 0.3, ...o } );
}

// ---- litter: small things dropped around a scene ------------------------------------------------------------------------

const LITTER = {
	camp: [ 'can', 'can', 'wrapper', 'bottle', 'paper', 'twig', 'twig' ],
	beach: [ 'can', 'bottle', 'wrapper', 'flipflop', 'cup', 'can' ],
	street: [ 'can', 'cup', 'paper', 'wrapper', 'bottle', 'news' ],
	police: [ 'cup', 'paper', 'brass9', 'brass9', 'brass9', 'glove', 'wrapper' ],
	mil: [ 'brass', 'brass', 'brass', 'brass', 'mre', 'bottle', 'wrapper' ],
	relief: [ 'bottle', 'bottle', 'paper', 'mre', 'cup', 'carton', 'glove', 'news' ],
	picnic: [ 'cup', 'plate', 'can', 'wrapper', 'napkin', 'plate' ],
	wreck: [ 'shard', 'shard', 'brass', 'cable', 'shard', 'paper' ],
	fish: [ 'can', 'bottle', 'line', 'wrapper', 'twig' ],
};
const LITTER_DECAL = { camp: 'twigs', beach: 'litter', street: 'litter', police: 'brass', mil: 'brass', relief: 'litter', picnic: 'litter', wreck: 'brass', fish: 'litter' };

function litterPiece( k, t, x, z, R ) {
	const y = k.groundAt( x, z ), yaw = R() * PI * 2;
	k.push( [ x, y, z ], [ 0, yaw, 0 ] );
	switch ( t ) {
		case 'can': // crushed flat on its side
			k.part( geo.cyl( 0.033, 0.033, 0.115, 7 ), 'print', pickc( R, CAN_COLS ), [ 0, 0.016, 0 ], [ 0, 0, HALF ], [ 0.5, 1 - R() * 0.3, 1 ], { fine: true, cell: CELLS.can } );
			break;
		case 'bottle': // an empty bottle stepped on
			k.part( geo.lathe( [ [ 0, 0 ], [ 0.031, 0 ], [ 0.033, 0.02 ], [ 0.033, 0.15 ], [ 0.012, 0.2 ], [ 0.012, 0.22 ], [ 0, 0.22 ] ], 6 ), 'plastic', 0xcfdde4, [ 0.1, 0.014, 0 ], [ 0, 0, HALF ], [ 0.42, 1, 1 ], FINE );
			k.part( geo.cyl( 0.014, 0.014, 0.018, 6 ), 'plastic', 0x2a62b0, [ - 0.125, 0.014, 0 ], [ 0, 0, HALF ], null, FINE );
			break;
		case 'wrapper':
			k.part( geo.box( 0.11, 0.003, 0.07 ), 'plastic', pickc( R, [ 0xc8322a, 0xe8c22a, 0x2a62b0, 0xf2f2ee, 0x3a8a4a ] ), [ 0, 0.002, 0 ], [ ( R() - 0.5 ) * 0.2, 0, ( R() - 0.5 ) * 0.2 ], null, FINE );
			break;
		case 'paper': // a balled-up sheet
			k.part( geo.ico( 0.035, 0 ), 'matte', 0xece8de, [ 0, 0.03, 0 ], [ R() * 3, R() * 3, 0 ], [ 1, 0.85, 1.1 ], FINE );
			break;
		case 'news':
			k.part( sheet( 0.36, 0.28, 2, 1, ( px ) => Math.abs( px ) < 0.02 ? 0.012 : 0.004 ), 'print', 0xffffff, [ 0, 0, 0 ], null, null, { fine: true, cell: CELLS.news } );
			break;
		case 'cup': // a paper cup on its side
			k.part( geo.lathe( [ [ 0.028, 0 ], [ 0.04, 0.1 ], [ 0.042, 0.105 ] ], 7 ), 'plastic', R() < 0.5 ? 0xf2f0ea : 0xd8c8a8, [ 0, 0.035, 0 ], [ 0, 0, HALF - 0.2 ], null, FINE );
			break;
		case 'plate':
			k.part( geo.cyl( 0.11, 0.09, 0.012, 10 ), 'plastic', 0xf2f0ea, [ 0, 0, 0 ], [ ( R() - 0.5 ) * 0.1, 0, 0 ], null, FINE );
			break;
		case 'napkin':
			k.part( geo.ico( 0.04, 0 ), 'cloth', 0xf4f2ee, [ 0, 0.02, 0 ], null, [ 1.2, 0.5, 1 ], FINE );
			break;
		case 'flipflop':
			k.part( geo.cyl( 0.045, 0.045, 0.014, 8 ), 'plastic', pickc( R, [ 0x2a62b0, 0xe04a7a, 0x1f1f22, 0xe8c22a ] ), [ 0, 0, 0 ], null, [ 2.6, 1, 1.05 ], FINE );
			k.part( geo.torus( 0.04, 0.005, 3, 6, PI ), 'plastic', 0xf2f2ee, [ 0.03, 0.014, 0 ], [ 0, HALF, 0 ], null, FINE );
			break;
		case 'brass': case 'brass9': { // spent cases, a few together
			const n = 3 + Math.floor( R() * 4 ), len = t === 'brass' ? 0.045 : 0.019;
			for ( let i = 0; i < n; i ++ ) k.part( geo.cyl( 0.0048, 0.0048, len, 5, true ), 'metal', shade( 0xc79a3e, ( R() - 0.5 ) * 0.3 ), [ ( R() - 0.5 ) * 0.25, 0.005, ( R() - 0.5 ) * 0.25 ], [ 0, R() * 6, HALF ], null, FINE );
			break;
		}
		case 'mre': // a torn, empty ration pouch
			k.part( geo.box( 0.17, 0.006, 0.11 ), 'matte', 0x8a7a5a, [ 0, 0.003, 0 ], [ 0, 0, ( R() - 0.5 ) * 0.1 ], null, FINE );
			k.part( geo.box( 0.05, 0.004, 0.1 ), 'matte', 0x7a6a4a, [ 0.1, 0.012, 0 ], [ 0, 0, 0.5 ], null, FINE );
			break;
		case 'glove':
			k.part( geo.ico( 0.04, 0 ), 'plastic', 0x4a7ad0, [ 0, 0.008, 0 ], null, [ 1.8, 0.22, 1 ], FINE );
			break;
		case 'carton': // a flattened box
			k.part( geo.box( 0.5, 0.006, 0.38 ), 'print', 0xffffff, [ 0, 0.003, 0 ], [ 0, 0, ( R() - 0.5 ) * 0.06 ], null, { fine: true, cell: CELLS.carton } );
			break;
		case 'shard': { // a torn scrap of skin panel
			const s = 0.15 + R() * 0.25;
			k.part( faces( [ [ [ 0, 0.01, 0 ], [ s, 0.02 + R() * 0.05, s * 0.2 ], [ s * 0.3, 0.03, s * 0.8 ] ] ] ), 'print', 0x4e5546, null, null, null, { fine: true, cell: CELLS.plain } );
			break;
		}
		case 'cable': {
			const pts = [];
			for ( let i = 0; i < 5; i ++ ) pts.push( [ i * 0.15, 0.01, Math.sin( i * 1.7 + R() * 3 ) * 0.08 ] );
			k.part( geo.tube( pts, 0.006, 6, 3 ), 'plastic', pickc( R, [ 0x1a1a1a, 0xb8261d, 0xd9a52a ] ), null, null, null, FINE );
			break;
		}
		case 'line': { // a tangle of fishing line round a broken lure
			k.part( geo.torus( 0.06, 0.0015, 3, 10 ), 'plastic', 0xd8e8e0, [ 0, 0.005, 0 ], [ HALF, 0, 0 ], [ 1, 0.7, 1 ], FINE );
			k.part( geo.box( 0.05, 0.012, 0.012 ), 'plastic', 0xe04a2a, [ 0.05, 0.006, 0 ], null, null, FINE );
			break;
		}
		default: // a dead twig
			k.part( geo.cylX( 0.006 + R() * 0.006, 0.25 + R() * 0.3, 4 ), 'wood', 0x5a4632, [ 0, 0.006, 0 ], null, null, FINE );
	}
	k.pop();
}

export const PROPS = {
	...VEHICLE_PROPS,

	// scattered small things (o.set: a LITTER key, o.n pieces within o.r metres), on a decal of dirt to match
	litter( k, o, R ) {
		const set = LITTER[ o.set ] || LITTER.street, n = o.n ?? 8, r = o.r ?? 1.5;
		for ( let i = 0; i < n; i ++ ) {
			const a = R() * PI * 2, d = Math.sqrt( R() ) * r;
			litterPiece( k, pickc( R, set ), Math.cos( a ) * d, Math.sin( a ) * d, R );
		}
		if ( o.decal !== false ) k.groundDecal( LITTER_DECAL[ o.set ] || 'litter', 0, 0, r * 1.5, R() * 6 );
	},

	// ---- luggage and spills ------------------------------------------------------------------------------------------

	suitcase( k, o, R ) {
		const c = o.c ?? 0x22262c, inner = 0x4a4f57, seg = { seg: 1 };
		const zip = ( y, z ) => k.box( 0.66, 0.012, 0.006, 'metal', 0x2a2a2a, [ 0, y, z ] );
		if ( o.open ) {
			k.rbox( 0.68, 0.13, 0.46, 0.035, 'plastic', c, null, null, seg );
			k.box( 0.62, 0.012, 0.4, 'cloth', inner, [ 0, 0.1, 0 ] );
			// the lid flopped open behind, its lining and elastic straps up
			k.rbox( 0.68, 0.1, 0.46, 0.035, 'plastic', c, [ 0, 0, - 0.47 ], null, seg );
			k.box( 0.62, 0.012, 0.4, 'cloth', inner, [ 0, 0.1, - 0.47 ] );
			for ( const x of [ - 0.15, 0.15 ] ) k.box( 0.03, 0.004, 0.38, 'cloth', 0x1a1a1a, [ x, 0.113, - 0.47 ] );
			zip( 0.125, 0.23 ); zip( 0.095, - 0.7 );
			// clothes spilling out, the last one onto the ground
			const n = 3 + ( o.clothes ?? 2 ) % 3;
			for ( let i = 0; i < n; i ++ ) {
				const last = i === n - 1, c2 = pickc( R, CLOTH_COLS );
				const g = sheet( 0.34, 0.26, 3, 3, ( px, pz ) => vnoise( px * 9 + i * 5, pz * 9, 4 ) * 0.03 + 0.008 );
				k.part( g, 'cloth', c2, [ ( R() - 0.5 ) * 0.3 + ( last ? 0.45 : 0 ), last ? 0 : 0.11 + i * 0.02, ( R() - 0.5 ) * 0.16 + ( last ? 0.24 : 0 ) ], [ 0, R() * 0.8 - 0.4, 0 ], null, last ? { drape: true } : {} );
			}
			for ( const x of [ - 0.27, 0.27 ] ) k.cyl( 0.025, 0.025, 0.02, 'plastic', 0x111111, [ x, 0.01, - 0.7 ], [ HALF, 0, 0 ], 8 );
			return;
		}
		if ( o.upright ) {
			k.rbox( 0.44, 0.66, 0.26, 0.04, 'plastic', c, [ 0, 0.05, 0 ], null, seg );
			for ( let i = 0; i < 4; i ++ ) k.box( 0.005, 0.6, 0.2, 'plastic', shade( c, - 0.25 ), [ 0.221, 0.08, 0 ], null );
			for ( const x of [ - 0.16, 0.16 ] ) k.cyl( 0.03, 0.03, 0.025, 'plastic', 0x111111, [ x, 0.03, - 0.1 ], [ 0, 0, HALF ], 8 );
			for ( const x of [ - 0.1, 0.1 ] ) k.cyl( 0.007, 0.007, 0.42, 'metal', 0x9aa0a6, [ x, 0.7, - 0.1 ], null, 5 );
			k.box( 0.24, 0.03, 0.035, 'plastic', 0x1a1a1a, [ 0, 1.12, - 0.1 ] );
			k.box( 0.12, 0.025, 0.03, 'plastic', 0x1a1a1a, [ 0, 0.72, 0 ] );
			k.collider( 0.22, 0.36, 0.13, [ 0, 0.38, 0 ], 0, 'wood' );
			return;
		}
		k.rbox( 0.68, 0.26, 0.46, 0.04, 'plastic', c, null, null, seg );
		k.box( 0.2, 0.025, 0.04, 'plastic', 0x1a1a1a, [ 0, 0.26, 0.2 ] );
		zip( 0.13, 0.231 );
		for ( let i = 0; i < 4; i ++ ) k.box( 0.66, 0.005, 0.005, 'plastic', shade( c, - 0.25 ), [ 0, 0.05 + i * 0.05, 0.231 ] );
		// a luggage tag
		k.box( 0.05, 0.002, 0.08, 'print', 0xffffff, [ 0.2, 0.262, 0.12 ], [ 0, 0.4, 0 ], { cell: CELLS.tag } );
	},

	clothes( k, o, R ) {
		const n = o.n ?? 3;
		for ( let i = 0; i < n; i ++ ) {
			const c = pickc( R, CLOTH_COLS ), x = ( R() - 0.5 ) * 0.9, z = ( R() - 0.5 ) * 0.7, yaw = R() * 6;
			k.push( [ x, 0, z ], [ 0, yaw, 0 ] );
			if ( R() < 0.5 ) {
				// a folded garment, a sleeve hanging off it
				k.part( geo.rbox( 0.34, 0.05 + R() * 0.03, 0.26, 0.02, 1 ), 'cloth', c, null, null, null, { drape: true } );
				k.part( geo.cylX( 0.04, 0.3, 6 ), 'cloth', c, [ 0.26, 0.025, 0.06 ], [ 0, 0.5, 0 ], [ 1, 0.45, 1 ], { drape: true } );
			} else {
				// a shirt dropped in a heap
				const g = sheet( 0.62, 0.5, 6, 5, ( px, pz ) => 0.012 + vnoise( px * 7 + i * 3, pz * 7, 2 ) * 0.07 * ( 1 - Math.min( 1, Math.hypot( px / 0.31, pz / 0.25 ) ) * 0.6 ) );
				k.part( g, 'cloth', c, null, null, null, { drape: true } );
				k.part( geo.cylX( 0.045, 0.28, 6 ), 'cloth', c, [ - 0.36, 0.025, 0.12 ], [ 0, - 0.6, 0 ], [ 1, 0.45, 1 ], { drape: true } );
			}
			k.pop();
		}
	},

	cart( k, o, R ) {
		if ( o.fallen ) k.push( [ 0, 0.3, 0 ], [ 0, 0, HALF * 0.98 ] );
		const M = 'metal', C = 0xb8bcc2;
		const w = 0.55, L = 0.9, y0 = 0.42, y1 = 0.95;
		// basket edges and wires
		for ( const z of [ - w / 2, w / 2 ] ) {
			rod( k, [ - L / 2, y1, z ], [ L / 2, y1, z ], 0.009, M, C );
			rod( k, [ - L / 2 + 0.1, y0, z * 0.9 ], [ L / 2, y0, z * 0.9 ], 0.008, M, C );
			for ( let i = 0; i <= 7; i ++ ) rod( k, [ - L / 2 + 0.1 * ( 1 - i / 7 ) + i / 7 * L, y0, z * 0.9 ], [ - L / 2 + i / 7 * L, y1, z ], 0.004, M, C, 3 );
		}
		for ( const x of [ - L / 2, L / 2 ] ) {
			rod( k, [ x, y1, - w / 2 ], [ x, y1, w / 2 ], 0.009, M, C );
			for ( let i = 0; i <= 4; i ++ ) { const z = - w / 2 + i / 4 * w; rod( k, [ x === - L / 2 ? x + 0.1 : x, y0, z * 0.9 ], [ x, y1, z ], 0.004, M, C, 3 ); }
		}
		for ( let i = 0; i <= 5; i ++ ) { const z = ( - w / 2 + i / 5 * w ) * 0.9; rod( k, [ - L / 2 + 0.1, y0, z ], [ L / 2, y0, z ], 0.004, M, C, 3 ); }
		// chassis, handle and wheels
		for ( const z of [ - 0.24, 0.24 ] ) rod( k, [ - L / 2 - 0.05, 0.12, z ], [ L / 2, 0.12, z * 0.75 ], 0.012, M, C );
		for ( const z of [ - 0.24, 0.24 ] ) rod( k, [ - L / 2, 0.12, z ], [ - L / 2 - 0.08, y1 + 0.08, z ], 0.012, M, C );
		k.part( geo.cylZ( 0.018, 0.6, 8 ), 'plastic', 0xc0281e, [ - L / 2 - 0.1, y1 + 0.1, 0 ] );
		for ( const [ x, z ] of [ [ - 0.45, - 0.24 ], [ - 0.45, 0.24 ], [ 0.42, - 0.18 ], [ 0.42, 0.18 ] ] ) k.part( geo.cylZ( 0.06, 0.03, 10 ), 'plastic', 0x1a1a1a, [ x, 0.06, z ] );
		if ( o.fallen ) k.pop();
	},

	grocery_bags( k, o, R ) {
		for ( let i = 0; i < 2; i ++ ) {
			const g = geo.ico( 0.16, 1 );
			const p = g.attributes.position;
			for ( let j = 0; j < p.count; j ++ ) p.setY( j, p.getY( j ) * ( 0.5 + vnoise( p.getX( j ) * 20, p.getZ( j ) * 20, i ) * 0.6 ) );
			g.computeVertexNormals();
			k.part( g, 'plastic', i ? 0xf0f0ec : 0xd9e6d0, [ i * 0.35 - 0.15, 0.06, ( R() - 0.5 ) * 0.3 ], [ 0, R() * 6, 0 ], [ 1.3, 0.7, 1 ] );
		}
	},

	// ---- street and road furniture ---------------------------------------------------------------------------------------

	bus_shelter( k, o, R ) {
		const post = 0x4a3a2c, wall = 0x5f7a52, W = 3.2, D = 1.45;
		for ( const [ x, z, h ] of [ [ - W / 2, 0.55, 2.3 ], [ W / 2, 0.55, 2.3 ], [ - W / 2, - D / 2, 2.05 ], [ W / 2, - D / 2, 2.05 ] ] ) {
			k.box( 0.11, h, 0.11, 'wood', post, [ x, 0, z ], null, { grime: 0.3 } );
			k.collider( 0.06, h / 2, 0.06, [ x, h / 2, z ], 0, 'wood' );
		}
		// back wall of boards, half side walls
		for ( let i = 0; i < 9; i ++ ) k.box( W, 0.16, 0.03, 'wood', shade( wall, ( R() - 0.5 ) * 0.12 ), [ 0, 0.32 + i * 0.165, - D / 2 + 0.02 ], null, { grime: 0.35 } );
		k.collider( W / 2, 0.75, 0.04, [ 0, 1.05, - D / 2 + 0.02 ], 0, 'wood' );
		for ( const x of [ - W / 2, W / 2 ] ) for ( let i = 0; i < 9; i ++ ) k.box( 0.03, 0.16, D * 0.6, 'wood', shade( wall, ( R() - 0.5 ) * 0.12 ), [ x, 0.32 + i * 0.165, - D / 2 + D * 0.3 ], null, { grime: 0.35 } );
		// a corrugated roof sloping back
		const roof = sheet( W + 0.5, D + 0.6, 26, 2, ( x ) => Math.abs( Math.sin( x * 18 ) ) * 0.025 );
		k.part( roof, 'metal', 0x8b8f8a, [ 0, 2.2, - 0.05 ], [ - 0.17, 0, 0 ] );
		k.part( roof.clone(), 'metal', 0x6f736e, [ 0, 2.19, - 0.05 ], [ - 0.17, 0, 0 ], [ 1, - 1, 1 ] );
		k.box( W + 0.3, 0.12, 0.08, 'wood', post, [ 0, 2.2, 0.55 ] );
		k.box( W + 0.3, 0.12, 0.08, 'wood', post, [ 0, 1.95, - D / 2 ] );
		// the bench
		k.box( W - 0.5, 0.045, 0.38, 'wood', 0x8a6a48, [ 0, 0.42, - 0.32 ] );
		for ( const x of [ - 1.1, 0, 1.1 ] ) k.box( 0.06, 0.42, 0.3, 'wood', post, [ x, 0, - 0.35 ] );
		k.collider( ( W - 0.5 ) / 2, 0.233, 0.19, [ 0, 0.233, - 0.32 ], 0, 'wood' );
		// missing-person flyers and a timetable on the back wall, a cardboard plea propped by the bench
		k.box( 0.9, 0.9, 0.004, 'print', 0xffffff, [ 0.7, 1.0, - D / 2 + 0.04 ], [ 0, 0, ( R() - 0.5 ) * 0.04 ], { cell: CELLS.missing } );
		k.box( 0.32, 0.42, 0.02, 'plastic', 0x2a2c2e, [ - 1.0, 1.3, - D / 2 + 0.045 ] );
		k.box( 0.28, 0.38, 0.003, 'print', 0xf2f2f2, [ - 1.0, 1.32, - D / 2 + 0.056 ], null, { cell: CELLS.news } );
		if ( R() < 0.6 ) k.box( 0.5, 0.42, 0.006, 'print', 0xffffff, [ - 0.6, 0.2, - 0.1 ], [ - 0.25, 0.3, 0 ], { cell: CELLS.help } );
	},

	bus_sign( k ) {
		k.cyl( 0.03, 0.03, 2.6, 'metal', 0x9aa0a6, null, null, 8 );
		k.box( 0.48, 0.58, 0.02, 'print', 0xffffff, [ 0, 2.0, 0.035 ], null, { cell: CELLS.bus } );
		k.box( 0.5, 0.6, 0.012, 'metal', 0x8a8e92, [ 0, 1.99, 0.018 ] );
		for ( const y of [ 2.05, 2.5 ] ) k.box( 0.08, 0.03, 0.05, 'metal', 0x6a6e72, [ 0, y, 0.01 ] );
		k.collider( 0.04, 1.3, 0.04, [ 0, 1.3, 0 ], 0, 'metal' );
	},

	trash_can( k, o, R ) {
		k.cyl( 0.3, 0.27, 0.86, 'paint', 0x2f5a3a, null, null, 14 );
		// vertical ribs pressed into the steel
		for ( let i = 0; i < 8; i ++ ) { const a = i / 8 * PI * 2; k.box( 0.03, 0.7, 0.02, 'paint', 0x2a5234, [ Math.cos( a ) * 0.29, 0.08, Math.sin( a ) * 0.29 ], [ 0, - a + HALF, 0 ] ); }
		k.part( geo.torus( 0.3, 0.02, 5, 18 ), 'paint', 0x2a4f33, [ 0, 0.86, 0 ], [ HALF, 0, 0 ] );
		// the liner folded over the rim, the lid knocked askew
		k.part( geo.torus( 0.305, 0.025, 4, 14 ), 'plastic', 0x161618, [ 0, 0.83, 0 ], [ HALF, 0, 0 ], [ 1, 1, 1.5 ] );
		k.push( [ 0, 0.88, 0 ], [ 0.12, R() * 6, 0.18 ] );
		k.part( geo.dome( 0.31, 14, 4 ), 'paint', 0x2a4f33, null, null, [ 1, 0.35, 1 ] );
		k.box( 0.2, 0.06, 0.1, 'matte', 0x111111, [ 0, 0.02, 0.24 ] );
		k.pop();
		k.collider( 0.3, 0.45, 0.3, [ 0, 0.45, 0 ], 0, 'metal' );
	},

	cone( k, o ) {
		if ( o.fallen ) k.push( [ 0, 0.17, 0 ], [ 0, 0, HALF * 0.82 ] );
		k.box( 0.36, 0.03, 0.36, 'plastic', 0x1f1f1f );
		k.part( geo.cone( 0.135, 0.68, 14, true ), 'plastic', 0xe5531a, [ 0, 0.03, 0 ] );
		k.part( geo.cyl( 0.072, 0.093, 0.1, 14, true ), 'plastic', 0xf2f2ee, [ 0, 0.3, 0 ], null, 1.03 );
		k.part( geo.cyl( 0.042, 0.06, 0.07, 14, true ), 'plastic', 0xf2f2ee, [ 0, 0.47, 0 ], null, 1.04 );
		if ( o.fallen ) k.pop();
	},

	sawhorse( k, o ) {
		if ( o.fallen ) k.push( [ 0, 0.15, 0 ], [ HALF * 0.95, 0, 0 ] );
		for ( const x of [ - 0.72, 0.72 ] ) {
			rod( k, [ x, 0, - 0.28 ], [ x, 0.98, 0 ], 0.02, 'plastic', 0xe8e4da, 6 );
			rod( k, [ x, 0, 0.28 ], [ x, 0.98, 0 ], 0.02, 'plastic', 0xe8e4da, 6 );
			k.box( 0.08, 0.04, 0.62, 'plastic', 0x2a2a2a, [ x, 0, 0 ] );
		}
		k.box( 1.6, 0.26, 0.025, 'print', 0xffffff, [ 0, 0.72, 0.05 ], null, { cell: CELLS.police_board } );
		k.box( 1.6, 0.16, 0.025, 'plastic', 0xe5531a, [ 0, 0.35, 0.1 ] );
		// a warning lamp clamped to the top board
		k.box( 0.05, 0.08, 0.04, 'plastic', 0x1a1a1a, [ 0.6, 0.98, 0.05 ] );
		k.cyl( 0.07, 0.07, 0.04, 'plastic', 0xe8a020, [ 0.6, 1.08, 0.05 ], [ HALF, 0, 0 ], 10 );
		if ( ! o.fallen ) k.collider( 0.8, 0.5, 0.15, [ 0, 0.5, 0 ], 0, 'wood' );
		if ( o.fallen ) k.pop();
	},

	tape( k, o, R ) {
		const len = o.len ?? 8;
		const g = sheet( len, 0.07, 24, 1, () => 0 );
		const p = g.attributes.position;
		// sag between the ends, a twist or two where the wind turned it
		for ( let i = 0; i < p.count; i ++ ) { const t = p.getX( i ) / len + 0.5, w = p.getZ( i ); p.setY( i, - Math.sin( t * PI ) * 0.25 + Math.sin( t * PI * 3 ) * w * 0.6 ); p.setZ( i, w * Math.cos( t * PI * 3 ) ); }
		g.rotateX( HALF );
		g.computeVertexNormals();
		k.part( g, 'print', 0xffffff, [ len / 2, 0.9, 0 ], null, null, { cell: CELLS.tape } );
		// a torn end hanging off the far post
		if ( R() < 0.6 ) k.part( sheet( 0.07, 0.6, 1, 4, () => 0 ).rotateZ( HALF ), 'print', 0xffffff, [ len + 0.02, 0.6, 0 ], [ 0, HALF, 0.1 ], null, { cell: CELLS.tape } );
	},

	body_bag( k, o, R ) {
		const h = bodyHeight( 1.15, R );
		// a rounded bag hugging the body, tapered at both ends, creased where the plastic folds
		const bag = ( x, z ) => Math.max( h( x, z ), 0.09 * Math.sqrt( Math.max( 0, 1 - ( z / 0.3 ) ** 2 ) ) ) * ( 1 - ( x / 1.0 ) ** 8 ) + ( vnoise( x * 9, z * 9, 11 ) - 0.5 ) * 0.012;
		k.part( sheet( 2.0, 0.6, 24, 10, bag ), 'plastic', 0x16171a, null, null, null, { drape: true } );
		// the zip down the middle, its pull with a tag, the carry handles
		const pts = [];
		for ( let i = 0; i <= 16; i ++ ) { const x = - 0.9 + i / 16 * 1.75; pts.push( [ x, bag( x, 0.04 ) + 0.006, 0.04 ] ); }
		k.part( geo.tube( pts, 0.008, 24, 4 ), 'metal', 0x8a8e92, null, null, null, { drape: true } );
		k.part( geo.box( 0.05, 0.004, 0.08 ), 'print', 0xffffff, [ 0.88, bag( 0.85, 0.04 ) + 0.01, 0.1 ], [ 0, 0.5, 0 ], null, { cell: CELLS.tag, drape: true } );
		for ( const x of [ - 0.6, 0.05, 0.6 ] ) for ( const z of [ - 0.29, 0.29 ] ) k.part( geo.torus( 0.04, 0.008, 4, 8, Math.PI ), 'cloth', 0x2a2a2a, [ x, 0.02, z ], [ 0, 0, 0 ] );
	},

	// a body under a blanket, the shoes showing (when no character can stand in for the dead)
	body_covered( k, o, R ) {
		const c = pickc( R, [ 0x7d8a96, 0xb9b3a4, 0x5a6f8c, 0x8a7a5a ] );
		const h = bodyHeight( 1.3, R );
		// the blanket: tented over the body, its folds running off it, the hem lying out on the ground
		const fold = ( x, z ) => ( vnoise( x * 5, z * 9, 7 ) - 0.5 ) * 0.03 * ( 0.4 + Math.min( 1, Math.abs( z ) * 2 ) );
		k.part( sheet( 2.05, 1.15, 22, 12, ( x, z ) => 0.01 + h( x, z ) * 0.96 + fold( x, z ) + Math.max( 0, h( x, z * 0.7 ) - h( x, z ) ) * 0.35 ), 'cloth', c, null, null, null, { drape: true } );
		k.part( sheet( 2.05, 0.04, 22, 1, () => 0.012 ), 'cloth', shade( c, - 0.25 ), [ 0, 0, 0.575 ], null, null, { drape: true } );
		for ( const z of [ - 0.11, 0.1 ] ) {
			k.rbox( 0.1, 0.13, 0.09, 0.03, 'matte', 0x2a241e, [ - 1.02, 0, z ], [ 0, 0, 0.35 ], { seg: 1 } );
			k.box( 0.02, 0.02, 0.09, 'matte', 0x15120f, [ - 1.05, 0, z ], [ 0, 0, 0.35 ] );
		}
	},

	// ---- beach -----------------------------------------------------------------------------------------------------------

	towel( k, o, R ) {
		// a sandy towel, rucked up at one corner where someone got up
		const ruck = R() < 0.5 ? 1 : - 1;
		const g = sheet( 1.75, 0.85, 12, 6, ( x, z ) => vnoise( x * 3 + 7, z * 3, 3 ) * 0.014 + Math.max( 0, 1 - Math.hypot( x - ruck * 0.75, z - 0.35 ) / 0.35 ) ** 2 * 0.06 );
		k.part( g, 'print', 0xffffff, [ 0, 0.035, 0 ], [ 0, HALF, 0 ], null, { cell: [ CELLS.towel0, CELLS.towel1, CELLS.towel2, CELLS.towel3 ][ ( o.c ?? 0 ) % 4 ], drape: true } );
		if ( R() < 0.5 ) k.groundDecal( 'boots', 0.2, 0.9, 1.6, R() * 6 );
	},

	umbrella( k, o, R ) {
		const cols = [ [ 0xd23a2e, 0xf2eee4 ], [ 0x2b6fb3, 0xf2eee4 ], [ 0xf0b81f, 0x2a9a8e ], [ 0x3f8a4a, 0xf2eee4 ] ][ ( o.c ?? 0 ) % 4 ];
		if ( o.fallen ) k.push( [ 0, 0.25, 0 ], [ 0, 0, HALF * 0.93 ] );
		else {
			// screwed into the sand: a little mound round the pole
			k.part( geo.cone( 0.16, 0.06, 8 ), 'matte', 0xcdb98e, [ 0, - 0.02, 0 ] );
			k.push( [ 0, - 0.2, 0 ], [ o.tilt ?? 0.2, 0, 0 ] );
		}
		const H = 2.25, r = 1.05, h = 0.34, n = 8;
		k.cyl( 0.017, 0.017, 1.6, 'metal', 0xe0e0dc, null, null, 6 );
		k.cyl( 0.024, 0.024, 0.08, 'plastic', 0x2a2a2a, [ 0, 1.58, 0 ], null, 6 );
		k.cyl( 0.014, 0.014, H - 1.64, 'metal', 0xe0e0dc, [ 0, 1.64, 0 ], null, 6 );
		// the canopy: panels between the ribs, each pulled a little flat between them, a fringe under the edge
		const rib = ( a, t ) => [ Math.cos( a ) * r * t, H - h * t ** 1.4, Math.sin( a ) * r * t ];
		for ( let i = 0; i < n; i ++ ) {
			const a0 = i / n * PI * 2, a1 = ( i + 1 ) / n * PI * 2, col = cols[ i % 2 ];
			const g = geo.grid( 3, 3, ( u, v ) => {
				const t = Math.max( v, 0.02 ), p0 = rib( a0, t ), p1 = rib( a1, t );
				const sag = Math.sin( PI * u ) * 0.03 * t;
				return [ p0[ 0 ] + ( p1[ 0 ] - p0[ 0 ] ) * u, p0[ 1 ] + ( p1[ 1 ] - p0[ 1 ] ) * u - sag, p0[ 2 ] + ( p1[ 2 ] - p0[ 2 ] ) * u ];
			} );
			k.part( g, 'cloth', col );
			const e0 = rib( a0, 1 ), e1 = rib( a1, 1 );
			k.part( geo.quad( [ e1[ 0 ], e1[ 1 ] - 0.13, e1[ 2 ] ], [ e0[ 0 ], e0[ 1 ] - 0.13, e0[ 2 ] ], e0, e1, 1, 1 ), 'print', cols[ ( i + 1 ) % 2 ], null, null, null, { cell: CELLS.fringe } );
			rod( k, [ 0, H - 0.05, 0 ], rib( a0, 0.98 ).map( ( v, j ) => j === 1 ? v - 0.012 : v ), 0.005, 'metal', 0xcccccc, 3 );
			rod( k, [ 0, H - 0.5, 0 ], rib( a0, 0.5 ).map( ( v, j ) => j === 1 ? v - 0.015 : v ), 0.004, 'metal', 0xcccccc, 3 );
		}
		k.cyl( 0.03, 0.03, 0.06, 'plastic', 0xdcdcd4, [ 0, H - 0.52, 0 ], null, 6 );
		k.part( geo.cone( 0.09, 0.07, 8 ), 'cloth', cols[ 0 ], [ 0, H - 0.01, 0 ] );
		k.part( geo.sph( 0.025, 6, 4 ), 'plastic', 0xffffff, [ 0, H + 0.07, 0 ] );
		k.pop();
	},

	cooler( k, o, R ) {
		const c = o.c ?? 0x2a64b0, lid = 0xefefea;
		k.rbox( 0.62, 0.34, 0.4, 0.04, 'plastic', c, null, null, { seg: 1, grime: 0.15 } );
		// a plinth, the printed band on the front, a drain plug
		k.box( 0.58, 0.025, 0.36, 'plastic', shade( c, - 0.35 ), [ 0, - 0.005, 0 ] );
		k.box( 0.44, 0.13, 0.004, 'print', c, [ 0, 0.1, 0.201 ], null, { cell: CELLS.cooler } );
		k.cyl( 0.016, 0.016, 0.02, 'plastic', 0x2a2a2a, [ 0.24, 0.05, 0.2 ], [ HALF, 0, 0 ], 6 );
		// swing handles on the ends, on their pivots
		for ( const s of [ - 1, 1 ] ) {
			k.part( geo.torus( 0.075, 0.009, 4, 8, PI ), 'plastic', 0x2a2a2a, [ s * 0.325, 0.24, 0 ], [ PI, s * HALF, 0 ] );
			k.cyl( 0.018, 0.018, 0.012, 'plastic', 0x1f1f1f, [ s * 0.316, 0.24, 0.075 ], [ 0, 0, HALF ], 6 );
			k.cyl( 0.018, 0.018, 0.012, 'plastic', 0x1f1f1f, [ s * 0.316, 0.24, - 0.075 ], [ 0, 0, HALF ], 6 );
		}
		for ( const x of [ - 0.2, 0.2 ] ) k.cyl( 0.012, 0.012, 0.06, 'plastic', 0x9a9a96, [ x, 0.34, - 0.205 ], [ 0, 0, HALF ], 6 );
		if ( o.open ) {
			k.push( [ 0, 0.34, - 0.2 ], [ - 1.85, 0, 0 ] );
			k.rbox( 0.64, 0.07, 0.42, 0.03, 'plastic', lid, [ 0, 0, 0.21 ], null, { seg: 1 } );
			k.box( 0.54, 0.012, 0.34, 'plastic', 0xdcdcd6, [ 0, - 0.01, 0.21 ] );
			k.pop();
			// the liner, meltwater and the last of the ice
			k.part( inward( geo.box( 0.54, 0.3, 0.32 ) ), 'plastic', 0xe6e6e0, [ 0, 0.05, 0 ] );
			k.box( 0.54, 0.01, 0.32, 'plastic', 0x9ab5c4, [ 0, 0.2, 0 ] );
			for ( let i = 0; i < 5; i ++ ) k.part( geo.box( 0.04, 0.03, 0.04 ), 'plastic', 0xe8f0f2, [ ( R() - 0.5 ) * 0.4, 0.205, ( R() - 0.5 ) * 0.2 ], [ R(), R(), R() ], null, FINE );
		} else {
			k.rbox( 0.64, 0.07, 0.42, 0.03, 'plastic', lid, [ 0, 0.33, 0 ], null, { seg: 1 } );
			// cup holders moulded in the lid, the latch
			for ( const x of [ - 0.2, 0.2 ] ) k.cyl( 0.035, 0.035, 0.004, 'plastic', 0xc8c8c2, [ x, 0.4, 0.1 ], null, 10 );
			k.box( 0.08, 0.05, 0.02, 'plastic', 0x2a2a2a, [ 0, 0.32, 0.205 ] );
		}
		k.collider( 0.31, 0.2, 0.2, [ 0, 0.2, 0 ], 0, 'wood' );
	},

	beach_chair( k, o, R ) {
		const M = 'metal', A = 0xd8dadc, cell = [ CELLS.stripes, CELLS.towel0, CELLS.towel3, CELLS.stripes ][ ( o.c ?? 0 ) % 4 ];
		for ( const x of [ - 0.26, 0.26 ] ) {
			rod( k, [ x, 0.02, 0.35 ], [ x, 0.22, - 0.1 ], 0.011, M, A );
			rod( k, [ x, 0.22, - 0.1 ], [ x, 0.75, - 0.42 ], 0.011, M, A );
			rod( k, [ x, 0.02, - 0.3 ], [ x, 0.22, 0.25 ], 0.011, M, A );
			// the armrests, wooden slats on the tube
			rod( k, [ x, 0.36, 0.2 ], [ x, 0.36, - 0.2 ], 0.011, M, A );
			k.box( 0.05, 0.015, 0.36, 'wood', 0x9a7450, [ x, 0.37, 0 ] );
			for ( const z of [ 0.35, - 0.3 ] ) k.cyl( 0.016, 0.016, 0.02, 'plastic', 0x2a2a2a, [ x, 0, z ], null, 6 );
		}
		rod( k, [ - 0.26, 0.22, - 0.1 ], [ 0.26, 0.22, - 0.1 ], 0.01, M, A );
		rod( k, [ - 0.26, 0.75, - 0.42 ], [ 0.26, 0.75, - 0.42 ], 0.01, M, A );
		rod( k, [ - 0.26, 0.2, 0.3 ], [ 0.26, 0.2, 0.3 ], 0.01, M, A );
		// one sling from the front bar, sagging under the seat, up to the top bar
		const g = geo.grid( 4, 8, ( u, v ) => {
			const x = ( u - 0.5 ) * 0.5;
			const z = v < 0.45 ? 0.3 - v / 0.45 * 0.4 : - 0.1 - ( v - 0.45 ) / 0.55 * 0.32;
			const y = v < 0.45 ? 0.2 + v / 0.45 * 0.02 - Math.sin( v / 0.45 * PI ) * 0.07 : 0.22 + ( v - 0.45 ) / 0.55 * 0.53;
			const sag = Math.sin( PI * u ) * ( v < 0.45 ? 0.02 : 0.03 * Math.sin( ( v - 0.45 ) / 0.55 * PI ) );
			return [ x, y - sag * 0.3, z - ( v >= 0.45 ? sag : 0 ) ];
		} );
		k.part( g, 'print', 0xffffff, null, null, null, { cell } );
	},

	sandcastle( k, o, R ) {
		const sand = 0xcdb98e;
		k.cyl( 0.32, 0.4, 0.16, 'matte', sand, null, null, 12 );
		k.cyl( 0.14, 0.18, 0.28, 'matte', sand, [ 0, 0.16, 0 ], null, 10 );
		k.part( geo.cone( 0.12, 0.14, 8 ), 'matte', sand, [ 0, 0.44, 0 ] );
		for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2 + 0.4; k.cyl( 0.06, 0.08, 0.2, 'matte', sand, [ Math.cos( a ) * 0.28, 0.12, Math.sin( a ) * 0.28 ], null, 8 ); }
		k.part( geo.torus( 0.55, 0.06, 5, 20 ), 'matte', 0xa8936a, [ 0, 0.0, 0 ], [ HALF, 0, 0 ], [ 1, 1, 0.4 ] );
		// a toy spade left in it
		k.box( 0.06, 0.004, 0.08, 'plastic', 0xe04a2a, [ 0.42, 0.06, 0.1 ], [ 0.6, 0.4, 0 ] );
		k.part( geo.cylX( 0.008, 0.2, 5 ), 'plastic', 0xe04a2a, [ 0.5, 0.12, 0.12 ], [ 0, 0.4, 0.6 ] );
	},

	// ---- camping ---------------------------------------------------------------------------------------------------------

	// a two-pole dome: the inner tent sags between the poles, the fly over it rolled up at the door, guyed out
	tent_dome( k, o, R ) {
		const c = o.c ?? 0x3f6e3a, body = shade( c, 0.6 ), R0 = 1.02, H = 1.24;
		const open = o.open !== false;
		const at = ( th, t, s ) => {
			const e = R0 * ( 1 + 0.17 * Math.abs( Math.sin( 2 * th ) ) );
			const sag = 0.07 * Math.cos( 2 * th ) ** 2 * Math.sin( PI * t );
			const rho = e * Math.sin( t * HALF ) * ( 1 - sag ) * s, y = H * Math.cos( t * HALF ) * ( 1 - sag * 0.7 ) * ( 1 + ( s - 1 ) * 1.4 );
			return [ Math.cos( th ) * rho, y, Math.sin( th ) * rho ];
		};
		k.part( geo.grid( 24, 7, ( u, v ) => at( u * PI * 2, v, 1 ) ), 'cloth', body, null, null, null, { grime: 0.4 } );
		// the fly: down to a hem above the ground, rolled up over the door
		const tb = ( th ) => 0.84 - ( open ? 0.38 : 0 ) * Math.max( 0, Math.cos( th - HALF ) ) ** 8;
		k.part( geo.grid( 24, 6, ( u, v ) => { const th = u * PI * 2; return at( th, v * tb( th ), 1.05 ); } ), 'cloth', c, null, null, null, { grime: 0.15 } );
		if ( open ) {
			const pts = [];
			for ( let i = 0; i <= 8; i ++ ) { const th = HALF - 0.6 + i / 8 * 1.2; pts.push( at( th, tb( th ), 1.07 ) ); }
			k.part( geo.tube( pts, 0.035, 10, 5 ), 'cloth', shade( c, - 0.08 ) );
		}
		// the door: a dark way in (open) or a zip down the panel
		if ( open ) k.part( geo.grid( 6, 5, ( u, v ) => at( HALF - 0.36 + u * 0.72, 0.42 + v * 0.58 * ( 1 - 0.25 * ( 2 * u - 1 ) ** 2 ) + 0.0, 1.012 ) ), 'cloth', 0x121210 );
		else {
			const z = [];
			for ( let i = 0; i <= 6; i ++ ) z.push( at( HALF, 0.45 + i / 6 * 0.55, 1.064 ) );
			k.part( geo.tube( z, 0.005, 6, 3 ), 'plastic', 0x1a1a1a );
		}
		// the poles arch over the fly corner to corner
		for ( const a of [ PI / 4, 3 * PI / 4 ] ) {
			const pts = [];
			for ( let i = 0; i <= 10; i ++ ) pts.push( at( a, 1 - i / 10, 1.065 ) );
			for ( let i = 1; i <= 10; i ++ ) pts.push( at( a + PI, i / 10, 1.065 ) );
			k.part( geo.tube( pts, 0.008, 20, 3 ), 'plastic', 0x2a2a2a );
		}
		// guy lines off the fly's panels; pegs at the corners
		for ( const th of [ 0, PI, 3 * HALF ] ) {
			const p = at( th, 0.55, 1.05 ), e = R0 + 0.95;
			guy( k, p, Math.cos( th ) * e, Math.sin( th ) * e );
		}
		for ( let i = 0; i < 4; i ++ ) { const th = PI / 4 + i * HALF, e = R0 * 1.17 + 0.06; peg( k, Math.cos( th ) * e, Math.sin( th ) * e ); }
		k.groundDecal( 'trampled', 0, 1.5, 2.2, R() * 6 );
		// back half solid (the open front lets you reach in)
		k.collider( 1.0, 0.55, 0.5, [ 0, 0.55, - 0.55 ], 0, 'wood', 'noclimb' );
	},

	// an A-frame: canvas sagging off the ridge between its poles, door flaps tied back, pegged down its sides
	tent_ridge( k, o, R ) {
		const c = o.c ?? 0xb8642a, L = 2.2, W = 1.6, H = 1.15, open = o.open !== false;
		const nlen = Math.hypot( H, W / 2 ), nx = H / nlen, ny = ( W / 2 ) / nlen;
		for ( const s of [ 1, - 1 ] ) {
			const g = geo.grid( 6, 4, ( u, v ) => {
				const z = s * ( L / 2 - u * L ), t = v;
				let x = s * W / 2 * ( 1 - t ), y = H * t - 0.07 * Math.sin( PI * u ) * t * t;
				const d = 0.045 * Math.sin( PI * u ) * Math.sin( PI * t ) + vnoise( u * 4, t * 3, s + 5 ) * 0.012;
				x -= s * d * nx; y -= d * ny;
				// the walls kick out a little at the foot where they're pegged
				if ( t < 0.1 ) x += s * ( 0.1 - t ) * 0.3;
				return [ x, y, z ];
			} );
			k.part( g, 'cloth', c, null, null, null, { grime: 0.4 } );
			// pegs along the foot, a pull-out guy mid-panel
			for ( const z of [ - L / 2, 0, L / 2 ] ) peg( k, s * ( W / 2 + 0.08 ), z * 0.95 );
			guy( k, [ s * W * 0.26, H * 0.48, 0 ], s * ( W / 2 + 0.8 ), 0 );
		}
		const tri = ( z, col ) => geo.quad( [ W / 2 * Math.sign( - z ), 0, z ], [ W / 2 * Math.sign( z ), 0, z ], [ 0, H, z ], [ 0, H, z ], 4, 3, ( u, v ) => - 0.03 * Math.sin( PI * u ) * Math.sin( PI * v ) * Math.sign( z ) );
		k.part( tri( - L / 2, c ), 'cloth', shade( c, - 0.08 ), null, null, null, { grime: 0.4 } );
		if ( open ) {
			// the doorway: a dark inside, the two flaps rolled and tied at the sides
			k.part( faces( [ [ [ - W / 2 + 0.06, 0, L / 2 - 0.25 ], [ W / 2 - 0.06, 0, L / 2 - 0.25 ], [ 0, H - 0.08, L / 2 - 0.25 ] ] ] ), 'cloth', 0x121210 );
			k.part( inward( geo.quad( [ - W / 2, 0, L / 2 ], [ W / 2, 0, L / 2 ], [ W / 2, 0, - L / 2 ], [ - W / 2, 0, - L / 2 ], 1, 1 ) ), 'cloth', 0x1c1c1a, [ 0, 0.02, 0 ] );
			for ( const s of [ - 1, 1 ] ) {
				const pts = [ [ 0, H, L / 2 + 0.02 ], [ s * W * 0.2, H * 0.62, L / 2 + 0.05 ], [ s * W * 0.36, H * 0.3, L / 2 + 0.05 ], [ s * W / 2, 0.02, L / 2 + 0.02 ] ];
				k.part( geo.tube( pts, 0.04, 6, 5 ), 'cloth', shade( c, - 0.12 ) );
				k.part( geo.torus( 0.045, 0.006, 3, 8 ), 'matte', ROPE, pts[ 2 ], [ HALF, 0, s * 0.6 ], null, FINE );
			}
		} else {
			k.part( tri( L / 2, c ), 'cloth', shade( c, - 0.1 ), null, null, null, { grime: 0.4 } );
			rod( k, [ 0, 0.02, L / 2 + 0.01 ], [ 0, H - 0.05, L / 2 + 0.01 ], 0.005, 'plastic', 0x1a1a1a, 3 );
		}
		for ( const z of [ - L / 2 - 0.02, L / 2 + 0.02 ] ) k.cyl( 0.012, 0.012, H + 0.1, 'metal', 0x777777, [ 0, 0, z ], null, 5 );
		guy( k, [ 0, H + 0.05, L / 2 ], 0, L / 2 + 0.95 ); guy( k, [ 0, H + 0.05, - L / 2 ], 0, - L / 2 - 0.95 );
		k.groundDecal( 'trampled', 0, L / 2 + 0.8, 1.8, R() * 6 );
		k.collider( W / 2, H / 2, L / 4, [ 0, H / 2, - L / 4 ], 0, 'wood', 'noclimb' );
	},

	fire_pit( k, o, R ) {
		// a ring of stones, sooted on the inside
		for ( let i = 0; i < 11; i ++ ) {
			const a = i / 11 * PI * 2 + R() * 0.2, r = 0.48 + R() * 0.05, s = 0.1 + R() * 0.05;
			k.part( geo.dodeca( s ), 'matte', shade( 0x4a4744, ( R() - 0.5 ) * 0.45 ), [ Math.cos( a ) * r, 0.03, Math.sin( a ) * r ], [ R() * 3, R() * 3, R() * 3 ], [ 1.25, 0.75, 1 ] );
			k.part( geo.dodeca( s * 0.7 ), 'matte', 0x1c1a18, [ Math.cos( a ) * ( r - s * 0.45 ), 0.03, Math.sin( a ) * ( r - s * 0.45 ) ], [ R() * 3, R() * 3, R() * 3 ], [ 1, 0.7, 1 ] );
		}
		k.groundDecal( 'char', 0, 0, 1.25, R() * 6 );
		// a bed of white ash, charred logs burnt through in the middle and fallen in, their ends greyed
		k.part( geo.dome( 0.3, 10, 3 ), 'matte', 0x8e8a84, [ 0, - 0.01, 0 ], null, [ 1, 0.22, 1 ] );
		for ( let i = 0; i < 4; i ++ ) {
			const a = i / 4 * PI + R() * 0.5, len = 0.5 + R() * 0.2, r = 0.045 + R() * 0.02;
			k.push( [ Math.cos( a ) * 0.06, 0.05 + i * 0.025, Math.sin( a ) * 0.06 ], [ 0, a, ( R() - 0.5 ) * 0.4 ] );
			k.part( geo.cylX( r, len * 0.55, 7, r * 0.75 ), 'wood', 0x1b1714, [ len * 0.2, 0, 0 ] );
			k.part( geo.cylX( r * 0.98, len * 0.4, 7 ), 'wood', i % 2 ? 0x2a211a : 0x5a4534, [ - len * 0.27, 0, 0 ] );
			k.part( geo.cylX( r * 0.8, 0.02, 7 ), 'matte', 0x9a958e, [ len * 0.48, 0, 0 ] );
			k.pop();
		}
		for ( let i = 0; i < 9; i ++ ) k.part( geo.ico( 0.02 + R() * 0.02, 0 ), 'matte', 0x141210, [ ( R() - 0.5 ) * 0.5, 0.015, ( R() - 0.5 ) * 0.5 ], [ R() * 3, R() * 3, 0 ], [ 1.4, 0.6, 1 ], FINE );
		if ( o.tripod ) {
			for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2 + 0.3; rod( k, [ Math.cos( a ) * 0.7, 0, Math.sin( a ) * 0.7 ], [ 0, 1.35, 0 ], 0.022, 'wood', 0x6a5038, 6 ); }
			k.part( geo.torus( 0.04, 0.01, 4, 8 ), 'matte', ROPE, [ 0, 1.3, 0 ], [ HALF, 0, 0 ] );
			rod( k, [ 0, 1.33, 0 ], [ 0, 0.85, 0 ], 0.005, 'metal', 0x2a2a2a, 4 );
			k.part( geo.torus( 0.04, 0.006, 4, 10, PI * 1.5 ), 'metal', 0x2a2a2a, [ 0, 0.82, 0 ] );
		} else {
			// a sooted grill rack laid across the stones
			k.push( [ 0.05, 0.16, 0 ], [ 0, R() * 3, 0.04 ] );
			for ( let i = - 3; i <= 3; i ++ ) rod( k, [ - 0.32, 0, i * 0.06 ], [ 0.32, 0, i * 0.06 ], 0.004, 'metal', 0x262422, 4 );
			for ( const x of [ - 0.33, 0.33 ] ) rod( k, [ x, 0, - 0.2 ], [ x, 0, 0.2 ], 0.006, 'metal', 0x262422, 4 );
			k.pop();
		}
		// kindling and split wood waiting by the ring
		for ( let i = 0; i < 3; i ++ ) k.part( geo.cylX( 0.03 + R() * 0.015, 0.4 + R() * 0.15, 5 ), 'wood', shade( 0x7a5a3c, ( R() - 0.5 ) * 0.3 ), [ 0.75 + i * 0.03, 0.035 + i * 0.05, - 0.35 + i * 0.07 ], [ 0, 1.1 + ( R() - 0.5 ) * 0.4, 0 ] );
		k.groundDecal( 'twigs', 0.7, - 0.3, 0.9, R() * 6 );
	},

	log_seat( k, o, R ) {
		const L = 1.3 + R() * 0.4, r = 0.15 + R() * 0.05;
		// bark: a lumpy cylinder; the sawn ends pale with their rings
		const g = geo.cylX( r, L, 10 );
		const p = g.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i ), f = 1 + ( vnoise( x * 4, Math.atan2( z, y ) * 2, 3 ) - 0.5 ) * 0.14; p.setXYZ( i, x, y * f, z * f ); }
		g.computeVertexNormals();
		k.part( g, 'wood', 0x4f3d2e, [ 0, r * 0.9, 0 ], null, null, { grime: 0.2 } );
		for ( const x of [ - L / 2, L / 2 ] ) {
			k.part( geo.cylX( r * 0.92, 0.012, 10 ), 'wood', 0xb08a5a, [ x, r * 0.9, 0 ] );
			k.part( geo.torus( r * 0.5, 0.006, 3, 10 ), 'matte', 0x8a6a44, [ x * 1.008, r * 0.9, 0 ], [ 0, HALF, 0 ] );
		}
		// a branch stub, a bit of bark come away on the top where people sat
		k.part( geo.cone( 0.04, 0.12, 5 ), 'wood', 0x4a3a2a, [ L * 0.2, r * 1.6, r * 0.5 ], [ 0.8, 0, 0.3 ] );
		k.box( L * 0.4, 0.004, r * 0.6, 'wood', 0x9a7a52, [ - L * 0.1, r * 1.88, 0 ] );
		k.collider( L / 2, r * 0.9, r, [ 0, r * 0.9, 0 ], 0, 'wood' );
	},

	// a quad-fold camp chair: X-braced legs, a sling seat and back, fabric armrests, a mesh cup holder
	camp_chair( k, o ) {
		const c = o.c ?? 0x2f5f8f, M = 'metal', F = 0x2a2a2a, X = 0.26;
		for ( const x of [ - X, X ] ) {
			rod( k, [ x, 0, 0.25 ], [ x, 0.45, - 0.22 ], 0.01, M, F, 5 );
			rod( k, [ x, 0, - 0.25 ], [ x, 0.45, 0.22 ], 0.01, M, F, 5 );
			rod( k, [ x, 0.45, - 0.22 ], [ x * 1.05, 0.95, - 0.33 ], 0.01, M, F, 5 );
			rod( k, [ x, 0.45, 0.22 ], [ x * 1.12, 0.64, 0.2 ], 0.009, M, F, 5 );
			rod( k, [ x, 0.44, 0.22 ], [ x, 0.44, - 0.22 ], 0.009, M, F, 5 );
			for ( const z of [ 0.25, - 0.25 ] ) k.cyl( 0.014, 0.014, 0.025, 'plastic', 0x1a1a1a, [ x, 0, z ], null, 5 );
			// the armrest: a strap from the back upright to the front post, sagging
			const g = geo.quad( [ x * 1.12 - 0.035, 0.64, 0.2 ], [ x * 1.12 + 0.035, 0.64, 0.2 ], [ x * 1.11 + 0.035, 0.66, - 0.28 ], [ x * 1.11 - 0.035, 0.66, - 0.28 ], 1, 4, ( u, v ) => - Math.sin( PI * v ) * 0.03 );
			k.part( g, 'cloth', shade( c, - 0.15 ) );
		}
		for ( const z of [ 0.25, - 0.25 ] ) { rod( k, [ - X, 0.02, z ], [ X, 0.42, z * 0.9 ], 0.008, M, F, 4 ); rod( k, [ X, 0.02, z ], [ - X, 0.42, z * 0.9 ], 0.008, M, F, 4 ); }
		// the seat sags across between the side rails, the back between the uprights
		k.part( geo.quad( [ - X, 0.45, 0.22 ], [ X, 0.45, 0.22 ], [ X, 0.45, - 0.22 ], [ - X, 0.45, - 0.22 ], 4, 3, ( u, v ) => - Math.sin( PI * u ) * ( 0.045 + Math.sin( PI * v ) * 0.02 ) ), 'cloth', c );
		k.part( geo.quad( [ - X, 0.47, - 0.225 ], [ X, 0.47, - 0.225 ], [ X * 1.05, 0.95, - 0.335 ], [ - X * 1.05, 0.95, - 0.335 ], 4, 3, ( u, v ) => - Math.sin( PI * u ) * Math.sin( PI * v ) * 0.04 ), 'cloth', c );
		// edge binding along the seat front and back top
		rod( k, [ - X, 0.452, 0.225 ], [ X, 0.452, 0.225 ], 0.007, 'cloth', shade( c, - 0.35 ), 4 );
		rod( k, [ - X * 1.05, 0.95, - 0.338 ], [ X * 1.05, 0.95, - 0.338 ], 0.007, 'cloth', shade( c, - 0.35 ), 4 );
		k.part( geo.cyl( 0.04, 0.035, 0.08, 8, true ), 'cloth', 0x1c1c1c, [ X * 1.12 + 0.07, 0.58, 0.12 ] );
	},

	woodpile( k, o, R ) {
		for ( let row = 0; row < 3; row ++ ) for ( let i = 0; i < 4 - row; i ++ ) {
			const r = 0.07 + R() * 0.02, z = ( R() - 0.5 ) * 0.06, len = 0.55 + R() * 0.1;
			// split logs: half-rounds, the pale split face up or out
			k.part( geo.cylZ( r, len, 7 ), 'wood', shade( 0x6a4e34, ( R() - 0.5 ) * 0.3 ), [ ( i - ( 3 - row ) / 2 ) * 0.16, 0.07 + row * 0.13, z ], [ 0, 0, R() * 3 ] );
			k.part( geo.cylZ( r * 0.85, 0.01, 7 ), 'wood', 0xc49a68, [ ( i - ( 3 - row ) / 2 ) * 0.16, 0.07 + row * 0.13, z + len / 2 ] );
		}
		for ( const x of [ - 0.4, 0.4 ] ) k.cyl( 0.025, 0.025, 0.55, 'wood', 0x5a4634, [ x, 0, 0 ], null, 5 );
		// a hatchet stuck in the chopping block beside it
		k.cyl( 0.17, 0.18, 0.32, 'wood', 0x6a5038, [ 0.75, 0, 0.2 ], null, 9 );
		k.part( geo.cyl( 0.15, 0.15, 0.01, 9 ), 'wood', 0xb89060, [ 0.75, 0.32, 0.2 ] );
		k.groundDecal( 'twigs', 0.5, 0.1, 1.2, R() * 6 );
		k.collider( 0.36, 0.2, 0.3, [ 0, 0.2, 0 ], 0, 'wood' );
	},

	// a lean-to: a tarp off a ridge line between two poles, pegged down behind, sagging between its grommets
	tarp_shelter( k, o, R ) {
		const c = o.c ?? 0x2f5f8f, W = 2.6, top = 1.58, z0 = 0.6, z1 = - 1.25, y1 = 0.08;
		for ( const x of [ - 1.2, 1.2 ] ) k.cyl( 0.025, 0.025, 1.65, 'wood', 0x6a5038, [ x, 0, z0 ], null, 5 );
		rope( k, [ - 1.95, k.groundAt( - 1.95, z0 ) + 0.05, z0 ], [ - 1.2, top + 0.02, z0 ], 0.02 );
		rope( k, [ 1.2, top + 0.02, z0 ], [ 1.95, k.groundAt( 1.95, z0 ) + 0.05, z0 ], 0.02 );
		peg( k, - 1.95, z0 ); peg( k, 1.95, z0 );
		rope( k, [ - 1.2, top, z0 ], [ 1.2, top, z0 ], 0.03, 0.004 );
		const g = geo.grid( 8, 6, ( u, v ) => {
			const x = ( u - 0.5 ) * W;
			const yt = top - 0.03 * Math.sin( PI * u ), yb = y1 + k.groundAt( x, z1 );
			let y = yt + ( yb - yt ) * v, z = z0 + ( z1 - z0 ) * v;
			// sags between the ridge and the pegs, droops at the free corners
			y -= Math.sin( PI * v ) * ( 0.12 + 0.05 * Math.sin( PI * u * 3 ) ** 2 );
			y -= ( Math.abs( u - 0.5 ) * 2 ) ** 3 * 0.1 * Math.sin( PI * v );
			return [ x, y, z ];
		} );
		k.part( g, 'cloth', c, null, null, null, { grime: 0.2 } );
		for ( const u of [ 0, 0.5, 1 ] ) {
			const x = ( u - 0.5 ) * W;
			k.part( geo.torus( 0.012, 0.004, 3, 6 ), 'metal', 0xb8b8b0, [ x, k.groundAt( x, z1 ) + y1 + 0.02, z1 ], [ 0.6, 0, 0 ], null, FINE );
			guy( k, [ x, k.groundAt( x, z1 ) + y1, z1 ], x * 1.05, z1 - 0.35 );
		}
		k.groundDecal( 'trampled', 0, - 0.3, 2.4, R() * 6 );
	},

	trek_pole( k, o ) {
		k.part( geo.cylX( 0.009, 1.15, 6 ), 'metal', 0x50565e, [ 0, 0.012, 0 ] );
		k.part( geo.cylX( 0.012, 0.35, 6 ), 'metal', 0x2a4a7a, [ 0.3, 0.014, 0 ] );
		k.part( geo.cylX( 0.017, 0.14, 8 ), 'plastic', 0x1a1a1a, [ 0.55, 0.018, 0 ] );
		k.part( geo.torus( 0.04, 0.004, 3, 8 ), 'cloth', 0x1a1a1a, [ 0.6, 0.006, 0.03 ], [ HALF, 0, 0 ] );
		k.part( geo.cylX( 0.03, 0.01, 10 ), 'plastic', 0x1a1a1a, [ - 0.5, 0.03, 0 ] );
	},

	// ---- fishing ---------------------------------------------------------------------------------------------------------

	rod_holder( k, o ) {
		k.push( [ 0, - 0.25, 0 ], [ - 0.35, 0, 0 ] );
		k.cyl( 0.026, 0.026, 0.95, 'plastic', 0xe6e6e0, null, null, 10 );
		k.part( geo.torus( 0.027, 0.006, 4, 10 ), 'plastic', 0xd0d0ca, [ 0, 0.95, 0 ], [ HALF, 0, 0 ] );
		k.box( 0.04, 0.12, 0.02, 'plastic', 0xd0d0ca, [ 0, 0.25, 0.026 ] );
		k.pop();
		k.part( geo.cone( 0.07, 0.03, 7 ), 'matte', 0xcdb98e, [ 0, - 0.01, 0 ] );
	},

	bucket( k, o, R ) {
		const c = o.c ?? 0xe8e6df;
		k.part( geo.lathe( [ [ 0.145, 0 ], [ 0.165, 0.36 ], [ 0.175, 0.37 ], [ 0.16, 0.37 ], [ 0.14, 0.02 ], [ 0, 0.02 ] ], 16 ), 'plastic', c, null, null, null, { grime: 0.3 } );
		for ( const y of [ 0.27, 0.32 ] ) k.part( geo.torus( 0.163 + y * 0.03, 0.006, 4, 18 ), 'plastic', shade( c, - 0.08 ), [ 0, y, 0 ], [ HALF, 0, 0 ] );
		k.part( geo.torus( 0.17, 0.004, 4, 12, PI ), 'metal', 0x9a9a9a, [ 0, 0.37, 0 ], [ 0, 0, - 0.3 ] );
		// murky water a hand down
		k.part( geo.cyl( 0.15, 0.15, 0.005, 12 ), 'plastic', 0x4a5a48, [ 0, 0.26, 0 ] );
		k.collider( 0.17, 0.19, 0.17, [ 0, 0.19, 0 ], 0, 'wood' );
	},

	// ---- police and army -----------------------------------------------------------------------------------------------

	folding_table( k, o, R ) {
		k.rbox( 1.8, 0.045, 0.76, 0.015, 'plastic', 0xe9e8e2, [ 0, 0.7, 0 ], null, { seg: 1 } );
		for ( const x of [ - 0.8, 0.8 ] ) {
			for ( const z of [ - 0.3, 0.3 ] ) rod( k, [ x, 0, z ], [ x * 0.97, 0.7, z * 0.95 ], 0.013, 'metal', 0x6a6e72, 6 );
			rod( k, [ x, 0.12, - 0.3 ], [ x, 0.12, 0.3 ], 0.009, 'metal', 0x6a6e72, 5 );
		}
		// paperwork, a clipboard and an abandoned coffee
		k.box( 0.3, 0.012, 0.22, 'print', 0xffffff, [ - 0.45, 0.745, 0.12 ], [ 0, 0.2, 0 ], { cell: CELLS.plain } );
		k.box( 0.23, 0.01, 0.32, 'wood', 0x8a6a48, [ 0.6, 0.75, 0.1 ], [ 0, - 0.3, 0 ] );
		k.box( 0.2, 0.004, 0.27, 'print', 0xffffff, [ 0.6, 0.757, 0.1 ], [ 0, - 0.3, 0 ], { cell: CELLS.news } );
		k.part( geo.lathe( [ [ 0, 0 ], [ 0.03, 0 ], [ 0.04, 0.1 ], [ 0.035, 0.1 ] ], 7 ), 'plastic', 0xf2f0ea, [ 0.25, 0.745, - 0.2 ], null, null, FINE );
		k.collider( 0.9, 0.0225, 0.38, [ 0, 0.7225, 0 ], 0, 'wood' );
	},

	crate_police( k ) {
		k.rbox( 0.62, 0.46, 0.42, 0.04, 'plastic', 0x1c1d20, null, null, { seg: 1 } );
		// stacking ribs, latches, a handle
		for ( const y of [ 0.12, 0.3 ] ) k.box( 0.625, 0.025, 0.425, 'plastic', 0x16171a, [ 0, y, 0 ] );
		for ( const x of [ - 0.2, 0.2 ] ) k.box( 0.07, 0.06, 0.03, 'metal', 0x9a9ea2, [ x, 0.36, 0.215 ] );
		k.box( 0.22, 0.03, 0.05, 'plastic', 0x0e0e0e, [ 0, 0.46, 0 ] );
		k.box( 0.3, 0.08, 0.002, 'print', 0xffffff, [ 0, 0.2, 0.212 ], null, { cell: CELLS.police_door } );
		k.collider( 0.31, 0.23, 0.21, [ 0, 0.23, 0 ], 0, 'wood' );
	},

	// a pop-up canopy: legs on foot plates (two weighted with sandbags), a scissor truss each side, the roof sagging
	// between its spars to the peak, a valance round the edge
	canopy( k, o, R ) {
		const c = o.c ?? 0x23406e, sx = o.big ? 1.5 : 1, W = 3, H = 2.25, hw = W / 2 * sx, hd = W / 2, F = 0x8a8e92;
		for ( const [ x, z ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) {
			k.box( 0.035, H, 0.035, 'metal', F, [ x * hw, 0, z * hd ] );
			k.box( 0.1, 0.008, 0.1, 'metal', 0x5a5e62, [ x * hw, 0, z * hd ] );
			k.collider( 0.03, H / 2, 0.03, [ x * hw, H / 2, z * hd ], 0, 'metal' );
		}
		bag( k, - hw + 0.2, 0, - hd + 0.05, 0.6, R, 0x3a3e2c );
		bag( k, hw - 0.15, 0, hd - 0.2, 2.1, R, 0x3a3e2c );
		// the roof: four panels from the eaves up to the peak, each sagging between its spars
		const peak = [ 0, H + 0.65, 0 ], cn = [ [ - hw, H, hd ], [ hw, H, hd ], [ hw, H, - hd ], [ - hw, H, - hd ] ];
		for ( let i = 0; i < 4; i ++ ) {
			const a = cn[ i ], b = cn[ ( i + 1 ) % 4 ];
			k.part( geo.quad( a, b, peak, peak, 5, 4, ( u, v ) => - 0.06 * Math.sin( PI * u ) * Math.sin( PI * Math.min( 1, v * 1.2 ) ) ), 'cloth', c );
			// the valance hangs off the eave
			k.part( geo.quad( [ a[ 0 ], H - 0.24, a[ 2 ] ], [ b[ 0 ], H - 0.24, b[ 2 ] ], [ b[ 0 ], H + 0.01, b[ 2 ] ], [ a[ 0 ], H + 0.01, a[ 2 ] ], 6, 1, ( u, v ) => 0.012 * Math.sin( u * PI * 9 ) * ( 1 - v ) ), 'cloth', shade( c, - 0.1 ) );
			// the scissor truss behind it
			const ia = [ a[ 0 ] * 0.99, 0, a[ 2 ] * 0.99 ], ib = [ b[ 0 ] * 0.99, 0, b[ 2 ] * 0.99 ];
			rod( k, [ ia[ 0 ], H - 0.05, ia[ 2 ] ], [ ib[ 0 ], H - 0.42, ib[ 2 ] ], 0.01, 'metal', F, 4 );
			rod( k, [ ia[ 0 ], H - 0.42, ia[ 2 ] ], [ ib[ 0 ], H - 0.05, ib[ 2 ] ], 0.01, 'metal', F, 4 );
			rod( k, a, peak, 0.012, 'metal', F, 4 );
		}
	},

	radio_set( k, o, R ) {
		const OD = 0x3b3f2c;
		k.rbox( 0.26, 0.3, 0.12, 0.012, 'matte', OD, null, null, { seg: 1 } );
		// the front panel: knobs, a display, the connectors
		k.box( 0.2, 0.12, 0.004, 'plastic', 0x1a1c18, [ 0, 0.16, 0.061 ] );
		k.box( 0.08, 0.035, 0.004, 'plastic', 0x5a6a48, [ - 0.04, 0.24, 0.062 ] );
		for ( let i = 0; i < 3; i ++ ) k.part( geo.cylZ( 0.016, 0.022, 8 ), 'plastic', 0x111111, [ - 0.06 + i * 0.06, 0.12, 0.072 ] );
		k.box( 0.27, 0.08, 0.13, 'matte', shade( OD, - 0.15 ), [ 0, - 0.005, 0 ] );
		k.cyl( 0.005, 0.002, 0.9, 'metal', 0x222222, [ - 0.08, 0.3, - 0.03 ], [ 0.12, 0, 0 ], 4 );
		// the handset on its coiled cord
		k.rbox( 0.05, 0.03, 0.2, 0.01, 'plastic', 0x151515, [ 0.26, 0, 0.05 ], [ 0, 0.4, 0 ], { seg: 1 } );
		const pts = [];
		for ( let i = 0; i <= 24; i ++ ) { const t = i / 24, a = t * PI * 18; pts.push( [ 0.08 + t * 0.15 + Math.cos( a ) * 0.012, 0.06 - Math.sin( t * PI ) * 0.04 + Math.sin( a ) * 0.012, 0.04 + t * 0.03 ] ); }
		k.part( geo.tube( pts, 0.003, 48, 3 ), 'plastic', 0x151515, null, null, null, FINE );
	},

	sandbags( k, o, R ) {
		const len = o.len ?? 3, rows = o.rows ?? 3, bl = 0.55, n = Math.max( 1, Math.round( len / ( bl - 0.04 ) ) );
		for ( let r = 0; r < rows; r ++ ) {
			const off = r % 2 ? ( bl - 0.04 ) / 2 : 0, cnt = r % 2 ? n - 1 : n;
			for ( let i = 0; i < cnt; i ++ ) {
				const x = - len / 2 + ( bl - 0.04 ) / 2 + off + i * ( bl - 0.04 );
				// the top row sits less neatly
				const loose = r === rows - 1 ? 0.04 : 0.015;
				bag( k, x + ( R() - 0.5 ) * loose, r * 0.135, ( R() - 0.5 ) * ( 0.03 + loose ), ( R() - 0.5 ) * ( 0.08 + loose * 2 ), R );
				// the tied ears show at the wall's ends
				if ( i === 0 || i === cnt - 1 ) k.box( 0.06, 0.05, 0.12, 'cloth', shade( BAG, - 0.15 ), [ x + ( i === 0 ? - 0.29 : 0.29 ), r * 0.135 + 0.03, 0 ], [ 0, 0, i === 0 ? 0.5 : - 0.5 ] );
			}
		}
		// a bag or two burst or knocked off onto the ground in front
		if ( R() < 0.6 ) bag( k, ( R() - 0.5 ) * len * 0.6, 0, 0.42, R() * 3, R );
		k.collider( len / 2, rows * 0.0675 + 0.02, 0.17, [ 0, rows * 0.0675 + 0.02, 0 ], 0, 'dirt' );
	},

	// HESCO bastions: wire-mesh cells lined with geotextile, bulging with fill, in a row of o.n
	hesco( k, o, R ) {
		const n = o.n ?? 3, S = 1.06, H = 1.37, x0 = - ( n - 1 ) * S / 2;
		const side = ( a, b, c, d ) => k.part( geo.quad( a, b, c, d, 3, 3, ( u, v ) => 0.05 * Math.sin( PI * u ) * Math.sin( PI * Math.min( 1, v * 1.15 ) ) ** 0.8 ), 'print', 0xffffff, null, null, null, { cell: CELLS.hesco } );
		for ( let i = 0; i < n; i ++ ) {
			const cx = x0 + i * S, l = cx - S / 2, r = cx + S / 2, f = S / 2;
			const h = H + ( R() - 0.5 ) * 0.04;
			side( [ l, 0, f ], [ r, 0, f ], [ r, h, f ], [ l, h, f ] );
			side( [ r, 0, - f ], [ l, 0, - f ], [ l, h, - f ], [ r, h, - f ] );
			if ( i === 0 ) side( [ l, 0, - f ], [ l, 0, f ], [ l, h, f ], [ l, h, - f ] );
			if ( i === n - 1 ) side( [ r, 0, f ], [ r, 0, - f ], [ r, h, - f ], [ r, h, f ] );
			// the fill, settled below the rim; the rim's wire
			const fill = geo.grid( 4, 4, ( u, v ) => [ l + 0.04 + u * ( S - 0.08 ), h - 0.08 + vnoise( u * 3 + i * 7, v * 3, 9 ) * 0.07, - f + 0.04 + v * ( S - 0.08 ) ] );
			k.part( inward( fill ), 'matte', 0x6a5638 );
			for ( const z of [ - f, f ] ) k.box( S, 0.012, 0.012, 'metal', 0x8a8c86, [ cx, h, z ] );
			for ( const x of [ l, r ] ) k.box( 0.012, 0.012, S, 'metal', 0x8a8c86, [ x, h, 0 ] );
			// the coiled joining pins at the corners
			for ( const [ x, z ] of [ [ l, f ], [ l, - f ], [ r, f ], [ r, - f ] ] ) k.cyl( 0.012, 0.012, h, 'metal', 0x7a7c76, [ x, 0, z ], null, 4 );
		}
		k.collider( n * S / 2, H / 2, S / 2, [ 0, H / 2, 0 ], 0, 'dirt' );
	},

	// a GP small tent: canvas walls bellying between their poles, a pyramid roof sagging between the hips to the
	// centre pole, a valance at the eaves, the door rolled up, a window, a stovepipe, guyed out all round
	tent_mil( k, o, R ) {
		const c = 0x5b5e3c, W = 4.6, h = W / 2, Hw = 1.55, Ht = 3.0, E = h + 0.14;
		const wall = ( u0, u1, door ) => geo.grid( Math.max( 1, Math.round( ( u1 - u0 ) * 8 ) ), 3, ( u, v ) => {
			const uu = u0 + ( u1 - u0 ) * u, x = - h + uu * W;
			const belly = 0.04 * Math.sin( PI * ( uu * 2 % 1 ) ) * Math.sin( PI * v ) + vnoise( uu * 5, v * 2, 13 ) * 0.02;
			return [ x, v * Hw, h + belly + ( 1 - v ) ** 3 * 0.08 ];
		} );
		for ( let s = 0; s < 4; s ++ ) {
			k.push( null, [ 0, s * HALF, 0 ] );
			if ( s === 0 ) {
				// the door: walls either side, the flap rolled up over the gap and tied
				k.part( wall( 0, 0.37 ), 'cloth', c, null, null, null, { grime: 0.45 } );
				k.part( wall( 0.63, 1 ), 'cloth', c, null, null, null, { grime: 0.45 } );
				k.part( geo.quad( [ - 0.6, Hw - 0.3, h ], [ 0.6, Hw - 0.3, h ], [ 0.6, Hw, h ], [ - 0.6, Hw, h ], 2, 1 ), 'cloth', c );
				k.part( geo.cylX( 0.09, 1.25, 8 ), 'cloth', shade( c, - 0.08 ), [ 0, Hw - 0.36, h + 0.08 ] );
				for ( const x of [ - 0.45, 0.45 ] ) k.box( 0.025, 0.24, 0.005, 'cloth', 0x3a3c28, [ x, Hw - 0.5, h + 0.17 ], null, FINE );
				k.box( 0.5, 0.36, 0.006, 'print', 0xffffff, [ 1.3, 0.75, h + 0.04 ], null, { cell: CELLS.army } );
			} else {
				k.part( wall( 0, 1 ), 'cloth', c, null, null, null, { grime: 0.45 } );
				if ( s !== 2 ) {
					// a screened window, its cover rolled above it
					k.box( 0.9, 0.5, 0.01, 'print', 0x222820, [ 0, 0.75, h + 0.045 ], null, { cell: CELLS.plain } );
					k.part( geo.cylX( 0.05, 1.0, 6 ), 'cloth', shade( c, - 0.08 ), [ 0, 1.3, h + 0.08 ] );
				}
			}
			// the sod cloth lying out along the foot
			k.part( geo.quad( [ - h, 0.02, h + 0.24 ], [ h, 0.02, h + 0.24 ], [ h, 0.03, h + 0.04 ], [ - h, 0.03, h + 0.04 ], 4, 1 ), 'cloth', shade( c, - 0.25 ), null, null, null, { drape: true } );
			// the roof panel from this eave to the peak; the valance below it
			k.part( geo.quad( [ - E, Hw - 0.04, E ], [ E, Hw - 0.04, E ], [ 0, Ht, 0 ], [ 0, Ht, 0 ], 6, 5, ( u, v ) => - 0.09 * Math.sin( PI * u ) * Math.sin( PI * Math.min( 1, v * 1.1 ) ) ), 'cloth', shade( c, 0.07 ) );
			k.part( geo.quad( [ - E, Hw - 0.2, E + 0.01 ], [ E, Hw - 0.2, E + 0.01 ], [ E, Hw - 0.03, E ], [ - E, Hw - 0.03, E ], 4, 1 ), 'cloth', shade( c, - 0.05 ) );
			// guy lines from the eave's corner and middle to wooden stakes
			guy( k, [ - E, Hw - 0.05, E ], - E - 1.0, E + 1.0, true );
			guy( k, [ 0, Hw - 0.05, E + 0.02 ], 0, E + 1.35, true );
			k.pop();
		}
		// inside: a dark lining, the floor, the centre pole, a cot, all seen through the door
		k.part( inward( geo.box( W - 0.1, Hw, W - 0.1 ) ), 'matte', 0x23241c );
		k.part( inward( new THREE.ConeGeometry( ( W - 0.1 ) / Math.SQRT2, Ht - Hw, 4, 1, true ).rotateY( PI / 4 ).translate( 0, Hw + ( Ht - Hw ) / 2, 0 ) ), 'matte', 0x2a2b22 );
		k.cyl( 0.05, 0.05, Ht, 'wood', 0x6a5440, null, null, 6 );
		k.push( [ 0.9, 0, 0.7 ], [ 0, HALF + 0.1, 0 ] ); PROPS.cot( k, { bare: true }, R ); k.boxes.pop(); k.pop();
		// the stove jack, its pipe and rain cap
		const sy = Hw + ( Ht - Hw ) * ( 1 - Math.max( 1.0, 0.6 ) / E );
		k.box( 0.4, 0.02, 0.4, 'cloth', 0x3a3c28, [ 1.0, sy - 0.02, - 0.6 ], [ 0.55, 0, 0 ] );
		k.cyl( 0.06, 0.06, 0.95, 'metal', 0x3a3a3a, [ 1.0, sy - 0.15, - 0.6 ], null, 8 );
		k.part( geo.cone( 0.13, 0.1, 8 ), 'metal', 0x2a2a2a, [ 1.0, sy + 0.86, - 0.6 ] );
		k.groundDecal( 'trampled', 0, h + 1.0, 2.6, R() * 6 );
		k.groundDecal( 'boots', 0.4, h + 1.6, 2.2, R() * 6 );
		k.collider( h, Hw / 2, 0.06, [ 0, Hw / 2, - h ], 0, 'wood', 'noclimb' );
		k.collider( 0.06, Hw / 2, h, [ - h, Hw / 2, 0 ], 0, 'wood', 'noclimb' );
		k.collider( 0.06, Hw / 2, h, [ h, Hw / 2, 0 ], 0, 'wood', 'noclimb' );
		for ( const x of [ - 1.45, 1.45 ] ) k.collider( 0.85, Hw / 2, 0.06, [ x, Hw / 2, h ], 0, 'wood', 'noclimb' );
	},

	// a wooden ammunition crate: planked, cleated ends, rope beckets, hasps, stencilled
	crate_mil( k, o ) {
		const c = 0x4f5530, W = 0.9, H = 0.48, D = 0.48;
		k.box( W - 0.06, H, D, 'wood', c );
		// the stencilled faces and lid
		for ( const z of [ - 1, 1 ] ) k.box( W - 0.08, H - 0.02, 0.004, 'print', 0xffffff, [ 0, 0.01, z * ( D / 2 + 0.002 ) ], z < 0 ? [ 0, PI, 0 ] : null, { cell: z > 0 ? CELLS.ammo : CELLS.army } );
		k.box( W - 0.1, 0.004, D - 0.04, 'print', 0xffffff, [ 0, H + 0.001, 0 ], [ - HALF, 0, 0 ], { cell: CELLS.army } );
		k.box( W - 0.04, 0.012, 0.012, 'wood', shade( c, - 0.4 ), [ 0, H - 0.08, D / 2 + 0.004 ] );
		// cleats round the ends, rope beckets, hasps
		for ( const x of [ - 1, 1 ] ) {
			k.box( 0.04, H + 0.02, D + 0.02, 'wood', shade( c, - 0.12 ), [ x * ( W / 2 - 0.02 ), 0, 0 ] );
			k.part( geo.torus( 0.05, 0.009, 4, 8, PI ), 'cloth', 0xa89a78, [ x * ( W / 2 + 0.005 ), 0.3, 0 ], [ PI, x * HALF, 0 ] );
		}
		for ( const x of [ - 0.25, 0.25 ] ) { k.box( 0.05, 0.08, 0.008, 'metal', 0x2a2a2a, [ x, H - 0.1, D / 2 + 0.006 ] ); k.box( 0.04, 0.012, 0.03, 'metal', 0x2a2a2a, [ x, H - 0.005, D / 2 - 0.01 ] ); }
		k.collider( 0.45, 0.25, 0.25, [ 0, 0.25, 0 ], 0, 'wood' );
	},

	// M2A1 ammo cans: lid lip, latch lever, folding handle, a stencilled side; the top one open
	ammo_cans( k, o, R ) {
		const OD = 0x4c5232;
		const can = ( x, y, z, yaw, open ) => {
			k.push( [ x, y, z ], [ 0, yaw, 0 ] );
			k.box( 0.29, 0.17, 0.15, 'matte', OD, null, null, { grime: 0.1 } );
			for ( const s of [ - 1, 1 ] ) k.box( 0.27, 0.15, 0.002, 'print', 0xffffff, [ 0, 0.01, s * 0.076 ], s < 0 ? [ 0, PI, 0 ] : null, { cell: CELLS.ammo_can } );
			if ( open ) {
				k.part( inward( geo.box( 0.27, 0.16, 0.13 ) ), 'matte', 0x1e2014, [ 0, 0.015, 0 ] );
				k.push( [ 0, 0.17, - 0.075 ], [ - 1.9, 0, 0 ] ); k.box( 0.3, 0.03, 0.155, 'matte', OD, [ 0, 0, 0.0775 ] ); k.pop();
			} else {
				k.box( 0.3, 0.03, 0.155, 'matte', OD, [ 0, 0.165, 0 ] );
				k.box( 0.12, 0.012, 0.02, 'matte', shade( OD, - 0.3 ), [ 0, 0.2, 0 ] );
			}
			k.box( 0.015, 0.1, 0.05, 'matte', shade( OD, - 0.2 ), [ 0.152, 0.08, 0 ] );
			k.pop();
		};
		can( - 0.09, 0, ( R() - 0.5 ) * 0.04, ( R() - 0.5 ) * 0.1, false );
		can( 0.09, 0, ( R() - 0.5 ) * 0.04, HALF + ( R() - 0.5 ) * 0.1, false );
		can( 0, 0.2, 0, 0.3 + ( R() - 0.5 ) * 0.3, R() < 0.5 );
	},

	barrel( k, o, R ) {
		const c = o.c ?? 0x4f5530;
		// a little dented, rusting at the chime
		const g = geo.cyl( 0.29, 0.29, 0.88, 16 );
		const p = g.attributes.position, seed = Math.floor( R() * 99 );
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i ); if ( Math.hypot( x, z ) > 0.2 ) { const f = 1 - vnoise( Math.atan2( z, x ) * 2, y * 4, seed ) * 0.04; p.setX( i, x * f ); p.setZ( i, z * f ); } }
		g.computeVertexNormals();
		k.part( g, 'paint', c, null, null, null, { grime: 0.35 } );
		for ( const y of [ 0.29, 0.59 ] ) k.part( geo.torus( 0.292, 0.012, 4, 20 ), 'paint', shade( c, - 0.1 ), [ 0, y, 0 ], [ HALF, 0, 0 ] );
		for ( const y of [ 0.005, 0.88 ] ) k.part( geo.torus( 0.28, 0.014, 4, 20 ), 'metal', 0x5a4434, [ 0, y, 0 ], [ HALF, 0, 0 ] );
		k.cyl( 0.03, 0.03, 0.012, 'metal', 0x2a2a2a, [ 0.15, 0.88, 0.05 ], null, 8 );
		k.cyl( 0.02, 0.02, 0.012, 'metal', 0x2a2a2a, [ - 0.17, 0.88, - 0.04 ], null, 6 );
		k.collider( 0.29, 0.44, 0.29, [ 0, 0.44, 0 ], 0, 'metal' );
	},

	// camouflage netting on poles with spreaders: peaked over each pole, sagging between, its skirt pulled down to
	// pegs; the garnish cut through so the light comes dappled
	camo_net( k, o, R ) {
		const w = o.w ?? 4.6, d = o.d ?? 4;
		const poles = [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ].map( ( [ x, z ] ) => [ x * w * 0.36, z * d * 0.36, 2.05 + ( R() - 0.5 ) * 0.15 ] );
		poles.push( [ ( R() - 0.5 ) * 0.4, ( R() - 0.5 ) * 0.4, 2.35 ] );
		const g = geo.grid( 12, 10, ( u, v ) => {
			const x = ( u - 0.5 ) * w, z = ( v - 0.5 ) * d;
			let y = 0;
			for ( const [ px, pz, ph ] of poles ) y = Math.max( y, ph - Math.hypot( x - px, z - pz ) ** 1.35 * 0.32 );
			// the skirt drops to the ground near the edges
			const e = Math.max( Math.abs( u - 0.5 ), Math.abs( v - 0.5 ) ) * 2;
			if ( e > 0.8 ) y *= 1 - ( ( e - 0.8 ) / 0.2 ) ** 1.5 * 0.55;
			return [ x, y + ( vnoise( x * 1.5, z * 1.5, 5 ) - 0.5 ) * 0.14 + k.groundAt( x, z ) * ( e > 0.8 ? 1 : 0 ), z ];
		} );
		k.part( g, 'print', 0xffffff, null, null, null, { cell: CELLS.camo_net } );
		for ( const [ x, z, ph ] of poles ) {
			k.cyl( 0.025, 0.025, ph - 0.03, 'wood', 0x5a4a34, [ x, 0, z ], null, 5 );
			k.cyl( 0.16, 0.16, 0.02, 'plastic', 0x2e3222, [ x, ph - 0.05, z ], null, 8 );
		}
		for ( const [ x, z ] of [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ] ) {
			const ex = x * w / 2, ez = z * d / 2;
			guy( k, [ ex, k.groundAt( ex, ez ) + 0.9, ez ], ex + x * 0.6, ez + z * 0.6 );
		}
	},

	// concertina wire on screw pickets, the coils a little uneven
	razor_wire( k, o, R ) {
		const len = o.len ?? 3, turns = Math.round( len / 0.22 ), pts = [];
		const n = turns * 8;
		for ( let i = 0; i <= n; i ++ ) {
			const t = i / n, a = t * turns * PI * 2, rr = 0.4 * ( 1 + ( vnoise( t * turns, 0.5, 21 ) - 0.5 ) * 0.2 ) * ( 1 - Math.sin( t * PI ) * 0.06 );
			pts.push( [ - len / 2 + t * len, 0.42 + Math.sin( a ) * rr, Math.cos( a ) * rr ] );
		}
		k.part( geo.tube( pts, 0.005, n, 3 ), 'metal', 0x9a9ea2 );
		for ( const x of [ - len / 2, len / 2 ] ) {
			k.box( 0.04, 1.0, 0.025, 'matte', 0x3a3f2a, [ x, 0, 0 ] );
			for ( const y of [ 0.3, 0.6, 0.9 ] ) k.box( 0.06, 0.02, 0.04, 'matte', 0x3a3f2a, [ x, y, 0 ] );
		}
		k.collider( len / 2, 0.42, 0.42, [ 0, 0.42, 0 ], 0, 'metal', 'noclimb' );
	},

	// a sign wired to a picket
	warn_sign( k, o ) {
		k.box( 0.04, 1.3, 0.025, 'matte', 0x3a3f2a );
		k.box( 0.5, 0.5, 0.006, 'print', 0xffffff, [ 0, 0.85, 0.02 ], [ 0, 0, 0.04 ], { cell: CELLS[ o.cell ] ?? CELLS.restricted } );
		k.collider( 0.03, 0.65, 0.03, [ 0, 0.65, 0 ], 0, 'metal' );
	},

	flag_pole( k, o, R ) {
		k.cyl( 0.035, 0.03, 5.2, 'metal', 0xb8bcc2, null, null, 8 );
		k.part( geo.sph( 0.06, 8, 6 ), 'metal', 0xc8a040, [ 0, 5.22, 0 ] );
		k.box( 0.04, 0.12, 0.03, 'metal', 0x8a8e92, [ 0.04, 1.2, 0 ] );
		rod( k, [ 0.04, 1.26, 0 ], [ 0.04, 5.15, 0 ], 0.003, 'matte', 0xe8e4d8, 3, FINE );
		// the flag on the trade wind, rippling, its fly end dropping
		const L = 1.5, Wf = 0.8, top = 5.05, droop = 0.35 + R() * 0.25, ph = R() * 6;
		k.push( [ 0.04, 0, 0 ], [ 0, R() * 6, 0 ] );
		const g = geo.grid( 10, 4, ( u, v ) => {
			const x = u * L * Math.cos( droop * u ), y = top - ( 1 - v ) * Wf - Math.sin( droop * u ) * u * L * 0.6;
			return [ x, y, Math.sin( u * 9 + ph + v * 0.8 ) * 0.09 * u ];
		} );
		k.part( g, 'print', 0xffffff, null, null, null, { cell: CELLS.flag } );
		k.pop();
	},

	// ---- relief and FEMA ---------------------------------------------------------------------------------------------------

	// a relief frame tent: white walls drawn taut on their poles and sagging between, a gabled roof sagging between
	// rafters, a blue band at the eaves and the foot, clear windows, the door rolled up; pegged and weighted
	tent_fema( k, o, R ) {
		const c = 0xe6e3da, W = 6, D = 4.2, Hw = 2.0, Ht = 3.1, hw = W / 2, hd = D / 2, BLUE = 0x2a4f8a;
		const sagU = ( uu, n ) => Math.abs( Math.sin( PI * uu * n ) ) ** 0.7;
		const longWall = ( z, s, u0, u1 ) => geo.grid( Math.max( 2, Math.round( ( u1 - u0 ) * 12 ) ), 3, ( u, v ) => {
			const uu = u0 + ( u1 - u0 ) * u, x = s * ( - hw + uu * W );
			return [ x, v * Hw, z * ( hd - 0.03 * sagU( uu, 3 ) * Math.sin( PI * v ) ** 0.5 ) ];
		} );
		// the front long wall around its door, the back wall whole
		k.part( longWall( 1, 1, 0, 0.36 ), 'cloth', c, null, null, null, { grime: 0.35 } );
		k.part( longWall( 1, 1, 0.64, 1 ), 'cloth', c, null, null, null, { grime: 0.35 } );
		k.part( geo.quad( [ - 0.85, Hw - 0.18, hd ], [ 0.85, Hw - 0.18, hd ], [ 0.85, Hw, hd ], [ - 0.85, Hw, hd ], 2, 1 ), 'cloth', c );
		k.part( longWall( - 1, - 1, 0, 1 ), 'cloth', c, null, null, null, { grime: 0.35 } );
		// gable ends
		for ( const s of [ - 1, 1 ] ) {
			k.part( geo.quad( [ s * hw, 0, s * hd ], [ s * hw, 0, - s * hd ], [ s * hw, Hw, - s * hd ], [ s * hw, Hw, s * hd ], 4, 3, ( u, v ) => - 0.03 * sagU( u, 2 ) * Math.sin( PI * v ) ), 'cloth', c, null, null, null, { grime: 0.35 } );
			k.part( geo.quad( [ s * hw, Hw, s * ( hd + 0.1 ) ], [ s * hw, Hw, - s * ( hd + 0.1 ) ], [ s * hw, Ht, 0 ], [ s * hw, Ht, 0 ], 4, 2 ), 'cloth', shade( c, - 0.03 ) );
		}
		// the roof slopes, sagging between four rafters, and the blue bands
		for ( const s of [ - 1, 1 ] ) {
			k.part( geo.quad( [ - s * ( hw + 0.1 ), Hw - 0.05, s * ( hd + 0.12 ) ], [ s * ( hw + 0.1 ), Hw - 0.05, s * ( hd + 0.12 ) ], [ s * ( hw + 0.1 ), Ht, 0 ], [ - s * ( hw + 0.1 ), Ht, 0 ], 12, 4, ( u, v ) => - 0.05 * sagU( u, 3 ) * Math.sin( PI * v ) ), 'cloth', shade( c, - 0.05 ) );
			k.box( W + 0.2, 0.18, 0.02, 'cloth', BLUE, [ 0, Hw - 0.25, s * ( hd + 0.01 ) ] );
			k.box( W, 0.25, 0.02, 'cloth', BLUE, [ 0, 0, s * ( hd + 0.005 ) ], null, { grime: 0.4 } );
			k.box( 0.02, 0.25, D, 'cloth', BLUE, [ s * ( hw + 0.005 ), 0, 0 ], null, { grime: 0.4 } );
		}
		// the door rolled and strapped up, a dark inside with a cot in view
		k.part( geo.cylX( 0.11, 1.75, 8 ), 'cloth', shade( c, - 0.06 ), [ 0, Hw - 0.24, hd + 0.1 ] );
		for ( const x of [ - 0.6, 0.6 ] ) k.box( 0.04, 0.3, 0.005, 'cloth', 0x2a4f8a, [ x, Hw - 0.42, hd + 0.21 ] );
		k.part( inward( geo.box( W - 0.08, Hw, D - 0.08 ) ), 'matte', 0x2a2c30 );
		k.part( inward( geo.quad( [ hw - 0.04, Hw, hd - 0.04 ], [ - hw + 0.04, Hw, hd - 0.04 ], [ - hw + 0.04, Ht - 0.05, 0 ], [ hw - 0.04, Ht - 0.05, 0 ], 1, 1 ) ), 'matte', 0x33353a );
		k.part( inward( geo.quad( [ - hw + 0.04, Hw, - hd + 0.04 ], [ hw - 0.04, Hw, - hd + 0.04 ], [ hw - 0.04, Ht - 0.05, 0 ], [ - hw + 0.04, Ht - 0.05, 0 ], 1, 1 ) ), 'matte', 0x33353a );
		k.push( [ - 0.4, 0, 1.0 ], [ 0, 0.05, 0 ] ); PROPS.cot( k, {}, R ); k.boxes.pop(); k.pop();
		// clear windows on the front and back, some with their covers down
		for ( const z of [ - 1, 1 ] ) for ( const x of [ - 2.1, 2.1 ] ) {
			k.box( 0.9, 0.6, 0.006, 'plastic', 0x34414c, [ x, 1.0, z * ( hd + 0.012 ) ] );
			if ( R() < 0.4 ) k.box( 0.94, 0.64, 0.008, 'cloth', c, [ x, 0.98, z * ( hd + 0.02 ) ] );
			else k.part( geo.cylX( 0.05, 0.96, 6 ), 'cloth', shade( c, - 0.05 ), [ x, 1.66, z * ( hd + 0.05 ) ] );
		}
		// a FEMA panel or a first-aid cross
		if ( o.sign ) k.box( 0.9, 0.9, 0.01, 'print', 0xffffff, [ 1.1, 0.95, hd + 0.03 ], null, { cell: CELLS.fema } );
		else if ( R() < 0.4 ) k.box( 0.8, 0.8, 0.01, 'print', 0xffffff, [ 1.1, 0.95, hd + 0.03 ], null, { cell: CELLS.medical } );
		// guys and pegs along the walls; sandbags weighting the front corners
		for ( const s of [ - 1, 1 ] ) for ( const x of [ - hw, 0, hw ] ) guy( k, [ x * 0.98, Hw - 0.05, s * ( hd + 0.1 ) ], x * 1.12, s * ( hd + 1.0 ) );
		for ( const x of [ - hw, hw ] ) { bag( k, x, 0, hd + 0.25, 0.1, R, 0x8a8f96 ); if ( R() < 0.6 ) bag( k, x + 0.05, 0.13, hd + 0.25, 0.3, R, 0x8a8f96 ); }
		k.groundDecal( 'boots', 0, hd + 1.2, 2.8, R() * 6 );
		k.collider( W / 2, Ht / 2, D / 2, [ 0, Ht / 2, 0 ], 0, 'wood', 'noclimb' );
	},

	// a cot with its canvas sagging; often somebody's blanket and pillow still on it
	cot( k, o, R ) {
		const F = o.c ?? 0x5a5e44, M = 'metal';
		for ( const z of [ - 0.33, 0.33 ] ) rod( k, [ - 0.95, 0.42, z ], [ 0.95, 0.42, z ], 0.014, M, 0x8a8e92, 6 );
		for ( const x of [ - 0.95, 0.95 ] ) rod( k, [ x, 0.42, - 0.33 ], [ x, 0.42, 0.33 ], 0.012, M, 0x8a8e92, 5 );
		for ( const x of [ - 0.8, 0, 0.8 ] ) { rod( k, [ x, 0, - 0.33 ], [ x, 0.42, 0.33 ], 0.01, M, 0x8a8e92, 5 ); rod( k, [ x, 0, 0.33 ], [ x, 0.42, - 0.33 ], 0.01, M, 0x8a8e92, 5 ); }
		k.part( geo.quad( [ - 0.95, 0.43, 0.33 ], [ 0.95, 0.43, 0.33 ], [ 0.95, 0.43, - 0.33 ], [ - 0.95, 0.43, - 0.33 ], 6, 3, ( u, v ) => - Math.sin( PI * v ) * ( 0.035 + 0.015 * Math.sin( PI * u ) ) ), 'cloth', F );
		if ( ! o.bare && R ) {
			const k2 = R();
			if ( k2 < 0.45 ) k.rbox( 0.42, 0.09, 0.5, 0.04, 'cloth', pickc( R, [ 0x6a7280, 0x8a4a3a, 0x5a6a4a, 0x7a6a5a ] ), [ - 0.65, 0.39, 0 ], [ 0, ( R() - 0.5 ) * 0.3, 0 ], { seg: 1 } );
			else if ( k2 < 0.75 ) {
				// a blanket thrown back over the foot
				k.part( sheet( 1.1, 0.8, 6, 4, ( x, z ) => 0.03 + vnoise( x * 4, z * 4, 3 ) * 0.07 - Math.max( 0, Math.abs( z ) - 0.33 ) * 1.2 ), 'cloth', pickc( R, [ 0x6a7280, 0x8a4a3a, 0x5a6a4a ] ), [ - 0.35, 0.39, 0 ] );
			}
			if ( R() < 0.6 ) k.rbox( 0.24, 0.08, 0.42, 0.04, 'cloth', 0xe8e6e0, [ 0.72, 0.4, 0 ], [ 0, 0, - 0.12 ], { seg: 1 } );
		}
		k.collider( 0.95, 0.22, 0.33, [ 0, 0.22, 0 ], 0, 'wood' );
	},

	pallet( k, o, R ) {
		for ( const z of [ - 0.45, 0, 0.45 ] ) k.box( 1.2, 0.09, 0.09, 'wood', 0x9c8162, [ 0, 0, z ] );
		for ( let i = 0; i < 7; i ++ ) k.box( 0.13, 0.022, 1.0, 'wood', shade( 0xb59a74, ( R() - 0.5 ) * 0.15 ), [ - 0.54 + i * 0.18, 0.09, 0 ] );
		for ( const x of [ - 0.54, 0, 0.54 ] ) k.box( 0.13, 0.02, 1.0, 'wood', 0x9c8162, [ x, - 0.002, 0 ] );
		k.collider( 0.6, 0.056, 0.5, [ 0, 0.056, 0 ], 0, 'wood' );
	},

	// a pallet of rations or water under shrink wrap, the wrap torn off the top layer that's been taken from
	pallet_load( k, o, R ) {
		PROPS.pallet( k, o, R );
		k.boxes.pop();
		const y0 = 0.112;
		let topY = 0;
		if ( o.load === 'water' ) {
			// water jugs, capped, two layers on a slip sheet
			for ( let r = 0; r < 2; r ++ ) for ( let i = 0; i < 3; i ++ ) for ( let j = 0; j < 3; j ++ ) {
				if ( r === 1 && i === 2 && j > 0 ) continue;
				const p = [ - 0.36 + i * 0.36, y0 + r * 0.47, - 0.32 + j * 0.32 ];
				k.part( geo.lathe( [ [ 0.14, 0 ], [ 0.145, 0.04 ], [ 0.14, 0.34 ], [ 0.06, 0.42 ], [ 0.03, 0.44 ], [ 0, 0.44 ] ], 10 ), 'plastic', 0x6aa0d8, p );
				k.cyl( 0.035, 0.035, 0.03, 'plastic', 0x1f4fa8, [ p[ 0 ], p[ 1 ] + 0.44, p[ 2 ] ], null, 6 );
			}
			k.box( 1.12, 0.01, 0.98, 'print', 0xffffff, [ 0, y0 + 0.455, 0 ], null, { cell: CELLS.carton } );
			topY = y0 + 0.47;
			k.collider( 0.6, 0.5, 0.5, [ 0, 0.5, 0 ], 0, 'wood' );
		} else {
			// cases in a stack, the top layer half taken
			const cells = [ CELLS.hdr, CELLS.mre, CELLS.carton, CELLS.water ];
			for ( let r = 0; r < 3; r ++ ) for ( let i = 0; i < 3; i ++ ) for ( let j = 0; j < 2; j ++ ) {
				if ( r === 2 && ( i + j ) % 2 ) continue;
				k.box( 0.38, 0.3, 0.46, 'print', 0xffffff, [ - 0.4 + i * 0.4, y0 + r * 0.3, - 0.24 + j * 0.48 ], [ 0, ( R() - 0.5 ) * 0.05, 0 ], { cell: cells[ ( i + j * 2 + r ) % cells.length ] } );
			}
			topY = y0 + 0.6;
			k.collider( 0.6, 0.5, 0.5, [ 0, 0.5, 0 ], 0, 'wood' );
		}
		// the wrap: round the lower layers, its top edge ragged where it was cut, a torn flap hanging
		const wx = 0.61, wz = 0.5, wy0 = y0 + 0.03;
		const wrap = ( a, b, flip ) => geo.grid( 6, 3, ( u, v ) => {
			const x = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * u, z = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * u;
			const top = topY - 0.04 - vnoise( u * 5 + flip * 3, 0, 17 ) * 0.12;
			const bulge = Math.sin( PI * u ) * 0.012 * Math.sin( PI * v );
			const nx = flip === 0 || flip === 2 ? 0 : flip === 1 ? 1 : - 1, nz = flip === 0 ? 1 : flip === 2 ? - 1 : 0;
			return [ x + nx * bulge, wy0 + ( top - wy0 ) * v, z + nz * bulge ];
		} );
		k.part( wrap( [ - wx, wz ], [ wx, wz ], 0 ), 'film', 0xf4f6f8 );
		k.part( wrap( [ wx, wz ], [ wx, - wz ], 1 ), 'film', 0xf4f6f8 );
		k.part( wrap( [ wx, - wz ], [ - wx, - wz ], 2 ), 'film', 0xf4f6f8 );
		k.part( wrap( [ - wx, - wz ], [ - wx, wz ], 3 ), 'film', 0xf4f6f8 );
		k.part( geo.quad( [ wx * 0.2, topY - 0.45, wz + 0.04 ], [ wx * 0.6, topY - 0.5, wz + 0.06 ], [ wx * 0.65, topY - 0.08, wz + 0.01 ], [ wx * 0.25, topY - 0.1, wz + 0.01 ], 2, 2, ( u, v ) => Math.sin( PI * u ) * 0.03 ), 'film', 0xf4f6f8 );
	},

	generator( k, o, R ) {
		const Y = 0xd9a52a, F = 0x1a1a1a;
		for ( const z of [ - 0.25, 0.25 ] ) { rod( k, [ - 0.35, 0.05, z ], [ 0.35, 0.05, z ], 0.015, 'metal', F, 6 ); rod( k, [ - 0.35, 0.55, z ], [ 0.35, 0.55, z ], 0.015, 'metal', F, 6 ); }
		for ( const x of [ - 0.35, 0.35 ] ) for ( const z of [ - 0.25, 0.25 ] ) rod( k, [ x, 0.05, z ], [ x, 0.55, z ], 0.015, 'metal', F, 6 );
		k.rbox( 0.42, 0.3, 0.36, 0.03, 'metal', 0x3a3a3a, [ - 0.08, 0.06, 0 ], null, { seg: 1 } );
		k.rbox( 0.5, 0.16, 0.38, 0.05, 'plastic', Y, [ 0, 0.42, 0 ], null, { seg: 1, grime: 0.2 } );
		k.cyl( 0.04, 0.04, 0.03, 'plastic', 0x1a1a1a, [ 0.12, 0.58, 0.05 ], null, 8 );
		k.box( 0.18, 0.2, 0.3, 'plastic', Y, [ 0.22, 0.12, 0 ] );
		// the control panel: outlets, a breaker; the muffler; the pull start
		k.box( 0.01, 0.16, 0.24, 'plastic', 0x222222, [ 0.32, 0.14, 0 ] );
		for ( const z of [ - 0.06, 0.06 ] ) k.box( 0.012, 0.04, 0.04, 'plastic', 0x5a5a5a, [ 0.326, 0.2, z ] );
		k.part( geo.cylZ( 0.05, 0.22, 8 ), 'metal', 0x4a4038, [ - 0.25, 0.3, 0.12 ] );
		k.box( 0.06, 0.02, 0.02, 'plastic', 0x111111, [ - 0.3, 0.25, - 0.2 ] );
		// a power lead snaking off across the ground
		const pts = [], a = R() * PI * 2;
		for ( let i = 0; i <= 8; i ++ ) { const t = i / 8, x = 0.33 + Math.cos( a ) * t * 3.2 + Math.sin( t * 7 ) * 0.2, z = Math.sin( a ) * t * 3.2 + Math.cos( t * 5 ) * 0.25; pts.push( [ x, k.groundAt( x, z ) + ( i === 0 ? 0.2 : 0.012 ), z ] ); }
		k.part( geo.tube( pts, 0.009, 16, 4 ), 'plastic', 0x1a1a1a, null, null, null, FINE );
		k.collider( 0.37, 0.3, 0.27, [ 0, 0.3, 0 ], 0, 'metal' );
	},

	sign_board( k, o, R ) {
		const cell = CELLS[ o.cell ] ?? CELLS.fema;
		for ( const x of [ - 0.75, 0.75 ] ) { k.box( 0.08, 1.9, 0.08, 'wood', 0x7a6248, [ x, 0, 0 ], null, { grime: 0.3 } ); k.collider( 0.05, 0.95, 0.05, [ x, 0.95, 0 ], 0, 'wood' ); }
		k.box( 1.6, 1.0, 0.025, 'wood', 0xc9b48e, [ 0, 0.85, 0 ] );
		k.box( 1.5, 0.92, 0.005, 'print', 0xffffff, [ 0, 0.89, 0.015 ], null, { cell } );
		// flyers taped to the posts and the back
		k.box( 0.5, 0.5, 0.004, 'print', 0xffffff, [ 0, 1.1, - 0.016 ], [ 0, PI, 0.05 ], { cell: CELLS.missing } );
		if ( R && R() < 0.7 ) k.box( 0.2, 0.28, 0.003, 'print', 0xffffff, [ 0.75, 0.55, 0.042 ], [ 0, 0, 0.06 ], { cell: CELLS.news } );
	},

	porta_potty( k, o, R ) {
		const B = 0x2e6fb8;
		k.rbox( 1.1, 2.2, 1.1, 0.04, 'plastic', B, null, null, { seg: 1, grime: 0.35 } );
		// moulded ribs down the sides, the white roof, the door with its latch and indicator
		for ( const s of [ - 1, 1 ] ) for ( const z of [ - 0.3, 0, 0.3 ] ) k.box( 0.02, 1.9, 0.06, 'plastic', shade( B, - 0.1 ), [ s * 0.555, 0.15, z ] );
		k.rbox( 1.16, 0.14, 1.16, 0.05, 'plastic', 0xe8e8e2, [ 0, 2.2, 0 ], null, { seg: 1 } );
		k.box( 0.8, 1.9, 0.02, 'plastic', shade( B, - 0.12 ), [ 0, 0.1, 0.555 ] );
		for ( let i = 0; i < 4; i ++ ) k.box( 0.5, 0.025, 0.02, 'plastic', shade( B, - 0.3 ), [ 0, 1.75 + i * 0.06, 0.567 ] );
		k.box( 0.04, 0.12, 0.04, 'plastic', 0x222222, [ 0.3, 1.05, 0.58 ] );
		k.box( 0.1, 0.04, 0.01, 'plastic', R && R() < 0.5 ? 0x2a9a3a : 0xc0281e, [ 0.3, 1.2, 0.57 ] );
		for ( const y of [ 0.3, 1.7 ] ) k.box( 0.05, 0.12, 0.03, 'metal', 0x9a9a9a, [ - 0.38, y, 0.57 ] );
		k.cyl( 0.05, 0.05, 0.4, 'plastic', 0x222222, [ - 0.4, 2.25, - 0.35 ], null, 8 );
		k.collider( 0.55, 1.15, 0.55, [ 0, 1.15, 0 ], 0, 'wood' );
	},

	// ---- farm and park -------------------------------------------------------------------------------------------------------

	farm_stand( k, o, R ) {
		const post = 0x6e5a44, top = 0x8f7a5e, W = 2.6, D = 0.95;
		for ( const [ x, z, h ] of [ [ - W / 2, 0.42, 2.05 ], [ W / 2, 0.42, 2.05 ], [ - W / 2, - 0.45, 2.3 ], [ W / 2, - 0.45, 2.3 ] ] ) {
			k.box( 0.09, h, 0.09, 'wood', post, [ x, 0, z ], null, { grime: 0.3 } );
			k.collider( 0.05, h / 2, 0.05, [ x, h / 2, z ], 0, 'wood' );
		}
		for ( let i = 0; i < 6; i ++ ) k.box( W + 0.1, 0.03, D / 6 - 0.008, 'wood', shade( top, ( R() - 0.5 ) * 0.15 ), [ 0, 0.82, - D / 2 + D / 12 + i * D / 6 ] );
		for ( let i = 0; i < 4; i ++ ) k.box( W, 0.18, 0.02, 'wood', shade( 0x7d6a50, ( R() - 0.5 ) * 0.15 ), [ 0, 0.06 + i * 0.19, D / 2 - 0.02 ], null, { grime: 0.35 } );
		k.collider( W / 2 + 0.05, 0.43, D / 2, [ 0, 0.43, 0 ], 0, 'wood' );
		// a rusting corrugated roof on purlins
		const roof = sheet( W + 0.6, 1.5, 28, 2, ( x ) => Math.abs( Math.sin( x * 16 ) ) * 0.022 );
		k.part( roof, 'metal', 0x8a6a4e, [ 0, 2.18, 0 ], [ 0.17, 0, 0 ] );
		k.part( roof.clone(), 'metal', 0x6a5440, [ 0, 2.17, 0 ], [ 0.17, 0, 0 ], [ 1, - 1, 1 ] );
		for ( const z of [ 0.42, - 0.45 ] ) k.box( W + 0.2, 0.08, 0.06, 'wood', post, [ 0, z > 0 ? 2.03 : 2.27, z ] );
		const cell = [ CELLS.fruit, CELLS.papaya, CELLS.fruit ][ ( o.sign ?? 0 ) % 3 ];
		k.box( 1.7, 0.46, 0.025, 'wood', 0xb89a70, [ 0, 1.56, 0.5 ] );
		k.box( 1.6, 0.4, 0.005, 'print', 0xffffff, [ 0, 1.59, 0.515 ], null, { cell } );
		for ( const x of [ - 0.7, 0.7 ] ) rod( k, [ x, 2.02, 0.5 ], [ x, 1.79, 0.5 ], 0.004, 'metal', 0x555555, 3 );
		// a bunch of bananas hung from the beam on a cord
		rod( k, [ - 0.85, 2.02, 0.2 ], [ - 0.85, 1.62, 0.2 ], 0.004, 'matte', ROPE, 3, FINE );
		k.cyl( 0.025, 0.02, 0.5, 'wood', 0x5a6a2a, [ - 0.85, 1.15, 0.2 ], null, 5 );
		for ( let i = 0; i < 4; i ++ ) banana( k, [ - 0.85, 1.25 + i * 0.1, 0.2 ], i * 1.6 + R(), R, 0x9ab03a );
		// the price board leaning on the counter, cartons under it
		k.box( 0.6, 0.6, 0.02, 'print', 0xffffff, [ 1.0, 0.0, D / 2 + 0.2 ], [ - 0.18, - 0.15, 0 ], { cell: CELLS.chalk } );
		k.box( 0.5, 0.35, 0.4, 'print', 0xffffff, [ - 0.6, 0, - 0.1 ], [ 0, 0.1, 0 ], { cell: CELLS.carton } );
		k.box( 0.5, 0.35, 0.4, 'print', 0xffffff, [ 0.3, 0, - 0.05 ], [ 0, - 0.06, 0 ], { cell: CELLS.carton } );
	},

	produce_crate( k, o, R ) {
		const W = 0.55, D = 0.38, H = 0.26;
		for ( const z of [ - D / 2, D / 2 ] ) for ( const y of [ 0.02, 0.15 ] ) k.box( W, 0.09, 0.015, 'wood', 0xb39466, [ 0, y, z ] );
		for ( const x of [ - W / 2, W / 2 ] ) k.box( 0.02, H, D, 'wood', 0x9c8058, [ x, 0, 0 ] );
		k.box( W, 0.015, D, 'wood', 0xa58a62, [ 0, 0.01, 0 ] );
		const f = ( o.fruit ?? 0 ) % 4;
		if ( f === 0 ) {
			// hands of apple bananas
			for ( let i = 0; i < 3; i ++ ) banana( k, [ - 0.15 + i * 0.15, 0.14 + R() * 0.03, ( R() - 0.5 ) * 0.1 ], R() * 6, R, 0xe0c23a, true );
		} else for ( let i = 0; i < 9; i ++ ) {
			const x = ( ( i % 3 ) - 1 ) * 0.16, z = ( Math.floor( i / 3 ) - 1 ) * 0.11, y = 0.17 + R() * 0.03;
			if ( f === 1 ) {
				// papayas, green going to orange
				const c = [ 0x8aa03a, 0xd8a030, 0xe88a2a ][ Math.floor( R() * 3 ) ];
				k.part( geo.sph( 0.065, 7, 5 ), 'plastic', shade( c, ( R() - 0.5 ) * 0.2 ), [ x, y, z ], [ 0, R() * 3, HALF + ( R() - 0.5 ) * 0.3 ], [ 1, 1.5, 1 ] );
			} else if ( f === 2 ) {
				// husked coconuts: faceted, fibrous
				k.part( geo.ico( 0.075, 0 ), 'matte', shade( 0x6a4a2c, ( R() - 0.5 ) * 0.25 ), [ x, y, z ], [ R() * 3, R() * 3, R() * 3 ], [ 1, 0.92, 1.05 ] );
			} else if ( i < 6 ) {
				// pineapples lying head to tail, crowns of stiff leaves
				const zz = ( i % 2 ? 1 : - 1 ) * 0.08, xx = ( Math.floor( i / 2 ) - 1 ) * 0.17, dir = i % 2 ? 1 : - 1;
				k.part( geo.sph( 0.06, 7, 5 ), 'matte', shade( 0xb08a3a, ( R() - 0.5 ) * 0.2 ), [ xx, 0.15, zz ], [ HALF, 0, 0 ], [ 1, 1.55, 1 ] );
				for ( let l = 0; l < 4; l ++ ) k.part( geo.cone( 0.025, 0.14, 3 ), 'matte', 0x3f7a3a, [ xx, 0.15, zz + dir * 0.09 ], [ dir * HALF + ( R() - 0.5 ) * 0.5, 0, l * 0.8 ] );
			}
		}
	},

	honesty_box( k, o, R ) {
		k.box( 0.07, 0.95, 0.07, 'wood', 0x6e5a44, null, null, { grime: 0.3 } );
		k.rbox( 0.26, 0.2, 0.2, 0.01, 'wood', 0x8a6a48, [ 0, 0.95, 0 ], null, { seg: 1 } );
		k.box( 0.12, 0.012, 0.03, 'matte', 0x111111, [ 0, 1.15, 0.03 ] );
		k.box( 0.04, 0.05, 0.015, 'metal', 0xb8a040, [ 0, 1.0, 0.105 ] );
		k.part( geo.torus( 0.012, 0.004, 3, 6, PI ), 'metal', 0x9a9a9a, [ 0, 1.0, 0.115 ], null, null, FINE );
		k.box( 0.18, 0.06, 0.003, 'print', 0xffffff, [ 0, 1.06, 0.101 ], null, { cell: CELLS.chalk } );
		k.collider( 0.13, 0.55, 0.1, [ 0, 0.55, 0 ], 0, 'wood' );
	},

	sign_aframe( k, o ) {
		const cell = CELLS[ o.cell ] ?? CELLS.fruit;
		for ( const s of [ 1, - 1 ] ) {
			k.push( [ 0, 0, s * 0.18 ], [ s * - 0.22, 0, 0 ] );
			k.box( 0.62, 0.9, 0.02, 'wood', 0xb89a70, null, null, { grime: 0.3 } );
			k.box( 0.58, 0.82, 0.004, 'print', 0xffffff, [ 0, 0.04, s * 0.012 ], s < 0 ? [ 0, PI, 0 ] : null, { cell } );
			k.pop();
		}
		k.part( geo.cylX( 0.006, 0.6, 3 ), 'metal', 0x6a6a6a, [ 0, 0.45, 0 ], null, null, FINE );
	},

	picnic_table( k, o, R ) {
		const wood = 0x8a6a4c;
		for ( let i = 0; i < 5; i ++ ) k.box( 1.85, 0.045, 0.14, 'wood', shade( wood, ( R() - 0.5 ) * 0.15 ), [ 0, 0.72, - 0.3 + i * 0.15 ] );
		for ( const z of [ - 0.62, 0.62 ] ) for ( let i = 0; i < 2; i ++ ) k.box( 1.85, 0.04, 0.13, 'wood', shade( wood, ( R() - 0.5 ) * 0.15 ), [ 0, 0.42, z + ( i - 0.5 ) * 0.14 ] );
		for ( const x of [ - 0.7, 0.7 ] ) {
			rod( k, [ x, 0, - 0.75 ], [ x, 0.74, 0.12 ], 0.035, 'wood', 0x6e5238, 4 );
			rod( k, [ x, 0, 0.75 ], [ x, 0.74, - 0.12 ], 0.035, 'wood', 0x6e5238, 4 );
			k.box( 0.08, 0.04, 1.5, 'wood', 0x6e5238, [ x, 0.38, 0 ] );
		}
		// a gingham cloth, its corners hanging over the edges
		if ( R() < 0.6 ) {
			const g = geo.grid( 8, 6, ( u, v ) => {
				const x = ( u - 0.5 ) * 1.5, z = ( v - 0.5 ) * 1.0;
				const over = Math.max( 0, Math.abs( z ) - 0.38 );
				return [ x, 0.768 - over * 2.2 + vnoise( u * 4, v * 4, 3 ) * 0.008, Math.sign( z ) * Math.min( Math.abs( z ), 0.385 + over * 0.15 ) ];
			} );
			k.part( g, 'print', 0xffffff, null, [ 0, ( R() - 0.5 ) * 0.2, 0 ], null, { cell: CELLS.gingham } );
		}
		k.collider( 0.925, 0.02, 0.38, [ 0, 0.745, 0 ], 0, 'wood' );
		for ( const z of [ - 0.62, 0.62 ] ) k.collider( 0.925, 0.02, 0.14, [ 0, 0.44, z ], 0, 'wood' );
	},

	bbq( k, o, R ) {
		const B = 0x1b1b1b;
		for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2; rod( k, [ Math.cos( a ) * 0.3, 0, Math.sin( a ) * 0.3 ], [ Math.cos( a ) * 0.16, 0.55, Math.sin( a ) * 0.16 ], 0.012, 'metal', 0x6a6e72, 5 ); }
		for ( const a of [ 0, PI * 2 / 3 ] ) k.part( geo.cylZ( 0.06, 0.03, 10 ), 'plastic', 0x1a1a1a, [ Math.cos( a ) * 0.3, 0.06, Math.sin( a ) * 0.3 ], [ 0, - a, 0 ] );
		k.part( geo.cyl( 0.14, 0.14, 0.04, 10, true ), 'metal', 0x6a6e72, [ 0, 0.3, 0 ] );
		k.part( new THREE.SphereGeometry( 0.29, 14, 6, 0, PI * 2, HALF, HALF ), 'paint', B, [ 0, 0.78, 0 ] );
		for ( let i = - 4; i <= 4; i ++ ) rod( k, [ - Math.sqrt( 0.08 - ( i * 0.06 ) ** 2 ), 0.77, i * 0.06 ], [ Math.sqrt( 0.08 - ( i * 0.06 ) ** 2 ), 0.77, i * 0.06 ], 0.003, 'metal', 0x2a2a2a, 3 );
		// the lid hung off the side on its hook, or left on
		if ( R() < 0.5 ) {
			k.part( geo.dome( 0.3, 14, 5 ), 'paint', B, [ 0.3, 0.55, 0 ], [ 0, 0, - 1.45 ] );
		} else k.part( geo.dome( 0.3, 14, 5 ), 'paint', B, [ 0, 0.79, 0 ] );
		k.cyl( 0.03, 0.03, 0.05, 'plastic', 0x222222, [ 0, 1.08, 0 ], null, 8 );
		k.part( geo.torus( 0.07, 0.008, 3, 8, PI ), 'plastic', 0x222222, [ 0.3, 0.72, 0 ], [ 0, HALF, 0 ] );
		k.groundDecal( 'ash', 0, 0, 0.8, R() * 6 );
		k.collider( 0.3, 0.55, 0.3, [ 0, 0.55, 0 ], 0, 'metal' );
	},

	// ---- airdrop ------------------------------------------------------------------------------------------------------------

	// a CDS-style bundle: a skid board on honeycomb, a planked crate strapped down with buckles and D-rings, the lid
	// prised off when it's been opened
	drop_crate( k, o, R ) {
		const W = 1.3, H = 1.0, D = 1.0, O = 0x4f5530;
		k.box( W + 0.1, 0.05, D + 0.1, 'wood', 0x7a6a4a, [ 0, 0.11, 0 ] );
		k.box( W + 0.06, 0.11, D + 0.06, 'matte', 0xb8a27a, [ 0, 0, 0 ] );
		k.box( W, H - 0.16, D, 'print', 0xffffff, [ 0, 0.16, 0 ], null, { cell: CELLS.relief } );
		// edge battens, corner brackets, straps over the top and down the sides with their buckles
		for ( const [ x, z ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) {
			k.box( 0.06, H - 0.16, 0.06, 'wood', 0x8a7350, [ x * W / 2, 0.16, z * D / 2 ] );
			k.box( 0.09, 0.09, 0.09, 'metal', 0x4a4a46, [ x * W / 2, H - 0.07, z * D / 2 ] );
			k.part( geo.torus( 0.035, 0.007, 3, 8 ), 'metal', 0x8a8a84, [ x * ( W / 2 - 0.05 ), H + 0.02, z * ( D / 2 - 0.05 ) ], [ HALF, 0, 0 ] );
		}
		for ( const x of [ - 0.35, 0.35 ] ) {
			if ( ! o.open ) k.box( 0.07, 0.008, D + 0.02, 'cloth', O, [ x, H + 0.04, 0 ] );
			for ( const z of [ - 1, 1 ] ) {
				k.box( 0.07, H - 0.12, 0.008, 'cloth', O, [ x, 0.12, z * ( D / 2 + 0.006 ) ] );
				k.box( 0.09, 0.06, 0.014, 'metal', 0x6a6a64, [ x, 0.5, z * ( D / 2 + 0.012 ) ] );
			}
		}
		if ( o.open ) {
			// cut straps hanging, the packing inside, the lid fallen against the front
			for ( const x of [ - 0.35, 0.35 ] ) k.box( 0.07, 0.008, 0.3, 'cloth', O, [ x, H - 0.02, D / 2 + 0.1 ], [ 1.2, 0, 0 ] );
			k.part( inward( geo.box( W - 0.04, H - 0.2, D - 0.04 ) ), 'wood', 0x5a4a34, [ 0, 0.18, 0 ] );
			const fill = geo.grid( 5, 4, ( u, v ) => [ ( u - 0.5 ) * ( W - 0.06 ), H - 0.12 + vnoise( u * 4, v * 4, 23 ) * 0.07, ( v - 0.5 ) * ( D - 0.06 ) ] );
			k.part( fill, 'matte', 0xd8cfb0 );
			k.push( [ 0, 0, D / 2 + 0.55 ], [ - 1.2, 0, 0 ] );
			k.box( W, 0.04, D, 'wood', 0xa88a5e );
			for ( const x of [ - 0.4, 0, 0.4 ] ) k.box( 0.05, 0.03, D - 0.1, 'wood', 0x8a7350, [ x, 0.04, 0 ] );
			k.pop();
		} else k.box( W, 0.04, D, 'wood', 0xa88a5e, [ 0, H, 0 ] );
		k.groundDecal( 'soil', 0, 0, 2.2, R() * 6 );
		k.collider( W / 2 + 0.05, H / 2, D / 2 + 0.05, [ 0, H / 2, 0 ], 0, 'wood' );
	},

	// the canopy collapsed on the ground: gores radiating from a crumpled heap, dragged out downwind, seam tapes and a
	// hem, the apex vent; its lines gathered to the risers on the crate (o.to = [ dx, dz ])
	parachute( k, o, R ) {
		const cols = [ 0x5d6240, 0xcfc6a8 ], n = 12, Rad = 2.7, seed = Math.floor( R() * 1000 );
		const at = ( a, t ) => {
			const x = Math.cos( a ) * Rad * t * ( Math.cos( a ) < 0 ? 1.35 : 0.8 ), z = Math.sin( a ) * Rad * t * 0.85;
			const fold = Math.abs( Math.sin( a * n * 0.5 + t * 3 ) ) * 0.12 * ( 1 - t ) + Math.abs( Math.sin( a * n ) ) * 0.04 * t;
			return [ x, 0.03 + ( 1 - t * t ) * 0.32 + fold + vnoise( x * 1.8 + seed, z * 1.8, 3 ) * 0.3 * ( 1 - t * 0.7 ), z ];
		};
		for ( let i = 0; i < n; i ++ ) {
			const a0 = i / n * PI * 2, a1 = ( i + 1 ) / n * PI * 2;
			k.part( geo.grid( 3, 7, ( u, v ) => at( a0 + ( a1 - a0 ) * u, 0.05 + v * 0.95 ) ), 'cloth', cols[ i % 2 ], null, null, null, { drape: true } );
			// the seam tape down the gore's edge
			k.part( geo.grid( 1, 7, ( u, v ) => { const p = at( a0 + ( u - 0.5 ) * 0.025, 0.05 + v * 0.95 ); p[ 1 ] += 0.008; return p; } ), 'cloth', 0x4a4e34, null, null, null, { drape: true } );
		}
		// the hem round the skirt, the vent band at the top
		k.part( geo.grid( 36, 1, ( u, v ) => { const p = at( u * PI * 2, 0.95 + v * 0.05 ); p[ 1 ] += 0.008; return p; } ), 'cloth', 0x4a4e34, null, null, null, { drape: true } );
		k.part( geo.grid( 12, 1, ( u, v ) => { const p = at( u * PI * 2, 0.04 + v * 0.03 ); p[ 1 ] += 0.01; return p; } ), 'cloth', 0x2e3020, null, null, null, { drape: true } );
		// suspension lines to a confluence on the ground, risers from there up onto the crate
		const to = o.to || [ 3.6, - 1.8 ], L = Math.hypot( to[ 0 ], to[ 1 ] ), dx = to[ 0 ] / L, dz = to[ 1 ] / L;
		const cf = [ to[ 0 ] - dx * 1.3, 0, to[ 1 ] - dz * 1.3 ];
		cf[ 1 ] = k.groundAt( cf[ 0 ], cf[ 2 ] ) + 0.04;
		for ( let i = 0; i < 12; i ++ ) {
			const a = Math.atan2( to[ 1 ], to[ 0 ] ) + ( i / 11 - 0.5 ) * 1.7;
			const e = at( a, 0.97 );
			rod( k, [ e[ 0 ], e[ 1 ], e[ 2 ] ], cf, 0.004, 'matte', 0xd8d2bf, 3, FINE );
		}
		for ( const s of [ - 1, 1 ] ) {
			const top = [ to[ 0 ] - dx * 0.55 - dz * s * 0.35, 1.02, to[ 1 ] - dz * 0.55 + dx * s * 0.35 ];
			rope( k, cf, top, 0.15, 0.018, 0x4f5530, 6, {} );
		}
		k.groundDecal( 'boots', cf[ 0 ] - dx * 0.5, cf[ 2 ] - dz * 0.5, 1.6, R() * 6 );
	},

	// ---- stash -----------------------------------------------------------------------------------------------------------------

	cairn( k, o, R ) {
		const n = 7;
		for ( let i = 0; i < n; i ++ ) {
			const lvl = o.scattered ? 0 : i < 4 ? 0 : i < 6 ? 1 : 2;
			const a = R() * PI * 2, r = o.scattered ? 0.2 + R() * 0.5 : [ 0.16, 0.08, 0 ][ lvl ];
			const s = [ 0.13, 0.1, 0.075 ][ lvl ] * ( 0.8 + R() * 0.4 );
			// lichen on the older stones
			k.part( geo.dodeca( s ), 'matte', R() < 0.3 ? 0x5a5e44 : shade( 0x4d4a46, ( R() - 0.5 ) * 0.4 ), [ Math.cos( a ) * r, s * 0.6 + lvl * 0.13, Math.sin( a ) * r ], [ R() * 3, R() * 3, R() * 3 ], [ 1.2, 0.75, 1 ] );
		}
	},

	dirt_mound( k, o, R ) {
		const g = geo.dome( 0.55, 12, 5 );
		const p = g.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), z = p.getZ( i ); p.setY( i, p.getY( i ) * ( 0.7 + vnoise( x * 6, z * 6, 4 ) * 0.6 ) ); }
		g.computeVertexNormals();
		k.part( g, 'matte', 0x5b4431, [ 0, - 0.05, 0 ], null, [ 1, 0.45, 0.8 ] );
		// clods and a root or two dug out with it
		for ( let i = 0; i < 6; i ++ ) k.part( geo.ico( 0.03 + R() * 0.03, 0 ), 'matte', 0x4a3626, [ ( R() - 0.5 ) * 1.2, 0.02, ( R() - 0.5 ) * 0.9 ], [ R() * 3, R() * 3, 0 ], null, FINE );
		rod( k, [ - 0.3, 0.1, 0.2 ], [ 0.1, 0.22, 0.05 ], 0.008, 'wood', 0x6a5038, 4 );
	},

	stash_tote( k, o, R ) {
		const c = 0x34414f;
		k.rbox( 0.58, 0.34, 0.4, 0.03, 'plastic', c, [ 0, - 0.26, 0 ], null, { seg: 1, grime: 0.6 } );
		k.box( 0.52, 0.01, 0.34, 'plastic', 0x1a1e24, [ 0, 0.07, 0 ] );
		// a bin bag lining it, folded over the rim
		k.part( geo.torus( 0.25, 0.02, 3, 12 ), 'plastic', 0x161618, [ 0, 0.075, 0 ], [ HALF, 0, 0 ], [ 1.15, 0.8, 1 ] );
		k.push( [ 0.62, 0, 0.1 ], [ 0, 0.4, 0.25 ] );
		k.rbox( 0.6, 0.05, 0.42, 0.02, 'plastic', c, null, null, { seg: 1, grime: 0.4 } );
		k.pop();
	},

	// small wreckage: a torn skin panel, crumpled, and a bracket or a bit of frame
	debris( k, o, R ) {
		const s = o.s ?? 1;
		k.push( null, [ 0, 0, 0 ], s );
		const L = 0.9, Wd = 0.6, seed = Math.floor( R() * 99 );
		const g = geo.grid( 4, 3, ( u, v ) => {
			const x = ( u - 0.5 ) * L * ( v > 0.66 && u > 0.7 ? 0.7 : 1 ), z = ( v - 0.5 ) * Wd;
			return [ x, 0.04 + ( vnoise( u * 3 + seed, v * 3, 31 ) - 0.3 ) * 0.14 + Math.max( 0, u - 0.7 ) * 0.3, z ];
		} );
		k.part( g, 'print', R() < 0.5 ? 0x4e5546 : 0x3a3c36, null, [ ( R() - 0.5 ) * 0.3, 0, ( R() - 0.5 ) * 0.3 ], null, { cell: R() < 0.3 ? CELLS.soot : CELLS.plain } );
		k.box( 0.5, 0.025, 0.06, 'metal', 0x2a2b28, [ 0.25, 0.1, 0.1 ], [ 0.3, 0.5, 0.8 ] );
		k.pop();
	},
};

// a hand of bananas: a crown with fingers curving up off it ( p: the crown, yaw: which way it faces)
function banana( k, p, yaw, R, col, lying = false ) {
	k.push( p, [ lying ? HALF * 0.9 : 0, yaw, 0 ] );
	for ( let i = 0; i < 5; i ++ ) {
		const g = new THREE.CylinderGeometry( 0.014, 0.018, 0.16, 5, 3 );
		const pos = g.attributes.position;
		for ( let j = 0; j < pos.count; j ++ ) { const y = pos.getY( j ) + 0.08; pos.setX( j, pos.getX( j ) + y * y * 1.6 ); }
		g.computeVertexNormals();
		k.part( g, 'matte', shade( col, ( R() - 0.5 ) * 0.15 ), [ ( i - 2 ) * 0.028, 0.0, 0.02 + Math.abs( i - 2 ) * 0.008 ], [ - 0.5, 0, - 0.35 + ( i - 2 ) * 0.06 ] );
	}
	k.part( geo.box( 0.15, 0.03, 0.03 ), 'matte', 0x6a6a3a, [ 0, - 0.08, 0 ] );
	k.pop();
}
