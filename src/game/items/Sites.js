// Outdoor loot sites (docs/ITEMS_PLAN.md "Outdoor loot sites"): loot you can see in the open, laid out as small
// scenes that read from a distance — a suitcase burst open on the shoulder, a beach camp, a cold campsite in the trees,
// a dead hiker, a police line, an Army post, a FEMA camp, a fruit stand, a helicopter down and smoking, a supply crate
// under a parachute and a red flare, a stash buried under a cairn.
//
// Where: planned per 96 m cell, deterministic from the world seed and the world's own queries (sites/plan.js); the
// roads' roadblocks, checkpoints, crashes and jams get loot of their own; helicopter crashes and stashes come from
// coarse grids so they can be found kilometres away. Props are merged per site (sites/kit.js, sites/props.js), built
// a few props and merged a few parts a frame, within ~240 m (camps on lots and streets 380 m, before the parked cars
// come; gone 40 m further out); the loot lies on the ground as real world items (game.items3d) within ~120 m, keyed by
// site and slot. Taken items are recorded with the game hour and come back after the kind's respawn
// time, rolled anew (sites/state.js; saved in save.world.sites).
//
// API (game.sites):
//   reveal( kind, near, maxR? ) -> site | null      marks the nearest site of a kind on the map (radios, notes, maps)
//   find( kind, near, maxR? ) -> site | null        the same without the marker (maxR 1500 m, helicopters 6000 m)
//   readStash( stack )                              a stash note / treasure map: marks its stash on the map
//   supplyDrop( pos?, { alt } ) -> drop | null      an airdrop now (near pos, else 350-900 m from the player)
//   debugPlace( kind, pos, { yaw, seed, extra, items } ) -> site   a site of a kind at a point (tests, /summon)
//   near( pos, r ) -> [ site ]                      planned sites around a point
//   obstacles( x0, z0, size ) -> Float32Array|null  site footprints for the vegetation (no trees through a tent)
//   stats() -> { built, queued, items, tris, draws, plans, drops, beacons }
import * as THREE from 'three';
import { KINDS, KIND_LIST, CELL, HELI_CELL, STASH_CELL, hash32, strHash, rng, seedOf } from './sites/kinds.js';
import { planCell, heliAt, stashAt, cellsAround, probe, fits } from './sites/plan.js';
import { layout, slotKey, tableOf } from './sites/layout.js';
import { SiteState } from './sites/state.js';
import { Kit, siteMaterials, geo } from './sites/kit.js';
import { PROPS } from './sites/props.js';
import { rollLoot } from './Loot.js';
import { getItem } from './ItemDB.js';
import { raySphere } from '../Entities.js';
import { G } from '../../render/Materials.js';
import { roadPoint, hh, nearestOnNetwork } from '../../city/roads/network.js';

const PROP_IN = 240, PROP_OUT = 280; // build / drop site props (m)
// the camps that sit on parking lots and streets build before the parked vehicles come (vehicles: 360 m), so their
// colliders keep cars out of them (Vehicles skips a parking spot that overlaps a box); they read from far off anyway
const FAR_IN = { fema_camp: 380, checkpoint: 380, military_checkpoint: 380 };
const SCAN_R = 420;
const inR = ( s ) => FAR_IN[ s.kind ] ?? PROP_IN;
const ITEM_IN = 120, ITEM_OUT = 145; // spawn / clear the loot
const SHADOW_R = 110; // merged site meshes cast sun shadows this close
const BEACON_R = 1800; // a helicopter's smoke column shows this far
const BUILD_MS = 4; // per frame
const PLAN_MS = 6; // planning new cells per scan
const DROP_H = [ 9, 22 ]; // game hours between airdrops
const DROP_LIFE = 72; // game hours a landed drop stays
const FALL_V = 6.5; // m/s under the canopy
const FLARE_S = 900; // real seconds the red smoke burns after landing
const KEY_RE = /^(site|heli|stash|drop|dbg):/;
const FLAG_PAVED = 1 | 4 | 8;
const WALK_TOP = 0.2; // streetgen: LIFT.walk + CURB

const _v = new THREE.Vector3();
const EMBER = new THREE.Color( 1, 0.4, 0.12 ), FLARE = new THREE.Color( 1, 0.12, 0.08 );
const cardinal = ( dx, dz ) => [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ][ Math.round( ( ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360 ) / 45 ) % 8 ];
const fmtDist = ( d ) => d >= 1000 ? `${( d / 1000 ).toFixed( 1 )} km` : `${Math.round( d / 10 ) * 10} m`;

export class Sites {
	constructor( game ) {
		this.game = game;
		this.seed = seedOf( game.seed );
		this.state = new SiteState();
		this.plans = new Map(); // fine cell -> [ site ]
		this.extra = new Map(); // debug-placed sites
		this.active = new Map(); // site key -> built site { site, L, group, boxes, items, bodies, acts, d, ... }
		this.queue = [];
		this.job = null; // the site being built a few props a frame
		this.bodyItems = new Map(); // body key -> { t, items }: what a site's dead carry, rolled once
		this.drops = []; // { id, key, x, z, yaw, seed, hours, landed, y, flareT, flight }
		this.nextDrop = null;
		this.nextId = 1;
		this.beacons = [];
		this.warm = new Set(); // beacons whose smoke column has been laid out
		this.marks = new Map(); // site key -> marker id
		this.lastScan = new THREE.Vector3( 1e9, 0, 0 );
		this.scanT = 0;
		this.t = 0;
		this.group = new THREE.Group();
		this.group.name = 'sites';
		game.scene.add( this.group );
		this.env = this._env();
		this._events = null;
		this.offTaken = game.items3d?.addTakenListener?.( ( item ) => this._taken( item ) ) || null;
		this.offProvider = game.interact.addProvider( ( ray, maxDist ) => this.provide( ray, maxDist ) );
		siteMaterials();
	}

	// ---- the world, as the planner sees it ---------------------------------------------------------------------------

	_env() {
		const g = this.game, hf = g.hf, s4 = [ 0, 0, 0, 0 ];
		const at = { x: 0, y: 0, z: 0 };
		return {
			seed: this.seed,
			height: ( x, z ) => hf.heightAt( x, z ),
			base: ( x, z ) => hf.baseHeight( x, z ),
			flags: ( x, z ) => hf.flagsNear( x, z ),
			surface: ( x, z ) => hf.surfaceAt( x, z, s4 ),
			// the network query itself (what roads.nearestRoad wraps in vectors, and what the Node test plans with)
			road: ( x, z, d ) => g.roads?.net ? nearestOnNetwork( g.roads.net, x, z, d ) : null,
			building: ( x, z, m ) => { at.x = x; at.z = z; at.y = 0; return !! g.city?.buildingAt?.( at, m ); },
			lot: ( x, z ) => !! g.roads?.lotAt?.( x, z, 1 ),
			cities: g.world.meta?.cities || [],
			events: ( ci, cj ) => this._eventsIn( ci, cj ),
		};
	}

