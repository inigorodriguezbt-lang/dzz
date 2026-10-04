// The mobility equipment at runtime (docs/ITEMS_PLAN.md; the items in defs/ext/mobility.js): one system per game
// (hooks.js addSystem) that owns the movement mode you are in (modes.js; Player.js hands it the body), what it puts in
// the world (the canopy overhead, the board under you, a trolley on the cable, a rope trailing to the zipline's far end),
// the prompts (open the wing when you fall, climb a rope or a ladder, push a cart, ride a zipline), the aim for a
// ladder, a rope ladder or a rope tied off at an edge, the grappling hook's throw, and the small things worn and held
// (inline skates, trekking poles, an umbrella in the rain, a variometer's beeps).
//
//   attach( g ) -> system (once per game), system( g )
//   sys.start( mode ) / sys.endMode( mode, how ), sys.mode
//   verbs: ride( stack ), paddleOut( stack ), aimAt( stack, what ), throwHook( stack ), tieZip( stack ), setDown( stack ),
//          umbrella( stack ), deploy( stack )
// Saved in save.world.mobility: the zipline being strung (the mode itself is not: a save mid-air lands you on load).
import * as THREE from 'three';
import { getItem, makeStack, displayName, cloneStack } from '../../ItemDB.js';
import { itemsOf, containerWeight, containerVolume } from '../../../Inventory.js';
import { loadRecord, getPlaceable } from '../../placeables/registry.js';
import { MOB, haulContainer, haulLoad, packRecord, truckableKind, boardStack } from './kinds.js';
import { GLIDE, CHUTE, RIDE, HAUL, ZIP, GRAPPLE, LADDERS, ROPES, boardOf, landHurt, bailHurt, lift, surfaceKind, zipShape, zipCheck, clamp, wrap, FLAG } from './logic.js';
import { GlideMode, ClimbMode, RideMode, PaddleMode, HaulMode, ZipMode, gearOf } from './modes.js';
import { ladderSpot, edgeBelow, hookSpot, anchorNear } from './ledges.js';
import { ensureMobSound } from './sounds.js';
import { raySphere } from '../../../Entities.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3(), _eye = new THREE.Vector3(), _q = new THREE.Quaternion();
const _e = new THREE.Euler( 0, 0, 0, 'YXZ' );
const UP = new THREE.Vector3( 0, 1, 0 ), AX = new THREE.Vector3( 1, 0, 0 );
const v3 = ( a ) => Array.isArray( a ) ? new THREE.Vector3( a[ 0 ], a[ 1 ], a[ 2 ] ) : new THREE.Vector3( a.x, a.y, a.z );
const arr = ( v ) => [ + v.x.toFixed( 3 ), + v.y.toFixed( 3 ), + v.z.toFixed( 3 ) ];
// the trade winds' heading when there is no shader uniform to read it from (Node)
const TRADES = { x: - 0.88, y: 0.47 };
let windDir = TRADES;
export function setWindDir( v ) { windDir = v || TRADES; }

const ATTACHED = new WeakMap();
export const system = ( g ) => ATTACHED.get( g ) || null;
MOB.sys = system;

export function attach( g ) {
	if ( ! g || typeof g.register !== 'function' ) return null;
	if ( ATTACHED.has( g ) ) return ATTACHED.get( g );
	const sys = new Mobility( g );
	ATTACHED.set( g, sys );
	g.register( sys );
	sys.hook();
	return sys;
}

// boards that float and paddle; what rides; what pushes
export const isBoard = ( d ) => !! boardOf( d );
export const isRide = ( d ) => !! d?.ride && !! RIDE[ d.id ];
export const isHauler = ( d ) => !! d && !! HAUL[ d.id ];
const BULKY = new Set( [ 'shopping_cart', 'wheelbarrow' ] );

export class Mobility {
	constructor( g ) {
		this.game = g;
		this.name = 'mobility';
		this.mode = null;
		this.aim = null;
		this.thrown = null; // a grappling hook in flight
		this.zip = null; // { id } the zipline whose far end is still to tie
		this.vis = null; // the current mode's world visual
		this.loops = {};
		this.stunT = 0; this.offT = 0; this.checkT = 0; this.skateT = 0; this.varioT = 0; this.gustT = 0;
		this._out = [];
		this._wet = null;
		this._knock = null;
		this.group = null;
	}

	hook() {
		const g = this.game, S = g.survival;
		if ( S?.addMoveMod ) S.addMoveMod( ( m ) => this.moveMod( m ) );
		// blows land on you while you ride, paddle, push or climb: they knock you off (the blow itself goes on)
		if ( S?.addHurtGuard ) S.addHurtGuard( ( amount, kind ) => { if ( this.mode && /bite|scratch|melee|animal|bullet|explosion/.test( kind ) ) this._knock = { amount, kind }; return false; } );
		g.interact?.addProvider?.( ( ray, maxDist ) => this.provide( ray, maxDist ) );
		g.events?.on?.( 'item:drop', ( e ) => this.onDrop( e?.stack ) );
		g.events?.on?.( 'playerDeath', () => { if ( this.mode ) this.endMode( this.mode, 'death' ); this.aim = null; } );
	}

	// ---- the world -------------------------------------------------------------------------------------------------------

	// the wind (m/s) from the weather, along the trade winds (or the sky's own wind direction)
	wind() {
		const g = this.game, W = ( g.weather?.wind ?? 0.45 ) * 9;
		if ( this._windOverride ) return this._windOverride;
		const l = Math.hypot( windDir.x, windDir.y ) || 1;
		return { x: windDir.x / l * W, z: windDir.y / l * W };
	}
	liftAt( pos ) {
		const g = this.game, hf = g.hf;
		const sun = g.world?.sky?.sunDir?.y ?? Math.max( 0, Math.sin( ( ( g.hour ?? 12 ) - 6 ) / 12 * Math.PI ) );
		return lift( pos.x, pos.y, pos.z, ( x, z ) => hf.heightAt( x, z ), this.wind(), { sun, time: g.playTime || 0, cover: g.weather?.cover ?? 0.5 } );
	}
	// what the wheels roll on here
	surface( x, z, box = null ) {
		const g = this.game, hf = g.hf;
		const flags = hf.flagsNear?.( x, z ) || 0;
		const lot = !! g.roads?.lotAt?.( x, z );
		const lift = g.sites?.lift?.( x, z ) || 0;
		const y = hf.heightAt( x, z );
		const beach = y < 3.5 && !! g.world?.isBeach?.( x, z );
		let rock = false;
		if ( ! box && ! ( flags & ( FLAG.ROAD | FLAG.STREET | FLAG.RUNWAY ) ) && ! lot && ! beach && hf.surfaceAt ) { const s = hf.surfaceAt( x, z ); rock = s[ 1 ] > 0.45; }
		return surfaceKind( { box, flags, lot, beach, rock, lift } );
	}
	groundY( x, z, y, step = 0.45 ) { return this.game.physics.ground( x, z, y, step, 0.3 ).y; }
	agl( pos ) {
		const P = this.game.physics;
		return pos.y - Math.max( P.ground( pos.x, pos.z, pos.y, 0, 0.3 ).y, P.waterLevel( pos.x, pos.z ) );
	}

	// ---- helpers for the modes -------------------------------------------------------------------------------------------

	useStamina( n ) { if ( n > 0 ) this.game.survival?.useStamina?.( n ); }
	useUp( stack ) { if ( stack ) { const use = this.game.itemUse; if ( use?.useUp ) use.useUp( stack, 1 ); else stack.data.uses = ( stack.data.uses ?? 20 ) - 1; } }
	sound( name, pos, vol = 0.6, opts = {} ) {
		const a = this.game.audio;
		if ( ! a?.play ) return null;
		ensureMobSound( a, name );
		return a.play( name, { pos: pos?.clone ? pos.clone() : pos ? new THREE.Vector3( pos.x, pos.y, pos.z ) : undefined, vol, ...opts } );
	}
	noise( pos, radius, kind ) { this.game.events?.emit?.( 'noise', { pos: new THREE.Vector3( pos.x, pos.y, pos.z ), radius, source: this.game.player, kind } ); }
	tired() { if ( ( this._tiredT || 0 ) < ( this.game.playTime || 0 ) ) { this._tiredT = ( this.game.playTime || 0 ) + 4; this.game.toast?.( 'Too tired', 'warn' ); } }
	loop( name, vol, rate = 1, pos = null ) {
		const a = this.game.audio;
		if ( ! a?.loop ) return;
		let h = this.loops[ name ];
		if ( ! h ) { ensureMobSound( a, name ); h = this.loops[ name ] = a.loop( name, { vol: 0, bus: 'sfx' } ); }
		h?.set?.( vol, rate, pos );
	}
	_stopLoops() { for ( const k of Object.keys( this.loops ) ) { this.loops[ k ]?.stop?.(); delete this.loops[ k ]; } }
	haulSound( m, v ) { const id = m.rec.stack?.id; if ( id === 'shopping_cart' ) this.loop( 'mob_rattle', clamp( v / 2.5, 0, 1 ) * 0.5, 0.8 + v * 0.1 ); else this.loop( 'mob_roll', clamp( v / 3, 0, 1 ) * 0.25, 0.6 + v * 0.1 ); }
	zipSound( m, v ) { this.loop( 'mob_zip', clamp( v / 10, 0, 1 ) * 0.6, 0.6 + v / 14 ); }

	// ---- starting and ending a mode --------------------------------------------------------------------------------------

	start( mode ) {
		const g = this.game, p = g.player;
		if ( this.mode ) this.endMode( this.mode, 'replaced' );
		this.aim?.cancel?.();
		if ( g.actions?.busy ) g.actions.cancel();
		this.mode = mode;
		p.mode = mode;
		p.roll = 0;
		// the held thing goes away while the hands are on the brakes, the rope or the handle
		this._held = null;
		if ( mode.busyHands && p.inventory.hands ) { this._held = p.inventory.hands; if ( g.hands?.holster ) g.hands.holster(); else p.inventory.hands = null; }
		try { mode.begin(); } catch ( e ) { console.error( e ); }
		this._visual( mode );
		return mode;
	}

