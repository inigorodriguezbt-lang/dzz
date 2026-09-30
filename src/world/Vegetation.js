// Vegetation: palms, trees, understory, crops, rocks, grass and beach clutter over all eight islands.
//
// Placement runs in the world workers (scatter.js), deterministic per cell on three layers: canopy
// (64 m cells out to the render distance), detail (64 m cells near the camera) and ground (32 m cells
// around the player). The main thread keeps the cell results and, whenever the camera has moved a few
// metres, refills a small set of instance buffers ("bands"):
//   near  full models with shadows (~30-110 m by species)
//   mid   simplified models (palms, trees, pineapples, cane, rocks) and impostors of the small plants
//   far   impostors of the trees and palms out to the render distance, thinned with distance
// The ground layer's cells carry the ground data (heights, grass and pebble density masks) of the
// camera-following flora that places itself in the vertex shader (ported from Tidewater): the grass
// field (vegetation/GrassField.js: meadow and dune grass, sea oats, beach creeper) and the beach
// pebbles, cobbles and shell grit (vegetation/PebbleField.js), through toroidal textures
// (vegetation/GroundData.js).
// The exact per-instance LOD windows happen in the vertex / fragment shaders against the live camera,
// so the CPU refills are infrequent and never pop: a short cross-fade where one level hands over to
// the next (alpha to coverage with MSAA, a moving dither under TAA, else a clean swap in the band's
// middle; the plant stays solid throughout), and shrinking wherever plants drop out (distance
// thinning, the end of a plant's last level), so no screen-door pattern ever shows.
// Trunks near the player become physics boxes; F on a palm shakes down a coconut, on a banana plant
// picks a hand of bananas.
import * as THREE from 'three';
import { SP, NSP, STRIDE, SPECIES, LAYER, LAYER_CELL } from './vegetation/species.js';
import { buildLeafAtlas } from './vegetation/LeafTextures.js';
import * as PG from './vegetation/PlantGeometry.js';
import { KIND, VG, vegTextures, vegUniforms, makeVegMaterial, makeVegDepthMaterial } from './vegetation/VegMaterial.js';
import { Impostors } from './vegetation/Impostors.js';
import { InstanceTarget } from './vegetation/InstanceTarget.js';
import { GroundData } from './vegetation/GroundData.js';
import { GrassField } from './vegetation/GrassField.js';
import { PebbleField } from './vegetation/PebbleField.js';
import { citiesNear } from './scatter.js';
import { makeStack, getItem } from '../game/items/ItemDB.js';

