// Thrown things in flight and after they land: frag grenades (cookable fuse, bounce, blast), smoke grenades
// (a screen that blocks sight), flashbangs (blind, deafen, stun) and molotovs (shatter into a burning pool).
//   throwables.launch( def, { origin, vel, cooked, source } )
import * as THREE from 'three';
import { buildThrowableView } from './GunModels.js';
import { hitEntity } from './Ballistics.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3();
const rnd = Math.random;

export class Throwables {
	constructor( game ) {
		this.game = game;
		this.list = [];
		this.zones = []; // burning molotov pools
		this.flashT = 0;
	}

	// def: the throwable item def; o: { origin, vel, cooked (s of fuse already burnt), source, lit }
	launch( def, o ) {
		const t = def.throwable;
		const mesh = buildThrowableView( def, 'world' );
		mesh.traverse( m => { if ( m.isMesh ) { m.castShadow = true; } } );
		mesh.position.copy( o.origin );
		this.game.scene.add( mesh );
		const obj = {
			def, kind: t.kind, mesh, pos: o.origin.clone(), vel: o.vel.clone(), spin: new THREE.Vector3( rnd() * 12 - 6, rnd() * 12 - 6, rnd() * 12 - 6 ),
			fuse: Math.max( 0.05, ( t.fuse || 0 ) - ( o.cooked || 0 ) ), armed: t.kind !== 'molotov', rest: false, t: 0, source: o.source ?? null, done: false, bounces: 0, unlit: !! o.unlit,
		};
		this.list.push( obj );
		return obj;
	}

	update( dt ) {
		const g = this.game;
		for ( let k = this.list.length - 1; k >= 0; k -- ) {
			const o = this.list[ k ];
			o.t += dt;
			if ( ! o.rest ) this._move( o, dt );
			// molotov rag trails flame and smoke in flight
			if ( o.kind === 'molotov' && ! o.done && ! o.unlit && g.fx ) {
				const top = _v.set( 0, 0.12, 0 ).applyQuaternion( o.mesh.quaternion ).add( o.pos );
				g.fx.add.emit( { x: top.x, y: top.y, z: top.z, vx: 0, vy: 0.8, vz: 0, life: 0.3, s0: 0.07, s1: 0.02, frame: 6, r: 5, g: 2.2, b: 0.6, a: 0.9 } );
				g.fx.lightNow( top.clone(), _fireCol, 6, 8 );
			}
			if ( o.armed && o.t >= o.fuse && ! o.done ) this._detonate( o );
			if ( o.done && ( o.kind !== 'smoke' || o.t > o.fuse + 32 ) ) {
				o.mesh.parent?.remove( o.mesh );
				this.list.splice( k, 1 );
			}
		}
		this._updateZones( dt );
		// the flashbang's white-out fades
		if ( this.flashT > 0 ) {
			this.flashT = Math.max( 0, this.flashT - dt * 0.35 );
			g.flash = Math.min( 1, this.flashT * 1.4 );
			if ( this.flashT <= 0 ) g.flash = 0;
		}
	}

	_move( o, dt ) {
		const g = this.game;
		const steps = Math.ceil( dt / 0.016 );
		const h = dt / steps;
		for ( let s = 0; s < steps && ! o.rest; s ++ ) {
			o.vel.y -= 9.81 * h;
			o.vel.multiplyScalar( 1 - 0.05 * h );
			_d.copy( o.vel ).multiplyScalar( h );
			const L = _d.length();
			if ( L < 1e-6 ) continue;
			_d.divideScalar( L );
			let hit = g.physics.raycast( o.pos, _d, L + 0.04 );
			const eh = g.entities.raycast( o.pos, _d, L + 0.04, null );
			let ent = null;
			if ( eh && eh.entity.alive && ( ! hit || eh.t < hit.t ) && eh.entity.type !== 'item' ) { ent = eh.entity; hit = { t: eh.t, normal: _v2.copy( _d ).negate().setY( 0.3 ).normalize(), kind: 'entity', point: o.pos.clone().addScaledVector( _d, eh.t ) }; }
			if ( ! hit ) { o.pos.addScaledVector( _d, L ); continue; }
			const p = hit.point || o.pos.clone().addScaledVector( _d, hit.t );
			if ( o.kind === 'molotov' && ! o.done ) { this._shatter( o, p, hit.kind === 'water' ); return; }
			if ( hit.kind === 'water' ) {
				g.fx?.splash( p, 0.4 );
				g.audio?.play( 'plop', { pos: p, vol: 0.6 } );
				o.pos.copy( p ); o.pos.y -= 0.3;
				o.rest = true; o.wet = true;
				if ( o.kind === 'smoke' ) o.fuse = Math.min( o.fuse, o.t ); // fizzles
				break;
			}
			const n = hit.normal;
			const speed = o.vel.length();
			if ( speed > 2.5 && o.bounces < 8 ) g.audio?.play( 'grenade_bounce', { pos: p, vol: Math.min( 0.7, speed / 14 ), rate: 0.9 + rnd() * 0.3, max: 40 } );
			o.bounces ++;
			// reflect with loss, rubbing speed off along the surface
			const vn = o.vel.dot( n );
			_v.copy( n ).multiplyScalar( vn );
			const vt = o.vel.clone().sub( _v );
			o.vel.copy( vt.multiplyScalar( 0.62 ) ).addScaledVector( n, - vn * 0.32 );
			if ( ent ) ent.stagger?.( _d.clone(), 0.3 );
			o.pos.copy( p ).addScaledVector( n, 0.035 );
			o.spin.multiplyScalar( 0.6 );
			if ( n.y > 0.6 && o.vel.length() < 0.6 ) { o.vel.set( 0, 0, 0 ); o.rest = true; }
		}
		o.mesh.position.copy( o.pos );
		if ( ! o.rest ) o.mesh.rotation.set( o.mesh.rotation.x + o.spin.x * dt, o.mesh.rotation.y + o.spin.y * dt, o.mesh.rotation.z + o.spin.z * dt );
		else if ( ! o.settled ) { o.settled = true; o.mesh.rotation.set( Math.PI / 2, rnd() * 6, 0 ); o.mesh.position.y += 0.02; }
	}

