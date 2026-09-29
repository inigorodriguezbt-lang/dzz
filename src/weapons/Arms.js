// First-person arms: upper arm, forearm (lathed with a little muscle), sleeves coloured from the worn top,
// and a hand rigged as a rigidly skinned mesh (palm + 5 fingers x 3 bones) so the fingers wrap around
// whatever they hold. The arm is solved with a 2-bone IK from a shoulder in view space to the wrist.
//
// Hand frame (the wrist bone): +X along the knuckle line (towards the index finger on the right hand,
// the mirror on the left), +Y out of the back of the hand, +Z along the fingers. A grip is a cylinder the
// fingers close around; curl( r ) gives joint angles for a grip of radius r.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../render/Materials.js';

export const PALM_LEN = 0.094; // wrist to middle knuckle
export const PALM_T = 0.027;
const FINGERS = [
	// x (right hand), z of the knuckle, segment lengths, radius
	{ x: 0.027, z: 0.092, len: [ 0.042, 0.025, 0.021 ], r: 0.0087 },
	{ x: 0.0085, z: 0.096, len: [ 0.046, 0.029, 0.022 ], r: 0.009 },
	{ x: - 0.0095, z: 0.092, len: [ 0.043, 0.027, 0.021 ], r: 0.0085 },
	{ x: - 0.026, z: 0.084, len: [ 0.034, 0.021, 0.019 ], r: 0.0075 },
];
const THUMB = { x: 0.03, y: - 0.009, z: 0.022, len: [ 0.044, 0.032, 0.027 ], r: 0.0105 };
export const UPPER_LEN = 0.3, FORE_LEN = 0.265;

// rest joint angles for a relaxed hand / a grip of radius r (fingers wrap a cylinder under the palm)
export function curlFor( r, tight = 1 ) {
	const out = [];
	for ( const f of FINGERS ) {
		const R = r + f.r * 1.1;
		out.push( [
			Math.min( 1.55, 0.72 * f.len[ 0 ] / R * tight + 0.1 ),
			Math.min( 1.6, 1.0 * f.len[ 1 ] / R * tight ),
			Math.min( 1.2, 0.85 * f.len[ 2 ] / R * tight ),
		] );
	}
	return out;
}

// geometry piece bound rigidly to one bone
function piece( geo, bone, color = [ 1, 1, 1 ] ) {
	let g = geo.index ? geo.toNonIndexed() : geo;
	for ( const k of Object.keys( g.attributes ) ) if ( ! [ 'position', 'normal' ].includes( k ) ) g.deleteAttribute( k );
	const n = g.attributes.position.count;
	const si = new Uint16Array( n * 4 ), sw = new Float32Array( n * 4 ), col = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) { si[ i * 4 ] = bone; sw[ i * 4 ] = 1; col[ i * 3 ] = color[ 0 ]; col[ i * 3 + 1 ] = color[ 1 ]; col[ i * 3 + 2 ] = color[ 2 ]; }
	g.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( si, 4 ) );
	g.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute( sw, 4 ) );
	g.setAttribute( 'color', new THREE.Float32BufferAttribute( col, 3 ) );
	return g;
}

// a capsule along +Z from 0 to len (in the bone's frame)
function segment( len, r0, r1 = r0 ) {
	const g = new THREE.CapsuleGeometry( ( r0 + r1 ) / 2, Math.max( 0.001, len - ( r0 + r1 ) / 2 ), 3, 9 );
	// taper: scale the x/z radius along the length
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {
		const y = p.getY( i ) / len + 0.5;
		const k = ( r0 + ( r1 - r0 ) * Math.min( 1, Math.max( 0, y ) ) ) / ( ( r0 + r1 ) / 2 );
		p.setX( i, p.getX( i ) * k * 1.05 ); p.setZ( i, p.getZ( i ) * k * 0.92 );
	}
	g.computeVertexNormals();
	g.rotateX( Math.PI / 2 );
	g.translate( 0, 0, len / 2 );
	return g;
}

