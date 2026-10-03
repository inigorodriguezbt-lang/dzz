// Outdoors (docs/ITEMS_PLAN.md "outdoors"): camping, water, Hawaiian fishing, hunting and craft from the wild.
//   camp: a ferro rod (a lighter that never runs dry for long), a magnifying glass and a bow drill (fire without one),
//     a signal mirror (a plane may answer with a supply drop), paracord, carabiners, an emergency blanket (wrap up: warm
//     and dry), a hammock, a sleeping pad and a bedroll, a camping chair, a mosquito net, bug spray and mosquito coils
//     (mosquitoes bite at dusk outdoors: stress, and a bad night's sleep), a tarp shelter (the rain doesn't reach you);
//   water: a filter straw (drink dirty water), a gravity filter and a bottle filter of sand and charcoal, a solar still
//     (fresh water from the ground or from seawater, in the sun), a bucket, a canvas water bag, a bamboo canteen;
//   fishing: a throw net (cast at the shore), the Hawaiian sling and a spear gun (Spearfish in the sea; any spear with
//     the 'fish' tool works), bone hooks (makau) for a hand line, Kona lures and squid jigs (carried: bigger fish, squid at
//     night), squid and spiny lobster, a stringer (fish stay alive while you're in the water), a dive knife, the ʻie fish
//     trap and a crab trap set in the shallows;
//   hunting: a deer call (draws axis deer), a pig trap, a skinning knife, meat hooks, a smoking rack and a tanning frame;
//   from the wild: coconut husk into sennit (ʻaha) and rope, coconut shells (a cup, then charcoal), bamboo (spears,
//     canteens, racks), palm fronds (thatch, a lean-to, a bed, the ʻie trap), knapped basalt flakes, a stone adze (koʻi).
// Placed kinds: ext/outdoors/kinds.js. The numbers: ext/outdoors/logic.js. What goes on around you (mosquitoes, the
// blanket, the lean-to): ext/outdoors/runtime.js. Tool kinds this domain adds: magnifier, bowdrill, mirror, blanket,
// castnet, fish (spearfishing, as the pole spear's), lure, jig, stringer, filter, filter_straw, repellent, call.
import { defineItems, getItem, makeStack, freshness } from '../../ItemDB.js';
import { extendLoot } from '../../Loot.js';
import { addRecipes, R } from '../../recipes.js';
import { addCombos, liquidIn } from '../../combos.js';
import { addUseActions, addEatHook, addSpoilHook } from '../../hooks.js';
import { provides } from '../../util.js';
import { addFishingMod } from '../../Fishing.js';
import { SPEAR, spearChance, spearCatch, sharkChance, castNet, HARVEST, SIGNAL, signalChance, knapChance, MOSQ, clamp } from '../../ext/outdoors/logic.js';
import { env, sunny, water, kindle, unlitFire, attach, state } from '../../ext/outdoors/runtime.js';
import { ensureOutdoorsSound } from '../../ext/outdoors/sounds.js';
import '../../ext/outdoors/kinds.js';
// the outdoor sites' tables (site_<kind>) are defined there; imported first so they can be extended here
import '../../sites/tables.js';

// ---- helpers ----------------------------------------------------------------------------------------------------------

function tool( id, name, kind, o ) {
	const t = { kind };
	for ( const k of [ 'liquid', 'provides', 'uses', 'metal', 'quality' ] ) if ( o[ k ] !== undefined ) t[ k ] = o[ k ];
	const d = { id, name, cat: 'tool', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'tool', ...( o.tags || [] ) ], model: o.model, tool: t };
	if ( o.place ) d.place = o.place;
	return d;
}
const mat = ( id, name, o ) => ( { id, name, cat: 'material', desc: o.desc || '', weight: o.w ?? 0.2, size: o.size ?? 1, stack: o.stack ?? 1,
	rarity: o.rarity || 'common', tags: [ 'material', ...( o.tags || [] ) ], model: o.model } );
function food( id, name, o ) {
	return { id, name, cat: 'food', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'food', ...( o.tags || [] ) ], model: o.model,
		food: { kcal: o.kcal ?? 1, water: o.water ?? 0, spoil: o.spoil ?? 0, opener: false, raw: !! o.raw, sick: o.sick ?? 0, cooked: o.cooked || null, portions: o.portions ?? 1 } };
}
// [ damage, speed, reach, stamina, kind, twoHanded, wear, tools ]; `hold` is the weapons module's melee shape held in
// the hands (GunModels' meleeParts by model.kind), the world and icon model is ours
function melee( id, name, m, o ) {
	const [ damage, speed, reach, stamina, kind, twoHanded, wear, tools ] = m;
	return { id, name, cat: 'melee', desc: o.desc || '', weight: o.w, size: o.size, stack: 1, rarity: o.rarity || 'common', tags: o.tags || [],
		melee: { damage, speed, reach, stamina, kind, twoHanded, wear, tools }, model: { ...o.model, kind: o.hold } };
}
const O = ( type, o = {} ) => ( { type: 'out_' + type, ...o } );
// printed labels (the food.js form)
const L = ( text, sub, bg, fg, band, glyph, style = 'band', extra = {} ) => ( { text, sub, bg, fg, band, glyph, style, ...extra } );

// raw and cooked pairs (what a fire turns the raw one into)
function seaPair( key, name, o ) {
	return [
		food( 'raw_' + key, 'Raw ' + name, { w: o.w, size: o.size ?? 2, kcal: o.kcal * 0.8, water: 4, spoil: o.spoilRaw ?? 20, raw: true, sick: o.sick ?? 0.1, cooked: 'cooked_' + key,
			rarity: o.rarity, tags: [ ...o.tags, 'raw', 'fishing' ], model: O( o.model, { cooked: false } ), desc: o.desc } ),
		food( 'cooked_' + key, 'Cooked ' + name, { w: o.w * 0.85, size: o.size ?? 2, kcal: o.kcal, water: 2, spoil: o.spoilCooked ?? 48,
			rarity: o.rarity, tags: [ ...o.tags, 'cooked' ], model: O( o.model, { cooked: true } ), desc: 'Ready to eat.' } ),
	];
}

// ======================================================================================================================
// the items
// ======================================================================================================================

