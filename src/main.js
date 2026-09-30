// Deadtide — boot, the app loop and the switch between the title screen and a running world.
import * as THREE from 'three';
import { Settings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { Renderer } from './render/Renderer.js';
import { World } from './game/World.js';
import { Game } from './game/Game.js';
import { SaveSystem } from './core/SaveSystem.js';
import { Audio } from './audio/Audio.js';
import { UI } from './ui/UI.js';
import { Music } from './audio/Music.js';
import { MODULES } from './game/modules.js';

const loaderEl = document.getElementById( 'loader' );
const t0 = performance.now();
function status( s, p ) {
	loaderEl.querySelector( '.loader-status' ).textContent = s;
	loaderEl.querySelector( '.loader-pct' ).textContent = Math.round( p * 100 ) + '%';
	loaderEl.querySelector( '.loader-fill' ).style.transform = `scaleX(${Math.max( 0.02, p )})`;
	const sec = Math.floor( ( performance.now() - t0 ) / 1000 );
	loaderEl.querySelector( '.loader-time' ).textContent = `${Math.floor( sec / 60 )}:${String( sec % 60 ).padStart( 2, '0' )}`;
}

// title-screen camera: slow drifts over famous views
// all at the loader key art's hour (the Kona vista at 18.25), so the curtain dissolves into the same light
const VISTAS = [
	{ at: [ - 3880, - 9660 ], h: 26, yaw: - 118, pitch: - 4, hour: 18.25 }, // Waikīkī towards Diamond Head
	{ at: [ - 6760, - 15260 ], h: 7, yaw: 135, pitch: - 3, hour: 18.25 }, // Sunset Beach, North Shore
	{ at: [ 19870, 13024 ], h: 12, yaw: 90, pitch: - 2, hour: 18.25 }, // Kailua-Kona, looking out to sea
];

class App {
	constructor() {
		this.settings = new Settings();
		this.canvas = document.getElementById( 'view' );
		this.renderer = new Renderer( this.canvas, this.settings );
		this.input = new Input( this.canvas, this.settings );
		this.audio = new Audio( this.settings );
		this.music = new Music( this.audio );
		this.saves = new SaveSystem();
		this.world = new World( this.renderer, this.settings );
		this.game = null;
		this.ui = null;
		this.q = new URLSearchParams( location.search );
		this.last = performance.now();
		this.fps = 60;
		this.frame = 0;
		this.titleT = 0;
		this.vista = VISTAS[ Math.floor( Math.random() * VISTAS.length ) ];
		const unlockAudio = () => { this.audio.init(); };
		window.addEventListener( 'pointerdown', unlockAudio );
		window.addEventListener( 'keydown', unlockAudio );
	}

	async boot() {
		await this.saves.open();
		await this.world.load( status );
		this.onResize();
		addEventListener( 'resize', () => this.onResize() );
		this.settings.on( 'renderScale', () => this.onResize() );
		this.settings.on( 'antialias', () => this.onResize() );
		this.settings.on( 'guiScale', v => document.documentElement.style.setProperty( '--gui', v ) );
		document.documentElement.style.setProperty( '--gui', this.settings.get( 'guiScale' ) );
		this.ui = new UI( this );
		const quick = this.q.get( 'quick' );
		if ( quick ) {
			this.placeTitleCamera();
			await this.world.warmup( status, 0.55, 0.7 );
			const save = SaveSystem.newWorld( { name: 'Test', mode: this.q.get( 'mode' ) || 'creative', seed: 1234, dayMinutes: + ( this.q.get( 'day' ) || 48 ), startHour: + ( this.q.get( 'hour' ) || 10 ) } );
			await this.startGame( save, { at: this.q.get( 'at' ), yaw: this.q.get( 'yaw' ) } );
		} else {
			this.placeTitleCamera();
			await this.world.warmup( status, 0.55, 0.97 );
			loaderEl.classList.add( 'tw-hidden' );
			this.ui.showTitle();
		}
		window.__app = this;
		window.__world = this.world;
		window.__ready = true;
		requestAnimationFrame( () => this.loop() );
	}

	placeTitleCamera() {
		const v = this.vista, cam = this.world.camera;
		const y = Math.max( this.world.hf.heightAt( v.at[ 0 ], v.at[ 1 ] ), 0 ) + v.h;
		cam.position.set( v.at[ 0 ], y, v.at[ 1 ] );
		cam.rotation.set( v.pitch * Math.PI / 180, v.yaw * Math.PI / 180, 0, 'YXZ' );
		cam.updateMatrixWorld();
		this.world.sky.setTime( v.hour, 120 );
	}

	onResize() {
		const w = innerWidth, h = innerHeight;
		this.renderer.resize( w, h );
		const cam = this.world.camera;
		cam.aspect = w / h; cam.updateProjectionMatrix();
		this.world.sky.resize( this.renderer.width, this.renderer.height );
	}

	async loadModules() {
		const out = [];
		for ( const m of MODULES ) {
			try { const mod = await m(); if ( mod.install ) out.push( mod.install ); } catch ( e ) { console.error( 'module import failed', e ); }
		}
		return out;
	}

	async startGame( save, opts = {} ) {
		loaderEl.classList.remove( 'tw-hidden' );
		status( 'Entering world', 0.72 );
		this.ui.hideAll();
		if ( this.game ) await this.quit( false );
		const game = new Game( this, this.world, save );
		this.game = game;
		await game.start();
		if ( opts.at ) {
			const [ x, z ] = opts.at.split( ',' ).map( Number );
			game.player.pos.set( x, game.physics.ground( x, z, 1e4 ).y, z );
			if ( opts.yaw ) game.player.yaw = + opts.yaw * Math.PI / 180;
		}
		// build the surroundings before the curtain lifts
		game.player.update( 0.016 );
		this.world.camera.position.set( game.player.pos.x, game.player.eye, game.player.pos.z );
		await this.world.warmup( status, 0.75, 0.9 );
		for ( let i = 0; i < 40; i ++ ) {
			game.update( 0.001 );
			this.world.update( 0.001 );
			const busy = this.world.pool.busy;
			status( 'Spawning', 0.9 + i / 40 * 0.1 );
			if ( busy === 0 && i > 6 ) break;
			await new Promise( r => setTimeout( r, 60 ) );
		}
		loaderEl.classList.add( 'tw-hidden' );
		this.ui.enterGame( game );
		await game.saveNow( true );
		return game;
	}

	async quit( save = true ) {
		const g = this.game;
		if ( ! g ) return;
		if ( save && ! g.dead ) await g.saveNow( true );
		g.events.emit( 'quit', {} );
		for ( const sys of g.systems ) { try { sys.dispose && sys.dispose(); } catch ( e ) { console.error( e ); } }
		for ( const e of g.entities.list ) e.dispose();
		g.hands?.dispose?.();
		this.game = null;
		this.input.unlock();
	}

	thumbnail() {
		try {
			const c = document.createElement( 'canvas' ); c.width = 320; c.height = 180;
			c.getContext( '2d' ).drawImage( this.canvas, 0, 0, 320, 180 );
			return c.toDataURL( 'image/jpeg', 0.7 );
		} catch ( e ) { return null; }
	}

	loop() {
		const now = performance.now();
		const dt = Math.min( 0.1, ( now - this.last ) / 1000 );
		this.last = now;
		this.fps += ( 1 / Math.max( dt, 1e-3 ) - this.fps ) * 0.05;
		this.frame ++;
		const g = this.game;
		try {
			if ( g ) {
				g.inputActive = this.input.locked && ! this.ui.blocking() && ! g.dead;
				this.input.enabled = g.inputActive;
				g.update( dt );
			} else {
				// title: a slow drift across the vista
				this.titleT += dt;
				const cam = this.world.camera;
				cam.rotation.y += dt * 0.004;
				cam.updateMatrixWorld();
				// (the time holds: a drifting clock took the golden hour into dusk, and jumped when the title
				// came back after a game)
				this.world.sky.setTime( this.vista.hour, 120 );
			}
			this.world.update( dt );
			this.renderer.render( {
				scene: this.world.scene, camera: this.world.camera,
				viewScene: g && ! g.dead && ! g.player.vehicle ? g.viewScene : null, viewCamera: g?.viewCamera,
				grade: g ? g.grade() : { time: this.world.clock },
			} );
			this.ui.update( dt );
			// music: the title screen, and quietly around dawn and dusk in the world
			let level = 0;
			if ( ! g ) level = 1;
			else if ( ! g.dead && ! this.world.isIndoors?.( g.player.pos ) ) {
				const h = g.hour;
				level = 0.55 * Math.max( Math.exp( - Math.pow( ( h - 6.6 ) / 0.7, 2 ) ), Math.exp( - Math.pow( ( h - 18.4 ) / 0.7, 2 ) ) );
				if ( g.entities.near( g.player.pos, 40, 'zombie' ).length ) level = 0;
			}
			this.music.setLevel( level );
			this.music.update();
		} catch ( e ) {
			console.error( e );
		}
		this.input.endFrame();
		window.__frames = ( window.__frames || 0 ) + 1;
		const maxFrames = + ( this.q.get( 'frames' ) || 0 );
		if ( maxFrames && window.__frames >= maxFrames ) { window.__done = true; return; }
		requestAnimationFrame( () => this.loop() );
	}
}

const app = new App();
app.boot().catch( e => {
	console.error( e );
	loaderEl.classList.add( 'tw-error' );
	status( 'Failed: ' + e.message, 1 );
} );
