// The Pacific, ported from Tidewater's ocean (MIT, see LICENSE-Tidewater.txt): a 4-cascade FFT sea
// (ocean/OceanFFT.js) on a CDLOD grid (ocean/CDLOD.js), composed like Tidewater's WaterSurface
// (ocean/waterSurface.js: depth attenuation per cascade, Jacobian whitecaps, the procedural foam mat,
// gusts / slicks / windrows) and shaded with Tidewater's water model (ocean/waterShade.js). Only sea
// connected to the open ocean is drawn (ocean/seaMask.js). The fine ground under the sea and the shoreline
// waves' travel-time field come from a 2 km tile around the camera (ocean/LocalTile.js, ocean/ShoreField.js);
// the shoreline waves shoal, plunge, run on as bores and swash up the sand (ocean/ShoreWaves.js); the foam
// they make is carried by the water and left on the sand (ocean/ShoreSim.js, ocean/SurfFoam.js). The CPU
// twin of the surface (ocean/OceanTwin.js: the same spectrum through small FFTs in a worker, plus the shore
// waves) answers heightAt() for swimming, boats and splashes.
import * as THREE from 'three';
import { G, COMMON_GLSL } from '../render/Materials.js';
import { LAYER_POST } from '../render/Renderer.js';
import { buildSeaMask, seaMaskAt, seaPyramid, anySea } from './ocean/seaMask.js';
import { waterShadeUniforms, WATER_HELPERS_GLSL, waterShadeGLSL } from './ocean/waterShade.js';
import { OceanFFT } from './ocean/OceanFFT.js';
import { OceanTwin } from './ocean/OceanTwin.js';
import { CDLOD } from './ocean/CDLOD.js';
import { createPatternTexture, writePatternLayer, PATTERN_LACE, PATTERN_DETAIL } from './ocean/FoamTexture.js';
import { SeaDetail, SEA_DETAIL_GLSL } from './ocean/SeaDetail.js';
import { LocalTile, groundGLSL } from './ocean/LocalTile.js';
import { waterSurfaceGLSL, cascadeAttenuationParams, cascadeAttenuation } from './ocean/waterSurface.js';
import { CASCADE_SIZES, defaultSystems, spectrumParams, seaPreset } from './ocean/oceanSpectrum.js';
import { ShoreWaves, SHORE_GLSL, PERLIN_GLSL } from './ocean/ShoreWaves.js';
import { ShoreSim, SHORE_SIM_GLSL } from './ocean/ShoreSim.js';
import { SURF_FOAM_GLSL } from './ocean/SurfFoam.js';
import { Caustics } from './ocean/Caustics.js';
import { Breakers } from './ocean/Breakers.js';

// water quality: CDLOD grid (quads per node side), FFT resolution, fragment cascades, screen-space
// reflections, near-field ripples, the shore simulation + surf foam, caustics. 'low' runs the same spectrum
// through a 128^2 FFT (every mode of the three large cascades, the finest down to ~11 cm waves)
const QUALITY = {
	low: { grid: 16, fft: 128, fragCascades: 3, ssr: false, nearRipples: false, sim: false, caustics: false },
	medium: { grid: 24, fft: 256, fragCascades: 4, ssr: true, nearRipples: true, sim: true, caustics: true },
	high: { grid: 32, fft: 256, fragCascades: 4, ssr: true, nearRipples: true, sim: true, caustics: true },
};
// the sea state that last rebuilt the spectrum: small drifts of the weather don't
const SEA_STEP = 0.02;
// m: lattice of the per-frame height cache (heightAt): bilinear between exact heights 0.5 m apart
const HEIGHT_STEP = 0.5;
// m: the caustics render only with open sea this close to the camera
const CAUSTICS_R = 320;

