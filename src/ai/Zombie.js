// The infected: a Rocketbox avatar under the infected shader, driven by HumanBody, with DayZ / Project
// Zomboid behaviour — idle, wander, investigate noises, chase with a scream that brings others, telegraphed
// swipes and bites, bash doors and cars, feed on the dead, lie dormant, stagger, get knocked down, crawl on
// ruined legs, die into a ragdoll and stay as a searchable body for a while.
import * as THREE from 'three';
import { Entity, rayCylinder, raySphere } from '../game/Entities.js';
import { HumanBody } from './Body.js';
import { Mover, steer, move, stuckCheck } from './Steer.js';

// what each kind of infected is: health, loot table, which avatars can wear it, armour, speed class
export const ZTYPES = {
	civilian: { hp: 100, role: 'civilian', loot: 'zombie_civilian', label: 'Body' },
	tourist: { hp: 100, role: 'tourist', loot: 'zombie_tourist', label: 'Tourist', aloha: 0.8 },
	worker: { hp: 110, role: 'worker', loot: 'zombie_civilian', label: 'Body' },
	pilot: { hp: 100, role: 'pilot', loot: 'zombie_civilian', label: 'Pilot', uniform: true },
	police: { hp: 120, role: 'police', loot: 'zombie_police', label: 'Police officer', armor: 0.3, uniform: true },
	military: { hp: 150, role: 'military', loot: 'zombie_military', label: 'Soldier', armor: 0.45, helmet: 0.5, uniform: true },
	medic: { hp: 100, role: 'medic', loot: 'zombie_medic', label: 'Paramedic', uniform: true },
	firefighter: { hp: 130, role: 'firefighter', loot: 'zombie_civilian', label: 'Firefighter', armor: 0.15, uniform: true },
	runner: { hp: 80, role: 'runner', loot: 'zombie_civilian', label: 'Body', runner: true },
	crawler: { hp: 60, role: 'civilian', loot: 'zombie_civilian', label: 'Body', crawler: true },
	brute: { hp: 380, role: 'brute', loot: 'zombie_civilian', label: 'Body', brute: true },
};

// clothes the corpse can give up, by avatar (only ids the item database knows are used)
export const WORN = {
	m_casual1: [ 'polo_shirt', 'cargo_shorts', 'sneakers' ], m_casual2: [ 'tshirt_black', 'jeans', 'sneakers' ], m_casual3: [ 'tshirt_black', 'jeans', 'sneakers' ],
	m_casual4: [ 'denim_jacket', 'jeans', 'sneakers' ], m_tourist1: [ 'tshirt', 'jeans', 'sneakers' ], m_office: [ 'khaki_pants', 'dress_shoes' ],
	m_worker: [ 'flannel_shirt', 'jeans', 'work_boots', 'hard_hat', 'work_gloves', 'tool_belt' ], m_overalls: [ 'mechanic_coveralls', 'hard_hat', 'work_boots' ],
	m_flannel: [ 'flannel_shirt', 'jeans', 'work_boots' ], m_swim: [ 'board_shorts', 'slippers' ], m_sport: [ 'tank_top', 'board_shorts', 'running_shoes' ],
	m_pilot: [ 'khaki_pants', 'dress_shoes', 'aviators' ], f_casual1: [ 'hoodie', 'denim_shorts', 'sneakers' ], f_casual2: [ 'tshirt', 'jeans', 'sneakers' ],
	f_casual3: [ 'tshirt', 'jeans', 'sneakers' ], f_party: [ 'tank_top', 'denim_shorts' ], f_sport: [ 'tank_top', 'running_shoes' ],
	m_police1: [ 'police_vest', 'jeans', 'police_boots' ], m_police2: [ 'police_shirt', 'police_pants', 'police_boots', 'police_cap', 'holster_belt' ],
	m_security: [ 'security_shirt', 'police_pants', 'police_boots' ],
	m_army1: [ 'military_combat_shirt', 'camo_pants', 'combat_boots', 'military_helmet', 'chest_rig', 'tactical_gloves' ],
	m_army2: [ 'military_combat_shirt', 'camo_pants', 'combat_boots', 'military_helmet', 'plate_carrier' ],
	f_army: [ 'military_combat_shirt', 'camo_pants', 'combat_boots', 'military_helmet' ],
	m_medic: [ 'hivis_vest', 'latex_gloves', 'sneakers' ], f_nurse: [ 'scrubs_top', 'scrubs_pants', 'latex_gloves' ], m_surgeon: [ 'scrubs_top', 'scrubs_pants', 'surgical_mask' ],
	m_fire: [ 'firefighter_jacket', 'firefighter_pants', 'firefighter_boots', 'firefighter_helmet', 'firefighter_gloves' ],
};
// avatars that wear what the armour numbers stand for (a vest, a plate carrier, turnout gear)
const ARMOURED = new Set( [ 'm_police1', 'm_army1', 'm_army2', 'f_army', 'm_fire' ] );
// aloha print palette index -> the shirt item it is
export const ALOHA_ITEM = [ 'aloha_shirt', 'aloha_shirt_blue', 'aloha_shirt_black', 'aloha_shirt_yellow', 'aloha_shirt_turtle', 'aloha_shirt_green', 'aloha_shirt', 'aloha_shirt_green' ];

