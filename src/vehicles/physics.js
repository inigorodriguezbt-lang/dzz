// Vehicle dynamics. One rigid body per vehicle (centre of mass, orientation, linear / angular velocity,
// box inertia) stepped at a fixed 120 Hz, and per kind:
//   car    four (or more) suspension rays against the ground (terrain + static boxes): spring / damper,
//          slip-angle tyre forces with a friction circle, grip by surface, engine torque through an automatic
//          gearbox, brakes, handbrake, anti-roll bars, aero drag and downforce
//   boat   buoyancy sampled over the hull against the ocean surface (waves pitch and roll it), hull drag with
//          planing, thrust at the propeller (vectored outboard, or an inboard with a rudder), grounding
//   heli   arcade collective that holds altitude, attitude hold / auto-level, yaw, skids as stiff springs
//   plane  lift / drag from the angle of attack with a stall, thrust, control moments with weathervane
//          stability, tricycle gear on the car wheels
// Every kind has hull contact points (corners, roof, rotor tips) that collide with the terrain, static boxes
// and other vehicles with impulses; hard hits are reported to the vehicle as crashes.
import * as THREE from 'three';
import { Physics } from '../game/Physics.js';

export const STEP = 1 / 120;
const G = 9.81;
const RHO_W = 1025;
const V3 = THREE.Vector3;
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _f = new V3(), _g = new V3(), _h = new V3();
const _q = new THREE.Quaternion(), _m3 = new THREE.Matrix3(), _n = new V3();
const clamp = ( x, a, b ) => x < a ? a : x > b ? b : x;

// ---- rigid body ------------------------------------------------------------------------------------------

export class Body {
	// size: full extents (x, y, z) for the box inertia; com: centre of mass in the model frame
	constructor( mass, size, com ) {
		this.m = mass; this.invM = 1 / mass;
		const [ x, y, z ] = size;
		// a little extra inertia keeps light vehicles from twitching
		const k = 1.25;
		this.Ib = new V3( mass / 12 * ( y * y + z * z ) * k, mass / 12 * ( x * x + z * z ) * k, mass / 12 * ( x * x + y * y ) * k );
		this.invIb = new V3( 1 / this.Ib.x, 1 / this.Ib.y, 1 / this.Ib.z );
		this.com = new V3( ...com );
		this.pos = new V3(); // centre of mass, world
		this.q = new THREE.Quaternion();
		this.v = new V3(); this.w = new V3();
		this.F = new V3(); this.T = new V3();
		this.R = new THREE.Matrix3(); this.Rt = new THREE.Matrix3();
		this.invIw = new THREE.Matrix3();
		this.updateFrames();
	}
	updateFrames() {
		const m4 = _m4.makeRotationFromQuaternion( this.q );
		this.R.setFromMatrix4( m4 );
		this.Rt.copy( this.R ).transpose();
		// R diag(invIb) R^T
		const e = this.R.elements, I = this.invIb;
		const o = this.invIw.elements;
		for ( let i = 0; i < 3; i ++ ) for ( let j = 0; j < 3; j ++ ) {
			o[ j * 3 + i ] = e[ i ] * I.x * e[ j ] + e[ 3 + i ] * I.y * e[ 3 + j ] + e[ 6 + i ] * I.z * e[ 6 + j ];
		}
	}
	// model-space point -> world
	toWorld( p, out ) { return out.copy( p ).sub( this.com ).applyQuaternion( this.q ).add( this.pos ); }
	// model origin in the world (for the visual)
	origin( out ) { return out.copy( this.com ).negate().applyQuaternion( this.q ).add( this.pos ); }
	pointVel( p, out ) { return out.subVectors( p, this.pos ).cross( this.w ).negate().add( this.v ); }
	force( F, p ) { this.F.add( F ); this.T.add( _a.subVectors( p, this.pos ).cross( F ) ); }
	torque( T ) { this.T.add( T ); }
	impulse( J, p ) {
		this.v.addScaledVector( J, this.invM );
		_a.subVectors( p, this.pos ).cross( J ).applyMatrix3( this.invIw );
		this.w.add( _a );
	}
	// 1 / effective mass along n at world point p
	invMassAt( p, n ) {
		_a.subVectors( p, this.pos ).cross( n );
		_b.copy( _a ).applyMatrix3( this.invIw );
		return this.invM + _a.dot( _b );
	}
	integrate( h ) {
		this.v.addScaledVector( this.F, this.invM * h );
		this.w.add( _a.copy( this.T ).applyMatrix3( this.invIw ).multiplyScalar( h ) );
		// keep spin sane after big impacts
		const ws = this.w.length();
		if ( ws > 12 ) this.w.multiplyScalar( 12 / ws );
		this.pos.addScaledVector( this.v, h );
		_q.set( this.w.x, this.w.y, this.w.z, 0 ).multiply( this.q );
		this.q.x += _q.x * 0.5 * h; this.q.y += _q.y * 0.5 * h; this.q.z += _q.z * 0.5 * h; this.q.w += _q.w * 0.5 * h;
		this.q.normalize();
		this.F.set( 0, 0, 0 ); this.T.set( 0, 0, 0 );
		this.updateFrames();
	}
	// body axes in the world
	right( out ) { return out.set( 1, 0, 0 ).applyQuaternion( this.q ); }
	up( out ) { return out.set( 0, 1, 0 ).applyQuaternion( this.q ); }
	fwd( out ) { return out.set( 0, 0, - 1 ).applyQuaternion( this.q ); }
}
const _m4 = new THREE.Matrix4();

