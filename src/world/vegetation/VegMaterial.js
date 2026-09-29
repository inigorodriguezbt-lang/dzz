// Vegetation materials: MeshStandardMaterial (through patchMaterial: fog, cloud shadows, wetness) with
// the plant deformation in the vertex shader and the foliage colouring / alpha test in the fragment
// shader, plus the matching depth material for the sun's shadow map.
//
// Instances (InstancedBufferGeometry): iPos = ( x, y, z relative to the mesh origin, s ), iDat = ( yaw,
// rank, a, b ) (see species.js). Every drawn mesh gets its own material instance (its own LOD window,
// kind and tints) but all share one shader program.
//
// Kinds (uKind): 0 tree, 1 coconut palm, 2 small plant, 3 rock, 4 Cook pine, 5 sugar cane, 6 grass
import * as THREE from 'three';
import { G, patchMaterial, tex } from '../../render/Materials.js';
import { PALM_H } from './species.js';

export const KIND = { TREE: 0, PALM: 1, SMALL: 2, ROCK: 3, PINE: 4, CANE: 5, GRASS: 6 };

// uniforms shared by every vegetation material
export const VG = {
	uWindStr: { value: 0.45 },
	uDensity: { value: 1 },
	uPlayer: { value: new THREE.Vector3( 0, - 1e5, 0 ) },
	uShadowFar: { value: 160 }, // m: plants further than this skip the shadow pass (beyond the sun's shadow map)
	tLeaf: { value: null },
	tPalmBark: { value: null },
	tBark: { value: null },
	tRock: { value: null },
};

