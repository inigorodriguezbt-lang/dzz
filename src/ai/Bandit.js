// Bandits: small armed groups of survivors near towns and roads. They patrol, react to gunshots, and when
// they see you they spread out, shoot in bursts that get less accurate with distance and while moving,
// shift between spots that break your line of sight, reload, and turn their guns on the infected that come
// for them. Killed, they leave a searchable body with their weapon, ammunition and whatever they carried.
import * as THREE from 'three';
import { Entity, rayCylinder, raySphere } from '../game/Entities.js';
import { HumanBody } from './Body.js';
import { Mover, steer, move, stuckCheck } from './Steer.js';
import { avatarsFor } from './Characters.js';
import { ITEMS, getItem, makeStack } from '../game/items/ItemDB.js';
import { rollLoot } from '../game/items/Loot.js';

const rnd = Math.random;
const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );
const pick = ( a ) => a[ Math.floor( rnd() * a.length ) ];
const CIV_GUNS = [ 'akm', 'ar15_civ', 'remington_870', 'mossberg_500', 'mini14', 'sks', 'lever_3030', 'glock17', 'm1911', 'revolver_357', 'double_barrel', 'cz527' ];
const MIL_GUNS = [ 'm4a1', 'm16a4', 'ak74', 'hk416', 'm249', 'scar_l' ];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _eye = new THREE.Vector3(), _tgt = new THREE.Vector3();
const _m = new THREE.Matrix4(), _z = new THREE.Vector3(), _nb = [], _boxes = [];
let GunModels = null;
import( '../weapons/GunModels.js' ).then( m => { GunModels = m; } ).catch( () => {} );

// ammunition that fits a firearm
function ammoFor( def ) {
	const cal = def?.firearm?.caliber;
	if ( ! cal ) return null;
	for ( const d of ITEMS.values() ) if ( d.cat === 'ammo' && d.ammo?.caliber === cal ) return d.id;
	return null;
}

export class Bandit extends Entity {
	constructor( game, mgr, t, pos, o = {} ) {
		super( game, 'npc' );
		this.mgr = mgr;
		this.group = o.group || null;
		this.avatar = t.id;
		this.pos.copy( pos );
		this.yaw = o.yaw ?? rnd() * Math.PI * 2;
		this.radius = 0.32;
		this.maxHealth = this.health = o.mil ? 130 : 100;
		const inst = this.inst = mgr.mgr.lib.acquire( t );
		inst.scale = 0.95 + rnd() * 0.1;
		this.height = t.height * inst.scale;
		// alive: no infection, a little grime
		inst.setLook( { infect: 0, rot: 0, hue: ( rnd() - 0.5 ) * 0.2, dirt: 0.2 + rnd() * 0.25, blood: 0.05, mouthBlood: 0, handBlood: 0.05, seed: rnd() * 100, tint: _c.setRGB( 0.85 + rnd() * 0.15, 0.85 + rnd() * 0.15, 0.85 + rnd() * 0.15 ) } );
		this.object = inst.root;
		this.body = new HumanBody( inst, { idle: 'idle', walk: 'walk', run: 'run', hunch: 0.02, tilt: 0, twitch: 0, arms: 'rifle' } );
		this.body.yaw = this.yaw;
		this.mover = new Mover( 0.3, 1.75 );
		// the gun
		const ids = ( o.mil ? MIL_GUNS : CIV_GUNS ).filter( id => getItem( id )?.firearm );
		this.weapon = o.weapon && getItem( o.weapon ) ? o.weapon : ids.length ? pick( ids ) : null;
		const wd = getItem( this.weapon );
		const f = wd?.firearm || {};
		this.fire = { rpm: f.rpm || 300, auto: ( f.modes || [] ).includes( 'auto' ), cap: f.capacity || this.magCap( wd ), reload: ( f.reload || 2.5 ) * 1.2, pellets: f.pellets || 1, range: f.range || 80 };
		this.rounds = this.fire.cap;
		this.shotT = 0; this.burst = 0; this.burstT = 1; this.sightT = 0; this.seenPrev = false;
		this.gun = null;
		// state
		this.state = 'patrol';
		this.stateT = 0;
		this.goal = new THREE.Vector3().copy( pos );
		this.home = new THREE.Vector3().copy( o.home || pos );
		this.wantV = 0; this.speed = 0;
		this.target = null;
		this.lastSeen = new THREE.Vector3(); this.lastSeenT = - 1e9;
		this.thinkT = rnd() * 0.3;
		this.stuckT = 1;
		this.moveT = 0;
		this.crouchW = 0;
		this.anim = { acc: 0, slot: Math.floor( rnd() * 8 ) };
		this.corpseT = 0;
		this.items = null;
		this.mil = !! o.mil;
		inst.place( this.pos, this.yaw );
	}

