// Roads & street furniture: every highway, city street, sidewalk, intersection, runway and taxiway surface,
// the street furniture (lights, poles and power lines, signals, signs, hydrants, bus stops, bins, barriers,
// guardrails, fences) and the outbreak's aftermath (abandoned and wrecked cars, police roadblocks, military
// checkpoints, debris, blood), streamed around the camera.
//
// The world workers build 320 m street cells (src/world/streetgen.js, job "streets"): merged surface meshes
// plus placement records. Near cells (lod 0) carry the props, cars, decals, signs and physics colliders; far
// cells (lod 1) only coarse surfaces. Repeated things are drawn with a few global instanced meshes that are
// refilled from the loaded cells whenever the camera has moved a few metres (distance bands, LODs, shadows).
// The power is out: at night only a few failing streetlights flicker (emissive bulb, a light pool on the ground and,
// for the nearest two, a real point light from the items module's shared light pool, game.itemLights).
//
// API (game.roads): update(dt), dispose(), nearestRoad(pos, maxDist) -> { point, dir, lanes, width, kind, name } | null,
// spawnPoints(center, radius, n) -> [ { pos, yaw } ], lotAt(x, z) -> the parking lot there | null, lots (every
// parking lot: centre x, z, unit axes (ax, az) along its street / (bx, bz) into the block, sizes la x lb), plus the
// "Search trunk / glovebox" interaction on lootable wrecks (state in save.world.wrecks).
import * as THREE from 'three';
import { buildNetwork, CELL, hashStr, mulberry32, nearestOnNetwork, roadsideSpots, lotAt, LOT } from './roads/network.js';
import { PROP, PROP_BOXES, MATS, CAR, CAR_DIMS, CF, CAR_STRIDE, PROP_STRIDE, SIGN_STRIDE, DECAL_STRIDE, BOX_STRIDE, ATLAS_SIZE, atlasRect } from './roads/kinds.js';
import { roadMaterials, makeCarMaterial, makeDynSignMaterial, signBoardGeometry, decalGeometry, ROAD_LIFT, flickerAt } from './roads/materials.js';
import { G } from '../render/Materials.js';
import { MODELS, expandProp } from './roads/models.js';
import { carGeometries, carSpec, carPanels } from './roads/cars.js';
import { guideSign, ATLAS_H, GLOW_CELL } from './roads/textures.js';
import { rollLoot } from '../game/items/Loot.js';

const R_NEAR = 470; // lod 0 cells (props, cars, colliders) within this distance of the camera (cell bounds)
const R_NEAR_OUT = 590; // ... and back to lod 1 beyond this (hysteresis)
const R_FAR_MAX = 1600; // far surfaces out to min(renderDistance, this)
const LAMP_LIGHTS = 2; // real point lights (from the shared light pool) under the nearest flickering lamps
const LAMP_RANGE = 90; // ... within this distance of the camera
const REFILL_MOVE = 5; // refill the instance bands after the camera moved this far (m)
const LOAD_BUDGET = 1.5; // ms per frame for turning arrived near cells into instances and colliders
const LOAD_NOW = 110; // ... except for cells this close (a teleport, the spawn): at once
const NEAR_BAND = 75; // props / cars closer than this cast sun shadows
const QUALITY = { low: 0.65, medium: 0.85, high: 1, ultra: 1.2 }; // scales the near radius and the draw distances

// what the rear storage of each body type is called (prompt "Search <part>", container label)
const PART_NAME = [ 'Trunk', 'Trunk', 'Trunk', 'Truck bed', 'Cargo', 'Trunk', 'Cargo', 'Cargo', 'Luggage' ];
const TRUNK_CAP = [ 24, 18, 32, 36, 48, 22, 30, 60, 30 ];
const CAR_BAND = [ [ 0, 60, 'near', true ], [ 60, 150, 'far', false ], [ 150, 500, 'low', false ] ];
// a week old: the blood has dried dull, oil stays glossy
const DECAL_ROUGH = [ 0.7, 0.75, 0.8, 0.9, 0.2, 0.95, 0.3, 0.9, 0.85, 0.8, 0.9, 0.8 ];

// atlas cells whose sign doesn't fill its cell (octagons, diamonds, shields, the narrower regulatory plates in the
// square misc cells): cut out by the atlas alpha (see textures.js)
const isShaped = ( cell ) => cell >= 200 && cell < 300;

const cellKey = ( ci, cj ) => ( ci + 1000 ) * 10000 + ( cj + 1000 );

// ---- a global instanced mesh, refilled from the cells ----------------------------------------------------------------

