// What the crosshair is on, and what F does. Systems register providers:
//   game.interact.addProvider( ( ray, maxDist ) => [ { t, label, sub?, icon?, action: () => {}, key?: 'interact', hold?: seconds } ] )
// ray = { origin: Vector3, dir: Vector3 (unit) }. The closest candidate wins; a wall in front of it blocks it.
import * as THREE from 'three';

export const REACH = 2.6;

export class Interact {
	constructor( game ) {
		this.game = game;
		this.providers = [];
		this.target = null;
		this.holdT = 0;
		this.ray = { origin: new THREE.Vector3(), dir: new THREE.Vector3() };
	}
	addProvider( fn ) { this.providers.push( fn ); return () => this.providers.splice( this.providers.indexOf( fn ), 1 ); }

	update( dt ) {
		const g = this.game;
		if ( g.player.vehicle ) { this.target = g.vehicles?.seatInteraction?.() || null; this._press( dt ); return; }
		const cam = g.camera;
		this.ray.origin.copy( cam.position );
		this.ray.dir.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		let best = null;
		for ( const p of this.providers ) {
			let list;
			try { list = p( this.ray, REACH + 1.5 ); } catch ( e ) { console.error( e ); continue; }
			if ( ! list ) continue;
			for ( const c of list ) if ( c && c.t <= ( c.reach || REACH ) && ( ! best || c.t < best.t ) ) best = c;
		}
		// blocked by a wall in between?
		if ( best && ! best.noOcclusion ) {
			const hit = g.physics.raycastBoxes( this.ray.origin, this.ray.dir, best.t - 0.05, b => ! best.ownerBox || b !== best.ownerBox );
			if ( hit && hit.box !== best.ownerBox && hit.box.owner !== best.owner ) best = null;
		}
		if ( best?.id !== this.target?.id ) this.holdT = 0;
		this.target = best;
		this._press( dt );
	}

	_press( dt ) {
		const g = this.game, t = this.target;
		if ( ! t || ! g.inputActive || g.actions.busy ) { this.holdT = 0; return; }
		const key = t.key || 'interact';
		if ( t.hold ) {
			if ( g.input.is( key ) ) {
				this.holdT += dt;
				if ( this.holdT >= t.hold ) { this.holdT = 0; t.action(); }
			} else this.holdT = 0;
		} else if ( g.input.pressed( key ) ) {
			t.action();
		}
	}
}