export class Ocean {
	constructor( renderer, hf, quality = 'high' ) {
		this.r = renderer;
		this.hf = hf;
		this.seaState = 0.45; // 0 calm .. 1 storm (Weather)
		this.time = 0;
		this._hc = { t: NaN, map: new Map() }; // heightAt cache ( time, lattice key -> height )
		this.quality = QUALITY[ quality ] ? quality : 'high';
		this.sizes = CASCADE_SIZES.slice();
		this.attParams = cascadeAttenuationParams( this.sizes );
		this._att = [ 0, 0, 0, 0 ];
		this._d = [ 0, 0, 0 ];
		this.seaMask = buildSeaMask( hf );
		this._seaPyr = seaPyramid( hf, this.seaMask );
		this.bathy = makeBathyTexture( hf, this.seaMask );
		this.tile = new LocalTile( hf );
		this.shore = new ShoreWaves();
		this.twin = new OceanTwin();
		this.detail = new SeaDetail();
		this.patterns = createPatternTexture( renderer.gl );
		writePatternLayer( renderer.gl, this.patterns, PATTERN_DETAIL, this.detail.data, this.detail.size );
		this.tile.listeners.push( ( t ) => {
			this.shore.setField( t.field );
			this._stations = t.stations;
			if ( this.breakers ) this.breakers.setStations( t.stations );
			// the surf lace once the first tile is in (the worker is free then)
			if ( ! this._lace ) this._lace = this.tile.lace( 512 ).then( ( l ) => { if ( l ) writePatternLayer( renderer.gl, this.patterns, PATTERN_LACE, l.data, l.size ); } );
		} );
		// uniforms shared by the water material and the shore simulation (the same { value } objects)
		this.U = Object.assign( {
			uLocalH: { value: this.tile.texture }, uLocalRect: { value: this.tile.rect }, uLocalOn: { value: 0 },
			uBathy: { value: this.bathy }, uBathyRect: { value: new THREE.Vector4( hf.x0 - hf.CS / 2, hf.z0 - hf.CS / 2, hf.CS * hf.cnx, hf.CS * hf.cnz ) },
			uPatterns: { value: this.patterns.texture },
			uShoreSim: { value: null }, uShoreSimRect: { value: new THREE.Vector4( 0, 0, 1, 1 ) },
			uWaterLevel: G.uWaterLevel,
		}, this.shore.uniforms() );
		this.systems = defaultSystems();
		// Tidewater's local sea runs 20 degrees off its swell; ours blows with the trades (G.uWind)
		const wd = G.uWind.value;
		this.windDeg = Math.atan2( wd.y, wd.x ) * 180 / Math.PI;
		this.systems.local.windDirection = this.windDeg;
		this.systems.swell.windDirection = this.windDeg - 20;
		this.sea = null; // the applied sea preset
		this._build();
		this._applySea( true );
	}

	_build() {
		const Q = QUALITY[ this.quality ];
		if ( this.fft ) this.fft.dispose();
		this.fft = new OceanFFT( this.r.gl, this.sizes, Q.fft );
		if ( this.sea ) { this.fft.setSpectrum( this.P ); this._setFoam(); }
		this.cdlod = new CDLOD( { gridSize: Q.grid, leafSize: 8, levels: 14, minY: - 25, maxY: 25 } );
		// (perf) no nodes over dry land: their vertices were shaded and every fragment discarded (vSeaMask)
		this.cdlod.cull = ( x, z, size ) => ! anySea( this._seaPyr, this.hf, x, z, size );
		// the shore simulation (medium and up)
		if ( Q.sim && ! this.sim ) this.sim = new ShoreSim( this.r.gl, 'uniform float uWaterLevel; uniform highp sampler2DArray uPatterns;' + groundGLSL( false ) + PERLIN_GLSL + SHORE_GLSL, this.U );
		else if ( ! Q.sim && this.sim ) { this.sim.dispose(); this.sim = null; }
		if ( Q.caustics && ! this.caustics ) this.caustics = new Caustics( this.r.gl, this.sizes );
		else if ( ! Q.caustics && this.caustics ) { this.caustics.dispose(); this.caustics = null; }
		// the thrown lips of the plunging breakers (with the shore simulation)
		if ( Q.sim && ! this.breakers ) {
			this.breakers = new Breakers( this.r.gl, 'uniform float uWaterLevel; uniform highp sampler2DArray uPatterns;' + groundGLSL( false ) + PERLIN_GLSL + SHORE_GLSL, this.U, this.sizes );
			this.breakers.mesh.layers.set( LAYER_POST );
			if ( this._stations ) this.breakers.setStations( this._stations );
		} else if ( ! Q.sim && this.breakers ) { this.breakers.mesh.removeFromParent(); this.breakers.dispose(); this.breakers = null; }
		const mat = this._material( Q );
		if ( this.mesh ) {
			this.mesh.geometry.dispose();
			this.mesh.material.dispose();
			this.mesh.geometry = this.cdlod.geometry;
			this.mesh.material = mat;
		} else {
			this.mesh = new THREE.Mesh( this.cdlod.geometry, mat );
			this.mesh.name = 'ocean';
			this.mesh.frustumCulled = false;
			this.mesh.layers.set( LAYER_POST );
			this.mesh.renderOrder = 10;
			this.mesh.matrixAutoUpdate = false;
			// the projection this frame is drawn with (the TAA jitters it inside the render call)
			this.mesh.onBeforeRender = ( gl, scene, camera ) => {
				const u = this.mat.uniforms;
				u.uProj.value.copy( camera.projectionMatrix );
				u.uCamWorld.value.copy( camera.matrixWorld );
				this._occBegin( gl );
			};
			this.mesh.onAfterRender = ( gl ) => this._occEnd( gl );
		}
		if ( this.breakers && this.breakers.mesh.parent !== this.mesh ) this.mesh.add( this.breakers.mesh );
		this.mat = mat;
	}

