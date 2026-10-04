// The weapons modelling toolkit: the finishes (weaponMaterials: one material per finish, the view copies unfogged with
// worn edges, and the palette material that draws a model's opaque finishes in one call), the geometry kit (Parts:
// bevelled boxes, prisms, lathes, extrusions and rails merged per material, with separately animated sub-parts),
// cartridges, and the sub-assemblies every family shares (grips, guards, triggers).
// The gun families, magazines, attachments, melee and thrown weapons are drawn with it (models/*.js); GunModels.js
// dispatches, caches and registers the item models.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../../render/Materials.js';
// the arms items' finishes join the palette (their parts are drawn with this kit)
import { ARMS_MAT } from '../../game/items/ext/arms/parts.js';

export { THREE };
export const PI = Math.PI;
export const V3 = ( x = 0, y = 0, z = 0 ) => new THREE.Vector3( x, y, z );

// ---- materials ------------------------------------------------------------------------------------------------
// fin: the surface finish the shader adds (weaponShader): 'metal' wears through to `bare` metal on edges, 'poly' scuffs
// lighter, 'wood' gets a grain along the gun, 'matte' only a faint mottle. Colours are a little lighter than the real
// finishes: a black gun must still show its shapes in the view's light.
export const MAT = {
	// dark like the real finishes (black anodising ~sRGB 35-45): under the world's sun and sky the lighter greys
	// these started with read as bare silver
	blk: { color: 0x2c2d2f, metalness: 0.45, roughness: 0.52, fin: 'metal', bare: 0x8c9095 }, // parkerised steel
	blued: { color: 0x262b31, metalness: 0.75, roughness: 0.32, fin: 'metal', bare: 0xa3a8ae, mott: 0.5 },
	alu: { color: 0x2b2e32, metalness: 0.2, roughness: 0.5, fin: 'metal', bare: 0xb9bdc2, mott: 0.7 }, // anodised aluminium
	poly: { color: 0x252628, metalness: 0.0, roughness: 0.64, grip: 1, fin: 'poly' },
	polyS: { color: 0x28292b, metalness: 0.0, roughness: 0.54, fin: 'poly' },
	tan: { color: 0x8a7553, metalness: 0.0, roughness: 0.7, grip: 1, fin: 'poly' },
	tanM: { color: 0x7f6d4f, metalness: 0.3, roughness: 0.55, fin: 'metal', bare: 0x9b9c9c, mott: 0.7 }, // FDE cerakote metal
	od: { color: 0x4b5137, metalness: 0.0, roughness: 0.72, grip: 1, fin: 'poly' },
	green: { color: 0x3d4631, metalness: 0.0, roughness: 0.66, fin: 'poly' },
	olivM: { color: 0x3a3f30, metalness: 0.35, roughness: 0.5, fin: 'metal', bare: 0x9a9d96 }, // painted aluminium
	// a coated objective seen from the front: a deep glass that reflects tinted (the coating)
	coat: { color: 0x5b4a86, metalness: 1.0, roughness: 0.08, lens: 1 },
	gray: { color: 0x2a2c2f, metalness: 0.05, roughness: 0.66, grip: 1, fin: 'poly' },
	// (stained and oiled stocks read a shade darker and browner than their raw colour: the brighter, redder values
	// these had read as orange plastic in the sun)
	wood: { color: 0x7c4b2e, metalness: 0.0, roughness: 0.5, fin: 'wood' },
	hardwood: { color: 0x613a22, metalness: 0.0, roughness: 0.46, fin: 'wood' }, // oiled birch / beech service stocks
	walnut: { color: 0x4a2e1c, metalness: 0.0, roughness: 0.42, fin: 'wood' },
	walnutC: { color: 0x3a2416, metalness: 0.0, roughness: 0.6, grip: 1, fin: 'wood' }, // cut checkering
	lam: { color: 0x512618, metalness: 0.0, roughness: 0.4, fin: 'wood' },
	koa: { color: 0x96592c, metalness: 0.0, roughness: 0.4, fin: 'wood' },
	shellac: { color: 0x5a2818, metalness: 0.0, roughness: 0.3, fin: 'wood' }, // the SKS's red shellac
	steel: { color: 0xa7abb0, metalness: 1.0, roughness: 0.3, fin: 'metal', bare: 0xc9cdd2, mott: 0.6 },
	// machined steel in use: pins, swivels, a bolt seen through its port (polished steel there read as a white label)
	steelD: { color: 0x4c5055, metalness: 0.85, roughness: 0.46, fin: 'metal', bare: 0xa3a7ac, mott: 0.7 },
	// colour case-hardened receivers (double guns, lever actions): blues, straws and greys mottled by the noise
	case: { color: 0x6b6c70, metalness: 0.9, roughness: 0.3, fin: 'metal', bare: 0xb8bbbf, tint: 1, mott: 0.5 },
	chrome: { color: 0xd2d5d9, metalness: 1.0, roughness: 0.16 },
	blade: { color: 0xc3c7cb, metalness: 1.0, roughness: 0.22, fin: 'metal', bare: 0xd6d9dc, brush: 1 },
	darkblade: { color: 0x34373b, metalness: 0.7, roughness: 0.44, fin: 'metal', bare: 0xa5a9ae, mott: 0.4 }, // a coated blade: even
	satin: { color: 0x9a9ea3, metalness: 1.0, roughness: 0.4, fin: 'metal', bare: 0xc4c7ca, brush: 1 }, // a blade's brushed flats
	hamon: { color: 0xd4d8db, metalness: 0.7, roughness: 0.46 }, // the frosted hardened edge of a katana
	galv: { color: 0x878c90, metalness: 0.85, roughness: 0.48, fin: 'metal', bare: 0xb4b8bb }, // galvanised pipe
	leather: { color: 0x5a3a22, metalness: 0.0, roughness: 0.62, fin: 'poly' },
	hickory: { color: 0xa47a4c, metalness: 0.0, roughness: 0.44, fin: 'wood' }, // tool handles: pale, straight grain
	rust: { color: 0x6a4a36, metalness: 0.5, roughness: 0.75, fin: 'matte' },
	brass: { color: 0xcfa24c, metalness: 1.0, roughness: 0.3 },
	copper: { color: 0xc07a4e, metalness: 1.0, roughness: 0.34 },
	lead: { color: 0x6c6e72, metalness: 0.7, roughness: 0.5 },
	rubber: { color: 0x19191a, metalness: 0.0, roughness: 0.9, grip: 1, fin: 'matte' },
	orange: { color: 0xe0561c, metalness: 0.0, roughness: 0.5 },
	red: { color: 0xa21d17, metalness: 0.0, roughness: 0.48 },
	// red enamel on steel (a fire axe's head, a crowbar, a pipe wrench): it chips to bright steel on the edges
	redP: { color: 0x9a1c16, metalness: 0.15, roughness: 0.42, fin: 'metal', bare: 0x8e9196, mott: 0.6 },
	yellow: { color: 0xd8b02a, metalness: 0.0, roughness: 0.55 }, // stencil paint
	green2: { color: 0x2c6a2e, metalness: 0.0, roughness: 0.5 },
	plum: { color: 0x3e1d16, metalness: 0.0, roughness: 0.58, fin: 'poly' },
	// a moulded grip's textured panel: the frame's polymer, rougher (a black rubber patch read as a sticker)
	polyT: { color: 0x242527, metalness: 0.0, roughness: 0.8, grip: 1, fin: 'poly' },
	polyP: { color: 0x2a2423, metalness: 0.0, roughness: 0.6, grip: 1, fin: 'poly' }, // the AK-74M's plum-black polymer
	bakelite: { color: 0x47200f, metalness: 0.0, roughness: 0.4, fin: 'poly' },
	smoke: { color: 0x3a3630, metalness: 0.0, roughness: 0.25, transparent: true, opacity: 0.82 },
	card: { color: 0xc9b58c, metalness: 0.0, roughness: 0.9 },
	string: { color: 0x2a2a2a, metalness: 0.0, roughness: 0.85 },
	cloth: { color: 0x2d2a26, metalness: 0.0, roughness: 0.95 },
	white: { color: 0xe9e6de, metalness: 0.0, roughness: 0.5 },
	aluBright: { color: 0x9aa1a8, metalness: 1.0, roughness: 0.34, fin: 'matte' },
	glassG: { color: 0x23523a, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.72 },
	lens: { color: 0x10263a, metalness: 0.6, roughness: 0.06, transparent: true, opacity: 0.35, lens: 1 },
	lensDark: { color: 0x0a1822, metalness: 0.9, roughness: 0.05, lens: 1 },
	// a reflex sight's front glass: its amber coating reflects, the scene shows through
	lensF: { color: 0x6a3a18, metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.3, lens: 1 },
	lensW: { color: 0xe4ecef, metalness: 0.3, roughness: 0.04 }, // a light's lens over the reflector
	supp: { color: 0x2a2b2c, metalness: 0.35, roughness: 0.62, fin: 'metal', bare: 0x8a8c8e, mott: 0.6 }, // high-temperature cerakote
	glow: { color: 0x111111, emissive: 0x5cff5c, emissiveIntensity: 0.6, metalness: 0, roughness: 0.4 },
	glowO: { color: 0x111111, emissive: 0xff8a2a, emissiveIntensity: 0.6, metalness: 0, roughness: 0.4 },
	fiber: { color: 0x331100, emissive: 0xff5a20, emissiveIntensity: 1.2, metalness: 0, roughness: 0.3 },
	rag: { color: 0x9a8a70, metalness: 0.0, roughness: 0.95 },
	fuel: { color: 0x9a6a20, metalness: 0.0, roughness: 0.1, transparent: true, opacity: 0.8 },
	...ARMS_MAT,
};

