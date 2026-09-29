// Generative slack-key guitar: plucked strings (Karplus-Strong) in open-G "taro patch" tuning, an
// alternating thumb bass under simple melodies over I–IV–V7 progressions, with a soft room reverb.
// Plays on the title screen, and in the world quietly at dawn and dusk (off with the music volume).
const SR = 44100;
const midiHz = m => 440 * Math.pow( 2, ( m - 69 ) / 12 );

function pluck( midi, seed, dur = 3.2 ) {
	const f = midiHz( midi );
	const n = Math.floor( dur * SR );
	const out = new Float32Array( n );
	const N = Math.max( 2, Math.round( SR / f ) );
	const ring = new Float32Array( N );
	let s = seed * 9301 + 49297;
	const rnd = () => { s = ( s * 9301 + 49297 ) % 233280; return s / 233280 * 2 - 1; };
	// a pick-shaped excitation: noise, lowpassed, a little brighter for the treble strings
	let prev = 0;
	const bright = Math.min( 0.9, 0.35 + midi / 160 );
	for ( let i = 0; i < N; i ++ ) { const v = rnd(); prev = prev + ( v - prev ) * bright; ring[ i ] = prev; }
	const decay = 0.9965 + Math.min( 0.003, ( 72 - midi ) * 0.00005 );
	let idx = 0, last = 0;
	for ( let i = 0; i < n; i ++ ) {
		const a = ring[ idx ], b = ring[ ( idx + 1 ) % N ];
		const y = ( a + b ) * 0.5 * decay;
		ring[ idx ] = y;
		idx = ( idx + 1 ) % N;
		// body: a gentle one-pole lowpass
		last = last + ( y - last ) * 0.55;
		out[ i ] = last;
	}
	// fade the tail
	for ( let i = n - 2000; i < n; i ++ ) out[ i ] *= ( n - i ) / 2000;
	let m = 0;
	for ( const v of out ) m = Math.max( m, Math.abs( v ) );
	for ( let i = 0; i < n; i ++ ) out[ i ] /= m || 1;
	return out;
}

// G major, around the open strings D2 G2 D3 G3 B3 D4
const CHORDS = {
	G: { bass: [ 43, 50 ], tones: [ 55, 59, 62, 67, 71, 74 ] },
	C: { bass: [ 48, 43 ], tones: [ 60, 64, 67, 72, 76 ] },
	D7: { bass: [ 50, 45 ], tones: [ 54, 57, 60, 62, 66, 69, 72 ] },
	Em: { bass: [ 52, 47 ], tones: [ 55, 59, 64, 67, 71 ] },
	Am: { bass: [ 45, 52 ], tones: [ 57, 60, 64, 69, 72 ] },
};
const PROGRESSIONS = [
	[ 'G', 'G', 'C', 'G', 'G', 'D7', 'D7', 'G' ],
	[ 'G', 'Em', 'C', 'D7', 'G', 'C', 'D7', 'G' ],
	[ 'G', 'C', 'G', 'D7', 'G', 'C', 'Am', 'D7' ],
];
const SCALE = [ 55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76 ];

export class Music {
	constructor( audio ) {
		this.audio = audio;
		this.ctx = null;
		this.notes = new Map();
		this.playing = false;
		this.nextTime = 0;
		this.step = 0;
		this.phrase = 0;
		this.level = 0; // 0..1 target loudness
		this.seed = 1;
	}