	_material( Q ) {
		const SIM = Q.sim, CAU = !! this.caustics;
		const S = waterSurfaceGLSL( { sizes: this.sizes, fftSize: Q.fft, fragCascades: Q.fragCascades, detail: true, nearRipples: Q.nearRipples, shore: true, sim: SIM, surfFoam: SIM } );
		const mat = new THREE.ShaderMaterial( {
			name: 'Ocean',
			uniforms: Object.assign( waterShadeUniforms( THREE ), {
				uOceanDisp: { value: null }, uOceanDeriv: { value: null }, uOceanFoamBias: { value: 0.58 },
				uWaterAmp: { value: 1 }, uFoamCoverage: { value: 1 }, uFoamScale: { value: 0.09 },
				uCdlodMorph: { value: this.cdlod.morph },
				uSeaDetailOffset: { value: this.detail.offset }, uSeaDetailAmt: { value: this.detail.amount },
				uSeaWindDir: { value: new THREE.Vector2( 1, 0 ) }, uSeaWindSpeed: { value: 7 },
				uWaterDebug: { value: 0 },
			}, CAU ? this.caustics.uniformsForMaterial() : {}, this.U, G ),
			defines: { REVERSED: this.r.reversed ? 1 : 0, LOGDEPTH: this.r.logDepth ? 1 : 0 },
			vertexShader: /* glsl */`
				uniform float uWaterLevel;
				uniform highp sampler2DArray uPatterns;
				attribute vec4 nodeData;
				varying vec3 vWorld; varying vec2 vLagXZ; varying float vWaveH; varying float vSeaDepth; varying float vFoamV;
				varying vec3 vShoreNv; varying float vShoreFoamV; varying vec2 vSurfMaskV; varying float vSeaMask;
				${ this.cdlod.glsl }
				${ groundGLSL( false ) }
				${ PERLIN_GLSL }
				${ SHORE_GLSL }
				${ S.vertex }
				void main() {
					WaterSurfaceVertex r = waterSurfaceVertex( nodeData, position.xz );
					vWorld = r.position;
					vLagXZ = r.lagXZ;
					vWaveH = r.height;
					vSeaDepth = r.depth;
					vFoamV = r.foam;
					vShoreNv = r.shoreN;
					vShoreFoamV = r.shoreFoam;
					vSurfMaskV = r.surfMask;
					// only sea connected to the open ocean (per vertex: the fragment shader has no sampler to spare)
					vSeaMask = textureLod( uBathy, ( r.lagXZ - uBathyRect.xy ) / uBathyRect.zw, 0.0 ).g;
					gl_Position = projectionMatrix * viewMatrix * vec4( r.position, 1.0 );
				}`,
			fragmentShader: /* glsl */`
				uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
				uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
				uniform float uWet; uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK;
				uniform vec2 uWind; uniform float uNight; uniform float uUnderwater; uniform float uWaterLevel;
				uniform highp sampler2DArray uPatterns;
				varying vec3 vWorld; varying vec2 vLagXZ; varying float vWaveH; varying float vSeaDepth; varying float vFoamV;
				varying vec3 vShoreNv; varying float vShoreFoamV; varying vec2 vSurfMaskV; varying float vSeaMask;
				uniform int uWaterDebug;
				${ COMMON_GLSL }
				${ groundGLSL( true ) }
				${ PERLIN_GLSL }
				${ SHORE_GLSL }
				${ SIM ? SHORE_SIM_GLSL + SURF_FOAM_GLSL : '' }
				${ WATER_HELPERS_GLSL }
				${ SEA_DETAIL_GLSL }
				${ CAU ? this.caustics.glsl() : '' }
				${ S.fragment }
				// slope of the long waves (the two largest cascades, level 2, and the shore waves' normal): what
				// tilts the caustic network (Tidewater UnderwaterLighting underwaterLongWaves)
				vec2 waterLongSlope( vec2 xz, vec3 shoreN ) {
					vec2 slope = vec2( 0.0 );
					for ( int c = 0; c < 2; c ++ ) {
						float L = c == 0 ? ${ this.sizes[ 0 ].toFixed( 3 ) } : ${ this.sizes[ 1 ].toFixed( 3 ) };
						slope += textureLod( uOceanDeriv, vec3( xz / L, float( c ) ), 2.0 ).xy * waterSurfaceCascadeAttenuation( c, vSeaDepth );
					}
					vec3 n = normalize( shoreN + vec3( 0.0, 1e-4, 0.0 ) );
					return slope - n.xz / max( n.y, 0.25 );
				}
				void main() {
					vec3 pos = vWorld;
					vec2 lagXZ = vLagXZ;
					float vDepth = vSeaDepth;
					float vHeight = vWaveH;
					float vFoam = vFoamV;
					vec3 vShoreN = vShoreNv;
					float vShoreFoam = vShoreFoamV;
					vec2 vSurfMask = vSurfMaskV;
					// footprint of this pixel on the surface (m), for filtering / roughness (uniform control flow)
					float footprint = max( length( fwidth( lagXZ ) ), 1e-4 );
					vec2 wdx = dFdx( pos.xz ), wdy = dFdy( pos.xz );
					// seabed height under this pixel: the fine tile, else the opaque scene seen through it
					float groundH;
					if ( waterOnTile( pos.xz ) ) groundH = waterGroundAt( pos.xz );
					else {
						vec2 suv = gl_FragCoord.xy / uViewport;
						float sd = waterSceneDepthAt( suv );
						groundH = waterIsSky( sd ) ? -1e4 : ( uCamWorld * vec4( waterViewPos( suv, - waterViewDepth( sd ) ), 1.0 ) ).y;
					}
					vec3 outCol = vec3( 0.0 );
					float seenFromBelow = 0.0;
					${ waterShadeGLSL( { SSR: Q.ssr, SH: true, SIM, SF: SIM, CAU } ) }
					if ( vSeaMask < 0.5 ) discard;
					if ( seenFromBelow < 0.5 ) outCol = atmosphereFog( outCol, pos );
					// debug views (__world.ocean.mat.uniforms.uWaterDebug): 1 shore foam / plunging face / roller,
					// 2 foam, 3 normal, 4 depth, 5 film thickness, 6 shore simulation (foam, wetness, residue)
					if ( uWaterDebug == 1 ) outCol = vec3( vShoreFoam, vSurfMask.x, vSurfMask.y ) * 4.0;
					else if ( uWaterDebug == 2 ) outCol = vec3( surf.foam ) * 4.0;
					else if ( uWaterDebug == 3 ) outCol = ( surf.normal * 0.5 + 0.5 ) * 2.0;
					else if ( uWaterDebug == 4 ) outCol = vec3( fract( vDepth ), clamp( vDepth / 10.0, 0.0, 1.0 ), 0.0 ) * 3.0;
					else if ( uWaterDebug == 5 ) outCol = vec3( clamp( thickness, 0.0, 1.0 ), clamp( thickness * 10.0, 0.0, 1.0 ), 0.0 ) * 3.0;
					else if ( uWaterDebug == 6 ) outCol = simState.xyz * 4.0;
					gl_FragColor = vec4( outCol, 1.0 );
				}`,
			side: THREE.DoubleSide, depthWrite: true,
		} );
		return mat;
	}

