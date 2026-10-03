// Pharmacy (docs/ITEMS_PLAN.md "pharmacy"): medicine off the shelf and from the hospital, Hawaiian herbal remedies, sterile
// versus dirty dressings, and the cures for the ailments in Survival.js (box jellyfish stings, centipede bites, sunburn
// and burns, heat stroke, leptospirosis, infected cuts, a cough, a sprained wrist, sore eyes).
//   medicine: `medical` as in defs/medical.js, plus the fields Survival.treat reads: cure: { ailment: amount }, fx:
//     { effect: game hours } (steady, calm, drowsy, deep, immune, regen, breathe, warm, cool, doxy), temp, dress, dirty,
//     close, sling, kcal; and need: [ ailments ] (refused with needMsg when there is none of them);
//   dressings: a bandage over an open cut is a dressing (rags are dirty unless boiled or soaked in alcohol); it soils
//     in time, and changing it gives a used bandage, which boils, soaks or washes back into use;
//   herbs (the mortar and pestle, tool kind grind): ʻōlena, pōpolo, kukui, ʻawa, noni, ʻuhaloa and māmaki into
//     poultices, a salve, oil, teas, noni juice and ʻawa powder; herbs eaten raw do what `herb` says (an eat hook);
//   verbs (../../ext/pharmacy/verbs.js): the thermometer, the blood pressure cuff and the stethoscope read out, a
//     sunscreen, vinegar on a sting, spirits on a cut, super glue on a bleed, ti leaves on a fever, the crutch;
//   the medicate hook (../../ext/pharmacy/med.js): what each treatment needs, changing dressings, surgery, the AED.
// Tool kind owned here: grind (the mortar and pestle).
import { defineItems, getItem } from '../../ItemDB.js';
import { extendLoot } from '../../Loot.js';
import { addRecipes, R } from '../../recipes.js';
import { addCombos, liquidIn } from '../../combos.js';
import { addEatHook } from '../../hooks.js';
import '../../ext/pharmacy/med.js';
import '../../ext/pharmacy/verbs.js';
import '../../ext/pharmacy/icons.js';
// the outdoor sites' tables (site_<kind>) are defined there; imported first so they can be extended here
import '../../sites/tables.js';

// ---- helpers ----------------------------------------------------------------------------------------------------------

const EXTRA = [ 'fun', 'dismantle', 'dismantleTools', 'herb', 'crutch' ];
const MED = [ 'gerund', 'cure', 'fx', 'temp', 'dress', 'dirty', 'close', 'sling', 'kcal', 'need', 'needMsg' ];
function base( id, name, cat, o ) {
	const d = { id, name, cat, desc: o.desc || '', weight: o.w ?? 0.1, size: o.size ?? 1, stack: o.stack ?? 1, rarity: o.rarity || 'common',
		tags: [ ...( o.pre || [] ), ...( o.tags || [] ) ], model: o.model };
	for ( const k of EXTRA ) if ( o[ k ] !== undefined ) d[ k ] = o[ k ];
	return d;
}
function med( id, name, o ) {
	const m = {
		use: o.use ?? 3, heal: o.heal ?? 0, blood: 0, bleed: o.bleed ?? 0, infection: o.infection ?? 0, pain: o.pain ?? 0, splint: false, sick: o.sick ?? 0,
		energy: o.energy ?? 0, stamina: !! o.stamina, verb: o.verb || 'Use', sound: o.sound || 'bandage', purify: 0, uses: o.uses,
	};
	for ( const k of MED ) if ( o[ k ] !== undefined ) m[ k ] = o[ k ];
	return { ...base( id, name, 'medical', { ...o, pre: [ 'medical' ] } ), medical: m };
}
const tool = ( id, name, kind, o ) => ( { ...base( id, name, 'tool', { ...o, pre: [ 'tool' ] } ), tool: { kind, ...( o.tool || {} ) } } );
const mat = ( id, name, o ) => base( id, name, 'material', { ...o, pre: [ 'material' ] } );
function food( id, name, o ) {
	return { ...base( id, name, 'food', { ...o, pre: [ 'food' ] } ), food: { kcal: o.kcal ?? 10, water: o.water ?? 0, spoil: o.spoil ?? 0, opener: false, raw: false, sick: o.sick ?? 0, cooked: null, portions: o.portions ?? 1 } };
}
function drink( id, name, o ) {
	const k = { water: o.water ?? 20, kcal: o.kcal ?? 0, alcohol: 0, caffeine: 0, container: o.container || null, sick: 0, portions: o.portions ?? 1 };
	if ( o.cure ) k.cure = o.cure;
	if ( o.fx ) k.fx = o.fx;
	return { ...base( id, name, 'drink', { ...o, pre: [ 'drink' ] } ), drink: k };
}

// printed labels (the food.js form)
const L = ( text, sub, bg, fg, band, glyph, style = 'band', extra = {} ) => ( { text, sub, bg, fg, band, glyph, style, ...extra } );
const pills = ( color, cap, text, sub, band, o = {} ) => ( { type: 'pillbottle', color, cap, r: o.r, h: o.h, clear: o.clear, label: { bg: 0xffffff, fg: 0x111111, text, sub, band, style: 'band', size: 0.26, ...( o.label || {} ) } } );
const bottle = ( o ) => ( { type: 'bottle', ...o } );
const tube = ( o ) => ( { type: 'tube', ...o } );
const sachet = ( size, label, o = {} ) => ( { type: 'bar', size, label, ...o } );
const P = ( type, o = {} ) => ( { type: 'pharm_' + type, ...o } );

// ======================================================================================================================
// the items
// ======================================================================================================================

