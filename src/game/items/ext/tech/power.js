// Power for the tech items (docs/ITEMS_PLAN.md "tech"): the portable generator, the solar panel and the solar garden
// light as placeables, and the helpers the verbs and combos share (what wants charging, fuel you carry, a running
// generator nearby). Node-safe: the kinds register with the placeables registry; looks fall back to the item model.
//
//   generator    burns gasoline from its own tank (stack.data.fuel), runs loud (a 'noise' pulse the infected hear,
//                every few seconds), keeps the battery lights placed near it lit and topped up, and charges every
//                rechargeable thing you carry ("Charge devices", a little fuel per device). Outdoors only.
//   solar        a folding panel: plug in up to two rechargeable devices (or a car battery) and they charge in
//                daylight, faster in full sun. Outdoors only.
//   solar_light  a garden stake light: charges by day, lights itself at night.
//
//   powerAt( game, pos, r ) -> the running generator within r m, or null (another domain's rice cooker or fridge can
//   ask: `import { powerAt } from '../../ext/tech/power.js'`)
import { addPlaceable } from '../../placeables/registry.js';
import { getItem } from '../../ItemDB.js';
import { provides } from '../../util.js';
import * as L from './logic.js';
import { ensureTechSound } from './sounds.js';

// the placeables' visual helpers (three.js and the renderer) only where there is a page
let FX = null;
if ( typeof window !== 'undefined' && typeof document !== 'undefined' ) import( '../../placeables/fx.js' ).then( ( m ) => { FX = m; } ).catch( () => {} );

const pct = ( k ) => `${Math.round( L.clamp( k, 0, 1 ) * 100 )}%`;

// ---- what wants charging --------------------------------------------------------------------------------------------

// carried things a charger can fill, emptiest first (a car battery counts by its energy)
export function chargeTargets( inv, { car = false, skip = null, banks = true } = {} ) {
	const out = [];
	for ( const s of inv.allStacks() ) {
		if ( s === skip ) continue;
		const d = getItem( s.id );
		if ( car && d?.id === 'car_battery' ) { if ( L.carEnergy( s ) < 0.99 ) out.push( s ); continue; }
		if ( ! L.rechargeable( d ) || ( ! banks && d.tool.kind === 'powerbank' ) ) continue;
		if ( L.fracOf( s, d ) < 0.97 ) out.push( s );
	}
	out.sort( ( a, b ) => frac( a ) - frac( b ) );
	return out;
}
const frac = ( s ) => s.id === 'car_battery' ? L.carEnergy( s ) : L.fracOf( s );
export const chargeLabel = ( s ) => `${getItem( s.id )?.name || s.id} ${pct( frac( s ) )}`;

// charge one target by `units` (a car battery takes them as energy); returns the units used
export function feed( s, units ) {
	if ( s.id === 'car_battery' ) {
		const e = L.carEnergy( s ), take = Math.min( units, ( 1 - e ) * L.CAR_UNITS );
		s.data.energy = Math.min( 1, e + take / L.CAR_UNITS );
		return take;
	}
	return L.chargeBy( s, units );
}

// ---- fuel you carry -------------------------------------------------------------------------------------------------

// litres of gasoline in a stack you can pour from (a gas can, a jerrycan, a bottle someone filled)
export function fuelIn( s ) {
	const d = getItem( s?.id );
	if ( ! d ) return 0;
	if ( d.fuel && d.fuel.kind === 'gasoline' ) return s.data?.amount ?? d.fuel.litres;
	if ( d.tool?.liquid && s.data?.liquid === 'fuel' ) return s.data.amount || 0;
	return 0;
}
// room for gasoline in a stack (a fuel can, or an empty or fuel-holding bottle or jug)
export function fuelRoom( s ) {
	const d = getItem( s?.id );
	if ( ! d ) return 0;
	if ( d.fuel && d.fuel.kind === 'gasoline' ) return Math.max( 0, d.fuel.litres - ( s.data?.amount ?? d.fuel.litres ) );
	if ( d.tool?.liquid && ( ! s.data?.liquid || s.data.liquid === 'fuel' || ! ( s.data.amount > 0.005 ) ) && d.tool.kind !== 'pot' && d.tool.kind !== 'canteen' ) return Math.max( 0, d.tool.liquid - ( s.data?.amount || 0 ) );
	return 0;
}
export function takeFuel( s, litres ) {
	const have = fuelIn( s ), n = Math.min( have, litres );
	s.data.amount = have - n;
	if ( getItem( s.id ).tool?.liquid && s.data.amount < 0.005 ) { s.data.amount = 0; s.data.liquid = null; }
	return n;
}
export function putFuel( s, litres ) {
	const n = Math.min( litres, fuelRoom( s ) );
	const d = getItem( s.id );
	s.data.amount = ( d.fuel ? ( s.data.amount ?? d.fuel.litres ) : ( s.data.amount || 0 ) ) + n;
	if ( d.tool?.liquid ) s.data.liquid = 'fuel';
	return n;
}
export const fuelCan = ( inv ) => inv.findAll( ( s ) => fuelIn( s ) > 0.05 ).sort( ( a, b ) => fuelIn( b ) - fuelIn( a ) )[ 0 ] || null;

