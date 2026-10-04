// Procedural sounds for the mobility equipment, rendered on first use into the audio engine's buffer map
// (audio.buffers.set) so game.audio.play / loop find them by name. Loops are cross-faded at the seam.
//   ensureMobSound( audio, name ) -> bool, MOB_SOUNDS
// Node-safe: nothing runs without an AudioContext.

function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296 * 2 - 1; };
}
function lowpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] = y; } }
function highpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] -= y; } }
function normalize( a, peak = 0.8 ) { let m = 0; for ( const v of a ) m = Math.max( m, Math.abs( v ) ); if ( m > 0 ) for ( let i = 0; i < a.length; i ++ ) a[ i ] *= peak / m; }
// a seamless loop: the last `fade` seconds blended into the first
function loopify( a, sr, fade = 0.15 ) {
	const n = Math.floor( fade * sr ), L = a.length - n, out = new Float32Array( L );
	for ( let i = 0; i < L; i ++ ) out[ i ] = a[ i ];
	for ( let i = 0; i < n; i ++ ) { const t = i / n; out[ i ] = a[ i ] * t + a[ L + i ] * ( 1 - t ); }
	return out;
}
const TAU = Math.PI * 2;
const env = ( t, a, d ) => t < a ? t / a : Math.exp( - ( t - a ) / d );

