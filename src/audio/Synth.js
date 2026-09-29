// Procedural sound effects rendered into AudioBuffers at startup: gunshots by calibre, suppressed
// shots, weapon handling, impacts, melee, the infected, the body, doors, vehicles and weather loops.
// Everything is computed sample by sample in JS (noise, oscillators, biquads, envelopes, echoes).

const SR = 44100;

function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296 * 2 - 1; };
}

// RBJ biquad, processed in place
function biquad( x, type, f, q = 0.707, gainDb = 0 ) {
	const w = 2 * Math.PI * f / SR, c = Math.cos( w ), s = Math.sin( w ), a = s / ( 2 * q ), A = Math.pow( 10, gainDb / 40 );
	let b0, b1, b2, a0, a1, a2;
	switch ( type ) {
		case 'lp': b0 = ( 1 - c ) / 2; b1 = 1 - c; b2 = ( 1 - c ) / 2; a0 = 1 + a; a1 = - 2 * c; a2 = 1 - a; break;
		case 'hp': b0 = ( 1 + c ) / 2; b1 = - ( 1 + c ); b2 = ( 1 + c ) / 2; a0 = 1 + a; a1 = - 2 * c; a2 = 1 - a; break;
		case 'bp': b0 = a; b1 = 0; b2 = - a; a0 = 1 + a; a1 = - 2 * c; a2 = 1 - a; break;
		case 'peak': b0 = 1 + a * A; b1 = - 2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = - 2 * c; a2 = 1 - a / A; break;
	}
	b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
	let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
	for ( let i = 0; i < x.length; i ++ ) {
		const xi = x[ i ];
		const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
		x2 = x1; x1 = xi; y2 = y1; y1 = y;
		x[ i ] = y;
	}
	return x;
}

function env( n, attack, decay, shape = 1 ) {
	const e = new Float32Array( n );
	const na = Math.max( 1, attack * SR );
	for ( let i = 0; i < n; i ++ ) e[ i ] = i < na ? i / na : Math.pow( Math.exp( - ( i - na ) / ( decay * SR ) ), shape );
	return e;
}

function noise( n, seed ) { const r = rng( seed ), x = new Float32Array( n ); for ( let i = 0; i < n; i ++ ) x[ i ] = r(); return x; }

function mix( out, x, gain = 1, offset = 0 ) {
	const o = Math.floor( offset * SR );
	for ( let i = 0; i < x.length && i + o < out.length; i ++ ) out[ i + o ] += x[ i ] * gain;
	return out;
}
function mul( x, e ) { for ( let i = 0; i < x.length; i ++ ) x[ i ] *= e[ i ] ?? 0; return x; }
function normalize( x, peak = 0.9 ) { let m = 0; for ( const v of x ) m = Math.max( m, Math.abs( v ) ); if ( m > 0 ) for ( let i = 0; i < x.length; i ++ ) x[ i ] *= peak / m; return x; }
function softclip( x, k = 1.5 ) { for ( let i = 0; i < x.length; i ++ ) x[ i ] = Math.tanh( x[ i ] * k ) / Math.tanh( k ); return x; }

// outdoor tail: a few discrete echoes off terrain and a diffuse decay
function tail( x, len, seed, amount = 0.25, lp = 900 ) {
	const out = new Float32Array( x.length + Math.floor( len * SR ) );
	out.set( x );
	const r = rng( seed );
	for ( let k = 0; k < 6; k ++ ) {
		const d = 0.08 + Math.abs( r() ) * len * 0.7, g = amount * Math.exp( - d / ( len * 0.5 ) ) * ( 0.5 + Math.abs( r() ) * 0.5 );
		const echo = biquad( Float32Array.from( x ), 'lp', lp * ( 0.6 + Math.abs( r() ) * 0.6 ) );
		mix( out, echo, g, d );
	}
	const n = noise( Math.floor( len * SR ), seed + 9 );
	biquad( n, 'lp', lp * 0.6 ); biquad( n, 'lp', lp * 0.6 );
	mix( out, mul( n, env( n.length, 0.02, len * 0.28 ) ), amount * 0.35, 0.03 );
	return out;
}

function sine( n, f0, f1, decay, seed = 0 ) {
	const x = new Float32Array( n ); let ph = 0;
	const r = rng( seed + 3 );
	for ( let i = 0; i < n; i ++ ) {
		const t = i / SR;
		const f = f1 + ( f0 - f1 ) * Math.exp( - t / decay );
		ph += 2 * Math.PI * f / SR;
		x[ i ] = Math.sin( ph + r() * 0.02 );
	}
	return x;
}

