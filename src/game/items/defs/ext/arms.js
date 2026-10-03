// arms (docs/ITEMS_PLAN.md "arms"): improvised and found melee weapons, Hawaiian weapons, gun care and rail-free gun
// fittings, a slingshot and throwing knives, noise distractions and armour.
//   melee: a spiked plank (nails into a plank), a barbed-wire bat, a machete or a kitchen knife taped to a pole, a
//     screwdriver ground to a shiv, a sharpened shovel (it chops), a hockey stick, a pool cue, a rolling pin, a meat
//     cleaver, a sickle, a cricket bat, a plantation bolo knife, a pitchfork, brass knuckles, and a riot shield that
//     shoves and blocks bites from the front;
//   Hawaiian (rare: pawn shops, hotel displays, rich caches): a leiomano shark-tooth club, a pāhoa dagger, a newa war
//     club and a koa spear;
//   gun care: gun oil, a cleaning rod (with oil: a real clean), parts kits for pistols, rifles and shotguns; fittings
//     that need no rail (src/weapons/ops.js `free`): a rifle sling (raises faster, steadier aim), a stock wrap (less
//     kick), a bayonet (the gun's bash becomes a stab), a flashlight or a knife taped onto a long gun;
//   ranged: a slingshot (steel shot or stones, often found again), throwing knives (thrown with the throw key, picked
//     up again); the flare gun is the weapons module's (more of them lie about now);
//   distractions: firecracker strings and a New Year roll (thrown lit: pops that draw the infected for seconds), an
//     alarm clock or a radio thrown to ring or play where it lands, an air horn, a party horn, a can tripwire that
//     rattles (or blasts a horn) when the infected walk through it;
//   armour: arm guards of rolled magazines and tape or kevlar sleeves, worn over the sleeves of a top, a welder's mask
//     (its dark lens cuts a flashbang's glare), a butcher's chainmail glove; and a whetstone (the tool kind
//     'whetstone') and barbed wire.
// Numbers: ../../ext/arms/logic.js. Weapon models: ../../ext/arms/parts.js (drawn by src/weapons/GunModels.js). Thrown
// kinds: ../../ext/arms/throw.js (src/weapons/Throwables.js). Runtime: ../../ext/arms/runtime.js. The tripwire:
// ../../ext/arms/kinds.js. Sounds: ../../ext/arms/sounds.js.
import { defineItems, getItem } from '../../ItemDB.js';
import { extendLoot } from '../../Loot.js';
import { addRecipes, R } from '../../recipes.js';
import { addCombos } from '../../combos.js';
import { addUseActions, addSpoilHook } from '../../hooks.js';
import { provides } from '../../util.js';
import * as L from '../../ext/arms/logic.js';
import { attach, shoot, slingCount, throwThing, horn, tapeOn, untape, guardsOn, guardsOff, takeApart } from '../../ext/arms/runtime.js';
import '../../ext/arms/kinds.js';
// the outdoor sites' tables (site_<kind>) are defined there; imported first so they can be extended here
import '../../sites/tables.js';

const PI = Math.PI;

// ---- def helpers ----------------------------------------------------------------------------------------------------------

const EXTRA = [ 'place', 'noise', 'fun', 'container' ];
function base( id, name, cat, o ) {
	const d = { id, name, cat, desc: o.desc || '', weight: o.w ?? 0.3, size: o.size ?? 1, stack: o.stack ?? 1, rarity: o.rarity || 'common',
		tags: [ 'arms', ...( o.tags || [] ) ], model: o.model };
	for ( const k of EXTRA ) if ( o[ k ] !== undefined ) d[ k ] = o[ k ];
	return d;
}
// melee: [ damage, speed, reach, stamina, kind, twoHanded, wear, tools ]
function melee( id, name, desc, [ damage, speed, reach, stamina, kind, twoHanded, wear, tools = [] ], o ) {
	return { ...base( id, name, 'melee', { ...o, desc } ), melee: { damage, speed, reach, stamina, kind, twoHanded, wear, tools, ...( o.m || {} ) }, model: { type: 'melee', kind: id } };
}
function fitting( id, name, desc, attachment, o ) {
	const d = { ...base( id, name, 'attachment', { ...o, desc, tags: [ 'gun_care', ...( o.tags || [] ) ] } ), attachment, model: { type: 'attachment', kind: o.kind } };
	if ( o.tool ) d.tool = o.tool;
	return d;
}
const tool = ( id, name, kind, o ) => ( { ...base( id, name, 'tool', { ...o, tags: [ 'tool', ...( o.tags || [] ) ] } ), tool: { kind, ...( o.tool || {} ) } } );
const mat = ( id, name, o ) => base( id, name, 'material', { ...o, tags: [ 'material', ...( o.tags || [] ) ] } );
const misc = ( id, name, o ) => base( id, name, 'misc', { ...o, tags: [ 'misc', ...( o.tags || [] ) ] } );
function wear( id, name, slot, o ) {
	return { ...base( id, name, 'clothing', { ...o, tags: [ 'clothing', ...( o.tags || [] ) ] } ),
		clothing: { slot, capacity: 0, insulation: o.ins ?? 0.05, armor: { bite: o.bite ?? 0, bullet: 0 }, waterproof: o.wp ?? 0, visibility: o.vis ?? 0.5, color: o.color, ...( o.shade ? { shade: o.shade } : {} ) } };
}
const throwable = ( id, name, o ) => ( { ...base( id, name, 'throwable', o ), throwable: o.throwable } );

const CRAFTED = [ 'crafted' ];
const HAWAIIAN = [ 'leiomano', 'pahoa', 'newa', 'koa_spear' ];

// ======================================================================================================================
// the items
// ======================================================================================================================

