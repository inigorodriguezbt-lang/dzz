// Procedural sounds for the pharmacy, rendered on first use into the audio engine's buffer map (audio.buffers.set) so
// game.audio.play finds them by name: a cough, a cold pack's crack, a defibrillator charging and its thump, a puff of
// an inhaler, a spray bottle's pump.
//   ensurePharmSound( audio, name ) -> bool, playPharmSound( game, name, opts ), PHARM_SOUNDS
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

const GEN = {
	// two or three harsh bursts of breath through a closed throat
	pharm_cough( sr ) {
		const T = 1.25, n = Math.floor( T * sr ), a = noise( n, 5 ), r = rng( 9 );
		lowpass( a, sr, 1600 ); highpass( a, sr, 180 );
		const bursts = [ [ 0.02, 0.2 ], [ 0.36, 0.17 ], [ 0.7, 0.24 ] ];
		const g = new Float32Array( n );
		for ( const [ t0, len ] of bursts ) {
			const f0 = 140 + Math.abs( r() ) * 40;
			for ( let i = Math.floor( t0 * sr ); i < Math.min( n, Math.floor( ( t0 + len ) * sr ) ); i ++ ) {
				const t = i / sr - t0, e = Math.min( 1, t / 0.012 ) * Math.exp( - t / ( len * 0.35 ) );
				// the voiced bark at the start of each burst
				g[ i ] = e * ( 1 + 0.6 * Math.sin( TAU * f0 * t ) * Math.exp( - t * 18 ) );
			}
		}
		for ( let i = 0; i < n; i ++ ) a[ i ] *= g[ i ];
		normalize( a, 0.75 );
		return a;
	},
	// an instant cold pack: the inner pouch cracks, then a crinkle of plastic
	pharm_crack( sr ) {
		const n = Math.floor( 0.5 * sr ), a = noise( n, 21 );
		highpass( a, sr, 900 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= Math.exp( - t * 28 ) + 0.18 * Math.exp( - Math.abs( t - 0.22 ) * 40 ) * ( 0.5 + 0.5 * Math.sin( t * 900 ) ); }
		normalize( a, 0.7 );
		return a;
	},
	// a defibrillator: the rising charge whine, a beat of silence, the thump
	pharm_defib( sr ) {
		const T = 2.6, n = Math.floor( T * sr ), a = new Float32Array( n ), thump = noise( n, 31 );
		lowpass( thump, sr, 220 );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			if ( t < 1.7 ) { ph += TAU * ( 900 + 2600 * ( t / 1.7 ) ** 1.6 ) / sr; a[ i ] = Math.sin( ph ) * 0.25 * Math.min( 1, t / 0.1 ); }
			if ( t > 2.0 ) { const u = t - 2.0; a[ i ] += thump[ i ] * 3 * Math.exp( - u * 9 ) + Math.sin( TAU * 55 * u ) * Math.exp( - u * 7 ) * 0.8; }
		}
		normalize( a, 0.8 );
		return a;
	},
	// a metered-dose puff
	pharm_puff( sr ) {
		const n = Math.floor( 0.4 * sr ), a = noise( n, 41 );
		highpass( a, sr, 1500 ); lowpass( a, sr, 6000 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= Math.min( 1, t / 0.008 ) * Math.exp( - t * 9 ); }
		normalize( a, 0.55 );
		return a;
	},
	// a trigger sprayer: two pumps
	pharm_spritz( sr ) {
		const n = Math.floor( 0.55 * sr ), a = noise( n, 51 );
		highpass( a, sr, 2500 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= Math.exp( - t * 22 ) + Math.exp( - Math.max( 0, t - 0.26 ) * 22 ) * ( t > 0.26 ? 1 : 0 ); }
		normalize( a, 0.5 );
		return a;
	},
};

export const PHARM_SOUNDS = Object.keys( GEN );

export function ensurePharmSound( audio, name ) {
	if ( ! audio?.ctx || ! GEN[ name ] ) return false;
	if ( audio.buffers.has( name ) ) return true;
	const sr = audio.ctx.sampleRate;
	const data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data, 0 );
	audio.buffers.set( name, buf );
	return true;
}

export function playPharmSound( game, name, opts = {} ) {
	const a = game?.audio;
	if ( ! a?.play ) return null;
	ensurePharmSound( a, name );
	return a.play( name, opts );
}
