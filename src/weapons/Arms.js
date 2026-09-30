// First-person arms: the hand frame and grip solver every arm is posed with, and the procedural arms (the fallback
// until, or if never, the modelled arms of ArmRig.js load). Each procedural arm is one smooth-skinned surface from
// the shoulder through the elbow and the wrist to the palm, with four fingers and a thumb lofted as tubes that blend
// into it (linear blend skinning across every joint, so knuckles and wrists bend without seams), fingernails, a
// sleeve (long to the wrist, or short above the elbow) printed with the worn top's fabric, and gloves with a cuff.
// setHandMetrics() swaps the solver's hand measurements for the loaded model's.
//
// Hand frame (the wrist bone): +Z along the fingers, +Y out of the back of the hand, +X along the knuckle line
// towards the index finger on the right hand (towards the pinky on the left: the left arm mirrors X).
// A grip is a cylinder the fingers close around: { p (a point on its axis), a (axis, pinky -> index), n (back of
// the hand), r }. wristMatrix( grip ) places the hand on it and curlFor( r ) solves the finger joints around it.
//
// Posing: pose( shoulder, handMatrix ) puts the hand exactly where it is asked to be, then lets the forearm
// continue the hand's line (bent a little towards the shoulder, like a relaxed wrist) and the upper arm reach back
// towards the shoulder. The forearm never stretches, so wrists always read as wrists.
import * as THREE from 'three';
import { patchMaterial } from '../render/Materials.js';

export const PALM_LEN = 0.095; // wrist to the middle knuckle
export const PALM_T = 0.024; // palm thickness under the knuckles
let PALM_SKIN = 0.0128; // bone plane to the palmar skin (pads included): where a grip touches
// A power grip lies diagonally across the palm, from under the index knuckle to the heel on the pinky side: the
// axis crosses the hand's middle line GRIP_Z in front of the wrist, turned GRIP_BETA from the knuckle line.
export const GRIP_BETA = 0.44;
let GRIP_Z = 0.071;
export const FORE_LEN = 0.255, UPPER_LEN = 0.29;

// right hand. x, y, z: knuckle (MCP joint); len: phalanges; r: radius at MCP, PIP, DIP, tip; splay: yaw (rad)
const FINGERS_PROC = [
	{ x: 0.0255, y: - 0.0012, z: 0.0895, len: [ 0.044, 0.026, 0.0205 ], r: [ 0.0092, 0.0085, 0.0078, 0.0070 ], splay: 0.03 },
	{ x: 0.0081, y: 0.0, z: 0.0935, len: [ 0.0475, 0.0295, 0.0215 ], r: [ 0.0095, 0.0088, 0.008, 0.0072 ], splay: 0.0 },
	{ x: - 0.0094, y: - 0.0008, z: 0.0905, len: [ 0.0445, 0.0275, 0.0205 ], r: [ 0.009, 0.0083, 0.0076, 0.0069 ], splay: - 0.025 },
	{ x: - 0.0252, y: - 0.0028, z: 0.0815, len: [ 0.0355, 0.0215, 0.0185 ], r: [ 0.0079, 0.0072, 0.0066, 0.0061 ], splay: - 0.06 },
];
let FINGERS = FINGERS_PROC;
// thumb: CMC joint, rest direction and nail direction (the thumb sits rotated ~70 degrees from the fingers)
const THUMB = { p: [ 0.0205, - 0.0115, 0.022 ], dir: [ 0.6, - 0.36, 0.71 ], up: [ 0.72, 0.64, - 0.2 ], len: [ 0.045, 0.032, 0.0265 ], r: [ 0.0132, 0.0112, 0.0097, 0.0085 ] };

// bone indices: upper, forearm, wrist, 4 fingers x 3, thumb x 3
const B_UPPER = 0, B_FORE = 1, B_WRIST = 2, B_FING = 3, B_THUMB = 15;

// ---- finger curl --------------------------------------------------------------------------------------------------

// Joint angles for the four fingers closing around a cylinder of radius r lying under the palm (the axis where
// wristMatrix puts it). Each finger is fitted in its own plane: the three joint angles that lay the finger along
// the cylinder's surface (the middle and last segments hugging it, the tip on it) without sinking into it, found by
// a coarse search over the joints (the last joint loosely following the middle one) and a local refinement. A
// finger that can't reach the grip curls part way, like a relaxed one. tight < 1 relaxes the hand (0 = flat),
// > 1 squeezes past contact (a fist).
const JOINT_MAX = [ 1.62, 1.95, 1.35 ];
const CURLS = new Map();

// the grip solver's hand: the procedural one below, or the measurements of a loaded hand model (ArmRig.js)
export function setHandMetrics( m ) {
	FINGERS = m ? m.fingers : FINGERS_PROC;
	PALM_SKIN = m ? m.palmSkin : 0.0128;
	GRIP_Z = m ? 0.078 * m.palmLen / PALM_LEN : 0.071;
	CURLS.clear();
}

