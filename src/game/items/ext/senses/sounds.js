// Procedural sounds for the senses equipment, rendered on first use into the audio engine's buffers (audio.buffers.set)
// so game.audio.play / loop find them by name: a gas detector's chirp, a wireless chime, a night-vision tube's power-up
// whine and a Gen-1's inverter hum (loop), a regulator's inhale and the exhale's bubbles, a watch's buzz, a weather
// radio's alert tone, a breath inside a rubber mask, a compressor filling a tank (loop).
//   ensureSensesSound( audio, name ) -> bool, playSensesSound( game, name, opts ), SENSES_SOUNDS
// Node-safe: nothing runs without an AudioContext.

function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296 * 2 - 1; };
}
function lowpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] = y; } }
function highpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] -= y; } }
function normalize( a, peak = 0.8 ) { let m = 0; for ( const v of a ) m = Math.max( m, Math.abs( v ) ); if ( m > 0 ) for ( let i = 0; i < a.length; i ++ ) a[ i ] *= peak / m; }
function noise( n, seed ) { const r = rng( seed ), a = new Float32Array( n ); for ( let i = 0; i < n; i ++ ) a[ i ] = r(); return a; }
function env( a, sr, attack, release ) {
	const T = a.length / sr;
	for ( let i = 0; i < a.length; i ++ ) { const t = i / sr; a[ i ] *= Math.min( 1, t / Math.max( 1e-4, attack ) ) * Math.min( 1, Math.max( 0, ( T - t ) / Math.max( 1e-4, release ) ) ); }
}
function loopable( a, sr, fade = 0.15 ) {
	const n = Math.floor( fade * sr ), L = a.length - n;
	for ( let i = 0; i < n; i ++ ) { const k = i / n; a[ i ] = a[ i ] * k + a[ L + i ] * ( 1 - k ); }
	return a.slice( 0, L );
}
function tone( a, sr, t0, dur, f, amp, decay = 0 ) {
	const s = Math.floor( t0 * sr ), n = Math.floor( dur * sr );
	for ( let i = 0; i < n && s + i < a.length; i ++ ) {
		const t = i / sr, e = Math.min( 1, t / 0.004 ) * Math.min( 1, ( dur - t ) / 0.01 ) * ( decay ? Math.exp( - t / decay ) : 1 );
		a[ s + i ] += Math.sin( 2 * Math.PI * f * t ) * amp * e;
	}
}
const TAU = Math.PI * 2;

