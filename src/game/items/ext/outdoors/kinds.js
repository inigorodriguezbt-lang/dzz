// The outdoors domain's placed things (docs/ITEMS_PLAN.md "Placeables"). Node-safe: each kind's look comes from
// OUT.look[ kind ]( p, game ), set by models/ext/outdoors.js in the browser (else the item's own model).
//
//   fish_trap      an ʻie basket set in the shallows (water only): fish, octopus, squid and the odd lobster swim in over
//                  game hours, more with bait, at dawn and dusk, with fishing practice, never while you splash beside it;
//                  they stay alive in it a day and a half. F: empty it, bait it, pick it up.
//   crab_trap      the same for crabs and lobsters, at night.
//   smoking_rack   hang raw meat and fish over a smoky fire you feed with wood: six game hours later they come off
//                  smoked and keep for weeks (the kitchen's smoked meat and fish). Rain puts the fire out. Meat hooks hang
//                  more. Its smoke keeps the mosquitoes off.
//   tanning_frame  lace an animal hide into it (a blade to scrape it; a skinning knife gets more out of it), salt it if
//                  you have salt, and a day or two later it is leather.
//   pig_trap       a baited cage in wild, wet country catches a feral pig; it squeals (the infected hear it) until you
//                  kill it for its meat, hide and bones.
//   solar_still    a pit under clear plastic: the sun draws fresh water out of the ground, far more from seawater or
//                  dirty water poured into its basin. F: fill a bottle, drink, pour in.
//   lean_to        a tarp or thatch shelter: under it the rain doesn't reach you (the outdoors system), sleep or rest.
//   hammock        a bed off the ground.
//   camp_seat      a folding chair: sit and rest (stamina back, a little less bored and tense).
//   camp_bed       a sleeping pad, a bedroll or a bed of palm fronds laid on the ground: sleep.
//   mosquito_coil  burns seven game hours and keeps mosquitoes off within a few metres.
import { addPlaceable, lc } from '../../placeables/registry.js';
import { getItem, makeStack, freshness } from '../../ItemDB.js';
import { provides, liquidName } from '../../util.js';
import { liquidIn, liquidRoom } from '../../combos.js';
import { TRAP, TRAP_CATCH, trapChance, chanceOver, pickWeighted, SMOKE, smokeOut, TAN, tanHours, pigChance, PIG, PIG_YIELD, STILL, stillRate, MOSQ } from './logic.js';
import { kindle, kindling, env } from './runtime.js';
import { ensureOutdoorsSound } from './sounds.js';

export const OUT = {
	look: {}, // kind -> ( p, game ) -> Object3D, set by the model file
};

const look = ( kind ) => ( p, g ) => OUT.look[ kind ]?.( p, g ) || null;
const spec = ( p ) => getItem( p.item )?.place || {};
const inv = ( g ) => g.player.inventory;
const dist = ( p, g ) => Math.hypot( p.pos.x - g.player.pos.x, p.pos.z - g.player.pos.z );
const hrs = ( h ) => h >= 1 ? `${Math.round( h )} h` : `${Math.max( 5, Math.round( h * 12 ) * 5 )} min`;

// one unit (a portion of something with portions) of a carried stack, wherever it is
export function takeOne( g, s ) {
	const U = g.itemUse, d = getItem( s.id );
	if ( U?.exists && ! U.exists( s ) ) return false;
	const n = d?.food?.portions || 1;
	if ( n > 1 && U?.splitOne ) {
		const one = U.splitOne( s );
		one.data.left = ( one.data.left ?? n ) - 1;
		if ( one.data.left <= 0 ) U.consumeOne( one ); else U.changed( U.where( one ) );
	} else if ( U?.consumeOne ) U.consumeOne( s );
	else { s.qty --; if ( s.qty <= 0 ) inv( g ).remove( s ); }
	inv( g ).changed?.();
	return true;
}

