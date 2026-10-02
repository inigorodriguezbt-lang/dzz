// Evolved cooking, Project Zomboid style (docs/ITEMS_PLAN.md "kitchen"). A base takes ingredients one at a time: a pot
// of water (soups and stews), an oiled wok or pan (stir-fries, fried rice), a bowl (salads, poke), a slice of bread
// (sandwiches) or a bowl of rice (rice bowls). The stack records what went in as data.dish and is named after it
// ("Stew (taro, Spam, onion)"), or after a dish it recognises ("Spam fried rice"). Pots and pans are cooked at a fire;
// eating applies the summed nutrition (the eat hook in defs/ext/kitchen.js, hooks.js addEatHook).
// Node-safe (no three.js): the combos and verbs in defs/ext/kitchen.js and test/ext-kitchen.mjs drive it.
//
// data.dish = { base, ids: [ ids in order ], names: [ main ingredients ], seas: [ seasonings ], kinds: [ … ],
//   kcal, water, sick (kept), raw (gone once cooked), spice (seasonings), fun: { boredom, stress, unhappy },
//   vessel: { id, cond } (handed back when the last portion is eaten or the dish is emptied), cooked, mul (cook skill),
//   named (a recognised dish), dirty (unboiled water) }
import { freshness } from '../../ItemDB.js';

// ingredient kinds; seasonings go in a portion at a time and make a dish better rather than bigger
export const SEASON = new Set( [ 'herb', 'spice', 'sauce', 'salt', 'sugar' ] );
const MAX_SEASON = 3;

// the existing pantry as ingredients: k kind, n name in a dish, g group (named dishes), p: one portion at a time
const I = ( k, n, o = {} ) => ( { k, n, ...o } );
const KNOWN = {
	spam: I( 'meat', 'Spam', { g: 'spam' } ), spam_teriyaki: I( 'meat', 'Spam', { g: 'spam' } ), corned_beef: I( 'meat', 'corned beef', { g: 'beef' } ),
	vienna_sausage: I( 'meat', 'Vienna sausage' ), canned_chili: I( 'meat', 'chili', { g: 'beef' } ), canned_stew: I( 'meat', 'beef stew', { g: 'beef' } ),
	canned_tuna: I( 'fish', 'tuna' ), sardines: I( 'fish', 'sardines' ), canned_beans: I( 'veg', 'beans', { g: 'beans' } ), canned_corn: I( 'veg', 'corn' ),
	canned_peaches: I( 'fruit', 'peaches' ), canned_pineapple: I( 'fruit', 'pineapple' ), canned_soup: I( 'liquid', 'soup' ), canned_spaghetti: I( 'noodle', 'spaghetti' ),
	saimin: I( 'noodle', 'saimin', { g: 'saimin' } ), cup_noodles: I( 'noodle', 'noodles' ),
	rice_bag: I( 'rice', 'rice', { p: true } ), cooked_rice: I( 'rice', 'rice' ), poi: I( 'root', 'poi' ),
	eggs: I( 'egg', 'egg' ), cooked_egg: I( 'egg', 'egg' ), onion: I( 'veg', 'onion' ), avocado: I( 'veg', 'avocado' ),
	taro: I( 'root', 'taro' ), cooked_taro: I( 'root', 'taro' ), sweet_potato: I( 'root', 'sweet potato' ), cooked_sweet_potato: I( 'root', 'sweet potato' ),
	breadfruit: I( 'root', 'ʻulu' ), cooked_breadfruit: I( 'root', 'ʻulu' ),
	mango: I( 'fruit', 'mango' ), papaya: I( 'fruit', 'papaya' ), banana: I( 'fruit', 'banana' ), guava: I( 'fruit', 'guava' ), lilikoi: I( 'fruit', 'lilikoʻi' ),
	lychee: I( 'fruit', 'lychee' ), mountain_apple: I( 'fruit', 'mountain apple' ), orange: I( 'fruit', 'orange' ), pineapple: I( 'fruit', 'pineapple' ),
	coconut_open: I( 'fruit', 'coconut' ), dried_mango: I( 'fruit', 'dried mango' ), pickled_mango: I( 'fruit', 'pickled mango', { p: true } ),
	macadamia_nuts: I( 'nut', 'macadamia', { p: true } ), chocolate_macnuts: I( 'sweet', 'chocolate macs', { p: true } ),
	honey: I( 'sugar', 'honey', { p: true } ), peanut_butter: I( 'sweet', 'peanut butter', { p: true, g: 'peanut_butter' } ),
	beef_jerky: I( 'meat', 'jerky', { g: 'beef' } ), fish_jerky: I( 'fish', 'dried aku' ), poke: I( 'fish', 'poke', { g: 'poke' } ),
	milk: I( 'liquid', 'milk' ), coconut_water: I( 'liquid', 'coconut water' ), beer_can: I( 'liquid', 'beer' ), beer_bottle: I( 'liquid', 'beer' ), sake: I( 'liquid', 'sake' ),
	raw_boar: I( 'meat', 'pork', { g: 'pork' } ), cooked_boar: I( 'meat', 'pork', { g: 'pork' } ), raw_goat: I( 'meat', 'goat' ), cooked_goat: I( 'meat', 'goat' ),
	raw_venison: I( 'meat', 'venison', { g: 'beef' } ), cooked_venison: I( 'meat', 'venison', { g: 'beef' } ),
	raw_chicken: I( 'meat', 'chicken', { g: 'chicken' } ), cooked_chicken: I( 'meat', 'chicken', { g: 'chicken' } ),
	raw_small_game: I( 'meat', 'game meat' ), cooked_small_game: I( 'meat', 'game meat' ),
	raw_fish: I( 'fish', 'fish', { g: 'rawfish' } ), cooked_fish: I( 'fish', 'fish' ), raw_ahi: I( 'fish', 'ahi', { g: 'rawfish' } ), cooked_ahi: I( 'fish', 'ahi' ),
	raw_mahimahi: I( 'fish', 'mahimahi', { g: 'rawfish' } ), cooked_mahimahi: I( 'fish', 'mahimahi' ), raw_ulua: I( 'fish', 'ulua', { g: 'rawfish' } ), cooked_ulua: I( 'fish', 'ulua' ),
	raw_tako: I( 'fish', 'tako', { g: 'tako' } ), cooked_tako: I( 'fish', 'tako', { g: 'tako' } ), raw_shark: I( 'fish', 'shark' ), cooked_shark: I( 'fish', 'shark' ),
};

