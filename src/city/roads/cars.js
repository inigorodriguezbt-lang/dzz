// Procedural car shells for the wrecks: nine body types lofted from a few key stations, with real wheel arches,
// a cabin you can see into, a glasshouse with pillars, wrap-around bumpers, lathed tyres and rims, mirrors, plates
// and an interior, plus the per-type data the car shader needs (door / trunk / hood regions, lamp and grille
// areas, plate and wheel positions: the shader paints the lamps, grille, panel gaps, handles and rim patterns,
// so every LOD wears the same face). Forward is local -z, +x is the car's right side, y = 0 on the ground.
//
// Vertex attributes: position, normal, color (linear, used by everything but the paint), cpart = ( part,
// roughness, metalness ). Parts: 0 paint, 1 trim, 2 chrome, 3 tyre, 4 rim, 5 side glass, 6 windscreen,
// 7 headlight, 8 taillight, 9 interior, 10 lightbar red, 11 lightbar blue, 12 plate, 13 canvas.
//
// Budgets (triangles): near ~3 k (0-60 m, shadows), far ~0.8 k (60-150 m), low ~0.25 k (150-500 m).
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MB } from './meshkit.js';
import { CAR, CAR_DIMS } from './kinds.js';

export const PART = { PAINT: 0, TRIM: 1, CHROME: 2, TYRE: 3, RIM: 4, GLASS: 5, SCREEN: 6, HEAD: 7, TAIL: 8, INTERIOR: 9, RED: 10, BLUE: 11, PLATE: 12, CANVAS: 13 };
const P = ( part, r, m ) => [ part, r, m ];
const TAG = {
	paint: P( 0, 0.35, 0.3 ), trim: P( 1, 0.7, 0 ), under: P( 1, 0.95, 0.05 ), gloss: P( 1, 0.35, 0 ), chrome: P( 2, 0.2, 1 ), tyre: P( 3, 0.9, 0 ),
	rim: P( 4, 0.35, 0.8 ), glass: P( 5, 0.05, 0 ), screen: P( 6, 0.05, 0 ), head: P( 7, 0.1, 0.2 ), tail: P( 8, 0.2, 0 ), interior: P( 9, 0.9, 0 ),
	red: P( 10, 0.3, 0 ), blue: P( 11, 0.3, 0 ), plate: P( 12, 0.5, 0.2 ), canvas: P( 13, 0.95, 0 ),
};
const BLACK = 0x0d0d0d, UNDER = 0x0a0a09, GLASS = 0x0b0e10, SEAT = 0x2a2724, DASH = 0x1d1c1a;

// lower body stations: [ z, yBottom, yBelt, yTop, width fraction ]; cabin: z stations [ zA, zB, zC, zD ],
// roof height, roof half-width fraction, glass rule; regions for the shader. (Roads.js reads body[ 2 ], body[ 3 ],
// body[ 4 ], the last and the third-last stations, cab.roof, doors, trunk and hood: keep their meaning.)
// look: wheel style (rim 0 steel + hubcap, 1 alloy, 2 military, 3 truck steel), tyre half width, arch gap, arch
// flare; bumpers: height above the end station's bottom
const SPECS = {
	[ CAR.SEDAN ]: {
		body: [ [ - 2.375, 0.33, 0.55, 0.62, 0.9 ], [ - 2.3, 0.25, 0.66, 0.74, 0.96 ], [ - 2.05, 0.21, 0.76, 0.84, 1 ], [ - 1.2, 0.2, 0.8, 0.9, 1 ], [ - 0.85, 0.2, 0.84, 0.93, 1 ], [ 1.5, 0.2, 0.88, 0.96, 1 ], [ 2.05, 0.22, 0.88, 0.97, 0.99 ], [ 2.3, 0.28, 0.82, 0.92, 0.95 ], [ 2.375, 0.36, 0.7, 0.8, 0.9 ] ],
		cab: { z: [ - 0.85, - 0.05, 0.85, 1.5 ], roof: 1.44, w: 0.78, pillarB: 0.33, cPillar: true },
		doors: [ [ - 0.8, 0.33 ], [ 0.33, 1.2 ] ], trunk: [ 1.55, 2.33, 'lid' ], hood: [ - 2.2, - 0.9 ],
		look: { rim: 0, tw: 0.1, gap: 0.05, flare: 0, head: [ 0.6, 0.06, 0.48, 0.95 ], tail: [ 0.7, 0.07, 0.5, 0.97 ], grille: [ 0.44, 0.6, 0.4, 0 ] },
	},
	[ CAR.HATCH ]: {
		body: [ [ - 2.05, 0.31, 0.55, 0.62, 0.9 ], [ - 1.98, 0.25, 0.66, 0.74, 0.96 ], [ - 1.75, 0.21, 0.76, 0.85, 1 ], [ - 1.0, 0.2, 0.8, 0.9, 1 ], [ - 0.75, 0.2, 0.84, 0.93, 1 ], [ 1.8, 0.2, 0.88, 0.97, 1 ], [ 1.98, 0.27, 0.84, 0.94, 0.97 ], [ 2.05, 0.34, 0.74, 0.84, 0.92 ] ],
		cab: { z: [ - 0.75, - 0.02, 1.55, 1.98 ], roof: 1.5, w: 0.8, pillarB: 0.42, cPillar: false },
		doors: [ [ - 0.7, 0.42 ], [ 0.42, 1.2 ] ], trunk: [ 1.55, 2.02, 'hatch' ], hood: [ - 1.9, - 0.8 ],
		look: { rim: 1, spokes: 4, tw: 0.095, gap: 0.05, flare: 0, head: [ 0.6, 0.06, 0.45, 0.95 ], tail: [ 0.86, 0.09, 0.62, 0.98 ], grille: [ 0.42, 0.56, 0.36, 0 ] },
	},
	[ CAR.SUV ]: {
		body: [ [ - 2.425, 0.42, 0.66, 0.76, 0.92 ], [ - 2.35, 0.34, 0.8, 0.9, 0.97 ], [ - 2.1, 0.31, 0.94, 1.04, 1 ], [ - 1.2, 0.3, 0.99, 1.09, 1 ], [ - 0.95, 0.3, 1.01, 1.11, 1 ], [ 2.28, 0.3, 1.06, 1.13, 1 ], [ 2.4, 0.38, 1.0, 1.1, 0.97 ], [ 2.425, 0.46, 0.86, 0.96, 0.93 ] ],
		cab: { z: [ - 0.95, - 0.2, 2.2, 2.38 ], roof: 1.78, w: 0.86, pillarB: 0.36, cPillar: false },
		doors: [ [ - 0.9, 0.36 ], [ 0.36, 1.36 ] ], trunk: [ 1.9, 2.4, 'hatch' ], hood: [ - 2.3, - 1.0 ],
		look: { rim: 1, spokes: 6, tw: 0.125, gap: 0.06, flare: 0.02, rails: true, head: [ 0.78, 0.07, 0.5, 0.96 ], tail: [ 0.96, 0.1, 0.66, 0.99 ], grille: [ 0.55, 0.8, 0.44, 1 ] },
	},
	[ CAR.PICKUP ]: {
		body: [ [ - 2.7, 0.43, 0.7, 0.8, 0.92 ], [ - 2.62, 0.35, 0.86, 0.96, 0.97 ], [ - 2.35, 0.33, 1.0, 1.1, 1 ], [ - 1.25, 0.32, 1.06, 1.15, 1 ], [ - 1.0, 0.32, 1.08, 1.17, 1 ], [ 0.62, 0.32, 1.08, 1.17, 1 ], [ 0.66, 0.36, 0.9, 0.96, 1 ], [ 2.62, 0.36, 0.9, 0.96, 1 ], [ 2.7, 0.44, 0.88, 0.95, 0.97 ] ],
		cab: { z: [ - 1.0, - 0.3, 0.48, 0.6 ], roof: 1.86, w: 0.84, pillarB: 99, cPillar: true },
		doors: [ [ - 0.95, 0.42 ], null ], trunk: [ 2.58, 2.7, 'tailgate' ], hood: [ - 2.55, - 1.05 ], bed: [ 0.66, 2.66, 0.96, 1.3 ], low: [ 0, 2, 5, 6, 8 ],
		look: { rim: 3, tw: 0.13, gap: 0.07, flare: 0.015, head: [ 0.84, 0.08, 0.5, 0.95 ], tail: [ 1.08, 0.13, 0.86, 0.995 ], grille: [ 0.6, 0.88, 0.46, 2 ] },
	},
	[ CAR.VAN ]: {
		body: [ [ - 2.55, 0.38, 0.62, 0.72, 0.92 ], [ - 2.48, 0.31, 0.8, 0.9, 0.97 ], [ - 2.2, 0.29, 0.97, 1.04, 1 ], [ - 1.72, 0.28, 1.0, 1.08, 1 ], [ 2.45, 0.3, 1.04, 1.1, 1 ], [ 2.55, 0.38, 0.95, 1.04, 0.97 ] ],
		cab: { z: [ - 1.72, - 0.95, 2.48, 2.55 ], roof: 2.12, w: 0.9, pillarB: - 0.2, cPillar: false, glassTo: - 0.25 },
		doors: [ [ - 1.3, - 0.25 ], [ - 0.1, 1.2 ] ], trunk: [ 2.2, 2.55, 'hatch' ], hood: [ - 2.45, - 1.8 ],
		look: { rim: 0, tw: 0.11, gap: 0.06, flare: 0, head: [ 0.74, 0.07, 0.5, 0.96 ], tail: [ 1.0, 0.16, 0.86, 0.995 ], grille: [ 0.5, 0.7, 0.42, 1 ] },
	},
	[ CAR.POLICE ]: {
		body: [ [ - 2.475, 0.33, 0.56, 0.63, 0.9 ], [ - 2.4, 0.25, 0.67, 0.76, 0.96 ], [ - 2.15, 0.21, 0.78, 0.86, 1 ], [ - 1.25, 0.2, 0.82, 0.92, 1 ], [ - 0.9, 0.2, 0.86, 0.95, 1 ], [ 1.55, 0.2, 0.9, 0.98, 1 ], [ 2.15, 0.22, 0.9, 0.99, 0.99 ], [ 2.4, 0.28, 0.84, 0.94, 0.95 ], [ 2.475, 0.36, 0.72, 0.82, 0.9 ] ],
		cab: { z: [ - 0.9, - 0.08, 0.88, 1.55 ], roof: 1.52, w: 0.78, pillarB: 0.34, cPillar: true },
		doors: [ [ - 0.85, 0.34 ], [ 0.34, 1.25 ] ], trunk: [ 1.6, 2.43, 'lid' ], hood: [ - 2.3, - 0.95 ], police: true,
		look: { rim: 0, black: true, tw: 0.11, gap: 0.05, flare: 0, head: [ 0.61, 0.06, 0.48, 0.95 ], tail: [ 0.72, 0.07, 0.5, 0.97 ], grille: [ 0.44, 0.6, 0.4, 0 ] },
	},
	[ CAR.HUMVEE ]: {
		body: [ [ - 2.3, 0.52, 0.86, 0.92, 0.94 ], [ - 2.2, 0.46, 1.0, 1.08, 1 ], [ - 1.1, 0.46, 1.04, 1.12, 1 ], [ - 0.9, 0.46, 1.06, 1.13, 1 ], [ 2.2, 0.46, 1.06, 1.13, 1 ], [ 2.3, 0.52, 0.98, 1.08, 0.97 ] ],
		cab: { z: [ - 0.9, - 0.66, 2.0, 2.24 ], roof: 1.86, w: 0.9, pillarB: 0.2, cPillar: true, slit: true, glassTo: 1.12 },
		doors: [ [ - 0.85, 0.2 ], [ 0.2, 1.12 ] ], trunk: [ 1.3, 2.25, 'hatch' ], hood: [ - 2.2, - 0.95 ], military: true,
		look: { rim: 2, tw: 0.165, gap: 0.1, flare: 0.03, head: [ 0.84, 0.05, 0.62, 0.86 ], tail: [ 0.9, 0.06, 0.82, 0.97 ], grille: [ 0.62, 0.9, 0.5, 3 ] },
	},
	[ CAR.MTRUCK ]: {
		body: [ [ - 3.6, 0.72, 1.15, 1.25, 0.95 ], [ - 3.5, 0.64, 1.3, 1.42, 1 ], [ - 2.2, 0.64, 1.35, 1.48, 1 ], [ - 1.0, 0.66, 1.3, 1.42, 1 ], [ - 0.95, 0.9, 1.3, 1.42, 1 ], [ 3.5, 0.9, 1.35, 1.42, 1 ], [ 3.6, 0.95, 1.3, 1.4, 0.98 ] ],
		cab: { z: [ - 3.45, - 3.2, - 1.15, - 1.05 ], roof: 2.75, w: 0.92, pillarB: 99, cPillar: false, slit: true },
		doors: [ [ - 3.0, - 1.9 ], null ], trunk: null, hood: null, military: true, cover: [ - 0.9, 3.55, 1.42, 3.1 ],
		look: { rim: 2, tw: 0.19, gap: 0.08, flare: 0, head: [ 0.98, 0.07, 0.62, 0.86 ], tail: [ 1.1, 0.06, 0.8, 0.95 ], grille: [ 0.95, 1.22, 0.55, 3 ] },
	},
	[ CAR.BUS ]: {
		body: [ [ - 6.0, 0.36, 0.95, 1.05, 0.97 ], [ - 5.9, 0.3, 1.15, 1.25, 1 ], [ 5.9, 0.3, 1.15, 1.25, 1 ], [ 6.0, 0.36, 1.05, 1.15, 0.97 ] ],
		cab: { z: [ - 5.98, - 5.75, 5.85, 5.98 ], roof: 3.1, w: 0.97, pillarB: 99, cPillar: false, pillars: 1.35 },
		doors: [ [ - 5.4, - 4.3 ], [ 0.2, 1.3 ] ], trunk: null, hood: null, bus: true,
		look: { rim: 3, tw: 0.14, gap: 0.06, flare: 0, head: [ 0.62, 0.07, 0.62, 0.92 ], tail: [ 0.75, 0.1, 0.78, 0.96 ], grille: [ 0.42, 0.7, 0.3, 0 ] },
	},
};