defineItems( [
	// ================= camp =================
	tool( 'ferro_rod', 'Ferro rod', 'lighter', { w: 0.06, size: 0.5, uses: 300, rarity: 'uncommon', tags: [ 'outdoor', 'sports', 'military', 'hardware' ],
		model: O( 'ferro' ), desc: 'Sparks. Lights fires and torches.' } ),
	tool( 'magnifying_glass', 'Magnifying glass', 'magnifier', { w: 0.1, size: 0.5, tags: [ 'office', 'school', 'house', 'observatory' ],
		model: O( 'magnifier' ), desc: 'Lights a fire in full sun.' } ),
	tool( 'signal_mirror', 'Signal mirror', 'mirror', { w: 0.06, size: 0.5, rarity: 'uncommon', tags: [ 'military', 'outdoor', 'boat', 'sports' ],
		model: O( 'mirror' ), desc: 'Flash at aircraft. Needs sun.' } ),
	mat( 'paracord', 'Paracord', { w: 0.15, size: 0.5, stack: 4, tags: [ 'cordage', 'outdoor', 'military', 'sports', 'hardware' ],
		model: O( 'hank' ), desc: 'Strong cord. Fishing line inside.' } ),
	mat( 'carabiner', 'Carabiner', { w: 0.05, size: 0.3, stack: 6, tags: [ 'metal', 'sports', 'hardware', 'outdoor' ],
		model: O( 'carabiner' ), desc: 'Hammocks and stringers.' } ),
	tool( 'emergency_blanket', 'Emergency blanket', 'blanket', { w: 0.06, size: 0.5, tags: [ 'outdoor', 'military', 'car', 'fire', 'hospital', 'sports' ],
		model: O( 'mylar' ), desc: 'Wrap up to warm and dry.' } ),
	tool( 'hammock', 'Hammock', 'hammock', { w: 0.9, size: 3, rarity: 'uncommon', tags: [ 'outdoor', 'sports', 'tourist' ],
		model: O( 'hammock_pack' ), place: { kind: 'hammock', sleep: 0.95, verb: 'Hang' }, desc: 'A bed off the ground.' } ),
	tool( 'sleeping_pad', 'Sleeping pad', 'pad', { w: 0.4, size: 4, tags: [ 'outdoor', 'sports', 'military' ],
		model: O( 'pad', { color: 0xd8a82a } ), place: { kind: 'camp_bed', sleep: 0.75, verb: 'Lay out', shape: 'pad' }, desc: 'Sleep anywhere. Rolls up with a bag.' } ),
	tool( 'bedroll', 'Bedroll', 'sleepingbag', { w: 1.6, size: 7, rarity: 'uncommon', tags: [ 'outdoor', 'crafted' ],
		model: O( 'bedroll' ), place: { kind: 'camp_bed', sleep: 0.95, verb: 'Lay out', shape: 'bedroll' }, desc: 'Pad and sleeping bag in one.' } ),
	tool( 'camping_chair', 'Camping chair', 'chair', { w: 2.2, size: 6, tags: [ 'outdoor', 'sports', 'beach' ],
		model: O( 'chair_bag' ), place: { kind: 'camp_seat', verb: 'Unfold' }, desc: 'Sit and rest.' } ),
	tool( 'mosquito_net', 'Mosquito net', 'net', { w: 0.3, size: 1, tags: [ 'outdoor', 'sports', 'military' ],
		model: O( 'netpack' ), desc: 'Sleep without bites. Scoops baitfish.' } ),
	tool( 'bug_spray', 'Bug spray', 'repellent', { w: 0.2, size: 0.5, uses: 8, tags: [ 'outdoor', 'grocery', 'convenience', 'sports' ],
		model: { type: 'spray', r: 0.024, h: 0.15, cap: 0x2a8a3a, label: L( 'ISLAND SHIELD', 'Insect repellent · 25% DEET', 0x1a5a2a, 0xf2f2e8, 0xf2c21a, 'leaf', 'band', { glyphColor: 0x8ad04a, size: 0.26 } ) },
		desc: 'Keeps mosquitoes off for 4 h.' } ),
	tool( 'mosquito_coil', 'Mosquito coil', 'coil', { w: 0.03, size: 0.3, stack: 10, tags: [ 'house', 'grocery', 'convenience', 'hardware', 'outdoor' ],
		model: O( 'coil' ), place: { kind: 'mosquito_coil', verb: 'Set' }, desc: 'Burns 7 h. Keeps mosquitoes off.' } ),
	tool( 'tarp_shelter', 'Tarp shelter', 'shelter', { w: 2.2, size: 6, rarity: 'uncommon', tags: [ 'outdoor' ],
		model: O( 'tarp_kit' ), place: { kind: 'lean_to', sleep: 0.9, verb: 'Pitch', shape: 'tarp' }, desc: 'Keeps the rain off.' } ),

	// ================= water =================
	tool( 'filter_straw', 'Filter straw', 'filter_straw', { w: 0.05, size: 0.5, rarity: 'uncommon', tags: [ 'outdoor', 'sports', 'military' ],
		model: O( 'straw' ), desc: 'Drink dirty water safely.' } ),
	tool( 'gravity_filter', 'Gravity filter', 'filter', { w: 0.35, size: 2, rarity: 'rare', tags: [ 'outdoor', 'sports', 'military' ],
		model: O( 'gravity' ), desc: 'Cleans dirty water in a container.' } ),
	tool( 'bottle_filter', 'Bottle filter', 'filter', { w: 0.35, size: 1, tags: [ 'crafted' ],
		model: O( 'bottlefilter' ), desc: 'Sand and charcoal. Cleans dirty water.' } ),
	tool( 'solar_still', 'Solar still kit', 'still', { w: 0.5, size: 2, rarity: 'uncommon', tags: [ 'outdoor', 'military' ],
		model: O( 'still_kit' ), place: { kind: 'solar_still', verb: 'Dig' }, desc: 'Fresh water from seawater, in the sun.' } ),
	mat( 'plastic_sheet', 'Plastic sheeting', { w: 0.4, size: 2, tags: [ 'plastic', 'hardware', 'construction', 'garage' ],
		model: O( 'sheet' ), desc: 'Clear. For a solar still.' } ),
	tool( 'bucket', 'Bucket', 'bucket', { w: 0.9, size: 6, liquid: 10, tags: [ 'hardware', 'farm', 'garage', 'beach', 'fishing' ],
		model: O( 'bucket', { color: 0xe8642a } ), desc: 'Holds 10 L.' } ),
	tool( 'water_bag', 'Canvas water bag', 'bottle', { w: 0.5, size: 3, liquid: 7.5, rarity: 'uncommon', tags: [ 'outdoor', 'military', 'farm' ],
		model: O( 'waterbag' ), desc: 'Holds 7.5 L.' } ),
	tool( 'bamboo_canteen', 'Bamboo canteen', 'bottle', { w: 0.3, size: 2, liquid: 1, tags: [ 'crafted', 'wood' ],
		model: O( 'bamboo_can' ), desc: 'Holds 1 L.' } ),

	// ================= fishing =================
	tool( 'throw_net', 'Throw net', 'castnet', { w: 2.5, size: 5, rarity: 'uncommon', tags: [ 'fishing', 'boat', 'local' ],
		model: O( 'castnet' ), desc: 'Cast over shallow water for small fish.' } ),
	tool( 'hawaiian_sling', 'Hawaiian sling', 'fish', { w: 0.6, size: 6, quality: 1.2, rarity: 'uncommon', tags: [ 'fishing', 'surf', 'dive', 'local' ],
		model: O( 'sling' ), desc: 'Spearfish in the sea.' } ),
	tool( 'spear_gun', 'Spear gun', 'fish', { w: 2.2, size: 9, quality: 1.5, rarity: 'rare', tags: [ 'fishing', 'surf', 'dive', 'sports' ],
		model: O( 'speargun' ), desc: 'Spearfish. Reaches big fish.' } ),
	mat( 'fishing_line', 'Fishing line', { w: 0.05, size: 0.3, stack: 4, tags: [ 'fishing', 'line', 'plastic' ],
		model: O( 'spool' ), desc: 'Hand lines, lures, rod repairs.' } ),
	mat( 'bone_hook', 'Bone hook (makau)', { w: 0.01, size: 0.2, stack: 6, rarity: 'uncommon', tags: [ 'fishing', 'bone', 'local' ],
		model: O( 'makau' ), desc: 'For a hand line or a lure.' } ),
	tool( 'hand_line', 'Hand line', 'fishingrod', { w: 0.2, size: 1, quality: 0.8, tags: [ 'fishing', 'crafted' ],
		model: O( 'handline' ), desc: 'Fish without a rod.' } ),
	tool( 'fishing_lure', 'Kona lure', 'lure', { w: 0.08, size: 0.5, rarity: 'uncommon', tags: [ 'fishing', 'boat', 'sports' ],
		model: O( 'lure' ), desc: 'Carried: big fish bite sooner.' } ),
	tool( 'squid_jig', 'Squid jig', 'jig', { w: 0.03, size: 0.3, rarity: 'uncommon', tags: [ 'fishing', 'boat' ],
		model: O( 'jig' ), desc: 'Carried: squid bite at night.' } ),
	...seaPair( 'squid', 'squid', { w: 0.4, kcal: 340, model: 'squid', tags: [ 'fish', 'market' ], spoilRaw: 18, rarity: 'uncommon', desc: 'Cut it up for bait.' } ),
	...seaPair( 'lobster', 'lobster', { w: 0.8, kcal: 380, model: 'lobster', tags: [ 'shell', 'market' ], spoilRaw: 24, rarity: 'rare', sick: 0.15, desc: 'Cook it at a fire.' } ),
	tool( 'fish_stringer', 'Fish stringer', 'stringer', { w: 0.15, size: 0.5, tags: [ 'fishing' ],
		model: O( 'stringer' ), desc: 'Fish stay alive while you swim.' } ),
	melee( 'dive_knife', 'Dive knife', [ 30, 1.9, 1.2, 4, 'blade', false, 0.004, [ 'cut', 'skin' ] ],
		{ w: 0.25, size: 1, rarity: 'uncommon', tags: [ 'surf', 'dive', 'fishing' ], model: O( 'diveknife' ), hold: 'combat_knife', desc: 'Blade. Rustproof.' } ),
	tool( 'fish_trap', 'ʻIe fish trap', 'fishtrap', { w: 1.8, size: 8, rarity: 'uncommon', tags: [ 'fishing', 'local' ],
		model: O( 'ie' ), place: { kind: 'fish_trap', verb: 'Set', water: 'only' }, desc: 'Set in the shallows. Catches fish.' } ),
	tool( 'crab_trap', 'Crab trap', 'crabtrap', { w: 2.5, size: 8, rarity: 'uncommon', tags: [ 'fishing', 'boat' ],
		model: O( 'crabtrap' ), place: { kind: 'crab_trap', verb: 'Set', water: 'only' }, desc: 'Set in the sea. Crabs at night.' } ),

	// ================= hunting =================
	tool( 'deer_call', 'Deer call', 'call', { w: 0.05, size: 0.3, rarity: 'uncommon', tags: [ 'hunting', 'sports' ],
		model: O( 'deercall' ), desc: 'Draws axis deer. Loud.' } ),
	tool( 'pig_trap', 'Pig trap', 'pigtrap', { w: 14, size: 12, rarity: 'rare', tags: [ 'farm', 'hunting' ],
		model: O( 'pigtrap_pack' ), place: { kind: 'pig_trap', verb: 'Set up' }, desc: 'Bait it. Catches feral pigs.' } ),
	melee( 'skinning_knife', 'Skinning knife', [ 32, 1.8, 1.2, 4, 'blade', false, 0.005, [ 'cut', 'skin', 'open_can' ] ],
		{ w: 0.2, size: 1, rarity: 'uncommon', tags: [ 'hunting', 'sports', 'skinning' ], model: O( 'skinknife' ), hold: 'hunting_knife', desc: 'More leather from a hide.' } ),
	mat( 'meat_hook', 'Meat hook', { w: 0.12, size: 0.5, stack: 4, tags: [ 'metal', 'restaurant', 'farm' ],
		model: O( 'meathook' ), desc: 'Hangs more on a smoking rack.' } ),
	tool( 'smoking_rack', 'Smoking rack', 'rack', { w: 4, size: 10, tags: [ 'crafted', 'wood' ],
		model: O( 'rack_bundle' ), place: { kind: 'smoking_rack', verb: 'Set up' }, desc: 'Smokes meat and fish over hours.' } ),
	tool( 'tanning_frame', 'Tanning frame', 'frame', { w: 3.5, size: 10, tags: [ 'crafted', 'wood' ],
		model: O( 'frame_bundle' ), place: { kind: 'tanning_frame', verb: 'Set up' }, desc: 'Cures a hide into leather.' } ),

	// ================= from the wild =================
	mat( 'coconut_husk', 'Coconut husk', { w: 0.25, size: 1, stack: 6, tags: [ 'wild', 'beach', 'fibre' ],
		model: O( 'husk' ), desc: 'Fibre for sennit. Burns.' } ),
	mat( 'sennit', 'Sennit (ʻaha)', { w: 0.1, size: 0.5, stack: 6, tags: [ 'cordage', 'local', 'crafted' ],
		model: O( 'sennit' ), desc: 'Coconut-fibre cord.' } ),
	tool( 'coconut_shell', 'Coconut shell', 'cup', { w: 0.15, size: 1, liquid: 0.35, tags: [ 'wild', 'wood' ],
		model: O( 'shell' ), desc: 'A cup. Burns to charcoal.' } ),
	mat( 'bamboo_pole', 'Bamboo pole', { w: 0.9, size: 5, stack: 4, tags: [ 'wild', 'wood', 'farm' ],
		model: O( 'bamboo' ), desc: 'Spears, canteens, racks.' } ),
	mat( 'palm_frond', 'Palm frond', { w: 0.5, size: 4, stack: 6, tags: [ 'wild', 'beach' ],
		model: O( 'frond' ), desc: 'Thatch, beds, the ʻie trap.' } ),
	mat( 'palm_thatch', 'Palm thatch', { w: 1.2, size: 5, stack: 4, tags: [ 'local', 'crafted' ],
		model: O( 'thatch' ), desc: 'Woven fronds. For a lean-to.' } ),
	tool( 'thatch_shelter', 'Thatch lean-to', 'shelter', { w: 5, size: 12, tags: [ 'crafted' ],
		model: O( 'thatch_kit' ), place: { kind: 'lean_to', sleep: 0.85, verb: 'Pitch', shape: 'thatch' }, desc: 'Keeps the rain off.' } ),
	tool( 'frond_bed', 'Frond bed', 'bed', { w: 2, size: 8, tags: [ 'crafted' ],
		model: O( 'frond_bundle' ), place: { kind: 'camp_bed', sleep: 0.7, verb: 'Lay out', shape: 'fronds' }, desc: 'Sleep off the damp ground.' } ),
	melee( 'stone_adze', 'Stone adze (koʻi)', [ 40, 1.1, 1.5, 9, 'axe', false, 0.012, [ 'chop', 'cut' ] ],
		{ w: 1, size: 4, rarity: 'uncommon', tags: [ 'crafted', 'local' ], model: O( 'adze' ), hold: 'hatchet', desc: 'Chops. Wears fast.' } ),
	tool( 'basalt_flake', 'Basalt flake', 'cut', { w: 0.1, size: 0.3, stack: 3, provides: [ 'skin' ], tags: [ 'stone', 'crafted' ],
		model: O( 'flake' ), desc: 'A sharp edge. Dulls fast.' } ),
	tool( 'bow_drill', 'Bow drill', 'bowdrill', { w: 0.6, size: 3, tags: [ 'crafted', 'wood' ],
		model: O( 'bowdrill' ), desc: 'Friction fire. Slow, can fail.' } ),
	melee( 'bamboo_spear', 'Bamboo spear', [ 38, 1.0, 2.5, 9, 'spear', true, 0.012, [ 'fish' ] ],
		{ w: 0.9, size: 6, tags: [ 'crafted', 'wood' ], model: O( 'bamboo_spear' ), hold: 'fishing_spear', desc: 'Long reach. Spears fish.' } ),
] );

