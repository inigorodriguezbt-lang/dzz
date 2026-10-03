// Items lying in the world (game.items3d): what players drop, loot on shelves and floors, coconuts shaken from
// a palm, a fish landed on the beach. Each is a light entity (type 'item', `.stack`, a stable `.id`); they are
// drawn instanced per item id within ~55 m of the camera (shadows only near), settle onto the ground or the
// furniture under them, highlight when you look at one, and are taken with F. Persistent ones (everything the
// player drops, anything spawned with `persistent`) are saved in save.world.items.
//
//   drop( stack, pos )                          a player drop: falls from hand height, persistent
//   spawn( stack, pos, { yaw, key, persistent, settle } ) -> WorldItem
//   remove( item, { taken, stack } )            taken: fires the taken listeners like an F pickup (with `stack`,
//                                               what was taken, when the item's own stack has already changed)
//   claim( item ) -> WorldItem                  the player used it where it lies: its loot spot counts as looted and
//                                               it is saved like a drop (a streamed loot item is swapped for a twin)
//   near( pos, r ) -> [ WorldItem ]              nearest first
//   addTakenListener( fn( item, stack ) ) -> unsubscribe
//
// install( game ) also sets up game.itemUse, game.crafting, fishing and gathering, and registers every item def.
import * as THREE from 'three';
import './defs/index.js';
import { getItem, displayName, condLabel, ammoOf, stackWeight } from './ItemDB.js';
import { lookKey, lookDef } from './ext/gear/logic.js';
import { Entity, raySphere } from '../Entities.js';
import { modelInfo, instanceParts, onModelBuilder } from '../../render/ItemModels.js';
import { rollLoot } from './Loot.js';
import { liquidName } from './util.js';
import { setIconRenderer } from '../../render/Icons.js';
import { setReactive } from '../../render/post/Motion.js';
import { LightPool } from './LightPool.js';
import { ItemUse } from './ItemUse.js';
import { Crafting } from '../Crafting.js';
import { Fishing } from './Fishing.js';
import { Gathering } from './Gathering.js';
import { startSystems } from './hooks.js';

const CELL = 16;
const DRAW_R = 55; // instanced drawing range (m) of the biggest items; small ones stop sooner (drawRange)
const SHADOW_R = 24; // item batches with an instance this close cast shadows
const SHADOW_MIN = 0.05; // (m radius) smaller things cast no shadow worth a draw call
// a ring or a battery is invisible long before a backpack is: draw range by model size
export const drawRange = ( radius ) => Math.min( DRAW_R, Math.max( 10, radius * 350 ) );
const MAX_SAVED = 4000;
const hkey = ( i, j ) => ( i + 32768 ) * 65536 + ( j + 32768 );

// ---- the entity ------------------------------------------------------------------------------------------------

export class WorldItem extends Entity {
	constructor( game, mgr, stack, pos, opts = {} ) {
		super( game, 'item' );
		this.mgr = mgr;
		this.stack = stack;
		this.pos.copy( pos );
		this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
		this.key = opts.key ?? null;
		this.persistent = !! opts.persistent;
		this.noHit = true; // bullets pass through
		this.radius = 0.2; this.height = 0.2;
		this.quat = new THREE.Quaternion().setFromAxisAngle( _Y, this.yaw );
		this.vy = 0;
		this.falling = false;
		this.spin = null; // tumble while falling (axis, rad/s)
		this.noAuto = !! opts.noAuto; // just dropped: no auto-pickup until the player walks away
		this.quiet = !! opts.quiet; // lands without a sound (all but one of a loot pile)
		this.cellKey = null;
	}
	get def() { return getItem( this.stack.id ); }
	// the model's bounding sphere centre in the world
	centre( out ) {
		const info = this.mgr.info( lookKey( this.stack ) );
		return out.copy( info.centre ).applyQuaternion( this.quat ).add( this.pos );
	}
	update( dt ) {
		if ( ! this.falling ) return;
		const P = this.game.physics;
		const water = P.waterLevel( this.pos.x, this.pos.z );
		const inWater = this.pos.y < water;
		this.vy = inWater ? Math.max( this.vy - 4 * dt, - 0.8 ) : this.vy - 18 * dt;
		const ny = this.pos.y + this.vy * dt;
		// into the sea: a splash (plop for small things), then it sinks slowly
		if ( ! inWater && ny < water && this.mgr.game.audio && ! this.quiet ) this.mgr._waterSound( this );
		const floor = this.mgr.floor( this.pos.x, this.pos.z, this.pos.y + 0.02, 0.05 );
		if ( ny <= floor.y ) {
			this.pos.y = floor.y;
			this.falling = false;
			this.vy = 0;
			this.spin = null;
			this.mgr._rest( this, floor.box );
			if ( ! inWater && this.mgr.game.audio && ! this.quiet ) this.mgr._landSound( this );
			this.quiet = false;
		} else {
			this.pos.y = ny;
			// a little tumble on the way down (it settles flat on landing); slower under water
			if ( this.spin ) this.quat.premultiply( _q.setFromAxisAngle( this.spin.axis, this.spin.rate * dt * ( inWater ? 0.3 : 1 ) ) );
		}
		this.mgr.dirty = true;
	}
}
const _Y = new THREE.Vector3( 0, 1, 0 );
const _q = new THREE.Quaternion();

