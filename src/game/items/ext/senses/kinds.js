// The senses equipment's placed things (Node-safe: they register with the placeables registry; looks fall back to the
// item model):
//   senses_compressor   a petrol dive compressor: Start / Stop on its own tank of gasoline (Refuel from a can), loud
//                       while it runs (a noise pulse the infected hear), and "Fill" tops up a carried scuba tank, scuba
//                       set or firefighter's air pack, a bar at a time while you wait
//   senses_sensor       a wireless motion sensor: anything bigger than a cat within a few metres trips it; the alarm
//                       receiver you carry chimes and names the sensor and where it is. No light, no sound at the sensor
//   senses_scope        the spotting scope on its tripod: "Look" for a steady high-power view (the system zooms the
//                       camera until you step away)
import { addPlaceable } from '../../placeables/registry.js';
import { getItem } from '../../ItemDB.js';
import * as L from './logic.js';
import { playSensesSound, ensureSensesSound } from './sounds.js';
import { fuelCan, fuelIn, takeFuel } from '../tech/power.js';

const pct = L.pct;
const _near = [];
let sysOf = () => null;
// the runtime hands itself over (kinds.js is imported by the defs, before the runtime exists)
export function bindSystem( fn ) { sysOf = fn; }

// ---- tanks a compressor fills ------------------------------------------------------------------------------------------

export const TANKS = { scuba_tank: L.DIVE.bar, scuba_set: L.DIVE.bar, scba_pack: L.SCBA.bar };
export function tankFrac( s ) { const cap = TANKS[ s?.id ]; return cap ? L.clamp( ( s.data?.air ?? 0 ) / cap, 0, 1 ) : 1; }
export const tanksToFill = ( inv ) => [ ...( inv?.allStacks?.() || [] ) ].filter( ( s ) => TANKS[ s.id ] && tankFrac( s ) < 0.98 ).sort( ( a, b ) => tankFrac( a ) - tankFrac( b ) );

function syncCompressor( p, g ) {
	const M = g.placeables;
	if ( p.data.on && ! p._gone ) { ensureSensesSound( g.audio, 'senses_compressor' ); M.loop( p, 'senses_compressor', 0.9, 6 ); }
	else M.stopLoop( p, 'senses_compressor' );
}
function stopCompressor( p, g, msg ) {
	p.data.on = false;
	syncCompressor( p, g );
	g.placeables.refresh( p );
	if ( msg && g.player.pos.distanceTo( g.placeables.vec( p ) ) < 40 ) g.toast( msg, 'info' );
}

addPlaceable( 'senses_compressor', {
	radius: 0.45,
	outdoors: true, solid: true, solidBox: { k: 0.85 },
	place: { time: 3, gerund: 'Setting up' },

	onPlace( p ) { p.data = { on: false, pulse: 0 }; p.stack.data.fuel ??= 0; },
	show( p, g ) { syncCompressor( p, g ); },
	onRemove( p, g ) { p._gone = true; g.placeables.stopLoop( p, 'senses_compressor' ); },
	serialize( p ) { return { on: !! p.data.on }; },
	load( p, d ) { p.data = { on: !! d.on, pulse: 0 }; },

	update( p, dt, g, dh ) {
		const D = p.data, st = p.stack;
		if ( ! D.on ) return;
		if ( g.mode !== 'creative' && dh > 0 ) {
			st.data.fuel = Math.max( 0, ( st.data.fuel || 0 ) - dh * L.COMPRESSOR.perTank * 1.2 );
			if ( st.data.fuel <= 0 ) { stopCompressor( p, g, 'Compressor out of fuel' ); return; }
		}
		D.pulse = ( D.pulse || 0 ) - dt;
		if ( D.pulse <= 0 ) { D.pulse = L.COMPRESSOR.every; g.placeables.noise( p, L.COMPRESSOR.noise, 'compressor' ); }
	},

	sub( p ) {
		const f = p.stack?.data?.fuel || 0;
		return `${p.data.on ? 'Running' : 'Off'} · ${f > 0.05 ? f.toFixed( 1 ) + ' L' : 'no fuel'}`;
	},

	actions( p, g ) {
		const M = g.placeables, D = p.data, st = p.stack, inv = g.player.inventory, A = [];
		const fuel = st.data.fuel || 0;
		if ( D.on ) {
			for ( const t of tanksToFill( inv ).slice( 0, 3 ) ) {
				const d = getItem( t.id );
				A.push( { label: `Fill ${d.name.toLowerCase()} (${pct( tankFrac( t ) )})`, run: () => fillTank( p, g, t ) } );
			}
			A.push( { label: 'Stop', run: () => { stopCompressor( p, g, null ); M.sound( p, 'click', 0.5 ); } } );
		} else if ( fuel > 0.02 || g.mode === 'creative' ) {
			A.push( { label: 'Start', run: () => M.timed( 'Starting', 1.6, null, () => {
				if ( ! M.list.has( p.id ) || D.on ) return;
				if ( g.mode !== 'creative' && Math.random() > 0.35 + st.cond * 0.65 ) { M.sound( p, 'engine_start', 0.5 ); g.toast( 'Didn\'t catch', 'warn' ); return; }
				D.on = true; D.pulse = 0;
				M.sound( p, 'engine_start', 0.8 );
				M.refresh( p );
			} ) } );
		}
		const can = fuelCan( inv );
		if ( can && fuel < L.COMPRESSOR.tank - 0.1 ) A.push( { label: 'Refuel', run: () => {
			M.timed( 'Refuelling', 4, 'pour', () => {
				if ( ! g.itemUse?.exists?.( can ) ) return;
				st.data.fuel = ( st.data.fuel || 0 ) + takeFuel( can, L.COMPRESSOR.tank - ( st.data.fuel || 0 ) );
				M.refresh( p );
			} );
		} } );
		A.push( M.pickUpAction( p, { check: () => D.on ? 'Stop it first' : null, time: 2.5 } ) );
		return A;
	},
} );