// a random infected look (plain numbers, so a corpse or a save can keep it): skin family, rot, grime, blood,
// clothes hue, torn clothes, the bite that turned them, milky or bloodshot eyes, an aloha print on tourists' shirts
const SKINS = [ [ 0.6, 0.65, 0.54 ], [ 0.68, 0.66, 0.5 ], [ 0.6, 0.62, 0.62 ], [ 0.66, 0.6, 0.6 ], [ 0.56, 0.62, 0.5 ], [ 0.62, 0.62, 0.56 ] ];
export function rollLook( T = ZTYPES.civilian, kind = 'civilian', r = Math.random ) {
	const sk = SKINS[ Math.floor( r() * SKINS.length ) ];
	const tint = 0.78 + r() * 0.2;
	return {
		infect: 1, rot: 0.45 + r() * 0.55, hue: ( r() - 0.5 ) * ( T.uniform ? 0.03 : 0.2 ), dirt: 0.4 + r() * 0.55, blood: 0.3 + r() * 0.65, seed: r() * 100,
		skin: sk.map( v => v * ( 0.88 + r() * 0.2 ) ), tint: [ tint * ( 0.95 + r() * 0.1 ), tint * ( 0.95 + r() * 0.1 ), tint * ( 0.92 + r() * 0.1 ) ],
		alohaI: ( T.aloha && r() < T.aloha ) || ( kind === 'civilian' && r() < 0.2 ) ? Math.floor( r() * 8 ) : - 1,
		// uniforms keep their colours (a pink camo or a green police shirt would read wrong)
		mouthBlood: r() < 0.85 ? 0.7 + r() * 0.5 : 0.15, handBlood: 0.35 + r() * 0.65, tear: T.military || T.armor ? r() * 0.4 : 0.2 + r() * 0.8,
		bite: r() < 0.8 ? Math.floor( r() * 16 ) : - 1, eyeRed: r() < 0.22 ? 1 : 0,
	};
}
// the look as CharacterInstance.setLook() takes it
export function lookParams( look, ALOHA ) {
	return { ...look, skin: _c1.setRGB( ...look.skin ), tint: _c2.setRGB( ...look.tint ), aloha: look.alohaI >= 0 ? ALOHA[ look.alohaI ] : null };
}

const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );
const rnd = Math.random;
const pick = ( a ) => a[ Math.floor( rnd() * a.length ) ];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _push = new THREE.Vector3();
const _eye = new THREE.Vector3(), _tgt = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _nb = [];

export class Zombie extends Entity {
	// mgr: Creatures manager; t: character template; kind: ZTYPES key; o: { yaw, state: 'idle'|'wander'|'dormant'|'feed', look, style }
	constructor( game, mgr, t, kind, pos, o = {} ) {
		super( game, 'zombie' );
		this.mgr = mgr;
		this.kind = kind;
		const T = this.T = ZTYPES[ kind ] || ZTYPES.civilian;
		this.avatar = t.id;
		this.pos.copy( pos );
		this.yaw = o.yaw ?? rnd() * Math.PI * 2;
		this.radius = 0.32;
		this.maxHealth = this.health = T.hp * ( 0.85 + rnd() * 0.3 );
		const inst = this.inst = mgr.lib.acquire( t );
		inst.scale = T.brute ? 1.1 + rnd() * 0.07 : 0.93 + rnd() * 0.12;
		this.standH = this.height = t.height * inst.scale;
		this.female = t.sex === 'f';
		this.look = o.look || rollLook( T, kind );
		inst.setLook( lookParams( this.look, mgr.ALOHA ) );
		this.object = inst.root;
		// gait and carriage
		const runner = !! T.runner, brute = !! T.brute;
		this.body = new HumanBody( inst, o.style || {
			idle: pick( [ 'idle_drunk', 'idle_drunk2', 'roll_head', 'idle_drunk' ] ),
			walk: brute ? 'walk_bruised' : pick( [ 'walk_drunk', 'walk_bruised', 'walk_injured', 'walk_drunk' ] ),
			run: runner ? pick( [ 'run_fast', 'run' ] ) : brute ? 'run_slow' : pick( [ 'run_injured', 'run_slow', 'run_injured' ] ),
			hunch: brute ? 0.35 : 0.15 + rnd() * 0.3, tilt: rnd() * 0.25, twitch: 0.4 + rnd() * 0.8,
			arms: rnd() < 0.25 ? 'reach' : 'hang',
		} );
		this.body.yaw = this.yaw;
		this.mover = new Mover( 0.3, 1.7 );
		// speeds (m/s): shuffling about, chasing
		const dm = mgr.diff.speed;
		this.wanderV = ( 0.45 + rnd() * 0.35 ) * dm;
		this.chaseV = ( runner ? 4.6 + rnd() * 1.0 : brute ? 2.3 + rnd() * 0.4 : rnd() < 0.3 ? 3.2 + rnd() * 0.7 : 2.1 + rnd() * 0.8 ) * dm;
		this.turnRate = runner ? 5 : brute ? 2.2 : 3.2;
		this.pitch = ( this.female ? 1.2 : 0.9 ) + ( rnd() - 0.5 ) * 0.2;
		// AI
		this.state = 'idle';
		this.stateT = 0;
		this.goal = new THREE.Vector3().copy( pos );
		this.wantV = 0;
		this.speed = 0;
		this.target = null; // entity being hunted (the player, a survivor, a vehicle)
		this.lastSeen = new THREE.Vector3();
		this.lastSeenT = - 1e9;
		this.aware = 0;
		this.trailI = - 1;
		this.thinkT = rnd() * 0.3;
		this.thinkDt = 0;
		this.stuckT = rnd();
		this.groanT = 2 + rnd() * 10;
		this.stepD = 0;
		this.attackCd = 0;
		this.struck = false;
		this.legDmg = 0;
		this.hitAcc = 0; // damage this instant (shotgun pellets add up)
		this.down = null; // knockdown timer
		this.anim = { acc: 0, slot: Math.floor( rnd() * 8 ) };
		this.vehicleHitT = - 10;
		this.burn = 0;
		this.corpseT = 0;
		this.items = null; // rolled on the first search
		this.persistent = false;
		this.summoned = !! o.summoned;
		if ( T.crawler ) this.body.mode = 'crawl';
		if ( o.state === 'dormant' ) { this.state = 'dormant'; this.body.mode = 'lying'; this.body.riseFace = rnd() < 0.5 ? 1 : - 1; }
		else if ( o.state === 'feed' ) { this.state = 'feed'; this.body.act( 'eat', 1e6 ); }
		else if ( o.state ) this.state = o.state;
		this._place( true );
	}

