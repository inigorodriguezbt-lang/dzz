// UI manager: owns the HUD, chat, menus, inventory and map, routes the menu hotkeys, and handles
// pointer lock (losing it in game opens the pause menu).
import { h, clear } from './dom.js';
import { HUD } from './HUD.js';
import { Chat } from './Chat.js';
import { Menus } from './Menus.js';
import { InventoryUI } from './InventoryUI.js';
import { MapUI } from './MapUI.js';
import { MapView } from './MapView.js';
import { loadIcons } from './itemIcons.js';
import { getItem } from '../game/items/ItemDB.js';

const TIPS = [
	{ id: 'move', text: k => `Move with ${k( 'forward' )}${k( 'left' )}${k( 'back' )}${k( 'right' )}, sprint with ${k( 'sprint' )}, crouch ${k( 'crouch' )}.`, until: g => g.player.distance > 30 },
	{ id: 'inv', text: k => `Press ${k( 'inventory' )} to check what you washed up with. Drag items onto your clothes to carry more.`, until: ( g, ui ) => ui.seenInventory },
	{ id: 'loot', text: k => `Find a town. Look at loot and press ${k( 'interact' )} to take it; cupboards, fridges and lockers can be searched.`, until: g => g.stats.looted > 2 },
	{ id: 'map', text: k => `${k( 'map' )} opens the map. Double-click it to place a marker you'll see on the compass.`, until: ( g, ui ) => ui.seenMap },
	{ id: 'chat', text: k => `${k( 'chat' )} opens chat — type /help for commands (/give, /tp, /time, /locate, /summon…).`, until: ( g, ui ) => ui.seenChat },
];

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
		this.hud.el.hidden = true; this.chat.el.hidden = true;
		this.tipEl = h( 'div.toast.tw-glass', { style: { position: 'absolute', left: '50%', top: 'calc(var(--tw-edge) + 64px)', transform: 'translateX(-50%)', maxWidth: '520px' }, hidden: true } );
		this.lockHint = h( 'div.prompt-main.tw-glass', { style: { position: 'absolute', left: '50%', top: '58%', transform: 'translateX(-50%)', pointerEvents: 'none' }, hidden: true, text: 'Click to continue' } );
		this.root.append( this.hud.el, this.chat.el, this.tipEl, this.lockHint );
		this.menuToasts = h( 'div.toasts', { style: { zIndex: 5 } } );
		this.root.appendChild( this.menuToasts );
		app.input.onLockChange = ( locked ) => {
			if ( locked || ! this.game || this.game.dead ) return;
			if ( ! this.screen && ! this.chat.open ) this.menus.pause();
		};
		app.canvas.addEventListener( 'click', () => {
			this.app.audio.init();
			if ( this.game && ! this.screen && ! this.chat.open && ! this.game.dead ) app.input.lock();
		} );
		window.addEventListener( 'keydown', e => {
			if ( ! this.game || ! this.screen || this.screenOpts.sticky || this.screenOpts.inventory ) return;
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
		this.hud.el.hidden = false; this.chat.el.hidden = false;
		this._removeScreen();
		this.seenInventory = this.seenMap = this.seenChat = false;
		this.tipIdx = 0; this.tipT = 0;
		this.offs.push( game.events.on( 'item:pick', () => { game.stats.looted = ( game.stats.looted || 0 ) + 1; } ) );
		this.lockHint.hidden = true;
		this.app.input.lock();
	}

	exitGame() {
		for ( const f of this.offs ) f();
		this.offs = [];
		this.game = null;
		this.hud.game = null;
		this.hud.el.hidden = true; this.chat.el.hidden = true; this.tipEl.hidden = true; this.lockHint.hidden = true;
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

	confirm( title, text, ok = 'OK', cls = 'primary' ) {
		return new Promise( resolve => {
			const wrap = h( 'div', { style: { position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', pointerEvents: 'auto' } } );
			const done = v => { wrap.remove(); resolve( v ); };
			wrap.appendChild( h( 'div.panel', { style: { width: 'min(420px, 90vw)' } },
				h( 'div.panel-head', {}, h( 'h2', { text: title } ) ), h( 'div.panel-body', { text: text } ),
				h( 'div.panel-foot', {}, h( 'button.btn', { text: 'Cancel', onclick: () => done( false ) } ), h( 'button.btn.' + cls, { text: ok, onclick: () => done( true ) } ) ) ) );
			this.root.appendChild( wrap );
		} );
	}

	toastScreen( text, kind = 'good' ) {
		const el = h( 'div.toast.tw-glass.' + kind, { text } );
		this.menuToasts.appendChild( el );
		setTimeout( () => { el.classList.add( 'out' ); setTimeout( () => el.remove(), 700 ); }, 3500 );
	}

	locationName( p, long = false ) {
		const meta = this.app.world.meta, hf = this.app.world.hf;
		const isl = meta.islands.find( i => i.id === hf.islandAt( p.x, p.z ) );
		let near = null, nd = Infinity;
		for ( const c of meta.cities ) { const d = Math.hypot( c.x - p.x, c.z - p.z ); if ( d < nd ) { nd = d; near = c; } }
		const inTown = near && nd < near.radius * 1.35;
		if ( ! isl ) return hf.baseHeight( p.x, p.z ) < 0 ? 'Pacific Ocean' : ( inTown ? near.name : 'Coast' );
		if ( inTown ) return long ? `${near.name}, ${isl.name}` : near.name;
		return long && near ? `${isl.name} — near ${near.name}` : isl.name;
	}

	journal() {
		const g = this.game, S = g.survival;
		const tips = [];
		if ( S.bleeding ) tips.push( 'You are bleeding. Use a bandage or rags (right-click → Bandage) — blood loss kills.' );
		if ( S.fracture && ! S.splint ) tips.push( 'Your leg is broken. A splint (sticks + rags) lets you walk while it heals.' );
		if ( S.infected ) tips.push( 'A bite wound is infected. Antibiotics from a pharmacy, clinic or hospital will cure it.' );
		if ( S.sick > 0.2 ) tips.push( 'Food poisoning: drink plenty. Charcoal tablets settle the stomach.' );
		if ( S.hunger < 30 ) tips.push( 'You are hungry. Houses, stores and fruit trees have food; cans need an opener or a blade.' );
		if ( S.thirst < 30 ) tips.push( 'You are thirsty. Taps in some buildings still run; coconuts and rain barrels help. Seawater only makes it worse.' );
		if ( S.temp < 36 ) tips.push( 'You are cold. Get out of the wind and the rain, put on warmer clothes, or make a fire.' );
		if ( S.temp > 38 ) tips.push( 'You are overheating. Take off heavy layers, rest in the shade, drink.' );
		if ( S.energy < 25 ) tips.push( 'You are exhausted. Coffee and energy drinks help for a while.' );
		if ( ! tips.length ) tips.push( 'You are holding up. Keep water and a bandage on you at all times.' );
		const st = g.stats;
		const days = ( g.time.hours - ( st.lifeStart || 0 ) ) / 24;
		const body = h( 'div.journal', {},
			h( 'div.opt-section', { text: 'Condition' } ), ...tips.map( t => h( 'p', { text: t } ) ),
			h( 'div.opt-section', { text: 'This life' } ),
			h( 'div.char-stats', {},
				h( 'span', { text: 'Survived' } ), h( 'span', { text: days < 1 ? Math.round( days * 24 ) + ' h' : days.toFixed( 1 ) + ' days' } ),
				h( 'span', { text: 'Infected killed' } ), h( 'span', { text: st.lifeKills || 0 } ),
				h( 'span', { text: 'Distance travelled' } ), h( 'span', { text: ( g.player.distance / 1000 ).toFixed( 2 ) + ' km' } ),
				h( 'span', { text: 'Items looted' } ), h( 'span', { text: st.looted || 0 } ),
				h( 'span', { text: 'Lives' } ), h( 'span', { text: st.lives || 1 } ),
				h( 'span', { text: 'Total infected killed' } ), h( 'span', { text: st.zombies || 0 } ) ),
			h( 'div.opt-section', { text: 'Where' } ), h( 'p', { text: this.locationName( g.player.pos, true ) } ),
		);
		const panel = h( 'div.panel', { style: { width: 'min(620px, 94vw)' } },
			h( 'div.panel-head', {}, h( 'div', {}, h( 'h2', { text: 'Survival journal' } ), h( 'div.sub', { text: `Day ${g.day}` } ) ), h( 'button.x-btn', { text: '✕', onclick: () => this.closeScreen() } ) ),
			h( 'div.panel-body', {}, body ) );
		const el = h( 'div.screen.clear', {}, panel );
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
			else if ( hit( 'map' ) ) { const ok = ! this.app.settings.get( 'realisticMap' ) || g.player.inventory.count( 'map_hawaii' ) || g.mode === 'creative'; if ( ok ) { this.seenMap = true; this.map.open(); } else g.toast( 'You need a map (realistic map is on in Options)', 'warn' ); }
			else if ( hit( 'chat' ) ) { this.seenChat = true; this.chat.show( '' ); }
			else if ( hit( 'command' ) ) { this.seenChat = true; this.chat.show( '/' ); }
			else if ( hit( 'craft' ) ) { this.inventory.leftTab = 'craft'; this.openInventory(); }
			else if ( hit( 'log' ) ) this.journal();
			if ( hit( 'hideHud' ) ) this.hud.hidden = ! this.hud.hidden;
			if ( hit( 'debug' ) ) { this.hud.debugOn = ! this.hud.debugOn; this.hud.debug.hidden = ! this.hud.debugOn; }
			if ( hit( 'screenshot' ) ) this.screenshot();
			if ( hit( 'quickHeal' ) && g.inputActive ) this._quickHeal();
			// hotbar slots are also handled by the hands module; this fallback selects when it's absent
			if ( ! g.hands && g.inputActive ) for ( let i = 1; i <= 9; i ++ ) if ( hit( 'slot' + i ) ) { const s = g.player.inventory.findUid( g.player.inventory.hotbar[ i - 1 ] ); if ( s ) g.player.inventory.hands = s.uid; }
		}
		this.lockHint.hidden = ! ( g && ! this.screen && ! this.chat.open && ! input.locked && ! g.dead );
		this.hud.update( dt );
		if ( this.screenOpts.map ) this.map.update( dt );
		if ( this.screenOpts.inventory ) this.inventory.update( dt );
		this._tips( dt );
	}

	_quickHeal() {
		const g = this.game;
		const inv = g.player.inventory;
		const med = inv.find( ( s, d ) => d?.medical?.bleed && g.survival.bleeding > 0 ) || inv.find( ( s, d ) => d?.medical?.bleed );
		if ( ! med ) { g.toast( 'No bandages', 'warn' ); return; }
		if ( g.itemUse?.use ) g.itemUse.use( med );
		else g.actions.start( { label: 'Bandaging', time: 4, sound: 'bandage', onDone: () => { g.survival.medicate( getItem( med.id ) ); med.qty --; if ( med.qty <= 0 ) inv.remove( med ); inv.changed(); } } );
	}

	_tips( dt ) {
		const g = this.game;
		if ( ! this.app.settings.get( 'tutorial' ) || g.mode === 'creative' || this.tipIdx >= TIPS.length ) { this.tipEl.hidden = true; return; }
		const tip = TIPS[ this.tipIdx ];
		if ( tip.until( g, this ) ) { this.tipIdx ++; this.tipT = 0; this.tipEl.hidden = true; return; }
		this.tipT += dt;
		if ( this.tipT < 2.5 ) { this.tipEl.hidden = true; return; }
		const k = a => `<kbd>${this.app.input.label( a )}</kbd>`;
		const html = tip.text( k );
		if ( this.tipEl.innerHTML !== html ) this.tipEl.innerHTML = html;
		this.tipEl.hidden = !! this.screen;
		if ( this.tipT > 30 ) { this.tipIdx ++; this.tipT = 0; }
	}
}
