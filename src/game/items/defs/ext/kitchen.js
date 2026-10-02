// Kitchen (docs/ITEMS_PLAN.md "kitchen"): the Hawaiian pantry, condiments, produce, plate-lunch food, coffee and tea,
// cocktails and local beers, cookware, and the cooking that ties them together:
//   evolved dishes (ext/kitchen/evolved.js): a pot of water, an oiled wok or pan, a bowl, a slice of bread or a bowl of
//     rice takes ingredients one at a time and becomes "Stew (taro, Spam, onion)" or a dish it knows ("Spam fried
//     rice"); pots and pans cook at a fire ("Cook"), and eating applies what went in (the eat hook below);
//   mixes (combos): cocktails, coffee from the bean, tea, cocoa, ʻawa, poke, li hing fruit, shave ice, haupia, kulolo,
//     butter mochi, malasadas, lilikoʻi butter, ʻinamona from kukui nuts, mac salad, chili pepper water, pickles in a
//     jar, salted and smoked meat and fish, bait from rot;
//   recipes (the crafting panel): Spam musubi (more with a mold), lomi salmon, laulau, plate lunch;
//   ice (ext/kitchen/cold.js): a bag of ice or a frozen freezer pack slows the food beside it and melts meanwhile;
//   the imu (ext/kitchen/imu.js): an earth oven a shovel digs, fired with stones, that slow-cooks a feast;
//   verbs: Cook, Empty out, Boil down to salt, Pick ʻopihi (a blade at a rocky shore), Pack in snow and Make snow
//     cone (the summits of Mauna Kea and Mauna Loa), Dig imu (a shovel), Cook rice (a rice cooker).
// Tool kinds this domain owns: pan (a wok; the frying pan counts too), bowl, grater, 'musubi mold', plus grinder
// (provides grind).
import { defineItems, getItem, makeStack, freshness } from '../../ItemDB.js';
import { extendLoot } from '../../Loot.js';
import { addRecipes, R } from '../../recipes.js';
import { addCombos, liquidIn, getCombo } from '../../combos.js';
import { addUseActions, addEatHook } from '../../hooks.js';
import { provides } from '../../util.js';
import { BASES, SEASON, DISH_BASE, isDish, isRawDish, ingredient, fits, refuse, unitOf, addTo, startDish, dishData, dishName, cookDish, eatDish, contribution, recognise } from '../../ext/kitchen/evolved.js';
import { coldLeft, freeze } from '../../ext/kitchen/cold.js';
import '../../ext/kitchen/imu.js';
// the outdoor sites' tables (site_<kind>) are defined there; imported first so they can be extended here
import '../../sites/tables.js';

// ---- helpers ----------------------------------------------------------------------------------------------------------

const E = ( k, n, o = {} ) => ( { k, n, ...o } );
function food( id, name, o ) {
	const d = {
		id, name, cat: 'food', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'food', ...( o.tags || [] ) ], model: o.model,
		food: {
			kcal: o.kcal ?? 1, water: o.water ?? 0, spoil: o.spoil ?? 0, opener: o.opener ?? false, raw: !! o.raw,
			sick: o.sick ?? 0, cooked: o.cooked || null, portions: o.portions ?? 1,
		},
	};
	for ( const k of [ 'fun', 'evolved', 'chill' ] ) if ( o[ k ] ) d[ k ] = o[ k ];
	if ( o.ev ) d.evolved = o.ev;
	return d;
}
function drink( id, name, o ) {
	const d = {
		id, name, cat: 'drink', desc: o.desc || '', weight: o.w ?? 0.4, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'drink', ...( o.tags || [] ) ], model: o.model,
		drink: {
			water: o.water ?? 20, kcal: o.kcal ?? 0, alcohol: o.alcohol ?? 0, caffeine: o.caffeine ?? 0,
			container: o.container || null, sick: o.sick ?? 0, portions: o.portions ?? 1,
		},
	};
	for ( const k of [ 'fun', 'chill' ] ) if ( o[ k ] ) d[ k ] = o[ k ];
	return d;
}
function tool( id, name, kind, o ) {
	const t = { kind };
	for ( const k of [ 'liquid', 'provides', 'uses', 'metal' ] ) if ( o[ k ] !== undefined ) t[ k ] = o[ k ];
	const d = {
		id, name, cat: 'tool', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'tool', ...( o.tags || [] ) ], model: o.model, tool: t,
	};
	if ( o.chill ) d.chill = o.chill;
	return d;
}
const mat = ( id, name, o ) => ( { id, name, cat: 'material', desc: o.desc || '', weight: o.w ?? 0.2, size: o.size ?? 1, stack: o.stack ?? 1,
	rarity: o.rarity || 'common', tags: [ 'material', ...( o.tags || [] ) ], model: o.model } );

// printed labels (the food.js form): brand line, product line, colours, a glyph, a style
const L = ( text, sub, bg, fg, band, glyph, style = 'band', extra = {} ) => ( { text, sub, bg, fg, band, glyph, style, ...extra } );
const can = ( label, o = {} ) => ( { type: 'can', label, ...o } );
const soda = ( label, o = {} ) => ( { type: 'can', style: 'soda', r: 0.033, h: 0.122, rep: 1, label, ...o } );
const bag = ( size, label, o = {} ) => ( { type: 'bag', size, label, ...o } );
const box = ( size, label, o = {} ) => ( { type: 'box', size, label, ...o } );
const bottle = ( o ) => ( { type: 'bottle', ...o } );
const jar = ( o ) => ( { type: 'jar', ...o } );
const P = ( kind, o = {} ) => ( { type: 'kitchen_produce', kind, ...o } );
const F = ( kind, o = {} ) => ( { type: 'kitchen_food', kind, ...o } );
const W = ( kind, o = {} ) => ( { type: 'kitchen_ware', kind, ...o } );
const DISH = ( kind, o = {} ) => ( { type: 'kitchen_dish', kind, ...o } );
const MUG = ( o = {} ) => ( { type: 'kitchen_mug', ...o } );
const GLASS = ( kind ) => ( { type: 'kitchen_cocktail', kind } );

// a hot meal, a treat, a good drink: the mood lift when it's all eaten (applyFun splits it per portion)
const FUN = {
	treat: { unhappy: - 12, boredom: - 6 },
	meal: { unhappy: - 10, boredom: - 4 },
	feast: { unhappy: - 16, boredom: - 6, stress: - 4 },
	hot: { unhappy: - 6, stress: - 3 },
	cocktail: { unhappy: - 14, stress: - 6, boredom: - 6 },
};