	// 'low' | 'medium' | 'high' (settings 'water')
	setQuality( q ) {
		if ( ! QUALITY[ q ] || q === this.quality ) return;
		this.quality = q;
		this._build();
	}

	// weather sea state -> Tidewater's sea presets (wind, fetch, choppiness, swell, whitecaps, surf height and
	// period)
	_applySea( force = false ) {
		const s = Math.round( this.seaState / SEA_STEP ) * SEA_STEP;
		if ( ! force && this._seaQ === s ) return;
		this._seaQ = s;
		const p = seaPreset( s );
		this.sea = p;
		const { local, swell } = this.systems;
		local.windSpeed = p.wind;
		local.fetch = p.fetch;
		swell.scale = p.swell;
		this.P = spectrumParams( this.sizes, local, swell );
		this.fft.setSpectrum( this.P );
		this.twin.setSpectrum( this.P );
		this._setFoam();
		this.shore.P.amplitude = p.surf;
		this.shore.P.period = p.period;
	}

	// Tidewater ui/AppUI.js whitecaps(): foam starts at less compression in fresh wind, lasts longer
	_setFoam() {
		const p = this.sea, F = this.fft.params;
		F.choppiness = p.chop;
		F.foamBias = 0.5 + 0.16 * p.whitecaps + 0.01 * Math.min( 12, Math.max( - 5, p.wind - 7 ) );
		F.foamDecay = 0.6 - 0.35 * p.whitecaps;
	}