defineItems( [
	// ================= improvised and found melee =================
	melee( 'spiked_plank', 'Spiked plank', 'Two-handed. Blunt, spiked. Wears fast.', [ 50, 0.95, 2.0, 12, 'blunt', true, 0.014 ],
		{ w: 1.8, size: 5, rarity: 'uncommon', tags: [ ...CRAFTED, 'wood', 'improvised' ] } ),
	melee( 'barbed_bat', 'Barbed-wire bat', 'Two-handed. Blunt, barbed.', [ 60, 1.0, 2.0, 11, 'blunt', true, 0.01 ],
		{ w: 1.25, size: 4, rarity: 'uncommon', tags: [ ...CRAFTED, 'wood', 'improvised' ] } ),
	melee( 'machete_spear', 'Machete spear', 'Two-handed. Long reach. Take apart for the machete.', [ 56, 0.95, 2.7, 11, 'spear', true, 0.007, [ 'cut' ] ],
		{ w: 1.5, size: 6, rarity: 'uncommon', tags: [ ...CRAFTED, 'improvised' ] } ),
	melee( 'knife_spear', 'Knife spear', 'Two-handed. Long reach. Spears fish.', [ 44, 1.05, 2.6, 9, 'spear', true, 0.012, [ 'fish' ] ],
		{ w: 0.9, size: 5, rarity: 'common', tags: [ ...CRAFTED, 'improvised' ] } ),
	melee( 'screwdriver_shiv', 'Screwdriver shiv', 'Fast stabs. Still drives screws.', [ 24, 2.3, 1.25, 4, 'blade', false, 0.01, [ 'screwdriver' ] ],
		{ w: 0.15, size: 1, rarity: 'common', tags: [ ...CRAFTED, 'metal', 'improvised' ], m: { stab: true } } ),
	melee( 'sharpened_shovel', 'Sharpened shovel', 'Two-handed. Chops and digs.', [ 58, 0.85, 2.05, 14, 'axe', true, 0.004, [ 'dig', 'chop' ] ],
		{ w: 1.8, size: 5, rarity: 'uncommon', tags: [ ...CRAFTED, 'metal', 'improvised' ] } ),
	melee( 'hockey_stick', 'Hockey stick', 'Two-handed. Blunt. Long and light.', [ 36, 1.15, 2.15, 9, 'blunt', true, 0.01 ],
		{ w: 0.6, size: 5, rarity: 'common', tags: [ 'plastic' ] } ),
	melee( 'pool_cue', 'Pool cue', 'Two-handed. Blunt, fast. Breaks easily.', [ 30, 1.3, 2.3, 7, 'blunt', true, 0.02 ],
		{ w: 0.55, size: 5, rarity: 'common', tags: [ 'wood' ] } ),
	melee( 'rolling_pin', 'Rolling pin', 'Blunt.', [ 28, 1.4, 1.45, 7, 'blunt', false, 0.004 ],
		{ w: 0.9, size: 2, rarity: 'common', tags: [ 'wood', 'kitchen' ] } ),
	melee( 'meat_cleaver', 'Meat cleaver', 'Chops. Cuts and skins game.', [ 42, 1.4, 1.4, 7, 'blade', false, 0.006, [ 'cut', 'chop', 'skin' ] ],
		{ w: 0.7, size: 2, rarity: 'uncommon', tags: [ 'metal', 'kitchen' ] } ),
	melee( 'sickle', 'Sickle', 'Fast hooked blade. Cuts.', [ 36, 1.55, 1.5, 6, 'blade', false, 0.008, [ 'cut' ] ],
		{ w: 0.4, size: 2, rarity: 'common', tags: [ 'metal' ] } ),
	melee( 'cricket_bat', 'Cricket bat', 'Two-handed. Blunt, heavy face.', [ 46, 1.0, 2.0, 11, 'blunt', true, 0.006 ],
		{ w: 1.2, size: 5, rarity: 'rare', tags: [ 'wood' ] } ),
	melee( 'bolo_knife', 'Bolo knife', 'Heavy chopping blade. Cuts, skins game.', [ 48, 1.3, 1.85, 8, 'blade', false, 0.005, [ 'cut', 'chop', 'skin' ] ],
		{ w: 0.7, size: 3, rarity: 'uncommon', tags: [ 'metal', 'local' ] } ),
	melee( 'pitchfork', 'Pitchfork', 'Two-handed. Long reach.', [ 46, 0.95, 2.5, 10, 'spear', true, 0.006 ],
		{ w: 1.8, size: 6, rarity: 'common', tags: [ 'wood' ] } ),
	melee( 'brass_knuckles', 'Brass knuckles', 'Fast punches that stagger.', [ 22, 2.4, 1.25, 4, 'fist', false, 0.001 ],
		{ w: 0.25, size: 1, rarity: 'rare', tags: [ 'metal' ], m: { stagger: 0.7 } } ),
	melee( 'riot_shield', 'Riot shield', 'Blocks bites from the front. Shoves.', [ 14, 1.1, 1.45, 9, 'blunt', false, 0.002 ],
		{ w: 4.2, size: 8, rarity: 'rare', tags: [ 'plastic', 'armour' ], m: { block: true, push: true, stagger: 2.4, cone: 0.95 } } ),

	// ================= Hawaiian =================
	melee( 'leiomano', 'Leiomano', 'Koa club edged with shark teeth. Cuts.', [ 54, 1.3, 1.7, 8, 'blade', false, 0.008, [ 'cut' ] ],
		{ w: 0.9, size: 3, rarity: 'epic', tags: [ 'hawaiian', 'wood', 'local' ] } ),
	melee( 'pahoa', 'Pāhoa', 'Hardwood dagger. Fast stabs.', [ 32, 2.1, 1.4, 4, 'blade', false, 0.008 ],
		{ w: 0.3, size: 1, rarity: 'epic', tags: [ 'hawaiian', 'wood', 'local' ] } ),
	melee( 'newa', 'Newa', 'Hardwood war club. Blunt.', [ 52, 1.2, 1.6, 9, 'blunt', false, 0.002 ],
		{ w: 1.0, size: 3, rarity: 'epic', tags: [ 'hawaiian', 'wood', 'local' ] } ),
	melee( 'koa_spear', 'Koa spear', 'Two-handed. Barbed point, longest reach.', [ 58, 1.0, 2.8, 10, 'spear', true, 0.004, [ 'fish' ] ],
		{ w: 1.6, size: 8, rarity: 'epic', tags: [ 'hawaiian', 'wood', 'local' ] } ),

	// ================= gun care =================
	tool( 'gun_oil', 'Gun oil', 'gunoil', { w: 0.12, size: 0.5, rarity: 'uncommon', tags: [ 'gun_care', 'oil' ], tool: { uses: 6 },
		model: { type: 'bottle', style: 'syrup', h: 0.12, r: 0.022, glass: 0x1c1c1e, cap: 0xd8b04a, label: { bg: 0x1c1c1e, fg: 0xd8b04a, text: 'GUN OIL', sub: 'MAKANI · 4 fl oz', style: 'band', band: 0xd8b04a, subColor: 0x1c1c1e }, labelY: 0.2, labelH: 0.5 },
		desc: 'Drag onto a gun or blade. Clears jams.' } ),
	tool( 'cleaning_rod', 'Cleaning rod', 'cleaning_rod', { w: 0.2, size: 2, rarity: 'uncommon', tags: [ 'gun_care', 'metal' ], model: { type: 'arms_rod' },
		desc: 'With gun oil: cleans a gun well.' } ),
	mat( 'parts_pistol', 'Pistol parts kit', { w: 0.3, size: 1, rarity: 'rare', tags: [ 'gun_care', 'spring', 'metal' ], model: { type: 'arms_partskit', cls: 'pistol' },
		desc: 'Repairs a pistol (screwdriver).' } ),
	mat( 'parts_rifle', 'Rifle parts kit', { w: 0.5, size: 1, rarity: 'rare', tags: [ 'gun_care', 'spring', 'metal' ], model: { type: 'arms_partskit', cls: 'rifle' },
		desc: 'Repairs a rifle or SMG (screwdriver).' } ),
	mat( 'parts_shotgun', 'Shotgun parts kit', { w: 0.45, size: 1, rarity: 'rare', tags: [ 'gun_care', 'spring', 'metal' ], model: { type: 'arms_partskit', cls: 'shotgun' },
		desc: 'Repairs a shotgun (screwdriver).' } ),

	// ================= rail-free fittings =================
	fitting( 'rifle_sling', 'Rifle sling', 'Raises faster, steadier aim. Long guns.',
		{ slot: 'sling', free: true, fits: L.LONG, mods: { raise: 0.75, sway: 0.88 } }, { w: 0.18, rarity: 'uncommon', kind: 'arms_sling', tags: [ 'cloth' ] } ),
	fitting( 'stock_wrap', 'Stock wrap', 'Less recoil. Long guns.',
		{ slot: 'stock', free: true, fits: L.LONG, mods: { recoil: 0.88 } }, { w: 0.12, rarity: 'uncommon', kind: 'arms_wrap', tags: [ 'rubber' ] } ),
	fitting( 'taped_flashlight', 'Taped-on flashlight', 'Gun light (L). Takes AA batteries.',
		{ slot: 'light', free: [ 'smg', 'rifle', 'shotgun', 'sniper', 'lmg' ], fits: [ 'pistol', ...L.LONG ], light: { range: 36, angle: 0.42, color: 0xfff0d8 } },
		{ w: 0.32, rarity: 'common', kind: 'arms_tapedlight', tags: CRAFTED, tool: { battery: 8 } } ),
	fitting( 'bayonet', 'Bayonet', 'On a rifle or shotgun, the bash stabs.',
		{ slot: 'bayonet', free: true, fits: L.BAYONET_FITS, stab: 52, reach: 0.45, wear: 0.003 },
		{ w: 0.4, rarity: 'rare', kind: 'arms_bayonet', tags: [ 'metal' ], tool: { kind: 'cut', provides: [ 'open_can' ] } } ),
	fitting( 'taped_bayonet', 'Taped knife bayonet', 'On a rifle or shotgun, the bash stabs.',
		{ slot: 'bayonet', free: true, fits: L.BAYONET_FITS, stab: 38, reach: 0.4, wear: 0.01 }, { w: 0.3, rarity: 'common', kind: 'arms_tapebay', tags: CRAFTED } ),

	// ================= ranged =================
	tool( 'slingshot', 'Slingshot', 'slingshot', { w: 0.25, size: 2, rarity: 'uncommon', tags: [ 'rubber', 'wood' ], model: { type: 'arms_slingshot' },
		desc: 'Fires steel shot or stones. Quiet.' } ),
	mat( 'steel_shot', 'Steel shot', { w: 0.008, size: 0.5, stack: 50, rarity: 'common', tags: [ 'metal', 'sling_ammo' ], model: { type: 'arms_shot' },
		desc: 'Slingshot ammo. Often found again.' } ),
	throwable( 'throwing_knife', 'Throwing knives', { w: 0.15, size: 0.5, stack: 6, rarity: 'uncommon', tags: [ 'metal' ],
		throwable: { kind: 'arms_knife', fuse: 0, radius: 0.5, damage: L.KNIFE_THROW.dmg, speed: L.KNIFE_THROW.speed, up: L.KNIFE_THROW.up },
		model: { type: 'throwable', kind: 'throwing_knife', lay: PI / 2 }, desc: 'Throw (G). Silent. Pick them up again.' } ),

	// ================= distractions =================
	throwable( 'firecracker_string', 'Firecracker string', { w: 0.05, size: 0.5, stack: 5, rarity: 'common', tags: [ 'paper', 'party', 'distraction' ],
		throwable: { kind: 'arms_firecracker', fuse: L.FIRECRACKER.firecracker_string.fuse, radius: L.FIRECRACKER.firecracker_string.noise, damage: 0, speed: 14 },
		model: { type: 'throwable', kind: 'firecracker_string', lay: PI / 2 }, desc: 'Throw lit. Pops for seconds. Draws them.' } ),
	throwable( 'firecracker_roll', 'Firecracker roll', { w: 0.45, size: 1, stack: 2, rarity: 'uncommon', tags: [ 'paper', 'party', 'distraction' ],
		throwable: { kind: 'arms_firecracker', fuse: L.FIRECRACKER.firecracker_roll.fuse, radius: L.FIRECRACKER.firecracker_roll.noise, damage: 0, speed: 11 },
		model: { type: 'throwable', kind: 'firecracker_roll' }, desc: 'Throw lit. Pops loud for long.' } ),
	tool( 'air_horn', 'Air horn', 'airhorn', { w: 0.3, size: 1, rarity: 'uncommon', tags: [ 'distraction', 'plastic' ], tool: { uses: 12 }, noise: { radius: L.HORN.air_horn.radius },
		model: { type: 'arms_airhorn' }, desc: 'Very loud blast. Rig to a tripwire.' } ),
	tool( 'party_horn', 'Party horn', 'partyhorn', { w: 0.02, size: 0.5, stack: 5, rarity: 'common', tags: [ 'paper', 'party', 'distraction' ], noise: { radius: L.HORN.party_horn.radius },
		fun: { boredom: - 4, unhappy: - 1 }, model: { type: 'arms_partyhorn' }, desc: 'A squawk. Draws them a little.' } ),
	tool( 'can_tripwire', 'Can tripwire', 'tripwire', { w: 0.5, size: 2, rarity: 'common', tags: [ ...CRAFTED, 'distraction', 'metal' ],
		place: { kind: 'arms_tripwire', verb: 'Set', time: 4 }, noise: { radius: L.TRIP.noise }, model: { type: 'arms_tripkit' },
		desc: 'Set across a path. Rattles when crossed.' } ),

	// ================= armour =================
	misc( 'magazine_guards', 'Magazine arm guards', { w: 0.4, size: 2, rarity: 'common', tags: [ ...CRAFTED, 'paper', 'armour' ], model: { type: 'arms_guards', kind: 'magazine' },
		desc: 'Tape onto a top. Bite protection.' } ),
	misc( 'kevlar_sleeves', 'Kevlar arm sleeves', { w: 0.3, size: 1, rarity: 'rare', tags: [ 'cloth', 'armour' ], model: { type: 'arms_guards', kind: 'kevlar' },
		desc: 'Pull onto a top. Bite protection.' } ),
	wear( 'welder_mask', 'Welder\'s mask', 'face', { w: 0.9, size: 3, rarity: 'uncommon', tags: [ 'armour', 'plastic' ], bite: 0.35, ins: 0.08, vis: 0.6, color: 0x2a3326, shade: 0.85,
		model: { type: 'arms_welder' }, desc: 'Face armour. Dark lens cuts glare.' } ),
	wear( 'chainmail_glove', 'Chainmail glove', 'hands', { w: 0.25, size: 1, rarity: 'rare', tags: [ 'armour', 'metal' ], bite: 0.45, ins: 0, vis: 0.5, color: 0xa4a9ae,
		model: { type: 'arms_mailglove' }, desc: 'Butcher\'s glove. Stops teeth.' } ),

	// ================= tools and materials =================
	tool( 'whetstone', 'Whetstone', 'whetstone', { w: 0.35, size: 1, rarity: 'common', tags: [ 'stone' ], model: { type: 'arms_whetstone' },
		desc: 'Sharpens blades. Grinds a shiv.' } ),
	mat( 'barbed_wire', 'Barbed wire', { w: 0.6, size: 2, stack: 3, rarity: 'common', tags: [ 'wire', 'metal' ], model: { type: 'arms_barbwire' },
		desc: 'Wrap a bat with it.' } ),
] );

