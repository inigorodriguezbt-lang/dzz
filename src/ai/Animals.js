// Animals of the islands: feral pigs (aggressive, they charge and gore), feral chickens (everywhere on
// Kaua'i), goats on dry slopes, axis deer on Maui, Lana'i and Moloka'i, nene, cattle on ranch land, tiger
// sharks that circle and hit swimmers in deep water, honu basking on beaches and cruising the reefs.
// Herds graze and wander, bolt from people and gunshots; carcasses can be butchered with a blade.
import * as THREE from 'three';
import { Entity, raySphere } from '../game/Entities.js';
import { animalTemplate, animalInstance } from './AnimalModels.js';
import { Mover, steer, move, stuckCheck } from './Steer.js';
import { rayCapsule } from './Body.js';
import { getItem, makeStack } from '../game/items/ItemDB.js';
// (Math.hypot boxes its arguments in V8: garbage on hot paths)
const hyp = ( a, b ) => Math.sqrt( a * a + b * b );
const hyp3 = ( a, b, c ) => Math.sqrt( a * a + b * b + c * c );

const rnd = Math.random;
const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );
const smooth = ( t ) => t * t * ( 3 - 2 * t );
const cap = ( s ) => s[ 0 ].toUpperCase() + s.slice( 1 );
const TAU = Math.PI * 2;

// yields: [ [ ids (first defined wins), min, max ] ]
export const SPECIES = {
	boar: { name: 'boar', hp: 95, walk: 0.9, run: 7.5, flee: 20, aggro: 0.5, group: [ 1, 4 ], sound: 'boar', leg: 0.34, L: 0.72, by: 0.56, girth: 0.22, size: 0.9, time: 9,
		yields: [ [ [ 'raw_boar' ], 3, 4 ], [ [ 'animal_hide' ], 1, 1 ], [ [ 'bone' ], 1, 2 ] ] },
	goat: { name: 'goat', hp: 55, walk: 0.8, run: 6.5, flee: 26, group: [ 2, 6 ], sound: 'goat', leg: 0.42, L: 0.62, by: 0.62, girth: 0.18, size: 0.7, time: 7, slope: 0.4,
		yields: [ [ [ 'raw_goat' ], 2, 3 ], [ [ 'animal_hide' ], 1, 1 ], [ [ 'bone' ], 1, 2 ] ] },
	deer: { name: 'deer', hp: 75, walk: 1.0, run: 10.5, flee: 42, group: [ 3, 7 ], sound: 'deer', leg: 0.62, L: 0.78, by: 0.81, girth: 0.17, size: 0.9, time: 9,
		yields: [ [ [ 'raw_venison' ], 3, 4 ], [ [ 'animal_hide' ], 1, 1 ], [ [ 'bone' ], 1, 2 ] ] },
	cow: { name: 'cow', hp: 260, walk: 0.8, run: 4.6, flee: 7, group: [ 4, 9 ], sound: 'moo', leg: 0.62, L: 1.25, by: 1.02, girth: 0.36, size: 1.6, time: 14,
		yields: [ [ [ 'raw_beef', 'raw_venison' ], 4, 6 ], [ [ 'animal_hide' ], 1, 2 ], [ [ 'bone' ], 2, 3 ] ] },
	chicken: { name: 'chicken', hp: 14, walk: 0.5, run: 3.6, flee: 6, group: [ 3, 7 ], sound: 'chicken', leg: 0.17, L: 0.28, by: 0.29, girth: 0.11, size: 0.3, time: 4, bird: true,
		yields: [ [ [ 'raw_chicken' ], 1, 1 ], [ [ 'feathers' ], 2, 4 ] ] },
	nene: { name: 'nēnē', hp: 22, walk: 0.45, run: 2.6, flee: 4, group: [ 2, 5 ], sound: 'honk', leg: 0.21, L: 0.4, by: 0.39, girth: 0.15, size: 0.5, time: 5, bird: true,
		yields: [ [ [ 'raw_chicken' ], 1, 1 ], [ [ 'feathers' ], 3, 5 ] ] },
	shark: { name: 'shark', hp: 240, swim: 1.6, dash: 7, size: 1.6, L: 3.2, girth: 0.25, time: 12, water: true,
		yields: [ [ [ 'raw_shark' ], 3, 5 ] ] },
	turtle: { name: 'turtle', hp: 110, walk: 0.18, swim: 0.9, flee: 3, group: [ 1, 2 ], L: 0.9, by: 0.14, girth: 0.2, size: 0.8, time: 0, yields: null },
};

const GAITS = {
	walk: { off: [ 0.25, 0.75, 0, 0.5 ], duty: 0.64, amp: 0.34, flex: 0.7, stride: 2.1, bob: 0.012 },
	trot: { off: [ 0.5, 0, 0, 0.5 ], duty: 0.5, amp: 0.46, flex: 1.0, stride: 2.7, bob: 0.025 },
	gallop: { off: [ 0.55, 0.62, 0, 0.1 ], duty: 0.36, amp: 0.62, flex: 1.2, stride: 3.8, bob: 0.05 },
};
const LEGS = [ 'FL', 'FR', 'HL', 'HR' ];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _nb = [];

