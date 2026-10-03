// Gear (docs/ITEMS_PLAN.md "gear"): clothing, carrying, containers, protection and the clothing mixes.
//   Hawaiian: a pāʻū skirt, a lavalava (fabric becomes one), a palaka work shirt, an aloha dress, a holokū, a kapa
//     kīhei and kapa cloth, a lauhala bag, a feather lei hat band (feathers become one; it goes onto a lauhala hat);
//   rain and work: a rain poncho (rig it to catch rain), an oilskin coat, a sou'wester, a fishing smock, a dive skin
//     (keeps jellyfish off), a beekeeper suit and veil (the veil keeps mosquitoes off), a leather apron;
//   military and police: a ghillie hood, a boonie with netting (a boonie and a mosquito net), a tactical vest that takes
//     steel plates or plates beaten from sheet metal, a pilot's helmet, a civil defence gas mask, a bandolier, a leg rig,
//     dog tags (read: their unit's post on the map); someone's lanyard of keys (try them on the locked cases);
//   sports: motocross helmet and chest protector, a hockey mask, bike and football helmets, knee and elbow pads (strap
//     them onto trousers), sport sunglasses;
//   carrying: a rolling suitcase (big, but slow and loud to drag), a briefcase and a pistol case (locked: pick or force
//     them; someone's things inside), a lunch box, an ammo can (opens like a box, stashes like one), a tackle bag, a
//     drawstring bag, plastic grocery bags (tear when overloaded; twist three into cord), a trash bag (big, tears; cut it
//     into a poncho), a sling bag, a waist pack, a rifle case, a camera bag, a hydration pack (a bladder built in: drink
//     on the move), a messenger bag;
//   the mixes: cut jeans into cutoffs (denim scraps), patch clothes with denim, leather, fabric or kapa (armour and
//     warmth, tailoring), dye them black, camo or tie-dye (or bleach them, or a marker on small things), sew pouches on
//     belts, vests and bags, strap pads on, plates into the vest; wet clothes dry by a fire, or wring them out.
// The rules and numbers: ../../ext/gear/logic.js. The system (wet clothes, tearing bags, the suitcase, camouflage) and
// the case verbs: ../../ext/gear/runtime.js. Tool kinds this domain adds: needle (a sewing kit provides one), dye, marker.
// Per-stack state the core reads through small hooks: data.look (a dyed look), data.mods (sewn-on armour, warmth,
// storage), data.wet.
import { defineItems, getItem, displayName } from '../../ItemDB.js';
import { extendLoot, defineLootTable } from '../../Loot.js';
import { addRecipes, R } from '../../recipes.js';
import { addCombos } from '../../combos.js';
import { addUseActions, addSystem } from '../../hooks.js';
import { provides } from '../../util.js';
import { dyeable, markable, PATCH, MAX_PATCHES, POUCH_CAP, MAX_POUCHES, PADS, patchable, pouchable, addMods, subMods, wetLabel, dryTime, keysTried } from '../../ext/gear/logic.js';
import { attach, setLook, isCase, locked, openCase, unlock } from '../../ext/gear/runtime.js';
// the outdoor sites' tables (site_<kind>) are defined there; imported first so they can be extended here
import '../../sites/tables.js';

// ---- helpers ------------------------------------------------------------------------------------------------------------

const EXTRA = [ 'place', 'dismantle', 'dismantleTools', 'container', 'opens', 'lock', 'fun' ];
const extra = ( d, o ) => { for ( const k of EXTRA ) if ( o[ k ] !== undefined ) d[ k ] = o[ k ]; return d; };

// cl( id, name, slot, o ): o = { w, size, cap, ins, bite, bullet, wp, vis, color, rarity, tags, model, desc }
function cl( id, name, slot, o ) {
	return extra( {
		id, name, cat: 'clothing', desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 2, stack: 1, rarity: o.rarity || 'common',
		tags: [ 'clothing', 'gear', ...( o.tags || [] ) ], model: o.model,
		clothing: {
			slot, capacity: o.cap ?? 0, insulation: o.ins ?? 0.1, armor: { bite: o.bite ?? 0, bullet: o.bullet ?? 0 },
			waterproof: o.wp ?? 0, visibility: o.vis ?? 0.5, color: o.color,
		},
	}, o );
}
// bags; `bag` joins the clothing stores' and wardrobes' bag picks, so plastic and trash bags leave it out
function bp( id, name, o ) {
	const d = extra( {
		id, name, cat: 'backpack', desc: o.desc || '', weight: o.w ?? 0.6, size: o.size ?? 6, stack: 1, rarity: o.rarity || 'common',
		tags: [ ...( o.noBagTag ? [] : [ 'bag' ] ), 'gear', ...( o.tags || [] ) ], model: o.model,
		backpack: {
			slot: o.slot || 'back', capacity: o.cap, insulation: o.ins ?? 0.03, armor: { bite: o.bite ?? 0.03, bullet: 0 },
			waterproof: o.wp ?? 0.2, visibility: o.vis ?? 0.5, color: o.color, keepsFresh: o.fresh || 0,
		},
	}, o );
	if ( o.liquid ) d.tool = { kind: 'bottle', liquid: o.liquid };
	return d;
}
const thing = ( id, name, cat, o ) => extra( { id, name, cat, desc: o.desc || '', weight: o.w ?? 0.2, size: o.size ?? 1, stack: o.stack ?? 1,
	rarity: o.rarity || 'common', tags: [ 'gear', ...( o.tags || [] ) ], model: o.model }, o );
const tool = ( id, name, kind, o ) => ( { ...thing( id, name, 'tool', { ...o, tags: [ 'tool', ...( o.tags || [] ) ] } ), tool: { kind, ...( o.tool || {} ) } } );
const mat = ( id, name, o ) => thing( id, name, 'material', { ...o, tags: [ 'material', ...( o.tags || [] ) ] } );
const misc = ( id, name, o ) => thing( id, name, 'misc', o );
// a hand-carried box: opens like a container next to the inventory; `opens` is the table rolled the first time
const box = ( id, name, cap, o ) => misc( id, name, { ...o, container: { capacity: cap } } );
// printed labels (the food.js form)
const L = ( text, sub, bg, fg, band, glyph, style = 'band', extra2 = {} ) => ( { text, sub, bg, fg, band, glyph, style, ...extra2 } );

const KAPA = 0x8a5a32;

// ======================================================================================================================
// the items
// ======================================================================================================================

