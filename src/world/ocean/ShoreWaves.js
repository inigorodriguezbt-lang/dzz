// Ported from Tidewater src/ocean/ShoreWaves.js (MIT, see LICENSE-Tidewater.txt)
// Depth-aware shoreline waves. Wave phase comes from the travel-time field (ShoreField.js: refraction around
// headlands, fronts aligning with depth contours). Each individual wave m has its own height (sets +
// along-shore variation). Height grows in shallow water (Green's law) until H > gamma * depth. The wave then
// plunges: the front face turns into a vertical, concave wall under the crest, the tube collapses where the
// lip lands and the wave continues as a turbulent bore, which finally runs up the beach as a thin swash sheet
// whose leading edge advances and retreats (vertical run-up R(t) compared against the sand height).
//
// GLSL (SHORE_GLSL, needs waterGroundAt / uWaterLevel / perlin2 / uOceanTime):
//   ShoreSample shoreEvaluate( xz, depth, groundH )          (with the normal: the water mesh)
//   ShoreSample shoreEvaluateNoNormal( xz, depth, groundH )  (no normal: queries)
//   ShoreSample shoreEvaluateWorld( xz, depth, groundH )     (a fixed world point: ShoreSim)
//   ShorePhase shorePhaseAt( xz ), float shoreWaveAmp( m, along ), vec4 shoreCrest( A, d ), vec4 shoreBore( A, d ),
//   vec3 shoreDirAt( xz ), ShoreMedium shoreSurfMedium( xz, depth ), float shoreCrestPath( lagXZ, depth, Tv ),
//   vec4 shoreSwashEdge( xz, thickness ), float shoreSwashClip( xz, thickness )
// Ours: the travel-time field is the tile's (uShoreField over uShoreRect, faded at its border and by
// uShoreEnabled while tiles swap); the per-wave random height uses an integer hash (the float sin hash is not
// reproducible between the GPU and the CPU twin); time is the ocean's (uOceanTime). The CPU twin
// (shoreDispJS) mirrors shoreEvaluateNoNormal for the physics height queries.
import * as THREE from 'three';
import { GRAVITY } from './ShoreField.js';

const TAU = Math.PI * 2;
const BEACH_SLOPE = 0.066; // run-up is converted to a horizontal excursion with this slope
const SWASH_UP = 0.4, SWASH_DOWN = 0.55; // fractions of the period: uprush, backwash
const SWASH_OVERSHOOT = 1.2; // the mesh sheet reaches this far (m) past the leading edge (> the mesh spacing, so the per-pixel front, not the triangles, always decides where the sheet ends)

