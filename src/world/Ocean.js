// The Pacific: a camera-centred polar grid with Gerstner swell, shaded with Tidewater's water model
// (ocean/waterShade.js: exact Fresnel, SSR, GGX glitter, the Snell-refracted water column). Only sea
// connected to the open ocean is drawn (ocean/seaMask.js). The same wave sum runs on the CPU for
// swimming and boats.
import * as THREE from 'three';
import { G, COMMON_GLSL } from '../render/Materials.js';
import { LAYER_POST } from '../render/Renderer.js';
import { buildSeaMask, seaMaskAt } from './ocean/seaMask.js';
import { waterShadeUniforms, WATER_HELPERS_GLSL, WATER_SHADE_GLSL, FOAM_LIGHT_SIMPLE } from './ocean/waterShade.js';

const TAU = Math.PI * 2;
// polar grid: segments around, first ring spacing, growth per ring
const GRID = { low: { seg: 128, dr: 0.8, grow: 1.06 }, medium: { seg: 176, dr: 0.6, grow: 1.05 }, high: { seg: 224, dr: 0.5, grow: 1.045 } };
const WQ = { low: 0, medium: 1, high: 2 };

export class Ocean {
	constructor( renderer, hf, quality = 'high' ) {
		this.r = renderer;
		this.hf = hf;
		this.seaState = 0.5; // 0 calm .. 1 storm
		this.time = 0;
		this.waves = makeWaves();
		this.quality = GRID[ quality ] ? quality : 'high';
		this.seaMask = buildSeaMask( hf );
		this.mesh = new THREE.Mesh( buildPolarGrid( GRID[ this.quality ] ), this._material() );
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
		const u = this.mat.uniforms;
		u.uBathy.value = makeBathyTexture( hf, this.seaMask );
		u.uBathyRect.value.set( hf.x0 - hf.CS / 2, hf.z0 - hf.CS / 2, hf.CS * hf.cnx, hf.CS * hf.cnz );
	}