export class Animal extends Entity {
	constructor( game, mgr, species, pos, o = {} ) {
		super( game, 'animal' );
		this.mgr = mgr;
		this.species = species;
		this.kind = 'animal';
		const S = this.S = SPECIES[ species ];
		const male = o.male ?? rnd() < 0.4;
		const variant = { male, hereford: species === 'cow' && rnd() < 0.4 };
		if ( species === 'goat' ) {
			const coats = [ [ 0x6a4a30, 0x8a6a4a ], [ 0x2e2924, 0x3a342e ], [ 0xd8d0c0, 0xe8e2d8 ], [ 0x8a6038, 0xc8b8a0 ] ];
			const c = coats[ Math.floor( rnd() * coats.length ) ];
			variant.coat = c[ 0 ]; variant.belly = c[ 1 ];
		}
		this.male = male;
		this.a = animalInstance( animalTemplate( species, variant ) );
		this.object = this.a.mesh;
		// the leg bones in gait order (FL FR HL HR; upper, lower, foot), looked up once
		this.legs = [];
		for ( const L of LEGS ) for ( const k of [ '1', '2', '3' ] ) this.legs.push( this.a.bone[ L + k ] || null );
		this.pos.copy( pos );
		this.yaw = o.yaw ?? rnd() * TAU;
		this.scaleK = 0.9 + rnd() * 0.2 * ( male ? 1.1 : 1 );
		this.a.mesh.scale.setScalar( this.scaleK );
		this.radius = S.girth * this.scaleK;
		this.height = ( S.by + S.girth ) * this.scaleK;
		this.size = S.size;
		this.maxHealth = this.health = S.hp * this.scaleK;
		this.mover = new Mover( Math.max( 0.15, S.girth * 0.8 ), this.height );
		if ( S.slope ) this.mover.maxSlope = S.slope;
		this.herd = new THREE.Vector3().copy( o.herd || pos );
		this.state = S.water ? 'circle' : 'graze';
		this.stateT = rnd() * 5;
		this.goal = new THREE.Vector3().copy( pos );
		this.speed = 0; this.wantV = 0;
		this.phase = rnd();
		this.t = rnd() * 10;
		this.thinkT = rnd() * 0.5;
		this.stuckT = rnd();
		this.soundT = 4 + rnd() * 15;
		this.graze = 0; this.alert = 0;
		this.aggressive = S.aggro ? rnd() < S.aggro : false;
		this.charges = 0;
		this.hitT = - 10;
		this.deadT = 0;
		this.butcherable = !! S.yields;
		this.inWater = false;
		this.water = !! S.water;
		if ( S.water ) { this.mover.water = true; this.depth = 1.5; this.orbit = rnd() < 0.5 ? 1 : - 1; }
		if ( species === 'turtle' ) this.inWater = game.hf.heightAt( pos.x, pos.z ) < - 0.4;
		this._pose( 0 );
	}

	get label() { return this.S.name; }

	update( dt ) {
		if ( ! this.alive ) { this._dead( dt ); return; }
		this.t += dt;
		this.thinkT -= dt;
		if ( this.thinkT <= 0 ) {
			const d = this.mgr.camPos.distanceTo( this.pos );
			this.thinkT = d < 50 ? 0.2 : d < 120 ? 0.5 : 1;
			this._think();
		}
		if ( this.water ) this._swim( dt );
		else {
			this.stuckT -= dt;
			if ( this.stuckT <= 0 ) { this.stuckT = 1; stuckCheck( this, this.mover, this.wantV > 0.3 ); }
			this.speed += ( this.wantV - this.speed ) * Math.min( 1, dt * ( this.wantV > this.speed ? 3 : 5 ) );
			if ( this.speed > 0.02 || ! this.mover.onGround ) move( this.game, this, this.mover, dt, this.speed, this.speed > 3 ? 3.5 : 2.2 );
			if ( this.species === 'turtle' ) this._turtleWater();
		}
		this._sounds( dt );
		this._animate( dt );
	}

	// ---- decisions -------------------------------------------------------------------------------------------

	_think() {
		const g = this.game, mgr = this.mgr, S = this.S, pi = mgr.pi;
		this.stateT += this.thinkT;
		if ( this.species === 'shark' ) return this._sharkThink();
		const d = pi.alive ? this.pos.distanceTo( pi.pos ) : 1e9;
		// people are noticed by sight (stance, movement) or when very close
		const notice = S.flee * ( 0.4 + 0.6 * pi.visibility ) * ( 1 - mgr.night * 0.4 );
		const threat = d < notice || d < 2.5;
		if ( this.state === 'charge' ) return this._charge( d );
		if ( this.state === 'flee' ) {
			if ( this.stateT > 6 && d > S.flee * 1.5 ) this._set( 'graze' );
			else { this._fleeFrom( this.fleeFrom || pi.pos ); return; }
		}
		if ( threat ) {
			if ( this.species === 'boar' && ( this.aggressive || this.hitT > mgr.time - 20 ) && d < 16 && this.charges < 3 && pi.alive && ! pi.vehicle ) { this._set( 'charge' ); return; }
			if ( this.species === 'turtle' ) { this.goal.copy( this._toWater() ); this._set( 'wander' ); this.wantV = S.walk; return; }
			this._scare( pi.pos );
			this._set( 'flee' );
			if ( S.sound && rnd() < 0.6 ) this._voice( 1 );
			// the herd bolts together
			for ( const o of g.entities.near( this.pos, 25, 'animal', _nb ) ) if ( o !== this && o.alive && o.species === this.species && o.state !== 'flee' ) { o._scare( this.fleeFrom ); o._set( 'flee' ); }
			return;
		}
		this.alert = d < notice * 1.6 ? 1 : 0;
		// graze, wander about the herd
		if ( this.state === 'wander' ) {
			const dd = steer( g, this, this.mover, this.goal.x, this.goal.z, this.thinkT, g.entities.near( this.pos, 1.5, 'animal', _nb ) );
			this.wantV = S.walk * ( this.alert ? 0.6 : 1 );
			if ( dd < 1 || this.stateT > 25 ) { this._set( 'graze' ); this.wantV = 0; }
		} else {
			this.wantV = 0;
			if ( this.stateT > 4 + rnd() * 12 && rnd() < 0.25 ) {
				const a = rnd() * TAU, r = 3 + rnd() * 18;
				this.goal.set( this.herd.x + Math.cos( a ) * r, 0, this.herd.z + Math.sin( a ) * r );
				this._set( 'wander' );
			}
		}
	}

