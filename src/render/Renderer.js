// Frame pipeline:
//   0. (World.update, before) the cascaded sun shadow maps (render/Shadows.js)
//   1. opaque world (layer 0) + sky into sceneRT (HDR colour + depth texture)
//   2. GTAO on the opaque depth (half resolution), the beauty pass: scene x AO into beautyRT
//   3. composite into mainRT (beauty colour + scene depth copied), then water and transparents (layer 1)
//      that read beautyRT and the scene depth for refraction and depth-based absorption
//   4. sun shafts and god rays on mainRT (colour + depth) into beautyRT (post/Haze.js)
//   4b. with antialias 'taa': the motion vectors / reactive mask of the moving things (post/Motion.js), the
//      temporal resolve (post/TAA.js) back into mainRT, then the overlay layer
//   5. first-person view model (its own scene and camera) over a cleared depth
//   6. bloom chain (13-tap downsamples, Karis average on the first, tent upsamples) and the auto exposure
//      metered from the 1/16 level, then the grade in scene-linear HDR (RCAS, motion blur, bloom, lens
//      flare, exposure, white balance, saturation, contrast, vignette, grain), ACES, the display-space
//      effects (underwater, damage, flash), sRGB with a +-1 LSB dither; optional FXAA
// The post chain (bloom, meter, grade) is ported from Tidewater src/post/PostFX.js (MIT, see
// LICENSE-Tidewater.txt).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G } from './Materials.js';
import { GTAO } from './post/GTAO.js';
import { Haze } from './post/Haze.js';
import { TAA } from './post/TAA.js';
import { MotionPass } from './post/Motion.js';
import { LensFlare, FLARE_GLSL } from './post/LensFlare.js';
import { MotionBlur, MB_GLSL } from './post/MotionBlur.js';

export const LAYER_WORLD = 0;
export const LAYER_POST = 1;
// fast-moving transparents with no motion vectors (rain, sparks): drawn after the TAA resolve, over the
// scene depth, so they never smear through the history
export const LAYER_OVERLAY = 2;

// device pixel ratio cap for the 3D view (renderScale goes above it)
const MAX_DPR = 1.5;
// the scene-referred exposure before ACES (Tidewater App.js settings.exposure)
const EXPOSURE = 0.55;
const METER_TILES = 8;

