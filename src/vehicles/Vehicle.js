// One vehicle: an entity (type 'vehicle') with a rigid body, its visual, the engine, fuel, damage (body,
// tyres, glass, fuel leaks, fire, explosion), lamps, sounds, particle effects, the trunk and glovebox, and
// its save record. The manager (Vehicles.js) steps it; Entity.update is left empty so the driven vehicle,
// the camera and the player move in one place, in order.
import * as THREE from 'three';
import { Entity } from '../game/Entities.js';
import { SPECS, seatsFromModel } from './specs.js';
import { getModel } from './models/index.js';
import { VehicleVisual, EMIT } from './visual.js';
import { Body, Engine, makeWheels, hullPoints, hullContacts, stepCar, stepBoat, stepHeli, stepPlane, STEP } from './physics.js';
import { pchip } from './models/shell.js';

const V3 = THREE.Vector3;
const _v = new V3(), _w = new V3(), _o = new V3(), _d = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const rnd = Math.random;
const rr = ( a, b ) => a + ( b - a ) * rnd();
// what a crash does per m/s of closing speed above the threshold
const CRASH_MIN = 3.5;

export class Vehicle extends Entity {
	constructor( game, type, o = {} ) {
		super( game, 'vehicle' );
		this.isVehicle = true;
		this.typeName = type;
		this.spec = SPECS[ type ];
		const spec = this.spec;
		this.model = getModel( spec.model );
		const m = this.model, P = m.P;
		this.key = o.key || null;
		this.site = o.site || null;
		this.persistent = !! o.persistent;
		this.look = o.look || {};
		this.visual = new VehicleVisual( m, this.look );
		this.object = this.visual.group;
		this.object.matrixAutoUpdate = true;
		this.bounds = m.bounds.clone();
		const size = this.bounds.getSize( new V3() );
		this.size = size;
		this.radius = Math.hypot( size.x, size.z ) / 2;
		this.height = size.y;
		this.maxHealth = spec.health;
		this.health = o.health ?? spec.health;
		this.fuel = o.fuel ?? spec.fuel.tank * 0.5;
		this.seats = spec.seats || seatsFromModel( P );
		if ( type === 'bus' ) for ( const f of [ 3.0, 1.4, - 0.2, - 1.8 ] ) for ( const x of [ - 0.72, 0.72 ] ) this.seats.push( { pos: [ x, 0.95, - f ], eye: [ x, 1.62, - f + 0.1 ], exit: 1 } );
		this.occupant = new Array( this.seats.length ).fill( null );

		// rigid body
		const kind = spec.kind;
		let com;
		if ( kind === 'car' ) com = [ 0, Math.max( P.wheelR + 0.12, size.y * 0.34 ), - ( P.axleF + P.axleR ) / 2 - 0.08 ];
		else if ( kind === 'boat' ) com = [ 0, - 0.02, ( this.bounds.min.z + this.bounds.max.z ) / 2 + 0.25 ];
		else if ( kind === 'heli' ) com = [ 0, 1.2, 0.15 ];
		else com = [ 0, 1.4, - 0.6 ];
		const isize = kind === 'plane' ? [ 6, 1.6, 7 ] : [ size.x, size.y, size.z ];
		this.body = new Body( spec.mass, isize, com );
		this.engine = new Engine( spec );
		this.steer = 0; this.throttle = 0; this.braking = false;
		this.rotor = 0; this.throttleSet = 0;
		// running gear and contact points
		this.wheels = [];
		if ( kind === 'car' || kind === 'plane' ) this.wheels = makeWheels( m, spec );
		if ( kind === 'heli' ) this.wheels = makeWheels( { wheels: m.meta.skids.map( s => ( { x: s[ 0 ], y: 0.02, z: s[ 2 ], R: 0.02, W: 0.1, side: Math.sign( s[ 0 ] ), steer: 0, front: s[ 2 ] < 0, skid: true } ) ) }, spec );
		for ( const w of this.wheels ) if ( kind === 'heli' ) w.skid = true;
		this.hull = this._hullPoints();
		if ( kind === 'boat' ) this._buoyancy();
		this.propPoint = new V3( ...( m.meta.prop || [ 0, 0, 0 ] ) );
		this.acc = 0;
		this.sleeping = true;
		this.still = 0;
		this.driver = null; // the player when at the wheel
		// damage / state
		this.tyres = o.tyres || this.wheels.map( () => 0 ); // 1 = flat
		this.wheels.forEach( ( w, i ) => { w.flat = !! this.tyres[ i ]; } );
		this.crack = o.crack || 0;
		this.burnt = !! o.burnt;
		this.leak = !! o.leak;
		this.burning = 0;
		this.hotwired = !! o.hotwired;
		this.keysIn = !! o.keysIn;
		this.needs = o.needs || {}; // { battery: true, spark: true }
		this.lights = false; this.siren = false;
		this.horn = 0;
		this.trunk = o.trunk || null; this.glovebox = o.glovebox || null;
		this.touched = !! o.touched;
		this.known = !! o.known;
		this.lastHit = new Map();
		this.noiseT = rnd() * 0.5;
		this.fxT = 0;
		this.snd = {};
		this.lastLOD = null;
		if ( this.burnt ) this._applyBurnt();
		else this.visual.setLook( { crack: this.crack } );
		// place
		if ( o.pos ) this.setPose( o.pos, o.quat || null, o.yaw ?? 0 );
	}

	get kind() { return this.spec.kind; }
	get name() { return this.spec.name; }
	get speed() { return this.body.v.length(); }

	// ---- pose --------------------------------------------------------------------------------------------

	// model origin position + orientation (quat, or a yaw)
	setPose( pos, quat = null, yaw = 0 ) {
		const b = this.body;
		if ( quat ) b.q.copy( quat ); else b.q.setFromEuler( _e.set( 0, yaw, 0 ) );
		b.updateFrames();
		b.pos.copy( b.com ).applyQuaternion( b.q ).add( pos );
		this._sync();
	}

