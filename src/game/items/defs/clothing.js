// Clothing and bags. Everything with capacity is also storage (DayZ style). `clothing.color` is the dominant
// colour of the garment, used by the first-person arms and the infected to dress themselves.
import { defineItems } from '../ItemDB.js';

// cl( id, name, slot, o ): o = { w (kg), size, cap, ins, bite, bullet, wp, vis, color, rarity, tags, model, desc }
function cl( id, name, slot, o ) {
	return {
		id, name, cat: 'clothing', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 2, stack: 1, rarity: o.rarity || 'common',
		tags: [ 'clothing', ...( o.tags || [] ) ], model: o.model,
		clothing: {
			slot, capacity: o.cap ?? 0, insulation: o.ins ?? 0.1, armor: { bite: o.bite ?? 0, bullet: o.bullet ?? 0 },
			waterproof: o.wp ?? 0, visibility: o.vis ?? 0.5, color: o.color,
		},
	};
}
function bp( id, name, o ) {
	return {
		id, name, cat: 'backpack', desc: o.desc || '', weight: o.w ?? 0.8, size: o.size ?? 8, stack: 1, rarity: o.rarity || 'common',
		tags: [ 'bag', ...( o.tags || [] ) ], model: o.model,
		backpack: {
			slot: o.slot || 'back', capacity: o.cap, insulation: o.ins ?? 0.05, armor: { bite: o.bite ?? 0.05, bullet: 0 },
			waterproof: o.wp ?? 0.2, visibility: o.vis ?? 0.5, color: o.color, keepsFresh: o.fresh || 0,
		},
	};
}
const shirt = ( style, color, print, color2, extra = {} ) => ( { type: 'shirt', style, color, print, color2, ...extra } );

