// Ported from Tidewater src/ocean/FoamTexture.js (MIT, see LICENSE-Tidewater.txt)
// The water's tileable patterns, one mipmapped 1024^2 RGBA8 array texture (one sampler for all three):
//  layer 0: Tidewater's procedural foam, generated once on the GPU (a fragment pass instead of the compute
//    kernel). Real sea foam is an irregular bubbly mat: dense rafts with ragged edges, holes of every size,
//    thin bubble streaks, and fine bubbles. Thresholding this density field against the local foam coverage
//    (in the water shader) makes foam grow, tear into lace and dissolve naturally.
//    R: foam density field (thresholded by coverage)  G: fine bubble detail  B: soft mottling  A: streaks
//  layer 1: the surf lace (SurfFoam.js laceData, 512^2 from the worker, upsampled bilinearly)
//  layer 2: the sea detail noise (SeaDetail.js, 256^2, upsampled bilinearly)
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const PATTERN_FOAM = 0, PATTERN_LACE = 1, PATTERN_DETAIL = 2;

const COPY = new THREE.RawShaderMaterial( {
	glslVersion: THREE.GLSL3,
	vertexShader: /* glsl */`in vec3 position; void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
	fragmentShader: /* glsl */`
		precision highp float;
		uniform sampler2D tSrc; uniform float uSize;
		out vec4 o;
		void main() { o = texture( tSrc, gl_FragCoord.xy / uSize ); }`,
	uniforms: { tSrc: { value: null }, uSize: { value: 1024 } },
	depthTest: false, depthWrite: false,
} );

// a tileable RGBA texture ( Uint8 or half-float data, n x n ) into one layer of the pattern array
export function writePatternLayer( renderer, rt, layer, data, n, type = THREE.UnsignedByteType ) {
	const src = new THREE.DataTexture( data, n, n, THREE.RGBAFormat, type );
	src.wrapS = src.wrapT = THREE.RepeatWrapping;
	src.magFilter = src.minFilter = THREE.LinearFilter;
	src.generateMipmaps = false;
	src.needsUpdate = true;
	COPY.uniforms.tSrc.value = src;
	COPY.uniforms.uSize.value = rt.width;
	const quad = new FullScreenQuad( COPY );
	const prev = renderer.getRenderTarget();
	rt.texture.generateMipmaps = true;
	renderer.setRenderTarget( rt, layer );
	quad.render( renderer );
	renderer.setRenderTarget( prev );
	rt.texture.generateMipmaps = false;
	quad.dispose();
	src.dispose();
}

export function createPatternTexture( renderer, size = 1024 ) {
	const rt = new THREE.WebGLArrayRenderTarget( size, size, 3, {
		depth: 3, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
		wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
		minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
	} );
	rt.texture.anisotropy = 4;
	rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
	rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
	// fbm( uv, base, oct ) unrolled (constant octave weights)
	const fbm = ( uv, base, oct ) => {
		let s = '', a = 0.5, n = 0;
		for ( let o = 0; o < oct; o ++ ) {
			s += `${ s ? ' + ' : '' }vnoise( ${ uv }, ${ ( base * Math.pow( 2, o ) ).toFixed( 1 ) } ) * ${ a }`;
			n += a;
			a *= 0.5;
		}
		return `( ( ${ s } ) / ${ n } )`;
	};
	const mat = new THREE.RawShaderMaterial( {
		glslVersion: THREE.GLSL3,
		vertexShader: /* glsl */`in vec3 position; void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
		fragmentShader: /* glsl */`
			precision highp float;
			out vec4 o;
			vec2 hash2( vec2 p ) { return fract( sin( vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 ); }
			vec2 fmod2( vec2 x, float y ) { return x - y * floor( x / y ); }
			// periodic worley F1 with jittered cell sizes
			float worley( vec2 uv, float cells ) {
				vec2 p = uv * cells;
				vec2 ip = floor( p );
				vec2 fp = fract( p );
				float f1 = 8.0;
				for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
					vec2 off = vec2( float( i ), float( j ) );
					vec2 cell = fmod2( ip + off, cells );
					vec2 h = hash2( cell );
					f1 = min( f1, length( off + h - fp ) );
				}
				return f1;
			}
			float vnoise( vec2 uv, float cells ) {
				vec2 p = uv * cells;
				vec2 i = floor( p );
				vec2 f = fract( p );
				vec2 u = f * f * ( 3.0 - f * 2.0 );
				float a = hash2( fmod2( i, cells ) ).x;
				float b = hash2( fmod2( i + vec2( 1.0, 0.0 ), cells ) ).x;
				float c = hash2( fmod2( i + vec2( 0.0, 1.0 ), cells ) ).x;
				float d = hash2( fmod2( i + vec2( 1.0, 1.0 ), cells ) ).x;
				return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
			}
			void main() {
				vec2 uv = floor( gl_FragCoord.xy ) / ${ size }.0 + 0.5 / ${ size }.0;
				// domain warp (organic, flowing shapes)
				vec2 w1 = ( vec2( ${ fbm( 'uv', 3, 4 ) }, ${ fbm( '( uv + 0.43 )', 3, 4 ) } ) - 0.5 ) * 0.14;
				vec2 wuv = uv + w1;
				// density: ragged rafts
				float dens = ${ fbm( 'wuv', 4, 6 ) };
				// holes of many sizes punched through the mat (worley, radius varied by noise)
				float holeA = smoothstep( 0.28, 0.12, worley( wuv, 7.0 ) + ( ${ fbm( 'uv', 16, 3 ) } - 0.5 ) * 0.25 );
				float holeB = smoothstep( 0.30, 0.16, worley( wuv + 0.17, 19.0 ) + ( ${ fbm( 'uv', 32, 2 ) } - 0.5 ) * 0.3 );
				float holeC = smoothstep( 0.32, 0.18, worley( wuv + 0.61, 47.0 ) );
				float holes = clamp( holeA * 0.9 + holeB * 0.7 + holeC * 0.45, 0.0, 1.0 );
				// fine bubbles: small bright dots
				float bub = smoothstep( 0.24, 0.08, worley( uv + 0.33, 140.0 ) ) * 0.8 + smoothstep( 0.2, 0.05, worley( uv + 0.71, 260.0 ) ) * 0.5;
				// streaks (drawn out by flow)
				vec2 suv = uv + w1 * 2.0;
				float streak = ${ fbm( 'suv', 12, 4 ) };
				float foam = clamp( dens * 1.35 - holes * 0.55 + bub * 0.08, 0.0, 1.0 );
				float mottle = ${ fbm( 'uv', 2, 3 ) };
				o = vec4( foam, clamp( bub, 0.0, 1.0 ), mottle, streak );
			}`,
		depthTest: false, depthWrite: false,
	} );
	const quad = new FullScreenQuad( mat );
	const prev = renderer.getRenderTarget();
	renderer.setRenderTarget( rt, PATTERN_FOAM );
	quad.render( renderer );
	renderer.setRenderTarget( prev );
	quad.dispose();
	mat.dispose();
	// (the lace arrives later from the worker: a neutral stand-in, holes everywhere)
	writePatternLayer( renderer, rt, PATTERN_LACE, new Uint8Array( [ 200, 0, 128, 128 ] ), 1 );
	return rt;
}