// ======================================================================================================================
// where they lie (visible loot: shelves, counters and floors; the outdoor sites' ground)
// ======================================================================================================================

const add = ( t, e ) => extendLoot( t, e );
add( 'sports', [ [ 'ferro_rod', 0.5 ], [ 'paracord', 0.6 ], [ 'carabiner', 0.5 ], [ 'emergency_blanket', 0.5 ], [ 'sleeping_pad', 0.5 ], [ 'camping_chair', 0.4 ],
	[ 'hammock', 0.3 ], [ 'bug_spray', 0.6 ], [ 'filter_straw', 0.35 ], [ 'gravity_filter', 0.1 ], [ 'fishing_lure', 0.4 ], [ 'squid_jig', 0.3 ], [ 'spear_gun', 0.08 ],
	[ 'hawaiian_sling', 0.2 ], [ 'deer_call', 0.2 ], [ 'skinning_knife', 0.25 ], [ 'mosquito_net', 0.3 ], [ 'signal_mirror', 0.15 ], [ 'solar_still', 0.08 ], [ 'fishing_line', 0.4 ] ] );
add( 'surf', [ [ 'hawaiian_sling', 0.5 ], [ 'spear_gun', 0.12 ], [ 'dive_knife', 0.4 ], [ 'throw_net', 0.2 ], [ 'fish_stringer', 0.3 ], [ 'bug_spray', 0.2 ] ] );
add( 'hardware', [ [ 'bucket', 0.8 ], [ 'plastic_sheet', 0.6 ], [ 'paracord', 0.5 ], [ 'mosquito_coil', 0.4, [ 2, 6 ] ], [ 'carabiner', 0.3 ], [ 'bug_spray', 0.3 ], [ 'pig_trap', 0.1 ] ] );
add( 'farm', [ [ 'bucket', 0.6 ], [ 'bamboo_pole', 0.6, [ 1, 3 ] ], [ 'meat_hook', 0.3 ], [ 'pig_trap', 0.1 ], [ 'water_bag', 0.3 ], [ 'coconut_husk', 0.3, [ 1, 3 ] ] ] );
add( 'house_garage', [ [ 'bucket', 0.4 ], [ 'camping_chair', 0.3 ], [ 'sleeping_pad', 0.15 ], [ 'paracord', 0.25 ], [ 'fishing_line', 0.3 ], [ 'mosquito_coil', 0.2 ] ] );
add( 'house_living', [ [ 'mosquito_coil', 0.5, [ 1, 4 ] ], [ 'magnifying_glass', 0.15 ], [ 'bug_spray', 0.25 ] ] );
add( 'house_bedroom', [ [ 'mosquito_net', 0.15 ] ] );
add( 'grocery', [ [ 'bug_spray', 0.3 ], [ 'mosquito_coil', 0.35, [ 2, 8 ] ] ] );
add( 'convenience', [ [ 'bug_spray', 0.25 ], [ 'mosquito_coil', 0.3, [ 2, 6 ] ] ] );
add( 'office', [ [ 'magnifying_glass', 0.15 ] ] );
add( 'desk', [ [ 'magnifying_glass', 0.2 ] ] );
add( 'school', [ [ 'magnifying_glass', 0.3 ] ] );
add( 'observatory', [ [ 'magnifying_glass', 0.3 ], [ 'emergency_blanket', 0.3 ] ] );
add( 'pawn', [ [ 'magnifying_glass', 0.2 ], [ 'stone_adze', 0.06 ], [ 'spear_gun', 0.05 ] ] );
add( 'military', [ [ 'emergency_blanket', 0.6 ], [ 'paracord', 0.8 ], [ 'signal_mirror', 0.3 ], [ 'filter_straw', 0.3 ], [ 'ferro_rod', 0.3 ], [ 'carabiner', 0.3 ],
	[ 'water_bag', 0.2 ], [ 'mosquito_net', 0.3 ], [ 'bug_spray', 0.3 ], [ 'sleeping_pad', 0.2 ] ] );
