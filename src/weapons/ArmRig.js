// First-person arms cut from a Rocketbox avatar (Microsoft, MIT: public/models/characters/LICENSE-Rocketbox.md).
// The bare-armed swimsuit avatar gives an artist-modelled, painted arm and hand (knuckles, nails, veins, the thumb's
// ball, creases). Each arm (shoulder to fingertips) is cut out of the body mesh at load and re-rigged on the same
// 18-bone layout as the procedural arms in Arms.js (upper arm, forearm, wrist, 4 fingers x 3, thumb x 3), in the same
// hand frame, so the view model poses either one the same way:
//
//   hand frame (the wrist): +Z along the fingers, +Y out of the back of the hand, +X along the knuckle line towards
//   the index finger on the right hand (towards the pinky on the left)
//
// Fingers curl about their own flex axes by absolute joint angles (0 = straight in the palm's plane), the thumb's
// base bone is aimed by a THUMB_POSE (a direction and the nail's facing), and pose() puts the hand where it is asked
// and solves the forearm and the upper arm back to the shoulder.
//
// Clothes are built on the arm's own measured shape: a sleeve (long to the wrist, or short above the elbow) lofted
// round the arm a few millimetres off its skin with the worn top's colour / print, and gloves (the hand in a glove
// material pushed out a little along its normals, plus a cuff round the wrist).
//
// loadArmRig() -> Promise<{ make( side ) -> RigArm, metrics }> (the metrics feed Arms.js' grip solver)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { patchMaterial } from '../render/Materials.js';

const AVATAR = 'm_swim';
// relative to the game's page (the build runs from any sub-path); the dev preview pages live under /test/
const DIR = typeof location !== 'undefined' && location.pathname.includes( '/test/' ) ? '/models/characters/' : 'models/characters/';
// rig bone order (matches Arms.js): upper, forearm, wrist, index / middle / ring / pinky (3 each), thumb (3)
const CHAIN = [ 'UpperArm', 'Forearm', 'Hand', 'Finger1', 'Finger11', 'Finger12', 'Finger2', 'Finger21', 'Finger22', 'Finger3', 'Finger31', 'Finger32', 'Finger4', 'Finger41', 'Finger42', 'Finger0', 'Finger01', 'Finger02' ];
const B_UPPER = 0, B_FORE = 1, B_HAND = 2, B_FING = 3, B_THUMB = 15;

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _x = V(), _y = V(), _z = V(), _s = V();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const ONE = new THREE.Vector3( 1, 1, 1 );
// how far the forearm may leave the hand's resting line: sideways (radial / ulnar) and back / forward (extension /
// flexion)
const WRIST_DEV = 0.5, WRIST_FLEX = 1.15;
const smoothstep = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };

// an orthonormal frame from a forward axis (z) and a hint for x
function frame( pos, z, xHint, out = new THREE.Matrix4() ) {
	const Z = _z.copy( z ).normalize();
	const X = _x.copy( xHint ).addScaledVector( Z, - xHint.dot( Z ) );
	if ( X.lengthSq() < 1e-10 ) X.set( 1, 0, 0 ).addScaledVector( Z, - Z.x );
	X.normalize();
	const Y = _y.crossVectors( Z, X );
	return out.makeBasis( X, Y, Z ).setPosition( pos );
}
const signedAngle = ( a, b, axis ) => Math.atan2( _s.crossVectors( a, b ).dot( axis ), a.dot( b ) );

// ---- loading and measuring ------------------------------------------------------------------------------------------

let PROMISE = null;
// buffer: the avatar's GLB (Node tests); else it is fetched with its textures
export function loadArmRig( buffer = null ) {
	if ( buffer ) return build( buffer );
	return PROMISE ||= build( null ).catch( e => { PROMISE = null; throw e; } );
}

function loadTex( file, srgb ) {
	return new Promise( ( resolve ) => {
		new THREE.TextureLoader().load( DIR + file, t => {
			t.flipY = false; // glTF uv convention
			t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			t.anisotropy = 8;
			resolve( t );
		}, undefined, () => resolve( null ) );
	} );
}

async function build( buffer ) {
	const loader = new GLTFLoader();
	const gltf = buffer ? await new Promise( ( res, rej ) => loader.parse( buffer, '', res, rej ) ) : await loader.loadAsync( DIR + AVATAR + '.glb' );
	const [ col, nrm ] = typeof document === 'undefined' ? [ null, null ] : await Promise.all( [ loadTex( AVATAR + '_c.jpg', true ), loadTex( AVATAR + '_n.jpg', false ) ] );
	const root = gltf.scene;
	root.updateMatrixWorld( true );
	let mesh = null;
	const bones = {};
	root.traverse( o => {
		if ( o.isBone ) bones[ o.name ] = o;
		if ( o.isSkinnedMesh && ! ( o.name.startsWith( 'lod1' ) || o.parent?.name?.startsWith( 'lod1' ) ) && o.material?.name !== 'cards' ) mesh = o;
	} );
	if ( ! mesh ) throw new Error( 'arm rig: no body mesh' );
	// the exporter baked everything into the bind: vertex attributes are world metres (bindMatrix = identity)
	const sides = { 1: extract( mesh, bones, 1 ), [ - 1 ]: extract( mesh, bones, - 1 ) };
	const metrics = handMetrics( sides[ 1 ] );
	for ( const o of [ gltf.scene ] ) o.traverse( m => { if ( m.isMesh ) m.geometry.dispose(); } );
	return { metrics, make: ( side ) => new RigArm( sides[ side ], { col, nrm } ), sides };
}

