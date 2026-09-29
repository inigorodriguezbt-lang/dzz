// Ported from Tidewater src/post/MotionBlur.js (MIT, see LICENSE-Tidewater.txt).
// Camera motion blur: the reconstruction filter of McGuire et al. 2012 ("A Reconstruction Filter for
// Plausible Motion Blur") with the Call of Duty: Advanced Warfare refinements (Jimenez 2014):
//   1. tile max: per 20x20 output-pixel tile the longest velocity (and the shortest, for the fast path)
//   2. neighbour max: the longest over the 3x3 tiles around each tile (a streak is capped to one tile
//      each way, so every streak reaching a pixel starts within one tile of it)
//   3. gather, inlined in the grade (mbApply): 4-12 jittered samples along the neighbourhood's dominant
//      motion and the pixel's own, with soft depth comparisons; tiles whose velocities are all alike
//      (camera rotation) take a colour-only fast path; tiles with no motion (< 0.5 px) stay untouched.
// Velocity is camera-only reprojection of the depth (with the water) with this and last frame's
// unjittered cameras (the TAA jitter never blurs). The fragment passes replace the compute kernels.
// Runs only with TAA (the resolved image and its depth copy); the view model is masked out.
// WebGL conventions: uv.y up, reversed-Z depth (0 = sky).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const TILE = 20; // tile side in output pixels = maximum blur radius (streak <= 2 * TILE)

const VERT = /* glsl */`
	void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// shared by the tile passes and the gather: uniforms tMbDepth, uMbVP, uMbPrevVP, uMbInvVP, uMbOutSize,
// uMbShutter
const SHARED = /* glsl */`
	const float MB_TILE = ${ TILE }.0;
	// uv motion (current - previous) of the depth texel q, whose pixel centre is at uv
	vec2 mbUvVelocity( ivec2 q, vec2 uv ) {
		float d = texelFetch( tMbDepth, q, 0 ).r;
		// the sky (depth 0) reprojects its far-plane point: only the camera rotation moves it
		vec4 w = uMbInvVP * vec4( uv * 2.0 - 1.0, d, 1.0 );
		vec4 p = uMbPrevVP * vec4( w.xyz / w.w, 1.0 );
		if ( p.w <= 1e-6 ) return vec2( 0.0 );
		return uv - ( p.xy / p.w * 0.5 + 0.5 );
	}
	// uv velocity -> half streak vector in output pixels (shutter applied, capped at one tile)
	vec2 mbToPx( vec2 vel ) {
		vec2 v = vel * uMbOutSize * ( uMbShutter * 0.5 );
		float l = length( v );
		return v * min( 1.0, MB_TILE / max( l, 1e-6 ) );
	}
	ivec2 mbTexel( vec2 uv ) { ivec2 s = textureSize( tMbDepth, 0 ); return clamp( ivec2( uv * vec2( s ) ), ivec2( 0 ), s - 1 ); }
`;

const PARS = /* glsl */`
	uniform sampler2D tMbDepth; uniform mat4 uMbInvVP; uniform mat4 uMbPrevVP; uniform vec2 uMbOutSize; uniform float uMbShutter;