	get label() { return this.T.label; }

	// ---- per frame ------------------------------------------------------------------------------------------------

	update( dt ) {
		if ( ! this.inst ) return;
		if ( ! this.alive ) { this._dead( dt ); return; }
		const mgr = this.mgr;
		this.attackCd -= dt;
		this.hitAcc = Math.max( 0, this.hitAcc - dt * 200 );
		if ( this.burn > 0 ) this._burning( dt );
		const body = this.body;
		// knocked down: limp, then back up
		if ( this.down ) {
			this.down.t += dt;
			body.ragdollCentre( this.pos );
			if ( ( body.asleep && this.down.t > this.down.dur ) || this.down.t > this.down.dur + 3 ) {
				if ( this.down.crawl || this.T.crawler ) {
					// ruined legs: roll onto the belly and drag on from where it lies
					body.ragdollLie( _v2 );
					this.yaw = Math.atan2( - _v2.x, - _v2.z );
					body.ragdollCentre( this.pos );
					this.pos.y = this.game.physics.ground( this.pos.x, this.pos.z, this.pos.y + 0.5 ).y;
					body.mode = 'crawl';
				} else {
					body.feetCentre( _v );
					_v.y = this.game.physics.ground( _v.x, _v.z, _v.y + 0.5 ).y;
					this.pos.copy( _v );
					this.yaw = body.riseFromRagdoll( _v );
				}
				this.down = null;
				this.mgr.audio( this, 'z_groan' + ( 1 + Math.floor( rnd() * 4 ) ), 0.7 );
			}
			this._animate( dt );
			return;
		}
		if ( body.mode === 'rise' ) { this.speed = 0; this._animate( dt ); return; }
		// think a few times a second (less when far)
		this.thinkT -= dt;
		this.thinkDt += dt;
		if ( this.thinkT <= 0 ) {
			const far = this.distCam;
			this.thinkT = far < 40 ? 0.12 + rnd() * 0.08 : far < 90 ? 0.3 : far < 160 ? 0.6 : 1.2;
			this._think( this.thinkDt );
			this.thinkDt = 0;
		}
		this.stuckT -= dt;
		if ( this.stuckT <= 0 ) {
			this.stuckT = 1;
			const n = stuckCheck( this, this.mover, this.wantV > 0.3 && ! body.action );
			if ( n > 6 && this.state !== 'chase' ) { this._setState( 'idle' ); this.mover.stuckN = 0; }
		}
		// move
		const acc = this.wantV > this.speed ? 3.5 : 6;
		this.speed += ( this.wantV - this.speed ) * Math.min( 1, dt * acc );
		if ( body.action && body.action.kind !== 'bite' ) this.speed *= Math.max( 0, 1 - dt * 8 );
		if ( this.speed > 0.02 || this.mover.vy !== 0 || this.state === 'attack' ) {
			const moved = move( this.game, this, this.mover, dt, body.mode === 'crawl' ? Math.min( this.speed, 0.6 ) : this.speed, this.turnRate, this.knock ? _push.copy( this.knock ) : null );
			if ( this.knock ) { this.knock.multiplyScalar( Math.max( 0, 1 - dt * 5 ) ); if ( this.knock.lengthSq() < 0.01 ) this.knock = null; }
			this._steps( moved );
		} else if ( this.facing !== undefined ) {
			// turn on the spot towards what it wants to face
			const d = wrap( this.facing - this.yaw );
			this.yaw = wrap( this.yaw + clamp( d, - this.turnRate * dt, this.turnRate * dt ) );
		}
		this._attackStep();
		this._sounds( dt );
		this._animate( dt );
	}

	// ---- perception and decisions -------------------------------------------------------------------------------

	_think( dt ) {
		const g = this.game, mgr = this.mgr, P = mgr.pi; // player perception info
		const now = mgr.time;
		this.stateT += dt;
		// candidates: the player (or the car they're in), survivors nearby
		let best = null, bestD = 1e9, seen = false;
		if ( P.alive ) {
			const d = this.pos.distanceTo( P.pos );
			if ( d < 160 ) {
				const vis = this._canSee( P, d );
				if ( vis > 0 ) {
					// awareness builds faster the closer and more visible the player is
					this.aware += dt * vis * ( 1.5 + Math.max( 0, 1 - d / 30 ) * 6 ) * mgr.diff.sense;
					if ( this.aware >= 1 || d < 3 ) { best = P.entity; bestD = d; seen = true; this.aware = Math.min( this.aware, 2 ); }
				} else this.aware = Math.max( 0, this.aware - dt * 0.3 );
				// bumping into you in the dark
				if ( ! seen && d < 1.3 ) { best = P.entity; bestD = d; seen = true; }
			}
		}
		if ( mgr.npcs.length ) {
			for ( const n of mgr.npcs ) {
				if ( ! n.alive ) continue;
				const d = this.pos.distanceTo( n.pos );
				if ( d > 35 || d > bestD ) continue;
				_eye.set( this.pos.x, this.pos.y + 1.6, this.pos.z );
				_tgt.set( n.pos.x, n.pos.y + 1.3, n.pos.z );
				if ( d < 25 && g.physics.lineOfSight( _eye, _tgt ) ) { best = n; bestD = d; seen = true; }
			}
		}
		if ( seen ) {
			const first = this.state !== 'chase' && this.state !== 'attack' && this.state !== 'bash';
			this.target = best;
			this.lastSeen.copy( best === P.entity ? P.pos : best.pos );
			this.lastSeenT = now;
			this.trailI = - 1;
			if ( first ) this._detected( best );
		}
		// vehicles: the player inside one is hunted through the car
		const st = this.state;
		if ( st === 'dormant' ) {
			if ( seen && bestD < 7 ) this._wake();
			return;
		}
		if ( st === 'feed' ) {
			if ( seen && bestD < 18 ) { this.body.action = null; this._setState( 'chase' ); }
			else { this.wantV = 0; return; }
		}
		if ( this.target && ( this.state === 'chase' || this.state === 'attack' || this.state === 'bash' || seen ) ) this._hunt( now );
		else if ( st === 'investigate' || st === 'search' ) this._investigate();
		else this._idle();
	}