// one arm out of the body: geometry (world bind positions), bind frames and the finger / thumb chains, all in the
// hand frame at bind
function extract( mesh, bones, side ) {
	const pre = side > 0 ? 'Bip01_R_' : 'Bip01_L_';
	const B = CHAIN.map( n => bones[ pre + n ] );
	if ( B.some( b => ! b ) ) throw new Error( 'arm rig: missing bones' );
	const P = B.map( b => V().setFromMatrixPosition( b.matrixWorld ) );
	const skel = mesh.skeleton;
	const map = skel.bones.map( b => B.indexOf( b ) );
	const geo = mesh.geometry, pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
	const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
	const n = pos.count;
	// per vertex: weights on the rig (anything else, the clavicle or the spine, goes to the upper arm)
	const wts = new Array( n ), onArm = new Float32Array( n ), onHand = new Float32Array( n ), onTip = new Float32Array( n );
	// the finger ends (middle and last phalanges, the thumb's last): bare in fingerless gloves
	const TIP = ( r ) => ( r >= B_FING && r < B_THUMB && ( r - B_FING ) % 3 >= 1 ) || r === B_THUMB + 2;
	for ( let i = 0; i < n; i ++ ) {
		const w = [];
		let arm = 0, hand = 0, tip = 0;
		for ( let k = 0; k < 4; k ++ ) {
			const ww = SW.getComponent( i, k );
			if ( ww <= 0 ) continue;
			const r = map[ SI.getComponent( i, k ) ];
			if ( r >= 0 ) { arm += ww; if ( r >= B_HAND ) hand += ww; if ( TIP( r ) ) tip += ww; }
			const rr = r >= 0 ? r : B_UPPER;
			const e = w.find( x => x[ 0 ] === rr );
			if ( e ) e[ 1 ] += ww; else w.push( [ rr, ww ] );
		}
		wts[ i ] = w; onArm[ i ] = arm; onHand[ i ] = hand; onTip[ i ] = tip;
	}
	// the hand frame at bind: wrist at the hand bone, z to the middle knuckle, y out of the back of the hand
	const W = P[ B_HAND ];
	const Z = V().subVectors( P[ B_FING + 3 ], W ).normalize();
	const across = V().subVectors( P[ B_FING ], P[ B_FING + 9 ] ).multiplyScalar( side ); // right: pinky -> index
	const Yh = V().crossVectors( Z, across ).normalize();
	const Xh = V().crossVectors( Yh, Z ).normalize();
	const C = new THREE.Matrix4().makeBasis( Xh, Yh, Z ).setPosition( W );
	const Ci = C.clone().invert();
	const toC = ( p ) => p.clone().applyMatrix4( Ci );
	const dirC = ( d ) => d.clone().transformDirection( Ci );
	// triangles of the arm (every corner mostly on the arm's bones)
	const idx = geo.index.array;
	const keep = [];
	for ( let t = 0; t < idx.length; t += 3 ) {
		const a = idx[ t ], b = idx[ t + 1 ], c = idx[ t + 2 ];
		if ( onArm[ a ] >= 0.5 && onArm[ b ] >= 0.5 && onArm[ c ] >= 0.5 ) keep.push( a, b, c );
	}
	// the tip of each finger: the middle of the last segment's far end (its vertices beyond 3/4 of its reach)
	const tipOf = ( j ) => {
		const d = V().subVectors( P[ j ], P[ j - 1 ] ).normalize();
		const vs = [];
		let best = 0;
		for ( let i = 0; i < n; i ++ ) {
			const w = wts[ i ].find( x => x[ 0 ] === j );
			if ( ! w || w[ 1 ] < 0.5 ) continue;
			const t = _a.fromBufferAttribute( pos, i ).sub( P[ j ] ).dot( d );
			vs.push( [ t, i ] ); best = Math.max( best, t );
		}
		const c = V();
		let k = 0;
		for ( const [ t, i ] of vs ) if ( t > best * 0.75 ) { c.add( _a.fromBufferAttribute( pos, i ) ); k ++; }
		return k ? c.divideScalar( k ) : P[ j ].clone().addScaledVector( d, 0.02 );
	};
	// finger thickness about a segment (median distance of its vertices from the bone line)
	const radius = ( j, p0, p1 ) => {
		const d = V().subVectors( p1, p0 ), L = d.length(); d.normalize();
		const r = [];
		for ( let i = 0; i < n; i ++ ) {
			const w = wts[ i ].find( x => x[ 0 ] === j );
			if ( ! w || w[ 1 ] < 0.6 ) continue;
			_a.fromBufferAttribute( pos, i ).sub( p0 );
			const t = _a.dot( d );
			if ( t < 0 || t > L ) continue;
			r.push( _a.addScaledVector( d, - t ).length() );
		}
		r.sort( ( x, y ) => x - y );
		return r.length ? r[ r.length >> 1 ] : 0.008;
	};
	// fingers: knuckle, in-plane direction, flex axis, lengths and rest angles, in the hand frame
	const Yc = new THREE.Vector3( 0, 1, 0 );
	const fingers = [];
	for ( let f = 0; f < 4; f ++ ) {
		const j0 = B_FING + f * 3;
		const tip = tipOf( j0 + 2 );
		const p = [ toC( P[ j0 ] ), toC( P[ j0 + 1 ] ), toC( P[ j0 + 2 ] ), toC( tip ) ];
		const d = [ 0, 1, 2 ].map( k => V().subVectors( p[ k + 1 ], p[ k ] ) );
		const len = d.map( v => v.length() );
		d.forEach( v => v.normalize() );
		const s = d[ 0 ].clone().setY( 0 ).normalize();
		const ax = V().crossVectors( Yc, s ).normalize(); // + curls towards the palm
		const rest = [ Math.atan2( - d[ 0 ].y, d[ 0 ].dot( s ) ), signedAngle( d[ 0 ], d[ 1 ], ax ), signedAngle( d[ 1 ], d[ 2 ], ax ) ];
		const r = [ radius( j0, P[ j0 ], P[ j0 + 1 ] ), radius( j0 + 1, P[ j0 + 1 ], P[ j0 + 2 ] ), radius( j0 + 2, P[ j0 + 2 ], tip ) ];
		fingers.push( { mcp: p[ 0 ], s, ax, len, rest, r: [ r[ 0 ] * 1.05, r[ 1 ], r[ 2 ], r[ 2 ] * 0.85 ] } );
	}
	// thumb: base (CMC) point, segment directions, the plane it curls in
	const tt = tipOf( B_THUMB + 2 );
	const tp = [ toC( P[ B_THUMB ] ), toC( P[ B_THUMB + 1 ] ), toC( P[ B_THUMB + 2 ] ), toC( tt ) ];
	const td = [ 0, 1, 2 ].map( k => V().subVectors( tp[ k + 1 ], tp[ k ] ) );
	const tlen = td.map( v => v.length() );
	td.forEach( v => v.normalize() );
	let tax = V().crossVectors( td[ 0 ], td[ 1 ] ).add( V().crossVectors( td[ 1 ], td[ 2 ] ) );
	if ( tax.lengthSq() < 1e-6 ) tax = V().crossVectors( td[ 0 ], Yc );
	tax.addScaledVector( td[ 0 ], - tax.dot( td[ 0 ] ) ).normalize();
	const thumb = {
		cmc: tp[ 0 ], len: tlen, dir: td[ 0 ].clone(), up: V().crossVectors( td[ 0 ], tax ).normalize(),
		rest: [ signedAngle( td[ 0 ], td[ 1 ], tax ), signedAngle( td[ 1 ], td[ 2 ], tax ) ],
		r: [ radius( B_THUMB, P[ B_THUMB ], P[ B_THUMB + 1 ] ), radius( B_THUMB + 1, P[ B_THUMB + 1 ], P[ B_THUMB + 2 ] ), radius( B_THUMB + 2, P[ B_THUMB + 2 ], tt ) ],
	};
	// forearm and upper arm frames at bind; the wrist's rest bend (forearm frame in the hand frame)
	const Fb = frame( P[ B_FORE ], V().subVectors( W, P[ B_FORE ] ), Xh );
	const Ub = frame( P[ B_UPPER ], V().subVectors( P[ B_FORE ], P[ B_UPPER ] ), V().setFromMatrixColumn( Fb, 0 ) );
	const wristRest = Ci.clone().multiply( Fb ); // forearm frame relative to the hand frame
	wristRest.setPosition( 0, 0, 0 );
	const arm = {
		side, C, Ci, fingers, thumb, Fb, Ub, wristRest,
		foreLen: W.distanceTo( P[ B_FORE ] ), upperLen: P[ B_FORE ].distanceTo( P[ B_UPPER ] ),
		shoulderC: toC( P[ B_UPPER ] ),
	};
	// the skin geometry, compacted
	const remap = new Map();
	const outP = [], outN = [], outUV = [], outSI = [], outSW = [], outI = [];
	for ( const v of keep ) {
		let k = remap.get( v );
		if ( k === undefined ) {
			k = outP.length / 3;
			remap.set( v, k );
			outP.push( pos.getX( v ), pos.getY( v ), pos.getZ( v ) );
			outN.push( nor.getX( v ), nor.getY( v ), nor.getZ( v ) );
			outUV.push( uv.getX( v ), uv.getY( v ) );
			const w = wts[ v ].filter( e => e[ 1 ] > 1e-4 ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 4 );
			let t = 0; for ( const e of w ) t += e[ 1 ];
			for ( let q = 0; q < 4; q ++ ) { outSI.push( w[ q ]?.[ 0 ] ?? 0 ); outSW.push( w[ q ] ? w[ q ][ 1 ] / t : 0 ); }
		}
		outI.push( k );
	}
	// three groups: the arm (0), the hand from the wrist on (1: skin or glove) and the finger ends (2: skin, or the
	// glove unless it is fingerless)
	const tris = [ [], [], [] ];
	for ( let t = 0; t < outI.length; t += 3 ) {
		let h = 0, tp = 0;
		for ( let q = 0; q < 3; q ++ ) { h += onHand[ keep[ t + q ] ]; tp += onTip[ keep[ t + q ] ]; }
		( h / 3 <= 0.5 ? tris[ 0 ] : tp / 3 > 0.5 ? tris[ 2 ] : tris[ 1 ] ).push( outI[ t ], outI[ t + 1 ], outI[ t + 2 ] );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( outP, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( outN, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( outUV, 2 ) );
	g.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( outSI, 4 ) );
	g.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute( outSW, 4 ) );
	g.setIndex( [ ...tris[ 0 ], ...tris[ 1 ], ...tris[ 2 ] ] );
	g.addGroup( 0, tris[ 0 ].length, 0 );
	g.addGroup( tris[ 0 ].length, tris[ 1 ].length, 1 );
	g.addGroup( tris[ 0 ].length + tris[ 1 ].length, tris[ 2 ].length, 2 );
	g.computeBoundingSphere();
	arm.geo = g;
	// bind frames of the 18 bones (world): the upper arm, the forearm, the hand frame, the finger and thumb chains
	// as forward kinematics gives them at their rest angles (so the rest pose reproduces the mesh exactly)
	const bind = new Array( 18 );
	bind[ B_UPPER ] = Ub; bind[ B_FORE ] = Fb; bind[ B_HAND ] = C.clone();
	const fk = chainFrames( arm, null, null, null );
	for ( let i = B_FING; i < 18; i ++ ) bind[ i ] = C.clone().multiply( fk[ i ] );
	arm.bind = bind;
	// the arm's cross-section along the upper arm and the forearm, for the clothes
	arm.profile = armProfile( arm, P );
	return arm;
}

