// Placeables (game.placeables; docs/ITEMS_PLAN.md "Placeables", ARCHITECTURE.md "Placeables"): things you put down in
// the world and leave — lights, noise makers, traps, rain collectors, stashes, tents, barricades.
//
// An item with `place: { kind, … }` gets a verb (placeables/verbs.js: Place, Set, Pitch, Stash…). That starts the
// placer (placeables/ghost.js): a ghost of the thing on the ground at the crosshair, green or red, turned with the
// wheel, put down with the left button or F. Each placed thing is a record { id, kind, item, pos, yaw, stack, data }
// saved in save.world.placeables, drawn as plain meshes (a few each), ticked at low frequency (every frame only near
// the player, for kinds that need it), and has an F prompt: a tap runs its first action, holding F opens the list.
//
// Kinds (placeables/*.js) register with addPlaceable( kind, def ) (placeables/registry.js documents def). Domain
// modules add their own: `import { addPlaceable } from '…/placeables/registry.js'`, then give items place: { kind }.
//
// API:
//   beginPlace( stack, { kind, keep, item, spec } ) start placing one unit of a stack (kind overrides the item's; keep:
//                                                the stack is a tool that makes the thing and stays yours, item: the
//                                                made thing's id, spec: more placement fields)
//   add( kind, stack, pos, yaw, data, item ) -> p put one down directly (spawners, tests); runs onPlace when data is null
//   remove( p, { give } )                         take it away (give: the stack back to the player)
//   refresh( p )                                  rebuild its look after a state change
//   near( pos, r, kind? ) -> [ p ], byDoor( key ), list (Map id -> p)
//   helpers for kinds: vec( p ), give( stack ), timed( label, time, sound, onDone ), sound( p, name, vol, opts ),
//   loop( p, name, vol, ref ) / stopLoop( p, name ), noise( p, radius, kind ), light( p, spec | null ),
//   pickUpAction( p, { label, time, check, before } ), hold( p ) / release() (a trap holding the player)
import * as THREE from 'three';
import { getItem, makeStack, displayName, cloneStack, newUid } from './ItemDB.js';
import { KINDS, addPlaceable, getPlaceable, placeOf, makeRecord, serializeRecord, loadRecord } from './placeables/registry.js';
import { VERB } from './placeables/verbs.js';
import { Placer } from './placeables/ghost.js';
import { openActionMenu } from './placeables/menu.js';
import { tickFlames, itemModel, placedDef } from './placeables/fx.js';
import { ensureSound } from './placeables/sounds.js';
import { ensureItemSound } from './sounds.js';
import { doorAhead, barricadeDoor, wrapDoor } from './placeables/barricade.js';
import { raySphere } from '../Entities.js';
import './placeables/light.js';
import './placeables/noise.js';
import './placeables/collector.js';
import './placeables/trap.js';
import './placeables/stash.js';
import './placeables/shelter.js';

export { addPlaceable, getPlaceable, placeOf, KINDS };

const NEAR = 60; // m: records this close tick 4 times a second, the rest every 2 s
const FRAME_R = 90; // m: kinds with a per-frame check run it this close
const HOLD = 0.4; // s of F that opens the list
const VIEW = 70, VIEW_BIG = 180; // draw distances (small things, tents and barrels)
const _v = new THREE.Vector3(), _box = new THREE.Box3(), _size = new THREE.Vector3();

// the bounds of a placed model's solid parts (glows and flames left out)
function bounds( obj, box ) {
	box.makeEmpty();
	const walk = ( o ) => {
		if ( o.userData.fx || o.isSprite ) return;
		if ( o.isMesh ) box.expandByObject( o, false );
		for ( const c of o.children ) walk( c );
	};
	walk( obj );
	if ( box.isEmpty() ) box.setFromCenterAndSize( obj.position, _size.set( 0.2, 0.2, 0.2 ) );
	return box;
}

export function install( game ) {
	const P = new Placeables( game );
	game.placeables = P;
	game.register( P );
	P.registerSpawnables();
	return P;
}

