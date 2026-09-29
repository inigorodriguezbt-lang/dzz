// Streaming terrain: a quadtree over the whole chain; every node is a 32x32 grid built by the world
// workers from the baked heights. Near nodes are 64 m (2 m spacing); the whole archipelago stays
// visible to the horizon through the coarse levels. Deep ocean nodes are skipped (the sea covers them).
import * as THREE from 'three';
import { patchMaterial, tex } from '../render/Materials.js';

const GRID = 32;
const LEAF = 64;
const ROOT = 131072;

class Node {
	constructor( x0, z0, size, level, parent ) {
		this.x0 = x0; this.z0 = z0; this.size = size; this.level = level; this.parent = parent;
		this.children = null;
		this.mesh = null;
		this.state = 0; // 0 none, 1 requested, 2 ready, 3 empty (deep sea / outside)
		this.job = null;
		this.lastUsed = 0;
		this.minY = 0; this.maxY = 0;
	}
}

export class Terrain {
	constructor( hf, pool, settings ) {
		this.hf = hf;
		this.pool = pool;
		this.settings = settings;
		this.group = new THREE.Group();
		this.group.name = 'terrain';
		this.root = new Node( - ROOT / 2, - ROOT / 2, ROOT, 0, null );
		this.frame = 0;
		this.loadedCount = 0;
		this.pendingCount = 0;
		this.index = buildIndex();
		this.material = makeTerrainMaterial();
		TerrainMorph.material = this.material;
		// shadow pass: fold the skirts back up to the edge so they never cast slivers of shadow
		this.depthMaterial = new THREE.MeshDepthMaterial( { depthPacking: THREE.RGBADepthPacking } );
		this.depthMaterial.onBeforeCompile = ( sh ) => {
			sh.vertexShader = sh.vertexShader.replace( '#include <common>', '#include <common>\nattribute float skirt;' )
				.replace( '#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += skirt;' );
		};
		this.depthMaterial.customProgramCacheKey = () => 'terrain-depth';
		this._v = new THREE.Vector3();
		this.drawn = [];
	}

	// how many nodes the current view still waits for (loading screen)
	get pending() { return this.pendingCount; }

	update( camPos, frustum ) {
		this.frame ++;
		const K = { low: 1.6, medium: 2.0, high: 2.5, ultra: 3.2 }[ this.settings.get( 'terrainDetail' ) ] || 2.0;
		TerrainMorph.K.value = K;
		for ( const m of this.drawn ) m.visible = false;
		this.drawn.length = 0;
		this._select( this.root, camPos, K, frustum );
		// evict meshes unused for a while
		if ( this.frame % 60 === 0 ) this._evict( this.root );
	}

	_rangeOf( n ) {
		if ( n.rangeKnown ) return;
		const [ a, b ] = this.hf.rangeOver( n.x0, n.z0, n.size );
		n.minY = a; n.maxY = b + 3; n.rangeKnown = true;
	}

	_empty( n ) {
		const hx = this.hf.halfX, hz = this.hf.halfZ;
		if ( n.x0 > hx + 2000 || n.z0 > hz + 2000 || n.x0 + n.size < - hx - 2000 || n.z0 + n.size < - hz - 2000 ) return true;
		this._rangeOf( n );
		return n.maxY < - 40;
	}

	_dist( n, p ) {
		const dx = Math.max( n.x0 - p.x, 0, p.x - ( n.x0 + n.size ) );
		const dz = Math.max( n.z0 - p.z, 0, p.z - ( n.z0 + n.size ) );
		const dy = Math.max( n.minY - p.y, 0, p.y - n.maxY );
		return Math.hypot( dx, dy, dz );
	}

	_wantSplit( n, p, K ) {
		if ( n.size <= LEAF ) return false;
		return this._dist( n, p ) < n.size * K;
	}

	_ready( n ) {
		if ( n.state === 0 ) {
			if ( this._empty( n ) ) n.state = 3;
		}
		return n.state === 2 || n.state === 3;
	}

	_request( n, p ) {
		if ( n.state !== 0 ) return;
		if ( this._empty( n ) ) { n.state = 3; return; }
		n.state = 1;
		this.pendingCount ++;
		const pri = this._dist( n, p ) / n.size - n.level * 0.01;
		n.job = this.pool.submit( { type: 'terrain', x0: n.x0, z0: n.z0, size: n.size, skirt: n.size / GRID * 1.5 + 0.5 }, pri );
		n.job.promise.then( ( r ) => {
			this.pendingCount --;
			n.job = null;
			if ( ! r ) { n.state = 0; return; }
			if ( n.state !== 1 ) return; // evicted meanwhile
			n.mesh = this._makeMesh( n, r );
			n.minY = r.minY; n.maxY = r.maxY;
			n.state = 2;
			this.loadedCount ++;
		} ).catch( () => { this.pendingCount --; n.state = 0; } );
	}

