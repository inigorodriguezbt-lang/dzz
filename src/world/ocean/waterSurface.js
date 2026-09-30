// Ported from Tidewater src/ocean/WaterSurface.js (MIT, see LICENSE-Tidewater.txt)
// Combines every contribution to the water surface: the FFT cascades (deep water), the shoreline waves
// (when attached) and the foam, as GLSL for the ocean vertex / fragment shaders:
//   float waterSurfaceCascadeAttenuation( int c, float depth )
//   WaterSurfaceVertex waterSurfaceVertex( vec4 node, vec2 grid )   (CDLOD instance data + grid vertex)
//   WaterSurfaceFrag waterSurfaceFragment( lagXZ, footprint, depth, vertexFoam, shoreN, shoreFoam,
//                                          extraFoam, simState, surfMask, P )
// Consumes: uOceanDisp / uOceanDeriv (OceanFFT), cdlodMorph (CDLOD), waterGroundAt / waterNormalAt
// (Ocean.js), seaDetailSample (SeaDetail), shoreEvaluate (ShoreWaves), surfFoamShading (SurfFoam).
import { FFT_SIZE, CASCADE_SIZES } from './oceanSpectrum.js';

const f = ( x ) => Number( x ).toFixed( 6 );

// per-cascade amplitude attenuation in shallow water (long waves feel the bottom first)
export function cascadeAttenuationParams( sizes = CASCADE_SIZES ) {
	const d0 = [], floorAmt = [];
	for ( let c = 0; c < sizes.length; c ++ ) {
		// long cascades vanish in shallow water, short ones persist until very shallow
		d0.push( Math.min( 40, sizes[ c ] * 0.08 ) );
		floorAmt.push( [ 0.0, 0.05, 0.25, 0.5 ][ c ] ?? 0.5 );
	}
	return { d0, floorAmt };
}
const sstep = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };
// the same on the CPU, into out[ c ]
export function cascadeAttenuation( A, depth, out ) {
	for ( let c = 0; c < A.d0.length; c ++ ) {
		const a = sstep( 0, A.d0[ c ], depth );
		const lo = A.floorAmt[ c ] * sstep( 0, 0.6, depth );
		out[ c ] = lo + ( 1 - lo ) * a;
	}
	return out;
}

export const FOAM_WEIGHTS = [ 0.35, 0.45, 0.5, 0.25 ];