defineItems( [
	// ---------------- Hawaiian ----------------
	cl( 'pau_skirt', 'Pāʻū skirt', 'legs', { color: 0xc8283a, ins: 0.05, vis: 0.75, w: 0.45, size: 2, tags: [ 'casual', 'tourist', 'hawaiian', 'church' ],
		model: { type: 'gear_dress', style: 'skirt', color: 0xc8283a, print: 'hibiscus', color2: 0xf6e7d0, color3: 0x2f6b3a, rep: 1.6 }, desc: 'Hula skirt. Rips into rags.' } ),
	cl( 'lavalava', 'Lavalava', 'legs', { color: 0x1f3b73, ins: 0.04, vis: 0.6, w: 0.3, size: 2, tags: [ 'casual', 'beach', 'tourist', 'hawaiian' ],
		model: { type: 'gear_dress', style: 'wrap', color: 0x1f3b73, print: 'plumeria', color2: 0xf4f0e6, rep: 1.4 },
		dismantle: [ [ 'fabric', 2 ] ], dismantleTools: [ 'cut' ], desc: 'A cloth wrap. Cuts into fabric.' } ),
	cl( 'palaka_shirt', 'Palaka shirt', 'torso', { color: 0x1f3a6a, cap: 2, ins: 0.2, bite: 0.04, vis: 0.45, w: 0.35, size: 3, tags: [ 'casual', 'work', 'farm', 'hawaiian' ],
		model: { type: 'shirt', style: 'aloha', color: 0x1d3566, print: 'plaid', color2: 0xf2f2ee, color3: 0x0e1a36, rep: 1.6, button: 0xf2f2ee }, desc: 'Heavy plantation work shirt.' } ),
	cl( 'aloha_dress', 'Aloha dress', 'torso', { color: 0xc8283a, cap: 0, ins: 0.06, vis: 0.75, w: 0.25, size: 2, tags: [ 'casual', 'tourist', 'hawaiian' ],
		model: { type: 'gear_dress', style: 'sundress', color: 0xc8283a, print: 'hibiscus', color2: 0xf6e7d0, color3: 0x2f6b3a }, desc: 'Light and cool.' } ),
	cl( 'holoku', 'Holokū', 'torso', { color: 0xf2eee4, cap: 0, ins: 0.16, vis: 0.7, w: 0.6, size: 4, rarity: 'uncommon', tags: [ 'formal', 'church', 'hawaiian' ],
		model: { type: 'gear_dress', style: 'gown', color: 0xf4f0e6, print: 'floral', color2: 0xe8dcc8, color3: 0xd8c8b0, rep: 2.2, trim: 0xe8e0d0 }, desc: 'A long formal gown.' } ),
	cl( 'kapa_kihei', 'Kapa kīhei', 'torso', { color: KAPA, cap: 0, ins: 0.22, vis: 0.4, w: 0.5, size: 3, rarity: 'rare', tags: [ 'hawaiian', 'church', 'nodye' ],
		model: { type: 'gear_smock', style: 'kihei', color: KAPA }, dismantle: [ [ 'kapa_cloth', 2 ] ], dismantleTools: [ 'cut' ], desc: 'A bark-cloth shoulder wrap. Warm.' } ),
	mat( 'kapa_cloth', 'Kapa cloth', { w: 0.15, size: 1, stack: 4, rarity: 'uncommon', tags: [ 'cloth', 'hawaiian' ],
		model: { type: 'gear_small', style: 'kapa' }, desc: 'Bark cloth. A warm patch.' } ),
	bp( 'lauhala_bag', 'Lauhala bag', { cap: 8, w: 0.3, size: 4, color: 0xcfa860, vis: 0.5, tags: [ 'tourist', 'hawaiian', 'market', 'nodye' ],
		model: { type: 'gear_bag', style: 'lauhala', color: 0xcfa860 }, desc: 'Woven pandanus tote.' } ),
	misc( 'feather_lei_band', 'Feather lei hat band', { w: 0.03, size: 0.5, rarity: 'rare', tags: [ 'hawaiian', 'valuable' ],
		model: { type: 'gear_small', style: 'feathers', color: 0xd83a2a, color2: 0xf2c230 }, desc: 'Goes on a lauhala hat.' } ),
	cl( 'lauhala_hat_lei', 'Lauhala hat with lei', 'head', { color: 0xcfa860, ins: 0.05, vis: 0.55, w: 0.18, size: 3, rarity: 'rare', tags: [ 'hawaiian', 'nodye' ],
		model: { type: 'gear_hat', style: 'lei', color: 0xcfa860, color2: 0xd83a2a, color3: 0xf2c230 }, desc: 'A lauhala hat with a feather band.' } ),

	// ---------------- rain and work ----------------
	cl( 'rain_poncho', 'Rain poncho', 'vest', { color: 0x2a5ab0, ins: 0.08, wp: 0.85, vis: 0.7, w: 0.35, size: 2, tags: [ 'outdoor', 'hardware', 'rain' ],
		model: { type: 'gear_smock', style: 'poncho', color: 0x2a5ab0 }, place: { kind: 'collector', shape: 'tarp', litres: 15, area: 1.6, verb: 'Rig' },
		desc: 'Over everything. Rig it to catch rain.' } ),
	cl( 'oilskin_coat', 'Oilskin coat', 'torso', { color: 0x4a3a22, cap: 6, ins: 0.32, wp: 0.9, bite: 0.1, vis: 0.35, w: 1.6, size: 6, rarity: 'uncommon', tags: [ 'farm', 'fishing', 'outdoor' ],
		model: { type: 'shirt', style: 'coat', color: 0x4a3a22, print: 'leather', color2: 0x000000, trim: 0x2e2416, zip: 0x8a7a5a, rough: 0.55 }, desc: 'Waxed and warm.' } ),
	cl( 'sou_wester', 'Sou\'wester', 'head', { color: 0xf0c020, ins: 0.05, wp: 0.9, vis: 0.85, w: 0.15, size: 2, tags: [ 'fishing', 'farm' ],
		model: { type: 'gear_hat', style: 'sou_wester', color: 0xf0c020 }, desc: 'Rain hat. Sheds water off your neck.' } ),
	cl( 'fishing_smock', 'Fishing smock', 'torso', { color: 0x3a6a8a, cap: 6, ins: 0.2, wp: 0.55, vis: 0.5, w: 0.6, size: 4, tags: [ 'fishing', 'outdoor', 'market' ],
		model: { type: 'shirt', style: 'hoodie', color: 0x3a6a8a, print: 'canvas', color2: 0xffffff, rep: 2 }, desc: 'Pullover with a big pocket.' } ),
	cl( 'dive_skin', 'Dive skin', 'torso', { color: 0x1a2a4a, cap: 0, ins: 0.1, wp: 0.4, vis: 0.3, w: 0.3, size: 2, tags: [ 'surf', 'dive', 'sports' ],
		model: { type: 'shirt', style: 'wetsuit', color: 0x1a2a4a, print: 'stripes', color2: 0x2aa8c8, rep: 0.8, trim: 0x2aa8c8, zip: 0x2aa8c8 }, desc: 'Thin suit. Keeps stings off.' } ),
	cl( 'beekeeper_suit', 'Beekeeper suit', 'torso', { color: 0xf0eee4, cap: 4, ins: 0.35, bite: 0.2, vis: 0.85, w: 1.4, size: 6, rarity: 'uncommon', tags: [ 'farm' ],
		model: { type: 'shirt', style: 'suit', color: 0xf0eee4, color2: 0x1a1a1a, trim: 0xd8d4c8 }, desc: 'Thick and hot. Bites struggle.' } ),
	cl( 'beekeeper_veil', 'Beekeeper veil', 'head', { color: 0xf0eee4, ins: 0.02, bite: 0.1, vis: 0.8, w: 0.2, size: 3, tags: [ 'farm', 'nodye' ],
		model: { type: 'gear_hat', style: 'veil', color: 0xf0eee4 }, desc: 'Keeps mosquitoes off.' } ),
	cl( 'leather_apron', 'Leather apron', 'vest', { color: 0x6a4428, cap: 2, ins: 0.05, bite: 0.25, wp: 0.3, vis: 0.45, w: 1.5, size: 4, tags: [ 'work', 'farm', 'restaurant', 'nodye' ],
		model: { type: 'gear_smock', style: 'apron', color: 0x6a4428 }, dismantle: [ [ 'leather', 2 ] ], dismantleTools: [ 'cut' ], desc: 'Heavy hide. Stops teeth.' } ),

	// ---------------- military and police ----------------
	cl( 'ghillie_hood', 'Ghillie hood', 'head', { color: 0x56613b, ins: 0.1, vis: 0.05, w: 0.4, size: 3, rarity: 'rare', tags: [ 'military', 'hunting', 'nodye' ],
		model: { type: 'gear_hat', style: 'ghillie', color: 0x56613b }, desc: 'Hard to spot.' } ),
	cl( 'boonie_net', 'Boonie hat with netting', 'head', { color: 0x6b6a45, ins: 0.04, vis: 0.15, w: 0.18, size: 2, rarity: 'uncommon', tags: [ 'military', 'hunting' ],
		model: { type: 'gear_hat', style: 'boonie_net', color: 0x6b6a45, print: 'woodland', color2: 0x3a3525 }, desc: 'Hides your face. Keeps mosquitoes off.' } ),
	cl( 'tactical_vest', 'Tactical vest', 'vest', { color: 0x2a2e26, cap: 8, ins: 0.1, bite: 0.2, vis: 0.3, w: 1.8, size: 8, rarity: 'uncommon', tags: [ 'police', 'military' ],
		model: { type: 'gear_vest', style: 'tactical', color: 0x2a2e26 }, desc: 'Empty plate pockets. Takes two plates.' } ),
	cl( 'tactical_vest_plated', 'Tactical vest (steel plates)', 'vest', { color: 0x2a2e26, cap: 8, ins: 0.12, bite: 0.45, bullet: 0.55, vis: 0.3, w: 7.4, size: 10, rarity: 'epic', tags: [ 'military' ],
		model: { type: 'gear_vest', style: 'tactical', plates: 'steel', color: 0x2a2e26 }, desc: 'Stops rifle rounds. Heavy.' } ),
	cl( 'tactical_vest_scrap', 'Tactical vest (scrap plates)', 'vest', { color: 0x2a2e26, cap: 8, ins: 0.12, bite: 0.4, bullet: 0.25, vis: 0.3, w: 5.9, size: 10, rarity: 'rare', tags: [ 'crafted' ],
		model: { type: 'gear_vest', style: 'tactical', plates: 'scrap', color: 0x2a2e26 }, desc: 'Stops pistol rounds. Heavy.' } ),
	mat( 'armor_plate', 'Steel armour plate', { w: 2.6, size: 3, stack: 2, rarity: 'rare', tags: [ 'military', 'police', 'metal' ],
		model: { type: 'gear_plate', style: 'steel' }, desc: 'Two fit a tactical vest.' } ),
	mat( 'scrap_plate', 'Scrap armour plate', { w: 2, size: 3, stack: 2, rarity: 'uncommon', tags: [ 'crafted', 'metal' ],
		model: { type: 'gear_plate', style: 'scrap' }, desc: 'Beaten sheet metal. Two fit a vest.' } ),
	cl( 'pilot_helmet', 'Pilot helmet', 'head', { color: 0x4a5034, ins: 0.15, bite: 0.5, bullet: 0.12, vis: 0.45, w: 1.4, size: 6, rarity: 'rare', tags: [ 'military', 'hangar' ],
		model: { type: 'gear_helmet', style: 'pilot', color: 0x4a5034, color2: 0x1a1a1a, visor: 0x2a2a30 }, desc: 'Flight helmet with a visor.' } ),
	cl( 'gas_mask_civil', 'Civil defence gas mask', 'face', { color: 0x3a3a34, ins: 0.05, bite: 0.25, vis: 0.45, w: 0.8, size: 3, rarity: 'uncommon', tags: [ 'police', 'hazmat', 'nodye' ],
		model: { type: 'gear_mask', style: 'civil', color: 0x3a3a34 }, desc: 'Old rubber mask. Covers the face.' } ),
	cl( 'bandolier', 'Bandolier', 'vest', { color: 0x5a4a30, cap: 5, ins: 0, vis: 0.4, w: 0.45, size: 2, tags: [ 'hunting', 'military', 'farm', 'nodye' ],
		model: { type: 'gear_vest', style: 'bandolier', color: 0x5a4a30, color2: 0xc8282a }, desc: 'Ammo across the chest.' } ),
	cl( 'leg_rig', 'Leg rig', 'belt', { color: 0x2a2e26, cap: 4, ins: 0, vis: 0.3, w: 0.6, size: 3, rarity: 'uncommon', tags: [ 'military', 'police' ],
		model: { type: 'gear_vest', style: 'legrig', color: 0x2a2e26 }, desc: 'Pouches on the thigh.' } ),
	misc( 'dog_tags', 'Dog tags', { w: 0.02, size: 0.2, rarity: 'uncommon', tags: [ 'military' ],
		model: { type: 'gear_small', style: 'dogtags' }, desc: 'Read to mark their unit\'s post.' } ),
	misc( 'lanyard_keys', 'Lanyard with keys', { w: 0.08, size: 0.5, tags: [ 'office', 'work' ],
		model: { type: 'gear_small', style: 'lanyard', color: 0x1a4a8a }, desc: 'Try them on locked cases.' } ),

	// ---------------- sports protection ----------------
	cl( 'motocross_helmet', 'Motocross helmet', 'head', { color: 0xf2f2ee, ins: 0.2, bite: 0.62, bullet: 0.04, vis: 0.75, w: 1.3, size: 6, rarity: 'uncommon', tags: [ 'motor', 'sports', 'garage' ],
		model: { type: 'gear_helmet', style: 'motocross', color: 0xf2f2ee, color2: 0xe8601a, stripe: 0x1a1a1a, visor: 0xe8601a }, desc: 'Full face. Hard to bite through.' } ),
	cl( 'chest_protector', 'Chest protector', 'vest', { color: 0xf2f2ee, ins: 0.05, bite: 0.35, vis: 0.7, w: 1.6, size: 6, rarity: 'uncommon', tags: [ 'motor', 'sports', 'garage' ],
		model: { type: 'gear_pads', style: 'chest', color: 0xf2f2ee, color2: 0xe8601a }, desc: 'Motocross roost guard.' } ),
	cl( 'hockey_mask', 'Hockey mask', 'face', { color: 0xf0ece0, ins: 0.02, bite: 0.32, vis: 0.7, w: 0.4, size: 3, rarity: 'uncommon', tags: [ 'sports' ],
		model: { type: 'gear_mask', style: 'hockey', color: 0xf0ece0, color2: 0xc8282a }, desc: 'Goalie mask.' } ),
	cl( 'bike_helmet', 'Bike helmet', 'head', { color: 0x2a8ad6, ins: 0.05, bite: 0.3, vis: 0.7, w: 0.3, size: 4, tags: [ 'sports', 'school' ],
		model: { type: 'gear_helmet', style: 'bike', color: 0x2a8ad6, color2: 0x1a1a1a }, desc: 'Light and vented.' } ),
	cl( 'football_helmet', 'Football helmet', 'head', { color: 0x7a1a2a, ins: 0.15, bite: 0.55, bullet: 0.03, vis: 0.65, w: 1.5, size: 6, rarity: 'uncommon', tags: [ 'sports', 'school' ],
		model: { type: 'gear_helmet', style: 'football', color: 0x7a1a2a, color2: 0xd4a64a, stripe: 0xf2f2ee }, desc: 'Padded shell and face cage.' } ),
	misc( 'skate_pads', 'Knee and elbow pads', { w: 0.5, size: 2, tags: [ 'sports', 'school', 'surf' ],
		model: { type: 'gear_pads', style: 'skate', color: 0x1a1a1a, color2: 0xe8301a }, desc: 'Strap onto trousers.' } ),
	cl( 'sport_sunglasses', 'Sport sunglasses', 'eyes', { color: 0xd8302a, vis: 0.55, w: 0.03, size: 1, tags: [ 'sports', 'surf', 'casual' ],
		model: { type: 'glasses', style: 'sun', color: 0xd8302a, lens: 0x2a6ad6 }, desc: 'Wraparound shades.' } ),

	// ---------------- carrying ----------------
	bp( 'rolling_suitcase', 'Rolling suitcase', { cap: 36, w: 4.2, size: 20, color: 0x2a4a7a, wp: 0.5, vis: 0.6, rarity: 'uncommon', tags: [ 'tourist', 'hotel' ],
		model: { type: 'gear_suitcase', color: 0x2a4a7a, color2: 0x1a1a1a }, desc: 'Holds a lot. Slow and loud to drag.' } ),
	box( 'briefcase', 'Briefcase', 5, { w: 1.6, size: 6, rarity: 'uncommon', tags: [ 'office', 'bank' ], lock: true, opens: 'gear_briefcase',
		model: { type: 'gear_case', style: 'briefcase', color: 0x2a1a12, color2: 0xc8a050 }, desc: 'Locked. Someone\'s papers inside.' } ),
	box( 'pistol_case', 'Pistol case', 4, { w: 1.1, size: 4, rarity: 'rare', tags: [ 'gunstore', 'police' ], lock: true, opens: 'gear_pistol_case',
		model: { type: 'gear_case', style: 'pistol', color: 0x1a1a1c, color2: 0x8a8e94 }, desc: 'Locked hard case.' } ),
	box( 'lunch_box', 'Lunch box', 2, { w: 0.5, size: 2, tags: [ 'school', 'work' ], opens: 'gear_lunch_box',
		model: { type: 'gear_case', style: 'lunch', color: 0xc8282a, color2: 0xb8bcc2 }, desc: 'Metal box. Maybe a lunch inside.' } ),
	box( 'ammo_can', 'Ammo can', 5, { w: 1.8, size: 6, rarity: 'uncommon', tags: [ 'military', 'gunstore', 'metal' ], opens: 'gear_ammo_can',
		model: { type: 'gear_case', style: 'ammo', color: 0x4a5034, color2: 0xd8c860 }, desc: 'Watertight steel box. Stash it.' } ),
	bp( 'tackle_bag', 'Tackle bag', { cap: 12, w: 0.9, size: 8, color: 0x2a3a2a, wp: 0.5, vis: 0.4, tags: [ 'fishing', 'outdoor' ],
		model: { type: 'gear_bag', style: 'tackle', color: 0x2a3a2a, color2: 0xe8601a }, desc: 'Soft box with outside pockets.' } ),
	bp( 'drawstring_bag', 'Drawstring bag', { cap: 6, w: 0.15, size: 2, color: 0x1a1a1c, vis: 0.4, tags: [ 'school', 'sports', 'casual' ],
		model: { type: 'gear_bag', style: 'drawstring', color: 0x1a1a1c, color2: 0xf2f2ee, print: 'text:KAIMUKI', rep: 1 }, desc: 'Light cinch sack.' } ),
	bp( 'grocery_bag', 'Plastic grocery bag', { slot: 'belt', cap: 4, w: 0.02, size: 0.5, color: 0xf2f2ee, wp: 0.6, vis: 0.6, bite: 0, noBagTag: true, tags: [ 'grocery', 'fragile', 'plastic', 'nodye', 'trash' ],
		model: { type: 'gear_bag', style: 'grocery', color: 0xf2f2ee, color2: 0xc8282a }, desc: 'Carry in hand. Tears when overloaded.' } ),
	bp( 'trash_bag', 'Trash bag', { cap: 26, w: 0.08, size: 1, color: 0x161618, wp: 0.8, vis: 0.4, bite: 0, noBagTag: true, tags: [ 'hardware', 'fragile', 'plastic', 'nodye', 'trash' ],
		model: { type: 'gear_bag', style: 'trash', color: 0x161618 }, desc: 'Over the shoulder. Big, but it tears.' } ),
	cl( 'trash_bag_poncho', 'Trash bag poncho', 'vest', { color: 0x161618, ins: 0.05, wp: 0.75, vis: 0.4, w: 0.08, size: 1, tags: [ 'crafted', 'plastic', 'nodye', 'fragile' ],
		model: { type: 'gear_smock', style: 'trash', color: 0x2a2c31 }, desc: 'Keeps the rain off. Tears.' } ),
	bp( 'sling_bag', 'Sling bag', { cap: 8, w: 0.5, size: 5, color: 0x3a3e46, vis: 0.4, tags: [ 'casual', 'tourist', 'sports' ],
		model: { type: 'gear_bag', style: 'sling', color: 0x3a3e46, color2: 0x1a1a1a }, desc: 'One strap, quick to reach.' } ),
	bp( 'waist_pack', 'Hiking waist pack', { slot: 'belt', cap: 6, w: 0.35, size: 3, color: 0xe8601a, vis: 0.6, tags: [ 'sports', 'outdoor' ],
		model: { type: 'gear_bag', style: 'waist', color: 0xe8601a, color2: 0x2a2a2a }, desc: 'Hip pack with bottle pockets.' } ),
	bp( 'rifle_case', 'Rifle case', { cap: 16, w: 2.2, size: 16, color: 0x3a3e2a, wp: 0.5, vis: 0.35, rarity: 'uncommon', tags: [ 'gunstore', 'hunting' ],
		model: { type: 'gear_bag', style: 'rifle', color: 0x3a3e2a, color2: 0x1a1a1a }, desc: 'Padded. A long gun fits.' } ),
	bp( 'camera_bag', 'Camera bag', { slot: 'belt', cap: 4, w: 0.5, size: 4, color: 0x1a1a1c, wp: 0.4, vis: 0.4, tags: [ 'tourist' ],
		model: { type: 'gear_bag', style: 'camera', color: 0x1a1a1c, color2: 0xc8282a }, desc: 'Padded hip bag.' } ),
	bp( 'hydration_pack', 'Hydration pack', { cap: 6, w: 0.6, size: 5, color: 0x1a5a8a, vis: 0.5, liquid: 2.5, tags: [ 'sports', 'outdoor', 'military' ],
		model: { type: 'gear_bag', style: 'hydration', color: 0x1a5a8a, color2: 0x1a1a1a }, desc: 'Holds 2.5 L of water. Drink on the move.' } ),
	bp( 'messenger_bag', 'Messenger bag', { cap: 12, w: 0.7, size: 6, color: 0x5a4a3a, vis: 0.45, tags: [ 'office', 'school', 'casual' ],
		model: { type: 'gear_bag', style: 'messenger', color: 0x5a4a3a, color2: 0x2a2018 }, desc: 'Flap bag on a strap.' } ),

	// ---------------- tailoring and dyes ----------------
	mat( 'denim_scrap', 'Denim scrap', { w: 0.1, size: 0.5, stack: 6, tags: [ 'cloth', 'denim', 'crafted' ],
		model: { type: 'gear_small', style: 'denim', color: 0x2f4a78, color2: 0x5a7ab0 }, desc: 'A tough patch.' } ),
	tool( 'upholstery_needle', 'Upholstery needle', 'needle', { w: 0.01, size: 0.2, tags: [ 'hardware', 'clothing_store' ],
		model: { type: 'gear_small', style: 'needle' }, desc: 'Sews patches and pouches.' } ),
	misc( 'utility_pouch', 'Utility pouch', { w: 0.15, size: 1, stack: 3, tags: [ 'military', 'police', 'sports' ],
		model: { type: 'gear_small', style: 'pouch', color: 0x4a5034 }, desc: 'Sew onto a belt, vest or bag.' } ),
	tool( 'dye_black', 'Black fabric dye', 'dye', { w: 0.3, size: 1, tags: [ 'clothing_store', 'grocery' ], tool: { uses: 2 },
		model: { type: 'bottle', style: 'syrup', h: 0.16, r: 0.03, glass: 0x1a1a1c, cap: 0x1a1a1c, label: L( 'LANI', 'FABRIC DYE · BLACK', 0xf2f2ee, 0x1a1a1c, 0x1a1a1c, 'drop', 'band', { glyphColor: 0x1a1a1c } ), labelY: 0.12, labelH: 0.42 },
		desc: 'Dyes clothes black. Needs water.' } ),
	tool( 'camo_dye_kit', 'Camo dye kit', 'dye', { w: 0.4, size: 1, rarity: 'uncommon', tags: [ 'hunting', 'gunstore' ], tool: { uses: 2 },
		model: { type: 'box', size: [ 0.14, 0.1, 0.05 ], round: 0.004, labelAxis: 'z', label: L( 'KOA OUTDOORS', 'CAMO DYE KIT · 3 colours', 0x56613b, 0xf2eedc, 0x3a3525, 'leaf', 'military', { glyphColor: 0xc8b890 } ) },
		desc: 'Dyes clothes camo. Needs water.' } ),
	tool( 'tiedye_kit', 'Tie-dye kit', 'dye', { w: 0.3, size: 1, tags: [ 'clothing_store', 'school', 'surf' ], tool: { uses: 3 },
		model: { type: 'box', size: [ 0.16, 0.11, 0.06 ], round: 0.004, labelAxis: 'z', label: L( 'RAINBOW REEF', 'TIE-DYE KIT · 5 colours', 0xf8e71c, 0xe64a7a, 0x4a90e2, 'sun', 'stripes', { glyphColor: 0xe64a7a } ) },
		desc: 'Tie-dyes clothes. Needs water.' } ),
	tool( 'marker', 'Permanent marker', 'marker', { w: 0.02, size: 0.2, tags: [ 'office', 'school' ], tool: { uses: 4 },
		model: { type: 'gear_small', style: 'marker' }, desc: 'Blacks out a hat, mask, gloves or shoes.' } ),
] );

