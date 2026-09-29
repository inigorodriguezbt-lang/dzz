// Octahedral impostors for the palms, trees and the bigger small plants (after Tidewater's
// Impostors.js, MIT; translated from TSL / WebGPU to GLSL on MeshStandardMaterial).
//
// At startup every species model (the full LOD 0 mesh) is rendered from IMP_N x IMP_N directions on
// the upper hemisphere (hemi-octahedral layout) into two atlases:
//   A: base colour (leaf texel x vertex colour x baked exposure, gamma-2 encoded), coverage
//   B: plant-local normal * 0.5 + 0.5, leaf flag (1 foliage, 0 bark / solid parts)
// Each species owns one IMP_N x IMP_N block of frames; the whole bake is one draw per atlas.
// Everything outside a plant is cleared to 0, so after mip filtering colour, normal and leaf flag
// are premultiplied by the coverage and the shader divides it back out (no dark fringes at distance).
//
// At runtime each plant is one camera-facing quad. The fragment shader takes the view ray into the
// plant's local frame (inverse of the instance transform: yaw, non-uniform scale, the palm / pine
// lean as a shear), picks the three frames around the view direction (barycentric blend; far away
// only the nearest) and re-projects the ray onto each frame's plane, which is exact for any view
// direction. Colours use the same per-species tints as the near models, so the hand-over at the LOD
// distance is a dithered cross-fade between matching images.
import * as THREE from 'three';
import { patchMaterial } from '../../render/Materials.js';
import { SP, NSP, PALM_H } from './species.js';
import { KIND, VG } from './VegMaterial.js';
import { InstanceTarget } from './InstanceTarget.js';

export const IMP_N = 6; // frames per side of a species block
const FRAME = 80; // px per frame
const BLEND_DIST = 220; // m: three-frame blending within, nearest frame beyond (default; see setRanges)
const ATLAS_N = 2048; // leaf atlas size (mip level estimate in the bake)

// species drawn as impostors somewhere (far: the canopy out to the render distance, mid: the small
// plants between their near model and their end distance)
export const IMP_SPECIES = [ SP.PALM, SP.MONKEYPOD, SP.KUKUI, SP.OHIA, SP.PINE, SP.IRONWOOD, SP.KIAWE, SP.TREEFERN, SP.BANANA, SP.TI, SP.SHRUB, SP.NAUPAKA, SP.TALLGRASS ];

const smooth = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };

// hemi-octahedral decode: (u, v) in [-1, 1]^2 -> unit direction with y >= 0
function octDecode( u, v, out ) {
	const x = ( u - v ) * 0.5, z = ( u + v ) * 0.5;
	return out.set( x, 1 - Math.abs( x ) - Math.abs( z ), z ).normalize();
}

// ---- bake ------------------------------------------------------------------------------------------------------

const BAKE_VERT = /* glsl */`
	attribute vec4 aMat; attribute vec3 aCol;
	varying vec2 vUv; varying vec4 vMat; varying vec3 vCol; varying vec3 vN;
	void main() {
		vUv = uv;
		// the palm trunk's ring texture repeats every 1.6 m along the 10 m model trunk (as the near shader)
		if ( aMat.x < 0.5 ) vUv.y *= ${( PALM_H / 1.6 ).toFixed( 4 )};
		vMat = aMat; vCol = aCol; vN = normal;
		vec3 p = position;
		// fruit hangs on some plants only: left out of the shared image
		if ( aMat.w > 98.5 ) p = vec3( 0.0, - 1e4, 0.0 );
		gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4( p, 1.0 );
	}
`;

