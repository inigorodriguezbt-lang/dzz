// One drawn vegetation mesh: a shared model geometry plus a growable per-instance buffer
// (iPos = x, y, z relative to the mesh origin, s; iDat = yaw, rank, a, b — see species.js).
//
// The instance positions are stored relative to a mesh origin near the camera (set on every refill)
// so float32 precision holds anywhere on the 76 km map. The buffers are refilled in place (begin /
// push / end) and only grow, so steady-state refills allocate nothing.
import * as THREE from 'three';
import { STRIDE } from './species.js';

export class InstanceTarget {
	constructor( name, geometry, material, depthMaterial = null, cap = 512 ) {
		this.name = name;
		this.base = geometry;
		this.material = material;
		this.depthMaterial = depthMaterial;
		this.geometry = new THREE.InstancedBufferGeometry();
		this.geometry.index = geometry.index;
		for ( const k in geometry.attributes ) this.geometry.setAttribute( k, geometry.attributes[ k ] );
		// the vertex shader places every instance: never cull the mesh as a whole
		this.geometry.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
		this.mesh = new THREE.Mesh( this.geometry, material );
		this.mesh.name = 'veg-' + name;
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.receiveShadow = true;
		if ( depthMaterial ) this.mesh.customDepthMaterial = depthMaterial;
		this.mesh.visible = false;
		this.count = 0;
		this.n = 0;
		this._alloc( cap );
	}

	_alloc( cap ) {
		this.cap = cap;
		this.data = new Float32Array( cap * STRIDE );
		this.ib = new THREE.InstancedInterleavedBuffer( this.data, STRIDE, 1 );
		this.ib.setUsage( THREE.DynamicDrawUsage );
		this.geometry.setAttribute( 'iPos', new THREE.InterleavedBufferAttribute( this.ib, 4, 0 ) );
		this.geometry.setAttribute( 'iDat', new THREE.InterleavedBufferAttribute( this.ib, 4, 4 ) );
	}

	begin() { this.n = 0; }

	// copy instance o of src (STRIDE floats) with its position made relative to ( ox, oy, oz );
	// rankOverride replaces the rank field (impostors pack their atlas slot in there)
	push( src, o, ox, oy, oz, rankOverride = - 1 ) {
		if ( this.n >= this.cap ) {
			// grow ×2: a new GPU buffer (the old one is released with its attribute)
			const old = this.data;
			this.geometry.dispose();
			this._alloc( this.cap * 2 );
			this.data.set( old.subarray( 0, this.n * STRIDE ) );
		}
		const d = this.data, k = this.n * STRIDE;
		d[ k ] = src[ o ] - ox; d[ k + 1 ] = src[ o + 1 ] - oy; d[ k + 2 ] = src[ o + 2 ] - oz; d[ k + 3 ] = src[ o + 3 ];
		d[ k + 4 ] = src[ o + 4 ]; d[ k + 5 ] = rankOverride >= 0 ? rankOverride : src[ o + 5 ]; d[ k + 6 ] = src[ o + 6 ]; d[ k + 7 ] = src[ o + 7 ];
		this.n ++;
	}

	end( origin ) {
		this.count = this.n;
		this.geometry.instanceCount = this.n;
		this.ib.clearUpdateRanges();
		if ( this.n > 0 ) {
			this.ib.addUpdateRange( 0, this.n * STRIDE );
			this.ib.needsUpdate = true;
		}
		this.mesh.visible = this.n > 0;
		this.mesh.position.copy( origin );
		this.mesh.updateMatrix();
		this.mesh.updateMatrixWorld( true );
	}

	dispose() {
		this.geometry.dispose();
		this.material.dispose();
		this.depthMaterial?.dispose();
	}
}