// ---- surfaces ------------------------------------------------------------------------------------------------

// grip and rolling resistance of what a wheel stands on (offroad tyres lose less on loose ground)
export function surfaceAt( game, x, z, box, offroad = 0 ) {
	if ( box ) return box.mat === 'wood' ? SURF.wood : box.mat === 'metal' ? SURF.metal : SURF.asphalt;
	const hf = game.hf;
	const fl = hf.flagsNear( x, z );
	if ( fl & ( 1 | 4 | 8 ) ) return SURF.asphalt;
	const y = hf.heightAt( x, z );
	if ( fl & 2 ) return mixSurf( SURF.dirt, offroad );
	if ( y < 3.2 && game.world.isBeach?.( x, z ) ) return mixSurf( SURF.sand, offroad );
	const s = hf.surfaceAt( x, z, _s4 );
	if ( s[ 1 ] > 0.45 ) return mixSurf( SURF.rock, offroad );
	return mixSurf( SURF.grass, offroad );
}
const _s4 = [ 0, 0, 0, 0 ];
export const SURF = {
	asphalt: { name: 'asphalt', grip: 1.0, roll: 0.013, dust: 0 },
	wood: { name: 'wood', grip: 0.85, roll: 0.015, dust: 0 },
	metal: { name: 'metal', grip: 0.8, roll: 0.013, dust: 0 },
	dirt: { name: 'dirt', grip: 0.72, roll: 0.035, dust: 1, color: [ 0.5, 0.4, 0.3 ] },
	grass: { name: 'grass', grip: 0.68, roll: 0.04, dust: 0.4, color: [ 0.36, 0.34, 0.24 ] },
	rock: { name: 'rock', grip: 0.78, roll: 0.03, dust: 0.6, color: [ 0.45, 0.38, 0.33 ] },
	sand: { name: 'sand', grip: 0.55, roll: 0.09, dust: 1, color: [ 0.78, 0.7, 0.55 ] },
};
const _mixed = new Map();
function mixSurf( s, k ) {
	if ( ! k ) return s;
	const key = s.name + k;
	let m = _mixed.get( key );
	if ( ! m ) { m = { ...s, grip: s.grip + ( 0.95 - s.grip ) * k * 0.7, roll: s.roll * ( 1 - k * 0.5 ) }; _mixed.set( key, m ); }
	return m;
}

// ---- body contacts (hull points vs terrain, static boxes and other vehicles) --------------------------------

// contact points in the model frame from the body bounds: bottom, belt and roof corners, bumpers
export function hullPoints( bounds, o = {} ) {
	const mn = bounds.min, mx = bounds.max;
	const x = ( mx.x - mn.x ) / 2 - ( o.inset ?? 0.06 ), z0 = mn.z + 0.05, z1 = mx.z - 0.05;
	const yb = o.bottom ?? mn.y + 0.06, yt = mx.y - 0.04, ym = ( o.belt ?? ( yb + yt ) / 2 );
	const pts = [];
	for ( const sx of [ - 1, 1 ] ) for ( const z of [ z0, z1 ] ) pts.push( [ sx * x, yb, z ], [ sx * x, ym, z ] );
	for ( const sx of [ - 1, 1 ] ) pts.push( [ sx * x, ym, ( z0 + z1 ) / 2 ], [ sx * x, yb, ( z0 + z1 ) / 2 ] );
	const rx = x * ( o.roofW ?? 0.8 ), rz0 = o.roofZ ? o.roofZ[ 0 ] : z0 * 0.5, rz1 = o.roofZ ? o.roofZ[ 1 ] : z1 * 0.5;
	for ( const sx of [ - 1, 1 ] ) for ( const z of [ rz0, rz1 ] ) pts.push( [ sx * rx, yt, z ] );
	pts.push( [ 0, ( yb + ym ) / 2, z0 - 0.02 ], [ 0, ( yb + ym ) / 2, z1 + 0.02 ] );
	return pts.map( p => new V3( ...p ) );
}