// ======================================================================================================================
// where they lie: building loot spots (shelves, counters and floors you can see) and the outdoor sites
// ======================================================================================================================

const put = ( table, entries ) => extendLoot( table, entries );
const I = ( ids, w ) => ( { ids, w } );
const GUN_CARE = [ 'gun_oil', 'cleaning_rod' ];
const PARTS = [ 'parts_pistol', 'parts_rifle', 'parts_shotgun' ];

// homes
put( 'house_kitchen', [ [ 'rolling_pin', 0.5 ], [ 'meat_cleaver', 0.12 ], [ 'whetstone', 0.08 ] ] );
put( 'house_living', [ [ 'party_horn', 0.25 ], [ 'firecracker_string', 0.12 ], [ 'pool_cue', 0.03 ], I( HAWAIIAN, 0.02 ) ] );
put( 'house_garage', [ [ 'hockey_stick', 0.15 ], [ 'whetstone', 0.3 ], [ 'barbed_wire', 0.15 ], [ 'pitchfork', 0.1 ], [ 'sickle', 0.15 ], [ 'welder_mask', 0.08 ],
	[ 'gun_oil', 0.12 ], [ 'cleaning_rod', 0.05 ], [ 'slingshot', 0.06 ], [ 'air_horn', 0.05 ], [ 'cricket_bat', 0.03 ] ] );