	_material() {
		const W = this.waves;
		const mat = new THREE.ShaderMaterial( {
			name: 'Ocean',
			uniforms: Object.assign( waterShadeUniforms( THREE ), {
				uWaveDir: { value: W.map( w => new THREE.Vector2( w.dx, w.dz ) ) }, uWaveK: { value: W.map( w => w.k ) }, uWaveA: { value: W.map( w => w.a ) },
				uWaveW: { value: W.map( w => w.w ) }, uWaveP: { value: W.map( w => w.p ) }, uSea: { value: 0.5 }, uWTime: { value: 0 },
				uDetail: { value: makeDetailNormals() }, uBathy: { value: null }, uBathyRect: { value: new THREE.Vector4() },
				uSlopeScale: { value: 1 },
			}, G ),
			defines: { NW: W.length, REVERSED: this.r.reversed ? 1 : 0, LOGDEPTH: this.r.logDepth ? 1 : 0, WQ: WQ[ this.quality ] },
			vertexShader: /* glsl */`
				uniform vec2 uWaveDir[ NW ]; uniform float uWaveK[ NW ]; uniform float uWaveA[ NW ]; uniform float uWaveW[ NW ]; uniform float uWaveP[ NW ];
				uniform float uSea; uniform float uWTime; uniform sampler2D uBathy; uniform vec4 uBathyRect; uniform vec3 uCamPos;
				varying vec3 vWorld; varying vec3 vN; varying float vFoam; varying float vDepth; varying float vSurf; varying vec2 vLagXZ; varying float vWaveH; varying float vJac;
				vec2 bathyAt( vec2 xz ) { return texture2D( uBathy, ( xz - uBathyRect.xy ) / uBathyRect.zw ).rg; }
				void main() {
					vec3 p = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
					vec2 xz0 = p.xz;
					float dist = length( xz0 - uCamPos.xz );
					float depth = -bathyAt( xz0 ).r;
					vDepth = depth;
					// waves shrink in shallow water and far away (where the grid is coarse)
					float att = smoothstep( 0.0, 3.0, depth ) * 0.8 + 0.2;
					float far = 1.0 - smoothstep( 1500.0, 5000.0, dist );
					vec3 disp = vec3( 0.0 );
					vec3 dx = vec3( 1.0, 0.0, 0.0 ), dz = vec3( 0.0, 0.0, 1.0 );
					float jac = 1.0;
					for ( int i = 0; i < NW; i ++ ) {
						float k = uWaveK[ i ], a = uWaveA[ i ] * uSea * att * far;
						// short waves fade first with distance
						a *= 1.0 - smoothstep( 40.0 / k, 160.0 / k, dist );
						vec2 d = uWaveDir[ i ];
						float ph = k * dot( d, xz0 ) - uWaveW[ i ] * uWTime + uWaveP[ i ];
						float s = sin( ph ), c = cos( ph );
						float q = 0.55 / ( k * a * float( NW ) + 1e-4 );
						q = min( q, 1.0 );
						disp.xz += q * a * d * c;
						disp.y += a * s;
						float wa = k * a;
						dx += vec3( -q * d.x * d.x * wa * s, d.x * wa * c, -q * d.x * d.y * wa * s );
						dz += vec3( -q * d.x * d.y * wa * s, d.y * wa * c, -q * d.y * d.y * wa * s );
						jac -= q * wa * s;
					}
					// surf: crests running up the depth contours towards the shore
					float surf = 0.0;
					if ( depth < 4.0 && depth > -0.5 ) {
						float ph = depth * 2.1 + uWTime * 0.9;
						float env = smoothstep( 4.0, 1.2, depth ) * smoothstep( -0.1, 0.35, depth );
						float crest = pow( 0.5 + 0.5 * sin( ph * 3.14159 ), 3.0 );
						surf = crest * env;
						disp.y += surf * ( 0.18 + 0.25 * uSea ) * far;
					}
					vSurf = surf;
					p += disp;
					vN = normalize( cross( dz, dx ) );
					vFoam = clamp( ( 0.55 - jac ) * 1.8, 0.0, 1.0 ) * uSea;
					vJac = jac;
					vLagXZ = xz0;
					vWaveH = disp.y;
					vWorld = p;
					gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
				}`,
			fragmentShader: /* glsl */`
				uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
				uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
				uniform float uWet; uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK;
				uniform vec2 uWind; uniform float uNight; uniform float uUnderwater; uniform float uWaterLevel;
				uniform sampler2D uDetail; uniform float uSea; uniform float uWTime; uniform float uSlopeScale;
				uniform sampler2D uBathy; uniform vec4 uBathyRect;
				varying vec3 vWorld; varying vec3 vN; varying float vFoam; varying float vDepth; varying float vSurf; varying vec2 vLagXZ; varying float vWaveH; varying float vJac;
				${COMMON_GLSL}
				${WATER_HELPERS_GLSL}
				#define WATER_FOAM_LIGHT ${FOAM_LIGHT_SIMPLE}
				struct WaterSurfaceFrag { vec3 normal; float foam; float rough; float aeration; float jacobian; };
				// seabed height under the refracted ray: the opaque scene behind the water there
				// (the scene seen through the projection of p, if it lies under the water behind the surface)
				float waterGroundAt( vec3 p, float fallback, float surfViewZ, float surfY ) {
					vec2 uv = waterProject( ( viewMatrix * vec4( p, 1.0 ) ).xyz );
					if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return fallback;
					float d = waterSceneDepthAt( uv );
					if ( waterIsSky( d ) ) return fallback;
					vec3 q = waterViewPos( uv, - waterViewDepth( d ) );
					float y = ( uCamWorld * vec4( q, 1.0 ) ).y;
					return q.z < surfViewZ - WATER_BEHIND && y < surfY ? y : fallback;
				}
				void main() {
					// only sea connected to the open ocean (no pools in dips behind the dunes)
					if ( texture2D( uBathy, ( vWorld.xz - uBathyRect.xy ) / uBathyRect.zw ).g < 0.5 ) discard;
					vec3 pos = vWorld;
					vec2 lagXZ = vLagXZ;
					float vHeight = vWaveH;
					// footprint of this pixel on the surface (m), for filtering / roughness
					float footprint = max( length( fwidth( lagXZ ) ), 1e-4 );
					float seenFromBelow = 0.0;

					// ---- surface: swell + two scrolling ripple layers, flattened with distance
					float distS = length( uCamPos - pos );
					vec3 Ns = normalize( vN );
					float fd = 1.0 - smoothstep( 80.0, 900.0, distS );
					vec2 w1 = pos.xz / 9.0 + uWind * uWTime * 0.05;
					vec2 w2 = pos.xz / 3.1 - uWind.yx * uWTime * 0.08;
					vec3 d1 = texture2D( uDetail, w1 ).xyz * 2.0 - 1.0;
					vec3 d2 = texture2D( uDetail, w2 * vec2( 1.0, -1.0 ) + 0.37 ).xyz * 2.0 - 1.0;
					vec2 dn = ( d1.xy * 0.6 + d2.xy * 0.4 ) * ( 0.35 + uSea * 0.5 ) * fd;
					WaterSurfaceFrag surf;
					surf.normal = normalize( Ns + vec3( dn.x, 0.0, dn.y ) );
					float fn = vnoise2( pos.xz * 0.9 + uWTime * 0.25 ) * 0.6 + vnoise2( pos.xz * 2.7 - uWTime * 0.4 ) * 0.4;
					float fm = max( smoothstep( 0.45, 0.9, vSurf ) * smoothstep( 0.35, 0.8, fn ), vFoam * smoothstep( 0.4, 0.8, fn ) );
					surf.foam = clamp( fm, 0.0, 1.0 ) * 0.85;
					surf.rough = 1.0;
					surf.aeration = 0.0;
					surf.jacobian = vJac;

					// seabed height seen through this pixel
					vec2 suv = gl_FragCoord.xy / uViewport;
					float sd = waterSceneDepthAt( suv );
					float groundH = -1e4;
					if ( ! waterIsSky( sd ) ) groundH = ( uCamWorld * vec4( waterViewPos( suv, - waterViewDepth( sd ) ), 1.0 ) ).y;

					${WATER_SHADE_GLSL}

					if ( seenFromBelow < 0.5 ) outCol = atmosphereFog( outCol, pos );
					gl_FragColor = vec4( outCol, 1.0 );
				}`,
			side: THREE.DoubleSide, depthWrite: true,
		} );
		this.mat = mat;
		return mat;
	}