	// rest on the ground under its wheels (parked vehicles are posed, not simulated)
	settle() {
		const b = this.body, g = this.game;
		const yaw = this.yawAngle();
		if ( this.kind === 'boat' ) {
			const o = b.origin( _o );
			const wy = g.physics.waterLevel( o.x, o.z );
			const gy = g.hf.heightAt( o.x, o.z );
			// afloat, or resting on the sand if the water is too shallow
			const y = Math.max( wy - 0.02, gy - this.bounds.min.y - 0.02 );
			this.setPose( _o.set( o.x, y, o.z ), null, yaw );
			return;
		}
		const pts = this.kind === 'heli' ? this.model.meta.skids.map( s => [ s[ 0 ], s[ 2 ] ] ) : this.wheels.map( w => [ w.x, w.z ] );
		if ( ! pts.length ) return;
		const o = b.origin( _o );
		const c = Math.cos( yaw ), s = Math.sin( yaw );
		const hs = pts.map( ( [ x, z ] ) => {
			const wx = o.x + x * c + z * s, wz = o.z - x * s + z * c;
			return g.physics.ground( wx, wz, o.y + 2, 0.6 ).y;
		} );
		// fit pitch and roll through the contact heights
		let front = 0, rear = 0, left = 0, right = 0, nf = 0, nr = 0, nl = 0, nrr = 0;
		const zs = pts.map( p => p[ 1 ] ), zmid = ( Math.min( ...zs ) + Math.max( ...zs ) ) / 2;
		pts.forEach( ( [ x, z ], i ) => { if ( z < zmid ) { front += hs[ i ]; nf ++; } else { rear += hs[ i ]; nr ++; } if ( x < 0 ) { left += hs[ i ]; nl ++; } else { right += hs[ i ]; nrr ++; } } );
		const wb = Math.max( 0.5, Math.max( ...zs ) - Math.min( ...zs ) );
		const tr = Math.max( 0.5, Math.max( ...pts.map( p => p[ 0 ] ) ) - Math.min( ...pts.map( p => p[ 0 ] ) ) );
		const pitch = nf && nr ? Math.atan2( front / nf - rear / nr, wb ) : 0;
		const roll = nl && nrr ? Math.atan2( right / nrr - left / nl, tr ) : 0;
		const y = hs.reduce( ( a, v ) => a + v, 0 ) / hs.length;
		// right side higher -> positive rotation about the car's rear-pointing z axis
		_q.setFromEuler( _e.set( pitch, yaw, roll, 'YXZ' ) );
		this.setPose( _o.set( o.x, y, o.z ), _q );
		for ( const w of this.wheels ) { w.L = this.spec.susp.rest; w.Lprev = w.L; }
	}

	yawAngle() { _v.set( 0, 0, - 1 ).applyQuaternion( this.body.q ); return Math.atan2( - _v.x, - _v.z ); }

	_sync() {
		const b = this.body;
		b.origin( this.pos );
		this.object.position.copy( this.pos );
		this.object.quaternion.copy( b.q );
		this.yaw = this.yawAngle();
		this.vel.copy( b.v );
	}

	// ---- setup helpers --------------------------------------------------------------------------------------

	_hullPoints() {
		const P = this.model.P, bb = this.bounds, k = this.kind;
		if ( k === 'car' ) {
			const pts = hullPoints( bb, { bottom: ( P.body?.bottom ? Math.min( ...P.body.bottom.map( p => p[ 1 ] ) ) : 0.2 ) + 0.03, belt: P.gh ? P.gh.y[ 0 ][ 1 ] - 0.55 : undefined, roofZ: P.gh ? [ - P.gh.roof[ 0 ], - P.gh.roof[ 1 ] ] : null, roofW: P.gh ? P.gh.w[ 0 ][ 1 ] / ( P.W / 2 ) : 0.75 } );
			return pts;
		}
		if ( k === 'boat' ) {
			const H = P.hull, keel = pchip( H.keel ), sheer = pchip( H.sheer ), width = pchip( H.width );
			const pts = [];
			for ( const f of [ H.bow - 0.05, H.bow * 0.6, 0, H.transom * 0.6, H.transom + 0.05 ] ) {
				pts.push( new V3( 0, keel( f ) + 0.02, - f ) );
				for ( const s of [ - 1, 1 ] ) pts.push( new V3( s * width( f ) * 0.95, sheer( f ) - 0.05, - f ), new V3( s * width( f ) * 0.8, keel( f ) * 0.4, - f ) );
			}
			return pts;
		}
		if ( k === 'heli' ) {
			const pts = [];
			for ( const [ x, y, z ] of [ [ 0, 0.5, - 2.3 ], [ 0, 0.47, - 1.2 ], [ 0, 0.47, 0.8 ], [ 0.8, 1.4, 0 ], [ - 0.8, 1.4, 0 ], [ 0, 2.5, - 1.5 ], [ 0, 2.8, 0.5 ], [ 0, 1.95, 6.9 ], [ 0, 3.0, 7.1 ], [ 0, 1.5, 6.8 ], [ 1.2, 1.96, 5.8 ], [ - 1.2, 1.96, 5.8 ] ] ) pts.push( new V3( x, y, z ) );
			return pts;
		}
		// plane: nose, belly, tail, wing tips, fin
		const pts = [];
		for ( const [ x, y, z ] of [ [ 0, 1.3, - 2.75 ], [ 0, 0.85, - 1.5 ], [ 0, 0.85, 0.5 ], [ 0, 1.55, 4.5 ], [ 0, 2.72, 4.4 ], [ - 5.5, 2.35, - 0.3 ], [ 5.5, 2.35, - 0.3 ], [ - 1.7, 1.74, 4.1 ], [ 1.7, 1.74, 4.1 ], [ 0, 2.2, - 0.2 ], [ 0, 0.4, - 2.62 ] ] ) pts.push( new V3( x, y, z ) );
		return pts;
	}

