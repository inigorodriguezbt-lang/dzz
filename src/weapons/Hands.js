// What the survivor holds: firearms, melee weapons, grenades, tools and any item, with the first-person view
// model, input (fire, aim, reload, fire mode, quick melee, throw, flashlight, hold breath, hotbar, wheel), the
// shot itself (spread, recoil, noise, durability, jams), reload choreography (magazines, shells one at a time,
// revolvers, break actions, bows) and the inventory UI's weapon operations.
//
//   install( game ): game.hands (Hands), game.ballistics (Ballistics), game.throwables, game.fx (FX)
//
// game.hands API: held, aiming, select( stack ), selectSlot( slot ), holster(), reload(), use( stack ), adsSensitivity(),
// viewFov(), ammoInfo() -> { reserve, mode }, crosshairSpread() (rad), loadMagazine( mag, ammo ), unloadMagazine( mag ),
// insertMagazine( gun, mag ), removeMagazine( gun ), loadWeapon( gun, ammo ), unloadWeapon( gun ), attach( gun, att ),
// detach( gun, slot ), dispose().
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import '../game/items/defs/firearms.js';
import { getItem, makeStack, displayName } from '../game/items/ItemDB.js';
import * as ops from './ops.js';
import { ViewModel } from './ViewModel.js';
import { weaponMaterials, gunData, meleeData } from './GunModels.js';
import { reticleLens } from './Optics.js';
import { Ballistics, hitEntity, coneDir } from './Ballistics.js';
import { Throwables } from './Throwables.js';
import { FX } from '../render/FX.js';
import { ensureWeaponSounds } from './Sounds.js';

// the worn top's fabric on the sleeves (a tiling print from the items module), cached per print. The items module's
// print helper isn't a documented API: it is loaded lazily, and until (or unless) it loads the sleeves stay plain.
let printTex = null;
const printTexReady = import( '../game/items/models/lib.js' ).then( m => { printTex = m.printTex || null; } ).catch( () => {} );
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

// take a stack out of a list of items (nested containers included)
function pull( items, stack ) {
	const i = items.indexOf( stack );
	if ( i >= 0 ) { items.splice( i, 1 ); return true; }
	for ( const s of items ) if ( s.data?.items && pull( s.data.items, stack ) ) return true;
	return false;
}
function holds( items, stack ) {
	for ( const s of items ) if ( s === stack || ( s.data?.items && holds( s.data.items, stack ) ) ) return true;
	return false;
}

const PI = Math.PI;
const VIEW_FOV = 52;
const clamp = THREE.MathUtils.clamp;
const rnd = Math.random;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler( 0, 0, 0, 'YXZ' );
const LIVING = new Set( [ 'zombie', 'animal', 'npc' ] );
// a physics hit on something that moves (a door leaf, a vehicle's box): a world-space decal would be left hanging
const movingBox = ( h ) => h?.box && ( h.box.kind === 'door' || h.box.dynamic || h.box.owner?.type === 'vehicle' );
const CONSUMABLE = new Set( [ 'food', 'drink', 'medical' ] );

export function install( game ) {
	const fx = game.fx = new FX( game );
	const bal = game.ballistics = new Ballistics( game );
	const thr = game.throwables = new Throwables( game );
	const hands = game.hands = new Hands( game );
	game.register( {
		name: 'weapons',
		update( dt ) {
			hands.update( dt );
			bal.update( dt );
			thr.update( dt );
			fx.update( dt );
		},
		dispose() { hands.dispose(); thr.dispose(); bal.dispose(); fx.dispose(); },
	} );
	return hands;
}

export class Hands {
	constructor( game ) {
		this.game = game;
		this.vm = new ViewModel( game.viewScene );
		this.shown = null; // the stack the view shows (lags the held one while switching)
		this.equip = 0;
		this.adsT = 0; this.adsWant = false; this.sprintT = 0; this.lowerT = 0; this.blockT = 0;
		this.act = null;
		this.fireCD = 0; this.burst = 0; this.trigger = false; this.triggerT = 0;
		this.bloom = 0; this.recoilDebt = 0; this.sinceShot = 9;
		this.breath = { t: 0, tired: 0, holding: false };
		this.zoomIdx = 0;
		this.meleeVariant = 0;
		this.drawT = 0; this.drawing = false; this.drawHeldT = 0;
		this.throwing = null; // { stack, def, cook, pin, under, quick }
		this.quickReturn = null;
		this.lastUid = null;
		this.jamWarned = 0;
		this.eyeZoom = 0;
		this.binoc = 0;
		this.frame = 0;
		this.lookYaw = 0; this.lookPitch = 0; this._py = null; this._pp = null;
		this.shotCount = 0;
		this._built = new Set();
		// world flashlight (a constant light count: no shader recompiles when it toggles)
		this.spot = new THREE.SpotLight( 0xfff4e0, 0, 45, 0.42, 0.45, 2 );
		this.spot.castShadow = false;
		game.scene.add( this.spot, this.spot.target );
		// and a little of it on the view model
		this.lamp = new THREE.PointLight( 0xfff0dc, 0, 1.5, 2 );
		game.viewScene.add( this.lamp );
		this.hemi = game.viewScene.children.find( o => o.isHemisphereLight ) || null;
		// PBR metal needs something to reflect: a small studio environment for the view materials
		try {
			const gl = game.renderer?.gl;
			if ( gl ) {
				const pm = new THREE.PMREMGenerator( gl ), room = new RoomEnvironment();
				this.envTex = pm.fromScene( room, 0.04 ).texture;
				pm.dispose();
				room.dispose();
				this.vm.setEnvironment( this.envTex );
			}
		} catch ( e ) { console.warn( 'view env', e ); }
		this._offs = [
			game.events.on( 'playerDeath', () => this._onDeath() ),
		];
		// the sleeve print helper arrives late: dress the arms again when it does
		printTexReady.then( () => { this._invVer = - 1; } );
		this._warmUp();
		// the modelled arms arrive a moment later: compile their materials then, not on the first draw
		this.vm.onArms = () => this._warmArms();
	}

	_warmArms() {
		const g = this.game, gl = g.renderer?.gl, vm = this.vm;
		if ( ! gl?.compile ) return;
		try {
			const wasVis = vm.root.visible, vis = [ vm.armR.visible, vm.armL.visible ];
			vm.root.visible = true; vm.armL.visible = true;
			vm.armL.warm( true );
			gl.compile( g.viewScene, g.viewCamera );
			vm.armL.warm( false );
			vm.root.visible = wasVis; [ vm.armR.visible, vm.armL.visible ] = vis;
		} catch ( e ) { console.warn( 'arms warm-up', e ); }
	}

	// Compile every shader the hands and the effects will need while the world is still loading, so the first
	// weapon drawn (and the first shot) shows up at once instead of stalling on shader compiles.
	_warmUp() {
		const g = this.game, gl = g.renderer?.gl;
		if ( ! gl?.compile ) return;
		try {
			const vm = this.vm;
			// one tiny mesh per weapon material (every gun, magazine and optic uses this shared set)
			const box = new THREE.BoxGeometry( 0.001, 0.001, 0.001 );
			const warm = new THREE.Group();
			for ( const m of Object.values( weaponMaterials( 'view' ) ) ) warm.add( new THREE.Mesh( box, m ) );
			const red = getItem( 'optic_reddot' );
			if ( red ) warm.add( reticleLens( red, { lensR: 0.012, axisH: 0.03 } ) );
			vm.root.add( warm );
			// both arms, one of them with every clothing material on
			const wasVis = vm.root.visible;
			vm.root.visible = true;
			vm.armL.warm( true );
			gl.compile( g.viewScene, g.viewCamera );
			vm.armL.warm( false );
			vm.root.visible = wasVis;
			vm.root.remove( warm );
			box.dispose();
			// the effects in the world scene (particles, decals, tracers, brass), lit like the world
			const fx = this.game.fx;
			if ( fx && g.scene ) {
				const objs = [ fx.alpha?.mesh, fx.add?.mesh, fx.decals, fx.beams, fx.cas ].filter( Boolean );
				const tmp = new THREE.Scene();
				for ( const o of objs ) tmp.add( o );
				gl.compile( tmp, g.camera, g.scene );
				for ( const o of objs ) g.scene.add( o );
			}
		} catch ( e ) { console.warn( 'weapons warm-up', e ); }
	}

	// a grenade in hand falls with the body: a pulled pin or a lit wick goes off where the player died, never later at
	// the next spawn
	_onDeath() {
		this._cancelAct();
		this.adsWant = false;
		this.game.player.aimFov = 1;
		const T = this.throwing;
		if ( T && ! T.launched && ( T.pin || T.lit ) && this._owned( T.stack ) ) this._launch( T, true );
		this.throwing = null;
		this.quickReturn = null;
		this._ammoPref = null;
	}

	// build the view models of the carried weapons ahead of time (one per call), so switching never waits on it
	_prefetch() {
		const inv = this.inv;
		const list = [ inv.weapons?.primary, inv.weapons?.secondary, inv.weapons?.sidearm, inv.weapons?.melee, ...( inv.hotbar || [] ).map( u => inv.findUid( u ) ) ];
		for ( const st of list ) {
			const def = st && getItem( st.id );
			if ( ! def || this._built.has( def.id ) ) continue;
			this._built.add( def.id );
			try {
				if ( def.firearm ) gunData( def );
				else if ( def.melee ) meleeData( def );
			} catch ( e ) { console.warn( 'prefetch', def.id, e ); }
			return;
		}
	}

	get inv() { return this.game.player.inventory; }
	get held() { return this.inv.heldStack(); }
	get def() { const s = this.held; return s ? getItem( s.id ) : null; }
	get f() { return this.def?.firearm || null; }
	get creative() { return this.game.mode === 'creative'; }

	kindOf( def ) {
		if ( ! def ) return null;
		return def.cat === 'firearm' ? 'gun' : def.cat === 'melee' ? 'melee' : def.cat === 'throwable' ? 'throw' : def.cat === 'tool' ? 'tool' : 'item';
	}

	// the HUD / Player read this: true while the aim button is working (the crosshair hides, movement slows)
	get aiming() {
		const k = this.kindOf( this.def );
		if ( k === 'gun' ) return this.adsWant && this._canAim();
		if ( k === 'tool' && this.def.tool?.kind === 'binoculars' ) return this.adsWant;
		return false;
	}

	// ---- selection ------------------------------------------------------------------------------------------------

