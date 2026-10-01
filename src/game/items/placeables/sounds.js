// Procedural sounds for placed things, rendered on first use into the audio engine's buffer map (as items/sounds.js
// does): alarm_ring (loop), radio_loop (loop: a station playing slack-key through static), trap_snap, dig, nail.
const TAU = Math.PI * 2;

function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296 * 2 - 1; };
}
function lowpass( a, sr, f ) { const k = 1 - Math.exp( - TAU * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] = y; } }
function highpass( a, sr, f ) { const k = 1 - Math.exp( - TAU * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] -= y; } }
function normalize( a, peak = 0.9 ) { let m = 0; for ( const v of a ) m = Math.max( m, Math.abs( v ) ); if ( m > 0 ) for ( let i = 0; i < a.length; i ++ ) a[ i ] *= peak / m; }
// a struck metal: inharmonic partials decaying at their own rates
function strike( a, sr, t, amp, partials ) {
	const s = Math.floor( t * sr );
	for ( const [ f, k, d ] of partials ) {
		const n = Math.min( a.length - s, Math.floor( d * 5 * sr ) );
		for ( let i = 0; i < n; i ++ ) a[ s + i ] += amp * k * Math.sin( TAU * f * i / sr ) * Math.exp( - i / sr / d );
	}
}
// Karplus-Strong pluck
function pluck( a, sr, t, f, amp, seed ) {
	const r = rng( seed ), N = Math.max( 2, Math.round( sr / f ) ), buf = new Float32Array( N );
	for ( let i = 0; i < N; i ++ ) buf[ i ] = r();
	const s = Math.floor( t * sr ), n = Math.min( a.length - s, Math.floor( 2.5 * sr ) );
	for ( let i = 0, j = 0; i < n; i ++, j = ( j + 1 ) % N ) {
		const v = buf[ j ];
		buf[ j ] = ( buf[ j ] + buf[ ( j + 1 ) % N ] ) * 0.497;
		a[ s + i ] += v * amp;
	}
}

const GEN = {
	// a twin-bell wind-up clock: the hammer rattles between the bells ~18 times a second, in bursts
	alarm_ring( sr ) {
		const T = 1.2, a = new Float32Array( Math.floor( T * sr ) );
		const bellA = [ [ 2350, 1, 0.05 ], [ 3720, 0.5, 0.03 ], [ 5480, 0.3, 0.02 ] ], bellB = [ [ 2610, 1, 0.05 ], [ 4050, 0.45, 0.03 ], [ 6020, 0.25, 0.02 ] ];
		for ( let t = 0, k = 0; t < 0.85; t += 1 / 18, k ++ ) strike( a, sr, t, 0.5 + ( k % 3 ) * 0.08, k % 2 ? bellA : bellB );
		normalize( a, 0.85 );
		return a;
	},
	// a few bars of slack-key guitar, band-limited like a small speaker, under hiss
	radio_loop( sr ) {
		const T = 6.4, n = Math.floor( T * sr ), a = new Float32Array( n );
		const notes = [ 196, 247, 294, 392, 330, 294, 247, 294, 220, 262, 330, 440, 392, 330, 294, 247 ];
		for ( let i = 0; i < 16; i ++ ) pluck( a, sr, i * 0.4, notes[ i ], 0.5, 31 + i );
		for ( let i = 0; i < 4; i ++ ) pluck( a, sr, i * 1.6, [ 98, 110, 131, 98 ][ i ], 0.45, 91 + i );
		highpass( a, sr, 320 ); lowpass( a, sr, 2800 );
		const r = rng( 7 );
		for ( let i = 0; i < n; i ++ ) a[ i ] = a[ i ] * ( 0.9 + 0.1 * Math.sin( i / sr * 3 ) ) + r() * 0.05;
		// seamless loop: fade the tail into the head
		const f = Math.floor( 0.3 * sr );
		for ( let i = 0; i < f; i ++ ) { const k = i / f; a[ i ] = a[ i ] * k + a[ n - f + i ] * ( 1 - k ); }
		const out = a.subarray( 0, n - f );
		normalize( out, 0.7 );
		return out;
	},
	trap_snap( sr ) {
		const a = new Float32Array( Math.floor( 0.7 * sr ) ), r = rng( 5 );
		for ( let i = 0; i < 0.012 * sr; i ++ ) a[ i ] = r() * ( 1 - i / ( 0.012 * sr ) );
		strike( a, sr, 0.002, 0.9, [ [ 1720, 1, 0.08 ], [ 2930, 0.6, 0.05 ], [ 4410, 0.4, 0.03 ], [ 760, 0.5, 0.06 ] ] );
		strike( a, sr, 0.05, 0.3, [ [ 1720, 1, 0.05 ], [ 2930, 0.5, 0.03 ] ] );
		normalize( a, 0.95 );
		return a;
	},
	// a shovel biting into soil and the spoil thrown aside
	dig( sr ) {
		const n = Math.floor( 1.3 * sr ), a = new Float32Array( n ), r = rng( 17 );
		for ( const [ t0, len, amp ] of [ [ 0.02, 0.18, 1 ], [ 0.5, 0.35, 0.6 ], [ 0.95, 0.25, 0.4 ] ] ) {
			const s = Math.floor( t0 * sr ), m = Math.floor( len * sr );
			for ( let i = 0; i < m && s + i < n; i ++ ) a[ s + i ] += r() * amp * Math.exp( - i / m * 3 ) * ( i < 200 ? i / 200 : 1 );
		}
		lowpass( a, sr, 1400 ); lowpass( a, sr, 2400 );
		normalize( a, 0.8 );
		return a;
	},
	// hammering a nail home: three blows rising in pitch as it goes in
	nail( sr ) {
		const a = new Float32Array( Math.floor( 1.2 * sr ) );
		[ 0, 0.36, 0.72 ].forEach( ( t, k ) => strike( a, sr, t, 1, [ [ 880 + k * 160, 0.6, 0.02 ], [ 2400 + k * 300, 0.5, 0.012 ], [ 210, 0.8, 0.03 ] ] ) );
		normalize( a, 0.85 );
		return a;
	},
};

export const PLACE_SOUNDS = Object.keys( GEN );

export function ensureSound( audio, name ) {
	if ( ! audio?.ctx || ! GEN[ name ] ) return false;
	if ( audio.buffers.has( name ) ) return true;
	const sr = audio.ctx.sampleRate, data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data instanceof Float32Array ? data : new Float32Array( data ), 0 );
	audio.buffers.set( name, buf );
	return true;
}
