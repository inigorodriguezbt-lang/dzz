// UI manager (minimal shell; the full screens are built in ui/*.js)
export class UI {
	constructor( app ) {
		this.app = app;
		this.root = document.getElementById( 'ui' );
		this.game = null;
		this.screen = null;
		this.hud = document.createElement( 'div' );
		this.hud.className = 'hud';
		this.hud.innerHTML = `<div class="crosshair"><div class="dot"></div></div><div class="prompt" hidden><div class="prompt-main tw-glass"></div></div><div class="toasts"></div><div class="fps"></div>`;
		this.root.appendChild( this.hud );
		this.hud.hidden = true;
	}
	blocking() { return !! this.screen; }
	hideAll() { if ( this.screen ) { this.screen.remove(); this.screen = null; } }
	showTitle() {
		this.hideAll();
		const s = document.createElement( 'div' );
		s.className = 'screen title-screen';
		s.innerHTML = `<div class="title-col"><p class="loader-kicker">A Hawaiian Islands survival game</p><h1>DEADTIDE</h1>
			<button class="menu-btn" data-a="survival">New survival world</button><button class="menu-btn" data-a="creative">New creative world</button></div>`;
		s.addEventListener( 'click', e => {
			const a = e.target.closest( 'button' )?.dataset.a;
			if ( ! a ) return;
			import( '../core/SaveSystem.js' ).then( ( { SaveSystem } ) => this.app.startGame( SaveSystem.newWorld( { name: 'World', mode: a } ) ) );
		} );
		this.root.appendChild( s );
		this.screen = s;
	}
	enterGame( game ) {
		this.game = game;
		this.hud.hidden = false;
		game.events.on( 'toast', ( t ) => {
			const el = document.createElement( 'div' );
			el.className = 'toast tw-glass ' + ( t.kind || '' );
			el.textContent = t.text;
			this.hud.querySelector( '.toasts' ).appendChild( el );
			setTimeout( () => { el.classList.add( 'out' ); setTimeout( () => el.remove(), 700 ); }, 4000 );
		} );
		this.app.canvas.addEventListener( 'click', () => { if ( ! this.screen ) this.app.input.lock(); } );
	}
	openContainer( c ) { this.game?.toast( `${c.label}: ${c.items.length} items` ); }
	openInventory() {}
	showDeath() { setTimeout( () => this.game?.respawn(), 3000 ); }
	update() {
		const g = this.game;
		this.hud.querySelector( '.fps' ).textContent = Math.round( this.app.fps ) + ' fps';
		if ( ! g ) return;
		const t = g.interact.target, pr = this.hud.querySelector( '.prompt' );
		pr.hidden = ! t;
		if ( t ) pr.firstElementChild.textContent = `[F] ${t.label}`;
	}
}