	endMode( mode, how = 'done' ) {
		const g = this.game, p = g.player;
		if ( ! mode || this.mode !== mode ) return;
		mode.ended = true;
		this.mode = null;
		p.mode = null;
		p.roll = 0;
		try { mode.finish( how ); } catch ( e ) { console.error( e ); }
		this._dropVisual();
		this._stopLoops();
		switch ( mode.kind ) {
			case 'ride': this._rideEnd( mode, how ); break;
			case 'paddle': this._paddleEnd( mode, how ); break;
			case 'haul': this._haulEnd( mode, how ); break;
			default: break;
		}
		// what you held before comes back to your hands
		if ( this._held && ! p.inventory.hands && how !== 'death' ) {
			const st = p.inventory.findUid?.( this._held );
			if ( st ) { if ( g.hands?.select ) g.hands.select( st ); else p.inventory.hands = st.uid; }
		}
		this._held = null;
		p.inventory.changed?.();
	}

	// let go of a rope, a ladder, a cable: you fall from there
	letGo( mode, vel = null ) {
		const p = this.game.player;
		this.endMode( mode, 'letgo' );
		if ( vel ) p.vel.copy( vel ); else p.vel.set( 0, 0, 0 );
		p.onGround = false;
		p.fallStart = p.pos.y;
	}

	// ---- the paraglider and the reserve ----------------------------------------------------------------------------------

	// what you could open now, falling: the wing if there is height for it, else the reserve
	deployable() {
		const g = this.game, p = g.player;
		if ( this.mode || p.vehicle || p.swimming || p.onGround || p.flying || g.dead ) return null;
		if ( p.vel.y > - 2.5 ) return null;
		const agl = this.agl( p.pos );
		const inv = p.inventory;
		const wing = inv.find( ( s ) => s.id === 'paraglider' && s.cond > 0.1 && ! s.data?.spread );
		if ( wing && agl >= GLIDE.minAGL ) return { stack: wing, chute: false, agl };
		const res = inv.find( ( s ) => s.id === 'reserve_chute' && ! s.data?.used && s.cond > 0.05 );
		if ( res && agl >= CHUTE.minAGL ) return { stack: res, chute: true, agl };
		return null;
	}

	deploy( stack, chute = false ) {
		const g = this.game, p = g.player;
		if ( ! stack ) return false;
		// opening fast into a free fall shocks the wing (and you)
		const fall = - p.vel.y;
		if ( ! chute && fall > GLIDE.freeFall * 0.7 ) {
			stack.cond = Math.max( 0, stack.cond - 0.25 );
			g.survival?.hurt?.( 6, 'fall', { fall: 1, cause: 'an opening shock' } );
			g.toast?.( 'Hard opening', 'warn' );
		}
		if ( chute ) stack.data.used = true;
		this.sound( 'mob_unfold', p.pos, 0.8 );
		this.start( new GlideMode( this, stack, { chute } ) );
		return true;
	}

	// running off a slope with the wing laid out behind you
	launch( stack ) {
		const g = this.game, p = g.player, hf = g.hf;
		if ( this.mode || p.swimming || p.vehicle ) return;
		if ( stack.cond <= 0.1 ) { g.toast( 'Too torn to fly', 'warn' ); return; }
		const fx = - Math.sin( p.yaw ), fz = - Math.cos( p.yaw );
		const ahead = this.groundY( p.pos.x + fx * 14, p.pos.z + fz * 14, p.pos.y + 0.2, 0 );
		const ahead2 = Math.min( ahead, hf.heightAt( p.pos.x + fx * 30, p.pos.z + fz * 30 ) );
		if ( p.pos.y - ahead2 < 6 ) { g.toast( 'Needs a drop ahead', 'warn' ); return; }
		g.itemUse.timed( 'Laying out the wing', 4, null, () => {
			if ( ! g.itemUse.exists( stack ) ) return;
			p.vel.set( fx * 5.5, 0, fz * 5.5 );
			this.sound( 'mob_unfold', p.pos, 0.8 );
			const m = this.start( new GlideMode( this, stack, { V: 6, open: 0.4, heading: p.yaw } ) );
			m.s.vy = 0.5;
			p.pos.y += 0.3;
		}, { cancelOnMove: true } );
	}

	// on the ground: the wing is spread out behind you (pack it up from there)
	land( mode, vy, vh, gr ) {
		const g = this.game, p = g.player, S = g.survival;
		const L = landHurt( vy, vh, mode.P );
		if ( L.fall > 3.2 ) S?.fallDamage?.( L.fall );
		if ( L.hurt > 0.5 ) S?.hurt?.( L.hurt, 'fall', { fall: 1, cause: 'a hard landing' } );
		if ( L.fall > 3.2 || L.hurt > 0.5 ) g.toast?.( 'Hard landing', 'warn' );
		g.audio?.play?.( 'land', { pos: p.pos.clone(), vol: Math.min( 1, 0.3 + Math.max( 0, - vy ) / 6 ) } );
		this._spread( mode, p.pos, 4 );
		this.endMode( mode, 'landed' );
		// you run it out
		const fx = - Math.sin( mode.s.heading ), fz = - Math.cos( mode.s.heading );
		p.vel.set( fx * Math.min( vh, 3 ), 0, fz * Math.min( vh, 3 ) );
		p.onGround = true; p.fallStart = null;
	}

	// into a tree, a wall, a roof: the wing collapses and you fall the rest
	crash( mode, v ) {
		const g = this.game, p = g.player;
		g.survival?.hurt?.( Math.max( 4, ( v - 3 ) * 3.2 ), 'fall', { fall: 1, cause: 'a crash' } );
		g.toast?.( 'Crashed', 'bad' );
		g.audio?.play?.( 'land', { pos: p.pos.clone(), vol: 0.9 } );
		if ( mode.kind === 'glide' ) mode.stack.cond = Math.max( 0, mode.stack.cond - 0.12 );
		const gy = this.groundY( p.pos.x, p.pos.z, p.pos.y, 0 );
		this._spread( mode, { x: p.pos.x, y: gy, z: p.pos.z }, 0 );
		this.letGo( mode, new THREE.Vector3( 0, - 1, 0 ) );
	}

	// down in the sea: you swim, the canopy floats beside you
	splash( mode ) {
		const g = this.game, p = g.player;
		g.audio?.play?.( 'splash', { pos: p.pos.clone(), vol: 0.9 } );
		const wl = g.physics.waterLevel( p.pos.x, p.pos.z );
		this._spread( mode, { x: p.pos.x, y: wl, z: p.pos.z }, 2 );
		this.letGo( mode, new THREE.Vector3( 0, - 1.5, 0 ) );
		p.fallStart = null;
	}

	// the canopy laid out on the ground (or the water) behind where you came down
	_spread( mode, pos, back = 4 ) {
		const g = this.game, P = g.placeables, p = g.player, inv = p.inventory, st = mode.stack;
		if ( ! P || ! st ) return;
		const h = mode.s.heading, bx = Math.sin( h ) * back, bz = Math.cos( h ) * back;
		const x = pos.x + bx, z = pos.z + bz;
		const y = Math.max( this.groundY( x, z, pos.y + 0.5, 1 ), g.physics.waterLevel( x, z ) );
		if ( g.itemUse?.exists?.( st ) ) g.itemUse.discard( st );
		if ( inv.findUid?.( st.uid ) ) inv.remove( st );
		st.data.spread = true;
		P.add( 'mob_canopy', st, { x, y, z }, h, { chute: mode.kind === 'chute' }, st.id );
		inv.changed?.();
	}

	// ---- boards, skates, a scooter, a sled -------------------------------------------------------------------------------

	ride( stack ) {
		const g = this.game, p = g.player, def = getItem( stack.id ), B = RIDE[ stack.id ];
		if ( ! B ) return;
		if ( this.mode || p.swimming || p.vehicle || ! p.onGround ) { g.toast( 'Not now', 'warn' ); return; }
		const box = p.groundBox || null;
		const surf = this.surface( p.pos.x, p.pos.z, box );
		if ( B.slope ) {
			const fx = - Math.sin( p.yaw ), fz = - Math.cos( p.yaw );
			const a = this.groundY( p.pos.x + fx * 2, p.pos.z + fz * 2, p.pos.y + 0.5, 1 ), b = this.groundY( p.pos.x - fx * 2, p.pos.z - fz * 2, p.pos.y + 0.5, 1 );
			if ( ( a - b ) / 4 > - 0.08 ) { g.toast( 'Needs a slope', 'warn' ); return; }
			if ( surf === 'paved' ) { g.toast( 'Needs grass or dirt', 'warn' ); return; }
		} else if ( surf === 'grass' || surf === 'sand' ) { g.toast( 'Needs pavement', 'warn' ); return; }
		if ( stack.cond <= 0.05 ) { g.toast( 'Broken', 'warn' ); return; }
		// a board on the ground: picked up first (it rides in the inventory)
		if ( ! p.inventory.findUid?.( stack.uid ) ) {
			const w = g.itemUse?.where?.( stack );
			if ( p.inventory.add( stack, { autoEquip: false } ) > 0 ) { g.toast( 'No room', 'warn' ); return; }
			if ( w?.kind === 'ground' ) g.items3d?.remove?.( w.item, { taken: true } );
			else if ( w?.items ) { const i = w.items.indexOf( stack ); if ( i >= 0 ) w.items.splice( i, 1 ); }
		}
		// off the hands, under the feet
		if ( p.inventory.hands === stack.uid ) { if ( g.hands?.holster ) g.hands.holster(); else p.inventory.hands = null; }
		this.sound( 'mob_land', p.pos, 0.4 );
		this.start( new RideMode( this, stack, stack.id, { v: Math.hypot( p.vel.x, p.vel.z ) * ( B.slope ? 0 : 0.6 ) } ) );
		void def;
	}

	// a fall: you go down, the board flies on ahead
	bail( mode, reason, v ) {
		const g = this.game, p = g.player, gear = gearOf( g );
		const hurt = bailHurt( v, gear.pads, gear.helmet );
		if ( hurt > 0.5 ) g.survival?.hurt?.( hurt, 'fall', { fall: 1, cause: 'a fall' } );
		g.toast?.( reason, 'warn' );
		g.audio?.play?.( 'land', { pos: p.pos.clone(), vol: 0.8 } );
		p.shake = Math.max( p.shake || 0, 0.7 );
		this.stunT = 1.1;
		mode.bailed = { v, reason };
		this.endMode( mode, 'bail' );
		p.vel.set( 0, 0, 0 );
	}