defineItems( [
	// ================= condiments and pantry =================
	food( 'shoyu', 'Shoyu', { w: 0.6, kcal: 80, portions: 10, tags: [ 'kitchen', 'spice', 'local' ], ev: E( 'sauce', 'shoyu' ),
		model: bottle( { style: 'syrup', h: 0.24, r: 0.035, glass: 0x2a140a, cap: 0xc0282a,
			label: L( 'ʻĀINA SHOYU', 'Naturally brewed', 0xf2f2ee, 0xc0282a, 0xc0282a, 'leaf', 'band', { glyphColor: 0x2a6a2a, size: 0.26 } ), labelY: 0.24, labelH: 0.3 } ),
		desc: 'Seasoning. Makes poke.' } ),
	food( 'furikake', 'Furikake', { w: 0.06, size: 0.5, kcal: 160, portions: 8, tags: [ 'kitchen', 'spice', 'local' ], ev: E( 'spice', 'furikake' ),
		model: jar( { r: 0.024, h: 0.085, clear: true, content: 0x2e3a1c, lid: 0xc0282a, label: L( 'FURIKAKE', 'Nori komi', 0xf2e6c8, 0x1a1a1a, 0xc0282a, null, 'band', { size: 0.34 } ) } ),
		desc: 'Seasoning. Sprinkle on rice.' } ),
	food( 'li_hing_powder', 'Li hing powder', { w: 0.05, size: 0.5, kcal: 40, portions: 8, rarity: 'uncommon', tags: [ 'kitchen', 'spice', 'local' ], ev: E( 'spice', 'li hing' ),
		model: jar( { r: 0.026, h: 0.072, clear: true, content: 0xc0283a, lid: 0xf2f2f2, label: L( 'LI HING', 'Plum powder', 0xf2d21a, 0xc0282a, 0xc0282a, 'dot', 'band', { glyphColor: 0xc0282a, size: 0.34 } ) } ),
		desc: 'Dust onto fruit.' } ),
	food( 'chili_pepper_water', 'Chili pepper water', { w: 0.35, kcal: 10, portions: 8, rarity: 'uncommon', tags: [ 'kitchen', 'spice', 'local' ], ev: E( 'sauce', 'chili water' ),
		fun: { stress: - 2 }, model: { type: 'kitchen_cpw' }, desc: 'Hot seasoning.' } ),
	food( 'alaea_salt', 'ʻAlaea salt', { w: 0.25, size: 0.5, kcal: 2, portions: 10, tags: [ 'kitchen', 'salt', 'local' ], ev: E( 'salt', 'ʻalaea salt' ),
		model: bag( [ 0.1, 0.14, 0.04 ], L( 'ʻALAEA', 'Hawaiian red salt', 0x8a2a1a, 0xf2e6c8, 0xf2e6c8, 'mountain', 'badge', { band: 0xc0603a, textColor: 0xffffff, glyphColor: 0x5a1a0a } ), { matte: true } ),
		desc: 'Salts meat and fish. Seasoning.' } ),
	food( 'sea_salt', 'Sea salt', { w: 0.1, size: 0.5, kcal: 2, portions: 10, tags: [ 'kitchen', 'salt', 'crafted' ], ev: E( 'salt', 'sea salt' ),
		model: bag( [ 0.1, 0.13, 0.035 ], L( 'SEA SALT', 'Boiled down', 0xe8e0cc, 0x3a3a3a, 0x9ab0b8, 'wave', 'plain', { glyphColor: 0x6a8a9a, size: 0.26 } ), { matte: true, crimp: false } ),
		desc: 'Salts meat and fish. Seasoning.' } ),
	food( 'sugar', 'Sugar', { w: 1.8, size: 2, kcal: 3800, portions: 10, tags: [ 'kitchen', 'sugar' ], ev: E( 'sugar', 'sugar' ),
		model: bag( [ 0.15, 0.24, 0.08 ], L( 'PUʻUNĒNĒ', 'Pure cane sugar · 4 lb', 0xf4f2ea, 0x1a4a8a, 0xc0282a, 'sun', 'band', { glyphColor: 0xe8b020, size: 0.26 } ), { matte: true, crimp: false } ),
		desc: 'Sweetens coffee. Baking.' } ),
	food( 'flour', 'Flour', { w: 2.2, size: 2, kcal: 3600, portions: 8, tags: [ 'kitchen' ], ev: E( 'flour', 'flour', { p: true } ),
		model: bag( [ 0.16, 0.26, 0.09 ], L( 'ALL PURPOSE', 'Enriched flour · 5 lb', 0xf2ead8, 0x5a3a1a, 0x2a6ab8, 'bar', 'band', { glyphColor: 0xd8a020, size: 0.24 } ), { matte: true, crimp: false } ),
		desc: 'Thickens stew. Baking.' } ),
	food( 'mochiko', 'Mochiko', { w: 0.45, kcal: 1600, portions: 4, rarity: 'uncommon', tags: [ 'kitchen', 'local' ], ev: E( 'flour', 'mochiko', { p: true } ),
		model: box( [ 0.12, 0.17, 0.05 ], L( 'MOCHIKO', 'Sweet rice flour', 0xf2f2ee, 0x2a4a8a, 0x2a4a8a, 'flower', 'split', { accent: 0xc0282a, textColor: 0x2a4a8a, glyphColor: 0xf2f2ee } ) ),
		desc: 'Makes butter mochi.' } ),
	food( 'guava_jam', 'Guava jam', { w: 0.4, kcal: 1100, portions: 6, rarity: 'uncommon', tags: [ 'kitchen', 'sugar', 'local' ], ev: E( 'sweet', 'guava jam', { p: true } ),
		model: jar( { r: 0.035, h: 0.09, clear: true, content: 0xd84a5a, lid: 0xe8c020, lidMetal: true, label: L( 'GUAVA JAM', 'Homestyle', 0xf6efe0, 0xd84a5a, 0x3a8a3a, 'fruit', 'band', { glyphColor: 0xe0607a, size: 0.3 } ) } ),
		desc: 'Spread. Sandwiches.' } ),
	food( 'mayo', 'Mayonnaise', { w: 0.85, kcal: 2800, portions: 8, tags: [ 'kitchen' ], ev: E( 'sauce', 'mayo' ),
		model: jar( { r: 0.045, h: 0.13, body: 0xf6f2e4, content: 0xf6f2e4, lid: 0x2a5ab8, label: L( 'MAYONNAISE', 'Real · 30 oz', 0xf2f2ee, 0x2a5ab8, 0xf2c21a, 'drop', 'band', { glyphColor: 0xf2c21a, size: 0.26 } ) } ),
		desc: 'Mac salad. Sandwiches.' } ),
	food( 'coconut_milk', 'Coconut milk', { w: 0.43, kcal: 450, water: 12, opener: true, tags: [ 'kitchen', 'canned', 'local' ], ev: E( 'liquid', 'coconut milk' ),
		model: can( L( 'COCONUT MILK', 'Unsweetened', 0xf6f4ec, 0x2a6a2a, 0x2a6a2a, 'palm', 'band', { glyphColor: 0x2a6a2a } ), { r: 0.037, h: 0.11 } ),
		desc: 'Haupia, kulolo, stews.' } ),
	food( 'rice_vinegar', 'Rice vinegar', { w: 0.4, kcal: 5, portions: 8, tags: [ 'kitchen', 'vinegar', 'glass' ], ev: E( 'sauce', 'vinegar' ),
		model: bottle( { style: 'syrup', h: 0.22, r: 0.032, clear: true, glass: 0xf2f0e8, liquid: 0xf0e4b8, liquidClear: true, fill: 0.82, cap: 0xd4a64a, capMetal: true,
			label: L( 'RICE VINEGAR', 'Pickling', 0xf2e6c8, 0x8a1a1a, 0x8a1a1a, 'leaf', 'band', { glyphColor: 0x3a7a3a, size: 0.26 } ), labelY: 0.22, labelH: 0.3 } ),
		desc: 'Pickling in a jar.' } ),

	// ================= produce and the sea =================
	food( 'luau_leaves', 'Lūʻau leaves', { w: 0.3, size: 2, stack: 4, kcal: 40, water: 6, spoil: 110, raw: true, sick: 0.5, tags: [ 'farm', 'market', 'vegetable', 'local' ],
		ev: E( 'leaf', 'lūʻau' ), model: P( 'luau' ), desc: 'Taro leaves. Toxic raw: cook well.' } ),
	mat( 'ti_leaves', 'Ti leaves', { w: 0.1, size: 1, stack: 8, tags: [ 'farm', 'market', 'herb', 'wild', 'local' ], model: P( 'ti' ),
		desc: 'Wraps laulau and imu food.' } ),
	food( 'ginger', 'Ginger root', { w: 0.1, size: 0.5, stack: 4, kcal: 10, spoil: 500, tags: [ 'farm', 'market', 'herb' ], ev: E( 'herb', 'ginger' ),
		model: P( 'ginger' ), desc: 'Seasoning. Tea.' } ),
	food( 'garlic', 'Garlic', { w: 0.05, size: 0.5, stack: 4, kcal: 15, spoil: 700, tags: [ 'farm', 'market', 'herb' ], ev: E( 'herb', 'garlic' ),
		model: P( 'garlic' ), desc: 'Seasoning.' } ),
	food( 'green_onion', 'Green onion', { w: 0.08, size: 0.5, stack: 3, kcal: 10, water: 1, spoil: 140, tags: [ 'farm', 'market', 'herb', 'vegetable' ], ev: E( 'herb', 'green onion' ),
		model: P( 'green_onion' ), desc: 'Seasoning.' } ),
	food( 'chili_peppers', 'Hawaiian chili peppers', { w: 0.03, size: 0.5, stack: 6, kcal: 5, spoil: 300, rarity: 'uncommon', tags: [ 'farm', 'market', 'spice', 'wild' ], ev: E( 'spice', 'chili' ),
		fun: { unhappy: 2 }, model: P( 'chili' ), desc: 'Very hot. Seasoning.' } ),
	food( 'limu', 'Limu', { w: 0.15, size: 1, stack: 4, kcal: 20, water: 4, spoil: 100, tags: [ 'market', 'vegetable', 'beach', 'local' ], ev: E( 'veg', 'limu', { g: 'limu' } ),
		model: P( 'limu' ), desc: 'Seaweed. Poke.' } ),
	food( 'nori', 'Nori', { w: 0.03, size: 0.5, stack: 4, kcal: 40, tags: [ 'kitchen', 'vegetable', 'local' ], ev: E( 'veg', 'nori' ),
		model: { type: 'bar', size: [ 0.2, 0.012, 0.19 ], label: L( 'NORI', 'Roasted seaweed · 10 sheets', 0x1a2a1a, 0xf2e6c8, 0xc0282a, 'leaf', 'plain', { glyphColor: 0x6a9a4a, size: 0.34 } ) },
		desc: 'Wraps Spam musubi.' } ),
	food( 'opihi', 'ʻOpihi', { w: 0.12, size: 0.5, stack: 6, kcal: 60, water: 3, spoil: 30, sick: 0.06, rarity: 'uncommon', tags: [ 'shell', 'beach', 'local' ], ev: E( 'shell', 'ʻopihi' ),
		fun: { unhappy: - 3 }, model: P( 'opihi' ), desc: 'Limpets. Eaten raw.' } ),
	food( 'raw_crab', 'Raw crab', { w: 0.7, size: 2, kcal: 260, water: 4, spoil: 30, raw: true, sick: 0.2, cooked: 'cooked_crab', rarity: 'uncommon', tags: [ 'shell', 'fishing' ],
		ev: E( 'shell', 'crab' ), model: { type: 'kitchen_crab' }, desc: 'Cook it at a fire.' } ),
	food( 'cooked_crab', 'Cooked crab', { w: 0.6, size: 2, kcal: 320, water: 2, spoil: 60, rarity: 'uncommon', tags: [ 'shell', 'cooked' ], ev: E( 'shell', 'crab' ),
		fun: { unhappy: - 6 }, model: { type: 'kitchen_crab', cooked: true } } ),
	food( 'portuguese_sausage', 'Portuguese sausage', { w: 0.45, size: 1, kcal: 1300, water: 2, spoil: 500, portions: 3, rarity: 'uncommon', tags: [ 'kitchen', 'meat', 'local' ],
		ev: E( 'meat', 'Portuguese sausage', { g: 'portuguese_sausage' } ), model: { type: 'kitchen_sausage' }, desc: 'Smoked. Fry with eggs.' } ),
	food( 'bread_loaf', 'Bread loaf', { w: 0.55, size: 3, kcal: 1400, spoil: 160, portions: 8, tags: [ 'kitchen', 'bakery' ], ev: E( 'bread', 'bread' ),
		model: { type: 'kitchen_loaf' }, desc: 'Sandwiches.' } ),
	food( 'tomato', 'Tomato', { w: 0.15, size: 0.5, stack: 4, kcal: 22, water: 6, spoil: 170, tags: [ 'farm', 'market', 'vegetable' ], ev: E( 'veg', 'tomato' ),
		model: { type: 'fruit', kind: 'tomato' } } ),
	food( 'cabbage', 'Cabbage', { w: 0.9, size: 2, kcal: 220, water: 20, spoil: 500, tags: [ 'farm', 'market', 'vegetable' ], ev: E( 'veg', 'cabbage' ),
		model: P( 'cabbage' ) } ),
	food( 'macaroni', 'Macaroni', { w: 0.45, size: 1, kcal: 1600, raw: true, sick: 0.05, tags: [ 'kitchen' ], ev: E( 'noodle', 'macaroni' ),
		model: box( [ 0.16, 0.22, 0.05 ], L( 'ELBOW MACARONI', 'Enriched pasta · 1 lb', 0x2a4a9a, 0xf2f2ee, 0xf2c21a, 'dot', 'split', { accent: 0xf2c21a, textColor: 0xffffff, glyphColor: 0xf2d860 } ) ),
		desc: 'Boil for mac salad.' } ),
	food( 'salted_salmon', 'Salted salmon', { w: 0.35, size: 1, kcal: 420, water: 0, spoil: 600, rarity: 'uncommon', tags: [ 'fish', 'market', 'local' ], ev: E( 'fish', 'salmon' ),
		model: F( 'salmon' ), desc: 'Makes lomi salmon.' } ),

	// ================= plate-lunch counter, made and found =================
	food( 'kalua_pig', 'Kalua pig', { w: 0.5, size: 2, kcal: 900, water: 2, spoil: 72, portions: 2, rarity: 'uncommon', tags: [ 'meat', 'cooked', 'local' ],
		ev: E( 'meat', 'kalua pig', { g: 'pork' } ), fun: FUN.feast, model: F( 'kalua' ), desc: 'Imu-cooked pork.' } ),
	food( 'laulau_raw', 'Uncooked laulau', { w: 0.45, size: 1, stack: 2, kcal: 500, spoil: 30, raw: true, sick: 0.4, cooked: 'laulau', tags: [ 'crafted' ],
		model: F( 'laulau' ), desc: 'Cook at a fire or in an imu.' } ),
	food( 'laulau', 'Laulau', { w: 0.4, size: 1, stack: 2, kcal: 600, water: 3, spoil: 72, tags: [ 'cooked', 'local' ], ev: E( 'meat', 'laulau' ),
		fun: FUN.meal, model: F( 'laulau', { cooked: true } ) } ),
	food( 'lomi_salmon', 'Lomi salmon', { w: 0.35, size: 1, kcal: 260, water: 12, spoil: 48, portions: 2, tags: [ 'local' ], ev: E( 'fish', 'lomi salmon' ),
		fun: { unhappy: - 6 }, model: F( 'lomi' ) } ),
	food( 'haupia', 'Haupia', { w: 0.4, size: 2, kcal: 700, water: 8, spoil: 96, portions: 4, rarity: 'uncommon', tags: [ 'bakery', 'church', 'local' ],
		fun: FUN.treat, model: F( 'squares', { color: 0xf6f3ea } ), desc: 'Coconut pudding.' } ),
	food( 'kulolo', 'Kulolo', { w: 0.5, size: 2, kcal: 1100, water: 4, spoil: 240, portions: 4, rarity: 'rare', tags: [ 'local' ],
		fun: FUN.treat, model: F( 'squares', { color: 0x7a4a2a, sheen: true } ), desc: 'Taro and coconut pudding.' } ),
	food( 'chocolate_haupia_pie', 'Chocolate haupia pie', { w: 0.9, size: 3, kcal: 2600, water: 6, spoil: 120, portions: 6, rarity: 'rare', tags: [ 'bakery', 'local' ],
		fun: { unhappy: - 36, boredom: - 12, stress: - 6 }, model: F( 'pie' ) } ),
	food( 'li_hing_gummies', 'Li hing gummies', { w: 0.15, size: 0.5, stack: 2, kcal: 420, portions: 2, tags: [ 'snack', 'convenience', 'local' ],
		fun: { unhappy: - 8, boredom: - 4 }, model: bag( [ 0.12, 0.17, 0.035 ], L( 'LI HING', 'Gummy bears', 0xc0282a, 0xf2d21a, 0xf2d21a, 'dot', 'badge', { band: 0xf2d21a, textColor: 0xc0282a, glyphColor: 0xe0402a } ) ) } ),
	food( 'li_hing_fruit', 'Li hing fruit', { w: 0.2, size: 1, spoil: 160, tags: [ 'crafted', 'local' ], ev: E( 'fruit', 'li hing fruit' ), model: F( 'lihing' ), desc: 'Fruit dusted with li hing.' } ),
	food( 'shave_ice', 'Shave ice', { w: 0.3, size: 1, kcal: 160, water: 25, tags: [ 'crafted', 'local' ], chill: { hours: 0.75, k: 1, melts: true },
		fun: { unhappy: - 16, boredom: - 6, stress: - 4 }, model: F( 'shave_ice' ), desc: 'Melts fast.' } ),
	food( 'mac_salad', 'Mac salad', { w: 0.4, size: 1, stack: 2, kcal: 700, water: 4, spoil: 72, portions: 2, tags: [ 'local' ],
		ev: E( 'noodle', 'mac salad' ), model: F( 'mac' ), desc: 'Plate-lunch side.' } ),
	food( 'salt_meat', 'Salted meat', { w: 0.6, size: 2, kcal: 800, water: 0, spoil: 1400, sick: 0.04, tags: [ 'meat', 'crafted' ], ev: E( 'meat', 'salt meat' ),
		fun: { unhappy: 2 }, model: F( 'salt_meat' ), desc: 'Keeps for weeks.' } ),
	food( 'salt_fish', 'Salted fish', { w: 0.4, size: 2, kcal: 420, water: 0, spoil: 1400, sick: 0.04, tags: [ 'fish', 'crafted' ], ev: E( 'fish', 'salt fish' ),
		fun: { unhappy: 2 }, model: F( 'salt_fish' ), desc: 'Keeps for weeks.' } ),
	food( 'smoked_meat', 'Smoked meat', { w: 0.6, size: 2, kcal: 900, water: 0, spoil: 600, tags: [ 'meat', 'crafted' ], ev: E( 'meat', 'smoked meat', { g: 'pork' } ),
		fun: { unhappy: - 6 }, model: F( 'smoked_meat' ), desc: 'Keeps for days.' } ),
	food( 'smoked_fish', 'Smoked fish', { w: 0.4, size: 2, kcal: 500, water: 0, spoil: 600, tags: [ 'fish', 'crafted' ], ev: E( 'fish', 'smoked fish' ),
		fun: { unhappy: - 5 }, model: { type: 'fish', len: 0.3, color: 0x6a3a14, belly: 0xa86a2a, cooked: true }, desc: 'Keeps for days.' } ),
	food( 'pickled_vegetables', 'Pickles', { w: 0.6, size: 1, spoil: 2000, portions: 3, tags: [ 'crafted' ], ev: E( 'veg', 'pickles', { p: true } ), model: W( 'jar', { fill: 0xb8b060, pickles: true } ),
		desc: 'Keeps for months.' } ),

	// ================= evolved dishes (ext/kitchen/evolved.js) =================
	// uncooked pot and pan dishes are not `raw` themselves: their data.dish says what in them is (Survival.eat would
	// count it twice)
	food( 'soup_pot_raw', 'Uncooked stew', { w: 2.4, size: 4, spoil: 36, portions: 4, tags: [ 'crafted' ], model: DISH( 'pot' ), desc: 'Cook at a fire.' } ),
	food( 'soup_pot', 'Stew', { w: 2.4, size: 4, spoil: 60, portions: 4, tags: [ 'crafted' ], model: DISH( 'pot', { cooked: true } ) } ),
	food( 'stirfry_raw', 'Uncooked stir-fry', { w: 1.8, size: 4, spoil: 24, portions: 3, tags: [ 'crafted' ], model: DISH( 'wok' ), desc: 'Cook at a fire.' } ),
	food( 'stirfry', 'Stir-fry', { w: 1.8, size: 4, spoil: 48, portions: 3, tags: [ 'crafted' ], model: DISH( 'wok', { cooked: true } ) } ),
	food( 'salad_bowl', 'Salad', { w: 0.6, size: 2, spoil: 24, portions: 2, tags: [ 'crafted' ], model: DISH( 'salad' ) } ),
	food( 'sandwich', 'Sandwich', { w: 0.25, size: 1, spoil: 36, tags: [ 'crafted' ], model: DISH( 'sandwich' ) } ),
	food( 'rice_bowl', 'Rice bowl', { w: 0.5, size: 2, spoil: 30, portions: 2, tags: [ 'crafted' ], model: DISH( 'rice_bowl' ) } ),

	// ================= coffee, tea, cocoa, ʻawa =================
	food( 'kona_coffee_beans', 'Kona coffee beans', { w: 0.2, size: 1, kcal: 60, portions: 4, rarity: 'uncommon', tags: [ 'kitchen', 'tourist', 'local' ],
		model: bag( [ 0.13, 0.2, 0.07 ], L( 'KONA', '100% Kona coffee · Whole bean', 0xa87a4a, 0x2a1408, 0x3a2214, 'coffee', 'badge', { band: 0x3a2214, textColor: 0xe8c890, glyphColor: 0xe8c890 } ), { matte: true } ),
		desc: 'Grind for coffee.' } ),
	food( 'coffee_grounds', 'Ground coffee', { w: 0.32, size: 1, kcal: 40, portions: 8, tags: [ 'kitchen', 'office' ],
		model: can( L( 'KONA BLEND', 'Ground coffee · 11 oz', 0x8a1a1a, 0xf2d8a0, 0xd4a64a, 'coffee', 'band', { glyphColor: 0xd4a64a } ), { r: 0.05, h: 0.13, tab: false } ),
		desc: 'Brew in a mug of water at a fire.' } ),
	drink( 'mug_coffee', 'Coffee', { w: 0.65, water: 18, kcal: 5, caffeine: 120, container: 'camp_mug', fun: FUN.hot, tags: [ 'crafted' ],
		model: MUG( { liquid: 0x2a1508 } ), desc: 'Restores energy.' } ),
	drink( 'sweet_coffee', 'Sweet coffee', { w: 0.68, water: 18, kcal: 90, caffeine: 120, container: 'camp_mug', fun: { unhappy: - 10, stress: - 3, boredom: - 2 }, tags: [ 'crafted' ],
		model: MUG( { liquid: 0x8a5a32 } ), desc: 'Restores energy.' } ),
	food( 'mamaki_tea', 'Māmaki tea', { w: 0.06, size: 0.5, kcal: 2, portions: 10, rarity: 'uncommon', tags: [ 'kitchen', 'herb', 'local' ],
		model: box( [ 0.13, 0.07, 0.07 ], L( 'MĀMAKI TEA', 'Hawaiian herbal · 20 bags', 0x2a6a3a, 0xf2e6c8, 0xf2e6c8, 'leaf', 'split', { accent: 0xd8a020, textColor: 0x2a6a3a, glyphColor: 0x8ac86a } ) ),
		desc: 'Brew in a mug of water at a fire.' } ),
	drink( 'mug_tea', 'Māmaki tea (brewed)', { w: 0.62, water: 22, kcal: 2, container: 'camp_mug', fun: { stress: - 10, unhappy: - 4 }, tags: [ 'crafted' ],
		model: MUG( { liquid: 0x9a6a2a, clear: true } ), desc: 'Calming.' } ),
	food( 'cocoa_mix', 'Cocoa mix', { w: 0.25, size: 1, kcal: 960, portions: 8, tags: [ 'kitchen', 'sugar' ],
		model: box( [ 0.11, 0.15, 0.06 ], L( 'COCOA', 'Hot cocoa mix · 8 packets', 0x5a2a14, 0xf2e6c8, 0xd02a2a, 'dot', 'split', { accent: 0xf2e6c8, textColor: 0x5a2a14, glyphColor: 0xf2e6c8 } ) ),
		desc: 'Brew in a mug of water at a fire.' } ),
	drink( 'mug_cocoa', 'Hot cocoa', { w: 0.66, water: 18, kcal: 140, container: 'camp_mug', fun: { unhappy: - 12, stress: - 4, boredom: - 3 }, tags: [ 'crafted' ],
		model: MUG( { liquid: 0x6a3a1e, foam: true } ) } ),
	food( 'kava_powder', 'ʻAwa powder', { w: 0.2, size: 0.5, kcal: 10, portions: 4, rarity: 'rare', tags: [ 'herb', 'local' ],
		model: bag( [ 0.12, 0.18, 0.04 ], L( 'ʻAWA', 'Kava root powder', 0xd8c8a0, 0x3a2a14, 0x5a7a3a, 'leaf', 'badge', { band: 0x5a7a3a, textColor: 0xf2e6c8, glyphColor: 0xf2e6c8 } ), { matte: true } ),
		desc: 'Mix with water in a bowl.' } ),
	drink( 'kava_drink', 'ʻAwa', { w: 0.6, water: 16, kcal: 10, container: 'bowl', fun: { stress: - 22, panic: - 10, unhappy: - 4 }, rarity: 'uncommon', tags: [ 'crafted' ],
		model: W( 'bowl', { fill: 0x9a8a68 } ), desc: 'Calms the nerves.' } ),

	// ================= spirits, mixers, cocktails, beer =================
	drink( 'coconut_rum', 'Coconut rum', { w: 1.1, size: 2, water: 10, kcal: 380, alcohol: 0.26, container: 'empty_bottle', portions: 4, rarity: 'uncommon', tags: [ 'alcohol', 'spirit', 'local' ],
		model: bottle( { style: 'liquor', h: 0.28, r: 0.041, clear: true, glass: 0xf4f2ee, opacity: 0.55, liquid: 0xf6f4ec, fill: 0.82, cap: 0x1a1a1a,
			label: L( 'KOHALA', 'Coconut rum', 0xf6f4ec, 0x1a1a1a, 0x2a8a5a, 'palm', 'plain', { glyphColor: 0x2a8a5a } ), labelY: 0.2, labelH: 0.3 } ),
		desc: 'Lava flow. Molotov ingredient.' } ),
	drink( 'blue_curacao', 'Blue curaçao', { w: 1, size: 2, water: 8, kcal: 420, alcohol: 0.2, container: 'empty_bottle', portions: 4, rarity: 'rare', tags: [ 'alcohol' ],
		model: bottle( { style: 'liquor', h: 0.27, r: 0.038, glass: 0x1a64c8, cap: 0xc8ccd0, capMetal: true,
			label: L( 'BLUE CURAÇAO', 'Orange liqueur', 0xf2f2ee, 0x1a4a8a, 0x1a7ad8, 'sun', 'plain', { glyphColor: 0xe8a020 } ), labelY: 0.2, labelH: 0.26 } ),
		desc: 'Blue Hawaiʻi.' } ),
	drink( 'pineapple_juice', 'Pineapple juice', { w: 1.4, size: 2, water: 60, kcal: 330, portions: 3, tags: [ 'juice', 'kitchen', 'local' ],
		model: can( L( 'LĀNAʻI GOLD', 'Pineapple juice · 46 oz', 0xf2d21a, 0x1a5a2a, 0x2a7a3a, 'pineapple', 'band', { glyphColor: 0xc89a2a } ), { r: 0.054, h: 0.175, rep: 2 } ),
		desc: 'Cocktail mixer.' } ),
	drink( 'mai_tai', 'Mai Tai', { w: 0.4, water: 12, kcal: 240, alcohol: 0.12, fun: FUN.cocktail, rarity: 'uncommon', tags: [ 'crafted', 'cocktail' ], model: GLASS( 'mai_tai' ) } ),
	drink( 'blue_hawaii', 'Blue Hawaiʻi', { w: 0.45, water: 14, kcal: 260, alcohol: 0.1, fun: FUN.cocktail, rarity: 'uncommon', tags: [ 'crafted', 'cocktail' ], model: GLASS( 'blue_hawaii' ) } ),
	drink( 'lava_flow', 'Lava flow', { w: 0.5, water: 14, kcal: 380, alcohol: 0.08, fun: { unhappy: - 18, stress: - 6, boredom: - 8 }, rarity: 'uncommon', tags: [ 'crafted', 'cocktail' ], model: GLASS( 'lava_flow' ) } ),
	drink( 'beer_stout', 'Mauna Stout', { w: 0.6, size: 1, water: 16, kcal: 210, alcohol: 0.16, caffeine: 20, container: 'empty_bottle', rarity: 'uncommon', tags: [ 'alcohol', 'local' ],
		model: bottle( { style: 'beer', h: 0.23, r: 0.031, glass: 0x2a1408, cap: 0x1a1a1a, capMetal: true, capH: 0.03,
			label: L( 'MAUNA STOUT', 'Coffee stout · Hilo', 0x1a1a1a, 0xd4a64a, 0xd4a64a, 'mountain', 'plain', { glyphColor: 0xd4a64a } ), labelY: 0.2, labelH: 0.25 } ) } ),
	drink( 'beer_pale', 'Waimea Pale Ale', { w: 0.37, size: 0.5, water: 16, kcal: 160, alcohol: 0.13, tags: [ 'alcohol', 'local' ],
		model: soda( L( 'WAIMEA', 'Pale ale', 0x2a8a7a, 0xf2f2ee, 0xf2d21a, 'wave', 'plain', { glyphColor: 0xf2d21a, size: 0.3 } ) ) } ),
	drink( 'energy_shot', 'Energy shot', { w: 0.06, size: 0.5, stack: 4, water: 2, kcal: 10, caffeine: 200, tags: [ 'convenience' ],
		model: bottle( { style: 'sports', h: 0.1, r: 0.018, glass: 0xd02a1a, cap: 0x1a1a1a, label: L( 'LAVA RUSH', 'Energy shot', 0xd02a1a, 0xf2d21a, 0xf2d21a, 'bolt', 'plain', { glyphColor: 0xf2d21a } ), labelY: 0.25, labelH: 0.4 } ),
		desc: 'Restores energy.' } ),
	food( 'shave_ice_syrup', 'Shave ice syrup', { w: 0.6, size: 1, kcal: 1200, portions: 8, rarity: 'uncommon', tags: [ 'sugar', 'local' ],
		model: bottle( { style: 'syrup', h: 0.2, r: 0.03, clear: true, glass: 0xf2f2f2, liquid: 0xe0203a, liquidClear: false, fill: 0.85, cap: 0xf2f2f2,
			label: L( 'SHAVE ICE', 'Strawberry syrup', 0xf2f2ee, 0xe0203a, 0x2a8ad6, 'sun', 'band', { glyphColor: 0xf2c21a, size: 0.26 } ), labelY: 0.2, labelH: 0.3 } ),
		desc: 'Pour over ice.' } ),
	drink( 'ice_bag', 'Bag of ice', { w: 2.2, size: 3, water: 12, portions: 4, rarity: 'uncommon', tags: [ 'cold' ], chill: { hours: 8, k: 0.25, melts: true },
		model: { type: 'kitchen_ice', kind: 'bag' }, desc: 'Keeps food in the same bag fresh. Melts.' } ),

	// ================= cookware =================
	tool( 'wok', 'Wok', 'pan', { w: 1.4, size: 4, metal: true, tags: [ 'kitchen', 'restaurant', 'metal' ], model: W( 'wok' ), desc: 'Stir-fry with oil at a fire.' } ),
	tool( 'rice_cooker', 'Rice cooker', 'ricecooker', { w: 2.4, size: 5, rarity: 'uncommon', tags: [ 'kitchen', 'electronics' ], model: W( 'rice_cooker' ),
		desc: 'More rice per bag. Power or a fire.' } ),
	tool( 'bowl', 'Bowl', 'bowl', { w: 0.3, size: 1, stack: 4, tags: [ 'kitchen' ], model: W( 'bowl' ), desc: 'Salads, poke, ʻawa.' } ),
	tool( 'camp_mug', 'Mug', 'mug', { w: 0.25, size: 1, liquid: 0.35, metal: true, tags: [ 'kitchen', 'outdoor', 'office' ], model: MUG(),
		desc: 'Holds 0.35 L. Coffee, tea, cocoa.' } ),
	tool( 'cocktail_shaker', 'Cocktail shaker', 'shaker', { w: 0.35, size: 1, rarity: 'uncommon', tags: [ 'bar', 'metal' ], model: W( 'shaker' ), desc: 'Mixes cocktails.' } ),
	tool( 'grill_grate', 'Grill grate', 'grill', { w: 1.1, size: 4, rarity: 'uncommon', tags: [ 'outdoor', 'metal' ], model: W( 'grate' ), desc: 'Smokes meat and fish at a fire.' } ),
	tool( 'grater', 'Grater', 'grater', { w: 0.2, size: 1, tags: [ 'kitchen', 'metal' ], model: W( 'grater' ), desc: 'Grates coconut into milk.' } ),
	tool( 'coffee_grinder', 'Coffee grinder', 'grinder', { w: 0.6, size: 1, provides: [ 'grind' ], rarity: 'uncommon', tags: [ 'kitchen' ], model: W( 'grinder' ),
		desc: 'Grinds coffee beans.' } ),
	tool( 'canning_jar', 'Mason jar', 'jar', { w: 0.35, size: 1, liquid: 0.5, tags: [ 'kitchen', 'glass', 'jar' ], model: W( 'jar' ), desc: 'Pickling. Holds 0.5 L.' } ),
	// ================= more of the pantry: ʻinamona, teriyaki, lilikoʻi butter, a musubi mold =================
	food( 'inamona', 'ʻInamona', { w: 0.08, size: 0.5, kcal: 300, portions: 6, rarity: 'uncommon', tags: [ 'kitchen', 'spice', 'local' ], ev: E( 'spice', 'ʻinamona' ),
		model: jar( { r: 0.026, h: 0.07, clear: true, content: 0x6a4428, lid: 0xd8c8a0, label: L( 'ʻINAMONA', 'Kukui nut relish', 0xf2e6c8, 0x5a3a1a, 0x8a2a1a, 'leaf', 'band', { glyphColor: 0x5a7a3a, size: 0.32 } ) } ),
		desc: 'Seasoning. Poke.' } ),
	food( 'teriyaki_sauce', 'Teriyaki sauce', { w: 0.55, kcal: 400, portions: 10, tags: [ 'kitchen', 'spice', 'local' ], ev: E( 'sauce', 'teriyaki' ),
		model: bottle( { style: 'syrup', h: 0.21, r: 0.034, glass: 0x2a1408, cap: 0xd8a020,
			label: L( 'NOHO', 'Teriyaki sauce', 0xc0282a, 0xf2e6c8, 0x1a1a1a, 'sun', 'band', { glyphColor: 0xf2c21a, size: 0.3 } ), labelY: 0.24, labelH: 0.32 } ),
		desc: 'Seasoning. Teriyaki.' } ),
	food( 'lilikoi_butter', 'Lilikoʻi butter', { w: 0.35, kcal: 700, spoil: 400, portions: 6, rarity: 'uncommon', tags: [ 'kitchen', 'sugar', 'local' ], ev: E( 'sweet', 'lilikoʻi butter', { p: true } ),
		model: jar( { r: 0.033, h: 0.085, clear: true, content: 0xf2c43a, lid: 0x6a3a8a, label: L( 'LILIKOʻI', 'Passion fruit butter', 0xf6efe0, 0x6a3a8a, 0xf2c43a, 'fruit', 'band', { glyphColor: 0x6a3a8a, size: 0.28 } ) } ),
		desc: 'Spread. Sandwiches.' } ),
	// (its kind is two words so a refusal reads "Need musubi mold")
	tool( 'musubi_mold', 'Musubi mold', 'musubi mold', { w: 0.08, size: 1, tags: [ 'kitchen', 'plastic', 'local' ], model: W( 'musubi_mold' ), desc: 'Presses Spam musubi.' } ),
	tool( 'freezer_pack', 'Freezer pack', 'ice', { w: 0.5, size: 1, rarity: 'uncommon', tags: [ 'cold' ], chill: { hours: 10, k: 0.3, warm: true },
		model: { type: 'kitchen_ice', kind: 'pack' }, desc: 'Keeps food beside it fresh while cold.' } ),
] );

