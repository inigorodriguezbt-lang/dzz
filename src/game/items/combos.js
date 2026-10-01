// Item-on-item mixes (docs/ITEMS_PLAN.md "Combos"): drag item A onto item B in the inventory, either way round, or
// pick "Combine" in A's right-click menu. This file is data and pure helpers (Node-safe, no three.js): the domain
// def files register with addCombos( [ … ] ), game.combine (Combine.js) runs them.
//
// A combo:
//   id        unique
//   verb      the drag and menu verb ('Sharpen' → "Sharpen Machete"); label overrides the text: a string with {a} and
//             {b} for the two names ('Insert into {b}'), or fn( a, b ) -> string
//   a, b      matchers for the two sides (below); a is the side the label calls {a}
//   use       units each side uses up: 0 kept, n, 'all' (the whole stack), or { qty | portions | uses: n } to say which
//             unit; default { a: 1, b: 1 }. A plain n is a use for items with uses (duct tape, antiseptic, a lighter),
//             a portion for multi-portion drinks (a shot of rum; the empty bottle stays), else one of the stack (a
//             battery, a nail). Plain units of an id are also taken from other stacks you carry (12 nails from two piles)
//   liquid    { side: 'a'|'b', kind, litres }: drawn from that side's container; without side, from what you carry.
//             kind: 'water' (clean), 'dirty', 'sea', 'fuel' (gasoline), an array of those, or 'any'
//   out       [ id, qty, data? ] or [ [ id, qty, data? ], … ]: into the inventory, else onto the ground
//   repair    { a|b: amount, max }: condition gained by a side, up to max (a side already at max refuses softly:
//             "Not damaged" is not offered in menus, and on a drag the item is not a target)
//   wear      { a|b: amount }: condition lost by a side used as a tool
//   tools     [ kinds ] further needs beyond A and B (a tool's kind or provides, a melee weapon's tools)
//   station   'fire': a lit fire within reach (game.nearFire)
//   time      seconds of a progress action (0 = instant), or fn( ctx ) -> seconds; default 2
//   sound     an item sound (sounds.js) or an engine sound name, played as the action starts
//   check     fn( ctx ) -> a short reason to refuse ('Needs sunlight'), or null. { reason, soft: true } refuses softly
//             (as a repair at its cap: hidden from menus and not a drag target, for pairs that would only clutter them)
//   run       fn( ctx ): custom effect after the standard ones (liquid, repair and wear, use, out)
// Extras read by game.combine: skill (xp on success, and the repair amount and time scale with its level), xp,
// fun ({ boredom, stress, unhappy } to game.survival.mood), noise ({ radius }: zombies come to look), progress
// (the progress label when it differs from the label).
//
// Matchers: an id string; { id }; { ids: [] }; { tag }; { cat }; { tool: kind } (a tool's kind or provides, or a melee
// weapon's tools); { liquid: kind, min: litres } (a container holding it); { fn( stack, def ) }; { any: [ … ] };
// { not: matcher }. Fields in one object combine with AND; id, tag, cat and tool also take an array (any of them), and
// an array matcher is shorthand for { any }.
import { getItem, displayName } from './ItemDB.js';
import { provides } from './util.js';

export const COMBOS = [];
const BY_ID = new Map();

const ONE = 1;
const asOut = ( o ) => ! o ? [] : typeof o === 'string' ? [ [ o, 1 ] ] : typeof o[ 0 ] === 'string' ? [ [ o[ 0 ], o[ 1 ] ?? 1, o[ 2 ] ] ] : o.map( x => [ x[ 0 ], x[ 1 ] ?? 1, x[ 2 ] ] );

export function addCombos( list ) {
	for ( const c of list ) {
		if ( ! c?.id || ! c.a || ! c.b ) { console.warn( 'combo needs id, a and b', c?.id ); continue; }
		if ( BY_ID.has( c.id ) ) console.warn( 'duplicate combo', c.id );
		const combo = { ...c, verb: c.verb || 'Combine', use: { a: c.use?.a ?? ONE, b: c.use?.b ?? ONE }, out: asOut( c.out ), tools: c.tools || [], time: c.time ?? 2 };
		COMBOS.push( combo );
		BY_ID.set( c.id, combo );
	}
}

