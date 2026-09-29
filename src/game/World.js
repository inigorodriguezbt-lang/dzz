// The world container: data, scene graph, environment systems and their per-frame update.
import * as THREE from 'three';
import { HeightField, loadTerrainBuffer } from '../world/HeightField.js';
import { WorkerPool } from '../core/WorkerPool.js';
import { Terrain } from '../world/Terrain.js';
import { Sky } from '../world/Sky.js';
import { Ocean } from '../world/Ocean.js';
import { G, preloadTextures, setMaxAnisotropy } from '../render/Materials.js';
import { SunShadows } from '../render/Shadows.js';

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

		// the key light (sun or moon); its shadows are the cascades (render/Shadows.js), not three's own map
		this.sun = new THREE.DirectionalLight( 0xffffff, 1 );
		this.sun.name = 'keyLight';
		this.sun.castShadow = false;
		this.scene.add( this.sun, this.sun.target );
		this.csm = new SunShadows( this.renderer );
		this.csm.setQuality( this.settings.get( 'shadows' ) );
		this.settings.on( 'shadows', ( q ) => this.csm.setQuality( q ) );
		// the post chain's sun shafts read the cascades and the view clouds
		this.renderer.shadows = this.csm;
		this.renderer.haze.cloudSource = this.sky.clouds;
		this.renderer.flare.cloudSource = this.sky.clouds;
		this.settings.on( 'water', v => this.ocean.setQuality( v ) );
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
		// the key light follows the sky model: the sun, then the moon once the sun is 4 degrees down
		const L = this.sky.keyDir;
		this.sun.position.copy( this.camera.position ).addScaledVector( L, 700 );
		this.sun.target.position.copy( this.camera.position );
		this.sun.target.updateMatrixWorld();
		this.sun.color.copy( this.sky.keyColor );
		this.sun.intensity = 1;
		for ( const sys of this.systems ) sys.update && sys.update( dt );
		const r = this.renderer;
		this.ocean.update( dt, this.camera, r.sceneColor, r.sceneDepth, new THREE.Vector2( r.width, r.height ) );
		// cascaded shadows of the key light, fitted to this frame's camera
		this.csm.update( this.camera, L, this.scene );
	}
}
