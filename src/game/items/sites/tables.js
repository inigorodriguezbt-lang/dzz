// Loot of the outdoor sites (Sites.js): one table per kind, `site_<kind>`, filled with what that place would hold a
// week into the outbreak. The expansion domains add their items with extendLoot( 'site_<kind>', … ) or by tags.
// Also the two items that lead to a buried stash (a stash note and a treasure map: "Read" marks it on the map) and
// where they turn up. Node-safe (imported by defs/index.js).
import { defineItems } from '../ItemDB.js';
import { defineLootTable, extendLoot } from '../Loot.js';
import { addUseActions } from '../hooks.js';

// ---- the stash items ---------------------------------------------------------------------------------------------

defineItems( [
	{ id: 'stash_note', name: 'Stash note', cat: 'misc', weight: 0.01, size: 0.2, rarity: 'uncommon', stash: true,
		tags: [ 'stash', 'paper' ], model: { type: 'sites_note' }, desc: 'Read to mark a stash on the map.' },
	{ id: 'treasure_map', name: 'Treasure map', cat: 'misc', weight: 0.03, size: 0.3, rarity: 'rare', stash: true,
		tags: [ 'stash', 'paper' ], model: { type: 'sites_tmap' }, desc: 'Read to mark a cache on the map.' },
] );

addUseActions( ( stack, def, ctx ) => {
	if ( ! def.stash ) return;
	ctx.first( 'Read', () => {
		const g = ctx.game;
		if ( g.sites?.readStash ) g.sites.readStash( stack );
		else g.toast?.( 'Nothing marked', 'info' );
	} );
} );

// ---- shared groups (ids owned by the weapons module, see docs/ARCHITECTURE.md) --------------------------------------

const I = ( ids, w, q ) => ( { ids, w, q } );
const T = ( tag, w, o = {} ) => ( { tag, w, ...o } );
const PISTOLS = [ 'glock17', 'm1911', 'revolver_357', 'ruger_mk4', 'makarov', 'beretta_m9' ];
const SHOTGUNS = [ 'mossberg_500', 'remington_870', 'double_barrel', 'sawed_off' ];
const RIFLES_CIV = [ 'ar15_civ', 'mini14', 'sks', 'lever_3030', 'rem700', 'cz527', 'mosin' ];
const RIFLES_MIL = [ 'm4a1', 'm16a4', 'hk416', 'scar_l', 'g36', 'm14_ebr' ];
const AMMO_CIV = [ 'ammo_9mm', 'ammo_45acp', 'ammo_357', 'ammo_22lr', 'ammo_12ga_buck', 'ammo_12ga_slug', 'ammo_3030', 'ammo_308', 'ammo_762x39' ];
const AMMO_MIL = [ 'ammo_556', 'ammo_9mm', 'ammo_308', 'ammo_762x39', 'ammo_12ga_buck', 'ammo_46x30' ];
const MAGS_CIV = [ 'mag_glock17', 'mag_1911', 'mag_m9', 'mag_ruger22', 'mag_makarov', 'mag_mini14', 'mag_stanag30' ];
const MAGS_MIL = [ 'mag_stanag30', 'mag_stanag60', 'mag_m9', 'mag_mp5', 'mag_mp7', 'mag_m14', 'mag_g36', 'box_m249' ];
const OPTICS = [ 'optic_reddot', 'optic_holo', 'optic_2x', 'optic_acog', 'optic_hunting', 'optic_sniper', 'light_rail' ];

// ---- the tables ----------------------------------------------------------------------------------------------------