// ---- per species rendering setup ---------------------------------------------------------------------------
//   kind: vertex deformation, build( lod ): model, near / mid: end distance (m, at 'high'), imp: impostor
//   level ('far' = out to the render distance with thinning, or an end distance), tint: per plant tint range
//   (Tidewater's per instance variation: canopy value iv * 0.36 + 0.74, palms yellower / bluer), bark: bark
//   tint, mode (see vegUniforms; w: leaf-card canopy), leaf: [ roughness, specular intensity, translucency,
//   bark moss ] (Tidewater VegMaterials.js: canopy 0.82 / 0.65 glossy, 0.15, 0.5; palm fronds 0.62, 0.4,
//   0.3; plants 0.7, 0.4, 0.3; broad glossy leaves 0.45, 0.42, 0.2), shadow: the near (and mid) models cast
//   shadows. The sun's shadow map reaches ~85-120 m, so the mid models of the big plants cast too: no
//   shadow pop at the switch.
const W = [ 1, 1, 1 ];
const IV = [ [ 0.74, 0.75, 0.78 ], [ 1.1, 1.1, 1.02 ] ]; // canopy value per tree (Tidewater iv * 0.36 + 0.74)
const CANOPY = [ 0.82, 0.15, 0.5 ];
// tall grass: the meadow green, towards Tidewater's MEADOW yellow where it is dry (ratio of the two)
const lin = ( r, g, b ) => new THREE.Color().setRGB( r, g, b, THREE.SRGBColorSpace ).toArray();
const DRY = ( () => { const g = lin( 0.25, 0.32, 0.1 ), y = lin( 0.5, 0.46, 0.2 ); return y.map( ( v, i ) => v / g[ i ] ); } )();
export const SPEC = {
	[ SP.PALM ]: { kind: KIND.PALM, build: PG.buildPalm, near: 90, mid: 240, imp: 'far', tint: [ [ 0.93, 0.99, 1.04 ], [ 1.096, 1.016, 0.824 ] ], leaf: [ 0.62, 0.4, 0.3, 0 ], shadow: true },
	[ SP.MONKEYPOD ]: { kind: KIND.TREE, build: ( l ) => PG.buildBroadleaf( 'monkeypod', l ), near: 85, mid: 210, imp: 'far', tint: IV, bark: W, mode: [ 0, 0, 0, 1 ], leaf: [ ...CANOPY, 1 ], shadow: true },
	[ SP.KUKUI ]: { kind: KIND.TREE, build: ( l ) => PG.buildBroadleaf( 'kukui', l ), near: 80, mid: 190, imp: 'far', tint: IV, bark: W, mode: [ 0, 0, 0, 1 ], leaf: [ ...CANOPY, 0.8 ], shadow: true },
	[ SP.OHIA ]: { kind: KIND.TREE, build: ( l ) => PG.buildBroadleaf( 'ohia', l ), near: 80, mid: 190, imp: 'far', tint: IV, bark: W, mode: [ 0, 0, 1, 1 ], leaf: [ 0.65, 0.15, 0.5, 1 ], shadow: true },
	[ SP.PINE ]: { kind: KIND.PINE, build: PG.buildPine, near: 100, mid: 250, imp: 'far', tint: IV, bark: W, mode: [ 0, 0, 0, 1 ], leaf: [ ...CANOPY, 0.3 ], shadow: true },
	[ SP.IRONWOOD ]: { kind: KIND.TREE, build: ( l ) => PG.buildBroadleaf( 'ironwood', l ), near: 80, mid: 190, imp: 'far', tint: IV, bark: W, mode: [ 0, 0, 0, 1 ], leaf: [ ...CANOPY, 0.3 ], shadow: true },
	[ SP.KIAWE ]: { kind: KIND.TREE, build: ( l ) => PG.buildBroadleaf( 'kiawe', l ), near: 75, mid: 170, imp: 'far', tint: IV, bark: W, mode: [ 0, 0, 0, 1 ], leaf: [ ...CANOPY, 0 ], shadow: true },
	[ SP.TREEFERN ]: { kind: KIND.SMALL, build: PG.buildTreeFern, near: 62, imp: 240, tint: [ [ 0.85, 0.9, 0.9 ], [ 1.1, 1.08, 0.95 ] ], bark: W, leaf: [ 0.7, 0.4, 0.3, 1 ], shadow: true },
	[ SP.BANANA ]: { kind: KIND.SMALL, build: PG.buildBanana, near: 62, imp: 220, tint: [ [ 0.9, 0.95, 0.95 ], [ 1.1, 1.08, 0.95 ] ], leaf: [ 0.7, 0.4, 0.3, 0 ], shadow: true },
	[ SP.TI ]: { kind: KIND.SMALL, build: PG.buildTi, near: 55, imp: 150, tint: [ [ 0.9, 0.95, 0.95 ], [ 1.1, 1.05, 0.95 ] ], mode: [ 0, 1, 0, 0 ], leaf: [ 0.45, 0.42, 0.2, 0 ], shadow: true },
	[ SP.SHRUB ]: { kind: KIND.SMALL, build: PG.buildShrub, near: 55, imp: 200, tint: IV, mode: [ 0, 0, 2, 1 ], leaf: [ ...CANOPY, 0 ], shadow: true },
	[ SP.NAUPAKA ]: { kind: KIND.SMALL, build: PG.buildNaupaka, near: 65, imp: 200, tint: IV, mode: [ 0, 0, 0, 1 ], leaf: [ 0.65, 0.15, 0.5, 0 ], shadow: true },
	[ SP.TALLGRASS ]: { kind: KIND.SMALL, build: PG.buildTallGrass, near: 55, imp: 170, tint: [ W, DRY ], mode: [ 1, 0, 0, 0 ], leaf: [ 0.8, 0.4, 0.3, 0 ], shadow: true },
	[ SP.PINEAPPLE ]: { kind: KIND.SMALL, build: PG.buildPineappleRow, near: 30, mid: 70, tint: [ [ 0.95, 1, 1 ], [ 1.05, 1.05, 1 ] ], leaf: [ 0.6, 0.4, 0.2, 0 ], shadow: false },
	[ SP.CANE ]: { kind: KIND.CANE, build: PG.buildCanePatch, near: 80, mid: 260, tint: [ [ 0.95, 1, 0.95 ], [ 1.08, 1.05, 0.9 ] ], leaf: [ 0.8, 0.4, 0.3, 0 ], shadow: true },
	[ SP.ROCK ]: { kind: KIND.ROCK, build: PG.buildRock, near: 60, mid: 170, tint: [ [ 0.58, 0.55, 0.52 ], [ 0.2, 0.19, 0.2 ] ], shadow: true },
	[ SP.FERN ]: { kind: KIND.SMALL, build: PG.buildFern, near: 45, tint: [ [ 0.85, 0.9, 0.9 ], [ 1.1, 1.1, 0.95 ] ], leaf: [ 0.7, 0.4, 0.3, 0 ], shadow: false },
	// beach clutter (Tidewater DebrisPlacement): driftwood on the wrack line, coconuts and dead fronds under
	// the palms; lying still (the rock kind: no wind), near only
	[ SP.DRIFTWOOD ]: { kind: KIND.ROCK, build: PG.buildDriftwood, near: 55, tint: [ W, W ], bark: W, leaf: [ 0.8, 0.3, 0, 0 ], shadow: true },
	[ SP.NUTS ]: { kind: KIND.ROCK, build: PG.buildFallenNuts, near: 35, tint: [ W, W ], shadow: false },
	[ SP.FROND ]: { kind: KIND.ROCK, build: PG.buildFallenFrond, near: 45, tint: [ [ 0.85, 0.85, 0.8 ], [ 1.1, 1.05, 0.95 ] ], leaf: [ 0.75, 0.3, 0.1, 0 ], shadow: false },
	// broadleaf understory (Tidewater's monstera and elephant ear: procedural blades, VegMaterial BROAD_GLSL)
	[ SP.MONSTERA ]: { kind: KIND.SMALL, build: PG.buildMonstera, near: 55, imp: 150, tint: [ W, W ], leaf: [ 0.46, 0.42, 0.2, 0 ], shadow: true },
	[ SP.KALO ]: { kind: KIND.SMALL, build: PG.buildElephantEar, near: 55, imp: 160, tint: [ W, W ], leaf: [ 0.58, 0.42, 0.2, 0 ], shadow: true },
	// (the grass layer carries the ground data of the grass field: no instances, see GrassField)
	[ SP.GRASS ]: { kind: KIND.GRASS, build: null, near: 0, tint: [ W, W ], shadow: false },
};

// dist: LOD distance scale, mid: extra scale of the mid models' end, density: share of the scattered
// plants drawn, far: share of the render distance the trees reach, blend: impostor three-frame blending
// distance (m). The grass field and the pebbles have their own quality tables (GrassField GRASS_QUALITY,
// PebbleField PEBBLE_QUALITY).
const QUALITY = {
	low: { dist: 0.55, mid: 0.8, density: 0.5, far: 0.6, blend: 0 },
	medium: { dist: 0.78, mid: 0.88, density: 0.75, far: 0.85, blend: 500 },
	high: { dist: 1, mid: 1, density: 1, far: 1, blend: 1e5 },
	ultra: { dist: 1.3, mid: 1, density: 1, far: 1, blend: 1e5 },
};

// cross-fade band, share of the switch distance: short (every plant jitters its switch distances, see
// VegMaterial), so only a few plants are ever mid-way
const FADE = 0.03;
const MARGIN = { near: 18, mid: 50, far: 110 };
const MOVE = { near: 7, mid: 22, far: 55 }; // refill after the camera moved this far
// the ground layer reaches past the grass field's far radius by a block and its filter neighbours
const GROUND_MARGIN = 48;
// the shaded sward base the terrain draws under the grass field (Terrain.js TerrainGrass.fade.z)
const SWARD = 0.85;
const COLLIDE_R = 48;
const REGROW_H = 48; // in-game hours until a picked palm / banana plant bears again
const _v = new THREE.Vector3();

