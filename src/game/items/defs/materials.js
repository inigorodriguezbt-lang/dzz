// Crafting materials, hunting spoils, vehicle parts, fuel, keys, books and notes, and the odds and ends people
// left behind (cash, jewellery, souvenirs). Books carry `book.pages` shown when read; reading a guide can set a
// knowledge flag (`book.skill`) that other systems check (the fishing guide improves your catch).
import { defineItems } from '../ItemDB.js';

function item( id, name, cat, o ) {
	const d = {
		id, name, cat, desc: o.desc || '', weight: o.w ?? 0.2, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ ...( o.tags || [] ) ], model: o.model,
	};
	for ( const k of [ 'medical', 'vehicle', 'fuel', 'key', 'book', 'throwable', 'misc', 'material' ] ) if ( o[ k ] ) d[ k ] = o[ k ];
	return d;
}
const mat = ( id, name, o ) => item( id, name, 'material', { ...o, tags: [ 'material', ...( o.tags || [] ) ] } );
const misc = ( id, name, o ) => item( id, name, 'misc', { ...o, tags: [ 'misc', ...( o.tags || [] ) ] } );
const book = ( id, name, o ) => item( id, name, 'book', { w: 0.3, size: 1, ...o, tags: [ 'book', ...( o.tags || [] ) ], book: { pages: o.pages, skill: o.skill } } );

