// tech items (docs/ITEMS_PLAN.md "tech"): electronics, power, tools, materials and the junk economy. Defs, where they
// lie (building loot spots and the outdoor sites), recipes, combos, and the patches that give existing things a parts
// list ("Dismantle") and the shared material tags. The verbs live in ../../ext/tech/verbs.js, the generator, the
// solar panel and the solar light in ../../ext/tech/power.js, the numbers in ../../ext/tech/logic.js.
//
// Tool kinds defined here (tool.kind; the shared vocabulary): screwdriver, pliers, hacksaw, boltcutter, solder, weld,
// drill, glue (wrench already comes from the pipe wrench and the tire iron; a socket set is one too).
// Material tags: fastener, spring, metal_sheet, pipe, electronics, adhesive, cloth, leather, rubber, plastic, oil,
// battery_aa / battery_d / battery_9v.
// Devices say what cells they take with tool.cell: 'aa' (the default), 'd', '9v', or 'usb' / 'pack' (recharge only).
import { defineItems, getItem } from '../../ItemDB.js';
import { extendLoot, defineLootTable } from '../../Loot.js';
import { addRecipes, R, allRecipes } from '../../recipes.js';
import { addCombos } from '../../combos.js';
import { provides } from '../../util.js';
import * as L from '../../ext/tech/logic.js';
import { feed, fuelIn, takeFuel, genFuel } from '../../ext/tech/power.js';
import { openLockbox } from '../../ext/tech/verbs.js';

// ---- def helpers --------------------------------------------------------------------------------------------------------

const EXTRA = [ 'place', 'noise', 'fun', 'dismantle', 'dismantleTools', 'dismantleTime', 'dismantleSkill', 'medical', 'container' ];
function base( id, name, cat, o ) {
	const d = { id, name, cat, desc: o.desc || '', weight: o.w ?? 0.2, size: o.size ?? 1, stack: o.stack ?? 1, rarity: o.rarity || 'common',
		tags: [ ...( o.pre || [] ), 'tech', ...( o.tags || [] ) ], model: o.model };
	for ( const k of EXTRA ) if ( o[ k ] !== undefined ) d[ k ] = o[ k ];
	return d;
}
const tool = ( id, name, kind, o ) => ( { ...base( id, name, 'tool', { ...o, pre: [ 'tool' ] } ), tool: { kind, ...( o.tool || {} ) } } );
const mat = ( id, name, o ) => base( id, name, 'material', { ...o, pre: [ 'material' ] } );
const misc = ( id, name, o ) => base( id, name, 'misc', { ...o, pre: [ 'misc' ] } );
const SD = [ 'screwdriver' ];

// ---- the items ------------------------------------------------------------------------------------------------------------