// one finger round a cylinder: C (y, z) its centre in the finger's plane, r its radius, k the squash of a diagonal
// grip's elliptic cross-section along the finger
function fitFinger( f, cy, cz, r, k ) {
	const S = [ 0.35, 0.7, 1 ];
	const W = [ 0.15, 0.15, 0.25, 0.8, 0.9, 1.4, 1.6, 1.8, 2.4 ]; // how much each sample wants to touch
	const energy = ( a0, a1, a2 ) => {
		let py = 0, pz = 0, dir = 0, e = 0, n = 0;
		const A = [ a0, a1, a2 ];
		for ( let s = 0; s < 3; s ++ ) {
			dir += A[ s ];
			const sn = Math.sin( dir ), cs = Math.cos( dir ), L = f.len[ s ];
			for ( let j = 0; j < 3; j ++ ) {
				const t = S[ j ] * L, y = py - sn * t, z = pz + cs * t;
				const rad = f.r[ s ] + ( f.r[ s + 1 ] - f.r[ s ] ) * S[ j ];
				const d = Math.hypot( y - cy, ( z - cz ) * k ) - ( r + rad * 0.9 );
				// (flesh gives a little: a few millimetres into the grip between the joints is fine)
				const pen = Math.min( 0, d + ( j < 2 ? 0.004 : 0.0015 ) );
				e += 60 * pen * pen + ( d > 0 ? W[ n ] * d * d : 0 );
				n ++;
			}
			py -= sn * L; pz += cs * L;
		}
		// rather less curl than more when it makes no difference; the last joint follows the middle one
		return e + 2e-6 * ( a0 * a0 + a1 * a1 + a2 * a2 ) + 1e-5 * ( a2 - 0.62 * a1 ) ** 2;
	};
	let best = Infinity, B = [ 0, 0, 0 ];
	for ( let a0 = - 0.15; a0 <= JOINT_MAX[ 0 ]; a0 += 0.05 ) for ( let a1 = 0; a1 <= JOINT_MAX[ 1 ]; a1 += 0.05 ) for ( let dd = - 0.3; dd <= 0.31; dd += 0.15 ) {
		const a2 = Math.min( JOINT_MAX[ 2 ], Math.max( 0, 0.62 * a1 + dd ) );
		const e = energy( a0, a1, a2 );
		if ( e < best ) { best = e; B = [ a0, a1, a2 ]; }
	}
	// refine
	for ( let step = 0.02; step > 0.002; step *= 0.5 ) {
		for ( let it = 0; it < 12; it ++ ) {
			let moved = false;
			for ( let i = 0; i < 3; i ++ ) for ( const sg of [ - 1, 1 ] ) {
				const T = B.slice(); T[ i ] = Math.min( JOINT_MAX[ i ], Math.max( i ? 0 : - 0.15, T[ i ] + sg * step ) );
				const e = energy( ...T );
				if ( e < best ) { best = e; B = T; moved = true; }
			}
			if ( ! moved ) break;
		}
	}
	return B;
}

// dz / sink: the grip sits dz further towards the fingers and sinks that far into the palm's pads (a support hand
// cradling a handguard near the finger roots rather than a fist round a grip)
export function curlFor( r, tight = 1, beta = GRIP_BETA, dz = 0, sink = 0 ) {
	// solved once per grip size (the view model asks every frame); callers must not modify the result
	const key = `${ r }|${ tight }|${ beta }|${ dz }|${ sink }`;
	let out = CURLS.get( key );
	if ( out ) return out;
	out = [];
	CURLS.set( key, out );
	const tb = Math.tan( beta ), k = Math.cos( beta );
	for ( const f of FINGERS ) {
		// 2D in the finger's plane: z forward, y up (back of the hand), origin at the knuckle. The diagonal grip
		// axis crosses this finger's plane further back for the pinky than for the index
		const cy = - ( PALM_SKIN - sink + r ) - f.y, cz = GRIP_Z + dz + f.x * tb - f.z;
		const angles = fitFinger( f, cy, cz, r, k );
		out.push( angles.map( ( a, i ) => THREE.MathUtils.clamp( a * tight + ( tight > 1 ? ( tight - 1 ) * 0.4 : 0 ), i ? 0 : - 0.15, JOINT_MAX[ i ] ) ) );
	}
	return out;
}

// a closed fist (punches, a knuckle full of something)
export const FIST = [ [ 1.45, 1.7, 0.95 ], [ 1.5, 1.7, 0.95 ], [ 1.5, 1.7, 0.95 ], [ 1.45, 1.65, 0.9 ] ];

// thumb poses: where the thumb's base bone (the metacarpal, from the wrist's thenar) points in the hand frame,
// its roll about that line (+ turns the pad towards the fingers) and the flex of its two joints
export const THUMB_POSE = {
	relaxed: { dir: [ 0.6, - 0.36, 0.71 ], roll: 0, flex: [ 0.2, 0.15 ] },
	// (rig: the modelled hand's thumb as an absolute frame: the base bone's direction and the nail's facing)
	wrap: { dir: [ 0.3, - 0.5, 0.8 ], roll: 0.75, flex: [ 0.7, 0.5 ], rig: { dir: [ 0.15, - 0.75, 0.65 ], up: [ 0.8, - 0.3, - 0.4 ], flex: [ 0.3, 0.3 ] } }, // round a grip, over the fingers
	along: { dir: [ 0.55, - 0.45, 0.7 ], roll: 0.2, flex: [ 0.05, 0.05 ] }, // laid along the side of a handguard / frame
	up: { dir: [ 0.62, - 0.1, 0.78 ], roll: - 0.2, flex: [ 0.05, 0.1 ] }, // straight along the top (C-clamp)
	forward: { dir: [ 0.3, - 0.3, 0.9 ], roll: 0.1, flex: [ 0.08, 0.02 ] }, // thumbs forward along a pistol's frame
	fist: { dir: [ - 0.2, - 0.65, 0.7 ], roll: 1.6, flex: [ 0.9, 0.9 ] },
	pinch: { dir: [ 0.42, - 0.62, 0.66 ], roll: 0.4, flex: [ 0.3, 0.35 ] },
	flat: { dir: [ 0.78, - 0.12, 0.62 ], roll: - 0.1, flex: [ 0, 0 ] },
};

// ---- geometry --------------------------------------------------------------------------------------------------------

const smoothstep = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };
const gauss = ( d, s ) => Math.exp( - ( d * d ) / ( s * s ) );
const lerp = THREE.MathUtils.lerp;
// superellipse cross-section: e = 2 ellipse, larger = boxier
const se = ( v, e ) => Math.sign( v ) * Math.pow( Math.abs( v ), 2 / e );

