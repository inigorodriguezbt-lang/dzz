// Ported from Tidewater src/ocean/OceanFFT.js (MIT, see LICENSE-Tidewater.txt)
// Multi-cascade Tessendorf ocean with a JONSWAP / TMA spectrum and two wave systems (local wind sea +
// distant swell). This file is plain JS (Node tests, workers): the spectrum constants, the GLSL of the
// spectrum helpers for the GPU passes (OceanFFT.js), and the CPU twin: the same spectrum through small
// CPU FFTs for the physics height queries (swimming, boats, splashes).
//
// CPU twin: the three largest cascades are band-limited to |n| <= 28 frequency steps (the cuts below), so
// a 64^2 inverse FFT of the same modes holds them exactly at its samples; cascades 0 and 1 (most of the
// energy is near their band's top, ~2-4 samples per wavelength at 64^2) run at 128^2, zero padded, for the
// interpolation between samples. The finest cascade (7.1 m tile, < 1 cm RMS) is left out.

export const FFT_SIZE = 256;
export const GRAVITY = 9.81;
// non-integer ratios between cascade sizes avoid visible repetition
export const CASCADE_SIZES = [ 733, 157, 33.3, 7.1 ];
export const OCEAN_SEED = 1337;
const TWO_PI = Math.PI * 2;

export class WaveSystem {
	constructor( o = {} ) {
		this.scale = o.scale ?? 1;
		this.windSpeed = o.windSpeed ?? 8; // m/s
		this.windDirection = o.windDirection ?? 20; // degrees
		this.fetch = o.fetch ?? 200; // km
		this.spreadBlend = o.spreadBlend ?? 0.9;
		this.swell = o.swell ?? 0.2;
		this.peakEnhancement = o.peakEnhancement ?? 3.3;
		this.shortWavesFade = o.shortWavesFade ?? 0.01;
	}
}

// Tidewater's defaults (OceanFFT.js 90-91): the local sea and the swell system
export function defaultSystems() {
	return {
		local: new WaveSystem( { windSpeed: 7, windDirection: 25, fetch: 120, spreadBlend: 0.85, swell: 0.05 } ),
		swell: new WaveSystem( { scale: 0.48, windSpeed: 6, windDirection: 5, fetch: 1200, spreadBlend: 1.0, swell: 0.9, shortWavesFade: 0.1 } ),
	};
}

// Tidewater ui/AppUI.js sea-state presets, placed on our weather sea state (0 calm .. 1 storm): fair
// weather (0.45) is Tidewater's default "Breezy" sea
const SEA_PRESETS = [
	[ 0.2, { wind: 3.5, fetch: 40, chop: 0.75, swell: 0.28, surf: 0.18, period: 11, whitecaps: 0.2 } ],
	[ 0.45, { wind: 7, fetch: 120, chop: 0.9, swell: 0.48, surf: 0.34, period: 9, whitecaps: 0.5 } ],
	[ 0.7, { wind: 12, fetch: 300, chop: 1.05, swell: 0.68, surf: 0.56, period: 8.5, whitecaps: 0.75 } ],
	[ 1.0, { wind: 20, fetch: 900, chop: 1.2, swell: 1.0, surf: 0.9, period: 12, whitecaps: 1 } ],
];
export function seaPreset( sea ) {
	const P = SEA_PRESETS;
	if ( sea <= P[ 0 ][ 0 ] ) return { ...P[ 0 ][ 1 ] };
	for ( let i = 1; i < P.length; i ++ ) {
		if ( sea <= P[ i ][ 0 ] ) {
			const [ a, A ] = P[ i - 1 ], [ b, B ] = P[ i ];
			const t = ( sea - a ) / ( b - a ), o = {};
			for ( const k in A ) o[ k ] = A[ k ] + ( B[ k ] - A[ k ] ) * t;
			// fetch spans decades: interpolate it geometrically
			o.fetch = A.fetch * Math.pow( B.fetch / A.fetch, t );
			return o;
		}
	}
	return { ...P[ P.length - 1 ][ 1 ] };
}