// a sewing kit has a needle in it
{
	const sk = getItem( 'sewing_kit' );
	if ( sk?.tool && ! sk.tool.provides?.includes( 'needle' ) ) sk.tool.provides = [ ...( sk.tool.provides || [] ), 'needle' ];
}

// ======================================================================================================================
// what was packed in the cases (rolled the first time one is opened)
// ======================================================================================================================

const I = ( ids, w, q ) => ( { ids, w, q } );
const PISTOLS = [ 'glock17', 'm1911', 'beretta_m9', 'sig_p226', 'revolver_357', 'ruger_mk4' ];
defineLootTable( 'gear_briefcase', { rolls: [ 1, 3 ], items: [
	[ 'cash', 3, [ 20, 250 ] ], [ 'newspaper', 1 ], [ 'phone', 0.8 ], [ 'stash_note', 0.4 ], [ 'car_keys', 0.6 ], [ 'watch', 0.3 ], [ 'gold_chain', 0.15 ],
	[ 'painkillers', 0.4 ], [ 'lighter_zippo', 0.2 ], [ 'candy_bar', 0.4 ], [ 'marker', 0.6 ], [ 'lanyard_keys', 0.3 ], I( [ 'glock17', 'm1911' ], 0.1 ), [ 'ammo_9mm', 0.15 ], [ 'treasure_map', 0.03 ],
] } );
// a pistol most of the time (the biggest thing goes in first: runtime unpackFirst), else its magazines and rounds
defineLootTable( 'gear_pistol_case', { rolls: [ 1, 2 ], items: [
	I( PISTOLS, 8 ), I( [ 'mag_glock17', 'mag_1911', 'mag_m9', 'mag_p226', 'mag_ruger22' ], 1.5 ), I( [ 'ammo_9mm', 'ammo_45acp', 'ammo_357', 'ammo_22lr' ], 2 ),
] } );
defineLootTable( 'gear_lunch_box', { rolls: [ 0, 2 ], items: [
	[ 'spam_musubi', 2 ], [ 'manapua', 0.8 ], [ 'granola_bar', 1 ], [ 'li_hing_mui', 0.8 ], [ 'macadamia_nuts', 0.6 ], [ 'lilikoi_juicebox', 1 ], [ 'arare', 0.6 ],
	[ 'butter_mochi', 0.4 ], [ 'candy_bar', 0.6 ], [ 'crackers', 0.5 ],
] } );
defineLootTable( 'gear_ammo_can', { rolls: [ 1, 3 ], items: [
	I( [ 'ammo_9mm', 'ammo_556', 'ammo_762x39', 'ammo_308', 'ammo_12ga_buck', 'ammo_45acp', 'ammo_22lr' ], 5 ), I( [ 'mag_stanag30', 'mag_akm', 'mag_glock17' ], 0.8 ),
	[ 'chemlight', 0.5, [ 1, 3 ] ], [ 'road_flare', 0.4 ], [ 'mre', 0.4 ], [ 'cash', 0.3, [ 20, 200 ] ], [ 'weapon_cleaning_kit', 0.3 ], [ 'grenade_smoke', 0.04 ],
] } );