// accumulates skinned vertices, lofts and caps; groups by material slot
class Mesher {
	constructor() { this.P = []; this.UV = []; this.C = []; this.SI = []; this.SW = []; this.I = []; this.groups = []; this.seams = []; this._g = null; }
	slot( mat ) { this._close(); this._g = { start: this.I.length, materialIndex: mat }; }
	_close() { const g = this._g; if ( g ) { g.count = this.I.length - g.start; if ( g.count ) this.groups.push( g ); this._g = null; } }
	// w: [ [ bone, weight ], ... ]
	v( x, y, z, u, vv, c, w ) {
		const i = this.P.length / 3;
		this.P.push( x, y, z ); this.UV.push( u, vv ); this.C.push( c[ 0 ], c[ 1 ], c[ 2 ] );
		const ws = w.filter( e => e[ 1 ] > 1e-4 ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 4 );
		let t = 0; for ( const e of ws ) t += e[ 1 ];
		for ( let k = 0; k < 4; k ++ ) { this.SI.push( ws[ k ]?.[ 0 ] ?? 0 ); this.SW.push( ws[ k ] ? ws[ k ][ 1 ] / t : 0 ); }
		return i;
	}
	// rings: arrays of n + 1 vertex ids (the last repeats the first position for the uv seam)
	loft( rings, capStart = null, capEnd = null ) {
		for ( let r = 0; r + 1 < rings.length; r ++ ) {
			const a = rings[ r ], b = rings[ r + 1 ];
			for ( let j = 0; j + 1 < a.length; j ++ ) this.I.push( a[ j ], a[ j + 1 ], b[ j ], a[ j + 1 ], b[ j + 1 ], b[ j ] );
		}
		for ( const ring of rings ) this.seams.push( [ ring[ 0 ], ring[ ring.length - 1 ] ] );
		if ( capStart != null ) { const a = rings[ 0 ]; for ( let j = 0; j + 1 < a.length; j ++ ) this.I.push( capStart, a[ j + 1 ], a[ j ] ); }
		if ( capEnd != null ) { const a = rings[ rings.length - 1 ]; for ( let j = 0; j + 1 < a.length; j ++ ) this.I.push( a[ j ], a[ j + 1 ], capEnd ); }
	}
	grid( rows ) { for ( let r = 0; r + 1 < rows.length; r ++ ) { const a = rows[ r ], b = rows[ r + 1 ]; for ( let j = 0; j + 1 < a.length; j ++ ) this.I.push( a[ j ], a[ j + 1 ], b[ j ], a[ j + 1 ], b[ j + 1 ], b[ j ] ); } }
	build( mirror = false ) {
		this._close();
		const g = new THREE.BufferGeometry();
		const P = new Float32Array( this.P );
		if ( mirror ) for ( let i = 0; i < P.length; i += 3 ) P[ i ] = - P[ i ];
		const I = this.I.slice();
		if ( mirror ) for ( let i = 0; i < I.length; i += 3 ) { const t = I[ i + 1 ]; I[ i + 1 ] = I[ i + 2 ]; I[ i + 2 ] = t; }
		g.setAttribute( 'position', new THREE.BufferAttribute( P, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( this.UV, 2 ) );
		g.setAttribute( 'color', new THREE.Float32BufferAttribute( this.C, 3 ) );
		g.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( this.SI, 4 ) );
		g.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute( this.SW, 4 ) );
		g.setIndex( I );
		g.computeVertexNormals();
		// the duplicated seam vertices share one normal
		const N = g.attributes.normal;
		for ( const [ a, b ] of this.seams ) {
			const x = N.getX( a ) + N.getX( b ), y = N.getY( a ) + N.getY( b ), z = N.getZ( a ) + N.getZ( b ), l = Math.hypot( x, y, z ) || 1;
			N.setXYZ( a, x / l, y / l, z / l ); N.setXYZ( b, x / l, y / l, z / l );
		}
		for ( const gr of this.groups ) g.addGroup( gr.start, gr.count, gr.materialIndex );
		g.computeBoundingSphere();
		return g;
	}
}

// the arm's cross-section along the straight bind pose (hand frame, z from the shoulder at -0.575 to the palm's
// front edge): half width (along the knuckle line), back / palm-side extents, squareness
const Z_SHOULDER = - FORE_LEN - UPPER_LEN - 0.03, Z_ELBOW = - FORE_LEN, Z_FRONT = 0.1;
const PROFILE = [
	// z, w, hd (back), hp (palm side), e
	[ Z_SHOULDER, 0.05, 0.052, 0.05, 2 ],
	[ Z_ELBOW - 0.2, 0.047, 0.05, 0.052, 2 ],
	[ Z_ELBOW - 0.07, 0.043, 0.043, 0.045, 2 ],
	[ Z_ELBOW, 0.042, 0.038, 0.037, 2 ],
	[ Z_ELBOW + 0.055, 0.045, 0.04, 0.038, 2 ],
	[ - 0.15, 0.04, 0.031, 0.032, 2.05 ],
	[ - 0.07, 0.033, 0.022, 0.023, 2.15 ],
	[ - 0.014, 0.0295, 0.0165, 0.0175, 2.4 ],
	[ 0.012, 0.0335, 0.0135, 0.0165, 2.7 ],
	[ 0.05, 0.0405, 0.0125, 0.0152, 3.1 ],
	[ 0.082, 0.0425, 0.0118, 0.0125, 3.2 ],
	[ 0.094, 0.0395, 0.0098, 0.0092, 3 ],
	[ Z_FRONT, 0.031, 0.006, 0.0055, 2.6 ],
];
function profileAt( z ) {
	const P = PROFILE;
	if ( z <= P[ 0 ][ 0 ] ) return P[ 0 ].slice( 1 );
	for ( let i = 0; i + 1 < P.length; i ++ ) {
		const a = P[ i ], b = P[ i + 1 ];
		if ( z <= b[ 0 ] ) { const t = ( z - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] ), s = t * t * ( 3 - 2 * t ); return [ lerp( a[ 1 ], b[ 1 ], s ), lerp( a[ 2 ], b[ 2 ], s ), lerp( a[ 3 ], b[ 3 ], s ), lerp( a[ 4 ], b[ 4 ], s ) ]; }
	}
	return P[ P.length - 1 ].slice( 1 );
}

// skin weights along the arm: upper -> forearm at the elbow, forearm -> wrist at the wrist
function armWeights( z ) {
	const e = smoothstep( Z_ELBOW - 0.035, Z_ELBOW + 0.035, z ), w = smoothstep( - 0.032, 0.012, z );
	return [ [ B_UPPER, 1 - e ], [ B_FORE, e * ( 1 - w ) ], [ B_WRIST, e * w ] ];
}