// give n of an id (stacks split by the item's stack size); food comes with an age
function giveN( g, id, n, age = 0 ) {
	const d = getItem( id );
	if ( ! d || n <= 0 ) return;
	while ( n > 0 ) {
		const q = Math.min( n, d.stack );
		n -= q;
		const s = makeStack( id, q );
		if ( d.food?.spoil ) s.data.age = age;
		g.placeables.give( s );
	}
}

// ---- resting and sleeping -------------------------------------------------------------------------------------------

const REST_FUN = { boredom: - 5, stress: - 4 };
export function rest( g, p, label = 'Resting' ) {
	const S = g.survival;
	g.placeables.timed( label, 10, null, () => {
		if ( S ) { S.stamina = S.maxStamina?.() ?? 100; }
		g.itemUse?.applyFun?.( getItem( p.item ), 1, { repeat: 240, fallback: REST_FUN } );
		if ( g.nearFire?.( g.player.pos ) ) S?.mood?.( { unhappy: - 2 } );
	} );
}
const sleepAction = ( g, q ) => ( { label: 'Sleep', run: () => { if ( g.itemUse?.sleep ) g.itemUse.sleep( q ); else g.sleep?.( 6, q ); } } );

// ---- traps in the water ---------------------------------------------------------------------------------------------

// fish and crabs come for squid strips, raw fish, octopus, ʻopihi
export const WATER_BAIT = ( s, d ) => !! d && ( d.id === 'fishing_bait' || ( d.cat === 'food' && !! d.food?.raw && ( d.tags.includes( 'fish' ) || d.tags.includes( 'shell' ) ) ) || d.id === 'opihi' );

function waterTrap( type ) {
	const T = TRAP[ type ];
	return {
		water: 'only',
		place: { time: 4, gerund: 'Setting' },
		model: look( type === 'crab' ? 'crab_trap' : 'fish_trap' ),
		onPlace( p, g ) {
			const wl = g.physics?.waterLevel?.( p.pos.x, p.pos.z ) ?? 0;
			p.data = { set: true, catch: [], bait: null, depth: Math.round( Math.max( 0, wl - p.pos.y ) * 100 ) / 100 };
			g.skills?.xp?.( 'fishing', 2 );
		},
		show( p, g ) {
			// the float rides on the surface, however deep the trap sits
			const surf = ( g.physics?.waterLevel?.( p.pos.x, p.pos.z ) ?? p.pos.y ) - p.pos.y;
			const f = p._obj?.userData?.float;
			if ( f ) f.position.y = surf;
			// and the trap is picked by it: the sea's own prompt (Drink, Fill) is on the surface, nearer than the trap
			// under it (Placeables picks with a sphere at _cy, radius _rr)
			p._cy = Math.max( 0.15, surf ); p._rr = 0.55;
		},
		update( p, dt, g, dh ) {
			const D = p.data;
			if ( ! ( dh > 0 ) || ! D.set || D.catch.length >= T.cap ) return;
			const c = trapChance( type, { depth: D.depth ?? 1, bait: !! D.bait, hour: g.hour, skill: g.skills?.level?.( 'fishing' ) || 0, watched: dist( p, g ) < 15 } );
			if ( Math.random() >= chanceOver( c, dh ) ) return;
			const id = pickWeighted( Math.random, TRAP_CATCH[ type ].filter( ( [ i ] ) => getItem( i ) ) );
			if ( ! id ) return;
			D.catch.push( { id, at: g.time.hours - Math.random() * Math.min( dh, 24 ) } );
			D.bait = null;
			g.placeables.refresh( p );
		},
		sub( p, g ) {
			const D = p.data, n = D.catch?.length || 0;
			return [ n ? `${n} caught` : 'Empty', D.bait ? 'baited' : null ].filter( Boolean ).join( ' · ' );
		},
		actions( p, g ) {
			const D = p.data, M = g.placeables, A = [];
			if ( D.catch?.length ) A.push( { label: 'Empty trap', run: () => M.timed( 'Emptying trap', 4, null, () => {
				const h = g.time.hours;
				for ( const c of D.catch ) giveN( g, c.id, 1, Math.max( 0, h - c.at - T.alive ) );
				g.skills?.xp?.( 'fishing', 3 * D.catch.length );
				g.survival?.mood?.( { boredom: - 3 * D.catch.length } );
				D.catch = [];
				M.refresh( p );
			} ) } );
			if ( ! D.bait ) {
				const b = inv( g ).find( WATER_BAIT );
				if ( b ) A.push( { label: `Bait with ${lc( getItem( b.id ).name )}`, run: () => M.timed( 'Baiting', 2, null, () => { const id = b.id; if ( takeOne( g, b ) ) { D.bait = id; M.refresh( p ); } } ) } );
			}
			A.push( M.pickUpAction( p, { time: 2, check: () => D.catch?.length ? 'Empty it first' : null } ) );
			return A;
		},
	};
}
addPlaceable( 'fish_trap', waterTrap( 'fish' ) );
addPlaceable( 'crab_trap', waterTrap( 'crab' ) );

