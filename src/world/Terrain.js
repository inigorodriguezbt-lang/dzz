// Streaming terrain: a quadtree over the whole chain; every node is a 32x32 grid built by the world
// workers from the baked heights. Near nodes are 64 m (2 m spacing); the whole archipelago stays
// visible to the horizon through the coarse levels. Deep ocean nodes are skipped (the sea covers them).
//
// The surface is Tidewater's procedural terrain material (ported from Tidewater src/world/Terrain.js
// TERRAIN_SURFACE, MIT, see LICENSE-Tidewater.txt): coral sand (dry / damp / wet, wind ripples, shell
// grit, wrack line, swash marks), the seabed (ripple fields, seagrass, rubble), tall-grass meadow,
// jungle floor and canopy, landslide scars, worn paths and weathered volcanic rock, all from one small
// tileable detail texture sampled at several scales, with surface-gradient bump normals. Our baked
// land cover (moisture, lava, red soil, fields, towns, roads, pasture, shore) feeds its weights; the
// per-vertex horizon AO (world worker) feeds dtAO; the heightfield hill shadow and the ground bounce
// are baked around the camera (terrain/HillShadow.js, terrain/GroundBounce.js).
import * as THREE from 'three';
import { G, patchMaterial, releaseArraysOnUpload } from '../render/Materials.js';
import { srgb, rot2, rot2js, TERRAIN_SHADING_GLSL } from './terrain/TerrainShading.js';
import { getDetailTexture, loadDetailTexture } from './terrain/DetailTextures.js';
import { HillShadow } from './terrain/HillShadow.js';
import { GroundBounce } from './terrain/GroundBounce.js';

const GRID = 32;
const LEAF = 64;
const ROOT = 131072;

// Our DEM beaches are compressed 1:6 vertically (Waikiki's berm is ~1.2 units): the beach / shore /
// seabed zonation (dry, damp, wrack, ripples, swash lines, splash zone) runs on h x BEACH_V so it lands
// where Tidewater's does on a real beach profile. The wet film from the sea stays in world units.
const BEACH_V = 1.8;
// the detail texture's uv is taken relative to an origin snapped to this grid (float precision)
const ORIGIN_SNAP = 2048;
// fixed swell direction for the seabed ripples (Tidewater WORLD.swellDir)
const SWELL = new THREE.Vector2( - 0.12, - 1 ).normalize();

// uv frames of the detail samples: rotation (rad), tile (m), taken as fract( R( origin.xz ) / tile )
const FRAMES = [
	[ 0.7, 173 ], [ 2.1, 47 ], [ 0, 1.9 ], [ 1.3, 6.7 ], [ 2.4, 0.63 ], [ 0.9, 61 ], [ 2.3, 13 ], [ 0.4, 0.9 ],
	// (ours) second tiles of the macro / crown variation, incommensurate with the first (see below)
	[ 2.9, 131 ], [ 0.15, 59 ], [ 1.65, 83 ],
];
// axis-aligned tiles (x and z offsets): rock triplanar 27 / 6.1 / 1.3 m, rock stains 3.1 m, streaks 9.3 m
const AXIS = [ 27, 6.1, 1.3, 3.1, 9.3 ];
// the macro variation (meadow tone, patches), for the vegetation's grass to match: each of A and B is
// clamp( ( d( R( xz, a0 ) / s0 ).w + d( R( xz, a1 ) / s1 + o1 ).w - 1 ) * 0.7071 + 0.5, 0, 1 ) of the
// detail texture d, [ a, s, o ] below (FRAMES 0 / 8 and 1 / 9); the meadow shifts both by ( 0.42 - wetM ) * 0.5
export const TerrainMacro = { A: [ [ 0.7, 173, 0 ], [ 2.9, 131, 0.61 ] ], B: [ [ 2.1, 47, 0 ], [ 0.15, 59, 0.29 ] ], dryShift: 0.5 };
const OFS_N = FRAMES.length + AXIS.length + 4; // + blades, comb, gust x2

// the terrain's travelling gust field offset (vegetation can share it: TerrainGust.offset)
export const TerrainGust = { offset: new THREE.Vector2(), speed: 7 };
// geometric grass field on top of the ground (vegetation sets it): x fade start, y fade end (m),
// z strength of the shaded sward base the ground shows inside it (0 until the dense sward is drawn)
export const TerrainGrass = { fade: { value: new THREE.Vector3( 62, 87, 0 ) } };

class Node {
	constructor( x0, z0, size, level, parent ) {
		this.x0 = x0; this.z0 = z0; this.size = size; this.level = level; this.parent = parent;
		this.children = null;
		this.mesh = null;
		this.state = 0; // 0 none, 1 requested, 2 ready, 3 empty (deep sea / outside)
		this.job = null;
		this.lastUsed = 0; this.lastT = 0;
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
		// weather wind (m/s at 10 m): the grass sheen and gusts (World / Weather may set it)
		this.windSpeed = 7;
		this._lastTime = null;
		loadDetailTexture( pool );
		this.material = makeTerrainMaterial( settings.get( 'terrainDetail' ) );
		TerrainMorph.material = this.material;
		settings.on && settings.on( 'terrainDetail', ( v ) => {
			const low = v === 'low';
			if ( !! this.material.defines.TERRAIN_LOW !== low ) {
				if ( low ) this.material.defines.TERRAIN_LOW = 1; else delete this.material.defines.TERRAIN_LOW;
				this.material.needsUpdate = true;
			}
		} );
		// shadow pass: fold the skirts back up to the edge so they never cast slivers of shadow
		this.depthMaterial = new THREE.MeshDepthMaterial( { depthPacking: THREE.RGBADepthPacking } );
		this.depthMaterial.onBeforeCompile = ( sh ) => {
			sh.vertexShader = sh.vertexShader.replace( '#include <common>', '#include <common>\nattribute float skirt;' )
				.replace( '#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += skirt;' );
		};
		this.depthMaterial.customProgramCacheKey = () => 'terrain-depth';
		this._v = new THREE.Vector3();
		this.drawn = [];
		// camera-centred bakes (need the WebGL renderer: captured from the first terrain draw)
		this.gl = null;
		this.hillShadow = new HillShadow( hf, pool );
		this.bounce = new GroundBounce( hf, pool, this.hillShadow );
		TerrainMorph.terrain = this;
	}

	// how many nodes the current view still waits for (loading screen)
	get pending() { return this.pendingCount; }

	update( camPos, frustum ) {
		this.frame ++;
		const K = { low: 1.6, medium: 2.0, high: 2.5, ultra: 3.2 }[ this.settings.get( 'terrainDetail' ) ] || 2.0;
		TerrainMorph.K.value = K;
		for ( const m of this.drawn ) m.visible = false;
		this.drawn.length = 0;
		this.now = performance.now();
		this._select( this.root, camPos, K, frustum );
		// evict meshes unused for a while (frames, or seconds when the frame rate is low: at a few frames a second
		// every node ever loaded stayed in memory)
		if ( this.frame % 60 === 0 || this.now - ( this._evictT ?? 0 ) > 3000 ) { this._evictT = this.now; this._evict( this.root ); }
		this._updateFrames( camPos );
		if ( this.gl ) {
			this.hillShadow.update( this.gl, camPos );
			this.bounce.update( this.gl, camPos );
		}
	}

