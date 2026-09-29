// Buildings & interiors (game.city): every building on the islands, streamed around the camera.
//
//   far cells (512 m)  merged far shells: massing, roofs, facades with shader-drawn windows (lod 1)
//   near cells (128 m) near shells with detail (railings, awnings, signs, canopies, steps, paved lots) and coarse
//                      colliders so nothing is walk-through
//   interiors          buildings within ~90 m (dropped past ~130 m) get real storeys: the ground storey plus the
//                      storeys around the player's (lobby + stairwell + the floors near you in a tower). The shell
//                      hides exactly the storeys whose interior is in, through a per-building state texture, so the
//                      swap is seamless; everything is built in the world workers and integrated time-sliced.
//
// Interiors carry doors (open / close, locks: lockpick, pry tool or kicking; the infected bash them), searchable
// containers (loot rolled deterministically on first search, saved), loose loot on tables and shelves, beds and
// couches to sleep on, taps (only some buildings still have water) and a few candles left burning.
//
// API: types(), locate(type, pos) -> { name, x, z }, doorAt(pos, r) -> door with bash(amount), isIndoors(pos),
// buildingAt(pos) -> { i, type, label, city, x, z, storey } | null, gasPumps() -> [ { x, y, z, name } ],
// update(dt), serialize(save), load(save), dispose(). State: save.world.doors / containers / looted.
import * as THREE from 'three';
import { NF, readBuilding, fitToGround, shapeOf, rectOf, pumpsOf, LABEL, LOCATE, NEAR_CELL, FAR_CELL, cellKey, hash32, strHash, rng, BOX_STRIDE, PMAT, PK } from './buildings/data.js';
import { buildingMaterials, setBuildingState, commitState, setShadowsEnabled, geoToBuffer, decalToBuffer, glassToBuffer } from './buildings/materials.js';
import { Doors } from './buildings/doors.js';
import { rollLoot } from '../game/items/Loot.js';

const IN_LOAD = 90, IN_DROP = 130; // interior hysteresis (m from the built rect)
const MAX_INTERIORS = 30;
const SHADOW_D = 18; // interiors closer than this cast the sun's shadows themselves
const NEAR_R = 330, NEAR_OUT = 450; // near shells
const BUDGET_MS = 5; // main-thread integration per frame
const QUALITY = { low: 0.7, medium: 0.85, high: 1, ultra: 1.2 };
const RESPAWN_H = 72; // loose loot comes back after three game days

const _v = new THREE.Vector3(), _o = new THREE.Vector3();

export function install( game ) {
	const city = new City( game );
	game.city = city;
	game.world.indoorTest = ( p ) => city.isIndoors( p );
	game.register( city );
	return city;
}

class City {
	constructor( game ) {
		this.game = game;
		this.world = game.world;
		this.meta = game.world.meta;
		this.pool = game.world.pool;
		this.physics = game.physics;
		this.cities = this.meta.cities;
		const B = this.meta.buildings;
		this.data = B.data;
		this.N = Math.floor( B.data.length / NF );
		this.recs = new Array( this.N );
		this.shapes = new Array( this.N );
		this.mats = buildingMaterials( this.N );
		setShadowsEnabled( this.mats, game.settings.get( 'shadows' ) !== 'off' );
		this.offShadows = game.settings.on?.( 'shadows', v => setShadowsEnabled( this.mats, v !== 'off' ) );
		this.group = new THREE.Group();
		this.group.name = 'buildings';
		game.scene.add( this.group );
		// spatial index by building centre
		this.nearIdx = new Map(); this.farIdx = new Map();
		for ( let i = 0; i < this.N; i ++ ) {
			const r = this.rec( i );
			const nk = cellKey( Math.floor( r.x / NEAR_CELL ), Math.floor( r.z / NEAR_CELL ) ), fk = cellKey( Math.floor( r.x / FAR_CELL ), Math.floor( r.z / FAR_CELL ) );
			( this.nearIdx.get( nk ) || this.nearIdx.set( nk, [] ).get( nk ) ).push( i );
			( this.farIdx.get( fk ) || this.farIdx.set( fk, [] ).get( fk ) ).push( i );
		}
		this.far = new Map(); this.near = new Map();
		this.nearReady = new Uint8Array( this.N );
		this.shellBoxes = new Map(); // building -> coarse boxes while only its shell is near
		this.interiors = new Map();
		this.queue = [];
		this.doors = new Doors( this );
		this.containers = new Map(); // key -> live container (opened this session)
		this.saved = { containers: {}, looted: {} };
		this.searched = new Set();
		this.lightSrc = [];
		this.evalT = 1; this.lightT = 0;
		this.stateTouched = new Set();
		this.offProvider = game.interact.addProvider( ( ray, maxDist ) => this.provide( ray, maxDist ) );
		this.offTaken = null;
		this.seed = ( game.seed | 0 ) || 1;
	}