// finger and thumb frames in the hand frame. curl: [ [ a0, a1, a2 ] x 4 ] (null = rest), thumb: { dir, up, flex }
// (null = rest), splay spreads the fingers
const FK_OUT = new Array( 18 ).fill( null ).map( () => new THREE.Matrix4() );
function chainFrames( arm, curl, thumb, splay, out = null ) {
	out ||= new Array( 18 ).fill( null ).map( () => new THREE.Matrix4() );
	const side = arm.side;
	for ( let f = 0; f < 4; f ++ ) {
		const F = arm.fingers[ f ], c = curl ? curl[ f ] : F.rest;
		const j0 = B_FING + f * 3;
		// the knuckle's frame: z along the straight finger, x the flex axis
		_y.set( 0, 1, 0 );
		_m.makeBasis( F.ax, _c.crossVectors( F.s, F.ax ), F.s ).setPosition( F.mcp );
		if ( splay ) _m.multiply( _m2.makeRotationY( ( 1.5 - f ) * 0.07 * splay * side ) );
		out[ j0 ].copy( _m ).multiply( _m2.makeRotationX( c[ 0 ] ) );
		out[ j0 + 1 ].copy( out[ j0 ] ).multiply( _m2.makeTranslation( 0, 0, F.len[ 0 ] ) ).multiply( _m3.makeRotationX( c[ 1 ] ) );
		out[ j0 + 2 ].copy( out[ j0 + 1 ] ).multiply( _m2.makeTranslation( 0, 0, F.len[ 1 ] ) ).multiply( _m3.makeRotationX( c[ 2 ] ) );
	}
	const T = arm.thumb;
	let dir, up, flex;
	if ( thumb ) {
		thumb = thumb.rig || thumb;
		dir = _a.set( thumb.dir[ 0 ] * side, thumb.dir[ 1 ], thumb.dir[ 2 ] ).normalize();
		// the nail: given, or the rest nail carried along to the new direction and rolled about it
		if ( thumb.up ) up = _b.set( thumb.up[ 0 ] * side, thumb.up[ 1 ], thumb.up[ 2 ] );
		else {
			up = _b.copy( T.up ).applyQuaternion( _q.setFromUnitVectors( T.dir, dir ) );
			if ( thumb.roll ) up.applyAxisAngle( dir, thumb.roll * side );
		}
		flex = thumb.flex;
	} else { dir = _a.copy( T.dir ); up = _b.copy( T.up ); flex = T.rest; }
	// x = up x dir keeps +x the flex axis (x, y, z right-handed with y = up)
	up.addScaledVector( dir, - up.dot( dir ) ).normalize();
	_c.crossVectors( up, dir );
	out[ B_THUMB ].makeBasis( _c, up, dir ).setPosition( T.cmc );
	out[ B_THUMB + 1 ].copy( out[ B_THUMB ] ).multiply( _m2.makeTranslation( 0, 0, T.len[ 0 ] ) ).multiply( _m3.makeRotationX( flex[ 0 ] ) );
	out[ B_THUMB + 2 ].copy( out[ B_THUMB + 1 ] ).multiply( _m2.makeTranslation( 0, 0, T.len[ 1 ] ) ).multiply( _m3.makeRotationX( flex[ 1 ] ) );
	return out;
}

