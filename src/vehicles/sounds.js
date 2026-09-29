// Vehicle sounds the shared bank (audio/Synth.js) doesn't have, rendered once into the audio engine's buffer
// map when the audio context exists: tyre squeal, road roar, a siren wail, a looping horn, door clunks.
// Loops are built from whole periods (or cross-faded) so they repeat without a click.

const SR = 44100;

function rng( seed ) {
	let a = seed >>> 0;
	return () => { a = ( a + 0x6D2B79F5 ) >>> 0; let t = a; t = Math.imul( t ^ ( t >>> 15 ), t | 1 ); t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 ); return ( ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296 ) * 2 - 1; };
}

// two-pole resonant band pass (state variable filter)
function bandpass( x, f, q ) {
	const out = new Float32Array( x.length );
	const k = 2 * Math.sin( Math.PI * f / SR );
	let low = 0, band = 0;
	for ( let i = 0; i < x.length; i ++ ) {
		const high = x[ i ] - low - band / q;
		band += k * high;
		low += k * band;
		out[ i ] = band;
	}
	return out;
}

function lowpass( x, f ) {
	const a = 1 - Math.exp( - 2 * Math.PI * f / SR );
	let y = 0;
	for ( let i = 0; i < x.length; i ++ ) { y += ( x[ i ] - y ) * a; x[ i ] = y; }
	return x;
}

function normalize( x, peak = 0.8 ) {
	let m = 1e-6;
	for ( let i = 0; i < x.length; i ++ ) m = Math.max( m, Math.abs( x[ i ] ) );
	for ( let i = 0; i < x.length; i ++ ) x[ i ] *= peak / m;
	return x;
}

// make a noise-based buffer loop seamlessly: cross-fade its tail into its head
function seamless( x, fade = 0.15 ) {
	const n = Math.floor( fade * SR ), L = x.length - n;
	const out = new Float32Array( L );
	for ( let i = 0; i < L; i ++ ) out[ i ] = x[ i ];
	for ( let i = 0; i < n; i ++ ) { const t = i / n; out[ i ] = x[ i ] * t + x[ L + i ] * ( 1 - t ); }
	return out;
}

const GEN = {
	// rubber scrubbing on asphalt: resonant noise wobbling around 1 kHz
	veh_skid() {
		const n = Math.floor( 2.2 * SR ), r = rng( 901 );
		const w = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) w[ i ] = r();
		const a = bandpass( w, 950, 9 ), b = bandpass( w, 1500, 7 );
		const out = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) { const t = i / SR; out[ i ] = a[ i ] * ( 0.8 + 0.2 * Math.sin( t * 23 ) ) + b[ i ] * 0.5 * ( 0.7 + 0.3 * Math.sin( t * 31 + 1 ) ); }
		return normalize( seamless( out ), 0.7 );
	},
	// tyres rolling and wind on the body: low rumble with a little hiss
	veh_road() {
		const n = Math.floor( 3 * SR ), r = rng( 902 );
		const w = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) w[ i ] = r();
		const lo = lowpass( Float32Array.from( w ), 180 ), mid = bandpass( w, 600, 1.2 );
		const out = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) out[ i ] = lo[ i ] * 3 + mid[ i ] * 0.25;
		return normalize( seamless( out, 0.3 ), 0.6 );
	},
	// US wail: a sweep up and down between 650 and 1500 Hz every 4 s (a whole number of cycles)
	veh_siren() {
		const T = 4, n = T * SR;
		const out = new Float32Array( n );
		let ph = 0;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / SR;
			const s = 0.5 - 0.5 * Math.cos( t / T * Math.PI * 2 );
			const f = 650 + 850 * s;
			ph += f / SR;
			const x = ph - Math.floor( ph );
			// a rounded square: bright like a horn speaker
			out[ i ] = Math.tanh( Math.sin( x * Math.PI * 2 ) * 3 ) * 0.7 + Math.sin( x * Math.PI * 4 ) * 0.15;
		}
		return normalize( lowpass( out, 4200 ), 0.75 );
	},
	// a steady two-tone car horn (420 + 520 Hz, whole periods in 0.5 s)
	veh_horn() {
		const n = Math.floor( 0.5 * SR );
		const out = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / SR;
			out[ i ] = Math.tanh( Math.sin( t * Math.PI * 2 * 420 ) * 4 ) * 0.5 + Math.tanh( Math.sin( t * Math.PI * 2 * 520 ) * 4 ) * 0.5;
		}
		return normalize( lowpass( out, 2600 ), 0.6 );
	},
	// a heavy truck / boat horn
	veh_horn_low() {
		const n = Math.floor( 0.5 * SR );
		const out = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / SR;
			out[ i ] = Math.tanh( Math.sin( t * Math.PI * 2 * 180 ) * 3 ) * 0.6 + Math.tanh( Math.sin( t * Math.PI * 2 * 226 ) * 3 ) * 0.4;
		}
		return normalize( lowpass( out, 1600 ), 0.65 );
	},
	// a car door shutting: a thump and the latch
	veh_door() {
		const n = Math.floor( 0.35 * SR ), r = rng( 903 );
		const out = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / SR;
			const thump = Math.sin( t * Math.PI * 2 * ( 70 + 40 * Math.exp( - t * 30 ) ) ) * Math.exp( - t * 22 );
			const latch = t > 0.012 ? r() * Math.exp( - ( t - 0.012 ) * 160 ) * 0.5 : 0;
			out[ i ] = thump + latch;
		}
		return normalize( out, 0.8 );
	},
	// a starter that cranks but doesn't catch
	veh_crank() {
		const n = Math.floor( 1.0 * SR ), r = rng( 904 );
		const out = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) {
			const t = i / SR;
			const beat = 0.5 + 0.5 * Math.sin( t * Math.PI * 2 * 7 );
			out[ i ] = ( Math.sin( t * Math.PI * 2 * 95 ) * 0.6 + r() * 0.25 ) * ( 0.4 + beat * 0.6 ) * Math.min( 1, t * 20 ) * Math.min( 1, ( 1 - t ) * 6 );
		}
		return normalize( lowpass( out, 1800 ), 0.6 );
	},
	// fuel glugging from a can into a tank
	veh_pour() {
		const n = Math.floor( 1.6 * SR ), r = rng( 905 );
		const w = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) w[ i ] = r();
		const b = bandpass( w, 380, 4 );
		const out = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) { const t = i / SR; out[ i ] = b[ i ] * Math.pow( 0.5 + 0.5 * Math.sin( t * Math.PI * 2 * 5.5 ), 3 ); }
		return normalize( seamless( out, 0.2 ), 0.5 );
	},
};

export const VEHICLE_SOUNDS = Object.keys( GEN );

// render every sound not yet in the bank (call again after the context starts; cheap once done)
export function ensureVehicleSounds( audio ) {
	if ( ! audio?.ctx || ! audio.buffers ) return false;
	for ( const name of VEHICLE_SOUNDS ) {
		if ( audio.buffers.has( name ) ) continue;
		const data = GEN[ name ]();
		const buf = audio.ctx.createBuffer( 1, data.length, SR );
		buf.copyToChannel( data, 0 );
		audio.buffers.set( name, buf );
	}
	return true;
}
