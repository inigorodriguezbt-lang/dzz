// The running game: owns the world, the player and every gameplay system, and the frame loop.
// Subsystems are optional at runtime (each is null-checked) so the game runs while pieces load.
import * as THREE from 'three';

const _q = new THREE.Quaternion();
import { Events } from '../core/Events.js';
import { Physics } from './Physics.js';
import { EntityManager } from './Entities.js';
import { Player } from './Player.js';
import { Survival } from './Survival.js';
import { PlayerInventory } from './Inventory.js';
import { Actions } from './Actions.js';
import { Interact } from './Interact.js';
import { Weather } from './Weather.js';
import { Markers } from './Markers.js';
import { Water } from './Water.js';
import { Bodies } from './Bodies.js';
import { makeStack, getItem } from './items/ItemDB.js';

export class Game {
	constructor( app, world, save ) {
		this.app = app;
		this.settings = app.settings;
		this.input = app.input;
		this.renderer = app.renderer;
		this.audio = app.audio;
		this.saves = app.saves;
		this.world = world;
		this.scene = world.scene;
		this.camera = world.camera;
		this.hf = world.hf;
		this.save = save;
		this.mode = save.mode;
		this.difficulty = save.difficulty;
		this.seed = save.seed;
		this.events = new Events();
		this.physics = new Physics( this.hf, world.ocean );
		this.entities = new EntityManager( this );
		this.player = new Player( this );
		this.survival = new Survival( this );
		this.actions = new Actions( this );
		this.interact = new Interact( this );
		this.weather = new Weather( this );
		this.markers = new Markers( this );
		this.water = new Water( this );
		this.bodies = new Bodies( this );
		this.stats = save.stats;
		this.time = save.time; // { hours, dayMinutes }
		this.paused = false;
		this.inputActive = false; // gameplay input: false while menus / chat are open
		this.dead = false;
		this.autosaveT = 0;
		this.playTime = save.playTime || 0;
		this.systems = [ this.markers, this.bodies ]; // { update(dt) } registered by the content modules
		this.creativeSpeed = 1;
		this.timeFrozen = false;
		this.viewScene = new THREE.Scene();
		this.viewCamera = new THREE.PerspectiveCamera( 55, 1, 0.01, 10 );
		this.viewScene.add( new THREE.HemisphereLight( 0xcfe6ff, 0x3a3326, 1.2 ) );
		this.viewSun = new THREE.DirectionalLight( 0xffffff, 1.5 );
		this.viewScene.add( this.viewSun, this.viewSun.target );
	}

	get hour() { return ( ( this.time.hours % 24 ) + 24 ) % 24; }
	get day() { return Math.floor( this.time.hours / 24 ) + 1; }
	get rnd() { return Math.random; }

	register( sys ) { if ( sys ) this.systems.push( sys ); return sys; }

	async start() {
		const s = this.save;
		// content modules (each optional)
		const mods = await this.app.loadModules();
		for ( const m of mods ) { try { await m( this ); } catch ( e ) { console.error( 'module failed', e ); } }
		// player
		if ( s.player ) {
			this.player.load( s.player );
			this.survival.load( s.survival );
		} else {
			this.spawnFresh();
		}
		this.weather.load( s.weather );
		this.events.on( 'kill', ( e ) => {
			if ( e.source !== this.player && e.source !== 'player' ) return;
			if ( e.target?.type === 'zombie' ) { this.stats.zombies = ( this.stats.zombies || 0 ) + 1; this.stats.lifeKills = ( this.stats.lifeKills || 0 ) + 1; }
			else if ( e.target?.type === 'animal' ) this.stats.animals = ( this.stats.animals || 0 ) + 1;
			else if ( e.target?.type === 'npc' ) this.stats.kills = ( this.stats.kills || 0 ) + 1;
		} );
		for ( const sys of this.systems ) if ( sys.load ) { try { sys.load( s ); } catch ( e ) { console.error( 'load', e ); } }
		this.events.emit( 'start', {} );
	}

	// a new character: a random beach, a shirt and a bandage (DayZ style), or the chosen island
	spawnFresh() {
		const rnd = Math.random;
		this.player.inventory = PlayerInventory.freshSpawn( rnd );
		this.survival.reset();
		const p = this.findSpawn( this.save.spawn || 'random' );
		this.player.pos.set( p.x, this.physics.ground( p.x, p.z, 1e4 ).y, p.z );
		this.player.yaw = p.yaw;
		this.player.pitch = 0;
		this.player.stance = 'stand';
		this.player.flying = this.mode === 'creative' && false;
		this.stats.lifeStart = this.time.hours;
		this.justSpawned = true;
		if ( this.mode === 'creative' ) {
			for ( const [ id, q ] of [ [ 'm4a1', 1 ], [ 'mag_stanag30', 3 ], [ 'glock17', 1 ], [ 'machete', 1 ], [ 'backpack_hiking', 1 ] ] ) {
				const st = makeStack( id, q, { full: true } );
				if ( st ) this.player.inventory.add( st );
			}
		}
	}

