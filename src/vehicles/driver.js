// The player's arms in the first-person seat: the weapons module's modelled arms (ArmRig.js: skinned Rocketbox
// forearms and hands, sleeves and gloves from what's worn, fingers closed round a grip by the solver in Arms.js)
// posed on the vehicle's controls in its own frame, so they turn with the wheel and ride every bump:
//   wheel     both hands on the rim at about 9 and 3 o'clock (cars, the bus, boats)
//   bars      on the grips (motorcycle, jet ski)
//   yoke      on its horns (the aeroplane)
//   heli      the right hand on the cyclic, the left on the collective
//   rest      a passenger's hands on the thighs
// The arms live in the world scene (the view scene isn't drawn in a vehicle) under the vehicle's visual group; their
// materials are recompiled for the world (sun shadows, fog) so the cabin's shade falls on them.
import * as THREE from 'three';
import { loadArmRig } from '../weapons/ArmRig.js';
import { wristMatrix, curlFor, THUMB_POSE, setHandMetrics } from '../weapons/Arms.js';
import { getItem } from '../game/items/ItemDB.js';
import { riderPose } from './visual.js';
import { joint } from './models/parts.js';

const V3 = THREE.Vector3;
const _m = new THREE.Matrix4(), _col = new THREE.Matrix4(), _r = new THREE.Matrix4(), _n3 = new THREE.Matrix3();
const _sh = new V3(), _el = new V3();
// one grip per hand, reused every frame
const mkGrip = () => ( { p: new V3(), a: new V3(), n: new V3(), r: 0.018 } );
const LEFT = 0, RIGHT = 1;

// the worn top's print on the sleeves (the items module's helper, as the weapons module loads it)
let printTex = null;
if ( typeof document !== 'undefined' ) import( '../game/items/models/lib.js' ).then( m => { printTex = m.printTex || null; } ).catch( () => {} );
const PRINTS = new Map();
function sleevePrint( m ) {
	if ( ! printTex ) return null;
	const k = `${m.print}:${m.color}:${m.color2}:${m.color3}`;
	if ( PRINTS.has( k ) ) return PRINTS.get( k );
	let t = null;
	try {
		t = printTex( m.print, m.color ?? 0x888888, m.color2 ?? 0xffffff, m.color3 ?? null )?.clone() || null;
		if ( t ) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set( 1.2, 1.2 ); t.needsUpdate = true; }
	} catch ( e ) { t = null; }
	PRINTS.set( k, t );
	return t;
}

// sleeves and gloves from what's worn (the same rules as the first-person weapon arms in Hands.js)
export function armStyle( inv ) {
	const eq = inv?.equip || {};
	const top = eq.torso ? getItem( eq.torso.id ) : null;
	const gl = eq.hands ? getItem( eq.hands.id ) : null;
	const c = top?.clothing, m = top?.model;
	const style = m?.style;
	const long = !! c && style !== 'tank' && style !== 'tee' && style !== 'polo' && ( [ 'hoodie', 'jacket', 'coat', 'suit', 'wetsuit' ].includes( style ) || ( c.insulation ?? 0 ) >= 0.15 || ( c.waterproof ?? 0 ) >= 0.3 );
	const sleeve = c && style !== 'tank' ? ( c.color ?? m?.color ?? 0x777777 ) : null;
	let print = null;
	if ( sleeve != null && m?.print && m.print !== 'plain' && ! String( m.print ).startsWith( 'text:' ) ) print = sleevePrint( m );
	return { skin: 0xb29585, sleeve, long, print, glove: gl ? ( gl.clothing?.color ?? gl.model?.color ?? 0x2a2a2a ) : null, gloveStyle: gl?.model?.style || null };
}

// the arm materials are made for the view scene (no world shadows or fog): compile these copies for the world
function worldMaterial( m, envK ) {
	if ( m.userData.world ) return;
	m.userData.world = true;
	const prev = m.onBeforeCompile;
	m.onBeforeCompile = ( shader, r ) => {
		prev.call( m, shader, r );
		shader.fragmentShader = shader.fragmentShader.replace( '#define NO_SUN_VIS\n#define NO_GROUND_BOUNCE\n', '' )
			// (the skin's light wrap is sunlight too: the cabin's shade takes it away)
			.replace( 'directionalLights[ 0 ].color * wrap', 'directionalLights[ 0 ].color * dtSunVis * wrap' );
	};
	if ( m.defines ) delete m.defines.NO_ATMOS_FOG;
	const key = m.customProgramCacheKey();
	m.customProgramCacheKey = () => key + '-world';
	m.envMap = null; // the scene's environment
	m.envMapIntensity = envK;
	m.needsUpdate = true;
}

