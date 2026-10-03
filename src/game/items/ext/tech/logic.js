// The numbers behind the tech items, as pure functions (Node-tested in test/ext-tech.mjs): what a device's cells are,
// how charge moves between power banks, generators, solar panels, car batteries and devices, what dismantling gives,
// which broadcast a scanner picks up, what a metal detector reads.
import { getItem } from '../../ItemDB.js';

export const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;

// ---- cells and charge ---------------------------------------------------------------------------------------------

// the loose cell item for each cell size a device can take
export const CELL_ITEM = { aa: 'batteries', d: 'battery_d', '9v': 'battery_9v' };
export const CELL_NAME = { aa: 'AA', d: 'D', '9v': '9 V' };

// lights that burn rather than run on cells, and the phone, which only charges (as combos.js treats them)
const NO_CELLS = new Set( [ 'chemlight', 'torch', 'phone' ] );

// what a device runs on: 'aa' | 'd' | '9v' (loose cells), 'usb' | 'pack' (built-in, recharge only), or null
export function cellOf( d ) {
	const t = d?.tool;
	if ( ! t?.battery ) return null;
	if ( t.cell ) return t.cell;
	if ( t.kind === 'phone' ) return 'usb';
	return NO_CELLS.has( t.kind ) ? null : 'aa';
}

// loose cells come back out of a device only when they are plain cells: a rechargeable one is filled for free by a
// crank, the sun or a generator, so taking its cells out would turn chargers into an endless supply of fresh AAs
export const cellsOut = ( d ) => !! CELL_ITEM[ cellOf( d ) ] && ! d?.tool?.rechargeable;
// a loose cell is always fresh, so one comes back out only while the device is nearly full (at half, taking it out
// and putting it back would refill the device for free, again and again)
export const CELL_BACK = 0.9;

export const capOf = ( d ) => d?.tool?.battery || 0;
export const chargeOf = ( s, d = getItem( s?.id ) ) => Math.max( 0, s?.data?.charge ?? capOf( d ) );
export const fracOf = ( s, d = getItem( s?.id ) ) => capOf( d ) ? chargeOf( s, d ) / capOf( d ) : 0;

// can a charger (a power bank, a generator, a solar panel, a crank) fill it
export function rechargeable( d ) {
	if ( ! d?.tool?.battery || NO_CELLS.has( d.tool.kind ) && d.tool.kind !== 'phone' ) return false;
	const c = cellOf( d );
	return !! d.tool.rechargeable || c === 'usb' || c === 'pack';
}

// what a full charge of a device costs in charger units: a phone is a fraction of a power bank, a lantern most of one
export const unitsOf = ( d ) => clamp( capOf( d ) / 12, 0.4, 1.5 );

// charge a device by up to `units`; returns the units used
export function chargeBy( s, units, d = getItem( s.id ) ) {
	const cap = capOf( d );
	if ( ! cap || ! ( units > 0 ) ) return 0;
	const need = ( cap - chargeOf( s, d ) ) / cap * unitsOf( d );
	const used = Math.min( need, units );
	s.data.charge = Math.min( cap, chargeOf( s, d ) + used / unitsOf( d ) * cap );
	return used;
}

// what is left in a device that wants charging (0 = full)
export const needOf = ( s, d = getItem( s.id ) ) => capOf( d ) ? ( 1 - fracOf( s, d ) ) * unitsOf( d ) : 0;

// a car battery's stored energy 0..1 (16 device units when full); a found one is part charged, the same every time
export const CAR_UNITS = 16;
export function carEnergy( s ) {
	if ( ! s ) return 0;
	s.data = s.data || {};
	if ( s.data.energy == null ) s.data.energy = Math.round( ( 0.3 + ( hashStr( String( s.uid ) ) % 1000 ) / 1000 * 0.6 ) * 100 ) / 100;
	return s.data.energy;
}

export function hashStr( s ) { let h = 2166136261; for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); } return h >>> 0; }

// ---- generator and solar ------------------------------------------------------------------------------------------

export const GEN = { tank: 6, burn: 0.45, wear: 0.006, noise: 55, every: 3, lightR: 18, unitFuel: 0.04 };