	get label() { return 'Bandit'; }
	magCap( wd ) { const m = wd?.firearm?.mags?.[ 0 ]; return getItem( m )?.magazine?.capacity || 8; }

	update( dt ) {
		if ( ! this.inst ) return;
		if ( ! this.alive ) { this._dead( dt ); return; }
		this.thinkT -= dt;
		if ( this.thinkT <= 0 ) { this.thinkT = 0.2 + rnd() * 0.1; this._think( 0.25 ); }
		this.stuckT -= dt;
		if ( this.stuckT <= 0 ) { this.stuckT = 1; stuckCheck( this, this.mover, this.wantV > 0.3 ); }
		this.speed += ( this.wantV - this.speed ) * Math.min( 1, dt * 4 );
		if ( this.speed > 0.05 || ! this.mover.onGround ) move( this.game, this, this.mover, dt, this.speed, 4 );
		else if ( this.facing !== undefined ) this.yaw = wrap( this.yaw + clamp( wrap( this.facing - this.yaw ), - 4 * dt, 4 * dt ) );
		this._shoot( dt );
		this._animate( dt );
	}

	_think( dt ) {
		const g = this.game, M = this.mgr.mgr, pi = M.pi;
		this.stateT += dt;
		// threats: the player (sight), the infected close by
		let seen = null;
		if ( pi.alive ) {
			const d = this.pos.distanceTo( pi.pos );
			const range = ( 95 - 60 * M.night ) * pi.visibility;
			if ( d < range ) {
				const fx = - Math.sin( this.yaw ), fz = - Math.cos( this.yaw );
				const dx = pi.pos.x - this.pos.x, dz = pi.pos.z - this.pos.z;
				const cos = ( dx * fx + dz * fz ) / ( Math.hypot( dx, dz ) || 1 );
				if ( cos > 0.1 || d < 6 || this.state === 'combat' ) {
					_eye.set( this.pos.x, this.pos.y + 1.6, this.pos.z );
					if ( g.physics.lineOfSight( _eye, pi.chest ) && ! g.fx?.smokeBlocks?.( _eye, pi.chest ) ) seen = pi.entity;
				}
			}
		}
		let z = null, zd = 28;
		for ( const e of g.entities.near( this.pos, 28, 'zombie', _nb ) ) {
			if ( ! e.alive ) continue;
			const d = e.pos.distanceTo( this.pos );
			if ( d < zd && ( e.target === this || d < 14 ) ) { zd = d; z = e; }
		}
		if ( z && ( ! seen || zd < 10 ) ) seen = z;
		if ( seen && ( ! this.seenPrev || this.target !== seen ) ) this.sightT = M.time;
		this.seenPrev = !! seen;
		if ( seen ) {
			if ( this.state !== 'combat' ) this._alertGroup( seen );
			this.target = seen;
			this.lastSeen.copy( seen === pi.entity ? pi.pos : seen.pos );
			this.lastSeenT = M.time;
			this.state = 'combat';
		}
		if ( this.state === 'combat' ) return this._combat( seen );
		if ( this.state === 'alert' ) {
			// face the noise, crouch, wait
			this.wantV = 0; this.crouchW = 1;
			this.facing = Math.atan2( - ( this.goal.x - this.pos.x ), - ( this.goal.z - this.pos.z ) );
			if ( this.stateT > 12 ) { this.state = 'patrol'; this.stateT = 0; }
			return;
		}
		// patrol around home
		this.crouchW = 0;
		const d = steer( g, this, this.mover, this.goal.x, this.goal.z, dt, g.entities.near( this.pos, 1.5, 'npc', _nb ) );
		this.wantV = d > 1.2 ? 1.2 : 0;
		if ( d <= 1.2 && rnd() < 0.05 ) {
			const a = rnd() * Math.PI * 2, r = 5 + rnd() * 20;
			this.goal.set( this.home.x + Math.cos( a ) * r, 0, this.home.z + Math.sin( a ) * r );
		}
	}