// ---- generator --------------------------------------------------------------------------------------------------------

export const genFuel = ( st ) => st?.data?.fuel || 0;

export function powerAt( game, pos, r = 20 ) {
	for ( const p of game.placeables?.near?.( pos, r, 'generator' ) || [] ) if ( p.data?.on ) return p;
	return null;
}

// battery lights near a running generator come on and stay charged
function feedLights( p, g, dh ) {
	const M = g.placeables;
	for ( const q of M.near( p.pos, L.GEN.lightR, 'light' ) ) {
		const d = getItem( q.item ), st = q.stack;
		if ( ! st || ! d?.tool?.battery || d.place?.fire || d.tool.kind === 'chemlight' || d.tool.kind === 'torch' ) continue;
		const max = d.place?.burn ?? d.tool.battery;
		if ( dh > 0 ) st.data.charge = Math.min( max, ( st.data.charge || 0 ) + dh * 8 );
		if ( ! st.data.on ) { st.data.charge = Math.max( st.data.charge || 0, 0.25 ); st.data.on = true; M.refresh( q ); }
	}
}

function syncGen( p, g ) {
	const M = g.placeables;
	if ( p.data.on && ! p._gone ) { ensureTechSound( g.audio, 'tech_generator' ); M.loop( p, 'tech_generator', 0.85, 7 ); }
	else M.stopLoop( p, 'tech_generator' );
}

function stopGen( p, g, msg ) {
	p.data.on = false;
	syncGen( p, g );
	g.placeables.refresh( p );
	if ( msg && g.player.pos.distanceTo( g.placeables.vec( p ) ) < 40 ) g.toast( msg, 'info' );
}