// The finish, worked out in the gun's own frame (every part's geometry is in it, so the noise lines up across parts):
// value noise mottles the colour and the sheen, a fine grain bumps the normal, worn edges (the `wear` attribute: 1 on
// bevels, 0 on faces) go through to bare metal, wood gets growth rings round an axis along the gun, and brushed steel
// (a blade's flats) streaks along the part.
// A finish's own material compiles only its finish (WPN_METAL, ...). The palette material (WPN_PAL) looks each part's
// colour, roughness, metalness, bare metal and finish up in a small table by the part's index (its uv.x): a whole model
// draws in one call and one program, in the hands, on the ground (the item instancer keeps it whole) and in icons.
const WPN_FLAGS = /* glsl */`
#ifdef WPN_PAL
#define W_METAL ( abs( vPalF.x - 1.0 ) < 0.5 )
#define W_POLY ( abs( vPalF.x - 2.0 ) < 0.5 )
#define W_WOOD ( abs( vPalF.x - 3.0 ) < 0.5 )
#define W_MATTE ( abs( vPalF.x - 4.0 ) < 0.5 )
#define W_FLAG( b ) ( mod( floor( vPalF.y / b + 0.01 ), 2.0 ) > 0.5 )
#define W_GRIP W_FLAG( 1.0 )
#define W_CASE W_FLAG( 2.0 )
#define W_BRUSH W_FLAG( 4.0 )
#define W_MOTT vPalF.z
#define WBARE vPalB.rgb
#else
#define W_MOTT uMott
#ifdef WPN_METAL
#define W_METAL true
#else
#define W_METAL false
#endif
#ifdef WPN_POLY
#define W_POLY true
#else
#define W_POLY false
#endif
#ifdef WPN_WOOD
#define W_WOOD true
#else
#define W_WOOD false
#endif
#ifdef WPN_MATTE
#define W_MATTE true
#else
#define W_MATTE false
#endif
#ifdef WPN_GRIP
#define W_GRIP true
#else
#define W_GRIP false
#endif
#ifdef WPN_CASE
#define W_CASE true
#else
#define W_CASE false
#endif
#ifdef WPN_BRUSH
#define W_BRUSH true
#else
#define W_BRUSH false
#endif
#define WBARE uBare
#endif
`;
const WPN_PARS = /* glsl */`
varying vec3 vWObj;
#ifdef WPN_EDGE
varying float vWear;
#endif
uniform vec3 uBare;
uniform float uMott;
#ifdef WPN_PAL
varying vec4 vPalA;
varying vec4 vPalB;
varying vec4 vPalF;
#endif
${WPN_FLAGS}
float wHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float wNoise( vec3 x ) {
	vec3 i = floor( x ), f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( wHash( i ), wHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( wHash( i + vec3( 0.0, 1.0, 0.0 ) ), wHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
		mix( mix( wHash( i + vec3( 0.0, 0.0, 1.0 ) ), wHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( wHash( i + vec3( 0.0, 1.0, 1.0 ) ), wHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
}
`;
const WPN_SURFACE = /* glsl */`
{
	#ifdef WPN_PAL
	metalnessFactor = vPalB.a;
	#endif
	vec3 op = vWObj;
	// brushed steel: the noise drawn out along the part, fine across it (streaks, not a hammered mottle)
	vec3 nq = W_BRUSH ? op * vec3( 0.07, 1.0, 1.0 ) : op;
	// the mottle in octaves (35 mm, 7 mm, 1.4 mm, 0.36 mm cells), each shown only while its cells are a few to ~30
	// pixels across: a fixed scale read as soft blotches with a sight at the eye and as sparkle on the ground
	float f0 = length( fwidth( nq * 35.0 ) ), f1 = length( fwidth( nq * 140.0 ) ), f2 = length( fwidth( nq * 700.0 ) ), f3 = length( fwidth( nq * 2800.0 ) );
	#define WOCT( f ) ( smoothstep( 0.045, 0.14, f ) * ( 1.0 - smoothstep( 0.4, 0.8, f ) ) )
	float o0 = WOCT( f0 ), o1 = WOCT( f1 ), o2 = WOCT( f2 ), o3 = WOCT( f3 );
	// (an octave out of range costs nothing: mostly two of the four are drawn)
	float n0 = o0 > 0.0 ? wNoise( nq * 35.0 + 9.1 ) : 0.5, n1 = o1 > 0.0 ? wNoise( nq * 140.0 ) : 0.5;
	float n2 = o2 > 0.0 ? wNoise( nq * 700.0 + 3.1 ) : 0.5, n3 = o3 > 0.0 ? wNoise( nq * 2800.0 + 5.7 ) : 0.5;
	float mott = ( n0 - 0.5 ) * o0 * 0.8 + ( n1 - 0.5 ) * o1 + ( n2 - 0.5 ) * o2 * 0.7 + ( n3 - 0.5 ) * o3 * 0.5;
	// (the sheen varies mostly at the coarse scales: a fine octave a few pixels across turns into blotches in the
	// highlights, where a small change of roughness doubles the peak)
	float sheen = ( n0 - 0.5 ) * o0 * 0.6 + ( n1 - 0.5 ) * o1 * 0.5 + ( n2 - 0.5 ) * o2 * 0.3 + ( n3 - 0.5 ) * o3 * 0.25;
	if ( W_METAL || W_POLY || W_MATTE ) {
		// (a glossy finish, bluing or polished steel, shows a mottle as hammered blotches in its reflections: the
		// smoother the finish, the fainter)
		// (W_MOTT: the finish's own evenness, a coating or bluing less patchy than a blasted or moulded face)
		float gl = smoothstep( 0.2, 0.55, roughnessFactor ) * W_MOTT;
		diffuseColor.rgb *= 1.0 + mott * ( 0.04 + 0.1 * gl );
		roughnessFactor = clamp( roughnessFactor * ( 1.0 + sheen * ( 0.08 + 0.16 * gl ) ), 0.05, 1.0 );
	}
	if ( W_CASE ) {
		// (the colours swirled by a warped lookup, marbled the way the bone charcoal leaves them, not in round spots)
		vec3 cq = op * 55.0 + ( wNoise( op * 18.0 + 2.3 ) - 0.5 ) * 2.6;
		float cA = wNoise( cq + 1.7 ), cB = wNoise( cq * 2.1 + 5.3 );
		vec3 tint = mix( vec3( 0.45, 0.52, 0.78 ), vec3( 1.2, 1.0, 0.66 ), smoothstep( 0.3, 0.75, cA ) );
		tint = mix( tint, vec3( 0.72, 0.58, 0.85 ), smoothstep( 0.6, 0.88, cB ) * 0.5 );
		diffuseColor.rgb *= mix( vec3( 1.0 ), tint, 0.62 );
	}
	if ( W_WOOD ) {
		float w = wNoise( op * vec3( 4.0, 45.0, 45.0 ) );
		// the growth rings round a log axis along the part that wanders a little: on the long faces they run as
		// straight grain with a gentle drift, on the ends and round the curves they open into the cathedral figure
		// (a stronger warp drew contour-map whorls everywhere)
		vec2 warp = vec2( wNoise( op * vec3( 1.5, 6.0, 6.0 ) ), wNoise( op * vec3( 1.5, 6.0, 6.0 ) + 4.7 ) ) - 0.5;
		float ring = fract( length( op.yz + vec2( 0.31, 0.17 ) + warp * 0.02 ) * 150.0 + w * 1.3 + wNoise( op * vec3( 2.0, 7.0, 7.0 ) ) * 1.8 );
		float late = smoothstep( 0.55, 0.8, ring ) * ( 1.0 - smoothstep( 0.86, 1.0, ring ) );
		float pore = smoothstep( 0.62, 0.9, wNoise( op * vec3( 30.0, 1100.0, 1100.0 ) ) );
		diffuseColor.rgb *= ( 1.0 - 0.2 * late ) * ( 1.0 - 0.16 * pore ) * ( 0.88 + 0.24 * w );
		roughnessFactor = clamp( roughnessFactor + 0.1 * late + 0.1 * pore, 0.05, 1.0 );
	}
	#ifdef WPN_EDGE
	// patchy: only where the low noise is high does an edge wear through, its border broken up a few mm at a time
	// (not by the fine sparkle noise: that turned every edge into salt and pepper)
	float wm = smoothstep( 0.55, 0.85, vWear * smoothstep( 0.42, 0.78, wNoise( op * 60.0 + 7.3 ) ) + ( wNoise( op * 260.0 + 1.7 ) - 0.5 ) * 0.3 );
	if ( W_METAL ) {
		diffuseColor.rgb = mix( diffuseColor.rgb, WBARE, wm * 0.65 );
		metalnessFactor = mix( metalnessFactor, 1.0, wm );
		roughnessFactor = mix( roughnessFactor, 0.3, wm );
	} else if ( W_POLY ) {
		diffuseColor.rgb *= 1.0 + 0.6 * wm;
		roughnessFactor = mix( roughnessFactor, 0.85, wm );
	} else if ( W_WOOD ) {
		diffuseColor.rgb *= 1.0 + 0.3 * wm;
		roughnessFactor = mix( roughnessFactor, 0.7, wm );
	}
	#endif
}
`;
// a fine cast / blasted grain on metal and polymer (a bump from the noise's screen derivatives)
const WPN_GRAIN = /* glsl */`
#if defined( WPN_PAL ) || defined( WPN_METAL ) || defined( WPN_POLY ) || defined( WPN_GRIP )
{
	// (each bump fades out where its cells grow past a few pixels: up close they'd show as square facets; and where
	// they shrink under a pixel, on a gun lying a few metres off, where they'd alias into moire; the derivatives are
	// taken outside any branch, a palette part's finish only scales the height)
	vec3 gq = W_BRUSH ? vWObj * vec3( 0.07, 1.0, 1.0 ) : vWObj;
	float fg = length( fwidth( gq * 520.0 ) ), fs = length( fwidth( vWObj * 1250.0 ) );
	float h = wNoise( gq * 520.0 ) * 0.00003 * smoothstep( 0.12, 0.4, fg ) * ( 1.0 - smoothstep( 1.0, 2.5, fg ) );
	// moulded stipple on grips and pads: fine raised bumps (in the gun's frame, so every part has the same grain)
	h += ( W_GRIP ? 1.0 : 0.0 ) * smoothstep( 0.4, 0.8, wNoise( vWObj * 1250.0 ) ) * 0.00005 * smoothstep( 0.03, 0.15, fs ) * ( 1.0 - smoothstep( 1.0, 2.5, fs ) );
	// (a polished face shows its grain as sparkle in the reflections: less of it there)
	h *= ( W_METAL || W_POLY || W_GRIP ? 1.0 : 0.0 ) * mix( 0.35, 1.0, smoothstep( 0.2, 0.5, roughnessFactor ) );
	vec2 dH = vec2( dFdx( h ), dFdy( h ) );
	vec3 sx = dFdx( - vViewPosition ), sy = dFdy( - vViewPosition );
	vec3 r1 = cross( sy, normal ), r2 = cross( normal, sx );
	float det = dot( sx, r1 ) * faceDirection;
	normal = normalize( abs( det ) * normal - sign( det ) * ( dH.x * r1 + dH.y * r2 ) );
}
#endif
`;
// pal: the palette table (a DataTexture) for the palette material; mott: a finish's mottle strength (1: full)
function weaponShader( m, bare, pal = null, mott = 1 ) {
	return ( shader ) => {
		shader.uniforms.uBare = { value: bare };
		shader.uniforms.uMott = { value: mott };
		if ( pal ) shader.uniforms.uPal = { value: pal };
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nvarying vec3 vWObj;\n#ifdef WPN_EDGE\nattribute float wear;\nvarying float vWear;\n#endif\n#ifdef WPN_PAL\nuniform highp sampler2D uPal;\nvarying vec4 vPalA;\nvarying vec4 vPalB;\nvarying vec4 vPalF;\n#endif' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvWObj = position;\n#ifdef WPN_EDGE\nvWear = wear;\n#endif\n#ifdef WPN_PAL\n{ int pi = int( uv.x + 0.5 ); vPalA = texelFetch( uPal, ivec2( pi, 0 ), 0 ); vPalB = texelFetch( uPal, ivec2( pi, 1 ), 0 ); vPalF = texelFetch( uPal, ivec2( pi, 2 ), 0 ); }\n#endif' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + WPN_PARS )
			// (the palette's colour and roughness go in before the world's wetness darkens and smooths them)
			.replace( '#include <color_fragment>', '#include <color_fragment>\n#ifdef WPN_PAL\ndiffuseColor.rgb *= vPalA.rgb;\n#endif' )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef WPN_PAL\nroughnessFactor = vPalA.a;\n#endif' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + WPN_SURFACE )
			.replace( '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WPN_GRAIN );
	};
}

// The palette: every opaque, unlit finish (not glass, lenses' tinted glass or glowing inserts) gets an index; a model's
// parts in those finishes merge into one mesh whose uv.x is each vertex's index (the finishes don't use uvs). Its table
// (3 rows: colour + roughness, bare metal + metalness, finish flags) is a float texture the vertex shader reads.
export const PAL = '~pal';
const palettable = ( d ) => !! d && ! d.transparent && ! d.emissive;
const FIN_CODE = { metal: 1, poly: 2, wood: 3, matte: 4 };
const PAL_KEYS = Object.keys( MAT ).filter( ( k ) => palettable( MAT[ k ] ) );
const PAL_INDEX = new Map( PAL_KEYS.map( ( k, i ) => [ k, i ] ) );
let palTex = null;
function paletteTexture() {
	if ( palTex ) return palTex;
	const n = PAL_KEYS.length, data = new Float32Array( n * 3 * 4 ), c = new THREE.Color();
	PAL_KEYS.forEach( ( k, i ) => {
		const d = MAT[ k ];
		c.set( d.color ); data.set( [ c.r, c.g, c.b, d.roughness ], i * 4 );
		c.set( d.bare ?? d.color ); data.set( [ c.r, c.g, c.b, d.metalness ], ( n + i ) * 4 );
		data.set( [ FIN_CODE[ d.fin ] || 0, ( d.grip ? 1 : 0 ) + ( d.tint ? 2 : 0 ) + ( d.brush ? 4 : 0 ), d.mott ?? 1, 0 ], ( 2 * n + i ) * 4 );
	} );
	palTex = new THREE.DataTexture( data, n, 3, THREE.RGBAFormat, THREE.FloatType );
	palTex.needsUpdate = true;
	return palTex;
}

let whiteTex = null;
function whiteTexture() {
	if ( ! whiteTex ) { whiteTex = new THREE.DataTexture( new Uint8Array( [ 255, 255, 255, 255 ] ), 1, 1 ); whiteTex.needsUpdate = true; }
	return whiteTex;
}

const MATS = {};
// mode: 'world' (fogged, cloud-shadowed, cast shadows) | 'view' (first-person: no fog, lit by the view scene; the
// worn edges read the geometry's `wear` attribute, which the world's merged item batches drop)
export function weaponMaterials( mode = 'world' ) {
	if ( MATS[ mode ] ) return MATS[ mode ];
	const out = {};
	const view = mode === 'view';
	for ( const k in MAT ) {
		const d = MAT[ k ];
		const m = new THREE.MeshStandardMaterial( {
			color: d.color, metalness: d.metalness, roughness: d.roughness, transparent: !! d.transparent, opacity: d.opacity ?? 1,
			emissive: d.emissive ?? 0x000000, emissiveIntensity: d.emissiveIntensity ?? 1,
		} );
		if ( d.transparent ) { m.depthWrite = ! d.lens; }
		m.name = 'wpn_' + k;
		m.defines = view ? { NO_ATMOS_FOG: '' } : {};
		const fin = d.fin;
		if ( fin ) {
			m.defines[ 'WPN_' + fin.toUpperCase() ] = '';
			if ( d.grip ) m.defines.WPN_GRIP = '';
			if ( d.tint ) m.defines.WPN_CASE = '';
			if ( d.brush ) m.defines.WPN_BRUSH = '';
			if ( view && fin !== 'matte' ) m.defines.WPN_EDGE = '';
		}
		const extra = fin ? weaponShader( m, new THREE.Color( d.bare ?? d.color ), null, d.mott ?? 1 ) : null;
		const key = ( view ? 'wpn-view' : 'wpn' ) + ( fin ? '-' + fin : '' ) + ( d.grip ? '-grip' : '' ) + ( d.tint ? '-case' : '' ) + ( d.brush ? '-brush' : '' );
		if ( view ) patchMaterial( m, key, extra, { noCloudShadow: true } );
		else patchMaterial( m, key, extra );
		out[ k ] = m;
	}
	// the palette material: white, its parts' finishes from the table
	const m = new THREE.MeshStandardMaterial( { color: 0xffffff, metalness: 1, roughness: 1 } );
	m.name = 'wpn_palette';
	m.defines = view ? { NO_ATMOS_FOG: '', WPN_PAL: '', WPN_EDGE: '' } : { WPN_PAL: '' };
	const extra = weaponShader( m, new THREE.Color(), paletteTexture() );
	if ( view ) patchMaterial( m, 'wpn-view-pal', extra, { noCloudShadow: true } );
	else {
		// a white 1 x 1 roughness map (it changes nothing): the item instancer folds an untextured material into its
		// shared plain buckets, which would drop the palette and draw the gun white; a textured one it keeps whole
		m.roughnessMap = whiteTexture();
		patchMaterial( m, 'wpn-pal', extra );
	}
	out[ PAL ] = m;
	MATS[ mode ] = out;
	return out;
}

// a baked part's meshes for drawing with the palette: [ [ material key, geometry ] ], the palette's merged part first
function paletteGeo( baked ) {
	if ( baked.pal ) return baked.pal;
	const out = [], geos = [];
	for ( const k in baked.geo ) {
		const pk = MAT[ k ] ? k : 'blk';
		if ( ! palettable( MAT[ pk ] ) ) { out.push( [ k, baked.geo[ k ] ] ); continue; }
		const src = baked.geo[ k ], n = src.attributes.position.count, idx = PAL_INDEX.get( pk );
		const g = new THREE.BufferGeometry();
		for ( const a of [ 'position', 'normal', 'wear' ] ) g.setAttribute( a, src.attributes[ a ] );
		const uv = new Float32Array( n * 2 );
		for ( let i = 0; i < n; i ++ ) uv[ i * 2 ] = idx;
		g.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
		geos.push( g );
	}
	if ( geos.length ) {
		const m = geos.length === 1 ? geos[ 0 ] : mergeGeometries( geos, false );
		m.computeBoundingBox(); m.computeBoundingSphere();
		out.unshift( [ PAL, m ] );
	}
	baked.pal = out;
	return out;
}

// ---- geometry toolkit -----------------------------------------------------------------------------------------

export function prep( g ) {
	if ( g.index ) g = g.toNonIndexed();
	for ( const k of Object.keys( g.attributes ) ) if ( ! [ 'position', 'normal', 'uv', 'wear' ].includes( k ) ) g.deleteAttribute( k );
	if ( ! g.attributes.uv ) g.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( g.attributes.position.count * 2 ), 2 ) );
	if ( ! g.attributes.normal ) g.computeVertexNormals();
	if ( ! g.attributes.wear ) edge( g, 0.15 );
	g.clearGroups();
	return g;
}