`;

// 1. per tile: xy = longest half streak (px), z = its length, w = the shortest length in the tile
const TILE_FRAG = /* glsl */`
	${ PARS }
	${ SHARED }
	void main() {
		ivec2 tile = ivec2( gl_FragCoord.xy );
		vec2 best = vec2( 0.0 ); float bestL = 0.0; float minL = 1e8;
		for ( int y = 0; y < ${ TILE }; y ++ ) for ( int x = 0; x < ${ TILE }; x ++ ) {
			vec2 p = vec2( tile * ${ TILE } + ivec2( x, y ) ) + 0.5;
			if ( p.x > uMbOutSize.x || p.y > uMbOutSize.y ) continue;
			vec2 uv = p / uMbOutSize;
			vec2 v = mbToPx( mbUvVelocity( mbTexel( uv ), uv ) );
			float l = dot( v, v );
			if ( l > bestL ) { bestL = l; best = v; }
			minL = min( minL, l );
		}
		gl_FragColor = vec4( best, sqrt( bestL ), sqrt( min( minL, 1e8 ) ) );
	}`;

// 2. per tile: the dominant streak over the 3x3 tiles (a diagonal tile only when its streak runs toward
// this one), and the shortest streak of the neighbourhood
let neigh = '';
for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) {
	let take = 'm.z > best.z';
	if ( dx !== 0 && dy !== 0 ) take += ` && abs( dot( m.xy, vec2( ${ ( - dx * Math.SQRT1_2 ).toFixed( 8 ) }, ${ ( - dy * Math.SQRT1_2 ).toFixed( 8 ) } ) ) ) > m.z * 0.7`;
	neigh += /* glsl */`
		{
			vec4 m = texelFetch( tTiles, clamp( t + ivec2( ${ dx }, ${ dy } ), ivec2( 0 ), n - 1 ), 0 );
			if ( ${ take } ) best = m;
			minL = min( minL, m.w );
		}`;
}
const NEIGHBOR_FRAG = /* glsl */`
	uniform sampler2D tTiles;
	void main() {
		ivec2 t = ivec2( gl_FragCoord.xy );
		ivec2 n = textureSize( tTiles, 0 );
		vec4 best = vec4( 0.0 ); float minL = 1e8;
		${ neigh }
		gl_FragColor = vec4( best.xyz, minL );
	}`;

// 3. the gather, for the grade: mbApply( sharpColor, uv ) -> the blurred colour. Reads tColor (the
// resolved image, unsharpened: sharpening never acts on blurred pixels); uniforms tMbNeighbor, tMbVM (the
// view model's depth, > 0 where it is drawn), uMbFrame and the shared ones
export const MB_GLSL = /* glsl */`
	${ PARS }
	uniform sampler2D tMbNeighbor; uniform sampler2D tMbVM; uniform float uMbFrame; uniform float uMbVMOn;
	${ SHARED }
	vec3 mbSample( vec2 uv ) { return textureLod( tColor, uv, 0.0 ).rgb; }
	bool mbIsVM( vec2 uv ) {
		if ( uMbVMOn < 0.5 ) return false;
		ivec2 s = textureSize( tMbVM, 0 );
		return texelFetch( tMbVM, clamp( ivec2( uv * vec2( s ) ), ivec2( 0 ), s - 1 ), 0 ).r > 0.0;
	}
	vec3 mbApply( vec3 sharpColor, vec2 uvIn ) {
		vec3 outC = sharpColor;
		if ( uMbShutter > 0.0 && ! mbIsVM( uvIn ) ) {
			vec2 pix = uvIn * uMbOutSize;
			ivec2 nt = textureSize( tMbNeighbor, 0 );
			ivec2 tile = clamp( ivec2( floor( pix / MB_TILE ) ), ivec2( 0 ), nt - 1 );
			vec4 nm = texelFetch( tMbNeighbor, tile, 0 );
			float nmLen = nm.z;
			if ( nmLen >= 0.5 ) {
				ivec2 cX = mbTexel( uvIn );
				float dX = texelFetch( tMbDepth, cX, 0 ).r;
				vec2 vX = mbToPx( mbUvVelocity( cX, uvIn ) );
				float lenX = length( vX );
				// interleaved gradient noise, shifted every frame
				vec2 pn = floor( pix ) + uMbFrame * 5.588238;
				float jitter = fract( fract( dot( pn, vec2( 0.06711056, 0.00583715 ) ) ) * 52.9829189 ) - 0.5;
				// sample pairs ~3 px apart along the streak, 2..6 pairs
				int pairs = int( clamp( ceil( nmLen / 3.0 ), 2.0, 6.0 ) );
				vec2 invSize = 1.0 / uMbOutSize;
				vec3 acc = vec3( 0.0 );
				float fade = clamp( nmLen - 0.5, 0.0, 1.0 ); // continuous with the early-out below 0.5 px
				if ( nm.w > nmLen * 0.75 ) {
					// fast path: all streaks alike (camera rotation, distant scenery): a directional average
					// along the pixel's own motion
					for ( int i = 0; i < 6; i ++ ) {
						if ( i >= pairs ) break;
						float tt = ( float( i ) + 0.5 + jitter ) / float( pairs );
						vec2 o = vX * tt * invSize;
						acc += mbIsVM( uvIn + o ) ? sharpColor : mbSample( uvIn + o );
						acc += mbIsVM( uvIn - o ) ? sharpColor : mbSample( uvIn - o );
					}
					outC = mix( sharpColor, acc / ( float( pairs ) * 2.0 ), fade );
				} else {
					// full reconstruction: soft depth classification of each sample against the centre
					float wSum = 0.0;
					vec2 dirX = lenX > 0.5 ? vX : nm.xy;
					for ( int i = 0; i < 6; i ++ ) {
						if ( i >= pairs ) break;
						float tt = ( float( i ) + 0.5 + jitter ) / float( pairs );
						// alternate between the neighbourhood's dominant direction and the pixel's own
						vec2 dir = ( i & 1 ) == 1 ? dirX : nm.xy;
						vec2 off = dir * tt;
						float offLen = length( off );
						for ( int k = 0; k < 2; k ++ ) {
							float sgn = k == 0 ? 1.0 : -1.0;
							vec2 uvY = uvIn + off * invSize * sgn;
							if ( mbIsVM( uvY ) ) continue;
							ivec2 tY = mbTexel( uvY );
							float dY = texelFetch( tMbDepth, tY, 0 ).r;
							float lenY = length( mbToPx( mbUvVelocity( tY, uvY ) ) );
							// reversed-Z depth ~ 1 / distance: q > 0 when the sample is farther than the centre
							float q = ( dX - dY ) / max( max( dX, dY ), 1e-12 );
							float behind = clamp( q * 40.0 + 0.5, 0.0, 1.0 );
							// a sample behind the centre shows through the centre's own streak; one in front covers
							// the centre when its streak reaches it (1 px soft cylinders)
							float spreadX = clamp( lenX - max( offLen - 1.0, 0.0 ), 0.0, 1.0 );
							float spreadY = clamp( lenY - max( offLen - 1.0, 0.0 ), 0.0, 1.0 );
							float w = behind * spreadX + ( 1.0 - behind ) * spreadY;
							acc += mbSample( uvY ) * w;
							wSum += w;
						}
					}
					// whatever the samples don't cover is this pixel's own (sharpened) colour
					float nS = float( pairs ) * 2.0;
					vec3 res = acc / nS + sharpColor * max( 1.0 - wSum / nS, 0.0 );
					outC = mix( sharpColor, res, fade );
				}
			}
		}
		return outC;
	}