	// buoyancy sample points over the hull bottom (3 across x 5 along), sized so the boat floats at its draft
	_buoyancy() {
		const H = this.model.P.hull, spec = this.spec;
		const keel = pchip( H.keel ), chineY = pchip( H.chineY ), width = pchip( H.width ), chine = pchip( H.chine ), sheer = pchip( H.sheer );
		const pts = [];
		const n = 5;
		for ( let i = 0; i < n; i ++ ) {
			const f = H.transom + 0.25 + ( H.bow - 0.9 - H.transom - 0.25 ) * i / ( n - 1 );
			for ( const t of [ - 0.6, 0, 0.6 ] ) {
				const hw = width( f ), xc = hw * chine( f );
				const x = t * hw;
				const y = Math.abs( x ) < xc ? keel( f ) + ( chineY( f ) - keel( f ) ) * Math.abs( x ) / xc : chineY( f );
				pts.push( { p: new V3( x, y, - f ), a: 0, depth: sheer( f ) - y } );
			}
		}
		const a = spec.mass / ( 1025 * pts.length * spec.draft );
		for ( const p of pts ) p.a = a;
		this.buoy = pts;
		this.hullDepth = Math.min( ...pts.map( p => p.depth ) );
		this.inWater = 0;
	}

	// ---- simulation -------------------------------------------------------------------------------------------

	wake() { if ( this.sleeping ) { this.sleeping = false; this.still = 0; } }

	// fixed-step physics; inp = the driver's input (null: nobody at the controls)
	simulate( dt, inp ) {
		if ( this.sleeping ) return;
		const game = this.game;
		const I = inp || NO_INPUT;
		this.acc = Math.min( this.acc + dt, STEP * 8 );
		this.altitudeAGL = this.pos.y - Math.max( game.hf.heightAt( this.pos.x, this.pos.z ), game.physics.waterLevel( this.pos.x, this.pos.z ) );
		let crash = null;
		while ( this.acc >= STEP ) {
			this.acc -= STEP;
			const b = this.body;
			// gravity
			b.F.y -= b.m * 9.81;
			if ( this.kind === 'car' ) this.fwdSpeed = stepCar( this, STEP, I );
			else if ( this.kind === 'boat' ) this.fwdSpeed = stepBoat( this, STEP, I );
			else if ( this.kind === 'heli' ) this.fwdSpeed = stepHeli( this, STEP, I );
			else this.fwdSpeed = stepPlane( this, STEP, I );
			b.integrate( STEP );
			const c = hullContacts( this, STEP );
			if ( c.speed > CRASH_MIN && ( ! crash || c.speed > crash.speed ) ) crash = c;
			// rotor strike: blade tips into anything solid
			if ( this.kind === 'heli' && this.rotor > 0.3 ) this._rotorStrike();
		}
		this._sync();
		if ( crash ) this.onCrash( crash );
		// wheels spin
		for ( const w of this.wheels ) w.spin += w.spinV * dt;
		// fall asleep when nothing is happening (parked, nobody inside)
		const moving = this.body.v.lengthSq() > 0.02 || this.body.w.lengthSq() > 0.01;
		if ( ! this.driver && ! this.engine.running && ! moving && ( this.kind !== 'boat' || ! this.inWater ) && this.rotor < 0.05 ) {
			this.still += dt;
			if ( this.still > 1.5 ) { this.sleeping = true; this.body.v.set( 0, 0, 0 ); this.body.w.set( 0, 0, 0 ); }
		} else this.still = 0;
		// out of the world: sank / fell through
		if ( this.pos.y < game.hf.heightAt( this.pos.x, this.pos.z ) - 6 && this.kind !== 'boat' ) this.settle();
	}

	_rotorStrike() {
		const g = this.game, b = this.body;
		const hub = b.toWorld( _v.set( ...this.model.meta.rotor ), _w );
		b.up( _d );
		const R = this.spec.rotorR;
		for ( let i = 0; i < 8; i ++ ) {
			const a = i / 8 * Math.PI * 2;
			_v.set( Math.cos( a ) * R, 0, Math.sin( a ) * R ).applyQuaternion( b.q ).add( hub );
			const gy = g.hf.heightAt( _v.x, _v.z );
			let hit = _v.y < gy + 0.1;
			if ( ! hit ) for ( const bx of g.physics.near( _v.x, _v.z, 0.2, _near ) ) if ( bx.owner !== this && _v.y > bx.minY && _v.y < bx.maxY && ( bx.kind !== 'noclimb' ) ) { hit = true; break; }
			if ( hit ) {
				this.rotor *= 0.2;
				g.audio?.play( 'crash', { pos: _v, vol: 1.2, max: 400 } );
				g.fx?.sparks( _v, _d, 20, { speed: 14 } );
				this.damage( this.maxHealth * 0.6, { kind: 'vehicle', zone: 'rotor' } );
				return;
			}
		}
	}

	onCrash( c ) {
		const g = this.game;
		const s = c.speed;
		const kind = this.kind;
		// aircraft are fragile, big trucks shrug off bumps
		const k = ( kind === 'heli' || kind === 'plane' ? 3 : kind === 'boat' ? 0.6 : 1 ) * ( 1500 / Math.max( 800, this.spec.mass ) ) ** 0.3;
		const dmg = ( s - CRASH_MIN ) * ( s - CRASH_MIN ) * 9 * k;
		if ( dmg > 2 ) this.damage( dmg, { kind: 'vehicle', zone: 'body', crash: true } );
		if ( s > 5 ) {
			g.audio?.play( s > 11 ? 'crash' : 'hit_metal', { pos: c.point || this.pos, vol: Math.min( 1.3, s / 12 ), max: 250, rate: s > 11 ? 1 : 0.7 } );
			g.events.emit( 'noise', { pos: this.pos.clone(), radius: Math.min( 120, s * 8 ), source: this.driver || this, kind: 'crash' } );
			if ( c.point ) g.fx?.sparks( c.point, _v.copy( this.body.v ).normalize().negate(), Math.min( 24, Math.round( s ) ), { speed: 8 } );
			if ( s > 9 ) this.crack = Math.min( 1, this.crack + ( s - 8 ) * 0.08 ), this.visual.setLook( { crack: this.crack } );
		}
		// the people inside feel it
		if ( this.driver && s > 9 ) {
			g.player.shake = Math.max( g.player.shake || 0, Math.min( 1.2, s / 16 ) );
			if ( s > 13 ) g.survival?.hurt( ( s - 12 ) * ( s - 12 ) * 0.9, 'vehicle', { cause: 'a crash' } );
		} else if ( this.driver && s > 5 ) g.player.shake = Math.max( g.player.shake || 0, s / 25 );
	}

