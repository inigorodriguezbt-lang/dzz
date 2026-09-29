// Keyboard / mouse input mapped to named actions through the player's bindings.
// Codes are KeyboardEvent.code values, or 'Mouse0'..'Mouse4', 'WheelUp' / 'WheelDown'.
export class Input {
	constructor( el, settings ) {
		this.el = el;
		this.settings = settings;
		this.down = new Set();
		this.pressedQ = new Set(); // codes pressed since last frame
		this.releasedQ = new Set();
		this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
		this.locked = false;
		this.enabled = true; // gameplay input (false while a menu / chat has focus)
		this.capture = null; // rebinding: fn( code ) receives the next key
		this.textFocus = false;
		this._reverse = new Map();
		this._rebuild();
		settings.on( 'bindings', () => this._rebuild() );

		const onKey = ( e, d ) => {
			if ( this.capture && d ) { e.preventDefault(); const fn = this.capture; this.capture = null; fn( e.code ); return; }
			const tag = document.activeElement && document.activeElement.tagName;
			if ( tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ) { if ( e.code !== 'Escape' ) return; }
			if ( d ) {
				if ( ! this.down.has( e.code ) ) this.pressedQ.add( e.code );
				this.down.add( e.code );
			} else { this.down.delete( e.code ); this.releasedQ.add( e.code ); }
			// keep the browser from scrolling / tabbing / opening find while playing
			if ( [ 'Tab', 'Space', 'Slash', 'F1', 'F2', 'F3', 'F5', 'Quote', 'AltLeft', 'AltRight' ].includes( e.code ) || ( e.ctrlKey && e.code === 'KeyS' ) ) e.preventDefault();
		};
		window.addEventListener( 'keydown', e => onKey( e, true ) );
		window.addEventListener( 'keyup', e => onKey( e, false ) );
		window.addEventListener( 'blur', () => { for ( const c of this.down ) this.releasedQ.add( c ); this.down.clear(); } );
		el.addEventListener( 'mousedown', e => {
			const c = 'Mouse' + e.button;
			if ( this.capture ) { e.preventDefault(); const fn = this.capture; this.capture = null; fn( c ); return; }
			if ( ! this.down.has( c ) ) this.pressedQ.add( c );
			this.down.add( c );
		} );
		window.addEventListener( 'mouseup', e => { const c = 'Mouse' + e.button; this.down.delete( c ); this.releasedQ.add( c ); } );
		el.addEventListener( 'contextmenu', e => e.preventDefault() );
		window.addEventListener( 'mousemove', e => {
			if ( ! this.locked ) return;
			this.mouseDX += e.movementX; this.mouseDY += e.movementY;
		} );
		el.addEventListener( 'wheel', e => {
			if ( this.capture ) { e.preventDefault(); const fn = this.capture; this.capture = null; fn( e.deltaY < 0 ? 'WheelUp' : 'WheelDown' ); return; }
			this.wheel += Math.sign( e.deltaY );
			const c = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
			this.pressedQ.add( c );
		}, { passive: true } );
		document.addEventListener( 'pointerlockchange', () => {
			this.locked = document.pointerLockElement === el;
			if ( ! this.locked ) { for ( const c of [ ...this.down ] ) if ( c.startsWith( 'Mouse' ) ) { this.down.delete( c ); this.releasedQ.add( c ); } }
			this.onLockChange && this.onLockChange( this.locked );
		} );
	}

	_rebuild() {
		this.bindings = this.settings.get( 'bindings' );
	}

	lock() {
		if ( document.pointerLockElement === this.el ) return;
		try {
			const p = this.el.requestPointerLock( { unadjustedMovement: true } );
			if ( p && p.catch ) p.catch( () => { try { this.el.requestPointerLock(); } catch ( e ) { /* denied */ } } );
		} catch ( e ) { try { this.el.requestPointerLock(); } catch ( e2 ) { /* denied */ } }
	}
	unlock() { if ( document.pointerLockElement ) document.exitPointerLock(); }

	codes( action ) { return this.bindings[ action ] || []; }
	// held
	is( action ) {
		if ( ! this.enabled ) return false;
		for ( const c of this.codes( action ) ) if ( this.down.has( c ) ) return true;
		return false;
	}
	// pressed this frame
	pressed( action ) {
		if ( ! this.enabled ) return false;
		for ( const c of this.codes( action ) ) if ( this.pressedQ.has( c ) ) return true;
		return false;
	}
	released( action ) {
		for ( const c of this.codes( action ) ) if ( this.releasedQ.has( c ) ) return true;
		return false;
	}
	// raw code checks (menus)
	codePressed( code ) { return this.pressedQ.has( code ); }

	consumeMouse() {
		const s = this.settings.get( 'sensitivity' ) * 0.0022;
		const r = [ this.mouseDX * s, this.mouseDY * s * ( this.settings.get( 'invertY' ) ? - 1 : 1 ) ];
		this.mouseDX = 0; this.mouseDY = 0;
		return r;
	}
	consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

	endFrame() { this.pressedQ.clear(); this.releasedQ.clear(); }

	// the first key bound to an action, pretty-printed
	label( action ) { return prettyCode( this.codes( action )[ 0 ] ); }
}

export function prettyCode( c ) {
	if ( ! c ) return '—';
	const map = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', WheelUp: 'Wheel ↑', WheelDown: 'Wheel ↓',
		ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt', Space: 'Space',
		Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', Slash: '/', Equal: '=', Minus: '-', Backquote: '`', Quote: "'",
		BracketLeft: '[', BracketRight: ']', Semicolon: ';', Comma: ',', Period: '.', Backslash: '\\', CapsLock: 'Caps',
		ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
	if ( map[ c ] ) return map[ c ];
	if ( c.startsWith( 'Key' ) ) return c.slice( 3 );
	if ( c.startsWith( 'Digit' ) ) return c.slice( 5 );
	if ( c.startsWith( 'Numpad' ) ) return 'Num ' + c.slice( 6 );
	return c;
}
