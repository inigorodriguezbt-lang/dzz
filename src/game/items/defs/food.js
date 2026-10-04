// Food and drinks. Island pantry staples (Spam, saimin, rice, poi, pilot crackers), plate-lunch counter food,
// fruit off the trees, hunted and fished meat, and everything in a convenience-store cooler.
//
// Units: `food.kcal` feeds hunger at 20 kcal per point (100 = full); `food.water` / `drink.water` are thirst
// points (a 355 ml soda is ~20). `spoil` is game hours from fresh to rotten (0 = never). Stackable items
// (stack > 1) take `size` volume for a full stack. `opener`: true = a can opener or a blade, 'cut' = a blade.
// `opensTo` (ours): an opened item replaces the stack (a cracked coconut). `portions` are eaten one at a time.
// `unpack` (ours): [ id, qty ] contents an MRE is opened into.
import { defineItems } from '../ItemDB.js';

// ---- helpers --------------------------------------------------------------------------------------------

function food( id, name, o ) {
	return {
		id, name, cat: 'food', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'food', ...( o.tags || [] ) ], model: o.model, opensTo: o.opensTo, unpack: o.unpack,
		food: {
			kcal: o.kcal ?? 0, water: o.water ?? 0, spoil: o.spoil ?? 0, opener: o.opener ?? false, raw: !! o.raw,
			sick: o.sick ?? 0, cooked: o.cooked || null, portions: o.portions ?? 1,
		},
	};
}
function drink( id, name, o ) {
	return {
		id, name, cat: 'drink', desc: o.desc || '', weight: o.w ?? 0.4, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'drink', ...( o.tags || [] ) ], model: o.model,
		drink: {
			water: o.water ?? 20, kcal: o.kcal ?? 0, alcohol: o.alcohol ?? 0, caffeine: o.caffeine ?? 0,
			container: o.container || null, sick: o.sick ?? 0, portions: o.portions ?? 1,
		},
	};
}

// printed can label: brand line, product line, a glyph and a coloured band
const L = ( text, sub, bg, fg, band, glyph, style = 'band', extra = {} ) => ( { text, sub, bg, fg, band, glyph, style, ...extra } );
const can = ( label, o = {} ) => ( { type: 'can', label, ...o } );
const soda = ( label, o = {} ) => ( { type: 'can', style: 'soda', r: 0.033, h: 0.122, rep: 1, label, ...o } );
const bag = ( size, label, o = {} ) => ( { type: 'bag', size, label, ...o } );
const box = ( size, label, o = {} ) => ( { type: 'box', size, label, ...o } );
const fruit = ( kind, o = {} ) => ( { type: 'fruit', kind, ...o } );
const dish = ( kind, o = {} ) => ( { type: 'dish', kind, ...o } );

// raw + cooked pairs for meat and fish; the cooked one is what a fire turns the raw one into
function meatPair( key, name, o ) {
	return [
		food( 'raw_' + key, 'Raw ' + name, { w: o.w, size: o.size ?? 2, kcal: o.kcal * 0.8, water: 4, spoil: o.spoilRaw ?? 30, raw: true, sick: o.sickRaw ?? 0.15,
			cooked: 'cooked_' + key, tags: [ 'meat', 'raw', ...( o.tags || [] ) ], rarity: o.rarity, model: { ...o.model, cooked: false }, desc: o.desc } ),
		food( 'cooked_' + key, 'Cooked ' + name, { w: o.w * 0.8, size: o.size ?? 2, kcal: o.kcal, water: 2, spoil: o.spoilCooked ?? 60,
			tags: [ 'meat', 'cooked', ...( o.tags || [] ) ], rarity: o.rarity, model: { ...o.model, cooked: true }, desc: o.descCooked } ),
	];
}