	// ---- damage -------------------------------------------------------------------------------------------------

	// bullets, blasts, crashes, the infected clawing at it
	damage( amount, info = {} ) {
		if ( this.burnt ) return;
		const g = this.game;
		const kind = info.kind || 'bullet';
		let body = amount;
		if ( kind === 'bullet' || kind === 'arrow' ) {
			const z = info.zone;
			if ( z === 'tyre' && info.wheel != null && this.wheels[ info.wheel ] ) { this.setFlat( info.wheel ); body = amount * 0.1; }
			else if ( z === 'glass' ) { this.crack = Math.min( 1, this.crack + 0.3 ); this.visual.setLook( { crack: this.crack } ); body = amount * 0.2; this._passThrough( amount, info ); }
			else if ( z === 'engine' ) body = amount * 1.6;
			else if ( z === 'fuel' ) { body = amount * 0.8; if ( ! this.leak && rnd() < 0.5 ) this.leak = true; }
			else body = amount * 0.45;
			this.touch();
		} else if ( kind === 'explosion' ) {
			body = amount * 3.5;
			this.crack = 1; this.visual.setLook( { crack: 1 } );
			this.wheels.forEach( ( w, i ) => { if ( rnd() < 0.3 ) this.setFlat( i ); } );
			if ( this.driver ) g.survival?.hurt( amount * 0.25, 'explosion', { cause: 'an explosion' } );
			this.touch();
		} else if ( kind === 'melee' || kind === 'bite' || kind === 'scratch' ) {
			body = amount * 0.25;
			if ( rnd() < 0.2 ) { this.crack = Math.min( 1, this.crack + 0.15 ); this.visual.setLook( { crack: this.crack } ); }
		} else if ( kind === 'fire' ) body = amount;
		this.health = Math.max( 0, this.health - body );
		if ( this.health <= 0 ) this.destroy( info );
		else if ( this.health < this.maxHealth * 0.1 && ! this.burning && kind !== 'melee' ) this.burning = 12 + rnd() * 10; // a fire that ends in an explosion
	}

	// a bullet through the glass can reach whoever sits behind it
	_passThrough( amount, info ) {
		const g = this.game;
		if ( ! this.driver || info.source === g.player ) return;
		if ( rnd() < 0.5 ) g.survival?.hurt( amount * 0.6, 'bullet', { dir: info.dir, zone: rnd() < 0.2 ? 'head' : 'torso', cause: 'a gunshot' } );
	}

	setFlat( i ) {
		if ( this.tyres[ i ] ) return;
		this.tyres[ i ] = 1;
		this.wheels[ i ].flat = true;
		this.game.audio?.play( 'hit_metal', { pos: this.pos, vol: 0.4, rate: 0.5 } );
		this.touch();
	}

	knockback( dir, force ) {
		this.wake();
		this.body.v.addScaledVector( dir, force * 900 / this.spec.mass );
		this.body.v.y += force * 300 / this.spec.mass;
	}

	destroy( info = {} ) {
		if ( this.burnt ) return;
		const g = this.game;
		const p = this.pos.clone().setY( this.pos.y + this.height * 0.4 );
		// burnt first: the blast below hits this vehicle too
		this._applyBurnt();
		g.fx?.explosion( p, this.kind === 'heli' || this.kind === 'plane' ? 9 : 7 );
		g.ballistics?.explode?.( p, { radius: 9, damage: 160, source: info.source || this, cause: 'an explosion', fx: false } );
		if ( ! g.ballistics ) g.audio?.play( 'explosion', { pos: p, vol: 1.3, max: 1800, ref: 12 } );
		this.burning = 0;
		this.fire = g.fx?.fire?.( this.pos.clone(), { radius: Math.min( 3, this.radius * 0.7 ), duration: 40, intensity: 1.2 } );
		this.health = 0;
		this.engine.running = false;
		this.fuel = 0;
		this.wake();
		this.body.v.y += 3.5;
		this.body.w.x += rr( - 1.5, 1.5 ); this.body.w.z += rr( - 1.5, 1.5 );
		this.game.vehicles?.onDestroyed?.( this );
		this.touch();
	}

	_applyBurnt() {
		this.burnt = true;
		this.visual.setLook( { burnt: 1, crack: 1 } );
		this.crack = 1;
		for ( let i = 0; i < this.emitLen(); i ++ ) this.visual.emit[ i ] = 0;
		this.wheels.forEach( ( w, i ) => { this.tyres[ i ] = 1; w.flat = true; } );
		this.needs = {};
	}
	emitLen() { return this.visual.emit.length; }

	// ray (o, d unit) vs the body box in its own frame; zone by where it lands
	hitTest( o, d, maxT ) {
		const b = this.body;
		const org = b.origin( _o );
		// into the model frame
		const lo = _v.subVectors( o, org ).applyQuaternion( _q.copy( b.q ).invert() );
		const ld = _w.copy( d ).applyQuaternion( _q );
		const mn = this.bounds.min, mx = this.bounds.max;
		let t0 = 0, t1 = maxT;
		for ( const ax of [ 'x', 'y', 'z' ] ) {
			const lo_ = ax === 'y' ? Math.max( mn.y, 0.12 ) : mn[ ax ] + 0.03, hi = mx[ ax ] - 0.03;
			if ( Math.abs( ld[ ax ] ) < 1e-9 ) { if ( lo[ ax ] < lo_ || lo[ ax ] > hi ) return null; continue; }
			let a = ( lo_ - lo[ ax ] ) / ld[ ax ], c = ( hi - lo[ ax ] ) / ld[ ax ];
			if ( a > c ) { const t = a; a = c; c = t; }
			t0 = Math.max( t0, a ); t1 = Math.min( t1, c );
			if ( t0 > t1 ) return null;
		}
		// plane: only the fuselage and the wing slab count
		const hp = _d.copy( lo ).addScaledVector( ld, t0 );
		if ( this.kind === 'plane' && Math.abs( hp.x ) > 0.7 && ( hp.y < 2.05 || hp.y > 2.5 ) ) return null;
		return { t: t0, zone: this.zoneAt( hp ), wheel: this._wheelAt( hp ) };
	}