// the `wear` attribute the view finish reads: how far a vertex sits out on a bevel, from its normal before the part
// is placed. 'box': between two faces of a box; 'ext': on an extrusion's bevel (between the profile wall and a cap);
// 'extX' / 'extY': extruded along x / y; a number: the same everywhere (round parts)
export function edge( g, kind ) {
	const n = g.attributes.normal, c = n.count, w = new Float32Array( c );
	for ( let i = 0; i < c; i ++ ) {
		if ( typeof kind === 'number' ) { w[ i ] = kind; continue; }
		const x = Math.abs( n.getX( i ) ), y = Math.abs( n.getY( i ) ), z = Math.abs( n.getZ( i ) );
		const f = kind === 'box' ? Math.max( x, y, z ) : kind === 'extX' ? Math.max( x, Math.hypot( y, z ) ) : kind === 'extY' ? Math.max( y, Math.hypot( x, z ) ) : Math.max( z, Math.hypot( x, y ) );
		w[ i ] = Math.min( 1, ( 1 - f ) / 0.29 );
	}
	g.setAttribute( 'wear', new THREE.Float32BufferAttribute( w, 1 ) );
	return g;
}

// A box with one flat bevel on every edge and corner, its normals rounded across the bevel (it shades like a radius):
// 44 triangles where RoundedBoxGeometry's single segment makes 108. The bevels carry the wear, the faces none.
export function bevelBox( sx, sy, sz, r ) {
	const h = [ sx / 2, sy / 2, sz / 2 ];
	r = Math.min( r, h[ 0 ] * 0.98, h[ 1 ] * 0.98, h[ 2 ] * 0.98 );
	const pos = [], nor = [], wr = [];
	const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
	// v = [ x, y, z, nx, ny, nz ]; the winding is fixed so the face points along its normals
	const tri = ( a, b, c, w ) => {
		_a.set( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ); _b.set( c[ 0 ] - a[ 0 ], c[ 1 ] - a[ 1 ], c[ 2 ] - a[ 2 ] );
		_n.crossVectors( _a, _b );
		if ( _n.x * ( a[ 3 ] + b[ 3 ] + c[ 3 ] ) + _n.y * ( a[ 4 ] + b[ 4 ] + c[ 4 ] ) + _n.z * ( a[ 5 ] + b[ 5 ] + c[ 5 ] ) < 0 ) [ b, c ] = [ c, b ];
		for ( const v of [ a, b, c ] ) { pos.push( v[ 0 ], v[ 1 ], v[ 2 ] ); nor.push( v[ 3 ], v[ 4 ], v[ 5 ] ); wr.push( w ); }
	};
	const quad = ( a, b, c, d, w ) => { tri( a, b, c, w ); tri( a, c, d, w ); };
	// a broad radius is a moulded or machined round, not an edge that rubs through: it wears less
	const ew = Math.min( 1, 0.0035 / r );
	// the point of face ( axis k, side s ) towards the corner signs sg = [ sx, sy, sz ]
	const fv = ( k, s, sg ) => {
		const v = [ 0, 0, 0, 0, 0, 0 ];
		for ( let i = 0; i < 3; i ++ ) v[ i ] = i === k ? s * h[ i ] : sg[ i ] * ( h[ i ] - r );
		v[ 3 + k ] = s;
		return v;
	};
	for ( let k = 0; k < 3; k ++ ) for ( const s of [ - 1, 1 ] ) {
		const b = ( k + 1 ) % 3, c = ( k + 2 ) % 3, sg = ( sb, sc ) => { const o = [ 0, 0, 0 ]; o[ b ] = sb; o[ c ] = sc; return o; };
		quad( fv( k, s, sg( - 1, - 1 ) ), fv( k, s, sg( 1, - 1 ) ), fv( k, s, sg( 1, 1 ) ), fv( k, s, sg( - 1, 1 ) ), 0 );
	}
	// edge strips: between face ( a, sa ) and face ( b, sb ), along the third axis
	for ( let a = 0; a < 3; a ++ ) {
		const b = ( a + 1 ) % 3, c = ( a + 2 ) % 3;
		for ( const sa of [ - 1, 1 ] ) for ( const sb of [ - 1, 1 ] ) {
			const at = ( sc ) => { const o = [ 0, 0, 0 ]; o[ a ] = sa; o[ b ] = sb; o[ c ] = sc; return o; };
			quad( fv( a, sa, at( - 1 ) ), fv( a, sa, at( 1 ) ), fv( b, sb, at( 1 ) ), fv( b, sb, at( - 1 ) ), 0.9 * ew );
		}
	}
	for ( const sx of [ - 1, 1 ] ) for ( const sy of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {
		const sg = [ sx, sy, sz ];
		tri( fv( 0, sx, sg ), fv( 1, sy, sg ), fv( 2, sz, sg ), ew );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( nor, 3 ) );
	g.setAttribute( 'wear', new THREE.Float32BufferAttribute( wr, 1 ) );
	return g;
}
// a straight prism along x from x0 to x1 of a front profile ( [ z, y, cornerRadius? ] ), unbevelled
export function prismX( pts, x0, x1, curveSeg = 2 ) {
	const g = new THREE.ExtrudeGeometry( shape( pts ), { depth: Math.max( 1e-5, Math.abs( x1 - x0 ) ), bevelEnabled: false, curveSegments: curveSeg } );
	g.rotateY( - PI / 2 ); g.translate( Math.max( x0, x1 ), 0, 0 );
	return edge( toCreasedNormals( g, 0.7 ), 'extX' );
}
export const boxGeo = ( sx, sy, sz, r ) => r > 0 ? bevelBox( sx, sy, sz, Math.min( r, sx / 2.01, sy / 2.01, sz / 2.01 ) ) : edge( new THREE.BoxGeometry( sx, sy, sz ), 'box' );

// rounded polygon outline: pts = [ [ x, y, cornerRadius? ], ... ]
export function shape( pts, holes = [] ) {
	const s = new THREE.Shape();
	outline( s, pts );
	for ( const h of holes ) { const p = new THREE.Path(); outline( p, h ); s.holes.push( p ); }
	return s;
}
function outline( s, pts ) {
	const n = pts.length;
	for ( let i = 0; i < n; i ++ ) {
		const [ x, y, r = 0 ] = pts[ i ];
		if ( ! r ) { if ( i === 0 ) s.moveTo( x, y ); else s.lineTo( x, y ); continue; }
		const [ px, py ] = pts[ ( i - 1 + n ) % n ], [ nx, ny ] = pts[ ( i + 1 ) % n ];
		const d1 = Math.hypot( px - x, py - y ) || 1, d2 = Math.hypot( nx - x, ny - y ) || 1;
		const r1 = Math.min( r, d1 * 0.5 ), r2 = Math.min( r, d2 * 0.5 );
		const ax = x + ( px - x ) / d1 * r1, ay = y + ( py - y ) / d1 * r1;
		const bx = x + ( nx - x ) / d2 * r2, by = y + ( ny - y ) / d2 * r2;
		if ( i === 0 ) s.moveTo( ax, ay ); else s.lineTo( ax, ay );
		s.quadraticCurveTo( x, y, bx, by );
	}
	s.closePath?.();
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// A bag of geometries per material; `sub( name, pivot )` makes a separately animated child.
export class Parts {
	constructor() { this.geo = {}; this.subs = {}; this.pivot = V3(); this.tris = 0; }
	put( mat, g, pos, rot, scl ) {
		if ( pos || rot || scl ) {
			_p.set( ...( pos || [ 0, 0, 0 ] ) ); _e.set( ...( rot || [ 0, 0, 0 ] ) ); _q.setFromEuler( _e ); _s.set( ...( scl || [ 1, 1, 1 ] ) );
			g.applyMatrix4( _m.compose( _p, _q, _s ) );
		}
		g = prep( g );
		( this.geo[ mat ] ||= [] ).push( g );
		return this;
	}
	// axis-aligned box by extents, bevel radius r
	box( mat, x0, x1, y0, y1, z0, z1, r = 0.002, rot = null ) {
		const sx = Math.abs( x1 - x0 ), sy = Math.abs( y1 - y0 ), sz = Math.abs( z1 - z0 );
		const g = boxGeo( sx, sy, sz, r );
		if ( rot ) g.rotateX( rot[ 0 ] ).rotateY( rot[ 1 ] ).rotateZ( rot[ 2 ] );
		return this.put( mat, g, [ ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 ] );
	}
	// centred box, optional rotation (radians, xyz)
	boxC( mat, cx, cy, cz, sx, sy, sz, r = 0.002, rot = null ) {
		return this.put( mat, boxGeo( sx, sy, sz, r ), [ cx, cy, cz ], rot );
	}
	// cylinder along +x from x0 (radius r0) to x1 (radius r1)
	cyl( mat, x0, x1, r0, y = 0, z = 0, seg = 14, r1 = r0, rotX = 0 ) {
		const g = new THREE.CylinderGeometry( r1, r0, Math.abs( x1 - x0 ), seg, 1 );
		g.rotateY( rotX ); g.rotateZ( - PI / 2 );
		return this.put( mat, g, [ ( x0 + x1 ) / 2, y, z ] );
	}
	// vertical cylinder
	cylY( mat, x, y0, y1, r0, z = 0, seg = 12, r1 = r0 ) {
		const g = new THREE.CylinderGeometry( r1, r0, Math.abs( y1 - y0 ), seg, 1 );
		return this.put( mat, g, [ x, ( y0 + y1 ) / 2, z ] );
	}
	// cylinder across the gun (along z)
	cylZ( mat, x, y, z0, z1, r0, seg = 12, r1 = r0 ) {
		const g = new THREE.CylinderGeometry( r1, r0, Math.abs( z1 - z0 ), seg, 1 );
		g.rotateX( PI / 2 );
		return this.put( mat, g, [ x, y, ( z0 + z1 ) / 2 ] );
	}
	// generic cylinder between two points
	rod( mat, a, b, r0, seg = 10, r1 = r0 ) {
		const A = V3( ...a ), B = V3( ...b ), d = B.clone().sub( A ), L = d.length();
		const g = new THREE.CylinderGeometry( r1, r0, L, seg, 1 );
		_q.setFromUnitVectors( V3( 0, 1, 0 ), d.normalize() );
		const mid = A.add( B ).multiplyScalar( 0.5 );
		g.applyMatrix4( _m.compose( mid, _q, _s.set( 1, 1, 1 ) ) );
		return this.put( mat, g );
	}
	sphere( mat, x, y, z, r, seg = 10, scl = null ) {
		return this.put( mat, new THREE.SphereGeometry( r, seg, Math.max( 4, seg * 0.6 | 0 ) ), [ x, y, z ], null, scl );
	}
	// lathe around +x: prof = [ [ x, r ], ... ] (x increasing)
	lathe( mat, prof, y = 0, z = 0, seg = 16, phase = 0 ) {
		const pts = prof.map( ( [ x, r ] ) => new THREE.Vector2( Math.max( r, 1e-4 ), x ) );
		const g = new THREE.LatheGeometry( pts, seg, phase );
		g.rotateZ( - PI / 2 ); // lathe axis y -> +x; points (r, x) map to (x, r)
		// rotateZ(-90) maps +y to +x and x to -y: the profile ends up correct because it's rotationally symmetric
		return this.put( mat, g, [ 0, y, z ] );
	}
	// side profile (x, y) extruded between z0 and z1
	// (bevelSeg > 1 rounds the edges over: stocks, grips, moulded shells)
	ext( mat, pts, z0, z1, bevel = 0.0018, holes = [], curveSeg = 3, bevelSeg = 1 ) {
		const s = shape( pts, holes );
		const depth = Math.max( 1e-4, Math.abs( z1 - z0 ) - 2 * bevel );
		let g = new THREE.ExtrudeGeometry( s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: - bevel, bevelSegments: bevelSeg, curveSegments: curveSeg } );
		g.translate( 0, 0, Math.min( z0, z1 ) + bevel );
		g = edge( toCreasedNormals( g, 0.7 ), 'ext' );
		return this.put( mat, g );
	}
	// symmetric side profile: thickness 2 * hz around z = zc
	extS( mat, pts, hz, bevel = 0.0018, zc = 0, holes = [], curveSeg = 3, bevelSeg = 1 ) { return this.ext( mat, pts, zc - hz, zc + hz, bevel, holes, curveSeg, bevelSeg ); }
	// a rounded slab (stock, grip, moulded shell): the side profile with its edges radiused over r in three steps
	extR( mat, pts, hz, r, zc = 0, holes = [], curveSeg = 4 ) { return this.ext( mat, pts, zc - hz, zc + hz, Math.min( r, hz * 0.95 ), holes, curveSeg, 3 ); }
	// top-view profile (x, z) extruded between y0 and y1
	extTop( mat, pts, y0, y1, bevel = 0.0015, curveSeg = 3 ) {
		const s = shape( pts.map( ( [ x, z, r ] ) => [ x, - z, r ] ) );
		const depth = Math.max( 1e-4, Math.abs( y1 - y0 ) - 2 * bevel );
		let g = new THREE.ExtrudeGeometry( s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: - bevel, bevelSegments: 1, curveSegments: curveSeg } );
		g.rotateX( - PI / 2 ); // extrusion (z) -> +y, shape y -> -z (we negated z above)
		g.translate( 0, Math.min( y0, y1 ) + bevel, 0 );
		g = edge( toCreasedNormals( g, 0.7 ), 'extY' );
		return this.put( mat, g );
	}
	// front-view profile (z, y) extruded along x between x0 and x1
	extFront( mat, pts, x0, x1, bevel = 0.0015, curveSeg = 3, holes = [] ) {
		const s = shape( pts, holes );
		const depth = Math.max( 1e-4, Math.abs( x1 - x0 ) - 2 * bevel );
		let g = new THREE.ExtrudeGeometry( s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: - bevel, bevelSegments: 1, curveSegments: curveSeg } );
		g.rotateY( - PI / 2 ); // extrusion +z -> -x, shape x -> +z
		g.translate( Math.max( x0, x1 ) - bevel, 0, 0 );
		g = edge( toCreasedNormals( g, 0.7 ), 'extX' );
		return this.put( mat, g );
	}
	torusX( mat, x, y, z, R, r, seg = 12 ) {
		const g = new THREE.TorusGeometry( R, r, 6, seg ); g.rotateY( PI / 2 );
		return this.put( mat, g, [ x, y, z ] );
	}
	// Picatinny rail from x0 to x1, half width hw: a dovetailed spine, and every 10 mm a land with 45° shoulders (the
	// cross slots between them). y is the plane between the spine and the lands: the lands stand 3.8 mm above it, the
	// spine 6 mm below. dir 'top' | 'bottom' | 'right' | 'left' (a side rail: y is the z of that plane)
	rail( mat, x0, x1, y, hw = 0.0105, dir = 'top' ) {
		const rot = { top: 0, bottom: PI, right: PI / 2, left: - PI / 2 }[ dir ];
		const h = dir === 'bottom' || dir === 'left' ? - y : y;
		const c = Math.min( 0.0028, hw * 0.3 );
		const spine = prismX( [ [ - hw * 0.72, h - 0.006 ], [ hw * 0.72, h - 0.006 ], [ hw, h - 0.0034 ], [ hw, h ], [ - hw, h ], [ - hw, h - 0.0034 ] ], x0, x1 );
		this.put( mat, spine.rotateX( rot ) );
		const land = [ [ - hw, h - 0.0004 ], [ hw, h - 0.0004 ], [ hw, h + 0.0038 - c ], [ hw - c, h + 0.0038 ], [ - hw + c, h + 0.0038 ], [ - hw, h + 0.0038 - c ] ];
		const n = Math.floor( ( x1 - x0 - 0.0052 ) / 0.01 ) + 1, x00 = ( x0 + x1 ) / 2 - ( ( n - 1 ) * 0.01 + 0.0052 ) / 2;
		const tpl = prismX( land, 0, 0.0052 );
		// the lands' crowns wear bright first
		const p = tpl.attributes.position, w = tpl.attributes.wear;
		for ( let i = 0; i < p.count; i ++ ) w.setX( i, p.getY( i ) > h + 0.0036 ? 0.5 : 0 );
		tpl.rotateX( rot );
		const geos = [];
		for ( let i = 0; i < n; i ++ ) geos.push( tpl.clone().translate( x00 + i * 0.01, 0, 0 ) );
		if ( geos.length ) this.put( mat, mergeGeometries( geos, false ) );
		return this;
	}
	sub( name, x = 0, y = 0, z = 0 ) {
		const p = new Parts(); p.pivot.set( x, y, z ); p.name = name;
		this.subs[ name ] = p;
		return p;
	}
	// geometry per material (merged) — cached by the caller and shared between material modes
	bake() {
		const out = { geo: {}, subs: {}, pivot: this.pivot.clone(), name: this.name };
		for ( const k in this.geo ) {
			const g = mergeGeometries( this.geo[ k ], false );
			g.computeBoundingBox(); g.computeBoundingSphere();
			out.geo[ k ] = g;
		}
		for ( const k in this.subs ) out.subs[ k ] = this.subs[ k ].bake();
		return out;
	}
}

