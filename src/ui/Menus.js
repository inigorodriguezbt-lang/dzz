// Full-screen menus (docs/UI_SPEC.md 10-14): title, about, worlds, new world, world details, options with
// key rebinding, pause and death. Styles in css/menus.css; shared controls from widgets.js.
import { h, clear, fmtTime, fmtDate, fmtDist, fmtDur, kc } from './dom.js';
import { icon } from './icons.js';
import { seg, toggle, slider, select, rail } from './widgets.js';
import { SaveSystem } from '../core/SaveSystem.js';
import { BINDING_LABELS, DEFAULT_BINDINGS, DEFAULTS, QUALITY_PRESETS } from '../core/Settings.js';
import { prettyCode } from '../core/Input.js';

const VERSION = '0.1';

const TABS = [ [ 'graphics', 'Graphics' ], [ 'interface', 'Interface' ], [ 'audio', 'Audio' ], [ 'controls', 'Controls' ], [ 'keys', 'Keys' ], [ 'gameplay', 'Gameplay' ] ];
// keys each tab's `Reset tab` restores (Graphics also goes back to the default preset)
const TAB_KEYS = {
	graphics: [ 'fov', 'nightBrightness' ],
	interface: [ 'guiScale', 'hudMode', 'crosshair', 'compass', 'minimap', 'hitMarkers', 'damageIndicators', 'showInteractHints', 'tutorial', 'showFps' ],
	audio: [ 'masterVolume', 'sfxVolume', 'ambientVolume', 'musicVolume', 'uiVolume' ],
	controls: [ 'sensitivity', 'invertY', 'toggleCrouch', 'toggleAim', 'toggleSprint', 'headBob' ],
	gameplay: [ 'autoPickupAmmo', 'realisticMap' ],
};
// hudMode is UI-only and has no entry in DEFAULTS
const defOf = k => k === 'hudMode' ? 'auto' : DEFAULTS[ k ];
const LEVELS = [ [ 'low', 'Low' ], [ 'medium', 'Medium' ], [ 'high', 'High' ], [ 'ultra', 'Ultra' ] ];
const HOLD = [ [ false, 'Hold' ], [ true, 'Toggle' ] ];
const pct = v => Math.round( v * 100 ) + '%';

// Keys tab: groups and rows. 'hotbar' is one row of nine caps; 'pause' is fixed (Esc releases the pointer lock);
// 'gestures' is left out because nothing reads it.
const KEY_GROUPS = [
	[ 'Movement', [ 'forward', 'back', 'left', 'right', 'sprint', 'walk', 'crouch', 'prone', 'jump', 'leanLeft', 'leanRight', 'autorun', 'freelook' ] ],
	[ 'Actions', [ 'interact', 'fire', 'aim', 'reload', 'melee', 'fireMode', 'holster', 'throw', 'flashlight', 'zoom', 'quickHeal' ] ],
	[ 'Hotbar', [ 'hotbar' ] ],
	[ 'Menus', [ 'inventory', 'map', 'craft', 'log', 'chat', 'command', 'pause', 'hideHud', 'screenshot', 'debug' ] ],
	[ 'Vehicle', [ 'camera', 'horn', 'headlights', 'handbrake', 'vehicleUp', 'vehicleDown' ] ],
];
const SLOTS = [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ].map( i => 'slot' + i );
const KEY_LABELS = {
	forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', jump: 'Jump', walk: 'Walk', interact: 'Interact', fire: 'Fire', aim: 'Aim',
	melee: 'Melee', zoom: 'Hold breath', freelook: 'Free look', camera: 'Camera', vehicleUp: 'Climb', vehicleDown: 'Descend', log: 'Status',
	debug: 'Debug', craft: 'Craft', hotbar: 'Hotbar',
};
const keyLabel = a => KEY_LABELS[ a ] || BINDING_LABELS[ a ] || a;
// driving actions may share keys with on-foot ones
const VEHICLE = new Set( [ 'horn', 'headlights', 'handbrake', 'vehicleUp', 'vehicleDown' ] );

const SPAWNS = [ [ 'random', 'Random' ], [ 'oahu', 'Oʻahu' ], [ 'kauai', 'Kauaʻi' ], [ 'maui', 'Maui' ], [ 'bigisland', 'Hawaiʻi' ], [ 'molokai', 'Molokaʻi' ], [ 'lanai', 'Lānaʻi' ], [ 'niihau', 'Niʻihau' ] ];

// death screen title from Game.onPlayerDeath's cause
const CAUSES = {
	'blood loss': 'Bled out', starvation: 'Starved', dehydration: 'Dehydrated', hypothermia: 'Hypothermia', 'heat stroke': 'Heat stroke',
	drowning: 'Drowned', infection: 'Infection', injuries: 'Injuries', 'a fall': 'Fall', fall: 'Fall', 'jumping from a vehicle': 'Fall',
	'a gunshot': 'Shot', bullet: 'Shot', 'an explosion': 'Explosion', explosion: 'Explosion', 'an exploding vehicle': 'Explosion',
	fire: 'Burned', burn: 'Burned', bite: 'Bitten', scratch: 'Bitten', 'the infected': 'Bitten', melee: 'Beaten',
	animal: 'Mauled', 'a boar': 'Mauled', 'a shark': 'Mauled', vehicle: 'Crash', 'a vehicle': 'Crash', 'a crash': 'Crash', suicide: 'Died',
};
export function causeTitle( cause ) {
	const c = String( cause || '' ).trim();
	if ( CAUSES[ c.toLowerCase() ] ) return CAUSES[ c.toLowerCase() ];
	const s = c.replace( /^(an?|the)\s+/i, '' );
	return s ? s[ 0 ].toUpperCase() + s.slice( 1 ) : 'Died';
}

const same = ( a, b ) => typeof a === 'number' && typeof b === 'number' ? Math.abs( a - b ) < 1e-6 : JSON.stringify( a ) === JSON.stringify( b );
const typing = () => { const t = document.activeElement?.tagName; return t === 'INPUT' || t === 'TEXTAREA'; };
const onButton = () => document.activeElement?.tagName === 'BUTTON' || document.activeElement?.tagName === 'A';
const nextFrame = fn => new Promise( r => requestAnimationFrame( () => r( fn() ) ) );

