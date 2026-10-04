// The senses domain at runtime: one system (game.senses, registered through hooks.js addSystem) for what you wear and
// carry that changes how you see, hear and breathe.
//   vision    night-vision goggles (U or the verb switches them on), handheld night-vision and thermal monoculars (aim
//             them), an IR illuminator only a tube sees; the grade's uniforms come from grade( out ) (Game.grade). Thermal
//             warms the living (animals, bandits: an emissive heat term on their materials) and chills the infected
//   hearing   earplugs and passive muffs dull the mix, electronic defenders limit gunshots and lift quiet sounds (the
//             sfx bus through ears.js); unprotected gunfire close by leaves your ears ringing
//   vog       Kīlauea's vents and the ocean-entry laze (logic.js VENTS): a visible plume, thicker haze and a yellow-grey
//             grade inside it, the 'vog' condition (Survival.vog) with coughing fits the infected hear, sore eyes, a filter
//             that wears down in the mask that stops it; a gas detector beeps before you see it
//   diving    a scuba set or a rebreather breathes for you under water (Survival.addAirSource), air by depth, nitrogen and
//             the bends, a dive computer's readout, lights that aren't waterproof flooding
//   gadgets   a laser dot the infected follow, a parabolic microphone, motion sensors and their receiver, a smartwatch,
//             a weather radio, the spotting scope's view (kinds.js holds the placed ones)
// Node-safe: three.js only for vectors; the renderer, DOM and audio parts load lazily in a page.
import * as THREE from 'three';
import { getItem } from '../../ItemDB.js';
import * as L from './logic.js';
import { playSensesSound, loopSensesSound, ensureSensesSound } from './sounds.js';
import { EarChain } from './ears.js';