// the rigged hand geometry for one side (1 right, -1 left), in the bind pose
function handGeometry( side ) {
	const parts = [];
	// palm: a rounded slab, wider at the knuckles, and the thenar pad under the thumb
	const palm = new RoundedBoxGeometry( 0.082, PALM_T, 0.098, 2, 0.011 );
	const pp = palm.attributes.position;
	for ( let i = 0; i < pp.count; i ++ ) {
		const z = pp.getZ( i ) + 0.049, k = 0.8 + 0.2 * Math.min( 1, z / 0.07 );
		pp.setX( i, pp.getX( i ) * k );
		// the palm is thicker at the heel of the hand
		if ( pp.getY( i ) < 0 ) pp.setY( i, pp.getY( i ) * ( 1.25 - 0.3 * z / 0.098 ) );
	}
	palm.computeVertexNormals();
	palm.translate( 0, 0, 0.047 );
	parts.push( piece( palm, 0 ) );
	const thenar = new THREE.SphereGeometry( 0.019, 10, 8 );
	thenar.scale( 0.9, 0.55, 1.25 ); thenar.translate( 0.018, - 0.011, 0.03 );
	parts.push( piece( thenar, 0 ) );
	// wrist: an oval stub reaching back into the forearm
	const wrist = new THREE.CylinderGeometry( 0.024, 0.026, 0.05, 12, 1 );
	wrist.scale( 1.3, 1, 0.78 ); wrist.rotateX( Math.PI / 2 ); wrist.translate( 0, - 0.002, - 0.012 );
	parts.push( piece( wrist, 0 ) );
	// fingers: bones 1..12 (3 per finger), thumb 13..15
	let b = 1;
	for ( const f of FINGERS ) {
		for ( let s = 0; s < 3; s ++ ) {
			const r0 = f.r * ( 1 - s * 0.08 ), r1 = f.r * ( 0.92 - s * 0.08 );
			parts.push( piece( segment( f.len[ s ], r0, r1 ), b ) );
			if ( s === 2 ) {
				// the nail
				const nail = new RoundedBoxGeometry( r1 * 1.3, 0.0022, f.len[ 2 ] * 0.55, 1, 0.001 );
				nail.translate( 0, r1 * 0.78, f.len[ 2 ] * 0.58 );
				parts.push( piece( nail, b, [ 1.12, 0.95, 0.92 ] ) );
			}
			b ++;
		}
	}
	for ( let s = 0; s < 3; s ++ ) {
		const r0 = THUMB.r * ( 1 - s * 0.07 ), r1 = THUMB.r * ( 0.9 - s * 0.07 );
		parts.push( piece( segment( THUMB.len[ s ], r0, r1 ), b ) );
		if ( s === 2 ) { const nail = new RoundedBoxGeometry( r1 * 1.3, 0.0022, THUMB.len[ 2 ] * 0.5, 1, 0.001 ); nail.translate( 0, r1 * 0.8, THUMB.len[ 2 ] * 0.6 ); parts.push( piece( nail, b, [ 1.12, 0.95, 0.92 ] ) ); }
		b ++;
	}
	let geo = mergeGeometries( parts, false );
	if ( side < 0 ) {
		// mirror across X and flip the winding so the left hand faces out
		const p = geo.attributes.position, n = geo.attributes.normal;
		for ( let i = 0; i < p.count; i ++ ) { p.setX( i, - p.getX( i ) ); n.setX( i, - n.getX( i ) ); }
		const flip = ( a ) => { const s = a.itemSize, arr = a.array; for ( let i = 0; i < a.count; i += 3 ) for ( let k = 0; k < s; k ++ ) { const t = arr[ ( i + 1 ) * s + k ]; arr[ ( i + 1 ) * s + k ] = arr[ ( i + 2 ) * s + k ]; arr[ ( i + 2 ) * s + k ] = t; } };
		for ( const k of Object.keys( geo.attributes ) ) flip( geo.attributes[ k ] );
	}
	geo.computeBoundingSphere();
	return geo;
}