// shops
put( 'hardware', [ [ 'whetstone', 0.8 ], [ 'barbed_wire', 0.6 ], [ 'sickle', 0.4 ], [ 'pitchfork', 0.2 ], [ 'welder_mask', 0.25 ], [ 'gun_oil', 0.15 ], [ 'air_horn', 0.15 ],
	[ 'slingshot', 0.15 ], [ 'steel_shot', 0.15, [ 10, 30 ] ] ] );
put( 'sports', [ [ 'hockey_stick', 0.6 ], [ 'cricket_bat', 0.2 ], [ 'slingshot', 0.5 ], [ 'steel_shot', 0.6, [ 15, 40 ] ], [ 'throwing_knife', 0.3, [ 2, 4 ] ], [ 'air_horn', 0.4 ],
	[ 'rifle_sling', 0.2 ], [ 'stock_wrap', 0.15 ], [ 'gun_oil', 0.3 ], [ 'cleaning_rod', 0.15 ], [ 'whetstone', 0.3 ], [ 'flare_gun', 0.1 ] ] );
put( 'gunstore', [ [ 'gun_oil', 1.2 ], [ 'cleaning_rod', 0.8 ], [ 'parts_pistol', 0.35 ], [ 'parts_rifle', 0.3 ], [ 'parts_shotgun', 0.3 ], [ 'rifle_sling', 0.8 ], [ 'stock_wrap', 0.6 ],
	[ 'bayonet', 0.25 ], [ 'throwing_knife', 0.25, [ 2, 4 ] ], [ 'slingshot', 0.15 ], [ 'steel_shot', 0.3, [ 15, 40 ] ] ] );