	// (perf) an occlusion query on the main view's water draw: while no water pixel has passed the depth test
	// for a few frames (city streets, forests, indoors) the spectrum, caustics and breakers, which only feed the
	// drawn surface (the physics reads the CPU twin), stop updating
	_occBegin( gl ) {
		const o = this._occ || ( this._occ = { pool: [], pending: [], active: null, hidden: 0 } );
		const ctx = gl.getContext();
		if ( o.active || ! ctx.ANY_SAMPLES_PASSED_CONSERVATIVE || gl.getRenderTarget() !== this.r.targets?.main || o.pending.length > 3 ) return;
		o.active = o.pool.pop() || ctx.createQuery();
		ctx.beginQuery( ctx.ANY_SAMPLES_PASSED_CONSERVATIVE, o.active );
	}
	_occEnd( gl ) {
		const o = this._occ;
		if ( ! o?.active ) return;
		gl.getContext().endQuery( gl.getContext().ANY_SAMPLES_PASSED_CONSERVATIVE );
		o.pending.push( o.active );
		o.active = null;
	}
	// whether the surface was seen lately (true until the queries say otherwise)
	_occSeen() {
		const o = this._occ;
		if ( ! o ) return true;
		const ctx = this.r.gl.getContext();
		while ( o.pending.length && ctx.getQueryParameter( o.pending[ 0 ], ctx.QUERY_RESULT_AVAILABLE ) ) {
			const q = o.pending.shift();
			o.hidden = ctx.getQueryParameter( q, ctx.QUERY_RESULT ) ? 0 : o.hidden + 1;
			o.pool.push( q );
		}
		return o.hidden < 3 || G.uUnderwater.value > 0.5;
	}

