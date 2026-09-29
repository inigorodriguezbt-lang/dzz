// TEMP: model preview
import * as THREE from 'three';
import { getModel } from './models/index.js';
import { makeBodyMaterial, makeGlassMaterial } from './materials.js';
import { LAYER_POST } from '../render/Renderer.js';

export function install( game ) {
	window.__vehPreview = ( name, x, z, yaw = 0, paint = 0x9a1b1b ) => {
		const m = getModel( name );
		const g = new THREE.Group();
		const mat = makeBodyMaterial( { paint, metallic: 0.5 } );
		const body = new THREE.Mesh( m.near, mat ); body.castShadow = body.receiveShadow = true; g.add( body );
		if ( m.glass ) { const gl = new THREE.Mesh( m.glass, makeGlassMaterial() ); gl.layers.set( LAYER_POST ); g.add( gl ); }
		for ( const w of m.wheels ) { const wm = new THREE.Mesh( m.wheelGeo, mat ); wm.position.set( w.x, w.y, w.z ); wm.scale.x = w.side; wm.castShadow = true; g.add( wm ); }
		if ( m.steering ) { const s = new THREE.Mesh( m.steering, mat ); const S = m.P.steer; s.position.set( S.x, S.y, - S.f ); s.rotation.x = - S.tilt; g.add( s ); }
		const y = game.physics.ground( x, z, 1e4 ).y;
		g.position.set( x, y, z ); g.rotation.y = yaw;
		game.scene.add( g );
		return { tris: m.near.attributes.position.count / 3, far: m.far.attributes.position.count / 3 };
	};
}