const f = ( x ) => { const s = String( x ); return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0'; };

// Tidewater engine/render/wgsl/common.js perlin2: MaterialX gradient noise, bit for bit
export const PERLIN_GLSL = /* glsl */`
	#ifndef DT_PERLIN2
	#define DT_PERLIN2
	uint _mxRotl( uint x, uint k ) { return ( x << k ) | ( x >> ( 32u - k ) ); }
	uint _mxFinal( uint a0, uint b0, uint c0 ) {
		uint a = a0; uint b = b0; uint c = c0;
		c ^= b; c -= _mxRotl( b, 14u );
		a ^= c; a -= _mxRotl( c, 11u );
		b ^= a; b -= _mxRotl( a, 25u );
		c ^= b; c -= _mxRotl( b, 16u );
		a ^= c; a -= _mxRotl( c, 4u );
		b ^= a; b -= _mxRotl( a, 14u );
		c ^= b; c -= _mxRotl( b, 24u );
		return c;
	}
	uint mxHash2( int x, int y ) { uint s = 0xdeadbeefu + ( 2u << 2u ) + 13u; return _mxFinal( s + uint( x ), s + uint( y ), s ); }
	float _mxGrad2( uint hash, float x, float y ) {
		uint h = hash & 7u;
		float u = h < 4u ? x : y;
		float v = 2.0 * ( h < 4u ? y : x );
		return ( ( h & 1u ) != 0u ? - u : u ) + ( ( h & 2u ) != 0u ? - v : v );
	}
	float perlin2( vec2 p ) {
		vec2 fl = floor( p );
		int X = int( fl.x ); int Y = int( fl.y );
		float fx = p.x - fl.x; float fy = p.y - fl.y;
		vec2 u = vec2( fx, fy ) * vec2( fx, fy ) * vec2( fx, fy ) * ( vec2( fx, fy ) * ( vec2( fx, fy ) * 6.0 - 15.0 ) + 10.0 );
		float v0 = _mxGrad2( mxHash2( X, Y ), fx, fy );
		float v1 = _mxGrad2( mxHash2( X + 1, Y ), fx - 1.0, fy );
		float v2 = _mxGrad2( mxHash2( X, Y + 1 ), fx, fy - 1.0 );
		float v3 = _mxGrad2( mxHash2( X + 1, Y + 1 ), fx - 1.0, fy - 1.0 );
		float s1 = 1.0 - u.x;
		return ( ( 1.0 - u.y ) * ( v0 * s1 + v1 * u.x ) + u.y * ( v2 * s1 + v3 * u.x ) ) * 0.6616;
	}
	#endif
`;

function evaluateCode( name, mode ) {
	return /* glsl */`
	ShoreSample ${ name }( vec2 xz, float depth, float groundH ) {
		ShorePhase ph = shorePhaseAt( xz );
		vec4 sh = ph.sh;
		float exposure = ph.exposure;
		float along = ph.along;
		vec2 dir = ph.dir;
		float Tp = uShorePeriod;
		float d = depth;
		float c = sqrt( clamp( d, 0.3, 25.0 ) * SHORE_GRAVITY );
		float lam = c * Tp;
		float s = ph.s;
		float m = floor( s + 0.5 );
		float u = s - m;
		// wave height with smooth hand-over between consecutive waves at the trough
		float A0 = shoreWaveAmp( m, along );
		float An = shoreWaveAmp( m + sign( u ), along );
		float A = mix( A0, An, smoothstep( 0.32, 0.5, abs( u ) ) * 0.5 );
		// the breaking state of the whole wave comes from the depth under its crest
		float dB = shoreBreakDepth( xz, dir, u, lam, d );
		// offshore fade-in (FFT covers deep water) and fade on land (the swash sheet takes over there)
		float env = smoothstep( 26.0, 13.0, d ) * smoothstep( -0.25, 0.05, d ) * sSat( exposure * 1.4 ) * uShoreEnabled;
		// finite difference along the propagation direction for the normal
		float e = 0.15;
		float face = 0.0;
		float roller = 0.0;
	${ mode === 'world' ? `	vec4 r = shoreWorld( u, A, dB, lam, env );
		vec4 s0 = vec4( r.z, r.y, r.x, r.w );` : mode === 'normal' ? `	ShorePair pair = shoreShapePair( u, - e / lam, A, dB, lam );
		vec4 s0 = pair.s0;
		vec4 s1 = pair.s1;
		face = s1.z * env;
		roller = s1.w * env;` : `	vec4 s0 = shoreShape( u, A, dB, lam );` }
		vec3 disp = vec3( dir.x * s0.x, s0.y, dir.y * s0.x ) * env;
		vec3 nShore = vec3( 0.0, 1.0, 0.0 );
	${ mode === 'normal' ? /* glsl */`	{
			float dX = e + ( s1.x - s0.x ) * env;
			float dY = ( s1.y - s0.y ) * env;
			vec3 tAlong = vec3( dir.x * dX, dY, dir.y * dX );
			vec3 tAcross = vec3( - dir.y, 0.0, dir.x );
			// epsilon: never a zero vector; never facing down (the mesh doesn't overhang, the lip sheet does)
			vec3 n = normalize( cross( tAcross, tAlong ) + vec3( 0.0, 1e-4, 0.0 ) );
			// the whitewater roller is not a smooth tube: lumps of foam tumble along its front and over its top
			// (relief of a few decimetres, with its slope in the normal). Noise, not a sum of sines: regular
			// bumps along the crest read as a row of identical puffs.
			float sx = u * lam; // rest position along the wave direction (m, seaward)
			float t = uOceanTime;
			float mW = floor( ph.s + 0.5 );
			// (the lumps only exist on the roller: amp is 0 elsewhere)
			if ( roller != 0.0 ) {
				float lumpy = sSat( perlin2( vec2( along * 0.045, mW * 3.7 ) ) * 1.2 + 0.55 );
				float amp = roller * mix( 0.25, 0.7, lumpy );
				vec2 q1 = vec2( along * 0.28, sx * 0.7 - t * 0.8 );
				vec2 q2 = vec2( along * 0.8 + 11.3, sx * 1.6 - t * 1.5 );
				float eL = 0.25;
				float L0 = perlin2( q1 ) * 0.7 + perlin2( q2 ) * 0.3;
				float La = perlin2( q1 + vec2( eL * 0.28, 0.0 ) ) * 0.7 + perlin2( q2 + vec2( eL * 0.8, 0.0 ) ) * 0.3;
				float Ls = perlin2( q1 + vec2( 0.0, eL * 0.7 ) ) * 0.7 + perlin2( q2 + vec2( 0.0, eL * 1.6 ) ) * 0.3;
				// lumps stand up from the roller (rounded caps, flatter troughs between them)
				float lump = max( L0 * 1.5 + 0.2, -0.3 );
				disp.y += lump * amp;
				float dAlong = L0 * 1.5 + 0.2 > -0.3 ? ( La - L0 ) / eL * 1.5 : 0.0;
				float dSx = L0 * 1.5 + 0.2 > -0.3 ? ( Ls - L0 ) / eL * 1.5 : 0.0;
				float dShore = - dSx; // d/d(shoreward) = - d/dsx
				vec2 g = ( vec2( - dir.y, dir.x ) * dAlong + dir * dShore ) * amp * n.y;
				nShore = normalize( vec3( n.x - g.x, max( n.y, 0.04 ), n.z - g.y ) );
			} else {
				nShore = normalize( vec3( n.x, max( n.y, 0.04 ), n.z ) );
			}
		}` : '' }
		// ---- swash: run-up of the most recent wave on the sand
		ShoreRunup swr = shoreSwashRunup( sh, along, groundH );
		float front = swr.Rt - swr.inland; // signed distance to the leading edge (m), > 0 under the sheet
		bool covered = front > 0.0;
		// leading edge velocity along the slope (m/s), positive = uphill
		float dRdt = ( swr.isUp ? pow( 1.0 - swr.su, 0.5 ) * ( 1.5 / SHORE_SWASH_UP ) : pow( max( swr.sb, 1e-3 ), 0.6 ) * ( - 1.6 / SHORE_SWASH_DOWN ) ) * swr.RhMax / Tp;
		// thin sheet (a few cm, thickening behind the leading edge). The mesh sheet overshoots the leading edge
		// a little; the water shader cuts it exactly on the front (swashClip)
		float fm = front + SHORE_SWASH_OVERSHOOT;
		float thick = clamp( min( fm * 0.3, max( fm - 0.1, 0.0 ) * ( SHORE_BEACH_SLOPE * 0.22 ) + 0.03 ), -0.1, 0.12 );
		float swashLevel = groundH + thick;
		// bubbly foam line riding the leading edge all the way up (left behind as the swash mark)
		float uprush = smoothstep( 0.46, 0.32, swr.tau );
		float edge = smoothstep( 0.8, 0.0, front ) * smoothstep( -0.05, 0.05, front ) * uprush * smoothstep( 0.0, 1.0, swr.Rt );
		float swashFoam = edge * 0.9;
		// ---- depth-averaged water velocity (along dir), for foam advection: waves / bores: shallow-water
		// particle velocity c eta / h; swash sheet: the tip moves at dR/dt, slower toward the shoreline during
		// uprush, faster there while it drains
		float eta = disp.y;
		float uWave = clamp( c * eta / ( max( d, 0.0 ) + max( eta, d * -0.8 ) + 0.15 ), -2.5, 4.0 );
		float rel = sSat( swr.inland / max( swr.Rt, 0.5 ) );
		float uSwash = dRdt * ( swr.isUp ? clamp( ( swr.inland + 3.0 ) / ( swr.Rt + 3.0 ), 0.15, 1.0 ) : ( 1.0 - rel ) * 0.6 + 0.9 );
		float wSwash = smoothstep( 0.3, 0.05, d );
		float uFlow = mix( uWave, uSwash, wSwash ) * ( covered || d > 0.02 ? 1.0 : 0.0 );
		ShoreSample o;
		// the churn of a bore is uneven along the crest: dense in some stretches, torn into patches and lace
		// in others (different for every wave, drifting slowly along it)
		float wwPatch = 0.0;
		if ( s0.z * env != 0.0 ) wwPatch = smoothstep( -0.5, 0.45, perlin2( vec2( along * 0.06 + uOceanTime * 0.05, m * 2.9 + 0.4 ) ) );
		o.disp = disp; o.nShore = nShore; o.env = env; o.foam = s0.z * env * mix( 0.3, 1.0, wwPatch ); o.breaking = s0.w; o.u = u; o.dir = dir;
		o.exposure = exposure; o.swashLevel = swashLevel; o.swashCovered = covered ? 1.0 : 0.0; o.thick = thick;
		o.swashFoam = swashFoam; o.runup = swr.Rt; o.inland = swr.inland; o.dRdt = dRdt; o.tau = swr.tau;
		o.flow = dir * uFlow; o.flowSpeed = uFlow; o.face = face; o.roller = roller;
		return o;
	}
`;
}

export const SHORE_GLSL = /* glsl */`
	uniform highp sampler2D uShoreField; uniform vec4 uShoreRect; // x0, z0, size, res
	uniform float uShorePeriod; uniform float uShoreAmplitude; uniform float uShoreVariation; uniform float uShoreGamma;
	uniform float uShoreBreakSpan; uniform float uShoreCurl; uniform float uShoreRunup; uniform float uShoreEnabled; uniform float uShoreTurbidity;
	uniform float uOceanTime;
	const float SHORE_GRAVITY = ${ f( GRAVITY ) };
	const float SHORE_TAU = ${ f( TAU ) };
	const float SHORE_BEACH_SLOPE = ${ f( BEACH_SLOPE ) };
	const float SHORE_SWASH_UP = ${ f( SWASH_UP ) };
	const float SHORE_SWASH_DOWN = ${ f( SWASH_DOWN ) };
	const float SHORE_SWASH_OVERSHOOT = ${ f( SWASH_OVERSHOOT ) };
	#define SHORE_PI 3.141592653589793
	float sSat( float x ) { return clamp( x, 0.0, 1.0 ); }
	struct ShoreSample { vec3 disp; vec3 nShore; float env; float foam; float breaking; float u; vec2 dir; float exposure; float swashLevel; float swashCovered;
		float thick; float swashFoam; float runup; float inland; float dRdt; float tau; vec2 flow; float flowSpeed; float face; float roller; };
	struct ShoreMedium { vec3 scatter; vec3 absorb; };
	struct ShorePhase { vec4 sh; float T; vec2 dir; float exposure; float along; float s; };
	struct ShoreBreak { float db; float b; float Ash; float p; float meanP; float crestPeak; float yc; float yt;
		float H; float wBore; float Xi; float Hb; float ycB; float ytB; float Xc; float Wt; };
	struct ShoreProfile { float x; float y; float b; float foam; float face; float roller; };
	struct ShorePair { vec4 s0; vec4 s1; };
	struct ShoreRunup { float tau; float Rt; float inland; float RhMax; float su; float sb; bool isUp; };

	// the travel-time field of the tile: ( T, dirX * exposure, dirZ * exposure, shoreline T ), bilinear from 4
	// exact loads (float data); the exposure fades out over the tile's outer 8 % (no waves beyond it)
	vec4 shoreFieldSample( vec2 xz ) {
		float res = uShoreRect.w;
		vec2 fp = ( xz - uShoreRect.xy ) / uShoreRect.z * res - 0.5;
		vec2 fc = clamp( fp, vec2( 0.0 ), vec2( res - 1.001 ) );
		ivec2 i = ivec2( floor( fc ) );
		vec2 t = fract( fc );
		vec4 a = texelFetch( uShoreField, i, 0 );
		vec4 b = texelFetch( uShoreField, i + ivec2( 1, 0 ), 0 );
		vec4 c = texelFetch( uShoreField, i + ivec2( 0, 1 ), 0 );
		vec4 d = texelFetch( uShoreField, i + ivec2( 1, 1 ), 0 );
		vec4 s = mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
		vec2 ed = min( fp, res - 1.0 - fp );
		float inside = smoothstep( 0.0, res * 0.08, min( ed.x, ed.y ) );
		return vec4( s.x, s.yz * inside, s.w );
	}

	// (ours) per-wave random number: an integer hash of the wave index (PCG), reproducible on the CPU
	float shoreHash1( float x ) {
		uint v = uint( int( x ) + 1048576 );
		uint state = v * 747796405u + 2891336453u;
		uint word = ( ( state >> ( ( state >> 28u ) + 4u ) ) ^ state ) * 277803737u;
		word = ( word >> 22u ) ^ word;
		return float( word >> 8u ) * ( 1.0 / 16777216.0 );
	}

	// Bathymetry along the beach that the travel-time field doesn't resolve: a bar with rip channels cut
	// through it every ~100 m. Over the bar the waves are bigger and break first and farther out; in the
	// channels they are much smaller and roll through unbroken almost to the shorebreak.
	struct ShoreBar { float k; float rip; };
	ShoreBar shoreBar( float along ) {
		float w = sin( along * 0.021 + 1.9 ) * 1.4 + sin( along * 0.009 + 0.3 ) * 0.9;
		float r = sin( along * 0.059 + w );
		float width = 0.8 + sin( along * 0.017 + 4.1 ) * 0.08; // channels of different width
		float rip = smoothstep( width, 0.985, r );
		// the bar itself is uneven: broad peaks and lower shoulders
		float bar = 0.9 + ( sin( along * 0.031 + 7.3 ) * 0.6 + sin( along * 0.083 + 1.1 ) * 0.4 ) * 0.14;
		ShoreBar o; o.k = bar * ( 1.0 - rip * 0.58 ); o.rip = rip;
		return o;
	}
	// along-shore phase wobble (in periods): crests bend over the uneven bottom (and run ahead in the rips)
	float shoreWobble( float along ) {
		return sin( along * 0.029 + 0.7 ) * 0.07 + sin( along * 0.083 + 2.1 ) * 0.035
			+ sin( along * 0.19 + 0.4 ) * 0.022 + sin( along * 0.37 + 2.6 ) * 0.011
			+ shoreBar( along ).rip * 0.045;
	}
	// ---- per-wave height
	float shoreWaveAmp( float m, float along ) {
		// sets: groups of ~7 waves with larger ones in the middle, plus per-wave randomness
		float waveSet = abs( sin( m * ${ f( Math.PI / 7 ) } ) ) * 0.6 + 0.55;
		float rnd = ( shoreHash1( m ) - 0.5 ) * 2.0;
		// along-shore variation so waves peel instead of closing out: peaks ~40-50 m wide with lower shoulders
		// between them, different for every wave; each peak breaks first and peels outward from it
		float warp = sin( along * 0.016 + m * 0.9 ) * 1.6;
		float a1 = sin( along * 0.062 + m * 1.7 + warp );
		float a2 = sin( along * 0.13 + m * 4.1 + 1.3 - warp * 0.7 );
		// (plus a shorter ~20 m variation: bores that rise and sag along the crest, more peel sections)
		float a3 = sin( along * 0.29 + m * 2.3 + warp * 0.5 ) * 0.6 + sin( along * 0.47 + m * 5.9 + 0.8 ) * 0.4;
		float alongV = a1 * 0.6 + a2 * 0.4 + a3 * 0.28;
		return max( uShoreAmplitude * waveSet * ( 1.0 + rnd * uShoreVariation * 0.5 + alongV * uShoreVariation * 0.7 ) * shoreBar( along ).k, 0.02 );
	}
	// ---- cross-section shape
	ShoreBreak shoreBreakParams( float A, float d ) {
		ShoreBreak P;
		// break depth for this wave (Green's law shoaling, H = gamma d)
		P.db = pow( A * 3.556 / uShoreGamma, 0.8 );
		P.b = ( P.db - d ) / ( P.db * uShoreBreakSpan ); // <0 shoaling, 0..1 plunging, >1 bore
		float shoal = pow( 10.0 / clamp( d, 0.35, 10.0 ), 0.25 );
		P.Ash = A * shoal;
		P.p = mix( 1.0, 3.0, smoothstep( -2.5, 0.0, P.b ) );
		P.meanP = 1.0 / sqrt( ( P.p + 0.25 ) * SHORE_PI );
		P.crestPeak = 1.0 + smoothstep( -1.0, 0.3, P.b ) * 0.22;
		P.yc = P.Ash * 2.0 * ( 1.0 - P.meanP ) * P.crestPeak; // crest height
		P.yt = P.Ash * -2.0 * P.meanP * P.crestPeak; // trough level
		P.H = P.yc - P.yt;
		P.wBore = smoothstep( 0.85, 1.35, P.b );
		P.Xi = P.H * 0.8; // lip throw at impact
		// bore height, limited by the depth and fading out in the last few decimetres
		P.Hb = min( P.H * 0.6, max( d, 0.0 ) * 0.75 ) * ( smoothstep( 0.0, 0.3, d ) * 0.7 + 0.3 );
		P.ycB = mix( P.yc, P.yt * 0.6 + P.Hb, P.wBore ); // crest / roller top
		P.ytB = mix( P.yt, P.yt * 0.6, P.wBore ); // trough
		// the collapsing crest moves to where the lip landed (no shift once the bore has run out of height)
		P.Xc = mix( 0.0, P.Xi - P.Hb * 0.55, P.wBore ) * smoothstep( 0.03, 0.3, P.Hb );
		// horizontal extent of the face: concave tube face while plunging, short convex roller front on the bore
		P.Wt = mix( P.H * mix( 0.25, 0.55, smoothstep( 0.1, 0.9, P.b ) ), P.Hb * 0.6 + 0.08, P.wBore );
		return P;
	}
	// whitewater over the face after the plunge: s = 0 at the crest .. 1 at the foot of the face; the foot
	// turns white first (where the lip lands), the top of the face last
	float shoreFaceFill( float b, float s ) {
		float k = ( 1.0 - s ) * 0.45;
		return smoothstep( k + 0.9, k + 1.08, b );
	}
	// Whitewater made by the breaking wave at xi (m, relative to the crest's rest position, shoreward):
	// nothing while the lip is in the air; the lip lands in the trough at the plunge point (b ~ 0.9, xi = Xi)
	// and whitewater spreads out from it while the tube collapses behind it; the collapsed tube becomes the
	// roller: whitewater over the front and top of the bore, shedding foam behind it
	float shoreWhitewater( float xi, float lam, ShoreBreak P ) {
		float landed = smoothstep( 0.86, 0.99, P.b );
		float spread = sSat( ( P.b - 0.9 ) / 0.45 );
		float reach = P.Xi * 0.25 + spread * ( P.Xi * 0.9 + 1.0 ); // radius around the plunge point
		float impact = landed * smoothstep( reach, reach * 0.6, abs( xi - P.Xi ) ) * ( 1.0 - smoothstep( 1.4, 1.9, P.b ) );
		float toe = P.Xc + P.Wt;
		// the collapsing tube turns white from its foot (next to the plunge point) up to the crest
		float faceFill = shoreFaceFill( P.b, sSat( ( xi - P.Xc ) / max( P.Wt, 0.05 ) ) );
		float ahead = exp( ( xi - toe ) * -3.0 ) * P.wBore;
		float behind = exp( ( P.Xc - xi ) / lam * -16.0 ) * P.wBore;
		float roller = xi > toe ? ahead : ( xi < P.Xc ? behind : max( faceFill, P.wBore ) );
		return sSat( max( impact, roller ) );
	}
	// the cross-section for break parameters P. u: local phase in [-0.5, 0.5], crest at 0, u < 0 in front
	// (shoreward) of the crest. x: shoreward displacement, y: height above mean, b: breaking progress
	ShoreProfile shoreProfile( float u, float lam, ShoreBreak P, bool withFoam ) {
		// --- shoaling: peaked (cnoidal-like) crest, the front compressed by a phase skew
		float skew = smoothstep( -3.0, 0.0, P.b ) * 0.55;
		float phi = u - skew * ( 1.0 - cos( u * SHORE_TAU ) ) / SHORE_TAU;
		float c = max( ( cos( phi * SHORE_TAU ) + 1.0 ) * 0.5, 0.0 ); // pow() of a rounding-negative base is NaN
		float yPre = P.Ash * 2.0 * ( pow( c, P.p ) - P.meanP ) * P.crestPeak;
		float Q = smoothstep( -3.0, 0.0, P.b ) * 0.25 + 0.1;
		float xPre = sin( u * SHORE_TAU ) * P.Ash * Q;
		// --- plunging / bore profile. Front: the upper uf of the phase is an elliptic arc from the crest down
		// to the trough (concave tube face -> convex roller front), the rest of the front is trough, stretched
		// to meet the next wave. Back: the shoaling back, decaying exponentially behind the bore.
		float uf = 0.09;
		bool inFace = u > - uf;
		float th = clamp( - u / uf, 0.0, 1.0 ) * ${ f( Math.PI / 2 ) };
		float fx = mix( 1.0 - cos( th ), sin( th ), P.wBore );
		float fy = mix( 1.0 - sin( th ), cos( th ), P.wBore );
		float sTr = clamp( ( - u - uf ) / ( 0.5 - uf ), 0.0, 1.0 );
		float ul = u * lam;
		float xFront = ( inFace ? P.Xc + P.Wt * fx : mix( P.Xc + P.Wt, lam * 0.5, sTr ) ) + ul;
		float yFront = inFace ? P.ytB + ( P.ycB - P.ytB ) * fy : P.ytB;
		float cb = pow( max( ( cos( u * ( SHORE_TAU * 0.85 ) ) + 1.0 ) * 0.5, 0.0 ), P.p );
		float yBack = P.ytB + ( P.ycB - P.ytB ) * mix( cb, exp( u * -7.0 ), P.wBore );
		float xBack = P.Xc * exp( u * -6.0 ) * smoothstep( 0.5, 0.35, u ) + xPre * ( 1.0 - P.wBore );
		bool front = u < 0.0;
		float wC = smoothstep( -0.35, 0.25, P.b ) * uShoreCurl;
		ShoreProfile r;
		r.x = mix( xPre, front ? xFront : xBack, wC );
		r.y = mix( yPre, front ? yFront : yBack, wC );
		r.b = P.b;
		r.foam = 0.0; r.face = 0.0; r.roller = 0.0;
		if ( withFoam ) {
			// --- whitewater (where the parcel is now) and, per parcel, the clear face of the plunging wave and
			// the relief of the roller
			r.foam = shoreWhitewater( r.x - u * lam, lam, P );
			bool onFace = front && inFace;
			float faceFill = shoreFaceFill( P.b, fx );
			// the clear, concave face of a plunging wave (the surface keeps the foam carried by the water off it)
			r.face = ( onFace ? 1.0 : 0.0 ) * smoothstep( -0.4, 0.0, P.b ) * ( 1.0 - faceFill );
			// turbulent relief of the whitewater roller (m): its front and the top it tumbles over
			r.roller = ( front ? ( inFace ? 1.0 : 0.0 ) : exp( u * -25.0 ) ) * P.wBore * P.Hb * wC;
		}
		return r;
	}
	// ( x, y, foam, b )
	vec4 shoreShape( float u, float A, float d, float lam ) {
		ShoreProfile s = shoreProfile( u, lam, shoreBreakParams( A, d ), true );
		return vec4( s.x, s.y, s.foam, s.b );
	}
	// the cross-section at u and at u + du (for the surface normal): ( x0, y0, foam, b ), ( x1, y1, face, roller )
	ShorePair shoreShapePair( float u, float du, float A, float d, float lam ) {
		ShoreBreak P = shoreBreakParams( A, d );
		ShoreProfile s0 = shoreProfile( u, lam, P, true );
		ShoreProfile s1 = shoreProfile( u + du, lam, P, false );
		ShorePair o; o.s0 = vec4( s0.x, s0.y, s0.foam, s0.b ); o.s1 = vec4( s1.x, s1.y, s0.face, s0.roller );
		return o;
	}
	// the surface at a fixed WORLD point (for the Eulerian shore simulation): whitewater there and the water
	// height there (the parcel shown at this point rests ~x up-wave: first-order inverse of the horizontal
	// displacement). ( foam, height, displacement of the parcel resting here, b )
	vec4 shoreWorld( float u, float A, float d, float lam, float env ) {
		ShoreBreak P = shoreBreakParams( A, d );
		ShoreProfile s0 = shoreProfile( u, lam, P, false );
		ShoreProfile s1 = shoreProfile( u + s0.x * env / lam, lam, P, false );
		return vec4( shoreWhitewater( - u * lam, lam, P ), s1.y, s0.x, P.b );
	}
	// the bore that follows the plunge: ( roller height Hb, front extent Wt, crest shift Xc, bore weight )
	vec4 shoreBore( float A, float d ) { ShoreBreak P = shoreBreakParams( A, d ); return vec4( P.Hb, P.Wt, P.Xc, P.wBore ); }
	// breaking progress b, wave height H, trough level (relative to mean) and how far the lip is thrown
	vec4 shoreCrest( float A, float d ) { ShoreBreak P = shoreBreakParams( A, d ); return vec4( P.b, P.yc - P.yt, P.ytB, P.Xi ); }
	// Depth that sets the breaking state of the wave a parcel belongs to: the depth under that wave's crest,
	// not under the parcel. Near the troughs it hands over to the local depth, where the neighbouring wave
	// takes over (the profile stays continuous at u = +-0.5).
	float shoreBreakDepth( vec2 xz, vec2 dir, float u, float lam, float d ) {
		vec2 pc = xz + dir * ( u * lam );
		float dc = uWaterLevel - waterGroundAt( pc );
		return mix( dc, d, smoothstep( 0.3, 0.5, abs( u ) ) );
	}
	// ( dir.x, dir.z, exposure ) of the field (Tidewater reads a filtered copy over the simulated region)
	vec3 shoreDirAt( vec2 xz ) {
		vec4 s = shoreFieldSample( xz );
		float e = length( s.yz );
		return vec3( s.yz / max( e, 1e-4 ), min( 1.0, e * 1.4 ) );
	}
	// Optical properties of the water stirred up by breaking waves: suspended sand and fine bubbles scatter
	// light (milky, luminous), fine sediment and dissolved matter absorb blue: the surf zone is turquoise
	ShoreMedium shoreSurfMedium( vec2 xz, float depth ) {
		float k = 0.0;
		if ( depth < 4.5 && depth > -0.2 ) {
			float expo = shoreDirAt( xz ).z;
			k = smoothstep( 4.5, 1.2, depth ) * smoothstep( -0.2, 0.15, depth ) * expo * uShoreTurbidity * uShoreEnabled;
		}
		ShoreMedium o; o.scatter = vec3( 0.9, 1.0, 0.85 ) * k; o.absorb = vec3( 0.1, 0.2, 0.62 ) * k;
		return o;
	}
	// Local wave phase data at a (Lagrangian) point
	ShorePhase shorePhaseAt( vec2 xz ) {
		vec4 sh = shoreFieldSample( xz );
		float T = sh.x;
		vec2 dirE = vec2( sh.y, sh.z );
		float exposure = length( dirE );
		vec2 dir = dirE / max( exposure, 1e-4 );
		float along = dot( xz, vec2( - dir.y, dir.x ) );
		float s = ( uOceanTime - T ) / uShorePeriod + shoreWobble( along );
		ShorePhase o; o.sh = sh; o.T = T; o.dir = dir; o.exposure = exposure; o.along = along; o.s = s;
		return o;
	}
	// Water path (m) along the refracted view ray Tv from the surface point with rest position p until the ray
	// leaves through the other side of the wave, or 1e4 if it doesn't within a few metres: the upper part of a
	// steep wave is only a few metres thick, the view ray crosses it and exits into the sky behind (breaking
	// faces and crests glow turquoise). Marches the analytic cross-section (up to 3 steps).
	float shoreCrestPath( vec2 p, float d, vec3 T ) {
		float outL = 1e4;
		if ( d >= 6.0 || uShoreEnabled <= 0.0 ) return outL;
		ShorePhase ph = shorePhaseAt( p );
		float tXi = dot( T.xz, ph.dir ); // shoreward component of the ray
		float env = smoothstep( 26.0, 13.0, d ) * sSat( ph.exposure * 1.4 ) * uShoreEnabled;
		// rays heading out through the back of the wave (a view from the beach side), near breakers
		if ( env > 0.05 && tXi < -0.05 && d < 6.0 ) {
			float lam = sqrt( clamp( d, 0.3, 25.0 ) * SHORE_GRAVITY ) * uShorePeriod;
			float m = floor( ph.s + 0.5 );
			float u = ph.s - m;
			float A = shoreWaveAmp( m, ph.along );
			ShoreBreak P = shoreBreakParams( A, shoreBreakDepth( p, ph.dir, u, lam, d ) );
			ShoreProfile s0 = shoreProfile( u, lam, P, false );
			float y0 = s0.y * env;
			// only the upper part of steep (nearly breaking) waves is thin enough to see through
			if ( y0 > A * 0.2 && P.b > -1.5 ) {
				float xi0 = - u * lam + s0.x * env;
				float slope = T.y / - tXi; // ray rise per metre of horizontal travel
				float prevGap = 0.0;
				float prevDist = 0.0;
				float off = 1.1;
				for ( int k = 0; k < 3; k ++ ) {
					float uk = min( u + off / lam, 0.5 );
					ShoreProfile sk = shoreProfile( uk, lam, P, false );
					float dist = abs( xi0 - ( - uk * lam + sk.x * env ) );
					// ray height above the surface there (> 0: the ray has left the water)
					float gap = y0 + slope * dist - sk.y * env;
					if ( gap > 0.0 ) {
						float fr = - prevGap / max( gap - prevGap, 1e-4 );
						outL = mix( prevDist, dist, sSat( fr ) ) / - tXi;
						break;
					}
					prevGap = gap;
					prevDist = dist;
					off *= 2.6;
				}
			}
		}
		return outL;
	}
	// ---- swash: run-up of the most recent wave at a point on the beach (distances in metres up the beach
	// face), compared with the height of the sand (converted with the nominal beach slope), so the front is
	// exact at the waterline and follows the contours of the sand. sh: shoreFieldSample( xz ).
	ShoreRunup shoreSwashRunup( vec4 sh, float along, float groundH ) {
		float Tp = uShorePeriod;
		float exposure = length( vec2( sh.y, sh.z ) );
		float Ts = sh.w;
		float inland = max( groundH - uWaterLevel, 0.0 ) / SHORE_BEACH_SLOPE;
		float ss = ( uOceanTime - Ts ) / Tp + shoreWobble( along );
		float ms = floor( ss );
		float tau = ss - ms; // 0..1 time since that wave's bore reached the shoreline
		float Am = shoreWaveAmp( ms, along );
		// vertical run-up ~ H on this gentle beach, converted to a horizontal excursion
		float RhMax = Am * 2.1 * uShoreRunup * sSat( exposure * 1.4 ) / SHORE_BEACH_SLOPE;
		// decelerating uprush, then a backwash that starts slowly and accelerates as the sheet drains
		float su = sSat( tau / SHORE_SWASH_UP );
		float sb = sSat( ( tau - SHORE_SWASH_UP ) / SHORE_SWASH_DOWN );
		bool isUp = tau < SHORE_SWASH_UP;
		float Rh = ( isUp ? 1.0 - pow( 1.0 - su, 1.5 ) : 1.0 - pow( sb, 1.6 ) ) * RhMax - 0.3;
		// the front is lobed, not a straight line: each wave runs up a little differently along the beach
		float lobes = sin( along * 0.61 + ms * 2.3 ) * 0.5 + sin( along * 1.73 + ms * 5.1 ) * 0.3 + sin( along * 4.3 + ms * 1.7 ) * 0.2;
		// the backwash never quite exposes the lower beach face: a film of water always covers the first
		// decimetres past the shoreline, so the sea never meets the sand along mesh triangles
		float Rt = max( Rh + lobes * ( max( Rh, 0.0 ) * 0.07 + 0.35 ), 0.35 ) * uShoreEnabled;
		ShoreRunup o; o.tau = tau; o.Rt = Rt; o.inland = inland; o.RhMax = RhMax; o.su = su; o.sb = sb; o.isUp = isUp;
		return o;
	}
	// Water film thickness clipped at the leading edge of the swash sheet, for the water shader's edge fade:
	// ( clipped thickness, distance to the swash front (m, > 0 on the water side; 1e3 away from the swash),
	// tau, run-up Rt ). Only evaluated where the film is thin.
	vec4 shoreSwashEdge( vec2 p, float t ) {
		vec4 outE = vec4( t, 1e3, 0.0, 0.0 );
		if ( t < 0.3 ) {
			float g = waterGroundAt( p );
			if ( g > uWaterLevel - 0.8 ) {
				ShorePhase ph = shorePhaseAt( p );
				ShoreRunup r = shoreSwashRunup( ph.sh, ph.along, g );
				float front = r.Rt - r.inland;
				// the lapping region reaches down the beach face past where the sea's edge sits in the trough of
				// the backwash, and fades in from there and from 0.3 m of film instead of switching on; the front
				// distance is divided by the weight so the effects at the front recede with it
				float w = smoothstep( uWaterLevel - 0.8, uWaterLevel - 0.4, g ) * smoothstep( 0.3, 0.15, t );
				if ( w > 0.0 ) outE = vec4( mix( t, min( t, front * 0.08 ), w ), front / max( w, 1e-3 ), r.tau, r.Rt * w );
			}
		}
		return outE;
	}
	float shoreSwashClip( vec2 p, float t ) { return shoreSwashEdge( p, t ).x; }
	${ evaluateCode( 'shoreEvaluate', 'normal' ) }
	${ evaluateCode( 'shoreEvaluateNoNormal', 'plain' ) }
	${ evaluateCode( 'shoreEvaluateWorld', 'world' ) }
`;

// ---- CPU twin (shoreEvaluateNoNormal's displacement) ------------------------------------------------------

const sat = ( x ) => Math.min( 1, Math.max( 0, x ) );
const sstep = ( a, b, x ) => { const t = sat( ( x - a ) / ( b - a ) ); return t * t * ( 3 - 2 * t ); };
const mix = ( a, b, t ) => a + ( b - a ) * t;
function hash1( x ) {
	const v = ( Math.trunc( x ) + 1048576 ) >>> 0;
	const state = ( Math.imul( v, 747796405 ) + 2891336453 ) >>> 0;
	let word = Math.imul( ( ( state >>> ( ( state >>> 28 ) + 4 ) ) ^ state ) >>> 0, 277803737 ) >>> 0;
	word = ( ( word >>> 22 ) ^ word ) >>> 0;
	return ( word >>> 8 ) * ( 1 / 16777216 );
}
function bar( along ) {
	const w = Math.sin( along * 0.021 + 1.9 ) * 1.4 + Math.sin( along * 0.009 + 0.3 ) * 0.9;
	const r = Math.sin( along * 0.059 + w );
	const width = 0.8 + Math.sin( along * 0.017 + 4.1 ) * 0.08;
	const rip = sstep( width, 0.985, r );
	const b = 0.9 + ( Math.sin( along * 0.031 + 7.3 ) * 0.6 + Math.sin( along * 0.083 + 1.1 ) * 0.4 ) * 0.14;
	return [ b * ( 1 - rip * 0.58 ), rip ];
}
function wobble( along ) {
	return Math.sin( along * 0.029 + 0.7 ) * 0.07 + Math.sin( along * 0.083 + 2.1 ) * 0.035 + Math.sin( along * 0.19 + 0.4 ) * 0.022 + Math.sin( along * 0.37 + 2.6 ) * 0.011 + bar( along )[ 1 ] * 0.045;
}
function waveAmp( P, m, along ) {
	const waveSet = Math.abs( Math.sin( m * Math.PI / 7 ) ) * 0.6 + 0.55;
	const rnd = ( hash1( m ) - 0.5 ) * 2;
	const warp = Math.sin( along * 0.016 + m * 0.9 ) * 1.6;
	const a1 = Math.sin( along * 0.062 + m * 1.7 + warp );
	const a2 = Math.sin( along * 0.13 + m * 4.1 + 1.3 - warp * 0.7 );
	const a3 = Math.sin( along * 0.29 + m * 2.3 + warp * 0.5 ) * 0.6 + Math.sin( along * 0.47 + m * 5.9 + 0.8 ) * 0.4;
	const alongV = a1 * 0.6 + a2 * 0.4 + a3 * 0.28;
	return Math.max( P.amplitude * waveSet * ( 1 + rnd * P.variation * 0.5 + alongV * P.variation * 0.7 ) * bar( along )[ 0 ], 0.02 );
}
function breakParams( P, A, d ) {
	const o = {};
	o.db = Math.pow( A * 3.556 / P.gamma, 0.8 );
	o.b = ( o.db - d ) / ( o.db * P.breakSpan );
	const shoal = Math.pow( 10 / Math.min( 10, Math.max( 0.35, d ) ), 0.25 );
	o.Ash = A * shoal;
	o.p = mix( 1, 3, sstep( - 2.5, 0, o.b ) );
	o.meanP = 1 / Math.sqrt( ( o.p + 0.25 ) * Math.PI );
	o.crestPeak = 1 + sstep( - 1, 0.3, o.b ) * 0.22;
	o.yc = o.Ash * 2 * ( 1 - o.meanP ) * o.crestPeak;
	o.yt = o.Ash * - 2 * o.meanP * o.crestPeak;
	o.H = o.yc - o.yt;
	o.wBore = sstep( 0.85, 1.35, o.b );
	o.Xi = o.H * 0.8;
	o.Hb = Math.min( o.H * 0.6, Math.max( d, 0 ) * 0.75 ) * ( sstep( 0, 0.3, d ) * 0.7 + 0.3 );
	o.ycB = mix( o.yc, o.yt * 0.6 + o.Hb, o.wBore );
	o.ytB = mix( o.yt, o.yt * 0.6, o.wBore );
	o.Xc = mix( 0, o.Xi - o.Hb * 0.55, o.wBore ) * sstep( 0.03, 0.3, o.Hb );
	o.Wt = mix( o.H * mix( 0.25, 0.55, sstep( 0.1, 0.9, o.b ) ), o.Hb * 0.6 + 0.08, o.wBore );
	return o;
}
function profileXY( P, u, lam, B, out ) {
	const skew = sstep( - 3, 0, B.b ) * 0.55;
	const phi = u - skew * ( 1 - Math.cos( u * TAU ) ) / TAU;
	const c = Math.max( ( Math.cos( phi * TAU ) + 1 ) * 0.5, 0 );
	const yPre = B.Ash * 2 * ( Math.pow( c, B.p ) - B.meanP ) * B.crestPeak;
	const Q = sstep( - 3, 0, B.b ) * 0.25 + 0.1;
	const xPre = Math.sin( u * TAU ) * B.Ash * Q;
	const uf = 0.09;
	const inFace = u > - uf;
	const th = Math.min( 1, Math.max( 0, - u / uf ) ) * Math.PI / 2;
	const fx = mix( 1 - Math.cos( th ), Math.sin( th ), B.wBore );
	const fy = mix( 1 - Math.sin( th ), Math.cos( th ), B.wBore );
	const sTr = Math.min( 1, Math.max( 0, ( - u - uf ) / ( 0.5 - uf ) ) );
	const ul = u * lam;
	const xFront = ( inFace ? B.Xc + B.Wt * fx : mix( B.Xc + B.Wt, lam * 0.5, sTr ) ) + ul;
	const yFront = inFace ? B.ytB + ( B.ycB - B.ytB ) * fy : B.ytB;
	const cb = Math.pow( Math.max( ( Math.cos( u * ( TAU * 0.85 ) ) + 1 ) * 0.5, 0 ), B.p );
	const yBack = B.ytB + ( B.ycB - B.ytB ) * mix( cb, Math.exp( u * - 7 ), B.wBore );
	const xBack = B.Xc * Math.exp( u * - 6 ) * sstep( 0.5, 0.35, u ) + xPre * ( 1 - B.wBore );
	const front = u < 0;
	const wC = sstep( - 0.35, 0.25, B.b ) * P.curl;
	out[ 0 ] = mix( xPre, front ? xFront : xBack, wC );
	out[ 1 ] = mix( yPre, front ? yFront : yBack, wC );
	return out;
}

// The shore waves on the CPU and GPU: parameters (Tidewater ShoreWaves.uniforms), the field of the current
// tile (a float texture + its data), the fade while tiles swap.
export class ShoreWaves {
	constructor() {
		this.P = { period: 9.0, amplitude: 0.34, variation: 0.55, gamma: 0.78, breakSpan: 0.13, curl: 1.0, runup: 1.0, enabled: 1.0, turbidity: 0.16 };
		this.field = null; // { data, res, x0, z0, size, swellDir }
		this.texture = new THREE.DataTexture( new Float32Array( [ 1e5, 0, 0, 1e5 ] ), 1, 1, THREE.RGBAFormat, THREE.FloatType );
		this.texture.needsUpdate = true;
		this.rect = new THREE.Vector4( 0, 0, 1, 1 );
		this.fade = 0; // 0..1 (the tile swap fade)
		this._next = null;
		this._xy = [ 0, 0 ];
	}

	uniforms() {
		return {
			uShoreField: { value: this.texture }, uShoreRect: { value: this.rect },
			uShorePeriod: { value: 9 }, uShoreAmplitude: { value: 0.34 }, uShoreVariation: { value: 0.55 }, uShoreGamma: { value: 0.78 },
			uShoreBreakSpan: { value: 0.13 }, uShoreCurl: { value: 1 }, uShoreRunup: { value: 1 }, uShoreEnabled: { value: 0 }, uShoreTurbidity: { value: 0.16 },
			uOceanTime: { value: 0 },
		};
	}

	// a new tile's field: straight in when the swell direction is the same (the fields agree near the
	// camera), else fade the surf out and back in
	setField( F ) {
		if ( ! F ) { this._next = { none: true }; return; }
		const cur = this.field;
		if ( cur && cur.swellDir[ 0 ] === F.swellDir[ 0 ] && cur.swellDir[ 1 ] === F.swellDir[ 1 ] && this.fade > 0.99 ) this._swap( F );
		else this._next = F;
	}

	_swap( F ) {
		this.field = F;
		if ( ! F ) return;
		const t = this.texture;
		if ( t.image.width !== F.res ) {
			t.dispose();
			this.texture = new THREE.DataTexture( F.data, F.res, F.res, THREE.RGBAFormat, THREE.FloatType );
			this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
			this.texture.generateMipmaps = false;
		} else t.image.data = F.data;
		this.texture.needsUpdate = true;
		this.rect.set( F.x0, F.z0, F.size, F.res );
	}

	update( dt ) {
		if ( this._next ) {
			this.fade = Math.max( 0, this.fade - dt / 1.2 );
			if ( this.fade <= 0 || ! this.field ) { this._swap( this._next.none ? null : this._next ); this._next = null; }
		} else if ( this.field ) this.fade = Math.min( 1, this.fade + dt / 1.2 );
	}

	get enabled() { return this.P.enabled * this.fade * ( this.field ? 1 : 0 ); }

	applyTo( u, time ) {
		const P = this.P;
		u.uShoreField.value = this.texture; u.uShoreRect.value = this.rect;
		u.uShorePeriod.value = P.period; u.uShoreAmplitude.value = P.amplitude; u.uShoreVariation.value = P.variation; u.uShoreGamma.value = P.gamma;
		u.uShoreBreakSpan.value = P.breakSpan; u.uShoreCurl.value = P.curl; u.uShoreRunup.value = P.runup; u.uShoreEnabled.value = this.enabled; u.uShoreTurbidity.value = P.turbidity;
		u.uOceanTime.value = time;
	}

	// shoreFieldSample on the CPU (same bilinear and border fade)
	_sample( x, z, out ) {
		const F = this.field, res = F.res, D = F.data;
		const fx = ( x - F.x0 ) / F.size * res - 0.5, fz = ( z - F.z0 ) / F.size * res - 0.5;
		const cx = Math.min( Math.max( fx, 0 ), res - 1.001 ), cz = Math.min( Math.max( fz, 0 ), res - 1.001 );
		const i = Math.floor( cx ), j = Math.floor( cz ), tx = cx - i, tz = cz - j;
		for ( let c = 0; c < 4; c ++ ) {
			const a = D[ ( j * res + i ) * 4 + c ] * ( 1 - tx ) + D[ ( j * res + i + 1 ) * 4 + c ] * tx;
			const b = D[ ( ( j + 1 ) * res + i ) * 4 + c ] * ( 1 - tx ) + D[ ( ( j + 1 ) * res + i + 1 ) * 4 + c ] * tx;
			out[ c ] = a * ( 1 - tz ) + b * tz;
		}
		const inside = sstep( 0, res * 0.08, Math.min( fx, res - 1 - fx, fz, res - 1 - fz ) );
		out[ 1 ] *= inside; out[ 2 ] *= inside;
		return out;
	}

	// displacement ( x, y, z ) of shoreEvaluateNoNormal at Lagrangian point ( x, z ) (depth: the query point's,
	// groundAt: the ground height function the shaders use), into out
	disp( x, z, depth, groundAt, time, out ) {
		out[ 0 ] = out[ 1 ] = out[ 2 ] = 0;
		const en = this.enabled;
		if ( ! this.field || en <= 0 || depth >= 26 || depth <= - 0.25 ) return out;
		const sh = this._sample( x, z, this._sh || ( this._sh = [ 0, 0, 0, 0 ] ) );
		const exposure = Math.hypot( sh[ 1 ], sh[ 2 ] );
		const dx = sh[ 1 ] / Math.max( exposure, 1e-4 ), dz = sh[ 2 ] / Math.max( exposure, 1e-4 );
		const along = x * - dz + z * dx;
		const P = this.P;
		const s = ( time - sh[ 0 ] ) / P.period + wobble( along );
		const d = depth;
		const c = Math.sqrt( Math.min( 25, Math.max( 0.3, d ) ) * GRAVITY );
		const lam = c * P.period;
		const m = Math.floor( s + 0.5 );
		const u = s - m;
		const A0 = waveAmp( P, m, along );
		const An = waveAmp( P, m + Math.sign( u ), along );
		const A = mix( A0, An, sstep( 0.32, 0.5, Math.abs( u ) ) * 0.5 );
		// shoreBreakDepth
		const dc = - groundAt( x + dx * u * lam, z + dz * u * lam );
		const dB = mix( dc, d, sstep( 0.3, 0.5, Math.abs( u ) ) );
		const env = sstep( 26, 13, d ) * sstep( - 0.25, 0.05, d ) * sat( exposure * 1.4 ) * en;
		if ( env <= 0 ) return out;
		const xy = profileXY( P, u, lam, breakParams( P, A, dB ), this._xy );
		out[ 0 ] = dx * xy[ 0 ] * env; out[ 1 ] = xy[ 1 ] * env; out[ 2 ] = dz * xy[ 0 ] * env;
		return out;
	}
}