	_rideEnd( mode, how ) {
		const g = this.game, p = g.player, st = mode.stack, B = mode.P;
		p.fallStart = mode.air ? p.pos.y : null;
		if ( how === 'bail' && st && ! B.auto ) {
			// the board rolls on without you
			st.cond = Math.max( 0.05, st.cond - 0.03 );
			const hx = - Math.sin( mode.heading ), hz = - Math.cos( mode.heading );
			const d = Math.min( 4, 0.8 + mode.v * 0.35 );
			const x = p.pos.x + hx * d, z = p.pos.z + hz * d;
			if ( g.items3d?.spawn && g.itemUse?.exists?.( st ) ) {
				g.itemUse.discard( st );
				g.items3d.spawn( st, new THREE.Vector3( x, this.groundY( x, z, p.pos.y + 0.5, 1 ) + 0.4, z ), { persistent: true, settle: true, yaw: mode.heading + Math.PI / 2 } );
			}
		} else if ( how !== 'death' && st && ! B.auto && ! p.inventory.hands && g.itemUse?.exists?.( st ) ) {
			// stepped off: it comes up into your hand
			if ( g.hands?.select ) g.hands.select( st ); else p.inventory.hands = st.uid;
		}
		this.offT = 0.6;
	}

	// ---- paddling ------------------------------------------------------------------------------------------------------------

	// from the inventory: onto the board in the water in front of you (or under you)
	paddleOut( stack, prone = false ) {
		const g = this.game, p = g.player;
		if ( this.mode || p.vehicle ) return;
		const spot = this.waterNear( p.pos, p.yaw );
		if ( ! spot ) { g.toast( 'Needs water', 'warn' ); return; }
		if ( p.inventory.hands === stack.uid ) { if ( g.hands?.holster ) g.hands.holster(); else p.inventory.hands = null; }
		p.pos.set( spot.x, g.physics.waterLevel( spot.x, spot.z ), spot.z );
		this.sound( 'mob_paddle', p.pos, 0.5 );
		this.start( new PaddleMode( this, stack, { prone, heading: p.yaw } ) );
	}

	// water deep enough to float a board near here: { x, z } | null
	waterNear( pos, yaw ) {
		const g = this.game, P = g.physics, hf = g.hf;
		const deep = ( x, z ) => P.waterLevel( x, z ) - hf.heightAt( x, z ) > 0.35 && ! P.near( x, z, 0.5 ).some( b => b.maxY > P.waterLevel( x, z ) );
		if ( deep( pos.x, pos.z ) ) return { x: pos.x, z: pos.z };
		for ( const r of [ 1.5, 2.5, 3.5, 5 ] ) for ( const da of [ 0, 0.5, - 0.5, 1, - 1, 1.6, - 1.6, Math.PI ] ) {
			const a = yaw + da, x = pos.x - Math.sin( a ) * r, z = pos.z - Math.cos( a ) * r;
			if ( deep( x, z ) ) return { x, z };
		}
		return null;
	}

	knockOff( mode, reason ) {
		const g = this.game, p = g.player;
		g.toast?.( reason, 'warn' );
		g.audio?.play?.( 'splash', { pos: p.pos.clone(), vol: 0.8 } );
		mode.knocked = true;
		this.endMode( mode, 'knocked' );
	}

	_paddleEnd( mode, how ) {
		const g = this.game, p = g.player, P = g.placeables, st = mode.stack, use = g.itemUse;
		if ( how === 'death' || ! st ) return;
		const wl = g.physics.waterLevel( p.pos.x, p.pos.z );
		const bed = g.hf.heightAt( p.pos.x, p.pos.z );
		const hx = - Math.sin( mode.heading ), hz = - Math.cos( mode.heading );
		// the board: left floating (or on the sand), with you in the water beside it (or stepping off onto the beach)
		if ( use?.exists?.( st ) ) use.discard( st );
		const beach = how === 'beach' || wl - bed < 0.5;
		const bx = p.pos.x + ( beach ? hx * 0.6 : - hz * 0.9 ), bz = p.pos.z + ( beach ? hz * 0.6 : hx * 0.9 );
		const by = beach ? this.groundY( bx, bz, wl + 0.3, 1 ) : g.physics.waterLevel( bx, bz );
		const rec = P?.add( 'mob_board', st, { x: bx, y: by, z: bz }, mode.heading + Math.PI / 2, { leash: mode.gear.leash && ! beach, beached: beach }, st.id );
		if ( beach ) {
			const gy = this.groundY( p.pos.x, p.pos.z, p.pos.y + 0.5, 1 );
			p.pos.y = Math.max( gy, p.pos.y - 0.2 );
		} else {
			// in the water: a short drop off the board
			p.pos.y = wl - 1.2;
			p.vel.set( 0, - 1, 0 );
		}
		p.fallStart = null;
		void rec;
	}

	boardState( p ) { return p.data.beached ? 'On the sand' : p.data.leash ? 'On the leash' : 'Afloat'; }
	// close enough, and in or at the water, to get on
	canBoard( p ) {
		const g = this.game, pl = g.player;
		if ( this.mode ) return false;
		const d = Math.hypot( p.pos.x - pl.pos.x, p.pos.z - pl.pos.z );
		if ( d > 3 ) return false;
		if ( p.data.beached ) return !! this.waterNear( p.pos, pl.yaw );
		return true;
	}
	boardVerb( p ) { return p.data.beached ? 'Paddle out' : 'Climb on'; }
	climbOn( p ) {
		const g = this.game, pl = g.player;
		const st = boardStack( p );
		const spot = p.data.beached ? this.waterNear( p.pos, pl.yaw ) : { x: p.pos.x, z: p.pos.z };
		if ( ! spot ) { g.toast( 'Needs water', 'warn' ); return; }
		g.placeables.remove( p, { give: false } );
		// on the board it is yours again: carried while you paddle, so a save keeps it (over the bags' room if need be)
		if ( pl.inventory.add( st, { autoEquip: false } ) > 0 ) pl.inventory.pockets.push( st );
		pl.inventory.changed?.();
		pl.pos.set( spot.x, g.physics.waterLevel( spot.x, spot.z ), spot.z );
		const d = getItem( st.id );
		this.sound( 'mob_paddle', pl.pos, 0.5 );
		this.start( new PaddleMode( this, st, { prone: !! boardOf( d )?.prone, heading: pl.yaw } ) );
	}
	pickBoard( p ) {
		const g = this.game;
		g.placeables.remove( p, { give: false } );
		g.placeables.give( boardStack( p ) );
		g.audio?.play?.( 'pickup', { vol: 0.45 } );
	}
	// a board afloat rides the swell and drifts downwind (a leash keeps it with you while you swim)
	floatBoard( p, dt ) {
		const g = this.game, P = g.physics;
		if ( p.data.beached ) return;
		const wl = P.waterLevel( p.pos.x, p.pos.z ), bed = g.hf.heightAt( p.pos.x, p.pos.z );
		if ( wl - bed < 0.15 ) { p.data.beached = true; p.pos.y = this.groundY( p.pos.x, p.pos.z, wl + 0.3, 1 ); g.placeables.refresh( p ); return; }
		const pl = g.player;
		if ( p.data.leash && pl.swimming && ! this.mode ) {
			const dx = p.pos.x - pl.pos.x, dz = p.pos.z - pl.pos.z, d = Math.hypot( dx, dz );
			if ( d > 2.6 ) { p.pos.x = pl.pos.x + dx / d * 2.6; p.pos.z = pl.pos.z + dz / d * 2.6; }
		} else if ( p.data.leash && ! pl.swimming && Math.hypot( p.pos.x - pl.pos.x, p.pos.z - pl.pos.z ) > 4 ) p.data.leash = false;
		const w = this.wind();
		p.pos.x += w.x * 0.03 * dt; p.pos.z += w.z * 0.03 * dt;
		p.pos.y = wl;
		p.yaw += Math.sin( ( g.playTime || 0 ) * 0.3 + p.pos.x ) * 0.02 * dt;
		const o = p._obj;
		if ( o ) {
			o.position.set( p.pos.x, p.pos.y - 0.03, p.pos.z );
			o.rotation.set( Math.sin( ( g.playTime || 0 ) * 1.3 ) * 0.04, p.yaw, Math.sin( ( g.playTime || 0 ) * 0.9 + 1 ) * 0.03 );
		}
	}

	// a board dropped into the sea floats instead of sinking
	onDrop( stack ) {
		const g = this.game, d = getItem( stack?.id );
		if ( ! isBoard( d ) || ! g.placeables ) return;
		const it = g.items3d?.byStack?.( stack );
		if ( ! it ) return;
		const P = g.physics, wl = P.waterLevel( it.pos.x, it.pos.z );
		if ( wl - g.hf.heightAt( it.pos.x, it.pos.z ) < 0.3 ) return;
		g.items3d.remove( it );
		g.placeables.add( 'mob_board', stack, { x: it.pos.x, y: wl, z: it.pos.z }, g.player.yaw + Math.PI / 2, { leash: false }, stack.id );
	}

	// ---- carts --------------------------------------------------------------------------------------------------------------

	loadOf( rec ) { return haulLoad( rec ); }