const cellKey = ( layer, i, j ) => layer * 1e8 + ( i + 5000 ) * 1e4 + ( j + 5000 );
const fract = ( v ) => v - Math.floor( v );

// ---- the system ------------------------------------------------------------------------------------------------

export class Vegetation {
	constructor( game ) {
		this.game = game;
		this.world = game.world;
		this.hf = game.hf;
		this.pool = game.world.pool;
		this.settings = game.settings;
		this.group = new THREE.Group();
		this.group.name = 'vegetation';
		this.game.scene.add( this.group );
		this.cells = new Map();
		this.inFlight = 0;
		this.colliders = new Map();
		this.picked = {};
		// cells held, instances per band after the last refill, the last refill's time (ms), frames
		this.stats = { cells: 0, grass: 0, pebbles: 0, near: 0, mid: 0, far: 0, rebuildMs: 0, frames: 0 };
		this._lastStream = 0;
		this._streamPos = new THREE.Vector3( 1e9, 0, 0 );
		this._want = [];
		this._wantI = 0;
		this._bandPos = { near: new THREE.Vector3( 1e9, 0, 0 ), mid: new THREE.Vector3( 1e9, 0, 0 ), far: new THREE.Vector3( 1e9, 0, 0 ) };
		this._bandDirty = { near: true, mid: true, far: true };
		this._bandTime = { near: 0, mid: 0, far: 0 };
		this._colPos = new THREE.Vector3( 1e9, 0, 0 );
		this._town = 0; // 0 wild .. 1 town at the camera
		this._townT = 0;
		this._sward = 0;
		this._origin = new THREE.Vector3();
		this._buildObstacles();
		this._buildAssets();
		this._terrain = null;
		this.setQuality();
		// The terrain's shared detail texture, gust field and grass hook (terrain/DetailTextures.js,
		// Terrain.js TerrainGust / TerrainGrass): the grass takes the ground's meadow tone, moves with its
		// wind sheen, and the terrain shades the ground under the grass field as the sward's base. All
		// optional (namespace lookups): without them the grass uses its own noise.
		import( './terrain/DetailTextures.js' ).then( ( m ) => {
			const t = m.getDetailTexture?.();
			if ( t && ! this.disposed ) { VG.tDetail.value = t; VG.uDetailOn.value = 1; }
		} ).catch( () => {} );
		import( './Terrain.js' ).then( ( m ) => { if ( ! this.disposed ) { this._terrain = m; this.setQuality(); } } ).catch( () => {} );
		this._unsub = [ 'vegetation', 'grass', 'renderDistance', 'antialias' ].map( k => this.settings.on( k, () => this.setQuality() ) );
	}

	// ---- setup ------------------------------------------------------------------------------------------------

	_buildAssets() {
		const t0 = performance.now();
		const atlas = buildLeafAtlas();
		this.atlas = atlas;
		vegTextures( atlas.texture );
		this.targets = { near: [], mid: [] };
		this.spTargets = []; // species -> { near, mid }
		this.models = [];
		this.midModels = [];
		for ( let s = 0; s < NSP; s ++ ) {
			const cfg = SPEC[ s ];
			const lods = {};
			this.spTargets[ s ] = lods;
			if ( ! cfg.build ) continue;
			const g0 = cfg.build( 0 );
			this.models[ s ] = g0;
			const make = ( g, name, shadow ) => {
				const U = vegUniforms( cfg.kind, cfg.tint[ 0 ], cfg.tint[ 1 ], cfg.bark, cfg.mode, cfg.leaf );
				const t = new InstanceTarget( SPECIES[ s ].name + '-' + name, g, makeVegMaterial( U ), shadow ? makeVegDepthMaterial( U ) : null );
				t.U = U;
				t.species = s;
				t.mesh.castShadow = !! shadow;
				this.group.add( t.mesh );
				return t;
			};
			lods.near = make( g0, 'near', cfg.shadow );
			this.targets.near.push( lods.near );
			if ( cfg.mid ) {
				const g1 = cfg.build( 1 );
				this.midModels.push( g1 );
				lods.mid = make( g1, 'mid', cfg.shadow );
				this.targets.mid.push( lods.mid );
			}
		}
		// the camera-following ground flora (ported from Tidewater): grass field and beach pebbles
		this.ground = new GroundData( this.game.renderer.gl );
		this.grassField = new GrassField( this.ground );
		this.pebbles = new PebbleField( this.ground );
		this.group.add( ...this.grassField.meshes, this.pebbles.mesh );
		// impostors: trees far away (one mesh) and the small plants at mid range (another)
		this.impostors = new Impostors( this.game.renderer.gl, this.models, SPEC );
		this.impFar = this.impostors.makeTarget( 'far' );
		this.impMid = this.impostors.makeTarget( 'mid' );
		this.group.add( this.impFar.mesh, this.impMid.mesh );
		// what each band refills (fixed lists: refills allocate nothing)
		this.bandTargets = { near: this.targets.near, mid: [ ...this.targets.mid, this.impMid ], far: [ this.impFar ] };
		this.bandLayers = { near: [ LAYER.CANOPY, LAYER.DETAIL ], mid: [ LAYER.CANOPY, LAYER.DETAIL ], far: [ LAYER.CANOPY ] };
		this.buildMs = performance.now() - t0;
	}

	// building footprints, roads and streets bucketed on a 128 m grid (sent along with scatter jobs)
	// building lots appended after the vegetation was installed (city/Buildings.js infill): rebuild the
	// obstacles and scatter again the cells already streamed, so no tree stands on a new lot
	rebuildObstacles() { this._buildObstacles(); }