put( 'pawn', [ I( HAWAIIAN, 0.35 ), [ 'brass_knuckles', 0.25 ], [ 'bayonet', 0.15 ], [ 'cricket_bat', 0.1 ], [ 'throwing_knife', 0.15, [ 2, 3 ] ], [ 'riot_shield', 0.04 ],
	[ 'rifle_sling', 0.15 ], [ 'parts_pistol', 0.1 ], [ 'chainmail_glove', 0.05 ], [ 'kevlar_sleeves', 0.05 ] ] );
put( 'market', [ [ 'meat_cleaver', 0.3 ], [ 'bolo_knife', 0.3 ], [ 'chainmail_glove', 0.12 ], [ 'whetstone', 0.15 ], [ 'firecracker_string', 0.3, [ 1, 3 ] ], [ 'firecracker_roll', 0.1 ] ] );
put( 'convenience', [ [ 'firecracker_string', 0.6, [ 1, 3 ] ], [ 'party_horn', 0.4, [ 1, 3 ] ] ] );
put( 'gas_station', [ [ 'firecracker_string', 0.4, [ 1, 2 ] ], [ 'party_horn', 0.15 ] ] );
put( 'grocery', [ [ 'party_horn', 0.2, [ 1, 3 ] ], [ 'firecracker_string', 0.25 ] ] );
put( 'surf', [ [ 'air_horn', 0.25 ], [ 'flare_gun', 0.15 ], [ 'ammo_flare', 0.25 ] ] );
put( 'garage_shop', [ [ 'welder_mask', 0.5 ] ] );
put( 'restaurant_kitchen', [ [ 'meat_cleaver', 0.8 ], [ 'rolling_pin', 0.6 ], [ 'chainmail_glove', 0.15 ], [ 'whetstone', 0.3 ] ] );
put( 'bar', [ [ 'pool_cue', 1.2 ], [ 'brass_knuckles', 0.08 ], [ 'party_horn', 0.2 ] ] );
// services
put( 'police', [ [ 'riot_shield', 0.25 ], [ 'kevlar_sleeves', 0.2 ], [ 'gun_oil', 0.4 ], [ 'cleaning_rod', 0.25 ], [ 'parts_pistol', 0.2 ], [ 'parts_shotgun', 0.12 ] ] );
put( 'police_locker', [ [ 'kevlar_sleeves', 0.3 ], [ 'riot_shield', 0.08 ] ] );
put( 'military', [ [ 'bayonet', 0.3 ], [ 'gun_oil', 0.5 ], [ 'cleaning_rod', 0.4 ], [ 'parts_rifle', 0.3 ], [ 'rifle_sling', 0.4 ], [ 'kevlar_sleeves', 0.1 ] ] );
put( 'military_armory', [ [ 'parts_rifle', 0.5 ], [ 'bayonet', 0.4 ], [ 'rifle_sling', 0.5 ], [ 'gun_oil', 0.5 ] ] );
put( 'military_locker', [ [ 'rifle_sling', 0.3 ], [ 'gun_oil', 0.3 ] ] );
put( 'fire_station', [ [ 'air_horn', 0.4 ] ] );
put( 'hangar', [ [ 'air_horn', 0.3 ], [ 'welder_mask', 0.2 ] ] );
// offices, schools, public buildings
put( 'school', [ [ 'hockey_stick', 0.2 ], [ 'party_horn', 0.3, [ 1, 3 ] ], [ 'slingshot', 0.15 ], [ 'cricket_bat', 0.05 ] ] );
put( 'hotel_room', [ I( HAWAIIAN, 0.04 ), [ 'party_horn', 0.15 ] ] );
put( 'church', [ I( HAWAIIAN, 0.03 ) ] );
put( 'office', [ I( HAWAIIAN, 0.02 ), [ 'party_horn', 0.1 ] ] );
put( 'warehouse', [ [ 'barbed_wire', 0.4 ], [ 'whetstone', 0.2 ], [ 'firecracker_roll', 0.12 ], [ 'firecracker_string', 0.25, [ 1, 4 ] ] ] );
put( 'farm', [ [ 'sickle', 0.8 ], [ 'pitchfork', 0.6 ], [ 'bolo_knife', 0.4 ], [ 'barbed_wire', 0.6 ], [ 'whetstone', 0.4 ], [ 'slingshot', 0.15 ], [ 'sharpened_shovel', 0.05 ] ] );
put( 'street', [ [ 'spiked_plank', 0.05 ], [ 'party_horn', 0.1 ] ] );
put( 'trash', [ [ 'party_horn', 0.1 ] ] );