// ======================================================================================================================
// where it lies (building loot spots on shelves, counters and floors; outdoor sites)
// ======================================================================================================================

const add = ( table, entries ) => extendLoot( table, entries );
add( 'house_kitchen', [
	[ 'shoyu', 1.2 ], [ 'furikake', 0.4 ], [ 'sugar', 0.7 ], [ 'flour', 0.4 ], [ 'mochiko', 0.2 ], [ 'guava_jam', 0.3 ], [ 'mayo', 0.5 ], [ 'coconut_milk', 0.5 ],
	[ 'rice_vinegar', 0.25 ], [ 'alaea_salt', 0.25 ], [ 'li_hing_powder', 0.3 ], [ 'chili_pepper_water', 0.25 ], [ 'garlic', 0.4, [ 1, 3 ] ], [ 'ginger', 0.3 ],
	[ 'bread_loaf', 0.5 ], [ 'macaroni', 0.4 ], [ 'portuguese_sausage', 0.3 ], [ 'nori', 0.35 ], [ 'cocoa_mix', 0.3 ], [ 'mamaki_tea', 0.2 ], [ 'coffee_grounds', 0.5 ],
	[ 'bowl', 0.7, [ 1, 3 ] ], [ 'camp_mug', 0.6 ], [ 'wok', 0.25 ], [ 'rice_cooker', 0.3 ], [ 'grater', 0.25 ], [ 'coffee_grinder', 0.1 ], [ 'canning_jar', 0.4 ],
	[ 'freezer_pack', 0.25 ], [ 'shave_ice_syrup', 0.1 ],
] );
add( 'fridge', [
	[ 'portuguese_sausage', 0.6 ], [ 'mayo', 0.4 ], [ 'shoyu', 0.3 ], [ 'beer_pale', 0.6, [ 1, 3 ] ], [ 'beer_stout', 0.25 ], [ 'pineapple_juice', 0.35 ],
	[ 'chocolate_haupia_pie', 0.2 ], [ 'haupia', 0.3 ], [ 'salted_salmon', 0.25 ], [ 'green_onion', 0.3 ], [ 'tomato', 0.4, [ 1, 3 ] ], [ 'cabbage', 0.25 ],
	[ 'chili_pepper_water', 0.3 ], [ 'kalua_pig', 0.1 ], [ 'freezer_pack', 0.45, [ 1, 2 ] ], [ 'coconut_milk', 0.15 ],
] );
add( 'grocery', [
	[ 'shoyu', 1.4 ], [ 'sugar', 0.9 ], [ 'flour', 0.7 ], [ 'mochiko', 0.4 ], [ 'coconut_milk', 0.7 ], [ 'mayo', 0.5 ], [ 'guava_jam', 0.4 ], [ 'rice_vinegar', 0.35 ],
	[ 'furikake', 0.5 ], [ 'li_hing_powder', 0.35 ], [ 'alaea_salt', 0.25 ], [ 'nori', 0.5 ], [ 'macaroni', 0.5 ], [ 'bread_loaf', 0.7 ], [ 'portuguese_sausage', 0.5 ],
	[ 'salted_salmon', 0.25 ], [ 'garlic', 0.4 ], [ 'ginger', 0.35 ], [ 'tomato', 0.4 ], [ 'cabbage', 0.3 ], [ 'green_onion', 0.3 ], [ 'coffee_grounds', 0.6 ],
	[ 'kona_coffee_beans', 0.25 ], [ 'cocoa_mix', 0.45 ], [ 'mamaki_tea', 0.3 ], [ 'pineapple_juice', 0.5 ], [ 'li_hing_gummies', 0.35 ], [ 'energy_shot', 0.25 ],
	[ 'shave_ice_syrup', 0.15 ], [ 'canning_jar', 0.25 ], [ 'bowl', 0.15 ], [ 'camp_mug', 0.15 ],
] );
add( 'restaurant_kitchen', [
	[ 'wok', 0.9 ], [ 'rice_cooker', 0.5 ], [ 'shoyu', 1.2 ], [ 'sugar', 0.5 ], [ 'flour', 0.5 ], [ 'mochiko', 0.25 ], [ 'coconut_milk', 0.5 ], [ 'rice_vinegar', 0.4 ],
	[ 'garlic', 0.5, [ 1, 4 ] ], [ 'ginger', 0.5, [ 1, 3 ] ], [ 'green_onion', 0.4 ], [ 'macaroni', 0.4 ], [ 'mayo', 0.4 ], [ 'bowl', 0.8, [ 1, 4 ] ], [ 'grill_grate', 0.35 ],
	[ 'grater', 0.3 ], [ 'alaea_salt', 0.35 ], [ 'furikake', 0.3 ], [ 'nori', 0.4 ], [ 'portuguese_sausage', 0.35 ], [ 'salted_salmon', 0.25 ], [ 'cabbage', 0.3 ],
	[ 'luau_leaves', 0.25 ], [ 'ti_leaves', 0.3, [ 2, 6 ] ], [ 'chili_pepper_water', 0.25 ], [ 'canning_jar', 0.2 ],
] );
add( 'restaurant', [ [ 'bowl', 0.4 ], [ 'shoyu', 0.4 ], [ 'chili_pepper_water', 0.3 ], [ 'haupia', 0.25 ], [ 'kalua_pig', 0.1 ] ] );
add( 'fastfood', [ [ 'shave_ice_syrup', 0.4 ], [ 'li_hing_gummies', 0.3 ] ] );
add( 'bar', [ [ 'cocktail_shaker', 0.9 ], [ 'pineapple_juice', 0.6 ], [ 'pog_juice', 0.4 ], [ 'li_hing_powder', 0.2 ], [ 'beer_pale', 0.8, [ 1, 3 ] ], [ 'beer_stout', 0.4 ] ] );
add( 'hotel_room', [ [ 'coconut_rum', 0.2 ], [ 'coffee_grounds', 0.3 ], [ 'camp_mug', 0.3 ] ] );
add( 'market', [ [ 'alaea_salt', 0.4 ], [ 'kava_powder', 0.25 ], [ 'kona_coffee_beans', 0.3 ], [ 'raw_crab', 0.15 ], [ 'guava_jam', 0.3 ], [ 'chili_pepper_water', 0.3 ] ] );
add( 'farm', [ [ 'kona_coffee_beans', 0.4 ], [ 'coffee_grinder', 0.15 ], [ 'canning_jar', 0.3 ], [ 'grill_grate', 0.2 ] ] );
add( 'office', [ [ 'coffee_grounds', 0.6 ], [ 'camp_mug', 0.8 ], [ 'cocoa_mix', 0.25 ], [ 'energy_shot', 0.4 ], [ 'mamaki_tea', 0.2 ] ] );
add( 'desk', [ [ 'camp_mug', 0.4 ], [ 'energy_shot', 0.2 ] ] );
add( 'observatory', [ [ 'coffee_grounds', 0.8 ], [ 'camp_mug', 0.8 ], [ 'cocoa_mix', 0.6 ], [ 'freezer_pack', 0.5 ], [ 'mamaki_tea', 0.3 ] ] );
add( 'church', [ [ 'haupia', 0.5 ], [ 'coffee_grounds', 0.4 ], [ 'camp_mug', 0.4 ], [ 'bowl', 0.3 ], [ 'sugar', 0.25 ] ] );
add( 'school', [ [ 'li_hing_gummies', 0.4 ], [ 'cocoa_mix', 0.2 ] ] );
add( 'house_living', [ [ 'camp_mug', 0.3 ], [ 'li_hing_gummies', 0.2 ] ] );
add( 'warehouse', [ [ 'sugar', 0.6 ], [ 'flour', 0.5 ], [ 'shoyu', 0.4 ], [ 'macaroni', 0.4 ], [ 'canning_jar', 0.35 ], [ 'rice_vinegar', 0.25 ] ] );
add( 'military', [ [ 'coffee_grounds', 0.3 ], [ 'camp_mug', 0.4 ], [ 'energy_shot', 0.3 ] ] );
add( 'fire_station', [ [ 'rice_cooker', 0.3 ], [ 'coffee_grounds', 0.6 ], [ 'camp_mug', 0.6 ], [ 'portuguese_sausage', 0.3 ], [ 'shoyu', 0.3 ], [ 'wok', 0.2 ] ] );
add( 'police', [ [ 'coffee_grounds', 0.5 ], [ 'camp_mug', 0.5 ] ] );
add( 'hardware', [ [ 'grill_grate', 0.5 ], [ 'canning_jar', 0.5 ], [ 'freezer_pack', 0.3 ], [ 'camp_mug', 0.3 ] ] );
add( 'sports', [ [ 'camp_mug', 0.4 ], [ 'energy_shot', 0.5 ], [ 'freezer_pack', 0.3 ] ] );
add( 'beach', [ [ 'freezer_pack', 0.2 ], [ 'beer_pale', 0.3 ], [ 'li_hing_gummies', 0.2 ], [ 'limu', 0.3 ] ] );
add( 'house_garage', [ [ 'grill_grate', 0.35 ], [ 'freezer_pack', 0.25 ], [ 'beer_pale', 0.3, [ 1, 4 ] ], [ 'canning_jar', 0.25 ] ] );
add( 'trash', [ [ 'canning_jar', 0.2 ], [ 'bowl', 0.1 ] ] );
add( 'convenience', [ [ 'li_hing_powder', 0.3 ], [ 'shave_ice_syrup', 0.15 ] ] );
add( 'gas_station', [ [ 'energy_shot', 0.6 ], [ 'beer_pale', 0.4 ] ] );
// outdoors: relief ice at the FEMA camps, a cooler's freezer packs on the beach, the farm stand's produce
add( 'site_fema_camp', [ [ 'ice_bag', 0.6 ], [ 'camp_mug', 0.4 ], [ 'coffee_grounds', 0.4 ], [ 'sugar', 0.25 ], [ 'flour', 0.2 ], [ 'bowl', 0.3 ] ] );
add( 'site_supply_drop', [ [ 'coffee_grounds', 0.3 ], [ 'energy_shot', 0.4 ] ] );
add( 'site_campsite', [ [ 'camp_mug', 0.8 ], [ 'coffee_grounds', 0.5 ], [ 'grill_grate', 0.5 ], [ 'cocoa_mix', 0.35 ], [ 'alaea_salt', 0.25 ], [ 'portuguese_sausage', 0.35 ],
	[ 'kona_coffee_beans', 0.15 ], [ 'cooking_oil', 0.3 ], [ 'wok', 0.1 ], [ 'ti_leaves', 0.25, [ 2, 5 ] ] ] );