	// a cart from the world (a loot item) or one standing where you left it: in front of you, and away
	haul( rec ) {
		const g = this.game, p = g.player;
		if ( this.mode ) return;
		if ( g.player.swimming || g.player.vehicle ) return;
		if ( rec.data.tipped ) { this.upright( rec ); return; }
		rec._held = true;
		if ( rec._box ) { g.physics.remove( rec._box ); rec._box = null; }
		this.sound( 'mob_bump', rec.pos, 0.4 );
		this.start( new HaulMode( this, rec ) );
		void p;
	}
	haulItem( item ) {
		const g = this.game, P = g.placeables;
		if ( ! P || this.mode ) return;
		const st = item.stack;
		g.items3d.remove( item, { taken: true } );
		const rec = P.add( 'mob_hauler', st, { x: item.pos.x, y: item.pos.y, z: item.pos.z }, item.yaw ?? 0, {}, st.id );
		this.haul( rec );
	}
	moveRecord( rec, pos, heading, pitch = 0, pull = false ) {
		rec.pos.x = pos.x; rec.pos.y = pos.y; rec.pos.z = pos.z;
		rec.yaw = heading + Math.PI / 2;
		const o = rec._obj;
		if ( o ) {
			o.position.set( pos.x, pos.y, pos.z );
			o.rotation.set( 0, rec.yaw, pull ? 0 : pitch );
			o.visible = true;
		}
		if ( rec._v ) rec._v.set( pos.x, pos.y, pos.z );
	}
	letGoHaul( mode, reason = null ) {
		if ( reason ) this.game.toast?.( reason, 'warn' );
		this.endMode( mode, 'letgo' );
	}
	_haulEnd( mode ) {
		const g = this.game, rec = mode.rec;
		rec._held = false;
		if ( g.placeables?.list?.has( rec.id ) ) g.placeables.refresh( rec );
		this.sound( 'mob_bump', rec.pos, 0.3 );
	}
	openHauler( rec ) {
		const ui = this.game.app?.ui;
		if ( ! ui?.openContainer ) return;
		ui.openContainer( haulContainer( rec ) );
	}
	// riding a cart into something: it goes over and spills, and so do you
	cartCrash( mode, v ) {
		const g = this.game, rec = mode.rec, p = g.player, gear = gearOf( g );
		const hurt = bailHurt( v, gear.pads, gear.helmet );
		if ( hurt > 0.5 ) g.survival?.hurt?.( hurt, 'fall', { fall: 1, cause: 'a fall' } );
		g.toast?.( 'Crashed', 'warn' );
		g.audio?.play?.( 'land', { pos: p.pos.clone(), vol: 0.8 } );
		p.shake = Math.max( p.shake || 0, 0.7 );
		this.stunT = 1.2;
		this.endMode( mode, 'crash' );
		this.sound( 'mob_clatter', rec.pos, 0.8 );
		rec.data.tipped = true;
		const items = itemsOf( rec.stack );
		const spill = items.splice( 0, Math.ceil( items.length * 0.4 ) );
		for ( const s of spill ) g.items3d?.spawn?.( s, new THREE.Vector3( rec.pos.x + ( Math.random() - 0.5 ) * 2, rec.pos.y + 0.5, rec.pos.z + ( Math.random() - 0.5 ) * 2 ), { persistent: true, settle: true } );
		g.placeables?.refresh?.( rec );
		this.noise( rec.pos, 25, 'crash' );
	}
	upright( rec ) {
		const g = this.game;
		g.itemUse.timed( 'Setting upright', 1.5, null, () => { rec.data.tipped = false; g.placeables.refresh( rec ); } );
	}
	// a wagon folds up to carry, a hand truck is picked up (empty them first)
	fold( rec ) {
		const g = this.game;
		if ( itemsOf( rec.stack ).length || rec.data.load ) { g.toast( 'Empty it first', 'warn' ); return; }
		g.itemUse.timed( HAUL[ rec.stack.id ]?.fold ? 'Folding' : 'Picking up', HAUL[ rec.stack.id ]?.fold ? 3 : 1, 'zipper', () => {
			if ( ! g.placeables.list.has( rec.id ) ) return;
			g.placeables.remove( rec, { give: true } );
		} );
	}
	// from the inventory: a folded wagon set up, a hand truck set down, where you stand
	setDown( stack ) {
		const g = this.game, p = g.player, P = g.placeables;
		if ( ! P ) return;
		const fx = - Math.sin( p.yaw ), fz = - Math.cos( p.yaw );
		const x = p.pos.x + fx * 1.1, z = p.pos.z + fz * 1.1;
		if ( g.physics.near( x, z, 0.4 ).some( b => b.maxY > p.pos.y + 0.2 && b.minY < p.pos.y + 1 ) ) { g.toast( 'Blocked', 'warn' ); return; }
		g.itemUse.timed( HAUL[ stack.id ]?.fold ? 'Unfolding' : 'Setting down', HAUL[ stack.id ]?.fold ? 3 : 1, 'zipper', () => {
			if ( ! g.itemUse.exists( stack ) ) return;
			const one = P._takeOne ? P._takeOne( stack ) : stack;
			P.add( 'mob_hauler', one, { x, y: this.groundY( x, z, p.pos.y + 0.5, 0.8 ), z }, p.yaw + Math.PI / 2, {}, one.id );
		} );
	}
	// the hand truck: a placed thing beside it (a generator, a barrel, a stash) onto its toe plate
	truckable( rec ) {
		const g = this.game, P = g.placeables;
		let best = null, bd = 2.6;
		for ( const q of P.list.values() ) {
			if ( q === rec || ! truckableKind( q.kind ) || q._held ) continue;
			if ( q.kind === 'stash' && q.data?.buried ) continue;
			const d = Math.hypot( q.pos.x - rec.pos.x, q.pos.z - rec.pos.z );
			if ( d < bd && Math.abs( q.pos.y - rec.pos.y ) < 1 ) { bd = d; best = q; }
		}
		return best ? { rec: best, name: P.nameOf( best ) } : null;
	}
	loadTruck( rec, q ) {
		const g = this.game, P = g.placeables;
		g.itemUse.timed( 'Loading', 2.5, null, () => {
			if ( ! P.list.has( q.id ) || ! P.list.has( rec.id ) ) return;
			rec.data.load = packRecord( q );
			P.remove( q, { give: false } );
			P.refresh( rec );
			this.sound( 'mob_bump', rec.pos, 0.5 );
		} );
	}
	unloadTruck( rec ) {
		const g = this.game, P = g.placeables, p = g.player;
		const o = rec.data.load;
		if ( ! o ) return;
		const fx = Math.cos( rec.yaw ), fz = - Math.sin( rec.yaw );
		const x = rec.pos.x + fx * 0.9, z = rec.pos.z + fz * 0.9;
		g.itemUse.timed( 'Unloading', 2.5, null, () => {
			const q = loadRecord( { ...o, p: [ x, this.groundY( x, z, rec.pos.y + 0.5, 0.8 ), z ] } );
			if ( ! q ) return;
			q._hours = g.time.hours; q._acc = 0;
			P.list.set( q.id, q );
			P._build( q );
			delete rec.data.load;
			P.refresh( rec );
			this.sound( 'mob_bump', rec.pos, 0.5 );
		} );
		void p;
	}

	// ---- ropes, ladders, the hook --------------------------------------------------------------------------------------------

	// the aim for a ladder (lean it on the wall in view), a rope ladder or a rope (hang it at the edge in front of you)
	aimAt( stack, what ) {
		const g = this.game;
		if ( this.mode || g.player.swimming || g.player.vehicle ) { g.toast( 'Not now', 'warn' ); return; }
		this.aim?.cancel();
		this.aim = new Aim( this, stack, what );
		g.app?.ui?.closeScreen?.();
	}

	// the record's climbing line: { kind, bot, top, face, ledge, off, w }
	pathOf( rec ) {
		const d = rec.data;
		const kind = rec.kind === 'mob_ladder' ? 'ladder' : rec.kind === 'mob_rope_ladder' ? 'rope_ladder' : 'rope';
		return { kind, bot: v3( d.bot ), top: v3( d.top ), face: d.face, ledge: d.ledge ? v3( d.ledge ) : null, rec, w: kind === 'ladder' ? LADDERS[ rec.item ]?.w : 0.36,
			off: kind === 'ladder' ? 0.32 : kind === 'rope_ladder' ? 0.3 : 0.34 };
	}
	climb( rec, fromTop = false ) {
		const g = this.game, p = g.player;
		if ( this.mode ) return;
		const path = this.pathOf( rec );
		const L = path.top.distanceTo( path.bot );
		const u = fromTop ? L - 0.15 : clamp( p.pos.y - path.bot.y + 0.05, 0, L );
		this.sound( path.kind === 'ladder' ? 'mob_rung' : 'mob_rope', p.pos, 0.4 );
		this.start( new ClimbMode( this, path, u, fromTop ? { from: p.pos } : {} ) );
	}
	// take a rope or a rope ladder up from the top, a hook down from below, a ladder off the wall
	takeDown( rec, how ) {
		const g = this.game, P = g.placeables;
		const time = how === 'yank' ? 1.2 : rec.kind === 'mob_ladder' ? 2.5 : 3;
		g.itemUse.timed( how === 'yank' ? 'Yanking it free' : rec.kind === 'mob_ladder' ? 'Taking the ladder' : 'Pulling it up', time, null, () => {
			if ( ! P.list.has( rec.id ) ) return;
			if ( how === 'yank' ) {
				// the hook comes down: mostly it falls free, now and then it bites harder
				if ( Math.random() < 0.25 ) { g.toast( 'Stuck. Try again', 'warn' ); this.sound( 'mob_clink', v3( rec.data.top ), 0.5 ); return; }
				this.sound( 'mob_clink', g.player.pos, 0.6 );
			}
			P.remove( rec, { give: true } );
		} );
	}
	// pull a ladder up after you: it lies on the roof by the edge; lower it again the same way
	pullUp( rec ) {
		const g = this.game, P = g.placeables, d = rec.data;
		g.itemUse.timed( d.up ? 'Lowering the ladder' : 'Pulling up the ladder', 3, null, () => {
			if ( ! P.list.has( rec.id ) ) return;
			d.up = ! d.up;
			if ( d.up ) {
				const out = new THREE.Vector3( Math.sin( d.face ), 0, Math.cos( d.face ) );
				const L = v3( d.ledge );
				d.base = [ rec.pos.x, rec.pos.y, rec.pos.z ];
				rec.pos.x = L.x - out.x * 0.2; rec.pos.z = L.z - out.z * 0.2; rec.pos.y = L.y;
			} else if ( d.base ) {
				rec.pos.x = d.base[ 0 ]; rec.pos.y = d.base[ 1 ]; rec.pos.z = d.base[ 2 ];
			}
			rec._r = null;
			P.refresh( rec );
			this.sound( 'mob_rung', rec.pos, 0.6 );
		} );
	}
	// the infected knock a ladder over: it falls on the ground (and you with it)
	topple( rec ) {
		const g = this.game, P = g.placeables;
		if ( this.mode?.kind === 'climb' && this.mode.path.rec === rec ) { g.toast( 'The ladder went over', 'bad' ); this.letGo( this.mode, new THREE.Vector3( Math.sin( rec.data.face ) * 2, 1, Math.cos( rec.data.face ) * 2 ) ); }
		const st = rec.stack;
		P.remove( rec, { give: false } );
		this.sound( 'mob_clatter', rec.pos, 0.9 );
		this.noise( rec.pos, 22, 'clatter' );
		if ( st && g.items3d?.spawn ) g.items3d.spawn( st, new THREE.Vector3( rec.pos.x, rec.pos.y + 0.3, rec.pos.z ), { persistent: true, settle: true, yaw: rec.yaw } );
	}