// the outdoor sites (ground loot you can always see)
put( 'site_military_checkpoint', [ [ 'barbed_wire', 0.8 ], [ 'bayonet', 0.2 ], [ 'gun_oil', 0.3 ], [ 'cleaning_rod', 0.2 ], [ 'parts_rifle', 0.15 ], [ 'rifle_sling', 0.3 ] ] );
put( 'site_checkpoint', [ [ 'riot_shield', 0.15 ], [ 'kevlar_sleeves', 0.1 ], [ 'air_horn', 0.15 ] ] );
put( 'site_body', [ [ 'spiked_plank', 0.15 ], [ 'barbed_bat', 0.08 ], [ 'machete_spear', 0.06 ], [ 'knife_spear', 0.08 ], [ 'screwdriver_shiv', 0.12 ], [ 'magazine_guards', 0.15 ],
	[ 'slingshot', 0.06 ], [ 'throwing_knife', 0.06, [ 1, 3 ] ], [ 'brass_knuckles', 0.04 ], [ 'firecracker_string', 0.08 ], [ 'hockey_stick', 0.08 ], [ 'sharpened_shovel', 0.04 ] ] );
put( 'site_hiker', [ [ 'slingshot', 0.08 ], [ 'whetstone', 0.12 ], [ 'air_horn', 0.06 ], [ 'throwing_knife', 0.03 ] ] );
put( 'site_campsite', [ [ 'whetstone', 0.3 ], [ 'slingshot', 0.1 ], [ 'steel_shot', 0.1, [ 10, 25 ] ], [ 'firecracker_string', 0.15 ], [ 'bolo_knife', 0.1 ], [ 'machete_spear', 0.05 ],
	[ 'can_tripwire', 0.2 ], [ 'knife_spear', 0.08 ] ] );
put( 'site_roadside', [ [ 'party_horn', 0.1 ], [ 'firecracker_string', 0.1 ], [ 'hockey_stick', 0.05 ] ] );
put( 'site_heli_crash', [ [ 'rifle_sling', 0.4 ], [ 'bayonet', 0.2 ], [ 'gun_oil', 0.4 ], [ 'parts_rifle', 0.3 ], [ 'cleaning_rod', 0.3 ] ] );
put( 'site_fema_camp', [ [ 'air_horn', 0.15 ], [ 'riot_shield', 0.05 ], [ 'kevlar_sleeves', 0.05 ] ] );
put( 'site_farm_stand', [ [ 'sickle', 0.3 ], [ 'bolo_knife', 0.2 ], [ 'whetstone', 0.15 ] ] );
put( 'site_fishing_spot', [ [ 'air_horn', 0.25 ], [ 'flare_gun', 0.08 ], [ 'ammo_flare', 0.15 ], [ 'whetstone', 0.15 ] ] );
put( 'site_beach_camp', [ [ 'firecracker_string', 0.12 ], [ 'party_horn', 0.12 ] ] );
put( 'site_picnic', [ [ 'party_horn', 0.3 ], [ 'firecracker_string', 0.15 ] ] );
put( 'site_bus_stop', [ [ 'party_horn', 0.1 ] ] );
put( 'site_crash_car', [ [ 'hockey_stick', 0.06 ] ] );
put( 'site_supply_drop', [ [ 'gun_oil', 0.3 ], [ 'parts_rifle', 0.15 ], [ 'rifle_sling', 0.2 ] ] );
put( 'site_stash', [ [ 'parts_pistol', 0.2 ], [ 'gun_oil', 0.3 ], [ 'throwing_knife', 0.1, [ 2, 4 ] ], [ 'bayonet', 0.05 ] ] );
put( 'site_stash_rich', [ I( HAWAIIAN, 0.3 ), [ 'parts_rifle', 0.3 ], [ 'bayonet', 0.15 ], [ 'riot_shield', 0.05 ] ] );

// ======================================================================================================================
// recipes (the crafting panel) and combos (drag one thing onto another)
// ======================================================================================================================

addRecipes( [
	R( 'arms_spiked_plank', 'Spiked plank', [ 'spiked_plank', 1 ], [ [ 'planks', 1 ], [ 'nails', 8 ] ], { tools: [ 'hammer' ], time: 12, cat: 'weapons', skill: 'carpentry' } ),
	R( 'arms_barbed_bat', 'Barbed-wire bat', [ 'barbed_bat', 1 ], [ [ 'baseball_bat', 1 ], [ 'barbed_wire', 1 ] ], { time: 10, cat: 'weapons', skill: 'carpentry' } ),
	R( 'arms_machete_spear', 'Machete spear', [ 'machete_spear', 1 ], [ [ 'machete', 1 ], [ 'long_stick', 1 ] ], { tools: [ 'tape' ], time: 10, cat: 'weapons', skill: 'carpentry' } ),
	R( 'arms_knife_spear', 'Knife spear', [ 'knife_spear', 1 ], [ [ 'kitchen_knife', 1 ], [ 'long_stick', 1 ] ], { tools: [ 'tape' ], time: 9, cat: 'weapons', skill: 'carpentry' } ),
	R( 'arms_can_tripwire', 'Can tripwire', [ 'can_tripwire', 1 ], [ [ 'empty_can', 4 ], [ 'wire', 1 ] ], { time: 10, cat: 'tools', skill: 'survival' } ),
	R( 'arms_paper_guards', 'Arm guards (newspaper)', [ 'magazine_guards', 1 ], [ [ 'newspaper', 3 ] ], { tools: [ 'tape' ], time: 10, cat: 'survival', skill: 'tailoring' } ),
	R( 'arms_stock_wrap', 'Stock wrap', [ 'stock_wrap', 1 ], [ [ 'paracord', 2 ] ], { tools: [ 'cut' ], time: 12, cat: 'weapons', skill: 'tailoring' } ),
	R( 'arms_slingshot', 'Slingshot', [ 'slingshot', 1 ], [ [ 'stick', 1 ], [ 'rubber_hose', 1 ], [ 'leather', 1 ] ], { tools: [ 'cut' ], time: 15, cat: 'weapons', skill: 'survival' } ),
] );

