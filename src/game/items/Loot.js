// Loot tables: what you find in a kitchen cupboard, a police locker, a car trunk or an infected tourist's pockets.
//   rollLoot( table, rnd = Math.random, n? ) -> [ ItemStack ]
//     table: a name from LOOT_TABLES (or a table object); rnd: a [0,1) generator (seeded by the caller for
//     deterministic containers); n: number of rolls (default: a random count in the table's `rolls` range).
//   LOOT_TABLES[ name ] = { rolls: [ min, max ], items: [ entry… ], extra? }
//
// Entries (weights are relative within the table):
//   'id'                      weight 1
//   [ 'id', w, [ qmin, qmax ]? ]
//   { ids: [ … ], w, q? }     one of the ids, picked by rarity weight
//   { tag, cat?, not?, w, q? } any item with that tag (and category), picked by rarity weight — new items join
//                              the tables automatically when they carry the tag
// Ids that are not defined (another module failed to load, a def was renamed) are skipped, never spawned.
// Firearms come out of makeStack( …, { loot: true } ) with partial magazines, and sometimes a spare magazine or
// loose rounds of the right calibre next to them.
import { ITEMS, RARITY_WEIGHT, makeStack } from './ItemDB.js';

// food that keeps less than this many game hours is found rotten (the outbreak is a week old)
export const PERISHABLE_H = 72;

// ---- weapon groups (shared ids owned by the weapons module) -------------------------------------------------

const PISTOLS_CIV = [ 'glock17', 'm1911', 'revolver_357', 'ruger_mk4', 'makarov', 'beretta_m9', 'revolver_44', 'sig_p226' ];
const PISTOLS_POLICE = [ 'glock17', 'beretta_m9', 'sig_p226', 'm1911' ];
const SHOTGUNS_CIV = [ 'mossberg_500', 'remington_870', 'double_barrel', 'sawed_off', 'saiga12' ];
const RIFLES_CIV = [ 'ar15_civ', 'mini14', 'sks', 'lever_3030', 'rem700', 'cz527', 'mosin', 'akm' ];
const RIFLES_MIL = [ 'm4a1', 'm16a4', 'hk416', 'scar_l', 'g36', 'aug', 'fal', 'm14_ebr', 'ak74', 'akm' ];
const SMGS = [ 'mp5', 'uzi', 'mp7', 'vector', 'mac10', 'ump45' ];
const SNIPERS_MIL = [ 'm24', 'svd', 'barrett_m82', 'm14_ebr' ];
const LMGS = [ 'm249', 'pkm' ];
const BOWS = [ 'compound_bow', 'crossbow' ];
const AMMO_CIV = [ 'ammo_9mm', 'ammo_45acp', 'ammo_357', 'ammo_22lr', 'ammo_12ga_buck', 'ammo_12ga_slug', 'ammo_3030', 'ammo_308', 'ammo_762x39', 'ammo_9x18', 'ammo_44mag' ];
const AMMO_MIL = [ 'ammo_556', 'ammo_762x39', 'ammo_308', 'ammo_545', 'ammo_9mm', 'ammo_762x54r', 'ammo_46x30', 'ammo_12ga_buck' ];
const MAGS_CIV = [ 'mag_glock17', 'mag_1911', 'mag_m9', 'mag_ruger22', 'mag_makarov', 'mag_mini14', 'mag_cz527', 'mag_stanag30', 'mag_akm' ];
const MAGS_MIL = [ 'mag_stanag30', 'mag_stanag60', 'mag_ak74', 'mag_akm', 'mag_akm_drum', 'mag_g36', 'mag_aug', 'mag_fal', 'mag_m14', 'mag_svd', 'mag_mp5', 'mag_mp7', 'mag_ump45', 'mag_m9', 'box_m249', 'box_pkm' ];
const OPTICS = [ 'optic_reddot', 'optic_holo', 'optic_2x', 'optic_acog', 'optic_hunting', 'optic_sniper', 'optic_pso1', 'light_rail' ];
const MUZZLES = [ 'supp_pistol', 'supp_rifle', 'supp_sniper' ];
const MELEE_HOUSE = [ 'kitchen_knife', 'baseball_bat', 'golf_club', 'frying_pan', 'hammer', 'machete' ];
const MELEE_TOOLS = [ 'hammer', 'wrench', 'crowbar', 'lead_pipe', 'sledgehammer', 'shovel', 'hatchet', 'pickaxe', 'tire_iron', 'machete', 'fire_axe' ];

// ---- tables -------------------------------------------------------------------------------------------------

const T = ( tag, w, o = {} ) => ( { tag, w, ...o } );
const I = ( ids, w, q ) => ( { ids, w, q } );