const VERT_PARS = /* glsl */`
	attribute vec4 aVeg; attribute vec4 aMat; attribute vec3 aCol;
	attribute vec4 iPos; attribute vec4 iDat;
	uniform float uTime; uniform vec3 uCamPos; uniform vec2 uWind; uniform vec3 uSunDir;
	uniform vec4 uLod; uniform float uKind; uniform vec3 uThin; uniform float uShrinkEnd;
	uniform float uWindStr; uniform float uDensity; uniform vec3 uPlayer; uniform float uShadowFar;
	varying vec2 vVegUv; varying vec4 vVegMat; varying vec3 vVegCol; varying vec2 vVegFade; varying vec4 vVegInst;

	float vegHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
	float vegNoise( vec2 p ) {
		vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( vegHash( i ), vegHash( i + vec2( 1, 0 ) ), u.x ), mix( vegHash( i + vec2( 0, 1 ) ), vegHash( i + vec2( 1, 1 ) ), u.x ), u.y );
	}
	// rotation taking +y to the unit vector T
	vec3 vegRotUpTo( vec3 v, vec3 T ) { vec3 k = vec3( T.z, 0.0, - T.x ); vec3 c1 = cross( k, v ); return v + c1 + cross( k, c1 ) / ( T.y + 1.0 ); }
	vec3 vegRotY( vec3 v, float c, float s ) { return vec3( v.x * c + v.z * s, v.y, - v.x * s + v.z * c ); }

	vec3 vegP; vec3 vegN;
	void vegDeform( vec3 p, vec3 n ) {
		vec3 base = iPos.xyz;
		float s = iPos.w;
		float yaw = iDat.x, rank = iDat.y, pa = iDat.z, pb = iDat.w;
		vec3 wbase = base + modelMatrix[ 3 ].xyz;
		float d = distance( wbase, uCamPos );
		// LOD window: a dithered cross-fade with the neighbouring level (the two images are
		// complementary, so the plant stays solid); the CPU already dropped rank >= density
		float fin = uLod.x > 0.0 ? smoothstep( uLod.x, uLod.y, d ) : 1.0;
		float fout = smoothstep( uLod.z, uLod.w, d );
		// distance thinning (grass): the plants that drop out shrink away instead of dissolving, the
		// survivors grow a little so the cover holds
		float thinK = uThin.y > 0.0 ? smoothstep( uThin.x, uThin.y, d ) : 0.0;
		float rn = rank / max( uDensity, 0.01 );
		float vis = clamp( ( mix( 1.0, uThin.z, thinK ) - rn ) / 0.12 + 1.0 - thinK, 0.0, 1.0 );
		// the last level of a plant has nothing to hand over to: it shrinks into the ground
		if ( uShrinkEnd > 0.5 ) { vis *= 1.0 - fout; fout = 0.0; }
		vVegFade = vec2( fin, fout );
		#ifdef VEG_DEPTH
		// outside the shadow map: collapse before any of the work below
		if ( d > uShadowFar ) vVegFade.x = 0.0;
		#endif
		vVegInst = vec4( rank, pa, pb, s );
		vVegMat = aMat;
		vVegCol = aCol;
		vVegUv = uv;
		if ( vVegFade.x <= 0.0 || fout >= 1.0 || vis <= 0.0 ) { vegP = base; vegN = vec3( 0.0, 1.0, 0.0 ); return; }
		float grow = ( 1.0 + thinK * ( 1.0 - uThin.z ) * 0.35 ) * vis;

		float cy = cos( yaw ), sy = sin( yaw );
		vec2 wd = normalize( uWind + vec2( 1e-4 ) );
		vec3 wd3 = vec3( wd.x, 0.0, wd.y ), wp3 = vec3( - wd.y, 0.0, wd.x );
		float w = uWindStr;
		// gust cells ~45 m wide travelling downwind
		float gust = smoothstep( 0.3, 0.75, vegNoise( wbase.xz / 45.0 - wd * uTime * 0.3 ) );
		float ph0 = rank * 6.2832;
		float t = uTime;
		vec3 lp, ln;

		if ( uKind == 1.0 ) {
			// ---- coconut palm: stretch the trunk to the instance height, lean / curve it, carry the crown
			float H = s;
			bool curved = pb > 7.0;
			float laz = curved ? pb - 8.0 : pb;
			vec3 leanDir = vec3( cos( laz ), 0.0, sin( laz ) );
			float lean = pa, c = curved ? 1.0 : 0.0;
			float swayT = w * w * 0.012 * ( 0.3 + gust ) + sin( t * 0.85 + ph0 ) * w * 0.006 * ( 0.45 + gust );
			float swayTP = sin( t * 0.63 + ph0 * 1.7 ) * w * 0.0028;
			vec3 windOff = wd3 * swayT + wp3 * swayTP;
			if ( aMat.w < 0.5 ) {
				float u = aVeg.x;
				float f = mix( u, u * ( 2.0 - u ), c );
				float df = mix( 1.0, 2.0 * ( 1.0 - u ), c );
				vec3 T = normalize( vec3( 0.0, 1.0, 0.0 ) + leanDir * lean * df + windOff * 2.0 * u );
				vec3 radial = vegRotY( vec3( p.x, 0.0, p.z ), cy, sy );
				lp = vec3( 0.0, u * H, 0.0 ) + ( leanDir * lean * f + windOff * u * u ) * H + vegRotUpTo( radial, T );
				ln = vegRotUpTo( vegRotY( n, cy, sy ), T );
				vVegUv = vec2( uv.x, uv.y * H / 1.6 );
			} else {
				vec3 o = vegRotY( p - vec3( 0.0, ${PALM_H.toFixed( 1 )}, 0.0 ), cy, sy );
				vec3 Ttop = normalize( vec3( 0.0, 1.0, 0.0 ) + leanDir * lean * ( 1.0 - c ) + windOff * 2.0 );
				vec3 Ttilt = normalize( vec3( 0.0, 1.0, 0.0 ) + Ttop );
				vec3 C = vec3( 0.0, H, 0.0 ) + ( leanDir * lean + windOff ) * H;
				vec3 o1 = vegRotUpTo( o, Ttilt );
				vec3 N1 = vegRotUpTo( vegRotY( n, cy, sy ), Ttilt );
				// fronds stream downwind (a length-preserving swing about the crown), bounce and flutter
				float sF = aVeg.y, s2 = sF * sF, ph = aVeg.w;
				float bend = s2 * 4.0 * ( w * w * 0.16 * ( 0.8 * gust + 0.35 ) + sin( t * ( ph * 0.5 + 1.3 ) + ph * 23.0 + ph0 ) * w * 0.075 * ( gust + 0.3 ) );
				float bounce = sin( t * ( ph + 2.1 ) + ph * 41.0 ) * s2 * w * 0.12;
				float flutter = aVeg.z * sin( t * ( ph * 5.0 + 11.0 ) + ph * 60.0 + sF * 9.0 ) * ( w * 0.05 + 0.01 );
				vec3 disp = wd3 * bend + vec3( 0.0, bounce - bend * 0.3, 0.0 ) + N1 * flutter;
				float L = length( o1 );
				vec3 o2 = normalize( o1 + disp + vec3( 0.0, 1e-5, 0.0 ) ) * L;
				// a few fronds missing per palm: every crown is different
				float k = aMat.w - 1.0;
				if ( k > 0.5 && k < 18.5 && vegHash( vec2( k * 1.37, rank * 97.0 ) ) < 0.12 ) o2 = vec3( 0.0, - 0.3, 0.0 );
				lp = C + o2;
				ln = N1;
			}
		} else {
			// ---- everything else: scale, yaw, wind
			vec3 sc3 = vec3( s );
			if ( uKind == 0.0 || uKind == 3.0 ) sc3.y *= pa;
			else if ( uKind == 5.0 ) sc3 = vec3( 1.0, s, 1.0 );
			else if ( uKind == 6.0 ) sc3 = vec3( 0.65 + 0.35 * s, s, 0.65 + 0.35 * s );
			sc3 *= grow;
			lp = vegRotY( p * sc3, cy, sy );
			ln = normalize( vegRotY( n / sc3, cy, sy ) );
			if ( uKind == 4.0 ) lp.xz += vec2( cos( pb ), sin( pb ) ) * pa * lp.y; // Cook pines lean
			float h01 = aVeg.x;
			if ( uKind == 6.0 || uKind == 5.0 ) {
				// grass and cane: blades bend from the ground, pushed aside around the player
				float bendG = ( w * w * 0.35 * ( 0.25 + gust ) + sin( t * 2.3 + wbase.x * 0.35 + wbase.z * 0.27 ) * w * 0.12 * ( 0.4 + gust ) ) * h01 * h01;
				lp += ( wd3 * bendG + wp3 * sin( t * 1.7 + ph0 ) * 0.03 * w * h01 ) * max( lp.y, 0.3 );
				vec2 away = wbase.xz + lp.xz - uPlayer.xz;
				float dp = length( away );
				float push = ( 1.0 - smoothstep( 0.35, 1.3, dp ) ) * h01 * step( abs( wbase.y - uPlayer.y ), 2.5 );
				lp.xz += away / max( dp, 0.05 ) * push * 0.35 * lp.y;
				lp.y *= 1.0 - push * 0.45;
			} else if ( uKind != 3.0 ) {
				float Hs = max( lp.y, 0.0 );
				float amp = uKind == 2.0 ? 0.03 : 0.018;
				float sway = w * w * amp * ( 0.35 + gust ) + sin( t * ( uKind == 2.0 ? 2.0 : 1.2 ) + ph0 ) * w * amp * 0.5 * ( 0.4 + gust );
				float swayP = sin( t * 0.9 + ph0 * 1.7 ) * w * amp * 0.22;
				lp += ( wd3 * sway + wp3 * swayP ) * h01 * Hs;
				float fl = aVeg.y;
				float br = sin( t * ( aVeg.w + 1.7 ) + aVeg.w * 20.0 + ph0 ) * fl * w * s * 0.07 * ( gust + 0.5 ) - fl * w * w * s * 0.04 * ( gust + 0.3 );
				lp += vec3( 0.0, 1.0, 0.0 ) * br + wd3 * fl * w * w * s * 0.05 * gust;
				float flut = sin( t * ( 8.5 + aVeg.w * 3.0 ) + aVeg.w * 40.0 + lp.x * 1.9 + lp.z * 2.3 ) * aVeg.z * ( 0.01 + w * 0.028 );
				lp += ln * flut;
			}
			// optional parts: fruit / flowers on some plants only
			if ( aMat.w > 98.5 && pb < ( uKind == 2.0 ? 0.55 : 0.72 ) ) lp = vec3( 0.0, - 0.5, 0.0 );
			if ( aMat.w > 29.5 && aMat.w < 30.5 && pa < 0.3 ) lp = vec3( 0.0, - 0.5, 0.0 );
			// bark texture repeats with the plant's size
			if ( aMat.x > 0.5 && aMat.x < 1.5 ) vVegUv = vec2( uv.x, uv.y * s );
		}
		vegP = base + lp;
		vegN = ln;
	}
`;

