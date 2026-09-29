// UI manager: owns the HUD, chat, menus, inventory and map, routes the menu hotkeys, and handles
// pointer lock (losing it in game opens the pause menu).
import { h, unitPx, fmtDur, fmtDist } from './dom.js';
import { icon } from './icons.js';
import { HUD, COND_ICON } from './HUD.js';
import { Chat } from './Chat.js';
import { Menus } from './Menus.js';
import { InventoryUI } from './InventoryUI.js';
import { MapUI } from './MapUI.js';
import { MapView } from './MapView.js';
import { loadIcons } from './itemIcons.js';
import { getItem } from '../game/items/ItemDB.js';

// Key hints (spec 5.11): one set at a time while Key hints (the `tutorial` setting) is on, each once per game
// session. keys: [ [ actions, verb, suffix ] ]; every cap comes from input.label() so rebinding updates it.
const HINTS = {
	survival: [
		{ keys: [ [ [ 'forward', 'left', 'back', 'right' ], 'Move' ], [ [ 'sprint' ], 'Sprint' ], [ [ 'crouch' ], 'Crouch' ] ], until: g => g.player.distance > 30 },
		{ keys: [ [ [ 'inventory' ], 'Inventory' ] ], until: ( g, ui ) => ui.seenInventory },
		{ keys: [ [ [ 'map' ], 'Map' ] ], until: ( g, ui ) => ui.seenMap, when: ( g, ui ) => ui.mapAllowed() },
	],
	creative: [
		{ keys: [ [ [ 'jump' ], 'Fly', '×2' ] ], until: g => g.player.flying },
		{ keys: [ [ [ 'chat' ], 'Chat' ] ], until: ( g, ui ) => ui.seenChat },
	],
};

// Status screen (spec 7): 1-2 word remedy per condition id, and the item property that counts as carrying it
const REMEDY = {
	bleed: [ 'Bandage', d => d?.medical?.bleed ],
	inf: [ 'Antibiotics', d => d?.medical?.infection ],
	sick: [ 'Charcoal', d => d?.medical?.sick ],
	hot: [ 'Shade' ], wet: [ 'Shelter' ], tired: [ 'Sleep' ], heavy: [ 'Drop weight' ],
	blood: [ 'Saline', d => d?.medical?.blood ],
};

export class UI {
	constructor( app ) {
		this.app = app;
		this.root = document.getElementById( 'ui' );
		this.game = null;
		this.screen = null;
		this.screenOpts = {};
		this.offs = [];
		this.menus = new Menus( this );
		this.hud = new HUD( this );
		this.chat = new Chat( this );
		this.inventory = new InventoryUI( this );
		this.map = new MapUI( this );
		this.mapView = null;
		this.hud.el.hidden = true; this.chat.el.hidden = true; this.hud.feed.hidden = true;
		this.lockHint = h( 'div.lock.plate', { hidden: true, text: 'Click to resume' } );
		this.menuToasts = h( 'div.menu-toasts' );
		// layers (z-index in css): hud 1, chat 2, lock 3, screens 10, toast feed 20 (stays over the inventory), menu toasts 30
		this.root.append( this.hud.el, this.chat.el, this.lockHint, this.hud.feed, this.menuToasts );
		// px per u for canvas code (minimap, map): re-measured when the window or the GUI scale changes
		this.u = unitPx();
		addEventListener( 'resize', () => { this.u = unitPx(); } );
		app.settings.on( 'guiScale', () => { this.u = unitPx(); } );
		this.confirmOpen = false;
		app.input.onLockChange = ( locked ) => {
			if ( locked || ! this.game || this.game.dead ) return;
			if ( ! this.screen && ! this.chat.open ) this.menus.pause();
		};
		app.canvas.addEventListener( 'click', () => {
			this.app.audio.init();
			if ( this.game && ! this.screen && ! this.chat.open && ! this.game.dead ) app.input.lock();
		} );
		window.addEventListener( 'keydown', e => {
			if ( ! this.game || ! this.screen || this.screenOpts.sticky || this.screenOpts.inventory || this.confirmOpen ) return;
			if ( e.code === 'Escape' || ( this.screenOpts.map && this.app.input.codes( 'map' ).includes( e.code ) ) ) { e.preventDefault(); this.closeScreen(); }
		}, true );
		loadIcons();
	}

