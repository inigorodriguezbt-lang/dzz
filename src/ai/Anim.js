// Skeletal animation for the Rocketbox characters: a clip bank of retargeted motion capture
// (public/models/characters/anims.bin, packed by src/ai/tools/rb_pack_anims.py), a weighted blender and
// a rig that layers procedural motion on top in character space (hunch, head look, reaching arms,
// swipes, hit reactions, crawling, ragdoll) — all without per-frame allocations.
//
// Character space = the avatar's armature node frame (y up, centimetres). Every bone's pose is a local
// quaternion; the rig runs forward kinematics over the 22 animated bones so a rotation expressed in
// character space can be applied to any bone and its children follow.
import * as THREE from 'three';
// (Math.hypot boxes its arguments in V8: garbage on hot paths)
const hyp3 = ( a, b, c ) => Math.sqrt( a * a + b * b + c * c );
const hyp4 = ( a, b, c, d ) => Math.sqrt( a * a + b * b + c * c + d * d );

export class ClipBank {
	static async load( url ) {
		const res = await fetch( url );
		if ( ! res.ok ) throw new Error( `${url}: HTTP ${res.status}` );
		return new ClipBank( await res.arrayBuffer() );
	}

	constructor( buf ) {
		const n = new DataView( buf ).getUint32( 0, true );
		const h = JSON.parse( new TextDecoder().decode( new Uint8Array( buf, 4, n ) ) );
		this.bones = h.bones;
		this.B = h.bones.length;
		this.index = new Map( h.bones.map( ( b, i ) => [ b, i ] ) );
		this.clips = new Map();
		const base = 4 + n;
		for ( const c of h.clips ) {
			const nq = c.frames * this.B * 4;
			const qi = new Int16Array( buf, base + c.offset, nq );
			const q = new Float32Array( nq );
			for ( let i = 0; i < nq; i ++ ) q[ i ] = qi[ i ] / 32767;
			const p = new Float32Array( buf.slice( base + c.offset + nq * 2, base + c.offset + nq * 2 + c.frames * 12 ) );
			this.clips.set( c.name, { name: c.name, frames: c.frames, fps: c.fps, dur: c.frames / c.fps, speed: c.speed, loop: c.loop, q, p } );
		}
	}
	get( name ) { return this.clips.get( name ); }
}

// ---- small quaternion helpers on flat arrays (x, y, z, w) -----------------------------------------------