add( 'site_beach_camp', [ [ 'freezer_pack', 0.5 ], [ 'pineapple_juice', 0.35 ], [ 'beer_pale', 0.5, [ 1, 3 ] ], [ 'coconut_rum', 0.15 ], [ 'li_hing_gummies', 0.35 ],
	[ 'shave_ice_syrup', 0.15 ], [ 'limu', 0.25 ] ] );
add( 'site_picnic', [ [ 'shoyu', 0.3 ], [ 'bowl', 0.3 ], [ 'grill_grate', 0.45 ], [ 'portuguese_sausage', 0.35 ], [ 'bread_loaf', 0.35 ], [ 'mayo', 0.25 ], [ 'beer_pale', 0.4 ],
	[ 'freezer_pack', 0.3 ], [ 'chocolate_haupia_pie', 0.15 ], [ 'haupia', 0.25 ], [ 'furikake', 0.2 ] ] );
add( 'site_farm_stand', [ [ 'tomato', 0.9, [ 2, 4 ] ], [ 'cabbage', 0.7 ], [ 'green_onion', 0.7, [ 1, 3 ] ], [ 'ginger', 0.5, [ 1, 3 ] ], [ 'garlic', 0.4, [ 1, 3 ] ],
	[ 'chili_peppers', 0.5, [ 2, 6 ] ], [ 'luau_leaves', 0.6, [ 1, 3 ] ], [ 'ti_leaves', 0.7, [ 3, 8 ] ], [ 'kona_coffee_beans', 0.45 ], [ 'guava_jam', 0.35 ],
	[ 'chili_pepper_water', 0.35 ], [ 'alaea_salt', 0.2 ], [ 'kava_powder', 0.12 ] ] );