// ---- the smoking rack -----------------------------------------------------------------------------------------------

const rackCap = ( p ) => SMOKE.cap + ( p.data.hooks || 0 ) * SMOKE.hook;
const rackFuel = ( g ) => inv( g ).find( ( s ) => SMOKE.fuel[ s.id ] > 0 && ! s.data?.items?.length );
const hangable = ( g ) => inv( g ).findAll( ( s, d ) => !! smokeOut( d ) && freshness( s ) > 0 && ! ( s.data?.left < ( d.food.portions || 1 ) ) );

addPlaceable( 'smoking_rack', {
	outdoors: true,
	place: { time: 6, gerund: 'Setting up' },
	model: look( 'smoking_rack' ),
	onPlace( p ) { p.data = { load: [], fuel: 0, lit: false, hooks: 0 }; },
	show( p, g ) {
		const M = g.placeables;
		if ( p.data.lit ) { M.light( p, { color: 0xff7a2a, intensity: 6, range: 6, flicker: true, lift: 0.25 } ); M.loop?.( p, 'fire_loop', 0.35, 4 ); }
		else { M.light( p, null ); M.stopLoop?.( p, 'fire_loop' ); }
	},
	update( p, dt, g, dh ) {
		const D = p.data;
		if ( ! ( dh > 0 ) ) return;
		let changed = false, smoke = 0;
		if ( D.lit ) {
			const out = ( g.weather?.rain || 0 ) > 0.55 && ! g.world?.isIndoors?.( g.placeables.vec( p ) ) && dist( p, g ) < 400;
			// the fire smokes for as long as its wood lasts this step
			smoke = out ? 0 : Math.min( D.fuel, dh );
			D.fuel = Math.max( 0, D.fuel - smoke );
			if ( out || D.fuel <= 1e-6 ) { D.lit = false; changed = true; }
		}
		for ( const e of D.load ) {
			if ( e.done ) continue;
			e.t = ( e.t || 0 ) + smoke;
			if ( e.t >= SMOKE.hours - 1e-6 ) { e.done = true; changed = true; }
			// hanging without smoke it goes off like anywhere else
			else if ( dh > smoke ) e.age = ( e.age || 0 ) + dh - smoke;
		}
		if ( changed ) g.placeables.refresh( p );
	},
	sub( p ) {
		const D = p.data, n = D.load.length, done = D.load.filter( e => e.done ).length;
		const left = D.load.filter( e => ! e.done ).reduce( ( a, e ) => Math.max( a, SMOKE.hours - ( e.t || 0 ) ), 0 );
		const st = done && done === n ? 'Ready' : D.lit ? ( n ? `Smoking · ${hrs( left )} left` : `Burning · ${hrs( D.fuel )}` ) : D.fuel > 0 ? 'Unlit' : 'No fuel';
		return `${n}/${rackCap( p )} · ${st}`;
	},
	actions( p, g ) {
		const D = p.data, M = g.placeables, A = [];
		const done = D.load.filter( e => e.done );
		if ( done.length ) A.push( { label: 'Take smoked', run: () => M.timed( 'Taking down', 3, null, () => {
			for ( const e of D.load.filter( x => x.done ) ) giveN( g, smokeOut( getItem( e.id ) ) || e.id, 1, 0 );
			g.skills?.xp?.( 'cooking', 4 * done.length );
			D.load = D.load.filter( x => ! x.done );
			M.refresh( p );
		} ) } );
		const room = rackCap( p ) - D.load.length;
		const meat = room > 0 ? hangable( g ) : [];
		if ( meat.length ) A.push( { label: 'Hang meat', run: () => M.timed( 'Hanging', 4, null, () => {
			let r = rackCap( p ) - D.load.length;
			for ( const s of hangable( g ) ) {
				while ( r > 0 && s.qty > 0 ) {
					const e = { id: s.id, age: s.data?.age || 0, t: 0 };
					if ( ! takeOne( g, s ) ) break;
					D.load.push( e );
					r --;
				}
				if ( r <= 0 ) break;
			}
			M.refresh( p );
		} ) } );
		const fuel = D.fuel < 8 ? rackFuel( g ) : null;
		if ( fuel ) A.push( { label: `Add ${lc( getItem( fuel.id ).name )}`, run: () => M.timed( 'Adding fuel', 2, 'hit_wood', () => {
			if ( takeOne( g, fuel ) ) { D.fuel = Math.min( 8, D.fuel + SMOKE.fuel[ fuel.id ] ); M.refresh( p ); }
		} ) } );
		if ( ! D.lit && D.fuel > 0 ) A.push( { label: 'Light', run: () => kindle( g, 'the fire', () => { D.lit = true; M.refresh( p ); } ) } );
		if ( D.lit ) A.push( { label: 'Put out', run: () => { D.lit = false; M.refresh( p ); g.audio?.play?.( 'splash', { pos: M.vec( p ), vol: 0.25, rate: 1.6 } ); } } );
		const hook = ( D.hooks || 0 ) < SMOKE.maxHooks ? inv( g ).find( ( s ) => s.id === 'meat_hook' ) : null;
		if ( hook ) A.push( { label: 'Add meat hook', run: () => M.timed( 'Hanging hook', 2, 'click', () => { if ( takeOne( g, hook ) ) { D.hooks = ( D.hooks || 0 ) + 1; M.refresh( p ); } } ) } );
		const raw = D.load.filter( e => ! e.done );
		if ( raw.length ) A.push( { label: 'Take down raw', run: () => M.timed( 'Taking down', 3, null, () => {
			for ( const e of D.load.filter( x => ! x.done ) ) giveN( g, e.id, 1, e.age || 0 );
			D.load = D.load.filter( x => x.done );
			M.refresh( p );
		} ) } );
		A.push( M.pickUpAction( p, { label: 'Take apart', time: 4, check: () => D.load.length ? 'Empty it first' : D.lit ? 'Put it out first' : null,
			before: () => { if ( D.hooks ) giveN( g, 'meat_hook', D.hooks ); } } ) );
		return A;
	},
} );