addPlaceable( 'generator', {
	radius: 0.4,
	outdoors: true, solid: true, solidBox: { k: 0.9 },
	place: { time: 3, gerund: 'Setting up' },

	onPlace( p ) { p.data = { on: false, pulse: 0 }; p.stack.data.fuel ??= 0; },
	show( p, g ) { syncGen( p, g ); },
	onRemove( p, g ) { p._gone = true; g.placeables.stopLoop( p, 'tech_generator' ); },
	serialize( p ) { return { on: !! p.data.on }; },
	load( p, d ) { p.data = { on: !! d.on, pulse: 0 }; },

	update( p, dt, g, dh ) {
		const D = p.data, st = p.stack;
		if ( ! D.on ) return;
		if ( g.mode !== 'creative' && dh > 0 ) {
			const r = L.genBurn( genFuel( st ), st.cond, dh );
			st.data.fuel = r.fuel; st.cond = r.cond;
			if ( r.out ) { stopGen( p, g, 'Generator out of fuel' ); return; }
		}
		// loud: the infected come to see
		D.pulse = ( D.pulse || 0 ) - dt;
		if ( D.pulse <= 0 ) { D.pulse = L.GEN.every; g.placeables.noise( p, L.GEN.noise, 'generator' ); }
		feedLights( p, g, dh );
	},

	sub( p ) {
		const f = genFuel( p.stack );
		return `${p.data.on ? 'Running' : 'Off'} · ${f > 0.05 ? f.toFixed( 1 ) + ' L' : 'no fuel'}`;
	},

	actions( p, g ) {
		const M = g.placeables, D = p.data, st = p.stack, inv = g.player.inventory, A = [];
		if ( D.on ) {
			A.push( { label: 'Stop', run: () => { stopGen( p, g, null ); M.sound( p, 'click', 0.5 ); } } );
			const list = chargeTargets( inv, { car: true } );
			if ( list.length ) A.push( { label: 'Charge devices', run: () => chargeAll( p, g ) } );
		} else if ( genFuel( st ) > 0.02 || g.mode === 'creative' ) {
			A.push( { label: 'Start', run: () => M.timed( 'Starting', 1.6, null, () => {
				if ( ! M.list.has( p.id ) || D.on ) return;
				if ( g.mode !== 'creative' && Math.random() > L.startChance( st.cond ) ) { M.sound( p, 'engine_start', 0.5 ); g.toast( st.cond < 0.12 ? 'Engine seized' : 'Didn\'t catch', 'warn' ); return; }
				D.on = true; D.pulse = 0;
				M.sound( p, 'engine_start', 0.8 );
				M.refresh( p );
			} ) } );
		}
		const can = fuelCan( inv );
		if ( can && genFuel( st ) < L.GEN.tank - 0.1 ) A.push( { label: 'Refuel', run: () => {
			const want = Math.min( fuelIn( can ), L.GEN.tank - genFuel( st ) );
			M.timed( 'Refuelling', L.clamp( want * 1.2, 2, 8 ), 'pour', () => {
				if ( ! g.itemUse?.exists?.( can ) ) return;
				st.data.fuel = genFuel( st ) + takeFuel( can, L.GEN.tank - genFuel( st ) );
				M.refresh( p );
			} );
		} } );
		// as the combo: oil and a wrench for the drain plug
		const oil = inv.find( ( s ) => s.id === 'motor_oil' );
		if ( oil && st.cond < 0.95 && ! D.on ) A.push( { label: 'Change oil', run: () => {
			if ( ! inv.find( ( s ) => provides( s, 'wrench' ) ) ) { g.toast( 'Need a wrench', 'warn' ); return; }
			M.timed( 'Changing oil', 8, 'pour', () => {
				if ( ! g.itemUse?.exists?.( oil ) ) return;
				g.itemUse.consumeOne( oil );
				st.cond = Math.min( 1, st.cond + 0.45 );
				g.skills?.xp?.( 'mechanics', 5 );
				g.toast( `Generator ${Math.round( st.cond * 100 )}%`, 'good' );
			} );
		} } );
		A.push( M.pickUpAction( p, { check: () => D.on ? 'Stop it first' : null, time: 2 } ) );
		return A;
	},
} );

// every carried device (and car battery) to full, paid for in fuel
function chargeAll( p, g ) {
	const M = g.placeables, st = p.stack, inv = g.player.inventory;
	M.timed( 'Charging', 6, 'click', () => {
		if ( ! M.list.has( p.id ) || ! p.data.on ) return;
		let n = 0;
		for ( const s of chargeTargets( inv, { car: true } ) ) {
			const fuel = genFuel( st );
			if ( fuel <= 0.01 && g.mode !== 'creative' ) break;
			const units = g.mode === 'creative' ? 99 : fuel / L.GEN.unitFuel;
			const used = feed( s, units );
			if ( g.mode !== 'creative' ) st.data.fuel = Math.max( 0, fuel - used * L.GEN.unitFuel );
			if ( used > 0 ) n ++;
		}
		inv.changed();
		g.skills?.xp?.( 'electrical', 2 );
		g.toast( n ? `Charged ${n}` : 'Out of fuel', n ? 'good' : 'warn' );
		if ( genFuel( st ) <= 0.01 && g.mode !== 'creative' ) stopGen( p, g, 'Generator out of fuel' );
	} );
}

// ---- solar panel ------------------------------------------------------------------------------------------------------

export function sunNow( g ) {
	return L.sunK( g.world?.sky?.sunDir?.y ?? 0, g.weather?.cover ?? 0.3, g.weather?.rain ?? 0 );
}

