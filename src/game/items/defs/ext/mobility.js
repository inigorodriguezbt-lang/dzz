// Mobility and hauling (docs/ITEMS_PLAN.md): getting up, over, down and across, and moving loads.
//   air: a paraglider (open it falling off a height or run off a slope; brakes, speed bar, wind, ridge lift and thermals,
//     flare to land, the canopy over you; pack it up after), a round reserve (one pull, straight down), a variometer
//     (beeps in rising air), ripstop tape for torn canopies;
//   climbing: a grappling hook you rig with a rope and throw at a roof edge, a wall top or a cliff; a climbing rope and
//     plain rope tied off at an edge to climb down (and back up); a harness, a descender (rappel), an ascender, chalk;
//     a folding ladder and an extension ladder leant on walls (pull them up after you), an escape ladder hung from a sill;
//   wheels: a skateboard, a longboard, a kick scooter (ride on pavement: push, carve, ollie kerbs, bail on grass), inline
//     skates (worn: you skate wherever it's paved), spare wheels, a hōlua sled for grassy slopes;
//   water: a stand-up paddleboard and its paddle (faster than swimming, waves knock you off, it floats when you fall),
//     a leash, ding resin; the surfboard and bodyboard paddle out prone;
//   hauling: a shopping cart, a wheelbarrow, a folding beach wagon and a hand truck (push or pull them, open what they
//     carry, they stay where you leave them; hop on a cart rolling downhill; a hand truck moves placed gear);
//   a zipline kit and a trolley (string a cable between two trees or posts up to 80 m apart, ride it down);
//   trekking poles (steep slopes, less effort), an umbrella (dry in the rain; a squall turns it inside out).
// Runtime: ../../ext/mobility/*.js (modes, the system, placed kinds, ledges, numbers, sounds).
import { defineItems, getItem } from '../../ItemDB.js';
import { extendLoot } from '../../Loot.js';
import { addRecipes, R } from '../../recipes.js';
import { addCombos } from '../../combos.js';
import { addUseActions, addSystem } from '../../hooks.js';
import { RIDE, HAUL, ROPES, LADDERS, boardOf } from '../../ext/mobility/logic.js';
import { attach, system } from '../../ext/mobility/runtime.js';
import '../../ext/mobility/kinds.js';
// the outdoor sites' tables (site_<kind>) are defined there; imported first so they can be extended here
import '../../sites/tables.js';

// ---- helpers ----------------------------------------------------------------------------------------------------------

const EXTRA = [ 'tool', 'clothing', 'place', 'board', 'carry', 'hauler', 'dismantle', 'dismantleTools', 'container' ];
function base( id, name, cat, o ) {
	const d = { id, name, cat, desc: o.desc || '', weight: o.w ?? 0.5, size: o.size ?? 1, stack: o.stack ?? 1, rarity: o.rarity || 'common',
		tags: [ ...( o.pre || [] ), 'mobility', ...( o.tags || [] ) ], model: o.model };
	for ( const k of EXTRA ) if ( o[ k ] !== undefined ) d[ k ] = o[ k ];
	return d;
}
const tool = ( id, name, kind, o ) => base( id, name, 'tool', { ...o, pre: [ 'tool' ], tool: { kind, ...( o.tool || {} ) } } );
const misc = ( id, name, o ) => base( id, name, 'misc', { ...o, pre: [ 'misc' ] } );
const mat = ( id, name, o ) => base( id, name, 'material', { ...o, pre: [ 'material' ] } );
const wear = ( id, name, slot, o ) => base( id, name, 'clothing', { ...o, pre: [ 'clothing' ], clothing: { slot, capacity: o.cap ?? 0, insulation: o.ins ?? 0.02,
	armor: { bite: o.bite ?? 0, bullet: 0 }, waterproof: o.wp ?? 0, visibility: o.vis ?? 0.6, color: o.color ?? 0x333333 } } );
const P = ( type, o = {} ) => ( { type: 'mob_' + type, ...o } );

// ======================================================================================================================
// the items
// ======================================================================================================================