	zoneAt( p ) {
		const P = this.model.P, k = this.kind;
		const wi = this._wheelAt( p );
		if ( wi != null && k !== 'heli' ) return 'tyre';
		if ( k === 'car' ) {
			const G = P.gh;
			if ( G && p.y > G.y[ 0 ][ 1 ] - 0.55 && - p.z < G.belt[ 0 ] && - p.z > G.belt[ 1 ] ) return 'glass';
			if ( - p.z > ( P.driver?.f ?? 0 ) + 0.9 && p.y < ( G ? G.y[ 0 ][ 1 ] - 0.5 : 1.2 ) ) return 'engine';
			const fu = this.model.meta.fuel;
			if ( fu && Math.hypot( p.x - fu[ 0 ], p.z - fu[ 2 ] ) < 0.6 ) return 'fuel';
			return 'body';
		}
		if ( k === 'boat' ) return p.z > this.bounds.max.z - 0.9 ? 'engine' : 'body';
		if ( k === 'heli' ) return p.y > 2.2 && p.z > - 1.8 && p.z < 1.2 ? 'engine' : p.y > 1.4 && p.z < - 1.0 ? 'glass' : 'body';
		return p.z < - 1.5 ? 'engine' : 'body';
	}

	_wheelAt( p ) {
		for ( let i = 0; i < this.wheels.length; i ++ ) {
			const w = this.wheels[ i ];
			if ( w.skid ) continue;
			const cy = w.lp.y - w.L;
			if ( Math.hypot( p.y - cy, p.z - w.z ) < w.R + 0.02 && Math.abs( Math.abs( p.x ) - Math.abs( w.x ) ) < w.W * 0.8 ) return i;
		}
		return null;
	}

	// ---- engine -------------------------------------------------------------------------------------------------

	// why it won't start (null = it will): 'burnt' | 'fuel' | 'battery' | 'spark' | 'dead' | 'keys'
	startProblem( player ) {
		if ( this.burnt ) return 'burnt';
		if ( this.health <= this.maxHealth * 0.03 ) return 'dead';
		if ( this.flooded ) return 'dead';
		if ( this.needs.battery ) return 'battery';
		if ( this.needs.spark ) return 'spark';
		if ( this.fuel <= 0.05 ) return 'fuel';
		if ( ! this.needsKey() || this.hotwired || this.keysIn ) return null;
		if ( player && this.hasKey( player ) ) return null;
		return 'keys';
	}
	needsKey() { return this.kind === 'car' && this.typeName !== 'humvee'; }
	hasKey( player ) { return !! player.inventory.find( ( s ) => s.id === 'car_keys' && s.data?.vehicle === this.key ); }

	// ---- per-frame visuals, sounds, effects -----------------------------------------------------------------------

	updateVisual( dt, camPos ) {
		const d = camPos.distanceTo( this.pos );
		const v = this.visual;
		let lod = d > 520 ? 'hidden' : d > 75 ? 'far' : ( this.sleeping && ! this.driver && d > 12 ) ? 'parked' : 'active';
		if ( this.kind === 'heli' && this.rotor > 0.02 && lod !== 'hidden' && d < 160 ) lod = 'active';
		if ( this.kind === 'plane' && this.engine.running && lod !== 'hidden' && d < 160 ) lod = 'active';
		v.setLOD( lod );
		v.setShadow( d < 90 );
		if ( lod !== 'active' ) return lod;
		const S = this.spec.susp;
		if ( v.wheels.length ) {
			for ( let i = 0; i < v.wheels.length && i < this.wheels.length; i ++ ) {
				const w = this.wheels[ i ], W = v.wheels[ i ];
				W.pivot.position.y = w.lp.y - w.L - ( w.flat ? w.R * 0.18 : 0 );
				W.pivot.rotation.y = w.steer;
				W.spin.rotation.x = - w.spin;
				W.spin.scale.y = w.flat ? 0.86 : 1;
			}
		}
		if ( S ) v.setSteeringWheel( this.steer / Math.max( 0.1, this.spec.steer || 0.6 ) * 2.4 );
		const pt = v.parts;
		if ( this.kind === 'heli' ) {
			const r = this.rotor;
			if ( pt.rotor ) pt.rotor.rotation.y += r * 42 * dt;
			if ( pt.tailRotor ) pt.tailRotor.rotation.x += r * 190 * dt;
			if ( pt.rotorDisc ) pt.rotorDisc.visible = r > 0.55;
			if ( pt.rotorMesh ) pt.rotorMesh.visible = r < 0.85;
			if ( pt.tailRotorDisc ) pt.tailRotorDisc.visible = r > 0.4;
			if ( pt.tailRotorMesh ) pt.tailRotorMesh.visible = r < 0.7;
		} else if ( this.kind === 'plane' ) {
			const r = this.engine.running ? 0.35 + this.throttle * 0.65 : 0;
			this.propSpin = ( this.propSpin || 0 ) * ( r ? 1 : 1 - Math.min( 1, dt ) ) + r;
			if ( pt.prop ) pt.prop.rotation.z += this.propSpin * 45 * dt;
			if ( pt.propDisc ) pt.propDisc.visible = r > 0.3;
			if ( pt.propMesh ) pt.propMesh.visible = r < 0.6;
		} else if ( this.kind === 'boat' ) {
			if ( pt.motor ) pt.motor.rotation.y = - this.steer * 1.0;
			if ( pt.rudder ) pt.rudder.rotation.y = - this.steer * 0.8;
			if ( pt.prop ) pt.prop.rotation.z += ( this.engine.running ? 8 + this.throttle * 40 : 0 ) * dt;
		}
		return lod;
	}