export const LOOT_TABLES = {
	// ================= homes =================
	house_kitchen: { rolls: [ 2, 5 ], items: [
		T( 'canned', 9, { cat: 'food' } ), T( 'snack', 4, { cat: 'food' } ), [ 'spam', 4 ], [ 'rice_bag', 2 ], [ 'crackers', 2 ], [ 'saimin', 2, [ 1, 3 ] ],
		[ 'cereal', 1.5 ], [ 'peanut_butter', 1.2 ], [ 'honey', 0.5 ], [ 'poi', 0.6 ], [ 'sweet_bread', 0.8 ], [ 'pickled_mango', 0.5 ],
		T( 'fruit', 2.5, { cat: 'food', not: [ 'wild' ] } ), [ 'onion', 0.8 ], [ 'eggs', 0.7, [ 2, 6 ] ], [ 'sweet_potato', 0.6 ],
		[ 'can_opener', 2.2 ], [ 'matches', 1.6 ], [ 'lighter', 1 ], [ 'cooking_pot', 1.2 ], [ 'cooking_oil', 1 ], [ 'water_bottle', 1.4 ], [ 'water_jug', 0.8 ],
		[ 'kitchen_knife', 1.4 ], [ 'frying_pan', 0.8 ], [ 'pog_juice', 0.9 ], [ 'milk', 0.7 ], [ 'lilikoi_juicebox', 0.8, [ 1, 3 ] ], [ 'soda_cola', 0.8 ],
		[ 'rags', 0.8, [ 1, 3 ] ], [ 'newspaper', 0.5 ], [ 'charcoal_tablets', 0.3 ], [ 'empty_bottle', 0.6 ],
	] },
	fridge: { rolls: [ 1, 4 ], items: [
		[ 'eggs', 2, [ 2, 6 ] ], [ 'milk', 2 ], [ 'pog_juice', 2 ], [ 'poi', 1.5 ], [ 'spam_musubi', 1 ], [ 'plate_lunch', 0.8 ], [ 'poke', 0.6 ], [ 'cooked_rice', 1 ],
		[ 'beer_can', 2, [ 1, 4 ] ], [ 'beer_bottle', 1.2 ], [ 'soda_cola', 1.5 ], [ 'soda_lemonlime', 1 ], [ 'guava_nectar', 1 ], [ 'coconut_water', 0.8 ], [ 'sake', 0.4 ],
		[ 'lilikoi_juicebox', 1, [ 1, 3 ] ], [ 'water_bottle', 1.2 ], [ 'papaya', 1 ], [ 'mango', 1 ], [ 'avocado', 0.8 ], [ 'orange', 0.8 ], [ 'onion', 0.6 ],
		[ 'butter_mochi', 0.5 ], [ 'pickled_mango', 0.6 ], [ 'raw_chicken', 0.5 ], [ 'raw_fish', 0.4 ], [ 'manapua', 0.5 ],
	] },
	house_living: { rolls: [ 1, 3 ], items: [
		[ 'newspaper', 2 ], [ 'cash', 1.2, [ 5, 60 ] ], [ 'phone', 1 ], [ 'lighter', 1 ], [ 'matches', 0.6 ], [ 'candy_bar', 1 ], [ 'potato_chips', 0.8 ],
		[ 'arare', 0.6 ], [ 'soda_cola', 0.8 ], [ 'beer_can', 0.8 ], [ 'comic_book', 0.6 ], [ 'ukulele', 0.4 ], [ 'tiki', 0.3 ], [ 'kukui_lei', 0.3 ],
		[ 'flashlight', 0.7 ], [ 'batteries', 0.8, [ 1, 2 ] ], [ 'radio', 0.3 ], [ 'map_hawaii', 0.4 ], [ 'baseball_bat', 0.3 ], [ 'rubber_duck', 0.1 ], [ 'laptop', 0.3 ], [ 'watch', 0.3 ], [ 'macadamia_nuts', 0.4 ],
	] },
	house_bedroom: { rolls: [ 1, 4 ], items: [
		T( 'casual', 8, { cat: 'clothing' } ), T( 'clothing', 1, { cat: 'clothing', not: [ 'military', 'police', 'fire', 'hazmat' ] } ), [ 'backpack_school', 0.8 ], [ 'tote_bag', 0.6 ], [ 'duffel_bag', 0.3 ],
		[ 'cash', 1, [ 10, 120 ] ], [ 'gold_chain', 0.3 ], [ 'diamond_ring', 0.08 ], [ 'watch', 0.5 ], [ 'phone', 0.6 ],
		[ 'flashlight', 0.6 ], [ 'batteries', 0.4 ], [ 'painkillers', 0.4 ], [ 'sleeping_bag', 0.2 ], [ 'bible', 0.2 ], [ 'kukui_lei', 0.2 ],
		I( PISTOLS_CIV, 0.25 ), I( [ 'ammo_9mm', 'ammo_45acp', 'ammo_357', 'ammo_22lr' ], 0.3 ), [ 'baseball_bat', 0.3 ], [ 'sewing_kit', 0.4 ], [ 'laptop', 0.2 ],
	] },
	house_bathroom: { rolls: [ 1, 3 ], items: [
		[ 'painkillers', 3 ], [ 'bandage', 2 ], [ 'antiseptic', 1.2 ], [ 'alcohol_wipes', 1.2, [ 2, 6 ] ], [ 'vitamins', 1.2 ], [ 'aloe_gel', 1.5 ], [ 'charcoal_tablets', 1 ],
		[ 'antibiotics', 0.4 ], [ 'codeine', 0.15 ], [ 'gauze', 0.4 ], [ 'first_aid_kit', 0.3 ], [ 'rags', 1, [ 1, 3 ] ], [ 'rubber_duck', 0.3 ], [ 'epinephrine', 0.1 ],
	] },
	medicine_cabinet: { rolls: [ 1, 3 ], items: [
		[ 'painkillers', 3 ], [ 'bandage', 2 ], [ 'antiseptic', 1 ], [ 'alcohol_wipes', 1, [ 2, 6 ] ], [ 'vitamins', 1.2 ], [ 'aloe_gel', 1 ], [ 'charcoal_tablets', 1 ],
		[ 'antibiotics', 0.6 ], [ 'codeine', 0.25 ], [ 'epinephrine', 0.15 ], [ 'iodine', 0.3 ], [ 'purification_tablets', 0.2 ],
	] },
	house_garage: { rolls: [ 1, 4 ], items: [
		T( 'hardware', 2, { cat: 'material' } ), [ 'duct_tape', 1.5 ], [ 'rope', 1 ], [ 'tarp', 1 ], [ 'wire', 1 ], [ 'nails', 1, [ 10, 40 ] ], [ 'planks', 0.8, [ 1, 3 ] ],
		[ 'gas_can', 1.5 ], [ 'jerrycan', 0.3 ], [ 'car_battery', 0.4 ], [ 'spark_plug', 0.6 ], [ 'tire', 0.3 ], [ 'toolbox', 0.6 ], [ 'flashlight', 0.8 ], [ 'batteries', 0.8 ],
		I( MELEE_TOOLS, 2.5 ), [ 'work_gloves', 0.8 ], [ 'fishing_rod', 0.6 ], [ 'tackle_box', 0.4 ], [ 'cooler_bag', 0.4 ], [ 'charcoal', 0.6 ], [ 'hand_saw', 0.5 ],
		[ 'car_keys', 0.4 ], [ 'lantern', 0.4 ], [ 'scrap_metal', 0.8 ], [ 'firewood', 0.4 ], [ 'long_stick', 0.3 ], I( SHOTGUNS_CIV, 0.12 ), [ 'ammo_12ga_buck', 0.2 ], [ 'hard_hat', 0.3 ],
	] },
	wardrobe: { rolls: [ 1, 4 ], items: [
		T( 'casual', 8, { cat: 'clothing' } ), T( 'clothing', 2, { cat: 'clothing', not: [ 'military', 'police', 'fire', 'hazmat', 'medical' ] } ), T( 'bag', 1.2, { cat: 'backpack', not: [ 'military', 'crafted' ] } ),
		[ 'rain_jacket', 0.8 ], [ 'hoodie', 1 ], [ 'belt', 0.8 ], [ 'cash', 0.4, [ 5, 40 ] ], [ 'sewing_kit', 0.3 ], [ 'sleeping_bag', 0.2 ],
	] },

	// ================= shops =================
	grocery: { rolls: [ 2, 6 ], items: [
		T( 'canned', 10, { cat: 'food' } ), T( 'grocery', 8, { cat: 'food' } ), T( 'drink', 5, { cat: 'drink', not: [ 'alcohol' ] } ), T( 'alcohol', 1.2, { cat: 'drink' } ),
		[ 'rice_bag', 2 ], [ 'spam', 3 ], [ 'water_bottle', 2 ], [ 'water_jug', 1.2 ], [ 'charcoal', 0.8 ], [ 'matches', 0.6 ], [ 'lighter', 0.5 ], [ 'batteries', 0.8 ],
		[ 'cooking_oil', 0.8 ], [ 'tote_bag', 0.3 ], [ 'vitamins', 0.3 ],
	] },
	convenience: { rolls: [ 2, 5 ], items: [
		T( 'convenience', 10, { cat: 'food' } ), T( 'convenience', 6, { cat: 'drink' } ), [ 'spam_musubi', 2 ], [ 'water_bottle', 2 ], [ 'energy_drink', 1 ],
		[ 'lighter', 1.2 ], [ 'batteries', 1 ], [ 'painkillers', 0.8 ], [ 'aloe_gel', 0.5 ], [ 'phone', 0.2 ], [ 'map_hawaii', 0.5 ], [ 'newspaper', 0.4 ], [ 'comic_book', 0.3 ],
	] },
	pharmacy: { rolls: [ 2, 6 ], items: [
		T( 'pharmacy', 12, { cat: 'medical' } ), [ 'bandage', 3 ], [ 'painkillers', 3 ], [ 'antibiotics', 1.5 ], [ 'vitamins', 1.5 ], [ 'first_aid_kit', 0.8 ], [ 'splint', 0.5 ],
		[ 'charcoal_tablets', 1.5 ], [ 'aloe_gel', 1 ], [ 'epinephrine', 0.4 ], [ 'purification_tablets', 0.6 ], [ 'surgical_mask', 1 ], [ 'latex_gloves', 0.8 ],
		T( 'convenience', 1.5, { cat: 'food' } ), [ 'water_bottle', 1 ], [ 'sports_drink', 0.8 ], [ 'electrolyte_mix', 0.5 ],
	] },
	hospital: { rolls: [ 1, 5 ], items: [
		T( 'hospital', 10, { cat: 'medical' } ), [ 'saline_bag', 1.5 ], [ 'blood_bag', 0.5 ], [ 'suture_kit', 0.8 ], [ 'antibiotics_strong', 1 ], [ 'morphine', 0.3 ],
		[ 'splint', 1 ], [ 'gauze', 2 ], [ 'bandage', 2 ], [ 'surgical_mask', 1.5 ], [ 'n95_mask', 1 ], [ 'latex_gloves', 1.5 ], [ 'scrubs_top', 0.8 ], [ 'scrubs_pants', 0.8 ],
		[ 'lab_coat', 0.4 ], [ 'backpack_medic', 0.3 ], [ 'hazmat_suit', 0.1 ], [ 'first_aid_manual', 0.3 ],
	] },
	clinic: { rolls: [ 1, 4 ], items: [
		T( 'clinic', 8, { cat: 'medical' } ), [ 'bandage', 2 ], [ 'painkillers', 2 ], [ 'antibiotics', 1.5 ], [ 'antiseptic', 1.2 ], [ 'gauze', 1 ], [ 'splint', 0.6 ],
		[ 'saline_bag', 0.4 ], [ 'suture_kit', 0.4 ], [ 'surgical_mask', 1 ], [ 'latex_gloves', 1 ], [ 'scrubs_top', 0.4 ],
	] },
	hardware: { rolls: [ 2, 5 ], items: [
		T( 'hardware', 12 ), I( MELEE_TOOLS, 4 ), [ 'toolbox', 1 ], [ 'duct_tape', 2 ], [ 'rope', 1.5 ], [ 'tarp', 1.5 ], [ 'wire', 1.5 ], [ 'nails', 2, [ 20, 60 ] ],
		[ 'flashlight', 1.5 ], [ 'headlamp', 0.6 ], [ 'lantern', 0.8 ], [ 'batteries', 2 ], [ 'gas_can', 0.8 ], [ 'work_gloves', 1.2 ], [ 'hard_hat', 0.8 ], [ 'hivis_vest', 0.8 ],
		[ 'work_boots', 0.6 ], [ 'tool_belt', 0.5 ], [ 'camp_stove', 0.3 ], [ 'propane_canister', 0.6 ], [ 'hand_saw', 0.8 ], [ 'multitool', 0.4 ], [ 'radio', 0.3 ],
	] },
	toolbox: { rolls: [ 1, 3 ], items: [
		[ 'hammer', 2 ], [ 'wrench', 2 ], [ 'duct_tape', 2 ], [ 'wire', 1.2 ], [ 'nails', 1.5, [ 10, 30 ] ], [ 'spark_plug', 1 ], [ 'multitool', 0.4 ], [ 'flashlight', 0.8 ],
		[ 'batteries', 0.8 ], [ 'lockpick', 0.1 ], [ 'work_gloves', 0.6 ], [ 'tire_iron', 0.6 ], [ 'scrap_metal', 0.5 ],
	] },
	clothing_store: { rolls: [ 2, 6 ], items: [
		T( 'casual', 10, { cat: 'clothing' } ), T( 'tourist', 5, { cat: 'clothing' } ), T( 'clothing', 3, { cat: 'clothing', not: [ 'military', 'police', 'fire', 'hazmat', 'medical' ] } ),
		T( 'bag', 1.5, { cat: 'backpack', not: [ 'military', 'crafted', 'medical' ] } ), [ 'sunglasses', 1.5 ], [ 'aviators', 0.8 ], [ 'baseball_cap', 1 ], [ 'bucket_hat', 0.8 ],
		[ 'lauhala_hat', 0.6 ], [ 'slippers', 1.2 ], [ 'sneakers', 1 ], [ 'belt', 0.8 ],
	] },
	sports: { rolls: [ 2, 5 ], items: [
		T( 'sports', 10 ), [ 'baseball_bat', 2 ], [ 'golf_club', 1.2 ], [ 'energy_bar', 1.5 ], [ 'sports_drink', 1.5 ], [ 'backpack_hiking', 0.8 ], [ 'tent', 0.5 ], [ 'sleeping_bag', 0.8 ],
		[ 'headlamp', 0.8 ], [ 'compass', 0.6 ], [ 'fishing_rod', 0.8 ], [ 'tackle_box', 0.6 ], [ 'camp_stove', 0.5 ], [ 'hydration_bladder', 0.6 ], [ 'whistle', 0.6 ],
		I( BOWS, 0.5 ), [ 'arrow', 0.6, [ 3, 8 ] ], [ 'crossbow_bolt', 0.3, [ 3, 8 ] ], [ 'hunting_knife', 0.6 ], [ 'binoculars', 0.4 ],
	] },
	surf: { rolls: [ 1, 4 ], items: [
		T( 'surf', 10 ), [ 'board_shorts', 2 ], [ 'board_shorts_red', 1.5 ], [ 'rash_guard', 1.5 ], [ 'wetsuit', 0.8 ], [ 'reef_shoes', 1 ], [ 'swim_fins', 0.8 ],
		[ 'dive_mask', 0.8 ], [ 'swim_goggles', 0.8 ], [ 'dry_bag', 0.8 ], [ 'aloe_gel', 1 ], [ 'puka_necklace', 1 ], [ 'sunglasses', 1 ], [ 'fishing_spear', 0.8 ],
		[ 'canoe_paddle', 0.5 ], [ 'water_bottle', 1 ], [ 'coconut_water', 0.8 ], [ 'life_jacket', 0.4 ],
	] },
	market: { rolls: [ 2, 5 ], items: [
		T( 'fruit', 10, { cat: 'food' } ), T( 'market', 6, { cat: 'food' } ), [ 'taro', 1.5 ], [ 'sweet_potato', 1.5 ], [ 'breadfruit', 1 ], [ 'onion', 1.2 ], [ 'eggs', 1, [ 2, 6 ] ],
		[ 'honey', 0.6 ], [ 'poi', 1 ], [ 'fish_jerky', 0.6 ], [ 'raw_fish', 0.8 ], [ 'raw_ahi', 0.3 ], [ 'raw_tako', 0.3 ], [ 'tote_bag', 0.5 ], [ 'lei', 0.4 ], [ 'cane_knife', 0.2 ],
	] },
	pawn: { rolls: [ 1, 4 ], items: [
		T( 'valuable', 6 ), [ 'watch', 1.5 ], [ 'ukulele', 1 ], [ 'laptop', 1 ], [ 'phone', 1 ], [ 'binoculars', 0.6 ], [ 'lighter_zippo', 0.8 ], [ 'katana', 0.4 ], [ 'lockpick', 0.3 ],
		I( PISTOLS_CIV, 0.8 ), I( SHOTGUNS_CIV, 0.3 ), I( AMMO_CIV, 0.8 ), I( MAGS_CIV, 0.3 ), [ 'gps', 0.3 ], [ 'rangefinder', 0.15 ], [ 'radio', 0.4 ], [ 'leather_jacket', 0.3 ],
	] },
	gunstore: { rolls: [ 2, 5 ], items: [
		I( PISTOLS_CIV, 4 ), I( SHOTGUNS_CIV, 2.5 ), I( RIFLES_CIV, 3 ), I( [ 'desert_eagle', 'vector', 'mac10', 'uzi', 'saiga12' ], 0.5 ), I( BOWS, 0.6 ), [ 'flare_gun', 0.4 ],
		I( AMMO_CIV, 8 ), I( [ 'ammo_556', 'ammo_50ae', 'ammo_762x54r', 'ammo_545' ], 1.5 ), I( MAGS_CIV, 3 ), [ 'mag_deagle', 0.3 ], I( OPTICS, 1.5 ), [ 'supp_pistol', 0.2 ],
		[ 'weapon_cleaning_kit', 1 ], [ 'hunting_vest', 0.6 ], [ 'hunting_knife', 1 ], [ 'binoculars', 0.4 ], [ 'rangefinder', 0.3 ], [ 'arrow', 0.5, [ 4, 10 ] ], [ 'boonie_hat', 0.4 ],
	] },
	gun_safe: { rolls: [ 1, 3 ], items: [
		I( PISTOLS_CIV, 3 ), I( SHOTGUNS_CIV, 2 ), I( RIFLES_CIV, 2.5 ), I( AMMO_CIV, 5 ), I( MAGS_CIV, 2 ), I( [ 'optic_hunting', 'optic_reddot', 'optic_2x' ], 0.8 ),
		[ 'cash', 1, [ 50, 400 ] ], [ 'gold_chain', 0.4 ], [ 'diamond_ring', 0.2 ], [ 'weapon_cleaning_kit', 0.6 ],
	] },

	// ================= services =================
	police: { rolls: [ 1, 4 ], items: [
		T( 'police', 8 ), I( PISTOLS_POLICE, 1.5 ), [ 'remington_870', 0.6 ], [ 'm4a1', 0.2 ], [ 'mp5', 0.2 ], [ 'ammo_9mm', 3, [ 10, 40 ] ], [ 'ammo_12ga_buck', 1.2 ],
		[ 'mag_glock17', 1.5 ], [ 'mag_m9', 0.6 ], [ 'police_baton', 1 ], [ 'flashlight', 1.5 ], [ 'walkie_talkie', 1 ], [ 'bandage', 1 ], [ 'road_flare', 1 ],
	] },
	police_locker: { rolls: [ 1, 4 ], items: [
		[ 'police_shirt', 2 ], [ 'police_pants', 2 ], [ 'police_boots', 1.2 ], [ 'police_cap', 1.2 ], [ 'police_vest', 1 ], [ 'riot_helmet', 0.3 ], [ 'holster_belt', 0.8 ],
		[ 'tactical_gloves', 0.6 ], I( PISTOLS_POLICE, 1 ), [ 'mag_glock17', 1.2 ], [ 'ammo_9mm', 1.5, [ 10, 30 ] ], [ 'flashlight', 1 ], [ 'police_baton', 0.8 ], [ 'backpack_assault', 0.3 ],
		[ 'energy_drink', 0.6 ], [ 'grenade_smoke', 0.1 ], [ 'grenade_flash', 0.1 ], [ 'ifak', 0.3 ],
	] },
	fire_station: { rolls: [ 1, 4 ], items: [
		T( 'fire', 8 ), [ 'fire_axe', 1.5 ], [ 'first_aid_kit', 1.2 ], [ 'backpack_medic', 0.5 ], [ 'bandage', 1.5 ], [ 'splint', 0.8 ], [ 'saline_bag', 0.3 ], [ 'road_flare', 1.2 ],
		[ 'flashlight', 1 ], [ 'walkie_talkie', 0.8 ], [ 'rope', 0.8 ], [ 'crowbar', 0.8 ], [ 'respirator', 0.8 ], [ 'hivis_vest', 0.6 ], [ 'radio', 0.3 ],
	] },
	military: { rolls: [ 1, 4 ], items: [
		T( 'military', 8, { not: [ 'legendary' ] } ), I( RIFLES_MIL, 1.2 ), I( AMMO_MIL, 4 ), I( MAGS_MIL, 2.5 ), [ 'mre', 2.5 ], [ 'canteen', 1 ], [ 'ifak', 1 ], [ 'chemlight', 1.5, [ 1, 3 ] ],
		[ 'compass', 0.6 ], [ 'survival_manual', 0.4 ], [ 'electrolyte_mix', 0.6 ],
	] },
	military_armory: { rolls: [ 2, 5 ], items: [
		I( RIFLES_MIL, 6 ), I( SMGS, 1.5 ), I( SNIPERS_MIL, 0.8 ), I( LMGS, 0.35 ), I( PISTOLS_POLICE, 1.5 ), [ 'spas12', 0.4 ], I( AMMO_MIL, 10 ), I( MAGS_MIL, 6 ),
		I( OPTICS, 2.5 ), I( MUZZLES, 0.8 ), [ 'grenade_frag', 0.8 ], [ 'grenade_smoke', 0.8 ], [ 'grenade_flash', 0.5 ], [ 'ammo_50bmg', 0.2 ], [ 'weapon_cleaning_kit', 1 ],
		[ 'plate_carrier', 0.6 ], [ 'military_helmet', 0.6 ], [ 'chest_rig', 0.6 ],
	] },
	military_locker: { rolls: [ 1, 4 ], items: [
		T( 'military', 6, { cat: 'clothing' } ), T( 'military', 1.2, { cat: 'backpack' } ), [ 'tshirt_od', 1.2 ], [ 'combat_boots', 1 ], [ 'military_helmet', 0.6 ], [ 'plate_carrier', 0.4 ],
		[ 'mre', 2 ], [ 'canteen', 1 ], [ 'ifak', 0.8 ], [ 'combat_knife', 0.6 ], [ 'chemlight', 1, [ 1, 3 ] ], [ 'compass', 0.5 ], [ 'lighter_zippo', 0.4 ], [ 'survival_manual', 0.3 ],
		I( AMMO_MIL, 1.5 ), I( MAGS_MIL, 1 ), [ 'beretta_m9', 0.4 ], [ 'gas_mask', 0.4 ], [ 'tactical_gloves', 0.6 ], [ 'balaclava', 0.4 ],
	] },
	hangar: { rolls: [ 1, 4 ], items: [
		[ 'jerrycan', 2 ], [ 'gas_can', 1.2 ], [ 'toolbox', 1.2 ], [ 'repair_kit', 0.6 ], [ 'car_battery', 0.8 ], [ 'spark_plug', 1 ], [ 'tire', 0.6 ], [ 'duct_tape', 1 ], [ 'wire', 0.8 ],
		[ 'hivis_vest', 1 ], [ 'mechanic_coveralls', 0.8 ], [ 'work_gloves', 0.8 ], [ 'flashlight', 0.8 ], [ 'walkie_talkie', 0.6 ], [ 'aviators', 0.6 ], [ 'road_flare', 0.8 ],
		[ 'wrench', 1 ], [ 'crowbar', 0.6 ], [ 'life_jacket', 0.6 ], [ 'flare_gun', 0.3 ], [ 'ammo_flare', 0.4 ], [ 'map_hawaii', 0.6 ],
	] },
	garage_shop: { rolls: [ 1, 4 ], items: [
		[ 'car_battery', 1.5 ], [ 'spark_plug', 2 ], [ 'tire', 1.2 ], [ 'repair_kit', 0.5 ], [ 'jerrycan', 0.8 ], [ 'gas_can', 1.2 ], [ 'toolbox', 1 ], [ 'duct_tape', 1.2 ],
		[ 'mechanic_coveralls', 1 ], [ 'work_gloves', 1 ], I( [ 'wrench', 'tire_iron', 'crowbar', 'hammer', 'lead_pipe', 'sledgehammer' ], 2.5 ), [ 'car_keys', 1 ], [ 'scrap_metal', 1 ], [ 'rags', 1, [ 1, 4 ] ],
	] },
	gas_station: { rolls: [ 2, 5 ], items: [
		T( 'convenience', 8, { cat: 'food' } ), T( 'convenience', 5, { cat: 'drink' } ), [ 'spam_musubi', 2.5 ], [ 'manapua', 1 ], [ 'gas_can', 1.2 ], [ 'jerrycan', 0.3 ],
		[ 'road_flare', 1 ], [ 'map_hawaii', 1.2 ], [ 'lighter', 1.2 ], [ 'batteries', 0.8 ], [ 'spark_plug', 0.4 ], [ 'duct_tape', 0.5 ], [ 'energy_drink', 1 ], [ 'car_keys', 0.3 ],
	] },

	// ================= food service =================
	restaurant: { rolls: [ 1, 4 ], items: [
		T( 'restaurant', 8, { cat: 'food' } ), [ 'plate_lunch', 2 ], [ 'loco_moco', 1.5 ], [ 'poke', 1 ], [ 'cooked_rice', 1.2 ], [ 'soda_cola', 1 ], [ 'beer_bottle', 0.8 ],
		[ 'sake', 0.4 ], [ 'matches', 0.6 ], [ 'kitchen_knife', 0.5 ], [ 'cash', 0.6, [ 5, 60 ] ],
	] },
	restaurant_kitchen: { rolls: [ 2, 5 ], items: [
		[ 'rice_bag', 2 ], [ 'spam', 2 ], [ 'eggs', 1.5, [ 3, 6 ] ], [ 'onion', 1.5 ], [ 'cooking_oil', 1.5 ], [ 'raw_chicken', 1 ], [ 'raw_fish', 0.8 ], [ 'raw_ahi', 0.4 ],
		[ 'cooking_pot', 1.2 ], [ 'kitchen_knife', 1.5 ], [ 'cane_knife', 0.3 ], [ 'frying_pan', 1 ], [ 'can_opener', 1 ], [ 'matches', 0.8 ], [ 'lighter', 0.6 ], [ 'chef_jacket', 0.6 ],
		T( 'canned', 3, { cat: 'food' } ), [ 'saimin', 1, [ 2, 3 ] ], [ 'sweet_bread', 0.5 ], [ 'malasada', 0.6 ], [ 'charcoal', 0.4 ], [ 'rags', 0.6, [ 1, 3 ] ],
	] },
	fastfood: { rolls: [ 1, 4 ], items: [
		T( 'fastfood', 8, { cat: 'food' } ), [ 'spam_musubi', 2 ], [ 'malasada', 1.5 ], [ 'manapua', 1.2 ], [ 'soda_cola', 2 ], [ 'soda_rootbeer', 1 ], [ 'soda_lemonlime', 1 ],
		[ 'potato_chips', 0.8 ], [ 'cash', 0.4, [ 5, 40 ] ], [ 'polo_shirt', 0.3 ],
	] },
	bar: { rolls: [ 1, 4 ], items: [
		T( 'alcohol', 10, { cat: 'drink' } ), [ 'beer_bottle', 3 ], [ 'beer_can', 2 ], [ 'empty_bottle', 2 ], [ 'broken_bottle', 0.6 ], [ 'lighter', 1.2 ], [ 'lighter_zippo', 0.3 ],
		[ 'matches', 0.8 ], [ 'arare', 0.8 ], [ 'macadamia_nuts', 0.6 ], [ 'cash', 1, [ 5, 80 ] ], [ 'rags', 0.6 ], [ 'baseball_bat', 0.2 ],
	] },

	// ================= offices and public buildings =================
	office: { rolls: [ 1, 3 ], items: [
		[ 'cold_brew', 1.2 ], [ 'canned_coffee', 1 ], [ 'candy_bar', 1 ], [ 'granola_bar', 1 ], [ 'water_bottle', 1.2 ], [ 'laptop', 0.8 ], [ 'phone', 0.8 ], [ 'painkillers', 0.6 ],
		[ 'first_aid_kit', 0.3 ], [ 'flashlight', 0.4 ], [ 'batteries', 0.6 ], [ 'newspaper', 0.6 ], [ 'cash', 0.4, [ 5, 30 ] ], [ 'radio', 0.2 ], [ 'map_hawaii', 0.3 ],
		[ 'khaki_pants', 0.3 ], [ 'dress_shoes', 0.2 ], [ 'alcohol_wipes', 0.5, [ 2, 6 ] ], [ 'solar_charger', 0.1 ],
	] },
	desk: { rolls: [ 1, 2 ], items: [
		[ 'candy_bar', 1.5 ], [ 'granola_bar', 1.2 ], [ 'painkillers', 0.8 ], [ 'cash', 0.8, [ 5, 40 ] ], [ 'phone', 0.6 ], [ 'lighter', 0.5 ], [ 'batteries', 0.6 ], [ 'car_keys', 0.4 ], [ 'watch', 0.3 ], [ 'canned_coffee', 0.6 ], [ 'alcohol_wipes', 0.5, [ 2, 5 ] ], [ 'lockpick', 0.03 ],
	] },
	school: { rolls: [ 1, 3 ], items: [
		[ 'backpack_school', 2 ], [ 'lilikoi_juicebox', 2, [ 1, 3 ] ], [ 'granola_bar', 1.5 ], [ 'candy_bar', 1 ], [ 'hoodie_green', 0.6 ], [ 'hoodie', 0.8 ], [ 'comic_book', 1 ],
		[ 'field_guide', 0.6 ], [ 'first_aid_manual', 0.4 ], [ 'phrasebook', 0.4 ], [ 'first_aid_kit', 0.4 ], [ 'whistle', 0.6 ], [ 'epinephrine', 0.2 ], [ 'baseball_bat', 0.4 ],
		[ 'water_bottle', 1 ], [ 'pog_juice', 0.8 ], [ 'ukulele', 0.3 ],
	] },
	church: { rolls: [ 1, 3 ], items: [
		[ 'bible', 2 ], [ 'kukui_lei', 0.8 ], [ 'lei', 1 ], [ 'butter_mochi', 1.2 ], [ 'sweet_bread', 1 ], [ 'matches', 1 ], [ 'water_jug', 0.8 ], [ 'water_bottle', 1 ],
		[ 'muumuu', 0.8 ], [ 'dress_shoes', 0.4 ], [ 'first_aid_kit', 0.3 ], [ 'sleeping_bag', 0.3 ], [ 'canned_soup', 0.8 ],
	] },
	bank: { rolls: [ 1, 3 ], items: [
		[ 'cash', 6, [ 60, 500 ] ], [ 'gold_chain', 0.6 ], [ 'diamond_ring', 0.3 ], [ 'security_shirt', 0.6 ], [ 'walkie_talkie', 0.4 ], [ 'flashlight', 0.4 ], I( PISTOLS_POLICE, 0.2 ),
	] },
	post: { rolls: [ 1, 3 ], items: [
		[ 'newspaper', 2 ], [ 'map_hawaii', 0.8 ], [ 'duct_tape', 0.8 ], [ 'batteries', 0.6 ], [ 'rope', 0.4 ], [ 'macadamia_nuts', 0.6 ], [ 'chocolate_macnuts', 0.5 ],
		[ 'dried_mango', 0.5 ], [ 'comic_book', 0.4 ], [ 'phone', 0.3 ], [ 'laptop', 0.2 ], [ 'radio', 0.2 ], [ 'tote_bag', 0.4 ],
	] },
	hotel_room: { rolls: [ 1, 4 ], items: [
		T( 'tourist', 6 ), [ 'aloha_shirt', 1 ], [ 'board_shorts', 0.8 ], [ 'sunglasses', 1 ], [ 'slippers', 0.8 ], [ 'macadamia_nuts', 1 ], [ 'chocolate_macnuts', 1 ],
		[ 'water_bottle', 1.2 ], [ 'soda_cola', 0.8 ], [ 'rum', 0.3 ], [ 'aloe_gel', 1 ], [ 'map_hawaii', 0.8 ], [ 'phone', 0.6 ], [ 'cash', 0.8, [ 10, 200 ] ], [ 'lei', 0.6 ], [ 'duffel_bag', 0.4 ], [ 'fanny_pack', 0.5 ], [ 'bible', 0.2 ], [ 'watch', 0.3 ],
	] },
	warehouse: { rolls: [ 1, 5 ], items: [
		T( 'canned', 5, { cat: 'food' } ), [ 'rice_bag', 2 ], [ 'water_jug', 2 ], [ 'spam', 1.5 ], [ 'tarp', 1.5 ], [ 'rope', 1 ], [ 'planks', 1.2, [ 1, 4 ] ], [ 'nails', 1, [ 20, 60 ] ],
		[ 'scrap_metal', 1 ], [ 'duct_tape', 1 ], [ 'gas_can', 0.8 ], [ 'jerrycan', 0.4 ], [ 'hivis_vest', 0.8 ], [ 'work_gloves', 0.8 ], [ 'hard_hat', 0.6 ], [ 'crowbar', 0.6 ],
		[ 'toolbox', 0.4 ], [ 'mre', 0.2 ], [ 'charcoal', 0.8 ], [ 'cooking_oil', 0.6 ],
	] },
	observatory: { rolls: [ 1, 3 ], items: [
		[ 'down_jacket', 1.5 ], [ 'beanie', 1.5 ], [ 'lab_coat', 1 ], [ 'cold_brew', 1.2 ], [ 'canned_coffee', 1 ], [ 'cup_noodles', 1.5 ], [ 'saimin', 1 ], [ 'energy_bar', 1 ],
		[ 'headlamp', 1 ], [ 'flashlight', 0.8 ], [ 'batteries', 1 ], [ 'laptop', 1 ], [ 'radio', 0.6 ], [ 'gps', 0.4 ], [ 'solar_charger', 0.4 ], [ 'water_jug', 0.8 ],
		[ 'field_guide', 0.4 ], [ 'hiking_boots', 0.6 ], [ 'first_aid_kit', 0.4 ], [ 'sleeping_bag', 0.4 ],
	] },

	// ================= outdoors and vehicles =================
	farm: { rolls: [ 1, 4 ], items: [
		T( 'farm', 8 ), [ 'eggs', 1.5, [ 3, 6 ] ], [ 'taro', 1.2 ], [ 'sweet_potato', 1.2 ], [ 'banana', 1.2, [ 2, 6 ] ], [ 'papaya', 1 ], [ 'onion', 0.8 ], [ 'honey', 0.4 ],
		[ 'machete', 1 ], [ 'cane_knife', 0.8 ], [ 'shovel', 0.8 ], [ 'pickaxe', 0.4 ], [ 'hatchet', 0.6 ], [ 'rope', 0.8 ], [ 'wire', 0.8 ], [ 'gas_can', 0.8 ], [ 'firewood', 1, [ 1, 3 ] ],
		[ 'rain_boots', 0.8 ], [ 'trucker_cap', 0.6 ], [ 'stick', 0.8, [ 2, 5 ] ], [ 'long_stick', 0.6, [ 1, 2 ] ], [ 'flannel_shirt', 0.6 ], [ 'work_gloves', 0.6 ], I( [ 'double_barrel', 'lever_3030', 'mossberg_500', 'ruger_mk4' ], 0.35 ),
		I( [ 'ammo_12ga_buck', 'ammo_3030', 'ammo_22lr' ], 0.6 ), [ 'feathers', 0.6, [ 3, 10 ] ],
	] },
	beach: { rolls: [ 1, 3 ], items: [
		[ 'coconut', 2 ], [ 'water_bottle', 1.5 ], [ 'soda_cola', 0.8 ], [ 'beer_can', 0.8 ], [ 'slippers', 1 ], [ 'sunglasses', 1 ], [ 'bucket_hat', 0.6 ], [ 'board_shorts', 0.6 ],
		[ 'aloe_gel', 0.8 ], [ 'puka_necklace', 0.8 ], [ 'fishing_rod', 0.4 ], [ 'fishing_bait', 0.5, [ 2, 6 ] ], [ 'cooler_bag', 0.4 ], [ 'dry_bag', 0.3 ], [ 'stone', 0.6, [ 1, 3 ] ], [ 'stick', 0.6, [ 1, 3 ] ],
		[ 'spam_musubi', 0.4 ], [ 'charcoal', 0.4 ], [ 'swim_goggles', 0.5 ], [ 'canoe_paddle', 0.3 ], [ 'fishing_spear', 0.3 ],
	] },
	street: { rolls: [ 1, 2 ], items: [
		[ 'newspaper', 2 ], [ 'empty_bottle', 1.2 ], [ 'soda_cola', 0.8 ], [ 'cash', 0.8, [ 1, 30 ] ], [ 'phone', 0.6 ], [ 'lighter', 0.6 ], [ 'rags', 0.8 ],
		[ 'scrap_metal', 0.6 ], [ 'lead_pipe', 0.4 ], [ 'broken_bottle', 0.5 ], [ 'bandage_rag', 0.3 ], [ 'road_flare', 0.3 ], [ 'car_keys', 0.3 ], [ 'water_bottle', 0.6 ],
		[ 'slippers', 0.3 ], [ 'baseball_cap', 0.3 ],
	] },
	trash: { rolls: [ 0, 2 ], items: [
		[ 'empty_bottle', 3 ], [ 'newspaper', 2 ], [ 'rags', 1.5, [ 1, 3 ] ], [ 'scrap_metal', 1 ], [ 'broken_bottle', 1 ], [ 'wire', 0.4 ], [ 'water_bottle', 1 ],
		[ 'potato_chips', 0.3 ], [ 'spam_musubi', 0.3 ], [ 'duct_tape', 0.2 ], [ 'batteries', 0.2 ], [ 'phone', 0.1 ], [ 'cash', 0.2, [ 1, 10 ] ],
	] },
	car_trunk: { rolls: [ 1, 4 ], items: [
		[ 'tire', 1.2 ], [ 'tire_iron', 1.5 ], [ 'gas_can', 1.2 ], [ 'jerrycan', 0.3 ], [ 'first_aid_kit', 0.8 ], [ 'road_flare', 1.2, [ 1, 3 ] ], [ 'water_jug', 0.8 ], [ 'water_bottle', 1 ],
		[ 'duct_tape', 0.6 ], [ 'rope', 0.6 ], [ 'tarp', 0.5 ], [ 'cooler_bag', 0.6 ], [ 'duffel_bag', 0.5 ], [ 'backpack_school', 0.4 ], [ 'fishing_rod', 0.5 ], [ 'tackle_box', 0.3 ],
		[ 'baseball_bat', 0.4 ], [ 'golf_club', 0.5 ], [ 'car_battery', 0.3 ], [ 'spark_plug', 0.4 ], [ 'sleeping_bag', 0.3 ], [ 'tent', 0.15 ], [ 'charcoal', 0.4 ],
		T( 'canned', 1, { cat: 'food' } ), [ 'beer_can', 0.5, [ 1, 4 ] ], [ 'flashlight', 0.5 ], I( SHOTGUNS_CIV, 0.08 ), [ 'toolbox', 0.3 ],
	] },
	car_glovebox: { rolls: [ 1, 3 ], items: [
		[ 'map_hawaii', 2 ], [ 'car_keys', 0.8 ], [ 'flashlight', 1 ], [ 'batteries', 0.8 ], [ 'lighter', 0.8 ], [ 'sunglasses', 1 ], [ 'cash', 1, [ 1, 40 ] ], [ 'phone', 0.5 ],
		[ 'candy_bar', 0.8 ], [ 'granola_bar', 0.6 ], [ 'painkillers', 0.6 ], [ 'bandage', 0.5 ], [ 'road_flare', 0.5 ],
		[ 'multitool', 0.2 ], I( PISTOLS_CIV, 0.15 ), [ 'ammo_9mm', 0.2 ], [ 'li_hing_mui', 0.5 ], [ 'watch', 0.2 ],
	] },

	// ================= the infected (pockets; their clothing is dressed by the creatures module) =================
	zombie_civilian: { rolls: [ 0, 2 ], items: [
		[ 'cash', 2, [ 1, 60 ] ], [ 'phone', 1.2 ], [ 'lighter', 1 ], [ 'car_keys', 0.6 ], [ 'candy_bar', 0.8 ], [ 'granola_bar', 0.6 ], [ 'bandage_rag', 0.6 ], [ 'rags', 0.6 ],
		[ 'painkillers', 0.5 ], [ 'water_bottle', 0.5 ], [ 'soda_cola', 0.4 ], [ 'watch', 0.3 ], [ 'matches', 0.3 ], [ 'li_hing_mui', 0.3 ],
		[ 'kitchen_knife', 0.15 ], [ 'gold_chain', 0.08 ],
	] },
	zombie_tourist: { rolls: [ 0, 3 ], items: [
		[ 'cash', 2, [ 10, 150 ] ], [ 'phone', 1.5 ], [ 'sunglasses', 1 ], [ 'map_hawaii', 0.8 ], [ 'macadamia_nuts', 0.6 ], [ 'chocolate_macnuts', 0.5 ], [ 'water_bottle', 0.8 ],
		[ 'aloe_gel', 0.6 ], [ 'lei', 0.6 ], [ 'puka_necklace', 0.5 ], [ 'phrasebook', 0.3 ], [ 'diamond_ring', 0.05 ], [ 'watch', 0.3 ], [ 'fanny_pack', 0.3 ], [ 'dried_mango', 0.4 ],
	] },
	zombie_police: { rolls: [ 1, 3 ], items: [
		[ 'ammo_9mm', 2.5, [ 5, 25 ] ], [ 'mag_glock17', 1.5 ], [ 'mag_m9', 0.4 ], [ 'glock17', 0.25 ], [ 'beretta_m9', 0.1 ], [ 'police_baton', 0.5 ], [ 'flashlight', 1 ],
		[ 'walkie_talkie', 0.8 ], [ 'bandage', 0.8 ], [ 'road_flare', 0.5 ], [ 'lockpick', 0.05 ], [ 'cash', 0.4, [ 5, 40 ] ], [ 'energy_drink', 0.3 ],
	] },
	zombie_military: { rolls: [ 1, 3 ], items: [
		I( AMMO_MIL, 2.5 ), I( MAGS_MIL, 1.2 ), [ 'mre', 1 ], [ 'mre_entree', 0.6 ], [ 'bandage', 0.8 ], [ 'ifak', 0.3 ], [ 'chemlight', 0.8, [ 1, 2 ] ], [ 'canteen', 0.3 ],
		[ 'compass', 0.3 ], [ 'combat_knife', 0.2 ], [ 'grenade_frag', 0.06 ], [ 'grenade_smoke', 0.08 ], [ 'lighter_zippo', 0.2 ], [ 'electrolyte_mix', 0.4 ],
	] },
	zombie_medic: { rolls: [ 1, 3 ], items: [
		[ 'bandage', 2 ], [ 'gauze', 1 ], [ 'antiseptic', 0.8 ], [ 'antibiotics', 0.8 ], [ 'painkillers', 1 ], [ 'epinephrine', 0.3 ], [ 'saline_bag', 0.25 ], [ 'splint', 0.3 ],
		[ 'alcohol_wipes', 0.8, [ 2, 5 ] ], [ 'latex_gloves', 0.6 ], [ 'surgical_mask', 0.6 ], [ 'morphine', 0.05 ], [ 'suture_kit', 0.1 ],
	] },
};

