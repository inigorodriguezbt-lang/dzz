// In-game HUD, DayZ style (docs/UI_DAYZ.md; docs/UI_SPEC.md 5 where that is silent). Almost nothing on screen:
// status notifiers with tendency arrows and the stance bottom right, condition badges above them, a thin stamina
// bar and the quickbar bottom centre, prompts right of centre with a thin timed-action bar, a tiny crosshair, red
// hit and damage flashes, toasts and pickups as plain text lines. The compass bar, minimap, ammo counter and
// location card are settings (off by default); the vehicle panel, key hints, FPS and debug stay small.
// Every element is built once. update() writes to the DOM only when a formatted value or a class changes
// (the helpers below cache the last write) and never reads layout, so an idle frame costs a few compares.
import { h, kc, fmtDist } from './dom.js';
import { icon, PATHS } from './icons.js';
import { getItem, displayName, ammoOf } from '../game/items/ItemDB.js';
import { setIcon } from './itemIcons.js';
import { lookKey } from '../game/items/ext/gear/logic.js';

const LINGER = 3; // s an element stays after whatever woke it stops (5.2)
const BRIEF = 2.5; // s the weapon readout shows a change while the ammo counter is off
const NS = 'http://www.w3.org/2000/svg';

// ---- cached DOM writes ------------------------------------------------------------------------------
function text( el, v ) { v = String( v ); if ( el._t !== v ) { el._t = v; el.textContent = v; } }
function flag( el, c, on ) { on = !! on; const k = '$' + c; if ( el[ k ] !== on ) { el[ k ] = on; el.classList.toggle( c, on ); } }
function show( el, on ) { on = !! on; if ( el._s !== on ) { el._s = on; el.hidden = ! on; } }
// a bar's fill as a scale (no layout): the <i> is full width with transform-origin left
function fill( el, f ) { const v = 'scaleX(' + Math.max( 0, Math.min( 1, f || 0 ) ).toFixed( 3 ) + ')'; if ( el._w !== v ) { el._w = v; el.style.transform = v; } }
function prop( el, k, v ) { if ( el[ '_' + k ] !== v ) { el[ '_' + k ] = v; el.style.setProperty( k, v ); } }
// fades out with .gone, then leaves the layout; fading in plays the .fade entry animation
function fade( el, on ) {
	on = !! on;
	if ( el._f === on ) return;
	el._f = on;
	clearTimeout( el._ft );
	if ( on ) { el.hidden = false; el.classList.remove( 'gone' ); } else { el.classList.add( 'gone' ); el._ft = setTimeout( () => { el.hidden = true; }, 400 ); }
}
// puts exactly `list` in `parent`, in order, moving as few nodes as possible (a moved node restarts its entry animation)
function sync( parent, list ) {
	const want = new Set( list );
	for ( const c of [ ...parent.children ] ) if ( ! want.has( c ) ) c.remove();
	let ref = parent.firstChild;
	for ( const n of list ) { if ( n === ref ) { ref = ref.nextSibling; continue; } parent.insertBefore( n, ref ); }
}
function svg( cls, viewBox, inner ) {
	const s = document.createElementNS( NS, 'svg' );
	s.setAttribute( 'class', cls ); s.setAttribute( 'viewBox', viewBox ); s.setAttribute( 'aria-hidden', 'true' );
	s.innerHTML = inner;
	return s;
}
const hhmm = hr => { hr = ( ( hr % 24 ) + 24 ) % 24; const a = Math.floor( hr ), m = Math.floor( ( hr - a ) * 60 ); return String( a ).padStart( 2, '0' ) + ':' + String( m ).padStart( 2, '0' ); };
const headingOf = yaw => ( ( - yaw * 180 / Math.PI ) % 360 + 360 ) % 360;
const bearingOf = ( dx, dz ) => ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360;
const angDiff = ( a, b ) => ( ( a - b + 540 ) % 360 ) - 180;
const cap1 = s => s ? s[ 0 ].toUpperCase() + s.slice( 1 ) : s;
// tendency arrows beside a notifier (DayZ's ↑ ↑↑ ↑↑↑): 1-3 small triangles stacked in an 8 x 18 box
const TREND_Y = [ [], [ 9 ], [ 6.5, 11.5 ], [ 4, 9, 14 ] ];
const trendPath = ( n, dir ) => TREND_Y[ n ].map( y => `M1 ${y + 1.9 * dir}L4 ${y - 1.9 * dir}L7 ${y + 1.9 * dir}Z` ).join( '' );

// ---- status notifiers: value, colour state, which way is good, trend tiers per minute ------------------------
// white when fine, yellow (warn) when low, red (crit, blinking) when critical; temperature turns blue when cold
const NOTIFIERS = [
	{ k: 'health', icon: 'nf_health', val: S => S.health, warn: v => v < 50, crit: v => v < 25 },
	{ k: 'blood', icon: 'nf_blood', val: S => S.blood / 50, warn: v => v < 76, crit: v => v < 60 },
	{ k: 'food', icon: 'nf_food', val: S => Math.min( 100, S.hunger ), warn: v => v < 30, crit: v => v < 10 },
	{ k: 'water', icon: 'nf_water', val: S => Math.min( 100, S.thirst ), warn: v => v < 30, crit: v => v < 10 },
	{ k: 'temp', icon: 'nf_temp', val: S => S.temp, tiers: [ 0.08, 0.3, 0.9 ],
		state: v => v < 35.2 ? 'freeze' : v < 36 ? 'cold' : v > 38.6 ? 'crit' : v > 38 ? 'warn' : '',
		// towards 36.9 °C is good; body heat drifts with every sprint, so a trend only shows near the edge of the band
		good: ( v, dir ) => ( v < 36.9 ) === ( dir > 0 ), trendShows: v => v < 36.4 || v > 37.4 },
	// sleep: only when low
	{ k: 'energy', icon: 'nf_energy', val: S => S.energy, warn: v => v < 25, crit: v => v < 10, only: ( v, was ) => v < ( was ? 33 : 30 ) },
];
const TIERS = [ 4, 15, 45 ];
export const COND_ICON = { blood: 'blood', tired: 'energy' }; // condition id -> icon when they differ

// badges: most urgent first; the blood and energy notifiers already say 'Low blood' and 'Exhausted'
const BADGE_ORDER = [ 'bleed', 'frac', 'inf', 'cut', 'lepto', 'sting', 'centipede', 'sick', 'hot', 'cold', 'wet', 'burn', 'sunburn',
	'cough', 'sprain', 'eye', 'wound', 'dressing', 'drunk', 'drowsy', 'heavy', 'stress', 'unhappy', 'bored', 'caf', 'pk', 'sunscreen', 'steady' ];
const BADGE_RANK = new Map( BADGE_ORDER.map( ( id, i ) => [ id, i ] ) );
const NO_BADGE = new Set( [ 'blood', 'tired' ] );

// moodle glyphs (Survival.moodles() ids), faces in the style of the 'sick' condition icon: the set gains them
// here so the HUD badges and the Status screen both draw them with icon()
const MOOD_GLYPHS = {
	// grimace with a bead of sweat
	stress: '<circle cx="11" cy="13" r="7.5"/><path d="M7.75 16.5l1.6-1.25 1.6 1.25 1.6-1.25 1.6 1.25M8.5 11h.01M13.5 11h.01M19 3c1.1 1.35 2.1 2.55 2.1 3.6a2.1 2.1 0 0 1-4.2 0c0-1.05 1-2.25 2.1-3.6Z"/>',
	// frown
	unhappy: '<circle cx="12" cy="12" r="8.5"/><path d="M8.75 16.5a4 4 0 0 1 6.5 0M9 10h.01M15 10h.01"/>',
	// heavy lids, flat mouth
	bored: '<circle cx="12" cy="12" r="8.5"/><path d="M7.75 10.25h3M13.25 10.25h3M9.5 15.5h5"/>',
};
for ( const [ k, v ] of Object.entries( MOOD_GLYPHS ) ) PATHS[ k ] ??= v;

