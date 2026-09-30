// The player's body in a vehicle seat: a Rocketbox avatar (Microsoft, MIT: public/models/characters/LICENSE-Rocketbox.md)
// posed procedurally in the vehicle's frame every frame: hips on the seat, the back leaning with the seat (or over
// the tank of a motorcycle), feet on the pedals or pegs, hands on the same grips the first-person arms hold
// (driver.js gripsFor), fingers closed round them. From outside the whole figure is drawn; from inside only the
// lap and legs (the rest is cut away in the shader: the modelled first-person arms take their place).
//
// Posing: each bone of the Bip01 skeleton points along its local +x at its child. aim() turns a bone by the
// smallest rotation that points it at a target direction (keeping the bind pose's twist), so the arms and legs are
// two-bone chains solved for their elbow and knee; forward kinematics is done here on plain quaternions (no
// matrix updates until the frame is drawn).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { patchMaterial } from '../render/Materials.js';
import { wristMatrix } from '../weapons/Arms.js';
import { gripsFor, legsFor } from './driver.js';

const AVATAR = 'm_casual1';
const DIR = typeof location !== 'undefined' && location.pathname.includes( '/test/' ) ? '/models/characters/' : 'models/characters/';
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const X = new V3( 1, 0, 0 );
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _q = new Q(), _q2 = new Q(), _m = new THREE.Matrix4();
const mkGrip = () => ( { p: new V3(), a: new V3(), n: new V3(), r: 0.018 } );

function loadTex( file, srgb ) {
	return new Promise( ( resolve ) => {
		new THREE.TextureLoader().load( DIR + file, t => {
			t.flipY = false; // glTF uv convention
			t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			t.anisotropy = 4;
			resolve( t );
		}, undefined, () => resolve( null ) );
	} );
}

let LOADING = null;
function loadAvatar() {
	return LOADING ||= Promise.all( [ new GLTFLoader().loadAsync( DIR + AVATAR + '.glb' ), loadTex( AVATAR + '_c.jpg', true ), loadTex( AVATAR + '_n.jpg', false ), loadTex( AVATAR + '_m.png', false ) ] )
		.catch( e => { LOADING = null; throw e; } );
}

// uCut 1: seen from inside, only the legs and hips are drawn (the bind pose's waist up, and the arms, are cut away:
// the first-person arms take their place)
function bodyMaterial( map, normalMap, cut ) {
	const m = new THREE.MeshStandardMaterial( { map, normalMap, roughness: 0.85, metalness: 0 } );
	if ( normalMap ) m.normalScale.set( 0.9, - 0.9 );
	return patchMaterial( m, 'rider-body', ( shader ) => {
		shader.uniforms.uCut = cut;
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nvarying vec3 vBindPos;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvBindPos = position;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\nuniform float uCut;\nvarying vec3 vBindPos;' )
			.replace( '#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif ( uCut > 0.5 && ( vBindPos.y > 0.97 || ( abs( vBindPos.x ) > 0.22 && vBindPos.y > 0.8 ) ) ) discard;' );
	} );
}
// hair and lashes: alpha-tested cards, the alpha in the mask's blue channel
function cardMaterial( map, mask ) {
	const m = new THREE.MeshStandardMaterial( { map, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.45 } );
	return patchMaterial( m, 'rider-cards', ( shader ) => {
		shader.uniforms.uMask = { value: mask };
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\nuniform sampler2D uMask;' )
			.replace( '#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.a = texture2D( uMask, vMapUv ).b;' );
	} );
}

// the elbow / knee of a two-bone chain from `a` reaching for `t` (lengths l1, l2), bent towards `hint`
function twoBone( a, t, l1, l2, hint, out ) {
	const d = _a.subVectors( t, a );
	let L = d.length();
	L = Math.min( Math.max( L, Math.abs( l1 - l2 ) + 1e-3 ), l1 + l2 - 1e-3 );
	d.normalize();
	// distance along the reach to the foot of the joint, and its height off it
	const x = ( l1 * l1 - l2 * l2 + L * L ) / ( 2 * L );
	const h = Math.sqrt( Math.max( 0, l1 * l1 - x * x ) );
	const n = _b.copy( hint ).addScaledVector( d, - hint.dot( d ) );
	if ( n.lengthSq() < 1e-8 ) n.set( 0, 1, 0 ).addScaledVector( d, - d.y );
	n.normalize();
	return out.copy( a ).addScaledVector( d, x ).addScaledVector( n, h );
}