class Batch {
	constructor( group, name, geometry, material, attrs, { shadow = false, cap = 64 } = {} ) {
		this.group = group; this.name = name; this.base = geometry; this.material = material;
		this.attrs = attrs; // [ [ name, size ] ]
		this.sizes = attrs.map( ( a ) => a[ 1 ] );
		this.shadow = shadow;
		this.mesh = null; this.cap = 0; this.n = 0;
		this._alloc( cap );
	}
	_alloc( cap ) {
		if ( this.mesh ) { this.group.remove( this.mesh ); this.mesh.geometry.dispose(); this.mesh.dispose(); }
		this.cap = cap;
		const g = new THREE.BufferGeometry();
		for ( const k in this.base.attributes ) g.setAttribute( k, this.base.attributes[ k ] );
		if ( this.base.index ) g.setIndex( this.base.index );
		this.arrays = {};
		this.list = [];
		for ( const [ name, size ] of this.attrs ) {
			const a = new THREE.InstancedBufferAttribute( new Float32Array( cap * size ), size );
			a.setUsage( THREE.DynamicDrawUsage );
			g.setAttribute( name, a );
			this.arrays[ name ] = a;
			this.list.push( a );
		}
		g.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
		const m = new THREE.InstancedMesh( g, this.material, cap );
		m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
		m.name = 'roads-' + this.name;
		m.frustumCulled = false;
		m.castShadow = this.shadow;
		m.receiveShadow = true;
		m.matrixAutoUpdate = false;
		m.count = 0;
		m.visible = false;
		this.mesh = m;
		this.group.add( m );
	}
	begin() { this.n = 0; }
	ensure( n ) { if ( n > this.cap ) this._alloc( Math.max( n, this.cap * 2 ) ); }
	// copy instance k of an instance set (no garbage: this runs for every visible instance on a refill)
	push( set, k ) {
		const i = this.n ++;
		const dm = this.mesh.instanceMatrix.array, sm = set.m;
		for ( let c = 0, o = i * 16, q = k * 16; c < 16; c ++ ) dm[ o + c ] = sm[ q + c ];
		for ( let a = 0; a < this.list.length; a ++ ) {
			const size = this.sizes[ a ], src = set.list[ a ], dst = this.list[ a ].array;
			for ( let c = 0, o = i * size, q = k * size; c < size; c ++ ) dst[ o + c ] = src[ q + c ];
		}
	}
	end() {
		const m = this.mesh;
		// (an emptied band keeps its last upload: nothing to send)
		if ( ! this.n && ! m.count ) return;
		m.count = this.n;
		m.visible = this.n > 0;
		if ( this.n ) {
			m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange( 0, this.n * 16 ); m.instanceMatrix.needsUpdate = true;
			for ( let a = 0; a < this.list.length; a ++ ) { const at = this.list[ a ]; at.clearUpdateRanges(); at.addUpdateRange( 0, this.n * this.sizes[ a ] ); at.needsUpdate = true; }
		}
	}
	dispose() { this.group.remove( this.mesh ); this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

// per-cell instance data of one model: matrices, attributes and positions (for the distance bands)
class InstSet {
	constructor( attrs ) { this.attrs = attrs; this.n = 0; this.m = []; this.a = {}; this.p = []; for ( const [ name ] of attrs ) this.a[ name ] = []; }
	add( matrix, x, z, values ) {
		const e = matrix.elements;
		for ( let i = 0; i < 16; i ++ ) this.m.push( e[ i ] );
		this.p.push( x, z );
		let o = 0;
		for ( const [ name, size ] of this.attrs ) { const arr = this.a[ name ]; for ( let c = 0; c < size; c ++ ) arr.push( values[ o ++ ] ); }
		this.n ++;
	}
	seal() {
		this.m = new Float32Array( this.m ); this.p = new Float32Array( this.p );
		for ( const k in this.a ) this.a[ k ] = new Float32Array( this.a[ k ] );
		this.list = this.attrs.map( ( [ name ] ) => this.a[ name ] );
		return this;
	}
}

const PROP_ATTRS = [ [ 'iTint', 3 ], [ 'iMisc', 4 ] ];
const CAR_ATTRS = [ [ 'iCar', 4 ], [ 'iCar2', 4 ] ];
const DECAL_ATTRS = [ [ 'iDec', 4 ] ];
const SIGN_ATTRS = [ [ 'iRect', 4 ], [ 'iSide', 4 ] ];

// ---- the system -----------------------------------------------------------------------------------------------------

export class Roads {
	constructor( game ) {
		this.game = game;
		this.world = game.world;
		this.hf = game.hf;
		this.settings = game.settings;
		this.pool = game.world.pool;
		this.net = buildNetwork( game.world.meta, game.hf ); // same deterministic network the workers build
		this.lots = this.net.lots;
		this.group = new THREE.Group();
		this.group.name = 'roads';
		game.scene.add( this.group );
		this.mats = roadMaterials();
		this.cells = new Map();
		this.frame = 0;
		this.evalT = 0;
		this.lastRefill = new THREE.Vector3( 1e9, 0, 0 );
		this.dirty = true;
		this.wrecks = new Map(); // container key -> container (opened this session or loaded)
		this.saved = {}; // key -> items from the save, not yet opened this session
		this.lootable = []; // wreck records in the loaded near cells
		this.loading = []; // near cells being built a slice per frame
		this.signTex = new Map(); // guide / welcome sign id -> { tex, refs }: canvases kept for a return trip
		this._buildBatches();
		this._interact();
		this._tmp = { v: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), m2: new THREE.Matrix4(), m3: new THREE.Matrix4(), q2: new THREE.Quaternion(), n: new THREE.Vector3() };
		this._best = [];
	}

	_buildBatches() {
		const G = this.group, M = this.mats;
		this.batches = [];
		// props: a near band with shadows and a far band without
		this.propBatches = {};
		for ( const key in MODELS ) {
			const geo = MODELS[ key ].geo || ( MODELS[ key ].geo = MODELS[ key ].build() );
			const near = new Batch( G, key + '-n', geo, M.prop, PROP_ATTRS, { shadow: true } );
			const far = new Batch( G, key + '-f', geo, M.prop, PROP_ATTRS );
			this.propBatches[ key ] = [ [ near, 0, NEAR_BAND ], [ far, NEAR_BAND, MODELS[ key ].maxD ] ];
			this.batches.push( near, far );
		}
		// cars: per body type near / mid / far bands, one material per type (door and arch regions)
		const cg = carGeometries();
		this.carMats = [];
		this.carBatches = [];
		for ( let t = 0; t < CAR_DIMS.length; t ++ ) {
			const S = carSpec( t ), D = CAR_DIMS[ t ];
			const belt = S.body[ Math.min( 4, S.body.length - 2 ) ][ 2 ];
			const trunkY = S.trunk ? ( S.trunk[ 2 ] === 'tailgate' ? S.body[ S.body.length - 1 ][ 1 ] + 0.1 : belt - 0.06 ) : 99;
			const mat = makeCarMaterial( {
				arch: [ D.W / 2, D.zf, D.zr, D.r ],
				doors: [ ...( S.doors[ 0 ] || [ 99, 99 ] ), ...( S.doors[ 1 ] || [ 99, 99 ] ) ],
				doorY: [ S.body[ 2 ][ 1 ] + 0.06, S.cab.roof - 0.04, belt, S.cab.roof ],
				lids: [ ...( S.trunk ? S.trunk.slice( 0, 2 ) : [ 99, 99 ] ), ...( S.hood || [ 99, 99 ] ) ],
				lidY: [ trunkY, belt - 0.2, 0, 0 ],
			} );
			this.carMats.push( mat );
			const bands = CAR_BAND.map( ( [ d0, d1, lod, shadow ] ) => {
				const b = new Batch( G, 'car' + t + '-' + d0, cg[ lod ][ t ], mat, CAR_ATTRS, { shadow } );
				this.batches.push( b );
				return [ b, d0, d1 ];
			} );
			this.carBatches.push( bands );
		}
		this.panelMat = makeCarMaterial( { panel: true } );
		this.doorBatch = new Batch( G, 'doors', cg.door, this.panelMat, CAR_ATTRS, { shadow: true } );
		this.lidBatch = new Batch( G, 'lids', cg.lid, this.panelMat, CAR_ATTRS, { shadow: true } );
		this.decalBatch = new Batch( G, 'decals', decalGeometry(), M.decal, DECAL_ATTRS, { cap: 256 } );
		this.glowBatch = new Batch( G, 'glow', this.decalBatch.base, M.glow, DECAL_ATTRS, { cap: 32 } );
		this.glowBatch.mesh.renderOrder = 2;
		this.signGeo = signBoardGeometry();
		this.signBatch = new Batch( G, 'signs', this.signGeo, M.sign, SIGN_ATTRS, { shadow: true, cap: 128 } );
		this.batches.push( this.doorBatch, this.lidBatch, this.decalBatch, this.glowBatch, this.signBatch );
	}

	// ---- streaming ----------------------------------------------------------------------------------------------

	update( dt ) {
		this.frame ++;
		const cam = this.world.camera.position;
		this._lampLights( dt, cam );
		// finer terrain LODs (higher detail setting) need less lift far away
		ROAD_LIFT.value = 2.5 / ( { low: 1.6, medium: 2.0, high: 2.5, ultra: 3.2 }[ this.settings.get( 'terrainDetail' ) ] || 2.5 );
		this.evalT -= dt;
		if ( this.evalT <= 0 ) { this.evalT = 0.3; this._stream( cam ); }
		if ( this.loading.length ) this._pump();
		if ( this.dirty || this.lastRefill.distanceToSquared( cam ) > REFILL_MOVE * REFILL_MOVE ) this._refill( cam );
	}

	// build the pending near cells, nearest first, within the frame budget
	_pump() {
		const L = this.loading, t0 = performance.now();
		while ( L.length ) {
			const c = L[ 0 ];
			if ( ! c.pending || c.pending.next().done ) { c.pending = null; L.shift(); }
			if ( performance.now() - t0 > LOAD_BUDGET ) break;
		}
	}

	_cellDist( ci, cj, p ) {
		const x0 = ci * CELL, z0 = cj * CELL;
		const dx = Math.max( x0 - p.x, 0, p.x - x0 - CELL ), dz = Math.max( z0 - p.z, 0, p.z - z0 - CELL );
		return Math.hypot( dx, dz );
	}

	_stream( p ) {
		const rFar = Math.min( R_FAR_MAX, Math.max( 600, this.settings.get( 'renderDistance' ) || 1400 ) );
		const qk = this._quality();
		const c0 = Math.floor( p.x / CELL ), c1 = Math.floor( p.z / CELL ), n = Math.ceil( rFar / CELL ) + 1;
		for ( let dj = - n; dj <= n; dj ++ ) for ( let di = - n; di <= n; di ++ ) {
			const ci = c0 + di, cj = c1 + dj;
			const d = this._cellDist( ci, cj, p );
			if ( d > rFar ) continue;
			const key = cellKey( ci, cj );
			let c = this.cells.get( key );
			if ( ! c ) { c = { key, ci, cj, lod: - 1, want: - 1, job: null, meshes: [], boxes: [], inst: null, dyn: [], wrecks: [], lamps: [] }; this.cells.set( key, c ); }
			// lod 0 near, lod 1 far, with hysteresis
			let want = d < R_NEAR * qk ? 0 : 1;
			if ( c.lod === 0 && d < R_NEAR_OUT * qk ) want = 0;
			c.want = want;
			c.dist = d;
			if ( c.lod !== want && ! c.job ) this._request( c, want, d );
		}
		// drop cells well outside the range, cancel their jobs
		for ( const [ key, c ] of this.cells ) {
			const d = this._cellDist( c.ci, c.cj, p );
			c.dist = d;
			if ( d > rFar + 250 ) {
				if ( c.job ) c.job.cancelled = true;
				this._unload( c );
				this.cells.delete( key );
			}
		}
		if ( this.loading.length > 1 ) this.loading.sort( byDist );
		// keep the nearest cells first in the worker queue as the camera moves
		this.pool.reprioritize( ( msg, pri ) => {
			if ( msg.type !== 'streets' ) return pri;
			const c = this.cells.get( cellKey( msg.ci, msg.cj ) );
			return c ? this._priority( c.dist, msg.lod ) : pri;
		} );
	}

	_quality() { return QUALITY[ this.settings.get( 'quality' ) ] || 1; }

	_priority( d, lod ) { return 0.35 + d / 900 + ( lod ? 0.6 : 0 ); }

	_request( c, lod, d ) {
		const job = this.pool.submit( { type: 'streets', ci: c.ci, cj: c.cj, lod }, this._priority( d, lod ) );
		c.job = job;
		job.promise.then( ( r ) => {
			if ( c.job !== job ) return;
			c.job = null;
			if ( ! r || ! this.cells.has( c.key ) || this.disposed ) return;
			this._unload( c );
			this._load( c, r );
		} ).catch( ( e ) => { c.job = null; console.error( 'streets job', e ); } );
	}

	_unload( c ) {
		if ( c.pending ) { c.pending.return(); c.pending = null; const i = this.loading.indexOf( c ); if ( i >= 0 ) this.loading.splice( i, 1 ); }
		for ( const m of c.meshes ) { this.group.remove( m ); m.geometry.dispose(); }
		c.meshes.length = 0;
		for ( const b of c.boxes ) this.game.physics.remove( b );
		c.boxes.length = 0;
		for ( const s of c.dyn ) { this.group.remove( s ); const e = this.signTex.get( s.userData.sign ); if ( e ) e.refs --; s.material.dispose(); }
		c.dyn.length = 0;
		if ( c.inst ) this.dirty = true;
		c.inst = null;
		c.wrecks.length = 0;
		c.lamps.length = 0;
		c.lod = - 1;
		this._relistLootable();
	}

	_load( c, r ) {
		c.lod = r.lod;
		const ox = r.ox, oz = r.oz;
		const mk = ( data, mat, attrs, name ) => {
			if ( ! data ) return;
			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.BufferAttribute( data.pos, 3 ) );
			g.setAttribute( 'normal', new THREE.BufferAttribute( data.nor, 3, true ) );
			attrs.forEach( ( [ an, size, norm ], i ) => g.setAttribute( an, new THREE.BufferAttribute( data.ex[ i ], size, !! norm ) ) );
			g.setIndex( new THREE.BufferAttribute( data.idx, 1 ) );
			g.computeBoundingBox();
			g.computeBoundingSphere();
			const m = new THREE.Mesh( g, mat );
			m.name = name;
			m.position.set( ox, 0, oz );
			m.matrixAutoUpdate = false;
			m.updateMatrix();
			m.receiveShadow = true;
			this.group.add( m );
			c.meshes.push( m );
			return m;
		};
		mk( r.road, this.mats.road, [ [ 'rd', 4 ], [ 'rd2', 4 ] ], 'roads-surface' );
		mk( r.walk, this.mats.walk, [ [ 'wk', 4 ] ], 'roads-walk' );
		const kit = mk( r.kit, this.mats.kit, [ [ 'kc', 3, true ], [ 'kp', 3, true ] ], 'roads-kit' );
		if ( kit ) kit.castShadow = true;
		mk( r.fence, this.mats.fence, [ [ 'fuv', 2 ] ], 'roads-fence' );
		if ( r.wires && r.wires.length ) {
			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.BufferAttribute( r.wires, 3 ) );
			g.computeBoundingSphere();
			const l = new THREE.LineSegments( g, this.mats.wire );
			l.name = 'roads-wires';
			l.position.set( ox, 0, oz );
			l.matrixAutoUpdate = false;
			l.updateMatrix();
			this.group.add( l );
			c.meshes.push( l );
		}
		if ( r.lod === 0 ) {
			c.pending = this._near( c, r );
			if ( ( c.dist ?? 0 ) < LOAD_NOW ) { while ( ! c.pending.next().done ); c.pending = null; } else this.loading.push( c );
		}
		this.dirty = true;
	}

	// props, cars, decals, signs and colliders of a near cell, a slice per step (a downtown cell has ~1000 colliders,
	// 600 props and 250 cars: several ms at once)
	*_near( c, r ) {
		const { m: M, q: Q, e: E, s: S, v: V, m2: carM, m3: pm, q2: qy, n: nrm } = this._tmp;
		let step = 0;
		const ox = r.ox, oz = r.oz;
		const phys = this.game.physics;
		const inst = new Map();
		const set = ( key, attrs ) => { let s = inst.get( key ); if ( ! s ) { s = new InstSet( attrs ); inst.set( key, s ); } return s; };
		const addBox = ( x, y, z, hx, hy, hz, yaw, mat ) => { c.boxes.push( phys.add( { x, y, z, hx, hy, hz, yaw, mat, kind: 'solid', owner: this } ) ); };
		// worker colliders: barriers, guardrails, fences, sidewalk slabs
		const B = r.boxes;
		for ( let i = 0; i < B.length; i += BOX_STRIDE ) {
			addBox( B[ i ] + ox, B[ i + 1 ], B[ i + 2 ] + oz, B[ i + 3 ], B[ i + 4 ], B[ i + 5 ], B[ i + 6 ], MATS[ B[ i + 7 ] ] || 'concrete' );
			if ( ++ step % 128 === 0 ) yield;
		}
		// ---- props ----
		const Pr = r.props;
		const vals = [ 1, 1, 1, 0, 0, 0, 0, 0 ];
		for ( let i = 0; i < Pr.length; i += PROP_STRIDE ) {
			if ( ++ step % 32 === 0 ) yield;
			const type = Pr[ i ], x = Pr[ i + 1 ] + ox, y = Pr[ i + 2 ], z = Pr[ i + 3 ] + oz, yaw = Pr[ i + 4 ], sx = Pr[ i + 5 ], tilt = Pr[ i + 6 ], param = Pr[ i + 7 ];
			const seed = ( ( Math.imul( Math.round( x * 10 ), 73856093 ) ^ Math.imul( Math.round( z * 10 ), 19349663 ) ) >>> 0 ) / 4294967296;
			for ( const part of expandProp( type, param, seed ) ) {
				const model = MODELS[ part.key ];
				if ( ! model ) continue;
				const geo = model.geo;
				S.set( 1, 1, 1 );
				if ( part.sx === 'u' ) S.set( sx, sx, sx );
				else if ( part.sx === 'x' ) S.x = sx;
				else if ( part.sx === 'y' ) S.y = sx;
				E.set( tilt, yaw, 0, 'YXZ' );
				Q.setFromEuler( E );
				let lift = 0;
				if ( tilt ) {
					// rest a toppled / leaning thing on the ground
					const bb = geo.boundingBox, ct = Math.cos( tilt ), st = Math.sin( tilt );
					let mn = Infinity;
					for ( const yy of [ bb.min.y * S.y, bb.max.y * S.y ] ) for ( const zz of [ bb.min.z * S.z, bb.max.z * S.z ] ) mn = Math.min( mn, yy * ct - zz * st );
					lift = Math.max( 0, - mn );
				}
				V.set( x, y + lift, z );
				M.compose( V, Q, S );
				const t = part.tint;
				vals[ 0 ] = t ? t[ 0 ] : 1; vals[ 1 ] = t ? t[ 1 ] : 1; vals[ 2 ] = t ? t[ 2 ] : 1;
				vals[ 3 ] = part.flicker ? 1 : 0; vals[ 4 ] = seed; vals[ 5 ] = 0.5 + seed * 0.5; vals[ 6 ] = 0;
				set( part.key, PROP_ATTRS ).add( M, x, z, vals );
			}
			// the light pool under a lamp that still flickers
			if ( ( type === PROP.STREETLIGHT || type === PROP.STREETLIGHT2 ) && param === 1 && ! tilt ) {
				const c0 = Math.cos( yaw ), s0 = Math.sin( yaw );
				for ( const dir of type === PROP.STREETLIGHT2 ? [ 1, - 1 ] : [ 1 ] ) {
					const gx = x + c0 * 2.5 * dir, gz = z - s0 * 2.5 * dir;
					const gy = this.hf.heightAt( gx, gz ) + 0.12;
					M.compose( V.set( gx, gy, gz ), Q.identity(), S.set( 11, 1, 11 ) );
					vals[ 0 ] = GLOW_CELL; vals[ 1 ] = seed; vals[ 2 ] = 1; vals[ 3 ] = 0;
					set( 'glow', DECAL_ATTRS ).add( M, gx, gz, vals );
					// the luminaire (just under the cobra head) for the real light
					c.lamps.push( { x: x + c0 * 2.2 * dir, y: y + ( type === PROP.STREETLIGHT2 ? 9.85 : 8.05 ), z: z - s0 * 2.2 * dir, seed } );
				}
			}
			// colliders (upright things only)
			const boxes = PROP_BOXES[ type ];
			if ( boxes && ( Math.abs( tilt ) < 0.3 || type === PROP.STREETLIGHT || type === PROP.POLE ) ) {
				const cs = Math.cos( yaw ), sn = Math.sin( yaw );
				for ( const [ cx, cy, cz, hx, hy, hz, mi ] of boxes ) {
					let bx = cx, by = cy, bhx = hx, bhy = hy;
					if ( type === PROP.GUIDE_POSTS ) { bx *= sx; if ( param === 1 ) { by *= 0.7; bhy *= 0.7; } }
					if ( type === PROP.SIGN_POST ) { by *= sx; bhy *= sx; }
					if ( Math.abs( tilt ) >= 0.3 ) { by = 0.8; bhy = 0.8; }
					addBox( x + bx * cs + cz * sn, y + by, z - bx * sn + cz * cs, bhx, bhy, hz, yaw, MATS[ mi ] );
				}
			}
		}
		// ---- signs (static atlas); highway guide / welcome signs get their own canvas ----
		const Sg = r.signs;
		for ( let i = 0; i < Sg.length; i += SIGN_STRIDE ) {
			if ( ++ step % 32 === 0 ) yield;
			const dyn = Sg[ i ], cell = Sg[ i + 1 ], x = Sg[ i + 2 ] + ox, y = Sg[ i + 3 ], z = Sg[ i + 4 ] + oz, yaw = Sg[ i + 5 ], w = Sg[ i + 6 ], h = Sg[ i + 7 ], dbl = Sg[ i + 8 ];
			E.set( 0, yaw, 0, 'YXZ' ); Q.setFromEuler( E );
			// single-sided boards hang in front of their post
			const off = dyn || dbl ? 0 : 0.045;
			M.compose( V.set( x + Math.sin( yaw ) * off, y, z + Math.cos( yaw ) * off ), Q, S.set( w, h, 1 ) );
			// (painting a guide sign's canvas takes a few ms: a step of its own)
			if ( dyn ) { this._dynSign( c, cell, M ); yield; continue; }
			const [ px, py, pw, ph ] = atlasRect( cell );
			vals[ 0 ] = ( px + 1 ) / ATLAS_SIZE; vals[ 1 ] = 1 - ( py + ph - 1 ) / ATLAS_H; vals[ 2 ] = ( px + pw - 1 ) / ATLAS_SIZE; vals[ 3 ] = 1 - ( py + 1 ) / ATLAS_H;
			vals[ 4 ] = dbl; vals[ 5 ] = isShaped( cell ) ? 1 : 0; vals[ 6 ] = 0; vals[ 7 ] = 0;
			set( 'signs', SIGN_ATTRS ).add( M, x, z, vals );
		}
		// ---- decals ----
		const Dc = r.decals;
		for ( let i = 0; i < Dc.length; i += DECAL_STRIDE ) {
			if ( ++ step % 32 === 0 ) yield;
			const kind = Dc[ i ], x = Dc[ i + 1 ] + ox, y = Dc[ i + 2 ], z = Dc[ i + 3 ] + oz, yaw = Dc[ i + 4 ], sx = Dc[ i + 5 ], sz = Dc[ i + 6 ], alpha = Dc[ i + 7 ];
			this.hf.normalAt( x, z, nrm, 1.5 );
			Q.setFromUnitVectors( UP, nrm );
			qy.setFromAxisAngle( UP, yaw );
			Q.multiply( qy );
			M.compose( V.set( x, y, z ), Q, S.set( sx, 1, sz ) );
			vals[ 0 ] = kind; vals[ 1 ] = alpha; vals[ 2 ] = DECAL_ROUGH[ kind ] ?? 0.8; vals[ 3 ] = 0;
			set( 'decals', DECAL_ATTRS ).add( M, x, z, vals );
		}
		// ---- cars ----
		const Cr = r.cars;
		const panels = [];
		for ( let i = 0; i < Cr.length; i += CAR_STRIDE ) {
			if ( ++ step % 12 === 0 ) yield;
			const type = Cr[ i ], x = Cr[ i + 1 ] + ox, y = Cr[ i + 2 ], z = Cr[ i + 3 ] + oz, yaw = Cr[ i + 4 ], pitch = Cr[ i + 5 ], roll = Cr[ i + 6 ];
			const color = Cr[ i + 7 ], rust = Cr[ i + 8 ], burn = Cr[ i + 9 ], flags = Cr[ i + 10 ] | 0, seed = Cr[ i + 11 ] | 0;
			const D = CAR_DIMS[ type ];
			if ( ! D ) continue;
			E.set( pitch, yaw, roll, 'YXZ' ); Q.setFromEuler( E );
			M.compose( V.set( x, y, z ), Q, S.set( 1, 1, 1 ) );
			vals[ 0 ] = color; vals[ 1 ] = rust; vals[ 2 ] = burn; vals[ 3 ] = flags; vals[ 4 ] = seed / 65536; vals[ 5 ] = 0; vals[ 6 ] = 0; vals[ 7 ] = 0;
			set( 'car' + type, CAR_ATTRS ).add( M, x, z, vals );
			panels.length = 0;
			carPanels( type, flags, seed, panels );
			carM.copy( M );
			for ( const p of panels ) {
				pm.multiplyMatrices( carM, p.m );
				set( p.kind === 'door' ? 'doors' : 'lids', CAR_ATTRS ).add( pm, x, z, vals );
			}
			// collider: the body box, rolled cars lying on their side or roof
			const cr = Math.abs( Math.cos( roll ) ), sr = Math.abs( Math.sin( roll ) );
			const hx = cr * D.W / 2 + sr * D.H / 2, hy = sr * D.W / 2 + cr * D.H / 2;
			V.set( 0, D.H / 2, 0 ).applyMatrix4( carM );
			// lootable wrecks own their box so the interaction's occlusion test ignores it (and nothing else)
			const w = ( flags & CF.LOOT ) ? { wreck: true, key: 'car:' + Math.round( x * 4 ) + ':' + Math.round( z * 4 ), type, x, y, z, yaw, flags, burn, box: null } : null;
			const box = phys.add( { x: V.x, y: V.y, z: V.z, hx: hx * 0.96, hy, hz: D.L / 2 * 0.97, yaw, mat: 'metal', kind: 'solid', owner: w || this } );
			c.boxes.push( box );
			if ( w ) { w.box = box; c.wrecks.push( w ); }
		}
		for ( const s of inst.values() ) s.seal();
		c.inst = inst;
		this._relistLootable();
		this.dirty = true;
	}

	// a real point light under the nearest few lamps that still flicker at night, blinking with their bulbs (the
	// shared light pool of the items module picks the strongest sources near the camera; ours rank below fires,
	// flares and carried lights)
	_lampLights( dt, cam ) {
		const pool = this.game.itemLights;
		if ( ! pool ) return;
		if ( ! this.lampSrc ) {
			this.lampSrc = [];
			for ( let i = 0; i < LAMP_LIGHTS; i ++ ) this.lampSrc.push( pool.add( { pos: new THREE.Vector3(), color: 0xffd6a8, intensity: 110, range: 36, on: false, priority: 0.5, lamp: null } ) );
		}
		const night = THREE.MathUtils.smoothstep( G.uNight.value, 0.3, 0.7 );
		this.lampT = ( this.lampT || 0 ) - dt;
		if ( this.lampT <= 0 ) {
			// re-pick the nearest lamps a few times a second
			this.lampT = 0.25;
			const best = this._best;
			best.length = 0;
			if ( night > 0 ) for ( const c of this.cells.values() ) for ( const l of c.lamps ) {
				const d2 = ( l.x - cam.x ) ** 2 + ( l.z - cam.z ) ** 2;
				if ( d2 > LAMP_RANGE * LAMP_RANGE ) continue;
				l.d2 = d2;
				best.push( l );
			}
			if ( best.length > 1 ) best.sort( byD2 );
			for ( let i = 0; i < LAMP_LIGHTS; i ++ ) this.lampSrc[ i ].lamp = best[ i ] || null;
		}
		const t = G.uTime.value;
		for ( const s of this.lampSrc ) {
			const l = s.lamp;
			const k = l ? night * flickerAt( l.seed, t ) : 0;
			s.on = k > 0.02;
			if ( ! l ) continue;
			s.pos.set( l.x, l.y, l.z );
			s.dim = k;
		}
	}

	_dynSign( c, id, matrix ) {
		const sg = this.net.signs[ id ];
		if ( ! sg ) return;
		const mat = makeDynSignMaterial( this._signTexture( id, sg ) );
		const mesh = new THREE.Mesh( this.signGeo, mat );
		mesh.userData.sign = id;
		mesh.matrixAutoUpdate = false;
		mesh.matrix.copy( matrix );
		mesh.matrixWorld.copy( matrix );
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.name = 'roads-guide-sign';
		this.group.add( mesh );
		c.dyn.push( mesh );
	}

	// the canvas of a guide / welcome sign: painted once, kept while in use and for a few dozen more
	_signTexture( id, sg ) {
		let e = this.signTex.get( id );
		if ( e ) { this.signTex.delete( id ); this.signTex.set( id, e ); e.refs ++; return e.tex; }
		const r = sg.road;
		const remain = sg.side > 0 ? r.len - sg.s : sg.s;
		const miles = remain * 8 / 1609.34; // the world is 1:8
		e = { tex: guideSign( sg, sg.kind === 'guide' ? miles : 0 ), refs: 1 };
		this.signTex.set( id, e );
		for ( const [ k, o ] of this.signTex ) {
			if ( this.signTex.size <= 32 ) break;
			if ( o.refs <= 0 ) { o.tex.dispose(); this.signTex.delete( k ); }
		}
		return e.tex;
	}


	// the instanced bands per instance-set key: [ key, [ [ batch, d0, d1 ] ... ] ]
	_groups() {
		if ( this._grp ) return this._grp;
		const G = [];
		for ( const key in this.propBatches ) G.push( [ key, this.propBatches[ key ] ] );
		for ( let t = 0; t < this.carBatches.length; t ++ ) G.push( [ 'car' + t, this.carBatches[ t ] ] );
		G.push( [ 'doors', [ [ this.doorBatch, 0, 160 ] ] ], [ 'lids', [ [ this.lidBatch, 0, 160 ] ] ], [ 'decals', [ [ this.decalBatch, 0, 170 ] ] ],
			[ 'glow', [ [ this.glowBatch, 0, 450 ] ] ], [ 'signs', [ [ this.signBatch, 0, 320 ] ] ] );
		return ( this._grp = G );
	}

	// refill every instanced band from the near cells: one pass over each key's instances, sorted into its bands
	_refill( cam ) {
		this.dirty = false;
		this.lastRefill.copy( cam );
		const cells = this._cellList || ( this._cellList = [] );
		cells.length = 0;
		for ( const c of this.cells.values() ) if ( c.inst ) cells.push( c );
		const px = cam.x, pz = cam.z;
		const qk = this._quality(), q2 = qk * qk;
		const hits = this._hits || ( this._hits = [] ), cnt = this._cnt || ( this._cnt = new Int32Array( 8 ) ), lim = this._lim || ( this._lim = new Float64Array( 8 ) );
		for ( const [ key, bands ] of this._groups() ) {
			const nb = bands.length;
			let far = 0;
			for ( let b = 0; b < nb; b ++ ) { cnt[ b ] = 0; lim[ b ] = bands[ b ][ 2 ] * bands[ b ][ 2 ] * q2; far = Math.max( far, lim[ b ] ); }
			hits.length = 0;
			for ( let ci = 0; ci < cells.length; ci ++ ) {
				const s = cells[ ci ].inst.get( key );
				if ( ! s ) continue;
				const P = s.p;
				for ( let k = 0; k < s.n; k ++ ) {
					const dx = P[ k * 2 ] - px, dz = P[ k * 2 + 1 ] - pz, d2 = dx * dx + dz * dz;
					if ( d2 >= far ) continue;
					// the bands are contiguous from 0: the first whose end lies beyond
					let b = 0;
					while ( d2 >= lim[ b ] ) b ++;
					hits.push( s, k, b );
					cnt[ b ] ++;
				}
			}
			for ( let b = 0; b < nb; b ++ ) { bands[ b ][ 0 ].ensure( cnt[ b ] ); bands[ b ][ 0 ].begin(); }
			for ( let i = 0; i < hits.length; i += 3 ) bands[ hits[ i + 2 ] ][ 0 ].push( hits[ i ], hits[ i + 1 ] );
			for ( let b = 0; b < nb; b ++ ) bands[ b ][ 0 ].end();
		}
	}

	// ---- lootable wrecks ----------------------------------------------------------------------------------------

	_relistLootable() {
		this.lootable.length = 0;
		for ( const c of this.cells.values() ) for ( const w of c.wrecks ) this.lootable.push( w );
	}

	_interact() {
		const g = this.game;
		const near = [], out = [ null ];
		// one reusable candidate per wreck part (the interaction runs every frame)
		const cands = new Map();
		const cand = ( w, rear ) => {
			const key = w.key + ':' + ( rear ? 't' : 'g' );
			let c = cands.get( key );
			if ( ! c ) {
				if ( cands.size > 64 ) cands.clear();
				const kind = rear ? 'trunk' : 'glovebox';
				c = { t: 0, label: rear ? 'Search ' + PART_NAME[ w.type ].toLowerCase() : 'Search glovebox', sub: '', id: key, owner: w, ownerBox: w.box, action: () => this.openWreck( w, kind, key ) };
				cands.set( key, c );
			}
			return c;
		};
		this.removeProvider = g.interact?.addProvider( ( ray, maxDist ) => {
			let best = null, bt = Infinity;
			// the wreck boxes around the eye (a lootable wreck owns its box)
			for ( const b of g.physics.near( ray.origin.x, ray.origin.z, maxDist + 3, near ) ) {
				const w = b.owner;
				if ( ! w || ! w.wreck || w.box !== b ) continue;
				const t = rayOBB( ray.origin, ray.dir, b, maxDist );
				if ( t < 0 || t >= bt ) continue;
				// where on the car: rear third = trunk / bed / cargo, else the cabin (glovebox)
				const ox = ray.origin.x + ray.dir.x * t - w.x, oz = ray.origin.z + ray.dir.z * t - w.z;
				const lz = ox * Math.sin( w.yaw ) + oz * Math.cos( w.yaw );
				const rear = lz > CAR_DIMS[ w.type ].L * 0.2 || w.type === CAR.MTRUCK;
				best = cand( w, rear ); bt = t;
			}
			near.length = 0;
			if ( ! best ) return null;
			best.t = bt;
			const seen = this.wrecks.get( best.id );
			best.sub = seen && ! seen.fresh && ! seen.items.length ? 'Empty' : '';
			out[ 0 ] = best;
			return out;
		} );
	}

	container( w, kind, key ) {
		let c = this.wrecks.get( key );
		if ( c ) return c;
		const type = w.type;
		const glove = kind === 'glovebox';
		let items = this.saved[ key ];
		const fresh = ! items;
		if ( fresh ) {
			const rnd = mulberry32( hashStr( key ) ^ ( ( this.game.seed | 0 ) * 2654435761 ) );
			const table = glove ? 'car_glovebox' : type === CAR.POLICE ? 'police' : ( type === CAR.HUMVEE || type === CAR.MTRUCK ) ? 'military' : 'car_trunk';
			const n = glove ? ( rnd() < 0.3 ? 0 : 1 + Math.floor( rnd() * 2 ) ) : ( rnd() < 0.15 ? 0 : 1 + Math.floor( rnd() * 4 ) );
			try { items = n ? rollLoot( table, rnd, n ) : []; } catch ( e ) { console.error( 'wreck loot', e ); items = []; }
		}
		c = {
			key, kind: glove ? 'car_glovebox' : 'car_trunk',
			label: glove ? 'Glovebox' : PART_NAME[ type ],
			capacity: glove ? 4 : TRUNK_CAP[ type ],
			items, pos: new THREE.Vector3( w.x, w.y + 0.8, w.z ), fresh,
		};
		this.wrecks.set( key, c );
		delete this.saved[ key ];
		return c;
	}

	openWreck( w, kind, key ) {
		const g = this.game;
		const c = this.container( w, kind, key );
		const open = () => { c.fresh = false; g.app?.ui?.openContainer?.( c ); };
		if ( c.fresh && g.actions?.start ) {
			g.audio?.play?.( kind === 'glovebox' ? 'door_open' : 'container_open', { pos: c.pos, vol: 0.5 } );
			g.actions.start( { label: 'Searching', time: kind === 'glovebox' ? 1.4 : 2.4, cancelOnMove: true, onDone: open } );
		} else open();
	}

	serialize( save ) {
		save.world = save.world || {};
		const out = { ...this.saved };
		for ( const [ k, c ] of this.wrecks ) if ( ! c.fresh ) out[ k ] = c.items;
		save.world.wrecks = out;
	}

	load( save ) {
		this.saved = { ...( save.world?.wrecks || {} ) };
		this.wrecks.clear();
	}

	// ---- queries ------------------------------------------------------------------------------------------------

	// the parking lot at a point (paved, no trees), or null
	lotAt( x, z, pad = 0 ) { return lotAt( this.net, x, z, pad ); }

	// every parking lot as a rectangle, in the buildings' obstacle layout ( x, z, half length, half depth, angle ) x n:
	// what the vegetation keeps its trees and grass off
	lotObstacles() {
		if ( this._lotObs ) return this._lotObs;
		const L = this.lots, o = new Float32Array( L.length * 5 );
		L.forEach( ( l, i ) => o.set( [ l.x, l.z, l.la / 2 + 0.5, l.lb / 2 + 0.5, Math.atan2( l.az, l.ax ) ], i * 5 ) );
		return ( this._lotObs = o );
	}

	// nearest drivable centreline point (drawn highways and city streets)
	nearestRoad( pos, maxDist = 40 ) {
		const r = nearestOnNetwork( this.net, pos.x, pos.z, maxDist );
		if ( ! r ) return null;
		return {
			point: new THREE.Vector3( r.x, this.hf.heightAt( r.x, r.z ), r.z ), dir: new THREE.Vector3( r.dx, 0, r.dz ),
			lanes: r.lanes, width: r.width, kind: r.kind, name: r.name, dist: r.dist,
		};
	}

	// free spots on the roads around a point (parking lanes, shoulders) for spawning vehicles: [ { pos, yaw } ]
	spawnPoints( center, radius = 150, n = 4 ) {
		const cand = roadsideSpots( this.net, center.x, center.z, radius );
		// the stalls of the parking lots
		for ( const L of this.lots ) {
			if ( ( L.x - center.x ) ** 2 + ( L.z - center.z ) ** 2 > ( radius + L.la ) ** 2 ) continue;
			const rows = [];
			for ( let p = 0; p < L.periods; p ++ ) rows.push( [ p * LOT.PERIOD, 1 ], [ ( p + 1 ) * LOT.PERIOD, - 1 ] );
			if ( L.single ) rows.push( [ L.periods * LOT.PERIOD, 1 ] );
			for ( const [ bb, dir ] of rows ) for ( let k = 0; k < L.stalls; k += 2 ) {
				const a = 0.4 + ( k + 0.5 ) * LOT.STALL - L.la / 2, b = L.lb / 2 - ( bb + dir * 2.75 );
				const x = L.x + L.ax * a + L.bx * b, z = L.z + L.az * a + L.bz * b;
				if ( ( x - center.x ) ** 2 + ( z - center.z ) ** 2 > radius * radius ) continue;
				// nose in: facing the row's back line
				cand.push( [ x, z, Math.atan2( - L.bx * dir, - L.bz * dir ) ] );
			}
		}
		// shuffle, then keep spots clear of wrecks, props, buildings and each other
		for ( let i = cand.length - 1; i > 0; i -- ) { const j = Math.floor( Math.random() * ( i + 1 ) ); [ cand[ i ], cand[ j ] ] = [ cand[ j ], cand[ i ] ]; }
		const out = [], near = [];
		for ( const [ x, z, yaw ] of cand ) {
			if ( out.length >= n ) break;
			const y = this.hf.heightAt( x, z );
			if ( y < 0.3 ) continue;
			let blocked = false;
			for ( const b of this.game.physics.near( x, z, 3.2, near ) ) if ( b.maxY > y + 0.35 && b.minY < y + 2 ) { blocked = true; break; }
			if ( blocked ) continue;
			if ( out.some( o => ( o.pos.x - x ) ** 2 + ( o.pos.z - z ) ** 2 < 49 ) ) continue;
			out.push( { pos: new THREE.Vector3( x, y, z ), yaw } );
		}
		return out;
	}

	dispose() {
		this.disposed = true;
		this.removeProvider?.();
		if ( this.lampSrc ) for ( const s of this.lampSrc ) this.game.itemLights?.remove( s );
		for ( const c of this.cells.values() ) { if ( c.job ) c.job.cancelled = true; this._unload( c ); }
		this.cells.clear();
		for ( const b of this.batches ) b.dispose();
		this.game.scene.remove( this.group );
		for ( const m of this.carMats ) m.dispose();
		this.panelMat.dispose();
		for ( const e of this.signTex.values() ) e.tex.dispose();
		this.signTex.clear();
	}
}

