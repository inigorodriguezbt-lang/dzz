// In-game HUD: crosshair, hit markers, compass, vitals, conditions, weapon / ammo, hotbar, prompts,
// timed-action ring, toasts, pickups, minimap, damage direction, vehicle gauges, debug overlay.
import * as THREE from 'three';
import { h, icon, fmtDist } from './dom.js';
import { getItem, displayName, ammoOf, condColor } from '../game/items/ItemDB.js';
import { setIcon } from './itemIcons.js';
import { fmtHour } from '../game/Commands.js';

export class HUD {
	constructor( ui ) {
		this.ui = ui;
		this.app = ui.app;
		this.el = h( 'div.hud' );
		this.cross = h( 'div.crosshair' );
		this.hit = h( 'div.hitmarker' );
		this.compass = h( 'div.compass.tw-glass', {}, this.strip = h( 'div.compass-strip' ), h( 'div.compass-needle' ) );
		this.compassRead = h( 'div.compass-readout' );
		this.vitals = h( 'div.vitals' );
		this.statusEl = h( 'div.status-icons' );
		this.vitalRow = h( 'div.vital-row' );
		this.staminaBar = h( 'div', { style: { height: '3px', width: '100%', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' } }, this.staminaFill = h( 'i', { style: { display: 'block', height: '100%', background: 'var(--tw-aqua)', width: '100%' } } ) );
		this.vitals.append( this.statusEl, this.vitalRow, this.staminaBar );
		this.vit = {};
		for ( const [ k, ic, label ] of [ [ 'health', 'health', 'Health' ], [ 'blood', 'blood', 'Blood' ], [ 'food', 'food', 'Food' ], [ 'water', 'water', 'Water' ], [ 'temp', 'temp', 'Body temperature' ], [ 'energy', 'energy', 'Energy' ] ] ) {
			const fill = h( 'div.fill' ), arrow = h( 'span.arrow' );
			const el = h( 'div.vital.tw-glass', { title: label, html: icon( ic ) }, fill, arrow );
			this.vit[ k ] = { el, fill, arrow, last: null, trend: 0 };
			this.vitalRow.appendChild( el );
		}
		this.breath = h( 'div.vital.tw-glass', { title: 'Breath', html: icon( 'breath' ) }, this.breathFill = h( 'div.fill' ) );
		this.breath.hidden = true;
		this.vitalRow.appendChild( this.breath );
		this.weapon = h( 'div.weapon-hud' );
		this.hotbar = h( 'div.hotbar' );
		this.hotSlots = [];
		for ( let i = 0; i < 9; i ++ ) {
			const img = h( 'img', { alt: '' } );
			const q = h( 'span.q' );
			const el = h( 'div.hot.tw-glass', {}, h( 'span.n', { text: i + 1 } ), img, q );
			el.hidden = true;
			this.hotSlots.push( { el, img, q, uid: null } );
			this.hotbar.appendChild( el );
		}
		this.prompt = h( 'div.prompt', {}, this.promptMain = h( 'div.prompt-main.tw-glass' ), this.promptSub = h( 'div.prompt-sub' ) );
		this.ring = h( 'div', { hidden: true }, this.ringSvg = h( 'div', { html: `<svg class="progress-ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,0.15)"/><circle class="arc" cx="32" cy="32" r="26" stroke="#5fe3d4" stroke-dasharray="163.4" stroke-dashoffset="163.4" stroke-linecap="round"/></svg>` } ), this.ringLabel = h( 'div.progress-label' ) );
		this.toasts = h( 'div.toasts' );
		this.pickups = h( 'div.pickups' );
		this.mini = h( 'div.minimap.tw-glass', {}, this.miniCanvas = h( 'canvas', { width: 340, height: 340 } ) );
		this.miniLabel = h( 'div.minimap-label' );
		this.dmgDir = h( 'div.dmg-dir' );
		this.vehicle = h( 'div.vehicle-hud.tw-glass', { hidden: true } );
		this.fps = h( 'div.fps' );
		this.debug = h( 'div.debug', { hidden: true } );
		this.el.append( this.cross, this.hit, this.compass, this.compassRead, this.vitals, this.weapon, this.hotbar, this.prompt, this.ring, this.toasts, this.pickups, this.mini, this.miniLabel, this.dmgDir, this.vehicle, this.fps, this.debug );
		this._buildCompass();
		this._crossStyle = null;
		this.hitT = 0;
		this.t = 0;
		this.lastInvVersion = - 1;
		this.debugOn = false;
	}

	attach( game ) {
		this.game = game;
		const on = ( n, f ) => this.ui.offs.push( game.events.on( n, f ) );
		on( 'toast', t => this.toast( t.text, t.kind, t.icon ) );
		on( 'hitmarker', e => this.hitmarker( e ) );
		on( 'item:pick', e => this.pickup( e.stack ) );
	}

	_buildCompass() {
		const PX_PER_DEG = 3;
		this.pxPerDeg = PX_PER_DEG;
		const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
		for ( let d = - 360; d <= 720; d += 5 ) {
			const deg = ( ( d % 360 ) + 360 ) % 360;
			const x = d * PX_PER_DEG;
			const major = deg % 15 === 0;
			this.strip.appendChild( h( 'div.compass-tick' + ( major ? '.major' : '' ), { style: { left: x + 'px' } } ) );
			if ( names[ deg ] !== undefined ) this.strip.appendChild( h( 'div.compass-label.card' + ( deg === 0 ? '.north' : '' ), { style: { left: x + 'px' }, text: names[ deg ] } ) );
			else if ( deg % 15 === 0 ) this.strip.appendChild( h( 'div.compass-label', { style: { left: x + 'px' }, text: deg } ) );
		}
		this.markerLayer = h( 'div' );
		this.strip.appendChild( this.markerLayer );
	}

	toast( text, kind = 'info', iconId = null ) {
		const el = h( 'div.toast.tw-glass.' + ( kind || 'info' ) );
		if ( iconId ) { const img = h( 'img' ); setIcon( img, iconId ); el.appendChild( img ); }
		el.appendChild( h( 'span', { text } ) );
		this.toasts.appendChild( el );
		while ( this.toasts.children.length > 6 ) this.toasts.firstChild.remove();
		setTimeout( () => { el.classList.add( 'out' ); setTimeout( () => el.remove(), 700 ); }, kind === 'bad' ? 6000 : 4200 );
		if ( kind === 'bad' || kind === 'warn' ) this.app.audio.ui( 'ui_error', 0.25 );
	}

	pickup( stack ) {
		const d = getItem( stack.id );
		if ( ! d ) return;
		const img = h( 'img' ); setIcon( img, stack.id );
		const el = h( 'div.pickup.tw-glass', {}, img, h( 'span', { text: `${displayName( stack )}${stack.qty > 1 ? ' ×' + stack.qty : ''}` } ) );
		this.pickups.appendChild( el );
		while ( this.pickups.children.length > 5 ) this.pickups.firstChild.remove();
		setTimeout( () => { el.classList.add( 'out' ); setTimeout( () => el.remove(), 600 ); }, 2600 );
	}

	hitmarker( e ) {
		if ( ! this.app.settings.get( 'hitMarkers' ) ) return;
		this.hit.classList.toggle( 'kill', !! e.kill );
		this.hit.classList.add( 'on' );
		this.hitT = e.kill ? 0.35 : 0.18;
		this.app.audio.play( e.kill ? 'hit_flesh' : 'ui_click', { bus: 'ui', vol: e.kill ? 0.25 : 0.2, rate: e.headshot ? 1.4 : 1 } );
	}

	update( dt ) {
		const g = this.game;
		if ( ! g ) return;
		this.t += dt;
		const S = g.survival, p = g.player, set = this.app.settings;
		this.el.classList.toggle( 'off', !! this.hidden || g.dead );
		// fps / debug
		this.fps.hidden = ! set.get( 'showFps' );
		if ( set.get( 'showFps' ) && this.app.frame % 10 === 0 ) this.fps.textContent = `${Math.round( this.app.fps )} fps`;
		if ( this.debugOn && this.app.frame % 10 === 0 ) this._debug();

		// crosshair
		const inVeh = !! p.vehicle;
		const aiming = g.hands?.aiming;
		const style = set.get( 'crosshair' );
		if ( style !== this._crossStyle ) {
			this._crossStyle = style;
			this.cross.innerHTML = style === 'lines' ? '<div class="lines"><i></i><i></i><i></i><i></i></div>' : style === 'none' ? '' : '<div class="dot"></div>';
		}
		this.cross.hidden = aiming || inVeh || this.ui.screen != null;
		if ( style === 'lines' ) {
			const spread = g.hands?.crosshairSpread?.() ?? 0.01;
			const gap = Math.max( 4, spread / Math.tan( g.camera.fov * Math.PI / 360 ) * innerHeight * 0.5 );
			this.cross.style.setProperty( '--gap', gap.toFixed( 1 ) + 'px' );
		}
		if ( this.hitT > 0 ) { this.hitT -= dt; if ( this.hitT <= 0 ) this.hit.classList.remove( 'on' ); }

		// compass
		const compassOn = set.get( 'compass' ) && ( ! set.get( 'realisticMap' ) || p.inventory.count( 'compass' ) > 0 || g.mode === 'creative' );
		this.compass.hidden = ! compassOn; this.compassRead.hidden = ! compassOn;
		const yaw = inVeh ? ( g.vehicles?.hud?.()?.heading ?? p.yaw ) : p.yaw;
		const heading = ( ( - yaw * 180 / Math.PI ) % 360 + 360 ) % 360;
		this.strip.style.transform = `translateX(${( - heading * this.pxPerDeg ).toFixed( 1 )}px)`;
		if ( this.app.frame % 15 === 0 ) {
			const loc = this.ui.locationName( p.pos );
			this.compassRead.textContent = `${Math.round( heading )}°  ·  ${fmtHour( g.hour )}  ·  Day ${g.day}  ·  ${loc}`;
			this._compassMarkers();
		}

		// vitals
		const V = this.vit;
		const vset = ( k, v, lowAt, critAt, invert = false ) => {
			const o = V[ k ];
			const frac = Math.max( 0, Math.min( 1, v ) );
			o.fill.style.height = ( frac * 100 ).toFixed( 1 ) + '%';
			o.el.classList.toggle( 'low', invert ? false : frac < lowAt && frac >= critAt );
			o.el.classList.toggle( 'crit', frac < critAt );
			if ( o.last !== null ) o.trend += ( ( v - o.last ) / Math.max( dt, 1e-3 ) - o.trend ) * 0.05;
			o.last = v;
			const tr = o.trend;
			o.arrow.textContent = tr > 0.0015 ? '▲' : tr < - 0.004 ? '▼' : '';
		};
		vset( 'health', S.health / 100, 0.5, 0.25 );
		vset( 'blood', ( S.blood - 2000 ) / 3000, 0.6, 0.35 );
		vset( 'food', S.hunger / 100, 0.3, 0.1 );
		vset( 'water', S.thirst / 100, 0.3, 0.1 );
		vset( 'energy', S.energy / 100, 0.25, 0.1 );
		const tempF = 1 - Math.min( 1, Math.abs( S.temp - 36.9 ) / 2.2 );
		vset( 'temp', tempF, 0.55, 0.3 );
		V.temp.el.title = `Body temperature ${S.temp.toFixed( 1 )} °C — outside ${Math.round( S.envTemp )} °C`;
		V.temp.el.style.color = S.temp < 36 ? '#8fc8ff' : S.temp > 38 ? '#ffb86b' : '';
		this.breath.hidden = S.breath > 99.5;
		this.breathFill.style.height = S.breath + '%';
		const mS = S.maxStamina();
		this.staminaFill.style.width = ( S.stamina / 100 * 100 ).toFixed( 1 ) + '%';
		this.staminaFill.style.background = S.stamina < 20 ? 'var(--tw-coral)' : 'var(--tw-aqua)';
		this.staminaBar.style.boxShadow = `inset ${-( 1 - mS / 100 ) * 100}% 0 0 rgba(255,122,133,0.25)`;
		if ( this.app.frame % 20 === 0 ) {
			const conds = S.conditions();
			const key = conds.map( c => c.id + c.label ).join( '|' );
			if ( key !== this._condKey ) {
				this._condKey = key;
				this.statusEl.replaceChildren( ...conds.map( c => h( 'div.status.' + c.kind, { text: c.label } ) ) );
			}
		}

		// weapon / held item
		if ( this.app.frame % 4 === 0 ) this._weapon();
		// hotbar
		if ( p.inventory.version !== this.lastInvVersion || this.app.frame % 30 === 0 ) { this.lastInvVersion = p.inventory.version; this._hotbar(); }

		// prompt
		const t = g.interact.target;
		const showPrompt = t && ! g.actions.busy && this.ui.screen == null && set.get( 'showInteractHints' ) !== false;
		this.prompt.hidden = ! showPrompt;
		if ( showPrompt ) {
			const key = this.app.input.label( t.key || 'interact' );
			const hold = t.hold ? `<span class="dim" style="margin-left:4px">hold</span>` : '';
			const html = `<kbd>${key}</kbd>${hold}<span>${escapeHtml( t.label )}</span>`;
			if ( html !== this._promptHtml ) { this._promptHtml = html; this.promptMain.innerHTML = html; }
			this.promptSub.textContent = t.sub || '';
			if ( t.hold && g.interact.holdT > 0 ) this._ringShow( g.interact.holdT / t.hold, t.label ); else if ( ! g.actions.busy ) this.ring.hidden = true;
		}
		// action progress
		if ( g.actions.busy ) this._ringShow( g.actions.progress, g.actions.current.label + '…' + '  ' + '(move to cancel)' );
		else if ( ! ( t?.hold && g.interact.holdT > 0 ) ) this.ring.hidden = true;

		// damage direction
		if ( S.lastHitDir && set.get( 'damageIndicators' ) ) {
			const d = S.lastHitDir.dir;
			const ang = Math.atan2( d.x, - d.z ) + p.yaw;
			if ( ! this.dmgArrow ) { this.dmgArrow = h( 'i' ); this.dmgDir.appendChild( this.dmgArrow ); }
			this.dmgArrow.style.transform = `rotate(${( - ang * 180 / Math.PI + 180 ).toFixed( 0 )}deg)`;
			this.dmgArrow.style.opacity = Math.min( 1, S.lastHitDir.t );
		} else if ( this.dmgArrow ) this.dmgArrow.style.opacity = 0;

		// vehicle
		const vh = g.vehicles?.hud?.();
		this.vehicle.hidden = ! vh;
		if ( vh && this.app.frame % 3 === 0 ) this._vehicle( vh );

		// minimap
		const mapOK = ! set.get( 'realisticMap' ) || p.inventory.count( 'map_hawaii' ) > 0 || g.mode === 'creative';
		this.mini.hidden = ! mapOK || set.get( 'minimap' ) === false; this.miniLabel.hidden = this.mini.hidden;
		if ( ! this.mini.hidden && this.app.frame % 2 === 0 ) this._minimap();
	}

	_ringShow( f, label ) {
		this.ring.hidden = false;
		this.ringSvg.querySelector( '.arc' ).style.strokeDashoffset = ( 163.4 * ( 1 - f ) ).toFixed( 1 );
		this.ringLabel.textContent = label;
	}

	_weapon() {
		const g = this.game, inv = g.player.inventory;
		const held = inv.heldStack();
		if ( ! held || g.player.vehicle ) { this.weapon.hidden = true; return; }
		this.weapon.hidden = false;
		const d = getItem( held.id );
		const info = g.hands?.ammoInfo?.();
		let ammoHtml = '';
		const a = ammoOf( held );
		if ( d?.cat === 'firearm' ) {
			const reserve = info?.reserve ?? 0;
			ammoHtml = `<div class="ammo${a === 0 ? ' empty' : ''}">${a}<small> / ${reserve}</small></div><div class="weapon-sub" style="text-align:right">${escapeHtml( info?.mode || ( d.firearm.modes[ held.data.mode || 0 ] || '' ) ).toUpperCase()}</div>`;
		} else if ( held.qty > 1 ) ammoHtml = `<div class="ammo">${held.qty}</div>`;
		const key = held.uid + ':' + a + ':' + ( info?.reserve ) + ':' + ( info?.mode ) + ':' + held.cond.toFixed( 2 ) + ':' + held.qty;
		if ( key === this._wKey ) return;
		this._wKey = key;
		const img = h( 'img' ); setIcon( img, held.id );
		this.weapon.replaceChildren( h( 'div.weapon-card.tw-glass', {}, img,
			h( 'div', { style: { flex: '1', minWidth: 0 } }, h( 'div.weapon-name', { text: displayName( held ) } ), h( 'div.weapon-sub', { text: d?.firearm ? d.firearm.caliber?.toUpperCase?.() || '' : d?.cat || '' } ),
				h( 'div.durability', {}, h( 'i', { style: { width: ( held.cond * 100 ) + '%', background: condColor( held.cond ) } } ) ) ),
			h( 'div', { html: ammoHtml } ) ) );
	}

	_hotbar() {
		const inv = this.game.player.inventory;
		let any = false;
		for ( let i = 0; i < 9; i ++ ) {
			const s = this.hotSlots[ i ];
			const st = inv.findUid( inv.hotbar[ i ] );
			if ( ! st && inv.hotbar[ i ] ) inv.hotbar[ i ] = null;
			s.el.hidden = ! st && ! this.ui.inventoryOpen;
			if ( st ) any = true;
			if ( ( st?.uid || null ) !== s.uid ) { s.uid = st?.uid || null; if ( st ) setIcon( s.img, st.id ); else s.img.removeAttribute( 'src' ); }
			s.img.hidden = ! st;
			const a = st ? ammoOf( st ) : null;
			s.q.textContent = st ? ( a !== null ? a : st.qty > 1 ? st.qty : '' ) : '';
			s.el.classList.toggle( 'on', !! st && st.uid === inv.hands );
		}
		this.hotbar.hidden = ! any && ! this.ui.inventoryOpen;
	}

	_vehicle( v ) {
		const kmh = Math.abs( v.speed ) * 3.6;
		const alt = v.altitude != null ? `<div class="weapon-sub">ALT ${Math.round( v.altitude )} m</div>` : '';
		this.vehicle.innerHTML = `<div class="weapon-sub">${escapeHtml( v.name || '' )}</div><div class="speed">${Math.round( v.kind === 'boat' ? kmh / 1.852 : kmh )}<small>${v.kind === 'boat' ? 'kn' : 'km/h'}</small></div>${alt}
			<div class="weapon-sub" style="margin-top:6px">Fuel</div><div class="gauge"><i style="width:${( v.fuel * 100 ).toFixed( 0 )}%;background:${v.fuel < 0.15 ? 'var(--tw-coral)' : 'var(--tw-aqua)'}"></i></div>
			<div class="weapon-sub" style="margin-top:4px">Condition</div><div class="gauge"><i style="width:${( v.health * 100 ).toFixed( 0 )}%;background:${v.health < 0.3 ? 'var(--tw-coral)' : 'var(--tw-green)'}"></i></div>
			${v.gear != null ? `<div class="weapon-sub" style="margin-top:4px">Gear ${v.gear}</div>` : ''}`;
	}

	_compassMarkers() {
		const g = this.game, p = g.player.pos;
		const ms = g.markers?.list?.() || [];
		const els = [];
		for ( const m of ms ) {
			const b = ( Math.atan2( m.x - p.x, - ( m.z - p.z ) ) * 180 / Math.PI + 360 ) % 360;
			const d = Math.hypot( m.x - p.x, m.z - p.z );
			for ( const off of [ - 360, 0, 360 ] ) els.push( h( 'div.compass-marker', { style: { left: ( ( b + off ) * this.pxPerDeg ) + 'px' }, title: `${m.label} ${fmtDist( d )}`, text: '◆' } ) );
		}
		this.markerLayer.replaceChildren( ...els );
	}

	_minimap() {
		const g = this.game, p = g.player;
		const c = this.miniCanvas, ctx = c.getContext( '2d' );
		const W = c.width;
		const map = this.ui.mapView;
		if ( ! map ) return;
		const inVeh = g.vehicles?.hud?.();
		const zoom = inVeh && Math.abs( inVeh.speed ) > 12 ? 0.55 : 1.1;
		const pos = p.vehicle && g.vehicles?.driving ? g.vehicles.driving.pos : p.pos;
		const yaw = inVeh?.heading ?? p.yaw;
		const { toScreen } = map.draw( ctx, { cx: pos.x, cz: pos.z, ppm: zoom, rot: - yaw, w: W, h: W }, { labels: false } );
		// markers
		for ( const m of g.markers?.list?.() || [] ) {
			const [ sx, sy ] = toScreen( m.x, m.z );
			const cxs = Math.max( 12, Math.min( W - 12, sx ) ), cys = Math.max( 12, Math.min( W - 12, sy ) );
			ctx.fillStyle = m.kind === 'death' ? '#ff7a85' : '#5fe3d4';
			ctx.beginPath(); ctx.arc( cxs, cys, 6, 0, Math.PI * 2 ); ctx.fill();
		}
		// player arrow (the map rotates, the arrow always points up)
		ctx.save();
		ctx.translate( W / 2, W / 2 );
		ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo( 0, - 13 ); ctx.lineTo( 9, 10 ); ctx.lineTo( 0, 5 ); ctx.lineTo( - 9, 10 ); ctx.closePath(); ctx.stroke(); ctx.fill();
		ctx.restore();
		// north tick
		const [ nx, ny ] = [ W / 2 - Math.sin( yaw ) * ( W / 2 - 14 ), W / 2 - Math.cos( yaw ) * ( W / 2 - 14 ) ];
		ctx.font = '600 20px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText( 'N', nx, ny ); ctx.fillStyle = '#ffb86b'; ctx.fillText( 'N', nx, ny );
		if ( this.app.frame % 30 === 0 ) this.miniLabel.textContent = this.ui.locationName( p.pos, true );
	}

	_debug() {
		const g = this.game, p = g.player, r = this.app.renderer.gl.info;
		const cs = g.creatures?.stats?.() || {};
		this.debug.textContent = [
			`Deadtide — ${Math.round( this.app.fps )} fps  ${r.render.calls} draws  ${( r.render.triangles / 1e3 ).toFixed( 0 )}k tris  ${r.memory.geometries} geos  ${r.memory.textures} tex`,
			`XYZ ${p.pos.x.toFixed( 1 )} ${p.pos.y.toFixed( 2 )} ${p.pos.z.toFixed( 1 )}   facing ${Math.round( ( ( - p.yaw * 180 / Math.PI ) % 360 + 360 ) % 360 )}°`,
			`ground ${g.hf.heightAt( p.pos.x, p.pos.z ).toFixed( 2 )}  water ${g.physics.waterLevel( p.pos.x, p.pos.z ).toFixed( 2 )}  island ${g.hf.islandAt( p.pos.x, p.pos.z )}`,
			`surface ${g.hf.surfaceAt( p.pos.x, p.pos.z ).map( v => typeof v === 'number' ? v.toFixed( 2 ) : v ).join( ' ' )}  flags ${g.hf.flagsNear( p.pos.x, p.pos.z )}`,
			`stance ${p.stance}  ${p.sprinting ? 'sprint' : ''} ${p.swimming ? 'swim' : ''} ${p.flying ? 'fly' : ''}  speed ${p.speedNow.toFixed( 1 )} m/s`,
			`time ${fmtHour( g.hour )} day ${g.day}  weather ${g.weather.state} rain ${g.weather.rain.toFixed( 2 )} cover ${g.weather.cover.toFixed( 2 )}`,
			`entities ${g.entities.list.length}  zombies ${g.entities.count( 'zombie' )}  animals ${g.entities.count( 'animal' )}  vehicles ${g.entities.count( 'vehicle' )}  items ${g.entities.count( 'item' )}`,
			`workers busy ${this.app.world.pool.busy}  terrain nodes ${this.app.world.terrain.loadedCount}  ${Object.entries( cs ).map( ( [ k, v ] ) => k + ' ' + v ).join( '  ' )}`,
			`HP ${g.survival.health.toFixed( 1 )} blood ${g.survival.blood.toFixed( 0 )} food ${g.survival.hunger.toFixed( 1 )} water ${g.survival.thirst.toFixed( 1 )} temp ${g.survival.temp.toFixed( 2 )} env ${g.survival.envTemp.toFixed( 1 )} wet ${g.survival.wet.toFixed( 2 )} weight ${p.inventory.totalWeight().toFixed( 1 )} kg`,
		].join( '\n' );
	}
}

export function escapeHtml( s ) { return String( s ).replace( /[&<>"]/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ c ] ) ); }