add( 'site_fishing_spot', [ [ 'limu', 0.7, [ 1, 3 ] ], [ 'shoyu', 0.35 ], [ 'raw_crab', 0.12 ], [ 'alaea_salt', 0.3 ], [ 'chili_pepper_water', 0.25 ], [ 'beer_pale', 0.4 ],
	[ 'freezer_pack', 0.25 ], [ 'salt_fish', 0.15 ] ] );
add( 'site_military_checkpoint', [ [ 'coffee_grounds', 0.3 ], [ 'camp_mug', 0.4 ], [ 'energy_shot', 0.3 ] ] );
add( 'site_checkpoint', [ [ 'coffee_grounds', 0.3 ], [ 'camp_mug', 0.3 ] ] );
add( 'site_hiker', [ [ 'camp_mug', 0.4 ], [ 'energy_shot', 0.3 ], [ 'cocoa_mix', 0.2 ] ] );
add( 'site_roadside', [ [ 'li_hing_gummies', 0.25 ], [ 'beer_pale', 0.2 ] ] );
add( 'site_body', [ [ 'energy_shot', 0.2 ], [ 'salt_meat', 0.1 ] ] );
// the newer pantry things
add( 'house_kitchen', [ [ 'teriyaki_sauce', 0.4 ], [ 'musubi_mold', 0.3 ], [ 'lilikoi_butter', 0.12 ], [ 'inamona', 0.08 ] ] );
add( 'fridge', [ [ 'teriyaki_sauce', 0.15 ], [ 'lilikoi_butter', 0.1 ] ] );
add( 'grocery', [ [ 'teriyaki_sauce', 0.6 ], [ 'musubi_mold', 0.15 ] ] );
add( 'restaurant_kitchen', [ [ 'teriyaki_sauce', 0.5 ], [ 'musubi_mold', 0.2 ] ] );
add( 'market', [ [ 'inamona', 0.2 ], [ 'lilikoi_butter', 0.25 ] ] );
add( 'church', [ [ 'lilikoi_butter', 0.15 ] ] );
add( 'site_farm_stand', [ [ 'lilikoi_butter', 0.3 ], [ 'inamona', 0.15 ] ] );
add( 'site_picnic', [ [ 'teriyaki_sauce', 0.25 ], [ 'musubi_mold', 0.1 ] ] );
add( 'site_stash', [ [ 'salt_meat', 0.3 ], [ 'salt_fish', 0.25 ], [ 'coffee_grounds', 0.3 ], [ 'sugar', 0.3 ], [ 'coconut_rum', 0.15 ] ] );

// ======================================================================================================================
// small shared bits for the mixes
// ======================================================================================================================

// a carried stack (not one of the two being combined)
const carried = ( c, pred ) => c.inv.find( ( s, d ) => s !== c.a && s !== c.b && d && pred( s, d ) );
// one portion (or one unit) of a carried thing, used up
const useOne = ( c, s ) => { const d = getItem( s.id ); c.consume( s, ( d.food?.portions || d.drink?.portions || 1 ) > 1 ? { portions: 1 } : { qty: 1 } ); };
const isOil = ( s, d ) => d.id === 'cooking_oil' || ( d.tags?.includes( 'oil' ) && d.tags.includes( 'kitchen' ) );
const isSalt = ( s, d ) => d.tags?.includes( 'salt' ) && d.cat === 'food';
const isSugar = ( s, d ) => [ 'sugar', 'honey' ].includes( d.id );
const isRum = ( s, d ) => [ 'rum', 'coconut_rum', 'okolehao' ].includes( d.id );
const OIL_SPLASH = 8; // pans of stir-fry in a bottle of oil
const RICE_COOKER = 7; // bowls from a full bag (a pot gives 5)
const rawMeat = ( s, d ) => d.cat === 'food' && !! d.food?.raw && d.tags?.includes( 'meat' );
const rawFish = ( s, d ) => d.cat === 'food' && !! d.food?.raw && ( d.tags?.includes( 'fish' ) || d.tags?.includes( 'shell' ) );
const rotten = ( s, d ) => !! d.food?.spoil && freshness( s ) <= 0;
// what is left of a perishable's life carries into what it becomes (salting a day-old fish does not make it new)
export const ageFor = ( s, d, outId ) => {
	const sp = getItem( outId )?.food?.spoil || 0;
	return sp && d?.food?.spoil ? Math.round( sp * ( 1 - freshness( s ) ) * 100 ) / 100 : 0;
};
// a pan to fry in: the wok, or a frying pan (a weapon too: not while it's in a weapon slot)
const isPan = ( s, d ) => provides( s, 'pan' ) || d.id === 'frying_pan';
// a mug, bowl or jar holding at least this much water (a fire boils dirty water clean)
const filled = ( min, kinds = [ 'water', 'dirty' ] ) => ( s, d ) => { const l = liquidIn( s, d ); return !! l?.kind && kinds.includes( l.kind ) && l.litres >= min - 1e-6; };
const holding = ( id, min, kinds ) => ( s, d ) => s.id === id && filled( min, kinds )( s, d );
// one serving: a portion of a bag or bottle, else one unit (a plain number is a whole unit for food)
const ONE = { portions: 1 };

// ======================================================================================================================
// evolved dishes: start a dish on a base, add to it, season it
// ======================================================================================================================

const main = ( base ) => ( s, d ) => fits( base, d ) && ! SEASON.has( ingredient( d ).k );
const anyIng = ( base ) => ( s, d ) => fits( base, d );
const dishOf = ( base, raw ) => ( s, d ) => DISH_BASE[ d.id ] === base && ( raw === undefined || isRawDish( d.id ) === raw );

// the ingredient side, put into a dish (consumption included): one unit, or a portion of a seasoning
function putIn( c, dish, s ) {
	const d = getItem( s.id );
	addTo( dish, s, d );
	c.consume( s, unitOf( d ) );
}

// the dish's new look: the item for its state, its record and its name; the stalest thing in it sets its age
function setDish( c, stack, dish ) {
	const id = dish.cooked || ! BASES[ dish.base ].raw ? BASES[ dish.base ].done : BASES[ dish.base ].raw;
	const data = dishData( dish, getItem( id ) );
	if ( stack.id === id ) { stack.data.dish = data.dish; stack.data.name = data.name; if ( data.age !== undefined ) stack.data.age = Math.max( stack.data.age || 0, data.age ); return stack; }
	return c.replace( stack, id, data );
}