add( 'fire_station', [ [ 'emergency_blanket', 0.6 ], [ 'bucket', 0.4 ] ] );
add( 'hospital', [ [ 'emergency_blanket', 0.4 ] ] );
add( 'restaurant_kitchen', [ [ 'meat_hook', 0.3 ], [ 'bucket', 0.3 ] ] );
add( 'market', [ [ 'meat_hook', 0.2 ], [ 'raw_squid', 0.4 ], [ 'raw_lobster', 0.15 ], [ 'fishing_line', 0.2 ], [ 'throw_net', 0.08 ] ] );
add( 'warehouse', [ [ 'bucket', 0.4 ], [ 'plastic_sheet', 0.4 ], [ 'paracord', 0.3 ] ] );
add( 'beach', [ [ 'coconut_husk', 0.5, [ 1, 3 ] ], [ 'palm_frond', 0.4 ], [ 'bucket', 0.2 ], [ 'coconut_shell', 0.25 ], [ 'throw_net', 0.05 ] ] );
add( 'hotel_room', [ [ 'bug_spray', 0.2 ] ] );
// outdoors: camps and hikers carry camp gear, fishing spots their tackle, relief camps blankets and filters
add( 'site_campsite', [ [ 'ferro_rod', 0.3 ], [ 'paracord', 0.6 ], [ 'emergency_blanket', 0.3 ], [ 'hammock', 0.3 ], [ 'sleeping_pad', 0.4 ], [ 'camping_chair', 0.5 ],
	[ 'mosquito_net', 0.3 ], [ 'bug_spray', 0.5 ], [ 'mosquito_coil', 0.6, [ 1, 4 ] ], [ 'tarp_shelter', 0.15 ], [ 'bucket', 0.3 ], [ 'water_bag', 0.25 ], [ 'filter_straw', 0.2 ],
	[ 'bow_drill', 0.06 ], [ 'deer_call', 0.12 ], [ 'skinning_knife', 0.12 ], [ 'bamboo_pole', 0.3, [ 1, 2 ] ], [ 'coconut_shell', 0.2 ], [ 'carabiner', 0.3 ], [ 'smoking_rack', 0.05 ] ] );
add( 'site_hiker', [ [ 'filter_straw', 0.4 ], [ 'emergency_blanket', 0.5 ], [ 'paracord', 0.5 ], [ 'ferro_rod', 0.3 ], [ 'signal_mirror', 0.25 ], [ 'bug_spray', 0.4 ], [ 'carabiner', 0.4 ],
	[ 'sleeping_pad', 0.25 ], [ 'bedroll', 0.1 ], [ 'gravity_filter', 0.12 ], [ 'magnifying_glass', 0.08 ], [ 'hammock', 0.15 ] ] );
add( 'site_fishing_spot', [ [ 'throw_net', 0.35 ], [ 'hand_line', 0.4 ], [ 'fishing_line', 0.6 ], [ 'fishing_lure', 0.4 ], [ 'squid_jig', 0.35 ], [ 'bone_hook', 0.15, [ 1, 2 ] ],
	[ 'fish_stringer', 0.45 ], [ 'bucket', 0.8 ], [ 'camping_chair', 0.5 ], [ 'raw_squid', 0.3 ], [ 'crab_trap', 0.15 ], [ 'fish_trap', 0.06 ], [ 'hawaiian_sling', 0.2 ],
	[ 'dive_knife', 0.15 ], [ 'mosquito_coil', 0.3, [ 1, 3 ] ], [ 'coconut_shell', 0.1 ] ] );
add( 'site_beach_camp', [ [ 'camping_chair', 0.6 ], [ 'bucket', 0.4 ], [ 'hawaiian_sling', 0.12 ], [ 'throw_net', 0.08 ], [ 'coconut_husk', 0.5, [ 1, 3 ] ], [ 'coconut_shell', 0.3 ],
	[ 'bug_spray', 0.3 ], [ 'mosquito_coil', 0.3, [ 1, 3 ] ], [ 'palm_frond', 0.3 ], [ 'hammock', 0.15 ] ] );
add( 'site_fema_camp', [ [ 'emergency_blanket', 1, [ 1, 2 ] ], [ 'water_bag', 0.3 ], [ 'bucket', 0.4 ], [ 'filter_straw', 0.2 ], [ 'mosquito_net', 0.4 ], [ 'bug_spray', 0.4 ],
	[ 'sleeping_pad', 0.4 ], [ 'camping_chair', 0.2 ], [ 'plastic_sheet', 0.3 ] ] );
add( 'site_military_checkpoint', [ [ 'emergency_blanket', 0.4 ], [ 'paracord', 0.6 ], [ 'signal_mirror', 0.2 ], [ 'filter_straw', 0.2 ], [ 'ferro_rod', 0.15 ], [ 'carabiner', 0.2 ] ] );
add( 'site_heli_crash', [ [ 'signal_mirror', 0.3 ], [ 'emergency_blanket', 0.5 ], [ 'solar_still', 0.15 ] ] );
add( 'site_supply_drop', [ [ 'emergency_blanket', 0.6 ], [ 'filter_straw', 0.5 ], [ 'gravity_filter', 0.2 ], [ 'solar_still', 0.25 ] ] );
add( 'site_body', [ [ 'paracord', 0.2 ], [ 'ferro_rod', 0.1 ], [ 'emergency_blanket', 0.2 ] ] );
// (farmers cage the feral pigs that raid their plots)
add( 'site_farm_stand', [ [ 'bamboo_pole', 0.4, [ 1, 2 ] ], [ 'coconut_husk', 0.3, [ 1, 3 ] ], [ 'bucket', 0.3 ], [ 'pig_trap', 0.12 ] ] );
add( 'site_picnic', [ [ 'camping_chair', 0.4 ], [ 'bug_spray', 0.3 ], [ 'mosquito_coil', 0.3, [ 1, 3 ] ] ] );
add( 'site_crash_car', [ [ 'emergency_blanket', 0.4 ], [ 'camping_chair', 0.2 ] ] );
add( 'site_roadside', [ [ 'bug_spray', 0.15 ] ] );
add( 'site_stash', [ [ 'ferro_rod', 0.2 ], [ 'filter_straw', 0.25 ], [ 'paracord', 0.3 ], [ 'emergency_blanket', 0.3 ] ] );