// ---- the tanning frame ------------------------------------------------------------------------------------------------

const isSalt = ( s, d ) => d?.cat === 'food' && d.tags?.includes( 'salt' );

addPlaceable( 'tanning_frame', {
	place: { time: 5, gerund: 'Setting up' },
	model: look( 'tanning_frame' ),
	onPlace( p ) { p.data = { hide: false, t: 0, salted: false, yield: TAN.yield }; },
	update( p, dt, g, dh ) {
		const D = p.data;
		if ( ! D.hide || ! ( dh > 0 ) ) return;
		const was = D.t >= tanHours( D.salted );
		D.t += dh;
		if ( ! was && D.t >= tanHours( D.salted ) ) g.placeables.refresh( p );
	},
	sub( p ) {
		const D = p.data;
		if ( ! D.hide ) return 'Empty';
		const left = tanHours( D.salted ) - D.t;
		return left <= 0 ? 'Leather ready' : `Curing · ${hrs( left )} left` + ( D.salted ? ' · salted' : '' );
	},
	actions( p, g ) {
		const D = p.data, M = g.placeables, A = [];
		if ( ! D.hide ) {
			const hide = inv( g ).find( ( s ) => s.id === 'animal_hide' );
			const blade = inv( g ).find( ( s ) => provides( s, 'skin' ) ) || inv( g ).find( ( s ) => provides( s, 'cut' ) );
			if ( hide ) A.push( { label: 'Stretch hide', run: () => {
				if ( ! blade ) { g.toast( 'Need a blade to scrape it', 'warn' ); return; }
				M.timed( 'Scraping hide', 10, 'tear', () => {
					if ( ! takeOne( g, hide ) ) return;
					// a proper skinning knife leaves more good leather
					D.hide = true; D.t = 0; D.salted = false;
					D.yield = getItem( blade.id )?.tags?.includes( 'skinning' ) ? TAN.skinYield : TAN.yield;
					g.itemUse?.wear?.( blade, 0.01 );
					g.skills?.xp?.( 'tailoring', 4 );
					M.refresh( p );
				} );
			} } );
		} else if ( D.t >= tanHours( D.salted ) ) {
			A.push( { label: 'Take leather', run: () => M.timed( 'Unlacing', 4, null, () => {
				giveN( g, 'leather', D.yield || TAN.yield );
				g.skills?.xp?.( 'tailoring', 8 );
				D.hide = false; D.t = 0; D.salted = false;
				M.refresh( p );
			} ) } );
		} else if ( ! D.salted ) {
			const salt = inv( g ).find( isSalt );
			if ( salt ) A.push( { label: 'Salt hide', run: () => M.timed( 'Salting', 4, 'tear', () => {
				if ( ! takeOne( g, salt ) ) return;
				const d = getItem( salt.id );
				if ( ( d.food?.portions || 1 ) > 1 && g.itemUse?.exists?.( salt ) ) takeOne( g, salt );
				D.salted = true;
				M.refresh( p );
			} ) } );
		}
		A.push( M.pickUpAction( p, { label: 'Take apart', time: 3, check: () => D.hide ? 'Take the hide off first' : null } ) );
		return A;
	},
} );

