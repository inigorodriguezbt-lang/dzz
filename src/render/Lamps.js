// The world's small lights (muzzle flashes, fires, lanterns and street lamps at night, the flashlight, the
// driven vehicle's headlights) share three point lights and one spot light. Every lit pixel evaluates every light
// in the scene, lit or dark, and adding or removing one recompiles every lit material; the systems used to keep
// their own always-present lights (five points and two spots: ~10% of the opaque pass with all of them dark). Now
// their lights are proxies, never in the scene: each frame (World.update, after the systems) the strongest lit
// ones near the camera are copied onto the real ones.
import * as THREE from 'three';

const POINTS = 3;

export class Lamps {
	constructor( scene ) {
		this.points = [];
		for ( let i = 0; i < POINTS; i ++ ) {
			const l = new THREE.PointLight( 0xffffff, 0, 10, 2 );
			l.castShadow = false;
			l.name = 'lamp' + i;
			this.points.push( l );
		}
		this.spot = new THREE.SpotLight( 0xffffff, 0, 40, 0.45, 0.5, 2 );
		this.spot.castShadow = false;
		this.spot.name = 'lampSpot';
		scene.add( ...this.points, this.spot, this.spot.target );
		this.pointSrc = new Set();
		this.spotSrc = []; // { light, priority }, highest priority first
		this._list = [];
	}

	// a PointLight (not added to any scene) whose position / colour / intensity / distance the owner sets
	addPoint( light ) { this.pointSrc.add( light ); return light; }
	// a SpotLight (not in any scene; its target not either): the lit one with the highest priority gets the spot
	addSpot( light, priority = 0 ) {
		this.spotSrc.push( { light, priority } );
		this.spotSrc.sort( ( a, b ) => b.priority - a.priority );
		return light;
	}
	remove( light ) {
		this.pointSrc.delete( light );
		const i = this.spotSrc.findIndex( ( s ) => s.light === light );
		if ( i >= 0 ) this.spotSrc.splice( i, 1 );
	}

	update( camPos ) {
		const list = this._list;
		list.length = 0;
		for ( const l of this.pointSrc ) {
			if ( ! ( l.intensity > 0 ) ) continue;
			const r = l.distance || 30;
			const d2 = l.position.distanceToSquared( camPos );
			if ( d2 > ( r + 60 ) * ( r + 60 ) ) continue;
			// (roughly its light at the camera)
			l.userData.lampScore = l.intensity * r * r / ( 1 + d2 );
			list.push( l );
		}
		list.sort( ( a, b ) => b.userData.lampScore - a.userData.lampScore );
		for ( let i = 0; i < POINTS; i ++ ) {
			const L = this.points[ i ], s = list[ i ];
			if ( ! s ) { L.intensity = 0; continue; }
			L.position.copy( s.position );
			L.color.copy( s.color );
			L.intensity = s.intensity;
			L.distance = s.distance;
			L.decay = s.decay;
		}
		const S = this.spot;
		const src = this.spotSrc.find( ( s ) => s.light.intensity > 0 )?.light;
		if ( ! src ) { S.intensity = 0; return; }
		S.position.copy( src.position );
		S.target.position.copy( src.target.position );
		S.target.updateMatrixWorld();
		S.color.copy( src.color );
		S.intensity = src.intensity;
		S.distance = src.distance;
		S.angle = src.angle;
		S.penumbra = src.penumbra;
		S.decay = src.decay;
	}

	dispose() {
		for ( const l of [ ...this.points, this.spot, this.spot.target ] ) l.parent?.remove( l );
		this.pointSrc.clear();
		this.spotSrc.length = 0;
	}
}