export const getCombo = ( id ) => BY_ID.get( id );
export const allCombos = () => COMBOS;

// ---- matching ---------------------------------------------------------------------------------------------------

const anyOf = ( v, x ) => Array.isArray( v ) ? v.includes( x ) : v === x;

export function matches( m, stack, def = getItem( stack?.id ) ) {
	if ( ! m || ! stack || ! def ) return false;
	if ( typeof m === 'string' ) return stack.id === m;
	if ( Array.isArray( m ) ) return m.some( x => matches( x, stack, def ) );
	if ( m.id !== undefined && ! anyOf( m.id, stack.id ) ) return false;
	if ( m.ids && ! m.ids.includes( stack.id ) ) return false;
	if ( m.tag !== undefined && ! [].concat( m.tag ).some( t => def.tags?.includes( t ) ) ) return false;
	if ( m.cat !== undefined && ! anyOf( m.cat, def.cat ) ) return false;
	if ( m.tool !== undefined && ! [].concat( m.tool ).some( k => provides( stack, k ) ) ) return false;
	if ( m.liquid !== undefined && ! holds( stack, m.liquid, m.min ?? 0.01 ) ) return false;
	if ( m.fn && ! m.fn( stack, def ) ) return false;
	if ( m.any && ! m.any.some( x => matches( x, stack, def ) ) ) return false;
	if ( m.not && matches( m.not, stack, def ) ) return false;
	return true;
}

// every combo for two stacks, either way round: [ { combo, a, b } ] with a and b the stacks in the combo's sides.
// `both` also lists the reverse orientation of a combo that matches both ways (pouring A into B and B into A);
// otherwise the dragged stack (the first argument) is side a when it can be.
export function findCombos( x, y, { both = false, list = COMBOS } = {} ) {
	if ( ! x || ! y || x === y ) return [];
	const dx = getItem( x.id ), dy = getItem( y.id );
	if ( ! dx || ! dy ) return [];
	const out = [];
	for ( const c of list ) {
		const fwd = matches( c.a, x, dx ) && matches( c.b, y, dy );
		if ( fwd ) out.push( { combo: c, a: x, b: y } );
		if ( ( both || ! fwd ) && matches( c.a, y, dy ) && matches( c.b, x, dx ) ) out.push( { combo: c, a: y, b: x } );
	}
	return out;
}

export function comboLabel( c, a, b ) {
	if ( typeof c.label === 'function' ) return c.label( a, b );
	const na = a ? displayName( a ) : '', nb = b ? displayName( b ) : '';
	if ( c.label ) return c.label.replace( /\{a\}/g, na ).replace( /\{b\}/g, nb );
	return `${c.verb} ${nb}`;
}

// ---- units ------------------------------------------------------------------------------------------------------

// what a plain number of units means for an item (see `use` above)
export function unitKind( def ) {
	if ( def?.tool?.uses || def?.medical?.uses ) return 'uses';
	if ( def?.drink?.portions > 1 ) return 'portions';
	return 'qty';
}

// a side's `use` as { kind, n } | { all: true } | null (kept)
export function useSpec( u, def ) {
	if ( ! u ) return null;
	if ( u === 'all' ) return { all: true };
	if ( typeof u === 'number' ) return u > 0 ? { kind: unitKind( def ), n: u } : null;
	for ( const k of [ 'qty', 'portions', 'uses' ] ) if ( u[ k ] > 0 ) return { kind: k, n: u[ k ] };
	return null;
}

export function maxUses( def ) { return def?.tool?.uses ?? def?.medical?.uses ?? 1; }
export function maxPortions( def ) { return def?.drink?.portions ?? def?.food?.portions ?? 1; }