// ---- the manager ---------------------------------------------------------------------------------------------

export class WorldItems {
	constructor( game ) {
		this.game = game;
		this.items = new Set();
		this.hash = new Map();
		this.batches = new Map(); // item id -> { parts, meshes: [ InstancedMesh ], cap, used }
		this.infos = new Map();
		this.dirty = true;
		this.lastCam = new THREE.Vector3( 1e9, 0, 0 );
		this.rebuildT = 0;
		this.takenListeners = new Set();
		this.group = new THREE.Group();
		this.group.name = 'world-items';
		game.scene.add( this.group );
		this.hlT = 0;
		this.hl = this._makeHighlight();
		this._near = [];
		this._c = new THREE.Vector3();
		this._m = new THREE.Matrix4();
		this._s = new THREE.Vector3( 1, 1, 1 );
		this.autoT = 0;
		this.buildBudget = 0;
		this.offBuilder = onModelBuilder( ( type, stale ) => { for ( const id of stale ) this._dropBatch( id ); this.infos.clear(); this.dirty = true; } );
		this.offProvider = game.interact.addProvider( ( ray, maxDist ) => this.provide( ray, maxDist ) );
	}

	// ---- API ----------------------------------------------------------------------------------------------

	spawn( stack, pos, opts = {} ) {
		if ( ! stack || ! getItem( stack.id ) ) return null;
		const it = new WorldItem( this.game, this, stack, pos, opts );
		// settle onto what is under it: always for drops, only small gaps for placed loot (a shelf that is
		// not a physics box should not drop its cans to the floor)
		const floor = this.floor( pos.x, pos.z, pos.y + 0.05, 0.1 );
		const gap = pos.y - floor.y;
		const settle = opts.settle ?? ( gap < 0.6 );
		if ( gap < - 0.05 ) { it.pos.y = floor.y; this._rest( it, floor.box ); } // inside the ground: pop up
		else if ( settle && gap > 0.01 ) {
			it.falling = true;
			if ( gap > 0.3 ) it.spin = { axis: new THREE.Vector3( Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5 ).normalize(), rate: 3 + Math.random() * 5 };
		} else this._rest( it, floor.box, gap > 0.01 );
		this.items.add( it );
		this._hashAdd( it );
		this.game.entities.add( it );
		this.dirty = true;
		return it;
	}

	// what an item rests on at (x, z) below y: a physics box (a shelf, a table, a sidewalk once its collider is in),
	// else the terrain, raised to the paved surface drawn over it (a road, a lot, a sidewalk: Sites.lift), so a flat
	// thing dropped in the street lies on the asphalt rather than under it -> { y, box }
	floor( x, z, y, step ) {
		const f = this.game.physics.ground( x, z, y, step, 0 );
		if ( ! f.box ) f.y += this.game.sites?.lift?.( x, z ) || 0;
		return f;
	}