// a running generator over dh game hours: { fuel, cond, out } (out: the tank ran dry)
export function genBurn( fuel, cond, dh ) {
	const f = Math.max( 0, fuel - GEN.burn * dh );
	return { fuel: f, cond: Math.max( 0.02, cond - GEN.wear * dh ), out: f <= 1e-4 };
}

// the chance a pull of the cord catches: a worn engine is stubborn, a wreck won't go
export const startChance = ( cond ) => cond < 0.12 ? 0 : clamp( 0.45 + cond * 0.6, 0, 0.98 );

// sunlight on a panel 0..1: the sun's height and the cloud
export function sunK( sunY, cover = 0.3, rain = 0 ) {
	if ( ! ( sunY > 0.05 ) ) return 0;
	return clamp( Math.min( 1, sunY * 2.2 ) * ( 1.15 - cover * 0.8 ) * ( 1 - rain * 0.5 ), 0, 1 );
}
export const SOLAR_RATE = 0.14; // units an hour in full sun, per docked device
export const SOLAR_SLOTS = 2;

// ---- dismantling --------------------------------------------------------------------------------------------------

// the skill a dismantle trains: electronics and powered things are electrical, the rest mechanics (cloth and
// leather tailoring)
export function dismantleSkill( d ) {
	if ( d?.tags?.includes( 'electronics' ) || d?.tool?.battery || d?.dismantleSkill === 'electrical' ) return d?.dismantleSkill || 'electrical';
	if ( d?.dismantleSkill ) return d.dismantleSkill;
	if ( d?.cat === 'clothing' || d?.tool?.kind === 'tent' || d?.tool?.kind === 'sleepingbag' ) return 'tailoring';
	return 'mechanics';
}

// seconds: heavier things take longer; practice and a good tool (precision drivers) speed it up
export function dismantleTime( d, level = 0, quality = 1 ) {
	const base = d.dismantleTime ?? clamp( 4 + d.weight * 1.5, 4, 22 );
	return base * ( 1 - 0.05 * clamp( level, 0, 10 ) ) / Math.max( 0.5, quality );
}

// the parts that come out: [ [ id, n ] ]. A dismantle entry is [ id, qty ] or [ id, qty, chance ]. Delicate parts
// (electronics) break now and then — less with practice and fine tools; a battered thing gives less; charged cells
// come back out.
export function dismantleYield( d, s, { level = 0, quality = 1, rnd = Math.random } = {} ) {
	const out = new Map();
	const worn = ( s?.cond ?? 1 ) < 0.3 ? 0.3 : 0;
	for ( const [ id, q, chance = 1 ] of d.dismantle || [] ) {
		const pd = getItem( id );
		if ( ! pd ) continue;
		const delicate = pd.tags?.includes( 'electronics' );
		const loss = clamp( ( delicate ? Math.max( 0, 0.3 - 0.035 * level ) / quality : 0 ) + worn, 0, 0.9 );
		let n = 0;
		for ( let i = 0; i < q; i ++ ) if ( rnd() < chance && rnd() >= loss ) n ++;
		if ( n ) out.set( id, ( out.get( id ) || 0 ) + n );
	}
	const cell = CELL_ITEM[ cellOf( d ) ];
	if ( cellsOut( d ) && s && fracOf( s, d ) >= CELL_BACK && getItem( cell ) ) out.set( cell, ( out.get( cell ) || 0 ) + 1 );
	return [ ...out ];
}

// ---- radios: which broadcast a scan picks up ----------------------------------------------------------------------

// [ site kind, weight, range m ]: official channels on a police scanner, survivors on CB
export const SCANNER = [ [ 'supply_drop', 3, 3000 ], [ 'military_checkpoint', 2.2, 1500 ], [ 'checkpoint', 2, 1200 ], [ 'fema_camp', 2, 1500 ], [ 'heli_crash', 0.7, 6000 ] ];
export const CB = [ [ 'stash', 1.4, 1500 ], [ 'campsite', 2, 1000 ], [ 'hiker', 1, 1000 ], [ 'body', 0.9, 800 ], [ 'crash_car', 1, 1000 ] ];

