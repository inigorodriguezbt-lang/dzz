// Full-screen map (docs/UI_SPEC.md 8.1), a paper map like DayZ's. Drag or W A S D / arrows pan, the wheel zooms at
// the cursor, + and − zoom, C centres; double-click drops a numbered marker; right-click opens a menu for the
// marker or the spot under the cursor. Tools on the right: zoom, centre, all islands, a layers popover and a
// marker list. With "Map and compass: Need item" (realisticMap) the map shows where you are only while you carry a
// GPS with charge left, as DayZ does: no arrow, no place name, no centring on yourself.
import { h, fmtDist, kc } from './dom.js';
import { icon } from './icons.js';
import { toggle, popMenu, placePop } from './widgets.js';
import { drawGlyph } from './canvasIcons.js';

const MAX_PPM = 2; // px per metre: past this the 4 m relief tiles only get blurrier (8 px per texel)
const PAN = 600; // keyboard pan, px/s
// inks on the paper (MapView INK): markers are small dark squares, the death marker red
const INK = '#1A1612', PAPER = 'rgba(244,238,220,0.95)', ALARM = '#C33A32';
const LABEL_FONT = "700 13px 'Roboto Condensed', Roboto, system-ui, sans-serif"; // 13u; px scaled by u where used
const LAYERS = [ [ 'roads', 'Roads' ], [ 'buildings', 'Buildings' ], [ 'grid', 'Grid' ], [ 'markers', 'Markers' ], [ 'vehicles', 'Vehicles' ] ];
const PAN_KEYS = { ArrowUp: [ 0, - 1 ], ArrowDown: [ 0, 1 ], ArrowLeft: [ - 1, 0 ], ArrowRight: [ 1, 0 ] };
const MINUS = '−';

const hhmm = hr => { hr = ( ( hr % 24 ) + 24 ) % 24; const a = Math.floor( hr ), m = Math.floor( ( hr - a ) * 60 ); return String( a ).padStart( 2, '0' ) + ':' + String( m ).padStart( 2, '0' ); };
const signed = v => ( v < 0 ? MINUS : '' ) + Math.abs( Math.round( v ) );
const nice = m => [ 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000 ].find( v => v >= m ) || 20000;