// Object3D from a baked part tree. Sub-part geometry is in the parent frame; its group sits at the pivot.
// batch: draw the opaque finishes with the palette, one mesh per part (the views, and the item models: the world's
// instancer keeps a non-plain material whole, so a dropped gun is one instanced draw with its finishes intact)
export function instantiate( baked, mats, shadows = false, batch = false ) {
	const g = new THREE.Group();
	g.name = baked.name || '';
	for ( const [ k, geo ] of batch ? paletteGeo( baked ) : Object.entries( baked.geo ) ) {
		const mesh = new THREE.Mesh( geo, mats[ k ] || mats.blk );
		mesh.castShadow = shadows && ! mats[ k ]?.transparent; mesh.receiveShadow = shadows;
		if ( baked.pivot.lengthSq() > 0 ) mesh.position.copy( baked.pivot ).negate();
		g.add( mesh );
	}
	g.userData.parts = {};
	for ( const k in baked.subs ) {
		const sb = baked.subs[ k ];
		const child = instantiate( sb, mats, shadows, batch );
		// child meshes are in the parent frame: the group sits at the pivot, meshes offset back by the pivot
		child.position.copy( sb.pivot ).sub( baked.pivot );
		child.userData.rest = child.position.clone();
		g.add( child );
		g.userData.parts[ k ] = child;
		Object.assign( g.userData.parts, child.userData.parts );
	}
	return g;
}