	// 'low' | 'medium' | 'high': grid density, screen-space reflections
	setQuality( q ) {
		if ( ! GRID[ q ] || q === this.quality ) return;
		this.quality = q;
		this.mesh.geometry.dispose();
		this.mesh.geometry = buildPolarGrid( GRID[ q ] );
		this.mat.defines.WQ = WQ[ q ];
		this.mat.needsUpdate = true;
	}

	update( dt, camera, sceneColor, sceneDepth, viewport ) {
		this.time += dt;
		const u = this.mat.uniforms;
		u.uWTime.value = this.time;
		u.uSea.value = 0.35 + this.seaState * 1.1;
		// wind speed at 10 m (m/s) for the Cox-Munk slope variance
		u.uWindU.value = 3 + this.seaState * 12;
		u.uSceneColor.value = sceneColor;
		u.uSceneDepth.value = sceneDepth;
		u.uViewport.value.copy( viewport );
		u.uCamFar.value = camera.far;
		u.uProj.value.copy( camera.projectionMatrix );
		u.uCamWorld.value.copy( camera.matrixWorld );
		const wh = this.heightAt( camera.position.x, camera.position.z );
		u.uCamWaterH.value = wh;
		G.uUnderwater.value = camera.position.y < wh ? 1 : 0;
		this.mesh.position.set( camera.position.x, 0, camera.position.z );
		this.mesh.updateMatrix();
		this.mesh.updateMatrixWorld();
	}

	// CPU twin of the vertex shader (vertical part) for swimming, boats and splashes; -1000 where there is
	// no sea (inland dips)
	heightAt( x, z, t = this.time ) {
		if ( seaMaskAt( this.hf, this.seaMask, x, z ) < 0.5 ) return - 1000;
		const depth = - this.hf.coarseBilinear( x, z );
		const att = smooth( 0, 3, depth ) * 0.8 + 0.2;
		const sea = 0.35 + this.seaState * 1.1;
		let y = 0;
		for ( const w of this.waves ) {
			const a = w.a * sea * att;
			y += a * Math.sin( w.k * ( w.dx * x + w.dz * z ) - w.w * t + w.p );
		}
		if ( depth < 4 && depth > - 0.5 ) {
			const ph = depth * 2.1 + t * 0.9;
			const env = smooth( 4, 1.2, depth ) * smooth( - 0.1, 0.35, depth );
			y += Math.pow( 0.5 + 0.5 * Math.sin( ph * Math.PI ), 3 ) * env * ( 0.18 + 0.25 * sea );
		}
		return y;
	}
}