const FRAG_PARS = /* glsl */`
	uniform sampler2D tLeaf; uniform sampler2D tPalmBark; uniform sampler2D tBark; uniform sampler2D tRock;
	uniform float uKind; uniform vec3 uTintA; uniform vec3 uTintB; uniform vec3 uBarkTint; uniform vec4 uMode;
	varying vec2 vVegUv; varying vec4 vVegMat; varying vec3 vVegCol; varying vec2 vVegFade; varying vec4 vVegInst;
	float vegBayer( vec2 p ) {
		ivec2 q = ivec2( mod( p, 4.0 ) );
		int i = q.x + q.y * 4;
		float m[ 16 ] = float[ 16 ]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
		return ( m[ i ] + 0.5 ) / 16.0;
	}
	// sample the part's texture, alpha test the foliage, dither the LOD fades
	vec4 vegTexel() {
		vec2 uv = vVegUv;
		vec2 dx = dFdx( uv ), dy = dFdy( uv );
		float part = vVegMat.x;
		vec4 c;
		if ( part < 0.5 ) c = textureGrad( tPalmBark, uv, dx, dy );
		else if ( part < 1.5 ) c = textureGrad( tBark, uv, dx, dy );
		else if ( part < 3.5 ) {
			c = textureGrad( tLeaf, uv, dx, dy );
			// minified foliage keeps its coverage: lower the threshold with the mip level
			float lod = log2( max( max( length( dx ), length( dy ) ) * 2048.0, 1e-4 ) );
			if ( c.a < mix( 0.5, 0.2, clamp( lod / 4.0, 0.0, 1.0 ) ) ) discard;
		} else c = textureGrad( tRock, uv, dx, dy );
		float bt = vegBayer( gl_FragCoord.xy );
		if ( bt >= vVegFade.x || bt < vVegFade.y ) discard;
		return c;
	}
`;