// prompts name the target above the action: 'Take Canned tuna ×2' -> CANNED TUNA ×2 over [F] Take. Only verbs whose
// object is the target split; anything else ('Cut lock', 'Drink' at a tap) is the action as given
const VERBS = /^(Take|Search|Open|Drive|Fly|Fill|Add|Pick|Shake|Gather|Pack up|Read) (.+)$/;
function promptParts( t ) {
	let name = '', act = t.label || '', info = t.sub || '';
	const id = String( t.id || '' );
	if ( t.plRec ) {
		// a placeable: its name, then its state ('Tent · Pitched · hold for more')
		const seg = info.split( ' · ' );
		name = seg.shift() || '';
		info = seg.filter( s => s !== 'hold for more' ).join( ' · ' );
	} else if ( id.startsWith( 'veh-' ) && typeof t.owner?.name === 'string' ) {
		name = t.owner.name;
		if ( act.endsWith( ' ' + name ) ) act = act.slice( 0, - name.length - 1 );
	} else if ( id.startsWith( 'door:' ) ) name = t.owner?.kind === 'vault' ? 'Vault door' : 'Door';
	else { const m = VERBS.exec( act ); if ( m ) { act = m[ 1 ]; name = cap1( m[ 2 ] ); } }
	return { name, act, info };
}
// weapon handling that ends with a look at the rounds (reload, a clip, single shells, checking, clearing a jam)
const AMMO_ACT = /^(reload|clip|shells|revolver|break|inspect|jam|charge|nock)/;

// canvas versions of the icon set (minimap): Path2D built from the same SVG markup
const GLYPHS = new Map();
function glyph( name ) {
	let gl = GLYPHS.get( name );
	if ( gl ) return gl;
	gl = { stroke: new Path2D(), fill: new Path2D() };
	const re = /<(path|circle|rect)\s([^>]*?)\/>/g;
	let m;
	while ( ( m = re.exec( PATHS[ name ] || '' ) ) ) {
		const a = {};
		m[ 2 ].replace( /([\w-]+)="([^"]*)"/g, ( _, k, v ) => { a[ k ] = v; } );
		const p = new Path2D();
		if ( m[ 1 ] === 'path' ) p.addPath( new Path2D( a.d ) );
		else if ( m[ 1 ] === 'circle' ) p.arc( + a.cx, + a.cy, + a.r, 0, Math.PI * 2 );
		else p.roundRect( + a.x, + a.y, + a.width, + a.height, + ( a.rx || 0 ) );
		( a.fill === 'currentColor' ? gl.fill : gl.stroke ).addPath( p );
	}
	GLYPHS.set( name, gl );
	return gl;
}
// draws an icon centred at x, y, size in canvas px; halo = dark outline under the stroke for busy map backgrounds
function drawGlyph( ctx, name, x, y, size, { color = '#fff', fillColor = null, lw = 1.5, halo = 0 } = {} ) {
	const gl = glyph( name ), k = size / 24;
	ctx.save();
	ctx.translate( x - size / 2, y - size / 2 );
	ctx.scale( k, k );
	ctx.lineCap = 'round'; ctx.lineJoin = 'round';
	if ( halo ) { ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = ( lw + halo * 2 ) / k; ctx.stroke( gl.stroke ); }
	if ( fillColor ) { ctx.fillStyle = fillColor; ctx.fill( gl.stroke ); }
	ctx.strokeStyle = color; ctx.lineWidth = lw / k; ctx.stroke( gl.stroke );
	ctx.fillStyle = color; ctx.fill( gl.fill );
	ctx.restore();
}

export class HUD {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this.game = null;
		this.t = 0;
		this.seen = {};
		this.hidden = false;
		this.debugOn = false;
		this.el = h( 'div.hud' );

		// top left: FPS and debug; toasts live in .feed, a sibling above screens
		this.fps = h( 'div.fps', { hidden: true } );
		this.debug = h( 'div.debug.t-mono', { hidden: true } );
		this.tl = h( 'div.tl', {}, this.fps, this.debug );
		this.feed = h( 'div.feed' );

		// centre: crosshair, hit flash, damage glow, prompt, timed action
		this.cross = h( 'div.crosshair' );
		this.hit = h( 'div.hitmarker', {}, h( 'i' ), h( 'i' ), h( 'i' ), h( 'i' ) );
		// a soft red glow at the screen edge, rotated towards the hit (transform and opacity only)
		this.dmg = h( 'div.dmg', {}, h( 'i' ) );
		this.dmg.style.display = 'none';
		this.prompt = h( 'div.iprompt', { hidden: true },
			this.pName = h( 'div.pn', { hidden: true }, this.pNameT = h( 'span' ), this.pNameI = h( 'span.ni', { hidden: true } ) ),
			h( 'div.pa', {}, this.pCap = h( 'span.cap' ), this.pAct = h( 'span.lb' ) ),
			this.pHold = h( 'div.ph', { hidden: true }, this.pHoldI = h( 'i' ) ),
			this.pAlt = h( 'div.palt', { hidden: true } ),
			this.pInfo = h( 'div.pi', { hidden: true } ) );
		this.tact = h( 'div.tact', { hidden: true },
			h( 'div.tn', {}, this.tName = h( 'span' ), this.tSec = h( 'span.s' ) ),
			h( 'div.tb', {}, this.tBar = h( 'i' ) ) );

		// top centre: compass, heading tab, location card
		this.strip = h( 'div.compass-strip' );
		this.compass = h( 'div.compass', {}, this.strip, h( 'div.compass-needle' ) );
		this.heading = h( 'div.heading', {}, this.headDeg = h( 'span' ), this.headDist = h( 'span.d', { hidden: true } ) );
		this.place = h( 'div.place', { hidden: true }, this.placeName = h( 'div.pl' ), this.placeIsl = h( 'div.isl' ) );
		this._buildCompass();

		// top right: minimap
		this.miniCanvas = h( 'canvas', { width: 184, height: 184 } );
		this.minimap = h( 'div.minimap', {}, this.miniCanvas, h( 'div.foot', {}, this.miniPlace = h( 'span' ), this.miniTime = h( 'span' ) ) );

		// bottom right, from the corner up: notifiers and stance, badges, the badge caption, the weapon readout or
		// the vehicle panel, pickups
		this.ntf = NOTIFIERS.map( d => {
			const tr = svg( 'tr', '0 0 8 18', '<path/>' );
			const el = h( 'div.ntf.fade.' + d.k, { hidden: !! d.only }, icon( d.icon ), tr );
			return { d, el, tr, trPath: tr.firstChild, rate: 0, last: null, tier: 0, dir: 0, st: null, on: ! d.only };
		} );
		this.stanceIcon = icon( 'stance_stand', 24 );
		this.stance = h( 'div.stance', {}, this.stanceIcon );
		this.vitals = h( 'div.vitals', {}, ...this.ntf.map( o => o.el ) );
		this.ntfs = h( 'div.ntfs', {}, this.vitals, this.stance );
		this.badges = h( 'div.badges', { hidden: true } );
		this.badgeCap = h( 'div.bcap', { hidden: true } );
		this.badgeEls = new Map();