function qmul( a, ai, b, bi, o, oi ) {
	const ax = a[ ai ], ay = a[ ai + 1 ], az = a[ ai + 2 ], aw = a[ ai + 3 ];
	const bx = b[ bi ], by = b[ bi + 1 ], bz = b[ bi + 2 ], bw = b[ bi + 3 ];
	o[ oi ] = ax * bw + aw * bx + ay * bz - az * by;
	o[ oi + 1 ] = ay * bw + aw * by + az * bx - ax * bz;
	o[ oi + 2 ] = az * bw + aw * bz + ax * by - ay * bx;
	o[ oi + 3 ] = aw * bw - ax * bx - ay * by - az * bz;
}
// o = conj(a) * b
function qcmul( a, ai, b, bi, o, oi ) {
	const ax = - a[ ai ], ay = - a[ ai + 1 ], az = - a[ ai + 2 ], aw = a[ ai + 3 ];
	const bx = b[ bi ], by = b[ bi + 1 ], bz = b[ bi + 2 ], bw = b[ bi + 3 ];
	o[ oi ] = ax * bw + aw * bx + ay * bz - az * by;
	o[ oi + 1 ] = ay * bw + aw * by + az * bx - ax * bz;
	o[ oi + 2 ] = az * bw + aw * bz + ax * by - ay * bx;
	o[ oi + 3 ] = aw * bw - ax * bx - ay * by - az * bz;
}
// rotate vector v by quaternion q (array at qi)
function qrot( q, qi, vx, vy, vz, out ) {
	const x = q[ qi ], y = q[ qi + 1 ], z = q[ qi + 2 ], w = q[ qi + 3 ];
	const tx = 2 * ( y * vz - z * vy ), ty = 2 * ( z * vx - x * vz ), tz = 2 * ( x * vy - y * vx );
	out.x = vx + w * tx + y * tz - z * ty;
	out.y = vy + w * ty + z * tx - x * tz;
	out.z = vz + w * tz + x * ty - y * tx;
	return out;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _qa = new Float32Array( 4 ), _qb = new Float32Array( 4 );

// Standard bone names (sanitised glTF node names) the rig and the hit zones use.
export const BONE = {
	pelvis: 'Bip01_Pelvis', spine: 'Bip01_Spine', spine1: 'Bip01_Spine1', spine2: 'Bip01_Spine2', neck: 'Bip01_Neck', head: 'Bip01_Head',
	lClav: 'Bip01_L_Clavicle', lUpper: 'Bip01_L_UpperArm', lFore: 'Bip01_L_Forearm', lHand: 'Bip01_L_Hand',
	rClav: 'Bip01_R_Clavicle', rUpper: 'Bip01_R_UpperArm', rFore: 'Bip01_R_Forearm', rHand: 'Bip01_R_Hand',
	lThigh: 'Bip01_L_Thigh', lCalf: 'Bip01_L_Calf', lFoot: 'Bip01_L_Foot', lToe: 'Bip01_L_Toe0',
	rThigh: 'Bip01_R_Thigh', rCalf: 'Bip01_R_Calf', rFoot: 'Bip01_R_Foot', rToe: 'Bip01_R_Toe0',
};

// Per-avatar-template rig data (bind pose analysis), shared by all instances of that avatar.
export class RigInfo {
	// bones: the template's bones by sanitised name; avatar: the armature node
	constructor( bank, bones, avatar ) {
		const B = bank.B;
		this.B = B;
		this.parent = new Int16Array( B );
		this.restPelvis = new THREE.Vector3();
		// bind world rotations in character space, the bones' "along" axes (to the child joint) in bone space
		this.bindW = new Float32Array( B * 4 );
		this.bindL = new Float32Array( B * 4 );
		this.axis = new Float32Array( B * 3 );
		this.bindPos = new Float32Array( B * 3 ); // character space (cm)
		avatar.updateMatrixWorld( true );
		const inv = new THREE.Matrix4().copy( avatar.matrixWorld ).invert();
		const m = new THREE.Matrix4();
		const pos = [], rot = [];
		for ( let i = 0; i < B; i ++ ) {
			const b = bones[ bank.bones[ i ] ];
			if ( ! b ) throw new Error( 'missing bone ' + bank.bones[ i ] );
			this.parent[ i ] = bank.index.has( b.parent?.name ) ? bank.index.get( b.parent.name ) : - 1;
			m.multiplyMatrices( inv, b.matrixWorld );
			const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
			m.decompose( p, q, s );
			pos.push( p ); rot.push( q );
			q.toArray( this.bindW, i * 4 );
			b.quaternion.toArray( this.bindL, i * 4 );
			p.toArray( this.bindPos, i * 3 );
		}
		this.restPelvis.copy( bones[ BONE.pelvis ].position );
		// the pelvis' parent (Bip01) frame in character space: pelvis offsets are stored in that frame
		{
			const pi = bank.index.get( BONE.pelvis ) * 4;
			const w = new THREE.Quaternion( this.bindW[ pi ], this.bindW[ pi + 1 ], this.bindW[ pi + 2 ], this.bindW[ pi + 3 ] );
			const l = new THREE.Quaternion( this.bindL[ pi ], this.bindL[ pi + 1 ], this.bindL[ pi + 2 ], this.bindL[ pi + 3 ] );
			this.pelvisParent = w.multiply( l.invert() ); // character space <- Bip01 local
			this.pelvisParentInv = this.pelvisParent.clone().invert();
			// Bip01's origin in character space: pelvis = bip01Pos + pelvisParent * pelvisLocal
			const bp = new THREE.Vector3().fromArray( this.bindPos, pi / 4 * 3 );
			this.bip01Pos = bp.sub( this.restPelvis.clone().applyQuaternion( this.pelvisParent ) );
		}
		const I = ( k ) => bank.index.get( BONE[ k ] );
		// the joint each bone points at
		const child = {
			pelvis: 'spine', spine: 'spine1', spine1: 'spine2', spine2: 'neck', neck: 'head', lClav: 'lUpper', lUpper: 'lFore', lFore: 'lHand',
			rClav: 'rUpper', rUpper: 'rFore', rFore: 'rHand', lThigh: 'lCalf', lCalf: 'lFoot', lFoot: 'lToe', rThigh: 'rCalf', rCalf: 'rFoot', rFoot: 'rToe',
		};
		for ( const k in BONE ) {
			const i = I( k );
			let d;
			if ( child[ k ] ) d = pos[ I( child[ k ] ) ].clone().sub( pos[ i ] );
			else if ( k === 'head' ) d = pos[ i ].clone().sub( pos[ I( 'neck' ) ] );
			else if ( k === 'lHand' || k === 'rHand' ) d = pos[ i ].clone().sub( pos[ I( k === 'lHand' ? 'lFore' : 'rFore' ) ] );
			else d = pos[ i ].clone().sub( pos[ this.parent[ i ] ] );
			d.normalize().applyQuaternion( rot[ i ].clone().invert() );
			d.toArray( this.axis, i * 3 );
		}
		this.idx = {};
		for ( const k in BONE ) this.idx[ k ] = I( k );
		// character frame: up +y; forward from the head towards the eyes
		const head = pos[ I( 'head' ) ];
		const le = bones.Bip01_LEye, re = bones.Bip01_REye;
		const eyes = new THREE.Vector3();
		if ( le && re ) {
			eyes.setFromMatrixPosition( m.multiplyMatrices( inv, le.matrixWorld ) ).add( _v.setFromMatrixPosition( m.multiplyMatrices( inv, re.matrixWorld ) ) ).multiplyScalar( 0.5 );
		} else eyes.copy( head ).add( new THREE.Vector3( 10, 0, 0 ) );
		this.fwd = eyes.clone().sub( head ); this.fwd.y = 0; this.fwd.normalize();
		this.up = new THREE.Vector3( 0, 1, 0 );
		this.right = new THREE.Vector3().crossVectors( this.fwd, this.up ).normalize();
		// left / right as the character sees them (bone L is on its left)
		const lx = pos[ I( 'lUpper' ) ].dot( this.right ) - pos[ I( 'rUpper' ) ].dot( this.right );
		this.mirror = lx > 0 ? - 1 : 1; // +1: bone "L" is on the character's left (-right)
		this.hip = avatar.position.y; // metres: armature origin above the feet
		// the jaw opens about the character's right axis expressed in the head's frame
		const hi = I( 'head' ) * 4;
		this.jawAxis = bones.Bip01_MJaw ? this.right.clone().applyQuaternion( new THREE.Quaternion( this.bindW[ hi ], this.bindW[ hi + 1 ], this.bindW[ hi + 2 ], this.bindW[ hi + 3 ] ).invert() ).normalize() : null;
	}
}

// Per-instance pose state.
export class Rig {
	constructor( bank, info, bones ) {
		this.bank = bank;
		this.info = info;
		const B = bank.B;
		this.bones = bank.bones.map( n => bones[ n ] );
		this.q = new Float32Array( B * 4 ); // blended local
		this.w = new Float32Array( B * 4 ); // character-space world after overlays
		this.p = new Float32Array( 3 );
		this.wsum = 0;
		// overlays: per bone a character-space rotation (identity = none) and an aim target
		this.ov = new Float32Array( B * 4 );
		this.hasOv = new Uint8Array( B );
		this.aim = new Float32Array( B * 4 ); // dir xyz (character space) + weight
		this.pelvisOff = new THREE.Vector3(); // extra pelvis offset (cm, Bip01 frame; see offsetPelvis)
		this.pelvisAbs = null; // Vector3: absolute pelvis position (character space, cm) overriding the blend
		this.absW = new Float32Array( B * 4 ); // absolute character-space world rotations (ragdoll)
		this.hasAbs = new Uint8Array( B );
		this.pelvisScale = 1;
		this.jaw = bones.Bip01_MJaw || null;
		this.jawRest = this.jaw ? this.jaw.quaternion.clone() : null;
		this.jawOpen = 0;
		for ( const b of this.bones ) b.matrixAutoUpdate = false;
		this.clearOverlays();
	}

	begin() { this.q.fill( 0 ); this.p.fill( 0 ); this.wsum = 0; }

	// add a clip sampled at time t (s) with weight w
	add( clip, t, w ) {
		if ( ! clip || w <= 1e-3 ) return;
		const B = this.bank.B, q = this.q, cq = clip.q, cp = clip.p;
		let f = t * clip.fps;
		const n = clip.frames;
		if ( clip.loop ) { f %= n; if ( f < 0 ) f += n; } else f = Math.min( Math.max( f, 0 ), n - 1.001 );
		const i0 = Math.floor( f ), a = f - i0;
		const i1 = clip.loop ? ( i0 + 1 ) % n : Math.min( i0 + 1, n - 1 );
		const o0 = i0 * B * 4, o1 = i1 * B * 4;
		for ( let b = 0; b < B; b ++ ) {
			const k = b * 4;
			let x0 = cq[ o0 + k ], y0 = cq[ o0 + k + 1 ], z0 = cq[ o0 + k + 2 ], w0 = cq[ o0 + k + 3 ];
			let x1 = cq[ o1 + k ], y1 = cq[ o1 + k + 1 ], z1 = cq[ o1 + k + 2 ], w1 = cq[ o1 + k + 3 ];
			if ( x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0 ) { x1 = - x1; y1 = - y1; z1 = - z1; w1 = - w1; }
			let x = x0 + ( x1 - x0 ) * a, y = y0 + ( y1 - y0 ) * a, z = z0 + ( z1 - z0 ) * a, ww = w0 + ( w1 - w0 ) * a;
			// keep the accumulator in one hemisphere
			if ( q[ k ] * x + q[ k + 1 ] * y + q[ k + 2 ] * z + q[ k + 3 ] * ww < 0 ) { x = - x; y = - y; z = - z; ww = - ww; }
			q[ k ] += x * w; q[ k + 1 ] += y * w; q[ k + 2 ] += z * w; q[ k + 3 ] += ww * w;
		}
		const p0 = i0 * 3, p1 = i1 * 3;
		this.p[ 0 ] += ( cp[ p0 ] + ( cp[ p1 ] - cp[ p0 ] ) * a ) * w;
		this.p[ 1 ] += ( cp[ p0 + 1 ] + ( cp[ p1 + 1 ] - cp[ p0 + 1 ] ) * a ) * w;
		this.p[ 2 ] += ( cp[ p0 + 2 ] + ( cp[ p1 + 2 ] - cp[ p0 + 2 ] ) * a ) * w;
		this.wsum += w;
	}

	// a static pose (the bind pose) as a layer: used by the ragdoll and as a fallback
	addBind( w ) {
		const B = this.bank.B, q = this.q, r = this.info.bindL;
		for ( let b = 0; b < B * 4; b += 4 ) {
			let s = q[ b ] * r[ b ] + q[ b + 1 ] * r[ b + 1 ] + q[ b + 2 ] * r[ b + 2 ] + q[ b + 3 ] * r[ b + 3 ] < 0 ? - w : w;
			q[ b ] += r[ b ] * s; q[ b + 1 ] += r[ b + 1 ] * s; q[ b + 2 ] += r[ b + 2 ] * s; q[ b + 3 ] += r[ b + 3 ] * s;
		}
		this.wsum += w;
	}

	clearOverlays() {
		const ov = this.ov;
		for ( let i = 0; i < ov.length; i += 4 ) { ov[ i ] = 0; ov[ i + 1 ] = 0; ov[ i + 2 ] = 0; ov[ i + 3 ] = 1; }
		this.hasOv.fill( 0 );
		this.aim.fill( 0 );
		this.pelvisOff.set( 0, 0, 0 );
		this.pelvisAbs = null;
		this.hasAbs.fill( 0 );
		this.jawOpen = 0;
	}

	// a character-space offset of the pelvis (cm), converted into the frame the pelvis position lives in
	offsetPelvis( x, y, z ) {
		_v.set( x, y, z ).applyQuaternion( this.info.pelvisParentInv );
		this.pelvisOff.add( _v );
	}

	// set bone k's character-space world rotation outright (ignores the blend and its parent)
	setWorld( k, x, y, z, w ) {
		const i = this.info.idx[ k ];
		const a = this.absW;
		a[ i * 4 ] = x; a[ i * 4 + 1 ] = y; a[ i * 4 + 2 ] = z; a[ i * 4 + 3 ] = w;
		this.hasAbs[ i ] = 1;
	}

	// blend a stored pose (see snapshot) like a clip
	addPose( pose, w ) {
		if ( ! pose || w <= 1e-3 ) return;
		const B = this.bank.B, q = this.q, r = pose.q;
		for ( let b = 0; b < B * 4; b += 4 ) {
			const s = q[ b ] * r[ b ] + q[ b + 1 ] * r[ b + 1 ] + q[ b + 2 ] * r[ b + 2 ] + q[ b + 3 ] * r[ b + 3 ] < 0 ? - w : w;
			q[ b ] += r[ b ] * s; q[ b + 1 ] += r[ b + 1 ] * s; q[ b + 2 ] += r[ b + 2 ] * s; q[ b + 3 ] += r[ b + 3 ] * s;
		}
		this.p[ 0 ] += pose.p[ 0 ] * w; this.p[ 1 ] += pose.p[ 1 ] * w; this.p[ 2 ] += pose.p[ 2 ] * w;
		this.wsum += w;
	}

	// the final local pose of the last end() (bones' quaternions and the pelvis offset from rest)
	snapshot( out = { q: new Float32Array( this.bank.B * 4 ), p: new Float32Array( 3 ) } ) {
		const bones = this.bones;
		for ( let i = 0; i < bones.length; i ++ ) {
			const b = bones[ i ].quaternion;
			out.q[ i * 4 ] = b.x; out.q[ i * 4 + 1 ] = b.y; out.q[ i * 4 + 2 ] = b.z; out.q[ i * 4 + 3 ] = b.w;
		}
		const pel = bones[ this.info.idx.pelvis ].position, rp = this.info.restPelvis, s = this.pelvisScale || 1;
		out.p[ 0 ] = ( pel.x - rp.x ) / s; out.p[ 1 ] = ( pel.y - rp.y ) / s; out.p[ 2 ] = ( pel.z - rp.z ) / s;
		return out;
	}

	// rotate bone k by angle about a character-space axis (accumulates)
	rotate( k, ax, ay, az, angle ) {
		if ( Math.abs( angle ) < 1e-5 ) return;
		const i = this.info.idx[ k ];
		const s = Math.sin( angle / 2 ), c = Math.cos( angle / 2 );
		_qa[ 0 ] = ax * s; _qa[ 1 ] = ay * s; _qa[ 2 ] = az * s; _qa[ 3 ] = c;
		qmul( _qa, 0, this.ov, i * 4, this.ov, i * 4 );
		this.hasOv[ i ] = 1;
	}
	// convenience in the character frame: pitch (+ = bend forward), yaw (+ = turn left), roll (+ = lean right)
	bend( k, pitch = 0, yaw = 0, roll = 0 ) {
		const I = this.info;
		if ( pitch ) this.rotate( k, I.right.x, I.right.y, I.right.z, - pitch );
		if ( yaw ) this.rotate( k, 0, 1, 0, yaw );
		if ( roll ) this.rotate( k, I.fwd.x, I.fwd.y, I.fwd.z, roll );
	}
	// point bone k's axis towards a character-space direction with weight w (0..1)
	aimAt( k, dx, dy, dz, w ) {
		const i = this.info.idx[ k ] * 4;
		const l = hyp3( dx, dy, dz ) || 1;
		this.aim[ i ] = dx / l; this.aim[ i + 1 ] = dy / l; this.aim[ i + 2 ] = dz / l; this.aim[ i + 3 ] = Math.min( 1, w );
		this.hasOv[ i / 4 ] = 1;
	}

	// normalise the blend, run FK with the overlays and write the bones
	end() {
		const B = this.bank.B, q = this.q, W = this.w, info = this.info, par = info.parent, ov = this.ov, aim = this.aim;
		if ( this.wsum <= 1e-4 ) { q.set( info.bindL ); this.p.fill( 0 ); this.wsum = 1; }
		for ( let k = 0; k < B * 4; k += 4 ) {
			const l = hyp4( q[ k ], q[ k + 1 ], q[ k + 2 ], q[ k + 3 ] ) || 1;
			q[ k ] /= l; q[ k + 1 ] /= l; q[ k + 2 ] /= l; q[ k + 3 ] /= l;
		}
		const ws = 1 / this.wsum;
		// bones are stored parent-first (the pack order), so one pass does FK
		for ( let i = 0; i < B; i ++ ) {
			const k = i * 4, p = par[ i ];
			if ( this.hasAbs[ i ] ) {
				const A = this.absW;
				W[ k ] = A[ k ]; W[ k + 1 ] = A[ k + 1 ]; W[ k + 2 ] = A[ k + 2 ]; W[ k + 3 ] = A[ k + 3 ];
			} else if ( p >= 0 ) qmul( W, p * 4, q, k, W, k ); else { W[ k ] = q[ k ]; W[ k + 1 ] = q[ k + 1 ]; W[ k + 2 ] = q[ k + 2 ]; W[ k + 3 ] = q[ k + 3 ]; }
			if ( ! this.hasOv[ i ] && ! this.hasAbs[ i ] ) continue;
			// character-space rotation
			qmul( ov, k, W, k, W, k );
			// aim: rotate so the bone axis points at the target direction
			const aw = aim[ k + 3 ];
			if ( aw > 0 ) {
				qrot( W, k, info.axis[ i * 3 ], info.axis[ i * 3 + 1 ], info.axis[ i * 3 + 2 ], _v );
				_v2.set( aim[ k ], aim[ k + 1 ], aim[ k + 2 ] );
				_q.setFromUnitVectors( _v, _v2 );
				if ( aw < 1 ) _q.slerp( _q2.identity(), 1 - aw );
				_qa[ 0 ] = _q.x; _qa[ 1 ] = _q.y; _qa[ 2 ] = _q.z; _qa[ 3 ] = _q.w;
				qmul( _qa, 0, W, k, W, k );
			}
			// back to local
			if ( p >= 0 ) qcmul( W, p * 4, W, k, q, k ); else { q[ k ] = W[ k ]; q[ k + 1 ] = W[ k + 1 ]; q[ k + 2 ] = W[ k + 2 ]; q[ k + 3 ] = W[ k + 3 ]; }
		}
		const bones = this.bones;
		for ( let i = 0; i < B; i ++ ) {
			const b = bones[ i ], k = i * 4;
			b.quaternion.set( q[ k ], q[ k + 1 ], q[ k + 2 ], q[ k + 3 ] );
		}
		const pel = bones[ info.idx.pelvis ], s = this.pelvisScale;
		if ( this.pelvisAbs ) {
			// absolute character-space position -> Bip01 local
			_v.copy( this.pelvisAbs ).sub( info.bip01Pos ).applyQuaternion( info.pelvisParentInv );
			pel.position.copy( _v );
		} else pel.position.set( info.restPelvis.x + this.p[ 0 ] * ws * s + this.pelvisOff.x, info.restPelvis.y + this.p[ 1 ] * ws * s + this.pelvisOff.y, info.restPelvis.z + this.p[ 2 ] * ws * s + this.pelvisOff.z );
		for ( let i = 0; i < B; i ++ ) bones[ i ].updateMatrix();
		if ( this.jaw ) {
			// open about the head's sideways axis (a head-local rotation of the jaw joint)
			if ( this.jawOpen > 0.01 && info.jawAxis ) this.jaw.quaternion.setFromAxisAngle( info.jawAxis, - this.jawOpen * 0.42 ).multiply( this.jawRest );
			else this.jaw.quaternion.copy( this.jawRest );
			this.jaw.updateMatrix();
		}
	}

	// world-space bone position (after the scene's matrix update)
	bonePos( k, out ) {
		return out.setFromMatrixPosition( this.bones[ this.info.idx[ k ] ].matrixWorld );
	}
}
