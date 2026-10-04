// Medical supplies: stopping bleeding, splinting, curing bite infections and food poisoning, pain and blood.
// `medical.use` is the time in seconds the treatment takes (interrupted by moving); the other fields feed
// Survival.medicate: heal (hp), blood (ml), bleed (wounds closed), infection (cured 0..1), pain (painkiller
// strength), splint, sick (food poisoning cured), energy, stamina.
// Ours: `medical.verb` (the action label), `medical.purify` (litres of water one use disinfects), `medical.uses`
// (doses in a bottle, stack.data.uses), `unpack` (a kit's contents as [ id, qty ] pairs, opened with "Unpack").
import { defineItems } from '../ItemDB.js';

function med( id, name, o ) {
	return {
		id, name, cat: 'medical', desc: o.desc || '', weight: o.w ?? 0.1, size: o.size ?? 1, stack: o.stack ?? 1,
		rarity: o.rarity || 'common', tags: [ 'medical', ...( o.tags || [] ) ], model: o.model, unpack: o.unpack,
		medical: {
			use: o.use ?? 4, heal: o.heal ?? 0, blood: o.blood ?? 0, bleed: o.bleed ?? 0, infection: o.infection ?? 0, pain: o.pain ?? 0,
			splint: !! o.splint, sick: o.sick ?? 0, energy: o.energy ?? 0, stamina: !! o.stamina, verb: o.verb || 'Use', sound: o.sound || 'bandage',
			purify: o.purify ?? 0, uses: o.uses,
		},
	};
}
const pills = ( color, cap, text, sub, band ) => ( { type: 'pillbottle', color, cap, label: { bg: 0xffffff, fg: 0x111111, text, sub, band, style: 'band', size: 0.26 } } );