	findSpawn( where ) {
		const meta = this.world.meta;
		const hf = this.hf;
		const isl = { random: null, kauai: 2, oahu: 3, molokai: 4, lanai: 5, maui: 6, bigisland: 8, niihau: 1, kahoolawe: 7 }[ where ] ?? null;
		// sandy beach cells near the sea, away from the biggest cities
		for ( let tries = 0; tries < 4000; tries ++ ) {
			const x = ( Math.random() * 2 - 1 ) * meta.halfX, z = ( Math.random() * 2 - 1 ) * meta.halfZ;
			const h = hf.baseHeight( x, z );
			if ( h < 0.8 || h > 3.5 ) continue;
			if ( isl && hf.islandAt( x, z ) !== isl ) continue;
			if ( ! isl && [ 7, 1 ].includes( hf.islandAt( x, z ) ) ) continue;
			if ( hf.flagsNear( x, z ) & ( 16 | 32 ) ) continue;
			// the sea must be close, the ground gentle
			let sea = null;
			for ( let k = 0; k < 16 && ! sea; k ++ ) {
				const a = k / 16 * Math.PI * 2;
				for ( const r of [ 12, 24, 40 ] ) if ( hf.baseHeight( x + Math.cos( a ) * r, z + Math.sin( a ) * r ) < - 0.3 ) { sea = a; break; }
			}
			if ( sea === null ) continue;
			const n = hf.normalAt( x, z, new THREE.Vector3(), 2 );
			if ( n.y < 0.93 ) continue;
			// face inland
			const yaw = Math.atan2( Math.cos( sea ), Math.sin( sea ) );
			return { x, z, yaw };
		}
		const c = meta.cities.find( c => c.id === 'haleiwa' ) || meta.cities[ 0 ];
		return { x: c.x, z: c.z, yaw: 0 };
	}

	toast( text, kind = 'info', icon = null ) { this.events.emit( 'toast', { text, kind, icon } ); }

	// ---- the loop ---------------------------------------------------------------------------------

	update( dt ) {
		if ( this.paused ) return;
		this.playTime += dt;
		if ( ! this.timeFrozen ) this.time.hours += dt / ( this.time.dayMinutes * 60 ) * 24;
		this.world.sky.setTime( this.hour, 120 + Math.floor( this.time.hours / 24 ) );
		this.weather.update( dt );
		if ( ! this.dead ) {
			this.player.update( dt );
			this.survival.update( dt );
			this.actions.update( dt );
		}
		for ( const sys of this.systems ) { try { sys.update && sys.update( dt ); } catch ( e ) { console.error( e ); sys._errors = ( sys._errors || 0 ) + 1; if ( sys._errors > 20 ) sys.update = null; } }
		this.entities.update( dt );
		if ( ! this.dead ) this.interact.update( dt );
		// the sun for the view model
		// the view model is drawn with an identity view, so its light must be in camera space to follow the sun
		this.viewSun.position.copy( this.world.sky.sunDir ).applyQuaternion( _q.copy( this.camera.quaternion ).invert() ).multiplyScalar( 5 );
		this.viewSun.color.copy( this.world.sky.night > 0.8 ? this.world.sky.moonColor : this.world.sky.sunColor ).multiplyScalar( 0.55 );
		this.viewCamera.aspect = this.camera.aspect;
		this.viewCamera.fov = Math.min( 70, this.settings.get( 'fov' ) * 0.72 ) * ( this.hands?.viewFov?.() ?? 1 );
		this.viewCamera.updateProjectionMatrix();
		this.audio.setListener( this.camera );
		this.audio.updateAmbience( dt, this );
		this.autosaveT += dt;
		if ( this.autosaveT > 60 && ! this.dead ) { this.autosaveT = 0; this.saveNow(); }
	}

	// grading inputs for the renderer
	grade() {
		const S = this.survival, p = this.player;
		return {
			damage: S.damageFlash,
			lowBlood: THREE.MathUtils.clamp( ( 3800 - S.blood ) / 2200, 0, 1 ),
			drunk: S.drunk, sick: S.sick * 0.6 + S.infection * 0.4,
			underwater: p.underwater ? 1 : 0,
			exposureBias: this.exposure(),
			time: this.world.clock,
			flash: this.flash || 0,
			fade: this.fade || 0,
		};
	}