		this.pickups = h( 'div.pickups' );
		this.pickQ = [];
		// the weapon readout: name, then rounds | spare and the fire mode (or JAM)
		this.weapon = h( 'div.wpn.fade', { hidden: true },
			this.wName = h( 'div.wn' ),
			this.wRow = h( 'div.wa', {},
				this.wNum = h( 'span.n' ), this.wUnit = h( 'span.u', { hidden: true } ),
				this.wRes = h( 'span.r' ),
				this.wMode = h( 'span.m' ), this.wJam = h( 'span.jam', { hidden: true, text: 'Jam' } ) ) );
		this.vehicle = h( 'div.veh', { hidden: true },
			h( 'div.vn', {}, this.vName = h( 'span' ), this.vGear = h( 'span.gear' ) ),
			h( 'div.vs', {}, this.vSpd = h( 'span.n' ), this.vUnit = h( 'span.u' ) ),
			this.vFuelRow = h( 'div.vg', {}, icon( 'fuel' ), h( 'div.bar', {}, this.vFuel = h( 'i' ) ), this.vFuelPc = h( 'span.pc' ) ),
			this.vHpRow = h( 'div.vg', {}, icon( 'wrench' ), h( 'div.bar', {}, this.vHp = h( 'i' ) ), this.vHpPc = h( 'span.pc' ) ),
			this.vAltRow = h( 'div.vg', { hidden: true }, icon( 'altitude' ), this.vAlt = h( 'span.pc' ) ) );
		this.br = h( 'div.br', {}, this.pickups, this.weapon, this.vehicle, this.badgeCap, this.badges, this.ntfs );

		// bottom centre: key hints, the quickbar, the stamina bar
		this.keyhints = h( 'div.keyhints.fade', { hidden: true } );
		this.stamina = h( 'div.stamina.fade.gone', {}, this.stamIcon = icon( 'breath', 12 ), h( 'div.sb', {}, this.stamFill = h( 'i' ) ) );
		this.stamIcon.style.display = 'none';
		this.hotbar = h( 'div.qbar.fade', { hidden: true } );
		this.hotSlots = [];
		for ( let i = 0; i < 9; i ++ ) {
			const img = h( 'img', { alt: '' } ), q = h( 'span.q' ), n = h( 'span.n', { text: i + 1 } );
			const el = h( 'div.qs', {}, img, n, q );
			this.hotSlots.push( { el, img, q, uid: null } );
			this.hotbar.appendChild( el );
		}
		this.bc = h( 'div.bc', {}, this.keyhints, this.hotbar, this.stamina );

		// panic: a dark, slowly breathing edge (under everything else)
		this.vig = h( 'div.panic-vig', { hidden: true } );

