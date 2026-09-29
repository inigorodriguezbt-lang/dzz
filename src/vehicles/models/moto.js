// Motorcycles: a 650 cc naked street bike (CB650 / MT-07 class, 2.1 x 0.8 x 1.1 m, wheelbase 1.42 m).
// Built from tubes, lofted panels and lathed parts in the vehicle kit; the fork, bars, headlight and front
// fender are the steering part (they turn about the raked steering axis), the wheels spin on their own.
import * as THREE from 'three';
import { Kit, MAT, mat, lerp } from '../kit.js';
import { ATLAS } from '../materials.js';
import { wheelKit, farWheelKit } from './parts.js';
import { pchip } from './shell.js';

export const MOTO = {};

const RAKE = 0.436; // 25 degrees
const smooth01 = ( x ) => { const t = Math.min( 1, Math.max( 0, x ) ); return t * t * ( 3 - 2 * t ); };
const D2R = Math.PI / 180;

MOTO.motorbike = () => ( {
	kind: 'bike', L: 2.1, W: 0.8, H: 1.12,
	wheelR: 0.3, wheelW: 0.15, track: 0, axleF: 0.71, axleR: - 0.71,
	head: [ 0.93, 0.44 ], // steering head [ y, f ]
	driver: { x: 0, hipY: 0.84, f: - 0.08 },
	build: buildBike,
} );

// a closed ring of a rounded section (superellipse) at f, for the lofted panels
function ring( f, w, h, cy, n = 2.6, N = 20, cx = 0 ) {
	const out = [];
	for ( let i = 0; i < N; i ++ ) {
		const t = - Math.PI / 2 + i / N * Math.PI * 2;
		const c = Math.cos( t ), s = Math.sin( t );
		out.push( [ cx + w * Math.sign( c ) * Math.pow( Math.abs( c ), 2 / n ), cy + h * Math.sign( s ) * Math.pow( Math.abs( s ), 2 / n ), - f ] );
	}
	return out;
}