// a lathed limb along +Y from 0 to 1 (scaled to length): profile [ [ y, r ], ... ]
function limbGeometry( prof, flat = 0.82 ) {
	const pts = prof.map( ( [ y, r ] ) => new THREE.Vector2( r, y ) );
	const g = new THREE.LatheGeometry( pts, 14 );
	g.scale( 1, 1, flat );
	return g;
}
// profiles run from the joint nearer the body (y = 0) to the far one (y = 1)
const FORE_PROF = [ [ - 0.05, 0.0 ], [ - 0.05, 0.032 ], [ 0.06, 0.036 ], [ 0.28, 0.038 ], [ 0.55, 0.032 ], [ 0.85, 0.026 ], [ 1.0, 0.0235 ], [ 1.02, 0.0 ] ];
const UPPER_PROF = [ [ - 0.05, 0.0 ], [ - 0.05, 0.05 ], [ 0.15, 0.051 ], [ 0.5, 0.046 ], [ 0.85, 0.039 ], [ 1.0, 0.035 ], [ 1.04, 0.0 ] ];
const SLEEVE_F_PROF = [ [ - 0.05, 0 ], [ - 0.05, 0.043 ], [ 0.3, 0.045 ], [ 0.6, 0.04 ], [ 0.9, 0.035 ], [ 0.97, 0.037 ], [ 0.985, 0.0 ] ];

let MATS = null;
function materials() {
	if ( MATS ) return MATS;
	const view = ( m, key ) => { m.defines = { NO_ATMOS_FOG: '' }; return patchMaterial( m, key, null, { noCloudShadow: true } ); };
	MATS = {
		skin: view( new THREE.MeshStandardMaterial( { color: 0xc48a66, roughness: 0.55, metalness: 0, vertexColors: true } ), 'arms-view' ),
		skinLimb: view( new THREE.MeshStandardMaterial( { color: 0xc48a66, roughness: 0.6, metalness: 0 } ), 'arms-view' ),
	};
	return MATS;
}