export class Renderer {
	constructor( canvas, settings ) {
		this.settings = settings;
		this.canvas = canvas;
		let gl = new THREE.WebGLRenderer( { canvas, antialias: false, powerPreference: 'high-performance', reversedDepthBuffer: true, stencil: false, preserveDrawingBuffer: false } );
		if ( ! gl.capabilities.reversedDepthBuffer ) {
			gl.dispose();
			gl = new THREE.WebGLRenderer( { canvas, antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true, stencil: false } );
			this.logDepth = true;
		}
		this.reversed = !! gl.capabilities.reversedDepthBuffer && ! this.logDepth;
		this.gl = gl;
		gl.outputColorSpace = THREE.LinearSRGBColorSpace; // the grading pass encodes sRGB itself
		gl.toneMapping = THREE.NoToneMapping;
		gl.shadowMap.enabled = true;
		gl.shadowMap.type = THREE.PCFShadowMap;
		gl.shadowMap.autoUpdate = false;
		gl.autoClear = false;
		gl.info.autoReset = false;

		this.maxSamples = gl.capabilities.maxSamples || 0;
		this.width = 1; this.height = 1;
		this.targets = null;
		this.frame = 0;
		this._last = performance.now();
		this._resetExposure = true;

		this.composite = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'Composite',
			uniforms: { tColor: { value: null }, tDepth: { value: null } },
			vertexShader: FS_VERT,
			fragmentShader: /* glsl */`
				uniform sampler2D tColor; uniform sampler2D tDepth; varying vec2 vUv;
				void main() { gl_FragColor = texture2D( tColor, vUv ); gl_FragDepth = texture2D( tDepth, vUv ).r; }`,
			depthTest: true, depthWrite: true,
			// three's reversed-depth table flips Always into Never, so ask for Never to get Always
			depthFunc: this.reversed ? THREE.NeverDepth : THREE.AlwaysDepth,
		} ) );

		// ---- bloom (Jimenez 2014): 13-tap downsamples, the first one a Karis average of the five boxes so
		// single bright glints can't flicker; 3x3 tent upsamples accumulating each level
		const TAPS = /* glsl */`
			uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
			#ifdef SANITIZE
			// (the first level drops NaN / Inf texels: one bad pixel must not bloom into a black block)
			vec3 bTap( float x, float y ) {
				vec3 c = texture2D( tSrc, vUv + texel * vec2( x, y ) ).rgb;
				return any( equal( floatBitsToUint( c ) & 0x7f800000u, uvec3( 0x7f800000u ) ) ) ? vec3( 0.0 ) : min( c, vec3( 65504.0 ) );
			}
			#else
			vec3 bTap( float x, float y ) { return texture2D( tSrc, vUv + texel * vec2( x, y ) ).rgb; }
			#endif
			float lum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
			vec3 karis( vec3 c ) { return c / ( lum( c ) + 1.0 ); }`;
		const down = ( first ) => new THREE.ShaderMaterial( {
			name: first ? 'BloomDownKaris' : 'BloomDown',
			defines: first ? { SANITIZE: 1 } : {},
			uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() } },
			vertexShader: FS_VERT,
			fragmentShader: TAPS + /* glsl */`
				void main() {
					vec3 a = bTap( -2.0, -2.0 ), b = bTap( 0.0, -2.0 ), c = bTap( 2.0, -2.0 );
					vec3 d = bTap( -2.0, 0.0 ), e = bTap( 0.0, 0.0 ), f = bTap( 2.0, 0.0 );
					vec3 g = bTap( -2.0, 2.0 ), h = bTap( 0.0, 2.0 ), i = bTap( 2.0, 2.0 );
					vec3 j = bTap( -1.0, -1.0 ), k = bTap( 1.0, -1.0 ), l = bTap( -1.0, 1.0 ), m = bTap( 1.0, 1.0 );
					${first ? /* glsl */`
					vec3 g0 = karis( ( j + k + l + m ) * 0.25 ) * 0.5;
					vec3 g1 = karis( ( a + b + d + e ) * 0.25 ) * 0.125;
					vec3 g2 = karis( ( b + c + e + f ) * 0.25 ) * 0.125;
					vec3 g3 = karis( ( d + e + g + h ) * 0.25 ) * 0.125;
					vec3 g4 = karis( ( e + f + h + i ) * 0.25 ) * 0.125;
					vec3 s = g0 + g1 + g2 + g3 + g4;
					// undo the Karis tonemap on the result
					gl_FragColor = vec4( s / max( 1.0 - lum( s ), 0.02 ), 1.0 );` : /* glsl */`
					vec3 s = e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + k + l + m ) * 0.125;
					gl_FragColor = vec4( s, 1.0 );`}
				}`,
			depthTest: false, depthWrite: false,
		} );
		this.bloomDownFirst = down( true );
		this.bloomDown = down( false );
		this.bloomUp = new THREE.ShaderMaterial( {
			name: 'BloomUp',
			uniforms: { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() } },
			vertexShader: FS_VERT,
			fragmentShader: TAPS + /* glsl */`
				uniform sampler2D tBase;
				void main() {
					vec3 s = ( bTap( 0.0, 0.0 ) * 4.0
						+ ( bTap( -1.0, 0.0 ) + bTap( 1.0, 0.0 ) + bTap( 0.0, -1.0 ) + bTap( 0.0, 1.0 ) ) * 2.0
						+ ( bTap( -1.0, -1.0 ) + bTap( 1.0, -1.0 ) + bTap( -1.0, 1.0 ) + bTap( 1.0, 1.0 ) ) ) / 16.0;
					gl_FragColor = vec4( texture2D( tBase, vUv ).rgb + s, 1.0 );
				}`,
			depthTest: false, depthWrite: false,
		} );
		this.quad = new FullScreenQuad( this.bloomDown );

		// ---- auto exposure (eye adaptation): centre-weighted average log luminance of the 1/16 bloom level,
		// summed per tile, then adapted in log2 in a 1x1 float target read by the grade (no CPU readback)
		this.meterTiles = new THREE.ShaderMaterial( {
			name: 'MeterTiles',
			uniforms: { tSrc: { value: null } },
			vertexShader: FS_VERT,
			fragmentShader: /* glsl */`
				uniform sampler2D tSrc;
				void main() {
					ivec2 size = textureSize( tSrc, 0 );
					ivec2 t = ivec2( gl_FragCoord.xy );
					ivec2 p0 = t * size / ${METER_TILES}, p1 = ( t + 1 ) * size / ${METER_TILES};
					float accL = 0.0, accW = 0.0;
					for ( int y = p0.y; y < p1.y; y ++ ) for ( int x = p0.x; x < p1.x; x ++ ) {
						vec3 c = texelFetch( tSrc, ivec2( x, y ), 0 ).rgb;
						float l = log2( max( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 ) );
						vec2 uvc = ( vec2( x, y ) + 0.5 ) / vec2( size ) - 0.5;
						float w = max( 1.0 - length( uvc * vec2( 1.0, 1.4 ) ) * 1.2, 0.15 );
						accL += l * w;
						accW += w;
					}
					gl_FragColor = vec4( accL, accW, 0.0, 1.0 );
				}`,
			depthTest: false, depthWrite: false,
		} );
		this.meterAdapt = new THREE.ShaderMaterial( {
			name: 'MeterAdapt',
			uniforms: { tTiles: { value: null }, tPrev: { value: null }, uDt: { value: 0 }, uNight: { value: 0 }, uReset: { value: 1 } },
			vertexShader: FS_VERT,
			fragmentShader: /* glsl */`
				uniform sampler2D tTiles; uniform sampler2D tPrev; uniform float uDt; uniform float uNight; uniform float uReset;
				void main() {
					vec2 s = vec2( 0.0 );
					for ( int y = 0; y < ${METER_TILES}; y ++ ) for ( int x = 0; x < ${METER_TILES}; x ++ ) s += texelFetch( tTiles, ivec2( x, y ), 0 ).rg;
					float avg = exp2( s.x / max( s.y, 1e-4 ) );
					// the eye only partly compensates: dark scenes stay darker (dusk and night must not look
					// like day), and at night at most one extra stop. The floor is lower than Tidewater's 0.6: the
					// Hawaiian noon sun stands near the zenith, so a beach meters ~0.85 and needs 0.35 to read right
					float ratio = 0.25 / avg;
					float partial = ratio > 1.0 ? pow( ratio, 0.8 ) : ratio;
					float tgt = clamp( partial, 0.35, mix( 6.0, 2.0, uNight ) );
					// highlight protection: when a large part of the frame would wash out at that boost (sea and sky
					// beyond a shaded foreground), pull back by up to 0.85 stop; a window or a lamp is too small to count
					float nB = 0.0, lB = 0.0;
					for ( int y = 0; y < ${METER_TILES}; y ++ ) for ( int x = 0; x < ${METER_TILES}; x ++ ) {
						vec2 t = texelFetch( tTiles, ivec2( x, y ), 0 ).rg;
						float l = t.x / max( t.y, 1e-4 );
						if ( exp2( l ) * tgt > 1.0 ) { nB += 1.0; lB += l; }
					}
					if ( tgt > 1.0 && nB > 0.0 ) {
						float cap = clamp( 1.1 / exp2( lB / nB ), tgt * 0.55, tgt );
						tgt = exp2( mix( log2( tgt ), log2( cap ), smoothstep( 0.05, 0.25, nB / ${METER_TILES * METER_TILES}.0 ) ) );
					}
					float cur = texelFetch( tPrev, ivec2( 0 ), 0 ).r;
					float rate = tgt > cur ? 1.6 : 1.1;
					float k = uReset > 0.5 ? 1.0 : 1.0 - exp( - uDt * rate );
					float next = exp2( mix( log2( max( cur, 1e-3 ) ), log2( tgt ), k ) );
					// (a NaN that reached the meter would stick in the adaptation for good: start over instead)
					if ( ( floatBitsToUint( next ) & 0x7f800000u ) == 0x7f800000u ) next = 1.0;
					gl_FragColor = vec4( next, avg, tgt, 1.0 );
				}`,
			depthTest: false, depthWrite: false,
		} );
		const f1 = () => {
			const t = new THREE.WebGLRenderTarget( 1, 1, { type: THREE.FloatType, depthBuffer: false } );
			t.texture.minFilter = t.texture.magFilter = THREE.NearestFilter;
			t.texture.generateMipmaps = false;
			return t;
		};
		this.exposureRT = [ f1(), f1() ];
		this.gtao = new GTAO();
		this.haze = new Haze();
		this.taa = new TAA();
		this.motion = new MotionPass();
		this.motionVectors = true; // (false: camera-only reprojection, for comparisons)
		this.flare = new LensFlare();
		this.mb = new MotionBlur();
		this.shadows = null; // the cascaded sun shadows (World): the shafts' shadow
		this.meterRT = new THREE.WebGLRenderTarget( METER_TILES, METER_TILES, { type: THREE.FloatType, depthBuffer: false } );
		this.meterRT.texture.minFilter = this.meterRT.texture.magFilter = THREE.NearestFilter;
		this._exp = 0;

		this.grade = new THREE.ShaderMaterial( {
			name: 'Grade',
			uniforms: {
				tColor: { value: null }, tBloom: { value: null }, tExposure: { value: null }, bloomStrength: { value: 0.05 },
				exposureBias: { value: 1 }, saturation: { value: 1.06 }, contrast: { value: 1.04 }, warmth: { value: 0.02 },
				vignette: { value: 0.28 }, grain: { value: 0.012 }, time: { value: 0 }, frame: { value: 0 },
				underwater: { value: 0 }, damage: { value: 0 }, lowBlood: { value: 0 },
				drunk: { value: 0 }, sick: { value: 0 }, flash: { value: 0 }, fade: { value: 0 }, resolution: { value: new THREE.Vector2() },
				// worn optics and masks (items/ext/senses: Game.grade): night vision, thermal, a mask's lenses, vog
				...senseUniforms(),
				sharpen: { value: 0 }, tSkyDepth: { value: null },
				tFlareVis: { value: null }, uFlareSunUV: { value: this.flare.sunUV }, uFlareAspect: { value: 1 }, uFlareStrength: { value: 0 },
				uFlareColor: { value: G.uSunColor.value }, uFlareResY: { value: 1 },
				...this.mb.uniforms,
			},
			// (the motion blur gather is compiled in only while it is on)
			defines: { MOTION_BLUR: 0 },
			vertexShader: FS_VERT,
			fragmentShader: GRADE_FRAG,
			depthTest: false, depthWrite: false,
		} );
		this.gradeQuad = new FullScreenQuad( this.grade );
		this.fxaa = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'FXAA',
			uniforms: { tColor: { value: null }, texel: { value: new THREE.Vector2() } },
			vertexShader: FS_VERT,
			fragmentShader: FXAA_FRAG,
			depthTest: false, depthWrite: false,
		} ) );
	}

	get aa() { return this.settings.get( 'antialias' ); }

	// With TAA a render scale below 1 renders the scene at that scale and the temporal resolve upsamples it to
	// the display (FSR2-style: the jittered frames fill in the missing samples), so the post chain, the view
	// model and the HUD stay sharp; without TAA the canvas itself shrinks and the browser stretches it
	// (a scale above 1 supersamples: the targets are larger than the canvas and the grade filters them down)
	resize( w, h ) {
		const scale = this.settings.get( 'renderScale' ) || 1;
		// (HiDPI screens: at most 1.5 device pixels per CSS pixel for the 3D view, the HUD is DOM and stays sharp;
		// a laptop's 2x screen would otherwise render ~2.5x the pixels of 1080p by default)
		const dpr = Math.min( window.devicePixelRatio || 1, MAX_DPR );
		const up = scale < 1 && this.aa === 'taa' && ! this.logDepth;
		this.gl.setPixelRatio( dpr * ( up ? 1 : Math.min( 1, scale ) ) );
		this.gl.setSize( w, h );
		const W = Math.max( 1, Math.round( w * dpr * scale ) ), H = Math.max( 1, Math.round( h * dpr * scale ) );
		const OW = up ? Math.max( 1, Math.round( w * dpr ) ) : W, OH = up ? Math.max( 1, Math.round( h * dpr ) ) : H;
		if ( this.targets && W === this.width && H === this.height && OW === this.outWidth && OH === this.outHeight && this.targets.aa === this.aa ) return;
		this.width = W; this.height = H;
		this.outWidth = OW; this.outHeight = OH;
		this._makeTargets();
	}

	_makeTargets() {
		if ( this.targets ) for ( const t of this.targets.list ) t.dispose();
		// W x H: the scene's render resolution; OW x OH: the display (larger with the TAA upsampling)
		const W = this.width, H = this.height, OW = this.outWidth, OH = this.outHeight;
		const up = OW !== W || OH !== H;
		const samples = this.aa === 'msaa' ? Math.min( 4, this.maxSamples ) : 0;
		const depthTex = new THREE.DepthTexture( W, H, THREE.FloatType );
		depthTex.format = THREE.DepthFormat;
		const scene = new THREE.WebGLRenderTarget( W, H, { type: THREE.HalfFloatType, samples, depthTexture: depthTex, depthBuffer: true } );
		scene.texture.minFilter = scene.texture.magFilter = THREE.LinearFilter;
		scene.texture.generateMipmaps = false;
		const mainDepth = new THREE.DepthTexture( W, H, THREE.FloatType );
		mainDepth.format = THREE.DepthFormat;
		const main = new THREE.WebGLRenderTarget( W, H, { type: THREE.HalfFloatType, samples, depthTexture: mainDepth, depthBuffer: true } );
		// (only the FXAA path grades into an LDR target first)
		const ldr = this.aa === 'fxaa' ? new THREE.WebGLRenderTarget( OW, OH, { type: THREE.UnsignedByteType, depthBuffer: false } ) : null;
		// the opaque scene with its ambient occlusion (what water refracts), then the hazed frame the view
		// model is drawn over
		// (with TAA only full-screen passes draw here; without it the view model is drawn over the hazed frame)
		const beauty = new THREE.WebGLRenderTarget( W, H, { type: THREE.HalfFloatType, samples, depthBuffer: ! this.taaOn } );
		beauty.texture.minFilter = beauty.texture.magFilter = THREE.LinearFilter;
		beauty.texture.generateMipmaps = false;
		// upsampling: the resolved frame at the display resolution with the scene depth scaled up under it (the
		// overlay layer tests against it, the view model clears it)
		let post = main;
		if ( up ) {
			const postDepth = new THREE.DepthTexture( OW, OH, THREE.FloatType );
			postDepth.format = THREE.DepthFormat;
			post = new THREE.WebGLRenderTarget( OW, OH, { type: THREE.HalfFloatType, depthTexture: postDepth, depthBuffer: true } );
			post.texture.generateMipmaps = false;
		}
		this.gtao.setSize( W, H );
		this.haze.setSize( W, H );
		this.taa.setSize( W, H, OW, OH );
		this.taa.reset();
		this.motion.setSize( W, H );
		this.mb.setSize( OW, OH );
		this.mb.reset();
		// 5 levels: 1/2 .. 1/32 of the display
		const bloom = [], bloomUp = [];
		for ( let i = 0; i < 5; i ++ ) {
			const s = Math.pow( 0.5, i + 1 );
			const mk = () => new THREE.WebGLRenderTarget( Math.max( 1, Math.round( OW * s ) ), Math.max( 1, Math.round( OH * s ) ), { type: THREE.HalfFloatType, depthBuffer: false } );
			bloom.push( mk() );
			if ( i < 4 ) bloomUp.push( mk() );
		}
		const list = [ scene, main, beauty, ...bloom, ...bloomUp ];
		if ( ldr ) list.push( ldr );
		if ( post !== main ) list.push( post );
		this.targets = { scene, main, ldr, beauty, post, bloom, bloomUp, aa: this.aa, list };
		this.grade.uniforms.resolution.value.set( OW, OH );
	}

	// (GTAO reconstructs positions from reversed-Z depth: not with the logarithmic depth fallback)
	get aoOn() { return ! this.logDepth && ( this.settings.get( 'ao' ) ?? true ); }
	// the opaque scene (with AO) and its depth, for refraction
	get sceneColor() { return this.aoOn ? this.targets.beauty.texture : this.targets.scene.texture; }
	get sceneDepth() { return this.targets.scene.depthTexture; }
	// depth with the water and transparents
	get mainDepth() { return this.targets.main.depthTexture; }
	get taaOn() { return this.aa === 'taa' && ! this.logDepth; }
	get hazeOn() { return ! this.logDepth && ( this.settings.get( 'shafts' ) ?? this.settings.get( 'shadows' ) !== 'off' ); }

	// snap the eye adaptation and drop the temporal history (after a teleport or a time jump)
	resetExposure() { this._resetExposure = true; this.taa.reset(); this.mb.reset(); }

	_pass( mat, rt ) {
		this.quad.material = mat;
		this.gl.setRenderTarget( rt );
		this.quad.render( this.gl );
	}

	// frame: { scene, camera, viewScene, viewCamera, onBeforeTransparent, grade: {...} }
	render( f ) {
		const gl = this.gl, T = this.targets, cam = f.camera;
		const now = performance.now();
		const dt = Math.min( 0.1, Math.max( 0, ( now - this._last ) / 1000 ) );
		this._last = now;
		this.frame ++;
		G.uFrame.value = this.frame % 1024;
		gl.info.reset();
		// TAA: this frame's sub-pixel jitter on the projection (restored at the end)
		const taaOn = this.taaOn;
		// (three switches the camera to a reversed-depth projection on its first render: do it before the
		// clean projection is kept)
		if ( this.reversed && cam.reversedDepth !== true ) { cam._reversedDepth = true; cam.updateProjectionMatrix(); }
		if ( taaOn ) this.taa.begin( cam, this.width, this.height );
		// motion blur (camera-only, from the depth the TAA resolve copies): off by default
		const mbOn = taaOn && ( this.settings.get( 'motionBlur' ) ?? false );
		if ( mbOn ) {
			if ( this.taa.needsRestart ) this.mb.reset();
			this.mb.updateCamera( cam, cam.userData.projNoJitter );
		} else this.mb.reset();
		this.gtao.temporal = taaOn;
		// the post shafts this frame (the per-material haze leaves their near sunlit share to them): by day in
		// clear to cloudy weather
		const shaftsOn = this.hazeOn && G.uNight.value < 0.5 && G.uHazeDensity.value < 1.6 * 1.35 && G.uUnderwater.value < 0.5;
		G.uHazeShafts.value = shaftsOn ? 1 : 0;
		// 1: opaque + sky
		gl.shadowMap.needsUpdate = f.shadows !== false;
		cam.layers.set( LAYER_WORLD );
		gl.setRenderTarget( T.scene );
		gl.setClearColor( 0x000000, 1 );
		gl.clear( true, true, false );
		gl.render( f.scene, cam );
		// 2: ambient occlusion into the beauty target
		const aoOn = this.aoOn;
		if ( aoOn ) {
			this.gtao.beautyMat.uniforms.uWaterLevel.value = G.uWaterLevel.value;
			this.gtao.render( gl, T.scene.texture, T.scene.depthTexture, cam, T.beauty );
		}
		// 3: composite + transparents
		gl.setRenderTarget( T.main );
		gl.clear( true, true, false );
		this.composite.material.uniforms.tColor.value = aoOn ? T.beauty.texture : T.scene.texture;
		this.composite.material.uniforms.tDepth.value = T.scene.depthTexture;
		this.composite.render( gl );
		cam.layers.set( LAYER_POST );
		if ( ! taaOn ) cam.layers.enable( LAYER_OVERLAY );
		gl.render( f.scene, cam );
		cam.layers.set( LAYER_WORLD );
		// 4: sun shafts and god rays (half / quarter resolution) composited into the beauty target, which the
		// water no longer needs: by day in clear to cloudy weather, the rays while the sun is in view
		let out = T.main;
		if ( this.hazeOn ) {
			const sh = !! this.shadows?.source;
			if ( this.haze.render( gl, T.main.texture, T.main.depthTexture, cam, T.beauty, sh, shaftsOn ) ) out = T.beauty;
		}
		// TAA resolve after the water, transparents and haze; the resolved image goes back into mainRT (or, when
		// upsampling, the display-sized post target with the scene depth scaled up under it), where the view
		// model is drawn over it (never into the history)
		if ( taaOn ) {
			// (with the scene pass's jittered camera, against its depth)
			const moving = this.motionVectors && this.motion.render( gl, f.scene, cam, this.taa.viewProj, this.taa.prevViewProj, T.scene.depthTexture );
			this.taa.resolve( gl, cam, out.texture, T.main.depthTexture, T.scene.depthTexture, this.exposureRT[ this._exp ].texture, moving ? this.motion.texture : null );
			if ( T.post !== T.main ) {
				gl.setRenderTarget( T.post );
				this.composite.material.uniforms.tColor.value = this.taa.texture;
				this.composite.material.uniforms.tDepth.value = T.main.depthTexture;
				this.composite.render( gl );
			} else this.taa.copyTo( gl, T.main );
			this.taa.end( cam );
			out = T.post;
		}
		// overlay layer (rain, sparks) over the scene depth: mainRT still holds it (the copy writes no depth), the
		// upsampling copy wrote it scaled up; without TAA it was drawn with the transparents
		if ( taaOn ) {
			gl.setRenderTarget( T.post );
			cam.layers.set( LAYER_OVERLAY );
			gl.render( f.scene, cam );
			cam.layers.set( LAYER_WORLD );
		}
		// the sun's visibility for the lens flare (the scene depth, before the view model)
		const flareOn = this.settings.get( 'lensFlare' ) ?? true;
		if ( flareOn ) this.flare.update( gl, cam, T.main.depthTexture, this.height, dt );
		// 5: view model (its own scene and camera) over a cleared depth
		if ( f.viewScene ) {
			gl.setRenderTarget( out );
			gl.clear( false, true, false );
			gl.render( f.viewScene, f.viewCamera );
		}
		// (the post target's depth now holds only the view model: its mask for the motion blur)
		this.mb.uniforms.tMbVM.value = T.post.depthTexture;
		this.mb.uniforms.uMbVMOn.value = f.viewScene && out === T.post ? 1 : 0;
		this.mb.render( gl, this.taa.prevDepth.texture, mbOn );
		if ( this.grade.defines.MOTION_BLUR !== ( mbOn ? 1 : 0 ) ) {
			this.grade.defines.MOTION_BLUR = mbOn ? 1 : 0;
			this.grade.needsUpdate = true;
		}
		const post = out.texture;
		// 6: bloom down chain (also feeds the exposure meter), then the up chain
		let src = post;
		for ( let i = 0; i < T.bloom.length; i ++ ) {
			const m = i === 0 ? this.bloomDownFirst : this.bloomDown;
			m.uniforms.tSrc.value = src;
			m.uniforms.texel.value.set( 1 / src.image.width, 1 / src.image.height );
			this._pass( m, T.bloom[ i ] );
			src = T.bloom[ i ].texture;
		}
		const bloomOn = this.settings.get( 'bloom' ) !== false;
		if ( bloomOn ) {
			const U = this.bloomUp.uniforms;
			let small = T.bloom[ 4 ].texture;
			for ( let i = 3; i >= 0; i -- ) {
				U.tSrc.value = small;
				U.tBase.value = T.bloom[ i ].texture;
				U.texel.value.set( 1 / small.image.width, 1 / small.image.height );
				this._pass( this.bloomUp, T.bloomUp[ i ] );
				small = T.bloomUp[ i ].texture;
			}
			this.grade.uniforms.tBloom.value = small;
		} else this.grade.uniforms.tBloom.value = T.bloom[ 0 ].texture;
		this.grade.uniforms.bloomStrength.value = bloomOn ? ( f.grade?.bloom ?? 0.05 ) : 0;
		// 7: the exposure the grade uses was metered on the previous frames; meter this one afterwards
		const u = this.grade.uniforms;
		u.tColor.value = post;
		u.tExposure.value = this.exposureRT[ this._exp ].texture;
		u.frame.value = this.frame;
		u.exposureBias.value = ( f.grade?.exposureBias ?? 1 ) * Math.pow( 2, this.settings.get( 'exposure' ) || 0 );
		// RCAS on the resolved image (TAA converges to a slightly soft image)
		u.sharpen.value = taaOn ? 0.45 : 0;
		u.tSkyDepth.value = this.taa.prevDepth.texture;
		u.tFlareVis.value = this.flare.texture;
		u.uFlareStrength.value = flareOn ? 1 : 0;
		u.uFlareAspect.value = cam.aspect;
		u.uFlareResY.value = this.outHeight;
		// (the senses' switches are off unless this frame's grade turns them on: a menu vista after a game in night vision)
		for ( const k of SENSE_SWITCHES ) u[ k ].value = 0;
		u.thSky.value = taaOn ? ( this.reversed ? 1 : 2 ) : 0;
		if ( f.grade ) for ( const k in f.grade ) if ( u[ k ] && k !== 'bloom' && k !== 'exposureBias' ) u[ k ].value = f.grade[ k ];
		if ( this.aa === 'fxaa' ) {
			gl.setRenderTarget( T.ldr );
			this.gradeQuad.render( gl );
			gl.setRenderTarget( null );
			this.fxaa.material.uniforms.tColor.value = T.ldr.texture;
			this.fxaa.material.uniforms.texel.value.set( 1 / this.outWidth, 1 / this.outHeight );
			this.fxaa.render( gl );
		} else {
			gl.setRenderTarget( null );
			this.gradeQuad.render( gl );
		}
		// 8: meter this frame (the 1/16 bloom level), adapt, swap
		this.meterTiles.uniforms.tSrc.value = T.bloom[ 3 ].texture;
		this._pass( this.meterTiles, this.meterRT );
		const a = this.meterAdapt.uniforms;
		a.tTiles.value = this.meterRT.texture;
		a.tPrev.value = this.exposureRT[ this._exp ].texture;
		a.uDt.value = dt;
		a.uNight.value = G.uNight.value;
		a.uReset.value = this._resetExposure ? 1 : 0;
		this._resetExposure = false;
		this._exp = 1 - this._exp;
		this._pass( this.meterAdapt, this.exposureRT[ this._exp ] );
		gl.setRenderTarget( null );
	}
}

