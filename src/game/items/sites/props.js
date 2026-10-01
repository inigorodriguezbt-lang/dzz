// Prop builders for the outdoor sites. Each builder draws one prop into a Kit (kit.js) in the prop's own frame:
// origin on the ground, +z the prop's front, +x its right; real sizes in metres. Builders add physics boxes for the
// things you bump into or put things on (tables, crates, walls), and nothing for what you'd step over.
//   PROPS[ type ]( k, o, R )   o: the layout's prop record (type params), R: a seeded [0,1) generator
// Decor never copies a lootable item's look (a backpack, a jerrycan, a rod): what looks takeable is a real item.
import * as THREE from 'three';
import { geo, PI, shade, CELLS } from './kit.js';
import { VEHICLE_PROPS } from './vehicles.js';

const HALF = PI / 2;

// a custom face set: quads [ a, b, c, d ] (counter-clockwise seen from the front) and triangles [ a, b, c ]
export function faces( list ) {
	const pos = [], uv = [];
	for ( const f of list ) {
		const tri = ( a, b, c, ua, ub, uc ) => { pos.push( ...a, ...b, ...c ); uv.push( ...ua, ...ub, ...uc ); };
		if ( f.length === 4 ) { tri( f[ 0 ], f[ 1 ], f[ 2 ], [ 0, 0 ], [ 1, 0 ], [ 1, 1 ] ); tri( f[ 0 ], f[ 2 ], f[ 3 ], [ 0, 0 ], [ 1, 1 ], [ 0, 1 ] ); }
		else tri( f[ 0 ], f[ 1 ], f[ 2 ], [ 0, 0 ], [ 1, 0 ], [ 0.5, 1 ] );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	g.computeVertexNormals();
	return g;
}

// a plane (xz, facing up) with its vertices moved by fn( x, z ) -> y; uv over the whole plane
export function sheet( w, d, sx, sz, fn ) {
	const g = new THREE.PlaneGeometry( w, d, sx, sz ).rotateX( - HALF );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) p.setY( i, fn( p.getX( i ), p.getZ( i ) ) );
	g.computeVertexNormals();
	return g;
}

// smooth value noise for lumps and sags
function vnoise( x, z, seed ) {
	const h = ( i, j ) => { let n = Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) + Math.imul( seed, 1442695041 ); n = Math.imul( n ^ ( n >>> 13 ), 1274126177 ); return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296; };
	const i = Math.floor( x ), j = Math.floor( z ), fx = x - i, fz = z - j;
	const sx = fx * fx * ( 3 - 2 * fx ), sz = fz * fz * ( 3 - 2 * fz );
	return ( h( i, j ) * ( 1 - sx ) + h( i + 1, j ) * sx ) * ( 1 - sz ) + ( h( i, j + 1 ) * ( 1 - sx ) + h( i + 1, j + 1 ) * sx ) * sz;
}

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

// a rod between two points (a, b = [ x, y, z ])
export function rod( k, a, b, r, mat, color, seg = 6 ) {
	const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ], dz = b[ 2 ] - a[ 2 ];
	const len = Math.hypot( dx, dy, dz );
	if ( len < 1e-4 ) return;
	const g = new THREE.CylinderGeometry( r, r, len, seg, 1 );
	const q = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( dx / len, dy / len, dz / len ) );
	const e = new THREE.Euler().setFromQuaternion( q );
	k.part( g, mat, color, [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 ], [ e.x, e.y, e.z ] );
}

// a guy line from a point to a stake in the ground
function guy( k, a, b ) {
	rod( k, a, b, 0.004, 'matte', 0xd8d2bf, 3 );
	k.cyl( 0.012, 0.008, 0.12, 'metal', 0x9a9a9a, [ b[ 0 ], - 0.02, b[ 2 ] ], null, 5 );
}

const pickc = ( R, a ) => a[ Math.floor( R() * a.length ) % a.length ];
const CLOTH_COLS = [ 0x2f4f7f, 0xb33a2e, 0xe0d8c8, 0x3d6b45, 0x1f1f22, 0xd9a032, 0x7b4a8a, 0x5a7fa8, 0xc96a8a, 0x8a8f96 ];