export class Placeables {
	constructor( game ) {
		this.game = game;
		this.list = new Map();
		this.orphans = []; // saved records of kinds nobody registered (a domain module failed): kept for the next save
		this.group = new THREE.Group();
		this.group.name = 'placeables';
		game.scene.add( this.group );
		this.placer = new Placer( this );
		this.held = null; // the trap holding the player
		this._out = []; // the F candidates, reused every frame
		this.t = 0;
		this.visT = 0;
		this.doorT = 0;
		this.offProvider = game.interact.addProvider( ( ray, maxDist ) => this.provide( ray, maxDist ) );
		this._hookMovement();
	}

	// ---- placing ------------------------------------------------------------------------------------------------

	beginPlace( stack, opts = {} ) { return this.placer.begin( stack, opts ); }
	get placing() { return this.placer.placing; }
	verbOf( spec ) { return spec?.verb || VERB[ spec?.kind ] || 'Place'; }

	// the placer's confirm: one unit of the stack leaves wherever it is and becomes the record. box: the container the
	// stack was in when placing began (the screen showing it has closed since)
	placeFrom( stack, spec, pos, yaw, box = null ) {
		const g = this.game, use = g.itemUse;
		if ( ! this._has( stack, box ) ) return null;
		// a tool that makes the thing rather than becoming it (a shovel digging a hole)
		if ( spec.keep ) {
			g.survival?.useStamina?.( spec.stamina ?? 20 );
			use.wear?.( stack, spec.wear ?? 0.01 );
			if ( spec.doneSound !== null ) this.sound( { pos }, spec.doneSound || 'dig', 0.8 );
			return this.add( spec.kind, null, pos, yaw, null, spec.item || ( spec.hole ? 'hole' : null ), spec );
		}
		const p = this.add( spec.kind, this._takeOne( stack, box ), pos, yaw, null, null, spec );
		g.audio?.play( 'drop', { pos: this.vec( p ), vol: 0.4 } );
		return p;
	}

	// still there: carried, on the ground, or in the container placing began from
	_has( stack, box = null ) {
		if ( ! stack || ! ( stack.qty > 0 ) ) return false;
		return !! this.game.itemUse?.exists?.( stack ) || !! box?.items?.includes( stack );
	}

	// one unit of a stack, out of wherever it is (a bag, a slot, the ground, a container): a stack of several gives a
	// copy and keeps the rest where it is, so nothing is shuffled between bags or dropped for want of room
	_takeOne( stack, box = null ) {
		const g = this.game, use = g.itemUse;
		const w = use.where( stack );
		let one = stack;
		if ( stack.qty > 1 ) {
			one = cloneStack( stack );
			one.uid = newUid();
			one.qty = 1;
			stack.qty -= 1;
			if ( w ) use.changed( w );
		} else if ( w ) use.discard( stack );
		else if ( box?.items ) {
			const i = box.items.indexOf( stack );
			if ( i >= 0 ) box.items.splice( i, 1 );
		}
		if ( ! w && box ) { box.dirty = true; g.events.emit( 'container:changed', { container: box } ); }
		g.player.inventory.changed();
		return one;
	}

	add( kind, stack, pos, yaw = 0, data = null, item = null, spec = null ) {
		const g = this.game, K = getPlaceable( kind );
		if ( ! K ) { console.warn( 'placeables: unknown kind', kind ); return null; }
		const p = makeRecord( { kind, item: item || data?.item || stack?.id, stack, pos, yaw, data: data || {}, born: g.time.hours } );
		if ( spec ) p.spec = spec;
		if ( kind === 'barricade' ) this._bars = true;
		p._hours = g.time.hours;
		p._acc = Math.random() * 0.25; // ticks spread over frames, not all at once
		this.list.set( p.id, p );
		if ( ! data ) { try { K.onPlace?.( p, g ); } catch ( e ) { console.error( 'onPlace', kind, e ); } }
		if ( ! p._obj ) this._build( p );
		return p;
	}