	// lamp channels: head, tail / brake, reverse, indicators, lightbar, gauges, nav, strobe
	updateLamps( t, night ) {
		const e = this.visual.emit;
		if ( this.burnt ) return;
		const power = ! this.needs.battery && ( this.engine.running || this.driver );
		const L = this.lights && power;
		e[ EMIT.head ] = L ? 1.6 : 0;
		const brake = this.braking && this.engine.running ? 1 : 0;
		e[ EMIT.tail ] = ( L ? 0.35 : 0 ) + brake * 1.4;
		e[ EMIT.reverse ] = this.engine.gear < 0 && this.engine.running ? 1 : 0;
		const hazard = this.hazard && power && ( t % 1 ) < 0.5 ? 1.4 : 0;
		e[ EMIT.indL ] = hazard; e[ EMIT.indR ] = hazard;
		if ( this.spec.siren ) {
			const on = this.siren && power;
			const ph = ( t * 2.6 ) % 1;
			e[ EMIT.red ] = on ? ( ph < 0.25 || ( ph > 0.5 && ph < 0.6 ) ? 6 : 0.2 ) : 0;
			e[ EMIT.blue ] = on ? ( ( ph > 0.25 && ph < 0.5 ) || ph > 0.75 ? 6 : 0.2 ) : 0;
		}
		e[ EMIT.gauge ] = power ? ( 0.4 + night * 0.5 ) : 0;
		const air = this.kind !== 'car' && this.engine.running;
		e[ EMIT.nav ] = air ? 1.2 : 0;
		e[ EMIT.strobe ] = air && ( t % 1.2 ) < 0.08 ? 8 : 0;
	}

	// engine / rotor / skid loops (only for running engines near the listener)
	updateSounds( dt, listener, inside ) {
		const g = this.game, a = g.audio;
		if ( ! a?.ctx ) return;
		const d = listener.distanceTo( this.pos );
		const want = this.engine.running && d < 350 && ! this.burnt;
		const spec = this.spec, E = spec.engine;
		const loop = ( key, name ) => {
			if ( ! this.snd[ key ] ) this.snd[ key ] = a.loop( name, { pos: this.pos, vol: 0, bus: 'sfx', ref: key === 'rotor' ? 18 : 6 } );
			return this.snd[ key ];
		};
		if ( want ) {
			if ( this.kind === 'heli' ) {
				const r = this.rotor;
				loop( 'rotor', 'rotor' )?.set( 0.9 * r * ( inside ? 0.55 : 1 ), 0.5 + r * 0.55, this.pos );
				loop( 'eng', 'engine_truck' )?.set( 0.25 * ( inside ? 0.6 : 1 ), 1.6 + r * 0.9, this.pos );
			} else {
				const rpmK = this.kind === 'car' ? this.engine.rpm / E.redline : this.engine.rpm / Math.max( 1, E.redline );
				const rate = ( E.pitch || 1 ) * ( 0.55 + rpmK * 1.25 );
				const vol = ( 0.35 + this.throttle * 0.45 ) * ( inside ? 0.7 : 1 );
				loop( 'eng', E.sound || 'engine_car' )?.set( vol, rate, this.pos );
			}
		} else {
			for ( const k of [ 'eng', 'rotor' ] ) if ( this.snd[ k ] ) { this.snd[ k ].stop(); this.snd[ k ] = null; }
		}
		// tyre squeal
		let slip = 0;
		if ( this.kind === 'car' && this.speed > 3 ) for ( const w of this.wheels ) if ( w.grounded && w.surface.name === 'asphalt' ) slip = Math.max( slip, w.slip, w.lat );
		if ( slip > 0.25 && d < 150 ) loop( 'skid', 'veh_skid' )?.set( Math.min( 0.7, ( slip - 0.2 ) * 1.2 ), 0.9 + Math.min( 0.3, this.speed / 60 ), this.pos );
		else if ( this.snd.skid ) this.snd.skid.set( 0, null, this.pos );
		// water rush for boats
		if ( this.kind === 'boat' && this.inWater && this.speed > 2 && d < 200 ) loop( 'rush', 'boat_rush' )?.set( Math.min( 0.8, this.speed / 25 ), 0.8 + this.speed / 60, this.pos );
		else if ( this.snd.rush ) this.snd.rush.set( 0, null, this.pos );
		// siren
		if ( this.spec.siren && this.siren && ! this.burnt && d < 500 ) loop( 'siren', 'veh_siren' )?.set( 0.7, 1, this.pos );
		else if ( this.snd.siren ) { this.snd.siren.stop(); this.snd.siren = null; }
	}

	stopSounds() { for ( const k in this.snd ) { try { this.snd[ k ]?.stop(); } catch ( e ) { /* ended */ } this.snd[ k ] = null; } }