// units of a kind in one stack (the top unit may be part-used)
export function unitsIn( stack, kind ) {
	const d = getItem( stack.id );
	if ( ! d || ! ( stack.qty > 0 ) ) return 0;
	if ( kind === 'uses' ) { const m = maxUses( d ); return Math.max( 0, stack.data?.uses ?? m ) + ( stack.qty - 1 ) * m; }
	if ( kind === 'portions' ) { const p = maxPortions( d ); return Math.max( 0, stack.data?.left ?? p ) + ( stack.qty - 1 ) * p; }
	return stack.qty;
}

// ---- liquids ----------------------------------------------------------------------------------------------------

// what a stack holds: { kind, litres, cap, fuel } for water containers (kind null when empty) and gasoline / diesel
// cans (fuel: true, they only take fuel), else null. Propane is not pourable.
export function liquidIn( stack, def = getItem( stack?.id ) ) {
	if ( ! stack || ! def ) return null;
	if ( def.tool?.liquid ) {
		const L = stack.data?.amount || 0;
		return { kind: L > 0.005 ? stack.data.liquid || null : null, litres: L, cap: def.tool.liquid, fuel: false };
	}
	if ( def.fuel && def.fuel.kind !== 'propane' ) return { kind: def.fuel.kind === 'gasoline' ? 'fuel' : def.fuel.kind, litres: stack.data?.amount ?? def.fuel.litres, cap: def.fuel.litres, fuel: true };
	return null;
}

export const kindOk = ( want, kind ) => !! kind && ( want === 'any' || anyOf( want, kind ) );

export function holds( stack, kind, min = 0.01 ) {
	const l = liquidIn( stack );
	return !! l && kindOk( kind, l.kind ) && l.litres >= min - 1e-6;
}

// room left for more (a fuel can only for fuel)
export function liquidRoom( stack ) {
	const l = liquidIn( stack );
	return l ? Math.max( 0, l.cap - l.litres ) : 0;
}

// every id a combo names (matchers and outputs), for validation
export function comboIds( c ) {
	const ids = [];
	const walk = ( m ) => {
		if ( ! m ) return;
		if ( typeof m === 'string' ) { ids.push( m ); return; }
		if ( Array.isArray( m ) ) { m.forEach( walk ); return; }
		if ( m.id !== undefined ) ids.push( ...[].concat( m.id ) );
		if ( m.ids ) ids.push( ...m.ids );
		( m.any || [] ).forEach( walk );
		walk( m.not );
	};
	walk( c.a ); walk( c.b );
	for ( const [ id ] of c.out ) ids.push( id );
	return ids;
}

// ==================================================================================================================
// Base combos for the items that already exist; the domains add theirs from defs/ext/<domain>.js
// ==================================================================================================================

// devices that take AA batteries (a tool's `cell`, default 'aa'); chemlights and torches don't, phones charge
const NO_CELLS = new Set( [ 'chemlight', 'torch', 'phone' ] );
const takesCells = ( d ) => !! d.tool?.battery && ! NO_CELLS.has( d.tool.kind ) && ( d.tool.cell ?? 'aa' ) === 'aa';
const lowCharge = ( s, d ) => ( s.data.charge ?? 0 ) < d.tool.battery * 0.95;
// a bottle of spirits (strong and several shots), not beer or wine
const spirit = ( s, d ) => ( d.drink?.alcohol || 0 ) >= 0.25 && ( d.drink?.portions || 1 ) >= 3;
// clothes that cut into rags (the same rule as "Rip into rags" in ItemUse)
const NO_RAGS = /wetsuit|hazmat|rain_|leather|down_jacket|firefighter|ghillie|police_vest|plate|stab|rig|life_jacket|vest|helmet|hard_hat/;
const ragCloth = ( s, d ) => {
	if ( d.cat !== 'clothing' ) return false;
	if ( [ 'bandana', 'bandana_blue', 'balaclava' ].includes( d.id ) ) return true;
	const c = d.clothing;
	return ( c.slot === 'torso' || c.slot === 'legs' ) && ! NO_RAGS.test( d.id ) && ! c.armor?.bullet && ( c.armor?.bite || 0 ) < 0.3;
};
const ragsFrom = ( s, d ) => Math.max( 1, Math.min( 6, Math.round( d.size * 1.2 * ( 0.4 + 0.6 * s.cond ) ) ) );
const fullish = ( s, d ) => ( s.data.left ?? d.drink.portions ) >= d.drink.portions - 1;
// on you (a lit torch on the ground would neither shine nor burn down: carried lights are the ones drawn)
const carried = ( c, s ) => { const w = c.use?.where?.( s ); return ! w || w.kind === 'inv' || w.kind === 'equip' || w.kind === 'weapon'; };
// what bashes a can open when there is no opener or knife: a hammer, an axe, a crowbar, a club, a stone (it spills)
const basher = ( s, d ) => d.id === 'stone' || ( !! d.melee && ( d.melee.kind === 'blunt' || d.melee.kind === 'axe' || !! d.melee.tools?.some( t => t === 'chop' || t === 'hammer' || t === 'pry' || t === 'break' ) ) );