	// the roads' outbreak events, bucketed by cell, with their outbound direction and the guard post's side
	_eventsIn( ci, cj ) {
		if ( ! this._events ) {
			this._events = new Map();
			const P = [ 0, 0, 0, 0, 0 ];
			for ( const e of this.game.roads?.net?.events || [] ) {
				if ( ! [ 'roadblock', 'checkpoint', 'crash', 'jam' ].includes( e.type ) || ! e.road ) continue;
				roadPoint( e.road, e.s, P );
				const dir = e.dir || 1;
				const side = hh( e.seed, 1 ) < 0.5 ? 1 : - 1;
				const rec = { type: e.type, x: P[ 0 ], z: P[ 1 ], tx: P[ 2 ] * dir, tz: P[ 3 ] * dir, hw: e.road.hw ?? ( e.road.w || 8 ) / 2, sd: side * dir };
				const k = Math.floor( rec.x / CELL ) + ':' + Math.floor( rec.z / CELL );
				( this._events.get( k ) || this._events.set( k, [] ).get( k ) ).push( rec );
			}
		}
		return this._events.get( ci + ':' + cj ) || [];
	}

	plan( ci, cj ) {
		const k = ci + ':' + cj;
		let p = this.plans.get( k );
		if ( ! p ) {
			p = planCell( this.env, ci, cj );
			this.plans.set( k, p );
			if ( this.plans.size > 6000 ) this.plans.delete( this.plans.keys().next().value );
		}
		return p;
	}
	heliAt( I, J ) { return heliAt( this.env, I, J ); }
	stashAt( I, J ) { return stashAt( this.env, I, J ); }

	// planned sites within r of a point (planning cells as needed)
	near( pos, r = 250 ) {
		const out = [];
		for ( const [ i, j ] of cellsAround( pos.x, pos.z, r ) ) for ( const s of this.plan( i, j ) ) if ( Math.hypot( s.x - pos.x, s.z - pos.z ) <= r ) out.push( s );
		for ( const [ I, J ] of cellsAround( pos.x, pos.z, r, HELI_CELL ) ) { const s = this.heliAt( I, J ); if ( s && Math.hypot( s.x - pos.x, s.z - pos.z ) <= r ) out.push( s ); }
		for ( const [ I, J ] of cellsAround( pos.x, pos.z, r, STASH_CELL ) ) { const s = this.stashAt( I, J ); if ( s && Math.hypot( s.x - pos.x, s.z - pos.z ) <= r ) out.push( s ); }
		for ( const s of this._dynamic() ) if ( Math.hypot( s.x - pos.x, s.z - pos.z ) <= r ) out.push( s );
		return out;
	}
	_dynamic() { return [ ...this.extra.values(), ...this.drops.filter( d => d.landed ) ]; }

	// site footprints in a square of the world, in the vegetation's obstacle layout ( x, z, half w, half d, angle,
	// height ) x n, so no tree grows through a tent (world/Vegetation.js asks for each cell it scatters)
	obstacles( x0, z0, size ) {
		const out = [], m = 20;
		const add = ( s ) => {
			const r = s && ! s.ev && OBST_R[ s.kind ];
			if ( ! r ) return;
			if ( s.x + r < x0 || s.x - r > x0 + size || s.z + r < z0 || s.z - r > z0 + size ) return;
			// two squares at 45° make an octagon: a clearing, not a square cut out of the grass
			out.push( s.x, s.z, r, r, s.yaw, 0, s.x, s.z, r, r, s.yaw + Math.PI / 4, 0 );
		};
		for ( let i = Math.floor( ( x0 - m ) / CELL ); i <= Math.floor( ( x0 + size + m ) / CELL ); i ++ ) {
			for ( let j = Math.floor( ( z0 - m ) / CELL ); j <= Math.floor( ( z0 + size + m ) / CELL ); j ++ ) for ( const s of this.plan( i, j ) ) add( s );
		}
		for ( let I = Math.floor( ( x0 - m ) / HELI_CELL ); I <= Math.floor( ( x0 + size + m ) / HELI_CELL ); I ++ ) {
			for ( let J = Math.floor( ( z0 - m ) / HELI_CELL ); J <= Math.floor( ( z0 + size + m ) / HELI_CELL ); J ++ ) add( this.heliAt( I, J ) );
		}
		return out.length ? new Float32Array( out ) : null;
	}

	// how far a paved surface stands above the terrain at a point: a sidewalk's top (the street generator's 5 cm lift
	// and 15 cm curb), a road or a parking lot (5-7.5 cm), else 0. From the street network itself, so it holds before
	// the roads' near cells (and their sidewalk colliders) have streamed in
	lift( x, z ) {
		const g = this.game, net = g.roads?.net;
		if ( net?.shash ) {
			let top = 0;
			net.shash.query( x, z, 1, ( st ) => {
				if ( ! st.walk ) return;
				const ux = ( x - st.ax ) * st.dx + ( z - st.az ) * st.dz, v = Math.abs( ( z - st.az ) * st.dx - ( x - st.ax ) * st.dz );
				// between the crossing streets, past the curb, short of the sidewalk's outer edge
				if ( v > st.w / 2 && v < st.w / 2 + st.walk && ux > ( st.a?.w ?? st.w ) / 2 && ux < st.len - ( st.b?.w ?? st.w ) / 2 ) { top = WALK_TOP; return false; }
			} );
			if ( top ) return top;
		}
		return ( ( g.hf.flagsNear( x, z ) & FLAG_PAVED ) || g.roads?.lotAt?.( x, z ) ) ? 0.07 : 0;
	}