// the bases: the dish item while uncooked (pots and pans) and when done, how many things fit, what goes in, and the raw
// things a cold dish takes (raw fish in poke; raw taro or chicken never)
export const BASES = {
	pot: { raw: 'soup_pot_raw', done: 'soup_pot', max: 6, kinds: [ 'meat', 'fish', 'shell', 'veg', 'leaf', 'root', 'fruit', 'rice', 'noodle', 'egg', 'nut', 'liquid', 'flour' ] },
	pan: { raw: 'stirfry_raw', done: 'stirfry', max: 5, kinds: [ 'meat', 'fish', 'shell', 'veg', 'leaf', 'root', 'fruit', 'rice', 'noodle', 'egg', 'nut', 'flour' ] },
	bowl: { done: 'salad_bowl', max: 5, kinds: [ 'meat', 'fish', 'shell', 'veg', 'fruit', 'rice', 'noodle', 'egg', 'nut', 'root', 'sweet' ], rawOk: [ 'fish', 'shell' ] },
	bread: { done: 'sandwich', max: 3, kinds: [ 'meat', 'fish', 'egg', 'veg', 'fruit', 'sweet', 'nut' ] },
	rice: { done: 'rice_bowl', max: 4, kinds: [ 'meat', 'fish', 'shell', 'egg', 'veg', 'nut', 'root' ], rawOk: [ 'fish', 'shell' ] },
};
// every dish item, and its base
export const DISH_BASE = {};
for ( const [ b, B ] of Object.entries( BASES ) ) { if ( B.raw ) DISH_BASE[ B.raw ] = b; DISH_BASE[ B.done ] = b; }
export const isDish = ( id ) => !! DISH_BASE[ id ];
export const isRawDish = ( id ) => !! BASES[ DISH_BASE[ id ] ]?.raw && BASES[ DISH_BASE[ id ] ].raw === id;