	_set( s ) { if ( s !== this.state ) { this.state = s; this.stateT = 0; } }

	// remember what to run from (no allocation per scare)
	_scare( p ) { ( this.fleeFrom || ( this.fleeFrom = new THREE.Vector3() ) ).copy( p ); }

	_fleeFrom( from ) {
		const S = this.S;
		const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
		const l = hyp( dx, dz ) || 1;
		const gx = this.pos.x + dx / l * 25 + ( rnd() - 0.5 ) * 8, gz = this.pos.z + dz / l * 25 + ( rnd() - 0.5 ) * 8;
		steer( this.game, this, this.mover, gx, gz, this.thinkT, this.game.entities.near( this.pos, 1.5, 'animal', _nb ) );
		this.wantV = S.run * ( this.health < this.maxHealth * 0.4 ? 0.7 : 1 );
	}

	// a boar runs at you, gores, runs on past, turns and comes again
	_charge( d ) {
		const g = this.game, pi = this.mgr.pi;
		if ( ! pi.alive || pi.vehicle || this.health < this.maxHealth * 0.3 ) { this._scare( pi.pos ); this._set( 'flee' ); return; }
		if ( ! this.pass ) {
			steer( g, this, this.mover, pi.pos.x, pi.pos.z, this.thinkT, null );
			this.wantV = this.S.run;
			if ( this.stateT < 0.3 ) this._voice( 1 );
			if ( d < 1.3 ) {
				const dir = new THREE.Vector3( pi.pos.x - this.pos.x, 0, pi.pos.z - this.pos.z ).normalize();
				g.survival?.hurt( 14 + rnd() * 12, 'animal', { dir, cause: 'a boar', source: this } );
				g.player.vel?.addScaledVector?.( dir, 3 );
				g.audio?.play( 'hit_flesh', { vol: 0.8 } );
				this.charges ++;
				this.pass = new THREE.Vector3( this.pos.x + dir.x * 8, 0, this.pos.z + dir.z * 8 );
			} else if ( this.stateT > 8 ) { this.charges ++; this.stateT = 0; }
		} else {
			steer( g, this, this.mover, this.pass.x, this.pass.z, this.thinkT, null );
			this.wantV = this.S.run * 0.8;
			if ( hyp( this.pass.x - this.pos.x, this.pass.z - this.pos.z ) < 1.5 || this.stateT > 3 ) { this.pass = null; this.stateT = 0; }
		}
		if ( this.charges >= 3 ) { this._scare( pi.pos ); this._set( 'flee' ); }
	}

	// a honu heads for the sea when bothered
	_toWater() {
		const hf = this.game.hf;
		for ( let r = 6; r <= 40; r += 6 ) for ( let k = 0; k < 8; k ++ ) {
			const a = k / 8 * TAU;
			const x = this.pos.x + Math.cos( a ) * r, z = this.pos.z + Math.sin( a ) * r;
			if ( hf.heightAt( x, z ) < - 0.6 ) return _v.set( x, 0, z );
		}
		return _v.copy( this.pos );
	}

	_turtleWater() {
		const h = this.game.hf.heightAt( this.pos.x, this.pos.z );
		const wet = h < - 0.35;
		if ( wet !== this.inWater ) { this.inWater = wet; this.mover.water = false; }
		if ( wet ) this.pos.y = Math.max( h + 0.1, this.game.physics.waterLevel( this.pos.x, this.pos.z ) - 0.5 );
	}

	// ---- sharks ----------------------------------------------------------------------------------------------------

	_sharkThink() {
		const pi = this.mgr.pi, P = this.game.player;
		const swimmer = pi.alive && P.swimming && ! pi.vehicle;
		const d = hyp( pi.pos.x - this.pos.x, pi.pos.z - this.pos.z );
		if ( this.state === 'flee' ) { if ( this.stateT > 15 ) this._set( 'circle' ); return; }
		if ( ! swimmer ) { if ( this.state === 'attack' ) this._set( 'circle' ); this.lose = ( this.lose || 0 ) + this.thinkT; return; }
		this.lose = 0;
		if ( this.state === 'circle' && this.stateT > 12 + rnd() * 14 && d < 40 ) { this._set( 'attack' ); this.bit = false; }
		if ( this.state === 'retreat' && this.stateT > 5 ) this._set( 'circle' );
	}