defineItems( [
	// ================= air =================
	tool( 'paraglider', 'Paraglider', 'glider', { w: 5.8, size: 12, rarity: 'rare', tags: [ 'sports', 'outdoor', 'fabric' ],
		model: P( 'glider', { color: 0xd8402a, color2: 0x1f2a3a } ), desc: 'Open it falling from a height.' } ),
	tool( 'reserve_chute', 'Reserve parachute', 'reserve', { w: 1.7, size: 3, rarity: 'rare', tags: [ 'sports', 'military', 'fabric' ],
		model: P( 'reserve', { color: 0x3a4a34 } ), desc: 'Pull it while falling. One use.' } ),
	tool( 'variometer', 'Variometer', 'vario', { w: 0.18, size: 0.5, rarity: 'uncommon', tags: [ 'sports', 'electronics', 'device' ], tool: { battery: 30 },
		model: P( 'vario' ), desc: 'Beeps in rising air. AA batteries.' } ),
	tool( 'ripstop_tape', 'Ripstop tape', 'ripstop', { w: 0.08, size: 0.3, tags: [ 'sports', 'surf', 'hardware', 'adhesive', 'outdoor' ], tool: { uses: 4 },
		model: P( 'tape', { color: 0xe8b12a } ), desc: 'Patches canopies, tents and tarps.' } ),

	// ================= climbing =================
	tool( 'grappling_hook', 'Grappling hook', 'grapple', { w: 1.3, size: 3, rarity: 'uncommon', tags: [ 'hardware', 'military', 'police', 'metal' ],
		model: P( 'grapple' ), desc: 'Rig a rope, then throw at a ledge.' } ),
	mat( 'climbing_rope', 'Climbing rope', { w: 3.2, size: 4, rarity: 'uncommon', tags: [ 'sports', 'cordage', 'outdoor', 'fire' ],
		model: P( 'coil', { color: 0x1a4fb0, color2: 0xf2c21a } ), desc: 'Tie off at an edge to climb.' } ),
	wear( 'climbing_harness', 'Climbing harness', 'belt', { w: 0.45, size: 1.5, rarity: 'uncommon', tags: [ 'sports', 'fire', 'outdoor' ], cap: 1, color: 0xd8562a,
		model: P( 'harness', { color: 0xd8562a, color2: 0x2a2a2e } ), desc: 'Climb ropes faster. Rappel with it.' } ),
	tool( 'descender', 'Figure-eight descender', 'descender', { w: 0.12, size: 0.3, rarity: 'uncommon', tags: [ 'sports', 'fire', 'metal' ],
		model: P( 'eight' ), desc: 'Rappel fast. Needs a harness.' } ),
	tool( 'ascender', 'Rope ascender', 'ascender', { w: 0.24, size: 0.5, rarity: 'rare', tags: [ 'sports', 'fire', 'metal' ],
		model: P( 'ascender' ), desc: 'Climb ropes faster, with less effort.' } ),
	tool( 'chalk_bag', 'Chalk bag', 'chalk', { w: 0.2, size: 0.5, tags: [ 'sports' ], tool: { uses: 12 },
		model: P( 'chalk', { color: 0x2a6a5a } ), desc: 'Better grip on ropes. Less effort.' } ),
	tool( 'folding_ladder', 'Folding ladder', 'ladder', { w: 11, size: 14, rarity: 'uncommon', tags: [ 'hardware', 'garage', 'metal' ], carry: { slow: 0.9 },
		model: P( 'ladder', { kind: 'folding' } ), desc: 'Lean on a wall. Reaches 3.5 m.' } ),
	tool( 'extension_ladder', 'Extension ladder', 'ladder', { w: 16, size: 24, rarity: 'uncommon', tags: [ 'hardware', 'fire', 'metal' ], carry: { slow: 0.8 },
		model: P( 'ladder', { kind: 'extension' } ), desc: 'Lean on a wall. Reaches 6.5 m.' } ),
	tool( 'rope_ladder', 'Escape ladder', 'rope_ladder', { w: 4.2, size: 5, rarity: 'uncommon', tags: [ 'hotel', 'fire', 'hardware' ],
		model: P( 'rope_ladder' ), desc: 'Hang from a sill or a roof edge.' } ),

	// ================= wheels =================
	tool( 'skateboard', 'Skateboard', 'board', { w: 2.3, size: 5, tags: [ 'sports', 'surf', 'school', 'toy' ],
		model: P( 'deck', { kind: 'skate', color: 0xe8d84a, art: 'shaka' } ), desc: 'Ride on pavement. Ollie kerbs.' } ),
	tool( 'longboard', 'Longboard', 'board', { w: 3.4, size: 7, rarity: 'uncommon', tags: [ 'sports', 'surf' ],
		model: P( 'deck', { kind: 'long', color: 0xc8a06a, art: 'koa' } ), desc: 'Ride on pavement. Fast and steady.' } ),
	tool( 'kick_scooter', 'Kick scooter', 'board', { w: 3.6, size: 6, tags: [ 'sports', 'school', 'toy', 'metal' ],
		model: P( 'scooter', { color: 0x2ab8d8 } ), desc: 'Ride on pavement. Folds small.' } ),
	wear( 'inline_skates', 'Inline skates', 'feet', { w: 2.4, size: 4, rarity: 'uncommon', tags: [ 'sports', 'school' ], ins: 0.06, bite: 0.12, color: 0xdadce0,
		model: P( 'skates', { color: 0xdadce0, color2: 0x1ab8a8 } ), desc: 'Wear to skate on pavement.' } ),
	mat( 'skate_wheels', 'Skate wheels', { w: 0.45, size: 0.5, tags: [ 'sports', 'surf', 'plastic' ],
		model: P( 'wheels', { color: 0xf2f0e6 } ), desc: 'Fixes boards, skates and scooters.' } ),
	tool( 'holua_sled', 'Hōlua sled', 'sled', { w: 9, size: 18, rarity: 'rare', tags: [ 'wood', 'hawaiian' ], carry: { slow: 0.88 },
		model: P( 'holua' ), desc: 'Slide down grassy slopes.' } ),

	// ================= water =================
	tool( 'paddleboard', 'Paddleboard', 'board', { w: 11, size: 26, rarity: 'uncommon', tags: [ 'surf', 'beach' ], board: { deck: 0.14 }, carry: { slow: 0.82 },
		model: P( 'sup', { color: 0xf2f0e8, color2: 0x1e8aa8 } ), desc: 'Stand and paddle on calm water.' } ),
	tool( 'sup_paddle', 'SUP paddle', 'paddle', { w: 0.9, size: 5, tags: [ 'surf', 'beach' ],
		model: P( 'paddle', { color: 0x1e8aa8 } ), desc: 'For a paddleboard.' } ),
	tool( 'board_leash', 'Board leash', 'leash', { w: 0.2, size: 0.5, tags: [ 'surf', 'beach' ],
		model: P( 'leash', { color: 0x2a3a5a } ), desc: 'Keeps your board when you fall off.' } ),
	tool( 'ding_resin', 'Ding repair resin', 'resin', { w: 0.15, size: 0.5, tags: [ 'surf', 'hardware', 'adhesive' ], tool: { uses: 3 },
		model: P( 'resin' ), desc: 'Fixes dings in boards.' } ),

	// ================= hauling =================
	misc( 'shopping_cart', 'Shopping cart', { w: 15, size: 30, tags: [ 'grocery', 'metal' ], hauler: true,
		model: P( 'cart' ), desc: 'Push it. Holds a lot. Loud.' } ),
	misc( 'wheelbarrow', 'Wheelbarrow', { w: 16, size: 30, rarity: 'uncommon', tags: [ 'farm', 'hardware', 'metal' ], hauler: true,
		model: P( 'barrow', { color: 0x2a6a3a } ), desc: 'Push it. Holds a lot. Any ground.' } ),
	misc( 'beach_wagon', 'Beach wagon', { w: 11, size: 9, rarity: 'uncommon', tags: [ 'beach', 'surf', 'hotel' ], hauler: true,
		model: P( 'wagon', { color: 0x1e7ab8 } ), desc: 'Pull it. Good on sand. Folds.' } ),
	misc( 'hand_truck', 'Hand truck', { w: 12, size: 14, rarity: 'uncommon', tags: [ 'warehouse', 'hardware', 'metal' ], hauler: true,
		model: P( 'truck', { color: 0xd8302a } ), desc: 'Moves heavy loads and placed gear.' } ),

	// ================= the zipline =================
	tool( 'zipline_kit', 'Zipline kit', 'zipline', { w: 9, size: 8, rarity: 'rare', tags: [ 'sports', 'military', 'metal' ],
		model: P( 'zipkit' ), desc: 'Tie between two anchors. Ride down.' } ),
	tool( 'zip_trolley', 'Zip trolley', 'trolley', { w: 0.9, size: 1.5, rarity: 'uncommon', tags: [ 'sports', 'military', 'metal' ],
		model: P( 'trolley' ), desc: 'Ride a zipline.' } ),

	// ================= on foot =================
	tool( 'trekking_poles', 'Trekking poles', 'poles', { w: 0.55, size: 3, tags: [ 'sports', 'outdoor', 'metal' ],
		model: P( 'poles', { color: 0x3a5ad8 } ), desc: 'Hold for steep slopes. Less effort.' } ),
	tool( 'umbrella', 'Umbrella', 'umbrella', { w: 0.45, size: 2, tags: [ 'house', 'hotel', 'office', 'tourist' ],
		model: P( 'umbrella', { color: 0x1e3a6a, open: false } ), desc: 'Hold it open to stay dry.' } ),
	tool( 'umbrella_open', 'Umbrella (open)', 'umbrella', { w: 0.45, size: 8, tags: [ 'house' ],
		model: P( 'umbrella', { color: 0x1e3a6a, open: true } ), desc: 'Keeps the rain off. Close to pack.' } ),
] );