const BAKE_FRAG = /* glsl */`
	uniform sampler2D tLeaf; uniform sampler2D tPalmBark; uniform sampler2D tBark; uniform float uPass;
	varying vec2 vUv; varying vec4 vMat; varying vec3 vCol; varying vec3 vN;
	void main() {
		float part = vMat.x;
		vec4 c;
		float leaf = 0.0;
		if ( part < 0.5 ) c = texture2D( tPalmBark, vUv );
		else if ( part < 1.5 ) c = vec4( texture2D( tBark, vUv ).rgb / dot( max( textureLod( tBark, vec2( 0.5 ), 12.0 ).rgb, vec3( 1e-4 ) ), vec3( 0.333 ) ), 1.0 ); // as the near shader
		else {
			vec2 dx = dFdx( vUv ), dy = dFdy( vUv );
			c = textureGrad( tLeaf, vUv, dx, dy );
			// the same coverage-keeping threshold as the near foliage at this minification
			float lod = log2( max( max( length( dx ), length( dy ) ) * ${ATLAS_N.toFixed( 1 )}, 1e-4 ) );
			if ( c.a < mix( 0.5, 0.2, clamp( lod / 4.0, 0.0, 1.0 ) ) ) discard;
			leaf = part < 2.5 ? 1.0 : 0.0;
		}
		vec3 col = c.rgb * vCol * ( part < 1.5 ? mix( 0.45, 1.0, vMat.y ) : mix( 0.42, 1.05, vMat.y ) );
		if ( uPass < 0.5 ) gl_FragColor = vec4( sqrt( max( col, vec3( 0.0 ) ) ), 1.0 );
		else gl_FragColor = vec4( normalize( vN ) * 0.5 + 0.5, leaf );
	}
`;

// ---- runtime material ---------------------------------------------------------------------------------------------

const VERT_PARS = /* glsl */`
	attribute vec4 iPos; attribute vec4 iDat;
	uniform float uTime; uniform vec3 uCamPos; uniform vec2 uWind;
	uniform float uWindStr; uniform float uDensity;
	uniform vec4 uImpA[ IMP_SLOTS ]; uniform vec4 uImpB[ IMP_SLOTS ]; uniform vec4 uImpRange[ IMP_SLOTS ];
	uniform vec3 uImpTintA[ IMP_SLOTS ]; uniform vec3 uImpTintB[ IMP_SLOTS ]; uniform vec3 uImpBark[ IMP_SLOTS ];
	uniform vec4 uImpThin;
	varying vec3 vImpC; varying vec4 vImpX; varying vec4 vImpY; varying vec4 vImpZ; varying vec3 vImpTint; varying vec3 vImpBarkC; varying vec2 vImpQ;

	float impHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
	float impNoise( vec2 p ) {
		vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( impHash( i ), impHash( i + vec2( 1, 0 ) ), u.x ), mix( impHash( i + vec2( 0, 1 ) ), impHash( i + vec2( 1, 1 ) ), u.x ), u.y );
	}

	vec3 impP; vec3 impN;
	void impDeform() {
		int slot = int( iDat.y );
		float rank = fract( iDat.y ) / 0.999;
		vec4 A = uImpA[ slot ], B = uImpB[ slot ], Rg = uImpRange[ slot ];
		vec3 base = iPos.xyz;
		vec3 wbase = base + modelMatrix[ 3 ].xyz;
		float s = iPos.w, yaw = iDat.x, pa = iDat.z, pb = iDat.w;
		float d = distance( wbase, uCamPos );
		// fade in: a dithered cross-fade with the near / mid model (complementary, the plant stays
		// solid). Everything past that shrinks instead of dissolving: the plants the distance
		// thinning drops (by rank) and all of them at the end of the range, so the far canopy
		// never turns into dither noise
		float fin = smoothstep( Rg.x, Rg.y, d );
		float fend = 1.0 - smoothstep( Rg.z, Rg.w, d );
		float thinK = uImpThin.y > 0.0 ? smoothstep( uImpThin.x, uImpThin.y, d ) : 0.0;
		float rn = rank / max( uDensity, 0.01 );
		float vis = clamp( ( mix( 1.0, uImpThin.z, thinK ) - rn ) / 0.15 + 1.0 - thinK, 0.0, 1.0 ) * fend;
		vImpZ = vec4( fin, 0.0, B.y, B.z );
		impN = vec3( 0.0, 1.0, 0.0 );
		if ( fin <= 0.0 || vis <= 0.0 ) { impP = base; return; }
		// the survivors of a thinned forest grow so the canopy stays closed
		float grow = ( 1.0 + thinK * ( inversesqrt( max( uImpThin.z, 0.1 ) ) - 1.0 ) * 0.7 ) * sqrt( vis );
		// instance transform: horizontal / vertical scale and a lean (shear per metre of height)
		float kind = B.x;
		float sh = s, sv = s;
		vec2 L = vec2( 0.0 );
		if ( kind == ${KIND.PALM.toFixed( 1 )} ) {
			float laz = pb > 7.0 ? pb - 8.0 : pb;
			sh = 1.0; sv = s / ${PALM_H.toFixed( 1 )};
			L = vec2( cos( laz ), sin( laz ) ) * pa;
		} else if ( kind == ${KIND.TREE.toFixed( 1 )} ) sv = s * pa;
		else if ( kind == ${KIND.PINE.toFixed( 1 )} ) L = vec2( cos( pb ), sin( pb ) ) * pa;
		sh *= grow; sv *= grow;
		float cy = A.x * sv;
		vec3 C = wbase + vec3( L.x * cy, cy, L.y * cy );
		// the whole crown sways a little downwind (matches the near models' trunk sway)
		vec2 wd = normalize( uWind + vec2( 1e-4 ) );
		float w = uWindStr;
		float gust = smoothstep( 0.3, 0.75, impNoise( wbase.xz / 45.0 - wd * uTime * 0.3 ) );
		float amp = kind == ${KIND.SMALL.toFixed( 1 )} ? 0.03 : 0.015;
		float sway = ( w * w * amp * ( 0.35 + gust ) + sin( uTime * 1.2 + rank * 6.2832 ) * w * amp * 0.5 * ( 0.4 + gust ) ) * cy * 0.5;
		C.xz += wd * sway;
		// a camera-facing quad covering the plant's projected extent, pulled towards the camera so
		// that it never sinks into the ground under it when seen from above
		vec3 toCam = normalize( uCamPos - C );
		float ty = abs( toCam.y );
		float lean = length( L ) * A.w * sv;
		float halfW = A.z * sh + lean;
		float halfH = A.w * sv * sqrt( max( 1.0 - ty * ty, 0.0 ) ) + A.z * sh * ty + lean;
		vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toCam ) + vec3( 1e-5, 0.0, 0.0 ) );
		vec3 up = cross( toCam, right );
		vec3 Q = C + toCam * min( A.y * max( sh, sv ) * ( 0.2 + 0.8 * ty ), d * 0.5 );
		vec3 wp = Q + right * position.x * halfW + up * position.y * halfH;
		vImpQ = position.xy * vec2( halfW, halfH ) / max( A.y * max( sh, sv ), 1e-3 );
		impP = wp - modelMatrix[ 3 ].xyz;
		impN = toCam;
		vImpC = C;
		vImpX = vec4( cos( yaw ), sin( yaw ), sh, sv );
		vImpY = vec4( L, A.y, d < uImpThin.w ? 1.0 : 0.0 );
		// the near models' tints: per plant by a random, or by dryness (grasses); ti comes in a red kind
		float seed = fract( rank * 7.31 + pb * 3.7 );
		vImpTint = mix( uImpTintA[ slot ], uImpTintB[ slot ], B.w == 1.0 ? clamp( pa, 0.0, 1.0 ) : seed );
		if ( B.w == 2.0 && pb > 0.72 ) vImpTint *= vec3( 1.25, 0.3, 0.4 );
		vImpBarkC = uImpBark[ slot ] * ( 0.85 + 0.3 * seed );
	}
`;

