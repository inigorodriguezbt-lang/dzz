// Senses, hazards and diving (the equipment expansion's "senses" domain): what changes how you see, hear and breathe.
//   vision: night-vision goggles (worn, U switches them on: green phosphor, gain at night, whited out by daylight and
//     lamps), a cheap Gen-1 handheld (aim it; grainier, it whines), an infrared illuminator only a tube sees, thermal
//     goggles and a thermal monocular (white hot, black hot or ironbow: the living glow, the infected run cold, smoke
//     hides nothing), a spotting scope (aim it, or set it up on its tripod for a steady 22×)
//   hearing: electronic ear defenders (gunshots limited, footsteps and groans lifted; no ringing), foam earplugs (dull
//     everything), and a parabolic microphone that hears groans far off in the direction you point it
//   air: filters for the gas masks and cartridges for the half-face respirator (they wear down in the haze), a gas
//     detector that beeps before you see Kīlauea's vog, and a firefighter's SCBA
//   diving: a scuba tank and regulator (a scuba set: air by depth and time), a BCD (a heavy tank drags without one), a
//     dive computer (depth, time, the no-stop limit, ascend slowly), a dive light (sealed: other lights flood), a
//     military rebreather (silent, constant oxygen, toxic below 7 m) and its refill, a petrol compressor to fill tanks
//   gadgets: a smartwatch (time and vitals, buzzes at a racing heart or low oxygen), a laser pointer (the infected follow
//     the dot), motion sensors and their alarm receiver, a weather radio (forecast, surf, storm warnings, vog advisories),
//     CR123 lithium cells for the military kit
// The numbers: ../../ext/senses/logic.js; the system (vision, hearing, vog, diving, gadgets): ../../ext/senses/runtime.js;
// placed things: ../../ext/senses/kinds.js; models: ../../models/ext/senses.js.
import { defineItems, getItem, makeStack } from '../../ItemDB.js';
import { extendLoot } from '../../Loot.js';
import { addCombos } from '../../combos.js';
import { addUseActions, addSystem } from '../../hooks.js';
import { fmtHour } from '../../util.js';
import * as L from '../../ext/senses/logic.js';
import { attach, system } from '../../ext/senses/runtime.js';
import { bindSystem, tanksToFill, tankFrac } from '../../ext/senses/kinds.js';
import { playSensesSound } from '../../ext/senses/sounds.js';
// the outdoor sites' tables (site_<kind>) are defined there; imported first so they can be extended here
import '../../sites/tables.js';

bindSystem( system );

// ---- helpers ------------------------------------------------------------------------------------------------------------

// a device: o = { cat, w, size, stack, rarity, tags, model, desc, tool: { kind, battery, cell, rechargeable, zoom, light },
// senses: { kind, view, tube, core, waterproof }, clothing: { slot, … }, place, … }
function dev( id, name, o ) {
	const d = {
		id, name, cat: o.cat || 'tool', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 1, stack: o.stack ?? 1, rarity: o.rarity || 'uncommon',
		tags: [ 'senses', ...( o.tags || [] ) ], model: o.model,
	};
	if ( o.tool ) d.tool = { ...o.tool };
	if ( o.senses ) d.senses = { ...o.senses };
	if ( o.wear ) d.clothing = { slot: o.wear.slot, capacity: o.wear.cap ?? 0, insulation: o.wear.ins ?? 0.02, armor: { bite: o.wear.bite ?? 0, bullet: 0 }, waterproof: o.wear.wp ?? 0, visibility: o.wear.vis ?? 0.5, color: o.wear.color ?? 0x2a2c26 };
	for ( const k of [ 'place', 'dismantle', 'dismantleTools' ] ) if ( o[ k ] !== undefined ) d[ k ] = o[ k ];
	return d;
}

const OD = 0x3c4232, TAN = 0x8a7a5a, BLK = 0x1c1d1f;

// ======================================================================================================================
// the items
// ======================================================================================================================