// ======================================================================================================================
// recipes (the crafting panel)
// ======================================================================================================================

addRecipes( [
	// ---- cordage and fishing ----
	R( 'sennit', 'Sennit (ʻaha)', [ 'sennit', 2 ], [ [ 'coconut_husk', 2 ] ], { time: 20, cat: 'survival', skill: 'survival', xp: 6 } ),
	R( 'rope_sennit', 'Rope (sennit)', [ 'rope', 1 ], [ [ 'sennit', 3 ] ], { time: 15, cat: 'survival', skill: 'survival', xp: 4 } ),
	R( 'bone_hook', 'Bone hooks (makau)', [ 'bone_hook', 2 ], [ [ 'bone', 1 ] ], { tools: [ 'cut' ], time: 18, cat: 'tools', skill: 'fishing', xp: 6 } ),
	R( 'hand_line', 'Hand line', [ 'hand_line', 1 ], [ [ 'fishing_line', 1 ], [ 'bone_hook', 1 ], [ 'stick', 1 ] ], { time: 10, cat: 'tools', skill: 'fishing', xp: 4 } ),
	R( 'kona_lure', 'Kona lure', [ 'fishing_lure', 1 ], [ [ 'feathers', 4 ], [ 'bone_hook', 1 ], [ 'fishing_line', 1 ] ], { tools: [ 'cut' ], time: 15, cat: 'tools', skill: 'fishing', xp: 6 } ),
	R( 'ie_trap', 'ʻIe fish trap', [ 'fish_trap', 1 ], [ [ 'palm_frond', 4 ], [ 'sennit', 1 ] ], { tools: [ 'cut' ], time: 30, cat: 'tools', skill: 'fishing', xp: 10 } ),
	R( 'crab_trap', 'Crab trap', [ 'crab_trap', 1 ], [ [ 'wire', 3 ], [ 'rope', 1 ] ], { tools: [ 'cut' ], time: 25, cat: 'tools', skill: 'fishing', xp: 8 } ),
	R( 'stringer_sennit', 'Fish stringer', [ 'fish_stringer', 1 ], [ [ 'sennit', 1 ], [ 'stick', 1 ] ], { tools: [ 'cut' ], time: 6, cat: 'tools', skill: 'fishing', xp: 2 } ),
	R( 'stringer_cord', 'Fish stringer (paracord)', [ 'fish_stringer', 1 ], [ [ 'paracord', 1 ], [ 'carabiner', 1 ] ], { time: 5, cat: 'tools', skill: 'fishing', xp: 2 } ),
	// ---- camp ----
	R( 'smoking_rack', 'Smoking rack', [ 'smoking_rack', 1 ], [ [ 'long_stick', 4 ], [ 'stick', 4 ], [ 'rope', 1 ] ], { tools: [ 'cut' ], time: 25, cat: 'survival', skill: 'survival', xp: 10 } ),
	R( 'smoking_rack_bamboo', 'Smoking rack (bamboo)', [ 'smoking_rack', 1 ], [ [ 'bamboo_pole', 3 ], [ 'sennit', 2 ] ], { tools: [ 'cut' ], time: 25, cat: 'survival', skill: 'survival', xp: 10 } ),
	R( 'tanning_frame', 'Tanning frame', [ 'tanning_frame', 1 ], [ [ 'long_stick', 4 ], [ 'rope', 1 ] ], { tools: [ 'cut' ], time: 20, cat: 'survival', skill: 'survival', xp: 8 } ),
	R( 'tanning_frame_bamboo', 'Tanning frame (bamboo)', [ 'tanning_frame', 1 ], [ [ 'bamboo_pole', 4 ], [ 'sennit', 1 ] ], { tools: [ 'cut' ], time: 20, cat: 'survival', skill: 'survival', xp: 8 } ),
	R( 'tarp_shelter', 'Tarp shelter', [ 'tarp_shelter', 1 ], [ [ 'tarp', 1 ], [ 'rope', 1 ], [ 'long_stick', 2 ] ], { time: 12, cat: 'survival', skill: 'survival', xp: 5 } ),
	R( 'palm_thatch', 'Palm thatch', [ 'palm_thatch', 1 ], [ [ 'palm_frond', 3 ] ], { tools: [ 'cut' ], time: 15, cat: 'survival', skill: 'survival', xp: 4 } ),
	R( 'thatch_shelter', 'Thatch lean-to', [ 'thatch_shelter', 1 ], [ [ 'palm_thatch', 3 ], [ 'long_stick', 2 ], [ 'sennit', 1 ] ], { time: 30, cat: 'survival', skill: 'survival', xp: 10 } ),
	R( 'frond_bed', 'Frond bed', [ 'frond_bed', 1 ], [ [ 'palm_frond', 4 ] ], { time: 10, cat: 'survival', skill: 'survival', xp: 3 } ),
	R( 'hammock', 'Net hammock', [ 'hammock', 1 ], [ [ 'rope', 3 ], [ 'carabiner', 2 ] ], { time: 40, cat: 'survival', skill: 'tailoring', xp: 10 } ),
	R( 'solar_still', 'Solar still kit', [ 'solar_still', 1 ], [ [ 'plastic_sheet', 1 ], [ 'empty_can', 1 ], [ 'stone', 1 ] ], { time: 8, cat: 'survival', skill: 'survival', xp: 4 } ),
	R( 'bottle_filter', 'Bottle filter', [ 'bottle_filter', 1 ], [ [ 'water_bottle', 1 ], [ 'charcoal', 1 ], [ 'stone', 1 ], [ 'rags', 1 ] ], { tools: [ 'cut' ], time: 12, cat: 'survival', skill: 'survival', xp: 5 } ),
	R( 'shell_charcoal', 'Charcoal (coconut shell)', [ 'charcoal', 1 ], [ [ 'coconut_shell', 2 ] ], { station: 'fire', time: 20, cat: 'survival', skill: 'survival', xp: 3 } ),
	R( 'pig_trap', 'Pig trap', [ 'pig_trap', 1 ], [ [ 'wire', 4 ], [ 'planks', 2 ], [ 'nails', 10 ] ], { tools: [ 'hammer' ], time: 40, cat: 'survival', skill: 'carpentry', xp: 12 } ),
	// ---- from the wild ----
	R( 'stone_adze', 'Stone adze (koʻi)', [ 'stone_adze', 1 ], [ [ 'basalt_flake', 1 ], [ 'stick', 1 ], [ 'sennit', 1 ] ], { time: 25, cat: 'weapons', skill: 'survival', xp: 8 } ),
	R( 'bow_drill', 'Bow drill', [ 'bow_drill', 1 ], [ [ 'stick', 3 ], [ 'paracord', 1 ] ], { tools: [ 'cut' ], time: 15, cat: 'survival', skill: 'survival', xp: 6 } ),
	R( 'bow_drill_sennit', 'Bow drill (sennit)', [ 'bow_drill', 1 ], [ [ 'stick', 3 ], [ 'sennit', 1 ] ], { tools: [ 'cut' ], time: 15, cat: 'survival', skill: 'survival', xp: 6 } ),
	R( 'bamboo_spear', 'Bamboo spear', [ 'bamboo_spear', 1 ], [ [ 'bamboo_pole', 1 ] ], { tools: [ 'cut' ], time: 12, cat: 'weapons', skill: 'survival', xp: 4 } ),
	R( 'bamboo_canteen', 'Bamboo canteen', [ 'bamboo_canteen', 1 ], [ [ 'bamboo_pole', 1 ] ], { tools: [ 'cut' ], time: 10, cat: 'survival', skill: 'survival', xp: 3 } ),
] );

// ======================================================================================================================
// mixes
// ======================================================================================================================

const RAW_SEA = ( s, d ) => d.cat === 'food' && !! d.food?.raw && ( d.tags.includes( 'fish' ) || d.tags.includes( 'shell' ) );
const carried = ( c, s ) => { const w = c.use?.where?.( s ); return ! w || w.kind === 'inv' || w.kind === 'equip' || w.kind === 'weapon'; };
const unlitTorch = ( s, d ) => d.tool?.kind === 'torch' && ! s.data.on;
// a filter's pace (s a litre) and wear (condition a litre): the bottle of sand and charcoal is slow and clogs
const FILTER = { gravity_filter: { perL: 2, wear: 0.004 }, bottle_filter: { perL: 8, wear: 0.07 } };