	remove( p, { give = true } = {} ) {
		const g = this.game, K = getPlaceable( p.kind );
		if ( ! this.list.has( p.id ) ) return;
		try { K?.onRemove?.( p, g ); } catch ( e ) { console.error( 'onRemove', p.kind, e ); }
		this.list.delete( p.id );
		this._unbuild( p );
		this.light( p, null );
		for ( const k of Object.keys( p._loops || {} ) ) this.stopLoop( p, k );
		if ( this.held === p ) this.release();
		if ( give && p.stack ) this.give( p.stack );
	}

	refresh( p ) { p._ver = ( p._ver || 0 ) + 1; if ( this.list.has( p.id ) ) this._build( p ); }

	near( pos, r, kind = null ) {
		const out = [];
		for ( const p of this.list.values() ) if ( ( ! kind || p.kind === kind ) && ( p.pos.x - pos.x ) ** 2 + ( p.pos.z - pos.z ) ** 2 <= r * r ) out.push( p );
		return out;
	}

	byDoor( key ) {
		for ( const p of this.list.values() ) if ( p.kind === 'barricade' && p.data.door === key ) return p;
		return null;
	}

	doorAhead() { return doorAhead( this.game ); }
	barricadeDoor( stack ) { barricadeDoor( this.game, stack ); }

	// ---- looks ------------------------------------------------------------------------------------------------------

	// the placed model (also the ghost's): the kind's, else the item's own
	buildModel( p ) {
		const K = getPlaceable( p.kind );
		let obj = null;
		try { obj = K?.model?.( p, this.game ) || null; } catch ( e ) { console.error( 'placeable model', p.kind, e ); }
		return obj || itemModel( placedDef( p ) );
	}

	_build( p ) {
		const g = this.game, K = getPlaceable( p.kind );
		this._unbuild( p, true );
		const inner = this.buildModel( p );
		const obj = new THREE.Group();
		obj.add( inner );
		obj.position.set( p.pos.x, p.pos.y, p.pos.z );
		obj.rotation.y = p.yaw;
		obj.userData = { ...inner.userData };
		obj.updateMatrixWorld( true );
		this.group.add( obj );
		p._obj = obj;
		// footprint and pick sphere, from the first look
		if ( ! p._r ) {
			bounds( obj, _box );
			_box.getSize( _size );
			p._r = Math.max( 0.1, Math.max( _size.x, _size.z ) / 2 );
			p._h = _size.y; p._sx = _size.x; p._sz = _size.z;
			p._cy = ( _box.min.y + _box.max.y ) / 2 - p.pos.y;
			p._rr = Math.max( 0.18, Math.min( 1.2, _size.length() / 2 ) );
		}
		obj.visible = this._visible( p );
		if ( obj.userData.glow ) obj.userData.glow.material.opacity = this._glow();
		// big things stand in the way (a barrel, a tent): a box the player and the infected walk round
		const solid = typeof K?.solid === 'function' ? K.solid( p ) : !! K?.solid;
		if ( solid && ! p._box ) {
			const sb = K.solidBox || {};
			const hy = sb.hy ?? p._h / 2, k = sb.k ?? 0.9;
			p._box = g.physics.add( { x: p.pos.x, y: p.pos.y + hy, z: p.pos.z, hx: p._sx / 2 * k, hy, hz: p._sz / 2 * k, yaw: p.yaw, mat: 'wood', kind: 'solid', owner: p } );
		}
		try { K?.show?.( p, g ); } catch ( e ) { console.error( 'placeable show', p.kind, e ); }
	}

	// glows fade out in daylight, where a lit lantern is only its own light
	_glow() { return 0.15 + 0.85 * Math.min( 1, ( this.game.world?.sky?.night ?? 1 ) * 1.4 ); }

	// a lantern's light hardly shows on sunlit ground: outdoors by day its pool light is dimmed (indoors it keeps
	// lighting the room)
	_dim( p ) {
		if ( p._in === undefined ) p._in = !! this.game.world?.isIndoors?.( this.vec( p ) );
		return p._in ? 1 : 0.12 + 0.88 * Math.min( 1, ( this.game.world?.sky?.night ?? 1 ) * 1.6 );
	}