// ---- the pig trap -----------------------------------------------------------------------------------------------------

// what a feral pig walks into a cage for: fruit, coconut, roots, anything gone off
const ROOTS = new Set( [ 'taro', 'sweet_potato', 'breadfruit', 'coconut', 'coconut_open', 'cooked_taro', 'cooked_sweet_potato', 'cooked_breadfruit', 'kukui_nuts' ] );
export const PIG_BAIT = ( s, d ) => d?.cat === 'food' && ( d.tags.includes( 'fruit' ) || ROOTS.has( d.id ) || ( !! d.food.spoil && freshness( s ) <= 0 ) );
const killer = ( g ) => inv( g ).find( ( s, d ) => provides( s, 'cut' ) || d?.melee?.kind === 'spear' || d?.cat === 'firearm' );

addPlaceable( 'pig_trap', {
	outdoors: true,
	solid: true,
	solidBox: { k: 0.85 },
	place: { time: 8, gerund: 'Setting up' },
	model: look( 'pig_trap' ),
	check( pos, g ) { return g.hf?.flagsNear?.( pos.x, pos.z ) & ( 1 | 4 | 8 | 16 ) ? 'Needs open ground' : null; },
	onPlace( p, g ) {
		const pos = p.pos, s = g.hf?.surfaceAt?.( pos.x, pos.z ) || [ 0.5, 0, 0, 0 ];
		let edge = 3000;
		for ( const c of g.world?.meta?.cities || [] ) edge = Math.min( edge, Math.hypot( c.x - pos.x, c.z - pos.z ) - ( c.radius || 300 ) );
		const isl = g.hf?.islandAt?.( pos.x, pos.z );
		p.data = { set: true, bait: null, pig: null, town: Math.round( Math.max( 0, edge ) ), moist: + ( s[ 0 ] || 0 ).toFixed( 2 ), pigs: isl !== 1 && isl !== 7 };
		g.skills?.xp?.( 'survival', 2 );
	},
	update( p, dt, g, dh ) {
		const D = p.data, h = g.time.hours;
		if ( D.pig != null ) {
			if ( h - D.pig > PIG.alive ) { D.pig = null; D.set = false; g.placeables.refresh( p ); return; } // it broke out
			// it squeals now and then: the infected come to see
			p._sq = ( p._sq ?? 5 ) - dt;
			if ( p._sq <= 0 && dist( p, g ) < 120 ) {
				p._sq = PIG.squealEvery * ( 0.6 + Math.random() * 0.8 );
				if ( ensureOutdoorsSound( g.audio, 'pig_squeal' ) ) g.audio?.play?.( 'pig_squeal', { pos: g.placeables.vec( p ).clone(), vol: 0.9, rate: 0.9 + Math.random() * 0.2 } );
				g.placeables.noise( p, PIG.squealR, 'animal' );
			}
			return;
		}
		if ( ! D.set || ! ( dh > 0 ) ) return;
		const c = pigChance( { townEdge: D.town ?? 2000, moist: D.moist ?? 0.5, bait: !! D.bait, hour: g.hour, watched: dist( p, g ) < 25, pigs: D.pigs !== false } );
		if ( Math.random() >= chanceOver( c, dh ) ) return;
		D.pig = h - Math.random() * Math.min( dh, 24 );
		D.set = false; D.bait = null;
		g.placeables.refresh( p );
	},
	sub( p ) {
		const D = p.data;
		return D.pig != null ? 'Feral pig' : D.set ? ( D.bait ? 'Set · baited' : 'Set' ) : 'Sprung';
	},
	actions( p, g ) {
		const D = p.data, M = g.placeables, A = [];
		if ( D.pig != null ) {
			A.push( { label: 'Kill pig', run: () => {
				const k = killer( g );
				if ( ! k ) { g.toast( 'Need a blade or a spear', 'warn' ); return; }
				M.timed( 'Killing pig', 6, 'hit_flesh', () => {
					if ( p.data.pig == null ) return;
					for ( const [ id, a, b ] of PIG_YIELD ) giveN( g, id, a + Math.floor( Math.random() * ( b - a + 1 ) ) );
					g.itemUse?.wear?.( k, 0.01 );
					g.fx?.blood?.( M.vec( p ).clone().setY( p.pos.y + 0.4 ), { x: 0, y: 1, z: 0 }, 1 );
					g.skills?.xp?.( 'survival', 10 );
					if ( g.stats ) g.stats.animals = ( g.stats.animals || 0 ) + 1;
					D.pig = null;
					M.refresh( p );
				} );
			} } );
			return A;
		}
		if ( ! D.set ) A.push( { label: 'Set', run: () => M.timed( 'Setting the door', 3, 'click', () => { D.set = true; M.refresh( p ); } ) } );
		else if ( ! D.bait ) {
			const b = inv( g ).find( PIG_BAIT );
			if ( b ) A.push( { label: `Bait with ${lc( getItem( b.id ).name )}`, run: () => M.timed( 'Baiting', 2, null, () => { const id = b.id; if ( takeOne( g, b ) ) { D.bait = id; M.refresh( p ); } } ) } );
		}
		A.push( M.pickUpAction( p, { label: 'Take apart', time: 5 } ) );
		return A;
	},
} );