	_alertGroup( t ) {
		for ( const b of this.mgr.list ) if ( b !== this && b.alive && b.group === this.group && b.state !== 'combat' ) { b.target = t; b.state = 'combat'; b.stateT = 0; b.lastSeen.copy( t.pos ); b.lastSeenT = this.mgr.mgr.time; }
	}

	hear( pos ) {
		if ( this.state === 'combat' || ! this.alive ) return;
		this.goal.copy( pos );
		this.state = 'alert'; this.stateT = 0;
	}

	_combat( seen ) {
		const g = this.game, M = this.mgr.mgr;
		const T = this.target;
		const lost = M.time - this.lastSeenT;
		if ( ! T || ( T !== M.pi.entity && ! T.alive ) || ( T === M.pi.entity && ! M.pi.alive ) || lost > 25 ) { this.target = null; this.state = 'patrol'; this.stateT = 0; this.moving = false; return; }
		const tp = T === M.pi.entity ? M.pi.pos : T.pos;
		const d = this.pos.distanceTo( tp );
		this.facing = Math.atan2( - ( tp.x - this.pos.x ), - ( tp.z - this.pos.z ) );
		this.moveT -= 0.25;
		// reposition when the spot has gone stale, when the target is out of sight (once the gun is ready), or out of range
		const want = this.moveT <= 0 || ( ! seen && lost > 1.5 && ! ( this.reloadT > 0 ) ) || d > this.fire.range * 1.2;
		if ( want && ! this.moving ) {
			this.moveT = 6 + rnd() * 6;
			const spot = this._firingSpot( tp, d );
			if ( spot ) { this.goal.copy( spot.pos ); this.peek = spot.peek; this.moving = true; this.stateT = 0; }
			else if ( ! seen && lost > 6 ) { this.goal.copy( this.lastSeen ); this.peek = false; this.moving = true; this.stateT = 0; }
		}
		if ( this.moving ) {
			const dd = steer( g, this, this.mover, this.goal.x, this.goal.z, 0.25, g.entities.near( this.pos, 1.5, 'npc', _nb ) );
			// a dash between spots; a short shift at a walk
			this.wantV = dd > 6 ? 3.6 : 2.0; this.crouchW = 0;
			if ( dd < 0.8 || this.stateT > 15 ) { this.moving = false; this.stateT = 0; }
		} else {
			this.wantV = 0;
			// behind low cover: duck to reload and between bursts, up to shoot; in the open, kneel at range
			if ( this.peek ) this.crouchW = this.reloadT > 0 || this.burstT > 0.4 ? 1 : 0;
			else this.crouchW = d > 25 && seen ? 1 : 0.3;
			this.mover.dir.set( tp.x - this.pos.x, 0, tp.z - this.pos.z ).normalize();
		}
		this.canShoot = !! seen && d < this.fire.range * 2.2 && ! this.moving;
	}

	// the range this gun is worked at
	_idealRange() {
		const f = this.fire;
		return f.pellets > 1 ? 14 : Math.min( f.range * 0.6, f.rpm > 500 && f.cap > 20 ? 30 : f.cap <= 17 && f.range < 80 ? 20 : 40 );
	}