// SaveSystem.importWorld throws sentences; the menu toast is 1-3 words
function importError( e ) {
	const m = String( e?.message || e );
	if ( /newer version/i.test( m ) ) return 'Newer version';
	if ( /not a deadtide world|json/i.test( m ) ) return 'Not a world file';
	return m;
}

// Saved thumbnails come from the WebGL canvas and are black when grabbed outside a frame: show the plain
// placeholder for those. Results are cached per save.
const litCache = new Map();
function lit( img ) {
	try {
		const c = document.createElement( 'canvas' ); c.width = 16; c.height = 9;
		const x = c.getContext( '2d', { willReadFrequently: true } );
		x.drawImage( img, 0, 0, 16, 9 );
		const d = x.getImageData( 0, 0, 16, 9 ).data;
		let m = 0;
		for ( let i = 0; i < d.length; i += 4 ) m = Math.max( m, d[ i ], d[ i + 1 ], d[ i + 2 ] );
		return m > 24;
	} catch ( e ) { return true; }
}
function thumb( w ) {
	const box = h( 'div.thumb' );
	if ( ! w.thumb ) return box;
	const key = w.id + ':' + w.thumb.length;
	if ( litCache.get( key ) === false ) return box;
	const img = h( 'img', { alt: '', decoding: 'async' } );
	img.onload = () => { if ( ! litCache.has( key ) ) litCache.set( key, lit( img ) ); if ( litCache.get( key ) ) box.append( img ); };
	img.src = w.thumb;
	return box;
}