	// 0..1 how well the player can be seen from here
	_canSee( P, d ) {
		const mgr = this.mgr, g = this.game;
		let range = mgr.sightRange * P.visibility;
		if ( d > range ) return 0;
		// field of view (wide; close things are noticed all around)
		const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
		const fx = - Math.sin( this.yaw ), fz = - Math.cos( this.yaw );
		const cos = ( dx * fx + dz * fz ) / ( Math.hypot( dx, dz ) || 1 );
		if ( cos < 0.35 && d > 4 ) return 0;
		if ( cos < - 0.2 && d > 2 ) return 0;
		// line of sight from the eyes to the chest (walls, terrain, smoke)
		_eye.set( this.pos.x, this.pos.y + 1.55 * this.inst.scale, this.pos.z );
		if ( ! g.physics.lineOfSight( _eye, P.chest ) ) return 0;
		if ( g.fx?.smokeBlocks?.( _eye, P.chest ) ) return 0;
		return clamp( 1 - d / range, 0.15, 1 ) * ( cos > 0.7 ? 1 : 0.6 );
	}

	_detected( t ) {
		const mgr = this.mgr;
		this._setState( 'chase' );
		this.body.aggro = 1;
		// the scream carries: others close by come running
		if ( rnd() < ( this.T.runner ? 0.8 : 0.45 ) ) {
			mgr.audio( this, 'z_scream', 1, 90, 6 );
			mgr.alert( this.pos, 35, t, this );
		} else mgr.audio( this, 'z_alert', 0.9, 60, 4 );
	}

	_wake() {
		this.body.startRise( this.body.riseFace );
		this.body.tiltAngle = Math.PI / 2;
		this._setState( this.target ? 'chase' : 'investigate' );
		this.mgr.audio( this, 'z_alert', 0.9, 50 );
	}

	// told by another's scream or a noise
	alertTo( pos, target = null, urgent = false ) {
		if ( ! this.alive ) return;
		if ( this.state === 'dormant' ) { if ( pos.distanceToSquared( this.pos ) < 400 || urgent ) this._wake(); else return; }
		if ( this.state === 'chase' || this.state === 'attack' || this.state === 'bash' ) return;
		if ( this.state === 'feed' ) { this.body.action = null; }
		if ( target ) { this.target = target; this.lastSeen.copy( pos ); this.lastSeenT = this.mgr.time; this._setState( 'chase' ); this.body.aggro = 1; return; }
		this.goal.copy( pos );
		this.goal.x += ( rnd() - 0.5 ) * 6; this.goal.z += ( rnd() - 0.5 ) * 6;
		this.urgent = urgent;
		this._setState( 'investigate' );
	}

	_setState( s ) {
		if ( s !== this.state ) { this.state = s; this.stateT = 0; }
	}

	_idle() {
		const st = this.state;
		this.body.aggro = Math.max( 0, this.body.aggro - 0.05 );
		this.body.reachW = 0;
		this.body.lookW = 0;
		if ( st === 'wander' ) {
			const d = steer( this.game, this, this.mover, this.goal.x, this.goal.z, 0.2, this._neighbours() );
			this.wantV = this.wanderV * ( 1 + this.mgr.night * 0.35 );
			if ( d < 1.2 || this.stateT > 40 ) { this._setState( 'idle' ); this.wantV = 0; }
			return;
		}
		// idle: sway on the spot, turn now and then, set off wandering
		this._setState( 'idle' );
		this.wantV = 0;
		if ( this.stateT > 3 + rnd() * 10 && rnd() < 0.08 + this.mgr.night * 0.08 ) {
			const a = rnd() * Math.PI * 2, r = 6 + rnd() * 22;
			this.goal.set( this.pos.x + Math.sin( a ) * r, this.pos.y, this.pos.z + Math.cos( a ) * r );
			this._setState( 'wander' );
		} else if ( rnd() < 0.02 ) this.facing = this.yaw + ( rnd() - 0.5 ) * 2;
	}

	_investigate() {
		const d = steer( this.game, this, this.mover, this.goal.x, this.goal.z, 0.2, this._neighbours() );
		this.body.lookW = 0;
		if ( this.state === 'investigate' ) {
			this.wantV = this.urgent ? Math.min( this.chaseV, 2.2 + ( this.T.runner ? 1.5 : 0 ) ) : Math.max( this.wanderV * 1.6, 1.0 );
			this.body.aggro = this.urgent ? 0.7 : 0.4;
			if ( d < 2 || this.stateT > 60 ) { this._setState( 'search' ); this.wantV = 0; }
		} else {
			// looking about where the noise was
			this.wantV = 0;
			if ( rnd() < 0.15 ) this.facing = this.yaw + ( rnd() - 0.5 ) * 3;
			if ( this.stateT > 6 + rnd() * 8 ) this._setState( 'idle' );
		}
	}