// the channels in the order a scan tries them: a weighted shuffle
export function channelOrder( list, rnd = Math.random ) {
	const pool = list.map( c => ( { c, k: Math.pow( rnd(), 1 / c[ 1 ] ) } ) );
	pool.sort( ( a, b ) => b.k - a.k );
	return pool.map( p => p.c );
}

// ---- bearings -------------------------------------------------------------------------------------------------------

// north is -z (as the map and the GPS)
export const cardinal = ( dx, dz ) => [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ][ Math.round( ( ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360 ) / 45 ) % 8 ];
export const fmtDist = ( d ) => d >= 1000 ? `${( d / 1000 ).toFixed( 1 )} km` : `${Math.max( 5, Math.round( d / 5 ) * 5 )} m`;

// ---- metal detector -------------------------------------------------------------------------------------------------

export const DETECT_R = 60; // m: a buried stash rings this far out
export const DIG_R = 5; // m: close enough to mark the spot

// what the detector says about a stash dist m away: 'here' | 'near' | null
export const detectorReading = ( dist ) => dist == null ? null : dist <= DIG_R ? 'here' : dist <= DETECT_R ? 'near' : null;

// the chance a sweep turns up some junk (beaches are full of it)
export const junkChance = ( beach, level = 0 ) => ( beach ? 0.42 : 0.18 ) * ( 1 + level * 0.03 );

// a 12 m square of ground swept: the same spot gives nothing twice for a day
export const sweepCell = ( x, z, size = 12 ) => `${Math.floor( x / size )}:${Math.floor( z / size )}`;
export function swept( list, key, hour, keep = 24 ) {
	return ( list || [] ).some( ( [ k, h ] ) => k === key && hour - h < keep );
}
export function markSwept( list, key, hour, max = 40 ) {
	const out = ( list || [] ).filter( ( [ k ] ) => k !== key );
	out.push( [ key, Math.round( hour * 10 ) / 10 ] );
	return out.slice( - max );
}

// ---- lockbox --------------------------------------------------------------------------------------------------------

// how each way of opening a lockbox goes: seconds, noise radius, the chance it works, the chance the tool snaps
export const LOCK = {
	cut: { time: 4, noise: 6, ok: 1, label: 'Cut lock' },
	drill: { time: 9, noise: 14, ok: 1, label: 'Drill lock' },
	pry: { time: 6, noise: 22, ok: 1, label: 'Pry open', damage: 0.25 },
	pick: { time: 10, noise: 0, ok: 0.55, label: 'Pick lock', snap: 0.15 },
};

// ---- added in review: the TV, the fish finder, the motion light -------------------------------------------------------

// a TV's emergency broadcast names the camps and checkpoints (and a drop now and then); a watch catches it this often
export const TV = [ [ 'fema_camp', 2, 3000 ], [ 'military_checkpoint', 1.2, 2500 ], [ 'supply_drop', 0.8, 3000 ] ];
export const TV_NEWS = 0.45;

// sonar: the depth and how lively the water is (fish feed at dawn and dusk; the big ones hold deep). For SONAR.hours
// after a scan the bite comes faster (Fishing mods: wait x bite, + land to the landing chance)
export const SONAR = { hours: 2, bite: 0.7, land: 0.03, drain: 0.4, perFish: 0.08 };
export function sonarRead( depth, hour ) {
	const feed = ( hour > 5 && hour < 8.5 ) || ( hour > 17 && hour < 20 );
	return `${Math.max( 1, Math.round( depth ) )} m deep · ${feed ? 'Lots of fish' : depth > 12 ? 'Big fish deep' : 'Some fish'}`;
}

// a motion light: what moves within r m at night lights it for `lit` seconds; it warns you from up to `warn` m, at most
// once every `every` seconds; each trigger costs `drain` of its charge
export const MOTION = { r: 10, lit: 20, warn: 120, every: 45, drain: 0.05, night: 0.35 };
export const motionWants = ( night, charge, moved ) => night > MOTION.night && charge > MOTION.drain && moved;