defineItems( [
	// ---- tops ----
	cl( 'aloha_shirt', 'Aloha shirt (red hibiscus)', 'torso', { color: 0xb8243a, cap: 2, ins: 0.08, vis: 0.7, w: 0.2, tags: [ 'casual', 'tourist', 'beach' ],
		model: shirt( 'aloha', 0xb8243a, 'hibiscus', 0xf6e7d0, { color3: 0x2f6b3a, button: 0x6a3a1a } ) } ),
	cl( 'aloha_shirt_blue', 'Aloha shirt (blue plumeria)', 'torso', { color: 0x1f3b73, cap: 2, ins: 0.08, vis: 0.6, w: 0.2, tags: [ 'casual', 'tourist', 'beach' ],
		model: shirt( 'aloha', 0x1f3b73, 'plumeria', 0xf4f0e6 ) } ),
	cl( 'aloha_shirt_green', 'Aloha shirt (monstera)', 'torso', { color: 0x3c7a52, cap: 2, ins: 0.08, vis: 0.55, w: 0.2, tags: [ 'casual', 'tourist' ],
		model: shirt( 'aloha', 0xefe6cf, 'monstera', 0x2f7a4a, { color3: 0x1f5a36 } ) } ),
	cl( 'aloha_shirt_yellow', 'Aloha shirt (pineapple)', 'torso', { color: 0xe0b030, cap: 2, ins: 0.08, vis: 0.8, w: 0.2, tags: [ 'casual', 'tourist' ], rarity: 'uncommon',
		model: shirt( 'aloha', 0xe0b030, 'pineapple', 0x7a5a1a ) } ),
	cl( 'aloha_shirt_black', 'Aloha shirt (black hibiscus)', 'torso', { color: 0x1c1c1e, cap: 2, ins: 0.08, vis: 0.35, w: 0.2, tags: [ 'casual', 'formal' ], rarity: 'uncommon',
		model: shirt( 'aloha', 0x1c1c1e, 'hibiscus', 0xe8e4dc, { color3: 0x3a3a3a } ) } ),
	cl( 'aloha_shirt_turtle', 'Aloha shirt (honu)', 'torso', { color: 0x1d7680, cap: 2, ins: 0.08, vis: 0.55, w: 0.2, tags: [ 'casual', 'tourist' ], rarity: 'uncommon',
		model: shirt( 'aloha', 0x1d7680, 'honu', 0xe8d8a8 ) } ),
	cl( 'tshirt', 'White t-shirt', 'torso', { color: 0xecebe6, cap: 1, ins: 0.05, vis: 0.6, w: 0.18, tags: [ 'casual' ], model: shirt( 'tee', 0xecebe6 ) } ),
	cl( 'tshirt_black', 'Black t-shirt', 'torso', { color: 0x1c1c1e, cap: 1, ins: 0.05, vis: 0.3, w: 0.18, tags: [ 'casual' ], model: shirt( 'tee', 0x1c1c1e ) } ),
	cl( 'tshirt_808', '808 t-shirt', 'torso', { color: 0x5a5e66, cap: 1, ins: 0.05, vis: 0.45, w: 0.18, tags: [ 'casual' ], model: shirt( 'tee', 0x5a5e66, 'text:808', 0xf2c230, { rep: 1 } ) } ),
	cl( 'tshirt_tiedye', 'Tie-dye t-shirt', 'torso', { color: 0xc86a8a, cap: 1, ins: 0.05, vis: 0.85, w: 0.18, tags: [ 'casual', 'tourist' ], rarity: 'uncommon', model: shirt( 'tee', 0xc86a8a, 'tiedye', 0xffffff, { rep: 1 } ) } ),
	cl( 'tshirt_od', 'Olive drab t-shirt', 'torso', { color: 0x4a5234, cap: 1, ins: 0.06, vis: 0.25, w: 0.18, tags: [ 'military' ], model: shirt( 'tee', 0x4a5234 ) } ),
	cl( 'tank_top', 'Tank top', 'torso', { color: 0xdad6ce, cap: 0, ins: 0.03, vis: 0.6, w: 0.12, size: 1, tags: [ 'casual', 'beach' ], model: shirt( 'tank', 0xdad6ce ) } ),
	cl( 'rash_guard', 'Rash guard', 'torso', { color: 0x1a3a6a, cap: 0, ins: 0.15, wp: 0.3, vis: 0.4, w: 0.2, tags: [ 'surf', 'beach', 'sports' ], model: shirt( 'tee', 0x1a3a6a, 'stripes', 0x2a8ad6 ) } ),
	cl( 'hoodie', 'Grey hoodie', 'torso', { color: 0x70737a, cap: 4, ins: 0.35, wp: 0.1, vis: 0.45, w: 0.6, size: 4, tags: [ 'casual', 'winter' ], model: shirt( 'hoodie', 0x70737a ) } ),
	cl( 'hoodie_green', 'Green college hoodie', 'torso', { color: 0x1f5a3a, cap: 4, ins: 0.35, wp: 0.1, vis: 0.35, w: 0.6, size: 4, tags: [ 'casual', 'school', 'winter' ], model: shirt( 'hoodie', 0x1f5a3a, 'text:MANOA', 0xf2f2f2, { rep: 1 } ) } ),
	cl( 'flannel_shirt', 'Red flannel shirt', 'torso', { color: 0x9a2a2a, cap: 2, ins: 0.25, vis: 0.5, w: 0.4, size: 3, tags: [ 'casual', 'work', 'farm' ], model: shirt( 'aloha', 0x9a2a2a, 'plaid', 0x1a1a1a, { color3: 0xe0c070, rep: 1.2, collar: 'point', pockets: 2, flaps: true, sleeves: 'long', button: 0x2a1a14 } ) } ),
	cl( 'flannel_blue', 'Blue flannel shirt', 'torso', { color: 0x2a4a7a, cap: 2, ins: 0.25, vis: 0.45, w: 0.4, size: 3, tags: [ 'casual', 'work' ], model: shirt( 'aloha', 0x2a4a7a, 'plaid', 0x10182a, { color3: 0xe8e8e8, rep: 1.2, collar: 'point', pockets: 2, flaps: true, sleeves: 'long', button: 0x1a1a1a } ) } ),
	cl( 'rain_jacket', 'Rain jacket', 'torso', { color: 0xf0c020, cap: 4, ins: 0.2, wp: 0.9, vis: 0.85, w: 0.5, size: 4, tags: [ 'outdoor', 'fishing', 'winter' ], model: shirt( 'jacket', 0xf0c020, null, 0, { pockets: 'flap2low', zip: 0x2a2a2a } ) } ),
	cl( 'windbreaker', 'Windbreaker', 'torso', { color: 0x2a5aa8, cap: 4, ins: 0.15, wp: 0.5, vis: 0.55, w: 0.4, size: 3, tags: [ 'casual', 'sports', 'outdoor' ], model: shirt( 'jacket', 0x2a5aa8, 'stripes', 0xf2f2f2, { rep: 1 } ) } ),
	cl( 'denim_jacket', 'Denim jacket', 'torso', { color: 0x3a5a8a, cap: 4, ins: 0.3, bite: 0.1, vis: 0.45, w: 0.9, size: 4, tags: [ 'casual' ], model: shirt( 'jacket', 0x3a5a8a, 'denim', 0x6a8ab8, { color3: 0x1a2a4a, trim: 0x2a3a5a, collar: 'point', closure: 'buttons', pockets: 'flap2', button: 0xb87333 } ) } ),
	cl( 'leather_jacket', 'Leather jacket', 'torso', { color: 0x2a2220, cap: 4, ins: 0.35, bite: 0.25, wp: 0.4, vis: 0.3, w: 1.6, size: 5, rarity: 'uncommon', tags: [ 'casual', 'motor' ], model: shirt( 'jacket', 0x2a2220, 'leather', 0x000000, { zip: 0xb8b8b8, collar: 'biker', closure: 'asym', button: 0xb8b8b8 } ) } ),
	cl( 'down_jacket', 'Down jacket', 'torso', { color: 0xb8262a, cap: 6, ins: 0.8, wp: 0.4, vis: 0.7, w: 0.9, size: 6, rarity: 'rare', tags: [ 'winter', 'outdoor', 'observatory' ], model: shirt( 'coat', 0xb8262a, null, 0, { quilt: true, weave: 'nylon', collar: 'stand', pockets: 'slant' } ) } ),
	cl( 'police_shirt', 'Police uniform shirt', 'torso', { color: 0x1c2a4a, cap: 3, ins: 0.12, vis: 0.4, w: 0.35, size: 3, rarity: 'uncommon', tags: [ 'police' ], model: shirt( 'aloha', 0x1c2a4a, null, 0, { badge: 0xd4a64a, patch: 0x3a6ab8, button: 0xd4a64a, collar: 'point', pockets: 2, flaps: true } ) } ),
	cl( 'military_combat_shirt', 'Combat shirt', 'torso', { color: 0x8b7a52, cap: 4, ins: 0.2, bite: 0.05, vis: 0.2, w: 0.5, size: 3, rarity: 'uncommon', tags: [ 'military' ], model: shirt( 'jacket', 0xa89a70, 'multicam', 0, { trim: 0x6b6a45, pockets: 'flap2' } ) } ),
	cl( 'military_jacket', 'Field jacket (MARPAT)', 'torso', { color: 0x4a5234, cap: 8, ins: 0.35, wp: 0.3, bite: 0.15, vis: 0.15, w: 1.2, size: 5, rarity: 'rare', tags: [ 'military' ], model: shirt( 'coat', 0x4a5234, 'marpat', 0, { trim: 0x2c2e22, button: 0x2a2a22 } ) } ),
	cl( 'firefighter_jacket', 'Firefighter turnout coat', 'torso', { color: 0xb8985a, cap: 6, ins: 0.55, wp: 0.6, bite: 0.3, vis: 0.8, w: 2.4, size: 7, rarity: 'uncommon', tags: [ 'fire' ], model: shirt( 'coat', 0xb8985a, null, 0, { stripes: 0xd8e84a, trim: 0x2a2a2a, weave: 'canvas', collar: 'tall', closure: 'clips', pockets: 'flap2low' } ) } ),
	cl( 'scrubs_top', 'Scrubs top', 'torso', { color: 0x2a8a8a, cap: 2, ins: 0.06, vis: 0.5, w: 0.18, tags: [ 'medical' ], model: shirt( 'tee', 0x2a8a8a, null, 0, { collar: 'vneck', pockets: 1, weave: 'plain' } ) } ),
	cl( 'chef_jacket', 'Chef jacket', 'torso', { color: 0xf0efe8, cap: 2, ins: 0.15, vis: 0.7, w: 0.45, size: 3, tags: [ 'kitchen', 'restaurant' ], model: shirt( 'aloha', 0xf0efe8, null, 0, { button: 0x1a1a1a, trim: 0xd8d8d0, collar: 'stand', closure: 'double', pockets: 0, sleeves: 'long', weave: 'twill' } ) } ),
	cl( 'wetsuit', 'Wetsuit', 'torso', { color: 0x16181c, cap: 0, ins: 0.55, wp: 0.95, vis: 0.25, w: 1.4, size: 5, rarity: 'uncommon', tags: [ 'surf', 'dive', 'sports' ], model: shirt( 'wetsuit', 0x16181c, null, 0, { trim: 0x2a8ad6, zip: 0x2a8ad6 } ) } ),
	cl( 'lab_coat', 'Lab coat', 'torso', { color: 0xf2f2ee, cap: 4, ins: 0.12, vis: 0.7, w: 0.6, size: 4, tags: [ 'medical', 'science', 'observatory' ], model: shirt( 'coat', 0xf2f2ee, null, 0, { trim: 0xd8d8d0, collar: 'notch', closure: 'buttons', pockets: 'lab', button: 0xe8e8e2 } ) } ),
	cl( 'hazmat_suit', 'Hazmat suit', 'torso', { color: 0xe0c820, cap: 2, ins: 0.4, wp: 1, bite: 0.35, vis: 0.9, w: 2, size: 6, rarity: 'rare', tags: [ 'medical', 'military', 'hazmat' ], model: shirt( 'suit', 0xe0c820, null, 0x1a1a1a, { trim: 0x2a2a2a, hood: 'visor', weave: 'nylon' } ) } ),
	cl( 'polo_shirt', 'Resort polo shirt', 'torso', { color: 0x2a7a6a, cap: 1, ins: 0.06, vis: 0.5, w: 0.22, tags: [ 'hotel', 'sports', 'casual' ], model: shirt( 'polo', 0x2a7a6a, null, 0, { patch: 0xf2f2f2 } ) } ),
	cl( 'muumuu', 'Muʻumuʻu', 'torso', { color: 0xd04a78, cap: 1, ins: 0.12, vis: 0.75, w: 0.35, size: 3, tags: [ 'casual', 'tourist', 'church' ], model: shirt( 'dress', 0xd04a78, 'floral', 0xf6e6f0, { color3: 0xf5c542 } ) } ),
	cl( 'security_shirt', 'Security guard shirt', 'torso', { color: 0xd8d8d2, cap: 2, ins: 0.08, vis: 0.6, w: 0.25, tags: [ 'security', 'bank', 'mall' ], model: shirt( 'polo', 0xd8d8d2, null, 0, { badge: 0xb8bcc2, patch: 0x1a1a1a } ) } ),
	cl( 'mechanic_coveralls', 'Mechanic coveralls', 'torso', { color: 0x2a3a5a, cap: 4, ins: 0.2, bite: 0.05, vis: 0.4, w: 0.9, size: 4, tags: [ 'garage', 'work' ], model: shirt( 'jacket', 0x2a3a5a, null, 0, { patch: 0xf2f2f2, collar: 'point', pockets: 'flap2', weave: 'twill' } ) } ),
	cl( 'ghillie_suit', 'Ghillie top', 'torso', { color: 0x4a5230, cap: 2, ins: 0.3, vis: 0.05, w: 1.8, size: 8, rarity: 'epic', tags: [ 'military', 'hunting' ], model: shirt( 'coat', 0x56613b, 'woodland', 0, { trim: 0x3a3525, rough: 1, ghillie: true, collar: 'stand', pockets: 0 } ) } ),

	// ---- legs ----
	cl( 'board_shorts', 'Board shorts', 'legs', { color: 0x2a6ad6, cap: 1, ins: 0.02, wp: 0.3, vis: 0.6, w: 0.2, tags: [ 'beach', 'surf', 'casual' ], model: { type: 'pants', style: 'shorts', color: 0x2a6ad6, print: 'hibiscus', color2: 0xf2f2f2, color3: 0x1a4aa8, drawstring: true, lace: true } } ),
	cl( 'board_shorts_red', 'Board shorts (red)', 'legs', { color: 0xc0282a, cap: 1, ins: 0.02, wp: 0.3, vis: 0.7, w: 0.2, tags: [ 'beach', 'surf', 'casual' ], model: { type: 'pants', style: 'shorts', color: 0xc0282a, print: 'plumeria', color2: 0xf2f2ee, drawstring: true, lace: true } } ),
	cl( 'jeans', 'Jeans', 'legs', { color: 0x2f4a78, cap: 4, ins: 0.25, bite: 0.12, vis: 0.4, w: 0.8, size: 3, tags: [ 'casual' ], model: { type: 'pants', color: 0x2f4a78, print: 'denim', color2: 0x5a7ab0, color3: 0x1a2a4a } } ),
	cl( 'denim_shorts', 'Denim cutoffs', 'legs', { color: 0x5a7ab0, cap: 3, ins: 0.05, bite: 0.03, vis: 0.5, w: 0.35, tags: [ 'casual', 'beach' ], model: { type: 'pants', style: 'shorts', color: 0x5a7ab0, print: 'denim', color2: 0x8aa8d0, color3: 0x3a5a8a, fray: true } } ),
	cl( 'cargo_shorts', 'Cargo shorts', 'legs', { color: 0xa89a6a, cap: 6, ins: 0.04, vis: 0.45, w: 0.4, tags: [ 'casual', 'outdoor' ], model: { type: 'pants', style: 'shorts', color: 0xa89a6a, cargo: true } } ),
	cl( 'cargo_pants', 'Cargo pants', 'legs', { color: 0x5a5a3a, cap: 8, ins: 0.25, bite: 0.08, vis: 0.35, w: 0.7, size: 3, tags: [ 'outdoor', 'work' ], model: { type: 'pants', color: 0x5a5a3a, cargo: true } } ),
	cl( 'camo_pants', 'Combat pants (MARPAT)', 'legs', { color: 0x4a5234, cap: 8, ins: 0.3, bite: 0.12, vis: 0.15, w: 0.8, size: 3, rarity: 'uncommon', tags: [ 'military' ], model: { type: 'pants', color: 0x4a5234, print: 'marpat', cargo: true } } ),
	cl( 'military_pants', 'Combat pants (multicam)', 'legs', { color: 0x8b7a52, cap: 8, ins: 0.3, bite: 0.12, vis: 0.2, w: 0.8, size: 3, rarity: 'uncommon', tags: [ 'military' ], model: { type: 'pants', color: 0xa89a70, print: 'multicam', cargo: true } } ),
	cl( 'police_pants', 'Police trousers', 'legs', { color: 0x1c2a4a, cap: 4, ins: 0.2, bite: 0.05, vis: 0.4, w: 0.6, size: 3, tags: [ 'police' ], model: { type: 'pants', color: 0x1c2a4a, stripes: 0x3a5a9a, crease: true } } ),
	cl( 'sweatpants', 'Sweatpants', 'legs', { color: 0x6a6a6e, cap: 2, ins: 0.3, vis: 0.45, w: 0.5, size: 3, tags: [ 'casual', 'sports', 'winter' ], model: { type: 'pants', color: 0x6a6a6e, drawstring: true, button: false, cuffs: true } } ),
	cl( 'khaki_pants', 'Khaki chinos', 'legs', { color: 0xc8b890, cap: 4, ins: 0.18, vis: 0.5, w: 0.5, size: 3, tags: [ 'casual', 'office', 'hotel' ], model: { type: 'pants', color: 0xc8b890, crease: true } } ),
	cl( 'scrubs_pants', 'Scrubs pants', 'legs', { color: 0x2a8a8a, cap: 2, ins: 0.08, vis: 0.5, w: 0.25, tags: [ 'medical' ], model: { type: 'pants', color: 0x2a8a8a, drawstring: true, button: false, weave: 'plain' } } ),
	cl( 'firefighter_pants', 'Turnout pants', 'legs', { color: 0xb8985a, cap: 4, ins: 0.5, wp: 0.6, bite: 0.3, vis: 0.8, w: 1.8, size: 5, rarity: 'uncommon', tags: [ 'fire' ], model: { type: 'pants', color: 0xb8985a, stripes: 0xd8e84a, reflect: true, suspenders: true, weave: 'canvas' } } ),
	cl( 'hiking_pants', 'Hiking pants', 'legs', { color: 0x4a5a5a, cap: 6, ins: 0.3, wp: 0.3, bite: 0.06, vis: 0.35, w: 0.45, size: 3, tags: [ 'outdoor', 'sports' ], model: { type: 'pants', color: 0x4a5a5a, cargo: true, weave: 'ripstop' } } ),
	cl( 'rain_pants', 'Rain pants', 'legs', { color: 0xf0c020, cap: 1, ins: 0.15, wp: 0.9, vis: 0.85, w: 0.35, size: 2, tags: [ 'outdoor', 'fishing' ], model: { type: 'pants', color: 0xf0c020, button: false } } ),

	// ---- feet ----
	cl( 'slippers', 'Rubber slippers (slippahs)', 'feet', { color: 0x2a5ad6, ins: 0.01, vis: 0.5, w: 0.2, size: 2, tags: [ 'beach', 'casual' ], model: { type: 'shoes', style: 'slippers', color: 0xf2f2ee, color2: 0x2a5ad6, sole: 0x2a5ad6 } } ),
	cl( 'sneakers', 'Sneakers', 'feet', { color: 0xf0f0ee, ins: 0.05, vis: 0.55, w: 0.7, size: 3, tags: [ 'casual', 'sports' ], model: { type: 'shoes', style: 'sneakers', color: 0xf0f0ee, color2: 0xc0282a } } ),
	cl( 'running_shoes', 'Running shoes', 'feet', { color: 0x2a6ad6, ins: 0.05, vis: 0.6, w: 0.5, size: 3, tags: [ 'sports' ], model: { type: 'shoes', style: 'sneakers', color: 0x2a6ad6, color2: 0xf2c21a, laces: 0xf2c21a } } ),
	cl( 'hiking_boots', 'Hiking boots', 'feet', { color: 0x6a4a2a, ins: 0.15, wp: 0.5, bite: 0.1, vis: 0.4, w: 1.3, size: 4, tags: [ 'outdoor' ], model: { type: 'shoes', style: 'boots', color: 0x6a4a2a, color2: 0x3a2a1a, sole: 0x2a2a2a, laces: 0xc03a2a } } ),
	cl( 'combat_boots', 'Combat boots', 'feet', { color: 0x8a7a5a, ins: 0.15, wp: 0.4, bite: 0.2, vis: 0.3, w: 1.6, size: 4, rarity: 'uncommon', tags: [ 'military' ], model: { type: 'shoes', style: 'combat', color: 0x8a7a5a, color2: 0x5a4a3a, sole: 0x3a3228, laces: 0x5a4a3a } } ),
	cl( 'police_boots', 'Duty boots', 'feet', { color: 0x141414, ins: 0.12, wp: 0.4, bite: 0.18, vis: 0.3, w: 1.4, size: 4, tags: [ 'police' ], model: { type: 'shoes', style: 'combat', color: 0x141414, color2: 0x2a2a2a, sole: 0x1a1a1a, laces: 0x1a1a1a } } ),
	cl( 'rain_boots', 'Rain boots', 'feet', { color: 0x2a4a2a, ins: 0.1, wp: 1, bite: 0.12, vis: 0.4, w: 1.4, size: 4, tags: [ 'farm', 'fishing', 'outdoor' ], model: { type: 'shoes', style: 'rain', color: 0x2a4a2a, color2: 0x1a1a1a, sole: 0x1a1a1a } } ),
	cl( 'reef_shoes', 'Reef shoes', 'feet', { color: 0x1c1c1e, ins: 0.03, wp: 0.2, vis: 0.4, w: 0.35, size: 2, tags: [ 'beach', 'surf', 'dive' ], model: { type: 'shoes', style: 'reef', color: 0x1c1c1e, color2: 0x2aa8c8, sole: 0x2a2a2a } } ),
	cl( 'tabi', 'Fishing tabi', 'feet', { color: 0x1a1a1a, ins: 0.05, wp: 0.3, vis: 0.35, w: 0.5, size: 2, rarity: 'uncommon', tags: [ 'fishing', 'beach' ], model: { type: 'shoes', style: 'tabi', color: 0x1a1a1a, color2: 0x2a2a2a, sole: 0x3a3a3a } } ),
	cl( 'work_boots', 'Work boots', 'feet', { color: 0x9a7040, ins: 0.15, wp: 0.4, bite: 0.18, vis: 0.4, w: 1.7, size: 4, tags: [ 'work', 'construction', 'farm' ], model: { type: 'shoes', style: 'work', color: 0x9a7040, color2: 0x5a3a1a, sole: 0x2a2a2a, laces: 0x5a3a1a } } ),
	cl( 'dress_shoes', 'Dress shoes', 'feet', { color: 0x141414, ins: 0.05, vis: 0.35, w: 0.9, size: 3, tags: [ 'formal', 'office', 'church' ], model: { type: 'shoes', style: 'dress', color: 0x141414, color2: 0x0a0a0a, sole: 0x2a1a10 } } ),
	cl( 'firefighter_boots', 'Firefighter boots', 'feet', { color: 0x141414, ins: 0.2, wp: 1, bite: 0.25, vis: 0.6, w: 2.4, size: 5, rarity: 'uncommon', tags: [ 'fire' ], model: { type: 'shoes', style: 'firefighter', color: 0x141414, color2: 0xd8c020, sole: 0x2a2a2a } } ),
	cl( 'swim_fins', 'Swim fins', 'feet', { color: 0x2a7ad6, ins: 0, vis: 0.5, w: 0.8, size: 4, tags: [ 'dive', 'surf', 'beach' ], model: { type: 'shoes', style: 'fins', color: 0x2a7ad6, color2: 0x1a1a1a } } ),

	// ---- head ----
	cl( 'baseball_cap', 'Baseball cap', 'head', { color: 0xb8262a, ins: 0.03, vis: 0.55, w: 0.1, tags: [ 'casual', 'sports' ], model: { type: 'hat', style: 'cap', color: 0xb8262a, color2: 0x1a1a1a, logo: 0xf2f2f2 } } ),
	cl( 'trucker_cap', 'Trucker cap', 'head', { color: 0x1a3a6a, ins: 0.03, vis: 0.5, w: 0.1, tags: [ 'casual', 'farm', 'fishing' ], model: { type: 'hat', style: 'cap', color: 0x1a3a6a, color2: 0xf2f2f2, logo: 0xf2c230 } } ),
	cl( 'police_cap', 'Police cap', 'head', { color: 0x1c2a4a, ins: 0.04, vis: 0.45, w: 0.12, tags: [ 'police' ], model: { type: 'hat', style: 'police_cap', color: 0x1c2a4a, color2: 0x10182a } } ),
	cl( 'bucket_hat', 'Bucket hat', 'head', { color: 0xc8b890, ins: 0.03, vis: 0.45, w: 0.1, tags: [ 'beach', 'fishing', 'tourist' ], model: { type: 'hat', style: 'bucket', color: 0xc8b890, color2: 0xa89a70 } } ),
	cl( 'boonie_hat', 'Boonie hat', 'head', { color: 0x8b7a52, ins: 0.04, vis: 0.2, w: 0.12, rarity: 'uncommon', tags: [ 'military', 'hunting' ], model: { type: 'hat', style: 'boonie', color: 0xa89a70, print: 'multicam', color2: 0x6b6a45 } } ),
	cl( 'lauhala_hat', 'Lauhala hat', 'head', { color: 0xcfa860, ins: 0.05, vis: 0.5, w: 0.15, size: 3, rarity: 'uncommon', tags: [ 'tourist', 'farm', 'beach' ], model: { type: 'hat', style: 'straw', color: 0xcfa860, color2: 0x2a1a10 } } ),
	cl( 'paniolo_hat', 'Paniolo hat', 'head', { color: 0xb89050, ins: 0.05, vis: 0.5, w: 0.2, size: 3, rarity: 'uncommon', tags: [ 'farm', 'ranch' ], model: { type: 'hat', style: 'paniolo', color: 0xb89050, color2: 0x3a2414 } } ),
	cl( 'beanie', 'Beanie', 'head', { color: 0x2a2a2a, ins: 0.2, vis: 0.35, w: 0.08, tags: [ 'winter', 'casual' ], model: { type: 'hat', style: 'beanie', color: 0x2a2a2a, color2: 0x1a1a1a } } ),
	cl( 'sun_visor', 'Sun visor', 'head', { color: 0xf2f2f2, ins: 0, vis: 0.6, w: 0.06, tags: [ 'sports', 'tourist' ], model: { type: 'hat', style: 'visor', color: 0xf2f2f2, color2: 0x2a8ad6 } } ),
	cl( 'motorcycle_helmet', 'Motorcycle helmet', 'head', { color: 0x1c1c1e, ins: 0.25, bite: 0.65, bullet: 0.05, vis: 0.5, w: 1.5, size: 6, rarity: 'uncommon', tags: [ 'motor', 'garage' ], model: { type: 'hat', style: 'helmet_moto', color: 0x1c1c1e, stripe: 0xc0282a, visor: 0x1a1a22 } } ),
	cl( 'military_helmet', 'Combat helmet', 'head', { color: 0x6b6a45, ins: 0.1, bite: 0.5, bullet: 0.35, vis: 0.25, w: 1.4, size: 6, rarity: 'rare', tags: [ 'military' ], model: { type: 'hat', style: 'helmet_mil', color: 0xa89a70, print: 'multicam', color2: 0x6b6a45 } } ),
	cl( 'riot_helmet', 'Riot helmet', 'head', { color: 0x141414, ins: 0.15, bite: 0.6, bullet: 0.1, vis: 0.45, w: 1.6, size: 6, rarity: 'uncommon', tags: [ 'police' ], model: { type: 'hat', style: 'helmet_riot', color: 0x141414 } } ),
	cl( 'firefighter_helmet', 'Firefighter helmet', 'head', { color: 0xd8b020, ins: 0.2, bite: 0.45, bullet: 0.05, vis: 0.8, w: 1.3, size: 6, rarity: 'uncommon', tags: [ 'fire' ], model: { type: 'hat', style: 'helmet_fire', color: 0xd8b020, color2: 0x1a1a1a } } ),
	cl( 'hard_hat', 'Hard hat', 'head', { color: 0xf2c21a, ins: 0.05, bite: 0.3, vis: 0.85, w: 0.4, size: 4, tags: [ 'construction', 'work', 'industrial' ], model: { type: 'hat', style: 'hardhat', color: 0xf2c21a } } ),

	// ---- face ----
	cl( 'bandana', 'Bandana (red)', 'face', { color: 0xb02a2a, ins: 0.03, vis: 0.5, w: 0.05, size: 1, tags: [ 'casual', 'farm' ], model: { type: 'mask', style: 'bandana', color: 0xb02a2a, color2: 0xf2f2f2 } } ),
	cl( 'bandana_blue', 'Bandana (blue)', 'face', { color: 0x1f3b73, ins: 0.03, vis: 0.45, w: 0.05, size: 1, tags: [ 'casual' ], model: { type: 'mask', style: 'bandana', color: 0x1f3b73, color2: 0xf2f2f2 } } ),
	cl( 'surgical_mask', 'Surgical mask', 'face', { color: 0x8ab8e0, ins: 0.01, vis: 0.55, w: 0.01, size: 1, tags: [ 'medical', 'pharmacy' ], model: { type: 'mask', style: 'surgical', color: 0x8ab8e0 } } ),
	cl( 'n95_mask', 'N95 respirator', 'face', { color: 0xf2f2ee, ins: 0.02, vis: 0.6, w: 0.02, size: 1, tags: [ 'medical', 'construction', 'hardware' ], model: { type: 'mask', style: 'n95', color: 0xf2f2ee } } ),
	cl( 'respirator', 'Half-face respirator', 'face', { color: 0x2a2a2a, ins: 0.02, vis: 0.5, w: 0.3, size: 2, rarity: 'uncommon', tags: [ 'construction', 'hardware', 'industrial' ], model: { type: 'mask', style: 'respirator', color: 0x2a2a2a } } ),
	cl( 'gas_mask', 'Gas mask', 'face', { color: 0x2a2a2a, ins: 0.05, bite: 0.2, vis: 0.4, w: 0.7, size: 3, rarity: 'rare', tags: [ 'military', 'police', 'hazmat' ], model: { type: 'mask', style: 'gas', color: 0x2a2a2a } } ),
	cl( 'balaclava', 'Balaclava', 'face', { color: 0x141414, ins: 0.15, vis: 0.2, w: 0.08, size: 1, rarity: 'uncommon', tags: [ 'military', 'winter', 'police' ], model: { type: 'mask', style: 'balaclava', color: 0x141414 } } ),

	// ---- eyes ----
	cl( 'sunglasses', 'Sunglasses', 'eyes', { color: 0x141414, vis: 0.5, w: 0.03, size: 1, tags: [ 'casual', 'beach', 'tourist' ], model: { type: 'glasses', style: 'sun', color: 0x141414, lens: 0x1a1a22 } } ),
	cl( 'aviators', 'Aviator sunglasses', 'eyes', { color: 0xd4a64a, vis: 0.5, w: 0.03, size: 1, rarity: 'uncommon', tags: [ 'casual', 'police', 'military' ], model: { type: 'glasses', style: 'aviator', color: 0xd4a64a, lens: 0x2a3a2a } } ),
	cl( 'ski_goggles', 'Ski goggles', 'eyes', { color: 0x1c1c1e, ins: 0.05, vis: 0.6, w: 0.15, size: 2, rarity: 'rare', tags: [ 'winter', 'observatory' ], model: { type: 'glasses', style: 'ski', color: 0x1c1c1e, lens: 0xe08a2a, strap: 0x2a6ad6 } } ),
	cl( 'swim_goggles', 'Swim goggles', 'eyes', { color: 0x2a6ad6, vis: 0.5, w: 0.04, size: 1, tags: [ 'beach', 'sports', 'dive' ], model: { type: 'glasses', style: 'swim', color: 0x2a6ad6, lens: 0x6ab8e0, strap: 0x2a6ad6 } } ),
	cl( 'dive_mask', 'Snorkel mask', 'eyes', { color: 0x1a1a1a, vis: 0.5, w: 0.25, size: 2, tags: [ 'beach', 'dive', 'tourist' ], model: { type: 'glasses', style: 'dive', color: 0x1a1a1a } } ),
	cl( 'safety_glasses', 'Safety glasses', 'eyes', { color: 0xf2c21a, vis: 0.5, w: 0.04, size: 1, tags: [ 'construction', 'hardware', 'work' ], model: { type: 'glasses', style: 'safety', color: 0xf2c21a, lens: 0xe8f0f2 } } ),

	// ---- vests ----
	cl( 'police_vest', 'Police plate carrier', 'vest', { color: 0x1c2230, cap: 4, ins: 0.15, bite: 0.45, bullet: 0.45, vis: 0.4, w: 5.5, size: 10, rarity: 'rare', tags: [ 'police' ], model: { type: 'vest', style: 'plate', color: 0x1c2230, patch: 0xf2f2f2 } } ),
	cl( 'plate_carrier', 'Military plate carrier', 'vest', { color: 0x8b7a52, cap: 6, ins: 0.2, bite: 0.5, bullet: 0.6, vis: 0.25, w: 8, size: 12, rarity: 'epic', tags: [ 'military' ], model: { type: 'vest', style: 'plate', color: 0xa89a70, print: 'multicam', color2: 0x6b6a45 } } ),
	cl( 'stab_vest', 'Security stab vest', 'vest', { color: 0x1a1a1a, cap: 2, ins: 0.12, bite: 0.5, bullet: 0.1, vis: 0.4, w: 2.5, size: 8, rarity: 'uncommon', tags: [ 'security', 'police', 'bank' ], model: { type: 'vest', style: 'stab', color: 0x1a1a1a } } ),
	cl( 'chest_rig', 'Chest rig', 'vest', { color: 0x6b6a45, cap: 10, ins: 0.05, vis: 0.25, w: 1.4, size: 6, rarity: 'uncommon', tags: [ 'military' ], model: { type: 'vest', style: 'rig', color: 0x6b6a45, color2: 0x4a4a30 } } ),
	cl( 'hunting_vest', 'Hunting vest', 'vest', { color: 0xe8601a, cap: 6, ins: 0.08, vis: 0.95, w: 0.5, size: 4, tags: [ 'hunting', 'outdoor' ], model: { type: 'vest', style: 'hunting', color: 0xe8601a, color2: 0xc04a10 } } ),
	cl( 'fishing_vest', 'Fishing vest', 'vest', { color: 0xa8a07a, cap: 10, ins: 0.06, vis: 0.4, w: 0.5, size: 4, tags: [ 'fishing', 'outdoor' ], model: { type: 'vest', style: 'fishing', color: 0xa8a07a, color2: 0x8a8260 } } ),
	cl( 'hivis_vest', 'Hi-vis vest', 'vest', { color: 0xd8f020, cap: 2, ins: 0.02, vis: 1, w: 0.2, size: 2, tags: [ 'construction', 'work', 'industrial', 'street' ], model: { type: 'vest', style: 'hivis', color: 0xd8f020 } } ),
	cl( 'life_jacket', 'Life jacket', 'vest', { color: 0xf26a1a, cap: 1, ins: 0.3, vis: 0.9, w: 0.8, size: 6, tags: [ 'boat', 'fishing' ], model: { type: 'vest', style: 'life', color: 0xf26a1a } } ),

	// ---- hands ----
	cl( 'work_gloves', 'Work gloves', 'hands', { color: 0xa8804a, ins: 0.08, bite: 0.15, vis: 0.5, w: 0.2, size: 1, tags: [ 'work', 'hardware', 'garage', 'farm' ], model: { type: 'gloves', style: 'work', color: 0xa8804a, color2: 0x2a5aa8 } } ),
	cl( 'tactical_gloves', 'Tactical gloves', 'hands', { color: 0x2a2a28, ins: 0.08, bite: 0.18, vis: 0.3, w: 0.15, size: 1, rarity: 'uncommon', tags: [ 'military', 'police' ], model: { type: 'gloves', style: 'tactical', color: 0x2a2a28, color2: 0x6b6a45 } } ),
	cl( 'latex_gloves', 'Nitrile gloves', 'hands', { color: 0x4a8ad6, ins: 0.01, vis: 0.5, w: 0.02, size: 1, tags: [ 'medical', 'pharmacy', 'kitchen' ], model: { type: 'gloves', style: 'latex', color: 0x4a8ad6, color2: 0x4a8ad6 } } ),
	cl( 'fingerless_gloves', 'Fingerless gloves', 'hands', { color: 0x1c1c1c, ins: 0.05, bite: 0.08, vis: 0.35, w: 0.08, size: 1, tags: [ 'casual', 'sports' ], model: { type: 'gloves', style: 'fingerless', color: 0x1c1c1c } } ),
	cl( 'firefighter_gloves', 'Firefighter gloves', 'hands', { color: 0x8a6a3a, ins: 0.2, bite: 0.3, vis: 0.5, w: 0.4, size: 2, rarity: 'uncommon', tags: [ 'fire' ], model: { type: 'gloves', style: 'fire', color: 0x8a6a3a, color2: 0xd8c020 } } ),
	cl( 'dive_gloves', 'Dive gloves', 'hands', { color: 0x141414, ins: 0.15, bite: 0.1, wp: 0.8, vis: 0.3, w: 0.15, size: 1, tags: [ 'dive', 'fishing' ], model: { type: 'gloves', style: 'dive', color: 0x141414, color2: 0x2a8ad6 } } ),

	// ---- belts ----
	cl( 'belt', 'Leather belt', 'belt', { color: 0x3a2616, cap: 0, ins: 0, vis: 0.4, w: 0.25, size: 1, tags: [ 'casual' ], model: { type: 'belt', color: 0x3a2616 } } ),
	cl( 'holster_belt', 'Duty belt', 'belt', { color: 0x141414, cap: 2, ins: 0, vis: 0.4, w: 0.9, size: 3, rarity: 'uncommon', tags: [ 'police', 'security' ], model: { type: 'belt', color: 0x141414, holster: true, pouches: 2, buckle: 0x2a2a2a } } ),
	cl( 'utility_belt', 'Military utility belt', 'belt', { color: 0x6b6a45, cap: 4, ins: 0, vis: 0.3, w: 0.8, size: 3, rarity: 'uncommon', tags: [ 'military' ], model: { type: 'belt', color: 0x6b6a45, pouches: 3, color2: 0x4a4a30, buckle: 0x2a2a2a } } ),
	cl( 'tool_belt', 'Tool belt', 'belt', { color: 0xa8804a, cap: 4, ins: 0, vis: 0.45, w: 0.9, size: 3, tags: [ 'construction', 'hardware', 'work' ], model: { type: 'belt', color: 0xa8804a, pouches: 2, tools: true, color2: 0x8a6a3a } } ),
] );

