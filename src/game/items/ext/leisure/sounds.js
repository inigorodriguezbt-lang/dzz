// Procedural sounds for the leisure items, rendered on first use into the audio engine's buffer map (audio.buffers.set)
// so game.audio.play finds them by name: a harmonica chord, a party popper, two dice on a table, a deck riffled, a
// handheld game's jingle, a slow exhale, a frisbee's whoosh, a snow globe's music box, a coin flipped, a yo-yo's whir.
//   ensureLeisSound( audio, name ) -> bool, playLeisSound( game, name, opts ), LEIS_SOUNDS
// Node-safe: nothing runs without an AudioContext.

function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296 * 2 - 1; };
}
function lowpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] = y; } }
function highpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] -= y; } }
function normalize( a, peak = 0.8 ) { let m = 0; for ( const v of a ) m = Math.max( m, Math.abs( v ) ); if ( m > 0 ) for ( let i = 0; i < a.length; i ++ ) a[ i ] *= peak / m; }
function noise( n, seed ) { const r = rng( seed ), a = new Float32Array( n ); for ( let i = 0; i < n; i ++ ) a[ i ] = r(); return a; }
const TAU = Math.PI * 2;

// a short knock: a click of noise through a resonance (a die landing, a card)
function tick( a, sr, t0, f, decay, amp, seed ) {
	const r = rng( seed ), i0 = Math.floor( t0 * sr ), n = Math.min( a.length - i0, Math.floor( 0.08 * sr ) );
	for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i0 + i ] += amp * Math.exp( - t * decay ) * ( Math.sin( TAU * f * t ) * 0.7 + r() * 0.5 ); }
}