function smooth( a, b, x ) { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); }

function makeWaves() {
	const base = Math.atan2( 0.47, - 0.88 ); // travelling towards the west-south-west with the trades
	const Ls = [ 46, 31, 21, 14.5, 9.6, 6.4, 4.3, 2.9 ];
	const spread = [ 0.05, - 0.32, 0.4, - 0.6, 0.75, - 0.2, 0.95, - 0.85 ];
	return Ls.map( ( L, i ) => {
		const ang = base + spread[ i ];
		const k = TAU / L;
		return { dx: Math.cos( ang ), dz: Math.sin( ang ), k, w: Math.sqrt( 9.81 * k ), a: L / ( 95 + i * 6 ), p: i * 1.7 };
	} );
}

function buildPolarGrid( { seg, dr: dr0, grow } = GRID.high ) {
	const radii = [ 0 ];
	let r = dr0, dr = dr0;
	while ( r < 60000 ) { radii.push( r ); if ( r > 12 ) dr *= grow; r += dr; }
	const pos = [], idx = [];
	pos.push( 0, 0, 0 );
	for ( let i = 1; i < radii.length; i ++ ) for ( let s = 0; s < seg; s ++ ) {
		const a = s / seg * TAU;
		pos.push( Math.cos( a ) * radii[ i ], 0, Math.sin( a ) * radii[ i ] );
	}
	for ( let s = 0; s < seg; s ++ ) idx.push( 0, 1 + ( s + 1 ) % seg, 1 + s );
	for ( let i = 1; i < radii.length - 1; i ++ ) for ( let s = 0; s < seg; s ++ ) {
		const a = 1 + ( i - 1 ) * seg + s, b = 1 + ( i - 1 ) * seg + ( s + 1 ) % seg;
		const c = a + seg, d = b + seg;
		idx.push( a, b, c, b, d, c );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	return g;
}

// tileable ripple normals from a sum of periodic waves
function makeDetailNormals() {
	const N = 256, h = new Float32Array( N * N );
	let seed = 7;
	const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const waves = [];
	for ( let i = 0; i < 40; i ++ ) {
		const kx = Math.round( ( rnd() - 0.5 ) * 24 ), ky = Math.round( ( rnd() - 0.5 ) * 24 );
		if ( kx === 0 && ky === 0 ) continue;
		const amp = 1 / Math.pow( Math.hypot( kx, ky ), 1.3 );
		waves.push( [ kx, ky, amp, rnd() * TAU ] );
	}
	for ( let y = 0; y < N; y ++ ) for ( let x = 0; x < N; x ++ ) {
		let s = 0;
		for ( const [ kx, ky, a, p ] of waves ) s += a * Math.sin( TAU * ( kx * x + ky * y ) / N + p );
		h[ y * N + x ] = s;
	}
	const data = new Uint8Array( N * N * 4 );
	for ( let y = 0; y < N; y ++ ) for ( let x = 0; x < N; x ++ ) {
		const hx = h[ y * N + ( x + 1 ) % N ] - h[ y * N + ( x - 1 + N ) % N ];
		const hy = h[ ( ( y + 1 ) % N ) * N + x ] - h[ ( ( y - 1 + N ) % N ) * N + x ];
		const nx = - hx * 2.2, ny = - hy * 2.2, nz = 1;
		const l = Math.hypot( nx, ny, nz );
		const i = ( y * N + x ) * 4;
		data[ i ] = ( nx / l * 0.5 + 0.5 ) * 255; data[ i + 1 ] = ( ny / l * 0.5 + 0.5 ) * 255; data[ i + 2 ] = ( nz / l * 0.5 + 0.5 ) * 255; data[ i + 3 ] = 255;
	}
	const t = new THREE.DataTexture( data, N, N, THREE.RGBAFormat );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.needsUpdate = true;
	return t;
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
	t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
	t.generateMipmaps = false;
	t.needsUpdate = true;
	return t;
}