// per-cascade band cuts and per-system constants (OceanFFT.js updateSpectrumUniforms 197-233)
export function spectrumParams( sizes, local, swell, depth = 500 ) {
	const C = sizes.length;
	const cuts = [];
	for ( let i = 0; i < C; i ++ ) {
		const low = i === 0 ? 0.0001 : ( TWO_PI / sizes[ i ] ) * 6;
		const high = i === C - 1 ? 9999 : ( TWO_PI / sizes[ i + 1 ] ) * 6;
		cuts.push( [ low, high ] );
	}
	const sysA = [], sysB = [];
	for ( const s of [ local, swell ] ) {
		const fetchM = Math.max( 1, s.fetch ) * 1000;
		const U = Math.max( 0.1, s.windSpeed );
		const alpha = 0.076 * Math.pow( GRAVITY * fetchM / ( U * U ), - 0.22 );
		const peakOmega = 22 * Math.pow( U * fetchM / ( GRAVITY * GRAVITY ), - 0.33 );
		sysA.push( [ s.scale, s.windDirection * Math.PI / 180, s.spreadBlend, s.swell ] );
		sysB.push( [ alpha, peakOmega, s.peakEnhancement, s.shortWavesFade ] );
	}
	return { sizes: sizes.slice(), cuts, sysA, sysB, depth };
}

// ---- spectrum (OceanFFT.js 243-292), f64 twin of the GLSL below

function dispersion( k, depth ) { return Math.sqrt( k * GRAVITY * Math.tanh( Math.min( k * depth, 20 ) ) ); }
function dispersionDerivative( k, depth ) {
	const kd = Math.min( k * depth, 20 );
	const th = Math.tanh( kd ), ch = Math.cosh( kd );
	return GRAVITY * ( depth * k / ( ch * ch ) + th ) / dispersion( k, depth ) * 0.5;
}
function tmaCorrection( omega, depth ) {
	const omegaH = omega * Math.sqrt( depth / GRAVITY );
	if ( omegaH <= 1 ) return omegaH * omegaH * 0.5;
	if ( omegaH < 2 ) return 1 - Math.pow( 2 - omegaH, 2 ) * 0.5;
	return 1;
}
function jonswap( omega, sA, sB, depth ) {
	const alpha = sB[ 0 ], peakOmega = sB[ 1 ], gamma = sB[ 2 ];
	const sigma = omega <= peakOmega ? 0.07 : 0.09;
	const d = omega - peakOmega;
	const r = Math.exp( - d * d / ( sigma * sigma * peakOmega * peakOmega * 2 ) );
	const inv = 1 / omega;
	const po = peakOmega * inv;
	return sA[ 0 ] * tmaCorrection( omega, depth ) * alpha * ( GRAVITY * GRAVITY ) * Math.pow( inv, 5 ) * Math.exp( Math.pow( po, 4 ) * - 1.25 ) * Math.pow( Math.abs( gamma ), r );
}
function normalisationFactor( s ) {
	const s2 = s * s, s3 = s2 * s, s4 = s3 * s;
	if ( s < 5 ) return s4 * - 0.000564 + s3 * 0.00776 - s2 * 0.044 + s * 0.192 + 0.163;
	return s4 * - 4.80e-08 + s3 * 1.07e-05 - s2 * 9.53e-04 + s * 5.90e-02 + 3.93e-01;
}
function directionSpectrum( theta, omega, sA, sB ) {
	const peakOmega = sB[ 1 ];
	const ratio = omega / peakOmega;
	const spreadPower = omega > peakOmega ? Math.pow( Math.abs( ratio ), - 2.5 ) * 9.77 : Math.pow( Math.abs( ratio ), 5 ) * 6.97;
	const s = spreadPower + Math.tanh( Math.min( ratio, 20 ) ) * 16 * sA[ 3 ] * sA[ 3 ];
	const dTheta = theta - sA[ 1 ];
	const cos2s = normalisationFactor( s ) * Math.pow( Math.abs( Math.cos( dTheta * 0.5 ) ), s * 2 );
	const cosT = Math.cos( dTheta );
	const base = cosT * cosT * ( 2 / Math.PI ) * ( cosT > 0 ? 1 : 0 );
	return base + ( cos2s - base ) * sA[ 2 ];
}
function shortWavesFade( k, sB ) { return Math.exp( - sB[ 3 ] * sB[ 3 ] * k * k ); }