const GEN = {
	// air rushing past the ears in flight
	mob_wind( sr ) {
		const T = 2.4, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 21 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = r() * ( 0.7 + 0.3 * Math.sin( TAU * 0.83 * t ) * Math.sin( TAU * 0.31 * t ) ); }
		lowpass( a, sr, 700 ); lowpass( a, sr, 1400 ); highpass( a, sr, 60 );
		normalize( a, 0.6 );
		return loopify( a, sr, 0.3 );
	},
	// a canopy's fabric rippling: a low flutter
	mob_flap( sr ) {
		const T = 2, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 4 );
		let y = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, am = 0.35 + 0.65 * Math.max( 0, Math.sin( TAU * 7.5 * t + 2 * Math.sin( TAU * 0.5 * t ) ) ) ** 3;
			y += ( r() - y ) * 0.08;
			a[ i ] = y * am;
		}
		highpass( a, sr, 80 ); lowpass( a, sr, 900 );
		normalize( a, 0.5 );
		return loopify( a, sr, 0.2 );
	},
	// urethane wheels on asphalt: a gritty roar, the clack of joints in the sidewalk
	mob_roll( sr ) {
		const T = 2.2, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 7 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			let v = r() * 0.5;
			const jt = ( t % 0.55 ) / 0.55;
			if ( jt < 0.02 || ( jt > 0.12 && jt < 0.135 ) ) v += r() * 2.2 * ( 1 - ( jt % 0.12 ) * 10 );
			a[ i ] = v;
		}
		lowpass( a, sr, 1800 ); highpass( a, sr, 90 );
		normalize( a, 0.55 );
		return loopify( a, sr, 0.12 );
	},
	// the tail snapping the ground: a sharp crack and the knock of the deck
	mob_pop( sr ) {
		const T = 0.35, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 9 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = r() * env( t, 0.001, 0.012 ) * 1.4 + Math.sin( TAU * 210 * t ) * env( t, 0.002, 0.05 ) * 0.7 + Math.sin( TAU * 470 * t ) * env( t, 0.001, 0.025 ) * 0.4; }
		lowpass( a, sr, 6000 );
		normalize( a, 0.8 );
		return a;
	},
	// landing on four wheels
	mob_land( sr ) {
		const T = 0.4, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 12 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = r() * env( t, 0.002, 0.03 ) + Math.sin( TAU * 140 * t ) * env( t, 0.003, 0.07 ) * 0.9; }
		lowpass( a, sr, 3000 );
		normalize( a, 0.75 );
		return a;
	},
	// a paddle stroke: the blade in, the pull, drips off it
	mob_paddle( sr ) {
		const T = 0.9, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 15 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			let v = r() * ( t < 0.45 ? Math.sin( Math.PI * t / 0.45 ) ** 2 * 0.6 : 0 );
			v += r() * env( t, 0.004, 0.03 ) * 0.9;
			for ( const d of [ 0.52, 0.61, 0.73, 0.8 ] ) if ( t > d ) v += Math.sin( TAU * ( 1300 + d * 900 ) * ( t - d ) ) * Math.exp( - ( t - d ) * 60 ) * 0.25;
			a[ i ] = v;
		}
		lowpass( a, sr, 3500 ); highpass( a, sr, 150 );
		normalize( a, 0.6 );
		return a;
	},
	// a shopping cart: loose wire baskets and hard little wheels
	mob_rattle( sr ) {
		const T = 1.6, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 31 );
		const hits = [];
		for ( let k = 0; k < 40; k ++ ) hits.push( [ ( r() * 0.5 + 0.5 ) * T, 2000 + ( r() * 0.5 + 0.5 ) * 3500, 0.3 + ( r() * 0.5 + 0.5 ) * 0.5 ] );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			let v = r() * 0.25;
			for ( const [ h, f, g ] of hits ) if ( t > h && t < h + 0.06 ) v += Math.sin( TAU * f * ( t - h ) ) * Math.exp( - ( t - h ) * 70 ) * g;
			a[ i ] = v;
		}
		highpass( a, sr, 300 ); lowpass( a, sr, 7000 );
		normalize( a, 0.5 );
		return loopify( a, sr, 0.1 );
	},
	// a trolley's pulleys on steel cable: a rising whine over a hiss
	mob_zip( sr ) {
		const T = 1.5, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 44 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = r() * 0.4 + Math.sin( TAU * 620 * t ) * 0.18 + Math.sin( TAU * 1240 * t + Math.sin( TAU * 6 * t ) ) * 0.08; }
		highpass( a, sr, 400 ); lowpass( a, sr, 5000 );
		normalize( a, 0.45 );
		return loopify( a, sr, 0.15 );
	},
	// a foot on an aluminium rung
	mob_rung( sr ) {
		const T = 0.45, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 50 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = ( Math.sin( TAU * 820 * t ) * 0.5 + Math.sin( TAU * 1930 * t ) * 0.3 + Math.sin( TAU * 3110 * t ) * 0.15 ) * env( t, 0.001, 0.09 ) + r() * env( t, 0.001, 0.008 ) * 0.6; }
		normalize( a, 0.55 );
		return a;
	},
	// a rope creaking through the hands
	mob_rope( sr ) {
		const T = 0.5, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 61 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = r() * Math.sin( Math.PI * Math.min( 1, t / T ) ) * ( 0.5 + 0.5 * Math.sin( TAU * 34 * t ) ); }
		highpass( a, sr, 700 ); lowpass( a, sr, 2600 );
		normalize( a, 0.4 );
		return a;
	},
	// scrambling over an edge: cloth and boots on concrete
	mob_scuff( sr ) {
		const T = 0.8, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 70 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = r() * ( env( t, 0.02, 0.12 ) + ( t > 0.35 ? env( t - 0.35, 0.01, 0.1 ) * 0.8 : 0 ) ); }
		lowpass( a, sr, 2500 ); highpass( a, sr, 120 );
		normalize( a, 0.55 );
		return a;
	},
	// a coil of rope whirled and let go
	mob_throw( sr ) {
		const T = 0.9, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 81 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = r() * Math.sin( Math.PI * t / T ) ** 2 * ( 0.6 + 0.4 * Math.sin( TAU * 4 * t ) ); }
		lowpass( a, sr, 1600 ); highpass( a, sr, 200 );
		normalize( a, 0.55 );
		return a;
	},
	// a steel hook landing on a roof: a clank and a scrape as it bites
	mob_clink( sr ) {
		const T = 0.7, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 90 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			let v = ( Math.sin( TAU * 1450 * t ) * 0.5 + Math.sin( TAU * 2380 * t ) * 0.35 + Math.sin( TAU * 3720 * t ) * 0.2 ) * env( t, 0.001, 0.07 );
			if ( t > 0.18 ) v += r() * env( t - 0.18, 0.02, 0.15 ) * 0.4;
			a[ i ] = v;
		}
		normalize( a, 0.6 );
		return a;
	},
	// a variometer's beep
	mob_vario( sr ) {
		const T = 0.12, n = Math.floor( T * sr ), a = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = Math.sin( TAU * 880 * t ) * Math.min( 1, t / 0.005, ( T - t ) / 0.01 ); }
		normalize( a, 0.4 );
		return a;
	},
	// a wing or a canopy filling: rustle, then the snap as it takes the load
	mob_unfold( sr ) {
		const T = 1.6, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 101 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			let v = r() * ( t < 1.1 ? Math.sin( Math.PI * t / 1.1 ) * ( 0.5 + 0.5 * Math.sin( TAU * 11 * t ) ) * 0.5 : 0 );
			if ( t > 1.1 ) v += ( r() * 0.6 + Math.sin( TAU * 90 * t ) ) * env( t - 1.1, 0.005, 0.08 );
			a[ i ] = v;
		}
		lowpass( a, sr, 2400 ); highpass( a, sr, 50 );
		normalize( a, 0.7 );
		return a;
	},
	// a cart's wheels against a kerb
	mob_bump( sr ) {
		const T = 0.4, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 110 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = ( r() * 0.5 + Math.sin( TAU * 95 * t ) ) * env( t, 0.002, 0.06 ) + Math.sin( TAU * 1700 * t ) * env( t, 0.001, 0.04 ) * 0.3; }
		lowpass( a, sr, 4000 );
		normalize( a, 0.7 );
		return a;
	},
	// a ladder going over: a slide, a crash and rattling rungs
	mob_clatter( sr ) {
		const T = 1.6, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 120 );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr;
			let v = r() * ( t < 0.6 ? t * 0.3 : 0 );
			for ( const d of [ 0.62, 0.74, 0.83, 0.95, 1.1 ] ) if ( t > d ) v += ( Math.sin( TAU * ( 700 + d * 600 ) * ( t - d ) ) + r() * 0.5 ) * Math.exp( - ( t - d ) * 18 ) * ( d === 0.62 ? 1 : 0.5 );
			a[ i ] = v;
		}
		lowpass( a, sr, 6000 );
		normalize( a, 0.8 );
		return a;
	},
};

export const MOB_SOUNDS = Object.keys( GEN );

export function ensureMobSound( audio, name ) {
	if ( ! audio?.ctx || ! audio.buffers || ! GEN[ name ] ) return false;
	if ( audio.buffers.has( name ) ) return true;
	const sr = audio.ctx.sampleRate;
	const data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data, 0 );
	audio.buffers.set( name, buf );
	return true;
}

// the generators themselves (tests render them without an AudioContext)
export const mobSoundData = ( name, sr = 22050 ) => GEN[ name ]?.( sr ) || null;