	_init() {
		if ( this.ctx || ! this.audio.ctx ) return !! this.ctx;
		const c = this.ctx = this.audio.ctx;
		this.out = c.createGain();
		this.out.gain.value = 0;
		// a small wooden room
		const conv = c.createConvolver();
		const len = Math.floor( SR * 2.2 ), ir = c.createBuffer( 2, len, SR );
		for ( let ch = 0; ch < 2; ch ++ ) { const d = ir.getChannelData( ch ); for ( let i = 0; i < len; i ++ ) d[ i ] = ( Math.random() * 2 - 1 ) * Math.pow( 1 - i / len, 3.2 ) * 0.5; }
		conv.buffer = ir;
		const wet = c.createGain(); wet.gain.value = 0.28;
		this.dry = c.createGain(); this.dry.gain.value = 0.8;
		this.dry.connect( this.out );
		this.dry.connect( conv ).connect( wet ).connect( this.out );
		this.out.connect( this.audio.bus.music );
		return true;
	}

	_note( midi ) {
		let b = this.notes.get( midi );
		if ( ! b ) {
			const d = pluck( midi, midi * 7 + 3 );
			b = this.ctx.createBuffer( 1, d.length, SR );
			b.copyToChannel( d, 0 );
			this.notes.set( midi, b );
		}
		return b;
	}

	_play( midi, t, vol, pan = 0 ) {
		const c = this.ctx;
		const s = c.createBufferSource();
		s.buffer = this._note( midi );
		const g = c.createGain(); g.gain.value = vol;
		const p = c.createStereoPanner(); p.pan.value = pan;
		s.connect( g ).connect( p ).connect( this.dry );
		s.start( t );
	}

	// target: 0 silent .. 1 full (the music bus volume still applies)
	setLevel( v ) { this.level = v; }

	update() {
		if ( ! this.audio.ctx || this.audio.ctx.state !== 'running' ) return;
		if ( ! this._init() ) return;
		const c = this.ctx;
		this.out.gain.setTargetAtTime( this.level * 0.5, c.currentTime, 1.5 );
		if ( this.level <= 0.001 && this.out.gain.value < 0.01 ) { this.playing = false; return; }
		if ( ! this.playing ) { this.playing = true; this.nextTime = c.currentTime + 0.3; this.step = 0; }
		// schedule a little ahead
		const spb = 60 / 76 / 2; // eighth notes at 76 bpm
		while ( this.nextTime < c.currentTime + 0.4 ) {
			this._schedule( this.nextTime );
			this.nextTime += spb * ( this.step % 2 === 0 ? 1.08 : 0.92 ); // a lazy swing
			this.step ++;
		}
	}

	_rand() { this.seed = ( this.seed * 16807 ) % 2147483647; return this.seed / 2147483647; }

	_schedule( t ) {
		const bar = Math.floor( this.step / 8 ), pos = this.step % 8;
		const prog = PROGRESSIONS[ this.phrase % PROGRESSIONS.length ];
		if ( bar >= prog.length + 1 ) { // a bar of rest between phrases, then a new one
			this.step = - 1; this.phrase ++; return;
		}
		if ( bar === prog.length ) { if ( pos === 0 ) this._play( 43, t, 0.5, - 0.1 ); return; }
		const ch = CHORDS[ prog[ bar ] ];
		// alternating thumb: root on 1 and 3, fifth on 2 and 4
		if ( pos % 2 === 0 ) this._play( ch.bass[ ( pos / 2 ) % 2 ], t, 0.55, - 0.15 );
		// melody: chord tones on strong beats, scale steps between, with rests and hammer-ons
		const r = this._rand();
		if ( pos % 2 === 1 || r < 0.35 ) {
			if ( r < 0.18 ) return;
			const pool = pos % 2 === 0 ? ch.tones : SCALE;
			this.last = this.last ?? 67;
			// prefer small steps from the last note
			let best = pool[ 0 ], bd = 1e9;
			for ( const n of pool ) { const d = Math.abs( n - this.last ) + this._rand() * 6; if ( d < bd && n !== this.last ) { bd = d; best = n; } }
			this.last = best;
			const v = 0.42 + this._rand() * 0.12;
			this._play( best, t, v, 0.15 );
			if ( this._rand() < 0.14 ) this._play( best + 2, t + 0.09, v * 0.7, 0.15 ); // hammer-on
		}
	}
}