const AXLE3 = { [ CAR.MTRUCK ]: - 1.3 }; // a third axle (offset from the rear one)
const DUALS = { [ CAR.BUS ]: true }; // twin tyres on the rear axle

// ---- triangle soup with creased normals ---------------------------------------------------------------------

// Triangles collected per (colour, tag) group, each wound to face along an `out` hint; the normals are creased over
// the whole set (smooth across gently curved panels, sharp at folds like sills, shoulders and pillars), then each
// group goes to the model builder with its own colour and tag.
class Skin {
	constructor() { this.groups = new Map(); }
	_list( hex, tag ) {
		const k = hex + '|' + tag[ 0 ] + ',' + tag[ 1 ] + ',' + tag[ 2 ];
		let e = this.groups.get( k );
		if ( ! e ) { e = { hex, tag, p: [] }; this.groups.set( k, e ); }
		return e.p;
	}
	tri( a, b, c, hex, tag, out ) {
		const ux = b[ 0 ] - a[ 0 ], uy = b[ 1 ] - a[ 1 ], uz = b[ 2 ] - a[ 2 ], vx = c[ 0 ] - a[ 0 ], vy = c[ 1 ] - a[ 1 ], vz = c[ 2 ] - a[ 2 ];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		if ( nx * nx + ny * ny + nz * nz < 1e-12 ) return;
		const p = this._list( hex, tag );
		if ( out && nx * out[ 0 ] + ny * out[ 1 ] + nz * out[ 2 ] < 0 ) p.push( a[ 0 ], a[ 1 ], a[ 2 ], c[ 0 ], c[ 1 ], c[ 2 ], b[ 0 ], b[ 1 ], b[ 2 ] );
		else p.push( a[ 0 ], a[ 1 ], a[ 2 ], b[ 0 ], b[ 1 ], b[ 2 ], c[ 0 ], c[ 1 ], c[ 2 ] );
	}
	quad( a, b, c, d, hex, tag, out ) { this.tri( a, b, c, hex, tag, out ); this.tri( a, c, d, hex, tag, out ); }
	geometries( crease = 0.62 ) {
		const all = [], ranges = [];
		for ( const e of this.groups.values() ) { ranges.push( [ e, all.length / 3, e.p.length / 3 ] ); for ( let i = 0; i < e.p.length; i ++ ) all.push( e.p[ i ] ); }
		if ( ! all.length ) return [];
		let g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( all, 3 ) );
		g = toCreasedNormals( g, crease );
		const Pa = g.attributes.position.array, Na = g.attributes.normal.array;
		return ranges.map( ( [ e, s, n ] ) => {
			const gg = new THREE.BufferGeometry();
			gg.setAttribute( 'position', new THREE.BufferAttribute( Pa.slice( s * 3, ( s + n ) * 3 ), 3 ) );
			gg.setAttribute( 'normal', new THREE.BufferAttribute( Na.slice( s * 3, ( s + n ) * 3 ), 3 ) );
			return { geo: gg, hex: e.hex, tag: e.tag };
		} );
	}
	emit( b, crease ) { for ( const { geo, hex, tag } of this.geometries( crease ) ) b.add( geo, hex, tag ); }
}