export const FS_VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// ---- the senses in the grade (items/ext/senses/logic.js viewGrade): nv: a night-vision tube (its own automatic gain
// from the metered mean, scintillation, bright lights blooming, the image circle `tube`); thermal: a white-hot / black-hot /
// ironbow core reading the scene's light as temperature, warm bodies above `heatRef` (their emissive heat term) hot and
// the sky cold; mask: the lenses of a face mask (1 twin eyepieces, 2 a dive mask, 3 a visor) with breath fog; vog: the
// yellow-grey haze. All behind uniform branches: off, they cost nothing
const SENSE_SWITCHES = [ 'nv', 'thermal', 'mask', 'vog', 'tube', 'maskFog' ];
function senseUniforms() {
	return {
		nv: { value: 0 }, nvGain: { value: 900 }, nvFloor: { value: 2.5 }, nvTarget: { value: 0.22 }, nvNoise: { value: 0.2 }, nvHalo: { value: 0.7 },
		nvWarp: { value: 0 }, nvTint: { value: new THREE.Vector3( 0.42, 1.0, 0.5 ) },
		thermal: { value: 0 }, thPalette: { value: 0 }, thRes: { value: 2 }, thNoise: { value: 0.05 }, heatRef: { value: 1 }, thSky: { value: 0 },
		tube: { value: 0 }, mask: { value: 0 }, maskKind: { value: 1 }, maskFog: { value: 0 }, vog: { value: 0 },
	};
}
const SENSE_GLSL = /* glsl */`
	uniform float nv, nvGain, nvFloor, nvTarget, nvNoise, nvHalo, nvWarp; uniform vec3 nvTint;
	uniform float thermal, thPalette, thRes, thNoise, heatRef, thSky;
	uniform float tube, mask, maskKind, maskFog, vog;
	// a night-vision tube: the light the scene had (hdr) amplified to the target, grainy, saturating, blooming
	vec3 nightVision( vec2 uv, vec3 hdr, vec3 bl, uvec2 px, uint fi ) {
		float avg = texelFetch( tExposure, ivec2( 0 ), 0 ).g;
		if ( nvWarp > 0.0 ) {
			// a Gen-1 tube: pincushion at the rim, softer there
			vec2 d = uv - 0.5;
			vec2 w = 0.5 + d * ( 1.0 + nvWarp * 0.16 * dot( d, d ) );
			hdr = texture2D( tColor, w ).rgb + bl * bloomStrength;
		}
		float g = clamp( nvTarget / max( avg, 1e-7 ), nvFloor, nvGain );
		// bright sources bloom across the photocathode: the blurred light (the bloom chain sums ~5 levels) well above
		// the frame's mean spreads round them
		float halo = max( lum( bl ) * 0.2 - avg * 2.5, 0.0 ) * nvHalo;
		float v = ( lum( hdr ) + halo ) * g;
		// scintillation: the photocathode's shot noise, coarser and stronger the harder the tube works
		float gk = sqrt( clamp( g / nvGain, 0.0, 1.0 ) );
		float n = postHash( px / 2u, fi ) + postHash( px, fi + 7u ) * 0.7 - 0.85;
		v = max( v + n * nvNoise * ( 0.3 + gk ) * ( 0.1 + sqrt( max( v, 0.0 ) ) * 0.7 ), 0.0 );
		// the phosphor screen saturates; a frame too bright for it (daylight, a lamp up close) whites out
		float p = 1.0 - exp( - v * 2.0 );
		vec2 q = uv - 0.5;
		p *= 1.0 - smoothstep( 0.1, 0.5, length( q * vec2( resolution.x / resolution.y, 1.0 ) ) ) * ( 0.3 + nvWarp * 0.25 );
		float pp = p * p;
		return mix( nvTint * ( pp * 0.9 + p * 0.06 ), vec3( pp ), pp * pp * 0.55 );
	}
	vec3 ironbow( float t ) {
		vec3 c = vec3( smoothstep( 0.18, 0.62, t ), smoothstep( 0.5, 0.92, t ), smoothstep( 0.0, 0.25, t ) * ( 1.0 - smoothstep( 0.38, 0.62, t ) ) + smoothstep( 0.86, 1.0, t ) );
		return c * c;
	}
	// a thermal core: coarse pixels; how lit a surface is stands in for how warm it is (sunlit stone, shade), the sky is
	// cold, and the warm bodies' heat term (far above any lit surface) reads hot. Zombies run cold: they are drawn dark
	vec3 thermalView( vec2 uv, uvec2 px, uint fi ) {
		vec2 res = resolution / max( thRes, 1.0 );
		vec2 cell = floor( uv * res );
		vec2 tuv = ( cell + 0.5 ) / res;
		vec3 s = texture2D( tColor, tuv ).rgb;
		vec3 b = texture2D( tBloom, tuv ).rgb;
		float avg = texelFetch( tExposure, ivec2( 0 ), 0 ).g;
		float L = lum( s );
		float env = clamp( 0.38 + 0.085 * log2( L / max( avg, 1e-7 ) + 1e-3 ), 0.06, 0.6 );
		// the sky is cold (its depth: 0 with a reversed depth buffer, 1 with a logarithmic one); four depth texels
		// round the cell, so thin fronds against it don't sparkle
		float sky = 0.0;
		if ( thSky > 0.5 ) {
			ivec2 ds = textureSize( tSkyDepth, 0 );
			ivec2 p0 = clamp( ivec2( tuv * vec2( ds ) - 0.5 ), ivec2( 0 ), ds - 2 );
			for ( int i = 0; i < 4; i ++ ) {
				float dS = texelFetch( tSkyDepth, p0 + ivec2( i & 1, i >> 1 ), 0 ).r;
				sky += ( thSky < 1.5 ? dS < 1e-7 : dS > 0.99999 ) ? 0.25 : 0.0;
			}
			env = mix( env, 0.05, sky );
		}
		float hot = smoothstep( heatRef * 0.45, heatRef, L ) * ( 1.0 - sky );
		float T = mix( env, 0.96, hot );
		// heat bleeds a little round hot things (the bloom chain's blurred light, ~5 levels summed)
		T = max( T, smoothstep( heatRef * 0.25, heatRef * 0.9, lum( b ) * 0.2 ) * 0.7 );
		T = clamp( T + ( postHash( uvec2( cell ), fi ) - 0.5 ) * thNoise, 0.0, 1.0 );
		if ( thPalette > 1.5 ) return ironbow( T );
		if ( thPalette > 0.5 ) T = 1.0 - T;
		return vec3( T * T * 0.85 + T * 0.15 );
	}
	// how much of the screen a mask's lens lets through (q: centred uv, aspect-corrected)
	float maskVis( vec2 p ) {
		if ( maskKind < 1.5 ) {
			// twin eyepieces
			float l = length( ( p - vec2( - 0.23, 0.035 ) ) * vec2( 1.0, 1.18 ) ), r = length( ( p - vec2( 0.23, 0.035 ) ) * vec2( 1.0, 1.18 ) );
			return 1.0 - smoothstep( 0.29, 0.37, min( l, r ) );
		}
		if ( maskKind < 2.5 ) {
			// a dive mask: one wide window, the nose pocket a soft shadow low in its middle
			vec2 d = abs( p - vec2( 0.0, 0.03 ) ) - vec2( 0.56, 0.24 );
			float sd = length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 ) - 0.14;
			float nose = 1.0 - smoothstep( 0.08, 0.17, length( ( p - vec2( 0.0, - 0.42 ) ) * vec2( 1.5, 1.0 ) ) );
			return ( 1.0 - smoothstep( - 0.02, 0.06, sd ) ) * ( 1.0 - nose * 0.55 );
		}
		// a visor: wide, curved at the top and bottom
		vec2 d = abs( p * vec2( 1.0, 1.0 + p.x * p.x * 0.6 ) ) - vec2( 0.72, 0.34 );
		float sd = length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 ) - 0.1;
		return 1.0 - smoothstep( - 0.02, 0.06, sd );
	}`;