// ---- the solar still --------------------------------------------------------------------------------------------------

// carried water you can pour in to distil (seawater, dirty water)
const pourable = ( g ) => inv( g ).find( ( s ) => { const l = liquidIn( s ); return !! l && ! l.fuel && ( l.kind === 'sea' || l.kind === 'dirty' ) && l.litres > 0.05; } );
// a carried container that takes clean water
const fillable = ( g ) => inv( g ).find( ( s ) => { const l = liquidIn( s ); return !! l && ! l.fuel && liquidRoom( s ) > 0.02 && ( ! l.kind || l.kind === 'water' ); } );

addPlaceable( 'solar_still', {
	outdoors: true,
	soft: true,
	place: { time: 10, gerund: 'Digging' },
	model: look( 'solar_still' ),
	onPlace( p ) { p.data = { L: 0, sea: 0 }; },
	update( p, dt, g, dh ) {
		const D = p.data;
		if ( ! ( dh > 0 ) ) return;
		const e = env( g );
		const rate = stillRate( { sun: e.sun, cover: e.cover, rain: e.rain, basin: D.sea > 0.05 } );
		const made = Math.min( rate * dh, STILL.cap - D.L );
		if ( made > 0 ) {
			D.L += made;
			if ( D.sea > 0.05 ) D.sea = Math.max( 0, D.sea - made * 1.3 );
		}
		const shown = Math.round( D.L * 5 ) + ':' + ( D.sea > 0.05 ? 1 : 0 );
		if ( p._shown !== shown ) { p._shown = shown; g.placeables.refresh( p ); }
	},
	sub( p ) {
		const D = p.data;
		return `${D.L.toFixed( 1 )} / ${STILL.cap} L` + ( D.sea > 0.05 ? ` · ${D.sea.toFixed( 1 )} L to distil` : '' );
	},
	actions( p, g ) {
		const D = p.data, M = g.placeables, A = [];
		if ( D.L > 0.05 ) {
			const c = fillable( g );
			if ( c ) A.push( { label: `Fill ${lc( getItem( c.id ).name )}`, run: () => M.timed( 'Filling', 3, 'pour', () => {
				const room = liquidRoom( c ), take = Math.min( room, D.L );
				if ( take <= 0 ) return;
				c.data.amount = ( c.data.amount || 0 ) + take;
				c.data.liquid = 'water';
				D.L -= take;
				inv( g ).changed?.();
				M.refresh( p );
				g.toast( `${getItem( c.id ).name}: ${c.data.amount.toFixed( 1 )} L water`, 'good' );
			} ) } );
			const S = g.survival;
			if ( S && ( S.thirst ?? 100 ) < 95 ) A.push( { label: 'Drink', run: () => M.timed( 'Drinking', 3, 'drink', () => {
				const sip = Math.min( 0.5, D.L );
				S.drink( null, sip, 'water' );
				D.L -= sip;
				M.refresh( p );
			} ) } );
		}
		if ( D.sea < STILL.sea - 0.1 ) {
			const c = pourable( g );
			if ( c ) A.push( { label: `Pour in ${liquidName( c.data.liquid )}`, run: () => M.timed( 'Pouring', 3, 'pour', () => {
				const l = liquidIn( c ), take = Math.min( l?.litres || 0, STILL.sea - D.sea );
				if ( take <= 0 ) return;
				c.data.amount = Math.max( 0, ( c.data.amount || 0 ) - take );
				if ( c.data.amount < 0.005 ) { c.data.amount = 0; c.data.liquid = null; }
				D.sea += take;
				inv( g ).changed?.();
				M.refresh( p );
			} ) } );
		}
		A.push( M.pickUpAction( p, { label: 'Take down', time: 4 } ) );
		return A;
	},
} );

