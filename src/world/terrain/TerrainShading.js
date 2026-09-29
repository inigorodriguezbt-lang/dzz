// Ported from Tidewater src/world/terrain/TerrainShading.js (MIT, see LICENSE-Tidewater.txt).
//
// Shared GLSL building blocks for the terrain (and anything that wants to match it: rocks, grass).
// JS helpers (build GLSL source):
//   srgb( r, g, b )  -> 'vec3( ... )' linear constant of an sRGB triplet
//   rot2( v, a )     -> GLSL expression rotating the vec2 expression v by a constant angle
// GLSL (TERRAIN_SHADING_GLSL; needs `uniform sampler2D terrainDetailTex` declared by the user):
//   vec3 terrainPerturbNormal( vec3 P, vec3 N, float hd, float scale )   surface-gradient bump
//   vec3 terrainTriWeights( vec3 N )
//   vec4 terrainTriplanar( vec3 p, vec3 w, float tile, vec2 ofs, RockGrad g )
//   RockSurface terrainRockSurface( p, N, h, mcr, seed, mossAmount, RockGrad g )
//   vec3 terrainSaturation( vec3 c, float s )
//   MeadowTone terrainMeadowTone( mA, mB, slope, south, detail, hasDetail )
//   const vec3 PAL_<name> (rock palette), MEADOW_<name> (meadow palette)
// RockGrad { dpx, dpy: position derivatives, fwY: fwidth of the bedding coordinate, useGrad: use these
// gradients everywhere (branch safe), o27 / o6 / o1 / o3: xz uv offsets of the 27 / 6.1 / 1.3 / 3.1 m
// tiles (fract( worldXZ / tile ) of the origin p is relative to; zero when p is a world position) }.
//
// Deadtide's world is +-38 km, where float uv = xz / 0.63 m has no sub-texel precision left: callers pass
// a position relative to a snapped origin and the fractional uv of that origin (computed on the CPU in
// double precision), which gives exactly the same pattern as Tidewater's world-space uv.
import * as THREE from 'three';

function f( x ) {
	const s = Number( x ).toPrecision( 9 );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';
}

// sRGB triplet -> linear vec3 constant (GLSL source)
export const srgb = ( r, g, b ) => {
	const c = new THREE.Color().setRGB( r, g, b, THREE.SRGBColorSpace );
	return `vec3( ${ f( c.r ) }, ${ f( c.g ) }, ${ f( c.b ) } )`;
};

// linear values of an sRGB triplet (JS side)
export const srgbLinear = ( r, g, b ) => {
	const c = new THREE.Color().setRGB( r, g, b, THREE.SRGBColorSpace );
	return [ c.r, c.g, c.b ];
};

// 2D rotation of a vec2 GLSL expression by a constant angle (same column-major layout as WGSL mat2x2f)
export const rot2 = ( v, a ) => {
	const c = Math.cos( a ), s = Math.sin( a );
	return `( mat2( ${ f( c ) }, ${ f( s ) }, ${ f( - s ) }, ${ f( c ) } ) * ( ${ v } ) )`;
};

// the same rotation on the CPU (for uv offsets)
export const rot2js = ( x, y, a ) => {
	const c = Math.cos( a ), s = Math.sin( a );
	return [ c * x - s * y, s * x + c * y ];
};

// ---- palette (sRGB picked from photo references, stored linear)
export const PALETTE = {
	rockDark: srgb( 0.15, 0.145, 0.135 ),
	rockMid: srgb( 0.3, 0.285, 0.265 ),
	rockLight: srgb( 0.48, 0.455, 0.42 ),
	rockWarm: srgb( 0.44, 0.37, 0.30 ),
	lichenPale: srgb( 0.70, 0.70, 0.64 ),
	lichenOrange: srgb( 0.78, 0.50, 0.20 ),
	blackZone: srgb( 0.075, 0.075, 0.07 ),
	barnacle: srgb( 0.78, 0.76, 0.70 ),
	algae: srgb( 0.20, 0.27, 0.10 ),
	coralline: srgb( 0.62, 0.44, 0.46 ),
	moss: srgb( 0.19, 0.29, 0.08 ),
	mossDry: srgb( 0.3, 0.34, 0.14 ),
};

// ---- tropical meadow (tall guinea / elephant grass)
// The tone is shared by the terrain and the grass field (blade base colour): both evaluate it from the
// same inputs, so the geometric grass fades into the ground without a visible boundary.
export const MEADOW = {
	lush: srgb( 0.13, 0.2, 0.05 ),
	green: srgb( 0.25, 0.32, 0.1 ),
	olive: srgb( 0.36, 0.37, 0.14 ),
	yellow: srgb( 0.5, 0.46, 0.2 ),
	straw: srgb( 0.62, 0.54, 0.33 ),
	soil: srgb( 0.17, 0.13, 0.08 ),
};