// ---- rolling ------------------------------------------------------------------------------------------------

// tables are compiled lazily into flat [ { ids, weights, total, w, q } ] and recompiled when new items register
const compiled = new Map();
let compiledFor = - 1;

function itemWeight( def ) { return RARITY_WEIGHT[ def.rarity ] ?? 0.5; }

function resolveEntry( e ) {
	let ids, w, q = null;
	if ( typeof e === 'string' ) { ids = [ e ]; w = 1; }
	else if ( Array.isArray( e ) ) { ids = [ e[ 0 ] ]; w = e[ 1 ] ?? 1; q = e[ 2 ] || null; }
	else if ( e.ids ) { ids = e.ids; w = e.w ?? 1; q = e.q || null; }
	else if ( e.tag ) {
		ids = [];
		for ( const d of ITEMS.values() ) {
			if ( ! d.tags?.includes( e.tag ) && d.cat !== e.tag ) continue;
			if ( e.cat && d.cat !== e.cat ) continue;
			if ( e.not && e.not.some( t => d.tags?.includes( t ) || d.rarity === t ) ) continue;
			ids.push( d.id );
		}
		w = e.w ?? 1; q = e.q || null;
	} else return null;
	ids = ids.filter( id => ITEMS.has( id ) );
	if ( ! ids.length || w <= 0 ) return null;
	// several candidates: rarer items come up less often
	const weights = ids.map( id => ids.length > 1 ? itemWeight( ITEMS.get( id ) ) : 1 );
	return { ids, weights, total: weights.reduce( ( a, b ) => a + b, 0 ), w, q };
}

