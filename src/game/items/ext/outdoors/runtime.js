// The outdoors domain at runtime (docs/ITEMS_PLAN.md "outdoors"): what the verbs and the placed things share, and a
// small system for what goes on around you.
//
//   env( g )                          { night, sun (0..1, the sun's height), cover, rain, indoors }
//   water( g )                        { inWater, swimming, under, depth (m of water under you) } or null on land
//   fireSource( g )                   a lighter, matches or a ferro rod with strikes left
//   kindle( g, what, onLit )          light something with the best you carry: a flame or a ferro rod (quick), a
//                                     magnifying glass in sunshine (slow), a bow drill (slow, can fail); false if nothing
//   unlitFire( g, r )                 the nearest campfire within r that has fuel but no flame
//   attach( g )                       once per game: the outdoors system (game.register) — mosquitoes at dusk, the
//                                     emergency blanket's warmth, a lean-to keeping the rain off, bites after a night
//                                     out unprotected. The domain has no module of its own: hooks.js addSystem
//                                     hands us the game when the items module starts (before the save is loaded);
//                                     its state is saved in save.world.outdoors. addProtection( fn ) on it: another
//                                     domain's say that nothing bites you now (a net over the face)
//   state( g )                        that system's state: { sprayUntil, wrapUntil, harvested: Map, signalAt, … }
import { getItem } from '../../ItemDB.js';
import { provides } from '../../util.js';
import { mosquitoLevel, MOSQ, bowDrillChance, clamp } from './logic.js';
import { ensureOutdoorsSound } from './sounds.js';

// ---- the world around you ------------------------------------------------------------------------------------------

export function env( g ) {
	const sky = g.world?.sky, p = g.player?.pos;
	const sunY = sky?.sunDir?.y ?? ( ( g.hour ?? 12 ) > 6 && ( g.hour ?? 12 ) < 18 ? 0.8 : - 0.5 );
	return {
		night: sky?.night ?? ( sunY < 0 ? 1 : 0 ),
		sun: clamp( sunY, 0, 1 ),
		cover: g.weather?.cover ?? 0.3,
		rain: g.weather?.rain ?? 0,
		indoors: !! ( p && g.world?.isIndoors?.( p ) ),
	};
}

// full sun on you: what a magnifying glass, a mirror and a solar still need
export function sunny( g ) {
	const e = env( g );
	return e.sun > 0.25 && ! e.indoors && e.cover < 0.75 && e.rain < 0.2;
}

// standing or swimming in the sea: how deep it is under you
export function water( g ) {
	const pl = g.player, p = pl?.pos;
	if ( ! p || pl.vehicle ) return null;
	const wl = g.physics?.waterLevel?.( p.x, p.z ) ?? 0;
	const depth = wl - ( g.hf?.heightAt?.( p.x, p.z ) ?? 0 );
	const wade = wl - p.y;
	if ( ! pl.swimming && wade < 0.45 ) return null;
	return { inWater: true, swimming: !! pl.swimming, under: !! pl.underwater, depth: Math.max( 0, depth ) };
}

// ---- fire ----------------------------------------------------------------------------------------------------------

const usesLeft = ( s, d ) => s.data?.uses ?? d?.tool?.uses ?? 1;
export function fireSource( g ) {
	return g.player.inventory.find( ( s, d ) => ( d?.tool?.kind === 'lighter' || d?.tool?.kind === 'matches' ) && usesLeft( s, d ) > 0 && s.cond > 0 ) || null;
}
const magnifier = ( g ) => g.player.inventory.find( ( s ) => provides( s, 'magnifier' ) );
const bowDrill = ( g ) => g.player.inventory.find( ( s ) => provides( s, 'bowdrill' ) );

// how you would light something now: { how, stack, time, label } or null
export function kindling( g ) {
	if ( g.mode === 'creative' ) return { how: 'free', stack: null, time: 1, label: 'Lighting' };
	const f = fireSource( g );
	if ( f ) return { how: 'flame', stack: f, time: 2.5, label: 'Lighting' };
	const m = magnifier( g );
	if ( m && sunny( g ) ) return { how: 'sun', stack: m, time: 10, label: 'Focusing sunlight' };
	const b = bowDrill( g );
	if ( b ) return { how: 'drill', stack: b, time: 18, label: 'Working the bow drill' };
	return null;
}

export function kindleHint( g ) {
	if ( magnifier( g ) && ! bowDrill( g ) ) return 'Needs sun';
	return 'Need a lighter or matches';
}