export function countTris( obj ) {
	let n = 0;
	obj.traverse( o => { if ( o.isMesh ) n += ( o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count ) / 3; } );
	return n;
}

export function cartridge( P, x, y, z, cal, len = null, dir = 1 ) {
	const C = CAL[ cal ] || CAL[ '5.56' ];
	const l = len ?? C.len;
	const case_ = l * C.caseF, r = C.r;
	if ( cal === '12ga' ) {
		P.cyl( 'brass', x, x + dir * 0.012, r * 1.04, y, z, 10 );
		P.cyl( 'red', x + dir * 0.012, x + dir * l, r, y, z, 10 );
		return P;
	}
	P.cyl( 'brass', x, x + dir * case_, r, y, z, 8, r * C.neck );
	P.cyl( C.tip || 'copper', x + dir * case_, x + dir * l, r * C.neck * 0.95, y, z, 8, r * 0.25 );
	return P;
}
export const CAL = {
	'9mm': { len: 0.029, r: 0.0049, caseF: 0.66, neck: 0.98 }, '.45acp': { len: 0.032, r: 0.006, caseF: 0.7, neck: 0.98 },
	'.357': { len: 0.04, r: 0.0048, caseF: 0.8, neck: 0.98, tip: 'lead' }, '.44mag': { len: 0.041, r: 0.0057, caseF: 0.78, neck: 0.98, tip: 'lead' },
	'.50ae': { len: 0.041, r: 0.0069, caseF: 0.73, neck: 0.98 }, '.22lr': { len: 0.025, r: 0.0029, caseF: 0.62, neck: 0.98, tip: 'lead' },
	'9x18': { len: 0.025, r: 0.0049, caseF: 0.7, neck: 0.98 }, '5.56': { len: 0.057, r: 0.0048, caseF: 0.78, neck: 0.64 },
	'5.45': { len: 0.057, r: 0.005, caseF: 0.7, neck: 0.62 }, '7.62x39': { len: 0.056, r: 0.0056, caseF: 0.7, neck: 0.72 },
	'.308': { len: 0.071, r: 0.006, caseF: 0.72, neck: 0.72 }, '7.62x54r': { len: 0.077, r: 0.0062, caseF: 0.7, neck: 0.7 },
	'.50bmg': { len: 0.138, r: 0.0102, caseF: 0.72, neck: 0.62 }, '12ga': { len: 0.07, r: 0.0105, caseF: 1, neck: 1 },
	'.30-30': { len: 0.064, r: 0.0053, caseF: 0.8, neck: 0.72, tip: 'lead' }, '4.6x30': { len: 0.038, r: 0.0041, caseF: 0.78, neck: 0.62 },
	flare: { len: 0.07, r: 0.0105, caseF: 1, neck: 1 },
};
export const CALIBERS = CAL;