// ======================================================================================================================
// where they lie: building loot spots (shelves, counters and floors you can see) and the outdoor sites
// ======================================================================================================================

const put = ( table, entries ) => extendLoot( table, entries );
// homes
put( 'house_bedroom', [ [ 'rolling_suitcase', 0.15 ], [ 'pistol_case', 0.06 ], [ 'drawstring_bag', 0.25 ], [ 'dye_black', 0.1 ], [ 'skate_pads', 0.1 ], [ 'sling_bag', 0.15 ] ] );
put( 'wardrobe', [ [ 'palaka_shirt', 0.3 ], [ 'holoku', 0.12 ], [ 'oilskin_coat', 0.1 ], [ 'rain_poncho', 0.25 ], [ 'pau_skirt', 0.2 ] ] );
put( 'house_kitchen', [ [ 'grocery_bag', 0.8, [ 1, 3 ] ], [ 'trash_bag', 0.4, [ 1, 2 ] ], [ 'lunch_box', 0.3 ] ] );
put( 'house_living', [ [ 'marker', 0.3 ], [ 'feather_lei_band', 0.05 ] ] );
put( 'house_garage', [ [ 'trash_bag', 0.4 ], [ 'bike_helmet', 0.4 ], [ 'motocross_helmet', 0.12 ], [ 'chest_protector', 0.08 ], [ 'skate_pads', 0.15 ], [ 'ammo_can', 0.12 ],
	[ 'rifle_case', 0.08 ], [ 'tackle_bag', 0.15 ], [ 'rain_poncho', 0.2 ], [ 'leather_apron', 0.1 ] ] );