defineItems( [
	// ================= tins and cans =================
	food( 'spam', 'Spam', { w: 0.34, kcal: 1020, water: 2, opener: false, portions: 3, tags: [ 'canned', 'kitchen', 'grocery', 'convenience', 'military' ],
		model: { type: 'tin', size: [ 0.1, 0.078, 0.06 ], taper: 0.97, label: L( 'KAUKAU', 'LUNCHEON MEAT · CLASSIC', 0x1d3a7a, 0xf2d21a, 0xf2d21a, null, 'split', { accent: 0xd02a2a, textColor: 0xf2d21a, size: 0.34 } ) } } ),
	food( 'spam_teriyaki', 'Spam (teriyaki)', { w: 0.34, kcal: 1000, water: 2, portions: 3, rarity: 'uncommon', tags: [ 'canned', 'kitchen', 'grocery' ],
		model: { type: 'tin', size: [ 0.1, 0.078, 0.06 ], taper: 0.97, label: L( 'KAUKAU', 'LUNCHEON MEAT · TERIYAKI', 0x5a2a1a, 0xf2d21a, 0xf2d21a, null, 'split', { accent: 0x1d3a7a, textColor: 0xf2d21a, size: 0.34 } ) } } ),
	food( 'corned_beef', 'Corned beef', { w: 0.34, kcal: 750, water: 2, opener: false, portions: 2, tags: [ 'canned', 'kitchen', 'grocery' ],
		model: { type: 'tin', size: [ 0.09, 0.1, 0.065 ], taper: 0.86, key: true, label: L( 'CORNED BEEF', 'Product of Brazil', 0xd02a2a, 0xffffff, 0xf2d21a, 'cow', 'band', { glyphColor: 0x5a1a10 } ) } } ),
	food( 'vienna_sausage', 'Vienna sausage', { w: 0.13, size: 0.5, stack: 4, kcal: 280, water: 3, opener: false, tags: [ 'canned', 'grocery', 'convenience', 'kitchen' ],
		model: can( L( 'VIENNA', 'Sausage in chicken broth', 0xf2f0e6, 0xc0282a, 0xc0282a, 'meat', 'band' ), { r: 0.034, h: 0.058, rep: 2 } ) } ),
	food( 'canned_tuna', 'Canned tuna', { w: 0.17, size: 0.5, stack: 4, kcal: 190, water: 5, opener: true, tags: [ 'canned', 'grocery', 'kitchen', 'convenience', 'fish' ],
		model: can( L( 'ALOHA BAY', 'Chunk light tuna', 0x1a6ab8, 0xffffff, 0xf2f2f2, 'fish', 'band', { glyphColor: 0x1a6ab8, subColor: 0x1a6ab8 } ), { r: 0.043, h: 0.04, rep: 2 } ) } ),
	food( 'canned_beans', 'Baked beans', { w: 0.45, kcal: 380, water: 10, opener: true, tags: [ 'canned', 'grocery', 'kitchen', 'military' ],
		model: can( L( 'BAKED BEANS', 'in tomato sauce', 0x2a6a3a, 0xf2e6c8, 0xa83a1a, 'bean', 'band', { glyphColor: 0xa85a2a } ) ) } ),
	food( 'canned_peaches', 'Canned peaches', { w: 0.45, kcal: 250, water: 25, opener: true, tags: [ 'canned', 'grocery', 'kitchen' ],
		model: can( L( 'PEACHES', 'Sliced in light syrup', 0xf6e6c8, 0xd86a2a, 0xe89a3a, 'fruit', 'band', { glyphColor: 0xf0a040 } ) ) } ),
	food( 'canned_chili', 'Canned chili', { w: 0.43, kcal: 520, water: 8, opener: true, tags: [ 'canned', 'grocery', 'kitchen' ],
		model: can( L( 'KAIMUKĪ CHILI', 'Beef with beans', 0x8a1a1a, 0xf2d21a, 0x2a1a10, 'star', 'band', { glyphColor: 0xf2d21a } ) ) } ),
	food( 'canned_soup', 'Chicken noodle soup', { w: 0.3, kcal: 180, water: 30, opener: false, tags: [ 'canned', 'grocery', 'kitchen', 'convenience' ],
		model: can( L( 'CHICKEN NOODLE', 'Condensed soup', 0xffffff, 0xc0282a, 0xc0282a, null, 'split', { accent: 0xd8a020, textColor: 0xffffff } ), { h: 0.1 } ) } ),
	food( 'canned_corn', 'Canned corn', { w: 0.43, kcal: 240, water: 15, opener: true, tags: [ 'canned', 'grocery', 'kitchen' ],
		model: can( L( 'SWEET CORN', 'Whole kernel', 0x2a7a3a, 0xf6e04a, 0xf6e04a, 'sun', 'band', { glyphColor: 0xf6d21a } ) ) } ),
	food( 'sardines', 'Sardines', { w: 0.12, size: 0.5, stack: 4, kcal: 200, water: 3, opener: false, tags: [ 'canned', 'grocery', 'kitchen', 'fish' ],
		model: { type: 'tin', size: [ 0.105, 0.028, 0.075 ], key: false, label: L( 'SARDINES', 'in soybean oil', 0x1a4a8a, 0xf2f2f2, 0xd8a020, 'fish', 'band', { glyphColor: 0xd8d8d8 } ) } } ),
	food( 'canned_pineapple', 'Canned pineapple', { w: 0.57, kcal: 280, water: 30, opener: true, tags: [ 'canned', 'grocery', 'kitchen' ],
		model: can( L( 'PINEAPPLE', 'Chunks in juice · Grown in Hawaiʻi', 0xf2d21a, 0x1a4a2a, 0x2a7a3a, 'pineapple', 'band', { glyphColor: 0xc89a2a } ), { r: 0.041, h: 0.115 } ) } ),
	food( 'canned_spaghetti', 'Canned spaghetti', { w: 0.42, kcal: 400, water: 12, opener: false, tags: [ 'canned', 'grocery', 'kitchen' ],
		model: can( L( 'SPAGHETTI RINGS', 'in tomato & cheese sauce', 0xd8402a, 0xffffff, 0xf2c21a, 'dot', 'band', { glyphColor: 0xf2f2f2 } ) ) } ),
	food( 'canned_stew', 'Beef stew', { w: 0.57, kcal: 480, water: 15, opener: true, rarity: 'uncommon', tags: [ 'canned', 'grocery', 'kitchen' ],
		model: can( L( 'BEEF STEW', 'Hearty · Ready to eat', 0x5a3a1a, 0xf2e6c8, 0xa8702a, 'meat', 'band', { glyphColor: 0xc8905a } ), { r: 0.041, h: 0.12 } ) } ),

	// ================= pantry and snacks =================
	food( 'saimin', 'Saimin (instant)', { w: 0.09, size: 1, stack: 3, kcal: 380, water: 0, tags: [ 'snack', 'grocery', 'convenience', 'kitchen' ],
		model: bag( [ 0.17, 0.03, 0.12 ], L( 'SAIMIN', 'Island-style noodle soup', 0xf6e6c8, 0xc0282a, 0xc0282a, 'wave', 'split', { accent: 0x2a6ab8, textColor: 0xc0282a } ), { flat: true } ) } ),
	food( 'cup_noodles', 'Cup noodles', { w: 0.07, size: 1, stack: 2, kcal: 290, water: 0, tags: [ 'snack', 'grocery', 'convenience' ],
		model: { type: 'cup', label: L( 'NOODLE CUP', 'Shrimp flavour', 0xf2f2ee, 0xd02a2a, 0xd02a2a, null, 'split', { accent: 0xf2c21a, textColor: 0xffffff } ) } } ),
	food( 'rice_bag', 'Calrose rice (5 lb)', { w: 2.3, size: 3, kcal: 7500, water: 0, raw: true, sick: 0.3, portions: 10, cooked: 'cooked_rice', tags: [ 'grocery', 'kitchen', 'staple' ],
		model: bag( [ 0.26, 0.34, 0.09 ], L( 'CALROSE', 'Premium medium grain · 5 LB', 0xf6f3ea, 0x1a4a8a, 0x1a4a8a, 'leaf', 'band', { accent: 0xc0282a, glyphColor: 0x3a8a3a } ), { matte: true, crimp: false } ),
		desc: 'Cook in a pot at a fire.' } ),
	food( 'poi', 'Poi', { w: 0.45, kcal: 360, water: 12, spoil: 96, portions: 2, rarity: 'uncommon', tags: [ 'grocery', 'market', 'local' ],
		model: { type: 'jar', r: 0.05, h: 0.075, content: 0xa89ab8, body: 0xc8b8d8, lid: 0xf2f2f2, label: L( 'POI', 'Fresh from Waipiʻo', 0xf2f2f2, 0x5a3a7a, 0x5a3a7a, 'leaf', 'band', { glyphColor: 0x3a7a3a } ) } } ),
	food( 'macadamia_nuts', 'Macadamia nuts', { w: 0.2, size: 1, kcal: 1100, water: 0, portions: 3, tags: [ 'snack', 'grocery', 'convenience', 'tourist', 'local' ],
		model: can( L( 'HĀMĀKUA', 'Dry roasted macadamias', 0x6a3a1a, 0xf2d8a0, 0xf2d8a0, 'bean', 'badge', { bg: 0x6a3a1a, band: 0xf2e6c8, textColor: 0x6a3a1a, glyphColor: 0x8a5a2a } ), { r: 0.042, h: 0.09 } ) } ),
	food( 'chocolate_macnuts', 'Chocolate macadamias', { w: 0.15, size: 1, kcal: 800, water: 0, portions: 2, rarity: 'uncommon', tags: [ 'snack', 'tourist', 'convenience', 'hotel' ],
		model: box( [ 0.16, 0.035, 0.1 ], L( 'CHOCOLATE MACS', 'Milk chocolate · Made in Hawaiʻi', 0x3a1a0e, 0xf2d8a0, 0xd4a64a, 'hibiscus', 'band', { glyphColor: 0xd4a64a } ), { labelAxis: 'y' } ) } ),
	food( 'dried_mango', 'Dried mango', { w: 0.1, size: 1, stack: 2, kcal: 320, water: 0, spoil: 0, tags: [ 'snack', 'grocery', 'convenience', 'local' ],
		model: bag( [ 0.14, 0.2, 0.03 ], L( 'DRIED MANGO', 'Sweet · Chewy', 0xf2a020, 0x5a2a0a, 0x5a2a0a, 'fruit', 'badge', { band: 0xf6d06a, glyphColor: 0xe0602a } ) ) } ),
	food( 'li_hing_mui', 'Li hing mui', { w: 0.06, size: 0.5, stack: 3, kcal: 150, water: 0, tags: [ 'snack', 'convenience', 'grocery', 'local' ],
		model: bag( [ 0.1, 0.15, 0.025 ], L( 'LI HING MUI', 'Crack seed · Dried plum', 0xc0282a, 0xf2f2f2, 0xf2d21a, 'dot', 'badge', { band: 0x8a1a1a, glyphColor: 0x5a1a0a } ) ) } ),
	food( 'crackers', 'Saloon pilot crackers', { w: 0.3, size: 2, kcal: 1300, water: 0, portions: 4, tags: [ 'snack', 'grocery', 'kitchen', 'staple', 'local' ],
		model: box( [ 0.2, 0.15, 0.09 ], L( 'SKIPPER PILOT', 'Island crackers since 1928', 0xf2f2ee, 0xc0282a, 0x1a4a8a, 'star', 'band', { glyphColor: 0x1a4a8a, accent: 0xc0282a } ), { labelAxis: 'z' } ) } ),
	food( 'arare', 'Arare rice crackers', { w: 0.14, size: 1, kcal: 520, water: 0, portions: 2, tags: [ 'snack', 'grocery', 'convenience', 'local' ],
		model: bag( [ 0.16, 0.22, 0.05 ], L( 'ARARE', 'Norimaki mix', 0x1a1a1a, 0xf2c21a, 0xc0282a, 'leaf', 'badge', { band: 0xf2c21a, textColor: 0x1a1a1a, glyphColor: 0x2a5a2a } ) ) } ),
	food( 'potato_chips', 'Potato chips', { w: 0.23, size: 2, kcal: 1200, water: 0, portions: 3, tags: [ 'snack', 'grocery', 'convenience' ],
		model: bag( [ 0.24, 0.32, 0.08 ], L( 'KOʻOLAU CHIPS', 'Kettle-cooked · Sweet onion', 0xf2d21a, 0x5a2a0a, 0xd02a2a, 'wave', 'badge', { band: 0xd02a2a, textColor: 0xffffff, glyphColor: 0xf2f2f2 } ) ) } ),
	food( 'taro_chips', 'Taro chips', { w: 0.14, size: 2, kcal: 700, water: 0, portions: 2, rarity: 'uncommon', tags: [ 'snack', 'grocery', 'convenience', 'local' ],
		model: bag( [ 0.2, 0.28, 0.07 ], L( 'TARO CHIPS', 'Kalo · Sea salt', 0x5a3a7a, 0xf2e6c8, 0xf2e6c8, 'leaf', 'badge', { band: 0x8a6aa8, textColor: 0xffffff, glyphColor: 0x3a7a3a } ) ) } ),
	food( 'candy_bar', 'Candy bar', { w: 0.05, size: 0.5, stack: 6, kcal: 250, water: 0, tags: [ 'snack', 'convenience', 'grocery' ],
		model: { type: 'bar', size: [ 0.13, 0.016, 0.04 ], label: L( 'NUT RUSH', 'Caramel · Peanut', 0x5a2a0a, 0xf2c21a, 0xc0282a, null, 'plain', { size: 0.5 } ) } } ),
	food( 'granola_bar', 'Granola bar', { w: 0.04, size: 0.5, stack: 6, kcal: 190, water: 0, tags: [ 'snack', 'convenience', 'grocery', 'outdoor' ],
		model: { type: 'bar', size: [ 0.11, 0.014, 0.035 ], label: L( 'TRAIL MIX BAR', 'Oats & honey', 0x3a7a3a, 0xf2e6c8, 0xd8a020, null, 'plain', { size: 0.46 } ) } } ),
	food( 'energy_bar', 'Energy bar', { w: 0.06, size: 0.5, stack: 6, kcal: 260, water: 0, rarity: 'uncommon', tags: [ 'snack', 'convenience', 'sports', 'outdoor' ],
		model: { type: 'bar', size: [ 0.12, 0.016, 0.038 ], label: L( 'POWER UP', 'Protein 20g', 0x1a1a1a, 0xf2c21a, 0xf2c21a, 'bolt', 'plain', { size: 0.46, glyphColor: 0xf2c21a } ) } } ),
	food( 'cereal', 'Breakfast cereal', { w: 0.4, size: 3, kcal: 1500, water: 0, portions: 4, tags: [ 'grocery', 'kitchen' ],
		model: box( [ 0.2, 0.28, 0.07 ], L( 'NIU FLAKES', 'Toasted coconut cereal', 0xf2a020, 0x5a2a0a, 0xc0282a, 'palm', 'split', { accent: 0xffffff, textColor: 0x5a2a0a, glyphColor: 0x2a6a2a } ) ) } ),
	food( 'peanut_butter', 'Peanut butter', { w: 0.5, size: 1, kcal: 2800, water: 0, portions: 6, tags: [ 'grocery', 'kitchen' ],
		model: { type: 'jar', r: 0.045, h: 0.12, content: 0xb8783a, lid: 0xc0282a, clear: true, label: L( 'PEANUT BUTTER', 'Creamy', 0xf2e6c8, 0xc0282a, 0xc0282a, 'bean', 'band', { glyphColor: 0x8a5a2a } ) } } ),
	food( 'honey', 'Ōhiʻa honey', { w: 0.35, size: 1, kcal: 1000, water: 2, portions: 4, rarity: 'uncommon', tags: [ 'grocery', 'market', 'local', 'farm' ],
		model: { type: 'jar', r: 0.036, h: 0.11, content: 0xe8b830, lid: 0xd4a64a, clear: true, lidMetal: true, label: L( 'LEHUA HONEY', 'Raw · Big Island', 0xf2e6c8, 0x6a3a0a, 0x6a3a0a, 'flower', 'badge', { band: 0xd8a020, glyphColor: 0xd02a2a } ) } } ),
	food( 'pickled_mango', 'Pickled mango', { w: 0.5, size: 1, kcal: 220, water: 10, portions: 2, rarity: 'uncommon', tags: [ 'grocery', 'market', 'local' ],
		model: { type: 'jar', r: 0.045, h: 0.13, content: 0xe8a040, lid: 0xf2f2f2, clear: true, label: L( 'PICKLED MANGO', 'Auntie\'s recipe', 0xf2f2ee, 0xd06a2a, 0xd06a2a, 'fruit', 'plain', { glyphColor: 0xe08a2a } ) } } ),
	food( 'beef_jerky', 'Beef jerky', { w: 0.1, size: 1, stack: 2, kcal: 400, water: 0, tags: [ 'snack', 'convenience', 'grocery', 'outdoor' ],
		model: bag( [ 0.15, 0.22, 0.03 ], L( 'PIPIKAULA', 'Hawaiian-style beef jerky', 0x5a1a0a, 0xf2d8a0, 0x1a1a1a, 'meat', 'badge', { band: 0xa83a1a, textColor: 0xf2d8a0, glyphColor: 0x3a1a0a } ) ) } ),
	food( 'fish_jerky', 'Dried aku', { w: 0.08, size: 1, stack: 2, kcal: 260, water: 0, rarity: 'uncommon', tags: [ 'snack', 'market', 'local', 'fish' ],
		model: bag( [ 0.15, 0.22, 0.03 ], L( 'DRIED AKU', 'Sun-dried skipjack', 0x1a4a6a, 0xf2e6c8, 0xf2e6c8, 'fish', 'badge', { band: 0x2a7aa8, textColor: 0xffffff, glyphColor: 0x1a3a5a } ) ) } ),
	food( 'mre', 'MRE', { w: 0.65, size: 2, kcal: 1250, water: 0, portions: 2, rarity: 'rare', tags: [ 'military', 'ration' ],
		unpack: [ [ 'mre_entree', 1 ], [ 'granola_bar', 1 ], [ 'candy_bar', 1 ], [ 'electrolyte_mix', 1 ] ],
		model: bag( [ 0.25, 0.05, 0.18 ], L( 'MEAL, READY-TO-EAT', 'MENU 9 · CHILI & MAC', 0x8a7a55, 0x2a2418, 0x2a2418, null, 'military', { size: 0.16 } ), { flat: true, matte: true } ),
		desc: 'Unpack for contents.' } ),
	food( 'mre_entree', 'MRE entrée', { w: 0.25, size: 1, kcal: 650, water: 4, rarity: 'uncommon', tags: [ 'military', 'ration' ],
		model: { type: 'bar', size: [ 0.18, 0.02, 0.13 ], matte: true, label: L( 'CHILI WITH MACARONI', 'ENTRÉE', 0x6a5a3a, 0x1a1a10, 0x1a1a10, null, 'military', { size: 0.2 } ) } } ),

	// ================= fruit and produce =================
	food( 'pineapple', 'Pineapple', { w: 1.6, size: 3, kcal: 450, water: 45, spoil: 168, opener: 'cut', portions: 3, tags: [ 'fruit', 'fresh', 'market', 'farm', 'grocery' ],
		model: fruit( 'pineapple' ), desc: 'Cut open with a blade.' } ),
	food( 'coconut', 'Coconut', { w: 1.2, size: 3, kcal: 0, water: 0, spoil: 0, opener: 'cut', opensTo: 'coconut_open', tags: [ 'fruit', 'fresh', 'beach', 'farm' ],
		model: fruit( 'coconut' ), desc: 'Crack open with a blade.' } ),
	food( 'coconut_open', 'Cracked coconut', { w: 0.9, size: 3, kcal: 380, water: 35, spoil: 36, portions: 2, tags: [ 'fruit', 'fresh' ],
		model: fruit( 'coconut_open' ), desc: 'Spoils within a day.' } ),
	food( 'banana', 'Banana', { w: 0.13, size: 2, stack: 6, kcal: 105, water: 6, spoil: 110, tags: [ 'fruit', 'fresh', 'market', 'grocery', 'farm' ],
		model: fruit( 'banana' ) } ),
	food( 'mango', 'Mango', { w: 0.35, size: 1, stack: 2, kcal: 200, water: 15, spoil: 140, tags: [ 'fruit', 'fresh', 'market', 'farm', 'grocery' ],
		model: fruit( 'mango' ) } ),
	food( 'papaya', 'Papaya', { w: 0.45, size: 1, stack: 2, kcal: 120, water: 20, spoil: 110, tags: [ 'fruit', 'fresh', 'market', 'farm', 'grocery' ],
		model: fruit( 'papaya' ) } ),
	food( 'guava', 'Guava', { w: 0.1, size: 1, stack: 6, kcal: 70, water: 8, spoil: 110, tags: [ 'fruit', 'fresh', 'farm', 'wild' ],
		model: fruit( 'guava' ) } ),
	food( 'lilikoi', 'Lilikoʻi', { w: 0.05, size: 1, stack: 8, kcal: 35, water: 5, spoil: 200, tags: [ 'fruit', 'fresh', 'farm', 'wild', 'market' ],
		model: fruit( 'lilikoi' ) } ),
	food( 'lychee', 'Lychee', { w: 0.1, size: 1, stack: 10, kcal: 60, water: 6, spoil: 120, rarity: 'uncommon', tags: [ 'fruit', 'fresh', 'market', 'farm' ],
		model: fruit( 'lychee' ) } ),
	food( 'mountain_apple', 'Mountain apple', { w: 0.1, size: 1, stack: 6, kcal: 40, water: 10, spoil: 72, rarity: 'uncommon', tags: [ 'fruit', 'fresh', 'wild' ],
		model: fruit( 'mountain_apple' ) } ),
	food( 'avocado', 'Avocado', { w: 0.4, size: 1, stack: 3, kcal: 320, water: 8, spoil: 160, tags: [ 'fruit', 'fresh', 'market', 'farm', 'grocery' ],
		model: fruit( 'avocado' ) } ),
	food( 'orange', 'Kaʻū orange', { w: 0.2, size: 1, stack: 4, kcal: 70, water: 12, spoil: 300, tags: [ 'fruit', 'fresh', 'market', 'farm', 'grocery' ],
		model: fruit( 'orange' ) } ),
	food( 'breadfruit', 'Breadfruit (ʻulu)', { w: 1.5, size: 3, kcal: 350, water: 10, spoil: 96, raw: true, sick: 0.25, cooked: 'cooked_breadfruit', portions: 2, tags: [ 'fresh', 'farm', 'wild', 'market' ],
		model: fruit( 'breadfruit' ) } ),
	food( 'taro', 'Taro root (kalo)', { w: 0.8, size: 2, stack: 2, kcal: 300, water: 5, spoil: 300, raw: true, sick: 0.8, cooked: 'cooked_taro', tags: [ 'fresh', 'farm', 'market' ],
		model: fruit( 'taro' ), desc: 'Toxic raw.' } ),
	food( 'sweet_potato', 'Sweet potato (ʻuala)', { w: 0.35, size: 1, stack: 3, kcal: 180, water: 5, spoil: 400, raw: true, sick: 0.1, cooked: 'cooked_sweet_potato', tags: [ 'fresh', 'farm', 'market', 'grocery' ],
		model: fruit( 'sweet_potato' ) } ),
	food( 'eggs', 'Eggs', { w: 0.06, size: 1, stack: 6, kcal: 75, water: 2, spoil: 330, raw: true, sick: 0.12, cooked: 'cooked_egg', tags: [ 'fresh', 'farm', 'grocery', 'kitchen' ],
		model: fruit( 'egg' ) } ),
	food( 'onion', 'Maui onion', { w: 0.25, size: 1, stack: 3, kcal: 45, water: 4, spoil: 600, tags: [ 'fresh', 'farm', 'market', 'grocery' ],
		model: fruit( 'onion' ) } ),

	// ================= bakery, plate lunch, fresh counter =================
	food( 'sweet_bread', 'Hawaiian sweet bread', { w: 0.45, size: 3, kcal: 1500, water: 0, spoil: 170, portions: 4, tags: [ 'bakery', 'grocery', 'kitchen' ],
		model: dish( 'bread' ) } ),
	food( 'malasada', 'Malasada', { w: 0.08, size: 1, stack: 4, kcal: 270, water: 0, spoil: 60, tags: [ 'bakery', 'restaurant', 'fastfood' ],
		model: dish( 'malasada' ) } ),
	food( 'manapua', 'Manapua', { w: 0.15, size: 1, stack: 3, kcal: 350, water: 2, spoil: 40, tags: [ 'bakery', 'restaurant', 'fastfood', 'convenience' ],
		model: dish( 'manapua' ) } ),
	food( 'butter_mochi', 'Butter mochi', { w: 0.4, size: 2, kcal: 900, water: 2, spoil: 100, portions: 3, rarity: 'uncommon', tags: [ 'bakery', 'kitchen', 'church' ],
		model: dish( 'mochi' ) } ),
	food( 'spam_musubi', 'Spam musubi', { w: 0.15, size: 1, stack: 3, kcal: 290, water: 1, spoil: 30, tags: [ 'convenience', 'fastfood', 'restaurant', 'local' ],
		model: dish( 'musubi' ) } ),
	food( 'plate_lunch', 'Plate lunch', { w: 0.7, size: 3, kcal: 1100, water: 5, spoil: 16, portions: 2, tags: [ 'restaurant', 'fastfood' ],
		model: dish( 'plate', { sticker: 'KALUA PIG' } ) } ),
	food( 'loco_moco', 'Loco moco', { w: 0.6, size: 3, kcal: 950, water: 5, spoil: 14, portions: 2, tags: [ 'restaurant', 'fastfood' ],
		model: dish( 'loco_moco' ) } ),
	food( 'poke', 'Ahi poke', { w: 0.35, size: 1, kcal: 350, water: 6, spoil: 8, sick: 0.05, rarity: 'uncommon', tags: [ 'restaurant', 'market', 'grocery', 'fish' ],
		model: dish( 'bowl', { fill: 0xc0283a, bowl: 0x1a1a1a } ), desc: 'Spoils within hours.' } ),
	food( 'cooked_rice', 'Bowl of rice', { w: 0.3, size: 2, stack: 5, kcal: 400, water: 4, spoil: 20, tags: [ 'cooked', 'kitchen' ],
		model: dish( 'rice' ) } ),

	// ================= cooked produce =================
	food( 'cooked_breadfruit', 'Roasted ʻulu', { w: 1.2, size: 3, kcal: 700, water: 6, spoil: 48, portions: 2, tags: [ 'cooked' ],
		model: fruit( 'breadfruit', { cooked: true } ) } ),
	food( 'cooked_taro', 'Steamed taro', { w: 0.7, size: 2, kcal: 420, water: 4, spoil: 60, tags: [ 'cooked' ],
		model: fruit( 'taro', { cooked: true } ) } ),
	food( 'cooked_sweet_potato', 'Baked sweet potato', { w: 0.3, size: 1, kcal: 200, water: 4, spoil: 72, tags: [ 'cooked' ],
		model: fruit( 'sweet_potato', { cooked: true } ) } ),
	food( 'cooked_egg', 'Boiled egg', { w: 0.06, size: 1, stack: 6, kcal: 80, water: 1, spoil: 96, tags: [ 'cooked' ],
		model: fruit( 'egg', { color: 0xf2eee2 } ) } ),

	// ================= meat and fish (hunting / fishing) =================
	...meatPair( 'boar', 'boar meat', { w: 1.2, size: 3, kcal: 1100, rarity: 'uncommon', model: { type: 'meat', kind: 'chunk', color: 0x9a2a30 }, tags: [ 'hunting' ] } ),
	...meatPair( 'goat', 'goat meat', { w: 1, size: 2, kcal: 900, rarity: 'uncommon', model: { type: 'meat', kind: 'ribs', color: 0xa8323a }, tags: [ 'hunting' ] } ),
	...meatPair( 'venison', 'venison', { w: 1, size: 2, kcal: 850, rarity: 'uncommon', model: { type: 'meat', kind: 'steak', color: 0x8a1e28 }, tags: [ 'hunting' ] } ),
	...meatPair( 'chicken', 'chicken', { w: 0.9, size: 2, kcal: 800, sickRaw: 0.4, model: { type: 'meat', kind: 'chicken' }, tags: [ 'hunting', 'farm' ] } ),
	...meatPair( 'fish', 'reef fish', { w: 0.6, size: 2, kcal: 450, spoilRaw: 18, spoilCooked: 40, sickRaw: 0.08, model: { type: 'fish', len: 0.3, color: 0x3a6a9a, belly: 0xe8eef0, stripe: 0xf2c21a }, tags: [ 'fish', 'fishing' ] } ),
	...meatPair( 'ahi', 'ahi (tuna)', { w: 2.2, size: 4, kcal: 1300, spoilRaw: 18, spoilCooked: 40, sickRaw: 0.04, rarity: 'rare', model: { type: 'fish', len: 0.62, color: 0x1a2a4a, belly: 0xd8dde2, deep: 0.2, stripe: 0xf2d21a }, tags: [ 'fish', 'fishing' ] } ),
	...meatPair( 'mahimahi', 'mahimahi', { w: 1.8, size: 4, kcal: 1000, spoilRaw: 18, spoilCooked: 40, sickRaw: 0.08, rarity: 'rare', model: { type: 'fish', len: 0.58, color: 0x2a8a5a, belly: 0xe8d040, deep: 0.19 }, tags: [ 'fish', 'fishing' ] } ),
	...meatPair( 'ulua', 'ulua (trevally)', { w: 2.5, size: 4, kcal: 1200, spoilRaw: 18, spoilCooked: 40, sickRaw: 0.1, rarity: 'rare', model: { type: 'fish', len: 0.56, color: 0x5a6a78, belly: 0xd8dde2, deep: 0.26 }, tags: [ 'fish', 'fishing' ] } ),
	...meatPair( 'tako', 'tako (octopus)', { w: 0.9, size: 2, kcal: 400, spoilRaw: 20, spoilCooked: 48, sickRaw: 0.1, rarity: 'uncommon', model: { type: 'fish', kind: 'octopus' }, tags: [ 'fish', 'fishing' ] } ),
	...meatPair( 'shark', 'shark meat', { w: 1.8, size: 3, kcal: 1000, spoilRaw: 16, spoilCooked: 40, sickRaw: 0.12, rarity: 'rare', model: { type: 'fish', kind: 'fillet', len: 0.42, color: 0xe0d8d0 }, tags: [ 'fish', 'hunting' ] } ),

	// ================= drinks: cans =================
	drink( 'soda_cola', 'Nalu Cola', { w: 0.37, size: 0.5, water: 20, kcal: 140, caffeine: 40, tags: [ 'soda', 'convenience', 'grocery', 'fastfood', 'vending' ],
		model: soda( L( 'NALU COLA', 'The taste of the tide', 0xc0282a, 0xffffff, 0xffffff, 'wave', 'plain', { glyphColor: 0xffffff, size: 0.28 } ) ) } ),
	drink( 'soda_lemonlime', 'Hanalei Lemon-Lime', { w: 0.37, size: 0.5, water: 22, kcal: 130, tags: [ 'soda', 'convenience', 'grocery', 'vending' ],
		model: soda( L( 'HANALEI', 'Lemon-lime soda', 0x2a9a3a, 0xf2f2a0, 0xf2e04a, 'leaf', 'plain', { glyphColor: 0xf2e04a, size: 0.28 } ) ) } ),
	drink( 'soda_rootbeer', 'Paniolo Root Beer', { w: 0.37, size: 0.5, water: 20, kcal: 150, tags: [ 'soda', 'convenience', 'grocery', 'vending' ],
		model: soda( L( 'PANIOLO', 'Old-fashioned root beer', 0x4a2210, 0xf2d8a0, 0xf2d8a0, 'star', 'plain', { glyphColor: 0xd4a64a, size: 0.28 } ) ) } ),
	drink( 'guava_nectar', 'Guava nectar', { w: 0.37, size: 0.5, water: 22, kcal: 170, tags: [ 'juice', 'convenience', 'grocery', 'vending', 'local' ],
		model: soda( L( 'ISLAND SUN', 'Pink guava nectar', 0xf06a8a, 0xffffff, 0x2a8a3a, 'hibiscus', 'plain', { glyphColor: 0xffffff, size: 0.26 } ) ) } ),
	drink( 'iced_tea', 'Iced tea', { w: 0.37, size: 0.5, water: 22, kcal: 90, caffeine: 30, tags: [ 'convenience', 'grocery', 'vending' ],
		model: soda( L( 'MAUNA TEA', 'Lemon iced tea', 0xf2c21a, 0x5a2a0a, 0x5a2a0a, 'mountain', 'plain', { glyphColor: 0x5a3a1a, size: 0.28 } ) ) } ),
	drink( 'energy_drink', 'Kona Jolt', { w: 0.5, size: 0.5, water: 20, kcal: 110, caffeine: 160, rarity: 'uncommon', tags: [ 'convenience', 'grocery', 'vending', 'gas_station' ],
		model: soda( L( 'KONA KICK', 'Energy · 160 mg', 0x1a1a1a, 0x5aff4a, 0x5aff4a, 'bolt', 'plain', { glyphColor: 0x5aff4a, size: 0.28 } ), { h: 0.155, r: 0.029 } ), desc: 'Restores stamina.' } ),
	drink( 'canned_coffee', 'Iced coffee (can)', { w: 0.28, size: 0.5, water: 14, kcal: 120, caffeine: 110, tags: [ 'convenience', 'grocery', 'vending' ],
		model: soda( L( 'KONA BLEND', 'Iced coffee with milk', 0x3a2214, 0xf2e6c8, 0xd4a64a, 'coffee', 'plain', { glyphColor: 0xd4a64a, size: 0.26 } ), { h: 0.1, r: 0.03 } ), desc: 'Restores energy.' } ),
	drink( 'coconut_water', 'Coconut water', { w: 0.35, size: 0.5, water: 30, kcal: 60, tags: [ 'juice', 'grocery', 'convenience', 'sports' ],
		model: soda( L( 'NIU', '100% coconut water', 0xf2f2ea, 0x2a6a2a, 0x2a6a2a, 'palm', 'plain', { glyphColor: 0x2a6a2a, size: 0.3 } ) ) } ),
	drink( 'beer_can', 'Nalu Lager (can)', { w: 0.37, size: 0.5, water: 16, kcal: 150, alcohol: 0.12, tags: [ 'alcohol', 'bar', 'convenience', 'grocery' ],
		model: soda( L( 'NALU', 'Island lager', 0xf2f2ee, 0x1a3a7a, 0xd8a020, 'wave', 'plain', { glyphColor: 0x1a3a7a, size: 0.3 } ) ) } ),

	// ================= drinks: bottles and cartons =================
	drink( 'sports_drink', 'Sports drink', { w: 0.6, size: 1, water: 38, kcal: 130, container: 'water_bottle', tags: [ 'convenience', 'grocery', 'sports', 'vending' ],
		model: { type: 'bottle', style: 'sports', h: 0.21, r: 0.033, clear: true, liquid: 0x3aa8f2, liquidClear: true, fill: 0.85, cap: 0xf2f2f2, label: L( 'ELECTRO', 'Glacier blue', 0xf2a020, 0x1a1a1a, 0x1a1a1a, 'bolt', 'plain', { glyphColor: 0x1a1a1a } ) } } ),
	drink( 'pog_juice', 'POG juice', { w: 1, size: 2, water: 50, kcal: 280, portions: 2, tags: [ 'juice', 'grocery', 'kitchen', 'school' ],
		model: { type: 'carton', size: [ 0.075, 0.2, 0.075 ], label: L( 'LILINOE', 'Passion · Orange · Guava', 0xf2a020, 0xffffff, 0xe0405a, 'fruit', 'badge', { band: 0xe0405a, textColor: 0xffffff, glyphColor: 0xf2d21a } ) } } ),
	drink( 'lilikoi_juicebox', 'Lilikoʻi juice box', { w: 0.21, size: 0.5, stack: 3, water: 12, kcal: 90, tags: [ 'juice', 'grocery', 'school', 'kitchen' ],
		model: { type: 'carton', gable: false, size: [ 0.055, 0.1, 0.035 ], label: L( 'LILIKOʻI', 'Juice drink', 0xf2d21a, 0x5a2a7a, 0x5a2a7a, 'fruit', 'plain', { glyphColor: 0x6a3a8a, size: 0.22 } ) } } ),
	drink( 'milk', 'Shelf-stable milk', { w: 1, size: 2, water: 45, kcal: 600, portions: 2, tags: [ 'grocery', 'kitchen' ],
		model: { type: 'carton', size: [ 0.07, 0.2, 0.07 ], cap: 0x2a6ad6, label: L( 'UPCOUNTRY', 'UHT whole milk', 0xf2f2f2, 0x1a4a8a, 0x1a4a8a, 'cow', 'band', { glyphColor: 0x1a1a1a } ) } } ),
	drink( 'beer_bottle', 'Big Wave ale', { w: 0.6, size: 1, water: 18, kcal: 170, alcohol: 0.15, container: 'empty_bottle', tags: [ 'alcohol', 'bar', 'grocery', 'restaurant' ],
		model: { type: 'bottle', style: 'beer', h: 0.23, r: 0.031, glass: 0x5a3010, cap: 0xd4a64a, capMetal: true, capH: 0.03, label: L( 'BIG SWELL', 'Golden ale · Hilo', 0x2a5aa8, 0xffffff, 0xf2c21a, 'wave', 'plain', { glyphColor: 0xffffff } ), labelY: 0.2, labelH: 0.25 } } ),
	drink( 'rum', 'Dark rum', { w: 1.2, size: 2, water: 10, kcal: 400, alcohol: 0.28, container: 'empty_bottle', portions: 4, rarity: 'uncommon', tags: [ 'alcohol', 'bar', 'grocery', 'restaurant' ],
		model: { type: 'bottle', style: 'liquor', h: 0.28, r: 0.042, glass: 0x3a1a0a, cap: 0x1a1a1a, label: L( 'KĪPUKA', 'Dark Hawaiian rum', 0xf2e6c8, 0x3a1a0a, 0xd4a64a, 'palm', 'plain', { glyphColor: 0x2a4a2a } ), labelY: 0.2, labelH: 0.32 },
		desc: 'Molotov ingredient.' } ),
	drink( 'okolehao', 'ʻŌkolehao', { w: 1.2, size: 2, water: 10, kcal: 380, alcohol: 0.3, container: 'empty_bottle', portions: 4, rarity: 'rare', tags: [ 'alcohol', 'bar', 'local' ],
		model: { type: 'bottle', style: 'liquor', h: 0.3, r: 0.04, clear: true, glass: 0xe8e8d8, liquid: 0xe8d8a0, liquidClear: true, fill: 0.85, cap: 0xd4a64a, capMetal: true, label: L( 'ʻŌKOLEHAO', 'Ti root spirit', 0x1a1a1a, 0xd4a64a, 0xd4a64a, 'leaf', 'plain', { glyphColor: 0x3a8a3a } ), labelY: 0.2, labelH: 0.3 },
		desc: 'Molotov ingredient.' } ),
	drink( 'sake', 'Sake', { w: 0.9, size: 2, water: 12, kcal: 300, alcohol: 0.2, container: 'empty_bottle', portions: 3, rarity: 'uncommon', tags: [ 'alcohol', 'bar', 'restaurant', 'grocery' ],
		model: { type: 'bottle', style: 'wine', h: 0.3, r: 0.038, clear: true, glass: 0xf2f2f2, liquid: 0xf2f2e6, liquidClear: true, fill: 0.8, cap: 0xc0282a, label: L( 'KAPAHULU', 'Junmai sake', 0xf2f2ee, 0x1a1a1a, 0xc0282a, 'sun', 'plain', { glyphColor: 0xc0282a } ) } } ),
	drink( 'whiskey', 'Whiskey', { w: 1.1, size: 2, water: 8, kcal: 380, alcohol: 0.32, container: 'empty_bottle', portions: 4, rarity: 'uncommon', tags: [ 'alcohol', 'bar' ],
		model: { type: 'bottle', style: 'liquor', h: 0.27, r: 0.045, squash: 0.65, clear: true, glass: 0xe8e0d0, liquid: 0x8a4a14, liquidClear: false, fill: 0.7, cap: 0x1a1a1a, label: L( 'OLD PALI', 'Kentucky straight bourbon', 0xf2e6c8, 0x1a1a1a, 0x8a1a1a, 'star', 'plain', { glyphColor: 0x8a1a1a } ), labelY: 0.22, labelH: 0.28 } } ),
	drink( 'cold_brew', 'Kona cold brew', { w: 0.5, size: 1, water: 22, kcal: 20, caffeine: 200, container: 'empty_bottle', rarity: 'uncommon', tags: [ 'convenience', 'grocery', 'office', 'local' ],
		model: { type: 'bottle', style: 'syrup', h: 0.2, r: 0.032, clear: true, glass: 0xe8e0d0, liquid: 0x1a0e08, fill: 0.85, cap: 0x1a1a1a, label: L( 'KONA', 'Cold brew · 100% Kona', 0x1a1a1a, 0xd4a64a, 0xd4a64a, 'coffee', 'plain', { glyphColor: 0xd4a64a } ) },
		desc: 'Restores energy.' } ),
	drink( 'ginger_ale', 'Ginger ale', { w: 0.37, size: 0.5, water: 21, kcal: 120, tags: [ 'soda', 'grocery', 'convenience', 'vending' ],
		model: soda( L( 'KAUAʻI GINGER', 'Ginger ale', 0x2a6a3a, 0xf2d8a0, 0xf2d8a0, 'leaf', 'plain', { glyphColor: 0xf2d8a0, size: 0.24 } ) ) } ),
	drink( 'plum_wine', 'Plum wine', { w: 1, size: 2, water: 12, kcal: 420, alcohol: 0.16, container: 'empty_bottle', portions: 3, rarity: 'uncommon', tags: [ 'alcohol', 'bar', 'grocery' ],
		model: { type: 'bottle', style: 'wine', h: 0.3, r: 0.037, clear: true, glass: 0xe8f0e8, liquid: 0xd8a040, liquidClear: true, fill: 0.8, cap: 0xd4a64a, capMetal: true, label: L( 'UMESHU', 'Plum wine', 0xf2f2ee, 0x6a1a2a, 0x6a1a2a, 'flower', 'plain', { glyphColor: 0xe07a9a } ) } } ),
	drink( 'electrolyte_mix', 'Electrolyte drink mix', { w: 0.03, size: 0.5, stack: 5, water: 6, kcal: 50, rarity: 'uncommon', tags: [ 'military', 'sports', 'medical' ],
		model: { type: 'bar', size: [ 0.09, 0.008, 0.06 ], matte: true, label: L( 'ELECTROLYTE', 'Beverage base powder', 0xd8a020, 0x1a1a1a, 0x1a1a1a, 'drop', 'plain', { size: 0.3, glyphColor: 0x1a1a1a } ) } } ),
] );