	_unbuild( p, keepBox = false ) {
		if ( p._obj ) {
			this.group.remove( p._obj );
			// glow sprites have their own material (their colour and fade); everything else is shared
			p._obj.traverse( ( o ) => { if ( o.isSprite ) o.material.dispose(); } );
			p._obj = null;
		}
		if ( ! keepBox && p._box ) { this.game.physics.remove( p._box ); p._box = null; }
	}

	_visible( p ) {
		const c = this.game.camera.position;
		const R = ( p._r || 0.2 ) > 0.45 ? VIEW_BIG : VIEW;
		return ( p.pos.x - c.x ) ** 2 + ( p.pos.z - c.z ) ** 2 < R * R;
	}

	vec( p ) { return ( p._v || ( p._v = new THREE.Vector3() ) ).set( p.pos.x, p.pos.y, p.pos.z ); }

	// a light-pool source at the record (spec: { color, intensity, range, flicker, lift }), or none
	light( p, spec ) {
		const pool = this.game.itemLights;
		if ( ! spec ) { if ( p._light ) { pool?.remove( p._light ); p._light = null; } return; }
		if ( ! pool ) return;
		if ( ! p._light ) p._light = pool.add( { pos: new THREE.Vector3(), color: 0xffffff, intensity: 0, range: 8, on: true, priority: 2, lift: 0 } );
		const L = p._light;
		L.pos.set( p.pos.x, p.pos.y, p.pos.z );
		L.color = spec.color; L.intensity = spec.intensity; L.range = spec.range; L.flicker = !! spec.flicker; L.lift = spec.lift ?? 0.2; L.on = true;
		L.dim = this._dim( p );
	}

	// ---- sounds and noise ----------------------------------------------------------------------------------------------

	_ensure( name ) { const a = this.game.audio; if ( a ) ensureSound( a, name ) || ensureItemSound( a, name ); }

	sound( p, name, vol = 0.7, opts = {} ) {
		const a = this.game.audio;
		if ( ! a?.play ) return null;
		this._ensure( name );
		return a.play( name, { pos: this.vec( p ).clone(), vol, ...opts } );
	}

	loop( p, name, vol = 0.6, ref = 4 ) {
		const a = this.game.audio;
		p._loops = p._loops || {};
		if ( p._loops[ name ] || ! a?.loop ) return;
		this._ensure( name );
		p._loops[ name ] = a.loop( name, { pos: this.vec( p ).clone(), vol, ref, bus: 'sfx' } );
	}

	stopLoop( p, name ) {
		const h = p._loops?.[ name ];
		if ( ! h ) return;
		h.stop?.();
		delete p._loops[ name ];
	}

	// the infected come to look (ai/Creatures.js listens)
	noise( p, radius, kind ) {
		this.game.events.emit( 'noise', { pos: this.vec( p ).clone(), radius, source: p, kind } );
	}

	// ---- helpers for the kinds' actions ------------------------------------------------------------------------------

	give( stack ) {
		const g = this.game, inv = g.player.inventory;
		if ( ! stack ) return;
		if ( inv.add( stack ) > 0 ) { g.dropStack( stack ); g.toast( 'No room, dropped', 'warn' ); }
		inv.changed();
	}

	timed( label, time, sound, onDone ) {
		const g = this.game;
		if ( sound ) this._ensure( sound );
		if ( g.actions.busy ) g.actions.cancel();
		return g.actions.start( { label, time, sound, cancelOnMove: true, onDone: () => { try { onDone(); } catch ( e ) { console.error( e ); } g.player.inventory.changed(); } } );
	}

	// "Pick up": the item goes back to you as it was (charge, contents, condition)
	pickUpAction( p, o = {} ) {
		return { label: o.label || 'Pick up', run: () => {
			const why = o.check?.();
			if ( why ) { this.game.toast( why, 'warn' ); return; }
			this.timed( o.label === 'Pack up' ? 'Packing up' : 'Picking up', o.time ?? 1, null, () => {
				if ( ! this.list.has( p.id ) ) return;
				const why2 = o.check?.();
				if ( why2 ) { this.game.toast( why2, 'warn' ); return; }
				o.before?.();
				this.remove( p, { give: true } );
				this.game.audio?.play( 'pickup', { vol: 0.45 } );
			} );
		} };
	}