	// the snapped origin of the material's detail uvs, their fractional offsets (double precision on the
	// CPU) and the gust field
	_updateFrames( camPos ) {
		const U = this.material.userData.U;
		const t = G.uTime.value;
		const dt = this._lastTime === null ? 0 : Math.min( 0.25, Math.max( 0, t - this._lastTime ) );
		this._lastTime = t;
		const wd = G.uWind.value, wl = Math.hypot( wd.x, wd.y ) || 1;
		const wx = wd.x / wl, wz = wd.y / wl;
		TerrainGust.speed = 0.7 * this.windSpeed + 1.5;
		TerrainGust.offset.x += wx * TerrainGust.speed * dt;
		TerrainGust.offset.y += wz * TerrainGust.speed * dt;
		const ox = Math.round( camPos.x / ORIGIN_SNAP ) * ORIGIN_SNAP, oz = Math.round( camPos.z / ORIGIN_SNAP ) * ORIGIN_SNAP;
		U.uTerOrigin.value.set( ox, 0, oz );
		const fr = ( v ) => v - Math.floor( v );
		const O = U.uTerOff.value;
		let k = 0;
		for ( const [ a, s ] of FRAMES ) { const [ rx, rz ] = rot2js( ox, oz, a ); O[ k ++ ].set( fr( rx / s ), fr( rz / s ) ); }
		for ( const s of AXIS ) O[ k ++ ].set( fr( ox / s ), fr( oz / s ) );
		// seagrass blades along / across the swell, grass combed along the wind
		O[ k ++ ].set( fr( ( ox * SWELL.x + oz * SWELL.y ) / 2.6 ), fr( ( - ox * SWELL.y + oz * SWELL.x ) / 0.35 ) );
		O[ k ++ ].set( fr( ( ox * wx + oz * wz ) / 7.5 ), fr( ( - ox * wz + oz * wx ) / 0.9 ) );
		// travelling gusts: ( xz - offset ) / 140 and / 61
		const gx = ox - TerrainGust.offset.x, gz = oz - TerrainGust.offset.y;
		O[ k ++ ].set( fr( gx / 140 ), fr( gz / 140 ) );
		O[ k ++ ].set( fr( gx / 61 ), fr( gz / 61 ) );
		// ripple phase offsets (mod 2 pi): wind ripples 0.105 m, megaripples 0.75 m, wave ripples 0.16 m
		const TAU = Math.PI * 2, md = ( v ) => v - Math.floor( v / TAU ) * TAU;
		const dw = ox * wx + oz * wz, ds = ox * SWELL.x + oz * SWELL.y;
		U.uTerPh.value.set( md( dw * TAU / 0.105 ), md( ds * TAU / 0.75 ), md( ds * TAU / 0.16 ) );
		U.uTerWind.value.set( wx, wz, Math.max( this.windSpeed * 0.1, 0.03 ), 0 );
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
		// (wanted now: a node still loading must not look idle to _evict)
		n.lastUsed = this.frame; n.lastT = this.now;
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
		// baked horizon AO x cavity in the normal's spare byte (0..127)
		g.setAttribute( 'ao', new THREE.InterleavedBufferAttribute( ib, 1, 3, true ) );
		g.setAttribute( 'surf', new THREE.BufferAttribute( r.surf, 4, true ) );
		g.setAttribute( 'tmask', new THREE.BufferAttribute( r.mask, 4, true ) );
		g.setAttribute( 'skirt', new THREE.BufferAttribute( r.skirt, 1 ) );
		g.setAttribute( 'parentY', new THREE.BufferAttribute( r.parentY, 1 ) );

		// (the node's own arrays are dead weight once on the GPU: bounds are set here and nothing reads them back;
		// the shared index stays)
		releaseArraysOnUpload( g );
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
		n.lastT = this.now;
		if ( this._wantSplit( n, p, K ) ) {
			if ( ! n.children ) {
				const h = n.size / 2;
				n.children = [
					new Node( n.x0, n.z0, h, n.level + 1, n ), new Node( n.x0 + h, n.z0, h, n.level + 1, n ),
					new Node( n.x0, n.z0 + h, h, n.level + 1, n ), new Node( n.x0 + h, n.z0 + h, h, n.level + 1, n ),
				];
			}
			let all = true;
			for ( const c of n.children ) { c.lastUsed = this.frame; c.lastT = this.now; if ( ! this._ready( c ) ) { this._request( c, p ); all = false; } }
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
		const idle = this.frame - n.lastUsed;
		if ( n.level > 2 && ( idle > 240 || ( idle > 20 && this.now - n.lastT > 10000 ) ) ) {
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
	terrain: null,
	before( renderer, scene, camera, geometry, material ) {
		// the bakes render from Terrain.update (before the frame), with the renderer seen here
		if ( TerrainMorph.terrain && ! TerrainMorph.terrain.gl ) TerrainMorph.terrain.gl = renderer;
		if ( material !== TerrainMorph.material ) return;
		TerrainMorph.size.value = this.userData.lodSize;
		material.uniformsNeedUpdate = true;
	},
};

export function makeTerrainMaterial( detail = 'high' ) {
	const m = new THREE.MeshStandardMaterial( { roughness: 0.9, metalness: 0, color: 0xffffff } );
	const U = {
		terrainDetailTex: { value: getDetailTexture() },
		uTerOrigin: { value: new THREE.Vector3() },
		uTerOff: { value: Array.from( { length: OFS_N }, () => new THREE.Vector2() ) },
		uTerPh: { value: new THREE.Vector3() },
		uTerWind: { value: new THREE.Vector4( - 0.88, 0.47, 0.7, 0 ) },
		uTerGrass: TerrainGrass.fade,
	};
	m.userData.U = U;
	if ( detail === 'low' ) m.defines.TERRAIN_LOW = 1; // (keeps three's STANDARD define)
	patchMaterial( m, 'terrain', ( shader ) => {
		Object.assign( shader.uniforms, U );
		shader.uniforms.uLodK = TerrainMorph.K;
		shader.uniforms.uLodSize = TerrainMorph.size;
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', /* glsl */`#include <common>
				attribute vec4 surf; attribute vec4 tmask; attribute float parentY; attribute float ao;
				uniform float uLodK; uniform float uLodSize; uniform vec3 uTerOrigin;
				varying vec4 vSurf; varying vec4 vMask; varying vec3 vRel; varying float vAO;` )
			.replace( '#include <begin_vertex>', /* glsl */`#include <begin_vertex>
				vSurf = surf; vMask = tmask;
				{
					vec3 wpm = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
					float dm = distance( wpm, cameraPosition );
					float km = smoothstep( uLodSize * uLodK * 1.55, uLodSize * uLodK * 1.95, dm );
					transformed.y = mix( position.y, parentY, km );
					// nodes coarser than 16 m carry no AO: fade it out before that LOD
					vAO = mix( ao, 1.0, smoothstep( uLodK * 1024.0 * 0.6, uLodK * 1024.0 * 0.95, dm ) );
				}
				// position relative to the snapped origin: node origins and the origin are whole metres, so the
				// difference is exact and the detail uvs keep their precision anywhere in the +-38 km world
				vRel = vec3( modelMatrix[ 3 ].x - uTerOrigin.x, 0.0, modelMatrix[ 3 ].z - uTerOrigin.z ) + transformed;` );
		let fs = shader.fragmentShader;
		// (patchMaterial declares dtAO / dtSunMod in main(); keep compiling without that hook)
		const hooks = fs.includes( 'float dtAO' ) ? '' : 'float dtAO = 1.0; float dtSunMod = 1.0;';
		fs = fs
			.replace( '#include <common>', /* glsl */`#include <common>
				varying vec4 vSurf; varying vec4 vMask; varying vec3 vRel; varying float vAO;
				uniform sampler2D terrainDetailTex; uniform vec3 uTerOrigin; uniform vec2 uTerOff[ ${ OFS_N } ];
				uniform vec3 uTerPh; uniform vec4 uTerWind; uniform vec3 uTerGrass;
				// (ours) forest floor under the vegetation's canopy: the sky it still sees, and the sunlight the
				// leaves pass on (fraction of the key light, green)
				#define TER_CANOPY_SKY 0.3
				#define TER_CANOPY_T vec3( 0.03, 0.05, 0.012 )
				${ TERRAIN_SHADING_GLSL }
				${ TERRAIN_FNS }` )
			.replace( '#include <map_fragment>', hooks + TERRAIN_ALBEDO )
			.replace( '#include <normal_fragment_maps>', TERRAIN_NORMAL )
			.replace( '#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;' );
		shader.fragmentShader = fs;
	} );
	// the low-detail variant compiles separately
	const key = m.customProgramCacheKey;
	m.customProgramCacheKey = () => key() + ( m.defines && m.defines.TERRAIN_LOW ? '-low' : '' );
	return m;
}

const S = srgb;
// a detail sample in one of the FRAMES: uTerOff[ k ] + R( xz ) / tile
const fr = ( k, extra = '' ) => {
	const [ a, s ] = FRAMES[ k ];
	return `terDetail( uTerOff[ ${ k } ] + ${ a ? rot2( 'xz', a ) : 'xz' } / ${ s.toFixed( 3 ) }${ extra } )`;
};
const AX = ( i ) => `uTerOff[ ${ FRAMES.length + i } ]`;
const O_BLADES = FRAMES.length + AXIS.length, O_COMB = O_BLADES + 1, O_GUST = O_BLADES + 2;

const TERRAIN_FNS = /* glsl */`
vec4 terDetail( vec2 uv ) { return texture( terrainDetailTex, uv ); }
// Travelling gust field in [0, 1] (Tidewater terGustAt): noise of ( worldXZ - windDir * t * speed ), two
// fetches of the detail texture's fbm channel (~35 m and ~15 m gust cells). Tidewater reads mip 0 (the
// function is shared with vertex stages); across our kilometres of meadow that aliases into moire bands,
// so the terrain passes its xz derivatives (gx, gy) and samples the same field filtered.
float terGustAt( vec2 xz, vec2 gx, vec2 gy ) {
	float n = textureGrad( terrainDetailTex, uTerOff[ ${ O_GUST } ] + xz / 140.0, gx / 140.0, gy / 140.0 ).w * 0.62
		+ textureGrad( terrainDetailTex, uTerOff[ ${ O_GUST + 1 } ] + xz / 61.0 + 0.37, gx / 61.0, gy / 61.0 ).w * 0.38;
	return smoothstep( 0.46, 0.6, n );
}
`;

// Tidewater TERRAIN_SURFACE (src/world/Terrain.js 169-640), in our map_fragment
const TERRAIN_ALBEDO = /* glsl */`
	vec3 p = vRel;
	vec2 xz = p.xz;
	float h = p.y;
	// beach / shore / seabed zonation height (see BEACH_V)
	float hb = h * ${ BEACH_V.toFixed( 3 ) };
	float outRough = 0.9;
	float outAO = 1.0;
	vec3 albedoOut = vec3( 0.0 );
	float hdOut = 0.0;
	float meadowW = 0.0;
	float underCanopy = 0.0;

	// ---- data: geometric normal and our land cover (per vertex)
	vec3 N0 = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz );
	float slope = 1.0 - N0.y;
	float camDist = length( vWorldPos - uCamPos );
	vec3 dpx = dFdx( p ); vec3 dpy = dFdy( p );
	float fwY = fwidth( h );
	float moist = vSurf.r, lavaV = vSurf.g, redV = vSurf.b, fieldV = vSurf.a;
	float cityV = vMask.r, roadV = vMask.g, pastureV = vMask.b, shoreV = vMask.a;
	float aoV = clamp( vAO, 0.0, 1.0 );

	// ---- detail samples shared by both paths (uniform control flow: no derivative seams)
	// Tidewater's macro variation is one tile each (173 m, 47 m): fine on its 2 km island, but across our
	// kilometres of meadow and forest seen from the hills the repeats line up into a lattice. Each is
	// summed with a second, incommensurate rotated tile (quasi-periodic, same mean and variance).
	float macroA = clamp( ( ${ fr( 0 ) }.w + ${ fr( 8, ' + 0.61' ) }.w - 1.0 ) * 0.7071 + 0.5, 0.0, 1.0 );
	float macroB = clamp( ( ${ fr( 1 ) }.w + ${ fr( 9, ' + 0.29' ) }.w - 1.0 ) * 0.7071 + 0.5, 0.0, 1.0 );
	float mcr = macroA * 0.6 + macroB * 0.4;
	vec4 dN = ${ fr( 2 ) };
	vec4 dM = ${ fr( 3, ' + 0.21' ) };
	vec4 dF = ${ fr( 4, ' + 0.53' ) };
	float grain = min( dN.z, 0.62 );
	float grainF = min( dF.z, 0.62 );

	// ---- Tidewater's splat / rock masks from our maps
	// loose sand: near the sea, low, gentle, outside towns and young lava
	float lavaW = smoothstep( 0.35, 0.6, lavaV + ( dM.w - 0.5 ) * 0.35 + ( macroB - 0.5 ) * 0.3 );
	float beachTop = 2.0 + macroB * 1.6;
	float spSand = ( 1.0 - smoothstep( beachTop - 0.9, beachTop, h ) ) * smoothstep( 0.15, 0.6, shoreV )
		* ( 1.0 - smoothstep( 0.2, 0.42, slope ) ) * ( 1.0 - cityV ) * ( 1.0 - lavaW * 0.7 );
	// worn ground: roads and tracks (their shoulders), trodden patches in town
	float spPath = max( roadV, cityV * 0.3 );
	// gullies and hollows: the low horizon AO of the drainage lines (valley floors and ravines, not the
	// walls above them, which are just as occluded)
	float spGully = smoothstep( 0.8, 0.55, aoV ) * ( 1.0 - smoothstep( 0.35, 0.6, slope ) );
	// rock outcrops: steep coast (the headlands)
	float rockMask = shoreV * smoothstep( 0.12, 0.3, slope ) * ( 1.0 - lavaW );
	// seabed: rubble / reef heads on the steeper or rougher bottom, sparse seagrass in sheltered sand
	float spRubble = clamp( smoothstep( 0.52, 0.7, mcr ) * 0.6 + smoothstep( 0.08, 0.25, slope ) * 0.8, 0.0, 1.0 );
	float spSeagrass = smoothstep( 0.55, 0.72, macroB + ( macroA - 0.5 ) * 0.5 ) * 0.8;
	float fieldW = smoothstep( 0.1, 0.4, fieldV );
	float cityW = smoothstep( 0.2, 0.8, cityV );

	vec2 swDir = vec2( ${ SWELL.x.toFixed( 6 ) }, ${ SWELL.y.toFixed( 6 ) } );
	// ripple phases of both paths (identical there), differentiated in uniform control flow
	float ph2 = uTerPh.y + dot( xz, swDir ) * ( 6.2832 / 0.75 ) + dM.w * 16.0 + macroB * 24.0;
	float fade2 = 1.0 - smoothstep( 0.5, 2.0, fwidth( ph2 ) );
	float rip2 = pow( sin( ph2 ) * 0.5 + 0.5, 1.4 );
	float ph3 = uTerPh.z + dot( xz, swDir ) * ( 6.2832 / 0.16 ) + dM.w * 26.0 + dN.w * 5.0;
	float fade3 = 1.0 - smoothstep( 0.6, 2.2, fwidth( ph3 ) );
	float rip3 = pow( sin( ph3 ) * 0.5 + 0.5, 1.5 );
	vec2 wd = uTerWind.xy;
	float ph1 = uTerPh.x + dot( xz, wd ) * ( 6.2832 / 0.105 ) + dM.w * 24.0 + dN.w * 7.0 + macroB * 30.0;
	float fade1 = 1.0 - smoothstep( 0.6, 2.2, fwidth( ph1 ) );
	float rip1 = pow( sin( ph1 ) * 0.5 + 0.5, 1.6 );
	// swash marks (thin lines at the limits of earlier uprushes), differentiated here too
	float sl = ( hb + dM.w * 0.18 + dN.w * 0.05 ) / 0.13;
	float slW = fwidth( sl ) + 1e-4;

	// ---- deep seabed (seen through the water: no rock, land cover or swash): the same colour / relief
	// / AO as the full path below from the 5 shared samples
	bool seabedPath = hb < -0.8 && rockMask < 0.05 && slope < 0.18;
	if ( seabedPath ) {
		float underW = 1.0;
		float sandW = smoothstep( 0.3, 0.72, spSand + ( dM.z - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.35 );
		float depth = -hb;
		vec3 under = mix( ${ S( 0.84, 0.78, 0.64 ) }, ${ S( 0.72, 0.7, 0.58 ) }, smoothstep( 1.0, 9.0, depth ) );
		under = under * ( ( dM.w - 0.5 ) * 0.14 + 1.0 ) * ( ( grain - 0.45 ) * 0.25 + 1.0 );
		// megaripple fields (~0.75 m) across the swell, troughs collect darker shell hash; not in the swash
		// zone or the first metre of depth
		float fieldW2 = smoothstep( 0.42, 0.62, macroB + ( dM.w - 0.5 ) * 0.35 ) * smoothstep( 0.9, 2.0, depth );
		under = under * ( ( rip2 - 0.55 ) * 0.22 * fieldW2 * fade2 + 1.0 );
		// seagrass meadows: ragged edges, blade streaks leaning with the wave surge, epiphyte tips (the
		// fringe breaks up into clumps: noise at three scales thresholds the soft mask edge)
		float clumps = ( dM.w - 0.5 ) * 0.5 + ( dN.y - 0.45 ) * 0.4 + ( macroB - 0.5 ) * 0.3;
		float seagrassW = smoothstep( 0.3, 0.55, spSeagrass + clumps ) * underW * smoothstep( 0.3, 0.9, depth );
		vec2 swPerp = vec2( -swDir.y, swDir.x );
		float blades = terDetail( uTerOff[ ${ O_BLADES } ] + vec2( dot( xz, swDir ) / 2.6, dot( xz, swPerp ) / 0.35 ) ).y;
		vec3 meadow = mix( ${ S( 0.12, 0.16, 0.07 ) }, ${ S( 0.27, 0.29, 0.15 ) }, smoothstep( 0.35, 0.75, blades ) );
		meadow = mix( meadow, ${ S( 0.24, 0.2, 0.11 ) }, smoothstep( 0.55, 0.8, dM.y + ( macroB - 0.5 ) * 0.4 ) * 0.5 );
		meadow = mix( under, meadow, smoothstep( 0.3, 0.85, spSeagrass + clumps * 0.5 ) * 0.35 + 0.65 );
		meadow = mix( meadow, mix( meadow, under, 0.45 ), smoothstep( 0.58, 0.8, macroB + ( dM.w - 0.5 ) * 0.4 ) );
		under = mix( under, meadow, seagrassW );
		// rubble heads: coral rubble and rock turfed with algae, pink coralline crusts
		float rubbleW = smoothstep( 0.3, 0.6, spRubble + ( dN.x - 0.5 ) * 0.4 + ( dM.w - 0.5 ) * 0.3 ) * underW;
		vec3 rubble = mix( ${ S( 0.2, 0.19, 0.15 ) }, ${ S( 0.36, 0.33, 0.26 ) }, smoothstep( 0.3, 0.7, dN.x ) );
		rubble = mix( rubble, ${ S( 0.2, 0.24, 0.1 ) }, smoothstep( 0.5, 0.7, dF.y ) * 0.6 );
		rubble = mix( rubble, ${ S( 0.58, 0.38, 0.44 ) }, smoothstep( 0.62, 0.74, dM.x ) * 0.6 );
		under = mix( under, rubble, rubbleW );
		// damp sand below the berm (wet = 0 under water)
		float dampMottle = smoothstep( 0.3, 0.7, dM.w + ( dN.y - 0.45 ) * 0.6 + ( macroB - 0.5 ) * 0.4 );
		float wetK = smoothstep( 1.7, 0.5, hb + dM.w * 0.3 ) * sandW * mix( 0.22, 0.5, dampMottle );
		vec3 wetAlbedo = terrainSaturation( under * 0.58, 1.15 ) * vec3( 0.97, 0.98, 1.0 );
		albedoOut = mix( under, wetAlbedo, wetK );
		outRough = 0.75;
		float waveR = rip3 * 0.012 * fade3 * smoothstep( -0.3, -0.9, hb ) * ( 1.0 - seagrassW );
		float megaR = rip2 * 0.035 * fade2 * fieldW2 * ( 1.0 - seagrassW );
		float sandH = grain * 0.004 + grainF * 0.003 + waveR + megaR;
		float seabedH = seagrassW * ( blades * 0.05 + 0.08 ) + rubbleW * ( dN.x * 0.07 + dF.x * 0.015 );
		hdOut = sandH + seabedH;
		outAO = aoV * ( 1.0 - seagrassW * 0.3 ) * ( 1.0 - rubbleW * smoothstep( 0.55, 0.2, dN.x ) * 0.35 );
		meadowW = 0.0;
	} else {
		// ---- downslope streaks (rock flutes, hanging vegetation, landslide scars): the detail texture
		// stretched vertically on the two vertical projection planes (explicit gradients in the branch)
		vec2 sw4 = pow( abs( N0.xz ), vec2( 4.0 ) );
		vec2 swN = sw4 / ( sw4.x + sw4.y + 1e-5 );
		float streak = 0.5; float scar = 0.5;
		#ifndef TERRAIN_LOW
		if ( slope > 0.28 ) {
			vec2 o9 = ${ AX( 4 ) };
			vec4 stA = textureGrad( terrainDetailTex, vec2( o9.y + p.z / 9.3, h / 37.0 ), vec2( dpx.z / 9.3, dpx.y / 37.0 ), vec2( dpy.z / 9.3, dpy.y / 37.0 ) );
			vec4 stB = textureGrad( terrainDetailTex, vec2( o9.x + p.x / 9.3 + 0.5, h / 37.0 + 0.3 ), vec2( dpx.x / 9.3, dpx.y / 37.0 ), vec2( dpy.x / 9.3, dpy.y / 37.0 ) );
			streak = stA.w * swN.x + stB.w * swN.y;
			scar = stA.y * swN.x + stB.y * swN.y;
		}
		#endif

		// ---- rock: only evaluated where the rock mask, the slope or the lava allow it. Exposure follows the
		// form: steep faces and convex spurs go bare, gully floors keep soil and plants; noise and fall-line
		// streaks break the outline up. Around the bare rock a band of scree / dark soil and moss.
		float gully = spGully * smoothstep( -0.5, 0.5, h );
		vec3 rockAlbedo = vec3( 0.2 ); float rockRough = 0.8; float rockHd = 0.0;
		float rockW = 0.0; float screeW = 0.0;
		vec3 lavaAlbedo = vec3( 0.03 ); float lavaRough = 0.6; float lavaHd = 0.0;
		float cliffK = smoothstep( 0.28, 0.55, slope );
		float convex = smoothstep( 0.5, 0.85, aoV );
		float rvBound = rockMask * 0.7 + smoothstep( 0.3, 0.62, slope ) * 0.5 + convex * 0.14 - gully * 0.4
			+ ( dM.w - 0.5 ) * 0.34 + ( dN.w - 0.5 ) * 0.22 + ( streak - 0.5 ) * 1.0 * cliffK + 0.2;
		if ( ( ( rockMask > 0.06 || slope > 0.3 ) && rvBound > 0.28 ) || lavaW > 0.0 ) {
			#ifdef TERRAIN_LOW
			// cheap rock: the plates of the shared samples, no triplanar
			float hr = dM.x * 0.45 + dN.x * 0.35 + dF.x * 0.2;
			float tone = hr * 0.9 + ( mcr - 0.5 ) * 0.7;
			vec3 rc = mix( PAL_rockDark, PAL_rockMid, smoothstep( 0.1, 0.5, tone ) );
			rc = mix( rc, PAL_rockLight, smoothstep( 0.5, 0.85, tone ) );
			RockSurface R;
			R.albedo = rc * ( smoothstep( 0.05, 0.25, dM.x ) * 0.35 + 0.65 );
			R.rough = mix( 0.88, 0.8, 1.0 - smoothstep( 0.55, 0.85, N0.y ) );
			R.hd = dM.x * 0.07 + dN.x * 0.012;
			R.moss = 0.0; R.wet = 0.0; R.height = hr;
			#else
			RockGrad g;
			g.dpx = dpx; g.dpy = dpy; g.fwY = fwY; g.useGrad = true;
			g.o27 = ${ AX( 0 ) }; g.o6 = ${ AX( 1 ) }; g.o1 = ${ AX( 2 ) }; g.o3 = ${ AX( 3 ) };
			RockSurface R = terrainRockSurface( p, N0, hb, mcr, 0.5, 1.0, g );
			#endif
			float rv = rockMask * 0.7 + smoothstep( 0.3, 0.62, slope ) * 0.5 + convex * 0.14 - gully * 0.4
				+ ( R.height - 0.45 ) * 0.35 + ( dM.w - 0.5 ) * 0.34 + ( dN.w - 0.5 ) * 0.22
				+ ( streak - 0.5 ) * 1.0 * cliffK;
			// fades to 0 at the branch boundary: no step along the slope / mask iso-lines
			float branchK = max( smoothstep( 0.06, 0.18, rockMask ), smoothstep( 0.3, 0.42, slope ) );
			rockW = smoothstep( 0.5, 0.68, rv ) * branchK * ( 1.0 - lavaW );
			screeW = smoothstep( 0.28, 0.52, rv ) * branchK * ( 1.0 - rockW ) * ( 1.0 - lavaW );
			// dark wet stains down the fall line, paler dry ribs between them
			float stain = smoothstep( 0.5, 0.7, streak ) * cliffK;
			// dark, weathered basalt (the inland rock is darker and browner than the pale sea-cliff palette),
			// stained down the fall line; the coast keeps the full palette
			vec3 basalt = R.albedo * mix( vec3( 0.36, 0.34, 0.31 ), vec3( 1.0 ), rockMask ) * ( 1.0 - stain * 0.45 ) * ( smoothstep( 0.42, 0.25, streak ) * cliffK * 0.15 + 1.0 );
			// soil and humus caught in the joints and hollows of the rock (low relief)
			float joints = smoothstep( 0.42, 0.22, R.height + ( dN.w - 0.5 ) * 0.25 );
			basalt = mix( basalt, mix( ${ S( 0.13, 0.1, 0.07 ) }, ${ S( 0.2, 0.2, 0.1 ) }, dF.y ), joints * 0.7 );
			// moss / small plants on every ledge and on the less steep parts, more near the edges
			float ledgeMoss = smoothstep( 0.4, 0.75, N0.y + ( dN.y - 0.45 ) * 0.6 ) * smoothstep( 0.25, 0.55, macroB + dM.y * 0.4 );
			float fringe = smoothstep( 0.5, 0.58, rv ) * smoothstep( 0.8, 0.6, rv ) * smoothstep( 0.3, 0.6, dM.w + dN.y * 0.4 );
			float mossK = clamp( max( ledgeMoss * 0.75, fringe * 0.8 ) + R.moss * 0.3 + joints * 0.25, 0.0, 1.0 );
			rockAlbedo = mix( basalt, mix( ${ S( 0.12, 0.17, 0.05 ) }, ${ S( 0.22, 0.26, 0.09 ) }, dF.y ), mossK );
			rockRough = R.rough;
			// craggier than the boulders: the big blocks and plates stand out from afar
			rockHd = R.hd * 2.2 + R.height * 0.6;
			// lava flows: the same rock surface, black basalt (albedo ~0.02-0.04), glassy pahoehoe skins in
			// patches, ferns and lichen only where it rains
			// (lobes of older, paler flows)
			vec3 lv = R.albedo * vec3( 0.2, 0.19, 0.18 ) * ( ( dM.x - 0.5 ) * 0.3 + 1.0 ) * ( ( macroA - 0.5 ) * 0.6 + 1.0 );
			float glassy = smoothstep( 0.45, 0.7, dM.w + ( dN.x - 0.5 ) * 0.4 ) * smoothstep( 0.65, 0.95, lavaV );
			lavaAlbedo = mix( lv, rockAlbedo, mossK * smoothstep( 0.45, 0.8, moist ) * 0.8 );
			lavaRough = mix( 0.82, 0.32, glassy );
			lavaHd = R.hd * 1.6 + R.height * 0.3;
		}

		// ---- weights
		float notRock = 1.0 - max( rockW, lavaW );
		float underW = smoothstep( 0.12, -0.6, hb );
		float landW = 1.0 - underW;
		float sandW = smoothstep( 0.3, 0.72, spSand + ( dM.z - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.35 ) * notRock;
		float pathW = smoothstep( 0.28, 0.62, spPath + ( dN.y - 0.45 ) * 0.4 + ( dM.w - 0.5 ) * 0.25 ) * notRock * landW
			* ( 1.0 - smoothstep( 50.0, 220.0, camDist ) * 0.85 );
		// forest where it rains (the vegetation's canopy: ohia / kukui above ~0.5 moisture, thinning out
		// toward the tree line), on the wetter steep slopes and in the gullies; not on ranch pasture, fields,
		// towns or young lava
		float treeAlt = ( 1.0 - smoothstep( 290.0, 400.0, h ) * 0.75 ) * ( 1.0 - smoothstep( 450.0, 525.0, h ) );
		float wetM = clamp( moist * 1.15 + 0.14, 0.0, 1.0 );
		float jungleW = clamp( smoothstep( 0.52, 0.8, wetM + ( mcr - 0.5 ) * 0.3 ) + smoothstep( 0.18, 0.36, slope ) * smoothstep( 0.3, 0.55, wetM )
			+ gully * 0.6 * smoothstep( 0.2, 0.45, wetM ), 0.0, 1.0 ) * treeAlt * smoothstep( 1.5, 5.0, h )
			* ( 1.0 - pastureV * 0.85 ) * ( 1.0 - fieldW ) * ( 1.0 - cityW ) * ( 1.0 - lavaW );
		// landslide scars: raw red-brown laterite in streaks down steep slopes, rare; our red-dirt country
		// where it is dry enough to show
		// (dry grass covers most of it: the red soil shows on the steeper, eroded ground and in patches)
		float redW = smoothstep( 0.42, 0.78, redV + ( macroA - 0.5 ) * 0.45 + ( dM.w - 0.5 ) * 0.15 ) * ( 1.0 - smoothstep( 0.38, 0.62, wetM ) )
			* mix( 0.3, 1.0, smoothstep( 0.4, 0.7, macroB * 0.6 + dM.w * 0.25 + slope * 1.2 ) )
			// (towns are planted: whole hillsides of bare red dirt read as unfinished there)
			* ( 1.0 - cityW * 0.8 );
		float lateriteW = max( smoothstep( 0.62, 0.74, scar + ( macroB - 0.5 ) * 0.3 ) * smoothstep( 0.3, 0.42, slope )
			* smoothstep( 0.52, 0.66, mcr ) * 0.85, redW ) * notRock;

		// ---- beach sand: pale coral sand, drifts of warmer / coarser sand, grain
		float dryK = smoothstep( 0.8, 3.0, hb );
		// a touch warmer and darker than the first port: under a high noon sun it read near-white next to Tidewater's
		vec3 sand = mix( ${ S( 0.79, 0.69, 0.52 ) }, ${ S( 0.86, 0.77, 0.62 ) }, smoothstep( 0.3, 0.72, mcr + dryK * 0.2 ) );
		sand = mix( sand, ${ S( 0.8, 0.66, 0.47 ) }, smoothstep( 0.55, 0.8, dM.w + ( macroB - 0.5 ) * 0.6 ) * 0.45 );
		sand = sand * ( ( dM.w - 0.5 ) * 0.16 + 1.0 ) * ( ( dN.w - 0.5 ) * 0.1 + 1.0 );
		sand = sand * ( ( grain - 0.45 ) * 0.3 + 0.97 ) * ( ( grainF - 0.45 ) * 0.2 + 1.0 );
		// disturbed / trodden patches: slightly darker, coarser sand (footfall, crabs, wind scour)
		float trod = smoothstep( 0.52, 0.7, dN.y + ( dM.y - 0.5 ) * 0.6 ) * dryK;
		sand = sand * ( 1.0 - trod * 0.07 );
		// the high-water band collects shell grit, coral bits and dried seaweed
		float hw = hb + ( dM.w - 0.5 ) * 0.5;
		float wrackBand = smoothstep( 1.15, 1.4, hw ) * smoothstep( 2.1, 1.7, hw );
		float pebDensity = smoothstep( 0.62, 0.85, macroB + dM.w * 0.3 ) * 0.2 + wrackBand * smoothstep( 0.3, 0.6, dM.y );
		float pebW = smoothstep( 0.66, 0.8, dN.z ) * clamp( pebDensity, 0.0, 1.0 ) * smoothstep( 0.6, 0.9, spSand ) * landW
			* ( 1.0 - smoothstep( 12.0, 35.0, camDist ) );
		vec3 pebCol = mix( mix( ${ S( 0.86, 0.82, 0.74 ) }, ${ S( 0.78, 0.64, 0.6 ) }, smoothstep( 0.45, 0.75, dM.x ) ), ${ S( 0.36, 0.33, 0.3 ) }, smoothstep( 0.74, 0.82, dM.y ) );
		sand = mix( sand, pebCol, pebW * 0.75 );
		float wrack = wrackBand * smoothstep( 0.58, 0.72, dN.y ) * smoothstep( 0.4, 0.6, macroB );
		sand = mix( sand, ${ S( 0.24, 0.18, 0.11 ) }, wrack * 0.8 );
		// trampled sand along the paths
		sand = sand * ( 1.0 - pathW * 0.07 );

		// wind ripples on the dry sand: crests across the wind (bent by the fbm), wavelength ~10.5 cm,
		// fading where trodden; visible in the albedo too (finer sand on the crests)
		float windK = fade1 * smoothstep( 1.5, 2.2, hb ) * ( 1.0 - pathW ) * ( 1.0 - trod * 0.7 )
			* smoothstep( 0.2, 0.5, macroB + dM.w * 0.3 );
		sand = sand * ( ( rip1 - 0.5 ) * 0.12 * windK + 1.0 );

		// ---- seabed: sand with ripple fields, seagrass meadows, rubble heads (only below the berm)
		float depth = -hb;
		float fieldW2 = 0.0; float seagrassW = 0.0; float blades = 0.0; float rubbleW = 0.0;
		vec3 under = sand;
		if ( underW > 0.0 ) {
			under = mix( ${ S( 0.84, 0.78, 0.64 ) }, ${ S( 0.72, 0.7, 0.58 ) }, smoothstep( 1.0, 9.0, depth ) );
			under = under * ( ( dM.w - 0.5 ) * 0.14 + 1.0 ) * ( ( grain - 0.45 ) * 0.25 + 1.0 );
			fieldW2 = smoothstep( 0.42, 0.62, macroB + ( dM.w - 0.5 ) * 0.35 ) * smoothstep( 0.9, 2.0, depth );
			under = under * ( ( rip2 - 0.55 ) * 0.22 * fieldW2 * fade2 + 1.0 );
			float clumps = ( dM.w - 0.5 ) * 0.5 + ( dN.y - 0.45 ) * 0.4 + ( macroB - 0.5 ) * 0.3;
			seagrassW = smoothstep( 0.3, 0.55, spSeagrass + clumps ) * underW * smoothstep( 0.3, 0.9, depth );
			vec2 swPerp = vec2( -swDir.y, swDir.x );
			blades = terDetail( uTerOff[ ${ O_BLADES } ] + vec2( dot( xz, swDir ) / 2.6, dot( xz, swPerp ) / 0.35 ) ).y;
			vec3 meadow = mix( ${ S( 0.12, 0.16, 0.07 ) }, ${ S( 0.27, 0.29, 0.15 ) }, smoothstep( 0.35, 0.75, blades ) );
			meadow = mix( meadow, ${ S( 0.24, 0.2, 0.11 ) }, smoothstep( 0.55, 0.8, dM.y + ( macroB - 0.5 ) * 0.4 ) * 0.5 );
			meadow = mix( under, meadow, smoothstep( 0.3, 0.85, spSeagrass + clumps * 0.5 ) * 0.35 + 0.65 );
			meadow = mix( meadow, mix( meadow, under, 0.45 ), smoothstep( 0.58, 0.8, macroB + ( dM.w - 0.5 ) * 0.4 ) );
			under = mix( under, meadow, seagrassW );
			rubbleW = smoothstep( 0.3, 0.6, spRubble + ( dN.x - 0.5 ) * 0.4 + ( dM.w - 0.5 ) * 0.3 ) * underW;
			vec3 rubble = mix( ${ S( 0.2, 0.19, 0.15 ) }, ${ S( 0.36, 0.33, 0.26 ) }, smoothstep( 0.3, 0.7, dN.x ) );
			rubble = mix( rubble, ${ S( 0.2, 0.24, 0.1 ) }, smoothstep( 0.5, 0.7, dF.y ) * 0.6 );
			rubble = mix( rubble, ${ S( 0.58, 0.38, 0.44 ) }, smoothstep( 0.62, 0.74, dM.x ) * 0.6 );
			under = mix( under, rubble, rubbleW );
		}
		sand = mix( sand, under, underW );

		// ---- ground: tall-grass meadow (tone shared with the grass field), forest floor and, from afar, the
		// forest canopy; laterite. Our rainfall shifts the meadow tone: dry leeward grass goes olive / yellow /
		// straw, the wet windward side lush.
		vec3 V = normalize( uCamPos - vWorldPos );
		float NdV = clamp( dot( N0, V ), 0.0, 1.0 );
		// (town lawns are watered: green even on the dry leeward side)
		float dryShift = ( 0.42 - max( wetM, cityW * 0.62 ) ) * 0.5;
		MeadowTone mt = terrainMeadowTone( macroA + dryShift, macroB + dryShift, slope, N0.z, dM.w * 0.65 + dN.w * 0.35, true );
		// clumps (1-3 m) and tussocks, blade-scale grain
		float clump = dM.w * 0.6 + dN.y * 0.4;
		// seen from afar the tussocks and their shadowed gaps are what makes tall grass read as grass (not
		// lawn): the clump contrast grows with distance as the blades fade out; grazed pasture and town lawns
		// are shorter
		float shortK = max( pastureV, cityW );
		float clumpK = mix( 0.34, 0.95, smoothstep( 40.0, 140.0, camDist ) ) * ( 1.0 - shortK * 0.5 );
		vec3 lawn = mt.tone * ( ( clump - 0.5 ) * clumpK + 1.0 ) * ( ( dF.y - 0.4 ) * 0.22 + 1.0 );
		lawn = lawn * mix( 1.0, smoothstep( 0.25, 0.55, dN.y * 0.5 + dM.y * 0.5 ) * 0.35 + 0.72, smoothstep( 50.0, 160.0, camDist ) * ( 1.0 - shortK * 0.6 ) );
		// grass combed along the wind: long streaks (only where the lawn shows)
		bool lawnShows = jungleW < 1.0 && landW > 0.0 && sandW < 1.0;
		float comb = 0.5;
		#ifndef TERRAIN_LOW
		if ( lawnShows ) {
			vec2 wp = vec2( -wd.y, wd.x );
			vec2 combUV = vec2( dot( xz, wd ) / 7.5, dot( xz, wp ) / 0.9 );
			// (explicit gradients: this runs in a branch)
			comb = textureGrad( terrainDetailTex, uTerOff[ ${ O_COMB } ] + combUV + vec2( 0.31, 0.77 ),
				vec2( dot( dpx.xz, wd ) / 7.5, dot( dpx.xz, wp ) / 0.9 ), vec2( dot( dpy.xz, wd ) / 7.5, dot( dpy.xz, wp ) / 0.9 ) ).w;
			lawn = lawn * ( ( comb - 0.5 ) * 0.3 + 1.0 );
		}
		#endif
		// seen from above the dark soil shows between the clumps; at grazing angles blade sides cover
		// everything (lighter, more saturated)
		float gapK = smoothstep( 0.3, 0.95, NdV ) * smoothstep( 0.62, 0.3, clump ) * ( 1.0 - shortK * 0.7 );
		lawn = mix( lawn, MEADOW_soil, gapK * 0.45 );
		lawn = mix( lawn, terrainSaturation( lawn * 1.12, 1.15 ), smoothstep( 0.45, 0.1, NdV ) * 0.6 );
		// travelling gusts flatten the grass: the paler blade backs show as waves
		#ifndef TERRAIN_LOW
		if ( lawnShows ) {
			float gust = terGustAt( xz, dpx.xz, dpy.xz ) * clamp( uTerWind.z * 0.5, 0.0, 1.0 );
			lawn = mix( lawn, lawn * vec3( 1.25, 1.22, 1.06 ) + 0.01, gust * 0.6 );
		}
		#endif
		// bare trodden soil in places, sandy soil toward the beach
		lawn = mix( lawn, ${ S( 0.4, 0.33, 0.23 ) }, smoothstep( 0.72, 0.84, dN.y + ( dM.y - 0.5 ) * 0.5 ) * 0.25 );
		// (ours: the stone-free fbm dM.w for dM.y. Tidewater's grass field hides the 0.3 m stones of dM.y; on our
		// sparser sward they showed as pale sandy discs all along the back of the beaches)
		lawn = mix( lawn, ${ S( 0.60, 0.52, 0.38 ) }, clamp( spSand * 1.6, 0.0, 1.0 ) * smoothstep( 0.45, 0.62, dN.z + dM.w * 0.3 ) * 0.7 );
		// inside the geometric grass field the ground is only seen between the blades: the shaded base of
		// the sward, dark and brownish with dead leaves (uTerGrass.z: the vegetation turns it on)
		float grassHere = smoothstep( 2.5, 4.5, hb ) * ( 1.0 - smoothstep( 0.45, 0.85, jungleW ) ) * ( 1.0 - clamp( spSand * 1.6, 0.0, 1.0 ) );
		float fieldK = ( 1.0 - smoothstep( uTerGrass.x, uTerGrass.y, length( vWorldPos.xz - uCamPos.xz ) ) ) * grassHere * uTerGrass.z;
		vec3 swardBase = mix( mt.tone * 0.4, MEADOW_soil, 0.4 ) * ( ( dN.y - 0.45 ) * 0.6 + 1.0 ) * ( ( dF.y - 0.4 ) * 0.3 + 1.0 );
		lawn = mix( lawn, swardBase, fieldK );
		vec3 litter = mix( ${ S( 0.2, 0.15, 0.09 ) }, ${ S( 0.34, 0.25, 0.13 ) }, dF.y );
		vec3 jungle = mix( ${ S( 0.1, 0.16, 0.05 ) }, litter, smoothstep( 0.52, 0.7, dN.y ) );
		jungle = mix( jungle, ${ S( 0.12, 0.1, 0.06 ) }, gully * 0.3 );
		float farK = smoothstep( 40.0, 160.0, camDist );
		vec3 cover = mix( ${ S( 0.08, 0.13, 0.04 ) }, ${ S( 0.17, 0.24, 0.07 ) }, smoothstep( 0.3, 0.7, mcr ) );
		cover = mix( cover, ${ S( 0.27, 0.29, 0.12 ) }, smoothstep( 0.66, 0.84, macroB + dM.w * 0.2 ) * 0.45 );
		jungle = mix( jungle, cover, farK * 0.8 );
		jungle = jungle * ( ( mcr - 0.5 ) * 0.3 + 1.0 );
		// canopy: seen from a distance (or on slopes too steep for the trees) the forest reads as a carpet
		// of lumpy crowns with dark gaps
		float canopyW = jungleW * max( smoothstep( 0.2, 0.4, slope ), smoothstep( 90.0, 260.0, camDist ) ) * smoothstep( 25.0, 70.0, camDist ) * notRock * ( 1.0 - screeW * 0.7 );
		float canopyH = 0.0;
		if ( canopyW > 0.0 ) {
			#ifdef TERRAIN_LOW
			canopyH = smoothstep( 0.32, 0.7, macroB * 0.45 + dM.w * 0.55 );
			#else
			// (crowns: two tiles too, 61 m and 83 m)
			float crowns = clamp( ( ${ fr( 5 ) }.w + ${ fr( 10, ' + 0.47' ) }.w - 1.0 ) * 0.7071 + 0.5, 0.0, 1.0 );
			float crownsB = ${ fr( 6, ' + 0.37' ) }.w;
			canopyH = smoothstep( 0.32, 0.7, crowns * 0.45 + crownsB * 0.4 + dM.w * 0.15 );
			#endif
			vec3 canopy = mix( ${ S( 0.05, 0.08, 0.025 ) }, mix( ${ S( 0.14, 0.21, 0.06 ) }, ${ S( 0.22, 0.27, 0.09 ) }, macroB ), canopyH );
			// steep faces: the canopy hangs in streaks down the fall line
			canopy = canopy * ( ( streak - 0.5 ) * 0.5 * smoothstep( 0.3, 0.5, slope ) + 1.0 );
			jungle = mix( jungle, canopy, canopyW );
		}
		vec3 ground = mix( lawn, jungle, jungleW );
		// around the bare rock: dark humus, stones and moss, with the surrounding plants creeping in
		float creepIn = smoothstep( 0.4, 0.75, dM.w + ( dN.y - 0.45 ) * 0.5 + ( macroB - 0.5 ) * 0.3 );
		vec3 scree = mix( ${ S( 0.16, 0.13, 0.1 ) }, ${ S( 0.27, 0.24, 0.2 ) }, smoothstep( 0.45, 0.75, dM.x + ( dN.x - 0.5 ) * 0.3 ) );
		scree = mix( scree, mix( ${ S( 0.13, 0.18, 0.06 ) }, ${ S( 0.22, 0.26, 0.09 ) }, dF.y ), smoothstep( 0.45, 0.7, dM.y + ( dN.y - 0.45 ) * 0.5 ) * 0.7 );
		ground = mix( ground, scree, screeW * ( 1.0 - creepIn * 0.7 ) );
		vec3 laterite = mix( ${ S( 0.42, 0.25, 0.16 ) }, ${ S( 0.52, 0.36, 0.24 ) }, dM.w ) * ( ( dN.y - 0.4 ) * 0.3 + 1.0 );
		ground = mix( ground, laterite, lateriteW );

		// farm fields in rows: pineapple (red soil, grey-green plants) and cane (dense green)
		// (the 1.6 m rows fade to their mean once they get thinner than a pixel: they alias into moire bands;
		// differentiated outside the branch)
		float rowPh = dot( vWorldPos.xz, vec2( 0.7071 ) ) / 1.6;
		float rowAA = 1.0 - smoothstep( 0.2, 0.5, fwidth( rowPh ) );
		if ( fieldW > 0.0 ) {
			float rows = mix( 0.15, smoothstep( 0.35, 0.5, abs( fract( rowPh ) - 0.5 ) ), rowAA );
			vec3 soil = mix( ${ S( 0.42, 0.25, 0.16 ) }, ${ S( 0.5, 0.33, 0.22 ) }, dM.w ) * ( ( dN.y - 0.4 ) * 0.3 + 1.0 );
			bool pine = fieldV < 0.5;
			vec3 crop = ( pine ? ${ S( 0.33, 0.38, 0.27 ) } : ${ S( 0.22, 0.31, 0.09 ) } ) * ( ( dM.w - 0.5 ) * 0.3 + 1.0 ) * ( ( dF.y - 0.4 ) * 0.25 + 1.0 );
			ground = mix( ground, mix( soil, crop, pine ? rows : 0.85 + rows * 0.15 ), fieldW );
		}

		// ---- worn dirt paths / trampled ground (darker, redder soil in the forest); road shoulders gravel
		vec3 dirt = mix( ${ S( 0.38, 0.31, 0.23 ) }, ${ S( 0.5, 0.43, 0.32 ) }, dM.w ) * ( ( dN.y - 0.4 ) * 0.35 + 0.95 );
		dirt = mix( dirt, ${ S( 0.3, 0.22, 0.15 ) }, jungleW * 0.7 );
		dirt = mix( dirt, ${ S( 0.56, 0.53, 0.48 ) }, smoothstep( 0.72, 0.82, dN.z ) * 0.5 );
		dirt = mix( dirt, ${ S( 0.56, 0.53, 0.48 ) } * ( ( dN.z - 0.45 ) * 0.4 + 1.0 ), roadV * 0.5 );
		// grass creeping onto the trail, a grassy strip between the two worn ruts
		float creep = smoothstep( 0.45, 0.7, dN.y + ( dF.y - 0.45 ) * 0.5 ) * smoothstep( 0.9, 0.5, spPath );
		dirt = mix( dirt, lawn, creep * 0.8 );

		// ---- alpine desert on the high volcanoes: bare red-brown cinder and grey lava rock (nothing grows
		// above ~3,000 m real on Mauna Kea, Mauna Loa and Haleakala); snow patches right at the summits
		float alpine = smoothstep( 430.0, 530.0, h + ( macroA - 0.5 ) * 140.0 + ( dM.w - 0.5 ) * 20.0 );
		vec3 cinder = mix( ${ S( 0.38, 0.24, 0.17 ) }, ${ S( 0.26, 0.24, 0.23 ) }, smoothstep( 0.35, 0.65, macroB * 0.7 + dM.w * 0.3 ) )
			* ( ( dN.x - 0.45 ) * 0.3 + 1.0 ) * ( ( dF.z - 0.45 ) * 0.25 + 1.0 );
		ground = mix( ground, cinder, alpine );
		dirt = mix( dirt, cinder * 0.8, alpine );

		// ---- combine
		meadowW = ( 1.0 - jungleW ) * ( 1.0 - pathW ) * notRock * ( 1.0 - sandW ) * landW * ( 1.0 - screeW ) * ( 1.0 - alpine ) * ( 1.0 - fieldW );
		vec3 albedo = mix( ground, dirt, pathW );
		albedo = mix( albedo, sand, max( sandW, underW * notRock ) );
		albedo = mix( albedo, rockAlbedo, rockW );
		albedo = mix( albedo, lavaAlbedo, lavaW * landW );
		float snowP = smoothstep( 0.52, 0.72, macroA * 0.5 + dM.w * 0.3 + mcr * 0.2 + max( -N0.z, 0.0 ) * 0.25 );
		float snowW = smoothstep( 660.0, 700.0, h + ( macroA - 0.5 ) * 80.0 ) * snowP * ( 1.0 - smoothstep( 0.3, 0.6, slope ) );
		albedo = mix( albedo, ${ S( 0.93, 0.95, 0.97 ) } * ( ( grain - 0.45 ) * 0.1 + 0.97 ), snowW );

		// ---- wetness (swash zone): a static damp band until the shore system provides one
		vec2 wetFoam = vec2( smoothstep( 0.5, 0.0, h ), 0.0 );
		float wet = clamp( wetFoam.x, 0.0, 1.0 ) * ( 1.0 - jungleW * 0.8 ) * landW;
		// damp sand below the berm: darker in mottled, drying patches even when the swash has not reached
		// it lately
		float dampMottle = smoothstep( 0.3, 0.7, dM.w + ( dN.y - 0.45 ) * 0.6 + ( macroB - 0.5 ) * 0.4 );
		float damp = smoothstep( 1.7, 0.5, hb + dM.w * 0.3 ) * sandW * mix( 0.22, 0.5, dampMottle );
		// sand dries in mottled patches; backwash leaves faint rills down the slope
		float mottle = smoothstep( 0.25, 0.75, dM.w + ( dN.y - 0.45 ) * 0.5 );
		float dryEdge = smoothstep( 0.0, 0.6, wet ) * smoothstep( 1.0, 0.6, wet );
		float wetK = max( wet, damp ) * ( 1.0 - dryEdge * mottle * 0.6 ) * notRock;
		vec2 slopeDir = normalize( N0.xz + vec2( 1e-4, 0.0 ) );
		float rillK = smoothstep( 0.2, 0.9, wet ) * smoothstep( 0.05, 0.6, hb ) * sandW;
		float rill = 0.5;
		#ifndef TERRAIN_LOW
		if ( rillK > 0.0 ) { rill = terDetail( vec2( dot( xz, slopeDir ) / 3.2, dot( xz, vec2( -slopeDir.y, slopeDir.x ) ) / 0.3 ) ).w; }
		#endif
		vec3 wetAlbedo = terrainSaturation( albedo * 0.58, 1.15 ) * vec3( 0.97, 0.98, 1.0 ) * ( ( rill - 0.5 ) * 0.25 * rillK + 1.0 );
		albedo = mix( albedo, wetAlbedo, wetK );
		// swash marks: thin wavy lines of grit left at the limits of earlier uprushes
		float slD = abs( fract( sl ) - 0.5 );
		float swashLine = smoothstep( slW * 1.5 + 0.04, 0.0, slD ) * smoothstep( 0.2, 0.4, hb ) * smoothstep( 1.6, 1.2, hb )
			* smoothstep( 0.45, 0.65, dM.y + ( macroB - 0.5 ) * 0.4 ) * sandW * ( 1.0 - smoothstep( 0.8, 2.0, slW * 10.0 ) );
		albedo = mix( albedo * ( 1.0 - swashLine * 0.3 ), ${ S( 0.9, 0.88, 0.84 ) }, swashLine * smoothstep( 0.6, 0.75, dF.z ) * 0.5 );
		// foam residue: lacy patterns stranded on the sand (from the shore system)
		float residue = clamp( wetFoam.y, 0.0, 1.0 ) * landW * notRock;
		#ifndef TERRAIN_LOW
		if ( residue > 0.0 ) { residue *= smoothstep( 0.42, 0.18, ${ fr( 7 ) }.x ) * 0.7 + 0.3; }
		#endif
		albedo = mix( albedo, ${ S( 0.88, 0.9, 0.9 ) }, residue );

		// ---- roughness
		float rough = mix( 0.88, 0.93, sandW );
		rough = mix( rough, 0.9, pathW );
		rough = mix( rough, rockRough, rockW );
		rough = mix( rough, lavaRough, lavaW );
		// wet sand has a film of water: glossy while fresh, satin as it drains
		rough = mix( rough, mix( 0.42, 0.16, wet ), wetK );
		rough = mix( rough, 0.7, residue );
		rough = mix( rough, 0.75, underW );
		outRough = rough;

		// ---- micro relief for the normal
		float windR = rip1 * 0.005 * windK;
		float waveR = rip3 * 0.012 * fade3 * smoothstep( -0.3, -0.9, hb ) * ( 1.0 - seagrassW );
		float megaR = rip2 * 0.035 * fade2 * fieldW2 * ( 1.0 - seagrassW );
		float sandH = ( grain * 0.004 + grainF * 0.003 + pebW * 0.004 + windR + waveR + megaR ) * ( 1.0 - wet * 0.6 )
			+ rill * 0.006 * rillK;
		// seagrass canopy stands proud of the sand with a ragged scarp; rubble is knobbly
		float seabedH = seagrassW * ( blades * 0.05 + 0.08 ) + rubbleW * ( dN.x * 0.07 + dF.x * 0.015 );
		// (ours: on the lawn the relief takes the stone-free fbm dN.w for dN.y and a quarter of dM.y. Tidewater's
		// grass field hides the stones and leaf blobs of those channels; on our open meadow their domes read as
		// dark rings under a high sun)
		float yRel = mix( dN.w, dN.y, jungleW );
		float groundH = yRel * mix( 0.05, 0.035, jungleW ) + dF.y * 0.012 + dM.y * mix( 0.012, 0.045, jungleW ) + canopyH * canopyW * 2.5
			+ ( dM.w * 0.6 + dN.w * 0.4 ) * 0.12 * ( 1.0 - jungleW ) * ( 1.0 - shortK * 0.6 ) + comb * 0.03 * ( 1.0 - jungleW );
		float screeH = dN.z * 0.04 + dM.x * 0.06;
		float dirtH = dN.z * 0.012 + dN.y * 0.01;
		float hd = mix( mix( groundH, screeH, screeW ), dirtH, pathW );
		hd = mix( hd, sandH + seabedH, max( sandW, underW * notRock ) );
		hd = mix( hd, rockHd, rockW );
		hd = mix( hd, lavaHd, lavaW );
		hdOut = hd;

		// ---- ambient occlusion: baked horizon + cavity, plus litter / crevices / seagrass canopy
		float aoDetail = mix( 1.0, dN.y * 0.5 + 0.7, jungleW * ( 1.0 - sandW ) * notRock * landW )
			* mix( 1.0, smoothstep( 0.2, 0.7, clump ) * 0.35 + 0.65, meadowW );
		// (ours) the forest floor near the camera lies under the vegetation's canopy, which hides most of the
		// sky: without this the dark floor showed the blue sky's diffuse and specular light and read slate-teal.
		// Farther out the terrain paints the canopy itself (canopyW), which sees the whole sky.
		underCanopy = jungleW * ( 1.0 - canopyW ) * notRock * landW * ( 1.0 - sandW ) * ( 1.0 - pathW * 0.5 );
		outAO = aoV * aoDetail * ( 1.0 - seagrassW * 0.3 ) * ( 1.0 - rubbleW * smoothstep( 0.55, 0.2, dN.x ) * 0.35 )
			* mix( 1.0, TER_CANOPY_SKY, underCanopy )
			* mix( 1.0, smoothstep( 0.15, 0.6, canopyH ) * 0.6 + 0.4, canopyW );

		albedoOut = albedo;
	}

	// tall grass shades itself when the sun is low (Tidewater materialSunModulation)
	dtSunMod *= mix( 1.0, smoothstep( -0.05, 0.45, normalize( uSunDir ).y ) * 0.35 + 0.62, meadowW );
	dtAO *= clamp( outAO, 0.0, 1.0 );
	float tRough = outRough;
	diffuseColor = vec4( albedoOut, 1.0 );
	// light passed down through the leaves (green, diffuse: not in the sun's shadow map)
	if ( underCanopy > 0.0 ) {
		vec3 Ls = normalize( uSunDir );
		totalEmissiveRadiance += albedoOut * uSunColor * TER_CANOPY_T * ( max( Ls.y, 0.0 ) * underCanopy
			* cloudShadowAt( vWorldPos ) * terrainSunShadowAt( vWorldPos ) * RECIPROCAL_PI );
	}
`;

const TERRAIN_NORMAL = /* glsl */`
	{
		vec3 pn = terrainPerturbNormal( p, N0, hdOut, 1.0 );
		normal = normalize( ( viewMatrix * vec4( pn, 0.0 ) ).xyz );
	}
`;