	_buildObstacles() {
		if ( this.cells?.size ) this._rescatter();
		const meta = this.world.meta;
		const B = 128;
		const grid = new Map();
		const key = ( i, j ) => ( i + 1000 ) * 4000 + ( j + 1000 );
		const put = ( list, x0, z0, x1, z1 ) => {
			for ( let i = Math.floor( x0 / B ); i <= Math.floor( x1 / B ); i ++ ) for ( let j = Math.floor( z0 / B ); j <= Math.floor( z1 / B ); j ++ ) {
				const k = key( i, j );
				let e = grid.get( k );
				if ( ! e ) grid.set( k, e = { b: [], s: [] } );
				e[ list ].push( this._obs[ list ].length / 6 - 1 );
			}
		};
		this._obs = { b: [], s: [] };
		const bd = meta.buildings?.data || [];
		for ( let k = 0; k < bd.length; k += 11 ) {
			const x = bd[ k ], z = bd[ k + 1 ], w = bd[ k + 2 ], d = bd[ k + 3 ];
			this._obs.b.push( x, z, w / 2, d / 2, bd[ k + 4 ], ( bd[ k + 8 ] || 1 ) * 3.2 );
			const r = Math.hypot( w, d ) / 2 + 12;
			put( 'b', x - r, z - r, x + r, z + r );
		}
		for ( const rw of meta.runways || [] ) {
			this._obs.b.push( rw.x, rw.z, rw.len / 2 + 30, rw.w / 2 + 12, rw.angle, 0 );
			const r = rw.len / 2 + 50;
			put( 'b', rw.x - r, rw.z - r, rw.x + r, rw.z + r );
		}
		const KINDS = { metro: 1, town: 2, village: 3, resort: 4, military: 5, airport: 5, observatory: 5 };
		const seg = ( ax, az, bx, bz, hw, kind ) => {
			this._obs.s.push( ax, az, bx, bz, hw, kind );
			const m = hw + 12;
			put( 's', Math.min( ax, bx ) - m, Math.min( az, bz ) - m, Math.max( ax, bx ) + m, Math.max( az, bz ) + m );
		};
		for ( const st of meta.streets || [] ) {
			const city = meta.cities[ st[ 0 ] ];
			seg( st[ 1 ], st[ 2 ], st[ 4 ], st[ 5 ], st[ 7 ] / 2 + ( st[ 8 ] || 0 ), KINDS[ city?.kind ] || 2 );
		}
		for ( const rd of meta.roads || [] ) {
			const p = rd.pts;
			for ( let k = 0; k + 5 < p.length; k += 3 ) seg( p[ k ], p[ k + 1 ], p[ k + 3 ], p[ k + 4 ], rd.w / 2 + 1, 0 );
		}
		this._obsGrid = grid;
		this._obsKey = key;
	}

	// forget every streamed cell (they are requested again with the current obstacles)
	_rescatter() {
		for ( const c of this.cells.values() ) if ( c.job ) c.job.cancelled = true;
		this.cells.clear();
		for ( const b in this._bandDirty ) this._bandDirty[ b ] = true;
		this._streamPos.set( 1e9, 0, 0 );
	}

	_obstaclesFor( x0, z0, size ) {
		const B = 128, m = 14;
		const bs = new Set(), ss = new Set();
		for ( let i = Math.floor( ( x0 - m ) / B ); i <= Math.floor( ( x0 + size + m ) / B ); i ++ ) for ( let j = Math.floor( ( z0 - m ) / B ); j <= Math.floor( ( z0 + size + m ) / B ); j ++ ) {
			const e = this._obsGrid.get( this._obsKey( i, j ) );
			if ( ! e ) continue;
			for ( const k of e.b ) bs.add( k );
			for ( const k of e.s ) ss.add( k );
		}
		const pack = ( set, src ) => {
			if ( ! set.size ) return null;
			const a = new Float32Array( set.size * 6 );
			let o = 0;
			for ( const k of set ) { for ( let q = 0; q < 6; q ++ ) a[ o + q ] = src[ k * 6 + q ]; o += 6; }
			return a;
		};
		return { bld: pack( bs, this._obs.b ), seg: pack( ss, this._obs.s ), cty: citiesNear( this.world.meta.cities, x0, z0, size ) };
	}

	// ---- quality -------------------------------------------------------------------------------------------------