// PCG hash (u32) and its unit mapping (OceanFFT.js fftPcg / fftToUnit)
function pcg( v ) {
	const state = ( Math.imul( v >>> 0, 747796405 ) + 2891336453 ) >>> 0;
	const word = Math.imul( ( ( state >>> ( ( state >>> 28 ) + 4 ) ) ^ state ) >>> 0, 277803737 ) >>> 0;
	return ( ( word >>> 22 ) ^ word ) >>> 0;
}
function toUnit( h ) { return ( h >>> 8 ) * ( 1 / 16777216 ) + ( 0.5 / 16777216 ); }

// h0 of the GPU mode (x, y) of cascade c (x, y in 0..255): [ re, im ] (the init spectrum kernel, 303-346)
export function h0At( P, c, x, y, seed = OCEAN_SEED ) {
	const N = FFT_SIZE, HALF = N / 2;
	const L = P.sizes[ c ];
	const dk = TWO_PI / L;
	const kx = ( x - HALF ) * dk, kz = ( y - HALF ) * dk;
	const kLen = Math.hypot( kx, kz );
	if ( ! ( kLen >= P.cuts[ c ][ 0 ] && kLen <= P.cuts[ c ][ 1 ] ) ) return null;
	const omega = dispersion( kLen, P.depth );
	const dOmega = dispersionDerivative( kLen, P.depth );
	const theta = Math.atan2( kz, kx );
	const [ sa0, sa1 ] = P.sysA, [ sb0, sb1 ] = P.sysB;
	const S0 = jonswap( omega, sa0, sb0, P.depth ) * directionSpectrum( theta, omega, sa0, sb0 ) * shortWavesFade( kLen, sb0 );
	const S1 = jonswap( omega, sa1, sb1, P.depth ) * directionSpectrum( theta, omega, sa1, sb1 ) * shortWavesFade( kLen, sb1 );
	const S = Math.max( S0 + S1, 0 );
	// E|h0|^2 = S(k) dk^2 / 2 so that var(height) = sum S(k) dk^2 (h has both +k and -k terms)
	const amp = Math.sqrt( S * Math.abs( dOmega ) / kLen * dk * dk ) * 0.5;
	const idx = c * N * N + y * N + x;
	const s = ( Math.imul( idx, 4 ) + Math.imul( seed, 7919 ) ) >>> 0;
	const u1 = toUnit( pcg( s ) ), u2 = toUnit( pcg( ( s + 1 ) >>> 0 ) );
	const r = Math.sqrt( Math.log( u1 ) * - 2 );
	return [ r * Math.cos( u2 * TWO_PI ) * amp, r * Math.sin( u2 * TWO_PI ) * amp, omega ];
}