	_swim( dt ) {
		const g = this.game, pi = this.mgr.pi, hf = g.hf, P = g.physics;
		const water = P.waterLevel( this.pos.x, this.pos.z );
		let tx, tz, v, depth;
		const st = this.state;
		const pp = pi.pos;
		if ( st === 'attack' ) {
			tx = pp.x; tz = pp.z; v = this.S.dash; depth = 0.9;
			const d3 = hyp3( pp.x - this.pos.x, ( pp.y + 1.2 ) - this.pos.y, pp.z - this.pos.z );
			if ( d3 < 1.8 && ! this.bit ) {
				this.bit = true;
				const dir = new THREE.Vector3( pp.x - this.pos.x, 0, pp.z - this.pos.z ).normalize();
				g.survival?.hurt( 30 + rnd() * 15, 'animal', { dir, cause: 'a shark', source: this } );
				g.fx?.blood?.( _v.set( pp.x, water - 0.2, pp.z ), dir, 2 );
				g.audio?.play( 'hit_flesh', { vol: 1 } );
				g.audio?.play( 'big_splash', { pos: pp, vol: 0.8 } );
				this._set( 'retreat' );
			}
			if ( this.stateT > 8 ) this._set( 'retreat' );
		} else if ( st === 'retreat' || st === 'flee' ) {
			const a = Math.atan2( this.pos.z - pp.z, this.pos.x - pp.x );
			tx = pp.x + Math.cos( a ) * 30; tz = pp.z + Math.sin( a ) * 30; v = st === 'flee' ? this.S.dash : this.S.swim * 1.8; depth = 2.5;
		} else {
			// circling: the fin cuts the surface
			const R = 11, a = Math.atan2( this.pos.z - pp.z, this.pos.x - pp.x ) + this.orbit * 0.5;
			tx = pp.x + Math.cos( a ) * R; tz = pp.z + Math.sin( a ) * R; v = this.S.swim * 1.4; depth = 0.35;
			if ( this.lose > 20 ) { tx = this.pos.x + Math.sin( this.yaw ) * - 20; tz = this.pos.z - Math.cos( this.yaw ) * 20; depth = 3; }
		}
		// steer, staying in deep water
		let want = Math.atan2( - ( tx - this.pos.x ), - ( tz - this.pos.z ) );
		const ax = this.pos.x - Math.sin( want ) * 6, az = this.pos.z - Math.cos( want ) * 6;
		if ( hf.heightAt( ax, az ) > - 2.5 ) want = this.yaw + this.orbit * 1.2;
		const diff = wrap( want - this.yaw );
		this.yaw = wrap( this.yaw + clamp( diff, - 1.6 * dt, 1.6 * dt ) );
		this.speed += ( v - this.speed ) * Math.min( 1, dt * 1.5 );
		this.pos.x += - Math.sin( this.yaw ) * this.speed * dt;
		this.pos.z += - Math.cos( this.yaw ) * this.speed * dt;
		const bed = hf.heightAt( this.pos.x, this.pos.z );
		const ty = Math.max( bed + 0.8, water - depth );
		this.pos.y += ( ty - this.pos.y ) * Math.min( 1, dt * 1.2 );
		this.depth = water - this.pos.y;
	}

	// ---- damage ----------------------------------------------------------------------------------------------------

	damage( amount, info = {} ) {
		if ( ! this.alive ) return;
		if ( info.zone === 'head' && ( info.kind === 'bullet' || info.kind === 'arrow' ) ) amount *= 1.5;
		this.health -= amount;
		this.hitT = this.mgr.time;
		if ( this.health <= 0 ) { this.health = 0; this.alive = false; this.die( info ); return; }
		const src = info.source?.pos || this.mgr.pi.pos;
		if ( this.species === 'boar' && rnd() < 0.7 && info.source === this.game.player ) { this._set( 'charge' ); this.pass = null; }
		else if ( this.species === 'shark' ) { if ( this.health < this.maxHealth * 0.5 ) this._set( 'flee' ); else this._set( 'attack' ); }
		else { this._scare( src ); this._set( 'flee' ); }
		this._voice( 1 );
		this.flinch = 1;
	}

	knockback( dir ) { if ( this.alive && ! this.water ) { this._scare( _v.copy( this.pos ).sub( dir ) ); this._set( 'flee' ); } }
	stagger( dir ) { this.flinch = 1; if ( this.species !== 'boar' && this.alive ) { this._scare( _v.copy( this.pos ).sub( dir ) ); this._set( 'flee' ); } }

	die( info = {} ) {
		this.state = 'dead';
		this.noHit = true;
		this.deadT = 0;
		this.rollDir = rnd() < 0.5 ? 1 : - 1;
		if ( this.S.sound && info.zone !== 'head' ) this._voice( 1 );
		if ( ! this.water ) this.game.fx?.bloodPool?.( this.pos, this.S.size );
	}

	_dead( dt ) {
		if ( this.type === 'animal' ) this.type = 'corpse'; // after the kill was counted
		this.deadT += dt;
		const k = smooth( clamp( this.deadT / 0.7, 0, 1 ) );
		if ( this.water ) {
			// a dead shark rolls belly up and floats
			const w = this.game.physics.waterLevel( this.pos.x, this.pos.z );
			this.pos.y += ( w - 0.25 - this.pos.y ) * Math.min( 1, dt * 0.5 );
		}
		if ( this.deadT < 1.2 || this._lastK !== k ) { this._lastK = k; this._pose( dt, k ); }
		if ( this.deadT > 600 || ( this.deadT > 30 && this.pos.distanceTo( this.mgr.pi.pos ) > 220 ) ) this.game.entities.remove( this );
	}

	// ---- body and gait -----------------------------------------------------------------------------------------

	_animate( dt ) {
		const d = this.mgr.camPos.distanceTo( this.pos );
		this.a.mesh.visible = d < 190;
		const every = d < 40 ? 1 : d < 90 ? 2 : 4;
		this.animAcc = ( this.animAcc || 0 ) + dt;
		if ( ( this.mgr.frame + this.id ) % every ) return;
		this._pose( this.animAcc );
		this.animAcc = 0;
		this.a.mesh.castShadow = d < 60;
	}