	_neighbours() {
		return this.game.entities.near( this.pos, 1.4, 'zombie', _nb );
	}

	// chase / attack / bash
	_hunt( now ) {
		const g = this.game, mgr = this.mgr, T = this.target;
		if ( ! T || ( T.alive === false && T !== mgr.pi.entity ) || ( T === mgr.pi.entity && ! mgr.pi.alive ) ) { this.target = null; this._setState( 'search' ); this.goal.copy( this.lastSeen ); return; }
		const isPlayer = T === mgr.pi.entity;
		const vehicle = isPlayer ? mgr.pi.vehicle : null;
		// in a car: the closest point of its body is what they claw at
		const tp = vehicle ? vehicleNearest( vehicle, this.pos, _vn ) : isPlayer ? mgr.pi.pos : T.pos;
		const lost = now - this.lastSeenT;
		if ( lost > 12 ) { this.target = null; this.goal.copy( this.lastSeen ); this._setState( 'investigate' ); this.urgent = true; return; }
		this.body.aggro = 1;
		this.body.look.set( tp.x, tp.y + ( vehicle ? 1.0 : 1.5 ), tp.z ); this.body.lookW = 1;
		const d = Math.hypot( tp.x - this.pos.x, tp.z - this.pos.z );
		// close in to arm's length (from the player's centre; from a car's skin)
		const reach = vehicle ? 0.7 : 0.35 + ( this.body.mode === 'crawl' ? 0.85 : 0.85 );
		this.body.reachW = d < 7 && this.body.style.arms !== 'reach' ? clamp( 1 - ( d - 1 ) / 6, 0, 1 ) : 0;
		// in reach: face and strike
		if ( d < reach && Math.abs( tp.y - this.pos.y ) < 1.6 ) {
			this._setState( 'attack' );
			this.wantV = 0;
			this.facing = Math.atan2( - ( tp.x - this.pos.x ), - ( tp.z - this.pos.z ) );
			this.mover.dir.set( tp.x - this.pos.x, 0, tp.z - this.pos.z ).normalize();
			if ( this.attackCd <= 0 && ! this.body.action && Math.abs( wrap( this.facing - this.yaw ) ) < 0.6 ) this._startAttack( vehicle );
			return;
		}
		if ( this.state === 'attack' && this.body.action ) { this.wantV = 0.3; return; }
		// a door in the way: pound on it
		if ( this.state === 'bash' ) {
			if ( ! this._bashing( d ) ) this._setState( 'chase' );
			else return;
		}
		this._setState( 'chase' );
		// go straight at them when the way is clear, else follow the trail they left (through doors, around corners)
		let gx = tp.x, gz = tp.z;
		const seenNow = lost < 0.5;
		if ( isPlayer && ( ! seenNow || d > 3 ) ) {
			_eye.set( this.pos.x, this.pos.y + 0.9, this.pos.z );
			_tgt.set( tp.x, tp.y + 0.9, tp.z );
			if ( ! seenNow || ! g.physics.lineOfSight( _eye, _tgt ) ) {
				const tr = mgr.trailPoint( this );
				if ( tr ) { gx = tr.x; gz = tr.z; }
				else if ( ! seenNow ) { gx = this.lastSeen.x; gz = this.lastSeen.z; }
			}
		} else if ( ! seenNow ) { gx = this.lastSeen.x; gz = this.lastSeen.z; }
		steer( g, this, this.mover, gx, gz, 0.15, this._neighbours() );
		const nightK = 1 + mgr.night * 0.12;
		this.wantV = ( d < 2.5 ? Math.max( 1.2, this.chaseV * 0.6 ) : this.chaseV ) * nightK;
		// blocked by a door while the target is on the other side
		const b = this.mover.blocked;
		if ( b && b.kind === 'door' && this.body.mode !== 'crawl' && d < 25 ) this._startBash( b );
	}

	_startBash( box ) {
		this.bashBox = box;
		this.bashT = 0;
		this._setState( 'bash' );
		this.wantV = 0;
		this.facing = Math.atan2( - ( box.x - this.pos.x ), - ( box.z - this.pos.z ) );
		this.body.act( 'bash', 1e6 );
	}

	_bashing( d ) {
		const g = this.game, box = this.bashBox;
		// the door opened, broke or is gone
		if ( ! box || ! g.physics.boxes.has( box.id ) || this.stateT > 40 ) { this.body.action = null; return false; }
		if ( Math.hypot( box.x - this.pos.x, box.z - this.pos.z ) > 2.5 ) { this.body.action = null; return false; }
		this.wantV = 0;
		this.bashT += this.thinkDt || 0.15;
		if ( this.bashT > 0.9 ) {
			this.bashT = 0;
			_v.set( box.x, box.y, box.z );
			const door = g.city?.doorAt?.( _v, 1.5 );
			const amt = ( this.T.brute ? 40 : 9 ) * ( 0.7 + rnd() * 0.6 );
			door?.bash?.( amt, { source: this, kind: 'zombie' } );
			g.audio?.play( 'hit_wood', { pos: _v, vol: 0.7, max: 60, rate: 0.8 + rnd() * 0.2 } );
			g.events.emit( 'noise', { pos: _v.clone(), radius: 18, source: this, kind: 'bash' } );
		}
		void d;
		return true;
	}

