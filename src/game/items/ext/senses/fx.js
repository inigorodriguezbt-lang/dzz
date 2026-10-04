// What the senses equipment puts in the world (browser only, loaded by runtime.js): the laser pointer's dot and its
// faint beam, the infrared illuminator's beam (a spot only a night-vision tube sees, through the world's shared lamps),
// the plumes over Kīlauea's vents and the ocean entry (puffs into the FX smoke pool, a yellow-grey column you can see
// from kilometres out), and a diver's exhale bubbles.
import * as THREE from 'three';
import { glowSprite } from '../../placeables/fx.js';
import { F } from '../../../../render/FX.js';
import * as L from './logic.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
const PLUME_R = 4200; // a vent's plume shows within this many metres of the camera

export class SensesFX {
	constructor( sys ) {
		this.sys = sys;
		const g = this.game = sys.game;
		// the laser dot: a hot green point that blooms, scaled so it stays a few pixels however far it lands
		this.dot = glowSprite( 0xffffff, 0.05 );
		this.dot.material.color.setRGB( 0.35, 6, 0.5 );
		this.dot.material.depthTest = true;
		this.dot.visible = false;
		this.dot.renderOrder = 30;
		g.scene.add( this.dot );
		// the beam: barely there by day, a thin green line through the night air
		const bg = new THREE.BufferGeometry();
		bg.setAttribute( 'position', new THREE.Float32BufferAttribute( new Float32Array( 6 ), 3 ) );
		this.beam = new THREE.Line( bg, new THREE.LineBasicMaterial( { color: 0x40ff60, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false } ) );
		this.beam.frustumCulled = false;
		this.beam.layers.set( 1 );
		this.beam.visible = false;
		g.scene.add( this.beam );
		// the infrared beam (a proxy for the world's shared spot light, below a flashlight in priority)
		this.irSpot = new THREE.SpotLight( 0xffffff, 0, L.IR.range, L.IR.angle, 0.6, 2 );
		this.irSpot.castShadow = false;
		if ( g.world?.lamps ) g.world.lamps.addSpot( this.irSpot, 0.5 );
		else { this.irSpot.visible = false; }
		this.acc = new Map();
		this.warm = new Set();
	}

	update( dt ) {
		const g = this.game, sys = this.sys, cam = g.camera;
		// ---- the laser ----
		const las = sys.laser;
		if ( las.on && las.hit ) {
			const d = cam.position.distanceTo( las.hit );
			this.dot.visible = true;
			this.dot.position.copy( las.hit ).addScaledVector( _f.copy( cam.position ).sub( las.hit ).normalize(), Math.min( 0.03, d * 0.002 ) );
			this.dot.scale.setScalar( Math.max( 0.014, d * 0.006 ) );
			const night = g.world?.sky?.night ?? 0;
			// from the hand, a little right of and below the eye
			const p = this.beam.geometry.attributes.position;
			_v.set( 0.16, - 0.14, - 0.3 ).applyQuaternion( cam.quaternion ).add( cam.position );
			p.setXYZ( 0, _v.x, _v.y, _v.z ); p.setXYZ( 1, las.hit.x, las.hit.y, las.hit.z ); p.needsUpdate = true;
			this.beam.material.opacity = 0.04 + night * 0.12 + sys.vogCam * 0.2;
			this.beam.visible = true;
		} else { this.dot.visible = false; this.beam.visible = false; }
		// ---- the infrared illuminator, from the head ----
		const S = this.irSpot;
		if ( sys.ir ) {
			_f.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
			S.position.copy( cam.position ).addScaledVector( _f, 0.1 );
			S.position.y += 0.05;
			S.target.position.copy( cam.position ).addScaledVector( _f, 15 );
			S.target.updateMatrixWorld();
			S.intensity = L.IR.intensity;
			S.color.setHex( 0xffffff );
		} else S.intensity = 0;
	}

