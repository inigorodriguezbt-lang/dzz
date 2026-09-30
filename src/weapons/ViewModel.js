// The first-person view: the held item (gun with magazine, optic, suppressor and light, a melee weapon, a
// grenade, a tool or any item) and both arms, posed procedurally every frame in game.viewScene.
//
// Frames: view space = the view camera's (origin at the eye, -Z forward). A gun's own frame has +X towards the
// muzzle (see GunModels.js); the `holder` group carries that frame. Poses are blended from a hold pose (long guns
// at a low ready to the right pointing into the screen, pistols out in both hands, melee weapons from MELEE_HOLD,
// grenades / tools / items from a posed right hand in HAND_HOLD), the aimed pose (the sight line through the eye),
// a sprint pose and the current action's keyframes, then sway, walk bob and spring-damped recoil are layered on.
// Hands wrap grip cylinders (Arms.js: diagonal power grip, fitted finger curl) with the thumbs laid in the gun's own
// frame (GUN_THUMB); each forearm leaves the wrist towards where the elbow hangs (as far as a wrist bends), and the
// upper arm reaches back to the shoulder. The arms are the modelled ones of ArmRig.js once loaded.
//
// Hands.js drives it through `vm.s` (state) and calls fire() / eject() / setItem().
import * as THREE from 'three';
import { getItem } from '../game/items/ItemDB.js';
import { buildGunView, buildMagView, buildAttachmentView, buildMeleeView, buildThrowableView, weaponMaterials, CALIBERS } from './GunModels.js';
import { Arm, curlFor, wristMatrix, THUMB_POSE, setHandMetrics } from './Arms.js';
import { loadArmRig } from './ArmRig.js';
import { reticleLens, integratedLens, aimLens, ScopeOverlay, OVERLAY_RETICLES } from './Optics.js';
import { buildItemModel, modelInfo } from '../render/ItemModels.js';