export class MapUI {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this.view = null; // { cx, cz, ppm }: the zoom survives closing, the centre snaps back to the player
		this.goal = null; // animated move for the tools, keys and the marker list
		this.layers = { roads: true, buildings: true, grid: true, markers: true, vehicles: true };
		this.keys = new Set();
		this.el = null;
	}

	// ---- open / close -------------------------------------------------------------------------------------

	open() {
		const g = this.ui.game, me = this._me(), input = this.app.input;
		this.known = this._knows();
		// it opens on you when it can show you; otherwise where it was last left (all the islands the first time)
		if ( ! this.view ) this.view = this.known ? { cx: me.x, cz: me.z, ppm: 0.06 } : { cx: 0, cz: 0, ppm: 0 };
		else if ( this.known ) { this.view.cx = me.x; this.view.cz = me.z; }
		this.goal = null;
		this.keys.clear();
		this.ptr = null;
		this._sig = '';
		this._scaleLen = this._count = null; // new elements: the scale bar and the marker count are set afresh
		const canvas = this.canvas = h( 'canvas' );
		this.titleName = h( 'div.t-title' );
		this.titleSub = h( 'div.t-label' );
		const title = this.titleEl = h( 'div.map-title.plate', {}, this.titleName, this.titleSub );
		const close = this.closeEl = h( 'div.map-close.plate', {}, kc( input.label( 'map' ), 'out' ),
			h( 'button.btn.icon', { type: 'button', title: 'Close', 'aria-label': 'Close', onclick: () => this.ui.closeScreen() }, icon( 'close' ) ) );
		// a mouse click drops focus, so the map keys (W A S D, + −) don't then ring the last tool clicked
		const tool = ( name, label, fn ) => h( 'button.btn.icon', { type: 'button', title: label, 'aria-label': label, onclick: e => { fn(); if ( e.detail ) e.currentTarget.blur(); } }, icon( name ) );
		this.btnLayers = tool( 'layers', 'Layers', () => this._layersPop() );
		this.btnMarkers = tool( 'pin', 'Markers', () => this._markersPop() );
		this.btnMarkers.append( this.markCount = h( 'span.badge' ) );
		this.btnCentre = tool( 'locate', 'Centre (C)', () => this._centre() );
		this.tools = h( 'div.map-tools.plate', {},
			tool( 'plus', 'Zoom in (+)', () => this._zoomBy( 1.5 ) ), tool( 'minus', `Zoom out (${MINUS})`, () => this._zoomBy( 1 / 1.5 ) ), h( 'hr' ),
			this.btnCentre, tool( 'fit', 'All islands', () => this._fit() ), h( 'hr' ),
			this.btnLayers, this.btnMarkers );
		this.scaleLab = h( 'div.lab' );
		this.scaleBar = h( 'div.bar' );
		const scale = this.scaleEl = h( 'div.map-scale', {}, this.scaleLab, this.scaleBar );
		this.readout = h( 'div.map-readout.plate', { hidden: true } );
		this.chip = h( 'div.teleport-chip.t-label', { hidden: true, text: 'Teleport' } );
		const el = this.el = h( 'div.map-screen', {}, canvas, h( 'div.map-paper' ), title, close, this.tools, scale, this.readout, this.chip );

		let drag = null;
		canvas.addEventListener( 'pointerdown', e => {
			if ( e.button !== 0 ) return;
			if ( e.shiftKey && this._creative() ) { this._teleport( ...this._toWorld( e.offsetX, e.offsetY ) ); return; }
			drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz };
			this.goal = null;
			el.classList.add( 'map-drag' );
			canvas.setPointerCapture( e.pointerId );
		} );
		canvas.addEventListener( 'pointermove', e => {
			this.ptr = { x: e.offsetX, y: e.offsetY, shift: e.shiftKey };
			if ( drag ) {
				this.view.cx = drag.cx - ( e.clientX - drag.x ) / this.view.ppm;
				this.view.cz = drag.cz - ( e.clientY - drag.y ) / this.view.ppm;
			}
			this._pointer();
		} );
		const end = () => { drag = null; el.classList.remove( 'map-drag' ); };
		canvas.addEventListener( 'pointerup', end );
		canvas.addEventListener( 'pointercancel', end );
		canvas.addEventListener( 'pointerleave', () => { this.ptr = null; this._pointer(); } );
		canvas.addEventListener( 'dblclick', e => {
			const m = this._markerAt( e.offsetX, e.offsetY );
			if ( m ) { this._rename( m ); return; }
			this._addMarker( ...this._toWorld( e.offsetX, e.offsetY ) );
		} );
		canvas.addEventListener( 'wheel', e => {
			e.preventDefault();
			this.goal = null;
			const [ wx, wz ] = this._toWorld( e.offsetX, e.offsetY );
			this.view.ppm = this._clamp( this.view.ppm * Math.pow( 1.0015, - e.deltaY ) );
			// keep the point under the cursor fixed
			const [ nx, nz ] = this._toWorld( e.offsetX, e.offsetY );
			this.view.cx += wx - nx; this.view.cz += wz - nz;
		}, { passive: false } );
		el.addEventListener( 'contextmenu', e => {
			e.preventDefault();
			if ( e.target !== canvas ) return;
			this._context( e.offsetX, e.offsetY, e.clientX, e.clientY );
		} );
		this.onKey = e => this._key( e, true );
		this.onKeyUp = e => this._key( e, false );
		this.onBlur = () => this.keys.clear();
		addEventListener( 'keydown', this.onKey );
		addEventListener( 'keyup', this.onKeyUp );
		addEventListener( 'blur', this.onBlur );
		this.ui.show( el, { map: true, onClose: () => this._closed() } );
		this._resize();
		if ( ! this.view.ppm ) { this.view.ppm = this._fitPpm(); }
		this._title( true );
		this.update( 0 );
	}

	// whether the map may show where you are (and so centre on you): always, unless the realistic rule is on and
	// you carry no GPS with charge left
	_knows() {
		const g = this.ui.game;
		if ( ! this.app.settings.get( 'realisticMap' ) || g.mode === 'creative' ) return true;
		return !! g.player.inventory.find( s => s.id === 'gps' && s.data?.charge > 0 );
	}

	_closed() {
		// UI closes the map on the Map key in its capture listener; Input then queues the same key in the bubble
		// phase and the next frame's hotkey check would open the map again. Drop it after Input has seen it.
		const input = this.app.input, eat = e => { if ( input.codes( 'map' ).includes( e.code ) ) input.pressedQ.delete( e.code ); };
		addEventListener( 'keydown', eat, { once: true } );
		setTimeout( () => removeEventListener( 'keydown', eat ), 0 );
		removeEventListener( 'keydown', this.onKey );
		removeEventListener( 'keyup', this.onKeyUp );
		removeEventListener( 'blur', this.onBlur );
		this._closePop();
		this.menuClose?.();
		this.renameEl?.remove();
		this.renameEl = null;
		this.ui.confirmOpen = false;
		this.keys.clear();
		this.el = null;
	}

	// ---- view ---------------------------------------------------------------------------------------------

	_me() {
		const g = this.ui.game;
		return g.player.vehicle && g.vehicles?.driving ? g.vehicles.driving.pos : g.player.pos;
	}

	_creative() { return this.ui.game?.mode === 'creative'; }

	_resize() {
		const dpr = Math.min( 2, devicePixelRatio || 1 );
		this.dpr = dpr;
		this.W = innerWidth; this.H = innerHeight;
		this.canvas.width = Math.round( this.W * dpr ); this.canvas.height = Math.round( this.H * dpr );
		this._sig = '';
	}

	// the whole archipelago fills the window; zooming out further only shows more ocean
	_fitPpm() {
		const m = this.app.world.meta;
		return Math.min( this.W / ( m.halfX * 2.05 ), this.H / ( m.halfZ * 2.05 ) );
	}

	_clamp( ppm ) { return Math.max( this._fitPpm() * 0.8, Math.min( MAX_PPM, ppm ) ); }

	_toWorld( sx, sy ) { const v = this.view; return [ v.cx + ( sx - this.W / 2 ) / v.ppm, v.cz + ( sy - this.H / 2 ) / v.ppm ]; }
	_toScreen( x, z ) { const v = this.view; return [ this.W / 2 + ( x - v.cx ) * v.ppm, this.H / 2 + ( z - v.cz ) * v.ppm ]; }

	_goTo( cx, cz, ppm = this.view.ppm ) { this.goal = { cx, cz, ppm: this._clamp( ppm ) }; }
	_zoomBy( f ) { const b = this.goal || this.view; this._goTo( b.cx, b.cz, b.ppm * f ); }
	_centre() { if ( ! this.known ) return; const me = this._me(); this._goTo( me.x, me.z, Math.max( this.view.ppm, 0.06 ) ); }
	_fit() { this._goTo( 0, 0, this._fitPpm() ); }

	// ---- input --------------------------------------------------------------------------------------------

	_key( e, down ) {
		if ( e.code === 'ShiftLeft' || e.code === 'ShiftRight' ) { if ( this.ptr ) { this.ptr.shift = down; this._pointer(); } return; }
		if ( ! down ) { this.keys.delete( e.code ); return; }
		if ( this.ui.confirmOpen || /^(INPUT|TEXTAREA)$/.test( e.target?.tagName ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		const c = e.code, I = this.app.input;
		if ( PAN_KEYS[ c ] || [ 'forward', 'back', 'left', 'right' ].some( a => I.codes( a ).includes( c ) ) ) { this.keys.add( c ); e.preventDefault(); }
		else if ( c === 'Equal' || c === 'NumpadAdd' ) this._zoomBy( 1.5 );
		else if ( c === 'Minus' || c === 'NumpadSubtract' ) this._zoomBy( 1 / 1.5 );
		else if ( c === 'KeyC' ) this._centre();
	}

	// readout, hover cursor and the creative teleport chip for the current pointer
	_pointer() {
		const p = this.ptr;
		if ( ! this.el ) return;
		const tele = !! p?.shift && this._creative();
		this.chip.hidden = ! tele;
		this.el.classList.toggle( 'map-tele', tele );
		if ( ! p ) return;
		if ( tele ) { this.chip.style.left = p.x + 14 * this.ui.u + 'px'; this.chip.style.top = p.y + 14 * this.ui.u + 'px'; }
		this.el.classList.toggle( 'map-hot', ! tele && !! this._markerAt( p.x, p.y ) );
		const [ x, z ] = this._toWorld( p.x, p.y ), me = this._me();
		const hgt = this.app.world.hf.baseHeight( x, z );
		// elevation in real metres (the terrain is baked at 1/6 height); distance in game metres like the scale bar,
		// only when the map knows where you are
		const text = `${signed( x )}, ${signed( z )} · ${signed( hgt * 6 )} m` + ( this.known ? ` · ${fmtDist( Math.hypot( x - me.x, z - me.z ) )}` : '' );
		if ( this.readout.textContent !== text ) this.readout.textContent = text;
		if ( this.readout.hidden ) { this.readout.hidden = false; this._sig = ''; } // labels now keep clear of it
	}

	_context( sx, sy, cx, cy ) {
		const g = this.ui.game, m = this._markerAt( sx, sy );
		const items = m
			? [ { label: 'Rename', run: () => this._rename( m ) }, { label: 'Remove', danger: true, run: () => g.markers.remove( m.id ) } ]
			: [ { label: 'Add marker', run: () => this._addMarker( ...this._toWorld( sx, sy ) ) },
				this._creative() ? { label: 'Teleport', hint: { key: 'Shift' }, run: () => this._teleport( ...this._toWorld( sx, sy ) ) } : null ].filter( Boolean );
		this._closePop();
		this.menuClose?.();
		this.menuClose = popMenu( items, { x: cx, y: cy }, { audio: this.app.audio, onClose: () => { this.menuClose = null; this._modal( false ); } } );
		this._modal( true );
	}

	// UI's Esc handler closes the whole screen; while a popover or menu is up it must close only that
	_modal( on ) { this.ui.confirmOpen = on || !! this.popEl || !! this.menuClose || !! this.renameEl; }

	_teleport( x, z ) {
		this.ui.game.commands?.teleport( x, null, z );
		this.app.audio.ui();
		this.ui.closeScreen();
	}

	// ---- markers ------------------------------------------------------------------------------------------

	_addMarker( x, z ) {
		const g = this.ui.game;
		// numbered 1, 2, 3 … after the highest number in use
		const n = g.markers.list().reduce( ( a, m ) => m.kind === 'user' && /^\d+$/.test( m.label ) ? Math.max( a, + m.label ) : a, 0 ) + 1;
		const m = g.markers.add( { x, z, label: String( n ), kind: 'user' } );
		this.app.audio.ui();
		if ( this.popEl?.classList.contains( 'marks' ) ) this._fillMarkers();
		return m;
	}

	// the marker whose glyph (or name, where it is shown) is under the point
	_markerAt( sx, sy ) {
		if ( ! this.layers.markers ) return null;
		const g = this.ui.game;
		const shown = this._placeMarkers( g.markers.list(), this._meRect(), this.ui.u || 1 );
		for ( let k = shown.length - 1; k >= 0; k -- ) {
			const r = shown[ k ].rect;
			if ( sx >= r[ 0 ] && sx <= r[ 2 ] && sy >= r[ 1 ] && sy <= r[ 3 ] ) return shown[ k ].m;
		}
		return null;
	}

	// screen rect of the player disc (nothing to keep clear of when the player isn't shown)
	_meRect() {
		if ( ! this.known ) return [ - 1e4, - 1e4, - 1e4, - 1e4 ];
		const u = this.ui.u || 1, me = this._me(), [ px, py ] = this._toScreen( me.x, me.z );
		return [ px - 14 * u, py - 14 * u, px + 14 * u, py + 14 * u ];
	}

	_labelWidth( text ) {
		const ctx = this.canvas.getContext( '2d' );
		ctx.font = LABEL_FONT.replace( '13px', 13 * this.ui.u + 'px' );
		return ctx.measureText( text ).width;
	}

	// inline rename on the map, over the marker's label
	_rename( m ) {
		this.menuClose?.();
		this.renameEl?.remove();
		const u = this.ui.u, [ x, y ] = this._toScreen( m.x, m.z );
		const inp = h( 'input.input', { value: m.label, maxLength: 32, spellcheck: false, autocomplete: 'off', 'aria-label': 'Marker name' } );
		const box = this.renameEl = h( 'div.pop.map-rename', {}, inp );
		this.ui.root.appendChild( box );
		placePop( box, x + 6 * u, y - 16 * u );
		let done = false;
		const finish = save => {
			if ( done ) return;
			done = true;
			const v = inp.value.trim();
			if ( save && v ) m.label = v;
			box.remove();
			if ( this.renameEl === box ) this.renameEl = null;
			this._modal( false );
			this._sig = '';
		};
		inp.addEventListener( 'keydown', e => {
			if ( e.code === 'Enter' || e.code === 'NumpadEnter' ) finish( true );
			else if ( e.code === 'Escape' ) finish( false );
			else return;
			e.preventDefault(); e.stopPropagation();
		} );
		inp.addEventListener( 'blur', () => finish( true ) );
		this._modal( true );
		inp.focus(); inp.select();
	}

	// ---- popovers -----------------------------------------------------------------------------------------

	_pop( anchor, cls, fill ) {
		const same = this.popAnchor === anchor;
		this._closePop();
		this.menuClose?.();
		if ( same ) return;
		const el = this.popEl = h( 'div.pop.map-pop.' + cls, { role: 'dialog' } );
		this.popAnchor = anchor;
		this.popFill = fill;
		anchor.classList.add( 'on' );
		this.ui.root.appendChild( el );
		fill();
		this._placePop();
		this.popOut = e => { if ( ! el.contains( e.target ) && ! anchor.contains( e.target ) && e.target !== this.renameEl && ! this.renameEl?.contains( e.target ) ) this._closePop(); };
		this.popKey = e => {
			if ( /^(INPUT|TEXTAREA)$/.test( e.target?.tagName ) ) return; // an inline rename handles its own keys
			if ( e.code === 'Escape' ) { e.preventDefault(); e.stopImmediatePropagation(); this._closePop(); }
			else if ( this.app.input.codes( 'map' ).includes( e.code ) ) { e.preventDefault(); e.stopImmediatePropagation(); this.ui.closeScreen(); }
		};
		addEventListener( 'pointerdown', this.popOut, true );
		addEventListener( 'keydown', this.popKey, true );
		this._modal( true );
		this.app.audio.ui();
	}

	// left of the tool stack, top-aligned with its button (under it would cover the rest of the stack)
	_placePop() {
		const el = this.popEl, a = this.popAnchor?.getBoundingClientRect(), t = this.tools.getBoundingClientRect();
		if ( ! el || ! a ) return;
		const w = el.getBoundingClientRect().width;
		placePop( el, t.left - 8 * this.ui.u - w, a.top - 4 * this.ui.u, { flipY: a.bottom + 4 * this.ui.u } );
	}

	_closePop() {
		if ( ! this.popEl ) return;
		this.popEl.remove();
		this.popAnchor?.classList.remove( 'on' );
		removeEventListener( 'pointerdown', this.popOut, true );
		removeEventListener( 'keydown', this.popKey, true );
		this.popEl = this.popAnchor = this.popFill = null;
		this._modal( false );
	}

	_layersPop() {
		this._pop( this.btnLayers, 'layers', () => {
			this.popEl.replaceChildren( ...LAYERS.map( ( [ k, label ] ) => {
				const t = toggle( this.layers[ k ], v => { this.layers[ k ] = v; }, { audio: this.app.audio } );
				t.setAttribute( 'aria-label', label );
				return h( 'div.prow', { onclick: e => { if ( ! t.contains( e.target ) ) t.click(); } }, h( 'span.lab', { text: label } ), t );
			} ) );
		} );
	}

	_markersPop() {
		if ( ! this.ui.game.markers.list().length ) return;
		this._pop( this.btnMarkers, 'marks', () => this._fillMarkers() );
	}

	// marker list: the death marker first, then by distance (in placing order when the map can't show you); click
	// centres, double-click renames
	_fillMarkers() {
		const g = this.ui.game, me = this._me(), el = this.popEl, known = this.known;
		const list = g.markers.list().map( m => ( { m, d: known ? Math.hypot( m.x - me.x, m.z - me.z ) : 0 } ) )
			.sort( ( a, b ) => ( b.m.kind === 'death' ) - ( a.m.kind === 'death' ) || a.d - b.d );
		if ( ! list.length ) { this._closePop(); return; }
		const rows = list.map( ( { m, d } ) => {
			const glyph = m.kind === 'death' ? icon( 'skull', 16, 'mk-death' ) : h( 'span.mk-sq' + ( m.kind === 'locate' ? '.loc' : '' ) );
			const lab = h( 'span.lab', { text: m.label } );
			const rm = h( 'button.btn.icon.sm.rm', { type: 'button', title: 'Remove', 'aria-label': 'Remove', onclick: e => { e.stopPropagation(); g.markers.remove( m.id ); this.app.audio.ui(); this._fillMarkers(); } }, icon( 'close' ) );
			const row = h( 'div.prow', { tabIndex: 0,
				onclick: e => { if ( e.target.tagName !== 'INPUT' ) this._goTo( m.x, m.z, Math.max( this.view.ppm, 0.2 ) ); },
				ondblclick: e => { if ( e.target.tagName !== 'INPUT' ) this._renameRow( m, lab ); },
				onkeydown: e => { if ( e.target !== row ) return; if ( e.code === 'Enter' ) row.click(); else if ( e.code === 'F2' ) this._renameRow( m, lab ); else if ( e.code === 'Delete' ) rm.click(); else return; e.preventDefault(); } },
			glyph, lab, known ? h( 'span.v', { text: fmtDist( d ) } ) : null, rm );
			return row;
		} );
		const clearable = list.some( o => o.m.kind !== 'death' );
		el.replaceChildren( h( 'div.list', {}, ...rows ),
			clearable ? h( 'div.foot', {}, h( 'button.btn.ghost.sm', { type: 'button', text: 'Clear', onclick: () => { g.markers.clear(); this.app.audio.ui(); this._fillMarkers(); } } ) ) : null );
		this._placePop();
	}

	_renameRow( m, lab ) {
		const inp = h( 'input.input', { value: m.label, maxLength: 32, spellcheck: false, autocomplete: 'off', 'aria-label': 'Marker name' } );
		lab.replaceWith( inp );
		let done = false;
		const finish = save => {
			if ( done ) return;
			done = true;
			const v = inp.value.trim();
			if ( save && v ) m.label = v;
			lab.textContent = m.label;
			inp.replaceWith( lab );
			this._sig = '';
		};
		inp.addEventListener( 'keydown', e => {
			if ( e.code === 'Enter' || e.code === 'NumpadEnter' ) finish( true );
			else if ( e.code === 'Escape' ) finish( false );
			else return;
			e.preventDefault(); e.stopPropagation();
		} );
		inp.addEventListener( 'blur', () => finish( true ) );
		inp.focus(); inp.select();
	}

	// ---- per frame ----------------------------------------------------------------------------------------

	update( dt ) {
		if ( ! this.el?.isConnected ) return;
		dt = Math.min( dt, 0.1 );
		const v = this.view, I = this.app.input;
		if ( Math.round( innerWidth * this.dpr ) !== this.canvas.width || Math.round( innerHeight * this.dpr ) !== this.canvas.height || Math.min( 2, devicePixelRatio || 1 ) !== this.dpr ) this._resize();
		// keyboard pan
		if ( this.keys.size ) {
			let dx = 0, dz = 0;
			for ( const c of this.keys ) {
				const d = PAN_KEYS[ c ] || ( I.codes( 'forward' ).includes( c ) ? [ 0, - 1 ] : I.codes( 'back' ).includes( c ) ? [ 0, 1 ] : I.codes( 'left' ).includes( c ) ? [ - 1, 0 ] : I.codes( 'right' ).includes( c ) ? [ 1, 0 ] : null );
				if ( d ) { dx += d[ 0 ]; dz += d[ 1 ]; }
			}
			if ( dx || dz ) {
				const k = PAN * this.ui.u * dt / v.ppm / Math.hypot( dx, dz );
				v.cx += dx * k; v.cz += dz * k;
				this.goal = null;
			}
		}
		// eased moves: centre linearly, zoom in log space
		if ( this.goal ) {
			const G = this.goal, k = 1 - Math.exp( - dt / 0.08 );
			v.cx += ( G.cx - v.cx ) * k; v.cz += ( G.cz - v.cz ) * k;
			v.ppm = Math.exp( Math.log( v.ppm ) + ( Math.log( G.ppm ) - Math.log( v.ppm ) ) * k );
			if ( Math.abs( Math.log( G.ppm / v.ppm ) ) < 0.002 && Math.hypot( G.cx - v.cx, G.cz - v.cz ) * v.ppm < 0.5 ) { v.cx = G.cx; v.cz = G.cz; v.ppm = G.ppm; this.goal = null; }
		}
		v.ppm = this._clamp( v.ppm );
		this._title();
		this._draw();
	}

	// title plate and marker count, twice a second
	_title( force = false ) {
		const now = performance.now();
		if ( ! force && now - ( this._titleT || 0 ) < 500 ) return;
		this._titleT = now;
		const g = this.ui.game, me = this._me(), set = this.app.settings;
		// a GPS picked up, dropped or run flat while the map is open
		const known = this._knows();
		if ( known !== this.known ) { this.known = known; this._sig = ''; if ( this.popEl?.classList.contains( 'marks' ) ) this._fillMarkers(); }
		this.btnCentre.disabled = ! known;
		const long = known ? this.ui.locationName( me, true ) : 'Hawaiian Islands', i = long.indexOf( ',' );
		const name = i < 0 ? long : long.slice( 0, i ), island = i < 0 ? '' : long.slice( i + 1 ).trim();
		// the time follows the watch rule of the minimap
		const clock = ! set.get( 'realisticMap' ) || g.mode === 'creative' || g.player.inventory.count( 'watch' ) > 0;
		const sub = [ island, clock ? hhmm( g.hour ) : '', 'Day ' + g.day ].filter( Boolean ).join( ' · ' );
		// a wider plate moves the labels around it: redraw
		if ( this.titleName.textContent !== name ) { this.titleName.textContent = name; this._sig = ''; }
		if ( this.titleSub.textContent !== sub ) { this.titleSub.textContent = sub; this._sig = ''; }
		const n = g.markers.list().length;
		if ( this._count !== n ) {
			this._count = n;
			this.markCount.textContent = n ? String( n ) : '';
			this.btnMarkers.disabled = ! n;
			if ( ! n && this.popEl?.classList.contains( 'marks' ) ) this._closePop();
		}
	}

	_draw() {
		const g = this.ui.game, v = this.view, W = this.W, H = this.H, u = this.ui.u || 1, mv = this.ui.mapView;
		const me = this._me(), yaw = g.vehicles?.hud?.()?.heading ?? g.player.yaw;
		const markers = g.markers.list(), known = this.layers.vehicles ? g.vehicles?.known?.() || [] : [];
		// redraw only when something visible changed: the view, the player, markers, layers, a new tile
		const sig = [ v.cx.toFixed( 2 ), v.cz.toFixed( 2 ), v.ppm.toFixed( 5 ), W, H, this.dpr, u, this.known ? me.x.toFixed( 1 ) + me.z.toFixed( 1 ) + yaw.toFixed( 3 ) : '', mv.version,
			Object.values( this.layers ).join( '' ), markers.map( m => m.id + m.label + m.x ).join( '|' ), known.length ].join( ',' );
		if ( sig === this._sig && ! this._fading ) return;
		this._sig = sig;
		const ctx = this.canvas.getContext( '2d' );
		ctx.setTransform( this.dpr, 0, 0, this.dpr, 0, 0 );
		const [ px, py ] = this._toScreen( me.x, me.z );
		// place names keep clear of the player, the markers and the plates over the map
		const meR = this._meRect();
		const shown = this.layers.markers ? this._placeMarkers( markers, meR, u ) : [];
		const avoid = [ meR, ...this._chrome( u ), ...shown.map( o => o.rect ) ];
		const res = mv.draw( ctx, { cx: v.cx, cz: v.cz, ppm: v.ppm, rot: 0, w: W, h: H },
			{ priority: 0.1, u, pxRatio: this.dpr, layers: this.layers, avoid, under: ( c, toScreen ) => this._grid( c, toScreen ) } );
		this._fading = res.fading;
		for ( const k of known ) {
			const p = k.pos || k;
			if ( p === g.vehicles?.driving?.pos ) continue; // the one we sit in is the player arrow
			const [ sx, sy ] = res.toScreen( p.x, p.z );
			if ( sx > - 20 && sy > - 20 && sx < W + 20 && sy < H + 20 ) drawGlyph( ctx, 'car', sx, sy, 18 * u, { color: INK, lw: 1.75 * u } );
		}
		// death last, so it is never under a user marker
		shown.sort( ( a, b ) => ( a.m.kind === 'death' ) - ( b.m.kind === 'death' ) );
		for ( const o of shown ) this._drawMarker( ctx, o.m, res.toScreen, u, o.label );
		if ( this.known ) this._drawPlayer( ctx, px, py, yaw, u );
		// scale bar: a round distance close to 120u
		const d = nice( 120 * u / v.ppm ), len = Math.round( d * v.ppm );
		if ( this._scaleLen !== len ) { this._scaleLen = len; this.scaleBar.style.width = len + 'px'; }
		const lab = d >= 1000 ? d / 1000 + ' km' : d + ' m'; // round steps: 2 km, not 2.0 km
		if ( this.scaleLab.textContent !== lab ) this.scaleLab.textContent = lab;
		if ( this.ptr ) this._pointer(); // the ground under a still pointer changes as the map moves
	}

	// screen rects of the title, close, tools, scale bar and readout (the canvas fills the window, so client
	// coordinates are canvas coordinates), grown by 4u
	_chrome( u ) {
		const out = [];
		for ( const el of [ this.titleEl, this.closeEl, this.tools, this.scaleEl, this.readout ] ) {
			if ( ! el || el.hidden ) continue;
			const r = el.getBoundingClientRect();
			if ( r.width ) out.push( [ r.left - 4 * u, r.top - 4 * u, r.right + 4 * u, r.bottom + 4 * u ] );
		}
		return out;
	}

	// 1 km lines (250 m close up) in faint ink, faded in as they get far enough apart to read as a grid
	_grid( ctx, toScreen ) {
		const v = this.view;
		if ( ! this.layers.grid || v.ppm < 0.06 ) return;
		const step = v.ppm > 0.6 ? 250 : 1000, W = this.W, H = this.H;
		const a = Math.min( 1, ( v.ppm - 0.06 ) / 0.04 );
		ctx.save();
		ctx.strokeStyle = `rgba(60,44,28,${( 0.16 * a ).toFixed( 3 )})`;
		ctx.lineWidth = 1;
		const [ x0w, z0w ] = this._toWorld( 0, 0 ), [ x1w, z1w ] = this._toWorld( W, H );
		ctx.beginPath();
		for ( let x = Math.ceil( x0w / step ) * step; x <= x1w; x += step ) { const sx = Math.round( toScreen( x, 0 )[ 0 ] ) + 0.5; ctx.moveTo( sx, 0 ); ctx.lineTo( sx, H ); }
		for ( let z = Math.ceil( z0w / step ) * step; z <= z1w; z += step ) { const sy = Math.round( toScreen( 0, z )[ 1 ] ) + 0.5; ctx.moveTo( 0, sy ); ctx.lineTo( W, sy ); }
		ctx.stroke();
		ctx.restore();
	}

	// which marker names fit: every glyph is drawn, a name only where it clears the player, the other glyphs and
	// the names already placed (markers bunch up when zoomed out). Returns [ { m, label, rect } ], rect = what shows.
	_placeMarkers( markers, player, u ) {
		const hit = ( r, p ) => r[ 0 ] < p[ 2 ] && r[ 2 ] > p[ 0 ] && r[ 1 ] < p[ 3 ] && r[ 3 ] > p[ 1 ];
		const at = markers.map( m => this._toScreen( m.x, m.z ) );
		const glyphs = at.map( ( [ x, y ] ) => [ x - 8 * u, y - 10 * u, x + 8 * u, y + 10 * u ] );
		const placed = [ player ];
		return markers.map( ( m, i ) => {
			const g = glyphs[ i ], [ x, y ] = at[ i ];
			if ( m.kind === 'death' || ! m.label ) return { m, label: false, rect: g };
			const r = [ x + 8 * u, y - 12 * u, x + 12 * u + this._labelWidth( m.label ), y + 4 * u ];
			if ( placed.some( p => hit( r, p ) ) || glyphs.some( ( p, k ) => k !== i && hit( r, p ) ) ) return { m, label: false, rect: g };
			placed.push( r );
			return { m, label: true, rect: [ g[ 0 ], r[ 1 ], r[ 2 ], g[ 3 ] ] };
		} );
	}

	// a user marker is a small dark square edged in paper; a /locate one an open square; death a red skull
	_drawMarker( ctx, m, toScreen, u, label = true ) {
		const [ sx, sy ] = toScreen( m.x, m.z );
		if ( sx < - 200 || sy < - 30 || sx > this.W + 30 || sy > this.H + 30 ) return;
		// the skull is a 24-grid icon: it fills 16 x 17 of its 24
		if ( m.kind === 'death' ) { drawGlyph( ctx, 'skull', sx, sy, 20 * u, { color: ALARM, lw: 1.5 * u, halo: 1.25 * u } ); return; }
		ctx.save();
		const s = Math.round( 10 * u ), x0 = Math.round( sx - s / 2 ), y0 = Math.round( sy - s / 2 );
		ctx.lineJoin = 'miter';
		if ( m.kind === 'locate' ) {
			ctx.strokeStyle = PAPER; ctx.lineWidth = 5 * u; ctx.strokeRect( x0, y0, s, s );
			ctx.strokeStyle = INK; ctx.lineWidth = 2 * u; ctx.strokeRect( x0, y0, s, s );
		} else {
			ctx.fillStyle = PAPER; ctx.fillRect( x0 - 2 * u, y0 - 2 * u, s + 4 * u, s + 4 * u );
			ctx.fillStyle = INK; ctx.fillRect( x0, y0, s, s );
		}
		if ( label ) {
			ctx.font = LABEL_FONT.replace( '13px', 13 * u + 'px' );
			ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
			ctx.lineWidth = 3 * u; ctx.strokeStyle = PAPER;
			ctx.strokeText( m.label, sx + 10 * u, sy - 4 * u );
			ctx.fillStyle = INK;
			ctx.fillText( m.label, sx + 10 * u, sy - 4 * u );
		}
		ctx.restore();
	}

	// a 60° view cone in faint ink, darkest at the player, then the white arrow on a dark disc (a bare tilted arrow
	// reads as the mouse pointer)
	_drawPlayer( ctx, x, y, yaw, u ) {
		const a = - yaw - Math.PI / 2; // screen angle of the facing direction (north is up)
		const r = 44 * u, grad = ctx.createRadialGradient( x, y, 0, x, y, r );
		grad.addColorStop( 0, 'rgba(26,22,18,0.34)' );
		grad.addColorStop( 1, 'rgba(26,22,18,0.03)' );
		ctx.save();
		ctx.beginPath();
		ctx.moveTo( x, y );
		ctx.arc( x, y, r, a - Math.PI / 6, a + Math.PI / 6 );
		ctx.closePath();
		ctx.fillStyle = grad;
		ctx.fill();
		ctx.beginPath();
		ctx.arc( x, y, 12 * u, 0, Math.PI * 2 );
		ctx.fillStyle = 'rgba(16,14,12,0.88)';
		ctx.fill();
		ctx.lineWidth = 1.5 * u;
		ctx.strokeStyle = PAPER;
		ctx.stroke();
		ctx.restore();
		drawGlyph( ctx, 'player', x, y, 16 * u, { color: '#fff', lw: 0, rot: - yaw } );
	}
}