export function compileTable( table ) {
	if ( compiledFor !== ITEMS.size ) { compiled.clear(); compiledFor = ITEMS.size; }
	let c = compiled.get( table );
	if ( c ) return c;
	const entries = [];
	for ( const e of table.items ) { const r = resolveEntry( e ); if ( r ) entries.push( r ); }
	c = { entries, ws: entries.map( e => e.w ), total: entries.reduce( ( a, e ) => a + e.w, 0 ) };
	compiled.set( table, c );
	return c;
}

function pick( list, weights, total, rnd ) {
	let x = rnd() * total;
	for ( let i = 0; i < list.length; i ++ ) { x -= weights[ i ]; if ( x <= 0 ) return list[ i ]; }
	return list[ list.length - 1 ];
}

// how many of a stackable item a find holds
function lootQty( def, q, rnd ) {
	if ( q ) return Math.max( 1, Math.min( def.stack, q[ 0 ] + Math.floor( rnd() * ( q[ 1 ] - q[ 0 ] + 1 ) ) ) );
	if ( def.stack <= 1 ) return 1;
	if ( def.cat === 'ammo' ) return Math.max( 1, Math.round( def.stack * ( 0.15 + rnd() * 0.45 ) ) );
	if ( def.cat === 'misc' && def.id === 'cash' ) return 5 + Math.floor( rnd() * 60 );
	return 1 + Math.floor( rnd() * Math.min( def.stack, 3 ) );
}

