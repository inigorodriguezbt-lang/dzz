// In-game HUD (docs/UI_SPEC.md 5): crosshair, hit marker, compass + heading tab, location card, minimap,
// vitals strip, conditions, weapon / vehicle panel, hotbar, stamina, key hints, interaction prompt,
// timed-action ring, damage arc, toasts, pickups, FPS and debug.
// Every element is built once. update() writes to the DOM only when a formatted value or a class changes
// (the helpers below cache the last write) and never reads layout, so an idle frame costs a few compares.
import { h, kc, fmtDist } from './dom.js';
import { icon, PATHS } from './icons.js';
import { getItem, displayName, ammoOf } from '../game/items/ItemDB.js';
import { setIcon } from './itemIcons.js';

const LINGER = 3; // s an element stays after whatever woke it stops (5.2)
const NS = 'http://www.w3.org/2000/svg';

// ---- cached DOM writes ------------------------------------------------------------------------------
function text( el, v ) { v = String( v ); if ( el._t !== v ) { el._t = v; el.textContent = v; } }
function flag( el, c, on ) { on = !! on; const k = '$' + c; if ( el[ k ] !== on ) { el[ k ] = on; el.classList.toggle( c, on ); } }
function show( el, on ) { on = !! on; if ( el._s !== on ) { el._s = on; el.hidden = ! on; } }
function fill( el, f ) { const v = ( Math.max( 0, Math.min( 1, f || 0 ) ) * 100 ).toFixed( 1 ) + '%'; if ( el._w !== v ) { el._w = v; el.style.width = v; } }
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
// trend marks beside a vital's icon: 1-3 chevrons stacked in a 12 x 16 box, pointing up (rising) or down (falling)
const TREND_Y = [ [], [ 8 ], [ 5.5, 10.5 ], [ 3, 8, 13 ] ];
const trendPath = ( n, dir ) => TREND_Y[ n ].map( y => `M1.5 ${y + 2.25 * dir}L6 ${y - 2.25 * dir}L10.5 ${y + 2.25 * dir}` ).join( '' );

