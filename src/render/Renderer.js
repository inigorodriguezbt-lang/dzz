// Frame pipeline:
//   1. opaque world (layer 0) + sky into sceneRT (HDR colour + depth texture), cascaded sun shadows
//   2. composite into mainRT (colour + depth copied), then water and transparents (layer 1) that read
//      sceneRT's colour and depth for refraction and depth-based absorption
//   3. first-person view model (its own scene and camera) over a cleared depth
//   4. bloom chain, then grading: exposure, ACES, saturation / contrast / warmth, vignette, grain,
//      underwater tint and the damage / low-blood effects; optional FXAA
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const LAYER_WORLD = 0;
export const LAYER_POST = 1;

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

		this.bloomDown = new THREE.ShaderMaterial( {
			name: 'BloomDown',
			uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0 } },
			vertexShader: FS_VERT,
			fragmentShader: /* glsl */`
				uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; varying vec2 vUv;
				vec3 s( vec2 o ) { return texture2D( tSrc, vUv + o * texel ).rgb; }
				void main() {
					// 13-tap downsample (Jimenez 2014)
					vec3 a = s( vec2( -2, 2 ) ), b = s( vec2( 0, 2 ) ), c = s( vec2( 2, 2 ) );
					vec3 d = s( vec2( -2, 0 ) ), e = s( vec2( 0, 0 ) ), f = s( vec2( 2, 0 ) );
					vec3 g = s( vec2( -2, -2 ) ), h = s( vec2( 0, -2 ) ), i = s( vec2( 2, -2 ) );
					vec3 j = s( vec2( -1, 1 ) ), k = s( vec2( 1, 1 ) ), l = s( vec2( -1, -1 ) ), m = s( vec2( 1, -1 ) );
					vec3 col = e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + k + l + m ) * 0.125;
					if ( threshold > 0.0 ) {
						float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
						col *= clamp( ( lum - threshold ) / max( lum, 1e-4 ), 0.0, 1.0 );
						col = min( col, vec3( 60.0 ) );
					}
					gl_FragColor = vec4( col, 1.0 );
				}`,
			depthTest: false, depthWrite: false,
		} );
		this.bloomUp = new THREE.ShaderMaterial( {
			name: 'BloomUp',
			uniforms: { tSrc: { value: null }, tPrev: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } },
			vertexShader: FS_VERT,
			fragmentShader: /* glsl */`
				uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 texel; uniform float radius; varying vec2 vUv;
				void main() {
					vec2 o = texel * radius;
					vec3 c = texture2D( tSrc, vUv ).rgb * 4.0;
					c += ( texture2D( tSrc, vUv + vec2( o.x, 0 ) ).rgb + texture2D( tSrc, vUv - vec2( o.x, 0 ) ).rgb + texture2D( tSrc, vUv + vec2( 0, o.y ) ).rgb + texture2D( tSrc, vUv - vec2( 0, o.y ) ).rgb ) * 2.0;
					c += texture2D( tSrc, vUv + o ).rgb + texture2D( tSrc, vUv - o ).rgb + texture2D( tSrc, vUv + vec2( o.x, -o.y ) ).rgb + texture2D( tSrc, vUv + vec2( -o.x, o.y ) ).rgb;
					gl_FragColor = vec4( c / 16.0 + texture2D( tPrev, vUv ).rgb, 1.0 );
				}`,
			depthTest: false, depthWrite: false,
		} );
		this.bloomQuad = new FullScreenQuad( this.bloomDown );

		this.grade = new THREE.ShaderMaterial( {
			name: 'Grade',
			uniforms: {
				tColor: { value: null }, tBloom: { value: null }, bloomStrength: { value: 0.06 }, exposure: { value: 1 },
				saturation: { value: 1.08 }, contrast: { value: 1.06 }, warmth: { value: 0.03 }, vignette: { value: 0.28 },
				time: { value: 0 }, grain: { value: 0.018 }, underwater: { value: 0 }, damage: { value: 0 }, lowBlood: { value: 0 },
				drunk: { value: 0 }, sick: { value: 0 }, flash: { value: 0 }, fade: { value: 0 }, resolution: { value: new THREE.Vector2() },
				night: { value: 0 },
			},
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

	resize( w, h ) {
		const scale = this.settings.get( 'renderScale' );
		const dpr = Math.min( window.devicePixelRatio || 1, 2 );
		this.gl.setPixelRatio( dpr * Math.min( 1, scale ) );
		this.gl.setSize( w, h );
		const W = Math.max( 1, Math.round( w * dpr * scale ) ), H = Math.max( 1, Math.round( h * dpr * scale ) );
		if ( this.targets && W === this.width && H === this.height && this.targets.aa === this.aa ) return;
		this.width = W; this.height = H;
		this._makeTargets();
	}

	_makeTargets() {
		if ( this.targets ) for ( const t of this.targets.list ) t.dispose();
		const W = this.width, H = this.height;
		const samples = this.aa === 'msaa' ? Math.min( 4, this.maxSamples ) : 0;
		const depthTex = new THREE.DepthTexture( W, H, THREE.FloatType );
		depthTex.format = THREE.DepthFormat;
		const scene = new THREE.WebGLRenderTarget( W, H, { type: THREE.HalfFloatType, samples, depthTexture: depthTex, depthBuffer: true } );
		scene.texture.minFilter = scene.texture.magFilter = THREE.LinearFilter;
		scene.texture.generateMipmaps = false;
		const main = new THREE.WebGLRenderTarget( W, H, { type: THREE.HalfFloatType, samples, depthBuffer: true } );
		const ldr = new THREE.WebGLRenderTarget( W, H, { type: THREE.UnsignedByteType } );
		const bloom = [];
		let bw = W >> 1, bh = H >> 1;
		for ( let i = 0; i < 6 && bw > 2 && bh > 2; i ++ ) {
			bloom.push( new THREE.WebGLRenderTarget( bw, bh, { type: THREE.HalfFloatType, depthBuffer: false } ) );
			bw >>= 1; bh >>= 1;
		}
		const bloomUp = bloom.map( t => new THREE.WebGLRenderTarget( t.width, t.height, { type: THREE.HalfFloatType, depthBuffer: false } ) );
		this.targets = { scene, main, ldr, bloom, bloomUp, aa: this.aa, list: [ scene, main, ldr, ...bloom, ...bloomUp ] };
		this.grade.uniforms.resolution.value.set( W, H );
	}

	get sceneColor() { return this.targets.scene.texture; }
	get sceneDepth() { return this.targets.scene.depthTexture; }

	// frame: { scene, camera, viewScene, viewCamera, onBeforeTransparent, grade: {...} }
	render( f ) {
		const gl = this.gl, T = this.targets, cam = f.camera;
		gl.info.reset();
		// 1: opaque + sky
		gl.shadowMap.needsUpdate = f.shadows !== false;
		cam.layers.set( LAYER_WORLD );
		gl.setRenderTarget( T.scene );
		gl.setClearColor( 0x000000, 1 );
		gl.clear( true, true, false );
		gl.render( f.scene, cam );
		// 2: composite + transparents
		gl.setRenderTarget( T.main );
		gl.clear( true, true, false );
		this.composite.material.uniforms.tColor.value = T.scene.texture;
		this.composite.material.uniforms.tDepth.value = T.scene.depthTexture;
		this.composite.render( gl );
		cam.layers.set( LAYER_POST );
		gl.render( f.scene, cam );
		cam.layers.set( LAYER_WORLD );
		// 3: view model
		if ( f.viewScene ) {
			gl.clear( false, true, false );
			gl.render( f.viewScene, f.viewCamera );
		}
		// 4: bloom
		const bloomOn = this.settings.get( 'bloom' ) && T.bloom.length > 2;
		if ( bloomOn ) {
			let src = T.main.texture, sw = this.width, sh = this.height;
			this.bloomQuad.material = this.bloomDown;
			for ( let i = 0; i < T.bloom.length; i ++ ) {
				this.bloomDown.uniforms.tSrc.value = src;
				this.bloomDown.uniforms.texel.value.set( 1 / sw, 1 / sh );
				this.bloomDown.uniforms.threshold.value = i === 0 ? 1.1 : 0;
				gl.setRenderTarget( T.bloom[ i ] );
				this.bloomQuad.render( gl );
				src = T.bloom[ i ].texture; sw = T.bloom[ i ].width; sh = T.bloom[ i ].height;
			}
			this.bloomQuad.material = this.bloomUp;
			let prev = T.bloom[ T.bloom.length - 1 ].texture;
			for ( let i = T.bloom.length - 2; i >= 0; i -- ) {
				this.bloomUp.uniforms.tSrc.value = T.bloom[ i + 1 ].texture;
				this.bloomUp.uniforms.tPrev.value = i === T.bloom.length - 2 ? T.bloom[ i ].texture : prev;
				this.bloomUp.uniforms.texel.value.set( 1 / T.bloom[ i + 1 ].width, 1 / T.bloom[ i + 1 ].height );
				gl.setRenderTarget( T.bloomUp[ i ] );
				this.bloomQuad.render( gl );
				prev = T.bloomUp[ i ].texture;
			}
			this.grade.uniforms.tBloom.value = prev;
		}
		this.grade.uniforms.bloomStrength.value = bloomOn ? ( f.grade?.bloom ?? 0.06 ) : 0;
		if ( ! bloomOn ) this.grade.uniforms.tBloom.value = T.main.texture;
		// 5: grade (+ FXAA)
		const u = this.grade.uniforms;
		u.tColor.value = T.main.texture;
		if ( f.grade ) for ( const k in f.grade ) if ( u[ k ] && k !== 'bloom' ) u[ k ].value = f.grade[ k ];
		if ( this.aa === 'fxaa' ) {
			gl.setRenderTarget( T.ldr );
			this.gradeQuad.render( gl );
			gl.setRenderTarget( null );
			this.fxaa.material.uniforms.tColor.value = T.ldr.texture;
			this.fxaa.material.uniforms.texel.value.set( 1 / this.width, 1 / this.height );
			this.fxaa.render( gl );
		} else {
			gl.setRenderTarget( null );
			this.gradeQuad.render( gl );
		}
	}
}

export const FS_VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const GRADE_FRAG = /* glsl */`
	uniform sampler2D tColor; uniform sampler2D tBloom;
	uniform float bloomStrength, exposure, saturation, contrast, warmth, vignette, time, grain;
	uniform float underwater, damage, lowBlood, drunk, sick, flash, fade, night;
	uniform vec2 resolution;
	varying vec2 vUv;

	// ACES filmic (the fitted RRT + ODT three.js uses)
	vec3 RRTAndODTFit( vec3 v ) {
		vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
		vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
		return a / b;
	}
	vec3 ACESFilmic( vec3 color ) {
		const mat3 ACESInputMat = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
		const mat3 ACESOutputMat = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
		color *= 1.0 / 0.6;
		color = ACESInputMat * color;
		color = RRTAndODTFit( color );
		color = ACESOutputMat * color;
		return clamp( color, 0.0, 1.0 );
	}
	float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
	vec3 toSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }

	void main() {
		vec2 uv = vUv;
		// drunk / sick: a slow wobble of the image
		float wob = drunk * 0.012 + sick * 0.004;
		uv += wob * vec2( sin( time * 1.3 + uv.y * 6.0 ), cos( time * 1.1 + uv.x * 5.0 ) );
		if ( underwater > 0.0 ) uv += underwater * 0.003 * vec2( sin( time * 2.0 + uv.y * 30.0 ), cos( time * 1.7 + uv.x * 25.0 ) );
		vec3 c = texture2D( tColor, uv ).rgb;
		if ( drunk > 0.0 ) c = mix( c, texture2D( tColor, uv + vec2( 0.006, 0.002 ) * drunk * sin( time ) ).rgb, 0.5 * drunk );
		c += texture2D( tBloom, uv ).rgb * bloomStrength;
		c *= exposure;
		// low blood drains the colour and darkens the edges
		float lum = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
		c = mix( c, vec3( lum ), clamp( lowBlood * 0.85, 0.0, 1.0 ) );
		vec3 t = ACESFilmic( c );
		// grading on the display-referred image
		float l2 = dot( t, vec3( 0.2126, 0.7152, 0.0722 ) );
		t = mix( vec3( l2 ), t, saturation );
		t = ( t - 0.5 ) * contrast + 0.5;
		t += vec3( warmth, warmth * 0.35, - warmth ) * 0.5;
		// night: a cool, slightly desaturated moonlight grade
		t = mix( t, t * vec3( 0.86, 0.95, 1.18 ), night * 0.6 );
		// underwater: absorption towards blue-green
		t = mix( t, t * vec3( 0.35, 0.8, 0.95 ) + vec3( 0.0, 0.05, 0.08 ), underwater );
		vec2 q = vUv - 0.5;
		float r = dot( q, q );
		float vig = 1.0 - vignette * smoothstep( 0.05, 0.6, r * 1.6 );
		vig *= 1.0 - lowBlood * 0.6 * smoothstep( 0.0, 0.5, r * 2.0 );
		t *= vig;
		// damage: a red rim that fades
		t = mix( t, vec3( 0.55, 0.02, 0.02 ), damage * smoothstep( 0.05, 0.5, r * 1.8 ) * 0.8 );
		t += vec3( flash );
		t = clamp( t, 0.0, 1.0 );
		t = toSRGB( t );
		t += ( hash( vUv * resolution + fract( time ) * 91.0 ) - 0.5 ) * grain;
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
