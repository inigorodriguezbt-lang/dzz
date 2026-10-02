// The numbers behind the outdoors domain, as pure functions (Node-tested in test/ext-outdoors.mjs): traps in the water
// and the pig trap, spearfishing and the throw net, the solar still, the smoking rack and the tanning frame, the
// mosquitoes at dusk, and what a patch of coast or valley gives a blade.

export const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
const hourOf = ( h ) => ( ( h % 24 ) + 24 ) % 24;

// one id from [ [ id, w ], … ]
export function pickWeighted( rnd, list ) {
	let tot = 0;
	for ( const [ , w ] of list ) tot += Math.max( 0, w );
	let r = rnd() * tot;
	for ( const [ id, w ] of list ) { r -= Math.max( 0, w ); if ( r <= 0 && w > 0 ) return id; }
	return list[ list.length - 1 ]?.[ 0 ] ?? null;
}

// the chance of at least one event over `hours` at `perHour`
export const chanceOver = ( perHour, hours ) => hours > 0 ? 1 - Math.pow( 1 - clamp( perHour, 0, 1 ), hours ) : 0;

// ---- traps in the water ('ie fish trap, crab trap) -------------------------------------------------------------------

// cap: catches it holds; alive: game hours a catch stays alive in it before it starts to go off
export const TRAP = {
	fish: { perHour: 0.07, cap: 3, alive: 36 },
	crab: { perHour: 0.06, cap: 3, alive: 48 },
};

// chance per game hour that a set trap takes something: deeper is better up to a point, bait doubles it, fish feed at
// dawn and dusk and crabs at night, practice helps, and nothing comes while you splash about beside it
export function trapChance( kind, { depth = 1, bait = false, hour = 12, skill = 0, watched = false } = {} ) {
	if ( watched ) return 0;
	const T = TRAP[ kind ] || TRAP.fish;
	let c = T.perHour;
	c *= depth < 0.4 ? 0.3 : depth < 1 ? 0.8 : depth < 4 ? 1 : 0.7;
	if ( bait ) c *= 2;
	const h = hourOf( hour );
	if ( kind === 'crab' ) c *= h >= 19 || h < 5 ? 1.6 : 0.7;
	else c *= ( h >= 5 && h < 8 ) || ( h >= 17 && h < 20 ) ? 1.5 : 1;
	c *= 1 + clamp( skill, 0, 10 ) * 0.08;
	return Math.min( 0.5, c );
}

export const TRAP_CATCH = {
	fish: [ [ 'raw_fish', 60 ], [ 'raw_tako', 16 ], [ 'raw_squid', 10 ], [ 'raw_lobster', 6 ], [ 'raw_ulua', 4 ] ],
	crab: [ [ 'raw_crab', 68 ], [ 'raw_lobster', 24 ], [ 'raw_tako', 8 ] ],
};

// ---- spearfishing --------------------------------------------------------------------------------------------------

// tool: 'pole' (a pole spear or a bamboo spear), 'sling' (the Hawaiian sling), 'gun' (a spear gun)
export const SPEAR = {
	pole: { base: 0.3, time: 8, wear: 0.01 },
	sling: { base: 0.4, time: 7, wear: 0.012 },
	gun: { base: 0.5, time: 6, wear: 0.008 },
};

// the chance a dive brings something back: a mask to see with, fins, being under rather than peering from the
// surface, practice; at night you need a light (Hawaiian torch fishing) or it is mostly blind luck
export function spearChance( { tool = 'pole', skill = 0, mask = false, fins = false, under = false, night = false, light = false, depth = 2 } = {} ) {
	let c = ( SPEAR[ tool ] || SPEAR.pole ).base + clamp( skill, 0, 10 ) * 0.03;
	if ( mask ) c += 0.15;
	if ( fins ) c += 0.05;
	if ( under ) c += 0.08;
	if ( night && ! light ) c *= 0.4;
	if ( depth < 0.6 ) c *= 0.3; // knee-deep: little swims there
	return clamp( c, 0.02, 0.9 );
}

