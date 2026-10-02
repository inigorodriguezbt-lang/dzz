// Procedural sounds for the outdoors items, rendered on first use into the audio engine's buffer map
// (audio.buffers.set) so game.audio.play finds them by name: a mosquito's whine past your ear, a bow drill's rasp, a
// throw net whirling out and slapping the water, a trapped pig's squeal, a deer call's bleat, an aerosol hiss.
//   ensureOutdoorsSound( audio, name ) -> bool, OUTDOORS_SOUNDS
// Node-safe: nothing runs without an AudioContext.

function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296 * 2 - 1; };
}
function lowpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] = y; } }
function highpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] -= y; } }
function normalize( a, peak = 0.8 ) { let m = 0; for ( const v of a ) m = Math.max( m, Math.abs( v ) ); if ( m > 0 ) for ( let i = 0; i < a.length; i ++ ) a[ i ] *= peak / m; }
const TAU = Math.PI * 2;

const GEN = {
	// a whine that swells and fades as it passes the ear, the wingbeat wobbling its pitch
	mosquito( sr ) {
		const T = 1.6, n = Math.floor( T * sr ), a = new Float32Array( n );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, f = 610 + 45 * Math.sin( TAU * 7.5 * t ) + 80 * Math.sin( TAU * 0.6 * t );
			ph += f / sr;
			const pass = Math.exp( - ( ( ( t - 0.75 ) / 0.38 ) ** 2 ) );
			a[ i ] = pass * ( Math.sin( TAU * ph ) * 0.6 + Math.sin( TAU * ph * 2 ) * 0.3 + Math.sin( TAU * ph * 3 ) * 0.12 );
		}
		normalize( a, 0.5 );
		return a;
	},
	// the spindle sawing back and forth in the fireboard: dry rasping strokes
	bow_drill( sr ) {
		const T = 2.4, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 11 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, stroke = Math.abs( Math.sin( TAU * 1.4 * t ) );
			a[ i ] = r() * stroke * ( 0.6 + 0.4 * Math.sin( TAU * 130 * t ) );
		}
		highpass( a, sr, 900 ); lowpass( a, sr, 4200 );
		normalize( a, 0.55 );
		return a;
	},
	// a whoosh as the net opens, then the lead line slapping the water
	net_cast( sr ) {
		const T = 1.5, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 5 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			const whoosh = t < 0.7 ? Math.sin( Math.PI * t / 0.7 ) ** 2 * 0.35 : 0;
			const slap = t > 0.78 ? Math.exp( - ( t - 0.78 ) * 9 ) : 0;
			a[ i ] = r() * ( whoosh + slap );
		}
		lowpass( a, sr, 2600 );
		normalize( a, 0.7 );
		return a;
	},
	// a short pig squeal: a falling, rough tone
	pig_squeal( sr ) {
		const T = 0.7, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 3 );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, f = 900 - 350 * t + 60 * Math.sin( TAU * 23 * t );
			ph += f / sr;
			const e = Math.min( 1, t / 0.04 ) * Math.exp( - Math.max( 0, t - 0.45 ) * 10 );
			a[ i ] = e * ( Math.sin( TAU * ph ) * 0.5 + Math.sin( TAU * ph * 2.02 ) * 0.3 + r() * 0.25 );
		}
		lowpass( a, sr, 3500 );
		normalize( a, 0.7 );
		return a;
	},
	// a deer call: a nasal bleat through a reed
	deer_bleat( sr ) {
		const T = 0.9, n = Math.floor( T * sr ), a = new Float32Array( n );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, f = 420 + 120 * Math.sin( Math.PI * t / T ) + 12 * Math.sin( TAU * 6 * t );
			ph += f / sr;
			const e = Math.sin( Math.PI * Math.min( 1, t / T ) ) ** 0.6;
			let v = 0;
			for ( let k = 1; k <= 6; k ++ ) v += Math.sin( TAU * ph * k ) / ( k * 0.9 );
			a[ i ] = e * v;
		}
		lowpass( a, sr, 2200 );
		normalize( a, 0.7 );
		return a;
	},
};

export const OUTDOORS_SOUNDS = Object.keys( GEN );

export function ensureOutdoorsSound( audio, name ) {
	if ( ! audio?.ctx || ! audio.buffers || ! GEN[ name ] ) return false;
	if ( audio.buffers.has( name ) ) return true;
	const sr = audio.ctx.sampleRate;
	const data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data, 0 );
	audio.buffers.set( name, buf );
	return true;
}

export function playOutdoorsSound( game, name, opts = {} ) {
	const a = game.audio;
	if ( ! a?.play ) return null;
	ensureOutdoorsSound( a, name );
	return a.play( name, opts );
}