		this.el.append( this.vig, this.tl, this.dmg, this.cross, this.hit, this.prompt, this.tact, this.compass, this.heading, this.place, this.minimap, this.bc, this.br );
		this.zoom = 1.1;
		this.miniDt = 0;
		this.hitT = 0;
		this.toasts = []; this.picks = [];
		this._screenH = innerHeight; this._screenW = innerWidth;
		addEventListener( 'resize', () => { this._screenH = innerHeight; this._screenW = innerWidth; } );
	}

	attach( game ) {
		this.game = game;
		this.t = 0;
		this.seen = {}; this.ticks = {};
		this._hintObj = undefined; this._hintKey = null;
		this.placeCur = null; this.placeShown = null; this.placeSeen = new Map(); this.placeAt = 0; this.placeHide = 0; this.placeOut = 0;
		for ( const o of this.ntf ) { o.last = null; o.rate = 0; o.tier = 0; }
		this.badgeEls.clear(); this.badges.replaceChildren(); this._badgeKey = null; this.capUntil = 0;
		this.pickups.replaceChildren(); this.pickQ = []; this.picks = [];
		this.feed.replaceChildren(); this.toasts = [];
		this._lastInv = - 1; this._hands = undefined; this._hotKey = null; this._qtyKey = null;
		this._mKey = null; this._act = null; this._cancelT = 0; this._allow = undefined;
		this._held = null; this._wUid = undefined; this._wMode = undefined; this._ammoAct = false; this._pT = null;
		const on = ( n, f ) => this.ui.offs.push( game.events.on( n, f ) );
		on( 'toast', t => this.toast( t.text, t.kind, t.icon ) );
		on( 'hitmarker', e => this.hitmarker( e ) );
		on( 'item:pick', e => this.pickup( e.stack ) );
	}

	wake( key ) { this.seen[ key ] = this.t; }
	// time-based cadence, so slow frames don't stretch the refresh (vitals 10 Hz, conditions 3 Hz, place 2 Hz)
	due( key, period ) { const last = this.ticks[ key ] ?? - 1e9; if ( this.t - last < period ) return 0; this.ticks[ key ] = this.t; return Math.min( 1, this.t - last ); }
	shown( key, cond, linger = LINGER ) { return this.mode === 'always' || cond || this.t - ( this.seen[ key ] ?? - 99 ) < linger; }
	recent( key, linger ) { return this.t - ( this.seen[ key ] ?? - 99 ) < linger; }

	toggleDebug() {
		this.debugOn = ! this.debugOn;
		this.debug.hidden = ! this.debugOn;
		if ( this.debugOn && this.game ) this._debug();
		this._placeFeed();
	}

	// ---- events -----------------------------------------------------------------------------------------

	// Toasts and pickups live on HUD time (not timers), so a stalled frame or a hidden tab never eats them.
	// One plain line: item render when there is one, else a warn / bad mark.
	toast( text, kind = 'info', iconId = null ) {
		// the fire mode: the weapon readout shows it
		if ( kind === 'info' && text && this.game?.hands?.ammoInfo?.()?.mode === text ) return;
		const life = kind === 'bad' ? 5 : 3.5;
		if ( kind === 'bad' || kind === 'warn' ) this.app.audio.ui?.( 'ui_error', 0.25 );
		// the same line still on screen: a repeat within 2 s counts (×2), a later one only keeps it up
		const old = this.toasts.find( o => o.text === text && ! o.out );
		if ( old ) {
			if ( this.t - old.at < 2 ) { old.n ++; old.x.textContent = '×' + old.n; old.x.hidden = false; }
			old.at = this.t; old.until = this.t + life;
			return;
		}
		const el = h( 'div.note.' + kind );
		if ( iconId ) { const img = h( 'img', { alt: '' } ); setIcon( img, iconId ); el.appendChild( img ); }
		else if ( kind === 'warn' || kind === 'bad' ) el.appendChild( h( 'span.sd' ) );
		const x = h( 'span.x', { hidden: true } );
		el.append( h( 'span.tx', { text } ), x );
		this.toasts.push( { el, x, text, n: 1, at: this.t, until: this.t + life, out: 0 } );
		this.feed.appendChild( el );
		// newest at the bottom; the oldest leaves first
		while ( this.toasts.length > 4 ) this.toasts.shift().el.remove();
	}

	pickup( stack ) {
		if ( ! stack || ! getItem( stack.id ) || this.ui.inventoryOpen ) return;
		if ( this.game?.hands?.aiming ) { this.pickQ.push( { id: stack.id, qty: stack.qty || 1, name: displayName( stack ) } ); return; }
		this._pickup( stack.id, stack.qty || 1, displayName( stack ) );
	}

	_pickup( id, qty, name ) {
		// the same item within 1.5 s merges into one row
		const old = this.picks.find( o => o.id === id && ! o.out && this.t - o.at < 1.5 );
		if ( old ) {
			old.qty += qty; old.at = this.t; old.until = this.t + 2.4;
			old.x.textContent = '×' + old.qty; old.x.hidden = false;
			return;
		}
		const img = h( 'img', { alt: '' } ); setIcon( img, id );
		const x = h( 'span.x', { text: '×' + qty, hidden: qty < 2 } );
		const el = h( 'div.pickup', {}, h( 'span.tx', { text: name } ), x, img );
		this.picks.push( { el, x, id, qty, at: this.t, until: this.t + 2.4, out: 0 } );
		this.pickups.appendChild( el );
		while ( this.picks.length > 4 ) this.picks.shift().el.remove();
	}

	// fade out (240 ms) what has expired, then drop it
	_expire( list ) {
		for ( let i = list.length - 1; i >= 0; i -- ) {
			const o = list[ i ];
			if ( ! o.out && this.t >= o.until ) { o.out = this.t + 0.24; o.el.classList.add( 'out' ); }
			else if ( o.out && this.t >= o.out ) { o.el.remove(); list.splice( i, 1 ); }
		}
	}

	// a short red flash at the crosshair (a kill: a little longer and wider)
	hitmarker( e ) {
		if ( ! this.app.settings.get( 'hitMarkers' ) ) return;
		this.hit.classList.toggle( 'kill', !! e.kill );
		this.hit.classList.add( 'on' );
		this.hitT = e.kill ? 0.25 : 0.12;
		this.app.audio.play?.( e.kill ? 'hit_flesh' : 'ui_click', { bus: 'ui', vol: e.kill ? 0.25 : 0.2, rate: e.headshot ? 1.4 : 1 } );
	}

	// location card (5.8): on spawn after 1.2 s; otherwise when the place name changes and holds for 2 s
	showPlace( force = false ) { if ( force ) this.placeAt = this.t + 1.2; }

	// key hint set from UI (5.11): { keys: [ [ actions[], verb, suffix? ] ] } or null
	setHint( hint ) {
		// called every frame: rebuild only for a new hint, or twice a second in case a key was rebound
		if ( hint === this._hintObj && this.app.frame % 30 !== 0 ) { fade( this.keyhints, !! hint ); return; }
		this._hintObj = hint;
		const input = this.app.input;
		const key = hint ? hint.keys.map( ( [ acts, verb, suf ] ) => acts.map( a => input.label( a ) ).join( '+' ) + ( suf || '' ) + verb ).join( '|' ) : null;
		if ( key !== this._hintKey ) {
			this._hintKey = key;
			if ( hint ) this.keyhints.replaceChildren( ...hint.keys.map( ( [ acts, verb, suf ] ) => h( 'span.hint', {},
				h( 'span.caps', {}, ...acts.map( a => kc( input.label( a ) ) ) ), suf ? h( 'span.suf', { text: suf } ) : null, h( 'span', { text: verb } ) ) ) );
		}
		fade( this.keyhints, !! hint );
	}

	// ---- per frame ----------------------------------------------------------------------------------------

	update( dt ) {
		const g = this.game;
		if ( ! g ) return;
		this.t += dt;
		const S = g.survival, p = g.player, inv = p.inventory, set = this.app.settings, input = this.app.input, frame = this.app.frame;
		const ui = this.ui, screen = ui.screen != null;
		this.mode = set.get( 'hudMode' ) ?? 'auto';
		const creative = g.mode === 'creative';
		const dead = !! g.dead;
		flag( this.el, 'off', this.hidden || dead );
		flag( this.el, 'under', screen );
		flag( this.feed, 'off', this.hidden || dead );
		// toasts keep clear of whatever a screen puts in the top-left corner (the map title, the inventory panel)
		const feedAt = ! screen ? '' : ui.screenOpts.inventory ? 'inv' : ui.screenOpts.map ? 'map' : 'screen';
		if ( feedAt !== this._feedAt ) { this._feedAt = feedAt; this._placeFeed(); }

		const vh = g.vehicles?.hud?.() || null;
		this._vh = vh;
		const inVeh = !! vh || !! p.vehicle;
		const aiming = !! g.hands?.aiming && ! inVeh;
		if ( ! aiming && this._aim ) { for ( const q of this.pickQ ) this._pickup( q.id, q.qty, q.name ); this.pickQ = []; }
		this._aim = aiming;
		flag( this.el, 'aim', aiming );

		// fps, debug
		const fpsOn = !! set.get( 'showFps' );
		show( this.fps, fpsOn );
		const fpsNew = fpsOn !== this._fpsOn;
		if ( fpsNew ) { this._fpsOn = fpsOn; this._placeFeed(); }
		if ( fpsOn && ( this.due( 'fps', 0.25 ) || fpsNew ) ) text( this.fps, `${Math.round( this.app.fps )} fps` );
		if ( this.debugOn && this.due( 'debug', 0.25 ) ) this._debug();

		// the held stack: looked up again only when the hands or the inventory change
		if ( inv.hands !== this._hands || inv.version !== this._heldV ) {
			if ( inv.hands !== this._hands && this._hands !== undefined ) this.wake( 'hotbar' );
			this._hands = inv.hands; this._heldV = inv.version;
			this._held = inv.heldStack();
		}
		const held = inVeh ? null : this._held;
		const heldDef = held ? getItem( held.id ) : null;

		// what the settings and carried items allow (checked twice a second: inventory scans are not free). A compass
		// in the hands always shows the bar (DayZ's way to read one)
		if ( this.due( 'allow', 0.5 ) || this._allow === undefined ) {
			const real = set.get( 'realisticMap' );
			this._allow = {
				compass: !! set.get( 'compass' ) && ( ! real || creative || inv.count( 'compass' ) > 0 ),
				map: !! set.get( 'minimap' ) && ( ! real || creative || inv.count( 'map_hawaii' ) > 0 ),
				clock: ! real || creative || inv.count( 'watch' ) > 0,
				maxSt: S.maxStamina(),
			};
		}
		const allow = this._allow;
		const compassOn = allow.compass || heldDef?.tool?.kind === 'compass' || held?.id === 'compass';

		this._crosshair( g, set, aiming || inVeh || screen );
		if ( this.hitT > 0 ) { this.hitT -= dt; if ( this.hitT <= 0 ) this.hit.classList.remove( 'on' ); }
		this._compass( g, p, vh, compassOn, frame );
		this._placeCard( g, p, screen, !! set.get( 'locationCard' ) );
		show( this.minimap, allow.map );
		this.miniDt += dt;
		if ( allow.map && frame % 2 === 0 ) { this._minimap( this.miniDt, allow.clock ); this.miniDt = 0; }

		// notifiers at 10 Hz, badges three times a second
		const vdt = this.due( 'vitals', 0.1 );
		if ( vdt ) { this._vitals( S, vdt, creative ); this._stance( p, inVeh ); this._panic( S, creative ); }
		if ( this.due( 'conds', 0.33 ) ) this._badges( S, inv, creative, input );
		if ( this.capUntil && this.t >= this.capUntil ) { this.capUntil = 0; fade( this.badgeCap, false ); }
		if ( frame % 2 === 0 ) this._stamina( S, p, creative, allow.maxSt );

		// quickbar: slot keys, the wheel, a new held item, new bindings or a bound stack used up wake it
		if ( ! screen && ! inVeh ) {
			for ( let i = 1; i <= 9; i ++ ) if ( input.codes( 'slot' + i ).some( c => input.codePressed( c ) ) ) { this.wake( 'hotbar' ); break; }
			if ( input.codePressed( 'WheelUp' ) || input.codePressed( 'WheelDown' ) ) this.wake( 'hotbar' );
		}
		if ( inv.version !== this._lastInv || frame % 30 === 0 ) { this._lastInv = inv.version; this._hotbar( inv ); }
		show( this.hotbar, this._hotAny && ! inVeh );
		flag( this.hotbar, 'gone', ! this.shown( 'hotbar', false ) );

		if ( frame % 4 === 0 ) this._weapon( g, held, heldDef, set );
		show( this.vehicle, !! vh );
		if ( vh && frame % 3 === 0 ) this._vehicle( vh );

		if ( this.toasts.length ) this._expire( this.toasts );
		if ( this.picks.length ) this._expire( this.picks );
		this._prompt( g, set, input, screen, inVeh );
		this._action( g );
		this._damage( S, p, set );
	}

	_crosshair( g, set, off ) {
		const style = set.get( 'crosshair' );
		if ( style !== this._crossStyle ) {
			this._crossStyle = style;
			this.cross.innerHTML = style === 'lines' ? '<div class="lines"><i></i><i></i><i></i><i></i></div>' : style === 'none' ? '' : '<div class="dot"></div>';
		}
		show( this.cross, ! off && style !== 'none' );
		if ( style === 'lines' && ! off ) {
			const spread = g.hands?.crosshairSpread?.() ?? 0.01;
			const gap = Math.max( 4, spread / Math.tan( ( g.camera?.fov || 80 ) * Math.PI / 360 ) * this._screenH * 0.5 );
			prop( this.cross, '--gap-px', gap.toFixed( 1 ) + 'px' );
		}
	}

	// ---- compass, heading, markers (5.3) -----------------------------------------------------------------

	_buildCompass() {
		const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
		const frag = document.createDocumentFragment();
		// 3u per degree over -360..720 so any heading has a full window either side
		for ( let d = - 360; d <= 720; d += 5 ) {
			const deg = ( ( d % 360 ) + 360 ) % 360, left = `calc(${d * 3} * var(--u))`;
			frag.appendChild( h( 'i.compass-tick' + ( deg % 15 === 0 ? '.major' : '' ), { style: { left } } ) );
			if ( names[ deg ] ) frag.appendChild( h( 'span.compass-label' + ( deg % 90 === 0 ? '.card' : '' ), { style: { left }, text: names[ deg ] } ) );
		}
		this.markerLayer = h( 'div' );
		frag.appendChild( this.markerLayer );
		this.strip.appendChild( frag );
	}

	_compass( g, p, vh, on, frame ) {
		show( this.compass, on ); show( this.heading, on );
		if ( ! on ) return;
		const hd = headingOf( vh?.heading ?? p.yaw );
		const tx = `translateX(calc(${( - hd * 3 ).toFixed( 1 )} * var(--u)))`;
		if ( tx !== this._tx ) { this._tx = tx; this.strip.style.transform = tx; }
		text( this.headDeg, Math.round( hd ) % 360 + '°' );
		if ( frame % 15 !== 0 && this._mKey != null ) return;
		// markers at their bearing; the nearest user or /locate marker within ±20° puts its distance in the tab
		const list = g.markers?.list?.() || [];
		const key = list.map( m => m.id + m.kind ).join( ',' );
		if ( key !== this._mKey ) {
			this._mKey = key;
			// three copies (bearing - 360, bearing, bearing + 360) so the strip shows it at any heading
			this._mEls = list.map( m => ( { m, els: [ 0, 1, 2 ].map( () => icon( m.kind === 'death' ? 'skull' : 'marker', 16, 'compass-marker ' + ( m.kind || 'user' ) ) ) } ) );
			this.markerLayer.replaceChildren( ...this._mEls.flatMap( o => o.els ) );
		}
		let best = null, bd = Infinity;
		for ( const o of this._mEls ) {
			const m = o.m, b = bearingOf( m.x - p.pos.x, m.z - p.pos.z );
			o.els.forEach( ( el, i ) => { const v = `calc(${( ( b + ( i - 1 ) * 360 ) * 3 ).toFixed( 1 )} * var(--u))`; if ( el._l !== v ) { el._l = v; el.style.left = v; } } );
			if ( m.kind === 'death' || Math.abs( angDiff( b, hd ) ) > 20 ) continue;
			const d = Math.hypot( m.x - p.pos.x, m.z - p.pos.z );
			if ( d < bd ) { bd = d; best = m; }
		}
		show( this.headDist, !! best );
		if ( best ) text( this.headDist, fmtDist( bd ) );
	}

	_placeCard( g, p, screen, enabled ) {
		const card = this.place;
		if ( this.due( 'place', 0.5 ) || this.placeCur == null ) {
			const pl = this.ui.placeOf( p.pos );
			if ( pl.name !== this.placeCur ) { this.placeCur = pl.name; this.placeSince = this.t; }
			else if ( ! this.placeAt && this.t - this.placeSince >= 2 && pl.name !== this.placeShown ) {
				// the same name is not shown again within 60 s (walking along a border)
				if ( this.t - ( this.placeSeen.get( pl.name ) ?? - 1e9 ) >= 60 ) this.placeAt = this.t;
				this.placeShown = pl.name;
			}
			text( this.miniPlace, pl.name );
		}
		if ( this.placeAt && this.t >= this.placeAt && ! screen && ! g.dead ) {
			this.placeAt = 0;
			const pl = this.ui.placeOf( p.pos );
			this.placeShown = this.placeCur = pl.name;
			this.placeSeen.set( pl.name, this.t );
			// the card is a setting (off like DayZ); the bookkeeping above runs either way
			if ( enabled ) {
				text( this.placeName, pl.name );
				const isl = pl.island && pl.island !== pl.name ? pl.island : '';
				text( this.placeIsl, isl ); show( this.placeIsl, !! isl );
				clearTimeout( card._ft );
				card.classList.remove( 'gone' );
				card.hidden = false;
				this.placeHide = this.t + 3;
				this.placeOut = 0;
			}
		}
		if ( this.placeHide && this.t >= this.placeHide ) { this.placeHide = 0; card.classList.add( 'gone' ); this.placeOut = this.t + 0.4; }
		if ( this.placeOut && this.t >= this.placeOut ) { this.placeOut = 0; card.hidden = true; card.classList.remove( 'gone' ); }
	}

	// ---- minimap (5.4) ---------------------------------------------------------------------------------------

	_minimap( dt, clock ) {
		const g = this.game, p = g.player, map = this.ui.mapView;
		if ( this.due( 'clock', 1 ) || this._clock !== clock ) {
			this._clock = clock;
			show( this.miniTime, clock );
			if ( clock ) text( this.miniTime, hhmm( g.hour ) );
		}
		if ( ! map ) return;
		const c = this.miniCanvas, s = ( this.ui.u || 1 ) * Math.min( 2, devicePixelRatio || 1 ); // canvas px per u
		const W = Math.max( 64, Math.round( 184 * s ) );
		if ( c.width !== W ) { c.width = W; c.height = W; }
		const ctx = this.miniCtx || ( this.miniCtx = c.getContext( '2d' ) );
		const vh = this._vh;
		this.zoom += ( ( vh && Math.abs( vh.speed ) > 12 ? 0.55 : 1.1 ) - this.zoom ) * ( 1 - Math.exp( - dt / 0.2 ) );
		const pos = p.vehicle && g.vehicles?.driving ? g.vehicles.driving.pos : p.pos;
		const yaw = vh?.heading ?? p.yaw;
		// heading-up; the ground span per canvas width matches the old 340 px minimap
		const { toScreen } = map.draw( ctx, { cx: pos.x, cz: pos.z, ppm: this.zoom * W / 340, rot: - yaw, w: W, h: W }, { labels: false, priority: 0.6, u: s } );
		// at night the daylight relief would be the brightest thing on screen: dim it (markers and the player stay bright)
		const night = this.app.world?.sky?.night || 0;
		if ( night > 0.01 ) {
			ctx.save();
			ctx.setTransform( 1, 0, 0, 1, 0, 0 );
			ctx.fillStyle = `rgba(6, 8, 12, ${( 0.62 * Math.min( 1, night ) ).toFixed( 3 )})`;
			ctx.fillRect( 0, 0, W, W );
			ctx.restore();
		}
		const mid = W / 2, edge = 8 * s;
		const riding = g.vehicles?.driving?.pos;
		for ( const v of g.vehicles?.known?.() || [] ) {
			const vp = v.pos || v;
			if ( vp === riding ) continue; // the one we sit in is the chevron
			const [ sx, sy ] = toScreen( vp.x, vp.z );
			if ( sx > edge && sy > edge && sx < W - edge && sy < W - edge ) drawGlyph( ctx, 'car', sx, sy, 12 * s, { color: 'rgba(255,255,255,0.7)', lw: 1.25 * s, halo: s } );
		}
		for ( const m of g.markers?.list?.() || [] ) {
			const [ sx, sy ] = toScreen( m.x, m.z );
			// DayZ's palette: markers white, your body in the muted red
			const death = m.kind === 'death', col = death ? '#c33a32' : '#ffffff';
			if ( sx > edge && sy > edge && sx < W - edge && sy < W - edge ) {
				if ( death ) drawGlyph( ctx, 'skull', sx, sy, 12 * s, { color: col, lw: 1.5 * s, halo: s } );
				else if ( m.kind === 'locate' ) drawGlyph( ctx, 'marker', sx, sy, 12 * s, { color: col, lw: 2 * s, halo: s } );
				else drawGlyph( ctx, 'marker', sx, sy, 12 * s, { color: '#000', fillColor: col, lw: 1.5 * s } );
				continue;
			}
			// off the map: a small triangle on the edge, pointing at it
			const dx = sx - mid, dy = sy - mid, k = ( mid - edge ) / Math.max( Math.abs( dx ), Math.abs( dy ), 1e-6 );
			const a = Math.atan2( dy, dx ), r = 6 * s;
			ctx.save();
			ctx.translate( mid + dx * k, mid + dy * k ); ctx.rotate( a );
			ctx.beginPath(); ctx.moveTo( r * 0.6, 0 ); ctx.lineTo( - r * 0.4, - r * 0.55 ); ctx.lineTo( - r * 0.4, r * 0.55 ); ctx.closePath();
			ctx.lineWidth = 1.5 * s; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke();
			ctx.fillStyle = col; ctx.fill();
			ctx.restore();
		}
		// player: fixed chevron pointing up, white with a black edge
		drawGlyph( ctx, 'player', mid, mid, 16 * s, { color: '#fff', lw: 0 } );
		ctx.save();
		ctx.translate( mid - 8 * s, mid - 8 * s ); ctx.scale( 16 * s / 24, 16 * s / 24 );
		ctx.lineJoin = 'round'; ctx.lineWidth = 1.5 * s / ( 16 * s / 24 ); ctx.strokeStyle = '#000'; ctx.stroke( glyph( 'player' ).fill );
		ctx.restore();
		// N on the rim towards north: world -z lands at ( sin yaw, -cos yaw ) on the heading-up map (as in MapView's
		// toScreen); the map is a square, so the badge follows its edge
		const nx = Math.sin( yaw ), ny = - Math.cos( yaw ), nk = ( mid - 10 * s ) / Math.max( Math.abs( nx ), Math.abs( ny ) );
		const bx = mid + nx * nk, by = mid + ny * nk;
		ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect( bx - 7 * s, by - 7 * s, 14 * s, 14 * s );
		ctx.font = `700 ${10 * s}px 'Roboto Condensed', Roboto, Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillStyle = '#fff'; ctx.fillText( 'N', bx, by + 0.5 * s );
	}

	// ---- notifiers, stance, badges, stamina ------------------------------------------------------------------

	_vitals( S, dt, creative ) {
		let n = 0;
		for ( const o of this.ntf ) {
			const d = o.d, v = d.val( S );
			// trend: EMA of the rate of change in display units per minute
			if ( o.last !== null && dt > 0 ) o.rate += ( ( v - o.last ) / dt * 60 - o.rate ) * ( 1 - Math.exp( - dt / 2 ) );
			o.last = v;
			// tiers with a little hysteresis, so an arrow doesn't flicker on its threshold
			const th = d.tiers || TIERS, r = Math.abs( o.rate );
			let tier = o.tier;
			while ( tier < 3 && r >= th[ tier ] ) tier ++;
			while ( tier > 0 && r < th[ tier - 1 ] * 0.7 ) tier --;
			o.tier = tier;
			const on = ! creative && ( ! d.only || d.only( v, o.on ) );
			if ( on !== o.on ) { o.on = on; fade( o.el, on ); }
			if ( ! on ) continue;
			n ++;
			const st = d.state ? d.state( v ) : d.crit( v ) ? 'crit' : d.warn( v ) ? 'warn' : '';
			if ( st !== o.st ) { o.st = st; for ( const c of [ 'warn', 'crit', 'cold', 'freeze' ] ) flag( o.el, c, st === c ); }
			const shownTier = d.trendShows && ! d.trendShows( v ) ? 0 : tier;
			const dir = o.rate < 0 ? - 1 : 1;
			if ( shownTier !== o.shown || ( shownTier && dir !== o.dir ) ) {
				o.shown = shownTier; o.dir = dir;
				o.trPath.setAttribute( 'd', trendPath( shownTier, dir ) );
			}
			// green only where the change is good; a bad one turns red when fast or when the value is already low
			const good = shownTier > 0 && ( d.good ? d.good( v, dir ) : dir > 0 );
			flag( o.tr, 'good', good );
			flag( o.tr, 'bad', shownTier > 0 && ! good && ( shownTier >= 3 || !! st ) );
		}
		show( this.vitals, n > 0 );
	}

	_stance( p, inVeh ) {
		const name = inVeh ? null : p.swimming ? 'stance_swim' : p.stance === 'crouch' ? 'stance_crouch' : p.stance === 'prone' ? 'stance_prone' : 'stance_stand';
		show( this.stance, !! name );
		if ( name && name !== this._stanceName ) { this._stanceName = name; this.stanceIcon.innerHTML = PATHS[ name ]; }
	}

	_badges( S, inv, creative, input ) {
		const list = creative ? [] : S.conditions().filter( c => ! NO_BADGE.has( c.id ) );
		list.sort( ( a, b ) => ( BADGE_RANK.get( a.id ) ?? 99 ) - ( BADGE_RANK.get( b.id ) ?? 99 ) );
		const ids = new Set();
		let fresh = null;
		for ( const c of list ) {
			ids.add( c.id );
			let o = this.badgeEls.get( c.id );
			if ( ! o ) {
				o = { n: h( 'span.n', { hidden: true } ), lv: null, pips: null, label: null };
				// moodles carry a level 1-4: pips along the bottom edge
				if ( c.level ) { o.pips = [ 0, 1, 2, 3 ].map( () => h( 'i' ) ); o.lv = h( 'span.lv', {}, ...o.pips ); }
				o.el = h( 'div.badge.b-' + c.id, {}, icon( COND_ICON[ c.id ] || c.id ), o.lv, o.n );
				this.badgeEls.set( c.id, o );
			}
			if ( o.pips ) for ( let i = 0; i < 4; i ++ ) flag( o.pips[ i ], 'on', i < ( c.level || 0 ) );
			const count = c.id === 'bleed' && S.bleeding > 1 ? S.bleeding : 0;
			text( o.n, count || '' ); show( o.n, count > 0 );
			for ( const k of [ 'bad', 'warn', 'good', 'mild' ] ) flag( o.el, 'k-' + k, c.kind === k );
			// a new badge or a new label (Cold -> Hypothermia, Bleeding -> ×2, a moodle's level) is named for 4 s
			const lk = c.label + ( c.level ? '|' + c.level : '' );
			if ( lk !== o.label ) { o.label = lk; fresh ??= c; }
		}
		for ( const id of [ ...this.badgeEls.keys() ] ) if ( ! ids.has( id ) ) this.badgeEls.delete( id );
		if ( fresh ) { text( this.badgeCap, fresh.label ); fade( this.badgeCap, true ); this.capUntil = this.t + 4; }
		// K Bandage while bleeding with something that stops it
		const heal = ! creative && S.bleeding > 0 && !! inv.find( ( s, d ) => d?.medical?.bleed );
		const kl = heal ? input.label( 'quickHeal' ) : '';
		if ( heal && ( ! this.healChip || this.healChip._k !== kl ) ) { this.healChip = h( 'div.badge.act', {}, kc( kl ), h( 'span', { text: 'Bandage' } ) ); this.healChip._k = kl; }
		const key = list.map( c => c.id ).join( ',' ) + ( heal ? '|' + kl : '' );
		if ( key !== this._badgeKey ) {
			this._badgeKey = key;
			sync( this.badges, [ ...( heal ? [ this.healChip ] : [] ), ...list.map( c => this.badgeEls.get( c.id ).el ) ] );
		}
		show( this.badges, list.length > 0 || heal );
	}

	// the panic vignette: in from a third of panic, deeper as it climbs
	_panic( S, creative ) {
		const v = creative ? 0 : Math.max( 0, Math.min( 1, ( ( S.panic || 0 ) - 35 ) / 55 ) );
		show( this.vig, v > 0.01 );
		if ( v > 0.01 ) prop( this.vig, '--k', v.toFixed( 2 ) );
	}

	// DayZ's thin white bar: only while not full, flashing when nearly spent; underwater it shows the breath
	_stamina( S, p, creative, maxSt ) {
		const under = !! p.underwater || S.breath < 99.5;
		let f, max, low;
		if ( under ) { f = S.breath / 100; max = 1; low = S.breath < 25; } else { f = S.stamina / maxSt; max = maxSt / 100; low = S.stamina < 15; }
		if ( ! creative && ( under || S.stamina < maxSt - 0.5 ) ) this.wake( 'stamina' );
		flag( this.stamina, 'gone', creative || ! this.recent( 'stamina', 1 ) );
		prop( this.stamina, '--max', max.toFixed( 3 ) );
		fill( this.stamFill, f );
		flag( this.stamina, 'low', low );
		flag( this.stamina, 'air', under );
		if ( under !== this._under ) { this._under = under; this.stamIcon.style.display = under ? '' : 'none'; }
	}

	// ---- quickbar, weapon, vehicle ------------------------------------------------------------------------------

	_hotbar( inv ) {
		let any = false, qk = '';
		const st = [];
		for ( let i = 0; i < 9; i ++ ) {
			const s = inv.findUid( inv.hotbar[ i ] );
			if ( ! s && inv.hotbar[ i ] ) inv.hotbar[ i ] = null;
			st.push( s );
			if ( s ) { any = true; if ( s.uid !== inv.hands ) qk += s.uid + ':' + s.qty + ','; }
		}
		// a new binding, or a bound stack used from the bar (eaten, a bandage applied), shows it for a moment
		const key = inv.hotbar.join( ',' );
		if ( key !== this._hotKey ) { if ( this._hotKey != null ) this.wake( 'hotbar' ); this._hotKey = key; }
		else if ( qk !== this._qtyKey && this._qtyKey != null ) this.wake( 'hotbar' );
		this._qtyKey = qk;
		this._hotAny = any;
		// all nine slots, like DayZ's quickbar: an empty one is a dark square with its number
		for ( let i = 0; i < 9; i ++ ) {
			const o = this.hotSlots[ i ], s = st[ i ];
			flag( o.el, 'unb', ! s );
			// keyed by what it looks like too: a stack changed in place (dyed, cut into shorts) keeps its uid
			const k = s ? s.uid + '|' + lookKey( s ) : null;
			if ( k !== o.uid ) { o.uid = k; if ( s ) setIcon( o.img, lookKey( s ) ); else o.img.removeAttribute( 'src' ); }
			show( o.img, !! s );
			const a = s ? ammoOf( s ) : null;
			text( o.q, s ? ( a !== null ? a : s.qty > 1 ? s.qty : '' ) : '' );
			flag( o.el, 'on', !! s && s.uid === inv.hands );
		}
	}

	// The ammo counter (a setting, off like DayZ): rounds | spare and the fire mode under the weapon's name, the
	// name fading after a few seconds. Off, the readout still shows for a moment what changed: the weapon and its
	// mode when switched, the rounds after a reload or a check; a jam always shows.
	_weapon( g, held, d, set ) {
		const counter = !! set.get( 'ammoCounter' );
		show( this.weapon, !! held );
		this._jam = false; this._reload = false;
		if ( ! held ) { this._wUid = null; return; }
		const gun = d?.cat === 'firearm';
		let num = '', unit = '', res = '', mode = '', jam = false, tint = '';
		if ( gun ) {
			const rounds = ammoOf( held ) ?? 0, info = g.hands?.ammoInfo?.(), f = d.firearm;
			const spare = info?.reserve ?? 0;
			jam = info?.mode === 'jammed';
			mode = jam ? '' : info?.mode || '';
			num = rounds; res = spare;
			const cap = f.feed === 'internal' ? f.capacity : getItem( held.data.mag?.id || f.mags?.[ 0 ] )?.magazine?.capacity || 0;
			tint = rounds === 0 ? 'alarm' : cap && rounds <= cap * 0.2 ? 'warn' : '';
			this._jam = jam;
			this._reload = rounds === 0 && spare > 0 && ! jam;
		} else if ( d?.tool?.liquid || d?.fuel ) { num = ( held.data.amount || 0 ).toFixed( 1 ); unit = 'L'; }
		else if ( d?.tool?.battery && held.data.charge != null ) { num = Math.round( held.data.charge / d.tool.battery * 100 ); unit = '%'; }
		else if ( held.qty > 1 ) num = held.qty;
		// what woke it: a new item or mode (the name), the end of a reload or a check (the rounds)
		if ( held.uid !== this._wUid || mode !== this._wMode ) {
			if ( this._wUid !== undefined ) this.wake( 'wname' );
			this._wUid = held.uid; this._wMode = mode;
		}
		const ammoAct = gun && AMMO_ACT.test( g.hands?.act?.type || '' );
		if ( this._ammoAct && ! ammoAct ) this.wake( 'wammo' );
		this._ammoAct = ammoAct;
		const named = this.recent( 'wname', counter ? LINGER : BRIEF ) || this.mode === 'always';
		const counted = counter ? gun || named : gun ? this.recent( 'wammo', BRIEF ) : named;
		const showName = named, showNum = num !== '' && counted, showMode = !! mode && ( counter ? gun : named );
		text( this.wName, displayName( held ) ); show( this.wName, showName );
		text( this.wNum, num ); show( this.wNum, showNum );
		text( this.wUnit, unit ); show( this.wUnit, showNum && !! unit );
		text( this.wRes, res ); show( this.wRes, gun && showNum );
		text( this.wMode, mode ); show( this.wMode, showMode );
		show( this.wJam, jam );
		show( this.wRow, showNum || showMode || jam );
		flag( this.wRow, 'warn', counter && tint === 'warn' ); flag( this.wRow, 'alarm', counter && tint === 'alarm' );
		flag( this.weapon, 'gone', ! ( showName || showNum || showMode || jam ) );
	}

	// speed, fuel and condition in the notifiers' manner: white, yellow when low, red when nearly gone
	_vehicle( v ) {
		const boat = v.kind === 'boat', kmh = Math.abs( v.speed ) * 3.6;
		text( this.vName, v.name || '' );
		show( this.vGear, v.gear != null ); if ( v.gear != null ) text( this.vGear, v.gear );
		text( this.vSpd, Math.round( boat ? kmh / 1.852 : kmh ) );
		text( this.vUnit, boat ? 'kn' : 'km/h' );
		const fu = v.fuel || 0, hp = v.health || 0;
		fill( this.vFuel, fu ); text( this.vFuelPc, Math.round( fu * 100 ) + '%' );
		flag( this.vFuelRow, 'warn', fu < 0.25 && fu >= 0.1 ); flag( this.vFuelRow, 'crit', fu < 0.1 );
		fill( this.vHp, hp ); text( this.vHpPc, Math.round( hp * 100 ) + '%' );
		flag( this.vHpRow, 'warn', hp < 0.5 && hp >= 0.3 ); flag( this.vHpRow, 'crit', hp < 0.3 );
		show( this.vAltRow, v.altitude != null );
		if ( v.altitude != null ) text( this.vAlt, Math.round( v.altitude ) + ' m' );
	}

	// ---- prompt, timed action, damage (5.9, 5.10, 5.12) ----------------------------------------------------------

	// DayZ's prompt right of centre: the target's name in caps on a dark strip, [F] Action under it, then the other
	// actions in grey (a placeable's list: tap does the first, holding opens the list)
	_prompt( g, set, input, screen, inVeh ) {
		const t = g.interact?.target, busy = g.actions?.busy;
		let act = null, parts = null, hold = null;
		if ( ! screen && ! busy ) {
			if ( t && set.get( 'showInteractHints' ) !== false ) { act = t.key || 'interact'; if ( t.hold ) hold = Math.min( 1, ( g.interact.holdT || 0 ) / t.hold ); }
			else if ( ! t && ! inVeh && this._jam ) { act = 'reload'; parts = { name: '', act: 'Clear', info: '' }; }
			else if ( ! t && ! inVeh && this._reload && set.get( 'tutorial' ) ) { act = 'reload'; parts = { name: '', act: 'Reload', info: '' }; }
		}
		show( this.prompt, !! act );
		if ( ! act ) { this._pT = null; return; }
		const kl = input.label( act );
		if ( kl !== this._capKey ) { this._capKey = kl; this.pCap.replaceChildren( kc( kl ) ); }
		// the target's words change only with the target (or its label: a door opened, a placeable's state)
		if ( parts || t !== this._pT || t.label !== this._pL || t.sub !== this._pS ) {
			this._pT = parts ? null : t; this._pL = t?.label; this._pS = t?.sub;
			const pp = parts || promptParts( t );
			// the detail (weight, state, items inside) rides on the name's strip, or under the action without one
			text( this.pNameT, pp.name ); show( this.pName, !! pp.name );
			text( this.pNameI, pp.name ? pp.info : '' ); show( this.pNameI, !! pp.name && !! pp.info );
			text( this.pAct, pp.act );
			text( this.pInfo, pp.name ? '' : pp.info ); show( this.pInfo, ! pp.name && !! pp.info );
			let alts = [];
			if ( ! parts && t.plRec ) { try { alts = ( g.placeables?.actionsOf?.( t.plRec ) || [] ).slice( 1, 5 ).map( a => a.label ); } catch ( e ) { alts = []; } }
			const ak = alts.join( '|' );
			if ( ak !== this._altKey ) {
				this._altKey = ak;
				this.pAlt.replaceChildren( ...alts.map( l => h( 'div', { text: l } ) ), ...( alts.length ? [ h( 'div.more', { text: 'Hold for all' } ) ] : [] ) );
			}
			show( this.pAlt, alts.length > 0 );
		}
		// a hold fills a thin bar under the action
		show( this.pHold, hold != null );
		if ( hold != null ) fill( this.pHoldI, hold );
	}

	// a timed action: its name and the seconds left over a thin bar where the prompt was
	_action( g ) {
		const c = g.actions?.busy ? g.actions.current : null;
		if ( c ) {
			this._act = c; this._cancelT = 0;
			flag( this.tact, 'cancel', false );
			show( this.tact, true );
			fill( this.tBar, g.actions.progress || 0 );
			text( this.tName, c.label || '' );
			text( this.tSec, c.time != null ? Math.max( 0, c.time - ( c.t || 0 ) ).toFixed( 1 ) + ' s' : '' );
			return;
		}
		if ( this._act ) {
			const a = this._act;
			this._act = null;
			// cancelled (moved away): the bar flashes red for 200 ms
			if ( a.time != null && ( a.t || 0 ) < a.time - 1e-3 ) { flag( this.tact, 'cancel', true ); this._cancelT = this.t + 0.2; return; }
		}
		if ( this._cancelT && this.t < this._cancelT ) return;
		this._cancelT = 0;
		show( this.tact, false );
	}

	// hit from a direction: a soft red glow on that side of the screen, fading with lastHitDir.t
	_damage( S, p, set ) {
		const hd = S.lastHitDir;
		const on = !! hd && set.get( 'damageIndicators' ) !== false;
		if ( on !== this._dmgOn ) { this._dmgOn = on; this.dmg.style.display = on ? '' : 'none'; }
		if ( ! on ) return;
		// screen angle, clockwise from the top: the glow sits on the screen's edge there, its long side along it
		const a = Math.PI - Math.atan2( hd.dir.x, - hd.dir.z ) - p.yaw;
		const x = Math.sin( a ) * this._screenW * 0.5, y = - Math.cos( a ) * this._screenH * 0.5;
		this.dmg.style.transform = `translate(${x.toFixed( 0 )}px, ${y.toFixed( 0 )}px) rotate(${( a * 180 / Math.PI ).toFixed( 1 )}deg)`;
		this.dmg.style.opacity = Math.min( 1, hd.t * 1.2 ).toFixed( 2 );
	}

	// toasts start under the FPS / debug block; its height is known from what it shows, so no layout read.
	// Over a screen the HUD (and its FPS block) is hidden: the map puts them under its title plate, the
	// inventory in the middle of its top bar (css), anything else in the corner.
	_placeFeed() {
		const at = this._feedAt || '';
		flag( this.feed, 'at-inv', at === 'inv' ); flag( this.feed, 'at-map', at === 'map' );
		if ( at ) { this.feed.style.top = ''; return; }
		let top = 24;
		if ( this._fpsOn ) top += 14 + 6;
		if ( this.debugOn ) top += ( this._debugLines || 9 ) * 16 + 16 + 8;
		this.feed.style.top = `calc(${top} * var(--u))`;
	}

	_debug() {
		const g = this.game, p = g.player, r = this.app.renderer?.gl?.info, S = g.survival;
		const cs = g.creatures?.stats?.() || {};
		const f = ( v, n = 1 ) => ( typeof v === 'number' ? v.toFixed( n ) : '-' );
		const lines = [
			`${Math.round( this.app.fps )} fps  ${r?.render.calls ?? 0} draws  ${( ( r?.render.triangles || 0 ) / 1e3 ).toFixed( 0 )}k tris  ${r?.memory.geometries ?? 0} geos  ${r?.memory.textures ?? 0} tex`,
			`XYZ ${f( p.pos.x )} ${f( p.pos.y, 2 )} ${f( p.pos.z )}  facing ${Math.round( headingOf( p.yaw ) )}°`,
			`ground ${f( g.hf?.heightAt?.( p.pos.x, p.pos.z ), 2 )}  water ${f( g.physics?.waterLevel?.( p.pos.x, p.pos.z ), 2 )}  island ${g.hf?.islandAt?.( p.pos.x, p.pos.z )}`,
			`surface ${( g.hf?.surfaceAt?.( p.pos.x, p.pos.z ) || [] ).map( v => typeof v === 'number' ? v.toFixed( 2 ) : v ).join( ' ' )}  flags ${g.hf?.flagsNear?.( p.pos.x, p.pos.z )}`,
			`stance ${p.stance}${p.sprinting ? ' sprint' : ''}${p.swimming ? ' swim' : ''}${p.flying ? ' fly' : ''}  speed ${f( p.speedNow )} m/s`,
			`time ${hhmm( g.hour )} day ${g.day}  weather ${g.weather?.state} rain ${f( g.weather?.rain, 2 )} cover ${f( g.weather?.cover, 2 )}`,
			`entities ${g.entities?.list?.length ?? 0}  zombies ${g.entities?.count?.( 'zombie' ) ?? 0}  animals ${g.entities?.count?.( 'animal' ) ?? 0}  vehicles ${g.entities?.count?.( 'vehicle' ) ?? 0}  items ${g.entities?.count?.( 'item' ) ?? 0}`,
			`workers ${this.app.world?.pool?.busy ?? 0}  terrain ${this.app.world?.terrain?.loadedCount ?? 0}  ${Object.entries( cs ).map( ( [ k, v ] ) => k + ' ' + v ).join( '  ' )}`,
			`hp ${f( S.health )} blood ${f( S.blood, 0 )} food ${f( S.hunger )} water ${f( S.thirst )} temp ${f( S.temp, 2 )} env ${f( S.envTemp )} wet ${f( S.wet, 2 )} weight ${f( p.inventory.totalWeight() )} kg`,
		];
		text( this.debug, lines.join( '\n' ) );
		if ( lines.length !== this._debugLines ) { this._debugLines = lines.length; this._placeFeed(); }
	}
}