// what a hit is, by the water under you; only a spear gun reaches the big fish
export function spearCatch( rnd, depth, tool = 'pole' ) {
	let list;
	if ( depth < 2.5 ) list = [ [ 'raw_fish', 60 ], [ 'raw_tako', 22 ], [ 'raw_lobster', 10 ], [ 'raw_squid', 8 ] ];
	else if ( depth < 12 ) list = [ [ 'raw_fish', 46 ], [ 'raw_ulua', 18 ], [ 'raw_tako', 14 ], [ 'raw_lobster', 8 ], [ 'raw_squid', 8 ], [ 'raw_mahimahi', 6 ] ];
	else list = [ [ 'raw_fish', 30 ], [ 'raw_ulua', 28 ], [ 'raw_mahimahi', 22 ], [ 'raw_ahi', 12 ], [ 'raw_squid', 8 ] ];
	const id = pickWeighted( rnd, list );
	if ( tool !== 'gun' && ( id === 'raw_ulua' || id === 'raw_mahimahi' || id === 'raw_ahi' ) ) return 'raw_fish';
	return id;
}

// blood in deep water: a shark comes to look
export const sharkChance = ( depth, night ) => depth < 8 ? 0 : ( night ? 0.12 : 0.05 );

// ---- the throw net (ʻupena kiloi) --------------------------------------------------------------------------------------

// one cast over shallow water: [ [ id, n ] ] and whether it snagged on the reef
export function castNet( rnd, { depth = 1.2, skill = 0, hour = 12 } = {} ) {
	const out = [];
	const h = hourOf( hour );
	const good = ( h >= 5 && h < 9 ) || ( h >= 16 && h < 20 ) ? 1.25 : 1;
	const p = clamp( ( 0.45 + clamp( skill, 0, 10 ) * 0.035 ) * good * ( depth > 3 ? 0.5 : 1 ), 0.05, 0.92 );
	if ( rnd() < p ) out.push( [ 'raw_fish', 1 + Math.floor( rnd() * ( 2 + skill * 0.2 ) ) ] );
	if ( rnd() < 0.55 ) out.push( [ 'fishing_bait', 1 + Math.floor( rnd() * 4 ) ] );
	if ( rnd() < 0.06 ) out.push( [ 'raw_squid', 1 ] );
	const snag = rnd() < 0.12 - clamp( skill, 0, 10 ) * 0.006;
	return { out, snag };
}

// ---- the solar still -------------------------------------------------------------------------------------------------

// litres a game hour: damp ground gives a little, a basin of seawater or dirty water a lot more; only in sun
export const STILL = { cap: 2, sea: 4, ground: 0.07, basin: 0.22 };
export function stillRate( { sun = 1, cover = 0.3, rain = 0, basin = false } = {} ) {
	if ( sun <= 0 || rain > 0.3 ) return 0;
	const k = clamp( sun, 0, 1 ) * clamp( 1.15 - cover, 0.15, 1 );
	return ( basin ? STILL.basin : STILL.ground ) * k;
}

// ---- smoking and tanning ---------------------------------------------------------------------------------------------

// hours over a smoky fire; what it holds (meat hooks hang more); game hours of fire per fuel item
export const SMOKE = { hours: 6, cap: 4, hook: 2, maxHooks: 2, fuel: { stick: 0.5, long_stick: 1.2, firewood: 3, charcoal: 4, planks: 2, coconut_husk: 1, bamboo_pole: 1.2, palm_frond: 0.3 } };
// raw meat and fish you can hang: what it becomes
export function smokeOut( def ) {
	if ( ! def?.food?.raw ) return null;
	const t = def.tags || [];
	if ( t.includes( 'fish' ) ) return 'smoked_fish';
	if ( t.includes( 'meat' ) ) return 'smoked_meat';
	return null;
}

// a hide laced into the frame cures in game hours; salt halves it; a proper skinning blade gets more from it
export const TAN = { hours: 36, salted: 18, yield: 2, skinYield: 3 };
export const tanHours = ( salted ) => salted ? TAN.salted : TAN.hours;