// resolve the hull points; returns the hardest normal impact speed (m/s) and what was hit
export function hullContacts( veh, h ) {
	const b = veh.body, game = veh.game, P = game.physics;
	let hardest = 0, hitWhat = null, hitPoint = null;
	const r = veh.radius + 1;
	const boxes = P.near( b.pos.x, b.pos.z, r, _boxes );
	const moving = b.v.lengthSq() > 64;
	for ( let i = 0; i < veh.hull.length; i ++ ) {
		const lp = veh.hull[ i ];
		const p = b.toWorld( lp, _c );
		// terrain
		const gy = game.hf.heightAt( p.x, p.z );
		if ( p.y < gy ) {
			game.hf.normalAt( p.x, p.z, _n, 0.8 );
			const pen = ( gy - p.y ) * _n.y;
			const s = resolve( b, p, _n, pen, veh.spec.kind === 'boat' ? 0.9 : 0.6, 0.1, h );
			if ( s > hardest ) { hardest = s; hitWhat = 'ground'; hitPoint = p.clone(); }
		}
		// boxes (the vehicle's own box and boxes it is standing on from above are left out)
		for ( const bx of boxes ) {
			if ( bx.owner === veh || p.y < bx.minY || p.y > bx.maxY ) continue;
			if ( ! Physics.inside( bx, p.x, p.z, 0 ) ) continue;
			const dx = p.x - bx.x, dz = p.z - bx.z;
			const u = dx * bx.c - dz * bx.s, vv = dx * bx.s + dz * bx.c;
			const pu = bx.hx - Math.abs( u ), pv = bx.hz - Math.abs( vv ), py = bx.maxY - p.y;
			let pen;
			if ( py < Math.min( pu, pv ) && py < 0.35 ) { _n.set( 0, 1, 0 ); pen = py; }
			else if ( pu < pv ) { const s = Math.sign( u ) || 1; _n.set( s * bx.c, 0, - s * bx.s ); pen = pu; }
			else { const s = Math.sign( vv ) || 1; _n.set( s * bx.s, 0, s * bx.c ); pen = pv; }
			const other = bx.owner && bx.owner.isVehicle ? bx.owner : null;
			const s = resolve( b, p, _n, pen, 0.5, 0.15, h, other?.body );
			if ( other ) other.wake();
			if ( s > hardest ) { hardest = s; hitWhat = other || bx; hitPoint = p.clone(); }
		}
		// fast movers: sweep the leading points so thin walls can't be skipped
		if ( moving && veh.lastHull && i < veh.lastHull.length ) {
			const prev = veh.lastHull[ i ];
			_d.subVectors( p, prev );
			const len = _d.length();
			if ( len > 0.15 ) {
				_d.divideScalar( len );
				const hit = P.raycastBoxes( prev, _d, len, x => x.owner !== veh );
				if ( hit ) {
					const s = resolve( b, p, hit.normal, ( len - hit.t ) * Math.max( 0, - hit.normal.dot( _d ) ), 0.4, 0.15, h, hit.box.owner?.isVehicle ? hit.box.owner.body : null );
					if ( s > hardest ) { hardest = s; hitWhat = hit.box.owner?.isVehicle ? hit.box.owner : hit.box; hitPoint = p.clone(); }
				}
			}
		}
	}
	// remember this step's points for the sweep
	veh.lastHull ||= veh.hull.map( () => new V3() );
	for ( let i = 0; i < veh.hull.length; i ++ ) b.toWorld( veh.hull[ i ], veh.lastHull[ i ] );
	return { speed: hardest, what: hitWhat, point: hitPoint };
}
const _boxes = [];

// impulse at a penetrating point: normal restitution, Coulomb friction, then push the body out.
// Returns the closing speed along the normal (for crash damage).
function resolve( b, p, n, pen, mu, e, h, other = null ) {
	const vp = b.pointVel( p, _e );
	if ( other ) vp.sub( other.pointVel( p, _f ) );
	const vn = vp.dot( n );
	let closing = 0;
	if ( vn < 0 ) {
		closing = - vn;
		const k = b.invMassAt( p, n ) + ( other ? other.invMassAt( p, n ) : 0 );
		const bounce = closing > 1.5 ? e : 0;
		const j = - ( 1 + bounce ) * vn / k;
		_g.copy( n ).multiplyScalar( j );
		b.impulse( _g, p );
		if ( other ) other.impulse( _g.negate(), p );
		// friction against the tangential slide
		const vt = _h.copy( vp ).addScaledVector( n, - vn );
		const vtl = vt.length();
		if ( vtl > 1e-4 ) {
			vt.divideScalar( vtl );
			const kt = b.invMassAt( p, vt ) + ( other ? other.invMassAt( p, vt ) : 0 );
			const jt = Math.min( vtl / kt, mu * j );
			_g.copy( vt ).multiplyScalar( - jt );
			b.impulse( _g, p );
			if ( other ) other.impulse( _g.negate(), p );
		}
	}
	// positional correction (Baumgarte-style, shared with the other vehicle)
	const corr = Math.max( 0, pen - 0.005 ) * ( other ? 0.25 : 0.45 );
	if ( corr > 0 ) {
		b.pos.addScaledVector( n, Math.min( corr, 0.2 ) );
		if ( other ) other.pos.addScaledVector( n, - Math.min( corr, 0.2 ) );
	}
	return closing;
}

// ---- wheels (cars, the plane's gear, the helicopter's skids) --------------------------------------------------------

// Wheel state: { lp (mount point, model), R, steer (0..1 steering share), driven, front, side, L (spring length), comp, grounded,
// spin, spinV, slip, surface, fz, contact (world) }
export function makeWheels( model, spec ) {
	const S = spec.susp;
	return model.wheels.map( w => ( {
		x: w.x, y: w.y, z: w.z, R: w.R, W: w.W, side: w.side, steerK: w.steer || 0, front: w.front,
		driven: spec.engine?.drive === 'awd' ? true : spec.engine?.drive === 'fwd' ? w.front : spec.engine?.drive === 'rwd' ? ! w.front : false,
		lp: new V3( w.x, w.y + S.rest, w.z ), L: S.rest, Lprev: S.rest, grounded: false, spin: 0, spinV: 0, slip: 0, lat: 0, fz: 0,
		surface: SURF.asphalt, contact: new V3(), steer: 0, box: null, skid: !! w.skid,
	} ) );
}