export function topRound( P, x, y, cal, len = null ) {
	const C = CAL[ cal ] || CAL[ '5.56' ];
	const l = Math.min( len ?? C.len, C.len );
	cartridge( P, x - l * 0.45, y + C.r * 0.2, 0, cal, l );
}

// ---- gun archetypes --------------------------------------------------------------------------------------------------
// Each returns { P, info }. info: sockets and hand grips in the gun frame.
//   sightH: iron sight line height; rearX: rear aperture x; eyeBack: eye distance behind the rear sight
//   muzzle / eject / light: [ x, y, z ]; mag: { p, rake }; optic: [ x, y ] (rail top where optics sit)
//   grips: { R: { p, a, n, r, trig }, L: { ... } } — p grip centre, a knuckle line (pinky -> index), n back-of-hand dir
//   hideWithOptic: part names folded / removed when an optic is mounted

export const grip = ( p, a, n, r = 0.016, extra = {} ) => ( { p: V3( ...p ), a: V3( ...a ).normalize(), n: V3( ...n ).normalize(), r, ...extra } );

// pistol grip profile raked back: top front (tx, ty), length h, rake angle (rad), depth dTop/dBot
export function pistolGrip( P, mat, tx, ty, h, rake, dTop, dBot, hz, bevel = 0.004, finger = 0 ) {
	const sx = Math.sin( rake ), cy = Math.cos( rake );
	const bx = tx - sx * h, by = ty - cy * h;
	const pts = [
		[ tx, ty ], [ tx - dTop, ty ],
		[ bx - dBot - 0.004, by + 0.004, 0.012 ], [ bx - 0.002, by - 0.002, 0.01 ],
	];
	if ( finger ) {
		for ( let i = 3; i >= 1; i -- ) { const t = i / 4; pts.push( [ tx - sx * h * t + ( i % 2 ? 0.0 : 0.003 ), ty - cy * h * t, 0.008 ] ); }
	}
	P.extS( mat, pts, hz, bevel, 0, [], 4, 2 );
	return { p: V3( tx - dTop * 0.5 - sx * h * 0.45, ty - cy * h * 0.45, 0 ), a: V3( sx, cy, 0 ), bottom: V3( bx - dBot / 2, by, 0 ) };
}

