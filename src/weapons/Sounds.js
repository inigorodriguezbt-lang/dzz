// Weapon sounds the shared bank (src/audio/Synth.js) doesn't have: bows, flares, grenades, the flashbang
// ring, weapon handling clacks, supersonic cracks. Rendered sample by sample like Synth.js and handed to
// the audio engine with audio.buffers.set( name, AudioBuffer ) once its context exists.
const SR = 44100;

function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296 * 2 - 1; };
}
function biquad( x, type, f, q = 0.707 ) {
	const w = 2 * Math.PI * f / SR, c = Math.cos( w ), s = Math.sin( w ), a = s / ( 2 * q );
	let b0, b1, b2, a0, a1, a2;
	if ( type === 'lp' ) { b0 = ( 1 - c ) / 2; b1 = 1 - c; b2 = ( 1 - c ) / 2; }
	else if ( type === 'hp' ) { b0 = ( 1 + c ) / 2; b1 = - ( 1 + c ); b2 = ( 1 + c ) / 2; }
	else { b0 = a; b1 = 0; b2 = - a; }
	a0 = 1 + a; a1 = - 2 * c; a2 = 1 - a;
	b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
	let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
	for ( let i = 0; i < x.length; i ++ ) { const xi = x[ i ], y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = y; x[ i ] = y; }
	return x;
}
const buf = ( sec ) => new Float32Array( Math.max( 1, Math.floor( sec * SR ) ) );
function noise( sec, seed ) { const r = rng( seed ), x = buf( sec ); for ( let i = 0; i < x.length; i ++ ) x[ i ] = r(); return x; }
function envelope( x, attack, decay ) { const na = Math.max( 1, attack * SR ); for ( let i = 0; i < x.length; i ++ ) x[ i ] *= i < na ? i / na : Math.exp( - ( i - na ) / ( decay * SR ) ); return x; }
function mix( out, x, gain = 1, at = 0 ) { const o = Math.floor( at * SR ); for ( let i = 0; i < x.length && i + o < out.length; i ++ ) out[ i + o ] += x[ i ] * gain; return out; }
function norm( x, peak = 0.9 ) { let m = 0; for ( const v of x ) m = Math.max( m, Math.abs( v ) ); if ( m > 0 ) for ( let i = 0; i < x.length; i ++ ) x[ i ] *= peak / m; return x; }
function tone( sec, f0, f1, k = 0.05, seed = 1, harm = [ 1 ] ) {
	const x = buf( sec ), r = rng( seed );
	let ph = 0;
	for ( let i = 0; i < x.length; i ++ ) {
		const t = i / SR, f = f1 + ( f0 - f1 ) * Math.exp( - t / k );
		ph += 2 * Math.PI * f / SR;
		let v = 0;
		for ( let h = 0; h < harm.length; h ++ ) v += Math.sin( ph * ( h + 1 ) + r() * 0.01 ) * harm[ h ];
		x[ i ] = v;
	}
	return x;
}
function clack( f, dur, seed, q = 3, g = 1 ) { const x = noise( dur, seed ); biquad( x, 'bp', f, q ); return norm( envelope( x, 0.0004, dur * 0.22 ), 0.8 * g ); }
function thump( f, dur, seed, crunch = 0.3 ) {
	const out = buf( dur );
	mix( out, envelope( tone( dur, f * 2, f, 0.02, seed ), 0.001, dur * 0.3 ) );
	const n = noise( dur, seed + 1 ); biquad( n, 'lp', 700 + crunch * 2500 );
	mix( out, envelope( n, 0.001, dur * 0.18 ), 0.7 + crunch );
	return norm( out, 0.85 );
}
function sweep( sec, f0, f1, seed, q = 1.2 ) {
	const x = noise( sec, seed ), out = buf( sec ), blocks = 12, bl = Math.ceil( x.length / blocks );
	for ( let b = 0; b < blocks; b ++ ) {
		const seg = x.slice( b * bl, Math.min( x.length, ( b + 1 ) * bl + 256 ) );
		biquad( seg, 'bp', f0 + ( f1 - f0 ) * b / blocks, q );
		for ( let i = 0; i < bl && b * bl + i < out.length; i ++ ) out[ b * bl + i ] = seg[ i ];
	}
	for ( let i = 0; i < out.length; i ++ ) { const t = i / out.length; out[ i ] *= Math.sin( Math.PI * Math.pow( t, 0.6 ) ); }
	return norm( out, 0.6 );
}
function seq( total, parts ) { const out = buf( total ); for ( const [ x, t, g ] of parts ) mix( out, x, g ?? 1, t ); return out; }