const byD2 = ( a, b ) => a.d2 - b.d2;
const byDist = ( a, b ) => a.dist - b.dist;
const UP = new THREE.Vector3( 0, 1, 0 );
const _slab = [ 0, 0 ];

// ray vs a physics box (yaw-rotated); returns t or -1
function rayOBB( o, d, b, maxT ) {
	const c = Math.cos( b.yaw || 0 ), s = Math.sin( b.yaw || 0 );
	const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z;
	const ou = dx * c - dz * s, ov = dx * s + dz * c;
	const du = d.x * c - d.z * s, dv = d.x * s + d.z * c;
	const r = _slab; r[ 0 ] = 0; r[ 1 ] = maxT;
	if ( ! slab( ou, du, b.hx, r ) || ! slab( dy, d.y, b.hy, r ) || ! slab( ov, dv, b.hz, r ) ) return - 1;
	return r[ 0 ];
}
// one slab of the ray / box test: narrows r = [ t0, t1 ], false when the ray misses
function slab( oo, dd, h, r ) {
	if ( Math.abs( dd ) < 1e-9 ) return Math.abs( oo ) <= h;
	let a = ( - h - oo ) / dd, e = ( h - oo ) / dd;
	if ( a > e ) { const t = a; a = e; e = t; }
	if ( a > r[ 0 ] ) r[ 0 ] = a;
	if ( e < r[ 1 ] ) r[ 1 ] = e;
	return r[ 0 ] <= r[ 1 ];
}

export function install( game ) {
	const roads = new Roads( game );
	game.roads = roads;
	game.register( roads );
	return roads;
}