	_detonate( o ) {
		const g = this.game, t = o.def.throwable;
		o.done = true;
		const pos = o.pos.clone();
		if ( o.kind === 'frag' ) {
			if ( o.wet ) { g.fx?.splash( pos.clone().setY( g.physics.waterLevel( pos.x, pos.z ) ), 2.5 ); g.audio?.play( 'explosion', { pos, vol: 0.6, rate: 0.6, max: 800 } ); }
			g.ballistics.explode( pos.clone().setY( pos.y + 0.1 ), { radius: t.radius, damage: t.damage, source: o.source, weapon: o.def.id, cause: 'a grenade', fx: ! o.wet } );
			o.mesh.visible = false;
		} else if ( o.kind === 'smoke' ) {
			if ( o.wet ) return;
			g.fx?.smoke( pos, { radius: t.radius, duration: 30 } );
			g.audio?.play( 'spoon', { pos, vol: 0.5 } );
			g.events.emit( 'noise', { pos, radius: 20, source: o.source, kind: 'smoke' } );
		} else if ( o.kind === 'flashbang' ) {
			o.mesh.visible = false;
			g.fx?.light( pos.clone().setY( pos.y + 0.3 ), 0xffffff, 4000, 90, 0.35 );
			g.fx?.add.emit( { x: pos.x, y: pos.y + 0.3, z: pos.z, life: 0.25, s0: 2, s1: 7, frame: 14, r: 20, g: 20, b: 20, a: 1 } );
			g.fx?.sparks( pos, _v.set( 0, 1, 0 ), 30, { speed: 14 } );
			g.audio?.play( 'flashbang', { pos, vol: 1.3, max: 900, ref: 10 } );
			g.events.emit( 'noise', { pos, radius: 350, source: o.source, kind: 'flashbang' } );
			this._flashPlayer( pos, t );
			// everything that saw it is stunned
			const eye = _v2.set( pos.x, pos.y + 0.3, pos.z );
			for ( const e of g.entities.near( pos, t.radius, null, [] ) ) {
				if ( ! e.alive || ( e.type !== 'zombie' && e.type !== 'animal' && e.type !== 'npc' ) ) continue;
				const head = _v.set( e.pos.x, e.pos.y + ( e.height || 1.7 ) * 0.9, e.pos.z );
				if ( ! g.physics.lineOfSight( eye, head ) ) continue;
				const k = 1 - head.distanceTo( pos ) / t.radius;
				e.stun?.( 2 + 5 * k );
				if ( t.damage && k > 0.7 ) hitEntity( g, e, t.damage * k, { source: o.source, zone: 'torso', dir: head.clone().sub( pos ).normalize(), kind: 'explosion', weapon: o.def.id } );
			}
		}
	}