addCombos( [
	// ---- coconut, cord, line ----
	{ id: 'husk_coconut', verb: 'Husk', label: 'Husk {b}', a: { any: [ { tool: [ 'cut', 'chop' ] }, 'stone' ] }, b: { id: 'coconut', fn: ( s ) => ! s.data.husked },
		use: { a: 0, b: 0 }, wear: { a: 0.006 }, time: 6, sound: 'tear', skill: 'survival', xp: 2,
		run: ( c ) => { const one = c.use?.splitOne ? c.use.splitOne( c.b ) : c.b; one.data.husked = true; c.give( 'coconut_husk', 2 ); } },
	{ id: 'gut_paracord', verb: 'Gut', label: 'Pull line from {b}', a: { tool: 'cut' }, b: 'paracord', use: { a: 0, b: 1 }, wear: { a: 0.003 },
		out: [ 'fishing_line', 2 ], time: 6, sound: 'tear', skill: 'fishing', xp: 2 },
	{ id: 'restring_rod', verb: 'Restring', label: 'Restring {b}', a: 'fishing_line', b: { tool: 'fishingrod' }, use: { a: 1, b: 0 },
		repair: { b: 0.35, max: 1 }, time: 6, sound: 'click', skill: 'fishing' },
	{ id: 'squid_bait', verb: 'Cut bait', label: 'Cut {b} into bait', a: { tool: 'cut' }, b: 'raw_squid', use: { a: 0, b: 1 }, wear: { a: 0.004 },
		out: [ 'fishing_bait', 6 ], time: 5, sound: 'tear', skill: 'fishing', xp: 1 },
	// ---- camp ----
	{ id: 'roll_bedroll', verb: 'Roll together', label: 'Make bedroll', a: 'sleeping_pad', b: 'sleeping_bag', use: { a: 1, b: 0 }, time: 6, sound: 'zipper', skill: 'survival', xp: 1,
		run: ( c ) => c.replace( c.b, 'bedroll', {} ) },
	// ---- water ----
	{ id: 'filter_water', verb: 'Filter', label: 'Filter {b}', a: { ids: Object.keys( FILTER ) }, b: { liquid: 'dirty' }, use: { a: 0, b: 0 },
		time: ( c ) => Math.min( 40, 3 + ( liquidIn( c.b )?.litres || 0 ) * FILTER[ c.a.id ].perL ), sound: 'pour', skill: 'survival', xp: 2,
		run: ( c ) => {
			const L = liquidIn( c.b )?.litres || 0;
			c.b.data.liquid = 'water';
			c.a.cond = Math.max( 0, c.a.cond - FILTER[ c.a.id ].wear * L );
			if ( c.a.cond <= 0.02 ) { c.toast( `${c.A.name} clogged`, 'warn' ); c.consume( c.a, 1 ); }
			else c.toast( 'Water filtered', 'good' );
		} },
	// ---- fire without a lighter ----
	{ id: 'sun_torch', verb: 'Light', label: 'Light {b} with the sun', a: 'magnifying_glass', b: { fn: unlitTorch }, use: { a: 0, b: 0 }, time: 10, skill: 'survival', xp: 2,
		check: ( c ) => ! carried( c, c.b ) ? 'Pick it up first' : sunny( c.game ) ? null : 'Needs sun',
		run: ( c ) => { c.b.data.on = true; if ( ! ( c.b.data.charge > 0 ) ) c.b.data.charge = c.B.tool.battery; } },
	{ id: 'drill_torch', verb: 'Light', label: 'Light {b} with the bow drill', a: 'bow_drill', b: { fn: unlitTorch }, use: { a: 0, b: 0 }, wear: { a: 0.04 }, time: 18,
		sound: 'click', skill: 'survival', xp: 3,
		check: ( c ) => carried( c, c.b ) ? null : 'Pick it up first',
		run: ( c ) => {
			c.survival?.useStamina?.( 25 );
			if ( Math.random() > clamp( 0.4 + ( c.skills?.level?.( 'survival' ) || 0 ) * 0.05, 0.05, 0.95 ) ) { c.toast( 'No ember', 'info' ); return; }
			c.b.data.on = true; if ( ! ( c.b.data.charge > 0 ) ) c.b.data.charge = c.B.tool.battery;
		} },
] );

// ======================================================================================================================
// fishing: lures and jigs change what bites (Fishing.js FISHING_MODS)
// ======================================================================================================================

const BIG = new Set( [ 'raw_ulua', 'raw_mahimahi', 'raw_ahi', 'raw_shark' ] );
export function fishingMod( f ) {
	const inv = f.game?.player?.inventory;
	if ( ! inv ) return null;
	const lure = inv.find( ( s ) => s.id === 'fishing_lure' && s.cond > 0.05 );
	const jig = inv.find( ( s ) => s.id === 'squid_jig' && s.cond > 0.05 );
	if ( ! lure && ! jig ) return null;
	const shallow = ( f.depth ?? 3 ) < 2.5, h = f.game.hour ?? 12;
	const night = ( f.game.world?.sky?.night ?? 0 ) > 0.5 || h >= 19 || h < 5.5;
	const m = { weights: {}, extra: [] };
	// a trolled Kona lure on the reef and beyond: the big ones come for it, the junk less
	if ( lure && ! shallow ) { m.bite = 0.75; m.weights = { raw_ulua: 1.6, raw_mahimahi: 1.5, raw_ahi: 1.4, junk: 0.5 }; m.land = 0.04; }
	if ( jig && night ) m.extra.push( [ 'raw_squid', shallow ? 14 : 24 ] );
	if ( ! m.bite && ! m.extra.length ) return null;
	m.caught = ( fi, id ) => {
		if ( lure && m.bite && BIG.has( id ) ) lure.cond = Math.max( 0.02, lure.cond - 0.04 );
		if ( jig && id === 'raw_squid' ) jig.cond = Math.max( 0.02, jig.cond - 0.03 );
	};
	return m;
}
addFishingMod( fishingMod );

// ======================================================================================================================
// hooks: a coconut shell from the last of a cracked coconut; the stringer keeps fish alive in the water; the outdoors
// system rides in on the first spoil tick (it is how this domain gets the game without a module of its own)
// ======================================================================================================================

addEatHook( ( stack, def, k, use ) => {
	if ( def.id !== 'coconut_open' ) return;
	if ( ( stack.data.left ?? def.food.portions ?? 1 ) <= 1 ) use.give?.( 'coconut_shell', 1 );
} );

addSpoilHook( ( items, k, dh, game ) => {
	attach( game );
	// on a stringer in the sea the fish are still swimming: what you carry doesn't age while you're in the water
	const inv = game?.player?.inventory;
	if ( dh > 0 && inv?.count?.( 'fish_stringer' ) > 0 && inv.containers().some( ( c ) => c.items === items ) && water( game ) ) {
		for ( const s of items ) {
			const d = getItem( s.id );
			// taken off now, added back by the aging that follows this hook: no change
			if ( d && RAW_SEA( s, d ) && d.food.spoil ) s.data.age = ( s.data.age || 0 ) - dh * k;
		}
	}
	return k;
} );

// ======================================================================================================================
// verbs
// ======================================================================================================================

// into your bags (else at your feet), shown in the HUD's pickup row like anything gathered
function gain( g, id, n ) {
	const d = getItem( id );
	if ( ! d || n <= 0 ) return 0;
	const inv = g.player.inventory;
	let left = n;
	while ( left > 0 ) {
		const q = Math.min( left, d.stack );
		left -= q;
		const s = makeStack( id, q );
		if ( d.food?.spoil ) s.data.age = 0;
		const shown = { ...s };
		if ( inv.add( s ) > 0 ) g.dropStack( s );
		g.events?.emit?.( 'item:pick', { stack: shown } );
	}
	inv.changed();
	return n;
}