// Loft right-half profiles ( [ x, y ] from the bottom centre round to the top centre, counter-clockwise seen from
// the front) along the stations, mirrored to the left; kind( k, A, C ) gives segment k's [ hex, tag ] or null; flip:
// the same surface facing inwards
function loft( sk, st, kind, flip = false ) {
	for ( let i = 0; i < st.length - 1; i ++ ) {
		const A = st[ i ], C = st[ i + 1 ];
		const flat = Math.abs( C.z - A.z ) < 1e-5; // an arch edge: the face looks along z, into the opening
		for ( let k = 0; k < A.pts.length - 1; k ++ ) {
			const m = kind( k, A, C );
			if ( ! m ) continue;
			const a0 = A.pts[ k ], a1 = A.pts[ k + 1 ], c0 = C.pts[ k ], c1 = C.pts[ k + 1 ];
			const dx = a1[ 0 ] - a0[ 0 ] + c1[ 0 ] - c0[ 0 ], dy = a1[ 1 ] - a0[ 1 ] + c1[ 1 ] - c0[ 1 ];
			for ( const s of [ 1, - 1 ] ) {
				const out = flat ? [ 0, 0, C.lift ? 1 : - 1 ] : flip ? [ - s * dy, dx, 0 ] : [ s * dy, - dx, 0 ];
				sk.quad( [ s * a0[ 0 ], a0[ 1 ], A.z ], [ s * a1[ 0 ], a1[ 1 ], A.z ], [ s * c1[ 0 ], c1[ 1 ], C.z ], [ s * c0[ 0 ], c0[ 1 ], C.z ], m[ 0 ], m[ 1 ], out );
			}
		}
	}
}

// a ring of quads around an axis along x: profile [ radius, axial ] (axial + towards `side`), centre of the
// section `ctr` [ radius, axial ] (normals face away from it)
function lathe( sk, prof, seg, c, side, hex, tag, ctr, a0 = 0, a1 = Math.PI * 2 ) {
	for ( let k = 0; k < prof.length - 1; k ++ ) {
		const [ r0, x0 ] = prof[ k ], [ r1, x1 ] = prof[ k + 1 ];
		// 2D outward normal of the segment ( radial, axial ), pointing away from the section centre
		let nr = x1 - x0, na = - ( r1 - r0 );
		const mr = ( r0 + r1 ) / 2 - ctr[ 0 ], ma = ( x0 + x1 ) / 2 - ctr[ 1 ];
		if ( nr * mr + na * ma < 0 ) { nr = - nr; na = - na; }
		for ( let j = 0; j < seg; j ++ ) {
			const t0 = a0 + ( a1 - a0 ) * j / seg, t1 = a0 + ( a1 - a0 ) * ( j + 1 ) / seg, tm = ( t0 + t1 ) / 2;
			const Pt = ( r, x, t ) => [ c[ 0 ] + side * x, c[ 1 ] + r * Math.cos( t ), c[ 2 ] + r * Math.sin( t ) ];
			sk.quad( Pt( r0, x0, t0 ), Pt( r1, x1, t0 ), Pt( r1, x1, t1 ), Pt( r0, x0, t1 ), hex, tag, [ side * na, nr * Math.cos( tm ), nr * Math.sin( tm ) ] );
		}
	}
}

// ---- wheels -----------------------------------------------------------------------------------------------------------

// tyre and rim of one wheel at the origin, outer face +x: [ { geo, hex, tag } ] (turned round for the left side)
const RIM_HEX = [ 0xb4b7ba, 0x9da1a5, 0x3b3e2c, 0xc9c9c2 ];
function wheelParts( r, h, lod, look ) {
	const ri = r * 0.64;
	const rimHex = look.black ? 0x1c1d1e : RIM_HEX[ look.rim ] || RIM_HEX[ 0 ];
	if ( lod ) {
		// far: an eight-sided tread band and a flat rim disc (the shader still paints the rim pattern)
		const t = new THREE.CylinderGeometry( r, r, h * 2, 8, 1, true );
		t.rotateZ( Math.PI / 2 );
		const d = new THREE.CircleGeometry( r * 0.9, 8 );
		d.rotateY( Math.PI / 2 ); d.translate( h, 0, 0 );
		const di = new THREE.CircleGeometry( r * 0.9, 8 );
		di.rotateY( - Math.PI / 2 ); di.translate( - h, 0, 0 );
		return [ { geo: t, hex: 0x161616, tag: TAG.tyre }, { geo: d, hex: rimHex, tag: TAG.rim }, { geo: di, hex: 0x101010, tag: TAG.tyre } ];
	}
	const sk = new Skin();
	// (round silhouette first: 16 sides, few profile steps; the shader draws the tread and sidewall)
	const seg = 16;
	const tyre = [ [ ri, - h * 0.9 ], [ r, - h * 0.45 ], [ r, h * 0.45 ], [ r * 0.93, h * 0.97 ], [ ri, h * 0.94 ] ];
	lathe( sk, tyre, seg, [ 0, 0, 0 ], 1, 0x161616, TAG.tyre, [ r * 0.8, 0 ] );
	const rim = look.rim === 2 ? [ [ ri, h * 0.94 ], [ ri * 0.62, h * 0.5 ], [ ri * 0.22, h * 0.6 ], [ 0, h * 0.86 ] ]
		: [ [ ri, h * 0.94 ], [ ri * 0.88, h * 0.62 ], [ ri * 0.42, h * 0.5 ], [ 0, h * 0.72 ] ];
	// (the rim face is a dish: its normals face out of the wheel, away from a point deep inside it)
	lathe( sk, rim, seg, [ 0, 0, 0 ], 1, rimHex, TAG.rim, [ ri * 0.5, - h * 3 ] );
	const parts = sk.geometries( 0.75 );
	// the back of the wheel (seen from under the car)
	const di = new THREE.CircleGeometry( ri, 10 );
	di.rotateY( - Math.PI / 2 ); di.translate( - h * 0.8, 0, 0 );
	parts.push( { geo: di, hex: 0x101010, tag: TAG.tyre } );
	return parts;
}

function placeWheel( b, parts, x, y, z, side ) {
	for ( const { geo, hex, tag } of parts ) b.add( geo.clone(), hex, tag, { x, y, z, ry: side < 0 ? Math.PI : 0 } );
}

// ---- the body -------------------------------------------------------------------------------------------------------------

// piecewise-linear key stations -> [ yb, ybelt, yt, wf ] at z
function bodyAt( S, z ) {
	const B = S.body;
	if ( z <= B[ 0 ][ 0 ] ) return B[ 0 ].slice( 1 );
	for ( let i = 0; i < B.length - 1; i ++ ) {
		const a = B[ i ], c = B[ i + 1 ];
		if ( z <= c[ 0 ] ) { const t = ( z - a[ 0 ] ) / ( c[ 0 ] - a[ 0 ] || 1 ); return [ 1, 2, 3, 4 ].map( k => a[ k ] + ( c[ k ] - a[ k ] ) * t ); }
	}
	return B[ B.length - 1 ].slice( 1 );
}

function axles( type ) {
	const D = CAR_DIMS[ type ];
	const a = [ D.zf, D.zr ];
	if ( AXLE3[ type ] ) a.push( D.zr + AXLE3[ type ] );
	return a;
}

// right-half section of the lower body at z. ya: the top of the wheel opening here (0: none); cabin: the top folds
// down into an inner wall and a floor (the cabin is open to the glasshouse above it)
function lowerSection( S, hw, z, ya, cabin, floorY, flare ) {
	const [ yb, ybelt, yt, wf ] = bodyAt( S, z );
	const w = hw * wf;
	const yo = Math.max( yb, ya );
	const fl = ya > 0 ? 1 + flare : 1;
	const p = [];
	p.push( [ 0, yb + 0.03 ] ); // 0 underbody centre
	p.push( [ w * 0.6, yb ] ); // 1 underbody
	p.push( [ w * 0.9, yo ] ); // 2 underbody edge / top of the wheel opening
	p.push( [ w * 0.975 * fl, yo + 0.035 ] ); // 3 sill round / arch lip
	const y4 = yo + ( ya > 0 ? 0.08 : 0.12 );
	p.push( [ w * 0.997 * fl, y4 ] ); // 4 rocker / lip
	const y5 = Math.max( ybelt - ( ybelt - yb ) * 0.38, y4 + 0.04 );
	p.push( [ w, y5 ] ); // 5 the side at its widest
	const y6 = Math.max( ybelt, y5 + 0.03 );
	p.push( [ w * 0.99, y6 ] ); // 6 beltline
	const y7 = Math.max( yt - 0.025, y6 + 0.01 );
	p.push( [ w * 0.958, y7 ] ); // 7 shoulder
	const y8 = Math.max( yt, y7 + 0.005 );
	p.push( [ w * 0.9, y8 ] ); // 8 top edge
	if ( cabin ) {
		// inner wall down to the floor (over the wheel tubs) and the floor to the middle
		p.push( [ w * 0.8, Math.max( floorY + 0.08, ya > 0 ? ya + 0.05 : 0 ) ] );
		p.push( [ 0, floorY ] );
	} else {
		p.push( [ w * 0.5, y8 + 0.02 ] );
		p.push( [ 0, y8 + 0.025 ] );
	}
	return p;
}
// points kept per LOD (indices into the full section)
const SEC_IDX = [ [ 0, 2, 3, 4, 5, 6, 7, 8, 9, 10 ], [ 0, 2, 4, 6, 8, 10 ], [ 0, 4, 6, 8, 10 ] ];