const FRAG_PARS = /* glsl */`
	uniform sampler2D tImpA; uniform sampler2D tImpB; uniform vec2 uImpGrid;
	varying vec3 vImpC; varying vec4 vImpX; varying vec4 vImpY; varying vec4 vImpZ; varying vec3 vImpTint; varying vec3 vImpBarkC; varying vec2 vImpQ;
	float impBayer( vec2 p ) {
		ivec2 q = ivec2( mod( p, 4.0 ) );
		int i = q.x + q.y * 4;
		float m[ 16 ] = float[ 16 ]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
		return ( m[ i ] + 0.5 ) / 16.0;
	}
	// world direction -> plant-local (un-shear, inverse yaw, inverse scale)
	vec3 impLocal( vec3 v ) {
		v.xz -= vImpY.xy * v.y;
		return vec3( v.x * vImpX.x - v.z * vImpX.y, v.y, v.x * vImpX.y + v.z * vImpX.x ) / vec3( vImpX.z, vImpX.w, vImpX.z );
	}
	vec3 impOctDecode( vec2 e ) { float x = ( e.x - e.y ) * 0.5, z = ( e.x + e.y ) * 0.5; return normalize( vec3( x, 1.0 - abs( x ) - abs( z ), z ) ); }
	vec2 impOctEncode( vec3 d ) { vec3 p = d / ( abs( d.x ) + abs( d.y ) + abs( d.z ) ); return vec2( p.x + p.z, p.z - p.x ); }
	vec4 impA; vec4 impB;
	void impFrame( vec2 ij, vec3 O, vec3 D, float w ) {
		vec3 dF = impOctDecode( ij / ( IMP_N - 1.0 ) * 2.0 - 1.0 );
		vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), dF ) );
		vec3 up = cross( dF, right );
		vec3 P = O - D * ( dot( O, dF ) / dot( D, dF ) );
		vec2 ab = vec2( dot( P, right ), dot( P, up ) ) / vImpY.z;
		vec2 st = ( vImpZ.zw * IMP_N + ij + clamp( ab, - 1.0, 1.0 ) * 0.5 + 0.5 ) / uImpGrid;
		// sampled unconditionally (smooth derivatives), masked outside the frame
		float k = w * step( abs( ab.x ), 0.999 ) * step( abs( ab.y ), 0.999 );
		impA += texture2D( tImpA, st ) * k;
		impB += texture2D( tImpB, st ) * k;
	}
	void impSample() {
		vec3 O = impLocal( uCamPos - vImpC );
		vec3 D = impLocal( vWorldPos - uCamPos );
		vec3 vd = normalize( O );
		vd = normalize( vec3( vd.x, max( vd.y, 0.02 ), vd.z ) );
		vec2 g = ( impOctEncode( vd ) * 0.5 + 0.5 ) * ( IMP_N - 1.0 );
		vec2 gi = floor( clamp( g, vec2( 0.0 ), vec2( IMP_N - 1.001 ) ) );
		vec2 f = g - gi;
		bool upper = f.x + f.y > 1.0;
		vec2 i0 = upper ? gi + 1.0 : gi;
		vec2 i1 = upper ? gi + vec2( 0.0, 1.0 ) : gi + vec2( 1.0, 0.0 );
		vec2 i2 = upper ? gi + vec2( 1.0, 0.0 ) : gi + vec2( 0.0, 1.0 );
		float w0 = upper ? f.x + f.y - 1.0 : 1.0 - f.x - f.y;
		float w1 = upper ? 1.0 - f.x : f.x;
		float w2 = upper ? 1.0 - f.y : f.y;
		impA = vec4( 0.0 ); impB = vec4( 0.0 );
		if ( vImpY.w > 0.5 ) {
			impFrame( i0, O, D, w0 ); impFrame( i1, O, D, w1 ); impFrame( i2, O, D, w2 );
		} else {
			impFrame( w0 >= max( w1, w2 ) ? i0 : w1 >= w2 ? i1 : i2, O, D, 1.0 );
		}
	}
`;

