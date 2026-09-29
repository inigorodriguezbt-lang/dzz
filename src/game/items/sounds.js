// Procedural sounds for items, crafting, fire and fishing, rendered on first use straight into the audio engine's
// buffer map (audio.buffers.set) so game.audio.play / loop can use them by name like any built-in sound.
//   playItemSound( game, name, opts ) / loopItemSound( game, name, opts )
// Names: fire_loop, flare_loop, can_open, tear, strike, cast, reel, pour, pills, spray, inject, whistle, strum,
// squeak, sizzle, click, snap, unwrap.

function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296 * 2 - 1; };
}

// one-pole filters and a biquad band-pass, in place
function lowpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] = y; } }
function highpass( a, sr, f ) { const k = 1 - Math.exp( - 2 * Math.PI * f / sr ); let y = 0; for ( let i = 0; i < a.length; i ++ ) { y += ( a[ i ] - y ) * k; a[ i ] -= y; } }
function bandpass( a, sr, f, q = 1 ) {
	const w = 2 * Math.PI * f / sr, al = Math.sin( w ) / ( 2 * q ), c = Math.cos( w );
	const b0 = al, b2 = - al, a0 = 1 + al, a1 = - 2 * c, a2 = 1 - al;
	let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
	for ( let i = 0; i < a.length; i ++ ) {
		const x = a[ i ], y = ( b0 * x + b2 * x2 - a1 * y1 - a2 * y2 ) / a0;
		x2 = x1; x1 = x; y2 = y1; y1 = y; a[ i ] = y;
	}
}
function normalize( a, peak = 0.9 ) { let m = 0; for ( const v of a ) m = Math.max( m, Math.abs( v ) ); if ( m > 0 ) for ( let i = 0; i < a.length; i ++ ) a[ i ] *= peak / m; }
function env( a, sr, attack, release, total = a.length / sr ) {
	for ( let i = 0; i < a.length; i ++ ) {
		const t = i / sr;
		a[ i ] *= Math.min( 1, t / Math.max( 1e-4, attack ) ) * Math.min( 1, Math.max( 0, ( total - t ) / Math.max( 1e-4, release ) ) );
	}
}
// make a loop seamless: cross-fade the tail into the head
function loopable( a, sr, fade = 0.25 ) {
	const n = Math.floor( fade * sr ), L = a.length - n;
	for ( let i = 0; i < n; i ++ ) { const k = i / n; a[ i ] = a[ i ] * k + a[ L + i ] * ( 1 - k ); }
	return a.subarray( 0, L );
}
// a short decaying click at time t
function click( a, sr, t, amp, freq, decay ) {
	const s = Math.floor( t * sr ), n = Math.floor( decay * 6 * sr );
	for ( let i = 0; i < n && s + i < a.length; i ++ ) a[ s + i ] += amp * Math.sin( 2 * Math.PI * freq * i / sr ) * Math.exp( - i / sr / decay );
}
function noise( n, seed ) { const r = rng( seed ), a = new Float32Array( n ); for ( let i = 0; i < n; i ++ ) a[ i ] = r(); return a; }
// Karplus-Strong plucked string
function pluck( a, sr, t, f, amp, seed ) {
	const r = rng( seed ), N = Math.max( 2, Math.round( sr / f ) ), buf = new Float32Array( N );
	for ( let i = 0; i < N; i ++ ) buf[ i ] = r();
	const s = Math.floor( t * sr );
	for ( let i = 0, j = 0; s + i < a.length; i ++, j = ( j + 1 ) % N ) {
		const nx = ( j + 1 ) % N;
		const v = buf[ j ];
		buf[ j ] = ( buf[ j ] + buf[ nx ] ) * 0.4985;
		a[ s + i ] += v * amp;
	}
}