	_startAttack( vehicle ) {
		const mgr = this.mgr;
		const crawl = this.body.mode === 'crawl';
		const bite = crawl || ( ! vehicle && rnd() < 0.3 );
		const kind = bite ? 'bite' : rnd() < 0.5 ? 'swipeL' : 'swipeR';
		const dur = ( bite ? 1.15 : 0.95 ) / mgr.diff.attack;
		if ( ! crawl ) this.body.act( kind, dur );
		this.atk = { kind, dur, t: 0, strike: bite ? 0.55 : 0.52, vehicle };
		this.struck = false;
		this.attackCd = dur + ( this.T.brute ? 1.2 : 0.5 + rnd() * 0.6 ) / mgr.diff.attack;
		mgr.audio( this, 'z_attack', 0.9, 40 );
	}

	// the strike lands at a set point of the swing if the prey is still there
	_attackStep() {
		const a = this.atk;
		if ( ! a ) return;
		a.t += this.mgr.dt;
		if ( ! this.struck && a.t >= a.dur * a.strike ) {
			this.struck = true;
			const mgr = this.mgr, g = this.game, T = this.target;
			if ( ! T ) return;
			const isPlayer = T === mgr.pi.entity;
			const veh = isPlayer && a.vehicle && mgr.pi.vehicle === a.vehicle ? a.vehicle : null;
			const tp = veh ? vehicleNearest( veh, this.pos, _vn ) : isPlayer ? mgr.pi.pos : T.pos;
			const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z;
			const d = Math.hypot( dx, dz );
			const reach = ( veh ? 0.3 : 0.35 ) + 1.3;
			const ang = d < 0.3 ? 0 : Math.abs( wrap( Math.atan2( - dx, - dz ) - this.yaw ) );
			// the rider of a motorbike, a jet ski or an open boat is in reach of the hands
			const exposed = veh && ( veh.spec?.kind === 'bike' || veh.spec?.open );
			if ( d < reach && ang < 1.0 && ( ! isPlayer || ! a.vehicle || veh ) ) {
				const brute = this.T.brute ? 1.8 : 1;
				if ( veh && ! exposed ) {
					veh.damage?.( ( a.kind === 'bite' ? 3 : 5 ) * brute, { source: this, kind: 'zombie', dir: _v.set( dx, 0, dz ).normalize().clone() } );
					g.audio?.play( 'hit_metal', { pos: tp, vol: 0.5, max: 40 } );
				} else if ( isPlayer ) {
					const dir = new THREE.Vector3( dx, 0, dz ).normalize();
					if ( a.kind === 'bite' ) g.survival?.hurt( ( 12 + rnd() * 7 ) * brute, 'bite', { dir, cause: 'the infected', source: this } );
					else g.survival?.hurt( ( 6 + rnd() * 5 ) * brute, 'scratch', { dir, cause: 'the infected', source: this } );
					g.audio?.play( a.kind === 'bite' ? 'hit_flesh' : 'hit_blade', { vol: 0.6 } );
				} else if ( T.damage ) {
					T.damage( ( a.kind === 'bite' ? 16 : 10 ) * brute, { source: this, kind: 'melee', zone: 'torso', dir: _v.set( dx, 0, dz ).normalize().clone() } );
					g.audio?.play( 'hit_flesh', { pos: tp, vol: 0.6, max: 40 } );
				}
			} else g.audio?.play( 'swing', { pos: this.pos, vol: 0.5, max: 25, rate: 0.8 } );
		}
		if ( a.t >= a.dur ) this.atk = null;
	}

	// ---- damage --------------------------------------------------------------------------------------------------------

	damage( amount, info = {} ) {
		if ( ! this.alive ) {
			if ( info.point && this.body.mode === 'ragdoll' && info.dir ) this.body.ragdollImpulse( info.point, info.dir, Math.min( 6, amount / 10 ) );
			return;
		}
		const g = this.game, T = this.T, kind = info.kind || 'bullet';
		const zone = info.zone || 'torso';
		const ballistic = kind === 'bullet' || kind === 'arrow';
		if ( kind === 'vehicle' ) this.vehicleHitT = this.mgr.time;
		// a helmet turns half the pistol rounds and buckshot that find it (the damage arrives with the head
		// multiplier: rifle rounds come in over 160 and go through), body armour takes the edge off
		if ( ballistic && zone === 'head' && T.helmet && amount < 160 && rnd() < T.helmet ) {
			amount *= 0.15;
			g.audio?.play( 'hit_metal', { pos: info.point || this.pos, vol: 0.7, max: 60 } );
		} else if ( ballistic && zone === 'head' ) amount = Math.max( amount, this.health + 1 ); // a round through the head drops them
		if ( ballistic && ( zone === 'torso' || zone === 'chest' ) && T.armor && ARMOURED.has( this.avatar ) ) amount *= 1 - T.armor;
		if ( kind === 'melee' && zone === 'head' ) amount *= 1.4;
		if ( this.state === 'dormant' ) this._wake();
		this.health -= amount;
		this.hitAcc += amount;
		if ( info.point && ( ballistic || kind === 'melee' ) ) this.inst.addWound( info.point, ballistic ? 0.03 : 0.05 );
		// the attacker becomes the target
		const src = info.source;
		if ( src && typeof src === 'object' ) this.lastAttacker = src;
		if ( src && src !== this && ( src === g.player || src.alive ) && src.type !== 'zombie' ) {
			const tgt = src === g.player ? this.mgr.pi.entity : src;
			if ( tgt ) { this.target = tgt; this.lastSeen.copy( src.pos ); this.lastSeenT = this.mgr.time; if ( this.state !== 'attack' ) this._setState( 'chase' ); }
		}
		if ( zone === 'leg' ) this.legDmg += amount;
		const dir = info.dir || _v.set( 0, 0, 1 );
		if ( this.health <= 0 ) {
			this.health = 0;
			this.alive = false;
			this.die( info );
			return;
		}
		// reactions: flinch, stagger, knockdown (shotguns and big hits), legs giving out
		this.body.flinch( dir, clamp( amount / 35, 0.3, 1.6 ), zone );
		if ( this.down ) { if ( info.point ) this.body.ragdollImpulse( info.point, dir, Math.min( 5, amount / 12 ) ); return; }
		if ( this.hitAcc > ( T.brute ? 160 : 55 ) && ( kind === 'bullet' || kind === 'melee' || kind === 'explosion' ) ) this.knockdown( dir, Math.min( 7, this.hitAcc / 14 ), info.point );
		else if ( amount > 25 && rnd() < 0.35 ) this.stagger( dir, 0.6 );
		if ( ! this.T.crawler && this.body.mode !== 'crawl' && this.legDmg > this.maxHealth * 0.55 && ! T.brute && this.alive ) this._toCrawler( dir );
	}