function buildCar( type, lod ) {
	const S = SPECS[ type ], D = CAR_DIMS[ type ], L = S.look;
	const b = new MB();
	const sk = new Skin();
	const hw = D.W / 2, r = D.r;
	const cab = S.cab;
	const [ zA, zB, zC, zD ] = cab.z;
	const floorY = S.body[ 2 ][ 1 ] + 0.12;
	const Ra = r + L.gap;
	const zF = S.body[ 0 ][ 0 ], zR = S.body[ S.body.length - 1 ][ 0 ];
	const inCabin = ( z ) => lod === 0 && z > zA + 0.035 && z < zD - 0.035 && ! S.bed;
	// ---- lower body stations ----
	// (the low LOD keeps five key stations, or the ones the spec names)
	const nb = S.body.length;
	const keep = lod < 2 ? null : S.low || ( nb <= 6 ? null : [ 0, 2, nb >> 1, nb - 3, nb - 1 ] );
	const zs = new Set( S.body.filter( ( s, i ) => ! keep || keep.includes( i ) ).map( s => s[ 0 ] ) );
	if ( lod === 0 ) for ( let i = 0; i < S.body.length - 1; i ++ ) {
		const a = S.body[ i ][ 0 ], c = S.body[ i + 1 ][ 0 ], n = Math.floor( ( c - a ) / 0.8 );
		for ( let k = 1; k < n; k ++ ) zs.add( a + ( c - a ) * k / n );
	}
	if ( lod === 0 && ! S.bed ) { zs.add( zA ); zs.add( zA + 0.04 ); zs.add( zD - 0.04 ); zs.add( zD ); }
	// plain stations (none inside a wheel opening), then each opening as a block: plain edge, lifted edge, the arc,
	// lifted edge, plain edge (`o` keeps that order where two stations share a z)
	const arches = lod < 2 ? axles( type ).map( za => [ za - Ra, za + Ra, za ] ) : [];
	let list = [ ...zs ].filter( z => z >= zF && z <= zR && ! arches.some( ( [ z0, z1 ] ) => z > z0 - 0.03 && z < z1 + 0.03 ) ).sort( ( a, c ) => a - c )
		.filter( ( z, i, a ) => i === 0 || z - a[ i - 1 ] > 0.02 ).map( z => ( { z, ya: 0, lift: false, o: 0 } ) );
	for ( const [ z0, z1, za ] of arches ) {
		list.push( { z: z0, ya: 0, lift: false, o: 0 }, { z: z1, ya: 0, lift: false, o: 1 } );
		const n = lod ? 2 : 4;
		for ( let k = 0; k <= n; k ++ ) {
			const dz = - Math.cos( Math.PI * k / n ) * Ra;
			list.push( { z: k === 0 ? z0 : k === n ? z1 : za + dz, ya: r + Math.sqrt( Math.max( 0, Ra * Ra - dz * dz ) ), lift: true, o: k === 0 ? 1 : 0 } );
		}
	}
	list.sort( ( a, c ) => a.z - c.z || a.o - c.o );
	const idx = SEC_IDX[ lod ];
	const st = list.map( s => {
		const full = lowerSection( S, hw, s.z, s.ya, inCabin( s.z ), floorY, L.flare );
		return { z: s.z, lift: s.lift, cabin: inCabin( s.z ), pts: idx ? idx.map( k => full[ k ] ) : full, map: idx || full.map( ( _, k ) => k ) };
	} );
	const PAINT = [ 0xffffff, TAG.paint ], UNDERS = [ UNDER, TAG.under ], INT = [ DASH, TAG.interior ];
	loft( sk, st, ( k, A, C ) => {
		const k0 = A.map[ k ];
		if ( k0 < 2 ) return UNDERS;
		if ( k0 >= 8 && ( A.cabin || C.cabin ) ) return INT;
		return PAINT;
	} );
	// end caps
	for ( const [ s, dir ] of [ [ st[ 0 ], - 1 ], [ st[ st.length - 1 ], 1 ] ] ) {
		const ring = [ ...s.pts.map( p => [ p[ 0 ], p[ 1 ], s.z ] ), ...s.pts.slice().reverse().map( p => [ - p[ 0 ], p[ 1 ], s.z ] ) ];
		const c = [ 0, ( s.pts[ 0 ][ 1 ] + s.pts[ s.pts.length - 1 ][ 1 ] ) / 2, s.z ];
		for ( let k = 0; k < ring.length; k ++ ) sk.tri( c, ring[ k ], ring[ ( k + 1 ) % ring.length ], 0xffffff, TAG.paint, [ 0, 0, dir ] );
	}
	// ---- glasshouse ----
	const roofW = hw * cab.w;
	const topAt = ( z ) => { const [ , , yt, wf ] = bodyAt( S, z ); return [ yt, hw * wf * 0.93 ]; };
	const gs = [];
	const push = ( z, f ) => { const [ yb, wb ] = topAt( z ); gs.push( { z, f, yb, wb, yr: yb + ( cab.roof - yb ) * f, wr: wb + ( roofW - wb ) * f } ); };
	const front = lod === 0 ? [ [ 0.38, 0.6 ], [ 0.72, 0.9 ] ] : lod === 1 ? [ [ 0.45, 0.66 ] ] : [];
	const rear = lod === 0 ? [ [ 0.3, 0.9 ], [ 0.62, 0.62 ] ] : lod === 1 ? [ [ 0.55, 0.6 ] ] : [];
	push( zA, 0 );
	for ( const [ t, f ] of front ) push( zA + ( zB - zA ) * t, f );
	push( zB, 1 );
	if ( lod === 0 || ( lod === 1 && cab.pillars ) ) {
		if ( cab.pillarB < zC && cab.pillarB > zB ) { push( cab.pillarB - 0.06, 1 ); push( cab.pillarB + 0.06, 1 ); }
		if ( cab.pillars ) for ( let z = zB + cab.pillars; z < zC - 0.3; z += cab.pillars ) { push( z - 0.07, 1 ); push( z + 0.07, 1 ); }
	}
	if ( lod < 2 && cab.glassTo !== undefined && cab.glassTo > zB && cab.glassTo < zC ) push( cab.glassTo, 1 );
	push( zC, 1 );
	for ( const [ t, f ] of rear ) push( zC + ( zD - zC ) * t, f );
	push( zD, 0 );
	gs.sort( ( a, c ) => a.z - c.z );
	const lo = cab.slit ? 0.38 : 0.07, hi = cab.slit ? 0.86 : 0.9;
	const lerp = ( p, q, t ) => [ p[ 0 ] + ( q[ 0 ] - p[ 0 ] ) * t, p[ 1 ] + ( q[ 1 ] - p[ 1 ] ) * t ];
	const gst = gs.map( g => {
		const B = [ g.wb, g.yb ], R = [ g.wr, g.yr ];
		const top = [ [ g.wr * 0.93, g.yr + 0.03 * g.f ], [ g.wr * 0.5, g.yr + 0.05 * g.f ], [ 0, g.yr + 0.055 * g.f ] ];
		const pts = lod === 2 ? [ B, R, top[ 2 ] ] : lod === 1 ? [ B, lerp( B, R, lo ), lerp( B, R, hi ), R, top[ 2 ] ] : [ B, lerp( B, R, lo ), lerp( B, R, hi ), R, ...top ];
		return { z: g.z, pts };
	} );
	// what each segment of the glasshouse section is: f frame (paint), w window (or paint), t top (roof or screen)
	const GK = [ [ 'f', 'w', 'f', 'f', 't', 't' ], [ 'f', 'w', 'f', 't' ], [ 'w', 't' ] ][ lod ];
	const windowAt = ( zm ) => {
		let glass = zm > zB && zm < zC;
		if ( cab.pillarB < zC && Math.abs( zm - cab.pillarB ) < 0.07 ) glass = false;
		if ( cab.pillars && ( ( zm - zB ) % cab.pillars < 0.08 || ( zm - zB ) % cab.pillars > cab.pillars - 0.08 ) && zm > zB + 0.2 ) glass = false;
		if ( cab.glassTo !== undefined && zm > cab.glassTo && zm < zC ) glass = false;
		if ( ! cab.cPillar && zm >= zC && zm < zD ) glass = true;
		if ( zm < zB && zm > zA ) glass = true; // the quarter glass ahead of the door window (the A-pillar stays painted above it)
		return glass;
	};
	const G = [ GLASS, TAG.glass ], SCR = [ GLASS, TAG.screen ];
	loft( sk, gst, ( k, A, C ) => {
		const zm = ( A.z + C.z ) / 2;
		const kind = GK[ k ];
		if ( kind === 'w' ) return windowAt( zm ) ? G : PAINT;
		if ( kind === 't' ) return zm < zB || zm > zC ? SCR : PAINT;
		return PAINT;
	} );
	// the bodies are single-sided (the hidden inside of a shell costs a whole extra layer of shading): up close the
	// glasshouse gets its inside too, so a broken window or an open door shows the headliner, the pillars and the far
	// glass rather than the sky
	if ( lod === 0 ) loft( sk, gst, ( k, A, C ) => {
		const zm = ( A.z + C.z ) / 2;
		const kind = GK[ k ];
		if ( kind === 'w' && windowAt( zm ) ) return G;
		if ( kind === 't' && ( zm < zB || zm > zC ) ) return SCR;
		return kind === 't' ? [ 0x3a3833, TAG.interior ] : [ 0x1c1b19, TAG.interior ];
	}, true );
	sk.emit( b, 0.62 );
	// ---- bumpers, lamps' housings, plates ----
	const f = S.body[ 0 ], rr = S.body[ S.body.length - 1 ];
	const mil = !! S.military;
	if ( lod === 0 && ! mil ) {
		for ( const [ s, dir ] of [ [ f, - 1 ], [ rr, 1 ] ] ) {
			const y0 = s[ 1 ] - 0.03, y1 = s[ 1 ] + ( S.bus ? 0.26 : 0.19 );
			bumper( b, s[ 0 ], dir, y0, y1, hw * s[ 4 ] * 1.01, S.bus ? 0.07 : 0.085, S.bus ? 0.15 : 0.32, type === CAR.PICKUP && dir > 0 ? [ 0xa8abae, TAG.chrome ] : [ 0x1a1a1b, TAG.gloss ], lod );
		}
	} else if ( mil ) {
		// steel bumpers with tow shackles
		b.box( D.W * 1.0, 0.2, 0.14, 0x2e3122, TAG.trim, { y: f[ 1 ] + 0.06, z: zF - 0.06 } );
		b.box( D.W * 0.96, 0.16, 0.12, 0x2e3122, TAG.trim, { y: rr[ 1 ] + 0.04, z: zR + 0.05 } );
		if ( lod === 0 ) for ( const s of [ - 1, 1 ] ) {
			b.torus( 0.05, 0.015, 4, 8, 0x1a1a1a, TAG.trim, { x: s * hw * 0.62, y: f[ 1 ] + 0.06, z: zF - 0.16, ry: Math.PI / 2 } );
			b.box( 0.06, 0.06, 0.1, 0x1a1a1a, TAG.trim, { x: s * hw * 0.5, y: rr[ 1 ] + 0.04, z: zR + 0.14 } );
		}
	} else if ( lod === 1 ) {
		b.box( D.W * f[ 4 ] * 1.01, 0.2, 0.14, 0x1b1b1b, TAG.trim, { y: f[ 1 ] + 0.07, z: zF + 0.01 } );
		b.box( D.W * rr[ 4 ] * 1.01, 0.2, 0.14, 0x1b1b1b, TAG.trim, { y: rr[ 1 ] + 0.07, z: zR - 0.01 } );
	}
	if ( ! mil && lod === 0 ) {
		const yf = f[ 1 ] + 0.08, yr = rr[ 1 ] + ( S.bus ? 0.38 : 0.28 );
		b.box( 0.3, 0.15, 0.01, 0xe8e6dc, TAG.plate, { y: yf, z: zF - 0.066 } );
		b.box( 0.3, 0.15, 0.01, 0xe8e6dc, TAG.plate, { y: yr, z: zR + 0.006 } );
	}
	if ( S.bus ) {
		// destination sign over the windscreen
		b.box( D.W * 0.9, 0.3, 0.03, 0x111111, TAG.trim, { y: 2.8, z: zF - 0.01 } );
		b.box( D.W * 0.7, 0.18, 0.02, 0xd08a20, TAG.head, { y: 2.8, z: zF - 0.03 } );
	}
	// ---- mirrors, wipers, antenna ----
	if ( lod < 2 && type !== CAR.BUS && type !== CAR.MTRUCK ) {
		const zm = zA + ( zB - zA ) * 0.78;
		const [ yb, wb ] = topAt( zm );
		for ( const s of [ - 1, 1 ] ) {
			const x = s * ( wb + 0.15 ), y = yb + 0.14;
			if ( lod === 0 ) {
				b.sphere( 0.5, 6, 4, 0xffffff, TAG.paint, { x, y, z: zm, sx: 0.2, sy: 0.12, sz: 0.09 } );
				b.box( 0.15, 0.085, 0.01, 0x6f777c, TAG.chrome, { x, y, z: zm + 0.04 } );
				b.box( 0.12, 0.03, 0.06, BLACK, TAG.trim, { x: s * ( wb + 0.05 ), y: y - 0.03, z: zm } );
			} else b.box( 0.18, 0.11, 0.08, 0xffffff, TAG.paint, { x, y, z: zm } );
		}
	} else if ( lod < 2 ) {
		// big truck / bus mirrors on arms
		const zm = zF + 0.15, y = type === CAR.BUS ? 2.3 : 2.1;
		for ( const s of [ - 1, 1 ] ) {
			b.beam( [ s * hw * 0.98, y - 0.1, zm + 0.1 ], [ s * ( hw + 0.25 ), y, zm - 0.05 ], 0.025, 0.025, BLACK, TAG.trim );
			b.box( 0.06, 0.32, 0.18, 0x151515, TAG.trim, { x: s * ( hw + 0.27 ), y: y - 0.1, z: zm - 0.05 } );
		}
	}
	if ( lod === 0 && ! S.bus && type !== CAR.MTRUCK ) {
		// wipers parked on the foot of the windscreen (its lower part rises at about 0.6 / 0.38 of the mean slope)
		const [ yb ] = topAt( zA );
		const run = zB - zA, rise = cab.roof - yb, t = 0.08 / run;
		const yw = yb + rise * Math.min( 1, t / 0.38 * 0.6 ) + 0.012;
		for ( const x of [ - 0.3, 0.22 ] ) b.box( 0.5, 0.012, 0.03, BLACK, TAG.trim, { x: x * D.W / 1.82, y: yw, z: zA + 0.08, rx: - Math.atan2( rise * 1.58, run ), rz: 0.06 } );
		const roofAnt = S.police || mil;
		b.cyl( 0.004, 0.006, roofAnt ? 0.3 : 0.55, 4, BLACK, TAG.trim, { x: hw * ( roofAnt ? 0.5 : 0.8 ), y: roofAnt ? cab.roof + 0.17 : topAt( zF + 0.6 )[ 0 ] + 0.27, z: roofAnt ? zC - 0.2 : zF + 0.6 } );
		// tail pipe
		b.cyl( 0.03, 0.03, 0.18, 6, 0x2a2826, TAG.chrome, { x: - hw * 0.55, y: rr[ 1 ] - 0.08, z: zR - 0.02, axis: 'z' } );
	}
	// ---- type extras ----
	if ( S.bed ) {
		const [ z0, z1, yf, yt ] = S.bed;
		for ( const s of [ - 1, 1 ] ) {
			b.box( 0.07, yt - yf + 0.34, z1 - z0, 0xffffff, TAG.paint, { x: s * ( hw - 0.035 ), y: ( yf - 0.34 + yt ) / 2 + 0.17, z: ( z0 + z1 ) / 2 } );
			if ( lod < 2 ) b.box( 0.12, 0.03, z1 - z0 + 0.02, BLACK, TAG.trim, { x: s * ( hw - 0.045 ), y: yt + 0.02, z: ( z0 + z1 ) / 2 } ); // bed rail caps
		}
		b.box( D.W - 0.14, yt - yf, 0.07, 0xffffff, TAG.paint, { y: ( yf + yt ) / 2, z: z0 + 0.035 } );
		b.box( D.W, yt - yf + 0.34, 0.07, 0xffffff, TAG.paint, { y: ( yf - 0.34 + yt ) / 2 + 0.17, z: z1 } );
		b.box( D.W - 0.14, 0.02, z1 - z0, 0x1c1c1c, TAG.trim, { y: yf + 0.01, z: ( z0 + z1 ) / 2 } );
		if ( lod === 0 ) for ( let k = - 3; k <= 3; k ++ ) b.box( 0.04, 0.015, z1 - z0 - 0.1, 0x262626, TAG.trim, { x: k * 0.22, y: yf + 0.025, z: ( z0 + z1 ) / 2 } ); // bed liner ribs
	}
	if ( S.cover ) {
		const [ z0, z1, y0, y1 ] = S.cover;
		const prof = [];
		for ( let k = 0; k <= ( lod ? 4 : 8 ); k ++ ) { const a = k / ( lod ? 4 : 8 ) * Math.PI; prof.push( [ Math.cos( a ) * hw, y1 - 0.35 + Math.sin( a ) * 0.35 ] ); }
		const pts = [ [ hw, y0 ], ...prof, [ - hw, y0 ] ];
		const csk = new Skin();
		// the canvas sags a little between the bows
		const zsC = [];
		const nb = lod === 0 ? 5 : 1;
		for ( let k = 0; k <= nb * 2; k ++ ) zsC.push( z0 + ( z1 - z0 ) * k / ( nb * 2 ) );
		for ( let i = 0; i < zsC.length - 1; i ++ ) {
			const za = zsC[ i ], zc = zsC[ i + 1 ];
			const sa = lod === 0 && i % 2 === 1 ? 0.035 : 0, sc = lod === 0 && ( i + 1 ) % 2 === 1 ? 0.035 : 0;
			for ( let k = 0; k < pts.length - 1; k ++ ) {
				const p0 = pts[ k ], p1 = pts[ k + 1 ];
				const sag = ( p, s ) => [ p[ 0 ] * ( 1 - s * 0.3 ), p[ 1 ] - s * ( p[ 1 ] > y1 - 0.4 ? 1 : 0.3 ) ];
				const a0 = sag( p0, sa ), a1 = sag( p1, sa ), c0 = sag( p0, sc ), c1 = sag( p1, sc );
				const mx = ( p0[ 0 ] + p1[ 0 ] ) / 2, my = ( p0[ 1 ] + p1[ 1 ] ) / 2;
				csk.quad( [ a0[ 0 ], a0[ 1 ], za ], [ a1[ 0 ], a1[ 1 ], za ], [ c1[ 0 ], c1[ 1 ], zc ], [ c0[ 0 ], c0[ 1 ], zc ], 0x5b6340, TAG.canvas, [ mx, my - ( y1 - 0.6 ), 0 ] );
			}
		}
		for ( const [ z, d ] of [ [ z0, - 1 ], [ z1, 1 ] ] ) {
			const c = [ 0, ( y0 + y1 ) / 2, z ];
			const ring = pts.map( ( [ x, y ] ) => [ x, y, z ] );
			for ( let k = 0; k < ring.length; k ++ ) csk.tri( c, ring[ k ], ring[ ( k + 1 ) % ring.length ], d > 0 ? 0x1c1f14 : 0x4f5736, TAG.canvas, [ 0, 0, d ] );
		}
		csk.emit( b, 0.9 );
		b.box( D.W, 0.12, z1 - z0, 0x3a3f28, TAG.paint, { y: y0 + 0.06, z: ( z0 + z1 ) / 2 } );
		if ( lod < 2 ) {
			// fuel tank, side rails, spare
			b.cyl( 0.22, 0.22, 0.9, lod ? 6 : 10, 0x3a3f28, TAG.paint, { x: hw - 0.25, y: 0.7, z: - 0.5, axis: 'z' } );
			for ( const s of [ - 1, 1 ] ) b.box( 0.05, 0.1, z1 - z0, 0x2e3122, TAG.trim, { x: s * ( hw + 0.02 ), y: y0 - 0.05, z: ( z0 + z1 ) / 2 } );
		}
	}
	if ( S.police && lod < 2 ) {
		const y = cab.roof + 0.02, z = ( zB + zC ) / 2 - 0.15;
		b.box( 1.24, 0.05, 0.3, 0x111111, TAG.trim, { y: y + 0.025, z } );
		for ( const s of [ - 1, 1 ] ) {
			b.box( 0.56, 0.09, 0.26, s < 0 ? 0x7a0a0a : 0x0a1a7a, s < 0 ? TAG.red : TAG.blue, { x: s * 0.31, y: y + 0.095, z } );
			if ( lod === 0 ) b.box( 0.04, 0.08, 0.22, 0x141414, TAG.trim, { x: s * 0.6, y: y + 0.095, z } );
		}
		if ( lod === 0 ) b.box( 0.12, 0.09, 0.27, 0xdadada, TAG.head, { y: y + 0.095, z } ); // takedown lights
		// push bumper
		for ( const s of [ - 1, 1 ] ) b.box( 0.06, 0.48, 0.06, 0x111111, TAG.trim, { x: s * 0.42, y: f[ 1 ] + 0.33, z: zF - 0.17 } );
		b.box( 0.96, 0.07, 0.06, 0x111111, TAG.trim, { y: f[ 1 ] + 0.55, z: zF - 0.17 } );
		b.box( 0.96, 0.07, 0.06, 0x111111, TAG.trim, { y: f[ 1 ] + 0.18, z: zF - 0.17 } );
		if ( lod === 0 ) {
			for ( const s of [ - 1, 1 ] ) b.beam( [ s * 0.42, f[ 1 ] + 0.33, zF - 0.14 ], [ s * 0.42, f[ 1 ] + 0.25, zF + 0.05 ], 0.04, 0.04, 0x111111, TAG.trim );
			// A-pillar spotlight
			const [ yb, wb ] = topAt( zA + 0.1 );
			b.cyl( 0.06, 0.05, 0.12, 8, 0x1a1a1a, TAG.chrome, { x: - wb - 0.08, y: yb + 0.12, z: zA + 0.1, axis: 'z' } );
		}
	}
	if ( mil && type === CAR.HUMVEE && lod < 2 ) {
		b.box( D.W * 0.5, 0.06, 0.8, 0x2a2d20, TAG.trim, { y: cab.roof + 0.03, z: 0.2 } ); // hatch ring
		if ( lod === 0 ) {
			b.cyl( 0.3, 0.32, 0.08, 10, 0x2a2d20, TAG.trim, { y: cab.roof + 0.1, z: 0.2 } );
			// brush guard and headlight cages
			for ( const s of [ - 1, 1 ] ) {
				b.beam( [ s * 0.55, f[ 1 ] + 0.05, zF - 0.14 ], [ s * 0.55, f[ 2 ] + 0.12, zF - 0.08 ], 0.05, 0.05, 0x24261b, TAG.trim );
				b.box( 0.03, 0.18, 0.16, 0x24261b, TAG.trim, { x: s * hw * 0.74, y: L.head[ 0 ], z: zF - 0.06 } );
			}
			b.beam( [ - 0.55, f[ 2 ] + 0.12, zF - 0.08 ], [ 0.55, f[ 2 ] + 0.12, zF - 0.08 ], 0.05, 0.05, 0x24261b, TAG.trim );
			// the raised hood centre and the rear rack
			b.box( 0.8, 0.06, 1.0, 0xffffff, TAG.paint, { y: f[ 3 ] + 0.2, z: zF + 0.75, rx: - 0.12 } );
			b.box( 0.3, 0.5, 0.15, 0x2a2d20, TAG.trim, { x: hw - 0.3, y: 1.35, z: zR + 0.05 } ); // jerrycan rack
			b.box( 0.26, 0.42, 0.13, 0x3a4028, TAG.paint, { x: hw - 0.3, y: 1.35, z: zR + 0.12 } );
		}
	}
	if ( type === CAR.BUS && lod < 2 ) b.box( 1.2, 0.3, 1.8, 0xb0b0aa, TAG.paint, { y: cab.roof + 0.15, z: 1.5 } ); // A/C pod
	if ( L.rails && lod < 2 ) {
		for ( const s of [ - 1, 1 ] ) {
			const x = s * roofW * 0.8;
			b.box( 0.035, 0.03, zC - zB - 0.1, BLACK, TAG.trim, { x, y: cab.roof + 0.075, z: ( zB + zC ) / 2 } );
			if ( lod === 0 ) for ( const z of [ zB + 0.1, zC - 0.1 ] ) b.box( 0.05, 0.06, 0.08, BLACK, TAG.trim, { x, y: cab.roof + 0.04, z } );
		}
	}
	// far and low: a dark block filling the cabin (single-sided shells: an open door would show the sky through the car)
	if ( lod > 0 && ! S.bus ) {
		const yb = S.body[ 2 ][ 1 ] + 0.1, yt = S.body[ Math.min( 4, nb - 2 ) ][ 2 ];
		b.box( hw * 1.7, yt - yb, zD - zA - 0.1, DASH, TAG.interior, { y: ( yb + yt ) / 2, z: ( zA + zD ) / 2 } );
	}
	// the dark wheel openings at a distance (the low LOD has no arches)
	if ( lod === 2 ) {
		for ( const za of axles( type ) ) for ( const s of [ - 1, 1 ] ) {
			const tri = [];
			const c = [ s * ( hw + 0.005 ), r * 0.95, za ];
			for ( let k = 0; k < 3; k ++ ) {
				const a0 = Math.PI * k / 3, a1 = Math.PI * ( k + 1 ) / 3;
				tri.push( c, [ c[ 0 ], r + Math.sin( a0 ) * Ra, za + Math.cos( a0 ) * Ra ], [ c[ 0 ], r + Math.sin( a1 ) * Ra, za + Math.cos( a1 ) * Ra ] );
			}
			b.tris( tri, 0x050505, TAG.under, [ 0, c[ 1 ], za ] );
		}
	}
	// ---- interior (seen through broken glass and open doors) ----
	if ( lod === 0 ) {
		const [ yb ] = topAt( zB );
		const yDash = topAt( zA + 0.2 )[ 0 ];
		const iw = ( hw * 0.8 ) * 2;
		b.box( iw, yDash - floorY + 0.06, 0.45, DASH, TAG.interior, { y: ( yDash + floorY ) / 2, z: zA + 0.2 } ); // dash
		b.box( iw * 0.92, 0.07, 0.25, 0x111111, TAG.interior, { y: yDash + 0.06, z: zA + 0.33, rx: 0.25 } ); // dash top
		const big = type === CAR.BUS || type === CAR.MTRUCK;
		const drv = big ? zA + 1.1 : zB + 0.42;
		for ( const s of [ - 1, 1 ] ) seat( b, s * hw * 0.42, floorY, drv, hw * 0.62 );
		if ( ! big ) b.box( 0.18, 0.2, 0.55, 0x161514, TAG.interior, { y: floorY + 0.1, z: drv - 0.1 } ); // console
		if ( S.doors[ 1 ] && ! big ) {
			const z = S.doors[ 1 ][ 0 ] + 0.5;
			b.box( iw * 0.9, 0.13, 0.5, SEAT, TAG.interior, { y: floorY + 0.26, z } );
			b.box( iw * 0.9, 0.55, 0.12, SEAT, TAG.interior, { y: floorY + 0.6, z: z + 0.28, rx: - 0.17 } );
		}
		if ( type === CAR.BUS ) for ( let z = - 3.5; z < 5; z += 1.6 ) for ( const s of [ - 1, 1 ] ) seat( b, s * 0.75, floorY, z, 0.9 );
		// steering wheel on the left (US cars)
		const sx = big ? - hw * 0.45 : - hw * 0.42;
		b.torus( 0.18, 0.02, 4, 10, 0x111111, TAG.trim, { x: sx, y: yb + 0.02, z: zA + 0.5, rx: 1.15 } );
		b.cyl( 0.025, 0.03, 0.3, 5, 0x111111, TAG.trim, { x: sx, y: yb - 0.06, z: zA + 0.38, rx: - 0.42 } );
		// trunk tub (an open lid shows it): a box turned inside out, floor and walls facing in
		if ( S.trunk && S.trunk[ 2 ] === 'lid' ) {
			const y0 = rr[ 1 ] + 0.17, y1 = S.body[ S.body.length - 3 ][ 3 ];
			b.box( iw * 0.98, y1 - y0, S.trunk[ 1 ] - S.trunk[ 0 ] - 0.12, 0x161514, TAG.interior, { y: ( y0 + y1 ) / 2, z: ( S.trunk[ 0 ] + S.trunk[ 1 ] ) / 2 - 0.02, flip: true } );
		}
	}
	// ---- wheels ----
	const parts = wheelParts( r, L.tw, lod, L );
	const ax = axles( type );
	for ( const z of ax ) for ( const s of [ - 1, 1 ] ) {
		// (low: one dark block per axle, showing below the sides)
		if ( lod > 1 ) { if ( s > 0 ) b.box( ( D.tr + L.tw ) * 2, r * 1.7, r * 1.7, 0x141414, TAG.tyre, { y: r * 0.9, z } ); continue; }
		placeWheel( b, parts, s * D.tr, r, z, s );
		if ( DUALS[ type ] && z === D.zr ) placeWheel( b, parts, s * ( D.tr - L.tw * 2 - 0.03 ), r, z, s );
	}
	for ( const p of parts ) p.geo.dispose();
	return b.build( 'cpart', 3 );
}