const browser = typeof window !== 'undefined' && typeof document !== 'undefined';
let G = null, FXM = null, HUDM = null;
if ( browser ) {
	import( '../../../../render/Materials.js' ).then( ( m ) => { G = m.G; } ).catch( () => {} );
	import( './fx.js' ).then( ( m ) => { FXM = m; } ).catch( ( e ) => console.warn( 'senses fx', e ) );
	import( './hud.js' ).then( ( m ) => { HUDM = m; } ).catch( ( e ) => console.warn( 'senses hud', e ) );
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3(), _near = [];
const lumC = ( c ) => c ? c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 : 0;
const lumV = ( v ) => v ? v.x * 0.2126 + v.y * 0.7152 + v.z * 0.0722 : 0;

const ATTACHED = new WeakMap();
export const system = ( g ) => ATTACHED.get( g ) || null;

export function attach( g ) {
	if ( ! g || typeof g.register !== 'function' ) return null;
	if ( ATTACHED.has( g ) ) return ATTACHED.get( g );
	const sys = new SensesSystem( g );
	ATTACHED.set( g, sys );
	g.register( sys );
	g.senses = sys;
	sys.hook();
	return sys;
}

// a carried stack of an id or matching fn (also worn and in the hands)
function carried( inv, fn ) { return inv?.find?.( fn ) || null; }

export class SensesSystem {
	constructor( g ) {
		this.game = g;
		this.lastH = g.time?.hours ?? 0;
		this.t = 0;
		// vision: { mode 0|1|2, src, tube, core, palette, k, handheld }
		this.view = { mode: 0, k: 0 };
		this.powerK = 0; this.powered = null;
		this.light = 1; // the scene's light level (thermal's reference)
		this.heated = new Map(); // material -> its own emissive / colour, while thermal changes it
		this._matsOf = new WeakMap();
		this.ir = false;
		// hearing
		this.earMode = 'open'; this.ring = 0; this._mix = {}; this.chain = null; this._rang = false;
		// vog at the player and the camera
		this.conc = { vog: 0, laze: 0 }; this.vogT = 0; this.vogCam = 0; this.coughT = 6; this.spentWarned = false; this.plumeT = 0;
		// diving: depth, rate (m/s, up +), time under, deepest, nitrogen, bubbles, since surfacing, the last dive
		this.dive = { depth: 0, rate: 0, t: 0, max: 0, n: 0, bub: 0, since: 99, under: false, floodT: 0, breathT: 0, log: null, warnT: 0 };
		// gadgets
		this.laser = { on: false, hit: null, normal: new THREE.Vector3( 0, 1, 0 ), t: 0, lured: 0, onEntity: null };
		this.mic = { on: false, t: 0, list: [], count: 0, near: null };
		this.beepT = 0; this.ppm = 0;
		this.watchT = 0; this.watchQuiet = 0;
		this.radio = { t: 30, lastState: null, fc: null, warned: 0, vog: 0 };
		this.scope = null; // { p, anchor } while looking through a placed spotting scope
		this.seenT = 0;
		this.grade0 = {};
	}

	hook() {
		const g = this.game, S = g.survival;
		S?.addAirSource?.( ( dt ) => this.breathe( dt ) );
		this.offNoise = g.events?.on?.( 'noise', ( e ) => this.onNoise( e ) );
	}

	get inv() { return this.game.player?.inventory; }
	get creative() { return this.game.mode === 'creative'; }

	// ============================================================================================================
	// the frame
	// ============================================================================================================

	update( dt ) {
		const g = this.game, pl = g.player;
		if ( ! pl?.inventory ) return;
		const h = g.time?.hours ?? 0, dh = L.clamp( h - this.lastH, 0, 2 );
		this.lastH = h;
		this.t += dt;
		// the late hook: after the hands (installed later) so the scope's zoom wins over theirs
		if ( ! this.late && g.hands ) { this.late = { update: ( d ) => this.lateUpdate( d ) }; g.register( this.late ); }
		this.seenT -= dt;
		if ( this.seenT <= 0 ) { this.seenT = 0.5; this.initCarried(); }
		if ( g.dead ) { this.view.mode = 0; this.laser.on = false; this.mic.on = false; this.ir = false; this.scope = null; this.applyHeat( false ); this.ears( dt, 0 ); return; }
		this.input();
		this.vision( dt, dh );
		this.applyHeat( this.view.mode === 2 && this.view.k > 0.02 );
		this.ears( dt, dh );
		this.vogUpdate( dt );
		this.diving( dt );
		this.gadgets( dt, dh );
		this.fx?.update?.( dt );
		if ( ! this.fx && FXM && browser && g.scene ) this.fx = new FXM.SensesFX( this );
		if ( ! this.hud && HUDM && browser && g.app?.ui?.hud ) this.hud = new HUDM.SensesHUD( this );
		this.hud?.update?.( dt );
	}

	// after the hands: a placed scope's zoom
	lateUpdate( dt ) {
		const g = this.game, sc = this.scope;
		if ( ! sc ) return;
		const P = g.placeables, p = sc.p, pl = g.player;
		const gone = ! P?.list?.has?.( p.id ) || g.dead || pl.pos.distanceTo( P.vec( p ) ) > L.SCOPE.leave + 0.6 || pl.vehicle || g.hands?.held;
		if ( gone ) { this.stopScope(); return; }
		const base = ( g.settings?.get?.( 'fov' ) || 62 ) * Math.PI / 180;
		const target = 2 * Math.atan( Math.tan( base / 2 ) / L.SCOPE.zoom ) / base;
		sc.k = Math.min( 1, ( sc.k || 0 ) + dt * 4 );
		pl.aimFov = 1 + ( target - 1 ) * sc.k * sc.k;
		void dt;
	}

	startScope( p ) {
		if ( this.scope?.p === p ) { this.stopScope(); return; }
		this.game.hands?.holster?.();
		this.scope = { p, k: 0 };
		playSensesSound( this.game, 'senses_click', { vol: 0.4 } );
	}
	stopScope() {
		if ( ! this.scope ) return;
		this.scope = null;
		const pl = this.game.player;
		if ( pl ) pl.aimFov = 1;
	}

	// ---- input: U switches worn goggles ------------------------------------------------------------------------------
	input() {
		const g = this.game, I = g.input;
		if ( ! g.inputActive || ! I?.codePressed ) return;
		if ( I.codePressed( 'KeyU' ) ) this.toggleGoggles();
	}

	// worn night-vision or thermal goggles on / off
	toggleGoggles( stack = null ) {
		const g = this.game, inv = this.inv;
		const s = stack || inv.equip.eyes;
		const d = s && getItem( s.id ), sd = L.sensesOf( d );
		if ( ! sd?.view ) { g.toast( 'No goggles on', 'info' ); return false; }
		if ( ! s.data.on && L.chargeOf( s, d ) <= 0 ) { g.toast( 'Batteries dead', 'warn' ); playSensesSound( g, 'senses_click', { vol: 0.3 } ); return false; }
		if ( ! s.data.on && s.cond <= 0 ) { g.toast( `${d.name} broken`, 'warn' ); return false; }
		s.data.on = ! s.data.on;
		if ( s.data.on ) { this.powerK = 0; playSensesSound( g, 'senses_nv_on', { vol: 0.35, bus: 'ui' } ); }
		else playSensesSound( g, 'senses_click', { vol: 0.35, bus: 'ui' } );
		inv.changed();
		return true;
	}

	// first sight of a found device: a part-charged battery, a part-full tank, maybe a used filter in the mask
	initCarried() {
		const inv = this.inv, creative = this.creative, r = Math.random;
		for ( const s of inv.allStacks?.() || [] ) {
			const d = getItem( s.id );
			if ( ! d ) continue;
			if ( d.cat !== 'tool' && d.tool?.battery && s.data.charge === undefined ) s.data.charge = d.tool.battery * ( creative ? 1 : 0.3 + r() * 0.7 );
			if ( ( s.id === 'scuba_tank' || s.id === 'scuba_set' ) && s.data.air === undefined ) s.data.air = creative ? L.DIVE.bar : Math.round( L.DIVE.bar * ( r() < 0.25 ? r() * 0.2 : 0.4 + r() * 0.6 ) );
			if ( s.id === 'scba_pack' && s.data.air === undefined ) s.data.air = creative ? L.SCBA.bar : Math.round( L.SCBA.bar * ( 0.3 + r() * 0.7 ) );
			if ( s.id === 'rebreather' && s.data.o2 === undefined ) { const k = creative ? 1 : 0.25 + r() * 0.75; s.data.o2 = L.REBREATHER.o2 * k; s.data.scrub = L.REBREATHER.scrub * k; }
			const m = L.MASKS[ s.id ];
			if ( m?.filter && s.data.filter === undefined ) s.data.filter = creative || r() < 0.55 ? { id: m.filter, life: creative ? 1 : Math.round( ( 0.15 + r() * 0.85 ) * 100 ) / 100 } : null;
		}
	}

	// ============================================================================================================
	// vision
	// ============================================================================================================

	vision( dt, dh ) {
		const g = this.game, inv = this.inv, H = g.hands, creative = this.creative;
		const v = this.view;
		let src = null, sd = null, d = null, k = 0, handheld = false;
		// a handheld at the eye (it aims like binoculars)
		const held = H?.held, hd = held && getItem( held.id ), hs = L.sensesOf( hd );
		if ( hs?.view && ( H.binoc || 0 ) > 0.02 && held.cond > 0 && L.chargeOf( held, hd ) > 0 ) { src = held; d = hd; sd = hs; k = Math.min( 1, H.binoc * 1.25 ); handheld = true; }
		// worn goggles, switched on
		if ( ! src ) {
			const e = inv.equip.eyes, ed = e && getItem( e.id ), es = L.sensesOf( ed );
			if ( es?.view && e.data.on ) {
				if ( L.chargeOf( e, ed ) > 0 && e.cond > 0 ) { src = e; d = ed; sd = es; }
				else { e.data.on = false; g.toast( `${ed.name}: batteries dead`, 'warn' ); inv.changed(); }
			}
		}
		if ( src !== this.powered ) { this.powered = src; this.powerK = handheld ? 1 : 0; }
		if ( src && ! handheld ) { this.powerK = Math.min( 1, this.powerK + dt / 0.6 ); k = this.powerK * this.powerK; }
		v.mode = src ? ( sd.view === 'nv' ? 1 : 2 ) : 0;
		v.src = src; v.k = k; v.handheld = handheld;
		v.tube = sd?.tube || 'gen3'; v.core = sd?.core || 'goggles';
		v.palette = src ? ( src.data.palette || 0 ) : 0;
		// a weak battery dims the tube
		v.low = !! src && d.tool?.battery && L.chargeOf( src, d ) < d.tool.battery * 0.08;
		if ( src && dh > 0 && ! creative ) L.drain( src, dh, 1, d );
		// the Gen-1's whine while it is up to the eye
		const whine = v.mode === 1 && L.TUBES[ v.tube ]?.whine ? k : 0;
		if ( whine > 0 && ! this.whine ) this.whine = loopSensesSound( g, 'senses_whine', { vol: 0, bus: 'ui' } );
		this.whine?.set?.( whine * 0.12 );
		// the IR illuminator lights what a tube sees
		const ir = carried( inv, ( s ) => s.id === 'ir_illuminator' && s.data.on );
		if ( ir ) {
			const id = getItem( ir.id );
			if ( L.chargeOf( ir, id ) <= 0 ) { ir.data.on = false; g.toast( 'IR illuminator: batteries dead', 'warn' ); inv.changed(); }
			else if ( dh > 0 && ! creative ) L.drain( ir, dh, 1, id );
		}
		this.ir = !! ir && ir.data.on && v.mode === 1;
		// the scene's light for the thermal heat term (the sun and the sky; night lifts it a little for the lamps)
		const sky = g.world?.sky;
		this.light = L.sceneLight( lumC( sky?.sunColor ), lumV( G?.uSkyIrr?.value ), sky?.night || 0 );
	}

	// thermal: the living glow, the infected go cold (their materials' emissive and colour; put back when it's off)
	applyHeat( on ) {
		const g = this.game;
		if ( ! on ) {
			if ( ! this.heated.size ) return;
			for ( const [ m, o ] of this.heated ) { m.emissive?.setHex?.( o.e ); m.emissiveIntensity = o.ei; m.color?.setHex?.( o.c ); }
			this.heated.clear();
			this._hidSmoke( false );
			return;
		}
		const E = L.HEAT.body * this.light;
		const list = g.entities?.near?.( g.camera?.position || g.player.pos, 300, null, _near ) || [];
		for ( const e of list ) {
			if ( e.type !== 'zombie' && e.type !== 'animal' && e.type !== 'npc' ) continue;
			const cold = e.type === 'zombie';
			for ( const m of this.matsOf( e ) ) {
				if ( ! this.heated.has( m ) ) this.heated.set( m, { e: m.emissive.getHex(), ei: m.emissiveIntensity, c: m.color.getHex() } );
				const o = this.heated.get( m );
				if ( cold ) { m.color.setScalar( L.HEAT.cold ); m.emissive.setHex( 0 ); m.emissiveIntensity = 0; }
				else { m.color.setHex( o.c ); m.emissive.setRGB( 1, 1, 1 ); m.emissiveIntensity = e.alive === false && e.type === 'npc' ? E * 0.4 : E; }
			}
		}
		// a smoke screen doesn't hide anything from a thermal core
		this._hidSmoke( true );
	}
	_hidSmoke( hide ) {
		const m = this.game.fx?.alpha?.mesh;
		if ( m ) m.visible = ! hide;
	}
	// (looked up again each second: a body's model can arrive, or change, after it spawns)
	matsOf( e ) {
		const root = e.object;
		if ( ! root ) return [];
		const c = this._matsOf.get( root );
		if ( c && this.t - c.t < 1 ) return c.list;
		const list = [];
		root.traverse?.( ( o ) => {
			if ( ! o.isMesh ) return;
			for ( const m of Array.isArray( o.material ) ? o.material : [ o.material ] ) if ( m?.isMeshStandardMaterial && ! list.includes( m ) ) list.push( m );
		} );
		this._matsOf.set( root, { list, t: this.t } );
		return list;
	}

	// ============================================================================================================
	// hearing
	// ============================================================================================================

	earsMode() {
		const inv = this.inv, head = inv.equip.head, hd = head && getItem( head.id );
		if ( L.sensesOf( hd )?.kind === 'ears' && head.cond > 0 ) return head.data.on && L.chargeOf( head, hd ) > 0 ? 'active' : 'muffs';
		if ( carried( inv, ( s ) => s.id === 'foam_earplugs' && s.data?.in ) ) return 'plugs';
		return 'open';
	}

	ears( dt, dh ) {
		const g = this.game, inv = this.inv;
		const head = inv.equip.head, hd = head && getItem( head.id );
		const mode = this.earsMode();
		if ( mode === 'active' && dh > 0 && ! this.creative ) { L.drain( head, dh, 1, hd ); if ( L.chargeOf( head, hd ) <= 0 ) { head.data.on = false; g.toast( `${hd.name}: batteries dead`, 'warn' ); inv.changed(); } }
		this.earMode = mode;
		const before = this.ring;
		this.ring = Math.max( 0, this.ring - dt * L.RING.fade );
		if ( this.ring > 0.3 && ! this._rang ) { this._rang = true; g.audio?.play?.( 'tinnitus', { bus: 'ui', vol: Math.min( 0.8, this.ring ) } ); }
		if ( this.ring < 0.15 ) this._rang = false;
		void before;
		const mix = L.earMix( mode, this.ring, this._mix );
		const a = g.audio;
		if ( ( mode !== 'open' || this.ring > 0.01 || this.chain?.built ) && a?.ctx ) {
			if ( ! this.chain ) this.chain = new EarChain( a );
			if ( this.chain.build() ) this.chain.set( mix );
		}
	}

	// gunfire and blasts close by: the ears ring unless something covers them (a parabolic mic to the ear makes it worse)
	onNoise( e ) {
		if ( ! e?.pos || ( e.kind !== 'gunshot' && e.kind !== 'explosion' && e.kind !== 'flashbang' ) ) return;
		const g = this.game, P = g.player?.pos;
		if ( ! P || g.dead ) return;
		const d = Math.hypot( e.pos.x - P.x, ( e.pos.y ?? P.y ) - P.y, e.pos.z - P.z );
		if ( d > 60 ) return;
		const protect = ( L.EARS[ this.earsMode() ] || L.EARS.open ).protect;
		let add = L.ringFrom( e.kind !== 'gunshot' ? Math.max( e.radius || 0, 400 ) : e.radius, d, !! g.world?.isIndoors?.( P ), protect );
		this.noises = ( this.noises || 0 ) + 1;
		if ( this.mic.on ) add = Math.max( add * 3, protect < 1 ? 0.5 : 0 );
		this.ring = L.clamp( this.ring + add, 0, 1 );
	}

	audioState() { return { mode: this.earMode, ring: + this.ring.toFixed( 3 ), mix: { ...this._mix }, chain: this.chain?.state?.() || { built: false } }; }

	// ============================================================================================================
	// vog and laze
	// ============================================================================================================

	windDir() {
		const w = G?.uWind?.value;
		return w ? { x: w.x, z: w.y } : L.TRADES;
	}

	vogUpdate( dt ) {
		const g = this.game, S = g.survival, pl = g.player, inv = this.inv, eq = inv.equip;
		this.vogT -= dt;
		if ( this.vogT <= 0 ) {
			this.vogT = 0.25;
			const w = this.windDir();
			L.vogAt( pl.pos.x, pl.pos.z, w.x, w.z, g.weather?.wind ?? 0.45, this.conc );
		}
		const c = this.conc.vog, z = this.conc.laze, total = Math.max( c, z );
		// the haze you see (eased): the world's aerial haze thickens and the grade turns yellow-grey
		this.vogCam += ( Math.min( 1, total * 1.3 ) - this.vogCam ) * Math.min( 1, dt * 1.5 );
		// (the marine haze thins with height, scale 110 m: up on the summit it needs more to show)
		const hk = Math.min( 6, Math.exp( Math.max( 0, g.camera?.position?.y ?? 0 ) / 110 ) );
		if ( G?.uHazeDensity && this.vogCam > 0.002 ) G.uHazeDensity.value *= 1 + this.vogCam * 5 * hk;
		// the plume over each vent within sight
		this.plumeT -= dt;
		if ( this.plumeT <= 0 ) { this.plumeT = 0.2; this.fx?.plumes?.( 0.2 ); }
		const pr = L.maskProtection( eq.face, eq.back, eq.vest );
		this.protection = pr;
		if ( this.creative || S?.godMode || ! S ) return;
		// the filter wears down by what it stops
		if ( pr.filter && total > 0.01 ) {
			const was = pr.filter.life;
			L.wearFilter( pr.filter, total, dt );
			if ( was > 0 && pr.filter.life <= 0 ) { g.toast( 'Filter spent', 'warn' ); inv.changed(); }
			else if ( was > 0.1 && pr.filter.life <= 0.1 ) g.toast( 'Filter nearly spent', 'warn' );
		}
		// the airways
		const was = S.vog || 0;
		S.vog = L.vogStep( was, total, pr.k, dt, S.fxOn?.( 'breathe' ) );
		if ( S.vog > 0.08 && was <= 0.08 ) S.msg?.( 'vog', z > c ? 'Laze' : 'Vog', 'bad', 60 );
		if ( S.vog > L.VOG.cough && ! pl.underwater ) {
			this.coughT -= dt;
			if ( this.coughT <= 0 ) { this.coughT = 8 + Math.random() * 14 * ( 1.3 - S.vog ); if ( ! S.fxOn?.( 'breathe' ) ) S.coughFit?.(); }
		}
		if ( S.vog > L.VOG.hurt ) S.health -= dt * L.VOG.drain * ( S.vog - L.VOG.hurt ) * 2;
		S.pain = Math.max( S.pain || 0, S.vog * 0.25 );
		// eyes and skin: SO2 stings uncovered eyes, laze (acid steam) burns them and bare skin
		if ( total > 0.03 && ! pr.eyes ) S.eye = Math.min( 1, ( S.eye || 0 ) + dt * ( L.VOG.eye * c + L.VOG.lazeEye * z ) );
		if ( z > 0.05 && ! pr.air ) S.burn = Math.min( 1, ( S.burn || 0 ) + dt * L.VOG.lazeBurn * z * ( S._skin ?? 0.6 ) );
		if ( total > 0.05 ) S.mood?.( { stress: dt / 60 * total * 4 } );
		if ( S.health <= 0 && ! g.dead ) { S.health = 0; g.onPlayerDeath?.( z > c ? 'laze' : 'volcanic gas' ); }
	}

	// ============================================================================================================
	// diving
	// ============================================================================================================

	// Survival's air source: under water with a working scuba set or rebreather, it breathes for you
	breathe( dt ) {
		const g = this.game, pl = g.player;
		if ( ! pl?.underwater || g.dead ) return false;
		const eq = this.inv?.equip || {};
		const air = L.underwaterAir( eq.back, eq.vest );
		if ( ! air ) return false;
		if ( this.creative ) return true;
		const S = g.survival, D = this.dive;
		const work = ( pl.sprinting ? 1.6 : pl.moving ? 1.2 : 0.9 ) * ( 1 + ( S?.panic || 0 ) / 100 );
		if ( air.kind === 'scuba' ) {
			const st = air.stack, was = st.data.air;
			st.data.air = Math.max( 0, was - L.barUse( D.depth, dt, work ) );
			if ( was > L.DIVE.reserve && st.data.air <= L.DIVE.reserve ) { g.toast( 'Low air', 'warn' ); playSensesSound( g, 'senses_beep', { vol: 0.5, bus: 'ui' } ); }
			if ( st.data.air <= 0 ) { g.toast( 'Out of air', 'bad' ); return false; }
			return true;
		}
		const st = air.stack;
		st.data.o2 = Math.max( 0, st.data.o2 - dt * work );
		st.data.scrub = Math.max( 0, st.data.scrub - dt * work );
		if ( st.data.o2 <= 0 || st.data.scrub <= 0 ) { g.toast( 'Rebreather spent', 'bad' ); return false; }
		return true;
	}

	diving( dt ) {
		const g = this.game, pl = g.player, cam = g.camera, D = this.dive, S = g.survival, inv = this.inv, eq = inv.equip;
		const under = !! pl.underwater;
		const wl = cam && g.physics?.waterLevel ? g.physics.waterLevel( cam.position.x, cam.position.z ) : 0;
		const depth = under && cam ? Math.max( 0, wl - cam.position.y ) : 0;
		const rate = dt > 0 ? ( D.depth - depth ) / dt : 0;
		D.rate += ( ( under ? rate : 0 ) - D.rate ) * Math.min( 1, dt * 4 );
		D.depth = depth;
		const air = L.underwaterAir( eq.back, eq.vest );
		if ( under ) {
			if ( ! D.under ) { D.under = true; if ( D.since > 20 ) { D.t = 0; D.max = 0; } }
			D.since = 0; D.t += dt; D.max = Math.max( D.max, depth );
		} else {
			if ( D.under ) { D.under = false; if ( D.t > 5 ) D.log = { t: D.t, max: D.max, at: g.time?.hours ?? 0 }; }
			D.since += dt;
		}
		// nitrogen in the tissues and bubbles from a fast ascent; they become the bends at the surface
		D.n = L.nitrogen( D.n, depth, dt );
		if ( under ) {
			D.bub += L.bubbleStep( D.rate, D.n, dt );
			if ( depth > L.BENDS.off ) D.bub = Math.max( 0, D.bub - dt * 0.01 );
		}
		D.fast = under && D.rate > L.BENDS.ascent && D.n > 0.3;
		if ( D.fast ) { D.warnT -= dt; if ( D.warnT <= 0 && this.diveComputer() ) { D.warnT = 1.2; playSensesSound( g, 'senses_beep', { vol: 0.35, bus: 'ui' } ); } }
		const live = ! this.creative && ! S?.godMode && S;
		if ( ! under && D.bub > 0 ) {
			if ( D.bub > L.BENDS.at && live ) { S.bends = Math.min( 1, ( S.bends || 0 ) + D.bub ); S.msg?.( 'bends', 'The bends', 'bad', 30 ); }
			D.bub = 0;
		}
		if ( live && S.bends > 0 ) {
			// back under pressure with air, they shrink faster (in-water recompression)
			const recompress = under && depth >= L.BENDS.off && air ? L.BENDS.recompress : 1;
			S.bends = Math.max( 0, S.bends - dt * L.BENDS.fall * recompress );
			S.pain = Math.max( S.pain || 0, S.bends * L.BENDS.pain );
			if ( S.bends > 0.5 ) S.health -= dt * L.BENDS.drain * ( S.bends - 0.5 );
		}
		// pure oxygen below its limit: a convulsion now and then
		if ( live && under && air?.kind === 'rebreather' && depth > L.REBREATHER.maxDepth && Math.random() < dt * ( depth - L.REBREATHER.maxDepth ) * L.REBREATHER.tox ) {
			S.health -= 10; S.damageFlash = Math.min( 1, ( S.damageFlash || 0 ) + 0.6 ); pl.shake = Math.max( pl.shake || 0, 0.9 );
			S.msg?.( 'oxtox', 'Oxygen toxicity', 'bad', 8 );
			if ( S.health <= 0 && ! g.dead ) { S.health = 0; g.onPlayerDeath?.( 'oxygen toxicity' ); }
		}
		// a heavy cylinder without a buoyancy vest drags at you; fins help
		if ( live && ( pl.swimming || under ) && pl.moving && ( eq.back?.id === 'scuba_set' || eq.back?.id === 'scuba_tank' || eq.back?.id === 'scba_pack' ) && eq.vest?.id !== 'scuba_bcd' ) {
			S.stamina = Math.max( 0, S.stamina - dt * ( eq.feet?.id === 'swim_fins' ? 1.5 : 3.5 ) );
		}
		// a BCD holds you level under water (the swim's buoyancy would float you up): it cancels the lift the next frame
		// adds after its damping (Player: vel lerps to 0 by dt * 3, then gains ( surface - y ) * dt * 6); Space and C,
		// or swimming forward looking down, still climb and dive
		if ( under && pl.swimming && eq.vest?.id === 'scuba_bcd' && pl.vel && ! g.dead ) {
			const I = g.input, steer = g.inputActive && ( I?.is?.( 'jump' ) || I?.is?.( 'crouch' ) );
			if ( ! steer && ! ( pl.moving && pl.pitch < - 0.35 ) ) pl.vel.y = - Math.max( 0, wl - 1.45 - pl.pos.y ) * dt * 6 / ( 1 - Math.min( 0.9, dt * 3 ) );
		}
		// lights that aren't sealed flood
		this.flood( dt, under );
		// the regulator's breathing and the exhale's bubbles
		if ( under && air && ! g.dead ) {
			D.breathT -= dt;
			if ( D.breathT <= 0 ) {
				D.breathT = pl.sprinting ? 2.4 : 3.6;
				if ( air.kind === 'scuba' ) {
					playSensesSound( g, 'senses_reg_in', { vol: 0.32, bus: 'ui' } );
					setTimeout( () => { if ( this.game.player?.underwater ) { playSensesSound( this.game, 'senses_bubbles', { vol: 0.4, bus: 'ui' } ); this.fx?.bubbles?.(); } }, 1100 );
				} else playSensesSound( g, 'senses_reg_in', { vol: 0.14, bus: 'ui', rate: 0.8 } );
			}
		}
	}

	diveComputer() { return carried( this.inv, ( s, d ) => s.id === 'dive_computer' && L.chargeOf( s, d ) > 0 ); }

	flood( dt, under ) {
		const g = this.game, inv = this.inv, D = this.dive;
		if ( ! under ) { D.floodT = 0; return; }
		D.floodT += dt;
		if ( D.floodT < 1.5 ) return;
		D.floodT = 0;
		for ( const s of inv.allStacks?.() || [] ) {
			const d = getItem( s.id );
			if ( ! d?.tool?.light || ! s.data.on || L.waterproof( d ) || d.tool.kind === 'chemlight' || d.tool.kind === 'torch' ) continue;
			s.data.on = false;
			s.cond = Math.max( 0, s.cond - 0.15 );
			g.toast( `${d.name} flooded`, 'warn' );
			inv.changed();
		}
	}

	// ============================================================================================================
	// gadgets
	// ============================================================================================================

	gadgets( dt, dh ) {
		const g = this.game, inv = this.inv, creative = this.creative, H = g.hands;
		const held = H?.held;
		// ---- laser pointer: the dot where you point it; the infected who see it go to look ----
		const las = this.laser;
		las.on = held?.id === 'laser_pointer' && held.data.on && L.chargeOf( held ) > 0 && ! g.player.vehicle;
		if ( held?.id === 'laser_pointer' && held.data.on && L.chargeOf( held ) <= 0 ) { held.data.on = false; g.toast( 'Laser: batteries dead', 'warn' ); }
		if ( las.on ) {
			if ( dh > 0 && ! creative ) L.drain( held, dh, L.LASER.drain );
			this.laserAim();
			las.t -= dt;
			if ( las.t <= 0 && las.hit ) { las.t = L.LASER.every; las.lured = this.lure( las.hit ); }
		} else las.hit = null;
		// ---- parabolic microphone: hold aim to listen ----
		const mic = this.mic;
		const micOn = held?.id === 'parabolic_mic' && !! H?.adsWant && L.chargeOf( held ) > 0 && ! g.player.underwater;
		if ( micOn && ! mic.on ) playSensesSound( g, 'senses_mic', { vol: 0.4, bus: 'ui' } );
		mic.on = micOn;
		if ( mic.on ) {
			if ( dh > 0 && ! creative ) L.drain( held, dh );
			mic.t -= dt;
			if ( mic.t <= 0 ) { mic.t = L.MIC.every; this.listen(); }
		}
		// ---- gas detector: beeps faster the thicker the gas ----
		const det = carried( inv, ( s ) => s.id === 'gas_detector' && s.data.on !== false );
		this.ppm = 0;
		if ( det && L.chargeOf( det ) > 0 ) {
			if ( dh > 0 && ! creative ) L.drain( det, dh );
			this.ppm = L.ppm( Math.max( this.conc.vog, this.conc.laze ) );
			const every = L.beepEvery( this.ppm );
			this.beepT -= dt;
			if ( every > 0 && this.beepT <= 0 ) { this.beepT = every; playSensesSound( g, 'senses_beep', { vol: 0.5, bus: 'ui' } ); }
			if ( every === 0 ) this.beepT = 0;
		}
		this.detector = det && L.chargeOf( det ) > 0 ? det : null;
		// ---- smartwatch: it buzzes when your heart races or your blood oxygen drops ----
		const watch = carried( inv, ( s ) => s.id === 'smartwatch' );
		this.watchQuiet = Math.max( 0, this.watchQuiet - dt );
		if ( watch && L.chargeOf( watch ) > 0 ) {
			if ( dh > 0 && ! creative ) L.drain( watch, dh );
			this.watchT -= dt;
			if ( this.watchT <= 0 && g.survival?.vitals ) {
				this.watchT = 1;
				const v = g.survival.vitals();
				if ( this.watchQuiet <= 0 && ( v.hr >= L.WATCH.hr || v.spo2 <= L.WATCH.spo2 ) ) {
					this.watchQuiet = L.WATCH.every;
					playSensesSound( g, 'senses_buzz', { vol: 0.5, bus: 'ui' } );
					g.toast( v.spo2 <= L.WATCH.spo2 ? `SpO₂ ${v.spo2}%` : `Heart rate ${v.hr}`, 'warn' );
				}
			}
		}
		// ---- weather radio: storm warnings and vog advisories while it's on ----
		this.radioWatch( dt, dh );
		this.keepForecast();
	}

	// where the laser dot lands: the first thing along the aim, a creature or the world
	laserAim() {
		const g = this.game, cam = g.camera, las = this.laser;
		const o = _v.copy( cam.position ), dir = _d.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		let hit = null, t = L.LASER.range, normal = las.normal.set( - dir.x, - dir.y, - dir.z );
		const ph = g.physics?.raycast?.( o, dir, L.LASER.range );
		if ( ph ) { t = ph.t; normal.copy( ph.normal || normal ); hit = true; }
		const eh = g.entities?.raycast?.( o, dir, t, g.player );
		las.onEntity = null;
		if ( eh?.entity && eh.t < t ) { t = eh.t; hit = true; las.onEntity = eh.entity; normal.set( - dir.x, - dir.y, - dir.z ); }
		if ( ! hit ) { las.hit = null; return; }
		las.hit = ( las.hit || new THREE.Vector3() ).copy( o ).addScaledVector( dir, t - 0.01 );
	}

	// the infected near the dot who can see it walk over to it; by day it only shows up close
	lure( dot ) {
		const g = this.game, night = g.world?.sky?.night ?? 0;
		const reach = night > 0.4 || g.world?.isIndoors?.( dot ) ? L.LASER.lure : L.LASER.day;
		let n = 0;
		for ( const z of g.entities?.near?.( dot, reach, 'zombie', _near ) || [] ) {
			if ( ! z.alive || z.state === 'chase' || z.state === 'attack' || z.state === 'bash' || z === this.laser.onEntity ) continue;
			_v2.set( z.pos.x, z.pos.y + 1.55 * ( z.inst?.scale || 1 ), z.pos.z );
			if ( g.physics?.lineOfSight && ! g.physics.lineOfSight( _v2, _v.copy( dot ).addScaledVector( this.laser.normal, 0.05 ) ) ) continue;
			z.alertTo?.( dot.clone(), null, false );
			n ++;
		}
		return n;
	}

	// what the dish picks up: groans in a cone ahead, played as if close; the readout counts them
	listen() {
		const g = this.game, cam = g.camera, mic = this.mic;
		const fwd = _d.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		const list = [];
		for ( const z of g.entities?.near?.( cam.position, L.MIC.range, 'zombie', _near ) || [] ) {
			if ( ! z.alive ) continue;
			_v.set( z.pos.x - cam.position.x, z.pos.y + 1.5 - cam.position.y, z.pos.z - cam.position.z );
			const d = _v.length();
			if ( d < 3 || _v.dot( fwd ) / d < L.MIC.cos ) continue;
			list.push( { z, d } );
		}
		list.sort( ( a, b ) => a.d - b.d );
		mic.count = list.length;
		mic.near = list[ 0 ] ? { d: list[ 0 ].d, x: list[ 0 ].z.pos.x, z: list[ 0 ].z.pos.z } : null;
		// two voices a pass, the nearest first, louder than the ear alone would hear them
		for ( const { z, d } of list.slice( 0, 2 ) ) {
			if ( Math.random() > 0.6 ) continue;
			g.audio?.play?.( z.state === 'chase' ? 'z_alert' : 'z_groan' + ( 1 + Math.floor( Math.random() * 4 ) ), {
				pos: _v2.set( z.pos.x, z.pos.y + 1.6, z.pos.z ), vol: 0.9, max: L.MIC.range + 40, ref: L.MIC.ref, rate: z.pitch || 1, delay: false, lowpass: 3800 } );
			void d;
		}
	}

	radioWatch( dt, dh ) {
		const g = this.game, R = this.radio, creative = this.creative;
		const radio = carried( this.inv, ( s ) => s.id === 'weather_radio' && s.data.on );
		if ( ! radio ) return;
		if ( L.chargeOf( radio ) <= 0 ) { radio.data.on = false; g.toast( 'Weather radio: batteries dead', 'warn' ); this.inv.changed(); return; }
		if ( dh > 0 && ! creative ) L.drain( radio, dh );
		R.t -= dt;
		if ( R.t > 0 ) return;
		R.t = 20;
		const fc = this.forecast();
		const W = g.weather, h = g.time?.hours ?? 0;
		if ( fc && fc.state === 'storm' && fc.at - h < 3 && R.warned !== Math.round( fc.at * 10 ) ) {
			R.warned = Math.round( fc.at * 10 );
			playSensesSound( g, 'senses_alert', { vol: 0.5, bus: 'ui' } );
			g.toast( `Storm warning · ${Math.max( 1, Math.round( fc.at - h ) )} h`, 'warn' );
		}
		const adv = L.vogAdvisory( Math.max( this.conc.vog, this.conc.laze ) );
		const lvl = adv ? ( /heavy/.test( adv ) ? 3 : /moderate/.test( adv ) ? 2 : 1 ) : 0;
		if ( lvl > R.vog ) { playSensesSound( g, 'senses_alert', { vol: 0.35, bus: 'ui' } ); g.toast( adv, 'warn' ); }
		R.vog = lvl;
		void W;
	}

	// the weather service's call for the next change (rolled ahead, then the weather is held to it)
	forecast() {
		const W = this.game.weather, h = this.game.time?.hours ?? 0;
		if ( ! W ) return null;
		const R = this.radio;
		if ( ! R.fc || R.fc.from !== W.state || R.fc.at < h ) R.fc = { from: W.state, state: L.nextWeather(), at: h + Math.max( 0.2, W.nextChange || 1 ) };
		return R.fc;
	}
	keepForecast() {
		const W = this.game.weather, R = this.radio;
		if ( ! W ) return;
		if ( R.lastState && W.state !== R.lastState && R.fc && R.fc.from === R.lastState && R.fc.state !== W.state && typeof W.set === 'function' ) W.set( R.fc.state );
		if ( W.state !== R.lastState && R.fc?.from !== W.state ) R.fc = null;
		R.lastState = W.state;
	}
	bulletin() {
		const g = this.game, W = g.weather, h = g.time?.hours ?? 0;
		if ( ! W ) return 'Static';
		const fc = this.forecast();
		const parts = [ L.wxName( W.state ) ];
		if ( fc && fc.state !== W.state ) parts.push( `${L.wxName( fc.state )} in ${Math.max( 1, Math.round( fc.at - h ) )} h` );
		parts.push( `Wind ${Math.round( 5 + ( W.wind || 0 ) * 25 )} mph`, `Surf ${L.surfFt( W.sea || 0 )} ft` );
		const P = g.player.pos, w = this.windDir(), here = L.vogAt( P.x, P.z, w.x, w.z, W.wind ?? 0.45 );
		const adv = L.vogAdvisory( Math.max( here.vog, here.laze ) * 3 );
		if ( adv ) parts.push( adv );
		return parts.join( ' · ' );
	}

	// ============================================================================================================
	// the grade (Game.grade): the view, a mask's lenses, the haze
	// ============================================================================================================

	grade( out ) {
		const g = this.game, v = this.view, inv = this.inv;
		if ( ! inv ) return out;
		if ( v.src ) v.palette = v.src.data.palette || 0;
		L.viewGrade( v, out );
		out.mask = 0; out.maskFog = 0; out.tube = 0;
		if ( v.mode ) {
			out.tube = v.handheld ? ( v.mode === 1 ? L.TUBES[ v.tube ]?.tube || 0.42 : L.CORES[ v.core ]?.tube || 0.44 ) * Math.max( 0.85, v.k ) : v.mode === 1 ? L.TUBES[ v.tube ]?.tube || 0.5 : L.CORES[ v.core ]?.tube || 0.5;
			if ( v.mode === 2 ) out.heatRef = L.HEAT.ref * this.light;
			// a tube switching on flickers up
			if ( ! v.handheld && v.k < 1 ) out.nv *= 0.6 + 0.4 * Math.abs( Math.sin( this.t * 40 ) );
		}
		if ( this.scope ) out.tube = 0.46 * Math.max( 0.3, this.scope.k || 0 );
		// a mask's lenses
		const eq = inv.equip, face = eq.face, S = g.survival;
		const m = face ? L.MASKS[ face.id ] : null;
		let kind = 0;
		if ( this.protection?.air && eq.back?.id === 'scba_pack' ) kind = 3;
		else if ( m?.eyes ) kind = 1;
		else if ( eq.eyes?.id === 'dive_mask' ) kind = 2;
		if ( kind && ! v.mode ) {
			out.mask = 1; out.maskKind = kind;
			// breath fogs the lens when you're out of breath
			const st = S?.stamina ?? 100;
			out.maskFog = kind !== 2 && st < 45 ? ( 1 - st / 45 ) * ( 0.55 + 0.45 * Math.sin( this.t * ( 2.2 + ( 45 - st ) / 20 ) ) ) : 0;
		}
		out.vog = this.vogCam;
		return out;
	}

	// ============================================================================================================
	// persistence
	// ============================================================================================================

	serialize( save ) {
		save.world = save.world || {};
		const D = this.dive;
		save.world.senses = { n: + D.n.toFixed( 4 ), bub: + D.bub.toFixed( 4 ), log: D.log, fc: this.radio.fc, ring: + this.ring.toFixed( 3 ) };
	}
	load( save ) {
		const o = save?.world?.senses;
		if ( ! o ) return;
		const D = this.dive;
		D.n = Number.isFinite( o.n ) ? o.n : 0;
		D.bub = Number.isFinite( o.bub ) ? o.bub : 0;
		D.log = o.log || null;
		this.radio.fc = o.fc || null;
		this.ring = Number.isFinite( o.ring ) ? o.ring : 0;
	}

	dispose() {
		this.applyHeat( false );
		this.chain?.restore?.();
		this.whine?.stop?.();
		this.fx?.dispose?.();
		this.hud?.dispose?.();
		this.offNoise?.();
		const g = this.game;
		if ( g.player ) g.player.aimFov = 1;
	}
}