defineItems( [
	// ================= disinfecting and dressing a cut =================
	med( 'rubbing_alcohol', 'Rubbing alcohol', { w: 0.5, size: 1, uses: 8, use: 3, infection: 0.15, verb: 'Disinfect', sound: 'pour',
		tags: [ 'pharmacy', 'hospital', 'clinic', 'house', 'disinfectant', 'plastic' ],
		model: bottle( { style: 'syrup', h: 0.2, r: 0.034, clear: true, glass: 0xeef2f4, opacity: 0.4, liquid: 0xd6e8f4, liquidClear: true, fill: 0.85, cap: 0x2a5ab8,
			label: L( 'ISOPROPYL', '70% rubbing alcohol', 0xffffff, 0x1a3a8a, 0x2a5ab8, 'drop', 'band', { glyphColor: 0x2a5ab8, size: 0.24 } ), labelY: 0.2, labelH: 0.36 } ),
		desc: 'Disinfects cuts and bandages.' } ),
	med( 'hydrogen_peroxide', 'Hydrogen peroxide', { w: 0.5, size: 1, uses: 6, use: 3, infection: 0.12, verb: 'Disinfect', sound: 'pour',
		tags: [ 'pharmacy', 'house', 'clinic', 'disinfectant', 'plastic' ],
		model: bottle( { style: 'syrup', h: 0.19, r: 0.033, glass: 0x4a2410, cap: 0xf2f2f2,
			label: L( 'PEROXIDE', '3% topical solution', 0xffffff, 0x4a2410, 0x6a3a1a, null, 'band', { size: 0.26 } ), labelY: 0.18, labelH: 0.38 } ),
		desc: 'Disinfects cuts and bandages.' } ),
	med( 'hand_sanitizer', 'Hand sanitizer', { w: 0.3, size: 1, uses: 6, use: 2, infection: 0.05, verb: 'Clean cut', gerund: 'Cleaning cut', sound: 'spray',
		tags: [ 'pharmacy', 'office', 'school', 'convenience', 'house', 'hotel', 'disinfectant', 'plastic' ],
		model: P( 'pump', { body: 0xe8f2f6, liquid: 0x9ad0e8, head: 0x2a8ad6, label: L( 'KŌKUA', 'Hand sanitizer · 62% alcohol', 0xffffff, 0x1a6ab8, 0x2a8ad6, 'drop', 'plain', { glyphColor: 0x2a8ad6, size: 0.3 } ) } ),
		desc: 'Cleans a cut. Burns as tinder.' } ),
	med( 'butterfly_strips', 'Wound closure strips', { w: 0.02, size: 0.5, stack: 5, use: 4, bleed: 1, close: 300, verb: 'Close cut', gerund: 'Closing cut', rarity: 'uncommon',
		tags: [ 'pharmacy', 'hospital', 'clinic', 'first_aid', 'paper' ],
		model: { type: 'box', size: [ 0.08, 0.018, 0.06 ], labelAxis: 'y', label: L( 'CLOSURE STRIPS', 'Sterile · 10 strips', 0xffffff, 0x1a4a8a, 0x2a6ad6, 'cross', 'medical', { glyphColor: 0xc0282a, size: 0.22 } ) },
		desc: 'Closes a cut. It heals faster.' } ),
	mat( 'bandage_dirty', 'Used bandage', { w: 0.05, size: 1, stack: 4, tags: [ 'cloth', 'crafted' ], model: P( 'usedbandage' ),
		desc: 'Boil or soak in alcohol to reuse.' } ),
	mat( 'cotton_balls', 'Cotton balls', { w: 0.03, size: 0.5, stack: 5, tags: [ 'pharmacy', 'house', 'cloth', 'plastic' ], model: P( 'cotton' ),
		desc: 'Swabs with alcohol. Tinder with jelly.' } ),
	med( 'petroleum_jelly', 'Petroleum jelly', { w: 0.2, size: 0.5, uses: 5, use: 2, heal: 1, pain: 0.05, cure: { burn: 0.15, sunburn: 0.1 }, verb: 'Apply',
		tags: [ 'pharmacy', 'house', 'convenience', 'oil', 'plastic' ],
		model: { type: 'jar', r: 0.034, h: 0.07, clear: true, content: 0xe8d890, lid: 0x2a5ab8, label: L( 'PETRO JELLY', 'Skin protectant', 0xffffff, 0x1a3a8a, 0x2a5ab8, null, 'band', { size: 0.3 } ) },
		desc: 'Soothes burns. Tinder with cotton.' } ),
	mat( 'fire_tinder', 'Jelly tinder', { w: 0.02, size: 0.5, stack: 6, tags: [ 'crafted', 'fuel' ], model: P( 'cotton', { tinder: true } ),
		desc: 'A fire kit with only 3 sticks.' } ),
	tool( 'trauma_shears', 'Trauma shears', 'shears', { w: 0.08, size: 0.5, rarity: 'uncommon', tool: { provides: [ 'cut' ] },
		tags: [ 'hospital', 'fire', 'police', 'first_aid', 'metal' ], model: P( 'shears' ), desc: 'Cuts cloth into rags.' } ),

	// ================= pills, sprays and creams =================
	med( 'antihistamine', 'Antihistamine', { w: 0.02, size: 0.5, stack: 10, use: 2, energy: - 6, cure: { sting: 0.4, centipede: 0.4, eye: 0.3 }, fx: { drowsy: 2 },
		verb: 'Take', sound: 'pills', tags: [ 'pharmacy', 'house', 'convenience', 'medicine_cabinet' ],
		model: { type: 'blister', size: [ 0.09, 0.045 ], pills: 0xe88aa8, nx: 4, nz: 2, box: 0xe86a90, text: 'ANTIHISTAMINE' },
		desc: 'Eases stings and bites. Drowsy.' } ),
	med( 'sleeping_pills', 'Sleeping pills', { w: 0.03, size: 0.5, stack: 10, use: 2, energy: - 25, fx: { drowsy: 3, deep: 6 }, fun: { stress: - 6 }, verb: 'Take', sound: 'pills',
		rarity: 'uncommon', tags: [ 'pharmacy', 'house', 'hospital', 'medicine_cabinet' ],
		model: pills( 0x2a3a8a, 0xf2f2f2, 'MOEMOE', 'Sleep aid · 25 mg', 0x2a3a8a ), desc: 'A deep sleep. Makes you drowsy.' } ),
	med( 'beta_blockers', 'Propranolol', { w: 0.03, size: 0.5, stack: 10, use: 2, energy: - 3, fx: { steady: 4 }, verb: 'Take', sound: 'pills', rarity: 'uncommon',
		tags: [ 'pharmacy', 'hospital', 'clinic', 'medicine_cabinet' ],
		model: pills( 0xf2f2f2, 0xd87a2a, 'PROPRANOLOL', '40 mg · Rx only', 0xd87a2a ), desc: 'Steadies your aim for hours.' } ),
	med( 'antidepressants', 'Sertraline', { w: 0.03, size: 0.5, stack: 10, use: 2, energy: - 2, fx: { calm: 24 }, verb: 'Take', sound: 'pills', rarity: 'uncommon',
		tags: [ 'pharmacy', 'hospital', 'clinic', 'medicine_cabinet' ],
		model: pills( 0xf2f2f2, 0x2a8a7a, 'SERTRALINE', '50 mg · Rx only', 0x2a8a7a ), desc: 'Eases stress and gloom for a day.' } ),
	med( 'doxycycline', 'Doxycycline', { w: 0.03, size: 0.5, stack: 6, use: 2, infection: 0.35, cure: { lepto: 1, cut: 0.2 }, fx: { doxy: 24 }, verb: 'Take', sound: 'pills',
		rarity: 'rare', tags: [ 'hospital', 'military', 'clinic' ],
		model: pills( 0xe8c020, 0x2a2a2a, 'DOXYCYCLINE', '100 mg · Rx only', 0x8a6a10 ), desc: 'Treats and prevents leptospirosis.' } ),
	med( 'vitamin_c', 'Vitamin C', { w: 0.08, size: 0.5, stack: 20, use: 2, heal: 1, cure: { cough: 0.15 }, fx: { immune: 6 }, verb: 'Take', sound: 'pills',
		tags: [ 'pharmacy', 'grocery', 'medicine_cabinet', 'sports' ],
		model: pills( 0xf28a1a, 0xf2f2f2, 'VITAMIN C', '1000 mg · Immune', 0xf28a1a, { r: 0.024, h: 0.085 } ), desc: 'Fights colds and infection.' } ),
	med( 'cough_syrup', 'Cough syrup', { w: 0.3, size: 1, uses: 5, use: 2.5, pain: 0.15, cure: { cough: 0.5 }, fx: { drowsy: 1 }, verb: 'Drink', gerund: 'Drinking', sound: 'drink',
		need: [ 'cough' ], needMsg: 'No cough', tags: [ 'pharmacy', 'house', 'convenience', 'medicine_cabinet', 'glass' ],
		model: bottle( { style: 'syrup', h: 0.15, r: 0.03, glass: 0x5a1a0a, cap: 0xf2f2f2, capH: 0.14,
			label: L( 'HAPA COUGH', 'Cough relief · Cherry', 0xc0282a, 0xffffff, 0x8a1a1a, null, 'plain', { size: 0.3 } ), labelY: 0.18, labelH: 0.4 } ),
		desc: 'Stops a cough.' } ),
	med( 'eye_drops', 'Eye drops', { w: 0.03, size: 0.5, uses: 6, use: 2, pain: 0.05, cure: { eye: 1 }, need: [ 'eye' ], needMsg: 'Eyes fine', verb: 'Use',
		tags: [ 'pharmacy', 'house', 'convenience', 'medicine_cabinet', 'plastic' ],
		model: P( 'dropper', { color: 0xf2f2f2, cap: 0x2a8ad6, label: L( 'MAKA', 'Lubricant eye drops', 0xffffff, 0x1a6ab8, 0x2a8ad6, 'drop', 'plain', { glyphColor: 0x2a8ad6, size: 0.3 } ) } ),
		desc: 'Soothes sore eyes.' } ),
	med( 'inhaler', 'Inhaler', { w: 0.04, size: 0.5, uses: 8, use: 1.5, stamina: true, cure: { cough: 0.15 }, fx: { breathe: 1 }, verb: 'Inhale', gerund: 'Inhaling',
		sound: 'pharm_puff', rarity: 'uncommon', tags: [ 'pharmacy', 'school', 'house', 'medicine_cabinet', 'plastic' ], model: P( 'inhaler' ),
		desc: 'Restores breath. Stops coughing.' } ),
	med( 'burn_cream', 'Burn cream', { w: 0.06, size: 0.5, uses: 3, use: 3, heal: 3, pain: 0.25, cure: { burn: 0.6, sunburn: 0.35 }, need: [ 'burn', 'sunburn' ], needMsg: 'No burns',
		verb: 'Apply', tags: [ 'pharmacy', 'hospital', 'first_aid', 'fire' ],
		model: tube( { len: 0.12, r: 0.016, cap: 0xc0282a, label: L( 'BURN GEL', 'Cooling · Lidocaine', 0xffffff, 0xc0282a, 0xc0282a, 'cross', 'band', { glyphColor: 0xc0282a } ) } ),
		desc: 'Treats burns and sunburn.' } ),
	med( 'after_sun', 'After-sun lotion', { w: 0.25, size: 1, uses: 4, use: 3, heal: 2, pain: 0.15, cure: { sunburn: 0.45, burn: 0.2 }, need: [ 'sunburn', 'burn' ], needMsg: 'No sunburn',
		verb: 'Apply', tags: [ 'pharmacy', 'beach', 'surf', 'tourist', 'hotel', 'plastic' ],
		model: bottle( { style: 'sports', h: 0.17, r: 0.03, glass: 0x2aa88a, cap: 0xf2f2f2, squash: 0.6,
			label: L( 'AFTER SUN', 'Cooling aloe lotion', 0xf2f8f2, 0x1a7a5a, 0x2aa88a, 'leaf', 'band', { glyphColor: 0x2aa88a, size: 0.26 } ), labelY: 0.2, labelH: 0.4 } ),
		desc: 'Treats sunburn.' } ),
	tool( 'sunscreen', 'Sunscreen', 'sunscreen', { w: 0.2, size: 1, rarity: 'common', tool: { uses: 6 }, tags: [ 'pharmacy', 'beach', 'surf', 'tourist', 'hotel', 'medical', 'plastic' ],
		model: bottle( { style: 'sports', h: 0.16, r: 0.03, glass: 0xf2f2ee, cap: 0xf28a1a, squash: 0.6,
			label: L( 'LĀ SHIELD', 'Sunscreen · SPF 50 · Reef safe', 0xf28a1a, 0xffffff, 0xf2c21a, 'sun', 'band', { glyphColor: 0xf2e21a, size: 0.26 } ), labelY: 0.18, labelH: 0.44 } ),
		desc: 'Blocks sunburn for 3 hours.' } ),
	med( 'vinegar_spray', 'Vinegar spray', { w: 0.45, size: 1, uses: 6, use: 2, pain: 0.3, cure: { sting: 1 }, need: [ 'sting' ], needMsg: 'No sting', verb: 'Douse sting', gerund: 'Dousing sting',
		sound: 'pharm_spritz', rarity: 'uncommon', tags: [ 'beach', 'surf', 'plastic' ],
		model: P( 'trigger', { body: 0xf2f2ee, liquid: 0xf0e4b8, head: 0xc0282a, label: L( 'VINEGAR', 'Jellyfish stings · Lifeguard', 0xf2c21a, 0xc0282a, 0xc0282a, 'wave', 'band', { glyphColor: 0xc0282a, size: 0.26 } ) } ),
		desc: 'Stops a jellyfish sting.' } ),

	// ================= packs, sachets, gel =================
	med( 'cold_pack', 'Instant cold pack', { w: 0.15, size: 1, stack: 4, use: 2, pain: 0.3, temp: - 0.6, cure: { heat: 0.4, sting: 0.2, centipede: 0.4, sprain: 0.15, burn: 0.15 }, fx: { cool: 0.5 },
		verb: 'Squeeze', gerund: 'Squeezing', sound: 'pharm_crack', tags: [ 'pharmacy', 'first_aid', 'sports', 'school', 'fire', 'plastic' ],
		model: sachet( [ 0.17, 0.03, 0.12 ], L( 'ICE PACK', 'Instant cold · Squeeze', 0xf2f6fa, 0x1a5ab8, 0x2a8ad6, 'drop', 'band', { glyphColor: 0x2a8ad6, size: 0.26 } ), { matte: true } ),
		desc: 'Cools you. Eases swelling.' } ),
	med( 'heat_pack', 'Hand warmer', { w: 0.05, size: 0.5, stack: 6, use: 2, pain: 0.2, temp: 0.3, fx: { warm: 1 }, verb: 'Shake', gerund: 'Shaking', sound: 'unwrap',
		tags: [ 'pharmacy', 'sports', 'observatory', 'plastic' ],
		model: sachet( [ 0.1, 0.01, 0.07 ], L( 'WARM HANDS', 'Up to 8 hours', 0xe8501a, 0xffffff, 0xf2c21a, 'sun', 'band', { glyphColor: 0xf2e21a, size: 0.26 } ), { matte: true } ),
		desc: 'Warms you for an hour.' } ),
	mat( 'ors_packet', 'ORS packet', { w: 0.03, size: 0.5, stack: 6, tags: [ 'pharmacy', 'medical', 'military', 'paper' ],
		model: sachet( [ 0.1, 0.008, 0.07 ], L( 'ORS', 'Oral rehydration salts · 1 L', 0xffffff, 0x1a6ab8, 0x2a8ad6, 'drop', 'medical', { glyphColor: 0x2a8ad6, size: 0.32 } ), { matte: true } ),
		desc: 'Mix into a bottle of water.' } ),
	drink( 'ors_solution', 'Rehydration drink', { w: 0.55, size: 1, water: 60, kcal: 60, container: 'water_bottle', cure: { heat: 0.4, sick: 0.3 }, tags: [ 'crafted' ],
		model: bottle( { style: 'water', h: 0.21, r: 0.033, clear: true, glass: 0xd8eef5, liquid: 0xe8eef0, liquidClear: false, fill: 0.8, cap: 0x2a6ad6,
			label: L( 'ORS', 'Rehydration', 0xffffff, 0x1a6ab8, 0x2a8ad6, 'drop', 'plain', { glyphColor: 0x2a8ad6, size: 0.3 } ), labelY: 0.3, labelH: 0.22 } ),
		desc: 'Rehydrates. Eases heat and nausea.' } ),
	med( 'glucose_gel', 'Glucose gel', { w: 0.04, size: 0.5, stack: 4, use: 2, energy: 8, stamina: true, kcal: 100, verb: 'Squeeze', gerund: 'Eating gel', sound: 'unwrap',
		tags: [ 'pharmacy', 'sports', 'military', 'first_aid', 'plastic' ],
		model: tube( { len: 0.1, r: 0.014, cap: 0xf28a1a, label: L( 'GLUCO GEL', '15 g fast sugar', 0xf2c21a, 0x8a3a0a, 0xf28a1a, 'bolt', 'band', { glyphColor: 0xe8601a } ) } ),
		desc: 'Quick energy.' } ),

	// ================= bones and sprains =================
	med( 'arm_sling', 'Arm sling', { w: 0.12, size: 1, use: 5, pain: 0.2, sling: true, need: [ 'sprain' ], needMsg: 'No sprain', verb: 'Put on', gerund: 'Putting on sling',
		tags: [ 'pharmacy', 'hospital', 'clinic', 'first_aid', 'cloth' ], model: P( 'sling' ),
		desc: 'A sprain heals three times faster.' } ),
	med( 'elastic_bandage', 'Elastic bandage', { w: 0.08, size: 1, uses: 2, use: 5, pain: 0.2, cure: { sprain: 0.35 }, need: [ 'sprain' ], needMsg: 'No sprain', verb: 'Wrap', gerund: 'Wrapping',
		tags: [ 'pharmacy', 'sports', 'first_aid', 'cloth' ],
		model: { type: 'roll', color: 0xd8b48a, print: 'weave', color2: 0xc8a07a, r: 0.03, w: 0.075 },
		desc: 'Wraps a sprain. Makes a splint.' } ),
	tool( 'crutch', 'Crutch', 'crutch', { w: 1.1, size: 6, rarity: 'uncommon', crutch: true, tags: [ 'hospital', 'clinic', 'pharmacy', 'metal' ], model: P( 'crutch' ),
		desc: 'Hold to walk faster on a broken leg.' } ),
	tool( 'crutch_improvised', 'Improvised crutch', 'crutch', { w: 1.2, size: 6, crutch: true, tags: [ 'crafted', 'wood' ], model: P( 'crutch', { improvised: true } ),
		desc: 'Hold to walk faster on a broken leg.' } ),

	// ================= instruments and kits =================
	tool( 'thermometer', 'Thermometer', 'thermometer', { w: 0.02, size: 0.5, tags: [ 'pharmacy', 'hospital', 'clinic', 'house', 'medicine_cabinet', 'electronics' ],
		model: P( 'thermometer' ), desc: 'Reads your temperature.' } ),
	tool( 'bp_cuff', 'Blood pressure cuff', 'bpcuff', { w: 0.45, size: 2, rarity: 'uncommon', tags: [ 'hospital', 'clinic', 'pharmacy', 'fire' ], model: P( 'bpcuff' ),
		desc: 'Reads blood pressure and pulse.' } ),
	tool( 'stethoscope', 'Stethoscope', 'stethoscope', { w: 0.18, size: 1, rarity: 'uncommon', tags: [ 'hospital', 'clinic', 'fire', 'metal', 'rubber' ], model: P( 'stethoscope' ),
		desc: 'Reads your pulse. Hears through walls.' } ),
	med( 'trauma_kit', 'Trauma kit', { w: 0.9, size: 3, uses: 2, use: 12, bleed: 6, heal: 12, pain: 0.3, infection: 0.2, close: 300, verb: 'Treat wounds', gerund: 'Treating wounds',
		rarity: 'rare', tags: [ 'hospital', 'fire', 'police', 'military' ],
		model: { type: 'kit', style: 'pouch', size: [ 0.24, 0.1, 0.15 ], color: 0x1a1a1a, cross: 0xc0282a, label: L( 'TRAUMA', '', 0xc0282a, 0xffffff, 0xc0282a, null, 'plain', { size: 0.5 } ) },
		desc: 'Stops all bleeding. Cleans and dresses.' } ),
	med( 'surgery_kit', 'Field surgery kit', { w: 1.4, size: 3, uses: 2, use: 25, bleed: 6, heal: 25, pain: 0.2, infection: 0.3, close: 600, verb: 'Operate', gerund: 'Operating',
		rarity: 'epic', tags: [ 'hospital', 'military' ],
		model: { type: 'kit', style: 'case', size: [ 0.3, 0.07, 0.2 ], color: 0x4a5a3a, cross: 0xf2f2f2, label: L( 'SURGICAL', 'Field set', 0xf2f2ee, 0x2a3a1a, 0x4a5a3a, null, 'plain', { size: 0.36 } ) },
		desc: 'Fixes wounds and bones. Skill helps.' } ),
	med( 'defibrillator', 'Defibrillator', { w: 2.2, size: 5, uses: 3, use: 6, heal: 45, verb: 'Shock', gerund: 'Charging', sound: 'pharm_defib', rarity: 'epic',
		tags: [ 'hospital', 'fire', 'school', 'office', 'electronics' ],
		dismantle: [ [ 'circuit_board', 1 ], [ 'electronic_scrap', 2 ], [ 'speaker', 1, 0.5 ] ], dismantleTools: [ 'screwdriver' ],
		model: P( 'aed' ), desc: 'Revives you near death. 3 shocks.' } ),

	// ================= herbs and the mortar =================
	tool( 'mortar_pestle', 'Mortar and pestle', 'grind', { w: 1.4, size: 2, rarity: 'uncommon', tags: [ 'kitchen', 'market', 'farm', 'stone' ], model: P( 'mortar' ),
		desc: 'Grinds herbs into remedies.' } ),
	tool( 'stone_mortar', 'Stone mortar', 'grind', { w: 2.2, size: 3, tags: [ 'crafted', 'stone' ], model: P( 'mortar', { stone: true } ),
		desc: 'Grinds herbs into remedies.' } ),
	food( 'olena_root', 'ʻŌlena root', { w: 0.08, size: 0.5, stack: 6, kcal: 8, spoil: 400, herb: { cure: { cut: 0.08 } }, tags: [ 'herb', 'spice', 'wild', 'farm', 'market', 'local' ],
		model: P( 'root', { kind: 'olena' } ), desc: 'Turmeric. Grind into a poultice.' } ),
	food( 'noni_fruit', 'Noni', { w: 0.2, size: 1, stack: 4, kcal: 40, water: 6, spoil: 140, fun: { unhappy: 8 }, herb: { fx: { regen: 2 } },
		tags: [ 'fruit', 'wild', 'farm', 'market', 'local' ], model: P( 'noni' ), desc: 'A slow heal. Tastes awful.' } ),
	food( 'awa_root', 'ʻAwa root', { w: 0.15, size: 1, stack: 4, kcal: 6, spoil: 600, fun: { stress: - 8 }, herb: { pain: 0.3, fx: { drowsy: 1 } }, rarity: 'uncommon',
		tags: [ 'herb', 'wild', 'farm', 'market', 'local' ], model: P( 'root', { kind: 'awa' } ), desc: 'Chew for pain. Grind for ʻawa.' } ),
	food( 'kukui_nuts', 'Kukui nuts', { w: 0.1, size: 0.5, stack: 9, kcal: 120, sick: 0.5, spoil: 0, tags: [ 'seed', 'wild', 'farm', 'market', 'local', 'oil' ],
		model: P( 'nuts' ), desc: 'Grind for oil. A candle on a stick.' } ),
	food( 'uhaloa_root', 'ʻUhaloa root', { w: 0.05, size: 0.5, stack: 6, kcal: 2, spoil: 500, fun: { unhappy: 2 }, herb: { cure: { cough: 0.2 } },
		tags: [ 'herb', 'wild', 'local' ], model: P( 'root', { kind: 'uhaloa' } ), desc: 'Chew for a cough, or brew it.' } ),
	food( 'popolo_berries', 'Pōpolo berries', { w: 0.05, size: 0.5, stack: 6, kcal: 30, water: 4, spoil: 96, tags: [ 'fruit', 'wild', 'local' ],
		model: P( 'berries' ), desc: 'Grind into a poultice.' } ),
	mat( 'mamaki_leaves', 'Māmaki leaves', { w: 0.03, size: 0.5, stack: 6, tags: [ 'herb', 'wild', 'farm', 'market', 'local' ], model: P( 'leaves', { kind: 'mamaki' } ),
		desc: 'Brew in a mug of water at a fire.' } ),
	med( 'aloe_leaf', 'Aloe leaf', { w: 0.15, size: 1, stack: 4, use: 3, heal: 2, pain: 0.1, cure: { sunburn: 0.35, burn: 0.3 }, verb: 'Apply',
		tags: [ 'herb', 'farm', 'market', 'local' ], model: P( 'leaves', { kind: 'aloe' } ), desc: 'Soothes sunburn and burns.' } ),
	med( 'olena_poultice', 'ʻŌlena poultice', { w: 0.08, size: 0.5, stack: 3, use: 4, heal: 3, infection: 0.12, cure: { cut: 0.45 }, verb: 'Apply', tags: [ 'crafted', 'herb' ],
		model: P( 'poultice', { paste: 0xe0901a } ), desc: 'Fights an infected cut.' } ),
	med( 'popolo_poultice', 'Pōpolo poultice', { w: 0.08, size: 0.5, stack: 3, use: 4, heal: 2, pain: 0.15, cure: { sting: 0.4, centipede: 0.3, burn: 0.3, sunburn: 0.2 },
		verb: 'Apply', tags: [ 'crafted', 'herb' ], model: P( 'poultice', { paste: 0x3a2a4a } ), desc: 'Soothes stings, bites and burns.' } ),
	med( 'kukui_oil', 'Kukui nut oil', { w: 0.12, size: 0.5, uses: 4, use: 3, heal: 2, pain: 0.1, cure: { sunburn: 0.4, burn: 0.35 }, verb: 'Apply',
		tags: [ 'crafted', 'oil', 'glass', 'local' ],
		model: bottle( { style: 'syrup', h: 0.11, r: 0.022, clear: true, glass: 0xe8d8a0, opacity: 0.5, liquid: 0xd8b040, liquidClear: true, fill: 0.75, cap: 0x8a5a2a,
			label: L( 'KUKUI', 'Nut oil', 0xf2e6c8, 0x5a3a1a, 0x8a6a3a, 'leaf', 'plain', { glyphColor: 0x5a7a2a, size: 0.34 } ), labelY: 0.2, labelH: 0.36 } ),
		desc: 'Soothes sunburn and burns.' } ),
	med( 'olena_salve', 'ʻŌlena salve', { w: 0.12, size: 0.5, uses: 4, use: 3, heal: 3, infection: 0.08, cure: { cut: 0.35, sunburn: 0.25, burn: 0.3 }, verb: 'Apply',
		tags: [ 'crafted', 'herb', 'glass' ],
		model: { type: 'jar', r: 0.03, h: 0.055, clear: true, content: 0xe0901a, lid: 0x8a5a2a, label: L( 'ʻŌLENA', 'Salve', 0xf2e6c8, 0x8a4a0a, 0xe0901a, 'leaf', 'plain', { glyphColor: 0xe0901a, size: 0.36 } ) },
		desc: 'Treats cuts, burns and sunburn.' } ),
	drink( 'uhaloa_tea', 'ʻUhaloa tea', { w: 0.62, water: 22, kcal: 2, container: 'camp_mug', cure: { cough: 0.6 }, fun: { stress: - 3 }, tags: [ 'crafted' ],
		model: { type: 'kitchen_mug', liquid: 0x8a6a2a, clear: true }, desc: 'Stops a cough.' } ),
	drink( 'noni_juice', 'Noni juice', { w: 0.6, water: 18, kcal: 40, container: 'canning_jar', portions: 2, fx: { regen: 3 }, fun: { unhappy: 6 }, tags: [ 'crafted' ],
		model: { type: 'jar', r: 0.04, h: 0.13, body: 0x4a2e0e, content: 0x4a2e0e, lid: 0xd4a64a, lidMetal: true, label: L( 'NONI', 'Juice', 0xf2ead0, 0x3a2a0a, 0x8a6a2a, 'fruit', 'plain', { glyphColor: 0xc8cc80, size: 0.34 } ) },
		desc: 'A slow heal. Tastes awful.' } ),
	med( 'ti_leaf_wrap', 'Ti-leaf wrap', { w: 0.06, size: 0.5, stack: 4, use: 5, bleed: 1, dirty: true, heal: 1, pain: 0.1, cure: { heat: 0.15 }, verb: 'Bandage',
		tags: [ 'crafted', 'herb' ], model: P( 'wrap' ), desc: 'A weak bandage. Not sterile.' } ),
] );