const GRADE_FRAG = /* glsl */`
	uniform sampler2D tColor; uniform sampler2D tBloom; uniform sampler2D tExposure;
	uniform float bloomStrength, exposureBias, saturation, contrast, warmth, vignette, time, grain, frame;
	uniform float underwater, damage, lowBlood, drunk, sick, flash, fade;
	uniform vec2 resolution;
	varying vec2 vUv;
	${FLARE_GLSL}
	#if MOTION_BLUR
	${MB_GLSL}
	#endif

	// three's ACES fitted curve (sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT, RRT + ODT fit, ODT_SAT =>
	// XYZ => D60_2_D65 => sRGB), clamped
	vec3 RRTAndODTFit( vec3 v ) {
		vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
		vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
		return a / b;
	}
	vec3 acesFilmicToneMapping( vec3 color, float exposure ) {
		const mat3 ACESInputMat = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
		const mat3 ACESOutputMat = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
		color *= exposure / 0.6;
		color = ACESInputMat * color;
		color = RRTAndODTFit( color );
		color = ACESOutputMat * color;
		return clamp( color, 0.0, 1.0 );
	}
	// integer hash (per pixel and frame) -> [0, 1) (Tidewater PostFX.js postHash)
	float postHash( uvec2 p, uint f ) {
		uint x = p.x * 1664525u + p.y * 1013904223u + f * 2654435761u;
		x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
		return float( x >> 8u ) / 16777216.0;
	}
	float lum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
	// RCAS (AMD FSR1 robust contrast-adaptive sharpening, Tidewater PostFX.js) on the TAA-resolved image, on a
	// tonemapped proxy of the HDR values, inverted afterwards; the sky only lightly
	uniform float sharpen; uniform sampler2D tSkyDepth;
	vec3 tm( vec3 c ) { return c / ( max( c.r, max( c.g, c.b ) ) + 1.0 ); }
	vec3 loadResolved( ivec2 p ) { return texelFetch( tColor, p, 0 ).rgb; }
	vec3 rcas( vec2 uvIn ) {
		ivec2 size = textureSize( tColor, 0 );
		ivec2 pc = clamp( ivec2( uvIn * vec2( size ) ), ivec2( 1 ), size - 2 );
		vec3 e = tm( loadResolved( pc ) );
		vec3 b = tm( loadResolved( pc + ivec2( 0, -1 ) ) ); vec3 d = tm( loadResolved( pc + ivec2( -1, 0 ) ) );
		vec3 f = tm( loadResolved( pc + ivec2( 1, 0 ) ) ); vec3 h = tm( loadResolved( pc + ivec2( 0, 1 ) ) );
		vec3 mn4 = min( min( b, d ), min( f, h ) );
		vec3 mx4 = max( max( b, d ), max( f, h ) );
		vec3 hitMin = min( mn4, e ) / ( mx4 * 4.0 + 1e-5 );
		vec3 hitMax = ( vec3( 1.0 ) - max( mx4, e ) ) / ( mn4 * 4.0 - 4.0 );
		vec3 lobeRGB = max( - hitMin, hitMax );
		ivec2 ds = textureSize( tSkyDepth, 0 );
		float dS = texelFetch( tSkyDepth, clamp( ivec2( uvIn * vec2( ds ) ), ivec2( 0 ), ds - 1 ), 0 ).r;
		float skyK = dS < 1e-7 ? 0.3 : 1.0;
		float lobe = max( ${ - ( 0.25 - 1.0 / 16.0 ) }, min( max( lobeRGB.r, max( lobeRGB.g, lobeRGB.b ) ), 0.0 ) ) * sharpen * skyK;
		vec3 r = max( ( ( b + d + f + h ) * lobe + e ) / ( lobe * 4.0 + 1.0 ), vec3( 0.0 ) );
		return r / max( 1.0 - max( r.r, max( r.g, r.b ) ), 1e-3 );
	}
	vec3 toSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
	${SENSE_GLSL}

	void main() {
		vec2 uv = vUv;
		// drunk / sick: a slow wobble of the image
		float wob = drunk * 0.012 + sick * 0.004;
		uv += wob * vec2( sin( time * 1.3 + uv.y * 6.0 ), cos( time * 1.1 + uv.x * 5.0 ) );
		if ( underwater > 0.0 ) uv += underwater * 0.003 * vec2( sin( time * 2.0 + uv.y * 30.0 ), cos( time * 1.7 + uv.x * 25.0 ) );
		// (a tube or a thermal core fully up replaces the image: no sharpening to pay for)
		vec3 c = sharpen > 0.0 && max( nv, thermal ) < 1.0 ? rcas( uv ) : texture2D( tColor, uv ).rgb;
		#if MOTION_BLUR
		c = mbApply( c, uv );
		#endif
		if ( drunk > 0.0 ) c = mix( c, texture2D( tColor, uv + vec2( 0.006, 0.002 ) * drunk * sin( time ) ).rgb, 0.5 * drunk );
		vec3 bl = texture2D( tBloom, uv ).rgb;
		c += bl * bloomStrength;
		c += flareLight( vUv );
		// (the light the scene had, before the eye adapts: what a night-vision tube amplifies)
		vec3 hdr = c;
		c *= texelFetch( tExposure, ivec2( 0 ), 0 ).r * exposureBias;
		// white balance nudge + saturation + contrast around mid grey (in linear HDR)
		c *= vec3( 1.0 + warmth, 1.0, 1.0 - warmth );
		c = mix( vec3( lum( c ) ), c, saturation );
		c = pow( max( c, vec3( 0.0 ) ) / 0.18, vec3( contrast ) ) * 0.18;
		// vog: a yellow-grey sulphurous haze over everything (the world's haze thickens with it too)
		// (a veil over the shadows as well: it reads as haze even in a forest where nothing is far)
		if ( vog > 0.0 ) { float vl = lum( c ); c = mix( c, vec3( vl ) * vec3( 1.1, 1.0, 0.72 ) * 0.85 + vec3( 0.085, 0.078, 0.052 ), clamp( vog, 0.0, 1.0 ) * 0.62 ); }
		// vignette (elliptical, soft)
		vec2 q = vUv - 0.5;
		c *= 1.0 - smoothstep( 0.25, 0.75, length( q * vec2( 1.0, 0.8 ) ) ) * vignette;
		// fine film grain (luminance-weighted): triangular white noise on the pixel grid, new every frame
		uvec2 px = uvec2( gl_FragCoord.xy );
		uint fi = uint( frame );
		float n = ( postHash( px, fi ) + postHash( px + uvec2( 7919u, 104729u ), fi ) - 1.0 ) * 0.5;
		c += c * ( n * grain );
		// low blood drains the colour
		c = mix( c, vec3( lum( c ) ), clamp( lowBlood * 0.85, 0.0, 1.0 ) );
		vec3 t = acesFilmicToneMapping( c, ${EXPOSURE.toFixed( 2 )} );
		// a night-vision tube or a thermal core instead of the eye, inside its image circle
		vec2 qa = q * vec2( resolution.x / resolution.y, 1.0 );
		if ( nv > 0.0 ) t = mix( t, nightVision( uv, hdr, bl, px, fi ), nv );
		else if ( thermal > 0.0 ) t = mix( t, thermalView( uv, px, fi ), thermal );
		if ( tube > 0.0 ) t *= 1.0 - smoothstep( tube - 0.015, tube + 0.004, length( qa ) );
		// display-space effects: underwater absorption toward blue-green, low-blood vignette, damage rim, flash
		t = mix( t, t * vec3( 0.35, 0.8, 0.95 ) + vec3( 0.0, 0.05, 0.08 ), underwater );
		float r = dot( q, q );
		t *= 1.0 - lowBlood * 0.6 * smoothstep( 0.0, 0.5, r * 2.0 );
		t = mix( t, vec3( 0.55, 0.02, 0.02 ), damage * smoothstep( 0.05, 0.5, r * 1.8 ) * 0.8 );
		// a mask's lenses: dark rubber round them, the glass a touch dimmer, breath fogging it from below
		if ( mask > 0.0 ) {
			float mv = maskVis( qa );
			// (a dive mask's skirt is clear silicone: light comes through it, blurred)
			t *= mix( 1.0, mv * 0.93 + ( 1.0 - mv ) * ( abs( maskKind - 2.0 ) < 0.5 ? 0.3 : 0.025 ), mask );
			t = mix( t, vec3( 0.62, 0.64, 0.66 ) * ( 0.35 + lum( t ) ), maskFog * mv * ( 1.0 - smoothstep( - 0.45, 0.05, qa.y ) ) * 0.55 * mask );
		}
		t += vec3( flash );
		t = toSRGB( clamp( t, 0.0, 1.0 ) );
		// +-1 LSB triangular dither before the 8-bit output: no banding in the sky gradients
		t += ( postHash( px + uvec2( 31337u, 271u ), fi ) + postHash( px + uvec2( 1013u, 65537u ), fi ) - 1.0 ) / 255.0;
		t *= 1.0 - fade;
		gl_FragColor = vec4( t, 1.0 );
	}`;