// ---- GLSL of the spectrum (the init pass of OceanFFT.js); needs uniforms uSizes[4], uCuts[4], uSysA[2],
// uSysB[2], uDepth, uSeed
export const SPECTRUM_GLSL = /* glsl */`
	#define FFT_G ${ GRAVITY.toFixed( 2 ) }
	#define PI 3.141592653589793
	#define TWO_PI 6.283185307179586
	float dispersion( float k ) { return sqrt( k * FFT_G * tanh( min( k * uDepth, 20.0 ) ) ); }
	float dispersionDerivative( float k ) {
		float kd = min( k * uDepth, 20.0 );
		float th = tanh( kd );
		float ch = cosh( kd );
		return FFT_G * ( uDepth * k / ( ch * ch ) + th ) / dispersion( k ) * 0.5;
	}
	float tmaCorrection( float omega ) {
		float omegaH = omega * sqrt( uDepth / FFT_G );
		float a = omegaH * omegaH * 0.5;
		float b = 1.0 - pow( 2.0 - omegaH, 2.0 ) * 0.5;
		return omegaH <= 1.0 ? a : ( omegaH < 2.0 ? b : 1.0 );
	}
	float jonswap( float omega, vec4 sysA, vec4 sysB ) {
		float alpha = sysB.x; float peakOmega = sysB.y; float gamma = sysB.z;
		float sigma = omega <= peakOmega ? 0.07 : 0.09;
		float d = omega - peakOmega;
		float r = exp( - d * d / ( sigma * sigma * peakOmega * peakOmega * 2.0 ) );
		float inv = 1.0 / omega;
		float po = peakOmega * inv;
		return sysA.x * tmaCorrection( omega ) * alpha * ( FFT_G * FFT_G ) * pow( inv, 5.0 ) * exp( pow( po, 4.0 ) * -1.25 ) * pow( abs( gamma ), r );
	}
	float normalisationFactor( float s ) {
		float s2 = s * s; float s3 = s2 * s; float s4 = s3 * s;
		float lo = s4 * -0.000564 + s3 * 0.00776 - s2 * 0.044 + s * 0.192 + 0.163;
		float hi = s4 * -4.80e-08 + s3 * 1.07e-05 - s2 * 9.53e-04 + s * 5.90e-02 + 3.93e-01;
		return s < 5.0 ? lo : hi;
	}
	float directionSpectrum( float theta, float omega, vec4 sysA, vec4 sysB ) {
		float peakOmega = sysB.y;
		float ratio = omega / peakOmega;
		float spreadPower = omega > peakOmega ? pow( abs( ratio ), -2.5 ) * 9.77 : pow( abs( ratio ), 5.0 ) * 6.97;
		float s = spreadPower + tanh( min( ratio, 20.0 ) ) * 16.0 * sysA.w * sysA.w;
		float dTheta = theta - sysA.y;
		float cos2s = normalisationFactor( s ) * pow( abs( cos( dTheta * 0.5 ) ), s * 2.0 );
		float cosT = cos( dTheta );
		float base = cosT * cosT * ( 2.0 / PI ) * ( cosT > 0.0 ? 1.0 : 0.0 );
		return mix( base, cos2s, sysA.z );
	}
	float shortWavesFade( float k, vec4 sysB ) { return exp( - sysB.w * sysB.w * k * k ); }
	uint fftPcg( uint v ) {
		uint state = v * 747796405u + 2891336453u;
		uint word = ( ( state >> ( ( state >> 28u ) + 4u ) ) ^ state ) * 277803737u;
		return ( word >> 22u ) ^ word;
	}
	float fftToUnit( uint h ) { return float( h >> 8u ) * ( 1.0 / 16777216.0 ) + ( 0.5 / 16777216.0 ); }
`;

// ---- CPU twin ---------------------------------------------------------------------------------------