	// ---- screens ----------------------------------------------------------------------------------

	show( el, opts = {} ) {
		this._removeScreen();
		this.screen = el;
		this.screenOpts = opts;
		el.classList.add( 'screen-host' );
		// in game, a click on the scrim around a panel closes it (the inventory handles its own)
		if ( this.game && ! opts.sticky && ! opts.inventory ) el.addEventListener( 'pointerdown', e => { if ( e.target === el && this.screen === el && el.querySelector( ':scope > .panel' ) ) this.closeScreen(); } );
		this.root.appendChild( el );
		if ( this.game ) {
			this.app.input.unlock();
			if ( opts.paused ) this.game.paused = true;
		}
		this.inventoryOpen = !! opts.inventory;
	}

	_removeScreen() {
		if ( ! this.screen ) return;
		const o = this.screenOpts;
		this.screen.remove();
		this.screen = null;
		this.screenOpts = {};
		this.inventoryOpen = false;
		o.onClose && o.onClose();
	}

	closeScreen() {
		if ( this.screenOpts.sticky ) return;
		this._removeScreen();
		if ( this.game ) {
			this.game.paused = false;
			if ( ! this.game.dead ) this.app.input.lock();
		}
	}

	hideAll() { this._removeScreen(); }
	blocking() { return !! this.screen || this.chat.open; }

	showTitle() { this.menus.title(); }

	enterGame( game ) {
		this.game = game;
		for ( const f of this.offs ) f();
		this.offs = [];
		if ( ! this.mapView ) this.mapView = new MapView( this.app );
		this.hud.attach( game );
		this.chat.attach( game );
		this.hud.el.hidden = false; this.chat.el.hidden = false; this.hud.feed.hidden = false;
		this._removeScreen();
		this.seenInventory = this.seenMap = this.seenChat = false;
		this.hintIdx = 0; this.hintT = 0;
		this.offs.push( game.events.on( 'item:pick', () => { game.stats.looted = ( game.stats.looted || 0 ) + 1; } ) );
		this.lockHint.hidden = true;
		this.app.input.lock();
		this.announceSpawn();
	}

	// a new life: the location card says where (the creative Fly hint follows from HINTS)
	announceSpawn() {
		const g = this.game;
		if ( ! g?.justSpawned ) return;
		g.justSpawned = false;
		this.hud.showPlace( true );
	}

	exitGame() {
		for ( const f of this.offs ) f();
		this.offs = [];
		this.game = null;
		this.hud.game = null;
		this.hud.el.hidden = true; this.chat.el.hidden = true; this.hud.feed.hidden = true; this.lockHint.hidden = true;
		this.hud.setHint( null );
		this.chat.open && this.chat.hide();
		this._removeScreen();
		this.app.placeTitleCamera?.();
		this.menus.title();
	}

	openInventory( other = null ) {
		if ( ! this.game || this.game.dead ) return;
		this.seenInventory = true;
		this.inventory.open( other );
	}

	// other modules: open a world container (fridge, locker, trunk, body) next to the inventory
	openContainer( container ) {
		if ( ! container ) return;
		if ( ! container.pos && this.game ) container.pos = this.game.player.pos.clone();
		this.app.audio.play( 'container_open', { vol: 0.5 } );
		this.openInventory( container );
	}

	showDeath( info ) { this.chat.open && this.chat.hide(); this.menus.death( info ); }