	// put a rope / ladder record down from an aim's spot
	placeLine( kind, stack, spot, extra = {} ) {
		const g = this.game, P = g.placeables;
		const one = P._takeOne ? P._takeOne( stack ) : stack;
		const data = { top: arr( spot.top ), bot: arr( spot.bot ), face: + spot.face.toFixed( 4 ), ledge: spot.ledge ? arr( spot.ledge ) : null, ...extra };
		const yaw = kind === 'mob_ladder' ? spot.face : 0;
		return P.add( kind, one, { x: spot.bot.x, y: spot.bot.y, z: spot.bot.z }, yaw, data, one.id );
	}

	// a rigged hook in the hands: thrown at the ledge in view
	throwHook( stack ) {
		const g = this.game, p = g.player;
		if ( this.mode || this.thrown || p.swimming || p.vehicle ) return;
		const rope = stack.data?.rope;
		if ( ! rope ) { g.toast( 'Needs a rope', 'warn' ); return; }
		const eye = _eye.set( p.pos.x, p.eye, p.pos.z );
		const dir = p.lookDir( new THREE.Vector3() );
		const spot = hookSpot( g, eye, dir, ROPES[ rope ] ?? 9 );
		if ( ! spot.ok ) { g.toast( spot.reason, 'warn' ); return; }
		if ( ( g.survival?.stamina ?? 100 ) < 10 ) { this.tired(); return; }
		this.useStamina( 10 );
		this.sound( 'mob_throw', p.pos, 0.6 );
		this.noise( p.pos, 8, 'throw' );
		const lv = g.skills?.level?.( 'survival' ) || 0;
		const wind = ( g.weather?.wind ?? 0.4 ) > 0.75 ? GRAPPLE.wind : 0;
		const ok = Math.random() < clamp( GRAPPLE.chance + lv * GRAPPLE.skillK - wind - spot.dist * 0.008, 0.25, 0.92 );
		const from = new THREE.Vector3( p.pos.x - Math.sin( p.yaw ) * 0.3 + Math.cos( p.yaw ) * 0.2, p.eye - 0.1, p.pos.z - Math.cos( p.yaw ) * 0.3 - Math.sin( p.yaw ) * 0.2 );
		const to = ok ? spot.top.clone() : spot.bot.clone().setY( spot.top.y - 0.4 );
		const T = 0.35 + from.distanceTo( to ) * 0.035;
		this.thrown = { stack, spot, ok, from, to, t: 0, T, obj: MOB.visual.hook?.( rope ) || null, fall: 0 };
		if ( this.thrown.obj ) { this._group().add( this.thrown.obj ); this.thrown.obj.userData.update?.( from, from, 0 ); }
		g.skills?.xp?.( 'survival', 2 );
	}

	_hookUpdate( dt ) {
		const H = this.thrown, g = this.game;
		H.t += dt;
		const k = Math.min( 1, H.t / H.T );
		// a lob: up and over, landing on the lip
		const pos = _v.lerpVectors( H.from, H.to, k );
		pos.y += Math.sin( k * Math.PI ) * Math.max( 1, H.from.distanceTo( H.to ) * 0.22 );
		H.obj?.userData.update?.( H.from, pos, H.t );
		if ( k < 1 ) return;
		this.sound( 'mob_clink', H.to, 0.7 );
		this.noise( H.to, 14, 'clink' );
		if ( H.obj ) { this._group().remove( H.obj ); H.obj.userData.dispose?.(); }
		this.thrown = null;
		if ( ! g.itemUse.exists( H.stack ) ) return;
		if ( H.ok ) {
			g.toast( 'Hook caught', 'good' );
			if ( g.player.inventory.hands === H.stack.uid ) { if ( g.hands?.holster ) g.hands.holster(); else g.player.inventory.hands = null; }
			this.placeLine( 'mob_rope', H.stack, H.spot, { hook: true } );
		} else {
			// it slips off and drops at the foot of the wall, the rope trailing
			g.toast( 'Missed', 'warn' );
			g.itemUse.discard( H.stack );
			g.items3d?.spawn?.( H.stack, new THREE.Vector3( H.spot.bot.x, H.spot.bot.y + 0.6, H.spot.bot.z ), { persistent: true, settle: true } );
		}
	}

	// ---- the zipline ---------------------------------------------------------------------------------------------------------

	// first end: a strap round the tree or post beside you
	tieZip( stack ) {
		const g = this.game, p = g.player, P = g.placeables;
		if ( this.zip && P.list.has( this.zip.id ) ) { g.toast( 'Finish the other line first', 'warn' ); return; }
		const A = anchorNear( g, p.pos );
		if ( ! A ) { g.toast( 'Stand by a tree or a post', 'warn' ); return; }
		g.itemUse.timed( 'Tying off', 5, 'zipper', () => {
			if ( ! g.itemUse.exists( stack ) ) return;
			const one = P._takeOne ? P._takeOne( stack ) : stack;
			const a = { x: A.x, y: A.y, z: A.z };
			const rec = P.add( 'mob_zipline', one, { x: A.x, y: this.groundY( A.x, A.z, p.pos.y + 0.5, 1 ), z: A.z }, 0, { a, b: null }, one.id );
			this.zip = { id: rec.id };
			g.toast( 'Walk the cable to the far end', 'info' );
		} );
	}
	// the far end, where you stand: the line tightens between the two
	tieZipEnd( rec, A ) {
		const g = this.game, P = g.placeables;
		g.itemUse.timed( 'Tensioning', 6, 'zipper', () => {
			if ( ! P.list.has( rec.id ) ) return;
			const a = rec.data.a, b = { x: A.x, y: A.y, z: A.z };
			const c = zipCheck( a, b );
			if ( ! c.ok ) { g.toast( c.reason, 'warn' ); return; }
			// the high end is a
			if ( b.y > a.y ) { rec.data.a = b; rec.data.b = a; } else rec.data.b = b;
			rec.data.sag = ZIP.sag;
			rec._r = null;
			P.refresh( rec );
			this.zip = null;
			this._dropZipCable();
			this.sound( 'mob_clink', A, 0.6 );
			g.toast( 'Zipline ready', 'good' );
			g.skills?.xp?.( 'survival', 6 );
		} );
	}
	zipRide( rec, s ) {
		const g = this.game;
		if ( this.mode ) return;
		const gear = gearOf( g );
		this.sound( 'mob_clink', g.player.pos, 0.5 );
		this.start( new ZipMode( this, rec, s, gear.trolley || null ) );
	}
	zipTakeDown( rec ) {
		const g = this.game, P = g.placeables;
		g.itemUse.timed( 'Taking it down', 8, 'zipper', () => {
			if ( ! P.list.has( rec.id ) ) return;
			if ( this.zip?.id === rec.id ) { this.zip = null; this._dropZipCable(); }
			P.remove( rec, { give: true } );
		} );
	}

	// ---- small things held and worn ------------------------------------------------------------------------------------------

	// an umbrella opens and closes (the same stack becomes the other item)
	umbrella( stack ) {
		const g = this.game, inv = g.player.inventory;
		const to = stack.id === 'umbrella' ? 'umbrella_open' : 'umbrella';
		stack.id = to;
		this.sound( to === 'umbrella_open' ? 'mob_unfold' : 'mob_rope', g.player.pos, 0.35 );
		g.itemUse?.changed?.( g.itemUse.where( stack ) );
		inv.changed();
	}

	moveMod( m ) {
		const g = this.game, p = g.player, inv = p.inventory;
		const held = inv.heldStack?.();
		if ( this.stunT > 0 ) { m.speed *= 0.3; m.canSprint = false; m.canJump = false; }
		// skates on grass: clumping along
		if ( inv.equip?.feet?.id === 'inline_skates' && ! this.mode ) { m.speed *= 0.5; m.canSprint = false; }
		if ( this.mode?.kind === 'haul' && this.mode.pull ) {
			const H = this.mode.H;
			m.speed *= ( H.speed[ this.mode.surface ] ?? 0.6 ) * clamp( 1 - this.mode.kg / 240, 0.5, 1 ) * 1.1;
			m.canSprint = false;
		}
		if ( held?.id === 'trekking_poles' ) m.slope = 0.55;
		if ( held?.id === 'umbrella_open' && p.sprinting ) m.speed *= 0.92;
		// a long ladder or a paddleboard in your arms
		const hd = held ? getItem( held.id ) : null;
		if ( hd?.carry?.slow ) { m.speed *= hd.carry.slow; if ( hd.carry.slow < 0.86 ) m.canSprint = false; }
	}

