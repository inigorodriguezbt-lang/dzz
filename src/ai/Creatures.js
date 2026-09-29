// Creatures & AI: the infected, animals and bandit survivors. install( game ) sets game.creatures (this
// manager), game.zombies and game.animals, registers the per-frame system, the body / carcass interactions
// and the /summon entries.
//
// The infected are spawned out of sight around the player by the population model (settlement kind,
// building density and kinds, kills), animated at a rate that drops with distance and visibility, and
// despawned far away. Noise draws them (gunshots from hundreds of metres), a scream brings the ones nearby,
// they follow the player's trail through doors and around buildings, pound on doors and cars, and fall into
// ragdolls that stay as searchable bodies for ten minutes.
import * as THREE from 'three';
import { CharacterLib, AVATARS, ALOHA, avatarsFor } from './Characters.js';
import { Zombie, ZTYPES, WORN, ALOHA_ITEM } from './Zombie.js';
import { Population } from './Population.js';
import { Animals } from './Animals.js';
import { Bandits } from './Bandit.js';
import { rollLoot } from '../game/items/Loot.js';
import { getItem, makeStack } from '../game/items/ItemDB.js';

const rnd = Math.random;
const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
const TRAIL = 64;
const CORPSE_LIFE = 600; // s
const TEMPLATE_BUDGET = 10; // avatars kept loaded
const DIFF = {
	easy: { speed: 0.85, sense: 0.8, attack: 0.8 },
	normal: { speed: 1, sense: 1, attack: 1 },
	hard: { speed: 1.12, sense: 1.2, attack: 1.2 },
};
const CAP = { low: 30, medium: 50, high: 72, ultra: 90 };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sphere = new THREE.Sphere();
const _eye = new THREE.Vector3(), _near = [];

export function install( game ) {
	const mgr = new Creatures( game );
	game.creatures = mgr;
	game.zombies = mgr.zombieApi;
	game.animals = mgr.animals;
	game.register( mgr );
	mgr.registerSpawnables();
	return mgr;
}

export class Creatures {
	constructor( game ) {
		this.game = game;
		this.lib = new CharacterLib( game );
		this.pop = new Population( game );
		this.ALOHA = ALOHA;
		this.zombies = [];
		this.npcs = []; // live bandits (the infected hunt them too)
		this.time = 0;
		this.dt = 0.016;
		this.frame = 0;
		this.night = 0;
		this.sightRange = 50;
		this.diff = DIFF[ game.difficulty ] || DIFF.normal;
		this.cap = CAP[ game.settings.get( 'quality' ) ] || 72;
		this.spawnT = 0;
		this.first = true;
		this.lastPlayer = new THREE.Vector3( 1e9, 0, 1e9 );
		this.target = 0; // wanted population around the player
		this.hordeT = 240 + rnd() * 300;
		this.pull = null; // { pos, t, n }: extra infected drawn in by a gunshot
		this.trail = [];
		for ( let i = 0; i < TRAIL; i ++ ) this.trail.push( new THREE.Vector3() );
		this.trailN = 0; // points written so far
		this.camPos = new THREE.Vector3();
		this.camFwd = new THREE.Vector3();
		// what the infected know about the player this frame
		this.pi = { alive: true, entity: game.player, pos: game.player.pos, chest: new THREE.Vector3(), visibility: 1, vehicle: null };
		this.animals = new Animals( game, this );
		this.bandits = new Bandits( game, this );
		this.zombieApi = {
			list: () => this.zombies.filter( z => z.alive ),
			count: () => this.zombies.length,
			spawn: ( kind, pos, o ) => this.spawnZombie( kind, pos, o ),
			horde: ( pos, n ) => this.spawnHorde( pos, n ),
		};
		this.offNoise = game.events.on( 'noise', e => this.onNoise( e ) );
		this.offProvider = game.interact.addProvider( ( ray ) => this.provide( ray ) );
		// warm the character cache with everyday people
		this.lib.ready.then( () => { for ( const id of [ 'm_casual2', 'f_casual2', 'm_tourist1', 'm_casual1' ] ) this.lib.load( id ); } );
	}