const consts = ( prefix, o ) => Object.entries( o ).map( ( [ k, v ] ) => `const vec3 ${ prefix }${ k } = ${ v };` ).join( '\n' );

// palette constants, saturation and the meadow tone: everything the grass needs to match the ground
export const TERRAIN_MEADOW_GLSL = /* glsl */`
${ consts( 'PAL_', PALETTE ) }
${ consts( 'MEADOW_', MEADOW ) }

float terrainLuminance( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

// saturation helper
vec3 terrainSaturation( vec3 c, float s ) {
	return mix( vec3( terrainLuminance( c ) ), c, s );
}

struct MeadowTone {
	vec3 tone;
	float dry;
	float lush;
};

//   mA, mB: detail fbm channel at the 173 m / 47 m scales (~0.5 +- 0.1): the samples at
//   rot2( xz, 0.7 ) / 173 and rot2( xz, 2.1 ) / 47 that the terrain takes anyway; slope: 1 - N.y;
//   south: N.z (the sun side); detail: optional finer fbm (~0.5 +- 0.1) that breaks up the patches
//   (hasDetail = false: none)
// Returns { tone, dry, lush }: mostly fresh green grass with olive, sun-bleached yellow and a few
// straw-dry patches (more on exposed slopes), darker lush grass in the damp patches (the hollows are
// darkened further by the AO).
MeadowTone terrainMeadowTone( float mA, float mB, float slope, float south, float detail, bool hasDetail ) {
	float m = mA * 0.55 + mB * 0.45 + slope * 0.25 + south * 0.04;
	float dd = hasDetail ? detail - 0.5 : 0.0;
	m += dd * 0.28;
	float olive = smoothstep( 0.52, 0.6, m );
	float yellow = smoothstep( 0.6, 0.67, m );
	float straw = smoothstep( 0.66, 0.73, m + ( mB - 0.5 ) * 0.2 );
	float lush = smoothstep( 0.46, 0.37, mB * 0.7 + mA * 0.3 + slope * 0.2 + dd * 0.2 );
	vec3 c = mix( MEADOW_green, MEADOW_olive, olive );
	c = mix( c, MEADOW_yellow, yellow * 0.8 );
	c = mix( c, MEADOW_straw, straw * 0.55 );
	c = mix( c, MEADOW_lush, lush * 0.75 );
	MeadowTone o;
	o.tone = c;
	o.dry = olive * 0.4 + yellow * 0.6;
	o.lush = lush;
	return o;
}
`;