const _mount = new V3(), _down = new V3(), _gn = new V3(), _fw = new V3(), _rt = new V3(), _up = new V3(), _vc = new V3(), _F = new V3(), _pt = new V3();

// suspension and tyre forces for one substep. input: { drive (N per driven wheel, signed), brake (0..1), hand (0..1), steer (rad) }
export function wheelForces( veh, h, input ) {
	const b = veh.body, game = veh.game, spec = veh.spec, S = spec.susp;
	const W = veh.wheels;
	const n = W.length;
	const mEff = b.m / n;
	const pre = b.m * G / ( n * S.k );
	b.up( _up ); _down.copy( _up ).negate();
	let grounded = 0;
	const wet = 1 - ( game.weather?.rain || 0 ) * 0.18;
	for ( const w of W ) {
		b.toWorld( w.lp, _mount );
		w.grounded = false;
		w.fz = 0;
		const dy = - _down.y;
		const Lmax = S.rest + S.travel;
		if ( dy < 0.25 ) { w.L = Lmax; w.Lprev = w.L; continue; }
		// ground under the wheel: terrain or a static box (curbs, ramps, bridges, the deck of a building)
		const px = _mount.x + _down.x * ( S.rest + w.R ), pz = _mount.z + _down.z * ( S.rest + w.R );
		const gr = game.physics.ground( px, pz, _mount.y + 0.05, 0 );
		if ( gr.box && gr.box.owner === veh ) gr.box = null;
		const dist = ( _mount.y - gr.y ) / dy;
		let L = dist - w.R;
		if ( L > Lmax ) { w.L = Lmax; w.Lprev = w.L; w.box = null; continue; }
		w.grounded = true;
		grounded ++;
		w.box = gr.box;
		if ( gr.box ) _gn.set( 0, 1, 0 ); else game.hf.normalAt( px, pz, _gn, 0.6 );
		const Lmin = S.rest - S.travel;
		let bump = 0;
		if ( L < Lmin ) { bump = ( Lmin - L ) * S.k * 6; L = Lmin + ( L - Lmin ) * 0.3; }
		const vL = ( L - w.Lprev ) / h;
		w.Lprev = L;
		w.L = L;
		let fz = S.k * ( S.rest + pre - L ) - S.c * vL + bump;
		fz = Math.max( 0, Math.min( fz, b.m * G * 4 ) );
		w.fz = fz;
		w.comp = ( S.rest - L ) / S.travel;
		w.contact.copy( _mount ).addScaledVector( _down, dist );
		w.surface = surfaceAt( game, px, pz, gr.box, spec.offroad || 0 );
	}
	// anti-roll bars: move load from the more compressed wheel to its partner on the same axle
	if ( spec.antiRoll ) for ( let i = 0; i + 1 < n; i += 2 ) {
		const a = W[ i ], c = W[ i + 1 ];
		if ( ! a.grounded || ! c.grounded ) continue;
		const f = ( ( S.rest - a.L ) - ( S.rest - c.L ) ) * spec.antiRoll;
		a.fz = Math.max( 0, a.fz + f ); c.fz = Math.max( 0, c.fz - f );
	}
	for ( const w of W ) {
		if ( ! w.grounded ) { w.slip = 0; w.lat = 0; continue; }
		// tyre frame on the ground
		const st = input.steer * w.steerK;
		w.steer = st;
		_fw.set( - Math.sin( st ), 0, - Math.cos( st ) ).applyQuaternion( b.q );
		_fw.addScaledVector( _gn, - _fw.dot( _gn ) ).normalize();
		_rt.crossVectors( _fw, _gn ).normalize();
		b.pointVel( w.contact, _vc );
		const vLong = _vc.dot( _fw ), vLat = _vc.dot( _rt );
		const mu = ( spec.grip ?? 1 ) * w.surface.grip * wet * ( w.flat ? 0.55 : 1 );
		const fmax = mu * w.fz;
		// longitudinal: drive, brakes, handbrake, rolling resistance
		let fx = 0;
		const damp = mEff / h * 0.5;
		if ( w.driven && input.drive ) fx += input.drive;
		const brake = input.brake * ( spec.brake || 0 ) / n + ( input.hand && ! w.front ? input.hand * ( spec.handbrake || 0 ) / ( n / 2 ) : 0 );
		if ( brake > 0 ) fx -= Math.sign( vLong ) * Math.min( brake, Math.abs( vLong ) * damp );
		fx -= Math.sign( vLong ) * Math.min( w.surface.roll * w.fz + ( w.flat ? 0.05 * w.fz : 0 ), Math.abs( vLong ) * damp );
		// lateral: slip-angle curve at speed, a stiff damper near standstill (whichever is gentler)
		const alpha = Math.atan2( vLat, Math.abs( vLong ) + 0.5 );
		let latK = ( input.hand && ! w.front ? 0.55 : 1 );
		if ( w.skid ) latK = 1;
		const curve = Math.sin( 1.55 * Math.atan( 9 * alpha ) );
		let fy = - fmax * curve * latK;
		const fyD = - vLat * damp;
		if ( Math.abs( fyD ) < Math.abs( fy ) ) fy = fyD;
		if ( w.skid ) { fx = - vLong * damp; }
		// friction circle
		const tot = Math.hypot( fx, fy );
		w.slip = 0;
		if ( tot > fmax && tot > 0 ) {
			const k = fmax / tot;
			w.slip = Math.min( 1, ( tot - fmax ) / Math.max( 1, fmax ) + Math.abs( alpha ) * 0.8 );
			fx *= k; fy *= k;
		}
		w.lat = Math.abs( vLat ) > 1.2 ? Math.min( 1, ( Math.abs( vLat ) - 1.2 ) / 4 ) : 0;
		// wheelspin / lock-up for the visuals and the skid sound
		w.spinV = vLong / w.R;
		if ( input.hand && ! w.front && Math.abs( vLong ) > 0.5 ) { w.spinV = 0; w.slip = Math.max( w.slip, 0.6 ); }
		if ( w.driven && input.drive && Math.abs( input.drive ) > fmax * 1.1 ) { w.spinV += Math.sign( input.drive ) * 18; w.slip = Math.max( w.slip, 0.5 ); }
		// suspension along the ground normal at the contact, tyre forces a little above it (less body roll)
		_F.copy( _gn ).multiplyScalar( w.fz );
		b.force( _F, w.contact );
		_pt.copy( w.contact ).addScaledVector( _gn, Math.max( 0, _a.subVectors( b.pos, w.contact ).dot( _gn ) ) * ( 1 - ( spec.rollInfluence ?? 0.25 ) ) );
		_F.copy( _fw ).multiplyScalar( fx ).addScaledVector( _rt, fy );
		b.force( _F, _pt );
	}
	return grounded;
}