const FRAG_COLOR = /* glsl */`
	impSample();
	float impCov = impA.a;
	float impBt = impBayer( gl_FragCoord.xy );
	// small on screen the atlas is read from its coarse mips, where coverage averages out: lower the
	// cut-off with the footprint (as the near foliage does) so distant crowns keep their size
	float impLod = log2( max( max( length( dFdx( vImpQ ) ), length( dFdy( vImpQ ) ) ) * ${( FRAME / 2 ).toFixed( 1 )}, 1e-4 ) );
	if ( impCov < mix( 0.42, 0.2, clamp( ( impLod - 0.5 ) / 3.0, 0.0, 1.0 ) ) || impBt >= vImpZ.x ) discard;
	vec3 impCol = impA.rgb / impCov;
	impCol *= impCol;
	float impLeaf = clamp( impB.a / impCov, 0.0, 1.0 );
	impCol *= mix( vImpBarkC, vImpTint, impLeaf );
	diffuseColor.rgb = impCol;
`;

const FRAG_NORMAL = /* glsl */`
	{
		vec3 nl = impB.rgb / max( impCov, 1e-3 ) * 2.0 - 1.0;
		// local -> world: inverse-transpose of the scale, then the yaw; the lean is left out (a few degrees)
		vec3 ns = nl / vec3( vImpX.z, vImpX.w, vImpX.z );
		vec3 nw = vec3( ns.x * vImpX.x + ns.z * vImpX.y, ns.y, - ns.x * vImpX.y + ns.z * vImpX.x );
		normal = normalize( ( viewMatrix * vec4( nw, 0.0 ) ).xyz );
		// foliage is lit like the near canopy: normals bent towards the viewer
		normal = normalize( normal + normalize( vViewPosition ) * 0.4 * impLeaf );
	}
`;