	setQuality() {
		const name = QUALITY[ this.settings.get( 'vegetation' ) ] ? this.settings.get( 'vegetation' ) : 'high';
		const q = QUALITY[ name ];
		this.q = q;
		const rd = Math.min( 2600, this.settings.get( 'renderDistance' ) || 1400 );
		VG.uDensity.value = q.density;
		// LOD cross-fades by anti-aliasing mode: a moving dither under TAA (it resolves into a blend),
		// alpha to coverage with MSAA (which also softens the cut-out leaf edges), else a clean swap
		const aa = this.settings.get( 'antialias' );
		this._taa = aa === 'taa';
		VG.uVegFadeMode.value = this._taa ? 1 : 0;
		const a2c = aa === 'msaa' && ( this.game.renderer?.maxSamples ?? 4 ) > 1;
		for ( const t of [ ...this.targets.near, ...this.targets.mid, this.impFar, this.impMid ] ) {
			if ( t.material.alphaToCoverage !== a2c ) { t.material.alphaToCoverage = a2c; t.material.needsUpdate = true; }
		}
		// LOD window of a mesh: cross-fade in around `start` and out around `end` when another
		// level takes over there; the last level of a plant shrinks away over the end of its range
		// instead (an empty window hides the mesh)
		const win = ( U, start, end, last ) => {
			U.uShrinkEnd.value = last ? 1 : 0;
			if ( end <= 0 ) { U.uLod.value.set( 0, 0, - 2, - 1 ); return; }
			const a = start * FADE, b = end * FADE;
			U.uLod.value.set( start > 0 ? start - a * 0.5 : 0, start > 0 ? start + a * 0.5 : 0, last ? end * 0.85 : end - b * 0.5, last ? end : end + b * 0.5 );
		};
		this.ranges = []; // species -> { near, mid, imp: [ start, end ] }
		let nearMax = 0, midMax = 0, detailMax = 0;
		for ( let s = 0; s < NSP; s ++ ) {
			const cfg = SPEC[ s ], T = this.spTargets[ s ];
			const near = cfg.near * q.dist;
			// (the mid models of the closed rain forest are most of its triangles: the lower levels hand
			// over to the impostors sooner, Tidewater's trees go straight from near to impostor at 75 m)
			const mid = cfg.mid ? Math.max( near + 20, cfg.mid * q.dist * q.mid ) : 0;
			let imp = null;
			if ( cfg.imp === 'far' ) imp = [ mid || near, Math.max( ( mid || near ) + 50, rd * q.far ) ];
			else if ( cfg.imp ) imp = [ near, Math.max( near + 20, cfg.imp * q.dist ) ];
			this.ranges[ s ] = { near, mid, imp };
			if ( ! T.near ) continue;
			win( T.near.U, 0, near, ! T.mid && ! imp );
			if ( T.mid ) win( T.mid.U, near, mid, ! imp );
			nearMax = Math.max( nearMax, near );
			midMax = Math.max( midMax, mid, cfg.imp && cfg.imp !== 'far' ? imp[ 1 ] : 0 );
			if ( SPECIES[ s ].layer === LAYER.DETAIL ) detailMax = Math.max( detailMax, imp ? imp[ 1 ] : mid || near );
		}
		// the ground flora: grass field (off with the grass setting) and beach pebbles
		const grassOn = this.settings.get( 'grass' ) !== false;
		this.grassField.setQuality( grassOn ? name : 'low' );
		this.pebbles.setQuality( name );
		const groundR = Math.max( this.grassField.radius, this.pebbles.radius );
		// under the grass field the terrain shows the sward's shaded base, fading back to its own meadow
		// over the tier 0 cut-off (Tidewater: 62-87 m); the strength follows the camera in update (towns
		// have no grass field)
		const fade = this.grassField.fade;
		this._sward = this.grassField.enabled ? SWARD : 0;
		this._terrain?.TerrainGrass?.fade?.value?.set( fade[ 0 ], fade[ 1 ], this._sward * ( 1 - this._town ) );
		this.impostors.setRanges( this.ranges, q, FADE );
		this.radius = {
			[ LAYER.CANOPY ]: Math.max( rd * q.far, midMax ) + 80,
			[ LAYER.DETAIL ]: detailMax + 40,
			[ LAYER.GRASS ]: groundR > 0 ? groundR + GROUND_MARGIN : 0,
		};
		this.bandR = { near: nearMax + MARGIN.near, mid: midMax + MARGIN.mid, far: this.radius[ LAYER.CANOPY ] };
		for ( const b in this._bandDirty ) this._bandDirty[ b ] = true;
		this._streamPos.set( 1e9, 0, 0 );
	}

	// ---- streaming -------------------------------------------------------------------------------------------

	// Rebuilds the list of missing cells (nearest first) after the camera moved or every 250 ms, and
	// tops up the worker jobs from it every frame so the pool never idles while cells are missing.
	_stream( cam, now ) {
		const moved = this._streamPos.distanceToSquared( cam ) > 100;
		if ( moved || now - this._lastStream > 250 ) this._plan( cam, now );
		const want = this._want;
		const maxFlight = this.pool.workers.length * 6;
		while ( this.inFlight < maxFlight && this._wantI < want.length ) {
			const w = want[ this._wantI ++ ];
			if ( ! this.cells.has( w.k ) ) this._request( w );
		}
	}

	// cells requested or still to request around the camera (0 once the view is complete)
	get pending() { return this.inFlight + Math.max( 0, this._want.length - this._wantI ); }

