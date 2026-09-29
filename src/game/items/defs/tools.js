// Tools: lights, fire starters, navigation, fishing, repair, water containers, camping, radios.
// Schema extras we use (all inside `tool`):
//   battery   hours of charge (game hours) for battery tools, or burn time for torches / chemlights
//   liquid    litres a container holds
//   light     { range (m), angle (rad, spot lights), color, intensity, kind: 'spot'|'point', flicker }
//   uses      matches in a box, lighter fuel, patches in a sewing kit… (stack.data.uses, starts full)
//   provides  extra tool kinds this item counts as for opening cans / crafting (a multitool is also pliers)
//   zoom      magnification for optics the hands module can aim with
//   quality   fishing rods: bite and landing chance multiplier
import { defineItems } from '../ItemDB.js';

function tool( id, name, kind, o ) {
	const t = { kind };
	for ( const k of [ 'battery', 'liquid', 'light', 'uses', 'provides', 'zoom', 'quality', 'metal', 'rechargeable' ] ) if ( o[ k ] !== undefined ) t[ k ] = o[ k ];
	return {
		id, name, cat: 'tool', desc: o.desc || '', weight: o.w ?? 0.2, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'tool', ...( o.tags || [] ) ], model: o.model, tool: t,
	};
}
const bottle = ( o ) => ( { type: 'bottle', ...o } );