defineItems( [
	// ---------------- vision ----------------
	dev( 'nvg_goggles', 'Night-vision goggles', { cat: 'clothing', w: 0.75, size: 3, rarity: 'epic', tags: [ 'optics', 'electronics', 'army' ],
		wear: { slot: 'eyes', color: OD, vis: 0.5 }, tool: { kind: 'nvg', battery: 12, cell: 'aa' }, senses: { kind: 'nvg', view: 'nv', tube: 'gen3' },
		model: { type: 'senses_nvg', style: 'binocular', color: OD }, dismantle: [ [ 'electronic_scrap', 2 ] ], dismantleTools: [ 'screwdriver' ], desc: 'See in the dark. U switches.' } ),
	dev( 'nvg_monocular', 'Night-vision monocular', { w: 0.42, size: 2, rarity: 'rare', tags: [ 'optics', 'electronics', 'hunting' ],
		tool: { kind: 'binoculars', zoom: 2.5, battery: 8, cell: 'aa' }, senses: { kind: 'nvg', view: 'nv', tube: 'gen1' },
		model: { type: 'senses_monocular', style: 'gen1', color: 0x24272a }, dismantle: [ [ 'electronic_scrap', 1 ] ], dismantleTools: [ 'screwdriver' ], desc: 'Aim it to see in the dark.' } ),
	dev( 'ir_illuminator', 'IR illuminator', { w: 0.22, size: 1, rarity: 'rare', tags: [ 'optics', 'electronics', 'army' ],
		tool: { kind: 'senses_ir', battery: 10, cell: 'cr123' }, senses: { kind: 'ir' },
		model: { type: 'senses_ir', color: TAN }, desc: 'Light only night vision sees.' } ),
	dev( 'thermal_goggles', 'Thermal goggles', { cat: 'clothing', w: 0.9, size: 3, rarity: 'epic', tags: [ 'optics', 'electronics', 'army' ],
		wear: { slot: 'eyes', color: BLK, vis: 0.5 }, tool: { kind: 'thermal', battery: 6, cell: 'cr123' }, senses: { kind: 'thermal', view: 'thermal', core: 'goggles' },
		model: { type: 'senses_nvg', style: 'thermal', color: 0x2b2e2a }, dismantle: [ [ 'electronic_scrap', 2 ] ], dismantleTools: [ 'screwdriver' ], desc: 'See body heat. U switches.' } ),
	dev( 'thermal_monocular', 'Thermal monocular', { w: 0.45, size: 2, rarity: 'rare', tags: [ 'optics', 'electronics', 'hunting' ],
		tool: { kind: 'binoculars', zoom: 3, battery: 5, cell: 'usb', rechargeable: true }, senses: { kind: 'thermal', view: 'thermal', core: 'handheld' },
		model: { type: 'senses_monocular', style: 'thermal', color: 0x2a2c2e }, dismantle: [ [ 'electronic_scrap', 1 ] ], dismantleTools: [ 'screwdriver' ], desc: 'Aim it to see body heat.' } ),
	dev( 'spotting_scope', 'Spotting scope', { w: 1.6, size: 5, rarity: 'uncommon', tags: [ 'optics', 'hunting' ],
		tool: { kind: 'binoculars', zoom: 12 }, senses: { kind: 'scope' }, place: { kind: 'senses_scope', verb: 'Set up' },
		model: { type: 'senses_scope', color: 0x3c4a3a }, desc: 'Aim, or set up for 22×.' } ),

	// ---------------- hearing ----------------
	dev( 'electronic_earmuffs', 'Electronic ear defenders', { cat: 'clothing', w: 0.4, size: 2, rarity: 'rare', tags: [ 'electronics', 'shooting' ],
		wear: { slot: 'head', color: OD, ins: 0.05 }, tool: { kind: 'senses_ears', battery: 40, cell: 'aa' }, senses: { kind: 'ears' },
		model: { type: 'senses_earmuffs', color: OD }, dismantle: [ [ 'electronic_scrap', 1 ] ], dismantleTools: [ 'screwdriver' ], desc: 'Cut gunshots, lift quiet sounds.' } ),
	dev( 'foam_earplugs', 'Foam earplugs', { cat: 'misc', w: 0.004, size: 0.2, stack: 6, rarity: 'common', tags: [ 'hardware', 'shooting', 'plastic' ],
		model: { type: 'senses_earplugs' }, desc: 'Dull every sound. No ringing.' } ),
	dev( 'parabolic_mic', 'Parabolic microphone', { w: 1.1, size: 5, rarity: 'rare', tags: [ 'electronics' ],
		tool: { kind: 'senses_mic', battery: 14, cell: 'aa' }, senses: { kind: 'mic' },
		model: { type: 'senses_parabolic' }, dismantle: [ [ 'electronic_scrap', 1 ] ], dismantleTools: [ 'screwdriver' ], desc: 'Hold aim to hear far off.' } ),

	// ---------------- air ----------------
	dev( 'gas_filter', 'Gas mask filter', { cat: 'misc', w: 0.25, size: 1, rarity: 'uncommon', tags: [ 'hazmat', 'army' ],
		model: { type: 'senses_filter', color: 0x4a5236 }, desc: 'Screws into a gas mask.' } ),
	dev( 'respirator_cartridges', 'Respirator cartridges', { cat: 'misc', w: 0.16, size: 1, rarity: 'uncommon', tags: [ 'construction', 'plastic' ],
		model: { type: 'senses_cartridges' }, desc: 'A pair for a half-face mask.' } ),
	dev( 'gas_detector', 'Gas detector', { w: 0.2, size: 1, rarity: 'uncommon', tags: [ 'electronics', 'hazmat' ],
		tool: { kind: 'senses_gas', battery: 30, cell: 'usb', rechargeable: true }, senses: { kind: 'detector' },
		model: { type: 'senses_detector' }, dismantle: [ [ 'electronic_scrap', 1 ] ], dismantleTools: [ 'screwdriver' ], desc: 'Beeps near volcanic gas.' } ),
	dev( 'scba_pack', 'SCBA air pack', { cat: 'clothing', w: 10.5, size: 12, rarity: 'rare', tags: [ 'fire' ],
		wear: { slot: 'back', color: 0x1a1a1a, ins: 0.02 }, senses: { kind: 'scba' },
		model: { type: 'senses_scba' }, desc: 'Clean air in gas. Refill it.' } ),

	// ---------------- diving ----------------
	dev( 'scuba_tank', 'Scuba tank', { cat: 'misc', w: 14, size: 10, rarity: 'uncommon', tags: [ 'dive', 'metal' ],
		model: { type: 'senses_tank', color: 0xd8b82a }, desc: 'Air for diving. Fit a regulator.' } ),
	dev( 'scuba_regulator', 'Scuba regulator', { cat: 'misc', w: 1.3, size: 3, rarity: 'uncommon', tags: [ 'dive', 'rubber' ],
		model: { type: 'senses_regulator' }, desc: 'Fits a scuba tank. Has a gauge.' } ),
	dev( 'scuba_set', 'Scuba set', { cat: 'clothing', w: 15.3, size: 12, rarity: 'rare', tags: [ 'dive' ],
		wear: { slot: 'back', color: 0xd8b82a, ins: 0 }, senses: { kind: 'scuba' },
		model: { type: 'senses_tank', color: 0xd8b82a, reg: true }, desc: 'Breathe under water.' } ),
	dev( 'scuba_bcd', 'Dive BCD', { cat: 'clothing', w: 2.8, size: 5, rarity: 'uncommon', tags: [ 'dive' ],
		wear: { slot: 'vest', cap: 4, color: 0x1a2a44, wp: 0.6, ins: 0.04 }, senses: { kind: 'bcd' },
		model: { type: 'senses_bcd', color: 0x1c1d22, color2: 0x1f6ad8 }, desc: 'Buoyancy vest. Carries a tank.' } ),
	dev( 'dive_computer', 'Dive computer', { w: 0.12, size: 0.5, rarity: 'uncommon', tags: [ 'dive', 'electronics' ],
		tool: { kind: 'senses_dive', battery: 80, cell: 'usb', rechargeable: true }, senses: { kind: 'divecomp', waterproof: true },
		model: { type: 'senses_divecomp' }, desc: 'Depth, time, ascent rate.' } ),
	dev( 'dive_light', 'Dive light', { w: 0.5, size: 1, rarity: 'uncommon', tags: [ 'dive', 'light' ],
		tool: { kind: 'flashlight', battery: 10, light: { kind: 'spot', range: 46, angle: 0.34, color: 0xeef6ff, intensity: 110 } }, senses: { kind: 'light', waterproof: true },
		model: { type: 'senses_divelight', color: 0xf2c21a }, desc: 'Sealed. Works under water.' } ),
	dev( 'rebreather', 'Rebreather', { cat: 'clothing', w: 11, size: 9, rarity: 'legendary', tags: [ 'dive', 'army' ],
		wear: { slot: 'vest', color: 0x3a4232, ins: 0.05 }, senses: { kind: 'rebreather' },
		model: { type: 'senses_rebreather', color: 0x3a4232 }, desc: 'Silent air. Shallow only.' } ),
	dev( 'rebreather_refill', 'Rebreather refill', { cat: 'misc', w: 1.4, size: 2, rarity: 'rare', tags: [ 'dive', 'army' ],
		model: { type: 'senses_scrubber' }, desc: 'Absorbent and oxygen for one dive.' } ),
	dev( 'dive_compressor', 'Dive compressor', { cat: 'misc', w: 28, size: 18, rarity: 'rare', tags: [ 'dive', 'metal' ],
		place: { kind: 'senses_compressor', verb: 'Set up' }, model: { type: 'senses_compressor' }, desc: 'Fills tanks. Runs on gasoline.' } ),

	// ---------------- gadgets ----------------
	dev( 'smartwatch', 'Smartwatch', { w: 0.05, size: 0.5, rarity: 'uncommon', tags: [ 'electronics', 'valuable_small' ],
		tool: { kind: 'senses_watch', battery: 30, cell: 'usb', rechargeable: true }, senses: { kind: 'watch', waterproof: true },
		model: { type: 'senses_watch' }, desc: 'Time, heart rate, oxygen.' } ),
	dev( 'laser_pointer', 'Laser pointer', { w: 0.04, size: 0.5, rarity: 'uncommon', tags: [ 'electronics', 'office_small' ],
		tool: { kind: 'senses_laser', battery: 8, cell: 'aa' }, senses: { kind: 'laser' },
		model: { type: 'senses_laser' }, desc: 'The infected follow its dot.' } ),
	dev( 'motion_sensor', 'Motion sensor', { cat: 'misc', w: 0.18, size: 0.5, stack: 4, rarity: 'uncommon', tags: [ 'electronics', 'plastic' ],
		place: { kind: 'senses_sensor', verb: 'Set' }, model: { type: 'senses_sensor' }, desc: 'Pings the alarm receiver.' } ),
	dev( 'alarm_receiver', 'Alarm receiver', { w: 0.12, size: 0.5, rarity: 'uncommon', tags: [ 'electronics' ],
		tool: { kind: 'senses_receiver', battery: 48, cell: 'aa' }, senses: { kind: 'receiver' },
		model: { type: 'senses_receiver' }, desc: 'Chimes when a sensor trips.' } ),
	dev( 'weather_radio', 'Weather radio', { w: 0.45, size: 2, rarity: 'uncommon', tags: [ 'electronics' ],
		tool: { kind: 'senses_wx', battery: 40, cell: 'aa' }, senses: { kind: 'radio' },
		model: { type: 'senses_wxradio' }, dismantle: [ [ 'electronic_scrap', 1 ] ], dismantleTools: [ 'screwdriver' ], desc: 'Forecast, surf, vog alerts.' } ),
	dev( 'battery_cr123', 'CR123 batteries', { w: 0.017, size: 0.3, stack: 4, rarity: 'uncommon', tags: [ 'battery_cr123', 'army' ],
		tool: { kind: 'cell', cell: 'cr123' }, model: { type: 'senses_cr123' }, desc: 'Lithium cells for military kit.' } ),
] );

