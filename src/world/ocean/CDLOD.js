// Ported from Tidewater src/core/CDLOD.js (MIT, see LICENSE-Tidewater.txt)
// Continuous distance-dependent LOD (Strugar 2010) quadtree grid for the sea. A single G x G grid mesh is
// instanced for every selected node. Vertices near the outer edge of each LOD range geomorph toward the
// next coarser grid so there are never cracks or pops between levels.
// GLSL (CDLOD_GLSL): the material declares the instanced attribute `nodeData` (origin xz, size, lod) and
// the uniform `uCdlodMorph[ levels ]` ( morph start, 1 / morph range, grid spacing, 0 ), and calls
//   CdlodVertex cdlodMorph( vec4 node, vec2 grid, vec3 viewPos, float y0 )
import * as THREE from 'three';

export const CDLOD_GLSL = ( levels ) => /* glsl */`
	uniform vec4 uCdlodMorph[ ${ levels } ];
	struct CdlodVertex { vec2 worldXZ; float spacing; float morphK; float lod; float size; };
	// Morph in world space on the LOD's own vertex lattice (spacing h). Quarter nodes of a partially
	// subdivided parent carry the parent's LOD, so their extra vertices first snap onto that lattice;
	// every node covering a point then computes the same position.
	CdlodVertex cdlodMorph( vec4 node, vec2 grid, vec3 viewPos, float y0 ) {
		vec4 m = uCdlodMorph[ int( node.w ) ];
		float h = m.z;
		vec2 p = node.xy + grid * node.z;
		vec2 idx = floor( p / h + 1e-3 );
		vec2 snapped = idx * h;
		float dist = length( viewPos - vec3( snapped.x, y0, snapped.y ) );
		float morphK = clamp( ( dist - m.x ) * m.y, 0.0, 1.0 );
		vec2 odd = fract( idx * 0.5 ) * 2.0;
		CdlodVertex o;
		o.worldXZ = snapped - odd * h * morphK;
		o.spacing = h * ( morphK + 1.0 );
		o.morphK = morphK;
		o.lod = node.w;
		o.size = node.z;
		return o;
	}
`;

export class CDLOD {
	constructor( {
		gridSize = 64, // quads per node side (even)
		leafSize = 8, // node size at LOD 0 (m)
		levels = 12,
		rangeFactor = 2.5, // LOD range = leafSize * 2^lod * rangeFactor
		morphStartRatio = 0.66,
		maxInstances = 1500,
		minY = - 20,
		maxY = 20,
	} = {} ) {
		this.G = gridSize;
		this.leafSize = leafSize;
		this.levels = levels;
		this.minY = minY;
		this.maxY = maxY;
		this.ranges = [];
		this.morph = [];
		let prev = 0;
		for ( let l = 0; l < levels; l ++ ) {
			const r = leafSize * Math.pow( 2, l ) * rangeFactor;
			this.ranges.push( r );
			const start = prev + ( r - prev ) * morphStartRatio;
			this.morph.push( new THREE.Vector4( start, 1 / Math.max( 1e-3, r - start ), leafSize * Math.pow( 2, l ) / gridSize, 0 ) );
			prev = r;
		}
		this.glsl = CDLOD_GLSL( levels );

		// grid geometry in [0,1]^2 on XZ
		const G = gridSize;
		const verts = new Float32Array( ( G + 1 ) * ( G + 1 ) * 3 );
		let p = 0;
		for ( let j = 0; j <= G; j ++ ) for ( let i = 0; i <= G; i ++ ) { verts[ p ++ ] = i / G; verts[ p ++ ] = 0; verts[ p ++ ] = j / G; }
		// quads in column strips of STRIP: the next row of a strip reuses vertices the GPU shaded a moment
		// ago (a full grid row is longer than its post-transform reuse window)
		const STRIP = 8;
		const idx = new Uint32Array( G * G * 6 );
		p = 0;
		for ( let i0 = 0; i0 < G; i0 += STRIP ) for ( let j = 0; j < G; j ++ ) {
			for ( let i = i0; i < Math.min( i0 + STRIP, G ); i ++ ) {
				const a = j * ( G + 1 ) + i, b = a + 1, c = a + ( G + 1 ), d = c + 1;
				// alternate diagonal for better symmetry
				if ( ( i + j ) % 2 === 0 ) { idx[ p ++ ] = a; idx[ p ++ ] = c; idx[ p ++ ] = b; idx[ p ++ ] = b; idx[ p ++ ] = c; idx[ p ++ ] = d; } else { idx[ p ++ ] = a; idx[ p ++ ] = c; idx[ p ++ ] = d; idx[ p ++ ] = a; idx[ p ++ ] = d; idx[ p ++ ] = b; }
			}
		}
		const geo = new THREE.InstancedBufferGeometry();
		geo.setAttribute( 'position', new THREE.BufferAttribute( verts, 3 ) );
		geo.setIndex( new THREE.BufferAttribute( idx, 1 ) );
		this.nodeArray = new Float32Array( maxInstances * 4 );
		this.nodeAttr = new THREE.InstancedBufferAttribute( this.nodeArray, 4 );
		this.nodeAttr.setUsage( THREE.DynamicDrawUsage );
		geo.setAttribute( 'nodeData', this.nodeAttr );
		geo.instanceCount = 0;
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
		geo.boundingBox = new THREE.Box3( new THREE.Vector3( - 1e7, - 1e7, - 1e7 ), new THREE.Vector3( 1e7, 1e7, 1e7 ) );
		this.geometry = geo;
		this.maxInstances = maxInstances;
		this.count = 0;
		this._box = new THREE.Box3();
		this._frustum = new THREE.Frustum();
		this._mat = new THREE.Matrix4();
		this._cam = new THREE.Vector3();
		this._order = [];
		this.lodCounts = new Array( levels ).fill( 0 );
	}