	_makeMesh( n, r ) {
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.BufferAttribute( r.pos, 3 ) );
		const ib = new THREE.InterleavedBuffer( r.nor, 4 );
		g.setAttribute( 'normal', new THREE.InterleavedBufferAttribute( ib, 3, 0, true ) );
		g.setAttribute( 'surf', new THREE.BufferAttribute( r.surf, 4, true ) );
		g.setAttribute( 'tmask', new THREE.BufferAttribute( r.mask, 4, true ) );
		g.setAttribute( 'skirt', new THREE.BufferAttribute( r.skirt, 1 ) );
		g.setAttribute( 'parentY', new THREE.BufferAttribute( r.parentY, 1 ) );
		
		g.setIndex( this.index );
		g.boundingBox = new THREE.Box3( new THREE.Vector3( 0, r.minY, 0 ), new THREE.Vector3( n.size, r.maxY, n.size ) );
		g.boundingSphere = g.boundingBox.getBoundingSphere( new THREE.Sphere() );
		const m = new THREE.Mesh( g, this.material );
		m.customDepthMaterial = this.depthMaterial;
		m.onBeforeRender = TerrainMorph.before;
		m.userData.lodSize = n.size;
		m.position.set( n.x0, 0, n.z0 );
		m.updateMatrix();
		m.updateMatrixWorld();
		m.matrixAutoUpdate = false;
		m.receiveShadow = true;
		m.castShadow = n.size <= 512;
		m.visible = false;
		m.userData.node = n;
		this.group.add( m );
		return m;
	}

	_select( n, p, K, frustum ) {
		n.lastUsed = this.frame;
		if ( this._wantSplit( n, p, K ) ) {
			if ( ! n.children ) {
				const h = n.size / 2;
				n.children = [
					new Node( n.x0, n.z0, h, n.level + 1, n ), new Node( n.x0 + h, n.z0, h, n.level + 1, n ),
					new Node( n.x0, n.z0 + h, h, n.level + 1, n ), new Node( n.x0 + h, n.z0 + h, h, n.level + 1, n ),
				];
			}
			let all = true;
			for ( const c of n.children ) { if ( ! this._ready( c ) ) { this._request( c, p ); all = false; } }
			if ( all ) {
				for ( const c of n.children ) this._select( c, p, K, frustum );
				return;
			}
		}
		if ( ! this._ready( n ) ) { this._request( n, p ); return; }
		if ( n.state === 2 ) {
			n.mesh.visible = true;
			this.drawn.push( n.mesh );
		}
	}

	_evict( n ) {
		if ( n.children ) for ( const c of n.children ) this._evict( c );
		if ( n.level > 2 && this.frame - n.lastUsed > 240 ) {
			if ( n.mesh ) { this.group.remove( n.mesh ); n.mesh.geometry.dispose(); n.mesh = null; this.loadedCount --; }
			if ( n.job ) { n.job.cancelled = true; }
			if ( n.state !== 3 ) n.state = 0;
			if ( n.children && n.children.every( c => ! c.mesh && ! c.children && c.state !== 1 ) ) n.children = null;
		}
	}
}

function buildIndex() {
	const V = GRID + 1, idx = [];
	for ( let j = 0; j < GRID; j ++ ) for ( let i = 0; i < GRID; i ++ ) {
		const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
		// alternate the diagonal for a less directional look
		if ( ( i + j ) & 1 ) idx.push( a, c, b, b, c, d ); else idx.push( a, c, d, a, d, b );
	}
	// skirts: edges are listed clockwise from the north edge (see the worker)
	const nMain = V * V, E = V * 4;
	const edgeSrc = [];
	for ( let i = 0; i < V; i ++ ) edgeSrc.push( i );
	for ( let j = 0; j < V; j ++ ) edgeSrc.push( j * V + GRID );
	for ( let i = GRID; i >= 0; i -- ) edgeSrc.push( GRID * V + i );
	for ( let j = GRID; j >= 0; j -- ) edgeSrc.push( j * V );
	for ( let e = 0; e < E - 1; e ++ ) {
		if ( ( e + 1 ) % V === 0 ) continue; // corner seam between edges
		const top0 = edgeSrc[ e ], top1 = edgeSrc[ e + 1 ], bot0 = nMain + e, bot1 = nMain + e + 1;
		idx.push( top0, bot0, top1, top1, bot0, bot1 );
	}
	return new THREE.BufferAttribute( new Uint32Array( idx ), 1 );
}