const GUNS = {
	pistol: { crack: 0.012, body: 0.07, bodyF: [ 180, 70 ], len: 0.9, lp: 2400, tailAmt: 0.22, hp: 400 },
	revolver: { crack: 0.016, body: 0.1, bodyF: [ 150, 55 ], len: 1.2, lp: 1800, tailAmt: 0.28, hp: 300 },
	smg: { crack: 0.01, body: 0.055, bodyF: [ 200, 80 ], len: 0.7, lp: 2600, tailAmt: 0.18, hp: 450 },
	rifle: { crack: 0.009, body: 0.08, bodyF: [ 160, 60 ], len: 1.6, lp: 1600, tailAmt: 0.33, hp: 600 },
	sniper: { crack: 0.012, body: 0.13, bodyF: [ 120, 45 ], len: 2.4, lp: 1200, tailAmt: 0.4, hp: 350 },
	shotgun: { crack: 0.02, body: 0.14, bodyF: [ 110, 42 ], len: 1.7, lp: 1300, tailAmt: 0.36, hp: 200 },
	lmg: { crack: 0.009, body: 0.09, bodyF: [ 150, 55 ], len: 1.5, lp: 1500, tailAmt: 0.32, hp: 500 },
	magnum: { crack: 0.018, body: 0.14, bodyF: [ 130, 45 ], len: 1.6, lp: 1500, tailAmt: 0.33, hp: 250 },
};

function gunshot( kind, seed ) {
	const g = GUNS[ kind ];
	const n = Math.floor( 0.5 * SR );
	const out = new Float32Array( n );
	const crack = noise( Math.floor( 0.06 * SR ), seed );
	biquad( crack, 'hp', g.hp ); biquad( crack, 'peak', 2800, 1, 6 );
	mix( out, mul( crack, env( crack.length, 0.0005, g.crack ) ), 1.2 );
	const body = sine( Math.floor( 0.4 * SR ), g.bodyF[ 0 ], g.bodyF[ 1 ], g.body * 0.6, seed );
	mix( out, mul( body, env( body.length, 0.001, g.body ) ), 0.9 );
	const blast = noise( Math.floor( 0.45 * SR ), seed + 1 );
	biquad( blast, 'lp', g.lp ); biquad( blast, 'lp', g.lp * 1.2 );
	mix( out, mul( blast, env( blast.length, 0.001, g.body * 1.6, 1.2 ) ), 1.1 );
	softclip( out, 2.2 );
	return normalize( tail( out, g.len, seed + 2, g.tailAmt, g.lp * 0.7 ), 0.95 );
}

function suppressed( kind, seed ) {
	const n = Math.floor( 0.35 * SR );
	const out = new Float32Array( n );
	const puff = noise( n, seed );
	biquad( puff, 'lp', kind === 'sniper' ? 900 : 1400 ); biquad( puff, 'hp', 120 );
	mix( out, mul( puff, env( n, 0.001, 0.035 ) ), 1 );
	const thump = sine( n, 120, 60, 0.02, seed );
	mix( out, mul( thump, env( n, 0.001, 0.03 ) ), 0.6 );
	// the action cycling
	const click = noise( Math.floor( 0.03 * SR ), seed + 5 );
	biquad( click, 'bp', 3200, 3 );
	mix( out, mul( click, env( click.length, 0.0005, 0.004 ) ), 0.5, 0.045 );
	return normalize( tail( out, 0.3, seed, 0.1, 1200 ), 0.7 );
}

function click( f, dur, seed, q = 4, gain = 1 ) {
	const n = Math.floor( dur * SR ), x = noise( n, seed );
	biquad( x, 'bp', f, q );
	mul( x, env( n, 0.0005, dur * 0.25 ) );
	return normalize( x, 0.8 * gain );
}

function seq( parts, total ) {
	const out = new Float32Array( Math.floor( total * SR ) );
	for ( const [ buf, t, g ] of parts ) mix( out, buf, g ?? 1, t );
	return out;
}