	select( stack ) {
		if ( ! stack ) return this.holster();
		const inv = this.inv;
		if ( ! inv.findUid( stack.uid ) ) { this.game.toast( 'Not in inventory', 'warn' ); return false; }
		if ( inv.hands === stack.uid ) return true;
		const def = getItem( stack.id );
		if ( def?.cat === 'firearm' ) ops.sanitizeGun( stack );
		this._cancelAct();
		// switching away from a cooking frag drops it live at the feet
		this._endThrow();
		this.lastUid = inv.hands || this.lastUid;
		inv.hands = stack.uid;
		inv.changed();
		this.adsWant = false;
		return true;
	}

	selectSlot( slot ) {
		const st = this.inv.weapons[ slot ];
		if ( st ) return this.select( st );
		return false;
	}

	holster() {
		const inv = this.inv;
		if ( ! inv.hands ) return;
		this._cancelAct();
		this._endThrow();
		this.lastUid = inv.hands;
		inv.hands = null;
		inv.changed();
		this.adsWant = false;
		this._sfx( 'holster', 0.4 );
	}

	// consumables from the inventory UI (food, drink, medicine): the items module runs the timed action
	use( stack ) {
		const g = this.game;
		if ( g.itemUse?.use ) return g.itemUse.use( stack );
		// minimal fallback when the items module isn't loaded
		const def = getItem( stack?.id );
		if ( ! def ) return false;
		const done = () => { stack.qty --; if ( stack.qty <= 0 ) this.inv.remove( stack ); this.inv.changed(); };
		if ( def.food ) g.actions.start( { label: 'Eating', time: 3, sound: 'eat', onDone: () => { g.survival.eat( stack ); done(); } } );
		else if ( def.drink ) g.actions.start( { label: 'Drinking', time: 2.5, sound: 'drink', onDone: () => { g.survival.drink( def ); done(); } } );
		else if ( def.medical ) g.actions.start( { label: 'Using', time: def.medical.use || 3, sound: 'bandage', onDone: () => { g.survival.medicate( def ); done(); } } );
		else return false;
		return true;
	}