// CDLOD-style geomorphing: every vertex slides towards the height its parent node would give it as the
// node approaches the distance where it merges into that parent, so LOD changes never pop.
export const TerrainMorph = {
	K: { value: 2.5 },
	size: { value: 64 },
	material: null,
	before( renderer, scene, camera, geometry, material ) {
		if ( material !== TerrainMorph.material ) return;
		TerrainMorph.size.value = this.userData.lodSize;
		material.uniformsNeedUpdate = true;
	},
};

export function makeTerrainMaterial() {
	const m = new THREE.MeshStandardMaterial( { roughness: 0.95, metalness: 0, color: 0xffffff } );
	const T = {
		tSand: tex( 'sand_d' ), tGrass: tex( 'grass_d' ), tDry: tex( 'drygrass_d' ), tForest: tex( 'forest_d' ),
		tRed: tex( 'reddirt_d' ), tDirt: tex( 'dirt_d' ), tRock: tex( 'rock_d' ), tCliff: tex( 'cliff_d' ),
		tLava: tex( 'lava_d' ), tSnow: tex( 'snow_d' ), tFarm: tex( 'farm_d' ), tWalk: tex( 'sidewalk_d' ),
		nGrass: tex( 'grass_n', { srgb: false } ), nRock: tex( 'rock_n', { srgb: false } ), nSand: tex( 'sand_n', { srgb: false } ),
	};
	const uniforms = {};
	for ( const k in T ) uniforms[ k ] = { value: T[ k ] };
	patchMaterial( m, 'terrain', ( shader ) => {
		Object.assign( shader.uniforms, uniforms );
		shader.uniforms.uLodK = TerrainMorph.K;
		shader.uniforms.uLodSize = TerrainMorph.size;
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec4 surf; attribute vec4 tmask; attribute float parentY; uniform float uLodK; uniform float uLodSize; varying vec4 vSurf; varying vec4 vMask;' )
			.replace( '#include <begin_vertex>', `#include <begin_vertex>
				vSurf = surf; vMask = tmask;
				{
					vec3 wpm = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
					float dm = distance( wpm, cameraPosition );
					float km = smoothstep( uLodSize * uLodK * 1.55, uLodSize * uLodK * 1.95, dm );
					transformed.y = mix( position.y, parentY, km );
				}` );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\nvarying vec4 vSurf; varying vec4 vMask;\n' + Object.keys( T ).map( k => `uniform sampler2D ${k};` ).join( '\n' ) )
			.replace( '#include <map_fragment>', TERRAIN_ALBEDO )
			.replace( '#include <normal_fragment_maps>', TERRAIN_NORMAL )
			.replace( '#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;' );
	} );
	return m;
}