export class Menus {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this._keys = null; // keydown handler of the menu screen on top; returns true when it used the key
		this._el = null;
		this._token = 0;
		// registered before UI's own Esc handler (UI builds Menus first), so a menu screen gets keys first
		window.addEventListener( 'keydown', e => this._onKey( e ), true );
	}

	_onKey( e ) {
		const ui = this.ui;
		if ( ! this._keys || ui.screen !== this._el || ui.confirmOpen ) return;
		if ( ui.root.querySelector( ':scope > .pop.menu' ) ) return; // an open select or menu owns the keys
		if ( this._keys( e ) ) { e.preventDefault(); e.stopImmediatePropagation(); }
	}

	_show( el, keys = null, opts = {} ) {
		this._token ++;
		// one menu screen replacing another (pause ⇄ options, title ⇄ a panel): the backdrop swaps in place and
		// only the content fades, so the world doesn't flash through between the two
		if ( this._el && this.ui.screen === this._el && ! el.classList.contains( 'death' ) ) el.classList.add( 'swap' );
		this._keys = keys;
		this._el = el;
		this.ui.show( el, opts );
	}

	// in game a panel sits on the scrim; on the title it sits over the camera (.bare keeps the title's gradient).
	// A click on the scrim goes back, like Esc.
	_screen( panel, back ) {
		const el = h( 'div.screen' + ( this.ui.game ? '' : '.bare' ), {}, panel );
		el.addEventListener( 'pointerdown', e => { if ( e.target === el ) { e.stopImmediatePropagation(); back(); } } );
		return el;
	}

	_panel( title, body, foot, { cls = '', onClose = null, head = [] } = {} ) {
		return h( 'div.panel' + cls, { role: 'dialog', 'aria-label': title },
			h( 'div.panel-head', {}, h( 'h2.t-title', { text: title } ), ...head, onClose ? this._iconBtn( 'close', 'Close', onClose ) : null ),
			body, foot );
	}

	_btn( text, onclick, cls = '', ico = null ) {
		return h( 'button.btn' + ( cls ? '.' + cls : '' ), { type: 'button', onclick: e => { this.app.audio.ui(); onclick( e ); } }, ico ? icon( ico ) : null, h( 'span', { text } ) );
	}

	_iconBtn( name, title, onclick, cls = '' ) {
		return h( 'button.btn.icon' + ( cls ? '.' + cls : '' ), { type: 'button', title, 'aria-label': title, onclick: e => { this.app.audio.ui(); onclick( e ); } }, icon( name ) );
	}

	// label + control row (new world, world details)
	_row( label, ...ctl ) { return h( 'div.row', {}, h( 'div.lab', { text: label } ), h( 'div.ctl', {}, ...ctl ) ); }

	// Title and pause menu: one highlighted row (.on) shared by the pointer and the keyboard. ↑/↓ wrap, Enter runs.
	_menu( items ) {
		const audio = this.app.audio;
		let on = - 1, busy = false;
		const set = ( i, sound ) => {
			if ( i === on ) return;
			els[ on ]?.classList.remove( 'on' );
			on = i;
			els[ i ].classList.add( 'on' );
			if ( sound ) audio.ui( 'ui_hover', 0.3 );
		};
		const run = async i => {
			if ( busy ) return;
			busy = true;
			audio.ui();
			try { await items[ i ].run(); } catch ( e ) { console.error( e ); } finally { busy = false; }
		};
		const els = items.map( ( it, i ) => h( 'button.menu-item', { type: 'button', 'data-id': it.id, onmouseenter: () => set( i, true ), onfocus: () => set( i, false ), onclick: () => run( i ) },
			h( 'span', { text: it.label } ), it.meta ? h( 'span.meta', { text: it.meta } ) : null, it.key ? kc( it.key ) : null ) );
		const focus = ( id ) => { const i = Math.max( 0, items.findIndex( it => it.id === id ) ); els[ i ].focus( { preventScroll: true } ); set( i, false ); };
		const keys = e => {
			if ( e.code === 'ArrowDown' || e.code === 'ArrowUp' ) {
				const d = e.code === 'ArrowDown' ? 1 : - 1;
				const i = on < 0 ? ( d > 0 ? 0 : els.length - 1 ) : ( on + d + els.length ) % els.length;
				els[ i ].focus( { preventScroll: true } );
				set( i, true );
				return true;
			}
			if ( e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' ) { if ( on >= 0 && ! e.repeat ) run( on ); return true; }
			return false;
		};
		return { els, keys, focus };
	}

	// ---- title ------------------------------------------------------------------------------------

	async title() {
		const tok = ++ this._token;
		let live = null;
		try { live = ( await this.app.saves.list() ).find( w => ! w.dead ) || null; } catch ( e ) { console.warn( e ); }
		if ( tok !== this._token || this.ui.game ) return;
		const m = this._menu( [
			live && { id: 'continue', label: 'Continue', meta: `${live.name} · Day ${live.days}`, run: () => this._play( live.id ) },
			{ id: 'worlds', label: 'Worlds', run: () => this.worlds() },
			{ id: 'options', label: 'Options', run: () => this.options( () => { this._titleFocus = 'options'; this.title(); } ) },
			{ id: 'about', label: 'About', run: () => this.about() },
		].filter( Boolean ) );
		const el = h( 'div.screen.title-screen', {},
			h( 'div.menu-col', {}, h( 'h1.wordmark', { text: 'DEADTIDE' } ), ...m.els ),
			h( 'div.version', { text: 'v' + VERSION } ) );
		this._show( el, m.keys );
		m.focus( this._titleFocus );
		this._titleFocus = null;
	}

	async _play( id ) {
		const w = await this.app.saves.load( id );
		if ( ! w || w.dead ) return this.worlds( id );
		await this.app.startGame( w );
	}

	about() {
		const back = () => { this._titleFocus = 'about'; this.title(); };
		const kv = ( k, ...v ) => h( 'div', {}, h( 'span', { text: k } ), h( 'span', {}, ...v ) );
		const body = h( 'div.panel-body', {}, h( 'div.kvlist', {},
			kv( 'Version', VERSION ),
			kv( 'Terrain', 'AWS Terrain Tiles: USGS 3DEP, SRTM, ETOPO1, GMRT' ),
			kv( 'Scale', '1:8' ),
			kv( 'Textures', 'Poly Haven (CC0)' ),
			kv( 'Sounds', 'Freesound (CC0) via Tidewater' ),
			kv( 'Characters', 'Microsoft Rocketbox (MIT)' ),
			kv( 'Interface basis', h( 'a', { href: 'https://github.com/dgreenheck/tidewater', target: '_blank', rel: 'noopener', text: 'Tidewater' } ), ' (MIT)' ),
			kv( 'Engine', 'three.js' ),
			kv( 'Fonts', 'Inter, JetBrains Mono (OFL)' ) ) );
		const el = this._screen( this._panel( 'About', body, null, { cls: '.about-panel', onClose: back } ), back );
		this._show( el, e => { if ( e.code === 'Escape' ) { back(); return true; } return false; } );
	}

	// ---- worlds -------------------------------------------------------------------------------------

	async worlds( selId = null ) {
		const S = this.app.saves, audio = this.app.audio;
		let list = await S.list();
		let sel = list.some( w => w.id === selId ) ? selId : list[ 0 ]?.id ?? null;
		const back = () => { this._titleFocus = 'worlds'; this.title(); };
		const cur = () => list.find( w => w.id === sel ) || null;
		const rows = new Map();
		const listEl = h( 'div.wlist', { role: 'listbox', 'aria-label': 'Worlds' } );
		const playBtn = this._btn( 'Play', () => play(), 'primary' );
		const fileIn = h( 'input', { type: 'file', accept: '.json,application/json', hidden: true } );
		const paint = () => {
			for ( const [ id, r ] of rows ) { r.classList.toggle( 'sel', id === sel ); r.setAttribute( 'aria-selected', id === sel ); }
			const w = cur();
			playBtn.disabled = ! w || !! w.dead;
		};
		const pick = ( id, scroll = false ) => { sel = id; paint(); if ( scroll ) rows.get( id )?.scrollIntoView( { block: 'nearest' } ); };
		const refresh = async ( id = sel ) => {
			list = await S.list();
			sel = list.some( w => w.id === id ) ? id : list[ 0 ]?.id ?? null;
			render();
			pick( sel, true );
		};
		const play = async () => { const w = cur(); if ( w && ! w.dead && ! playBtn._busy ) { playBtn._busy = true; await this._play( w.id ); playBtn._busy = false; } };
		const del = async ( w ) => {
			if ( ! await this.ui.confirm( `Delete “${w.name}”?`, null, 'Delete', 'danger' ) ) return;
			const i = list.findIndex( x => x.id === w.id );
			await S.delete( w.id );
			const next = list[ i + 1 ] || list[ i - 1 ];
			await refresh( next?.id ?? null );
		};
		const dup = async ( w ) => { const c = await S.duplicate( w.id ); await refresh( c?.id ?? w.id ); };
		const exp = async ( w ) => S.exportWorld( await S.load( w.id ) );
		const importFile = async ( f ) => {
			if ( ! f ) return;
			try { const w = await S.importWorld( f ); this.ui.toastScreen( 'Imported' ); await refresh( w.id ); } catch ( e ) { this.ui.toastScreen( importError( e ), 'bad' ); }
		};
		fileIn.addEventListener( 'change', () => { importFile( fileIn.files[ 0 ] ); fileIn.value = ''; } );
		// a row action acts on its row; mouse clicks drop focus so Enter keeps meaning Play
		const act = ( name, title, fn, w, cls ) => {
			const b = this._iconBtn( name, title, e => { e.stopPropagation(); pick( w.id ); if ( e.detail ) b.blur(); fn( w ); }, cls );
			b.addEventListener( 'dblclick', e => e.stopPropagation() );
			return b;
		};
		const row = ( w ) => {
			const tags = [ w.mode === 'creative' ? 'Creative' : ( w.difficulty || 'normal' ) ];
			if ( w.hardcore ) tags.push( 'Hardcore' );
			if ( w.dead ) tags.push( 'Dead' );
			const tagEl = h( 'span.tags' );
			tags.forEach( ( t, i ) => tagEl.append( i ? ' · ' : '', h( 'span.t-label' + ( i ? '.bad' : '' ), { text: t } ) ) );
			const r = h( 'div.lrow.wrow' + ( w.dead ? '.dead' : '' ), { role: 'option', onclick: () => pick( w.id ), ondblclick: () => { pick( w.id ); play(); } },
				thumb( w ),
				h( 'div', {}, h( 'div.nm', { text: w.name, title: w.name } ),
					h( 'div.meta', {}, tagEl, h( 'span', { text: [ `Day ${w.days}`, fmtTime( w.playTime || 0 ), fmtDate( w.lastPlayed ) ].filter( Boolean ).join( ' · ' ) } ) ) ),
				h( 'div.acts', {},
					act( 'edit', 'Details', x => this.editWorld( x.id ), w ),
					act( 'duplicate', 'Duplicate', dup, w ),
					act( 'export', 'Export', exp, w ),
					act( 'trash', 'Delete', del, w, 'del' ) ) );
			rows.set( w.id, r );
			return r;
		};
		const render = () => {
			rows.clear();
			clear( listEl );
			if ( ! list.length ) listEl.append( h( 'div.wempty', {}, this._btn( 'New world', () => this.createWorld(), 'primary', 'plus' ) ) );
			for ( const w of list ) listEl.append( row( w ) );
			paint();
		};
		render();
		const panel = this._panel( 'Worlds', h( 'div.panel-body.wbody', {}, listEl, fileIn ), h( 'div.panel-foot', {}, playBtn ), {
			cls: '.worlds-panel', onClose: back,
			head: [ this._btn( 'Import', () => fileIn.click(), '', 'import' ), this._btn( 'New world', () => this.createWorld(), '', 'plus' ) ],
		} );
		const el = this._screen( panel, back );
		// a world file dropped anywhere on the screen imports it
		const files = e => [ ...( e.dataTransfer?.types || [] ) ].includes( 'Files' );
		el.addEventListener( 'dragover', e => { if ( ! files( e ) ) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; panel.classList.add( 'drop' ); } );
		el.addEventListener( 'dragleave', e => { if ( ! e.relatedTarget || ! el.contains( e.relatedTarget ) ) panel.classList.remove( 'drop' ); } );
		el.addEventListener( 'drop', e => { if ( ! files( e ) ) return; e.preventDefault(); panel.classList.remove( 'drop' ); importFile( e.dataTransfer.files[ 0 ] ); } );
		this._show( el, e => {
			if ( typing() || e.ctrlKey || e.metaKey || e.altKey ) return false;
			const w = cur(), i = list.indexOf( w );
			switch ( e.code ) {
				case 'Escape': back(); return true;
				case 'ArrowDown': case 'ArrowUp': {
					if ( ! list.length ) return true;
					const n = list[ Math.min( list.length - 1, Math.max( 0, i + ( e.code === 'ArrowDown' ? 1 : - 1 ) ) ) ];
					if ( n.id !== sel ) audio.ui( 'ui_hover', 0.3 );
					pick( n.id, true );
					return true;
				}
				case 'Home': case 'End': if ( list.length ) pick( list[ e.code === 'Home' ? 0 : list.length - 1 ].id, true ); return true;
				case 'Enter': case 'NumpadEnter': if ( onButton() ) return false; if ( ! e.repeat ) play(); return true;
				case 'F2': if ( w ) this.editWorld( w.id ); return true;
				case 'Delete': if ( w ) del( w ); return true;
				case 'KeyN': this.createWorld(); return true;
			}
			return false;
		} );
		pick( sel, true );
	}

	async createWorld() {
		const audio = this.app.audio;
		const taken = new Set( ( await this.app.saves.list() ).map( w => w.name ) );
		let base = 'New World', nm = base;
		for ( let i = 2; taken.has( nm ); i ++ ) nm = `${base} ${i}`;
		const opt = { name: nm, seed: '', mode: 'survival', difficulty: 'normal', hardcore: false, dayMinutes: 48, startHour: 7.5, spawn: 'random' };
		const back = () => this.worlds();
		const name = h( 'input.input', { value: opt.name, maxLength: 40, spellcheck: false, oninput: e => { opt.name = e.target.value; } } );
		const seed = h( 'input.input.t-mono', { placeholder: 'Random', maxLength: 40, spellcheck: false, oninput: e => { opt.seed = e.target.value.trim(); } } );
		const hard = toggle( false, v => { opt.hardcore = v; }, { audio } );
		hard.setAttribute( 'aria-label', 'Hardcore' );
		const mode = seg( [ [ 'survival', 'Survival' ], [ 'creative', 'Creative' ] ], opt.mode, v => {
			opt.mode = v;
			// creative has no permadeath
			hard.disabled = v === 'creative';
			if ( hard.disabled ) { opt.hardcore = false; hard.set( false ); }
		}, { audio } );
		let busy = false;
		const create = async () => {
			if ( busy ) return;
			busy = true;
			const w = SaveSystem.newWorld( { ...opt, name: opt.name.trim() || nm } );
			await this.app.startGame( w );
			busy = false;
		};
		const body = h( 'div.panel-body.form', {},
			this._row( 'Name', name ),
			this._row( 'Seed', seed ),
			this._row( 'Mode', mode ),
			this._row( 'Difficulty', seg( [ [ 'easy', 'Easy' ], [ 'normal', 'Normal' ], [ 'hard', 'Hard' ] ], opt.difficulty, v => { opt.difficulty = v; }, { audio } ) ),
			this._row( 'Hardcore', hard ),
			this._row( 'Day length', seg( [ [ 24, '24' ], [ 48, '48' ], [ 96, '96' ], [ 144, '144' ] ], opt.dayMinutes, v => { opt.dayMinutes = v; }, { audio } ), h( 'span.t-label.unit', { text: 'min' } ) ),
			this._row( 'Start time', seg( [ [ 7.5, '07:30' ], [ 12, '12:00' ], [ 17.5, '17:30' ], [ 21, '21:00' ] ], opt.startHour, v => { opt.startHour = v; }, { audio } ) ),
			this._row( 'Spawn', select( SPAWNS, opt.spawn, v => { opt.spawn = v; }, { audio } ) ),
		);
		const foot = h( 'div.panel-foot', {}, this._btn( 'Cancel', back ), this._btn( 'Create', create, 'primary' ) );
		this._show( this._screen( this._panel( 'New world', body, foot, { cls: '.form-panel', onClose: back } ), back ), e => {
			if ( e.code === 'Escape' ) { back(); return true; }
			if ( ( e.code === 'Enter' || e.code === 'NumpadEnter' ) && ! onButton() && ! e.repeat ) { create(); return true; }
			return false;
		} );
		name.focus(); name.select();
	}

	async editWorld( id ) {
		const S = this.app.saves;
		const w = await S.load( id );
		if ( ! w ) return this.worlds();
		const back = () => this.worlds( id );
		const name = h( 'input.input', { value: w.name, maxLength: 40, spellcheck: false } );
		const copy = h( 'button.btn.icon.sm', { type: 'button', title: 'Copy', 'aria-label': 'Copy seed', onclick: async () => {
			this.app.audio.ui();
			try { await navigator.clipboard.writeText( String( w.seed ) ); } catch ( e ) {
				const t = h( 'textarea', { value: String( w.seed ), style: { position: 'fixed', opacity: 0 } } );
				document.body.append( t ); t.select(); try { document.execCommand( 'copy' ); } catch ( e2 ) { /* no clipboard */ } t.remove();
			}
			this.ui.toastScreen( 'Copied' );
		} }, icon( 'duplicate' ) );
		const st = w.stats || {};
		const kv = ( k, v ) => h( 'div', {}, h( 'span', { text: k } ), h( 'span', { text: String( v ) } ) );
		let busy = false;
		const save = async () => {
			if ( busy ) return;
			busy = true;
			const n = name.value.trim();
			if ( n && n !== w.name ) await S.rename( id, n );
			this.worlds( id );
		};
		const body = h( 'div.panel-body.form', {},
			this._row( 'Name', name ),
			this._row( 'Seed', h( 'span.t-mono.seed', { text: String( w.seed ) } ), copy ),
			h( 'div.stats', {},
				kv( 'Created', fmtDate( w.created ) ), kv( 'Played', fmtTime( w.playTime || 0 ) ),
				kv( 'Day', Math.floor( ( w.time?.hours || 0 ) / 24 ) + 1 ), kv( 'Distance', fmtDist( w.player?.distance || st.distance || 0 ) ),
				kv( 'Kills', ( st.zombies || 0 ) + ( st.kills || 0 ) ), kv( 'Deaths', st.deaths || 0 ) ) );
		const foot = h( 'div.panel-foot', {},
			this._btn( 'Delete', async () => { if ( await this.ui.confirm( `Delete “${w.name}”?`, null, 'Delete', 'danger' ) ) { await S.delete( id ); this.worlds(); } }, 'danger' ),
			h( 'div.sp' ),
			this._btn( 'Duplicate', async () => { const c = await S.duplicate( id ); this.worlds( c?.id ?? id ); } ),
			this._btn( 'Export', () => S.exportWorld( w ) ),
			this._btn( 'Save', save, 'primary' ) );
		this._show( this._screen( this._panel( 'World', body, foot, { cls: '.form-panel', onClose: back } ), back ), e => {
			if ( e.code === 'Escape' ) { back(); return true; }
			if ( ( e.code === 'Enter' || e.code === 'NumpadEnter' ) && ! onButton() && ! e.repeat ) { save(); return true; }
			return false;
		} );
		name.focus(); name.select();
	}

	// ---- options ----------------------------------------------------------------------------------

	options( back ) {
		const S = this.app.settings, audio = this.app.audio;
		const legacy = { video: 'interface', display: 'interface' }[ this._optTab ];
		let tab = TABS.some( t => t[ 0 ] === this._optTab ) ? this._optTab : legacy || 'graphics';
		let rows = [];
		const content = h( 'div.opt-content' );
		const resetBtn = this._btn( 'Reset tab', () => resetTab() );
		const footL = h( 'div.foot-l', {}, resetBtn );
		const foot = h( 'div.panel-foot', {}, footL, h( 'div.sp' ), this._btn( 'Done', () => close(), 'primary' ) );
		let stopListen = () => {};
		let keysKey = null; // the Keys tab's key handler while it is shown

		const refresh = () => {
			for ( const r of rows ) r.update();
			resetBtn.disabled = ! rows.some( r => r.changed );
		};
		// one option row: label, control, reset slot. get/def decide the changed dot; reset restores the default.
		const row = ( label, ctl, { key, get = () => S.get( key ), def = () => defOf( key ), reset = () => S.set( key, structuredClone( def() ) ), paint = null } = {} ) => {
			const rst = h( 'div.rst' );
			const rb = h( 'button.btn.icon.sm', { type: 'button', title: 'Reset', 'aria-label': 'Reset ' + label, onclick: () => { audio.ui(); reset(); refresh(); } }, icon( 'reset' ) );
			const el = h( 'div.row', {}, h( 'div.lab', { text: label } ), h( 'div.ctl', {}, ctl ), rst );
			const r = { el, changed: false, update() {
				paint?.();
				const ch = ! same( get(), def() );
				r.changed = ch;
				el.classList.toggle( 'changed', ch );
				if ( ch && ! rb.isConnected ) rst.append( rb ); else if ( ! ch && rb.isConnected ) rb.remove();
			} };
			rows.push( r );
			return el;
		};
		const set = ( key, v ) => { S.set( key, v ); refresh(); };
		// preset-controlled keys compare against the chosen preset, so picking Low doesn't mark every row
		const presetDef = key => () => QUALITY_PRESETS[ S.get( 'quality' ) ]?.[ key ] ?? DEFAULTS[ key ];
		const sl = ( label, key, min, max, step, fmt, { commit = false, def } = {} ) => {
			const [ inp, val ] = slider( { min, max, step, value: S.get( key ), fmt, onInput: commit ? null : v => set( key, v ), onChange: commit ? v => set( key, v ) : null } );
			inp.setAttribute( 'aria-label', label );
			return row( label, [ inp, val ], { key, def, paint: () => inp.set( S.get( key ) ) } );
		};
		const sg = ( label, key, opts, { def, get } = {} ) => {
			const el = seg( opts, ( get || ( () => S.get( key ) ) )(), v => set( key, v ), { audio } );
			el.setAttribute( 'aria-label', label );
			return row( label, el, { key, def, get, paint: () => el.set( ( get || ( () => S.get( key ) ) )() ) } );
		};
		const tg = ( label, key, { def } = {} ) => {
			const el = toggle( !! S.get( key ), v => set( key, v ), { audio } );
			el.setAttribute( 'aria-label', label );
			return row( label, el, { key, def, paint: () => el.set( !! S.get( key ) ) } );
		};
		const sec = t => h( 'div.sec-head', {}, h( 'span.t-label', { text: t } ) );
		const presetOf = () => {
			const q = S.get( 'quality' ), p = QUALITY_PRESETS[ q ];
			return p && Object.keys( p ).every( k => same( S.get( k ), p[ k ] ) ) ? q : 'custom';
		};

		const TAB = {
			graphics: () => {
				const pre = seg( [ ...LEVELS, [ 'custom', 'Custom' ] ], presetOf(), v => { S.applyPreset( v ); refresh(); }, { audio, disabled: new Set( [ 'custom' ] ) } );
				pre.setAttribute( 'aria-label', 'Preset' );
				return [
					sec( 'Quality' ),
					row( 'Preset', pre, { get: presetOf, def: () => DEFAULTS.quality, reset: () => S.applyPreset( DEFAULTS.quality ), paint: () => pre.set( presetOf() ) } ),
					sec( 'View' ),
					// the expensive ones apply when the slider is released
					sl( 'Render distance', 'renderDistance', 400, 4000, 100, v => ( v / 1000 ).toFixed( 1 ) + ' km', { commit: true, def: presetDef( 'renderDistance' ) } ),
					sl( 'Field of view', 'fov', 60, 110, 1, v => v + '°' ),
					sl( 'Resolution', 'renderScale', 0.5, 1.5, 0.05, pct, { commit: true, def: presetDef( 'renderScale' ) } ),
					sec( 'Detail' ),
					sg( 'Shadows', 'shadows', [ [ 'off', 'Off' ], [ 'medium', 'Medium' ], [ 'high', 'High' ], [ 'ultra', 'Ultra' ] ], { def: presetDef( 'shadows' ) } ),
					sg( 'Terrain', 'terrainDetail', LEVELS, { def: presetDef( 'terrainDetail' ) } ),
					sg( 'Vegetation', 'vegetation', LEVELS, { def: presetDef( 'vegetation' ) } ),
					tg( 'Grass', 'grass', { def: presetDef( 'grass' ) } ),
					sg( 'Clouds', 'clouds', [ [ 'off', 'Off' ], [ 'low', 'Low' ], [ 'high', 'High' ] ], { def: presetDef( 'clouds' ) } ),
					sg( 'Water', 'water', [ [ 'low', 'Low' ], [ 'medium', 'Medium' ], [ 'high', 'High' ] ], { def: presetDef( 'water' ) } ),
					sec( 'Image' ),
					sg( 'Anti-aliasing', 'antialias', [ [ 'off', 'Off' ], [ 'fxaa', 'FXAA' ], [ 'msaa', 'MSAA' ] ], { def: presetDef( 'antialias' ) } ),
					tg( 'Bloom', 'bloom', { def: presetDef( 'bloom' ) } ),
					sl( 'Night brightness', 'nightBrightness', 0.3, 2, 0.05, pct ),
				];
			},
			interface: () => [
				// rescaling the whole UI while dragging would move the slider under the pointer
				sl( 'GUI scale', 'guiScale', 0.7, 1.6, 0.05, pct, { commit: true } ),
				sg( 'HUD', 'hudMode', [ [ 'auto', 'Auto' ], [ 'always', 'Always' ] ], { get: () => S.get( 'hudMode' ) ?? 'auto' } ),
				sg( 'Crosshair', 'crosshair', [ [ 'dot', 'Dot' ], [ 'lines', 'Dynamic' ], [ 'none', 'None' ] ] ),
				tg( 'Compass', 'compass' ),
				tg( 'Minimap', 'minimap' ),
				tg( 'Hit markers', 'hitMarkers' ),
				tg( 'Damage direction', 'damageIndicators' ),
				tg( 'Prompts', 'showInteractHints' ),
				tg( 'Key hints', 'tutorial' ),
				tg( 'FPS', 'showFps' ),
			],
			audio: () => [
				sl( 'Master', 'masterVolume', 0, 1, 0.01, pct ),
				sl( 'Effects', 'sfxVolume', 0, 1, 0.01, pct ),
				sl( 'Ambience', 'ambientVolume', 0, 1, 0.01, pct ),
				sl( 'Music', 'musicVolume', 0, 1, 0.01, pct ),
				sl( 'Interface', 'uiVolume', 0, 1, 0.01, pct ),
			],
			controls: () => [
				sl( 'Sensitivity', 'sensitivity', 0.2, 3, 0.05, v => v.toFixed( 2 ) + '×' ),
				tg( 'Invert Y', 'invertY' ),
				sg( 'Crouch', 'toggleCrouch', HOLD ),
				sg( 'Aim', 'toggleAim', HOLD ),
				sg( 'Sprint', 'toggleSprint', HOLD ),
				sl( 'Head bob', 'headBob', 0, 1, 0.05, pct ),
			],
			keys: () => this._keysTab( { S, audio, row: ( label, ctl, o ) => row( label, ctl, o ), refresh, footL, resetBtn, onListen: f => { stopListen = f; }, onKey: f => { keysKey = f; } } ),
			gameplay: () => [
				tg( 'Auto-pickup ammo', 'autoPickupAmmo' ),
				sg( 'Map and compass', 'realisticMap', [ [ false, 'Always' ], [ true, 'Need item' ] ] ),
			],
		};

		const build = () => {
			stopListen(); stopListen = () => {};
			keysKey = null;
			rows = [];
			clear( content );
			// Keys: a fixed search bar over its own scrolling list
			content.classList.toggle( 'keys', tab === 'keys' );
			content.append( ...TAB[ tab ]() );
			content.scrollTop = 0;
			refresh();
		};
		const resetTab = async () => {
			const lab = TABS.find( t => t[ 0 ] === tab )[ 1 ];
			if ( ! await this.ui.confirm( tab === 'keys' ? 'Reset keys?' : `Reset ${lab}?`, null, 'Reset' ) ) return;
			if ( tab === 'keys' ) S.set( 'bindings', structuredClone( DEFAULT_BINDINGS ) );
			else {
				if ( tab === 'graphics' ) S.applyPreset( DEFAULTS.quality );
				for ( const k of TAB_KEYS[ tab ] ) S.set( k, structuredClone( defOf( k ) ) );
			}
			refresh();
		};
		const close = () => { stopListen(); back(); };
		const tabs = rail( TABS, tab, v => { tab = v; this._optTab = v; build(); }, { audio } );
		build();
		const panel = this._panel( 'Options', h( 'div.opt-body', {}, tabs, content ), foot, { cls: '.opt-panel', onClose: close } );
		const el = this._screen( panel, close );
		this._show( el, e => {
			if ( keysKey && keysKey( e ) ) return true;
			if ( e.code === 'Escape' ) { close(); return true; }
			return false;
		}, { onClose: () => stopListen() } );
		tabs.querySelector( '.on' )?.focus( { preventScroll: true } );
	}

	// Keys tab (12.3): search, groups of rows with two bind buttons, the hotbar as nine caps. Click a bind to
	// listen: the next key or mouse button binds it, Esc cancels, Backspace / Delete clears.
	_keysTab( { S, audio, row, refresh, footL, resetBtn, onListen, onKey } ) {
		let listen = null; // { a, k, el }
		const hints = h( 'div.foot-hints', {},
			h( 'span.hint', {}, kc( 'Esc', 'out' ), h( 'span', { text: 'Cancel' } ) ),
			h( 'span.hint', {}, kc( 'Backspace', 'out' ), h( 'span', { text: 'Clear' } ) ) );
		const cells = []; // { a, k, el }
		const shown = [ ...KEY_GROUPS.flatMap( g => g[ 1 ] ).filter( a => a !== 'hotbar' && a !== 'pause' ), ...SLOTS ];

		// codes shared by two actions of the same kind, unless both had that code from the start
		const clashes = ( binds ) => {
			const users = {};
			for ( const a of shown ) for ( const c of binds[ a ] || [] ) ( users[ c ] ||= [] ).push( a );
			return ( a, code ) => ( users[ code ] || [] ).filter( o => o !== a && VEHICLE.has( o ) === VEHICLE.has( a ) && ! ( DEFAULT_BINDINGS[ o ]?.includes( code ) && DEFAULT_BINDINGS[ a ]?.includes( code ) ) );
		};
		const paintCell = ( c, binds, clash ) => {
			const code = binds[ c.a ]?.[ c.k ];
			const list = code ? clash( c.a, code ) : [];
			const lab = code ? prettyCode( code ) : '';
			const listening = listen && listen.el === c.el;
			const txt = listening ? '' : lab;
			if ( c.el._txt !== txt ) {
				c.el._txt = txt;
				clear( c.el );
				if ( txt === 'LMB' || txt === 'RMB' ) c.el.append( icon( txt === 'LMB' ? 'mouseL' : 'mouseR', 12 ) ); else c.el.textContent = txt;
			}
			c.el.classList.toggle( 'listen', listening );
			c.el.classList.toggle( 'conflict', ! listening && list.length > 0 );
			if ( list.length ) c.el.title = 'Also: ' + list.map( keyLabel ).join( ', ' ); else c.el.removeAttribute( 'title' );
			c.el.setAttribute( 'aria-label', `${keyLabel( c.a )} ${c.k + 1}: ${lab || 'none'}` );
		};
		const paintAll = () => {
			const binds = S.get( 'bindings' ), clash = clashes( binds );
			for ( const c of cells ) paintCell( c, binds, clash );
		};

		const stop = () => {
			if ( ! listen ) return;
			listen = null;
			window.removeEventListener( 'pointerdown', onPointer, true );
			window.removeEventListener( 'contextmenu', onMenu, true );
			hints.replaceWith( resetBtn );
			paintAll();
		};
		const commit = ( code ) => {
			const { a, k } = listen;
			const nb = structuredClone( S.get( 'bindings' ) );
			const arr = nb[ a ] ? [ ...nb[ a ] ] : [];
			if ( code === null ) arr.splice( k, 1 ); else arr[ k ] = code;
			// no empty holes, no duplicate of the same code in one action
			nb[ a ] = arr.filter( ( c, i ) => c && arr.indexOf( c ) === i );
			stop();
			S.set( 'bindings', nb );
			audio.ui();
			refresh();
		};
		const onPointer = e => {
			if ( ! listen ) return;
			// the left button binds only on the listening cell; anywhere else it cancels
			if ( e.button === 0 && ! listen.el.contains( e.target ) ) { stop(); return; }
			e.preventDefault(); e.stopImmediatePropagation();
			listen.el._eatT = performance.now(); // the click that follows must not start listening again
			commit( 'Mouse' + e.button );
		};
		const onMenu = e => { e.preventDefault(); };
		const onWheel = ( c ) => e => {
			if ( ! listen || listen.el !== c.el ) return;
			e.preventDefault();
			commit( e.deltaY < 0 ? 'WheelUp' : 'WheelDown' );
		};
		const start = ( c ) => {
			if ( listen?.el === c.el ) return;
			stop();
			listen = c;
			// after this click's own pointer events
			setTimeout( () => { if ( listen === c ) { window.addEventListener( 'pointerdown', onPointer, true ); window.addEventListener( 'contextmenu', onMenu, true ); } } );
			if ( resetBtn.isConnected ) resetBtn.replaceWith( hints ); else footL.replaceChildren( hints );
			paintAll();
		};
		const bind = ( a, k, cls = '' ) => {
			const el = h( 'button.bind' + cls, { type: 'button' } );
			const c = { a, k, el };
			el.addEventListener( 'click', () => { if ( performance.now() - ( el._eatT || 0 ) < 1000 ) return; audio.ui(); start( c ); } );
			el.addEventListener( 'wheel', onWheel( c ), { passive: false } );
			cells.push( c );
			return el;
		};
		onListen( stop );
		onKey( e => {
			if ( listen ) {
				if ( e.repeat ) return true;
				if ( e.code === 'Escape' ) { stop(); audio.ui(); return true; }
				commit( e.code === 'Backspace' || e.code === 'Delete' ? null : e.code );
				return true;
			}
			if ( ( e.ctrlKey || e.metaKey ) && e.code === 'KeyF' ) { q.focus(); q.select(); return true; }
			// Esc in a filled search clears it first
			if ( e.code === 'Escape' && document.activeElement === q && q.value ) { q.value = ''; filter(); return true; }
			return false;
		} );

		// search: the start of a word in a label ('r' finds Right and Reload, not Forward), or the name of a bound
		// key ('f', 'shift', 'rmb')
		const q = h( 'input.input', { placeholder: 'Search', spellcheck: false, 'aria-label': 'Search keys', oninput: () => filter() } );
		const groups = []; // { head, rows: [ { el, a: [actions], label } ] }
		const words = s => ' ' + s.toLowerCase().replace( /-/g, ' ' );
		const filter = () => {
			const t = q.value.trim().toLowerCase(), binds = S.get( 'bindings' );
			for ( const g of groups ) {
				let any = false;
				for ( const r of g.rows ) {
					const ok = ! t || words( r.label ).includes( words( t ) ) || r.acts.some( a => ( binds[ a ] || [] ).some( c => prettyCode( c ).toLowerCase() === t ) );
					r.el.hidden = ! ok;
					any ||= ok;
				}
				g.head.hidden = ! any;
			}
		};
		const listEl = h( 'div.keys-list' );

		const differs = acts => acts.some( a => ! same( S.get( 'bindings' )[ a ] || [], DEFAULT_BINDINGS[ a ] || [] ) );
		const resetActs = acts => { const nb = structuredClone( S.get( 'bindings' ) ); for ( const a of acts ) nb[ a ] = structuredClone( DEFAULT_BINDINGS[ a ] ); S.set( 'bindings', nb ); };
		for ( const [ name, acts ] of KEY_GROUPS ) {
			const g = { head: h( 'div.sec-head', {}, h( 'span.t-label', { text: name } ) ), rows: [] };
			listEl.append( g.head );
			for ( const a of acts ) {
				let el;
				if ( a === 'hotbar' ) {
					// this row repaints every cell once per refresh (it is always present)
					el = row( 'Hotbar', h( 'div.binds9', {}, ...SLOTS.map( s => bind( s, 0, '.sq' ) ) ), { get: () => differs( SLOTS ), def: () => false, reset: () => resetActs( SLOTS ), paint: paintAll } );
					g.rows.push( { el, label: 'Hotbar', acts: SLOTS } );
				} else if ( a === 'pause' ) {
					el = h( 'div.row', {}, h( 'div.lab', { text: 'Pause' } ), h( 'div.ctl', {}, h( 'span.bind.fixed', { text: 'Esc' } ), h( 'span.bind.fixed.none' ) ), h( 'div.rst' ) );
					g.rows.push( { el, label: 'Pause', acts: [] } );
				} else {
					if ( ! DEFAULT_BINDINGS[ a ] ) continue;
					el = row( keyLabel( a ), [ bind( a, 0 ), bind( a, 1 ) ], { get: () => differs( [ a ] ), def: () => false, reset: () => resetActs( [ a ] ) } );
					g.rows.push( { el, label: keyLabel( a ), acts: [ a ] } );
				}
				listEl.append( el );
			}
			groups.push( g );
		}
		return [ h( 'div.keys-bar', {}, h( 'div.search', {}, icon( 'search' ), q ) ), listEl ];
	}

	// ---- in game --------------------------------------------------------------------------------------

	// the canvas only holds a picture right after a frame is drawn: saving inside the next animation frame
	// (after the game loop's render) gives the world list a real thumbnail instead of a black one
	_saveInFrame( fn ) { return nextFrame( fn ); }

	pause( focusId = null ) {
		const g = this.ui.game;
		if ( ! g ) return;
		const m = this._menu( [
			{ id: 'resume', label: 'Resume', key: 'Esc', run: () => this.ui.closeScreen() },
			{ id: 'options', label: 'Options', run: () => this.options( () => this.pause( 'options' ) ) },
			{ id: 'save', label: 'Save', run: async () => { await this._saveInFrame( () => g.saveNow( true ) ); this.ui.toastScreen( 'Saved' ); } },
			! g.save.hardcore && { id: 'mode', label: g.mode === 'creative' ? 'Survival mode' : 'Creative mode', run: () => {
				g.commands?.run( `/gamemode ${g.mode === 'creative' ? 'survival' : 'creative'}` );
				this.pause( 'mode' );
			} },
			{ id: 'quit', label: 'Quit to title', run: async () => { await this._saveInFrame( () => this.app.quit( true ) ); this.ui.exitGame(); } },
		].filter( Boolean ) );
		const el = h( 'div.screen.title-screen.pause', {},
			h( 'div.menu-col', {},
				h( 'div.kick.t-label', { text: 'Paused' } ),
				h( 'div.where', { text: `${g.save.name} · Day ${g.day}` } ),
				...m.els ) );
		this._show( el, e => {
			if ( e.code === 'Escape' ) { if ( ! e.repeat ) this.ui.closeScreen(); return true; }
			return m.keys( e );
		}, { paused: true } );
		m.focus( focusId );
	}

	async _endWorld( id ) {
		try {
			const S = this.app.saves, w = await S.load( id );
			if ( w && ! w.dead ) { w.dead = true; await S.save( w ); }
		} catch ( e ) { console.warn( 'could not end the world', e ); }
	}

	death( info = {} ) {
		const g = this.ui.game;
		const hard = !! g?.save?.hardcore;
		const kills = info.kills ?? g?.stats?.lifeKills ?? 0;
		// hardcore: the world ends now. Game.saveNow() skips saves once a hardcore survivor is dead, so its dead
		// flag never reaches storage on its own; without this, Continue and Play would reopen the world.
		const ended = hard && g.save?.id ? this._endWorld( g.save.id ) : null;
		let busy = false;
		const quit = async () => {
			if ( busy ) return;
			busy = true;
			this.app.audio.ui();
			await ended;
			await this.app.quit( ! hard );
			this.ui.exitGame();
		};
		// the death screen is sticky, so closeScreen() would refuse it
		const respawn = () => {
			if ( busy ) return;
			busy = true;
			this.app.audio.ui();
			g.respawn();
			this.ui.hideAll();
			g.paused = false;
			this.app.input.lock();
		};
		const stat = ( v, l ) => h( 'div', {}, h( 'div.t-num', { text: String( v ) } ), h( 'div.t-label', { text: l } ) );
		const first = hard ? h( 'button.btn.lg', { type: 'button', text: 'Quit', onclick: quit } ) : h( 'button.btn.lg.primary', { type: 'button', text: 'Respawn', onclick: respawn } );
		const el = h( 'div.screen.death', { role: 'alertdialog', 'aria-label': causeTitle( info.cause ) },
			h( 'h1.cause.t-display', { text: causeTitle( info.cause ) } ),
			h( 'div.stats-row', {}, stat( fmtDur( Math.max( 0, info.days || 0 ) * 24 ), 'Survived' ), stat( kills, 'Kills' ) ),
			hard ? h( 'div.over.t-label', { text: 'World over' } ) : null,
			h( 'div.btns', {}, first, hard ? null : h( 'button.btn.lg', { type: 'button', text: 'Quit', onclick: quit } ) ) );
		// Enter is the first button; it isn't focused, so no focus ring greets the death screen
		this._show( el, e => {
			if ( ( e.code === 'Enter' || e.code === 'NumpadEnter' ) && ! onButton() ) { if ( ! e.repeat ) first.click(); return true; }
			return false;
		}, { sticky: true } );
	}
}