// base items that join the pharmacy's rules: a rag is a dirty dressing, sutures and hemostatic gauze close a cut sooner,
// aloe soothes sunburn
const patch = ( id, f ) => { const d = getItem( id ); if ( d?.medical ) Object.assign( d.medical, f ); };
patch( 'bandage_rag', { dirty: true } );
patch( 'suture_kit', { close: 450 } );
patch( 'quikclot', { close: 120 } );
patch( 'aloe_gel', { cure: { sunburn: 0.45, burn: 0.35 } } );

// herbs eaten raw do a little of what their remedy does
addEatHook( ( stack, def, k, use ) => { if ( def.herb && use.S?.medicate ) use.S.medicate( { medical: def.herb } ); } );

// ======================================================================================================================
// where it lies (building loot spots on shelves, counters and floors; the outdoor sites). The medical items tagged
// pharmacy / hospital / clinic join those tables' tag entries; these place the rest, and lean on what fits each place.
// ======================================================================================================================

const add = ( table, entries ) => extendLoot( table, entries );
add( 'pharmacy', [ [ 'sunscreen', 1.2 ], [ 'thermometer', 0.7 ], [ 'bp_cuff', 0.25 ], [ 'crutch', 0.3 ], [ 'cotton_balls', 0.9 ], [ 'ors_packet', 0.8, [ 1, 3 ] ],
	[ 'after_sun', 0.4 ], [ 'cold_pack', 0.4 ], [ 'mortar_pestle', 0.08 ] ] );