// shops
put( 'clothing_store', [ [ 'dye_black', 0.5 ], [ 'tiedye_kit', 0.4 ], [ 'upholstery_needle', 0.3 ], [ 'denim_scrap', 0.3, [ 1, 3 ] ], [ 'palaka_shirt', 0.4 ], [ 'aloha_dress', 0.6 ],
	[ 'holoku', 0.15 ], [ 'pau_skirt', 0.3 ], [ 'lavalava', 0.4 ], [ 'lauhala_bag', 0.3 ], [ 'messenger_bag', 0.3 ], [ 'sling_bag', 0.3 ], [ 'drawstring_bag', 0.4 ], [ 'feather_lei_band', 0.15 ], [ 'sport_sunglasses', 0.4 ] ] );
put( 'grocery', [ [ 'grocery_bag', 1.5, [ 1, 4 ] ], [ 'trash_bag', 0.5, [ 1, 3 ] ], [ 'dye_black', 0.2 ], [ 'lunch_box', 0.2 ] ] );
put( 'convenience', [ [ 'grocery_bag', 1, [ 1, 3 ] ], [ 'rain_poncho', 0.6 ], [ 'marker', 0.3 ], [ 'sport_sunglasses', 0.3 ] ] );
put( 'gas_station', [ [ 'grocery_bag', 0.6, [ 1, 2 ] ], [ 'rain_poncho', 0.5 ], [ 'sport_sunglasses', 0.3 ] ] );
put( 'market', [ [ 'grocery_bag', 1, [ 1, 3 ] ], [ 'lauhala_bag', 0.6 ], [ 'lavalava', 0.3 ], [ 'kapa_cloth', 0.15 ], [ 'feather_lei_band', 0.2 ], [ 'fishing_smock', 0.25 ],
	[ 'tiedye_kit', 0.2 ], [ 'lauhala_hat_lei', 0.06 ] ] );
put( 'hardware', [ [ 'trash_bag', 0.8, [ 1, 3 ] ], [ 'rain_poncho', 0.8 ], [ 'upholstery_needle', 0.4 ], [ 'beekeeper_veil', 0.12 ], [ 'leather_apron', 0.2 ], [ 'dye_black', 0.15 ], [ 'marker', 0.3 ] ] );
put( 'sports', [ [ 'camo_dye_kit', 0.3 ], [ 'utility_pouch', 0.3 ], [ 'boonie_net', 0.2 ], [ 'tackle_bag', 0.5 ], [ 'rain_poncho', 0.4 ] ] );
put( 'surf', [ [ 'lavalava', 0.4 ], [ 'tiedye_kit', 0.3 ], [ 'skate_pads', 0.2 ] ] );
put( 'pawn', [ [ 'briefcase', 0.3 ], [ 'pistol_case', 0.3 ], [ 'ammo_can', 0.2 ], [ 'rifle_case', 0.2 ], [ 'camera_bag', 0.5 ], [ 'kapa_kihei', 0.2 ], [ 'kapa_cloth', 0.2 ],
	[ 'feather_lei_band', 0.15 ], [ 'dog_tags', 0.2 ], [ 'gas_mask_civil', 0.2 ], [ 'hockey_mask', 0.1 ], [ 'oilskin_coat', 0.1 ], [ 'lauhala_hat_lei', 0.1 ] ] );
put( 'gunstore', [ [ 'pistol_case', 0.8 ], [ 'rifle_case', 0.6 ], [ 'ammo_can', 0.6 ], [ 'bandolier', 0.4 ], [ 'leg_rig', 0.3 ], [ 'tactical_vest', 0.3 ], [ 'camo_dye_kit', 0.4 ],
	[ 'boonie_net', 0.3 ], [ 'ghillie_hood', 0.15 ], [ 'utility_pouch', 0.4 ] ] );