	rec( i ) { return this.recs[ i ] || ( this.recs[ i ] = fitToGround( readBuilding( this.data, i ), this.game.hf, this.cities ) ); }
	shape( i ) {
		let s = this.shapes[ i ];
		if ( ! s ) { const S = shapeOf( this.rec( i ), this.cities ); s = this.shapes[ i ] = { S, rect: rectOf( S ) }; }
		return s;
	}
	toLocal( r, x, z ) { const dx = x - r.x, dz = z - r.z; return [ dx * r.c + dz * r.s, - dx * r.s + dz * r.c ]; }
	toWorld( r, lx, lz ) { return [ r.x + lx * r.c - lz * r.s, r.z + lx * r.s + lz * r.c ]; }
	// distance from (x, z) to building i's built rect
	rectDist( i, x, z ) {
		const r = this.rec( i ), { rect } = this.shape( i );
		const [ lx, lz ] = this.toLocal( r, x, z );
		const dx = Math.max( rect.x0 - lx, 0, lx - rect.x1 ), dz = Math.max( rect.z0 - lz, 0, lz - rect.z1 );
		return Math.hypot( dx, dz );
	}

	// ---- per frame ---------------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game;
		if ( ! this.offTaken && g.items3d?.addTakenListener ) this.offTaken = g.items3d.addTakenListener( ( item ) => this._taken( item ) );
		this.evalT += dt;
		if ( this.evalT > 0.3 ) { this.evalT = 0; this._stream(); this._interiors(); }
		this._integrate();
		this.doors.update( dt );
		this.lightT += dt;
		if ( this.lightT > 0.5 ) { this.lightT = 0; this._lights(); }
		for ( const bi of this.stateTouched ) this._state( bi );
		this.stateTouched.clear();
		commitState( this.mats );
	}

	// ---- shells ---------------------------------------------------------------------------------------------------

	_stream() {
		const cam = this.game.camera.position;
		const q = QUALITY[ this.game.settings.get( 'quality' ) ] || 1;
		const farR = THREE.MathUtils.clamp( ( this.game.settings.get( 'renderDistance' ) || 1400 ) * 1.9, 1500, 4200 );
		const nearR = NEAR_R * q, nearOut = NEAR_OUT * q;
		const cellDist = ( i, j, size ) => {
			const x0 = i * size, z0 = j * size;
			return Math.hypot( Math.max( x0 - cam.x, 0, cam.x - x0 - size ), Math.max( z0 - cam.z, 0, cam.z - z0 - size ) );
		};
		for ( const [ key, ids ] of this.farIdx ) {
			const i = Math.floor( key / 8192 ) - 4096, j = ( key % 8192 ) - 4096;
			const d = cellDist( i, j, FAR_CELL );
			const c = this.far.get( key );
			if ( d < farR && ! c ) this._request( this.far, key, i, j, FAR_CELL, 1, ids, 0.8 + d / 2000 );
			else if ( c && d > farR + 600 ) this._drop( this.far, c );
		}
		const i0 = Math.floor( ( cam.x - nearOut ) / NEAR_CELL ), i1 = Math.floor( ( cam.x + nearOut ) / NEAR_CELL );
		const j0 = Math.floor( ( cam.z - nearOut ) / NEAR_CELL ), j1 = Math.floor( ( cam.z + nearOut ) / NEAR_CELL );
		for ( let i = i0; i <= i1; i ++ ) for ( let j = j0; j <= j1; j ++ ) {
			const key = cellKey( i, j );
			const ids = this.nearIdx.get( key );
			if ( ! ids || this.near.has( key ) ) continue;
			const d = cellDist( i, j, NEAR_CELL );
			if ( d < nearR ) this._request( this.near, key, i, j, NEAR_CELL, 0, ids, 0.3 + d / 900 );
		}
		for ( const c of [ ...this.near.values() ] ) if ( cellDist( c.i, c.j, NEAR_CELL ) > nearOut ) this._drop( this.near, c );
	}

	_request( map, key, i, j, size, lod, ids, pri ) {
		const ox = ( i + 0.5 ) * size, oz = ( j + 0.5 ) * size;
		const c = { key, i, j, lod, ids, ox, oz, mesh: null, ready: false, job: null, dead: false };
		map.set( key, c );
		c.job = this.pool.submit( { type: 'buildings', op: 'cell', ids, lod, ox, oz }, pri );
		c.job.promise.then( res => { c.job = null; if ( c.dead || ! res ) return; this.queue.push( { kind: 'cell', c, res } ); } ).catch( e => { console.error( 'buildings cell', e ); } );
	}

	_drop( map, c ) {
		c.dead = true;
		if ( c.job ) c.job.cancelled = true;
		map.delete( c.key );
		if ( c.mesh ) { this.group.remove( c.mesh ); c.mesh.geometry.dispose(); }
		if ( c.lod === 0 && c.ready ) for ( const bi of c.ids ) { this.nearReady[ bi ] = 0; this._shellBoxes( bi, false ); this.stateTouched.add( bi ); }
	}

	_cellReady( c, res ) {
		if ( res.geo ) {
			const geo = geoToBuffer( res.geo );
			const m = new THREE.Mesh( geo, c.lod ? this.mats.far : this.mats.near );
			m.customDepthMaterial = c.lod ? this.mats.depthFar : this.mats.depthNear;
			m.position.set( c.ox, 0, c.oz );
			m.castShadow = true; m.receiveShadow = true;
			m.matrixAutoUpdate = false; m.updateMatrix();
			m.name = ( c.lod ? 'bld-far-' : 'bld-near-' ) + c.key;
			this.group.add( m );
			c.mesh = m;
		}
		c.ready = true;
		if ( c.lod === 0 ) for ( const bi of c.ids ) { this.nearReady[ bi ] = 1; if ( ! this.interiors.get( bi )?.groundReady ) this._shellBoxes( bi, true ); this.stateTouched.add( bi ); }
	}

	// the coarse colliders of a building seen only as a shell: the block, and a gas station's pump islands
	_shellBoxes( bi, on ) {
		const P = this.physics;
		const old = this.shellBoxes.get( bi );
		if ( old ) { for ( const b of old ) P.remove( b ); this.shellBoxes.delete( bi ); }
		if ( ! on ) return;
		const r = this.rec( bi ), { S, rect } = this.shape( bi );
		// never box in the player (a save made indoors, a teleport): the interior is coming anyway
		const pp = this.game.player.pos;
		const [ px, pz ] = this.toLocal( r, pp.x, pp.z );
		if ( px > rect.x0 - 1 && px < rect.x1 + 1 && pz > rect.z0 - 1 && pz < rect.z1 + 1 && pp.y < S.top + 2 ) return;
		const list = [];
		const add = ( lx0, y0, lz0, lx1, y1, lz1, mat = 'concrete' ) => {
			const [ x, z ] = this.toWorld( r, ( lx0 + lx1 ) / 2, ( lz0 + lz1 ) / 2 );
			list.push( P.add( { x, y: ( y0 + y1 ) / 2, z, hx: ( lx1 - lx0 ) / 2, hy: ( y1 - y0 ) / 2, hz: ( lz1 - lz0 ) / 2, yaw: - r.angle, mat, owner: this } ) );
		};
		const top = S.arch === 'tent' ? S.fy + 2.2 : S.top + ( S.roof === 'flat' ? 0.08 : 0 );
		add( rect.x0, r.lo - 0.8, rect.z0, rect.x1, top, rect.z1, S.arch === 'tent' ? 'foliage' : 'concrete' );
		for ( const [ px, pz ] of pumpsOf( r, S ) ) { const y = this.game.hf.heightAt( ...this.toWorld( r, px, pz ) ); add( px - 0.7, y - 0.5, pz - 1.3, px + 0.7, y + 1.7, pz + 1.3, 'metal' ); }
		if ( S.arch === 'fire' ) add( rect.x1 - 3.2, r.lo - 0.5, rect.z1, rect.x1, S.top + 5.2, rect.z1 + 3.2 );
		this.shellBoxes.set( bi, list );
	}

	// what the shells hide of building bi: its far shell once the near one is in, and the storeys of the near
	// shell whose real interior is in
	_state( bi ) {
		const I = this.interiors.get( bi );
		let s0 = 255, s1 = 0, extra = 0;
		if ( I && I.groundReady && this.rec( bi ).type !== 'mil_tent' ) {
			const up = [];
			for ( const [ si, st ] of I.storeys ) if ( st.ready && si > 0 ) up.push( si );
			extra = 1; // the ground storey
			if ( up.length ) { s0 = Math.min( ...up ); s1 = Math.max( ...up ); }
		}
		setBuildingState( this.mats, bi, this.nearReady[ bi ] === 1, s0, s1, extra, !! ( I && I.shadows ) );
	}

	// ---- interiors -------------------------------------------------------------------------------------------------

	_interiors() {
		const p = this.game.player.pos;
		const want = [];
		const ci = Math.floor( p.x / NEAR_CELL ), cj = Math.floor( p.z / NEAR_CELL );
		for ( let i = ci - 1; i <= ci + 1; i ++ ) for ( let j = cj - 1; j <= cj + 1; j ++ ) {
			const ids = this.nearIdx.get( cellKey( i, j ) );
			if ( ! ids ) continue;
			for ( const bi of ids ) { const d = this.rectDist( bi, p.x, p.z ); if ( d < IN_LOAD ) want.push( [ d, bi ] ); }
		}
		want.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
		for ( const [ d, bi ] of want.slice( 0, MAX_INTERIORS ) ) if ( ! this.interiors.has( bi ) ) this.interiors.set( bi, { bi, r: this.rec( bi ), storeys: new Map(), groundReady: false, coarse: [], d } );
		for ( const I of [ ...this.interiors.values() ] ) {
			I.d = this.rectDist( I.bi, p.x, p.z );
			if ( I.d > IN_DROP ) { this._dropInterior( I ); continue; }
			this._storeys( I, p );
			// decals and glass panes only matter up close (each is a draw call per storey)
			for ( const st of I.storeys.values() ) for ( const m of st.meshes ) {
				if ( m.material === this.mats.decal ) m.visible = I.d < 35;
				else if ( m.material === this.mats.glass ) m.visible = I.d < 60;
			}
			// only the interiors around you cast sun shadows (the shell casts for the rest)
			const sh = I.d < SHADOW_D;
			if ( sh !== !! I.shadows ) {
				I.shadows = sh;
				for ( const st of I.storeys.values() ) for ( const m of st.meshes ) if ( m.material === this.mats.interior ) m.castShadow = sh;
				this.stateTouched.add( I.bi );
			}
		}
	}

	// which storeys to have: the ground one always, and those around the player's when inside or close
	_storeys( I, p ) {
		const { S } = this.shape( I.bi );
		let ps = 0;
		for ( let i = 0; i < S.n; i ++ ) if ( p.y >= S.ys[ i ] - 0.6 ) ps = i;
		const inside = I.d < 4;
		const want = new Set( [ 0 ] );
		if ( inside ) { for ( let k = ps - 1; k <= ps + 1; k ++ ) if ( k >= 0 && k < S.n ) want.add( k ); }
		else if ( ps > 0 && I.d < 25 ) want.add( ps );
		for ( const si of want ) if ( ! I.storeys.has( si ) ) this._requestStorey( I, si );
		// drop storeys far from the player's (a little hysteresis)
		for ( const [ si, st ] of [ ...I.storeys ] ) {
			if ( si === 0 || want.has( si ) ) continue;
			if ( inside && Math.abs( si - ps ) <= 2 ) continue;
			this._dropStorey( I, si, st );
		}
	}

	_requestStorey( I, si ) {
		const st = { si, ready: false, dead: false, job: null, meshes: [], boxes: [], doors: [], containers: [], beds: [], taps: [], items: [], lights: [] };
		I.storeys.set( si, st );
		st.job = this.pool.submit( { type: 'buildings', op: 'storey', i: I.bi, si }, 0.05 + I.d / 900 + si * 0.01 );
		st.job.promise.then( res => { st.job = null; if ( st.dead || ! res ) return; this.queue.push( { kind: 'storey', I, st, res } ); } ).catch( e => console.error( 'buildings storey', e ) );
	}

	_dropStorey( I, si, st ) {
		st.dead = true;
		if ( st.job ) st.job.cancelled = true;
		I.storeys.delete( si );
		if ( ! st.ready ) return;
		for ( const m of st.meshes ) { this.group.remove( m ); m.geometry.dispose(); }
		for ( const b of st.boxes ) this.physics.remove( b );
		for ( const d of st.doors ) this.doors.remove( d );
		for ( const it of st.items ) if ( ! it.removed ) this.game.items3d?.remove?.( it );
		for ( const l of st.lights ) this.game.itemLights?.remove?.( l.src );
		if ( si === 0 ) { I.groundReady = false; if ( this.nearReady[ I.bi ] ) this._shellBoxes( I.bi, true ); }
		this._coarse( I );
		this.stateTouched.add( I.bi );
	}

	_dropInterior( I ) {
		for ( const [ si, st ] of [ ...I.storeys ] ) this._dropStorey( I, si, st );
		for ( const b of I.coarse ) this.physics.remove( b );
		I.coarse = [];
		this.interiors.delete( I.bi );
		this.stateTouched.add( I.bi );
	}

	// coarse boxes filling the storeys whose interior isn't in (blocks walking and bullets into the shell)
	_coarse( I ) {
		for ( const b of I.coarse ) this.physics.remove( b );
		I.coarse = [];
		if ( ! I.groundReady ) return;
		const r = I.r, { S, rect } = this.shape( I.bi );
		const sT = S.arch === 'house' ? 0.22 : 0.3;
		let a = - 1;
		const pp = this.game.player.pos;
		const [ px, pz ] = this.toLocal( r, pp.x, pp.z );
		const inRect = px > rect.x0 - 0.5 && px < rect.x1 + 0.5 && pz > rect.z0 - 0.5 && pz < rect.z1 + 0.5;
		const flush = ( s0, s1 ) => {
			const y0 = S.ys[ s0 ] - sT, y1 = s1 === S.n - 1 ? S.top + ( S.roof === 'flat' ? 0.08 : 0 ) : S.ys[ s1 + 1 ] - sT;
			// leave out the stretch the player stands in until its storey is in
			if ( inRect && pp.y + 1.8 > y0 && pp.y < y1 ) {
				let k = s0;
				for ( let i = s0; i <= s1; i ++ ) if ( pp.y >= S.ys[ i ] - 0.6 ) k = i;
				if ( k > s0 ) flush( s0, k - 1 );
				if ( k < s1 ) flush( k + 1, s1 );
				return;
			}
			const [ x, z ] = this.toWorld( r, ( rect.x0 + rect.x1 ) / 2, ( rect.z0 + rect.z1 ) / 2 );
			I.coarse.push( this.physics.add( { x, y: ( y0 + y1 ) / 2, z, hx: ( rect.x1 - rect.x0 ) / 2, hy: ( y1 - y0 ) / 2, hz: ( rect.z1 - rect.z0 ) / 2, yaw: - r.angle, mat: 'concrete', owner: I } ) );
		};
		for ( let si = 1; si < S.n; si ++ ) {
			const loaded = I.storeys.get( si )?.ready;
			if ( ! loaded && a < 0 ) a = si;
			if ( loaded && a >= 0 ) { flush( a, si - 1 ); a = - 1; }
		}
		if ( a >= 0 ) flush( a, S.n - 1 );
	}

	// ---- integration (time-sliced) --------------------------------------------------------------------------------

	_integrate() {
		const t0 = performance.now();
		while ( this.queue.length ) {
			// interiors first, nearest first; an upper storey waits until its ground storey is in
			let k = - 1;
			for ( let i = 0; i < this.queue.length; i ++ ) {
				const q = this.queue[ i ];
				const dead = q.kind === 'cell' ? q.c.dead : q.st.dead;
				// an interior joins its near shell (which hides the storeys it replaces); upper storeys wait for the ground one
				if ( ! dead && q.kind === 'storey' && ( ! this.nearReady[ q.I.bi ] || ( q.st.si > 0 && ! q.I.groundReady ) ) ) continue;
				if ( k < 0 || rank( q ) < rank( this.queue[ k ] ) ) k = i;
			}
			if ( k < 0 ) break;
			const q = this.queue.splice( k, 1 )[ 0 ];
			if ( q.kind === 'cell' ) { if ( ! q.c.dead ) this._cellReady( q.c, q.res ); }
			else if ( ! q.st.dead && this.interiors.get( q.I.bi ) === q.I ) this._storeyReady( q.I, q.st, q.res );
			if ( performance.now() - t0 > BUDGET_MS ) break;
		}
	}

	_storeyReady( I, st, res ) {
		const r = I.r, g = this.game;
		const yaw = - r.angle;
		const place = ( m ) => { m.position.set( r.x, 0, r.z ); m.rotation.y = yaw; m.matrixAutoUpdate = false; m.updateMatrix(); this.group.add( m ); st.meshes.push( m ); return m; };
		if ( res.geo ) { const m = place( new THREE.Mesh( geoToBuffer( res.geo ), this.mats.interior ) ); m.castShadow = !! I.shadows; m.receiveShadow = true; }
		if ( res.dec ) { const m = place( new THREE.Mesh( decalToBuffer( res.dec ), this.mats.decal ) ); m.receiveShadow = true; m.renderOrder = 1; }
		if ( res.glass ) { const m = place( new THREE.Mesh( glassToBuffer( res.glass ), this.mats.glass ) ); m.layers.set( 1 ); }
		// colliders
		const B = res.boxes, P = this.physics;
		for ( let k = 0; k < B.length; k += BOX_STRIDE ) {
			const [ x, z ] = this.toWorld( r, B[ k ], B[ k + 2 ] );
			st.boxes.push( P.add( { x, y: B[ k + 1 ], z, hx: B[ k + 3 ], hy: B[ k + 4 ], hz: B[ k + 5 ], yaw: yaw + B[ k + 6 ], mat: PMAT[ B[ k + 7 ] ] || 'concrete', kind: PK[ B[ k + 8 ] ] || 'solid', owner: st } ) );
		}
		for ( const rec of res.doors ) st.doors.push( this.doors.add( I, st.si, rec ) );
		// containers, beds and taps as world-space oriented boxes / points
		const obb = ( o ) => { const [ x, z ] = this.toWorld( r, o.cx, o.cz ); return { ...o, x, y: o.cy, z, yaw: yaw + ( o.yaw || 0 ) }; };
		st.containers = res.containers.map( obb );
		st.beds = res.beds.map( obb );
		st.taps = res.taps.map( t => { const [ x, z ] = this.toWorld( r, t.x, t.z ); return { ...t, x, z, water: this._hasWater( I.bi, st.si ) }; } );
		for ( const l of res.lights ) {
			const [ x, z ] = this.toWorld( r, l.x, l.z );
			l.src = { pos: new THREE.Vector3( x, l.y, z ), color: 0xff9a48, intensity: l.kind === 'lantern' ? 3.2 : 1.8, range: l.kind === 'lantern' ? 9 : 6, flicker: true, on: false, priority: 0.8 };
			st.lights.push( l );
			g.itemLights?.add?.( l.src );
		}
		this._spawnLoot( I, st, res.spots );
		st.ready = true;
		if ( st.si === 0 ) { I.groundReady = true; this._shellBoxes( I.bi, false ); }
		this._coarse( I );
		this.stateTouched.add( I.bi );
	}

	_hasWater( bi, si ) {
		// the mains still run to some buildings (and not above the third storey, the pumps are off)
		return si < 3 && hash32( bi, 0x7a9 ) % 100 < 45;
	}

	// ---- loose loot --------------------------------------------------------------------------------------------------

	_spawnLoot( I, st, spots ) {
		const items = this.game.items3d;
		if ( ! items?.spawn ) return;
		const r = I.r, hours = this.game.time.hours;
		const looted = this.saved.looted;
		for ( const s of spots ) {
			const t = looted[ s.key ];
			let gen = 0;
			if ( t !== undefined ) {
				if ( hours - t < RESPAWN_H ) continue;
				gen = Math.floor( hours / RESPAWN_H );
			}
			const rnd = rng( hash32( strHash( s.key ), this.seed, gen ) );
			if ( rnd() < 0.35 ) continue; // a third of the spots were cleared out before you came
			const stack = rollLoot( s.table, rnd, 1 )[ 0 ];
			if ( ! stack ) continue;
			const [ x, z ] = this.toWorld( r, s.x, s.z );
			const it = items.spawn( stack, new THREE.Vector3( x, s.y + 0.005, z ), { yaw: s.yaw, key: s.key, persistent: false, settle: false } );
			if ( it ) st.items.push( it );
		}
	}

	_taken( item ) {
		const k = item?.key;
		if ( typeof k === 'string' && /^\d+:\d+:s\d+$/.test( k ) ) this.saved.looted[ k ] = this.game.time.hours;
	}

	// ---- candles at night --------------------------------------------------------------------------------------------

	_lights() {
		const night = ( this.world.sky?.night || 0 ) > 0.35;
		for ( const I of this.interiors.values() ) for ( const st of I.storeys.values() ) for ( const l of st.lights ) l.src.on = night;
	}

	// ---- interactions ------------------------------------------------------------------------------------------------

	provide( ray, maxDist ) {
		const out = [];
		const g = this.game;
		if ( g.player.vehicle ) return out;
		this.doors.provide( ray, maxDist, out );
		const o = ray.origin, dir = ray.dir;
		for ( const I of this.interiors.values() ) {
			if ( I.d > 4 ) continue;
			for ( const st of I.storeys.values() ) {
				if ( ! st.ready ) continue;
				for ( const c of st.containers ) {
					const t = rayOBB( o, dir, c, maxDist );
					if ( t === null ) continue;
					out.push( { t, id: 'cont:' + c.key, label: ( this.searched.has( c.key ) || this.saved.containers[ c.key ] ? 'Open ' : 'Search ' ) + c.label.toLowerCase(), action: () => this.search( c ) } );
				}
				for ( const b of st.beds ) {
					const t = rayOBB( o, dir, b, maxDist );
					if ( t !== null ) out.push( { t: t + 0.02, id: 'bed:' + b.key, label: b.label, action: () => g.sleep( b.q >= 0.9 ? 8 : 6, b.q ) } );
				}
				for ( const tp of st.taps ) {
					_v.set( tp.x, tp.y, tp.z );
					const t = raySphere( o, dir, _v, 0.2, maxDist );
					if ( t === null ) continue;
					const fill = g.player.inventory.find?.( ( s, d ) => d?.tool?.liquid && ( s.data?.amount || 0 ) < d.tool.liquid - 0.01 );
					out.push( { t, id: 'tap:' + tp.key, label: fill ? 'Fill' : 'Drink', sub: 'Tap', noOcclusion: true, action: () => this.useTap( tp, !! fill ) } );
				}
			}
		}
		return out;
	}

	useTap( tp, fill ) {
		const g = this.game;
		g.audio?.play( 'drink', { vol: 0.3 } );
		if ( ! tp.water ) { g.toast( 'No water', 'warn' ); return; }
		if ( fill && g.itemUse?.fillFrom ) { g.itemUse.fillFrom( 'tap' ); return; }
		g.survival?.drink?.( null, 0.4, 'water' );
	}

	hasPry() { return !! this.game.player.inventory.hasTool?.( 'pry' ); }

	search( c ) {
		const g = this.game;
		if ( c.locked && ! this.saved.containers[ c.key ]?.u && ! this.containers.get( c.key )?.unlocked ) {
			const pick = g.player.inventory.count?.( 'lockpick' ) > 0 && c.locked < 2;
			if ( this.hasPry() ) {
				g.actions.start( { label: 'Prying open', time: 4 + c.locked * 3, onDone: () => { this._unlockC( c ); g.events.emit( 'noise', { pos: new THREE.Vector3( c.x, c.y, c.z ), radius: 18, source: g.player, kind: 'door' } ); g.audio?.play( 'hit_metal', { pos: new THREE.Vector3( c.x, c.y, c.z ), vol: 0.8 } ); this._open( c ); } } );
			} else if ( pick ) {
				g.actions.start( { label: 'Picking lock', time: 8, onDone: () => { this._unlockC( c ); this._open( c ); } } );
			} else { g.audio?.play( 'door_locked', { vol: 0.5 } ); g.toast( c.locked >= 2 ? 'Locked, needs a crowbar' : 'Locked', 'warn' ); }
			return;
		}
		if ( this.searched.has( c.key ) || this.saved.containers[ c.key ] ) { this._open( c ); return; }
		g.actions.start( { label: 'Searching', time: 1.4, onDone: () => { this.searched.add( c.key ); this._open( c ); } } );
	}

	_unlockC( c ) {
		const cont = this._container( c );
		cont.unlocked = true;
	}

	_container( c ) {
		let cont = this.containers.get( c.key );
		if ( cont ) return cont;
		const sv = this.saved.containers[ c.key ];
		let items;
		if ( sv ) items = Array.isArray( sv ) ? sv : sv.items || [];
		else {
			const rnd = rng( hash32( strHash( c.key ), this.seed, 0xc0 ) );
			items = rnd() < c.empty ? [] : rollLoot( c.table, rnd, c.n ?? undefined );
		}
		cont = { key: c.key, label: c.label, capacity: c.cap, items, kind: 'furniture', pos: new THREE.Vector3( c.x, c.y, c.z ), unlocked: !! ( sv && sv.u ) };
		this.containers.set( c.key, cont );
		return cont;
	}

	_open( c ) {
		const cont = this._container( c );
		this.game.app?.ui?.openContainer?.( cont );
	}

	// ---- queries --------------------------------------------------------------------------------------------------

	types() { return [ ...new Set( Object.values( LOCATE ) ) ]; }

	locate( type, pos = this.game.player.pos ) {
		const norm = ( s ) => String( s || '' ).toLowerCase().replace( /[^a-z]/g, '' ).replace( /s$/, '' );
		const want = norm( type );
		const keys = Object.keys( LOCATE ).filter( k => norm( LOCATE[ k ] ) === want || norm( k ) === want || norm( LABEL[ k ] ) === want );
		if ( ! keys.length ) return null;
		let best = null, bd = Infinity;
		for ( let i = 0; i < this.N; i ++ ) {
			const r = this.rec( i );
			if ( ! keys.includes( r.type ) ) continue;
			const d = ( r.x - pos.x ) ** 2 + ( r.z - pos.z ) ** 2;
			if ( d < bd ) { bd = d; best = r; }
		}
		if ( ! best ) return null;
		const cityName = this.cities[ best.city ]?.name;
		const { rect } = this.shape( best.i );
		// the spot just outside the front door
		const [ x, z ] = this.toWorld( best, ( rect.x0 + rect.x1 ) / 2, rect.z0 - 2.5 );
		return { name: LABEL[ best.type ] + ( cityName ? ` (${cityName})` : '' ), x, z, i: best.i };
	}

	doorAt( pos, r = 1.5 ) { return this.doors.near( pos, r ); }

	buildingAt( pos, margin = 0 ) {
		const ci = Math.floor( pos.x / NEAR_CELL ), cj = Math.floor( pos.z / NEAR_CELL );
		for ( let i = ci - 1; i <= ci + 1; i ++ ) for ( let j = cj - 1; j <= cj + 1; j ++ ) {
			const ids = this.nearIdx.get( cellKey( i, j ) );
			if ( ! ids ) continue;
			for ( const bi of ids ) {
				const r = this.rec( bi );
				if ( Math.abs( r.x - pos.x ) > 90 || Math.abs( r.z - pos.z ) > 90 ) continue;
				const { S, rect } = this.shape( bi );
				const [ lx, lz ] = this.toLocal( r, pos.x, pos.z );
				if ( lx < rect.x0 - margin || lx > rect.x1 + margin || lz < rect.z0 - margin || lz > rect.z1 + margin ) continue;
				let storey = 0;
				for ( let k = 0; k < S.n; k ++ ) if ( pos.y >= S.ys[ k ] - 0.6 ) storey = k;
				return { i: bi, type: r.type, label: LABEL[ r.type ], city: this.cities[ r.city ]?.name || '', x: r.x, z: r.z, storey, top: S.top, floor: S.fy };
			}
		}
		return null;
	}

	isIndoors( pos ) {
		const b = this.buildingAt( pos );
		if ( ! b ) return false;
		return pos.y > b.floor - 0.4 && pos.y < b.top - 0.3;
	}

	gasPumps() {
		if ( this._pumps ) return this._pumps;
		const out = [];
		for ( let i = 0; i < this.N; i ++ ) {
			const r = this.rec( i );
			if ( r.type !== 'gas' ) continue;
			const { S } = this.shape( i );
			for ( const [ px, pz ] of pumpsOf( r, S ) ) {
				const [ x, z ] = this.toWorld( r, px, pz );
				out.push( { x, y: this.game.hf.heightAt( x, z ), z, name: LABEL.gas + ( this.cities[ r.city ] ? ` (${this.cities[ r.city ].name})` : '' ), i } );
			}
		}
		return ( this._pumps = out );
	}

	// ---- persistence -------------------------------------------------------------------------------------------------

	serialize( save ) {
		const w = save.world = save.world || {};
		w.doors = this.doors.serialize();
		const cs = { ...this.saved.containers };
		for ( const [ k, c ] of this.containers ) cs[ k ] = c.unlocked ? { items: c.items, u: 1 } : c.items;
		w.containers = cs;
		w.looted = this.saved.looted;
	}

	load( save ) {
		const w = save?.world || {};
		this.doors.load( w.doors || {} );
		this.saved.containers = w.containers || {};
		this.saved.looted = w.looted || {};
	}

	dispose() {
		for ( const I of [ ...this.interiors.values() ] ) this._dropInterior( I );
		for ( const c of [ ...this.far.values() ] ) this._drop( this.far, c );
		for ( const c of [ ...this.near.values() ] ) this._drop( this.near, c );
		for ( const bi of [ ...this.shellBoxes.keys() ] ) this._shellBoxes( bi, false );
		this.doors.dispose();
		this.offProvider?.();
		this.offTaken?.();
		if ( typeof this.offShadows === 'function' ) this.offShadows();
		this.game.scene.remove( this.group );
		if ( this.game.world.indoorTest ) this.game.world.indoorTest = null;
		// reset the hide state for a next game in this session
		for ( let i = 0; i < this.N; i ++ ) setBuildingState( this.mats, i, false );
		commitState( this.mats );
	}
}

