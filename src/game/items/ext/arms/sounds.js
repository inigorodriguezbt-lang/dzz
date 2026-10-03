// Procedural sounds for the arms items, rendered on first use into the audio engine's buffer map (audio.buffers.set)
// so game.audio.play finds them by name: a firecracker's pop and its fuse, an air horn, a party horn, a slingshot's
// snap, tin cans rattling on a tripwire, a blow taken on a riot shield.
//   ensureArmsSound( audio, name ) -> bool, playArmsSound( game, name, opts ), ARMS_SOUNDS
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
function click( a, sr, t, amp, freq, decay ) {
	const s = Math.floor( t * sr ), n = Math.floor( decay * 6 * sr );
	for ( let i = 0; i < n && s + i < a.length; i ++ ) a[ s + i ] += amp * Math.sin( 2 * Math.PI * freq * i / sr ) * Math.exp( - i / sr / decay );
}
const TAU = Math.PI * 2;

const GEN = {
	// one firecracker: a sharp crack (a noise spike) with a short papery tail
	arms_pop( sr ) {
		const n = Math.floor( 0.16 * sr ), a = noise( n, 61 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] *= Math.exp( - t / 0.012 ) * 1.2 + Math.exp( - t / 0.05 ) * 0.25; }
		highpass( a, sr, 500 );
		click( a, sr, 0.0005, 0.6, 900, 0.004 );
		normalize( a, 0.95 ); return a;
	},
	// a lit fuse: a hiss full of sputters
	arms_fuse( sr ) {
		const T = 1.2, n = Math.floor( T * sr ), a = noise( n, 67 ), r = rng( 71 );
		highpass( a, sr, 2500 );
		for ( let i = 0; i < n; i ++ ) a[ i ] *= 0.35;
		for ( let t = 0.01; t < T; t += 0.01 + Math.abs( r() ) * 0.04 ) click( a, sr, t, 0.3 + Math.abs( r() ) * 0.5, 3000 + Math.abs( r() ) * 2500, 0.0012 );
		env( a, sr, 0.02, 0.1 ); normalize( a, 0.5 ); return a;
	},
	// a canned air horn: two detuned reedy tones, a blast with a hard start
	arms_airhorn( sr ) {
		const T = 1.3, n = Math.floor( T * sr ), a = new Float32Array( n );
		let p1 = 0, p2 = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, wob = 1 + Math.sin( t * TAU * 5 ) * 0.004;
			p1 += 415 * wob / sr; p2 += 330 * wob / sr;
			// buzzy pulse waves: a reed's spectrum
			const s1 = ( p1 % 1 ) < 0.3 ? 1 : - 0.43, s2 = ( p2 % 1 ) < 0.35 ? 1 : - 0.54;
			a[ i ] = s1 * 0.55 + s2 * 0.45;
		}
		lowpass( a, sr, 3200 );
		env( a, sr, 0.015, 0.12 ); normalize( a, 0.85 ); return a;
	},
	// a party blowout horn: a paper reed buzzing, a rising squawk
	arms_partyhorn( sr ) {
		const T = 0.7, n = Math.floor( T * sr ), a = new Float32Array( n ), nz = noise( n, 73 );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / sr, f = 520 + 90 * Math.min( 1, t / 0.15 ) + Math.sin( t * TAU * 11 ) * 12;
			ph += f / sr;
			a[ i ] = ( ( ph % 1 ) < 0.18 ? 1 : - 0.22 ) * 0.8 + nz[ i ] * 0.12;
		}
		lowpass( a, sr, 2600 ); highpass( a, sr, 250 );
		env( a, sr, 0.03, 0.12 ); normalize( a, 0.6 ); return a;
	},
	// a slingshot: the bands let go (a rubbery twang) and the pouch slaps
	arms_sling( sr ) {
		const n = Math.floor( 0.22 * sr ), a = new Float32Array( n ), nz = noise( n, 79 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = Math.sin( TAU * ( 140 + 60 * Math.exp( - t / 0.03 ) ) * t ) * Math.exp( - t / 0.05 ) * 0.7 + nz[ i ] * Math.exp( - t / 0.02 ) * 0.5; }
		click( a, sr, 0.003, 0.8, 1400, 0.002 );
		lowpass( a, sr, 4000 ); normalize( a, 0.6 ); return a;
	},
	// tin cans on a wire jangling against each other
	arms_rattle( sr ) {
		const T = 1.4, n = Math.floor( T * sr ), a = new Float32Array( n ), r = rng( 83 );
		for ( let t = 0.0; t < T - 0.1; t += 0.012 + Math.abs( r() ) * 0.05 ) {
			const amp = ( 0.4 + Math.abs( r() ) * 0.6 ) * Math.max( 0.15, 1 - t / T );
			for ( const f of [ 1800, 2700, 4100 ] ) click( a, sr, t, amp * ( f === 1800 ? 1 : 0.5 ), f * ( 0.9 + Math.abs( r() ) * 0.25 ), 0.006 );
		}
		highpass( a, sr, 600 ); normalize( a, 0.8 ); return a;
	},
	// a blow on a riot shield: a hollow plastic thud
	arms_block( sr ) {
		const n = Math.floor( 0.25 * sr ), a = noise( n, 89 );
		lowpass( a, sr, 900 );
		for ( let i = 0; i < n; i ++ ) { const t = i / sr; a[ i ] = a[ i ] * Math.exp( - t / 0.03 ) + Math.sin( TAU * 210 * t ) * Math.exp( - t / 0.06 ) * 0.6; }
		normalize( a, 0.8 ); return a;
	},
};

export const ARMS_SOUNDS = Object.keys( GEN );

export function ensureArmsSound( audio, name ) {
	if ( ! audio?.ctx || ! GEN[ name ] ) return false;
	if ( audio.buffers?.has( name ) ) return true;
	const sr = audio.ctx.sampleRate, data = GEN[ name ]( sr );
	const buf = audio.ctx.createBuffer( 1, data.length, sr );
	buf.copyToChannel( data, 0 );
	audio.buffers.set( name, buf );
	return true;
}

export function playArmsSound( game, name, opts = {} ) {
	const a = game?.audio;
	if ( ! a?.play ) return null;
	ensureArmsSound( a, name );
	return a.play( name, { vol: 0.7, ...opts } );
}

// the samples as plain arrays (test/ext-arms.mjs checks they render)
export const renderArmsSound = ( name, sr = 22050 ) => GEN[ name ]?.( sr ) || null;