	// ---- per frame ----------------------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game;
		this.t += dt;
		if ( ! this.offTaken && g.items3d?.addTakenListener ) this.offTaken = g.items3d.addTakenListener( ( item ) => this._taken( item ) );
		const p = g.camera.position;
		this.scanT -= dt;
		if ( this.scanT <= 0 || p.distanceToSquared( this.lastScan ) > 15 * 15 ) { this.scanT = 0.6; this._scan( p ); }
		this._build();
		this._spawnNext();
		this._drops( dt );
		this._fx( dt );
	}

	_scan( p ) {
		this.lastScan.copy( p );
		const t0 = performance.now();
		const want = new Map();
		const consider = ( s ) => {
			const d = Math.hypot( s.x - p.x, s.z - p.z );
			const A = this.active.get( s.key ), r = inR( s );
			if ( d < r || ( A && d < r + PROP_OUT - PROP_IN ) ) want.set( s.key, { s, d } );
		};
		// nearest cells first; planning new ones is spread over scans when the budget runs out
		let deferred = false;
		for ( const [ i, j, cd ] of cellsAround( p.x, p.z, SCAN_R ) ) {
			// past the common range only the far-building camps count: plan those cells when there is time
			if ( cd > PROP_OUT && ! this.plans.has( i + ':' + j ) && performance.now() - t0 > PLAN_MS * 0.5 ) { deferred = true; continue; }
			const k = i + ':' + j;
			if ( ! this.plans.has( k ) && performance.now() - t0 > PLAN_MS ) { deferred = true; continue; }
			for ( const s of this.plan( i, j ) ) consider( s );
		}
		for ( const [ I, J ] of cellsAround( p.x, p.z, PROP_OUT, STASH_CELL ) ) { const s = this.stashAt( I, J ); if ( s ) consider( s ); }
		const prev = this.beacons;
		this.beacons = [];
		for ( const [ I, J ] of cellsAround( p.x, p.z, BEACON_R, HELI_CELL ) ) {
			const s = this.heliAt( I, J );
			if ( ! s ) continue;
			const d = Math.hypot( s.x - p.x, s.z - p.z );
			if ( d < BEACON_R ) { const old = prev.find( b => b.s === s ); this.beacons.push( old ? Object.assign( old, { d } ) : { s, d } ); }
			consider( s );
		}
		for ( const s of this.extra.values() ) {
			if ( s.kind !== 'heli_crash' ) continue;
			const d = Math.hypot( s.x - p.x, s.z - p.z );
			if ( d < BEACON_R ) { const old = prev.find( b => b.s === s ); this.beacons.push( old ? Object.assign( old, { d } ) : { s, d } ); }
		}
		for ( const k of [ ...this.warm ] ) if ( ! this.beacons.some( b => b.s.key === k ) ) this.warm.delete( k );
		for ( const s of this._dynamic() ) consider( s );
		if ( deferred ) this.scanT = Math.min( this.scanT, 0.05 );
		// drop what's out of range (and a half-built one), queue what came in
		for ( const [ key, A ] of this.active ) if ( ! want.has( key ) ) this._unbuild( A );
		if ( this.job && ! want.has( this.job.s.key ) ) this.job = null;
		this.queue = [ ...want.values() ].filter( w => ! this.active.has( w.s.key ) && w.s !== this.job?.s ).sort( ( a, b ) => a.d - b.d ).map( w => w.s );
		// items and bodies by distance; shadows only close up
		for ( const A of this.active.values() ) {
			A.d = want.get( A.site.key )?.d ?? Infinity;
			// (loot comes out a site a frame, _spawnNext)
			if ( A.spawned && A.d > ITEM_OUT ) this._clearItems( A );
			const sh = A.d < SHADOW_R;
			if ( sh !== A.shadow ) { A.shadow = sh; for ( const m of A.group.children ) m.castShadow = sh && m.userData.shadow; }
		}
	}

	// a few props a frame: a big camp is ~20 props and 10k triangles, too much for one frame; the merge (a few ms
	// for a camp) gets a frame of its own
	_build() {
		const t0 = performance.now(), until = t0 + BUILD_MS;
		while ( performance.now() < until ) {
			let J = this.job;
			if ( ! J ) {
				const s = this.queue.shift();
				if ( ! s ) return;
				if ( this.active.has( s.key ) ) continue;
				try { J = this.job = this._job( s ); } catch ( e ) { this._broken( s, e ); continue; }
			}
			try {
				if ( ! J.done ) J.done = this._step( J, until );
				if ( ! J.done ) return;
				// then the merge, a few parts a frame too
				if ( ! J.merging ) { J.merging = true; this._merge( J ); }
				if ( ! J.k.step( until ) ) return;
				this.job = null;
				// built meanwhile by dig() or debugPlace()
				if ( ! this.active.has( J.s.key ) ) this._finish( J );
				return;
			} catch ( e ) { this.job = null; this._broken( J.s, e ); }
		}
	}

	// the nearest built site within reach that has no loot out yet lays it out: one a frame (the dead each cost the
	// creatures module a ragdoll settle)
	_spawnNext() {
		let best = null;
		for ( const A of this.active.values() ) if ( ! A.spawned && A.d < ITEM_IN && ! A.broken && ( ! best || A.d < best.d ) ) best = A;
		if ( best ) this._spawnItems( best );
	}

	// a site that failed to build stays as an empty record so it isn't retried every scan
	_broken( s, e ) {
		console.error( 'site build', s.kind, e );
		this.active.set( s.key, { site: s, group: new THREE.Group(), boxes: [], items: [], bodies: [], acts: [], fxW: [], L: { slots: [], acts: [], fx: [], bodies: [] }, broken: true, d: Infinity } );
	}

	// ---- building a site ------------------------------------------------------------------------------------------------

	_frame( s ) {
		const c = Math.cos( s.yaw ), sn = Math.sin( s.yaw );
		const toW = ( lx, lz ) => [ s.x + lx * c + lz * sn, s.z - lx * sn + lz * c ];
		return { toW, c, sn };
	}

	_buildSite( s ) {
		const J = this._job( s );
		this._step( J, Infinity );
		this._merge( J );
		J.k.step( Infinity );
		return this._finish( J );
	}

	_job( s ) {
		const g = this.game, hf = g.hf;
		if ( s.kind === 'stash' ) s.dug = this.state.isDug( s.key );
		const L = layout( s );
		const c = Math.cos( s.yaw ), sn = Math.sin( s.yaw );
		const toW = ( lx, lz ) => [ s.x + lx * c + lz * sn, s.z - lx * sn + lz * c ];
		const y0 = hf.heightAt( s.x, s.z );
		// the ground under a local point (paved surfaces sit a few centimetres proud of the terrain, a sidewalk 20 cm)
		const gy = ( lx, lz ) => { const x = s.x + lx * c + lz * sn, z = s.z - lx * sn + lz * c; return hf.heightAt( x, z ) - y0 + this.lift( x, z ); };
		const k = new Kit();
		k.ground = gy;
		const props = L.props.slice();
		if ( ! g.zombies?.spawn ) for ( const b of L.bodies ) props.push( { t: b.as === 'military' || b.as === 'police' ? 'body_bag' : 'body_covered', x: b.x, z: b.z, yaw: b.yaw } );
		return { s, L, toW, y0, gy, k, props, i: 0, R: rng( s.seed ^ 0x9e37 ) };
	}

	// build props until the time runs out; true when all are in
	_step( J, until ) {
		const { k, gy, R } = J;
		while ( J.i < J.props.length ) {
			const pr = J.props[ J.i ++ ];
			const fn = PROPS[ pr.t ];
			if ( ! fn ) { console.warn( 'site prop', pr.t ); continue; }
			// big things settle to the lowest ground under them
			const r = FOOT_R[ pr.t ] ?? 0;
			let y = gy( pr.x, pr.z );
			if ( r > 0 ) {
				const ca = Math.cos( pr.yaw || 0 ), sa = Math.sin( pr.yaw || 0 );
				for ( const [ ax, az ] of FOOT_DIRS ) y = Math.min( y, gy( pr.x + ( ax * ca + az * sa ) * r, pr.z + ( - ax * sa + az * ca ) * r ) );
			}
			k.base = y;
			k.push( [ pr.x, y + ( pr.dy || 0 ), pr.z ], [ 0, pr.yaw || 0, 0 ] );
			try { fn( k, pr, R ); } catch ( e ) { console.error( 'site prop', pr.t, e ); }
			k.pop();
			if ( performance.now() > until ) return J.i >= J.props.length;
		}
		return true;
	}

	// the last parts (embers, ground decals), then the kit merges them per material
	_merge( J ) {
		const { s, L, gy, k, R } = J;
		// embers glow in the wreckage
		for ( const f of L.fx ) if ( f.fx === 'embers' ) for ( let i = 0; i < 5; i ++ ) k.part( geo.ico( 0.07 + R() * 0.06, 0 ), 'glow', 0xffffff, [ f.x + ( R() - 0.5 ) * 0.9, gy( f.x, f.z ) + 0.03, f.z + ( R() - 0.5 ) * 0.9 ], [ R() * 3, R() * 3, 0 ], [ 1, 0.5, 1 ] );
		for ( const d of L.decals ) k.decal( d.d, d.x, d.z, d.s, d.yaw, gy );
		k.begin( 'site:' + s.kind );
	}

	// the merged meshes into the scene, the colliders into the physics
	_finish( J ) {
		const g = this.game, { s, L, toW, y0, gy, k } = J;
		const { group, boxes, tris } = k.end();
		group.position.set( s.x, y0, s.z );
		group.rotation.y = s.yaw;
		group.updateMatrixWorld( true );
		group.matrixAutoUpdate = false;
		for ( const m of group.children ) { m.matrixAutoUpdate = false; m.updateMatrix(); m.castShadow = false; }
		this.group.add( group );
		const owner = { site: s };
		const pb = [];
		for ( const b of boxes ) {
			const [ x, z ] = toW( b.x, b.z );
			pb.push( g.physics.add( { x, y: y0 + b.y, z, hx: b.hx, hy: b.hy, hz: b.hz, yaw: s.yaw + b.yaw, mat: b.mat, kind: b.kind === 'noclimb' ? 'noclimb' : 'solid', owner } ) );
		}
		// world positions of the F spots and the embers, worked out once (the provider and the effects run every frame)
		const at = ( lx, lz, h ) => { const [ x, z ] = toW( lx, lz ); return new THREE.Vector3( x, y0 + gy( lx, lz ) + h, z ); };
		const acts = L.acts.map( a => ( { a, c: at( a.x, a.z, a.h ) } ) );
		const fxW = L.fx.filter( f => f.fx === 'embers' ).map( f => at( f.x, f.z, 0.15 ) );
		const A = { site: s, L, group, boxes: pb, owner, items: [], bodies: [], acts, fxW, tris, y0, gy, toW, spawned: false, shadow: false, d: Infinity };
		this.active.set( s.key, A );
		return A;
	}

	_unbuild( A ) {
		this._clearItems( A );
		for ( const b of A.boxes ) this.game.physics.remove( b );
		this.group.remove( A.group );
		for ( const m of A.group.children ) m.geometry.dispose();
		this.active.delete( A.site.key );
	}

	// ---- loot and the dead ------------------------------------------------------------------------------------------------

	_spawnItems( A ) {
		const g = this.game, items = g.items3d;
		A.spawned = true;
		// bodies arrive late (their avatar streams in): one cleared and shown again meanwhile must not come twice
		const showing = A.showing = ( A.showing || 0 ) + 1;
		if ( ! items?.spawn ) return;
		const hours = g.time.hours, respawn = KINDS[ A.site.kind ]?.respawn ?? 72;
		A.L.slots.forEach( ( sl, k ) => {
			const key = slotKey( A.site, k );
			const gen = this.state.gen( key, hours, respawn );
			if ( gen < 0 ) return;
			const R = rng( hash32( strHash( key ), this.seed, gen ) );
			if ( R() > sl.p ) return;
			const st = rollLoot( tableOf( A.site, sl ), R, 1 )[ 0 ];
			if ( ! st || ! getItem( st.id ) ) return;
			const [ x, z ] = A.toW( sl.x, sl.z );
			const gy = A.y0 + A.gy( sl.x, sl.z );
			// on the ground: rest exactly there (a road's surface is above the terrain the physics knows); on a
			// table or a bench: drop the last centimetres onto its box
			// (on a towel or a blanket: exactly on the cloth, which the physics doesn't know)
			const onTop = sl.h > 0.08, onCloth = sl.h > 0 && ! onTop;
			const paved = this.lift( x, z ) > 0;
			const y = onTop ? gy + sl.h + 0.04 : onCloth ? gy + sl.h : paved ? gy + 0.004 : gy + 0.05;
			const it = items.spawn( st, _v.set( x, y, z ), { yaw: R() * Math.PI * 2, key, persistent: false, settle: onTop || ( ! paved && ! onCloth ), quiet: true } );
			if ( it ) A.items.push( it );
		} );
		// the dead: a real body when the creatures module can lay one down
		const Z = g.zombies;
		if ( Z?.spawn && A.L.bodies.length ) {
			A.L.bodies.forEach( ( b, i ) => {
				const [ x, z ] = A.toW( b.x, b.z );
				const pos = new THREE.Vector3( x, A.y0 + A.gy( b.x, b.z ) + 0.05, z );
				let r = null;
				try { r = Z.spawn( b.as || 'civilian', pos, { victim: true, wait: true, yaw: b.yaw + A.site.yaw } ); } catch ( e ) { console.error( 'site body', e ); }
				const key = A.site.key + ':b' + i;
				const keep = ( zb ) => {
					if ( ! zb ) return;
					if ( ! A.spawned || A.showing !== showing || this.active.get( A.site.key ) !== A ) { g.entities.remove( zb ); return; }
					zb.siteBody = true;
					// a search finds what this body carried, not a fresh roll each time it is shown again
					zb.lootItems = () => this._bodyLoot( key, zb, respawn );
					A.bodies.push( zb );
				};
				if ( r && typeof r.then === 'function' ) r.then( keep, () => {} ); else keep( r );
			} );
		}
	}

	// what a site's dead carry: rolled once (the creatures' table for that kind) and kept, as left, while the game
	// runs; searched in an earlier session it is empty until the kind's respawn time
	_bodyLoot( key, zb, respawn ) {
		const hours = this.game.time.hours;
		const e = this.bodyItems.get( key );
		if ( e && hours - e.t < respawn ) return e.items;
		if ( ! e && ! this.state.usable( key, hours, respawn ) ) return [];
		const R = rng( hash32( strHash( key ), this.seed, Math.floor( hours / Math.min( respawn, 1e6 ) ) ) );
		let items = [];
		try { items = rollLoot( zb.T?.loot || 'zombie_civilian', R ); } catch ( err ) { console.warn( 'site body loot', err ); }
		this.bodyItems.set( key, { t: hours, items } );
		this.state.use( key, hours );
		return items;
	}

	_clearItems( A ) {
		const g = this.game, items = g.items3d;
		A.spawned = false;
		for ( const it of A.items ) if ( items?.items?.has( it ) && ! it.persistent ) items.remove( it );
		A.items.length = 0;
		for ( const zb of A.bodies ) if ( ! zb.removed ) g.entities.remove( zb );
		A.bodies.length = 0;
	}

	_taken( item ) {
		const k = item?.key;
		if ( typeof k !== 'string' || ! KEY_RE.test( k ) ) return;
		this.state.take( k, this.game.time.hours );
		// a drop picked clean loses its map marker
		if ( k.startsWith( 'drop:' ) ) {
			const dk = k.split( ':' ).slice( 0, 2 ).join( ':' );
			const A = this.active.get( dk );
			if ( A && A.items.every( it => ! this.game.items3d.items.has( it ) || it === item ) ) this._unmark( dk );
		}
	}

	// ---- effects: smoke columns, flares, embers, the bodies kept fresh ---------------------------------------------------------

	_fx( dt ) {
		const g = this.game, fx = g.fx;
		const wind = G.uWind?.value || { x: 0, y: 0 };
		const night = ( g.world.sky?.night || 0 ) > 0.3;
		if ( fx?.alpha ) {
			// a dark column over each helicopter, thinner with distance so far ones cost little
			for ( const b of this.beacons ) {
				const s = b.s;
				if ( b.pos === undefined ) {
					const smoke = layout( s ).fx.find( f => f.fx === 'smoke' );
					if ( smoke ) { const [ x, z ] = this._frame( s ).toW( smoke.x, smoke.z ); b.pos = { x, y: g.hf.heightAt( x, z ) + smoke.h, z }; } else b.pos = null;
				}
				if ( ! b.pos ) continue;
				if ( ! this.warm.has( s.key ) ) { this.warm.add( s.key ); this._prewarm( fx, b, wind ); }
				const rate = b.d < 300 ? 4 : 1.6;
				b.acc = ( b.acc || 0 ) + dt * rate;
				const big = b.d < 300 ? 1 : 2.2;
				while ( b.acc > 1 ) {
					b.acc -= 1;
					fx.alpha.emit( this._smoke( b.pos, wind, big, 0 ) );
				}
			}
		}
		for ( const A of this.active.values() ) {
			if ( A.d < 90 ) for ( const e of A.fxW ) {
				if ( fx?.add && Math.random() < dt * 3 ) fx.add.emit( { x: e.x + ( Math.random() - 0.5 ) * 0.8, y: e.y, z: e.z + ( Math.random() - 0.5 ) * 0.8, vx: ( Math.random() - 0.5 ) * 0.3, vy: 0.8 + Math.random(), vz: ( Math.random() - 0.5 ) * 0.3, life: 1 + Math.random(), s0: 0.015, frame: 12, r: 5, g: 2, b: 0.5, a: 1, drag: 0.5, grav: - 0.3 } );
				if ( night && fx?.lightNow && A.d < 70 ) fx.lightNow( e.l || ( e.l = new THREE.Vector3( e.x, e.y + 0.4, e.z ) ), EMBER, 3 * ( 0.8 + Math.random() * 0.4 ), 7 );
			}
			// the bodies are part of the scene: the creatures module must not tidy them away while we show them
			for ( const zb of A.bodies ) if ( zb.corpseT > 20 ) zb.corpseT = 20;
		}
	}

	// one puff of a helicopter's column, `age` seconds into its life (the column is laid out already formed when it
	// first comes into range instead of growing from the ground while you watch)
	_smoke( pos, wind, big, age ) {
		const sh = 0.035 + Math.random() * 0.04, life = 16 + Math.random() * 6;
		const vx = wind.x * 0.5 + ( Math.random() - 0.5 ) * 0.4, vy = 2.4 + Math.random() * 1.2, vz = wind.y * 0.5 + ( Math.random() - 0.5 ) * 0.4;
		const s0 = 1.2 * big, s1 = ( 6 + Math.random() * 4 ) * big, f = age / life;
		return { x: pos.x + ( Math.random() - 0.5 ) * 0.8 + vx * age, y: pos.y + vy * age * ( 1 - f * 0.3 ), z: pos.z + ( Math.random() - 0.5 ) * 0.8 + vz * age,
			vx, vy, vz, life: life - age, s0: s0 + ( s1 - s0 ) * f, s1, frame: 1, r: sh, g: sh * 0.97, b: sh * 0.94, a: 0.7, drag: 0.08, grav: - 0.12, rotV: ( Math.random() - 0.5 ) * 0.3, fadeIn: age > 0 ? 0 : 0.06 };
	}
	_prewarm( fx, b, wind ) {
		const big = b.d < 300 ? 1 : 2.2, n = b.d < 300 ? 40 : 22;
		for ( let i = 0; i < n; i ++ ) fx.alpha.emit( this._smoke( b.pos, wind, big, ( i + Math.random() ) / n * 15 ) );
	}

	// ---- supply drops ------------------------------------------------------------------------------------------------------

	_drops( dt ) {
		const g = this.game, hours = g.time.hours;
		if ( this.nextDrop === null ) this.nextDrop = hours + 3 + Math.random() * 6;
		if ( hours >= this.nextDrop && ! g.dead ) {
			const d = this.supplyDrop();
			this.nextDrop = hours + ( d ? DROP_H[ 0 ] + Math.random() * ( DROP_H[ 1 ] - DROP_H[ 0 ] ) : 1 );
		}
		// backwards: an expired drop leaves the list
		for ( let i = this.drops.length - 1; i >= 0; i -- ) {
			const d = this.drops[ i ];
			if ( ! d.landed ) this._fall( d, dt );
			else if ( hours - d.hours > DROP_LIFE ) this._expire( d );
			else if ( d.flareT !== undefined ) d.flareT += dt;
		}
		this._flares( dt );
	}

	// an airdrop: a point 350-900 m from the player (or near pos) on open ground; announced with a toast and a marker
	supplyDrop( pos = null, o = {} ) {
		const g = this.game, p = g.player.pos;
		let spot = null;
		for ( let tries = 0; tries < 30 && ! spot; tries ++ ) {
			const a = Math.random() * Math.PI * 2, r = pos ? Math.random() * 20 : 350 + Math.random() * 550;
			const cx = ( pos || p ).x + Math.cos( a ) * r, cz = ( pos || p ).z + Math.sin( a ) * r;
			const q = probe( this.env, cx, cz );
			if ( ! q || q.cls === 'town' || q.cls === 'street' ) continue;
			if ( ! fits( this.env, cx, cz, 4, { slope: 0.3 } ) || this.env.building( cx, cz, 12 ) ) continue;
			spot = { x: cx, z: cz };
		}
		if ( ! spot ) return null;
		const id = this.nextId ++;
		const d = { id, key: 'drop:' + id, kind: 'supply_drop', x: spot.x, z: spot.z, yaw: Math.random() * Math.PI * 2, seed: ( Math.random() * 4294967296 ) >>> 0, hours: g.time.hours, landed: false, cls: 'drop' };
		const gy = g.hf.heightAt( d.x, d.z );
		d.y = gy + ( o.alt ?? 240 );
		this.drops.push( d );
		this._mark( d, 'Supply drop' );
		g.toast( 'Supply drop', 'info' );
		// the transport overhead
		g.audio?.play?.( 'engine_truck', { pos: new THREE.Vector3( d.x, gy + 300, d.z ), vol: 0.9, rate: 0.42, lowpass: 700, max: 4000, ref: 300 } );
		return d;
	}

	_fall( d, dt ) {
		const g = this.game;
		const gy = g.hf.heightAt( d.x, d.z );
		const far = Math.hypot( d.x - g.camera.position.x, d.z - g.camera.position.z ) > 2000;
		const wind = G.uWind?.value || { x: 0, y: 0 };
		d.y -= FALL_V * dt * ( far ? 4 : 1 );
		d.x += wind.x * dt * 0.3; d.z += wind.y * dt * 0.3;
		if ( ! far && ! d.flight ) d.flight = this._flightModel();
		if ( d.flight ) {
			d.flight.position.set( d.x, d.y, d.z );
			d.flight.rotation.y = d.yaw + Math.sin( this.t * 0.7 + d.id ) * 0.15;
			d.flight.rotation.z = Math.sin( this.t * 1.1 + d.id ) * 0.06;
		}
		if ( d.y <= gy ) {
			d.landed = true;
			d.y = gy;
			d.flareT = 0;
			if ( d.flight ) { this.group.remove( d.flight ); d.flight.traverse( o => o.geometry?.dispose() ); d.flight = null; }
			this._mark( d, 'Supply drop' );
			const at = new THREE.Vector3( d.x, gy, d.z );
			g.audio?.play?.( 'crash', { pos: at, vol: 0.8, rate: 0.7, max: 400 } );
			g.events.emit( 'noise', { pos: at, radius: 160, source: 'supply_drop', kind: 'impact' } );
			this.lastScan.set( 1e9, 0, 0 );
		}
	}

	// a crate under a canopy, drawn while it floats down
	_flightModel() {
		const k = new Kit();
		PROPS.drop_crate( k, { open: false }, Math.random );
		k.boxes.length = 0;
		const cols = [ 0x5d6240, 0xcfc6a8 ];
		const top = 9.5, R = 3.6, n = 12;
		for ( let i = 0; i < n; i ++ ) {
			const a0 = i / n * Math.PI * 2, a1 = ( i + 1 ) / n * Math.PI * 2;
			const ring = ( a, f, y ) => [ Math.cos( a ) * R * f, top + y, Math.sin( a ) * R * f ];
			const g = new THREE.BufferGeometry();
			const p = [];
			for ( const [ f0, y0, f1, y1 ] of [ [ 0, 2.2, 0.55, 1.8 ], [ 0.55, 1.8, 0.9, 0.9 ], [ 0.9, 0.9, 1, 0 ] ] ) {
				const A = ring( a0, f0, y0 ), B = ring( a1, f0, y0 ), C = ring( a1, f1, y1 ), D = ring( a0, f1, y1 );
				p.push( ...A, ...C, ...B, ...A, ...D, ...C );
			}
			g.setAttribute( 'position', new THREE.Float32BufferAttribute( p, 3 ) );
			g.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Array( p.length / 3 * 2 ).fill( 0 ), 2 ) );
			g.computeVertexNormals();
			k.part( g, 'cloth', cols[ i % 2 ] );
			const a = a0;
			const pts = [ [ Math.cos( a ) * R, top, Math.sin( a ) * R ], [ Math.cos( a ) * 0.5, 1.05, Math.sin( a ) * 0.4 ] ];
			const dx = pts[ 1 ][ 0 ] - pts[ 0 ][ 0 ], dy = pts[ 1 ][ 1 ] - pts[ 0 ][ 1 ], dz = pts[ 1 ][ 2 ] - pts[ 0 ][ 2 ];
			const len = Math.hypot( dx, dy, dz );
			const lg = new THREE.CylinderGeometry( 0.01, 0.01, len, 3 );
			const q = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( dx / len, dy / len, dz / len ) );
			const e = new THREE.Euler().setFromQuaternion( q );
			k.part( lg, 'matte', 0xd8d2bf, [ ( pts[ 0 ][ 0 ] + pts[ 1 ][ 0 ] ) / 2, ( pts[ 0 ][ 1 ] + pts[ 1 ][ 1 ] ) / 2, ( pts[ 0 ][ 2 ] + pts[ 1 ][ 2 ] ) / 2 ], [ e.x, e.y, e.z ] );
		}
		const { group } = k.build( 'drop-flight' );
		for ( const m of group.children ) m.castShadow = true;
		this.group.add( group );
		return group;
	}

	_flares( dt ) {
		const g = this.game, fx = g.fx;
		if ( ! fx?.alpha ) return;
		const wind = G.uWind?.value || { x: 0, y: 0 };
		for ( const d of this.drops ) {
			if ( ! d.landed || d.flareT === undefined || d.flareT > FLARE_S ) continue;
			const dist = Math.hypot( d.x - g.camera.position.x, d.z - g.camera.position.z );
			if ( dist > 1500 ) continue;
			// where the flare burns, worked out once
			if ( d.flare === undefined ) {
				const f = layout( d ).fx.find( q => q.fx === 'flare' );
				if ( f ) { const [ fx0, fz0 ] = this._frame( d ).toW( f.x, f.z ); d.flare = new THREE.Vector3( fx0, g.hf.heightAt( fx0, fz0 ) + 0.15, fz0 ); d.flareL = d.flare.clone().setY( d.flare.y + 0.4 ); } else d.flare = null;
			}
			if ( ! d.flare ) continue;
			const { x, y, z } = d.flare;
			const fade = Math.min( 1, ( FLARE_S - d.flareT ) / 60 );
			d.acc = ( d.acc || 0 ) + dt * 7 * fade;
			while ( d.acc > 1 ) {
				d.acc -= 1;
				const k = 0.75 + Math.random() * 0.25;
				fx.alpha.emit( { x, y: y + 0.1, z, vx: wind.x * 0.7 + ( Math.random() - 0.5 ) * 0.5, vy: 1.4 + Math.random() * 1.2, vz: wind.y * 0.7 + ( Math.random() - 0.5 ) * 0.5,
					life: 10 + Math.random() * 6, s0: 0.3, s1: 4.5 + Math.random() * 3, frame: 1, r: 0.5 * k, g: 0.045 * k, b: 0.04 * k, a: 0.55, drag: 0.25, grav: - 0.16, rotV: ( Math.random() - 0.5 ) * 0.4, fadeIn: 0.05 } );
			}
			if ( dist < 400 ) {
				if ( fx.add && Math.random() < dt * 20 ) fx.add.emit( { x, y: y + 0.05, z, vx: ( Math.random() - 0.5 ) * 0.4, vy: 0.4 + Math.random(), vz: ( Math.random() - 0.5 ) * 0.4, life: 0.25, s0: 0.12, s1: 0.05, frame: 14, r: 6, g: 0.8, b: 0.6, a: 1 } );
				fx.lightNow?.( d.flareL, FLARE, 9 * fade * ( 0.75 + Math.random() * 0.5 ), 16 );
			}
		}
	}

	_expire( d ) {
		const A = this.active.get( d.key );
		if ( A ) this._unbuild( A );
		this._unmark( d.key );
		this.drops.splice( this.drops.indexOf( d ), 1 );
		for ( const k of [ ...this.state.taken.keys() ] ) if ( k.startsWith( d.key + ':' ) ) this.state.taken.delete( k );
	}

	// ---- map markers ---------------------------------------------------------------------------------------------------------

	_mark( s, label ) {
		const M = this.game.markers;
		if ( ! M ) return null;
		this._unmark( s.key );
		const m = M.add( { x: s.x, z: s.z, label, kind: 'site' } );
		m.site = s.key;
		this.marks.set( s.key, m.id );
		return m;
	}
	_unmark( key ) {
		const M = this.game.markers;
		const id = this.marks.get( key );
		if ( id !== undefined ) M?.remove( id );
		for ( const m of M?.list?.() || [] ) if ( m.site === key ) M.remove( m.id );
		this.marks.delete( key );
	}

	// ---- finding sites (radios, notes, maps) ------------------------------------------------------------------------------------

	// maxR defaults to 1500 m (6000 m for a helicopter, a rare thing a radio would send you a long way for)
	find( kind, near = this.game.player.pos, maxR = kind === 'heli_crash' ? 6000 : 1500 ) {
		if ( kind === 'supply_drop' ) {
			let best = null, bd = maxR;
			for ( const d of this.drops ) { const dd = Math.hypot( d.x - near.x, d.z - near.z ); if ( dd < bd ) { bd = dd; best = d; } }
			return best;
		}
		const coarse = kind === 'heli_crash' ? [ HELI_CELL, ( I, J ) => this.heliAt( I, J ) ] : kind === 'stash' ? [ STASH_CELL, ( I, J ) => this.stashAt( I, J ) ] : null;
		if ( coarse ) {
			let best = null, bd = maxR;
			for ( const [ I, J, cd ] of cellsAround( near.x, near.z, bd, coarse[ 0 ] ) ) {
				if ( cd > bd ) break;
				const s = coarse[ 1 ]( I, J );
				if ( ! s || ( kind === 'stash' && this.state.isDug( s.key ) ) ) continue;
				const d = Math.hypot( s.x - near.x, s.z - near.z );
				if ( d < bd ) { bd = d; best = s; }
			}
			return best;
		}
		let best = null, bd = maxR;
		const t0 = performance.now();
		for ( const [ i, j, cd ] of cellsAround( near.x, near.z, maxR ) ) {
			if ( cd > bd || performance.now() - t0 > 400 ) break;
			for ( const s of this.plan( i, j ) ) {
				if ( s.kind !== kind ) continue;
				const d = Math.hypot( s.x - near.x, s.z - near.z );
				if ( d < bd ) { bd = d; best = s; }
			}
		}
		return best;
	}

	reveal( kind, near = this.game.player.pos, maxR ) {
		if ( ! KINDS[ kind ] ) return null;
		const s = this.find( kind, near, maxR );
		if ( s ) this._mark( s, KINDS[ kind ].label );
		return s;
	}

	// a stash note or treasure map: the stash it leads to is fixed when first read (kept in the item's data)
	readStash( stack ) {
		const g = this.game, p = g.player.pos;
		const rich = stack.id === 'treasure_map';
		let t = stack.data?.site;
		if ( t && this.state.isDug( t.key ) ) { g.toast( 'Already dug up', 'info' ); return null; }
		if ( ! t ) {
			const cands = [];
			for ( const [ I, J, cd ] of cellsAround( p.x, p.z, 2600, STASH_CELL ) ) {
				if ( cd > 2600 ) break;
				const s = this.stashAt( I, J );
				if ( ! s || this.state.isDug( s.key ) ) continue;
				const d = Math.hypot( s.x - p.x, s.z - p.z );
				if ( d < 200 || d > 2600 ) continue;
				cands.push( { s, d, w: ( s.rich === rich ? 0 : 3000 ) + d } );
			}
			if ( ! cands.length ) { g.toast( 'Nothing marked nearby', 'info' ); return null; }
			cands.sort( ( a, b ) => a.w - b.w );
			const pickI = strHash( String( stack.uid ) ) % Math.min( 4, cands.length );
			const s = cands[ pickI ].s;
			t = { key: s.key, x: Math.round( s.x * 10 ) / 10, z: Math.round( s.z * 10 ) / 10 };
			stack.data = stack.data || {};
			stack.data.site = t;
		}
		this._mark( { key: t.key, x: t.x, z: t.z }, rich ? 'Cache' : 'Stash' );
		const dx = t.x - p.x, dz = t.z - p.z;
		g.toast( `Marked: ${fmtDist( Math.hypot( dx, dz ) )} ${cardinal( dx, dz )}`, 'info' );
		g.app?.ui?.inventory?.refresh?.();
		return t;
	}

	// ---- interactions: light the fire pit, salvage the wreck, cut the parachute, break the cash box, dig ---------------------------

	provide( ray, maxDist ) {
		const g = this.game;
		if ( g.player.vehicle ) return null;
		let best = null, bt = maxDist;
		const o = ray.origin;
		for ( const A of this.active.values() ) {
			if ( A.d > 30 || ! A.acts.length ) continue;
			for ( const w of A.acts ) {
				const c = w.c, r = w.a.r;
				if ( Math.abs( c.x - o.x ) > r + maxDist || Math.abs( c.z - o.z ) > r + maxDist ) continue;
				const t = w.a.box ? rayYawBox( o, ray.dir, c, A.site.yaw, w.a.box, bt ) : raySphere( o, ray.dir, c, r, bt );
				if ( t === null || t >= bt ) continue;
				const cand = this._act( A, w.a, c );
				// the site's own boxes (the wreck, the stand) must not hide its prompt
				if ( cand ) { bt = t; best = cand; cand.t = t; cand.owner = A.owner; }
			}
		}
		return best ? [ best ] : null;
	}

	// pos: the F spot (shared: copy it before changing it)
	_act( A, a, pos ) {
		const g = this.game, inv = g.player.inventory, hours = g.time.hours, s = A.site;
		const key = s.key + ':' + a.act;
		const creative = g.mode === 'creative';
		const id = 'site:' + key;
		const has = ( ...kinds ) => creative || kinds.some( k => inv.hasTool( k ) );
		switch ( a.act ) {
			case 'light_fire': {
				if ( ! this.state.usable( key, hours ) || ! g.crafting?.placeFire ) return null;
				const src = creative || g.crafting.fireSource?.();
				return { id, label: 'Light fire', sub: src ? 'Fire pit' : 'Need a lighter or matches', action: () => {
					if ( ! ( creative || g.crafting.fireSource?.() ) ) { g.toast( 'Need a lighter or matches', 'warn' ); return; }
					const f = g.crafting.placeFire( 'campfire', pos.clone().setY( pos.y - a.h ), { lit: false, fuel: 1.5, yaw: s.yaw } );
					this.state.use( key, g.time.hours );
					g.crafting.lightFire?.( f );
				} };
			}
			case 'cut_chute': {
				if ( ! this.state.usable( key, hours ) ) return null;
				const ok = has( 'cut' );
				return { id, label: 'Cut parachute', sub: ok ? 'Tarp and rope' : 'Need a blade', action: () => {
					if ( ! has( 'cut' ) ) { g.toast( 'Need a blade', 'warn' ); return; }
					g.actions.start( { label: 'Cutting', time: creative ? 0.5 : 6, cancelOnMove: true, onDone: () => {
						this.state.use( key, g.time.hours );
						g.give( 'tarp', 2 ); g.give( 'rope', 3 );
						g.skills?.xp?.( 'survival', 6 );
						g.toast( 'Got tarp and rope', 'good' );
					} } );
				} };
			}
			case 'salvage': {
				if ( ! this.state.usable( key, hours, KINDS[ s.kind ]?.respawn ?? 240 ) ) return null;
				const ok = has( 'pry', 'toolbox' );
				return { id, label: 'Salvage', sub: ok ? 'Wreck' : 'Need a crowbar or toolbox', action: () => {
					if ( ! has( 'pry', 'toolbox' ) ) { g.toast( 'Need a crowbar or toolbox', 'warn' ); return; }
					g.events.emit( 'noise', { pos: pos.clone(), radius: 30, source: g.player, kind: 'metal' } );
					g.audio?.play?.( 'hit_metal', { pos, vol: 0.6, rate: 0.8 } );
					g.actions.start( { label: 'Salvaging', time: creative ? 0.6 : 9, cancelOnMove: true, onDone: () => {
						this.state.use( key, g.time.hours );
						const R = rng( hash32( strHash( key ), this.seed, Math.floor( g.time.hours ) ) );
						g.give( 'scrap_metal', 2 + Math.floor( R() * 3 ) ); g.give( 'wire', 1 + Math.floor( R() * 2 ) );
						if ( R() < 0.4 ) g.give( 'car_battery', 1 );
						if ( R() < 0.3 ) g.give( 'duct_tape', 1 );
						g.skills?.xp?.( 'mechanics', 8 );
						g.toast( 'Salvaged parts', 'good' );
					} } );
				} };
			}
			case 'cash_box': {
				if ( ! this.state.usable( key, hours, KINDS[ s.kind ]?.respawn ?? 72 ) ) return null;
				const ok = has( 'pry', 'chop', 'cut' );
				return { id, label: 'Break open', sub: ok ? 'Cash box' : 'Need a crowbar or blade', action: () => {
					if ( ! has( 'pry', 'chop', 'cut' ) ) { g.toast( 'Need a crowbar or blade', 'warn' ); return; }
					g.actions.start( { label: 'Prying', time: creative ? 0.4 : 3, cancelOnMove: true, onDone: () => {
						this.state.use( key, g.time.hours );
						g.audio?.play?.( 'hit_wood', { pos, vol: 0.5 } );
						g.events.emit( 'noise', { pos: pos.clone(), radius: 12, source: g.player, kind: 'wood' } );
						const R = rng( hash32( strHash( key ), this.seed, Math.floor( g.time.hours ) ) );
						const n = 3 + Math.floor( R() * 40 );
						g.give( 'cash', n );
						g.toast( `$${n}`, 'good' );
					} } );
				} };
			}
			case 'dig': {
				if ( this.state.isDug( s.key ) ) return null;
				const ok = has( 'dig' );
				return { id, label: 'Dig', sub: ok ? 'Loose soil' : 'Need a shovel', action: () => {
					if ( ! has( 'dig' ) ) { g.toast( 'Need a shovel', 'warn' ); return; }
					g.actions.start( { label: 'Digging', time: creative ? 1 : 7, cancelOnMove: true, sound: 'step_sand', onDone: () => this.dig( s ) } );
				} };
			}
		}
		return null;
	}

	// dig a stash up: the site rebuilds open, its cache lying around the hole
	dig( s ) {
		const g = this.game;
		this.state.dig( s.key, g.time.hours );
		this._unmark( s.key );
		const A = this.active.get( s.key );
		if ( A ) this._unbuild( A );
		const B = this._buildSite( s );
		B.d = Math.hypot( s.x - g.player.pos.x, s.z - g.player.pos.z );
		this._spawnItems( B );
		g.events.emit( 'noise', { pos: new THREE.Vector3( s.x, B.y0, s.z ), radius: 14, source: g.player, kind: 'dig' } );
		g.skills?.xp?.( 'survival', 10 );
		g.toast( s.rich ? 'Found a cache' : 'Found a stash', 'good' );
	}

	// ---- debug and tests ----------------------------------------------------------------------------------------------------

	debugPlace( kind, pos, o = {} ) {
		if ( ! KINDS[ kind ] ) return null;
		const id = this.nextId ++;
		const s = { kind, key: 'dbg:' + id, x: pos.x, z: pos.z, yaw: o.yaw ?? Math.random() * Math.PI * 2, seed: o.seed ?? ( ( Math.random() * 4294967296 ) >>> 0 ), cls: 'debug', ...o.extra };
		if ( kind === 'supply_drop' ) { s.landed = true; s.hours = this.game.time.hours; s.flareT = 0; this.drops.push( s ); }
		else this.extra.set( s.key, s );
		const A = this._buildSite( s );
		A.d = Math.hypot( s.x - this.game.player.pos.x, s.z - this.game.player.pos.z );
		// items: false leaves it bare until it is shown again
		if ( o.items !== false ) this._spawnItems( A ); else A.spawned = true;
		this.lastScan.set( 1e9, 0, 0 );
		return s;
	}

	stats() {
		let tris = 0, draws = 0, items = 0;
		for ( const A of this.active.values() ) { tris += A.tris || 0; draws += A.group.children.length; items += A.items.length; }
		return { built: this.active.size, queued: this.queue.length, items, tris, draws, plans: this.plans.size, drops: this.drops.length, beacons: this.beacons.length };
	}

	// ---- persistence -----------------------------------------------------------------------------------------------------------

	serialize( save ) {
		save.world = save.world || {};
		const hours = this.game.time.hours;
		// takes from drops that are gone are forgotten with them
		for ( const k of [ ...this.state.taken.keys() ] ) if ( k.startsWith( 'drop:' ) && ! this.drops.some( d => k.startsWith( d.key + ':' ) ) ) this.state.taken.delete( k );
		// debug-placed sites aren't saved, nor is what was done to them
		const st = this.state.serialize( hours );
		for ( const m of [ st.taken, st.used, st.dug ] ) for ( const k in m ) if ( k.startsWith( 'dbg:' ) ) delete m[ k ];
		save.world.sites = {
			...st,
			drops: this.drops.filter( d => ! d.key.startsWith( 'dbg' ) ).map( d => ( { id: d.id, x: Math.round( d.x * 100 ) / 100, z: Math.round( d.z * 100 ) / 100, yaw: Math.round( d.yaw * 1000 ) / 1000, seed: d.seed, hours: d.hours } ) ),
			nextDrop: this.nextDrop, nextId: this.nextId,
		};
	}

	load( save ) {
		const w = save.world?.sites;
		if ( ! w ) return;
		this.state.load( w );
		this.nextDrop = Number.isFinite( w.nextDrop ) ? w.nextDrop : null;
		this.nextId = Math.max( this.nextId, w.nextId || 1 );
		this.drops = ( w.drops || [] ).filter( d => Number.isFinite( d.x ) && Number.isFinite( d.z ) ).map( d => ( { ...d, key: 'drop:' + d.id, kind: 'supply_drop', landed: true, cls: 'drop', flareT: FLARE_S } ) );
		// markers survive in the markers' own save: relink them to their sites
		for ( const m of this.game.markers?.list?.() || [] ) if ( m.kind === 'site' && m.site ) this.marks.set( m.site, m.id );
		this.lastScan.set( 1e9, 0, 0 );
	}

	dispose() {
		for ( const A of [ ...this.active.values() ] ) this._unbuild( A );
		for ( const d of this.drops ) if ( d.flight ) { this.group.remove( d.flight ); d.flight.traverse( o => o.geometry?.dispose() ); }
		this.game.scene.remove( this.group );
		this.offTaken?.();
		this.offProvider?.();
	}
}