const addCheck = ( base ) => ( c ) => refuse( base, c.b.data?.dish || null, c.a, c.A );
const addRun = ( c ) => {
	// a dish given without its record (a cheat, an old save) starts one
	const dish = c.b.data.dish ||= startDish( DISH_BASE[ c.B.id ] );
	putIn( c, dish, c.a );
	setDish( c, c.b, dish );
};

addCombos( [
	// ---- a pot of water: soup or stew (cooked at a fire) ----
	{ id: 'dish_pot', verb: 'Add', label: 'Add to pot', a: { fn: main( 'pot' ) }, b: { tool: 'pot', fn: filled( 0.5, [ 'water', 'dirty', 'sea' ] ) },
		use: { a: 0, b: 0 }, time: 3, sound: 'pour', skill: 'cooking', xp: 1,
		check: ( c ) => refuse( 'pot', null, c.a, c.A ),
		run: ( c ) => {
			const l = liquidIn( c.b );
			// the water becomes broth: thirst back from a soup; seawater salts it, dirty water needs the boil
			const dish = startDish( 'pot', { id: c.b.id, cond: c.b.cond }, { water: l.kind === 'sea' ? l.litres * 8 : l.litres * 45, dirty: l.kind === 'dirty', salt: l.kind === 'sea' } );
			putIn( c, dish, c.a );
			setDish( c, c.b, dish );
		} },
	{ id: 'dish_pot_add', verb: 'Add', label: 'Add to {b}', a: { fn: anyIng( 'pot' ) }, b: { fn: dishOf( 'pot' ) }, use: { a: 0, b: 0 }, time: 2, sound: 'pour',
		check: ( c ) => ! isRawDish( c.B.id ) && ! SEASON.has( ingredient( c.A ).k ) ? 'Already cooked' : addCheck( 'pot' )( c ), run: addRun },

	// ---- an oiled wok or pan: stir-fry, fried rice (cooked at a fire) ----
	{ id: 'dish_pan', verb: 'Fry', label: 'Add to {b}', a: { fn: main( 'pan' ) }, b: { fn: isPan }, use: { a: 0, b: 0 }, time: 3, sound: 'sizzle', skill: 'cooking', xp: 1,
		check: ( c ) => {
			const w = c.use?.where?.( c.b );
			if ( w?.kind === 'weapon' || w?.kind === 'equip' ) return 'Put it in a bag first';
			if ( c.b.data?.items?.length ) return 'Empty it first';
			if ( ! carried( c, isOil ) ) return 'Need cooking oil';
			return refuse( 'pan', null, c.a, c.A );
		},
		run: ( c ) => {
			const oil = carried( c, isOil );
			const dish = startDish( 'pan', { id: c.b.id, cond: c.b.cond }, { kcal: 120 } );
			if ( oil ) {
				oil.data.splash = ( oil.data.splash ?? OIL_SPLASH ) - 1;
				if ( oil.data.splash <= 0 ) c.consume( oil, { qty: 1 } );
			}
			putIn( c, dish, c.a );
			setDish( c, c.b, dish );
		} },
	{ id: 'dish_pan_add', verb: 'Add', label: 'Add to {b}', a: { fn: anyIng( 'pan' ) }, b: { fn: dishOf( 'pan' ) }, use: { a: 0, b: 0 }, time: 2, sound: 'sizzle',
		check: ( c ) => ! isRawDish( c.B.id ) && ! SEASON.has( ingredient( c.A ).k ) ? 'Already cooked' : addCheck( 'pan' )( c ), run: addRun },

	// ---- a bowl: salad, poke ----
	{ id: 'dish_bowl', verb: 'Add', label: 'Put in bowl', a: { fn: main( 'bowl' ) }, b: 'bowl', use: { a: 0, b: 0 }, time: 3, sound: 'tear', skill: 'cooking', xp: 1,
		check: ( c ) => refuse( 'bowl', null, c.a, c.A ),
		run: ( c ) => { const dish = startDish( 'bowl', { id: 'bowl', cond: c.b.cond } ); putIn( c, dish, c.a ); setDish( c, c.b, dish ); } },
	{ id: 'dish_bowl_add', verb: 'Add', label: 'Add to {b}', a: { fn: anyIng( 'bowl' ) }, b: { fn: dishOf( 'bowl' ) }, use: { a: 0, b: 0 }, time: 2, sound: 'tear',
		check: addCheck( 'bowl' ), run: addRun },

	// ---- a slice of bread: a sandwich ----
	{ id: 'dish_bread', verb: 'Make sandwich', label: 'Make sandwich', a: { fn: main( 'bread' ) }, b: { ids: [ 'bread_loaf', 'sweet_bread' ] }, use: { a: 0, b: 0 }, time: 3, sound: 'tear',
		skill: 'cooking', xp: 1,
		check: ( c ) => refuse( 'bread', null, c.a, c.A ),
		run: ( c ) => {
			const bread = contribution( c.b, c.B ), P = c.B.food.portions || 1;
			const dish = startDish( 'bread', null, { kcal: c.B.food.kcal / P, fresh: bread.fresh } );
			c.consume( c.b, { portions: 1 } );
			putIn( c, dish, c.a );
			const def = getItem( 'sandwich' );
			c.give( 'sandwich', 1, dishData( dish, def ) );
		} },
	{ id: 'dish_bread_add', verb: 'Add', label: 'Add to {b}', a: { fn: anyIng( 'bread' ) }, b: { fn: dishOf( 'bread' ) }, use: { a: 0, b: 0 }, time: 2, sound: 'tear',
		check: addCheck( 'bread' ), run: addRun },

	// ---- a bowl of rice: a rice bowl (loco moco, furikake rice, a poke bowl) ----
	{ id: 'dish_rice', verb: 'Top rice', label: 'Put on rice', a: { fn: anyIng( 'rice' ) }, b: 'cooked_rice', use: { a: 0, b: 0 }, time: 2, sound: 'tear', skill: 'cooking', xp: 1,
		check: ( c ) => refuse( 'rice', null, c.a, c.A ),
		run: ( c ) => {
			const rice = contribution( c.b, c.B );
			const dish = startDish( 'rice', null, { kcal: rice.kcal, water: rice.water, fresh: rice.fresh } );
			putIn( c, dish, c.a );
			setDish( c, c.b, dish );
		} },
	{ id: 'dish_rice_add', verb: 'Add', label: 'Add to {b}', a: { fn: anyIng( 'rice' ) }, b: { fn: dishOf( 'rice' ) }, use: { a: 0, b: 0 }, time: 2, sound: 'tear',
		check: addCheck( 'rice' ), run: addRun },
] );

// ======================================================================================================================
// mixes
// ======================================================================================================================

// the cocktails' other needs: ice, a shot of rum, the shaker
const iceIn = ( c ) => carried( c, ( s, d ) => d.id === 'ice_bag' && coldLeft( s, d ) > 0 );