// services
put( 'police', [ [ 'gas_mask_civil', 0.2 ] ] );
put( 'police_locker', [ [ 'tactical_vest', 0.4 ], [ 'leg_rig', 0.3 ], [ 'pistol_case', 0.3 ], [ 'utility_pouch', 0.3 ], [ 'armor_plate', 0.15 ] ] );
put( 'fire_station', [ [ 'gas_mask_civil', 0.3 ], [ 'rain_poncho', 0.3 ] ] );
put( 'military', [ [ 'ammo_can', 0.8 ], [ 'dog_tags', 0.3 ], [ 'armor_plate', 0.3 ], [ 'bandolier', 0.2 ] ] );
put( 'military_armory', [ [ 'armor_plate', 0.4 ], [ 'tactical_vest_plated', 0.25 ], [ 'ammo_can', 0.6 ] ] );
put( 'military_locker', [ [ 'dog_tags', 0.5 ], [ 'utility_pouch', 0.5 ], [ 'hydration_pack', 0.3 ], [ 'pilot_helmet', 0.08 ], [ 'ammo_can', 0.4 ] ] );
put( 'hangar', [ [ 'pilot_helmet', 0.5 ], [ 'rolling_suitcase', 0.3 ], [ 'briefcase', 0.2 ] ] );
put( 'garage_shop', [ [ 'motocross_helmet', 0.4 ], [ 'chest_protector', 0.3 ], [ 'leather_apron', 0.4 ], [ 'lunch_box', 0.4 ], [ 'trash_bag', 0.3 ] ] );
put( 'hospital', [ [ 'gas_mask_civil', 0.1 ], [ 'lanyard_keys', 0.15 ] ] );
put( 'restaurant_kitchen', [ [ 'trash_bag', 0.5, [ 1, 2 ] ], [ 'leather_apron', 0.3 ] ] );
// offices, schools, public buildings
put( 'office', [ [ 'briefcase', 0.6 ], [ 'messenger_bag', 0.4 ], [ 'marker', 0.8 ], [ 'lunch_box', 0.3 ], [ 'lanyard_keys', 0.3 ] ] );
put( 'desk', [ [ 'marker', 0.5 ], [ 'briefcase', 0.12 ], [ 'lanyard_keys', 0.25 ] ] );
put( 'bank', [ [ 'briefcase', 0.5 ] ] );
put( 'school', [ [ 'lunch_box', 0.8 ], [ 'drawstring_bag', 0.8 ], [ 'marker', 0.8 ], [ 'football_helmet', 0.3 ], [ 'bike_helmet', 0.2 ], [ 'skate_pads', 0.2 ], [ 'tiedye_kit', 0.3 ], [ 'messenger_bag', 0.3 ] ] );
put( 'church', [ [ 'holoku', 0.3 ], [ 'pau_skirt', 0.4 ], [ 'kapa_kihei', 0.15 ], [ 'kapa_cloth', 0.25 ], [ 'feather_lei_band', 0.15 ], [ 'lauhala_bag', 0.3 ] ] );
put( 'post', [ [ 'messenger_bag', 0.6 ], [ 'marker', 0.4 ], [ 'grocery_bag', 0.3 ], [ 'lanyard_keys', 0.12 ] ] );
put( 'hotel_room', [ [ 'rolling_suitcase', 0.5 ], [ 'briefcase', 0.15 ], [ 'aloha_dress', 0.3 ], [ 'camera_bag', 0.3 ], [ 'lauhala_bag', 0.2 ], [ 'grocery_bag', 0.3 ], [ 'lanyard_keys', 0.08 ] ] );
put( 'warehouse', [ [ 'trash_bag', 0.6, [ 1, 3 ] ], [ 'lunch_box', 0.4 ], [ 'ammo_can', 0.1 ], [ 'lanyard_keys', 0.2 ] ] );
put( 'observatory', [ [ 'camera_bag', 0.3 ], [ 'messenger_bag', 0.2 ] ] );
put( 'farm', [ [ 'palaka_shirt', 0.6 ], [ 'beekeeper_suit', 0.4 ], [ 'beekeeper_veil', 0.5 ], [ 'leather_apron', 0.3 ], [ 'oilskin_coat', 0.3 ], [ 'sou_wester', 0.2 ],
	[ 'lunch_box', 0.3 ], [ 'trash_bag', 0.3 ], [ 'bandolier', 0.15 ] ] );
put( 'beach', [ [ 'lavalava', 0.3 ], [ 'grocery_bag', 0.3 ], [ 'tackle_bag', 0.15 ] ] );
put( 'street', [ [ 'grocery_bag', 0.6 ], [ 'trash_bag', 0.3 ], [ 'bike_helmet', 0.15 ] ] );
put( 'trash', [ [ 'grocery_bag', 0.8 ], [ 'trash_bag', 0.4 ], [ 'denim_scrap', 0.3 ] ] );

// the outdoor sites (ground loot you can always see)
put( 'site_roadside', [ [ 'rolling_suitcase', 0.6 ], [ 'grocery_bag', 0.5 ], [ 'briefcase', 0.15 ], [ 'sling_bag', 0.3 ], [ 'bike_helmet', 0.3 ], [ 'camera_bag', 0.15 ], [ 'rain_poncho', 0.2 ] ] );
put( 'site_bus_stop', [ [ 'grocery_bag', 0.6 ], [ 'lunch_box', 0.3 ], [ 'messenger_bag', 0.4 ], [ 'drawstring_bag', 0.4 ], [ 'rain_poncho', 0.3 ], [ 'lanyard_keys', 0.15 ] ] );
put( 'site_crash_car', [ [ 'rolling_suitcase', 0.3 ], [ 'briefcase', 0.2 ], [ 'pistol_case', 0.08 ], [ 'rifle_case', 0.12 ], [ 'motocross_helmet', 0.15 ], [ 'trash_bag', 0.2 ] ] );
put( 'site_beach_camp', [ [ 'lavalava', 0.4 ], [ 'lauhala_bag', 0.3 ], [ 'camera_bag', 0.2 ], [ 'waist_pack', 0.3 ], [ 'dive_skin', 0.3 ], [ 'aloha_dress', 0.2 ], [ 'grocery_bag', 0.4 ] ] );
put( 'site_campsite', [ [ 'rain_poncho', 0.4 ], [ 'hydration_pack', 0.2 ], [ 'rifle_case', 0.1 ], [ 'trash_bag', 0.4 ], [ 'boonie_net', 0.1 ] ] );
put( 'site_hiker', [ [ 'waist_pack', 0.5 ], [ 'hydration_pack', 0.5 ], [ 'rain_poncho', 0.4 ], [ 'sling_bag', 0.2 ], [ 'boonie_net', 0.15 ], [ 'sport_sunglasses', 0.2 ] ] );
put( 'site_fishing_spot', [ [ 'tackle_bag', 0.6 ], [ 'fishing_smock', 0.4 ], [ 'sou_wester', 0.4 ], [ 'oilskin_coat', 0.15 ], [ 'grocery_bag', 0.3 ] ] );
put( 'site_checkpoint', [ [ 'tactical_vest', 0.2 ], [ 'gas_mask_civil', 0.15 ], [ 'leg_rig', 0.15 ] ] );
put( 'site_military_checkpoint', [ [ 'ammo_can', 0.5 ], [ 'dog_tags', 0.4 ], [ 'tactical_vest', 0.2 ], [ 'armor_plate', 0.1 ], [ 'bandolier', 0.15 ], [ 'utility_pouch', 0.3 ], [ 'leg_rig', 0.2 ], [ 'ghillie_hood', 0.05 ] ] );
put( 'site_heli_crash', [ [ 'pilot_helmet', 0.4 ], [ 'dog_tags', 0.5 ], [ 'armor_plate', 0.3 ], [ 'tactical_vest_plated', 0.3 ], [ 'ammo_can', 0.3 ] ] );
put( 'site_fema_camp', [ [ 'rain_poncho', 0.6 ], [ 'trash_bag', 0.4, [ 1, 3 ] ], [ 'rolling_suitcase', 0.2 ], [ 'grocery_bag', 0.4 ], [ 'gas_mask_civil', 0.1 ] ] );
put( 'site_farm_stand', [ [ 'lauhala_bag', 0.4 ], [ 'grocery_bag', 0.6, [ 1, 2 ] ], [ 'palaka_shirt', 0.15 ] ] );
put( 'site_picnic', [ [ 'grocery_bag', 0.5 ], [ 'lunch_box', 0.3 ], [ 'trash_bag', 0.2 ] ] );
put( 'site_body', [ [ 'lanyard_keys', 0.12 ], [ 'dog_tags', 0.15 ], [ 'tactical_vest_scrap', 0.05 ], [ 'scrap_plate', 0.1 ], [ 'bandolier', 0.1 ], [ 'messenger_bag', 0.2 ], [ 'drawstring_bag', 0.2 ], [ 'trash_bag', 0.15 ] ] );
put( 'site_stash', [ [ 'ammo_can', 0.4 ] ] );
// the infected's pockets (menus only; their clothes are dressed by the creatures module)
put( 'zombie_military', [ [ 'dog_tags', 1.2 ] ] );
put( 'zombie_tourist', [ [ 'camera_bag', 0.1 ] ] );
put( 'zombie_civilian', [ [ 'lanyard_keys', 0.06 ] ] );