// ======================================================================================================================
// where they are found
// ======================================================================================================================

const add = ( t, e ) => extendLoot( t, e );

// ---- shops ----
add( 'sports', [ [ 'skateboard', 0.9 ], [ 'longboard', 0.35 ], [ 'kick_scooter', 0.6 ], [ 'inline_skates', 0.45 ], [ 'skate_wheels', 0.8 ], [ 'trekking_poles', 0.7 ],
	[ 'climbing_rope', 0.45 ], [ 'climbing_harness', 0.35 ], [ 'descender', 0.3 ], [ 'ascender', 0.12 ], [ 'chalk_bag', 0.6 ], [ 'grappling_hook', 0.12 ],
	[ 'ripstop_tape', 0.4 ], [ 'variometer', 0.08 ], [ 'paraglider', 0.05 ], [ 'reserve_chute', 0.05 ], [ 'zip_trolley', 0.15 ], [ 'zipline_kit', 0.06 ],
	[ 'holua_sled', 0.03 ] ] );
add( 'surf', [ [ 'paddleboard', 0.55 ], [ 'sup_paddle', 0.7 ], [ 'board_leash', 0.9 ], [ 'ding_resin', 0.7 ], [ 'skateboard', 0.6 ], [ 'longboard', 0.6 ],
	[ 'skate_wheels', 0.5 ], [ 'beach_wagon', 0.2 ], [ 'ripstop_tape', 0.15 ] ] );