	// Small modal question over whatever is open. Resolves true for the verb, false for Cancel, Esc or a
	// click outside. Enter presses the focused button, which starts on Cancel for destructive verbs.
	// Other key handlers should ignore keys while ui.confirmOpen is set.
	confirm( title, text = null, ok = 'OK', cls = 'primary' ) {
		return new Promise( resolve => {
			const cancel = h( 'button.btn', { type: 'button', text: 'Cancel', onclick: () => done( false ) } );
			const yes = h( 'button.btn.' + cls, { type: 'button', text: ok, onclick: () => done( true ) } );
			const box = h( 'div.pop.confirm', { role: 'alertdialog', 'aria-label': title },
				h( 'div.t-title', { text: title } ), text ? h( 'div.body', { text } ) : null, h( 'div.btns', {}, cancel, yes ) );
			const wrap = h( 'div.confirm-wrap', { onpointerdown: e => { if ( e.target === wrap ) done( false ); } }, box );
			const key = e => {
				if ( e.code === 'Escape' ) done( false );
				else if ( e.code === 'Enter' || e.code === 'NumpadEnter' ) done( document.activeElement !== cancel );
				else return;
				e.preventDefault(); e.stopImmediatePropagation();
			};
			const done = v => {
				if ( ! wrap.isConnected ) return;
				window.removeEventListener( 'keydown', key, true );
				wrap.remove();
				this.confirmOpen = false;
				this.app.audio.ui();
				resolve( v );
			};
			window.addEventListener( 'keydown', key, true );
			this.confirmOpen = true;
			this.root.appendChild( wrap );
			( cls === 'danger' ? cancel : yes ).focus();
		} );
	}

	// short status line over menus (Saved, Imported, errors), bottom centre
	toastScreen( text, kind = 'good' ) {
		const el = h( 'div.toast.plate', {}, kind === 'warn' || kind === 'bad' ? h( 'span.sd.' + kind ) : null, h( 'span', { text } ) );
		this.menuToasts.appendChild( el );
		while ( this.menuToasts.children.length > 3 ) this.menuToasts.firstChild.remove();
		setTimeout( () => { el.classList.add( 'out' ); setTimeout( () => el.remove(), 240 ); }, kind === 'bad' ? 5000 : 2500 );
	}

	// { name, island, near, nr, inTown }: name is the town when inside one, else the island ('Coast' off the
	// island outlines, 'Pacific Ocean' at sea); nr = distance to the nearest town in multiples of its radius
	placeOf( p ) {
		const meta = this.app.world.meta, hf = this.app.world.hf;
		const isl = meta.islands.find( i => i.id === hf.islandAt( p.x, p.z ) );
		let near = null, nr = Infinity;
		// relative to each town's size, so a big metro wins over a small neighbour whose centre is closer
		for ( const c of meta.cities ) { const r = Math.hypot( c.x - p.x, c.z - p.z ) / c.radius; if ( r < nr ) { nr = r; near = c; } }
		const inTown = !! near && nr < 1.35;
		if ( ! isl ) return { name: hf.baseHeight( p.x, p.z ) < 0 ? 'Pacific Ocean' : ( inTown ? near.name : 'Coast' ), island: null, near, nr, inTown };
		return { name: inTown ? near.name : isl.name, island: isl.name, near, nr, inTown };
	}

	// short: Waikīkī / Oʻahu. long: Waikīkī, Oʻahu / Near Hilo, Hawaiʻi / Maui
	locationName( p, long = false ) {
		const pl = this.placeOf( p );
		if ( ! long || ! pl.island ) return pl.name;
		if ( pl.inTown ) return `${pl.name}, ${pl.island}`;
		return pl.near && pl.nr < 3 ? `Near ${pl.near.name}, ${pl.island}` : pl.island;
	}

	mapAllowed() {
		const g = this.game;
		return ! this.app.settings.get( 'realisticMap' ) || g.mode === 'creative' || g.player.inventory.count( 'map_hawaii' ) > 0;
	}

