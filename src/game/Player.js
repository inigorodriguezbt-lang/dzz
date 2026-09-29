// First-person survivor: movement (walk, jog, sprint, crouch, prone, lean, jump / vault, swim, dive,
// creative flight), the camera (head bob, lean, recoil and shake), footsteps and movement noise.
// Survival stats live in Survival.js; held items in Hands.js.
import * as THREE from 'three';
import { PlayerInventory } from './Inventory.js';

export const STANCE = {
	stand: { h: 1.8, eye: 1.66, speed: 4.3, sprint: 6.6, noise: 14 },
	crouch: { h: 1.2, eye: 1.08, speed: 2.1, sprint: 3.0, noise: 5 },
	prone: { h: 0.55, eye: 0.34, speed: 0.85, sprint: 0.85, noise: 2 },
};
const GRAVITY = 20;
const R = 0.3;

export class Player {
	constructor( game ) {
		this.game = game;
		this.pos = new THREE.Vector3();
		this.vel = new THREE.Vector3();
		this.yaw = 0; this.pitch = 0;
		this.lean = 0; this.leanT = 0;
		this.stance = 'stand';
		this.stanceH = 1.66; // smoothed eye height
		this.onGround = false;
		this.swimming = false; this.underwater = false;
		this.flying = false; this.noclip = false;
		this.sprinting = false; this.walking = false; this.moving = false;
		this.autorun = false;
		this.speedNow = 0;
		this.fallStart = null;
		this.bob = 0; this.bobAmt = 0;
		this.recoil = new THREE.Vector2(); // pitch / yaw kick, decays
		this.shake = 0;
		this.fovKick = 0;
		this.aimFov = 1; // multiplier from ADS
		this.inventory = new PlayerInventory();
		this.vehicle = null; // seat when inside a vehicle
		this.stepDist = 0;
		this.lastSpace = 0;
		this.groundBox = null;
		this.alive = true;
		this.distance = 0;
		this.camQuat = new THREE.Quaternion();
		this.freeLook = { yaw: 0, pitch: 0 };
	}

	get eye() { return this.pos.y + this.stanceH; }
	get height() { return STANCE[ this.stance ].h; }

	lookDir( out = new THREE.Vector3() ) {
		const cp = Math.cos( this.pitch );
		return out.set( - Math.sin( this.yaw ) * cp, Math.sin( this.pitch ), - Math.cos( this.yaw ) * cp );
	}

	setStance( s ) {
		if ( s === this.stance ) return;
		const P = this.game.physics;
		// can we stand up here?
		if ( STANCE[ s ].h > STANCE[ this.stance ].h ) {
			const ceil = P.ceiling( this.pos.x, this.pos.z, this.pos.y + 0.3, R );
			if ( ceil < this.pos.y + STANCE[ s ].h ) return;
		}
		if ( this.swimming && s !== 'stand' ) return;
		this.stance = s;
	}