export const WEAPON_SOUNDS = {
	// flare pistol: a soft pop and the hiss of the burning star leaving
	flare_fire: () => seq( 1.2, [ [ thump( 140, 0.2, 201, 0.8 ), 0 ], [ sweep( 1.0, 2400, 900, 202, 0.8 ), 0.02, 0.7 ] ] ),
	// bow: the string's twang and the limbs' thump
	bow_release: () => seq( 0.5, [ [ envelope( tone( 0.35, 190, 150, 0.08, 203, [ 1, 0.5, 0.3, 0.15 ] ), 0.001, 0.06 ), 0, 0.8 ], [ thump( 110, 0.12, 204, 0.2 ), 0, 0.7 ], [ sweep( 0.2, 800, 2400, 205 ), 0.03, 0.35 ] ] ),
	crossbow: () => seq( 0.5, [ [ clack( 2200, 0.03, 206, 4 ), 0, 0.8 ], [ envelope( tone( 0.3, 150, 120, 0.06, 207, [ 1, 0.6, 0.3 ] ), 0.001, 0.05 ), 0.005, 0.9 ], [ thump( 90, 0.15, 208, 0.3 ), 0.005, 0.8 ] ] ),
	bow_draw: () => { const x = noise( 0.7, 209 ); biquad( x, 'bp', 900, 5 ); for ( let i = 0; i < x.length; i ++ ) { const t = i / x.length; x[ i ] *= ( 0.5 + 0.5 * Math.sin( t * 60 ) ) * Math.sin( Math.PI * t ); } return norm( x, 0.35 ); },
	// grenade handling
	pin_pull: () => seq( 0.5, [ [ clack( 3000, 0.02, 210, 5 ), 0, 0.6 ], [ envelope( tone( 0.4, 4200, 4150, 1, 211, [ 1, 0.4 ] ), 0.001, 0.08 ), 0.03, 0.35 ], [ clack( 1800, 0.03, 212, 3 ), 0.1, 0.5 ] ] ),
	spoon: () => seq( 0.3, [ [ envelope( tone( 0.25, 2600, 2500, 1, 213, [ 1, 0.5, 0.2 ] ), 0.001, 0.04 ), 0, 0.5 ] ] ),
	grenade_bounce: () => seq( 0.3, [ [ envelope( tone( 0.2, 2400, 2350, 1, 214, [ 1, 0.7, 0.4 ] ), 0.0005, 0.03 ), 0, 0.6 ], [ thump( 180, 0.06, 215, 0.4 ), 0, 0.5 ] ] ),
	// flashbang: a hard, bright crack (the rumble of a frag is 'explosion')
	flashbang: () => {
		const out = buf( 1.6 );
		const c = noise( 0.08, 216 ); biquad( c, 'hp', 1200 );
		mix( out, envelope( c, 0.0003, 0.012 ), 1.4 );
		const b = noise( 1.5, 217 ); biquad( b, 'lp', 2600 );
		mix( out, envelope( b, 0.001, 0.12 ), 0.9 );
		mix( out, envelope( tone( 0.6, 120, 50, 0.08, 218 ), 0.001, 0.12 ), 0.8 );
		for ( let i = 0; i < out.length; i ++ ) out[ i ] = Math.tanh( out[ i ] * 2.5 );
		return norm( out, 1 );
	},
	// the ring in your ears after a blast
	tinnitus: () => { const x = tone( 5, 3900, 3900, 1, 219 ); const y = tone( 5, 4020, 4020, 1, 220 ); for ( let i = 0; i < x.length; i ++ ) { const t = i / SR; x[ i ] = ( x[ i ] * 0.7 + y[ i ] * 0.3 ) * Math.min( 1, t * 20 ) * Math.exp( - t / 1.8 ); } return norm( x, 0.35 ); },
	// a molotov catching
	fire_whoosh: () => { const x = sweep( 0.9, 300, 1400, 221, 0.6 ); const n = noise( 0.9, 222 ); biquad( n, 'lp', 900 ); envelope( n, 0.05, 0.3 ); return norm( mix( x, n, 0.8 ), 0.8 ); },
	smoke_hiss: () => { const x = noise( 3, 223 ); biquad( x, 'hp', 1800 ); biquad( x, 'lp', 7000 ); const f = Math.floor( 0.3 * SR ), n = x.length; for ( let i = 0; i < f; i ++ ) { const a = i / f; x[ i ] = x[ i ] * a + x[ n - f + i ] * ( 1 - a ); } return norm( x.slice( 0, n - f ), 0.5 ); },
	// impacts
	arrow_hit: () => seq( 0.3, [ [ thump( 220, 0.1, 224, 0.6 ), 0 ], [ clack( 1400, 0.03, 225, 3 ), 0, 0.5 ] ] ),
	punch: () => thump( 95, 0.16, 226, 0.25 ),
	shove: () => seq( 0.35, [ [ sweep( 0.2, 400, 1200, 227 ), 0, 0.5 ], [ thump( 80, 0.14, 228, 0.15 ), 0.08, 0.8 ] ] ),
	// weapon handling
	charge: () => seq( 0.35, [ [ clack( 1700, 0.05, 229, 3 ), 0 ], [ clack( 2400, 0.04, 230, 4 ), 0.13, 0.9 ] ] ),
	slide: () => seq( 0.3, [ [ clack( 2000, 0.045, 231, 3 ), 0 ], [ clack( 2900, 0.035, 232, 5 ), 0.09, 0.95 ] ] ),
	jam: () => seq( 0.25, [ [ clack( 900, 0.06, 233, 2 ), 0 ], [ clack( 1400, 0.03, 234, 3 ), 0.04, 0.4 ] ] ),
	cylinder_open: () => seq( 0.3, [ [ clack( 1500, 0.04, 235, 4 ), 0 ], [ clack( 2600, 0.025, 236, 5 ), 0.06, 0.6 ] ] ),
	cylinder_close: () => seq( 0.3, [ [ clack( 1200, 0.05, 237, 3 ), 0 ], ...[ 0, 1, 2 ].map( k => [ clack( 3200, 0.012, 238 + k, 6 ), 0.05 + k * 0.03, 0.3 ] ) ] ),
	break_open: () => seq( 0.4, [ [ clack( 900, 0.06, 241, 2 ), 0 ], [ thump( 160, 0.08, 242, 0.5 ), 0.05, 0.6 ] ] ),
	break_close: () => seq( 0.3, [ [ thump( 140, 0.09, 243, 0.6 ), 0 ], [ clack( 1600, 0.04, 244, 3 ), 0.01, 0.8 ] ] ),
	shell_drop: () => seq( 0.3, [ [ clack( 700, 0.05, 245, 2, 0.6 ), 0 ], [ clack( 900, 0.04, 246, 2, 0.3 ), 0.09 ] ] ),
	holster: () => seq( 0.35, [ [ sweep( 0.25, 600, 1800, 247 ), 0, 0.5 ], [ clack( 1200, 0.04, 248, 2 ), 0.2, 0.4 ] ] ),
	equip: () => seq( 0.35, [ [ clack( 1400, 0.035, 249, 3 ), 0, 0.5 ], [ sweep( 0.22, 1600, 700, 250 ), 0.03, 0.4 ] ] ),
	// a supersonic round passing close: a sharp N-wave crack
	crack: () => { const x = buf( 0.12 ); const L = Math.floor( 0.0006 * SR ); for ( let i = 0; i < L * 2; i ++ ) x[ i ] = i < L ? 1 - i / L : - ( ( i - L ) / L ); const n = noise( 0.12, 251 ); biquad( n, 'hp', 3000 ); mix( x, envelope( n, 0.0002, 0.01 ), 0.4 ); return norm( x, 0.9 ); },
	flashlight: () => clack( 3400, 0.02, 252, 6, 0.6 ),
};

let pending = null;
// render the bank into the audio engine a few sounds per frame (the context only exists after a user gesture)
export function ensureWeaponSounds( audio ) {
	if ( ! audio?.ctx || pending === false ) return;
	if ( ! pending ) pending = Object.keys( WEAPON_SOUNDS ).filter( n => ! audio.buffers.has( n ) );
	const t0 = performance.now();
	while ( pending.length && performance.now() - t0 < 4 ) {
		const name = pending.shift();
		const data = WEAPON_SOUNDS[ name ]();
		const b = audio.ctx.createBuffer( 1, data.length, SR );
		b.copyToChannel( data, 0 );
		audio.buffers.set( name, b );
	}
	if ( ! pending.length ) pending = false;
}

// for the Node test / previews
export function renderWeaponSound( name ) { return WEAPON_SOUNDS[ name ]?.(); }
