// The Pacific, ported from Tidewater's ocean (MIT, see LICENSE-Tidewater.txt): a 4-cascade FFT sea
// (ocean/OceanFFT.js) on a CDLOD grid (ocean/CDLOD.js), composed like Tidewater's WaterSurface
// (ocean/waterSurface.js: depth attenuation per cascade, Jacobian whitecaps, the procedural foam mat,
// gusts / slicks / windrows) and shaded with Tidewater's water model (ocean/waterShade.js). Only sea
// connected to the open ocean is drawn (ocean/seaMask.js). The fine ground under the sea comes from a 2 km
// tile around the camera (ocean/LocalTile.js). The CPU twin of the surface (ocean/OceanTwin.js: the same
// spectrum through small FFTs in a worker) answers heightAt() for swimming, boats and splashes.
import * as THREE from 'three';
import { G, COMMON_GLSL } from '../render/Materials.js';
import { LAYER_POST } from '../render/Renderer.js';
import { buildSeaMask, seaMaskAt } from './ocean/seaMask.js';
import { waterShadeUniforms, WATER_HELPERS_GLSL, waterShadeGLSL } from './ocean/waterShade.js';
import { OceanFFT } from './ocean/OceanFFT.js';
import { OceanTwin } from './ocean/OceanTwin.js';
import { CDLOD } from './ocean/CDLOD.js';
import { createFoamTexture } from './ocean/FoamTexture.js';
import { SeaDetail, SEA_DETAIL_GLSL } from './ocean/SeaDetail.js';
import { LocalTile, GROUND_GLSL } from './ocean/LocalTile.js';
import { waterSurfaceGLSL, cascadeAttenuationParams, cascadeAttenuation } from './ocean/waterSurface.js';
import { CASCADE_SIZES, defaultSystems, spectrumParams, seaPreset } from './ocean/oceanSpectrum.js';

// water quality: CDLOD grid (quads per node side), FFT resolution, fragment cascades, screen-space
// reflections, near-field ripples. 'low' runs the same spectrum through a 128^2 FFT (every mode of the
// three large cascades, the finest down to ~11 cm waves)
const QUALITY = {
	low: { grid: 16, fft: 128, fragCascades: 3, ssr: false, nearRipples: false },
	medium: { grid: 24, fft: 256, fragCascades: 4, ssr: true, nearRipples: true },
	high: { grid: 32, fft: 256, fragCascades: 4, ssr: true, nearRipples: true },
};
// the sea state that last rebuilt the spectrum: small drifts of the weather don't
const SEA_STEP = 0.02;

export class Ocean {
	constructor( renderer, hf, quality = 'high' ) {
		this.r = renderer;
		this.hf = hf;
		this.seaState = 0.45; // 0 calm .. 1 storm (Weather)
		this.time = 0;
		this.quality = QUALITY[ quality ] ? quality : 'high';
		this.sizes = CASCADE_SIZES.slice();
		this.attParams = cascadeAttenuationParams( this.sizes );
		this._att = [ 0, 0, 0, 0 ];
		this._d = [ 0, 0, 0 ];
		this.seaMask = buildSeaMask( hf );
		this.tile = new LocalTile( hf );
		this.twin = new OceanTwin();
		this.detail = new SeaDetail();
		this.foamTex = createFoamTexture( renderer.gl );
		this.systems = defaultSystems();
		// Tidewater's local sea runs 20 degrees off its swell; ours blows with the trades (G.uWind)
		const wd = G.uWind.value;
		this.windDeg = Math.atan2( wd.y, wd.x ) * 180 / Math.PI;
		this.systems.local.windDirection = this.windDeg;
		this.systems.swell.windDirection = this.windDeg - 20;
		this.sea = null; // the applied sea preset
		this._build();
		this.bathy = makeBathyTexture( hf, this.seaMask );
		this.bathyRect = new THREE.Vector4( hf.x0 - hf.CS / 2, hf.z0 - hf.CS / 2, hf.CS * hf.cnx, hf.CS * hf.cnz );
		this._applySea( true );
	}