// the arm surface at (phi, z) in the bind pose, with muscles, knuckles and the thenar / hypothenar pads.
// off: extra thickness (sleeves), fold: fabric folds amplitude
function armPoint( phi, z, off = 0, fold = 0 ) {
	const [ w, hd, hp, e ] = profileAt( z );
	const c = Math.cos( phi ), s = Math.sin( phi );
	let x = ( w + off ) * se( c, e ), y = ( s > 0 ? hd + off : hp + off ) * se( s, e );
	if ( z > - 0.02 && off === 0 ) {
		// knuckles on the back of the hand
		if ( s > 0 ) for ( const f of FINGERS_PROC ) y += 0.0034 * gauss( Math.hypot( x - f.x, z - f.z + 0.004 ), 0.0072 ) * s;
		// tendons fanning from the wrist to the knuckles
		if ( s > 0 && z > 0.01 && z < 0.08 ) for ( const f of FINGERS_PROC ) { const fx = f.x * ( 0.35 + 0.65 * z / 0.08 ); y += 0.0006 * gauss( x - fx, 0.0028 ) * s; }
		// palm: thenar (thumb side) and hypothenar pads, the hollow between them
		if ( s < 0 ) {
			y -= 0.0068 * gauss( Math.hypot( x - 0.022, z - 0.03 ), 0.017 ) * - s;
			y -= 0.0042 * gauss( Math.hypot( x + 0.024, z - 0.045 ), 0.018 ) * - s;
			y += 0.0028 * gauss( Math.hypot( x - 0.004, z - 0.058 ), 0.014 ) * - s;
			y -= 0.0022 * gauss( z - 0.083, 0.006 ) * - s; // the pad under the knuckles
		}
		// the thumb's base widens the hand on its side
		if ( c > 0 ) x += 0.005 * gauss( Math.hypot( z - 0.03, y + 0.004 ), 0.02 ) * c;
	}
	if ( z < 0 && off === 0 ) {
		// forearm: the muscle mass near the elbow sits towards the back / thumb side, the wrist bones show
		x += 0.004 * gauss( z - ( Z_ELBOW + 0.07 ), 0.06 ) * Math.max( 0, c );
		y += 0.0018 * gauss( Math.hypot( x + 0.024, z + 0.014 ), 0.006 ); // ulnar head
		// the biceps
		if ( z < Z_ELBOW ) y -= 0.004 * gauss( z - ( Z_ELBOW - 0.12 ), 0.08 ) * Math.max( 0, - s );
	}
	if ( fold ) {
		// fabric: soft folds, bunched above the elbow and at the cuff
		const bunch = 0.45 + gauss( z - Z_ELBOW + 0.02, 0.05 ) + 0.6 * gauss( z + 0.03, 0.03 );
		const f = Math.sin( phi * 2 + z * 61 ) * 0.6 + Math.sin( phi * 3 - z * 37 + 1.3 ) * 0.4 + Math.sin( phi * 5 + z * 23 + 0.4 ) * 0.25;
		const k = 1 + fold * bunch * f;
		x *= k; y *= k;
	}
	return [ x, y, z ];
}

// the rest orientation of the thumb's base bone (right hand)
function thumbRest() {
	const Z = new THREE.Vector3( ...THUMB.dir ).normalize();
	const Y = new THREE.Vector3( ...THUMB.up ); Y.addScaledVector( Z, - Y.dot( Z ) ).normalize();
	const X = new THREE.Vector3().crossVectors( Y, Z );
	return new THREE.Quaternion().setFromRotationMatrix( new THREE.Matrix4().makeBasis( X, Y, Z ) );
}
const THUMB_Q = thumbRest();

const WHITE3 = [ 1, 1, 1 ];
// vertex tints (multiply the skin colour): palms paler, knuckles and fingertips a little redder
const tint = ( back, red ) => [ ( back ? 1 : 1.07 ) * ( 1 + red * 0.04 ), 1 - red * 0.08, ( back ? 1 : 0.95 ) * ( 1 - red * 0.1 ) ];