// what the hands hold in a seat: 'wheel' | 'bars' | 'yoke' | 'heli' | 'rest'
export function controlsOf( v, seat ) {
	if ( ! seat.driver ) return 'rest';
	if ( v.kind === 'heli' ) return 'heli';
	const S = v.model.P.steer;
	if ( ! S ) return 'rest';
	if ( S.axis === 'y' ) return 'bars';
	if ( v.kind === 'plane' ) return 'yoke';
	return 'wheel';
}

// the grips the two hands close round this frame, in the vehicle's model frame: grips = [ left, right ], each
// { p (on the axis), a (axis, pinky -> index), n (back of the hand), r } as Arms.js wristMatrix takes them.
// Returns controlsOf( v, seat ). The first-person arms and the seated body (rider.js) share it.
export function gripsFor( v, seat, grips ) {
	const what = controlsOf( v, seat );
	const P = v.model.P, S = P.steer;
	const [ gl, gr ] = grips;
	if ( what === 'wheel' || what === 'yoke' || what === 'bars' ) {
		// the steering part's frame: the column (tilted) turned by the wheel's angle
		_col.makeRotationX( - S.tilt ).setPosition( S.x, S.y, - S.f );
		const ang = v.visual.steerAngle || 0;
		if ( S.axis === 'y' ) _r.makeRotationY( ang ); else _r.makeRotationZ( ang );
		_col.multiply( _r );
		if ( what === 'wheel' ) {
			// on the rim a little above 9 and 3, the backs of the hands turned out towards the driver
			const R = S.r ?? 0.19, d = 0.2;
			for ( const [ g, th, s ] of [ [ gl, Math.PI - d, - 1 ], [ gr, d, 1 ] ] ) {
				const c = Math.cos( th ), sn = Math.sin( th );
				g.p.set( R * c, R * sn, 0 );
				// pinky -> index runs up the rim
				g.a.set( - sn * s, c * s, 0 );
				g.n.set( c * 0.55, sn * 0.55, 0.84 );
				g.r = P.steerStyle === 'bus' ? 0.02 : 0.017;
			}
		} else if ( what === 'bars' ) {
			// the grips sweep back from the bar's ends; the backs of the hands up and back, over the grips
			const bike = v.kind === 'bike';
			const gx = bike ? 0.33 : 0.3, gy = bike ? 0.135 : 0.04, gz = bike ? 0.07 : 0.04, sweep = bike ? 0.247 : 0;
			for ( const [ g, s ] of [ [ gl, - 1 ], [ gr, 1 ] ] ) {
				g.p.set( s * gx, gy, gz );
				g.a.set( - s * 0.97, 0, - sweep ).normalize();
				g.n.set( s * 0.15, 0.8, 0.58 );
				g.r = bike ? 0.017 : 0.02;
			}
		} else {
			// the yoke's horns
			for ( const [ g, s ] of [ [ gl, - 1 ], [ gr, 1 ] ] ) {
				g.p.set( s * 0.14, 0.05, 0 );
				g.a.set( 0, 1, 0 );
				g.n.set( s * 0.75, 0.1, 0.65 );
				g.r = 0.02;
			}
		}
		_n3.setFromMatrix4( _col );
		for ( const g of grips ) {
			g.p.applyMatrix4( _col );
			g.a.applyMatrix3( _n3 ).normalize();
			g.n.applyMatrix3( _n3 ).normalize();
		}
	} else if ( what === 'heli' ) {
		// the cyclic between the knees (right hand), the collective beside the seat (left hand)
		const hx = seat.pos[ 0 ];
		gr.p.set( hx, 1.05, - 0.865 ); gr.a.set( 0, 0.98, 0.2 ).normalize(); gr.n.set( 0.9, 0.05, 0.45 ).normalize(); gr.r = 0.016;
		gl.p.set( hx - 0.28, 0.8, - 0.84 ); gl.a.set( 0.04, 0.37, - 0.93 ).normalize(); gl.n.set( - 0.25, 0.9, 0.35 ).normalize(); gl.r = 0.02;
	} else {
		// resting on the thighs (as the seated figure's legs lie), palms down, fingers forward
		const th = thighTops( v, seat );
		for ( const [ g, s, i ] of [ [ gl, - 1, 0 ], [ gr, 1, 1 ] ] ) {
			const T = th[ i ];
			g.r = 0.09;
			g.n.set( s * 0.15, 1, 0 ).normalize();
			g.p.set( T[ 0 ], T[ 1 ] - g.r, T[ 2 ] );
			g.a.set( - s, 0, 0 );
		}
	}
	return what;
}

// where the seated legs lie: hips on the seat, feet where riderPose puts them, knees up and forward (model frame)
const LEGS = new Map();
export function legsFor( v, seat ) {
	const key = v.model.name + ':' + seat.pos.join( ',' );
	let L = LEGS.get( key );
	if ( L ) return L;
	const pose = riderPose( v.model, v.kind, seat );
	const [ hx, hy, hz ] = seat.pos;
	L = [ - 1, 1 ].map( ( s, i ) => {
		const hip = [ hx + s * 0.1, hy, hz ];
		const foot = pose.feet ? pose.feet[ i ] : [ hx + s * 0.13, hy - 0.42, hz - 0.5 ];
		const bend = [ s * 0.15, 0.8, - 0.6 ];
		return { hip, foot, bend, knee: joint( hip, foot, 0.44, bend ) };
	} );
	LEGS.set( key, L );
	return L;
}