addPlaceable( 'solar', {
	radius: 0.45,
	outdoors: true,
	place: { time: 2.5, gerund: 'Setting up' },

	onPlace( p ) { p.data = { dock: [] }; },
	load( p, d ) { p.data = { dock: Array.isArray( d.dock ) ? d.dock.filter( s => s && getItem( s.id ) ) : [] }; },

	update( p, dt, g, dh ) {
		const dock = p.data.dock;
		if ( ! dock?.length || ! ( dh > 0 ) ) return;
		const k = sunNow( g );
		if ( k <= 0 ) return;
		for ( const s of dock ) feed( s, L.SOLAR_RATE * k * dh );
	},

	sub( p, g ) {
		const dock = p.data.dock || [], k = sunNow( g );
		const sun = k > 0.5 ? 'Full sun' : k > 0.05 ? 'Weak sun' : 'No sun';
		return dock.length ? `${dock.map( chargeLabel ).join( ', ' )} · ${sun}` : sun;
	},

	actions( p, g ) {
		const M = g.placeables, dock = p.data.dock, inv = g.player.inventory, A = [];
		if ( dock.length < L.SOLAR_SLOTS ) {
			// the emptiest few, one of each kind of thing, so you choose what charges
			const seen = new Set();
			for ( const s of chargeTargets( inv, { car: true } ) ) {
				if ( seen.has( s.id ) || seen.size >= 3 ) continue;
				seen.add( s.id );
				A.push( { label: `Plug in ${getItem( s.id ).name}`, run: () => {
					if ( dock.length >= L.SOLAR_SLOTS || ! inv.remove( s ) ) return;
					if ( s.data ) s.data.on = false;
					dock.push( s );
					inv.changed();
					M.sound( p, 'click', 0.5 );
				} } );
			}
		}
		dock.forEach( ( s ) => A.push( { label: `Take ${getItem( s.id )?.name || 'device'}`, run: () => {
			const i = dock.indexOf( s );
			if ( i < 0 ) return;
			dock.splice( i, 1 );
			M.give( s );
		} } ) );
		A.push( M.pickUpAction( p, { time: 2, before: () => { for ( const s of dock.splice( 0 ) ) M.give( s ); } } ) );
		return A;
	},
} );

// ---- solar garden light -----------------------------------------------------------------------------------------------

const LIGHT_ON = { color: 0xfff0d0, intensity: 2.6, range: 5.5, flicker: false, lift: 0.4 };

addPlaceable( 'solar_light', {
	radius: 0.06,
	outdoors: true, soft: true,
	place: { time: 1, gerund: 'Planting' },

	onPlace( p ) { const d = getItem( p.item ); p.stack.data.charge ??= d?.tool?.battery || 6; p.stack.data.on = false; },
	show( p, g ) { g.placeables.light( p, p.stack.data.on ? LIGHT_ON : null ); },

	// stood upright, a hand's width in the ground, the lamp glowing when lit
	model( p ) {
		if ( ! FX ) return null;
		const m = FX.itemModel( getItem( p.item ) );
		m.rotation.z = Math.PI / 2;
		m.updateMatrixWorld( true );
		let minX = Infinity, minY = Infinity, maxY = - Infinity, minZ = Infinity, maxX = - Infinity, maxZ = - Infinity;
		m.traverse( ( o ) => {
			if ( ! o.isMesh ) return;
			o.geometry.computeBoundingBox();
			const b = o.geometry.boundingBox.clone().applyMatrix4( o.matrixWorld );
			minX = Math.min( minX, b.min.x ); maxX = Math.max( maxX, b.max.x ); minY = Math.min( minY, b.min.y ); maxY = Math.max( maxY, b.max.y ); minZ = Math.min( minZ, b.min.z ); maxZ = Math.max( maxZ, b.max.z );
		} );
		if ( ! isFinite( minY ) ) return null;
		m.position.set( - ( minX + maxX ) / 2, - 0.08 - minY, - ( minZ + maxZ ) / 2 );
		const g = new m.constructor(); // a THREE.Group (no three.js import here: this file stays Node-safe)
		g.add( m );
		const top = maxY - minY - 0.08;
		if ( p.stack?.data?.on && ! p.preview && FX.glowSprite ) { const s = FX.glowSprite( LIGHT_ON.color, 0.22 ); s.position.y = top - 0.03; g.add( s ); g.userData.glow = s; }
		g.userData.top = top;
		return g;
	},

	update( p, dt, g, dh ) {
		const st = p.stack, d = getItem( p.item ), cap = d?.tool?.battery || 6;
		const k = sunNow( g ), night = g.world?.sky?.night ?? 0;
		let on = !! st.data.on;
		if ( dh > 0 ) {
			if ( k > 0 ) st.data.charge = Math.min( cap, ( st.data.charge || 0 ) + cap * 0.14 * k * dh );
			if ( on ) st.data.charge = Math.max( 0, ( st.data.charge || 0 ) - dh );
		}
		const want = night > 0.45 && ( st.data.charge || 0 ) > 0.05;
		if ( want !== on ) { st.data.on = want; g.placeables.refresh( p ); }
	},

	sub( p ) {
		const st = p.stack, d = getItem( p.item ), cap = d?.tool?.battery || 6;
		return st.data.on ? 'Lit' : `Charge ${pct( ( st.data.charge || 0 ) / cap )}`;
	},

	actions( p, g ) {
		return [ g.placeables.pickUpAction( p, { before: () => { p.stack.data.on = false; } } ) ];
	},
} );