	update( camera ) {
		this._mat.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._mat, camera.coordinateSystem, camera.reversedDepth );
		camera.getWorldPosition( this._cam );
		this.count = 0;
		this.lodCounts.fill( 0 );
		const top = this.levels - 1;
		const rootSize = this.leafSize * Math.pow( 2, top );
		const cx = Math.floor( this._cam.x / rootSize ), cz = Math.floor( this._cam.z / rootSize );
		for ( let j = - 1; j <= 1; j ++ ) for ( let i = - 1; i <= 1; i ++ ) this._select( ( cx + i ) * rootSize, ( cz + j ) * rootSize, rootSize, top );

		// front-to-back order so early depth testing rejects hidden wave faces
		const n = this.count, arr = this.nodeArray, c = this._cam, order = this._order;
		order.length = n;
		for ( let i = 0; i < n; i ++ ) {
			const s = arr[ i * 4 + 2 ];
			const dx = Math.max( arr[ i * 4 ] - c.x, 0, c.x - arr[ i * 4 ] - s );
			const dz = Math.max( arr[ i * 4 + 1 ] - c.z, 0, c.z - arr[ i * 4 + 1 ] - s );
			order[ i ] = { d: dx * dx + dz * dz, x: arr[ i * 4 ], z: arr[ i * 4 + 1 ], s, l: arr[ i * 4 + 3 ] };
		}
		order.sort( ( a, b ) => a.d - b.d );
		for ( let i = 0; i < n; i ++ ) {
			const o = order[ i ];
			arr[ i * 4 ] = o.x; arr[ i * 4 + 1 ] = o.z; arr[ i * 4 + 2 ] = o.s; arr[ i * 4 + 3 ] = o.l;
		}
		this.geometry.instanceCount = this.count;
		this.nodeAttr.clearUpdateRanges();
		this.nodeAttr.addUpdateRange( 0, this.count * 4 );
		this.nodeAttr.needsUpdate = true;
	}

	_bounds( x, z, size ) {
		this._box.min.set( x, this.minY, z );
		this._box.max.set( x + size, this.maxY, z + size );
		return this._box;
	}

	_intersectsSphere( box, r ) {
		const c = this._cam;
		const dx = Math.max( box.min.x - c.x, 0, c.x - box.max.x );
		const dy = Math.max( box.min.y - c.y, 0, c.y - box.max.y );
		const dz = Math.max( box.min.z - c.z, 0, c.z - box.max.z );
		return dx * dx + dy * dy + dz * dz <= r * r;
	}

	_add( x, z, size, lod ) {
		if ( this.count >= this.maxInstances ) return;
		const o = this.count * 4;
		this.nodeArray[ o ] = x; this.nodeArray[ o + 1 ] = z; this.nodeArray[ o + 2 ] = size; this.nodeArray[ o + 3 ] = lod;
		this.count ++;
		this.lodCounts[ lod ] ++;
	}

	_select( x, z, size, lod ) {
		const box = this._bounds( x, z, size );
		if ( ! this._intersectsSphere( box, this.ranges[ lod ] ) ) return false;
		if ( ! this._frustum.intersectsBox( box ) ) return true;
		if ( lod === 0 || ! this._intersectsSphere( box, this.ranges[ lod - 1 ] ) ) {
			this._add( x, z, size, lod );
			return true;
		}
		const h = size * 0.5;
		const children = [ [ x, z ], [ x + h, z ], [ x, z + h ], [ x + h, z + h ] ];
		for ( const [ cx, cz ] of children ) {
			if ( ! this._select( cx, cz, h, lod - 1 ) ) {
				// quadrant outside the finer range: draw it at this node's LOD
				const b = this._bounds( cx, cz, h );
				if ( this._frustum.intersectsBox( b ) ) this._add( cx, cz, h, lod );
			}
		}
		return true;
	}
}