	// somewhere 4-14 m away to fight from: sees the target when standing, best with low cover in front (up to shoot,
	// down to hide), near the gun's working range. Returns { pos, peek } or null (stay).
	_firingSpot( tp, d ) {
		const g = this.game, P = g.physics;
		const ideal = this._idealRange();
		_tgt.set( tp.x, tp.y + 1.3, tp.z );
		let best = null, bestS = - 1e9;
		const score = ( x, y, z ) => {
			_v.set( x, y + 1.5, z );
			const stand = P.lineOfSight( _v, _tgt );
			_v.set( x, y + 0.8, z );
			const low = stand && P.lineOfSight( _v, _tgt );
			let cover = false;
			for ( const b of P.near( x, z, 1.3, _boxes ) ) if ( b.maxY > y + 0.6 && b.minY < y + 1.2 ) { cover = true; break; }
			const nd = Math.hypot( tp.x - x, tp.z - z );
			return { s: ( stand ? 3 : - 2 ) + ( stand && ! low ? 2 : 0 ) + ( cover ? 1 : 0 ) - Math.abs( nd - ideal ) / 15 - ( nd < 8 ? 3 : 0 ), peek: stand && ! low };
		};
		const here = score( this.pos.x, this.pos.y, this.pos.z );
		bestS = here.s + 0.8; // moving has to be worth it
		for ( let k = 0; k < 10; k ++ ) {
			const a = rnd() * Math.PI * 2, r = 4 + rnd() * 10;
			const x = this.pos.x + Math.cos( a ) * r, z = this.pos.z + Math.sin( a ) * r;
			const y = P.ground( x, z, this.pos.y + 1, 0.45, 0.3 ).y;
			if ( Math.abs( y - this.pos.y ) > 2 || g.hf.heightAt( x, z ) < 0.2 ) continue;
			_v3.set( x, y, z );
			if ( P.resolveCylinder( _v3, 0.3, 1.7, 0.45 ) ) continue; // inside something
			const sc = score( x, y, z );
			const s = sc.s + rnd() * 0.5;
			if ( s > bestS ) { bestS = s; best = { pos: new THREE.Vector3( x, y, z ), peek: sc.peek }; }
		}
		if ( ! best && ! here.peek ) this.peek = false;
		return best;
	}

	// bursts with human inaccuracy: worse far away, on the move and when hurt
	_shoot( dt ) {
		const g = this.game, M = this.mgr.mgr;
		this.shotT -= dt;
		if ( this.reloadT > 0 ) {
			this.reloadT -= dt;
			if ( this.reloadT <= 0 ) { this.rounds = this.fire.cap; g.audio?.play( 'mag_in', { pos: this.pos, vol: 0.5, max: 30 } ); }
			return;
		}
		if ( this.state !== 'combat' || ! this.canShoot || ! this.weapon || this.shotT > 0 ) return;
		const T = this.target;
		if ( ! T ) return;
		const tp = T === M.pi.entity ? M.pi.chest : _tgt.set( T.pos.x, T.pos.y + 1.2, T.pos.z );
		const ang = Math.abs( wrap( this.facing - this.yaw ) );
		if ( ang > 0.25 ) return;
		if ( this.burst <= 0 ) {
			this.burstT -= dt;
			if ( this.burstT > 0 ) return;
			this.burst = this.fire.auto ? 2 + Math.floor( rnd() * 4 ) : 1 + Math.floor( rnd() * 2 );
		}
		if ( this.rounds <= 0 ) {
			this.reloadT = this.fire.reload;
			g.audio?.play( 'mag_out', { pos: this.pos, vol: 0.5, max: 30 } );
			return;
		}
		const origin = _eye.set( this.pos.x, this.pos.y + 1.45 * this.inst.scale * ( this.crouchW > 0.5 ? 0.72 : 1 ), this.pos.z );
		const dir = _v.subVectors( tp, origin );
		const d = dir.length();
		dir.divideScalar( d );
		origin.addScaledVector( dir, 0.6 );
		// human aim: a wide cone that tightens while the target stays in sight, worse far away, hurt, at night,
		// against a crouching or prone target, and on the easier difficulties
		const moving = this.speed > 0.5 ? 0.04 : 0;
		const hurt = ( 1 - this.health / this.maxHealth ) * 0.025;
		const stance = T === M.pi.entity ? ( g.player.stance === 'prone' ? 0.02 : g.player.stance === 'crouch' ? 0.01 : 0 ) : 0;
		const settle = 1 + 1.5 * Math.exp( - ( M.time - this.sightT ) / 1.5 );
		const spread = ( 0.028 + d * 0.0008 + moving + hurt + stance ) * settle * ( 1 + M.night * 0.5 ) / M.diff.attack;
		g.ballistics?.npcShot?.( this, this.weapon, origin.clone(), dir.clone(), { spread } );
		this.rounds --;
		this.burst --;
		this.shotT = 60 / this.fire.rpm * ( this.fire.auto ? 1.1 : 1.6 + rnd() );
		if ( this.burst <= 0 ) this.burstT = 0.6 + rnd() * 1.6;
		this.recoil = 1;
	}