add( 'hardware', [ [ 'folding_ladder', 0.5 ], [ 'extension_ladder', 0.25 ], [ 'rope_ladder', 0.2 ], [ 'wheelbarrow', 0.35 ], [ 'hand_truck', 0.3 ],
	[ 'grappling_hook', 0.06 ], [ 'climbing_rope', 0.12 ], [ 'ripstop_tape', 0.2 ], [ 'ding_resin', 0.15 ], [ 'umbrella', 0.3 ] ] );
add( 'garage_shop', [ [ 'folding_ladder', 0.25 ], [ 'hand_truck', 0.3 ], [ 'skate_wheels', 0.1 ] ] );
add( 'grocery', [ [ 'shopping_cart', 0.9 ], [ 'umbrella', 0.25 ] ] );
add( 'market', [ [ 'shopping_cart', 0.3 ], [ 'hand_truck', 0.12 ], [ 'umbrella', 0.15 ] ] );
add( 'convenience', [ [ 'umbrella', 0.45 ], [ 'ripstop_tape', 0.05 ] ] );
add( 'gas_station', [ [ 'umbrella', 0.2 ] ] );
add( 'pawn', [ [ 'holua_sled', 0.08 ], [ 'skateboard', 0.3 ], [ 'longboard', 0.15 ], [ 'variometer', 0.08 ], [ 'paraglider', 0.03 ] ] );
add( 'warehouse', [ [ 'hand_truck', 0.6 ], [ 'shopping_cart', 0.1 ], [ 'extension_ladder', 0.12 ], [ 'folding_ladder', 0.15 ] ] );
add( 'post', [ [ 'hand_truck', 0.25 ] ] );
add( 'hotel_room', [ [ 'umbrella', 0.35 ], [ 'rope_ladder', 0.05 ], [ 'beach_wagon', 0.04 ] ] );
add( 'farm', [ [ 'wheelbarrow', 0.6 ], [ 'folding_ladder', 0.15 ], [ 'trekking_poles', 0.08 ] ] );
add( 'hangar', [ [ 'paraglider', 0.22 ], [ 'reserve_chute', 0.3 ], [ 'variometer', 0.3 ], [ 'ripstop_tape', 0.4 ] ] );