	update( dt, camera, sceneColor, sceneDepth, viewport ) {
		this.time += dt;
		this._applySea();
		const p = this.sea;
		const seen = this._occSeen();
		// (the foam decays over the frames skipped too)
		this._fftDt = ( this._fftDt || 0 ) + dt;
		if ( seen ) { this.fft.update( this.time, Math.min( this._fftDt, 1 ) ); this._fftDt = 0; }
		this.twin.request( this.time, p.chop );
		this.tile.update( camera.position );
		this.shore.update( dt );
		this.cdlod.update( camera );
		const wd = G.uWind.value;
		this.detail.update( dt, wd, p.wind );
		const U = this.U;
		U.uLocalH.value = this.tile.texture;
		U.uLocalOn.value = this.tile.on;
		this.shore.applyTo( U, this.time );
		if ( this.sim ) {
			this.sim.update( dt, camera.position, this.time );
			U.uShoreSim.value = this.sim.texture;
			U.uShoreSimRect.value.copy( this.sim.rect );
		}
		// (perf) the caustics (~1M splatted triangles) only show on a seabed seen close by: skip them while no sea
		// is within CAUSTICS_R of the camera (inland, city streets)
		if ( this.caustics && seen && this._seaNear( camera.position ) ) this.caustics.update( this.fft.deriv, G.uSunDir.value, dt );
		if ( this.breakers && seen ) this.breakers.update( this.fft.disp );
		const u = this.mat.uniforms;
		u.uOceanDisp.value = this.fft.disp;
		u.uOceanDeriv.value = this.fft.deriv;
		u.uOceanFoamBias.value = this.fft.params.foamBias;
		u.uSeaWindDir.value.copy( wd ).normalize();
		u.uSeaWindSpeed.value = p.wind;
		// wind speed at 10 m (m/s) for the Cox-Munk slope variance
		u.uWindU.value = p.wind;
		u.uSceneColor.value = sceneColor;
		u.uSceneDepth.value = sceneDepth;
		u.uViewport.value.copy( viewport );
		u.uCamFar.value = camera.far;
		u.uProj.value.copy( camera.projectionMatrix );
		u.uCamWorld.value.copy( camera.matrixWorld );
		const wh = this.heightAt( camera.position.x, camera.position.z );
		u.uCamWaterH.value = wh;
		G.uUnderwater.value = camera.position.y < wh ? 1 : 0;
	}

	// whether open sea lies within CAUSTICS_R of p (a ring of sea-mask probes, re-checked every 0.5 s or 40 m)
	_seaNear( p ) {
		const c = this._near || ( this._near = { x: 1e9, z: 0, t: 0, v: true } );
		const now = performance.now();
		if ( now - c.t < 500 && ( p.x - c.x ) ** 2 + ( p.z - c.z ) ** 2 < 1600 ) return c.v;
		c.x = p.x; c.z = p.z; c.t = now;
		let v = p.y < G.uWaterLevel.value + 1 || seaMaskAt( this.hf, this.seaMask, p.x, p.z ) > 0;
		for ( let r = 64; ! v && r <= CAUSTICS_R; r += 64 ) {
			const n = Math.ceil( r / 24 );
			for ( let k = 0; k < n && ! v; k ++ ) {
				const a = k / n * Math.PI * 2;
				v = seaMaskAt( this.hf, this.seaMask, p.x + Math.cos( a ) * r, p.z + Math.sin( a ) * r ) > 0;
			}
		}
		c.v = v;
		return v;
	}

	// the ground under the sea (the fine tile, else the coarse bathymetry), as the shaders see it
	groundAt( x, z ) { return this.tile.groundAt( x, z ); }

	// Water surface height at x, z (time t, default now); -1000 where there is no sea (inland dips). The queries
	// of a frame (boat hulls over several substeps, swimmers, splashes, floating items) mostly land in the same
	// few cells: exact heights (heightAtExact) are cached per time on a HEIGHT_STEP lattice and interpolated
	// bilinearly; a cell with a corner where the water is hidden (land, inland) answers exactly.
	heightAt( x, z, t = this.time ) {
		const C = this._hc;
		if ( t !== C.t || C.map.size > 50000 ) { C.map.clear(); C.t = t; }
		const fx = x / HEIGHT_STEP, fz = z / HEIGHT_STEP;
		const i = Math.floor( fx ), j = Math.floor( fz );
		const a = this._node( i, j, t ), b = this._node( i + 1, j, t ), c = this._node( i, j + 1, t ), d = this._node( i + 1, j + 1, t );
		if ( a !== a || b !== b || c !== c || d !== d ) return this.heightAtExact( x, z, t );
		const tx = fx - i, tz = fz - j;
		return ( a * ( 1 - tx ) + b * tx ) * ( 1 - tz ) + ( c * ( 1 - tx ) + d * tx ) * tz;
	}

	// many points at once: out[ k ] = heightAt( xs[ k ], zs[ k ], t )
	heightsAt( xs, zs, out = new Float32Array( xs.length ), t = this.time ) {
		for ( let k = 0; k < xs.length; k ++ ) out[ k ] = this.heightAt( xs[ k ], zs[ k ], t );
		return out;
	}