	update( dt ) {
		const g = this.game, input = g.input, P = g.physics, S = g.survival;
		if ( ! this.alive ) return;
		if ( this.vehicle ) { this.distance += 0; return; }

		// ---- look ----
		const [ mx, my ] = g.inputActive ? input.consumeMouse() : [ 0, 0 ];
		const sens = g.hands?.aiming ? g.hands.adsSensitivity() : 1;
		if ( input.is( 'freelook' ) && ! this.vehicle ) {
			this.freeLook.yaw = THREE.MathUtils.clamp( this.freeLook.yaw - mx * sens, - 2, 2 );
			this.freeLook.pitch = THREE.MathUtils.clamp( this.freeLook.pitch - my * sens, - 1, 1 );
		} else {
			this.yaw -= mx * sens;
			this.pitch = THREE.MathUtils.clamp( this.pitch - my * sens, - 1.52, 1.52 );
			this.freeLook.yaw *= Math.max( 0, 1 - dt * 10 ); this.freeLook.pitch *= Math.max( 0, 1 - dt * 10 );
		}
		// recoil recovers towards the rest aim
		this.pitch = THREE.MathUtils.clamp( this.pitch + this.recoil.x * dt * 14, - 1.52, 1.52 );
		this.yaw += this.recoil.y * dt * 14;
		this.recoil.multiplyScalar( Math.max( 0, 1 - dt * 14 ) );

		// ---- stance / lean ----
		if ( g.inputActive ) {
			const toggle = g.settings.get( 'toggleCrouch' );
			if ( toggle ) {
				if ( input.pressed( 'crouch' ) ) this.setStance( this.stance === 'crouch' ? 'stand' : 'crouch' );
			} else {
				const want = input.is( 'crouch' ) ? 'crouch' : ( this.stance === 'crouch' ? 'stand' : this.stance );
				if ( want !== this.stance && this.stance !== 'prone' ) this.setStance( want );
			}
			if ( input.pressed( 'prone' ) ) this.setStance( this.stance === 'prone' ? 'crouch' : 'prone' );
			let lt = 0;
			if ( input.is( 'leanLeft' ) ) lt -= 1;
			if ( input.is( 'leanRight' ) ) lt += 1;
			if ( this.stance === 'prone' || this.swimming || this.sprinting ) lt = 0;
			this.leanT = lt;
			if ( input.pressed( 'autorun' ) ) this.autorun = ! this.autorun;
		}
		this.lean += ( this.leanT - this.lean ) * Math.min( 1, dt * 9 );
		const targetEye = this.swimming ? 1.5 : STANCE[ this.stance ].eye;
		this.stanceH += ( targetEye - this.stanceH ) * Math.min( 1, dt * 8 );

		// ---- movement intent ----
		let fx = 0, fz = 0;
		if ( g.inputActive ) {
			if ( input.is( 'forward' ) || this.autorun ) fz -= 1;
			if ( input.is( 'back' ) ) { fz += 1; this.autorun = false; }
			if ( input.is( 'left' ) ) fx -= 1;
			if ( input.is( 'right' ) ) fx += 1;
		}
		const len = Math.hypot( fx, fz );
		if ( len > 1 ) { fx /= len; fz /= len; }
		this.moving = len > 0;
		const ts = g.settings.get( 'toggleSprint' );
		if ( ts ) { if ( input.pressed( 'sprint' ) ) this.sprintToggle = ! this.sprintToggle; if ( ! this.moving ) this.sprintToggle = false; }
		const wantSprint = g.inputActive && ( ts ? this.sprintToggle : input.is( 'sprint' ) ) && fz < 0 && ! g.hands?.aiming;
		this.walking = g.inputActive && input.is( 'walk' );
		const st = STANCE[ this.stance ];
		const mods = S ? S.moveModifiers() : { speed: 1, canSprint: true };
		const canSprint = mods.canSprint && ( ! S || S.stamina > 5 ) && this.stance !== 'prone';
		this.sprinting = wantSprint && canSprint && this.moving && ! this.swimming;
		let speed = this.sprinting ? st.sprint : this.walking ? Math.min( 1.6, st.speed ) : st.speed;
		if ( g.hands?.aiming ) speed = Math.min( speed, this.stance === 'stand' ? 2.0 : speed );
		speed *= mods.speed;
		if ( this.flying ) speed = ( input.is( 'sprint' ) ? 60 : 14 ) * ( g.creativeSpeed || 1 );

		const sy = Math.sin( this.yaw ), cy = Math.cos( this.yaw );
		// world move direction: forward is -z in the view frame
		const wx = fx * cy + fz * sy, wz = - fx * sy + fz * cy;

		// ---- flight (creative) ----
		if ( this.flying ) {
			let vy = 0;
			if ( g.inputActive && input.is( 'jump' ) ) vy += 1;
			if ( g.inputActive && input.is( 'crouch' ) ) vy -= 1;
			this.vel.set( wx * speed, vy * speed, wz * speed );
			this.pos.addScaledVector( this.vel, dt );
			if ( ! this.noclip ) {
				P.resolveCylinder( this.pos, R, 1.8, 0.2 );
				const gr = P.ground( this.pos.x, this.pos.z, this.pos.y + 0.5 );
				if ( this.pos.y < gr.y ) this.pos.y = gr.y;
			}
			this._doubleTapSpace( input );
			this.onGround = false; this.swimming = false; this.fallStart = null;
			this._camera( dt );
			return;
		}

		// ---- water ----
		const water = P.waterLevel( this.pos.x, this.pos.z );
		const groundHere = P.ground( this.pos.x, this.pos.z, this.pos.y, 0.45, R ).y;
		const depth = water - groundHere;
		const wasSwim = this.swimming;
		this.swimming = depth > 1.35 && this.pos.y < water - 0.9;
		if ( this.swimming && ! wasSwim ) { this.setStance( 'stand' ); this.stance = 'stand'; g.audio?.play( 'splash', { pos: this.pos, vol: 0.7 } ); }
		const wasUnder = this.underwater;
		this.underwater = this.eye < water - 0.05;
		if ( this.underwater !== wasUnder ) g.audio?.play( this.underwater ? 'submerge' : 'emerge', { vol: 0.6 } );

		if ( this.swimming ) {
			const swim = ( input.is( 'sprint' ) && S?.stamina > 5 ? 2.6 : 1.6 ) * mods.speed;
			const target = new THREE.Vector3( wx, 0, wz ).multiplyScalar( swim );
			// looking down while swimming forward dives
			if ( fz < 0 && this.pitch < - 0.35 && this.underwater ) target.y = Math.sin( this.pitch ) * swim;
			if ( g.inputActive && input.is( 'jump' ) ) target.y = 1.6;
			if ( g.inputActive && input.is( 'crouch' ) ) target.y = - 1.6;
			this.vel.lerp( target, Math.min( 1, dt * 3 ) );
			// buoyancy: bob at the surface with the waves
			const surfaceY = water - 1.45;
			if ( target.y === 0 && this.pos.y < surfaceY ) this.vel.y += ( surfaceY - this.pos.y ) * dt * 6;
			if ( this.pos.y > surfaceY ) this.vel.y -= dt * 8;
			this.pos.addScaledVector( this.vel, dt );
			P.resolveCylinder( this.pos, R, 1.8, 0.3 );
			const gr = P.ground( this.pos.x, this.pos.z, this.pos.y + 0.3, 0.45, R );
			if ( this.pos.y < gr.y ) this.pos.y = gr.y;
			this.onGround = false; this.fallStart = null;
			this._footsteps( dt, 'water' );
			this._camera( dt );
			return;
		}

		// ---- walking physics ----
		const accel = this.onGround ? 14 : 2.5;
		const tvx = wx * speed, tvz = wz * speed;
		this.vel.x += ( tvx - this.vel.x ) * Math.min( 1, dt * accel );
		this.vel.z += ( tvz - this.vel.z ) * Math.min( 1, dt * accel );
		this.vel.y -= GRAVITY * dt;

		// jump / vault
		if ( g.inputActive && input.pressed( 'jump' ) ) {
			if ( g.mode === 'creative' && this._doubleTapSpace( input ) ) { this.flying = true; this.vel.set( 0, 0, 0 ); this._camera( dt ); return; }
			if ( this.stance !== 'stand' ) this.setStance( 'stand' );
			else if ( this.onGround && ( ! S || S.stamina > 10 ) && mods.canJump !== false ) {
				if ( ! this._tryVault() ) { this.vel.y = 5.2; S?.useStamina( 8 ); }
			}
		}

		const oldX = this.pos.x, oldZ = this.pos.z;
		this.pos.x += this.vel.x * dt;
		this.pos.z += this.vel.z * dt;
		this.pos.y += this.vel.y * dt;
		const h = this.height;
		P.resolveCylinder( this.pos, R, h, 0.45 );
		// steep terrain: slide back instead of climbing cliffs
		const n = g.hf.normalAt( this.pos.x, this.pos.z, _n, 0.8 );
		const gr = P.ground( this.pos.x, this.pos.z, this.pos.y, 0.45, R );
		if ( ! gr.box && n.y < 0.62 && this.pos.y <= gr.y + 0.05 ) {
			const uphill = ( this.pos.x - oldX ) * - n.x + ( this.pos.z - oldZ ) * - n.z;
			if ( uphill > 0 ) { this.pos.x = oldX + n.x * 0.02; this.pos.z = oldZ + n.z * 0.02; }
		}
		const gr2 = P.ground( this.pos.x, this.pos.z, this.pos.y, 0.45, R );
		this.groundBox = gr2.box;
		if ( this.pos.y <= gr2.y ) {
			// landing
			if ( ! this.onGround && this.fallStart !== null ) {
				const fall = this.fallStart - gr2.y;
				if ( fall > 3.2 ) S?.fallDamage( fall );
				if ( fall > 0.8 ) g.audio?.play( 'land', { pos: this.pos, vol: Math.min( 1, fall / 4 ) } );
			}
			this.pos.y = gr2.y;
			this.vel.y = Math.max( 0, this.vel.y );
			this.onGround = true;
			this.fallStart = null;
		} else if ( this.pos.y - gr2.y < 0.3 && this.vel.y <= 0 && this.onGround ) {
			// stick to the ground going down stairs and slopes
			this.pos.y = gr2.y; this.vel.y = 0;
		} else {
			if ( this.onGround ) this.fallStart = this.pos.y;
			this.onGround = false;
			if ( this.fallStart === null ) this.fallStart = this.pos.y;
			this.fallStart = Math.max( this.fallStart, this.pos.y );
		}
		// head against a ceiling
		const ceil = P.ceiling( this.pos.x, this.pos.z, this.pos.y + 0.5, R * 0.8 );
		if ( this.pos.y + h > ceil ) { this.pos.y = Math.min( this.pos.y, ceil - h ); if ( this.vel.y > 0 ) this.vel.y = 0; }

		const moved = Math.hypot( this.pos.x - oldX, this.pos.z - oldZ );
		this.distance += moved;
		this.speedNow = moved / Math.max( dt, 1e-4 );
		if ( this.onGround ) this._footsteps( dt, this._surface() );
		if ( this.sprinting && this.speedNow > 1 ) S?.useStamina( 9 * dt );
		this._camera( dt );
	}