// ---- shelters, beds and seats -----------------------------------------------------------------------------------------

addPlaceable( 'lean_to', {
	outdoors: true,
	place: { time: 10, gerund: 'Pitching' },
	model: look( 'lean_to' ),
	sub( p, g ) { return ( g.weather?.rain || 0 ) > 0.1 ? 'Dry under it' : ''; },
	actions( p, g ) {
		return [ sleepAction( g, spec( p ).sleep ?? 0.9 ), { label: 'Rest', run: () => rest( g, p ) }, g.placeables.pickUpAction( p, { label: 'Take down', time: 6 } ) ];
	},
} );

addPlaceable( 'hammock', {
	place: { time: 6, gerund: 'Hanging' },
	model: look( 'hammock' ),
	actions( p, g ) {
		return [ sleepAction( g, spec( p ).sleep ?? 0.95 ), { label: 'Rest', run: () => rest( g, p, 'Swinging' ) }, g.placeables.pickUpAction( p, { label: 'Take down', time: 4 } ) ];
	},
} );

addPlaceable( 'camp_seat', {
	place: { time: 2, gerund: 'Unfolding' },
	model: look( 'camp_seat' ),
	actions( p, g ) { return [ { label: 'Sit', run: () => rest( g, p, 'Sitting' ) }, g.placeables.pickUpAction( p, { label: 'Fold up', time: 2 } ) ]; },
} );

