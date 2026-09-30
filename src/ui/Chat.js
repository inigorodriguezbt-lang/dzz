// Chat and command line (docs/UI_SPEC.md 9). T opens it, / opens it with a slash. Suggestions sit above the
// input with the best match ghosted after the caret: Tab takes the selected one, ↑/↓ walk the list (or the
// history when there is nothing to complete), Page Up/Down scroll the log, Enter runs, Esc closes. Closed,
// the last six lines show on plates and fade after 8 s; open, the whole log scrolls on a panel.
import { h } from './dom.js';

const FADE = 8000; // ms a line stays on screen while the chat is closed
const KEEP = 120; // lines kept in the log

export class Chat {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this.log = h( 'div.chat-log', { role: 'log', 'aria-live': 'polite' } );
		this.input = h( 'input.input', { type: 'text', maxLength: 256, spellcheck: false, autocomplete: 'off', 'aria-label': 'Chat' } );
		this.ghostTyped = h( 'span.typed' );
		this.ghostRest = h( 'span' );
		this.ghost = h( 'div.ghost', { 'aria-hidden': 'true' }, this.ghostTyped, this.ghostRest );
		this.field = h( 'div.chat-input', {}, this.input, this.ghost );
		this.suggest = h( 'div.suggest.pop.menu', { hidden: true, role: 'listbox' } );
		this.el = h( 'div.chat', {}, this.log, this.suggest, this.field );
		this.open = false;
		this.items = [];
		this.sel = - 1; // -1: nothing picked yet (Tab and the ghost use the first suggestion)
		this.hist = - 1; // -1: editing the draft; else how far back in the history
		this.draft = '';
		this.input.addEventListener( 'keydown', e => this._key( e ) );
		this.input.addEventListener( 'input', () => { this.hist = - 1; this.sel = - 1; this._suggest(); } );
		// the caret moving (clicks, Home/End) decides whether the ghost can show
		this.input.addEventListener( 'keyup', () => this._ghost() );
		this.input.addEventListener( 'pointerup', () => this._ghost() );
		// keep typing in the field while open, whatever was clicked
		this.input.addEventListener( 'blur', () => { if ( this.open ) setTimeout( () => { if ( this.open && document.activeElement !== this.input ) this.input.focus(); }, 0 ); } );
	}

	attach( game ) {
		this.game = game;
		this.ui.offs.push( game.events.on( 'chat', m => this.add( m.text, m.kind ) ) );
		this.log.replaceChildren();
	}

	add( text, kind = '' ) {
		// follow new lines only when the reader hasn't scrolled back
		const atEnd = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 8;
		const el = h( 'div.chat-line' + ( kind ? '.' + kind : '' ), { text } );
		this.log.appendChild( el );
		while ( this.log.children.length > KEEP ) this.log.firstChild.remove();
		if ( atEnd || ! this.open ) this.log.scrollTop = this.log.scrollHeight;
		setTimeout( () => el.classList.add( 'faded' ), FADE );
	}

	show( prefix = '' ) {
		this.open = true;
		this.el.classList.add( 'open' );
		this.input.value = prefix;
		this.hist = - 1;
		this.sel = - 1;
		this.draft = prefix;
		this.app.input.unlock();
		this.log.scrollTop = this.log.scrollHeight;
		// focus now: keys typed right after T (queued ahead of any timer on a slow frame) must land in the field.
		// UI opens the chat on the keydown itself and cancels it, so the T never types into the field.
		const focus = () => { if ( ! this.open ) return; this.input.focus(); this.input.setSelectionRange( this.input.value.length, this.input.value.length ); this._suggest(); };
		focus();
		setTimeout( () => { if ( document.activeElement !== this.input ) focus(); }, 0 );
	}

	hide() {
		this.open = false;
		this.el.classList.remove( 'open' );
		this.input.blur();
		this.items = [];
		this.suggest.hidden = true;
		this._ghost();
		this.app.input.lock();
	}

	_key( e ) {
		const C = this.game?.commands;
		e.stopPropagation();
		const k = e.key;
		if ( k === 'Escape' ) { e.preventDefault(); this.hide(); return; }
		if ( k === 'Enter' ) {
			e.preventDefault();
			// a suggestion picked with the arrows completes first; the next Enter runs the line
			const it = this.items[ this.sel ];
			if ( it && it.full.trimEnd() !== this.input.value.trimEnd() ) { this._apply( it ); return; }
			const v = this.input.value;
			this.hide();
			if ( v.trim() ) C?.run( v );
			return;
		}
		if ( k === 'PageUp' || k === 'PageDown' ) {
			// read back through the log without leaving the field
			e.preventDefault();
			this.log.scrollTop += ( k === 'PageUp' ? - 1 : 1 ) * this.log.clientHeight * 0.8;
			return;
		}
		if ( k === 'Tab' ) {
			e.preventDefault();
			const it = this.items[ Math.max( 0, this.sel ) ];
			if ( it ) this._apply( it );
			return;
		}
		if ( k === 'ArrowUp' || k === 'ArrowDown' ) {
			e.preventDefault();
			const up = k === 'ArrowUp';
			// the list while there is something typed to complete; the history from an empty line (or '/')
			// and while already walking it
			const typed = this.input.value.replace( /^\//, '' ).length > 0;
			const past = this.game?.commands?.history?.length > 0;
			if ( this.items.length && this.hist < 0 && ( typed || ! past ) ) {
				const n = this.items.length;
				this.sel = up ? ( this.sel <= 0 ? n - 1 : this.sel - 1 ) : ( this.sel + 1 ) % n;
				this._drawSuggest();
				return;
			}
			this._history( up ? 1 : - 1 );
		}
	}

	// walk the history (Commands.history, oldest first): up = older; past the newest the draft comes back
	_history( dir ) {
		const H = this.game?.commands?.history || [];
		if ( ! H.length ) return;
		if ( this.hist < 0 ) this.draft = this.input.value;
		const next = Math.max( - 1, Math.min( H.length - 1, this.hist + dir ) );
		if ( next === this.hist ) return;
		this.hist = next;
		this.input.value = next < 0 ? this.draft : H[ H.length - 1 - next ];
		const n = this.input.value.length;
		this.input.setSelectionRange( n, n );
		this.sel = - 1;
		this._suggest( next >= 0 );
	}

	_apply( it ) {
		this.input.value = it.full;
		const n = it.full.length;
		this.input.setSelectionRange( n, n );
		this.hist = - 1;
		this.sel = - 1;
		this._suggest();
		this.input.focus();
	}

	// quiet: a recalled history line gets no list (it is complete already)
	_suggest( quiet = false ) {
		const C = this.game?.commands;
		const v = this.input.value;
		this.field.classList.toggle( 'cmd', v.startsWith( '/' ) );
		this.items = ! quiet && C && v.startsWith( '/' ) ? C.complete( v ) : [];
		// nothing left to offer once the only suggestion is exactly what's typed
		if ( this.items.length === 1 && this.items[ 0 ].full.trim().toLowerCase() === v.trim().toLowerCase() ) this.items = [];
		this._drawSuggest();
	}

	_drawSuggest() {
		const C = this.game?.commands, v = this.input.value;
		this.suggest.hidden = ! this.items.length;
		const first = ! v.includes( ' ' ); // completing the command name itself: show its arguments too
		this.suggest.replaceChildren( ...this.items.map( ( it, i ) => {
			const name = it.text.replace( /^\//, '' ).toLowerCase();
			const usage = first ? ( C?.cmds?.[ name ]?.usage || '' ).replace( /^\/\S+\s*/, '' ) : '';
			return h( 'button' + ( i === this.sel ? '.on' : '' ), { type: 'button', tabIndex: - 1, role: 'option', 'aria-selected': i === this.sel,
				onmousedown: e => { e.preventDefault(); this._apply( it ); } },
			h( 'span', {}, it.text, usage ? h( 'span.args', { text: ' ' + usage } ) : null ),
			it.desc ? h( 'span.h', { text: it.desc } ) : null );
		} ) );
		this.suggest.children[ this.sel ]?.scrollIntoView( { block: 'nearest' } );
		if ( this.sel < 0 ) this.suggest.scrollTop = 0;
		this._ghost();
	}

	// the rest of the selected (or first) suggestion, drawn after the caret in a dim colour
	_ghost() {
		const v = this.input.value, it = this.items[ Math.max( 0, this.sel ) ];
		const atEnd = this.input.selectionStart === v.length && this.input.selectionEnd === v.length;
		const fits = this.input.scrollWidth <= this.input.clientWidth + 1; // a scrolled field would misalign it
		let rest = '';
		if ( this.open && it && atEnd && fits && it.full.toLowerCase().startsWith( v.toLowerCase() ) ) rest = it.full.slice( v.length ).trimEnd();
		if ( this.ghostTyped.textContent !== v ) this.ghostTyped.textContent = v;
		if ( this.ghostRest.textContent !== rest ) this.ghostRest.textContent = rest;
	}
}