// ---- homes ----
add( 'house_garage', [ [ 'folding_ladder', 0.3 ], [ 'skateboard', 0.35 ], [ 'kick_scooter', 0.3 ], [ 'inline_skates', 0.12 ], [ 'wheelbarrow', 0.12 ],
	[ 'beach_wagon', 0.12 ], [ 'paddleboard', 0.06 ], [ 'sup_paddle', 0.08 ], [ 'trekking_poles', 0.12 ], [ 'skate_wheels', 0.15 ], [ 'board_leash', 0.12 ],
	[ 'extension_ladder', 0.05 ] ] );
add( 'house_living', [ [ 'umbrella', 0.4 ] ] );
add( 'house_bedroom', [ [ 'skateboard', 0.08 ], [ 'inline_skates', 0.06 ], [ 'rope_ladder', 0.03 ] ] );
add( 'school', [ [ 'skateboard', 0.2 ], [ 'kick_scooter', 0.25 ], [ 'inline_skates', 0.08 ], [ 'umbrella', 0.12 ] ] );
add( 'office', [ [ 'umbrella', 0.35 ] ] );
add( 'church', [ [ 'umbrella', 0.2 ], [ 'holua_sled', 0.015 ] ] );

// ---- services ----
add( 'fire_station', [ [ 'extension_ladder', 0.4 ], [ 'rope_ladder', 0.3 ], [ 'climbing_rope', 0.45 ], [ 'climbing_harness', 0.4 ], [ 'descender', 0.35 ],
	[ 'ascender', 0.15 ], [ 'grappling_hook', 0.06 ] ] );
add( 'military', [ [ 'grappling_hook', 0.12 ], [ 'reserve_chute', 0.1 ], [ 'zipline_kit', 0.05 ], [ 'zip_trolley', 0.08 ], [ 'climbing_rope', 0.12 ] ] );
add( 'military_locker', [ [ 'grappling_hook', 0.06 ], [ 'descender', 0.1 ], [ 'climbing_harness', 0.06 ] ] );
add( 'police', [ [ 'grappling_hook', 0.04 ] ] );

// ---- outdoors ----
add( 'beach', [ [ 'umbrella', 0.15 ], [ 'board_leash', 0.12 ], [ 'beach_wagon', 0.06 ], [ 'sup_paddle', 0.05 ] ] );
add( 'street', [ [ 'shopping_cart', 0.1 ], [ 'skateboard', 0.06 ], [ 'umbrella', 0.12 ] ] );
add( 'site_beach_camp', [ [ 'paddleboard', 0.2 ], [ 'sup_paddle', 0.25 ], [ 'board_leash', 0.3 ], [ 'beach_wagon', 0.3 ], [ 'umbrella', 0.15 ] ] );
add( 'site_roadside', [ [ 'shopping_cart', 0.35 ], [ 'skateboard', 0.12 ], [ 'umbrella', 0.15 ], [ 'kick_scooter', 0.08 ] ] );
add( 'site_bus_stop', [ [ 'umbrella', 0.35 ], [ 'skateboard', 0.1 ], [ 'kick_scooter', 0.08 ] ] );
add( 'site_hiker', [ [ 'trekking_poles', 0.6 ], [ 'climbing_rope', 0.15 ], [ 'chalk_bag', 0.1 ], [ 'paraglider', 0.04 ], [ 'variometer', 0.05 ] ] );
add( 'site_campsite', [ [ 'trekking_poles', 0.3 ], [ 'ripstop_tape', 0.25 ], [ 'climbing_rope', 0.08 ] ] );
add( 'site_fishing_spot', [ [ 'beach_wagon', 0.12 ], [ 'board_leash', 0.06 ] ] );
add( 'site_farm_stand', [ [ 'wheelbarrow', 0.25 ], [ 'hand_truck', 0.06 ] ] );
add( 'site_fema_camp', [ [ 'hand_truck', 0.15 ], [ 'shopping_cart', 0.15 ], [ 'folding_ladder', 0.06 ] ] );
add( 'site_military_checkpoint', [ [ 'grappling_hook', 0.06 ], [ 'zip_trolley', 0.04 ] ] );
add( 'site_heli_crash', [ [ 'reserve_chute', 0.3 ], [ 'grappling_hook', 0.08 ] ] );
add( 'site_supply_drop', [ [ 'reserve_chute', 0.25 ], [ 'zipline_kit', 0.08 ], [ 'grappling_hook', 0.1 ] ] );
add( 'site_body', [ [ 'umbrella', 0.1 ], [ 'skateboard', 0.05 ] ] );