	// ---- per frame -----------------------------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game, p = g.player, S = g.survival;
		this.stunT = Math.max( 0, this.stunT - dt );
		this.offT = Math.max( 0, this.offT - dt );
		if ( this.aim ) this.aim.update( dt );
		if ( this.thrown ) this._hookUpdate( dt );
		const mode = this.mode;
		if ( mode && ( g.dead || p.vehicle ) ) this.endMode( mode, g.dead ? 'death' : 'vehicle' );
		// a blow while in a mode
		if ( this._knock && this.mode ) {
			const m = this.mode, k = this._knock;
			if ( m.kind === 'ride' ) this.bail( m, 'Knocked off', Math.max( m.v, 3 ) );
			else if ( m.kind === 'paddle' ) this.knockOff( m, 'Knocked off' );
			else if ( m.kind === 'haul' ) this.letGoHaul( m );
			else if ( m.kind === 'climb' && k.amount > 9 && Math.random() < 0.5 ) { g.toast( 'Lost your grip', 'bad' ); this.letGo( m ); }
		}
		this._knock = null;
		if ( this.mode ) {
			this._visualUpdate( this.mode, dt );
			this._viewGrips( this.mode );
			// the cart's or wagon's contents, with the inventory key
			if ( this.mode.kind === 'haul' && g.inputActive ) {
				const I = g.input;
				const codes = I.codes?.( 'inventory' ) || [];
				if ( codes.some( c => I.codePressed?.( c ) ) ) { for ( const c of codes ) I.pressedQ?.delete( c ); this.openHauler( this.mode.rec ); }
			}
			if ( this.mode.kind === 'glide' || this.mode.kind === 'chute' ) this._flightSound( this.mode, dt );
			// wheels on the ground (a sled hisses on the grass)
			if ( this.mode.kind === 'ride' ) { const m = this.mode; this.loop( 'mob_roll', m.air ? 0 : clamp( m.v / 7, 0, 1 ) * ( m.surface === 'paved' ? 0.45 : 0.25 ) * ( m.P.prone ? 0.6 : 1 ), 0.6 + m.v / 10 ); }
		}
		// worn and held
		this.checkT -= dt;
		if ( this.checkT <= 0 ) { this.checkT = 0.25; this._check(); }
		this._umbrella( dt );
		this._poles( dt );
		this._vario( dt );
		if ( this.zip ) this._zipCable();
		void S;
	}

	// inline skates on pavement roll; a cart picked up some other way goes in front of you
	_check() {
		const g = this.game, p = g.player, inv = p.inventory;
		if ( ! this.mode && ! this.offT && inv.equip?.feet?.id === 'inline_skates' && p.onGround && ! p.swimming && ! p.vehicle && p.stance === 'stand' && ! p.flying && ! g.dead ) {
			const surf = this.surface( p.pos.x, p.pos.z, p.groundBox );
			if ( surf === 'paved' || surf === 'wood' ) this.start( new RideMode( this, inv.equip.feet, 'inline_skates', { v: Math.hypot( p.vel.x, p.vel.z ) } ) );
		}
		if ( this.mode?.kind === 'ride' && this.mode.P.auto ) {
			const m = this.mode;
			if ( inv.equip?.feet !== m.stack || p.stance !== 'stand' || ( m.surface !== 'paved' && m.surface !== 'wood' && ! m.air ) ) { this.endMode( m, 'off' ); this.offT = 0.6; }
		}
		// a board or skates gone from the inventory mid-ride
		if ( this.mode?.stack && ( this.mode.kind === 'ride' || this.mode.kind === 'glide' || this.mode.kind === 'chute' ) && g.itemUse?.exists && ! g.itemUse.exists( this.mode.stack ) && ! inv.findUid?.( this.mode.stack.uid ) ) this.endMode( this.mode, 'gone' );
		// carts are pushed, never carried
		for ( const s of inv.allStacks?.() || [] ) {
			if ( ! BULKY.has( s.id ) ) continue;
			inv.remove( s );
			const fx = - Math.sin( p.yaw ), fz = - Math.cos( p.yaw );
			const pos = { x: p.pos.x + fx * 1, y: p.pos.y, z: p.pos.z + fz * 1 };
			if ( this.mode || ! g.placeables ) { g.dropStack?.( s ); g.toast?.( 'Too bulky', 'warn' ); continue; }
			const rec = g.placeables.add( 'mob_hauler', s, pos, p.yaw + Math.PI / 2, {}, s.id );
			this.haul( rec );
			break;
		}
	}

	// held open in the rain it keeps you dry (and a squall can turn it inside out)
	_umbrella( dt ) {
		const g = this.game, p = g.player, S = g.survival;
		const held = p.inventory.heldStack?.();
		const open = held?.id === 'umbrella_open' && ! p.swimming && ! p.underwater && ! this.mode?.busyHands;
		if ( ! open || ! S ) { this._wet = null; return; }
		if ( this._wet !== null && S.wet > this._wet ) S.wet = this._wet;
		this._wet = S.wet;
		const wind = g.weather?.wind ?? 0;
		if ( wind > 0.8 && ! g.world?.isIndoors?.( p.pos ) ) {
			this.gustT += dt;
			if ( this.gustT > 1 ) {
				this.gustT = 0;
				if ( Math.random() < ( wind - 0.8 ) * 0.25 ) {
					held.cond = Math.max( 0, held.cond - 0.25 );
					g.toast?.( 'Blown inside out', 'warn' );
					this.umbrella( held );
				}
			}
		}
	}

	// a variometer left on runs its batteries down
	_vario( dt ) {
		const g = this.game, dh = dt / ( ( g.time?.dayMinutes || 48 ) * 60 ) * 24;
		this._varioT = ( this._varioT || 0 ) + dh;
		if ( this._varioT < 0.02 ) return;
		const h = this._varioT;
		this._varioT = 0;
		const v = g.player.inventory.find?.( ( s ) => s.id === 'variometer' && s.data?.on );
		if ( ! v ) return;
		v.data.charge = Math.max( 0, ( v.data.charge ?? 30 ) - h );
		if ( v.data.charge <= 0 ) { v.data.on = false; g.toast?.( 'Variometer flat', 'warn' ); }
	}

	// poles take some of the climb's work: sprinting up a slope costs less, and you get a breather on the walk
	_poles( dt ) {
		const g = this.game, p = g.player, S = g.survival;
		if ( ! S || p.inventory.heldStack?.()?.id !== 'trekking_poles' || ! p.onGround || ! p.moving || this.mode ) return;
		const n = g.hf.normalAt?.( p.pos.x, p.pos.z, _v, 1 );
		if ( ! n || n.y > 0.97 ) return;
		const max = S.maxStamina?.() ?? 100;
		S.stamina = Math.min( max, S.stamina + ( p.sprinting ? 9 * 0.4 : 0.8 ) * dt * ( 1 - n.y ) * 6 );
	}

	// ---- the world visuals of a mode -----------------------------------------------------------------------------------------

	_group() {
		if ( ! this.group ) { this.group = new THREE.Group(); this.group.name = 'mobility'; this.game.scene?.add( this.group ); }
		return this.group;
	}
	_visual( mode ) {
		const V = MOB.visual;
		let obj = null;
		try {
			if ( mode.kind === 'glide' || mode.kind === 'chute' ) obj = V.canopy?.( mode.kind, mode.stack );
			else if ( mode.kind === 'ride' && ! mode.P.auto ) obj = V.board?.( mode.stack );
			else if ( mode.kind === 'paddle' ) obj = V.board?.( mode.stack, true );
			else if ( mode.kind === 'zip' && mode.trolley ) obj = V.trolley?.();
			if ( mode.view?.kind === 'paddle' && mode.view.paddle ) mode.view.obj = V.viewPaddle?.( mode.view.paddle ) || null;
			if ( mode.view?.kind === 'brakes' ) mode.view.obj = V.viewBrakes?.( mode.kind ) || null;
		} catch ( e ) { console.error( 'mobility visual', e ); }
		if ( ! obj ) return;
		this.vis = obj;
		this._group().add( obj );
		this._visualUpdate( mode, 0 );
	}
	_dropVisual() {
		if ( ! this.vis ) return;
		this.vis.parent?.remove( this.vis );
		this.vis.userData.dispose?.();
		this.vis = null;
	}
	_visualUpdate( mode, dt ) {
		const o = this.vis, p = this.game.player;
		if ( ! o ) return;
		if ( mode.kind === 'glide' || mode.kind === 'chute' ) {
			// the wing over you, banked into the turn, pitched with the brakes
			o.position.set( p.pos.x, p.pos.y + 1.35, p.pos.z );
			_e.set( - ( mode.input?.brake || 0 ) * 0.12 + ( mode.input?.bar || 0 ) * 0.08, mode.s.heading, - ( mode.s.bank || 0 ) * 0.9, 'YXZ' );
			o.quaternion.setFromEuler( _e );
			o.userData.open?.( mode.s.open ?? 1, this.game.playTime || 0 );
		} else if ( mode.kind === 'ride' ) {
			o.position.set( p.pos.x, p.pos.y + ( mode.P.prone ? 0.02 : 0.005 ), p.pos.z );
			o.rotation.set( 0, mode.heading + Math.PI / 2, Math.atan( mode.grade || 0 ), 'YXZ' );
			o.rotateX( - ( mode.tilt || 0 ) * 0.18 );
			o.userData.spin?.( mode.v, dt );
		} else if ( mode.kind === 'paddle' ) {
			const t = this.game.playTime || 0, wl = this.game.physics.waterLevel( p.pos.x, p.pos.z );
			o.position.set( p.pos.x, wl - 0.06, p.pos.z );
			o.rotation.set( Math.sin( t * 1.1 ) * 0.03, mode.heading + Math.PI / 2, Math.sin( t * 0.8 ) * 0.025, 'YXZ' );
		} else if ( mode.kind === 'zip' ) {
			const c = zipShape( mode.a, mode.b, mode.s, mode.sag, {} );
			o.position.set( c.x, c.y, c.z );
			o.rotation.set( 0, Math.atan2( mode.dir.x, mode.dir.z ) + Math.PI / 2, - Math.atan( ( mode.b.y - mode.a.y ) / Math.max( 1, Math.hypot( mode.b.x - mode.a.x, mode.b.z - mode.a.z ) ) ), 'YXZ' );
		}
		o.updateMatrixWorld( true );
	}

	// the hands on things in the world (a rope, a cart's handle, a trolley): world points into the first-person view, scaled
	// for the view camera's narrower field of view so they sit on the thing on screen
	_viewGrips( mode ) {
		const v = mode.view, g = this.game;
		// a paddle through both hands (the top one on the T-grip), the brake toggles in the fists
		if ( v?.kind === 'paddle' && v.obj ) {
			const R = v.grips.R.p, L = v.grips.L.p;
			v.obj.position.copy( R );
			v.obj.quaternion.setFromUnitVectors( AX, _d.subVectors( R, L ).normalize() );
		}
		if ( v?.kind === 'brakes' && v.obj?.children.length === 2 ) { v.obj.children[ 0 ].position.copy( v.grips.R.p ); v.obj.children[ 1 ].position.copy( v.grips.L.p ); }
		if ( ! v?.cam || ! v.world || ! g.camera ) return;
		const cam = g.camera, vf = g.viewCamera?.fov || 45;
		const k = Math.tan( vf * Math.PI / 360 ) / Math.tan( ( cam.fov || 62 ) * Math.PI / 360 );
		const inv = cam.matrixWorldInverse;
		_q.copy( cam.quaternion ).invert();
		const gr = [ v.grips.R, v.grips.L ];
		for ( let i = 0; i < 2; i ++ ) {
			const w = v.world[ i ];
			if ( ! w ) continue;
			_v.copy( w ).applyMatrix4( inv );
			// past the edge of the view the hand comes in no further than the frame
			_v.x *= k; _v.y *= k;
			gr[ i ].p.copy( _v );
		}
		// the axis the hands close round (vertical for a rope or a ladder's rail, across for a handle or a bar)
		if ( mode.kind === 'climb' ) { _d.set( 0, 1, 0 ).applyQuaternion( _q ); for ( const G0 of gr ) { G0.a.copy( _d ); G0.n.set( 0, 0, 1 ); } }
		else {
			const h = mode.kind === 'zip' ? Math.atan2( mode.dir.x, mode.dir.z ) + Math.PI / 2 : ( mode.heading ?? 0 );
			_d.set( Math.cos( h ), 0, - Math.sin( h ) ).applyQuaternion( _q );
			for ( const G0 of gr ) { G0.a.copy( _d ); G0.n.set( 0, mode.kind === 'zip' ? - 0.2 : 0.8, 0.6 ).normalize(); }
		}
	}

	_flightSound( mode, dt ) {
		const v = Math.hypot( mode.vh || 0, mode.s.vy || 0 );
		this.loop( 'mob_wind', clamp( v / 12, 0.1, 1 ) * 0.45, 0.8 + v / 30 );
		this.loop( 'mob_flap', ( mode.s.open < 1 ? 0.7 : 0.15 + ( mode.input?.brake || 0 ) * 0.2 ), 1 );
		// a variometer: beeps quicker and higher the faster you climb, a low tone sinking hard
		if ( mode.kind !== 'glide' || ! gearOf( this.game ).vario ) return;
		const c = mode.s.vy;
		this.varioT -= dt;
		if ( c > 0.15 && this.varioT <= 0 ) {
			this.varioT = clamp( 0.55 - c * 0.12, 0.12, 0.55 );
			this.sound( 'mob_vario', null, 0.3, { rate: 1 + clamp( c, 0, 5 ) * 0.12 } );
		} else if ( c < - 2.6 && this.varioT <= 0 ) { this.varioT = 0.7; this.sound( 'mob_vario', null, 0.2, { rate: 0.55 } ); }
	}

	// the cable trailing from the first anchor to you while you walk to the far end
	_zipCable() {
		const g = this.game, P = g.placeables, rec = P?.list?.get( this.zip.id );
		if ( ! rec || rec.data.b ) { this.zip = null; this._dropZipCable(); return; }
		const a = rec.data.a, p = g.player;
		const d = Math.hypot( p.pos.x - a.x, p.pos.z - a.z );
		if ( ! this.zipLine && MOB.visual.cable ) { this.zipLine = MOB.visual.cable(); if ( this.zipLine ) this._group().add( this.zipLine ); }
		this.zipLine?.userData.set?.( a, { x: p.pos.x, y: p.pos.y + 1.0, z: p.pos.z }, d > ZIP.max ? 0.5 : 0.15 );
		if ( d > ZIP.max + 8 && ! this._zipWarned ) { this._zipWarned = true; g.toast( 'Cable too short', 'warn' ); }
		if ( d < ZIP.max ) this._zipWarned = false;
	}
	_dropZipCable() { if ( this.zipLine ) { this.zipLine.parent?.remove( this.zipLine ); this.zipLine.userData.dispose?.(); this.zipLine = null; } }

	// ---- the F prompts -------------------------------------------------------------------------------------------------------

	provide( ray, maxDist ) {
		const g = this.game, p = g.player;
		if ( p.vehicle || g.dead ) return null;
		const out = this._out;
		out.length = 0;
		if ( this.aim ) { const c = this.aim.candidate(); return c ? [ c ] : null; }
		if ( this.mode ) {
			const pr = this.mode.prompt();
			if ( pr ) out.push( this._modeC( pr ) );
			return out;
		}
		// falling: open the wing (Space, as the jump would)
		const dep = this.deployable();
		if ( dep ) {
			out.push( { t: 0.01, id: 'mob:deploy', key: 'jump', label: dep.chute ? 'Pull reserve' : 'Open paraglider', sub: `${Math.round( dep.agl )} m up`, noOcclusion: true,
				action: () => { const d2 = this.deployable(); if ( d2 ) this.deploy( d2.stack, d2.chute ); } } );
			return out;
		}
		if ( p.swimming ) {
			// back onto a board you carry
			const b = p.inventory.find( ( s, d ) => isBoard( d ) );
			if ( b ) out.push( { t: 0.05, id: 'mob:board', label: 'Climb on board', sub: displayName( b ), noOcclusion: true, action: () => this.paddleOut( b, !! boardOf( getItem( b.id ) )?.prone ) } );
		}
		this._climbC( ray, maxDist, out );
		this._zipC( ray, maxDist, out );
		this._haulC( ray, maxDist, out );
		return out.length ? out : null;
	}

	_modeC( pr ) {
		const c = this._mc || ( this._mc = { t: 0.01, id: 'mob:mode', noOcclusion: true } );
		c.label = pr.label; c.sub = pr.sub; c.action = pr.action;
		return c;
	}

	// ropes and ladders: the prompt follows the line you look at, from the bottom or from the top
	_climbC( ray, maxDist, out ) {
		const g = this.game, P = g.placeables, p = g.player;
		if ( ! P?.list?.size ) return;
		let best = null, bt = maxDist + 0.4;
		for ( const rec of P.list.values() ) {
			if ( rec.kind !== 'mob_rope' && rec.kind !== 'mob_ladder' && rec.kind !== 'mob_rope_ladder' ) continue;
			if ( ( rec.pos.x - p.pos.x ) ** 2 + ( rec.pos.z - p.pos.z ) ** 2 > 400 ) continue;
			const d = rec.data;
			if ( rec.kind === 'mob_ladder' && d.up ) {
				// a ladder pulled up onto the roof: lower it, or take it
				const t = raySphere( ray.origin, ray.dir, _v.set( rec.pos.x, rec.pos.y + 0.15, rec.pos.z ), 1.1, bt );
				if ( t !== null && t < bt ) { bt = t; best = { rec, where: 'up', t }; }
				continue;
			}
			const top = v3( d.top ), bot = v3( d.bot );
			const hit = raySegment( ray.origin, ray.dir, bot, top, rec.kind === 'mob_ladder' ? 0.42 : 0.3 );
			if ( ! hit || hit.t > bt ) continue;
			bt = hit.t;
			best = { rec, t: hit.t, s: hit.s, top, bot };
		}
		if ( ! best ) return;
		const rec = best.rec, d = rec.data, name = rec.kind === 'mob_ladder' ? getItem( rec.item )?.name || 'Ladder' : rec.kind === 'mob_rope_ladder' ? 'Rope ladder' : d.hook ? 'Grappling hook' : 'Rope';
		const c = { t: best.t, id: 'mob:cl:' + rec.id, owner: rec, ownerBox: rec._box || null, noOcclusion: true };
		if ( best.where === 'up' ) {
			if ( ! d.ledge || Math.hypot( p.pos.x - rec.pos.x, p.pos.z - rec.pos.z ) > 3 ) return;
			Object.assign( c, { label: 'Lower ladder', sub: name, action: () => this.pullUp( rec ) } );
			out.push( c );
			return;
		}
		const ledge = d.ledge ? v3( d.ledge ) : null;
		const atTop = ledge && Math.abs( p.pos.y - ledge.y ) < 1.2 && Math.hypot( p.pos.x - ledge.x, p.pos.z - ledge.z ) < 2.4;
		const atBot = Math.abs( p.pos.y - best.bot.y ) < 2.4 && Math.hypot( p.pos.x - best.bot.x, p.pos.z - best.bot.z ) < 2.6;
		const L = best.top.distanceTo( best.bot );
		const u = best.s * L;
		if ( atTop ) {
			// at the anchor: take it up (a ladder: pull it up after you); lower down the line: climb down
			if ( L - u < 0.9 ) Object.assign( c, rec.kind === 'mob_ladder' ? { label: 'Pull up ladder', sub: name, hold: 0.6, action: () => this.pullUp( rec ) } : { label: d.hook ? 'Pull up rope' : rec.kind === 'mob_rope_ladder' ? 'Pull up ladder' : 'Untie rope', sub: name, hold: 0.6, action: () => this.takeDown( rec, 'up' ) } );
			else Object.assign( c, { label: 'Climb down', sub: name, action: () => this.climb( rec, true ) } );
		} else if ( atBot ) {
			if ( u < 0.7 && ( d.hook || rec.kind === 'mob_ladder' ) ) Object.assign( c, d.hook ? { label: 'Yank down', sub: name, hold: 0.8, action: () => this.takeDown( rec, 'yank' ) } : { label: 'Take ladder', sub: name, hold: 0.8, action: () => this.takeDown( rec, 'take' ) } );
			else Object.assign( c, { label: 'Climb', sub: name, action: () => this.climb( rec, false ) } );
		} else return;
		out.push( c );
	}

	// the zipline: ride or cross it from either end, take it down; the pending far end ties off at an anchor
	_zipC( ray, maxDist, out ) {
		const g = this.game, P = g.placeables, p = g.player;
		if ( ! P?.list?.size ) return;
		for ( const rec of P.list.values() ) {
			if ( rec.kind !== 'mob_zipline' ) continue;
			const d = rec.data;
			if ( ! d.b ) {
				// the far end, pending: at an anchor in range, tie it off
				if ( this.zip?.id !== rec.id ) continue;
				const A = anchorNear( g, p.pos );
				const dd = Math.hypot( p.pos.x - d.a.x, p.pos.z - d.a.z );
				if ( dd < 3 ) {
					const t = raySphere( ray.origin, ray.dir, _v.set( d.a.x, d.a.y, d.a.z ), 0.8, maxDist );
					if ( t !== null ) out.push( { t, id: 'mob:zipa:' + rec.id, label: 'Take down zipline', sub: 'Zipline', hold: 0.8, noOcclusion: true, action: () => this.zipTakeDown( rec ) } );
					continue;
				}
				if ( ! A ) continue;
				const c = zipCheck( d.a, A );
				out.push( { t: 0.5, id: 'mob:zipb:' + rec.id, label: 'Tie off zipline', sub: c.ok ? `${Math.round( c.L )} m` : c.reason, hold: c.ok ? 0.8 : undefined, noOcclusion: true,
					action: () => { if ( c.ok ) this.tieZipEnd( rec, A ); else g.toast( c.reason, 'warn' ); } } );
				continue;
			}
			for ( const [ end, s ] of [ [ d.a, 0.02 ], [ d.b, 0.98 ] ] ) {
				if ( Math.hypot( p.pos.x - end.x, p.pos.z - end.z ) > 2.6 || Math.abs( p.pos.y + 2 - end.y ) > 2.2 ) continue;
				const t = raySphere( ray.origin, ray.dir, _v.set( end.x, end.y, end.z ), 0.9, maxDist + 0.5 );
				if ( t === null ) continue;
				const tr = gearOf( g ).trolley;
				const high = s < 0.5;
				const lbl = tr && high ? 'Ride zipline' : 'Cross hand over hand';
				out.push( { t, id: 'mob:zip:' + rec.id + ':' + s, label: lbl, sub: tr || ! high ? 'Zipline · hold to take down' : 'Zipline · no trolley', noOcclusion: true,
					hold: undefined, action: () => this.zipRide( rec, s ) } );
				// holding F longer takes it down: offered as its own prompt when looking at the strap from close
				if ( Math.hypot( p.pos.x - end.x, p.pos.z - end.z ) < 1.4 && ray.dir.y < - 0.1 ) out.push( { t: t - 0.01, id: 'mob:zipd:' + rec.id, label: 'Take down zipline', sub: 'Zipline', hold: 1, noOcclusion: true, action: () => this.zipTakeDown( rec ) } );
			}
		}
	}

	// a cart lying about as loot: Push (it won't go in a bag)
	_haulC( ray, maxDist, out ) {
		const g = this.game, W = g.items3d;
		if ( ! W?.near ) return;
		for ( const it of W.near( ray.origin, maxDist + 1 ) ) {
			const d = getItem( it.stack?.id );
			if ( ! BULKY.has( d?.id ) || it.falling ) continue;
			const info = W.info?.( it.stack.id );
			const c = it.centre ? it.centre( _v ) : _v.copy( it.pos );
			const t = raySphere( ray.origin, ray.dir, c, Math.max( 0.5, ( info?.radius ?? 0.6 ) * 0.8 ), maxDist );
			if ( t === null ) continue;
			out.push( { t: Math.max( 0, t - 0.02 ), id: 'mob:hitem:' + it.id, label: `Push ${d.name.toLowerCase()}`, sub: '', owner: it, noOcclusion: true, action: () => this.haulItem( it ) } );
		}
	}

	// ---- save ------------------------------------------------------------------------------------------------------------------

	serialize( save ) {
		save.world = save.world || {};
		save.world.mobility = { zip: this.zip?.id || null };
	}
	load( save ) {
		if ( this.mode ) this.endMode( this.mode, 'load' );
		const m = save.world?.mobility;
		this.zip = m?.zip ? { id: m.zip } : null;
	}

	dispose() {
		if ( this.mode ) this.endMode( this.mode, 'quit' );
		this._stopLoops();
		this._dropZipCable();
		if ( this.group ) this.game.scene?.remove( this.group );
	}
}