	// smoke from a damaged engine, the fire before the bang, exhaust, dust, spray, rotor wash
	updateEffects( dt, camPos ) {
		const g = this.game, fx = g.fx;
		if ( ! fx || camPos.distanceTo( this.pos ) > 220 ) return;
		this.fxT += dt;
		const b = this.body;
		const H = this.health / this.maxHealth;
		if ( this.burning > 0 ) {
			this.burning -= dt;
			this.health = Math.max( 1, this.health - dt * this.maxHealth * 0.01 );
			if ( ! this.fire ) this.fire = fx.fire?.( this.engineWorld( _v ).clone(), { radius: 0.8, duration: 60, intensity: 0.8 } );
			else this.fire.pos?.copy( this.engineWorld( _v ) );
			if ( this.burning <= 0 ) { this.fire?.stop?.(); this.fire = null; this.destroy( {} ); }
		}
		const emit = ( rate ) => { this._emitAcc = ( this._emitAcc || 0 ) + dt * rate; const n = Math.floor( this._emitAcc ); this._emitAcc -= n; return n; };
		// engine smoke when badly hurt (thicker and darker as it gets worse)
		if ( ! this.burnt && H < 0.35 && fx.alpha ) {
			const n = emit( 6 + ( 0.35 - H ) * 40 );
			for ( let i = 0; i < n; i ++ ) {
				const p = this.engineWorld( _v );
				const grey = H < 0.15 ? 0.08 : 0.35;
				fx.alpha.emit( { x: p.x, y: p.y + 0.2, z: p.z, vx: rr( - 0.3, 0.3 ) + b.v.x * 0.3, vy: rr( 0.6, 1.4 ), vz: rr( - 0.3, 0.3 ) + b.v.z * 0.3, life: rr( 2, 4 ), s0: 0.3, s1: rr( 1.5, 2.6 ), frame: 1, r: grey, g: grey, b: grey, a: 0.55, drag: 0.6, grav: - 0.3, rotV: rr( - 0.5, 0.5 ), fadeIn: 0.1 } );
			}
		}
		// burnt wrecks smoulder
		if ( this.burnt && fx.alpha && rnd() < dt * 3 ) {
			const p = this.pos;
			fx.alpha.emit( { x: p.x + rr( - 0.5, 0.5 ), y: p.y + this.height * 0.6, z: p.z + rr( - 0.5, 0.5 ), vx: 0.2, vy: rr( 0.4, 0.9 ), vz: 0.1, life: rr( 3, 6 ), s0: 0.4, s1: 2.5, frame: 1, r: 0.12, g: 0.12, b: 0.12, a: 0.35, drag: 0.4, grav: - 0.2, fadeIn: 0.2 } );
		}
		// fuel leak drips
		if ( this.leak && this.fuel > 0 ) this.fuel = Math.max( 0, this.fuel - dt * 0.05 );
		if ( ! fx.alpha ) return;
		// dust behind the wheels on loose ground
		if ( this.kind === 'car' && this.speed > 4 ) for ( const w of this.wheels ) {
			if ( ! w.grounded || ! w.surface.dust ) continue;
			if ( rnd() > dt * this.speed * 1.2 * w.surface.dust ) continue;
			const c = w.surface.color;
			fx.alpha.emit( { x: w.contact.x, y: w.contact.y + 0.15, z: w.contact.z, vx: - b.v.x * 0.15 + rr( - 0.5, 0.5 ), vy: rr( 0.3, 1 ), vz: - b.v.z * 0.15 + rr( - 0.5, 0.5 ), life: rr( 1.2, 2.5 ), s0: 0.3, s1: rr( 1.2, 2.2 ), frame: 4, r: c[ 0 ], g: c[ 1 ], b: c[ 2 ], a: 0.45, drag: 1.5, grav: - 0.05, rotV: rr( - 0.5, 0.5 ), fadeIn: 0.05 } );
		}
		// tyre smoke on a hard slide
		if ( this.kind === 'car' ) for ( const w of this.wheels ) {
			if ( ! w.grounded || w.surface.name !== 'asphalt' || Math.max( w.slip, w.lat ) < 0.5 || rnd() > dt * 20 ) continue;
			fx.alpha.emit( { x: w.contact.x, y: w.contact.y + 0.1, z: w.contact.z, vx: rr( - 0.3, 0.3 ), vy: rr( 0.2, 0.6 ), vz: rr( - 0.3, 0.3 ), life: rr( 1.2, 2.2 ), s0: 0.3, s1: 1.6, frame: 1, r: 0.8, g: 0.8, b: 0.8, a: 0.35, drag: 1, grav: - 0.1, fadeIn: 0.05 } );
		}
		// boats: bow spray and a wake at the stern
		if ( this.kind === 'boat' && this.inWater && this.speed > 4 ) {
			const sp = this.model.meta.spray || [ 1.5, 0 ];
			const n = Math.min( 6, Math.floor( dt * this.speed * 3 + rnd() ) );
			for ( let i = 0; i < n; i ++ ) {
				const s = rnd() < 0.5 ? - 1 : 1;
				const p = b.toWorld( _v.set( s * this.size.x * 0.4, sp[ 1 ], - sp[ 0 ] + rr( 0, 1.5 ) ), _w );
				p.y = g.physics.waterLevel( p.x, p.z ) + 0.05;
				b.right( _d ).multiplyScalar( s );
				const sv = Math.min( 1.5, this.speed / 15 );
				fx.alpha.emit( { x: p.x, y: p.y, z: p.z, vx: _d.x * rr( 2, 4 ) * sv + b.v.x * 0.4, vy: rr( 1.5, 3.5 ) * sv, vz: _d.z * rr( 2, 4 ) * sv + b.v.z * 0.4, life: rr( 0.5, 1.0 ), s0: 0.08, s1: rr( 0.5, 1.0 ) * sv, frame: 11, r: 0.92, g: 0.96, b: 1, a: 0.7, grav: 9.8, drag: 0.4, stretch: 0.02, floor: p.y - 0.1 } );
			}
			if ( rnd() < dt * 10 ) {
				const p = b.toWorld( _v.set( 0, 0, this.bounds.max.z ), _w );
				p.y = g.physics.waterLevel( p.x, p.z ) + 0.04;
				fx.alpha.emit( { x: p.x, y: p.y, z: p.z, vx: rr( - 0.5, 0.5 ), vy: 0.2, vz: rr( - 0.5, 0.5 ), life: rr( 2, 4 ), s0: 0.4, s1: rr( 2, 3.5 ), frame: 0, r: 0.9, g: 0.94, b: 0.96, a: 0.4, drag: 1.2, fadeIn: 0.05 } );
			}
		}
		// rotor wash: dust (or spray over water) blown out under the helicopter
		if ( this.kind === 'heli' && this.rotor > 0.5 ) {
			const agl = this.altitudeAGL ?? 99;
			if ( agl < 14 && rnd() < dt * 30 * ( 1 - agl / 14 ) ) {
				const a = rnd() * Math.PI * 2, r = rr( 2, 6 );
				const x = this.pos.x + Math.cos( a ) * r, z = this.pos.z + Math.sin( a ) * r;
				const gy = g.hf.heightAt( x, z ), wy = g.physics.waterLevel( x, z );
				const water = wy > gy;
				const y = Math.max( gy, wy ) + 0.1;
				const c = water ? [ 0.9, 0.94, 0.97 ] : [ 0.6, 0.53, 0.44 ];
				fx.alpha.emit( { x, y, z, vx: Math.cos( a ) * rr( 5, 10 ), vy: rr( 0.3, 1.5 ), vz: Math.sin( a ) * rr( 5, 10 ), life: rr( 1, 2 ), s0: 0.4, s1: rr( 2, 3.5 ), frame: water ? 0 : 4, r: c[ 0 ], g: c[ 1 ], b: c[ 2 ], a: water ? 0.4 : 0.35, drag: 1.4, fadeIn: 0.05 } );
			}
		}
	}