// the gas masks and the half-face respirator take filters; their models are the polished ones
for ( const id of [ 'gas_mask', 'gas_mask_civil', 'respirator' ] ) {
	const d = getItem( id );
	if ( ! d ) continue;
	d.tags = [ ...new Set( [ ...d.tags, 'senses' ] ) ];
	d.senses = { kind: 'mask', filter: L.MASKS[ id ].filter };
}
if ( getItem( 'gas_mask' ) ) getItem( 'gas_mask' ).model = { type: 'senses_gasmask', color: 0x2a2c2a };
if ( getItem( 'respirator' ) ) getItem( 'respirator' ).model = { type: 'senses_halfmask', color: 0x2a2b2e };
if ( getItem( 'gas_mask' ) ) getItem( 'gas_mask' ).desc = 'Takes a filter. Covers the eyes.';
if ( getItem( 'gas_mask_civil' ) ) getItem( 'gas_mask_civil' ).desc = 'Takes a filter. Covers the eyes.';
if ( getItem( 'respirator' ) ) getItem( 'respirator' ).desc = 'Takes cartridges. Eyes uncovered.';

// ======================================================================================================================
// where they lie (building loot spots you can see, and the outdoor sites); the rare military kit stays rare
// ======================================================================================================================

const put = ( table, entries ) => extendLoot( table, entries );
// military and police
put( 'military', [ [ 'gas_filter', 0.8, [ 1, 2 ] ], [ 'battery_cr123', 0.8, [ 1, 4 ] ], [ 'ir_illuminator', 0.2 ], [ 'gas_detector', 0.15 ], [ 'motion_sensor', 0.2, [ 1, 2 ] ],
	[ 'alarm_receiver', 0.12 ], [ 'spotting_scope', 0.1 ], [ 'rebreather_refill', 0.08 ] ] );