addCombos( [
	// ---- preserving ----
	{ id: 'salt_meat', verb: 'Salt', label: 'Salt {b}', a: { fn: isSalt }, b: { fn: rawMeat }, use: { a: { portions: 2 }, b: 0 }, time: 6, sound: 'tear', skill: 'cooking', xp: 3,
		check: ( c ) => rotten( c.b, c.B ) ? 'Too far gone' : null, run: ( c ) => c.replace( c.b, 'salt_meat', { age: ageFor( c.b, c.B, 'salt_meat' ) } ) },
	{ id: 'salt_fish', verb: 'Salt', label: 'Salt {b}', a: { fn: isSalt }, b: { fn: ( s, d ) => rawFish( s, d ) && d.tags.includes( 'fish' ) }, use: { a: { portions: 2 }, b: 0 }, time: 6, sound: 'tear',
		skill: 'cooking', xp: 3, check: ( c ) => rotten( c.b, c.B ) ? 'Too far gone' : null, run: ( c ) => c.replace( c.b, 'salt_fish', { age: ageFor( c.b, c.B, 'salt_fish' ) } ) },
	// over a fire on a grate: raw or salted meat and fish smoke slowly and keep
	{ id: 'smoke_food', verb: 'Smoke', label: 'Smoke {b}', a: { tool: 'grill' }, station: 'fire',
		b: { fn: ( s, d ) => rawMeat( s, d ) || ( rawFish( s, d ) && d.tags.includes( 'fish' ) ) || [ 'salt_meat', 'salt_fish' ].includes( d.id ) },
		use: { a: 0, b: 0 }, wear: { a: 0.01 }, time: 25, sound: 'sizzle', skill: 'cooking', xp: 6,
		check: ( c ) => rotten( c.b, c.B ) ? 'Too far gone' : null,
		run: ( c ) => { const out = c.B.tags.includes( 'fish' ) ? 'smoked_fish' : 'smoked_meat'; c.replace( c.b, out, { age: ageFor( c.b, c.B, out ) } ); } },
	// what has gone off still catches fish
	{ id: 'rotten_bait', verb: 'Cut bait', label: 'Cut {b} into bait', a: { tool: 'cut' },
		b: { fn: ( s, d ) => d.cat === 'food' && !! d.food.spoil && ( d.tags.includes( 'meat' ) || d.tags.includes( 'fish' ) || d.tags.includes( 'shell' ) ) && ! [ 'raw_fish', 'raw_tako' ].includes( d.id ) },
		use: { a: 0, b: { qty: 1 } }, wear: { a: 0.005 }, out: [ 'fishing_bait', 3 ], time: 4, sound: 'tear', skill: 'fishing', xp: 1,
		// only what has gone off (fresh meat is food): not offered otherwise
		check: ( c ) => rotten( c.b, c.B ) ? null : { reason: 'Still fresh', soft: true } },
	// a jar, rice vinegar (or any vinegar) and something to pickle: pickles that keep for months
	{ id: 'pickle', verb: 'Pickle', label: 'Pickle {a}', a: { fn: ( s, d ) => PICKLE[ d.id ] !== undefined }, b: { id: 'canning_jar', fn: ( s ) => ! liquidIn( s )?.kind },
		use: { a: 0, b: 0 }, time: 8, sound: 'pour', skill: 'cooking', xp: 3,
		check: ( c ) => rotten( c.a, c.A ) ? 'Too far gone' : carried( c, ( s, d ) => d.tags?.includes( 'vinegar' ) && d.cat !== 'tool' ) ? null : 'Need vinegar',
		run: ( c ) => {
			const v = carried( c, ( s, d ) => d.tags?.includes( 'vinegar' ) && d.cat !== 'tool' );
			if ( v ) useOne( c, v );
			const dish = startDish( 'bowl', { id: 'canning_jar', cond: c.b.cond } );
			const ct = contribution( c.a, c.A ), age = ageFor( c.a, c.A, 'pickled_vegetables' );
			dish.kcal = ct.kcal; dish.water = ct.water; dish.ids.push( c.A.id ); dish.fun.unhappy -= 4;
			c.consume( c.a, { qty: 1 } );
			c.replace( c.b, 'pickled_vegetables', { dish, name: pickleName( dish.ids ), age } );
		} },
	{ id: 'pickle_add', verb: 'Add', label: 'Add to {b}', a: { fn: ( s, d ) => PICKLE[ d.id ] !== undefined }, b: { id: 'pickled_vegetables', fn: ( s ) => ( s.data?.dish?.ids?.length || 0 ) < 3 },
		use: { a: 0, b: 0 }, time: 4, sound: 'pour',
		check: ( c ) => ! c.b.data?.dish ? 'Full' : rotten( c.a, c.A ) ? 'Too far gone' : null,
		run: ( c ) => {
			const dish = c.b.data.dish, ct = contribution( c.a, c.A );
			dish.kcal += ct.kcal; dish.water += ct.water; dish.ids.push( c.A.id );
			c.b.data.age = Math.max( c.b.data.age || 0, ageFor( c.a, c.A, 'pickled_vegetables' ) );
			c.consume( c.a, { qty: 1 } );
			c.b.data.name = pickleName( dish.ids );
		} },
	// seawater boiled dry is in the verbs below (a pot on its own)

	// ---- coffee from the bean, tea, cocoa, ʻawa ----
	{ id: 'grind_coffee', verb: 'Grind', label: 'Grind beans', a: { tool: 'grind' }, b: 'kona_coffee_beans', use: { a: 0, b: { qty: 1 } }, wear: { a: 0.01 },
		out: [ 'coffee_grounds', 1 ], time: 8, sound: 'craft', skill: 'cooking', xp: 1 },
	{ id: 'crush_coffee', verb: 'Crush', label: 'Crush beans', a: { any: [ 'stone', { tool: 'hammer' } ] }, b: 'kona_coffee_beans', use: { a: 0, b: { qty: 1 } },
		out: [ 'coffee_grounds', 1 ], time: 16, sound: 'hit_wood', skill: 'cooking', xp: 1, run: ( c ) => { const g = c.made[ 0 ]; if ( g ) g.data.left = 6; } },
	{ id: 'brew_coffee', verb: 'Brew', label: 'Brew coffee', a: 'coffee_grounds', b: { fn: holding( 'camp_mug', 0.25 ) }, use: { a: ONE, b: 0 }, station: 'fire',
		time: 8, sound: 'pour', skill: 'cooking', xp: 1, run: ( c ) => c.replace( c.b, 'mug_coffee', {} ) },
	{ id: 'sweeten_coffee', verb: 'Sweeten', label: 'Add to coffee', a: { any: [ 'sugar', 'honey', 'milk', 'cocoa_mix' ] }, b: 'mug_coffee', use: { a: ONE, b: 0 },
		time: 2, sound: 'pour', run: ( c ) => c.replace( c.b, 'sweet_coffee', {} ) },
	{ id: 'brew_tea', verb: 'Brew', label: 'Brew tea', a: 'mamaki_tea', b: { fn: holding( 'camp_mug', 0.25 ) }, use: { a: ONE, b: 0 }, station: 'fire',
		time: 8, sound: 'pour', skill: 'cooking', xp: 1, run: ( c ) => c.replace( c.b, 'mug_tea', {} ) },
	{ id: 'brew_ginger_tea', verb: 'Brew', label: 'Brew ginger tea', a: 'ginger', b: { fn: holding( 'camp_mug', 0.25 ) }, use: { a: ONE, b: 0 }, station: 'fire',
		time: 8, sound: 'pour', skill: 'cooking', xp: 1, run: ( c ) => c.replace( c.b, 'mug_tea', { name: 'Ginger tea' } ) },
	{ id: 'brew_cocoa', verb: 'Brew', label: 'Make cocoa', a: 'cocoa_mix', b: { fn: holding( 'camp_mug', 0.25 ) }, use: { a: ONE, b: 0 }, station: 'fire',
		time: 8, sound: 'pour', skill: 'cooking', xp: 1, run: ( c ) => c.replace( c.b, 'mug_cocoa', {} ) },
	{ id: 'mix_kava', verb: 'Mix', label: 'Mix ʻawa', a: 'kava_powder', b: 'bowl', use: { a: ONE, b: 0 }, liquid: { kind: 'water', litres: 0.3 },
		time: 10, sound: 'pour', run: ( c ) => c.replace( c.b, 'kava_drink', {} ) },

	// ---- cocktails ----
	{ id: 'mix_mai_tai', verb: 'Mix', label: 'Mix Mai Tai', a: { any: [ 'rum', 'okolehao' ] }, b: { any: [ 'pog_juice', 'pineapple_juice' ] }, use: { a: 1, b: 1 },
		out: [ 'mai_tai', 1 ], time: 4, sound: 'pour' },
	{ id: 'mix_blue_hawaii', verb: 'Shake', label: 'Shake Blue Hawaiʻi', a: 'blue_curacao', b: 'pineapple_juice', use: { a: 1, b: 1 }, tools: [ 'shaker' ],
		out: [ 'blue_hawaii', 1 ], time: 5, sound: 'pour',
		check: ( c ) => carried( c, isRum ) ? null : 'Need rum', run: ( c ) => { const r = carried( c, isRum ); if ( r ) c.consume( r, 1 ); } },
	{ id: 'mix_lava_flow', verb: 'Shake', label: 'Shake lava flow', a: 'coconut_rum', b: { any: [ 'pineapple_juice', 'guava_nectar' ] }, use: { a: 1, b: 1 }, tools: [ 'shaker' ],
		out: [ 'lava_flow', 1 ], time: 5, sound: 'pour',
		check: ( c ) => iceIn( c ) ? null : 'Need ice', run: ( c ) => { const i = iceIn( c ); if ( i ) c.consume( i, 1 ); } },

	// ---- treats ----
	{ id: 'shave_ice', verb: 'Pour', label: 'Make shave ice', a: 'shave_ice_syrup', b: { id: 'ice_bag', fn: ( s, d ) => coldLeft( s, d ) > 0 }, use: { a: ONE, b: ONE },
		out: [ 'shave_ice', 1 ], time: 5, sound: 'pour' },
	{ id: 'li_hing_fruit', verb: 'Dust', label: 'Li hing {b}', a: 'li_hing_powder', b: { fn: ( s, d ) => !! LI_HING[ d.id ] }, use: { a: ONE, b: 0 }, time: 3, sound: 'tear',
		check: ( c ) => c.B.food?.opener && ! c.b.data.open ? 'Open it first' : rotten( c.b, c.B ) ? 'Too far gone' : null,
		run: ( c ) => {
			const ct = contribution( c.b, c.B );
			const dish = { kcal: ct.kcal, water: ct.water, fun: { unhappy: - 6, boredom: - 3, stress: 0 }, sick: ct.sick, raw: 0, spice: 1, cooked: true, mul: 1 };
			c.replace( c.b, 'li_hing_fruit', { dish, name: 'Li hing ' + LI_HING[ c.B.id ], age: ageFor( c.b, c.B, 'li_hing_fruit' ) } );
		} },
	// shoyu on raw fish: poke (an ahi makes several)
	{ id: 'make_poke', verb: 'Make poke', label: 'Make poke', a: 'shoyu', b: { ids: [ 'raw_ahi', 'raw_fish', 'raw_mahimahi', 'raw_ulua', 'raw_tako' ] }, use: { a: ONE, b: 0 },
		tools: [ 'cut' ], time: 8, sound: 'tear', skill: 'cooking', xp: 3,
		check: ( c ) => rotten( c.b, c.B ) ? 'Too far gone' : null,
		run: ( c ) => {
			const n = Math.max( 1, Math.min( 4, Math.round( c.B.food.kcal / 300 ) ) ), tako = c.B.id === 'raw_tako';
			c.consume( c.b, { qty: 1 } );
			c.give( 'poke', n, tako ? { name: 'Tako poke' } : null );
		} },
	// a cracked coconut grated and squeezed: coconut milk
	{ id: 'grate_coconut', verb: 'Grate', label: 'Grate coconut', a: { tool: 'grater' }, b: 'coconut_open', use: { a: 0, b: 1 }, wear: { a: 0.01 },
		out: [ 'coconut_milk', 1, { open: true } ], time: 12, sound: 'tear', skill: 'cooking', xp: 2 },
	// chilies steeped in a bottle of water with salt: chili pepper water
	{ id: 'chili_water', verb: 'Steep', label: 'Make chili pepper water', a: 'chili_peppers', b: { fn: ( s, d ) => [ 'empty_bottle', 'water_bottle' ].includes( d.id ) && holding( d.id, 0.4, [ 'water' ] )( s, d ) },
		use: { a: 2, b: 0 }, time: 6, sound: 'pour', skill: 'cooking', xp: 2,
		check: ( c ) => carried( c, isSalt ) ? null : 'Need salt',
		run: ( c ) => { const salt = carried( c, isSalt ); if ( salt ) useOne( c, salt ); c.replace( c.b, 'chili_pepper_water', {} ); } },

	// ---- desserts in a pot at a fire ----
	{ id: 'make_haupia', verb: 'Cook', label: 'Make haupia', a: { fn: isSugar }, b: 'coconut_milk', use: { a: ONE, b: { qty: 1 } }, tools: [ 'pot' ], station: 'fire',
		out: [ 'haupia', 1 ], time: 15, sound: 'sizzle', skill: 'cooking', xp: 6,
		check: ( c ) => c.b.data.open ? null : 'Open it first' },
	{ id: 'make_kulolo', verb: 'Cook', label: 'Make kulolo', a: { ids: [ 'taro', 'cooked_taro' ] }, b: 'coconut_milk', use: { a: 1, b: { qty: 1 } }, tools: [ 'pot' ], station: 'fire',
		out: [ 'kulolo', 1 ], time: 25, sound: 'sizzle', skill: 'cooking', xp: 8,
		check: ( c ) => ! c.b.data.open ? 'Open it first' : carried( c, isSugar ) ? null : 'Need sugar',
		run: ( c ) => { const s = carried( c, isSugar ); if ( s ) useOne( c, s ); } },
	{ id: 'make_butter_mochi', verb: 'Bake', label: 'Bake butter mochi', a: 'mochiko', b: 'coconut_milk', use: { a: { qty: 1 }, b: { qty: 1 } }, tools: [ 'pot' ], station: 'fire',
		out: [ 'butter_mochi', 1 ], time: 25, sound: 'sizzle', skill: 'cooking', xp: 8,
		check: ( c ) => ! c.b.data.open ? 'Open it first' : ! carried( c, isSugar ) ? 'Need sugar' : ! carried( c, ( s, d ) => d.id === 'eggs' ) ? 'Need an egg' : null,
		run: ( c ) => { const s = carried( c, isSugar ); if ( s ) useOne( c, s ); const e = carried( c, ( x, d ) => d.id === 'eggs' ); if ( e ) c.consume( e, { qty: 1 } ); } },
	{ id: 'make_mac_salad', verb: 'Cook', label: 'Make mac salad', a: 'mayo', b: 'macaroni', use: { a: ONE, b: { qty: 1 } }, tools: [ 'pot' ], station: 'fire',
		liquid: { kind: [ 'water', 'dirty' ], litres: 1 }, out: [ 'mac_salad', 2 ], time: 15, sound: 'sizzle', skill: 'cooking', xp: 5 },

	// ---- kukui nuts roasted in a pan with salt: ʻinamona (raw, the nuts purge you) ----
	{ id: 'roast_inamona', verb: 'Roast', label: 'Roast ʻinamona', a: 'kukui_nuts', b: { fn: isSalt }, use: { a: 3, b: ONE }, station: 'fire',
		out: [ 'inamona', 1 ], time: 12, sound: 'sizzle', skill: 'cooking', xp: 4,
		check: ( c ) => carried( c, ( s, d ) => isPan( s, d ) && ! s.data?.items?.length ) ? null : 'Need a pan' },
	// ---- malasadas: flour, sugar and an egg fried in oil ----
	{ id: 'fry_malasadas', verb: 'Fry', label: 'Fry malasadas', a: 'flour', b: { fn: isPan }, use: { a: ONE, b: 0 }, station: 'fire',
		out: [ 'malasada', 3 ], time: 15, sound: 'sizzle', skill: 'cooking', xp: 6,
		check: ( c ) => {
			const w = c.use?.where?.( c.b );
			if ( w?.kind === 'weapon' || w?.kind === 'equip' ) return 'Put it in a bag first';
			return ! carried( c, isOil ) ? 'Need cooking oil' : ! carried( c, isSugar ) ? 'Need sugar' : ! carried( c, ( s, d ) => d.id === 'eggs' ) ? 'Need an egg' : null;
		},
		run: ( c ) => {
			useOne( c, carried( c, isSugar ) );
			c.consume( carried( c, ( s, d ) => d.id === 'eggs' ), { qty: 1 } );
			const oil = carried( c, isOil );
			oil.data.splash = ( oil.data.splash ?? OIL_SPLASH ) - 1;
			if ( oil.data.splash <= 0 ) c.consume( oil, { qty: 1 } );
		} },
	// ---- lilikoʻi butter: the fruit cooked down with sugar and an egg ----
	{ id: 'make_lilikoi_butter', verb: 'Cook', label: 'Make lilikoʻi butter', a: 'lilikoi', b: { fn: isSugar }, use: { a: 4, b: ONE }, tools: [ 'pot' ], station: 'fire',
		out: [ 'lilikoi_butter', 1 ], time: 15, sound: 'sizzle', skill: 'cooking', xp: 5,
		check: ( c ) => carried( c, ( s, d ) => d.id === 'eggs' ) ? null : 'Need an egg',
		run: ( c ) => c.consume( carried( c, ( s, d ) => d.id === 'eggs' ), { qty: 1 } ) },

	// ---- rice: a cooker makes more of a bag than a pot does ----
	{ id: 'rice_cooker', verb: 'Cook rice', label: 'Cook rice', a: 'rice_bag', b: 'rice_cooker', use: { a: 0, b: 0 }, liquid: { kind: [ 'water', 'dirty' ], litres: 1 },
		time: 30, sound: 'sizzle', skill: 'cooking', xp: 6,
		check: ( c ) => powered( c.game ) || c.game.nearFire?.( c.player.pos ) ? null : 'Needs power or a fire',
		run: ( c ) => {
			const P = c.A.food.portions || 1, k = ( c.a.data.left ?? P ) / P;
			c.consume( c.a, { qty: 1 } );
			c.give( 'cooked_rice', Math.max( 1, Math.round( RICE_COOKER * k ) ) );
		} },
] );