const NAMES = {
	pelvis: 'Bip01_Pelvis', spine: 'Bip01_Spine', spine1: 'Bip01_Spine1', spine2: 'Bip01_Spine2', neck: 'Bip01_Neck', head: 'Bip01_Head',
	lClav: 'Bip01_L_Clavicle', lUpper: 'Bip01_L_UpperArm', lFore: 'Bip01_L_Forearm', lHand: 'Bip01_L_Hand',
	rClav: 'Bip01_R_Clavicle', rUpper: 'Bip01_R_UpperArm', rFore: 'Bip01_R_Forearm', rHand: 'Bip01_R_Hand',
	lThigh: 'Bip01_L_Thigh', lCalf: 'Bip01_L_Calf', lFoot: 'Bip01_L_Foot', lToe: 'Bip01_L_Toe0',
	rThigh: 'Bip01_R_Thigh', rCalf: 'Bip01_R_Calf', rFoot: 'Bip01_R_Foot', rToe: 'Bip01_R_Toe0',
};

export class RiderBody {
	constructor() {
		this.group = new THREE.Group();
		this.group.name = 'rider-body';
		this.group.visible = false;
		this.ready = false;
		this.grips = [ mkGrip(), mkGrip() ];
		this.hand = [ new THREE.Matrix4(), new THREE.Matrix4() ];
		this.loading = false;
	}

	// the avatar loads the first time someone sits down (the mannequin in visual.js stands in until then)
	load() {
		if ( this.loading || typeof window === 'undefined' || typeof document === 'undefined' ) return;
		this.loading = true;
		loadAvatar().then( r => this._init( ...r ) ).catch( e => console.warn( 'rider body', e ) );
	}