put( 'military_armory', [ [ 'nvg_goggles', 0.25 ], [ 'thermal_goggles', 0.1 ], [ 'rebreather', 0.05 ], [ 'rebreather_refill', 0.15 ], [ 'battery_cr123', 0.6, [ 2, 4 ] ] ] );
put( 'military_locker', [ [ 'nvg_goggles', 0.1 ], [ 'gas_filter', 0.6 ], [ 'electronic_earmuffs', 0.3 ], [ 'ir_illuminator', 0.2 ], [ 'battery_cr123', 0.6, [ 1, 4 ] ],
	[ 'thermal_monocular', 0.08 ], [ 'parabolic_mic', 0.05 ], [ 'foam_earplugs', 0.5, [ 1, 4 ] ] ] );
put( 'police', [ [ 'motion_sensor', 0.2, [ 1, 2 ] ], [ 'alarm_receiver', 0.15 ], [ 'laser_pointer', 0.2 ] ] );
put( 'police_locker', [ [ 'electronic_earmuffs', 0.4 ], [ 'gas_filter', 0.4 ], [ 'thermal_monocular', 0.08 ], [ 'battery_cr123', 0.4, [ 1, 2 ] ], [ 'nvg_goggles', 0.03 ],
	[ 'ir_illuminator', 0.08 ], [ 'parabolic_mic', 0.1 ], [ 'foam_earplugs', 0.4, [ 1, 3 ] ] ] );
put( 'gunstore', [ [ 'electronic_earmuffs', 0.8 ], [ 'foam_earplugs', 0.8, [ 2, 6 ] ], [ 'nvg_monocular', 0.35 ], [ 'ir_illuminator', 0.3 ], [ 'battery_cr123', 0.6, [ 2, 4 ] ],
	[ 'spotting_scope', 0.4 ], [ 'thermal_monocular', 0.1 ], [ 'nvg_goggles', 0.05 ], [ 'laser_pointer', 0.2 ] ] );
put( 'fire_station', [ [ 'scba_pack', 0.35 ], [ 'gas_filter', 0.5 ], [ 'gas_detector', 0.6 ], [ 'thermal_monocular', 0.2 ], [ 'respirator_cartridges', 0.3 ], [ 'weather_radio', 0.4 ],
	[ 'dive_compressor', 0.12 ], [ 'scuba_tank', 0.1 ], [ 'scuba_set', 0.06 ], [ 'dive_light', 0.15 ], [ 'foam_earplugs', 0.3, [ 1, 2 ] ] ] );
