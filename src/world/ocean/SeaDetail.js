// Ported from Tidewater src/ocean/SeaDetail.js (MIT, see LICENSE-Tidewater.txt)
// Large-scale variation of the sea surface in world space (never repeats with the FFT tiles):
//  - gusts ("cat's paws"): patches of rougher water drifting downwind. Rough water reflects less of the
//    bright horizon sky, so from a low viewpoint gusts read as irregular dark patches.
//  - slicks: long calm bands along the wind (surfactant films) where capillary waves are damped;
//    mirror-like and bright, mostly in light to moderate wind.
//  - windrows: thin wavy foam lines along the wind in fresh wind (Langmuir circulation).
// GLSL (SEA_DETAIL_GLSL): SeaDetailSample seaDetailSample( vec2 xz ) -> rough (short-wave slope
// multiplier), gust 0..1, slick 0..1, streak 0..1. Needs uTime, uPatterns (the pattern array, layer 2 holds
// the noise: FoamTexture.js), uSeaDetailOffset, uSeaWindDir, uSeaWindSpeed.
import * as THREE from 'three';

export const SEA_DETAIL_GLSL = /* glsl */`
	uniform vec2 uSeaDetailOffset; uniform vec2 uSeaWindDir; uniform float uSeaWindSpeed;
	uniform vec3 uSeaDetailAmt; // gust, slick, streak amounts
	struct SeaDetailSample { float rough; float gust; float slick; float streak; };
	// hardware bilinear, repeat-wrapped, level 0 (the noise is smooth and low frequency)
	vec4 seaDetailLoad( vec2 uv ) { return textureLod( uPatterns, vec3( uv, 2.0 ), 0.0 ); }
	SeaDetailSample seaDetailSample( vec2 xz ) {
		vec2 p = xz - uSeaDetailOffset;
		// gusts: two octaves (~600 m and ~230 m features), the second slowly morphing
		float g1 = seaDetailLoad( p / 620.0 ).x;
		float g2 = seaDetailLoad( p / 230.0 + vec2( uTime * 0.0009, 0.37 ) ).y;
		float gustRaw = g1 * 0.62 + g2 * 0.38;
		float gust = clamp( ( gustRaw - 0.5 ) * 2.4 * uSeaDetailAmt.x + 0.5, 0.0, 1.0 );
		// wind-aligned frame, lightly domain-warped so bands meander
		vec2 w = uSeaWindDir;
		float along = dot( xz, w );
		float across = dot( xz, vec2( - w.y, w.x ) ) + ( g2 - 0.5 ) * 26.0;
		// slicks: long bands, strongest in light wind, torn apart by gusts
		float sl = seaDetailLoad( vec2( along / 1100.0, across / 70.0 ) ).z;
		float calmWind = smoothstep( 13.0, 4.0, uSeaWindSpeed );
		float slick = smoothstep( 0.64, 0.76, sl ) * ( 1.0 - gust * 0.8 ) * calmWind * uSeaDetailAmt.y;
		// windrows: thin foam lines ~10 m apart that come and go along their length
		float st = seaDetailLoad( vec2( along / 380.0, across / 11.0 ) + vec2( 0.13, 0.71 ) ).w;
		float breakUp = seaDetailLoad( vec2( along / 140.0, across / 40.0 ) + vec2( 0.51, 0.29 ) ).x;
		float freshWind = smoothstep( 6.0, 12.0, uSeaWindSpeed );
		float streak = smoothstep( 0.68, 0.82, st ) * smoothstep( 0.4, 0.62, breakUp ) * freshWind * uSeaDetailAmt.z;
		// windrows show mostly as smooth lanes (surfactant and debris collect in the convergence lines and
		// damp the ripples), with only a trace of foam
		float rough = mix( 0.5, 1.5, gust ) * ( 1.0 - slick * 0.8 ) * ( 1.0 - streak / max( uSeaDetailAmt.z, 1e-3 ) * 0.45 );
		SeaDetailSample s;
		s.rough = rough; s.gust = gust; s.slick = slick; s.streak = streak;
		return s;
	}
`;

// Tidewater src/util/Noise.js mulberry32
function mulberry32( seed ) {
	let a = seed >>> 0;
	return function () {
		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

// Tileable smooth fbm in 4 channels (different seeds / base frequencies), RGBA8 (the pattern array)
export function makeSeaDetailData( size = 256 ) {
	const data = new Uint8Array( size * size * 4 );
	const channels = [ { seed: 11, freq: 4, oct: 4 }, { seed: 23, freq: 5, oct: 4 }, { seed: 37, freq: 4, oct: 3 }, { seed: 53, freq: 6, oct: 3 } ];
	for ( let c = 0; c < 4; c ++ ) {
		const { seed, freq, oct } = channels[ c ];
		const rand = mulberry32( seed );
		// gradient tables per octave (periodic lattice)
		const tables = [];
		for ( let o = 0; o < oct; o ++ ) {
			const n = freq << o;
			const g = new Float32Array( n * n * 2 );
			for ( let i = 0; i < n * n; i ++ ) { const a = rand() * Math.PI * 2; g[ i * 2 ] = Math.cos( a ); g[ i * 2 + 1 ] = Math.sin( a ); }
			tables.push( { n, g } );
		}
		let mn = Infinity, mx = - Infinity;
		const vals = new Float32Array( size * size );
		for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {
			let v = 0, amp = 1, norm = 0;
			for ( let o = 0; o < oct; o ++ ) {
				const { n, g } = tables[ o ];
				const fx = x / size * n, fy = y / size * n;
				const xi = Math.floor( fx ), yi = Math.floor( fy );
				const xf = fx - xi, yf = fy - yi;
				const grad = ( ix, iy, dx, dy ) => { const k = ( ( ( iy % n ) + n ) % n ) * n + ( ( ( ix % n ) + n ) % n ); return g[ k * 2 ] * dx + g[ k * 2 + 1 ] * dy; };
				const u = xf * xf * xf * ( xf * ( xf * 6 - 15 ) + 10 );
				const w = yf * yf * yf * ( yf * ( yf * 6 - 15 ) + 10 );
				const a0 = grad( xi, yi, xf, yf ), a1 = grad( xi + 1, yi, xf - 1, yf );
				const b0 = grad( xi, yi + 1, xf, yf - 1 ), b1 = grad( xi + 1, yi + 1, xf - 1, yf - 1 );
				const nv = ( a0 + ( a1 - a0 ) * u ) + ( ( b0 + ( b1 - b0 ) * u ) - ( a0 + ( a1 - a0 ) * u ) ) * w;
				v += nv * amp;
				norm += amp;
				amp *= 0.5;
			}
			v /= norm;
			vals[ y * size + x ] = v;
			mn = Math.min( mn, v ); mx = Math.max( mx, v );
		}
		for ( let i = 0; i < size * size; i ++ ) data[ i * 4 + c ] = Math.round( ( vals[ i ] - mn ) / ( mx - mn ) * 255 );
	}
	return data;
}

export class SeaDetail {
	constructor() {
		this.size = 256;
		this.data = makeSeaDetailData( this.size );
		this.offset = new THREE.Vector2(); // accumulated wind drift (m)
		this.amount = new THREE.Vector3( 1, 1, 0.3 ); // gust, slick, streak
	}

	// gust patterns travel with the wind at roughly its speed near the surface
	update( dt, windDir, windSpeed ) {
		const s = windSpeed * 0.7 * dt;
		this.offset.x += windDir.x * s;
		this.offset.y += windDir.y * s;
	}
}