	// a trap holds the player: no walking until it is pried open
	hold( p ) { this.held = p; this.game.player.vel?.set?.( 0, 0, 0 ); }
	release() { this.held = null; }

	// a trap holding you: no walking (survival.addMoveMod)
	_hookMovement() {
		const S = this.game.survival;
		if ( ! S?.addMoveMod || S._placeablesHold ) return;
		S._placeablesHold = true;
		S.addMoveMod( ( m ) => { if ( this.held ) { m.speed = 0; m.canSprint = false; m.canJump = false; } } );
	}

	// ---- F ----------------------------------------------------------------------------------------------------------------

	provide( ray, maxDist ) {
		const g = this.game;
		if ( this.placer.placing ) { const c = this.placer.candidate(); return c ? [ c ] : null; }
		if ( g.player.vehicle ) return null;
		const out = this._out;
		out.length = 0;
		// caught in a trap: prying it open is the only thing to do
		if ( this.held ) {
			out.push( this._pryC || ( this._pryC = { t: 0.01, id: 'pl:free', label: 'Pry open', sub: 'Caught in a trap', hold: 2.5, noOcclusion: true, action: () => {
				const p = this.held;
				this.release();
				g.survival?.useStamina?.( 20 );
				if ( p ) this.sound( p, 'click', 0.6 );
			} } ) );
			return out;
		}
		if ( ! this.list.size ) return null;
		// a barricaded door: its planks' prompt instead of the door's (from the far side it just won't open)
		const hit = this._bars ? g.physics.raycastBoxes( ray.origin, ray.dir, maxDist ) : null;
		if ( hit?.box?.kind === 'door' && hit.box.owner?.key != null ) {
			const d = hit.box.owner, r = this.byDoor( d.key );
			if ( r ) {
				const c = this._farSide( r, d ) ? this._blockedC( r, d ) : this._candidate( r, 0 );
				if ( c ) { c.t = Math.max( 0, hit.t - 0.02 ); c.ownerBox = hit.box; c.owner = d; c.noOcclusion = true; out.push( c ); }
			}
		}
		let best = null, bt = maxDist;
		const o = ray.origin;
		for ( const p of this.list.values() ) {
			if ( p.kind === 'barricade' || ! p._obj ) continue;
			if ( ( p.pos.x - o.x ) ** 2 + ( p.pos.z - o.z ) ** 2 > 64 ) continue;
			_v.set( p.pos.x, p.pos.y + ( p._cy ?? 0.1 ), p.pos.z );
			const t = raySphere( o, ray.dir, _v, p._rr || 0.25, bt );
			if ( t !== null && t < bt ) { bt = t; best = p; }
		}
		if ( best ) { const c = this._candidate( best, bt ); if ( c ) out.push( c ); }
		return out;
	}

	// the planks are nailed on the other side of the door from the player
	_farSide( r, d ) {
		const pl = this.game.player.pos, c = d.pos || r.pos;
		const nx = r.pos.x - c.x, nz = r.pos.z - c.z;
		if ( nx * nx + nz * nz < 1e-6 ) return false;
		return ( pl.x - c.x ) * nx + ( pl.z - c.z ) * nz < 0;
	}

	_blockedC( r, d ) {
		const g = this.game;
		return r._farC || ( r._farC = { id: 'pl:far:' + r.id, label: 'Open', sub: 'Barricaded', action: () => {
			g.audio?.play( 'door_locked', { pos: d.pos, vol: 0.6 } );
			g.toast( 'Barricaded from the other side', 'warn' );
		} } );
	}

	actionsOf( p ) {
		const K = getPlaceable( p.kind );
		try { return ( K?.actions?.( p, this.game ) || [] ).filter( Boolean ); } catch ( e ) { console.error( 'placeable actions', p.kind, e ); return []; }
	}

	nameOf( p ) {
		const K = getPlaceable( p.kind );
		return K?.label?.( p, this.game ) || ( p.stack ? displayName( p.stack ) : getItem( p.item )?.name ) || 'Thing';
	}