put( 'hospital', [ [ 'gas_filter', 0.15 ] ] );
// shops and work
put( 'hardware', [ [ 'foam_earplugs', 1.2, [ 2, 6 ] ], [ 'respirator_cartridges', 1 ], [ 'gas_detector', 0.15 ], [ 'motion_sensor', 0.6, [ 1, 3 ] ], [ 'alarm_receiver', 0.4 ],
	[ 'weather_radio', 0.4 ], [ 'battery_cr123', 0.3, [ 1, 2 ] ] ] );
put( 'sports', [ [ 'nvg_monocular', 0.25 ], [ 'spotting_scope', 0.3 ], [ 'electronic_earmuffs', 0.15 ], [ 'dive_computer', 0.15 ], [ 'dive_light', 0.2 ], [ 'smartwatch', 0.3 ],
	[ 'parabolic_mic', 0.08 ] ] );
put( 'surf', [ [ 'scuba_tank', 0.8 ], [ 'scuba_regulator', 0.7 ], [ 'scuba_set', 0.25 ], [ 'scuba_bcd', 0.7 ], [ 'dive_computer', 0.6 ], [ 'dive_light', 0.8 ],
	[ 'dive_compressor', 0.1 ], [ 'weather_radio', 0.15 ] ] );
put( 'pawn', [ [ 'nvg_monocular', 0.25 ], [ 'smartwatch', 0.6 ], [ 'ir_illuminator', 0.1 ], [ 'electronic_earmuffs', 0.15 ], [ 'scuba_regulator', 0.1 ], [ 'dive_computer', 0.2 ],
	[ 'laser_pointer', 0.3 ], [ 'parabolic_mic', 0.08 ], [ 'thermal_monocular', 0.04 ], [ 'battery_cr123', 0.2 ] ] );
put( 'convenience', [ [ 'foam_earplugs', 0.4, [ 1, 2 ] ] ] );
put( 'pharmacy', [ [ 'foam_earplugs', 0.6, [ 1, 4 ] ] ] );
put( 'garage_shop', [ [ 'foam_earplugs', 0.6, [ 1, 4 ] ], [ 'respirator_cartridges', 0.6 ] ] );
put( 'warehouse', [ [ 'foam_earplugs', 0.6, [ 2, 6 ] ], [ 'respirator_cartridges', 0.4 ], [ 'gas_detector', 0.2 ], [ 'motion_sensor', 0.3, [ 1, 2 ] ], [ 'alarm_receiver', 0.2 ],
	[ 'scuba_tank', 0.1 ], [ 'dive_compressor', 0.06 ] ] );
put( 'hangar', [ [ 'electronic_earmuffs', 0.3 ], [ 'foam_earplugs', 0.6, [ 1, 4 ] ], [ 'weather_radio', 0.3 ], [ 'nvg_monocular', 0.05 ], [ 'dive_compressor', 0.04 ] ] );
put( 'observatory', [ [ 'laser_pointer', 0.8 ], [ 'gas_detector', 0.5 ], [ 'gas_filter', 0.3 ], [ 'respirator_cartridges', 0.3 ], [ 'spotting_scope', 0.4 ], [ 'weather_radio', 0.3 ],
	[ 'nvg_monocular', 0.15 ], [ 'parabolic_mic', 0.2 ] ] );
put( 'farm', [ [ 'respirator_cartridges', 0.3 ], [ 'motion_sensor', 0.2, [ 1, 2 ] ], [ 'alarm_receiver', 0.12 ], [ 'weather_radio', 0.3 ] ] );
// homes, offices and schools
put( 'house_bedroom', [ [ 'smartwatch', 0.4 ], [ 'foam_earplugs', 0.3, [ 1, 2 ] ] ] );
put( 'house_living', [ [ 'weather_radio', 0.25 ], [ 'laser_pointer', 0.15 ] ] );
put( 'house_garage', [ [ 'foam_earplugs', 0.4, [ 1, 4 ] ], [ 'respirator_cartridges', 0.3 ], [ 'motion_sensor', 0.3, [ 1, 2 ] ], [ 'alarm_receiver', 0.2 ], [ 'weather_radio', 0.15 ],
	[ 'electronic_earmuffs', 0.05 ], [ 'nvg_monocular', 0.03 ], [ 'scuba_tank', 0.05 ], [ 'dive_light', 0.06 ] ] );
put( 'office', [ [ 'laser_pointer', 0.6 ], [ 'smartwatch', 0.3 ] ] );
put( 'desk', [ [ 'laser_pointer', 0.3 ] ] );
put( 'school', [ [ 'laser_pointer', 0.6 ] ] );
put( 'hotel_room', [ [ 'smartwatch', 0.4 ], [ 'dive_computer', 0.06 ], [ 'spotting_scope', 0.05 ] ] );
// the outdoor sites (ground loot you can always see)
put( 'site_heli_crash', [ [ 'nvg_goggles', 0.35 ], [ 'thermal_goggles', 0.15 ], [ 'thermal_monocular', 0.12 ], [ 'rebreather', 0.06 ], [ 'rebreather_refill', 0.1 ], [ 'gas_filter', 0.3 ],
	[ 'battery_cr123', 0.3, [ 1, 4 ] ] ] );