	_pose( dt, deadK = 0 ) {
		const S = this.S, b = this.a.bone, m = this.a.mesh;
		const sc = this.scaleK;
		// root: position, yaw, and the roll onto the side when dead
		let ox = 0, oy = 0;
		m.position.copy( this.pos );
		if ( deadK > 0 ) {
			const th = this.water ? Math.PI * deadK : Math.PI / 2 * deadK * this.rollDir;
			const by = S.by * sc, rx = S.girth * sc;
			ox = by * Math.sin( th ); oy = this.water ? 0 : ( rx - by ) * Math.abs( Math.sin( th ) ) + by - by * Math.cos( th );
			_e.set( 0, this.yaw, 0 ); _q.setFromEuler( _e );
			m.quaternion.copy( _q ).multiply( _q2.setFromAxisAngle( _v.set( 0, 0, 1 ), th ) );
			_v.set( this.water ? 0 : ox, oy, 0 ).applyQuaternion( _q );
			m.position.add( _v );
			if ( this.water ) m.position.y = this.pos.y;
			// legs go stiff
			const lg = this.legs;
			for ( let i = 0; i < 4; i ++ ) { if ( lg[ i * 3 ] ) lg[ i * 3 ].rotation.x = ( i < 2 ? - 0.35 : 0.35 ) * deadK; if ( lg[ i * 3 + 1 ] ) lg[ i * 3 + 1 ].rotation.x = 0; }
			if ( b.neck ) b.neck.rotation.x = 0.3 * deadK;
			return;
		}
		m.rotation.set( 0, this.yaw, 0 );
		const v = this.speed;
		if ( this.species === 'shark' ) { this._sharkPose( dt ); return; }
		if ( this.species === 'turtle' ) { this._turtlePose( dt ); return; }
		if ( S.bird ) { this._birdPose( dt ); return; }
		// quadruped gait: walk, trot or gallop by speed, legs phased, stride matched to the ground speed
		const gait = v < 1.6 ? GAITS.walk : v < S.run * 0.55 ? GAITS.trot : GAITS.gallop;
		const stride = S.leg * sc * gait.stride;
		this.phase = ( this.phase + dt * v / stride ) % 1;
		const moving = clamp( v / 0.3, 0, 1 );
		const lg = this.legs;
		for ( let i = 0; i < 4; i ++ ) {
			const up = lg[ i * 3 ], lo = lg[ i * 3 + 1 ], ft = lg[ i * 3 + 2 ];
			if ( ! up ) continue;
			const s = ( this.phase + gait.off[ i ] ) % 1;
			let ang, flex;
			if ( s < gait.duty ) { const t = s / gait.duty; ang = gait.amp * ( 1 - 2 * t ); flex = 0; }
			else { const t = ( s - gait.duty ) / ( 1 - gait.duty ); ang = - gait.amp + 2 * gait.amp * smooth( t ); flex = Math.sin( t * Math.PI ) * gait.flex; }
			up.rotation.x = ang * moving;
			lo.rotation.x = - flex * moving * ( i < 2 ? 1 : 0.8 );
			if ( ft ) ft.rotation.x = flex * moving * 0.5;
		}
		// body bob and pitch, head nod; grazing lowers the neck, alarm raises it
		const bob = Math.abs( Math.sin( this.phase * TAU * 2 ) ) * gait.bob * moving;
		b.body.position.y = b.body.userData.y0 ?? ( b.body.userData.y0 = b.body.position.y );
		b.body.position.y = b.body.userData.y0 - bob;
		b.body.rotation.x = gait === GAITS.gallop ? Math.sin( this.phase * TAU ) * 0.07 : 0;
		const grazing = this.state === 'graze' && ! this.alert;
		this.graze += ( ( grazing ? 1 : 0 ) - this.graze ) * Math.min( 1, dt * 1.5 );
		const nod = Math.sin( this.phase * TAU * 2 ) * 0.05 * moving;
		const look = Math.sin( this.t * 0.4 + this.id ) * 0.4 * ( 1 - moving ) * ( 1 - this.graze );
		b.neck.rotation.set( this.graze * 0.95 - this.alert * 0.25 + nod, look * 0.5, 0 );
		b.head.rotation.set( this.graze * 0.45 + Math.sin( this.t * 4 ) * 0.04 * this.graze, look * 0.5, 0 );
		if ( b.tail ) b.tail.rotation.set( 0.2 * moving, Math.sin( this.t * ( 3 + moving * 4 ) ) * ( 0.25 + 0.2 * ( 1 - moving ) ), 0 );
		if ( this.flinch ) { this.flinch = Math.max( 0, this.flinch - dt * 4 ); b.chest.rotation.z = Math.sin( this.flinch * 12 ) * 0.1 * this.flinch; }
		void ox;
	}

	_birdPose( dt ) {
		const b = this.a.bone, v = this.speed, S = this.S;
		const stride = S.leg * this.scaleK * 1.7;
		this.phase = ( this.phase + dt * v / stride ) % 1;
		const moving = clamp( v / 0.2, 0, 1 );
		const s = Math.sin( this.phase * TAU );
		b.LL1.rotation.x = s * 0.6 * moving; b.LR1.rotation.x = - s * 0.6 * moving;
		b.LL2.rotation.x = - Math.max( 0, - s ) * 0.8 * moving; b.LR2.rotation.x = - Math.max( 0, s ) * 0.8 * moving;
		b.body.position.y = ( b.body.userData.y0 ?? ( b.body.userData.y0 = b.body.position.y ) ) - Math.abs( s ) * 0.01 * moving;
		// chickens bob the head forward and back; pecking when idle
		const peck = this.state === 'graze' ? Math.max( 0, Math.sin( this.t * 2.3 + this.id ) ) : 0;
		const bob = this.species === 'chicken' ? ( ( this.phase * 2 ) % 1 < 0.5 ? 0.25 : - 0.1 ) * moving : Math.sin( this.phase * TAU * 2 ) * 0.08 * moving;
		b.neck.rotation.x = bob + peck * 1.1 - ( this.alert ? 0.2 : 0 );
		b.head.rotation.x = peck * 0.5;
		// wings flap when running
		const flap = this.state === 'flee' && v > 1.5 ? Math.sin( this.t * 28 ) * 0.9 : 0;
		b.WL.rotation.z = - Math.max( 0, flap ) - 0.02; b.WR.rotation.z = Math.max( 0, flap ) + 0.02;
		b.tail.rotation.x = Math.sin( this.t * 1.3 ) * 0.1;
	}

	_sharkPose( dt ) {
		const b = this.a.bone;
		const f = 0.6 + this.speed * 0.35;
		this.phase += dt * f;
		for ( let i = 0; i < 5; i ++ ) {
			const bn = b[ 'b' + i ];
			if ( bn ) bn.rotation.y = Math.sin( this.phase * TAU - i * 0.9 ) * ( 0.03 + i * 0.07 ) * ( i === 0 ? 0.5 : 1 );
		}
	}