// where a throw net lands: around you when you're wading; else the water under the crosshair (the fishing module's
// own cast target), or the first water straight ahead within a throw (standing on the sand facing the sea, the
// crosshair on the beach)
export const NET_REACH = 9;
export function netSpot( g ) {
	const w = water( g );
	if ( w && ! w.swimming ) return w.depth < 3.5 ? { depth: w.depth } : null;
	const cam = g.camera, P = g.player?.pos;
	if ( ! cam?.getWorldDirection || ! P ) return null;
	const dir = cam.getWorldDirection( cam.position.clone() );
	const tg = g.fishing?.target?.( { origin: cam.position.clone(), dir } );
	if ( tg && Math.hypot( tg.pos.x - P.x, tg.pos.z - P.z ) <= NET_REACH ) return tg.depth > 3.5 ? null : { depth: tg.depth, pos: tg.pos };
	const L = Math.hypot( dir.x, dir.z );
	if ( L < 0.2 ) return null;
	for ( let r = 1.5; r <= NET_REACH; r += 0.5 ) {
		const x = P.x + dir.x / L * r, z = P.z + dir.z / L * r;
		const wl = g.physics?.waterLevel?.( x, z ) ?? 0, depth = wl - ( g.hf?.heightAt?.( x, z ) ?? 0 );
		if ( depth > 0.25 ) return depth > 3.5 ? null : { depth, pos: cam.position.clone().set( x, wl, z ) };
	}
	return null;
}

function castTheNet( g, use, stack ) {
	const at = netSpot( g );
	if ( ! at ) { g.toast( 'Look at shallow water', 'warn' ); return; }
	g.app?.ui?.closeScreen?.();
	ensureOutdoorsSound( g.audio, 'net_cast' );
	use.timed( 'Casting net', 5, 'net_cast', () => {
		if ( ! use.exists( stack ) ) return;
		const { out, snag } = castNet( Math.random, { depth: at.depth, skill: g.skills?.level?.( 'fishing' ) || 0, hour: g.hour } );
		let fish = 0;
		for ( const [ id, n ] of out ) if ( gain( g, id, n ) && id !== 'fishing_bait' ) fish += n;
		if ( at.pos ) g.audio?.play?.( 'splash', { pos: at.pos, vol: 0.5 } );
		use.wear( stack, snag ? 0.08 : 0.01 );
		g.skills?.xp?.( 'fishing', 2 + fish * 2 );
		if ( fish ) g.survival?.mood?.( { boredom: - 3 * fish } );
		if ( snag ) g.toast( 'Snagged on the reef', 'warn' );
		else if ( ! out.length ) g.toast( 'Empty net', 'info' );
		use.changed( use.where( stack ) );
	} );
}

const spearKind = ( d ) => d.id === 'spear_gun' ? 'gun' : d.id === 'hawaiian_sling' ? 'sling' : 'pole';
function spearfish( g, use, stack, def ) {
	const w = water( g );
	if ( ! w ) { g.toast( 'Get in the water', 'warn' ); return; }
	const tool = spearKind( def ), T = SPEAR[ tool ];
	g.app?.ui?.closeScreen?.();
	use.timed( 'Spearfishing', T.time, 'splash', () => {
		const now = water( g );
		if ( ! now || ! use.exists( stack ) ) return;
		const eq = g.player.inventory.equip || {};
		const e = env( g ), lvl = g.skills?.level?.( 'fishing' ) || 0;
		const p = spearChance( { tool, skill: lvl, mask: [ 'dive_mask', 'swim_goggles' ].includes( eq.eyes?.id ), fins: eq.feet?.id === 'swim_fins', under: now.under,
			night: e.night > 0.5, light: !! use.lightNear?.( 6 ), depth: now.depth } );
		use.wear( stack, T.wear );
		// knee-deep water rarely holds fish: say so, so you wade out further
		if ( Math.random() >= p ) { g.skills?.xp?.( 'fishing', 1 ); g.toast( now.depth < 0.6 ? 'Too shallow' : 'Missed', 'info' ); return; }
		const id = spearCatch( Math.random, now.depth, tool );
		if ( ! getItem( id ) ) return;
		gain( g, id, 1 );
		const big = BIG.has( id );
		g.skills?.xp?.( 'fishing', big ? 9 : 5 );
		g.survival?.mood?.( { boredom: big ? - 8 : - 4, unhappy: big ? - 3 : - 1 } );
		g.toast( `Speared: ${getItem( id ).name.replace( /^Raw /, '' )}`, 'good' );
		// blood in deep water: something big comes to look
		if ( Math.random() < sharkChance( now.depth, e.night > 0.5 ) && g.animals?.spawn ) {
			const a = Math.random() * Math.PI * 2, P = g.player.pos;
			const x = P.x + Math.cos( a ) * 30, z = P.z + Math.sin( a ) * 30;
			if ( ( g.hf?.heightAt?.( x, z ) ?? 0 ) < - 4 ) { g.animals.spawn( 'shark', P.clone().set( x, ( g.physics?.waterLevel?.( x, z ) ?? 0 ) - 3, z ) ); g.toast( 'Shark', 'bad' ); }
		}
	}, { cancelOnMove: ! w.swimming } );
}

// coconut palms line the coast; bamboo and kukui grow in the wet valleys
export function harvestKind( g ) {
	const pl = g.player, p = pl?.pos;
	if ( ! p || pl.vehicle || pl.swimming || g.world?.isIndoors?.( p ) ) return null;
	if ( ( g.hf?.flagsNear?.( p.x, p.z ) || 0 ) & ( 1 | 4 | 8 | 16 | 32 ) ) return null;
	const wl = g.physics?.waterLevel?.( p.x, p.z ) ?? 0;
	if ( p.y < wl + 0.1 ) return null;
	if ( g.world?.isBeach?.( p.x, p.z ) || p.y < wl + 6 ) return 'fronds';
	const s = g.hf?.surfaceAt?.( p.x, p.z, [ 0, 0, 0, 0 ] ) || [ 0 ];
	if ( s[ 0 ] > 0.55 && p.y < 400 ) return 'bamboo';
	return null;
}
const patchKey = ( p ) => Math.floor( p.x / HARVEST.patch ) + ',' + Math.floor( p.z / HARVEST.patch );

function harvest( g, use, stack, kind ) {
	const st = state( g ) || attach( g )?.st;
	const key = patchKey( g.player.pos );
	use.timed( kind === 'bamboo' ? 'Cutting bamboo' : 'Cutting fronds', kind === 'bamboo' ? 10 : 7, 'hit_wood', () => {
		if ( ! use.exists( stack ) ) return;
		st?.harvested?.set( key, g.time.hours );
		const lv = g.skills?.level?.( 'foraging' ) || 0;
		let got = 0;
		for ( const [ id, a, b, chance ] of HARVEST[ kind ] ) {
			if ( ! getItem( id ) || Math.random() > Math.min( 1, chance * ( 1 + lv * 0.03 ) ) ) continue;
			if ( gain( g, id, a + Math.floor( Math.random() * ( b - a + 1 ) ) ) ) got ++;
		}
		use.wear( stack, 0.01 );
		g.skills?.xp?.( 'foraging', 2 + got * 2 );
		if ( ! got ) g.toast( 'Nothing worth cutting', 'info' );
	} );
}

// blow a deer call: deer within earshot drift your way; where deer live and none are about, a few may answer
export function deerCall( g ) {
	const A = g.animals, P = g.player.pos;
	let n = 0;
	for ( const a of A?.list || [] ) {
		if ( ! a.alive || a.species !== 'deer' || a.state === 'flee' || a.pos.distanceTo( P ) > 300 ) continue;
		const dx = a.pos.x - P.x, dz = a.pos.z - P.z, L = Math.hypot( dx, dz ) || 1;
		a.herd?.set?.( P.x + dx / L * 22, 0, P.z + dz / L * 22 );
		a.goal?.set?.( P.x + dx / L * ( 18 + Math.random() * 10 ), 0, P.z + dz / L * ( 18 + Math.random() * 10 ) );
		n ++;
	}
	if ( ! n && A?.habitat && A.spawn ) {
		const hab = A.habitat( P.x, P.z, {} );
		const st = state( g );
		if ( hab?.deer > 0 && Math.random() < 0.45 && ! ( st && g.time.hours - st.deerAt < 2 ) ) {
			if ( st ) st.deerAt = g.time.hours;
			// they come from behind the next rise, not out of thin air in front of you
			const yaw = g.player.yaw ?? 0, bx = Math.sin( yaw ), bz = Math.cos( yaw );
			const cx = P.x + bx * 120, cz = P.z + bz * 120;
			const herd = P.clone().set( P.x + bx * 25, 0, P.z + bz * 25 );
			const k = 2 + Math.floor( Math.random() * 3 );
			for ( let i = 0; i < k; i ++ ) {
				const x = cx + ( Math.random() - 0.5 ) * 8, z = cz + ( Math.random() - 0.5 ) * 8;
				const y = g.hf?.heightAt?.( x, z ) ?? P.y;
				if ( y > 0.5 && A.spawn( 'deer', P.clone().set( x, y, z ), { herd } ) ) n ++;
			}
		}
	}
	return n;
}