const GEN = {
	// a harmonica: a breathy reed chord, drawn then blown, with a little vibrato
	leis_harmonica( sr ) {
		const T = 1.8, n = Math.floor( T * sr ), a = new Float32Array( n ), br = noise( n, 3 );
		lowpass( br, sr, 2500 );
		const chords = [ [ 0, 0.85, [ 392, 494, 587 ] ], [ 0.8, 1.8, [ 440, 523, 659 ] ] ];
		for ( const [ t0, t1, fs ] of chords ) {
			const ph = fs.map( () => 0 );
			for ( let i = Math.floor( t0 * sr ); i < Math.min( n, Math.floor( t1 * sr ) ); i ++ ) {
				const t = i / sr - t0, len = t1 - t0, env = Math.min( 1, t / 0.06 ) * Math.min( 1, ( len - t ) / 0.12 );
				let v = 0;
				fs.forEach( ( f, k ) => { ph[ k ] += TAU * f * ( 1 + 0.006 * Math.sin( TAU * 5.5 * t ) ) / sr; v += Math.sin( ph[ k ] ) + 0.45 * Math.sin( 2 * ph[ k ] ) + 0.25 * Math.sin( 3 * ph[ k ] ); } );
				a[ i ] += env * ( v * 0.22 + br[ i ] * 0.12 );
			}
		}
		normalize( a, 0.6 );
		return a;
	},
	// a party popper: the crack, then paper streamers rustling down
	leis_pop( sr ) {
		const n = Math.floor( 0.9 * sr ), a = noise( n, 11 ), r = rng( 13 );
		highpass( a, sr, 600 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= Math.exp( - t * 60 ) * 1.6 + 0.12 * Math.exp( - t * 4 ) * ( 0.5 + 0.5 * Math.abs( r() ) ); }
		normalize( a, 0.85 );
		return a;
	},
	// two dice shaken in a hand, then bouncing on a table
	leis_dice( sr ) {
		const n = Math.floor( 0.9 * sr ), a = new Float32Array( n );
		for ( let k = 0; k < 7; k ++ ) tick( a, sr, 0.02 + k * 0.035, 2600 + k * 90, 120, 0.3, 20 + k );
		const hits = [ 0.38, 0.47, 0.53, 0.6, 0.64, 0.7, 0.73 ];
		hits.forEach( ( t, k ) => tick( a, sr, t, 1700 + ( k % 2 ) * 400, 70, 0.9 - k * 0.1, 40 + k ) );
		normalize( a, 0.7 );
		return a;
	},
	// a deck riffled and bridged
	leis_cards( sr ) {
		const n = Math.floor( 1.0 * sr ), a = new Float32Array( n );
		for ( let k = 0; k < 44; k ++ ) tick( a, sr, 0.05 + k * 0.014 + ( k > 30 ? 0.05 : 0 ), 3800, 260, 0.35 + 0.2 * Math.sin( k ), 60 + k );
		const s = noise( n, 7 ); highpass( s, sr, 2000 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] += s[ i ] * 0.12 * Math.exp( - Math.abs( t - 0.85 ) * 25 ); }
		normalize( a, 0.55 );
		return a;
	},
	// a handheld game: a square-wave jingle
	leis_beep( sr ) {
		const notes = [ 523, 659, 784, 1047, 784, 1047 ], step = 0.11, n = Math.floor( ( notes.length * step + 0.15 ) * sr ), a = new Float32Array( n );
		notes.forEach( ( f, k ) => {
			const i0 = Math.floor( k * step * sr ), len = Math.floor( step * 0.85 * sr );
			for ( let i = 0; i < len && i0 + i < n; i ++ ) { const t = i / sr; a[ i0 + i ] += ( Math.sin( TAU * f * t ) > 0 ? 1 : - 1 ) * 0.25 * Math.min( 1, ( len - i ) / ( 0.01 * sr ) ); }
		} );
		lowpass( a, sr, 5000 );
		normalize( a, 0.4 );
		return a;
	},
	// breath out slowly
	leis_exhale( sr ) {
		const n = Math.floor( 1.4 * sr ), a = noise( n, 17 );
		lowpass( a, sr, 1400 ); highpass( a, sr, 250 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= Math.min( 1, t / 0.15 ) * Math.exp( - Math.max( 0, t - 0.3 ) * 2.6 ); }
		normalize( a, 0.45 );
		return a;
	},
	// a frisbee leaving the hand: a rising, falling whoosh
	leis_whoosh( sr ) {
		const n = Math.floor( 0.7 * sr ), a = noise( n, 23 ), b = new Float32Array( n );
		let y = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, f = 400 + 1800 * Math.sin( Math.PI * t / 0.7 ), k = 1 - Math.exp( - TAU * f / sr );
			y += ( a[ i ] - y ) * k; b[ i ] = y * Math.sin( Math.PI * t / 0.7 );
		}
		normalize( b, 0.5 );
		return b;
	},
	// a snow globe's music box: a few plucked high notes
	leis_chime( sr ) {
		const notes = [ [ 0, 1319 ], [ 0.28, 1568 ], [ 0.56, 1760 ], [ 0.84, 1568 ], [ 1.12, 1319 ], [ 1.4, 1175 ] ];
		const n = Math.floor( 2.4 * sr ), a = new Float32Array( n );
		for ( const [ t0, f ] of notes ) {
			const i0 = Math.floor( t0 * sr );
			for ( let i = 0; i0 + i < n; i ++ ) { const t = i / sr; a[ i0 + i ] += Math.exp( - t * 3.5 ) * ( Math.sin( TAU * f * t ) + 0.3 * Math.sin( TAU * f * 2.76 * t ) * Math.exp( - t * 8 ) ); }
		}
		normalize( a, 0.4 );
		return a;
	},
	// a coin flicked up, ringing, then caught
	leis_coin( sr ) {
		const n = Math.floor( 0.8 * sr ), a = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = Math.exp( - t * 6 ) * ( Math.sin( TAU * 4200 * t ) + 0.6 * Math.sin( TAU * 6100 * t ) ) * ( 0.6 + 0.4 * Math.sin( TAU * 18 * t ) ); }
		tick( a, sr, 0.62, 900, 90, 1.2, 77 );
		normalize( a, 0.4 );
		return a;
	},
	// a yo-yo spinning down its string and back
	leis_yoyo( sr ) {
		const n = Math.floor( 1.1 * sr ), a = noise( n, 31 );
		lowpass( a, sr, 900 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= ( 0.5 + 0.5 * Math.sin( TAU * ( 30 + 20 * Math.sin( Math.PI * t / 1.1 ) ) * t ) ) * Math.sin( Math.PI * t / 1.1 ); }
		normalize( a, 0.35 );
		return a;
	},
};

export const LEIS_SOUNDS = Object.keys( GEN );

export function ensureLeisSound( audio, name ) {
	if ( ! audio?.ctx || ! GEN[ name ] ) return false;
	if ( audio.buffers.has( name ) ) return true;
	const sr = audio.ctx.sampleRate;
	const data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data, 0 );
	audio.buffers.set( name, buf );
	return true;
}

export function playLeisSound( game, name, opts = {} ) {
	const a = game?.audio;
	if ( ! a ) return null;
	ensureLeisSound( a, name );
	return a.play?.( name, { vol: 0.7, ...opts } ) ?? null;
}

// for tests: render every sound once at a given rate
export function renderAll( sr = 22050 ) {
	const out = {};
	for ( const k of LEIS_SOUNDS ) out[ k ] = GEN[ k ]( sr );
	return out;
}