	_turtlePose( dt ) {
		const b = this.a.bone;
		const v = this.speed;
		this.phase += dt * ( this.inWater ? 0.5 : 0.7 + v * 3 );
		const s = Math.sin( this.phase * TAU );
		if ( this.inWater ) {
			// flying through the water: the front flippers sweep together
			b.FL.rotation.set( 0, 0, - s * 0.6 ); b.FR.rotation.set( 0, 0, s * 0.6 );
			b.HL.rotation.set( 0, s * 0.2, 0 ); b.HR.rotation.set( 0, - s * 0.2, 0 );
		} else {
			// on sand both front flippers dig and haul; mostly still when basking
			const k = clamp( v / 0.1, 0, 1 );
			b.FL.rotation.set( 0, s * 0.5 * k, 0 ); b.FR.rotation.set( 0, - s * 0.5 * k, 0 );
			b.HL.rotation.set( 0, 0, 0 ); b.HR.rotation.set( 0, 0, 0 );
		}
		b.head.rotation.x = Math.sin( this.t * 0.3 ) * 0.1;
	}

	_voice( vol = 0.7 ) {
		const S = this.S;
		if ( ! S.sound ) return;
		const d = this.mgr.camPos.distanceTo( this.pos );
		if ( d > 60 ) return;
		this.game.audio?.play( S.sound, { pos: _v.set( this.pos.x, this.pos.y + this.height, this.pos.z ), vol, max: 60, ref: 3, rate: ( this.male ? 0.9 : 1.1 ) * ( 0.95 + rnd() * 0.1 ) } );
	}

	_sounds( dt ) {
		this.soundT -= dt;
		if ( this.soundT > 0 ) return;
		this.soundT = 6 + rnd() * 18;
		if ( this.state !== 'flee' && this.species !== 'shark' && this.species !== 'turtle' ) this._voice( 0.55 );
	}

	// ---- hits and carcasses ----------------------------------------------------------------------------------------

	hitTest( o, d, maxT ) {
		const S = this.S, sc = this.scaleK;
		const L = S.L * sc;
		if ( raySphere( o, d, this.pos, L * 0.8 + 0.4, maxT ) === null && this.pos.distanceToSquared( o ) > 4 ) return null;
		const fx = - Math.sin( this.yaw ), fz = - Math.cos( this.yaw );
		const y = this.pos.y + ( this.water ? 0 : S.by * sc );
		_a.set( this.pos.x - fx * L * 0.5, y, this.pos.z - fz * L * 0.5 );
		_b.set( this.pos.x + fx * L * 0.5, y, this.pos.z + fz * L * 0.5 );
		let best = null;
		const t0 = rayCapsule( o, d, _a, _b, S.girth * sc * 1.05, maxT );
		if ( t0 !== null ) best = { t: t0, zone: 'torso' };
		const hb = this.a.bone.head;
		if ( hb ) {
			hb.getWorldPosition( _v3 );
			const th = raySphere( o, d, _v3, Math.max( 0.06, S.girth * 0.55 ) * sc, best ? best.t : maxT );
			if ( th !== null ) best = { t: th, zone: 'head' };
		}
		return best;
	}

	centre( out ) {
		if ( this.water ) return out.copy( this.pos );
		const m = this.a.mesh;
		return out.set( m.position.x, m.position.y + this.S.girth * this.scaleK, m.position.z );
	}

	butcherPrompt( t ) {
		const g = this.game;
		const blade = g.player.inventory.hasTool( 'skin' ) || g.player.inventory.hasTool( 'cut' );
		// one prompt object, kept (the provider runs every frame)
		const p = this._prompt || ( this._prompt = { id: 'ab' + this.id, t: 0, label: 'Butcher', sub: '', owner: this, noOcclusion: true, action: null } );
		p.t = t;
		p.sub = blade ? cap( this.S.name ) : 'Needs a knife';
		p.action = blade ? this._butcherFn || ( this._butcherFn = () => this.butcher() ) : this._noBladeFn || ( this._noBladeFn = () => g.toast( 'Needs a knife', 'warn' ) );
		return p;
	}

	butcher() {
		const g = this.game;
		const at = this.centre( new THREE.Vector3() );
		g.actions.start( {
			label: 'Butchering', time: this.S.time * ( 0.8 + this.scaleK * 0.2 ), sound: 'hit_blade',
			onDone: () => {
				if ( this.removed ) return;
				for ( const [ ids, a, b ] of this.S.yields ) {
					const id = ids.find( i => getItem( i ) );
					if ( ! id ) continue;
					let n = a + Math.floor( rnd() * ( b - a + 1 ) );
					const def = getItem( id );
					while ( n > 0 ) {
						const q = Math.min( n, def.stack || 1 );
						n -= q;
						const st = makeStack( id, q );
						if ( ! st ) break;
						const p = new THREE.Vector3( at.x + ( rnd() - 0.5 ) * 0.8, at.y + 0.3, at.z + ( rnd() - 0.5 ) * 0.8 );
						if ( g.items3d?.spawn ) g.items3d.spawn( st, p, { persistent: true, settle: true } );
						else { const left = g.player.inventory.add( st ); if ( left > 0 ) g.dropStack( st ); }
					}
				}
				g.fx?.blood?.( at, _v.set( 0, 1, 0 ), 1.5 );
				g.fx?.bloodPool?.( at, this.S.size * 1.2 );
				g.audio?.play( 'hit_flesh', { pos: at, vol: 0.6 } );
				g.entities.remove( this );
			},
		} );
	}