// a front seat: cushion, back and headrest
function seat( b, x, floorY, z, w ) {
	b.box( w * 0.62, 0.13, 0.5, SEAT, TAG.interior, { x, y: floorY + 0.26, z } );
	b.box( w * 0.6, 0.58, 0.12, SEAT, TAG.interior, { x, y: floorY + 0.62, z: z + 0.27, rx: - 0.16 } );
	b.box( w * 0.3, 0.16, 0.09, SEAT, TAG.interior, { x, y: floorY + 1.0, z: z + 0.33, rx: - 0.1 } );
}

// a wrap-around bumper: a rounded bar following the plan outline of the car's end, curling back along the sides
function bumper( b, zEnd, dir, y0, y1, hwB, depth, wrap, [ hex, tag ], lod ) {
	const sk = new Skin();
	const n = lod ? 4 : 8;
	const path = [];
	for ( let k = 0; k <= n; k ++ ) {
		const u = - 1 + 2 * k / n;
		path.push( [ hwB * Math.sin( u * Math.PI / 2 ), zEnd - dir * 0.02 + dir * - wrap * Math.pow( Math.abs( u ), 4 ) ] );
	}
	const h = y1 - y0;
	const prof = lod ? [ [ 0, y0 ], [ depth, y0 + h * 0.15 ], [ depth, y0 + h * 0.8 ], [ 0, y1 ] ]
		: [ [ 0, y0 ], [ depth * 0.75, y0 + 0.008 ], [ depth, y0 + h * 0.3 ], [ depth * 1.02, y0 + h * 0.62 ], [ depth * 0.85, y1 - 0.01 ], [ 0, y1 ] ];
	const nrm = path.map( ( p, k ) => {
		const a = path[ Math.max( 0, k - 1 ) ], c = path[ Math.min( n, k + 1 ) ];
		const tx = c[ 0 ] - a[ 0 ], tz = c[ 1 ] - a[ 1 ], l = Math.hypot( tx, tz ) || 1;
		// outward: away from the car (the end's direction at the middle, sideways at the corners)
		let nx = tz / l, nz = - tx / l;
		if ( nz * dir < 0 || ( Math.abs( nz ) < 1e-3 && nx * p[ 0 ] < 0 ) ) { nx = - nx; nz = - nz; }
		return [ nx, nz ];
	} );
	for ( let k = 0; k < n; k ++ ) for ( let j = 0; j < prof.length - 1; j ++ ) {
		const pt = ( i, q ) => [ path[ i ][ 0 ] + nrm[ i ][ 0 ] * q[ 0 ], q[ 1 ], path[ i ][ 1 ] + nrm[ i ][ 1 ] * q[ 0 ] ];
		const q0 = prof[ j ], q1 = prof[ j + 1 ];
		const dn = q1[ 0 ] - q0[ 0 ], dy = q1[ 1 ] - q0[ 1 ];
		const mn = [ ( nrm[ k ][ 0 ] + nrm[ k + 1 ][ 0 ] ) / 2, ( nrm[ k ][ 1 ] + nrm[ k + 1 ][ 1 ] ) / 2 ];
		// profile normal ( dy, - dn ) in ( out, up )
		sk.quad( pt( k, q0 ), pt( k, q1 ), pt( k + 1, q1 ), pt( k + 1, q0 ), hex, tag, [ mn[ 0 ] * dy, - dn, mn[ 1 ] * dy ] );
	}
	// close both ends (they tuck into the sides, but an open end shows as a dark slot by the wheel)
	for ( const [ i, j ] of [ [ 0, 1 ], [ n, n - 1 ] ] ) {
		const ring = prof.map( q => [ path[ i ][ 0 ] + nrm[ i ][ 0 ] * q[ 0 ], q[ 1 ], path[ i ][ 1 ] + nrm[ i ][ 1 ] * q[ 0 ] ] );
		const out = [ path[ i ][ 0 ] - path[ j ][ 0 ], 0, path[ i ][ 1 ] - path[ j ][ 1 ] ];
		for ( let k = 1; k < ring.length - 1; k ++ ) sk.tri( ring[ 0 ], ring[ k ], ring[ k + 1 ], hex, tag, out );
	}
	sk.emit( b, 0.7 );
}