// ---- pockets and trunks (menus only; everything above lies somewhere visible too) ----
add( 'car_trunk', [ [ 'beach_wagon', 0.08 ], [ 'umbrella', 0.15 ], [ 'skateboard', 0.05 ], [ 'trekking_poles', 0.05 ] ] );
add( 'zombie_tourist', [ [ 'umbrella', 0.04 ] ] );

// ======================================================================================================================
// mixes and recipes
// ======================================================================================================================

const CANOPY = { ids: [ 'paraglider', 'reserve_chute', 'umbrella', 'umbrella_open' ] };
const TENTISH = { any: [ CANOPY, { tool: [ 'tent' ] }, 'tarp', 'tarp_shelter', 'rain_poncho' ] };
const ROLLING = { ids: [ 'skateboard', 'longboard', 'kick_scooter', 'inline_skates', 'shopping_cart', 'beach_wagon', 'hand_truck' ] };
const BOARD = { fn: ( s, d ) => !! boardOf( d ) || d.id === 'skateboard' || d.id === 'longboard' || d.id === 'holua_sled' };
const worn = ( c, max = 0.98 ) => c.b.cond >= max ? { reason: 'In good shape', soft: true } : null;

addCombos( [
	// a rope on the hook: it goes up with the hook and comes back with it
	{ id: 'mob_rig_hook', verb: 'Rig', label: 'Rig hook with {a}', a: { ids: [ 'climbing_rope', 'rope' ] }, b: 'grappling_hook', use: { a: 1, b: 0 }, time: 6, sound: 'zipper',
		check: ( c ) => c.b.data?.rope ? { reason: 'Already rigged', soft: true } : null,
		run: ( c ) => { c.b.data.rope = c.a.id; c.b.data.ropeCond = c.a.cond; c.b.data.name = c.a.id === 'climbing_rope' ? 'Grappling hook (28 m)' : 'Grappling hook (9 m)'; } },
	// torn fabric: a canopy, a tent, a tarp
	{ id: 'mob_patch_canopy', verb: 'Patch', a: 'ripstop_tape', b: TENTISH, use: { a: 1, b: 0 }, repair: { b: 0.25, max: 0.95 }, time: 8, sound: 'tear', skill: 'tailoring', xp: 3,
		check: ( c ) => worn( c, 0.95 ) },
	// new wheels and bearings
	{ id: 'mob_wheels', verb: 'Fit', label: 'Fit wheels to {b}', a: 'skate_wheels', b: ROLLING, use: { a: 1, b: 0 }, repair: { b: 0.5, max: 1 }, time: 10, sound: 'craft', skill: 'mechanics', xp: 3,
		check: ( c ) => worn( c ) },
	// dings filled and cured in the sun
	{ id: 'mob_resin', verb: 'Fix dings', label: 'Fix dings in {b}', a: 'ding_resin', b: BOARD, use: { a: 1, b: 0 }, repair: { b: 0.35, max: 1 }, time: 12, sound: 'craft', skill: 'maintenance', xp: 3,
		check: ( c ) => worn( c ) },
	// a harness and a descender can be patched like any webbing
	{ id: 'mob_tape_harness', verb: 'Patch', a: { tool: 'tape' }, b: { ids: [ 'climbing_harness', 'board_leash' ] }, use: { a: 1, b: 0 }, repair: { b: 0.2, max: 0.8 }, time: 5, sound: 'tear', skill: 'tailoring',
		check: ( c ) => worn( c, 0.8 ) },
] );