add( 'hospital', [ [ 'crutch', 0.9 ], [ 'stethoscope', 0.8 ], [ 'bp_cuff', 0.6 ], [ 'thermometer', 0.6 ], [ 'trauma_shears', 0.6 ], [ 'cotton_balls', 0.5 ], [ 'arm_sling', 0.5 ] ] );
add( 'clinic', [ [ 'thermometer', 0.8 ], [ 'bp_cuff', 0.7 ], [ 'stethoscope', 0.6 ], [ 'crutch', 0.35 ], [ 'cotton_balls', 0.6 ], [ 'arm_sling', 0.4 ] ] );
add( 'house_bathroom', [ [ 'rubbing_alcohol', 0.8 ], [ 'hydrogen_peroxide', 0.8 ], [ 'cotton_balls', 0.8 ], [ 'petroleum_jelly', 0.6 ], [ 'sunscreen', 0.8 ], [ 'after_sun', 0.35 ],
	[ 'thermometer', 0.45 ], [ 'eye_drops', 0.4 ], [ 'cough_syrup', 0.5 ], [ 'sleeping_pills', 0.3 ], [ 'antihistamine', 0.4 ], [ 'hand_sanitizer', 0.4 ], [ 'vitamin_c', 0.4 ],
	[ 'inhaler', 0.2 ], [ 'antidepressants', 0.15 ], [ 'beta_blockers', 0.08 ], [ 'elastic_bandage', 0.3 ], [ 'butterfly_strips', 0.35 ], [ 'burn_cream', 0.2 ] ] );