defineItems( [
	// ================= light =================
	tool( 'flashlight', 'Flashlight', 'flashlight', { w: 0.3, battery: 8, rechargeable: true, rarity: 'common', tags: [ 'house', 'garage', 'hardware', 'police', 'car', 'outdoor' ],
		light: { kind: 'spot', range: 48, angle: 0.42, color: 0xfff1dc, intensity: 90 }, model: { type: 'flashlight', len: 0.2 },
		desc: 'Uses batteries.' } ),
	tool( 'headlamp', 'Headlamp', 'headlamp', { w: 0.12, battery: 12, rechargeable: true, rarity: 'uncommon', tags: [ 'outdoor', 'hardware', 'sports', 'garage' ],
		light: { kind: 'spot', range: 30, angle: 0.62, color: 0xf6f2ff, intensity: 55 }, model: { type: 'headlamp' },
		desc: 'Hands-free light. Uses batteries.' } ),
	tool( 'lantern', 'LED lantern', 'lantern', { w: 0.6, size: 2, battery: 20, rechargeable: true, rarity: 'uncommon', tags: [ 'outdoor', 'hardware', 'house', 'garage' ],
		light: { kind: 'point', range: 12, color: 0xffe2b0, intensity: 16 }, model: { type: 'lantern', color: 0x2a5a3a },
		desc: 'Area light. Uses batteries.' } ),
	tool( 'phone', 'Smartphone', 'phone', { w: 0.18, size: 0.5, battery: 2, rechargeable: true, tags: [ 'house', 'office', 'civilian', 'tourist', 'car' ],
		light: { kind: 'spot', range: 14, angle: 0.8, color: 0xf2f6ff, intensity: 14 }, model: { type: 'phone', cracked: true },
		desc: 'Light and clock.' } ),
	tool( 'chemlight', 'Chemlight (green)', 'chemlight', { w: 0.03, size: 0.5, stack: 4, battery: 10, rarity: 'common', tags: [ 'military', 'outdoor', 'police', 'fire', 'boat' ],
		light: { kind: 'point', range: 6, color: 0x5aff6a, intensity: 3 }, model: { type: 'chemlight', color: 0x5aff6a },
		desc: 'Snap to light. Lasts 10 h.' } ),
	tool( 'chemlight_red', 'Chemlight (red)', 'chemlight', { w: 0.03, size: 0.5, stack: 4, battery: 10, rarity: 'uncommon', tags: [ 'military', 'outdoor', 'boat' ],
		light: { kind: 'point', range: 5, color: 0xff3a3a, intensity: 3 }, model: { type: 'chemlight', color: 0xff3a3a },
		desc: 'Snap to light. Lasts 10 h.' } ),
	tool( 'torch', 'Torch', 'torch', { w: 0.5, size: 3, battery: 1.5, rarity: 'uncommon', tags: [ 'crafted' ],
		light: { kind: 'point', range: 14, color: 0xff9a40, intensity: 14, flicker: true }, model: { type: 'stick', len: 0.55, r: 0.016, rag: 0x3a2a1a },
		desc: 'Light with a lighter or matches.' } ),

	// ================= fire =================
	tool( 'lighter', 'Lighter', 'lighter', { w: 0.03, size: 0.5, uses: 120, rarity: 'common', tags: [ 'house', 'convenience', 'bar', 'gas_station', 'civilian', 'car' ],
		model: { type: 'lighter', color: 0xd02a6a }, desc: 'Lights fires and torches.' } ),
	tool( 'lighter_zippo', 'Windproof lighter', 'lighter', { w: 0.06, size: 0.5, uses: 200, rarity: 'uncommon', tags: [ 'military', 'bar', 'pawn' ],
		model: { type: 'lighter', style: 'zippo' }, desc: 'Lights fires and torches.' } ),
	tool( 'matches', 'Matches', 'matches', { w: 0.03, size: 0.5, uses: 20, tags: [ 'house', 'kitchen', 'convenience', 'restaurant', 'church', 'outdoor' ],
		model: { type: 'box', size: [ 0.055, 0.017, 0.037 ], labelAxis: 'y', label: { bg: 0xc0282a, fg: 0xf2e6c8, text: 'SAFETY MATCHES', sub: '20 · Strike on box', band: 0xf2c21a, style: 'plain', size: 0.22 } },
		desc: 'Lights fires and torches.' } ),
	tool( 'campfire_kit', 'Fire kit', 'campfire', { w: 1.6, size: 5, tags: [ 'crafted', 'outdoor' ],
		model: { type: 'bundle', rag: 0xd8cfc0 }, desc: 'Place, then light.' } ),
	tool( 'camp_stove', 'Camp stove', 'stove', { w: 0.6, size: 2, uses: 10, rarity: 'uncommon', tags: [ 'outdoor', 'hardware', 'sports' ],
		model: { type: 'stove' }, desc: 'Portable cooking station.' } ),

	// ================= navigation and optics =================
	tool( 'map_hawaii', 'Map of Hawaiʻi', 'map', { w: 0.08, size: 1, tags: [ 'house', 'gas_station', 'tourist', 'hotel', 'car', 'office', 'post' ],
		model: { type: 'map' }, desc: 'Opens the map.' } ),
	tool( 'compass', 'Compass', 'compass', { w: 0.05, size: 0.5, rarity: 'uncommon', tags: [ 'outdoor', 'military', 'sports', 'boat' ],
		model: { type: 'compass' }, desc: 'Shows heading.' } ),
	tool( 'binoculars', 'Binoculars', 'binoculars', { w: 0.7, size: 2, zoom: 7, rarity: 'uncommon', tags: [ 'outdoor', 'military', 'hunting', 'tourist', 'boat' ],
		model: { type: 'binoculars' }, desc: 'Aim to zoom.' } ),
	tool( 'rangefinder', 'Laser rangefinder', 'rangefinder', { w: 0.3, size: 1, zoom: 6, battery: 30, rechargeable: true, rarity: 'rare', tags: [ 'hunting', 'military', 'sports' ],
		model: { type: 'rangefinder' }, desc: 'Measures distance.' } ),
	tool( 'watch', 'Wristwatch', 'watch', { w: 0.08, size: 0.5, tags: [ 'house', 'pawn', 'civilian', 'sports' ],
		model: { type: 'watch', digital: true }, desc: 'Shows the time.' } ),
	tool( 'gps', 'Handheld GPS', 'gps', { w: 0.25, size: 1, battery: 14, rechargeable: true, rarity: 'rare', tags: [ 'outdoor', 'military', 'boat', 'sports' ],
		model: { type: 'gps' }, desc: 'Shows your position.' } ),

	// ================= fishing =================
	tool( 'fishing_rod', 'Fishing rod', 'fishingrod', { w: 0.9, size: 6, quality: 1, rarity: 'uncommon', tags: [ 'fishing', 'sports', 'beach', 'boat', 'garage' ],
		model: { type: 'rod', len: 1.9, color: 0x2a3a5a }, desc: 'Cast at open water.' } ),
	tool( 'fishing_rod_improvised', 'Improvised fishing rod', 'fishingrod', { w: 0.6, size: 6, quality: 0.6, tags: [ 'crafted' ],
		model: { type: 'rod', len: 1.7, color: 0x6a4a2e, improvised: true }, desc: 'Cast at open water.' } ),
	tool( 'tackle_box', 'Tackle box', 'tackle', { w: 0.8, size: 2, uses: 30, rarity: 'uncommon', tags: [ 'fishing', 'boat', 'garage', 'sports' ],
		model: { type: 'toolbox', size: [ 0.3, 0.12, 0.16 ], color: 0x2a6a3a }, desc: 'Faster bites while carried.' } ),

	// ================= repair and utility =================
	tool( 'can_opener', 'Can opener', 'canopener', { w: 0.1, size: 0.5, tags: [ 'kitchen', 'house', 'restaurant', 'outdoor' ],
		model: { type: 'canopener' }, desc: 'Opens cans without spilling.' } ),
	tool( 'multitool', 'Multitool', 'cut', { w: 0.25, size: 0.5, provides: [ 'canopener', 'pliers', 'screwdriver' ], rarity: 'uncommon', tags: [ 'hardware', 'outdoor', 'military', 'garage' ],
		model: { type: 'multitool' }, desc: 'Blade and can opener.' } ),
	tool( 'lockpick', 'Lockpick set', 'lockpick', { w: 0.05, size: 0.5, rarity: 'rare', tags: [ 'police', 'pawn', 'crafted' ],
		model: { type: 'lockpick' }, desc: 'Opens locked doors.' } ),
	tool( 'toolbox', 'Toolbox', 'toolbox', { w: 4, size: 5, rarity: 'uncommon', tags: [ 'garage', 'hardware', 'car', 'work' ],
		model: { type: 'toolbox' }, desc: 'Vehicle repairs.' } ),
	tool( 'sewing_kit', 'Sewing kit', 'sewing', { w: 0.1, size: 0.5, uses: 6, tags: [ 'house', 'hotel', 'clothing' ],
		model: { type: 'sewing' }, desc: 'Repairs clothing.' } ),
	tool( 'duct_tape', 'Duct tape', 'tape', { w: 0.25, size: 1, uses: 5, tags: [ 'hardware', 'garage', 'house', 'car', 'work' ],
		model: { type: 'roll', tape: true, color: 0xa8acb2, r: 0.05, w: 0.048, inner: 0x8a6a4a }, desc: 'Patches gear.' } ),
	tool( 'weapon_cleaning_kit', 'Weapon cleaning kit', 'cleaning', { w: 0.4, size: 1, uses: 5, rarity: 'rare', tags: [ 'gunstore', 'military', 'police', 'hunting' ],
		model: { type: 'kit', style: 'pouch', size: [ 0.18, 0.05, 0.1 ], color: 0x2a2a22, cross: null, label: { bg: 0x1a1a1a, fg: 0xd4a64a, text: 'CLEANING KIT', style: 'plain', size: 0.3 } },
		desc: 'Restores firearm condition.' } ),
	tool( 'hand_saw', 'Hand saw', 'saw', { w: 0.6, size: 3, rarity: 'uncommon', tags: [ 'hardware', 'garage', 'work', 'farm' ],
		model: { type: 'parts', parts: [ [ 'box', [ 0.42, 0.002, 0.1 ], 0xb8bcc2, [ 0.08, 0, 0 ], null, { metal: 0.9, rough: 0.3 } ], [ 'rbox', [ 0.12, 0.03, 0.11, 0.01 ], 0x8a3a1a, [ - 0.19, 0, 0 ] ] ] },
		desc: 'Cuts firewood.' } ),
	tool( 'whistle', 'Whistle', 'whistle', { w: 0.02, size: 0.5, tags: [ 'sports', 'school', 'police', 'boat', 'outdoor' ],
		model: { type: 'whistle' }, desc: 'Loud. Attracts infected.' } ),
	tool( 'batteries', 'AA batteries', 'battery', { w: 0.025, size: 0.5, stack: 4, tags: [ 'house', 'convenience', 'hardware', 'office', 'military', 'grocery' ],
		model: { type: 'battery' }, desc: 'Powers lights and radios.' } ),
	tool( 'solar_charger', 'Solar charger', 'solar', { w: 0.4, size: 1, rarity: 'rare', tags: [ 'outdoor', 'sports', 'office' ],
		model: { type: 'parts', parts: [ [ 'rbox', [ 0.22, 0.012, 0.15, 0.004 ], 0x1a2a4a, null, null, { metal: 0.4, rough: 0.2 } ], [ 'box', [ 0.2, 0.002, 0.13 ], 0x2a4a8a, [ 0, 0.012, 0 ], null, { metal: 0.6, rough: 0.15 } ], [ 'cylX', [ 0.003, 0.2 ], 0x1a1a1a, [ 0.14, 0.004, 0.05 ] ] ] },
		desc: 'Recharges devices in sunlight.' } ),

	// ================= water =================
	tool( 'water_bottle', 'Water bottle', 'bottle', { w: 0.03, size: 1, liquid: 0.5, tags: [ 'convenience', 'grocery', 'house', 'vending', 'office', 'car', 'gas_station' ],
		model: bottle( { style: 'water', h: 0.21, r: 0.033, clear: true, glass: 0xd8eef5, liquid: 0x9ac8e0, liquidClear: true, fill: 0.8, cap: 0x2a6ad6, label: { bg: 0x2a8ad6, fg: 0xffffff, text: 'PURE HAWAIIAN', sub: 'Artesian water', style: 'plain', glyph: 'drop', glyphColor: 0xffffff, size: 0.2 }, labelY: 0.3, labelH: 0.22 } ),
		desc: 'Holds 0.5 L.' } ),
	tool( 'water_jug', 'Water jug', 'bottle', { w: 0.12, size: 4, liquid: 3.8, tags: [ 'grocery', 'house', 'garage', 'convenience' ],
		model: bottle( { style: 'jug', h: 0.29, r: 0.075, clear: true, glass: 0xe8f2f5, liquid: 0x9ac8e0, liquidClear: true, fill: 0.7, cap: 0x2a6ad6, opacity: 0.4 } ),
		desc: 'Holds 3.8 L.' } ),
	tool( 'empty_bottle', 'Glass bottle', 'bottle', { w: 0.35, size: 1, liquid: 0.75, tags: [ 'trash', 'bar', 'kitchen' ],
		model: bottle( { style: 'wine', h: 0.28, r: 0.036, clear: true, glass: 0x4a7a3a, opacity: 0.55, cap: null } ),
		desc: 'Holds 0.75 L.' } ),
	tool( 'canteen', 'Canteen', 'canteen', { w: 0.35, size: 2, liquid: 1, metal: true, rarity: 'uncommon', tags: [ 'military', 'outdoor', 'hunting' ],
		model: { type: 'canteen', color: 0x5a6a3a }, desc: 'Holds 1 L. Boils on a fire.' } ),
	tool( 'hydration_bladder', 'Hydration bladder', 'bottle', { w: 0.2, size: 2, liquid: 2, rarity: 'uncommon', tags: [ 'outdoor', 'sports', 'military' ],
		model: { type: 'ivbag', color: 0x3a8ad6, text: '2 L' }, desc: 'Holds 2 L.' } ),
	tool( 'cooking_pot', 'Cooking pot', 'pot', { w: 0.9, size: 3, liquid: 2, metal: true, tags: [ 'kitchen', 'house', 'restaurant', 'outdoor' ],
		model: { type: 'pot' }, desc: 'Boils water. Cooks rice.' } ),

	// ================= radios =================
	tool( 'radio', 'Emergency radio', 'radio', { w: 0.6, size: 2, battery: 30, rechargeable: true, rarity: 'uncommon', tags: [ 'house', 'hardware', 'outdoor', 'office', 'fire' ],
		model: { type: 'radio', style: 'portable', color: 0xc0282a }, desc: 'Weather forecast.' } ),
	tool( 'walkie_talkie', 'Walkie-talkie', 'radio', { w: 0.25, size: 1, battery: 16, rechargeable: true, rarity: 'uncommon', tags: [ 'police', 'military', 'fire', 'hotel', 'security' ],
		model: { type: 'radio', color: 0x1a1a1a } } ),

	// ================= camping =================
	tool( 'tent', 'Tent', 'tent', { w: 2.4, size: 8, rarity: 'rare', tags: [ 'outdoor', 'sports' ],
		model: { type: 'stuffsack', len: 0.55, r: 0.1, color: 0x2a7a4a, poles: true }, desc: 'Sleep anywhere.' } ),
	tool( 'sleeping_bag', 'Sleeping bag', 'sleepingbag', { w: 1.2, size: 5, rarity: 'uncommon', tags: [ 'outdoor', 'sports', 'military', 'house' ],
		model: { type: 'stuffsack', len: 0.4, r: 0.14, color: 0x2a4a8a, drawcord: true }, desc: 'Sleep outdoors.' } ),
] );