export const PROPS = {
	...VEHICLE_PROPS,

	// ---- luggage and spills ------------------------------------------------------------------------------------------

	suitcase( k, o, R ) {
		const c = o.c ?? 0x22262c, inner = 0x4a4f57;
		if ( o.open ) {
			k.rbox( 0.68, 0.13, 0.46, 0.035, 'plastic', c );
			k.box( 0.62, 0.012, 0.4, 'cloth', inner, [ 0, 0.1, 0 ] );
			// the lid flopped open behind, lining up
			k.rbox( 0.68, 0.1, 0.46, 0.035, 'plastic', c, [ 0, 0, - 0.47 ] );
			k.box( 0.62, 0.012, 0.4, 'cloth', inner, [ 0, 0.1, - 0.47 ] );
			// clothes spilling out
			const n = 3 + ( o.clothes ?? 2 ) % 3;
			for ( let i = 0; i < n; i ++ ) {
				const last = i === n - 1;
				k.rbox( 0.3, 0.035, 0.22, 0.015, 'cloth', pickc( R, CLOTH_COLS ), [ ( R() - 0.5 ) * 0.3 + ( last ? 0.42 : 0 ), last ? 0 : 0.11 + i * 0.03, ( R() - 0.5 ) * 0.16 + ( last ? 0.22 : 0 ) ], [ 0, R() * 0.8 - 0.4, last ? 0.15 : 0 ] );
			}
			for ( const x of [ - 0.27, 0.27 ] ) k.cyl( 0.025, 0.025, 0.02, 'plastic', 0x111111, [ x, 0.01, - 0.7 ], [ HALF, 0, 0 ], 8 );
			return;
		}
		if ( o.upright ) {
			k.rbox( 0.44, 0.66, 0.26, 0.04, 'plastic', c, [ 0, 0.05, 0 ] );
			for ( const x of [ - 0.16, 0.16 ] ) k.cyl( 0.03, 0.03, 0.025, 'plastic', 0x111111, [ x, 0.03, - 0.1 ], [ 0, 0, HALF ], 8 );
			for ( const x of [ - 0.1, 0.1 ] ) k.cyl( 0.007, 0.007, 0.42, 'metal', 0x9aa0a6, [ x, 0.7, - 0.1 ], null, 5 );
			k.box( 0.24, 0.03, 0.035, 'plastic', 0x1a1a1a, [ 0, 1.12, - 0.1 ] );
			k.collider( 0.22, 0.36, 0.13, [ 0, 0.38, 0 ], 0, 'wood' );
			return;
		}
		k.rbox( 0.68, 0.26, 0.46, 0.04, 'plastic', c );
		k.box( 0.2, 0.025, 0.04, 'plastic', 0x1a1a1a, [ 0, 0.26, 0.2 ] );
		for ( let i = 0; i < 4; i ++ ) k.box( 0.66, 0.005, 0.005, 'plastic', shade( c, - 0.25 ), [ 0, 0.06 + i * 0.05, 0.231 ] );
	},

	clothes( k, o, R ) {
		const n = o.n ?? 3;
		for ( let i = 0; i < n; i ++ ) {
			const c = pickc( R, CLOTH_COLS ), x = ( R() - 0.5 ) * 0.9, z = ( R() - 0.5 ) * 0.7, yaw = R() * 6;
			k.push( [ x, 0, z ], [ 0, yaw, 0 ] );
			if ( R() < 0.5 ) {
				// a folded garment, a sleeve hanging off it
				k.part( geo.rbox( 0.34, 0.05 + R() * 0.03, 0.26, 0.02 ), 'cloth', c, null, null, null, { drape: true } );
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
			for ( let i = 0; i <= 7; i ++ ) { const x = - L / 2 + 0.1 * ( 1 - i / 7 ) + i / 7 * L - i / 7 * 0.0; rod( k, [ x + ( 1 - i / 7 ) * 0, y0, z * 0.9 ], [ - L / 2 + i / 7 * L, y1, z ], 0.004, M, C, 4 ); }
		}
		for ( const x of [ - L / 2, L / 2 ] ) {
			rod( k, [ x, y1, - w / 2 ], [ x, y1, w / 2 ], 0.009, M, C );
			for ( let i = 0; i <= 4; i ++ ) { const z = - w / 2 + i / 4 * w; rod( k, [ x === - L / 2 ? x + 0.1 : x, y0, z * 0.9 ], [ x, y1, z ], 0.004, M, C, 4 ); }
		}
		for ( let i = 0; i <= 5; i ++ ) { const z = ( - w / 2 + i / 5 * w ) * 0.9; rod( k, [ - L / 2 + 0.1, y0, z ], [ L / 2, y0, z ], 0.004, M, C, 4 ); }
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
			k.box( 0.11, h, 0.11, 'wood', post, [ x, 0, z ] );
			k.collider( 0.06, h / 2, 0.06, [ x, h / 2, z ], 0, 'wood' );
		}
		// back wall of boards, half side walls
		for ( let i = 0; i < 9; i ++ ) k.box( W, 0.16, 0.03, 'wood', shade( wall, ( R() - 0.5 ) * 0.12 ), [ 0, 0.32 + i * 0.165, - D / 2 + 0.02 ] );
		k.collider( W / 2, 0.75, 0.04, [ 0, 1.05, - D / 2 + 0.02 ], 0, 'wood' );
		for ( const x of [ - W / 2, W / 2 ] ) for ( let i = 0; i < 9; i ++ ) k.box( 0.03, 0.16, D * 0.6, 'wood', shade( wall, ( R() - 0.5 ) * 0.12 ), [ x, 0.32 + i * 0.165, - D / 2 + D * 0.3 ] );
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
	},

	bus_sign( k ) {
		k.cyl( 0.03, 0.03, 2.6, 'metal', 0x9aa0a6, null, null, 8 );
		k.box( 0.48, 0.58, 0.02, 'print', 0xffffff, [ 0, 2.0, 0.035 ], null, { cell: CELLS.bus } );
		k.collider( 0.04, 1.3, 0.04, [ 0, 1.3, 0 ], 0, 'metal' );
	},

	trash_can( k ) {
		k.cyl( 0.3, 0.27, 0.86, 'paint', 0x2f5a3a, null, null, 14 );
		k.part( geo.torus( 0.3, 0.02, 5, 18 ), 'paint', 0x2a4f33, [ 0, 0.86, 0 ], [ HALF, 0, 0 ] );
		k.part( geo.dome( 0.31, 14, 4 ), 'paint', 0x2a4f33, [ 0, 0.86, 0 ], null, [ 1, 0.35, 1 ] );
		k.box( 0.2, 0.06, 0.1, 'matte', 0x111111, [ 0, 0.9, 0.24 ] );
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
		if ( ! o.fallen ) k.collider( 0.8, 0.5, 0.15, [ 0, 0.5, 0 ], 0, 'wood' );
		if ( o.fallen ) k.pop();
	},

	tape( k, o ) {
		const len = o.len ?? 8;
		const g = sheet( len, 0.07, 16, 1, () => 0 );
		const p = g.attributes.position;
		// sag between the ends
		for ( let i = 0; i < p.count; i ++ ) { const t = p.getX( i ) / len + 0.5; p.setY( i, - Math.sin( t * PI ) * 0.25 ); }
		g.rotateX( HALF );
		g.computeVertexNormals();
		k.part( g, 'print', 0xffffff, [ len / 2, 0.9, 0 ], null, null, { cell: CELLS.tape } );
	},

	body_bag( k, o, R ) {
		const h = bodyHeight( 1.15, R );
		// a rounded bag hugging the body, tapered at both ends
		const bag = ( x, z ) => Math.max( h( x, z ), 0.09 * Math.sqrt( Math.max( 0, 1 - ( z / 0.3 ) ** 2 ) ) ) * ( 1 - ( x / 1.0 ) ** 8 );
		k.part( sheet( 2.0, 0.6, 24, 10, bag ), 'plastic', 0x16171a, null, null, null, { drape: true } );
		// the zip down the middle, the carry handles
		const pts = [];
		for ( let i = 0; i <= 16; i ++ ) { const x = - 0.9 + i / 16 * 1.75; pts.push( [ x, bag( x, 0.04 ) + 0.006, 0.04 ] ); }
		k.part( geo.tube( pts, 0.008, 24, 4 ), 'metal', 0x8a8e92, null, null, null, { drape: true } );
		for ( const x of [ - 0.6, 0.05, 0.6 ] ) for ( const z of [ - 0.29, 0.29 ] ) k.part( geo.torus( 0.04, 0.008, 4, 8, Math.PI ), 'cloth', 0x2a2a2a, [ x, 0.02, z ], [ 0, 0, 0 ] );
	},

	// a body under a blanket, the shoes showing (when no character can stand in for the dead)
	body_covered( k, o, R ) {
		const c = pickc( R, [ 0x7d8a96, 0xb9b3a4, 0x5a6f8c, 0x8a7a5a ] );
		const h = bodyHeight( 1.3, R );
		k.part( sheet( 2.05, 1.15, 22, 12, ( x, z ) => 0.01 + h( x, z ) + ( vnoise( x * 8, z * 8, 7 ) - 0.5 ) * 0.014 ), 'cloth', c, null, null, null, { drape: true } );
		for ( const z of [ - 0.11, 0.1 ] ) k.rbox( 0.1, 0.13, 0.09, 0.03, 'matte', 0x2a241e, [ - 1.02, 0, z ], [ 0, 0, 0.35 ] );
	},

	// ---- beach -----------------------------------------------------------------------------------------------------------

	towel( k, o, R ) {
		const g = sheet( 1.75, 0.85, 10, 5, ( x, z ) => vnoise( x * 3 + 7, z * 3, 3 ) * 0.012 );
		k.part( g, 'print', 0xffffff, [ 0, 0.035, 0 ], [ 0, HALF, 0 ], null, { cell: [ CELLS.towel0, CELLS.towel1, CELLS.towel2, CELLS.towel3 ][ ( o.c ?? 0 ) % 4 ], drape: true } );
	},

	umbrella( k, o, R ) {
		const cols = [ [ 0xd23a2e, 0xf2eee4 ], [ 0x2b6fb3, 0xf2eee4 ], [ 0xf0b81f, 0x2a9a8e ], [ 0x3f8a4a, 0xf2eee4 ] ][ ( o.c ?? 0 ) % 4 ];
		if ( o.fallen ) k.push( [ 0, 0.25, 0 ], [ 0, 0, HALF * 0.93 ] );
		else k.push( [ 0, - 0.2, 0 ], [ o.tilt ?? 0.2, 0, 0 ] );
		k.cyl( 0.017, 0.017, 2.25, 'metal', 0xe0e0dc, null, null, 6 );
		const H = 2.25, r = 1.05, h = 0.32, n = 8;
		for ( let i = 0; i < n; i ++ ) {
			const a0 = i / n * PI * 2, a1 = ( i + 1 ) / n * PI * 2, am = ( a0 + a1 ) / 2;
			const top = [ 0, H, 0 ], p0 = [ Math.cos( a0 ) * r, H - h, Math.sin( a0 ) * r ], p1 = [ Math.cos( a1 ) * r, H - h, Math.sin( a1 ) * r ];
			const pm = [ Math.cos( am ) * r * 0.97, H - h - 0.06, Math.sin( am ) * r * 0.97 ];
			k.part( faces( [ [ top, p1, pm ], [ top, pm, p0 ] ] ), 'cloth', cols[ i % 2 ] );
			rod( k, [ 0, H - 0.04, 0 ], [ Math.cos( a0 ) * r * 0.98, H - h - 0.01, Math.sin( a0 ) * r * 0.98 ], 0.006, 'metal', 0xcccccc, 4 );
		}
		k.part( geo.sph( 0.03, 6, 4 ), 'plastic', 0xffffff, [ 0, H + 0.02, 0 ] );
		k.pop();
	},

	cooler( k, o ) {
		const c = o.c ?? 0x2a64b0;
		k.rbox( 0.62, 0.36, 0.4, 0.04, 'plastic', c );
		if ( o.open ) {
			k.push( [ 0, 0.36, - 0.2 ], [ - 1.85, 0, 0 ] );
			k.rbox( 0.64, 0.07, 0.42, 0.03, 'plastic', 0xefefea, [ 0, 0, 0.21 ] );
			k.pop();
			k.box( 0.56, 0.01, 0.34, 'plastic', 0x9ab5c4, [ 0, 0.3, 0 ] );
		} else k.rbox( 0.64, 0.07, 0.42, 0.03, 'plastic', 0xefefea, [ 0, 0.34, 0 ] );
		for ( const x of [ - 0.33, 0.33 ] ) k.box( 0.04, 0.05, 0.16, 'plastic', 0x2a2a2a, [ x, 0.26, 0 ] );
		k.collider( 0.31, 0.2, 0.2, [ 0, 0.2, 0 ], 0, 'wood' );
	},

	beach_chair( k, o ) {
		const c = [ 0x2b6fb3, 0xd23a2e, 0x2a9a8e, 0xf0b81f ][ ( o.c ?? 0 ) % 4 ];
		const M = 'metal', A = 0xd8dadc;
		for ( const x of [ - 0.26, 0.26 ] ) {
			rod( k, [ x, 0.02, 0.35 ], [ x, 0.22, - 0.1 ], 0.011, M, A );
			rod( k, [ x, 0.22, - 0.1 ], [ x, 0.75, - 0.42 ], 0.011, M, A );
			rod( k, [ x, 0.02, - 0.3 ], [ x, 0.22, 0.25 ], 0.011, M, A );
			rod( k, [ x, 0.36, 0.2 ], [ x, 0.36, - 0.2 ], 0.011, M, A );
		}
		k.box( 0.5, 0.015, 0.42, 'cloth', c, [ 0, 0.2, 0.08 ], [ - 0.12, 0, 0 ] );
		k.box( 0.5, 0.6, 0.015, 'cloth', c, [ 0, 0.2, - 0.22 ], [ - 0.55, 0, 0 ] );
	},

	sandcastle( k, o, R ) {
		const sand = 0xcdb98e;
		k.cyl( 0.32, 0.4, 0.16, 'matte', sand, null, null, 12 );
		k.cyl( 0.14, 0.18, 0.28, 'matte', sand, [ 0, 0.16, 0 ], null, 10 );
		k.part( geo.cone( 0.12, 0.14, 8 ), 'matte', sand, [ 0, 0.44, 0 ] );
		for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2 + 0.4; k.cyl( 0.06, 0.08, 0.2, 'matte', sand, [ Math.cos( a ) * 0.28, 0.12, Math.sin( a ) * 0.28 ], null, 8 ); }
		k.part( geo.torus( 0.55, 0.06, 5, 20 ), 'matte', 0xa8936a, [ 0, 0.0, 0 ], [ HALF, 0, 0 ], [ 1, 1, 0.4 ] );
	},

	// ---- camping ---------------------------------------------------------------------------------------------------------

	tent_dome( k, o, R ) {
		const c = o.c ?? 0x3f6e3a, body = shade( c, 0.55 );
		k.part( new THREE.SphereGeometry( 1, 16, 7, 0, PI * 2, 0, HALF ), 'cloth', body, [ 0, 0, 0 ], null, [ 1.1, 1.22, 1.1 ] );
		// the fly over the top, a shade darker and a little proud of the body
		k.part( new THREE.SphereGeometry( 1, 16, 4, 0, PI * 2, 0, 0.95 ), 'cloth', c, [ 0, 0.02, 0 ], null, [ 1.16, 1.27, 1.16 ] );
		// poles crossing over the top
		for ( const a of [ PI / 4, - PI / 4 ] ) {
			const pts = [];
			for ( let i = 0; i <= 12; i ++ ) { const t = i / 12 * PI; pts.push( [ Math.cos( t ) * 1.16 * Math.cos( a ), Math.sin( t ) * 1.28, Math.cos( t ) * 1.16 * Math.sin( a ) ] ); }
			k.part( geo.tube( pts, 0.012, 24, 4 ), 'plastic', 0x2a2a2a );
		}
		// the door: a dark opening, the flap rolled up above it
		const open = o.open !== false;
		const door = faces( [ [ [ - 0.42, 0.02, 1.08 ], [ 0.42, 0.02, 1.08 ], [ 0.3, open ? 0.95 : 0.85, 0.62 ], [ - 0.3, open ? 0.95 : 0.85, 0.62 ] ] ] );
		k.part( door, 'cloth', open ? 0x141414 : shade( c, - 0.2 ) );
		if ( open ) k.part( geo.cylX( 0.06, 0.6, 8 ), 'cloth', c, [ 0, 0.98, 0.7 ] );
		for ( const [ x, z ] of [ [ 1.0, 1.0 ], [ - 1.0, 1.0 ], [ 1.0, - 1.0 ], [ - 1.0, - 1.0 ] ] ) guy( k, [ x * 0.62, 0.95, z * 0.62 ], [ x * 1.55, 0, z * 1.55 ] );
		// back half solid (the open front lets you reach in)
		k.collider( 1.0, 0.55, 0.5, [ 0, 0.55, - 0.55 ], 0, 'wood', 'noclimb' );
	},

	tent_ridge( k, o, R ) {
		const c = o.c ?? 0xb8642a, L = 2.2, W = 1.6, H = 1.15;
		const l = [ - W / 2, 0, - L / 2 ], r = [ W / 2, 0, - L / 2 ], t = [ 0, H, - L / 2 ];
		const l2 = [ - W / 2, 0, L / 2 ], r2 = [ W / 2, 0, L / 2 ], t2 = [ 0, H, L / 2 ];
		k.part( faces( [ [ l, l2, t2, t ], [ r2, r, t, t2 ], [ r, l, t ] ] ), 'cloth', c );
		const open = o.open !== false;
		if ( open ) {
			k.part( faces( [ [ l2, [ - 0.2, 0, L / 2 ], [ 0, H * 0.9, L / 2 ] ], [ [ 0.2, 0, L / 2 ], r2, [ 0, H * 0.9, L / 2 ] ] ] ), 'cloth', shade( c, - 0.1 ) );
			k.part( faces( [ [ [ - 0.2, 0, L / 2 - 0.01 ], [ 0.2, 0, L / 2 - 0.01 ], [ 0, H * 0.9, L / 2 - 0.01 ] ] ] ), 'cloth', 0x121212 );
		} else k.part( faces( [ [ l2, r2, t2 ] ] ), 'cloth', shade( c, - 0.1 ) );
		for ( const z of [ - L / 2 - 0.02, L / 2 + 0.02 ] ) k.cyl( 0.012, 0.012, H + 0.1, 'metal', 0x777777, [ 0, 0, z ], null, 5 );
		guy( k, [ 0, H + 0.05, L / 2 ], [ 0, 0, L / 2 + 0.9 ] ); guy( k, [ 0, H + 0.05, - L / 2 ], [ 0, 0, - L / 2 - 0.9 ] );
		k.collider( W / 2, H / 2, L / 4, [ 0, H / 2, - L / 4 ], 0, 'wood', 'noclimb' );
	},

	fire_pit( k, o, R ) {
		for ( let i = 0; i < 10; i ++ ) {
			const a = i / 10 * PI * 2 + R() * 0.2, r = 0.48 + R() * 0.05;
			k.part( geo.dodeca( 0.1 + R() * 0.05 ), 'matte', shade( 0x4a4744, ( R() - 0.5 ) * 0.45 ), [ Math.cos( a ) * r, 0.04, Math.sin( a ) * r ], [ R() * 3, R() * 3, R() * 3 ], [ 1.2, 0.8, 1 ] );
		}
		// burnt logs collapsed in the middle
		for ( let i = 0; i < 4; i ++ ) {
			const a = i / 4 * PI + R() * 0.5;
			k.part( geo.cylX( 0.045 + R() * 0.02, 0.55 + R() * 0.2, 7 ), 'wood', 0x221d19, [ Math.cos( a ) * 0.06, 0.06 + i * 0.02, Math.sin( a ) * 0.06 ], [ 0, a, ( R() - 0.5 ) * 0.4 ] );
		}
		for ( let i = 0; i < 6; i ++ ) k.part( geo.ico( 0.05, 0 ), 'matte', shade( 0x9a958e, ( R() - 0.5 ) * 0.3 ), [ ( R() - 0.5 ) * 0.4, 0.02, ( R() - 0.5 ) * 0.4 ], null, [ 1.4, 0.4, 1.2 ] );
		if ( o.tripod ) {
			for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2 + 0.3; rod( k, [ Math.cos( a ) * 0.7, 0, Math.sin( a ) * 0.7 ], [ 0, 1.35, 0 ], 0.022, 'wood', 0x6a5038, 6 ); }
			rod( k, [ 0, 1.33, 0 ], [ 0, 0.85, 0 ], 0.005, 'metal', 0x2a2a2a, 4 );
			k.part( geo.torus( 0.04, 0.006, 4, 10 ), 'metal', 0x2a2a2a, [ 0, 0.82, 0 ] );
		}
	},

	log_seat( k, o, R ) {
		const L = 1.3 + R() * 0.4, r = 0.15 + R() * 0.05;
		k.part( geo.cylX( r, L, 10 ), 'wood', 0x5b4634, [ 0, r * 0.9, 0 ] );
		for ( const x of [ - L / 2, L / 2 ] ) k.part( geo.cylX( r * 0.95, 0.012, 10 ), 'wood', 0xb08a5a, [ x, r * 0.9, 0 ] );
		k.collider( L / 2, r * 0.9, r, [ 0, r * 0.9, 0 ], 0, 'wood' );
	},

	camp_chair( k, o ) {
		const c = o.c ?? 0x2f5f8f, M = 'metal', F = 0x2a2a2a;
		for ( const x of [ - 0.26, 0.26 ] ) {
			rod( k, [ x, 0, 0.25 ], [ x, 0.45, - 0.22 ], 0.01, M, F );
			rod( k, [ x, 0, - 0.25 ], [ x, 0.45, 0.22 ], 0.01, M, F );
			rod( k, [ x, 0.45, - 0.22 ], [ x * 1.05, 0.95, - 0.33 ], 0.01, M, F );
			k.box( 0.08, 0.025, 0.42, 'cloth', c, [ x * 1.12, 0.62, 0.0 ] );
		}
		k.part( sheet( 0.5, 0.44, 4, 4, ( x, z ) => - ( 1 - ( 2 * x ) ** 2 ) * 0.035 ), 'cloth', c, [ 0, 0.44, 0 ] );
		k.part( sheet( 0.5, 0.5, 2, 2, () => 0 ), 'cloth', c, [ 0, 0.7, - 0.28 ], [ HALF - 0.2, 0, 0 ] );
		k.cyl( 0.035, 0.035, 0.06, 'cloth', shade( c, - 0.3 ), [ 0.32, 0.6, 0.12 ], null, 8 );
	},

	woodpile( k, o, R ) {
		let n = 0;
		for ( let row = 0; row < 3; row ++ ) for ( let i = 0; i < 4 - row; i ++ ) {
			const r = 0.07 + R() * 0.02;
			k.part( geo.cylZ( r, 0.55 + R() * 0.1, 7 ), 'wood', shade( 0x7a5a3c, ( R() - 0.5 ) * 0.3 ), [ ( i - ( 3 - row ) / 2 ) * 0.16, 0.07 + row * 0.13, ( R() - 0.5 ) * 0.06 ], [ 0, 0, R() * 3 ] );
			n ++;
		}
		for ( const x of [ - 0.4, 0.4 ] ) k.cyl( 0.025, 0.025, 0.55, 'wood', 0x5a4634, [ x, 0, 0 ], null, 5 );
		k.collider( 0.36, 0.2, 0.3, [ 0, 0.2, 0 ], 0, 'wood' );
	},

	tarp_shelter( k, o, R ) {
		const c = o.c ?? 0x2f5f8f;
		for ( const x of [ - 1.2, 1.2 ] ) k.cyl( 0.025, 0.025, 1.6, 'wood', 0x6a5038, [ x, 0, 0.6 ], null, 5 );
		rod( k, [ - 1.25, 1.58, 0.6 ], [ 1.25, 1.58, 0.6 ], 0.005, 'matte', 0xd8d2bf, 3 );
		const g = sheet( 2.6, 2.1, 8, 6, ( x, z ) => - Math.sin( ( x / 2.6 + 0.5 ) * PI ) * 0.06 * ( 1 - Math.abs( z ) / 1.1 ) );
		k.part( g, 'cloth', c, [ 0, 0.85, - 0.3 ], [ 0.72, 0, 0 ] );
		for ( const x of [ - 1.25, 1.25 ] ) guy( k, [ x, 0.12, - 1.0 ], [ x * 1.1, 0, - 1.25 ] );
	},

	trek_pole( k, o ) {
		k.part( geo.cylX( 0.009, 1.15, 6 ), 'metal', 0x50565e, [ 0, 0.012, 0 ] );
		k.part( geo.cylX( 0.017, 0.14, 8 ), 'plastic', 0x1a1a1a, [ 0.55, 0.018, 0 ] );
		k.part( geo.cylX( 0.03, 0.01, 10 ), 'plastic', 0x1a1a1a, [ - 0.5, 0.03, 0 ] );
	},

	// ---- fishing ---------------------------------------------------------------------------------------------------------

	rod_holder( k, o ) {
		k.push( [ 0, - 0.25, 0 ], [ - 0.35, 0, 0 ] );
		k.cyl( 0.026, 0.026, 0.95, 'plastic', 0xe6e6e0, null, null, 10 );
		k.part( geo.torus( 0.027, 0.006, 4, 10 ), 'plastic', 0xd0d0ca, [ 0, 0.95, 0 ], [ HALF, 0, 0 ] );
		k.pop();
	},

	bucket( k, o ) {
		const c = o.c ?? 0xe8e6df;
		k.part( geo.lathe( [ [ 0.145, 0 ], [ 0.165, 0.36 ], [ 0.175, 0.37 ], [ 0.16, 0.37 ], [ 0.14, 0.02 ], [ 0, 0.02 ] ], 16 ), 'plastic', c );
		for ( const y of [ 0.27, 0.32 ] ) k.part( geo.torus( 0.163 + y * 0.03, 0.006, 4, 18 ), 'plastic', shade( c, - 0.08 ), [ 0, y, 0 ], [ HALF, 0, 0 ] );
		k.part( geo.torus( 0.17, 0.004, 4, 12, PI ), 'metal', 0x9a9a9a, [ 0, 0.37, 0 ], [ 0, 0, - 0.3 ] );
		k.collider( 0.17, 0.19, 0.17, [ 0, 0.19, 0 ], 0, 'wood' );
	},

	// ---- police and army -----------------------------------------------------------------------------------------------

	folding_table( k ) {
		k.rbox( 1.8, 0.045, 0.76, 0.015, 'plastic', 0xe9e8e2, [ 0, 0.7, 0 ] );
		for ( const x of [ - 0.8, 0.8 ] ) {
			for ( const z of [ - 0.3, 0.3 ] ) rod( k, [ x, 0, z ], [ x * 0.97, 0.7, z * 0.95 ], 0.013, 'metal', 0x6a6e72, 6 );
			rod( k, [ x, 0.12, - 0.3 ], [ x, 0.12, 0.3 ], 0.009, 'metal', 0x6a6e72, 5 );
		}
		k.collider( 0.9, 0.0225, 0.38, [ 0, 0.7225, 0 ], 0, 'wood' );
	},

	crate_police( k ) {
		k.rbox( 0.62, 0.46, 0.42, 0.04, 'plastic', 0x1c1d20 );
		for ( const x of [ - 0.2, 0.2 ] ) k.box( 0.07, 0.06, 0.03, 'metal', 0x9a9ea2, [ x, 0.36, 0.215 ] );
		k.box( 0.22, 0.03, 0.05, 'plastic', 0x0e0e0e, [ 0, 0.46, 0 ] );
		k.collider( 0.31, 0.23, 0.21, [ 0, 0.23, 0 ], 0, 'wood' );
	},

	canopy( k, o ) {
		const c = o.c ?? 0x23406e, sx = o.big ? 1.5 : 1, W = 3, H = 2.25;
		for ( const [ x, z ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) {
			k.box( 0.04, H, 0.04, 'metal', 0x8a8e92, [ x * W / 2 * sx, 0, z * W / 2 ] );
			k.collider( 0.03, H / 2, 0.03, [ x * W / 2 * sx, H / 2, z * W / 2 ], 0, 'metal' );
		}
		const roof = new THREE.ConeGeometry( W / Math.SQRT2, 0.65, 4, 1, true ).rotateY( PI / 4 ).translate( 0, 0.325, 0 );
		k.part( roof, 'cloth', c, [ 0, H, 0 ], null, [ sx, 1, 1 ] );
		for ( const [ x, z, w, d ] of [ [ 0, - W / 2, W * sx, 0.01 ], [ 0, W / 2, W * sx, 0.01 ], [ - W / 2 * sx, 0, 0.01, W ], [ W / 2 * sx, 0, 0.01, W ] ] ) k.box( w, 0.22, d, 'cloth', shade( c, - 0.1 ), [ x, H - 0.2, z ] );
		// scissor trusses under the roof edge
		for ( const z of [ - W / 2, W / 2 ] ) { rod( k, [ - W / 2 * sx, H - 0.05, z ], [ W / 2 * sx, H - 0.45, z ], 0.01, 'metal', 0x8a8e92, 4 ); rod( k, [ - W / 2 * sx, H - 0.45, z ], [ W / 2 * sx, H - 0.05, z ], 0.01, 'metal', 0x8a8e92, 4 ); }
	},

	radio_set( k ) {
		k.rbox( 0.36, 0.2, 0.26, 0.015, 'matte', 0x3b3f2c );
		for ( let i = 0; i < 3; i ++ ) k.part( geo.cylZ( 0.018, 0.02, 8 ), 'plastic', 0x111111, [ - 0.1 + i * 0.08, 0.14, 0.135 ] );
		k.box( 0.12, 0.06, 0.005, 'plastic', 0x2a3a2a, [ 0.09, 0.07, 0.132 ] );
		k.cyl( 0.004, 0.002, 0.9, 'metal', 0x222222, [ - 0.14, 0.2, - 0.08 ], [ 0.12, 0, 0 ], 4 );
		k.rbox( 0.06, 0.04, 0.2, 0.01, 'plastic', 0x151515, [ 0.26, 0, 0.05 ], [ 0, 0.4, 0 ] );
	},

	sandbags( k, o, R ) {
		const len = o.len ?? 3, rows = o.rows ?? 3, bl = 0.55, n = Math.max( 1, Math.round( len / ( bl - 0.04 ) ) );
		for ( let r = 0; r < rows; r ++ ) {
			const off = r % 2 ? ( bl - 0.04 ) / 2 : 0, cnt = r % 2 ? n - 1 : n;
			for ( let i = 0; i < cnt; i ++ ) {
				const x = - len / 2 + ( bl - 0.04 ) / 2 + off + i * ( bl - 0.04 );
				k.part( geo.rbox( bl, 0.17, 0.33, 0.075, 1 ), 'cloth', shade( 0xb19d76, ( R() - 0.5 ) * 0.2 ), [ x, r * 0.15, ( R() - 0.5 ) * 0.03 ], [ 0, ( R() - 0.5 ) * 0.08, ( R() - 0.5 ) * 0.04 ] );
			}
		}
		k.collider( len / 2, rows * 0.075 + 0.02, 0.17, [ 0, rows * 0.075 + 0.02, 0 ], 0, 'dirt' );
	},

	tent_mil( k, o, R ) {
		const c = 0x5b5e3c, W = 4.6, Hw = 1.55, Ht = 3.0;
		// walls (the front has the door rolled up), a pyramid roof, a stovepipe
		k.box( W, Hw, 0.02, 'cloth', c, [ 0, 0, - W / 2 ] );
		k.box( 0.02, Hw, W, 'cloth', c, [ - W / 2, 0, 0 ] );
		k.box( 0.02, Hw, W, 'cloth', c, [ W / 2, 0, 0 ] );
		for ( const x of [ - 1.45, 1.45 ] ) k.box( 1.7, Hw, 0.02, 'cloth', c, [ x, 0, W / 2 ] );
		k.box( 1.2, 0.35, 0.02, 'cloth', c, [ 0, Hw - 0.35, W / 2 ] );
		k.part( geo.cylX( 0.1, 1.2, 8 ), 'cloth', shade( c, - 0.1 ), [ 0, Hw - 0.42, W / 2 + 0.06 ] );
		k.part( faces( [ [ [ - 0.6, 0.01, W / 2 - 0.02 ], [ 0.6, 0.01, W / 2 - 0.02 ], [ 0.6, Hw - 0.35, W / 2 - 0.02 ], [ - 0.6, Hw - 0.35, W / 2 - 0.02 ] ] ] ), 'cloth', 0x151612 );
		const roof = new THREE.ConeGeometry( W / Math.SQRT2 + 0.12, Ht - Hw, 4, 1, true ).rotateY( PI / 4 ).translate( 0, ( Ht - Hw ) / 2, 0 );
		k.part( roof, 'cloth', shade( c, - 0.05 ), [ 0, Hw, 0 ] );
		k.cyl( 0.06, 0.06, 0.8, 'metal', 0x3a3a3a, [ 1.0, 2.2, - 0.6 ], null, 8 );
		for ( const [ x, z ] of [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ] ) guy( k, [ x * W / 2, Hw, z * W / 2 ], [ x * ( W / 2 + 1.1 ), 0, z * ( W / 2 + 1.1 ) ] );
		k.collider( W / 2, Hw / 2, 0.06, [ 0, Hw / 2, - W / 2 ], 0, 'wood', 'noclimb' );
		k.collider( 0.06, Hw / 2, W / 2, [ - W / 2, Hw / 2, 0 ], 0, 'wood', 'noclimb' );
		k.collider( 0.06, Hw / 2, W / 2, [ W / 2, Hw / 2, 0 ], 0, 'wood', 'noclimb' );
		for ( const x of [ - 1.45, 1.45 ] ) k.collider( 0.85, Hw / 2, 0.06, [ x, Hw / 2, W / 2 ], 0, 'wood', 'noclimb' );
	},

	crate_mil( k, o ) {
		const c = 0x4f5530;
		k.rbox( 0.9, 0.48, 0.48, 0.015, 'wood', c );
		for ( const z of [ - 0.245, 0.245 ] ) k.box( 0.6, 0.3, 0.004, 'print', 0xffffff, [ 0, 0.09, z ], z < 0 ? [ 0, PI, 0 ] : null, { cell: CELLS.army } );
		for ( const x of [ - 0.44, 0.44 ] ) k.box( 0.03, 0.5, 0.5, 'wood', shade( c, - 0.15 ), [ x, 0, 0 ] );
		for ( const x of [ - 0.25, 0.25 ] ) k.box( 0.05, 0.04, 0.03, 'metal', 0x2a2a2a, [ x, 0.4, 0.25 ] );
		for ( const x of [ - 0.47, 0.47 ] ) k.part( geo.torus( 0.05, 0.008, 4, 8, PI ), 'cloth', 0x2a2a20, [ x, 0.3, 0 ], [ 0, HALF, 0 ] );
		k.collider( 0.45, 0.25, 0.25, [ 0, 0.25, 0 ], 0, 'wood' );
	},

	ammo_cans( k, o, R ) {
		for ( let i = 0; i < 3; i ++ ) {
			const x = ( i - 1 ) * 0.13, y = i === 2 ? 0 : 0;
			k.push( [ x, y, ( R() - 0.5 ) * 0.06 ], [ 0, ( R() - 0.5 ) * 0.2, 0 ] );
			k.rbox( 0.11, 0.18, 0.28, 0.01, 'matte', 0x4c5232 );
			k.box( 0.04, 0.012, 0.16, 'matte', 0x2e321e, [ 0, 0.185, 0 ] );
			k.pop();
		}
	},

	barrel( k, o ) {
		const c = o.c ?? 0x4f5530;
		k.cyl( 0.29, 0.29, 0.88, 'paint', c, null, null, 16 );
		for ( const y of [ 0.29, 0.59 ] ) k.part( geo.torus( 0.292, 0.012, 4, 20 ), 'paint', shade( c, - 0.1 ), [ 0, y, 0 ], [ HALF, 0, 0 ] );
		k.part( geo.torus( 0.28, 0.014, 4, 20 ), 'paint', shade( c, - 0.1 ), [ 0, 0.88, 0 ], [ HALF, 0, 0 ] );
		k.cyl( 0.03, 0.03, 0.01, 'metal', 0x2a2a2a, [ 0.15, 0.88, 0.05 ], null, 8 );
		k.collider( 0.29, 0.44, 0.29, [ 0, 0.44, 0 ], 0, 'metal' );
	},

	camo_net( k, o, R ) {
		const w = o.w ?? 4.6, d = o.d ?? 4;
		const g = sheet( w, d, 10, 8, ( x, z ) => {
			const ex = Math.abs( x ) / ( w / 2 ), ez = Math.abs( z ) / ( d / 2 );
			const pole = Math.max( 0, 1 - Math.hypot( ex - 0.75, ez - 0.75 ) * 3 );
			return 2.0 - ( 1 - Math.max( ex, ez ) ** 2 ) * 0.25 - Math.max( ex, ez ) ** 3 * 0.5 + pole * 0.15 + ( vnoise( x * 2, z * 2, 5 ) - 0.5 ) * 0.12;
		} );
		k.part( g, 'print', 0xffffff, [ 0, 0, 0 ], null, null, { cell: CELLS.camo } );
		for ( const [ x, z ] of [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ] ) k.cyl( 0.025, 0.025, 2.1, 'wood', 0x5a4a34, [ x * w * 0.375, 0, z * d * 0.375 ], null, 5 );
	},

	razor_wire( k, o ) {
		const len = o.len ?? 3, turns = Math.round( len / 0.22 ), pts = [];
		for ( let i = 0; i <= turns * 10; i ++ ) { const t = i / ( turns * 10 ), a = t * turns * PI * 2; pts.push( [ - len / 2 + t * len, 0.42 + Math.sin( a ) * 0.4, Math.cos( a ) * 0.42 ] ); }
		k.part( geo.tube( pts, 0.006, turns * 10, 3 ), 'metal', 0x8a8e92 );
		for ( const x of [ - len / 2, len / 2 ] ) k.box( 0.04, 1.0, 0.04, 'matte', 0x3a3f2a, [ x, 0, 0 ] );
		k.collider( len / 2, 0.42, 0.42, [ 0, 0.42, 0 ], 0, 'metal', 'noclimb' );
	},

	flag_pole( k, o, R ) {
		k.cyl( 0.035, 0.03, 5.2, 'metal', 0xb8bcc2, null, null, 8 );
		k.part( geo.sph( 0.06, 8, 6 ), 'metal', 0xc8a040, [ 0, 5.22, 0 ] );
		// a limp flag: stripes and a canton, hanging in folds
		k.push( [ 0.04, 4.0, 0 ], [ 0, 0.3, 0 ] );
		for ( let i = 0; i < 7; i ++ ) {
			const g = sheet( 1.5, 0.14, 8, 1, ( x ) => Math.sin( x * 6 + i * 0.1 ) * 0.06 );
			g.rotateX( HALF );
			k.part( g, 'cloth', i % 2 ? 0xf0eee6 : 0xb3222c, [ 0.75, 1.0 - i * 0.14 - 0.07, 0 ], [ 0, 0, - 1.25 ] );
		}
		k.pop();
	},

	// ---- relief and FEMA ---------------------------------------------------------------------------------------------------

	tent_fema( k, o ) {
		const c = 0xe6e3da, W = 6, D = 4.2, Hw = 2.0, Ht = 3.1;
		const p = ( x, y, z ) => [ x, y, z ];
		// walls, gable ends and the roof slopes
		k.box( W, Hw, 0.02, 'cloth', c, [ 0, 0, - D / 2 ] );
		for ( const x of [ - W / 2, W / 2 ] ) k.box( 0.02, Hw, D, 'cloth', c, [ x, 0, 0 ] );
		for ( const x of [ - 1.9, 1.9 ] ) k.box( 2.2, Hw, 0.02, 'cloth', c, [ x, 0, D / 2 ] );
		k.part( faces( [ [ p( - 0.8, 0.01, D / 2 - 0.01 ), p( 0.8, 0.01, D / 2 - 0.01 ), p( 0.8, Hw, D / 2 - 0.01 ), p( - 0.8, Hw, D / 2 - 0.01 ) ] ] ), 'cloth', 0x121212 );
		for ( const z of [ - D / 2, D / 2 ] ) k.part( faces( [ [ p( - W / 2, Hw, z ), p( W / 2, Hw, z ), p( 0, Ht, z ) ] ] ), 'cloth', shade( c, - 0.03 ) );
		k.part( faces( [ [ p( - W / 2 - 0.1, Hw - 0.05, D / 2 + 0.1 ), p( W / 2 + 0.1, Hw - 0.05, D / 2 + 0.1 ), p( W / 2 + 0.1, Ht, 0 ), p( - W / 2 - 0.1, Ht, 0 ) ] ] ), 'cloth', shade( c, - 0.05 ) );
		k.part( faces( [ [ p( W / 2 + 0.1, Hw - 0.05, - D / 2 - 0.1 ), p( - W / 2 - 0.1, Hw - 0.05, - D / 2 - 0.1 ), p( - W / 2 - 0.1, Ht, 0 ), p( W / 2 + 0.1, Ht, 0 ) ] ] ), 'cloth', shade( c, - 0.05 ) );
		// door flaps tied back, a blue band along the eaves
		for ( const x of [ - 0.9, 0.9 ] ) k.part( geo.cyl( 0.09, 0.07, Hw, 8 ), 'cloth', shade( c, - 0.08 ), [ x, 0, D / 2 + 0.05 ] );
		k.box( W + 0.2, 0.18, 0.02, 'cloth', 0x2a4f8a, [ 0, Hw - 0.25, D / 2 + 0.11 ] );
		if ( o.sign ) k.box( 1.0, 1.0, 0.01, 'print', 0xffffff, [ 0, Hw + 0.02, D / 2 + 0.02 ], null, { cell: CELLS.fema } );
		for ( const [ x, z ] of [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ] ) guy( k, [ x * W / 2, Hw - 0.05, z * D / 2 ], [ x * ( W / 2 + 0.9 ), 0, z * ( D / 2 + 0.9 ) ] );
		k.collider( W / 2, Ht / 2, D / 2, [ 0, Ht / 2, 0 ], 0, 'wood', 'noclimb' );
	},

	cot( k ) {
		const F = 0x5a5e44, M = 'metal';
		for ( const z of [ - 0.33, 0.33 ] ) rod( k, [ - 0.95, 0.42, z ], [ 0.95, 0.42, z ], 0.014, M, 0x8a8e92, 6 );
		for ( const x of [ - 0.8, 0, 0.8 ] ) { rod( k, [ x, 0, - 0.33 ], [ x, 0.42, 0.33 ], 0.01, M, 0x8a8e92, 5 ); rod( k, [ x, 0, 0.33 ], [ x, 0.42, - 0.33 ], 0.01, M, 0x8a8e92, 5 ); }
		k.part( sheet( 1.9, 0.66, 6, 3, ( x, z ) => - ( 1 - ( z / 0.33 ) ** 2 ) * 0.04 ), 'cloth', F, [ 0, 0.43, 0 ] );
		k.collider( 0.95, 0.22, 0.33, [ 0, 0.22, 0 ], 0, 'wood' );
	},

	pallet( k, o, R ) {
		for ( const z of [ - 0.45, 0, 0.45 ] ) k.box( 1.2, 0.09, 0.09, 'wood', 0x9c8162, [ 0, 0, z ] );
		for ( let i = 0; i < 7; i ++ ) k.box( 0.13, 0.022, 1.0, 'wood', shade( 0xb59a74, ( R() - 0.5 ) * 0.15 ), [ - 0.54 + i * 0.18, 0.09, 0 ] );
		k.collider( 0.6, 0.056, 0.5, [ 0, 0.056, 0 ], 0, 'wood' );
	},

	pallet_load( k, o, R ) {
		PROPS.pallet( k, o, R );
		k.boxes.pop();
		const y0 = 0.112;
		if ( o.load === 'water' ) {
			for ( let r = 0; r < 2; r ++ ) for ( let i = 0; i < 3; i ++ ) for ( let j = 0; j < 3; j ++ ) {
				if ( r === 1 && i === 2 && j > 0 ) continue;
				k.part( geo.lathe( [ [ 0.14, 0 ], [ 0.14, 0.34 ], [ 0.06, 0.42 ], [ 0.03, 0.46 ], [ 0, 0.46 ] ], 12 ), 'plastic', 0x6aa0d8, [ - 0.36 + i * 0.36, y0 + r * 0.47, - 0.32 + j * 0.32 ] );
			}
			k.collider( 0.6, 0.5, 0.5, [ 0, 0.5, 0 ], 0, 'wood' );
			return;
		}
		// ration boxes in a stack, the top layer half taken
		for ( let r = 0; r < 3; r ++ ) for ( let i = 0; i < 3; i ++ ) for ( let j = 0; j < 2; j ++ ) {
			if ( r === 2 && ( i + j ) % 2 ) continue;
			const pr = ( i + j + r ) % 3 === 0;
			k.box( 0.38, 0.3, 0.46, pr ? 'print' : 'matte', pr ? 0xffffff : 0xb08a58, [ - 0.4 + i * 0.4, y0 + r * 0.3, - 0.24 + j * 0.48 ], [ 0, ( R() - 0.5 ) * 0.06, 0 ], { cell: CELLS.hdr } );
		}
		k.collider( 0.6, 0.5, 0.5, [ 0, 0.5, 0 ], 0, 'wood' );
	},

	generator( k ) {
		const Y = 0xd9a52a, F = 0x1a1a1a;
		for ( const z of [ - 0.25, 0.25 ] ) { rod( k, [ - 0.35, 0.05, z ], [ 0.35, 0.05, z ], 0.015, 'metal', F, 6 ); rod( k, [ - 0.35, 0.55, z ], [ 0.35, 0.55, z ], 0.015, 'metal', F, 6 ); }
		for ( const x of [ - 0.35, 0.35 ] ) for ( const z of [ - 0.25, 0.25 ] ) rod( k, [ x, 0.05, z ], [ x, 0.55, z ], 0.015, 'metal', F, 6 );
		k.rbox( 0.42, 0.3, 0.36, 0.03, 'metal', 0x3a3a3a, [ - 0.08, 0.06, 0 ] );
		k.rbox( 0.5, 0.16, 0.38, 0.05, 'plastic', Y, [ 0, 0.42, 0 ] );
		k.box( 0.18, 0.2, 0.3, 'plastic', Y, [ 0.22, 0.12, 0 ] );
		k.box( 0.01, 0.12, 0.2, 'plastic', 0x222222, [ 0.32, 0.18, 0 ] );
		k.collider( 0.37, 0.3, 0.27, [ 0, 0.3, 0 ], 0, 'metal' );
	},

	sign_board( k, o ) {
		const cell = CELLS[ o.cell ] ?? CELLS.fema;
		for ( const x of [ - 0.75, 0.75 ] ) { k.box( 0.08, 1.9, 0.08, 'wood', 0x7a6248, [ x, 0, 0 ] ); k.collider( 0.05, 0.95, 0.05, [ x, 0.95, 0 ], 0, 'wood' ); }
		k.box( 1.6, 1.0, 0.025, 'wood', 0xc9b48e, [ 0, 0.85, 0 ] );
		k.box( 1.5, 0.92, 0.005, 'print', 0xffffff, [ 0, 0.89, 0.015 ], null, { cell } );
	},

	porta_potty( k ) {
		const B = 0x2e6fb8;
		k.rbox( 1.1, 2.2, 1.1, 0.04, 'plastic', B );
		k.rbox( 1.16, 0.14, 1.16, 0.05, 'plastic', 0xe8e8e2, [ 0, 2.2, 0 ] );
		k.box( 0.8, 1.9, 0.02, 'plastic', shade( B, - 0.12 ), [ 0, 0.1, 0.555 ] );
		for ( let i = 0; i < 4; i ++ ) k.box( 0.5, 0.025, 0.02, 'plastic', shade( B, - 0.3 ), [ 0, 1.75 + i * 0.06, 0.567 ] );
		k.box( 0.04, 0.12, 0.04, 'plastic', 0x222222, [ 0.3, 1.05, 0.58 ] );
		k.cyl( 0.05, 0.05, 0.4, 'plastic', 0x222222, [ - 0.4, 2.25, - 0.35 ], null, 8 );
		k.collider( 0.55, 1.15, 0.55, [ 0, 1.15, 0 ], 0, 'wood' );
	},

	// ---- farm and park -------------------------------------------------------------------------------------------------------

	farm_stand( k, o, R ) {
		const post = 0x6e5a44, top = 0x8f7a5e, W = 2.6, D = 0.95;
		for ( const [ x, z, h ] of [ [ - W / 2, 0.42, 2.05 ], [ W / 2, 0.42, 2.05 ], [ - W / 2, - 0.45, 2.3 ], [ W / 2, - 0.45, 2.3 ] ] ) {
			k.box( 0.09, h, 0.09, 'wood', post, [ x, 0, z ] );
			k.collider( 0.05, h / 2, 0.05, [ x, h / 2, z ], 0, 'wood' );
		}
		for ( let i = 0; i < 6; i ++ ) k.box( W + 0.1, 0.03, D / 6 - 0.008, 'wood', shade( top, ( R() - 0.5 ) * 0.15 ), [ 0, 0.82, - D / 2 + D / 12 + i * D / 6 ] );
		for ( let i = 0; i < 4; i ++ ) k.box( W, 0.18, 0.02, 'wood', shade( 0x7d6a50, ( R() - 0.5 ) * 0.15 ), [ 0, 0.06 + i * 0.19, D / 2 - 0.02 ] );
		k.collider( W / 2 + 0.05, 0.43, D / 2, [ 0, 0.43, 0 ], 0, 'wood' );
		const roof = sheet( W + 0.6, 1.5, 28, 2, ( x ) => Math.abs( Math.sin( x * 16 ) ) * 0.022 );
		k.part( roof, 'metal', 0x8a6a4e, [ 0, 2.18, 0 ], [ 0.17, 0, 0 ] );
		k.part( roof.clone(), 'metal', 0x6a5440, [ 0, 2.17, 0 ], [ 0.17, 0, 0 ], [ 1, - 1, 1 ] );
		const cell = [ CELLS.fruit, CELLS.papaya, CELLS.fruit ][ ( o.sign ?? 0 ) % 3 ];
		k.box( 1.7, 0.46, 0.025, 'wood', 0xb89a70, [ 0, 1.56, 0.5 ] );
		k.box( 1.6, 0.4, 0.005, 'print', 0xffffff, [ 0, 1.59, 0.515 ], null, { cell } );
		for ( const x of [ - 0.7, 0.7 ] ) rod( k, [ x, 2.02, 0.5 ], [ x, 1.98, 0.5 ], 0.006, 'metal', 0x555555, 4 );
	},

	produce_crate( k, o, R ) {
		const W = 0.55, D = 0.38, H = 0.26;
		for ( const z of [ - D / 2, D / 2 ] ) for ( const y of [ 0.02, 0.15 ] ) k.box( W, 0.09, 0.015, 'wood', 0xb39466, [ 0, y, z ] );
		for ( const x of [ - W / 2, W / 2 ] ) k.box( 0.02, H, D, 'wood', 0x9c8058, [ x, 0, 0 ] );
		k.box( W, 0.015, D, 'wood', 0xa58a62, [ 0, 0.01, 0 ] );
		const f = ( o.fruit ?? 0 ) % 4;
		const col = [ 0xe0c23a, 0xe8902e, 0x5a3a22, 0x8a9a3a ][ f ];
		for ( let i = 0; i < 9; i ++ ) {
			const x = ( ( i % 3 ) - 1 ) * 0.16, z = ( Math.floor( i / 3 ) - 1 ) * 0.11, y = 0.19 + R() * 0.03;
			if ( f === 0 ) k.part( geo.cylX( 0.022, 0.18, 6 ), 'matte', shade( col, ( R() - 0.5 ) * 0.2 ), [ x, y, z ], [ 0, R() * 3, 0.3 ] );
			else if ( f === 1 ) k.part( geo.sph( 0.07, 8, 6 ), 'plastic', shade( col, ( R() - 0.5 ) * 0.2 ), [ x, y, z ], [ 0, R() * 3, HALF ], [ 1, 1.5, 1 ] );
			else if ( f === 2 ) k.part( geo.sph( 0.075, 8, 6 ), 'matte', shade( col, ( R() - 0.5 ) * 0.25 ), [ x, y, z ] );
			else { k.part( geo.sph( 0.065, 8, 6 ), 'matte', shade( 0xb08a3a, ( R() - 0.5 ) * 0.2 ), [ x, y, z ], null, [ 1, 1.4, 1 ] ); k.part( geo.cone( 0.04, 0.08, 6 ), 'matte', 0x3f7a3a, [ x, y + 0.08, z ] ); }
		}
	},

	honesty_box( k ) {
		k.box( 0.07, 0.95, 0.07, 'wood', 0x6e5a44 );
		k.rbox( 0.26, 0.2, 0.2, 0.01, 'wood', 0x8a6a48, [ 0, 0.95, 0 ] );
		k.box( 0.12, 0.012, 0.03, 'matte', 0x111111, [ 0, 1.15, 0.03 ] );
		k.box( 0.04, 0.05, 0.015, 'metal', 0xb8a040, [ 0, 1.0, 0.105 ] );
		k.collider( 0.13, 0.55, 0.1, [ 0, 0.55, 0 ], 0, 'wood' );
	},

	sign_aframe( k, o ) {
		const cell = CELLS[ o.cell ] ?? CELLS.fruit;
		for ( const s of [ 1, - 1 ] ) {
			k.push( [ 0, 0, s * 0.18 ], [ s * - 0.22, 0, 0 ] );
			k.box( 0.62, 0.9, 0.02, 'wood', 0xb89a70 );
			k.box( 0.58, 0.82, 0.004, 'print', 0xffffff, [ 0, 0.04, s * 0.012 ], s < 0 ? [ 0, PI, 0 ] : null, { cell } );
			k.pop();
		}
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
		k.collider( 0.925, 0.02, 0.38, [ 0, 0.745, 0 ], 0, 'wood' );
		for ( const z of [ - 0.62, 0.62 ] ) k.collider( 0.925, 0.02, 0.14, [ 0, 0.44, z ], 0, 'wood' );
	},

	bbq( k ) {
		const B = 0x1b1b1b;
		for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2; rod( k, [ Math.cos( a ) * 0.3, 0, Math.sin( a ) * 0.3 ], [ Math.cos( a ) * 0.16, 0.55, Math.sin( a ) * 0.16 ], 0.012, 'metal', 0x6a6e72, 5 ); }
		k.part( new THREE.SphereGeometry( 0.29, 14, 6, 0, PI * 2, HALF, HALF ), 'paint', B, [ 0, 0.78, 0 ] );
		k.part( geo.dome( 0.3, 14, 5 ), 'paint', B, [ 0, 0.79, 0 ] );
		k.cyl( 0.03, 0.03, 0.05, 'plastic', 0x222222, [ 0, 1.08, 0 ], null, 8 );
		k.collider( 0.3, 0.55, 0.3, [ 0, 0.55, 0 ], 0, 'metal' );
	},

	// ---- airdrop ------------------------------------------------------------------------------------------------------------

	drop_crate( k, o ) {
		const W = 1.3, H = 1.0, D = 1.0, O = 0x4f5530;
		k.box( W + 0.1, 0.16, D + 0.1, 'wood', 0x7a6a4a );
		k.box( W, H - 0.16, D, 'print', 0xffffff, [ 0, 0.16, 0 ], null, { cell: CELLS.relief } );
		// edge battens, straps over the top and down the sides
		for ( const [ x, z ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.box( 0.06, H - 0.16, 0.06, 'wood', 0x8a7350, [ x * W / 2, 0.16, z * D / 2 ] );
		for ( const x of [ - 0.35, 0.35 ] ) {
			k.box( 0.07, 0.008, D + 0.02, 'cloth', O, [ x, H, 0 ] );
			for ( const z of [ - 1, 1 ] ) k.box( 0.07, H - 0.16, 0.008, 'cloth', O, [ x, 0.16, z * ( D / 2 + 0.006 ) ] );
		}
		if ( o.open ) {
			k.box( W, 0.03, D, 'wood', 0x2a2620, [ 0, H - 0.01, 0 ] );
			k.push( [ 0, 0, D / 2 + 0.55 ], [ - 1.2, 0, 0 ] );
			k.box( W, 0.04, D, 'wood', 0xa88a5e );
			k.pop();
		} else k.box( W, 0.04, D, 'wood', 0xa88a5e, [ 0, H, 0 ] );
		k.collider( W / 2 + 0.05, H / 2, D / 2 + 0.05, [ 0, H / 2, 0 ], 0, 'wood' );
	},

	// the canopy collapsed on the ground: gores radiating from a crumpled heap, dragged out downwind, its lines
	// running to the crate (o.to = [ dx, dz ])
	parachute( k, o, R ) {
		const cols = [ 0x5d6240, 0xcfc6a8 ], n = 12, Rad = 2.7, seed = Math.floor( R() * 1000 );
		for ( let i = 0; i < n; i ++ ) {
			const a0 = i / n * Math.PI * 2, a1 = ( i + 1 ) / n * Math.PI * 2;
			const pos = [], idx = [], uv = [];
			const ra = 6, an = 3;
			for ( let r = 0; r <= ra; r ++ ) for ( let j = 0; j <= an; j ++ ) {
				const a = a0 + ( a1 - a0 ) * j / an, t = r / ra;
				// stretched downwind (+x), folds across the gores, a heap where it collapsed
				const x = Math.cos( a ) * Rad * t * ( Math.cos( a ) < 0 ? 1.35 : 0.8 ), z = Math.sin( a ) * Rad * t * 0.85;
				const fold = Math.abs( Math.sin( a * n * 0.5 + t * 3 ) ) * 0.12 * ( 1 - t );
				const y = 0.03 + ( 1 - t * t ) * 0.32 + fold + vnoise( x * 1.8 + seed, z * 1.8, 3 ) * 0.3 * ( 1 - t * 0.7 );
				pos.push( x, y, z ); uv.push( t, j / an );
			}
			for ( let r = 0; r < ra; r ++ ) for ( let j = 0; j < an; j ++ ) {
				const a = r * ( an + 1 ) + j, b = a + an + 1;
				idx.push( a, a + 1, b, a + 1, b + 1, b );
			}
			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
			g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
			g.setIndex( idx );
			g.computeVertexNormals();
			k.part( g, 'cloth', cols[ i % 2 ], null, null, null, { drape: true } );
		}
		const to = o.to || [ 3.6, - 1.8 ];
		for ( let i = 0; i < 8; i ++ ) {
			const a = Math.atan2( to[ 1 ], to[ 0 ] ) + ( i / 7 - 0.5 ) * 1.4;
			const ex = Math.cos( a ) * Rad * 0.9, ez = Math.sin( a ) * Rad * 0.75;
			rod( k, [ ex, 0.08, ez ], [ to[ 0 ] - 0.4, 0.9, to[ 1 ] + ( i / 7 - 0.5 ) * 0.5 ], 0.006, 'matte', 0xd8d2bf, 3 );
		}
	},

	// ---- stash -----------------------------------------------------------------------------------------------------------------

	cairn( k, o, R ) {
		const n = o.scattered ? 7 : 7;
		for ( let i = 0; i < n; i ++ ) {
			const lvl = o.scattered ? 0 : i < 4 ? 0 : i < 6 ? 1 : 2;
			const a = R() * PI * 2, r = o.scattered ? 0.2 + R() * 0.5 : [ 0.16, 0.08, 0 ][ lvl ];
			const s = [ 0.13, 0.1, 0.075 ][ lvl ] * ( 0.8 + R() * 0.4 );
			k.part( geo.dodeca( s ), 'matte', shade( 0x4d4a46, ( R() - 0.5 ) * 0.4 ), [ Math.cos( a ) * r, s * 0.6 + lvl * 0.13, Math.sin( a ) * r ], [ R() * 3, R() * 3, R() * 3 ], [ 1.2, 0.75, 1 ] );
		}
	},

	dirt_mound( k, o, R ) {
		const g = geo.dome( 0.55, 12, 5 );
		const p = g.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), z = p.getZ( i ); p.setY( i, p.getY( i ) * ( 0.7 + vnoise( x * 6, z * 6, 4 ) * 0.6 ) ); }
		g.computeVertexNormals();
		k.part( g, 'matte', 0x5b4431, [ 0, - 0.05, 0 ], null, [ 1, 0.45, 0.8 ] );
	},

	stash_tote( k, o ) {
		const c = 0x34414f;
		k.rbox( 0.58, 0.34, 0.4, 0.03, 'plastic', c, [ 0, - 0.26, 0 ] );
		k.box( 0.52, 0.01, 0.34, 'plastic', 0x1a1e24, [ 0, 0.07, 0 ] );
		k.push( [ 0.62, 0, 0.1 ], [ 0, 0.4, 0.25 ] );
		k.rbox( 0.6, 0.05, 0.42, 0.02, 'plastic', c );
		k.pop();
	},

	// small wreckage (a panel off the helicopter)
	debris( k, o, R ) {
		const s = o.s ?? 1;
		k.push( null, null, s );
		k.box( 0.9, 0.025, 0.6, 'matte', R() < 0.5 ? 0x4a4f36 : 0x3a3c36, [ 0, 0.05, 0 ], [ ( R() - 0.5 ) * 0.4, 0, ( R() - 0.5 ) * 0.4 ] );
		k.box( 0.5, 0.02, 0.4, 'matte', 0x2a2b28, [ 0.35, 0.12, 0.1 ], [ 0.3, 0.5, 0.8 ] );
		k.pop();
	},
};