put( 'site_military_checkpoint', [ [ 'nvg_goggles', 0.08 ], [ 'ir_illuminator', 0.12 ], [ 'gas_filter', 0.4 ], [ 'battery_cr123', 0.3, [ 1, 2 ] ], [ 'electronic_earmuffs', 0.15 ],
	[ 'spotting_scope', 0.1 ], [ 'motion_sensor', 0.15, [ 1, 2 ] ] ] );
put( 'site_supply_drop', [ [ 'nvg_goggles', 0.2 ], [ 'thermal_goggles', 0.08 ], [ 'rebreather', 0.04 ], [ 'rebreather_refill', 0.1 ], [ 'gas_filter', 0.4 ], [ 'battery_cr123', 0.4, [ 2, 4 ] ] ] );
put( 'site_checkpoint', [ [ 'gas_filter', 0.2 ], [ 'foam_earplugs', 0.3, [ 1, 2 ] ] ] );
put( 'site_fema_camp', [ [ 'gas_filter', 0.3 ], [ 'respirator_cartridges', 0.2 ], [ 'gas_detector', 0.08 ], [ 'weather_radio', 0.2 ] ] );
put( 'site_hiker', [ [ 'smartwatch', 0.2 ], [ 'nvg_monocular', 0.04 ], [ 'spotting_scope', 0.08 ] ] );
put( 'site_campsite', [ [ 'nvg_monocular', 0.05 ], [ 'weather_radio', 0.1 ], [ 'motion_sensor', 0.1 ] ] );
put( 'site_beach_camp', [ [ 'dive_computer', 0.1 ], [ 'scuba_tank', 0.08 ], [ 'scuba_regulator', 0.06 ], [ 'scuba_bcd', 0.08 ] ] );
put( 'site_fishing_spot', [ [ 'scuba_tank', 0.1 ], [ 'dive_light', 0.1 ], [ 'weather_radio', 0.15 ], [ 'scuba_bcd', 0.05 ] ] );
put( 'site_roadside', [ [ 'smartwatch', 0.15 ] ] );
put( 'site_body', [ [ 'smartwatch', 0.15 ], [ 'foam_earplugs', 0.1 ] ] );
// the infected's pockets (menus only)
put( 'zombie_tourist', [ [ 'smartwatch', 0.1 ] ] );
put( 'zombie_military', [ [ 'battery_cr123', 0.3 ], [ 'foam_earplugs', 0.3 ] ] );

// ======================================================================================================================
// combos (drag one onto the other)
// ======================================================================================================================

const FILTERED = { gas_filter: [ 'gas_mask', 'gas_mask_civil' ], respirator_cartridges: [ 'respirator' ] };
// a fresh filter in; whatever was fitted comes back out (its wear in its condition)
function fitFilter( c ) {
	const mask = c.b, old = mask.data.filter;
	mask.data.filter = { id: c.a.id, life: Math.round( L.clamp( c.a.cond ?? 1, 0, 1 ) * 100 ) / 100 };
	if ( old && old.life > 0.02 ) for ( const s of c.give( old.id, 1, {} ) || [] ) s.cond = old.life;
	c.toast( `Filter ${L.pct( mask.data.filter.life )}`, 'good' );
}
const lowFor = ( cell ) => ( s, d ) => d?.tool?.cell === cell && d.tool.battery && L.chargeOf( s, d ) < d.tool.battery * 0.95;
const airOf = ( s ) => s?.data?.air ?? 0;

addCombos( [
	{ id: 'senses_fit_filter', verb: 'Fit', label: 'Fit filter', a: 'gas_filter', b: { ids: FILTERED.gas_filter }, use: { a: 1, b: 0 }, time: 3, sound: 'click',
		check: ( c ) => c.a.cond <= 0.02 ? 'Filter spent' : null, run: fitFilter },
	{ id: 'senses_fit_cartridges', verb: 'Fit', label: 'Fit cartridges', a: 'respirator_cartridges', b: { ids: FILTERED.respirator_cartridges }, use: { a: 1, b: 0 }, time: 3, sound: 'click',
		check: ( c ) => c.a.cond <= 0.02 ? 'Cartridges spent' : null, run: fitFilter },
	// a regulator onto a tank makes a scuba set (the air stays)
	{ id: 'senses_regulator', verb: 'Fit', label: 'Fit regulator', a: 'scuba_regulator', b: 'scuba_tank', use: { a: 1, b: 0 }, time: 5, sound: 'click', skill: 'mechanics', xp: 3,
		run: ( c ) => { const air = c.b.data.air ?? L.DIVE.bar * 0.6; c.replace( c.b, 'scuba_set', { air } ); } },
	// swap a fuller tank onto the set: the empty one comes off
	{ id: 'senses_tank_swap', verb: 'Swap', label: 'Swap tank', a: 'scuba_tank', b: 'scuba_set', use: { a: 0, b: 0 }, time: 6, sound: 'click',
		check: ( c ) => airOf( c.a ) <= airOf( c.b ) + 5 ? { reason: 'Not fuller', soft: true } : null,
		run: ( c ) => { const a = airOf( c.a ), b = airOf( c.b ); c.b.data.air = a; c.a.data.air = b; c.toast( `Scuba set ${Math.round( a )} bar`, 'good' ); } },
	{ id: 'senses_rebreather_refill', verb: 'Refill', label: 'Refill rebreather', a: 'rebreather_refill', b: 'rebreather', use: { a: 1, b: 0 }, time: 12, sound: 'click', skill: 'mechanics', xp: 4,
		check: ( c ) => ( c.b.data.o2 ?? 0 ) >= L.REBREATHER.o2 * 0.95 && ( c.b.data.scrub ?? 0 ) >= L.REBREATHER.scrub * 0.95 ? { reason: 'Already full', soft: true } : null,
		run: ( c ) => { c.b.data.o2 = L.REBREATHER.o2; c.b.data.scrub = L.REBREATHER.scrub; } },
	{ id: 'senses_insert_cr123', verb: 'Insert', label: 'Insert into {b}', a: 'battery_cr123', b: { fn: lowFor( 'cr123' ) }, use: { a: 1, b: 0 }, time: 3, sound: 'click', skill: 'electrical', xp: 2,
		run: ( c ) => { c.b.data.charge = c.B.tool.battery; } },
] );