export function triggerGuard( P, mat, x0, x1, y0, depth, hz = 0.005 ) {
	P.extS( mat, [ [ x0, y0 ], [ x1, y0 ], [ x1, y0 - depth, 0.008 ], [ x0 + 0.004, y0 - depth, 0.006 ] ], hz, 0.0012,
		0, [ [ [ x0 + 0.005, y0 - 0.002 ], [ x1 - 0.005, y0 - 0.002 ], [ x1 - 0.005, y0 - depth + 0.005, 0.006 ], [ x0 + 0.008, y0 - depth + 0.005, 0.004 ] ] ] );
}

export function trigger( P, x, y, len = 0.02 ) {
	const t = P.sub( 'trigger', x, y, 0 );
	t.extS( 'blk', [ [ x - 0.003, y ], [ x + 0.004, y ], [ x + 0.001, y - len * 0.6, 0.006 ], [ x - 0.004, y - len, 0.002 ], [ x - 0.006, y - len * 0.95 ], [ x - 0.002, y - len * 0.55, 0.006 ] ], 0.003, 0.0008 );
	return t;
}

// a polygon circle (for holes: sight apertures, slots)
export const circle = ( cx, cy, r, n = 10 ) => Array.from( { length: n }, ( _, i ) => [ cx + Math.cos( - i / n * PI * 2 ) * r, cy + Math.sin( - i / n * PI * 2 ) * r ] );
// a stadium (rounded slot) outline from ( x0, y ) to ( x1, y ), half height h
export const slot = ( x0, x1, y, h, n = 4 ) => {
	const o = [];
	for ( let i = 0; i <= n; i ++ ) { const a = - PI / 2 + i / n * PI; o.push( [ x1 + Math.cos( a ) * h, y + Math.sin( a ) * h ] ); }
	for ( let i = 0; i <= n; i ++ ) { const a = PI / 2 + i / n * PI; o.push( [ x0 + Math.cos( a ) * h, y + Math.sin( a ) * h ] ); }
	return o;
};

// ---- shared sub-assemblies ---------------------------------------------------------------------------------------------

// pins through a receiver (both sides), [ [ x, y ], ... ] at half width hz
export function pins( P, list, hz, r = 0.0018, mat = 'steelD' ) {
	for ( const [ x, y, rr ] of list ) P.cylZ( mat, x, y, - hz - 0.0006, hz + 0.0006, rr ?? r, 10 );
}

// a screw head on a face: a dome with its slot, the face's normal along axis ( 'x' | 'y' | 'z', sign s )
export function screw( P, x, y, z, axis = 'z', s = 1, r = 0.0022, mat = 'blk', hex = false ) {
	const h = r * 0.55;
	if ( axis === 'z' ) {
		P.cylZ( mat, x, y, z, z + s * h, r, hex ? 6 : 10, r * 0.86 );
		if ( hex ) P.cylZ( 'rubber', x, y, z + s * h * 0.6, z + s * h * 1.05, r * 0.45, 6 );
		else P.boxC( 'rubber', x, y, z + s * h * 0.8, r * 1.7, r * 0.32, h * 0.6, 0, [ 0, 0, 0.6 ] );
	} else if ( axis === 'y' ) {
		P.cylY( mat, x, y, y + s * h, r, z, hex ? 6 : 10, r * 0.86 );
		if ( hex ) P.cylY( 'rubber', x, y + s * h * 0.6, y + s * h * 1.05, r * 0.45, z, 6 );
		else P.boxC( 'rubber', x, y + s * h * 0.8, z, r * 1.7, h * 0.6, r * 0.32, 0, [ 0, 0.6, 0 ] );
	} else {
		P.cyl( mat, x, x + s * h, r, y, z, hex ? 6 : 10, r * 0.86 );
		P.boxC( 'rubber', x + s * h * 0.8, y, z, h * 0.6, r * 1.7, r * 0.32, 0, [ 0.6, 0, 0 ] );
	}
}

// a sling swivel: its stud and the loop hanging from it, on the underside at ( x, y ) (or on a side: side = ±1, ring in xy)
export function swivel( P, x, y, z = 0, r = 0.0078, side = 0 ) {
	if ( side ) {
		P.cylZ( 'steelD', x, y, z, z + side * 0.004, 0.0032, 8 );
		P.put( 'steelD', new THREE.TorusGeometry( r, 0.00115, 5, 14 ), [ x, y - r * 0.7, z + side * 0.005 ] );
		return;
	}
	P.cylY( 'steelD', x, y - 0.004, y, 0.0032, z, 8 );
	P.put( 'steelD', new THREE.TorusGeometry( r, 0.00115, 5, 14 ), [ x, y - 0.004 - r * 0.8, z ] );
}