// the hand's measurements in its own frame for the grip solver (Arms.js): knuckles, phalanges, finger radii, the
// thumb, and how far the palm's skin lies under the knuckle plane
function handMetrics( arm ) {
	const fingers = arm.fingers.map( F => ( { x: F.mcp.x, y: F.mcp.y, z: F.mcp.z, len: F.len.slice(), r: F.r.slice(), splay: Math.atan2( F.s.x, F.s.z ) } ) );
	// the palm's skin under the grip line (between the heel and the knuckles, near the middle)
	const g = arm.geo, pos = g.attributes.position;
	let palm = 0;
	for ( let i = 0; i < pos.count; i ++ ) {
		_a.fromBufferAttribute( pos, i ).applyMatrix4( arm.Ci );
		if ( _a.z > 0.045 && _a.z < 0.08 && Math.abs( _a.x ) < 0.012 ) palm = Math.min( palm, _a.y );
	}
	const T = arm.thumb;
	return {
		fingers, palmSkin: Math.max( 0.011, - palm * 0.75 ), palmLen: arm.fingers[ 1 ].mcp.length(),
		thumb: { p: T.cmc.toArray(), dir: T.dir.toArray(), up: T.up.toArray(), len: T.len.slice(), r: [ ...T.r, T.r[ 2 ] * 0.85 ] },
		foreLen: arm.foreLen, upperLen: arm.upperLen,
	};
}

