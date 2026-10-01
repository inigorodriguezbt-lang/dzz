// One vehicle: an entity (type 'vehicle') with a rigid body, its visual, the engine, fuel, damage (body,
// tyres, glass, fuel leaks, fire, explosion), lamps, sounds, particle effects, the trunk and glovebox, and
// its save record. The manager (Vehicles.js) steps it; Entity.update is left empty so the driven vehicle,
// the camera and the player move in one place, in order.
import * as THREE from 'three';
import { Entity } from '../game/Entities.js';
import { SPECS, seatsFromModel } from './specs.js';
import { getModel } from './models/index.js';
import { VehicleVisual, EMIT } from './visual.js';
import { Body, Engine, makeWheels, hullPoints, hullContacts, stepCar, stepBike, stepBoat, stepHeli, stepPlane, wade, STEP } from './physics.js';
import { pchip } from './models/shell.js';
import { Physics } from '../game/Physics.js';

const V3 = THREE.Vector3;
const _v = new V3(), _w = new V3(), _o = new V3(), _d = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const rnd = Math.random;
const rr = ( a, b ) => a + ( b - a ) * rnd();
// crashes below this closing speed (m/s) are bumps
const CRASH_MIN = 3.5;
// m: past this a vehicle is drawn with its far model, by the quality preset
const FAR_LOD = { low: 25, medium: 35, high: 45, ultra: 75 };

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
		this.fuel = Math.min( spec.fuel.tank, o.fuel ?? spec.fuel.tank * 0.5 );
		this.seats = ( spec.seats || seatsFromModel( P ) ).map( s => ( { ...s } ) );
		if ( type === 'bus' ) for ( const f of [ 3.0, 1.4, - 0.2, - 1.8 ] ) for ( const x of [ - 0.72, 0.72 ] ) this.seats.push( { pos: [ x, 0.95, - f ], eye: [ x, 1.62, - f + 0.1 ], exit: 1 } );
		this.occupant = new Array( this.seats.length ).fill( null );

		// rigid body
		const kind = spec.kind;
		this.wheeled = kind === 'car' || kind === 'bike';
		let com;
		if ( kind === 'car' ) com = [ 0, Math.max( P.wheelR + 0.12, size.y * 0.34 ), - ( P.axleF + P.axleR ) / 2 - 0.08 ];
		else if ( kind === 'bike' ) com = [ 0, 0.58, - ( P.axleF + P.axleR ) / 2 ];
		else if ( kind === 'boat' ) com = [ 0, - 0.02, ( this.bounds.min.z + this.bounds.max.z ) / 2 + 0.25 ];
		else if ( kind === 'heli' ) com = [ 0, 1.2, 0.15 ];
		else com = [ 0, 1.4, - 0.6 ];
		const isize = kind === 'plane' ? [ 6, 1.6, 7 ] : kind === 'bike' ? [ 0.7, 1.1, size.z ] : [ size.x, size.y, size.z ];
		this.body = new Body( spec.mass, isize, com );
		this.engine = new Engine( spec );
		this.steer = 0; this.throttle = 0; this.braking = false; this.fwdSpeed = 0;
		this.rotor = 0; this.throttleSet = 0; this.lean = 0;
		// running gear and contact points
		this.wheels = [];
		if ( this.wheeled || kind === 'plane' ) this.wheels = makeWheels( m, spec );
		if ( kind === 'heli' ) this.wheels = makeWheels( { wheels: m.meta.skids.map( s => ( { x: s[ 0 ], y: 0.02, z: s[ 2 ], R: 0.02, W: 0.1, side: Math.sign( s[ 0 ] ), steer: 0, front: s[ 2 ] < 0, skid: true } ) ) }, spec );
		for ( const w of this.wheels ) if ( kind === 'heli' ) w.skid = true;
		// wheelbase (the stability aid's yaw target)
		const wz = this.wheels.filter( w => ! w.skid ).map( w => w.z );
		this.wheelbase = wz.length > 1 ? Math.max( 1, Math.max( ...wz ) - Math.min( ...wz ) ) : 2.6;
		this.hull = this._hullPoints();
		if ( kind === 'boat' ) this._buoyancy();
		this.propPoint = new V3( ...( m.meta.prop || [ 0, 0, 0 ] ) );
		this.acc = 0;
		this.sleeping = true;
		this.still = 0;
		this.driver = null; // the player when at the wheel
		this.inWater = 0;
		// damage / state
		this.tyres = o.tyres ? o.tyres.slice() : this.wheels.map( () => 0 ); // 1 = flat
		this.wheels.forEach( ( w, i ) => { w.flat = !! this.tyres[ i ]; } );
		this.crack = o.crack || 0;
		this.burnt = !! o.burnt;
		this.leak = !! o.leak;
		this.flooded = !! o.flooded;
		this.burning = 0;
		this.hotwired = !! o.hotwired;
		this.keysIn = !! o.keysIn;
		this.needs = { ...( o.needs || {} ) }; // { battery: true, spark: true }
		this.lights = false; this.siren = false; this.hazard = false;
		this.horn = 0;
		this.trunk = o.trunk || null; this.glovebox = o.glovebox || null;
		this.touched = !! o.touched;
		this.known = !! o.known;
		this.summoned = !! o.summoned;
		this.noiseT = rnd();
		this.fxT = 0;
		this.snd = {};
		this.boxes = []; // physics boxes the manager keeps on the vehicle (players and the infected collide with them)
		this.trunkLocal = this._trunkPoint();
		const ex = m.meta.exhaust;
		this.exhaust = ex ? new V3( ...ex ) : kind === 'car' ? new V3( ( P.exhaustX ?? 0.55 ) * P.W / 2, Math.max( 0.2, ( P.body?.bottom ? Math.min( ...P.body.bottom.map( p => p[ 1 ] ) ) : 0.3 ) ), this.bounds.max.z ) : null;
		if ( kind === 'bike' ) this.lean = o.burnt ? 0 : 0.16; // on the side stand
		this.trunkPos = new V3();
		this._hitWheel = null;
		if ( this.burnt ) this._applyBurnt();
		else this.visual.setLook( { crack: this.crack } );
		this._dents();
		// place
		if ( o.pos ) this.setPose( o.pos, o.quat || null, o.yaw ?? 0 );
	}

	get kind() { return this.spec.kind; }
	get name() { return this.spec.name; }
	get speed() { return this.body.v.length(); }
	get occupied() { return this.occupant.some( Boolean ); }

	// ---- pose --------------------------------------------------------------------------------------------

	// model origin position + orientation (quat, or a yaw)
	setPose( pos, quat = null, yaw = 0 ) {
		const b = this.body;
		if ( quat ) b.q.copy( quat ); else b.q.setFromEuler( _e.set( 0, yaw, 0 ) );
		b.q.normalize();
		b.updateFrames();
		b.pos.copy( b.com ).applyQuaternion( b.q ).add( pos );
		this.lastHull = null;
		this._sync();
	}

	// rest on the ground under its wheels (parked vehicles are posed, not simulated)
	settle() {
		const b = this.body, g = this.game;
		const yaw = this.yawAngle();
		const o = b.origin( _o );
		if ( this.kind === 'boat' ) {
			const wy = g.physics.waterLevel( o.x, o.z );
			const gy = g.hf.heightAt( o.x, o.z );
			// afloat (riding the waves from here on), or resting on the sand if the water is too shallow
			const y = Math.max( wy - 0.02, gy - this.bounds.min.y - 0.02 );
			this.setPose( _o.set( o.x, y, o.z ), null, yaw );
			if ( wy - 0.02 > gy - this.bounds.min.y - 0.02 && this.sleeping ) this._float();
			return;
		}
		const pts = this.kind === 'heli' ? this.model.meta.skids.map( s => [ s[ 0 ], s[ 2 ] ] ) : this.kind === 'bike' ? this.wheels.flatMap( w => [ [ - 0.2, w.z ], [ 0.2, w.z ] ] ) : this.wheels.map( w => [ w.x, w.z ] );
		if ( ! pts.length ) return;
		const c = Math.cos( yaw ), s = Math.sin( yaw );
		const top = o.y + 2;
		const hs = pts.map( ( [ x, z ] ) => {
			const wx = o.x + x * c + z * s, wz = o.z - x * s + z * c;
			return this._groundAt( wx, wz, top + 0.6 );
		} );
		// fit pitch and roll through the contact heights
		let front = 0, rear = 0, left = 0, right = 0, nf = 0, nr = 0, nl = 0, nrr = 0;
		const zs = pts.map( p => p[ 1 ] ), zmid = ( Math.min( ...zs ) + Math.max( ...zs ) ) / 2;
		pts.forEach( ( [ x, z ], i ) => { if ( z < zmid ) { front += hs[ i ]; nf ++; } else { rear += hs[ i ]; nr ++; } if ( x < 0 ) { left += hs[ i ]; nl ++; } else { right += hs[ i ]; nrr ++; } } );
		const wb = Math.max( 0.5, Math.max( ...zs ) - Math.min( ...zs ) );
		const tr = Math.max( 0.3, Math.max( ...pts.map( p => p[ 0 ] ) ) - Math.min( ...pts.map( p => p[ 0 ] ) ) );
		const pitch = nf && nr ? Math.atan2( front / nf - rear / nr, wb ) : 0;
		const roll = nl && nrr ? Math.atan2( right / nrr - left / nl, tr ) : 0;
		const y = hs.reduce( ( a, v ) => a + v, 0 ) / hs.length;
		_q.setFromEuler( _e.set( pitch, yaw, roll, 'YXZ' ) );
		this.setPose( _o.set( o.x, y, o.z ), _q );
		for ( const w of this.wheels ) { w.L = this.spec.susp.rest; w.Lprev = w.L; }
		this.body.v.set( 0, 0, 0 ); this.body.w.set( 0, 0, 0 );
	}

	// the ground (terrain or a static box) under a point, below `from`, leaving out this vehicle's own collision
	// boxes (settling onto its own roof would lift it off the ground)
	_groundAt( x, z, from ) {
		let best = this.game.hf.heightAt( x, z );
		for ( const b of this.game.physics.near( x, z, 0.05, _near ) ) {
			if ( b.owner === this || b.maxY > from || b.maxY < best ) continue;
			if ( ! Physics.inside( b, x, z, 0 ) ) continue;
			best = b.maxY;
		}
		return best;
	}

	yawAngle() { _v.set( 0, 0, - 1 ).applyQuaternion( this.body.q ); return Math.atan2( - _v.x, - _v.z ); }
	upY() { return _v.set( 0, 1, 0 ).applyQuaternion( this.body.q ).y; }

	_sync() {
		const b = this.body;
		b.origin( this.pos );
		this.object.position.copy( this.pos );
		this.object.quaternion.copy( b.q );
		if ( this.lean ) this.object.quaternion.multiply( _q.setFromAxisAngle( Z_AXIS, this.lean ) );
		this.yaw = this.yawAngle();
		this.vel.copy( b.v );
		b.toWorld( this.trunkLocal, this.trunkPos );
	}

	// ---- setup helpers --------------------------------------------------------------------------------------

	_hullPoints() {
		const P = this.model.P, bb = this.bounds, k = this.kind;
		if ( k === 'car' ) {
			return hullPoints( bb, { bottom: ( P.body?.bottom ? Math.min( ...P.body.bottom.map( p => p[ 1 ] ) ) : 0.2 ) + 0.03, belt: P.gh ? P.gh.y[ 0 ][ 1 ] - 0.55 : undefined, roofZ: P.gh ? [ - P.gh.roof[ 0 ], - P.gh.roof[ 1 ] ] : null, roofW: P.gh ? P.gh.w[ 0 ][ 1 ] / ( P.W / 2 ) : 0.75 } );
		}
		if ( k === 'bike' ) {
			const pts = [];
			for ( const [ x, y, z ] of [ [ 0, 0.35, bb.min.z + 0.05 ], [ 0, 0.4, bb.max.z - 0.05 ], [ - 0.36, 0.95, - P.axleF + 0.35 ], [ 0.36, 0.95, - P.axleF + 0.35 ], [ - 0.2, 0.55, 0 ], [ 0.2, 0.55, 0 ], [ - 0.18, 0.75, - P.axleR - 0.1 ], [ 0.18, 0.75, - P.axleR - 0.1 ], [ 0, 1.15, - P.axleF + 0.4 ] ] ) pts.push( new V3( x, y, z ) );
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
	}

	// where the trunk / bed / boat locker / baggage door is, in the model frame
	_trunkPoint() {
		const bb = this.bounds, k = this.kind, P = this.model.P;
		if ( k === 'car' ) {
			const bed = ( P.wells || [] )[ 1 ];
			if ( bed ) return new V3( 0, bed.floor + 0.3, - ( bed.f0 + bed.f1 ) / 2 );
			return new V3( 0, Math.min( bb.max.y - 0.3, 1.0 ), bb.max.z - 0.3 );
		}
		if ( k === 'bike' ) return new V3( 0, 0.8, bb.max.z - 0.3 );
		if ( k === 'boat' ) return new V3( 0, 0.4, bb.max.z - 1.0 );
		if ( k === 'heli' ) return new V3( 0.9, 1.3, 1.4 );
		return new V3( 0.5, 1.4, 1.0 );
	}

	// ---- simulation -------------------------------------------------------------------------------------------

	wake() { if ( this.sleeping ) { this.sleeping = false; this.still = 0; this.floating = false; } }

	// ---- the sea under a boat ------------------------------------------------------------------------------------

	// the ocean's height under each buoyancy point and the propeller, once a frame (the substeps reuse it: the
	// ocean's CPU query costs tens of microseconds)
	sampleSea() {
		const P = this.game.physics, b = this.body;
		const h = this.seaH ||= new Float32Array( this.buoy.length );
		for ( let i = 0; i < this.buoy.length; i ++ ) { const p = b.toWorld( this.buoy[ i ].p, _v ); h[ i ] = P.waterLevel( p.x, p.z ); }
		const pp = b.toWorld( this.propPoint, _v );
		this.propSea = P.waterLevel( pp.x, pp.z );
	}

	// a boat left alone on the water stops simulating and just rides the waves: its height, pitch and roll follow
	// the sea at the bow and either side of the stern, sampled a few times a second (woken by anything that
	// touches it)
	_float() {
		const b = this.body, bb = this.bounds;
		this.floating = true;
		this.bobT = 0;
		const hw = ( bb.max.x - bb.min.x ) / 2;
		this.bobPts = [ [ 0, bb.min.z * 0.65 ], [ - hw * 0.7, bb.max.z * 0.65 ], [ hw * 0.7, bb.max.z * 0.65 ] ];
		this.bobL = ( bb.max.z - bb.min.z ) * 0.65; this.bobW = hw * 1.4;
		_e.setFromQuaternion( b.q, 'YXZ' );
		const B = this.bobBase ||= {};
		B.yaw = _e.y; B.pitch = _e.x; B.roll = _e.z; B.y = this.pos.y;
		this._bobSample( B );
		this.bobCur = { y: B.y, pitch: B.pitch, roll: B.roll };
		this.bobTgt = { ...this.bobCur };
	}

	_bobSample( out ) {
		const P = this.game.physics, o = this.pos, yaw = this.bobBase.yaw;
		const c = Math.cos( yaw ), s = Math.sin( yaw ), pts = this.bobPts;
		const h = ( i ) => P.waterLevel( o.x + pts[ i ][ 0 ] * c + pts[ i ][ 1 ] * s, o.z - pts[ i ][ 0 ] * s + pts[ i ][ 1 ] * c );
		out.bow = h( 0 ); out.l = h( 1 ); out.r = h( 2 );
		out.mean = ( out.bow + out.l + out.r ) / 3;
		return out;
	}

	bob( dt ) {
		if ( ! this.floating ) return;
		const B = this.bobBase, T = this.bobTgt, C = this.bobCur;
		this.bobT -= dt;
		if ( this.bobT <= 0 ) {
			this.bobT = 0.15;
			const S = this._bobSample( this._bobS ||= {} );
			// (a swell far bigger than the hull's reach: it rides the mean, pitched and rolled by the slopes)
			T.y = B.y + ( S.mean - B.mean );
			T.pitch = B.pitch + Math.atan2( ( S.bow - ( S.l + S.r ) / 2 ) - ( B.bow - ( B.l + B.r ) / 2 ), this.bobL ) * 0.8;
			T.roll = B.roll + Math.atan2( ( S.r - S.l ) - ( B.r - B.l ), this.bobW ) * 0.8;
		}
		const k = Math.min( 1, dt * 5 );
		C.y += ( T.y - C.y ) * k; C.pitch += ( T.pitch - C.pitch ) * k; C.roll += ( T.roll - C.roll ) * k;
		_q.setFromEuler( _e.set( C.pitch, B.yaw, C.roll, 'YXZ' ) );
		this.setPose( _o.set( this.pos.x, C.y, this.pos.z ), _q );
	}

	// fixed-step physics; inp = the driver's input (null: nobody at the controls)
	simulate( dt, inp ) {
		if ( this.sleeping ) return;
		const game = this.game;
		const I = inp || NO_INPUT;
		this.acc = Math.min( this.acc + dt, STEP * 8 );
		const gh = game.hf.heightAt( this.pos.x, this.pos.z );
		// (the sea only where the ground is low: the ocean query is costly)
		this.altitudeAGL = this.pos.y - ( gh < 3 ? Math.max( gh, game.physics.waterLevel( this.pos.x, this.pos.z ) ) : gh );
		const crash = this._crash ||= { speed: 0, what: null, point: new V3() };
		let crashed = false;
		if ( this.kind === 'boat' ) this.sampleSea();
		while ( this.acc >= STEP ) {
			this.acc -= STEP;
			const b = this.body;
			b.F.y -= b.m * 9.81;
			const k = this.kind;
			if ( k === 'car' ) this.fwdSpeed = stepCar( this, STEP, I );
			else if ( k === 'bike' ) this.fwdSpeed = stepBike( this, STEP, I );
			else if ( k === 'boat' ) this.fwdSpeed = stepBoat( this, STEP, I );
			else if ( k === 'heli' ) this.fwdSpeed = stepHeli( this, STEP, I );
			else this.fwdSpeed = stepPlane( this, STEP, I );
			// everything but a boat wallows and slows in water, and sinks
			if ( k !== 'boat' ) this.inWater = wade( this, STEP );
			b.integrate( STEP );
			const c = hullContacts( this, STEP );
			if ( c.speed > CRASH_MIN && ( ! crashed || c.speed > crash.speed ) ) { crashed = true; crash.speed = c.speed; crash.what = c.what; crash.point.copy( c.point ); }
			// rotor strike: blade tips into anything solid
			if ( k === 'heli' && this.rotor > 0.3 ) this._rotorStrike();
		}
		this._sync();
		if ( crashed ) this.onCrash( crash );
		for ( const w of this.wheels ) w.spin += w.spinV * dt;
		// a drowned engine: the air intake under water
		if ( this.kind !== 'boat' && this.inWater > 0 && ! this.flooded ) {
			const e = this.engineWorld( _v );
			if ( game.physics.waterLevel( e.x, e.z ) > e.y + 0.05 ) {
				this.flooded = true;
				if ( this.engine.running ) this.game.vehicles?.stall?.( this, 'Engine flooded' );
			}
		}
		// fall asleep when nothing is happening (parked, nobody inside); a boat on the water only has to stop drifting
		// (the waves keep it rocking) and then just rides them (bob)
		const bv = this.body.v, boat = this.kind === 'boat';
		const moving = boat ? bv.x * bv.x + bv.z * bv.z > 0.25 || Math.abs( this.body.w.y ) > 0.1 : bv.lengthSq() > 0.02 || this.body.w.lengthSq() > 0.01;
		if ( ! this.driver && ! this.engine.running && ! moving && this.rotor < 0.05 && ! this.burning ) {
			this.still += dt;
			if ( this.still > ( boat ? 3 : 1.5 ) ) {
				this.sleeping = true; this.body.v.set( 0, 0, 0 ); this.body.w.set( 0, 0, 0 );
				if ( boat && this.inWater > 0.1 ) this._float();
			}
		} else this.still = 0;
		// out of the world: fell through the ground
		const gy = game.hf.heightAt( this.pos.x, this.pos.z );
		if ( this.pos.y < gy - 6 && this.kind !== 'boat' ) { this.pos.y = gy + 0.5; this.setPose( this.pos, this.body.q ); this.settle(); }
	}

	_rotorStrike() {
		const g = this.game, b = this.body;
		const hub = b.toWorld( _v.set( ...this.model.meta.rotor ), _w );
		b.up( _d );
		const R = this.spec.rotorR;
		for ( let i = 0; i < 8; i ++ ) {
			const a = i / 8 * Math.PI * 2;
			_v.set( Math.cos( a ) * R, 0, Math.sin( a ) * R ).applyQuaternion( b.q ).add( hub );
			const gy = Math.max( g.hf.heightAt( _v.x, _v.z ), g.physics.waterLevel( _v.x, _v.z ) );
			let hit = _v.y < gy + 0.1;
			if ( ! hit ) for ( const bx of g.physics.near( _v.x, _v.z, 0.2, _near ) ) if ( bx.owner !== this && _v.y > bx.minY && _v.y < bx.maxY && bx.kind !== 'noclimb' ) { hit = true; break; }
			if ( hit ) {
				this.rotor *= 0.2;
				g.audio?.play( 'crash', { pos: _v, vol: 1.2, max: 400 } );
				g.fx?.sparks?.( _v.clone(), _d.clone(), 20, { speed: 14 } );
				this.damage( this.maxHealth * 0.6, { kind: 'crash', zone: 'rotor' } );
				return;
			}
		}
	}

	onCrash( c ) {
		const g = this.game;
		const s = c.speed;
		const at = c.point.clone(); // (the contact record is reused every step)
		const kind = this.kind;
		// aircraft are fragile, big trucks shrug off bumps. A car takes about a third of its health hitting a wall at
		// 70 km/h, most of it at 100; a wreck catches fire rather than blowing up on the spot (see damage)
		const k = ( kind === 'heli' || kind === 'plane' ? 2.5 : kind === 'boat' ? 0.6 : kind === 'bike' ? 1.4 : 1 ) * ( 1500 / Math.max( 800, this.spec.mass ) ) ** 0.3;
		const dmg = ( s - CRASH_MIN ) * ( s - CRASH_MIN ) * 1.5 * k * ( this.maxHealth / 1000 ) ** 0.5;
		if ( dmg > 2 ) this.damage( dmg, { kind: 'crash', zone: 'body', point: at } );
		this.touch();
		// the other vehicle in a collision takes its share (its own contact test sees no closing speed: the impulse
		// has already been shared out)
		if ( c.what && c.what.isVehicle ) {
			const o = c.what;
			const ko = ( o.kind === 'heli' || o.kind === 'plane' ? 2.5 : o.kind === 'bike' ? 1.4 : 1 ) * ( 1500 / Math.max( 800, o.spec.mass ) ) ** 0.3;
			const share = this.spec.mass / ( this.spec.mass + o.spec.mass ) * 2;
			const d2 = ( s - CRASH_MIN ) * ( s - CRASH_MIN ) * 1.5 * ko * share * ( o.maxHealth / 1000 ) ** 0.5;
			if ( d2 > 2 ) o.damage( d2, { kind: 'crash', zone: 'body', point: at, source: this.driver || this } );
			o.touch();
		}
		if ( s > 5 ) {
			g.audio?.play( s > 11 ? 'crash' : 'hit_metal', { pos: at, vol: Math.min( 1.3, s / 12 ), max: 250, rate: s > 11 ? 1 : 0.7 } );
			g.events.emit( 'noise', { pos: this.pos.clone(), radius: Math.min( 120, s * 8 ), source: this.driver || this, kind: 'crash' } );
			if ( g.fx?.sparks ) g.fx.sparks( at, _v.copy( this.body.v ).normalize().negate().clone(), Math.min( 24, Math.round( s ) ), { speed: 8 } );
			if ( s > 9 ) { this.crack = Math.min( 1, this.crack + ( s - 8 ) * 0.08 ); this.visual.setLook( { crack: this.crack } ); }
		}
		// the people inside feel it (a biker is thrown clear by the manager)
		if ( this.driver && s > 9 ) {
			g.player.shake = Math.max( g.player.shake || 0, Math.min( 1.2, s / 16 ) );
			if ( s > 15 ) g.survival?.hurt( ( s - 15 ) * ( s - 15 ) * ( kind === 'bike' ? 1.6 : 0.6 ), 'vehicle', { cause: 'a crash' } );
		} else if ( this.driver && s > 5 ) g.player.shake = Math.max( g.player.shake || 0, s / 25 );
		if ( this.driver && kind === 'bike' && s > 11 ) g.vehicles?.throwOff?.( this );
	}

	// ---- damage -------------------------------------------------------------------------------------------------

	// bullets, blasts, crashes, the infected clawing at it
	damage( amount, info = {} ) {
		if ( this.burnt || ! ( amount > 0 ) ) return;
		const g = this.game;
		const kind = info.kind || 'bullet';
		let body = amount;
		if ( kind === 'bullet' || kind === 'arrow' ) {
			const z = info.zone;
			const wi = info.wheel ?? this._hitWheel;
			if ( z === 'tyre' && wi != null && this.wheels[ wi ] ) { if ( kind === 'bullet' || rnd() < 0.3 ) this.setFlat( wi ); body = amount * 0.1; }
			else if ( z === 'glass' ) { this.crack = Math.min( 1, this.crack + 0.3 ); this.visual.setLook( { crack: this.crack } ); body = amount * 0.2; this._passThrough( amount, info ); g.audio?.play( 'glass', { pos: info.point || this.pos, vol: 0.5, max: 80 } ); }
			else if ( z === 'engine' ) body = amount * 1.6;
			else if ( z === 'fuel' ) { body = amount * 0.8; if ( ! this.leak && rnd() < 0.5 ) this.leak = true; }
			else body = amount * 0.45;
		} else if ( kind === 'explosion' ) {
			body = amount * 3.5;
			this.crack = 1; this.visual.setLook( { crack: 1 } );
			this.wheels.forEach( ( w, i ) => { if ( rnd() < 0.3 ) this.setFlat( i ); } );
			if ( this.driver ) g.survival?.hurt( amount * 0.25, 'explosion', { cause: 'an explosion' } );
		} else if ( kind === 'melee' || kind === 'zombie' || kind === 'bite' || kind === 'scratch' || kind === 'animal' ) {
			body = amount * 0.25;
			if ( rnd() < 0.15 ) { this.crack = Math.min( 1, this.crack + 0.12 ); this.visual.setLook( { crack: this.crack } ); }
			// on a bike, a jet ski or behind smashed windows the hands reach the rider
			if ( kind !== 'melee' && this.occupied && ( this.spec.open || this.crack > 0.75 ) && rnd() < ( this.spec.open ? 0.8 : 0.4 ) ) {
				g.survival?.hurt( amount * 1.4, kind === 'bite' ? 'bite' : kind === 'animal' ? 'animal' : 'scratch', { dir: info.dir, cause: 'the infected' } );
			}
		}
		this.touch();
		// a crash that would finish it off sets it on fire instead (time to get out), unless it was already done for
		if ( kind === 'crash' && this.health - body <= 0 && this.health > this.maxHealth * 0.03 && ! this.burning ) body = this.health - this.maxHealth * 0.02;
		this.health = Math.max( 0, this.health - body );
		this._dents();
		if ( this.health <= 0 ) this.destroy( info );
		else if ( this.health < this.maxHealth * 0.1 && ! this.burning && kind !== 'melee' && kind !== 'zombie' ) this.burning = 12 + rnd() * 10; // a fire that ends in an explosion
	}

	// a bullet through the glass can reach whoever sits behind it
	_passThrough( amount, info ) {
		const g = this.game;
		if ( ! this.occupied || info.source === g.player ) return;
		if ( rnd() < 0.5 ) g.survival?.hurt( amount * 0.6, 'bullet', { dir: info.dir, zone: rnd() < 0.2 ? 'head' : 'torso', cause: 'a gunshot' } );
	}

	// panels dent as the body takes damage (on top of the dings it was found with)
	_dents() {
		const d = Math.min( 1, ( this.look.dent || 0 ) + Math.max( 0, 1 - this.health / this.maxHealth ) * 1.4 );
		if ( Math.abs( d - ( this._dent ?? - 1 ) ) > 0.02 ) { this._dent = d; this.visual.setLook( { dent: d } ); }
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
		this.alive = false;
		this.health = 0;
		this.engine.running = false;
		this.fuel = 0;
		this.burning = 0;
		const air = this.kind === 'heli' || this.kind === 'plane';
		if ( g.ballistics?.explode ) g.ballistics.explode( p, { radius: air ? 11 : 9, damage: 160, source: info.source || this, weapon: 'vehicle', cause: 'an explosion' } );
		else { g.fx?.explosion?.( p, air ? 9 : 7 ); g.audio?.play( 'explosion', { pos: p, vol: 1.3, max: 1800, ref: 12 } ); }
		this.fire = g.fx?.fire?.( this.pos.clone(), { radius: Math.min( 3, this.radius * 0.7 ), duration: 40, intensity: 1.2 } );
		this.wake();
		this.body.v.y += 3.5;
		this.body.w.x += rr( - 1.5, 1.5 ); this.body.w.z += rr( - 1.5, 1.5 );
		this.touch();
		g.vehicles?.onDestroyed?.( this, info );
	}

	_applyBurnt() {
		this.burnt = true;
		this.visual.setLook( { burnt: 1, crack: 1 } );
		this.crack = 1;
		this.visual.emit.fill( 0 );
		this.wheels.forEach( ( w, i ) => { this.tyres[ i ] = 1; w.flat = true; } );
		this.needs = {};
		this.lights = false; this.siren = false;
		this.stopSounds();
	}

	// ray (o, d unit) vs the body box in its own frame; zone by where it lands
	hitTest( o, d, maxT ) {
		const b = this.body;
		const org = b.origin( _o );
		// into the model frame
		const lo = _v.subVectors( o, org ).applyQuaternion( _q.copy( b.q ).invert() );
		const ld = _w.copy( d ).applyQuaternion( _q );
		const mn = this.bounds.min, mx = this.bounds.max;
		let t0 = 0, t1 = maxT;
		for ( const ax of AXES ) {
			const lo_ = ax === 'y' ? Math.max( mn.y, this.kind === 'boat' ? mn.y : 0.12 ) : mn[ ax ] + 0.03, hi = mx[ ax ] - 0.03;
			if ( Math.abs( ld[ ax ] ) < 1e-9 ) { if ( lo[ ax ] < lo_ || lo[ ax ] > hi ) return null; continue; }
			let a = ( lo_ - lo[ ax ] ) / ld[ ax ], c = ( hi - lo[ ax ] ) / ld[ ax ];
			if ( a > c ) { const t = a; a = c; c = t; }
			t0 = Math.max( t0, a ); t1 = Math.min( t1, c );
			if ( t0 > t1 ) return null;
		}
		const hp = _d.copy( lo ).addScaledVector( ld, t0 );
		// the plane: only the fuselage and the wing slab; the helicopter: the cabin and the boom, not the air around it
		if ( this.kind === 'plane' && Math.abs( hp.x ) > 0.7 && ( hp.y < 2.05 || hp.y > 2.5 ) ) return null;
		if ( this.kind === 'heli' && hp.z > 2.4 && ( Math.abs( hp.x ) > 0.5 || hp.y < 1.4 ) && hp.z < 6.4 ) return null;
		if ( this.kind === 'bike' && Math.abs( hp.x ) > 0.45 && hp.y < 0.8 ) return null;
		this._hitWheel = this._wheelAt( hp );
		return { t: t0, zone: this.zoneAt( hp ), wheel: this._hitWheel, local: hp };
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
		if ( k === 'bike' ) return p.y < 0.85 && Math.abs( p.z + ( P.axleF + P.axleR ) / 2 ) < 0.35 ? 'engine' : 'body';
		if ( k === 'boat' ) return p.z > this.bounds.max.z - 0.9 ? 'engine' : 'body';
		if ( k === 'heli' ) return p.y > 2.2 && p.z > - 1.8 && p.z < 1.2 ? 'engine' : p.y > 1.4 && p.z < - 1.0 ? 'glass' : 'body';
		return p.z < - 1.5 ? 'engine' : 'body';
	}

	_wheelAt( p ) {
		for ( let i = 0; i < this.wheels.length; i ++ ) {
			const w = this.wheels[ i ];
			if ( w.skid ) continue;
			const cy = w.lp.y - w.L;
			if ( Math.hypot( p.y - cy, p.z - w.z ) < w.R + 0.02 && Math.abs( p.x - w.x ) < w.W * 0.8 ) return i;
		}
		return null;
	}

	// ---- engine -------------------------------------------------------------------------------------------------

	// why it won't start (null = it will): 'burnt' | 'dead' | 'flooded' | 'battery' | 'spark' | 'fuel' | 'keys'
	startProblem( player ) {
		if ( this.burnt ) return 'burnt';
		if ( this.health <= this.maxHealth * 0.03 ) return 'dead';
		if ( this.flooded ) return 'flooded';
		if ( this.needs.battery ) return 'battery';
		if ( this.needs.spark ) return 'spark';
		if ( this.fuel <= 0.05 ) return 'fuel';
		if ( ! this.needsKey() || this.hotwired || this.keysIn ) return null;
		if ( player && this.hasKey( player ) ) return null;
		return 'keys';
	}
	needsKey() { return ( this.kind === 'car' || this.kind === 'bike' ) && this.typeName !== 'humvee'; }
	hasKey( player ) {
		const inv = player.inventory;
		if ( ! inv?.find ) return false;
		if ( inv.find( ( s ) => s.id === 'car_keys' && s.data?.vehicle === this.key ) ) return true;
		// keys found loose (a house, a pocket) belong to some car out there: one in six fits, and stays bound to it
		const loose = inv.find( ( s ) => s.id === 'car_keys' && ! s.data?.vehicle && hashKey( s.uid + '|' + this.key ) % 6 === 0 );
		if ( ! loose ) return false;
		loose.data = { ...( loose.data || {} ), vehicle: this.key };
		inv.changed?.();
		this.game.toast?.( 'Keys fit', 'good' );
		return true;
	}

	// ---- per-frame visuals, sounds, effects -----------------------------------------------------------------------

	updateVisual( dt, camPos, inside = false ) {
		const d = camPos.distanceTo( this.pos );
		const v = this.visual;
		// (the near models are ~50k triangles: past a few dozen metres the far one looks the same, at a fifth of
		// the cost in the view and in every sun cascade)
		const far = FAR_LOD[ this.game.settings?.get?.( 'quality' ) ] ?? 45;
		let lod = d > 520 ? 'hidden' : d > far ? 'far' : ( this.sleeping && ! this.driver && d > 12 ) ? 'parked' : 'active';
		if ( inside ) lod = 'active';
		if ( this.kind === 'heli' && this.rotor > 0.02 && lod !== 'hidden' && d < 160 ) lod = 'active';
		if ( this.kind === 'plane' && this.engine.running && lod !== 'hidden' && d < 160 ) lod = 'active';
		v.setLOD( lod );
		v.setShadow( d < 90 );
		if ( lod !== 'active' ) return lod;
		for ( let i = 0; i < v.wheels.length && i < this.wheels.length; i ++ ) {
			const w = this.wheels[ i ], W = v.wheels[ i ];
			W.pivot.position.y = w.lp.y - w.L - ( w.flat ? w.R * 0.18 : 0 );
			W.pivot.rotation.y = w.steer;
			W.spin.rotation.x = - w.spin;
			W.spin.scale.y = w.flat ? 0.86 : 1;
		}
		// the steering part: a wheel turns up to about a quarter turn each way (the hands stay on it), handlebars by the
		// steering angle, the aeroplane's yoke with the ailerons
		const St = this.model.P.steer;
		if ( St ) v.setSteeringWheel( this.kind === 'bike' ? this.steer : St.axis === 'y' ? this.steer / Math.max( 0.1, this.spec.steer || 0.5 ) * 0.45 : this.kind === 'plane' ? ( this.aileron || 0 ) * 0.75 : this.steer / Math.max( 0.1, this.spec.steer || 0.6 ) * 1.45 );
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
			this.propSpin = ( this.propSpin || 0 ) + ( r - ( this.propSpin || 0 ) ) * Math.min( 1, dt * ( r ? 2 : 0.6 ) );
			if ( pt.prop ) pt.prop.rotation.z += this.propSpin * 45 * dt;
			if ( pt.propDisc ) pt.propDisc.visible = this.propSpin > 0.3;
			if ( pt.propMesh ) pt.propMesh.visible = this.propSpin < 0.6;
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
		const power = ! this.needs.battery && ( this.engine.running || !! this.driver );
		const L = this.lights && power;
		e[ EMIT.head ] = L ? 1.6 : 0;
		const brake = this.braking && power ? 1 : 0;
		e[ EMIT.tail ] = ( L ? 0.35 : 0 ) + brake * 1.4;
		e[ EMIT.reverse ] = this.engine.gear < 0 && this.engine.running && this.wheeled ? 1 : 0;
		const hazard = this.hazard && ( t % 1 ) < 0.5 ? 1.4 : 0;
		e[ EMIT.indL ] = hazard; e[ EMIT.indR ] = hazard;
		if ( this.spec.siren ) {
			const on = this.siren && power;
			const ph = ( t * 2.6 ) % 1;
			e[ EMIT.red ] = on ? ( ph < 0.25 || ( ph > 0.5 && ph < 0.6 ) ? 6 : 0.2 ) : 0;
			e[ EMIT.blue ] = on ? ( ( ph > 0.25 && ph < 0.5 ) || ph > 0.75 ? 6 : 0.2 ) : 0;
		}
		e[ EMIT.gauge ] = power ? ( 0.5 + night * 1.3 ) : 0;
		const air = ( this.kind === 'heli' || this.kind === 'plane' || this.kind === 'boat' ) && power;
		e[ EMIT.nav ] = air ? 1.2 : 0;
		e[ EMIT.strobe ] = air && this.kind !== 'boat' && ( t % 1.2 ) < 0.08 ? 8 : 0;
	}

	// engine / rotor / skid / water loops (only near the listener)
	updateSounds( dt, listener, inside ) {
		const g = this.game, a = g.audio;
		if ( ! a?.ctx ) return;
		const d = listener.distanceTo( this.pos );
		const spec = this.spec, E = spec.engine;
		const loop = ( key, name, ref = 6 ) => {
			if ( ! this.snd[ key ] ) this.snd[ key ] = a.loop( name, { pos: this.pos, vol: 0, bus: 'sfx', ref } );
			return this.snd[ key ];
		};
		const stop = ( key ) => { if ( this.snd[ key ] ) { this.snd[ key ].stop(); this.snd[ key ] = null; } };
		const heard = d < ( this.kind === 'heli' || this.kind === 'plane' ? 900 : 320 ) && ! this.burnt;
		const rotorOn = this.kind === 'heli' && this.rotor > 0.02;
		if ( heard && ( this.engine.running || rotorOn ) ) {
			if ( this.kind === 'heli' ) {
				const r = this.rotor;
				loop( 'rotor', 'rotor', 30 )?.set( 0.9 * r * ( inside ? 0.6 : 1 ), 0.5 + r * 0.55, this.pos );
				if ( this.engine.running ) loop( 'eng', 'engine_truck', 10 )?.set( 0.25 * ( inside ? 0.6 : 1 ), 1.6 + r * 0.9, this.pos ); else stop( 'eng' );
			} else {
				const rpmK = this.engine.rpm / Math.max( 1, E.redline );
				const rate = ( E.pitch || 1 ) * ( 0.55 + rpmK * 1.25 );
				const vol = ( 0.35 + this.throttle * 0.45 ) * ( inside ? 0.7 : 1 ) * ( this.kind === 'plane' ? 1.4 : 1 );
				loop( 'eng', E.sound || 'engine_car', this.kind === 'plane' ? 20 : 6 )?.set( vol, rate, this.pos );
			}
		} else { stop( 'eng' ); stop( 'rotor' ); }
		// tyre squeal on hard surfaces, road roar with speed
		let slip = 0;
		if ( this.wheeled && this.speed > 3 ) for ( const w of this.wheels ) if ( w.grounded && ( w.surface.name === 'asphalt' || w.surface.name === 'wood' || w.surface.name === 'metal' ) ) slip = Math.max( slip, w.slip, w.lat );
		if ( slip > 0.25 && d < 150 ) loop( 'skid', 'veh_skid', 8 )?.set( Math.min( 0.7, ( slip - 0.2 ) * 1.2 ), 0.9 + Math.min( 0.3, this.speed / 60 ), this.pos );
		else if ( this.snd.skid ) this.snd.skid.set( 0, null, this.pos );
		const rolling = this.wheeled && this.wheels.some( w => w.grounded ) ? this.speed : 0;
		if ( rolling > 2 && d < 80 ) loop( 'road', 'veh_road', 5 )?.set( Math.min( 0.55, rolling / 50 ) * ( inside ? 0.8 : 1 ), 0.7 + Math.min( 0.8, rolling / 40 ), this.pos );
		else if ( this.snd.road ) this.snd.road.set( 0, null, this.pos );
		// water rush for boats
		if ( this.kind === 'boat' && this.inWater && this.speed > 2 && d < 200 ) loop( 'rush', 'boat_rush', 8 )?.set( Math.min( 0.8, this.speed / 25 ), 0.8 + this.speed / 60, this.pos );
		else if ( this.snd.rush ) this.snd.rush.set( 0, null, this.pos );
		// the rush of air at speed, heard from inside
		const air = inside ? Math.max( 0, this.speed - 12 ) : 0;
		if ( air > 0 ) loop( 'wind', 'wind_loop', 4 )?.set( Math.min( 0.6, air / 60 ), 0.8 + Math.min( 0.6, air / 80 ), this.pos );
		else if ( this.snd.wind ) this.snd.wind.set( 0, null, this.pos );
		// siren
		if ( this.spec.siren && this.siren && ! this.burnt && d < 600 ) loop( 'siren', 'veh_siren', 20 )?.set( 0.75, 1, this.pos );
		else stop( 'siren' );
	}

	stopSounds() { for ( const k in this.snd ) { try { this.snd[ k ]?.stop(); } catch ( e ) { /* ended */ } this.snd[ k ] = null; } }

	// smoke from a damaged engine, the fire before the bang, dust, tyre smoke, spray, rotor wash
	updateEffects( dt, camPos ) {
		const g = this.game, fx = g.fx;
		const b = this.body;
		// the fire burns down whether or not anyone watches
		if ( this.burning > 0 ) {
			this.burning -= dt;
			this.health = Math.max( 1, this.health - dt * this.maxHealth * 0.01 );
			if ( fx?.fire ) {
				if ( ! this.fire || ! this.fire.alive ) this.fire = fx.fire( this.engineWorld( _v ).clone(), { radius: 0.8, duration: 60, intensity: 0.8 } );
				else this.fire.pos.copy( this.engineWorld( _v ) );
			}
			if ( this.burning <= 0 ) { this.fire?.stop?.(); this.fire = null; this.destroy( {} ); }
		}
		if ( this.leak && this.fuel > 0 ) this.fuel = Math.max( 0, this.fuel - dt * 0.05 );
		if ( ! fx?.alpha || camPos.distanceTo( this.pos ) > 220 ) return;
		this.fxT += dt;
		const H = this.health / this.maxHealth;
		const emit = ( rate ) => { this._emitAcc = ( this._emitAcc || 0 ) + dt * rate; const n = Math.floor( this._emitAcc ); this._emitAcc -= n; return n; };
		// engine smoke when badly hurt and running (thicker and darker as it gets worse)
		if ( ! this.burnt && H < 0.35 && ( this.engine.running || this.burning > 0 ) ) {
			const n = emit( 6 + ( 0.35 - H ) * 40 );
			for ( let i = 0; i < n; i ++ ) {
				const p = this.engineWorld( _v );
				const grey = H < 0.15 ? 0.08 : 0.35;
				fx.alpha.emit( { x: p.x, y: p.y + 0.2, z: p.z, vx: rr( - 0.3, 0.3 ) + b.v.x * 0.3, vy: rr( 0.6, 1.4 ), vz: rr( - 0.3, 0.3 ) + b.v.z * 0.3, life: rr( 2, 4 ), s0: 0.3, s1: rr( 1.5, 2.6 ), frame: 1, r: grey, g: grey, b: grey, a: 0.55, drag: 0.6, grav: - 0.3, rotV: rr( - 0.5, 0.5 ), fadeIn: 0.1 } );
			}
		}
		// burnt wrecks smoulder for a while
		if ( this.burnt && this.fxT < 600 && rnd() < dt * 3 ) {
			const p = this.pos;
			fx.alpha.emit( { x: p.x + rr( - 0.5, 0.5 ), y: p.y + this.height * 0.6, z: p.z + rr( - 0.5, 0.5 ), vx: 0.2, vy: rr( 0.4, 0.9 ), vz: 0.1, life: rr( 3, 6 ), s0: 0.4, s1: 2.5, frame: 1, r: 0.12, g: 0.12, b: 0.12, a: 0.35, drag: 0.4, grav: - 0.2, fadeIn: 0.2 } );
		}
		// exhaust puffs from a running engine on a cold start / hard throttle
		if ( this.wheeled && this.engine.running && ! this.burnt && this.exhaust && rnd() < dt * ( 2 + this.throttle * 10 ) ) {
			const p = b.toWorld( this.exhaust, _v );
			fx.alpha.emit( { x: p.x, y: p.y, z: p.z, vx: b.v.x * 0.5 + rr( - 0.2, 0.2 ), vy: rr( 0.1, 0.4 ), vz: b.v.z * 0.5 + rr( - 0.2, 0.2 ), life: rr( 0.8, 1.6 ), s0: 0.06, s1: rr( 0.4, 0.8 ), frame: 0, r: 0.6, g: 0.6, b: 0.62, a: 0.12 + this.throttle * 0.1, drag: 1.5, grav: - 0.2, fadeIn: 0.05 } );
		}
		// dust behind the wheels on loose ground
		if ( this.wheeled && this.speed > 4 ) for ( const w of this.wheels ) {
			if ( ! w.grounded || ! w.surface.dust ) continue;
			if ( rnd() > dt * this.speed * 1.2 * w.surface.dust ) continue;
			const c = w.surface.color;
			fx.alpha.emit( { x: w.contact.x, y: w.contact.y + 0.15, z: w.contact.z, vx: - b.v.x * 0.15 + rr( - 0.5, 0.5 ), vy: rr( 0.3, 1 ), vz: - b.v.z * 0.15 + rr( - 0.5, 0.5 ), life: rr( 1.2, 2.5 ), s0: 0.3, s1: rr( 1.2, 2.2 ), frame: 4, r: c[ 0 ], g: c[ 1 ], b: c[ 2 ], a: 0.45, drag: 1.5, grav: - 0.05, rotV: rr( - 0.5, 0.5 ), fadeIn: 0.05 } );
		}
		// tyre smoke on a hard slide
		if ( this.wheeled ) for ( const w of this.wheels ) {
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
		if ( k === 'car' ) return b.toWorld( out.set( 0, this.size.y * 0.45, bb.min.z + 0.8 ), out );
		if ( k === 'bike' ) return b.toWorld( out.set( 0, 0.55, - ( this.model.P.axleF + this.model.P.axleR ) / 2 ), out );
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
			const label = which === 'trunk' ? C.trunkLabel || 'Trunk' : this.kind === 'car' ? 'Glovebox' : 'Console';
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
						if ( s.id === 'car_keys' ) s.data = { ...( s.data || {} ), vehicle: this.key };
						c.items.push( s );
					}
				} catch ( e ) { console.warn( 'vehicle loot', e ); }
			}
		}
		c.label = which === 'trunk' ? C.trunkLabel || 'Trunk' : this.kind === 'car' ? 'Glovebox' : 'Console';
		c.kind = 'vehicle';
		// live: the UI closes it when the player walks away from the trunk (or out of the seat)
		c.pos = which === 'trunk' ? this.trunkPos : this.pos;
		c.capacity = which === 'trunk' ? C.trunk : C.glovebox;
		this.touch();
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
			hotwired: !! r.hot, keysIn: !! r.keys, needs: r.needs || {}, known: !! r.known, touched: true, persistent: true, summoned: !! r.summoned, flooded: !! r.flooded,
		} );
		v.setPose( new V3( ...r.p ), new THREE.Quaternion( ...r.q ) );
		if ( r.trunk ) v.trunk = { key: `veh:${r.k}:trunk`, label: '', capacity: 0, items: r.trunk.items, kind: 'vehicle' };
		if ( r.glove && v.spec.containers.glovebox ) v.glovebox = { key: `veh:${r.k}:glovebox`, label: '', capacity: 0, items: r.glove.items, kind: 'vehicle' };
		v.lights = !! r.lights;
		return v;
	}

	update() { /* stepped by the manager */ }

	dispose() {
		super.dispose();
		this.stopSounds();
		this.fire?.stop?.();
		this.fire = null;
		for ( const bx of this.boxes ) this.game.physics.remove( bx );
		this.boxes.length = 0;
		this.visual.dispose();
	}
}

const AXES = [ 'x', 'y', 'z' ];
const Z_AXIS = new V3( 0, 0, 1 );
export const NO_INPUT = { forward: false, back: false, left: false, right: false, steer: 0, hand: false, up: false, down: false, rollL: false, rollR: false };
const _near = [];

// small deterministic random from a string key
export function hashKey( s ) { let h = 2166136261; for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); } return h >>> 0; }
export function seeded( seed ) {
	let a = seed >>> 0;
	return () => { a = ( a + 0x6D2B79F5 ) >>> 0; let t = a; t = Math.imul( t ^ ( t >>> 15 ), t | 1 ); t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 ); return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296; };
}