	// ---- damage ------------------------------------------------------------------------------------------------------

	damage( amount, info = {} ) {
		if ( ! this.alive ) {
			if ( info.point && this.body.mode === 'ragdoll' && info.dir ) this.body.ragdollImpulse( info.point, info.dir, Math.min( 6, amount / 10 ) );
			return;
		}
		if ( ( info.kind === 'bullet' || info.kind === 'arrow' ) && info.zone === 'head' ) amount = Math.max( amount, this.health + 1 );
		this.health -= amount;
		if ( info.point ) this.inst.addWound( info.point, 0.03 );
		const src = info.source;
		if ( src && src !== this && ( src === this.game.player || src.alive ) ) {
			const t = src === this.game.player ? this.mgr.mgr.pi.entity : src;
			this.target = t; this.lastSeen.copy( src.pos ); this.lastSeenT = this.mgr.mgr.time;
			if ( this.state !== 'combat' ) this._alertGroup( t );
			this.state = 'combat';
			this.moveT = Math.min( this.moveT, 0.5 );
		}
		if ( this.health <= 0 ) { this.health = 0; this.alive = false; this.die( info ); return; }
		this.body.flinch( info.dir || _v.set( 0, 0, 1 ), clamp( amount / 30, 0.3, 1.4 ), info.zone );
	}

	stagger( dir, amount = 1 ) { if ( this.alive ) this.body.flinch( dir, amount ); }
	knockback( dir, s ) { if ( this.alive ) this.body.flinch( dir, Math.min( 2, s / 3 ) ); else if ( this.body.mode === 'ragdoll' ) this.body.ragdollImpulse( this.body.ragdollCentre( _v2 ), dir, s ); }

	die( info = {} ) {
		this.state = 'dead';
		this.noHit = true;
		const dir = info.dir || _v.set( 0, 0, 1 );
		const s = info.kind === 'explosion' ? 7 : info.kind === 'vehicle' ? 8 : 1.8;
		this.body.ragdoll( this.game.physics, this.vel, { point: info.point || _v2.set( this.pos.x, this.pos.y + 1.2, this.pos.z ), dir: _v3.copy( dir ).normalize(), strength: s } );
		this.game.audio?.play( 'death', { pos: _v.set( this.pos.x, this.pos.y + 1.5, this.pos.z ), vol: 0.7, max: 40, rate: 0.85 } );
		if ( this.gun ) { this.gun.removeFromParent(); this.gun = null; }
	}

	_dead( dt ) {
		if ( this.type === 'npc' ) this.type = 'corpse';
		this.corpseT += dt;
		const body = this.body;
		if ( body.mode === 'ragdoll' && ( ! body.asleep || ! body._posedAsleep ) ) { body.update( dt ); body.ragdollCentre( this.pos ); }
		if ( this.corpseT > 900 || ( this.corpseT > 60 && this.pos.distanceTo( this.game.player.pos ) > 250 ) ) this.game.entities.remove( this );
	}