// the arm's radius round the upper arm and forearm axes: rows along the arm (every 1 cm), 24 angles each, found by
// casting rays from the bone line out to the skin; the sleeves and the glove cuff are lofted from it
const NPHI = 24;
function armProfile( arm, P ) {
	const segs = [
		{ o: P[ B_UPPER ], e: P[ B_FORE ], F: arm.Ub },
		{ o: P[ B_FORE ], e: P[ B_HAND ], F: arm.Fb },
	];
	// the arm's triangles as a flat list
	const g = arm.geo, pa = g.attributes.position, ix = g.index.array;
	const T = new Float32Array( ix.length * 3 );
	for ( let i = 0; i < ix.length; i ++ ) { T[ i * 3 ] = pa.getX( ix[ i ] ); T[ i * 3 + 1 ] = pa.getY( ix[ i ] ); T[ i * 3 + 2 ] = pa.getZ( ix[ i ] ); }
	// nearest hit along o + d t (Moller-Trumbore, both faces)
	const cast = ( ox, oy, oz, dx, dy, dz ) => {
		let best = Infinity;
		for ( let t = 0; t < T.length; t += 9 ) {
			const e1x = T[ t + 3 ] - T[ t ], e1y = T[ t + 4 ] - T[ t + 1 ], e1z = T[ t + 5 ] - T[ t + 2 ];
			const e2x = T[ t + 6 ] - T[ t ], e2y = T[ t + 7 ] - T[ t + 1 ], e2z = T[ t + 8 ] - T[ t + 2 ];
			const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
			const det = e1x * px + e1y * py + e1z * pz;
			if ( Math.abs( det ) < 1e-12 ) continue;
			const inv = 1 / det;
			const sx = ox - T[ t ], sy = oy - T[ t + 1 ], sz = oz - T[ t + 2 ];
			const u = ( sx * px + sy * py + sz * pz ) * inv;
			if ( u < 0 || u > 1 ) continue;
			const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
			const v = ( dx * qx + dy * qy + dz * qz ) * inv;
			if ( v < 0 || u + v > 1 ) continue;
			const d = ( e2x * qx + e2y * qy + e2z * qz ) * inv;
			if ( d > 0.004 && d < best ) best = d;
		}
		return best;
	};
	const out = [];
	for ( const S of segs ) {
		const L = S.o.distanceTo( S.e );
		const X = V().setFromMatrixColumn( S.F, 0 ), Y = V().setFromMatrixColumn( S.F, 1 ), Z = V().setFromMatrixColumn( S.F, 2 );
		const rows = Math.ceil( ( L + 0.06 ) / 0.01 ) + 1;
		const R = Array.from( { length: rows }, () => new Float32Array( NPHI ) );
		for ( let r = 0; r < rows; r ++ ) {
			const c = _c.copy( S.o ).addScaledVector( Z, r * 0.01 - 0.03 );
			for ( let k = 0; k < NPHI; k ++ ) {
				const ph = k / NPHI * Math.PI * 2;
				const d = _d.copy( X ).multiplyScalar( Math.cos( ph ) ).addScaledVector( Y, Math.sin( ph ) );
				const h = cast( c.x, c.y, c.z, d.x, d.y, d.z );
				R[ r ][ k ] = h < 0.1 ? h : 0;
			}
		}
		// fill the misses (a row's from its neighbours, then whole rows from the nearest good one), then soften
		for ( const row of R ) {
			for ( let pass = 0; pass < NPHI; pass ++ ) {
				let any = false;
				for ( let k = 0; k < NPHI; k ++ ) if ( ! row[ k ] ) { const a = row[ ( k + NPHI - 1 ) % NPHI ], b = row[ ( k + 1 ) % NPHI ]; if ( a || b ) row[ k ] = a && b ? ( a + b ) / 2 : a || b; else any = true; }
				if ( ! any ) break;
			}
		}
		for ( let r = 0; r < rows; r ++ ) if ( ! R[ r ][ 0 ] ) { const src = R.find( ( x, i ) => i > r && x[ 0 ] ) || R.slice( 0, r ).reverse().find( x => x[ 0 ] ); if ( src ) R[ r ].set( src ); else R[ r ].fill( 0.04 ); }
		const sm = R.map( ( row, r ) => row.map( ( v, k ) => {
			let t = 0, w = 0;
			for ( let dr = - 1; dr <= 1; dr ++ ) for ( let dk = - 1; dk <= 1; dk ++ ) {
				const rr = R[ r + dr ]; if ( ! rr ) continue;
				const ww = ( dr ? 0.5 : 1 ) * ( dk ? 0.6 : 1 );
				t += rr[ ( k + dk + NPHI ) % NPHI ] * ww; w += ww;
			}
			// never inside the skin
			return Math.max( v, t / w );
		} ) );
		out.push( { o: S.o.clone(), X, Y, Z, L, rows, R: sm } );
	}
	return out;
}

// the radius at (segment, s, angle) with bilinear interpolation
function profileR( S, s, phi ) {
	const fr = Math.min( S.rows - 1.001, Math.max( 0, ( s + 0.03 ) / 0.01 ) ), r0 = Math.floor( fr ), tr = fr - r0;
	const fk = ( ( phi / ( Math.PI * 2 ) ) % 1 + 1 ) % 1 * NPHI, k0 = Math.floor( fk ) % NPHI, k1 = ( k0 + 1 ) % NPHI, tk = fk - Math.floor( fk );
	const a = S.R[ r0 ], b = S.R[ r0 + 1 ];
	return ( a[ k0 ] * ( 1 - tk ) + a[ k1 ] * tk ) * ( 1 - tr ) + ( b[ k0 ] * ( 1 - tk ) + b[ k1 ] * tk ) * tr;
}