export const TERRAIN_SHADING_GLSL = TERRAIN_MEADOW_GLSL + /* glsl */`
struct RockGrad {
	vec3 dpx;
	vec3 dpy;
	float fwY;
	bool useGrad;
	vec2 o27; vec2 o6; vec2 o1; vec2 o3;
};

// implicit-derivative RockGrad for a world position (call in uniform control flow)
RockGrad terrainImplicitGrad( vec3 p ) {
	RockGrad g;
	g.dpx = dFdx( p ); g.dpy = dFdy( p ); g.fwY = 0.0; g.useGrad = false;
	g.o27 = vec2( 0.0 ); g.o6 = vec2( 0.0 ); g.o1 = vec2( 0.0 ); g.o3 = vec2( 0.0 );
	return g;
}

// Mikkelsen surface-gradient bump: perturb world normal N by the scalar height field hd (screen-space
// derivatives, so any mix of projections / scales works). Robustness for terrain:
//  - the tilt is limited to ~55 degrees (at grazing angles |det| collapses and the unclamped gradient
//    would swing the normal into the tangent plane: 'chrome' patches on steep faces)
//  - the bump fades out where the screen-space frame is degenerate (the thin sliver triangles of CDLOD
//    geomorphing, which otherwise light up as bright lines along the grid) or where the rendered facet
//    disagrees with N (sub-texel crags)
vec3 terrainPerturbNormal( vec3 p, vec3 N, float hd, float scale ) {
	vec3 dpx = dFdx( p ); vec3 dpy = dFdy( p );
	float dhdx = dFdx( hd ) * scale; float dhdy = dFdy( hd ) * scale;
	vec3 r1 = cross( dpy, N );
	vec3 r2 = cross( N, dpx );
	float det = dot( dpx, r1 );
	float ad = abs( det );
	vec3 grad = ( r1 * dhdx + r2 * dhdy ) * sign( det );
	float area = length( cross( dpx, dpy ) );
	float fr = area / max( length( dpx ) * length( dpy ), 1e-20 ); // sin of the footprint angle
	float facet = ad / max( area, 1e-20 ); // cos between the facet and N
	float k = smoothstep( 0.12, 0.35, fr ) * smoothstep( 0.3, 0.6, facet );
	vec3 g = grad * min( 1.0, ad * 1.4 / max( length( grad ), 1e-20 ) ) * k;
	// (a degenerate frame underflows to a zero vector: keep N instead of normalizing it into NaN)
	vec3 r = N * max( ad, 1e-20 ) - g;
	float rl = dot( r, r );
	return rl > 1e-30 ? r * inversesqrt( rl ) : N;
}

// triplanar blend weights (sharp)
vec3 terrainTriWeights( vec3 N ) {
	vec3 a = abs( N );
	vec3 w = a * a * ( a * a );
	return w / ( w.x + w.y + w.z );
}

vec4 terrainDetailGrad( vec2 uv, vec2 gx, vec2 gy ) {
	return textureGrad( terrainDetailTex, uv, gx, gy );
}

// one channel-set of the detail texture, triplanar. The samples use explicit gradients (the derivatives
// of the position in g), so they may run in non-uniform control flow. ofs: fract( origin.xz / tile ).
vec4 terrainTriplanar( vec3 p, vec3 w, float tile, vec2 ofs, RockGrad g ) {
	float s = 1.0 / tile;
	vec4 x = terrainDetailGrad( p.zy * s + vec2( ofs.y, 0.0 ), g.dpx.zy * s, g.dpy.zy * s );
	vec4 y = terrainDetailGrad( p.xz * s + ofs + 0.37, g.dpx.xz * s, g.dpy.xz * s );
	vec4 z = terrainDetailGrad( p.xy * s + vec2( ofs.x, 0.0 ) + 0.71, g.dpx.xy * s, g.dpy.xy * s );
	return x * w.x + y * w.y + z * w.z;
}

struct RockSurface {
	vec3 albedo;
	float rough;
	float hd;     // bump height (m)
	float moss;   // 0..1
	float wet;
	float height;
};

// Weathered volcanic rock seen on the headlands, sea stacks and boulders.
//   p position (world, or relative to the origin whose uv offsets are in g), N world normal (geometric),
//   h height above sea level, mcr: 0..1 large scale variation, seed: per object variation (0..1)
// With g.useGrad every sample uses the gradients in g (branch safe).
RockSurface terrainRockSurface( vec3 p, vec3 N, float h, float mcr, float seed, float mossAmount, RockGrad g ) {
	vec3 w = terrainTriWeights( N );
	// big blocks (4 m cells), plates (0.9 m) and grain / chips
	vec4 big = terrainTriplanar( p, w, 27.0, g.o27, g );
	vec4 mid = terrainTriplanar( p, w, 6.1, g.o6, g );
	vec4 fine = terrainTriplanar( p, w, 1.3, g.o1, g );
	// pixel footprint (m): features smaller than a few pixels fade out instead of sparkling
	float px = g.useGrad ? max( length( g.dpx ), length( g.dpy ) ) : length( abs( g.dpx ) + abs( g.dpy ) );
	float fineK = 1.0 - smoothstep( 0.006, 0.02, px );
	float midK = 1.0 - smoothstep( 0.03, 0.1, px );
	float hr = big.x * 0.45 + mid.x * 0.35 + ( ( fine.x - 0.5 ) * fineK + 0.5 ) * 0.2;

	// layered lava flows / bedding on steep faces: irregular bands (1D lookup of the fbm channel along
	// the height, warped), faded out once a band gets thinner than a few pixels
	float steep = 1.0 - smoothstep( 0.55, 0.85, N.y );
	float bandY = p.y + mid.w * 2.5 + mcr * 6.0;
	float fwY = g.fwY;
	if ( ! g.useGrad ) { fwY = fwidth( bandY ); }
	vec2 bandUV = vec2( bandY / 14.0, seed * 0.37 + 0.13 );
	float strata;
	if ( g.useGrad ) {
		strata = terrainDetailGrad( bandUV, vec2( fwY / 14.0, 0.0 ), vec2( 0.0 ) ).w;
	} else {
		strata = texture( terrainDetailTex, bandUV ).w;
	}
	float strataAA = 1.0 - smoothstep( 0.15, 0.6, fwY );
	float tone = hr * 0.9 + ( mcr - 0.5 ) * 0.7 + ( strata - 0.5 ) * 0.8 * steep * strataAA + ( seed - 0.5 ) * 0.3;
	vec3 col = mix( PAL_rockDark, PAL_rockMid, smoothstep( 0.1, 0.5, tone ) );
	col = mix( col, PAL_rockLight, smoothstep( 0.5, 0.85, tone ) );
	// iron staining / warm weathering in patches
	col = mix( col, PAL_rockWarm, smoothstep( 0.62, 0.8, mid.w + mcr * 0.3 ) * 0.18 );
	// joints between the big blocks, fainter between plates
	col = col * ( smoothstep( 0.05, 0.25, big.x ) * 0.35 + 0.65 ) * ( smoothstep( 0.05, 0.25, mid.x ) * 0.15 + 0.85 );
	// rain streaks: dark stains running down steep faces, paler bands between (the fbm channel
	// stretched vertically on the two vertical projection planes)
	vec2 sUVa = vec2( p.z / 3.1 + g.o3.y, p.y / 41.0 );
	vec2 sUVb = vec2( p.x / 3.1 + g.o3.x + 0.5, p.y / 41.0 + 0.3 );
	vec4 sa = terrainDetailGrad( sUVa, vec2( g.dpx.z / 3.1, g.dpx.y / 41.0 ), vec2( g.dpy.z / 3.1, g.dpy.y / 41.0 ) );
	vec4 sb = terrainDetailGrad( sUVb, vec2( g.dpx.x / 3.1, g.dpx.y / 41.0 ), vec2( g.dpy.x / 3.1, g.dpy.y / 41.0 ) );
	vec2 sw4 = pow( abs( N.xz ), vec2( 4.0 ) );
	float stainS = ( sa.w * sw4.x + sb.w * sw4.y ) / ( sw4.x + sw4.y + 1e-5 );
	float stain = smoothstep( 0.52, 0.72, stainS ) * steep;
	col = col * ( 1.0 - stain * 0.4 ) * ( smoothstep( 0.35, 0.2, stainS ) * steep * 0.12 + 1.0 );

	// lichens on the dry upper faces
	float dry = smoothstep( 2.6, 4.0, h );
	float lichen = smoothstep( 0.6, 0.78, mid.y ) * smoothstep( 0.2, 0.7, N.y ) * dry * smoothstep( 0.45, 0.65, mcr );
	col = mix( col, PAL_lichenPale, lichen * 0.45 );
	col = mix( col, PAL_lichenOrange, smoothstep( 0.8, 0.88, mid.y ) * dry * smoothstep( 0.5, 0.8, N.y ) * 0.3 );

	// moss / grass on ledges and tops, ferns hanging along the bedding planes of steep faces
	float ledge = smoothstep( 0.55, 0.7, strata ) * steep * strataAA * smoothstep( 0.4, 0.6, mid.w + ( mcr - 0.5 ) * 0.4 );
	float moss = max( smoothstep( 0.62, 0.9, N.y + ( big.x - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.3 ), ledge * 0.8 )
		* smoothstep( 2.5, 5.0, h ) * mossAmount;
	col = mix( col, mix( PAL_moss, PAL_mossDry, mid.w ), moss * 0.9 );

	// shoreline zonation: black lichen band (splash zone), barnacles and algae in the intertidal
	float splash = smoothstep( 0.5, 1.0, h ) * smoothstep( 2.8, 1.8, h + mid.w * 1.2 ) * smoothstep( 0.35, 0.6, mcr + mid.w * 0.3 );
	col = mix( col, PAL_blackZone, splash * 0.55 );
	// sun-bleached, weathered upper faces
	col = mix( col, PAL_rockLight, smoothstep( 0.35, 0.95, N.y ) * smoothstep( 1.5, 3.0, h ) * 0.3 );
	float inter = smoothstep( -0.7, -0.2, h ) * smoothstep( 0.7, 0.2, h );
	float barn = smoothstep( 0.62, 0.72, fine.z ) * inter * fineK;
	col = mix( col, PAL_algae, inter * smoothstep( 0.4, 0.6, mid.y ) * 0.6 );
	col = mix( col, PAL_barnacle, barn * 0.8 );
	// below the water: algae films and pink coralline crusts
	float sub = smoothstep( -0.3, -1.2, h );
	col = mix( col, mix( PAL_algae, PAL_coralline, smoothstep( 0.45, 0.7, mid.w ) ), sub * 0.55 );

	// wet below the swash line (dark, glossy)
	float wet = smoothstep( 1.0, 0.25, h + mid.w * 0.3 );
	col = col * mix( 1.0, 0.55, wet );

	RockSurface r;
	r.albedo = col;
	r.rough = mix( mix( 0.88, 0.8, steep ), 0.45, wet ) + moss * 0.06;
	// relief (m): tilted blocks and plates with bevelled joints, then grain
	r.hd = big.x * 0.25 + mid.x * 0.07 * ( midK * 0.6 + 0.4 ) + fine.x * 0.012 * fineK * ( 1.0 - wet * 0.6 ) + barn * 0.005;
	r.moss = moss;
	r.wet = wet;
	r.height = hr;
	return r;
}
`;