const FRAG_COLOR = /* glsl */`
	vec4 vegTx = vegTexel();
	float vegPart = vVegMat.x;
	float vegAo = vVegMat.y;
	vec3 vegC = vegTx.rgb * vVegCol;
	float vegRough = 0.72;
	float vegSeed = fract( vVegInst.x * 7.31 + vVegInst.z * 3.7 );
	if ( vegPart > 1.5 && vegPart < 3.5 ) {
		// per-plant tint: by a random (trees, shrubs) or by dryness (grasses)
		vec3 tint = uMode.x > 0.5 ? mix( uTintA, uTintB, clamp( vVegInst.y, 0.0, 1.0 ) ) : mix( uTintA, uTintB, vegSeed );
		if ( uKind == 6.0 ) tint = mix( tint, vec3( 0.105, 0.2, 0.036 ), vVegInst.z * 0.85 ); // watered town lawns
		if ( vegPart > 2.5 && uKind != 6.0 ) tint = vec3( 1.0 );
		// blossoms are the saturated red texels: recoloured or hidden per plant
		float red = uMode.z > 0.5 ? smoothstep( 0.05, 0.2, vegTx.r - vegTx.g * 2.2 ) : 0.0;
		if ( red > 0.0 ) {
			float fl = vVegInst.z;
			vec3 flower = vegTx.rgb;
			if ( fl < 0.12 ) flower = vec3( dot( vegTx.rgb, vec3( 0.5, 0.4, 0.1 ) ) ) * vec3( 1.9, 1.35, 0.25 ); // yellow
			else if ( fl < 0.24 && uMode.z > 1.5 ) flower = vegTx.rgb * vec3( 1.1, 0.55, 0.9 ); // pink
			bool show = uMode.z > 1.5 ? vVegInst.y > 0.45 : fl < 0.55;
			vegC = mix( vegC * tint, show ? flower : vec3( 0.07, 0.1, 0.04 ) * tint, red );
		} else vegC *= tint;
		// ti: some plants are the red-leaved kind
		if ( uMode.y > 0.5 && vVegInst.z > 0.72 ) vegC *= vec3( 1.25, 0.3, 0.4 );
		vegC *= mix( 0.42, 1.05, vegAo );
		vegRough = 0.68;
	} else if ( vegPart < 1.5 ) {
		// tree bark: the texture brings the detail only (divided by its own mean, the last mip), the
		// vertex colour sets the albedo. The palm bark texture is used as it is.
		if ( vegPart > 0.5 ) vegC = vegTx.rgb / dot( max( textureLod( tBark, vec2( 0.5 ), 12.0 ).rgb, vec3( 1e-4 ) ), vec3( 0.333 ) ) * vVegCol;
		vegC *= uBarkTint * ( 0.85 + 0.3 * vegSeed ) * mix( 0.45, 1.0, vegAo );
		vegRough = 0.92;
	} else {
		// rock: grey-brown boulders, black lava. The texture only brings the detail: divided by its
		// own mean (the last mip) so the tints set the albedo whatever the texture's brightness
		vec3 vegAvg = max( textureLod( tRock, vec2( 0.5 ), 12.0 ).rgb, vec3( 1e-4 ) );
		vegC = vegTx.rgb / dot( vegAvg, vec3( 0.333 ) ) * 0.36 * vVegCol;
		vegC *= mix( uTintA, uTintB, vVegInst.z ) * mix( 0.5, 1.0, vegAo );
		vegRough = 0.88;
	}
	diffuseColor.rgb = vegC;
`;