const GEN = {
	// a single-gas detector's alarm chirp: a hard piezo square-ish tone
	senses_beep( sr ) {
		const n = Math.floor( 0.09 * sr ), a = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr, s = Math.sin( TAU * 3150 * t ); a[ i ] = Math.sign( s ) * Math.min( 1, Math.abs( s ) * 3 ) * 0.7; }
		env( a, sr, 0.002, 0.008 ); lowpass( a, sr, 7000 ); normalize( a, 0.42 ); return a;
	},
	// a wireless door chime: ding-dong
	senses_chime( sr ) {
		const n = Math.floor( 1.5 * sr ), a = new Float32Array( n );
		for ( const [ t0, f ] of [ [ 0, 784 ], [ 0.42, 622 ] ] ) { tone( a, sr, t0, 1.05, f, 0.6, 0.45 ); tone( a, sr, t0, 1.05, f * 2.01, 0.18, 0.2 ); tone( a, sr, t0, 1.05, f * 3.02, 0.06, 0.12 ); }
		normalize( a, 0.55 ); return a;
	},
	// a night-vision tube's power supply coming up: a rising whine that settles
	senses_nv_on( sr ) {
		const T = 0.75, n = Math.floor( T * sr ), a = new Float32Array( n );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) { const t = i / sr, f = 6000 + 9000 * Math.min( 1, t / 0.5 ); ph += f / sr; a[ i ] = Math.sin( TAU * ph ) * 0.25 * Math.min( 1, t / 0.05 ) * ( t < 0.55 ? 1 : Math.max( 0, 1 - ( t - 0.55 ) / 0.2 ) ); }
		const c = noise( Math.floor( 0.012 * sr ), 5 ); for ( let i = 0; i < c.length; i ++ ) a[ i ] += c[ i ] * 0.6 * Math.exp( - i / sr / 0.003 );
		normalize( a, 0.3 ); return a;
	},
	// a Gen-1 tube's inverter: a faint high hum (loop)
	senses_whine( sr ) {
		const T = 1.2, n = Math.floor( T * sr ), a = new Float32Array( n ), nz = noise( n, 11 );
		highpass( nz, sr, 6000 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = Math.sin( TAU * 11000 * t ) * 0.5 + Math.sin( TAU * 16500 * t ) * 0.15 + nz[ i ] * 0.08; }
		normalize( a, 0.2 ); return loopable( a, sr );
	},
	// a regulator: the inhale's hiss through the second stage
	senses_reg_in( sr ) {
		const T = 0.9, n = Math.floor( T * sr ), a = noise( n, 17 );
		highpass( a, sr, 1400 ); lowpass( a, sr, 6500 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= Math.sin( Math.PI * Math.min( 1, t / T ) ) ** 0.7 * ( 0.8 + 0.2 * Math.sin( TAU * 37 * t ) ); }
		normalize( a, 0.35 ); return a;
	},
	// the exhale: a burst of bubbles rising past the mask
	senses_bubbles( sr ) {
		const T = 1.3, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 23 );
		for ( let t = 0.02; t < T - 0.1; t += 0.012 + Math.abs( r() ) * 0.03 ) {
			const f = 260 + Math.abs( r() ) * 900, s = Math.floor( t * sr ), m = Math.floor( 0.05 * sr ), amp = 0.3 + Math.abs( r() ) * 0.7;
			for ( let i = 0; i < m && s + i < n; i ++ ) { const u = i / sr; a[ s + i ] += Math.sin( TAU * f * u * ( 1 + u * 8 ) ) * amp * Math.exp( - u / 0.012 ) * ( 1 - t / T * 0.6 ); }
		}
		lowpass( a, sr, 2500 ); normalize( a, 0.45 ); return a;
	},
	// a watch's buzz on the wrist: three short pulses
	senses_buzz( sr ) {
		const n = Math.floor( 0.7 * sr ), a = new Float32Array( n ), nz = noise( n, 29 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr, on = ( t % 0.22 ) < 0.12 ? 1 : 0; a[ i ] = ( Math.sin( TAU * 170 * t ) * 0.6 + nz[ i ] * 0.15 ) * on; }
		lowpass( a, sr, 900 ); env( a, sr, 0.01, 0.05 ); normalize( a, 0.4 ); return a;
	},
	// the weather service's alert tone (1050 Hz) over a little static
	senses_alert( sr ) {
		const T = 2.4, n = Math.floor( T * sr ), a = noise( n, 31 );
		highpass( a, sr, 500 ); lowpass( a, sr, 3500 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = a[ i ] * 0.12 + ( t > 0.25 && t < 2.2 ? Math.sin( TAU * 1050 * t ) * 0.55 : 0 ); }
		env( a, sr, 0.02, 0.1 ); normalize( a, 0.5 ); return a;
	},
	// a breath through a filter canister: the valve's flutter and the rubber's rasp
	senses_mask_breath( sr ) {
		const T = 1.8, n = Math.floor( T * sr ), a = noise( n, 37 );
		lowpass( a, sr, 1600 ); highpass( a, sr, 180 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, inh = t < 0.75 ? Math.sin( Math.PI * t / 0.75 ) : 0, ex = t > 0.9 ? Math.sin( Math.PI * Math.min( 1, ( t - 0.9 ) / 0.8 ) ) : 0;
			a[ i ] *= inh * 0.9 + ex * 0.6 * ( 0.7 + 0.3 * Math.sin( TAU * 23 * t ) );
		}
		normalize( a, 0.4 ); return a;
	},
	// a compressor's head hammering and air hissing into a tank (loop)
	senses_compressor( sr ) {
		const T = 2, n = Math.floor( T * sr ), a = new Float32Array( n ), nz = noise( n, 41 ), hiss = noise( n, 43 );
		highpass( hiss, sr, 3000 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, ph = ( t * 24 ) % 1;
			a[ i ] = Math.exp( - ph * 7 ) * ( Math.sin( TAU * 48 * t ) * 0.6 + nz[ i ] * 0.3 ) + hiss[ i ] * 0.1;
		}
		lowpass( a, sr, 2200 ); normalize( a, 0.65 ); return loopable( a, sr );
	},
	// a laser pointer's button
	senses_click( sr ) {
		const n = Math.floor( 0.05 * sr ), a = noise( n, 47 );
		highpass( a, sr, 2500 );
		for ( let i = 0; i < n; i ++ ) a[ i ] *= Math.exp( - i / sr / 0.004 );
		normalize( a, 0.35 ); return a;
	},
	// a parabolic microphone's headphones keying up: a short noise swell
	senses_mic( sr ) {
		const n = Math.floor( 0.5 * sr ), a = noise( n, 53 );
		highpass( a, sr, 800 ); lowpass( a, sr, 5000 );
		env( a, sr, 0.15, 0.3 ); normalize( a, 0.2 ); return a;
	},
};

export const SENSES_SOUNDS = Object.keys( GEN );

export function ensureSensesSound( audio, name ) {
	if ( ! audio?.ctx || ! GEN[ name ] ) return false;
	if ( audio.buffers?.has( name ) ) return true;
	const sr = audio.ctx.sampleRate, data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data, 0 );
	audio.buffers.set( name, buf );
	return true;
}

export function playSensesSound( game, name, opts = {} ) {
	const a = game.audio;
	if ( ! a?.play ) return null;
	ensureSensesSound( a, name );
	return a.play( name, { vol: 0.6, ...opts } );
}

export function loopSensesSound( game, name, opts = {} ) {
	const a = game.audio;
	if ( ! a?.loop ) return null;
	ensureSensesSound( a, name );
	return a.loop( name, opts );
}