// the closest approach of a ray to a segment a-b, within r: { t (along the ray), s (0..1 along the segment) } | null
export function raySegment( o, d, a, b, r ) {
	const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
	const wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
	const A = d.x * d.x + d.y * d.y + d.z * d.z, B = d.x * ux + d.y * uy + d.z * uz, C = ux * ux + uy * uy + uz * uz;
	const D = d.x * wx + d.y * wy + d.z * wz, E = ux * wx + uy * wy + uz * wz;
	const den = A * C - B * B;
	let t, s;
	if ( den < 1e-8 ) { t = 0; s = clamp( E / C, 0, 1 ); } else { t = ( B * E - C * D ) / den; s = clamp( ( A * E - B * D ) / den, 0, 1 ); }
	if ( t < 0 ) return null;
	// re-solve t for the clamped s
	t = Math.max( 0, ( ( a.x + ux * s - o.x ) * d.x + ( a.y + uy * s - o.y ) * d.y + ( a.z + uz * s - o.z ) * d.z ) / A );
	const px = o.x + d.x * t - a.x - ux * s, py = o.y + d.y * t - a.y - uy * s, pz = o.z + d.z * t - a.z - uz * s;
	return px * px + py * py + pz * pz <= r * r ? { t, s } : null;
}

// =====================================================================================================================
// the aim: a ladder leant on a wall, a rope ladder or a rope hung at an edge
// =====================================================================================================================

