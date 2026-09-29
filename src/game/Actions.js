// Timed actions with a progress ring: bandaging, eating, reloading a magazine, crafting, searching…
// start( { label, time, onDone, onCancel, cancelOnMove, sound, anim } ) — only one at a time.
export class Actions {
	constructor( game ) {
		this.game = game;
		this.current = null;
	}
	get busy() { return !! this.current; }
	start( a ) {
		if ( this.current ) this.cancel();
		const g = this.game;
		this.current = { ...a, t: 0, time: g.mode === 'creative' ? Math.min( a.time, 0.3 ) : a.time, start: g.player.pos.clone() };
		if ( a.sound ) this.current.snd = g.audio.play( a.sound, { vol: 0.6 } );
		return this.current;
	}
	cancel() {
		const c = this.current;
		if ( ! c ) return;
		this.current = null;
		try { c.snd?.stop(); } catch ( e ) { /* ended */ }
		c.onCancel && c.onCancel();
	}
	update( dt ) {
		const c = this.current;
		if ( ! c ) return;
		const g = this.game;
		if ( c.cancelOnMove !== false && g.player.pos.distanceTo( c.start ) > 1.2 ) { this.cancel(); return; }
		c.t += dt;
		if ( c.t >= c.time ) {
			this.current = null;
			c.onDone && c.onDone();
		}
	}
	get progress() { return this.current ? Math.min( 1, this.current.t / this.current.time ) : 0; }
}