function whoosh( dur, f0, f1, seed ) {
	const n = Math.floor( dur * SR ), x = noise( n, seed ), out = new Float32Array( n );
	// sweep a band-pass
	const blocks = 16, bl = Math.ceil( n / blocks );
	for ( let b = 0; b < blocks; b ++ ) {
		const seg = x.slice( b * bl, Math.min( n, ( b + 1 ) * bl + 512 ) );
		biquad( seg, 'bp', f0 + ( f1 - f0 ) * ( b / blocks ), 1.2 );
		for ( let i = 0; i < bl && b * bl + i < n; i ++ ) out[ b * bl + i ] = seg[ i ];
	}
	const e = new Float32Array( n );
	for ( let i = 0; i < n; i ++ ) { const t = i / n; e[ i ] = Math.sin( Math.PI * Math.pow( t, 0.7 ) ); }
	return normalize( mul( out, e ), 0.6 );
}

function thud( f, dur, seed, crunch = 0 ) {
	const n = Math.floor( dur * SR ), out = new Float32Array( n );
	mix( out, mul( sine( n, f * 2, f, 0.02, seed ), env( n, 0.001, dur * 0.3 ) ), 1 );
	const x = noise( n, seed ); biquad( x, 'lp', 900 + crunch * 2000 );
	mix( out, mul( x, env( n, 0.001, dur * 0.2 ) ), 0.8 + crunch );
	return normalize( softclip( out, 1.5 ), 0.85 );
}

// the infected: a sawtooth larynx through vowel formants, with jitter and breath
function voice( dur, f0, seed, { formants = [ 520, 1150, 2500 ], rough = 0.6, breath = 0.35, rise = 0, scream = false } = {} ) {
	const n = Math.floor( dur * SR );
	const r = rng( seed );
	const src = new Float32Array( n );
	let ph = 0, jit = 0;
	for ( let i = 0; i < n; i ++ ) {
		const t = i / n;
		if ( i % 400 === 0 ) jit = r() * rough;
		const f = f0 * ( 1 + jit * 0.25 + rise * t + Math.sin( i / SR * 2 * Math.PI * 6 ) * 0.03 * rough );
		ph += f / SR;
		const saw = 2 * ( ph - Math.floor( ph + 0.5 ) );
		src[ i ] = saw * ( 0.7 + 0.3 * Math.sin( i / SR * 2 * Math.PI * ( 18 + rough * 20 ) ) ) + r() * breath;
	}
	const out = new Float32Array( n );
	formants.forEach( ( F, k ) => {
		const b = Float32Array.from( src );
		biquad( b, 'bp', F * ( scream ? 1.35 : 1 ), 6 );
		mix( out, b, [ 1, 0.7, 0.35 ][ k ] || 0.3 );
	} );
	const e = new Float32Array( n );
	for ( let i = 0; i < n; i ++ ) { const t = i / n; e[ i ] = Math.min( 1, t * 12 ) * Math.pow( 1 - t, 1.3 ) * ( 0.75 + 0.25 * Math.sin( t * 23 + seed ) ); }
	mul( out, e );
	softclip( out, 2.5 );
	return normalize( out, 0.8 );
}

function loopNoise( dur, lp, hp, seed, mod = 0 ) {
	const n = Math.floor( dur * SR ), x = noise( n, seed );
	biquad( x, 'lp', lp ); if ( hp ) biquad( x, 'hp', hp );
	if ( mod ) for ( let i = 0; i < n; i ++ ) x[ i ] *= 1 + mod * Math.sin( i / SR * 2 * Math.PI * 0.3 );
	// crossfade the ends so it loops cleanly
	const f = Math.floor( 0.3 * SR );
	for ( let i = 0; i < f; i ++ ) { const a = i / f; x[ i ] = x[ i ] * a + x[ n - f + i ] * ( 1 - a ); }
	return normalize( x.slice( 0, n - f ), 0.7 );
}

function rainLoop( seed ) {
	const x = loopNoise( 6, 5000, 400, seed );
	const r = rng( seed );
	// droplets
	for ( let k = 0; k < 900; k ++ ) {
		const t = Math.abs( r() ) * 5.4, f = 2000 + Math.abs( r() ) * 4000;
		mix( x, click( f, 0.012, seed + k, 6, 0.3 ), 0.12 * Math.abs( r() ), t );
	}
	return normalize( x, 0.7 );
}