// the skin: shoulder -> palm plus fingers, thumb and nails. slots: 0 arm, 1 hand, 2 nails
function skinGeometry( side ) {
	const M = new Mesher();
	const N = 20;
	// arm + palm: one loft, split at the wrist into the arm's slot and the hand's (gloves replace the hand's)
	const Z_GLOVE = - 0.045;
	const pushRing = ( z ) => {
		const ring = [];
		for ( let j = 0; j <= N; j ++ ) {
			const phi = j / N * Math.PI * 2;
			const [ x, y ] = armPoint( phi, z );
			const s = Math.sin( phi );
			// the thumb's base muscle moves with the thumb
			let w = armWeights( z );
			const th = z > - 0.01 ? 0.65 * gauss( Math.hypot( x - 0.02, z - 0.028 ), 0.02 ) * ( s < 0.3 ? 1 : 0.4 ) : 0;
			if ( th > 0.01 ) w = [ ...w.map( ( [ b, v ] ) => [ b, v * ( 1 - th ) ] ), [ B_THUMB, th ] ];
			const red = z > 0.07 && s > 0 ? 0.6 * smoothstep( 0.07, 0.09, z ) : 0;
			ring.push( M.v( x, y, z, j / N, z * 6, z > - 0.01 ? tint( s > - 0.2, red ) : WHITE3, w ) );
		}
		return ring;
	};
	const zArm = [];
	for ( let z = Z_SHOULDER; z < - 0.1; z += 0.014 ) zArm.push( z );
	for ( let z = - 0.1; z < Z_GLOVE - 0.001; z += 0.007 ) zArm.push( z );
	zArm.push( Z_GLOVE );
	const zHand = [];
	for ( let z = Z_GLOVE + 0.005; z < Z_FRONT - 0.001; z += 0.005 ) zHand.push( z );
	zHand.push( Z_FRONT );
	M.slot( 0 );
	const armRings = zArm.map( pushRing );
	M.loft( armRings, M.v( 0, 0, Z_SHOULDER - 0.015, 0.5, 0, WHITE3, armWeights( Z_SHOULDER ) ), null );
	M.slot( 1 );
	const tip = M.v( 0, 0, Z_FRONT + 0.004, 0.5, 1, tint( true, 0.3 ), armWeights( Z_FRONT ) );
	M.loft( [ armRings[ armRings.length - 1 ], ...zHand.map( pushRing ) ], null, tip );

	// fingers and the thumb: tubes from inside the palm to a rounded tip, nails on the last segment
	const tube = ( base, q, len, rad, bones, isThumb ) => {
		const L = len[ 0 ] + len[ 1 ] + len[ 2 ];
		const J = [ 0, len[ 0 ], len[ 0 ] + len[ 1 ] ];
		const rAt = ( s ) => {
			if ( s <= 0 ) return rad[ 0 ] * ( isThumb ? 1 + Math.min( 0.25, - s * 12 ) : 1 );
			for ( let k = 0; k < 3; k ++ ) if ( s <= J[ k ] + len[ k ] ) return lerp( rad[ k ], rad[ k + 1 ], ( s - J[ k ] ) / len[ k ] );
			return rad[ 3 ];
		};
		const weights = ( s ) => {
			const h = [ isThumb ? 0.012 : 0.0075, 0.0055, 0.0045 ];
			let k = - 1;
			for ( let i = 0; i < 3; i ++ ) if ( s > J[ i ] - h[ i ] ) k = i;
			if ( k < 0 ) return [ [ B_WRIST, 1 ] ];
			const t = smoothstep( J[ k ] - h[ k ], J[ k ] + h[ k ], s );
			const prev = k === 0 ? B_WRIST : bones[ k - 1 ];
			return [ [ prev, 1 - t ], [ bones[ k ], t ] ];
		};
		const n = 12, V3 = new THREE.Vector3();
		const ring = ( s, rr, cap ) => {
			const out = [];
			for ( let j = 0; j <= n; j ++ ) {
				const phi = j / n * Math.PI * 2, c = Math.cos( phi ), sn = Math.sin( phi );
				let x = rr * c * ( isThumb ? 1.08 : 1.04 ), y = rr * sn * ( sn > 0 ? 0.86 : 0.98 );
				if ( ! cap ) {
					// knuckle bumps on the back, creases and pads on the palm side
					for ( let k = 1; k < 3; k ++ ) {
						if ( sn > 0 ) y += 0.0009 * gauss( s - J[ k ] + 0.001, 0.0045 ) * sn;
						else y -= ( - 0.0007 * gauss( s - J[ k ], 0.0022 ) + 0.0009 * gauss( s - J[ k ] - len[ k ] * 0.5, len[ k ] * 0.3 ) ) * sn;
					}
				}
				V3.set( x, y, s ).applyQuaternion( q ).add( base );
				const red = s > L - 0.012 ? 0.8 : gauss( s, 0.006 ) * ( sn > 0 ? 0.5 : 0 );
				out.push( M.v( V3.x, V3.y, V3.z, j / n, s * 20, tint( sn > - 0.3, red ), weights( s ) ) );
			}
			return out;
		};
		const rs = [];
		for ( let s = isThumb ? - 0.02 : - 0.013; s < L; s += 0.0035 ) rs.push( ring( s, rAt( s ) ) );
		const rt = rad[ 3 ];
		for ( let k = 0; k <= 4; k ++ ) { const a = k / 5 * Math.PI / 2; rs.push( ring( L + Math.sin( a ) * rt * 0.9, Math.cos( a ) * rt, true ) ); }
		V3.set( 0, - rt * 0.1, L + rt * 0.9 ).applyQuaternion( q ).add( base );
		const tipV = M.v( V3.x, V3.y, V3.z, 0.5, 1, tint( true, 0.8 ), [ [ bones[ 2 ], 1 ] ] );
		M.loft( rs, null, tipV );
		// the nail: a curved plate over the back of the last segment, its free edge at the tip
		M.slot( 2 );
		const rows = [];
		const n0 = L - len[ 2 ] * 0.62, n1 = L + rt * 0.35;
		for ( let i = 0; i <= 5; i ++ ) {
			const s = lerp( n0, n1, i / 5 );
			const row = [];
			const rr = s > L ? Math.sqrt( Math.max( 0, 1 - Math.pow( ( s - L ) / ( rt * 0.9 ), 2 ) ) ) * rt : rAt( s );
			for ( let j = 0; j <= 4; j ++ ) {
				const phi = Math.PI / 2 + ( j / 4 - 0.5 ) * 1.6;
				const lift = 0.00045 + ( i === 0 ? - 0.0003 : 0 );
				V3.set( Math.cos( phi ) * ( rr * ( isThumb ? 1.08 : 1.04 ) + lift ), Math.sin( phi ) * ( rr * 0.86 + lift ) + ( s > L ? 0.0006 : 0 ), s ).applyQuaternion( q ).add( base );
				row.push( M.v( V3.x, V3.y, V3.z, j / 4, i / 5, [ 1.02, 0.96, 0.95 ], [ [ bones[ 2 ], 1 ] ] ) );
			}
			rows.push( row );
		}
		M.grid( rows );
		M.slot( 1 );
	};
	const qf = new THREE.Quaternion();
	FINGERS_PROC.forEach( ( f, i ) => {
		qf.setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), f.splay );
		tube( new THREE.Vector3( f.x, f.y, f.z ), qf.clone(), f.len, f.r, [ B_FING + i * 3, B_FING + i * 3 + 1, B_FING + i * 3 + 2 ], false );
	} );
	tube( new THREE.Vector3( ...THUMB.p ), THUMB_Q, THUMB.len, THUMB.r, [ B_THUMB, B_THUMB + 1, B_THUMB + 2 ], true );
	return M.build( side < 0 );
}

// a sleeve over the arm from the shoulder to z1 (long: near the wrist, short: above the elbow), with a hem
function sleeveGeometry( side, z1, off, fold ) {
	const M = new Mesher();
	M.slot( 0 );
	const N = 24, rings = [];
	const ring = ( z, o, f, v ) => {
		const r = [];
		for ( let j = 0; j <= N; j ++ ) { const phi = j / N * Math.PI * 2; const [ x, y ] = armPoint( phi, Math.min( z, z1 ), o, f ); r.push( M.v( x, y, z, j / N, v, WHITE3, armWeights( z ) ) ); }
		return r;
	};
	for ( let z = Z_SHOULDER; z < z1 - 0.02; z += 0.01 ) rings.push( ring( z, off, fold, z * 4 ) );
	// the hem: a turned edge, then back inside so the opening shows the cloth's thickness
	rings.push( ring( z1 - 0.02, off + 0.0015, fold * 0.4, ( z1 - 0.02 ) * 4 ) );
	rings.push( ring( z1 - 0.004, off + 0.0022, fold * 0.2, ( z1 - 0.004 ) * 4 ) );
	rings.push( ring( z1, off + 0.001, 0, z1 * 4 ) );
	rings.push( ring( z1 - 0.006, off - 0.0022, 0, z1 * 4 + 0.01 ) );
	M.loft( rings );
	return M.build( side < 0 );
}

