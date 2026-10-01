// Placing: a ghost of the thing follows the crosshair on the ground (green where it can go, red with the reason where
// it can't), the wheel or R turns it, the left button or F puts it down (a short timed action), the right button,
// Esc or walking off cancels. While placing, the fire / aim / interact / reload keys and the wheel belong to the
// placer: it reads them first (systems update before the hands) and takes them out of this frame's input.
import * as THREE from 'three';
import { getItem } from '../ItemDB.js';
import { getPlaceable, placeOf, makeRecord, lc } from './registry.js';
import { ghostify, setGhost, addFootprint } from './fx.js';
import { setReactive } from '../../../render/post/Motion.js';

const REACH = 3.4;
const STEP = Math.PI / 12; // 15° a wheel notch
// hf.flagsNear bits: road, street, runway, building
const HARD = 1 | 4 | 8 | 16;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _eye = new THREE.Vector3(), _box = new THREE.Box3();
const _near = [];

export class Placer {
	constructor( mgr ) {
		this.mgr = mgr;
		this.game = mgr.game;
		this.active = null;
	}

	get placing() { return !! this.active; }

	// start placing one unit of a stack. opts: kind (overrides the item's own: 'stash' for any bag), keep (the stack is
	// a tool that makes the thing and stays yours), item (the made thing's id), name (what the prompt calls it), spec
	// (more placement fields: verb, gerund, time, soft, outdoors, water…), hole (a shovel's bare stash hole)
	begin( stack, opts = {} ) {
		const g = this.game, def = getItem( stack?.id );
		if ( ! def ) return false;
		const own = placeOf( def );
		let spec = opts.kind ? { ...( own?.kind === opts.kind ? own : {} ), kind: opts.kind } : own;
		// a hole dug with the shovel: the shovel stays yours
		if ( opts.hole ) spec = { kind: 'stash', hole: true, keep: true, soft: true, verb: 'Dig', gerund: 'Digging', time: 8, item: 'hole', name: 'Stash' };
		if ( spec && ( opts.spec || opts.keep || opts.item ) ) spec = { ...spec, ...( opts.spec || {} ), ...( opts.keep ? { keep: true } : {} ), ...( opts.item ? { item: opts.item } : {} ) };
		const K = spec && getPlaceable( spec.kind );
		if ( ! K ) { g.toast( "Can't place that", 'warn' ); return false; }
		if ( g.player.vehicle || g.player.swimming ) { g.toast( 'Not here', 'warn' ); return false; }
		this.cancel();
		// a stack in the container on screen (a shelf, a car's trunk): remembered, as closing the screen forgets it
		const w = g.itemUse?.where?.( stack );
		const box = w?.kind === 'other' ? w.container : null;
		g.app?.ui?.closeScreen?.();
		const p = makeRecord( { kind: spec.kind, item: spec.keep && spec.item && getItem( spec.item ) ? spec.item : def.id, stack, pos: g.player.pos, yaw: g.player.yaw, data: {} } );
		p.spec = spec;
		p.preview = true;
		// translucent and following the view: the TAA mustn't smear it
		const obj = setReactive( ghostify( this.mgr.buildModel( p ), false ), 0.8 );
		obj.updateMatrixWorld( true );
		_box.setFromObject( obj );
		const size = _box.getSize( new THREE.Vector3() );
		const r = Math.max( 0.12, Math.max( size.x, size.z ) * 0.5 );
		addFootprint( obj, r );
		this.game.scene.add( obj );
		this.active = {
			stack, def, spec, K, p, obj, box, yawOff: 0, ok: false, reason: '', t: 0, locked: false, floor: null,
			r, h: Math.max( 0.05, size.y ),
			pos: new THREE.Vector3(), yaw: 0, name: opts.name || spec.name || ( spec.keep && getItem( spec.item )?.name ) || def.name, verb: spec.verb || opts.verb || this.mgr.verbOf( spec ),
		};
		return true;
	}