// ---- vitals (5.5): value in display units, show / low / critical thresholds, trend tiers per minute --------
const VITALS = [
	{ k: 'health', val: S => S.health, show: v => v < 95, low: v => v < 50, crit: v => v < 25 },
	{ k: 'blood', val: S => S.blood / 50, show: v => v < 95, low: v => v < 76, crit: v => v < 60 },
	{ k: 'food', val: S => Math.min( 100, S.hunger ), show: v => v < 50, low: v => v < 30, crit: v => v < 10 },
	{ k: 'water', val: S => Math.min( 100, S.thirst ), show: v => v < 50, low: v => v < 30, crit: v => v < 10 },
	{ k: 'temp', val: S => S.temp, show: v => v < 36 || v > 37.8, fmt: v => v.toFixed( 1 ) + '°', frac: v => 1 - Math.min( 1, Math.abs( v - 36.9 ) / 2.2 ),
		state: v => v < 35.2 || v > 38.6 ? 'crit' : v < 36 ? 'cold' : v > 38 ? 'warn' : '', tiers: [ 0.08, 0.3, 0.9 ],
		// body heat drifts with every sprint; a trend only matters once it nears the edge of the comfort band
		trendWakes: v => v < 36.4 || v > 37.4 },
	{ k: 'energy', val: S => S.energy, show: v => v < 30, low: v => v < 25, crit: v => v < 10 },
];
const TIERS = [ 4, 15, 45 ];
export const COND_ICON = { blood: 'blood', tired: 'energy' }; // condition id -> icon when they differ

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
		this.fps = h( 'div.fps.plate', { hidden: true } );
		this.debug = h( 'div.debug.t-mono', { hidden: true } );
		this.tl = h( 'div.tl', {}, this.fps, this.debug );
		this.feed = h( 'div.feed' );

		// centre
		this.cross = h( 'div.crosshair' );
		this.hit = h( 'div.hitmarker', {}, h( 'i' ), h( 'i' ), h( 'i' ), h( 'i' ) );
		// one 36° arc of radius 120 at the top, rotated towards the hit
		this.dmg = svg( 'dmg', '-120 -120 240 240', '<path d="M-37.08 -114.13A120 120 0 0 1 37.08 -114.13"/>' );
		this.dmg.style.display = 'none';
		this.ring = svg( 'ring', '0 0 48 48', '<circle class="track" cx="24" cy="24" r="21"/><circle class="arc" cx="24" cy="24" r="21" stroke-dasharray="131.9" stroke-dashoffset="131.9"/>' );
		this.ring.style.display = 'none';
		this.ringArc = this.ring.querySelector( '.arc' );
		this.ringLabel = h( 'div.ring-label.plate', { hidden: true }, this.ringName = h( 'span.t-strong' ), this.ringSec = h( 'span.s' ) );
		this.prompt = h( 'div.prompt.plate', { hidden: true }, this.promptCap = h( 'span.cap' ), this.promptLbl = h( 'span.lbl' ), this.promptSub = h( 'span.sub', { hidden: true } ) );

		// top centre: compass, heading tab, location card
		this.strip = h( 'div.compass-strip' );
		this.compass = h( 'div.compass.plate', {}, this.strip, h( 'div.compass-needle' ) );
		this.heading = h( 'div.heading.plate', {}, this.headDeg = h( 'span' ), this.headDist = h( 'span.d', { hidden: true } ) );
		this.place = h( 'div.place.plate', { hidden: true }, this.placeName = h( 'div.t-title' ), this.placeIsl = h( 'div.isl.t-label' ) );
		this._buildCompass();

		// top right: minimap
		this.miniCanvas = h( 'canvas', { width: 184, height: 184 } );
		this.minimap = h( 'div.minimap.plate', {}, this.miniCanvas, h( 'div.foot', {}, this.miniPlace = h( 'span' ), this.miniTime = h( 'span' ) ) );

		// bottom left: conditions over the vitals strip
		this.conds = h( 'div.conds', { hidden: true } );
		this.vitals = h( 'div.vitals', { hidden: true } );
		this.vit = VITALS.map( d => {
			const tr = svg( 'tr', '0 0 12 16', '<path/>' );
			const v = h( 'span.v' ), bar = h( 'i' );
			const el = h( 'div.vital.fade', {}, icon( d.k ), tr, v, h( 'div.meter', {}, bar ) );
			return { d, el, v, bar, tr, trPath: tr.firstChild, rate: 0, last: null, tier: 0, dir: 0, inDom: false, fadeT: 0 };
		} );
		this.bl = h( 'div.bl', {}, this.conds, this.vitals );
		this.condEls = new Map();

		// bottom centre: key hints, stamina, hotbar
		this.keyhints = h( 'div.keyhints.plate.fade', { hidden: true } );
		this.stamina = h( 'div.stamina.fade.gone', {}, this.stamFill = h( 'i' ), this.stamIcon = icon( 'breath', 12 ) );
		this.stamIcon.style.display = 'none';
		this.hotbar = h( 'div.hotbar.fade', { hidden: true } );
		this.hotSlots = [];
		for ( let i = 0; i < 9; i ++ ) {
			const img = h( 'img', { alt: '' } ), q = h( 'span.q' ), n = h( 'span.n', { text: i + 1 } );
			const el = h( 'div.hot.plate', { hidden: true }, img, n, q );
			this.hotSlots.push( { el, img, q, uid: null } );
			this.hotbar.appendChild( el );
		}
		this.bc = h( 'div.bc', {}, this.keyhints, this.stamina, this.hotbar );

		// bottom right: pickups over the weapon or vehicle panel
		this.pickups = h( 'div.pickups' );
		this.pickQ = [];
		// the name row and the condition bar each sit in a one-row grid that collapses to 0fr (idle, aiming)
		this.weapon = h( 'div.weapon.plate.fade', { hidden: true },
			h( 'div.wn', {}, h( 'div', {}, this.wName = h( 'div.name.t-label' ) ) ),
			this.wAmmo = h( 'div.ammo', {},
				this.wNum = h( 'span.t-num' ), this.wUnit = h( 'span.unit.t-label', { hidden: true } ),
				// reserve rounds after a hairline: '31 | 60' (loaded | spare)
				this.wRes = h( 'span.res', {}, this.wResN = h( 'span' ) ),
				this.wMode = h( 'span.mode.t-label' ), this.wJam = h( 'span.jam.t-label', { hidden: true, text: 'Jam' } ) ),
			this.wBarWrap = h( 'div.wb', {}, h( 'div', {}, this.wBar = h( 'div.meter', {}, this.wBarI = h( 'i' ) ) ) ) );
		this.vehicle = h( 'div.vehicle.plate', { hidden: true },
			h( 'div.top', {}, this.vName = h( 'span.t-label' ), this.vGear = h( 'span.gear.t-label' ) ),
			h( 'div.spd', {}, this.vSpd = h( 'span.t-num' ), this.vUnit = h( 'span.t-label' ) ),
			h( 'div.g', {}, icon( 'fuel' ), this.vFuelM = h( 'div.meter', {}, this.vFuel = h( 'i' ) ), this.vFuelPc = h( 'span.pc' ) ),
			h( 'div.g', {}, icon( 'wrench' ), this.vHpM = h( 'div.meter', {}, this.vHp = h( 'i' ) ), this.vHpPc = h( 'span.pc' ) ),
			this.vAltRow = h( 'div.g', { hidden: true }, icon( 'altitude' ), this.vAlt = h( 'span.alt' ) ) );
		this.br = h( 'div.br', {}, this.pickups, this.weapon, this.vehicle );

		this.el.append( this.tl, this.dmg, this.cross, this.hit, this.ring, this.ringLabel, this.prompt, this.compass, this.heading, this.place, this.minimap, this.bl, this.bc, this.br );
		this.zoom = 1.1;
		this.miniDt = 0;
		this.hitT = 0;
		this.toasts = []; this.picks = [];
		this._screenH = innerHeight;
		addEventListener( 'resize', () => { this._screenH = innerHeight; } );
	}

	attach( game ) {
		this.game = game;
		this.t = 0;
		this.seen = {}; this.ticks = {};
		this._hintObj = undefined; this._hintKey = null;
		this.placeCur = null; this.placeShown = null; this.placeSeen = new Map(); this.placeAt = 0; this.placeHide = 0; this.placeOut = 0;
		for ( const o of this.vit ) { o.last = null; o.rate = 0; o.tier = 0; }
		this.condEls.clear(); this.conds.replaceChildren(); this._condKey = null;
		this.pickups.replaceChildren(); this.pickQ = []; this.picks = [];
		this.feed.replaceChildren(); this.toasts = [];
		this._lastInv = - 1; this._hands = undefined; this._hotKey = null;
		this._mKey = null; this._act = null; this._cancelT = 0; this._allow = undefined; this._wKey = null;
		const on = ( n, f ) => this.ui.offs.push( game.events.on( n, f ) );
		on( 'toast', t => this.toast( t.text, t.kind, t.icon ) );
		on( 'hitmarker', e => this.hitmarker( e ) );
		on( 'item:pick', e => this.pickup( e.stack ) );
	}

	wake( key ) { this.seen[ key ] = this.t; }
	// time-based cadence, so slow frames don't stretch the refresh (vitals 10 Hz, conditions 3 Hz, place 2 Hz)
	due( key, period ) { const last = this.ticks[ key ] ?? - 1e9; if ( this.t - last < period ) return 0; this.ticks[ key ] = this.t; return Math.min( 1, this.t - last ); }
	shown( key, cond, linger = LINGER ) { return this.mode === 'always' || cond || this.t - ( this.seen[ key ] ?? - 99 ) < linger; }

	toggleDebug() {
		this.debugOn = ! this.debugOn;
		this.debug.hidden = ! this.debugOn;
		if ( this.debugOn && this.game ) this._debug();
		this._placeFeed();
	}

	// ---- events -----------------------------------------------------------------------------------------

	// Toasts and pickups live on HUD time (not timers), so a stalled frame or a hidden tab never eats them.
	// One line on a plate: item render when there is one, else a warn / bad dot. A repeat within 2 s bumps ×N.
	toast( text, kind = 'info', iconId = null ) {
		const life = kind === 'bad' ? 5 : 3.5;
		if ( kind === 'bad' || kind === 'warn' ) this.app.audio.ui?.( 'ui_error', 0.25 );
		const old = this.toasts.find( o => o.text === text && ! o.out );
		if ( old && this.t - old.at < 2 ) {
			old.n ++; old.at = this.t; old.until = this.t + life;
			old.x.textContent = '×' + old.n; old.x.hidden = false;
			return;
		}
		const el = h( 'div.toast.plate' );
		if ( iconId ) { const img = h( 'img', { alt: '' } ); setIcon( img, iconId ); el.appendChild( img ); }
		else if ( kind === 'warn' || kind === 'bad' ) el.appendChild( h( 'span.sd.' + kind ) );
		const x = h( 'span.x', { hidden: true } );
		el.append( h( 'span', { text } ), x );
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
		const el = h( 'div.pickup.plate', {}, img, h( 'span', { text: name } ), x );
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

	hitmarker( e ) {
		if ( ! this.app.settings.get( 'hitMarkers' ) ) return;
		this.hit.classList.toggle( 'kill', !! e.kill );
		this.hit.classList.add( 'on' );
		this.hitT = e.kill ? 0.35 : 0.18;
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
		const always = this.mode === 'always';
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
		if ( aiming && ! this._aim ) this.wake( 'weapon' );
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

		// what the settings and carried items allow (checked twice a second: inventory scans are not free)
		if ( this.due( 'allow', 0.5 ) || this._allow === undefined ) {
			const real = set.get( 'realisticMap' );
			this._allow = {
				compass: set.get( 'compass' ) !== false && ( ! real || creative || inv.count( 'compass' ) > 0 ),
				map: set.get( 'minimap' ) !== false && ( ! real || creative || inv.count( 'map_hawaii' ) > 0 ),
				clock: ! real || creative || inv.count( 'watch' ) > 0,
				maxSt: S.maxStamina(),
			};
		}
		const allow = this._allow;

		this._crosshair( g, set, aiming || inVeh || screen );
		if ( this.hitT > 0 ) { this.hitT -= dt; if ( this.hitT <= 0 ) this.hit.classList.remove( 'on' ); }
		this._compass( g, p, vh, allow.compass, frame );
		this._placeCard( g, p, screen );
		show( this.minimap, allow.map );
		this.miniDt += dt;
		if ( allow.map && frame % 2 === 0 ) { this._minimap( this.miniDt, allow.clock ); this.miniDt = 0; }

		// vitals at 10 Hz, conditions three times a second
		const vdt = this.due( 'vitals', 0.1 );
		if ( vdt ) this._vitals( S, vdt, creative, always );
		if ( this.due( 'conds', 0.33 ) ) this._conditions( S, inv, creative, input );
		if ( frame % 2 === 0 ) this._stamina( S, p, creative, allow.maxSt );

		// hotbar: slot keys, the wheel, a new held item or new bindings wake it
		if ( ! screen && ! inVeh ) {
			for ( let i = 1; i <= 9; i ++ ) if ( input.codes( 'slot' + i ).some( c => input.codePressed( c ) ) ) { this.wake( 'hotbar' ); break; }
			if ( input.codePressed( 'WheelUp' ) || input.codePressed( 'WheelDown' ) ) this.wake( 'hotbar' );
		}
		if ( inv.hands !== this._hands ) { if ( this._hands !== undefined ) this.wake( 'hotbar' ); this._hands = inv.hands; }
		if ( inv.version !== this._lastInv || frame % 30 === 0 ) { this._lastInv = inv.version; this._hotbar( inv ); }
		show( this.hotbar, this._hotAny && ! inVeh );
		flag( this.hotbar, 'gone', ! this.shown( 'hotbar', false ) );

		if ( frame % 4 === 0 ) this._weapon( g, inv, aiming, inVeh, always );
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
			if ( names[ deg ] ) frag.appendChild( h( 'span.compass-label.t-label' + ( deg % 90 === 0 ? '.card' : '' ), { style: { left }, text: names[ deg ] } ) );
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

	_placeCard( g, p, screen ) {
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
			text( this.placeName, pl.name );
			const isl = pl.island && pl.island !== pl.name ? pl.island : '';
			text( this.placeIsl, isl ); show( this.placeIsl, !! isl );
			clearTimeout( card._ft );
			card.classList.remove( 'gone' );
			card.hidden = false;
			this.placeHide = this.t + 3;
			this.placeOut = 0;
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
			const death = m.kind === 'death', col = death ? '#FF5C5C' : '#FF7A2E';
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
		// N badge on the rim towards north: world -z lands at ( sin yaw, -cos yaw ) on the heading-up map (as in
		// MapView's toScreen); the map is a rounded square, so the badge follows its edge
		const nx = Math.sin( yaw ), ny = - Math.cos( yaw ), nk = ( mid - 10 * s ) / Math.max( Math.abs( nx ), Math.abs( ny ) );
		const bx = mid + nx * nk, by = mid + ny * nk;
		ctx.beginPath(); ctx.arc( bx, by, 8 * s, 0, Math.PI * 2 ); ctx.fillStyle = '#121316'; ctx.fill();
		ctx.font = `600 ${10 * s}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillStyle = '#fff'; ctx.fillText( 'N', bx, by + 0.5 * s );
	}

	// ---- vitals, conditions, stamina (5.5, 5.6, 5.12) ------------------------------------------------------------

	_vitals( S, dt, creative, always ) {
		let dirty = false, n = 0;
		for ( const o of this.vit ) {
			const d = o.d, v = d.val( S );
			// trend: EMA of the rate of change in display units per minute
			if ( o.last !== null && dt > 0 ) o.rate += ( ( v - o.last ) / dt * 60 - o.rate ) * ( 1 - Math.exp( - dt / 1.5 ) );
			o.last = v;
			const th = d.tiers || TIERS, r = Math.abs( o.rate );
			const tier = r >= th[ 2 ] ? 3 : r >= th[ 1 ] ? 2 : r >= th[ 0 ] ? 1 : 0;
			const key = 'v.' + d.k;
			if ( d.show( v ) || ( tier >= 1 && ( ! d.trendWakes || d.trendWakes( v ) ) ) ) this.wake( key );
			const want = ! creative && ( always || this.shown( key, false ) );
			if ( want ) {
				if ( ! o.inDom ) { o.inDom = true; dirty = true; }
				if ( o.fadeT ) { o.fadeT = 0; }
				flag( o.el, 'gone', false );
			} else if ( o.inDom ) {
				if ( ! o.fadeT ) { o.fadeT = this.t + 0.4; flag( o.el, 'gone', true ); } else if ( this.t >= o.fadeT ) { o.fadeT = 0; o.inDom = false; dirty = true; }
			}
			if ( o.inDom ) n ++;
			if ( ! o.inDom ) continue;
			text( o.v, d.fmt ? d.fmt( v ) : Math.round( v ) );
			fill( o.bar, d.frac ? d.frac( v ) : v / 100 );
			const st = d.state ? d.state( v ) : d.crit( v ) ? 'crit' : d.low( v ) ? 'warn' : '';
			flag( o.el, 'crit', st === 'crit' ); flag( o.el, 'warn', st === 'warn' ); flag( o.el, 'cold', st === 'cold' );
			const dir = o.rate < 0 ? - 1 : 1;
			if ( tier !== o.tier || ( tier && dir !== o.dir ) ) {
				o.tier = tier; o.dir = dir;
				o.trPath.setAttribute( 'd', trendPath( tier, dir ) );
			}
		}
		if ( dirty ) sync( this.vitals, this.vit.filter( o => o.inDom ).map( o => o.el ) );
		show( this.vitals, n > 0 );
	}

	_conditions( S, inv, creative, input ) {
		// Low blood repeats the blood cell of the vitals strip (it always shows by then): the Status screen keeps it
		const bloodCell = this.vit[ 1 ].inDom;
		const list = creative ? [] : S.conditions().filter( c => ! ( c.id === 'blood' && bloodCell ) );
		const ids = new Set();
		for ( const c of list ) {
			ids.add( c.id );
			let o = this.condEls.get( c.id );
			if ( ! o ) {
				o = { lab: h( 'span' ), x: h( 'span.x', { hidden: true } ), label: null, until: 0 };
				o.el = h( 'div.cond.plate.fade', {}, icon( COND_ICON[ c.id ] || c.id ), o.lab, o.x );
				this.condEls.set( c.id, o );
			}
			// the label shows for 6 s when the condition appears or changes (Cold -> Hypothermia, Bleeding -> ×2)
			if ( c.label !== o.label ) { o.label = c.label; o.until = this.t + 6; }
			const open = this.t < o.until;
			const extra = c.id === 'bleed' && S.bleeding > 1 ? '×' + S.bleeding : '';
			text( o.lab, open ? c.label : '' ); show( o.lab, open );
			text( o.x, extra ); show( o.x, ! open && !! extra );
			flag( o.el, 'lab', open || !! extra );
			for ( const k of [ 'bad', 'warn', 'good' ] ) flag( o.el, 'k-' + k, c.kind === k );
		}
		for ( const id of [ ...this.condEls.keys() ] ) if ( ! ids.has( id ) ) this.condEls.delete( id );
		// K Bandage while bleeding with something that stops it
		const heal = ! creative && S.bleeding > 0 && !! inv.find( ( s, d ) => d?.medical?.bleed );
		const kl = heal ? input.label( 'quickHeal' ) : '';
		if ( heal && ( ! this.healChip || this.healChip._k !== kl ) ) { this.healChip = h( 'div.cond.plate.act.fade', {}, kc( kl ), h( 'span', { text: 'Bandage' } ) ); this.healChip._k = kl; }
		const key = list.map( c => c.id ).join( ',' ) + ( heal ? '|' + kl : '' );
		if ( key !== this._condKey ) {
			this._condKey = key;
			sync( this.conds, [ ...list.map( c => this.condEls.get( c.id ).el ), ...( heal ? [ this.healChip ] : [] ) ] );
		}
		show( this.conds, list.length > 0 || heal );
	}

	_stamina( S, p, creative, maxSt ) {
		const under = !! p.underwater || S.breath < 99.5;
		let f, max, low;
		if ( under ) { f = S.breath / 100; max = 1; low = S.breath < 25; } else { f = S.stamina / maxSt; max = maxSt / 100; low = S.stamina < 20; }
		if ( ! creative && ( under || S.stamina < maxSt - 0.5 ) ) this.wake( 'stamina' );
		flag( this.stamina, 'gone', creative || ! ( this.t - ( this.seen.stamina ?? - 99 ) < 1 ) );
		prop( this.stamina, '--max', max.toFixed( 3 ) );
		fill( this.stamFill, f );
		flag( this.stamina, 'low', low );
		if ( under !== this._under ) { this._under = under; this.stamIcon.style.display = under ? '' : 'none'; }
	}

	// ---- hotbar, weapon, vehicle ------------------------------------------------------------------------------

	_hotbar( inv ) {
		let top = 0;
		const st = [];
		for ( let i = 0; i < 9; i ++ ) {
			const s = inv.findUid( inv.hotbar[ i ] );
			if ( ! s && inv.hotbar[ i ] ) inv.hotbar[ i ] = null;
			st.push( s );
			if ( s ) top = i + 1;
		}
		const key = inv.hotbar.join( ',' );
		if ( key !== this._hotKey ) { if ( this._hotKey != null ) this.wake( 'hotbar' ); this._hotKey = key; }
		this._hotAny = top > 0;
		// slots 1 up to the highest bound one; unbound ones in between keep their place as faint plates
		for ( let i = 0; i < 9; i ++ ) {
			const o = this.hotSlots[ i ], s = st[ i ];
			show( o.el, i < top );
			if ( i >= top ) continue;
			flag( o.el, 'unb', ! s );
			if ( ( s?.uid || null ) !== o.uid ) { o.uid = s?.uid || null; if ( s ) setIcon( o.img, s.id ); else o.img.removeAttribute( 'src' ); }
			show( o.img, !! s );
			const a = s ? ammoOf( s ) : null;
			text( o.q, s ? ( a !== null ? a : s.qty > 1 ? s.qty : '' ) : '' );
			flag( o.el, 'on', !! s && s.uid === inv.hands );
		}
	}

	_weapon( g, inv, aiming, inVeh, always ) {
		const held = inVeh ? null : inv.heldStack();
		show( this.weapon, !! held );
		this._jam = false; this._reload = false;
		if ( ! held ) return;
		const d = getItem( held.id );
		const gun = d?.cat === 'firearm';
		let num = '', unit = '', res = null, mode = '', jam = false, bar = null, tint = '';
		if ( gun ) {
			const rounds = ammoOf( held ) ?? 0, info = g.hands?.ammoInfo?.(), f = d.firearm;
			res = info?.reserve ?? 0;
			jam = info?.mode === 'jammed';
			mode = jam ? '' : info?.mode || '';
			num = rounds; bar = held.cond;
			const cap = f.feed === 'internal' ? f.capacity : getItem( held.data.mag?.id || f.mags?.[ 0 ] )?.magazine?.capacity || 0;
			tint = rounds === 0 ? 'alarm' : cap && rounds <= cap * 0.2 ? 'warn' : '';
			this._jam = jam;
			this._reload = rounds === 0 && res > 0 && ! jam;
		} else if ( d?.tool?.liquid || d?.fuel ) { num = ( held.data.amount || 0 ).toFixed( 1 ); unit = 'L'; }
		else if ( d?.tool?.battery && held.data.charge != null ) { num = Math.round( held.data.charge / d.tool.battery * 100 ); unit = '%'; }
		else if ( held.qty > 1 ) num = held.qty;
		else if ( d?.cat === 'melee' || d?.cat === 'tool' ) bar = held.cond;
		// a new item, a round fired or loaded, a mode switch: expand for LINGER seconds
		const key = `${held.uid}|${num}|${res}|${mode}|${jam}`;
		if ( key !== this._wKey ) { this._wKey = key; this.wake( 'weapon' ); }
		const fresh = this.shown( 'weapon', false );
		text( this.wName, displayName( held ) );
		show( this.wAmmo, num !== '' );
		text( this.wNum, num );
		text( this.wUnit, unit ); show( this.wUnit, !! unit );
		show( this.wRes, gun ); if ( gun ) text( this.wResN, res );
		text( this.wMode, mode ); show( this.wMode, !! mode );
		show( this.wJam, jam );
		show( this.wBarWrap, bar != null );
		if ( bar != null ) { fill( this.wBarI, bar ); flag( this.wBar, 'warn', bar < 0.5 && bar >= 0.25 ); flag( this.wBar, 'alarm', bar < 0.25 ); }
		flag( this.weapon, 'warn', tint === 'warn' ); flag( this.weapon, 'alarm', tint === 'alarm' );
		// firearms collapse to the ammo row when idle or aiming; anything else fades out entirely
		flag( this.weapon, 'col', gun && ! always && ( aiming || ! fresh ) );
		flag( this.weapon, 'gone', ! gun && ! fresh );
	}

	_vehicle( v ) {
		const boat = v.kind === 'boat', kmh = Math.abs( v.speed ) * 3.6;
		text( this.vName, v.name || '' );
		show( this.vGear, v.gear != null ); if ( v.gear != null ) text( this.vGear, v.gear );
		text( this.vSpd, Math.round( boat ? kmh / 1.852 : kmh ) );
		text( this.vUnit, boat ? 'kn' : 'km/h' );
		fill( this.vFuel, v.fuel ); text( this.vFuelPc, Math.round( ( v.fuel || 0 ) * 100 ) + '%' ); flag( this.vFuelM, 'alarm', v.fuel < 0.15 );
		fill( this.vHp, v.health ); text( this.vHpPc, Math.round( ( v.health || 0 ) * 100 ) + '%' ); flag( this.vHpM, 'alarm', v.health < 0.3 );
		show( this.vAltRow, v.altitude != null );
		if ( v.altitude != null ) text( this.vAlt, Math.round( v.altitude ) + ' m' );
	}

	// ---- prompt, timed action, damage (5.9, 5.10, 5.12) ----------------------------------------------------------

	_prompt( g, set, input, screen, inVeh ) {
		const t = g.interact?.target, busy = g.actions?.busy;
		let act = null, label = '', sub = '', hold = null;
		if ( ! screen && ! busy ) {
			if ( t && set.get( 'showInteractHints' ) !== false ) { act = t.key || 'interact'; label = t.label; sub = t.sub || ''; if ( t.hold ) hold = Math.min( 1, ( g.interact.holdT || 0 ) / t.hold ); }
			else if ( ! t && ! inVeh && this._jam ) { act = 'reload'; label = 'Clear'; }
			else if ( ! t && ! inVeh && this._reload && set.get( 'tutorial' ) ) { act = 'reload'; label = 'Reload'; }
		}
		show( this.prompt, !! act );
		if ( ! act ) return;
		// hold targets fill a ring around the key cap instead of saying "hold"
		const capKey = input.label( act ) + ( hold != null ? ':h' : '' );
		if ( capKey !== this._capKey ) {
			this._capKey = capKey;
			const cap = kc( input.label( act ) );
			this.promptCap.replaceChildren( hold != null ? h( 'span.kc-hold', {}, cap ) : cap );
			this._holdEl = hold != null ? this.promptCap.firstChild : null;
		}
		if ( this._holdEl ) prop( this._holdEl, '--p', hold.toFixed( 3 ) );
		text( this.promptLbl, label );
		text( this.promptSub, sub ); show( this.promptSub, !! sub );
	}

	_action( g ) {
		const c = g.actions?.busy ? g.actions.current : null;
		if ( c ) {
			this._act = c; this._cancelT = 0;
			flag( this.ring, 'cancel', false );
			if ( this.ring.style.display ) this.ring.style.display = '';
			show( this.ringLabel, true );
			const off = ( 131.9 * ( 1 - ( g.actions.progress || 0 ) ) ).toFixed( 1 );
			if ( off !== this._off ) { this._off = off; this.ringArc.setAttribute( 'stroke-dashoffset', off ); }
			text( this.ringName, c.label || '' );
			text( this.ringSec, c.time != null ? Math.max( 0, c.time - ( c.t || 0 ) ).toFixed( 1 ) + ' s' : '' );
			return;
		}
		if ( this._act ) {
			const a = this._act;
			this._act = null;
			// cancelled (moved away): the arc flashes red for 200 ms
			if ( a.time != null && ( a.t || 0 ) < a.time - 1e-3 ) { flag( this.ring, 'cancel', true ); this._cancelT = this.t + 0.2; show( this.ringLabel, false ); return; }
		}
		if ( this._cancelT && this.t < this._cancelT ) return;
		this._cancelT = 0;
		if ( ! this.ring.style.display ) this.ring.style.display = 'none';
		show( this.ringLabel, false );
	}

	_damage( S, p, set ) {
		const hd = S.lastHitDir;
		const on = !! hd && set.get( 'damageIndicators' ) !== false;
		if ( on !== this._dmgOn ) { this._dmgOn = on; this.dmg.style.display = on ? '' : 'none'; }
		if ( ! on ) return;
		const ang = Math.atan2( hd.dir.x, - hd.dir.z ) + p.yaw;
		this.dmg.style.transform = `translate(-50%, -50%) rotate(${( - ang * 180 / Math.PI + 180 ).toFixed( 1 )}deg)`;
		this.dmg.style.opacity = Math.min( 1, hd.t ).toFixed( 2 );
	}

	// toasts start under the FPS / debug block; its height is known from what it shows, so no layout read.
	// Over a screen the HUD (and its FPS block) is hidden: the map puts them under its title plate, the
	// inventory in the middle of its top bar (css), anything else in the corner.
	_placeFeed() {
		const at = this._feedAt || '';
		flag( this.feed, 'at-inv', at === 'inv' ); flag( this.feed, 'at-map', at === 'map' );
		if ( at ) { this.feed.style.top = ''; return; }
		let top = 24;
		if ( this._fpsOn ) top += 20 + 8;
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