	_flashPlayer( pos, t ) {
		const g = this.game, P = g.player;
		if ( ! P || g.dead ) return;
		const eye = g.camera.position;
		const d = eye.distanceTo( pos );
		if ( d > t.radius * 1.8 ) return;
		const los = g.physics.lineOfSight( eye, _v.set( pos.x, pos.y + 0.3, pos.z ) );
		const look = P.lookDir( _v2 );
		const to = _d.copy( pos ).sub( eye ).normalize();
		const facing = Math.max( 0, look.dot( to ) );
		const blind = los ? Math.min( 1, ( 1 - d / ( t.radius * 1.8 ) ) * ( 0.35 + facing * 0.9 ) * 1.4 ) : 0;
		this.flashT = Math.max( this.flashT, blind * 2.6 );
		// deafened: the world goes quiet under a ring
		const deaf = Math.max( 0, 1 - d / ( t.radius * 1.4 ) );
		if ( deaf > 0.05 ) {
			const A = g.audio;
			A?.play( 'tinnitus', { vol: 0.9 * deaf, bus: 'ui' } );
			if ( A?.ctx && A.bus?.sfx ) {
				A.bus.sfx.gain.setTargetAtTime( g.settings.get( 'sfxVolume' ) * ( 1 - deaf * 0.85 ), A.ctx.currentTime, 0.02 );
				clearTimeout( this._deafT );
				this._deafT = setTimeout( () => { this._deafT = null; try { A.bus.sfx.gain.setTargetAtTime( g.settings.get( 'sfxVolume' ), A.ctx.currentTime, 1.2 ); } catch ( e ) { /* closed */ } }, 1500 + deaf * 3000 );
			}
		}
		P.shake = Math.max( P.shake || 0, 0.4 * deaf );
	}

	_shatter( o, p, water ) {
		const g = this.game, t = o.def.throwable;
		o.done = true;
		o.mesh.visible = false;
		g.audio?.play( 'glass', { pos: p, vol: 0.9, max: 60 } );
		g.fx?.impact( p, _v.set( 0, 1, 0 ), 'glass', { size: 1.2, sound: false, decal: false } );
		if ( water ) { g.fx?.splash( p, 0.5 ); return; }
		// an unlit bottle only leaves a fuel stain
		if ( o.unlit ) { g.fx?.decal( p, _v.set( 0, 1, 0 ), 'scorch', 1.2, 60, 0.35 ); return; }
		g.audio?.play( 'fire_whoosh', { pos: p, vol: 0.9, max: 80 } );
		// the fuel spreads over the ground where it broke
		const floor = g.physics.ground( p.x, p.z, p.y + 0.5 ).y;
		const pos = new THREE.Vector3( p.x, floor, p.z );
		const fire = g.fx?.fire( pos, { radius: t.radius, duration: 14, intensity: 1.2 } );
		this.zones.push( { pos, r: t.radius, t: 0, dur: 14, dmg: t.damage, source: o.source, weapon: o.def.id, fire, tick: 0 } );
		g.fx?.decal( pos, _v.set( 0, 1, 0 ), 'scorch', t.radius * 2, 300, 0.85 );
		g.events.emit( 'noise', { pos: pos.clone(), radius: 45, source: o.source, kind: 'fire' } );
	}

	_updateZones( dt ) {
		const g = this.game;
		for ( let k = this.zones.length - 1; k >= 0; k -- ) {
			const z = this.zones[ k ];
			z.t += dt;
			if ( z.t >= z.dur ) { this.zones.splice( k, 1 ); continue; }
			z.tick += dt;
			if ( z.tick < 0.25 ) continue;
			const step = z.tick; z.tick = 0;
			const k2 = Math.min( 1, ( z.dur - z.t ) / 2 );
			for ( const e of g.entities.near( z.pos, z.r + 0.4, null, [] ) ) {
				if ( ! e.alive || e.type === 'item' || e.type === 'projectile' ) continue;
				if ( Math.abs( e.pos.y - z.pos.y ) > 1.5 ) continue;
				e.ignite?.( 5 );
				hitEntity( g, e, z.dmg * step * k2, { source: z.source, zone: 'leg', dir: _up, kind: 'fire', weapon: z.weapon } );
			}
			const P = g.player;
			if ( P && ! g.dead && ! P.vehicle && Math.hypot( P.pos.x - z.pos.x, P.pos.z - z.pos.z ) < z.r && Math.abs( P.pos.y - z.pos.y ) < 1.5 ) {
				g.survival?.hurt( z.dmg * step * 0.6 * k2, 'burn', { cause: 'fire' } );
			}
		}
	}

	// is this point inside a burning pool? (AI can steer around it)
	burningAt( p ) { return this.zones.some( z => Math.hypot( p.x - z.pos.x, p.z - z.pos.z ) < z.r ); }

	dispose() {
		for ( const o of this.list ) o.mesh.parent?.remove( o.mesh );
		this.list.length = 0; this.zones.length = 0;
		// deafened when the game ends: the sound effects come back now, not after the next volume change
		if ( this._deafT ) {
			clearTimeout( this._deafT );
			this._deafT = null;
			const A = this.game.audio;
			try {
				const gain = A.bus.sfx.gain, t = A.ctx.currentTime;
				gain.cancelScheduledValues( t );
				gain.setValueAtTime( this.game.settings.get( 'sfxVolume' ), t );
			} catch ( e ) { A?.applyVolumes?.(); }
		}
		this.game.flash = 0;
	}
}

const _fireCol = new THREE.Color( 1, 0.55, 0.22 );
const _up = new THREE.Vector3( 0, 1, 0 );
