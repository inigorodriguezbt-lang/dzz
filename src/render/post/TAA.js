// Ported from Tidewater src/post/TemporalUpscale.js (MIT, see LICENSE-Tidewater.txt) at native resolution
// (the upscaling parts dropped), and RCAS from src/post/PostFX.js (in the grade, Renderer.js).
// Temporal anti-aliasing: the accumulation of AMD FidelityFX Super Resolution 2 (FSR2 2.2, MIT) in one
// pass: the current frame reconstructed at the output pixel with a Lanczos-2 kernel over the 3x3 taps, a
// 5-tap Catmull-Rom history clamped to the neighbourhood's variance box (YCoCg), thin-feature locks and
// the luma instability test keeping sub-pixel detail, a still-pixel keep, and the accumulation capped by
// motion and by the history's resampling blur. Velocity is camera reprojection from depth (terrain, water,
// vegetation and buildings are static), and for the things that move on their own (creatures, vehicles, things
// in flight) the motion vectors of post/Motion.js: there the history follows the object, the clamp box is
// tight, no lock or still-pixel keep holds it, and the next frame treats the pixel as in motion (so the
// background revealed behind it doesn't keep it either). Motion.js's reactive mask (alpha particles, instance
// batches re-sorted every frame) drops that share of the history. The still-pixel keep (ours) only holds a
// history the jitter can explain: not near a moving object, not after the local luma swung, not one whose
// colour left the neighbourhood, nor one further out in luma than the local luma moved over the jitter cycle
// (a stale value on a steady pixel used to stay: the dotted lines the lawn kept after a teleport). Halton (2, 3)
// jitter with 4 phases at half a pixel (0.35 of it while the camera moves).
// WebGL conventions: uv.y up (the jitter and the sample offsets in y-up pixels), reversed-Z depth.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

function halton( index, base ) {
	let fraction = 1, result = 0;
	while ( index > 0 ) {
		fraction /= base;
		result += fraction * ( index % base );
		index = Math.floor( index / base );
	}
	return result;
}

const VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const RESOLVE_FRAG = /* glsl */`
	uniform sampler2D tBeauty; uniform sampler2D tDepth; uniform sampler2D tSceneDepth; uniform sampler2D tPrevDepth;
	uniform sampler2D tHistory; uniform sampler2D tLock; uniform sampler2D tLumaHistory; uniform sampler2D tExposure;
	uniform sampler2D tMotion; uniform float uMotionOn; uniform float uBoxDynamic; uniform float uKeepSwing; uniform float uKeepStrict;
	uniform mat4 uInvViewProj; uniform mat4 uViewProjNoJitter; uniform mat4 uPrevViewProjNoJitter; uniform mat4 uPrevInvViewProj; uniform mat4 uView; uniform vec3 uCamPosTAA;
	uniform vec2 uJitter; uniform vec2 uNearFar; uniform float uReset; uniform float uJitterPhases; uniform float uExposureScale;
	uniform float uDepthThreshold, uEdgeDepthDiff, uBoxStill, uBoxMotion, uMaxAccumulation, uMotionAccumulation, uBlurComp, uLocks, uInstability, uLockThreshold, uStaticKeep;
	varying vec2 vUv;
	layout( location = 0 ) out vec4 oColor;
	layout( location = 1 ) out vec4 oLock;
	layout( location = 2 ) out vec4 oLumaHistory;

	const float TAAU_EPS = 1e-3;
	const float TAAU_LANCZOS_WEIGHT_SCALE = 1.0 / 12.0;
	const float TAAU_AVG_LANCZOS_WEIGHT_PER_FRAME = 0.74 / 12.0;
	float sat( float x ) { return clamp( x, 0.0, 1.0 ); }
	float taauLum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
	vec3 taauToYCoCg( vec3 c ) { return vec3( dot( c, vec3( 0.25, 0.5, 0.25 ) ), dot( c, vec3( 0.5, 0.0, -0.5 ) ), dot( c, vec3( -0.25, 0.5, -0.25 ) ) ); }
	vec3 taauFromYCoCg( vec3 c ) { return vec3( c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z ); }
	// FSR2 Tonemap / InverseTonemap (max channel Reinhard)
	vec3 taauTonemap( vec3 c ) { return c / ( max( max( 0.0, c.r ), max( c.g, c.b ) ) + 1.0 ); }
	vec3 taauTonemapInverse( vec3 c ) { return c / max( 1e-4, 1.0 - max( c.r, max( c.g, c.b ) ) ); }
	float taauMinDivMax( float a, float b ) { float m = max( a, b ); return m != 0.0 ? min( a, b ) / m : 0.0; }
	// NaN or Inf (exponent bits all set; a bit test, which fast-math can't fold away like isnan / x != x)
	bool taauBad( vec4 c ) { return any( equal( floatBitsToUint( c ) & 0x7f800000u, uvec4( 0x7f800000u ) ) ); }
	// Lanczos-2 of the squared distance (FSR2 Lanczos2ApproxSq)
	float taauLanczos2Sq( float x2In ) {
		float x2 = min( x2In, 4.0 );
		float a = 0.4 * x2 - 1.0;
		float b = 0.25 * x2 - 1.0;
		return ( 1.5625 * a * a - 0.5625 ) * ( b * b );
	}
	// luma for the lock logic (FSR2 ComputeLockInputLuma: perceived lightness of the tone mapped colour, ^1/6)
	float taauLockLuma( vec3 rgb ) {
		float l = taauLum( taauTonemap( rgb ) );
		float p = ( l <= 216.0 / 24389.0 ? l * ( 24389.0 / 27.0 ) : pow( l, 1.0 / 3.0 ) * 116.0 - 16.0 ) * 0.01;
		return pow( max( p, 0.0 ), 1.0 / 6.0 );
	}
	// Catmull-Rom history lookup with 5 bilinear taps (the 4 corner taps are dropped)
	vec4 taauSampleHistory( vec2 uvIn ) {
		vec2 size = vec2( textureSize( tHistory, 0 ) );
		vec2 samplePos = uvIn * size;
		vec2 texPos1 = floor( samplePos - 0.5 ) + 0.5;
		vec2 f = samplePos - texPos1;
		vec2 w0 = f * ( f * ( f * -0.5 + 1.0 ) - 0.5 );
		vec2 w1 = f * f * ( f * 1.5 - 2.5 ) + 1.0;
		vec2 w2 = f * ( f * ( f * -1.5 + 2.0 ) + 0.5 );
		vec2 w3 = f * f * ( f * 0.5 - 0.5 );
		vec2 w12 = w1 + w2;
		vec2 tp0 = ( texPos1 - 1.0 ) / size;
		vec2 tp3 = ( texPos1 + 2.0 ) / size;
		vec2 tp12 = ( texPos1 + w2 / w12 ) / size;
		float wa = w12.x * w0.y; float wb = w0.x * w12.y; float wc = w12.x * w12.y; float wd = w3.x * w12.y; float we = w12.x * w3.y;
		vec4 sum = textureLod( tHistory, vec2( tp12.x, tp0.y ), 0.0 ) * wa
			+ textureLod( tHistory, vec2( tp0.x, tp12.y ), 0.0 ) * wb
			+ textureLod( tHistory, vec2( tp12.x, tp12.y ), 0.0 ) * wc
			+ textureLod( tHistory, vec2( tp3.x, tp12.y ), 0.0 ) * wd
			+ textureLod( tHistory, vec2( tp12.x, tp3.y ), 0.0 ) * we;
		return max( sum / ( wa + wb + wc + wd + we ), vec4( 0.0 ) );
	}
	vec4 taauLoadBeauty( ivec2 p ) { return texelFetch( tBeauty, clamp( p, ivec2( 0 ), textureSize( tBeauty, 0 ) - 1 ), 0 ); }
	float taauRawDepth( ivec2 p ) { return texelFetch( tDepth, clamp( p, ivec2( 0 ), textureSize( tDepth, 0 ) - 1 ), 0 ).r; }
	// standard (0 near .. 1 far) perspective depth of the reversed-Z buffer at p
	float taauDepthAt( ivec2 p ) { return 1.0 - taauRawDepth( p ); }
	// last frame's depth at uv, reprojected into this frame's camera (standard perspective depth)
	float taauPreviousDepth( vec2 uv ) {
		ivec2 s = textureSize( tPrevDepth, 0 );
		float d = texelFetch( tPrevDepth, clamp( ivec2( uv * vec2( s ) ), ivec2( 0 ), s - 1 ), 0 ).r;
		vec4 pw = uPrevInvViewProj * vec4( uv * 2.0 - 1.0, d, 1.0 );
		vec3 world = pw.xyz / pw.w;
		float viewZ = ( uView * vec4( world, 1.0 ) ).z;
		float near = uNearFar.x; float far = uNearFar.y;
		return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
	}
	// view distance of a standard perspective depth
	float taauLinearDepth( float d ) { float near = uNearFar.x; float far = uNearFar.y; return near * far / max( far - d * ( far - near ), 1e-6 ); }
	bool taauInside( vec2 uv ) { return all( greaterThanEqual( uv, vec2( 0.0 ) ) ) && all( lessThanEqual( uv, vec2( 1.0 ) ) ); }
	// camera-only motion of a texel (uv, current - previous): the world point under it (a direction at
	// infinity for the sky) projected with this and the last frame's unjittered cameras
	vec2 taauVelocity( ivec2 texel, vec2 size ) {
		float d = taauRawDepth( texel );
		vec2 uvT = ( vec2( texel ) + 0.5 ) / size;
		vec4 wp = uInvViewProj * vec4( uvT * 2.0 - 1.0, d, 1.0 );
		vec4 P = d < 1e-7 ? vec4( normalize( wp.xyz / wp.w - uCamPosTAA ), 0.0 ) : vec4( wp.xyz / wp.w, 1.0 );
		vec4 c = uViewProjNoJitter * P;
		vec4 p = uPrevViewProjNoJitter * P;
		if ( c.w <= 1e-6 || p.w <= 1e-6 ) return vec2( 0.0 );
		return ( c.xy / c.w - p.xy / p.w ) * 0.5;
	}

	void main() {
		vec2 uv = vUv;
		vec2 inSize = vec2( textureSize( tBeauty, 0 ) );
		vec2 outSize = vec2( textureSize( tHistory, 0 ) );
		vec2 downscale = inSize / outSize;
		float exposure = texelFetch( tExposure, ivec2( 0 ), 0 ).r * uExposureScale;

		// output pixel centre in input pixels; the input tap whose jittered sample is closest
		vec2 pIn = uv * inSize;
		ivec2 closestTap = ivec2( floor( pIn - ( vec2( 0.5 ) + uJitter ) + 0.5 ) );

		// ---- reprojection: velocity of the nearest depth in the 3x3, disocclusion
		float closestDepth = 2.0;
		ivec2 closestPositionTexel = ivec2( 0 );
		float farthestDepth = -1.0;
		for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
			ivec2 neighbor = closestTap + ivec2( x, y );
			float depth = taauDepthAt( neighbor );
			if ( depth < closestDepth ) { closestDepth = depth; closestPositionTexel = neighbor; }
			farthestDepth = max( farthestDepth, depth );
		}
		ivec2 cpt = clamp( closestPositionTexel, ivec2( 0 ), ivec2( inSize ) - 1 );
		ivec2 ct = clamp( closestTap, ivec2( 0 ), ivec2( inSize ) - 1 );
		// moving objects (Motion.js): their motion vector at the nearest depth (dilated, as FSR2), dynamic when
		// that or the pixel itself is one; the reactive mask at the pixel
		vec4 motionN = vec4( 0.0 ), motionC = vec4( 0.0 );
		float nearDynamic = 0.0;
		if ( uMotionOn > 0.5 ) {
			motionN = texelFetch( tMotion, cpt, 0 ); motionC = texelFetch( tMotion, ct, 0 );
			// (the 1/8 mip, bilinear: a moving object within ~8-16 input pixels; its AO halo and contact shadow
			// move with it over static pixels)
			nearDynamic = textureLod( tMotion, uv, 3.0 ).a;
		}
		bool isDynamic = motionN.a > 0.5 || motionC.a > 0.5;
		float reactiveIn = sat( motionC.b );
		vec2 velocity = motionN.a > 0.5 ? motionN.xy : taauVelocity( cpt, inSize );
		vec2 historyUV = uv - velocity;
		float hrVelocity = length( velocity * outSize ); // output pixels per frame
		bool isEdge = farthestDepth - closestDepth > uEdgeDepthDiff;
		float prevDepth = taauPreviousDepth( historyUV );
		// (a moving object's own depth changes from frame to frame: there only a jump of 10 cm + 3 % counts, what
		// stood in front of it last frame)
		float linNow = taauLinearDepth( closestDepth );
		bool isDisocclusion = isDynamic ? linNow - taauLinearDepth( prevDepth ) > 0.1 + 0.03 * linNow : closestDepth - prevDepth > uDepthThreshold;
		// the water surface keeps its history (its depth changes with the waves, not with occlusion): it is
		// in front of the opaque depth
		bool isWater = texelFetch( tDepth, ct, 0 ).r > texelFetch( tSceneDepth, ct, 0 ).r + 1e-7;
		bool isExistingSample = taauInside( historyUV );
		// (a depth edge keeps its history against the jitter, but not where something moves)
		float depthClip = ( isDisocclusion && ( isDynamic || ! isEdge ) && ! isWater ) ? 1.0 : 0.0;
		bool isNewSample = ! isExistingSample || uReset > 0.5;

		// ---- history (FSR2 ReprojectHistoryColor / ReprojectHistoryLockStatus)
		vec3 historyColor = vec3( 0.0 );
		vec2 lockStatus = vec2( 0.0 );
		float temporalReactive = 0.0;
		bool inMotionLastFrame = false;
		bool wasDynamic = false;
		float blurPrev = 0.0;
		if ( ! isNewSample ) {
			vec4 hs = taauSampleHistory( historyUV );
			vec4 ls = textureLod( tLock, historyUV, 0.0 );
			// a NaN / Inf that got into the history (or the exposure) restarts the pixel instead of spreading
			// (z: the temporal reactive factor, negative in motion, 2 lower on a moving object: a flag, so the
			// nearest texel's, not a blend)
			float lz = texelFetch( tLock, clamp( ivec2( historyUV * outSize ), ivec2( 0 ), ivec2( outSize ) - 1 ), 0 ).z;
			if ( taauBad( hs ) || taauBad( ls ) || taauBad( vec4( exposure, lz, 0.0, 0.0 ) ) ) { isNewSample = true; hs = vec4( 0.0 ); ls = vec4( 0.0 ); lz = 0.0; }
			historyColor = taauToYCoCg( min( hs.rgb * exposure, vec3( 65504.0 ) ) );
			lockStatus = ls.xy;
			wasDynamic = lz < - 1.5;
			temporalReactive = sat( abs( lz ) - ( wasDynamic ? 2.0 : 0.0 ) );
			inMotionLastFrame = lz < 0.0;
			blurPrev = ls.w;
		}
		// a moving object left this pixel: what it uncovered has no history (where its depth gives no
		// disocclusion either: feet on the ground, a body lying on it)
		if ( wasDynamic && ! isDynamic ) depthClip = 1.0;

		// ---- the 3x3 input taps: prepared (exposed) YCoCg colour, lock luma. A NaN / Inf tap (one bad pixel of a
		// material) is dropped: it takes the centre's value and no weight, so it can't turn into a black block
		vec3 samples[ 9 ];
		float lumas[ 9 ];
		bool valid[ 9 ];
		float lumaSum = 0.0;
		vec4 centreRaw = taauLoadBeauty( closestTap );
		centreRaw = taauBad( centreRaw ) ? vec4( 0.0 ) : centreRaw;
		for ( int i = 0; i < 9; i ++ ) {
			ivec2 tap = closestTap + ivec2( i % 3 - 1, i / 3 - 1 );
			vec4 raw = taauLoadBeauty( tap );
			valid[ i ] = ! taauBad( raw );
			vec3 rgb = min( max( ( valid[ i ] ? raw : centreRaw ).rgb, vec3( 0.0 ) ) * exposure, vec3( 65504.0 ) );
			samples[ i ] = taauToYCoCg( rgb );
			lumas[ i ] = taauLockLuma( rgb );
			lumaSum += lumas[ i ];
		}

		// ---- new lock: the centre tap is a thin feature (FSR2 ComputeThinFeatureConfidence)
		bool newLock = false;
		{
			float nucleus = lumas[ 4 ];
			uint mask = 1u << 4u;
			float dMin = 3.4e38;
			float dMax = 0.0;
			for ( int i = 0; i < 9; i ++ ) {
				if ( i == 4 ) continue;
				float l = lumas[ i ];
				float diff = max( l, nucleus ) / min( l, nucleus );
				if ( diff > 0.0 && diff < uLockThreshold ) mask |= 1u << uint( i );
				else { dMin = min( dMin, l ); dMax = max( dMax, l ); }
			}
			bool isRidge = nucleus > dMax || nucleus < dMin;
			uint q0 = ( 1u << 0u ) | ( 1u << 1u ) | ( 1u << 3u ) | ( 1u << 4u );
			uint q1 = ( 1u << 1u ) | ( 1u << 2u ) | ( 1u << 4u ) | ( 1u << 5u );
			uint q2 = ( 1u << 3u ) | ( 1u << 4u ) | ( 1u << 6u ) | ( 1u << 7u );
			uint q3 = ( 1u << 4u ) | ( 1u << 5u ) | ( 1u << 7u ) | ( 1u << 8u );
			newLock = ! isDynamic && isRidge && ( mask & q0 ) != q0 && ( mask & q1 ) != q1 && ( mask & q2 ) != q2 && ( mask & q3 ) != q3;
		}

		// ---- lock status (FSR2 UpdateLockStatus); the shading change luma is the local mean lock luma
		float thisFrameReactive = max( temporalReactive, reactiveIn );
		float shadingLuma = lumaSum / 9.0;
		if ( lockStatus.y == 0.0 ) lockStatus.y = shadingLuma;
		float luminanceDiff = 1.0 - taauMinDivMax( lockStatus.y, shadingLuma );
		if ( newLock ) {
			lockStatus.y = shadingLuma;
			lockStatus.x = lockStatus.x != 0.0 ? 2.0 : 1.0;
		} else if ( lockStatus.x <= 1.0 ) {
			lockStatus.y = mix( lockStatus.y, shadingLuma, 0.5 );
		} else if ( luminanceDiff > 0.1 ) {
			lockStatus.x = 0.0;
		}
		thisFrameReactive = max( thisFrameReactive, sat( ( luminanceDiff - 0.1 ) * 10.0 ) );
		lockStatus.x *= 1.0 - thisFrameReactive;
		lockStatus.x *= depthClip < 0.1 && ! isDynamic ? 1.0 : 0.0;
		float lockContribution = sat( sat( sat( lockStatus.x - 1.0 ) * 4.0 ) * sat( taauMinDivMax( lockStatus.y, shadingLuma ) ) ) * uLocks;

		// ---- this frame at the output pixel: Lanczos-2 over the 3x3 taps, and the rectification box
		float kernelReactive = max( thisFrameReactive, isNewSample ? 1.0 : 0.0 );
		float maxKernelWeight = min( 1.99, 1.0 + ( 1.0 / downscale.x - 1.0 ) );
		float kernelBiasMax = maxKernelWeight * ( 1.0 - kernelReactive );
		float kernelBiasMin = max( 1.0, ( 1.0 + kernelBiasMax ) * 0.3 );
		float kernelBias = mix( kernelBiasMax, kernelBiasMin, max( 0.25 * depthClip, kernelReactive ) );
		float rectCurveBias = mix( -2.0, -3.0, sat( hrVelocity / 50.0 ) );
		vec3 colorSum = vec3( 0.0 );
		float weightSum = 0.0;
		vec3 boxCenter = vec3( 0.0 );
		vec3 boxVec = vec3( 0.0 );
		float boxWeight = 0.0;
		vec3 aabbMin = vec3( 3.4e38 );
		vec3 aabbMax = vec3( -3.4e38 );
		ivec2 iSize = ivec2( inSize );
		for ( int i = 0; i < 9; i ++ ) {
			ivec2 tap = closestTap + ivec2( i % 3 - 1, i / 3 - 1 );
			vec2 offset = vec2( tap ) + vec2( 0.5 ) + uJitter - pIn; // sample position - output position
			bool onScreen = all( greaterThanEqual( tap, ivec2( 0 ) ) ) && all( lessThan( tap, iSize ) );
			vec2 ob = offset * kernelBias;
			float w = onScreen && valid[ i ] ? taauLanczos2Sq( dot( ob, ob ) ) : 0.0;
			vec3 c = samples[ i ];
			colorSum += c * w;
			weightSum += w;
			float bw = exp( rectCurveBias * dot( offset, offset ) );
			boxCenter += c * bw;
			boxVec += c * c * bw;
			boxWeight += bw;
			aabbMin = min( aabbMin, c );
			aabbMax = max( aabbMax, c );
		}
		boxCenter /= boxWeight;
		boxVec = sqrt( abs( boxVec / boxWeight - boxCenter * boxCenter ) );
		float upsampledWeight = weightSum > TAAU_EPS ? weightSum : 0.0;
		vec3 upsampled = vec3( 0.0 );
		if ( upsampledWeight > TAAU_EPS ) {
			// deringing: the Lanczos lobes can't leave the neighbourhood's range
			upsampled = clamp( colorSum / upsampledWeight, aabbMin, aabbMax );
			upsampledWeight *= TAAU_LANCZOS_WEIGHT_SCALE;
		}

		// ---- luma instability (FSR2 ComputeLumaInstabilityFactor): the local luma returning to an older
		// value instead of the last one
		float lumaInstability = 0.0;
		vec4 lumaHist = vec4( 0.0 );
		float staticKeep = 0.0;
		{
			float curLuma = boxCenter.x / ( 1.0 + max( 0.0, boxCenter.x ) );
			curLuma = floor( curLuma * 255.0 + 0.5 ) / 255.0;
			bool sampleHist = max( depthClip, luminanceDiff ) < 0.1 && ! isNewSample;
			if ( sampleHist ) lumaHist = textureLod( tLumaHistory, historyUV, 0.0 );
			float d0 = curLuma - lumaHist.x;
			float dmin = abs( d0 );
			if ( dmin >= 1.0 / 255.0 ) {
				for ( int i = 1; i < 4; i ++ ) {
					float d1 = curLuma - lumaHist[ i ];
					if ( sign( d0 ) == sign( d1 ) ) dmin = min( dmin, abs( d1 ) );
				}
				float boxSizeFactor = pow( sat( boxVec.x / 0.1 ), 6.0 );
				lumaInstability = ( dmin != abs( d0 ) ? 1.0 : 0.0 ) * boxSizeFactor;
				lumaInstability = lumaInstability > 1.0 / 255.0 ? 1.0 : 0.0;
			}
			lumaInstability *= ( lumaHist.w != 0.0 && ! isDynamic && nearDynamic < 0.005 ? 1.0 : 0.0 ) * uInstability;
			// still pixels: a clamp can only be the jitter's doing unless the lighting changed (or something
			// moved through: not on or just behind a moving object, nor under the reactive mask)
			float dAll = min( min( abs( curLuma - lumaHist.x ), abs( curLuma - lumaHist.y ) ), min( abs( curLuma - lumaHist.z ), abs( curLuma - lumaHist.w ) ) );
			bool still = hrVelocity < 0.05 && lumaHist.w != 0.0 && ! isWater && ! isDynamic && ! inMotionLastFrame && reactiveIn < 0.01 && nearDynamic < 0.005;
			// (ours) nor while the last frames swung: something passed over (a moving shadow, a light), and what it
			// left in the history is not the jitter's doing
			float swing = max( max( abs( curLuma - lumaHist.x ), abs( lumaHist.x - lumaHist.y ) ), max( abs( lumaHist.y - lumaHist.z ), abs( lumaHist.z - lumaHist.w ) ) );
			staticKeep = uStaticKeep * ( still ? 1.0 : 0.0 ) * sat( 1.0 - ( dAll - 0.01 ) / 0.03 ) * mix( 1.0, sat( 1.0 - ( swing - 0.03 ) / 0.03 ), uKeepSwing );
			// (ours) and the test above sees luma only: a history whose colour left the neighbourhood further than
			// its luma did is no jitter (the lawn turning from dry to green as the ground data streams in kept the
			// old colour along the lines where both lumas matched; a blue jacket passing over grass)
			vec3 hOut = max( aabbMin - historyColor, 0.0 ) + max( historyColor - aabbMax, 0.0 );
			float chromaExcess = ( length( hOut.yz ) - hOut.x ) / max( boxCenter.x, 1e-4 );
			staticKeep *= mix( 1.0, sat( 1.0 - ( chromaExcess - 0.02 ) / 0.04 ), uKeepStrict );
			// (ours) and it only covers what the jitter can do: a sub-pixel feature the taps catch in some phases
			// moves the local luma by about as much as it puts the history outside the box. Beyond twice the spread
			// of the last four local lumas the history is stale (something that was there and is gone)
			float lumaLo = min( min( curLuma, lumaHist.x ), min( min( lumaHist.y, lumaHist.z ), lumaHist.w ) );
			float lumaHi = max( max( curLuma, lumaHist.x ), max( max( lumaHist.y, lumaHist.z ), lumaHist.w ) );
			float hY = max( historyColor.x, 0.0 ), cY = clamp( hY, max( aabbMin.x, 0.0 ), max( aabbMax.x, 0.0 ) );
			float lumaExcess = abs( hY / ( 1.0 + hY ) - cY / ( 1.0 + cY ) );
			staticKeep *= mix( 1.0, sat( 1.0 - ( lumaExcess - 2.0 * ( lumaHi - lumaLo ) - 2.0 / 255.0 ) / ( 4.0 / 255.0 ) ), uKeepStrict );
			lumaHist = vec4( curLuma, lumaHist.xyz );
		}

		// ---- accumulation weight (FSR2 ComputeBaseAccumulationWeight)
		float accumulation = uMaxAccumulation * ( isExistingSample ? 1.0 : 0.0 ) * ( 1.0 - thisFrameReactive ) * ( 1.0 - depthClip );
		accumulation = min( accumulation, mix( accumulation, upsampledWeight * uMotionAccumulation, max( inMotionLastFrame || isDynamic ? 1.0 : 0.0, sat( hrVelocity * 10.0 ) ) ) );
		accumulation = min( accumulation, mix( accumulation, upsampledWeight, sat( hrVelocity / 20.0 ) ) );

		// resampling blur: the blur the history has gathered caps the accumulation
		vec2 hf = fract( historyUV * outSize - 0.5 );
		vec2 hv = hf * ( 1.0 - hf );
		float blurAcc = blurPrev + hv.x + hv.y;
		float blurAlpha = min( blurAcc * uBlurComp, isWater ? 0.15 : 1.0 );
		accumulation = min( accumulation, upsampledWeight * ( 1.0 - blurAlpha ) / max( blurAlpha, 1e-3 ) );

		vec3 outColor;
		float alphaOut = 1.0;
		if ( isNewSample ) {
			outColor = taauFromYCoCg( upsampled );
		} else {
			// rectify (FSR2 RectifyHistory): clamp to the variance box, but keep locked and oscillating
			// pixels' history; a clamp drops the accumulated weight
			float scaleInfluence = max( uBoxStill, min( 20.0, pow( 1.0 / abs( downscale.x * downscale.y ), 3.0 ) ) );
			float boxScaleT = max( max( depthClip, sat( hrVelocity / 20.0 ) ), isDynamic ? uBoxDynamic : 0.0 );
			float boxScale = mix( scaleInfluence, uBoxMotion, boxScaleT );
			vec3 boxMin = max( aabbMin, boxCenter - boxVec * boxScale );
			vec3 boxMax = min( aabbMax, boxCenter + boxVec * boxScale );
			if ( any( greaterThan( boxMin, historyColor ) ) || any( greaterThan( historyColor, boxMax ) ) ) {
				vec3 clamped = clamp( historyColor, boxMin, boxMax );
				// (not on the water: its glints move on their own and would leave trails)
				float contribution = isWater ? 0.0 : sat( max( max( lumaInstability, lockContribution ), staticKeep ) );
				historyColor = mix( clamped, historyColor, contribution );
				accumulation = mix( min( accumulation, 0.1 ), accumulation, contribution );
			}
			// accumulate (FSR2 Accumulate), blending tone mapped colours
			float acc = max( TAAU_EPS, accumulation + upsampledWeight );
			float alpha = upsampledWeight / acc;
			alphaOut = alpha;
			vec3 up = taauToYCoCg( taauTonemap( taauFromYCoCg( upsampled ) ) );
			vec3 hi = taauToYCoCg( taauTonemap( taauFromYCoCg( historyColor ) ) );
			outColor = taauTonemapInverse( taauFromYCoCg( mix( hi, up, alpha ) ) );
		}

		// ---- lock lifetime (FSR2 FinalizeLockStatus)
		if ( ! taauInside( uv + velocity ) ) lockStatus.x = 0.0;
		else lockStatus.x = max( 0.0, lockStatus.x - upsampledWeight / ( uJitterPhases * TAAU_AVG_LANCZOS_WEIGHT_PER_FRAME ) );

		// ---- temporal reactive factor for the next frame (FSR2 ComputeTemporalReactiveFactor)
		float newReactive = min( 0.99, thisFrameReactive );
		newReactive = max( newReactive, mix( newReactive, 0.4, sat( hrVelocity ) ) );
		newReactive = max( newReactive * newReactive, depthClip * 0.1 );
		newReactive = isNewSample ? 1.0 : newReactive;
		if ( sat( hrVelocity * 10.0 ) >= 1.0 || isDynamic ) newReactive = -max( TAAU_EPS, newReactive );
		if ( isDynamic ) newReactive -= 2.0;

		outColor = max( outColor, vec3( 0.0 ) ) / max( exposure, 1e-6 );
		oColor = vec4( taauBad( vec4( outColor, 1.0 ) ) ? vec3( 0.0 ) : outColor, 1.0 );
		oLock = vec4( lockStatus, newReactive, isNewSample ? 0.0 : blurAcc * ( 1.0 - alphaOut ) );
		oLumaHistory = lumaHist;
	}`;

