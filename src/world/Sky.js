// Sky: the Hillaire atmosphere LUTs (render/Atmosphere.js), the dome (sky, sun disc, moon, stars, clouds),
// the environment capture for image-based lighting and the key light (sun / moon) colours.
// Ported from Tidewater src/sky/Sky.js, src/sky/Environment.js and src/App.js updateSun /
// applyAtmosphereReadback (MIT, see LICENSE-Tidewater.txt). The sun and moon paths are ours (real latitude,
// day of year and lunar phase).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { AtmosphereLUT, atmosphereTransmittance, sunDirection, SUN_ILLUMINANCE, SUN_ANGULAR_RADIUS, ATMO_RG } from '../render/Atmosphere.js';
import { G, COMMON_GLSL, SHARED_PARS } from '../render/Materials.js';
import { FS_VERT } from '../render/Renderer.js';
import { Clouds, CLOUD_VIEW_GLSL } from '../render/sky/Clouds.js';
import { CIRRUS_GLSL } from '../render/sky/Cirrus.js';

const ENV_SIZE = 128;
const ss = THREE.MathUtils.smoothstep;

const f = ( x ) => {
	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';
};

// the sun disc and the moon (Tidewater Sky.js skySunDisk / skyMoon; the moon keeps our phase terminator)
const DISC_GLSL = /* glsl */`
	uniform float uMoonPhase;
	vec3 skySunDisk( vec3 dir ) {
		float cosA = dot( dir, uSkySunDir );
		float ang = acos( clamp( cosA, -1.0, 1.0 ) );
		float r = ang / ${f( SUN_ANGULAR_RADIUS )};
		float mask = smoothstep( 1.0, 0.9, r );
		float mu = sqrt( max( 1.0 - r * r, 0.0 ) );
		float limb = 1.0 - 0.6 * ( 1.0 - mu );
		vec3 T = atmosphereTransmittanceToSpace( dir );
		// physically the disc radiance is E / solid angle (~1.6e5); clamped for half float targets
		return T * mask * limb * 2500.0 * smoothstep( -0.02, 0.0, dir.y );
	}
	vec3 skyMoon( vec3 dir ) {
		vec3 m = uMoonDir;
		float ang = acos( clamp( dot( dir, m ), -1.0, 1.0 ) );
		float r = ang / 0.0048;
		if ( r >= 1.0 || uStarI <= 0.0 ) return vec3( 0.0 );
		float mask = smoothstep( 1.0, 0.92, r );
		// phase: a lit hemisphere seen from the side
		vec3 tx = normalize( cross( m, vec3( 0.0, 1.0, 0.0 ) ) ), ty = cross( tx, m );
		vec2 q = vec2( dot( dir - m, tx ), dot( dir - m, ty ) ) / 0.0048;
		float z = sqrt( max( 1.0 - dot( q, q ), 0.0 ) );
		float lit = clamp( dot( normalize( vec3( q, z ) ), normalize( vec3( sin( uMoonPhase * 6.2831 ), 0.0, -cos( uMoonPhase * 6.2831 ) ) ) ) * 4.0, 0.0, 1.0 );
		float maria = 0.75 + 0.25 * vnoise2( q * 3.0 + 4.0 );
		return vec3( 0.9, 0.92, 1.0 ) * mask * 3.0 * uStarI * lit * maria * smoothstep( -0.02, 0.02, dir.y );
	}
`;

// cube face texel -> direction (GL cube conventions; Tidewater Environment.js envCubeDir)
const CUBE_DIR_GLSL = /* glsl */`
	vec3 envCubeDir( int face, vec2 st ) {
		float u = st.x * 2.0 - 1.0;
		float v = st.y * 2.0 - 1.0;
		vec3 d;
		if ( face == 0 ) d = vec3( 1.0, -v, -u );
		else if ( face == 1 ) d = vec3( -1.0, -v, u );
		else if ( face == 2 ) d = vec3( u, 1.0, v );
		else if ( face == 3 ) d = vec3( u, -1.0, -v );
		else if ( face == 4 ) d = vec3( u, -v, 1.0 );
		else d = vec3( -u, -v, -1.0 );
		return normalize( d );
	}
`;