// in-place radix-2 inverse FFT (e^{+i}) of the n contiguous complex values re / im[ o .. o + n - 1 ]
function makeFFT( n ) {
	const bits = Math.log2( n );
	const rev = new Uint16Array( n );
	for ( let i = 0; i < n; i ++ ) { let r = 0; for ( let b = 0; b < bits; b ++ ) r |= ( ( i >> b ) & 1 ) << ( bits - 1 - b ); rev[ i ] = r; }
	// twiddles of stage half at [ half + p ]: e^{ i pi p / half }
	const wr = new Float64Array( n ), wi = new Float64Array( n );
	for ( let half = 1; half < n; half <<= 1 ) for ( let p = 0; p < half; p ++ ) { wr[ half + p ] = Math.cos( Math.PI * p / half ); wi[ half + p ] = Math.sin( Math.PI * p / half ); }
	return function ifft( tr, ti, o ) {
		for ( let k = 0; k < n; k ++ ) {
			const r = rev[ k ];
			if ( r > k ) { const a = o + k, b = o + r; let t = tr[ a ]; tr[ a ] = tr[ b ]; tr[ b ] = t; t = ti[ a ]; ti[ a ] = ti[ b ]; ti[ b ] = t; }
		}
		for ( let half = 1; half < n; half <<= 1 ) {
			const step = half << 1;
			for ( let p = 0; p < half; p ++ ) {
				const cr = wr[ half + p ], ci = wi[ half + p ];
				for ( let a = o + p; a < o + n; a += step ) {
					const b = a + half;
					const xr = tr[ b ], xi = ti[ b ];
					const br = xr * cr - xi * ci, bi = xr * ci + xi * cr;
					const ar = tr[ a ], ai = ti[ a ];
					tr[ b ] = ar - br; ti[ b ] = ai - bi;
					tr[ a ] = ar + br; ti[ a ] = ai + bi;
				}
			}
		}
	};
}
function transpose( a, n ) {
	for ( let y = 0; y < n; y ++ ) for ( let x = y + 1; x < n; x ++ ) { const i = y * n + x, j = x * n + y; const t = a[ i ]; a[ i ] = a[ j ]; a[ j ] = t; }
}

// the modes of GPU cascade c with |frequency index| < n / 2 (all of its band) on an n x n spectrum:
// h0( k ), conj( h0( -k ) ) (the conjugate pass) and kx / k, kz / k, omega
function cascadeSpectrum( P, c, n ) {
	const h = n / 2, G = FFT_SIZE / 2, N = n * n;
	const raw = new Float64Array( N * 2 ), omega = new Float64Array( N );
	for ( let y = 0; y < n; y ++ ) for ( let x = 0; x < n; x ++ ) {
		const r = h0At( P, c, x - h + G, y - h + G );
		if ( ! r ) continue;
		const k = y * n + x;
		raw[ k * 2 ] = r[ 0 ]; raw[ k * 2 + 1 ] = r[ 1 ]; omega[ k ] = r[ 2 ];
	}
	const L = P.sizes[ c ], dk = TWO_PI / L;
	const idx = [], data = [];
	for ( let y = 0; y < n; y ++ ) for ( let x = 0; x < n; x ++ ) {
		const k = y * n + x, km = ( ( n - y ) % n ) * n + ( n - x ) % n;
		if ( ! ( omega[ k ] > 0 ) ) continue;
		const kx = ( x - h ) * dk, kz = ( y - h ) * dk, ik = 1 / Math.hypot( kx, kz );
		idx.push( k );
		data.push( raw[ k * 2 ], raw[ k * 2 + 1 ], raw[ km * 2 ], - raw[ km * 2 + 1 ], kx * ik, kz * ik, omega[ k ] );
	}
	const rowOn = new Uint8Array( n );
	for ( const k of idx ) rowOn[ ( k / n ) | 0 ] = 1;
	const rows = [];
	for ( let y = 0; y < n; y ++ ) if ( rowOn[ y ] ) rows.push( y );
	return { c, n, L, idx: Int32Array.from( idx ), data: Float64Array.from( data ), rows: Int32Array.from( rows ) };
}

// time evolution of one mode (OceanFFT.js 422-451): out = [ Dx+iDz re, im, Dy re, im, dDy/dt re, im ]
const _m = new Float64Array( 6 );
function evolve( d, j, t ) {
	const o = j * 7;
	const ph = d[ o + 6 ] * t, cs = Math.cos( ph ), sn = Math.sin( ph );
	// A = h0 e^{ i w t }, B = conj( h0( -k ) ) e^{ -i w t }, h = A + B
	const ar = d[ o ] * cs - d[ o + 1 ] * sn, ai = d[ o ] * sn + d[ o + 1 ] * cs;
	const br = d[ o + 2 ] * cs + d[ o + 3 ] * sn, bi = d[ o + 3 ] * cs - d[ o + 2 ] * sn;
	const hr = ar + br, hi = ai + bi;
	const fx = d[ o + 4 ], fz = d[ o + 5 ], w = d[ o + 6 ];
	_m[ 0 ] = - ( fx * hi + fz * hr ); _m[ 1 ] = fx * hr - fz * hi;
	_m[ 2 ] = hr; _m[ 3 ] = hi;
	// dh/dt = i w ( A - B )
	_m[ 4 ] = - w * ( ai - bi ); _m[ 5 ] = w * ( ar - br );
	return _m;
}