add( 'medicine_cabinet', [ [ 'rubbing_alcohol', 0.6 ], [ 'hydrogen_peroxide', 0.6 ], [ 'cotton_balls', 0.6 ], [ 'cough_syrup', 0.5 ], [ 'antihistamine', 0.5 ], [ 'eye_drops', 0.4 ],
	[ 'thermometer', 0.4 ], [ 'sleeping_pills', 0.3 ], [ 'inhaler', 0.2 ], [ 'antidepressants', 0.15 ], [ 'vitamin_c', 0.4 ], [ 'butterfly_strips', 0.3 ] ] );
add( 'house_kitchen', [ [ 'mortar_pestle', 0.12 ], [ 'aloe_leaf', 0.12 ] ] );
add( 'house_bedroom', [ [ 'sleeping_pills', 0.2 ], [ 'antidepressants', 0.1 ], [ 'inhaler', 0.08 ] ] );
add( 'house_garage', [ [ 'crutch', 0.08 ], [ 'cold_pack', 0.1 ] ] );
add( 'convenience', [ [ 'sunscreen', 0.6 ], [ 'hand_sanitizer', 0.5 ], [ 'cough_syrup', 0.25 ], [ 'antihistamine', 0.2 ], [ 'cold_pack', 0.15 ], [ 'heat_pack', 0.08 ], [ 'eye_drops', 0.15 ] ] );
add( 'grocery', [ [ 'sunscreen', 0.25 ], [ 'vitamin_c', 0.25 ], [ 'hand_sanitizer', 0.25 ], [ 'rubbing_alcohol', 0.2 ], [ 'cotton_balls', 0.15 ] ] );
add( 'gas_station', [ [ 'sunscreen', 0.25 ], [ 'hand_sanitizer', 0.2 ] ] );
add( 'surf', [ [ 'sunscreen', 1.2 ], [ 'after_sun', 0.6 ], [ 'vinegar_spray', 0.5 ] ] );
add( 'beach', [ [ 'sunscreen', 0.6 ], [ 'after_sun', 0.25 ], [ 'vinegar_spray', 0.3 ] ] );
add( 'sports', [ [ 'cold_pack', 0.8 ], [ 'elastic_bandage', 0.8 ], [ 'glucose_gel', 0.8 ], [ 'ors_packet', 0.4 ], [ 'heat_pack', 0.3 ], [ 'sunscreen', 0.5 ], [ 'inhaler', 0.08 ] ] );
add( 'hotel_room', [ [ 'sunscreen', 0.6 ], [ 'after_sun', 0.4 ], [ 'hand_sanitizer', 0.3 ] ] );
add( 'school', [ [ 'inhaler', 0.4 ], [ 'cold_pack', 0.4 ], [ 'thermometer', 0.3 ], [ 'hand_sanitizer', 0.5 ], [ 'defibrillator', 0.03 ] ] );
add( 'office', [ [ 'hand_sanitizer', 0.5 ], [ 'defibrillator', 0.025 ] ] );
add( 'fire_station', [ [ 'trauma_kit', 0.5 ], [ 'defibrillator', 0.12 ], [ 'cold_pack', 0.6 ], [ 'trauma_shears', 0.5 ], [ 'bp_cuff', 0.3 ], [ 'stethoscope', 0.3 ], [ 'crutch', 0.15 ],
	[ 'burn_cream', 0.5 ] ] );
