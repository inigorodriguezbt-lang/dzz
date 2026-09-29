// Sky: a sky-view LUT from the atmosphere model, a raymarched cumulus layer at quarter resolution,
// the sun, moon and stars, the image-based lighting (PMREM of the sky) and the sun / moon lights.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ATMOS_GLSL, transmittanceCPU, sunDirection } from '../render/Atmosphere.js';
import { G, COMMON_GLSL } from '../render/Materials.js';
import { FS_VERT } from '../render/Renderer.js';

const CLOUD_BASE = 900, CLOUD_TOP = 1900;

const SHARED_PARS = /* glsl */`
	uniform float uTime; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
	uniform sampler2D uSkyLUT; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost;
	uniform float uWet; uniform float uCloudCover; uniform vec2 uCloudOffset; uniform float uCloudShadowK;
	uniform vec2 uWind; uniform float uNight; uniform float uUnderwater; uniform float uWaterLevel;
`;

const CLOUD_GLSL = /* glsl */`
	const float CB = ${CLOUD_BASE.toFixed( 1 )}, CT = ${CLOUD_TOP.toFixed( 1 )};
	float cloudDensity( vec3 p, bool detail ) {
		float h = ( p.y - CB ) / ( CT - CB );
		if ( h < 0.0 || h > 1.0 ) return 0.0;
		vec2 q = ( p.xz + uCloudOffset ) / 2600.0;
		float base = fbm2( q ) * 0.7 + fbm2( q * 3.1 + 5.2 ) * 0.3;
		float cov = 1.0 - uCloudCover;
		float d = base - cov;
		if ( d < -0.08 ) return 0.0;
		// rounded cumulus: wide bases, tops that climb where the cloud is dense
		float top = 0.35 + clamp( d * 3.0, 0.0, 0.65 );
		float prof = smoothstep( 0.0, 0.08, h ) * ( 1.0 - smoothstep( top * 0.6, top, h ) );
		d = d * 3.0 * prof;
		if ( detail ) {
			vec3 w = p + vec3( uCloudOffset.x, 0.0, uCloudOffset.y ) * 1.3;
			float n = vnoise2( w.xz / 210.0 + w.y / 173.0 ) * 0.55 + vnoise2( w.zx / 83.0 - w.y / 97.0 ) * 0.3 + vnoise2( w.xz / 31.0 + w.y / 41.0 ) * 0.15;
			d -= ( n - 0.25 ) * 0.28 * ( 1.0 - h * 0.3 );
		}
		return clamp( d, 0.0, 1.0 ) * 0.045;
	}
`;