	// the F prompt for a record; rebuilt when its state, your inventory or the quarter second changes (the actions
	// scan the inventory: not every frame while you look at it)
	_candidate( p, t ) {
		const g = this.game, K = getPlaceable( p.kind );
		const key = ( p._ver || 0 ) + ':' + g.player.inventory.version + ':' + Math.floor( this.t * 4 ) + ':' + ( g.actions.busy ? 1 : 0 );
		if ( p._cand && p._candKey === key ) { p._cand.t = t; return p._cand.label ? p._cand : null; }
		p._candKey = key;
		const A = this.actionsOf( p );
		if ( ! A.length ) { p._cand = { label: null }; return null; }
		let state = '';
		try { state = K?.sub?.( p, g ) || ''; } catch ( e ) { console.error( e ); }
		const sub = [ this.nameOf( p ), state ].filter( Boolean ).join( ' · ' );
		const c = { t, id: 'pl:' + p.id, label: A[ 0 ].label, sub, owner: p, ownerBox: p._box || null, plRec: p };
		if ( A.length > 1 ) {
			// tap: the first action; hold: the list
			c.hold = HOLD;
			c.sub = sub + ' · hold for more';
			c.action = () => this.openMenu( p );
			c.plTap = () => this._run( p, this.actionsOf( p )[ 0 ] );
		} else {
			if ( A[ 0 ].hold ) c.hold = A[ 0 ].hold;
			c.action = () => this._run( p, A[ 0 ] );
		}
		p._cand = c;
		return c;
	}

	// run an action; the prompt shows the new state at once
	_run( p, a ) {
		if ( ! a ) return;
		try { a.run(); } finally { p._ver = ( p._ver || 0 ) + 1; }
	}

	openMenu( p ) {
		const A = this.actionsOf( p );
		if ( ! A.length ) return;
		if ( ! openActionMenu( this.game, A.map( a => ( { label: a.label, run: () => this._run( p, a ) } ) ) ) ) this._run( p, A[ 0 ] );
	}

	// a short press on a target with a list: Interact only acts on a full hold, so the tap is ours — F went down on
	// it and came up again before the hold filled (in the same frame too, at a low frame rate)
	_tap( dt ) {
		const g = this.game, T = g.interact?.target, I = g.input;
		if ( ! g.inputActive || g.actions.busy ) { this.tap = null; return; }
		if ( T?.plTap && I.pressed( 'interact' ) ) this.tap = { id: T.id, t: 0 };
		const tp = this.tap;
		if ( ! tp ) return;
		tp.t += dt;
		if ( T?.id !== tp.id || tp.t > HOLD ) this.tap = null;
		else if ( ! I.is( 'interact' ) ) { this.tap = null; g.interact.holdT = 0; T.plTap(); }
	}