add( 'police', [ [ 'trauma_kit', 0.15 ], [ 'trauma_shears', 0.3 ], [ 'cold_pack', 0.3 ] ] );
add( 'military', [ [ 'trauma_kit', 0.4 ], [ 'ors_packet', 0.6, [ 1, 3 ] ], [ 'doxycycline', 0.2 ], [ 'glucose_gel', 0.3 ], [ 'trauma_shears', 0.3 ], [ 'surgery_kit', 0.04 ] ] );
add( 'military_locker', [ [ 'ors_packet', 0.5 ], [ 'doxycycline', 0.15 ], [ 'glucose_gel', 0.3 ], [ 'sunscreen', 0.3 ] ] );
add( 'observatory', [ [ 'heat_pack', 0.8, [ 1, 3 ] ], [ 'thermometer', 0.3 ] ] );
add( 'farm', [ [ 'mortar_pestle', 0.25 ], [ 'olena_root', 0.5, [ 1, 3 ] ], [ 'awa_root', 0.25 ], [ 'noni_fruit', 0.45 ], [ 'kukui_nuts', 0.5, [ 2, 6 ] ], [ 'aloe_leaf', 0.45 ],
	[ 'mamaki_leaves', 0.35, [ 2, 4 ] ], [ 'uhaloa_root', 0.25 ], [ 'popolo_berries', 0.25 ] ] );
add( 'market', [ [ 'olena_root', 0.5, [ 1, 3 ] ], [ 'noni_fruit', 0.45 ], [ 'awa_root', 0.25 ], [ 'mamaki_leaves', 0.3 ], [ 'kukui_nuts', 0.35, [ 3, 6 ] ], [ 'aloe_leaf', 0.3 ],
	[ 'mortar_pestle', 0.15 ] ] );
add( 'warehouse', [ [ 'rubbing_alcohol', 0.3 ], [ 'hand_sanitizer', 0.3 ], [ 'ors_packet', 0.25 ] ] );
add( 'restaurant_kitchen', [ [ 'mortar_pestle', 0.2 ], [ 'burn_cream', 0.35 ] ] );
add( 'pawn', [ [ 'stethoscope', 0.15 ] ] );
add( 'street', [ [ 'bandage_dirty', 0.15 ] ] );
add( 'trash', [ [ 'bandage_dirty', 0.3 ] ] );
add( 'zombie_medic', [ [ 'trauma_shears', 0.3 ], [ 'stethoscope', 0.2 ], [ 'thermometer', 0.2 ] ] );
// outdoors
add( 'site_beach_camp', [ [ 'sunscreen', 1.2 ], [ 'after_sun', 0.5 ], [ 'vinegar_spray', 0.4 ] ] );
add( 'site_campsite', [ [ 'heat_pack', 0.2 ], [ 'kukui_nuts', 0.3, [ 2, 5 ] ], [ 'mamaki_leaves', 0.25, [ 1, 3 ] ], [ 'rubbing_alcohol', 0.25 ], [ 'hand_sanitizer', 0.3 ],
	[ 'fire_tinder', 0.4, [ 1, 3 ] ], [ 'cotton_balls', 0.2 ], [ 'olena_root', 0.2 ], [ 'ti_leaf_wrap', 0.2 ], [ 'stone_mortar', 0.12 ] ] );