`;

function tiles() {
	const t = new THREE.WebGLRenderTarget( 1, 1, { type: THREE.HalfFloatType, depthBuffer: false } );
	t.texture.minFilter = t.texture.magFilter = THREE.NearestFilter;
	t.texture.generateMipmaps = false;
	return t;
}

export class MotionBlur {
	constructor() {
		this.shutter = 0.5; // fraction of the frame time the shutter is open (180 degrees)
		this.tileRT = tiles();
		this.neighborRT = tiles();
		// shared with the grade's uniforms
		this.uniforms = {
			tMbDepth: { value: null }, uMbInvVP: { value: new THREE.Matrix4() }, uMbPrevVP: { value: new THREE.Matrix4() },
			uMbOutSize: { value: new THREE.Vector2( 1, 1 ) }, uMbShutter: { value: 0 },
			tMbNeighbor: { value: this.neighborRT.texture }, tMbVM: { value: null }, uMbFrame: { value: 0 }, uMbVMOn: { value: 0 },
		};
		const U = this.uniforms;
		this.tileMat = new THREE.ShaderMaterial( { name: 'MotionBlurTiles', vertexShader: VERT, fragmentShader: TILE_FRAG, depthTest: false, depthWrite: false,
			uniforms: { tMbDepth: U.tMbDepth, uMbInvVP: U.uMbInvVP, uMbPrevVP: U.uMbPrevVP, uMbOutSize: U.uMbOutSize, uMbShutter: U.uMbShutter } } );
		this.neighborMat = new THREE.ShaderMaterial( { name: 'MotionBlurNeighbours', vertexShader: VERT, fragmentShader: NEIGHBOR_FRAG, depthTest: false, depthWrite: false,
			uniforms: { tTiles: { value: this.tileRT.texture } } } );
		this.quad = new FullScreenQuad();
		this._vp = new THREE.Matrix4();
		this._prevVP = new THREE.Matrix4();
		this._hasPrev = false;
		this._frame = 0;
	}

	setSize( w, h ) {
		const tx = Math.max( 1, Math.ceil( w / TILE ) ), ty = Math.max( 1, Math.ceil( h / TILE ) );
		this.tileRT.setSize( tx, ty );
		this.neighborRT.setSize( tx, ty );
		this.uniforms.uMbOutSize.value.set( w, h );
	}

	// once per frame with the unjittered camera (before the TAA jitter or with camera.userData.projNoJitter)
	updateCamera( camera, proj ) {
		this._vp.multiplyMatrices( proj, camera.matrixWorldInverse );
		if ( ! this._hasPrev ) this._prevVP.copy( this._vp );
		this._hasPrev = true;
		this.uniforms.uMbInvVP.value.copy( this._vp ).invert();
		this.uniforms.uMbPrevVP.value.copy( this._prevVP );
		this._prevVP.copy( this._vp );
	}

	reset() { this._hasPrev = false; }

	// depth: this frame's depth (reversed-Z, with the water); off: shutter closed (mbApply returns its input)
	render( gl, depth, on ) {
		const U = this.uniforms;
		U.uMbShutter.value = on ? this.shutter : 0;
		if ( ! on ) return;
		this._frame = ( this._frame + 1 ) % 64;
		U.uMbFrame.value = this._frame;
		U.tMbDepth.value = depth;
		this.quad.material = this.tileMat;
		gl.setRenderTarget( this.tileRT );
		this.quad.render( gl );
		this.quad.material = this.neighborMat;
		gl.setRenderTarget( this.neighborRT );
		this.quad.render( gl );
	}

	dispose() {
		this.tileRT.dispose();
		this.neighborRT.dispose();
	}
}