// where a ray enters a box turned by yaw about its centre c (0 when it starts inside), or null
function rayYawBox( o, d, c, yaw, [ hx, hy, hz ], maxT ) {
	const cs = Math.cos( yaw ), sn = Math.sin( yaw );
	const dx = o.x - c.x, dz = o.z - c.z;
	const ol = [ dx * cs - dz * sn, o.y - c.y, dx * sn + dz * cs ], dl = [ d.x * cs - d.z * sn, d.y, d.x * sn + d.z * cs ], h = [ hx, hy, hz ];
	let t0 = 0, t1 = maxT;
	for ( let i = 0; i < 3; i ++ ) {
		if ( Math.abs( dl[ i ] ) < 1e-9 ) { if ( Math.abs( ol[ i ] ) > h[ i ] ) return null; continue; }
		let a = ( - h[ i ] - ol[ i ] ) / dl[ i ], b = ( h[ i ] - ol[ i ] ) / dl[ i ];
		if ( a > b ) { const q = a; a = b; b = q; }
		if ( a > t0 ) t0 = a;
		if ( b < t1 ) t1 = b;
		if ( t0 > t1 ) return null;
	}
	return t0;
}

// clear of trees and shrubs around each kind (m, half side of a square)
// (the vegetation adds its own margins: shrubs a couple of metres, big trees nine; a body or a dropped bag needs none)
const OBST_R = {
	bus_stop: 2.4, crash_car: 3.5, beach_camp: 3, campsite: 4, fishing_spot: 2.2, checkpoint: 6, military_checkpoint: 7,
	heli_crash: 12, fema_camp: 15, farm_stand: 3, picnic: 2.6,
};

// how far out a prop reaches (m): the big ones settle to the lowest ground under them
const FOOT_DIRS = [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ];
const FOOT_R = {
	tent_dome: 1.0, tent_ridge: 0.9, tent_mil: 2.1, tent_fema: 2.6, heli: 3.2, heli_tail: 2.2, car: 1.8, bus_shelter: 1.4, farm_stand: 1.2,
	picnic_table: 0.8, drop_crate: 0.6, porta_potty: 0.5, pallet_load: 0.5, pallet: 0.5, sandbags: 1.0, canopy: 1.3, folding_table: 0.8, cot: 0.8,
	crate_mil: 0.4, sign_board: 0.7, parachute: 1.5,
};

export function install( game ) {
	const sites = new Sites( game );
	game.sites = sites;
	game.register( sites );
	// /summon site_<kind>
	game.spawnables = game.spawnables || {};
	for ( const kind of KIND_LIST ) game.spawnables[ 'site_' + kind ] = { desc: KINDS[ kind ].label, distance: 6, spawn: ( pos, o = {} ) => sites.debugPlace( kind, pos, { yaw: o.yaw } ) };
	return sites;
}