// door panel (unit: thickness along x with the outer skin at +x, y 0..1 from the sill to the roof, z 0..1 from the
// hinge rearwards): a curved outer skin, the window frame and glass, the trim card with an armrest inside
function buildDoor() {
	const b = new MB();
	const sk = new Skin();
	const belt = 0.56;
	// the outer skin bulges a little at mid-height
	const prof = [ [ 0.0, 0.0 ], [ 0.016, 0.12 ], [ 0.022, 0.34 ], [ 0.012, belt ] ];
	for ( let k = 0; k < prof.length - 1; k ++ ) {
		const [ x0, y0 ] = prof[ k ], [ x1, y1 ] = prof[ k + 1 ];
		sk.quad( [ x0, y0, 0 ], [ x1, y1, 0 ], [ x1, y1, 1 ], [ x0, y0, 1 ], 0xffffff, TAG.paint, [ 1, - ( x1 - x0 ), 0 ] );
	}
	// edges: front / rear faces of the skin and the sill edge
	for ( const z of [ 0, 1 ] ) sk.quad( [ - 0.04, 0, z ], [ 0.016, 0.12, z ], [ 0.012, belt, z ], [ - 0.04, belt, z ], 0xffffff, TAG.paint, [ 0, 0, z ? 1 : - 1 ] );
	sk.quad( [ - 0.04, 0, 0 ], [ 0, 0, 0 ], [ 0, 0, 1 ], [ - 0.04, 0, 1 ], 0xffffff, TAG.paint, [ 0, - 1, 0 ] );
	sk.quad( [ - 0.04, belt, 0 ], [ 0.012, belt, 0 ], [ 0.012, belt, 1 ], [ - 0.04, belt, 1 ], BLACK, TAG.trim, [ 0, 1, 0 ] ); // belt seal
	sk.emit( b, 0.7 );
	// inner trim card, armrest, pull handle
	b.box( 0.012, belt - 0.04, 0.96, 0x2a2724, TAG.interior, { x: - 0.046, y: belt / 2, z: 0.5 } );
	b.box( 0.05, 0.04, 0.4, 0x222120, TAG.interior, { x: - 0.07, y: belt * 0.62, z: 0.55 } );
	b.box( 0.02, 0.05, 0.08, 0x777777, TAG.chrome, { x: - 0.056, y: belt * 0.82, z: 0.25 } );
	// window frame (thin, painted) and glass
	b.box( 0.03, 0.035, 1, 0xffffff, TAG.paint, { y: 0.98, z: 0.5 } );
	b.box( 0.03, 1 - belt, 0.035, 0xffffff, TAG.paint, { y: ( 1 + belt ) / 2, z: 0.982 } );
	b.box( 0.03, 1 - belt, 0.03, 0xffffff, TAG.paint, { y: ( 1 + belt ) / 2, z: 0.015 } );
	b.box( 0.008, 1 - belt - 0.05, 0.94, GLASS, TAG.glass, { x: - 0.004, y: ( 1 + belt ) / 2, z: 0.5 } );
	return b.build( 'cpart', 3 );
}

