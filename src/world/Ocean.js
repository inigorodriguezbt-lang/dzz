// The Pacific: a camera-centred polar grid with Gerstner swell, surf lines that follow the depth
// contours onto the beaches, refraction and depth absorption from the opaque pass, sky reflections,
// sun glitter, shore foam and whitecaps. The same wave sum runs on the CPU for swimming and boats.
import * as THREE from 'three';
import { G, COMMON_GLSL } from '../render/Materials.js';
import { LAYER_POST } from '../render/Renderer.js';

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
		this.quality = quality;
		this.mesh = new THREE.Mesh( buildPolarGrid( GRID[ quality ] ), this._material() );
		this.mesh.frustumCulled = false;
		this.mesh.layers.set( LAYER_POST );
		this.mesh.renderOrder = 10;
		this.mesh.matrixAutoUpdate = false;
		this.bathy = makeBathyTexture( hf );
		this.mat.uniforms.uBathy.value = this.bathy;
		this.mat.uniforms.uBathyRect.value.set( hf.x0 - hf.CS / 2, hf.z0 - hf.CS / 2, hf.CS * hf.cnx, hf.CS * hf.cnz );
	}

	_material() {
		const W = this.waves;
		const mat = new THREE.ShaderMaterial( {
			name: 'Ocean',
			uniforms: Object.assign( {
				uSceneColor: { value: null }, uSceneDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uViewport: { value: new THREE.Vector2( 1, 1 ) },
				uWaveDir: { value: W.map( w => new THREE.Vector2( w.dx, w.dz ) ) }, uWaveK: { value: W.map( w => w.k ) }, uWaveA: { value: W.map( w => w.a ) },
				uWaveW: { value: W.map( w => w.w ) }, uWaveP: { value: W.map( w => w.p ) }, uSea: { value: 0.5 }, uWTime: { value: 0 },
				uDetail: { value: makeDetailNormals() }, uBathy: { value: null }, uBathyRect: { value: new THREE.Vector4() }, uEnv: { value: null },
				uCamFar: { value: 1 }, uUnder: { value: 0 },
			}, G ),
			defines: { NW: W.length, REVERSED: this.r.reversed ? 1 : 0 },
			vertexShader: /* glsl */`
				uniform vec2 uWaveDir[ NW ]; uniform float uWaveK[ NW ]; uniform float uWaveA[ NW ]; uniform float uWaveW[ NW ]; uniform float uWaveP[ NW ];
				uniform float uSea; uniform float uWTime; uniform sampler2D uBathy; uniform vec4 uBathyRect; uniform vec3 uCamPos;
				varying vec3 vWorld; varying vec3 vN; varying float vFoam; varying float vDepth; varying float vSurf; varying vec4 vClip;
				float bathyAt( vec2 xz ) { return texture2D( uBathy, ( xz - uBathyRect.xy ) / uBathyRect.zw ).r; }
				void main() {
					vec3 p = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
					vec2 xz0 = p.xz;
					float dist = length( xz0 - uCamPos.xz );
					float depth = -bathyAt( xz0 );
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
					vWorld = p;
					gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
					vClip = gl_Position;
				}`,
			fragmentShader: /* glsl */`
				uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
				uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
				uniform float uWet; uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK;
				uniform vec2 uWind; uniform float uNight; uniform float uUnderwater; uniform float uWaterLevel;
				uniform sampler2D uSceneColor; uniform sampler2D uSceneDepth; uniform mat4 uInvProj; uniform vec2 uViewport;
				uniform sampler2D uDetail; uniform float uSea; uniform float uWTime; uniform float uUnder;
				varying vec3 vWorld; varying vec3 vN; varying float vFoam; varying float vDepth; varying float vSurf; varying vec4 vClip;
				${COMMON_GLSL}
				vec3 viewPosFromDepth( vec2 uv, float d ) {
					#if REVERSED == 1
						vec4 v = uInvProj * vec4( uv * 2.0 - 1.0, d, 1.0 );
					#else
						vec4 v = uInvProj * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
					#endif
					return v.xyz / v.w;
				}
				void main() {
					vec2 suv = gl_FragCoord.xy / uViewport;
					vec3 V = uCamPos - vWorld;
					float dist = length( V );
					V /= dist;
					bool under = uUnder > 0.5;
					// normal: swell + two scrolling ripple layers, flattened with distance
					vec3 N = normalize( vN );
					float fd = 1.0 - smoothstep( 80.0, 900.0, dist );
					vec2 w1 = vWorld.xz / 9.0 + uWind * uWTime * 0.05;
					vec2 w2 = vWorld.xz / 3.1 - uWind.yx * uWTime * 0.08;
					vec3 d1 = texture2D( uDetail, w1 ).xyz * 2.0 - 1.0;
					vec3 d2 = texture2D( uDetail, w2 * vec2( 1.0, -1.0 ) + 0.37 ).xyz * 2.0 - 1.0;
					vec2 dn = ( d1.xy * 0.6 + d2.xy * 0.4 ) * ( 0.35 + uSea * 0.5 ) * fd;
					N = normalize( N + vec3( dn.x, 0.0, dn.y ) );
					if ( under ) N = -N;
					// water depth along the view ray from the opaque pass
					float sd = texture2D( uSceneDepth, suv ).r;
					vec3 vpS = viewPosFromDepth( suv, sd );
					vec4 vpW4 = uInvProj * vec4( vClip.xy / vClip.w, 0.0, 1.0 );
					float sceneDist = length( vpS );
					#if REVERSED == 1
						bool sky = sd <= 0.0;
					#else
						bool sky = sd >= 1.0;
					#endif
					float thick = sky ? 1e4 : max( sceneDist - dist, 0.0 );
					// refraction: offset the scene lookup by the normal, less where the water is thin
					vec2 ruv = suv + N.xz * 0.04 * clamp( thick * 0.3, 0.0, 1.0 ) / max( 1.0, dist * 0.02 );
					float rd = texture2D( uSceneDepth, ruv ).r;
					if ( length( viewPosFromDepth( ruv, rd ) ) < dist ) ruv = suv; // don't pull in things in front
					vec3 refr = texture2D( uSceneColor, ruv ).rgb;
					// absorption and scattering in the water column (tropical: red goes first)
					float colDepth = min( thick, 200.0 );
					vec3 sigma = vec3( 0.46, 0.085, 0.062 ) * 1.6;
					vec3 trans = exp( -sigma * colDepth );
					float dayL = max( uSunColor.g, 0.0 );
					vec3 deep = vec3( 0.004, 0.035, 0.085 ) * ( 0.25 + dayL * 0.55 );
					vec3 shallowTint = vec3( 0.05, 0.28, 0.28 ) * ( 0.2 + dayL * 0.4 );
					vec3 scatter = mix( shallowTint, deep, smoothstep( 1.0, 12.0, colDepth ) );
					vec3 below = refr * trans + scatter * ( 1.0 - trans );
					// reflection: sky with a sun glint
					vec3 R = reflect( -V, N );
					R.y = abs( R.y );
					vec3 refl = texture2D( uSkyLUT, skyLutUv( normalize( R + vec3( 0.0, 0.02, 0.0 ) ) ) ).rgb;
					refl *= 1.0 - uCloudCover * 0.35;
					float F = 0.02 + 0.98 * pow( 1.0 - max( dot( N, V ), 0.0 ), 5.0 );
					if ( under ) F = clamp( 1.0 - dot( -V, vec3( 0, -1, 0 ) ) * 1.6, 0.0, 1.0 ) ;
					vec3 Hh = normalize( V + normalize( uSunDir ) );
					float rough = 0.02 + ( 1.0 - fd ) * 0.06 + uSea * 0.03;
					float NdH = max( dot( N, Hh ), 0.0 );
					float a2 = rough * rough;
					float dd = NdH * NdH * ( a2 - 1.0 ) + 1.0;
					float spec = a2 / ( 3.14159 * dd * dd ) * 0.25;
					float cs = cloudShadowAt( vWorld );
					vec3 col;
					if ( under ) {
						col = mix( below, vec3( 0.02, 0.12, 0.14 ) * dayL, F );
					} else {
						col = mix( below, refl, F ) + uSunColor * spec * F * cs * step( 0.0, normalize( uSunDir ).y );
					}
					// foam: shore wash, surf crests, whitecaps
					float fn = vnoise2( vWorld.xz * 0.9 + uWTime * 0.25 ) * 0.6 + vnoise2( vWorld.xz * 2.7 - uWTime * 0.4 ) * 0.4;
					float shore = ( 1.0 - smoothstep( 0.0, 0.35 + fn * 0.25, colDepth ) ) * step( 0.0, colDepth ) * ( sky ? 0.0 : 1.0 );
					float foam = max( shore * 0.9, smoothstep( 0.45, 0.9, vSurf ) * smoothstep( 0.35, 0.8, fn ) );
					foam = max( foam, vFoam * smoothstep( 0.4, 0.8, fn ) );
					vec3 foamC = vec3( 0.9, 0.95, 0.95 ) * ( uSunColor * max( normalize( uSunDir ).y, 0.0 ) * 0.28 + texture2D( uSkyLUT, vec2( 0.5, 0.9 ) ).rgb * 0.9 );
					col = mix( col, foamC, clamp( foam, 0.0, 1.0 ) * 0.85 );
					if ( ! under ) col = atmosphereFog( col, vWorld );
					// the edge against the sand: fade in over the first centimetres
					float alpha = sky ? 1.0 : smoothstep( 0.0, 0.06, colDepth );
					gl_FragColor = vec4( col, alpha );
				}`,
			transparent: true, depthWrite: true, side: THREE.DoubleSide,
		} );
		this.mat = mat;
		return mat;
	}

	// 'low' | 'medium' | 'high': grid density, ripple layers and refraction
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
		u.uSceneColor.value = sceneColor;
		u.uSceneDepth.value = sceneDepth;
		u.uInvProj.value.copy( camera.projectionMatrixInverse );
		u.uViewport.value.copy( viewport );
		u.uUnder.value = camera.position.y < this.heightAt( camera.position.x, camera.position.z ) ? 1 : 0;
		this.mesh.position.set( camera.position.x, 0, camera.position.z );
		this.mesh.updateMatrix();
		this.mesh.updateMatrixWorld();
	}

	// CPU twin of the vertex shader (vertical part) for swimming, boats and splashes
	heightAt( x, z, t = this.time ) {
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

// the coarse heights as a half-float texture for depth lookups in the water shader
function makeBathyTexture( hf ) {
	const W = hf.cnx, H = hf.cnz;
	const data = new Uint16Array( W * H );
	for ( let i = 0; i < W * H; i ++ ) data[ i ] = THREE.DataUtils.toHalfFloat( Math.max( - 2000, hf.coarse[ i ] * hf.iq ) );
	const t = new THREE.DataTexture( data, W, H, THREE.RedFormat, THREE.HalfFloatType );
	t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
	t.generateMipmaps = false;
	t.needsUpdate = true;
	return t;
}