	// ---- per frame ----------------------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game, p = g.player, inv = this.inv;
		this.frame ++;
		ensureWeaponSounds( g.audio );
		if ( this.frame % 20 === 0 ) this._prefetch();
		// the held uid must still be in the inventory (dropped, eaten, traded away): holster quietly
		if ( inv.hands && ! inv.findUid( inv.hands ) ) { inv.hands = null; inv.changed(); this._cancelAct(); }
		// an item whose definition is gone (an old save, a removed mod item) can't be held
		if ( inv.hands && ! getItem( this.held?.id ) ) { inv.hands = null; inv.changed(); this._cancelAct(); }
		const held = this.held;
		const def = held ? getItem( held.id ) : null;
		const kind = this.kindOf( def );
		const out = g.dead || !! p.vehicle;
		// look rate (for weapon lag), from the player's own yaw / pitch
		if ( this._py !== null ) {
			let dy = p.yaw - this._py; dy = Math.atan2( Math.sin( dy ), Math.cos( dy ) );
			this.lookYaw += ( dy / Math.max( dt, 1e-3 ) * 0.016 - this.lookYaw ) * Math.min( 1, dt * 20 );
			this.lookPitch += ( ( p.pitch - this._pp ) / Math.max( dt, 1e-3 ) * 0.016 - this.lookPitch ) * Math.min( 1, dt * 20 );
		}
		this._py = p.yaw; this._pp = p.pitch;
		if ( out ) {
			this.vm.visible = false;
			this.vm.update( dt, g.viewCamera );
			this.adsWant = false; this.trigger = false;
			p.aimFov += ( 1 - p.aimFov ) * Math.min( 1, dt * 10 );
			if ( this.act ) this._cancelAct();
			this._flashlight( dt, true );
			return;
		}
		this.vm.visible = true;
		// switching: lower what's shown, swap, raise the new one
		if ( held !== this.shown ) {
			this.equip = Math.max( 0, this.equip - dt / 0.16 );
			if ( this.equip <= 0 || ! this.shown ) {
				// whatever the old item was doing stops (a grenade on its way up is the exception)
				if ( this.act && this.act.type !== 'throw' ) this._cancelAct();
				if ( this.throwing && this.throwing.stack !== held ) this._endThrow();
				this.shown = held;
				this.equip = 0;
				this.vm.s.empty = !! ( held && def?.firearm && ! ops.readyToFire( held ) && ! ops.canChamber( held ) );
				this._invVer = - 1;
				if ( held ) this._sfx( kind === 'gun' ? 'equip' : 'pickup', 0.45 );
				this.drawT = 0; this.drawing = false;
				this.zoomIdx = 0;
			}
		} else {
			const raise = kind === 'gun' ? 0.25 + ( 1 - ( this.f?.handling ?? 0.7 ) ) * 0.45 : 0.25;
			this.equip = Math.min( 1, this.equip + dt / raise );
		}
		// the view item (rebuilt when the magazine / attachments change)
		const shownDef = this.shown ? getItem( this.shown.id ) : null;
		const vmKind = this.shown ? this.kindOf( shownDef ) : ( this.act && ( this.act.type === 'punch' || this.act.type === 'shove' ) ? 'fists' : null );
		if ( inv.version !== this._invVer || vmKind !== this._vmKind ) {
			this._invVer = inv.version; this._vmKind = vmKind;
			this.vm.setItem( this.shown, vmKind );
			this._dressArms();
		}
		const ready = held === this.shown && this.equip > 0.9;
		// input
		if ( g.inputActive ) this._input( dt, held, def, kind, ready );
		else {
			if ( this.trigger ) this._release( held, def, kind );
			this.trigger = false;
			if ( ! g.settings.get( 'toggleAim' ) ) this.adsWant = false;
		}
		this._updateAct( dt );
		if ( kind === 'gun' ) this._auto( dt, held, def, ready );
		if ( this.throwing ) this._cook( dt );
		this._states( dt, held, def, kind );
		this._aim( dt, def, kind );
		this._flashlight( dt, false );
		this._feedVM( dt, held, def, kind );
		this.vm.update( dt, g.viewCamera );
		// view lighting follows the world's (night, indoors)
		if ( this.frame % 8 === 0 ) this._viewLight();
	}

	_input( dt, held, def, kind, ready ) {
		const g = this.game, I = g.input, inv = this.inv;
		// hotbar 1-9 (unassigned 1-4 fall back to the weapon slots)
		for ( let i = 1; i <= 9; i ++ ) {
			if ( ! I.pressed( 'slot' + i ) ) continue;
			let st = inv.findUid( inv.hotbar[ i - 1 ] );
			if ( ! st && i <= 4 ) st = inv.weapons[ [ 'primary', 'secondary', 'sidearm', 'melee' ][ i - 1 ] ];
			if ( ! st ) continue;
			if ( st.uid === inv.hands ) this.holster(); else this.select( st );
			return;
		}
		// mouse wheel: scope magnification while aiming, else cycle weapons
		const wheel = I.consumeWheel();
		if ( wheel ) {
			const zooms = this._opticDef()?.attachment?.zooms;
			if ( this.adsT > 0.5 && zooms?.length > 1 ) {
				this.zoomIdx = clamp( this.zoomIdx - Math.sign( wheel ), 0, zooms.length - 1 );
				this._sfx( 'switch_mode', 0.2, 1.4 );
			} else this._cycle( Math.sign( wheel ) );
		}
		if ( I.pressed( 'holster' ) ) {
			if ( held ) this.holster();
			else { const st = inv.findUid( this.lastUid ); if ( st ) this.select( st ); }
			return;
		}
		if ( I.pressed( 'flashlight' ) ) this._toggleLight( held, def );
		if ( I.pressed( 'throw' ) ) this._startThrow( false, true );
		if ( I.released( 'throw' ) && this.throwing?.byKey ) this._releaseThrow();
		if ( I.pressed( 'melee' ) ) this._quickMelee( held, def, kind );
		// aim: hold or toggle
		const toggle = g.settings.get( 'toggleAim' );
		const aimKey = kind === 'melee' ? false : true;
		if ( aimKey ) {
			if ( toggle ) { if ( I.pressed( 'aim' ) ) this.adsWant = ! this.adsWant; }
			else this.adsWant = I.is( 'aim' );
		}
		// hold breath while aimed; eye zoom otherwise
		this.breath.holding = I.is( 'zoom' ) && this.adsT > 0.6;
		this.eyeZoomWant = I.is( 'zoom' ) && this.adsT < 0.3;
		if ( ! held ) {
			if ( I.pressed( 'fire' ) && ! this.act ) this._punch();
			return;
		}
		if ( kind === 'gun' ) {
			if ( I.pressed( 'reload' ) ) this.reload();
			if ( I.pressed( 'fireMode' ) ) this._switchMode( held, def );
			const f = def.firearm;
			if ( f.action === 'bow' ) {
				if ( I.is( 'fire' ) && ready && ! this.act ) this._draw( dt, held );
				else if ( this.drawing ) this._loose( held, def );
				return;
			}
			if ( I.pressed( 'fire' ) ) { this.trigger = true; this.burst = f.modes[ held.data.mode || 0 ] === 'burst' ? 3 : 0; this._pull( held, def, ready, true ); }
			if ( ! I.is( 'fire' ) ) this.trigger = false;
		} else if ( kind === 'melee' ) {
			if ( I.pressed( 'fire' ) ) this._swing( held, def, false );
			else if ( I.pressed( 'aim' ) ) this._swing( held, def, true );
		} else if ( kind === 'throw' ) {
			if ( I.pressed( 'fire' ) ) this._startThrow( false, false );
			else if ( I.pressed( 'aim' ) && ! this.throwing ) this._startThrow( true, false );
			if ( this.throwing && ! this.throwing.byKey && ( I.released( 'fire' ) || I.released( 'aim' ) ) ) this._releaseThrow();
		} else if ( I.pressed( 'fire' ) && ready && def ) {
			// tools and items: use them
			if ( def.tool?.kind === 'flashlight' || def.tool?.kind === 'headlamp' ) this._toggleLight( held, def );
			else if ( def.tool?.kind === 'binoculars' ) this.adsWant = ! this.adsWant;
			else this.use( held );
		}
	}

	_cycle( dir ) {
		const inv = this.inv;
		const list = [ inv.weapons.primary, inv.weapons.secondary, inv.weapons.sidearm, inv.weapons.melee ].filter( Boolean );
		for ( const uid of inv.hotbar ) { const s = inv.findUid( uid ); if ( s && ! list.includes( s ) ) list.push( s ); }
		if ( ! list.length ) return;
		const i = list.findIndex( s => s.uid === inv.hands );
		const n = list[ ( ( i < 0 ? ( dir > 0 ? - 1 : 0 ) : i ) + dir + list.length ) % list.length ];
		this.select( n );
	}

	// ---- actions (timed animations with events) -----------------------------------------------------------------------------

	// type: animation name; dur (s); p: params for the view; ev: [ [ fraction, fn ] ]; onEnd; onCancel
	_startAct( type, dur, p = {}, ev = [], onEnd = null, onCancel = null ) {
		this._cancelAct();
		this.act = { type, t: 0, dur: Math.max( 0.05, dur ), p, ev: ev.sort( ( a, b ) => a[ 0 ] - b[ 0 ] ), i: 0, onEnd, onCancel };
		return this.act;
	}

	_cancelAct() {
		const a = this.act;
		if ( ! a ) return;
		this.act = null;
		a.onCancel?.();
	}

	_updateAct( dt ) {
		const a = this.act;
		if ( ! a ) return;
		a.t += dt;
		const k = a.t / a.dur;
		while ( a.i < a.ev.length && k >= a.ev[ a.i ][ 0 ] ) {
			const fn = a.ev[ a.i ][ 1 ];
			a.i ++;
			try { fn(); } catch ( e ) { console.error( e ); }
			if ( this.act !== a ) return;
		}
		if ( k >= 1 ) {
			this.act = null;
			a.onEnd?.();
		}
	}

	// ---- firing ----------------------------------------------------------------------------------------------------------

	_canAim() {
		const p = this.game.player;
		if ( p.swimming || this.game.actions.busy ) return false;
		const a = this.act?.type;
		// the eye can stay on the sights while a bolt or charging handle is worked, not through a reload
		if ( a && a !== 'cycle' && a !== 'charge' ) return false;
		return this.equip > 0.5 && this.held === this.shown;
	}

	_canFire() {
		const g = this.game, p = g.player;
		return this.equip > 0.92 && this.sprintT < 0.3 && this.lowerT < 0.2 && ! p.swimming && ! g.actions.busy && this.held === this.shown;
	}

	// trigger pressed (first = the press itself, false = held for auto / burst)
	_pull( gun, def, ready, first ) {
		const f = def.firearm, g = this.game;
		if ( this.act ) {
			// fire interrupts loading one round at a time
			if ( first && this.act.p?.loop ) this.act.p.stop = true;
			return;
		}
		if ( ! ready || ! this._canFire() || this.fireCD > 0 ) return;
		if ( gun.cond <= 0 ) { if ( first ) { this._sfx( 'dryfire', 0.6 ); g.toast( `${def.name} ruined`, 'bad' ); } return; }
		if ( gun.data.jam ) {
			if ( first ) {
				this._sfx( 'dryfire', 0.7 );
				if ( performance.now() - this.jamWarned > 3000 ) { this.jamWarned = performance.now(); g.toast( 'Jammed', 'warn' ); }
			}
			return;
		}
		if ( ! ops.readyToFire( gun ) ) {
			if ( first && ops.canChamber( gun ) ) { this._rack( gun, def ); return; }
			if ( first ) { this._sfx( 'dryfire', 0.7 ); this.fireCD = 0.2; this.vm.s.trigger = 1; }
			this.burst = 0;
			return;
		}
		this._shoot( gun, def );
	}

	_auto( dt, gun, def, ready ) {
		this.fireCD = Math.max( 0, this.fireCD - dt );
		this.sinceShot += dt;
		this.bloom *= Math.exp( - dt * 4 );
		// recoil recovery: the muzzle settles partway back after a burst
		if ( this.sinceShot > 0.1 && this.recoilDebt > 0 ) {
			const r = this.recoilDebt * Math.min( 1, dt * 7 );
			this.recoilDebt -= r;
			this.game.player.recoil.x -= r * 0.07;
		}
		const f = def.firearm;
		const mode = f.modes[ gun.data.mode || 0 ];
		if ( this.fireCD > 0 ) return;
		if ( this.burst > 0 && this.burstShot ) { this._pull( gun, def, ready, false ); return; }
		if ( this.trigger && mode === 'auto' ) this._pull( gun, def, ready, false );
	}

	_shoot( gun, def ) {
		const g = this.game, p = g.player, f = def.firearm;
		const ammoId = ops.consumeRound( gun );
		if ( ! ammoId ) return;
		const adef = getItem( ammoId );
		const mode = f.modes[ gun.data.mode || 0 ];
		const att = gun.data.att || {};
		const supp = att.muzzle ? getItem( att.muzzle.id ) : null;
		const suppOk = supp && att.muzzle.cond > 0;
		// where it goes
		const dir = this._aimDir( _v );
		this._zero( dir, f );
		const origin = g.camera.position.clone();
		const spread = this.crosshairSpread( true );
		const muzzle = this._muzzleWorld( _v3 );
		g.ballistics.fire( origin, dir, { weapon: def, ammo: adef, source: p, spread, visual: muzzle, tracer: f.cls === 'lmg' && this.shotCount % 4 === 0 ? 1 : 0 } );
		this.shotCount = ( this.shotCount || 0 ) + 1;
		// the report: suppressed guns get the suppressed sample, subsonic rounds most of all
		const sub = adef && ( ( adef.ammo.caliber === '9mm' || adef.ammo.caliber === '.45acp' || adef.ammo.caliber === '.22lr' ) );
		if ( suppOk ) this._sfx( f.cls === 'sniper' || f.caliber === '.308' ? 'gun_supp_sniper' : f.cls === 'pistol' || f.cls === 'smg' ? 'gun_supp_pistol' : 'gun_supp', 0.9, f.pitch || 1 );
		else this._sfx( f.sound, 1, ( f.pitch || 1 ) * ( 0.97 + rnd() * 0.06 ), 0.03 );
		// the mechanism
		if ( ! ops.roundsOnly( f ) && f.action !== 'bow' ) this._sfx( 'casing', 0.12, 1.3, 0.2, 0.05 );
		const noise = f.noise * ( suppOk ? ( supp.attachment.noise ?? 0.3 ) * ( sub ? 0.6 : 1 ) : 1 );
		g.events.emit( 'noise', { pos: p.pos.clone(), radius: noise, source: p, kind: 'gunshot' } );
		// recoil: camera kick (climb) + view model springs
		const stanceK = p.stance === 'prone' ? 0.55 : p.stance === 'crouch' ? 0.8 : 1;
		const heavyK = f.cls === 'lmg' && p.stance !== 'prone' ? 1.25 : 1;
		const kickP = f.recoil * 0.0105 * ( 0.8 + rnd() * 0.4 ) * stanceK * heavyK * ( 1 - this.adsT * 0.2 ) * ( suppOk ? 0.92 : 1 );
		const kickY = ( rnd() - 0.45 ) * f.recoil * 0.0045 * stanceK;
		p.recoil.x += kickP; p.recoil.y += kickY;
		this.recoilDebt += kickP * 0.55 / 0.07;
		if ( f.recoil > 1.8 ) p.shake = Math.max( p.shake, Math.min( 0.35, ( f.recoil - 1.6 ) * 0.2 ) );
		this.vm.kick( f.recoil, this.adsT, { flash: ! suppOk && f.caliber !== 'arrow' && f.caliber !== 'bolt', scale: f.cls === 'shotgun' ? 1.4 : f.cls === 'pistol' ? 0.8 : f.caliber === '.50bmg' ? 2 : 1 } );
		this.bloom += f.recoil * 0.007 * ( 1 - this.adsT * 0.5 ) * stanceK;
		this.sinceShot = 0;
		this.fireCD = 60 / f.rpm;
		if ( this.burst > 0 ) { this.burst --; this.burstShot = this.burst > 0; }
		// world muzzle smoke (and the flash light for the surroundings)
		const fwd = _v2.copy( dir );
		g.fx?.muzzle( muzzle, fwd, { scale: f.cls === 'shotgun' ? 1.3 : f.cls === 'pistol' ? 0.6 : 1, suppressed: suppOk, flash: false } );
		if ( ! suppOk && f.caliber !== 'arrow' && f.caliber !== 'bolt' ) g.fx?.light( muzzle, f.caliber === 'flare' ? 0xff3020 : 0xffb46a, f.cls === 'pistol' ? 16 : 26, 14, 0.07 );
		// brass: self-loaders throw it now, manual actions when cycled
		const selfLoad = ! ops.manualCycle( f, mode ) && ! ops.roundsOnly( f );
		if ( selfLoad ) this._ejectCasing( f );
		if ( f.action === 'revolver' ) this.vm.cylAngle = ( this.vm.cylAngle || 0 ) + PI / 3;
		// wear, suppressor wear, jams
		if ( ! this.creative ) {
			gun.cond = Math.max( 0, gun.cond - 0.0006 * ( 1 + f.recoil * 0.25 ) );
			if ( suppOk ) att.muzzle.cond = Math.max( 0, att.muzzle.cond - 0.0025 );
			const jamP = gun.cond < 0.72 ? Math.pow( 0.72 - gun.cond, 2 ) * 0.28 : 0;
			if ( selfLoad && gun.data.chamber && rnd() < jamP ) { gun.data.jam = true; this._sfx( 'jam', 0.6 ); }
			if ( gun.cond <= 0 ) g.toast( `${def.name} ruined`, 'bad' );
		}
		// bolt / pump / lever: work the action (automatically, after the recoil)
		if ( ops.manualCycle( f, mode ) && ! ops.roundsOnly( f ) ) {
			this.fireCD = Math.max( this.fireCD, 0.15 );
			this._cycleAfter = 0.13;
			this._cycleGun = gun;
		}
		// the slide locks back on the last round
		this.vm.s.empty = ! ops.readyToFire( gun ) && ! ops.canChamber( gun );
		this.inv.changed();
	}

	// aim direction (world): the camera's aim at the hip, the sights' own line when aimed down them
	_aimDir( out ) {
		const g = this.game, p = g.player;
		_e.set( p.pitch, p.yaw, 0, 'YXZ' );
		_q.setFromEuler( _e );
		out.set( 0, 0, - 1 );
		const k = this.adsT * this.adsT * ( 3 - 2 * this.adsT );
		if ( k > 0 && this.vm.item?.kind === 'gun' ) {
			const sd = this.vm.sightDir( _v2 );
			const tv = Math.tan( g.viewCamera.fov * PI / 360 ), tw = Math.tan( g.camera.fov * PI / 360 );
			const x = sd.x / - sd.z / tv * tw, y = sd.y / - sd.z / tv * tw;
			out.set( x * k, y * k, - 1 ).normalize();
		}
		return out.applyQuaternion( _q );
	}

	// sights are zeroed: lift the line of departure so the round crosses the line of sight at the zero range
	_zero( dir, f ) {
		const z = this._opticDef() ? Math.max( 100, f.zero || 100 ) : f.zero || 50;
		const t = z / f.velocity;
		dir.y += 0.5 * 9.81 * t * t / z;
		return dir.normalize();
	}

	// the muzzle in the world at the spot it's drawn on screen (for tracers, smoke, the flash light)
	_muzzleWorld( out ) {
		const g = this.game;
		const mv = this.vm.muzzleView( out );
		const k = Math.tan( g.camera.fov * PI / 360 ) / Math.tan( g.viewCamera.fov * PI / 360 );
		mv.x *= k; mv.y *= k;
		return g.camera.localToWorld( mv );
	}

	_ejectCasing( f ) {
		const g = this.game;
		const shell = f.caliber === '12ga';
		this.vm.eject( f.caliber, shell );
		const it = this.vm.item;
		if ( ! it?.info?.eject ) return;
		// a world casing too, so brass piles up at your feet
		const pos = this._muzzleWorld( _v3 );
		const cam = g.camera;
		const right = _v.set( 1, 0.6, 0.3 ).applyQuaternion( cam.quaternion );
		pos.lerp( cam.position, 0.7 );
		g.fx?.casing( pos, right.multiplyScalar( 2.2 + rnd() ).add( g.player.vel ), { scale: f.cls === 'pistol' ? 0.6 : f.caliber === '.50bmg' ? 2 : shell ? 1.6 : 1, color: shell ? 0xb02018 : null, sound: shell ? 'shell_drop' : 'casing' } );
	}

	_switchMode( gun, def ) {
		const f = def.firearm;
		if ( f.modes.length < 2 ) return;
		gun.data.mode = ( ( gun.data.mode || 0 ) + 1 ) % f.modes.length;
		this._sfx( 'switch_mode', 0.5 );
		this.game.toast( ops.modeName( gun ), 'info' );
		this.inv.changed();
	}

	// ---- racking / cycling ----------------------------------------------------------------------------------------------

	// work the action to chamber a round (after a magazine was inserted from the inventory, or a bolt gun between shots)
	_rack( gun, def ) {
		const f = def.firearm;
		const mode = f.modes[ gun.data.mode || 0 ];
		if ( f.action === 'bolt' || f.action === 'lever' || f.action === 'pump' || mode === 'pump' || mode === 'bolt' ) return this._cycle1( gun, def );
		const pistol = f.cls === 'pistol';
		this._startAct( 'charge', 0.75, {}, [
			[ 0.35, () => this._sfx( pistol ? 'slide' : 'charge', 0.7 ) ],
			[ 0.55, () => { ops.chamberRound( gun ); this.vm.s.empty = false; this.inv.changed(); } ],
		] );
	}

	// one bolt / pump / lever stroke: eject the empty, chamber the next
	_cycle1( gun, def ) {
		const f = def.firearm;
		const dur = Math.max( 0.3, f.boltTime || 0.6 );
		const snd = f.action === 'pump' || f.modes.includes( 'pump' ) ? 'pump' : 'bolt';
		this._startAct( 'cycle', dur, {}, [
			[ 0.12, () => this._sfx( snd, 0.75, snd === 'bolt' ? 0.95 : 1 ) ],
			[ 0.45, () => { if ( gun.data.spent ) { this._ejectCasing( f ); gun.data.spent = false; } } ],
			[ 0.6, () => { ops.chamberRound( gun ); this.vm.s.empty = ! ops.readyToFire( gun ); this.inv.changed(); } ],
		] );
	}

	// ---- reloading ---------------------------------------------------------------------------------------------------------

	reload() {
		const g = this.game, gun = this.held, def = this.def;
		if ( ! gun || def?.cat !== 'firearm' || this.act || this.held !== this.shown || this.equip < 0.9 ) return false;
		const f = def.firearm, inv = this.inv;
		ops.sanitizeGun( gun );
		const speed = this.creative ? 0.8 : 1;
		const pistol = f.cls === 'pistol';
		// a jam clears first
		if ( gun.data.jam ) {
			this._startAct( 'jam', 1.0 * speed, {}, [
				[ 0.3, () => this._sfx( 'jam', 0.6 ) ],
				[ 0.5, () => { this._sfx( pistol ? 'slide' : 'charge', 0.7 ); gun.data.jam = false; if ( gun.data.chamber ) { gun.data.chamber = 0; this._ejectCasing( f ); } ops.chamberRound( gun ); this.inv.changed(); } ],
			] );
			return true;
		}
		if ( f.feed === 'mag' ) {
			const best = ops.bestMagazine( inv, gun );
			if ( ! best ) {
				if ( ops.canChamber( gun ) ) { this._rack( gun, def ); return true; }
				if ( gun.data.mag && gun.data.mag.data.rounds >= getItem( gun.data.mag.id ).magazine.capacity ) this._inspect();
				else {
					const spare = ops.spareMags( inv, gun );
					g.toast( ! spare.length ? 'No magazine' : spare.every( m => ! ( m.data.rounds > 0 ) ) ? 'Magazines empty' : 'No fuller magazine', 'warn' );
				}
				return false;
			}
			const empty = ! gun.data.chamber && f.action !== 'open';
			const belt = best.id.startsWith( 'box_' );
			const dur = f.reload * ( empty ? 1.2 : 1 ) * speed;
			const p = { magOut: 0.3, magIn: 0.66, charge: empty && f.action !== 'open' ? 0.86 : 0, hadMag: !! gun.data.mag, newMag: best.id };
			this.vm.s.slideLocked = this.vm.s.empty;
			this._startAct( belt || gun.data.mag?.id?.startsWith( 'box_' ) ? 'reload_belt' : 'reload_mag', dur, p, [
				[ 0.05, () => belt && this._sfx( 'charge', 0.4, 0.7 ) ],
				[ p.magOut, () => p.hadMag && this._sfx( 'mag_out', 0.7 ) ],
				[ p.magIn, () => {
					// the swap happens here, atomically: cancelled before this point nothing moved
					if ( ! inv.findUid( best.uid ) ) { g.toast( 'Magazine missing', 'warn' ); return; }
					const old = gun.data.mag;
					inv.remove( best );
					gun.data.mag = best;
					if ( old && inv.add( old, { autoEquip: false } ) > 0 ) { g.dropStack( old ); g.toast( 'Magazine dropped', 'warn' ); }
					this._sfx( 'mag_in', 0.8 );
					inv.changed();
				} ],
				...( p.charge ? [ [ p.charge, () => { this._sfx( pistol ? 'slide' : 'charge', 0.8 ); ops.chamberRound( gun ); this.vm.s.empty = false; inv.changed(); } ] ] : [] ),
			], () => { this.vm.s.empty = ! ops.readyToFire( gun ) && ! ops.canChamber( gun ); } );
			return true;
		}
		// internal feeds
		const ammo = this._ammoFor( gun, f );
		const room = ops.internalRoom( gun );
		if ( f.action === 'bow' || f.action === 'crossbow' ) {
			if ( gun.data.rounds > 0 ) return false;
			if ( ! ammo ) { g.toast( f.caliber === 'arrow' ? 'No arrows' : 'No bolts', 'warn' ); return false; }
			return this._nock( gun, def, ammo );
		}
		if ( ! room || ! ammo ) {
			if ( ops.canChamber( gun ) ) { this._rack( gun, def ); return true; }
			if ( ! room ) this._inspect();
			else g.toast( 'No ammo', 'warn' );
			return false;
		}
		if ( f.action === 'revolver' ) return this._loop( gun, def, 'revolver', 0.55, 0.4 );
		if ( f.action === 'break' ) return this._loop( gun, def, 'break', 0.5, 0.4 );
		// stripper clip into an empty SKS / Mosin
		if ( f.clip && room >= f.clip && ammo.qty >= f.clip && ! gun.data.chamber ) {
			this._startAct( 'shells_open', 0.4 * speed, {}, [ [ 0.3, () => this._sfx( 'bolt', 0.5, 1.1 ) ] ], () => {
				this._startAct( 'clip', f.reload * 0.8 * speed, { port: 'top' }, [
					[ 0.5, () => { const a = this._ammoFor( gun, f ); if ( a ) { ops.loadInternal( gun, a, f.clip ); this._spend( a ); } this._sfx( 'shell_in', 0.7, 0.8 ); this._sfx( 'mag_in', 0.4, 1.3 ); } ],
				], () => this._closeLoop( gun, def, 'shells' ) );
			} );
			return true;
		}
		return this._loop( gun, def, 'shells', f.action === 'bolt' ? 0.5 : 0.35, 0.45 );
	}

	// open -> insert one round at a time (interruptible by fire) -> close
	_loop( gun, def, kind, openT, closeT ) {
		const f = def.firearm, g = this.game, inv = this.inv;
		const speed = this.creative ? 0.8 : 1;
		const openSnd = kind === 'revolver' ? 'cylinder_open' : kind === 'break' ? 'break_open' : f.action === 'bolt' ? 'bolt' : null;
		const port = f.action === 'pump' ? 'bottom' : 'top';
		const insert = () => {
			const a = this._ammoFor( gun, f );
			if ( ! a || ops.internalRoom( gun ) <= 0 ) return this._closeLoop( gun, def, kind );
			const p = { loop: true, port };
			this._startAct( kind === 'shells' ? 'shells_insert' : kind + '_insert', f.perRound * speed, p, [
				[ 0.5, () => {
					const a2 = this._ammoFor( gun, f );
					if ( a2 && ops.loadInternal( gun, a2, 1 ) ) { this._spend( a2 ); this._sfx( 'shell_in', 0.7, 0.95 + rnd() * 0.1 ); if ( kind === 'revolver' ) this.vm.cylAngle = ( this.vm.cylAngle || 0 ) + PI / 3; }
					inv.changed();
				} ],
			], () => { if ( p.stop || ! this.inv.findUid( gun.uid ) ) this._closeLoop( gun, def, kind ); else insert(); } );
		};
		this._startAct( kind === 'shells' ? 'shells_open' : kind + '_open', openT * speed, { port }, [
			[ 0.2, () => openSnd && this._sfx( openSnd, 0.6 ) ],
			[ 0.45, () => { if ( gun.data.spent ) { gun.data.spent = false; this._ejectCasing( f ); } } ],
			[ 0.55, () => {
				// revolvers dump their empties, break actions pop the spent shells
				const spent = kind === 'revolver' || kind === 'break' ? f.capacity - gun.data.rounds : 0;
				for ( let i = 0; i < Math.min( 6, spent ); i ++ ) setTimeout( () => this.vm.eject( f.caliber, f.caliber === '12ga' ), i * 30 );
			} ],
		], insert );
		return true;
	}

	_closeLoop( gun, def, kind ) {
		const f = def.firearm;
		this._ammoPref = null;
		const needRack = ! gun.data.chamber && ! ops.roundsOnly( f ) && ops.canChamber( gun );
		const snd = kind === 'revolver' ? 'cylinder_close' : kind === 'break' ? 'break_close' : f.action === 'pump' ? 'pump' : f.action === 'bolt' || f.action === 'lever' || f.action === 'semi' ? 'bolt' : null;
		this._startAct( kind === 'shells' ? 'shells_close' : kind + '_close', ( needRack ? 0.6 : 0.4 ) * ( this.creative ? 0.8 : 1 ), { rack: needRack }, [
			[ needRack ? 0.55 : 0.25, () => { if ( snd ) this._sfx( snd, 0.7 ); if ( needRack ) ops.chamberRound( gun ); this.vm.s.empty = ! ops.readyToFire( gun ); this.inv.changed(); } ],
		] );
	}

	_nock( gun, def, ammo ) {
		const f = def.firearm;
		const xbow = f.action === 'crossbow';
		this._startAct( xbow ? 'xbow_cock' : 'bow_nock', f.reload * ( this.creative ? 0.8 : 1 ), {}, [
			[ 0.3, () => this._sfx( xbow ? 'charge' : 'pickup', 0.5, xbow ? 0.6 : 1.2 ) ],
			[ xbow ? 0.65 : 0.5, () => {
				const a = this._ammoFor( gun, f );
				if ( a && ops.loadInternal( gun, a, 1 ) ) this._spend( a );
				this._ammoPref = null;
				this.vm.s.empty = ! ( gun.data.rounds > 0 );
				this.inv.changed();
			} ],
		] );
		return true;
	}

	// an ammo stack went down: remove it when empty (wherever it is), else let an open container show the new count
	_spend( ammo ) {
		if ( ammo.qty <= 0 ) this._take( ammo );
		else { const c = this._containerOf( ammo ); if ( c ) this._containerChanged( c ); }
	}

	// the open world container (locker, trunk, body) holding a stack, if any
	_containerOf( stack ) {
		const o = this.game.app?.ui?.inventory?.other;
		return o?.items && holds( o.items, stack ) ? o : null;
	}
	_containerChanged( c ) {
		c.dirty = true;
		this.game.events.emit( 'container:changed', { container: c } );
	}

	// take a stack from wherever the inventory UI found it: the player's inventory, the open world container or the
	// ground. false when it is nowhere (it must not be duplicated onto a gun then)
	_take( stack ) {
		const g = this.game;
		if ( this.inv.remove( stack ) ) return true;
		const c = this._containerOf( stack );
		if ( c && pull( c.items, stack ) ) { this._containerChanged( c ); return true; }
		const w = g.items3d?.byStack?.( stack ) || g.items3d?.near?.( g.player.pos, 6 )?.find( x => x.stack === stack );
		if ( w ) { g.items3d.remove( w, { taken: true } ); return true; }
		return false;
	}

	// loose rounds for an internal feed: the stack dropped on the gun in the inventory UI first (wherever it lies),
	// else the inventory's
	_ammoFor( gun, f ) {
		const P = this._ammoPref;
		if ( P && P.gun === gun && P.stack.qty > 0 && getItem( P.stack.id )?.ammo?.caliber === f.caliber && ( this._owned( P.stack ) || this._containerOf( P.stack ) || this.game.items3d?.byStack?.( P.stack ) ) ) return P.stack;
		return ops.findAmmo( this.inv, f.caliber, P?.gun === gun ? P.stack.id : gun.data.ammo );
	}

	_inspect() {
		if ( this.act ) return;
		this._startAct( 'inspect', 2.2, {}, [ [ 0.3, () => this._sfx( 'switch_mode', 0.25, 0.7 ) ] ] );
	}

	// ---- bows ----------------------------------------------------------------------------------------------------------------

	_draw( dt, gun ) {
		if ( ! ( gun.data.rounds > 0 ) ) {
			if ( ! this.act ) { const f = this.f; const a = ops.findAmmo( this.inv, f.caliber ); if ( a ) this._nock( gun, this.def, a ); else if ( ! this._noArrowT || performance.now() - this._noArrowT > 2000 ) { this._noArrowT = performance.now(); this.game.toast( 'No arrows', 'warn' ); } }
			return;
		}
		if ( ! this.drawing ) { this.drawing = true; this.drawHeldT = 0; this._sfx( 'bow_draw', 0.5 ); }
		this.drawT = Math.min( 1, this.drawT + dt / 0.55 );
		this.drawHeldT += dt;
		// holding a full draw is tiring
		if ( this.drawHeldT > 3 ) this.game.survival?.useStamina( dt * 6 );
		this.adsWant = true;
	}

	_loose( gun, def ) {
		const g = this.game, f = def.firearm;
		const k = this.drawT;
		this.drawing = false;
		this.drawT = 0;
		if ( ! this.game.settings.get( 'toggleAim' ) && ! g.input.is( 'aim' ) ) this.adsWant = false;
		if ( k < 0.3 || ! ( gun.data.rounds > 0 ) ) return;
		const ammoId = ops.consumeRound( gun );
		const dir = this._aimDir( _v );
		this._zero( dir, f );
		const tired = Math.max( 0, this.drawHeldT - 4 ) * 0.004;
		g.ballistics.fire( g.camera.position.clone(), dir, { weapon: def, ammo: ammoId, source: g.player, spread: this.crosshairSpread( true ) + tired, velocity: f.velocity * ( 0.55 + 0.45 * k ), damage: f.damage * ( 0.35 + 0.65 * k ), visual: this._muzzleWorld( _v3 ) } );
		this._sfx( 'bow_release', 0.8 );
		g.events.emit( 'noise', { pos: g.player.pos.clone(), radius: f.noise, source: g.player, kind: 'bow' } );
		this.vm.kick( 0.3, this.adsT, { flash: false } );
		if ( ! this.creative ) gun.cond = Math.max( 0, gun.cond - 0.001 );
		this.vm.s.empty = true;
		this.inv.changed();
		// the next arrow
		const a = ops.findAmmo( this.inv, f.caliber );
		if ( a ) setTimeout( () => { if ( this.held === gun && ! this.act ) this._nock( gun, def, a ); }, 250 );
	}

	// ---- melee ----------------------------------------------------------------------------------------------------------------

	_swing( stack, def, heavy ) {
		const g = this.game, m = def.melee;
		if ( this.act || this.equip < 0.85 || g.player.swimming || g.actions.busy ) return;
		if ( stack.cond <= 0 ) { g.toast( `${def.name} broken`, 'bad' ); return; }
		const S = g.survival;
		const cost = m.stamina * ( heavy ? 1.8 : 1 );
		const weak = ! this.creative && S && S.stamina < cost;
		S?.useStamina( cost );
		const dur = ( 1 / m.speed ) * ( heavy ? 1.45 : 1 ) * ( weak ? 1.35 : 1 );
		this.meleeVariant ++;
		const stab = m.kind === 'spear' || ( m.kind === 'blade' && ! m.twoHanded && def.size <= 1 && this.meleeVariant % 3 === 2 );
		this._startAct( 'melee', dur, { heavy, variant: this.meleeVariant, stab }, [
			[ 0.3, () => this._sfx( heavy || m.twoHanded ? 'swing_heavy' : 'swing', 0.6, 0.9 + rnd() * 0.2 ) ],
			[ 0.44, () => this._meleeHit( stack, def, { damage: m.damage * ( heavy ? 1.6 : 1 ) * ( weak ? 0.55 : 1 ), reach: m.reach, cone: m.twoHanded ? 0.75 : 0.55, kind: m.kind, heavy, wear: m.wear * ( heavy ? 1.5 : 1 ), door: m.kind === 'axe' ? 1.6 : m.kind === 'blunt' ? 1 : 0.35 } ) ],
		] );
	}

	_quickMelee( held, def, kind ) {
		const g = this.game;
		if ( this.act || g.player.swimming || g.actions.busy ) return;
		if ( kind === 'melee' ) return this._swing( held, def, false );
		if ( kind === 'gun' ) {
			const f = def.firearm, long = f.cls !== 'pistol';
			g.survival?.useStamina( 8 );
			this._startAct( 'bash', 0.62, {}, [
				[ 0.22, () => this._sfx( 'swing', 0.5, 0.8 ) ],
				[ 0.4, () => this._meleeHit( held, def, { damage: long ? 22 : 14, reach: long ? 1.7 : 1.3, cone: 0.6, kind: 'blunt', stagger: 1, wear: 0.001, door: 0.4 } ) ],
			] );
			return;
		}
		// empty hands, or holding a tool / item: a shove
		g.survival?.useStamina( 6 );
		this._startAct( 'shove', 0.55, {}, [
			[ 0.2, () => this._sfx( 'shove', 0.6 ) ],
			[ 0.3, () => this._meleeHit( null, null, { damage: 3, reach: 1.4, cone: 0.9, kind: 'fist', stagger: 1.4, shove: true } ) ],
		] );
	}

	_punch() {
		const g = this.game;
		if ( g.player.swimming || g.actions.busy ) return;
		g.survival?.useStamina( 5 );
		this._startAct( 'punch', 0.5, {}, [
			[ 0.15, () => this._sfx( 'swing', 0.35, 1.3 ) ],
			[ 0.25, () => this._meleeHit( null, null, { damage: 9, reach: 1.2, cone: 0.5, kind: 'fist', stagger: 0.4, wear: 0 } ) ],
		] );
	}

	// resolve a melee hit: the thing under the crosshair within reach, else the nearest body in a cone
	_meleeHit( stack, def, o ) {
		const g = this.game, P = g.player, cam = g.camera;
		const eye = cam.position;
		const dir = P.lookDir( _v );
		let target = null, zone = 'torso', t = 0;
		const ray = g.entities.raycast( eye, dir, o.reach + 0.35, null );
		if ( ray && ray.entity.alive && ray.entity.type !== 'item' ) { target = ray.entity; zone = ray.zone || 'torso'; t = ray.t; }
		if ( ! target ) {
			let best = 1e9;
			for ( const e of g.entities.near( P.pos, o.reach + 0.8, null, [] ) ) {
				if ( ! e.alive || e.type === 'item' || e.type === 'projectile' || e.noHit ) continue;
				_v2.set( e.pos.x - eye.x, e.pos.y + ( e.height || 1.6 ) * 0.6 - eye.y, e.pos.z - eye.z );
				const d = _v2.length() - ( e.radius || 0.35 );
				if ( d > o.reach ) continue;
				const ang = Math.acos( clamp( _v2.normalize().dot( dir ), - 1, 1 ) );
				if ( ang > o.cone ) continue;
				if ( ! g.physics.lineOfSight( eye, _v3.set( e.pos.x, e.pos.y + ( e.height || 1.6 ) * 0.6, e.pos.z ) ) ) continue;
				const score = d + ang * 1.5;
				if ( score < best ) { best = score; target = e; t = Math.max( 0.3, d ); }
			}
		}
		// the world in the way?
		const wall = g.physics.raycast( eye, dir, o.reach, { water: false } );
		if ( target && wall && wall.t < t - 0.1 ) target = null;
		if ( target ) {
			const mult = zone === 'head' ? 2 : zone === 'leg' || zone === 'arm' ? 0.7 : 1;
			const condK = stack ? 0.6 + 0.4 * stack.cond : 1;
			const point = _v3.copy( eye ).addScaledVector( dir, Math.max( 0.3, t ) );
			const living = LIVING.has( target.type );
			hitEntity( g, target, o.damage * mult * condK, { source: P, zone, dir: dir.clone(), kind: 'melee', weapon: def?.id || 'fists', point: point.clone() } );
			if ( o.stagger || o.heavy ) target.stagger?.( dir.clone(), ( o.stagger || 0.8 ) * ( o.heavy ? 1.3 : 1 ) );
			if ( o.shove && ! target.stagger && target.vel ) target.vel.addScaledVector( _v2.set( dir.x, 0, dir.z ).normalize(), 3 );
			if ( living ) {
				if ( o.kind !== 'fist' ) g.fx?.blood( point, dir, o.kind === 'blade' || o.kind === 'axe' || o.kind === 'spear' ? 1.2 : 0.6 );
				this._sfx( o.kind === 'blade' || o.kind === 'axe' || o.kind === 'spear' ? 'hit_blade' : o.kind === 'fist' ? 'punch' : 'hit_flesh', 0.8, 0.9 + rnd() * 0.2 );
			} else g.fx?.impact( point, _v2.copy( dir ).negate(), target.type === 'vehicle' ? 'metal' : 'wood', { kind: 'melee', decal: false } );
			P.shake = Math.max( P.shake, o.heavy ? 0.2 : 0.1 );
			g.events.emit( 'noise', { pos: point.clone(), radius: 10, source: P, kind: 'melee' } );
			this._wear( stack, def, o.wear );
			return true;
		}
		if ( wall ) {
			g.fx?.impact( wall.point, wall.normal, wall.mat === 'dirt' ? 'dirt' : wall.mat, { kind: 'melee', sound: true, decal: o.kind !== 'fist' && ! movingBox( wall ) } );
			// doors give way to axes and hammers
			const door = g.city?.doorAt?.( wall.point, 1.4 );
			if ( door?.bash && o.door ) door.bash( o.damage * o.door, P );
			g.events.emit( 'noise', { pos: wall.point.clone(), radius: 14, source: P, kind: 'melee' } );
			P.shake = Math.max( P.shake, 0.12 );
			this._wear( stack, def, ( o.wear || 0 ) * 0.6 );
			return true;
		}
		return false;
	}

	_wear( stack, def, w ) {
		if ( ! stack || ! w || this.creative ) return;
		const before = stack.cond;
		stack.cond = Math.max( 0, stack.cond - w );
		if ( before > 0 && stack.cond <= 0 ) { this.game.toast( `${def.name} broke`, 'bad' ); this._sfx( 'hit_metal', 0.5, 0.6 ); }
		this.inv.changed();
	}

	// ---- throwing -----------------------------------------------------------------------------------------------------------

	// under: underhand lob; byKey: the throw key (quick throw) rather than the fire button
	_startThrow( under, byKey ) {
		const g = this.game, inv = this.inv;
		if ( this.throwing || g.player.swimming || g.actions.busy ) return;
		let st = this.held, def = this.def;
		if ( def?.cat !== 'throwable' ) {
			// quick throw: the first grenade we carry, then back to what we held
			st = inv.find( ( s, d ) => d?.cat === 'throwable' );
			if ( ! st ) { g.toast( 'Nothing to throw', 'warn' ); return; }
			this.quickReturn = inv.hands;
			this.select( st );
			def = getItem( st.id );
		}
		if ( this.act ) this._cancelAct();
		const t = def.throwable;
		this.throwing = { stack: st, def, cook: 0, under, byKey, pin: false, lit: false, released: false };
		if ( t.kind === 'molotov' ) {
			const lit = this.creative || inv.hasTool( 'lighter' ) || inv.hasTool( 'matches' );
			this.throwing.lit = !! lit;
			if ( lit ) this._sfx( 'fire_whoosh', 0.3, 1.6 );
			else g.toast( 'No lighter', 'warn' );
		}
		this._startAct( 'throw', 1, { hold: true, under }, [] );
	}

	_cook( dt ) {
		const T = this.throwing;
		if ( ! T || T.released ) return;
		// wait until the grenade is actually in hand
		if ( this.held !== T.stack || this.shown !== T.stack || this.equip < 0.8 ) return;
		const t = T.def.throwable;
		if ( ! T.pin && ( t.kind === 'frag' || t.kind === 'smoke' || t.kind === 'flashbang' ) ) { T.pin = true; this._sfx( 'pin_pull', 0.6 ); }
		// frags cook in the hand: hold too long and it goes off
		if ( t.kind === 'frag' ) {
			T.cook += dt;
			if ( T.cook >= t.fuse - 0.02 ) { this._launch( T, true ); return; }
		}
		// holding the button: keep the wind-up posed
		if ( this.act?.type === 'throw' && this.act.p.hold ) this.act.t = Math.min( this.act.t, 0.6 );
	}

	_releaseThrow() {
		const T = this.throwing;
		if ( ! T || T.released ) return;
		T.released = true;
		const go = () => {
			if ( this.throwing !== T ) return;
			this._startAct( 'throw', 0.45, { hold: false, under: T.under }, [
				[ 0.25, () => this._launch( T, false ) ],
			], () => this._afterThrow( T ) );
		};
		// released before the grenade came up: throw as soon as it's in hand
		if ( this.held === T.stack && this.shown === T.stack && this.equip > 0.8 ) go();
		else T.waitGo = go;
	}

	_launch( T, inHand ) {
		const g = this.game, P = g.player, cam = g.camera;
		if ( T.launched ) return;
		T.launched = true;
		const def = T.def, t = def.throwable;
		const dir = this._aimDir( _v ).clone();
		const up = T.under ? 0.28 : 0.14;
		dir.y += up; dir.normalize();
		const speed = inHand ? 0 : T.under ? 7.5 : 16.5;
		const right = _v2.set( 1, 0, 0 ).applyQuaternion( cam.quaternion );
		const origin = cam.position.clone().addScaledVector( right, inHand ? 0.1 : 0.2 ).addScaledVector( dir, inHand ? 0.2 : 0.35 );
		origin.y -= inHand ? 0.4 : 0.05;
		const vel = dir.clone().multiplyScalar( speed ).add( _v3.copy( P.vel ).multiplyScalar( 0.8 ) );
		// an unlit molotov just breaks and spills
		g.throwables.launch( def, { origin, vel, cooked: T.cook, source: P, unlit: t.kind === 'molotov' && ! T.lit } );
		if ( ! inHand ) { this._sfx( 'swing', 0.5, 1.2 ); if ( T.pin && t.kind !== 'molotov' ) setTimeout( () => this._sfx( 'spoon', 0.4 ), 120 ); }
		// one fewer in the stack
		const st = T.stack;
		st.qty --;
		if ( st.qty <= 0 ) this.inv.remove( st );
		this.inv.changed();
		if ( inHand ) this._afterThrow( T );
	}

	_afterThrow( T ) {
		if ( this.throwing !== T ) return;
		this.throwing = null;
		const inv = this.inv;
		// another of the same? keep it in hand; a quick throw goes back to the weapon
		const back = this.quickReturn && inv.findUid( this.quickReturn );
		this.quickReturn = null;
		if ( back ) { this.select( back ); return; }
		if ( ! inv.findUid( T.stack.uid ) ) {
			const next = inv.find( s => s.id === T.stack.id );
			if ( next ) this.select( next ); else if ( inv.hands === T.stack.uid ) { inv.hands = null; inv.changed(); }
		}
	}

	_endThrow( launchIfCooked ) {
		const T = this.throwing;
		if ( ! T ) return;
		// a cooking frag doesn't just disappear when you switch away: drop it at your feet (only while it is still
		// ours: after a death and a respawn it belongs to the body)
		if ( launchIfCooked !== false && T.pin && T.def.throwable.kind === 'frag' && ! T.launched && this._owned( T.stack ) ) this._launch( T, true );
		this.throwing = null;
	}

	// ---- state, aiming, lights ------------------------------------------------------------------------------------------

	_states( dt, held, def, kind ) {
		const g = this.game, p = g.player;
		if ( this.throwing?.waitGo && this.held === this.throwing.stack && this.shown === this.throwing.stack && this.equip > 0.8 ) { const go = this.throwing.waitGo; this.throwing.waitGo = null; go(); }
		if ( this._cycleAfter != null ) {
			this._cycleAfter -= dt;
			if ( this._cycleAfter <= 0 ) {
				this._cycleAfter = null;
				const gun = this._cycleGun;
				this._cycleGun = null;
				if ( gun ) gun.data.spent = true;
				// the empty stays in the chamber until the action is worked (or the next reload opens it)
				if ( gun && gun === held && def?.firearm && ! this.act && ops.canChamber( held ) ) this._cycle1( held, def );
			}
		}
		// sprinting lowers the weapon and stops a reload that hasn't committed yet
		const sprint = p.sprinting && ! p.swimming;
		this.sprintT = clamp( this.sprintT + ( sprint ? dt / 0.22 : - dt / 0.18 ), 0, 1 );
		const busy = g.actions.busy || p.swimming;
		this.lowerT = clamp( this.lowerT + ( busy ? dt / 0.25 : - dt / 0.25 ), 0, 1 );
		if ( sprint && this.act && ( this.act.p?.loop || this.act.type === 'inspect' ) ) { this.act.p.stop = true; if ( this.act.type === 'inspect' ) this._cancelAct(); }
		// aim
		const aimOK = kind === 'gun' ? this._canAim() : kind === 'tool' && def.tool?.kind === 'binoculars';
		const want = this.adsWant && aimOK && this.sprintT < 0.5;
		const speed = kind === 'gun' ? 0.14 + ( 1 - ( def.firearm.handling ?? 0.6 ) ) * 0.34 : 0.2;
		this.adsT = clamp( this.adsT + ( want ? dt / speed : - dt / ( speed * 0.8 ) ), 0, 1 );
		// a bolt gun: the eye leaves the scope while the bolt is worked
		if ( this.act?.type === 'cycle' && this.vm.item?.optic?.overlay ) this.adsT = Math.min( this.adsT, 0.75 );
		// hold breath
		const B = this.breath;
		if ( B.holding && B.tired <= 0 ) { B.t += dt; g.survival?.useStamina( dt * 4 ); if ( B.t > 5.5 ) { B.tired = 3; B.t = 0; } }
		else { B.t = Math.max( 0, B.t - dt * 2 ); B.tired = Math.max( 0, B.tired - dt ); }
		// muzzle against a wall: tuck the gun
		if ( kind === 'gun' && this.frame % 2 === 0 ) {
			const len = clamp( ( this.vm.item?.info?.len || 0.8 ) * 0.62, 0.3, 1.1 );
			const hit = g.physics.raycastBoxes( g.camera.position, p.lookDir( _v ), len );
			this.blockTarget = hit ? clamp( ( len - hit.t ) / len * 1.6, 0, 1 ) : 0;
		}
		this.blockT += ( ( kind === 'gun' ? this.blockTarget || 0 : 0 ) - this.blockT ) * Math.min( 1, dt * 8 );
	}

	_opticDef() {
		const st = this.held;
		const a = st?.data?.att?.optic;
		return a ? getItem( a.id ) : null;
	}

	// world zoom while aimed: irons / red dots barely, magnified optics by their power
	_aim( dt, def, kind ) {
		const g = this.game, p = g.player;
		let zoom = 1;
		const od = kind === 'gun' ? this._opticDef() : null;
		if ( od ) { const a = od.attachment; zoom = a.zooms?.length ? a.zooms[ Math.min( this.zoomIdx, a.zooms.length - 1 ) ] : a.zoom || 1; }
		else if ( kind === 'gun' && this.vm.item?.info?.integratedOptic ) zoom = 1.5;
		let target = 1;
		const ads = this.adsT;
		if ( kind === 'gun' ) {
			const ovl = this.vm.item?.optic?.overlay || ( ! this.vm.item?.optic && this.vm.item?.info?.integratedOptic );
			const k = ovl ? clamp( ( ads - 0.75 ) / 0.25, 0, 1 ) : ads;
			const base = g.settings.get( 'fov' ) * PI / 180;
			const zf = zoom > 1.01 ? 2 * Math.atan( Math.tan( base / 2 ) / zoom ) / base : 1;
			target = 1 + ( Math.min( 0.88, zf ) - 1 ) * k;
			if ( zoom <= 1.01 ) target = 1 - 0.12 * ads * ( def.firearm.cls === 'pistol' ? 0.6 : 1 );
		}
		// binoculars
		const binoc = kind === 'tool' && def.tool?.kind === 'binoculars';
		this.binoc = clamp( this.binoc + ( binoc && this.adsWant ? dt / 0.25 : - dt / 0.2 ), 0, 1 );
		if ( binoc && this.binoc > 0 ) {
			const base = g.settings.get( 'fov' ) * PI / 180;
			target = 1 + ( 2 * Math.atan( Math.tan( base / 2 ) / ( def.tool.zoom || 7 ) ) / base - 1 ) * this.binoc;
		}
		// the eye's own squint-zoom
		this.eyeZoom = clamp( this.eyeZoom + ( this.eyeZoomWant ? dt / 0.2 : - dt / 0.15 ), 0, 1 );
		target *= 1 - 0.22 * this.eyeZoom;
		p.aimFov += ( target - p.aimFov ) * Math.min( 1, dt * 18 );
	}

	adsSensitivity() {
		// keep the picture moving at the same screen speed however far we're zoomed in
		return clamp( this.game.player.aimFov, 0.05, 1 ) * 0.92;
	}

	// the view model's own field of view (a multiplier on the core's view camera, min( 70, fov * 0.72 )): the arms and
	// the weapon are framed for a VIEW_FOV degree (vertical) view camera whatever the world's field of view is set
	// to, so a wide or narrow world FOV never shrinks the hands to nothing or pushes the weapon into the camera
	viewFov() {
		const base = Math.min( 70, ( this.game.settings?.get?.( 'fov' ) ?? 62 ) * 0.72 );
		return VIEW_FOV / base * ( 1 - 0.05 * this.adsT );
	}

	crosshairSpread( forShot = false ) {
		const g = this.game, p = g.player, def = this.def;
		const f = def?.firearm;
		if ( ! f ) return 0.012;
		const ads = this.adsT;
		const stanceK = p.stance === 'prone' ? 0.55 : p.stance === 'crouch' ? 0.78 : 1;
		const move = Math.min( 1.3, ( p.speedNow || 0 ) / 4.3 ) * ( 0.02 + f.hip * 0.35 ) * ( 1 - 0.65 * ads );
		const air = p.onGround || p.flying ? 0 : 0.06;
		const stam = g.survival ? Math.max( 0, 1 - g.survival.stamina / 60 ) * 0.012 * ( 1 - ads * 0.5 ) : 0;
		const hip = f.hip * ( 1 - ads );
		// worn barrels shoot wider
		const cond = this.held ? ( 1 - this.held.cond ) * f.spread * 1.5 : 0;
		let s = f.spread + cond + ( hip + move ) * stanceK + air + stam + this.bloom;
		if ( f.pellets > 1 && ! forShot ) s += ( f.pelletSpread || 0.04 ) * 0.5;
		return s;
	}

	ammoInfo() {
		const st = this.held, def = this.def;
		if ( ! st || ! def?.firearm ) return null;
		return { reserve: ops.reserveFor( this.inv, st ), mode: st.data.jam ? 'jammed' : ops.modeName( st ) };
	}

	// L: the held flashlight, else a weapon light, else a headlamp
	_toggleLight( held, def ) {
		const inv = this.inv;
		let target = null;
		if ( def?.tool?.light || def?.tool?.kind === 'flashlight' || def?.tool?.kind === 'headlamp' ) target = held;
		else if ( def?.firearm && held.data.att?.light ) target = held.data.att.light;
		else target = this._headlamp();
		if ( ! target ) { this.game.toast( 'No light', 'warn' ); return; }
		const td = getItem( target.id );
		if ( td?.tool?.battery && ! ( target.data.charge > 0 ) ) { this.game.toast( 'Batteries dead', 'warn' ); this._sfx( 'flashlight', 0.4 ); return; }
		target.data.on = ! target.data.on;
		this._sfx( 'flashlight', 0.5 );
		inv.changed();
	}

	_headlamp() {
		const inv = this.inv;
		for ( const s of Object.values( inv.equip ) ) if ( s && getItem( s.id )?.tool?.kind === 'headlamp' ) return s;
		return inv.find( ( s, d ) => d?.tool?.kind === 'headlamp' );
	}

	_flashlight( dt, off ) {
		const g = this.game, held = this.held, def = this.def;
		let src = null, from = 'hand';
		if ( ! off ) {
			if ( held && def?.tool && held.data.on && ( def.tool.light || def.tool.kind === 'flashlight' ) ) src = held;
			else if ( held && def?.firearm && held.data.att?.light?.data?.on ) { src = held.data.att.light; from = 'gun'; }
			if ( ! src ) { const h = this._headlamp(); if ( h?.data?.on ) { src = h; from = 'head'; } }
		}
		const S = this.spot;
		if ( ! src ) { S.intensity = 0; this.lamp.intensity = 0; return; }
		const sd = getItem( src.id );
		const L = sd.tool?.light || sd.attachment?.light || { range: 40, angle: 0.4, color: 0xfff4e0 };
		// batteries drain in game hours
		if ( sd.tool?.battery && ! this.creative ) {
			src.data.charge = Math.max( 0, ( src.data.charge ?? sd.tool.battery ) - dt / ( g.time.dayMinutes * 60 ) * 24 );
			if ( src.data.charge <= 0 ) { src.data.on = false; g.toast( `${sd.name} dead`, 'warn' ); this.inv.changed(); }
		}
		const cam = g.camera;
		const low = src.data.charge != null && sd.tool?.battery ? clamp( src.data.charge / ( sd.tool.battery * 0.15 ), 0.25, 1 ) : 1;
		const flick = low < 1 && rnd() < 0.05 ? 0.4 : 1;
		S.intensity = 60 * low * flick * ( from === 'head' ? 0.8 : 1 );
		S.distance = ( L.range || 40 ) * 1.2;
		S.angle = Math.min( 1.2, L.angle || 0.4 );
		S.penumbra = 0.55;
		S.color.set( L.color ?? 0xfff4e0 );
		const off3 = from === 'head' ? _v.set( 0, 0.08, - 0.05 ) : _v.set( 0.18, - 0.16, - 0.2 );
		S.position.copy( off3 ).applyQuaternion( cam.quaternion ).add( cam.position );
		const d = this._aimDir( _v2 );
		S.target.position.copy( cam.position ).addScaledVector( d, 12 );
		S.target.updateMatrixWorld();
		this.lamp.intensity = 0.25 * low;
		this.lamp.position.set( 0.15, - 0.05, - 0.3 );
	}

	// sleeves and gloves from what's worn: long sleeves for jackets, hoodies and warm shirts, the top's own print
	_dressArms() {
		const eq = this.inv.equip;
		const top = eq.torso ? getItem( eq.torso.id ) : null;
		const gl = eq.hands ? getItem( eq.hands.id ) : null;
		const c = top?.clothing, m = top?.model;
		const style = m?.style;
		const long = !! c && style !== 'tank' && style !== 'tee' && style !== 'polo' && ( [ 'hoodie', 'jacket', 'coat', 'suit', 'wetsuit' ].includes( style ) || ( c.insulation ?? 0 ) >= 0.15 || ( c.waterproof ?? 0 ) >= 0.3 );
		// tank tops leave the arms bare
		const sleeve = c && style !== 'tank' ? ( c.color ?? m?.color ?? 0x777777 ) : null;
		let print = null;
		if ( sleeve != null && m?.print && m.print !== 'plain' && ! String( m.print ).startsWith( 'text:' ) ) print = sleevePrint( m );
		this.vm.setArms( { skin: 0xb98467, sleeve, long, print, glove: gl ? ( gl.clothing?.color ?? gl.model?.color ?? 0x2a2a2a ) : null, gloveStyle: gl?.model?.style || null } );
	}

	_viewLight() {
		const g = this.game, sky = g.world?.sky;
		if ( ! sky ) return;
		const indoor = g.world.isIndoors?.( g.player.pos ) ? 0.55 : 1;
		const day = 1 - ( sky.night || 0 );
		if ( this.hemi ) this.hemi.intensity = 1.2 * ( 0.1 + 0.9 * day ) * indoor;
		this.vm.setLighting( ( 0.08 + 0.5 * day ) * indoor );
	}

	// everything the view model needs this frame
	_feedVM( dt, held, def, kind ) {
		const s = this.vm.s, g = this.game, p = g.player;
		s.ads = this.adsT; s.sprint = this.sprintT; s.lower = this.lowerT; s.block = this.blockT;
		s.equip = this.equip;
		s.act = this.act ? { type: this.act.type, t: Math.min( 1, this.act.t / this.act.dur ), p: this.act.p } : null;
		// keep the same object per action (the view caches per action)
		if ( this.act ) { this.act._vm ||= {}; Object.assign( this.act._vm, s.act ); s.act = this.act._vm; }
		const trigT = this.trigger && kind === 'gun' ? 1 : 0;
		s.trigger += ( trigT - s.trigger ) * Math.min( 1, dt * 25 );
		s.draw = this.drawT;
		s.bob = p.bob; s.bobAmt = p.bobAmt; s.velY = p.vel.y;
		s.lookYaw = this.lookYaw; s.lookPitch = this.lookPitch;
		s.freeYaw = p.freeLook.yaw; s.freePitch = p.freeLook.pitch;
		s.lit = ( g.world?.sky?.night || 0 ) > 0.5;
		s.binoc = this.binoc;
		// aim sway: stance, weight, stamina, holding the breath
		const stanceK = p.stance === 'prone' ? 0.35 : p.stance === 'crouch' ? 0.7 : 1;
		const w = def?.weight ?? 3;
		const stam = g.survival ? 1 + Math.max( 0, 1 - g.survival.stamina / 100 ) * 1.4 : 1;
		const moving = 1 + Math.min( 1, ( p.speedNow || 0 ) / 3 ) * 1.5;
		const cls = def?.firearm?.cls;
		s.swayK = ( cls === 'pistol' ? 1.3 : 0.85 + Math.min( 0.6, w / 12 ) ) * stanceK * stam * moving * ( this.drawHeldT > 4 ? 1.8 : 1 );
		const B = this.breath;
		s.breath += ( ( B.tired > 0 ? 1.8 : B.holding ? 0.12 : 1 ) - s.breath ) * Math.min( 1, dt * 4 );
		// the slide locks back / the bow is bare when there's nothing to fire
		if ( def?.firearm && held ) {
			const f = def.firearm;
			if ( f.action === 'bow' || f.action === 'crossbow' ) s.empty = ! ( held.data.rounds > 0 );
			else if ( ops.readyToFire( held ) ) s.empty = false;
		}
	}

	_release( held, def, kind ) {
		if ( kind === 'gun' && def.firearm.action === 'bow' && this.drawing ) this._loose( held, def );
	}

	// ---- inventory UI operations ----------------------------------------------------------------------------------------

	_owned( stack ) { return !! this.inv.findUid( stack?.uid ); }

	// move rounds from an ammo stack into a magazine (a timed action; moving is fine, a cancel keeps what went in)
	loadMagazine( mag, ammo ) {
		const g = this.game;
		const md = getItem( mag?.id )?.magazine, ad = getItem( ammo?.id )?.ammo;
		if ( ! md || ! ad ) return false;
		if ( md.caliber !== ad.caliber ) { g.toast( 'Wrong ammo', 'warn' ); return false; }
		const room = md.capacity - ( mag.data.rounds || 0 );
		const n = Math.min( room, ammo.qty );
		if ( n <= 0 ) { g.toast( room <= 0 ? 'Magazine full' : 'No rounds', 'info' ); return false; }
		const per = 0.14;
		let loaded = 0;
		const put = ( k ) => { const m = ops.loadMagazine( mag, ammo, k - loaded ); loaded += m; this._spend( ammo ); this.inv.changed(); };
		const a = g.actions.start( {
			label: 'Loading', time: Math.max( 0.4, n * per ), cancelOnMove: false, sound: null,
			onDone: () => { put( n ); this._sfx( 'mag_in', 0.35, 1.4 ); },
			onCancel: () => put( Math.floor( n * Math.min( 1, a.t / a.time ) ) ),
		} );
		// the click of each round going in
		let k = 0;
		const tick = () => { if ( g.actions.current !== a || k >= Math.min( n, 40 ) ) return; k ++; this._sfx( 'shell_in', 0.18, 1.6 + rnd() * 0.2 ); setTimeout( tick, a.time / n * 1000 ); };
		tick();
		return true;
	}

	unloadMagazine( mag ) {
		const g = this.game, md = getItem( mag?.id )?.magazine;
		if ( ! md || ! ( mag.data.rounds > 0 ) ) return false;
		const n = mag.data.rounds;
		const a = g.actions.start( {
			label: 'Unloading', time: Math.max( 0.3, n * 0.05 ), cancelOnMove: false,
			onDone: () => {
				const r = ops.unloadMagazine( mag );
				const rest = ops.giveRounds( this.inv, r.id, r.qty );
				if ( rest ) { g.dropStack( rest ); g.toast( 'Rounds dropped', 'warn' ); }
				this.inv.changed();
			},
		} );
		return !! a;
	}

	insertMagazine( gun, mag ) {
		const g = this.game, def = getItem( gun?.id );
		if ( ! def?.firearm || ! mag ) return false;
		if ( ! ops.magFits( def, mag.id ) ) { g.toast( 'Does not fit', 'warn' ); return false; }
		ops.sanitizeGun( gun );
		// in hand: the full animation does the swap
		if ( gun === this.held && this.shown === gun && ! this.act ) {
			const had = gun.data.mag;
			const best = mag;
			const p = { magOut: 0.3, magIn: 0.66, charge: 0, hadMag: !! had, newMag: best.id };
			this._startAct( 'reload_mag', def.firearm.reload * 0.9, p, [
				[ p.magOut, () => had && this._sfx( 'mag_out', 0.7 ) ],
				[ p.magIn, () => this._swapMag( gun, best ) ],
			] );
			return true;
		}
		return this._swapMag( gun, mag );
	}

	_swapMag( gun, mag ) {
		const g = this.game, inv = this.inv;
		const old = gun.data.mag;
		// from the inventory, the ground or an open container: it must leave where it was
		if ( ! this._take( mag ) ) { g.toast( 'Magazine missing', 'warn' ); return false; }
		gun.data.mag = mag;
		if ( old && inv.add( old, { autoEquip: false } ) > 0 ) g.dropStack( old );
		this._sfx( 'mag_in', 0.7 );
		inv.changed();
		return true;
	}

	removeMagazine( gun ) {
		const g = this.game, inv = this.inv;
		const m = gun?.data?.mag;
		if ( ! m ) return false;
		gun.data.mag = null;
		if ( inv.add( m, { autoEquip: false } ) > 0 ) { g.dropStack( m ); g.toast( 'Magazine dropped', 'warn' ); }
		this._sfx( 'mag_out', 0.6 );
		if ( gun === this.held ) this.vm.s.empty = ! ops.readyToFire( gun );
		inv.changed();
		return true;
	}

	unloadWeapon( gun ) {
		const g = this.game, inv = this.inv, def = getItem( gun?.id );
		if ( ! def?.firearm ) return false;
		if ( gun === this.held ) this._cancelAct();
		const out = ops.unloadGun( gun );
		if ( out.mag && inv.add( out.mag, { autoEquip: false } ) > 0 ) g.dropStack( out.mag );
		for ( const r of out.rounds ) { const rest = ops.giveRounds( inv, r.id, r.qty ); if ( rest ) g.dropStack( rest ); }
		this._sfx( out.mag ? 'mag_out' : 'bolt', 0.6 );
		if ( gun === this.held ) this.vm.s.empty = true;
		inv.changed();
		return true;
	}

	// loose rounds into an internal magazine / tube / cylinder
	loadWeapon( gun, ammo ) {
		const g = this.game, def = getItem( gun?.id ), f = def?.firearm;
		const ad = getItem( ammo?.id )?.ammo;
		if ( ! f || ! ad ) return false;
		if ( f.feed !== 'internal' ) { g.toast( 'Takes magazines', 'info' ); return false; }
		if ( f.caliber !== ad.caliber ) { g.toast( 'Wrong ammo', 'warn' ); return false; }
		ops.sanitizeGun( gun );
		if ( gun === this.held && this.shown === gun ) {
			// the reload loop takes this stack first, wherever it lies
			this._ammoPref = { gun, stack: ammo };
			if ( this.reload() ) return true;
			this._ammoPref = null;
			return false;
		}
		const n = Math.min( ops.internalRoom( gun ), ammo.qty );
		if ( n <= 0 ) { g.toast( 'Full', 'info' ); return false; }
		let loaded = 0;
		const put = ( k ) => { loaded += ops.loadInternal( gun, ammo, k - loaded ); this._spend( ammo ); this.inv.changed(); };
		const a = g.actions.start( {
			label: 'Loading', time: Math.max( 0.4, n * f.perRound ), cancelOnMove: false,
			onDone: () => { put( n ); this._sfx( 'shell_in', 0.5 ); },
			onCancel: () => put( Math.floor( n * Math.min( 1, a.t / a.time ) ) ),
		} );
		return true;
	}

	attach( gun, att ) {
		const g = this.game, inv = this.inv;
		const def = getItem( gun?.id ), ad = getItem( att?.id );
		const fit = ops.attachmentFits( def, ad );
		if ( ! fit.ok ) { g.toast( fit.reason, 'warn' ); return false; }
		ops.sanitizeGun( gun );
		const slot = fit.slot;
		if ( ! this._take( att ) ) return false;
		const old = gun.data.att[ slot ];
		gun.data.att[ slot ] = att;
		if ( old && inv.add( old, { autoEquip: false } ) > 0 ) g.dropStack( old );
		this._sfx( slot === 'muzzle' ? 'bolt' : 'mag_in', 0.45, 1.3 );
		g.toast( `${ad.name} attached`, 'good' );
		inv.changed();
		return true;
	}

	detach( gun, slot ) {
		const g = this.game, inv = this.inv;
		const a = gun?.data?.att?.[ slot ];
		if ( ! a ) return false;
		gun.data.att[ slot ] = null;
		delete gun.data.att[ slot ];
		if ( inv.add( a, { autoEquip: false } ) > 0 ) { g.dropStack( a ); g.toast( 'Attachment dropped', 'warn' ); }
		this._sfx( 'mag_out', 0.4, 1.3 );
		inv.changed();
		return true;
	}

	// ---- misc -----------------------------------------------------------------------------------------------------------

	// a sound for the player's own hands (non-positional)
	_sfx( name, vol = 1, rate = 1, detune = 0.06, at = 0 ) {
		return this.game.audio?.play( name, { vol, rate, detune, at } );
	}

	dispose() {
		if ( this._disposed ) return;
		this._disposed = true;
		for ( const o of this._offs ) o();
		this.vm.dispose();
		this.spot.parent?.remove( this.spot );
		this.spot.target.parent?.remove( this.spot.target );
		this.lamp.parent?.remove( this.lamp );
		this.envTex?.dispose();
		this.game.player.aimFov = 1;
	}
}

// for the Node test / console: what a stack is to the hands
export function heldKind( def ) { return Hands.prototype.kindOf( def ); }
export { displayName, makeStack };