function filterDrink( g, use, straw ) {
	const c = g.player.inventory.find( ( s ) => { const l = liquidIn( s ); return !! l && l.kind === 'dirty' && l.litres > 0.01; } );
	if ( ! c ) {
		const sea = g.player.inventory.find( ( s ) => liquidIn( s )?.kind === 'sea' );
		g.toast( sea ? "Salt stays in" : 'No dirty water', 'warn' );
		return;
	}
	use.timed( 'Drinking through straw', 4, 'drink', () => {
		if ( ! use.exists( c ) || ! use.exists( straw ) || c.data.liquid !== 'dirty' ) return;
		const sip = Math.min( c.data.amount || 0, 0.5 );
		g.survival?.drink?.( null, sip, 'water' );
		c.data.amount = Math.max( 0, ( c.data.amount || 0 ) - sip );
		if ( c.data.amount < 0.005 ) { c.data.amount = 0; c.data.liquid = null; }
		use.wear( straw, 0.004 );
		use.changed( use.where( c ) );
	} );
}

const hrsLeft = ( h ) => h >= 1 ? `${Math.round( h )} h` : `${Math.max( 5, Math.round( h * 12 ) * 5 )} min`;

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, use = ctx.use;
	if ( ! g || ! use ) return;
	const st = state( g ) || attach( g )?.st;
	const h = g.time?.hours ?? 0;
	const pl = g.player;

	// ---- fishing ----
	if ( def.id === 'throw_net' && ! pl.vehicle && ! pl.swimming ) ctx.first( 'Cast net', () => castTheNet( g, use, stack ) );
	if ( provides( stack, 'fish' ) && water( g ) ) ctx.first( 'Spearfish', () => spearfish( g, use, stack, def ) );
	if ( def.id === 'mosquito_net' ) {
		const w = water( g );
		if ( w && ! w.swimming && w.depth < 1.6 ) ctx.add( 'Scoop baitfish', () => use.timed( 'Scooping', 6, 'splash', () => {
			if ( ! use.exists( stack ) ) return;
			const n = Math.random() < 0.7 ? 1 + Math.floor( Math.random() * 3 ) : 0;
			if ( n ) gain( g, 'fishing_bait', n ); else g.toast( 'Nothing', 'info' );
			use.wear( stack, 0.03 );
			g.skills?.xp?.( 'fishing', 1 );
		} ) );
	}

	// ---- fire and signals ----
	if ( def.id === 'magnifying_glass' || def.id === 'bow_drill' ) {
		const f = unlitFire( g );
		if ( f ) {
			const sun = def.id === 'magnifying_glass';
			ctx.first( 'Light fire', () => {
				if ( sun && ! sunny( g ) ) { g.toast( 'Needs sun', 'warn' ); return; }
				kindle( g, 'fire', () => f.light(), sun ? { how: 'sun', stack, time: 10, label: 'Focusing sunlight' } : { how: 'drill', stack, time: 18, label: 'Working the bow drill' } );
			} );
		}
	}
	if ( def.id === 'signal_mirror' ) ctx.first( 'Signal', () => {
		if ( ! sunny( g ) ) { g.toast( 'Needs sun', 'warn' ); return; }
		g.app?.ui?.closeScreen?.();
		use.timed( 'Signalling', 8, null, () => {
			const S = state( g );
			if ( ! S || g.time.hours - S.signalAt < SIGNAL.cooldown ) { g.toast( 'No answer', 'info' ); return; }
			S.signalAt = g.time.hours;
			g.skills?.xp?.( 'survival', 2 );
			if ( Math.random() < signalChance( g.skills?.level?.( 'survival' ) || 0 ) && g.sites?.supplyDrop?.() ) g.toast( 'Signal seen', 'good' );
			else g.toast( 'No answer', 'info' );
		} );
	} );

	// ---- hunting ----
	if ( def.id === 'deer_call' ) ctx.first( 'Blow', () => {
		ensureOutdoorsSound( g.audio, 'deer_bleat' );
		g.audio?.play?.( 'deer_bleat', { vol: 0.9 } );
		g.events?.emit?.( 'noise', { pos: pl.pos.clone(), radius: 30, source: pl, kind: 'call' } );
		use.timed( 'Calling', 3, null, () => {
			const n = deerCall( g );
			g.skills?.xp?.( 'survival', 1 );
			g.toast( n ? 'Something answers' : 'Nothing answers', n ? 'good' : 'info' );
		} );
	} );

	// ---- mosquitoes, warmth, sleep ----
	if ( def.id === 'bug_spray' && st ) {
		const left = st.sprayUntil - h;
		ctx.first( 'Spray on', () => use.timed( 'Spraying', 2, 'spray', () => {
			if ( ! use.exists( stack ) ) return;
			st.sprayUntil = g.time.hours + MOSQ.sprayH;
			use.useUp( stack );
			g.toast( 'Repellent on', 'good' );
		} ), [ left > 0 ? hrsLeft( left ) + ' left' : null ] );
	}
	if ( def.id === 'emergency_blanket' && st ) {
		if ( st.wrapUntil > h ) ctx.first( 'Take off', () => { st.wrapUntil = - 1; g.toast( 'Blanket off', 'info' ); } );
		else ctx.first( 'Wrap up', () => use.timed( 'Wrapping up', 3, 'unwrap', () => {
			if ( ! use.exists( stack ) ) return;
			st.wrapUntil = g.time.hours + 3;
			use.wear( stack, 0.05 );
			g.toast( 'Wrapped up', 'good' );
		} ) );
	}
	if ( def.id === 'bedroll' ) ctx.add( 'Unroll', () => use.timed( 'Unrolling', 4, 'zipper', () => {
		if ( ! use.exists( stack ) ) return;
		const s = use.transform( stack, 'sleeping_bag', {} );
		if ( s ) s.cond = stack.cond;
		use.give( 'sleeping_pad', 1 );
	} ) );

	// ---- water ----
	if ( def.id === 'filter_straw' ) ctx.first( 'Drink through straw', () => filterDrink( g, use, stack ) );

	// ---- from the wild ----
	if ( ( provides( stack, 'cut' ) || provides( stack, 'chop' ) || provides( stack, 'saw' ) ) && def.cat !== 'firearm' ) {
		const kind = harvestKind( g );
		const ok = kind === 'fronds' || ( kind === 'bamboo' && ( provides( stack, 'chop' ) || provides( stack, 'saw' ) ) );
		if ( ok && ! ( h - ( st?.harvested?.get( patchKey( pl.pos ) ) ?? - 99 ) < HARVEST.regrow ) ) ctx.add( kind === 'bamboo' ? 'Cut bamboo' : 'Cut fronds', () => harvest( g, use, stack, kind ) );
	}
	if ( def.id === 'stone' && ctx.inv.count( 'stone' ) >= 2 ) ctx.add( 'Knap flake', () => use.timed( 'Knapping', 8, 'hit_concrete', () => {
		if ( ! use.exists( stack ) ) return;
		use.consumeOne( stack );
		g.skills?.xp?.( 'survival', 2 );
		if ( Math.random() < knapChance( g.skills?.level?.( 'survival' ) || 0 ) ) gain( g, 'basalt_flake', 1 );
		else g.toast( 'It shattered', 'info' );
	} ) );
} );

// what the tests and the preview read
export const OUTDOORS = { FILTER, BIG, spearKind, patchKey, freshness, makeStack };