// opts: { sizes, fftSize, fragCascades (the fragment's cascade count: 'low' drops the finest), shore,
// detail, sim, surfFoam, nearRipples }
export function waterSurfaceGLSL( opts ) {
	const sizes = opts.sizes || CASCADE_SIZES;
	const C = sizes.length;
	const NF = opts.fftSize || FFT_SIZE;
	const SH = !! opts.shore, DT = !! opts.detail, SIM = !! opts.sim, SF = !! opts.surfFoam;
	const { d0, floorAmt } = cascadeAttenuationParams( sizes );
	const arr = ( a ) => `float[ ${ a.length } ]( ${ a.map( ( x ) => x.toFixed( 5 ) ).join( ', ' ) } )`;

	const common = /* glsl */`
	uniform highp sampler2DArray uOceanDisp; uniform highp sampler2DArray uOceanDeriv;
	uniform float uOceanFoamBias; uniform float uWaterAmp; uniform float uFoamCoverage; uniform float uFoamScale;
	float waterSurfaceCascadeAttenuation( int c, float depth ) {
		float d0[ ${ C } ] = ${ arr( d0 ) };
		float floorAmt[ ${ C } ] = ${ arr( floorAmt ) };
		float a = smoothstep( 0.0, d0[ c ], depth );
		return mix( floorAmt[ c ] * smoothstep( 0.0, 0.6, depth ), 1.0, a );
	}
	struct WaterSurfaceVertex { vec3 position; vec2 lagXZ; float height; float depth; float foam; vec3 shoreN; float shoreFoam; float swash; vec2 surfMask; };
	`;

	// ---------------------------------------------------------------- vertex
	let cascadesV = '';
	for ( let c = 0; c < C; c ++ ) {
		const L = sizes[ c ];
		const texel = L / NF;
		cascadesV += /* glsl */`
		{
			// band-limit to the mesh spacing to avoid aliasing / swimming
			float level = max( log2( spacing / ${ f( texel ) } ) + 0.7, 0.0 );
			float att = waterSurfaceCascadeAttenuation( ${ c }, depth );
			vec2 uv = worldXZ / ${ f( L ) };
			vec4 s = textureLod( uOceanDisp, vec3( uv, ${ c }.0 ), level );
			disp += s.xyz * att;
			// foam coverage is smooth enough to evaluate per vertex (sampled at a fixed detail level, the
			// displacement sample itself from there on)
			float fv = s.w;
			if ( level < 1.5 ) fv = textureLod( uOceanDisp, vec3( uv, ${ c }.0 ), 1.5 ).w;
			foam += fv * ${ f( FOAM_WEIGHTS[ c ] ?? 0.25 ) } * att;
		}`;
	}
	const vertex = common + /* glsl */`
	const float WATER_SHORE_DEEP = 26.0; // m: ShoreWaves' envelope smoothstep( 26, 13, depth ) is 0 beyond
	float waterSurfaceSeaDepth( vec2 xz ) { return uWaterLevel - waterGroundAt( xz ); }
	WaterSurfaceVertex waterSurfaceVertex( vec4 node, vec2 grid ) {
		CdlodVertex lod = cdlodMorph( node, grid, cameraPosition, 0.0 );
		vec2 worldXZ = lod.worldXZ;
		float spacing = lod.spacing;
		float ground = waterGroundAt( worldXZ );
		float depth = uWaterLevel - ground;
		vec3 disp = vec3( 0.0 );
		float foam = 0.0;
		${ cascadesV }
		disp *= uWaterAmp;
		vec3 extra = vec3( 0.0 );
		vec3 shoreN = vec3( 0.0, 1.0, 0.0 );
		float shoreFoam = 0.0;
		float swash = 0.0;
		vec2 surfMask = vec2( 0.0 ); // clear plunging face, whitewater roller relief (m)
	${ SH ? /* glsl */`
		// Offshore of WATER_SHORE_DEEP the shore waves have faded out completely (their envelope is 0 from 26 m
		// of depth, see ShoreWaves) and there is no swash: most of the sea skips their evaluation.
		bool nearShore = depth < WATER_SHORE_DEEP;
		float swashLevel = -1e4;
		if ( nearShore ) {
			ShoreSample sw = shoreEvaluate( worldXZ, depth, ground );
			extra += sw.disp;
			shoreN = clamp( sw.nShore, vec3( -1.0 ), vec3( 1.0 ) );
			// (the foam line on the swash front is added per pixel in the water shader: on this coarse mesh
			// it would end short of the front and follow the triangles)
			shoreFoam = sw.foam;
			surfMask = vec2( sw.face, sw.roller );
			swashLevel = sw.swashLevel;
		}` : '' }
		vec3 total = disp + extra;
		float y = uWaterLevel + total.y;
	${ SH ? /* glsl */`
		if ( nearShore ) {
			// thin run-up sheet on the sand: take whichever surface is higher (smooth max)
			float k = 0.04;
			// no run-up sheet on steep rock (cliffs, sea stacks): waves break against it instead
			vec2 nr = waterGroundSlope( worldXZ );
			float gentle = smoothstep( 0.45, 0.25, length( nr ) );
			float hmx = clamp( ( swashLevel - y ) / k * 0.5 + 0.5, 0.0, 1.0 ) * gentle;
			float smax = mix( y, swashLevel, hmx ) + hmx * ( 1.0 - hmx ) * k;
			swash = smoothstep( -0.02, 0.03, swashLevel - y );
			y = smax;
			// Where the sheet is the surface it is the sheet that is seen, not the wave below it: the sheet
			// lies on the sand (the sand's slope, no horizontal wave motion, no plunging face / roller).
			shoreN = normalize( mix( shoreN, vec3( nr.x, 1.0, nr.y ), hmx ) );
			float still = 1.0 - hmx;
			total = vec3( total.x * still, total.y, total.z * still );
			surfMask *= still;
		}` : '' }
		// hide the water sheet below dry land (beyond the swash zone)
		float below = depth < -3.0 ? min( ground - 2.0, uWaterLevel - 1.0 ) : ground - 0.06;
		y = y < ground ? min( y, below ) : y;
		WaterSurfaceVertex o;
		o.position = vec3( worldXZ.x + total.x, y, worldXZ.y + total.z );
		o.lagXZ = worldXZ;
		o.height = total.y;
		o.depth = depth;
		o.foam = foam;
		o.shoreN = shoreN;
		o.shoreFoam = shoreFoam;
		o.swash = swash;
		o.surfMask = surfMask;
		return o;
	}
	`;

	// ---------------------------------------------------------------- fragment
	const CF = Math.min( C, opts.fragCascades ?? C );
	let cascadesF = '';
	for ( let c = 0; c < CF; c ++ ) {
		let att = `waterSurfaceCascadeAttenuation( ${ c }, depth )`;
		if ( DT && c >= C - 2 ) att += ' * rough';
		else if ( DT && c === C - 3 ) att += ' * mix( 1.0, rough, 0.4 )';
		// (4x anisotropy: 8x only sharpened the far grazing sea imperceptibly)
		cascadesF += `\t\td += texture( uOceanDeriv, vec3( lagXZ / ${ f( sizes[ c ] ) }, ${ c }.0 ) ) * ( ${ att } );\n`;
	}
	const cN = C - 1;
	const Lf = sizes[ cN ];
	const k1 = 7.3, k2 = 3.1;
	const texel1 = Lf / k1 / NF, texel2 = Lf / k2 / NF;
	const rot = ( v, a ) => `vec2( ${ v }.x * ${ f( Math.cos( a ) ) } - ${ v }.y * ${ f( Math.sin( a ) ) }, ${ v }.x * ${ f( Math.sin( a ) ) } + ${ v }.y * ${ f( Math.cos( a ) ) } )`;

	const fragment = common + /* glsl */`
	uniform sampler2D uFoamTex;
	struct WaterSurfaceFrag { vec3 normal; float foam; float coverage; vec2 slopes; float jacobian; float rough; float aeration; float gust; float slick;
		${ SF ? 'SurfFoamInfo foamInfo;' : '' } };
	// extraFoam: foam carried by the water (ShoreSim); simState: its sample here; surfMask (clear face of a
	// plunging wave, whitewater roller relief, from the vertex stage)
	WaterSurfaceFrag waterSurfaceFragment( vec2 lagXZ, float footprint, float depth, float vertexFoam, vec3 shoreN, float shoreFoam, float extraFoam, vec4 simState, vec2 surfMask, vec3 P ) {
		vec4 d = vec4( 0.0 );
		float foamSum = 0.0;
		// the clear concave face of a plunging wave overhangs the trough: the foam carried by the
		// (depth-averaged, world-space) shore simulation below it is not on the face
		float face = ${ SH ? 'clamp( surfMask.x, 0.0, 1.0 )' : '0.0' };
		// (some of it stays: the lace of the previous wave is drawn up the face)
		float simFoam = ${ SIM ? 'extraFoam * ( 1.0 - face * 0.72 )' : '0.0' };
		foamSum += simFoam;
		// bubbles mixed into the water (milky, turquoise, hides the bottom): surf and wake
		float aeration = 0.0;
		// world-space gusts / slicks modulate the short wind waves (non-repeating dark and bright patches)
		${ DT ? 'SeaDetailSample det = seaDetailSample( lagXZ );\n\t\tfloat rough = det.rough;' : 'float rough = 1.0;' }
${ cascadesF }
		d *= uWaterAmp;
		vec2 slopes = vec2( d.x / max( d.z + 1.0, 0.2 ), d.y / max( d.w + 1.0, 0.2 ) );
	${ opts.nearRipples !== false ? /* glsl */`
		// Near-field capillary ripples. Within a few metres of the camera a pixel covers less than the finest
		// cascade's texel (~3 cm), so the surface looks glassy. Re-sample that cascade at ~1 m and ~2.3 m
		// tiles (rotated, so they never line up with it) wherever the footprint is small. Damped in slicks
		// with the short wind waves. Explicit LOD: this runs in a branch.
		float nearK = smoothstep( 0.04, 0.01, footprint ) * rough;
		if ( nearK > 0.002 ) {
			vec4 c1 = textureLod( uOceanDeriv, vec3( ${ rot( 'lagXZ', 0.63 ) } * ${ f( k1 / Lf ) }, ${ cN }.0 ), max( log2( footprint / ${ f( texel1 ) } ), 0.0 ) );
			vec4 c2 = textureLod( uOceanDeriv, vec3( ${ rot( 'lagXZ', 2.14 ) } * ${ f( k2 / Lf ) }, ${ cN }.0 ), max( log2( footprint / ${ f( texel2 ) } ), 0.0 ) );
			// gradients back into world axes (transpose of the rotation)
			vec2 g1 = c1.xy; vec2 g2 = c2.xy;
			vec2 g = ${ rot( 'g1', - 0.63 ) } * 0.55 + ${ rot( 'g2', - 2.14 ) } * 0.35;
			slopes += g * nearK;
		}` : '' }
		float jac = ( d.z + 1.0 ) * ( d.w + 1.0 );
		// base normal: large shoreline waves (per-vertex, can overhang) perturbed by FFT detail
		vec3 normal;
		vec3 baseNormal = vec3( 0.0, 1.0, 0.0 );
	${ SH ? /* glsl */`
		{
			// On a coarse mesh the shore normal can flip between the vertices of a folding crest: the
			// interpolated vector then cancels out (or is NaN). Keep it finite and facing up.
			vec3 sn = clamp( shoreN, vec3( -1.0 ), vec3( 1.0 ) ) + vec3( 0.0, 1e-3, 0.0 );
			vec3 Ns0 = sn / max( length( sn ), 1e-4 );
			vec3 Ns = normalize( vec3( Ns0.x, max( Ns0.y, 0.12 ), Ns0.z ) );
			baseNormal = Ns;
			// the ripples and chop ride on the wave: the detail normal is rotated onto the tilted face
			// (reoriented normal mapping) instead of being flattened by it
			vec3 nd = normalize( vec3( - slopes.x, 1.0, - slopes.y ) );
			vec3 tq = Ns + vec3( 0.0, 1.0, 0.0 );
			vec3 uq = vec3( slopes.x, 1.0, slopes.y ) * nd.y;
			normal = normalize( tq * ( dot( tq, uq ) / tq.y ) - uq );
			foamSum += shoreFoam * ${ SIM ? '0.55' : '1.0' };
			// the roller and the water behind the plunge point are full of bubbles, decaying behind the bore
			// with the foam it sheds; the clear face of a plunging wave is not
			aeration += clamp( shoreFoam * 1.2 + simFoam * 0.7, 0.0, 1.0 ) * ( 1.0 - face ) * smoothstep( -0.1, 0.3, depth );
		}` : /* glsl */`
		normal = normalize( vec3( - slopes.x, 1.0, - slopes.y ) );` }
		// whitecaps: persistent (per vertex) + fresh where the surface is compressed right now; more of them
		// inside gusts, plus windrow lines in fresh wind
		float fresh = clamp( ( uOceanFoamBias - 0.15 - jac ) * 2.0, 0.0, 1.0 );
		float whitecaps = vertexFoam + fresh;
	${ DT ? '	whitecaps = whitecaps * mix( 0.5, 1.5, det.gust ) + det.streak * 0.5;' : '' }
		float coverage = clamp( ( foamSum + whitecaps ) * uFoamCoverage, 0.0, 1.0 );
		// foam pattern: an irregular bubbly mat thresholded by coverage, so foam grows, tears into lace and
		// dissolves naturally
		vec2 fuv = lagXZ * uFoamScale;
		vec4 p1 = texture( uFoamTex, fuv );
		// second layer at another scale, rotated, to break repetition
		vec2 r2 = vec2( fuv.x * 0.8 - fuv.y * 0.6, fuv.x * 0.6 + fuv.y * 0.8 );
		vec4 p2 = texture( uFoamTex, r2 * 2.37 + vec2( 0.31, 0.77 ) );
		float pattern = p1.x * 0.62 + p2.x * 0.38;
		float thresh = 1.05 - coverage * 1.1;
		float soft = 0.06 + footprint * 0.1;
		float detail = smoothstep( thresh - soft, thresh + soft, pattern ) * ( p1.y * 0.25 + 0.8 );
		// at distance the pattern averages out -> use coverage directly
		float far = smoothstep( 0.15, 1.2, footprint );
		float foam = mix( detail, coverage * 0.85, far );
		WaterSurfaceFrag o;
	${ SF ? /* glsl */`
		// foam look (surf zone whitewater / lace, see SurfFoam)
		SurfFoamArgs fa;
		fa.coverage = coverage; fa.foam = foam; fa.footprint = footprint; fa.depth = depth; fa.bubbles = p1.y;
		fa.lagXZ = lagXZ; fa.normal = normal; fa.baseNormal = baseNormal;
		fa.fresh = ${ SH ? 'shoreFoam' : '0.0' }; fa.sim = simFoam; fa.simState = simState; fa.roller = ${ SH ? 'surfMask.y' : '0.0' }; fa.P = P;
		o.foamInfo = surfFoamShading( fa );
		foam = o.foamInfo.foam;` : '' }
		o.normal = normal;
		o.foam = foam;
		o.coverage = coverage;
		o.slopes = slopes;
		o.jacobian = jac;
		o.rough = rough;
		o.aeration = clamp( aeration, 0.0, 1.0 );
		o.gust = ${ DT ? 'det.gust' : '0.5' };
		o.slick = ${ DT ? 'det.slick' : '0.0' };
		return o;
	}
	`;
	return { vertex, fragment };
}