	drop( stack, pos ) {
		const g = this.game, p = g.player;
		const at = new THREE.Vector3().copy( pos || p.pos );
		// don't push items through a wall in front of you: fall back to your feet
		const eye = new THREE.Vector3( p.pos.x, p.eye, p.pos.z );
		const to = new THREE.Vector3( at.x, eye.y, at.z ).sub( eye );
		const len = to.length();
		if ( len > 0.01 ) {
			to.divideScalar( len );
			const hit = g.physics.raycastBoxes( eye, to, len + 0.25 );
			if ( hit ) at.set( p.pos.x + to.x * Math.max( 0, hit.t - 0.35 ), at.y, p.pos.z + to.z * Math.max( 0, hit.t - 0.35 ) );
		}
		// scatter repeated drops a little so a pile stays pickable
		at.x += ( Math.random() - 0.5 ) * 0.25; at.z += ( Math.random() - 0.5 ) * 0.25;
		at.y = Math.max( at.y, p.pos.y ) + 0.9;
		const it = this.spawn( stack, at, { persistent: true, settle: true, noAuto: true } );
		if ( it ) {
			g.audio?.play( 'drop', { pos: at, vol: 0.4 } );
			g.events.emit( 'item:drop', { stack } );
		}
		return it;
	}

	remove( item, { taken = false, stack = null } = {} ) {
		// a claimed item lives on as its twin: a pickup from a screen still holding the old one takes the twin (a
		// plain remove, like a building clearing its streamed loot, must not)
		while ( taken && item?.replacedBy && ! this.items.has( item ) ) item = item.replacedBy;
		if ( ! item || ! this.items.has( item ) ) return false;
		this.items.delete( item );
		this._hashRemove( item );
		this.game.entities.remove( item );
		this.dirty = true;
		if ( taken ) for ( const fn of [ ...this.takenListeners ] ) { try { fn( item, stack || item.stack ); } catch ( e ) { console.error( e ); } }
		return true;
	}

	// the player used an item where it lies (ate from it, opened it, took part of it): its loot spot counts as looted
	// and it is saved like a drop. A building drops its streamed loot with the storey, so that item is swapped for a
	// persistent twin holding the same stack.
	claim( item ) {
		if ( ! item || ! this.items.has( item ) || item.persistent ) return item;
		if ( item.key == null ) { item.persistent = true; return item; }
		this.remove( item, { taken: true } );
		const twin = this.spawn( item.stack, item.pos, { yaw: item.yaw, persistent: true, settle: false, noAuto: item.noAuto } );
		if ( twin ) { twin.quat.copy( item.quat ); item.replacedBy = twin; }
		return twin;
	}

	near( pos, r ) {
		const out = [];
		const r2 = r * r;
		for ( let i = Math.floor( ( pos.x - r ) / CELL ); i <= Math.floor( ( pos.x + r ) / CELL ); i ++ ) {
			for ( let j = Math.floor( ( pos.z - r ) / CELL ); j <= Math.floor( ( pos.z + r ) / CELL ); j ++ ) {
				const a = this.hash.get( hkey( i, j ) );
				if ( ! a ) continue;
				for ( const it of a ) {
					const dx = it.pos.x - pos.x, dy = it.pos.y - pos.y, dz = it.pos.z - pos.z;
					const d2 = dx * dx + dz * dz;
					if ( d2 <= r2 && Math.abs( dy ) < Math.max( 2.2, r ) ) { it._d2 = d2 + dy * dy * 0.25; out.push( it ); }
				}
			}
		}
		return out.sort( ( a, b ) => a._d2 - b._d2 );
	}

	addTakenListener( fn ) { this.takenListeners.add( fn ); return () => this.takenListeners.delete( fn ); }

	// roll a loot table onto the ground around a point (debug /summon loot, corpses without a container UI)
	spawnLoot( table, pos, rnd = Math.random, opts = {} ) {
		const out = [];
		const stacks = rollLoot( table, rnd );
		stacks.forEach( ( s, i ) => {
			const a = i * 2.4 + rnd() * 0.5, r = 0.15 + Math.sqrt( i ) * 0.28;
			// one landing sound for the pile, not one per stack in the same frame
			const it = this.spawn( s, new THREE.Vector3( pos.x + Math.cos( a ) * r, pos.y + 0.3, pos.z + Math.sin( a ) * r ), { persistent: opts.persistent ?? true, settle: true, quiet: i > 0 } );
			if ( it ) out.push( it );
		} );
		return out;
	}