// what pickles (and the name it gives)
const PICKLE = { onion: 'onion', cabbage: 'cabbage', chili_peppers: 'chili', ginger: 'ginger', garlic: 'garlic', mango: 'mango', papaya: 'papaya', tomato: 'tomato', limu: 'limu', green_onion: 'green onion' };
function pickleName( ids ) {
	if ( ids.includes( 'cabbage' ) && ids.includes( 'chili_peppers' ) ) return 'Kim chee';
	const names = [ ...new Set( ids.map( id => PICKLE[ id ] ).filter( Boolean ) ) ];
	return 'Pickled ' + ( names.length > 1 ? names.slice( 0, -1 ).join( ', ' ) + ' and ' + names[ names.length - 1 ] : names[ 0 ] || 'vegetables' );
}
// fruit li hing powder goes on (and what to call it)
const LI_HING = { mango: 'mango', pineapple: 'pineapple', guava: 'guava', lilikoi: 'lilikoʻi', papaya: 'papaya', lychee: 'lychee', mountain_apple: 'mountain apple',
	orange: 'orange', dried_mango: 'mango', canned_pineapple: 'pineapple', canned_peaches: 'peaches', mango_green: 'mango' };

// a generator or another powered placeable nearby (the tech domain's; read defensively)
export function powered( g ) {
	const P = g?.placeables;
	if ( ! P?.near || ! g.player?.pos ) return false;
	return P.near( g.player.pos, 12 ).some( ( p ) => ( p.kind === 'generator' || p.data?.power ) && ( p.data?.on || p.data?.running || p.data?.power > 0 ) );
}

// ======================================================================================================================
// recipes (the crafting panel)
// ======================================================================================================================

addRecipes( [
	R( 'spam_musubi', 'Spam musubi', [ 'spam_musubi', 3 ], [ [ 'spam', 1 ], [ 'cooked_rice', 1 ], [ 'nori', 1 ] ], { tools: [ 'cut' ], time: 12, cat: 'food', skill: 'cooking', xp: 4 } ),
	R( 'spam_musubi_mold', 'Spam musubi (mold)', [ 'spam_musubi', 4 ], [ [ 'spam', 1 ], [ 'cooked_rice', 1 ], [ 'nori', 1 ] ], { tools: [ 'cut', 'musubi mold' ], time: 10, cat: 'food', skill: 'cooking', xp: 4 } ),
	R( 'lomi_salmon', 'Lomi salmon', [ 'lomi_salmon', 2 ], [ [ 'salted_salmon', 1 ], [ 'tomato', 2 ], [ 'onion', 1 ] ], { tools: [ 'cut' ], time: 12, cat: 'food', skill: 'cooking', xp: 4 } ),
	R( 'laulau_pork', 'Laulau (pork)', [ 'laulau_raw', 2 ], [ [ 'raw_boar', 1 ], [ 'luau_leaves', 2 ], [ 'ti_leaves', 4 ] ], { tools: [ 'cut' ], time: 15, cat: 'food', skill: 'cooking', xp: 5 } ),
	R( 'laulau_fish', 'Laulau (fish)', [ 'laulau_raw', 2 ], [ [ 'salt_fish', 1 ], [ 'luau_leaves', 2 ], [ 'ti_leaves', 4 ] ], { tools: [ 'cut' ], time: 15, cat: 'food', skill: 'cooking', xp: 5 } ),
	R( 'plate_lunch', 'Plate lunch', [ 'plate_lunch', 2 ], [ [ 'cooked_rice', 2 ], [ 'mac_salad', 1 ], [ 'kalua_pig', 1 ] ], { time: 6, cat: 'food', skill: 'cooking', xp: 3 } ),
] );

// ======================================================================================================================
// eating a dish: what went into it (hooks.js); the pot, pan, bowl or jar comes back with the last portion
// ======================================================================================================================

function giveVessel( use, v ) {
	if ( ! v?.id || ! getItem( v.id ) ) return null;
	const s = makeStack( v.id, 1 );
	s.cond = v.cond ?? 1;
	if ( use.inv.add( s ) > 0 ) use.game.dropStack( s );
	use.inv.changed();
	return s;
}

addEatHook( ( stack, def, k, use ) => {
	const D = stack.data?.dish;
	if ( ! D ) return;
	eatDish( D, k, use.S, use.skills?.level?.( 'cooking' ) || 0 );
	if ( D.vessel && ( stack.data.left ?? def.food.portions ?? 1 ) <= 1 ) giveVessel( use, D.vessel );
} );

// ======================================================================================================================
// verbs
// ======================================================================================================================

export const SNOW_Y = 668; // m: snow lies on the summits of Mauna Kea and Mauna Loa above this (Terrain.js)
export const onSnow = ( g ) => ( g.player?.pos?.y ?? 0 ) > SNOW_Y && ! g.world?.isIndoors?.( g.player.pos );

// at the water's edge on rock (not sand): where ʻopihi cling
export function atRockyShore( g ) {
	const p = g.player?.pos, hf = g.hf;
	if ( ! p || ! hf || g.player.vehicle || g.player.swimming ) return false;
	const wl = g.physics?.waterLevel?.( p.x, p.z ) ?? 0;
	if ( p.y > wl + 3 || p.y < wl - 0.5 || g.world?.isBeach?.( p.x, p.z ) ) return false;
	for ( let i = 0; i < 8; i ++ ) {
		const a = i / 8 * Math.PI * 2;
		if ( hf.heightAt( p.x + Math.cos( a ) * 2.5, p.z + Math.sin( a ) * 2.5 ) < wl - 0.1 ) return true;
	}
	return false;
}
// each stretch of rock is picked clean for a day
const picked = new Map();
const OPIHI_PATCH = 16;

// cook a pot or pan dish at the fire
export function cookDishStack( use, stack ) {
	const g = use.game, d = getItem( stack.id ), D = stack.data?.dish;
	if ( ! D || ! isRawDish( d.id ) ) return false;
	if ( ! g.nearFire?.( g.player.pos ) ) { g.toast( 'Need a fire', 'warn' ); return false; }
	const level = use.skills?.level?.( 'cooking' ) || 0;
	use.timed( `Cooking ${dishName( D ).replace( /^Uncooked /, '' )}`, Math.min( 25, 10 + D.ids.length * 2 ) * ( 1 - 0.03 * level ), 'sizzle', () => {
		if ( ! use.exists( stack ) || ! g.nearFire?.( g.player.pos ) ) return;
		const fresh = 1 - ( stack.data.age || 0 ) / ( d.food.spoil || 1 );
		cookDish( D, level );
		D.fresh = Math.max( 0, fresh );
		const B = BASES[ D.base ], out = getItem( B.done );
		const data = dishData( D, out );
		use.transform( stack, B.done, data );
		use.xp( 'cooking', 4 + Math.round( D.ids.length * 1.5 ) );
		// a dish it knows, made for the first time
		const key = 'dish:' + ( D.named || '' );
		if ( D.named && use.skills && ! use.skills.knows( key ) ) { use.skills.learn( key ); use.xp( 'cooking', 8 ); g.toast( `New dish: ${D.named}`, 'good' ); }
	} );
	return true;
}

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, use = ctx.use;
	if ( ! g || ! use ) return;
	const D = stack.data?.dish;
	// ---- dishes ----
	if ( D && isRawDish( def.id ) && g.nearFire?.( g.player.pos ) ) ctx.first( 'Cook', () => cookDishStack( use, stack ) );
	if ( D?.vessel && getItem( D.vessel.id ) && ( isDish( def.id ) || def.id === 'pickled_vegetables' ) ) {
		ctx.add( 'Empty out', () => use.timed( 'Emptying', 2, 'pour', () => {
			if ( ! use.exists( stack ) ) return;
			const s = use.transform( stack, D.vessel.id, {} );
			if ( s ) s.cond = D.vessel.cond ?? 1;
		} ) );
	}
	// ---- a pot of seawater boiled dry: sea salt ----
	if ( provides( stack, 'pot' ) && stack.data?.liquid === 'sea' && ( stack.data.amount || 0 ) >= 0.5 && g.nearFire?.( g.player.pos ) ) {
		ctx.add( 'Boil down to salt', () => use.timed( 'Boiling down', 20, 'sizzle', () => {
			if ( ! use.exists( stack ) || stack.data.liquid !== 'sea' ) return;
			const L = stack.data.amount || 0;
			stack.data.amount = 0; stack.data.liquid = null;
			const s = makeStack( 'sea_salt', 1 );
			// a litre gives a full bag; less, a part of one
			if ( L < 0.95 ) s.data.left = Math.max( 1, Math.round( L * 10 ) );
			if ( use.inv.add( s ) > 0 ) g.dropStack( s );
			use.xp( 'cooking', 3 );
			use.changed( use.where( stack ) );
		} ) );
	}
	// ---- a blade at a rocky shore: ʻopihi off the rocks (a wave may knock you down) ----
	if ( provides( stack, 'cut' ) && def.cat !== 'firearm' && atRockyShore( g ) ) {
		const p = g.player.pos, key = Math.floor( p.x / OPIHI_PATCH ) + ',' + Math.floor( p.z / OPIHI_PATCH );
		if ( ! ( g.time.hours - ( picked.get( key ) ?? - 99 ) < 24 ) ) ctx.add( 'Pick ʻopihi', () => use.timed( 'Picking ʻopihi', 6, 'tear', () => {
			picked.set( key, g.time.hours );
			const lv = g.skills?.level?.( 'foraging' ) || 0;
			const n = Math.floor( Math.random() * ( 3 + lv * 0.3 ) );
			if ( Math.random() < 0.12 ) {
				g.survival?.hurt?.( 4, 'fall', { cause: 'wave' } );
				if ( g.survival ) g.survival.wet = 1;
				g.toast( 'Knocked down by a wave', 'warn' );
			}
			if ( n > 0 ) { use.give( 'opihi', n ); g.toast( `${n} ʻopihi`, 'good' ); } else g.toast( 'None here', 'info' );
			use.wear( stack, 0.01 );
			use.xp( 'foraging', 2 + n );
		} ) );
	}
	// ---- the summits' snow: refreeze a freezer pack, or a snow cone ----
	if ( onSnow( g ) ) {
		if ( def.chill && ! def.chill.melts && coldLeft( stack, def ) < 0.98 ) ctx.add( 'Pack in snow', () => use.timed( 'Packing snow', 6, null, () => {
			if ( use.exists( stack ) ) { freeze( stack ); use.changed( use.where( stack ) ); g.toast( 'Frozen', 'good' ); }
		} ) );
		if ( def.id === 'shave_ice_syrup' ) ctx.add( 'Make snow cone', () => use.timed( 'Scooping snow', 4, 'pour', () => {
			if ( ! use.exists( stack ) ) return;
			const left = ( stack.data.left ?? def.food.portions ) - 1;
			if ( left <= 0 ) use.consumeOne( stack ); else { stack.data.left = left; use.changed( use.where( stack ) ); }
			use.give( 'shave_ice', 1 );
		} ) );
	}
	// ---- a shovel digs an imu ----
	if ( provides( stack, 'dig' ) && g.placeables?.beginPlace && ! g.player?.vehicle ) {
		ctx.add( 'Dig imu', () => g.placeables.beginPlace( stack, { kind: 'imu', keep: true, name: 'Imu', spec: { soft: true, outdoors: true, verb: 'Dig', gerund: 'Digging', time: 10, stamina: 30, wear: 0.02 } } ) );
	}
	// ---- a rice cooker cooks the rice you carry ----
	if ( def.id === 'rice_cooker' && g.combine ) {
		const rice = ctx.inv.find( ( s ) => s.id === 'rice_bag' );
		const combo = getCombo( 'rice_cooker' );
		if ( rice && combo ) ctx.add( 'Cook rice', () => g.combine.run( combo, rice, stack ) );
	}
} );

// what the tests and the preview read
export const KITCHEN = { PICKLE, LI_HING, pickleName, recognise };
