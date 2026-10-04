// The ears: the audio engine's sfx bus re-routed through what you wear on them (Audio.js keeps its buses and volumes;
// this only changes where the sfx bus goes). Built the first time ear protection or ringing needs it, so a game where
// nobody wears any keeps the plain graph:
//   bus.sfx -> low-pass -> dry gain ------------------------------> master
//                       \-> compressor -> make-up gain -> wet gain -> master
// Earplugs and passive muffs: the dry path, quieter and duller. Electronic defenders: the wet path, a fast limiter that
// holds a gunshot down to conversation level while the make-up gain lifts footsteps and groans. Ringing after gunfire
// lowers the low-pass for a few seconds. set( mix ) takes logic.js earMix(); restore() puts the bus back.
export class EarChain {
	constructor( audio ) {
		this.audio = audio;
		this.built = false;
		this.last = null;
	}

	build() {
		const A = this.audio, c = A?.ctx;
		if ( this.built || ! c || ! A.bus?.sfx || ! A.master ) return this.built;
		const bus = A.bus.sfx;
		this.lp = c.createBiquadFilter();
		this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.55;
		this.dry = c.createGain(); this.dry.gain.value = 1;
		this.wet = c.createGain(); this.wet.gain.value = 0;
		this.comp = c.createDynamicsCompressor();
		this.makeup = c.createGain(); this.makeup.gain.value = 1;
		bus.disconnect();
		bus.connect( this.lp );
		this.lp.connect( this.dry ).connect( A.master );
		this.lp.connect( this.comp ).connect( this.makeup ).connect( this.wet ).connect( A.master );
		this.built = true;
		return true;
	}

	// mix: { dry, wet, lp, threshold?, knee?, ratio?, attack?, release?, makeup? }
	set( m ) {
		if ( ! this.built ) return;
		const c = this.audio.ctx, t = c.currentTime;
		const L = this.last || ( this.last = {} );
		if ( L.lp !== m.lp ) { this.lp.frequency.setTargetAtTime( m.lp, t, 0.06 ); L.lp = m.lp; }
		if ( L.dry !== m.dry ) { this.dry.gain.setTargetAtTime( m.dry, t, 0.05 ); L.dry = m.dry; }
		if ( L.wet !== m.wet ) { this.wet.gain.setTargetAtTime( m.wet, t, 0.05 ); L.wet = m.wet; }
		if ( m.threshold != null && L.threshold !== m.threshold ) {
			const C = this.comp;
			C.threshold.value = m.threshold; C.knee.value = m.knee; C.ratio.value = m.ratio; C.attack.value = m.attack; C.release.value = m.release;
			this.makeup.gain.setTargetAtTime( m.makeup, t, 0.05 );
			L.threshold = m.threshold;
		}
	}

	// what the chain is doing (the in-game check logs it): gains, the cut-off, the limiter's gain reduction (dB)
	state() {
		if ( ! this.built ) return { built: false };
		return { built: true, dry: + this.dry.gain.value.toFixed( 3 ), wet: + this.wet.gain.value.toFixed( 3 ), lp: Math.round( this.lp.frequency.value ),
			threshold: this.comp.threshold.value, ratio: this.comp.ratio.value, makeup: + this.makeup.gain.value.toFixed( 2 ), reduction: + ( this.comp.reduction || 0 ).toFixed( 1 ) };
	}

	// the plain graph again (the game is over)
	restore() {
		if ( ! this.built ) return;
		const A = this.audio, bus = A.bus.sfx;
		try { bus.disconnect(); this.lp.disconnect(); this.dry.disconnect(); this.comp.disconnect(); this.makeup.disconnect(); this.wet.disconnect(); } catch ( e ) { /* closed */ }
		bus.connect( A.master );
		this.built = false;
		this.last = null;
	}
}