// the top of each thigh a little over half way to the knee (the leg is a tube ~7 cm round there)
function thighTops( v, seat ) {
	return legsFor( v, seat ).map( ( { hip, knee }, i ) => {
		const s = i ? 1 : - 1, t = 0.62;
		return [ hip[ 0 ] + ( knee[ 0 ] - hip[ 0 ] ) * t + s * 0.02, hip[ 1 ] + ( knee[ 1 ] - hip[ 1 ] ) * t + 0.075, hip[ 2 ] + ( knee[ 2 ] - hip[ 2 ] ) * t ];
	} );
}

export class DriverArms {
	constructor() {
		this.group = new THREE.Group();
		this.group.name = 'driver-arms';
		this.group.visible = false;
		this.arms = null; // [ left, right ] RigArm
		this.ready = false;
		this.grips = [ mkGrip(), mkGrip() ];
		this.hand = [ new THREE.Matrix4(), new THREE.Matrix4() ];
		this.curls = null;
		this.styleKey = null;
		this.ease = null; // eased hand targets (a passenger's hands settle)
		if ( typeof window !== 'undefined' && typeof document !== 'undefined' ) loadArmRig().then( rig => this._init( rig ) ).catch( e => console.warn( 'driver arms', e ) );
	}

	_init( rig ) {
		if ( this.disposed ) return;
		setHandMetrics( rig.metrics );
		this.arms = [ rig.make( - 1 ), rig.make( 1 ) ];
		for ( const a of this.arms ) {
			worldMaterial( a.mSkin, 0.6 );
			for ( const m of [ a.mGlove, a.mLatex, a.mCuff, a.mSleeve ] ) worldMaterial( m, 0.5 );
			a.bend = 0.55;
			this.group.add( a.root );
		}
		// finger curls, solved once: a steering wheel's rim, a handlebar grip, a stick, a relaxed hand on a thigh
		this.curls = { rim: curlFor( 0.017, 1.05 ), bar: curlFor( 0.017, 1.0 ), stick: curlFor( 0.016, 1.05 ), rest: curlFor( 0.07, 0.45 ) };
		this.ready = true;
		if ( this._style ) this.setStyle( this._style );
	}

	setStyle( o ) {
		this._style = o;
		if ( ! this.ready ) return;
		const key = `${o.sleeve}:${o.long}:${o.print?.uuid}:${o.glove}:${o.gloveStyle}`;
		if ( key === this.styleKey ) return;
		this.styleKey = key;
		for ( const a of this.arms ) a.style( o );
	}

	// shown on this vehicle's seat (null: hidden)
	attach( v ) {
		const parent = v ? v.object : null;
		if ( this.group.parent !== parent ) {
			this.group.parent?.remove( this.group );
			if ( parent ) parent.add( this.group );
			this.ease = null;
		}
		this.group.visible = !! parent && this.ready;
	}

	// what the hands hold for a seat: 'wheel' | 'bars' | 'yoke' | 'heli' | 'rest'
	static controls( v, seat ) { return controlsOf( v, seat ); }

	// pose both arms for the seat this frame (model frame of the vehicle)
	update( v, seat, dt ) {
		if ( ! this.ready || ! this.group.visible ) return;
		const what = gripsFor( v, seat, this.grips );
		const C = this.curls;
		const curl = what === 'bars' ? C.bar : what === 'heli' ? C.stick : what === 'rest' ? C.rest : C.rim;
		const thumb = what === 'rest' ? THUMB_POSE.relaxed : THUMB_POSE.wrap;
		// shoulders under and behind the eye, elbows hanging down and out
		const [ ex, ey, ez ] = seat.eye;
		for ( let i = 0; i < 2; i ++ ) {
			const s = i === LEFT ? - 1 : 1;
			const arm = this.arms[ i ];
			const hand = wristMatrix( this.grips[ i ], s, this.hand[ i ] );
			_sh.set( ex + s * 0.2, ey - 0.25, ez + 0.1 );
			_el.set( ex + s * ( what === 'bars' ? 0.5 : 0.45 ), ey - ( what === 'rest' ? 0.65 : 0.6 ), ez + 0.05 );
			arm.setCurl( curl, thumb );
			arm.pose( _sh, hand, arm.bend, _el );
		}
		void dt;
	}

	dispose() {
		this.disposed = true;
		this.group.parent?.remove( this.group );
		for ( const a of this.arms || [] ) a.dispose();
		this.arms = null; this.ready = false;
	}
}