	cancel() {
		const A = this.active;
		if ( ! A ) return;
		this.active = null;
		this.game.scene.remove( A.obj );
		if ( A.locked && this.game.actions.current?.placing ) this.game.actions.cancel();
	}

	// the prompt while placing (the HUD shows the interact key with it)
	candidate() {
		const A = this.active;
		if ( ! A || A.locked ) return null;
		const c = A.cand || ( A.cand = { t: 0, id: 'pl:ghost', label: `${A.verb} ${lc( A.name )}`, sub: '', noOcclusion: true, action: () => {} } );
		c.sub = A.ok ? `Wheel to turn · ${this.game.input.label?.( 'aim' ) || 'RMB'} to cancel` : A.reason;
		return c;
	}

	update( dt ) {
		const A = this.active;
		if ( ! A ) return;
		const g = this.game, I = g.input, p = g.player;
		A.t += dt;
		// gone from the inventory, in a car, in the sea, dead, or a menu opened (Esc pauses): stop
		const ui = g.app?.ui;
		if ( g.dead || p.vehicle || p.swimming || ! this.mgr._has( A.stack, A.box ) || ( A.t > 0.3 && ( g.paused || ui?.screen ) ) ) { this.cancel(); return; }
		if ( A.locked ) return; // the placing action is running
		if ( ! g.inputActive ) return;
		const fire = I.pressed( 'fire' ), aim = I.pressed( 'aim' ), use = I.pressed( 'interact' ), turn = I.pressed( 'reload' );
		const wheel = I.consumeWheel();
		this._swallow( I );
		if ( aim ) { this.cancel(); return; }
		if ( wheel ) A.yawOff += Math.sign( wheel ) * STEP;
		if ( turn ) A.yawOff += STEP * 2;
		this._spot( A );
		A.obj.position.copy( A.pos );
		A.obj.rotation.y = A.yaw;
		setGhost( A.obj, A.ok );
		if ( ( fire || use ) && A.t > 0.15 ) {
			if ( A.ok ) this._commit( A );
			else { g.toast( A.reason, 'warn' ); g.audio?.ui?.( 'ui_deny', 0.5 ); }
		}
	}

	// the keys this frame belongs to the placer, not the hands or the F prompt
	_swallow( I ) {
		for ( const a of [ 'fire', 'aim', 'interact', 'reload' ] ) for ( const c of I.codes( a ) ) { I.pressedQ.delete( c ); if ( a === 'fire' || a === 'aim' ) I.down.delete( c ); }
		I.wheel = 0;
	}

	// where the crosshair meets the ground (or a floor, a table), within reach and clear of the player
	_spot( A ) {
		const g = this.game, P = g.physics, pl = g.player, cam = g.camera;
		_d.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		const hit = P.raycast( cam.position, _d, 9, { water: true } );
		const minD = A.r + 0.35, maxD = 2.6 + A.r * 0.5;
		// along the view, on the ground: a point past reach comes back to it, one short of a wall stops before it
		let dist, y;
		const hd = Math.hypot( _d.x, _d.z ) || 1e-6, hx = _d.x / hd, hz = _d.z / hd;
		if ( hit && ( hit.kind !== 'box' || hit.normal.y > 0.6 ) ) { dist = Math.hypot( hit.point.x - pl.pos.x, hit.point.z - pl.pos.z ); y = hit.point.y; }
		else if ( hit ) { dist = Math.hypot( hit.point.x - pl.pos.x, hit.point.z - pl.pos.z ) - A.r - 0.15; y = pl.pos.y + 0.5; }
		else { dist = maxD; y = pl.pos.y + 0.5; }
		if ( dist > maxD || dist < minD ) y = pl.pos.y + 0.5;
		dist = Math.max( minD, Math.min( maxD, dist ) );
		const x = pl.pos.x + hx * dist, z = pl.pos.z + hz * dist;
		const gr = P.ground( x, z, Math.max( y, pl.pos.y ) + 0.3, 0.8, 0 );
		A.pos.set( x, gr.y, z );
		A.yaw = pl.yaw + A.yawOff;
		A.floor = gr.box;
		A.reason = this.check( A, gr.box, hit ) || '';
		A.ok = ! A.reason;
	}