// an item as an ingredient: its own `evolved` spec, the table above, else its tags (another domain's meat or fruit)
export function ingredient( def ) {
	if ( ! def || isDish( def.id ) ) return null;
	if ( def.evolved ) return def.evolved.k ? def.evolved : null;
	if ( KNOWN[ def.id ] ) return KNOWN[ def.id ];
	if ( def.cat !== 'food' || ! def.food?.kcal ) return null;
	const t = def.tags || [], n = def.name.replace( /^(Raw|Cooked) /, '' ).toLowerCase();
	if ( t.includes( 'meat' ) ) return { k: 'meat', n };
	if ( t.includes( 'fish' ) ) return { k: 'fish', n };
	if ( t.includes( 'shell' ) ) return { k: 'shell', n };
	if ( t.includes( 'fruit' ) ) return { k: 'fruit', n };
	if ( t.includes( 'vegetable' ) ) return { k: 'veg', n };
	return null;
}

// can this go into that base at all (the combo's matcher: a sealed can still matches, so the drag says why)
export function fits( base, def ) {
	const ing = ingredient( def );
	if ( ! ing ) return false;
	return SEASON.has( ing.k ) || BASES[ base ].kinds.includes( ing.k );
}

// why it can't go in right now (null: it can)
export function refuse( base, dish, stack, def ) {
	const ing = ingredient( def ), B = BASES[ base ];
	if ( def.food?.opener && ! stack.data?.open ) return 'Open it first';
	if ( def.opensTo ) return 'Open it first';
	if ( def.food?.raw && ! B.raw && ! B.rawOk?.includes( ing.k ) ) return 'Cook it first';
	if ( dish ) {
		if ( SEASON.has( ing.k ) ) { if ( dish.spice >= MAX_SEASON ) return 'Seasoned enough'; }
		else if ( dish.names.length + ( dish.extra || 0 ) >= B.max ) return 'Full';
		if ( dish.cooked && ! SEASON.has( ing.k ) && B.raw ) return 'Already cooked';
	}
	return null;
}

// how much of the stack goes in: a seasoning or a bulk bag a portion at a time, anything else one whole unit
export function unitOf( def ) {
	const ing = ingredient( def );
	const P = def.food?.portions || def.drink?.portions || 1;
	return P > 1 && ( ing?.p || SEASON.has( ing?.k ) || def.drink ) ? { portions: 1 } : { qty: 1 };
}

// what that unit brings: { kcal, water, sick (kept), raw (cooked away), fresh, fun, share }
export function contribution( stack, def ) {
	const f = def.food, k = def.drink, u = unitOf( def );
	let kcal = 0, water = 0, share = 1;
	if ( f ) { const P = f.portions || 1; share = u.portions ? 1 / P : ( stack.data?.left ?? P ) / P; kcal = f.kcal * share; water = f.water * share; }
	else if ( k ) { const P = k.portions || 1; share = 1 / P; kcal = k.kcal * share; water = k.water * share; }
	// a dish of its own (li hing mango, pickles) brings what it carries
	const D = stack.data?.dish;
	if ( D && ! isDish( def.id ) ) { kcal = D.kcal * share; water = D.water * share; }
	if ( stack.data?.spill ) { kcal *= 1 - stack.data.spill; water *= 1 - stack.data.spill; }
	const fresh = f?.spoil ? freshness( stack ) : 1;
	const sick = ( f && ! f.raw ? f.sick || 0 : 0 ) + ( fresh <= 0 ? 0.5 : fresh < 0.25 ? 0.15 : 0 );
	const raw = f?.raw ? 0.3 + ( f.sick || 0 ) : 0;
	return { kcal, water, sick, raw, fresh, fun: def.fun || null, share };
}

export function newDish( base, vessel = null ) {
	return { base, ids: [], names: [], seas: [], kinds: [], kcal: 0, water: 0, sick: 0, raw: 0, spice: 0, fun: { boredom: 0, stress: 0, unhappy: 0 },
		vessel, cooked: false, mul: 1, named: null, fresh: 1 };
}

// put one ingredient's contribution into the dish (the stack is used up by the caller)
export function addTo( dish, stack, def ) {
	const ing = ingredient( def ), c = contribution( stack, def );
	dish.ids.push( def.id );
	dish.kinds.push( ing.k );
	if ( SEASON.has( ing.k ) ) { dish.spice ++; if ( ! dish.seas.includes( ing.n ) ) dish.seas.push( ing.n ); }
	else if ( dish.names.includes( ing.n ) ) dish.extra = ( dish.extra || 0 ) + 1;
	else dish.names.push( ing.n );
	if ( ing.g && ! dish.groups?.includes( ing.g ) ) ( dish.groups ||= [] ).push( ing.g );
	dish.kcal += c.kcal;
	dish.water += c.water;
	dish.sick += c.sick;
	dish.raw += c.raw;
	if ( def.food?.spoil ) dish.fresh = Math.min( dish.fresh ?? 1, c.fresh );
	if ( c.fun ) for ( const key of [ 'boredom', 'stress', 'unhappy' ] ) dish.fun[ key ] += ( c.fun[ key ] || 0 ) * c.share;
	// a seasoning cheers a meal up
	if ( SEASON.has( ing.k ) ) { dish.fun.unhappy -= 3; dish.fun.boredom -= 2; }
	dish.named = recognise( dish );
	return dish;
}