// ---- backpacks and bags ----
defineItems( [
	bp( 'backpack_school', 'School backpack', { cap: 14, w: 0.6, size: 8, color: 0x2a4a8a, tags: [ 'school', 'casual' ], model: { type: 'backpack', style: 'school', color: 0x2a4a8a, color2: 0xe8a020 } } ),
	bp( 'backpack_hiking', 'Hiking backpack', { cap: 30, w: 1.4, size: 10, color: 0x3a6a8a, rarity: 'uncommon', tags: [ 'outdoor', 'sports' ], model: { type: 'backpack', style: 'hiking', color: 0x3a6a8a, color2: 0xe08a20, roll: 0x2a5a3a } } ),
	bp( 'backpack_military', 'Military rucksack', { cap: 42, w: 2.4, size: 12, color: 0x8b7a52, rarity: 'rare', tags: [ 'military' ], model: { type: 'backpack', style: 'rucksack', color: 0xa89a70, print: 'multicam', color2: 0x6b6a45, roll: 0x4a5234 } } ),
	bp( 'backpack_assault', 'Assault pack', { cap: 24, w: 1.2, size: 10, color: 0x8a7a5a, rarity: 'uncommon', tags: [ 'military', 'police' ], model: { type: 'backpack', style: 'assault', color: 0x8a7a5a, color2: 0x5a4a3a } } ),
	bp( 'backpack_medic', 'Medic bag', { cap: 20, w: 1.1, size: 10, color: 0xb8262a, rarity: 'uncommon', tags: [ 'medical', 'fire' ], model: { type: 'backpack', style: 'medic', color: 0x2a2a2a, color2: 0xb8262a } } ),
	bp( 'duffel_bag', 'Duffel bag', { cap: 32, w: 1.2, size: 12, color: 0x1a1a1a, vis: 0.45, tags: [ 'sports', 'casual', 'military' ], model: { type: 'backpack', style: 'duffel', color: 0x1a1a1a, color2: 0x2a2a2a } } ),
	bp( 'dry_bag', 'Dry bag', { cap: 16, w: 0.4, size: 6, wp: 1, color: 0xf2c21a, vis: 0.75, tags: [ 'surf', 'boat', 'fishing', 'beach' ], model: { type: 'backpack', style: 'dry', color: 0xf2c21a, color2: 0x1a1a1a } } ),
	bp( 'fanny_pack', 'Fanny pack', { slot: 'belt', cap: 4, w: 0.2, size: 3, color: 0x2aa8a8, tags: [ 'tourist', 'casual' ], model: { type: 'backpack', style: 'fanny', color: 0x2aa8a8, color2: 0x1a1a1a } } ),
	bp( 'cooler_bag', 'Cooler bag', { cap: 14, w: 0.9, size: 10, color: 0x2a6ad6, fresh: 0.5, tags: [ 'beach', 'fishing', 'kitchen' ], model: { type: 'backpack', style: 'cooler', color: 0x2a6ad6, color2: 0xf2f2f2 }, desc: 'Food spoils half as fast.' } ),
	bp( 'tote_bag', 'Canvas tote', { cap: 10, w: 0.3, size: 4, color: 0xe8dcc0, tags: [ 'casual', 'tourist', 'grocery' ], model: { type: 'backpack', style: 'tote', color: 0xe8dcc0, print: 'text:ALOHA', color2: 0x2a6a4a, rep: 1 } } ),
	bp( 'backpack_improvised', 'Improvised sack', { cap: 12, w: 0.8, size: 8, color: 0x2a5aa8, rarity: 'uncommon', tags: [ 'crafted' ], model: { type: 'backpack', style: 'improvised', color: 0x2a5aa8, color2: 0xc8b07a } } ),
] );
