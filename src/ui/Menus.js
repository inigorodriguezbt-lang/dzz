// Full-screen menus: title, worlds, create / edit world, options (with key rebinding), pause, death,
// controls and credits.
import { h, clear, fmtTime, fmtDate } from './dom.js';
import { SaveSystem } from '../core/SaveSystem.js';
import { BINDING_LABELS, DEFAULT_BINDINGS, QUALITY_PRESETS } from '../core/Settings.js';
import { prettyCode } from '../core/Input.js';

function panel( title, sub, body, foot, { width = 720, onClose } = {} ) {
	const head = h( 'div.panel-head', {}, h( 'div', {}, h( 'h2', { text: title } ), sub ? h( 'div.sub', { text: sub } ) : null ), onClose ? h( 'button.x-btn', { onclick: onClose, title: 'Close', text: '✕' } ) : null );
	return h( 'div.panel', { style: { width: `min(${width}px, 94vw)` } }, head, h( 'div.panel-body', {}, body ), foot ? h( 'div.panel-foot', {}, foot ) : null );
}

export class Menus {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
	}

	btn( text, onclick, cls = '' ) { return h( 'button.btn' + ( cls ? '.' + cls : '' ), { onclick: ( e ) => { this.app.audio.ui(); onclick( e ); }, text } ); }

	// ---- title ------------------------------------------------------------------------------------

	title() {
		const col = h( 'div.title-col', {},
			h( 'p.loader-kicker', { text: 'A Hawaiian Islands survival game' } ),
			h( 'h1', { text: 'DEADTIDE' } ),
			this._menuBtn( 'Continue', 'Last world', async () => {
				const list = await this.app.saves.list();
				const w = list.find( x => ! x.dead );
				if ( ! w ) return this.worlds();
				this.app.startGame( await this.app.saves.load( w.id ) );
			}, 'continue' ),
			this._menuBtn( 'Singleplayer', 'Worlds', () => this.worlds() ),
			this._menuBtn( 'Options', '', () => this.options( () => this.title() ) ),
			this._menuBtn( 'Controls', '', () => this.controls( () => this.title() ) ),
			this._menuBtn( 'Credits', '', () => this.credits() ),
		);
		const foot = h( 'div.title-foot', { html: 'Terrain: AWS Terrain Tiles (USGS, SRTM, ETOPO1) · Textures: Poly Haven (CC0) · Sounds: Freesound CC0 via Tidewater<br>Built with three.js · Deadtide v0.1' } );
		const s = h( 'div.screen.title-screen', {}, col, foot );
		this.ui.show( s );
		this.app.saves.list().then( list => {
			const c = col.querySelector( '[data-id=continue]' );
			const w = list.find( x => ! x.dead );
			if ( ! w ) c.remove(); else c.querySelector( '.hint' ).textContent = w.name;
		} );
	}

	_menuBtn( text, hint, fn, id ) {
		return h( 'button.menu-btn', { 'data-id': id, onclick: () => { this.app.audio.ui(); fn(); }, onmouseenter: () => this.app.audio.ui( 'ui_hover', 0.3 ) }, h( 'span', { text } ), h( 'span.hint', { text: hint } ) );
	}

	// ---- worlds -------------------------------------------------------------------------------------

	async worlds() {
		let list = await this.app.saves.list();
		let sel = list[ 0 ]?.id || null;
		const listEl = h( 'div.worlds' );
		const fileIn = h( 'input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } } );
		fileIn.addEventListener( 'change', async () => {
			const f = fileIn.files[ 0 ];
			if ( ! f ) return;
			try { const w = await this.app.saves.importWorld( f ); sel = w.id; this.ui.toastScreen( `Imported “${w.name}”` ); await refresh(); } catch ( e ) { this.ui.toastScreen( e.message, 'bad' ); }
			fileIn.value = '';
		} );
		const playBtn = this.btn( 'Play selected world', () => play(), 'primary' );
		const editBtn = this.btn( 'Edit', () => { if ( sel ) this.editWorld( sel ); } );
		const expBtn = this.btn( 'Export', async () => { if ( ! sel ) return; this.app.saves.exportWorld( await this.app.saves.load( sel ) ); } );
		const delBtn = this.btn( 'Delete', () => del(), 'danger' );
		const play = async () => {
			if ( ! sel ) return;
			const w = await this.app.saves.load( sel );
			if ( w.dead ) { this.ui.toastScreen( 'That hardcore world is over — its survivor died.', 'bad' ); return; }
			this.app.startGame( w );
		};
		const del = async () => {
			if ( ! sel ) return;
			const w = list.find( x => x.id === sel );
			if ( ! await this.ui.confirm( `Delete “${w.name}”?`, 'This world will be gone forever (export it first to keep a copy).', 'Delete', 'danger' ) ) return;
			await this.app.saves.delete( sel );
			sel = null;
			await refresh();
		};
		const refresh = async () => {
			list = await this.app.saves.list();
			if ( ! list.find( x => x.id === sel ) ) sel = list[ 0 ]?.id || null;
			clear( listEl );
			if ( ! list.length ) listEl.appendChild( h( 'div.empty', { html: 'No worlds yet.<br>Create one to wash up on a beach somewhere in Hawaiʻi.' } ) );
			for ( const w of list ) {
				const row = h( 'div.world-row' + ( w.id === sel ? '.sel' : '' ), {
					onclick: () => { sel = w.id; refresh(); }, ondblclick: () => { sel = w.id; play(); },
				},
				w.thumb ? h( 'img.world-thumb', { src: w.thumb, alt: '' } ) : h( 'div.world-thumb' ),
				h( 'div', {}, h( 'div.world-name', { text: w.name } ),
					h( 'div.world-meta', {}, h( 'span.badge' + ( w.mode === 'creative' ? '.creative' : '' ), { text: w.mode } ), ' ',
						w.hardcore ? h( 'span.badge.hardcore', { text: w.dead ? 'hardcore · dead' : 'hardcore' } ) : null, ' ',
						`Day ${w.days} · ${w.difficulty} · played ${fmtTime( w.playTime || 0 )} · ${fmtDate( w.lastPlayed )}` ) ),
				h( 'div.dim.mono', { style: { fontSize: '11px' }, text: 'seed ' + w.seed } ) );
				listEl.appendChild( row );
			}
			for ( const b of [ playBtn, editBtn, expBtn, delBtn ] ) b.disabled = ! sel;
		};
		await refresh();
		const p = panel( 'Singleplayer', 'Worlds are saved in this browser. Export them to keep a backup or move them to another computer.', h( 'div', {}, listEl, fileIn ),
			[ this.btn( 'Import world…', () => fileIn.click() ), h( 'div', { style: { flex: 1 } } ), delBtn, expBtn, editBtn, this.btn( 'Create new world', () => this.createWorld() ), playBtn ],
			{ width: 860, onClose: () => this.title() } );
		this.ui.show( h( 'div.screen', {}, p ) );
	}

	createWorld() {
		const opt = { name: 'New World', seed: '', mode: 'survival', difficulty: 'normal', hardcore: false, dayMinutes: 48, spawn: 'random', startHour: 7.5 };
		const name = h( 'input.input', { value: opt.name, maxLength: 40, oninput: e => { opt.name = e.target.value; } } );
		const seed = h( 'input.input', { placeholder: 'Leave blank for a random seed', oninput: e => { opt.seed = e.target.value; } } );
		const seg = ( key, options ) => {
			const el = h( 'div.seg' );
			const draw = () => { clear( el ); for ( const [ v, label ] of options ) el.appendChild( h( 'button' + ( opt[ key ] === v ? '.on' : '' ), { text: label, onclick: () => { opt[ key ] = v; draw(); this.app.audio.ui(); } } ) ); };
			draw();
			return el;
		};
		const row = ( label, ctl, hint ) => h( 'div.row', {}, h( 'div', {}, h( 'div.lab', { text: label } ), hint ? h( 'div.dim', { style: { fontSize: '11px' }, text: hint } ) : null ), h( 'div.ctl', {}, ctl ) );
		const body = h( 'div.form-grid', {},
			row( 'World name', name ),
			row( 'Seed', seed, 'Loot, the infected and events come from the seed' ),
			row( 'Game mode', seg( 'mode', [ [ 'survival', 'Survival' ], [ 'creative', 'Creative' ] ] ), 'Creative: fly, no hunger or damage, every item in the catalog' ),
			row( 'Difficulty', seg( 'difficulty', [ [ 'easy', 'Easy' ], [ 'normal', 'Normal' ], [ 'hard', 'Hard' ] ] ), 'How fast you get hungry and how hard the infected hit' ),
			row( 'Hardcore', seg( 'hardcore', [ [ false, 'Off' ], [ true, 'On — one life' ] ] ), 'No cheats; the world ends when you die' ),
			row( 'Day length', seg( 'dayMinutes', [ [ 24, '24 min' ], [ 48, '48 min' ], [ 96, '96 min' ], [ 144, '2 h 24' ] ] ), 'Real minutes per game day' ),
			row( 'Start at', seg( 'startHour', [ [ 7.5, 'Morning' ], [ 12, 'Noon' ], [ 17.5, 'Evening' ], [ 21, 'Night' ] ] ) ),
			row( 'Wash up on', h( 'select.input', { style: { width: '220px' }, onchange: e => { opt.spawn = e.target.value; } },
				...[ [ 'random', 'Any island (random beach)' ], [ 'oahu', 'Oʻahu' ], [ 'kauai', 'Kauaʻi' ], [ 'maui', 'Maui' ], [ 'bigisland', 'Hawaiʻi (Big Island)' ], [ 'molokai', 'Molokaʻi' ], [ 'lanai', 'Lānaʻi' ], [ 'niihau', 'Niʻihau' ] ].map( ( [ v, l ] ) => h( 'option', { value: v, text: l } ) ) ) ),
		);
		const p = panel( 'Create new world', 'Eight islands, the infected, and whatever you can find.', body,
			[ this.btn( 'Cancel', () => this.worlds() ), this.btn( 'Create world', () => {
				const w = SaveSystem.newWorld( opt );
				this.app.startGame( w );
			}, 'primary' ) ], { width: 640, onClose: () => this.worlds() } );
		this.ui.show( h( 'div.screen', {}, p ) );
		setTimeout( () => { name.focus(); name.select(); }, 50 );
	}

	async editWorld( id ) {
		const w = await this.app.saves.load( id );
		const name = h( 'input.input', { value: w.name, maxLength: 40 } );
		const body = h( 'div.form-grid', {},
			h( 'div.row', {}, h( 'div.lab', { text: 'World name' } ), h( 'div.ctl', {}, name ) ),
			h( 'div.row', {}, h( 'div.lab', { text: 'Seed' } ), h( 'div.ctl.mono', { text: String( w.seed ) } ) ),
			h( 'div.row', {}, h( 'div.lab', { text: 'Created' } ), h( 'div.ctl', { text: new Date( w.created ).toLocaleString() } ) ),
			h( 'div.row', {}, h( 'div.lab', { text: 'Survivor stats' } ), h( 'div.ctl.dim', { text: `${w.stats?.zombies || 0} infected killed · ${w.stats?.deaths || 0} deaths · ${( ( w.stats?.distance || 0 ) / 1000 ).toFixed( 1 )} km walked` } ) ),
		);
		const p = panel( 'Edit world', w.name, body, [
			this.btn( 'Duplicate', async () => { await this.app.saves.duplicate( id ); this.worlds(); } ),
			this.btn( 'Export', () => this.app.saves.exportWorld( w ) ),
			h( 'div', { style: { flex: 1 } } ),
			this.btn( 'Cancel', () => this.worlds() ),
			this.btn( 'Save', async () => { await this.app.saves.rename( id, name.value.trim() || w.name ); this.worlds(); }, 'primary' ),
		], { width: 600, onClose: () => this.worlds() } );
		this.ui.show( h( 'div.screen', {}, p ) );
	}

	credits() {
		const body = h( 'div.journal', { html: `
			<p><b>Deadtide</b> is a browser survival game on a scaled replica of the Hawaiian Islands: real elevation and ocean depth from AWS Terrain Tiles
			(USGS 3DEP / NED, SRTM, ETOPO1, GMRT), baked at 1:8 horizontally with the towns, highways and buildings laid out procedurally.</p>
			<p>Look and UI after <a href="https://github.com/dgreenheck/tidewater" target="_blank" style="color:var(--tw-aqua)">Tidewater</a> by DRG Software Solutions (MIT).
			Field recordings are CC0 from Freesound, collected by Tidewater (see <code>public/audio/CREDITS.md</code>). Surface textures are CC0 from Poly Haven.
			Character models from the Microsoft Rocketbox library (MIT) where used. Everything else — guns, vehicles, buildings, items, sounds — is generated in code.</p>
			<p>Rendering with three.js. Fonts: Inter and JetBrains Mono (SIL OFL).</p>
			<p class="dim">Mahalo for playing. Stay off the beaches after dark.</p>` } );
		this.ui.show( h( 'div.screen', {}, panel( 'Credits', '', body, [ this.btn( 'Back', () => this.title() ) ], { width: 640, onClose: () => this.title() } ) ) );
	}

	// ---- options ----------------------------------------------------------------------------------

	options( back ) {
		const S = this.app.settings;
		let tab = this._optTab || 'video';
		const tabs = h( 'div.opt-tabs' );
		const body = h( 'div' );
		const slider = ( key, min, max, step, fmt = v => v ) => {
			const val = h( 'span.val' );
			const inp = h( 'input', { type: 'range', min, max, step, value: S.get( key ) } );
			const upd = () => { val.textContent = fmt( + inp.value ); inp.style.setProperty( '--p', ( ( inp.value - min ) / ( max - min ) * 100 ) + '%' ); };
			inp.addEventListener( 'input', () => { S.set( key, + inp.value ); upd(); } );
			upd();
			return [ inp, val ];
		};
		const toggle = ( key ) => {
			const t = h( 'button.toggle' + ( S.get( key ) ? '.on' : '' ) );
			t.onclick = () => { S.set( key, ! S.get( key ) ); t.classList.toggle( 'on', S.get( key ) ); this.app.audio.ui(); };
			return t;
		};
		const seg = ( key, opts, after ) => {
			const el = h( 'div.seg' );
			const draw = () => { clear( el ); for ( const [ v, l ] of opts ) el.appendChild( h( 'button' + ( S.get( key ) === v ? '.on' : '' ), { text: l, onclick: () => { S.set( key, v ); draw(); this.app.audio.ui(); after && after(); } } ) ); };
			draw();
			return el;
		};
		const row = ( label, ...ctl ) => h( 'div.row', {}, h( 'label', { text: label } ), h( 'div.ctl', {}, ...ctl ) );
		const sec = t => h( 'div.opt-section', { text: t } );
		const q4 = [ [ 'off', 'Off' ], [ 'medium', 'Medium' ], [ 'high', 'High' ], [ 'ultra', 'Ultra' ] ];
		const l4 = [ [ 'low', 'Low' ], [ 'medium', 'Medium' ], [ 'high', 'High' ], [ 'ultra', 'Ultra' ] ];
		const build = () => {
			clear( tabs );
			for ( const [ k, l ] of [ [ 'video', 'Display' ], [ 'graphics', 'Graphics' ], [ 'audio', 'Audio' ], [ 'controls', 'Controls' ], [ 'keys', 'Key bindings' ], [ 'gameplay', 'Gameplay' ] ] ) {
				tabs.appendChild( h( 'button' + ( tab === k ? '.on' : '' ), { text: l, onclick: () => { tab = k; this._optTab = k; build(); this.app.audio.ui(); } } ) );
			}
			clear( body );
			if ( tab === 'video' ) body.append(
				sec( 'View' ),
				row( 'Field of view', ...slider( 'fov', 60, 110, 1, v => v + '°' ) ),
				row( 'Render distance', ...slider( 'renderDistance', 400, 4000, 100, v => ( v / 1000 ).toFixed( 1 ) + ' km' ) ),
				row( 'Resolution scale', ...slider( 'renderScale', 0.5, 1.5, 0.05, v => Math.round( v * 100 ) + '%' ) ),
				row( 'Head bob', ...slider( 'headBob', 0, 1, 0.05, v => Math.round( v * 100 ) + '%' ) ),
				sec( 'Interface' ),
				row( 'GUI scale', ...slider( 'guiScale', 0.7, 1.6, 0.05, v => Math.round( v * 100 ) + '%' ) ),
				row( 'Crosshair', seg( 'crosshair', [ [ 'dot', 'Dot' ], [ 'lines', 'Dynamic' ], [ 'none', 'None' ] ] ) ),
				row( 'Show FPS', toggle( 'showFps' ) ),
				row( 'Compass', toggle( 'compass' ) ),
				row( 'Minimap', ( () => { if ( S.get( 'minimap' ) === undefined ) S.set( 'minimap', true, false ); return toggle( 'minimap' ); } )() ),
			);
			if ( tab === 'graphics' ) body.append(
				row( 'Preset', seg( 'quality', [ [ 'low', 'Low' ], [ 'medium', 'Medium' ], [ 'high', 'High' ], [ 'ultra', 'Ultra' ] ], () => { S.applyPreset( S.get( 'quality' ) ); build(); } ) ),
				sec( 'Detail' ),
				row( 'Shadows', seg( 'shadows', q4 ) ),
				row( 'Terrain detail', seg( 'terrainDetail', l4 ) ),
				row( 'Vegetation', seg( 'vegetation', l4 ) ),
				row( 'Grass', toggle( 'grass' ) ),
				row( 'Clouds', seg( 'clouds', [ [ 'off', 'Off' ], [ 'low', 'Low' ], [ 'high', 'High' ] ] ) ),
				row( 'Water', seg( 'water', [ [ 'low', 'Low' ], [ 'medium', 'Medium' ], [ 'high', 'High' ] ] ) ),
				sec( 'Image' ),
				row( 'Anti-aliasing', seg( 'antialias', [ [ 'off', 'Off' ], [ 'fxaa', 'FXAA' ], [ 'msaa', 'MSAA 4×' ] ] ) ),
				row( 'Bloom', toggle( 'bloom' ) ),
				row( 'Night brightness', ...slider( 'nightBrightness', 0.3, 2, 0.05, v => Math.round( v * 100 ) + '%' ) ),
			);
			if ( tab === 'audio' ) body.append(
				row( 'Master', ...slider( 'masterVolume', 0, 1, 0.01, v => Math.round( v * 100 ) + '%' ) ),
				row( 'Effects', ...slider( 'sfxVolume', 0, 1, 0.01, v => Math.round( v * 100 ) + '%' ) ),
				row( 'Ambience', ...slider( 'ambientVolume', 0, 1, 0.01, v => Math.round( v * 100 ) + '%' ) ),
				row( 'Interface', ...slider( 'uiVolume', 0, 1, 0.01, v => Math.round( v * 100 ) + '%' ) ),
			);
			if ( tab === 'controls' ) body.append(
				row( 'Mouse sensitivity', ...slider( 'sensitivity', 0.2, 3, 0.05, v => v.toFixed( 2 ) + '×' ) ),
				row( 'Invert mouse Y', toggle( 'invertY' ) ),
				row( 'Toggle crouch', toggle( 'toggleCrouch' ) ),
				row( 'Toggle aim', toggle( 'toggleAim' ) ),
				row( 'Toggle sprint', toggle( 'toggleSprint' ) ),
			);
			if ( tab === 'keys' ) body.append( this._keybinds( build ) );
			if ( tab === 'gameplay' ) body.append(
				row( 'Hit markers', toggle( 'hitMarkers' ) ),
				row( 'Damage direction', toggle( 'damageIndicators' ) ),
				row( 'Interaction hints', toggle( 'showInteractHints' ) ),
				row( 'Pick up ammo automatically', toggle( 'autoPickupAmmo' ) ),
				row( 'Realistic map & compass (need the items)', toggle( 'realisticMap' ) ),
				row( 'Tutorial tips', toggle( 'tutorial' ) ),
			);
		};
		build();
		const p = panel( 'Options', 'Saved automatically.', h( 'div', {}, tabs, h( 'div', { style: { paddingTop: '8px' } }, body ) ),
			[ this.btn( 'Reset to defaults', async () => { if ( await this.ui.confirm( 'Reset all options?', 'Key bindings are kept.', 'Reset' ) ) { S.resetAll(); build(); } } ), h( 'div', { style: { flex: 1 } } ), this.btn( 'Done', back, 'primary' ) ],
			{ width: 760, onClose: back } );
		p.querySelector( '.panel-body' ).style.paddingTop = '0';
		tabs.style.margin = '0 calc(-1 * var(--tw-5))';
		this.ui.show( h( 'div.screen' + ( this.ui.game ? '.clear' : '' ), {}, p ) );
	}

	_keybinds( rebuild ) {
		const S = this.app.settings, input = this.app.input;
		const wrap = h( 'div' );
		const binds = S.get( 'bindings' );
		const all = {};
		for ( const [ a, codes ] of Object.entries( binds ) ) for ( const c of codes ) ( all[ c ] = all[ c ] || [] ).push( a );
		// actions that legitimately share a key (on foot vs in a vehicle)
		const vehicle = new Set( [ 'horn', 'headlights', 'handbrake', 'vehicleUp', 'vehicleDown' ] );
		const groups = [
			[ 'Movement', [ 'forward', 'back', 'left', 'right', 'sprint', 'walk', 'crouch', 'prone', 'jump', 'leanLeft', 'leanRight', 'autorun', 'freelook' ] ],
			[ 'Actions', [ 'interact', 'fire', 'aim', 'reload', 'melee', 'fireMode', 'holster', 'throw', 'flashlight', 'zoom', 'quickHeal', 'gestures' ] ],
			[ 'Hotbar', [ 'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8', 'slot9' ] ],
			[ 'Menus', [ 'inventory', 'map', 'craft', 'log', 'chat', 'command', 'pause', 'hideHud', 'screenshot', 'debug' ] ],
			[ 'Vehicles', [ 'camera', 'horn', 'headlights', 'handbrake', 'vehicleUp', 'vehicleDown' ] ],
		];
		for ( const [ g, acts ] of groups ) {
			wrap.appendChild( h( 'div.opt-section', { text: g } ) );
			for ( const a of acts ) {
				if ( ! binds[ a ] ) continue;
				const cells = [ 0, 1 ].map( k => {
					const code = binds[ a ][ k ];
					const conflict = code && ( all[ code ] || [] ).filter( o => o !== a && vehicle.has( o ) === vehicle.has( a ) ).length > 0;
					const b = h( 'button.keybind' + ( conflict ? '.conflict' : '' ), { text: code ? prettyCode( code ) : '—', title: conflict ? 'Also bound to: ' + all[ code ].filter( o => o !== a ).map( o => BINDING_LABELS[ o ] ).join( ', ' ) : 'Click, then press a key. Esc cancels, Backspace clears.' } );
					b.onclick = () => {
						b.classList.add( 'listening' ); b.textContent = 'Press a key…';
						input.capture = ( c ) => {
							const nb = structuredClone( S.get( 'bindings' ) );
							if ( c === 'Escape' ) { rebuild(); return; }
							if ( c === 'Backspace' || c === 'Delete' ) nb[ a ].splice( k, 1 );
							else { nb[ a ][ k ] = c; nb[ a ] = nb[ a ].filter( Boolean ); }
							S.set( 'bindings', nb );
							this.app.audio.ui();
							rebuild();
						};
					};
					return b;
				} );
				wrap.appendChild( h( 'div.row', {}, h( 'label', { text: BINDING_LABELS[ a ] || a } ), h( 'div.ctl', {}, ...cells ) ) );
			}
		}
		wrap.appendChild( h( 'div', { style: { marginTop: '14px' } }, this.btn( 'Reset key bindings', () => { S.set( 'bindings', structuredClone( DEFAULT_BINDINGS ) ); rebuild(); } ) ) );
		return wrap;
	}

	// ---- in game --------------------------------------------------------------------------------------

	pause() {
		const g = this.ui.game;
		const col = h( 'div.title-col', { style: { marginBottom: 'clamp(40px, 12vh, 140px)' } },
			h( 'p.loader-kicker', { text: `Day ${g.day} · ${g.save.name}` } ),
			h( 'h1', { text: 'PAUSED', style: { fontSize: 'clamp(40px, 5vw, 72px)' } } ),
			this._menuBtn( 'Resume', 'Esc', () => this.ui.closeScreen() ),
			this._menuBtn( 'Options', '', () => this.options( () => this.pause() ) ),
			this._menuBtn( 'Controls', 'F1', () => this.controls( () => this.pause() ) ),
			this._menuBtn( g.mode === 'creative' ? 'Switch to survival' : 'Switch to creative', 'Game mode', () => { g.commands?.run( `/gamemode ${g.mode === 'creative' ? 'survival' : 'creative'}` ); this.pause(); } ),
			this._menuBtn( 'Save world', '', async () => { await g.saveNow( true ); this.ui.toastScreen( 'World saved' ); } ),
			this._menuBtn( 'Save & quit to title', '', async () => { await this.app.quit( true ); this.ui.exitGame(); } ),
		);
		if ( g.save.hardcore ) col.children[ 5 ].remove();
		this.ui.show( h( 'div.screen.title-screen', { style: { background: 'linear-gradient(90deg, rgba(3,7,11,0.85) 0%, rgba(3,7,11,0.45) 45%, rgba(3,7,11,0.15) 80%)' } }, col ), { paused: true } );
	}

	death( info ) {
		const g = this.ui.game;
		const days = Math.max( 0, info.days );
		const d = h( 'div.screen.death', {},
			h( 'p.loader-kicker', { text: 'You died', style: { color: 'var(--tw-coral)' } } ),
			h( 'h1', { text: 'DEAD' } ),
			h( 'div.dim', { text: `Cause of death: ${info.cause}` } ),
			h( 'div.stats', {},
				h( 'div', {}, h( 'b', { text: days < 1 ? Math.round( days * 24 ) + ' h' : days.toFixed( 1 ) + ' d' } ), h( 'span', { text: 'Survived' } ) ),
				h( 'div', {}, h( 'b', { text: g.stats.lifeKills || 0 } ), h( 'span', { text: 'Infected killed' } ) ),
				h( 'div', {}, h( 'b', { text: ( ( g.player.distance || 0 ) / 1000 ).toFixed( 1 ) + ' km' } ), h( 'span', { text: 'Travelled' } ) ),
				h( 'div', {}, h( 'b', { text: g.stats.lives || 1 } ), h( 'span', { text: 'Lives' } ) ) ),
			g.save.hardcore
				? h( 'div', { style: { display: 'flex', gap: '10px' } }, this.btn( 'Back to title', async () => { await this.app.quit( false ); this.ui.exitGame(); }, 'primary' ) )
				: h( 'div', { style: { display: 'flex', gap: '10px' } }, this.btn( 'Respawn on a beach', () => { g.respawn(); this.ui.closeScreen(); this.app.input.lock(); }, 'primary' ), this.btn( 'Quit to title', async () => { await this.app.quit( true ); this.ui.exitGame(); } ) ),
			h( 'div.dim', { style: { fontSize: '12px', marginTop: '6px' }, text: g.save.hardcore ? 'Hardcore: this world is over.' : 'Your body — and everything you carried — stays where you fell. It is marked on your map.' } ),
		);
		this.ui.show( d, { sticky: true } );
	}

	controls( back ) {
		const input = this.app.input;
		const k = a => h( 'kbd', { text: input.label( a ) } );
		const items = [
			[ 'Move', h( 'span', {}, k( 'forward' ), k( 'left' ), k( 'back' ), k( 'right' ) ) ], [ 'Sprint', k( 'sprint' ) ], [ 'Walk (hold)', k( 'walk' ) ], [ 'Crouch / prone', h( 'span', {}, k( 'crouch' ), ' ', k( 'prone' ) ) ],
			[ 'Jump / vault / swim up', k( 'jump' ) ], [ 'Lean', h( 'span', {}, k( 'leanLeft' ), k( 'leanRight' ) ) ], [ 'Free look (hold)', k( 'freelook' ) ], [ 'Auto-run', k( 'autorun' ) ],
			[ 'Interact / pick up / open / drive', k( 'interact' ) ], [ 'Fire / attack', k( 'fire' ) ], [ 'Aim down sights', k( 'aim' ) ], [ 'Reload', k( 'reload' ) ], [ 'Quick melee / shove', k( 'melee' ) ],
			[ 'Fire mode', k( 'fireMode' ) ], [ 'Holster', k( 'holster' ) ], [ 'Throw', k( 'throw' ) ], [ 'Flashlight', k( 'flashlight' ) ], [ 'Hold breath (scopes)', k( 'zoom' ) ],
			[ 'Hotbar', h( 'span', {}, k( 'slot1' ), '…', k( 'slot9' ) ) ], [ 'Quick bandage', k( 'quickHeal' ) ], [ 'Inventory', k( 'inventory' ) ], [ 'Map', k( 'map' ) ], [ 'Crafting', k( 'craft' ) ],
			[ 'Survival journal', k( 'log' ) ], [ 'Chat', k( 'chat' ) ], [ 'Command', k( 'command' ) ], [ 'Pause', k( 'pause' ) ], [ 'Hide HUD', k( 'hideHud' ) ], [ 'Screenshot', k( 'screenshot' ) ],
			[ 'Debug info', k( 'debug' ) ], [ 'Vehicle camera', k( 'camera' ) ], [ 'Horn / headlights', h( 'span', {}, k( 'horn' ), ' ', k( 'headlights' ) ) ], [ 'Creative: fly', h( 'span', {}, k( 'jump' ), ' ×2' ) ],
		];
		const grid = h( 'div.help-grid', {}, ...items.map( ( [ l, kk ] ) => h( 'div', {}, h( 'span', { text: l } ), kk ) ) );
		const tips = h( 'div.journal', { style: { marginTop: '16px' }, html: `
			<p><b>Looting.</b> Look at anything lying around and press the interact key to take it. Cupboards, fridges, lockers, desks, car trunks and bodies can be searched. In the inventory, drag items between your clothes, your backpack and what is near you; right-click for actions; Shift-click moves; 1-9 over an item binds it to the hotbar.</p>
			<p><b>Staying alive.</b> Watch the icons bottom-left: health, blood, food, water, temperature and energy. Bleeding drains blood fast — bandage it. Bites can infect the wound: antibiotics cure it. Broken legs need a splint. The mountains are cold, the lowlands hot, and rain soaks you.</p>
			<p><b>The infected</b> follow noise and movement. Gunshots carry far; crouch to stay quiet; a headshot drops anything. They can break down doors.</p>
			<p><b>Commands.</b> Press ${input.label( 'chat' )} and type <code>/help</code>: <code>/give</code>, <code>/tp</code>, <code>/time</code>, <code>/weather</code>, <code>/locate</code>, <code>/summon</code>, <code>/gamemode</code> … Tab completes.</p>` } );
		this.ui.show( h( 'div.screen' + ( this.ui.game ? '.clear' : '' ), {}, panel( 'Controls', 'Rebind keys in Options → Key bindings.', h( 'div', {}, grid, tips ), [ this.btn( 'Key bindings…', () => { this._optTab = 'keys'; this.options( () => this.controls( back ) ); } ), h( 'div', { style: { flex: 1 } } ), this.btn( 'Back', back, 'primary' ) ], { width: 900, onClose: back } ) ) );
	}
}