add( 'site_hiker', [ [ 'sunscreen', 0.6 ], [ 'elastic_bandage', 0.4 ], [ 'glucose_gel', 0.5 ], [ 'ors_packet', 0.4 ], [ 'inhaler', 0.08 ], [ 'olena_root', 0.25 ], [ 'uhaloa_root', 0.25 ],
	[ 'popolo_berries', 0.3 ], [ 'mamaki_leaves', 0.3 ], [ 'awa_root', 0.12 ], [ 'fire_tinder', 0.3 ], [ 'cold_pack', 0.2 ], [ 'butterfly_strips', 0.3 ], [ 'crutch_improvised', 0.08 ] ] );
// (a roadside stand sells the remedy herbs beside the fruit: about one stand in five shows one)
add( 'site_farm_stand', [ [ 'noni_fruit', 1.3, [ 1, 3 ] ], [ 'olena_root', 0.9, [ 1, 3 ] ], [ 'awa_root', 0.4 ], [ 'kukui_nuts', 0.7, [ 3, 6 ] ], [ 'aloe_leaf', 0.75 ],
	[ 'mamaki_leaves', 0.6, [ 2, 4 ] ], [ 'popolo_berries', 0.4 ], [ 'uhaloa_root', 0.3 ] ] );
add( 'site_fishing_spot', [ [ 'vinegar_spray', 0.4 ], [ 'sunscreen', 0.5 ] ] );
add( 'site_fema_camp', [ [ 'ors_packet', 1, [ 1, 3 ] ], [ 'hand_sanitizer', 0.8 ], [ 'thermometer', 0.4 ], [ 'cold_pack', 0.3 ], [ 'doxycycline', 0.15 ], [ 'crutch', 0.2 ],
	[ 'cotton_balls', 0.3 ], [ 'rubbing_alcohol', 0.4 ], [ 'sunscreen', 0.4 ], [ 'bandage_dirty', 0.4 ], [ 'arm_sling', 0.25 ] ] );
add( 'site_military_checkpoint', [ [ 'trauma_kit', 0.25 ], [ 'ors_packet', 0.5 ], [ 'doxycycline', 0.1 ], [ 'glucose_gel', 0.3 ] ] );
add( 'site_heli_crash', [ [ 'trauma_kit', 0.5 ], [ 'surgery_kit', 0.08 ], [ 'defibrillator', 0.05 ] ] );
add( 'site_checkpoint', [ [ 'trauma_shears', 0.3 ], [ 'cold_pack', 0.3 ], [ 'trauma_kit', 0.12 ] ] );
add( 'site_body', [ [ 'bandage_dirty', 0.6 ], [ 'crutch', 0.06 ], [ 'inhaler', 0.08 ], [ 'antidepressants', 0.06 ] ] );
add( 'site_roadside', [ [ 'sunscreen', 0.4 ], [ 'hand_sanitizer', 0.3 ], [ 'antihistamine', 0.2 ], [ 'inhaler', 0.08 ] ] );
add( 'site_bus_stop', [ [ 'hand_sanitizer', 0.2 ], [ 'inhaler', 0.08 ], [ 'cough_syrup', 0.15 ] ] );
add( 'site_crash_car', [ [ 'cold_pack', 0.2 ], [ 'sunscreen', 0.2 ] ] );
add( 'site_picnic', [ [ 'sunscreen', 0.4 ], [ 'hand_sanitizer', 0.2 ] ] );
add( 'site_supply_drop', [ [ 'trauma_kit', 0.4 ], [ 'ors_packet', 0.6, [ 2, 4 ] ], [ 'doxycycline', 0.2 ], [ 'surgery_kit', 0.06 ] ] );
add( 'site_stash', [ [ 'doxycycline', 0.1 ], [ 'trauma_kit', 0.1 ] ] );

// ======================================================================================================================
// mixes
// ======================================================================================================================

// a bottle of strong spirits (several shots), as combos.js reads it
const spirit = ( s, d ) => ( d.drink?.alcohol || 0 ) >= 0.25 && ( d.drink?.portions || 1 ) >= 3;
const DISINFECT = [ 'rubbing_alcohol', 'hydrogen_peroxide', 'iodine', 'antiseptic' ];
// a mug with water in it (a fire boils dirty water clean)
const mugOf = ( min ) => ( s, d ) => { const l = liquidIn( s, d ); return s.id === 'camp_mug' && !! l?.kind && [ 'water', 'dirty' ].includes( l.kind ) && l.litres >= min - 1e-6; };
const emptyJar = ( s, d ) => s.id === 'canning_jar' && ! liquidIn( s, d )?.kind;
const GRIND = { tool: 'grind' };