	// Status (spec 7): conditions with remedies, body values, this life, all lives. No sentences.
	journal() {
		const g = this.game, S = g.survival, inv = g.player.inventory, st = g.stats, p = g.player;
		const sec = t => h( 'div.sec-head', {}, h( 'span.t-label', { text: t } ) );
		const kv = ( a, b, c = '' ) => h( 'div', {}, h( 'span', { text: a } ), h( 'span' + ( c ? '.' + c : '' ), { text: b } ) );
		const pct = v => Math.round( v ) + '%';
		const tone = ( v, low, crit ) => v < crit ? 'alarm' : v < low ? 'warn' : '';
		const weight = inv.totalWeight();
		const conds = g.mode === 'creative' ? [] : S.conditions();
		const rows = conds.map( c => {
			let rem = REMEDY[ c.id ] || null;
			if ( c.id === 'frac' ) rem = S.splint ? [ 'Rest' ] : [ 'Splint', d => d?.medical?.splint ];
			if ( c.id === 'cold' ) rem = [ S.temp < 35.2 ? 'Fire' : 'Warm clothes' ];
			const val = c.id === 'cold' || c.id === 'hot' ? S.temp.toFixed( 1 ) + '°' : c.id === 'wet' ? pct( S.wet * 100 ) : c.id === 'blood' ? pct( S.blood / 50 )
				: c.id === 'tired' ? pct( S.energy ) : c.id === 'heavy' ? weight.toFixed( 1 ) + ' kg' : '';
			const has = !! rem?.[ 1 ] && !! inv.find( ( s, d ) => rem[ 1 ]( d ) );
			return h( 'div.st-row.' + c.kind, {}, icon( COND_ICON[ c.id ] || c.id ), h( 'span.lab', { text: c.label } ),
				val ? h( 'span.v', { text: val } ) : null, rem ? h( 'span.rem' + ( has ? '.has' : '' ), { text: rem[ 0 ] } ) : null );
		} );
		const temp = S.temp;
		const body = h( 'div.panel-body', {},
			rows.length ? [ sec( 'Conditions' ), h( 'div', {}, ...rows ) ] : null,
			sec( 'Body' ),
			h( 'div.stats', {},
				kv( 'Health', pct( S.health ), tone( S.health, 50, 25 ) ), kv( 'Food', pct( Math.min( 100, S.hunger ) ), tone( S.hunger, 30, 10 ) ),
				kv( 'Blood', pct( S.blood / 50 ), tone( S.blood / 50, 76, 60 ) ), kv( 'Water', pct( Math.min( 100, S.thirst ) ), tone( S.thirst, 30, 10 ) ),
				kv( 'Body', temp.toFixed( 1 ) + '°', temp < 35.2 || temp > 38.6 ? 'alarm' : temp < 36 ? 'cold' : temp > 38 ? 'warn' : '' ), kv( 'Energy', pct( S.energy ), tone( S.energy, 25, 10 ) ),
				kv( 'Air', Math.round( S.envTemp ) + '°' ), kv( 'Stamina', `${Math.round( S.stamina )}/${Math.round( S.maxStamina() )}` ),
				kv( 'Wet', pct( S.wet * 100 ) ), kv( 'Weight', weight.toFixed( 1 ) + ' kg', weight > 30 ? 'warn' : '' ) ),
			sec( 'This life' ),
			h( 'div.stats', {},
				kv( 'Survived', fmtDur( g.time.hours - ( st.lifeStart || 0 ) ) ), kv( 'Kills', st.lifeKills || 0 ),
				kv( 'Distance', fmtDist( p.distance || 0 ) ), kv( 'Looted', st.looted || 0 ) ),
			sec( 'All lives' ),
			h( 'div.stats', {}, kv( 'Lives', st.lives || 1 ), kv( 'Kills', st.zombies || 0 ) ),
		);
		const panel = h( 'div.panel.status-panel', { role: 'dialog', 'aria-label': 'Status' },
			h( 'div.panel-head', {}, h( 'div.t-title', { text: 'Status' } ), h( 'span.meta', { text: `Day ${g.day}` } ),
				h( 'button.btn.icon', { type: 'button', title: 'Close', 'aria-label': 'Close', onclick: () => this.closeScreen() }, icon( 'close' ) ) ),
			body );
		const el = h( 'div.screen', {}, panel );
		const key = e => { if ( e.code === 'Escape' || this.app.input.codes( 'log' ).includes( e.code ) ) { e.preventDefault(); this.closeScreen(); } };
		window.addEventListener( 'keydown', key, true );
		this.show( el, { onClose: () => window.removeEventListener( 'keydown', key, true ) } );
	}

	screenshot() {
		try {
			this.app.canvas.toBlob( b => {
				if ( ! b ) return;
				const a = document.createElement( 'a' );
				a.href = URL.createObjectURL( b );
				a.download = `deadtide-${new Date().toISOString().replace( /[:.]/g, '-' )}.png`;
				a.click();
				setTimeout( () => URL.revokeObjectURL( a.href ), 3000 );
				this.game?.toast( 'Screenshot saved', 'good' );
			} );
		} catch ( e ) { console.warn( e ); }
	}

