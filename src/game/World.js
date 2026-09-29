// The world container: data, scene graph, environment systems and their per-frame update.
import * as THREE from 'three';
import { HeightField, loadTerrainBuffer } from '../world/HeightField.js';
import { WorkerPool } from '../core/WorkerPool.js';
import { Terrain } from '../world/Terrain.js';
import { Sky } from '../world/Sky.js';
import { Ocean } from '../world/Ocean.js';
import { G, preloadTextures, setMaxAnisotropy } from '../render/Materials.js';

export const TEXTURES = [
	'sand', 'grass', 'drygrass', 'forest', 'reddirt', 'dirt', 'rock', 'cliff', 'lava', 'snow', 'farm', 'asphalt', 'sidewalk',
	'stucco', 'plaster', 'beige', 'bluewall', 'panels', 'planks', 'oldplanks', 'brick', 'tinroof', 'roof', 'greyroof', 'bitumen',
	'woodfloor', 'tiles', 'carpet', 'concrete', 'metal', 'rust', 'palmbark', 'bark', 'fabric',
];

export class World {
	constructor( renderer, settings ) {
		this.renderer = renderer;
		this.settings = settings;
		this.scene = new THREE.Scene();
		this.scene.name = 'world';
		this.camera = new THREE.PerspectiveCamera( settings.get( 'fov' ), 1, 0.08, 70000 );
		this.camera.position.set( 0, 50, 0 );
		this.clock = 0;
		this.systems = [];
	}

	async load( onStatus ) {
		onStatus( 'Loading the islands', 0 );
		const metaRes = await fetch( 'data/world.json' );
		this.meta = await metaRes.json();
		const buf = await loadTerrainBuffer( 'data/terrain.bin.gz', p => onStatus( 'Loading the islands', p * 0.3 ) );
		this.hf = new HeightField( buf, this.meta );
		onStatus( 'Starting world workers', 0.32 );
		const n = Math.max( 2, Math.min( 4, ( navigator.hardwareConcurrency || 4 ) - 1 ) );
		this.pool = new WorkerPool( n );
		const lean = { cities: this.meta.cities, roads: this.meta.roads, streets: this.meta.streets, runways: this.meta.runways, buildings: this.meta.buildings };
		await this.pool.broadcast( { type: 'init', meta: { halfX: this.meta.halfX, halfZ: this.meta.halfZ }, world: lean }, buf );
		onStatus( 'Loading materials', 0.36 );
		setMaxAnisotropy( Math.min( 8, this.renderer.gl.capabilities.getMaxAnisotropy() ) );
		await preloadTextures( TEXTURES.flatMap( t => [ t + '_d', t + '_n' ] ), p => onStatus( 'Loading materials', 0.36 + p * 0.14 ) );

		this.sky = new Sky( this.renderer, this.settings );
		this.scene.add( this.sky.dome );
		this.scene.add( this.sky.ambientLight );
		this.terrain = new Terrain( this.hf, this.pool, this.settings );
		this.scene.add( this.terrain.group );
		this.ocean = new Ocean( this.renderer, this.hf, this.settings.get( 'water' ) );
		this.scene.add( this.ocean.mesh );

		this.sun = new THREE.DirectionalLight( 0xffffff, 1 );
		this.scene.add( this.sun, this.sun.target );
		this._setupShadows();
		this.settings.on( 'shadows', () => this._setupShadows() );
		this.settings.on( 'water', v => this.ocean.setQuality( v ) );
	}

	// one stabilised shadow frustum that follows the camera (snapped to whole texels so it doesn't shimmer)
	_setupShadows() {
		const q = this.settings.get( 'shadows' );
		const cfg = { off: null, medium: [ 1024, 55 ], high: [ 2048, 85 ], ultra: [ 4096, 120 ] }[ q ];
		const L = this.sun;
		L.castShadow = !! cfg;
		if ( ! cfg ) return;
		const [ size, half ] = cfg;
		if ( L.shadow.map ) { L.shadow.map.dispose(); L.shadow.map = null; }
		L.shadow.mapSize.set( size, size );
		const c = L.shadow.camera;
		c.left = - half; c.right = half; c.top = half; c.bottom = - half; c.near = 1; c.far = 1400;
		c.updateProjectionMatrix();
		L.shadow.bias = - 0.0004;
		L.shadow.normalBias = 0.04;
		L.shadow.radius = 2;
		this.shadowHalf = half;
		this.shadowSize = size;
	}

	isIndoors( p ) { return this.indoorTest ? this.indoorTest( p ) : false; }
	isBeach( x, z ) {
		const h = this.hf.baseHeight( x, z );
		if ( h > 3.5 || ( this.hf.flagsNear( x, z ) & ( 1 | 4 | 16 | 32 ) ) ) return false;
		for ( const r of [ 8, 18, 30 ] ) for ( let k = 0; k < 8; k ++ ) { const a = k / 8 * Math.PI * 2; if ( this.hf.baseHeight( x + Math.cos( a ) * r, z + Math.sin( a ) * r ) < 0 ) return true; }
		return false;
	}

	// block until the terrain around the camera is in
	async warmup( onStatus, from = 0.5, to = 0.95 ) {
		this.terrain.update( this.camera.position );
		let t0 = performance.now(), start = null;
		while ( true ) {
			this.terrain.update( this.camera.position );
			const p = this.terrain.pending;
			if ( start === null ) start = Math.max( 1, p );
			onStatus( 'Building terrain', from + ( to - from ) * ( 1 - Math.min( 1, p / start ) ) );
			if ( p === 0 || performance.now() - t0 > 60000 ) break;
			await new Promise( r => setTimeout( r, 50 ) );
		}
	}

	update( dt ) {
		this.clock += dt;
		G.uTime.value = this.clock;
		G.uCamPos.value.copy( this.camera.position );
		this.terrain.update( this.camera.position );
		this.sky.update( dt, this.camera, this.scene, this.settings );
		// sun light follows the sky model
		const s = this.sky.sunDir;
		const useMoon = s.y < - 0.05;
		const L = useMoon ? this.sky.moonDir : s;
		// centre the shadow frustum ahead of the camera and snap it to the shadow texel grid
		const fwd = new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( this.camera.quaternion );
		fwd.y = 0; fwd.normalize();
		const half = this.shadowHalf || 80;
		const c = this.camera.position.clone().addScaledVector( fwd, half * 0.45 );
		const texel = ( half * 2 ) / ( this.shadowSize || 2048 );
		const lz = L.clone().normalize();
		const lx = new THREE.Vector3( 0, 1, 0 ).cross( lz ).normalize();
		if ( lx.lengthSq() < 1e-6 ) lx.set( 1, 0, 0 );
		const ly = lz.clone().cross( lx );
		const u = Math.round( c.dot( lx ) / texel ) * texel, v = Math.round( c.dot( ly ) / texel ) * texel, w = c.dot( lz );
		c.copy( lx ).multiplyScalar( u ).addScaledVector( ly, v ).addScaledVector( lz, w );
		this.sun.position.copy( c ).addScaledVector( lz, 700 );
		this.sun.target.position.copy( c );
		this.sun.target.updateMatrixWorld();
		this.sun.color.copy( useMoon ? this.sky.moonColor : this.sky.sunColor );
		this.sun.intensity = 1;
		for ( const sys of this.systems ) sys.update && sys.update( dt );
		const r = this.renderer;
		this.ocean.update( dt, this.camera, r.sceneColor, r.sceneDepth, new THREE.Vector2( r.width, r.height ) );
	}
}