defineItems( [
	// ================= hand tools (the shared tool kinds) =================
	tool( 'screwdriver', 'Screwdriver', 'screwdriver', { w: 0.15, tags: [ 'hardware', 'garage', 'house', 'toolbox' ],
		model: { type: 'tech_screwdriver', color: 0xd8302a }, desc: 'Takes things apart.' } ),
	tool( 'precision_screwdrivers', 'Precision screwdrivers', 'screwdriver', { w: 0.2, rarity: 'uncommon', tags: [ 'hardware', 'office', 'pawn' ],
		tool: { quality: 1.5 }, model: { type: 'tech_screwset' }, desc: 'Breaks fewer parts dismantling.' } ),
	tool( 'pliers', 'Pliers', 'pliers', { w: 0.25, tags: [ 'hardware', 'garage', 'toolbox' ], model: { type: 'tech_pliers', color: 0x2a5ad0 },
		desc: 'Grips, bends and cuts wire.' } ),
	tool( 'hacksaw', 'Hacksaw', 'hacksaw', { w: 0.55, size: 3, rarity: 'uncommon', tags: [ 'hardware', 'garage' ], model: { type: 'tech_hacksaw' },
		desc: 'Cuts metal and pipe.' } ),
	tool( 'bolt_cutters', 'Bolt cutters', 'boltcutter', { w: 2.4, size: 5, rarity: 'uncommon', tags: [ 'hardware', 'garage', 'fire' ], model: { type: 'tech_boltcutter' },
		desc: 'Cuts padlocks and chain.' } ),
	tool( 'socket_set', 'Socket set', 'wrench', { w: 1.8, size: 3, rarity: 'uncommon', tags: [ 'hardware', 'garage' ], model: { type: 'tech_socketset' },
		desc: 'Wrench for nuts and bolts.' } ),
	// no gas counter: recipes and combos only wear a tool, so a butane or propane gauge would never move
	tool( 'soldering_iron', 'Soldering iron', 'solder', { w: 0.15, rarity: 'uncommon', tags: [ 'hardware', 'office' ],
		model: { type: 'tech_solderiron' }, desc: 'Repairs and builds electronics.' } ),
	tool( 'blowtorch', 'Blowtorch', 'weld', { w: 0.9, size: 2, rarity: 'uncommon', tags: [ 'hardware', 'garage' ], tool: { provides: [ 'solder', 'lighter' ] },
		model: { type: 'tech_blowtorch' }, desc: 'Welds and solders.' } ),
	tool( 'hand_drill', 'Hand drill', 'drill', { w: 0.9, size: 2, rarity: 'uncommon', tags: [ 'hardware', 'garage' ], model: { type: 'tech_handdrill' },
		desc: 'Drills holes and locks.' } ),
	tool( 'cordless_drill', 'Cordless drill', 'drill', { w: 1.6, size: 3, rarity: 'rare', tags: [ 'hardware', 'garage', 'device' ],
		tool: { battery: 2, rechargeable: true, cell: 'pack', provides: [ 'screwdriver' ] }, model: { type: 'tech_drill', color: 0x1f8a4a },
		dismantle: [ [ 'electric_motor', 1 ], [ 'circuit_board', 1, 0.6 ], [ 'scrap_metal', 1 ] ], dismantleTools: SD,
		desc: 'Drills and drives screws. Rechargeable.' } ),
	tool( 'superglue', 'Super glue', 'glue', { w: 0.02, size: 0.5, tags: [ 'hardware', 'office', 'house', 'adhesive', 'convenience' ], tool: { uses: 3 },
		model: { type: 'tube', len: 0.07, r: 0.008, cap: 0xd02a2a, label: { bg: 0xf2c21a, fg: 0xd02a2a, text: 'SUPER GLUE', sub: 'KAPENA · 3 g', style: 'band', band: 0xd02a2a } },
		desc: 'Quick fixes on tools and weapons.' } ),
	tool( 'epoxy', 'Epoxy', 'glue', { w: 0.06, size: 0.5, rarity: 'uncommon', tags: [ 'hardware', 'garage', 'adhesive' ], tool: { uses: 4 },
		model: { type: 'tech_epoxy' }, desc: 'Strong fixes on tools and weapons.' } ),
	tool( 'wood_glue', 'Wood glue', 'glue', { w: 0.25, tags: [ 'hardware', 'garage', 'school', 'adhesive' ], tool: { uses: 6 },
		model: { type: 'bottle', style: 'syrup', h: 0.17, r: 0.03, glass: 0xf2f0e8, cap: 0xe8641a, label: { bg: 0xf2f0e8, fg: 0x5a3a1a, text: 'WOOD GLUE', sub: 'KAPENA · interior', style: 'band', band: 0xe8641a, glyph: 'leaf', glyphColor: 0x8a5a2a }, labelY: 0.12, labelH: 0.42 },
		desc: 'Fixes wooden things.' } ),

	// ================= fasteners and stock =================
	mat( 'screws', 'Screws', { w: 0.004, size: 0.5, stack: 60, tags: [ 'fastener', 'hardware', 'garage', 'toolbox' ],
		model: { type: 'box', size: [ 0.09, 0.05, 0.065 ], labelAxis: 'y', label: { bg: 0xf2c21a, fg: 0x1a1a1a, text: 'WOOD SCREWS', sub: 'KAPENA · #8 × 1¼ in', band: 0x1a1a1a, style: 'band', size: 0.26 } },
		desc: 'Crafting and repairs.' } ),
	mat( 'bolts', 'Nuts and bolts', { w: 0.02, size: 0.5, stack: 40, tags: [ 'fastener', 'hardware', 'garage', 'toolbox' ],
		model: { type: 'box', size: [ 0.1, 0.055, 0.07 ], labelAxis: 'y', label: { bg: 0x2a4a8a, fg: 0xf2f2f2, text: 'NUTS & BOLTS', sub: 'Assorted · zinc plated', band: 0xf2c21a, style: 'band', size: 0.26 } },
		desc: 'Crafting and repairs.' } ),
	mat( 'springs', 'Springs', { w: 0.03, size: 0.5, stack: 10, rarity: 'uncommon', tags: [ 'spring', 'hardware' ], model: { type: 'tech_springs' },
		desc: 'Traps and mechanisms.' } ),
	mat( 'sheet_metal', 'Sheet metal', { w: 1.6, size: 4, stack: 4, tags: [ 'metal_sheet', 'metal', 'hardware', 'construction' ], model: { type: 'tech_sheet' },
		desc: 'Welding and armour.' } ),
	mat( 'metal_pipe', 'Steel pipe', { w: 1.5, size: 4, stack: 2, tags: [ 'pipe', 'metal', 'hardware', 'construction' ], model: { type: 'pipe', len: 0.9, color: 0x9aa0a6 },
		desc: 'Crafting. Cut to a club.' } ),
	mat( 'zip_ties', 'Zip ties', { w: 0.003, size: 0.5, stack: 20, tags: [ 'fastener', 'plastic', 'hardware', 'police' ], model: { type: 'tech_zipties' },
		desc: 'Crafting. Fixes bag straps.' } ),
	mat( 'rubber_hose', 'Garden hose', { w: 1.2, size: 3, tags: [ 'rubber', 'hardware', 'farm', 'garage' ], model: { type: 'tech_hose', color: 0x2a8a3a },
		desc: 'Cut into a siphon hose.' } ),
	mat( 'empty_can', 'Empty can', { w: 0.05, size: 1, stack: 6, tags: [ 'metal', 'trash' ], model: { type: 'tech_emptycan' },
		desc: 'Flatten into sheet metal.' } ),
	mat( 'fabric', 'Fabric', { w: 0.3, size: 1, stack: 4, tags: [ 'cloth', 'clothing_store' ],
		model: { type: 'folded', size: [ 0.28, 0.035, 0.2 ], color: 0x1a4a7a, print: 'hibiscus', color2: 0xf2eee0, rep: 1.2 }, desc: 'Patches and rags.' } ),
	mat( 'thread', 'Thread', { w: 0.03, size: 0.5, stack: 4, tags: [ 'cloth', 'clothing_store' ], model: { type: 'tech_spool', color: 0xc0282a },
		desc: 'Refills a sewing kit.' } ),
	mat( 'leather', 'Leather', { w: 0.25, size: 1, stack: 4, rarity: 'uncommon', tags: [ 'leather' ],
		model: { type: 'tech_leather' }, desc: 'Patches and grips.' } ),

	// ================= electronics =================
	mat( 'electronic_scrap', 'Electronic scrap', { w: 0.1, size: 0.5, stack: 10, tags: [ 'electronics', 'trash' ], model: { type: 'tech_escrap' },
		desc: 'Repairs electronics.' } ),
	mat( 'circuit_board', 'Circuit board', { w: 0.06, size: 0.5, stack: 5, rarity: 'uncommon', tags: [ 'electronics' ], model: { type: 'tech_pcb' },
		desc: 'Builds electronics.' } ),
	mat( 'speaker', 'Speaker', { w: 0.25, size: 1, stack: 2, rarity: 'uncommon', tags: [ 'electronics' ], model: { type: 'tech_speaker' },
		dismantle: [ [ 'magnet', 1 ], [ 'electronic_scrap', 1 ] ], dismantleTime: 4, desc: 'Builds a siren.' } ),
	mat( 'electric_motor', 'Electric motor', { w: 0.4, size: 1, stack: 2, rarity: 'uncommon', tags: [ 'electronics' ], model: { type: 'tech_motor' },
		dismantle: [ [ 'magnet', 1 ], [ 'wire', 1 ] ], dismantleTools: SD, desc: 'Builds a crank charger.' } ),
	mat( 'magnet', 'Magnet', { w: 0.12, size: 0.5, stack: 4, rarity: 'uncommon', tags: [ 'metal' ], model: { type: 'tech_magnet' },
		desc: 'Tie to a rope to fish for metal.' } ),
	mat( 'antenna', 'Antenna', { w: 0.06, size: 1, stack: 2, rarity: 'uncommon', tags: [ 'electronics', 'car' ], model: { type: 'tech_antenna' },
		desc: 'Boosts a scanner, CB radio or TV.' } ),

	// ================= oils and cleaners =================
	tool( 'penetrating_oil', 'Penetrating oil', 'lubricant', { w: 0.35, tags: [ 'oil', 'hardware', 'garage', 'toolbox' ], tool: { uses: 8 },
		model: { type: 'spray', r: 0.028, h: 0.2, cap: 0xd02a2a, label: { bg: 0x1a4ab0, fg: 0xf2c21a, text: 'PENETRANT 77', sub: 'Loosens rust · stops squeaks', band: 0xf2c21a, style: 'band', subColor: 0x1a1a1a } },
		desc: 'Keeps metal tools in shape.' } ),
	mat( 'motor_oil', 'Motor oil', { w: 1, size: 1, tags: [ 'oil', 'garage', 'gas_station' ],
		model: { type: 'tech_oilbottle', color: 0x1a1a1a, cap: 0xf2c21a, label: { bg: 0xf2c21a, fg: 0x1a1a1a, text: 'PALI', sub: 'MOTOR OIL · 10W-30', band: 0x1a1a1a, style: 'band', size: 0.4 } },
		desc: 'Generator oil. Torch fuel.' } ),
	base( 'bleach', 'Bleach', 'medical', { w: 1.9, size: 3, tags: [ 'cleaning', 'house', 'grocery', 'hospital' ],
		medical: { use: 3, purify: 1, uses: 12 },
		model: { type: 'bottle', style: 'jug', h: 0.3, r: 0.065, glass: 0xf4f4f0, cap: 0x2a6ad6, label: { bg: 0xf4f4f0, fg: 0x2a6ad6, text: 'KAI BLEACH', sub: 'Regular · 64 fl oz', style: 'band', band: 0x2a6ad6, glyph: 'drop', glyphColor: 0x2a6ad6 }, labelY: 0.2, labelH: 0.4 },
		desc: 'Purifies water, 1 L a dose.' } ),

	// ================= cells and power =================
	tool( 'battery_d', 'D batteries', 'cell', { w: 0.14, size: 0.5, stack: 4, tags: [ 'battery_d', 'hardware', 'grocery', 'convenience' ], tool: { cell: 'd' },
		model: { type: 'tech_dcell' }, desc: 'Powers CB radios and metal detectors.' } ),
	tool( 'battery_9v', '9 V battery', 'cell', { w: 0.045, size: 0.5, stack: 4, tags: [ 'battery_9v', 'hardware', 'grocery', 'convenience' ], tool: { cell: '9v' },
		model: { type: 'tech_9v' }, desc: 'Powers smoke detectors. Builds a siren.' } ),
	tool( 'power_bank', 'Power bank', 'powerbank', { w: 0.25, size: 0.5, rarity: 'uncommon', tags: [ 'device', 'office', 'house', 'civilian' ],
		tool: { battery: 4, rechargeable: true, cell: 'usb' }, model: { type: 'tech_powerbank', color: 0x2a2c30 },
		dismantle: [ [ 'circuit_board', 1 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD, desc: 'Charges phones and devices.' } ),
	tool( 'power_inverter', 'Power inverter', 'inverter', { w: 0.9, size: 2, rarity: 'uncommon', tags: [ 'device', 'garage', 'car' ], model: { type: 'tech_inverter' },
		dismantle: [ [ 'circuit_board', 1 ], [ 'wire', 1 ], [ 'scrap_metal', 1 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD,
		desc: 'Charges devices from a car battery.' } ),
	tool( 'jumper_cables', 'Jumper cables', 'jumper', { w: 1.4, size: 3, rarity: 'uncommon', tags: [ 'garage', 'car', 'gas_station' ], model: { type: 'tech_jumper' },
		dismantle: [ [ 'wire', 2 ] ], dismantleTools: [ 'cut' ], desc: 'Jump-starts cars. Charges car batteries.' } ),
	tool( 'crank_charger', 'Crank charger', 'crank', { w: 0.45, size: 1, rarity: 'rare', tags: [ 'device', 'outdoor', 'sports', 'crafted' ], model: { type: 'tech_crank' },
		dismantle: [ [ 'electric_motor', 1 ], [ 'circuit_board', 1, 0.7 ], [ 'scrap_metal', 1 ] ], dismantleTools: SD, desc: 'Crank to charge a device.' } ),
	tool( 'solar_panel', 'Solar panel', 'solar_panel', { w: 6, size: 12, rarity: 'rare', tags: [ 'device', 'outdoor', 'hardware' ], model: { type: 'tech_solarpanel' },
		place: { kind: 'solar', verb: 'Set up' }, dismantle: [ [ 'circuit_board', 1 ], [ 'wire', 2 ], [ 'sheet_metal', 1 ] ], dismantleTools: SD,
		desc: 'Charges devices in sunlight.' } ),
	tool( 'generator', 'Portable generator', 'generator', { w: 22, size: 24, rarity: 'rare', tags: [ 'device', 'hardware', 'construction' ], tool: { tank: L.GEN.tank },
		model: { type: 'tech_generator' }, place: { kind: 'generator', verb: 'Set up' }, noise: { radius: L.GEN.noise },
		dismantle: [ [ 'electric_motor', 1 ], [ 'scrap_metal', 3 ], [ 'bolts', 6 ], [ 'wire', 2 ], [ 'spark_plug', 1, 0.7 ], [ 'sheet_metal', 1 ] ], dismantleTools: [ 'wrench', 'screwdriver' ], dismantleTime: 30,
		desc: 'Powers lights, charges devices. Loud.' } ),
	tool( 'work_light', 'Work light', 'worklight', { w: 2.2, size: 6, rarity: 'uncommon', tags: [ 'hardware', 'construction', 'fire', 'device' ],
		tool: { battery: 6, light: { kind: 'point', range: 22, color: 0xf2f4ff, intensity: 32 } }, place: { kind: 'light' }, model: { type: 'tech_worklight' },
		dismantle: [ [ 'electronic_scrap', 1 ], [ 'metal_pipe', 1, 0.6 ], [ 'wire', 1 ] ], dismantleTools: SD,
		desc: 'Bright area light. Generators feed it.' } ),
	tool( 'solar_light', 'Solar garden light', 'solar_light', { w: 0.3, size: 2, stack: 4, tags: [ 'hardware', 'house', 'device' ],
		tool: { battery: 6, rechargeable: true, cell: 'usb', light: { kind: 'point', range: 5, color: 0xfff0d0, intensity: 2.5 } }, place: { kind: 'solar_light', verb: 'Plant' },
		model: { type: 'tech_solarlight' }, dismantle: [ [ 'electronic_scrap', 1 ] ], desc: 'Charges by day, glows at night.' } ),

	// ================= devices =================
	tool( 'police_scanner', 'Police scanner', 'scanner', { w: 0.35, rarity: 'rare', tags: [ 'device', 'police', 'pawn' ], tool: { battery: 10 },
		model: { type: 'tech_scanner' }, dismantle: [ [ 'circuit_board', 1 ], [ 'electronic_scrap', 1 ], [ 'antenna', 1, 0.6 ], [ 'speaker', 1, 0.4 ] ], dismantleTools: SD,
		desc: 'Scan for broadcasts. Marks the map.' } ),
	tool( 'cb_radio', 'CB radio', 'cb', { w: 1.1, size: 2, rarity: 'uncommon', tags: [ 'device', 'car', 'pawn', 'garage' ], tool: { battery: 14, cell: 'd' },
		model: { type: 'tech_cb' }, dismantle: [ [ 'circuit_board', 1 ], [ 'speaker', 1 ], [ 'electronic_scrap', 2 ], [ 'wire', 1 ] ], dismantleTools: SD,
		desc: 'Listen for survivors. Marks the map.' } ),
	tool( 'metal_detector', 'Metal detector', 'detector', { w: 1.8, size: 8, rarity: 'rare', tags: [ 'device', 'beach', 'pawn', 'sports' ], tool: { battery: 10, cell: 'd' },
		model: { type: 'tech_detector' }, dismantle: [ [ 'circuit_board', 1 ], [ 'wire', 1 ], [ 'metal_pipe', 1 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD,
		desc: 'Sweep for buried stashes and metal.' } ),
	tool( 'fishing_magnet', 'Magnet on a rope', 'magnet_fish', { w: 0.8, size: 2, rarity: 'uncommon', tags: [ 'fishing', 'crafted' ], model: { type: 'tech_magnetrope' },
		dismantle: [ [ 'magnet', 1 ], [ 'rope', 1 ] ], desc: 'Throw it in the water to drag up metal.' } ),
	tool( 'digital_camera', 'Digital camera', 'camera', { w: 0.3, rarity: 'uncommon', tags: [ 'device', 'tourist', 'pawn', 'hotel' ], tool: { battery: 3 },
		model: { type: 'tech_camera' }, dismantle: [ [ 'circuit_board', 1 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD,
		desc: 'The flash dazzles the infected up close.' } ),
	tool( 'cassette_player', 'Cassette player', 'walkman', { w: 0.3, rarity: 'uncommon', tags: [ 'device', 'house', 'pawn' ], tool: { battery: 10 },
		fun: { boredom: - 22, stress: - 8, unhappy: - 6 }, model: { type: 'tech_cassette' },
		dismantle: [ [ 'electric_motor', 1, 0.7 ], [ 'electronic_scrap', 1 ], [ 'magnet', 1, 0.4 ], [ 'springs', 1, 0.3 ] ], dismantleTools: SD,
		desc: 'Music on headphones. Quiet.' } ),
	tool( 'boombox', 'Boombox', 'boombox', { w: 3.2, size: 6, rarity: 'uncommon', tags: [ 'device', 'house', 'pawn', 'beach' ], tool: { battery: 12 },
		fun: { boredom: - 26, unhappy: - 8, stress: - 4 }, place: { kind: 'noise', radius: 70, every: 3 }, noise: { radius: 70 }, model: { type: 'tech_boombox' },
		dismantle: [ [ 'speaker', 2 ], [ 'circuit_board', 1 ], [ 'antenna', 1, 0.7 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD,
		desc: 'Loud music. Draws the infected.' } ),
	tool( 'drone', 'Camera drone', 'drone', { w: 1.1, size: 4, rarity: 'epic', tags: [ 'device', 'pawn', 'military' ], tool: { battery: 1, rechargeable: true, cell: 'pack' },
		model: { type: 'tech_drone' }, dismantle: [ [ 'electric_motor', 4, 0.5 ], [ 'circuit_board', 1 ], [ 'electronic_scrap', 2 ] ], dismantleTools: SD,
		desc: 'Scouts the area. Marks the map.' } ),
	tool( 'sat_phone', 'Satellite phone', 'satphone', { w: 0.4, rarity: 'epic', tags: [ 'device', 'military' ], tool: { battery: 3, rechargeable: true, cell: 'usb' },
		model: { type: 'tech_satphone' }, dismantle: [ [ 'circuit_board', 2 ], [ 'antenna', 1 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD,
		desc: 'Calls in a supply drop.' } ),
	tool( 'siren', 'Siren', 'siren', { w: 0.6, size: 2, rarity: 'rare', tags: [ 'device', 'crafted' ], model: { type: 'tech_siren' },
		place: { kind: 'noise', alarm: true, radius: 90, every: 2, ring: 60 }, noise: { radius: 90, seconds: 60 },
		dismantle: [ [ 'speaker', 1 ], [ 'circuit_board', 1, 0.7 ], [ 'wire', 1 ] ], dismantleTools: SD,
		desc: 'Wails after a delay. Draws a horde.' } ),
	tool( 'smoke_detector', 'Smoke detector', 'smoke_detector', { w: 0.2, tags: [ 'device', 'house', 'office', 'hotel' ], tool: { battery: 4, cell: '9v' },
		model: { type: 'tech_smoke' }, dismantle: [ [ 'electronic_scrap', 1 ], [ 'circuit_board', 1, 0.4 ] ],
		desc: 'Test it to beep. Holds a 9 V battery.' } ),
	tool( 'tv_remote', 'TV remote', 'remote', { w: 0.1, size: 0.5, tags: [ 'device', 'house', 'hotel' ], tool: { battery: 6 },
		model: { type: 'tech_remote' }, dismantle: [ [ 'electronic_scrap', 1 ] ], desc: 'Holds AA batteries.' } ),
	misc( 'desk_fan', 'Desk fan', { w: 1.6, size: 6, tags: [ 'device', 'office', 'house', 'school' ], model: { type: 'tech_fan' },
		dismantle: [ [ 'electric_motor', 1 ], [ 'wire', 1 ], [ 'scrap_metal', 1 ] ], dismantleTools: SD, dismantleSkill: 'electrical', desc: 'Strip it for a motor.' } ),
	misc( 'lockbox', 'Lockbox', { w: 2.4, size: 3, rarity: 'uncommon', tags: [ 'valuable', 'house', 'office', 'bank' ], model: { type: 'tech_lockbox' },
		desc: 'Locked. Cut, drill, pry or pick it open.' } ),
	tool( 'siphon_hose', 'Siphon hose', 'siphon', { w: 0.4, size: 2, rarity: 'uncommon', tags: [ 'garage', 'gas_station', 'crafted' ], model: { type: 'tech_hose', color: 0xd8e6d0, clear: true, bulb: true },
		desc: 'Drains a vehicle\'s tank into a can.' } ),

	// ================= added in review =================
	// reads every charge you carry (a car battery's included, which nothing else shows); a steady hand on electronics
	tool( 'multimeter', 'Multimeter', 'multimeter', { w: 0.35, size: 1, rarity: 'uncommon', tags: [ 'device', 'hardware', 'garage', 'toolbox' ], tool: { battery: 20, cell: '9v' },
		model: { type: 'tech_multimeter' }, dismantle: [ [ 'circuit_board', 1, 0.5 ], [ 'electronic_scrap', 1 ], [ 'wire', 1, 0.6 ] ], dismantleTools: SD,
		desc: 'Reads charge. Safer dismantling.' } ),
	// a solar security light: placed outdoors, it flicks on at night when something moves near, and you hear the click
	tool( 'motion_light', 'Motion light', 'motion_light', { w: 1.1, size: 3, rarity: 'uncommon', tags: [ 'device', 'hardware', 'house', 'farm' ],
		tool: { battery: 8, rechargeable: true, cell: 'usb' }, place: { kind: 'motion_light', verb: 'Set up' }, model: { type: 'tech_motionlight' },
		dismantle: [ [ 'circuit_board', 1, 0.6 ], [ 'electronic_scrap', 1 ], [ 'wire', 1 ] ], dismantleTools: SD,
		desc: 'Lights up when things move. Solar.' } ),
	// a battery TV: something to watch, and now and then the emergency broadcast names a camp
	tool( 'portable_tv', 'Portable TV', 'tv', { w: 2.4, size: 4, rarity: 'uncommon', tags: [ 'device', 'house', 'pawn' ], tool: { battery: 10, cell: 'd' },
		fun: { boredom: - 28, unhappy: - 8, stress: - 4 }, model: { type: 'tech_tv' },
		dismantle: [ [ 'speaker', 1 ], [ 'circuit_board', 1 ], [ 'antenna', 1, 0.7 ], [ 'electronic_scrap', 2 ] ], dismantleTools: SD,
		desc: 'Passes the time. Emergency news.' } ),
	// sonar from a fishing boat: shows the depth and the fish, and the bite comes faster for a while
	tool( 'fish_finder', 'Fish finder', 'sonar', { w: 0.5, size: 1, rarity: 'uncommon', tags: [ 'device', 'fishing', 'surf', 'pawn' ], tool: { battery: 8 },
		model: { type: 'tech_fishfinder' }, dismantle: [ [ 'circuit_board', 1 ], [ 'electronic_scrap', 1 ], [ 'wire', 1, 0.7 ] ], dismantleTools: SD,
		desc: 'Scan the water. Fish bite faster.' } ),
] );

// ---- what the junk economy gets from things that already exist --------------------------------------------------------

function patch( id, o ) {
	const d = getItem( id );
	if ( ! d ) return;
	if ( o.tags ) for ( const t of o.tags ) if ( ! d.tags.includes( t ) ) d.tags.push( t );
	if ( o.provides && d.tool ) d.tool.provides = [ ...new Set( [ ...( d.tool.provides || [] ), ...o.provides ] ) ];
	for ( const k of [ 'dismantle', 'dismantleTools', 'dismantleTime', 'dismantleSkill' ] ) if ( o[ k ] !== undefined && d[ k ] === undefined ) d[ k ] = o[ k ];
}
// shared material tags on the stock items, so other domains' mixes find them by tag
patch( 'batteries', { tags: [ 'battery_aa' ] } );
patch( 'nails', { tags: [ 'fastener' ] } );
patch( 'wire', { tags: [ 'wire' ] } );
patch( 'rope', { tags: [ 'cordage' ] } );
patch( 'duct_tape', { tags: [ 'adhesive' ] } );
patch( 'rags', { tags: [ 'cloth' ] } );
patch( 'scrap_metal', { tags: [ 'metal' ] } );
patch( 'empty_bottle', { tags: [ 'glass' ] } );
patch( 'tarp', { tags: [ 'plastic' ] } );
patch( 'cooking_oil', { tags: [ 'oil' ] } );
patch( 'planks', { tags: [ 'wood' ] } );
patch( 'newspaper', { tags: [ 'paper' ] } );
// a toolbox holds a screwdriver, pliers and wrenches
patch( 'toolbox', { provides: [ 'screwdriver', 'pliers', 'wrench' ] } );
// parts lists ("Dismantle")
patch( 'radio', { dismantle: [ [ 'speaker', 1 ], [ 'circuit_board', 1 ], [ 'antenna', 1, 0.6 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD } );
patch( 'walkie_talkie', { dismantle: [ [ 'circuit_board', 1 ], [ 'antenna', 1, 0.7 ], [ 'electronic_scrap', 1 ], [ 'speaker', 1, 0.4 ] ], dismantleTools: SD } );
patch( 'phone', { dismantle: [ [ 'circuit_board', 1, 0.6 ], [ 'electronic_scrap', 1 ], [ 'magnet', 1, 0.3 ] ], dismantleTools: SD } );
patch( 'laptop', { dismantle: [ [ 'circuit_board', 2 ], [ 'electronic_scrap', 2 ], [ 'power_bank', 1, 0.35 ], [ 'speaker', 1, 0.5 ], [ 'wire', 1 ] ], dismantleTools: SD, dismantleSkill: 'electrical' } );
patch( 'flashlight', { dismantle: [ [ 'electronic_scrap', 1 ], [ 'springs', 1, 0.7 ] ] } );
patch( 'headlamp', { dismantle: [ [ 'electronic_scrap', 1 ] ] } );
patch( 'lantern', { dismantle: [ [ 'electronic_scrap', 1 ], [ 'wire', 1, 0.5 ] ] } );
patch( 'gps', { dismantle: [ [ 'circuit_board', 1 ], [ 'electronic_scrap', 1 ], [ 'antenna', 1, 0.4 ] ], dismantleTools: SD } );
patch( 'rangefinder', { dismantle: [ [ 'circuit_board', 1 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD } );
patch( 'solar_charger', { dismantle: [ [ 'circuit_board', 1 ], [ 'wire', 1 ], [ 'electronic_scrap', 1 ] ], dismantleTools: SD, dismantleSkill: 'electrical' } );
patch( 'car_battery', { dismantle: [ [ 'scrap_metal', 3 ], [ 'wire', 1 ] ], dismantleTools: [ 'wrench' ], dismantleTime: 14 } );
patch( 'spring_trap', { dismantle: [ [ 'springs', 2 ], [ 'scrap_metal', 1 ] ], dismantleTools: [ 'pliers' ] } );
patch( 'watch', { dismantle: [ [ 'springs', 1, 0.6 ] ], dismantleTools: SD } );
patch( 'leather_jacket', { dismantle: [ [ 'leather', 3 ], [ 'fabric', 1, 0.5 ] ], dismantleTools: [ 'cut' ] } );
patch( 'belt', { dismantle: [ [ 'leather', 1 ] ], dismantleTools: [ 'cut' ] } );
patch( 'tent', { dismantle: [ [ 'fabric', 3 ], [ 'rope', 1 ], [ 'scrap_metal', 1, 0.5 ] ], dismantleTools: [ 'cut' ] } );
patch( 'sleeping_bag', { dismantle: [ [ 'fabric', 2 ] ], dismantleTools: [ 'cut' ] } );

// things another def module registers after this one (defs/index.js order): patched once the catalogue is loaded
export const LATE = { alarm_clock: { dismantle: [ [ 'springs', 1 ], [ 'scrap_metal', 1, 0.5 ] ], dismantleTools: SD } };
export function patchLate() { for ( const [ id, o ] of Object.entries( LATE ) ) patch( id, o ); }
Promise.resolve().then( patchLate );

// ---- what the verbs roll ------------------------------------------------------------------------------------------------

const PISTOLS = [ 'glock17', 'm1911', 'revolver_357', 'ruger_mk4' ];
defineLootTable( 'tech_lockbox', { rolls: [ 1, 3 ], items: [
	[ 'cash', 3, [ 20, 300 ] ], [ 'gold_chain', 0.8 ], [ 'diamond_ring', 0.25 ], [ 'watch', 0.6 ], { ids: PISTOLS, w: 0.3 }, { ids: [ 'ammo_9mm', 'ammo_45acp', 'ammo_357', 'ammo_22lr' ], w: 0.9 },
	[ 'stash_note', 0.6 ], [ 'treasure_map', 0.08 ], [ 'car_keys', 0.5 ], [ 'phone', 0.3 ], [ 'lockpick', 0.2 ], [ 'power_bank', 0.2 ],
] } );
// what a metal detector turns up in the sand or the soil
defineLootTable( 'tech_detect', { rolls: [ 1, 1 ], items: [
	[ 'cash', 3, [ 1, 12 ] ], [ 'scrap_metal', 1.6 ], [ 'nails', 0.8, [ 3, 12 ] ], [ 'bolts', 0.8, [ 1, 4 ] ], [ 'empty_can', 1.4 ], [ 'car_keys', 0.5 ], [ 'watch', 0.3 ],
	[ 'gold_chain', 0.15 ], [ 'diamond_ring', 0.04 ], [ 'lighter_zippo', 0.12 ], [ 'spark_plug', 0.15 ], [ 'springs', 0.25 ], [ 'kitchen_knife', 0.1 ],
] } );
// what a magnet drags out of a harbour
defineLootTable( 'tech_magnet', { rolls: [ 1, 1 ], items: [
	[ 'scrap_metal', 3 ], [ 'bolts', 1.4, [ 1, 6 ] ], [ 'nails', 1, [ 4, 15 ] ], [ 'empty_can', 1.5 ], [ 'car_keys', 0.6 ], [ 'sheet_metal', 0.3 ], [ 'metal_pipe', 0.3 ],
	[ 'hammer', 0.15 ], [ 'wrench', 0.15 ], [ 'tire_iron', 0.12 ], [ 'kitchen_knife', 0.2 ], [ 'springs', 0.4 ], [ 'lighter_zippo', 0.08 ], [ 'lockbox', 0.06 ],
	[ 'revolver_357', 0.03 ], [ 'cash', 0.4, [ 1, 8 ] ],
] } );

// ---- where they lie (building loot spots and the outdoor sites; rare things rare) ---------------------------------------

const put = ( table, entries ) => extendLoot( table, entries );
// homes
put( 'house_living', [ [ 'tv_remote', 1.2 ], [ 'smoke_detector', 0.35 ], [ 'desk_fan', 0.3 ], [ 'cassette_player', 0.15 ], [ 'boombox', 0.1 ], [ 'digital_camera', 0.12 ], [ 'power_bank', 0.2 ], [ 'lockbox', 0.05 ] ] );
put( 'house_bedroom', [ [ 'tv_remote', 0.3 ], [ 'cassette_player', 0.2 ], [ 'power_bank', 0.25 ], [ 'digital_camera', 0.1 ], [ 'lockbox', 0.12 ], [ 'smoke_detector', 0.15 ] ] );
put( 'house_kitchen', [ [ 'bleach', 0.5 ], [ 'smoke_detector', 0.3 ], [ 'superglue', 0.3 ], [ 'empty_can', 0.5 ], [ 'zip_ties', 0.2, [ 2, 8 ] ] ] );
put( 'house_bathroom', [ [ 'bleach', 0.6 ] ] );
put( 'house_garage', [ [ 'screwdriver', 0.6 ], [ 'pliers', 0.5 ], [ 'hacksaw', 0.3 ], [ 'socket_set', 0.2 ], [ 'cordless_drill', 0.15 ], [ 'hand_drill', 0.2 ], [ 'wood_glue', 0.3 ],
	[ 'superglue', 0.3 ], [ 'penetrating_oil', 0.5 ], [ 'motor_oil', 0.5 ], [ 'jumper_cables', 0.4 ], [ 'siphon_hose', 0.15 ], [ 'rubber_hose', 0.4 ], [ 'generator', 0.06 ],
	[ 'bolt_cutters', 0.12 ], [ 'battery_d', 0.3, [ 1, 4 ] ], [ 'work_light', 0.2 ], [ 'empty_can', 0.4 ], [ 'metal_detector', 0.05 ], [ 'desk_fan', 0.2 ], [ 'boombox', 0.12 ],
	[ 'solar_light', 0.2, [ 1, 3 ] ], [ 'screws', 0.4, [ 10, 40 ] ], [ 'bolts', 0.4, [ 4, 16 ] ] ] );
put( 'wardrobe', [ [ 'fabric', 0.2 ], [ 'thread', 0.3 ], [ 'lockbox', 0.06 ] ] );
// shops
put( 'hardware', [ [ 'generator', 0.15 ], [ 'solar_panel', 0.08 ], [ 'work_light', 0.4 ], [ 'battery_d', 0.8, [ 1, 4 ] ], [ 'battery_9v', 0.6, [ 1, 2 ] ], [ 'solar_light', 0.5, [ 1, 4 ] ],
	[ 'jumper_cables', 0.3 ], [ 'metal_detector', 0.08 ], [ 'precision_screwdrivers', 0.3 ], [ 'soldering_iron', 0.3 ], [ 'bleach', 0.4 ] ] );
put( 'toolbox', [ [ 'screwdriver', 1.5 ], [ 'pliers', 1.2 ], [ 'hacksaw', 0.5 ], [ 'socket_set', 0.4 ], [ 'screws', 0.8, [ 10, 30 ] ], [ 'bolts', 0.8, [ 4, 12 ] ], [ 'superglue', 0.4 ],
	[ 'penetrating_oil', 0.4 ], [ 'soldering_iron', 0.15 ], [ 'zip_ties', 0.5, [ 4, 12 ] ], [ 'precision_screwdrivers', 0.15 ], [ 'epoxy', 0.2 ] ] );
put( 'garage_shop', [ [ 'socket_set', 0.8 ], [ 'jumper_cables', 1 ], [ 'siphon_hose', 0.4 ], [ 'motor_oil', 1.2 ], [ 'penetrating_oil', 0.8 ], [ 'bolts', 0.8, [ 4, 16 ] ], [ 'sheet_metal', 0.4 ],
	[ 'blowtorch', 0.3 ], [ 'cordless_drill', 0.3 ], [ 'hacksaw', 0.4 ], [ 'rubber_hose', 0.3 ], [ 'power_inverter', 0.3 ], [ 'antenna', 0.3 ], [ 'screwdriver', 0.6 ], [ 'epoxy', 0.3 ],
	[ 'electric_motor', 0.2 ] ] );
put( 'gas_station', [ [ 'motor_oil', 0.8 ], [ 'jumper_cables', 0.4 ], [ 'siphon_hose', 0.15 ], [ 'battery_d', 0.4, [ 1, 4 ] ], [ 'battery_9v', 0.3 ], [ 'power_bank', 0.3 ], [ 'superglue', 0.2 ], [ 'power_inverter', 0.15 ] ] );
put( 'convenience', [ [ 'battery_d', 0.4, [ 1, 4 ] ], [ 'battery_9v', 0.3 ], [ 'superglue', 0.3 ], [ 'power_bank', 0.2 ] ] );
put( 'grocery', [ [ 'battery_d', 0.4, [ 1, 4 ] ], [ 'battery_9v', 0.2 ], [ 'bleach', 0.6 ], [ 'superglue', 0.2 ], [ 'zip_ties', 0.15 ] ] );
put( 'pawn', [ [ 'digital_camera', 0.8 ], [ 'cassette_player', 0.6 ], [ 'boombox', 0.5 ], [ 'metal_detector', 0.4 ], [ 'cb_radio', 0.4 ], [ 'police_scanner', 0.3 ], [ 'drone', 0.12 ],
	[ 'lockbox', 0.3 ], [ 'power_bank', 0.5 ], [ 'cordless_drill', 0.3 ], [ 'bolt_cutters', 0.2 ], [ 'sat_phone', 0.03 ], [ 'precision_screwdrivers', 0.2 ],
	[ 'speaker', 0.2 ] ] );
put( 'clothing_store', [ [ 'fabric', 0.6 ], [ 'thread', 0.6, [ 1, 3 ] ], [ 'leather', 0.2 ] ] );
put( 'sports', [ [ 'metal_detector', 0.2 ], [ 'power_bank', 0.3 ], [ 'digital_camera', 0.2 ], [ 'crank_charger', 0.3 ], [ 'solar_panel', 0.15 ], [ 'drone', 0.08 ] ] );
put( 'surf', [ [ 'cassette_player', 0.3 ], [ 'digital_camera', 0.3 ], [ 'power_bank', 0.3 ] ] );
put( 'market', [ [ 'fabric', 0.3 ], [ 'empty_can', 0.4 ] ] );
// work and public buildings
put( 'office', [ [ 'desk_fan', 0.6 ], [ 'power_bank', 0.4 ], [ 'precision_screwdrivers', 0.1 ], [ 'tv_remote', 0.2 ], [ 'smoke_detector', 0.3 ], [ 'lockbox', 0.1 ], [ 'digital_camera', 0.1 ],
	[ 'zip_ties', 0.3, [ 2, 8 ] ], [ 'superglue', 0.3 ] ] );
put( 'desk', [ [ 'power_bank', 0.3 ], [ 'superglue', 0.3 ], [ 'battery_9v', 0.2 ], [ 'precision_screwdrivers', 0.08 ], [ 'zip_ties', 0.2 ], [ 'lockbox', 0.06 ] ] );
put( 'school', [ [ 'smoke_detector', 0.3 ], [ 'desk_fan', 0.3 ], [ 'digital_camera', 0.1 ], [ 'superglue', 0.3 ], [ 'wood_glue', 0.3 ], [ 'cassette_player', 0.1 ], [ 'power_bank', 0.15 ] ] );
put( 'hotel_room', [ [ 'tv_remote', 1 ], [ 'smoke_detector', 0.3 ], [ 'digital_camera', 0.3 ], [ 'power_bank', 0.4 ], [ 'lockbox', 0.12 ], [ 'cassette_player', 0.1 ] ] );
put( 'police', [ [ 'police_scanner', 1 ], [ 'bolt_cutters', 0.5 ], [ 'digital_camera', 0.3 ], [ 'power_bank', 0.3 ], [ 'battery_9v', 0.3 ], [ 'battery_d', 0.4, [ 1, 4 ] ], [ 'zip_ties', 0.6, [ 4, 12 ] ] ] );
put( 'police_locker', [ [ 'police_scanner', 0.3 ], [ 'battery_d', 0.4, [ 1, 2 ] ], [ 'zip_ties', 0.4, [ 2, 8 ] ] ] );
put( 'fire_station', [ [ 'bolt_cutters', 0.8 ], [ 'police_scanner', 0.6 ], [ 'work_light', 0.6 ], [ 'generator', 0.3 ], [ 'battery_d', 0.6, [ 1, 4 ] ], [ 'jumper_cables', 0.3 ],
	[ 'siphon_hose', 0.2 ], [ 'smoke_detector', 0.8 ], [ 'socket_set', 0.2 ] ] );
put( 'military', [ [ 'battery_d', 0.6, [ 1, 4 ] ], [ 'battery_9v', 0.4 ], [ 'power_bank', 0.4 ], [ 'crank_charger', 0.3 ], [ 'sat_phone', 0.04 ], [ 'drone', 0.06 ], [ 'generator', 0.15 ],
	[ 'work_light', 0.3 ], [ 'zip_ties', 0.5, [ 4, 12 ] ] ] );
put( 'military_locker', [ [ 'battery_9v', 0.3 ], [ 'power_bank', 0.3 ], [ 'zip_ties', 0.3 ] ] );
put( 'hangar', [ [ 'socket_set', 0.8 ], [ 'blowtorch', 0.6 ], [ 'cordless_drill', 0.4 ], [ 'sheet_metal', 0.8 ], [ 'bolts', 0.8, [ 4, 16 ] ], [ 'generator', 0.3 ], [ 'work_light', 0.6 ],
	[ 'jumper_cables', 0.5 ], [ 'motor_oil', 0.6 ], [ 'penetrating_oil', 0.6 ], [ 'antenna', 0.3 ], [ 'cb_radio', 0.4 ], [ 'drone', 0.08 ], [ 'metal_pipe', 0.4 ] ] );
put( 'warehouse', [ [ 'electric_motor', 0.1 ], [ 'generator', 0.2 ], [ 'work_light', 0.4 ], [ 'sheet_metal', 0.6 ], [ 'metal_pipe', 0.6 ], [ 'bolts', 0.6, [ 4, 16 ] ], [ 'zip_ties', 0.6, [ 4, 16 ] ],
	[ 'bolt_cutters', 0.3 ], [ 'battery_d', 0.4, [ 1, 4 ] ], [ 'rubber_hose', 0.3 ] ] );
put( 'farm', [ [ 'leather', 0.2 ], [ 'rubber_hose', 0.8 ], [ 'siphon_hose', 0.3 ], [ 'generator', 0.3 ], [ 'motor_oil', 0.5 ], [ 'bolt_cutters', 0.3 ], [ 'hacksaw', 0.3 ], [ 'solar_light', 0.3, [ 1, 3 ] ],
	[ 'metal_pipe', 0.4 ], [ 'springs', 0.2 ], [ 'cb_radio', 0.3 ], [ 'sheet_metal', 0.4 ] ] );
put( 'observatory', [ [ 'generator', 0.15 ], [ 'power_bank', 0.6 ], [ 'precision_screwdrivers', 0.4 ], [ 'soldering_iron', 0.5 ], [ 'circuit_board', 0.6 ], [ 'electronic_scrap', 0.8, [ 1, 4 ] ],
	[ 'battery_d', 0.5, [ 1, 4 ] ], [ 'cordless_drill', 0.3 ], [ 'solar_panel', 0.3 ], [ 'work_light', 0.4 ], [ 'antenna', 0.4 ], [ 'drone', 0.08 ] ] );
put( 'post', [ [ 'zip_ties', 0.4, [ 2, 8 ] ], [ 'power_bank', 0.2 ], [ 'battery_9v', 0.2 ] ] );
put( 'bank', [ [ 'lockbox', 0.8 ], [ 'smoke_detector', 0.2 ] ] );
put( 'church', [ [ 'fabric', 0.3 ], [ 'smoke_detector', 0.3 ] ] );
put( 'restaurant_kitchen', [ [ 'bleach', 0.6 ], [ 'empty_can', 0.6, [ 1, 3 ] ] ] );
put( 'hospital', [ [ 'bleach', 0.5 ], [ 'generator', 0.12 ] ] );
// outdoors and junk
put( 'beach', [ [ 'metal_detector', 0.06 ], [ 'boombox', 0.15 ], [ 'cassette_player', 0.15 ], [ 'empty_can', 0.6 ] ] );
put( 'street', [ [ 'empty_can', 1 ], [ 'electronic_scrap', 0.3 ], [ 'tv_remote', 0.15 ], [ 'zip_ties', 0.2 ] ] );
put( 'trash', [ [ 'empty_can', 2, [ 1, 3 ] ], [ 'electronic_scrap', 0.5 ], [ 'speaker', 0.1 ], [ 'tv_remote', 0.2 ], [ 'smoke_detector', 0.1 ], [ 'desk_fan', 0.1 ], [ 'circuit_board', 0.1 ], [ 'rubber_hose', 0.1 ], [ 'fabric', 0.3 ] ] );
put( 'car_trunk', [ [ 'jumper_cables', 0.8 ], [ 'siphon_hose', 0.2 ], [ 'motor_oil', 0.4 ], [ 'power_inverter', 0.15 ], [ 'cb_radio', 0.15 ] ] );
put( 'car_glovebox', [ [ 'power_bank', 0.3 ], [ 'tv_remote', 0.05 ], [ 'superglue', 0.1 ] ] );
put( 'zombie_civilian', [ [ 'power_bank', 0.12 ] ] );
put( 'zombie_police', [ [ 'zip_ties', 0.3, [ 2, 6 ] ], [ 'police_scanner', 0.05 ] ] );
// the outdoor sites (always visible on the ground)
put( 'site_crash_car', [ [ 'jumper_cables', 0.5 ], [ 'siphon_hose', 0.2 ], [ 'motor_oil', 0.3 ], [ 'antenna', 0.3 ], [ 'cb_radio', 0.2 ], [ 'power_bank', 0.3 ], [ 'cassette_player', 0.2 ], [ 'power_inverter', 0.12 ] ] );
put( 'site_roadside', [ [ 'power_bank', 0.4 ], [ 'cassette_player', 0.25 ], [ 'digital_camera', 0.2 ], [ 'battery_d', 0.2 ], [ 'lockbox', 0.05 ] ] );
put( 'site_bus_stop', [ [ 'power_bank', 0.4 ], [ 'cassette_player', 0.3 ], [ 'empty_can', 0.5 ] ] );
put( 'site_beach_camp', [ [ 'boombox', 0.35 ], [ 'cassette_player', 0.4 ], [ 'digital_camera', 0.3 ], [ 'metal_detector', 0.1 ], [ 'power_bank', 0.3 ], [ 'empty_can', 0.5 ] ] );
put( 'site_campsite', [ [ 'crank_charger', 0.3 ], [ 'solar_panel', 0.06 ], [ 'battery_d', 0.5, [ 1, 4 ] ], [ 'cb_radio', 0.15 ], [ 'solar_light', 0.3, [ 1, 2 ] ], [ 'work_light', 0.1 ], [ 'power_bank', 0.3 ],
	[ 'cassette_player', 0.2 ], [ 'empty_can', 0.6, [ 1, 3 ] ] ] );
put( 'site_hiker', [ [ 'power_bank', 0.5 ], [ 'crank_charger', 0.25 ], [ 'digital_camera', 0.3 ], [ 'sat_phone', 0.02 ] ] );
put( 'site_fishing_spot', [ [ 'fishing_magnet', 0.25 ], [ 'magnet', 0.2 ], [ 'boombox', 0.15 ], [ 'cassette_player', 0.2 ], [ 'empty_can', 0.6 ] ] );
put( 'site_checkpoint', [ [ 'police_scanner', 0.6 ], [ 'bolt_cutters', 0.3 ], [ 'work_light', 0.4 ], [ 'generator', 0.12 ], [ 'battery_d', 0.6, [ 1, 4 ] ], [ 'zip_ties', 0.6, [ 2, 8 ] ] ] );
put( 'site_military_checkpoint', [ [ 'generator', 0.25 ], [ 'work_light', 0.4 ], [ 'battery_d', 0.5, [ 1, 4 ] ], [ 'battery_9v', 0.4 ], [ 'sat_phone', 0.04 ], [ 'drone', 0.06 ], [ 'crank_charger', 0.2 ],
	[ 'zip_ties', 0.5, [ 2, 8 ] ] ] );
put( 'site_heli_crash', [ [ 'drone', 0.15 ], [ 'sat_phone', 0.1 ], [ 'power_bank', 0.4 ], [ 'battery_9v', 0.4 ], [ 'circuit_board', 0.6 ], [ 'electronic_scrap', 0.8, [ 1, 3 ] ], [ 'antenna', 0.5 ],
	[ 'sheet_metal', 0.6 ] ] );
put( 'site_fema_camp', [ [ 'generator', 0.2 ], [ 'work_light', 0.4 ], [ 'crank_charger', 0.4 ], [ 'battery_d', 0.8, [ 1, 4 ] ], [ 'power_bank', 0.4 ], [ 'bleach', 0.6 ], [ 'solar_panel', 0.08 ] ] );
put( 'site_farm_stand', [ [ 'rubber_hose', 0.2 ], [ 'solar_light', 0.2 ] ] );
put( 'site_picnic', [ [ 'boombox', 0.2 ], [ 'cassette_player', 0.2 ], [ 'digital_camera', 0.2 ], [ 'empty_can', 0.8, [ 1, 3 ] ] ] );
put( 'site_body', [ [ 'screwdriver', 0.3 ], [ 'power_bank', 0.3 ], [ 'lockbox', 0.08 ], [ 'siphon_hose', 0.1 ] ] );
put( 'site_supply_drop', [ [ 'crank_charger', 0.6 ], [ 'battery_d', 0.8, [ 2, 4 ] ], [ 'power_bank', 0.6 ], [ 'sat_phone', 0.05 ], [ 'solar_panel', 0.1 ] ] );
put( 'site_stash', [ [ 'lockbox', 0.6 ], [ 'power_bank', 0.4 ], [ 'battery_d', 0.4, [ 1, 4 ] ], [ 'bolt_cutters', 0.1 ] ] );
put( 'site_stash_rich', [ [ 'lockbox', 0.6 ], [ 'sat_phone', 0.05 ], [ 'drone', 0.05 ], [ 'metal_detector', 0.1 ] ] );

// the review's additions
put( 'hardware', [ [ 'multimeter', 0.35 ], [ 'motion_light', 0.35 ] ] );
put( 'toolbox', [ [ 'multimeter', 0.4 ] ] );
put( 'garage_shop', [ [ 'multimeter', 0.3 ] ] );
put( 'house_garage', [ [ 'multimeter', 0.12 ], [ 'motion_light', 0.1 ] ] );
put( 'observatory', [ [ 'multimeter', 0.4 ] ] );
put( 'farm', [ [ 'motion_light', 0.2 ] ] );
put( 'warehouse', [ [ 'motion_light', 0.1 ] ] );
put( 'house_living', [ [ 'portable_tv', 0.12 ] ] );
put( 'house_bedroom', [ [ 'portable_tv', 0.06 ] ] );
put( 'hotel_room', [ [ 'portable_tv', 0.05 ] ] );
put( 'pawn', [ [ 'portable_tv', 0.35 ], [ 'fish_finder', 0.2 ], [ 'multimeter', 0.15 ] ] );
put( 'surf', [ [ 'fish_finder', 0.2 ] ] );
put( 'sports', [ [ 'fish_finder', 0.2 ] ] );
put( 'beach', [ [ 'fish_finder', 0.08 ] ] );
put( 'site_fishing_spot', [ [ 'fish_finder', 0.25 ] ] );
put( 'site_fema_camp', [ [ 'portable_tv', 0.1 ] ] );
put( 'site_beach_camp', [ [ 'portable_tv', 0.05 ] ] );
put( 'site_campsite', [ [ 'portable_tv', 0.04 ] ] );

// ---- recipes (the crafting panel) -----------------------------------------------------------------------------------------

addRecipes( [
	// metalwork
	R( 'tech_sheet_cans', 'Sheet metal (cans)', [ 'sheet_metal', 1 ], [ [ 'empty_can', 4 ] ], { tools: [ 'hammer' ], time: 10, cat: 'tools', skill: 'mechanics', xp: 6 } ),
	R( 'tech_sheet_scrap', 'Sheet metal (scrap)', [ 'sheet_metal', 1 ], [ [ 'scrap_metal', 2 ] ], { tools: [ 'hacksaw', 'hammer' ], time: 12, cat: 'tools', skill: 'mechanics', xp: 6 } ),
	R( 'tech_pipe_club', 'Lead pipe', [ 'lead_pipe', 1 ], [ [ 'metal_pipe', 1 ] ], { tools: [ 'hacksaw' ], time: 8, cat: 'weapons', skill: 'mechanics', xp: 4 } ),
	R( 'tech_spring_trap', 'Spring trap', [ 'spring_trap', 1 ], [ [ 'springs', 2 ], [ 'sheet_metal', 1 ], [ 'bolts', 2 ] ], { tools: [ 'wrench', 'pliers' ], time: 25, cat: 'tools', skill: 'mechanics', xp: 15 } ),
	R( 'tech_repair_kit', 'Vehicle repair kit (welded)', [ 'repair_kit', 1 ], [ [ 'sheet_metal', 2 ], [ 'bolts', 4 ] ], { tools: [ 'weld', 'wrench' ], time: 30, cat: 'tools', skill: 'mechanics', xp: 20 } ),
	R( 'tech_screw_bat', 'Spiked bat (screws)', [ 'nailed_bat', 1 ], [ [ 'baseball_bat', 1 ], [ 'screws', 12 ] ], { tools: [ 'drill' ], time: 14, cat: 'weapons', skill: 'carpentry', xp: 8 } ),
	R( 'tech_work_light', 'Work light', [ 'work_light', 1 ], [ [ 'lantern', 1 ], [ 'metal_pipe', 1 ], [ 'bolts', 2 ] ], { tools: [ 'wrench' ], time: 20, cat: 'tools', skill: 'mechanics', xp: 8 } ),
	// electronics
	R( 'tech_siren', 'Siren', [ 'siren', 1 ], [ [ 'speaker', 1 ], [ 'circuit_board', 1 ], [ 'battery_9v', 1 ], [ 'wire', 1 ] ], { tools: [ 'solder' ], time: 20, cat: 'tools', skill: 'electrical', xp: 18 } ),
	R( 'tech_crank', 'Crank charger', [ 'crank_charger', 1 ], [ [ 'electric_motor', 1 ], [ 'circuit_board', 1 ], [ 'scrap_metal', 1 ], [ 'wire', 1 ], [ 'screws', 2 ] ], { tools: [ 'solder', 'screwdriver' ], time: 25, cat: 'tools', skill: 'electrical', xp: 22 } ),
	R( 'tech_scanner', 'Police scanner (rigged)', [ 'police_scanner', 1 ], [ [ 'walkie_talkie', 1 ], [ 'circuit_board', 1 ], [ 'wire', 1 ] ], { tools: [ 'solder', 'screwdriver' ], time: 30, cat: 'tools', skill: 'electrical', xp: 28 } ),
	R( 'tech_power_pack', 'Power bank (AA cells)', [ 'power_bank', 1 ], [ [ 'batteries', 4 ], [ 'circuit_board', 1 ], [ 'zip_ties', 2 ] ], { tools: [ 'solder' ], time: 15, cat: 'tools', skill: 'electrical', xp: 12 } ),
	R( 'tech_motion_light', 'Motion light', [ 'motion_light', 1 ], [ [ 'solar_light', 2 ], [ 'circuit_board', 1 ], [ 'wire', 1 ] ], { tools: [ 'solder' ], time: 20, cat: 'tools', skill: 'electrical', xp: 15 } ),
	R( 'tech_solar_panel', 'Solar panel', [ 'solar_panel', 1 ], [ [ 'solar_charger', 2 ], [ 'sheet_metal', 1 ], [ 'wire', 1 ], [ 'screws', 6 ] ], { tools: [ 'screwdriver', 'solder' ], time: 40, cat: 'tools', skill: 'electrical', xp: 35 } ),
	// odds and ends
	R( 'tech_siphon', 'Siphon hose', [ 'siphon_hose', 1 ], [ [ 'rubber_hose', 1 ] ], { tools: [ 'cut' ], time: 5, cat: 'tools', skill: 'mechanics', xp: 3 } ),
	R( 'tech_magnet_rope', 'Magnet on a rope', [ 'fishing_magnet', 1 ], [ [ 'magnet', 1 ], [ 'rope', 1 ] ], { time: 6, cat: 'tools', skill: 'fishing', xp: 3 } ),
	R( 'tech_torch_motor_oil', 'Torches (motor oil)', [ 'torch', 3 ], [ [ 'stick', 3 ], [ 'rags', 3 ], [ 'motor_oil', 1 ] ], { time: 10, cat: 'survival' } ),
	R( 'tech_rags_fabric', 'Rags (fabric)', [ 'rags', 4 ], [ [ 'fabric', 1 ] ], { tools: [ 'cut' ], time: 4, cat: 'medical', skill: 'tailoring', xp: 2 } ),
	R( 'tech_thread', 'Thread (unpicked)', [ 'thread', 1 ], [ [ 'fabric', 1 ] ], { tools: [ 'cut' ], time: 12, cat: 'tools', skill: 'tailoring', xp: 3 } ),
] );

// ---- combos (drag one onto the other) -------------------------------------------------------------------------------------

const lowFor = ( cell ) => ( s, d ) => L.cellOf( d ) === cell && L.fracOf( s, d ) < 0.95;
const usesMax = ( d ) => d?.tool?.uses ?? d?.medical?.uses ?? 1;
// already full: not offered (a soft refusal, as a repair at its cap)
const full = ( s ) => ( s.data?.uses ?? usesMax( getItem( s.id ) ) ) >= usesMax( getItem( s.id ) ) ? { reason: 'Full', soft: true } : null;
const WOODEN = new Set( [ 'baseball_bat', 'nailed_bat', 'canoe_paddle', 'fishing_spear', 'fishing_rod_improvised', 'torch' ] );
const metalTool = ( s, d ) => ( d.cat === 'melee' && ! WOODEN.has( d.id ) ) || [ 'screwdriver', 'pliers', 'hacksaw', 'boltcutter', 'drill', 'canopener', 'cut', 'toolbox' ].includes( d.tool?.kind );
// powered things a soldering iron and some scrap put right
const electronic = ( s, d ) => ( !! d.tool?.battery && ! [ 'chemlight', 'torch' ].includes( d.tool.kind ) ) || ( !! d.tags?.includes( 'device' ) && d.cat !== 'material' );
// a solid tool worth gluing: not a consumable (tape, glue, matches, cells), not a container
const SOFT_KINDS = new Set( [ 'battery', 'cell', 'chemlight', 'torch', 'candle', 'tiki', 'trap', 'tent', 'sleepingbag', 'collector', 'stash' ] );
const gluable = ( s, d ) => d.cat === 'melee' || ( d.cat === 'tool' && d.stack === 1 && ! d.tool.liquid && ! d.tool.uses && ! SOFT_KINDS.has( d.tool.kind ) );
const ON_LOCK = ( m ) => ( c ) => { openLockbox( c.game, c.b, m, c.a ); };

// The shared tool kinds in plain words. Combine's and Crafting's own "Need …" lists don't know them yet, so a combo
// here asks for its tool with `check` (and wears it as `tools` would), and the crafting panel's tool chips get these
// names below.
export const TOOL_SAY = { screwdriver: 'a screwdriver', pliers: 'pliers', wrench: 'a wrench', hacksaw: 'a hacksaw', boltcutter: 'bolt cutters', solder: 'a soldering iron',
	weld: 'a blowtorch', drill: 'a drill', glue: 'glue', inverter: 'a power inverter' };
const toolIn = ( c, kind ) => c.inv.find( ( s ) => s !== c.a && s !== c.b && provides( s, kind ) );
const needs = ( c, kind ) => toolIn( c, kind ) ? null : `Need ${TOOL_SAY[ kind ] || kind}`;
const wearTool = ( c, kind ) => { const t = toolIn( c, kind ); if ( t ) t.cond = Math.max( 0.05, t.cond - 0.01 ); };

// The crafting panel names a recipe's tools from `toolLabels`, which Crafting fills from its own list ('cut' ->
// 'blade') and otherwise shows the bare kind ("Solder"). Recipes (any domain's) that ask for these kinds keep plain
// names: a getter Crafting's assignment can't overwrite. Run once every def module has added its recipes.
const CHIP = { cut: 'blade', chop: 'axe', saw: 'saw', hammer: 'hammer', pot: 'cooking pot', toolbox: 'toolbox', canopener: 'can opener',
	...Object.fromEntries( Object.entries( TOOL_SAY ).map( ( [ k, v ] ) => [ k, v.replace( /^an? /, '' ) ] ) ) };
export function chipNames() {
	for ( const r of allRecipes() ) {
		if ( ! r.tools?.some( ( t ) => TOOL_SAY[ t ] ) || Object.getOwnPropertyDescriptor( r, 'toolLabels' )?.get ) continue;
		const labels = r.tools.map( ( t ) => CHIP[ t ] || t );
		Object.defineProperty( r, 'toolLabels', { get: () => labels, set() {}, configurable: true, enumerable: true } );
	}
}
Promise.resolve().then( chipNames );

addCombos( [
	// ---- cells and charge ----
	{ id: 'tech_insert_d', verb: 'Insert', label: 'Insert into {b}', a: 'battery_d', b: { fn: lowFor( 'd' ) }, use: { a: 1, b: 0 }, time: 3, sound: 'click', skill: 'electrical', xp: 2,
		run: ( c ) => { c.b.data.charge = c.B.tool.battery; } },
	{ id: 'tech_insert_9v', verb: 'Insert', label: 'Insert into {b}', a: 'battery_9v', b: { fn: lowFor( '9v' ) }, use: { a: 1, b: 0 }, time: 3, sound: 'click', skill: 'electrical', xp: 2,
		run: ( c ) => { c.b.data.charge = c.B.tool.battery; } },
	{ id: 'tech_bank_charge', verb: 'Charge', a: 'power_bank', b: { fn: ( s, d ) => L.rechargeable( d ) && d.tool.kind !== 'powerbank' && L.fracOf( s, d ) < 0.97 }, use: { a: 0, b: 0 },
		time: 5, sound: 'click', skill: 'electrical', xp: 1,
		check: ( c ) => L.chargeOf( c.a ) < 0.05 ? 'Power bank empty' : null,
		run: ( c ) => {
			const used = feed( c.b, L.chargeOf( c.a ) );
			c.a.data.charge = Math.max( 0, L.chargeOf( c.a ) - used );
			c.toast( `${c.B.name} ${Math.round( L.fracOf( c.b ) * 100 )}%`, 'good' );
		} },
	{ id: 'tech_crank_charge', verb: 'Crank', label: 'Crank-charge {b}', a: 'crank_charger', b: { fn: ( s, d ) => L.rechargeable( d ) && L.fracOf( s, d ) < 0.97 }, use: { a: 0, b: 0 },
		time: 10, sound: 'reel', skill: 'electrical', xp: 1, wear: { a: 0.003 },
		run: ( c ) => { c.survival?.useStamina?.( 15 ); feed( c.b, 0.22 ); c.toast( `${c.B.name} ${Math.round( L.fracOf( c.b ) * 100 )}%`, 'good' ); } },
	{ id: 'tech_inverter_charge', verb: 'Charge', label: 'Charge from {a}', a: 'car_battery', b: { fn: ( s, d ) => L.rechargeable( d ) && L.fracOf( s, d ) < 0.97 }, use: { a: 0, b: 0 },
		time: 6, sound: 'click', skill: 'electrical', xp: 1,
		check: ( c ) => needs( c, 'inverter' ) || ( L.carEnergy( c.a ) < 0.02 ? 'Car battery flat' : null ),
		run: ( c ) => { wearTool( c, 'inverter' ); const used = feed( c.b, L.carEnergy( c.a ) * L.CAR_UNITS ); c.a.data.energy = Math.max( 0, L.carEnergy( c.a ) - used / L.CAR_UNITS ); c.toast( `${c.B.name} ${Math.round( L.fracOf( c.b ) * 100 )}%`, 'good' ); } },
	{ id: 'tech_antenna', verb: 'Fit', label: 'Fit antenna to {b}', a: 'antenna', b: { ids: [ 'police_scanner', 'cb_radio', 'portable_tv' ], fn: ( s ) => ! s.data?.antenna }, use: { a: 1, b: 0 },
		tools: [ 'screwdriver' ], time: 4, sound: 'click', skill: 'electrical', xp: 3, run: ( c ) => { c.b.data.antenna = true; c.toast( 'Antenna fitted', 'good' ); } },

	// ---- fuel and refills ----
	{ id: 'tech_fill_generator', verb: 'Fill', label: 'Fill generator', a: { fn: ( s ) => fuelIn( s ) > 0.05 }, b: { id: 'generator', fn: ( s ) => genFuel( s ) < L.GEN.tank - 0.1 }, use: { a: 0, b: 0 },
		time: 4, sound: 'pour', run: ( c ) => { c.b.data.fuel = genFuel( c.b ) + takeFuel( c.a, L.GEN.tank - genFuel( c.b ) ); } },
	{ id: 'tech_refill_sewing', verb: 'Refill', a: 'thread', b: 'sewing_kit', use: { a: 1, b: 0 }, time: 4, sound: 'zipper', skill: 'tailoring', xp: 2, check: ( c ) => full( c.b ),
		run: ( c ) => { delete c.b.data.uses; } },
	{ id: 'tech_oil_generator', verb: 'Change oil', label: 'Change oil in {b}', a: 'motor_oil', b: 'generator', use: { a: 1, b: 0 }, repair: { b: 0.45, max: 1 },
		check: ( c ) => needs( c, 'wrench' ), run: ( c ) => wearTool( c, 'wrench' ), time: 8, sound: 'pour', skill: 'mechanics', xp: 5 },

	// ---- repairs ----
	{ id: 'tech_glue_fix', verb: 'Glue', a: 'superglue', b: { fn: gluable }, use: { a: 1, b: 0 },
		repair: { b: 0.15, max: 0.8 }, time: 4, sound: 'click', skill: 'maintenance' },
	{ id: 'tech_epoxy_fix', verb: 'Mend', label: 'Mend {b} with epoxy', a: 'epoxy', b: { fn: gluable }, use: { a: 1, b: 0 },
		repair: { b: 0.3, max: 0.95 }, time: 8, sound: 'craft', skill: 'maintenance' },
	{ id: 'tech_wood_glue', verb: 'Glue', a: 'wood_glue', b: { fn: ( s, d ) => WOODEN.has( d.id ) }, use: { a: 1, b: 0 }, repair: { b: 0.3, max: 1 }, time: 6, sound: 'craft', skill: 'carpentry' },
	{ id: 'tech_oil_tool', verb: 'Oil', a: 'penetrating_oil', b: { fn: metalTool }, use: { a: 1, b: 0 }, repair: { b: 0.12, max: 0.9 }, time: 3, sound: 'spray', skill: 'maintenance' },
	{ id: 'tech_solder_fix', verb: 'Solder', label: 'Repair {b}', a: 'electronic_scrap', b: { fn: electronic }, use: { a: 1, b: 0 },
		check: ( c ) => needs( c, 'solder' ), run: ( c ) => wearTool( c, 'solder' ), repair: { b: 0.35, max: 1 }, time: 10, sound: 'sizzle', skill: 'electrical' },
	{ id: 'tech_grip_wrap', verb: 'Wrap grip', label: 'Wrap grip of {b}', a: 'leather', b: { cat: 'melee' }, use: { a: 1, b: 0 }, tools: [ 'cut' ], repair: { b: 0.2, max: 1 },
		time: 6, sound: 'tear', skill: 'maintenance' },
	{ id: 'tech_zip_strap', verb: 'Fix strap', label: 'Fix {b} strap', a: 'zip_ties', b: { cat: 'backpack' }, use: { a: 2, b: 0 }, repair: { b: 0.15, max: 0.8 }, time: 3, sound: 'zipper', skill: 'tailoring' },

	// ---- cutting and making ----
	{ id: 'tech_fabric_rags', verb: 'Cut up', a: { tool: 'cut' }, b: 'fabric', use: { a: 0, b: 1 }, wear: { a: 0.005 }, out: [ 'rags', 4 ], time: 3, sound: 'tear', skill: 'tailoring' },
	{ id: 'tech_hose_cut', verb: 'Cut', label: 'Make siphon hose', a: { tool: 'cut' }, b: 'rubber_hose', use: { a: 0, b: 1 }, wear: { a: 0.005 }, out: [ 'siphon_hose', 1 ], time: 4, sound: 'tear', skill: 'mechanics' },
	{ id: 'tech_magnet_rope', verb: 'Tie', label: 'Make magnet on a rope', a: 'magnet', b: 'rope', out: [ 'fishing_magnet', 1 ], time: 5, sound: 'tear' },
	{ id: 'tech_flatten_can', verb: 'Flatten', label: 'Flatten cans', a: { tool: 'hammer' }, b: 'empty_can', use: { a: 0, b: 4 }, out: [ 'sheet_metal', 1 ], time: 10, sound: 'hit_metal',
		skill: 'mechanics', noise: { radius: 18 } },

	// ---- the lockbox ----
	{ id: 'tech_lock_cut', verb: 'Cut lock', label: 'Cut lock', a: { tool: 'boltcutter' }, b: 'lockbox', use: { a: 0, b: 0 }, time: L.LOCK.cut.time, sound: 'snap', run: ON_LOCK( 'cut' ) },
	{ id: 'tech_lock_drill', verb: 'Drill lock', label: 'Drill lock', a: { tool: 'drill', fn: ( s, d ) => ! d.tool?.battery || L.chargeOf( s, d ) > 0.1 }, b: 'lockbox', use: { a: 0, b: 0 },
		time: L.LOCK.drill.time, sound: 'craft', run: ON_LOCK( 'drill' ) },
	{ id: 'tech_lock_pry', verb: 'Pry open', label: 'Pry open', a: { tool: 'pry' }, b: 'lockbox', use: { a: 0, b: 0 }, time: L.LOCK.pry.time, sound: 'hit_metal', run: ON_LOCK( 'pry' ) },
	{ id: 'tech_lock_pick', verb: 'Pick lock', label: 'Pick lock', a: 'lockpick', b: 'lockbox', use: { a: 0, b: 0 }, time: L.LOCK.pick.time, sound: 'click', run: ON_LOCK( 'pick' ) },
] );