function explosion( seed ) {
	const n = Math.floor( 1.2 * SR ), out = new Float32Array( n );
	const x = noise( n, seed ); biquad( x, 'lp', 500 ); biquad( x, 'lp', 700 );
	mix( out, mul( x, env( n, 0.002, 0.35, 0.8 ) ), 1.5 );
	mix( out, mul( sine( n, 60, 28, 0.2, seed ), env( n, 0.002, 0.4 ) ), 1.2 );
	const c = noise( Math.floor( 0.05 * SR ), seed + 1 ); biquad( c, 'hp', 800 );
	mix( out, mul( c, env( c.length, 0.0005, 0.01 ) ), 0.8 );
	softclip( out, 3 );
	return normalize( tail( out, 3, seed, 0.45, 500 ), 1 );
}

function glass( seed ) {
	const n = Math.floor( 0.8 * SR ), out = new Float32Array( n );
	const r = rng( seed );
	for ( let k = 0; k < 40; k ++ ) {
		const t = Math.abs( r() ) * 0.5, f = 2500 + Math.abs( r() ) * 6000;
		const n2 = Math.floor( 0.15 * SR );
		const s = sine( n2, f, f * 0.98, 1, seed + k );
		mix( out, mul( s, env( n2, 0.0005, 0.02 + Math.abs( r() ) * 0.05 ) ), 0.25 * Math.abs( r() ), t * t );
	}
	const x = noise( n, seed + 3 ); biquad( x, 'hp', 2000 );
	mix( out, mul( x, env( n, 0.001, 0.05 ) ), 0.6 );
	return normalize( out, 0.8 );
}

function engineLoop( base, seed, cyl = 4 ) {
	const n = Math.floor( 2 * SR ), out = new Float32Array( n );
	let ph = 0;
	const r = rng( seed );
	for ( let i = 0; i < n; i ++ ) {
		ph += base / SR;
		const p = ph - Math.floor( ph );
		// firing pulses
		out[ i ] = Math.exp( - p * 6 ) * ( 0.8 + 0.2 * r() ) + Math.sin( ph * 2 * Math.PI * cyl / 2 ) * 0.3;
	}
	biquad( out, 'lp', base * 8 );
	const x = noise( n, seed + 1 ); biquad( x, 'bp', base * 12, 1 );
	mix( out, x, 0.15 );
	return normalize( out, 0.7 );
}

function rotorLoop( seed ) {
	const n = Math.floor( 2 * SR ), out = new Float32Array( n );
	const x = noise( n, seed ); biquad( x, 'lp', 400 );
	for ( let i = 0; i < n; i ++ ) {
		const t = i / SR;
		const blade = Math.pow( 0.5 + 0.5 * Math.cos( t * 2 * Math.PI * 12 ), 6 );
		out[ i ] = x[ i ] * ( 0.3 + 1.6 * blade ) + Math.sin( t * 2 * Math.PI * 24 ) * 0.2 * blade;
	}
	const turb = noise( n, seed + 2 ); biquad( turb, 'bp', 1800, 2 );
	mix( out, turb, 0.12 );
	return normalize( out, 0.8 );
}