// ---- engine and gearbox --------------------------------------------------------------------------------------

export class Engine {
	constructor( spec ) {
		this.E = spec.engine;
		this.gear = 1; // -1 reverse, 0 neutral, 1.. forward
		this.rpm = this.E.idle || 800;
		this.shiftT = 0;
		this.running = false;
		this.throttle = 0;
	}
	ratio() { const E = this.E; return this.gear < 0 ? - E.reverse : this.gear === 0 ? 0 : E.gears[ this.gear - 1 ]; }
	// torque curve: a broad hump peaking around 60 % of the redline, cut at the redline
	torqueAt( rpm ) {
		const E = this.E, t = rpm / E.redline;
		if ( t > 1.02 ) return 0;
		const shape = 0.62 + 0.38 * Math.sin( Math.min( 1, t / 0.62 ) * Math.PI / 2 ) - Math.max( 0, t - 0.75 ) * 0.9;
		const byPower = E.power * 1000 / Math.max( 50, rpm * Math.PI / 30 );
		return Math.min( E.torque * shape, byPower );
	}
	// wheel speed (m/s along the car), wheel radius, throttle 0..1 -> drive force at the wheels (N, total)
	update( h, speed, R, throttle, vehicle ) {
		const E = this.E;
		this.throttle = throttle;
		if ( this.shiftT > 0 ) this.shiftT -= h;
		const r = this.ratio();
		const wheelRpm = Math.abs( speed ) / R * Math.abs( r ) * E.final * 30 / Math.PI;
		// the clutch slips when pulling away
		const launch = E.idle + throttle * ( E.redline * 0.45 - E.idle );
		const target = Math.max( E.idle, this.gear !== 0 ? Math.max( wheelRpm, Math.abs( speed ) < 4 ? launch : 0 ) : E.idle + throttle * ( E.redline - E.idle ) );
		this.rpm += ( Math.min( target, E.redline * 1.02 ) - this.rpm ) * Math.min( 1, h * 12 );
		if ( ! this.running ) { this.rpm = 0; return 0; }
		// automatic gearbox
		if ( this.gear > 0 && this.shiftT <= 0 ) {
			if ( wheelRpm > E.redline * 0.9 && this.gear < E.gears.length ) { this.gear ++; this.shiftT = 0.28; vehicle?.onShift?.( 1 ); }
			else if ( this.gear > 1 && wheelRpm < E.redline * 0.42 ) {
				const down = Math.abs( speed ) / R * E.gears[ this.gear - 2 ] * E.final * 30 / Math.PI;
				if ( down < E.redline * 0.82 ) { this.gear --; this.shiftT = 0.22; vehicle?.onShift?.( - 1 ); }
			}
		}
		if ( this.shiftT > 0 || this.gear === 0 ) return 0;
		const T = this.torqueAt( this.rpm ) * throttle;
		let F = T * r * E.final * 0.88 / R;
		// engine braking off the throttle
		if ( throttle < 0.05 ) F -= Math.sign( speed ) * Math.min( Math.abs( speed ) * 60, 900 ) * Math.abs( r ) / 3;
		return F;
	}
}

// ---- per-kind steps ------------------------------------------------------------------------------------------------