// light something (a campfire, the smoking rack's fire, a mosquito coil): onLit() once it catches
export function kindle( g, what, onLit, k = kindling( g ) ) {
	if ( ! k ) { g.toast( kindleHint( g ), 'warn' ); return false; }
	const U = g.itemUse;
	const run = () => {
		if ( k.stack && U?.exists && ! U.exists( k.stack ) ) return;
		if ( k.how === 'flame' ) { if ( U?.useUp ) U.useUp( k.stack ); else k.stack.data.uses = usesLeft( k.stack, getItem( k.stack.id ) ) - 1; }
		if ( k.how === 'sun' ) { U?.wear?.( k.stack, 0.004 ); U?.xp?.( 'survival', 2 ); }
		if ( k.how === 'drill' ) {
			g.survival?.useStamina?.( 25 );
			U?.wear?.( k.stack, 0.04 );
			const wet = ( g.weather?.rain || 0 ) > 0.3 && ! env( g ).indoors;
			if ( Math.random() > bowDrillChance( g.skills?.level?.( 'survival' ) || 0, wet ) ) { U?.xp?.( 'survival', 2 ); g.toast( 'No ember', 'info' ); return; }
			U?.xp?.( 'survival', 6 );
		}
		onLit();
	};
	if ( k.how === 'drill' ) ensureOutdoorsSound( g.audio, 'bow_drill' );
	const sound = k.how === 'flame' ? 'strike' : k.how === 'drill' ? 'bow_drill' : null;
	if ( U?.timed ) U.timed( `${k.label} ${what}`.trim(), k.time, sound, run );
	else g.actions.start( { label: k.label, time: k.time, sound, cancelOnMove: true, onDone: run } );
	return true;
}

export function unlitFire( g, r = 2.6 ) {
	const p = g.player.pos;
	let best = null, bd = r * r;
	for ( const f of g.crafting?.fires || [] ) {
		if ( f.kind !== 'campfire' || f.lit || ! ( f.fuel > 0.01 ) ) continue;
		const d = ( f.pos.x - p.x ) ** 2 + ( f.pos.z - p.z ) ** 2;
		if ( d < bd && Math.abs( f.pos.y - p.y ) < 2 ) { bd = d; best = f; }
	}
	return best;
}

// a lit fire, a burning coil or a smoking rack this close: smoke keeps the mosquitoes off
export function smokeNear( g, pos ) {
	if ( g.nearFire?.( pos, MOSQ.smokeR ) ) return true;
	for ( const p of g.placeables?.near?.( pos, MOSQ.coilR ) || [] ) {
		if ( p.kind === 'mosquito_coil' && p.data?.lit ) return true;
		if ( p.kind === 'smoking_rack' && p.data?.lit && Math.hypot( p.pos.x - pos.x, p.pos.z - pos.z ) < MOSQ.smokeR ) return true;
	}
	return false;
}

// ---- the system ----------------------------------------------------------------------------------------------------

const ATTACHED = new WeakMap();
const _s4 = [ 0, 0, 0, 0 ];

export function state( g ) { return ATTACHED.get( g )?.st || null; }

export function attach( g ) {
	if ( ! g || ATTACHED.has( g ) || typeof g.register !== 'function' ) return ATTACHED.get( g ) || null;
	const sys = new OutdoorsSystem( g );
	ATTACHED.set( g, sys );
	g.register( sys );
	return sys;
}

export class OutdoorsSystem {
	constructor( g ) {
		this.game = g;
		this.t = 0;
		this.buzzT = 8;
		this.warnedDay = - 1;
		this.sleepFrom = null;
		const o = g.save?.world?.outdoors || {};
		this.st = {
			sprayUntil: o.sprayUntil ?? - 1, wrapUntil: o.wrapUntil ?? - 1, signalAt: o.signalAt ?? - 99,
			harvested: new Map( Object.entries( o.harvested || {} ) ), deerAt: - 99,
		};
		this.level = 0;
		this.guards = [];
	}

	// another domain's protection: fn() -> true while nothing can bite you (a net over the face: the gear domain).
	// Counts by day and through the night
	addProtection( fn ) { if ( typeof fn === 'function' && ! this.guards.includes( fn ) ) this.guards.push( fn ); }
	_guarded() { for ( const fn of this.guards ) { try { if ( fn() ) return true; } catch ( e ) { console.error( 'outdoors guard', e ); } } return false; }

	// what keeps them off you right now
	protectedNow( pos ) {
		const g = this.game, h = g.time.hours;
		return this.st.sprayUntil > h || smokeNear( g, pos ) || this._guarded();
	}

	// mosquito level where you stand (0 when protected, indoors, in a car or in the water)
	mosquitoes() {
		const g = this.game, pl = g.player, p = pl.pos;
		if ( pl.vehicle || pl.swimming || g.world?.isIndoors?.( p ) ) return 0;
		const s = g.hf?.surfaceAt?.( p.x, p.z, _s4 ) || _s4;
		const lv = mosquitoLevel( { hour: g.hour, y: p.y, moist: s[ 0 ] ?? 0.5, beach: !! g.world?.isBeach?.( p.x, p.z ), rain: g.weather?.rain || 0 } );
		if ( lv < MOSQ.min || this.protectedNow( p ) ) return 0;
		return lv;
	}

