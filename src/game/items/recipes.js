// Crafting recipes (pure data, importable in Node for validation).
//   { id, name, out: [ id, qty ], in: [ [ id, qty ]… ], tools: [ kinds ], time (s), station?: 'fire' }
// Extras understood by game.crafting:
//   liquid: { kind: 'water'|'fuel', litres }   drawn from any water container / fuel can you carry
//   special: 'boil'                              boils the dirty or salty water in your containers at a fire
//   keep: [ ids ]                                ingredients that are not used up (a pot used to cook in)
//   cat: 'medical'|'tools'|'weapons'|'food'|'survival'   grouping for the UI
// `tools` are kinds matched by Inventory.hasTool: a tool's `tool.kind` or a melee weapon's `melee.tools`
// ('cut' = any knife or machete, 'chop', 'hammer', 'saw', 'pot', 'toolbox', 'canopener'…).
import { ITEMS } from './ItemDB.js';

const R = ( id, name, out, inputs, o = {} ) => ( { id, name, out, in: inputs, tools: o.tools || [], time: o.time ?? 6, station: o.station, liquid: o.liquid, special: o.special, keep: o.keep, cat: o.cat || 'survival' } );

const BASE = [
	// ---- medical ----
	R( 'rag_bandage', 'Rag bandage', [ 'bandage_rag', 1 ], [ [ 'rags', 2 ] ], { time: 4, cat: 'medical' } ),
	R( 'splint', 'Improvised splint', [ 'splint_improvised', 1 ], [ [ 'stick', 2 ], [ 'rags', 2 ] ], { time: 8, cat: 'medical' } ),
	R( 'rags_tshirt', 'Rags from a t-shirt', [ 'rags', 4 ], [ [ 'tshirt', 1 ] ], { time: 4, cat: 'medical' } ),

	// ---- fire and light ----
	R( 'campfire_kit', 'Fire kit', [ 'campfire_kit', 1 ], [ [ 'stick', 4 ], [ 'newspaper', 1 ] ], { time: 6, cat: 'survival' } ),
	R( 'campfire_kit_rags', 'Fire kit (rag tinder)', [ 'campfire_kit', 1 ], [ [ 'stick', 4 ], [ 'rags', 1 ] ], { time: 6, cat: 'survival' } ),
	R( 'torch', 'Torch', [ 'torch', 1 ], [ [ 'stick', 1 ], [ 'rags', 2 ] ], { time: 5, liquid: { kind: 'fuel', litres: 0.1 }, cat: 'survival' } ),
	R( 'torch_oil', 'Torches (cooking oil)', [ 'torch', 3 ], [ [ 'stick', 3 ], [ 'rags', 3 ], [ 'cooking_oil', 1 ] ], { time: 10, cat: 'survival' } ),
	R( 'firewood', 'Firewood', [ 'firewood', 2 ], [ [ 'long_stick', 1 ] ], { tools: [ 'saw' ], time: 8, cat: 'survival' } ),
	R( 'firewood_axe', 'Firewood (chopped)', [ 'firewood', 2 ], [ [ 'long_stick', 1 ] ], { tools: [ 'chop' ], time: 6, cat: 'survival' } ),

	// ---- tools ----
	R( 'fishing_rod', 'Improvised fishing rod', [ 'fishing_rod_improvised', 1 ], [ [ 'long_stick', 1 ], [ 'wire', 1 ] ], { tools: [ 'cut' ], time: 12, cat: 'tools' } ),
	R( 'fishing_bait', 'Fish bait', [ 'fishing_bait', 4 ], [ [ 'raw_fish', 1 ] ], { tools: [ 'cut' ], time: 5, cat: 'tools' } ),
	R( 'lockpick', 'Lockpick', [ 'lockpick', 1 ], [ [ 'wire', 1 ] ], { tools: [ 'cut' ], time: 20, cat: 'tools' } ),
	R( 'repair_kit', 'Vehicle repair kit', [ 'repair_kit', 1 ], [ [ 'duct_tape', 1 ], [ 'scrap_metal', 2 ], [ 'wire', 1 ] ], { tools: [ 'toolbox' ], time: 20, cat: 'tools' } ),
	R( 'backpack', 'Improvised sack', [ 'backpack_improvised', 1 ], [ [ 'tarp', 1 ], [ 'rope', 1 ] ], { time: 15, cat: 'tools' } ),

	// ---- weapons ----
	R( 'spear', 'Pole spear', [ 'fishing_spear', 1 ], [ [ 'long_stick', 1 ], [ 'wire', 1 ] ], { tools: [ 'cut' ], time: 12, cat: 'weapons' } ),
	R( 'arrows', 'Wooden arrows', [ 'arrow', 4 ], [ [ 'stick', 2 ], [ 'feathers', 4 ] ], { tools: [ 'cut' ], time: 15, cat: 'weapons' } ),
	R( 'nailed_bat', 'Nailed bat', [ 'nailed_bat', 1 ], [ [ 'baseball_bat', 1 ], [ 'nails', 12 ] ], { tools: [ 'hammer' ], time: 12, cat: 'weapons' } ),
	R( 'molotov', 'Molotov cocktail', [ 'molotov', 1 ], [ [ 'empty_bottle', 1 ], [ 'rags', 1 ] ], { liquid: { kind: 'fuel', litres: 0.5 }, time: 6, cat: 'weapons' } ),
	R( 'molotov_rum', 'Molotov cocktail (rum)', [ 'molotov', 1 ], [ [ 'rum', 1 ], [ 'rags', 1 ] ], { time: 5, cat: 'weapons' } ),
	R( 'molotov_okolehao', 'Molotov cocktail (ʻōkolehao)', [ 'molotov', 1 ], [ [ 'okolehao', 1 ], [ 'rags', 1 ] ], { time: 5, cat: 'weapons' } ),

	// ---- at a fire ----
	R( 'boil_water', 'Boil water', [ 'cooking_pot', 0 ], [], { special: 'boil', station: 'fire', time: 12, cat: 'food' } ),
	R( 'cook_rice', 'Cook rice', [ 'cooked_rice', 5 ], [ [ 'rice_bag', 1 ] ], { tools: [ 'pot' ], liquid: { kind: 'water', litres: 1 }, station: 'fire', time: 20, cat: 'food' } ),
	R( 'cook_egg', 'Boil an egg', [ 'cooked_egg', 1 ], [ [ 'eggs', 1 ] ], { tools: [ 'pot' ], liquid: { kind: 'water', litres: 0.2 }, station: 'fire', time: 8, cat: 'food' } ),
	R( 'poi', 'Pound poi', [ 'poi', 1 ], [ [ 'cooked_taro', 1 ] ], { liquid: { kind: 'water', litres: 0.25 }, time: 14, cat: 'food' } ),
];

// every raw food with a cooked form roasts at a fire (the pot-cooked ones above are skipped)
function cookingRecipes() {
	const out = [];
	const special = new Set( [ 'rice_bag', 'eggs' ] );
	for ( const d of ITEMS.values() ) {
		if ( d.cat !== 'food' || ! d.food?.cooked || special.has( d.id ) ) continue;
		const heavy = d.weight > 1;
		out.push( R( 'cook_' + d.id, 'Cook ' + ( ITEMS.get( d.food.cooked )?.name || d.food.cooked ).replace( /^Cooked /, '' ).replace( /^(Roasted|Steamed|Baked|Boiled) /, '' ),
			[ d.food.cooked, 1 ], [ [ d.id, 1 ] ], { station: 'fire', time: heavy ? 18 : 12, cat: 'food' } ) );
	}
	return out;
}

// the full list; built on demand so every def module has registered first
export function allRecipes() {
	return [ ...BASE, ...cookingRecipes() ];
}
