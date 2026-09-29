// Ported from Tidewater src/world/TerrainGPU.js _initSunShadow / updateSunShadow and
// src/world/terrain/TerrainBake.js buildShadowHeights (MIT, see LICENSE-Tidewater.txt).
//
// Heightfield sun shadow: a world-space shadow map of the terrain for the key light. For every cell the
// lowest height that still sees the light past the terrain (max over the march of h(q) - t * tan(elev))
// and the distance to that occluder (the penumbra width). One texture fetch (terrainSunShadowAt in
// Materials.js) gives soft, long hill shadows for any point far beyond the shadow map range.
//
// Tidewater bakes its whole 2 km island; ours is a camera-centred 1024^2 grid of the 8 m data (8.2 km),
// its heights and 2 x 2 max mips built by a world worker ('heightGrid'), re-centred after the camera
// has moved a quarter of it. The bake is one fragment pass into a 1024^2 RGBA16F target (r top height,
// g occluder distance), redone when the key light has moved more than 0.0015 rad.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G } from '../../render/Materials.js';

const N = 1024;
const STEP = 8;
const SUN_T0 = 24; // m: nearer occluders are left to the shadow map / N.L
const SUN_DT0 = 6;
const SUN_GROWTH = 1.22;
const SUN_STEPS = 24; // reaches ~3.2 km
const RECENTRE = 0.25;

const VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

export class HillShadow {
	constructor( hf, pool ) {
		this.hf = hf;
		this.pool = pool;
		this.rect = new THREE.Vector4( 0, 0, N * STEP, N * STEP );
		this.centre = null;
		this.pending = null;
		this.heights = null;
		this.baked = new THREE.Vector3( 0, - 2, 0 ); // key light of the last bake
		this.version = 0; // bumps on every bake (the ground bounce follows)
		this.rt = new THREE.WebGLRenderTarget( N, N, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false } );
		this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
		this.rt.texture.wrapS = this.rt.texture.wrapT = THREE.ClampToEdgeWrapping;
		this.rt.texture.name = 'hillShadow';
		this.pass = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'HillShadowBake',
			uniforms: { uH: { value: null }, uRect: { value: this.rect }, uL: { value: new THREE.Vector3( 0, 1, 0 ) } },
			vertexShader: VERT,
			fragmentShader: /* glsl */`
				uniform sampler2D uH; uniform vec4 uRect; uniform vec3 uL;
				varying vec2 vUv;
				void main() {
					vec2 xz = uRect.xy + vUv * uRect.zw;
					vec3 L = uL;
					float lxz = max( length( L.xz ), 1e-4 );
					vec2 dir = L.xz / lxz;
					float tanEl = L.y / lxz;
					float top = -1e4;
					float occ = 0.0;
					float t = ${ SUN_T0.toFixed( 1 ) };
					float dt = ${ SUN_DT0.toFixed( 1 ) };
					for ( int i = 0; i < ${ SUN_STEPS }; i ++ ) {
						vec2 q = xz + dir * t;
						vec2 uv = ( q - uRect.xy ) / uRect.zw;
						// (the grid is camera-centred: nothing is known beyond it)
						if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) break;
						float hq = textureLod( uH, uv, log2( max( dt * ${ ( 1 / STEP ).toFixed( 8 ) }, 1.0 ) ) ).x;
						float v = hq - t * tanEl;
						if ( v > top ) {
							top = v;
							occ = t;
						}
						dt *= ${ SUN_GROWTH.toFixed( 3 ) };
						t += dt;
					}
					// (half float range: a sun near the zenith pushes top toward -inf, one below the horizon toward +inf)
					gl_FragColor = vec4( clamp( top, -6e4, 6e4 ), occ, 0.0, 1.0 );
				}`,
			depthTest: false, depthWrite: false,
		} ) );
		this.pass.material.toneMapped = false;
		G.uHillShadowRect.value.copy( this.rect );
	}

	get enabled() { return this.heights !== null; }

	_request( cx, cz ) {
		const hf = this.hf, half = N * STEP / 2;
		// texel centres on the 8 m data points: exact samples, no filtering of the ridges
		const x0 = hf.x0 + ( Math.round( ( cx - half - hf.x0 ) / STEP ) - 0.5 ) * STEP;
		const z0 = hf.z0 + ( Math.round( ( cz - half - hf.z0 ) / STEP ) - 0.5 ) * STEP;
		this.pending = { x0, z0 };
		this.pool.run( { type: 'heightGrid', x0, z0, n: N, step: STEP, mips: true }, 3 ).then( ( r ) => {
			if ( ! r || this.pending?.x0 !== x0 || this.pending?.z0 !== z0 ) return;
			this.pending = null;
			const tex = new THREE.DataTexture( r.levels[ 0 ].data, N, N, THREE.RedFormat, THREE.HalfFloatType );
			tex.mipmaps = r.levels.map( l => ( { data: l.data, width: l.width, height: l.height } ) );
			tex.generateMipmaps = false;
			tex.minFilter = THREE.LinearMipmapLinearFilter;
			tex.magFilter = THREE.LinearFilter;
			tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
			tex.needsUpdate = true;
			if ( this.heights ) this.heights.dispose();
			this.heights = tex;
			this.rect.set( x0, z0, N * STEP, N * STEP );
			this.centre = new THREE.Vector2( x0 + N * STEP / 2, z0 + N * STEP / 2 );
			this.dirty = true;
		} ).catch( ( e ) => { console.warn( 'hill shadow heights', e ); this.pending = null; } );
	}

	update( gl, camPos ) {
		const ext = N * STEP;
		// (a stale grid stays in use until the new one arrives)
		if ( ! this.pending && ( ! this.centre || Math.max( Math.abs( camPos.x - this.centre.x ), Math.abs( camPos.z - this.centre.y ) ) > ext * RECENTRE ) ) this._request( camPos.x, camPos.z );
		if ( ! this.heights ) return false;
		const L = G.uSunDir.value;
		// re-bake when the key light moved (Tidewater: 0.0015 rad) or the grid moved
		if ( ! this.dirty && L.angleTo( this.baked ) < 0.0015 ) return false;
		this.dirty = false;
		this.baked.copy( L );
		const u = this.pass.material.uniforms;
		u.uH.value = this.heights;
		u.uL.value.copy( L ).normalize();
		const prev = gl.getRenderTarget();
		gl.setRenderTarget( this.rt );
		this.pass.render( gl );
		gl.setRenderTarget( prev );
		G.uHillShadow.value = this.rt.texture;
		G.uHillShadowRect.value.copy( this.rect );
		G.uHillShadowOn.value = 1;
		this.version ++;
		return true;
	}

	dispose() {
		this.rt.dispose();
		this.pass.dispose();
		if ( this.heights ) this.heights.dispose();
	}
}
