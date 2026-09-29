// Chat and command line: T opens chat, / opens it with a slash. Tab completes, arrows walk the history
// or the suggestions, Enter runs, Esc closes. Lines fade after a while and come back when it's open.
import { h } from './dom.js';

export class Chat {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this.log = h( 'div.chat-log' );
		this.input = h( 'input.input', { maxLength: 256, spellcheck: false, autocomplete: 'off', placeholder: 'Say something or type /help' } );
		this.suggest = h( 'div.suggest.tw-glass', { hidden: true } );
		this.el = h( 'div.chat', {}, this.log, this.suggest, h( 'div.chat-input', {}, this.input ) );
		this.open = false;
		this.hist = -1;
		this.sel = 0;
		this.items = [];
		this.input.addEventListener( 'keydown', e => this._key( e ) );
		this.input.addEventListener( 'input', () => { this.sel = 0; this._suggest(); } );
	}

	attach( game ) {
		this.game = game;
		this.ui.offs.push( game.events.on( 'chat', m => this.add( m.text, m.kind ) ) );
		this.log.replaceChildren();
		this.add( 'Welcome to Deadtide. Press ' + this.app.input.label( 'chat' ) + ' to chat, type /help for commands.', 'sys' );
	}

	add( text, kind = '' ) {
		const el = h( 'div.chat-line' + ( kind ? '.' + kind : '' ), { text } );
		this.log.appendChild( el );
		while ( this.log.children.length > 120 ) this.log.firstChild.remove();
		this.log.scrollTop = this.log.scrollHeight;
		setTimeout( () => el.classList.add( 'faded' ), 9000 );
	}

	show( prefix = '' ) {
		this.open = true;
		this.el.classList.add( 'open' );
		this.input.value = prefix;
		this.hist = -1;
		this.app.input.unlock();
		setTimeout( () => { this.input.focus(); this.input.setSelectionRange( prefix.length, prefix.length ); this._suggest(); }, 0 );
	}

	hide() {
		this.open = false;
		this.el.classList.remove( 'open' );
		this.input.blur();
		this.suggest.hidden = true;
		this.app.input.lock();
	}

	_key( e ) {
		const C = this.game?.commands;
		e.stopPropagation();
		if ( e.key === 'Escape' ) { e.preventDefault(); this.hide(); return; }
		if ( e.key === 'Enter' ) {
			e.preventDefault();
			const v = this.input.value;
			if ( ! this.suggest.hidden && this.items.length && this.sel > 0 ) { this._apply( this.items[ this.sel - 1 ] ); return; }
			this.hide();
			if ( v.trim() ) C?.run( v );
			return;
		}
		if ( e.key === 'Tab' ) {
			e.preventDefault();
			if ( this.items.length ) this._apply( this.items[ Math.max( 0, this.sel - 1 ) ] );
			return;
		}
		if ( e.key === 'ArrowUp' || e.key === 'ArrowDown' ) {
			e.preventDefault();
			const dir = e.key === 'ArrowUp' ? 1 : - 1;
			if ( ! this.suggest.hidden && this.items.length && ( this.sel > 0 || this.input.value.includes( ' ' ) ) ) {
				this.sel = Math.max( 0, Math.min( this.items.length, this.sel + ( dir > 0 ? - 1 : 1 ) ) );
				this._drawSuggest();
				return;
			}
			const H = C?.history || [];
			if ( ! H.length ) return;
			this.hist = Math.max( - 1, Math.min( H.length - 1, this.hist + dir ) );
			this.input.value = this.hist < 0 ? '' : H[ H.length - 1 - this.hist ];
			this._suggest();
		}
	}

	_apply( it ) {
		if ( ! it ) return;
		this.input.value = it.full;
		this.sel = 0;
		this._suggest();
		this.input.focus();
	}

	_suggest() {
		const C = this.game?.commands;
		const v = this.input.value;
		this.items = C && v.startsWith( '/' ) ? C.complete( v ) : [];
		// hide once the only suggestion is exactly what's typed
		if ( this.items.length === 1 && this.items[ 0 ].full.trim() === v.trim() ) this.items = [];
		this._drawSuggest();
	}

	_drawSuggest() {
		this.suggest.hidden = ! this.items.length;
		this.suggest.replaceChildren( ...this.items.map( ( it, i ) => h( 'div' + ( i === this.sel - 1 ? '.on' : '' ), { onmousedown: ( e ) => { e.preventDefault(); this._apply( it ); } }, h( 'span', { text: it.text } ), it.desc ? h( 'span.dim', { text: it.desc } ) : null ) ) );
	}
}