const gunWith = ( fn ) => ( { cat: 'firearm', fn: ( s, d ) => fn( s, d ) } );
const fitsFree = ( id ) => ( s, d ) => {
	const a = getItem( id )?.attachment, f = d.firearm;
	return !! a && a.fits.includes( f.cls ) && ( a.free === true || a.free?.includes( f.cls ) || ( f.rails || [] ).includes( a.slot ) );
};
const edged = ( s, d ) => ( !! d.melee && ( d.melee.kind === 'blade' || d.melee.kind === 'axe' || d.melee.kind === 'spear' ) ) || !! d.attachment?.stab;
const sharpener = { any: [ { tool: 'whetstone' }, 'stone' ] };
const stoneSlow = ( t ) => ( c ) => c.a.id === 'stone' ? t * 1.6 : t;
const unjam = ( c ) => { if ( c.b.data?.jam ) { c.b.data.jam = false; c.toast( 'Jam cleared', 'good' ); } };
const torso = ( s, d ) => d.cat === 'clothing' && d.clothing.slot === 'torso';

addCombos( [
	// ---- making weapons ----
	{ id: 'arms_spiked_plank', verb: 'Nail', label: 'Make spiked plank', a: 'nails', b: 'planks', use: { a: 8, b: 1 }, tools: [ 'hammer' ],
		out: [ 'spiked_plank', 1 ], time: 12, sound: 'hit_wood', skill: 'carpentry', noise: { radius: 25 } },
	{ id: 'arms_barbed_bat', verb: 'Wrap', label: 'Make barbed-wire bat', a: 'barbed_wire', b: 'baseball_bat', use: { a: 1, b: 1 },
		out: [ 'barbed_bat', 1 ], time: 10, sound: 'craft', skill: 'carpentry',
		run: ( c ) => {
			if ( c.made[ 0 ] ) c.made[ 0 ].cond = c.b.cond;
			// bare hands on barbed wire: cut palms (gloves of any kind save them)
			if ( ! c.inv.equip?.hands && c.survival?.hurt ) { c.survival.hurt( 4, 'melee', { cause: 'barbed wire' } ); c.toast( 'Cut your hands', 'warn' ); }
		} },
	{ id: 'arms_machete_spear', verb: 'Lash', label: 'Make machete spear', a: 'machete', b: 'long_stick', use: { a: 1, b: 1 }, tools: [ 'tape' ],
		out: [ 'machete_spear', 1 ], time: 10, sound: 'tear', skill: 'carpentry',
		run: ( c ) => { if ( c.made[ 0 ] ) c.made[ 0 ].cond = c.a.cond; } },
	{ id: 'arms_knife_spear', verb: 'Lash', label: 'Make knife spear', a: { fn: ( s, d ) => L.smallBlade( d ) }, b: 'long_stick', use: { a: 1, b: 1 }, tools: [ 'tape' ],
		out: [ 'knife_spear', 1 ], time: 9, sound: 'tear', skill: 'carpentry',
		run: ( c ) => { const s = c.made[ 0 ]; if ( s ) { s.cond = c.a.cond; s.data.knife = c.a.id; } } },
	{ id: 'arms_shiv', verb: 'Grind', label: 'Grind into a shiv', a: sharpener, b: 'screwdriver', use: { a: 0, b: 0 }, wear: { a: 0.03 },
		time: stoneSlow( 9 ), sound: 'hit_metal', skill: 'maintenance', run: ( c ) => c.replace( c.b, 'screwdriver_shiv', {} ) },
	{ id: 'arms_sharpen_shovel', verb: 'Sharpen', label: 'Sharpen shovel', a: sharpener, b: 'shovel', use: { a: 0, b: 0 }, wear: { a: 0.03 },
		time: stoneSlow( 14 ), sound: 'hit_metal', skill: 'maintenance', run: ( c ) => c.replace( c.b, 'sharpened_shovel', {} ) },

	// ---- edges and guns ----
	{ id: 'arms_whet_blade', verb: 'Sharpen', a: { tool: 'whetstone' }, b: { fn: edged }, use: { a: 0, b: 0 }, wear: { a: 0.01 },
		repair: { b: L.CARE.whet.repair, max: L.CARE.whet.max }, time: L.CARE.whet.time, sound: 'hit_metal', skill: 'maintenance' },
	{ id: 'arms_oil_gun', verb: 'Oil', a: { tool: 'gunoil' }, b: { cat: 'firearm' }, use: { a: 1, b: 0 },
		repair: { b: L.CARE.oil.repair, max: L.CARE.oil.max }, time: L.CARE.oil.time, sound: 'pour', skill: 'maintenance', run: unjam },
	{ id: 'arms_oil_blade', verb: 'Oil', a: { tool: 'gunoil' }, b: { fn: edged }, use: { a: 1, b: 0 },
		repair: { b: L.CARE.blade.repair, max: L.CARE.blade.max }, time: L.CARE.blade.time, sound: 'pour', skill: 'maintenance' },
	{ id: 'arms_clean_bore', verb: 'Clean', label: 'Clean {b} (oiled)', a: 'cleaning_rod', b: { cat: 'firearm' }, use: { a: 0, b: 0 }, wear: { a: 0.015 },
		repair: { b: L.CARE.bore.repair, max: L.CARE.bore.max }, time: L.CARE.bore.time, sound: 'craft', skill: 'maintenance', xp: 6,
		check: ( c ) => c.inv.find( ( s ) => provides( s, 'gunoil' ) ) ? null : 'Need gun oil',
		run: ( c ) => { const oil = c.inv.find( ( s ) => provides( s, 'gunoil' ) ); if ( oil ) c.use?.useUp?.( oil, 1 ); unjam( c ); } },
	...Object.keys( L.KIT_CLASSES ).map( ( kit ) => ( { id: 'arms_kit_' + kit.slice( 6 ), verb: 'Repair', label: 'Repair {b} (parts)', a: kit, b: gunWith( ( s, d ) => L.kitFits( kit, d ) ),
		use: { a: 1, b: 0 }, tools: [ 'screwdriver' ], repair: { b: L.CARE.kit.repair, max: L.CARE.kit.max }, time: L.CARE.kit.time, sound: 'craft', skill: 'maintenance', xp: 8, run: unjam } ) ),

	// ---- taped onto a gun ----
	{ id: 'arms_tape_light', verb: 'Tape on', label: 'Tape onto {b}', a: { tool: 'flashlight' }, b: gunWith( ( s, d ) => fitsFree( 'taped_flashlight' )( s, d ) && ! L.attIn( s, 'light' ) ),
		use: { a: 1, b: 0 }, tools: [ 'tape' ], time: 6, sound: 'tear', skill: 'maintenance', run: ( c ) => tapeOn( c, 'light', 'taped_flashlight' ) },
	{ id: 'arms_tape_bayonet', verb: 'Tape on', label: 'Tape onto {b}', a: { fn: ( s, d ) => L.smallBlade( d ) }, b: gunWith( ( s, d ) => fitsFree( 'taped_bayonet' )( s, d ) && ! L.attIn( s, 'bayonet' ) ),
		use: { a: 1, b: 0 }, tools: [ 'tape' ], time: 8, sound: 'tear', skill: 'maintenance', run: ( c ) => tapeOn( c, 'bayonet', 'taped_bayonet' ) },

	// ---- armour ----
	{ id: 'arms_mag_guards', verb: 'Roll', label: 'Make arm guards', a: { fn: ( s, d ) => L.rollable( d ) }, b: { tool: 'tape' }, use: { a: 1, b: 2 },
		out: [ 'magazine_guards', 1 ], time: 8, sound: 'tear', skill: 'tailoring' },
	{ id: 'arms_paper_guards', verb: 'Roll', label: 'Make arm guards', a: 'newspaper', b: { tool: 'tape' }, use: { a: 3, b: 2 },
		out: [ 'magazine_guards', 1 ], time: 10, sound: 'tear', skill: 'tailoring' },
	{ id: 'arms_tape_guards', verb: 'Tape on', label: 'Tape guards onto {b}', a: 'magazine_guards', b: { fn: ( s, d ) => torso( s, d ) && ! s.data?.guards }, use: { a: 1, b: 0 },
		tools: [ 'tape' ], time: 6, sound: 'tear', skill: 'tailoring', run: guardsOn },
	{ id: 'arms_pull_sleeves', verb: 'Pull on', label: 'Pull sleeves over {b}', a: 'kevlar_sleeves', b: { fn: ( s, d ) => torso( s, d ) && ! s.data?.guards }, use: { a: 1, b: 0 },
		time: 4, sound: 'zipper', run: guardsOn },

	// ---- distractions ----
	{ id: 'arms_can_tripwire', verb: 'String', label: 'Make can tripwire', a: 'empty_can', b: { any: [ 'wire', 'fishing_line', 'barbed_wire' ] }, use: { a: 4, b: 1 },
		out: [ 'can_tripwire', 1 ], time: 10, sound: 'craft', skill: 'survival' },
	{ id: 'arms_horn_tripwire', verb: 'Rig', label: 'Rig horn to tripwire', a: 'air_horn', b: { id: 'can_tripwire', fn: ( s ) => ! s.data?.horn }, use: { a: 1, b: 0 },
		time: 6, sound: 'craft', skill: 'electrical', run: ( c ) => { c.b.data.horn = true; c.b.data.name = 'Horn tripwire'; } },
] );