// ---- the pig trap ----------------------------------------------------------------------------------------------------

// chance per game hour a feral pig walks into a baited cage: wild wet country, not on Lānaʻi or Kahoʻolawe (no pigs),
// at night more, never with you standing by it; an unbaited cage rarely
export function pigChance( { townEdge = 2000, moist = 0.5, bait = false, hour = 12, watched = false, pigs = true } = {} ) {
	if ( watched || ! pigs ) return 0;
	const wild = townEdge <= 0 ? 0.05 : townEdge < 1000 ? 0.05 + 0.95 * townEdge / 1000 : 1;
	let c = 0.04 * wild * ( 0.3 + clamp( moist, 0, 1 ) );
	c *= bait ? 1 : 0.15;
	const h = hourOf( hour );
	if ( h >= 19 || h < 6 ) c *= 1.6;
	return Math.min( 0.3, c );
}
export const PIG = { alive: 72, squealEvery: 25, squealR: 35 };
export const PIG_YIELD = [ [ 'raw_boar', 3, 4 ], [ 'animal_hide', 1, 1 ], [ 'bone', 1, 2 ] ];

// ---- mosquitoes --------------------------------------------------------------------------------------------------------

// how thick they are (0..1): dusk is worst and dawn bad, a little through the night; low, damp, still places (the trade
// winds clear the beach, rain keeps them down, they don't live up on the mountains)
export function mosquitoLevel( { hour = 12, y = 10, moist = 0.5, beach = false, rain = 0 } = {} ) {
	const h = hourOf( hour );
	let k = h >= 17.5 && h < 20.5 ? 1 : h >= 5 && h < 7 ? 0.7 : h >= 20.5 || h < 5 ? 0.35 : moist > 0.7 ? 0.12 : 0;
	if ( ! k ) return 0;
	if ( y > 250 ) return 0;
	if ( y > 150 ) k *= ( 250 - y ) / 100;
	k *= 0.3 + clamp( moist, 0, 1 );
	if ( beach ) k *= 0.4;
	if ( rain > 0.5 ) k *= 0.5;
	return clamp( k, 0, 1 );
}
// per real second at level 1; protection; bites through a night's sleep
export const MOSQ = { min: 0.25, stress: 0.05, unhappy: 0.01, sprayH: 4, coilR: 6, smokeR: 4, coilH: 7, night: { unhappy: 6, stress: 3 } };

// ---- what a blade cuts from the land --------------------------------------------------------------------------------

// each patch gives once a game day; [ id, min, max, chance ]
export const HARVEST = {
	patch: 16, regrow: 24,
	fronds: [ [ 'palm_frond', 2, 4, 0.95 ], [ 'coconut', 1, 1, 0.3 ], [ 'coconut_husk', 1, 2, 0.35 ] ],
	bamboo: [ [ 'bamboo_pole', 1, 2, 0.9 ], [ 'kukui_nuts', 2, 5, 0.45 ], [ 'palm_frond', 1, 2, 0.2 ] ],
};

// ---- signalling a plane ----------------------------------------------------------------------------------------------

// game hours between tries, the chance one is seen (more with practice)
export const SIGNAL = { cooldown: 12, chance: 0.1, perLevel: 0.012 };
export const signalChance = ( skill ) => clamp( SIGNAL.chance + clamp( skill, 0, 10 ) * SIGNAL.perLevel, 0, 0.3 );

// ---- the bow drill ---------------------------------------------------------------------------------------------------

export const bowDrillChance = ( skill, wet = false ) => clamp( 0.4 + clamp( skill, 0, 10 ) * 0.05 - ( wet ? 0.25 : 0 ), 0.05, 0.95 );

// a basalt flake off a stone: practice wastes fewer
export const knapChance = ( skill ) => clamp( 0.45 + clamp( skill, 0, 10 ) * 0.04, 0, 0.9 );