// cars: input { throttle, brake, hand, steer (-1..1), reverse }
export function stepCar( veh, h, inp ) {
	const b = veh.body, spec = veh.spec, eng = veh.engine;
	b.fwd( _fw );
	const speed = b.v.dot( _fw );
	// speed-sensitive steering: the full lock only near standstill
	const maxSteer = spec.steer * ( 1 / ( 1 + Math.abs( speed ) * 0.045 ) );
	const target = inp.steer * maxSteer;
	const rate = spec.steerSpeed * ( Math.abs( target ) < Math.abs( veh.steer ) || Math.sign( target ) !== Math.sign( veh.steer ) ? 1.6 : 1 );
	veh.steer += clamp( target - veh.steer, - rate * h, rate * h );
	// gear selection: reverse when holding back at a standstill, forward again with the throttle
	if ( inp.back && speed < 0.8 && eng.gear > 0 && eng.running ) eng.gear = - 1;
	else if ( inp.forward && speed > - 0.8 && eng.gear < 0 ) eng.gear = 1;
	else if ( eng.gear === 0 && eng.running ) eng.gear = 1;
	let throttle = 0, brake = 0;
	if ( eng.gear < 0 ) { throttle = inp.back ? 1 : 0; brake = inp.forward ? 1 : 0; }
	else { throttle = inp.forward ? 1 : 0; brake = inp.back ? 1 : 0; }
	if ( ! eng.running || veh.fuel <= 0 ) throttle = 0;
	// parked with nobody at the wheel: the handbrake is on
	const hand = inp.hand ? 1 : ( veh.driver ? 0 : 1 );
	const R = veh.wheels[ 0 ]?.R || 0.33;
	const Fdrive = eng.update( h, speed, R, throttle * ( veh.health <= veh.spec.health * 0.15 ? 0.5 : 1 ), veh );
	const nd = veh.wheels.filter( w => w.driven ).length || 1;
	veh.throttle = throttle; veh.braking = brake > 0 || ( inp.back && eng.gear > 0 && speed > 0.5 );
	const grounded = wheelForces( veh, h, { drive: Fdrive / nd, brake, hand, steer: veh.steer } );
	// air drag and downforce
	const v2 = b.v.lengthSq();
	if ( v2 > 0.01 ) {
		_F.copy( b.v ).multiplyScalar( - 0.5 * 1.225 * spec.dragArea * Math.sqrt( v2 ) );
		b.force( _F, b.pos );
		if ( spec.downforce ) { b.up( _up ); _F.copy( _up ).multiplyScalar( - spec.downforce * v2 ); b.force( _F, b.pos ); }
	}
	// a little help staying upright in the air (arcade): damp the spin
	if ( ! grounded ) b.w.multiplyScalar( 1 - h * 0.3 );
	return speed;
}

// boats: buoyancy points in the model frame [ x, y (hull bottom), z, area ]
export function stepBoat( veh, h, inp ) {
	const b = veh.body, spec = veh.spec, game = veh.game;
	const P = game.physics;
	b.fwd( _fw ); b.right( _rt ); b.up( _up );
	const speed = b.v.dot( _fw );
	const maxSteer = spec.steer;
	const target = inp.steer * maxSteer;
	veh.steer += clamp( target - veh.steer, - spec.steerSpeed * h, spec.steerSpeed * h );
	let wet = 0;
	const depthMax = veh.hullDepth;
	for ( const bp of veh.buoy ) {
		const p = b.toWorld( bp.p, _c );
		const wy = P.waterLevel( p.x, p.z );
		const d = wy - p.y;
		if ( d <= 0 ) continue;
		wet ++;
		const sub = Math.min( d, depthMax );
		// buoyancy and heave damping
		_F.set( 0, RHO_W * G * bp.a * sub, 0 );
		const vp = b.pointVel( p, _vc );
		_F.y -= vp.y * bp.a * 2600 * Math.min( 1, sub / 0.2 );
		b.force( _F, p );
	}
	veh.inWater = wet / veh.buoy.length;
	if ( wet ) {
		const k = veh.inWater;
		// hull drag in the body frame: long (low), lateral (keel, high), planing cuts the drag at speed
		const vl = b.v.dot( _fw ), vs = b.v.dot( _rt );
		const plane = spec.planing * clamp( ( Math.abs( vl ) - 6 ) / 8, 0, 1 );
		const [ dl, dq ] = spec.drag;
		const fl = - Math.sign( vl ) * ( dl * Math.abs( vl ) + dq * vl * vl * ( 1 - plane * 0.55 ) ) * k;
		const fs = - vs * spec.lateral * k * ( 1 + Math.abs( vs ) * 0.3 );
		_F.copy( _fw ).multiplyScalar( fl );
		b.force( _F, b.pos );
		// lateral resistance acts behind the centre of mass: the hull tracks straight and carves turns
		_F.copy( _rt ).multiplyScalar( fs );
		b.toWorld( _pt.set( 0, veh.bounds.min.y + 0.3, veh.bounds.max.z * 0.35 ), _d );
		b.force( _F, _d );
		// planing lift raises the bow a little, then flattens out
		if ( plane > 0 ) { _F.set( 0, spec.mass * 0.25 * plane * G, 0 ); b.toWorld( _pt.set( 0, 0, veh.bounds.min.z * 0.2 ), _d ); b.force( _F, _d ); }
		// water resists turning and rocking
		b.w.x *= 1 - h * 1.6 * k; b.w.z *= 1 - h * 1.6 * k; b.w.y *= 1 - h * ( 0.9 + Math.abs( vl ) * 0.02 ) * k;
	}
	// thrust at the propeller while it is in the water
	const eng = veh.engine;
	let throttle = 0;
	if ( eng.running && veh.fuel > 0 ) throttle = inp.forward ? 1 : inp.back ? - spec.reverse : 0;
	veh.throttle = Math.abs( throttle );
	const E = spec.engine;
	eng.rpm += ( ( eng.running ? E.idle + Math.abs( throttle ) * ( E.redline - E.idle ) : 0 ) - eng.rpm ) * Math.min( 1, h * 3 );
	const prop = b.toWorld( veh.propPoint, _c );
	veh.propWet = P.waterLevel( prop.x, prop.z ) > prop.y + 0.02;
	if ( throttle && veh.propWet ) {
		const st = spec.rudder ? 0 : veh.steer;
		_d.set( - Math.sin( st ), 0, - Math.cos( st ) ).applyQuaternion( b.q );
		_F.copy( _d ).multiplyScalar( throttle * spec.thrust * ( veh.health < spec.health * 0.2 ? 0.5 : 1 ) );
		b.force( _F, prop );
	}
	// rudder (inboard boats): a side force at the stern growing with speed through the water
	if ( spec.rudder && wet ) {
		_F.copy( _rt ).multiplyScalar( - veh.steer * ( speed * Math.abs( speed ) * 180 + throttle * spec.thrust * 0.25 ) );
		b.force( _F, prop );
	}
	// jet skis steer only with thrust: a touch of it even off the throttle so they don't feel dead
	if ( spec.jet && wet && ! throttle && Math.abs( speed ) > 2 ) {
		_F.copy( _rt ).multiplyScalar( - veh.steer * speed * 60 );
		b.force( _F, prop );
	}
	// air drag
	_F.copy( b.v ).multiplyScalar( - 0.5 * 1.225 * 2.5 * b.v.length() );
	b.force( _F, b.pos );
	return speed;
}