// a hood / trunk lid (unit box space: x - 0.5..0.5, y 0..1 thickness, z 0..1): crowned skin, dark underside
function buildLid() {
	const b = new MB();
	const sk = new Skin();
	const n = 6;
	const pt = ( k ) => { const x = - 0.5 + k / n; return [ x, 0.5 + 0.5 * ( 1 - 4 * x * x ), 0 ]; };
	for ( let k = 0; k < n; k ++ ) {
		const a = pt( k ), c = pt( k + 1 );
		sk.quad( [ a[ 0 ], a[ 1 ], 0 ], [ c[ 0 ], c[ 1 ], 0 ], [ c[ 0 ], c[ 1 ], 1 ], [ a[ 0 ], a[ 1 ], 1 ], 0xffffff, TAG.paint, [ 0, 1, 0 ] );
		sk.quad( [ a[ 0 ], 0, 0 ], [ c[ 0 ], 0, 0 ], [ c[ 0 ], 0, 1 ], [ a[ 0 ], 0, 1 ], 0x141414, TAG.under, [ 0, - 1, 0 ] );
	}
	for ( const z of [ 0, 1 ] ) for ( let k = 0; k < n; k ++ ) {
		const a = pt( k ), c = pt( k + 1 );
		sk.quad( [ a[ 0 ], 0, z ], [ c[ 0 ], 0, z ], [ c[ 0 ], c[ 1 ], z ], [ a[ 0 ], a[ 1 ], z ], 0xffffff, TAG.paint, [ 0, 0, z ? 1 : - 1 ] );
	}
	for ( const x of [ - 0.5, 0.5 ] ) sk.quad( [ x, 0, 0 ], [ x, 0.5, 0 ], [ x, 0.5, 1 ], [ x, 0, 1 ], 0xffffff, TAG.paint, [ x, 0, 0 ] );
	sk.emit( b, 0.5 );
	return b.build( 'cpart', 3 );
}