// a tank topped up while you stand by (the noise goes on all the while)
export function fillTank( p, g, tank ) {
	const M = g.placeables, cap = TANKS[ tank.id ];
	const want = cap - ( tank.data.air || 0 );
	const time = g.mode === 'creative' ? 2 : L.clamp( want / cap * L.COMPRESSOR.fillS, 4, L.COMPRESSOR.fillS );
	M.timed( 'Filling', time, null, () => {
		if ( ! M.list.has( p.id ) || ! p.data.on || ! g.itemUse?.exists?.( tank ) ) return;
		const st = p.stack, need = want / cap * L.COMPRESSOR.perTank;
		if ( g.mode !== 'creative' ) st.data.fuel = Math.max( 0, ( st.data.fuel || 0 ) - need );
		tank.data.air = cap;
		g.player.inventory.changed();
		g.skills?.xp?.( 'mechanics', 2 );
		g.toast( `${getItem( tank.id ).name} full`, 'good' );
		if ( ( st.data.fuel || 0 ) <= 0.01 && g.mode !== 'creative' ) stopCompressor( p, g, 'Compressor out of fuel' );
	} );
}

// ---- motion sensors ---------------------------------------------------------------------------------------------------------

// who tripped it: a living creature or a bandit (the player setting it up doesn't count)
export function tripper( g, pos, r = L.SENSOR.r ) {
	for ( const e of g.entities?.near?.( pos, r, null, _near ) || [] ) {
		if ( e.alive === false || e.dead || e.removed ) continue;
		if ( e.type === 'zombie' || e.type === 'npc' ) return e;
		if ( e.type === 'animal' && e.species !== 'chicken' && e.species !== 'nene' ) return e;
	}
	return null;
}
// the next free sensor number
export function nextZone( g ) {
	const used = new Set( ( g.placeables?.near?.( g.player.pos, 1e6, 'senses_sensor' ) || [] ).map( ( q ) => q.data?.zone ) );
	for ( let i = 1; i < 99; i ++ ) if ( ! used.has( i ) ) return i;
	return 99;
}
export const receiverOn = ( inv ) => inv?.find?.( ( s, d ) => s.id === 'alarm_receiver' && s.data.on !== false && L.chargeOf( s, d ) > 0 ) || null;

addPlaceable( 'senses_sensor', {
	radius: 0.08,
	soft: false,
	place: { time: 1.5, gerund: 'Setting' },

	onPlace( p, g ) { p.data = { zone: nextZone( g ), quiet: 0, armT: 4 }; p.stack.data.charge ??= L.SENSOR.battery; },
	serialize( p ) { return { zone: p.data.zone }; },
	load( p, d ) { p.data = { zone: d.zone || 1, quiet: 0, armT: 2 }; },
	label( p ) { return `Motion sensor ${p.data.zone}`; },
	sub( p ) { return `Battery ${pct( ( p.stack?.data?.charge ?? L.SENSOR.battery ) / L.SENSOR.battery )}`; },

	update( p, dt, g, dh ) {
		const D = p.data, st = p.stack;
		if ( dh > 0 && g.mode !== 'creative' ) st.data.charge = Math.max( 0, ( st.data.charge ?? L.SENSOR.battery ) - dh );
		if ( ( st.data.charge ?? 1 ) <= 0 ) return;
		D.armT = Math.max( 0, ( D.armT || 0 ) - dt );
		D.quiet = Math.max( 0, ( D.quiet || 0 ) - dt );
		if ( D.armT > 0 || D.quiet > 0 ) return;
		const pos = g.placeables.vec( p );
		const who = tripper( g, pos );
		if ( ! who ) return;
		D.quiet = L.SENSOR.quiet;
		const rx = receiverOn( g.player.inventory ), P = g.player.pos, d = P.distanceTo( pos );
		if ( ! rx || d > L.SENSOR.warn ) return;
		playSensesSound( g, 'senses_chime', { vol: 0.55, bus: 'ui' } );
		g.toast( `Sensor ${D.zone} · ${L.fmtDist( d )} ${L.cardinal( pos.x - P.x, pos.z - P.z )}`, 'warn' );
		const sys = sysOf( g );
		if ( sys ) sys.lastTrip = { zone: D.zone, at: g.time?.hours ?? 0 };
	},

	actions( p, g ) {
		return [
			{ label: 'Test', run: () => {
				if ( ! receiverOn( g.player.inventory ) ) { g.toast( 'No receiver on', 'info' ); return; }
				playSensesSound( g, 'senses_chime', { vol: 0.5, bus: 'ui' } );
				g.toast( `Sensor ${p.data.zone} OK`, 'good' );
			} },
			g.placeables.pickUpAction( p ),
		];
	},
} );

// ---- the spotting scope on its tripod -----------------------------------------------------------------------------------------

addPlaceable( 'senses_scope', {
	radius: 0.3,
	place: { time: 2, gerund: 'Setting up' },
	sub( p, g ) { return sysOf( g )?.scope?.p === p ? `${L.SCOPE.zoom}× · looking` : `${L.SCOPE.zoom}×`; },
	actions( p, g ) {
		const sys = sysOf( g ), on = sys?.scope?.p === p;
		return [
			{ label: on ? 'Stop looking' : 'Look', run: () => sys?.startScope?.( p ) },
			g.placeables.pickUpAction( p, { before: () => { if ( sys?.scope?.p === p ) sys.stopScope(); } } ),
		];
	},
} );