// a glove cuff around the wrist (the hand itself takes the glove material)
function cuffGeometry( side ) {
	const M = new Mesher();
	M.slot( 0 );
	const N = 20, rings = [];
	const ring = ( z, o ) => { const r = []; for ( let j = 0; j <= N; j ++ ) { const phi = j / N * Math.PI * 2; const [ x, y ] = armPoint( phi, z, o ); r.push( M.v( x, y, z, j / N, z * 10, WHITE3, armWeights( z ) ) ); } return r; };
	rings.push( ring( - 0.07, - 0.001 ), ring( - 0.066, 0.0045 ), ring( - 0.058, 0.0052 ), ring( - 0.03, 0.0042 ), ring( - 0.008, 0.0028 ), ring( 0.012, 0.0014 ) );
	M.loft( rings );
	return M.build( side < 0 );
}

// ---- materials --------------------------------------------------------------------------------------------------------

function canvasTex( w, h, draw, repeat = 1, srgb = false ) {
	if ( typeof document === 'undefined' ) return null;
	const c = document.createElement( 'canvas' ); c.width = w; c.height = h;
	draw( c.getContext( '2d' ), w, h );
	const t = new THREE.CanvasTexture( c );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set( repeat, repeat );
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	t.anisotropy = 4;
	return t;
}
let TEX = null;
function textures() {
	if ( TEX ) return TEX;
	let seed = 5;
	const r = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	TEX = {
		// skin: pores and fine creases
		skin: canvasTex( 256, 256, ( g, w, h ) => {
			g.fillStyle = '#808080'; g.fillRect( 0, 0, w, h );
			for ( let i = 0; i < 2600; i ++ ) { g.fillStyle = `rgba(40,40,40,${0.12 + r() * 0.18})`; g.beginPath(); g.arc( r() * w, r() * h, 0.5 + r() * 0.9, 0, 7 ); g.fill(); }
			g.strokeStyle = 'rgba(60,60,60,0.25)'; g.lineWidth = 0.7;
			for ( let i = 0; i < 90; i ++ ) { const x = r() * w, y = r() * h, a = r() * 0.5 - 0.25; g.beginPath(); g.moveTo( x, y ); g.lineTo( x + Math.cos( a ) * 14, y + Math.sin( a ) * 14 ); g.stroke(); }
		}, 1 ),
		// woven cloth
		weave: canvasTex( 64, 64, ( g, w, h ) => {
			g.fillStyle = '#808080'; g.fillRect( 0, 0, w, h );
			for ( let y = 0; y < h; y += 2 ) for ( let x = 0; x < w; x += 2 ) { const v = ( ( x + y ) & 2 ) ? 158 : 96; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect( x, y, 2, 2 ); }
		}, 1 ),
		// glove: synthetic leather grain + stitched panels
		glove: canvasTex( 128, 128, ( g, w, h ) => {
			g.fillStyle = '#808080'; g.fillRect( 0, 0, w, h );
			for ( let i = 0; i < 1400; i ++ ) { const v = 60 + r() * 140 | 0; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect( r() * w, r() * h, 2, 2 ); }
			g.strokeStyle = 'rgba(30,30,30,0.6)'; g.setLineDash( [ 3, 2 ] ); g.lineWidth = 1;
			for ( const y of [ 20, 84 ] ) { g.beginPath(); g.moveTo( 0, y ); g.lineTo( w, y ); g.stroke(); }
		}, 1 ),
	};
	return TEX;
}

const view = ( m ) => { m.defines = { NO_ATMOS_FOG: '' }; return patchMaterial( m, 'arms-view', null, { noCloudShadow: true } ); };
function skinMaterial( color ) {
	const T = textures();
	const m = new THREE.MeshStandardMaterial( { color, roughness: 0.56, metalness: 0, vertexColors: true } );
	if ( T.skin ) { m.bumpMap = T.skin; m.bumpScale = 0.35; }
	return view( m );
}
// a white 1x1 map for plain sleeves: a printed top then only swaps the texture (no shader recompile)
let WHITE = null;
function whiteTex() {
	if ( ! WHITE ) { WHITE = new THREE.DataTexture( new Uint8Array( [ 255, 255, 255, 255 ] ), 1, 1 ); WHITE.colorSpace = THREE.SRGBColorSpace; WHITE.needsUpdate = true; }
	return WHITE;
}
function clothMaterial( color, rough = 0.9 ) {
	const T = textures();
	const m = new THREE.MeshStandardMaterial( { color, roughness: rough, metalness: 0, side: THREE.DoubleSide } );
	m.map = whiteTex();
	if ( T.weave ) { m.bumpMap = T.weave; m.bumpScale = 0.5; }
	return view( m );
}

// the arm geometries are the same for every arm on a side: build them once
const GEO = {};
function geometries( side ) {
	const k = side > 0 ? 'R' : 'L';
	return GEO[ k ] ||= {
		skin: skinGeometry( side ),
		sleeveLong: sleeveGeometry( side, - 0.028, 0.0075, 0.06 ),
		sleeveShort: sleeveGeometry( side, Z_ELBOW - 0.11, 0.0085, 0.05 ),
		cuff: cuffGeometry( side ),
	};
}

// ---- the arm ----------------------------------------------------------------------------------------------------------

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const AX_X = new THREE.Vector3( 1, 0, 0 ), AX_Y = new THREE.Vector3( 0, 1, 0 ), AX_Z = new THREE.Vector3( 0, 0, 1 );