	// puffs over each vent in range (called a few times a second); laid out already risen when one first comes into range
	plumes( step ) {
		const g = this.game, fx = g.fx, cam = g.camera;
		if ( ! fx?.alpha || ! cam ) return;
		const w = this.sys.windDir(), wind = g.weather?.wind ?? 0.45;
		for ( const v of L.VENTS ) {
			const d = Math.hypot( cam.position.x - v.x, cam.position.z - v.z );
			if ( d > PLUME_R ) { this.warm.delete( v.id ); continue; }
			if ( ! v.y ) v.y = g.hf?.heightAt?.( v.x, v.z ) ?? 0;
			const far = d > 900 ? 1.5 : 1;
			if ( ! this.warm.has( v.id ) ) {
				this.warm.add( v.id );
				for ( let i = 0, n = Math.round( v.puffs * 36 / far ); i < n; i ++ ) fx.alpha.emit( this.puff( v, w, wind, far, ( i + Math.random() ) / n * 36 ) );
			}
			const acc = ( this.acc.get( v.id ) || 0 ) + step * v.puffs / far;
			let n = Math.floor( acc );
			this.acc.set( v.id, acc - n );
			while ( n -- > 0 ) fx.alpha.emit( this.puff( v, w, wind, far, 0 ) );
		}
	}

	// a puff of the plume `age` seconds into its life: sulphurous yellow-grey for vog, white steam for laze
	puff( v, w, wind, big, age ) {
		// (a slim, thin column that leans downwind as it climbs and spreads)
		const life = 36 + Math.random() * 10, f = age / life;
		const a = Math.random() * Math.PI * 2, r = Math.random() * v.r * 0.35;
		const drift = 1 + wind * 3;
		const vx = w.x * drift + ( Math.random() - 0.5 ) * 0.5, vz = w.z * drift + ( Math.random() - 0.5 ) * 0.5, vy = v.rise / life * ( 0.75 + Math.random() * 0.5 );
		const s0 = Math.max( 3, v.r * 0.1 ) * big, s1 = ( v.r * 0.32 + 10 ) * big;
		const c = v.laze ? [ 0.86, 0.87, 0.89 ] : [ 0.74, 0.7, 0.55 ];
		const sh = 0.92 + Math.random() * 0.1;
		return { x: v.x + Math.cos( a ) * r + vx * age, y: v.y + 2 + vy * age, z: v.z + Math.sin( a ) * r + vz * age, vx, vy, vz,
			life: life - age, s0: s0 + ( s1 - s0 ) * f, s1, frame: F.smoke, r: c[ 0 ] * sh, g: c[ 1 ] * sh, b: c[ 2 ] * sh, a: v.laze ? 0.3 : 0.22, drag: 0.02, grav: 0, rotV: ( Math.random() - 0.5 ) * 0.08, fadeIn: age > 0 ? 0 : 0.12 };
	}

	// a diver's exhale: a burst of bubbles rising from the regulator
	bubbles() {
		const g = this.game, fx = g.fx, cam = g.camera;
		if ( ! fx?.alpha || ! cam ) return;
		_f.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		for ( let i = 0; i < 14; i ++ ) {
			const x = cam.position.x + _f.x * 0.25 + ( Math.random() - 0.5 ) * 0.25, z = cam.position.z + _f.z * 0.25 + ( Math.random() - 0.5 ) * 0.25;
			fx.alpha.emit( { x, y: cam.position.y - 0.15 + Math.random() * 0.1, z, vx: ( Math.random() - 0.5 ) * 0.2, vy: 0.9 + Math.random() * 0.8, vz: ( Math.random() - 0.5 ) * 0.2,
				life: 1.6 + Math.random(), s0: 0.012 + Math.random() * 0.02, s1: 0.03 + Math.random() * 0.03, frame: F.drop, r: 2.4, g: 2.6, b: 2.8, a: 0.5, drag: 0.4, grav: - 0.6, fadeIn: 0.05 } );
		}
	}

	dispose() {
		const g = this.game;
		g.scene.remove( this.dot ); this.dot.material.dispose();
		g.scene.remove( this.beam ); this.beam.geometry.dispose(); this.beam.material.dispose();
		g.world?.lamps?.remove?.( this.irSpot );
	}
}