	// what the body gives up: the gun (a few rounds in it), spare ammunition, pockets
	lootItems() {
		const out = [];
		const wd = getItem( this.weapon );
		if ( wd ) {
			const st = makeStack( this.weapon, 1, { loot: true, cond: 0.4 + rnd() * 0.5 } );
			if ( st ) out.push( st );
			const am = ammoFor( wd );
			if ( am ) { const a = makeStack( am, 8 + Math.floor( rnd() * 25 ) ); if ( a ) out.push( a ); }
			const mag = wd.firearm?.mags?.[ 0 ];
			if ( mag && getItem( mag ) && rnd() < 0.5 ) { const m = makeStack( mag, 1, { loot: true } ); if ( m ) out.push( m ); }
		}
		try { out.push( ...rollLoot( this.mil ? 'zombie_military' : 'zombie_civilian' ) ); } catch ( e ) { /* loot tables absent */ }
		return out.filter( Boolean );
	}

	// ---- body, gun, hits ------------------------------------------------------------------------------------------------

	_animate( dt ) {
		const M = this.mgr.mgr, body = this.body;
		const d = M.camPos.distanceTo( this.pos );
		this.distCam = d;
		this.inst.setLOD( d < 26 ? 0 : d < 170 ? 1 : 2, d < 55 );
		body.speed = this.speed;
		body.yaw = this.yaw;
		body.crouch += ( this.crouchW - body.crouch ) * Math.min( 1, dt * 4 );
		const T = this.target;
		if ( T && this.state === 'combat' ) {
			const tp = T === M.pi.entity ? M.pi.chest : T.pos;
			body.look.copy( tp ); body.lookW = 1;
			body.aimPitch = clamp( Math.atan2( tp.y - ( this.pos.y + 1.4 ), Math.hypot( tp.x - this.pos.x, tp.z - this.pos.z ) ), - 0.6, 0.6 );
		} else { body.lookW = 0; body.aimPitch = - 0.35; }
		this.anim.acc += dt;
		const every = d < 40 ? 1 : d < 90 ? 2 : 4;
		if ( ( M.frame + this.anim.slot ) % every ) return;
		this.inst.place( this.pos, this.yaw );
		body.update( this.anim.acc );
		this.anim.acc = 0;
		this._gun( d );
	}

	// the gun rides in the right hand pointing where the body aims
	_gun( d ) {
		if ( ! this.gun && GunModels && this.weapon && d < 120 ) {
			try {
				const v = GunModels.buildGunView( getItem( this.weapon ), 'world' );
				this.gun = v.obj;
				this.gun.traverse( o => { if ( o.isMesh ) { o.castShadow = true; o.receiveShadow = true; } } );
				this.game.scene.add( this.gun );
			} catch ( e ) { this.weapon && console.warn( 'bandit gun', e ); this.gunFailed = true; }
		}
		if ( ! this.gun ) return;
		this.gun.visible = d < 120;
		this.inst.updateWorld();
		this.inst.bonePos( 'rHand', _v );
		const p = this.body.aimPitch - ( this.recoil || 0 ) * 0.05;
		this.recoil = Math.max( 0, ( this.recoil || 0 ) - 0.2 );
		// gun frame: +x muzzle, +y up
		const fx = - Math.sin( this.yaw ), fz = - Math.cos( this.yaw );
		_v2.set( fx * Math.cos( p ), Math.sin( p ), fz * Math.cos( p ) ); // muzzle
		_v3.set( 0, 1, 0 ).addScaledVector( _v2, - Math.sin( p ) ).normalize(); // up
		_z.crossVectors( _v2, _v3 ).normalize();
		_m.makeBasis( _v2, _v3, _z );
		this.gun.quaternion.setFromRotationMatrix( _m );
		this.gun.position.copy( _v ).addScaledVector( _v3, - 0.02 ).addScaledVector( _v2, 0.02 );
	}

	hitTest( o, d, maxT ) {
		if ( ! this.inst ) return null;
		if ( this.body.mode === 'stand' ) { if ( rayCylinder( o, d, this.pos, 0.9, this.height + 0.2, maxT ) === null ) return null; }
		else { this.body.centreOf( _v3 ); if ( raySphere( o, d, _v3, 1.4, maxT ) === null ) return null; }
		return this.body.hitTest( o, d, maxT );
	}

	centre( out ) { return this.body.centreOf( out ); }