	// a shove or a blunt hit: stumble back, lose the swing; hard ones knock it over
	stagger( dir, amount = 1 ) {
		if ( ! this.alive || this.down || this.body.mode !== 'stand' ) return;
		const resist = this.T.brute ? 0.35 : 1;
		this.body.action = null; this.atk = null;
		this.body.flinch( dir, amount * 1.2 * resist );
		this.knock = ( this.knock || new THREE.Vector3() ).set( dir.x, 0, dir.z ).normalize().multiplyScalar( 2.5 * amount * resist );
		this.attackCd = Math.max( this.attackCd, 0.6 + amount * 0.5 );
		if ( amount * resist >= 1.2 && rnd() < 0.55 ) this.knockdown( dir, 3 * amount * resist );
	}

	// blasts and rams
	knockback( dir, strength ) {
		if ( ! this.alive ) { if ( this.body.mode === 'ragdoll' ) this.body.ragdollImpulse( this.body.ragdollCentre( _v2 ), dir, strength ); return; }
		this.knockdown( dir, strength );
	}

	knockdown( dir, strength = 3, point = null ) {
		if ( this.down || this.body.mode === 'crawl' || this.body.mode === 'ragdoll' ) return;
		this.body.action = null; this.atk = null;
		this._hitVec( dir, strength, point );
		this.body.ragdoll( this.game.physics, this.vel, _hitInfo );
		this.down = { t: 0, dur: 1.4 + rnd() * 1.8 };
		this.mgr.audio( this, 'z_groan' + ( 1 + Math.floor( rnd() * 4 ) ), 0.8 );
	}

	_hitVec( dir, strength, point ) {
		_hitInfo.dir.set( dir.x, Math.max( 0, dir.y ), dir.z ).normalize();
		_hitInfo.strength = strength;
		if ( point ) _hitInfo.point.copy( point );
		else _hitInfo.point.set( this.pos.x, this.pos.y + 1.2 * this.inst.scale, this.pos.z );
	}

	_toCrawler( dir ) {
		// the legs are gone: collapse and drag itself on
		this.T = { ...this.T, crawler: true };
		this.knockdown( dir, 1.5 );
		this.down.crawl = true;
	}

	ignite( sec = 5 ) { this.burn = Math.max( this.burn, sec ); }

	_burning( dt ) {
		this.burn -= dt;
		this.fireT = ( this.fireT || 0 ) - dt;
		if ( this.fireT <= 0 ) {
			this.fireT = 0.5;
			this.game.fx?.fire?.( _v.set( this.pos.x, this.pos.y + 0.8, this.pos.z ), { radius: 0.3, duration: 0.8, intensity: 0.6, smoke: true, sound: false } );
		}
		this.health -= dt * 12;
		if ( this.health <= 0 && this.alive ) { this.alive = false; this.die( { kind: 'fire', dir: _v.set( 0, 0, 1 ) } ); this.game.events.emit( 'kill', { target: this, source: this.lastAttacker || null, weapon: 'fire' } ); }
	}

