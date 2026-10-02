// Procedural sounds for the tech items, rendered on first use into the audio engine's buffer map (audio.buffers.set)
// so game.audio.play / loop find them by name: a generator's idle (loop), radio static, a detector's beep, a camera
// flash charging and firing, a drill, a hacksaw, a crank's ratchet, a drone's buzz (loop), a siphon's gurgle.
//   ensureTechSound( audio, name ) -> bool, playTechSound( game, name, opts ), TECH_SOUNDS
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
// cross-fade the tail into the head so a loop has no seam
function loopable( a, sr, fade = 0.2 ) {
	const n = Math.floor( fade * sr ), L = a.length - n;
	for ( let i = 0; i < n; i ++ ) { const k = i / n; a[ i ] = a[ i ] * k + a[ L + i ] * ( 1 - k ); }
	return a.slice( 0, L );
}
function click( a, sr, t, amp, freq, decay ) {
	const s = Math.floor( t * sr ), n = Math.floor( decay * 6 * sr );
	for ( let i = 0; i < n && s + i < a.length; i ++ ) a[ s + i ] += amp * Math.sin( 2 * Math.PI * freq * i / sr ) * Math.exp( - i / sr / decay );
}
const TAU = Math.PI * 2;

const GEN = {
	// a small four-stroke at idle: firing pulses at ~28 Hz through a muffler, with a valve tick
	tech_generator( sr ) {
		const T = 2.4, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 7 );
		const f = 27.5;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, ph = ( t * f ) % 1;
			const pulse = Math.exp( - ph * 9 ) * ( 0.85 + 0.15 * Math.sin( t * TAU * 0.7 ) );
			a[ i ] = pulse * ( 0.6 * Math.sin( TAU * 55 * t ) + 0.4 * Math.sin( TAU * 110 * t + 0.4 ) ) + r() * 0.18 * pulse;
		}
		lowpass( a, sr, 700 );
		const tick = noise( n, 9 ); highpass( tick, sr, 2500 );
		for ( let i = 0; i < n; i ++ ) a[ i ] += tick[ i ] * 0.05 * Math.exp( - ( ( i / sr * f * 2 ) % 1 ) * 14 );
		normalize( a, 0.7 );
		return loopable( a, sr );
	},
	// receiver hiss with squelch breaks and a garbled voice band
	tech_static( sr ) {
		const T = 1.6, n = Math.floor( T * sr ), a = noise( n, 13 ), r = rng( 17 );
		highpass( a, sr, 400 ); lowpass( a, sr, 3800 );
		let g = 1, k = 0;
		for ( let i = 0; i < n; i ++ ) {
			if ( -- k <= 0 ) { k = Math.floor( sr * ( 0.04 + Math.abs( r() ) * 0.12 ) ); g = Math.abs( r() ) > 0.3 ? 0.5 + Math.abs( r() ) * 0.5 : 0.08; }
			const t = i / sr;
			a[ i ] = a[ i ] * g * 0.6 + Math.sin( TAU * ( 320 + 90 * Math.sin( t * TAU * 5 ) ) * t ) * 0.18 * ( g > 0.4 ? 1 : 0 );
		}
		env( a, sr, 0.02, 0.15 ); normalize( a, 0.55 ); return a;
	},
	// a detector's tone: rising beeps
	tech_beep( sr ) {
		const n = Math.floor( 0.32 * sr ), a = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = Math.sin( TAU * ( 900 + t * 900 ) * t ) * ( t < 0.12 || ( t > 0.18 && t < 0.3 ) ? 1 : 0 ); }
		env( a, sr, 0.005, 0.02 ); normalize( a, 0.45 ); return a;
	},
	// a flash charging up (a whine) and the shutter
	tech_flash( sr ) {
		const n = Math.floor( 0.7 * sr ), a = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = t < 0.5 ? Math.sin( TAU * ( 2500 + t * 6000 ) * t ) * 0.12 * ( t / 0.5 ) : 0; }
		click( a, sr, 0.52, 1, 1800, 0.003 ); click( a, sr, 0.56, 0.6, 1200, 0.004 );
		const pop = noise( Math.floor( 0.06 * sr ), 23 );
		for ( let i = 0; i < pop.length; i ++ ) a[ Math.floor( 0.52 * sr ) + i ] += pop[ i ] * 0.5 * Math.exp( - i / sr / 0.01 );
		normalize( a, 0.6 ); return a;
	},
	// a drill motor spinning up, biting, spinning down
	tech_drill( sr ) {
		const T = 1.6, n = Math.floor( T * sr ), a = new Float32Array( n ), nz = noise( n, 29 );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, sp = Math.min( 1, t / 0.25 ) * Math.min( 1, ( T - t ) / 0.3 ), f = 180 + 520 * sp - ( t > 0.5 && t < 1.1 ? 120 : 0 );
			ph += f / sr;
			a[ i ] = ( Math.sin( TAU * ph ) * 0.5 + Math.sin( TAU * ph * 2.02 ) * 0.25 + nz[ i ] * 0.15 ) * sp;
		}
		lowpass( a, sr, 4000 ); normalize( a, 0.6 ); return a;
	},
	// a hacksaw: two strokes of rasping teeth
	tech_saw( sr ) {
		const T = 1.2, n = Math.floor( T * sr ), a = noise( n, 31 );
		highpass( a, sr, 1800 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, s = ( t % 0.6 ) / 0.6;
			a[ i ] *= Math.sin( Math.PI * s ) * ( 0.6 + 0.4 * Math.abs( Math.sin( TAU * 70 * t ) ) );
		}
		normalize( a, 0.5 ); return a;
	},
	// a hand crank's ratchet
	tech_crank( sr ) {
		const n = Math.floor( 1.4 * sr ), a = new Float32Array( n ), r = rng( 37 );
		for ( let t = 0.02; t < 1.35; t += 0.045 ) click( a, sr, t, 0.5 + Math.abs( r() ) * 0.3, 1900 + Math.abs( r() ) * 500, 0.0015 );
		for ( let i = 0; i < n; i ++ ) a[ i ] += Math.sin( TAU * 140 * i / sr ) * 0.06;
		normalize( a, 0.55 ); return a;
	},
	// four props: a buzzing whine (loop)
	tech_drone( sr ) {
		const T = 1.5, n = Math.floor( T * sr ), a = new Float32Array( n ), nz = noise( n, 41 );
		lowpass( nz, sr, 1200 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			a[ i ] = Math.sin( TAU * 196 * t ) * 0.3 + Math.sin( TAU * 203 * t ) * 0.3 + Math.sin( TAU * 392 * t ) * 0.15 + nz[ i ] * 0.4;
		}
		normalize( a, 0.5 ); return loopable( a, sr );
	},
	// fuel drawn through a hose
	tech_siphon( sr ) {
		const T = 1.6, n = Math.floor( T * sr ), a = noise( n, 47 ), r = rng( 53 );
		lowpass( a, sr, 700 );
		for ( let t = 0.05; t < T - 0.1; t += 0.12 + Math.abs( r() ) * 0.1 ) click( a, sr, t, 0.8, 180 + Math.abs( r() ) * 120, 0.02 );
		env( a, sr, 0.1, 0.2 ); normalize( a, 0.55 ); return a;
	},
};

export const TECH_SOUNDS = Object.keys( GEN );

export function ensureTechSound( audio, name ) {
	if ( ! audio?.ctx || ! GEN[ name ] ) return false;
	if ( audio.buffers?.has( name ) ) return true;
	const sr = audio.ctx.sampleRate, data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data, 0 );
	audio.buffers.set( name, buf );
	return true;
}

export function playTechSound( game, name, opts = {} ) {
	const a = game.audio;
	if ( ! a?.play ) return null;
	ensureTechSound( a, name );
	return a.play( name, { vol: 0.6, ...opts } );
}