	// ---- per frame -------------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game;
		this.dt = dt;
		this.time += dt;
		this.frame ++;
		const sky = g.world.sky;
		this.night = clamp( sky.night ?? 0, 0, 1 );
		const rain = g.weather?.rain || 0;
		this.sightRange = 52 * ( 1 - 0.68 * this.night ) * ( 1 - 0.3 * rain ) * this.diff.sense;
		this._playerInfo();
		this._camera();
		this._trail();
		// the infected
		let alive = 0;
		for ( let i = this.zombies.length - 1; i >= 0; i -- ) {
			const z = this.zombies[ i ];
			if ( z.removed ) { this.zombies.splice( i, 1 ); continue; }
			this._lod( z );
			if ( z.alive ) alive ++;
		}
		this.alive = alive;
		this.npcs.length = 0;
		for ( const b of this.bandits.list ) if ( b.alive && ! b.removed ) this.npcs.push( b );
		this._vehicleHits();
		this.spawnT -= dt;
		if ( this.spawnT <= 0 ) { this.spawnT = this.first ? 0.15 : 0.5; this._populate(); }
		this.animals.update( dt );
		this.bandits.update( dt );
		// keep only a handful of avatars on the GPU
		if ( this.frame % 300 === 0 ) this.lib.trim( TEMPLATE_BUDGET );
	}

	_playerInfo() {
		const g = this.game, p = g.player, pi = this.pi;
		pi.alive = ! g.dead && p.alive !== false;
		pi.pos = p.pos;
		pi.vehicle = p.vehicle ? ( g.vehicles?.driving || p.vehicle.vehicle || null ) : null;
		const h = p.vehicle ? 1.2 : ( p.height || 1.8 );
		pi.chest.set( p.pos.x, p.pos.y + h * 0.7, p.pos.z );
		// how visible: stance, movement, light, being in a car
		const stance = p.stance === 'prone' ? 0.28 : p.stance === 'crouch' ? 0.55 : 1;
		const sp = p.speedNow || 0;
		const moving = p.sprinting ? 1.3 : sp > 1 ? 1 : 0.7;
		const light = this.night > 0.3 && g.hands?.spot?.intensity > 0 ? 1 + this.night * 1.4 : 1;
		pi.visibility = pi.vehicle ? 1.5 : stance * moving * light;
		if ( p.swimming ) pi.visibility *= 0.8;
	}

	_camera() {
		const cam = this.game.camera;
		this.camPos.copy( cam.position );
		cam.getWorldDirection( this.camFwd );
		_pm.multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse );
		_frustum.setFromProjectionMatrix( _pm );
	}

	// the path the player walked: the infected follow it through doors and around corners
	_trail() {
		const p = this.game.player.pos;
		const last = this.trailN ? this.trail[ ( this.trailN - 1 ) % TRAIL ] : null;
		if ( ! last || last.distanceToSquared( p ) > 1.2 * 1.2 ) {
			if ( last && last.distanceToSquared( p ) > 40 * 40 ) this.trailN = 0; // teleported
			this.trail[ this.trailN % TRAIL ].copy( p );
			this.trailN ++;
		}
	}

	// the newest trail point the zombie can walk to in a straight line
	trailPoint( z ) {
		const n = this.trailN;
		if ( ! n ) return null;
		const oldest = Math.max( 0, n - TRAIL );
		_eye.set( z.pos.x, z.pos.y + 0.9, z.pos.z );
		const P = this.game.physics;
		let i = z.trailI;
		if ( i >= oldest && i < n ) {
			const tp = this.trail[ i % TRAIL ];
			// reached: look further along
			if ( Math.hypot( tp.x - z.pos.x, tp.z - z.pos.z ) < 1.3 ) {
				let best = - 1;
				for ( let k = Math.min( n - 1, i + 6 ); k > i; k -- ) {
					const q = this.trail[ k % TRAIL ];
					_v.set( q.x, q.y + 0.9, q.z );
					if ( P.lineOfSight( _eye, _v ) ) { best = k; break; }
				}
				z.trailI = best >= 0 ? best : Math.min( n - 1, i + 1 );
			}
			return this.trail[ z.trailI % TRAIL ];
		}
		// find the newest visible point walking back from the player's position
		let checks = 0;
		for ( let k = n - 1; k >= oldest && checks < 10; k -= 2, checks ++ ) {
			const q = this.trail[ k % TRAIL ];
			_v.set( q.x, q.y + 0.9, q.z );
			if ( P.lineOfSight( _eye, _v ) ) { z.trailI = k; return q; }
		}
		return null;
	}

	// draw distance, mesh LOD, shadows and how often to re-pose
	_lod( z ) {
		const inst = z.inst;
		if ( ! inst ) return;
		const d = this.camPos.distanceTo( z.pos );
		z.distCam = d;
		_sphere.center.set( z.pos.x, z.pos.y + 1, z.pos.z );
		_sphere.radius = z.alive ? 1.3 : 2;
		const vis = _frustum.intersectsSphere( _sphere );
		z.inView = vis;
		const q = this.game.settings.get( 'quality' );
		const near = q === 'low' ? 12 : q === 'medium' ? 18 : 26;
		const draw = q === 'low' ? 110 : 170;
		inst.setLOD( d < near ? 0 : d < draw ? 1 : 2, d < ( q === 'low' ? 25 : 55 ) );
		z.animEvery = ! vis ? 12 : d < 30 ? 1 : d < 60 ? 2 : d < 100 ? 3 : d < 150 ? 5 : 8;
	}

	animNow( z ) {
		return ( ( this.frame + z.anim.slot ) % ( z.animEvery || 1 ) ) === 0;
	}

	// ---- population --------------------------------------------------------------------------------------------

	// how dangerous a place is now (0..1)
	population( pos ) {
		const pop = this.pop;
		return clamp( pop.density( pos.x, pos.z ) * pop.killFactor( pos.x, pos.z, this.game.time.hours ) * ( 1 + this.night * 0.3 ), 0, 1 );
	}

	_populate() {
		const g = this.game, p = g.player.pos, pop = this.pop;
		// a big jump (teleport, respawn): start over around the new spot
		if ( this.lastPlayer.distanceToSquared( p ) > 350 * 350 ) {
			if ( ! this.first ) for ( const z of this.zombies ) if ( z.alive ) g.entities.remove( z );
			this.first = true;
			this.fillN = 0;
		}
		this.lastPlayer.copy( p );
		// despawn the far ones (the population keeps them; only kills count)
		for ( const z of this.zombies ) {
			if ( z.removed ) continue;
			const d = z.pos.distanceTo( p );
			if ( z.alive ? d > 230 && ! ( z.inView && d < 300 ) : ( z.corpseT > CORPSE_LIFE || ( d > 200 && z.corpseT > 30 ) ) ) g.entities.remove( z );
		}
		// how many should be around: local density, kills, night
		const hour = g.time.hours;
		let dsum = 0, n = 0;
		for ( let k = 0; k < 9; k ++ ) {
			const a = k / 8 * Math.PI * 2, r = k === 8 ? 0 : 90;
			dsum += pop.density( p.x + Math.cos( a ) * r, p.z + Math.sin( a ) * r ) * pop.killFactor( p.x + Math.cos( a ) * r, p.z + Math.sin( a ) * r, hour );
			n ++;
		}
		const dens = dsum / n;
		let target = Math.round( this.cap * clamp( dens * 1.25, 0, 1 ) * ( 1 + this.night * 0.25 ) );
		if ( this.pull ) { this.pull.t -= 0.5; target += this.pull.n; if ( this.pull.t <= 0 ) this.pull = null; }
		target = Math.min( target, this.cap + 10 );
		this.target = target;
		if ( g.player.flying && g.mode === 'creative' && ( g.player.vel?.length?.() || 0 ) > 20 ) return;
		// spawn a few per tick until the count is reached
		let alive = 0;
		for ( const z of this.zombies ) if ( z.alive ) alive ++;
		let budget = this.first ? 6 : 2;
		while ( alive < target && budget -- > 0 ) {
			if ( this._spawnOne() ) alive ++;
		}
		if ( this.first && ( alive >= target || ++ this.fillN > 60 ) ) this.first = false;
		// highway hordes now and then
		this.hordeT -= 0.5;
		if ( this.hordeT <= 0 ) {
			this.hordeT = 300 + rnd() * 420;
			if ( dens < 0.35 && ! g.player.vehicle ) {
				const r = pop.roadNear( p, 120, 190 );
				if ( r ) this.spawnHorde( _v.set( r.x, 0, r.z ), 8 + Math.floor( rnd() * 8 ), { dir: [ r.dx, r.dz ] } );
			}
		}
	}

	// one infected at a random unseen spot in the ring around the player, weighted by density
	_spawnOne() {
		const g = this.game, p = g.player.pos, pop = this.pop;
		const rMin = this.first ? 32 : 58, rMax = this.first ? 150 : 150;
		for ( let tries = 0; tries < 10; tries ++ ) {
			let a = rnd() * Math.PI * 2;
			const pull = this.pull;
			if ( pull && rnd() < 0.7 ) a = Math.atan2( pull.pos.z - p.z, pull.pos.x - p.x ) + ( rnd() - 0.5 ) * 1.2;
			const r = rMin + Math.sqrt( rnd() ) * ( rMax - rMin );
			const x = p.x + Math.cos( a ) * r, z = p.z + Math.sin( a ) * r;
			const d = pop.density( x, z ) * pop.killFactor( x, z, g.time.hours );
			if ( rnd() > d * 1.6 + 0.02 ) continue;
			const pos = this._groundSpot( x, z, p.y );
			if ( ! pos ) continue;
			if ( this._inView( pos ) ) continue;
			// feeding over a body, lying dormant, or just standing about
			const kind = pop.pickKind( x, z, this.night );
			const roll = rnd();
			const o = { yaw: rnd() * Math.PI * 2 };
			if ( kind !== 'crawler' && roll < 0.07 && d > 0.2 ) { this._spawnFeeding( pos, kind ); return true; }
			if ( kind !== 'crawler' && roll < 0.13 ) o.state = 'dormant';
			const z0 = this.spawnZombie( kind, pos, o );
			if ( z0 && pull && rnd() < 0.8 ) z0.alertTo( pull.pos, null, true );
			return !! z0;
		}
		return false;
	}

	_groundSpot( x, z, y0 ) {
		const g = this.game, hf = g.hf;
		const h = hf.heightAt( x, z );
		if ( h < 0.25 ) return null;
		if ( hf.normalAt( x, z, _v2, 1 ).y < 0.8 ) return null;
		const gr = g.physics.ground( x, z, Math.max( h, y0 ) + 30, 0.45, 0.3 );
		// not on a roof: a floor within a storey of the terrain
		const y = gr.y - h > 4 ? h : gr.y;
		const pos = new THREE.Vector3( x, y, z );
		_v.copy( pos );
		g.physics.resolveCylinder( _v, 0.3, 1.7, 0.45 );
		if ( _v.distanceToSquared( pos ) > 0.01 ) return null;
		return pos;
	}

	// could the player see this spot right now?
	_inView( pos ) {
		_v.subVectors( pos, this.camPos );
		const d = _v.length();
		if ( d < 20 ) return true;
		_v.divideScalar( d );
		if ( _v.dot( this.camFwd ) < 0.45 ) return false;
		_v3.set( pos.x, pos.y + 1.5, pos.z );
		return this.game.physics.lineOfSight( this.camPos, _v3 );
	}

	// avatars for a kind: loaded ones first; start loading more variety while under budget
	_avatarFor( kind ) {
		const role = ZTYPES[ kind ]?.role || 'civilian';
		let ids = avatarsFor( role );
		if ( ! ids.length ) ids = avatarsFor( 'civilian' );
		const loaded = ids.filter( id => this.lib.isLoaded( id ) );
		const want = ids.filter( id => ! this.lib.isLoaded( id ) && ! this.lib.failed.has( id ) );
		if ( want.length && ( ! loaded.length || rnd() < 0.15 ) && this.lib.loadedIds().length + this.lib.loading < TEMPLATE_BUDGET + 2 ) this.lib.load( want[ Math.floor( rnd() * want.length ) ] );
		if ( loaded.length ) return loaded[ Math.floor( rnd() * loaded.length ) ];
		return null;
	}

	// o: { yaw, state, summoned, victim }. Returns the zombie, or null (its avatar is still loading; summoned ones
	// appear when it arrives)
	spawnZombie( kind = 'civilian', pos, o = {} ) {
		if ( ! ZTYPES[ kind ] ) kind = 'civilian';
		let id = this._avatarFor( kind );
		if ( ! id && kind !== 'civilian' && ! o.summoned ) { id = this._avatarFor( 'civilian' ); kind = kind === 'crawler' || kind === 'runner' || kind === 'brute' ? kind : 'civilian'; }
		if ( ! id ) {
			if ( o.summoned || o.wait ) {
				const role = ZTYPES[ kind ].role;
				const ids = avatarsFor( role ).length ? avatarsFor( role ) : avatarsFor( 'civilian' );
				return this.lib.load( ids[ Math.floor( rnd() * ids.length ) ] ).then( t => t ? this._make( t, kind, pos, o ) : null );
			}
			return null;
		}
		return this._make( this.lib.get( id ), kind, pos, o );
	}

	_make( t, kind, pos, o ) {
		if ( ! t ) return null;
		const z = new Zombie( this.game, this, t, kind, pos, o );
		this.game.entities.add( z );
		this.zombies.push( z );
		z.distCam = this.camPos.distanceTo( pos );
		this._lod( z );
		if ( o.victim ) this._killQuiet( z );
		return z;
	}

	// a fresh body on the ground (not infected yet): the prey of a feeding one
	_killQuiet( z ) {
		z.inst.setLook( { infect: 0.25, rot: 0.1, dirt: 0.4, blood: 0.9, seed: rnd() * 100, mouthBlood: 0, handBlood: 0.4,
			aloha: z.look.alohaI >= 0 ? ALOHA[ z.look.alohaI ] : null, skin: new THREE.Color( 0.75, 0.68, 0.6 ) } );
		z.victim = true;
		z.health = 0; z.alive = false;
		z.body.update( 0.02 );
		z.inst.updateWorld();
		z.state = 'dead'; z.noHit = true;
		z.body.ragdoll( this.game.physics, _v.set( 0, 0, 0 ), { point: _v2.set( z.pos.x, z.pos.y + 1.2, z.pos.z ), dir: _v3.set( rnd() - 0.5, 0, rnd() - 0.5 ).normalize(), strength: 1.5 } );
		z.type = 'corpse';
	}

	_spawnFeeding( pos, kind ) {
		const victim = this.spawnZombie( rnd() < 0.5 ? 'civilian' : 'tourist', pos, { victim: true } );
		if ( ! victim || victim.then ) return;
		const a = rnd() * Math.PI * 2;
		const fp = new THREE.Vector3( pos.x + Math.cos( a ) * 0.9, pos.y, pos.z + Math.sin( a ) * 0.9 );
		const y = Math.atan2( - ( pos.x - fp.x ), - ( pos.z - fp.z ) );
		this.spawnZombie( kind === 'crawler' ? 'civilian' : kind, fp, { yaw: y, state: 'feed' } );
	}

	// a pack shambling along: n infected around pos heading the same way
	spawnHorde( pos, n = 15, o = {} ) {
		const g = this.game;
		const dir = o.dir || null;
		const goal = dir ? new THREE.Vector3( pos.x + dir[ 0 ] * 250, 0, pos.z + dir[ 1 ] * 250 ) : g.player.pos.clone();
		const out = [];
		for ( let i = 0; i < n; i ++ ) {
			const a = rnd() * Math.PI * 2, r = Math.sqrt( rnd() ) * ( 3 + n * 0.35 );
			const x = pos.x + Math.cos( a ) * r, z = pos.z + Math.sin( a ) * r;
			const p = this._groundSpot( x, z, pos.y ) || new THREE.Vector3( x, g.physics.ground( x, z, 1e4 ).y, z );
			const kind = rnd() < 0.1 ? 'runner' : rnd() < 0.08 ? 'brute' : rnd() < 0.3 ? 'tourist' : 'civilian';
			const zz = this.spawnZombie( kind, p, { yaw: Math.atan2( - ( goal.x - x ), - ( goal.z - z ) ), summoned: o.summoned, wait: true } );
			const go = ( z0 ) => {
				if ( ! z0 ) return;
				z0.goal.set( goal.x + ( rnd() - 0.5 ) * 12, 0, goal.z + ( rnd() - 0.5 ) * 12 );
				z0.state = 'wander'; z0.stateT = 0;
				z0.wanderV *= 1.3;
			};
			if ( zz?.then ) zz.then( go ); else go( zz );
			out.push( zz );
		}
		return out;
	}

	onDeath( z ) {
		if ( z.victim ) return;
		this.pop.addKill( z.pos.x, z.pos.z, this.game.time.hours );
	}

	// ---- sound and alerts -------------------------------------------------------------------------------------------

	// a positional sound from an infected (its voice pitch)
	audio( z, name, vol = 1, max = 45, ref = 3 ) {
		if ( z.distCam > max ) return;
		this.game.audio?.play( name, { pos: _v.set( z.pos.x, z.pos.y + 1.6, z.pos.z ), vol, max, ref, rate: z.pitch || 1, detune: 0.1 } );
	}

	// a scream: the infected within r come for the target
	alert( pos, r, target, from ) {
		for ( const z of this.zombies ) {
			if ( z === from || ! z.alive ) continue;
			if ( z.pos.distanceToSquared( pos ) > r * r ) continue;
			z.alertTo( target === this.pi.entity ? this.pi.pos : target.pos, target, true );
		}
	}

	onNoise( e ) {
		if ( ! e?.pos ) return;
		const g = this.game;
		const indoors = g.world.isIndoors?.( e.pos );
		const hear = this.diff.sense * ( 1 + this.night * 0.3 );
		const R = ( e.radius || 10 ) * hear;
		const gun = e.kind === 'gunshot' || e.kind === 'explosion';
		for ( const z of this.zombies ) {
			if ( ! z.alive || z === e.source ) continue;
			const d = z.pos.distanceTo( e.pos );
			let r = R;
			if ( indoors && ! g.world.isIndoors?.( z.pos ) ) r *= 0.5;
			if ( d > r ) continue;
			// footsteps give away where you are; shots bring them running
			const src = e.source === g.player ? this.pi.entity : null;
			if ( src && e.kind === 'step' && d < r * 0.6 ) z.alertTo( e.pos, src, false );
			else z.alertTo( e.pos, null, gun && d < r * 0.6 );
		}
		// the ones beyond the active area come too
		if ( gun && e.radius > 120 && ! this.first ) {
			const n = Math.min( 14, Math.round( e.radius / 45 * this.population( e.pos ) * 2 + 2 ) );
			if ( ! this.pull || this.pull.n < n ) this.pull = { pos: e.pos.clone(), t: 90, n };
			else this.pull.t = 90;
		}
		this.animals.onNoise( e );
		this.bandits.onNoise( e );
	}

	// ---- vehicles ---------------------------------------------------------------------------------------------------

	// the car the player drives knocks the infected (and animals, survivors) down or over
	_vehicleHits() {
		const g = this.game, v = this.pi.vehicle;
		if ( ! v || ! v.pos ) return;
		const vel = v.vel || _v3.set( 0, 0, 0 );
		const speed = Math.hypot( vel.x, vel.z );
		if ( speed < 3 ) return;
		const R = ( v.radius && v.radius > 0.8 ? v.radius : 2.2 ) + 0.4;
		for ( const e of g.entities.near( v.pos, R + 1, null, _near ) ) {
			if ( ! e.alive || ( e.type !== 'zombie' && e.type !== 'animal' && e.type !== 'npc' ) ) continue;
			if ( this.time - ( e.vehicleHitT ?? - 10 ) < 1 ) continue;
			const dx = e.pos.x - v.pos.x, dz = e.pos.z - v.pos.z;
			if ( dx * vel.x + dz * vel.z < 0 || Math.hypot( dx, dz ) > R ) continue;
			e.vehicleHitT = this.time;
			const dir = new THREE.Vector3( vel.x, 0.2, vel.z ).normalize();
			const dmg = speed * speed * 1.25;
			const point = new THREE.Vector3( e.pos.x, e.pos.y + 1, e.pos.z );
			e.damage( dmg, { source: g.player, kind: 'vehicle', dir, zone: 'torso', weapon: 'vehicle', point } );
			if ( ! e.alive ) g.events.emit( 'kill', { target: e, source: g.player, weapon: 'vehicle' } );
			else e.knockback?.( dir, speed * 0.7 );
			v.damage?.( Math.min( 25, speed * ( e.type === 'animal' && e.size > 1 ? 2 : 0.6 ) ), { source: e, kind: 'impact', dir } );
			g.audio?.play( 'hit_flesh', { pos: point, vol: 1, max: 60 } );
			if ( speed > 12 ) g.audio?.play( 'crash', { pos: point, vol: 0.5, max: 60 } );
			g.fx?.blood?.( point, dir, 1.5 );
		}
	}

	// ---- bodies: search the infected and survivors, butcher animals ----------------------------------------------

	provide( ray ) {
		const g = this.game, out = [];
		const o = ray.origin, d = ray.dir;
		for ( const e of g.entities.near( o, 4, 'corpse', _near ) ) {
			if ( e.removed || ! e.centre ) continue;
			e.centre( _v );
			const t = rayPoint( o, d, _v, e.butcherable || e.species ? Math.max( 0.35, ( e.size || 1 ) * 0.5 ) : 0.55 );
			if ( t === null ) continue;
			if ( e.butcherable ) out.push( e.butcherPrompt( t ) );
			else out.push( { id: 'zc' + e.id, t, label: 'Search body', owner: e, noOcclusion: true, action: () => this.search( e ) } );
		}
		return out;
	}

	search( z ) {
		const g = this.game;
		if ( ! z.items ) z.items = z.lootItems ? z.lootItems() : this.corpseLoot( z );
		const at = z.centre( new THREE.Vector3() );
		g.actions.start( {
			label: 'Searching', time: 1.4, sound: 'zipper',
			onDone: () => g.app.ui?.openContainer?.( { key: 'zc' + z.id, label: z.victim ? 'Body' : ( z.label || 'Body' ), capacity: 40, items: z.items, kind: 'body', pos: at } ),
		} );
	}

	// what an infected body carries: its pockets (loot table) and some of what it wore
	corpseLoot( z ) {
		const out = [];
		try { out.push( ...rollLoot( z.T?.loot || 'zombie_civilian' ) ); } catch ( e ) { console.warn( 'loot', e ); }
		const worn = WORN[ z.avatar ] || [];
		for ( const id of worn ) {
			if ( ! getItem( id ) || rnd() > 0.3 ) continue;
			const st = makeStack( id, 1, { cond: 0.12 + rnd() * 0.5 } );
			if ( st ) out.push( st );
		}
		if ( z.look?.alohaI >= 0 && rnd() < 0.4 ) {
			const st = makeStack( ALOHA_ITEM[ z.look.alohaI ] || 'aloha_shirt', 1, { cond: 0.15 + rnd() * 0.4 } );
			if ( st ) out.push( st );
		}
		if ( z.kind === 'firefighter' && rnd() < 0.15 && getItem( 'fire_axe' ) ) out.push( makeStack( 'fire_axe', 1, { cond: 0.3 + rnd() * 0.5 } ) );
		return out.filter( Boolean );
	}

	// ---- /summon ------------------------------------------------------------------------------------------------------

	registerSpawnables() {
		const g = this.game;
		const S = g.spawnables = g.spawnables || {};
		const z = ( kind, desc ) => ( { desc, spawn: ( pos, o = {} ) => this.spawnZombie( kind, pos, { ...o, summoned: true } ) } );
		S.zombie = { desc: 'An infected (local kind)', spawn: ( pos, o = {} ) => this.spawnZombie( this.pop.pickKind( pos.x, pos.z, this.night, () => rnd() * 0.85 ), pos, { ...o, summoned: true } ) };
		S.zombie_civilian = z( 'civilian', 'Infected civilian' );
		S.zombie_tourist = z( 'tourist', 'Infected tourist' );
		S.zombie_runner = z( 'runner', 'Fast infected' );
		S.zombie_police = z( 'police', 'Infected police officer' );
		S.zombie_military = z( 'military', 'Infected soldier' );
		S.zombie_medic = z( 'medic', 'Infected paramedic' );
		S.zombie_firefighter = z( 'firefighter', 'Infected firefighter' );
		S.zombie_crawler = z( 'crawler', 'Crawling infected' );
		S.zombie_brute = z( 'brute', 'Large, tough infected' );
		S.zombie_horde = { desc: 'A horde of 15', distance: 20, spawn: ( pos ) => this.spawnHorde( pos, 15, { summoned: true } ) };
		this.animals.registerSpawnables( S );
		this.bandits.registerSpawnables( S );
	}

	// ---- saves, debug, teardown ---------------------------------------------------------------------------------------

	serialize( save ) {
		save.world = save.world || {};
		save.world.killed = this.pop.serialize();
		this.animals.serialize?.( save );
	}

	load( save ) {
		this.pop.load( save.world?.killed );
		this.animals.load?.( save );
	}

	stats() {
		let corpses = 0;
		for ( const z of this.zombies ) if ( ! z.alive ) corpses ++;
		const p = this.game.player.pos;
		return {
			infected: this.alive || 0, target: this.target, corpses, animals: this.animals.count(), bandits: this.npcs.length,
			avatars: this.lib.loadedIds().length, zone: this.pop.zone( p.x, p.z ), danger: this.population( p ).toFixed( 2 ),
		};
	}

	dispose() {
		this.offNoise?.();
		this.offProvider?.();
		for ( const z of this.zombies ) z.dispose();
		this.zombies.length = 0;
		this.animals.dispose();
		this.bandits.dispose();
		for ( const id of this.lib.loadedIds() ) {
			for ( const inst of this.lib.live.get( id ) || [] ) inst.dispose();
			this.lib.live.delete( id );
			this.lib.unload( id );
		}
	}
}

// distance along the ray to the closest approach of a sphere, or null
export function rayPoint( o, d, c, r ) {
	const t = ( c.x - o.x ) * d.x + ( c.y - o.y ) * d.y + ( c.z - o.z ) * d.z;
	if ( t < 0 ) return null;
	const px = o.x + d.x * t - c.x, py = o.y + d.y * t - c.y, pz = o.z + d.z * t - c.z;
	return px * px + py * py + pz * pz <= r * r ? t : null;
}

export { AVATARS };