// ======================================================================================================================
// verbs
// ======================================================================================================================

addUseActions( ( stack, def, ctx ) => {
	const g = ctx.game, use = ctx.use, inv = ctx.inv;
	if ( ! g ) return;
	attach( g );
	switch ( def.id ) {
		case 'slingshot': {
			// held, the fire button shoots (the hands run the first verb); from the bag, it goes to the hands
			const n = slingCount( inv );
			if ( inv.hands === stack.uid ) ctx.first( 'Shoot', () => shoot( g, stack ), [ n ? `${n}` : 'no shot' ] );
			else ctx.first( 'Hold', () => { g.app?.ui?.closeScreen?.(); g.hands?.select?.( stack ); } );
			return;
		}
		case 'air_horn': ctx.first( 'Blast', () => horn( g, stack, def ), [ `${use.usesLeft( stack )}/${def.tool.uses}` ] ); return;
		case 'party_horn': ctx.first( 'Blow', () => horn( g, stack, def ) ); return;
		case 'alarm_clock': ctx.add( 'Set and throw', () => throwThing( g, stack, 'alarm' ) ); return;
		case 'radio': if ( ( stack.data?.charge ?? 0 ) > 0 || g.mode === 'creative' ) ctx.add( 'Turn on and throw', () => throwThing( g, stack, 'radio' ) ); return;
		case 'taped_flashlight': case 'taped_bayonet': ctx.add( 'Untape', () => untape( use, stack ) ); return;
		case 'machete_spear': case 'knife_spear': ctx.add( 'Take apart', () => takeApart( use, stack, def ) ); return;
	}
	if ( def.cat === 'clothing' && stack.data?.guards ) ctx.add( 'Take off arm guards', () => guardsOff( use, stack ) );
} );

// the runtime (the riot shield's block) rides in on the first spoil tick, as the outdoors domain's does: this domain
// has no module of its own to install it
addSpoilHook( ( items, k, dh, game ) => { attach( game ); return k; } );
