// The world container: data, scene graph, environment systems and their per-frame update.
import * as THREE from 'three';
import { HeightField, loadTerrainBuffer } from '../world/HeightField.js';
import { WorkerPool } from '../core/WorkerPool.js';
import { Terrain } from '../world/Terrain.js';
import { Sky } from '../world/Sky.js';
import { Ocean } from '../world/Ocean.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G, COMMON_GLSL, SHARED_PARS, preloadTextures, setMaxAnisotropy } from '../render/Materials.js';
import { SunShadows } from '../render/Shadows.js';
import { FS_VERT } from '../render/Renderer.js';

// the key light's visibility around a point (cascades, cloud and hill shadow), averaged over a small cross
const HAND_VIS_FRAG = /* glsl */`
	${SHARED_PARS}
	uniform vec3 uP;
	${COMMON_GLSL}
	void main() {
		vec3 L = normalize( uSunDir );
		float v = 0.0;
		// (the hands are always inside the near cascade: sample it directly, the cascade selection by view
		// distance needs the world camera's view matrix)
		for ( int i = 0; i < 5; i ++ ) {
			vec3 o = i == 0 ? vec3( 0.0 ) : vec3( i == 1 ? 0.18 : i == 2 ? -0.18 : 0.0, 0.0, i == 3 ? 0.18 : i == 4 ? -0.18 : 0.0 );
			v += ( uCsmOn > 0.5 ? csmCascade( uP + o, L, 0, 0.0, 0.0, false ) : 1.0 ) * 0.2;
		}
		v *= cloudShadowAt( uP ) * terrainSunShadowAt( uP );
		gl_FragColor = vec4( v, 0.0, 0.0, 1.0 );
	}`;

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _view = new THREE.Vector2();

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
		// the key light's visibility at the player's hands, for the view model (its own scene: no shadow maps
		// there): a 1x1 pass read back asynchronously, eased
		this.handVis = 1;
		this._handTarget = 1;
		this._handRT = new THREE.WebGLRenderTarget( 1, 1 );
		this._handQuad = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'HandSunVis', uniforms: Object.assign( { uP: { value: new THREE.Vector3() } }, G ),
			vertexShader: FS_VERT, fragmentShader: HAND_VIS_FRAG, depthTest: false, depthWrite: false,
		} ) );
		this._handBuf = new Uint8Array( 4 );
		this._handPending = false;
	}

	async load( onStatus ) {
		onStatus( 'Terrain', 0 );
		const metaRes = await fetch( 'data/world.json' );
		this.meta = await metaRes.json();
		const buf = await loadTerrainBuffer( 'data/terrain.bin.gz', p => onStatus( 'Terrain', p * 0.3 ) );
		this.hf = new HeightField( buf, this.meta );
		onStatus( 'Workers', 0.32 );
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
		// a teleport or a time jump (/tp, /time set, respawn): snap the eye adaptation and drop the temporal
		// history instead of fading in from the old view
		const cp = this.camera.position, dh = Math.abs( this.sky.hour - ( this._lastHour ?? this.sky.hour ) );
		if ( this._lastCam && ( cp.distanceToSquared( this._lastCam ) > 80 * 80 || ( dh > 0.25 && dh < 23.75 ) ) ) this.renderer.resetExposure();
		( this._lastCam ??= new THREE.Vector3() ).copy( cp );
		this._lastHour = this.sky.hour;
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
		this.ocean.update( dt, this.camera, r.sceneColor, r.sceneDepth, _view.set( r.width, r.height ) );
		// cascaded shadows of the key light, fitted to this frame's camera
		this.csm.update( this.camera, L, this.scene );
		this._updateHandVis( dt );
	}

	// the key light's visibility where the first-person hands are (a little ahead of and below the eye)
	_updateHandVis( dt ) {
		const gl = this.renderer.gl;
		if ( ! this._handPending && gl.readRenderTargetPixelsAsync ) {
			const cam = this.camera;
			const e = cam.matrixWorld.elements;
			this._handQuad.material.uniforms.uP.value.copy( cam.position ).addScaledVector( _fwd.set( - e[ 8 ], - e[ 9 ], - e[ 10 ] ), 0.35 ).addScaledVector( _up.set( e[ 4 ], e[ 5 ], e[ 6 ] ), - 0.25 );
			const prev = gl.getRenderTarget();
			gl.setRenderTarget( this._handRT );
			this._handQuad.render( gl );
			gl.setRenderTarget( prev );
			this._handPending = true;
			gl.readRenderTargetPixelsAsync( this._handRT, 0, 0, 1, 1, this._handBuf ).then( () => {
				this._handTarget = this._handBuf[ 0 ] / 255;
				this._handPending = false;
			} ).catch( () => { this._handPending = false; } );
		}
		// eased over ~0.15 s: walking into shade dims the hands with the world, without flicker
		this.handVis += ( this._handTarget - this.handVis ) * Math.min( 1, dt * 7 );
	}
}