addPlaceable( 'camp_bed', {
	place: { time: 3, gerund: 'Laying out' },
	model: look( 'camp_bed' ),
	actions( p, g ) {
		const S = spec( p );
		return [ sleepAction( g, S.sleep ?? 0.75 ), { label: 'Rest', run: () => rest( g, p, 'Lying down' ) }, g.placeables.pickUpAction( p, { label: p.item === 'frond_bed' ? 'Gather up' : 'Roll up', time: 2 } ) ];
	},
} );

// ---- the mosquito coil -------------------------------------------------------------------------------------------------

addPlaceable( 'mosquito_coil', {
	place: { time: 1.5, gerund: 'Setting' },
	model: look( 'mosquito_coil' ),
	onPlace( p ) { p.data = { lit: false, left: p.stack?.data?.burn ?? MOSQ.coilH }; },
	show( p, g ) { g.placeables.light( p, p.data.lit ? { color: 0xff5a1a, intensity: 0.5, range: 1.2, flicker: true, lift: 0.05 } : null ); },
	update( p, dt, g, dh ) {
		const D = p.data;
		if ( ! D.lit || ! ( dh > 0 ) ) return;
		D.left = Math.max( 0, D.left - dh );
		const rained = ( g.weather?.rain || 0 ) > 0.6 && ! g.world?.isIndoors?.( g.placeables.vec( p ) ) && dist( p, g ) < 400;
		if ( D.left <= 0 || rained ) { D.lit = false; g.placeables.refresh( p ); }
	},
	sub( p ) { const D = p.data; return D.left <= 0 ? 'Burnt out' : D.lit ? `Burning · ${hrs( D.left )} left` : `${hrs( D.left )} left`; },
	actions( p, g ) {
		const D = p.data, M = g.placeables;
		if ( D.left <= 0 ) return [ { label: 'Clear ash', run: () => M.remove( p, { give: false } ) } ];
		const A = [];
		if ( D.lit ) A.push( { label: 'Put out', run: () => { D.lit = false; M.refresh( p ); } } );
		else A.push( { label: 'Light', run: () => kindle( g, 'coil', () => { D.lit = true; M.refresh( p ); }, kindling( g ) ) } );
		A.push( M.pickUpAction( p, { time: 1, check: () => D.lit ? 'Put it out first' : null, before: () => { if ( p.stack ) p.stack.data.burn = D.left; } } ) );
		return A;
	},
} );