// name -> generator; each returns a Float32Array at 44.1 kHz (mono)
export const SYNTH = {
	gun_pistol: () => gunshot( 'pistol', 11 ), gun_revolver: () => gunshot( 'revolver', 12 ), gun_smg: () => gunshot( 'smg', 13 ),
	gun_rifle: () => gunshot( 'rifle', 14 ), gun_sniper: () => gunshot( 'sniper', 15 ), gun_shotgun: () => gunshot( 'shotgun', 16 ),
	gun_lmg: () => gunshot( 'lmg', 17 ), gun_magnum: () => gunshot( 'magnum', 18 ),
	gun_rifle2: () => gunshot( 'rifle', 24 ), gun_pistol2: () => gunshot( 'pistol', 25 ),
	gun_supp: () => suppressed( 'rifle', 21 ), gun_supp_pistol: () => suppressed( 'pistol', 22 ), gun_supp_sniper: () => suppressed( 'sniper', 23 ),
	dryfire: () => click( 2500, 0.05, 31, 5 ),
	mag_out: () => seq( [ [ click( 1800, 0.05, 32, 3 ), 0 ], [ click( 900, 0.08, 33, 2 ), 0.05, 0.6 ] ], 0.2 ),
	mag_in: () => seq( [ [ click( 1400, 0.05, 34, 3 ), 0 ], [ click( 2600, 0.04, 35, 4 ), 0.03, 0.9 ] ], 0.15 ),
	bolt: () => seq( [ [ click( 1600, 0.06, 36, 3 ), 0 ], [ click( 2200, 0.05, 37, 4 ), 0.12 ] ], 0.25 ),
	pump: () => seq( [ [ click( 900, 0.08, 38, 2 ), 0 ], [ click( 1300, 0.07, 39, 3 ), 0.16 ] ], 0.3 ),
	shell_in: () => click( 1500, 0.06, 40, 3 ),
	casing: () => seq( [ [ click( 5200, 0.03, 41, 8, 0.6 ), 0 ], [ click( 4800, 0.03, 42, 8, 0.4 ), 0.07 ], [ click( 5000, 0.02, 43, 8, 0.25 ), 0.13 ] ], 0.2 ),
	switch_mode: () => click( 3000, 0.03, 44, 6 ),
	bow: () => seq( [ [ whoosh( 0.25, 300, 900, 45 ), 0 ], [ thud( 120, 0.1, 46 ), 0, 0.5 ] ], 0.3 ),
	swing: () => whoosh( 0.28, 400, 1600, 51 ), swing_heavy: () => whoosh( 0.4, 250, 900, 52 ),
	hit_flesh: () => thud( 90, 0.18, 53, 0.3 ), hit_blade: () => seq( [ [ thud( 110, 0.14, 54, 0.8 ), 0 ], [ click( 3500, 0.05, 55, 2, 0.5 ), 0 ] ], 0.2 ),
	hit_wood: () => seq( [ [ thud( 180, 0.12, 56, 0.2 ), 0 ], [ click( 900, 0.08, 57, 3 ), 0, 0.6 ] ], 0.2 ),
	hit_metal: () => seq( [ [ sine( Math.floor( 0.5 * SR ), 1800, 1750, 1, 58 ).map( ( v, i ) => v * Math.exp( - i / SR / 0.08 ) ), 0 ], [ click( 4000, 0.03, 59, 2 ), 0 ] ], 0.5 ),
	hit_concrete: () => seq( [ [ click( 2200, 0.05, 60, 1.5 ), 0 ], [ thud( 140, 0.08, 61, 0.6 ), 0, 0.5 ] ], 0.15 ),
	ricochet: () => ( () => { const n = Math.floor( 0.4 * SR ); const s = sine( n, 3200, 1800, 0.2, 62 ); return normalize( mul( s, env( n, 0.002, 0.1 ) ), 0.5 ); } )(),
	whiz: () => whoosh( 0.12, 2000, 5000, 63 ),
	headshot: () => seq( [ [ thud( 70, 0.2, 64, 1 ), 0 ], [ click( 1200, 0.06, 65, 1 ), 0.01, 0.7 ] ], 0.25 ),
	z_groan1: () => voice( 1.6, 92, 71 ), z_groan2: () => voice( 1.9, 78, 72, { formants: [ 450, 900, 2300 ] } ),
	z_groan3: () => voice( 1.3, 110, 73, { formants: [ 620, 1250, 2600 ], rough: 0.9 } ),
	z_groan4: () => voice( 2.2, 70, 74, { formants: [ 400, 800, 2200 ], rough: 0.5, breath: 0.5 } ),
	z_alert: () => voice( 1.1, 140, 75, { rise: 0.8, rough: 1, breath: 0.3, scream: true } ),
	z_scream: () => voice( 1.4, 210, 76, { rise: 0.4, rough: 1.2, scream: true, formants: [ 700, 1400, 3000 ] } ),
	z_attack: () => voice( 0.7, 160, 77, { rough: 1.3, breath: 0.4, scream: true } ),
	z_die: () => voice( 1.2, 85, 78, { rise: - 0.5, rough: 0.8, breath: 0.6 } ),
	z_step: () => thud( 80, 0.09, 79, 0.1 ),
	hurt: () => voice( 0.35, 180, 81, { formants: [ 700, 1200, 2600 ], rough: 0.4, breath: 0.25 } ),
	hurt2: () => voice( 0.3, 200, 82, { formants: [ 650, 1100, 2500 ], rough: 0.4, breath: 0.25 } ),
	death: () => voice( 1.2, 140, 83, { rise: - 0.5, rough: 0.6 } ),
	bonebreak: () => seq( [ [ click( 1600, 0.05, 84, 1 ), 0 ], [ click( 2200, 0.04, 85, 1 ), 0.03 ], [ thud( 100, 0.1, 86 ), 0, 0.6 ] ], 0.2 ),
	vomit: () => ( () => { const x = loopNoise( 1.3, 900, 150, 87 ); return normalize( mul( x, env( x.length, 0.05, 0.4 ) ), 0.6 ); } )(),
	eat: () => seq( Array.from( { length: 5 }, ( _, k ) => [ click( 1200 + k * 150, 0.08, 88 + k, 1.5, 0.6 ), k * 0.22 ] ), 1.2 ),
	drink: () => seq( Array.from( { length: 4 }, ( _, k ) => [ ( () => { const n = Math.floor( 0.15 * SR ); const s = sine( n, 500, 300, 0.05, 90 + k ); return mul( s, env( n, 0.01, 0.05 ) ); } )(), k * 0.3, 0.5 ] ), 1.3 ),
	bandage: () => seq( Array.from( { length: 6 }, ( _, k ) => [ whoosh( 0.2, 1500, 3000, 95 + k ), k * 0.35, 0.4 ] ), 2.2 ),
	zipper: () => whoosh( 0.35, 2500, 5000, 101 ),
	pickup: () => seq( [ [ click( 800, 0.06, 102, 2 ), 0 ], [ whoosh( 0.12, 1200, 2400, 103 ), 0.02, 0.4 ] ], 0.2 ),
	drop: () => thud( 150, 0.1, 104, 0.3 ),
	door_open: () => seq( [ [ click( 700, 0.08, 105, 2 ), 0 ], [ ( () => { const n = Math.floor( 0.5 * SR ); const s = sine( n, 340, 420, 0.3, 106 ); return mul( s, env( n, 0.05, 0.15 ) ); } )(), 0.05, 0.25 ] ], 0.6 ),
	door_close: () => seq( [ [ thud( 110, 0.15, 107, 0.4 ), 0 ], [ click( 1500, 0.04, 108, 3 ), 0.02, 0.6 ] ], 0.25 ),
	door_locked: () => seq( [ [ click( 1200, 0.05, 109, 3 ), 0 ], [ click( 1300, 0.05, 110, 3 ), 0.12 ] ], 0.25 ),
	door_break: () => seq( [ [ thud( 90, 0.3, 111, 0.9 ), 0 ], [ click( 600, 0.2, 112, 1 ), 0.02 ] ], 0.5 ),
	container_open: () => seq( [ [ click( 900, 0.06, 113, 2 ), 0 ], [ whoosh( 0.15, 800, 1600, 114 ), 0.03, 0.3 ] ], 0.25 ),
	glass: () => glass( 115 ),
	explosion: () => explosion( 116 ),
	land: () => thud( 90, 0.15, 117, 0.2 ),
	vault: () => seq( [ [ thud( 130, 0.1, 118, 0.2 ), 0 ], [ whoosh( 0.2, 500, 1000, 119 ), 0.05, 0.4 ] ], 0.35 ),
	ui_click: () => click( 2400, 0.03, 120, 4, 0.5 ), ui_hover: () => click( 3200, 0.02, 121, 6, 0.25 ),
	ui_open: () => whoosh( 0.18, 900, 2200, 122 ), ui_error: () => seq( [ [ ( () => { const n = Math.floor( 0.12 * SR ); return mul( sine( n, 220, 200, 1, 123 ), env( n, 0.005, 0.05 ) ); } )(), 0 ], [ ( () => { const n = Math.floor( 0.12 * SR ); return mul( sine( n, 180, 160, 1, 124 ), env( n, 0.005, 0.05 ) ); } )(), 0.1 ] ], 0.3 ),
	step_concrete: () => click( 1100, 0.07, 125, 1.2 ), step_metal: () => seq( [ [ click( 2300, 0.05, 126, 3 ), 0 ], [ click( 900, 0.06, 127, 2, 0.5 ), 0 ] ], 0.1 ),
	rain: () => rainLoop( 131 ), wind_loop: () => loopNoise( 6, 500, 60, 132, 0.5 ), fire_loop: () => ( () => { const x = loopNoise( 4, 1800, 200, 133, 0.3 ); const r = rng( 134 ); for ( let k = 0; k < 120; k ++ ) mix( x, click( 1500 + Math.abs( r() ) * 3000, 0.02, 135 + k, 3, 0.6 ), 0.3, Math.abs( r() ) * 3.6 ); return normalize( x, 0.6 ); } )(),
	engine_car: () => engineLoop( 32, 141, 4 ), engine_truck: () => engineLoop( 24, 142, 6 ), engine_bike: () => engineLoop( 45, 143, 2 ),
	engine_boat: () => engineLoop( 28, 144, 4 ), rotor: () => rotorLoop( 145 ), horn: () => ( () => { const n = Math.floor( 0.6 * SR ), o = new Float32Array( n ); for ( let i = 0; i < n; i ++ ) { const t = i / SR; o[ i ] = Math.sign( Math.sin( t * 2 * Math.PI * 420 ) ) * 0.3 + Math.sign( Math.sin( t * 2 * Math.PI * 520 ) ) * 0.3; } biquad( o, 'lp', 2500 ); return normalize( mul( o, env( n, 0.01, 1 ) ), 0.6 ); } )(),
	crash: () => seq( [ [ thud( 70, 0.4, 146, 1 ), 0 ], [ glass( 147 ), 0.05, 0.5 ], [ click( 800, 0.3, 148, 0.8 ), 0 ] ], 1.0 ),
	engine_start: () => seq( [ [ engineLoop( 14, 149, 4 ).slice( 0, Math.floor( 0.6 * SR ) ), 0, 0.6 ], [ engineLoop( 30, 150, 4 ).slice( 0, Math.floor( 0.5 * SR ) ), 0.6 ] ], 1.1 ),
	thunder: () => ( () => { const n = Math.floor( 5 * SR ), x = noise( n, 151 ); biquad( x, 'lp', 180 ); biquad( x, 'lp', 220 ); const e = new Float32Array( n ); const r = rng( 152 ); for ( let i = 0; i < n; i ++ ) { const t = i / SR; e[ i ] = Math.exp( - t / 1.6 ) * ( 0.6 + 0.4 * Math.sin( t * 3 + r() * 0.2 ) ) * Math.min( 1, t * 20 ); } return normalize( softclip( mul( x, e ), 2 ), 1 ); } )(),
	heartbeat: () => seq( [ [ thud( 50, 0.12, 153 ), 0 ], [ thud( 45, 0.12, 154 ), 0.22, 0.7 ] ], 0.8 ),
	breath: () => ( () => { const x = loopNoise( 1.6, 1200, 300, 155 ); const e = new Float32Array( x.length ); for ( let i = 0; i < x.length; i ++ ) e[ i ] = Math.pow( Math.sin( i / x.length * Math.PI ), 2 ); return normalize( mul( x, e ), 0.5 ); } )(),
	boar: () => voice( 0.8, 120, 161, { formants: [ 350, 900, 2000 ], rough: 1.4, breath: 0.6 } ),
	chicken: () => seq( [ [ voice( 0.18, 600, 162, { formants: [ 900, 1800, 3200 ], rough: 0.3 } ), 0 ], [ voice( 0.25, 700, 163, { formants: [ 1000, 2000, 3400 ], rough: 0.3 } ), 0.2 ] ], 0.5 ),
	goat: () => voice( 0.7, 260, 164, { formants: [ 700, 1300, 2600 ], rough: 1.6, breath: 0.2 } ),
	deer: () => voice( 0.5, 420, 165, { formants: [ 800, 1600, 3000 ], rough: 0.4, rise: 0.3 } ),
	growl: () => voice( 1.0, 70, 166, { formants: [ 300, 700, 1800 ], rough: 1.5, breath: 0.5 } ),
	craft: () => seq( Array.from( { length: 4 }, ( _, k ) => [ click( 700 + k * 300, 0.08, 170 + k, 2 ), k * 0.25, 0.7 ] ), 1.2 ),
	sleep: () => ( () => { const n = Math.floor( 1.5 * SR ); return normalize( mul( sine( n, 220, 180, 1, 175 ), env( n, 0.3, 0.6 ) ), 0.3 ); } )(),
	levelup: () => seq( [ 523, 659, 784 ].map( ( f, k ) => [ ( () => { const n = Math.floor( 0.25 * SR ); return mul( sine( n, f, f, 1, 180 + k ), env( n, 0.005, 0.12 ) ); } )(), k * 0.08, 0.4 ] ), 0.6 ),
};

export function renderSynth( ctx, name ) {
	const gen = SYNTH[ name ];
	if ( ! gen ) return null;
	const data = gen();
	const buf = ctx.createBuffer( 1, data.length, SR );
	buf.copyToChannel( data, 0 );
	return buf;
}