const COPY_DEPTH_FRAG = /* glsl */`
	uniform sampler2D tDepth;
	void main() { gl_FragColor = vec4( texelFetch( tDepth, ivec2( gl_FragCoord.xy ), 0 ).r, 0.0, 0.0, 1.0 ); }`;

const COPY_FRAG = /* glsl */`
	uniform sampler2D tSrc;
	void main() { gl_FragColor = texelFetch( tSrc, ivec2( gl_FragCoord.xy ), 0 ); }`;

export class TAA {
	constructor() {
		const hist = () => {
			const t = new THREE.WebGLRenderTarget( 1, 1, { count: 3, type: THREE.HalfFloatType, depthBuffer: false } );
			for ( const x of t.textures ) { x.minFilter = x.magFilter = THREE.LinearFilter; x.generateMipmaps = false; }
			// (the luma history holds four lumas already quantised to 1/255: 8 bits each)
			t.textures[ 2 ].type = THREE.UnsignedByteType;
			return t;
		};
		this.history = [ hist(), hist() ];
		this._cur = 0;
		this.prevDepth = new THREE.WebGLRenderTarget( 1, 1, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false } );
		this.prevDepth.texture.minFilter = this.prevDepth.texture.magFilter = THREE.NearestFilter;
		this.resolveMat = new THREE.ShaderMaterial( {
			name: 'TAAResolve', glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: RESOLVE_FRAG, depthTest: false, depthWrite: false,
			uniforms: {
				tBeauty: { value: null }, tDepth: { value: null }, tSceneDepth: { value: null }, tPrevDepth: { value: this.prevDepth.texture },
				tHistory: { value: null }, tLock: { value: null }, tLumaHistory: { value: null }, tExposure: { value: null },
				// motion vectors and the reactive mask (post/Motion.js), when anything was drawn into them this frame
				tMotion: { value: null }, uMotionOn: { value: 0 },
				uInvViewProj: { value: new THREE.Matrix4() }, uViewProjNoJitter: { value: new THREE.Matrix4() }, uPrevViewProjNoJitter: { value: new THREE.Matrix4() },
				uPrevInvViewProj: { value: new THREE.Matrix4() }, uView: { value: new THREE.Matrix4() }, uCamPosTAA: { value: new THREE.Vector3() },
				uJitter: { value: new THREE.Vector2() }, uNearFar: { value: new THREE.Vector2( 0.1, 1000 ) }, uReset: { value: 1 }, uJitterPhases: { value: 4 }, uExposureScale: { value: 0.55 },
				// tuning (Tidewater's defaults): depth thresholds, clamp box (sigmas) still / moving, history length,
				// its cap in motion, the resampling blur cap, locks, luma instability, lock similarity, still keep
				uDepthThreshold: { value: 0.0005 }, uEdgeDepthDiff: { value: 0.001 }, uBoxStill: { value: 3 }, uBoxMotion: { value: 1 },
				uMaxAccumulation: { value: 2 }, uMotionAccumulation: { value: 10 }, uBlurComp: { value: 0.5 }, uLocks: { value: 1 },
				uInstability: { value: 1 }, uLockThreshold: { value: 1.05 }, uStaticKeep: { value: 1 },
				// (ours) on moving objects the clamp box goes this far from the still box toward the moving one
				uBoxDynamic: { value: 0.85 },
				// (ours) 1: no still-pixel keep for the four frames after the local luma swung
				uKeepSwing: { value: 1 },
				// (ours) 1: no still-pixel keep for a history that left the neighbourhood in colour, or in luma further
				// than the jitter moves the local luma
				uKeepStrict: { value: 1 },
			},
		} );
		this.copyDepthMat = new THREE.ShaderMaterial( { vertexShader: VERT, fragmentShader: COPY_DEPTH_FRAG, uniforms: { tDepth: { value: null } }, depthTest: false, depthWrite: false } );
		this.copyMat = new THREE.ShaderMaterial( { vertexShader: VERT, fragmentShader: COPY_FRAG, uniforms: { tSrc: { value: null } }, depthTest: false, depthWrite: false } );
		this.quad = new FullScreenQuad();
		this.jitterPhases = 4;
		this.jitterScale = 0.5;
		this.jitterMoving = 0.35;
		this._jitterIndex = 0;
		this._camMotion = 0;
		this._camPrev = null;
		this.jitter = new THREE.Vector2();
		this._clean = new THREE.Matrix4();
		this._cleanInv = new THREE.Matrix4();
		this._vpNoJitter = new THREE.Matrix4();
		this._prevVPNoJitter = new THREE.Matrix4();
		this._prevInvVP = new THREE.Matrix4();
		this._invVP = new THREE.Matrix4();
		this._hasPrev = false;
		this.needsRestart = true;
	}

	// w x h: the input (render) resolution; ow x oh: the output, larger when upsampling (the history lives
	// there, the depth copy at the input's). The jitter cycle grows with the upsampling (FSR2: 8 x the area
	// ratio; ours 4 at native) so every output pixel gets samples near its centre
	setSize( w, h, ow = w, oh = h ) {
		for ( const t of this.history ) t.setSize( ow, oh );
		this.prevDepth.setSize( w, h );
		this.needsRestart = true;
		this._w = w; this._h = h;
		this.jitterPhases = Math.min( 16, Math.max( 4, Math.round( 4 * ( ow * oh ) / ( w * h ) ) ) );
		// (upsampling needs the jitter over the whole input pixel; at native half of it keeps the image crisper)
		this.jitterScale = ow > w ? 1 : 0.5;
	}

	get texture() { return this.history[ this._cur ].textures[ 0 ]; }
	// this and the last frame's unjittered view-projection (valid between begin and end)
	get viewProj() { return this._vpNoJitter; }
	get prevViewProj() { return this._prevVPNoJitter; }

	// 0 (still) .. 1 (moving) from the camera's world matrix since the last frame, eased out
	_cameraMotion( camera ) {
		const e = camera.matrixWorld.elements;
		const cur = [ e[ 12 ], e[ 13 ], e[ 14 ], e[ 8 ], e[ 9 ], e[ 10 ] ];
		let target = 0;
		if ( this._camPrev ) {
			const p = this._camPrev;
			const dPos = Math.hypot( cur[ 0 ] - p[ 0 ], cur[ 1 ] - p[ 1 ], cur[ 2 ] - p[ 2 ] );
			const dDir = Math.hypot( cur[ 3 ] - p[ 3 ], cur[ 4 ] - p[ 4 ], cur[ 5 ] - p[ 5 ] );
			target = Math.max( 0, Math.min( 1, Math.max( ( dPos - 0.002 ) / 0.008, ( dDir - 0.0005 ) / 0.0015 ) ) );
		}
		this._camPrev = cur;
		this._camMotion = target > this._camMotion ? target : this._camMotion + ( target - this._camMotion ) * 0.15;
		return this._camMotion;
	}

	// jitter this frame's projection (Halton 2, 3); the clean projection stays in camera.userData.projNoJitter
	begin( camera, w, h ) {
		camera.updateMatrixWorld();
		// camera cuts (teleports, respawns, camera switches): no history across them
		const e = camera.matrixWorld.elements, c = this._cut || ( this._cut = [ 0, 0, 0, 0, 0, 0, false ] );
		if ( ! c[ 6 ] || Math.hypot( e[ 12 ] - c[ 0 ], e[ 13 ] - c[ 1 ], e[ 14 ] - c[ 2 ] ) > 5 || e[ 8 ] * c[ 3 ] + e[ 9 ] * c[ 4 ] + e[ 10 ] * c[ 5 ] < 0.95 ) this.reset();
		c[ 0 ] = e[ 12 ]; c[ 1 ] = e[ 13 ]; c[ 2 ] = e[ 14 ]; c[ 3 ] = e[ 8 ]; c[ 4 ] = e[ 9 ]; c[ 5 ] = e[ 10 ]; c[ 6 ] = true;
		const i = this._jitterIndex % this.jitterPhases;
		const k = this.jitterScale * ( 1 + ( this.jitterMoving - 1 ) * this._cameraMotion( camera ) );
		const jx = ( halton( i + 1, 2 ) - 0.5 ) * k, jy = ( halton( i + 1, 3 ) - 0.5 ) * k;
		this.jitter.set( jx, jy );
		this._clean.copy( camera.projectionMatrix );
		this._cleanInv.copy( camera.projectionMatrixInverse );
		camera.userData.projNoJitter = this._clean;
		// the image moves by -j pixels: the pixel at p samples the clean image at p + j
		camera.projectionMatrix.elements[ 8 ] += 2 * jx / w;
		camera.projectionMatrix.elements[ 9 ] += 2 * jy / h;
		camera.projectionMatrixInverse.copy( camera.projectionMatrix ).invert();
		this._vpNoJitter.multiplyMatrices( this._clean, camera.matrixWorldInverse );
		this._invVP.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ).invert();
		if ( ! this._hasPrev ) { this._prevVPNoJitter.copy( this._vpNoJitter ); this._prevInvVP.copy( this._invVP ); }
	}

	// restore the clean projection
	end( camera ) {
		camera.projectionMatrix.copy( this._clean );
		camera.projectionMatrixInverse.copy( this._cleanInv );
		this._prevVPNoJitter.copy( this._vpNoJitter );
		this._prevInvVP.copy( this._invVP );
		this._hasPrev = true;
		this._jitterIndex = ( this._jitterIndex + 1 ) % 1024;
	}

	_draw( m, t ) {
		this.quad.material = m;
		this.gl.setRenderTarget( t );
		this.quad.render( this.gl );
	}

	// the resolve: beauty (lit colour), depth (with water), scene depth (opaque), exposure (1x1 texture), the
	// motion vectors / reactive mask (post/Motion.js; null when nothing moving was drawn)
	resolve( gl, camera, beauty, depth, sceneDepth, exposure, motion = null ) {
		this.gl = gl;
		const u = this.resolveMat.uniforms;
		u.tMotion.value = motion;
		u.uMotionOn.value = motion ? 1 : 0;
		const dst = 1 - this._cur, src = this.history[ this._cur ];
		u.tBeauty.value = beauty;
		u.tDepth.value = depth;
		u.tSceneDepth.value = sceneDepth;
		u.tExposure.value = exposure;
		u.tHistory.value = src.textures[ 0 ];
		u.tLock.value = src.textures[ 1 ];
		u.tLumaHistory.value = src.textures[ 2 ];
		u.uInvViewProj.value.copy( this._invVP );
		u.uViewProjNoJitter.value.copy( this._vpNoJitter );
		u.uPrevViewProjNoJitter.value.copy( this._prevVPNoJitter );
		u.uPrevInvViewProj.value.copy( this._prevInvVP );
		u.uView.value.copy( camera.matrixWorldInverse );
		u.uCamPosTAA.value.setFromMatrixPosition( camera.matrixWorld );
		u.uJitter.value.copy( this.jitter );
		u.uNearFar.value.set( camera.near, camera.far );
		u.uJitterPhases.value = this.jitterPhases;
		u.uReset.value = this.needsRestart ? 1 : 0;
		this.needsRestart = false;
		this._draw( this.resolveMat, this.history[ dst ] );
		this._cur = dst;
		// this frame's depth for the next frame's disocclusion test
		this.copyDepthMat.uniforms.tDepth.value = depth;
		this._draw( this.copyDepthMat, this.prevDepth );
		return this.texture;
	}

	// the resolved image into a target (the view model is drawn over it there, never into the history)
	copyTo( gl, target ) {
		this.gl = gl;
		this.copyMat.uniforms.tSrc.value = this.texture;
		this._draw( this.copyMat, target );
	}

	reset() { this.needsRestart = true; this._hasPrev = false; }

	dispose() {
		for ( const t of this.history ) t.dispose();
		this.prevDepth.dispose();
	}
}