// ======================================================================================================================
// recipes (the crafting panel)
// ======================================================================================================================

addRecipes( [
	R( 'gear_drawstring_bag', 'Drawstring bag', [ 'drawstring_bag', 1 ], [ [ 'fabric', 2 ], [ 'rope', 1 ] ], { tools: [ 'needle' ], time: 14, cat: 'tools', skill: 'tailoring', xp: 6 } ),
	R( 'gear_pouch_leather', 'Utility pouch (leather)', [ 'utility_pouch', 1 ], [ [ 'leather', 1 ] ], { tools: [ 'needle', 'cut' ], time: 12, cat: 'tools', skill: 'tailoring', xp: 5 } ),
	R( 'gear_pouch_denim', 'Utility pouch (denim)', [ 'utility_pouch', 1 ], [ [ 'denim_scrap', 2 ] ], { tools: [ 'needle' ], time: 12, cat: 'tools', skill: 'tailoring', xp: 5 } ),
	R( 'gear_lavalava', 'Lavalava', [ 'lavalava', 1 ], [ [ 'fabric', 2 ] ], { tools: [ 'cut' ], time: 8, cat: 'tools', skill: 'tailoring', xp: 4 } ),
	R( 'gear_feather_band', 'Feather lei hat band', [ 'feather_lei_band', 1 ], [ [ 'feathers', 8 ] ], { tools: [ 'needle' ], time: 20, cat: 'tools', skill: 'tailoring', xp: 8 } ),
	R( 'gear_scrap_plate', 'Scrap armour plate', [ 'scrap_plate', 1 ], [ [ 'sheet_metal', 1 ], [ 'duct_tape', 1 ] ], { tools: [ 'hammer' ], time: 25, cat: 'tools', skill: 'mechanics', xp: 8 } ),
] );

// ======================================================================================================================
// combos (drag one onto the other)
// ======================================================================================================================

const isDyed = ( s, dye ) => s.data?.look?.dye === dye;
const notDyed = ( dye ) => ( s, d ) => dyeable( d ) && ! isDyed( s, dye );
const water = { kind: [ 'water', 'dirty' ], litres: 0.5 };
const dyeRun = ( dye ) => ( c ) => { setLook( c.b, dye ); c.toast( displayName( c.b ), 'good' ); };
// a patch, a pouch or pads: what the stack already has and what's left of the room
const count = ( s, k ) => s.data?.[ k ] || 0;
// a sewing kit spends its thread; an upholstery needle only wears
function sew( c ) {
	const kit = c.inv.find( ( s, d ) => d?.tool?.kind === 'sewing' && provides( s, 'needle' ) );
	if ( kit && ! c.inv.find( ( s, d ) => d?.tool?.kind === 'needle' && s.cond > 0 ) ) c.use?.useUp?.( kit, 1 );
}
// cut-offs keep the dye and how wet they are
const keep = ( s ) => { const o = {}; for ( const k of [ 'look', 'name', 'wet' ] ) if ( s.data[ k ] !== undefined ) o[ k ] = s.data[ k ]; return o; };

addCombos( [
	// ---- cut jeans into shorts: the legs come off as denim scraps ----
	{ id: 'gear_cut_jeans', verb: 'Cut', label: 'Cut into shorts', a: { tool: 'cut' }, b: { ids: [ 'jeans', 'cargo_pants' ] }, use: { a: 0, b: 0 }, wear: { a: 0.01 },
		time: 6, sound: 'tear', skill: 'tailoring', xp: 4,
		run: ( c ) => {
			const jeans = c.b.id === 'jeans', look = keep( c.b ), pads = !! c.b.data.pads;
			if ( look.name ) look.name = look.name.replace( /jeans|cargo pants/i, jeans ? 'cutoffs' : 'cargo shorts' );
			// sewn-on patches stay on what's left; pads strapped round the knees come off first
			if ( c.b.data.mods ) look.mods = JSON.parse( JSON.stringify( c.b.data.mods ) );
			if ( c.b.data.patches ) look.patches = c.b.data.patches;
			const one = c.replace( c.b, jeans ? 'denim_shorts' : 'cargo_shorts', look ) || c.b;
			if ( pads ) { subMods( one, PADS ); c.give( 'skate_pads', 1 ); }
			c.give( jeans ? 'denim_scrap' : 'fabric', jeans ? 2 : 1 );
		} },

	// ---- patches: armour and warmth, sewn with a needle ----
	{ id: 'gear_patch', verb: 'Patch', label: 'Sew patch', a: { ids: Object.keys( PATCH ) }, b: { fn: ( s, d ) => patchable( d ) }, use: { a: 1, b: 0 }, tools: [ 'needle' ],
		time: 10, sound: 'zipper', skill: 'tailoring', xp: 6,
		check: ( c ) => count( c.b, 'patches' ) >= MAX_PATCHES ? { reason: 'Fully patched', soft: true } : null,
		run: ( c ) => {
			addMods( c.b, PATCH[ c.a.id ] || PATCH[ c.A.id ] );
			c.b.data.patches = count( c.b, 'patches' ) + 1;
			c.b.cond = Math.min( 1, c.b.cond + 0.12 );
			sew( c );
			c.toast( `Patched ${c.b.data.patches}/${MAX_PATCHES}`, 'good' );
		} },

	// ---- dyes (a garment soaks in dye and water) ----
	{ id: 'gear_dye_black', verb: 'Dye', label: 'Dye black', a: 'dye_black', b: { fn: notDyed( 'black' ) }, use: { a: 1, b: 0 }, liquid: water,
		time: 8, sound: 'pour', skill: 'tailoring', xp: 3, run: dyeRun( 'black' ) },
	{ id: 'gear_dye_camo', verb: 'Dye', label: 'Dye camo', a: 'camo_dye_kit', b: { fn: notDyed( 'camo' ) }, use: { a: 1, b: 0 }, liquid: water,
		time: 10, sound: 'pour', skill: 'tailoring', xp: 4, run: dyeRun( 'camo' ) },
	{ id: 'gear_dye_tiedye', verb: 'Tie-dye', label: 'Tie-dye', a: 'tiedye_kit', b: { fn: notDyed( 'tiedye' ) }, use: { a: 1, b: 0 }, liquid: water,
		time: 12, sound: 'pour', skill: 'tailoring', xp: 4, fun: { boredom: - 15, unhappy: - 4 }, run: dyeRun( 'tiedye' ) },
	// bleach strips a dye, or fades the colour
	{ id: 'gear_bleach', verb: 'Bleach', label: 'Bleach', a: 'bleach', b: { fn: notDyed( 'bleach' ) }, use: { a: 2, b: 0 }, liquid: water,
		time: 8, sound: 'pour', skill: 'tailoring', xp: 2,
		run: ( c ) => { setLook( c.b, c.b.data.look?.dye ? null : 'bleach' ); c.toast( displayName( c.b ), 'good' ); } },
	{ id: 'gear_marker', verb: 'Colour', label: 'Colour black', a: 'marker', b: { fn: ( s, d ) => markable( d ) && ! isDyed( s, 'black' ) }, use: { a: 1, b: 0 },
		time: 6, sound: 'click', run: dyeRun( 'black' ) },

	// ---- pouches on belts, vests and bags ----
	{ id: 'gear_sew_pouch', verb: 'Sew on', label: 'Sew pouch on', a: 'utility_pouch', b: { fn: ( s, d ) => pouchable( d ) }, use: { a: 1, b: 0 }, tools: [ 'needle' ],
		time: 9, sound: 'zipper', skill: 'tailoring', xp: 5,
		check: ( c ) => count( c.b, 'pouches' ) >= MAX_POUCHES ? { reason: 'No room for more', soft: true } : null,
		run: ( c ) => { addMods( c.b, { cap: POUCH_CAP } ); c.b.data.pouches = count( c.b, 'pouches' ) + 1; sew( c ); c.toast( `+${POUCH_CAP} storage`, 'good' ); } },

	// ---- plates into the vest ----
	{ id: 'gear_plates_steel', verb: 'Insert', label: 'Insert plates', a: 'armor_plate', b: 'tactical_vest', use: { a: 2, b: 0 }, time: 6, sound: 'zipper',
		run: ( c ) => c.replace( c.b, 'tactical_vest_plated', keepAll( c.b ) ) },
	{ id: 'gear_plates_scrap', verb: 'Insert', label: 'Insert plates', a: 'scrap_plate', b: 'tactical_vest', use: { a: 2, b: 0 }, time: 6, sound: 'zipper',
		run: ( c ) => c.replace( c.b, 'tactical_vest_scrap', keepAll( c.b ) ) },

	// ---- pads strapped over trousers ----
	{ id: 'gear_pads', verb: 'Strap on', label: 'Strap pads on', a: 'skate_pads', b: { fn: ( s, d ) => d.cat === 'clothing' && d.clothing.slot === 'legs' }, use: { a: 1, b: 0 },
		time: 4, sound: 'zipper',
		check: ( c ) => count( c.b, 'pads' ) ? { reason: 'Already padded', soft: true } : null,
		run: ( c ) => { addMods( c.b, PADS ); c.b.data.pads = 1; } },

	// ---- Hawaiian ----
	{ id: 'gear_lei_band', verb: 'Fit', label: 'Fit band', a: 'feather_lei_band', b: 'lauhala_hat', use: { a: 1, b: 0 }, time: 4, sound: 'unwrap',
		fun: { unhappy: - 5 }, run: ( c ) => c.replace( c.b, 'lauhala_hat_lei', keep( c.b ) ) },

	// ---- making do ----
	{ id: 'gear_boonie_net', verb: 'Fit', label: 'Fit net', a: 'mosquito_net', b: 'boonie_hat', use: { a: 1, b: 0 }, tools: [ 'cut' ], time: 8, sound: 'tear',
		skill: 'tailoring', xp: 3, run: ( c ) => c.replace( c.b, 'boonie_net', keep( c.b ) ) },
	{ id: 'gear_trash_poncho', verb: 'Cut', label: 'Cut into poncho', a: { tool: 'cut' }, b: 'trash_bag', use: { a: 0, b: 0 }, wear: { a: 0.005 }, time: 4, sound: 'tear',
		check: ( c ) => c.b.data.items?.length ? 'Empty it first' : null,
		run: ( c ) => c.replace( c.b, 'trash_bag_poncho', {} ) },
	// plastic bags twisted into cord ("plarn")
	{ id: 'gear_plarn', verb: 'Twist', label: 'Twist into cord', a: { tool: 'cut' }, b: 'grocery_bag', use: { a: 0, b: 3 }, wear: { a: 0.005 }, out: [ 'rope', 1 ],
		time: 15, sound: 'tear', skill: 'survival', xp: 4 },
] );