export class Arm {
	constructor( side = 1 ) {
		this.side = side;
		const G = geometries( side );
		this.root = new THREE.Group();
		this.root.name = side > 0 ? 'armR' : 'armL';
		// materials are per arm (sleeves and gloves differ only by colour, but the arms share a style call)
		this.mSkin = skinMaterial( 0xb98467 );
		this.mNail = view( new THREE.MeshStandardMaterial( { color: 0xc69184, roughness: 0.38, metalness: 0, vertexColors: true } ) );
		this.mGlove = view( new THREE.MeshStandardMaterial( { color: 0x2a2a2a, roughness: 0.78, metalness: 0, vertexColors: true } ) );
		if ( textures().glove ) { this.mGlove.bumpMap = textures().glove; this.mGlove.bumpScale = 0.6; }
		this.mCuff = view( new THREE.MeshStandardMaterial( { color: 0x2a2a2a, roughness: 0.8, metalness: 0 } ) );
		this.mSleeve = clothMaterial( 0x888888 );
		// the skeleton, in the straight bind pose (the hand frame: wrist at the origin, the arm along -z)
		const mk = () => new THREE.Bone();
		const bones = [];
		for ( let i = 0; i < 18; i ++ ) bones.push( mk() );
		const upper = bones[ B_UPPER ], fore = bones[ B_FORE ], wrist = bones[ B_WRIST ];
		upper.position.set( 0, 0, Z_ELBOW - UPPER_LEN );
		fore.position.set( 0, 0, UPPER_LEN ); upper.add( fore );
		wrist.position.set( 0, 0, FORE_LEN ); fore.add( wrist );
		this.fingers = [];
		FINGERS_PROC.forEach( ( f, i ) => {
			const ch = [ bones[ B_FING + i * 3 ], bones[ B_FING + i * 3 + 1 ], bones[ B_FING + i * 3 + 2 ] ];
			ch[ 0 ].position.set( f.x * side, f.y, f.z );
			ch[ 0 ].userData.rest = new THREE.Quaternion().setFromAxisAngle( AX_Y, f.splay * side );
			ch[ 0 ].quaternion.copy( ch[ 0 ].userData.rest );
			wrist.add( ch[ 0 ] );
			ch[ 1 ].position.set( 0, 0, f.len[ 0 ] ); ch[ 0 ].add( ch[ 1 ] );
			ch[ 2 ].position.set( 0, 0, f.len[ 1 ] ); ch[ 1 ].add( ch[ 2 ] );
			this.fingers.push( ch );
		} );
		const th = [ bones[ B_THUMB ], bones[ B_THUMB + 1 ], bones[ B_THUMB + 2 ] ];
		th[ 0 ].position.set( THUMB.p[ 0 ] * side, THUMB.p[ 1 ], THUMB.p[ 2 ] );
		// mirror the rest rotation for the left hand
		const tq = THUMB_Q.clone();
		if ( side < 0 ) { tq.y = - tq.y; tq.z = - tq.z; }
		th[ 0 ].userData.rest = tq;
		th[ 0 ].quaternion.copy( tq );
		wrist.add( th[ 0 ] );
		th[ 1 ].position.set( 0, 0, THUMB.len[ 0 ] ); th[ 0 ].add( th[ 1 ] );
		th[ 2 ].position.set( 0, 0, THUMB.len[ 1 ] ); th[ 1 ].add( th[ 2 ] );
		this.thumb = th;
		this.bones = bones;
		this.upperBone = upper; this.foreBone = fore; this.wrist = wrist;
		// the meshes share one skeleton
		this.skin = new THREE.SkinnedMesh( G.skin, [ this.mSkin, this.mSkin, this.mNail ] );
		this.skin.add( upper );
		this.skin.updateMatrixWorld( true );
		this.skeleton = new THREE.Skeleton( bones );
		this.skin.bind( this.skeleton );
		this.sleeveLong = new THREE.SkinnedMesh( G.sleeveLong, this.mSleeve );
		this.sleeveShort = new THREE.SkinnedMesh( G.sleeveShort, this.mSleeve );
		this.cuff = new THREE.SkinnedMesh( G.cuff, this.mCuff );
		for ( const m of [ this.sleeveLong, this.sleeveShort, this.cuff ] ) m.bind( this.skeleton );
		for ( const m of [ this.skin, this.sleeveLong, this.sleeveShort, this.cuff ] ) { m.frustumCulled = false; m.castShadow = m.receiveShadow = false; this.root.add( m ); }
		this.sleeveShort.visible = false; this.cuff.visible = false;
		this.shoulder = new THREE.Vector3();
		this.elbow = new THREE.Vector3();
		// how much the forearm leans from the hand's line towards the shoulder (0 = a dead straight wrist)
		this.bend = 0.38;
		this.setCurl( curlFor( 0.03, 0.35 ), THUMB_POSE.relaxed );
	}

	// clothing: { skin, sleeve (colour | null = bare arms), long (to the wrist), print (texture), glove (colour | null) }
	style( o ) {
		if ( o.skin != null ) this.mSkin.color.set( o.skin );
		const has = o.sleeve != null;
		if ( has ) {
			this.mSleeve.color.set( o.print ? 0xffffff : o.sleeve );
			this.mSleeve.map = o.print || whiteTex();
		}
		this.sleeveLong.visible = has && !! o.long;
		this.sleeveShort.visible = has && ! o.long;
		const gl = o.glove != null;
		if ( gl ) { this.mGlove.color.set( o.glove ); this.mCuff.color.set( o.glove ).multiplyScalar( 0.85 ); }
		this.skin.material = gl ? [ this.mSkin, this.mGlove, this.mGlove ] : [ this.mSkin, this.mSkin, this.mNail ];
		// a glove cuff under a long sleeve would poke through it
		this.cuff.visible = gl && ! ( has && o.long );
	}

	// every material shown at once (shader warm-up), and back
	warm( on ) {
		if ( on ) {
			this._warm = { mats: this.skin.material, vis: [ this.sleeveLong.visible, this.cuff.visible ] };
			this.skin.material = [ this.mSkin, this.mGlove, this.mGlove ];
			this.sleeveLong.visible = this.cuff.visible = true;
		} else if ( this._warm ) {
			this.skin.material = this._warm.mats;
			[ this.sleeveLong.visible, this.cuff.visible ] = this._warm.vis;
			this._warm = null;
		}
	}

	setEnvironment( env, intensity ) {
		for ( const m of [ this.mSkin, this.mNail, this.mGlove, this.mCuff, this.mSleeve ] ) {
			if ( m.envMap !== env ) { m.envMap = env; m.needsUpdate = true; }
			m.envMapIntensity = intensity * ( m === this.mNail ? 0.8 : m === this.mSkin ? 0.7 : 0.5 );
		}
	}