// ======================================================================================================================
// verbs
// ======================================================================================================================

const worn = ( inv, s ) => Object.values( inv.equip ).includes( s );
const battNote = ( s, d ) => d?.tool?.battery ? L.pct( L.fracOf( s, d ) ) : null;
function fmtVitals( g ) {
	const v = g.survival?.vitals?.();
	return v ? `${fmtHour( g.hour )} · HR ${v.hr} · SpO₂ ${v.spo2}% · ${v.temp.toFixed( 1 )} °C` : fmtHour( g.hour );
}

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, use = ctx.use, inv = ctx.inv;
	if ( ! g || ! use ) return;
	const sys = system( g ), sd = L.sensesOf( def ), id = def.id;
	const on = !! stack.data.on;
	// a CR123 device you have cells for
	if ( def.tool?.cell === 'cr123' && L.chargeOf( stack, def ) < def.tool.battery * 0.95 && inv.count( 'battery_cr123' ) > 0 ) ctx.add( 'Replace batteries', () => {
		const cell = inv.find( ( s ) => s.id === 'battery_cr123' );
		if ( ! cell ) return;
		use.timed( 'Replacing batteries', 3, 'click', () => { if ( ! use.exists( cell ) ) return; use.consumeOne( cell ); stack.data.charge = def.tool.battery; use.changed( use.where( stack ) ); } );
	}, null, [ { id: 'senses_insert_cr123', other: 'battery_cr123' } ] );

	// ---- goggles: switched on while worn ----
	if ( sd?.view && def.cat === 'clothing' ) {
		if ( worn( inv, stack ) ) ctx.first( on ? 'Turn off' : 'Turn on', () => sys?.toggleGoggles( stack ), [ battNote( stack, def ) ] );
		if ( sd.view === 'thermal' ) ctx.add( 'Palette', () => { stack.data.palette = ( ( stack.data.palette || 0 ) + 1 ) % L.PALETTES.length; g.toast( L.PALETTES[ stack.data.palette ], 'info' ); }, [ L.PALETTES[ stack.data.palette || 0 ] ] );
	}
	if ( id === 'thermal_monocular' ) ctx.add( 'Palette', () => { stack.data.palette = ( ( stack.data.palette || 0 ) + 1 ) % L.PALETTES.length; g.toast( L.PALETTES[ stack.data.palette ], 'info' ); }, [ L.PALETTES[ stack.data.palette || 0 ] ] );
	// ---- switches ----
	if ( id === 'ir_illuminator' || id === 'gas_detector' || id === 'alarm_receiver' || id === 'weather_radio' || id === 'electronic_earmuffs' || id === 'laser_pointer' ) {
		const isOn = id === 'gas_detector' || id === 'alarm_receiver' ? stack.data.on !== false : on;
		ctx.first( isOn ? 'Turn off' : 'Turn on', () => {
			if ( ! isOn && L.chargeOf( stack, def ) <= 0 ) { g.toast( 'Batteries dead', 'warn' ); return; }
			stack.data.on = ! isOn;
			playSensesSound( g, id === 'laser_pointer' ? 'senses_click' : 'senses_click', { vol: 0.4, bus: 'ui' } );
			if ( id === 'weather_radio' && stack.data.on ) g.toast( sys?.bulletin?.() || 'Static', 'info' );
			use.changed( use.where( stack ) );
		}, [ battNote( stack, def ) ] );
	}
	// ---- in the hands: the laser and the dish ----
	if ( ( id === 'laser_pointer' || id === 'parabolic_mic' ) && g.hands?.select && inv.hands !== stack.uid ) ctx.add( 'Hold', () => { g.app?.ui?.closeScreen?.(); g.hands.select( stack ); } );
	// ---- earplugs ----
	if ( id === 'foam_earplugs' ) {
		const inEars = inv.find( ( s ) => s.id === 'foam_earplugs' && s.data.in );
		if ( stack.data.in ) ctx.first( 'Take out', () => { delete stack.data.in; delete stack.data.on; delete stack.data.name; use.changed( use.where( stack ) ); } );
		else if ( ! inEars ) ctx.first( 'Put in', () => use.timed( 'Putting in earplugs', 2, null, () => {
			if ( ! use.exists( stack ) ) return;
			const one = use.splitOne( stack );
			// (on: a unit with its own state, kept apart from the rest of the pack)
			one.data.in = true; one.data.on = true; one.data.name = 'Earplugs (in)';
			use.changed( use.where( one ) );
		} ) );
	}
	// ---- masks: what filter is in ----
	const mk = L.MASKS[ id ];
	if ( mk?.filter ) {
		const f = stack.data.filter;
		if ( f ) ctx.add( 'Remove filter', () => use.timed( 'Unscrewing filter', 2, 'click', () => {
			if ( ! use.exists( stack ) || ! stack.data.filter ) return;
			const old = stack.data.filter;
			stack.data.filter = null;
			if ( old.life > 0.02 ) { const s = makeStack( old.id, 1 ); s.cond = old.life; if ( inv.add( s ) > 0 ) g.dropStack( s ); }
			use.changed( use.where( stack ) );
		} ), [ L.pct( f.life ) ] );
		else ctx.add( 'Check filter', () => g.toast( 'No filter fitted', 'info' ) );
	}
	// ---- air ----
	if ( id === 'scuba_tank' || id === 'scuba_set' || id === 'scba_pack' ) ctx.add( 'Check air', () => g.toast( `${Math.round( stack.data.air ?? 0 )} bar · ${L.pct( tankFrac( stack ) )}`, 'info' ), [ `${Math.round( stack.data.air ?? 0 )} bar` ] );
	if ( id === 'scuba_set' ) ctx.add( 'Remove regulator', () => use.timed( 'Removing regulator', 4, 'click', () => {
		if ( ! use.exists( stack ) ) return;
		const air = stack.data.air;
		use.transform( stack, 'scuba_tank', { air } );
		use.give( 'scuba_regulator', 1 );
	} ) );
	if ( id === 'rebreather' ) ctx.add( 'Check gauges', () => g.toast( `Oxygen ${L.pct( ( stack.data.o2 ?? 0 ) / L.REBREATHER.o2 )} · scrubber ${L.pct( ( stack.data.scrub ?? 0 ) / L.REBREATHER.scrub )}`, 'info' ) );
	// ---- readouts ----
	if ( id === 'gas_detector' ) ctx.add( 'Check', () => {
		if ( L.chargeOf( stack, def ) <= 0 ) { g.toast( 'Batteries dead', 'warn' ); return; }
		const p = g.player.pos, w = sys?.windDir?.() || L.TRADES, c = L.vogAt( p.x, p.z, w.x, w.z, g.weather?.wind ?? 0.45 );
		g.toast( `SO₂ ${L.ppm( c.vog ).toFixed( 1 )} ppm${c.laze > 0.01 ? ` · HCl ${( c.laze * 9 ).toFixed( 1 )} ppm` : ''}`, 'info' );
	} );
	if ( id === 'smartwatch' ) ctx.first( 'Check', () => {
		if ( L.chargeOf( stack, def ) <= 0 ) { g.toast( 'Battery dead', 'warn' ); return; }
		g.toast( fmtVitals( g ), 'info' );
	}, [ battNote( stack, def ) ] );
	if ( id === 'dive_computer' ) ctx.first( 'Check', () => {
		if ( L.chargeOf( stack, def ) <= 0 ) { g.toast( 'Battery dead', 'warn' ); return; }
		const D = sys?.dive, log = D?.log;
		g.toast( log ? `Last dive ${L.mmss( log.t )} · max ${log.max.toFixed( 1 )} m · N₂ ${L.pct( Math.min( 1, D.n ) )}` : 'No dives logged', 'info' );
	}, [ battNote( stack, def ) ] );
	if ( id === 'weather_radio' ) ctx.add( 'Listen', () => {
		if ( L.chargeOf( stack, def ) <= 0 ) { g.toast( 'Batteries dead', 'warn' ); return; }
		if ( g.mode !== 'creative' ) L.drain( stack, 0.05, 1, def );
		playSensesSound( g, 'senses_alert', { vol: 0.25, bus: 'ui' } );
		g.toast( sys?.bulletin?.() || 'Static', 'info' );
	} );
	if ( id === 'alarm_receiver' ) ctx.add( 'Last alarm', () => { const t = sys?.lastTrip; g.toast( t ? `Sensor ${t.zone} · ${fmtHour( t.at % 24 )}` : 'No alarms', 'info' ); } );
	// ---- a compressor's tanks: the count, from the item ----
	if ( id === 'dive_compressor' ) { const n = tanksToFill( inv ).length; if ( n ) ctx.add( 'Tanks to fill', () => g.toast( `${n} to fill`, 'info' ) ); }
} );

// the system starts with the items module (hooks.js addSystem: this domain has no module of its own)
addSystem( attach );