// a tube round the arm from the shoulder (u = 0 on the upper arm) to `end`: { seg, s } (segment 0 upper arm, 1
// forearm), `off` metres off the skin, with soft folds; a hem at the end turns back inside. Skinned to the arm.
function clothTube( arm, from, end, off, fold, hem = true ) {
	const [ U, F ] = arm.profile;
	const P = [], UV = [], SI = [], SW = [], I = [];
	const N = 28;
	const rings = [];
	const ring = ( seg, s, o, fo, v ) => {
		const S = arm.profile[ seg ];
		// near the elbow the ring leans half way to the other segment so the two don't cut through each other
		const k = seg === 0 ? smoothstep( S.L - 0.05, S.L, s ) * 0.5 : ( 1 - smoothstep( 0, 0.05, s ) ) * 0.5;
		const other = arm.profile[ 1 - seg ];
		const Z = _d.copy( S.Z ).lerp( other.Z, k ).normalize();
		const X = _x.copy( S.X ).addScaledVector( Z, - S.X.dot( Z ) ).normalize(), Y = _y.crossVectors( Z, X );
		const c = _c.copy( S.o ).addScaledVector( S.Z, s );
		// skin weights along the arm: upper arm -> forearm round the elbow, forearm -> hand at the wrist
		const u = seg === 0 ? s : U.L + s;
		const e = smoothstep( U.L - 0.04, U.L + 0.04, u ), wh = smoothstep( U.L + F.L - 0.05, U.L + F.L + 0.01, u );
		const w = [ [ B_UPPER, 1 - e ], [ B_FORE, e * ( 1 - wh ) ], [ B_HAND, e * wh ] ].filter( x => x[ 1 ] > 1e-4 );
		const ids = [];
		for ( let j = 0; j <= N; j ++ ) {
			const phi = j / N * Math.PI * 2;
			let r = profileR( S, s, phi ) + o;
			if ( fo ) {
				const bunch = 0.5 + ( seg === 0 ? smoothstep( S.L - 0.1, S.L, s ) : 1 - smoothstep( 0, 0.08, s ) ) * 0.8;
				r *= 1 + fo * bunch * ( Math.sin( phi * 2 + s * 61 ) * 0.6 + Math.sin( phi * 3 - s * 37 + 1.3 ) * 0.4 + Math.sin( phi * 5 + s * 23 + 0.4 ) * 0.25 );
			}
			const i = P.length / 3;
			P.push( c.x + ( X.x * Math.cos( phi ) + Y.x * Math.sin( phi ) ) * r, c.y + ( X.y * Math.cos( phi ) + Y.y * Math.sin( phi ) ) * r, c.z + ( X.z * Math.cos( phi ) + Y.z * Math.sin( phi ) ) * r );
			UV.push( j / N * 1.6, v );
			for ( let q = 0; q < 4; q ++ ) { SI.push( w[ q ]?.[ 0 ] ?? 0 ); SW.push( w[ q ]?.[ 1 ] ?? 0 ); }
			const sum = w.reduce( ( t, x ) => t + x[ 1 ], 0 );
			for ( let q = 0; q < 4; q ++ ) SW[ SW.length - 4 + q ] /= sum;
			ids.push( i );
		}
		rings.push( ids );
	};
	// the path: [ seg, s ] stations every ~1.2 cm from `from` to `end`
	const stations = [];
	const add = ( seg, s0, s1 ) => { const n = Math.max( 1, Math.ceil( ( s1 - s0 ) / 0.012 ) ); for ( let i = 0; i <= n; i ++ ) stations.push( [ seg, s0 + ( s1 - s0 ) * i / n ] ); };
	if ( end.seg === 0 ) add( 0, from, end.s );
	else { add( 0, from, U.L ); stations.pop(); add( 1, 0, end.s ); }
	let v = 0;
	const hemN = hem ? 3 : 0;
	for ( let i = 0; i < stations.length - hemN; i ++ ) { const [ seg, s ] = stations[ i ]; if ( i ) v += 0.012 * 5; ring( seg, s, off, fold, v ); }
	if ( hem ) {
		// a turned edge, then back inside so the opening shows the cloth's thickness
		const [ seg, s ] = stations[ stations.length - 1 ];
		ring( seg, s - 0.018, off + 0.0015, fold * 0.4, v + 0.1 );
		ring( seg, s - 0.004, off + 0.0022, fold * 0.2, v + 0.17 );
		ring( seg, s, off + 0.0008, 0, v + 0.2 );
		ring( seg, s - 0.008, off - 0.0025, 0, v + 0.25 );
	}
	for ( let r = 0; r + 1 < rings.length; r ++ ) {
		const a = rings[ r ], b = rings[ r + 1 ];
		for ( let j = 0; j < N; j ++ ) I.push( a[ j ], b[ j ], a[ j + 1 ], a[ j + 1 ], b[ j ], b[ j + 1 ] );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( P, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( UV, 2 ) );
	g.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( SI, 4 ) );
	g.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute( SW, 4 ) );
	g.setIndex( I );
	// the winding must face out: flip if the first quad's normal points at the axis
	g.computeVertexNormals();
	{
		const pa = g.attributes.position, na = g.attributes.normal, i = rings[ 2 ][ 3 ];
		const S = arm.profile[ stations[ 2 ][ 0 ] ];
		_a.fromBufferAttribute( pa, i ).sub( S.o );
		_a.addScaledVector( S.Z, - _a.dot( S.Z ) );
		if ( _a.dot( _b.fromBufferAttribute( na, i ) ) < 0 ) {
			const ix = g.index.array;
			for ( let t = 0; t < ix.length; t += 3 ) { const tmp = ix[ t + 1 ]; ix[ t + 1 ] = ix[ t + 2 ]; ix[ t + 2 ] = tmp; }
			g.computeVertexNormals();
		}
	}
	// seam vertices share one normal
	const na = g.attributes.normal;
	for ( const ids of rings ) {
		const a = ids[ 0 ], b = ids[ N ];
		const x = na.getX( a ) + na.getX( b ), y = na.getY( a ) + na.getY( b ), z = na.getZ( a ) + na.getZ( b ), l = Math.hypot( x, y, z ) || 1;
		na.setXYZ( a, x / l, y / l, z / l ); na.setXYZ( b, x / l, y / l, z / l );
	}
	g.computeBoundingSphere();
	return g;
}

// ---- materials ------------------------------------------------------------------------------------------------------

