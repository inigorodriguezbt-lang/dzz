// The inventory screen, DayZ style (docs/UI_DAYZ.md; behaviour from docs/UI_SPEC.md 6): VICINITY on the left (the
// open container and the ground; Craft; Catalog in creative), your character in the middle with the gear slots
// around it, INVENTORY on the right (HANDS, then each worn container), the quickbar under it all.
// Containers are drawn as grids of square cells: each stack fills a rectangle sized from its volume and shape
// (footprint), auto-packed in order; the volume rules of Inventory.js still decide what fits, and a grid grows a row
// rather than refuse what they allow. Every drop target is checked when a drag starts (_accepts: a dry run of the
// rules move() applies), so the screen shows where a stack can go, and why not, before anything is dropped.
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { seg, slider, popMenu, placePop } from './widgets.js';
import { setIcon } from './itemIcons.js';
import { CharacterPreview } from './CharacterPreview.js';
import { ITEMS, getItem, displayName, condLabel, freshness, ammoOf, stackWeight, stackVolume, canMerge, CATEGORY_LABEL, makeStack } from '../game/items/ItemDB.js';
import { addToItems, containerVolume, containerWeight, itemsOf, capacityOf } from '../game/Inventory.js';
import { fmtHour, liquidName } from '../game/items/util.js';
import { buildItemModel, modelInfo } from '../render/ItemModels.js';
import * as ops from '../weapons/ops.js';
import { lookKey } from '../game/items/ext/gear/logic.js';
import { kcalMul } from '../game/items/ext/kitchen/evolved.js';
import { SKILL_NAMES } from '../game/Skills.js';

const GROUND_R = 2.6;
const WEIGHT_MAX = 45, WEIGHT_TIRED = 18, WEIGHT_OVER = 30; // kg: the meter's scale, where stamina starts to drop, overloaded
const GCOLS = 6; // cells across every container grid
// the gear slots either side of the body (DayZ: headgear, mask, eyewear, gloves, armband | body, vest, back, legs, feet)
const LEFT_SLOTS = [ 'head', 'face', 'eyes', 'hands', 'belt' ];
const RIGHT_SLOTS = [ 'torso', 'vest', 'back', 'legs', 'feet' ];
// tooltip names for slots (the game's SLOT_LABEL says Shoulder / Holster)
const SLOT_NAME = { head: 'Head', eyes: 'Eyewear', face: 'Face', torso: 'Top', vest: 'Vest', back: 'Back', hands: 'Gloves', legs: 'Pants', feet: 'Shoes',
	belt: 'Belt', primary: 'Primary', secondary: 'Secondary', sidearm: 'Sidearm', melee: 'Melee' };
const SLOT_GLYPH = { hands: 'gloves', secondary: 'primary' };
const ATT_NAME = { optic: 'Optic', muzzle: 'Muzzle', light: 'Light', mag: 'Magazine' };
// glyphs for the held gun's fittings (24 grid, like icons.js)
const ATT_GLYPH = {
	optic: 'M4 10h16v5H4zM8 10V7h8v3M2 12.5h2M20 12.5h2',
	muzzle: 'M3 9.5h12v5H3zM15 8h6v8h-6z',
	light: 'M4 9h9v6H4zM13 8l6-2v12l-6-2z',
	mag: 'M8 3.5h6.5l.5 6c.3 3.4 1.5 6.6 3.4 9.5h-6C10 16.3 8.4 12.8 8.1 9.4L8 3.5Z',
};
const COND_ICON = { blood: 'blood', tired: 'energy' };
const TOOL_WORD = { cut: 'Blade', chop: 'Axe', saw: 'Saw', hammer: 'Hammer', pot: 'Pot', toolbox: 'Toolbox', canopener: 'Opener' };
const CRAFT_CATS = [ 'medical', 'survival', 'food', 'tools', 'weapons' ];
const CAT_ORDER = [ 'firearm', 'magazine', 'ammo', 'attachment', 'melee', 'throwable', 'medical', 'food', 'drink', 'tool', 'fuel', 'clothing', 'backpack', 'material', 'misc' ];
const BAR_CATS = new Set( [ 'firearm', 'melee', 'clothing', 'backpack', 'tool', 'attachment' ] );
const CARRIED = new Set( [ 'equip', 'weapon', 'container' ] ); // locations that are "own items"
const NO = { ok: false };
const OK = { ok: true };
const MINUS = '−';
const NS = 'http://www.w3.org/2000/svg';

const cap1 = s => s ? s[ 0 ].toUpperCase() + s.slice( 1 ) : '';
// item actions carry state in brackets ('Eat (3/3)', 'Eat (rotten)'): the verb stays the label, the state moves to
// the menu's right column
const splitLabel = l => { const m = /^(.+?)\s*\(([^()]+)\)((?:\s*\([^()]+\))*)$/.exec( l ); return m ? [ m[ 1 ], [ m[ 2 ], ...( m[ 3 ].match( /[^()\s][^()]*/g ) || [] ) ].map( t => cap1( t.trim() ) ).join( ' · ' ) ] : [ l, null ]; };
const fmtVol = v => String( Math.round( v * 10 ) / 10 );
const pct = x => Math.round( x * 100 ) + '%';
const signed = ( n, dp = 0 ) => { const r = + n.toFixed( dp ); return ( r > 0 ? '+' : r < 0 ? MINUS : '' ) + Math.abs( r ); };
const slotOf = d => d.clothing?.slot || d.backpack?.slot || ( d.cat === 'backpack' ? 'back' : null );
const tipStack = id => ( { uid: 'tip:' + id, id, qty: 1, cond: 1, data: {} } );
// the condition tint class (condLabel's thresholds): none when pristine
const condCls = c => c > 0.85 ? '' : c > 0.6 ? 'c-worn' : c > 0.35 ? 'c-damaged' : c > 0.1 ? 'c-badly' : 'c-ruined';
const hasCond = ( s, d ) => BAR_CATS.has( d?.cat ) || ( s.cond ?? 1 ) < 0.999;
// a lit flare, torch or stove is hot
const hotOf = ( s, d ) => !! s.data?.on && /flare|torch|stove|lantern|candle|lighter|fire/.test( d?.tool?.kind || d?.id || '' );

function svgGlyph( d ) {
	const svg = document.createElementNS( NS, 'svg' );
	svg.setAttribute( 'viewBox', '0 0 24 24' );
	svg.setAttribute( 'class', 'i i24' );
	const p = document.createElementNS( NS, 'path' );
	p.setAttribute( 'd', d );
	svg.appendChild( p );
	return svg;
}

// a garment's stats plus what was sewn or strapped on it (stack.data.mods, the gear domain)
function withMods( c, s ) {
	const m = s?.data?.mods;
	if ( ! c || ! m ) return c;
	return { ...c, capacity: ( c.capacity || 0 ) + ( m.cap || 0 ), insulation: ( c.insulation || 0 ) + ( m.ins || 0 ), waterproof: Math.min( 1, ( c.waterproof || 0 ) + ( m.wp || 0 ) ),
		armor: { bite: ( c.armor?.bite || 0 ) + ( m.bite || 0 ), bullet: ( c.armor?.bullet || 0 ) + ( m.bullet || 0 ) } };
}

// the one bar a cell shows: fill (liquid, fuel, charge) or condition / freshness, 0..1; null for none
function barOf( s, d ) {
	if ( ! d ) return null;
	if ( d.tool?.liquid ) return { v: ( s.data.amount || 0 ) / d.tool.liquid, fill: s.data.liquid === 'fuel' ? 'fuel' : 'liquid' };
	if ( d.tool?.battery ) return { v: ( s.data.charge || 0 ) / d.tool.battery, fill: 'charge' };
	if ( d.fuel ) return { v: ( s.data.amount ?? d.fuel.litres ) / d.fuel.litres, fill: 'fuel' };
	if ( d.food?.spoil ) { const f = freshness( s ); return f < 0.999 ? { v: f } : null; }
	if ( BAR_CATS.has( d.cat ) ) return s.cond < 0.999 ? { v: s.cond } : null;
	return null;
}

function meterEl( b ) {
	const v = Math.max( 0, Math.min( 1, b.v || 0 ) );
	// a fill bar is blue (fuel yellow); a condition bar turns yellow, then red
	const cls = b.fill ? '.fill' + ( b.fill === 'fuel' ? '.fuel' : '' ) : v < 0.25 ? '.alarm' : v < 0.5 ? '.warn' : '';
	return h( 'div.meter' + cls, {}, h( 'i', { style: { width: ( v * 100 ).toFixed( 1 ) + '%' } } ) );
}

// rounds for guns and magazines, else the stack size above 1
function qtyOf( s ) {
	const a = ammoOf( s );
	if ( a !== null ) return String( a );
	return s.qty > 1 ? String( s.qty ) : '';
}

function weaponFits( d, slot ) {
	if ( slot === 'melee' ) return d.cat === 'melee';
	if ( slot === 'sidearm' ) return d.cat === 'firearm' && d.firearm.slot === 'sidearm';
	return d.cat === 'firearm';
}

// two hover targets that show the same tooltip (a re-render replaces the element, not what it shows)
function sameTarget( a, b ) {
	if ( a._it || b._it ) return !! ( a._it && b._it && a._it.stack === b._it.stack );
	if ( a._tipStack || b._tipStack ) return a._tipStack?.id === b._tipStack?.id;
	return a._slot === b._slot;
}

// ---- footprints and packing (docs/UI_DAYZ.md "How we map it") -------------------------------------------------------

// long (rifles, spears, bats: long axis +x in ItemModels' convention), very thin (a rod, a spear) or tall (bottles,
// packs): from the model's bounds once its builder exists, by kind until then
const shapes = new Map();
function shapeOf( d ) {
	let s = shapes.get( d.id );
	if ( s ) return s;
	let rx = 1, ty = 1, known = false;
	try {
		if ( ! buildItemModel( d ).userData.fallback ) {
			const z = modelInfo( d ).size;
			rx = z.x / Math.max( z.y, z.z, 1e-4 );
			ty = z.y / Math.max( z.x, z.z, 1e-4 );
			known = true;
		}
	} catch ( e ) { /* no model: by kind */ }
	if ( ! known ) {
		const f = d.firearm, m = d.melee;
		if ( f ) rx = [ 'rifle', 'sniper', 'shotgun', 'lmg', 'launcher' ].includes( f.cls ) ? 5 : f.cls === 'smg' ? 2.4 : 1.4;
		else if ( m ) rx = m.kind === 'spear' ? 12 : m.kind === 'fist' ? 1 : 4;
	}
	// (magazines stand in their cells, as they do in DayZ)
	s = { long: rx > 2.2 && ! d.magazine, thin: rx > 8, tall: ty > 1.3 || !! d.magazine };
	if ( known ) shapes.set( d.id, s );
	return s;
}

// cells w x h for a volume A: long things are one or two cells tall and as long as they need; the rest are as square
// as their shape allows without wasting much (a can 1x1, a pistol 2x2, a jacket 3x2, a backpack 3x4)
function shapeFoot( sh, A ) {
	if ( sh.long ) {
		const h = sh.thin && A <= 12 ? 1 : A <= 6 ? 1 : A <= 18 ? 2 : 3;
		return { w: Math.min( GCOLS, Math.max( A > 1 ? 2 * h : 1, Math.ceil( A / h ) ) ), h };
	}
	const ta = sh.tall ? 0.6 : 1;
	let best = null, bc = Infinity;
	for ( let h = 1; h <= GCOLS; h ++ ) for ( let w = 1; w <= GCOLS; w ++ ) {
		const a = w * h;
		if ( a < A || a > Math.max( A + 1, A * 1.5 ) ) continue;
		const c = ( a - A ) / A * 4 + Math.abs( Math.log( w / h / ta ) ) * 2 + ( h > w ? 0.01 : 0 );
		if ( c < bc ) { bc = c; best = { w, h }; }
	}
	return best || { w: Math.min( GCOLS, A ), h: Math.ceil( A / GCOLS ) };
}

const feet = new Map();
export function footprint( stack, cols = GCOLS ) {
	const d = getItem( stack.id );
	const A = Math.max( 1, Math.min( 36, Math.round( stackVolume( stack ) ) ) );
	const k = stack.id + ':' + A;
	let fp = feet.get( k );
	if ( ! fp ) {
		fp = d ? shapeFoot( shapeOf( d ), A ) : { w: 1, h: 1 };
		if ( ! d || shapes.has( d.id ) ) feet.set( k, fp );
	}
	if ( fp.w > cols ) return { w: cols, h: Math.max( fp.h, Math.ceil( fp.w * fp.h / cols ) ) };
	return fp;
}

// cols across; base rows from the capacity (the last one cut short to it); first-fit in order, row by row; rows are
// added when the volume rules let in more than the cells hold. open: the ground or a bottomless container (rows as
// needed, at least `min`, plus a free row to drop into)
export function packGrid( stacks, cap, open = false, min = 2 ) {
	const cols = open ? GCOLS : Math.max( 1, Math.min( GCOLS, Math.ceil( cap ) ) );
	const base = open ? 0 : Math.ceil( cap / cols );
	const cut = open ? 0 : base * cols - Math.ceil( cap ); // cells missing from the last base row
	const occ = [];
	const row = () => { occ.push( new Uint8Array( cols ) ); };
	while ( occ.length < base ) row();
	for ( let x = cols - cut; x < cols; x ++ ) occ[ base - 1 ][ x ] = 2;
	const free = ( x, y, w, hh ) => {
		for ( let j = y; j < y + hh; j ++ ) for ( let i = x; i < x + w; i ++ ) if ( occ[ j ][ i ] ) return false;
		return true;
	};
	const out = [];
	let used = 0;
	for ( const s of stacks ) {
		const fp = footprint( s, cols );
		let at = null;
		for ( let y = 0; ! at; y ++ ) {
			while ( occ.length < y + fp.h ) row();
			for ( let x = 0; x + fp.w <= cols; x ++ ) if ( free( x, y, fp.w, fp.h ) ) { at = { x, y }; break; }
		}
		for ( let j = at.y; j < at.y + fp.h; j ++ ) for ( let i = at.x; i < at.x + fp.w; i ++ ) occ[ j ][ i ] = 1;
		out.push( { s, x: at.x, y: at.y, w: fp.w, h: fp.h } );
		used = Math.max( used, at.y + fp.h );
	}
	const rows = open ? Math.max( min, used + 1 ) : Math.max( base, used );
	return { cols, rows, base, cut, items: out };
}

