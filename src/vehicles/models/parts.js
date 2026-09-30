// Reusable vehicle parts: wheels (near and far), steering wheels, seats and benches.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, MAT, mat } from '../kit.js';
import { ATLAS } from '../materials.js';

// a wheel centred at the origin, axle along x, the outer face towards +x
// opts: { rimR, spokes, split, style: 'alloy'|'steel'|'chrome'|'black'|'offroad', tread, paintRim, caliper, brakes, dually }
export function wheelKit( R, W, style = 'alloy', opts = {} ) {
	const k = new Kit();
	const rimR = opts.rimR ?? R * 0.64;
	const hw = W / 2;
	// tyre: lathe around the axle (lathe axis = y, rotated to x); a chunkier shoulder for off-road tyres
	const sh = Math.min( style === 'offroad' ? 0.06 : 0.035, W * 0.2 );
	const prof = [
		[ rimR * 0.98, - hw * 0.86 ], [ rimR + 0.02, - hw * 0.98 ], [ ( rimR + R ) / 2, - hw * 1.03 ], [ R - sh, - hw * 0.99 ], [ R - sh * 0.3, - hw + sh * 0.6 ],
		[ R, - hw + sh ], [ R, hw - sh ], [ R - sh * 0.3, hw - sh * 0.6 ], [ R - sh, hw * 0.99 ], [ ( rimR + R ) / 2, hw * 1.03 ], [ rimR + 0.02, hw * 0.98 ], [ rimR * 0.98, hw * 0.86 ],
	];
	const lg = new THREE.LatheGeometry( prof.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ), 32 );
	k.add( toCreasedNormals( lg, 0.9 ), opts.tread || style === 'offroad' ? mat( 'tread', { uv: ATLAS.tread } ) : MAT.rubber, { r: [ 0, 0, - Math.PI / 2 ] } );
	// off-road lugs across the tread
	if ( style === 'offroad' ) {
		for ( let i = 0; i < 24; i ++ ) {
			const a = i / 24 * Math.PI * 2;
			for ( const s of [ - 1, 1 ] ) k.box( W * 0.36, 0.022, 0.07, MAT.rubber, { p: [ s * W * 0.22, Math.cos( a ) * ( R - 0.004 ), Math.sin( a ) * ( R - 0.004 ) ], r: [ a + ( s > 0 ? 0.13 : 0 ), 0, 0 ] } );
		}
	}
	// rim barrel (seen through the spokes)
	const steel = style === 'steel' || style === 'offroad';
	k.cyl( rimR * 0.97, rimR * 0.97, W * 0.82, steel ? ( opts.paintRim ? MAT.paint : mat( 'steel', { c: 0x8e9194 } ) ) : MAT.darksteel, { r: [ 0, 0, Math.PI / 2 ] }, 24, true );
	const face = hw * 0.62;
	const rm = style === 'chrome' ? MAT.chrome : style === 'black' ? mat( 'darksteel', { c: 0x1a1a1a, r: 0.35 } ) : steel ? ( opts.paintRim ? MAT.paint : mat( 'steel', { c: opts.rimColor ?? 0x9a9da0 } ) ) : MAT.alu;
	// lip
	k.torus( rimR * 0.98, 0.012, rm, { p: [ face + 0.01, 0, 0 ], r: [ 0, Math.PI / 2, 0 ] }, 6, 32 );
	if ( steel ) {
		// dished steel disc with round cut-outs and lug nuts
		k.lathe( [ [ 0.01, face - 0.06 ], [ rimR * 0.35, face - 0.035 ], [ rimR * 0.55, face - 0.012 ], [ rimR * 0.97, face ] ], rm, { r: [ 0, 0, - Math.PI / 2 ] }, 24 );
		const holes = opts.holes ?? 6;
		for ( let i = 0; i < holes; i ++ ) {
			const a = ( i + 0.5 ) / holes * Math.PI * 2;
			k.cyl( rimR * 0.12, rimR * 0.12, 0.01, MAT.gloss, { p: [ face - 0.012, Math.cos( a ) * rimR * 0.66, Math.sin( a ) * rimR * 0.66 ], r: [ 0, 0, Math.PI / 2 ] }, 10 );
		}
		for ( let i = 0; i < 6; i ++ ) {
			const a = i / 6 * Math.PI * 2;
			k.cyl( 0.012, 0.012, 0.03, MAT.chrome, { p: [ face - 0.03, Math.cos( a ) * rimR * 0.36, Math.sin( a ) * rimR * 0.36 ], r: [ 0, 0, Math.PI / 2 ] }, 6 );
		}
		k.cyl( rimR * 0.2, rimR * 0.24, 0.07, MAT.darksteel, { p: [ face - 0.03, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 14 );
	} else {
		const n = opts.spokes ?? 5;
		for ( let i = 0; i < n; i ++ ) {
			const a = i / n * Math.PI * 2;
			for ( const off of opts.split ? [ - 0.1, 0.1 ] : [ 0 ] ) {
				const aa = a + off;
				k.beam( [ face - 0.01, Math.cos( aa ) * rimR * 0.2, Math.sin( aa ) * rimR * 0.2 ], [ face - 0.035, Math.cos( aa ) * rimR * 0.95, Math.sin( aa ) * rimR * 0.95 ], 0.03, opts.split ? 0.03 : 0.055, rm, [ 1, 0, 0 ], 0.01 );
			}
		}
		k.cyl( rimR * 0.24, rimR * 0.26, 0.05, rm, { p: [ face - 0.005, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 16 );
		k.cyl( rimR * 0.09, rimR * 0.09, 0.02, MAT.gloss, { p: [ face + 0.02, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 12 );
		for ( let i = 0; i < 5; i ++ ) {
			const a = ( i + 0.5 ) / 5 * Math.PI * 2;
			k.cyl( 0.01, 0.01, 0.02, MAT.chrome, { p: [ face + 0.005, Math.cos( a ) * rimR * 0.16, Math.sin( a ) * rimR * 0.16 ], r: [ 0, 0, Math.PI / 2 ] }, 6 );
		}
	}
	// brake disc and caliper
	if ( opts.brakes !== false ) {
		k.cyl( rimR * 0.78, rimR * 0.78, 0.025, mat( 'steel', { c: 0x6c6c6c, r: 0.4 } ), { p: [ face - 0.09, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 24 );
		k.box( 0.05, rimR * 0.5, 0.1, opts.caliper ? mat( 'gloss', { c: opts.caliper } ) : MAT.darksteel, { p: [ face - 0.07, rimR * 0.55, - rimR * 0.3 ], r: [ 0.5, 0, 0 ] }, 0.015 );
	}
	// inner face of the tyre is closed so the wheel never looks hollow from the inside
	k.cyl( rimR * 0.97, rimR * 0.97, 0.01, MAT.under, { p: [ - hw * 0.8, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 16 );
	return k;
}

// a light wheel for distant vehicles: tyre cylinder with a rounded tread, flat rim face
export function farWheelKit( R, W, style = 'alloy' ) {
	const k = new Kit();
	const rimR = R * 0.64;
	k.cyl( R, R, W, MAT.rubber, { r: [ 0, 0, Math.PI / 2 ] }, 14 );
	const rm = style === 'steel' || style === 'offroad' ? mat( 'steel', { c: 0x8e9194 } ) : style === 'black' ? MAT.darksteel : MAT.alu;
	k.cyl( rimR, rimR, 0.012, rm, { p: [ W / 2 + 0.003, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 12 );
	return k;
}

// the steering wheel, centred at the origin in its own plane (x right, y up, facing the driver along +z)
export function steeringKit( r = 0.19, style = 'car' ) {
	const k = new Kit();
	const m = style === 'wood' ? MAT.wood : mat( 'gloss', { c: 0x1c1d20, r: 0.55 } );
	k.torus( r, style === 'bus' ? 0.02 : 0.017, m, null, 8, 36 );
	const spokes = style === 'bus' ? [ 0, Math.PI ] : style === 'sport' ? [ 0, Math.PI, - Math.PI / 2 ] : [ - Math.PI / 2, 0.12, Math.PI - 0.12 ];
	for ( const a of spokes ) k.beam( [ Math.cos( a ) * 0.05, Math.sin( a ) * 0.05, 0.01 ], [ Math.cos( a ) * r, Math.sin( a ) * r, 0 ], 0.04, 0.014, m );
	// hub / airbag cover facing the driver
	k.cyl( style === 'bus' ? 0.06 : 0.075, 0.08, 0.06, mat( 'trim', { c: 0x18181a } ), { p: [ 0, 0, 0.015 ], r: [ Math.PI / 2, 0, 0 ] }, 18 );
	k.cyl( 0.028, 0.028, 0.002, mat( 'alu', { c: 0x8c8f94, r: 0.4 } ), { p: [ 0, 0, 0.047 ], r: [ Math.PI / 2, 0, 0 ] }, 12 );
	return k;
}

// bucket seat (hip point at x, hipY, f; facing forward)
export function seat( k, x, hipY, f, m, width = 0.5, opts = {} ) {
	const recline = opts.recline ?? 0.3;
	// cushion with raised bolsters
	k.box( width, 0.12, 0.5, m, { p: [ x, hipY - 0.05, - ( f + 0.1 ) ], r: [ 0.08, 0, 0 ] }, 0.05 );
	for ( const s of [ - 1, 1 ] ) k.box( 0.08, 0.1, 0.46, m, { p: [ x + s * width * 0.44, hipY - 0.0, - ( f + 0.1 ) ], r: [ 0.08, 0, 0 ] }, 0.035 );
	// backrest leaning back, bolsters
	const bz = - ( f - 0.2 );
	k.box( width * 0.92, 0.66, 0.12, m, { p: [ x, hipY + 0.3, bz ], r: [ - recline, 0, 0 ] }, 0.055 );
	for ( const s of [ - 1, 1 ] ) k.box( 0.07, 0.5, 0.16, m, { p: [ x + s * width * 0.45, hipY + 0.22, bz - 0.01 ], r: [ - recline, 0, 0 ] }, 0.03 );
	if ( ! opts.noHead ) {
		const hy = hipY + 0.72, hz = bz + Math.sin( recline ) * 0.45 + 0.02;
		k.box( 0.26, 0.19, 0.1, m, { p: [ x, hy, hz ], r: [ - 0.18, 0, 0 ] }, 0.045 );
		for ( const s of [ - 0.07, 0.07 ] ) k.rod( [ x + s, hy - 0.16, hz - 0.03 ], [ x + s, hy - 0.08, hz - 0.01 ], 0.006, MAT.chrome, 4 );
	}
	// runners
	k.box( width * 0.8, 0.08, 0.42, MAT.darksteel, { p: [ x, hipY - 0.15, - ( f + 0.08 ) ] } );
}

export function bench( k, w, hipY, f, m, x = 0, opts = {} ) {
	k.box( w, 0.14, 0.5, m, { p: [ x, hipY - 0.04, - ( f + 0.1 ) ], r: [ 0.08, 0, 0 ] }, 0.06 );
	k.box( w, opts.back ?? 0.62, 0.14, m, { p: [ x, hipY + 0.28, - ( f - 0.2 ) ], r: [ - 0.25, 0, 0 ] }, 0.06 );
	if ( opts.heads ) for ( const hx of opts.heads ) k.box( 0.25, 0.16, 0.1, m, { p: [ x + hx, hipY + 0.68, - ( f - 0.33 ) ], r: [ - 0.2, 0, 0 ] }, 0.045 );
}

// ---- the rider -------------------------------------------------------------------------------------------------------

const RIDER = {
	skin: mat( 'skin', { c: 0xc99a7c } ), hair: MAT.hair,
	shirt: { c: 0x2f5d6b, r: 0.85, m: 0 }, jeans: { c: 0x2b3a55, r: 0.9, m: 0 }, shoes: { c: 0x1d1d1f, r: 0.7, m: 0 },
};

// the middle joint of a two-bone limb (shoulder -> elbow -> hand, hip -> knee -> foot) bent towards `bend`
export function joint( a, b, len, bend ) {
	const A = new THREE.Vector3( ...a ), B = new THREE.Vector3( ...b );
	const d = A.distanceTo( B );
	const mid = A.clone().add( B ).multiplyScalar( 0.5 );
	const half = Math.min( len, d / 2 + 1e-3 );
	const off = Math.sqrt( Math.max( 0, len * len - half * half ) );
	const dir = B.clone().sub( A ).normalize();
	const n = new THREE.Vector3( ...bend );
	n.addScaledVector( dir, - n.dot( dir ) ).normalize();
	return mid.addScaledVector( n, off ).toArray();
}

// a seated figure for the third-person view: hips at the seat, hands on the wheel / bars / yoke, feet down.
// pose: { hip, eye, hands: [ L, R ] | null, feet: [ L, R ] | null, lean } in the model frame
export function riderKit( pose, head = true, arms = true ) {
	const k = new Kit();
	const [ hx, hy, hz ] = pose.hip;
	const eye = pose.eye;
	const headC = [ eye[ 0 ], eye[ 1 ] + 0.03, eye[ 2 ] + 0.07 ];
	const neck = [ headC[ 0 ], headC[ 1 ] - 0.16, headC[ 2 ] + 0.02 ];
	const pelvis = [ hx, hy + 0.06, hz + 0.02 ];
	// torso, pelvis, neck, head (seen from inside the head only the arms and legs are drawn: the chest would sit
	// right under the camera)
	if ( head ) {
		k.beam( pelvis, [ neck[ 0 ], neck[ 1 ] - 0.03, neck[ 2 ] ], 0.36, 0.21, RIDER.shirt, [ 0, 0, 1 ], 0.07 );
		k.box( 0.34, 0.16, 0.24, RIDER.jeans, { p: [ hx, hy, hz + 0.02 ] }, 0.06 );
		k.rod( [ neck[ 0 ], neck[ 1 ] - 0.04, neck[ 2 ] ], [ headC[ 0 ], headC[ 1 ] - 0.06, headC[ 2 ] ], 0.048, RIDER.skin, 8 );
		k.sphere( 0.1, RIDER.skin, { p: headC, s: [ 0.92, 1.08, 1 ] }, 14, 10 );
		k.sphere( 0.104, RIDER.hair, { p: [ headC[ 0 ], headC[ 1 ] + 0.025, headC[ 2 ] + 0.02 ], s: [ 0.95, 0.9, 1 ] }, 14, 8 );
	}
	// arms
	const sh = [ - 1, 1 ].map( s => [ neck[ 0 ] + s * 0.19, neck[ 1 ] - 0.05, neck[ 2 ] ] );
	for ( let i = 0; i < ( arms ? 2 : 0 ); i ++ ) {
		const s = i ? 1 : - 1;
		const hand = pose.hands ? pose.hands[ i ] : [ hx + s * 0.16, hy + 0.1, hz - 0.3 ];
		const el = joint( sh[ i ], hand, 0.29, [ s * 0.5, - 0.8, 0.2 ] );
		// a long-sleeved shirt: from inside the car you see sleeves and hands on the wheel
		k.rod( sh[ i ], el, 0.05, RIDER.shirt, 8, 0.046 );
		k.rod( el, hand, 0.042, RIDER.shirt, 8, 0.034 );
		k.cyl( 0.03, 0.034, 0.05, RIDER.skin, { q: new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( ...hand ).sub( new THREE.Vector3( ...el ) ).normalize() ), p: new THREE.Vector3( ...hand ).lerp( new THREE.Vector3( ...el ), 0.08 ).toArray() }, 8 );
		k.sphere( 0.042, RIDER.skin, { p: hand, s: [ 1, 0.8, 1.2 ] }, 8, 6 );
	}
	// legs
	for ( let i = 0; i < 2; i ++ ) {
		const s = i ? 1 : - 1;
		const hip = [ hx + s * 0.1, hy, hz ];
		const foot = pose.feet ? pose.feet[ i ] : [ hx + s * 0.13, hy - 0.42, hz - 0.5 ];
		const kn = joint( hip, foot, 0.44, [ s * 0.15, 0.8, - 0.6 ] );
		k.rod( hip, kn, 0.075, RIDER.jeans, 8, 0.062 );
		k.rod( kn, foot, 0.058, RIDER.jeans, 8, 0.046 );
		k.box( 0.1, 0.08, 0.26, RIDER.shoes, { p: [ foot[ 0 ], foot[ 1 ] - 0.02, foot[ 2 ] - 0.08 ] }, 0.03 );
	}
	return k.build();
}