const FXAA_FRAG = /* glsl */`
	uniform sampler2D tColor; uniform vec2 texel; varying vec2 vUv;
	float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
	void main() {
		vec3 rgbNW = texture2D( tColor, vUv + vec2( -1.0, -1.0 ) * texel ).rgb;
		vec3 rgbNE = texture2D( tColor, vUv + vec2( 1.0, -1.0 ) * texel ).rgb;
		vec3 rgbSW = texture2D( tColor, vUv + vec2( -1.0, 1.0 ) * texel ).rgb;
		vec3 rgbSE = texture2D( tColor, vUv + vec2( 1.0, 1.0 ) * texel ).rgb;
		vec3 rgbM = texture2D( tColor, vUv ).rgb;
		float lumaNW = luma( rgbNW ), lumaNE = luma( rgbNE ), lumaSW = luma( rgbSW ), lumaSE = luma( rgbSE ), lumaM = luma( rgbM );
		float lumaMin = min( lumaM, min( min( lumaNW, lumaNE ), min( lumaSW, lumaSE ) ) );
		float lumaMax = max( lumaM, max( max( lumaNW, lumaNE ), max( lumaSW, lumaSE ) ) );
		vec2 dir = vec2( -( ( lumaNW + lumaNE ) - ( lumaSW + lumaSE ) ), ( lumaNW + lumaSW ) - ( lumaNE + lumaSE ) );
		float dirReduce = max( ( lumaNW + lumaNE + lumaSW + lumaSE ) * 0.03125, 1.0 / 128.0 );
		float rcpDirMin = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + dirReduce );
		dir = min( vec2( 8.0 ), max( vec2( -8.0 ), dir * rcpDirMin ) ) * texel;
		vec3 rgbA = 0.5 * ( texture2D( tColor, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb + texture2D( tColor, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
		vec3 rgbB = rgbA * 0.5 + 0.25 * ( texture2D( tColor, vUv + dir * -0.5 ).rgb + texture2D( tColor, vUv + dir * 0.5 ).rgb );
		float lumaB = luma( rgbB );
		gl_FragColor = vec4( ( lumaB < lumaMin || lumaB > lumaMax ) ? rgbA : rgbB, 1.0 );
	}`;