// helicopter: input { forward/back (pitch), left/right (yaw), rollL/rollR, up/down (collective) }
export function stepHeli( veh, h, inp ) {
	const b = veh.body, spec = veh.spec, eng = veh.engine;
	const on = eng.running && veh.fuel > 0;
	// rotor spools up / down
	veh.rotor += ( ( on ? 1 : 0 ) - veh.rotor ) * Math.min( 1, h / ( on ? spec.spool : spec.spool * 1.4 ) * 3 );
	eng.rpm = veh.rotor;
	const rot = veh.rotor * veh.rotor;
	b.up( _up ); b.fwd( _fw ); b.right( _rt );
	// collective: hold the height, climb / descend on input (arcade), ground effect near the ground
	const coll = ( inp.up ? 1 : 0 ) - ( inp.down ? 1 : 0 );
	veh.throttle = clamp( 0.55 + coll * 0.45, 0, 1 ) * veh.rotor;
	const ay = coll * spec.climb - b.v.y * 1.4;
	const agl = veh.altitudeAGL ?? 10;
	const ge = agl < 4 ? 1 + ( 4 - agl ) * 0.025 : 1;
	let L = spec.mass * ( G + ay ) / Math.max( 0.55, _up.y );
	L = clamp( L, 0, spec.mass * G * spec.lift ) * rot * ge;
	// idle on the ground: not enough lift to leave until the pilot pulls
	if ( veh.onGround && coll <= 0 ) L = Math.min( L, spec.mass * G * 0.85 * rot );
	_F.copy( _up ).multiplyScalar( L );
	b.force( _F, b.pos );
	// attitude hold: target pitch / roll from the stick, auto-level when it's released
	const tp = ( ( inp.forward ? 1 : 0 ) - ( inp.back ? 1 : 0 ) ) * spec.tilt;
	const tr = ( ( inp.rollR ? 1 : 0 ) - ( inp.rollL ? 1 : 0 ) ) * spec.tilt * 0.9;
	// current pitch (nose down positive) and roll (right wing down positive) from the body axes
	const pitch = Math.asin( clamp( - _fw.y, - 1, 1 ) );
	const roll = Math.asin( clamp( - _rt.y, - 1, 1 ) );
	const wl = _e.copy( b.w ).applyMatrix3( b.Rt ); // body-frame angular velocity
	const yawIn = ( ( inp.left ? 1 : 0 ) - ( inp.right ? 1 : 0 ) ) * spec.yawRate;
	const air = veh.onGround && coll <= 0 ? 0.25 : 1;
	const kp = 7 * rot * air, kd = 3.5 * rot + 0.8;
	// torque about body x: positive raises the nose -> nose down needs negative
	const tx = ( - ( tp - pitch ) * kp - wl.x * kd ) * b.Ib.x;
	const tz = ( ( tr - roll ) * kp * - 1 - wl.z * kd ) * b.Ib.z;
	const ty = ( ( yawIn - wl.y ) * 3.2 * rot * air ) * b.Ib.y;
	_F.set( tx, ty, tz ).applyMatrix3( b.R );
	b.torque( _F );
	// forward flight: the tail weathervanes into the airflow
	const hv = _d.set( b.v.x, 0, b.v.z );
	const hs = hv.length();
	if ( hs > 12 ) {
		const side = b.v.dot( _rt );
		_F.set( 0, - side * 0.02 * b.Ib.y, 0 );
		b.torque( _F );
	}
	// skids: stiff springs with static friction
	const onG = wheelForces( veh, h, { drive: 0, brake: 1, hand: 0, steer: 0 } );
	veh.onGround = onG > 0;
	// parasite drag (sets the top speed)
	_F.copy( b.v ).multiplyScalar( - spec.drag * b.v.length() );
	_F.y *= 1.5;
	b.force( _F, b.pos );
	return b.v.dot( _fw );
}