const FRAG_TRANSLUCENT = /* glsl */`
	#if NUM_DIR_LIGHTS > 0
	{
		float back = clamp( dot( - normal, directLight.direction ), 0.0, 1.0 );
		float fwd = pow( clamp( dot( - geometryViewDir, directLight.direction ), 0.0, 1.0 ), 4.0 ) * 0.6 + 0.4;
		reflectedLight.directDiffuse += diffuseColor.rgb * vec3( 1.05, 1.25, 0.5 ) * directLight.color * back * fwd * 0.5 * impLeaf;
	}
	#endif
`;

// ---- the atlas and its instance meshes --------------------------------------------------------------------------------

export class Impostors {
	// gl: WebGLRenderer, models: species -> LOD 0 BufferGeometry, spec: species -> { kind, imp, tint, bark, mode }
	constructor( gl, models, spec ) {
		this.gl = gl;
		this.spec = spec;
		this.slot = new Array( NSP ).fill( - 1 );
		this.species = [];
		for ( const s of IMP_SPECIES ) if ( spec[ s ]?.imp ) { this.slot[ s ] = this.species.length; this.species.push( s ); }
		const n = this.species.length;
		this.bcols = Math.ceil( Math.sqrt( n ) );
		this.brows = Math.ceil( n / this.bcols );
		this.cols = this.bcols * IMP_N;
		this.rows = this.brows * IMP_N;
		// per species frame bounds: centre on the plant axis, radius around it, horizontal radius, half height
		this.bounds = this.species.map( s => measure( models[ s ] ) );
		const V4 = () => Array.from( { length: n }, () => new THREE.Vector4() );
		const C3 = () => Array.from( { length: n }, () => new THREE.Color( 1, 1, 1 ) );
		this.uniforms = {
			uImpA: { value: V4() }, uImpB: { value: V4() }, uImpRange: { value: V4() },
			uImpTintA: { value: C3() }, uImpTintB: { value: C3() }, uImpBark: { value: C3() },
			uImpGrid: { value: new THREE.Vector2( this.cols, this.rows ) },
			tImpA: { value: null }, tImpB: { value: null },
		};
		this.species.forEach( ( s, k ) => {
			const b = this.bounds[ k ], cfg = spec[ s ];
			this.uniforms.uImpA.value[ k ].set( b.cy, b.r, b.rh, b.hv );
			const mode = cfg.mode?.[ 0 ] ? 1 : cfg.mode?.[ 1 ] ? 2 : 0;
			this.uniforms.uImpB.value[ k ].set( cfg.kind, k % this.bcols, Math.floor( k / this.bcols ), mode );
			this.uniforms.uImpTintA.value[ k ].setRGB( ...cfg.tint[ 0 ] );
			this.uniforms.uImpTintB.value[ k ].setRGB( ...cfg.tint[ 1 ] );
			this.uniforms.uImpBark.value[ k ].setRGB( ...( cfg.bark || [ 1, 1, 1 ] ) );
			this.uniforms.uImpRange.value[ k ].set( 1e6, 1e6, 1e6, 1e6 );
		} );
		const make = ( name ) => {
			const rt = new THREE.WebGLRenderTarget( this.cols * FRAME, this.rows * FRAME, {
				type: THREE.UnsignedByteType, depthBuffer: true, generateMipmaps: true, samples: 0,
				minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
			} );
			rt.texture.name = name;
			rt.texture.colorSpace = THREE.NoColorSpace;
			return rt;
		};
		this.rtA = make( 'vegImpostorA' );
		this.rtB = make( 'vegImpostorB' );
		this.uniforms.tImpA.value = this.rtA.texture;
		this.uniforms.tImpB.value = this.rtB.texture;
		this.models = models;
		this.targets = [];
		this.thin = new THREE.Vector4( 0, 0, 1, BLEND_DIST );
		this.thinMid = new THREE.Vector4( 0, 0, 1, BLEND_DIST );
		this.quad = buildQuad();
		this.baked = false;
		this._tryBake();
	}

	// the bark textures come from the texture cache (preloaded with the world); wait for their images
	_ready() {
		for ( const t of [ VG.tLeaf.value, VG.tPalmBark.value, VG.tBark.value ] ) {
			const img = t?.image;
			if ( ! img ) return false;
			if ( img.complete === false || ( img.width || 0 ) === 0 ) return false;
		}
		return true;
	}