function rank( q ) { return q.kind === 'storey' ? q.I.d * 0.01 + q.st.si * 0.001 : 10 + ( q.c.lod ? 10 : 0 ); }

// ray against an oriented box { x, y, z, hx, hy, hz, yaw }: entry distance or null
function rayOBB( o, d, b, maxT ) {
	const c = Math.cos( b.yaw ), s = Math.sin( b.yaw );
	const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z;
	// into the box frame: local x = (c, -s), local z = (s, c)
	const ou = dx * c - dz * s, ov = dx * s + dz * c, du = d.x * c - d.z * s, dv = d.x * s + d.z * c;
	let t0 = 0, t1 = maxT;
	for ( const [ oo, dd, h ] of [ [ ou, du, b.hx ], [ dy, d.y, b.hy ], [ ov, dv, b.hz ] ] ) {
		if ( Math.abs( dd ) < 1e-9 ) { if ( Math.abs( oo ) > h ) return null; continue; }
		let a = ( - h - oo ) / dd, e = ( h - oo ) / dd;
		if ( a > e ) { const t = a; a = e; e = t; }
		t0 = Math.max( t0, a ); t1 = Math.min( t1, e );
		if ( t0 > t1 ) return null;
	}
	return t0;
}

function raySphere( o, d, c, r, maxT ) {
	_o.subVectors( o, c );
	const b = _o.dot( d ), cc = _o.lengthSq() - r * r;
	const h = b * b - cc;
	if ( h < 0 ) return null;
	const t = - b - Math.sqrt( h );
	return t >= 0 && t <= maxT ? t : null;
}