	_build() {
		const Q = QUALITY[ this.quality ];
		if ( this.fft ) this.fft.dispose();
		this.fft = new OceanFFT( this.r.gl, this.sizes, Q.fft );
		if ( this.sea ) { this.fft.setSpectrum( this.P ); this._setFoam(); }
		this.cdlod = new CDLOD( { gridSize: Q.grid, leafSize: 8, levels: 14, minY: - 25, maxY: 25 } );
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
			};
		}
		this.mat = mat;
	}

	_material( Q ) {
		const S = waterSurfaceGLSL( { sizes: this.sizes, fftSize: Q.fft, fragCascades: Q.fragCascades, detail: true, nearRipples: Q.nearRipples } );
		const mat = new THREE.ShaderMaterial( {
			name: 'Ocean',
			uniforms: Object.assign( waterShadeUniforms( THREE ), {
				uOceanDisp: { value: null }, uOceanDeriv: { value: null }, uOceanFoamBias: { value: 0.58 },
				uWaterAmp: { value: 1 }, uFoamCoverage: { value: 1 }, uFoamScale: { value: 0.09 }, uFoamTex: { value: this.foamTex },
				uCdlodMorph: { value: this.cdlod.morph },
				uLocalH: { value: this.tile.texture }, uLocalRect: { value: this.tile.rect }, uLocalOn: { value: 0 },
				uBathy: { value: this.bathy || null }, uBathyRect: { value: this.bathyRect || new THREE.Vector4() },
				uSeaDetail: { value: this.detail.texture }, uSeaDetailOffset: { value: this.detail.offset }, uSeaDetailAmt: { value: this.detail.amount },
				uSeaWindDir: { value: new THREE.Vector2( 1, 0 ) }, uSeaWindSpeed: { value: 7 },
			}, G ),
			defines: { REVERSED: this.r.reversed ? 1 : 0, LOGDEPTH: this.r.logDepth ? 1 : 0 },
			vertexShader: /* glsl */`
				uniform float uWaterLevel;
				attribute vec4 nodeData;
				varying vec3 vWorld; varying vec2 vLagXZ; varying float vWaveH; varying float vSeaDepth; varying float vFoamV;
				varying vec3 vShoreNv; varying float vShoreFoamV; varying vec2 vSurfMaskV;
				${ this.cdlod.glsl }
				${ GROUND_GLSL }
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
					gl_Position = projectionMatrix * viewMatrix * vec4( r.position, 1.0 );
				}`,
			fragmentShader: /* glsl */`
				uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
				uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
				uniform float uWet; uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK;
				uniform vec2 uWind; uniform float uNight; uniform float uUnderwater; uniform float uWaterLevel;
				varying vec3 vWorld; varying vec2 vLagXZ; varying float vWaveH; varying float vSeaDepth; varying float vFoamV;
				varying vec3 vShoreNv; varying float vShoreFoamV; varying vec2 vSurfMaskV;
				${ COMMON_GLSL }
				${ GROUND_GLSL }
				${ WATER_HELPERS_GLSL }
				${ SEA_DETAIL_GLSL }
				${ S.fragment }
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
					${ waterShadeGLSL( { SSR: Q.ssr } ) }
					// only sea connected to the open ocean (no pools in dips behind the dunes)
					if ( textureLod( uBathy, ( pos.xz - uBathyRect.xy ) / uBathyRect.zw, 0.0 ).g < 0.5 ) discard;
					if ( seenFromBelow < 0.5 ) outCol = atmosphereFog( outCol, pos );
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

	// weather sea state -> Tidewater's sea presets (wind, fetch, choppiness, swell, whitecaps)
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
	}

	// Tidewater ui/AppUI.js whitecaps(): foam starts at less compression in fresh wind, lasts longer
	_setFoam() {
		const p = this.sea, F = this.fft.params;
		F.choppiness = p.chop;
		F.foamBias = 0.5 + 0.16 * p.whitecaps + 0.01 * Math.min( 12, Math.max( - 5, p.wind - 7 ) );
		F.foamDecay = 0.6 - 0.35 * p.whitecaps;
	}

	update( dt, camera, sceneColor, sceneDepth, viewport ) {
		this.time += dt;
		this._applySea();
		const p = this.sea;
		this.fft.update( this.time, dt );
		this.twin.request( this.time, p.chop );
		this.tile.update( camera.position );
		this.cdlod.update( camera );
		const wd = G.uWind.value;
		this.detail.update( dt, wd, p.wind );
		const u = this.mat.uniforms;
		u.uOceanDisp.value = this.fft.disp;
		u.uOceanDeriv.value = this.fft.deriv;
		u.uOceanFoamBias.value = this.fft.params.foamBias;
		u.uLocalH.value = this.tile.texture;
		u.uLocalOn.value = this.tile.on;
		u.uBathy.value = this.bathy;
		u.uBathyRect.value = this.bathyRect;
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

	// the ground under the sea (the fine tile, else the coarse bathymetry), as the shaders see it
	groundAt( x, z ) { return this.tile.groundAt( x, z ); }

	// CPU twin of the rendered surface (Tidewater WaterQuery.waterQueryHeightAtXZ): the FFT displacement is
	// Lagrangian (x0 -> x0 + D( x0 )), so solve x0 + D( x0 ) = xz with two fixed-point steps. -1000 where
	// there is no sea (inland dips).
	heightAt( x, z, t = this.time ) {
		if ( seaMaskAt( this.hf, this.seaMask, x, z ) < 0.5 ) return - 1000;
		const ground = this.tile.groundAt( x, z );
		const depth = - ground;
		const att = cascadeAttenuation( this.attParams, depth, this._att );
		let y = 0;
		if ( att[ 0 ] > 0 || att[ 1 ] > 0 || att[ 2 ] > 0 ) {
			const N = QUALITY[ this.quality ].fft;
			let x0 = x, z0 = z;
			for ( let i = 0; i < 2; i ++ ) {
				const d = this.twin.disp( x0, z0, t, att, this.sizes, N, this._d );
				x0 = x - d[ 0 ]; z0 = z - d[ 2 ];
			}
			y = this.twin.disp( x0, z0, t, att, this.sizes, N, this._d )[ 1 ];
		}
		// hide the water sheet below dry land (as the vertex shader does)
		if ( y < ground ) y = Math.min( y, depth < - 3 ? Math.min( ground - 2, - 1 ) : ground - 0.06 );
		return y;
	}

	dispose() {
		this.fft.dispose();
		this.twin.dispose();
		this.tile.dispose();
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
	return t;
}