	_tryBake() {
		if ( this.baked || ! this._ready() ) return;
		const t0 = performance.now();
		this.bake();
		this.bakeMs = performance.now() - t0;
	}

	bake() {
		const gl = this.gl;
		const mat = new THREE.ShaderMaterial( {
			name: 'veg-impostor-bake',
			uniforms: { tLeaf: VG.tLeaf, tPalmBark: VG.tPalmBark, tBark: VG.tBark, uPass: { value: 0 } },
			vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, side: THREE.DoubleSide,
		} );
		// one orthographic view over the atlas in frame units: every frame is a unit cell and the
		// frame matrices scale each plant's bounding sphere into it
		const cam = new THREE.OrthographicCamera( 0, this.cols, this.rows, 0, 0.1, 10 );
		cam.position.set( 0, 0, 3 );
		cam.lookAt( 0, 0, - 1 );
		cam.updateMatrixWorld();
		cam.updateProjectionMatrix();
		const scene = new THREE.Scene();
		const meshes = [];
		const d = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), Y = new THREE.Vector3( 0, 1, 0 );
		const m = new THREE.Matrix4();
		this.species.forEach( ( s, k ) => {
			const b = this.bounds[ k ];
			const bx = ( k % this.bcols ) * IMP_N, by = Math.floor( k / this.bcols ) * IMP_N;
			const mesh = new THREE.InstancedMesh( this.models[ s ], mat, IMP_N * IMP_N );
			mesh.frustumCulled = false;
			const k2 = 1 / ( 2 * b.r );
			for ( let j = 0; j < IMP_N; j ++ ) for ( let i = 0; i < IMP_N; i ++ ) {
				octDecode( - 1 + 2 * i / ( IMP_N - 1 ), - 1 + 2 * j / ( IMP_N - 1 ), d );
				right.crossVectors( Y, d );
				if ( right.lengthSq() < 1e-8 ) right.set( 1, 0, 0 );
				right.normalize();
				up.crossVectors( d, right ).normalize();
				// local p -> ( right·(p - C), up·(p - C), d·(p - C) ) / 2R + cell centre
				const cx = bx + i + 0.5, cy = by + j + 0.5;
				m.set(
					right.x * k2, right.y * k2, right.z * k2, - right.y * b.cy * k2 + cx,
					up.x * k2, up.y * k2, up.z * k2, - up.y * b.cy * k2 + cy,
					d.x * k2, d.y * k2, d.z * k2, - d.y * b.cy * k2,
					0, 0, 0, 1 );
				mesh.setMatrixAt( j * IMP_N + i, m );
			}
			mesh.instanceMatrix.needsUpdate = true;
			scene.add( mesh );
			meshes.push( mesh );
		} );
		const prevTarget = gl.getRenderTarget();
		const prevClear = gl.getClearColor( new THREE.Color() ), prevAlpha = gl.getClearAlpha();
		const prevAuto = gl.autoClear;
		const prevShadow = gl.shadowMap.enabled;
		gl.autoClear = false;
		gl.shadowMap.enabled = false;
		for ( const [ rt, pass ] of [ [ this.rtA, 0 ], [ this.rtB, 1 ] ] ) {
			mat.uniforms.uPass.value = pass;
			gl.setRenderTarget( rt );
			gl.setClearColor( 0x000000, 0 );
			gl.clear( true, true, false );
			gl.render( scene, cam );
		}
		gl.setRenderTarget( prevTarget );
		gl.setClearColor( prevClear, prevAlpha );
		gl.autoClear = prevAuto;
		gl.shadowMap.enabled = prevShadow;
		for ( const mesh of meshes ) mesh.dispose();
		mat.dispose();
		this.baked = true;
	}

	// an instance buffer drawn with the impostor material: 'far' (thinned with distance) or 'mid'
	makeTarget( band ) {
		const U = { uImpThin: { value: band === 'far' ? this.thin : this.thinMid } };
		const m = new THREE.MeshStandardMaterial( { roughness: 0.8, metalness: 0 } );
		patchMaterial( m, 'veg-impostor', ( shader ) => {
			Object.assign( shader.uniforms, VG, this.uniforms, U );
			const defs = `#define IMP_SLOTS ${this.species.length}\n#define IMP_N ${IMP_N.toFixed( 1 )}\n`;
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + defs + VERT_PARS )
				.replace( '#include <beginnormal_vertex>', 'impDeform();\nvec3 objectNormal = impN;' )
				.replace( '#include <begin_vertex>', 'vec3 transformed = impP;' );
			shader.fragmentShader = shader.fragmentShader
				// after all declarations (the shared uniforms and vWorldPos come in with patchMaterial)
				.replace( 'void main() {', defs + FRAG_PARS + '\nvoid main() {' )
				.replace( '#include <map_fragment>', FRAG_COLOR )
				.replace( '#include <normal_fragment_maps>', FRAG_NORMAL )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.9, 0.72, impLeaf );' )
				.replace( '#include <lights_fragment_maps>', FRAG_TRANSLUCENT + '\n#include <lights_fragment_maps>' );
		} );
		const t = new InstanceTarget( 'impostor-' + band, this.quad, m, null, band === 'far' ? 16384 : 4096 );
		t.U = U;
		t.mesh.castShadow = false;
		// the far ones are all beyond the sun's shadow map
		t.mesh.receiveShadow = band !== 'far';
		this.targets.push( t );
		return t;
	}

	// ranges: species -> { imp: [ start, end ] } (m); fade: the cross-fade band at the start as a share
	// of the distance. The plants shrink away over the last 15-20 % of the range.
	setRanges( ranges, q, fade = 0.1 ) {
		let farEnd = 0;
		this.species.forEach( ( s, k ) => {
			const r = ranges[ s ]?.imp;
			const v = this.uniforms.uImpRange.value[ k ];
			if ( ! r ) { v.set( 1e6, 1e6, 1e6, 1e6 ); return; }
			const far = this.spec[ s ].imp === 'far';
			const a = r[ 0 ] * fade;
			v.set( r[ 0 ] - a * 0.5, r[ 0 ] + a * 0.5, r[ 1 ] * ( far ? 0.8 : 0.85 ), r[ 1 ] );
			if ( far ) farEnd = Math.max( farEnd, r[ 1 ] );
		} );
		// far forests thin out towards the end of the view: fewer, bigger crowns (a lower keep on the
		// lower quality settings)
		const keep = q.far < 0.7 ? 0.35 : q.far < 1 ? 0.42 : 0.5;
		// blending the three nearest frames costs three times the texture reads but keeps the image
		// steady (no frame switches) and soft far away: everywhere on the higher settings
		const blend = q.blend ?? BLEND_DIST;
		this.thin.set( Math.max( 420, farEnd * 0.3 ), Math.max( 480, farEnd ), keep, blend );
		this.thinMid.w = blend;
	}

	// share of the plants kept at distance d (mirrors the shader: a plant of normalised rank rn is drawn
	// while rn < keepAt( d ) + 0.15, so the CPU skips the rest)
	keepAt( d ) {
		const t = this.thin;
		if ( ! ( t.y > 0 ) ) return 1;
		return 1 + ( t.z - 1 ) * smooth( t.x, t.y, d );
	}

	update() {
		if ( ! this.baked ) this._tryBake();
	}

	dispose() {
		for ( const t of this.targets ) t.dispose();
		this.quad.dispose();
		this.rtA.dispose();
		this.rtB.dispose();
	}
}