	// joint angles: curl = [ [ a0, a1, a2 ] x 4 ] (index, middle, ring, pinky), thumb = a THUMB_POSE entry,
	// splay spreads the fingers (flat hands)
	setCurl( curl, thumb = THUMB_POSE.relaxed, splay = 0 ) {
		for ( let f = 0; f < 4; f ++ ) {
			const c = curl[ f ], ch = this.fingers[ f ];
			_q.setFromAxisAngle( AX_Y, ( 1.5 - f ) * 0.06 * splay * this.side );
			ch[ 0 ].quaternion.copy( ch[ 0 ].userData.rest ).multiply( _q ).multiply( _q2.setFromAxisAngle( AX_X, c[ 0 ] ) );
			ch[ 1 ].quaternion.setFromAxisAngle( AX_X, c[ 1 ] );
			ch[ 2 ].quaternion.setFromAxisAngle( AX_X, c[ 2 ] );
		}
		const t = this.thumb, th = thumb || THUMB_POSE.relaxed;
		// the base bone turns from its rest line to the pose's line, then rolls about it
		_d.set( th.dir[ 0 ] * this.side, th.dir[ 1 ], th.dir[ 2 ] ).normalize();
		_c.set( THUMB.dir[ 0 ] * this.side, THUMB.dir[ 1 ], THUMB.dir[ 2 ] ).normalize();
		_q.setFromUnitVectors( _c, _d );
		t[ 0 ].quaternion.copy( _q ).multiply( t[ 0 ].userData.rest ).multiply( _q2.setFromAxisAngle( AX_Z, ( th.roll || 0 ) * this.side ) );
		t[ 1 ].quaternion.setFromAxisAngle( AX_X, th.flex[ 0 ] );
		t[ 2 ].quaternion.setFromAxisAngle( AX_X, th.flex[ 1 ] );
	}

	// place the hand (wrist frame in view space) and solve the arm towards the shoulder; the forearm leans towards
	// `elbow` when given (where the elbow should hang), else towards the shoulder
	pose( shoulder, hand, bend = this.bend, elbow = null ) {
		const W = _a.setFromMatrixPosition( hand );
		hand.extractBasis( _x, _y, _z );
		_x.normalize(); _y.normalize(); _z.normalize();
		// forearm: back along the hand, leaning towards the shoulder, never more than ~40 degrees off the hand's line
		const toS = _b.subVectors( elbow || shoulder, W ).normalize();
		const d = _c.copy( _z ).negate().multiplyScalar( 1 - bend ).addScaledVector( toS, bend ).normalize();
		const maxBend = 0.7;
		const ang = Math.acos( THREE.MathUtils.clamp( - d.dot( _z ), - 1, 1 ) );
		if ( ang > maxBend ) {
			// rotate -z towards d by at most maxBend
			_d.copy( _z ).negate();
			const axis = _s.crossVectors( _d, d ).normalize();
			d.copy( _d ).applyAxisAngle( axis, maxBend );
		}
		const E = this.elbow.copy( W ).addScaledVector( d, FORE_LEN );
		// the forearm bone: +z towards the wrist, +x along the hand's knuckle line
		const fz = _d.copy( d ).negate();
		const fx = _s.copy( _x ).addScaledVector( fz, - _x.dot( fz ) );
		if ( fx.lengthSq() < 1e-6 ) fx.set( 1, 0, 0 );
		fx.normalize();
		const fy = _b.crossVectors( fz, fx );
		const Fm = _m.makeBasis( fx, fy, fz ).setPosition( E );
		// the upper arm: from the shoulder side into the elbow (its length is fixed; the shoulder is off screen)
		const S = this.shoulder.copy( shoulder );
		const uz = _c.subVectors( E, S ).normalize();
		const ux = _x.copy( fx ).addScaledVector( uz, - fx.dot( uz ) );
		if ( ux.lengthSq() < 1e-6 ) ux.set( 1, 0, 0 );
		ux.normalize();
		const uy = _y.crossVectors( uz, ux );
		const Um = _m2.makeBasis( ux, uy, uz ).setPosition( _z.copy( E ).addScaledVector( uz, - UPPER_LEN ) );
		// to local transforms (the skinned mesh sits at the view origin)
		Um.decompose( this.upperBone.position, this.upperBone.quaternion, _s );
		_m3.copy( Um ).invert().multiply( Fm ).decompose( this.foreBone.position, this.foreBone.quaternion, _s );
		_m3.copy( Fm ).invert().multiply( hand ).decompose( this.wrist.position, this.wrist.quaternion, _s );
		this.wrist.scale.set( 1, 1, 1 );
	}

	set visible( v ) { this.root.visible = v; }
	get visible() { return this.root.visible; }

	dispose() {
		for ( const m of [ this.mSkin, this.mNail, this.mGlove, this.mCuff, this.mSleeve ] ) m.dispose();
		this.root.parent?.remove( this.root );
	}
}

// The wrist frame for a hand wrapped around a grip cylinder. grip: { p (on the axis), a (axis, pinky -> index),
// n (back of the hand), r, beta? } in some frame; the result is in the same frame. lift raises the hand off it.
const _gx = new THREE.Vector3(), _gy = new THREE.Vector3(), _gz = new THREE.Vector3(), _gp = new THREE.Vector3(), _ha = new THREE.Vector3(), _hb = new THREE.Vector3();
export function wristMatrix( grip, side, out = new THREE.Matrix4(), lift = 0 ) {
	const beta = grip.beta ?? GRIP_BETA;
	// the grip frame: X along the axis (towards the index finger on the right hand, the pinky on the left),
	// Y the back of the hand, Z the way the straight fingers would point
	_gx.copy( grip.a ).multiplyScalar( side );
	_gy.copy( grip.n ).addScaledVector( _gx, - grip.n.dot( _gx ) ).normalize();
	_gz.crossVectors( _gx, _gy );
	// the hand turns about Y so the knuckle line runs diagonally across the axis (the index knuckle rides over
	// it, the pinky's heel under it); its reference point (GRIP_Z on the hand's middle line, at the palm's skin)
	// sits on the axis, lifted off by `lift`
	const c = Math.cos( beta ), s = Math.sin( beta ) * side;
	_ha.copy( _gx ).multiplyScalar( c ).addScaledVector( _gz, - s ); // hand X
	_hb.copy( _gz ).multiplyScalar( c ).addScaledVector( _gx, s ); // hand Z
	const r = grip.r;
	// shift: how far towards the index finger the axis crosses the knuckle line (a support hand holds a handguard
	// nearer its thumb side)
	_gp.copy( grip.p )
		.addScaledVector( _gy, PALM_SKIN - ( grip.sink || 0 ) + r + lift * 0.05 )
		.addScaledVector( _hb, - GRIP_Z - ( grip.dz || 0 ) )
		.addScaledVector( _ha, - ( grip.shift || 0 ) * side );
	out.makeBasis( _ha, _gy, _hb ).setPosition( _gp );
	return out;
}