// skin: light wraps round the terminator and comes back warm (a cheap stand-in for light scattering in skin)
const SSS = ( shader ) => {
	shader.fragmentShader = shader.fragmentShader.replace( '#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
		#if NUM_DIR_LIGHTS > 0
		{
			float ndl = dot( normal, directionalLights[ 0 ].direction );
			float wrap = max( 0.0, ( ndl + 0.5 ) / 1.5 ) - max( 0.0, ndl );
			reflectedLight.directDiffuse += directionalLights[ 0 ].color * wrap * diffuseColor.rgb * vec3( 0.4, 0.14, 0.09 );
		}
		#endif` );
};
// gloves: the hand's own surface pushed out along its (bind) normals
const INFLATE = ( mm ) => ( shader ) => {
	shader.vertexShader = shader.vertexShader.replace( '#include <begin_vertex>', `#include <begin_vertex>\n\ttransformed += normal * ${( mm / 1000 ).toFixed( 5 )};` );
};
const viewMat = ( m, key, extra = null ) => { m.defines = { ...( m.defines || {} ), NO_ATMOS_FOG: '' }; return patchMaterial( m, key, extra, { noCloudShadow: true } ); };

function canvasTex( w, h, draw ) {
	if ( typeof document === 'undefined' ) return null;
	const c = document.createElement( 'canvas' ); c.width = w; c.height = h;
	draw( c.getContext( '2d' ), w, h );
	const t = new THREE.CanvasTexture( c );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = THREE.NoColorSpace;
	t.anisotropy = 4;
	return t;
}
let TEX = null;
function textures() {
	if ( TEX ) return TEX;
	let seed = 11;
	const r = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	TEX = {
		// woven cloth
		weave: canvasTex( 64, 64, ( g, w, h ) => {
			g.fillStyle = '#808080'; g.fillRect( 0, 0, w, h );
			for ( let y = 0; y < h; y += 2 ) for ( let x = 0; x < w; x += 2 ) { const v = ( ( x + y ) & 2 ) ? 150 : 104; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect( x, y, 2, 2 ); }
		} ),
		// glove: synthetic leather grain
		glove: canvasTex( 256, 256, ( g, w, h ) => {
			g.fillStyle = '#808080'; g.fillRect( 0, 0, w, h );
			for ( let i = 0; i < 5000; i ++ ) { const v = 70 + r() * 120 | 0; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect( r() * w, r() * h, 2, 2 ); }
		} ),
	};
	return TEX;
}
let WHITE = null;
function whiteTex() {
	if ( ! WHITE ) { WHITE = new THREE.DataTexture( new Uint8Array( [ 255, 255, 255, 255 ] ), 1, 1 ); WHITE.colorSpace = THREE.SRGBColorSpace; WHITE.needsUpdate = true; }
	return WHITE;
}

// ---- the arm ----------------------------------------------------------------------------------------------------------

const GEO = new WeakMap();
function clothGeometries( arm ) {
	let G = GEO.get( arm );
	if ( G ) return G;
	const [ U, F ] = arm.profile;
	G = {
		// long sleeves stop short of the wrist bone; short ones above the elbow
		sleeveLong: clothTube( arm, - 0.03, { seg: 1, s: F.L - 0.035 }, 0.0065, 0.05 ),
		sleeveShort: clothTube( arm, - 0.03, { seg: 0, s: U.L * 0.62 }, 0.008, 0.045 ),
		cuff: clothTube( arm, 0, { seg: 1, s: F.L + 0.012 }, 0.0032, 0, true ),
	};
	// the cuff is only its last few centimetres
	{
		const g = G.cuff, pa = g.attributes.position, keep = [];
		const ix = g.index.array;
		for ( let t = 0; t < ix.length; t += 3 ) {
			let ok = true;
			for ( let q = 0; q < 3; q ++ ) { _a.fromBufferAttribute( pa, ix[ t + q ] ).sub( F.o ); if ( _a.dot( F.Z ) < F.L - 0.065 ) ok = false; }
			if ( ok ) keep.push( ix[ t ], ix[ t + 1 ], ix[ t + 2 ] );
		}
		g.setIndex( keep );
	}
	GEO.set( arm, G );
	return G;
}

export class RigArm {
	constructor( arm, tex ) {
		this.side = arm.side;
		this.R = arm;
		this.rig = true;
		this.root = new THREE.Group();
		this.root.name = arm.side > 0 ? 'armR' : 'armL';
		const T = textures();
		this.mSkin = viewMat( new THREE.MeshStandardMaterial( { color: 0xffffff, map: tex.col, normalMap: tex.nrm, roughness: 0.52, metalness: 0 } ), 'arms-rig-skin', SSS );
		if ( tex.nrm ) this.mSkin.normalScale.set( 0.9, 0.9 );
		this.mGlove = viewMat( new THREE.MeshStandardMaterial( { color: 0x2a2a2a, roughness: 0.72, metalness: 0 } ), 'arms-rig-glove', INFLATE( 1.3 ) );
		if ( T.glove ) { this.mGlove.bumpMap = T.glove; this.mGlove.bumpScale = 0.5; }
		// thin examination gloves: the hand's own shape, glossy
		this.mLatex = viewMat( new THREE.MeshStandardMaterial( { color: 0x4a8ad6, roughness: 0.35, metalness: 0 } ), 'arms-rig-latex', INFLATE( 0.3 ) );
		if ( tex.nrm ) { this.mLatex.normalMap = tex.nrm; this.mLatex.normalScale.set( 0.4, 0.4 ); }
		this.mCuff = viewMat( new THREE.MeshStandardMaterial( { color: 0x2a2a2a, roughness: 0.8, metalness: 0, side: THREE.DoubleSide } ), 'arms-rig-cuff' );
		this.mSleeve = viewMat( new THREE.MeshStandardMaterial( { color: 0x888888, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, map: whiteTex() } ), 'arms-rig-cloth' );
		if ( T.weave ) { this.mSleeve.bumpMap = T.weave; this.mSleeve.bumpScale = 0.6; }
		// the skeleton: flat, every bone's local transform is its view-space frame (the arm root sits at the view origin)
		this.bones = [];
		for ( let i = 0; i < 18; i ++ ) this.bones.push( new THREE.Bone() );
		const inv = arm.bind.map( m => m.clone().invert() );
		this.skin = new THREE.SkinnedMesh( arm.geo, [ this.mSkin, this.mSkin, this.mSkin ] );
		for ( const b of this.bones ) this.skin.add( b );
		this.skeleton = new THREE.Skeleton( this.bones, inv );
		this.skin.bind( this.skeleton, new THREE.Matrix4() );
		const G = clothGeometries( arm );
		this.sleeveLong = new THREE.SkinnedMesh( G.sleeveLong, this.mSleeve );
		this.sleeveShort = new THREE.SkinnedMesh( G.sleeveShort, this.mSleeve );
		this.cuff = new THREE.SkinnedMesh( G.cuff, this.mCuff );
		for ( const m of [ this.sleeveLong, this.sleeveShort, this.cuff ] ) m.bind( this.skeleton, new THREE.Matrix4() );
		for ( const m of [ this.skin, this.sleeveLong, this.sleeveShort, this.cuff ] ) { m.frustumCulled = false; m.castShadow = m.receiveShadow = false; this.root.add( m ); }
		this.sleeveShort.visible = false; this.cuff.visible = false;
		this.upperBone = this.bones[ B_UPPER ]; this.foreBone = this.bones[ B_FORE ]; this.wrist = this.bones[ B_HAND ];
		this.shoulder = V(); this.elbow = V();
		this.bend = 0.38;
		this.foreLen = arm.foreLen; this.upperLen = arm.upperLen;
		this._curl = null; this._thumb = null; this._splay = 0;
		this._fk = new Array( 18 ).fill( null ).map( () => new THREE.Matrix4() );
		// rest pose until posed
		for ( let i = 0; i < 18; i ++ ) arm.bind[ i ].decompose( this.bones[ i ].position, this.bones[ i ].quaternion, this.bones[ i ].scale );
	}

	// clothing: { skin, sleeve (colour | null = bare arms), long (to the wrist), print (texture), glove (colour | null),
	// gloveStyle ('fingerless' leaves the finger ends bare, 'latex' is thin and glossy) }
	style( o ) {
		const has = o.sleeve != null;
		if ( has ) {
			this.mSleeve.color.set( o.print ? 0xffffff : o.sleeve );
			if ( this.mSleeve.map !== ( o.print || whiteTex() ) ) this.mSleeve.map = o.print || whiteTex();
		}
		this.sleeveLong.visible = has && !! o.long;
		this.sleeveShort.visible = has && ! o.long;
		const gl = o.glove != null, latex = o.gloveStyle === 'latex';
		const mg = latex ? this.mLatex : this.mGlove;
		if ( gl ) { mg.color.set( o.glove ); this.mCuff.color.set( o.glove ).multiplyScalar( 0.85 ); }
		this.skin.material = gl ? [ this.mSkin, mg, o.gloveStyle === 'fingerless' ? this.mSkin : mg ] : [ this.mSkin, this.mSkin, this.mSkin ];
		// a glove cuff under a long sleeve would poke through it
		this.cuff.visible = gl && ! latex && ! ( has && o.long );
	}

	// every material shown at once (shader warm-up), and back
	warm( on ) {
		if ( on ) {
			this._warm = { mats: this.skin.material, vis: [ this.sleeveLong.visible, this.sleeveShort.visible, this.cuff.visible ] };
			this.skin.material = [ this.mSkin, this.mGlove, this.mLatex ];
			this.sleeveLong.visible = this.cuff.visible = true;
		} else if ( this._warm ) {
			this.skin.material = this._warm.mats;
			[ this.sleeveLong.visible, this.sleeveShort.visible, this.cuff.visible ] = this._warm.vis;
			this._warm = null;
		}
	}

	setEnvironment( env, intensity ) {
		for ( const m of [ this.mSkin, this.mGlove, this.mLatex, this.mCuff, this.mSleeve ] ) {
			if ( m.envMap !== env ) { m.envMap = env; m.needsUpdate = true; }
			m.envMapIntensity = intensity * ( m === this.mSkin ? 0.6 : 0.5 );
		}
	}

	// joint angles: curl = [ [ a0, a1, a2 ] x 4 ] (index, middle, ring, pinky; 0 = straight), thumb = a THUMB_POSE entry
	// ({ dir, up, flex }), splay spreads the fingers
	setCurl( curl, thumb, splay = 0 ) { this._curl = curl; this._thumb = thumb; this._splay = splay; }

	// place the hand (hand frame in view space) and solve the arm back to the shoulder; the forearm leans towards
	// `elbow` when given (where the elbow should hang), else towards the shoulder
	pose( shoulder, hand, bend = this.bend, elbow = null ) {
		const R = this.R;
		const W = _a.setFromMatrixPosition( hand );
		// the forearm as it would lie with the wrist at rest
		_m.copy( hand ).multiply( R.wristRest );
		_m.extractBasis( _x, _y, _z );
		const fx0 = _s.copy( _x ).normalize();
		const rest = _z.normalize().negate(); // wrist -> elbow
		const toS = _b.subVectors( elbow || shoulder, W ).normalize();
		const d = _c.copy( rest ).multiplyScalar( 1 - bend ).addScaledVector( toS, bend ).normalize();
		// within what a wrist does: bent back or forward a long way, sideways only a little
		const fy0 = _y.copy( _z ).cross( fx0 ).negate(); // the resting forearm's y (z points wrist -> elbow here)
		const lx = d.dot( fx0 ), ly = d.dot( fy0 ), lz = d.dot( rest );
		const dev = THREE.MathUtils.clamp( Math.atan2( lx, lz ), - WRIST_DEV, WRIST_DEV ), flex = THREE.MathUtils.clamp( Math.atan2( ly, lz ), - WRIST_FLEX, WRIST_FLEX );
		d.copy( rest ).addScaledVector( fx0, Math.tan( dev ) ).addScaledVector( fy0, Math.tan( flex ) ).normalize();
		const E = this.elbow.copy( W ).addScaledVector( d, this.foreLen );
		// forearm: z elbow -> wrist, x as the resting wrist's (the forearm turns with the hand)
		const Fm = frame( E, _d.copy( d ).negate(), fx0, _m2 );
		// upper arm: from the shoulder side into the elbow
		const S = this.shoulder.copy( shoulder );
		const uz = _d.subVectors( E, S ).normalize();
		const fx = _y.setFromMatrixColumn( Fm, 0 );
		const Um = frame( _b.copy( E ).addScaledVector( uz, - this.upperLen ), uz, fx, _m3 );
		const B = this.bones;
		Um.decompose( B[ B_UPPER ].position, B[ B_UPPER ].quaternion, _s );
		Fm.decompose( B[ B_FORE ].position, B[ B_FORE ].quaternion, _s );
		hand.decompose( B[ B_HAND ].position, B[ B_HAND ].quaternion, _s );
		// fingers and thumb
		const fk = chainFrames( R, this._curl, this._thumb, this._splay, this._fk );
		for ( let i = B_FING; i < 18; i ++ ) _m.multiplyMatrices( hand, fk[ i ] ).decompose( B[ i ].position, B[ i ].quaternion, _s );
		for ( const b of B ) b.scale.copy( ONE );
	}

	set visible( v ) { this.root.visible = v; }
	get visible() { return this.root.visible; }

	dispose() {
		for ( const m of [ this.mSkin, this.mGlove, this.mLatex, this.mCuff, this.mSleeve ] ) m.dispose();
		this.root.parent?.remove( this.root );
	}
}
void FK_OUT;