addRecipes( [
	// a hōlua sled the old way: two long runners, cross pieces, lashed with cord
	R( 'mob_holua', 'Hōlua sled', [ 'holua_sled', 1 ], [ [ 'planks', 4 ], [ 'rope', 1 ] ], { tools: [ 'cut' ], time: 60, cat: 'tools', skill: 'carpentry', xp: 20 } ),
	// a rope ladder: rope and short sticks for rungs
	R( 'mob_rope_ladder', 'Rope ladder', [ 'rope_ladder', 1 ], [ [ 'rope', 2 ], [ 'stick', 6 ] ], { tools: [ 'cut' ], time: 45, cat: 'tools', skill: 'carpentry', xp: 12 } ),
	// a hook from rebar or a crowbar's worth of scrap, bent and welded
	R( 'mob_grapple', 'Grappling hook', [ 'grappling_hook', 1 ], [ [ 'scrap_metal', 3 ], [ 'wire', 1 ] ], { tools: [ 'hammer' ], time: 40, cat: 'tools', skill: 'mechanics', xp: 12 } ),
] );

// ======================================================================================================================
// verbs
// ======================================================================================================================

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, sys = system( g ), use = ctx.use, id = def.id;
	if ( ! sys ) return;
	const carried = !! g.player.inventory.findUid?.( stack.uid );
	switch ( id ) {
		case 'paraglider':
			if ( ! stack.data.spread ) ctx.first( 'Launch', () => sys.launch( stack ), [ stack.cond < 0.3 ? 'torn' : null ] );
			break;
		case 'grappling_hook':
			if ( stack.data.rope ) {
				ctx.first( 'Throw', () => sys.throwHook( stack ) );
				ctx.add( 'Unrig', () => use.timed( 'Unrigging', 3, 'zipper', () => {
					if ( ! use.exists( stack ) ) return;
					const r = stack.data.rope, cond = stack.data.ropeCond ?? 1;
					delete stack.data.rope; delete stack.data.ropeCond; delete stack.data.name;
					use.give( r, 1, { cond } );
				} ) );
			}
			break;
		case 'climbing_rope': case 'rope': {
			const gear = { harness: g.player.inventory.equip?.belt?.id === 'climbing_harness' };
			ctx.add( 'Tie off at edge', () => sys.aimAt( stack, 'rope' ) );
			if ( gear.harness ) ctx.add( 'Rappel', () => sys.aimAt( stack, 'rappel' ) );
			break;
		}
		case 'folding_ladder': case 'extension_ladder':
			ctx.first( 'Lean on wall', () => sys.aimAt( stack, 'ladder' ) );
			break;
		case 'rope_ladder':
			ctx.first( 'Hang at edge', () => sys.aimAt( stack, 'rope_ladder' ) );
			break;
		case 'skateboard': case 'longboard': case 'kick_scooter': case 'holua_sled':
			ctx.first( 'Ride', () => sys.ride( stack ), [ stack.cond < 0.35 ? 'worn' : null ] );
			break;
		case 'paddleboard': case 'surfboard': case 'bodyboard':
			// (the surfboard's own Surf stays its default)
			( id === 'paddleboard' ? ctx.first : ctx.add )( 'Paddle out', () => sys.paddleOut( stack, id !== 'paddleboard' || ! g.player.inventory.find( ( s, d ) => d?.tool?.kind === 'paddle' || d?.melee?.tools?.includes( 'paddle' ) ) ) );
			break;
		case 'beach_wagon':
			if ( carried ) ctx.first( 'Unfold', () => sys.setDown( stack ) );
			break;
		case 'hand_truck':
			if ( carried ) ctx.first( 'Set down', () => sys.setDown( stack ) );
			break;
		case 'zipline_kit':
			ctx.first( 'Tie first end', () => sys.tieZip( stack ) );
			break;
		case 'umbrella': case 'umbrella_open':
			ctx.first( id === 'umbrella' ? 'Open' : 'Close', () => sys.umbrella( stack ) );
			break;
		case 'variometer':
			ctx.first( stack.data.on ? 'Turn off' : 'Turn on', () => { stack.data.on = ! stack.data.on; g.player.inventory.changed(); g.toast( stack.data.on ? 'Variometer on' : 'Variometer off', 'info' ); } );
			break;
	}
} );

// the system starts with the items module (hooks.js addSystem: this domain has no module of its own)
addSystem( attach );

// (getItem kept for the tests' imports of this file's neighbours)
void getItem; void RIDE; void HAUL; void ROPES; void LADDERS;