export class Sky {
	constructor( renderer, settings ) {
		this.r = renderer;
		this.settings = settings;
		this.hour = 9;
		this.day = 120;
		this.sunDir = new THREE.Vector3(); // the real sun
		this.moonDir = new THREE.Vector3();
		this.moonPhase = 0.5;
		this.sunColor = new THREE.Color(); // sea-level sun light (0 below the horizon)
		this.moonColor = new THREE.Color();
		this.keyDir = new THREE.Vector3( 0, 1, 0 ); // the key light: the sun, the moon once the sun is well down
		this.keyColor = new THREE.Color();
		this.useMoon = false;
		this.ambient = new THREE.Color();
		this.skyIrradiance = new THREE.Vector3( 0.09, 0.18, 0.38 ); // E / PI, before the night ambient
		this.horizonColor = new THREE.Vector3( 0.6, 0.7, 0.8 );
		this.night = 0;
		this.haze = 1;
		this.cloudCover = 0.49;
		this.cloudOffset = new THREE.Vector2( 0, 0 );
		this._T = new THREE.Vector3();

		// ---- atmosphere LUTs
		this.atmo = new AtmosphereLUT( renderer.gl );
		G.uSkyLUT.value = this.atmo.skyViewTexture;
		G.uTransLUT.value = this.atmo.transmittanceTexture;
		this.atmo.onIrradiance = ( a ) => {
			this.skyIrradiance.fromArray( a.skyIrradiance );
			this.horizonColor.fromArray( a.horizon );
		};

		// ---- volumetric clouds (render/sky/Clouds.js): view history, panorama, ground shadow
		this.clouds = new Clouds( renderer.gl );
		this.cloudDensityK = 1;
		this.cloudAmbientK = 1;
		this.viewSize = new THREE.Vector2( 1, 1 );

		// ---- sky dome: a full-screen triangle drawn where nothing else wrote depth (Tidewater skyViewRadiance)
		const geo = new THREE.BufferGeometry();
		geo.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );
		this.domeMat = new THREE.ShaderMaterial( {
			name: 'SkyDome',
			uniforms: Object.assign( {
				uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
				uMoonPhase: { value: 0.5 }, uCloudsOn: { value: 1 },
				uCloudView: { value: null }, uCvRight: { value: this.clouds.viewRight }, uCvUp: { value: this.clouds.viewUp },
				uCvFwd: { value: this.clouds.viewFwd }, uCvTan: { value: this.clouds.viewTan }, uCvValid: { value: 0 },
				uPxAngle: { value: 0.001 },
			}, G, this.clouds.cirrus.uniforms ),
			defines: { REVERSED: this.r.reversed ? 1 : 0 },
			vertexShader: /* glsl */`
				varying vec2 vNdc;
				void main() { vNdc = position.xy; gl_Position = vec4( position.xy, REVERSED == 1 ? 0.0 : 1.0, 1.0 ); }`,
			fragmentShader: /* glsl */`
				${SHARED_PARS}
				uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform float uCloudsOn; uniform float uPxAngle;
				varying vec2 vNdc;
				${COMMON_GLSL}
				${DISC_GLSL}
				${CLOUD_VIEW_GLSL}
				${CIRRUS_GLSL}
				void main() {
					vec4 vp = uInvProj * vec4( vNdc, 0.5, 1.0 );
					vec3 d = normalize( ( uCamWorld * vec4( normalize( vp.xyz / vp.w ), 0.0 ) ).xyz );
					vec3 base = skyBackground( d, 1.0 ) + skyMoon( d );
					vec3 sun = skySunDisk( d );
					vec4 cl = vec4( 0.0, 0.0, 0.0, 1.0 );
					if ( uCloudsOn > 0.5 ) {
						// the view's cumulus over the cirrus (per pixel); outside the view the panorama has both
						vec2 cuv;
						if ( cloudsViewUv( d, cuv ) ) cl = clOver( cloudsViewAt( cuv, d ), cloudsHigh( d, uPxAngle ) );
						else cl = cloudsPanoSample( d );
					}
					gl_FragColor = vec4( base * cl.a + sun * cloudsSunTransmittance( cl.a ) + cl.rgb, 1.0 );
				}`,
			depthTest: true, depthWrite: false,
		} );
		this.dome = new THREE.Mesh( geo, this.domeMat );
		this.dome.frustumCulled = false;
		this.dome.renderOrder = 1000;