	_doubleTapSpace( input ) {
		if ( ! input.pressed( 'jump' ) ) return false;
		const now = performance.now();
		const dbl = now - this.lastSpace < 300;
		this.lastSpace = now;
		if ( dbl && this.flying ) { this.flying = false; }
		return dbl;
	}

	// climb onto / over an obstacle 0.5–1.4 m high in front
	_tryVault() {
		const P = this.game.physics;
		const d = new THREE.Vector3( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		for ( const reach of [ 0.55, 0.8 ] ) {
			const x = this.pos.x + d.x * reach, z = this.pos.z + d.z * reach;
			const top = P.ground( x, z, this.pos.y + 1.45, 0, 0.05 );
			const rise = top.y - this.pos.y;
			if ( rise > 0.5 && rise < 1.45 ) {
				const ceil = P.ceiling( x, z, top.y + 0.05, 0.25 );
				if ( ceil - top.y < 1.0 ) continue;
				this.pos.set( x, top.y + 0.02, z );
				this.vel.set( d.x * 1.5, 0, d.z * 1.5 );
				if ( ceil - top.y < 1.8 ) this.stance = 'crouch';
				this.game.survival?.useStamina( 12 );
				this.game.audio?.play( 'vault', { pos: this.pos, vol: 0.6 } );
				this.shake = Math.max( this.shake, 0.15 );
				return true;
			}
		}
		return false;
	}

	_surface() {
		const b = this.groundBox;
		if ( b ) return b.mat === 'wood' ? 'wood' : b.mat === 'metal' ? 'metal' : 'concrete';
		const g = this.game;
		const y = this.pos.y;
		if ( y < 0.4 ) return 'wetsand';
		const fl = g.hf.flagsNear( this.pos.x, this.pos.z );
		if ( fl & ( 1 | 4 | 8 ) ) return 'concrete';
		if ( y < 3 && g.world.isBeach?.( this.pos.x, this.pos.z ) ) return 'sand';
		const s = g.hf.surfaceAt( this.pos.x, this.pos.z, _s4 );
		if ( s[ 1 ] > 0.45 ) return 'rock';
		const n = g.hf.normalAt( this.pos.x, this.pos.z, _n, 1 );
		if ( n.y < 0.75 ) return 'rock';
		return 'grass';
	}

	_footsteps( dt, surface ) {
		const g = this.game;
		if ( this.speedNow < 0.4 ) { this.stepDist = 0; return; }
		this.stepDist += this.speedNow * dt;
		const stride = this.sprinting ? 1.9 : this.stance === 'crouch' ? 0.9 : this.stance === 'prone' ? 0.7 : this.walking ? 0.9 : 1.45;
		if ( this.stepDist > stride ) {
			this.stepDist = 0;
			const vol = this.sprinting ? 0.85 : this.stance === 'stand' && ! this.walking ? 0.55 : 0.25;
			g.audio?.footstep( surface, vol );
			const noise = ( this.sprinting ? 26 : STANCE[ this.stance ].noise * ( this.walking ? 0.4 : 1 ) ) * ( g.survival?.noiseMul?.() ?? 1 );
			g.events.emit( 'noise', { pos: this.pos.clone(), radius: noise, source: this, kind: 'step' } );
		}
	}

	_camera( dt ) {
		const g = this.game, cam = g.camera;
		// head bob scaled by speed
		const bobOn = g.settings.get( 'headBob' );
		const sp = this.onGround ? Math.min( 1.4, this.speedNow / 4.3 ) : 0;
		this.bobAmt += ( sp - this.bobAmt ) * Math.min( 1, dt * 6 );
		this.bob += dt * ( this.sprinting ? 12.5 : 9 ) * ( 0.4 + this.bobAmt * 0.6 );
		const bobY = Math.abs( Math.sin( this.bob ) ) * 0.045 * this.bobAmt * bobOn;
		const bobX = Math.cos( this.bob ) * 0.03 * this.bobAmt * bobOn;
		this.shake = Math.max( 0, this.shake - dt * 1.8 );
		const sh = this.shake * this.shake;
		const shx = ( Math.random() - 0.5 ) * sh * 0.06, shy = ( Math.random() - 0.5 ) * sh * 0.06;
		// lean: shift the head sideways and roll
		const leanOff = this.lean * 0.42;
		const rx = Math.cos( this.yaw ), rz = - Math.sin( this.yaw );
		let ex = this.pos.x + rx * ( leanOff + bobX ), ez = this.pos.z + rz * ( leanOff + bobX );
		// don't lean the head through a wall
		if ( Math.abs( leanOff ) > 0.05 ) {
			const test = new THREE.Vector3( ex, this.pos.y + this.stanceH, ez );
			const P = g.physics;
			const before = test.clone();
			P.resolveCylinder( test, 0.12, 0.3, 0 );
			if ( test.distanceToSquared( before ) > 1e-6 ) { ex = test.x; ez = test.z; }
		}
		cam.position.set( ex, this.pos.y + this.stanceH + bobY, ez );
		const yaw = this.yaw + this.freeLook.yaw + shx, pitch = this.pitch + this.freeLook.pitch + shy;
		cam.rotation.set( pitch, yaw, - this.lean * 0.14, 'YXZ' );
		// field of view: sprint widens, aiming narrows
		const base = g.settings.get( 'fov' );
		this.fovKick += ( ( this.sprinting ? 6 : 0 ) - this.fovKick ) * Math.min( 1, dt * 5 );
		const fov = ( base + this.fovKick ) * this.aimFov;
		if ( Math.abs( cam.fov - fov ) > 0.01 ) { cam.fov = fov; cam.updateProjectionMatrix(); }
		cam.updateMatrixWorld();
	}

	serialize() {
		return {
			pos: this.pos.toArray(), yaw: this.yaw, pitch: this.pitch, stance: this.stance, flying: this.flying,
			inventory: this.inventory.serialize(), distance: this.distance,
		};
	}
	load( o ) {
		this.pos.fromArray( o.pos ); this.yaw = o.yaw; this.pitch = o.pitch; this.stance = o.stance || 'stand';
		this.flying = !! o.flying; this.distance = o.distance || 0;
		this.inventory.load( o.inventory );
	}
}

const _n = new THREE.Vector3();
const _s4 = [ 0, 0, 0, 0 ];