	die( info = {} ) {
		const g = this.game, mgr = this.mgr;
		this.state = 'dead';
		this.noHit = true;
		this.atk = null;
		this.body.action = null;
		const dir = info.dir || _v.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) ).negate();
		let strength = info.kind === 'explosion' ? 7 : info.kind === 'vehicle' ? 8 : info.kind === 'melee' ? 2.2 : 1.5 + Math.min( 3, this.hitAcc / 30 );
		if ( info.zone === 'head' && info.kind === 'bullet' ) strength *= 0.6; // folds where it stands
		if ( this.body.mode === 'ragdoll' ) { if ( info.point ) this.body.ragdollImpulse( info.point, dir, strength ); }
		else {
			this._hitVec( dir, strength, info.point );
			this.body.ragdoll( g.physics, this.vel, _hitInfo );
		}
		this.down = null;
		if ( info.zone !== 'head' ) mgr.audio( this, 'z_die', 0.9, 45 );
		this.corpseT = 0;
		mgr.onDeath( this, info );
	}

	// ---- dead: settle, then lie as a searchable body until it rots away ----------------------------------------------

	_dead( dt ) {
		if ( this.type === 'zombie' ) this.type = 'corpse'; // after the kill event has been counted
		this.corpseT += dt;
		const body = this.body;
		if ( body.mode === 'ragdoll' ) {
			const wasAsleep = body.asleep;
			if ( ! body.asleep ) { body.update( dt ); body.ragdollCentre( this.pos ); }
			else if ( ! body._posedAsleep ) body.update( dt );
			if ( body.asleep && ! wasAsleep && this.distCam < 60 ) this.game.fx?.bloodPool?.( this.pos, 0.8 + rnd() * 0.5 );
		}
	}

	// ---- animation, sound ------------------------------------------------------------------------------------------

	_animate( dt ) {
		const body = this.body;
		body.speed = this.speed;
		body.yaw = this.yaw;
		body.searching = this.state === 'search';
		// how often the skeleton is re-posed depends on distance and visibility (manager decides per frame)
		this.anim.acc += dt;
		if ( ! this.mgr.animNow( this ) ) return;
		const adt = this.anim.acc;
		this.anim.acc = 0;
		this._place( false );
		body.update( adt );
	}

	_place( force ) {
		const body = this.body, inst = this.inst;
		// low to the ground while crawling or lying (melee aims at a height fraction of this)
		this.height = body.mode === 'crawl' || body.mode === 'lying' || body.mode === 'ragdoll' ? 0.5 : this.standH;
		if ( body.mode === 'ragdoll' ) return;
		if ( body.mode === 'crawl' ) {
			// the root pivots at the feet, which trail behind the chest
			const s = inst.scale, fx = - Math.sin( this.yaw ), fz = - Math.cos( this.yaw );
			_v.set( this.pos.x - fx * 0.95 * s, this.pos.y + 0.13 * s, this.pos.z - fz * 0.95 * s );
			inst.place( _v, this.yaw, body.tiltQuat( Math.PI / 2, 1, _q ) );
			return;
		}
		if ( body.mode === 'rise' || body.mode === 'lying' ) {
			// pivot at the feet; lifted by half the body's thickness as it tips over, so the back (or the chest) rests
			// on the ground instead of the spine's line
			const a = body.mode === 'lying' ? Math.PI / 2 : body.tiltAngle;
			_v.set( this.pos.x, this.pos.y + 0.12 * inst.scale * Math.sin( a ), this.pos.z );
			inst.place( _v, this.yaw, body.tiltQuat( a, body.riseFace, _q ) );
			return;
		}
		inst.place( this.pos, this.yaw );
		void force;
	}

	_steps( moved ) {
		if ( this.distCam > 22 || this.speed < 1.6 ) return;
		this.stepD += moved;
		if ( this.stepD > ( this.speed > 3.5 ? 1.7 : 1.1 ) ) {
			this.stepD = 0;
			this.game.audio?.play( 'z_step', { pos: this.pos, vol: 0.35 + Math.min( 0.4, this.speed * 0.08 ), max: 25, detune: 0.2 } );
		}
	}

	_sounds( dt ) {
		this.groanT -= dt;
		if ( this.jawHold > 0 ) { this.jawHold -= dt; if ( this.jawHold <= 0 ) this.body.jawOpen = 0; }
		if ( this.groanT > 0 ) return;
		if ( this.state === 'feed' ) {
			// wet tearing and chewing over the body, a low growl now and then: heard before it is seen
			this.groanT = 1.2 + rnd() * 2.2;
			this.mgr.audio( this, rnd() < 0.7 ? 'eat' : 'hit_flesh', 0.55, 26, 2 );
			if ( rnd() < 0.25 ) this.mgr.audio( this, 'z_groan' + ( 1 + Math.floor( rnd() * 4 ) ), 0.4, 30 );
			return;
		}
		const hunting = this.state === 'chase' || this.state === 'attack';
		this.groanT = hunting ? 2.5 + rnd() * 3.5 : 6 + rnd() * 16;
		if ( this.state === 'dormant' && rnd() < 0.7 ) return;
		this.mgr.audio( this, 'z_groan' + ( 1 + Math.floor( rnd() * 4 ) ), hunting ? 0.9 : 0.6, hunting ? 55 : 40 );
		this.body.jawOpen = 0.8;
		this.jawHold = 0.9;
	}

	// ---- hit volumes -------------------------------------------------------------------------------------------------

	hitTest( o, d, maxT ) {
		if ( ! this.inst ) return null;
		const m = this.body.mode;
		if ( m === 'stand' || m === 'rise' ) {
			if ( rayCylinder( o, d, this.pos, 1.0, this.height + 0.3, maxT ) === null ) return null;
		} else {
			this.body.centreOf( _v3 );
			if ( raySphere( o, d, _v3, 1.4, maxT ) === null && _v3.distanceToSquared( o ) > 2 ) return null;
		}
		return this.body.hitTest( o, d, maxT );
	}

	// where interactions and the loot container sit
	centre( out ) { return this.body.centreOf( out ); }

	serialize() { return null; }

	dispose() {
		if ( this.inst ) { this.mgr.lib.release( this.inst ); this.inst = null; }
		this.object = null;
	}
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _vn = new THREE.Vector3();

// the point of a vehicle's footprint (its model bounds, turned by its yaw) nearest to p, at p's height
export function vehicleNearest( v, p, out ) {
	const yaw = v.yaw || 0, c = Math.cos( yaw ), s = Math.sin( yaw );
	const dx = p.x - v.pos.x, dz = p.z - v.pos.z;
	// into the vehicle frame (three.js rotation.y: local x runs along ( c, -s ), local z along ( s, c ))
	const lx = dx * c - dz * s, lz = dx * s + dz * c;
	const b = v.bounds, hx = ( v.size?.x || 1.8 ) / 2, hz = ( v.size?.z || 4.4 ) / 2;
	const cx = clamp( lx, b ? b.min.x : - hx, b ? b.max.x : hx ), cz = clamp( lz, b ? b.min.z : - hz, b ? b.max.z : hz );
	return out.set( v.pos.x + cx * c + cz * s, p.y, v.pos.z - cx * s + cz * c );
}
const _hitInfo = { point: new THREE.Vector3(), dir: new THREE.Vector3(), strength: 1 };