// folding back-up iron sights clamped on a top rail (rails top at y): the rear aperture at rx, the front post at fx, the
// sight line at sh. Separate parts 'buisR' / 'buisF' (folded away under an optic).
export function buis( P, rx, fx, y, sh, mat = 'blk' ) {
	const r = P.sub( 'buisR', rx, y, 0 );
	r.box( mat, rx - 0.014, rx + 0.012, y, y + 0.0065, - 0.0112, 0.0112, 0.0012 );
	r.box( mat, rx - 0.014, rx + 0.012, y - 0.0045, y + 0.001, 0.0098, 0.0118, 0.0006 );
	r.box( mat, rx - 0.014, rx + 0.012, y - 0.0045, y + 0.001, - 0.0118, - 0.0098, 0.0006 );
	// (the drums in the sight's own finish: a folding sight is one draw)
	r.cylZ( mat, rx - 0.002, y + 0.003, 0.0112, 0.0142, 0.0034, 10 );
	r.cylZ( mat, rx - 0.002, y + 0.003, 0.0141, 0.0145, 0.0011, 6 );
	// protective ears and the aperture leaf between them (the windage drum on the right)
	for ( const s of [ - 1, 1 ] ) r.ext( mat, [ [ rx - 0.0075, y + 0.006 ], [ rx + 0.0075, y + 0.006 ], [ rx + 0.0035, sh + 0.0072, 0.003 ], [ rx - 0.0045, sh + 0.0072, 0.003 ] ], s * 0.0062, s * 0.0102, 0.0007 );
	r.extFront( mat, [ [ - 0.006, y + 0.005 ], [ 0.006, y + 0.005 ], [ 0.0055, sh + 0.0042, 0.003 ], [ - 0.0055, sh + 0.0042, 0.003 ] ], rx - 0.0015, rx + 0.0015, 0.0004, 3, [ circle( 0, sh, 0.0019, 12 ) ] );
	r.cylZ( mat, rx + 0.0005, y + 0.0125, 0.0102, 0.0132, 0.0042, 12 );
	const f = P.sub( 'buisF', fx, y, 0 );
	f.box( mat, fx - 0.012, fx + 0.012, y, y + 0.0065, - 0.0112, 0.0112, 0.0012 );
	f.box( mat, fx - 0.012, fx + 0.012, y - 0.0045, y + 0.001, 0.0098, 0.0118, 0.0006 );
	f.box( mat, fx - 0.012, fx + 0.012, y - 0.0045, y + 0.001, - 0.0118, - 0.0098, 0.0006 );
	f.cylZ( mat, fx, y + 0.003, 0.0112, 0.0142, 0.0034, 10 );
	for ( const s of [ - 1, 1 ] ) f.ext( mat, [ [ fx - 0.007, y + 0.006 ], [ fx + 0.007, y + 0.006 ], [ fx + 0.0035, sh + 0.0045, 0.0025 ], [ fx - 0.0035, sh + 0.0045, 0.0025 ] ], s * 0.0048, s * 0.0084, 0.0007 );
	f.box( mat, fx - 0.0035, fx + 0.0035, y + 0.005, y + 0.0105, - 0.0048, 0.0048, 0.001 );
	f.cylY( mat, fx, y + 0.0095, sh - 0.007, 0.0026, 0, 10 );
	f.box( mat, fx - 0.0011, fx + 0.0011, sh - 0.008, sh, - 0.0011, 0.0011, 0.0003 );
	return { r, f };
}

// muzzle devices, starting at x (the barrel's end) along +x, round the bore (y = 0): returns the muzzle's x
export function muzzleDevice( P, kind, x, r = 0.0108, len = 0.052, mat = 'blk' ) {
	if ( kind === 'birdcage' ) {
		// A2: slots round the top and the sides, the bottom closed (it doesn't kick dust up)
		P.lathe( mat, [ [ x - 0.002, 0.0 ], [ x - 0.002, r * 0.88 ], [ x + 0.005, r * 1.02 ], [ x + len - 0.006, r * 1.04 ], [ x + len, r * 0.96 ], [ x + len, r * 0.42 ], [ x + len - 0.002, 0.0 ] ], 0, 0, 18 );
		for ( let i = 0; i < 5; i ++ ) { const a = ( i - 2 ) * 0.62; P.boxC( 'rubber', x + len * 0.58, Math.cos( a ) * r * 0.98, Math.sin( a ) * r * 0.98, len * 0.5, 0.0012, 0.0034, 0, [ - a, 0, 0 ] ); }
		P.cyl( 'rubber', x + len - 0.0006, x + len + 0.0004, r * 0.42, 0, 0, 12 );
	} else if ( kind === 'prong' ) {
		// three-prong: a collar, then three tines with open slots between them
		P.lathe( mat, [ [ x - 0.002, 0.0 ], [ x - 0.002, r * 0.9 ], [ x + 0.004, r ], [ x + len * 0.38, r ], [ x + len * 0.4, r * 0.82 ], [ x + len * 0.4, 0.0 ] ], 0, 0, 18 );
		for ( let i = 0; i < 3; i ++ ) {
			const a = i / 3 * PI * 2 + PI / 2;
			P.extFront( mat, [ [ - r * 0.36, r * 0.62 ], [ r * 0.36, r * 0.62 ], [ r * 0.4, r * 1.0 ], [ - r * 0.4, r * 1.0 ] ].map( ( [ u, v ] ) => [ u * Math.sin( a ) + v * Math.cos( a ), - u * Math.cos( a ) + v * Math.sin( a ) ] ), x + len * 0.38, x + len, 0.0006 );
		}
	} else if ( kind === 'ak74' ) {
		// AK-74 brake: a long cylinder with two big side ports, a cross slot on top and a flat cut on the left
		P.lathe( mat, [ [ x, 0.0 ], [ x, r * 0.95 ], [ x + 0.01, r * 1.08 ], [ x + len - 0.004, r * 1.08 ], [ x + len, r * 0.92 ], [ x + len, r * 0.5 ], [ x + len - 0.003, 0.0 ] ], 0, 0, 18 );
		for ( const s of [ - 1, 1 ] ) P.boxC( 'rubber', x + len * 0.56, 0, s * r * 1.02, 0.009, r * 1.05, 0.002, 0.0012 );
		P.boxC( 'rubber', x + len * 0.78, r * 1.03, 0, 0.007, 0.0018, r * 1.1, 0.0008 );
		P.boxC( 'rubber', x + len * 0.3, r * 0.4, r * 1.04, 0.0035, 0.0035, 0.0014, 0.0008 );
		P.cyl( 'rubber', x + len - 0.0006, x + len + 0.0004, r * 0.5, 0, 0, 12 );
	} else if ( kind === 'slant' ) {
		// AKM slant brake: a cup cut away at the front-left so the gas pushes the muzzle down and right
		P.lathe( mat, [ [ x, 0.0 ], [ x, r * 0.95 ], [ x + len, r * 0.95 ], [ x + len, r * 0.6 ], [ x + len - 0.002, 0.0 ] ], 0, 0, 16 );
		P.boxC( 'rubber', x + len * 0.72, r * 0.7, - r * 0.35, len * 0.5, r * 0.6, r * 0.9, 0.001, [ 0.5, 0, 0 ] );
	} else if ( kind === 'brake' ) {
		// a two-chamber brake: a block with two big side windows each side
		P.lathe( mat, [ [ x - 0.002, 0.0 ], [ x - 0.002, r * 0.92 ], [ x + 0.006, r * 1.1 ], [ x + len - 0.004, r * 1.1 ], [ x + len, r * 0.96 ], [ x + len, r * 0.45 ], [ x + len - 0.002, 0.0 ] ], 0, 0, 18 );
		for ( const t of [ 0.38, 0.72 ] ) for ( const s of [ - 1, 1 ] ) P.boxC( 'rubber', x + len * t, 0, s * r * 1.04, len * 0.2, r * 1.2, 0.002, 0.0015 );
		P.cyl( 'rubber', x + len - 0.0006, x + len + 0.0004, r * 0.45, 0, 0, 12 );
	} else {
		// a thread protector / plain crown
		P.lathe( mat, [ [ x - 0.002, 0.0 ], [ x - 0.002, r ], [ x + len - 0.002, r ], [ x + len, r * 0.85 ], [ x + len, r * 0.45 ], [ x + len - 0.001, 0.0 ] ], 0, 0, 16 );
		P.cyl( 'rubber', x + len - 0.0006, x + len + 0.0004, r * 0.45, 0, 0, 12 );
	}
	return x + len;
}

export function handle( P, mat, x0, x1, r0, r1 = r0, seg = 10 ) { P.cyl( mat, x0, x1, r0, 0, 0, seg, r1 ); }
// what the arms parts (game/items/ext/arms/parts.js) get to draw with
export const ARMS_H = { THREE, V3, shape, handle, PI };