// ---- names ----------------------------------------------------------------------------------------------------------

// dishes it knows by their makings: [ base, name, tokens all needed, 'only' (nothing else but seasonings) ]
const NAMED = [
	[ 'pot', 'Saimin', [ 'saimin' ] ],
	[ 'pot', 'Chicken long rice', [ 'chicken', 'noodle', 'ginger' ] ],
	[ 'pot', 'Chicken lūʻau', [ 'chicken', 'luau_leaves', 'coconut_milk' ] ],
	[ 'pot', 'Squid lūʻau', [ 'tako', 'luau_leaves', 'coconut_milk' ] ],
	[ 'pot', 'Portuguese bean soup', [ 'portuguese_sausage', 'beans' ] ],
	[ 'pot', 'Jook', [ 'rice', 'ginger' ] ],
	[ 'pot', 'Beef stew', [ 'beef', 'root' ] ],
	[ 'pot', 'Pork and taro stew', [ 'pork', 'root' ] ],
	[ 'pot', 'Fish soup', [ 'fish', 'ginger' ] ],
	[ 'pan', 'Teriyaki chicken', [ 'chicken', 'teriyaki_sauce' ] ],
	[ 'pan', 'Teri beef', [ 'beef', 'teriyaki_sauce' ] ],
	[ 'pan', 'Spam fried rice', [ 'spam', 'rice' ] ],
	[ 'pan', 'Fried rice', [ 'rice' ] ],
	[ 'pan', 'Fried saimin', [ 'noodle' ] ],
	[ 'pan', 'Spam and eggs', [ 'spam', 'egg' ] ],
	[ 'pan', 'Portuguese sausage and eggs', [ 'portuguese_sausage', 'egg' ] ],
	[ 'pan', 'Fried egg', [ 'egg' ], true ],
	[ 'bowl', 'Poke bowl', [ 'rawfish', 'shoyu', 'rice' ] ],
	[ 'bowl', 'Hawaiian poke', [ 'rawfish', 'inamona' ] ],
	[ 'bowl', 'Poke', [ 'rawfish', 'shoyu' ] ],
	[ 'bowl', 'Limu poke', [ 'rawfish', 'limu' ] ],
	[ 'bowl', 'Fruit salad', [ 'fruit' ], true ],
	[ 'bread', 'Spam sandwich', [ 'spam' ] ],
	[ 'bread', 'PB and guava jam', [ 'peanut_butter', 'guava_jam' ] ],
	[ 'bread', 'Egg salad sandwich', [ 'egg', 'mayo' ] ],
	[ 'bread', 'Lilikoʻi butter sandwich', [ 'lilikoi_butter' ], true ],
	[ 'rice', 'Loco moco', [ 'egg', 'meat' ] ],
	[ 'rice', 'Poke bowl', [ 'poke' ] ],
	[ 'rice', 'Kalua pig bowl', [ 'kalua_pig' ] ],
	[ 'rice', 'Teri chicken bowl', [ 'chicken', 'teriyaki_sauce' ] ],
	[ 'rice', 'Furikake rice', [ 'furikake' ], true ],
];

function tokens( dish ) {
	return new Set( [ ...dish.ids, ...dish.kinds, ...( dish.groups || [] ) ] );
}

export function recognise( dish ) {
	const T = tokens( dish );
	for ( const [ base, name, need, only ] of NAMED ) {
		if ( base !== dish.base || ! need.every( t => T.has( t ) ) ) continue;
		if ( only && dish.ids.some( ( id, i ) => ! SEASON.has( dish.kinds[ i ] ) && ! need.includes( id ) && ! need.includes( dish.kinds[ i ] ) ) ) continue;
		return name;
	}
	return null;
}