	_plan( cam, now ) {
		this._lastStream = now;
		this._streamPos.copy( cam );
		const want = this._want;
		want.length = 0;
		this._wantI = 0;
		for ( const layer of [ LAYER.GRASS, LAYER.DETAIL, LAYER.CANOPY ] ) {
			const R = this.radius[ layer ];
			const size = LAYER_CELL[ layer ];
			// evict
			for ( const [ k, c ] of this.cells ) {
				if ( c.layer !== layer ) continue;
				const d = Math.hypot( ( c.i + 0.5 ) * size - cam.x, ( c.j + 0.5 ) * size - cam.z );
				if ( d > R * 1.2 + size ) {
					if ( c.job ) { c.job.cancelled = true; }
					this.cells.delete( k );
				}
			}
			if ( R <= 0 ) continue;
			const i0 = Math.floor( ( cam.x - R ) / size ), i1 = Math.floor( ( cam.x + R ) / size );
			const j0 = Math.floor( ( cam.z - R ) / size ), j1 = Math.floor( ( cam.z + R ) / size );
			for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
				const dx = Math.max( i * size - cam.x, 0, cam.x - ( i + 1 ) * size ), dz = Math.max( j * size - cam.z, 0, cam.z - ( j + 1 ) * size );
				const d = Math.hypot( dx, dz );
				if ( d > R ) continue;
				const k = cellKey( layer, i, j );
				if ( this.cells.has( k ) ) continue;
				// open sea: nothing to scatter
				const [ , hi ] = this.hf.rangeOver( i * size, j * size, size );
				if ( hi < 0.3 ) {
					this.cells.set( k, { layer, i, j, state: 3, data: null } );
					if ( layer === LAYER.GRASS ) this.ground.put( i, j, null );
					continue;
				}
				want.push( { k, layer, i, j, d: d / ( layer === LAYER.GRASS ? 3 : layer === LAYER.DETAIL ? 1.6 : 1 ) } );
			}
		}
		want.sort( ( a, b ) => a.d - b.d );
	}

	_request( w ) {
		const size = LAYER_CELL[ w.layer ];
		const obs = this._obstaclesFor( w.i * size, w.j * size, size );
		const msg = { type: 'scatter', layer: w.layer, i: w.i, j: w.j, bld: obs.bld, seg: obs.seg, cty: obs.cty };
		const cell = { layer: w.layer, i: w.i, j: w.j, state: 1, data: null, job: null };
		this.cells.set( w.k, cell );
		this.inFlight ++;
		cell.job = this.pool.submit( msg, w.d / 900 + ( w.layer === LAYER.CANOPY ? 0.05 : 0 ) );
		cell.job.promise.then( ( r ) => {
			this.inFlight --;
			cell.job = null;
			if ( this.cells.get( w.k ) !== cell ) return; // evicted meanwhile
			if ( ! r ) { this.cells.delete( w.k ); return; }
			cell.data = r.data; cell.off = r.off; cell.state = 2;
			// the ground layer's cells carry the ground flora's data
			if ( w.layer === LAYER.GRASS ) { this.ground.put( w.i, w.j, r.ground || null ); return; }
			this._markDirty( cell );
		} ).catch( () => { this.inFlight --; this.cells.delete( w.k ); } );
	}

	_markDirty( cell ) {
		const size = LAYER_CELL[ cell.layer ];
		const cam = this._streamPos;
		const d = Math.hypot( ( cell.i + 0.5 ) * size - cam.x, ( cell.j + 0.5 ) * size - cam.z ) - size * 0.71;
		if ( d < this.bandR.near ) this._bandDirty.near = true;
		if ( d < this.bandR.mid ) this._bandDirty.mid = true;
		if ( cell.layer === LAYER.CANOPY ) this._bandDirty.far = true;
	}

	// ---- band refills ----------------------------------------------------------------------------------------------

	_bands( cam, now ) {
		for ( const band of [ 'near', 'mid', 'far' ] ) {
			const moved = this._bandPos[ band ].distanceTo( cam ) > MOVE[ band ];
			const dirty = this._bandDirty[ band ] && now - this._bandTime[ band ] > ( band === 'far' ? 700 : band === 'mid' ? 350 : 150 );
			if ( ! moved && ! dirty ) continue;
			const t0 = performance.now();
			this._fill( band, cam );
			this.stats.rebuildMs = performance.now() - t0;
			this._bandPos[ band ].copy( cam );
			this._bandDirty[ band ] = false;
			this._bandTime[ band ] = now;
			if ( band === 'near' ) this._colPos.set( 1e9, 0, 0 );
		}
	}

	// refill the instance buffers of one band from the cells around the camera
	_fill( band, cam ) {
		const o = this._origin.set( Math.round( cam.x ), Math.round( cam.y ), Math.round( cam.z ) );
		const ox = o.x, oy = o.y, oz = o.z;
		const density = VG.uDensity.value;
		const R = this.ranges;
		const layers = this.bandLayers[ band ], targets = this.bandTargets[ band ];
		for ( const t of targets ) t.begin();
		const bandR = this.bandR[ band ];
		const m = MARGIN[ band ];
		const imp = this.impostors;
		for ( const c of this.cells.values() ) {
			if ( c.state !== 2 || ! layers.includes( c.layer ) ) continue;
			const size = LAYER_CELL[ c.layer ];
			const x0 = c.i * size, z0 = c.j * size;
			const dx = Math.max( x0 - cam.x, 0, cam.x - x0 - size ), dz = Math.max( z0 - cam.z, 0, cam.z - z0 - size );
			if ( dx * dx + dz * dz > bandR * bandR ) continue;
			const data = c.data, off = c.off;
			for ( let s = 0; s < NSP; s ++ ) {
				const a = off[ s ], b = off[ s + 1 ];
				if ( a === b ) continue;
				const r = R[ s ];
				let tgt = null, lo = 0, hi = 0, impK = - 1;
				if ( band === 'near' ) { tgt = this.spTargets[ s ].near; hi = r.near + m; } else if ( band === 'mid' ) {
					if ( this.spTargets[ s ].mid ) { tgt = this.spTargets[ s ].mid; lo = r.near - m; hi = r.mid + m; } else if ( r.imp && SPEC[ s ].imp !== 'far' ) { tgt = this.impMid; lo = r.imp[ 0 ] - m; hi = r.imp[ 1 ] + m; impK = imp.slot[ s ]; }
				} else if ( SPEC[ s ].imp === 'far' ) { tgt = this.impFar; lo = r.imp[ 0 ] - m; hi = r.imp[ 1 ] + m; impK = imp.slot[ s ]; }
				if ( ! tgt || hi <= 0 ) continue;
				const lo2 = lo > 0 ? lo * lo : - 1, hi2 = hi * hi;
				const far = band === 'far';
				for ( let n = a; n < b; n ++ ) {
					const q = n * STRIDE;
					const rank = data[ q + 5 ];
					if ( rank >= density ) continue;
					const ex = data[ q ] - cam.x, ez = data[ q + 2 ] - cam.z;
					const d2 = ex * ex + ez * ez;
					if ( d2 > hi2 || d2 < lo2 ) continue;
					// far forests thin out with distance (the shader shrinks the same ranks away)
					if ( far && rank > density * ( imp.keepAt( Math.sqrt( d2 ) ) + 0.15 ) ) continue;
					tgt.push( data, q, ox, oy, oz, impK >= 0 ? impK + rank * 0.999 : - 1 );
				}
			}
		}
		let total = 0;
		for ( const t of targets ) { t.end( o ); total += t.count; }
		this.stats[ band ] = total;
	}

	// ---- physics: trunk boxes around the player -------------------------------------------------------------------

	_colliders() {
		const p = this.game.player.pos;
		if ( this._colPos.distanceToSquared( p ) < 36 ) return;
		this._colPos.copy( p );
		const phys = this.game.physics;
		const keep = new Set();
		this.nearPlants = [];
		const R2 = COLLIDE_R * COLLIDE_R;
		const density = VG.uDensity.value;
		for ( const [ ck, c ] of this.cells ) {
			if ( c.state !== 2 || c.layer === LAYER.GRASS ) continue;
			const size = LAYER_CELL[ c.layer ];
			const dx = Math.max( c.i * size - p.x, 0, p.x - ( c.i + 1 ) * size ), dz = Math.max( c.j * size - p.z, 0, p.z - ( c.j + 1 ) * size );
			if ( dx * dx + dz * dz > R2 ) continue;
			const data = c.data, off = c.off;
			for ( let s = 0; s < NSP; s ++ ) {
				const col = SPECIES[ s ].collider;
				if ( ! col && s !== SP.BANANA ) continue;
				for ( let n = off[ s ]; n < off[ s + 1 ]; n ++ ) {
					const q = n * STRIDE;
					if ( data[ q + 5 ] >= density ) continue;
					const x = data[ q ], z = data[ q + 2 ];
					if ( ( x - p.x ) ** 2 + ( z - p.z ) ** 2 > R2 ) continue;
					const key = ck * 8192 + n;
					if ( s === SP.PALM || s === SP.BANANA ) this.nearPlants.push( { key, s, x, y: data[ q + 1 ], z, S: data[ q + 3 ], a: data[ q + 6 ], b: data[ q + 7 ] } );
					if ( ! col ) continue;
					keep.add( key );
					if ( this.colliders.has( key ) ) continue;
					const sc = s === SP.PALM ? 1 : data[ q + 3 ];
					let r = col.r * sc, h = col.h * ( s === SP.PALM ? 1 : sc ), y = data[ q + 1 ];
					let cx = x, cz = z;
					if ( s === SP.ROCK ) { r = 0.85 * sc; h = 1.1 * sc * data[ q + 6 ]; y += h * 0.1; }
					if ( s === SP.PALM ) {
						// follow a leaning trunk over its lowest metres
						const H = data[ q + 3 ], lean = data[ q + 6 ], b = data[ q + 7 ], curved = b > 7, az = curved ? b - 8 : b;
						const u = Math.min( 1, 1.6 / H ), f = curved ? u * ( 2 - u ) : u;
						cx += Math.cos( az ) * lean * f * H; cz += Math.sin( az ) * lean * f * H;
					}
					const box = phys.add( { x: cx, y: y + h / 2, z: cz, hx: r * 0.8, hy: h / 2, hz: r * 0.8, yaw: data[ q + 4 ], mat: col.mat, kind: 'solid', owner: this } );
					box.veg = { species: s, key };
					this.colliders.set( key, box );
				}
			}
		}
		for ( const [ k, box ] of this.colliders ) if ( ! keep.has( k ) ) { phys.remove( box ); this.colliders.delete( k ); }
	}

	// ---- per frame -------------------------------------------------------------------------------------------------

	update( dt ) {
		const now = performance.now();
		this.stats.frames ++;
		this.stats.cells = this.cells.size;
		VG.uVegFrame.value = this._taa ? this.stats.frames % 64 : 0;
		const cam = this.world.camera.position;
		VG.uWindStr.value = 0.25 + ( this.game.weather?.wind ?? 0.45 ) * 0.95;
		VG.uPlayer.value.copy( this.game.player.pos );
		// plants past the sun's shadow maps skip the shadow pass: the cascades' last split (render/Shadows.js),
		// or the far corners of the single map centred ~0.45 half-sizes ahead of the camera
		const csm = this.world.csm;
		const splits = csm?.enabled ? csm.cfg?.splits : null;
		VG.uShadowFar.value = splits?.length ? splits[ splits.length - 1 ] * 1.05 : ( this.world.shadowHalf || 85 ) * 1.9;
		this.impostors.update( cam );
		// the terrain's travelling gusts: the grass bends and shows its sheen in the same waves
		const go = this._terrain?.TerrainGust?.offset;
		if ( go ) VG.uGustOff.value.set( fract( - go.x / 140 ), fract( - go.y / 140 ), fract( - go.x / 61 ), fract( - go.y / 61 ) );
		// the shaded sward base the terrain draws under the grass field (it doesn't know our mask: towns,
		// beaches and forests have no blades) follows the share of the ground around the camera that has
		// grass (the ground data's 4 m squares within 40 m)
		if ( now - this._townT > 250 ) {
			this._townT = now;
			this._town = 1 - this._grassShare( cam, 40 );
		}
		const sw = this._terrain?.TerrainGrass?.fade?.value;
		if ( sw ) sw.z += ( this._sward * ( 1 - this._town ) - sw.z ) * Math.min( 1, dt * 1.5 );
		this._stream( cam, now );
		this._bands( cam, now );
		// the ground flora: upload the blocks that arrived, follow the camera
		const camera = this.world.camera;
		this.ground.update( cam );
		if ( this.grassField.update( camera ) ) this.stats.grass = this.grassField.cellCounts.join( '/' );
		this.pebbles.pixelHeight = this.game.renderer?.height || 1080;
		if ( this.pebbles.update( camera, this.hf.heightAt( cam.x, cam.z ) ) ) this.stats.pebbles = this.pebbles.count;
		this._colliders();
	}

	// share of the loaded 4 m ground squares within r of the camera that carry grass (0 when none loaded)
	_grassShare( cam, r ) {
		const gd = this.ground, C = gd.cells;
		let n = 0, g = 0;
		const i0 = Math.floor( ( cam.x - r ) / 4 ), i1 = Math.floor( ( cam.x + r ) / 4 ), j0 = Math.floor( ( cam.z - r ) / 4 ), j1 = Math.floor( ( cam.z + r ) / 4 );
		for ( let j = j0; j <= j1; j += 2 ) for ( let i = i0; i <= i1; i += 2 ) {
			if ( ( i * 4 + 2 - cam.x ) ** 2 + ( j * 4 + 2 - cam.z ) ** 2 > r * r ) continue;
			const k = gd.cell4( i, j );
			if ( k < 0 ) continue;
			n ++;
			if ( C[ k + 2 ] ) g ++;
		}
		return n ? Math.sqrt( g / n ) : 0;
	}

	// ---- queries and interactions ---------------------------------------------------------------------------------

	// nearest tree / palm / big plant with a trunk within r of (x, z)
	treeAt( x, z, r = 3 ) {
		let best = null, bd = r * r;
		for ( const [ ck, c ] of this.cells ) {
			if ( c.state !== 2 || c.layer === LAYER.GRASS ) continue;
			const size = LAYER_CELL[ c.layer ];
			const dx = Math.max( c.i * size - x, 0, x - ( c.i + 1 ) * size ), dz = Math.max( c.j * size - z, 0, z - ( c.j + 1 ) * size );
			if ( dx * dx + dz * dz > bd ) continue;
			for ( let s = 0; s < NSP; s ++ ) {
				if ( ! SPECIES[ s ].collider || s === SP.ROCK ) continue;
				for ( let n = c.off[ s ]; n < c.off[ s + 1 ]; n ++ ) {
					const q = n * STRIDE;
					if ( c.data[ q + 5 ] >= VG.uDensity.value ) continue;
					const d = ( c.data[ q ] - x ) ** 2 + ( c.data[ q + 2 ] - z ) ** 2;
					if ( d < bd ) { bd = d; best = { key: ck * 8192 + n, species: s, name: SPECIES[ s ].name, x: c.data[ q ], y: c.data[ q + 1 ], z: c.data[ q + 2 ], scale: c.data[ q + 3 ], dist: Math.sqrt( d ) }; }
				}
			}
		}
		return best;
	}

	// F prompts: shake a palm for a coconut, pick bananas
	interactions( ray ) {
		const list = this.nearPlants;
		if ( ! list || ! list.length ) return null;
		const o = ray.origin, d = ray.dir;
		let best = null;
		for ( const p of list ) {
			const ex = p.x - o.x, ez = p.z - o.z;
			if ( ex * ex + ez * ez > 36 ) continue;
			let cx = p.x, cz = p.z, r = 0.35, y0 = p.y, y1 = p.y + 3;
			if ( p.s === SP.PALM ) {
				const curved = p.b > 7, az = curved ? p.b - 8 : p.b;
				const u = Math.min( 1, 1.5 / p.S ), f = curved ? u * ( 2 - u ) : u;
				cx += Math.cos( az ) * p.a * f * p.S; cz += Math.sin( az ) * p.a * f * p.S;
				r = 0.45;
			} else { r = 0.9; y1 = p.y + 2.6 * p.S; }
			// ray vs vertical cylinder (closest approach in xz)
			const dx = d.x, dz = d.z;
			const L2 = dx * dx + dz * dz;
			if ( L2 < 1e-6 ) continue;
			const t = ( ( cx - o.x ) * dx + ( cz - o.z ) * dz ) / L2;
			if ( t < 0 ) continue;
			const px = o.x + dx * t - cx, pz = o.z + dz * t - cz;
			if ( px * px + pz * pz > r * r ) continue;
			const y = o.y + d.y * t;
			if ( y < y0 - 0.2 || y > y1 ) continue;
			if ( ! best || t < best.t ) best = { p, t: Math.max( 0.1, t - r * 0.5 ) };
		}
		if ( ! best ) return null;
		const p = best.p;
		// picked plants regrow after two in-game days; until then there is nothing to offer
		const last = this.picked[ p.key ];
		if ( last !== undefined && ( this.game.time?.hours ?? 0 ) - last < REGROW_H ) return null;
		// the trunk's own collider must not count as a wall in front of it
		const base = { t: best.t, id: 'veg:' + p.key, owner: this, ownerBox: this.colliders.get( p.key ) || null };
		if ( p.s === SP.PALM ) {
			if ( ! getItem( 'coconut' ) ) return null;
			// tall palms take a longer, harder shake
			return [ { ...base, label: 'Shake palm', hold: 1 + Math.max( 0, p.S - 8 ) * 0.08, action: () => this._harvest( p, 'coconut' ) } ];
		}
		// banana plants carry a bunch on some instances only (b > 0.55, as the model shows it)
		if ( p.b < 0.55 || ! getItem( 'banana' ) ) return null;
		return [ { ...base, label: 'Pick bananas', hold: 0.8, action: () => this._harvest( p, 'banana' ) } ];
	}

	_harvest( p, id ) {
		const g = this.game;
		this.picked[ p.key ] = g.time?.hours ?? 0;
		_v.set( p.x, p.y + 1, p.z );
		if ( id === 'banana' ) {
			// a hand of bananas straight into the inventory (dropped at the feet when full)
			const n = 3 + Math.floor( Math.random() * 3 );
			g.audio?.play?.( 'pickup', { pos: _v, vol: 0.6 } );
			if ( g.give?.( 'banana', n ) ) g.toast?.( `Picked ${n} bananas`, 'info' );
			return;
		}
		// one or two coconuts land around the foot of the trunk, on the player's side
		g.audio?.play?.( 'hit_wood', { pos: _v, vol: 0.6 } );
		const n = Math.random() < 0.4 ? 2 : 1;
		const pl = g.player.pos;
		for ( let k = 0; k < n; k ++ ) {
			const st = makeStack( 'coconut', 1 );
			if ( ! st ) return;
			const a = Math.atan2( pl.z - p.z, pl.x - p.x ) + ( Math.random() - 0.5 ) * 1.6;
			const r = 0.7 + Math.random() * 0.8;
			const x = p.x + Math.cos( a ) * r, z = p.z + Math.sin( a ) * r;
			const pos = new THREE.Vector3( x, ( g.physics.ground?.( x, z, p.y + 3 )?.y ?? p.y ) + 0.15, z );
			if ( g.items3d?.spawn ) g.items3d.spawn( st, pos, { persistent: true } );
			else if ( g.player.inventory.add( st ) === 0 ) g.player.inventory.changed?.();
		}
		g.toast?.( n > 1 ? 'Two coconuts fell' : 'A coconut fell', 'info' );
	}

	serialize( save ) {
		save.world = save.world || {};
		const h = this.game.time?.hours ?? 0;
		const picked = {};
		for ( const k in this.picked ) if ( h - this.picked[ k ] < REGROW_H ) picked[ k ] = this.picked[ k ];
		save.world.vegetation = { picked };
	}

	load( save ) {
		this.picked = save?.world?.vegetation?.picked || {};
	}

	dispose() {
		this.disposed = true;
		this._terrain?.TerrainGrass?.fade?.value?.setZ( 0 );
		for ( const u of this._unsub || [] ) u();
		this._unprovide?.();
		for ( const c of this.cells.values() ) if ( c.job ) c.job.cancelled = true;
		this.cells.clear();
		this.game.physics.removeOwner( this );
		this.colliders.clear();
		for ( const list of Object.values( this.targets ) ) for ( const t of list ) t.dispose();
		this.grassField.dispose();
		this.pebbles.dispose();
		this.ground.dispose();
		for ( const g of [ ...this.models, ...this.midModels ] ) g?.dispose();
		this.impostors.dispose();
		this.atlas.texture.dispose();
		this.game.scene.remove( this.group );
	}
}

export function install( game ) {
	const veg = new Vegetation( game );
	game.vegetation = veg;
	game.register( veg );
	veg._unprovide = game.interact?.addProvider( ( ray ) => veg.interactions( ray ) ) || null;
	return veg;
}