function buildBike( P ) {
	const k = new Kit(), fk = new Kit(), glass = new Kit();
	const R = P.wheelR, aF = P.axleF, aR = P.axleR;
	const [ hy, hf ] = P.head;
	const frameM = mat( 'darksteel', { c: 0x1a1b1d, r: 0.4, m: 0.8 } );
	const alu = mat( 'alu', { c: 0xb8bcc2, r: 0.3 } );
	const engM = mat( 'darksteel', { c: 0x2a2b2e, r: 0.45, m: 0.7 } );
	const vinyl = mat( 'seat', { c: 0x141416, r: 0.6 } );
	// the main shapes go into the far model too; `near` marks the small details that are left out of it
	let nearOnly = false;
	const near = ( fn ) => { nearOnly = true; fn(); nearOnly = false; };
	const add = ( fn ) => { const n = k.parts.length; fn(); for ( let i = n; i < k.parts.length; i ++ ) if ( ! k.parts[ i ].nearOnly ) fk.parts.push( k.parts[ i ] ); };
	const kAdd = k.add.bind( k );
	k.add = ( ...a ) => { const p = kAdd( ...a ); if ( nearOnly ) p.nearOnly = true; return p; };
	const pivot = [ 0, 0.47, 0.2 ]; // swingarm pivot (model frame: z = -f)

	add( () => {
		// fuel tank: a teardrop lofted from the steering head back to the seat, narrow in front, full at the knees
		const tw = pchip( [ [ 0, 0.075 ], [ 0.25, 0.165 ], [ 0.45, 0.19 ], [ 0.75, 0.165 ], [ 0.92, 0.12 ], [ 1, 0.07 ] ] );
		const tt = pchip( [ [ 0, hy + 0.02 ], [ 0.3, hy + 0.11 ], [ 0.55, hy + 0.1 ], [ 0.85, 0.94 ], [ 1, 0.87 ] ] );
		const tb = pchip( [ [ 0, hy - 0.1 ], [ 0.4, 0.82 ], [ 1, 0.8 ] ] );
		const tank = [];
		for ( let i = 0; i <= 16; i ++ ) {
			const t = i / 16, f = lerp( hf + 0.04, - 0.06, t );
			tank.push( ring( f, tw( t ), ( tt( t ) - tb( t ) ) / 2, ( tt( t ) + tb( t ) ) / 2, 2.6, 24 ) );
		}
		k.loft( tank, MAT.paint, { closed: true, capStart: true, capEnd: true, crease: 1.2 } );
		near( () => { k.cyl( 0.035, 0.035, 0.012, MAT.chrome, { p: [ 0, hy + 0.115, - ( hf - 0.16 ) ] }, 14 ); } ); // filler cap
		// the seat: flat topped, the pillion part a step higher
		const sw = pchip( [ [ 0, 0.11 ], [ 0.3, 0.15 ], [ 1, 0.1 ] ] );
		const seatR = [];
		for ( let i = 0; i <= 10; i ++ ) {
			const t = i / 10, f = lerp( - 0.04, - 0.64, t );
			seatR.push( ring( f, sw( t ), 0.05, 0.83 + smooth01( ( t - 0.55 ) / 0.15 ) * 0.035, 4, 20 ) );
		}
		k.loft( seatR, vinyl, { closed: true, capStart: true, capEnd: true, crease: 1.2 } );
		// the tail unit tapering up to the tail light
		const lw = pchip( [ [ 0, 0.12 ], [ 1, 0.035 ] ] ), lh = pchip( [ [ 0, 0.07 ], [ 1, 0.028 ] ] ), ly = pchip( [ [ 0, 0.79 ], [ 1, 0.875 ] ] );
		const tail = [];
		for ( let i = 0; i <= 8; i ++ ) {
			const t = i / 8, f = lerp( - 0.45, - 0.95, t );
			tail.push( ring( f, lw( t ), lh( t ), ly( t ), 2.4, 18 ) );
		}
		k.loft( tail, MAT.paint2, { closed: true, capStart: true, capEnd: true, crease: 1 } );
		k.box( 0.07, 0.03, 0.02, MAT.tail, { p: [ 0, 0.875, 0.958 ] }, 0.008 );
		for ( const s of [ - 1, 1 ] ) {
			near( () => { k.rod( [ s * 0.05, 0.8, 0.88 ], [ s * 0.14, 0.79, 0.92 ], 0.006, MAT.trim, 6 ); } );
			near( () => { k.box( 0.04, 0.025, 0.03, s < 0 ? MAT.indL : MAT.indR, { p: [ s * 0.15, 0.79, 0.93 ] }, 0.008 ); } );
		}
		// plate on a hugger under the tail
		near( () => { k.rod( [ 0, 0.78, 0.9 ], [ 0, 0.62, 1.0 ], 0.012, frameM, 6 ); } );
		near( () => { k.box( 0.18, 0.13, 0.008, MAT.trim, { p: [ 0, 0.6, 1.005 ], r: [ 0.3, 0, 0 ] }, 0.008 ); } );
		near( () => { k.quad( [ 0.085, 0.545, 1.012 ], [ - 0.085, 0.545, 1.012 ], [ - 0.085, 0.655, 0.978 ], [ 0.085, 0.655, 0.978 ], mat( 'white', { uv: ATLAS.plate, r: 0.35, m: 0.2 } ) ); } );
		// trellis frame: head to the swingarm pivot, rails under the seat
		for ( const s of [ - 1, 1 ] ) {
			k.tube( [ [ s * 0.04, hy - 0.02, - hf ], [ s * 0.14, hy - 0.08, - ( hf - 0.25 ) ], [ s * 0.15, 0.72, - 0.05 ], [ s * 0.13, pivot[ 1 ] + 0.06, pivot[ 2 ] ] ], 0.018, frameM, 18, 6 );
			k.tube( [ [ s * 0.04, hy - 0.08, - hf + 0.02 ], [ s * 0.12, 0.62, - ( hf - 0.18 ) ], [ s * 0.13, 0.42, - 0.12 ] ], 0.016, frameM, 12, 6 );
			near( () => { k.rod( [ s * 0.14, 0.72, - 0.05 ], [ s * 0.1, 0.8, 0.7 ], 0.013, frameM, 6 ); } );
			near( () => { k.rod( [ s * 0.13, pivot[ 1 ] + 0.08, pivot[ 2 ] ], [ s * 0.1, 0.78, 0.55 ], 0.012, frameM, 6 ); } );
			// footpegs and heel guards
			near( () => { k.rod( [ s * 0.12, 0.36, 0.12 ], [ s * 0.24, 0.36, 0.12 ], 0.012, alu, 6 ); } );
			near( () => { k.rod( [ s * 0.11, 0.42, 0.55 ], [ s * 0.2, 0.42, 0.55 ], 0.01, alu, 6 ); } );
			near( () => { k.box( 0.01, 0.1, 0.12, alu, { p: [ s * 0.13, 0.41, 0.2 ] }, 0.01 ); } );
		}
		// engine: parallel twin, crankcase with alloy covers, finned cylinders leaning forward, the head
		k.box( 0.3, 0.2, 0.42, engM, { p: [ 0, 0.36, - 0.12 ] }, 0.05 );
		near( () => { for ( const s of [ - 1, 1 ] ) k.cyl( 0.1, 0.1, 0.03, alu, { p: [ s * 0.16, 0.37, - 0.08 ], r: [ 0, 0, Math.PI / 2 ] }, 18 ); } );
		k.box( 0.26, 0.18, 0.2, engM, { p: [ 0, 0.54, - 0.28 ], r: [ - 0.35, 0, 0 ] }, 0.03 );
		near( () => { for ( let i = 0; i < 5; i ++ ) k.box( 0.28, 0.008, 0.22, engM, { p: [ 0, 0.49 + i * 0.03, - 0.3 + i * 0.012 ], r: [ - 0.35, 0, 0 ] } ); } );
		near( () => { k.box( 0.27, 0.07, 0.2, alu, { p: [ 0, 0.66, - 0.34 ], r: [ - 0.35, 0, 0 ] }, 0.025 ); } );
		// radiator in front of the engine
		k.box( 0.3, 0.26, 0.04, mat( 'trim', { uv: ATLAS.grille } ), { p: [ 0, 0.62, - 0.44 ], r: [ - 0.3, 0, 0 ] }, 0.01 );
		// exhaust: headers under the engine to a muffler on the right
		for ( const s of [ - 1, 1 ] ) k.tube( [ [ s * 0.06, 0.52, - 0.42 ], [ s * 0.07, 0.36, - 0.46 ], [ s * 0.04, 0.2, - 0.3 ], [ 0.03, 0.17, 0.02 ], [ 0.14, 0.24, 0.3 ] ], 0.022, MAT.chrome, 20, 8 );
		k.cyl( 0.055, 0.06, 0.4, mat( 'darksteel', { c: 0x2c2d30, r: 0.3, m: 0.9 } ), { p: [ 0.17, 0.32, 0.46 ], r: [ Math.PI / 2 - 0.35, 0, 0 ] }, 16 );
		near( () => { k.cyl( 0.03, 0.03, 0.03, MAT.gloss, { p: [ 0.17, 0.39, 0.66 ], r: [ Math.PI / 2 - 0.35, 0, 0 ] }, 12 ); } );
		// swingarm to the rear axle, the shock, chain run, rear fender
		for ( const s of [ - 1, 1 ] ) k.beam( [ s * 0.12, pivot[ 1 ], pivot[ 2 ] ], [ s * 0.11, R, - aR ], 0.035, 0.07, alu, [ 0, 1, 0 ], 0.012 );
		k.rod( [ 0, pivot[ 1 ] + 0.02, pivot[ 2 ] + 0.2 ], [ 0, 0.74, 0.28 ], 0.025, mat( 'gloss', { c: 0xc8a020 } ), 10 );
		near( () => { k.torus( 0.045, 0.006, MAT.steel, { p: [ 0, 0.6, 0.26 ], r: [ Math.PI / 2 + 0.6, 0, 0 ] }, 4, 12 ); } );
		near( () => { k.beam( [ - 0.085, 0.47, 0.2 ], [ - 0.085, R + 0.08, - aR ], 0.012, 0.02, MAT.darksteel ); } );
		near( () => { k.beam( [ - 0.085, 0.4, 0.2 ], [ - 0.085, R - 0.08, - aR ], 0.012, 0.02, MAT.darksteel ); } );
		near( () => { k.cyl( 0.09, 0.09, 0.012, MAT.darksteel, { p: [ - 0.09, R, - aR ], r: [ 0, 0, Math.PI / 2 ] }, 18 ); } );
		k.torus( R + 0.03, 0.02, MAT.trim, { p: [ 0, R, - aR ], r: [ 0, Math.PI / 2, 0 ] }, 5, 16, 1.2 );
		// kickstand
		near( () => { k.rod( [ - 0.13, 0.36, 0.05 ], [ - 0.27, 0.05, 0.2 ], 0.012, frameM, 6 ); } );
		// passenger grab rail
		near( () => { k.tube( [ [ - 0.12, 0.86, 0.5 ], [ - 0.1, 0.9, 0.72 ], [ 0, 0.9, 0.78 ], [ 0.1, 0.9, 0.72 ], [ 0.12, 0.86, 0.5 ] ], 0.01, alu, 16, 6 ); } );
	} );

	// the steering part, in the steering column's frame (origin at the head, y up the raked axis, -z forward)
	const st = new Kit();
	const L = Math.hypot( hy - R, aF - hf ); // head to axle along the axis
	const fork = mat( 'gloss', { c: 0xb88a28, r: 0.25, m: 0.9 } );
	for ( const s of [ - 1, 1 ] ) {
		st.cyl( 0.024, 0.024, 0.42, MAT.chrome, { p: [ s * 0.1, - 0.18, 0 ] }, 12 );
		st.cyl( 0.034, 0.03, 0.4, fork, { p: [ s * 0.1, - L + 0.2, 0 ] }, 12 );
	}
	st.box( 0.26, 0.04, 0.08, alu, { p: [ 0, 0.02, 0 ] }, 0.01 );
	st.box( 0.24, 0.035, 0.07, alu, { p: [ 0, - 0.14, 0 ] }, 0.01 );
	// handlebar with grips, levers and mirrors; the clocks in the middle
	st.tube( [ [ - 0.36, 0.14, 0.08 ], [ - 0.2, 0.12, 0.03 ], [ 0, 0.1, 0.02 ], [ 0.2, 0.12, 0.03 ], [ 0.36, 0.14, 0.08 ] ], 0.011, MAT.darksteel, 16, 6 );
	for ( const s of [ - 1, 1 ] ) {
		st.cyl( 0.017, 0.017, 0.12, MAT.rubber, { p: [ s * 0.33, 0.135, 0.07 ], r: [ 0, - s * 0.25, Math.PI / 2 ] }, 10 );
		st.rod( [ s * 0.24, 0.13, 0.02 ], [ s * 0.34, 0.12, 0.0 ], 0.006, alu, 5 );
		st.rod( [ s * 0.23, 0.13, 0.04 ], [ s * 0.3, 0.24, 0.07 ], 0.006, MAT.trim, 5 );
		st.box( 0.1, 0.06, 0.02, MAT.trim, { p: [ s * 0.31, 0.26, 0.075 ], r: [ 0, - s * 0.2, 0 ] }, 0.012 );
		st.box( 0.085, 0.048, 0.004, MAT.chrome, { p: [ s * 0.31, 0.26, 0.086 ], r: [ 0, - s * 0.2, 0 ] } );
	}
	st.box( 0.14, 0.08, 0.05, MAT.trim, { p: [ 0, 0.14, - 0.05 ], r: [ - 0.5, 0, 0 ] }, 0.015 );
	st.quad( [ 0.055, 0.12, - 0.012 ], [ - 0.055, 0.12, - 0.012 ], [ - 0.055, 0.17, - 0.04 ], [ 0.055, 0.17, - 0.04 ], mat( 'gauge', { uv: ATLAS.gauges } ) );
	// headlight: a round lamp in a black shell, indicators on stalks
	// (the column leans back by the rake, so the lamp is turned forward again: its local +y is world forward)
	const lampR = [ - Math.PI / 2 - RAKE, 0, 0 ];
	const along = ( d ) => [ 0, - 0.08 - d * Math.sin( RAKE ), - 0.14 - d * Math.cos( RAKE ) ];
	st.lathe( [ [ 0.092, 0.0 ], [ 0.097, - 0.05 ], [ 0.072, - 0.1 ], [ 0.001, - 0.12 ] ], MAT.gloss, { p: along( 0 ), r: lampR }, 20 );
	st.torus( 0.088, 0.007, MAT.chrome, { p: along( 0.002 ), r: [ - RAKE, 0, 0 ] }, 5, 24 );
	st.cyl( 0.084, 0.084, 0.008, MAT.head, { p: along( 0.002 ), r: lampR }, 20 );
	for ( const s of [ - 1, 1 ] ) {
		st.rod( [ s * 0.08, - 0.1, - 0.1 ], [ s * 0.17, - 0.1, - 0.12 ], 0.006, MAT.trim, 5 );
		st.box( 0.045, 0.028, 0.03, s < 0 ? MAT.indL : MAT.indR, { p: [ s * 0.18, - 0.1, - 0.12 ] }, 0.008 );
	}
	// front fender hugging the tyre, the brake calipers
	st.torus( R + 0.035, 0.05, MAT.paint, { p: [ 0, - L, 0 ], r: [ 0, Math.PI / 2, - 0.1 ], s: [ 1, 1, 0.6 ] }, 6, 16, 1.5 );
	for ( const s of [ - 1, 1 ] ) st.box( 0.04, 0.1, 0.07, mat( 'gloss', { c: 0xc8141e } ), { p: [ s * 0.1, - L + 0.1, 0.07 ] }, 0.012 );
	const steering = st.build();
	P.steer = { x: 0, y: hy, f: hf, tilt: - RAKE, r: 0.3, axis: 'y' };

	// the steering part at rest, for the far model (its big pieces only)
	const col = new THREE.Matrix4().makeRotationX( RAKE ).setPosition( 0, hy, - hf );
	const sf = new Kit();
	for ( const s of [ - 1, 1 ] ) sf.cyl( 0.03, 0.03, L, fork, { p: [ s * 0.1, - L / 2, 0 ] }, 6 );
	sf.box( 0.72, 0.03, 0.03, MAT.darksteel, { p: [ 0, 0.12, 0.04 ] } );
	sf.cyl( 0.095, 0.095, 0.12, MAT.gloss, { p: along( - 0.06 ), r: lampR }, 10 );
	sf.torus( R + 0.035, 0.05, MAT.paint, { p: [ 0, - L, 0 ], r: [ 0, Math.PI / 2, - 0.1 ], s: [ 1, 1, 0.6 ] }, 4, 8, 1.5 );
	fk.addBuilt( sf.build(), col );

	const W = P.wheelW;
	const wheelGeo = wheelKit( R, W, 'black', { spokes: 3, split: true, rimR: R * 0.7, caliper: 0xc8141e } ).build();
	const wheels = [
		{ x: 0, y: R, z: - aF, R, W, side: 1, steer: 1, front: true },
		{ x: 0, y: R, z: - aR, R, W, side: 1, steer: 0, front: false },
	];
	const fw = farWheelKit( R, W, 'black' ).build();
	for ( const w of wheels ) fk.addBuilt( fw, { p: [ w.x, w.y, w.z ] } );
	const nearGeo = k.build(), far = fk.build();
	nearGeo.computeBoundingBox();
	const bounds = nearGeo.boundingBox.clone();
	bounds.min.y = 0;
	bounds.min.z = Math.min( bounds.min.z, - aF - R - 0.05 );
	bounds.max.z = Math.max( bounds.max.z, - aR + R + 0.05 );
	bounds.min.x = Math.min( bounds.min.x, - 0.38 ); bounds.max.x = Math.max( bounds.max.x, 0.38 );
	bounds.max.y = Math.max( bounds.max.y, 1.12 );
	void D2R;
	return { P, near: nearGeo, far, glass: glass.parts.length ? glass.build() : null, wheelGeo, wheels, steering, bounds, parts: [], meta: { fuel: [ 0, hy + 0.1, - ( hf - 0.2 ) ], exhaust: [ 0.17, 0.39, 0.66 ], lamps: {} } };
}