export class InventoryUI {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this.leftTab = 'near';
		this.other = null; // the open world container (modules read ui.inventory.other)
		this.catFilter = 'all';
		this.search = ''; // catalog search
		this.query = ''; // top-bar filter: cells that don't match are dimmed
		this.craftFilter = 'all';
		this.collapsed = new Set(); // collapsed section keys, for the session
		this.el = null;
		this.preview = new CharacterPreview( this.app );
	}

	get game() { return this.ui.game; }
	get inv() { return this.game.player.inventory; }
	get audio() { return this.app.audio; }

	// other modules: something changed that the screen shows
	refresh() { this.dirty = true; }

	open( other = null ) {
		// a module opening a container while the screen is up: finish the old session first
		if ( this.el && this.ui.screen === this.el ) this.ui.hideAll();
		this.other = other;
		if ( other ) this.leftTab = 'near';
		this.query = '';
		this.catEl = null;
		this.ground = null;
		this.hoverEl = null;
		this.px = this.py = null;
		this.leaving = null;
		this.tip = h( 'div.pop.tip', { hidden: true, role: 'tooltip' } );
		// three columns: a header bar each, then a body (the outer two scroll on their own)
		this.leftHead = h( 'div.inv-head.tabs' );
		this.left = h( 'div.inv-scroll' );
		this.right = h( 'div.inv-scroll' );
		this.charEl = h( 'div.inv-char', {}, h( 'div.sil' ) );
		// dropping gear on the character wears or equips it
		this.charEl._dt = { type: 'body' };
		this.slotsL = h( 'div.slots.l' );
		this.slotsR = h( 'div.slots.r' );
		this.slotsW = h( 'div.slots.w' );
		this.condsEl = h( 'div.inv-conds' );
		this.statsEl = h( 'div.stats' );
		this.mid = h( 'div.inv-mid', {}, h( 'div.inv-figure', {}, this.slotsL, this.charEl, this.slotsR ), this.slotsW, this.condsEl, this.statsEl );
		this.panel = h( 'div.inv-panel', {},
			h( 'section.inv-col.left', {}, this.leftHead, this.left ),
			h( 'section.inv-col.mid', {}, this._midHead(), this.mid ),
			h( 'section.inv-col.right', {}, this._rightHead(), this.right ) );
		this.strip = h( 'div.inv-hotbar' );
		this.wrap = h( 'div.inv-wrap', {}, this.panel, this.strip );
		const el = this.el = h( 'div.screen.inv', {}, this.wrap, this.tip );
		el.addEventListener( 'contextmenu', e => { e.preventDefault(); const c = this._cellAt( e.target ); if ( c ) this._menu( e, c ); } );
		el.addEventListener( 'pointerover', e => this._over( e ) );
		el.addEventListener( 'pointermove', e => { this.px = e.clientX; this.py = e.clientY; } );
		el.addEventListener( 'pointerdown', e => this._down( e ) );
		el.addEventListener( 'dblclick', e => this._dbl( e ) );
		this.keyH = e => this._key( e );
		// runs before any popover's own outside-click handler, so a click that only dismisses a menu doesn't also
		// count as a click on the scrim
		this.popH = e => {
			this.popWasOpen = !! ( this.ctxClose || this.splitEl );
			if ( this.splitEl && ! this.splitEl.contains( e.target ) ) this._closeSplit();
		};
		window.addEventListener( 'keydown', this.keyH, true );
		window.addEventListener( 'pointerdown', this.popH, true );
		this.ui.show( el, { inventory: true, onClose: () => this._onClose() } );
		this.audio.play( 'zipper', { bus: 'ui', vol: 0.5 } );
		this.version = - 1;
		this.render();
		this.preview.attach( this.charEl, this.game );
		this.preview.sync( this.inv );
		// like DayZ: the first-person arms and gun go away while you look through your gear (the preview shows them)
		const vs = this.game?.viewScene;
		if ( vs ) { this.vmWas = vs.visible; vs.visible = false; }
	}

	_onClose() {
		window.removeEventListener( 'keydown', this.keyH, true );
		window.removeEventListener( 'pointerdown', this.popH, true );
		this._endDrag();
		this.ctxClose?.();
		this._closeSplit();
		this._hideTip();
		this.preview.detach();
		const vs = this.game?.viewScene;
		if ( vs && this.vmWas !== undefined ) { vs.visible = this.vmWas; this.vmWas = undefined; }
		if ( this.other ) this.game?.events.emit( 'container:close', { container: this.other } );
		this.other = null;
		this.leaving = null;
		this.catEl = null;
		this.hoverEl = null;
		document.querySelectorAll( '.drag-ghost' ).forEach( e => e.remove() );
	}

	// ---- per frame ------------------------------------------------------------------------------------------

	update( dt = 0 ) {
		if ( ! this.el?.isConnected ) return;
		const g = this.game;
		this.preview.update( dt );
		// walked away from the container: its section fades out, then it closes (no toast)
		const o = this.other;
		if ( o?.pos && this.leaving !== o && g.player.pos.distanceTo( o.pos ) > 4 ) {
			this.leaving = o;
			this.otherSec?.classList.add( 'gone' );
			setTimeout( () => {
				if ( this.leaving !== o ) return;
				this.leaving = null;
				if ( this.other !== o || ! this.el?.isConnected ) return;
				this.other = null;
				g.events.emit( 'container:close', { container: o } );
				this.dirty = true;
			}, 170 );
		}
		if ( this.drag?.active ) return; // re-rendering mid-drag would drop the highlights and the source
		const near = this._groundNow();
		// a game-mode switch (the chat's /gamemode) adds or removes the Catalog tab and the Delete rows
		if ( this.inv.version !== this.version || near.key !== this.nearKey || this.dirty || g.mode !== this.mode ) { this.ground = near.list; this.nearKey = near.key; this.render(); }
		this._comboProgress();
		// vitals, conditions and the clock change without an inventory change
		this.liveT = ( this.liveT || 0 ) + dt;
		if ( this.liveT > 0.5 ) { this.liveT = 0; this._live(); }
	}

	_groundNow() {
		const g = this.game;
		const list = ( g.items3d?.near?.( g.player.pos, GROUND_R ) || [] ).filter( wi => wi.stack );
		return { list, key: list.map( w => ( w.stack.uid ?? w.id ) + ':' + w.stack.qty ).join( ',' ) };
	}

	// ---- rendering ----------------------------------------------------------------------------------------------

	render() {
		if ( ! this.el ) return;
		this.dirty = false;
		this.version = this.inv.version;
		this.mode = this.game.mode;
		if ( ! this.ground ) { const n = this._groundNow(); this.ground = n.list; this.nearKey = n.key; }
		// keep each column's scroll position (and keyboard focus on a section header) across the rebuild
		const sl = this.resetLeft ? 0 : this.left.scrollTop, sr = this.right.scrollTop;
		this.resetLeft = false;
		// (keyboard focus only: a focus ring that reappears after a mouse click is noise)
		const act = document.activeElement?.matches?.( ':focus-visible' ) ? document.activeElement : null;
		const focusKey = act?.classList.contains( 'sect-h' ) ? act.dataset.k : null;
		const tabFocus = !! act?.closest( '.inv-head.tabs' );
		this._renderTop();
		this._renderLeft();
		this._renderMid();
		this._renderRight();
		this._renderStrip();
		this.left.scrollTop = sl; this.right.scrollTop = sr;
		if ( focusKey ) this.el.querySelector( `.sect-h[data-k="${focusKey}"]` )?.focus();
		if ( tabFocus ) this.leftHead.querySelector( '.on' )?.focus();
		this._applyQuery();
		this._rehover();
		if ( this.preview.attached ) this.preview.sync( this.inv );
	}

	// centre header: Day 3 · 14:20, search, close
	_midHead() {
		this.when = h( 'span.when' );
		this.searchBtn = h( 'button.btn.icon.sm', { type: 'button', title: 'Search', onclick: () => this._openSearch() }, icon( 'search' ) );
		this.searchIn = h( 'input.input', { type: 'text', placeholder: 'Search', spellcheck: false, autocomplete: 'off', 'aria-label': 'Search' } );
		this.searchIn.addEventListener( 'input', () => { this.query = this.searchIn.value.trim().toLowerCase(); this._applyQuery(); } );
		this.searchIn.addEventListener( 'blur', () => { if ( ! this.searchIn.value ) this._closeSearch(); } );
		this.searchBox = h( 'div.search', { hidden: true }, icon( 'search' ), this.searchIn );
		return h( 'div.inv-head', {}, this.when, this.searchBtn, this.searchBox,
			h( 'button.btn.icon.sm', { type: 'button', title: 'Close', onclick: () => this.ui.closeScreen() }, icon( 'close' ) ) );
	}

	// right header: INVENTORY, the weight meter and kg, sort
	_rightHead() {
		this.wFill = h( 'i' );
		this.wMeter = h( 'div.wmeter', { role: 'meter', 'aria-label': 'Weight', 'aria-valuemin': 0, 'aria-valuemax': WEIGHT_MAX },
			this.wFill, h( 'b', { style: { left: ( WEIGHT_TIRED / WEIGHT_MAX * 100 ).toFixed( 2 ) + '%' } } ), h( 'b', { style: { left: ( WEIGHT_OVER / WEIGHT_MAX * 100 ).toFixed( 2 ) + '%' } } ) );
		this.wVal = h( 'span.wval' );
		return h( 'div.inv-head', {}, h( 'span.ttl', { text: 'Inventory' } ), this.wMeter, this.wVal,
			h( 'button.btn.icon.sm', { type: 'button', title: 'Sort', onclick: () => this._sort() }, icon( 'sort' ) ) );
	}

	_openSearch() {
		this.searchBtn.hidden = true;
		this.searchBox.hidden = false;
		this.searchIn.focus();
		this.searchIn.select();
	}

	_closeSearch() {
		this.searchIn.value = '';
		this.query = '';
		this.searchBox.hidden = true;
		this.searchBtn.hidden = false;
		this._applyQuery();
	}

	_renderTop() {
		const w = this.inv.totalWeight();
		const cls = w > WEIGHT_OVER ? 'alarm' : w > WEIGHT_TIRED ? 'warn' : '';
		this.wFill.style.width = Math.min( 100, w / WEIGHT_MAX * 100 ).toFixed( 1 ) + '%';
		this.wMeter.className = 'wmeter' + ( cls ? ' ' + cls : '' );
		this.wMeter.setAttribute( 'aria-valuenow', w.toFixed( 1 ) );
		this.wVal.className = 'wval' + ( cls ? ' ' + cls : '' );
		this.wVal.textContent = w.toFixed( 1 ) + ' kg';
		this.when.textContent = this._when();
	}

	// Day 3 · 14:20; the time follows the watch rule of the minimap (realistic maps need a watch)
	_when() {
		const g = this.game;
		const clock = ! this.app.settings.get( 'realisticMap' ) || g.mode === 'creative' || this.inv.find( ( s, d ) => d?.tool?.kind === 'watch' || d?.tool?.provides?.includes?.( 'watch' ) );
		return clock ? `Day ${g.day} · ${fmtHour( g.hour )}` : `Day ${g.day}`;
	}

	_renderLeft() {
		const g = this.game, col = this.left;
		clear( col );
		const tabs = [ [ 'near', 'Vicinity' ] ];
		if ( g.crafting ) tabs.push( [ 'craft', 'Craft' ] );
		if ( g.mode === 'creative' ) tabs.push( [ 'catalog', 'Catalog' ] );
		if ( ! tabs.some( t => t[ 0 ] === this.leftTab ) ) this.leftTab = 'near';
		const tabEl = seg( tabs, this.leftTab, v => { this.leftTab = v; this.catEl = null; this.resetLeft = true; this.render(); }, { fill: true, audio: this.audio } );
		clear( this.leftHead ).appendChild( tabEl );
		if ( this.leftTab === 'craft' ) col.appendChild( this._craft() );
		else if ( this.leftTab === 'catalog' ) col.appendChild( this._catalog() );
		else this._near( col );
	}

	_near( col ) {
		const ground = this.ground || [], o = this.other;
		// Take all sits on the first section, only when there is anything to take
		let takeAll = ground.length || o?.items?.length ? h( 'button.btn.sm', { type: 'button', text: 'Take all', onclick: () => { this._takeAll( ground ); this.dirty = true; } } ) : null;
		this.otherSec = null;
		if ( o ) {
			this.otherSec = this._section( { key: 'other', name: o.label || 'Container', items: o.items || [], capacity: o.capacity, loc: { type: 'other', container: o, items: o.items || [] }, btn: takeAll } );
			if ( this.leaving === o ) this.otherSec.classList.add( 'gone' );
			col.appendChild( this.otherSec );
			takeAll = null;
		}
		col.appendChild( this._section( { key: 'ground', name: 'Ground', ground, loc: { type: 'ground' }, btn: takeAll } ) );
	}

	_renderRight() {
		const col = this.right, inv = this.inv;
		clear( col );
		col.appendChild( this._hands() );
		for ( const c of inv.containers() ) {
			let lead;
			if ( c.owner ) { lead = h( 'img', { alt: '', draggable: false } ); setIcon( lead, lookKey( c.owner ) ); } else lead = icon( 'torso' );
			col.appendChild( this._section( { key: c.owner?.uid || 'pockets', name: c.label, lead, items: c.items, capacity: c.capacity, loc: { type: 'container', container: c, items: c.items } } ) );
		}
	}

	// one container block: a header bar (collapse chevron, icon, NAME, used/cap, button) over its grid. The whole block
	// is the drop target, so a collapsed container still takes drops.
	_section( { key, name, lead = null, items = null, capacity = 0, ground = null, loc, btn = null } ) {
		const open = ! this.collapsed.has( key );
		const bottomless = ! ground && ! ( capacity > 0 && capacity < 999 );
		let capEl = null;
		if ( items && ! bottomless ) {
			const used = containerVolume( items ), f = used / capacity;
			// full is routine (the grid already shows it): brighter, not red; red is kept for over capacity
			capEl = h( 'span.cap' + ( f > 1.001 ? '.over' : f >= 0.999 ? '.full' : '' ), { text: `${fmtVol( used )}/${fmtVol( capacity )}` } );
		} else {
			// the ground and bottomless containers (a body) just count their stacks
			const n = ground ? ground.length : items.length;
			if ( n ) capEl = h( 'span.cap', { text: String( n ) } );
		}
		const head = h( 'div.sect-h', { tabIndex: 0, role: 'button', 'aria-expanded': String( open ), 'data-k': key },
			h( 'span.chev', {}, icon( 'chevron', 12 ) ), lead, h( 'span.nm', { text: name } ), capEl, btn );
		const toggle = () => { if ( ! this.collapsed.delete( key ) ) this.collapsed.add( key ); this.audio.ui?.(); this.render(); };
		head.addEventListener( 'click', e => { if ( ! e.target.closest( 'button' ) ) toggle(); } );
		head.addEventListener( 'mousedown', e => { if ( ! e.target.closest( 'button' ) ) e.preventDefault(); } ); // a click shouldn't leave focus behind
		head.addEventListener( 'keydown', e => { if ( e.target === head && ( e.code === 'Enter' || e.code === 'Space' ) ) { e.preventDefault(); e.stopPropagation(); toggle(); } } );
		const el = h( 'div.sect' + ( open ? '.open' : '' ), {}, head );
		const stacks = ground ? ground.map( wi => wi.stack ) : items;
		el._pack = { stacks, cap: capacity, open: !! ground || bottomless };
		if ( open ) {
			const locOf = ground ? ( s, i ) => ( { type: 'ground', worldItem: ground[ i ] } ) : () => loc;
			el._grid = this._grid( stacks, el._pack, locOf );
			el.appendChild( el._grid );
		}
		el._dt = loc;
		el._head = head;
		return el;
	}

	// a container's cells: the empty squares (cut short at its capacity), the stacks over them as rectangles
	_grid( stacks, pk, locOf ) {
		const P = packGrid( stacks, pk.cap, pk.open );
		const g = h( 'div.cgrid' );
		g.style.setProperty( '--cols', P.cols );
		g.style.setProperty( '--rows', P.rows );
		const n = P.rows * P.cols;
		const cutFrom = P.base * P.cols - P.cut, cutTo = P.base * P.cols;
		for ( let i = 0; i < n; i ++ ) g.appendChild( h( i >= cutFrom && i < cutTo ? 'i.gc.x' : i >= P.base * P.cols && ! pk.open ? 'i.gc.more' : 'i.gc' ) );
		const index = new Map( stacks.map( ( s, i ) => [ s, i ] ) );
		for ( const p of P.items ) {
			const c = this._cell( p.s, locOf( p.s, index.get( p.s ) ), { fp: { w: p.w, h: p.h } } );
			c.style.setProperty( '--x', p.x ); c.style.setProperty( '--y', p.y );
			g.appendChild( c );
		}
		return g;
	}

	// HANDS: the held stack (from wherever it really lives) with its fittings in a row under it; a drop target
	_hands() {
		const inv = this.inv, held = inv.heldStack();
		const at = held ? this._locOf( held.uid ) : null;
		const d = held ? getItem( held.id ) : null;
		const head = h( 'div.sect-h.static', {}, h( 'span.nm', { text: 'Hands' } ), held ? h( 'span.cap.ellip', { text: displayName( held ) } ) : null );
		const body = h( 'div.hands-body' );
		if ( held ) {
			const fp = footprint( held );
			const g = h( 'div.cgrid.solo' );
			g.style.setProperty( '--cols', fp.w ); g.style.setProperty( '--rows', fp.h );
			const c = this._cell( held, at?.loc || { type: 'held' }, { fp, dot: false } );
			c.style.setProperty( '--x', 0 ); c.style.setProperty( '--y', 0 );
			c._hands = true;
			g.appendChild( c );
			body.appendChild( g );
			if ( d?.firearm ) body.appendChild( this._fittings( held, d ) );
		} else body.appendChild( h( 'div.hands-empty', {}, icon( 'hands', 24 ) ) );
		const el = h( 'div.sect.hands-sect.open', {}, head, body );
		el._dt = { type: 'hands' };
		el._head = head;
		el._slot = held ? null : 'Hands';
		return el;
	}

	// the held gun's fittings: the magazine well and each rail, filled or as a faint glyph; each one a drop target
	_fittings( gun, d ) {
		const f = d.firearm;
		const slots = [];
		if ( f.feed === 'mag' && f.mags?.length ) slots.push( 'mag' );
		for ( const s of f.rails || [] ) slots.push( s );
		for ( const s of Object.keys( gun.data?.att || {} ) ) if ( gun.data.att[ s ] && ! slots.includes( s ) ) slots.push( s );
		const row = h( 'div.att-row' );
		for ( const slot of slots ) {
			const st = slot === 'mag' ? gun.data?.mag : gun.data?.att?.[ slot ];
			const loc = { type: 'att', gun, slot };
			const el = st ? this._cell( st, loc, { cls: '.att' } ) : h( 'div.cell.empty.att', {}, svgGlyph( ATT_GLYPH[ slot ] || ATT_GLYPH.optic ) );
			el._dt = loc;
			el._slot = ATT_NAME[ slot ] || cap1( slot );
			row.appendChild( el );
		}
		return row;
	}

	_renderMid() {
		const inv = this.inv;
		const slot = ( type, s, wide = false ) => {
			const st = ( type === 'equip' ? inv.equip : inv.weapons )[ s ];
			const loc = { type, slot: s };
			const cls = '.slot' + ( wide ? '.w2' : '' );
			const el = st ? this._cell( st, loc, { cls, fp: wide ? { w: 2, h: 1 } : null, icon: wide ? { w: 2, h: 1 } : null } ) : h( 'div.cell.empty' + cls, {}, icon( SLOT_GLYPH[ s ] || s, 24 ) );
			el._dt = loc;
			el._slot = SLOT_NAME[ s ];
			return el;
		};
		clear( this.slotsL ).append( ...LEFT_SLOTS.map( s => slot( 'equip', s ) ) );
		clear( this.slotsR ).append( ...RIGHT_SLOTS.map( s => slot( 'equip', s ) ) );
		clear( this.slotsW ).append( slot( 'weapon', 'primary', true ), slot( 'weapon', 'secondary', true ), slot( 'weapon', 'sidearm' ), slot( 'weapon', 'melee' ) );
		this._renderConds();
		this.statEls = [];
		clear( this.statsEl ).append( ...this._stats().map( ( [ k, v, cls ] ) => {
			const s = h( 'span', { class: cls || null, text: v } );
			this.statEls.push( s );
			return h( 'div', {}, h( 'span', { text: k } ), s );
		} ) );
	}

	_renderConds() {
		const conds = this._conds();
		this.condKey = conds.map( c => c.id + c.label ).join( '|' );
		clear( this.condsEl ).append( ...conds.map( c => h( 'span.chip.' + c.kind, {}, icon( COND_ICON[ c.id ] || c.id ), h( 'span', { text: c.label } ) ) ) );
		this.condsEl.hidden = ! conds.length;
	}

	_conds() {
		return this.game.mode === 'creative' ? [] : ( this.game.survival?.conditions?.() || [] );
	}

	// the body table: values coloured by the HUD thresholds (5.5)
	_stats() {
		const S = this.game.survival, inv = this.inv;
		let insul = 0, bite = 0;
		for ( const s of Object.values( inv.equip ) ) { const c = s && withMods( getItem( s.id )?.clothing, s ); if ( c ) { insul += c.insulation || 0; bite = Math.max( bite, c.armor?.bite || 0 ); } }
		const lvl = ( v, low, crit ) => v < crit ? 'alarm' : v < low ? 'warn' : '';
		const hp = Math.round( S.health ), bl = Math.round( S.blood / 50 ), fo = Math.round( Math.min( 100, S.hunger ) ), wa = Math.round( Math.min( 100, S.thirst ) ), en = Math.round( S.energy ), t = S.temp;
		const tc = t < 35.2 || t > 38.6 ? 'alarm' : t < 36 ? 'cold' : t > 38 ? 'warn' : '';
		return [
			[ 'Health', hp + '%', lvl( hp, 50, 25 ) ], [ 'Food', fo + '%', lvl( fo, 30, 10 ) ],
			[ 'Blood', bl + '%', lvl( bl, 76, 60 ) ], [ 'Water', wa + '%', lvl( wa, 30, 10 ) ],
			[ 'Body', t.toFixed( 1 ) + '°', tc ], [ 'Energy', en + '%', lvl( en, 25, 10 ) ],
			[ 'Air', Math.round( S.envTemp ?? 0 ) + '°' ], [ 'Wet', Math.round( ( S.wet || 0 ) * 100 ) + '%' ],
			[ 'Insulation', Math.round( insul * 100 ) + '%' ], [ 'Bite', Math.round( bite * 100 ) + '%' ],
		];
	}

	// twice a second: the clock, the body table, and the conditions when their list changes
	_live() {
		if ( ! this.statEls ) return;
		const when = this._when();
		if ( this.when.textContent !== when ) this.when.textContent = when;
		this._stats().forEach( ( [ , v, cls ], i ) => {
			const s = this.statEls[ i ];
			if ( ! s ) return;
			if ( s.textContent !== v ) s.textContent = v;
			if ( s.className !== ( cls || '' ) ) s.className = cls || '';
		} );
		if ( this._conds().map( c => c.id + c.label ).join( '|' ) !== this.condKey ) this._renderConds();
	}

	// the quickbar: nine small numbered squares
	_renderStrip() {
		const inv = this.inv;
		clear( this.strip );
		for ( let i = 0; i < 9; i ++ ) {
			const at = inv.hotbar[ i ] ? this._locOf( inv.hotbar[ i ] ) : null;
			const el = h( 'div.hot' + ( at && inv.hands === at.stack.uid ? '.on' : '' ) );
			if ( at ) {
				const img = h( 'img', { alt: '', draggable: false } );
				setIcon( img, lookKey( at.stack ) );
				el.appendChild( img );
				el._it = at;
			}
			el.appendChild( h( 'span.n', { text: String( i + 1 ) } ) );
			const q = at ? qtyOf( at.stack ) : '';
			if ( q ) el.appendChild( h( 'span.q', { text: q } ) );
			el._dt = { type: 'hotbar', i };
			el._hb = i;
			this.strip.appendChild( el );
		}
	}

	// an item cell: render (sized for its footprint), condition tint, held / spoiled / wet / hot marks, quantity or
	// rounds, hotbar number, one bar. fp: the grid rectangle (cells); icon: the icon's footprint when not fp.
	_cell( stack, loc, { cls = '', fp = null, icon: ifp = null, dot = true } = {} ) {
		const d = getItem( stack.id );
		const img = h( 'img', { alt: '', draggable: false } );
		setIcon( img, lookKey( stack ), ifp || fp );
		const el = h( 'div.cell' + cls + ( fp && ! cls.includes( '.slot' ) ? '.it' : '' ), {}, img );
		if ( fp && el.classList.contains( 'it' ) ) { el.style.setProperty( '--w', fp.w ); el.style.setProperty( '--h', fp.h ); }
		const cat = loc.type === 'catalog';
		if ( ! cat && hasCond( stack, d ) ) { const c = condCls( stack.cond ?? 1 ); if ( c ) el.classList.add( c ); }
		if ( dot && ! cat && this.inv.hands === stack.uid ) el.appendChild( h( 'i.dot' ) );
		if ( ! cat && d?.food?.spoil && freshness( stack ) <= 0 ) { el.classList.add( 'spoiled' ); el.appendChild( h( 'i.dot.spoiled' ) ); }
		if ( ! cat && ( stack.data?.wet || 0 ) > 0.05 ) el.appendChild( h( 'i.wet' ) );
		if ( ! cat && hotOf( stack, d ) ) el.appendChild( h( 'i.hot' ) );
		const q = cat ? '' : qtyOf( stack );
		if ( q ) el.appendChild( h( 'span.q', { text: q } ) );
		if ( CARRIED.has( loc.type ) ) { const n = this.inv.hotbar.indexOf( stack.uid ); if ( n >= 0 ) el.appendChild( h( 'span.n', { text: String( n + 1 ) } ) ); }
		const bar = cat ? null : barOf( stack, d );
		if ( bar ) el.appendChild( meterEl( bar ) );
		el._it = { stack, loc };
		el._q = ( displayName( stack ) + ' ' + ( CATEGORY_LABEL[ d?.cat ] || d?.cat || '' ) ).toLowerCase();
		return el;
	}

	// search: dim every cell that doesn't match (name or category)
	_applyQuery() {
		if ( ! this.el ) return;
		const q = this.query;
		for ( const c of this.panel.querySelectorAll( '.cell' ) ) c.classList.toggle( 'dim', !! q && ! ( c._q || '' ).includes( q ) );
	}

	// where a carried stack lives, by uid: { stack, loc } (one level of nesting, a pouch in the backpack)
	_locOf( uid ) {
		const inv = this.inv;
		for ( const k in inv.equip ) if ( inv.equip[ k ]?.uid === uid ) return { stack: inv.equip[ k ], loc: { type: 'equip', slot: k } };
		for ( const k in inv.weapons ) if ( inv.weapons[ k ]?.uid === uid ) return { stack: inv.weapons[ k ], loc: { type: 'weapon', slot: k } };
		for ( const c of inv.containers() ) {
			for ( const s of c.items ) {
				if ( s.uid === uid ) return { stack: s, loc: { type: 'container', container: c, items: c.items } };
				const inner = s.data?.items;
				if ( inner ) for ( const t of inner ) if ( t.uid === uid ) return { stack: t, loc: { type: 'container', container: { label: displayName( s ), capacity: capacityOf( s ), items: inner, owner: s }, items: inner } };
			}
		}
		return null;
	}

	// ---- hover and tooltips --------------------------------------------------------------------------------------

	_cellAt( t ) {
		const c = t?.closest?.( '.cell, .hot' );
		return c && this.el.contains( c ) ? c : null;
	}

	_hoverAt( t ) {
		const c = t?.closest?.( '.cell, .hot, .chip.req, .recipe > img, .hands-sect' );
		return c && this.el.contains( c ) && ( c._it || c._slot || c._tipStack ) ? c : null;
	}

	_over( e ) {
		this.px = e.clientX; this.py = e.clientY;
		if ( this.drag?.active ) return;
		const el = this._hoverAt( e.target );
		if ( el === this.hoverEl ) return;
		this.hoverEl = el;
		this._hideTip( true );
		if ( el ) this._tipSoon( el );
	}

	// after a re-render the element under the pointer is new: find it again, keep an open tooltip if it
	// still shows the same thing (with fresh numbers)
	_rehover() {
		if ( this.px == null || this.drag?.active ) return;
		const el = this._hoverAt( document.elementFromPoint( this.px, this.py ) );
		const same = el && this.hoverEl && sameTarget( el, this.hoverEl );
		const shown = ! this.tip.hidden;
		this.hoverEl = el;
		if ( ! el ) { this._hideTip(); return; }
		if ( same && shown ) this._showTip( el, false );
		else if ( ! same ) { this._hideTip(); this._tipSoon( el ); }
	}

	_tipSoon( el ) {
		clearTimeout( this.tipTimer );
		// moving from one tooltip straight to the next shows it at once
		if ( performance.now() - ( this.tipHiddenAt || - 1e9 ) < 300 ) { this._showTip( el, true, true ); return; }
		this.tipTimer = setTimeout( () => { if ( this.hoverEl === el && ! this.drag?.active && ! this.ctxClose ) this._showTip( el ); }, 250 );
	}

	_showTip( el, place = true, warm = false ) {
		const body = el._it ? this._tipItem( el._it.stack, el._it.loc ) : el._tipStack ? this._tipItem( el._tipStack, { type: 'catalog' } ) : el._slot ? [ h( 'div.ttl', { text: el._slot } ) ] : null;
		if ( ! body ) { this._hideTip(); return; }
		clear( this.tip ).append( ...body );
		this.tip.classList.toggle( 'one', ! ( el._it || el._tipStack ) );
		this.tip.classList.toggle( 'warm', warm );
		this.tip.hidden = false;
		if ( ! place ) return;
		const off = 14 * ( this.ui.u || 1 ), x = this.px ?? 0, y = this.py ?? 0;
		placePop( this.tip, x + off, y + off, { flipX: x - off, flipY: y - off } );
	}

	_hideTip( warm = false ) {
		clearTimeout( this.tipTimer );
		if ( this.tip && ! this.tip.hidden ) {
			this.tip.hidden = true;
			this.tipHiddenAt = warm ? performance.now() : - 1e9;
		}
	}

	// the item the hovered one would replace, for the compare deltas
	_compareWith( stack, d ) {
		const inv = this.inv;
		let w = null;
		if ( d.cat === 'clothing' || d.cat === 'backpack' ) w = inv.equip[ slotOf( d ) ];
		else if ( d.cat === 'firearm' ) w = inv.weapons[ d.firearm.slot === 'sidearm' ? 'sidearm' : 'primary' ];
		else if ( d.cat === 'melee' ) w = inv.weapons.melee;
		return w && w !== stack && getItem( w.id ) ? w : null;
	}

	// tooltip (docs/UI_DAYZ.md): NAME in caps, CATEGORY · detail, a line of description, then rows: condition in its
	// colour, the category's stats (with deltas against what it would replace), quantity, wetness, temperature;
	// flags; weight and size. Catalog and recipe stacks are definitions only: no condition, rounds or contents.
	_tipItem( stack, loc ) {
		const d = getItem( stack.id );
		if ( ! d ) return null;
		const inst = loc?.type !== 'catalog';
		const cmp = inst ? this._compareWith( stack, d ) : null;
		const cd = cmp ? getItem( cmp.id ) : null;
		const rows = [], flags = [];
		let meta = CATEGORY_LABEL[ d.cat ] || cap1( d.cat ), line = null, desc = d.desc || null;
		const kv = ( k, v, delta = null, cls = null ) => rows.push( h( 'div.kv', {}, h( 'span', { text: k } ), h( 'span', { class: cls }, v, delta ) ) );
		// a numeric row; `o` is the compared value (null: no compare). Hidden when both are zero.
		const num = ( k, v, o = null, fmt = String, dp = 0 ) => {
			v = v || 0;
			if ( ! v && ! o ) return;
			const dv = o != null ? + ( v - o ).toFixed( dp ) : 0;
			kv( k, fmt( v ), dv ? h( 'span.d.' + ( dv > 0 ? 'up' : 'down' ), { text: signed( dv, dp ) } ) : null );
		};
		const ov = ( obj, f ) => obj ? f( obj ) || 0 : null;
		const plus = v => signed( v );
		if ( inst && hasCond( stack, d ) && ! d.food ) { const c = stack.cond ?? 1; kv( 'Condition', condLabel( c ), null, condCls( c ) || null ); }
		if ( d.firearm ) {
			const f = d.firearm, o = cd?.firearm;
			if ( f.caliber ) meta += ' · ' + f.caliber;
			if ( inst ) {
				const a = ammoOf( stack ) || 0;
				const cap = f.feed === 'internal' ? f.capacity : stack.data.mag ? getItem( stack.data.mag.id )?.magazine?.capacity : null;
				kv( 'Loaded', cap ? `${a}/${cap}` : String( a ) );
			}
			const dmg = x => Math.round( x.damage * ( x.pellets || 1 ) );
			num( 'Damage', dmg( f ), ov( o, dmg ) );
			num( 'Rate', f.rpm, ov( o, x => x.rpm ), v => v + ' rpm' );
			if ( f.modes?.length ) kv( 'Modes', f.modes.map( m => ops.MODE_LABEL?.[ m ] || cap1( m ) ).join( ' · ' ) );
			num( 'Range', f.range, ov( o, x => x.range ), v => v + ' m' );
			const att = Object.values( stack.data?.att || {} ).filter( Boolean ).map( a => getItem( a.id )?.name ).filter( Boolean );
			if ( att.length ) line = att.join( ' · ' );
		} else if ( d.magazine ) {
			if ( d.magazine.caliber ) meta += ' · ' + d.magazine.caliber;
			if ( inst ) kv( 'Rounds', `${stack.data.rounds || 0}/${d.magazine.capacity}` );
			else kv( 'Capacity', String( d.magazine.capacity ) );
		} else if ( d.ammo ) {
			if ( d.ammo.caliber ) meta += ' · ' + d.ammo.caliber;
		} else if ( d.melee ) {
			const m = d.melee, o = cd?.melee;
			num( 'Damage', m.damage, ov( o, x => x.damage ) );
			num( 'Speed', m.speed, ov( o, x => x.speed ), v => v.toFixed( 1 ) + '/s', 1 );
			num( 'Reach', m.reach, ov( o, x => x.reach ), v => v.toFixed( 1 ) + ' m', 1 );
		} else if ( d.clothing || d.backpack ) {
			const c = withMods( d.clothing || d.backpack, inst ? stack : null ), o = cd ? withMods( cd.clothing || cd.backpack, cmp ) : null;
			const s = slotOf( d );
			if ( SLOT_NAME[ s ] ) meta += ' · ' + SLOT_NAME[ s ];
			const p = v => Math.round( v * 100 );
			num( 'Storage', c.capacity, ov( o, x => x.capacity ) );
			num( 'Insulation', p( c.insulation || 0 ), ov( o, x => p( x.insulation || 0 ) ), v => v + '%' );
			num( 'Bite', p( c.armor?.bite || 0 ), ov( o, x => p( x.armor?.bite || 0 ) ), v => v + '%' );
			num( 'Ballistic', p( c.armor?.bullet || 0 ), ov( o, x => p( x.armor?.bullet || 0 ) ), v => v + '%' );
			num( 'Waterproof', p( c.waterproof || 0 ), ov( o, x => p( x.waterproof || 0 ) ), v => v + '%' );
		} else if ( d.food ) {
			const f = d.food;
			// an evolved dish (the kitchen's data.dish) carries its own nutrition: what is left of it, as eating applies it
			const D = inst && stack.data?.dish, k = ( stack.data?.left ?? f.portions ?? 1 ) / ( f.portions || 1 );
			num( 'Food', Math.round( ( D ? D.kcal * kcalMul( D ) * k : f.kcal || 0 ) / 20 ), null, plus );
			num( 'Water', Math.round( D ? ( D.water || 0 ) * k : f.water || 0 ), null, plus );
			if ( f.spoil && inst ) kv( 'Freshness', pct( freshness( stack ) ) );
			if ( f.raw || ( D?.raw > 0 && ! D.cooked ) ) flags.push( 'Raw' );
			if ( f.opener ) flags.push( 'Sealed' );
			if ( f.spoil && inst && freshness( stack ) <= 0 ) flags.push( [ 'Spoiled' ] );
			if ( D ) desc = null; // (the name already lists what went in)
		} else if ( d.drink ) {
			const r = d.drink;
			num( 'Water', Math.round( r.water || 0 ), null, plus );
			num( 'Food', Math.round( ( r.kcal || 0 ) / 20 ), null, plus );
			if ( r.alcohol ) flags.push( 'Alcohol' );
		} else if ( d.medical ) {
			const m = d.medical;
			if ( m.bleed ) kv( 'Bleeding', MINUS + m.bleed );
			if ( m.heal ) kv( 'Health', '+' + m.heal );
			if ( m.infection ) kv( 'Infection', MINUS + pct( m.infection ) );
			if ( m.blood ) kv( 'Blood', `+${m.blood} ml` );
			if ( m.sick ) kv( 'Poisoning', MINUS + pct( m.sick ) );
			if ( m.pain ) kv( 'Pain', MINUS + pct( m.pain ) );
			if ( m.energy ) kv( 'Energy', '+' + m.energy );
			if ( m.uses && inst ) kv( 'Doses', `${stack.data.uses ?? m.uses}/${m.uses}` );
			if ( m.splint ) flags.push( 'Splint' );
		} else if ( d.tool ) {
			const t = d.tool;
			if ( t.battery && inst ) kv( 'Battery', pct( Math.min( 1, ( stack.data.charge || 0 ) / t.battery ) ) );
			if ( t.liquid ) {
				const L = stack.data?.amount || 0;
				if ( ! inst ) kv( 'Capacity', `${t.liquid} L` );
				else if ( stack.data.liquid && L > 0.005 ) { meta += ' · ' + liquidName( stack.data.liquid ); kv( 'Contents', `${L.toFixed( 1 )} L ${liquidName( stack.data.liquid )}` ); }
				else kv( 'Contents', 'Empty' );
			}
		} else if ( d.fuel ) {
			kv( 'Fuel', `${( inst ? stack.data.amount ?? d.fuel.litres : d.fuel.litres ).toFixed( 1 )} L` );
		} else if ( d.cat === 'book' ) {
			// what it teaches, how long it takes and how far you got (ItemUse.readSpec, Skills.readProgress)
			const rs = this.game.itemUse?.readSpec?.( d );
			if ( rs?.skill && SKILL_NAMES[ rs.skill ] ) kv( 'Skill', SKILL_NAMES[ rs.skill ] );
			else if ( rs?.learn ) kv( 'Teaches', cap1( rs.learn ) );
			if ( rs?.hours ) kv( 'Time', rs.hours >= 1 ? `${Math.round( rs.hours * 10 ) / 10} h` : `${Math.round( rs.hours * 60 )} min` );
			const done = inst ? this.game.skills?.readProgress?.( d.id ) || 0 : 0;
			if ( rs?.once && done >= 1 ) flags.push( 'Read' );
			else if ( done > 0.01 && done < 1 ) kv( 'Progress', pct( done ) );
			// (the book's effect is its description)
		}
		// quantity of a stackable, then wetness and temperature
		if ( inst && d.stack > 1 && ! d.magazine ) kv( 'Quantity', `${stack.qty}/${d.stack}` );
		const wet = inst ? stack.data?.wet || 0 : 0;
		if ( wet > 0.05 ) kv( 'Wetness', wet > 0.7 ? 'Soaked' : wet > 0.3 ? 'Wet' : 'Damp', null, 'wet' );
		if ( inst && hotOf( stack, d ) ) kv( 'Temperature', 'Hot', null, 'hot' );

		const out = [ h( 'div.ttl', { text: displayName( stack ) } ), h( 'div.meta.t-label', { text: meta } ) ];
		if ( desc ) out.push( h( 'div.desc', { text: desc } ) );
		if ( rows.length || line || flags.length ) out.push( h( 'hr' ), ...rows );
		if ( line ) out.push( h( 'div.line', { text: line } ) );
		if ( flags.length ) out.push( h( 'div.flags', {}, flags.map( ( f, i ) => [ i ? ' · ' : '', Array.isArray( f ) ? h( 'span.bad', { text: f[ 0 ] } ) : f ] ) ) );
		const w = stackWeight( stack ) + ( stack.data?.items ? containerWeight( stack.data.items ) : 0 );
		out.push( h( 'hr' ), h( 'div.foot', {}, h( 'span', { text: w.toFixed( 2 ) + ' kg' } ), h( 'span', { text: 'Size ' + fmtVol( stackVolume( stack ) ) } ) ) );
		return out;
	}

	// ---- pointer: click, modifiers, drag and drop -------------------------------------------------------------------

	_down( e ) {
		if ( e.target === this.el || e.target === this.wrap ) {
			// the scrim closes the screen, unless that click only dismissed a menu
			if ( e.button === 0 && ! this.popWasOpen && ! this.drag ) this.ui.closeScreen();
			return;
		}
		if ( e.button !== 0 ) return;
		const el = this._cellAt( e.target );
		if ( ! el?._it ) return;
		const { stack, loc } = el._it;
		if ( e.shiftKey || e.ctrlKey || e.metaKey ) { e.preventDefault(); this._quickMove( stack, loc ); this.dirty = true; return; }
		if ( e.altKey ) { e.preventDefault(); if ( CARRIED.has( loc.type ) ) { this._default( stack, loc ); this.dirty = true; } return; }
		const r = el.getBoundingClientRect();
		const d = this.drag = { stack, loc, el, x: e.clientX, y: e.clientY, gx: ( e.clientX - r.left ) / r.width, gy: ( e.clientY - r.top ) / r.height, active: false, over: null };
		const move = ev => this._dragMove( ev );
		const up = ev => {
			if ( this.drag !== d ) { d.off(); return; }
			if ( d.active ) { if ( ev.type === 'pointerup' ) this._drop( ev ); }
			else if ( loc.type === 'catalog' && ev.type === 'pointerup' ) { this.game.give( stack.id, 1 ); this.audio.ui(); this.dirty = true; }
			this._endDrag();
		};
		d.off = () => {
			window.removeEventListener( 'pointermove', move );
			window.removeEventListener( 'pointerup', up );
			window.removeEventListener( 'pointercancel', up );
		};
		window.addEventListener( 'pointermove', move );
		window.addEventListener( 'pointerup', up );
		window.addEventListener( 'pointercancel', up );
	}

	_dbl( e ) {
		const el = this._cellAt( e.target );
		if ( ! el?._it ) return;
		if ( el._hands ) { this.game.hands?.holster?.(); this.dirty = true; return; }
		this._default( el._it.stack, el._it.loc );
		this.dirty = true;
	}

	_dragMove( ev ) {
		const d = this.drag;
		if ( ! d ) return;
		this.px = ev.clientX; this.py = ev.clientY;
		// the button came up outside the window
		if ( d.active && ev.buttons === 0 ) { this._endDrag(); return; }
		if ( ! d.active ) {
			if ( Math.hypot( ev.clientX - d.x, ev.clientY - d.y ) <= 5 ) return;
			this._startDrag( d );
		}
		d.ghost.style.left = ( ev.clientX - d.ox ) + 'px';
		d.ghost.style.top = ( ev.clientY - d.oy ) + 'px';
		const t = this._targetAt( ev.clientX, ev.clientY );
		if ( ( t?.el || null ) !== ( d.over?.el || null ) || !! t?.scrim !== !! d.over?.scrim ) this._setOver( t );
		if ( t?.scrim ) this._placeChip( null, ev.clientX, ev.clientY );
	}

	// the dragged stack's own rectangle follows the pointer, held where it was picked up
	_startDrag( d ) {
		d.active = true;
		this._hideTip();
		this.ctxClose?.();
		this._closeSplit();
		const fp = d.loc.type === 'catalog' ? { w: 1, h: 1 } : footprint( d.stack );
		const q = d.loc.type === 'catalog' ? '' : qtyOf( d.stack );
		const img = h( 'img', { alt: '', draggable: false } );
		setIcon( img, lookKey( d.stack ), fp );
		d.ghost = h( 'div.drag-ghost', {}, img, q ? h( 'span.q', { text: q } ) : null );
		d.ghost.style.setProperty( '--w', fp.w ); d.ghost.style.setProperty( '--h', fp.h );
		this.ui.root.appendChild( d.ghost );
		const gr = d.ghost.getBoundingClientRect(), sr = d.el.getBoundingClientRect();
		// the same shape as the cell it left: keep the grip point; else hold it near its top-left corner
		const same = Math.abs( gr.width - sr.width ) < 2 && Math.abs( gr.height - sr.height ) < 2;
		const u = this.ui.u || 1;
		d.ox = same ? d.gx * gr.width : Math.min( gr.width / 2, 30 * u );
		d.oy = same ? d.gy * gr.height : Math.min( gr.height / 2, 30 * u );
		d.ghost.style.left = ( d.x - d.ox ) + 'px';
		d.ghost.style.top = ( d.y - d.oy ) + 'px';
		d.el.classList.add( 'src' );
		this.el.classList.add( 'dragging' );
		// outline every place that would take it: item-on-item first (load, insert, attach, merge, mix), then the
		// slot, section or quickbar square itself
		for ( const t of this.el.querySelectorAll( '.cell, .hot, .sect, .inv-char' ) ) {
			t._accI = t._it && t._it.stack !== d.stack ? this._acceptsItem( d.stack, d.loc, t._it.stack, t._it.loc ) : null;
			t._accD = t._dt ? this._accepts( d.stack, d.loc, t._dt ) : null;
			if ( t._accI?.ok || t._accD?.ok ) t.classList.add( 'can' );
		}
	}

	// what is under the pointer: { el, acc, item? } or { scrim, acc }
	_targetAt( x, y ) {
		const d = this.drag;
		const hit = document.elementFromPoint( x, y );
		if ( ! hit || ! this.el.contains( hit ) ) return null;
		const c = hit.closest( '.cell, .hot' );
		// a mix that can't run yet (no fire, no fuel) still targets the item, to say why; a hotbar key still binds
		if ( c?._accI?.ok || ( c?._accI?.combo && c._hb == null ) ) return { el: c, acc: c._accI, item: true };
		for ( let n = hit; n && n !== this.el; n = n.parentElement ) if ( n._dt ) return { el: n, acc: n._accD || NO };
		// the scrim outside the panel and the strip drops to the ground
		if ( ! this.panel.contains( hit ) && ! this.strip.contains( hit ) ) return { scrim: true, acc: d.loc.type === 'ground' || d.loc.type === 'catalog' ? NO : { ok: true, verb: 'Drop' } };
		return null;
	}

	_setOver( t ) {
		const d = this.drag;
		d.over?.el?.classList.remove( 'over', 'deny' );
		this.chip?.remove();
		this.chip = null;
		this.land?.remove();
		this.land = null;
		d.over = t;
		d.ghost.classList.remove( 'ok', 'no' );
		if ( ! t ) return;
		const a = t.acc;
		if ( a.ok || a.reason ) d.ghost.classList.add( a.ok ? 'ok' : 'no' );
		if ( t.el && ( a.ok || a.reason ) ) t.el.classList.add( a.ok ? 'over' : 'deny' );
		// into a grid: outline where it would land
		if ( a.ok && ! t.item && t.el?._grid ) this._showLanding( t.el );
		const text = a.ok ? a.verb || a.part : a.reason;
		if ( ! text ) return;
		this.chip = h( 'div.chip-drag' + ( ! a.ok ? '.bad' : a.part ? '.part' : '' ), { text } );
		this.el.appendChild( this.chip );
		if ( t.el ) this._placeChip( t.el._head || t.el );
	}

	// the rectangle a dropped stack would take in a section's grid (after topping up stacks it merges into)
	_showLanding( sect ) {
		const d = this.drag, pk = sect._pack, to = sect._dt;
		let stacks;
		if ( to.type === 'ground' ) stacks = [ ...pk.stacks, d.stack ];
		else {
			const probe = d.loc.type === 'catalog' ? makeStack( d.stack.id, getItem( d.stack.id )?.stack > 1 ? getItem( d.stack.id ).stack : 1, { full: true } ) : JSON.parse( JSON.stringify( d.stack ) );
			if ( ! probe ) return;
			stacks = pk.stacks.map( s => ( { ...s, data: s.data } ) );
			addToItems( stacks, to.container?.capacity ?? pk.cap, probe );
		}
		const before = new Set( pk.stacks.map( s => s.uid ) );
		const P = packGrid( stacks, pk.cap, pk.open );
		const fresh = P.items.filter( p => ! before.has( p.s.uid ) || p.s === d.stack );
		const p = fresh[ fresh.length - 1 ];
		if ( ! p ) return;
		const g = sect._grid;
		// a grid that grows to take it shows the new rows for now
		if ( P.rows > + g.style.getPropertyValue( '--rows' ) ) g.style.setProperty( '--rows-drop', P.rows );
		this.land = h( 'div.land' );
		this.land.style.setProperty( '--x', p.x ); this.land.style.setProperty( '--y', p.y );
		this.land.style.setProperty( '--w', p.w ); this.land.style.setProperty( '--h', p.h );
		g.appendChild( this.land );
		this.land._grid = g;
	}

	// the chip sits centred 4u above its target (above the ghost for the scrim)
	_placeChip( anchor, x, y ) {
		if ( ! this.chip ) return;
		const u = this.ui.u || 1;
		if ( anchor ) { const r = anchor.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; } else y -= 28 * u;
		this.chip.style.left = Math.round( x ) + 'px';
		this.chip.style.top = Math.round( Math.max( 28 * u, y - 4 * u ) ) + 'px';
	}

	_drop( ev ) {
		const d = this.drag;
		const t = this._targetAt( ev.clientX, ev.clientY );
		if ( ! t ) return;
		const a = t.acc;
		// refused: the chip already said why; only the sound
		if ( ! a.ok ) { if ( a.reason ) this._deny( a.reason ); return; }
		if ( t.item ) {
			// a catalog stack becomes real (full) before it is loaded, inserted or merged
			if ( d.loc.type === 'catalog' ) { const def = getItem( d.stack.id ); d.stack = makeStack( d.stack.id, def.stack > 1 ? def.stack : 1, { full: true } ); d.loc = { type: 'void' }; }
			this._dropOnItem( t.el._it.stack, t.el._it.loc );
		} else if ( t.scrim ) this.move( d.stack, d.loc, { type: 'ground' } );
		else {
			const to = t.el._dt;
			if ( to.type === 'hands' ) { this.game.hands?.select?.( d.stack ); this.audio.ui(); }
			else if ( to.type === 'hotbar' ) this._bind( d.stack, to.i );
			else if ( to.type === 'att' ) this._fit( d, to );
			else if ( to.type === 'body' ) { const to2 = this._bodySlot( d.stack, getItem( d.stack.id ) ); if ( to2 ) this.move( d.stack, d.loc, to2 ); }
			else this.move( d.stack, d.loc, to );
		}
		this.dirty = true;
	}

	// where a stack dropped on the character goes: { type, slot } or null
	_bodySlot( stack, d ) {
		if ( ! d ) return null;
		if ( d.cat === 'clothing' || d.cat === 'backpack' ) { const s = slotOf( d ); return s ? { type: 'equip', slot: s } : null; }
		const W = this.inv.weapons;
		if ( d.cat === 'melee' ) return { type: 'weapon', slot: 'melee' };
		if ( d.cat !== 'firearm' ) return null;
		if ( d.firearm.slot === 'sidearm' ) return { type: 'weapon', slot: 'sidearm' };
		return { type: 'weapon', slot: ! W.primary || W.primary === stack ? 'primary' : ! W.secondary || W.secondary === stack ? 'secondary' : 'primary' };
	}

	// onto one of the held gun's fittings: a magazine into the well, an attachment onto its rail
	_fit( d, to ) {
		const H = this.game.hands;
		let s = d.stack;
		if ( d.loc.type === 'catalog' ) { s = makeStack( s.id, 1, { full: true } ); if ( ! s || this.inv.add( s, { autoEquip: false } ) > 0 ) return; }
		const ok = to.slot === 'mag' ? H?.insertMagazine?.( to.gun, s ) : H?.attach?.( to.gun, s );
		if ( ok !== false ) this.audio.ui();
	}

	_endDrag() {
		const d = this.drag;
		if ( ! d ) return;
		d.off?.();
		this.drag = null;
		d.ghost?.remove();
		d.el?.classList.remove( 'src' );
		this.chip?.remove();
		this.chip = null;
		if ( this.land ) { this.land._grid?.style.removeProperty( '--rows-drop' ); this.land.remove(); this.land = null; }
		if ( ! this.el ) return;
		this.el.classList.remove( 'dragging' );
		for ( const t of this.el.querySelectorAll( '.can, .over, .deny' ) ) t.classList.remove( 'can', 'over', 'deny' );
		for ( const g of this.el.querySelectorAll( '.cgrid' ) ) g.style.removeProperty( '--rows-drop' );
		if ( d.active ) this.dirty = true;
	}

	// Dry run of move() for a drop target: { ok, part? } or { ok: false, reason? } (no reason: not a target,
	// e.g. the place it already is)
	_accepts( stack, from, to ) {
		const d = getItem( stack.id );
		if ( ! d ) return NO;
		const carried = CARRIED.has( from.type );
		switch ( to.type ) {
			case 'equip':
				if ( from.type === 'equip' && from.slot === to.slot ) return NO;
				return slotOf( d ) === to.slot ? OK : { ok: false, reason: 'Wrong slot' };
			case 'weapon':
				if ( from.type === 'weapon' && from.slot === to.slot ) return NO;
				return weaponFits( d, to.slot ) ? OK : { ok: false, reason: 'Wrong slot' };
			case 'ground':
				return from.type === 'ground' ? NO : OK;
			case 'hotbar':
				if ( ! carried ) return { ok: false, reason: 'Not carried' };
				return this.inv.hotbar[ to.i ] === stack.uid ? NO : OK;
			case 'hands':
				if ( ! carried ) return { ok: false, reason: 'Not carried' };
				return this.inv.hands === stack.uid ? NO : OK;
			case 'att': {
				if ( from.type === 'att' && from.gun === to.gun && from.slot === to.slot ) return NO;
				const gd = getItem( to.gun.id );
				if ( to.slot === 'mag' ) return d.magazine ? ( ops.magFits( gd, d.id ) ? { ok: true, verb: 'Insert' } : { ok: false, reason: 'Does not fit' } ) : { ok: false, reason: 'Wrong slot' };
				if ( ! d.attachment ) return { ok: false, reason: 'Wrong slot' };
				const f = ops.attachmentFits ? ops.attachmentFits( gd, d ) : { ok: true, slot: d.attachment.slot };
				if ( f.slot !== to.slot ) return { ok: false, reason: 'Wrong slot' };
				return f.ok ? { ok: true, verb: 'Attach' } : { ok: false, reason: f.reason || 'Does not fit' };
			}
			case 'body': {
				// the slot it would go to: clothing to its own, a gun to the free shoulder, a sidearm, a melee weapon
				const to2 = this._bodySlot( stack, d );
				if ( ! to2 ) return { ok: false, reason: "Can't wear" };
				if ( from.type === to2.type && from.slot === to2.slot ) return NO;
				return { ok: true, verb: to2.type === 'equip' ? 'Wear' : 'Equip' };
			}
			case 'catalog':
				return NO;
		}
		// a container section
		const items = to.items || to.container?.items;
		if ( ! items || items === from.items ) return NO;
		if ( to.container?.owner === stack ) return { ok: false, reason: "Can't nest" };
		const probe = from.type === 'catalog' ? makeStack( stack.id, d.stack > 1 ? d.stack : 1, { full: true } ) : JSON.parse( JSON.stringify( stack ) );
		if ( ! probe ) return NO;
		const qty = probe.qty;
		const left = addToItems( items.map( s => ( { ...s, data: s.data } ) ), to.container?.capacity ?? 0, probe );
		if ( left <= 0 ) return OK;
		if ( left < qty ) return { ok: true, part: `${qty - left}/${qty}` };
		return { ok: false, reason: 'No room' };
	}

	// item-on-item: ammo into a magazine or an internal-feed gun, a magazine into a gun, an attachment onto a
	// gun, the same item onto a stack with room, then the mixes (game.combine: the verb, or why it can't run yet).
	// Anything else is not a target (the drop falls to the section).
	_acceptsItem( stack, from, target, tloc ) {
		if ( target === stack || tloc.type === 'catalog' ) return NO;
		const a = getItem( stack.id ), b = getItem( target.id );
		if ( ! a || ! b ) return NO;
		if ( a.ammo && b.magazine && a.ammo.caliber === b.magazine.caliber ) return ( target.data.rounds || 0 ) < b.magazine.capacity ? { ok: true, verb: 'Load' } : NO;
		if ( a.ammo && b.firearm?.feed === 'internal' && a.ammo.caliber === b.firearm.caliber ) return ! ops.internalRoom || ops.internalRoom( target ) > 0 ? { ok: true, verb: 'Load' } : NO;
		if ( a.magazine && ( b.firearm?.mags || [] ).includes( a.id ) ) return { ok: true, verb: 'Insert' };
		if ( a.attachment && b.firearm ) return ! ops.attachmentFits || ops.attachmentFits( b, a ).ok ? { ok: true, verb: 'Attach' } : NO;
		if ( a.id === b.id && b.stack > 1 && tloc.items && target.qty < b.stack && ( from.type === 'catalog' || canMerge( target, stack ) ) ) return { ok: true, verb: 'Merge' };
		// catalog cells are not real stacks: nothing to mix
		if ( from.type !== 'catalog' && from.type !== 'att' ) { const c = this.game.combine?.accepts?.( stack, target ); if ( c ) return c; }
		return NO;
	}

	_dropOnItem( target, tloc ) {
		const d = this.drag;
		const a = getItem( d.stack.id ), b = getItem( target.id );
		if ( ! a || ! b ) return;
		const H = this.game.hands;
		let done = false;
		if ( a.ammo && b.magazine && a.ammo.caliber === b.magazine.caliber ) { H?.loadMagazine?.( target, d.stack ); done = true; }
		else if ( a.ammo && b.firearm && b.firearm.feed === 'internal' && a.ammo.caliber === b.firearm.caliber ) { H?.loadWeapon?.( target, d.stack ); done = true; }
		else if ( a.magazine && b.firearm && ( b.firearm.mags || [] ).includes( a.id ) ) { H?.insertMagazine?.( target, d.stack ); done = true; }
		else if ( a.attachment && b.firearm ) { H?.attach?.( target, d.stack ); done = true; }
		else if ( a.id === b.id && b.stack > 1 && tloc.items ) {
			const n = Math.min( b.stack - target.qty, d.stack.qty );
			if ( n > 0 ) { target.qty += n; d.stack.qty -= n; if ( d.stack.qty <= 0 ) this._removeFrom( d.stack, d.loc ); if ( tloc.type === 'other' ) this._otherChanged(); this.inv.changed(); done = true; }
		} else {
			// a mix: one runs; several (rags onto sticks: a fire kit or a splint) ask which, at the drop
			const c = this.game.combine?.accepts?.( d.stack, target );
			// the chooser says what each uses up, and greys the ones that can't run yet (a torch without fuel)
			if ( c?.ok && c.matches.length === 1 ) this._runCombo( c.matches[ 0 ] );
			else if ( c?.ok ) this._comboChooser( [ ...c.matches, ...c.refused ].map( m => ( { ...m, ok: m.state.ok, reason: m.state.reason, cost: true } ) ), { x: this.px ?? 0, y: this.py ?? 0 } );
			else if ( c?.reason ) this._deny( c.reason );
			return;
		}
		if ( done ) { this.dirty = true; this.audio.ui(); }
	}

	// ---- mixes (game.combine) ------------------------------------------------------------------------------------------

	// runs where you stand with the screen open; the cells show its progress (the HUD ring is under the screen)
	_runCombo( m ) {
		// a refusal toasts its reason (combine.run)
		if ( this.game.combine.run( m.combo, m.a, m.b ) ) this.audio.ui();
		else this.audio.ui( 'ui_error', 0.3 );
		this.dirty = true;
	}

	// a popover of mixes at a point: a drop with a choice, or the Combine row's list. Rows that can't run yet are
	// shown greyed with the reason.
	_comboChooser( list, at ) {
		const name = s => displayName( s );
		const items = list.map( p => {
			// on the right: why not; at a drop (the partner is known) what it uses up; in the Combine list the
			// partner's name, unless the label already says it
			const other = p.other;
			const meta = p.ok === false ? p.reason : p.cost ? this.game.combine.cost( p.combo, p.a, p.b ) : other && ! p.label.includes( name( other ) ) ? name( other ) : null;
			return { label: p.label, meta, disabled: p.ok === false, run: () => this._runCombo( p ) };
		} );
		if ( ! items.length ) return;
		this.ctxClose?.();
		this.ctxClose = popMenu( items, at, { parent: this.el, audio: this.audio, onClose: () => { this.ctxClose = null; } } );
	}

	// "Combine ›" with the number that can run now; it opens the list of partners beside the menu. covered: mixes a
	// verb of the menu already does (a can's Open is "Open Can"), left out so nothing is offered twice
	_combineRow( stack, add, covered = null ) {
		let list = this.game.combine?.partners?.( stack ) || [];
		if ( covered?.size ) list = list.filter( p => ! covered.has( p.combo.id ) && ! covered.has( p.combo.id + '|' + p.other?.uid ) );
		list = list.slice( 0, 12 );
		if ( ! list.length ) return;
		const n = list.filter( p => p.ok ).length;
		this._comboAt = null;
		add( 'Combine', () => this._comboChooser( list, this._comboAt || { x: this.px ?? 0, y: this.py ?? 0 } ), '›', { meta: n ? String( n ) : null, combine: true } );
	}

	// progress of a running mix on its two cells: outlined, a bar filling along the top. Called every frame while the
	// screen is open: nothing is allocated when no mix runs, and the cells are looked up again only after a render
	// replaced them (a stack in a collapsed section is not searched for every frame).
	_comboProgress() {
		const act = this.game.actions?.current;
		const P = this._prog;
		if ( ! act?.combo ) {
			if ( P ) { for ( const b of P.bars ) { b.parentElement?.classList.remove( 'sel' ); b.remove(); } this._prog = null; }
			return;
		}
		let stale = ! P || P.act !== act || P.v !== this.version || P.nk !== this.nearKey;
		if ( ! stale ) for ( let i = 0; i < P.bars.length; i ++ ) if ( ! P.bars[ i ].isConnected ) { stale = true; break; }
		if ( stale ) {
			if ( P ) for ( const b of P.bars ) { b.parentElement?.classList.remove( 'sel' ); b.remove(); }
			const bars = [];
			for ( const cell of this.el.querySelectorAll( '.cell' ) ) {
				const uid = cell._it?.stack.uid;
				if ( uid !== act.combo.a && uid !== act.combo.b ) continue;
				const bar = h( 'i.combo-prog' );
				cell.classList.add( 'sel' );
				cell.appendChild( bar );
				bars.push( bar );
			}
			this._prog = { act, v: this.version, nk: this.nearKey, bars, p: - 1 };
		}
		const Q = this._prog;
		// a step of 1 %: the width string is built only when it moves
		const p = Math.round( Math.min( 1, this.game.actions.progress || 0 ) * 100 );
		if ( p === Q.p ) return;
		Q.p = p;
		const w = `calc(${p / 100} * (100% - 4px))`;
		for ( const b of Q.bars ) b.style.width = w;
	}

	_bind( stack, i ) {
		const hb = this.inv.hotbar;
		for ( let j = 0; j < 9; j ++ ) if ( hb[ j ] === stack.uid ) hb[ j ] = null;
		hb[ i ] = stack.uid;
		this.inv.changed();
		this.audio.ui();
	}

	// ---- keyboard ---------------------------------------------------------------------------------------------------

	_key( e ) {
		if ( this.ui.confirmOpen || ! this.el?.isConnected || this.splitEl ) return; // the split popover has its own keys
		const k = e.code;
		const act = document.activeElement;
		const typing = act?.tagName === 'INPUT' && act.type !== 'range';
		const stop = () => { e.preventDefault(); e.stopPropagation(); };
		const invKey = this.app.input.codes( 'inventory' ).includes( k );
		// an open context menu takes Up / Down / Enter / Esc itself
		if ( this.ctxClose && ! invKey ) return;
		if ( ( e.ctrlKey || e.metaKey ) && k === 'KeyF' ) { stop(); this._openSearch(); return; }
		if ( k === 'Escape' ) {
			stop();
			// Esc mid-drag puts the stack back
			if ( this.drag?.active ) { this._endDrag(); return; }
			// first Esc clears a search, the next one closes
			if ( typing && act.value ) { act.value = ''; act.dispatchEvent( new Event( 'input' ) ); return; }
			if ( this.query ) { this._closeSearch(); return; }
			this.ui.closeScreen();
			return;
		}
		// Tab closes even from a search field; letters type
		if ( invKey && ( ! typing || k === 'Tab' ) ) { stop(); this.ui.closeScreen(); return; }
		if ( typing ) return;
		const el = this.hoverEl, it = el?._it;
		if ( /^Digit[1-9]$/.test( k ) ) {
			if ( it && CARRIED.has( it.loc.type ) ) { stop(); this._bind( it.stack, + k.slice( 5 ) - 1 ); }
			return;
		}
		if ( k === 'Delete' || k === 'Backspace' ) {
			if ( el?._hb != null ) { if ( this.inv.hotbar[ el._hb ] ) { stop(); this.inv.hotbar[ el._hb ] = null; this.inv.changed(); this.audio.ui(); } return; }
			if ( it && ( CARRIED.has( it.loc.type ) || it.loc.type === 'att' ) ) { stop(); this.move( it.stack, it.loc, { type: 'ground' } ); this.dirty = true; }
			return;
		}
		if ( k === 'Space' && it && it.stack.qty > 1 && it.loc.items && ( it.loc.type === 'container' || it.loc.type === 'other' ) ) { stop(); this._split( it.stack, it.loc, el ); }
	}

	// ---- moving stacks (the rules; unchanged apart from the shorter deny texts) ---------------------------------------

	_removeFrom( stack, loc ) {
		const inv = this.inv;
		if ( loc.type === 'equip' ) { if ( inv.equip[ loc.slot ] === stack ) delete inv.equip[ loc.slot ]; }
		else if ( loc.type === 'weapon' ) { if ( inv.weapons[ loc.slot ] === stack ) delete inv.weapons[ loc.slot ]; }
		else if ( loc.type === 'ground' ) { this.game.items3d?.remove?.( loc.worldItem, { taken: true } ); }
		else if ( loc.type === 'att' ) {
			// off the held gun: the magazine out of the well, a fitting off its rail
			const g = loc.gun.data;
			if ( loc.slot === 'mag' ) { if ( g.mag === stack ) g.mag = null; } else if ( g.att?.[ loc.slot ] === stack ) delete g.att[ loc.slot ];
		} else if ( loc.items ) { const i = loc.items.indexOf( stack ); if ( i >= 0 ) loc.items.splice( i, 1 ); }
		if ( inv.hands === stack.uid && ! ( loc.type === 'container' || loc.type === 'weapon' ) ) this.game.hands?.holster?.();
		inv.changed();
		if ( loc.type === 'other' ) this._otherChanged();
	}

	_otherChanged() { if ( this.other ) { this.other.dirty = true; this.game.events.emit( 'container:changed', { container: this.other } ); } }

	// returns true when the stack ended up somewhere
	move( stack, from, to ) {
		const g = this.game, inv = this.inv;
		const def = getItem( stack.id );
		if ( ! def ) return false;
		if ( from.type === to.type && from.slot === to.slot && from.items && from.items === to.items ) return false;
		if ( to.type === 'catalog' ) return false;
		if ( from.type === 'catalog' ) {
			const s = makeStack( stack.id, def.stack > 1 ? def.stack : 1, { full: true } );
			return this._place( s, to ) || true;
		}
		// equipment slots only take matching clothing
		if ( to.type === 'equip' ) {
			const slot = slotOf( def );
			if ( slot !== to.slot ) { this._deny( 'Wrong slot' ); return false; }
			const prev = inv.equip[ to.slot ];
			this._removeFrom( stack, from );
			inv.equip[ to.slot ] = stack;
			if ( prev ) {
				// the previous piece goes where this one came from, else anywhere, else the ground
				if ( ! this._place( prev, from, true ) && inv.add( prev, { autoEquip: false } ) > 0 ) g.dropStack( prev );
			}
			inv.changed();
			this.audio.play( 'zipper', { bus: 'ui', vol: 0.4 } );
			return true;
		}
		if ( to.type === 'weapon' ) {
			if ( ! weaponFits( def, to.slot ) ) { this._deny( 'Wrong slot' ); return false; }
			const prev = inv.weapons[ to.slot ];
			this._removeFrom( stack, from );
			inv.weapons[ to.slot ] = stack;
			if ( prev ) { if ( ! this._place( prev, from, true ) && inv.add( prev, { autoEquip: false } ) > 0 ) g.dropStack( prev ); }
			inv.changed();
			return true;
		}
		if ( to.type === 'ground' ) {
			this._removeFrom( stack, from );
			g.dropStack( stack );
			g.events.emit( 'item:drop', { stack } );
			this.audio.play( 'drop', { vol: 0.4 } );
			this.dirty = true;
			return true;
		}
		// into a container: never into itself
		const items = to.items || to.container?.items;
		if ( ! items ) return false;
		if ( items === from.items ) return false;
		if ( to.container?.owner === stack ) { this._deny( "Can't nest" ); return false; }
		// dry run on copies so nothing moves when it can't fit at all
		const before = stack.qty;
		const probe = JSON.parse( JSON.stringify( stack ) );
		if ( addToItems( items.map( s => ( { ...s, data: s.data } ) ), to.container.capacity, probe ) >= before ) { this._deny( 'No room' ); return false; }
		const wasHeld = inv.hands === stack.uid;
		this._removeFrom( stack, from );
		const left = addToItems( items, to.container.capacity, stack );
		if ( left > 0 ) {
			// the part that didn't fit goes back where it came from (a drag showed 4/6 already)
			if ( ! this._place( stack, from, true ) ) g.dropStack( stack );
			if ( ! this.drag?.active ) this._deny( 'Part fits' );
		}
		if ( wasHeld && inv.findUid( stack.uid ) ) inv.hands = stack.uid;
		if ( from.type === 'ground' ) { g.events.emit( 'item:pick', { stack } ); this.audio.play( 'pickup', { vol: 0.4 } ); }
		if ( from.type === 'other' || to.type === 'other' ) this._otherChanged();
		if ( inv.hands === stack.uid && ! inv.findUid( stack.uid ) ) g.hands?.holster?.();
		inv.changed();
		this.dirty = true;
		return true;
	}

	// put a stack into a location (used for swaps); returns true on success
	_place( stack, loc, swap = false ) {
		const inv = this.inv;
		if ( loc.type === 'equip' ) { if ( inv.equip[ loc.slot ] && ! swap ) return false; const d = getItem( stack.id ); if ( ( d.clothing?.slot || d.backpack?.slot ) !== loc.slot ) return false; inv.equip[ loc.slot ] = stack; return true; }
		if ( loc.type === 'weapon' ) { if ( inv.weapons[ loc.slot ] ) return false; inv.weapons[ loc.slot ] = stack; return true; }
		if ( loc.type === 'ground' ) { this.game.dropStack( stack ); return true; }
		const items = loc.items || loc.container?.items;
		const cap = loc.container?.capacity;
		if ( ! items || cap == null ) return false;
		return addToItems( items, cap, stack ) <= 0;
	}

	_quickMove( stack, loc ) {
		const g = this.game, inv = this.inv;
		if ( loc.type === 'catalog' ) { g.give( stack.id, getItem( stack.id ).stack ); this.dirty = true; return; }
		if ( loc.type === 'ground' || loc.type === 'other' ) {
			const left = inv.add( stack, { autoEquip: loc.type === 'ground' } );
			if ( left <= 0 ) {
				if ( loc.type === 'ground' ) { g.items3d?.remove?.( loc.worldItem, { taken: true } ); g.events.emit( 'item:pick', { stack } ); }
				else { const i = loc.items.indexOf( stack ); if ( i >= 0 ) loc.items.splice( i, 1 ); this._otherChanged(); }
				this.audio.play( 'pickup', { vol: 0.4 } );
			} else this._deny( 'No room' );
			inv.changed();
			this.dirty = true;
			return;
		}
		if ( loc.type === 'att' ) { this._detach( loc ); return; }
		if ( ! CARRIED.has( loc.type ) ) return;
		// from me: into the open container, else onto the ground
		if ( this.other?.items ) this.move( stack, loc, { type: 'other', container: this.other, items: this.other.items } );
		else this.move( stack, loc, { type: 'ground' } );
	}

	// a fitting off the held gun, into the inventory (the hands module drops it when there is no room)
	_detach( loc ) {
		const H = this.game.hands;
		if ( loc.slot === 'mag' ) H?.removeMagazine?.( loc.gun ); else H?.detach?.( loc.gun, loc.slot );
		this.dirty = true;
	}

	_sort() {
		const rank = s => { const d = getItem( s.id ); const i = CAT_ORDER.indexOf( d?.cat ); return i < 0 ? 99 : i; };
		// (biggest first inside a category: the grids pack tighter)
		const vol = s => stackVolume( s );
		for ( const c of this.inv.containers() ) c.items.sort( ( a, b ) => rank( a ) - rank( b ) || vol( b ) - vol( a ) || ( getItem( a.id )?.name || '' ).localeCompare( getItem( b.id )?.name || '' ) );
		this.inv.changed();
		this.audio.ui();
	}

	_takeAll( ground ) {
		const g = this.game, inv = this.inv;
		let n = 0;
		if ( this.other?.items ) for ( const s of [ ...this.other.items ] ) { if ( inv.add( s, { autoEquip: false } ) <= 0 ) { this.other.items.splice( this.other.items.indexOf( s ), 1 ); n ++; } }
		for ( const wi of ground ) { if ( inv.add( wi.stack ) <= 0 ) { g.items3d?.remove?.( wi, { taken: true } ); g.events.emit( 'item:pick', { stack: wi.stack } ); n ++; } }
		if ( this.other ) this._otherChanged();
		if ( n ) this.audio.play( 'pickup', { vol: 0.5 } );
		else this._deny( 'No room' );
		inv.changed();
		this.dirty = true;
	}

	// while dragging the chip already said why: only the sound. Otherwise a short toast.
	_deny( text ) {
		this.audio.ui( 'ui_error', 0.3 );
		if ( ! this.drag?.active ) this.game.toast( text, 'warn' );
	}

	// ---- actions ------------------------------------------------------------------------------------------------------

	_defaultLabel( stack, loc ) {
		const d = getItem( stack.id );
		if ( ! loc || ! d ) return null;
		if ( loc.type === 'catalog' ) return 'Give';
		if ( loc.type === 'ground' || loc.type === 'other' ) return 'Take';
		if ( loc.type === 'att' ) return loc.slot === 'mag' ? 'Eject mag' : 'Detach';
		if ( loc.type === 'equip' ) return 'Take off';
		if ( d.cat === 'clothing' || d.cat === 'backpack' ) return 'Wear';
		if ( d.cat === 'firearm' || d.cat === 'melee' || d.cat === 'throwable' ) return this.inv.hands === stack.uid ? 'Put away' : 'Hold';
		const acts = this.game.itemUse?.actions?.( stack ) || [];
		return acts[ 0 ]?.label || null;
	}

	_default( stack, loc ) {
		const g = this.game, inv = this.inv;
		const d = getItem( stack.id );
		if ( ! d || loc.type === 'catalog' ) return; // single clicks already give
		if ( loc.type === 'ground' || loc.type === 'other' ) { this._quickMove( stack, loc ); return; }
		if ( loc.type === 'att' ) { this._detach( loc ); return; }
		if ( loc.type === 'equip' ) {
			delete inv.equip[ loc.slot ];
			if ( inv.add( stack, { autoEquip: false } ) > 0 ) { g.dropStack( stack ); g.toast( 'Dropped', 'warn' ); }
			inv.changed();
			return;
		}
		if ( d.cat === 'clothing' || d.cat === 'backpack' ) { this.move( stack, loc, { type: 'equip', slot: slotOf( d ) || 'back' } ); return; }
		if ( d.cat === 'firearm' || d.cat === 'melee' || d.cat === 'throwable' ) {
			if ( inv.hands === stack.uid ) g.hands?.holster?.(); else g.hands?.select?.( stack );
			inv.changed();
			return;
		}
		const acts = g.itemUse?.actions?.( stack ) || [];
		if ( acts[ 0 ] ) { acts[ 0 ].run(); this.ui.closeScreen(); }
	}

	_menu( e, el ) {
		if ( this.drag?.active ) return;
		this._hideTip();
		this._closeSplit();
		let items = null;
		if ( el._hb != null ) {
			if ( ! el._it ) return;
			const i = el._hb;
			items = [ { label: 'Unbind', hint: { key: 'Del' }, run: () => { this.inv.hotbar[ i ] = null; this.inv.changed(); this.dirty = true; } } ];
		} else if ( el._it ) items = this._menuItems( el._it.stack, el._it.loc, el );
		if ( ! items?.length ) return;
		el.classList.add( 'sel' );
		this.ctxClose = popMenu( items, { x: e.clientX, y: e.clientY }, { parent: this.el, audio: this.audio, onClose: () => { el.classList.remove( 'sel' ); this.ctxClose = null; } } );
		// the Combine row's list opens beside the row (gone from the page by the time it runs)
		const ci = items.filter( Boolean ).findIndex( it => it.combine );
		const menu = this.el.lastElementChild;
		const row = ci >= 0 && menu?.matches( '.pop.menu' ) ? menu.querySelectorAll( 'button' )[ ci ] : null;
		if ( row ) { const r = row.getBoundingClientRect(); this._comboAt = { x: r.right + 2, y: r.top - 2 }; }
	}

	// context menu rows (6.10): verbs of 1-2 words, key hints on the right
	_menuItems( stack, loc, el ) {
		const g = this.game, inv = this.inv, d = getItem( stack.id ), H = g.hands;
		if ( ! d ) return [];
		const out = [], seen = new Set();
		const add = ( label, run, hint = null, o = {} ) => {
			const [ verb, meta ] = splitLabel( label );
			seen.add( label.toLowerCase() );
			out.push( { label: verb, meta, hint, ...o, run: () => { run(); this.dirty = true; } } );
		};
		const sep = () => { if ( out.length && out[ out.length - 1 ] ) out.push( null ); };
		const uses = () => g.itemUse?.actions?.( stack ) || [];
		// the item-use verbs shown (once: the double-click default is already in), and the mixes they stand for
		// (ItemUse.actions: combos)
		const covered = new Set();
		const addUse = ( a ) => {
			if ( ! seen.has( a.label.toLowerCase() ) ) add( a.label, a.run );
			if ( a.combos ) for ( const c of a.combos ) covered.add( typeof c === 'string' ? c : c.id + '|' + c.other?.uid );
		};
		if ( loc.type === 'catalog' ) {
			add( 'Give 1', () => g.give( stack.id, 1 ), { key: 'LMB' } );
			if ( d.stack !== 5 ) add( 'Give 5', () => g.give( stack.id, 5 ) );
			if ( d.stack > 1 ) add( `Give ${d.stack}`, () => g.give( stack.id, d.stack ), { key: 'Shift' } );
			return out;
		}
		if ( loc.type === 'att' ) {
			// a fitting on the held gun: off it, or straight to the ground
			add( loc.slot === 'mag' ? 'Eject mag' : 'Detach', () => this._detach( loc ), { key: 'LMB 2×' }, { def: true } );
			if ( d.magazine && stack.data.rounds > 0 ) add( 'Unload', () => H?.unloadMagazine?.( stack ) );
			add( 'Drop', () => this.move( stack, loc, { type: 'ground' } ), { key: 'Del' } );
			return out;
		}
		if ( loc.type === 'ground' || loc.type === 'other' ) {
			add( 'Take', () => this._quickMove( stack, loc ), { key: 'Shift' }, { def: true } );
			if ( d.cat === 'clothing' || d.cat === 'backpack' ) add( 'Wear', () => this.move( stack, loc, { type: 'equip', slot: slotOf( d ) || 'back' } ) );
			for ( const a of uses() ) if ( ! /drop/i.test( a.label ) ) addUse( a );
			this._combineRow( stack, add, covered );
			return out;
		}
		if ( ! CARRIED.has( loc.type ) ) return out;
		const def = this._defaultLabel( stack, loc );
		if ( def ) add( def, () => this._default( stack, loc ), { key: 'LMB 2×' }, { def: true } );
		if ( d.firearm ) {
			if ( stack.data.mag ) add( 'Eject mag', () => H?.removeMagazine?.( stack ) );
			if ( ammoOf( stack ) > 0 ) add( 'Unload', () => H?.unloadWeapon?.( stack ) );
			for ( const [ slot, a ] of Object.entries( stack.data.att || {} ) ) if ( a ) add( `Detach ${getItem( a.id )?.name || slot}`, () => H?.detach?.( stack, slot ) );
			const mags = inv.findAll( ( s, dd ) => dd?.magazine && ( d.firearm.mags || [] ).includes( s.id ) );
			if ( mags.length ) add( 'Insert mag', () => H?.insertMagazine?.( stack, [ ...mags ].sort( ( a, b ) => ( b.data.rounds || 0 ) - ( a.data.rounds || 0 ) )[ 0 ] ), String( mags.length ) );
			if ( d.firearm.feed === 'internal' && ( ! ops.internalRoom || ops.internalRoom( stack ) > 0 ) ) {
				const ammo = inv.find( ( s, dd ) => dd?.ammo && dd.ammo.caliber === d.firearm.caliber );
				if ( ammo ) add( 'Load', () => H?.loadWeapon?.( stack, ammo ) );
			}
		}
		if ( d.magazine ) {
			const ammo = inv.find( ( s, dd ) => dd?.ammo && dd.ammo.caliber === d.magazine.caliber );
			if ( ammo && ( stack.data.rounds || 0 ) < d.magazine.capacity ) add( 'Load', () => H?.loadMagazine?.( stack, ammo ) );
			if ( stack.data.rounds > 0 ) add( 'Unload', () => H?.unloadMagazine?.( stack ) );
		}
		if ( d.attachment ) {
			const guns = inv.findAll( ( s, dd ) => dd?.firearm && ( ! ops.attachmentFits || ops.attachmentFits( dd, d ).ok ) );
			for ( const gun of guns.slice( 0, 4 ) ) add( `Attach to ${getItem( gun.id ).name}`, () => H?.attach?.( gun, stack ) );
		}
		for ( const a of uses() ) if ( ! /^drop$/i.test( a.label ) ) addUse( a );
		this._combineRow( stack, add, covered );
		sep();
		if ( inv.hands === stack.uid ) { if ( ! seen.has( 'put away' ) ) add( 'Put away', () => H?.holster?.() ); }
		else if ( loc.type !== 'equip' && ! seen.has( 'hold' ) ) add( 'Hold', () => H?.select?.( stack ) );
		const hb = inv.hotbar.indexOf( stack.uid );
		if ( hb >= 0 ) add( 'Unbind', () => { inv.hotbar[ hb ] = null; inv.changed(); }, { key: String( hb + 1 ) } );
		else add( 'Bind', () => { const i = inv.hotbar.findIndex( x => ! x ); if ( i >= 0 ) this._bind( stack, i ); else this._deny( 'Hotbar full' ); }, { key: '1–9' } );
		if ( stack.qty > 1 && loc.items ) add( 'Split', () => this._split( stack, loc, el ), { key: 'Space' } );
		if ( this.other?.items ) add( `Move to ${this.other.label || 'container'}`, () => this._quickMove( stack, loc ), { key: 'Shift' } );
		add( 'Drop', () => this.move( stack, loc, { type: 'ground' } ), { key: 'Del' } );
		if ( g.mode === 'creative' ) { sep(); add( 'Delete', () => this._removeFrom( stack, loc ), null, { danger: true } ); }
		return out;
	}

	// split popover (6.11): slider + amount, ½ and Split; Enter confirms, Esc cancels, Up / Down step (Shift: 10)
	_split( stack, loc, anchor ) {
		this._closeSplit();
		const max = stack.qty - 1, half = Math.floor( stack.qty / 2 );
		if ( max < 1 ) return;
		if ( max === 1 ) { this._doSplit( stack, loc, 1 ); return; } // a pair: nothing to choose
		const clampN = v => Math.max( 1, Math.min( max, Math.round( + v || 1 ) ) );
		const num = h( 'input.input', { type: 'number', min: 1, max, step: 1, value: half, 'aria-label': 'Amount' } );
		const [ sl ] = slider( { min: 1, max, value: half, onInput: v => { num.value = v; } } );
		sl.setAttribute( 'aria-label', 'Amount' );
		num.addEventListener( 'input', () => { if ( num.value !== '' ) sl.set( clampN( num.value ) ); } );
		const set = v => { v = clampN( v ); sl.set( v ); num.value = v; };
		const ok = () => { const n = clampN( num.value ); this._closeSplit(); this._doSplit( stack, loc, n ); };
		const el = h( 'div.pop.split-pop', { role: 'dialog', 'aria-label': 'Split' },
			h( 'div.ttl', { text: 'Split' } ),
			h( 'div.r1', {}, sl, num ),
			h( 'div.r2', {}, h( 'button.btn.sm', { type: 'button', text: '½', title: 'Half', onclick: () => { set( half ); num.focus(); } } ), h( 'button.btn.sm.primary', { type: 'button', text: 'Split', onclick: ok } ) ) );
		const key = e => {
			if ( e.code === 'Escape' ) this._closeSplit();
			else if ( e.code === 'Enter' || e.code === 'NumpadEnter' ) ok();
			else if ( e.code === 'ArrowUp' || e.code === 'ArrowDown' ) set( clampN( num.value ) + ( e.code === 'ArrowUp' ? 1 : - 1 ) * ( e.shiftKey ? 10 : 1 ) );
			else return;
			e.preventDefault(); e.stopPropagation();
		};
		window.addEventListener( 'keydown', key, true );
		this.splitEl = el;
		this.splitKey = key;
		this.splitAnchor = anchor;
		anchor.classList.add( 'sel' );
		this.el.appendChild( el );
		const r = anchor.getBoundingClientRect();
		placePop( el, r.left, r.bottom + 4, { flipY: r.top - 4 } );
		this._hideTip();
		num.focus();
		num.select();
	}

	_closeSplit() {
		if ( ! this.splitEl ) return;
		window.removeEventListener( 'keydown', this.splitKey, true );
		this.splitEl.remove();
		this.splitEl = null;
		this.splitAnchor?.classList.remove( 'sel' );
		this.splitAnchor = null;
	}

	_doSplit( stack, loc, n ) {
		if ( ! loc.items?.includes( stack ) || n < 1 || n >= stack.qty ) return;
		const before = containerVolume( loc.items );
		const part = JSON.parse( JSON.stringify( stack ) );
		part.uid = stack.uid + 's' + Math.random().toString( 36 ).slice( 2, 5 );
		part.qty = n;
		stack.qty -= n;
		loc.items.push( part );
		// two partial stacks can take more room than one full one
		const cap = loc.container?.capacity;
		if ( cap && containerVolume( loc.items ) > Math.max( cap, before ) + 1e-6 ) { loc.items.pop(); stack.qty += n; this._deny( 'No room' ); return; }
		if ( loc.type === 'other' ) this._otherChanged();
		this.inv.changed();
		this.audio.ui();
		this.dirty = true;
	}

	// ---- craft and catalog tabs -------------------------------------------------------------------------------------

	_craft() {
		const g = this.game, C = g.crafting, inv = this.inv;
		const wrap = h( 'div.craft' );
		wrap.appendChild( seg( [ [ 'all', 'All' ], [ 'ready', 'Ready' ] ], this.craftFilter, v => { this.craftFilter = v; this.render(); }, { audio: this.audio } ) );
		const b = C.boilable?.();
		const ctx = {
			fire: !! g.nearFire?.( g.player.pos ),
			boilL: Array.isArray( b ) ? b.reduce( ( a, s ) => a + ( s.data?.amount || 0 ), 0 ) : 0,
			hasTool: t => !! ( C.hasTool ? C.hasTool( t ) : inv.hasTool( t ) ),
		};
		const groups = new Map();
		for ( const r of C.recipes || [] ) {
			const can = !! C.canCraft( r );
			if ( this.craftFilter === 'ready' && ! can ) continue;
			const k = r.cat || 'survival';
			if ( ! groups.has( k ) ) groups.set( k, [] );
			groups.get( k ).push( { r, can } );
		}
		for ( const k of [ ...CRAFT_CATS, ...[ ...groups.keys() ].filter( k => ! CRAFT_CATS.includes( k ) ) ] ) {
			const list = groups.get( k );
			if ( ! list?.length ) continue;
			list.sort( ( a, b2 ) => ( b2.can - a.can ) || a.r.name.localeCompare( b2.r.name ) );
			wrap.appendChild( h( 'div.sect-h.static', {}, h( 'span.nm', { text: cap1( k ) } ), h( 'span.cap', { text: String( list.length ) } ) ) );
			for ( const { r, can } of list ) wrap.appendChild( this._recipe( r, can, ctx ) );
		}
		return wrap;
	}

	// a recipe row: output render, name (×n), requirement chips (have/need, tools, fire, liquid), Craft
	_recipe( r, can, ctx ) {
		const C = this.game.crafting, inv = this.inv;
		const out = h( 'img', { alt: '', draggable: false } );
		setIcon( out, r.out[ 0 ] );
		out._tipStack = tipStack( r.out[ 0 ] );
		const reqs = h( 'div.reqs' );
		// ingredient: render, name, have/need (the count turns red when short); the tooltip has the rest
		for ( const [ id, q ] of r.in ) {
			const have = inv.count( id );
			const img = h( 'img', { alt: '', draggable: false } );
			setIcon( img, id );
			const chip = h( 'span.chip.req.ing' + ( have < q ? '.short' : '' ), {}, img, h( 'span.nm', { text: getItem( id )?.name || id } ), h( 'span.n', { text: `${have}/${q}` } ) );
			chip._tipStack = tipStack( id );
			reqs.appendChild( chip );
		}
		// tools by their plain name (Crafting's toolLabels: 'blade', 'cooking pot'), the station from r.station
		( r.tools || [] ).forEach( ( t, i ) => reqs.appendChild( h( 'span.chip.req.txt' + ( ctx.hasTool( t ) ? '' : '.miss' ), { text: cap1( r.toolLabels?.[ i ] || TOOL_WORD[ t ] || t ) } ) ) );
		if ( r.station ) {
			const fire = r.station === 'fire';
			reqs.appendChild( h( 'span.chip.req' + ( fire && ! ctx.fire ? '.miss' : '' ), {}, icon( fire ? 'flame' : 'wrench' ), h( 'span', { text: fire ? 'Fire' : cap1( r.station ) } ) ) );
		}
		if ( r.liquid ) {
			const miss = ( C.liquidAvailable?.( r.liquid.kind ) || 0 ) < r.liquid.litres - 1e-6;
			reqs.appendChild( h( 'span.chip.req' + ( miss ? '.miss' : '' ), {}, icon( r.liquid.kind === 'fuel' ? 'fuel' : 'water' ), h( 'span', { text: `${r.liquid.litres} L` } ) ) );
		}
		if ( r.special === 'boil' ) reqs.appendChild( h( 'span.chip.req' + ( ctx.boilL > 0 ? '' : '.miss' ), {}, icon( 'water' ), h( 'span', { text: `${ctx.boilL.toFixed( 1 )} L` } ) ) );
		const btn = h( 'button.btn.sm' + ( can ? '.primary' : '' ), { type: 'button', text: 'Craft', disabled: ! can,
			// close so the action ring is visible
			onclick: () => { if ( C.craft( r ) !== false ) this.ui.closeScreen(); } } );
		return h( 'div.recipe' + ( can ? '' : '.no' ), {}, out,
			h( 'div', {}, h( 'div.nm', {}, r.name, r.out[ 1 ] > 1 ? h( 'span.x', { text: '×' + r.out[ 1 ] } ) : null ), reqs ), btn );
	}

	// creative catalog: search (count inside), one scrolling row of categories, up to 400 cells. Built once
	// per visit to the tab so typing and giving items don't rebuild it.
	_catalog() {
		if ( this.catEl ) return this.catEl;
		const count = h( 'span.count' );
		const input = this.catInput = h( 'input.input', { type: 'text', placeholder: 'Search', value: this.search, spellcheck: false, autocomplete: 'off', 'aria-label': 'Search' } );
		const grid = h( 'div.grid' );
		const present = new Set( [ ...ITEMS.values() ].map( d => d.cat ) );
		const cats = [ ...CAT_ORDER.filter( c => present.has( c ) ), ...[ ...present ].filter( c => ! CAT_ORDER.includes( c ) ) ];
		const rank = d => { const i = CAT_ORDER.indexOf( d.cat ); return i < 0 ? 99 : i; };
		const all = [ ...ITEMS.values() ].sort( ( a, b ) => rank( a ) - rank( b ) || a.name.localeCompare( b.name ) );
		const draw = () => {
			const q = this.search.trim().toLowerCase();
			const list = all.filter( d => ( this.catFilter === 'all' || d.cat === this.catFilter ) && ( ! q || d.name.toLowerCase().includes( q ) || d.id.includes( q ) ) );
			count.textContent = String( list.length );
			clear( grid );
			for ( const d of list.slice( 0, 400 ) ) grid.appendChild( this._cell( { uid: 'cat:' + d.id, id: d.id, qty: 1, cond: 1, data: {} }, { type: 'catalog' } ) );
			this._applyQuery();
		};
		const chips = seg( [ [ 'all', 'All' ], ...cats.map( c => [ c, CATEGORY_LABEL[ c ] || cap1( c ) ] ) ], this.catFilter, v => { this.catFilter = v; draw(); }, { audio: this.audio } );
		chips.classList.add( 'cat-seg' );
		// a vertical wheel scrolls the category row sideways
		chips.addEventListener( 'wheel', e => { if ( Math.abs( e.deltaY ) > Math.abs( e.deltaX ) ) { chips.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false } );
		input.addEventListener( 'input', () => { this.search = input.value; draw(); } );
		draw();
		this.catEl = h( 'div.catalog', {}, h( 'div.search', {}, icon( 'search' ), input, count ), chips, grid );
		requestAnimationFrame( () => {
			if ( this.leftTab !== 'catalog' || ! input.isConnected ) return;
			input.focus();
			chips.querySelector( '.on' )?.scrollIntoView( { block: 'nearest', inline: 'nearest' } );
		} );
		return this.catEl;
	}
}

// helpers kept for other UI code
export { itemsOf, capacityOf, containerWeight };