// ---- helpers ---------------------------------------------------------------------------------------------------------

// bounds of a plant model around its vertical axis
function measure( g ) {
	const p = g.attributes.position, am = g.attributes.aMat;
	let y0 = Infinity, y1 = - Infinity, rh = 0;
	for ( let i = 0; i < p.count; i ++ ) {
		if ( am && am.getW( i ) > 98.5 ) continue;
		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		y0 = Math.min( y0, y ); y1 = Math.max( y1, y );
		rh = Math.max( rh, Math.hypot( x, z ) );
	}
	const cy = ( y0 + y1 ) / 2;
	let r = 0;
	for ( let i = 0; i < p.count; i ++ ) {
		if ( am && am.getW( i ) > 98.5 ) continue;
		r = Math.max( r, Math.hypot( p.getX( i ), p.getY( i ) - cy, p.getZ( i ) ) );
	}
	return { cy, hv: ( y1 - y0 ) / 2, rh: rh * 1.02, r: r * 1.02 };
}

// unit quad (corners at ±1) for the camera-facing impostor instances
function buildQuad() {
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 1, - 1, 0, 1, 1, 0, - 1, 1, 0 ], 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( [ 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ], 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( [ 0, 0, 1, 0, 1, 1, 0, 1 ], 2 ) );
	g.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	return g;
}