	// ---- per frame -----------------------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game;
		this.t += dt;
		tickFlames( this.t );
		this.placer.update( dt );
		this._tap( dt );
		if ( this.held && ( ! this.list.has( this.held.id ) || g.dead || g.mode === 'creative' ) ) this.release();
		const pp = g.player.pos, now = g.time.hours;
		for ( const p of this.list.values() ) {
			const K = KINDS.get( p.kind );
			if ( ! K ) continue;
			const d2 = ( p.pos.x - pp.x ) ** 2 + ( p.pos.z - pp.z ) ** 2;
			if ( K.frame && d2 < FRAME_R * FRAME_R ) { try { K.frame( p, dt, g ); } catch ( e ) { console.error( 'placeable frame', p.kind, e ); } }
			p._acc = ( p._acc || 0 ) + dt;
			if ( p._acc < ( d2 < NEAR * NEAR ? 0.25 : 2 ) ) continue;
			let dh = now - ( p._hours ?? now );
			if ( dh < 0 || dh > 24 * 60 ) dh = 0;
			p._hours = now;
			const rdt = p._acc;
			p._acc = 0;
			if ( K.update ) { try { K.update( p, rdt, g, dh ); } catch ( e ) { console.error( 'placeable update', p.kind, e ); } }
		}
		this.visT -= dt;
		if ( this.visT <= 0 ) {
			this.visT = 0.5;
			const glow = this._glow();
			for ( const p of this.list.values() ) {
				if ( ! p._obj ) continue;
				p._obj.visible = this._visible( p );
				const s = p._obj.userData.glow;
				if ( s ) s.material.opacity = glow;
				if ( p._light ) p._light.dim = this._dim( p );
			}
		}
		// barricades: wrap the doors as their interiors stream in
		this.doorT -= dt;
		if ( this.doorT <= 0 ) { this.doorT = 0.5; this._doors(); }
	}

	_doors() {
		const bars = this._barMap || ( this._barMap = new Map() );
		bars.clear();
		for ( const p of this.list.values() ) if ( p.kind === 'barricade' ) bars.set( p.data.door, p );
		this._bars = bars.size > 0;
		const doors = this.game.city?.doors?.list;
		if ( ! bars.size || ! doors?.size ) return;
		for ( const d of doors ) {
			if ( d._plBarricade ) continue;
			const r = bars.get( d.key );
			if ( ! r ) continue;
			// a door left open or broken in the meantime loses its planks
			if ( d.broken ) { this.remove( r, { give: false } ); continue; }
			wrapDoor( this.game, d );
		}
	}

	// ---- persistence ---------------------------------------------------------------------------------------------------

	serialize( save ) {
		save.world = save.world || {};
		save.world.placeables = [ ...[ ...this.list.values() ].map( serializeRecord ), ...this.orphans ];
	}

	load( save ) {
		for ( const p of [ ...this.list.values() ] ) this.remove( p, { give: false } );
		this.orphans = [];
		const now = this.game.time.hours;
		for ( const o of save.world?.placeables || [] ) {
			if ( ! getPlaceable( o?.k ) ) { if ( o?.k ) this.orphans.push( o ); continue; }
			const p = loadRecord( o );
			if ( ! p ) continue;
			p._hours = now;
			p._acc = Math.random() * 0.25;
			this.list.set( p.id, p );
			this._build( p );
			if ( p.kind === 'barricade' ) this._bars = true;
		}
	}

	// ---- creative / debug spawners (/summon) -------------------------------------------------------------------------

	registerSpawnables() {
		const g = this.game, S = g.spawnables = g.spawnables || {};
		const put = ( id, o = {} ) => ( pos, opts = {} ) => {
			const st = makeStack( id, 1, { full: true } );
			const spec = placeOf( getItem( id ) );
			if ( ! st || ! spec ) return null;
			const p = this.add( o.kind || spec.kind, st, pos, opts.yaw ?? 0, null, null, spec );
			o.then?.( p );
			return p;
		};
		S.alarm_clock = { desc: 'Alarm clock, ringing in 3 s', spawn: put( 'alarm_clock', { then: ( p ) => { p.data.left = 3; } } ) };
		S.radio_playing = { desc: 'Radio, playing', spawn: put( 'radio', { then: ( p ) => { p.data.on = true; this.refresh( p ); } } ) };
		S.rain_barrel = { desc: 'Rain barrel', spawn: put( 'rain_barrel' ) };
		S.tarp_catcher = { desc: 'Tarp rain catcher', spawn: put( 'tarp' ) };
		S.spring_trap = { desc: 'Set spring trap', spawn: put( 'spring_trap' ) };
		S.snare = { desc: 'Set wire snare', spawn: put( 'snare' ) };
		S.lantern_lit = { desc: 'Lit lantern on the ground', spawn: put( 'lantern' ) };
		S.tiki_torch = { desc: 'Lit tiki torch', spawn: put( 'tiki_torch', { then: ( p ) => { p.stack.data.on = true; this.refresh( p ); } } ) };
		S.tent_pitched = { desc: 'Pitched tent', spawn: put( 'tent' ) };
		S.stash_box = { desc: 'Storage tote stash', spawn: put( 'stash_box', { kind: 'stash' } ) };
	}

	dispose() {
		this.offProvider?.();
		this.placer.dispose();
		for ( const p of [ ...this.list.values() ] ) this.remove( p, { give: false } );
		this.game.scene.remove( this.group );
		if ( this.game.placeables === this ) this.game.placeables = null;
	}
}