	// the world item holding a stack (ItemUse consumes food eaten off the ground)
	byStack( stack ) {
		for ( const it of this.near( this.game.player.pos, 6 ) ) if ( it.stack === stack ) return it;
		for ( const it of this.items ) if ( it.stack === stack ) return it;
		return null;
	}

	// the stack changed identity in place (a coconut cracked open): redraw it
	refresh( item ) { this.infos.delete( lookKey( item.stack ) ); this.dirty = true; }

	// F: take it
	take( item ) {
		while ( item?.replacedBy && ! this.items.has( item ) ) item = item.replacedBy;
		const g = this.game, inv = g.player.inventory, s = item?.stack;
		if ( ! item || ! this.items.has( item ) ) return;
		const before = s.qty;
		// what was picked up: a stack that tops up one you carry is left at qty 0 by the merge
		const picked = { ...s, qty: before };
		const left = inv.add( s );
		if ( left <= 0 ) {
			this.remove( item, { taken: true, stack: picked } );
			g.audio?.play( 'pickup', { vol: 0.5 } );
			g.events.emit( 'item:pick', { stack: picked } );
		} else if ( left < before ) {
			// part of a stack fitted: the rest stays, but the loot spot is spent
			g.audio?.play( 'pickup', { vol: 0.4 } );
			g.events.emit( 'item:pick', { stack: { ...s, qty: before - left } } );
			g.toast( 'Not enough room', 'warn' );
			this.claim( item );
			this.dirty = true;
		} else {
			g.toast( 'Not enough room', 'warn' );
		}
		inv.changed();
	}

	info( id ) {
		let i = this.infos.get( id );
		if ( ! i ) { i = modelInfo( lookDef( id ) ); this.infos.set( id, i ); }
		return i;
	}

	// ---- interaction -------------------------------------------------------------------------------------

	provide( ray, maxDist ) {
		const g = this.game;
		if ( g.player.vehicle ) return null;
		let best = null, bt = maxDist;
		const c = this._c;
		for ( const it of this.near( ray.origin, maxDist + 1 ) ) {
			if ( it.falling ) continue;
			const info = this.info( lookKey( it.stack ) );
			it.centre( c );
			// generous spheres for tiny things (a ring, a battery) so they are not pixel hunts
			const r = Math.max( 0.13, Math.min( info.radius * 0.85, 0.9 ) );
			const t = raySphere( ray.origin, ray.dir, c, r, bt );
			if ( t !== null && t < bt ) { bt = t; best = it; }
		}
		if ( ! best ) return null;
		const s = best.stack, d = getItem( s.id );
		const qty = s.qty > 1 ? ` ×${s.qty}` : '';
		const sub = [];
		const am = ammoOf( s );
		if ( am !== null && d.cat !== 'ammo' ) sub.push( `${am} rds` );
		if ( d.tool?.liquid && s.data.liquid ) sub.push( `${( s.data.amount || 0 ).toFixed( 1 )} L ${liquidName( s.data.liquid )}` );
		if ( d.fuel ) sub.push( `${( s.data.amount || 0 ).toFixed( 1 )} L` );
		if ( [ 'firearm', 'melee', 'clothing', 'backpack', 'tool' ].includes( d.cat ) && s.cond < 0.85 ) sub.push( condLabel( s.cond ) );
		sub.push( stackWeight( s ).toFixed( stackWeight( s ) < 1 ? 2 : 1 ) + ' kg' );
		return [ { t: bt, id: 'item:' + best.id, label: `Take ${displayName( s )}${qty}`, sub: sub.join( ' · ' ), icon: lookKey( s ), action: () => this.take( best ), owner: best } ];
	}