const GEN = {
	fire_loop( sr ) {
		const T = 4.5, n = Math.floor( T * sr ), r = rng( 11 );
		const a = noise( n, 3 ); lowpass( a, sr, 380 ); lowpass( a, sr, 900 );
		for ( let i = 0; i < n; i ++ ) a[ i ] *= 0.55 + 0.25 * Math.sin( i / sr * 2.1 ) + 0.2 * Math.sin( i / sr * 5.3 );
		const cr = new Float32Array( n );
		for ( let k = 0; k < T * 14; k ++ ) click( cr, sr, Math.abs( r() ) * T, 0.25 + Math.abs( r() ) * 0.9, 1800 + Math.abs( r() ) * 3500, 0.0008 + Math.abs( r() ) * 0.002 );
		for ( let k = 0; k < T * 1.2; k ++ ) click( cr, sr, Math.abs( r() ) * T, 1.4, 500 + Math.abs( r() ) * 900, 0.004 );
		highpass( cr, sr, 400 );
		for ( let i = 0; i < n; i ++ ) a[ i ] = a[ i ] * 2.2 + cr[ i ];
		normalize( a, 0.7 );
		return loopable( a, sr, 0.3 );
	},
	flare_loop( sr ) {
		const T = 2.5, n = Math.floor( T * sr );
		const a = noise( n, 5 ); bandpass( a, sr, 2600, 0.6 ); highpass( a, sr, 700 );
		const r = rng( 9 );
		for ( let i = 0; i < n; i ++ ) a[ i ] *= 0.8 + 0.2 * Math.sin( i / sr * 31 ) + 0.1 * r();
		normalize( a, 0.6 );
		return loopable( a, sr, 0.3 );
	},
	can_open( sr ) {
		const n = Math.floor( 0.55 * sr ), a = new Float32Array( n );
		click( a, sr, 0.01, 1, 2800, 0.002 ); click( a, sr, 0.03, 0.6, 1900, 0.003 );
		const h = noise( n, 7 ); highpass( h, sr, 3000 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr - 0.05; a[ i ] += t > 0 ? h[ i ] * 0.5 * Math.exp( - t / 0.12 ) : 0; }
		normalize( a ); return a;
	},
	tear( sr ) {
		const n = Math.floor( 0.8 * sr ), a = noise( n, 13 ), r = rng( 17 );
		bandpass( a, sr, 1800, 0.5 );
		let g = 0;
		for ( let i = 0; i < n; i ++ ) { if ( i % 90 === 0 ) g = Math.abs( r() ) > 0.35 ? Math.abs( r() ) : 0.1; a[ i ] *= g; }
		env( a, sr, 0.02, 0.15 ); normalize( a, 0.8 ); return a;
	},
	strike( sr ) {
		const n = Math.floor( 0.7 * sr ), a = noise( n, 19 );
		highpass( a, sr, 1200 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= t < 0.08 ? 1 : 0.35 * Math.exp( - ( t - 0.08 ) / 0.25 ); }
		const w = noise( n, 23 ); lowpass( w, sr, 600 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] += w[ i ] * ( t > 0.06 ? 1.5 * Math.exp( - ( t - 0.06 ) / 0.3 ) : 0 ); }
		normalize( a, 0.8 ); return a;
	},
	cast( sr ) {
		const n = Math.floor( 0.8 * sr ), a = noise( n, 29 );
		// a whoosh sweeping up, then the line paying out
		let y1 = 0, y2 = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, f = 300 + t * 2400, w = 2 * Math.PI * f / sr, q = 2.5;
			const al = Math.sin( w ) / ( 2 * q ), c = Math.cos( w );
			const y = ( al * a[ i ] - ( - 2 * c ) * y1 - ( 1 - al ) * y2 ) / ( 1 + al );
			y2 = y1; y1 = y;
			a[ i ] = y * Math.sin( Math.PI * Math.min( 1, t / 0.45 ) );
		}
		for ( let k = 0; k < 14; k ++ ) click( a, sr, 0.4 + k * 0.025, 0.25, 3200, 0.0008 );
		normalize( a, 0.7 ); return a;
	},
	reel( sr ) {
		const n = Math.floor( 1.8 * sr ), a = new Float32Array( n ), r = rng( 31 );
		for ( let t = 0.02; t < 1.75; t += 0.028 + r() * 0.004 ) click( a, sr, t, 0.6 + r() * 0.2, 2600 + r() * 400, 0.0012 );
		normalize( a, 0.6 ); return a;
	},
	pour( sr ) {
		const n = Math.floor( 1.6 * sr ), a = noise( n, 37 );
		lowpass( a, sr, 900 ); bandpass( a, sr, 500, 0.7 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= ( 0.6 + 0.4 * Math.sin( t * 2 * Math.PI * 7 ) ) * Math.min( 1, t / 0.1 ) * Math.min( 1, ( 1.6 - t ) / 0.3 ); }
		normalize( a, 0.7 ); return a;
	},
	pills( sr ) {
		const n = Math.floor( 0.6 * sr ), a = new Float32Array( n ), r = rng( 41 );
		for ( let k = 0; k < 24; k ++ ) click( a, sr, 0.02 + Math.abs( r() ) * 0.45, 0.3 + Math.abs( r() ) * 0.5, 3500 + Math.abs( r() ) * 3000, 0.0007 );
		normalize( a, 0.6 ); return a;
	},
	spray( sr ) {
		const n = Math.floor( 0.9 * sr ), a = noise( n, 43 );
		highpass( a, sr, 3500 ); env( a, sr, 0.03, 0.2 ); normalize( a, 0.5 ); return a;
	},
	inject( sr ) {
		const n = Math.floor( 0.5 * sr ), a = new Float32Array( n );
		click( a, sr, 0.01, 1, 1500, 0.003 );
		const h = noise( n, 47 ); highpass( h, sr, 2500 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr - 0.03; if ( t > 0 ) a[ i ] += h[ i ] * 0.35 * Math.exp( - t / 0.15 ); }
		normalize( a, 0.7 ); return a;
	},
	whistle( sr ) {
		const n = Math.floor( 1.0 * sr ), a = new Float32Array( n ), r = rng( 53 );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, f = 2900 + Math.sin( t * 2 * Math.PI * 34 ) * 120; // the pea rattles the pitch
			ph += 2 * Math.PI * f / sr;
			a[ i ] = ( Math.sin( ph ) * 0.8 + r() * 0.08 ) * ( 0.75 + 0.25 * Math.sin( t * 2 * Math.PI * 34 ) ) * Math.min( 1, t / 0.02 ) * Math.min( 1, ( 1 - t ) / 0.08 );
		}
		normalize( a, 0.8 ); return a;
	},
	strum( sr ) {
		const n = Math.floor( 2.2 * sr ), a = new Float32Array( n );
		[ 392, 262, 330, 440 ].forEach( ( f, i ) => pluck( a, sr, 0.01 + i * 0.018, f, 0.5, 60 + i ) );
		lowpass( a, sr, 4000 ); normalize( a, 0.8 ); return a;
	},
	squeak( sr ) {
		const n = Math.floor( 0.45 * sr ), a = new Float32Array( n );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) { const t = i / sr, f = 1100 + 1300 * Math.sin( Math.PI * t / 0.45 ); ph += 2 * Math.PI * f / sr; a[ i ] = Math.sin( ph + Math.sin( ph * 0.5 ) * 0.8 ) * Math.sin( Math.PI * t / 0.45 ); }
		normalize( a, 0.7 ); return a;
	},
	sizzle( sr ) {
		const n = Math.floor( 1.6 * sr ), a = noise( n, 59 ), r = rng( 61 );
		highpass( a, sr, 2000 );
		const cr = new Float32Array( n );
		for ( let k = 0; k < 40; k ++ ) click( cr, sr, Math.abs( r() ) * 1.5, Math.abs( r() ), 4000 + Math.abs( r() ) * 3000, 0.0006 );
		for ( let i = 0; i < n; i ++ ) a[ i ] = a[ i ] * ( 0.5 + 0.3 * Math.abs( r() ) ) + cr[ i ];
		env( a, sr, 0.05, 0.3 ); normalize( a, 0.55 ); return a;
	},
	click( sr ) { const a = new Float32Array( Math.floor( 0.06 * sr ) ); click( a, sr, 0.002, 1, 2200, 0.0015 ); click( a, sr, 0.02, 0.5, 1500, 0.002 ); normalize( a, 0.6 ); return a; },
	snap( sr ) {
		const n = Math.floor( 0.25 * sr ), a = noise( n, 67 );
		highpass( a, sr, 1500 );
		for ( let i = 0; i < n; i ++ ) a[ i ] *= Math.exp( - i / sr / 0.02 );
		click( a, sr, 0.001, 1.2, 1200, 0.004 );
		normalize( a, 0.8 ); return a;
	},
	unwrap( sr ) {
		const n = Math.floor( 0.7 * sr ), a = new Float32Array( n ), r = rng( 71 ), h = noise( n, 73 );
		highpass( h, sr, 2500 );
		let g = 0;
		for ( let i = 0; i < n; i ++ ) { if ( i % 60 === 0 ) g = Math.abs( r() ) > 0.55 ? Math.abs( r() ) : 0; a[ i ] = h[ i ] * g; }
		env( a, sr, 0.01, 0.1 ); normalize( a, 0.6 ); return a;
	},
};

export const ITEM_SOUNDS = Object.keys( GEN );

export function ensureItemSound( audio, name ) {
	if ( ! audio?.ctx || ! GEN[ name ] ) return false;
	if ( audio.buffers.has( name ) ) return true;
	const sr = audio.ctx.sampleRate;
	const data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data instanceof Float32Array ? data : new Float32Array( data ), 0 );
	audio.buffers.set( name, buf );
	return true;
}

export function playItemSound( game, name, opts = {} ) {
	const a = game.audio;
	if ( ! a ) return null;
	ensureItemSound( a, name );
	return a.play( name, opts );
}

export function loopItemSound( game, name, opts = {} ) {
	const a = game.audio;
	if ( ! a ) return null;
	ensureItemSound( a, name );
	return a.loop( name, opts );
}
