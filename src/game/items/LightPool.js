// A fixed set of real lights shared by everything the items module lights up: the player's flashlight or
// headlamp (one spot light that follows the view) and three point lights handed each frame to the strongest
// nearby sources — campfires, road flares, chemlights, a lantern or torch on your belt.
// The light count never changes (unused lights sit at intensity 0) because adding or removing a light makes
// three.js recompile every lit material in the world.
import * as THREE from 'three';

const POINTS = 3;

export class LightPool {
	constructor( game ) {
		this.game = game;
		this.spot = new THREE.SpotLight( 0xffffff, 0, 40, 0.45, 0.55, 2 );
		this.spot.castShadow = false;
		this.spot.target.position.set( 0, 0, - 1 );
		this.points = [];
		for ( let i = 0; i < POINTS; i ++ ) {
			const l = new THREE.PointLight( 0xffaa66, 0, 12, 2 );
			l.castShadow = false;
			this.points.push( l );
		}
		game.scene.add( this.spot, this.spot.target, ...this.points );
		this.sources = new Set(); // { pos: Vector3, color, intensity, range, flicker, on, priority }
		this.spotSource = null; // { color, intensity, range, angle }
		this.t = 0;
		this._list = [];
		this._fwd = new THREE.Vector3();
	}

	add( src ) { this.sources.add( src ); return src; }
	remove( src ) { this.sources.delete( src ); }

	update( dt ) {
		this.t += dt;
		const g = this.game, cam = g.camera;
		// the carried spot light: at the eyes, a little down and to the right of the view like a chest / head lamp
		const s = this.spotSource;
		if ( s && ! g.dead ) {
			this._fwd.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
			this.spot.position.copy( cam.position ).addScaledVector( this._fwd, 0.15 );
			this.spot.position.y -= s.kind === 'headlamp' ? 0.02 : 0.25;
			this.spot.target.position.copy( cam.position ).addScaledVector( this._fwd, 10 );
			this.spot.target.updateMatrixWorld();
			this.spot.color.setHex( s.color );
			this.spot.angle = s.angle ?? 0.45;
			this.spot.distance = s.range;
			const fl = s.flicker ? 0.85 + Math.sin( this.t * 23 ) * 0.08 + Math.sin( this.t * 57 ) * 0.07 : 1;
			this.spot.intensity = s.intensity * fl * ( s.dim ?? 1 );
		} else this.spot.intensity = 0;

		// point lights: the strongest sources relative to their distance from the camera
		const list = this._list;
		list.length = 0;
		for ( const src of this.sources ) {
			if ( ! src.on ) continue;
			const d2 = src.pos.distanceToSquared( cam.position );
			if ( d2 > 140 * 140 ) continue;
			src._score = ( src.priority ?? 1 ) * src.intensity * src.range * src.range / ( 1 + d2 );
			list.push( src );
		}
		list.sort( ( a, b ) => b._score - a._score );
		for ( let i = 0; i < POINTS; i ++ ) {
			const l = this.points[ i ], src = list[ i ];
			if ( ! src ) { l.intensity = 0; continue; }
			l.position.copy( src.pos );
			if ( src.lift ) l.position.y += src.lift;
			l.color.setHex( src.color );
			l.distance = src.range;
			let k = 1;
			if ( src.flicker ) {
				const ph = src.phase ?? ( src.phase = Math.random() * 100 );
				k = 0.78 + Math.sin( this.t * 9.1 + ph ) * 0.1 + Math.sin( this.t * 23.7 + ph * 2 ) * 0.08 + Math.sin( this.t * 4.3 + ph ) * 0.06;
			}
			l.intensity = src.intensity * k * ( src.dim ?? 1 );
		}
	}

	dispose() {
		this.game.scene.remove( this.spot, this.spot.target, ...this.points );
		this.spot.dispose();
		for ( const l of this.points ) l.dispose();
		this.sources.clear();
	}
}