const TERRAIN_ALBEDO = /* glsl */`
	vec3 wN = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz );
	vec3 wp = vWorldPos;
	vec2 xz = wp.xz;
	float slope = 1.0 - wN.y;
	float moist = vSurf.r, lava = vSurf.g, red = vSurf.b, field = vSurf.a;
	float city = vMask.r, road = vMask.g, pasture = vMask.b, shore = vMask.a;
	float n1 = vnoise2( xz / 41.0 ), n2 = vnoise2( xz / 13.0 + 7.3 ), n3 = vnoise2( xz / 97.0 - 3.1 ), n4 = vnoise2( xz / 5.3 + 1.7 );
	float macro = fbm2( xz / 260.0 );
	float dist = length( wp - uCamPos );

	vec3 grassT = texture2D( tGrass, xz / 3.2 ).rgb;
	vec3 dryT = texture2D( tDry, xz / 3.4 ).rgb;
	vec3 forestT = texture2D( tForest, xz / 4.1 ).rgb;
	// the scanned textures are temperate and dark: normalise them to their own luminance and repaint
	// them with a tropical palette (Tidewater's meadow tones), keeping the texture's detail
	float lg = dot( grassT, vec3( 0.3, 0.55, 0.15 ) ), ld = dot( dryT, vec3( 0.3, 0.55, 0.15 ) ), lf = dot( forestT, vec3( 0.3, 0.55, 0.15 ) );
	vec3 lush = vec3( 0.05, 0.11, 0.02 ), green = vec3( 0.1, 0.175, 0.032 ), olive = vec3( 0.15, 0.17, 0.05 ), straw = vec3( 0.27, 0.235, 0.14 );
	// the baked rainfall runs dry for the lowlands; Hawaiʻi reads greener than that except on the true leeward coasts
	float wet = clamp( moist * 1.15 + 0.14 + ( n1 - 0.5 ) * 0.3 + ( macro - 0.5 ) * 0.28, 0.0, 1.0 );
	vec3 grass = mix( green, lush, smoothstep( 0.55, 0.85, wet ) ) * ( grassT / max( lg, 0.02 ) ) * mix( 0.85, 1.15, n2 );
	// the dry scan is already yellow: keep only a little of its hue so the palette isn't coloured twice
	vec3 dry = mix( straw, olive, smoothstep( 0.18, 0.4, wet + ( n3 - 0.5 ) * 0.2 ) ) * mix( vec3( ld ), dryT, 0.35 ) / max( ld, 0.02 );
	vec3 forest = lush * 0.8 * ( forestT / max( lf, 0.02 ) );
	vec3 c = mix( dry, grass, smoothstep( 0.22, 0.5, wet ) );
	c = mix( c, forest, smoothstep( 0.66, 0.9, wet ) * ( 1.0 - pasture ) * 0.7 );
	// pasture: short, even ranch grass
	c = mix( c, green * ( grassT / max( lg, 0.02 ) ) * 1.1, pasture * 0.6 );
	// bare dirt in dry country, red laterite on the old islands where it is dry enough to show
	vec3 dirt = texture2D( tDirt, xz / 4.0 ).rgb * vec3( 0.95, 0.85, 0.72 );
	c = mix( c, dirt, smoothstep( 0.62, 0.9, ( 1.0 - wet ) * ( n2 * 0.6 + n3 * 0.6 ) ) * 0.7 );
	vec3 redc = texture2D( tRed, xz / 4.3 ).rgb;
	float redW = smoothstep( 0.42, 0.78, red + ( n1 - 0.5 ) * 0.45 + ( n4 - 0.5 ) * 0.15 ) * ( 1.0 - smoothstep( 0.38, 0.62, wet ) );
	c = mix( c, redc, redW );
	// farm fields in rows: pineapple (red soil, grey-green plants) and cane (dense green)
	if ( field > 0.1 ) {
		float rows = smoothstep( 0.35, 0.5, abs( fract( dot( xz, vec2( 0.7071 ) ) / 1.6 ) - 0.5 ) );
		vec3 soil = texture2D( tFarm, xz / 3.0 ).rgb * vec3( 1.1, 0.75, 0.6 );
		vec3 crop = field < 0.5 ? vec3( 0.23, 0.3, 0.2 ) * ( 0.8 + n2 * 0.4 ) : vec3( 0.2, 0.33, 0.08 ) * ( 0.8 + n2 * 0.4 );
		c = mix( c, mix( soil, crop, field < 0.5 ? rows : 0.85 + rows * 0.15 ), smoothstep( 0.1, 0.4, field ) );
	}
	// lava fields: black, glassy in places
	vec3 lv = texture2D( tLava, xz / 5.0 ).rgb * vec3( 0.55, 0.52, 0.5 );
	float lavaW = smoothstep( 0.25, 0.55, lava + ( n1 - 0.5 ) * 0.35 + ( n4 - 0.5 ) * 0.2 );
	c = mix( c, lv, lavaW );
	// alpine desert on the high volcanoes: bare red-brown cinder and grey lava rock, nothing grows
	// above ~3,000 m (real) on Mauna Kea, Mauna Loa and Haleakalā
	float alpine = smoothstep( 430.0, 530.0, wp.y + ( n1 - 0.5 ) * 70.0 + ( macro - 0.5 ) * 40.0 );
	vec3 cinder = mix( redc * vec3( 0.62, 0.46, 0.4 ), lv * 1.35, smoothstep( 0.35, 0.65, n3 * 0.7 + n2 * 0.3 ) );
	c = mix( c, cinder, alpine );
	// rock where it is steep (triplanar on the side faces)
	vec3 an = abs( wN );
	vec3 tri = texture2D( tRock, wp.zy / 6.0 ).rgb * an.x + texture2D( tRock, wp.xy / 6.0 ).rgb * an.z + texture2D( tCliff, xz / 24.0 ).rgb * an.y;
	tri /= ( an.x + an.y + an.z );
	float rockW = smoothstep( 0.3, 0.52, slope + ( n2 - 0.5 ) * 0.18 + ( n3 - 0.5 ) * 0.12 );
	c = mix( c, tri * vec3( 0.95, 0.92, 0.88 ), rockW );
	// sand at the shore, wet and darker by the water line
	vec3 sand = texture2D( tSand, xz / 3.6 ).rgb;
	sand = mix( vec3( dot( sand, vec3( 0.3, 0.55, 0.15 ) ) ), sand, 0.55 ) * vec3( 1.62, 1.52, 1.34 );
	float beachTop = 2.0 + n3 * 1.6;
	float beach = ( 1.0 - smoothstep( beachTop - 0.9, beachTop, wp.y ) ) * smoothstep( 0.15, 0.6, shore + ( n2 - 0.5 ) * 0.3 ) * ( 1.0 - smoothstep( 0.2, 0.42, slope ) ) * ( 1.0 - city ) * ( 1.0 - lavaW * 0.7 );
	float wetSand = 1.0 - smoothstep( 0.05, 0.7, wp.y );
	sand = mix( sand, sand * vec3( 0.62, 0.6, 0.56 ), wetSand );
	c = mix( c, sand, beach );
	// seabed: pale sand in the shallows, darker rubble and reef deeper
	if ( wp.y < 0.0 ) {
		vec3 bed = mix( sand * vec3( 0.95, 1.0, 0.98 ), tri * vec3( 0.6, 0.62, 0.55 ), smoothstep( 0.45, 0.75, n1 * 0.7 + n2 * 0.3 ) );
		c = mix( c, bed, smoothstep( 0.0, -0.6, wp.y ) );
	}
	// snow on the summits of Mauna Kea and Mauna Loa
	vec3 snow = texture2D( tSnow, xz / 5.0 ).rgb;
	// only patches right at the top (Mauna Kea and Mauna Loa are mostly bare cinder), lingering in
	// hollows and on the shaded north faces
	float snowP = smoothstep( 0.52, 0.72, n1 * 0.5 + n3 * 0.3 + macro * 0.2 + max( -wN.z, 0.0 ) * 0.25 );
	c = mix( c, snow, smoothstep( 660.0, 700.0, wp.y + ( n1 - 0.5 ) * 40.0 ) * snowP * ( 1.0 - smoothstep( 0.3, 0.6, slope ) ) );
	// towns: mown lawns and concrete lots; road shoulders are gravel
	vec3 lawn = green * 1.05 * ( grassT / max( lg, 0.02 ) ) * ( 0.9 + n1 * 0.2 );
	c = mix( c, lawn, smoothstep( 0.2, 0.8, city ) * 0.9 * ( 1.0 - alpine ) );
	// summit sites (the observatories) sit on graded cinder
	c = mix( c, dirt * vec3( 0.62, 0.58, 0.56 ), smoothstep( 0.2, 0.8, city ) * alpine * 0.7 );
	c = mix( c, dirt * vec3( 0.85, 0.82, 0.8 ), road * 0.85 );
	// large scale variation breaks up the tiling
	c *= 0.84 + macro * 0.32;
	float tRough = 0.92 - 0.25 * wetSand * beach - 0.2 * lavaW * n4;
	diffuseColor = vec4( c, 1.0 );
`;

const TERRAIN_NORMAL = /* glsl */`
	{
		vec3 ng = texture2D( nGrass, xz / 3.2 ).xyz * 2.0 - 1.0;
		vec3 nr = texture2D( nRock, wp.zy / 6.0 ).xyz * 2.0 - 1.0;
		vec3 ns = texture2D( nSand, xz / 3.6 ).xyz * 2.0 - 1.0;
		vec3 nm = normalize( mix( mix( ng, nr, rockW ), ns, beach ) );
		float fade = 1.0 - smoothstep( 60.0, 220.0, dist );
		vec3 T = normalize( vec3( 1.0, 0.0, 0.0 ) - wN * wN.x );
		vec3 B = normalize( vec3( 0.0, 0.0, 1.0 ) - wN * wN.z );
		vec3 pn = normalize( T * nm.x * fade * 0.9 + B * -nm.y * fade * 0.9 + wN * nm.z );
		normal = normalize( ( viewMatrix * vec4( pn, 0.0 ) ).xyz );
	}
`;