	update( dt ) {
		const g = this.game, S = g.survival, pl = g.player;
		if ( ! S || ! pl || g.dead ) return;
		const h = g.time.hours;
		// a night out under the stars: bites, unless under a net, in a tent or by smoke
		if ( g.sleeping && this.sleepFrom === null ) this.sleepFrom = { h, lv: this._sleepLevel() };
		else if ( ! g.sleeping && this.sleepFrom ) {
			const f = this.sleepFrom;
			this.sleepFrom = null;
			if ( f.lv > 0.15 && h - f.h > 1 ) { S.mood?.( { unhappy: MOSQ.night.unhappy * f.lv * 2, stress: MOSQ.night.stress * f.lv * 2 } ); g.toast( 'Mosquito bites', 'warn' ); }
		}
		this.t += dt;
		if ( this.t < 0.5 ) return;
		const step = this.t;
		this.t = 0;
		// the emergency blanket: warmer and drying while you stay still
		if ( this.st.wrapUntil > h ) {
			if ( pl.sprinting || pl.swimming || pl.vehicle ) { this.st.wrapUntil = - 1; g.toast( 'Blanket off', 'info' ); }
			else {
				if ( S.temp < 37.2 ) S.temp += ( 37.2 - S.temp ) * Math.min( 1, step * 0.012 );
				S.wet = Math.max( 0, ( S.wet || 0 ) - step * 0.004 );
			}
		}
		// under a lean-to the rain doesn't reach you
		const rain = g.weather?.rain || 0;
		if ( rain > 0.1 && ( S.wet || 0 ) > 0 && this._sheltered() ) S.wet = Math.max( 0, S.wet - step * 0.012 * rain );
		// mosquitoes
		this.level = g.mode === 'creative' ? 0 : this.mosquitoes();
		if ( this.level > 0 ) {
			S.mood?.( { stress: MOSQ.stress * this.level * step, unhappy: MOSQ.unhappy * this.level * step } );
			this.buzzT -= step;
			if ( this.buzzT <= 0 ) {
				this.buzzT = 9 + Math.random() * 14;
				if ( ensureOutdoorsSound( g.audio, 'mosquito' ) ) g.audio?.play?.( 'mosquito', { vol: 0.12 + 0.18 * this.level, rate: 0.9 + Math.random() * 0.25 } );
			}
			if ( this.warnedDay !== g.day && this.level > 0.4 ) { this.warnedDay = g.day; g.toast( 'Mosquitoes', 'info' ); }
		}
	}

	_sheltered() {
		const g = this.game, p = g.player.pos;
		for ( const q of g.placeables?.near?.( p, 2.6, 'lean_to' ) || [] ) if ( Math.abs( q.pos.y - p.y ) < 1.5 ) return true;
		return false;
	}

	// how bad the night will be where you lie down
	_sleepLevel() {
		const g = this.game, pl = g.player, p = pl.pos;
		if ( g.mode === 'creative' || g.world?.isIndoors?.( p ) || pl.vehicle ) return 0;
		if ( pl.inventory.count?.( 'mosquito_net' ) > 0 || this._guarded() ) return 0;
		for ( const q of g.placeables?.near?.( p, 2.5 ) || [] ) if ( q.kind === 'shelter' && getItem( q.item )?.place?.shape === 'tent' ) return 0;
		if ( smokeNear( g, p ) ) return 0;
		const s = g.hf?.surfaceAt?.( p.x, p.z, _s4 ) || _s4;
		// the whole night counts: dusk and dawn are when they come
		return Math.max( 0.35, mosquitoLevel( { hour: 19, y: p.y, moist: s[ 0 ] ?? 0.5, beach: !! g.world?.isBeach?.( p.x, p.z ) } ) ) * ( this.st.sprayUntil > g.time.hours ? 0.5 : 1 );
	}

	serialize( save ) {
		save.world = save.world || {};
		const h = this.game.time.hours, harvested = {};
		for ( const [ k, v ] of this.st.harvested ) if ( h - v < 24 ) harvested[ k ] = Math.round( v * 10 ) / 10;
		save.world.outdoors = { sprayUntil: this.st.sprayUntil, wrapUntil: this.st.wrapUntil, signalAt: this.st.signalAt, harvested };
	}

	load( save ) {
		const o = save.world?.outdoors || {};
		this.st.sprayUntil = o.sprayUntil ?? - 1; this.st.wrapUntil = o.wrapUntil ?? - 1; this.st.signalAt = o.signalAt ?? - 99;
		this.st.harvested = new Map( Object.entries( o.harvested || {} ) );
	}
}