		// ---- environment lighting: the sky (no sun or moon disc: the key light is lit directly) captured
		// into a cube one face per frame, then prefiltered by three's PMREM into the same target each time
		this.pmrem = new THREE.PMREMGenerator( this.r.gl );
		this.envCube = new THREE.WebGLCubeRenderTarget( ENV_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false } );
		this.envFace = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'EnvFace',
			uniforms: Object.assign( { uFace: { value: 0 } }, G ),
			vertexShader: FS_VERT,
			fragmentShader: /* glsl */`
				${SHARED_PARS}
				uniform int uFace;
				${COMMON_GLSL}
				${CUBE_DIR_GLSL}
				void main() {
					vec3 dir = envCubeDir( uFace, gl_FragCoord.xy / ${f( ENV_SIZE )} );
					gl_FragColor = vec4( skyReflectionRadiance( dir ), 1.0 );
				}`,
			depthTest: false, depthWrite: false,
		} ) );
		this.envRT = null;
		this.envStep = - 1;
		this.envTimer = 0;
		this.lastEnvSun = new THREE.Vector3( 0, - 2, 0 );

		// ---- lights (kept for the scene graph; the sky light is the environment)
		this.ambientLight = new THREE.HemisphereLight( 0xbfd8ff, 0x3a3020, 0.0 );
		this.frame = 0;
	}

	resize( w, h ) {
		this.viewSize.set( Math.max( 1, w ), Math.max( 1, h ) );
	}

	// hour 0..24; updates the sun and moon directions
	setTime( hour, day ) {
		this.hour = hour; this.day = day;
		sunDirection( hour, day, 20.5, this.sunDir );
		// the moon lags the sun by the phase through a 29.5-day cycle (0 new, 0.5 full); the game starts
		// a couple of days after the full moon
		const phase = ( ( day + 15 ) % 29.53 ) / 29.53;
		this.moonPhase = phase;
		sunDirection( ( ( hour - phase * 24 ) % 24 + 24 ) % 24, day + 7, 20.5, this.moonDir );
	}

	update( dt, camera, scene, settings ) {
		this.frame ++;
		const s = this.sunDir;
		const gl = this.r.gl;
		// ---- atmosphere: LUTs and the readback (altitude in real metres: the world is 1:6 vertically)
		this.atmo.update( dt, s, Math.max( 0, camera.position.y ) * 6 );
		G.uAtmoR.value = this.atmo.viewHeight;
		G.uSkySunDir.value.copy( s );

		// ---- light colours (Tidewater App.js updateSun / applyAtmosphereReadback)
		atmosphereTransmittance( ATMO_RG + 0.001, s.y, this._T );
		const horizonFade = ss( s.y, - 0.03, 0.02 );
		this.sunColor.setRGB( this._T.x, this._T.y, this._T.z ).multiplyScalar( SUN_ILLUMINANCE * horizonFade );
		const night = ss( - s.y, 0.02, 0.18 );
		this.night = night;
		const nb = this.settings.get( 'nightBrightness' ) ?? 1;
		const moonUp = ss( this.moonDir.y, - 0.05, 0.15 );
		const moonBright = 0.5 - 0.5 * Math.cos( this.moonPhase * Math.PI * 2 );
		const moonK = ( 0.3 + 0.7 * moonBright ) * moonUp;
		this.moonColor.setRGB( 0.6, 0.7, 1.0 ).multiplyScalar( 0.12 * night * moonK * nb );
		// key light: the sun until it is well below the horizon (no direct light in twilight anyway), then the moon
		this.useMoon = s.y <= - 0.07;
		this.keyDir.copy( this.useMoon ? this.moonDir : s );
		this.keyColor.copy( this.useMoon ? this.moonColor : this.sunColor );
		G.uSunDir.value.copy( this.keyDir );
		G.uSunColor.value.copy( this.keyColor );
		G.uNight.value = night;
		G.uStarI.value = night;
		G.uMoonDir.value.copy( this.moonDir );
		G.uMoonBright.value = moonK * nb;
		G.uNightGlow.value = Math.max( moonK, 0.3 ) * nb;
		const nightAmb = 0.012 * night * nb;
		G.uSkyIrr.value.set( this.skyIrradiance.x + nightAmb * 0.6, this.skyIrradiance.y + nightAmb * 0.7, this.skyIrradiance.z + nightAmb );
		G.uHorizon.value.copy( this.horizonColor );
		G.uCloudCover.value = this.cloudCover;
		this.cloudOffset.x += G.uWind.value.x * dt * 6;
		this.cloudOffset.y += G.uWind.value.y * dt * 6;
		G.uCloudOffset.value.copy( this.cloudOffset );

		// ---- clouds
		const cq = this.settings.get( 'clouds' );
		const cloudsOn = cq !== 'off';
		this.domeMat.uniforms.uCloudsOn.value = cloudsOn ? 1 : 0;
		if ( cloudsOn ) {
			this.clouds.update( dt, camera, this.viewSize.x, this.viewSize.y, { coverage: this.cloudCover, densityK: this.cloudDensityK, ambientK: this.cloudAmbientK, quality: cq === 'low' ? 'low' : 'high' } );
			this.domeMat.uniforms.uCloudView.value = this.clouds.viewTex;
			this.domeMat.uniforms.uCvValid.value = this.clouds.viewValid;
		} else this.clouds.disable();
		const du = this.domeMat.uniforms;
		du.uInvProj.value.copy( camera.projectionMatrixInverse );
		du.uCamWorld.value.copy( camera.matrixWorld );
		du.uMoonPhase.value = this.moonPhase;
		// the pixel footprint (radians) filters the cirrus fibres
		du.uPxAngle.value = 2 * Math.tan( THREE.MathUtils.degToRad( camera.fov * 0.5 ) ) / ( camera.zoom || 1 ) / this.viewSize.y;

		// ---- environment: one cube face per frame, then the prefilter; refreshed when the sun moved or
		// every 3 s so drifting clouds stay in sync (Tidewater Environment.js update)
		this._updateEnv( dt, scene );
	}

	_updateEnv( dt, scene ) {
		const gl = this.r.gl;
		const sun = this.sunDir;
		this.envTimer -= dt;
		const prev = gl.getRenderTarget();
		const face = ( i ) => {
			this.envFace.material.uniforms.uFace.value = i;
			gl.setRenderTarget( this.envCube, i );
			this.envFace.render( gl );
		};
		const filter = () => {
			this.envRT = this.pmrem.fromCubemap( this.envCube.texture, this.envRT );
			scene.environment = this.envRT.texture;
		};
		if ( ! this.envRT ) {
			for ( let i = 0; i < 6; i ++ ) face( i );
			filter();
			this.envTimer = 3;
			this.lastEnvSun.copy( sun );
		} else {
			if ( this.envStep < 0 && ( sun.angleTo( this.lastEnvSun ) > 0.004 || this.envTimer <= 0 ) ) {
				this.envTimer = 3;
				this.lastEnvSun.copy( sun );
				this.envStep = 0;
			}
			if ( this.envStep >= 0 ) {
				if ( this.envStep < 6 ) face( this.envStep );
				else filter();
				this.envStep = this.envStep >= 6 ? - 1 : this.envStep + 1;
			}
		}
		gl.setRenderTarget( prev );
		scene.environmentIntensity = 1;
	}
}