	dispose() {
		if ( this.a ) {
			this.a.mesh.removeFromParent();
			this.a.mat.dispose();
			this.a.mesh.skeleton.dispose();
			this.a = null;
		}
		this.object = null;
	}
}
const _q2 = new THREE.Quaternion();

// ---- the manager: where each species lives, spawning herds, sharks, sounds --------------------------------------------

export class Animals {
	constructor( game, mgr ) {
		this.game = game;
		this.mgr = mgr;
		this.list = [];
		this.spawnT = 2;
		this.sharkT = 20;
		this.soundsReady = false;
	}

	count() { let n = 0; for ( const a of this.list ) if ( a.alive ) n ++; return n; }

	// habitat weights at a spot: which animals would be here
	habitat( x, z, out ) {
		const g = this.game, hf = g.hf;
		for ( const k in out ) out[ k ] = 0;
		const h = hf.baseHeight( x, z );
		const isl = hf.islandAt( x, z );
		const dens = this.mgr.pop.density( x, z );
		if ( h < - 0.8 ) {
			if ( h > - 8 && h < - 0.8 ) out.turtle = 0.3;
			return out;
		}
		const s = hf.surfaceAt( x, z, _s4 );
		const moist = s[ 0 ], lava = s[ 1 ], use = s[ 3 ];
		const ny = hf.normalAt( x, z, _v, 2 ).y;
		const wild = dens < 0.12;
		if ( g.world.isBeach?.( x, z ) && h < 3 ) out.turtle = 0.9;
		if ( isl === 2 && h > 1 && dens < 0.9 ) out.chicken = 2.5; // Kaua'i: feral chickens everywhere
		else if ( dens > 0.03 && dens < 0.3 ) out.chicken = 0.35;
		if ( lava > 0.5 && h > 800 ) return out;
		if ( use === 3 && dens < 0.2 ) out.cow = 5;
		if ( wild && moist > 0.42 && h > 15 && isl !== 1 && isl !== 7 ) out.boar = 2.2;
		if ( wild && moist < 0.5 && ( ny < 0.95 || lava > 0.2 ) && [ 8, 6, 7, 5, 2, 4 ].includes( isl ) && h > 30 ) out.goat = 1.6;
		if ( wild && [ 6, 5, 4 ].includes( isl ) && moist < 0.75 && h > 10 && ny > 0.85 ) out.deer = 2.6;
		if ( dens < 0.3 && [ 8, 6, 2 ].includes( isl ) && moist > 0.2 && moist < 0.75 && h > 5 && ny > 0.9 ) out.nene = 0.9;
		return out;
	}

	update( dt ) {
		const g = this.game, mgr = this.mgr;
		this._sounds();
		for ( let i = this.list.length - 1; i >= 0; i -- ) if ( this.list[ i ].removed ) this.list.splice( i, 1 );
		this.spawnT -= dt;
		if ( this.spawnT <= 0 ) {
			this.spawnT = 1.5;
			const p = g.player.pos;
			// despawn far ones
			for ( const a of this.list ) if ( a.alive && a.pos.distanceTo( p ) > 240 ) g.entities.remove( a );
			// how many animals the land around supports
			let w = 0;
			for ( let k = 0; k < 8; k ++ ) {
				const ang = k / 8 * TAU;
				const hb = this.habitat( p.x + Math.cos( ang ) * 100, p.z + Math.sin( ang ) * 100, _hab );
				for ( const s in hb ) if ( s !== 'turtle' || k % 2 === 0 ) w += hb[ s ];
			}
			const target = Math.min( 22, Math.round( w * 1.1 ) );
			let alive = 0;
			for ( const a of this.list ) if ( a.alive && a.species !== 'shark' ) alive ++;
			if ( alive < target && ! mgr.first ) this._spawnGroup();
		}
		// sharks find swimmers in deep water
		this.sharkT -= dt;
		if ( this.sharkT <= 0 ) {
			this.sharkT = 10;
			const P = g.player;
			const sharks = this.list.filter( a => a.species === 'shark' && a.alive ).length;
			if ( P.swimming && sharks < 2 && g.hf.heightAt( P.pos.x, P.pos.z ) < - 5 && rnd() < 0.12 + mgr.night * 0.1 ) {
				const a = rnd() * TAU;
				const x = P.pos.x + Math.cos( a ) * 45, z = P.pos.z + Math.sin( a ) * 45;
				if ( g.hf.heightAt( x, z ) < - 4 ) this.spawn( 'shark', new THREE.Vector3( x, g.physics.waterLevel( x, z ) - 3, z ) );
			}
		}
	}

	_spawnGroup() {
		const g = this.game, mgr = this.mgr, p = g.player.pos;
		for ( let tries = 0; tries < 6; tries ++ ) {
			const a = rnd() * TAU, r = 60 + rnd() * 90;
			const x = p.x + Math.cos( a ) * r, z = p.z + Math.sin( a ) * r;
			const hb = this.habitat( x, z, _hab );
			let tot = 0;
			for ( const s in hb ) tot += hb[ s ];
			if ( tot <= 0 ) continue;
			let pick = rnd() * tot, sp = null;
			for ( const s in hb ) { pick -= hb[ s ]; if ( pick <= 0 ) { sp = s; break; } }
			if ( ! sp ) continue;
			const S = SPECIES[ sp ];
			const n = S.group[ 0 ] + Math.floor( rnd() * ( S.group[ 1 ] - S.group[ 0 ] + 1 ) );
			const centre = new THREE.Vector3( x, 0, z );
			let made = 0;
			for ( let i = 0; i < n; i ++ ) {
				const px = x + ( rnd() - 0.5 ) * 8, pz = z + ( rnd() - 0.5 ) * 8;
				const h = g.hf.heightAt( px, pz );
				if ( sp !== 'turtle' && h < 0.2 ) continue;
				const y = sp === 'turtle' && h < 0 ? Math.max( h + 0.1, g.physics.waterLevel( px, pz ) - 0.6 ) : g.physics.ground( px, pz, h + 20, 0.45, 0.2 ).y;
				const pos = new THREE.Vector3( px, y, pz );
				if ( mgr._inView( pos ) ) continue;
				this.spawn( sp, pos, { herd: centre } );
				made ++;
			}
			if ( made ) return true;
		}
		return false;
	}