const TITLE = {
	pot: ( d ) => d.kinds.some( k => k === 'meat' || k === 'root' || k === 'shell' ) ? 'Stew' : 'Soup',
	pan: () => 'Stir-fry',
	bowl: ( d ) => d.kinds.every( k => k === 'fruit' || SEASON.has( k ) ) && d.kinds.includes( 'fruit' ) ? 'Fruit salad' : 'Salad',
	bread: () => 'Sandwich',
	rice: () => 'Rice bowl',
};

export function dishName( dish ) {
	const uncooked = !! BASES[ dish.base ].raw && ! dish.cooked;
	// names keep their capitals where they're names (Spam, Portuguese)
	if ( dish.named ) return uncooked ? 'Uncooked ' + ( /^(Spam|Portuguese|PB)\b/.test( dish.named ) ? dish.named : dish.named[ 0 ].toLowerCase() + dish.named.slice( 1 ) ) : dish.named;
	const title = TITLE[ dish.base ]( dish );
	const list = dish.names.length ? dish.names : dish.seas;
	const shown = list.slice( 0, 3 ).join( ', ' ) + ( list.length > 3 ? ', …' : '' );
	return ( uncooked ? 'Uncooked ' + title.toLowerCase() : title ) + ( shown ? ` (${shown})` : '' );
}

// ---- cooking and eating ---------------------------------------------------------------------------------------------

// the kcal multiplier when eaten: seasonings, a dish it knows, the cook's skill
export function kcalMul( dish ) {
	return ( 1 + 0.05 * Math.min( MAX_SEASON, dish.spice || 0 ) ) * ( dish.named ? 1.05 : 1 ) * ( dish.mul || 1 );
}

// a pot or pan dish cooked at a fire: raw meat and dirty water are safe now, the cook's level adds food and takes
// sickness away, and a hot meal cheers
export function cookDish( dish, level = 0 ) {
	dish.cooked = true;
	dish.raw = 0;
	dish.dirty = false;
	dish.sick *= 1 - 0.06 * level;
	dish.mul = 1 + 0.03 * level;
	dish.fun.unhappy -= 4 + ( dish.named ? 6 : 0 );
	dish.fun.boredom -= 1 + ( dish.named ? 3 : 0 );
	return dish;
}

// the data of a dish stack: its record, its name, and its age (the stalest perishable thing in it)
export function dishData( dish, def ) {
	const spoil = def?.food?.spoil || 0;
	const data = { dish, name: dishName( dish ) };
	if ( spoil ) data.age = spoil * ( 1 - Math.max( 0, Math.min( 1, dish.fresh ?? 1 ) ) );
	return data;
}

// one portion eaten (k = 1 / portions): what it does to you
export function eatDish( dish, k, S, level = 0, rnd = Math.random ) {
	if ( ! S ) return null;
	const kcal = dish.kcal * kcalMul( dish ) * k;
	S.hunger = Math.min( 110, ( S.hunger || 0 ) + kcal / 20 );
	S.thirst = Math.min( 100, ( S.thirst || 0 ) + ( dish.water || 0 ) * k );
	const f = dish.fun || {};
	S.mood?.( { boredom: ( f.boredom || 0 ) * k, stress: ( f.stress || 0 ) * k, unhappy: ( f.unhappy || 0 ) * k } );
	// raw meat and unboiled water in an uncooked pot, and anything off; a practised cook's food less
	const chance = Math.min( 0.95, ( dish.sick || 0 ) + ( dish.raw || 0 ) + ( dish.dirty ? 0.4 : 0 ) ) * ( dish.cooked ? 1 : 1 - 0.03 * level );
	if ( chance > 0 && rnd() < chance ) {
		S.sick = Math.min( 1, ( S.sick || 0 ) + 0.45 );
		S.msg?.( 'sick', 'Nauseous', 'warn' );
		return 'sick';
	}
	return null;
}

// the item and data a dish base starts with, given what the base was: a pot of water, an oiled pan, a bowl, a slice
// of bread, a bowl of rice
export function startDish( base, vessel, extra = {} ) {
	const dish = newDish( base, vessel );
	if ( extra.kcal ) dish.kcal += extra.kcal;
	if ( extra.water ) dish.water += extra.water;
	if ( extra.dirty ) dish.dirty = true;
	if ( extra.salt ) dish.spice ++;
	if ( extra.fresh != null ) dish.fresh = extra.fresh;
	return dish;
}

export const dishItem = ( base, cooked = false ) => cooked || ! BASES[ base ].raw ? BASES[ base ].done : BASES[ base ].raw;