addCombos( [
	// ---- herbs in the mortar ----
	{ id: 'grind_olena', verb: 'Grind', label: 'Grind ʻōlena poultice', a: GRIND, b: 'olena_root', use: { a: 0, b: 1 }, wear: { a: 0.004 },
		out: [ 'olena_poultice', 1 ], time: 6, sound: 'craft', skill: 'first_aid', xp: 3 },
	{ id: 'grind_popolo', verb: 'Grind', label: 'Grind pōpolo poultice', a: GRIND, b: 'popolo_berries', use: { a: 0, b: 2 }, wear: { a: 0.004 },
		out: [ 'popolo_poultice', 1 ], time: 6, sound: 'craft', skill: 'first_aid', xp: 3 },
	{ id: 'grind_kukui', verb: 'Grind', label: 'Press kukui oil', a: GRIND, b: 'kukui_nuts', use: { a: 0, b: 3 }, wear: { a: 0.006 },
		out: [ 'kukui_oil', 1 ], time: 12, sound: 'hit_wood', skill: 'first_aid', xp: 3 },
	{ id: 'grind_awa', verb: 'Grind', label: 'Grind ʻawa powder', a: GRIND, b: 'awa_root', use: { a: 0, b: 1 }, wear: { a: 0.004 },
		out: [ 'kava_powder', 1 ], time: 10, sound: 'hit_wood', skill: 'cooking', xp: 2 },
	{ id: 'olena_salve', verb: 'Make salve', label: 'Make ʻōlena salve', a: 'olena_root', b: 'kukui_oil', use: { a: 1, b: { qty: 1 } }, tools: [ 'grind' ],
		out: [ 'olena_salve', 1 ], time: 10, sound: 'craft', skill: 'first_aid', xp: 4 },
	{ id: 'noni_juice', verb: 'Mash', label: 'Mash noni juice', a: 'noni_fruit', b: { fn: emptyJar }, use: { a: 2, b: 0 }, tools: [ 'grind' ], time: 8, sound: 'pour',
		skill: 'first_aid', xp: 2, run: ( c ) => c.replace( c.b, 'noni_juice', {} ) },
	{ id: 'brew_uhaloa', verb: 'Brew', label: 'Brew ʻuhaloa tea', a: 'uhaloa_root', b: { fn: mugOf( 0.25 ) }, use: { a: 1, b: 0 }, tools: [ 'grind' ], station: 'fire',
		time: 8, sound: 'pour', skill: 'first_aid', xp: 2, run: ( c ) => c.replace( c.b, 'uhaloa_tea', {} ) },
	{ id: 'brew_mamaki_leaves', verb: 'Brew', label: 'Brew māmaki tea', a: 'mamaki_leaves', b: { fn: mugOf( 0.25 ) }, use: { a: 1, b: 0 }, station: 'fire',
		time: 8, sound: 'pour', skill: 'cooking', xp: 1, run: ( c ) => c.replace( c.b, 'mug_tea', {} ) },
	// kukui nuts threaded on a stick burn one after another: the old Hawaiian candle
	{ id: 'kukui_candle', verb: 'Make candle', label: 'Make kukui candle', a: 'kukui_nuts', b: 'stick', use: { a: 3, b: 1 }, tools: [ 'cut' ],
		out: [ 'candle', 1 ], time: 10, sound: 'craft', skill: 'survival', xp: 3 },

	// ---- dressings: used bandages back into use ----
	{ id: 'boil_dirty_bandages', verb: 'Boil', label: 'Boil {a}', a: 'bandage_dirty', b: { id: 'cooking_pot', liquid: [ 'water', 'dirty', 'sea' ], min: 0.3 },
		use: { a: 'all', b: 0 }, liquid: { side: 'b', kind: 'any', litres: 0.2 }, station: 'fire', time: 10, sound: 'sizzle', skill: 'first_aid', xp: 3,
		run: ( c ) => c.give( 'bandage', c.used.a ) },
	{ id: 'soak_dirty_bandage', verb: 'Sterilize', label: 'Sterilize {b}', a: { any: [ { fn: spirit }, { ids: DISINFECT } ] }, b: 'bandage_dirty',
		out: [ 'bandage', 1 ], time: 4, sound: 'pour', skill: 'first_aid', xp: 2 },
	{ id: 'wash_dirty_bandage', verb: 'Wash', label: 'Wash {a}', a: 'bandage_dirty', b: { liquid: 'water', min: 0.3 }, use: { a: 1, b: 0 },
		liquid: { side: 'b', kind: 'water', litres: 0.3 }, out: [ 'bandage_rag', 1 ], time: 5, sound: 'pour', skill: 'first_aid', xp: 1 },
	{ id: 'sterilize_rag', verb: 'Disinfect', a: { ids: [ 'rubbing_alcohol', 'hydrogen_peroxide', 'hand_sanitizer' ] }, b: 'bandage_rag',
		out: [ 'bandage', 1 ], time: 4, sound: 'pour', skill: 'first_aid', xp: 3 },
	{ id: 'alcohol_swabs', verb: 'Soak', label: 'Make alcohol swabs', a: 'rubbing_alcohol', b: 'cotton_balls', out: [ 'alcohol_wipes', 4 ], time: 4, sound: 'pour', skill: 'first_aid', xp: 1 },
	{ id: 'elastic_splint', verb: 'Make splint', label: 'Make splint', a: 'elastic_bandage', b: 'stick', use: { a: 1, b: 2 },
		out: [ 'splint_improvised', 1 ], time: 8, sound: 'bandage', skill: 'first_aid', xp: 3 },
	{ id: 'rag_crutch', verb: 'Make crutch', label: 'Make crutch', a: 'rags', b: 'long_stick', use: { a: 2, b: 1 }, tools: [ 'cut' ],
		out: [ 'crutch_improvised', 1 ], time: 15, sound: 'hit_wood', skill: 'carpentry', xp: 4 },

	// ---- tinder ----
	{ id: 'jelly_tinder', verb: 'Smear', label: 'Make jelly tinder', a: 'petroleum_jelly', b: 'cotton_balls', out: [ 'fire_tinder', 3 ], time: 4, sound: 'tear', skill: 'survival', xp: 2 },
	{ id: 'sanitizer_tinder', verb: 'Soak', label: 'Make tinder', a: 'hand_sanitizer', b: 'cotton_balls', out: [ 'fire_tinder', 2 ], time: 3, sound: 'spray', skill: 'survival', xp: 1 },
	{ id: 'tinder_fire_kit', verb: 'Make fire kit', label: 'Make fire kit', a: 'fire_tinder', b: 'stick', use: { a: 1, b: 3 }, out: [ 'campfire_kit', 1 ], time: 5, sound: 'hit_wood',
		skill: 'survival', xp: 2 },

	// ---- oral rehydration ----
	{ id: 'mix_ors', verb: 'Mix into', label: 'Mix into {b}', a: 'ors_packet', b: { id: 'water_bottle', liquid: 'water', min: 0.45 }, use: { a: 1, b: 0 }, time: 2, sound: 'pour',
		run: ( c ) => c.replace( c.b, 'ors_solution', {} ) },
] );

// the same mixes in the crafting panel, so the remedies can be found there
addRecipes( [
	R( 'stone_mortar', 'Stone mortar', [ 'stone_mortar', 1 ], [ [ 'stone', 2 ] ], { time: 25, cat: 'tools', skill: 'survival', xp: 6 } ),
	R( 'olena_poultice', 'ʻŌlena poultice', [ 'olena_poultice', 1 ], [ [ 'olena_root', 1 ] ], { tools: [ 'grind' ], time: 6, cat: 'medical', skill: 'first_aid', xp: 3 } ),
	R( 'popolo_poultice', 'Pōpolo poultice', [ 'popolo_poultice', 1 ], [ [ 'popolo_berries', 2 ] ], { tools: [ 'grind' ], time: 6, cat: 'medical', skill: 'first_aid', xp: 3 } ),
	R( 'kukui_oil', 'Kukui nut oil', [ 'kukui_oil', 1 ], [ [ 'kukui_nuts', 3 ] ], { tools: [ 'grind' ], time: 12, cat: 'medical', skill: 'first_aid', xp: 3 } ),
	R( 'olena_salve', 'ʻŌlena salve', [ 'olena_salve', 1 ], [ [ 'olena_root', 1 ], [ 'kukui_oil', 1 ] ], { tools: [ 'grind' ], time: 10, cat: 'medical', skill: 'first_aid', xp: 4 } ),
	R( 'ti_leaf_wrap', 'Ti-leaf wrap', [ 'ti_leaf_wrap', 1 ], [ [ 'ti_leaves', 3 ] ], { time: 6, cat: 'medical', skill: 'first_aid', xp: 2 } ),
	R( 'arm_sling', 'Arm sling', [ 'arm_sling', 1 ], [ [ 'rags', 3 ] ], { time: 8, cat: 'medical', skill: 'first_aid', xp: 3 } ),
	R( 'crutch_improvised', 'Improvised crutch', [ 'crutch_improvised', 1 ], [ [ 'long_stick', 1 ], [ 'rags', 2 ] ], { tools: [ 'cut' ], time: 15, cat: 'medical', skill: 'carpentry', xp: 4 } ),
	R( 'campfire_kit_tinder', 'Fire kit (jelly tinder)', [ 'campfire_kit', 1 ], [ [ 'stick', 3 ], [ 'fire_tinder', 1 ] ], { time: 5, cat: 'survival', skill: 'survival', xp: 2 } ),
] );