export class Sky {
	constructor( renderer, settings ) {
		this.r = renderer;
		this.settings = settings;
		this.hour = 9;
		this.day = 120;
		this.sunDir = new THREE.Vector3();
		this.moonDir = new THREE.Vector3();
		this.sunColor = new THREE.Color();
		this.ambient = new THREE.Color();
		this.haze = 1;
		this.cloudCover = 0.34;
		this.cloudOffset = new THREE.Vector2( 0, 0 );

		// ---- sky-view LUT ----
		this.lut = new THREE.WebGLRenderTarget( 256, 128, { type: THREE.HalfFloatType, depthBuffer: false } );
		this.lut.texture.wrapS = THREE.RepeatWrapping;
		this.lut.texture.minFilter = this.lut.texture.magFilter = THREE.LinearFilter;
		this.lut.texture.generateMipmaps = false;
		G.uSkyLUT.value = this.lut.texture;
		this.lutPass = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'SkyLUT',
			uniforms: { uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() }, uAlt: { value: 0 }, uHaze: { value: 1 }, uMoonI: { value: 0 } },
			vertexShader: FS_VERT,
			fragmentShader: /* glsl */`
				uniform vec3 uSun; uniform vec3 uMoon; uniform float uAlt; uniform float uHaze; uniform float uMoonI; varying vec2 vUv;
				${ATMOS_GLSL}
				void main() {
					float az = ( vUv.x - 0.5 ) * 6.2831853;
					float s = vUv.y * 2.0 - 1.0;
					float el = sign( s ) * s * s * 1.5707963;
					vec3 d = vec3( sin( az ) * cos( el ), sin( el ), -cos( az ) * cos( el ) );
					vec3 c = atmSky( d, uSun, uAlt, uHaze, 22.0 );
					c += atmSky( d, uMoon, uAlt, uHaze, 22.0 ) * uMoonI;
					// night sky floor (airglow / starlight)
					c += vec3( 0.0009, 0.0013, 0.0024 ) * ( 0.6 + 0.4 * max( d.y, 0.0 ) );
					gl_FragColor = vec4( c, 1.0 );
				}`,
			depthTest: false, depthWrite: false,
		} ) );

		// ---- clouds (quarter resolution) ----
		this.cloudRT = new THREE.WebGLRenderTarget( 4, 4, { type: THREE.HalfFloatType, depthBuffer: false } );
		this.cloudRT.texture.minFilter = this.cloudRT.texture.magFilter = THREE.LinearFilter;
		this.cloudRT.texture.generateMipmaps = false;
		this.cloudPass = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'Clouds',
			uniforms: Object.assign( {
				uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uFrame: { value: 0 },
				uAmbTop: { value: new THREE.Color() }, uAmbBottom: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3() }, uMoonColor: { value: new THREE.Color() },
			}, G ),
			vertexShader: FS_VERT,
			fragmentShader: /* glsl */`
				${SHARED_PARS}
				uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform float uFrame;
				uniform vec3 uAmbTop; uniform vec3 uAmbBottom; uniform vec3 uMoonDir; uniform vec3 uMoonColor;
				varying vec2 vUv;
				${COMMON_GLSL}
				${CLOUD_GLSL}
				float hg( float mu, float g ) { float g2 = g * g; return ( 1.0 - g2 ) / ( 12.566 * pow( 1.0 + g2 - 2.0 * g * mu, 1.5 ) ); }
				void main() {
					vec4 vp = uInvProj * vec4( vUv * 2.0 - 1.0, 0.5, 1.0 );
					vec3 rd = normalize( ( uCamWorld * vec4( normalize( vp.xyz / vp.w ), 0.0 ) ).xyz );
					vec3 ro = uCamPos;
					float t0, t1;
					if ( rd.y > 0.0 ) { t0 = max( 0.0, ( CB - ro.y ) / rd.y ); t1 = ( CT - ro.y ) / rd.y; }
					else if ( rd.y < 0.0 && ro.y > CB ) { t0 = max( 0.0, ( CT - ro.y ) / rd.y ); t1 = ( CB - ro.y ) / rd.y; }
					else { gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); return; }
					t1 = min( t1, 60000.0 );
					if ( t1 <= t0 ) { gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); return; }
					const int STEPS = 36;
					float seg = ( t1 - t0 ) / float( STEPS );
					float jit = hash12( gl_FragCoord.xy + uFrame * 7.13 );
					vec3 sun = normalize( uSunDir );
					bool moonLit = sun.y < -0.05;
					vec3 L = moonLit ? normalize( uMoonDir ) : sun;
					vec3 Lc = moonLit ? uMoonColor : uSunColor;
					float mu = dot( rd, L );
					float phase = mix( hg( mu, 0.6 ), hg( mu, -0.25 ), 0.3 ) * 2.2 + 0.08;
					float T = 1.0; vec3 S = vec3( 0.0 );
					for ( int i = 0; i < STEPS; i ++ ) {
						vec3 p = ro + rd * ( t0 + ( float( i ) + jit ) * seg );
						float d = cloudDensity( p, true );
						if ( d > 0.0 ) {
							// light march towards the sun
							float od = 0.0;
							for ( int k = 1; k <= 4; k ++ ) od += cloudDensity( p + L * float( k * k ) * 32.0, false ) * float( 2 * k - 1 ) * 32.0;
							float beer = exp( -od * 1.1 ) ;
							float powder = 1.0 - exp( -d * seg * 2.0 );
							float hf = clamp( ( p.y - CB ) / ( CT - CB ), 0.0, 1.0 );
							vec3 amb = mix( uAmbBottom, uAmbTop, hf );
							vec3 lum = Lc * beer * phase * mix( 1.0, powder * 2.0, 0.35 ) + amb;
							float a = exp( -d * seg );
							S += T * lum * ( 1.0 - a );
							T *= a;
							if ( T < 0.02 ) break;
						}
					}
					// fade into the haze with distance
					float fade = exp( -t0 / 42000.0 );
					gl_FragColor = vec4( S * fade, mix( 1.0, T, fade ) );
				}`,
			depthTest: false, depthWrite: false,
		} ) );

		// ---- sky dome: a full-screen triangle drawn where nothing else wrote depth ----
		const geo = new THREE.BufferGeometry();
		geo.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );
		this.domeMat = new THREE.ShaderMaterial( {
			name: 'SkyDome',
			uniforms: Object.assign( {
				uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uClouds: { value: this.cloudRT.texture },
				uMoonDir: { value: new THREE.Vector3() }, uMoonPhase: { value: 0.5 }, uStars: { value: 1 }, uCloudsOn: { value: 1 },
			}, G ),
			defines: { REVERSED: this.r.reversed ? 1 : 0 },
			vertexShader: /* glsl */`
				varying vec2 vNdc;
				void main() { vNdc = position.xy; gl_Position = vec4( position.xy, REVERSED == 1 ? 0.0 : 1.0, 1.0 ); }`,
			fragmentShader: /* glsl */`
				${SHARED_PARS}
				uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform sampler2D uClouds;
				uniform vec3 uMoonDir; uniform float uMoonPhase; uniform float uStars; uniform float uCloudsOn;
				varying vec2 vNdc;
				${COMMON_GLSL}
				vec3 starField( vec3 d ) {
					vec3 c = vec3( 0.0 );
					for ( int l = 0; l < 2; l ++ ) {
						float sc = l == 0 ? 180.0 : 420.0;
						vec3 p = d * sc;
						vec3 cell = floor( p );
						float h = hash12( cell.xy + cell.z * 17.31 );
						if ( h > 0.985 ) {
							vec3 cp = cell + 0.5 + ( vec3( hash12( cell.yz ), hash12( cell.zx ), hash12( cell.xy + 3.0 ) ) - 0.5 ) * 0.6;
							float r = length( p - cp );
							float tw = 0.7 + 0.3 * sin( uTime * ( 2.0 + h * 5.0 ) + h * 40.0 );
							c += mix( vec3( 0.7, 0.8, 1.0 ), vec3( 1.0, 0.85, 0.7 ), fract( h * 97.0 ) ) * smoothstep( 0.18, 0.0, r ) * ( h - 0.985 ) * 400.0 * tw * ( l == 0 ? 1.0 : 0.45 );
						}
					}
					return c * 0.004;
				}
				void main() {
					vec4 vp = uInvProj * vec4( vNdc, 0.5, 1.0 );
					vec3 d = normalize( ( uCamWorld * vec4( normalize( vp.xyz / vp.w ), 0.0 ) ).xyz );
					vec3 c = texture2D( uSkyLUT, skyLutUv( d ) ).rgb;
					vec3 s = normalize( uSunDir );
					// below the horizon the sea haze takes over
					float mu = dot( d, s );
					float disk = smoothstep( 0.99995, 0.999985, mu );
					c += uSunColor * disk * 60.0;
					c += uSunColor * pow( max( mu, 0.0 ), 900.0 ) * 1.6;
					// moon and stars
					float night = uNight;
					vec3 m = normalize( uMoonDir );
					float mm = dot( d, m );
					if ( mm > 0.9995 && m.y > -0.05 ) {
						vec3 tx = normalize( cross( m, vec3( 0, 1, 0 ) ) ), ty = cross( tx, m );
						vec2 q = vec2( dot( d - m, tx ), dot( d - m, ty ) ) / 0.0316;
						float rr = length( q );
						if ( rr < 1.0 ) {
							float z = sqrt( 1.0 - rr * rr );
							float lit = clamp( dot( normalize( vec3( q, z ) ), normalize( vec3( sin( uMoonPhase * 6.2831 ), 0.0, -cos( uMoonPhase * 6.2831 ) ) ) ) * 4.0, 0.0, 1.0 );
							float maria = 0.75 + 0.25 * vnoise2( q * 3.0 + 4.0 );
							c += vec3( 0.95, 0.93, 0.88 ) * lit * maria * 1.4 * smoothstep( 1.0, 0.96, rr );
						}
					}
					c += vec3( 0.55, 0.62, 0.8 ) * pow( max( mm, 0.0 ), 400.0 ) * 0.06 * night;
					c += starField( d ) * night * uStars * smoothstep( -0.02, 0.15, d.y );
					// clouds
					if ( uCloudsOn > 0.5 ) {
						vec4 cl = texture2D( uClouds, gl_FragCoord.xy / vec2( textureSize( uClouds, 0 ) ) * 0.25 );
						c = c * cl.a + cl.rgb;
					}
					// the horizon band fades into the fog colour so distant islands and sky meet
					float hz = 1.0 - smoothstep( -0.02, 0.06, d.y );
					vec3 hv = normalize( vec3( d.x, 0.035, d.z ) );
					c = mix( c, texture2D( uSkyLUT, skyLutUv( hv ) ).rgb * 0.95, hz * 0.8 );
					gl_FragColor = vec4( c, 1.0 );
				}`,
			depthTest: true, depthWrite: false,
		} );
		this.dome = new THREE.Mesh( geo, this.domeMat );
		this.dome.frustumCulled = false;
		this.dome.renderOrder = 1000;

		// ---- environment lighting ----
		this.pmrem = new THREE.PMREMGenerator( this.r.gl );
		this.envScene = new THREE.Scene();
		const envMat = new THREE.ShaderMaterial( {
			uniforms: Object.assign( {}, G ),
			vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
			fragmentShader: /* glsl */`
				${SHARED_PARS}
				varying vec3 vDir;
				${COMMON_GLSL}
				void main() {
					vec3 d = normalize( vDir );
					vec3 c = texture2D( uSkyLUT, skyLutUv( vec3( d.x, max( d.y, 0.02 ), d.z ) ) ).rgb;
					// ground: a warm bounce from sunlit land / sea
					float g = smoothstep( 0.05, -0.15, d.y );
					vec3 ground = uSunColor * max( normalize( uSunDir ).y, 0.0 ) * vec3( 0.16, 0.15, 0.12 ) + c * 0.25;
					c = mix( c, ground, g );
					// overcast greys the sky dome
					c = mix( c, vec3( dot( c, vec3( 0.3, 0.5, 0.2 ) ) ) * 1.1, uCloudCover * 0.45 );
					gl_FragColor = vec4( c, 1.0 );
				}`,
			side: THREE.BackSide, depthWrite: false,
		} );
		this.envScene.add( new THREE.Mesh( new THREE.SphereGeometry( 10, 32, 16 ), envMat ) );
		this.envTarget = null;
		this.envAge = 1e9;
		this.lastEnvSun = new THREE.Vector3( 0, - 2, 0 );

		// ---- lights ----
		this.ambientLight = new THREE.HemisphereLight( 0xbfd8ff, 0x3a3020, 0.0 );
		this.frame = 0;
		this.lutAge = 1e9;
	}

	resize( w, h ) {
		this.cloudRT.setSize( Math.max( 1, w >> 2 ), Math.max( 1, h >> 2 ) );
	}

	// hour 0..24; updates directions and colours
	setTime( hour, day ) {
		this.hour = hour; this.day = day;
		sunDirection( hour, day, 20.5, this.sunDir );
		// the moon: roughly opposite, shifted by the phase through a 29.5-day cycle
		const phase = ( day % 29.53 ) / 29.53;
		this.moonPhase = phase;
		sunDirection( ( hour + 12 + phase * 24 ) % 24, day + 7, 20.5, this.moonDir );
	}

	update( dt, camera, scene, settings ) {
		this.frame ++;
		const s = this.sunDir;
		// light colours from the CPU atmosphere
		const alt = Math.max( 0, camera.position.y ) * 6; // real metres
		const tr = transmittanceCPU( alt, s, this.haze );
		const dayF = THREE.MathUtils.smoothstep( s.y, - 0.12, 0.08 );
		this.sunColor.setRGB( tr.x, tr.y, tr.z ).multiplyScalar( 3.4 * dayF );
		const night = 1 - THREE.MathUtils.smoothstep( s.y, - 0.2, 0.02 );
		this.night = night;
		const moonUp = THREE.MathUtils.smoothstep( this.moonDir.y, - 0.05, 0.15 );
		const moonBright = 0.5 - 0.5 * Math.cos( this.moonPhase * Math.PI * 2 );
		this.moonColor = new THREE.Color( 0.55, 0.65, 0.9 ).multiplyScalar( 0.12 * moonUp * ( 0.3 + 0.7 * moonBright ) * night * this.settings.get( 'nightBrightness' ) );
		G.uSunDir.value.copy( s );
		G.uSunColor.value.copy( this.sunColor );
		G.uNight.value = night;
		G.uCloudCover.value = this.cloudCover;
		this.cloudOffset.x += G.uWind.value.x * dt * 6;
		this.cloudOffset.y += G.uWind.value.y * dt * 6;
		G.uCloudOffset.value.copy( this.cloudOffset );

		// LUT every few frames
		this.lutAge += dt;
		if ( this.lutAge > 0.25 ) {
			this.lutAge = 0;
			const u = this.lutPass.material.uniforms;
			u.uSun.value.copy( s ); u.uMoon.value.copy( this.moonDir ); u.uAlt.value = alt; u.uHaze.value = this.haze;
			u.uMoonI.value = 0.000025 * moonBright * night;
			const gl = this.r.gl;
			const prev = gl.getRenderTarget();
			gl.setRenderTarget( this.lut );
			this.lutPass.render( gl );
			gl.setRenderTarget( prev );
		}
		// environment (IBL) when the sun moved or the weather changed
		this.envAge += dt;
		if ( this.envAge > 4 || s.distanceTo( this.lastEnvSun ) > 0.02 ) {
			this.envAge = 0; this.lastEnvSun.copy( s );
			const rt = this.pmrem.fromScene( this.envScene, 0, 0.1, 100 );
			if ( this.envTarget ) this.envTarget.dispose();
			this.envTarget = rt;
			scene.environment = rt.texture;
		}
		scene.environmentIntensity = 0.85 * ( 1 - this.cloudCover * 0.2 );

		// clouds
		const cloudsOn = this.settings.get( 'clouds' ) !== 'off';
		this.domeMat.uniforms.uCloudsOn.value = cloudsOn ? 1 : 0;
		const cu = this.cloudPass.material.uniforms;
		cu.uInvProj.value.copy( camera.projectionMatrixInverse );
		cu.uCamWorld.value.copy( camera.matrixWorld );
		cu.uFrame.value = this.frame % 64;
		const top = new THREE.Color().setRGB( 0.35, 0.45, 0.6 ).multiplyScalar( dayF * 0.9 + 0.01 );
		cu.uAmbTop.value.copy( top ).lerp( new THREE.Color( 0.7, 0.72, 0.75 ), 0.3 ).multiplyScalar( 1.0 + this.sunColor.r * 0.15 );
		cu.uAmbBottom.value.copy( top ).multiplyScalar( 0.55 ).add( new THREE.Color( 0.05, 0.05, 0.045 ).multiplyScalar( dayF ) );
		cu.uMoonDir.value.copy( this.moonDir );
		cu.uMoonColor.value.copy( this.moonColor ).multiplyScalar( 6 );
		if ( cloudsOn ) {
			const gl = this.r.gl;
			const prev = gl.getRenderTarget();
			gl.setRenderTarget( this.cloudRT );
			this.cloudPass.render( gl );
			gl.setRenderTarget( prev );
		}
		const du = this.domeMat.uniforms;
		du.uInvProj.value.copy( camera.projectionMatrixInverse );
		du.uCamWorld.value.copy( camera.matrixWorld );
		du.uMoonDir.value.copy( this.moonDir );
		du.uMoonPhase.value = this.moonPhase;
	}
}