// plane: input { up/down (throttle), forward/back (pitch), left/right (roll), rollL/rollR (rudder) }
export function stepPlane( veh, h, inp ) {
	const b = veh.body, spec = veh.spec, eng = veh.engine;
	const on = eng.running && veh.fuel > 0;
	const dt = ( inp.up ? 1 : 0 ) - ( inp.down ? 1 : 0 );
	veh.throttleSet = clamp( ( veh.throttleSet || 0 ) + dt * h * 0.5, 0, 1 );
	const thr = on ? veh.throttleSet : 0;
	veh.throttle = thr;
	eng.rpm += ( ( on ? spec.engine.idle + thr * ( spec.engine.redline - spec.engine.idle ) : 0 ) - eng.rpm ) * Math.min( 1, h * 2 );
	b.fwd( _fw ); b.up( _up ); b.right( _rt );
	const V = b.v.length();
	const u = b.v.dot( _fw ), w = b.v.dot( _up ), s = b.v.dot( _rt );
	const alpha = Math.atan2( - w, Math.max( 1, u ) );
	const beta = Math.atan2( s, Math.max( 1, u ) );
	const q = 0.5 * 1.225 * V * V;
	let cl = spec.cl0 + spec.cla * alpha;
	if ( Math.abs( alpha ) > spec.stall ) cl = Math.sign( alpha ) * Math.max( 0.35, spec.clMax - ( Math.abs( alpha ) - spec.stall ) * 4 );
	cl = clamp( cl, - 1.2, spec.clMax );
	veh.stalled = Math.abs( alpha ) > spec.stall && V > 8;
	if ( V > 1 ) {
		// lift perpendicular to the airflow in the plane of symmetry, drag against it
		_d.copy( b.v ).divideScalar( V );
		_e.crossVectors( _rt, _d ).normalize();
		_F.copy( _e ).multiplyScalar( q * spec.wing * cl );
		b.force( _F, b.pos );
		_F.copy( _d ).multiplyScalar( - q * spec.wing * ( spec.cd0 + spec.k * cl * cl ) );
		b.force( _F, b.pos );
		// the fin: side slip damping
		_F.copy( _rt ).multiplyScalar( - s * Math.abs( s ) * 1.225 * 3.5 - s * 40 );
		b.force( _F, b.pos );
	}
	// propeller thrust falls off with airspeed
	_F.copy( _fw ).multiplyScalar( thr * spec.thrust * clamp( 1 - u / 75, 0.2, 1 ) );
	b.force( _F, b.pos );
	// control moments (scaled by dynamic pressure) plus weathervane stability and damping
	const qs = clamp( V / 35, 0.08, 1.4 );
	const wl = _e.copy( b.w ).applyMatrix3( b.Rt );
	const pIn = ( inp.back ? 1 : 0 ) - ( inp.forward ? 1 : 0 ); // pull back = nose up
	const rIn = ( inp.right ? 1 : 0 ) - ( inp.left ? 1 : 0 );
	const yIn = ( inp.rollL ? 1 : 0 ) - ( inp.rollR ? 1 : 0 );
	const tx = ( ( pIn * spec.pitchRate - wl.x ) * 4 * qs - alpha * 2.2 * qs * ( V > 15 ? 1 : 0 ) ) * b.Ib.x;
	const tz = ( ( - rIn * spec.rollRate - wl.z ) * 4 * qs ) * b.Ib.z;
	const ty = ( ( yIn * spec.yawRate - wl.y ) * 3 * qs - beta * 2.5 * qs ) * b.Ib.y;
	_F.set( tx, ty, tz ).applyMatrix3( b.R );
	b.torque( _F );
	// on the ground: gear, nose wheel steering, brakes when the throttle is closed
	const steer = ( ( inp.left || inp.rollL ? 1 : 0 ) - ( inp.right || inp.rollR ? 1 : 0 ) ) * spec.steer * clamp( 1 - Math.abs( u ) / 30, 0.15, 1 );
	veh.steer += clamp( steer - veh.steer, - 2 * h, 2 * h );
	const brake = thr < 0.02 ? ( inp.back && Math.abs( u ) < 30 ? 1 : 0.35 ) : 0;
	wheelForces( veh, h, { drive: 0, brake, hand: 0, steer: veh.steer } );
	return u;
}