defineItems( [
	// ---- bleeding ----
	med( 'bandage_rag', 'Rag bandage', { w: 0.05, stack: 4, size: 1, use: 6, bleed: 1, verb: 'Bandage', tags: [ 'crafted' ],
		model: { type: 'roll', color: 0xd8cfc0, print: 'canvas', color2: 0xb8ae9a, r: 0.026, w: 0.06, tail: true } } ),
	med( 'bandage', 'Sterile bandage', { w: 0.05, stack: 4, size: 1, use: 4, bleed: 1, heal: 4, verb: 'Bandage', tags: [ 'pharmacy', 'hospital', 'first_aid', 'police', 'fire' ],
		model: { type: 'roll', color: 0xf6f4ee, r: 0.028, w: 0.075, wrap: 0x2a6ad6, text: 'STERILE' } } ),
	med( 'gauze', 'Gauze pads', { w: 0.08, stack: 3, size: 1, use: 5, bleed: 2, heal: 2, verb: 'Pack wounds', rarity: 'uncommon', tags: [ 'pharmacy', 'hospital', 'clinic', 'first_aid' ],
		model: { type: 'box', size: [ 0.1, 0.035, 0.1 ], labelAxis: 'y', label: { bg: 0xffffff, fg: 0x1a4a8a, text: 'GAUZE', sub: 'Sterile pads 4×4 in', band: 0x1a4a8a, style: 'medical', glyph: 'cross', glyphColor: 0xc0282a } } } ),
	med( 'tourniquet', 'Tourniquet', { w: 0.08, size: 1, use: 4, bleed: 3, pain: 0, verb: 'Apply tourniquet', rarity: 'rare', tags: [ 'military', 'police', 'first_aid', 'fire' ],
		model: { type: 'parts', kind: 'tourniquet', parts: [ [ 'rbox', [ 0.2, 0.012, 0.04, 0.004 ], 0x1a1a1a ], [ 'cylX', [ 0.006, 0.09 ], 0x2a2a2a, [ 0.02, 0.018, 0 ] ], [ 'box', [ 0.03, 0.01, 0.03 ], 0xc0282a, [ - 0.08, 0.012, 0 ] ] ] } } ),
	med( 'quikclot', 'Hemostatic gauze', { w: 0.05, size: 1, use: 6, bleed: 3, heal: 6, verb: 'Pack wounds', rarity: 'rare', tags: [ 'military', 'police', 'hospital', 'fire' ],
		model: { type: 'bar', size: [ 0.13, 0.015, 0.09 ], matte: true, label: { bg: 0x5a5a3a, fg: 0xf2f2f2, text: 'HEMOSTATIC', sub: 'Z-fold gauze', band: 0xc0282a, style: 'military', size: 0.22 } } } ),
	med( 'suture_kit', 'Suture kit', { w: 0.15, size: 1, use: 14, bleed: 6, heal: 8, pain: 0, verb: 'Stitch wounds', rarity: 'rare', tags: [ 'hospital', 'clinic', 'vet' ],
		model: { type: 'kit', style: 'pouch', size: [ 0.14, 0.03, 0.09 ], color: 0x2a6ad6, cross: 0xffffff } } ),

	// ---- infection, disinfection ----
	med( 'antiseptic', 'Antiseptic spray', { w: 0.15, size: 1, use: 3, infection: 0.12, uses: 5, verb: 'Disinfect', sound: 'spray', tags: [ 'pharmacy', 'hospital', 'first_aid', 'clinic' ],
		model: { type: 'spray', r: 0.022, h: 0.14, cap: 0xf2f2f2, label: { bg: 0xffffff, fg: 0xc0282a, text: 'ANTISEPTIC', sub: 'First aid spray', band: 0xc0282a, glyph: 'cross', glyphColor: 0xc0282a } } } ),
	med( 'alcohol_wipes', 'Alcohol wipes', { w: 0.01, stack: 10, size: 0.5, use: 2, infection: 0.05, verb: 'Clean wounds', tags: [ 'pharmacy', 'hospital', 'first_aid', 'clinic', 'office' ],
		model: { type: 'bar', size: [ 0.05, 0.004, 0.05 ], matte: true, label: { bg: 0xffffff, fg: 0x1a4a8a, text: 'PREP PAD', sub: '70% alcohol', style: 'plain', size: 0.3 } } } ),
	med( 'iodine', 'Iodine tincture', { w: 0.08, size: 0.5, use: 3, infection: 0.18, purify: 1, uses: 10, verb: 'Disinfect', rarity: 'uncommon', tags: [ 'pharmacy', 'hospital', 'military', 'outdoor' ],
		model: { type: 'bottle', style: 'syrup', h: 0.09, r: 0.018, glass: 0x4a1a0a, cap: 0x1a1a1a, label: { bg: 0xf2f2ee, fg: 0x5a1a0a, text: 'IODINE', sub: '2% tincture', style: 'plain', size: 0.34 }, labelY: 0.12, labelH: 0.4 },
		desc: 'Disinfects wounds or water.' } ),
	med( 'purification_tablets', 'Water purification tablets', { w: 0.02, stack: 10, size: 0.5, use: 2, purify: 1, verb: 'Purify water', rarity: 'uncommon', tags: [ 'outdoor', 'military', 'pharmacy', 'sports' ],
		model: { type: 'pillbottle', r: 0.015, h: 0.05, color: 0x6a5a3a, cap: 0x2a2a2a, label: { bg: 0xf2f2ee, fg: 0x1a1a1a, text: 'WAI-PURE', sub: 'Purifies 1 L', style: 'plain', size: 0.3 } },
		desc: 'Purifies 1 L. Not seawater.' } ),
	med( 'antibiotics', 'Amoxicillin', { w: 0.03, stack: 6, size: 0.5, use: 2, infection: 0.4, sick: 0.1, verb: 'Take', sound: 'pills', rarity: 'uncommon', tags: [ 'pharmacy', 'hospital', 'clinic', 'medicine_cabinet' ],
		model: pills( 0xd8782a, 0xf2f2f2, 'AMOXICILLIN', '500 mg · Rx only', 0xd8782a ) } ),
	med( 'antibiotics_strong', 'Ciprofloxacin', { w: 0.03, stack: 6, size: 0.5, use: 2, infection: 0.75, sick: 0.3, verb: 'Take', sound: 'pills', rarity: 'rare', tags: [ 'hospital', 'military', 'clinic' ],
		model: pills( 0xf2f2f2, 0x2a6ad6, 'CIPRO', '750 mg · Rx only', 0x2a6ad6 ) } ),
	med( 'charcoal_tablets', 'Activated charcoal', { w: 0.03, stack: 8, size: 0.5, use: 2, sick: 0.6, verb: 'Take', sound: 'pills', tags: [ 'pharmacy', 'medicine_cabinet', 'first_aid' ],
		model: { type: 'blister', size: [ 0.09, 0.045 ], pills: 0x1a1a1a, nx: 4, nz: 2 },
		desc: 'Treats food poisoning.' } ),

	// ---- pain and stimulants ----
	med( 'painkillers', 'Ibuprofen', { w: 0.03, stack: 10, size: 0.5, use: 2, pain: 0.7, verb: 'Take', sound: 'pills', tags: [ 'pharmacy', 'medicine_cabinet', 'first_aid', 'convenience', 'office' ],
		model: pills( 0xc0282a, 0xf2f2f2, 'IBUPROFEN', '200 mg · Pain reliever', 0xc0282a ),
		desc: 'Relieves pain.' } ),
	med( 'codeine', 'Codeine', { w: 0.03, stack: 8, size: 0.5, use: 2, pain: 1, verb: 'Take', sound: 'pills', rarity: 'rare', tags: [ 'pharmacy', 'hospital' ],
		model: pills( 0xf2f2f2, 0xc0282a, 'CODEINE', '30 mg · Rx only', 0x6a2a8a ),
		desc: 'Strong pain relief.' } ),
	med( 'morphine', 'Morphine auto-injector', { w: 0.05, size: 0.5, use: 2, pain: 1, heal: 10, verb: 'Inject', sound: 'inject', rarity: 'epic', tags: [ 'military', 'hospital' ],
		model: { type: 'syringe', style: 'autoinjector', color: 0x3a5a3a, tip: 0xc0282a, text: 'MORPHINE' },
		desc: 'Removes all pain.' } ),
	med( 'epinephrine', 'Epinephrine pen', { w: 0.05, size: 0.5, use: 1.5, heal: 15, energy: 25, stamina: true, verb: 'Inject', sound: 'inject', rarity: 'rare', tags: [ 'pharmacy', 'hospital', 'school', 'first_aid' ],
		model: { type: 'syringe', style: 'epipen', text: 'EPINEPHRINE' },
		desc: 'Restores health and stamina.' } ),
	med( 'vitamins', 'Multivitamins', { w: 0.08, stack: 20, size: 0.5, use: 2, heal: 3, energy: 4, verb: 'Take', sound: 'pills', tags: [ 'pharmacy', 'medicine_cabinet', 'grocery', 'sports' ],
		model: pills( 0xf2c21a, 0x2a8a3a, 'MULTI-VITAMIN', 'Daily · 100 tablets', 0x2a8a3a ),
		desc: 'Small health boost.' } ),
	med( 'aloe_gel', 'Aloe vera gel', { w: 0.2, size: 1, use: 3, heal: 8, pain: 0.2, verb: 'Apply', tags: [ 'pharmacy', 'convenience', 'beach', 'medicine_cabinet', 'tourist' ],
		model: { type: 'tube', len: 0.16, r: 0.022, cap: 0x2a8a3a, label: { bg: 0x2a8a3a, fg: 0xffffff, text: 'ALOE', sub: 'After-sun gel', band: 0xf2f2f2, glyph: 'leaf', glyphColor: 0xa8e07a } },
		desc: 'Treats burns.' } ),

	// ---- bones and blood ----
	med( 'splint', 'SAM splint', { w: 0.15, size: 2, use: 8, splint: true, pain: 0.2, verb: 'Splint leg', rarity: 'uncommon', tags: [ 'hospital', 'first_aid', 'fire', 'military', 'police' ],
		model: { type: 'splint', color: 0xf28a2a } } ),
	med( 'splint_improvised', 'Improvised splint', { w: 0.5, size: 3, use: 10, splint: true, verb: 'Splint leg', tags: [ 'crafted' ],
		model: { type: 'splint', improvised: true } } ),
	med( 'saline_bag', 'Saline IV bag', { w: 0.55, size: 2, use: 14, blood: 800, heal: 4, verb: 'Start IV', rarity: 'rare', tags: [ 'hospital', 'clinic', 'fire' ],
		model: { type: 'ivbag', color: 0xd8eef5, text: 'NaCl 0.9%' } } ),
	med( 'blood_bag', 'Blood bag (O−)', { w: 0.55, size: 2, use: 16, blood: 2200, heal: 8, verb: 'Transfuse', rarity: 'epic', tags: [ 'hospital' ],
		model: { type: 'ivbag', color: 0x8a1010, text: 'O NEG' } } ),

	// ---- kits (unpacked into their contents) ----
	med( 'first_aid_kit', 'First aid kit', { w: 0.8, size: 4, use: 3, verb: 'Unpack', rarity: 'uncommon', tags: [ 'first_aid', 'office', 'school', 'hotel', 'car', 'fire', 'house' ],
		model: { type: 'kit', style: 'box', size: [ 0.24, 0.08, 0.16 ], color: 0xd02a2a },
		unpack: [ [ 'bandage', 3 ], [ 'gauze', 1 ], [ 'antiseptic', 1 ], [ 'painkillers', 6 ], [ 'alcohol_wipes', 6 ], [ 'aloe_gel', 1 ] ],
		desc: 'Unpack for supplies.' } ),
	med( 'ifak', 'IFAK', { w: 0.6, size: 3, use: 3, verb: 'Unpack', rarity: 'rare', tags: [ 'military', 'police' ],
		model: { type: 'kit', style: 'pouch', size: [ 0.18, 0.08, 0.12 ], color: 0x6b6a45, cross: 0xc0282a },
		unpack: [ [ 'tourniquet', 1 ], [ 'quikclot', 1 ], [ 'bandage', 2 ], [ 'morphine', 1 ], [ 'antibiotics_strong', 2 ] ],
		desc: 'Unpack for supplies.' } ),
] );