	engineWorld( out ) {
		const k = this.kind;
		const b = this.body, bb = this.bounds;
		if ( k === 'car' ) return b.toWorld( out.set( 0, this.size.y * 0.55, bb.min.z + 0.8 ), out );
		if ( k === 'boat' ) return b.toWorld( out.set( 0, 1.1, bb.max.z - 0.1 ), out );
		if ( k === 'heli' ) return b.toWorld( out.set( 0, 2.6, 1.0 ), out );
		return b.toWorld( out.set( 0, 1.3, - 2.2 ), out );
	}

	// ---- containers ---------------------------------------------------------------------------------------------

	container( which ) {
		const C = this.spec.containers;
		if ( which === 'glovebox' && ! C.glovebox ) return null;
		let c = which === 'trunk' ? this.trunk : this.glovebox;
		if ( ! c ) {
			const label = which === 'trunk' ? C.trunkLabel || 'Trunk' : 'Glovebox';
			c = { key: `veh:${this.key || this.id}:${which}`, label, capacity: which === 'trunk' ? C.trunk : C.glovebox, items: null, kind: 'vehicle' };
			if ( which === 'trunk' ) this.trunk = c; else this.glovebox = c;
		}
		// loot is rolled the first time it is opened, seeded by the vehicle so it stays the same
		if ( ! c.items ) {
			c.items = [];
			const roll = this.game.vehicles?.rollLoot;
			if ( roll && ! this.summoned ) {
				const r = seeded( hashKey( c.key ) );
				const table = which === 'trunk' ? ( C.loot || 'car_trunk' ) : 'car_glovebox';
				try {
					for ( const s of roll( table, r ) ) {
						if ( s.id === 'car_keys' && which === 'glovebox' ) s.data = { ...( s.data || {} ), vehicle: this.key };
						c.items.push( s );
					}
				} catch ( e ) { console.warn( 'vehicle loot', e ); }
			}
		}
		c.pos = this.pos; // live: the UI closes it when the player walks away
		c.capacity = which === 'trunk' ? C.trunk : C.glovebox;
		return c;
	}

	touch() { this.touched = true; }

	// ---- save ------------------------------------------------------------------------------------------------------

	serialize() {
		const b = this.body;
		const o = b.origin( _o );
		const strip = ( c ) => c && c.items ? { items: c.items } : null;
		return {
			k: this.key, t: this.typeName, site: this.site, p: [ + o.x.toFixed( 2 ), + o.y.toFixed( 2 ), + o.z.toFixed( 2 ) ], q: b.q.toArray().map( v => + v.toFixed( 4 ) ),
			fuel: + this.fuel.toFixed( 2 ), hp: Math.round( this.health ), tyres: this.tyres.slice(), crack: + this.crack.toFixed( 2 ), burnt: this.burnt ? 1 : 0, leak: this.leak ? 1 : 0,
			look: this.look, trunk: strip( this.trunk ), glove: strip( this.glovebox ), hot: this.hotwired ? 1 : 0, keys: this.keysIn ? 1 : 0, needs: this.needs, known: this.known ? 1 : 0,
			lights: this.lights ? 1 : 0, summoned: this.summoned ? 1 : 0, flooded: this.flooded ? 1 : 0,
		};
	}

	static fromRecord( game, r ) {
		const v = new Vehicle( game, r.t, {
			key: r.k, site: r.site, look: r.look, fuel: r.fuel, health: r.hp, tyres: r.tyres, crack: r.crack, burnt: !! r.burnt, leak: !! r.leak,
			hotwired: !! r.hot, keysIn: !! r.keys, needs: r.needs || {}, known: !! r.known, touched: true, persistent: true,
		} );
		v.setPose( new V3( ...r.p ), new THREE.Quaternion( ...r.q ) );
		if ( r.trunk ) v.container( 'trunk' ).items = r.trunk.items;
		if ( r.glove && v.spec.containers.glovebox ) v.container( 'glovebox' ).items = r.glove.items;
		v.lights = !! r.lights;
		v.summoned = !! r.summoned;
		v.flooded = !! r.flooded;
		return v;
	}

	update() { /* stepped by the manager */ }

	dispose() {
		super.dispose();
		this.stopSounds();
		this.fire?.stop?.();
		if ( this.box ) this.game.physics.remove( this.box );
		this.box = null;
		this.visual.dispose();
	}
}

const NO_INPUT = { forward: false, back: false, left: false, right: false, steer: 0, hand: false, up: false, down: false, rollL: false, rollR: false };
const _near = [];

// small deterministic random from a string key
export function hashKey( s ) { let h = 2166136261; for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); } return h >>> 0; }
export function seeded( seed ) {
	let a = seed >>> 0;
	return () => { a = ( a + 0x6D2B79F5 ) >>> 0; let t = a; t = Math.imul( t ^ ( t >>> 15 ), t | 1 ); t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 ); return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296; };
}