	// ---- per frame ---------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game, input = this.app.input;
		if ( ! g ) return;
		// hotkeys that open screens (only while playing)
		if ( ! this.screen && ! this.chat.open && ! g.dead ) {
			const raw = c => input.codePressed( c );
			const hit = a => input.codes( a ).some( raw );
			if ( hit( 'inventory' ) ) this.openInventory();
			else if ( hit( 'map' ) ) { if ( this.mapAllowed() ) { this.seenMap = true; this.map.open(); } else g.toast( 'No map', 'warn' ); }
			else if ( hit( 'chat' ) ) { this.seenChat = true; this.chat.show( '' ); }
			else if ( hit( 'command' ) ) { this.seenChat = true; this.chat.show( '/' ); }
			else if ( hit( 'craft' ) ) { this.inventory.leftTab = 'craft'; this.openInventory(); }
			else if ( hit( 'log' ) ) this.journal();
			if ( hit( 'hideHud' ) ) this.hud.hidden = ! this.hud.hidden;
			if ( hit( 'debug' ) ) this.hud.toggleDebug();
			if ( hit( 'screenshot' ) ) this.screenshot();
			if ( hit( 'quickHeal' ) && g.inputActive ) this._quickHeal();
			// hotbar slots are also handled by the hands module; this fallback selects when it's absent
			if ( ! g.hands && g.inputActive ) for ( let i = 1; i <= 9; i ++ ) if ( hit( 'slot' + i ) ) { const s = g.player.inventory.findUid( g.player.inventory.hotbar[ i - 1 ] ); if ( s ) g.player.inventory.hands = s.uid; }
		}
		this.lockHint.hidden = ! ( g && ! this.screen && ! this.chat.open && ! input.locked && ! g.dead );
		// the closed chat log hides under screens and with F1 (Hide HUD), like the HUD
		const c = this.chat.el;
		if ( c._under !== !! this.screen ) { c._under = !! this.screen; c.classList.toggle( 'under', c._under ); }
		const off = !! this.hud.hidden || !! g.dead;
		if ( c._off !== off ) { c._off = off; c.classList.toggle( 'off', off ); }
		this._hints( dt );
		this.hud.update( dt );
		if ( this.screenOpts.map ) this.map.update( dt );
		if ( this.screenOpts.inventory ) this.inventory.update( dt );
	}

	_quickHeal() {
		const g = this.game;
		const inv = g.player.inventory;
		const med = inv.find( ( s, d ) => d?.medical?.bleed && g.survival.bleeding > 0 ) || inv.find( ( s, d ) => d?.medical?.bleed );
		if ( ! med ) { g.toast( 'No bandages', 'warn' ); return; }
		if ( g.itemUse?.use ) g.itemUse.use( med );
		else g.actions.start( { label: 'Bandaging', time: 4, sound: 'bandage', onDone: () => { g.survival.medicate( getItem( med.id ) ); med.qty --; if ( med.qty <= 0 ) inv.remove( med ); inv.changed(); } } );
	}

	// one key-hint set at a time (spec 5.11): 2.5 s after spawn, then each after the previous ends (its rule
	// is met, or 20 s on screen). Paused while a screen, the chat or the sights are up.
	_hints( dt ) {
		const g = this.game, list = HINTS[ g.mode === 'creative' ? 'creative' : 'survival' ];
		const hint = list[ this.hintIdx ];
		if ( ! hint || ! this.app.settings.get( 'tutorial' ) ) { this.hud.setHint( null ); return; }
		if ( hint.until( g, this ) || ( hint.when && ! hint.when( g, this ) ) || this.hintT > 20 + this._hintDelay() ) {
			this.hintIdx ++; this.hintT = 0;
			this.hud.setHint( null );
			return;
		}
		const paused = !! this.screen || this.chat.open || g.dead || !! g.hands?.aiming;
		if ( ! paused ) this.hintT += dt;
		this.hud.setHint( ! paused && this.hintT >= this._hintDelay() ? hint : null );
	}

	_hintDelay() { return this.hintIdx === 0 ? 2.5 : 1; }
}