	// exposure bias on top of the renderer's auto exposure (which handles day, night and shade): interiors a
	// little brighter so they stay readable. Eased over about half a second so a doorway doesn't pop
	exposure() {
		const e = this.world.isIndoors?.( this.player.pos ) ? 1.35 : 1;
		const now = performance.now();
		const dt = Math.min( 0.1, ( now - ( this._expT ?? now ) ) / 1000 );
		this._expT = now;
		this._exp = this._exp ?? e;
		this._exp += ( e - this._exp ) * Math.min( 1, dt * 6 );
		return this._exp;
	}

	// ---- persistence ----------------------------------------------------------------------------------

	gather() {
		const s = this.save;
		s.mode = this.mode;
		s.playTime = this.playTime;
		s.time = this.time;
		s.player = this.player.serialize();
		s.survival = this.survival.serialize();
		s.weather = this.weather.serialize();
		s.stats = this.stats;
		for ( const sys of this.systems ) if ( sys.serialize ) { try { sys.serialize( s ); } catch ( e ) { console.error( 'serialize', e ); } }
		return s;
	}

	async saveNow( thumb = false ) {
		if ( this.dead && this.save.hardcore ) return;
		const s = this.gather();
		if ( thumb ) s.thumb = this.app.thumbnail();
		try { await this.saves.save( s ); } catch ( e ) { console.error( 'save failed', e ); this.toast( 'Saving failed: ' + e.message, 'bad' ); }
	}

	onPlayerDeath( cause ) {
		if ( this.dead ) return;
		this.dead = true;
		this.stats.deaths = ( this.stats.deaths || 0 ) + 1;
		this.deathInfo = { cause, days: ( this.time.hours - ( this.stats.lifeStart || 0 ) ) / 24, kills: this.stats.lifeKills || 0 };
		this.audio.play( 'death', { vol: 0.9 } );
		// the body keeps its gear where it fell
		this.events.emit( 'playerDeath', { cause, pos: this.player.pos.clone(), inventory: this.player.inventory } );
		this.markers.add( { x: this.player.pos.x, z: this.player.pos.z, label: 'Your body', kind: 'death' } );
		if ( this.save.hardcore ) { this.save.dead = true; }
		this.app.ui?.showDeath( this.deathInfo );
		this.saveNow();
	}

	respawn() {
		this.dead = false;
		this.stats.lives = ( this.stats.lives || 1 ) + 1;
		this.stats.lifeKills = 0;
		this.spawnFresh();
		this.player.alive = true;
		this.app.ui?.announceSpawn?.();
		this.survival.damageFlash = 0;
		this.saveNow();
	}

	// sleep in a bed, tent or sleeping bag: the screen fades, hours pass, energy comes back and you
	// wake hungrier. Interrupted when the infected come close.
	sleep( hours = 6, quality = 1 ) {
		if ( this.dead || this.sleeping ) return false;
		const near = this.entities.near( this.player.pos, 25, 'zombie' ).filter( z => z.alive );
		if ( near.length ) { this.toast( "You can't sleep with the infected nearby", 'warn' ); return false; }
		if ( this.survival.energy > 85 ) { this.toast( "You aren't tired", 'info' ); return false; }
		this.sleeping = true;
		const S = this.survival;
		const start = performance.now();
		const dur = 2600;
		const tick = () => {
			const t = Math.min( 1, ( performance.now() - start ) / dur );
			this.flash = 0;
			this.fade = t < 0.3 ? t / 0.3 : t > 0.7 ? ( 1 - t ) / 0.3 : 1;
			if ( t < 1 ) requestAnimationFrame( tick );
			else {
				this.fade = 0;
				this.sleeping = false;
			}
		};
		requestAnimationFrame( tick );
		setTimeout( () => {
			this.time.hours += hours;
			S.energy = Math.min( 100, S.energy + hours * 13 * quality );
			S.hunger = Math.max( 0, S.hunger - hours * 2.2 );
			S.thirst = Math.max( 0, S.thirst - hours * 3 );
			S.health = Math.min( 100, S.health + hours * 2 * quality );
			this.audio.play( 'sleep', { bus: 'ui', vol: 0.5 } );
			this.toast( `Slept ${hours} h`, 'good' );
		}, dur * 0.5 );
		return true;
	}

	// give by id (creative menu, /give)
	give( id, qty = 1, opts = {} ) {
		const def = getItem( id );
		if ( ! def ) return false;
		let left = qty;
		while ( left > 0 ) {
			const n = Math.min( left, def.stack );
			const st = makeStack( id, n, { full: true, ...opts } );
			left -= n;
			const rest = this.player.inventory.add( st );
			if ( rest > 0 ) { st.qty = rest; this.dropStack( st ); }
		}
		return true;
	}

	dropStack( stack, pos = null ) {
		const p = this.player;
		const at = pos || new THREE.Vector3( p.pos.x - Math.sin( p.yaw ) * 0.8, p.pos.y, p.pos.z - Math.cos( p.yaw ) * 0.8 );
		if ( this.items3d ) this.items3d.drop( stack, at );
	}
}