	dispose() {
		if ( this.gun ) { this.gun.removeFromParent(); this.gun = null; }
		if ( this.inst ) { this.mgr.mgr.lib.release( this.inst ); this.inst = null; }
		this.object = null;
	}
}
const _c = new THREE.Color();

// ---- spawning groups ----------------------------------------------------------------------------------------------------

export class Bandits {
	constructor( game, mgr ) {
		this.game = game;
		this.mgr = mgr;
		this.list = [];
		this.t = 45 + rnd() * 60;
		this.groupN = 0;
	}

	update( dt ) {
		const g = this.game;
		for ( let i = this.list.length - 1; i >= 0; i -- ) if ( this.list[ i ].removed ) this.list.splice( i, 1 );
		this.t -= dt;
		if ( this.t > 0 ) return;
		this.t = 40 + rnd() * 50;
		const p = g.player.pos;
		for ( const b of this.list ) if ( b.alive && b.pos.distanceTo( p ) > 280 ) g.entities.remove( b );
		const groups = new Set( this.list.filter( b => b.alive ).map( b => b.group ) );
		if ( groups.size >= 1 || rnd() > 0.3 || this.mgr.first ) return;
		// near roads and the edges of towns, not in the thick of the infected
		for ( let k = 0; k < 10; k ++ ) {
			const a = rnd() * Math.PI * 2, r = 110 + rnd() * 60;
			const x = p.x + Math.cos( a ) * r, z = p.z + Math.sin( a ) * r;
			const dens = this.mgr.pop.density( x, z );
			if ( dens < 0.04 || dens > 0.45 ) continue;
			if ( ! ( g.hf.flagsNear( x, z ) & ( 1 | 2 | 4 ) ) ) continue;
			const pos = this.mgr._groundSpot( x, z, p.y );
			if ( ! pos || this.mgr._inView( pos ) ) continue;
			this.spawnGroup( pos, 2 + Math.floor( rnd() * 3 ), { mil: this.mgr.pop.zone( x, z ) === 'military' || rnd() < 0.15 } );
			return;
		}
	}

	// o: { mil, summoned }
	spawnGroup( pos, n, o = {} ) {
		const group = ++ this.groupN;
		const out = [];
		for ( let i = 0; i < n; i ++ ) {
			const a = rnd() * Math.PI * 2, r = i ? 2 + rnd() * 5 : 0;
			const p = new THREE.Vector3( pos.x + Math.cos( a ) * r, 0, pos.z + Math.sin( a ) * r );
			p.y = this.game.physics.ground( p.x, p.z, pos.y + 2, 0.45, 0.3 ).y;
			out.push( this.spawn( p, { group, mil: o.mil, home: pos, summoned: o.summoned } ) );
		}
		return out;
	}

	spawn( pos, o = {} ) {
		const lib = this.mgr.lib;
		const ids = avatarsFor( o.mil ? 'bandit_mil' : 'bandit' );
		const loaded = ids.filter( id => lib.isLoaded( id ) );
		const make = ( t ) => {
			if ( ! t ) return null;
			const b = new Bandit( this.game, this, t, pos, { ...o, group: o.group ?? ++ this.groupN } );
			this.game.entities.add( b );
			this.list.push( b );
			return b;
		};
		if ( loaded.length ) return make( lib.get( pick( loaded ) ) );
		return lib.load( pick( ids ) ).then( make );
	}

	onNoise( e ) {
		if ( e.kind !== 'gunshot' && e.kind !== 'explosion' ) return;
		for ( const b of this.list ) {
			if ( ! b.alive || e.source === b ) continue;
			if ( b.pos.distanceTo( e.pos ) < Math.min( 250, e.radius ) ) b.hear( e.pos );
		}
	}

	registerSpawnables( S ) {
		S.bandit = { desc: 'Armed bandit', distance: 12, spawn: ( pos, o = {} ) => this.spawn( pos, { yaw: o.yaw, summoned: true } ) };
		S.bandit_group = { desc: 'A group of 3 bandits', distance: 25, spawn: ( pos ) => this.spawnGroup( pos, 3, { summoned: true } ) };
	}

	dispose() { for ( const b of this.list ) b.dispose(); this.list.length = 0; }
}