const AIM = {
	ladder: { kind: 'mob_ladder', verb: 'Lean ladder', gerund: 'Setting up the ladder', time: 2.5 },
	rope_ladder: { kind: 'mob_rope_ladder', verb: 'Hang ladder', gerund: 'Hanging the ladder', time: 3 },
	rope: { kind: 'mob_rope', verb: 'Tie off rope', gerund: 'Tying off', time: 3 },
	rappel: { kind: 'mob_rope', verb: 'Rappel', gerund: 'Rigging', time: 3.5 },
};

class Aim {
	constructor( sys, stack, what ) {
		this.sys = sys;
		this.game = sys.game;
		this.stack = stack;
		this.what = what;
		this.A = AIM[ what ];
		this.def = getItem( stack.id );
		this.spot = null; this.reason = ''; this.t = 0; this.locked = false; this.ghost = null; this.gkey = '';
		this.cand = { t: 0, id: 'mob:aim', label: this.A.verb, sub: '', noOcclusion: true, action: () => {} };
	}
	cancel() {
		if ( this.ghost ) { this.ghost.parent?.remove( this.ghost ); this.ghost = null; }
		if ( this.sys.aim === this ) this.sys.aim = null;
		if ( this.locked && this.game.actions?.current?.mobAim ) this.game.actions.cancel();
	}
	candidate() {
		if ( this.locked ) return null;
		this.cand.sub = this.spot ? ( this.spot.note || `${this.game.input?.label?.( 'aim' ) || 'RMB'} to cancel` ) : this.reason;
		return this.cand;
	}
	_find() {
		const g = this.game, p = g.player;
		const eye = _eye.set( p.pos.x, p.eye, p.pos.z ), dir = p.lookDir( _d );
		if ( this.what === 'ladder' ) return ladderSpot( g, eye, dir, LADDERS[ this.stack.id ] || LADDERS.folding_ladder );
		const reach = this.what === 'rope_ladder' ? LADDERS.rope_ladder.reach : ROPES[ this.stack.id ] ?? 9;
		const s = edgeBelow( g, p.pos, dir, reach );
		if ( s.ok && this.what === 'rope_ladder' && s.short ) return { ok: false, reason: 'Too high for it' };
		if ( s.ok && s.short ) s.note = `Ends ${Math.round( s.drop - reach )} m up`;
		return s;
	}
	update( dt ) {
		const g = this.game, I = g.input, p = g.player;
		this.t += dt;
		if ( g.dead || p.vehicle || p.swimming || this.sys.mode || ! g.itemUse?.exists?.( this.stack ) || ( this.t > 0.3 && ( g.paused || g.app?.ui?.screen ) ) ) { this.cancel(); return; }
		if ( this.locked || ! g.inputActive ) return;
		const fire = I.pressed( 'fire' ), aim = I.pressed( 'aim' ), use = I.pressed( 'interact' ), wheel = I.consumeWheel?.() || 0;
		for ( const a of [ 'fire', 'aim', 'interact', 'reload' ] ) for ( const c of I.codes?.( a ) || [] ) { I.pressedQ?.delete( c ); if ( a === 'fire' || a === 'aim' ) I.down?.delete( c ); }
		void wheel;
		if ( aim ) { this.cancel(); return; }
		const s = this._find();
		this.spot = s.ok ? s : null;
		this.reason = s.ok ? '' : s.reason;
		this._ghost( s );
		if ( ( fire || use ) && this.t > 0.15 ) {
			if ( ! this.spot ) { g.toast( this.reason, 'warn' ); return; }
			this._commit( this.spot );
		}
	}
	_ghost( s ) {
		const look = MOB.look[ this.A.kind ];
		if ( ! look ) return;
		if ( ! s.ok ) { if ( this.ghost ) this.ghost.visible = false; return; }
		// rebuilt when its length changes (a ladder's head on a higher wall), else just moved
		const key = Math.round( s.top.distanceTo( s.bot ) * 10 ) + ':' + ( s.ledge ? 1 : 0 );
		if ( key !== this.gkey || ! this.ghost ) {
			this.gkey = key;
			if ( this.ghost ) this.ghost.parent?.remove( this.ghost );
			const rec = this._rec( s );
			this.ghost = look( rec, this.game );
			if ( ! this.ghost ) return;
			this.ghost.userData.ghost = true;
			this.sys._group().add( this.ghost );
			MOB.visual.ghostify?.( this.ghost );
		}
		this.ghost.visible = true;
		this.ghost.position.set( s.bot.x, s.bot.y, s.bot.z );
		this.ghost.rotation.set( 0, this.A.kind === 'mob_ladder' ? s.face : 0, 0 );
	}
	_rec( s ) {
		return { kind: this.A.kind, item: this.stack.id, stack: this.stack, pos: { x: s.bot.x, y: s.bot.y, z: s.bot.z }, yaw: this.A.kind === 'mob_ladder' ? s.face : 0,
			data: { top: arr( s.top ), bot: arr( s.bot ), face: s.face, ledge: s.ledge ? arr( s.ledge ) : null, hook: false }, preview: true };
	}
	_commit( spot ) {
		const g = this.game, sys = this.sys;
		this.locked = true;
		const act = g.actions.start( {
			label: this.A.gerund, time: this.A.time, cancelOnMove: true,
			onDone: () => {
				if ( sys.aim !== this ) return;
				this.cancel();
				if ( ! g.itemUse.exists( this.stack ) ) return;
				const rec = sys.placeLine( this.A.kind, this.stack, spot );
				sys.sound( this.A.kind === 'mob_ladder' ? 'mob_rung' : 'mob_rope', spot.bot, 0.6 );
				if ( this.what === 'rappel' && rec ) sys.climb( rec, true );
			},
			onCancel: () => { if ( sys.aim === this ) this.locked = false; },
		} );
		act.mobAim = true;
	}
}