	// why it can't go there, or null
	check( A, floorBox, hit ) {
		const g = this.game, P = g.physics, pl = g.player, hf = g.hf, pos = A.pos, K = A.K, spec = A.spec;
		if ( Math.hypot( pos.x - pl.pos.x, pos.z - pl.pos.z ) > REACH + A.r || Math.abs( pos.y - pl.pos.y ) > 1.3 ) return 'Too far';
		// water: no, unless the kind wants it (water: true allows it, 'only' needs it: a fish trap in the shallows)
		const wet = hit?.kind === 'water' || pos.y < P.waterLevel( pos.x, pos.z ) - 0.02, W = spec.water ?? K.water;
		if ( wet && ! W ) return 'In water';
		if ( ! wet && W === 'only' ) return 'Needs water';
		const indoors = !! g.world.isIndoors?.( pos );
		if ( ( K.outdoors || spec.outdoors ) && indoors ) return K.kind === 'collector' ? 'Needs open sky' : 'Outdoors only';
		if ( K.soft || spec.soft ) {
			if ( floorBox || indoors || ( hf.flagsNear?.( pos.x, pos.z ) & HARD ) ) return 'Needs soft ground';
		}
		if ( ! floorBox ) {
			hf.normalAt( pos.x, pos.z, _n, 1 );
			if ( _n.y < ( A.r > 0.5 ? 0.9 : 0.8 ) ) return 'Too steep';
		}
		// walls, furniture, trunks: nothing standing inside the footprint
		const r = A.r * 0.85;
		for ( const b of P.near( pos.x, pos.z, r, _near ) ) {
			if ( b === floorBox || b.maxY <= pos.y + 0.1 || b.minY >= pos.y + A.h ) continue;
			const ox = pos.x - b.x, oz = pos.z - b.z;
			const u = ox * b.c - oz * b.s, v = ox * b.s + oz * b.c;
			const cu = Math.max( - b.hx, Math.min( b.hx, u ) ), cv = Math.max( - b.hz, Math.min( b.hz, v ) );
			if ( ( u - cu ) ** 2 + ( v - cv ) ** 2 < r * r ) return 'Blocked';
		}
		for ( const q of this.mgr.list.values() ) {
			if ( q.kind === 'barricade' ) continue;
			const rr = ( A.r + ( q._r || 0.2 ) ) * 0.7;
			if ( ( q.pos.x - pos.x ) ** 2 + ( q.pos.z - pos.z ) ** 2 < rr * rr && Math.abs( q.pos.y - pos.y ) < 1.5 ) return 'Too close';
		}
		_eye.set( pl.pos.x, pl.eye, pl.pos.z );
		_v.set( pos.x, pos.y + Math.min( 0.3, A.h ), pos.z );
		if ( ! P.lineOfSight( _eye, _v ) ) return 'Blocked';
		try { const why = K.check?.( pos, g, spec, A ); if ( why ) return why; } catch ( e ) { console.error( e ); }
		return null;
	}

	_commit( A ) {
		const g = this.game, pl = A.K.place || {};
		A.locked = true;
		const time = A.spec.time ?? pl.time ?? 1.5;
		const act = g.actions.start( {
			label: `${A.spec.gerund || pl.gerund || 'Placing'} ${lc( A.name )}`, time, sound: A.spec.sound ?? pl.sound ?? null, cancelOnMove: true,
			onDone: () => {
				if ( this.active !== A ) return;
				this.cancel();
				this.mgr.placeFrom( A.stack, A.spec, A.pos, A.yaw, A.box );
			},
			onCancel: () => { if ( this.active === A ) A.locked = false; },
		} );
		act.placing = true;
	}

	dispose() { this.cancel(); }
}