	spawn( species, pos, o = {} ) {
		if ( ! SPECIES[ species ] ) return null;
		const a = new Animal( this.game, this.mgr, species, pos, o );
		this.game.entities.add( a );
		this.list.push( a );
		return a;
	}

	// the nearest point at least 4 m deep within r of p (a ring search), or null
	deepWater( p, r ) {
		const hf = this.game.hf;
		if ( hf.heightAt( p.x, p.z ) < - 4 ) return p;
		for ( let d = 6; d <= r; d += 6 ) {
			const n = Math.ceil( d * 0.8 );
			for ( let k = 0; k < n; k ++ ) {
				const a = k / n * TAU, x = p.x + Math.cos( a ) * d, z = p.z + Math.sin( a ) * d;
				if ( hf.heightAt( x, z ) < - 4 ) return new THREE.Vector3( x, 0, z );
			}
		}
		return null;
	}

	onNoise( e ) {
		if ( e.kind !== 'gunshot' && e.kind !== 'explosion' && e.kind !== 'step' ) return;
		for ( const a of this.list ) {
			if ( ! a.alive || a.water ) continue;
			const d = a.pos.distanceTo( e.pos );
			const r = e.kind === 'step' ? e.radius * 0.8 : Math.min( 220, e.radius * 0.8 );
			if ( d > r ) continue;
			if ( a.species === 'boar' && a.aggressive && d < 20 ) { a._set( 'charge' ); continue; }
			if ( a.species === 'turtle' || a.species === 'cow' && e.kind === 'step' ) continue;
			a._scare( e.pos ); a._set( 'flee' );
		}
	}

	// sounds the procedural bank doesn't have: a cow's moo and a nene's honk
	_sounds() {
		const au = this.game.audio;
		if ( this.soundsReady || ! au?.ctx ) return;
		this.soundsReady = true;
		const ctx = au.ctx, sr = ctx.sampleRate;
		const voice = ( dur, f0, f1, formants, bw, noise = 0.03 ) => {
			const n = Math.floor( dur * sr ), buf = ctx.createBuffer( 1, n, sr ), d = buf.getChannelData( 0 );
			let ph = 0;
			for ( let i = 0; i < n; i ++ ) {
				const t = i / n, f = f0 + ( f1 - f0 ) * t + Math.sin( i / sr * 30 ) * f0 * 0.01;
				ph += f / sr;
				let s = 0;
				for ( let k = 1; k * f < 4000; k ++ ) {
					let a = 0.02;
					for ( let j = 0; j < formants.length; j ++ ) a += Math.exp( - Math.pow( ( k * f - formants[ j ] ) / bw[ j ], 2 ) ) / ( j + 1 );
					s += Math.sin( ph * TAU * k ) * a / Math.sqrt( k );
				}
				const env = Math.min( 1, t / 0.12 ) * Math.min( 1, ( 1 - t ) / 0.3 );
				d[ i ] = ( s * 0.35 + ( Math.random() - 0.5 ) * noise ) * env;
			}
			let mx = 0; for ( let i = 0; i < n; i ++ ) mx = Math.max( mx, Math.abs( d[ i ] ) );
			for ( let i = 0; i < n; i ++ ) d[ i ] *= 0.7 / ( mx || 1 );
			return buf;
		};
		try {
			if ( ! au.buffers.has( 'moo' ) ) au.buffers.set( 'moo', voice( 1.5, 128, 104, [ 320, 760 ], [ 120, 220 ], 0.02 ) );
			if ( ! au.buffers.has( 'honk' ) ) au.buffers.set( 'honk', voice( 0.28, 440, 390, [ 900, 1900 ], [ 250, 400 ], 0.05 ) );
		} catch ( e ) { console.warn( 'animal sounds', e ); }
	}

	registerSpawnables( S ) {
		const g = this.game;
		const mk = ( sp, desc, o = {} ) => ( { desc, spawn: ( pos, opts = {} ) => {
			if ( sp === 'shark' ) {
				// only in deep water: the nearest spot at least 4 m deep within 80 m, else none
				const at = this.deepWater( pos, 80 );
				if ( ! at ) { g.toast?.( 'Needs deep water', 'warn' ); return null; }
				pos.set( at.x, g.physics.waterLevel( at.x, at.z ) - 1.5, at.z );
			} else if ( sp === 'turtle' ) {
				const h = g.hf.heightAt( pos.x, pos.z );
				if ( h < - 0.5 ) pos.y = g.physics.waterLevel( pos.x, pos.z ) - 0.6;
			}
			return this.spawn( sp, pos, { yaw: opts.yaw, ...o } );
		} } );
		S.boar = mk( 'boar', 'Feral pig' );
		S.chicken = mk( 'chicken', 'Feral chicken' );
		S.goat = mk( 'goat', 'Feral goat' );
		S.deer = mk( 'deer', 'Axis deer' );
		S.cow = mk( 'cow', 'Cattle' );
		S.nene = mk( 'nene', 'Nene (Hawaiian goose)' );
		S.shark = { ...mk( 'shark', 'Tiger shark (deep water)' ), distance: 8 };
		S.turtle = mk( 'turtle', 'Green sea turtle' );
	}

	dispose() {
		for ( const a of this.list ) a.dispose();
		this.list.length = 0;
	}
}

const _s4 = [ 0, 0, 0, 0 ];
const _hab = {};