	// ---- per frame -----------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game;
		this.buildBudget = 6; // ms of model building per frame (new item types appearing)
		const cam = g.camera.position;
		this.rebuildT -= dt;
		if ( this.dirty || this.rebuildT <= 0 || cam.distanceToSquared( this.lastCam ) > 16 ) this._rebuild();
		this._highlight( dt );
		this._autoPickup( dt );
	}

	_rebuild() {
		const g = this.game, cam = g.camera.position;
		this.dirty = false;
		this.rebuildT = 0.75;
		this.lastCam.copy( cam );
		const near = this.near( cam, DRAW_R );
		const groups = new Map();
		for ( const it of near ) {
			const key = lookKey( it.stack );
			let a = groups.get( key );
			if ( ! a ) { a = []; groups.set( key, a ); }
			a.push( it );
		}
		for ( const b of this.batches.values() ) b.used = false;
		const t0 = performance.now();
		for ( const [ id, all ] of groups ) {
			let b = this.batches.get( id );
			if ( ! b ) {
				// building a new model costs a few ms (canvas labels): spread new types over frames
				if ( performance.now() - t0 > this.buildBudget ) { this.dirty = true; continue; }
				b = this._makeBatch( id );
				if ( ! b ) continue;
			}
			// small things drop out sooner (they are sub-pixel long before 55 m)
			const info = this.info( id );
			const R = drawRange( info.radius ), R2 = R * R;
			const list = R >= DRAW_R ? all : all.filter( it => it._d2 <= R2 );
			if ( ! list.length ) continue;
			b.used = true;
			b.idle = 0;
			if ( list.length > b.cap ) this._grow( b, list.length );
			let nearest = Infinity;
			for ( let k = 0; k < list.length; k ++ ) {
				const it = list[ k ];
				this._m.compose( it.pos, it.quat, this._s );
				for ( const m of b.meshes ) m.setMatrixAt( k, this._m );
				nearest = Math.min( nearest, it._d2 );
			}
			const shadow = info.radius > SHADOW_MIN && nearest < SHADOW_R * SHADOW_R;
			// (instances have no previous matrices: while one falls the TAA drops the history under the batch)
			const falling = list.some( it => it.falling );
			for ( const m of b.meshes ) {
				setReactive( m, falling ? 1 : 0 );
				m.count = list.length;
				m.instanceMatrix.needsUpdate = true;
				m.boundingSphere = null; // recomputed from the instances for culling
				m.visible = true;
				m.castShadow = m.userData.shadow && shadow;
			}
		}
		for ( const [ id, b ] of this.batches ) {
			if ( b.used ) continue;
			for ( const m of b.meshes ) { m.visible = false; m.count = 0; }
			// forget batches nobody has seen for a while
			if ( ++ b.idle > 160 ) this._dropBatch( id );
		}
	}

	_makeBatch( id ) {
		const def = lookDef( id );
		if ( ! def ) return null;
		let parts;
		try { parts = instanceParts( def ); } catch ( e ) { console.error( 'item model', id, e ); return null; }
		const b = { id, parts, meshes: [], cap: 0, used: false, idle: 0 };
		this._grow( b, 4 );
		this.batches.set( id, b );
		return b;
	}

	_grow( b, n ) {
		let cap = Math.max( 4, b.cap );
		while ( cap < n ) cap *= 2;
		for ( const m of b.meshes ) { this.group.remove( m ); m.dispose(); }
		b.meshes = b.parts.map( p => {
			const m = new THREE.InstancedMesh( p.geometry, p.material, cap );
			m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
			m.layers.set( p.layer );
			m.userData.shadow = p.castShadow;
			m.receiveShadow = true;
			m.frustumCulled = true;
			m.count = 0;
			m.name = 'item:' + b.id;
			this.group.add( m );
			return m;
		} );
		b.cap = cap;
	}

	_dropBatch( id ) {
		const b = this.batches.get( id );
		if ( ! b ) return;
		for ( const m of b.meshes ) { this.group.remove( m ); m.dispose(); }
		this.batches.delete( id );
		this.dirty = true;
	}

	// orientation at rest: its yaw, tilted to the slope when it lies on terrain (not on furniture)
	_rest( it, box, keepY = false ) {
		const g = this.game;
		it.quat.setFromAxisAngle( _Y, it.yaw );
		if ( ! box && ! keepY ) {
			const n = g.hf.normalAt( it.pos.x, it.pos.z, this._c, 0.5 );
			if ( n.y > 0.6 && n.y < 0.9995 ) {
				const tilt = new THREE.Quaternion().setFromUnitVectors( _Y, n );
				it.quat.premultiply( tilt );
			}
		}
		this._hashRemove( it );
		this._hashAdd( it );
	}

	_waterSound( it ) {
		const d = getItem( it.stack.id );
		const w = d.weight * it.stack.qty;
		this.game.audio.play( w > 1.5 ? 'splash' : 'plop', { pos: it.pos, vol: Math.min( 0.6, 0.2 + w * 0.08 ), rate: w > 1.5 ? 1.3 : 1.1, max: 40 } );
	}

	_landSound( it ) {
		const d = getItem( it.stack.id );
		const heavy = d.weight * it.stack.qty > 2;
		const metal = [ 'firearm', 'magazine', 'ammo', 'melee' ].includes( d.cat ) || d.tool?.metal || /can|tin|pot|toolbox|jerrycan/.test( d.model?.type || '' );
		const snd = metal ? 'hit_metal' : heavy ? 'hit_wood' : 'drop';
		this.game.audio.play( snd, { pos: it.pos, vol: metal ? 0.25 : 0.35, rate: heavy ? 0.8 : 1.2, max: 30 } );
	}

	// ---- hover highlight: an inverted hull drawn just outside the silhouette ----------------------------------

	_makeHighlight() {
		const mat = new THREE.MeshBasicMaterial( { color: 0xbff4ff, side: THREE.BackSide, transparent: true, opacity: 0.6, depthWrite: false, fog: false } );
		const grp = new THREE.Group();
		grp.visible = false;
		grp.renderOrder = 5;
		this.game.scene.add( grp );
		return { grp, mat, id: null };
	}

	_highlight( dt ) {
		const H = this.hl, it = this.game.interact.target?.owner instanceof WorldItem ? this.game.interact.target.owner : null;
		if ( ! it || ! this.items.has( it ) ) { H.grp.visible = false; return; }
		const key = lookKey( it.stack );
		if ( H.id !== key ) {
			H.grp.clear();
			for ( const p of instanceParts( lookDef( key ) ) ) {
				const m = new THREE.Mesh( p.geometry, H.mat );
				m.layers.set( 1 );
				m.frustumCulled = false;
				H.grp.add( m );
			}
			H.id = key;
		}
		const info = this.info( key );
		// scale about the model centre by about a centimetre, whatever the size
		const k = 1 + 0.012 / Math.max( 0.05, info.radius );
		for ( const m of H.grp.children ) m.position.copy( info.centre ).multiplyScalar( - 1 );
		H.grp.position.copy( info.centre ).applyQuaternion( it.quat ).add( it.pos );
		H.grp.quaternion.copy( it.quat );
		H.grp.scale.setScalar( k );
		this.hlT += dt;
		H.mat.opacity = 0.45 + Math.sin( this.hlT * 5 ) * 0.15;
		H.grp.visible = true;
	}

	// ---- auto pickup of loose ammo ----------------------------------------------------------------------------

	_autoPickup( dt ) {
		const g = this.game, p = g.player;
		this.autoT -= dt;
		if ( this.autoT > 0 ) return;
		this.autoT = 0.2;
		if ( ! g.inputActive || p.vehicle || g.dead ) return;
		const want = g.settings.get( 'autoPickupAmmo' ) !== false;
		for ( const it of this.near( p.pos, 2.8 ) ) {
			const dxz = Math.hypot( it.pos.x - p.pos.x, it.pos.z - p.pos.z );
			// dropped items become eligible once you have stepped away from them
			if ( it.noAuto ) { if ( dxz > 2.5 ) it.noAuto = false; continue; }
			if ( ! want || it.falling || dxz > 0.9 || Math.abs( it.pos.y - p.pos.y ) > 1.2 ) continue;
			const d = getItem( it.stack.id );
			if ( d?.cat !== 'ammo' ) continue;
			const before = it.stack.qty;
			const left = p.inventory.add( it.stack, { autoEquip: false } );
			if ( left >= before ) continue;
			const picked = { ...it.stack, qty: before - left };
			g.events.emit( 'item:pick', { stack: picked } );
			g.audio?.play( 'pickup', { vol: 0.35 } );
			if ( left <= 0 ) this.remove( it, { taken: true, stack: picked } );
			else this.claim( it );
			p.inventory.changed();
		}
	}

	// ---- spatial hash -----------------------------------------------------------------------------------------

	_hashAdd( it ) {
		// never twice (spawn rests an item, which re-hashes it, before adding it): a stale entry would outlive remove()
		// and keep a taken item drawn and hoverable
		if ( it.cellKey !== null ) this._hashRemove( it );
		const k = hkey( Math.floor( it.pos.x / CELL ), Math.floor( it.pos.z / CELL ) );
		let a = this.hash.get( k );
		if ( ! a ) { a = []; this.hash.set( k, a ); }
		a.push( it );
		it.cellKey = k;
	}
	_hashRemove( it ) {
		if ( it.cellKey === null ) return;
		const a = this.hash.get( it.cellKey );
		if ( a ) { const i = a.indexOf( it ); if ( i >= 0 ) a.splice( i, 1 ); if ( ! a.length ) this.hash.delete( it.cellKey ); }
		it.cellKey = null;
	}

	// ---- persistence -------------------------------------------------------------------------------------------

	serialize( save ) {
		save.world = save.world || {};
		const list = [];
		for ( const it of this.items ) {
			if ( ! it.persistent ) continue;
			const r = ( v ) => Math.round( v * 100 ) / 100;
			list.push( { s: it.stack, p: [ r( it.pos.x ), r( it.pos.y ), r( it.pos.z ) ], y: r( it.yaw ), k: it.key ?? undefined } );
		}
		// the newest drops win when the world gets cluttered
		save.world.items = list.length > MAX_SAVED ? list.slice( list.length - MAX_SAVED ) : list;
	}

	load( save ) {
		const list = save.world?.items;
		if ( ! Array.isArray( list ) ) return;
		const v = new THREE.Vector3();
		for ( const e of list ) {
			if ( ! e?.s || ! getItem( e.s.id ) || ! Array.isArray( e.p ) ) continue;
			v.set( e.p[ 0 ], e.p[ 1 ], e.p[ 2 ] );
			this.spawn( e.s, v, { yaw: e.y, key: e.k ?? null, persistent: true, settle: false } );
		}
	}

	dispose() {
		this.offProvider?.();
		this.offBuilder?.();
		for ( const it of this.items ) this.game.entities.remove( it );
		this.items.clear(); this.hash.clear();
		for ( const id of [ ...this.batches.keys() ] ) this._dropBatch( id );
		this.game.scene.remove( this.group, this.hl.grp );
		this.hl.mat.dispose();
	}
}

// ---- module install ---------------------------------------------------------------------------------------------

export function install( game ) {
	// icons render through the game's WebGL context (no second context, textures shared)
	setIconRenderer( game.renderer?.gl || null );
	const lights = new LightPool( game );
	game.itemLights = lights;
	const items = new WorldItems( game );
	game.items3d = items;
	game.register( items );
	game.register( { update: ( dt ) => lights.update( dt ), dispose: () => lights.dispose() } );
	game.itemUse = game.register( new ItemUse( game, lights ) );
	game.crafting = game.register( new Crafting( game, lights ) );
	game.fishing = game.register( new Fishing( game ) );
	game.gathering = game.register( new Gathering( game ) );
	// the item domains' own runtimes (hooks.js addSystem), registered before Game.start loads the save into systems
	startSystems( game );
	// creative / debug spawners
	game.spawnables = game.spawnables || {};
	game.spawnables.campfire = { desc: 'Lit campfire', spawn: ( pos ) => game.crafting.placeFire( 'campfire', pos, { lit: true, fuel: 3 } ) };
	game.spawnables.loot = { desc: 'Kitchen loot pile', spawn: ( pos ) => items.spawnLoot( 'house_kitchen', pos ) };
}