const PI = Math.PI;
const V = ( x = 0, y = 0, z = 0 ) => new THREE.Vector3( x, y, z );
const E = ( x, y, z ) => new THREE.Quaternion().setFromEuler( new THREE.Euler( x, y, z, 'YXZ' ) );
const GUN_Q = new THREE.Quaternion().setFromAxisAngle( V( 0, 1, 0 ), PI / 2 ); // gun +X -> view -Z
const AX_X = V( 1, 0, 0 );
const clamp = THREE.MathUtils.clamp;
const smooth = ( t ) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * ( 3 - 2 * t );
const seg = ( t, a, b ) => smooth( ( t - a ) / ( b - a ) ); // 0 before a, 1 after b
const easeOut = ( t ) => 1 - Math.pow( 1 - clamp( t, 0, 1 ), 3 );
const _v = V(), _v2 = V(), _v3 = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = V( 1, 1, 1 );
const _pa = V(), _pb = V(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _sa = V(), _sb = V();
// per-frame scratch (the view model poses every frame: nothing is allocated there)
const _P = V(), _Q = new THREE.Quaternion(), _e = new THREE.Euler( 0, 0, 0, 'YXZ' ), _adsP = V(), _M1 = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _M3 = new THREE.Matrix4();

// interpolate two rigid transforms
function blendMat( a, b, t, out ) {
	if ( t <= 0 ) return out.copy( a );
	if ( t >= 1 ) return out.copy( b );
	a.decompose( _pa, _qa, _sa ); b.decompose( _pb, _qb, _sb );
	_pa.lerp( _pb, t ); _qa.slerp( _qb, t );
	return out.compose( _pa, _qa, _s.set( 1, 1, 1 ) );
}
// a quaternion from two axes (x primary, y secondary) of a frame
function basisQ( x, y, out = new THREE.Quaternion() ) {
	const X = x.clone().normalize(), Y = y.clone().addScaledVector( X, - y.dot( X ) ).normalize(), Z = X.clone().cross( Y );
	return out.setFromRotationMatrix( _m.makeBasis( X, Y, Z ) );
}
// scratch grips for the per-frame choreography (no allocation): gs( slot, px, py, pz, ax, ay, az, nx, ny, nz, r )
const GS = [ 0, 1, 2, 3 ].map( () => ( { p: new THREE.Vector3(), a: new THREE.Vector3(), n: new THREE.Vector3(), r: 0 } ) );
const gs = ( i, px, py, pz, ax, ay, az, nx, ny, nz, r ) => { const g = GS[ i ]; g.p.set( px, py, pz ); g.a.set( ax, ay, az ).normalize(); g.n.set( nx, ny, nz ).normalize(); g.r = r; return g; };
const grip = ( p, a, n, r, extra = null ) => ( { p: p.clone ? p.clone() : V( ...p ), a: ( a.clone ? a.clone() : V( ...a ) ).normalize(), n: ( n.clone ? n.clone() : V( ...n ) ).normalize(), r, ...extra } );
// the right hand holding a grenade / tool / item: wrist position in view space, the knuckle line (x) and the back
// of the hand (y)
const HAND_HOLD = {
	throw: { at: [ 0.12, - 0.15, - 0.35 ], x: [ - 0.4, 0.6, 0.7 ], y: [ 0.6, - 0.3, 0.75 ] },
	item: { at: [ 0.13, - 0.16, - 0.32 ], x: [ - 0.2, 0.5, 0.85 ], y: [ 0.75, - 0.55, 0.3 ] },
	// torches and other long things point forward, held overhand
	long: { at: [ 0.2, - 0.17, - 0.32 ], x: [ - 0.1, 0.2, - 1 ], y: [ - 0.3, - 0.95, 0 ] },
};
// gun holds at the hip: the gun frame's origin (trigger, on the bore line) in view space, its turn (pitch, yaw, roll;
// yaw + points the muzzle in towards the crosshair, roll + leans the top in to show its right side) and where the
// elbows hang. Long guns sit low and right, pointing into the scene just under the crosshair; pistols are out in front
// in both hands. The screen's bottom-right corner is the HUD's weapon panel: the hands stay left of it.
const GUN_HOLD = {
	rifle: { p: [ 0.1, - 0.092, - 0.52 ], r: [ 0.015, 0.045, 0.12 ], eR: [ 0.3, - 0.42, - 0.1 ], eL: [ - 0.2, - 0.45, - 0.32 ] },
	heavy: { p: [ 0.105, - 0.097, - 0.53 ], r: [ 0.015, 0.04, 0.1 ], eR: [ 0.3, - 0.42, - 0.1 ], eL: [ - 0.2, - 0.45, - 0.32 ] },
	stock: { p: [ 0.105, - 0.087, - 0.51 ], r: [ 0.015, 0.045, 0.12 ], eR: [ 0.3, - 0.4, - 0.1 ], eL: [ - 0.2, - 0.45, - 0.32 ] },
	pistol: { p: [ 0.06, - 0.075, - 0.46 ], r: [ 0.03, 0.15, 0.1 ], eR: [ 0.22, - 0.42, - 0.2 ], eL: [ - 0.1, - 0.44, - 0.22 ] },
	bow: { p: [ 0.0, - 0.1, - 0.5 ], r: [ 0.02, 0.12, - 0.4 ], eR: [ 0.3, - 0.4, 0.0 ], eL: [ - 0.2, - 0.4, - 0.3 ] },
};
// a bolt handle's knob, in the handle's frame: the firing hand closes on it from behind and below
const BOLT_KNOB = grip( [ - 0.09, - 0.034, 0.054 ], [ 0.35, 0.93, 0 ], [ 0.1, 0.2, 1 ], 0.012 );
// elbows for anything held that isn't a gun
const ITEM_ELBOW_R = V( 0.24, - 0.44, - 0.14 ), ITEM_ELBOW_L = V( - 0.16, - 0.46, - 0.2 );
// sprinting: where the gun frame goes (view space) and its turn
const SPRINT = {
	rifleP: V( 0.1, - 0.18, - 0.41 ), rifleQ: E( 0.25, 0.6, 0.45 ),
	pistolP: V( 0.07, - 0.13, - 0.38 ), pistolQ: E( - 0.45, 0.35, 0.3 ),
	itemQ: E( - 0.2, 0.1, 0 ),
};
// melee holds: where the right hand's grip sits in view space and how the item points
const MELEE_HOLD = {
	knife: { at: [ 0.13, - 0.14, - 0.36 ], x: [ - 0.38, 0.3, - 0.88 ], y: [ 0.9, 0.42, 0 ] },
	one: { at: [ 0.14, - 0.15, - 0.4 ], x: [ - 0.3, 0.45, - 0.85 ], y: [ 1, 0.25, 0.2 ] },
	two: { at: [ 0.12, - 0.15, - 0.45 ], x: [ 0.45, 0.75, - 0.45 ], y: [ - 0.3, 0.1, - 1 ] },
	spear: { at: [ 0.14, - 0.17, - 0.32 ], x: [ - 0.1, 0.15, - 1 ], y: [ 0, 1, 0 ] },
};
// the bow's drawing hand: three fingers hooked on the string
const BOW_CURL = [ [ 0.9, 1.1, 0.6 ], [ 0.9, 1.1, 0.6 ], [ 0.9, 1.1, 0.6 ], [ 1.4, 1.5, 1.0 ] ];
// thumbs on a gun, in the gun's own frame (+x to the muzzle, +y up, +z its right side): where the thumb points, where
// its nail faces, its two joints' bend. The modelled hand is posed from these (whatever the grip's angle); the
// procedural fallback keeps its THUMB_POSE.
const GUN_THUMB = {
	// firing hand round a pistol grip: across the back strap and forward along the left side of the frame
	grip: { dir: [ 0.75, 0.25, - 0.6 ], up: [ - 0.35, 0.75, - 0.55 ], flex: [ 0.2, 0.15 ] },
	// both thumbs forward along the left of a pistol's frame, the support thumb under the firing one
	pistolR: { dir: [ 0.85, 0.08, - 0.5 ], up: [ - 0.2, 0.75, - 0.6 ], flex: [ 0.12, 0.06 ] },
	pistolL: { dir: [ 0.95, - 0.08, - 0.28 ], up: [ 0, 0.45, - 0.9 ], flex: [ 0.06, 0.02 ] },
	// support hand under a handguard or a pump: laid forward along its left side
	along: { dir: [ 0.85, 0.2, 0.45 ], up: [ 0, 0.5, - 0.85 ], flex: [ 0.1, 0.05 ] },
};

// a simple damped spring (recoil channels)
class Spring {
	constructor( k = 220, c = 22 ) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
	// sub-stepped: a long frame (a hitch, a slow machine) must not blow the integration up
	step( dt ) {
		const n = Math.min( 12, Math.ceil( dt * 240 ) ), h = dt / n;
		for ( let i = 0; i < n; i ++ ) { const a = - this.k * this.x - this.c * this.v; this.v += a * h; this.x += this.v * h; }
		return this.x;
	}
}

// ---- small procedural textures for the flash -------------------------------------------------------------------------
let FLASH_TEX = null;
function flashTextures() {
	if ( FLASH_TEX || typeof document === 'undefined' ) return FLASH_TEX;
	const mk = ( draw ) => { const c = document.createElement( 'canvas' ); c.width = c.height = 128; draw( c.getContext( '2d' ), 64 ); const t = new THREE.CanvasTexture( c ); return t; };
	FLASH_TEX = {
		star: mk( ( g, h ) => {
			let gr = g.createRadialGradient( h, h, 0, h, h, h * 0.6 ); gr.addColorStop( 0, 'rgba(255,255,255,1)' ); gr.addColorStop( 0.4, 'rgba(255,255,255,0.6)' ); gr.addColorStop( 1, 'rgba(255,255,255,0)' );
			g.fillStyle = gr; g.fillRect( 0, 0, 128, 128 );
			for ( let i = 0; i < 7; i ++ ) {
				const a = i / 7 * PI * 2 + Math.random() * 0.4, L = h * ( 0.6 + Math.random() * 0.4 ), w = h * 0.1;
				g.save(); g.translate( h, h ); g.rotate( a );
				gr = g.createLinearGradient( 0, 0, L, 0 ); gr.addColorStop( 0, 'rgba(255,255,255,0.9)' ); gr.addColorStop( 1, 'rgba(255,255,255,0)' );
				g.fillStyle = gr; g.beginPath(); g.moveTo( 0, - w ); g.lineTo( L, 0 ); g.lineTo( 0, w ); g.fill(); g.restore();
			}
		} ),
		cone: mk( ( g, h ) => {
			for ( let k = 0; k < 3; k ++ ) {
				const gr = g.createLinearGradient( 0, h, 128, h ); gr.addColorStop( 0, 'rgba(255,255,255,0.9)' ); gr.addColorStop( 0.5, 'rgba(255,255,255,0.45)' ); gr.addColorStop( 1, 'rgba(255,255,255,0)' );
				g.fillStyle = gr; const w = h * ( 0.55 - k * 0.15 );
				g.beginPath(); g.moveTo( 0, h - w * 0.35 ); g.quadraticCurveTo( 64, h - w, 128 - k * 20, h ); g.quadraticCurveTo( 64, h + w, 0, h + w * 0.35 ); g.fill();
			}
		} ),
	};
	return FLASH_TEX;
}

// what the view shows for the held item
// kind: 'gun' | 'melee' | 'throw' | 'tool' | 'item' | 'fists' | null
export class ViewModel {
	constructor( scene ) {
		this.scene = scene;
		this.root = new THREE.Group();
		this.root.name = 'viewmodel';
		scene.add( this.root );
		this.holder = new THREE.Group();
		this.root.add( this.holder );
		// procedural arms until the modelled ones (ArmRig.js) have loaded, and for good if they can't
		this.armR = new Arm( 1 );
		this.armL = new Arm( - 1 );
		this.root.add( this.armR.root, this.armL.root );
		if ( typeof document !== 'undefined' ) loadArmRig().then( rig => { if ( ! this._disposed ) this._useRig( rig ); } ).catch( e => console.warn( 'arm rig', e ) );
		this.shoulderR = V( 0.19, - 0.25, 0.1 );
		this.shoulderL = V( - 0.19, - 0.25, 0.08 );
		// where the elbows hang when both hands are on a gun: tucked down, the right one out a little
		this.elbowR = V( 0.3, - 0.42, 0.0 );
		this.elbowL = V( - 0.14, - 0.52, - 0.2 );
		// muzzle flash: a camera-facing star and crossed side flames along the barrel
		const T = flashTextures();
		const fm = ( map = null ) => new THREE.MeshBasicMaterial( { map, color: new THREE.Color( 7, 4.2, 1.9 ), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false } );
		this.flashStar = new THREE.Mesh( new THREE.PlaneGeometry( 1, 1 ), fm( T?.star ) );
		this.flashSide = new THREE.Group();
		for ( let i = 0; i < 2; i ++ ) {
			const g = new THREE.PlaneGeometry( 1, 0.45 ); g.translate( 0.5, 0, 0 );
			const m = new THREE.Mesh( g, fm( T?.cone ) );
			m.rotation.x = i * PI / 2;
			this.flashSide.add( m );
		}
		for ( const m of [ this.flashStar, ...this.flashSide.children ] ) { m.renderOrder = 30; m.frustumCulled = false; }
		this.flashStar.visible = false; this.flashSide.visible = false;
		this.root.add( this.flashStar );
		this.holder.add( this.flashSide );
		this.flashT = 0;
		// the flash's light lives in the scene itself, not under the (sometimes hidden) root: the light count the view
		// materials are compiled for must never change, or every one of them recompiles
		this.light = new THREE.PointLight( 0xffb070, 0, 2.5, 2 );
		scene.add( this.light );
		// ejected brass in view (quick: they tumble out of frame in half a second)
		this.casings = [];
		const cgeo = new THREE.CylinderGeometry( 1, 1, 1, 8, 1 ); cgeo.rotateZ( PI / 2 );
		const brass = weaponMaterials( 'view' ).brass, red = weaponMaterials( 'view' ).red;
		for ( let i = 0; i < 10; i ++ ) {
			const m = new THREE.Mesh( cgeo, brass );
			m.visible = false; m.frustumCulled = false;
			this.root.add( m );
			this.casings.push( { m, v: V(), w: V(), t: 1, brass, red } );
		}
		this.overlay = new ScopeOverlay();
		this.root.add( this.overlay.mesh );
		// held shells / rounds / arrows during reloads
		this.handProp = new THREE.Group();
		this.root.add( this.handProp );
		this.item = null;
		this.s = this.defaultState();
		this.rec = { back: new Spring( 260, 26 ), pitch: new Spring( 200, 20 ), yaw: new Spring( 180, 20 ), roll: new Spring( 160, 16 ), up: new Spring( 220, 24 ) };
		this.lag = { yaw: 0, pitch: 0, vy: 0 };
		this.t = 0;
		this.aspect = 16 / 9;
		this.viewFovV = 55;
		this.handR = new THREE.Matrix4(); this.handL = new THREE.Matrix4();
		this.visible = true;
		this.style = {};
	}

	defaultState() {
		return {
			ads: 0, sprint: 0, lower: 0, block: 0, equip: 1, act: null, trigger: 0, draw: 0, cook: 0,
			breath: 1, swayK: 1, bob: 0, bobAmt: 0, moving: 0, velY: 0, crouch: 0, prone: 0, lookYaw: 0, lookPitch: 0, freeYaw: 0, freePitch: 0,
			lean: 0, time: 0, empty: false, overlay: false, flashlightOn: false, lit: false,
		};
	}

	// ---- building the held visual ----------------------------------------------------------------------------------

	clear() {
		if ( this.item ) {
			this.holder.remove( this.item.obj );
			// what this build made for itself (reticle lenses, bow strings); the shared weapon materials and baked
			// geometry stay
			for ( const r of this.item.own || [] ) r.dispose();
			this.item = null;
		}
		this._clearHandProp();
		this.overlay.update( 0, this.aspect );
	}

	_clearHandProp() {
		for ( const m of this.handProp.children ) m.geometry?.dispose();
		this.handProp.clear();
		this.handProp.userData.cal = null;
	}

	// stack: the held ItemStack (null = nothing). Rebuilds only when what's visible changed.
	setItem( stack, kind ) {
		const def = stack ? getItem( stack.id ) : null;
		const sig = stack ? `${stack.uid}:${stack.id}:${stack.data?.mag?.id || ''}:${Object.values( stack.data?.att || {} ).map( a => a?.id ).join( ',' )}:${kind}` : kind || '';
		if ( sig === this.sig ) return this.item;
		this.sig = sig;
		this.clear();
		if ( ! def && kind !== 'fists' ) return null;
		let it;
		if ( kind === 'gun' ) it = this._buildGun( stack, def );
		else if ( kind === 'melee' ) it = this._buildMelee( def );
		else if ( kind === 'throw' ) it = this._buildThrowable( def );
		else if ( kind === 'fists' ) it = { kind: 'fists', obj: new THREE.Group(), grips: {}, def: null };
		else it = this._buildItem( def, kind );
		it.stack = stack;
		this.item = it;
		this.holder.add( it.obj );
		this.flashSide.position.set( ...( it.muzzle || [ 0, 0, 0 ] ) );
		return it;
	}

	_buildGun( stack, def ) {
		const f = def.firearm;
		const v = buildGunView( def, 'view' );
		const info = v.info, parts = v.parts;
		const it = { kind: 'gun', def, obj: v.obj, info, parts, f, mag: null, mag2: null, optic: null, lens: null, supp: null, light: null, own: [] };
		for ( const p of Object.values( parts ) ) p.userData.rest = p.userData.rest || p.position.clone();
		// magazine in the well
		const magStack = stack?.data?.mag;
		if ( f.feed === 'mag' && info.mag ) {
			const md = getItem( magStack?.id || f.mags[ 0 ] );
			it.mag = this._magObj( md, info );
			it.mag.visible = !! magStack;
			v.obj.add( it.mag );
		}
		// attachments
		const att = stack?.data?.att || {};
		let muzzleX = info.muzzle[ 0 ];
		if ( att.optic && info.optic ) {
			const ad = getItem( att.optic.id );
			const o = buildAttachmentView( ad, 'view' );
			o.obj.position.set( info.optic[ 0 ], info.optic[ 1 ], 0 );
			v.obj.add( o.obj );
			it.optic = { def: ad, info: o.info, obj: o.obj, overlay: OVERLAY_RETICLES.has( ad.attachment.reticle ) };
			for ( const n of info.hideWithOptic || [] ) if ( parts[ n ] ) parts[ n ].visible = false;
			for ( const n of info.opticParts || [] ) if ( parts[ n ] ) parts[ n ].visible = true;
			if ( ! it.optic.overlay || ad.attachment.reticle === 'acog' ) {
				it.lens = reticleLens( ad, o.info );
				o.obj.add( it.lens );
				it.own.push( it.lens.geometry, it.lens.material );
			}
		}
		if ( info.integratedOptic ) { it.lens = integratedLens( info.integratedOptic ); v.obj.add( it.lens ); it.own.push( it.lens.geometry, it.lens.material ); }
		if ( att.muzzle ) {
			const ad = getItem( att.muzzle.id );
			const o = buildAttachmentView( ad, 'view' );
			o.obj.position.set( ...info.muzzle );
			v.obj.add( o.obj );
			it.supp = { def: ad, obj: o.obj };
			muzzleX += o.info.len || 0.15;
		}
		if ( att.light && info.light ) {
			const ad = getItem( att.light.id );
			const o = buildAttachmentView( ad, 'view' );
			o.obj.position.set( ...info.light );
			if ( info.lightDown ) o.obj.rotation.x = PI / 2;
			v.obj.add( o.obj );
			it.light = { def: ad, obj: o.obj, info: o.info };
		}
		it.muzzle = [ muzzleX, info.muzzle[ 1 ], info.muzzle[ 2 ] ];
		// the bow's string is redrawn every frame from the cams to the nock
		if ( info.bow || info.crossbow ) {
			if ( parts.string ) parts.string.visible = false;
			const sm = weaponMaterials( 'view' ).string;
			const cg = new THREE.CylinderGeometry( 0.0018, 0.0018, 1, 4, 1 ); cg.translate( 0, 0.5, 0 );
			it.own.push( cg );
			it.strings = [ new THREE.Mesh( cg, sm ), new THREE.Mesh( cg, sm ) ];
			for ( const s of it.strings ) { s.frustumCulled = false; v.obj.add( s ); }
			it.nockRest = info.bow ? - 0.16 : 0.385;
			it.cams = info.bow ? [ V( - 0.07, 0.475, 0 ), V( - 0.07, - 0.475, 0 ) ] : [ V( 0.385, 0.012, 0.33 ), V( 0.385, 0.012, - 0.33 ) ];
		}
		// grips in the gun frame (GunModels). A support hand under a handguard cups it from below: the palm faces up
		// and a little to the left, the wrist hangs low on the left, the fingers wrap round the right side
		// the handguard lies diagonally across the palm (heel to the index knuckle), so the forearm comes back towards
		// the body instead of out to the side
		let L = info.grips.L;
		if ( L && ! L.support && ! L.vert && ! L.under && ! L.bow ) L = { ...L, n: V( 0, - 1, - 0.3 ).normalize(), beta: 0.6, dz: 0.015, sink: 0.006 };
		// a straight stock's wrist (shotguns, hunting rifles) is held with the back of the hand turned down a little, so
		// the knuckles stay under the comb when the gun is aimed
		let R = info.grips.R;
		if ( R && R.p.y > - 0.06 && ! L?.support ) R = { ...R, p: R.p.clone().add( V( - 0.02, - 0.012, 0 ) ), n: V( 0.05, - 0.2, 1 ).normalize() };
		it.grips = { R, L };
		it.eye = this._eyePoint( it );
		it.cls = f.cls;
		it.heavy = !! info.heavy || def.weight > 6;
		return it;
	}

	_magObj( md, info ) {
		const g = new THREE.Group();
		const m = buildMagView( md, 'view' );
		g.add( m );
		g.position.set( ...info.mag.p );
		g.rotation.z = info.mag.rake || 0;
		g.userData.def = md;
		g.userData.rest = g.position.clone();
		return g;
	}

	// the eye point in the gun frame for aiming: behind the optic, or behind the irons
	_eyePoint( it ) {
		const info = it.info;
		if ( it.optic ) {
			const oi = it.optic.info;
			const relief = ( oi.eyeRelief ?? 0.15 ) + ( it.optic.overlay ? 0.02 : 0.03 );
			return V( info.optic[ 0 ] + ( oi.rearX ?? - 0.03 ) - relief, info.optic[ 1 ] + oi.axisH, 0 );
		}
		if ( info.integratedOptic ) return V( info.integratedOptic.x0 - 0.1, info.integratedOptic.y, 0 );
		// a little further back than a real cheek weld: the view FOV is narrow and the irons would fill it
		// (pistols sit out at arm's length)
		const extra = { pistol: 0.12, smg: 0.07, rifle: 0.08, sniper: 0.06, shotgun: 0.07, lmg: 0.08, bow: 0 }[ it.f.cls ] ?? 0.06;
		// a bow is aimed past the right of its riser, looking down the arrow
		if ( info.bow ) return V( info.rearX - info.eyeBack - 0.08, info.sightH * 0.9, 0.018 );
		// (a bolt gun's irons sit out on the barrel: the eye stays behind the bolt shroud)
		const x = info.rearX - info.eyeBack - extra;
		return V( info.boltHandle ? Math.min( x, - 0.3 ) : x, info.sightH, 0 );
	}

	_buildMelee( def ) {
		const v = buildMeleeView( def, 'view' );
		const info = v.info;
		const m = def.melee;
		const two = !! m.twoHanded && info.grip2 != null;
		// the pose family: small blades held forward, one-handers up at the right, long two-handers across the body
		const len = info.len || 0.4;
		const hold = two ? ( m.kind === 'spear' ? 'spear' : 'two' ) : len < 0.34 ? 'knife' : 'one';
		const r = 0.0135;
		// right-handed on a two-hander: the left hand low by the end, the right hand up the handle
		const it = {
			kind: 'melee', def, obj: v.obj, info, two, len, hold,
			grips: {
				R: grip( [ two ? info.grip2 : info.grip, 0, 0 ], [ 1, 0, 0 ], [ 0, - 0.2, 1 ], r ),
				L: two ? grip( [ info.grip, 0, 0 ], [ 1, 0, 0 ], [ 0, - 0.2, - 1 ], r ) : null,
			},
		};
		return it;
	}

	_buildThrowable( def ) {
		const obj = buildThrowableView( def, 'view' );
		const k = def.throwable.kind;
		const g = new THREE.Group();
		g.add( obj );
		const r = k === 'molotov' ? 0.033 : k === 'frag' ? 0.03 : 0.029;
		return { kind: 'throw', def, obj: g, inner: obj, grips: { R: grip( [ 0, k === 'molotov' ? - 0.02 : - 0.005, 0 ], [ 0, 1, 0.2 ], [ 0.3, 0, 1 ], r ) } };
	}

	_buildItem( def, kind ) {
		const g = new THREE.Group();
		let info = { size: V( 0.1, 0.1, 0.1 ), centre: V( 0, 0.05, 0 ) };
		try {
			const tpl = buildItemModel( def );
			info = modelInfo( def );
			const obj = tpl.clone( true );
			// the world versions are fogged against the world camera: the view needs its own copies
			obj.traverse( m => {
				if ( ! m.isMesh ) return;
				m.material = Array.isArray( m.material ) ? m.material.map( viewCopy ) : viewCopy( m.material );
				m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
				m.layers.set( 0 );
			} );
			obj.position.copy( info.centre ).negate();
			g.add( obj );
		} catch ( e ) { console.warn( 'view item', def.id, e ); }
		const sz = info.size;
		const r = clamp( Math.min( sz.y, sz.z ) * 0.5, 0.012, 0.045 );
		const long = sz.x > 0.12;
		return {
			kind, def, obj: g, size: sz.clone(), long,
			grips: { R: grip( [ long ? - sz.x * 0.15 : 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0.25 ], r ) },
		};
	}

	// environment reflections for the view materials (a PMREM texture) and its strength
	setEnvironment( tex ) {
		this.env = tex;
		for ( const m of Object.values( weaponMaterials( 'view' ) ) ) { m.envMap = tex; m.needsUpdate = true; }
		this.armR.setEnvironment( tex, this._envI ?? 0.5 ); this.armL.setEnvironment( tex, this._envI ?? 0.5 );
	}
	setLighting( envIntensity ) {
		if ( Math.abs( ( this._envI ?? - 1 ) - envIntensity ) < 0.01 ) return;
		this._envI = envIntensity;
		for ( const m of Object.values( weaponMaterials( 'view' ) ) ) m.envMapIntensity = envIntensity;
		if ( this.env ) { this.armR.setEnvironment( this.env, envIntensity ); this.armL.setEnvironment( this.env, envIntensity ); }
	}

	// clothing on the arms: { skin, sleeve (colour), long, print (fabric texture), glove (colour) }
	setArms( o ) {
		const key = `${o.skin}:${o.sleeve}:${o.long}:${o.print?.uuid}:${o.glove}:${o.gloveStyle}`;
		if ( key === this._armKey ) return;
		this._armKey = key;
		this._armStyle = o;
		this.armR.style( o ); this.armL.style( o );
	}

	// swap in the modelled arms: the grip solver takes their hand's measurements
	_useRig( rig ) {
		setHandMetrics( rig.metrics );
		const old = [ this.armR, this.armL ];
		this.armR = rig.make( 1 ); this.armL = rig.make( - 1 );
		this.root.add( this.armR.root, this.armL.root );
		for ( const a of old ) a.dispose();
		this.armR.visible = this.armL.visible = false;
		if ( this._armStyle ) { this.armR.style( this._armStyle ); this.armL.style( this._armStyle ); }
		if ( this.env ) this.setEnvironment( this.env );
		this.onArms?.();
		// the reload hands' grips, solved ahead in idle moments (~10 ms each) rather than as hitches mid-reload
		const pre = [ [ 0.028, 1 ], [ 0.012, 1.2 ], [ 0.006, 1.1 ], [ 0.02, 0.8 ], [ 0.01, 1.1 ], [ 0.03, 0.5 ], [ 0.02, 1.3 ] ];
		const next = () => { if ( this._disposed || ! pre.length ) return; curlFor( ...pre.shift() ); setTimeout( next, 60 ); };
		setTimeout( next, 500 );
	}

	// ---- events from Hands ---------------------------------------------------------------------------------------------

	// recoil: k = the gun's recoil (1 = carbine), ads 0..1
	kick( k, ads = 0, o = {} ) {
		const r = this.rec;
		const heavy = this.item?.heavy ? 0.8 : 1;
		const pistol = this.item?.cls === 'pistol';
		// spring velocities chosen so the peaks land around: 3 cm back, 3 degrees up (more for pistols)
		const kk = Math.min( 2.2, 0.55 + 0.45 * k );
		r.back.v += 0.75 * kk * ( 1 - ads * 0.35 ) * heavy;
		r.pitch.v += ( pistol ? 2.4 : 1.2 ) * kk * ( 1 - ads * 0.35 ) * ( 0.85 + Math.random() * 0.3 );
		r.up.v += ( pistol ? 0.3 : 0.15 ) * kk;
		r.yaw.v += ( Math.random() - 0.5 ) * 0.5 * kk;
		r.roll.v += ( Math.random() - 0.35 ) * 0.9 * kk * ( 1 - ads * 0.5 );
		this.cycleT = 0;
		if ( o.flash !== false ) this.muzzleFlash( o.scale || 1 );
	}

	muzzleFlash( scale = 1 ) {
		this.flashT = 0.055;
		this.flashScale = scale * ( 0.8 + Math.random() * 0.4 );
		this.flashStar.material.rotation = Math.random() * PI * 2;
		this.flashSide.rotation.x = Math.random() * PI;
		this.light.intensity = 0.6 * scale;
	}

	// throw a casing out of the port: shell = shotgun hull
	eject( cal = '5.56', shell = false ) {
		const it = this.item;
		if ( ! it?.info?.eject ) return;
		const c = this.casings.find( x => x.t >= 0.9 ) || this.casings[ 0 ];
		const C = CALIBERS[ cal ] || CALIBERS[ '5.56' ];
		c.m.material = shell ? c.red : c.brass;
		c.m.scale.set( ( shell ? C.len : C.len * C.caseF ) * 0.9, C.r, C.r );
		it.obj.updateWorldMatrix( true, false );
		c.m.position.set( ...it.info.eject ).applyMatrix4( it.obj.matrixWorld );
		// out to the right and up, a little back, in the gun frame
		const side = it.info.eject[ 2 ] >= 0 ? 1 : - 1;
		_q.setFromRotationMatrix( it.obj.matrixWorld );
		c.v.set( - 0.5 - Math.random() * 0.4, 1.3 + Math.random() * 0.6, side * ( 1.6 + Math.random() * 0.7 ) ).applyQuaternion( _q );
		c.w.set( Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15 );
		c.m.quaternion.copy( _q );
		c.t = 0;
		c.m.visible = true;
	}

	// ---- per-frame pose ---------------------------------------------------------------------------------------------------

	update( dt, cam = null ) {
		this.t += dt;
		const s = this.s, it = this.item;
		if ( cam ) { this.aspect = cam.aspect; this.viewFovV = cam.fov; }
		this._updateCasings( dt );
		this.cycleT = ( this.cycleT ?? 1 ) + dt;
		// recoil springs
		const rb = this.rec.back.step( dt ), rp = this.rec.pitch.step( dt ), ry = this.rec.yaw.step( dt ), rr = this.rec.roll.step( dt ), ru = this.rec.up.step( dt );
		// muzzle flash
		if ( this.flashT > 0 ) this.flashT -= dt;
		const fl = this.flashT > 0 && this.visible;
		this.flashStar.visible = fl; this.flashSide.visible = fl;
		this.light.intensity *= Math.max( 0, 1 - dt * 40 );
		if ( ! it || ! this.visible ) {
			this.root.visible = false;
			this.overlay.update( 0, this.aspect );
			return;
		}
		this.root.visible = true;
		// weapon lag behind the look (reads as inertia)
		const L = this.lag;
		const ty = clamp( - s.lookYaw * 0.9, - 0.09, 0.09 ) * ( 1 - s.ads * 0.7 ), tp = clamp( - s.lookPitch * 0.9, - 0.07, 0.07 ) * ( 1 - s.ads * 0.7 );
		L.yaw += ( ty - L.yaw ) * Math.min( 1, dt * 9 );
		L.pitch += ( tp - L.pitch ) * Math.min( 1, dt * 9 );
		L.vy += ( clamp( - s.velY * 0.006, - 0.04, 0.04 ) - L.vy ) * Math.min( 1, dt * 7 );

		// base pose
		const P = _P.set( 0, 0, 0 ), Q = _Q.identity();
		this._basePose( it, P, Q );
		// breathing / idle sway, walk bob
		const t = this.t;
		const bobA = s.bobAmt * ( 1 - s.ads * 0.8 ) * ( 1 + s.sprint * 0.9 );
		const bx = Math.cos( s.bob ) * 0.011 * bobA, by = - Math.abs( Math.sin( s.bob ) ) * 0.016 * bobA;
		P.x += bx + Math.sin( t * 1.3 ) * 0.0012 * ( 1 - s.ads ); P.y += by + Math.sin( t * 2.1 ) * 0.0015 * ( 1 - s.ads ) + L.vy;
		// aim sway (the gun rotates about the eye when aimed: that's what moves the sight picture)
		const A = 0.0035 * s.swayK * s.breath;
		const swY = Math.sin( t * 0.83 ) * A + Math.sin( t * 2.1 + 1 ) * A * 0.3, swP = Math.sin( t * 1.27 + 0.5 ) * A * 0.7 + Math.sin( t * 0.5 ) * A * 0.4;
		_q.setFromEuler( _e.set( swP + L.pitch + Math.sin( s.bob * 2 ) * 0.004 * bobA - s.freePitch, swY + L.yaw + Math.cos( s.bob ) * 0.006 * bobA - s.freeYaw, Math.cos( s.bob ) * 0.02 * bobA, 'YXZ' ) );
		// pivot: the gun's own grip at the hip, the eye when aimed
		const pivot = _v3.set( 0, 0, 0 ).lerp( P, 1 - s.ads );
		P.sub( pivot ).applyQuaternion( _q ).add( pivot );
		Q.premultiply( _q );
		// recoil: kick back and up about the grip
		const gripV = _v2.copy( it.grips?.R?.p || _v2.set( 0, 0, 0 ) ).applyQuaternion( Q ).add( P );
		_q.setFromEuler( _e.set( rp, ry, rr, 'YXZ' ) );
		P.sub( gripV ).applyQuaternion( _q ).add( gripV );
		Q.premultiply( _q );
		P.z += rb; P.y += ru;
		this.holder.position.copy( P );
		this.holder.quaternion.copy( Q );
		this.holder.updateMatrixWorld( true );

		// optics
		this._optics( it );
		// moving parts + hands
		this._parts( it );
		this._hands( it );
		// muzzle flash placement
		if ( fl && it.muzzle ) {
			_v.set( ...it.muzzle ).applyMatrix4( it.obj.matrixWorld );
			this.flashStar.position.copy( _v );
			const k = this.flashScale * ( it.cls === 'pistol' ? 0.12 : it.cls === 'shotgun' ? 0.2 : 0.16 );
			this.flashStar.scale.set( k, k, k );
			this.flashSide.scale.set( k * 1.6, k * 1.2, k * 1.2 );
			this.light.position.copy( _v );
		}
		// bow strings
		if ( it.strings ) this._strings( it );
	}

	// the resting hold of an item in view space -> it.hipP / it.hipQ
	_holdPose( it ) {
		const gun = it.kind === 'gun', cls = it.cls;
		const hipP = it.hipP = V(), hipQ = it.hipQ = new THREE.Quaternion();
		if ( gun ) {
			// the gun frame's origin (trigger, on the bore line) in view space: long guns at a low ready to the right,
			// pointing into the screen; pistols out in front in both hands
			// (rifle stocks without a pistol grip put the hand higher: the gun can sit lower)
			const H = GUN_HOLD[ cls === 'pistol' ? 'pistol' : cls === 'bow' && it.info.bow ? 'bow' : it.heavy ? 'heavy' : it.grips.R && it.grips.R.p.y > - 0.06 ? 'stock' : 'rifle' ];
			hipP.set( ...H.p );
			hipQ.copy( E( ...H.r ) ).multiply( GUN_Q );
			it.elbowR = V( ...H.eR ); it.elbowL = V( ...H.eL );
		} else if ( it.kind === 'melee' ) {
			// the item's own frame: +x along it (handle -> tip), +y the spine / back of a blade (edges face -y, an axe's
			// bit +y), +z the flat. The grip is placed at `at`; `x` / `y` orient it in view space
			const MH = MELEE_HOLD[ it.hold ];
			basisQ( V( ...MH.x ), V( ...MH.y ), hipQ );
			const g = _v.copy( it.grips.R.p ).applyQuaternion( hipQ );
			hipP.set( ...MH.at ).sub( g );
		} else if ( it.kind === 'fists' ) { hipP.set( 0.14, - 0.2, - 0.32 ); hipQ.identity(); }
		else {
			// grenades, tools and anything else: the right hand is posed in view space and the item sits in its grip
			const HH = HAND_HOLD[ it.kind === 'throw' ? 'throw' : it.long ? 'long' : 'item' ];
			basisQ( V( ...HH.x ), V( ...HH.y ), _q2 );
			_m.compose( V( ...HH.at ), _q2, _s.set( 1, 1, 1 ) );
			wristMatrix( it.grips.R, 1, _m2 );
			_m.multiply( _m2.invert() ).decompose( hipP, hipQ, _v );
		}
	}

	// hip / aim / sprint / lowered / equip / action blend -> holder pose (P, Q)
	_basePose( it, P, Q ) {
		const s = this.s, act = s.act;
		const gun = it.kind === 'gun';
		const cls = it.cls;
		// the hold (static per item: worked out once)
		if ( ! it.hipP ) this._holdPose( it );
		const hipP = it.hipP, hipQ = it.hipQ;
		P.copy( hipP ); Q.copy( hipQ );
		// aimed down the sights: the eye point sits on the view axis
		if ( gun && s.ads > 0 ) {
			const eye = it.eye;
			const adsP = _adsP.copy( eye ).applyQuaternion( GUN_Q ).negate();
			const k = smooth( s.ads );
			// dip slightly under the line mid-way so the sight comes up into the eye
			P.lerp( adsP, k ); P.y -= Math.sin( k * PI ) * 0.012;
			Q.slerp( GUN_Q, k );
		}
		// sprint: long guns swing across the chest muzzle-up and canted, pistols point at the ground
		if ( s.sprint > 0 ) {
			const k = smooth( s.sprint );
			if ( gun ) P.lerp( cls === 'pistol' ? SPRINT.pistolP : SPRINT.rifleP, k );
			else P.lerp( _v.set( hipP.x, hipP.y - 0.05, hipP.z + 0.04 ), k );
			_q.copy( gun ? ( cls === 'pistol' ? SPRINT.pistolQ : SPRINT.rifleQ ) : SPRINT.itemQ ).multiply( gun ? GUN_Q : hipQ );
			Q.slerp( _q, k * ( gun ? 1 : 0.6 ) );
		}
		// lowered (busy, swimming, climbing) and blocked by a wall
		// raising a weapon: it comes up fast and settles (ease-out), so it's on screen from the first frames
		const low = Math.max( smooth( s.lower ), Math.pow( 1 - s.equip, 2 ) );
		if ( low > 0 ) {
			const k = low;
			P.y -= 0.32 * k; P.z += 0.08 * k;
			_q.setFromAxisAngle( AX_X, - 0.9 * k );
			Q.premultiply( _q );
		}
		if ( s.block > 0 && gun ) {
			const k = smooth( s.block );
			P.z += 0.1 * k; P.y -= 0.04 * k;
			_q.setFromAxisAngle( AX_X, 0.55 * k );
			Q.premultiply( _q );
		}
		if ( act ) this._actionPose( it, act, P, Q );
	}

	// body motion of the item during actions (the hands follow separately)
	_actionPose( it, act, P, Q ) {
		const t = act.t, s = this.s;
		// offsets: translate (view), pitch / yaw in view space about the grip, roll about the item's own long axis
		// (positive turns the bottom of a gun towards the player so the magwell comes into view, negative the top)
		const off = ( x, y, z, rx, ry, rz, k ) => {
			if ( k <= 0 ) return;
			P.x += x * k; P.y += y * k; P.z += z * k;
			_q.setFromEuler( _e.set( rx * k, ry * k, 0, 'YXZ' ) );
			const g = _v.copy( it.grips?.R?.p || _v.set( 0, 0, 0 ) ).applyQuaternion( Q ).add( P );
			P.sub( g ).applyQuaternion( _q ).add( g );
			Q.premultiply( _q );
			if ( rz ) {
				// roll about the gun's bore line through the grip
				const axis = _v2.set( 1, 0, 0 ).applyQuaternion( Q );
				_q.setFromAxisAngle( axis, rz * k );
				const g2 = _v.copy( it.grips?.R?.p || _v.set( 0, 0, 0 ) ).applyQuaternion( Q ).add( P );
				P.sub( g2 ).applyQuaternion( _q ).add( g2 );
				Q.premultiply( _q );
			}
		};
		const bell = ( a, b, c, d ) => seg( t, a, b ) * ( 1 - seg( t, c, d ) );
		const pistol = it.cls === 'pistol';
		switch ( act.type ) {
			case 'reload_mag': case 'reload_belt': {
				const k = bell( 0, 0.14, 0.86, 1 );
				if ( pistol ) off( - 0.04, 0.05, 0.04, 0.3, 0.4, 0.5, k );
				else off( - 0.06, 0.085, 0.0, 0.1, 0.5, 0.6, k );
				// the seat: a push up when the magazine clicks in
				const bump = bell( act.p.magIn - 0.04, act.p.magIn, act.p.magIn, act.p.magIn + 0.06 );
				off( 0, 0.012, 0, 0.04, 0, 0, bump );
				break;
			}
			case 'shells_open': case 'shells_insert': case 'shells_close': case 'clip': {
				const k = act.type === 'shells_open' ? seg( t, 0, 1 ) : act.type === 'shells_close' ? 1 - seg( t, 0.3, 1 ) : 1;
				if ( it.info.pump || act.p.port === 'bottom' ) off( - 0.04, 0.06, 0.0, 0.15, 0.45, 0.9, k );
				else off( - 0.04, 0.05, 0.0, 0.1, 0.4, - 0.45, k );
				if ( act.type === 'shells_insert' ) off( 0, 0.006, 0, 0.02, 0, 0, bell( 0.35, 0.5, 0.5, 0.65 ) );
				break;
			}
			case 'revolver_open': case 'revolver_insert': case 'revolver_close': {
				const k = act.type === 'revolver_open' ? seg( t, 0, 0.6 ) : act.type === 'revolver_close' ? 1 - seg( t, 0.35, 1 ) : 1;
				off( - 0.07, 0.02, - 0.05, 0.35, 0.5, 0.35, k );
				// dump the empties: muzzle up
				if ( act.type === 'revolver_open' ) off( 0, 0.02, 0, 0.9, 0, 0, bell( 0.5, 0.7, 0.8, 1 ) );
				break;
			}
			case 'break_open': case 'break_insert': case 'break_close': {
				const k = act.type === 'break_open' ? seg( t, 0, 0.6 ) : act.type === 'break_close' ? 1 - seg( t, 0.4, 1 ) : 1;
				off( - 0.05, 0.04, 0.06, 0.25, 0.3, - 0.3, k );
				if ( act.type === 'break_close' ) off( 0, 0.02, 0, 0.12, 0, 0, bell( 0.2, 0.35, 0.35, 0.55 ) );
				break;
			}
			case 'charge': case 'jam': {
				const k = bell( 0, 0.2, 0.8, 1 );
				if ( pistol ) off( - 0.04, 0.04, 0.05, 0.1, 0.35, - 0.3, k );
				else off( - 0.04, 0.04, 0.02, 0.05, 0.35, - 0.35, k );
				break;
			}
			case 'cycle': {
				// bolt / lever: the gun dips and cants while the hand works it; pumps barely move
				const k = bell( 0, 0.2, 0.75, 1 );
				// bolt guns come up and turn their right side in so the hand on the bolt stays in view
				if ( it.info.boltHandle ) off( - 0.03, 0.02, 0.0, 0.04, 0.22, - 0.22, k * ( s.ads > 0.5 ? 0.35 : 1 ) );
				else if ( it.info.lever ) off( 0, - 0.01, 0.01, - 0.05, 0, - 0.08, k );
				else off( 0, 0, 0.01, 0.03, 0, 0, k );
				break;
			}
			case 'inspect': {
				const k = bell( 0, 0.2, 0.8, 1 );
				off( - 0.06, 0.03, 0.02, 0.2, 0.9, 0.5, k * ( 1 - bell( 0.4, 0.55, 0.55, 0.7 ) ) );
				off( - 0.06, 0.02, 0.02, 0.1, - 0.5, - 0.7, k * bell( 0.4, 0.55, 0.55, 0.7 ) );
				break;
			}
			case 'bash': {
				// rifle-butt / pistol-whip: a short hard jab forward and across
				const wind = bell( 0, 0.2, 0.2, 0.35 ), hit = bell( 0.2, 0.38, 0.45, 0.9 );
				off( 0.03, - 0.02, 0.06, - 0.2, - 0.3, 0.2, wind );
				off( - 0.12, 0.05, - 0.14, 0.15, 0.9, 0.7, hit );
				break;
			}
			case 'melee': this._meleePose( it, act, P, Q ); break;
			case 'throw': {
				// wind up behind the shoulder, then whip forward and down
				const back = act.p.hold ? seg( t, 0, 0.5 ) : 1 - seg( t, 0.0, 0.35 );
				const fwd = act.p.hold ? 0 : bell( 0.05, 0.3, 0.45, 1 );
				off( 0.08, 0.14, 0.2, 0.9, - 0.3, 0.4, back * ( act.p.under ? 0.3 : 1 ) );
				off( - 0.1, - 0.1, - 0.25, - 0.8, 0.2, - 0.3, fwd );
				if ( act.p.under ) off( 0, - 0.12, 0.05, - 0.8, 0, 0, back );
				break;
			}
			case 'use': {
				// bring it to the mouth
				const k = bell( 0, 0.25, 0.75, 1 );
				off( - 0.12, 0.1, 0.18, 0.7, 0.2, 0.3, k );
				break;
			}
			case 'punch': {
				const k = bell( 0, 0.25, 0.4, 1 );
				off( - 0.1, 0.1, - 0.2, 0, 0, 0, k );
				break;
			}
			case 'shove': {
				const k = bell( 0, 0.25, 0.45, 1 );
				off( - 0.08, 0.1, - 0.18, 0, 0, 0, k );
				break;
			}
			case 'bow_nock': case 'xbow_cock': {
				const k = bell( 0, 0.2, 0.8, 1 );
				off( - 0.02, - 0.03, 0.05, act.type === 'xbow_cock' ? 0.5 : 0.1, 0.1, - 0.2, k );
				break;
			}
		}
	}

	// melee swings: keyframes of the whole weapon in view space; variant picks the stroke
	_meleePose( it, act, P, Q ) {
		const t = act.t, v = act.p.variant || 0, two = it.two, kind = it.def.melee.kind;
		// [ t, x, y, z, rx, ry, rz ] offsets from the hold pose; strokes read left/right as seen by the player
		let K;
		if ( kind === 'spear' || act.p.stab ) {
			K = [ [ 0, 0, 0, 0, 0, 0, 0 ], [ 0.3, 0.02, - 0.02, 0.12, - 1.2, 0.1, 0 ], [ 0.45, - 0.06, 0.05, - 0.38, - 1.35, 0.05, 0 ], [ 0.6, - 0.05, 0.04, - 0.32, - 1.3, 0.05, 0 ], [ 1, 0, 0, 0, 0, 0, 0 ] ];
		} else if ( ( kind === 'axe' || act.p.heavy ) && v % 2 === 0 ) {
			// overhead chop: the head goes back over the shoulder, then down through the middle of the screen
			K = two ? [ [ 0, 0, 0, 0, 0, 0, 0 ], [ 0.33, 0.03, 0.07, - 0.04, 0.35, - 0.1, 0.05 ], [ 0.46, - 0.05, - 0.03, - 0.12, - 0.75, 0.3, 0.1 ], [ 0.58, - 0.07, - 0.1, - 0.1, - 1.05, 0.42, 0.15 ], [ 1, 0, 0, 0, 0, 0, 0 ] ]
				: [ [ 0, 0, 0, 0, 0, 0, 0 ], [ 0.33, - 0.05, 0.16, 0.08, 0.9, 0.1, 0.1 ], [ 0.46, - 0.1, - 0.02, - 0.3, - 1.3, 0.15, 0.1 ], [ 0.58, - 0.1, - 0.18, - 0.25, - 1.7, 0.2, 0.1 ], [ 1, 0, 0, 0, 0, 0, 0 ] ];
		} else if ( v % 2 === 0 ) {
			// forehand: from up-right across to down-left
			K = [ [ 0, 0, 0, 0, 0, 0, 0 ], [ 0.3, 0.06, 0.1, 0.08, 0.4, - 0.6, - 0.4 ], [ 0.44, - 0.08, - 0.02, - 0.2, - 0.6, 0.6, - 0.2 ], [ 0.56, - 0.3, - 0.12, - 0.12, - 1.0, 1.2, 0.2 ], [ 1, 0, 0, 0, 0, 0, 0 ] ];
		} else {
			// backhand: from low-left up across to the right
			K = [ [ 0, 0, 0, 0, 0, 0, 0 ], [ 0.3, - 0.26, 0.02, 0.02, - 0.2, 1.1, 0.8 ], [ 0.44, - 0.02, 0.02, - 0.24, - 0.5, 0.0, 0.3 ], [ 0.56, 0.16, 0.04, - 0.12, - 0.4, - 0.9, - 0.2 ], [ 1, 0, 0, 0, 0, 0, 0 ] ];
		}
		if ( two && ! ( ( kind === 'axe' || act.p.heavy ) && v % 2 === 0 ) ) for ( const k of K ) { k[ 1 ] *= 1.3; k[ 3 ] *= 1.2; }
		let i = 0;
		while ( i < K.length - 2 && t > K[ i + 1 ][ 0 ] ) i ++;
		const a = K[ i ], b = K[ i + 1 ];
		const u = smooth( ( t - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] ) );
		const f = ( k ) => a[ k ] + ( b[ k ] - a[ k ] ) * u;
		P.x += f( 1 ); P.y += f( 2 ); P.z += f( 3 );
		// rotate about the hand (a two-hander about the lower one, near the end of the handle)
		const g = _v.copy( ( it.two && it.grips.L ? it.grips.L : it.grips.R ).p ).applyQuaternion( Q ).add( P );
		_q.setFromEuler( _e.set( f( 4 ), f( 5 ), f( 6 ), 'YXZ' ) );
		P.sub( g ).applyQuaternion( _q ).add( g );
		Q.premultiply( _q );
	}

	// ---- moving parts -----------------------------------------------------------------------------------------------------

	_parts( it ) {
		if ( it.kind !== 'gun' ) return;
		const s = this.s, act = s.act, P = it.parts, info = it.info, t = act?.t ?? 0;
		const rest = ( p ) => { if ( p ) { p.position.copy( p.userData.rest ); p.rotation.set( 0, 0, 0 ); } };
		for ( const k of [ 'slide', 'bolt', 'charge', 'pump', 'boltHandle', 'lever', 'hammer', 'crane', 'cyl', 'barrels', 'cover', 'trigger', 'arrow' ] ) rest( P[ k ] );
		const bell = ( a, b, c, d ) => seg( t, a, b ) * ( 1 - seg( t, c, d ) );
		// firing: the slide / carrier slams back in ~25 ms and returns in ~50 ms
		const ct = this.cycleT ?? 1;
		const cyc = ct < 0.025 ? ct / 0.025 : Math.max( 0, 1 - ( ct - 0.025 ) / 0.05 );
		if ( P.slide ) P.slide.position.x -= ( info.slideTravel || 0.03 ) * ( s.empty && ! act ? 1 : cyc );
		if ( P.bolt && info.bolt === 'bolt' ) P.bolt.position.x -= ( info.boltTravel || 0.06 ) * 0.6 * cyc;
		if ( P.charge && ( it.f.action === 'open' ) ) P.charge.position.x -= ( info.chargeTravel || 0.06 ) * cyc;
		if ( P.trigger ) P.trigger.rotation.z = - 0.25 * s.trigger;
		if ( P.cyl ) P.cyl.rotation.x = ( this.cylAngle || 0 );
		if ( P.hammer && it.f.action === 'revolver' ) P.hammer.rotation.z = 0.5 * s.trigger;
		if ( ! act ) {
			if ( P.arrow ) P.arrow.visible = ! s.empty;
			it.obj.updateMatrixWorld( true );
			return;
		}
		switch ( act.type ) {
			case 'reload_mag': case 'reload_belt': {
				const p = act.p;
				if ( act.type === 'reload_belt' && P.cover ) P.cover.rotation.z = 1.1 * bell( 0.05, 0.2, 0.8, 0.92 );
				if ( p.charge ) this._chargePart( it, bell( p.charge - 0.08, p.charge, p.charge, p.charge + 0.05 ) );
				else if ( P.slide && s.slideLocked ) P.slide.position.x -= ( info.slideTravel || 0.03 ) * ( 1 - seg( t, p.magIn, p.magIn + 0.06 ) );
				break;
			}
			case 'charge': case 'jam': this._chargePart( it, bell( 0.25, 0.5, 0.55, 0.7 ) ); break;
			case 'cycle': {
				if ( P.boltHandle ) {
					const up = bell( 0.15, 0.3, 0.72, 0.85 ), back = bell( 0.3, 0.48, 0.5, 0.7 );
					P.boltHandle.rotation.x = - 1.05 * up;
					P.boltHandle.position.x -= ( info.boltTravel || 0.08 ) * back;
				}
				if ( P.pump ) P.pump.position.x -= ( info.pumpTravel || 0.085 ) * bell( 0.05, 0.4, 0.45, 0.85 );
				if ( P.lever ) { P.lever.rotation.z = - 0.85 * bell( 0.05, 0.4, 0.45, 0.85 ); if ( P.hammer ) P.hammer.rotation.z = 0.5 * bell( 0.1, 0.4, 0.8, 1 ); }
				if ( P.bolt && info.boltTravel && ! P.boltHandle ) P.bolt.position.x -= info.boltTravel * bell( 0.05, 0.4, 0.45, 0.85 );
				break;
			}
			case 'shells_open': case 'shells_insert': case 'shells_close': case 'clip': {
				const open = act.type === 'shells_open' ? seg( t, 0.2, 0.8 ) : act.type === 'shells_close' ? 1 - seg( t, 0.15, 0.6 ) : 1;
				if ( P.boltHandle ) { P.boltHandle.rotation.x = - 1.05 * clamp( open * 2, 0, 1 ); P.boltHandle.position.x -= ( info.boltTravel || 0.08 ) * clamp( open * 2 - 1, 0, 1 ); }
				if ( info.shellPort && P.bolt && it.def.firearm.action === 'semi' ) P.bolt.position.x -= ( info.boltTravel || 0.07 ) * open;
				if ( act.type === 'shells_close' && act.p.rack ) {
					if ( P.pump ) P.pump.position.x -= ( info.pumpTravel || 0.085 ) * bell( 0.45, 0.65, 0.7, 0.9 );
					if ( P.lever ) P.lever.rotation.z = - 0.85 * bell( 0.45, 0.65, 0.7, 0.9 );
				}
				break;
			}
			case 'revolver_open': case 'revolver_insert': case 'revolver_close': {
				const open = act.type === 'revolver_open' ? seg( t, 0.1, 0.45 ) : act.type === 'revolver_close' ? 1 - seg( t, 0.1, 0.4 ) : 1;
				if ( P.crane ) P.crane.rotation.x = - 1.3 * open;
				// the ejector rod pushes out the empties
				break;
			}
			case 'break_open': case 'break_insert': case 'break_close': {
				const open = act.type === 'break_open' ? seg( t, 0.1, 0.5 ) : act.type === 'break_close' ? 1 - seg( t, 0.25, 0.45 ) : 1;
				if ( P.barrels ) P.barrels.rotation.z = ( info.breakAngle || - 0.6 ) * open;
				if ( P.shells ) P.shells.visible = act.type !== 'break_open' || t < 0.55;
				break;
			}
			case 'bow_nock': if ( P.arrow ) P.arrow.visible = t > 0.45; break;
			case 'xbow_cock': if ( P.arrow ) P.arrow.visible = t > 0.7; break;
		}
		if ( P.arrow && act.type !== 'bow_nock' && act.type !== 'xbow_cock' ) P.arrow.visible = ! s.empty;
		it.obj.updateMatrixWorld( true );
	}

	_chargePart( it, k ) {
		const P = it.parts, info = it.info;
		if ( P.slide ) P.slide.position.x -= ( info.slideTravel || 0.03 ) * k;
		else if ( P.charge ) P.charge.position.x -= ( info.chargeTravel || 0.075 ) * k;
		if ( P.bolt ) P.bolt.position.x -= ( info.boltTravel || 0.07 ) * k * ( P.charge ? 0.8 : 1 );
		if ( P.boltHandle ) { P.boltHandle.rotation.x = - 1.05 * Math.min( 1, k * 2 ); P.boltHandle.position.x -= ( info.boltTravel || 0.08 ) * Math.max( 0, k * 2 - 1 ); }
		if ( P.pump ) P.pump.position.x -= ( info.pumpTravel || 0.085 ) * k;
	}

	_strings( it ) {
		const s = this.s, act = s.act;
		let nock = it.nockRest;
		if ( it.info.bow ) nock = it.nockRest - 0.5 * smooth( s.draw );
		else {
			// the crossbow sits cocked unless empty; the cocking action drags it back
			const cocked = act?.type === 'xbow_cock' ? seg( act.t, 0.25, 0.65 ) : s.empty ? 0 : 1;
			nock = it.nockRest + ( 0.02 - it.nockRest ) * cocked;
		}
		if ( it.parts.arrow ) {
			it.parts.arrow.position.copy( it.parts.arrow.userData.rest );
			it.parts.arrow.position.x += nock - ( it.info.bow ? it.nockRest : 0.02 );
		}
		const n = _v.set( nock, it.info.bow ? 0 : 0.012, 0 );
		for ( let i = 0; i < 2; i ++ ) {
			const m = it.strings[ i ], c = it.cams[ i ];
			_v2.subVectors( n, c );
			const L = _v2.length();
			m.position.copy( c );
			m.quaternion.setFromUnitVectors( _v3.set( 0, 1, 0 ), _v2.divideScalar( L ) );
			m.scale.set( 1, L, 1 );
		}
		it.nockX = nock;
	}

	// ---- hands ----------------------------------------------------------------------------------------------------------------

	_hands( it ) {
		const s = this.s, act = s.act;
		const R = this.armR, Lh = this.armL;
		const O = it.obj.matrixWorld;
		const toView = ( g, side, out, lift = 0 ) => wristMatrix( g, side, out, lift ).premultiply( O );
		let showL = true, showR = true;
		const gR = it.grips?.R;
		let gL = it.grips?.L;
		// the support hand rides the pump
		if ( gL && it.parts?.pump && ! gL.support ) {
			const dx = it.parts.pump.position.x - it.parts.pump.userData.rest.x;
			if ( dx ) { const g = this._pumpGrip ||= { p: V() }; Object.assign( g, gL ); g.p = ( this._pumpP ||= V() ).copy( gL.p ); g.p.x += dx; gL = g; }
		}
		// defaults: both hands on their grips
		if ( gR ) toView( gR, 1, this.handR ); else showR = false;
		if ( gL ) toView( gL, - 1, this.handL ); else showL = false;
		let curlR = gR ? curlFor( gR.r, 1, gR.beta ) : curlFor( 0.02, 1.3 ), curlL = gL ? curlFor( gL.r, gL.tight ?? 1, gL.beta, gL.dz, gL.sink ) : curlFor( 0.03, 0.5 );
		let thumbR = THUMB_POSE.wrap, thumbL = gL?.thumb ? THUMB_POSE[ gL.thumb ] : THUMB_POSE.along;
		if ( it.kind === 'gun' && ! it.info.bow ) {
			const pistol = !! gL?.support;
			thumbR = this._thR = this._gunThumb( this._thR, this.handR, 1, O, pistol ? GUN_THUMB.pistolR : GUN_THUMB.grip, pistol ? THUMB_POSE.forward : THUMB_POSE.wrap );
			if ( gL && ! gL.thumb && ! gL.vert && ! gL.under ) thumbL = this._thL = this._gunThumb( this._thL, this.handL, - 1, O, pistol ? GUN_THUMB.pistolL : GUN_THUMB.along, pistol ? THUMB_POSE.forward : THUMB_POSE.along );
		}
		if ( it.kind === 'gun' ) {
			// the trigger finger lies along the frame until the gun is aimed or fired
			if ( gR?.trig ) {
				const k = Math.max( s.trigger, smooth( s.ads ), this.cycleT < 0.4 ? 1 : 0 ) * ( 1 - s.sprint );
				const c = this._curlR ||= curlR.map( f => f.slice() );
				for ( let f = 1; f < 4; f ++ ) for ( let j = 0; j < 3; j ++ ) c[ f ][ j ] = curlR[ f ][ j ];
				const pull = s.trigger;
				c[ 0 ][ 0 ] = 0.1 + k * ( 0.42 + pull * 0.12 ); c[ 0 ][ 1 ] = 0.06 + k * ( 0.78 + pull * 0.3 ); c[ 0 ][ 2 ] = 0.04 + k * ( 0.35 + pull * 0.15 );
				curlR = c;
			}
			if ( it.info.bow ) {
				// the drawing hand hooks the string at the nock
				const g = gs( 1, it.nockX ?? - 0.16, - 0.01, 0.0, 0, 1, 0, - 0.2, 0, 1, 0.004 );
				toView( g, 1, this.handR );
				curlR = BOW_CURL; thumbR = THUMB_POSE.fist;
			}
		} else if ( it.kind === 'fists' ) {
			// fists up, the left one slightly back
			const hold = act ? 0 : 1;
			this.handR.compose( _v.set( 0.13, - 0.2 - 0.2 * hold, - 0.34 ), _q.copy( E( 0.4, 0.2, 1.4 ) ), _s.set( 1, 1, 1 ) );
			this.handL.compose( _v.set( - 0.14, - 0.22 - 0.2 * hold, - 0.3 ), _q.copy( E( 0.4, - 0.2, - 1.4 ) ), _s.set( 1, 1, 1 ) );
			curlR = curlL = curlFor( 0.004, 1.4 );
			thumbR = thumbL = THUMB_POSE.fist;
			showL = showR = !! act;
			if ( act?.type === 'punch' ) {
				const k = seg( act.t, 0, 0.25 ) * ( 1 - seg( act.t, 0.4, 1 ) );
				this.handR.premultiply( _m.makeTranslation( - 0.09 * k, 0.13 * k, - 0.22 * k ) );
			}
			if ( act?.type === 'shove' ) {
				const k = seg( act.t, 0, 0.25 ) * ( 1 - seg( act.t, 0.45, 1 ) );
				curlR = curlL = curlFor( 0.05, 0.3 );
				thumbR = thumbL = THUMB_POSE.flat;
				this.handR.compose( _v.set( 0.12, - 0.18 + 0.05 * k, - 0.3 - 0.2 * k ), _q.copy( E( 1.3, 0.1, 1.5 ) ), _s.set( 1, 1, 1 ) );
				this.handL.compose( _v.set( - 0.12, - 0.18 + 0.05 * k, - 0.3 - 0.2 * k ), _q.copy( E( 1.3, - 0.1, - 1.5 ) ), _s.set( 1, 1, 1 ) );
			}
		}
		// action choreography for the hands
		if ( act && it.kind === 'gun' ) {
			const r = this._reloadHands( it, act );
			if ( r ) { curlL = r.curl || curlL; thumbL = r.thumb || thumbL; showL = r.show ?? showL; if ( r.curlR ) curlR = r.curlR; }
		}
		if ( act?.type === 'bash' && it.kind === 'gun' && it.cls !== 'pistol' ) showL = !! gL;
		// melee two-handers and the throw arm
		if ( it.kind === 'melee' && it.two && gL ) { toView( gL, - 1, this.handL ); showL = true; curlL = curlFor( gL.r ); thumbL = THUMB_POSE.wrap; }
		if ( it.kind === 'throw' ) { curlR = curlFor( it.grips.R.r, 1.1 ); thumbR = THUMB_POSE.pinch; }
		if ( it.kind === 'tool' || it.kind === 'item' ) { curlR = curlFor( it.grips.R.r, 1 ); thumbR = it.long ? THUMB_POSE.along : THUMB_POSE.pinch; }
		// hide the arms when the scope fills the screen
		if ( s.overlay ) showL = showR = false;
		R.visible = showR; Lh.visible = showL;
		// where the elbows hang: a gun's own, else low under the hand (melee, grenades, tools)
		const gunHold = it.kind === 'gun' && it.cls !== 'bow';
		const eR = gunHold ? it.elbowR || this.elbowR : it.kind === 'fists' ? null : ITEM_ELBOW_R, eL = gunHold ? it.elbowL || this.elbowL : it.kind === 'fists' ? null : ITEM_ELBOW_L;
		// on a gun the forearms follow where the elbows hang (as far as the wrists allow); elsewhere they mostly continue
		// the hand's line
		if ( showR ) { R.setCurl( curlR, thumbR ); R.pose( this.shoulderR, this.handR, eR ? 0.7 : 0.4, eR ); }
		if ( showL ) { Lh.setCurl( curlL, thumbL ); Lh.pose( this.shoulderL, this.handL, eL ? 0.9 : 0.5, eL ); }
		// what the reload hand carries
		this._handProp( it, act );
	}

	// a thumb laid along directions in the item's frame (T: a GUN_THUMB entry), as a THUMB_POSE the arms read: the
	// modelled hand takes the frame, the procedural one the fallback pose
	_gunThumb( out, hand, side, O, T, fallback ) {
		out ||= { rig: { dir: [ 0, 0, 1 ], up: [ 0, 1, 0 ], flex: [ 0, 0 ] } };
		out.dir = fallback.dir; out.roll = fallback.roll; out.flex = fallback.flex;
		_m.extractRotation( hand ).transpose(); // view -> hand
		_m2.extractRotation( O ); // item -> view
		const d = _v.set( ...T.dir ).applyMatrix4( _m2 ).applyMatrix4( _m ).normalize();
		const u = _v2.set( ...T.up ).applyMatrix4( _m2 ).applyMatrix4( _m ).normalize();
		// (the thumb poses are written for the right hand: the left mirrors x)
		out.rig.dir[ 0 ] = d.x * side; out.rig.dir[ 1 ] = d.y; out.rig.dir[ 2 ] = d.z;
		out.rig.up[ 0 ] = u.x * side; out.rig.up[ 1 ] = u.y; out.rig.up[ 2 ] = u.z;
		out.rig.flex = T.flex;
		return out;
	}

	// left-hand keyframes for reloads (and the right hand for bolts); returns curl overrides
	_reloadHands( it, act ) {
		const t = act.t, info = it.info, O = it.obj.matrixWorld, p = act.p || {};
		const pouch = _m2.compose( _v.set( - 0.06, - 0.55, - 0.1 ), _q.copy( E( 0.8, 0.3, - 1.2 ) ), _s.set( 1, 1, 1 ) );
		const grasp = curlFor( 0.028, 1 );
		const blendL = ( target, k ) => { blendMat( this.handL, target, k, this.handL ); };
		// the hand around the magazine (in the magazine frame -> view)
		const magHand = ( drop, out ) => {
			const mi = info.mag;
			if ( ! mi ) return out.copy( this.handL );
			const md = it.mag?.userData.def;
			const L = md ? ( md.magazine.capacity >= 60 ? 0.2 : 0.14 ) : 0.14;
			const dx = - Math.sin( mi.rake || 0 ) * drop, dy = - Math.cos( mi.rake || 0 ) * drop;
			const box = it.def.firearm.mags?.[ 0 ]?.startsWith( 'box' ) && md?.id?.startsWith( 'box' );
			const g = box ? gs( 2, mi.p[ 0 ] + dx, mi.p[ 1 ] + dy - 0.06, mi.p[ 2 ] - 0.05, 1, 0, 0, 0, 0, - 1, 0.04 )
				: gs( 3, mi.p[ 0 ] + dx - Math.sin( mi.rake || 0 ) * - L * 0.55, mi.p[ 1 ] + dy - L * 0.55, mi.p[ 2 ], 0.15, 1, 0, - 0.3, - 0.1, - 1, 0.022 );
			return wristMatrix( g, - 1, out ).premultiply( O );
		};
		// the support hand working the action. Handles on top are hooked from above (palm down, fingers round to the
		// right), side handles are pinched from their own side, a pistol slide is gripped overhand
		const chargeHand = ( pull, out ) => {
			const f = it.def.firearm;
			// AR pattern with the bolt locked back: the heel of the hand slaps the bolt catch on the left of the receiver
			if ( it.def.model?.arch === 'ar' && act.type === 'reload_mag' ) {
				const g = gs( 0, 0.035 + pull * 0.012, - 0.04, - 0.045, - 1, - 0.15, 0, 0, 0.15, - 1, 0.03 );
				return wristMatrix( g, - 1, out ).premultiply( O );
			}
			const travel = pull * ( info.chargeTravel || info.slideTravel || info.boltTravel || 0.06 );
			let g;
			if ( it.parts.slide && f.cls === 'pistol' ) {
				g = gs( 1, ( info.rearX ?? - 0.07 ) + 0.03 - travel, 0.004, 0, - 1, 0, 0, 0, 1, 0.15, 0.014 );
			} else {
				let c = null;
				if ( it.parts.charge ) c = it.parts.charge.userData.rest;
				else if ( it.parts.bolt ) c = it.parts.bolt.userData.rest;
				if ( ! c ) return out.copy( this.handL ); // bolt guns: the right hand works the bolt
				const x = c.x - travel;
				if ( c.z < - 0.008 ) g = gs( 2, x, c.y, c.z - 0.012, 0, 1, 0, 0, 0.2, - 1, 0.01 );
				else if ( c.z > 0.008 ) g = gs( 3, x, c.y - 0.008, c.z + 0.014, 1, 0, 0, 0, - 0.6, 0.8, 0.01 ); // under the gun, round to the right side
				else g = gs( 0, x, c.y + 0.012, 0, - 1, 0, 0, 0, 1, - 0.3, 0.012 );
			}
			return wristMatrix( g, - 1, out ).premultiply( O );
		};
		// feeding rounds: pump guns palm up under the receiver (thumb pushing into the port), top loaders from above
		const port = ( out, lift = 0 ) => {
			const sp = info.shellPort || info.eject || [ 0, 0, 0.02 ];
			const g = p.port === 'bottom'
				? gs( 1, sp[ 0 ] + 0.02, sp[ 1 ] - 0.035 - lift, sp[ 2 ], 0, 0, - 1, 0, - 1, 0, 0.016 )
				: gs( 2, sp[ 0 ] + 0.01, sp[ 1 ] + 0.03 + lift, sp[ 2 ] + 0.01, - 1, 0, 0, 0, 1, 0.3, 0.012 );
			return wristMatrix( g, - 1, out ).premultiply( O );
		};
		const M1 = _M1, M2 = _M2;
		switch ( act.type ) {
			case 'reload_mag': case 'reload_belt': {
				const mo = p.magOut, mi = p.magIn, ch = p.charge;
				// to the magazine, pull it, away to the pouch, back with a fresh one, seat it, maybe rack it
				if ( t < mo ) { blendL( magHand( 0, M1 ), seg( t, 0.02, mo - 0.06 ) ); return { curl: t > mo - 0.1 ? grasp : null }; }
				if ( t < mo + 0.08 ) { magHand( 0.12 * seg( t, mo, mo + 0.08 ), this.handL ); return { curl: grasp }; }
				const mid = ( mo + mi ) / 2;
				if ( t < mid ) { blendMat( magHand( 0.12, M1 ), pouch, seg( t, mo + 0.08, mid ), this.handL ); return { curl: grasp }; }
				if ( t < mi - 0.06 ) { blendMat( pouch, magHand( 0.12, M1 ), seg( t, mid, mi - 0.06 ), this.handL ); return { curl: grasp }; }
				if ( t < mi ) { magHand( 0.12 * ( 1 - seg( t, mi - 0.06, mi ) ), this.handL ); return { curl: grasp }; }
				if ( ch ) {
					if ( t < ch - 0.08 ) { blendMat( magHand( 0, M1 ), chargeHand( 0, M2 ), seg( t, mi + 0.04, ch - 0.08 ), this.handL ); return { curl: t > ch - 0.12 ? curlFor( 0.012, 1.2 ) : grasp }; }
					if ( t < ch + 0.05 ) { chargeHand( seg( t, ch - 0.08, ch ) * ( 1 - seg( t, ch, ch + 0.05 ) ), this.handL ); return { curl: curlFor( 0.012, 1.2 ) }; }
					const home = M1.copy( this.handL );
					blendMat( chargeHand( 0, M2 ), home, seg( t, ch + 0.05, 1 ), this.handL );
					return null;
				}
				const home = M2.copy( this.handL );
				blendMat( magHand( 0, M1 ), home, seg( t, mi + 0.06, 1 ), this.handL );
				return { curl: t < mi + 0.15 ? grasp : null };
			}
			case 'charge': case 'jam': {
				const home = M2.copy( this.handL );
				const k = seg( t, 0.05, 0.25 ) * ( 1 - seg( t, 0.75, 0.95 ) );
				blendMat( home, chargeHand( seg( t, 0.25, 0.5 ) * ( 1 - seg( t, 0.55, 0.7 ) ), M1 ), k, this.handL );
				return { curl: k > 0.5 ? curlFor( 0.012, 1.2 ) : null, thumb: k > 0.5 ? THUMB_POSE.wrap : null, show: true };
			}
			case 'shells_open': {
				const home = M2.copy( this.handL );
				blendMat( home, pouch, seg( t, 0.2, 1 ), this.handL );
				return { curl: grasp };
			}
			case 'shells_insert': case 'revolver_insert': case 'break_insert': case 'clip': {
				// pouch -> port with a round -> push -> back
				const at = act.type === 'revolver_insert' ? this._cylFace( it, M1 ) : act.type === 'break_insert' ? this._breech( it, M1 ) : port( M1 );
				const k = seg( t, 0.05, 0.4 ) * ( 1 - seg( t, 0.62, 0.98 ) );
				blendMat( pouch, at, k, this.handL );
				if ( t > 0.4 && t < 0.6 ) this.handL.premultiply( _m.makeTranslation( _v.set( 0.012, 0, 0 ).transformDirection( O ).multiplyScalar( 0.02 * Math.sin( ( t - 0.4 ) / 0.2 * PI ) ) ) );
				return { curl: curlFor( 0.006, 1.1 ) };
			}
			case 'shells_close': case 'revolver_close': case 'break_close': {
				const home = M2.copy( this.handL );
				const from = act.type === 'revolver_close' ? this._cylFace( it, M1 ) : pouch;
				blendMat( from, home, seg( t, 0.05, 0.55 ), this.handL );
				return null;
			}
			case 'revolver_open': case 'break_open': {
				const home = M2.copy( this.handL );
				const to = act.type === 'revolver_open' ? this._cylFace( it, M1 ) : this._breech( it, M1 );
				blendMat( home, to, seg( t, 0.05, 0.35 ), this.handL );
				if ( t > 0.6 ) blendMat( this.handL, pouch, seg( t, 0.65, 1 ), this.handL );
				return { curl: curlFor( 0.02, 0.8 ) };
			}
			case 'cycle': {
				// bolt actions work with the right hand
				if ( it.parts.boltHandle ) {
					// the hand comes up from the grip: palm to the gun, fingers up and over the knob, the wrist low behind it
					// the hand closes on the knob wherever the handle has taken it (it turns up and slides back), held
					// the way it came up from the grip
					const hb = it.parts.boltHandle;
					_v.copy( BOLT_KNOB.p ).applyMatrix4( hb.matrixWorld ).applyMatrix4( _M3.copy( O ).invert() );
					const kg = gs( 0, _v.x, _v.y, _v.z, BOLT_KNOB.a.x, BOLT_KNOB.a.y, BOLT_KNOB.a.z, BOLT_KNOB.n.x, BOLT_KNOB.n.y, BOLT_KNOB.n.z, BOLT_KNOB.r );
					const Mk = wristMatrix( kg, 1, M1 ).premultiply( O );
					const k = seg( t, 0.0, 0.16 ) * ( 1 - seg( t, 0.84, 1 ) );
					blendMat( this.handR, Mk, k, this.handR );
					return { curlR: k > 0.5 ? curlFor( 0.01, 1.1 ) : null };
				}
				return null;
			}
			case 'bow_nock': case 'xbow_cock': {
				// the right hand reaches back to the quiver
				const quiver = _m2.compose( _v.set( 0.25, - 0.5, 0.05 ), _q.copy( E( 0.5, 0.2, 1 ) ), _s.set( 1, 1, 1 ) );
				const k = seg( t, 0.02, 0.3 ) * ( 1 - seg( t, 0.45, 0.8 ) );
				blendMat( this.handR, quiver, k, this.handR );
				return null;
			}
		}
		return null;
	}

	_cylFace( it, out ) {
		const c = it.parts.cyl;
		if ( ! c ) return out.copy( this.handL );
		c.updateWorldMatrix( true, false );
		// behind the swung-out cylinder, fingertips forward to its face
		const g = gs( 3, - 0.075, - 0.012, - 0.035, - 0.48, 0.48, 0.64, 0, 0.8, - 0.6, 0.008 );
		return wristMatrix( g, - 1, out ).premultiply( it.obj.matrixWorld );
	}
	_breech( it, out ) {
		const g = gs( 0, 0.03, - 0.02, - 0.03, 1, 0, 0, 0, - 0.5, - 1, 0.012 );
		return wristMatrix( g, - 1, out ).premultiply( it.obj.matrixWorld );
	}

	// magazines, shells and rounds that travel in the left hand
	_handProp( it, act ) {
		const hp = this.handProp;
		hp.visible = false;
		if ( it.mag ) { it.mag.visible = !! it.stack?.data?.mag; it.mag.position.copy( it.mag.userData.rest ); it.mag.matrixAutoUpdate = true; if ( it.mag.parent !== it.obj ) it.obj.add( it.mag ); }
		if ( ! act || it.kind !== 'gun' ) return;
		const t = act.t, p = act.p || {};
		if ( act.type === 'reload_mag' || act.type === 'reload_belt' ) {
			if ( ! it.mag ) return;
			// the old magazine rides with the hand from the moment it's pulled until the pouch, the new one back
			const inHand = t >= p.magOut && t < p.magIn;
			if ( ! inHand ) {
				if ( t >= p.magIn ) this._setMagDef( it, p.newMag );
				it.mag.visible = t < p.magOut ? !! p.hadMag : true;
				return;
			}
			const mid = ( p.magOut + p.magIn ) / 2;
			if ( t > mid ) this._setMagDef( it, p.newMag );
			else if ( ! p.hadMag ) { it.mag.visible = false; return; }
			it.mag.visible = true;
			// keep the magazine where the hand has it: the hand->mag offset of the seated pose
			const mi = it.info.mag;
			const drop = t < p.magOut + 0.08 ? 0.12 * seg( t, p.magOut, p.magOut + 0.08 ) : t > p.magIn - 0.06 ? 0.12 * ( 1 - seg( t, p.magIn - 0.06, p.magIn ) ) : 0.12;
			it.mag.position.copy( it.mag.userData.rest );
			it.mag.position.x -= Math.sin( mi.rake || 0 ) * drop; it.mag.position.y -= Math.cos( mi.rake || 0 ) * drop;
			if ( t > p.magOut + 0.08 && t < p.magIn - 0.06 ) {
				// follow the hand: a fixed offset from the wrist taken from the seated (dropped) pose
				if ( ! this._magOff || this._magOffT !== act ) {
					it.obj.updateWorldMatrix( true, true );
					this._magOff = ( this._magOff || new THREE.Matrix4() ).copy( this.handL ).invert().multiply( it.mag.matrixWorld );
					this._magOffT = act;
				}
				_m.copy( it.obj.matrixWorld ).invert().multiply( this.handL ).multiply( this._magOff );
				_m.decompose( it.mag.position, it.mag.quaternion, _v );
			} else it.mag.rotation.set( 0, 0, mi.rake || 0 );
			return;
		}
		// a round / shell between the fingers
		if ( [ 'shells_insert', 'revolver_insert', 'break_insert', 'clip' ].includes( act.type ) && t < 0.52 ) {
			if ( hp.userData.cal !== it.f.caliber ) {
				this._clearHandProp();
				const C = CALIBERS[ it.f.caliber ] || CALIBERS[ '5.56' ];
				const shell = it.f.caliber === '12ga';
				const mats = weaponMaterials( 'view' );
				const n = act.type === 'clip' ? Math.min( 10, it.f.clip || 5 ) : 1;
				for ( let i = 0; i < n; i ++ ) {
					const m = new THREE.Mesh( new THREE.CylinderGeometry( C.r, C.r, C.len, 8 ).rotateZ( PI / 2 ), shell ? mats.red : mats.brass );
					m.position.set( 0, 0, i * C.r * 2.05 );
					hp.add( m );
				}
				hp.userData.cal = it.f.caliber;
			}
			hp.visible = true;
			// held between thumb and fingers: in front of the palm
			_m.makeTranslation( 0, - 0.03, 0.1 );
			_m2.copy( this.handL ).multiply( _m );
			_m2.decompose( hp.position, hp.quaternion, _v );
			hp.quaternion.multiply( _q.setFromAxisAngle( _v.set( 0, 1, 0 ), PI / 2 ) );
		}
	}

	_setMagDef( it, id ) {
		if ( ! id || it.mag.userData.def?.id === id ) return;
		const md = getItem( id );
		if ( ! md ) return;
		const obj = this._magObj( md, it.info );
		it.obj.remove( it.mag );
		it.mag = obj;
		it.obj.add( obj );
	}

	// sight lens reticles and the full-screen scope
	_optics( it ) {
		const s = this.s;
		if ( it.lens ) {
			it.obj.getWorldQuaternion( _q2 );
			aimLens( it.lens, _q2 );
			it.lens.userData.uniforms.uGlow.value = s.lit ? 3 : 6;
		}
		// magnified optics (and the AUG's built-in 1.5x, whose housing would otherwise fill the view) become a
		// full-screen sight picture at the end of the raise
		const integ = it.kind === 'gun' && ! it.optic && !! it.info?.integratedOptic;
		const ov = it.kind === 'gun' && ( it.optic?.overlay || integ );
		const k = ov ? smooth( clamp( ( s.ads - 0.82 ) / 0.16, 0, 1 ) ) : 0;
		s.overlay = k > 0.98;
		this.holder.visible = ! s.overlay;
		if ( ov ) {
			if ( integ ) this.overlay.set( 'ring', 0x000000, 1 );
			else {
				const a = it.optic.def.attachment;
				this.overlay.set( a.reticle, a.color ?? ( a.reticle === 'pso' ? 0xff4a10 : 0xff2010 ), s.lit ? 2.5 : 5 );
			}
			// the picture follows the gun's sway: centre on the optic axis' screen position
			const d = this.sightDir( _v );
			const tv = Math.tan( this.viewFovV * PI / 360 );
			const cx = d.x / - d.z / tv, cy = d.y / - d.z / tv;
			this.overlay.update( k, this.aspect, cx, cy, integ ? 1.05 : 0.92 );
		} else if ( s.binoc ) {
			this.overlay.set( 'binoc' );
			this.overlay.update( smooth( s.binoc ), this.aspect, 0, 0, 0.95 );
		} else this.overlay.update( 0, this.aspect );
	}

	// the direction the sights point, in view space
	sightDir( out = V() ) {
		const it = this.item;
		if ( ! it || it.kind !== 'gun' ) return out.set( 0, 0, - 1 );
		it.obj.getWorldQuaternion( _q2 );
		return out.set( 1, 0, 0 ).applyQuaternion( _q2 );
	}

	// the muzzle in view space
	muzzleView( out = V() ) {
		const it = this.item;
		if ( ! it?.muzzle ) return out.set( 0.1, - 0.1, - 0.6 );
		return out.set( ...it.muzzle ).applyMatrix4( it.obj.matrixWorld );
	}

	// where the right hand is (for throws / tools), in view space
	handPoint( out = V() ) { return out.setFromMatrixPosition( this.handR ); }

	_updateCasings( dt ) {
		for ( const c of this.casings ) {
			if ( c.t >= 0.9 ) { c.m.visible = false; continue; }
			c.t += dt;
			c.v.y -= 9.8 * dt;
			c.m.position.addScaledVector( c.v, dt );
			c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
		}
	}

	dispose() {
		this._disposed = true;
		this.clear();
		this.scene.remove( this.root, this.light );
		this.armR.dispose(); this.armL.dispose();
		// the flash, the brass and the scope overlay
		for ( const m of [ this.flashStar, ...this.flashSide.children, this.overlay.mesh ] ) { m.geometry.dispose(); m.material.dispose(); }
		this.casings[ 0 ]?.m.geometry.dispose();
		if ( FLASH_TEX ) { FLASH_TEX.star?.dispose(); FLASH_TEX.cone?.dispose(); FLASH_TEX = null; }
	}
}

// view copies of world materials: the clone drops the world patch (fog against the world camera)
const VIEW_MATS = new Map();
function viewCopy( m ) {
	if ( ! m ) return m;
	let c = VIEW_MATS.get( m.uuid );
	if ( c ) return c;
	c = m.clone();
	c.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
	c.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;
	c.fog = false;
	VIEW_MATS.set( m.uuid, c );
	return c;
}
