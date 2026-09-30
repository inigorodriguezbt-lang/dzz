// The camera while the player sits in a vehicle (game.camera; the player's own camera code is skipped):
//   first   from the seat's eye point, free mouse look inside the cabin, the head swaying with the g-forces
//   third   a chase camera that orbits with the mouse, swings back behind the vehicle when the mouse rests,
//           pulls back with speed and in against walls, the ground and the water
import * as THREE from 'three';

const V3 = THREE.Vector3;
const _eye = new V3(), _t = new V3(), _d = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _a = new V3(), _lv = new V3();
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );
const clamp = ( x, a, b ) => x < a ? a : x > b ? b : x;

export class VehicleCamera {
	constructor( game ) {
		this.game = game;
		this.mode = 'first';
		this.look = { yaw: 0, pitch: 0 };
		this.orbit = { yaw: 0, pitch: - 0.18, idle: 9 };
		this.heading = 0; this.pitchF = 0;
		this.dist = null;
		this.sway = new V3();
		this.prevV = new V3();
		this.fov = null;
		// the pull-in ray skips the vehicle's own boxes (one options object, no closure a frame)
		this.rayV = null;
		this.rayOpts = { filter: ( b ) => b.owner !== this.rayV, water: false };
	}

	// a fresh view on getting in (or switching mode)
	reset( v ) {
		// (on two wheels and a jet ski the bars sit low under the eye: look down a little more to keep them in view)
		this.look.yaw = 0; this.look.pitch = v.kind === 'heli' || v.kind === 'plane' ? - 0.05 : v.spec.open ? - 0.3 : - 0.06;
		this.orbit.yaw = 0; this.orbit.pitch = v.kind === 'heli' ? - 0.25 : - 0.18; this.orbit.idle = 9;
		this.heading = v.yawAngle();
		this.pitchF = 0;
		this.dist = null;
		this.sway.set( 0, 0, 0 );
		this.prevV.copy( v.body.v );
	}

	toggle( v ) { this.mode = this.mode === 'first' ? 'third' : 'first'; this.reset( v ); }

	// place game.camera; returns the camera's yaw and pitch (for the player's compass heading)
	update( dt, v, seat, mx, my ) {
		const g = this.game, cam = g.camera;
		const q = v.object.quaternion; // includes a motorcycle's lean
		const settingsFov = g.settings.get( 'fov' );
		const shake = g.player.shake || 0;
		g.player.shake = Math.max( 0, shake - dt * 1.8 );
		const sh = shake * shake * 0.06;
		// inside a closed cabin a slightly narrower view reads better (less headliner and footwell)
		let fov = settingsFov * ( v.spec.kind === 'car' ? 0.86 : 1 );
		// the body pushed around by acceleration (in the vehicle's frame), eased
		_a.subVectors( v.body.v, this.prevV ).divideScalar( Math.max( dt, 1e-3 ) );
		this.prevV.copy( v.body.v );
		_lv.copy( _a ).applyQuaternion( _q.copy( v.body.q ).invert() ).multiplyScalar( - 0.004 );
		_lv.clampLength( 0, 0.07 );
		this.sway.lerp( _lv, Math.min( 1, dt * 5 ) );
		if ( this.mode === 'first' ) {
			const L = this.look;
			L.yaw = clamp( L.yaw - mx, - 2.6, 2.6 );
			L.pitch = clamp( L.pitch - my, - 1.15, 1.05 );
			_eye.set( seat.eye[ 0 ] + this.sway.x, seat.eye[ 1 ] + this.sway.y * 0.5, seat.eye[ 2 ] + this.sway.z ).applyQuaternion( q ).add( v.object.position );
			cam.position.copy( _eye );
			_q.setFromEuler( _e.set( L.pitch + ( Math.random() - 0.5 ) * sh, L.yaw + ( Math.random() - 0.5 ) * sh, 0, 'YXZ' ) );
			cam.quaternion.copy( q ).multiply( _q );
		} else {
			const O = this.orbit;
			if ( Math.abs( mx ) + Math.abs( my ) > 1e-5 ) O.idle = 0; else O.idle += dt;
			O.yaw = wrap( O.yaw - mx );
			O.pitch = clamp( O.pitch - my, - 1.2, 0.55 );
			const speed = v.body.v.length();
			const air = v.kind === 'heli' || v.kind === 'plane';
			// swing back behind once the mouse rests (and the vehicle moves)
			if ( O.idle > 1.2 && speed > 3 ) {
				O.yaw *= Math.max( 0, 1 - dt * 1.6 );
				O.pitch += ( ( air ? - 0.22 : - 0.18 ) - O.pitch ) * Math.min( 1, dt * 1.2 );
			}
			// the heading lags the vehicle a little: turns read as turns
			this.heading += wrap( v.yawAngle() - this.heading ) * Math.min( 1, dt * ( air ? 3 : 5 ) );
			// aeroplanes: follow the nose up and down too
			_d.set( 0, 0, - 1 ).applyQuaternion( v.body.q );
			const vp = v.kind === 'plane' ? Math.asin( clamp( _d.y, - 1, 1 ) ) * 0.6 : 0;
			this.pitchF += ( vp - this.pitchF ) * Math.min( 1, dt * 3 );
			const Y = this.heading + O.yaw, P = clamp( O.pitch + this.pitchF, - 1.3, 0.8 );
			const size = v.radius;
			const want = Math.max( 4.6, size * 2.1 + 1.2 ) + Math.min( 4, speed * 0.06 );
			// look at the top third of the vehicle
			_t.set( 0, ( v.bounds.min.y + v.bounds.max.y ) * 0.5 + v.size.y * 0.25, ( v.bounds.min.z + v.bounds.max.z ) * 0.5 ).applyQuaternion( v.body.q ).add( v.object.position );
			_d.set( - Math.sin( Y ) * Math.cos( P ), Math.sin( P ), - Math.cos( Y ) * Math.cos( P ) );
			// pull in against anything between the vehicle and the camera (its own boxes excluded)
			let d = want;
			const back = _eye.copy( _d ).negate();
			this.rayV = v;
			const hit = g.physics.raycast( _t, back, want + 0.5, this.rayOpts );
			if ( hit ) d = Math.max( 1.2, hit.t - 0.35 );
			this.dist = this.dist === null || d < this.dist ? d : this.dist + ( d - this.dist ) * Math.min( 1, dt * 2.5 );
			cam.position.copy( _t ).addScaledVector( _d, - this.dist );
			// stay out of the ground and the sea
			const floor = Math.max( g.hf.heightAt( cam.position.x, cam.position.z ), g.physics.waterLevel( cam.position.x, cam.position.z ) ) + 0.35;
			if ( cam.position.y < floor ) cam.position.y = floor;
			cam.quaternion.setFromEuler( _e.set( P + ( Math.random() - 0.5 ) * sh, Y + ( Math.random() - 0.5 ) * sh, 0, 'YXZ' ) );
			// a wider view as the speed builds
			fov = settingsFov + Math.min( 10, Math.max( 0, speed - 8 ) * 0.25 );
		}
		this.fov = this.fov === null ? fov : this.fov + ( fov - this.fov ) * Math.min( 1, dt * 3 );
		if ( Math.abs( cam.fov - this.fov ) > 0.01 ) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
		cam.updateMatrixWorld();
		_d.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		return { yaw: Math.atan2( - _d.x, - _d.z ), pitch: Math.asin( clamp( _d.y, - 1, 1 ) ) };
	}
}
