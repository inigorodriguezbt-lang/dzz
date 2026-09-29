// Accumulates plant vertices with the vegetation attribute layout (see VegMaterial.js):
//   position, normal, uv
//   aVeg vec4: x trunk-sway weight (0 at the base .. 1 at the top; palm trunks: height fraction u)
//              y branch / frond bend weight (palm fronds: s along the frond), z flutter weight, w phase
//   aMat vec4: x part (0 palm trunk, 1 bark, 2 atlas leaf, 3 untextured colour, 4 rock)
//              y exposure / ambient occlusion (0 deep inside .. 1 outer), z colour random, w palm crown id
//   aCol vec3: linear base colour multiplier
import * as THREE from 'three';

export const PART = { PALMBARK: 0, BARK: 1, LEAF: 2, SOLID: 3, ROCK: 4 };

export class GeoBuilder {
	constructor() {
		this.pos = []; this.nor = []; this.uv = []; this.veg = []; this.mat = []; this.col = []; this.idx = [];
		// defaults for the next vertices
		this.cVeg = [ 0, 0, 0, 0 ];
		this.cMat = [ 1, 1, 0.5, 0 ];
		this.cCol = [ 1, 1, 1 ];
	}

	get count() { return this.pos.length / 3; }
	get triangles() { return this.idx.length / 3; }

	vertex( p, n, u, v, veg = this.cVeg, mat = this.cMat, col = this.cCol ) {
		this.pos.push( p.x, p.y, p.z );
		this.nor.push( n.x, n.y, n.z );
		this.uv.push( u, v );
		this.veg.push( veg[ 0 ], veg[ 1 ], veg[ 2 ], veg[ 3 ] );
		this.mat.push( mat[ 0 ], mat[ 1 ], mat[ 2 ], mat[ 3 ] );
		this.col.push( col[ 0 ], col[ 1 ], col[ 2 ] );
		return this.count - 1;
	}

	tri( a, b, c ) { this.idx.push( a, b, c ); }
	quad( a, b, c, d ) { this.idx.push( a, b, c, a, c, d ); }

	// bounding sphere given explicitly: the vertex shader moves everything anyway
	build() {
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nor, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( this.uv, 2 ) );
		g.setAttribute( 'aVeg', new THREE.Float32BufferAttribute( this.veg, 4 ) );
		g.setAttribute( 'aMat', new THREE.Float32BufferAttribute( this.mat, 4 ) );
		g.setAttribute( 'aCol', new THREE.Float32BufferAttribute( this.col, 3 ) );
		g.setIndex( this.count > 65535 ? new THREE.Uint32BufferAttribute( this.idx, 1 ) : new THREE.Uint16BufferAttribute( this.idx, 1 ) );
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;
	}
}

export function mulberry32( seed ) {
	let a = seed >>> 0;
	return () => {
		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

// sRGB hex to linear rgb array
export function lin( hex ) {
	const c = new THREE.Color( hex );
	return [ c.r, c.g, c.b ];
}