export const SITE_TABLES = {
	// a suitcase burst open on the shoulder, a backpack someone dropped running
	site_roadside: { rolls: [ 1, 2 ], items: [
		T( 'casual', 5, { cat: 'clothing' } ), [ 'water_bottle', 2 ], [ 'phone', 1 ], [ 'cash', 1, [ 2, 60 ] ], [ 'painkillers', 0.9 ], [ 'bandage', 0.5 ],
		[ 'granola_bar', 1 ], [ 'crackers', 0.8 ], [ 'candy_bar', 0.8 ], [ 'map_hawaii', 0.6 ], [ 'sunglasses', 0.8 ], [ 'aloe_gel', 0.5 ],
		[ 'backpack_school', 0.35 ], [ 'duffel_bag', 0.2 ], [ 'tote_bag', 0.35 ], [ 'flashlight', 0.5 ], [ 'batteries', 0.45 ], [ 'lighter', 0.6 ],
		[ 'car_keys', 0.4 ], [ 'watch', 0.25 ], [ 'kitchen_knife', 0.2 ], [ 'vitamins', 0.4 ], [ 'macadamia_nuts', 0.4 ], [ 'dried_mango', 0.3 ],
		[ 'rain_jacket', 0.3 ], [ 'slippers', 0.4 ], [ 'stash_note', 0.05 ], I( PISTOLS, 0.04 ),
	] },
	// a rural bus shelter: what commuters left on the bench
	site_bus_stop: { rolls: [ 1, 2 ], items: [
		[ 'newspaper', 1.5 ], [ 'water_bottle', 1 ], [ 'soda_cola', 1 ], [ 'phone', 0.8 ], [ 'cash', 1, [ 1, 30 ] ], [ 'backpack_school', 0.6 ], [ 'tote_bag', 0.5 ],
		[ 'granola_bar', 1 ], [ 'candy_bar', 0.8 ], [ 'comic_book', 0.5 ], [ 'painkillers', 0.4 ], [ 'rain_jacket', 0.4 ], [ 'hoodie', 0.4 ], [ 'spam_musubi', 0.6 ],
		[ 'lilikoi_juicebox', 0.6, [ 1, 2 ] ], [ 'map_hawaii', 0.3 ], [ 'lighter', 0.4 ], [ 'baseball_cap', 0.4 ],
	] },
	// a car off the road: the trunk burst, the cabin thrown about
	site_crash_car: { rolls: [ 1, 2 ], items: [
		[ 'road_flare', 1.5, [ 1, 3 ] ], [ 'first_aid_kit', 0.6 ], [ 'water_jug', 0.8 ], [ 'gas_can', 0.8 ], [ 'jerrycan', 0.15 ], [ 'tire_iron', 1 ], [ 'car_keys', 0.8 ],
		[ 'duffel_bag', 0.5 ], [ 'cooler_bag', 0.4 ], [ 'beer_can', 0.6, [ 1, 4 ] ], [ 'map_hawaii', 0.8 ], [ 'sunglasses', 0.6 ], [ 'bandage', 0.6 ], [ 'painkillers', 0.5 ],
		[ 'tire', 0.35 ], [ 'car_battery', 0.25 ], [ 'spark_plug', 0.4 ], [ 'duct_tape', 0.5 ], [ 'rope', 0.4 ], T( 'casual', 1.5, { cat: 'clothing' } ), [ 'cash', 0.6, [ 5, 80 ] ],
		[ 'phone', 0.6 ], [ 'baseball_bat', 0.3 ], [ 'golf_club', 0.3 ], I( [ 'mossberg_500', 'double_barrel', 'glock17' ], 0.06 ), [ 'ammo_12ga_buck', 0.15 ],
		T( 'canned', 0.8, { cat: 'food' } ), [ 'repair_kit', 0.05 ],
	] },
	// towels, an umbrella and a cooler left when the beach was cleared
	site_beach_camp: { rolls: [ 1, 2 ], items: [
		[ 'sunglasses', 1.2 ], [ 'aloe_gel', 1.2 ], [ 'water_bottle', 1.5 ], [ 'soda_cola', 1 ], [ 'beer_can', 1.2, [ 1, 4 ] ], [ 'coconut_water', 0.6 ], [ 'pog_juice', 0.6 ],
		[ 'spam_musubi', 0.8 ], [ 'potato_chips', 0.6 ], [ 'slippers', 0.8 ], [ 'board_shorts', 0.6 ], [ 'bucket_hat', 0.6 ], [ 'sun_visor', 0.4 ], [ 'rash_guard', 0.4 ],
		[ 'swim_goggles', 0.6 ], [ 'dive_mask', 0.3 ], [ 'swim_fins', 0.3 ], [ 'puka_necklace', 0.6 ], [ 'phone', 0.6 ], [ 'cash', 0.6, [ 5, 60 ] ], [ 'ukulele', 0.12 ],
		[ 'dry_bag', 0.3 ], [ 'cooler_bag', 0.3 ], [ 'tote_bag', 0.4 ], [ 'fishing_spear', 0.15 ], [ 'lilikoi_juicebox', 0.5 ], [ 'macadamia_nuts', 0.4 ],
		T( 'surf', 1.2 ), T( 'tourist', 0.8 ),
	] },
	// a tent and a cold fire pit in the trees: someone sat it out here
	site_campsite: { rolls: [ 1, 2 ], items: [
		T( 'canned', 2, { cat: 'food' } ), [ 'saimin', 1 ], [ 'cup_noodles', 1 ], [ 'beef_jerky', 1 ], [ 'granola_bar', 1 ], [ 'energy_bar', 0.6 ], [ 'water_jug', 0.8 ],
		[ 'canteen', 0.3 ], [ 'cooking_pot', 0.8 ], [ 'matches', 1.2 ], [ 'lighter', 0.8 ], [ 'campfire_kit', 0.6 ], [ 'camp_stove', 0.3 ], [ 'propane_canister', 0.4 ],
		[ 'lantern', 0.5 ], [ 'flashlight', 0.6 ], [ 'headlamp', 0.4 ], [ 'batteries', 0.5 ], [ 'sleeping_bag', 0.4 ], [ 'tent', 0.1 ], [ 'rope', 0.6 ], [ 'tarp', 0.5 ],
		[ 'hatchet', 0.5 ], [ 'machete', 0.35 ], [ 'hunting_knife', 0.3 ], [ 'firewood', 1, [ 1, 3 ] ], [ 'whistle', 0.3 ], [ 'compass', 0.3 ], [ 'map_hawaii', 0.3 ],
		[ 'rain_jacket', 0.4 ], [ 'hiking_boots', 0.2 ], [ 'flannel_shirt', 0.4 ], [ 'beer_can', 0.6 ], [ 'okolehao', 0.1 ], [ 'rum', 0.15 ], [ 'fishing_rod', 0.3 ],
		[ 'purification_tablets', 0.3 ], [ 'bandage', 0.5 ], [ 'survival_manual', 0.12 ], [ 'field_guide', 0.2 ], [ 'stash_note', 0.08 ], I( [ 'lever_3030', 'mosin', 'double_barrel' ], 0.05 ),
		[ 'snare', 0.25 ],
	] },
	// a hiker who didn't make it off the trail
	site_hiker: { rolls: [ 1, 2 ], items: [
		[ 'backpack_hiking', 0.8 ], [ 'hiking_boots', 0.4 ], [ 'hiking_pants', 0.4 ], [ 'rain_jacket', 0.4 ], [ 'water_bottle', 1.5 ], [ 'hydration_bladder', 0.4 ], [ 'canteen', 0.3 ],
		[ 'energy_bar', 1 ], [ 'granola_bar', 1.2 ], [ 'beef_jerky', 0.8 ], [ 'dried_mango', 0.6 ], [ 'macadamia_nuts', 0.6 ], [ 'compass', 0.6 ], [ 'map_hawaii', 0.6 ],
		[ 'gps', 0.12 ], [ 'binoculars', 0.2 ], [ 'headlamp', 0.5 ], [ 'flashlight', 0.4 ], [ 'whistle', 0.6 ], [ 'first_aid_kit', 0.3 ], [ 'bandage', 0.8 ], [ 'painkillers', 0.5 ],
		[ 'sleeping_bag', 0.2 ], [ 'hunting_knife', 0.3 ], [ 'multitool', 0.2 ], [ 'phone', 0.6 ], [ 'field_guide', 0.3 ], [ 'survival_manual', 0.1 ], [ 'purification_tablets', 0.4 ],
		[ 'sports_drink', 0.5 ], [ 'boonie_hat', 0.3 ], [ 'bucket_hat', 0.3 ], [ 'stash_note', 0.1 ], [ 'treasure_map', 0.02 ],
	] },
	// a bucket, a rod holder and a chair at the water's edge
	site_fishing_spot: { rolls: [ 1, 2 ], items: [
		[ 'fishing_rod', 1.2 ], [ 'fishing_rod_improvised', 0.4 ], [ 'tackle_box', 0.8 ], [ 'fishing_bait', 1.5, [ 2, 8 ] ], [ 'raw_fish', 0.8 ], [ 'fish_jerky', 0.4 ],
		[ 'fishing_spear', 0.5 ], [ 'fishing_vest', 0.3 ], [ 'fishing_guide', 0.2 ], [ 'cooler_bag', 0.4 ], [ 'beer_can', 1, [ 1, 4 ] ], [ 'water_bottle', 0.8 ],
		[ 'spam_musubi', 0.6 ], [ 'sardines', 0.5 ], [ 'lantern', 0.3 ], [ 'headlamp', 0.3 ], [ 'hunting_knife', 0.2 ], [ 'kitchen_knife', 0.3 ], [ 'bucket_hat', 0.4 ],
		[ 'reef_shoes', 0.4 ], [ 'sunglasses', 0.4 ], [ 'rope', 0.3 ], [ 'cane_knife', 0.2 ], [ 'arare', 0.3 ],
	] },
	// police lines that didn't hold
	site_checkpoint: { rolls: [ 1, 2 ], items: [
		T( 'police', 3 ), [ 'ammo_9mm', 2.5, [ 8, 30 ] ], [ 'mag_glock17', 1.2 ], [ 'mag_m9', 0.4 ], [ 'glock17', 0.25 ], [ 'beretta_m9', 0.1 ], [ 'remington_870', 0.08 ],
		[ 'ammo_12ga_buck', 0.8 ], [ 'police_baton', 0.8 ], [ 'flashlight', 1.2 ], [ 'walkie_talkie', 1 ], [ 'road_flare', 1.5, [ 1, 3 ] ], [ 'bandage', 1 ], [ 'first_aid_kit', 0.4 ],
		[ 'police_vest', 0.12 ], [ 'police_cap', 0.5 ], [ 'riot_helmet', 0.1 ], [ 'energy_drink', 0.6 ], [ 'canned_coffee', 0.6 ], [ 'water_bottle', 1 ], [ 'surgical_mask', 0.6 ],
		[ 'n95_mask', 0.4 ], [ 'latex_gloves', 0.4 ], [ 'hivis_vest', 0.4 ], [ 'grenade_smoke', 0.04 ], [ 'spam_musubi', 0.5 ],
	] },
	// sandbags, crates and a tent: an Army post on the road
	site_military_checkpoint: { rolls: [ 1, 2 ], items: [
		[ 'mre', 2 ], [ 'mre_entree', 1 ], [ 'canteen', 0.8 ], [ 'water_jug', 0.6 ], [ 'ammo_556', 2 ], [ 'ammo_762x39', 0.3 ], [ 'ammo_9mm', 1 ], [ 'mag_stanag30', 1.2 ],
		[ 'mag_m9', 0.4 ], [ 'm4a1', 0.1 ], [ 'm16a4', 0.08 ], [ 'beretta_m9', 0.15 ], [ 'ifak', 0.6 ], [ 'bandage', 1 ], [ 'tourniquet', 0.3 ], [ 'chemlight', 1, [ 1, 3 ] ],
		[ 'road_flare', 0.5 ], [ 'compass', 0.4 ], [ 'walkie_talkie', 0.5 ], [ 'military_helmet', 0.2 ], [ 'chest_rig', 0.12 ], [ 'plate_carrier', 0.04 ],
		[ 'military_combat_shirt', 0.3 ], [ 'military_pants', 0.3 ], [ 'combat_boots', 0.25 ], [ 'tshirt_od', 0.4 ], [ 'boonie_hat', 0.4 ], [ 'gas_mask', 0.12 ],
		[ 'n95_mask', 0.3 ], [ 'jerrycan', 0.25 ], [ 'grenade_smoke', 0.12 ], [ 'grenade_frag', 0.03 ], [ 'binoculars', 0.2 ], [ 'survival_manual', 0.15 ],
		[ 'electrolyte_mix', 0.5 ], [ 'combat_knife', 0.15 ], [ 'duct_tape', 0.4 ],
	] },
	// a Black Hawk down: the crew's weapons and kit
	site_heli_crash: { rolls: [ 1, 2 ], items: [
		I( RIFLES_MIL, 2.2 ), [ 'm249', 0.08 ], I( [ 'mp5', 'mp7', 'ump45' ], 0.4 ), I( [ 'm24', 'svd' ], 0.15 ), I( AMMO_MIL, 4 ), I( MAGS_MIL, 3 ), I( OPTICS, 1.2 ),
		[ 'supp_rifle', 0.15 ], [ 'plate_carrier', 0.4 ], [ 'military_helmet', 0.6 ], [ 'backpack_military', 0.3 ], [ 'backpack_assault', 0.4 ], [ 'chest_rig', 0.4 ],
		[ 'ifak', 1 ], [ 'quikclot', 0.4 ], [ 'morphine', 0.12 ], [ 'tourniquet', 0.5 ], [ 'mre', 1 ], [ 'grenade_frag', 0.25 ], [ 'grenade_smoke', 0.3 ], [ 'grenade_flash', 0.2 ],
		[ 'gps', 0.3 ], [ 'rangefinder', 0.2 ], [ 'weapon_cleaning_kit', 0.4 ], [ 'chemlight', 0.6 ], [ 'flare_gun', 0.3 ], [ 'ammo_flare', 0.4 ], [ 'walkie_talkie', 0.5 ],
		[ 'military_jacket', 0.3 ], [ 'tactical_gloves', 0.4 ], [ 'aviators', 0.3 ],
	] },
	// tents, cots and pallets of relief supplies
	site_fema_camp: { rolls: [ 1, 2 ], items: [
		[ 'mre', 1.5 ], [ 'water_jug', 2 ], [ 'water_bottle', 2 ], T( 'canned', 3, { cat: 'food' } ), [ 'rice_bag', 1 ], [ 'crackers', 1 ], [ 'granola_bar', 1 ],
		[ 'purification_tablets', 1 ], [ 'bandage', 1.5 ], [ 'gauze', 0.8 ], [ 'first_aid_kit', 0.6 ], [ 'antibiotics', 0.4 ], [ 'painkillers', 1 ], [ 'vitamins', 0.6 ],
		[ 'surgical_mask', 1.5 ], [ 'n95_mask', 1 ], [ 'latex_gloves', 1 ], [ 'saline_bag', 0.2 ], [ 'splint', 0.3 ], [ 'sleeping_bag', 0.6 ], [ 'tarp', 0.6 ], [ 'rope', 0.4 ],
		[ 'hivis_vest', 0.4 ], [ 'flashlight', 0.5 ], [ 'batteries', 0.6 ], [ 'radio', 0.2 ], [ 'walkie_talkie', 0.3 ], [ 'chemlight', 0.5 ], [ 'hazmat_suit', 0.05 ],
		[ 'respirator', 0.15 ], [ 'electrolyte_mix', 0.6 ], [ 'candle', 0.4 ], [ 'tote_bag', 0.4 ], [ 'duffel_bag', 0.3 ], [ 'backpack_medic', 0.06 ], [ 'stash_note', 0.04 ],
		T( 'casual', 1, { cat: 'clothing' } ),
	] },
	// a roadside fruit stand: what hasn't gone over
	site_farm_stand: { rolls: [ 1, 2 ], items: [
		T( 'fruit', 6, { cat: 'food', not: [ 'wild' ] } ), [ 'banana', 2, [ 2, 6 ] ], [ 'papaya', 1.5 ], [ 'pineapple', 1.5 ], [ 'mango', 1 ], [ 'avocado', 1 ], [ 'lilikoi', 0.8 ],
		[ 'guava', 0.8 ], [ 'coconut', 1 ], [ 'taro', 0.8 ], [ 'sweet_potato', 0.8 ], [ 'onion', 0.6 ], [ 'eggs', 0.6, [ 2, 6 ] ], [ 'honey', 0.4 ], [ 'poi', 0.3 ],
		[ 'li_hing_mui', 0.4 ], [ 'dried_mango', 0.4 ], [ 'pickled_mango', 0.3 ], [ 'cane_knife', 0.3 ], [ 'machete', 0.12 ], [ 'cash', 0.6, [ 1, 40 ] ], [ 'trucker_cap', 0.2 ],
		[ 'tote_bag', 0.4 ], [ 'coconut_water', 0.4 ], [ 'guava_nectar', 0.3 ],
	] },
	// a picnic table at a park or a lookout
	site_picnic: { rolls: [ 1, 2 ], items: [
		[ 'plate_lunch', 0.6 ], [ 'spam_musubi', 1 ], [ 'potato_chips', 1 ], [ 'arare', 0.6 ], [ 'soda_cola', 1 ], [ 'soda_rootbeer', 0.6 ], [ 'iced_tea', 0.6 ],
		[ 'beer_can', 1, [ 1, 3 ] ], [ 'pog_juice', 0.8 ], [ 'water_bottle', 1 ], [ 'cooler_bag', 0.4 ], [ 'charcoal', 0.8 ], [ 'lighter', 0.6 ], [ 'matches', 0.4 ],
		[ 'frying_pan', 0.15 ], [ 'kitchen_knife', 0.3 ], [ 'macadamia_nuts', 0.4 ], [ 'butter_mochi', 0.4 ], [ 'ukulele', 0.1 ], [ 'baseball_cap', 0.3 ],
		[ 'sunglasses', 0.4 ], [ 'phone', 0.4 ], [ 'malasada', 0.4 ], [ 'manapua', 0.4 ],
	] },
	// a survivor who ran out of luck, with their gear
	site_body: { rolls: [ 1, 2 ], items: [
		[ 'backpack_school', 0.5 ], [ 'backpack_hiking', 0.25 ], [ 'duffel_bag', 0.3 ], [ 'backpack_improvised', 0.2 ], [ 'hunting_knife', 0.4 ], [ 'kitchen_knife', 0.5 ],
		[ 'machete', 0.4 ], [ 'baseball_bat', 0.4 ], [ 'crowbar', 0.3 ], [ 'nailed_bat', 0.15 ], I( [ 'glock17', 'revolver_357', 'm1911' ], 0.22 ), [ 'mossberg_500', 0.05 ],
		[ 'ammo_9mm', 0.5 ], [ 'ammo_12ga_buck', 0.3 ], [ 'bandage', 1 ], [ 'bandage_rag', 1 ], [ 'painkillers', 0.8 ], [ 'antibiotics', 0.2 ], [ 'water_bottle', 1.2 ],
		T( 'canned', 1.5, { cat: 'food' } ), [ 'granola_bar', 0.8 ], [ 'beef_jerky', 0.5 ], [ 'flashlight', 0.6 ], [ 'lighter', 0.6 ], [ 'map_hawaii', 0.5 ], [ 'compass', 0.2 ],
		[ 'cash', 0.6, [ 5, 120 ] ], [ 'phone', 0.4 ], [ 'stash_note', 0.25 ], [ 'treasure_map', 0.03 ], [ 'walkie_talkie', 0.2 ], [ 'duct_tape', 0.3 ], [ 'rope', 0.2 ],
	] },
	// an airdropped relief crate
	site_supply_drop: { rolls: [ 1, 2 ], items: [
		[ 'mre', 3 ], [ 'water_bottle', 2 ], [ 'water_jug', 1 ], [ 'purification_tablets', 1 ], [ 'ifak', 1 ], [ 'first_aid_kit', 1 ], [ 'bandage', 1.5 ], [ 'antibiotics', 0.8 ],
		[ 'morphine', 0.1 ], [ 'quikclot', 0.3 ], [ 'saline_bag', 0.2 ], T( 'canned', 1, { cat: 'food' } ), [ 'energy_bar', 1 ], [ 'electrolyte_mix', 1 ], [ 'chemlight', 1, [ 2, 4 ] ],
		[ 'road_flare', 0.8 ], [ 'flashlight', 0.6 ], [ 'batteries', 0.8 ], [ 'radio', 0.3 ], [ 'walkie_talkie', 0.4 ], [ 'ammo_556', 1 ], [ 'ammo_9mm', 1 ], [ 'mag_stanag30', 0.6 ],
		[ 'm4a1', 0.08 ], [ 'ar15_civ', 0.08 ], [ 'gas_mask', 0.15 ], [ 'n95_mask', 0.6 ], [ 'sleeping_bag', 0.4 ], [ 'tarp', 0.4 ], [ 'rope', 0.4 ], [ 'compass', 0.3 ],
		[ 'map_hawaii', 0.5 ], [ 'survival_manual', 0.2 ],
	] },
	// a survivor's buried cache (a stash note leads here)
	site_stash: { rolls: [ 1, 2 ], items: [
		T( 'canned', 2, { cat: 'food' } ), [ 'rice_bag', 0.6 ], [ 'mre', 0.8 ], [ 'water_bottle', 1 ], [ 'purification_tablets', 0.6 ], I( AMMO_CIV, 2.2 ), I( PISTOLS, 0.45 ),
		I( SHOTGUNS, 0.18 ), I( RIFLES_CIV, 0.2 ), I( MAGS_CIV, 0.6 ), [ 'antibiotics', 0.5 ], [ 'bandage', 1 ], [ 'painkillers', 0.6 ], [ 'first_aid_kit', 0.3 ], [ 'lighter', 0.6 ],
		[ 'matches', 0.5 ], [ 'batteries', 0.6 ], [ 'flashlight', 0.4 ], [ 'cash', 1, [ 20, 300 ] ], [ 'gold_chain', 0.4 ], [ 'diamond_ring', 0.1 ], [ 'watch', 0.3 ], [ 'rum', 0.3 ],
		[ 'okolehao', 0.2 ], [ 'whiskey', 0.2 ], [ 'duct_tape', 0.4 ], [ 'lockpick', 0.08 ], [ 'weapon_cleaning_kit', 0.15 ], [ 'beef_jerky', 0.6 ],
	] },
	// the richer cache a treasure map marks
	site_stash_rich: { rolls: [ 1, 2 ], items: [
		I( RIFLES_CIV, 1 ), I( PISTOLS, 1 ), I( SHOTGUNS, 0.6 ), I( AMMO_CIV, 3 ), I( MAGS_CIV, 1 ), I( OPTICS, 0.5 ), [ 'cash', 2, [ 100, 500 ] ], [ 'gold_chain', 1 ],
		[ 'diamond_ring', 0.4 ], [ 'watch', 0.6 ], [ 'mre', 1 ], [ 'ifak', 0.5 ], [ 'antibiotics', 0.6 ], [ 'grenade_frag', 0.05 ], [ 'plate_carrier', 0.06 ], [ 'okolehao', 0.4 ],
		[ 'binoculars', 0.4 ], [ 'gps', 0.15 ], [ 'lockpick', 0.2 ], [ 'weapon_cleaning_kit', 0.4 ],
	] },
};
for ( const [ name, t ] of Object.entries( SITE_TABLES ) ) defineLootTable( name, t );

// the notes turn up where people kept papers (building loot spots lie on shelves and floors, visible)
extendLoot( 'desk', [ [ 'stash_note', 0.05 ] ] );
extendLoot( 'house_living', [ [ 'stash_note', 0.04 ] ] );
extendLoot( 'street', [ [ 'stash_note', 0.03 ] ] );
extendLoot( 'pawn', [ [ 'treasure_map', 0.12 ] ] );
extendLoot( 'bar', [ [ 'treasure_map', 0.03 ] ] );
extendLoot( 'zombie_civilian', [ [ 'stash_note', 0.03 ] ] );