	_init( gltf, col, nrm, mask ) {
		if ( this.disposed ) return;
		const scene = gltf.scene;
		// (the avatar faces +z; vehicles face -z)
		scene.rotation.y = Math.PI;
		this.scene = scene;
		this.group.add( scene );
		const bones = {};
		let skin = null, cards = null, avatar = null;
		scene.traverse( o => {
			if ( o.isBone ) bones[ o.name ] = o;
			if ( o.name === 'Avatar' ) avatar = o;
			if ( o.isSkinnedMesh ) {
				if ( o.name.startsWith( 'lod1' ) || o.parent?.name?.startsWith( 'lod1' ) ) o.visible = false;
				else if ( o.material?.name === 'cards' ) cards = o;
				else if ( ! skin ) skin = o;
			}
		} );
		if ( ! skin || ! avatar || Object.values( NAMES ).some( n => ! bones[ n ] ) ) { console.warn( 'rider body: unexpected avatar' ); return; }
		this.cut = { value: 0 };
		this.mBody = bodyMaterial( col, nrm, this.cut );
		skin.material = this.mBody;
		if ( cards && mask ) { this.mCards = cardMaterial( col, mask ); cards.material = this.mCards; this.cards = cards; } else if ( cards ) cards.visible = false;
		for ( const m of [ skin, cards ] ) if ( m ) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; }
		this.avatar = avatar;
		this.B = {};
		for ( const k in NAMES ) this.B[ k ] = bones[ NAMES[ k ] ];
		// every bone below the pelvis, parents first; their bind transforms
		this.order = [];
		this.B.pelvis.traverse( b => { if ( b.isBone ) this.order.push( b ); } );
		this.bind = this.order.map( b => ( { q: b.quaternion.clone(), p: b.position.clone() } ) );
		this.bindQ = new Map( this.order.map( ( b, i ) => [ b, this.bind[ i ].q ] ) );
		this.all = [ avatar, ...this.order ];
		this.Wq = new Map(); this.Wp = new Map();
		for ( const b of this.all ) { this.Wq.set( b, new Q() ); this.Wp.set( b, new V3() ); }
		this.tmp = { up: new V3(), a: new V3(), b: new V3(), off: new V3(), foot: new V3(), hint: new V3(), joint: new V3(), wrist: new V3() };
		this.S = avatar.scale.x; // centimetres to metres
		// limb lengths and the hand's own axes at bind (world = the avatar's frame, metres)
		scene.updateMatrixWorld( true );
		const wp = ( b ) => new V3().setFromMatrixPosition( b.matrixWorld );
		const B = this.B;
		this.len = {
			upper: wp( B.rUpper ).distanceTo( wp( B.rFore ) ), fore: wp( B.rFore ).distanceTo( wp( B.rHand ) ),
			thigh: wp( B.rThigh ).distanceTo( wp( B.rCalf ) ), calf: wp( B.rCalf ).distanceTo( wp( B.rFoot ) ),
		};
		// the fingers of each hand, and in the hand's own frame: the way the fingers point, the back of the hand, and
		// the axis each finger joint curls about (towards the palm)
		this.fingers = {};
		for ( const [ side, pre ] of [ [ - 1, 'Bip01_L_' ], [ 1, 'Bip01_R_' ] ] ) {
			const hand = side < 0 ? B.lHand : B.rHand;
			const hq = hand.getWorldQuaternion( new Q() ), hqi = hq.clone().invert();
			const k = ( n ) => bones[ pre + n ];
			const pw = ( n ) => wp( k( n ) );
			const along = pw( 'Finger2' ).sub( wp( hand ) ).normalize();
			const across = pw( 'Finger1' ).sub( pw( 'Finger4' ) ).normalize().multiplyScalar( side ); // pinky -> index on the right hand
			const back = new V3().crossVectors( along, across ).normalize();
			const joints = [];
			for ( const f of [ 1, 2, 3, 4, 0 ] ) for ( const j of [ '', '1', '2' ] ) {
				const b = k( 'Finger' + f + j );
				if ( ! b ) continue;
				const bqi = b.getWorldQuaternion( new Q() ).invert();
				// curl axis: the knuckle line, so a positive turn brings the tip towards the palm
				const ax = across.clone().multiplyScalar( - side ).applyQuaternion( bqi ).normalize();
				joints.push( { b, ax, thumb: f === 0, q0: b.quaternion.clone() } );
			}
			// the sign that curls into the palm: try a turn on the middle finger's first joint
			const mid = joints.find( j => j.b === k( 'Finger2' ) );
			let sign = 1;
			if ( mid ) {
				const tip = k( 'Finger22' ) ? pw( 'Finger22' ) : pw( 'Finger21' );
				const before = tip.clone().sub( wp( hand ) ).dot( back );
				const save = mid.b.quaternion.clone();
				mid.b.quaternion.multiply( _q.setFromAxisAngle( mid.ax, 0.5 ) );
				mid.b.updateMatrixWorld( true );
				const after = ( k( 'Finger22' ) ? pw( 'Finger22' ) : pw( 'Finger21' ) ).sub( wp( hand ) ).dot( back );
				mid.b.quaternion.copy( save );
				mid.b.updateMatrixWorld( true );
				if ( after > before ) sign = - 1;
			}
			this.fingers[ side ] = { joints, sign, along: along.applyQuaternion( hqi ), back: back.applyQuaternion( hqi ) };
		}
		this.ready = true;
	}

	// shown in this vehicle (null: hidden)
	attach( v ) {
		const parent = v ? v.object : null;
		if ( parent ) this.load();
		if ( this.group.parent !== parent ) {
			this.group.parent?.remove( this.group );
			if ( parent ) parent.add( this.group );
		}
		this.group.visible = !! parent && this.ready;
	}

	// ---- forward kinematics on the pose (in the vehicle's model frame) --------------------------------------------

	_fk( b ) {
		const pq = this.Wq.get( b.parent ), pp = this.Wp.get( b.parent );
		this.Wq.get( b ).multiplyQuaternions( pq, b.quaternion );
		this.Wp.get( b ).copy( b.position ).multiplyScalar( this.S ).applyQuaternion( pq ).add( pp );
	}
	// a bone and everything under it, after its parent moved
	_fkTree( b ) { b.traverse( c => { if ( c.isBone ) this._fk( c ); } ); }

	// turn a bone (from its bind rotation under its parent) the least way to point along direction d
	_aim( b, d ) {
		const pq = this.Wq.get( b.parent );
		const cur = _q2.multiplyQuaternions( pq, this.bindOf( b ) );
		const along = _e.copy( X ).applyQuaternion( cur );
		_q.setFromUnitVectors( along, _d.copy( d ).normalize() );
		cur.premultiply( _q );
		b.quaternion.copy( pq ).invert().multiply( cur );
		this._fk( b );
	}
	bindOf( b ) { return this.bindQ.get( b ); }

	// pose for the seat this frame; `first`: seen from inside (only the lap and legs)
	pose( v, seat, first = false ) {
		if ( ! this.ready || ! this.group.visible ) return;
		const B = this.B, Wp = this.Wp, Wq = this.Wq, T = this.tmp;
		const kind = v.kind;
		// back to the bind pose
		this.order.forEach( ( b, i ) => { b.quaternion.copy( this.bind[ i ].q ); b.position.copy( this.bind[ i ].p ); b.scale.set( 1, 1, 1 ); } );
		// the avatar node in the model frame (the scene is turned to face -z)
		this.scene.position.set( 0, 0, 0 );
		const sq = this.scene.quaternion;
		Wq.get( this.avatar ).multiplyQuaternions( sq, this.avatar.quaternion );
		Wp.get( this.avatar ).copy( this.avatar.position ).applyQuaternion( sq );
		this._fkTree( B.pelvis );
		// the back: from the hips towards a point under the eye (upright in a car, over the tank on a bike)
		const [ hx, hy, hz ] = seat.pos, [ ex, ey, ez ] = seat.eye;
		const up = T.up.set( ex - hx, ey - 0.16 - hy, ez - 0.06 - hz ).normalize();
		for ( const k of [ 'pelvis', 'spine', 'spine1', 'spine2' ] ) this._aim( B[ k ], up );
		this._aim( B.neck, T.a.copy( up ).add( T.b.set( 0, 0.3, - 0.1 ) ) );
		this._aim( B.head, T.a.set( 0, 1, - 0.08 ) );
		this._fkTree( B.pelvis );
		// the hips on the seat: shift the whole figure
		const off = T.off.set( hx, hy + 0.04, hz + 0.02 ).sub( T.a.addVectors( Wp.get( B.lThigh ), Wp.get( B.rThigh ) ).multiplyScalar( 0.5 ) );
		this.scene.position.copy( off );
		for ( const b of this.all ) Wp.get( b ).add( off );
		// legs: thigh and calf reach the foot, the knee up and forward (out a little on a bike)
		const legs = legsFor( v, seat );
		for ( let i = 0; i < 2; i ++ ) {
			const s = i ? 1 : - 1, L = legs[ i ];
			const th = s < 0 ? B.lThigh : B.rThigh, ca = s < 0 ? B.lCalf : B.rCalf, ft = s < 0 ? B.lFoot : B.rFoot;
			// (the ankle sits over the sole the seated figure's foot rests on)
			const foot = T.foot.set( L.foot[ 0 ], L.foot[ 1 ] + 0.08, L.foot[ 2 ] + 0.05 );
			const knee = twoBone( Wp.get( th ), foot, this.len.thigh, this.len.calf, T.hint.set( s * ( kind === 'bike' ? 0.3 : 0.12 ), 0.8, - 0.6 ), T.joint );
			this._aim( th, T.a.subVectors( knee, Wp.get( th ) ) );
			this._fk( ca );
			this._aim( ca, T.a.subVectors( foot, Wp.get( ca ) ) );
			this._fk( ft );
			// the foot flat on the pedal / peg, toes forward
			this._aim( ft, T.a.set( 0, kind === 'bike' ? - 0.25 : - 0.45, - 1 ) );
			this._fkTree( ft );
		}
		// arms: a two-bone reach from the shoulder to the wrist on the grip, the elbow down and out
		gripsFor( v, seat, this.grips );
		for ( let i = 0; i < 2; i ++ ) {
			const s = i ? 1 : - 1;
			const up = s < 0 ? B.lUpper : B.rUpper, fo = s < 0 ? B.lFore : B.rFore, ha = s < 0 ? B.lHand : B.rHand;
			const hm = wristMatrix( this.grips[ i ], s, this.hand[ i ] );
			const wrist = T.wrist.setFromMatrixPosition( hm );
			const elbow = twoBone( Wp.get( up ), wrist, this.len.upper, this.len.fore, T.hint.set( s * 0.6, - 0.8, 0.1 ), T.joint );
			this._aim( up, T.a.subVectors( elbow, Wp.get( up ) ) );
			this._fk( fo );
			this._aim( fo, T.a.subVectors( wrist, Wp.get( fo ) ) );
			this._fk( ha );
			// the hand in the grip's frame: fingers along its z, the back of the hand along its y
			const F = this.fingers[ s ];
			const hzv = T.a.setFromMatrixColumn( hm, 2 ).normalize(), hyv = T.b.setFromMatrixColumn( hm, 1 ).normalize();
			const pq = Wq.get( ha.parent );
			const cur = _q2.multiplyQuaternions( pq, this.bindOf( ha ) );
			_q.setFromUnitVectors( _d.copy( F.along ).applyQuaternion( cur ), hzv );
			cur.premultiply( _q );
			// roll about the fingers so the back of the hand faces out of the grip
			const back = _e.copy( F.back ).applyQuaternion( cur );
			back.addScaledVector( hzv, - back.dot( hzv ) ).normalize();
			hyv.addScaledVector( hzv, - hyv.dot( hzv ) ).normalize();
			const ang = Math.atan2( _d.crossVectors( back, hyv ).dot( hzv ), back.dot( hyv ) );
			cur.premultiply( _q.setFromAxisAngle( hzv, ang ) );
			ha.quaternion.copy( pq ).invert().multiply( cur );
			// fingers round the grip (a loose curl on a thigh)
			const c = ( this.grips[ i ].r > 0.05 ? 0.3 : 1.15 ) * F.sign;
			for ( const J of F.joints ) J.b.quaternion.copy( J.q0 ).multiply( _q.setFromAxisAngle( J.ax, J.thumb ? c * 0.35 : c ) );
			this._fkTree( ha );
		}
		// inside only the lap and the legs (and no hair)
		this.cut.value = first ? 1 : 0;
		if ( this.cards ) this.cards.visible = ! first;
	}

	dispose() {
		this.disposed = true;
		this.group.parent?.remove( this.group );
		this.mBody?.dispose(); this.mCards?.dispose();
		this.ready = false;
	}
}