	// a lattice node of the height cache: the exact height, NaN where the water is hidden
	_node( i, j, t ) {
		const map = this._hc.map;
		const key = ( i + 131072 ) * 262144 + ( j + 131072 );
		let v = map.get( key );
		if ( v === undefined ) {
			const y = this.heightAtExact( i * HEIGHT_STEP, j * HEIGHT_STEP, t );
			v = this._hidden ? NaN : y;
			map.set( key, v );
		}
		return v;
	}

	// CPU twin of the rendered surface (Tidewater WaterQuery.waterQueryHeightAtXZ): the displacement is
	// Lagrangian (x0 -> x0 + D( x0 )), so solve x0 + D( x0 ) = xz with two fixed-point steps. -1000 where
	// there is no sea (inland dips). (this._hidden: the water is hidden there)
	heightAtExact( x, z, t = this.time ) {
		this._hidden = true;
		if ( seaMaskAt( this.hf, this.seaMask, x, z ) < 0.5 ) return - 1000;
		const ground = this.tile.groundAt( x, z );
		const depth = - ground;
		const att = cascadeAttenuation( this.attParams, depth, this._att );
		const fft = att[ 0 ] > 0 || att[ 1 ] > 0 || att[ 2 ] > 0;
		const shore = this.shore.enabled > 0 && depth < 26 && depth > - 0.25;
		let y = 0;
		if ( fft || shore ) {
			let x0 = x, z0 = z;
			for ( let i = 0; i < 3; i ++ ) {
				const d = this._disp( x0, z0, depth, t, fft, shore );
				if ( i === 2 ) { y = d[ 1 ]; break; }
				x0 = x - d[ 0 ]; z0 = z - d[ 2 ];
			}
		}
		// hide the water sheet below dry land (as the vertex shader does)
		if ( y < ground ) y = Math.min( y, depth < - 3 ? Math.min( ground - 2, - 1 ) : ground - 0.06 );
		else this._hidden = false;
		return y;
	}

	// displacement of the whole surface at Lagrangian point x0 (Tidewater WaterQuery.waterQueryDispAt): the FFT
	// cascades (CPU twin) + the shore waves; depth is the query point's
	_disp( x0, z0, depth, t, fft, shore ) {
		const d = this._d;
		if ( fft ) this.twin.disp( x0, z0, t, this._att, this.sizes, QUALITY[ this.quality ].fft, d );
		else d[ 0 ] = d[ 1 ] = d[ 2 ] = 0;
		if ( shore ) {
			const s = this.shore.disp( x0, z0, depth, this._groundFn ??= ( x, z ) => this.tile.groundAt( x, z ), t, this._s ??= [ 0, 0, 0 ] );
			d[ 0 ] += s[ 0 ]; d[ 1 ] += s[ 1 ]; d[ 2 ] += s[ 2 ];
		}
		return d;
	}

	dispose() {
		this.fft.dispose();
		this.twin.dispose();
		this.tile.dispose();
		if ( this.sim ) this.sim.dispose();
		if ( this.caustics ) this.caustics.dispose();
		if ( this.breakers ) this.breakers.dispose();
		this.patterns.dispose();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}

// the coarse heights (r) and the sea mask (g) as a half-float texture on the coarse cell centres
function makeBathyTexture( hf, mask ) {
	const W = hf.cnx, H = hf.cnz;
	const data = new Uint16Array( W * H * 2 );
	const one = THREE.DataUtils.toHalfFloat( 1 ), zero = THREE.DataUtils.toHalfFloat( 0 );
	for ( let i = 0; i < W * H; i ++ ) {
		data[ i * 2 ] = THREE.DataUtils.toHalfFloat( Math.max( - 2000, hf.coarse[ i ] * hf.iq ) );
		data[ i * 2 + 1 ] = mask[ i ] ? one : zero;
	}
	const t = new THREE.DataTexture( data, W, H, THREE.RGFormat, THREE.HalfFloatType );
	t.magFilter = t.minFilter = THREE.LinearFilter;
	t.generateMipmaps = false;
	t.needsUpdate = true;
	// (nothing reads it back: the 14 MB CPU copy goes once it is on the GPU)
	t.onUpdate = () => { t.onUpdate = null; t.image.data = null; };
	return t;
}