// ---- motion light (added in review) -------------------------------------------------------------------------------------
// A solar security light: charges by day; at night anything that moves within MOTION.r m (the infected, an animal, a
// bandit, you) lights it for a while with a click. When it isn't you, you get a warning from up to MOTION.warn m away,
// so a ring of them round a camp tells you which side they're coming from.

const MOTION_ON = { color: 0xf4f6ff, intensity: 16, range: 14, flicker: false, lift: 0.45 };
const _near = [];

// who set it off: a living creature or bandit near it, else the player close by, else null
export function motionCause( g, pos ) {
	for ( const e of g.entities?.near?.( pos, L.MOTION.r, null, _near ) || [] ) {
		if ( e.alive === false || e.dead ) continue;
		if ( e.type === 'zombie' || e.type === 'animal' || e.type === 'npc' ) return e;
	}
	return g.player.pos.distanceTo( pos ) < L.MOTION.r ? g.player : null;
}

addPlaceable( 'motion_light', {
	radius: 0.15,
	outdoors: true,
	place: { time: 2, gerund: 'Setting up' },

	onPlace( p ) { p.stack.data.charge ??= getItem( p.item )?.tool?.battery || 8; p.data = { lit: 0, quiet: 0 }; },
	serialize() { return {}; },
	load( p ) { p.data = { lit: 0, quiet: 0 }; },
	show( p, g ) { g.placeables.light( p, p.data.lit > 0 ? MOTION_ON : null ); },

	update( p, dt, g, dh ) {
		const st = p.stack, D = p.data, cap = getItem( p.item )?.tool?.battery || 8;
		const k = sunNow( g );
		if ( dh > 0 && k > 0 ) st.data.charge = Math.min( cap, ( st.data.charge || 0 ) + cap * 0.14 * k * dh );
		D.quiet = Math.max( 0, ( D.quiet || 0 ) - dt );
		if ( D.lit > 0 ) {
			D.lit -= dt;
			if ( D.lit <= 0 ) { D.lit = 0; g.placeables.refresh( p ); }
			return;
		}
		const pos = g.placeables.vec( p );
		const who = ( g.world?.sky?.night ?? 0 ) > L.MOTION.night && ( st.data.charge || 0 ) > L.MOTION.drain ? motionCause( g, pos ) : null;
		if ( ! L.motionWants( g.world?.sky?.night ?? 0, st.data.charge || 0, !! who ) ) return;
		D.lit = L.MOTION.lit;
		if ( g.mode !== 'creative' ) st.data.charge = Math.max( 0, st.data.charge - L.MOTION.drain );
		g.placeables.refresh( p );
		g.placeables.sound( p, 'click', 0.6 );
		const d = g.player.pos.distanceTo( pos );
		if ( who !== g.player && d > L.MOTION.r && d < L.MOTION.warn && D.quiet <= 0 ) {
			D.quiet = L.MOTION.every;
			const P = g.player.pos;
			g.toast( `Motion light · ${L.fmtDist( d )} ${L.cardinal( pos.x - P.x, pos.z - P.z )}`, 'warn' );
		}
	},

	sub( p ) {
		const cap = getItem( p.item )?.tool?.battery || 8;
		return p.data.lit > 0 ? 'Lit' : `Charge ${pct( ( p.stack.data.charge || 0 ) / cap )}`;
	},

	actions( p, g ) {
		return [ g.placeables.pickUpAction( p, { before: () => { p.data.lit = 0; } } ) ];
	},
} );