// Catmull-Rom weights
function crw( t, w ) {
	const t2 = t * t, t3 = t2 * t;
	w[ 0 ] = - 0.5 * t3 + t2 - 0.5 * t;
	w[ 1 ] = 1.5 * t3 - 2.5 * t2 + 1;
	w[ 2 ] = - 1.5 * t3 + 2 * t2 + 0.5 * t;
	w[ 3 ] = 0.5 * t3 - 0.5 * t2;
}
const _wx = new Float64Array( 4 ), _wz = new Float64Array( 4 );

// Displacement grids of the CPU cascades at one time: Float32 ( Dx, Dy, Dz, dDy/dt ) interleaved per
// texel, one array per cascade (transferable between a worker and the main thread)
export const CPU_LAYOUT = [ [ 0, 128 ], [ 1, 128 ], [ 2, 64 ] ];

export class OceanCPU {
	constructor( layout = CPU_LAYOUT ) {
		this.layout = layout;
		this.spec = null;
		this.ffts = {};
		for ( const [ , n ] of layout ) this.ffts[ n ] ??= makeFFT( n );
		this.work = {};
	}

	setSpectrum( P ) {
		this.spec = this.layout.map( ( [ c, n ] ) => cascadeSpectrum( P, c, n ) );
	}

	// the grids at time t (choppiness scales the horizontal displacement). Two real fields share one
	// complex IFFT: ( Dx + i Dz ), ( Dy + i dDy/dt ) at 128^2; ( Dx + i Dz ) per 64^2 cascade and
	// ( Dy1 + i Dy2 ), ( dDy1/dt + i dDy2/dt ) for the pair
	compute( t, choppiness, out = null ) {
		out ??= this.spec.map( ( s ) => new Float32Array( s.n * s.n * 4 ) );
		// group the cascades by grid size (pairs of equal size share the height FFTs)
		const bySize = {};
		this.spec.forEach( ( s, i ) => ( bySize[ s.n ] ??= [] ).push( i ) );
		for ( const key in bySize ) {
			const n = + key, list = bySize[ key ], N = n * n, ifft = this.ffts[ n ];
			const W = this.work[ n ] ??= { re: [], im: [] };
			const nf = list.length + Math.ceil( list.length / 2 ) * 2;
			while ( W.re.length < nf ) { W.re.push( new Float64Array( N ) ); W.im.push( new Float64Array( N ) ); }
			for ( let f = 0; f < nf; f ++ ) { W.re[ f ].fill( 0 ); W.im[ f ].fill( 0 ); }
			const rowSet = new Set();
			list.forEach( ( si, li ) => {
				const s = this.spec[ si ];
				const fA = li, pair = list.length + ( li >> 1 ) * 2, second = li & 1;
				const reA = W.re[ fA ], imA = W.im[ fA ];
				const reH = W.re[ pair ], imH = W.im[ pair ], reV = W.re[ pair + 1 ], imV = W.im[ pair + 1 ];
				const single = list.length === 1;
				for ( let j = 0; j < s.idx.length; j ++ ) {
					const k = s.idx[ j ];
					const m = evolve( s.data, j, t );
					reA[ k ] = m[ 0 ]; imA[ k ] = m[ 1 ];
					if ( single ) {
						// Dy + i dDy/dt
						reH[ k ] = m[ 2 ] - m[ 5 ]; imH[ k ] = m[ 3 ] + m[ 4 ];
					} else if ( ! second ) {
						reH[ k ] += m[ 2 ]; imH[ k ] += m[ 3 ];
						reV[ k ] += m[ 4 ]; imV[ k ] += m[ 5 ];
					} else {
						// the second cascade of the pair rides in the imaginary part: + i F
						reH[ k ] -= m[ 3 ]; imH[ k ] += m[ 2 ];
						reV[ k ] -= m[ 5 ]; imV[ k ] += m[ 4 ];
					}
				}
				for ( const r of s.rows ) rowSet.add( r );
			} );
			const nUsed = list.length === 1 ? 2 : nf;
			for ( let f = 0; f < nUsed; f ++ ) {
				const re = W.re[ f ], im = W.im[ f ];
				// rows (only those holding modes), then the columns as rows of the transpose
				for ( const r of rowSet ) ifft( re, im, r * n );
				transpose( re, n ); transpose( im, n );
				for ( let x = 0; x < n; x ++ ) ifft( re, im, x * n );
				transpose( re, n ); transpose( im, n );
			}
			list.forEach( ( si, li ) => {
				const g = out[ si ], chop = choppiness;
				const A = li, pair = list.length + ( li >> 1 ) * 2, second = li & 1, single = list.length === 1;
				const reA = W.re[ A ], imA = W.im[ A ], reH = W.re[ pair ], imH = W.im[ pair ], reV = W.re[ pair + 1 ], imV = W.im[ pair + 1 ];
				for ( let y = 0; y < n; y ++ ) for ( let x = 0; x < n; x ++ ) {
					const k = y * n + x, sg = ( ( x + y ) & 1 ) === 0 ? 1 : - 1, o = k * 4;
					g[ o ] = reA[ k ] * sg * chop; g[ o + 2 ] = imA[ k ] * sg * chop;
					if ( single ) { g[ o + 1 ] = reH[ k ] * sg; g[ o + 3 ] = imH[ k ] * sg; } else if ( ! second ) { g[ o + 1 ] = reH[ k ] * sg; g[ o + 3 ] = reV[ k ] * sg; } else { g[ o + 1 ] = imH[ k ] * sg; g[ o + 3 ] = imV[ k ] * sg; }
				}
			} );
		}
		return out;
	}
}