// fabric with a weave that reads in close-up (a small normal-ish bump from a canvas)
let WEAVE = null;
function weave() {
	if ( WEAVE || typeof document === 'undefined' ) return WEAVE;
	const c = document.createElement( 'canvas' ); c.width = c.height = 64;
	const g = c.getContext( '2d' );
	g.fillStyle = '#808080'; g.fillRect( 0, 0, 64, 64 );
	for ( let y = 0; y < 64; y += 2 ) for ( let x = 0; x < 64; x += 2 ) { const v = ( ( x + y ) & 2 ) ? 150 : 100; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect( x, y, 2, 2 ); }
	WEAVE = new THREE.CanvasTexture( c );
	WEAVE.wrapS = WEAVE.wrapT = THREE.RepeatWrapping;
	WEAVE.repeat.set( 18, 18 );
	return WEAVE;
}
function fabricMat( color, rough = 0.92 ) {
	const m = new THREE.MeshStandardMaterial( { color, roughness: rough, metalness: 0 } );
	const w = weave();
	if ( w ) { m.bumpMap = w; m.bumpScale = 0.4; }
	m.defines = { NO_ATMOS_FOG: '' };
	return patchMaterial( m, 'arms-view', null, { noCloudShadow: true } );
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

export class Arm {
	constructor( side = 1 ) {
		this.side = side;
		const M = materials();
		this.root = new THREE.Group();
		this.root.name = side > 0 ? 'armR' : 'armL';
		// the rig
		this.bones = [];
		const wrist = new THREE.Bone(); this.bones.push( wrist );
		this.fingers = [];
		for ( const f of FINGERS ) {
			const chain = [];
			let parent = wrist, px = f.x * side, pz = f.z;
			for ( let s = 0; s < 3; s ++ ) {
				const b = new THREE.Bone();
				b.position.set( s === 0 ? px : 0, 0, s === 0 ? pz : f.len[ s - 1 ] );
				parent.add( b ); this.bones.push( b ); chain.push( b ); parent = b;
			}
			this.fingers.push( chain );
		}
		const thumb = [];
		{
			let parent = wrist;
			for ( let s = 0; s < 3; s ++ ) {
				const b = new THREE.Bone();
				if ( s === 0 ) b.position.set( THUMB.x * side, THUMB.y, THUMB.z ); else b.position.set( 0, 0, THUMB.len[ s - 1 ] );
				parent.add( b ); this.bones.push( b ); thumb.push( b ); parent = b;
			}
		}
		this.thumb = thumb;
		this.hand = new THREE.SkinnedMesh( handGeometry( side ), M.skin );
		this.hand.add( wrist );
		this.hand.bind( new THREE.Skeleton( this.bones ) );
		this.hand.frustumCulled = false;
		this.wrist = wrist;
		// limbs
		this.fore = new THREE.Mesh( limbGeometry( FORE_PROF ), M.skinLimb );
		this.upper = new THREE.Mesh( limbGeometry( UPPER_PROF ), M.skinLimb );
		this.sleeveU = new THREE.Mesh( limbGeometry( UPPER_PROF.map( ( [ y, r ] ) => [ y, r ? r + 0.007 : 0 ] ) ), fabricMat( 0x888888 ) );
		this.sleeveF = new THREE.Mesh( limbGeometry( SLEEVE_F_PROF ), this.sleeveU.material );
		this.glove = null; // glove material when worn
		for ( const m of [ this.hand, this.fore, this.upper, this.sleeveU, this.sleeveF ] ) { m.frustumCulled = false; this.root.add( m ); }
		this.sleeveF.visible = false;
		this.shoulder = new THREE.Vector3();
		this.elbow = new THREE.Vector3();
		this.pole = new THREE.Vector3( side * 0.7, - 1, 0.35 ).normalize();
		this.setCurl( curlFor( 0.03, 0.4 ) );
	}

	// clothing: { skin, sleeve (colour | null = bare), long (sleeves to the wrist), glove (colour | null) }
	style( o ) {
		const M = materials();
		if ( o.skin != null ) { M.skin.color.set( o.skin ); M.skinLimb.color.set( o.skin ); }
		const hasSleeve = o.sleeve != null;
		if ( hasSleeve ) this.sleeveU.material.color.set( o.sleeve );
		this.sleeveU.visible = hasSleeve;
		this.sleeveF.visible = hasSleeve && !! o.long;
		this.fore.visible = ! ( hasSleeve && o.long );
		if ( o.glove != null ) {
			if ( ! this.glove ) { this.glove = new THREE.MeshStandardMaterial( { color: o.glove, roughness: 0.8, metalness: 0 } ); this.glove.defines = { NO_ATMOS_FOG: '' }; patchMaterial( this.glove, 'arms-view', null, { noCloudShadow: true } ); }
			this.glove.color.set( o.glove );
			this.hand.material = this.glove;
		} else this.hand.material = M.skin;
	}

	// joint angles: curl = [ [ a0, a1, a2 ] x 4 ] (index, middle, ring, pinky), thumb = [ spread, flex0, flex1, flex2 ]
	setCurl( curl, thumb = [ 0.5, 0.3, 0.35, 0.3 ], splay = 0 ) {
		for ( let f = 0; f < 4; f ++ ) {
			const c = curl[ f ], ch = this.fingers[ f ];
			for ( let s = 0; s < 3; s ++ ) ch[ s ].rotation.set( c[ s ], s === 0 ? ( 1.5 - f ) * 0.05 * splay * this.side : 0, 0 );
		}
		const t = this.thumb;
		// the thumb's base swings out towards the index side and down into the palm
		t[ 0 ].rotation.set( 0.35 + thumb[ 1 ], ( 0.55 + thumb[ 0 ] ) * this.side, 0.6 * this.side, 'YXZ' );
		t[ 1 ].rotation.set( thumb[ 2 ], 0, 0 );
		t[ 2 ].rotation.set( thumb[ 3 ], 0, 0 );
	}

	// place the hand (wrist frame matrix in view space) and solve the arm from the shoulder
	pose( shoulder, handMatrix ) {
		this.wrist.matrixAutoUpdate = true;
		handMatrix.decompose( this.wrist.position, this.wrist.quaternion, _c );
		this.wrist.scale.set( 1, 1, 1 );
		const W = _a.setFromMatrixPosition( handMatrix );
		const S = this.shoulder.copy( shoulder );
		// out of reach: let the shoulder come forward rather than tear the wrist off
		const reach = ( UPPER_LEN + FORE_LEN ) * 0.985;
		let d = S.distanceTo( W );
		if ( d > reach ) { _b.subVectors( W, S ).normalize(); S.addScaledVector( _b, d - reach ); d = reach; }
		d = Math.max( d, Math.abs( UPPER_LEN - FORE_LEN ) + 0.02 );
		const dir = _b.subVectors( W, S ).normalize();
		const a = ( UPPER_LEN * UPPER_LEN - FORE_LEN * FORE_LEN + d * d ) / ( 2 * d );
		const h = Math.sqrt( Math.max( 0, UPPER_LEN * UPPER_LEN - a * a ) );
		const pole = _c.copy( this.pole ).addScaledVector( dir, - this.pole.dot( dir ) ).normalize();
		const E = this.elbow.copy( S ).addScaledVector( dir, a ).addScaledVector( pole, h );
		// hand's knuckle line: the forearm's flat side follows it (pronation)
		_x.set( 1, 0, 0 ).applyQuaternion( this.wrist.quaternion );
		this._limb( this.fore, E, W, _x, FORE_LEN );
		this._limb( this.sleeveF, E, W, _x, FORE_LEN );
		this._limb( this.upper, S, E, _x, UPPER_LEN );
		this._limb( this.sleeveU, S, E, _x, UPPER_LEN );
	}

	_limb( mesh, A, B, flatAxis, len ) {
		_y.subVectors( B, A );
		const L = _y.length();
		_y.divideScalar( L || 1 );
		_x.copy( flatAxis ).addScaledVector( _y, - flatAxis.dot( _y ) );
		if ( _x.lengthSq() < 1e-6 ) _x.set( 1, 0, 0 ).addScaledVector( _y, - _y.x );
		_x.normalize();
		_z.crossVectors( _x, _y );
		_m.makeBasis( _x, _y, _z );
		mesh.quaternion.setFromRotationMatrix( _m );
		mesh.position.copy( A );
		mesh.scale.set( 1, L, 1 );
	}

	set visible( v ) { this.root.visible = v; }
	get visible() { return this.root.visible; }
}

// the wrist frame for a hand wrapped around a grip cylinder.
// grip: { p (centre on the axis), a (axis, pinky -> index), n (back of the hand), r } in some frame; the result is
// in the same frame. `slide` moves the hand along the axis, `lift` lifts it off the grip (0..1).
const _gx = new THREE.Vector3(), _gy = new THREE.Vector3(), _gz = new THREE.Vector3(), _gp = new THREE.Vector3();
export function wristMatrix( grip, side, out = new THREE.Matrix4(), lift = 0 ) {
	// X is the knuckle line pointing at the index finger on the right hand, at the pinky on the left
	_gx.copy( grip.a ).multiplyScalar( side );
	_gy.copy( grip.n ).addScaledVector( _gx, - grip.n.dot( _gx ) ).normalize();
	_gz.crossVectors( _gx, _gy );
	// the axis runs under the proximal finger bones, a little behind the knuckles, a palm-half + r below the back
	const r = grip.r;
	_gp.copy( grip.p )
		.addScaledVector( _gy, PALM_T * 0.5 + r + lift * 0.05 )
		.addScaledVector( _gz, - ( PALM_LEN - 0.006 - Math.min( 0.012, r * 0.35 ) ) );
	out.makeBasis( _gx, _gy, _gz ).setPosition( _gp );
	return out;
}