addCombos( [
	// ---- power ----
	{ id: 'insert_batteries', verb: 'Insert', label: 'Insert into {b}', a: 'batteries', b: { fn: ( s, d ) => takesCells( d ) && lowCharge( s, d ) },
		use: { a: 1, b: 0 }, time: 3, sound: 'click', skill: 'electrical', xp: 2,
		run: ( c ) => { c.b.data.charge = c.B.tool.battery; } },
	{ id: 'solar_charge', verb: 'Charge', a: 'solar_charger', b: { fn: ( s, d ) => d.tool?.rechargeable && lowCharge( s, d ) },
		use: { a: 0, b: 0 }, time: 15, skill: 'electrical', xp: 2,
		check: ( c ) => ( c.game.world?.sky?.sunDir?.y ?? 1 ) < 0.12 || c.game.world?.isIndoors?.( c.player.pos ) ? 'Needs sunlight' : null,
		run: ( c ) => {
			const cap = c.B.tool.battery, sun = Math.min( 1, 1.25 - ( c.game.weather?.cover ?? 0.3 ) );
			c.b.data.charge = Math.min( cap, ( c.b.data.charge || 0 ) + cap * 0.35 * sun );
			c.toast( `${c.B.name} ${Math.round( c.b.data.charge / cap * 100 )}%`, 'good' );
		} },

	// ---- repairs ----
	{ id: 'tape_clothing', verb: 'Patch', a: { tool: 'tape' }, b: { cat: [ 'clothing', 'backpack' ] }, use: { a: 1, b: 0 },
		repair: { b: 0.2, max: 0.85 }, time: 5, sound: 'tear', skill: 'tailoring' },
	{ id: 'sew_clothing', verb: 'Repair', a: { tool: 'sewing' }, b: { cat: [ 'clothing', 'backpack' ] }, use: { a: 1, b: 0 },
		repair: { b: 0.35, max: 1 }, time: 9, sound: 'zipper', skill: 'tailoring' },
	{ id: 'tape_weapon', verb: 'Tape up', a: { tool: 'tape' }, b: { any: [ { cat: 'melee' }, { tool: 'fishingrod' } ] }, use: { a: 1, b: 0 },
		repair: { b: 0.25, max: 0.8 }, time: 5, sound: 'tear', skill: 'maintenance' },
	{ id: 'clean_firearm', verb: 'Clean', a: { tool: 'cleaning' }, b: { cat: 'firearm' }, use: { a: 1, b: 0 },
		repair: { b: 0.3, max: 1 }, time: 8, sound: 'craft', skill: 'maintenance' },
	// a river stone puts an edge back on, not a good one
	{ id: 'sharpen_stone', verb: 'Sharpen', a: 'stone', b: { cat: 'melee', fn: ( s, d ) => d.melee.kind === 'blade' || d.melee.kind === 'axe' },
		use: { a: 0, b: 0 }, repair: { b: 0.12, max: 0.7 }, time: 6, sound: 'hit_metal', skill: 'maintenance' },

	// ---- first aid ----
	{ id: 'disinfect_rag', verb: 'Disinfect', a: { any: [ { fn: spirit }, { ids: [ 'antiseptic', 'iodine', 'alcohol_wipes' ] } ] }, b: 'bandage_rag',
		out: [ 'bandage', 1 ], time: 4, sound: 'pour', skill: 'first_aid', xp: 3 },
	{ id: 'boil_rags', verb: 'Boil', label: 'Boil {a}', a: 'bandage_rag', b: { id: 'cooking_pot', liquid: [ 'water', 'dirty', 'sea' ], min: 0.3 },
		use: { a: 'all', b: 0 }, liquid: { side: 'b', kind: 'any', litres: 0.2 }, station: 'fire', time: 10, sound: 'sizzle', skill: 'first_aid', xp: 3,
		run: ( c ) => c.give( 'bandage', c.used.a ) },
	{ id: 'make_splint', verb: 'Make splint', label: 'Make splint', a: 'rags', b: 'stick', use: { a: 2, b: 2 },
		out: [ 'splint_improvised', 1 ], time: 8, sound: 'bandage', skill: 'first_aid' },

	// ---- liquids ----
	// pour one container into another: water into the pot, gasoline into a glass bottle
	{ id: 'pour', verb: 'Pour', label: 'Pour into {b}', a: { liquid: 'any' }, b: { fn: ( s ) => liquidRoom( s ) > 0.01 }, use: { a: 0, b: 0 },
		time: ( c ) => Math.min( 6, 1 + Math.min( liquidIn( c.a ).litres, liquidRoom( c.b ) ) * 0.8 ), sound: 'pour',
		// liquids don't mix: not offered (soft), so menus don't fill with every bottle you carry
		check: ( c ) => {
			const la = liquidIn( c.a ), lb = liquidIn( c.b );
			if ( lb.fuel && la.kind !== lb.kind ) return { reason: 'Fuel only', soft: true };
			if ( lb.kind && lb.kind !== la.kind ) return { reason: 'Holds something else', soft: true };
			return null;
		},
		run: ( c ) => c.pour( c.a, c.b ) },
	{ id: 'purify_water', verb: 'Purify', a: { fn: ( s, d ) => d.medical?.purify > 0 }, b: { liquid: 'dirty' }, use: { a: 0, b: 0 }, time: 4, sound: 'pills', skill: 'survival', xp: 2,
		check: ( c ) => unitsHave( c, c.a ) < purifyDoses( c ) ? `Need ${purifyDoses( c )} ${c.A.medical.uses ? 'doses' : 'tablets'}` : null,
		run: ( c ) => { c.consume( c.a, purifyDoses( c ) ); c.b.data.liquid = 'water'; c.toast( 'Water purified', 'good' ); } },
	{ id: 'mix_electrolytes', verb: 'Mix into', label: 'Mix into {b}', a: 'electrolyte_mix', b: { id: 'water_bottle', liquid: 'water', min: 0.45 },
		use: { a: 1, b: 0 }, time: 2, sound: 'pour', run: ( c ) => c.replace( c.b, 'sports_drink', {} ) },

	// ---- fire and light ----
	{ id: 'light_torch', verb: 'Light', a: { tool: [ 'lighter', 'matches' ] }, b: { fn: ( s, d ) => d.tool?.kind === 'torch' && ! s.data.on },
		use: { a: 1, b: 0 }, time: 2, sound: 'strike', check: ( c ) => carried( c, c.b ) ? null : 'Pick it up first',
		run: ( c ) => { c.b.data.on = true; if ( ! ( c.b.data.charge > 0 ) ) c.b.data.charge = c.B.tool.battery; } },
	{ id: 'make_torch', verb: 'Make torch', label: 'Make torch', a: 'rags', b: 'stick', use: { a: 2, b: 1 }, liquid: { kind: 'fuel', litres: 0.1 },
		out: [ 'torch', 1 ], time: 5, sound: 'tear', skill: 'survival' },
	{ id: 'fire_kit_paper', verb: 'Make fire kit', label: 'Make fire kit', a: 'newspaper', b: 'stick', use: { a: 1, b: 4 },
		out: [ 'campfire_kit', 1 ], time: 6, sound: 'hit_wood', skill: 'survival' },
	{ id: 'fire_kit_rags', verb: 'Make fire kit', label: 'Make fire kit', a: 'rags', b: 'stick', use: { a: 1, b: 4 },
		out: [ 'campfire_kit', 1 ], time: 6, sound: 'hit_wood', skill: 'survival' },

	// ---- molotovs: gasoline poured into a glass bottle and a rag stuffed in, or the quick way from a can you carry,
	// or a bottle of strong liquor ----
	{ id: 'molotov_rag', verb: 'Stuff rag', label: 'Make molotov', a: 'rags', b: { id: 'empty_bottle', liquid: 'fuel', min: 0.3 },
		out: [ 'molotov', 1 ], time: 4, sound: 'tear' },
	{ id: 'molotov_fill', verb: 'Make molotov', label: 'Make molotov', a: 'rags', b: { id: 'empty_bottle', fn: ( s ) => ! liquidIn( s ).kind },
		liquid: { kind: 'fuel', litres: 0.5 }, out: [ 'molotov', 1 ], time: 6, sound: 'pour' },
	{ id: 'molotov_spirit', verb: 'Make molotov', label: 'Make molotov', a: 'rags', b: { fn: spirit }, use: { a: 1, b: { qty: 1 } },
		check: ( c ) => fullish( c.b, c.B ) ? null : 'Bottle too empty', out: [ 'molotov', 1 ], time: 5, sound: 'tear' },

	// ---- blades ----
	{ id: 'cut_rags', verb: 'Cut up', a: { tool: 'cut' }, b: { fn: ragCloth }, use: { a: 0, b: 1 }, wear: { a: 0.005 }, time: 3, sound: 'tear', skill: 'tailoring',
		run: ( c ) => c.give( 'rags', ragsFrom( c.b, c.B ) ) },
	{ id: 'crack_coconut', verb: 'Crack', a: { any: [ { tool: [ 'cut', 'chop' ] }, 'stone' ] }, b: { fn: ( s, d ) => !! d.opensTo }, use: { a: 0, b: 0 },
		wear: { a: 0.005 }, time: 3.5, sound: 'hit_wood', run: ( c ) => c.replace( c.b, c.B.opensTo, { age: 0 } ) },
	{ id: 'open_can', verb: 'Open', a: { tool: [ 'canopener', 'open_can' ] }, b: { fn: ( s, d ) => d.food?.opener === true && ! s.data.open }, use: { a: 0, b: 0 },
		time: ( c ) => provides( c.a, 'canopener' ) ? 3 : 5, sound: 'can_open',
		run: ( c ) => {
			const one = c.use?.splitOne ? c.use.splitOne( c.b ) : c.b;
			one.data.open = true;
			// a knife slips: some of it is lost (an opener is clean)
			if ( ! provides( c.a, 'canopener' ) ) { one.data.spill = 0.1; c.a.cond = Math.max( 0.02, c.a.cond - 0.01 ); c.toast( 'Spilled some', 'info' ); }
		} },
	// no opener or knife: bash it open, and lose some (a stone more)
	{ id: 'bash_can', verb: 'Bash open', a: { fn: basher, not: { tool: [ 'canopener', 'open_can' ] } }, b: { fn: ( s, d ) => d.food?.opener === true && ! s.data.open },
		use: { a: 0, b: 0 }, time: ( c ) => c.a.id === 'stone' ? 6 : 5, sound: 'hit_metal',
		run: ( c ) => {
			const one = c.use?.splitOne ? c.use.splitOne( c.b ) : c.b;
			one.data.open = true;
			one.data.spill = c.a.id === 'stone' ? 0.3 : 0.25;
			if ( c.a.id !== 'stone' ) c.a.cond = Math.max( 0.02, c.a.cond - 0.02 );
			c.toast( 'Spilled some', 'info' );
		} },
	{ id: 'cut_open', verb: 'Cut open', a: { tool: 'cut' }, b: { fn: ( s, d ) => d.food?.opener === 'cut' && ! d.opensTo && ! s.data.open }, use: { a: 0, b: 0 },
		wear: { a: 0.005 }, time: 4, sound: 'tear', run: ( c ) => { const one = c.use?.splitOne ? c.use.splitOne( c.b ) : c.b; one.data.open = true; } },
	{ id: 'fish_bait', verb: 'Cut bait', label: 'Cut {b} into bait', a: { tool: 'cut' }, b: { ids: [ 'raw_fish', 'raw_tako' ] }, use: { a: 0, b: 1 }, wear: { a: 0.005 },
		out: [ 'fishing_bait', 4 ], time: 5, sound: 'tear', skill: 'fishing' },

	// ---- weapons and tools ----
	{ id: 'nail_bat', verb: 'Nail', label: 'Make nailed bat', a: 'nails', b: 'baseball_bat', use: { a: 12, b: 1 }, tools: [ 'hammer' ],
		out: [ 'nailed_bat', 1 ], time: 12, sound: 'hit_wood', skill: 'carpentry', noise: { radius: 25 },
		run: ( c ) => { if ( c.made[ 0 ] ) c.made[ 0 ].cond = c.b.cond; } },
	{ id: 'make_arrows', verb: 'Fletch', label: 'Make arrows', a: 'feathers', b: 'stick', use: { a: 4, b: 2 }, tools: [ 'cut' ],
		out: [ 'arrow', 4 ], time: 15, sound: 'tear', skill: 'survival' },
	{ id: 'make_spear', verb: 'Make spear', label: 'Make fishing spear', a: 'wire', b: 'long_stick', tools: [ 'cut' ],
		out: [ 'fishing_spear', 1 ], time: 12, sound: 'craft', skill: 'survival' },
	{ id: 'make_rod', verb: 'Make rod', label: 'Make fishing rod', a: 'wire', b: 'long_stick', tools: [ 'cut' ],
		out: [ 'fishing_rod_improvised', 1 ], time: 12, sound: 'craft', skill: 'fishing' },
	{ id: 'make_lockpick', verb: 'Bend', label: 'Make lockpick', a: { tool: [ 'pliers', 'cut' ] }, b: 'wire', use: { a: 0, b: 1 }, wear: { a: 0.01 },
		out: [ 'lockpick', 1 ], time: 20, sound: 'craft', skill: 'mechanics' },

	// ---- food ----
	{ id: 'pound_poi', verb: 'Pound poi', label: 'Pound poi', a: { liquid: 'water', min: 0.25 }, b: 'cooked_taro', use: { a: 0, b: 1 },
		liquid: { side: 'a', kind: 'water', litres: 0.25 }, out: [ 'poi', 1 ], time: 14, sound: 'hit_wood', skill: 'cooking' },
] );

// units of a stack to hand, counted as game.combine uses them up: plain units also from other carried stacks of the id
function unitsHave( c, s ) {
	const k = unitKind( getItem( s.id ) );
	let n = unitsIn( s, k );
	if ( k === 'qty' ) for ( const o of c.inv.findAll( ( x ) => x !== s && x.id === s.id ) ) n += o.qty;
	return n;
}

// doses of a purifier the dirty water in a container needs (one dose cleans `medical.purify` litres)
function purifyDoses( c ) {
	return Math.max( 1, Math.ceil( ( liquidIn( c.b )?.litres || 0 ) / ( c.A.medical.purify || 1 ) ) );
}