export const CAR_KEYS = [ 'sedan', 'hatch', 'suv', 'pickup', 'van', 'police', 'humvee', 'mtruck', 'bus' ];

let _geo = null;
export function carGeometries() {
	if ( _geo ) return _geo;
	_geo = { near: [], far: [], low: [], door: buildDoor(), lid: buildLid() };
	for ( let t = 0; t < CAR_KEYS.length; t ++ ) { _geo.near.push( buildCar( t, 0 ) ); _geo.far.push( buildCar( t, 1 ) ); _geo.low.push( buildCar( t, 2 ) ); }
	return _geo;
}

export function carSpec( type ) { return SPECS[ type ]; }

// what the car shader paints per body type (car-local metres): head / tail lamps ( y centre, half height, inner x,
// outer x ), grille ( y0, y1, half width, style ), ends ( front z, rear z, front plate y, rear plate y ), wheel
// ( track half, tyre half width, third axle z or 99, rim style ), misc ( plates, military, livery: 1 police 2 TheBus,
// spokes )
export function carLook( type ) {
	const S = SPECS[ type ], D = CAR_DIMS[ type ], L = S.look, hw = D.W / 2;
	const f = S.body[ 0 ], rr = S.body[ S.body.length - 1 ];
	return {
		head: [ L.head[ 0 ], L.head[ 1 ], L.head[ 2 ] * hw, L.head[ 3 ] * hw ],
		tail: [ L.tail[ 0 ], L.tail[ 1 ], L.tail[ 2 ] * hw, L.tail[ 3 ] * hw ],
		grille: [ L.grille[ 0 ], L.grille[ 1 ], L.grille[ 2 ] * hw, L.grille[ 3 ] ],
		ends: [ f[ 0 ], rr[ 0 ], f[ 1 ] + 0.08, rr[ 1 ] + ( S.bus ? 0.38 : 0.28 ) ],
		wheel: [ D.tr, L.tw, AXLE3[ type ] ? D.zr + AXLE3[ type ] : 99, L.black ? 4 : L.rim ],
		misc: [ S.military ? 0 : 1, S.military ? 1 : 0, S.police ? 1 : S.bus ? 2 : 0, L.spokes || 5 ],
	};
}

// door / lid placements for a car's flags: [ { kind: 'door' | 'lid', m: Matrix4 (car local) } ]
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
export function carPanels( type, flags, seed, out ) {
	const S = SPECS[ type ], D = CAR_DIMS[ type ];
	const hw = D.W / 2;
	const doorY0 = S.body[ 2 ][ 1 ] + 0.05, doorY1 = S.cab.roof - 0.03;
	const bits = [ 1, 2, 4, 8 ];
	for ( let i = 0; i < 4; i ++ ) {
		if ( ! ( flags & bits[ i ] ) ) continue;
		const d = S.doors[ i >> 1 ];
		if ( ! d ) continue;
		const side = i & 1 ? 1 : - 1;
		const ang = ( 0.75 + ( ( seed >> ( i * 3 ) ) & 7 ) / 7 * 0.45 ) * side;
		const m = new THREE.Matrix4().makeTranslation( side * ( hw - 0.02 ), doorY0, d[ 0 ] );
		m.multiply( _m1.makeRotationY( ang ) );
		m.multiply( _m2.makeScale( side, doorY1 - doorY0, d[ 1 ] - d[ 0 ] ) );
		out.push( { kind: 'door', m } );
	}
	if ( ( flags & 16 ) && S.trunk ) {
		const [ z0, z1, kind ] = S.trunk;
		if ( kind === 'tailgate' ) {
			// (hung just behind the bed's end so it doesn't fight with it)
			const m = new THREE.Matrix4().makeTranslation( 0, S.body[ S.body.length - 1 ][ 1 ] + 0.05, z1 + 0.035 );
			m.multiply( _m1.makeRotationX( Math.PI / 2 ) );
			m.multiply( _m2.makeScale( D.W * 0.94, 0.05, S.bed ? S.bed[ 3 ] - S.bed[ 2 ] + 0.3 : 0.5 ) );
			out.push( { kind: 'lid', m } );
		} else {
			// lid / hatch hinged at its front edge, swung up
			const yH = kind === 'hatch' ? S.cab.roof - 0.05 : S.body[ S.body.length - 3 ][ 3 ] + 0.02;
			const m = new THREE.Matrix4().makeTranslation( 0, yH, z0 );
			m.multiply( _m1.makeRotationX( kind === 'hatch' ? - 0.25 : - 1.15 ) );
			m.multiply( _m2.makeScale( D.W * 0.86, 0.05, ( kind === 'hatch' ? 1.0 : z1 - z0 ) ) );
			out.push( { kind: 'lid', m } );
		}
	}
	if ( ( flags & 32 ) && S.hood ) {
		const [ z0, z1 ] = S.hood;
		const m = new THREE.Matrix4().makeTranslation( 0, S.body[ 3 ][ 3 ] + 0.02, z1 );
		m.multiply( _m1.makeRotationY( Math.PI ) );
		m.multiply( _m2.makeRotationX( - 1.0 ) );
		m.multiply( _m1.makeScale( D.W * 0.88, 0.05, z1 - z0 ) );
		out.push( { kind: 'lid', m } );
	}
	return out;
}