const FRAG_NORMAL = /* glsl */`
	// foliage: canopy normals (not flipped on back faces) bent towards the viewer so leaves never
	// shade edge-on
	if ( vVegMat.x > 1.5 && vVegMat.x < 2.5 ) normal = normalize( normalize( vNormal ) + normalize( vViewPosition ) * 0.45 );
`;

// sunlight shining through leaves lit from behind (uses the shadowed sun colour of the light loop)
const FRAG_TRANSLUCENT = /* glsl */`
	#if NUM_DIR_LIGHTS > 0
	if ( vVegMat.x > 1.5 && vVegMat.x < 2.5 ) {
		vec3 gN = normalize( vNormal ) * faceDirection;
		float back = clamp( dot( - gN, directLight.direction ), 0.0, 1.0 );
		float fwd = pow( clamp( dot( - geometryViewDir, directLight.direction ), 0.0, 1.0 ), 4.0 ) * 0.6 + 0.4;
		reflectedLight.directDiffuse += diffuseColor.rgb * vec3( 1.05, 1.25, 0.5 ) * directLight.color * back * fwd * 0.5;
	}
	#endif
`;

export function vegTextures( leafAtlas ) {
	VG.tLeaf.value = leafAtlas;
	VG.tPalmBark.value = tex( 'palmbark_d' );
	VG.tBark.value = tex( 'bark_d' );
	VG.tRock.value = tex( 'rock_d' );
}

// per-mesh uniforms: LOD window, kind, far thinning, tints
// mode: [ tint by dryness, red-leaf variety, flowers (1 by b, 2 by a), - ]
export function vegUniforms( kind, tintA, tintB, barkTint, mode = [ 0, 0, 0, 0 ] ) {
	return {
		uMode: { value: new THREE.Vector4( ...mode ) },
		uLod: { value: new THREE.Vector4( 0, 0, 1e6, 1e6 ) },
		uShrinkEnd: { value: 0 },
		uKind: { value: kind },
		uThin: { value: new THREE.Vector3( 0, 0, 1 ) },
		uTintA: { value: new THREE.Color( ...tintA ) },
		uTintB: { value: new THREE.Color( ...tintB ) },
		uBarkTint: { value: new THREE.Color( ...( barkTint || [ 1, 1, 1 ] ) ) },
	};
}

// Thin foliage is lit from whichever side the sun is on, so its shadow lookup must be offset towards the
// sun: the normal bias along a leaf normal facing away from it would put the leaf into its own shadow
// (black hanging fronds).
const SHADOW_VERT = THREE.ShaderChunk.shadowmap_vertex.replace(
	/(vec3 shadowWorldNormal = [^;]+;)/,
	'$1\n\t\tif ( vVegMat.x > 1.5 && vVegMat.x < 3.5 && dot( shadowWorldNormal, uSunDir ) < 0.0 ) shadowWorldNormal = - shadowWorldNormal;' );

export function makeVegMaterial( U ) {
	const m = new THREE.MeshStandardMaterial( { roughness: 0.75, metalness: 0, side: THREE.DoubleSide } );
	m.shadowSide = THREE.DoubleSide;
	patchMaterial( m, 'vegetation', ( shader ) => {
		Object.assign( shader.uniforms, VG, U );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + VERT_PARS )
			.replace( '#include <beginnormal_vertex>', 'vegDeform( position, normal );\nvec3 objectNormal = vegN;' )
			.replace( '#include <begin_vertex>', 'vec3 transformed = vegP;' )
			.replace( '#include <shadowmap_vertex>', SHADOW_VERT );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + FRAG_PARS )
			.replace( '#include <map_fragment>', FRAG_COLOR )
			.replace( '#include <normal_fragment_maps>', FRAG_NORMAL )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vegRough;' )
			.replace( '#include <lights_fragment_maps>', FRAG_TRANSLUCENT + '\n#include <lights_fragment_maps>' );
	} );
	return m;
}

export function makeVegDepthMaterial( U ) {
	const m = new THREE.MeshDepthMaterial( { depthPacking: THREE.RGBADepthPacking } );
	m.onBeforeCompile = ( shader ) => {
		Object.assign( shader.uniforms, G, VG, U );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n#define VEG_DEPTH\n' + VERT_PARS )
			.replace( '#include <begin_vertex>', 'vegDeform( position, normal );\nvec3 transformed = vegP;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + FRAG_PARS )
			.replace( '#include <alphatest_fragment>', 'vegTexel();' );
	};
	m.customProgramCacheKey = () => 'vegetation-depth';
	return m;
}