// Sampling of the grids ( see OceanCPU.compute ) like the GPU texture: the value of texel i sits at its
// centre ( i + 0.5 ) / gpuN of the tile (a half-texel shift of the field). att[ c ]: per-cascade weight;
// dt: extrapolation of the height by dDy/dt (the grids' age). Catmull-Rom on the band-limited grids.
export function sampleGrids( layout, sizes, grids, x, z, att, dt, out, gpuN = FFT_SIZE ) {
	out[ 0 ] = 0; out[ 1 ] = 0; out[ 2 ] = 0;
	for ( let i = 0; i < layout.length; i ++ ) {
		const [ c, n ] = layout[ i ];
		const a = att ? att[ c ] : 1;
		if ( a <= 0 ) continue;
		const L = sizes[ c ], g = grids[ i ];
		const sh = L / ( 2 * gpuN );
		const fx = ( x - sh ) / L * n, fz = ( z - sh ) / L * n;
		const ix = Math.floor( fx ), iz = Math.floor( fz );
		crw( fx - ix, _wx ); crw( fz - iz, _wz );
		let sx = 0, sy = 0, sz = 0, sv = 0;
		const m = n - 1;
		for ( let b = 0; b < 4; b ++ ) {
			const row = ( ( iz + b - 1 ) & m ) * n;
			const wzb = _wz[ b ];
			for ( let q = 0; q < 4; q ++ ) {
				const o = ( row + ( ( ix + q - 1 ) & m ) ) * 4;
				const w = _wx[ q ] * wzb;
				sx += g[ o ] * w; sy += g[ o + 1 ] * w; sz += g[ o + 2 ] * w; sv += g[ o + 3 ] * w;
			}
		}
		out[ 0 ] += sx * a; out[ 1 ] += ( sy + sv * dt ) * a; out[ 2 ] += sz * a;
	}
	return out;
}