// the loose-round item for a calibre (cached; rebuilt when the catalogue grows)
const ammoCache = new Map();
let ammoFor_ = - 1;
function ammoFor( cal ) {
	if ( ammoFor_ !== ITEMS.size ) { ammoCache.clear(); ammoFor_ = ITEMS.size; for ( const d of ITEMS.values() ) if ( d.cat === 'ammo' && d.ammo?.caliber && ! ammoCache.has( d.ammo.caliber ) ) ammoCache.set( d.ammo.caliber, d ); }
	return ammoCache.get( cal ) || null;
}

export function rollLoot( table, rnd = Math.random, n = undefined ) {
	const t = typeof table === 'string' ? LOOT_TABLES[ table ] : table;
	if ( ! t ) return [];
	const c = compileTable( t );
	if ( ! c.entries.length ) return [];
	if ( n === undefined || n === null ) { const [ a, b ] = t.rolls || [ 1, 2 ]; n = a + Math.floor( rnd() * ( b - a + 1 ) ); }
	const out = [];
	for ( let i = 0; i < n; i ++ ) {
		const e = pick( c.entries, c.ws, c.total, rnd );
		const id = e.ids.length === 1 ? e.ids[ 0 ] : pick( e.ids, e.weights, e.total, rnd );
		const def = ITEMS.get( id );
		const s = makeStack( id, lootQty( def, e.q, rnd ), { loot: true, rnd } );
		if ( ! s ) continue;
		// a week without power: fresh meals, meat and fish found in the world have gone off
		if ( def.food?.spoil && def.food.spoil <= PERISHABLE_H ) s.data.age = def.food.spoil + ( s.data.age || 0 );
		out.push( s );
		// a gun is rarely alone: a spare magazine or a handful of rounds next to it
		if ( def.cat === 'firearm' ) {
			const f = def.firearm;
			if ( f.feed === 'mag' && f.mags?.length && rnd() < 0.3 ) { const m = makeStack( f.mags[ 0 ], 1, { loot: true, rnd } ); if ( m ) out.push( m ); }
			if ( rnd() < 0.35 ) {
				const ammo = ammoFor( f.caliber );
				if ( ammo ) out.push( makeStack( ammo.id, lootQty( ammo, null, rnd ), { loot: true, rnd } ) );
			}
		}
	}
	// merge duplicates of stackables so a drawer does not hold three stacks of one ammo
	const merged = [];
	for ( const s of out ) {
		const def = ITEMS.get( s.id );
		const same = def.stack > 1 && def.cat !== 'food' && merged.find( m => m.id === s.id && m.qty < def.stack );
		if ( same ) { const take = Math.min( def.stack - same.qty, s.qty ); same.qty += take; s.qty -= take; if ( s.qty > 0 ) merged.push( s ); }
		else merged.push( s );
	}
	return merged;
}

// every id a table can produce (validation, debug)
export function tableIds( table ) {
	const t = typeof table === 'string' ? LOOT_TABLES[ table ] : table;
	const ids = new Set();
	for ( const e of t?.items || [] ) {
		if ( typeof e === 'string' ) ids.add( e );
		else if ( Array.isArray( e ) ) ids.add( e[ 0 ] );
		else if ( e.ids ) for ( const id of e.ids ) ids.add( id );
	}
	return ids;
}