// a plated vest keeps everything: contents, dye, sewn pouches
function keepAll( s ) { const o = { ...s.data }; delete o.items; return JSON.parse( JSON.stringify( o ) ); }

// ======================================================================================================================
// verbs
// ======================================================================================================================

const PLATES = { tactical_vest_plated: 'armor_plate', tactical_vest_scrap: 'scrap_plate' };

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, use = ctx.use, inv = ctx.inv;
	if ( ! g || ! use ) return;

	// ---- cases and boxes ----
	if ( isCase( def ) ) {
		if ( locked( stack, def ) ) {
			const pick = inv.find( ( s, d ) => d?.tool?.kind === 'lockpick' && s.cond > 0 );
			const keys = inv.find( ( s ) => s.id === 'lanyard_keys' );
			ctx.first( 'Force open', () => unlock( g, stack, 'force', use ) );
			if ( pick ) ctx.first( 'Pick lock', () => unlock( g, stack, 'pick', use ) );
			if ( keys && ! keysTried( stack, keys ) ) ctx.first( 'Try keys', () => unlock( g, stack, 'keys', use ) );
		} else ctx.first( 'Open', () => openCase( g, stack ), [ stack.data.items?.length ? `${stack.data.items.length}` : null ] );
	}

	// ---- clothes: wet ones dry by a fire or wring out; plates and pads come off ----
	if ( def.cat === 'clothing' || def.cat === 'backpack' ) {
		const w = stack.data.wet || 0, worn = Object.values( inv.equip ).includes( stack );
		const fire = !! g.nearFire?.( g.player.pos );
		if ( w > 0.05 && fire ) {
			if ( worn ) ctx.first( 'Dry by the fire', () => use.timed( 'Drying off', 10, null, () => {
				g.survival.wet = 0;
				for ( const s of Object.values( inv.equip ) ) if ( s?.data?.wet ) delete s.data.wet;
				g.survival.mood?.( { unhappy: - 3 } );
				g.toast( 'Dry', 'good' );
			} ), [ wetLabel( w ) ] );
			else ctx.first( 'Dry', () => use.timed( `Drying ${def.name}`, dryTime( w ), null, () => {
				if ( ! use.exists( stack ) ) return;
				delete stack.data.wet;
				use.changed( use.where( stack ) );
			} ), [ wetLabel( w ) ] );
		}
		if ( w > 0.35 && ! worn ) ctx.add( 'Wring out', () => use.timed( 'Wringing out', 3, null, () => {
			if ( ! use.exists( stack ) ) return;
			stack.data.wet = Math.min( stack.data.wet || 0, Math.max( 0.25, ( stack.data.wet || 0 ) * 0.5 ) );
			use.changed( use.where( stack ) );
		} ), [ wetLabel( w ) ] );
		if ( PLATES[ def.id ] ) ctx.add( 'Remove plates', () => use.timed( 'Removing plates', 5, 'zipper', () => {
			if ( ! use.exists( stack ) ) return;
			// the same stack becomes the empty vest: what was in its pockets stays there
			const data = keepAll( stack );
			if ( stack.data.items ) data.items = stack.data.items;
			use.transform( stack, 'tactical_vest', data );
			use.give( PLATES[ def.id ], 2 );
		} ) );
		if ( stack.data.pads ) ctx.add( 'Take off pads', () => use.timed( 'Unstrapping pads', 3, 'zipper', () => {
			if ( ! use.exists( stack ) || ! stack.data.pads ) return;
			delete stack.data.pads;
			subMods( stack, PADS );
			use.give( 'skate_pads', 1 );
			use.changed( use.where( stack ) );
		} ) );
	}

	// ---- dog tags: their unit's post ----
	if ( def.id === 'dog_tags' ) ctx.first( 'Read', () => use.timed( 'Reading tags', 2, null, () => {
		const site = g.sites?.reveal?.( 'military_checkpoint', g.player.pos, 4000 ) || g.sites?.reveal?.( 'heli_crash', g.player.pos );
		g.toast( site ? 'Marked on map' : 'Nothing to go on', site ? 'good' : 'info' );
		if ( ! stack.data.read ) { stack.data.read = true; g.survival?.mood?.( { unhappy: 3 } ); }
	} ) );
} );

// the gear system starts with the items module (hooks.js addSystem: this domain has no module of its own)
addSystem( attach );