defineItems( [
	// ================= materials =================
	mat( 'rags', 'Rags', { w: 0.04, size: 1, stack: 8, tags: [ 'crafted', 'house', 'garage', 'trash' ], model: { type: 'folded', size: [ 0.16, 0.03, 0.12 ], color: 0xd8cfc0, print: 'canvas', color2: 0xb8ae9a },
		medical: { use: 7, bleed: 1, verb: 'Bandage with a rag', sound: 'bandage' },
		desc: 'Torn strips of cotton. Bandage a wound in a pinch, or craft them into better things.' } ),
	mat( 'stick', 'Sticks', { w: 0.25, size: 3, stack: 10, tags: [ 'wild' ], model: { type: 'stick', len: 0.6, n: 3 },
		desc: 'Straight dry sticks. Kindling, splints, arrows, spears.' } ),
	mat( 'long_stick', 'Long stick', { w: 0.8, size: 4, stack: 2, tags: [ 'wild' ], model: { type: 'stick', len: 1.6, r: 0.02 },
		desc: 'A straight hau or guava pole, taller than you are.' } ),
	mat( 'firewood', 'Firewood', { w: 1.2, size: 4, stack: 4, tags: [ 'wild', 'farm', 'house' ], model: { type: 'firewood' },
		desc: 'Split kiawe logs. Keeps a campfire burning for a long time.' } ),
	mat( 'planks', 'Planks', { w: 1.5, size: 6, stack: 6, tags: [ 'hardware', 'construction', 'farm', 'garage' ], model: { type: 'plank', n: 3, len: 1 },
		desc: 'Lumber offcuts. Good firewood, better barricades.' } ),
	mat( 'nails', 'Nails', { w: 0.004, size: 0.5, stack: 60, tags: [ 'hardware', 'garage', 'construction', 'farm' ],
		model: { type: 'box', size: [ 0.1, 0.05, 0.07 ], label: { bg: 0x2a4a8a, fg: 0xf2f2f2, text: 'NAILS', sub: '3 in common · 1 lb', band: 0xf2c21a, style: 'band', size: 0.3 } },
		desc: 'A box of framing nails.' } ),
	mat( 'wire', 'Wire', { w: 0.2, size: 1, tags: [ 'hardware', 'garage', 'construction', 'farm' ], model: { type: 'wire' },
		desc: 'A coil of copper wire. Snares, lockpicks, fishing hooks, repairs.' } ),
	mat( 'rope', 'Rope', { w: 0.6, size: 2, tags: [ 'hardware', 'boat', 'farm', 'garage', 'outdoor' ], model: { type: 'rope' },
		desc: 'Ten metres of nylon rope.' } ),
	mat( 'tarp', 'Tarp', { w: 0.9, size: 3, tags: [ 'hardware', 'garage', 'farm', 'construction', 'outdoor' ], model: { type: 'folded', size: [ 0.32, 0.06, 0.24 ], color: 0x2a5aa8, grommets: true },
		desc: 'Blue plastic tarp. Every roof in the islands is wearing one after the storms.' } ),
	mat( 'scrap_metal', 'Scrap metal', { w: 0.5, size: 2, stack: 6, tags: [ 'garage', 'construction', 'trash', 'street' ], model: { type: 'scrap' },
		desc: 'Bent sheet metal and brackets. Repairs and crafting.' } ),
	mat( 'stone', 'Stones', { w: 0.6, size: 2, stack: 6, tags: [ 'wild', 'beach' ], model: { type: 'stone', r: 0.06 },
		desc: 'Smooth lava stones. A fire ring, a hammer, a weight.' } ),
	mat( 'newspaper', 'Newspaper', { w: 0.15, size: 1, stack: 4, tags: [ 'house', 'street', 'office', 'trash', 'post' ], model: { type: 'paper' },
		desc: 'The last edition: "OUTBREAK SPREADS". Good tinder.' } ),
	mat( 'cooking_oil', 'Cooking oil', { w: 0.95, size: 1, tags: [ 'kitchen', 'grocery', 'restaurant' ],
		model: { type: 'bottle', style: 'syrup', h: 0.26, r: 0.04, clear: true, glass: 0xf2eed8, liquid: 0xe8c040, liquidClear: true, fill: 0.8, cap: 0xd02a2a, label: { bg: 0xf2c21a, fg: 0x1a1a1a, text: 'VEGETABLE OIL', style: 'plain', size: 0.3 }, labelY: 0.3, labelH: 0.25 },
		desc: 'A litre of oil. Soaks torch rags so they burn for hours.' } ),
	mat( 'charcoal', 'Charcoal', { w: 0.8, size: 2, stack: 4, tags: [ 'grocery', 'hardware', 'beach' ],
		model: { type: 'bag', size: [ 0.22, 0.3, 0.08 ], matte: true, crimp: false, label: { bg: 0x1a1a1a, fg: 0xf2c21a, text: 'CHARCOAL', sub: 'Briquets · 4 lb', band: 0xc0282a, style: 'band', size: 0.24 } },
		desc: 'Beach barbecue briquets. Burns long and hot in a campfire.' } ),

	// ================= hunting spoils =================
	mat( 'animal_hide', 'Animal hide', { w: 1.5, size: 4, rarity: 'uncommon', tags: [ 'hunting' ], model: { type: 'hide', color: 0x5a3a24 },
		desc: 'A raw hide from a pig, goat or deer. Tans into leather; burns as fuel if nothing else.' } ),
	mat( 'feathers', 'Feathers', { w: 0.002, size: 0.5, stack: 20, tags: [ 'hunting', 'farm' ], model: { type: 'feathers' },
		desc: 'Chicken and nēnē feathers. Fletching for arrows.' } ),
	mat( 'bone', 'Bone', { w: 0.15, size: 1, stack: 6, tags: [ 'hunting' ], model: { type: 'bone' },
		desc: 'A cleaned bone. Fish hooks and tools.' } ),

	// ================= fishing =================
	misc( 'fishing_bait', 'Squid bait', { w: 0.02, size: 0.5, stack: 10, tags: [ 'fishing', 'beach', 'boat' ],
		model: { type: 'jar', r: 0.035, h: 0.06, content: 0xe8dcd0, body: 0xf2f2f2, lid: 0x2a6ad6, label: { bg: 0xf2f2f2, fg: 0x2a6ad6, text: 'BAIT', sub: 'Squid strips', style: 'plain', size: 0.4 } },
		desc: 'Salted squid strips. Each cast with bait gets bites much faster.' } ),

	// ================= vehicle parts, fuel, keys =================
	item( 'car_battery', 'Car battery', 'vehicle', { w: 14, size: 6, rarity: 'uncommon', tags: [ 'vehicle', 'garage', 'car' ], model: { type: 'carbattery' }, vehicle: { part: 'battery' },
		desc: '12 V lead-acid battery. Heavy. A dead car might start with it.' } ),
	item( 'spark_plug', 'Spark plug', 'vehicle', { w: 0.05, size: 0.5, rarity: 'uncommon', tags: [ 'vehicle', 'garage', 'hardware' ], model: { type: 'sparkplug' }, vehicle: { part: 'sparkplug' },
		desc: 'A spark plug. Engines need these to run.' } ),
	item( 'tire', 'Tire', 'vehicle', { w: 10, size: 12, rarity: 'uncommon', tags: [ 'vehicle', 'garage' ], model: { type: 'tire' }, vehicle: { part: 'tire' },
		desc: 'A mounted spare wheel. Replaces a flat.' } ),
	item( 'repair_kit', 'Vehicle repair kit', 'vehicle', { w: 3, size: 4, rarity: 'rare', tags: [ 'vehicle', 'garage', 'crafted' ],
		model: { type: 'kit', style: 'case', size: [ 0.32, 0.1, 0.2 ], color: 0x2a2a2a, cross: null, label: { bg: 0xf2c21a, fg: 0x1a1a1a, text: 'REPAIR KIT', style: 'plain', size: 0.3 } },
		vehicle: { part: 'repair' }, desc: 'Hoses, clamps, sealant and tools. Patches up a damaged engine or hull.' } ),
	item( 'car_keys', 'Car keys', 'key', { w: 0.05, size: 0.5, rarity: 'uncommon', tags: [ 'vehicle', 'house', 'car' ], model: { type: 'keys', n: 2, fob: 0x1a1a1a }, key: { vehicle: true },
		desc: 'A key fob. One of the cars around here might still answer to it.' } ),
	item( 'jerrycan', 'Jerrycan', 'fuel', { w: 3.8, size: 8, rarity: 'uncommon', tags: [ 'fuel', 'garage', 'military', 'farm', 'gas_station' ], model: { type: 'jerrycan' },
		fuel: { litres: 20, kind: 'gasoline' }, desc: '20-litre steel fuel can.' } ),
	item( 'gas_can', 'Gas can', 'fuel', { w: 0.9, size: 4, tags: [ 'fuel', 'garage', 'gas_station', 'house', 'farm' ], model: { type: 'jerrycan', small: true },
		fuel: { litres: 5, kind: 'gasoline' }, desc: 'Red plastic 5-litre gas can with a spout.' } ),
	item( 'propane_canister', 'Propane canister', 'fuel', { w: 0.8, size: 1, rarity: 'uncommon', tags: [ 'outdoor', 'hardware', 'sports' ], model: { type: 'propane' },
		fuel: { litres: 0.45, kind: 'propane' }, desc: 'Screw-on canister for camp stoves. Refills a stove for ten more meals.' } ),

	// ================= light and signal =================
	item( 'road_flare', 'Road flare', 'throwable', { w: 0.2, size: 1, stack: 3, tags: [ 'car', 'police', 'fire', 'gas_station', 'boat' ], model: { type: 'flare' },
		throwable: { kind: 'flare', fuse: 0, radius: 0, damage: 0, burn: 420, light: { color: 0xff3a2a, range: 22, intensity: 40 } },
		desc: 'Strike it and it burns bright red for seven minutes. Lights the way — and draws every infected nearby.' } ),

	// ================= valuables and souvenirs =================
	misc( 'cash', 'Cash', { w: 0.001, size: 0.5, stack: 500, tags: [ 'valuable', 'house', 'bank', 'office', 'pawn', 'car', 'civilian' ], model: { type: 'cash' },
		desc: 'Twenty-dollar bills. Worthless now, but old habits die hard.' } ),
	misc( 'gold_chain', 'Gold chain', { w: 0.03, size: 0.5, rarity: 'uncommon', tags: [ 'valuable', 'pawn', 'house', 'civilian' ], model: { type: 'jewelry', pendant: 0x2a8a5a },
		desc: 'Gold chain with a jade pendant.' } ),
	misc( 'diamond_ring', 'Diamond ring', { w: 0.01, size: 0.5, rarity: 'rare', tags: [ 'valuable', 'pawn', 'house', 'bank' ], model: { type: 'jewelry', style: 'ring' },
		desc: 'Someone said yes on a beach at sunset.' } ),
	misc( 'puka_necklace', 'Puka shell necklace', { w: 0.03, size: 0.5, tags: [ 'tourist', 'beach', 'surf' ], model: { type: 'lei', colors: [ 0xf2eee0, 0xe8e0c8, 0xd8ccb0 ] },
		desc: 'Strand of white puka shells.' } ),
	misc( 'lei', 'Plumeria lei', { w: 0.08, size: 1, tags: [ 'tourist', 'hotel', 'church' ], model: { type: 'lei' },
		desc: 'A wilted flower lei from an airport greeting.' } ),
	misc( 'kukui_lei', 'Kukui nut lei', { w: 0.15, size: 1, rarity: 'uncommon', tags: [ 'tourist', 'church', 'house' ], model: { type: 'lei', colors: [ 0x2a1a10, 0x3a2414 ] },
		desc: 'Polished black kukui nuts on a cord.' } ),
	misc( 'ukulele', 'Ukulele', { w: 0.6, size: 4, rarity: 'uncommon', tags: [ 'house', 'tourist', 'school', 'church' ], model: { type: 'ukulele' },
		desc: 'Koa-wood ukulele, still in tune. Playing it is loud.' } ),
	misc( 'tiki', 'Tiki carving', { w: 1.2, size: 3, tags: [ 'tourist', 'hotel', 'house' ], model: { type: 'tiki' },
		desc: 'Souvenir tiki. Heavy enough to throw, not much else.' } ),
	misc( 'rubber_duck', 'Rubber duck', { w: 0.05, size: 0.5, tags: [ 'house', 'hotel' ], model: { type: 'duck' },
		desc: 'Squeaks. Loudly.' } ),
	misc( 'laptop', 'Laptop', { w: 1.8, size: 3, rarity: 'uncommon', tags: [ 'office', 'school', 'house', 'hotel' ], model: { type: 'laptop' },
		desc: 'Dead battery. Somebody\'s whole life is on it.' } ),
	misc( 'family_photo', 'Family photo', { w: 0.01, size: 0.5, tags: [ 'house', 'car' ],
		model: { type: 'box', size: [ 0.15, 0.004, 0.1 ], labelAxis: 'y', label: { bg: 0x6ab8d8, fg: 0xffffff, text: 'ALOHA!', sub: 'Waikīkī · summer', band: 0xf2c21a, style: 'band', glyph: 'palm', glyphColor: 0x2a6a2a, size: 0.26 } },
		desc: 'A family grinning on Waikīkī beach. Someone is still looking for them.' } ),

	// ================= books and notes =================
	book( 'survival_manual', 'Survival manual', { rarity: 'uncommon', tags: [ 'military', 'outdoor', 'school' ], model: { type: 'book', color: 0x4a5234, title: 'SURVIVAL', sub: 'FM 21-76', glyph: 'star' },
		pages: [ 'Water first: three days without it kills. Boil or treat anything you did not see come out of a sealed bottle.', 'Seawater only makes thirst worse. Distil it over a fire.', 'Keep a fire small and fed; a big one is a beacon.' ],
		desc: 'Army field manual. Water, fire, shelter, signalling.' } ),
	book( 'field_guide', 'Plants of Hawaiʻi', { tags: [ 'school', 'tourist', 'house', 'observatory' ], model: { type: 'book', color: 0x2a6a3a, title: 'PLANTS OF HAWAIʻI', sub: 'A field guide', glyph: 'leaf', size: [ 0.2, 0.025, 0.14 ] },
		pages: [ 'Coconut palms grow along every coast: shake a short one and nuts fall. A blade opens them.', 'Banana plants grow in wet valleys and backyards.', 'Guava and lilikoʻi grow wild along trails. Kalo must be cooked — raw, it burns.' ],
		desc: 'Field guide to native and canoe plants.' } ),
	book( 'fishing_guide', 'Shore fishing in Hawaiʻi', { rarity: 'uncommon', tags: [ 'fishing', 'boat', 'house', 'sports' ], skill: 'fishing',
		model: { type: 'book', color: 0x1a5a8a, title: 'SHORE FISHING', sub: 'in Hawaiʻi', glyph: 'fish', size: [ 0.2, 0.02, 0.14 ] },
		pages: [ 'Fish at dawn and dusk. Rocky points hold ulua; sandy flats hold reef fish.', 'Deep water off a ledge is where ahi and mahimahi pass.', 'Strike when the bobber dips — not before. Bait doubles your bites.' ],
		desc: 'Well-thumbed paperback. Reading it makes you a better fisherman.' } ),
	book( 'first_aid_manual', 'First aid handbook', { tags: [ 'school', 'office', 'fire', 'first_aid' ], model: { type: 'book', color: 0xc0282a, title: 'FIRST AID', sub: 'Handbook', glyph: 'cross', fg: 0xffffff },
		pages: [ 'Bleeding: bandage it now — every minute costs blood.', 'A broken leg needs a splint: two sticks and some rags will do.', 'Infected bites need antibiotics. Pharmacies, clinics and hospitals.' ],
		desc: 'Red Cross pocket handbook.' } ),
	book( 'phrasebook', 'Hawaiian phrasebook', { tags: [ 'tourist', 'hotel', 'school' ], model: { type: 'book', color: 0xd8a020, title: 'ʻŌLELO HAWAIʻI', sub: 'Phrasebook', glyph: 'hibiscus', size: [ 0.16, 0.015, 0.11 ] },
		pages: [ 'Aloha — hello, goodbye, love.  Mahalo — thank you.', 'Mauka — towards the mountains.  Makai — towards the sea.', 'Kōkua — help.  E mālama pono — take care.' ],
		desc: 'Pocket guide for visitors.' } ),
	book( 'bible', 'Bible', { tags: [ 'church', 'hotel', 'house' ], model: { type: 'book', color: 0x1a1a1a, title: 'HOLY BIBLE', sub: '', fg: 0xd4a64a, size: [ 0.2, 0.04, 0.14 ] },
		pages: [ 'A pressed plumeria marks Psalm 23.' ], desc: 'Leather-bound, gilt-edged.' } ),
	book( 'comic_book', 'Comic book', { tags: [ 'house', 'convenience', 'school' ], model: { type: 'book', color: 0xf2c21a, title: 'SURF PATROL', sub: '#42', glyph: 'wave', fg: 0xc0282a, size: [ 0.26, 0.006, 0.17 ] },
		pages: [ 'The surf patrol saves a tourist from a shark. Nobody saves anyone from anything any more.' ], desc: 'A dog-eared comic.' } ),
	book( 'evac_notice', 'Evacuation notice', { tags: [ 'street', 'house', 'police', 'post', 'school', 'church' ],
		model: { type: 'box', size: [ 0.21, 0.002, 0.28 ], labelAxis: 'y', label: { bg: 0xf2f2ee, fg: 0x1a1a1a, text: 'EMERGENCY', sub: 'EVACUATION ORDER', band: 0xc0282a, style: 'medical', size: 0.2 } },
		pages: [ 'HAWAIʻI EMERGENCY MANAGEMENT AGENCY — Residents of Oʻahu: proceed to the evacuation points at Aloha Stadium, Schofield Barracks or Kaneohe Bay. Bring water, medication and ID. Do not approach infected persons.', 'Handwritten on the back: "Stadium overrun Tues. Going to Uncle\'s in Waimānalo. — K."' ],
		desc: 'A flyer from the first days, taped to every door.' } ),
	book( 'diary_page', 'Torn diary page', { tags: [ 'house', 'trash', 'hotel', 'car' ],
		model: { type: 'box', size: [ 0.15, 0.002, 0.2 ], labelAxis: 'y', label: { bg: 0xf2ecd8, fg: 0x2a2a6a, text: 'Day 3', sub: '', style: 'plain', size: 0.2 } },
		pages: [ 'Day 3. The power went out on Kalākaua last night. The hotel staff barricaded the lobby but the tourists kept coming in with bites. We\'re going to try for the boat harbor at dawn.' ],
		desc: 'In pencil, pressed hard.' } ),
] );
