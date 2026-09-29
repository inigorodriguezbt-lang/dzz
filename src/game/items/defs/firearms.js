// Weapons: firearms, ammunition, magazines, attachments, melee weapons and throwables.
// Pure data (importable in Node): the models are built by src/weapons/GunModels.js, the behaviour by src/weapons/Hands.js.
//
// Balance targets (infected ~100 hp, head x3.5-4, limbs x0.6): any bullet to the head kills, rifle rounds need 1-4
// body hits, buckshot is devastating inside 15 m, .22 is a quiet pest round, melee kills in 2-4 hits.
//
// Extra firearm fields used by the weapons module (on top of the ItemDB schema):
//   action   'semi' | 'auto' | 'bolt' | 'pump' | 'lever' | 'revolver' | 'break' | 'bow' | 'crossbow' | 'open'
//   hip      hip-fire cone (rad) added to `spread` (the aimed mechanical dispersion)
//   pelletSpread  cone of the shot charge (shotguns)
//   sound    procedural gunshot name, pitch (playback rate), mech (action sound)
//   perRound reload time per round for internal feeds (s); clip: rounds per stripper clip
//   zero     sight zero (m); optic: built-in optic { zoom, reticle }
import { defineItems } from '../ItemDB.js';

// ---- ammunition ---------------------------------------------------------------------------------------

const AMMO = [
	// id, name, caliber, dmg mult, stack, weight/round, rarity, tags, [ pellets ], color
	[ 'ammo_9mm', '9×19mm rounds', '9mm', 1, 50, 0.012, 'common', [ 'civilian', 'police', 'military', 'gunstore' ] ],
	[ 'ammo_45acp', '.45 ACP rounds', '.45acp', 1, 50, 0.021, 'uncommon', [ 'civilian', 'police', 'gunstore' ] ],
	[ 'ammo_357', '.357 Magnum rounds', '.357', 1, 50, 0.016, 'uncommon', [ 'civilian', 'police', 'gunstore' ] ],
	[ 'ammo_44mag', '.44 Magnum rounds', '.44mag', 1, 50, 0.024, 'rare', [ 'civilian', 'gunstore', 'hunting' ] ],
	[ 'ammo_50ae', '.50 AE rounds', '.50ae', 1, 30, 0.033, 'rare', [ 'gunstore' ] ],
	[ 'ammo_22lr', '.22 LR rounds', '.22lr', 1, 100, 0.0035, 'common', [ 'civilian', 'hunting', 'farm', 'gunstore' ] ],
	[ 'ammo_9x18', '9×18mm Makarov rounds', '9x18', 1, 50, 0.011, 'uncommon', [ 'civilian', 'gunstore' ] ],
	[ 'ammo_556', '5.56×45mm rounds', '5.56', 1, 60, 0.012, 'uncommon', [ 'military', 'police', 'gunstore' ] ],
	[ 'ammo_545', '5.45×39mm rounds', '5.45', 1, 60, 0.011, 'rare', [ 'military', 'gunstore' ] ],
	[ 'ammo_762x39', '7.62×39mm rounds', '7.62x39', 1, 60, 0.017, 'uncommon', [ 'military', 'civilian', 'gunstore', 'hunting' ] ],
	[ 'ammo_308', '.308 Winchester rounds', '.308', 1, 40, 0.025, 'uncommon', [ 'hunting', 'military', 'gunstore' ] ],
	[ 'ammo_762x54r', '7.62×54mmR rounds', '7.62x54r', 1, 40, 0.022, 'rare', [ 'military', 'gunstore' ] ],
	[ 'ammo_50bmg', '.50 BMG rounds', '.50bmg', 1, 10, 0.115, 'legendary', [ 'military' ] ],
	[ 'ammo_12ga_buck', '12 gauge buckshot', '12ga', 1, 25, 0.04, 'common', [ 'civilian', 'police', 'farm', 'hunting', 'gunstore' ], 9 ],
	[ 'ammo_12ga_slug', '12 gauge slugs', '12ga', 6.2, 25, 0.04, 'uncommon', [ 'civilian', 'police', 'hunting', 'gunstore' ], 1 ],
	[ 'ammo_3030', '.30-30 Winchester rounds', '.30-30', 1, 40, 0.02, 'uncommon', [ 'hunting', 'farm', 'gunstore' ] ],
	[ 'ammo_46x30', '4.6×30mm rounds', '4.6x30', 1, 60, 0.007, 'epic', [ 'military' ] ],
	[ 'arrow', 'Carbon arrow', 'arrow', 1, 12, 0.03, 'uncommon', [ 'hunting', 'sports' ] ],
	[ 'crossbow_bolt', 'Crossbow bolt', 'bolt', 1, 12, 0.03, 'uncommon', [ 'hunting', 'sports' ] ],
	[ 'ammo_flare', '12 gauge signal flare', 'flare', 1, 6, 0.05, 'common', [ 'civilian', 'boat', 'gas_station' ] ],
];

const AMMO_DESC = {
	'9mm': 'The most common pistol and SMG round in the world.',
	'.45acp': 'Heavy, slow pistol round. Hits hard, drops fast.',
	'.357': 'Hot revolver round with serious stopping power.',
	'.44mag': 'Hunting revolver round. Heavy recoil, heavy hits.',
	'.50ae': 'Absurd pistol round for the Desert Eagle.',
	'.22lr': 'Tiny rimfire round. Quiet, cheap and weak — aim for the head.',
	'9x18': 'Soviet pistol round for the Makarov.',
	'5.56': 'NATO intermediate rifle round. Flat and fast.',
	'5.45': 'Soviet small-calibre rifle round for the AK-74.',
	'7.62x39': 'The AKM and SKS round. Hits harder than 5.56 with more drop.',
	'.308': 'Full-power rifle round for battle rifles and hunting rifles.',
	'7.62x54r': 'Rimmed Russian full-power round (Mosin, SVD, PKM).',
	'.50bmg': 'Heavy machine gun round. Goes through almost anything.',
	'12ga': 'Shotgun shells.',
	'.30-30': 'Classic lever-action deer round.',
	'4.6x30': 'Armour-piercing PDW round for the MP7.',
	'arrow': 'Recoverable carbon hunting arrow with a broadhead.',
	'bolt': 'Short, heavy crossbow bolt.',
	'flare': 'A signal flare. Bright, loud and it burns.',
};

const ammoDefs = AMMO.map( ( [ id, name, caliber, dmg, stack, w, rarity, tags, pellets ] ) => ( {
	id, name, cat: 'ammo', weight: w, size: caliber === '.50bmg' ? 2 : 1, stack, rarity, tags,
	desc: id === 'ammo_12ga_buck' ? '00 buckshot: nine pellets, devastating up close.' : id === 'ammo_12ga_slug' ? 'A single heavy lead slug. Accurate to 100 m.' : AMMO_DESC[ caliber ],
	ammo: { caliber, damage: dmg, ...( pellets ? { pellets } : {} ), ...( caliber === 'flare' ? { tracer: true } : {} ) },
	model: { type: 'ammo_box', caliber },
} ) );

// ---- magazines --------------------------------------------------------------------------------------------

const MAGS = [
	// id, name, caliber, capacity, weight (empty), shape, rarity, tags
	[ 'mag_glock17', 'Glock 17 magazine', '9mm', 17, 0.08, 'pistol', 'uncommon', [ 'police', 'civilian', 'gunstore' ] ],
	[ 'mag_m9', 'M9 magazine', '9mm', 15, 0.09, 'pistol', 'uncommon', [ 'police', 'military', 'gunstore' ] ],
	[ 'mag_1911', '1911 magazine', '.45acp', 7, 0.08, 'pistol', 'uncommon', [ 'civilian', 'police', 'gunstore' ] ],
	[ 'mag_p226', 'P226 magazine', '9mm', 15, 0.09, 'pistol', 'rare', [ 'police', 'gunstore' ] ],
	[ 'mag_deagle', 'Desert Eagle magazine', '.50ae', 7, 0.15, 'pistol', 'rare', [ 'gunstore' ] ],
	[ 'mag_makarov', 'Makarov magazine', '9x18', 8, 0.06, 'pistol', 'uncommon', [ 'civilian', 'gunstore' ] ],
	[ 'mag_ruger22', 'Ruger .22 magazine', '.22lr', 10, 0.05, 'pistol', 'common', [ 'civilian', 'hunting', 'gunstore' ] ],
	[ 'mag_mp5', 'MP5 magazine', '9mm', 30, 0.14, 'smg_curved', 'rare', [ 'police', 'military' ] ],
	[ 'mag_uzi', 'Uzi magazine', '9mm', 32, 0.2, 'smg', 'rare', [ 'military', 'gunstore' ] ],
	[ 'mag_mp7', 'MP7 magazine', '4.6x30', 40, 0.12, 'smg', 'epic', [ 'military' ] ],
	[ 'mag_vector', 'Vector .45 magazine', '.45acp', 25, 0.15, 'smg', 'rare', [ 'police', 'gunstore' ] ],
	[ 'mag_mac10', 'MAC-10 magazine', '.45acp', 30, 0.2, 'smg', 'rare', [ 'civilian', 'gunstore' ] ],
	[ 'mag_ump45', 'UMP45 magazine', '.45acp', 25, 0.18, 'smg', 'rare', [ 'police', 'military' ] ],
	[ 'mag_stanag30', 'STANAG 30-round magazine', '5.56', 30, 0.12, 'stanag', 'uncommon', [ 'military', 'police', 'gunstore' ] ],
	[ 'mag_stanag60', 'Quad-stack 60-round magazine', '5.56', 60, 0.28, 'stanag60', 'epic', [ 'military', 'gunstore' ] ],
	[ 'mag_mini14', 'Mini-14 magazine', '5.56', 20, 0.11, 'mini14', 'uncommon', [ 'civilian', 'hunting', 'gunstore' ] ],
	[ 'mag_ak74', 'AK-74 magazine', '5.45', 30, 0.23, 'ak74', 'rare', [ 'military', 'gunstore' ] ],
	[ 'mag_akm', 'AKM magazine', '7.62x39', 30, 0.33, 'akm', 'uncommon', [ 'military', 'gunstore' ] ],
	[ 'mag_akm_drum', 'AKM 75-round drum', '7.62x39', 75, 1.1, 'drum', 'epic', [ 'military' ] ],
	[ 'mag_g36', 'G36 magazine', '5.56', 30, 0.13, 'g36', 'rare', [ 'military' ] ],
	[ 'mag_aug', 'AUG magazine', '5.56', 30, 0.13, 'aug', 'rare', [ 'military', 'gunstore' ] ],
	[ 'mag_fal', 'FAL magazine', '.308', 20, 0.28, 'fal', 'rare', [ 'military', 'gunstore' ] ],
	[ 'mag_m14', 'M14 magazine', '.308', 20, 0.24, 'm14', 'rare', [ 'military', 'gunstore' ] ],
	[ 'mag_svd', 'SVD magazine', '7.62x54r', 10, 0.2, 'svd', 'epic', [ 'military' ] ],
	[ 'mag_m82', 'M82 magazine', '.50bmg', 10, 0.6, 'm82', 'legendary', [ 'military' ] ],
	[ 'mag_cz527', 'CZ 527 magazine', '7.62x39', 5, 0.07, 'cz527', 'uncommon', [ 'hunting', 'gunstore' ] ],
	[ 'mag_saiga12', 'Saiga-12 magazine', '12ga', 8, 0.35, 'saiga', 'rare', [ 'gunstore' ] ],
	[ 'box_m249', 'M249 ammo box (100)', '5.56', 100, 0.45, 'box', 'epic', [ 'military' ] ],
	[ 'box_pkm', 'PKM ammo box (100)', '7.62x54r', 100, 0.6, 'box_pkm', 'epic', [ 'military' ] ],
];

const magDefs = MAGS.map( ( [ id, name, caliber, capacity, weight, shape, rarity, tags ] ) => ( {
	id, name, cat: 'magazine', weight, size: capacity >= 60 ? 3 : shape === 'pistol' ? 1 : 2, stack: 1, rarity, tags,
	desc: `Holds ${capacity} rounds of ${caliber}. Load it with loose rounds from the inventory.`,
	magazine: { caliber, capacity },
	model: { type: 'mag', shape, caliber, capacity },
} ) );

// ---- firearms -----------------------------------------------------------------------------------------------

const PISTOL_M = [ 'supp_pistol' ], RIFLE_M = [ 'supp_rifle' ], SNIPER_M = [ 'supp_sniper' ];

function gun( id, name, desc, { weight, size, rarity, tags, firearm, model } ) {
	const f = firearm;
	const cls = f.cls;
	const defaults = {
		pistol: { hip: 0.022, ads: 0.9, handling: 0.9, slot: 'sidearm', zero: 25 },
		smg: { hip: 0.03, ads: 0.86, handling: 0.8, slot: 'primary', zero: 50 },
		rifle: { hip: 0.045, ads: 0.8, handling: 0.62, slot: 'primary', zero: 100 },
		sniper: { hip: 0.07, ads: 0.78, handling: 0.42, slot: 'primary', zero: 100 },
		shotgun: { hip: 0.032, ads: 0.86, handling: 0.66, slot: 'primary', zero: 25 },
		lmg: { hip: 0.065, ads: 0.82, handling: 0.35, slot: 'primary', zero: 100 },
		bow: { hip: 0.03, ads: 0.88, handling: 0.7, slot: 'primary', zero: 25 },
	}[ cls ];
	return {
		id, name, desc, cat: 'firearm', weight, size, stack: 1, rarity, tags,
		firearm: { pellets: 1, rails: [], muzzles: [], boltTime: 0, ...defaults, ...f },
		model: { type: 'gun', ...model },
	};
}

const firearmDefs = [
	// ---- pistols ----
	gun( 'glock17', 'Glock 17', 'Polymer-framed 9 mm service pistol. Reliable, light, 17 rounds.', {
		weight: 0.7, size: 3, rarity: 'uncommon', tags: [ 'police', 'civilian', 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '9mm', feed: 'mag', mags: [ 'mag_glock17' ], rpm: 600, modes: [ 'semi' ], action: 'semi', damage: 30, velocity: 375, range: 50, spread: 0.0035, recoil: 0.55, noise: 220, reload: 1.8, rails: [ 'muzzle', 'light' ], muzzles: PISTOL_M, sound: 'gun_pistol', pitch: 1.05 },
		model: { arch: 'pistol', v: 'glock' } } ),
	gun( 'beretta_m9', 'Beretta M9', 'Former US military sidearm. Open-top slide, 15 rounds of 9 mm.', {
		weight: 0.95, size: 3, rarity: 'uncommon', tags: [ 'police', 'military', 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '9mm', feed: 'mag', mags: [ 'mag_m9' ], rpm: 500, modes: [ 'semi' ], action: 'semi', damage: 30, velocity: 380, range: 50, spread: 0.003, recoil: 0.52, noise: 220, reload: 1.9, rails: [ 'muzzle', 'light' ], muzzles: PISTOL_M, sound: 'gun_pistol', pitch: 1.0 },
		model: { arch: 'pistol', v: 'm9' } } ),
	gun( 'm1911', 'M1911', 'A century-old .45 ACP classic. Seven fat rounds, crisp single-action trigger.', {
		weight: 1.1, size: 3, rarity: 'uncommon', tags: [ 'civilian', 'police', 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '.45acp', feed: 'mag', mags: [ 'mag_1911' ], rpm: 450, modes: [ 'semi' ], action: 'semi', damage: 37, velocity: 255, range: 45, spread: 0.003, recoil: 0.75, noise: 230, reload: 1.9, rails: [ 'muzzle' ], muzzles: PISTOL_M, sound: 'gun_pistol', pitch: 0.88 },
		model: { arch: 'pistol', v: '1911' } } ),
	gun( 'sig_p226', 'SIG P226', 'Accurate hammer-fired 9 mm pistol favoured by special forces.', {
		weight: 0.96, size: 3, rarity: 'rare', tags: [ 'police', 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '9mm', feed: 'mag', mags: [ 'mag_p226' ], rpm: 520, modes: [ 'semi' ], action: 'semi', damage: 31, velocity: 385, range: 55, spread: 0.0025, recoil: 0.5, noise: 220, reload: 1.8, rails: [ 'muzzle', 'light' ], muzzles: PISTOL_M, sound: 'gun_pistol', pitch: 1.02 },
		model: { arch: 'pistol', v: 'p226' } } ),
	gun( 'desert_eagle', 'Desert Eagle .50', 'A gas-operated hand cannon. Brutal recoil, brutal damage.', {
		weight: 2.0, size: 4, rarity: 'epic', tags: [ 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '.50ae', feed: 'mag', mags: [ 'mag_deagle' ], rpm: 220, modes: [ 'semi' ], action: 'semi', damage: 68, velocity: 470, range: 70, spread: 0.003, recoil: 1.9, noise: 330, reload: 2.1, handling: 0.72, sound: 'gun_magnum', pitch: 0.95 },
		model: { arch: 'pistol', v: 'deagle' } } ),
	gun( 'revolver_357', '.357 Revolver', 'Six-shot double-action revolver with a 4" barrel.', {
		weight: 1.1, size: 3, rarity: 'uncommon', tags: [ 'civilian', 'police', 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '.357', feed: 'internal', capacity: 6, rpm: 200, modes: [ 'semi' ], action: 'revolver', damage: 50, velocity: 440, range: 60, spread: 0.0025, recoil: 1.15, noise: 280, reload: 1.2, perRound: 0.42, sound: 'gun_revolver', pitch: 1.05 },
		model: { arch: 'revolver', v: '357' } } ),
	gun( 'revolver_44', '.44 Magnum Revolver', 'Long-barrelled .44 Magnum. The most powerful handgun you are likely to find.', {
		weight: 1.4, size: 4, rarity: 'rare', tags: [ 'civilian', 'hunting', 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '.44mag', feed: 'internal', capacity: 6, rpm: 160, modes: [ 'semi' ], action: 'revolver', damage: 60, velocity: 450, range: 70, spread: 0.0022, recoil: 1.55, noise: 300, reload: 1.3, perRound: 0.45, handling: 0.78, sound: 'gun_magnum', pitch: 0.92 },
		model: { arch: 'revolver', v: '44' } } ),
	gun( 'makarov', 'Makarov PM', 'Compact Soviet pistol in 9×18 mm. Simple and dependable.', {
		weight: 0.73, size: 2, rarity: 'uncommon', tags: [ 'civilian', 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '9x18', feed: 'mag', mags: [ 'mag_makarov' ], rpm: 450, modes: [ 'semi' ], action: 'semi', damage: 27, velocity: 315, range: 40, spread: 0.004, recoil: 0.5, noise: 210, reload: 1.8, rails: [ 'muzzle' ], muzzles: PISTOL_M, sound: 'gun_pistol2', pitch: 1.12 },
		model: { arch: 'pistol', v: 'makarov' } } ),
	gun( 'ruger_mk4', 'Ruger Mark IV .22', 'A target .22 pistol. Quiet and light-kicking, but weak.', {
		weight: 0.9, size: 3, rarity: 'common', tags: [ 'civilian', 'hunting', 'gunstore' ],
		firearm: { cls: 'pistol', caliber: '.22lr', feed: 'mag', mags: [ 'mag_ruger22' ], rpm: 520, modes: [ 'semi' ], action: 'semi', damage: 26, velocity: 330, range: 50, spread: 0.002, recoil: 0.18, noise: 90, reload: 1.7, rails: [ 'muzzle' ], muzzles: PISTOL_M, sound: 'gun_pistol2', pitch: 1.45 },
		model: { arch: 'pistol', v: 'ruger' } } ),
	gun( 'flare_gun', 'Flare gun', 'Orange signal pistol. Lights up the night — and everything hears it.', {
		weight: 0.5, size: 3, rarity: 'common', tags: [ 'civilian', 'boat', 'gas_station' ],
		firearm: { cls: 'pistol', caliber: 'flare', feed: 'internal', capacity: 1, rpm: 60, modes: [ 'single' ], action: 'break', damage: 22, velocity: 70, range: 60, spread: 0.01, recoil: 0.7, noise: 200, reload: 1.8, perRound: 1.8, zero: 20, sound: 'flare_fire', pitch: 1 },
		model: { arch: 'flare' } } ),

	// ---- SMGs ----
	gun( 'mp5', 'MP5A3', 'The classic H&K roller-delayed 9 mm SMG. Smooth, accurate, controllable.', {
		weight: 2.5, size: 7, rarity: 'rare', tags: [ 'police', 'military' ],
		firearm: { cls: 'smg', caliber: '9mm', feed: 'mag', mags: [ 'mag_mp5' ], rpm: 800, modes: [ 'semi', 'burst', 'auto' ], action: 'semi', damage: 30, velocity: 400, range: 100, spread: 0.0025, recoil: 0.42, noise: 220, reload: 2.5, rails: [ 'optic', 'muzzle', 'light' ], muzzles: PISTOL_M, sound: 'gun_smg', pitch: 1.0 },
		model: { arch: 'mp5' } } ),
	gun( 'uzi', 'Uzi', 'Israeli open-bolt SMG. The magazine goes in the grip.', {
		weight: 3.5, size: 6, rarity: 'rare', tags: [ 'military', 'gunstore' ],
		firearm: { cls: 'smg', caliber: '9mm', feed: 'mag', mags: [ 'mag_uzi' ], rpm: 600, modes: [ 'semi', 'auto' ], action: 'open', damage: 30, velocity: 400, range: 80, spread: 0.004, recoil: 0.52, noise: 220, reload: 2.4, rails: [ 'muzzle' ], muzzles: PISTOL_M, sound: 'gun_smg', pitch: 0.95 },
		model: { arch: 'uzi' } } ),
	gun( 'mp7', 'MP7A2', 'Compact PDW firing armour-piercing 4.6 mm. Fast and flat.', {
		weight: 1.9, size: 5, rarity: 'epic', tags: [ 'military' ],
		firearm: { cls: 'smg', caliber: '4.6x30', feed: 'mag', mags: [ 'mag_mp7' ], rpm: 950, modes: [ 'semi', 'auto' ], action: 'semi', damage: 32, velocity: 725, range: 150, spread: 0.002, recoil: 0.36, noise: 230, reload: 2.2, handling: 0.85, rails: [ 'optic', 'muzzle', 'light' ], muzzles: PISTOL_M, sound: 'gun_smg', pitch: 1.12 },
		model: { arch: 'mp7' } } ),
	gun( 'vector', 'KRISS Vector', 'Futuristic .45 SMG whose recoil system drives the bolt down. Very fast, very flat.', {
		weight: 2.7, size: 6, rarity: 'epic', tags: [ 'police', 'gunstore' ],
		firearm: { cls: 'smg', caliber: '.45acp', feed: 'mag', mags: [ 'mag_vector' ], rpm: 1100, modes: [ 'semi', 'burst', 'auto' ], action: 'semi', damage: 36, velocity: 290, range: 80, spread: 0.003, recoil: 0.38, noise: 230, reload: 2.3, rails: [ 'optic', 'muzzle', 'light' ], muzzles: PISTOL_M, sound: 'gun_smg', pitch: 0.92 },
		model: { arch: 'vector' } } ),
	gun( 'mac10', 'MAC-10', 'A stamped steel box that sprays .45 ACP at 1100 rounds a minute.', {
		weight: 2.8, size: 4, rarity: 'rare', tags: [ 'civilian', 'gunstore' ],
		firearm: { cls: 'smg', caliber: '.45acp', feed: 'mag', mags: [ 'mag_mac10' ], rpm: 1100, modes: [ 'semi', 'auto' ], action: 'open', damage: 35, velocity: 280, range: 50, spread: 0.006, hip: 0.04, recoil: 0.85, noise: 240, reload: 2.1, handling: 0.88, rails: [ 'muzzle' ], muzzles: PISTOL_M, sound: 'gun_smg', pitch: 0.86 },
		model: { arch: 'mac10' } } ),
	gun( 'ump45', 'UMP45', 'Polymer H&K SMG in .45 ACP. Slower, harder-hitting.', {
		weight: 2.3, size: 7, rarity: 'rare', tags: [ 'police', 'military' ],
		firearm: { cls: 'smg', caliber: '.45acp', feed: 'mag', mags: [ 'mag_ump45' ], rpm: 650, modes: [ 'semi', 'burst', 'auto' ], action: 'semi', damage: 36, velocity: 285, range: 90, spread: 0.003, recoil: 0.58, noise: 230, reload: 2.4, rails: [ 'optic', 'muzzle', 'light' ], muzzles: PISTOL_M, sound: 'gun_smg', pitch: 0.88 },
		model: { arch: 'ump' } } ),

	// ---- rifles ----
	gun( 'm4a1', 'M4A1 Carbine', 'Select-fire 5.56 carbine with a rail system. The standard US infantry weapon.', {
		weight: 3.0, size: 12, rarity: 'rare', tags: [ 'military', 'police' ],
		firearm: { cls: 'rifle', caliber: '5.56', feed: 'mag', mags: [ 'mag_stanag30', 'mag_stanag60' ], rpm: 800, modes: [ 'semi', 'auto' ], action: 'semi', damage: 40, velocity: 880, range: 400, spread: 0.0011, recoil: 1.0, noise: 400, reload: 2.5, handling: 0.66, rails: [ 'optic', 'muzzle', 'light' ], muzzles: RIFLE_M, sound: 'gun_rifle', pitch: 1.04 },
		model: { arch: 'ar', v: 'm4' } } ),
	gun( 'm16a4', 'M16A4', 'Full-length 5.56 service rifle with a detachable carry handle. Three-round burst.', {
		weight: 3.4, size: 14, rarity: 'rare', tags: [ 'military' ],
		firearm: { cls: 'rifle', caliber: '5.56', feed: 'mag', mags: [ 'mag_stanag30', 'mag_stanag60' ], rpm: 800, modes: [ 'semi', 'burst' ], action: 'semi', damage: 43, velocity: 940, range: 550, spread: 0.0009, recoil: 0.88, noise: 410, reload: 2.6, handling: 0.56, rails: [ 'optic', 'muzzle', 'light' ], muzzles: RIFLE_M, sound: 'gun_rifle2', pitch: 1.0 },
		model: { arch: 'ar', v: 'm16' } } ),
	gun( 'hk416', 'HK416', 'Piston-driven AR with a free-floated rail. Reliable and accurate.', {
		weight: 3.5, size: 12, rarity: 'epic', tags: [ 'military' ],
		firearm: { cls: 'rifle', caliber: '5.56', feed: 'mag', mags: [ 'mag_stanag30', 'mag_stanag60' ], rpm: 850, modes: [ 'semi', 'auto' ], action: 'semi', damage: 41, velocity: 890, range: 450, spread: 0.0009, recoil: 0.92, noise: 400, reload: 2.5, handling: 0.64, rails: [ 'optic', 'muzzle', 'light' ], muzzles: RIFLE_M, sound: 'gun_rifle', pitch: 0.98 },
		model: { arch: 'ar', v: '416' } } ),
	gun( 'ar15_civ', 'AR-15 Sporter', 'Civilian semi-automatic AR-15 with a fixed stock and free-float handguard.', {
		weight: 3.0, size: 12, rarity: 'uncommon', tags: [ 'civilian', 'gunstore', 'hunting' ],
		firearm: { cls: 'rifle', caliber: '5.56', feed: 'mag', mags: [ 'mag_stanag30', 'mag_stanag60' ], rpm: 600, modes: [ 'semi' ], action: 'semi', damage: 40, velocity: 900, range: 450, spread: 0.001, recoil: 0.95, noise: 400, reload: 2.6, rails: [ 'optic', 'muzzle', 'light' ], muzzles: RIFLE_M, sound: 'gun_rifle', pitch: 1.02 },
		model: { arch: 'ar', v: 'civ' } } ),
	gun( 'mini14', 'Ruger Mini-14', 'Wood-stocked ranch rifle in 5.56. Semi-automatic, handy and accurate.', {
		weight: 3.0, size: 12, rarity: 'uncommon', tags: [ 'civilian', 'hunting', 'farm', 'gunstore' ],
		firearm: { cls: 'rifle', caliber: '5.56', feed: 'mag', mags: [ 'mag_mini14' ], rpm: 500, modes: [ 'semi' ], action: 'semi', damage: 39, velocity: 900, range: 400, spread: 0.0012, recoil: 1.0, noise: 400, reload: 2.4, rails: [ 'optic', 'muzzle' ], muzzles: RIFLE_M, sound: 'gun_rifle2', pitch: 1.05 },
		model: { arch: 'mini14' } } ),
	gun( 'ak74', 'AK-74M', 'Soviet 5.45 assault rifle with a huge muzzle brake. Low recoil for an AK.', {
		weight: 3.3, size: 13, rarity: 'rare', tags: [ 'military', 'gunstore' ],
		firearm: { cls: 'rifle', caliber: '5.45', feed: 'mag', mags: [ 'mag_ak74' ], rpm: 650, modes: [ 'semi', 'auto' ], action: 'semi', damage: 40, velocity: 880, range: 400, spread: 0.0018, recoil: 0.92, noise: 420, reload: 2.7, rails: [ 'optic', 'muzzle', 'light' ], muzzles: RIFLE_M, sound: 'gun_rifle', pitch: 0.96 },
		model: { arch: 'ak', v: '74' } } ),
	gun( 'akm', 'AKM', 'The Kalashnikov. 7.62×39, wooden furniture, works through anything.', {
		weight: 3.1, size: 13, rarity: 'rare', tags: [ 'military', 'gunstore', 'civilian' ],
		firearm: { cls: 'rifle', caliber: '7.62x39', feed: 'mag', mags: [ 'mag_akm', 'mag_akm_drum' ], rpm: 600, modes: [ 'semi', 'auto' ], action: 'semi', damage: 48, velocity: 715, range: 350, spread: 0.0022, recoil: 1.35, noise: 430, reload: 2.8, rails: [ 'optic', 'muzzle' ], muzzles: RIFLE_M, sound: 'gun_rifle2', pitch: 0.9 },
		model: { arch: 'ak', v: 'm' } } ),
	gun( 'sks', 'SKS', 'Soviet semi-automatic carbine with a fixed 10-round magazine fed by stripper clips.', {
		weight: 3.8, size: 13, rarity: 'uncommon', tags: [ 'civilian', 'hunting', 'gunstore' ],
		firearm: { cls: 'rifle', caliber: '7.62x39', feed: 'internal', capacity: 10, rpm: 400, modes: [ 'semi' ], action: 'semi', damage: 47, velocity: 735, range: 350, spread: 0.0016, recoil: 1.2, noise: 420, reload: 2.2, perRound: 0.35, clip: 10, sound: 'gun_rifle2', pitch: 0.92 },
		model: { arch: 'sks' } } ),
	gun( 'scar_l', 'SCAR-L', 'Modular FN combat rifle in 5.56 with a folding stock.', {
		weight: 3.3, size: 12, rarity: 'epic', tags: [ 'military' ],
		firearm: { cls: 'rifle', caliber: '5.56', feed: 'mag', mags: [ 'mag_stanag30', 'mag_stanag60' ], rpm: 600, modes: [ 'semi', 'auto' ], action: 'semi', damage: 42, velocity: 870, range: 450, spread: 0.001, recoil: 0.9, noise: 400, reload: 2.5, handling: 0.64, rails: [ 'optic', 'muzzle', 'light' ], muzzles: RIFLE_M, sound: 'gun_rifle', pitch: 0.97 },
		model: { arch: 'scar' } } ),
	gun( 'g36', 'G36', 'German polymer rifle with a translucent magazine and a carry-handle optic rail.', {
		weight: 3.6, size: 13, rarity: 'epic', tags: [ 'military', 'police' ],
		firearm: { cls: 'rifle', caliber: '5.56', feed: 'mag', mags: [ 'mag_g36' ], rpm: 750, modes: [ 'semi', 'burst', 'auto' ], action: 'semi', damage: 41, velocity: 920, range: 450, spread: 0.001, recoil: 0.9, noise: 400, reload: 2.5, rails: [ 'optic', 'muzzle', 'light' ], muzzles: RIFLE_M, sound: 'gun_rifle2', pitch: 1.03 },
		model: { arch: 'g36' } } ),
	gun( 'aug', 'Steyr AUG', 'Austrian bullpup with a built-in 1.5× optic. Long barrel, short rifle.', {
		weight: 3.6, size: 11, rarity: 'epic', tags: [ 'military', 'police' ],
		firearm: { cls: 'rifle', caliber: '5.56', feed: 'mag', mags: [ 'mag_aug', 'mag_stanag30' ], rpm: 700, modes: [ 'semi', 'auto' ], action: 'semi', damage: 42, velocity: 940, range: 450, spread: 0.001, recoil: 0.85, noise: 400, reload: 2.8, handling: 0.6, rails: [ 'muzzle' ], muzzles: RIFLE_M, optic: { zoom: 1.5, reticle: 'ring' }, sound: 'gun_rifle', pitch: 1.0 },
		model: { arch: 'aug' } } ),
	gun( 'fal', 'FN FAL', 'The right arm of the free world. Full-power .308 battle rifle.', {
		weight: 4.3, size: 15, rarity: 'epic', tags: [ 'military', 'gunstore' ],
		firearm: { cls: 'rifle', caliber: '.308', feed: 'mag', mags: [ 'mag_fal' ], rpm: 650, modes: [ 'semi', 'auto' ], action: 'semi', damage: 68, velocity: 840, range: 600, spread: 0.0011, recoil: 1.8, noise: 520, reload: 3.0, handling: 0.5, rails: [ 'optic', 'muzzle' ], muzzles: RIFLE_M, sound: 'gun_sniper', pitch: 1.12 },
		model: { arch: 'fal' } } ),
	gun( 'm14_ebr', 'M14 EBR', 'M14 in an aluminium chassis with rails. A semi-automatic .308 marksman rifle.', {
		weight: 5.1, size: 15, rarity: 'epic', tags: [ 'military' ],
		firearm: { cls: 'rifle', caliber: '.308', feed: 'mag', mags: [ 'mag_m14' ], rpm: 700, modes: [ 'semi' ], action: 'semi', damage: 70, velocity: 850, range: 700, spread: 0.0007, recoil: 1.65, noise: 520, reload: 3.0, handling: 0.46, rails: [ 'optic', 'muzzle', 'light' ], muzzles: RIFLE_M, sound: 'gun_sniper', pitch: 1.1 },
		model: { arch: 'ebr' } } ),

	// ---- precision / hunting ----
	gun( 'rem700', 'Remington 700', 'Bolt-action .308 hunting rifle with scope bases. Accurate and powerful.', {
		weight: 3.6, size: 15, rarity: 'uncommon', tags: [ 'hunting', 'civilian', 'gunstore' ],
		firearm: { cls: 'sniper', caliber: '.308', feed: 'internal', capacity: 4, rpm: 60, modes: [ 'bolt' ], action: 'bolt', damage: 72, velocity: 860, range: 800, spread: 0.00035, recoil: 2.1, noise: 520, reload: 1.0, perRound: 0.5, boltTime: 0.85, rails: [ 'optic', 'muzzle' ], muzzles: SNIPER_M, sound: 'gun_sniper', pitch: 1.05 },
		model: { arch: 'bolt', v: '700' } } ),
	gun( 'm24', 'M24 SWS', 'Military sniper version of the Remington 700 with a heavy barrel and fibreglass stock.', {
		weight: 5.4, size: 16, rarity: 'epic', tags: [ 'military' ],
		firearm: { cls: 'sniper', caliber: '.308', feed: 'internal', capacity: 5, rpm: 60, modes: [ 'bolt' ], action: 'bolt', damage: 74, velocity: 870, range: 900, spread: 0.00025, recoil: 1.9, noise: 520, reload: 1.0, perRound: 0.5, boltTime: 0.85, rails: [ 'optic', 'muzzle' ], muzzles: SNIPER_M, sound: 'gun_sniper', pitch: 1.0 },
		model: { arch: 'bolt', v: 'm24' } } ),
	gun( 'cz527', 'CZ 527 Carbine', 'Light bolt-action carbine in 7.62×39 with a detachable 5-round magazine.', {
		weight: 2.7, size: 13, rarity: 'uncommon', tags: [ 'hunting', 'civilian', 'gunstore' ],
		firearm: { cls: 'sniper', caliber: '7.62x39', feed: 'mag', mags: [ 'mag_cz527' ], rpm: 60, modes: [ 'bolt' ], action: 'bolt', damage: 50, velocity: 740, range: 300, spread: 0.0005, recoil: 1.25, noise: 420, reload: 2.2, boltTime: 0.7, handling: 0.6, rails: [ 'optic', 'muzzle' ], muzzles: RIFLE_M, sound: 'gun_rifle2', pitch: 0.95 },
		model: { arch: 'bolt', v: 'cz' } } ),
	gun( 'lever_3030', 'Lever-action .30-30', 'A cowboy classic. Six rounds in the tube, a lever to work between shots.', {
		weight: 3.4, size: 14, rarity: 'common', tags: [ 'hunting', 'farm', 'civilian', 'gunstore' ],
		firearm: { cls: 'sniper', caliber: '.30-30', feed: 'internal', capacity: 6, rpm: 90, modes: [ 'bolt' ], action: 'lever', damage: 58, velocity: 740, range: 200, spread: 0.0008, recoil: 1.6, noise: 450, reload: 1.0, perRound: 0.55, boltTime: 0.5, handling: 0.66, hip: 0.05, rails: [ 'optic' ], sound: 'gun_rifle2', pitch: 0.85 },
		model: { arch: 'lever' } } ),
	gun( 'mosin', 'Mosin-Nagant', 'WWII-era bolt-action rifle in 7.62×54R. Long, heavy and deadly.', {
		weight: 4.0, size: 17, rarity: 'uncommon', tags: [ 'hunting', 'civilian', 'gunstore' ],
		firearm: { cls: 'sniper', caliber: '7.62x54r', feed: 'internal', capacity: 5, rpm: 50, modes: [ 'bolt' ], action: 'bolt', damage: 76, velocity: 830, range: 700, spread: 0.0006, recoil: 2.4, noise: 550, reload: 1.1, perRound: 0.5, clip: 5, boltTime: 1.0, handling: 0.44, sound: 'gun_sniper', pitch: 0.95 },
		model: { arch: 'mosin' } } ),
	gun( 'svd', 'SVD Dragunov', 'Soviet semi-automatic designated marksman rifle with a PSO-1 side mount.', {
		weight: 4.3, size: 17, rarity: 'epic', tags: [ 'military' ],
		firearm: { cls: 'sniper', caliber: '7.62x54r', feed: 'mag', mags: [ 'mag_svd' ], rpm: 300, modes: [ 'semi' ], action: 'semi', damage: 72, velocity: 830, range: 800, spread: 0.0005, recoil: 1.95, noise: 550, reload: 2.9, rails: [ 'optic', 'muzzle' ], muzzles: SNIPER_M, sound: 'gun_sniper', pitch: 1.0 },
		model: { arch: 'svd' } } ),
	gun( 'barrett_m82', 'Barrett M82A1', 'Semi-automatic .50 BMG anti-materiel rifle. Nothing stops it.', {
		weight: 13.0, size: 24, rarity: 'legendary', tags: [ 'military' ],
		firearm: { cls: 'sniper', caliber: '.50bmg', feed: 'mag', mags: [ 'mag_m82' ], rpm: 180, modes: [ 'semi' ], action: 'semi', damage: 230, velocity: 890, range: 1800, spread: 0.0004, recoil: 3.4, noise: 900, reload: 4.2, handling: 0.22, hip: 0.09, rails: [ 'optic', 'muzzle' ], muzzles: SNIPER_M, sound: 'gun_sniper', pitch: 0.72, zero: 300 },
		model: { arch: 'barrett' } } ),

	// ---- shotguns ----
	gun( 'remington_870', 'Remington 870', 'Pump-action 12 gauge with a wooden stock. Five in the tube.', {
		weight: 3.6, size: 14, rarity: 'uncommon', tags: [ 'police', 'civilian', 'farm', 'gunstore' ],
		firearm: { cls: 'shotgun', caliber: '12ga', feed: 'internal', capacity: 5, rpm: 70, modes: [ 'pump' ], action: 'pump', damage: 14, pellets: 9, pelletSpread: 0.042, velocity: 400, range: 40, spread: 0.003, recoil: 2.6, noise: 380, reload: 0.8, perRound: 0.52, boltTime: 0.55, rails: [ 'optic', 'light' ], sound: 'gun_shotgun', pitch: 1.0 },
		model: { arch: 'pump', v: '870' } } ),
	gun( 'mossberg_500', 'Mossberg 500', 'Tactical pump shotgun with a synthetic stock and a top safety.', {
		weight: 3.2, size: 13, rarity: 'common', tags: [ 'civilian', 'police', 'farm', 'gunstore' ],
		firearm: { cls: 'shotgun', caliber: '12ga', feed: 'internal', capacity: 5, rpm: 70, modes: [ 'pump' ], action: 'pump', damage: 14, pellets: 9, pelletSpread: 0.045, velocity: 400, range: 40, spread: 0.003, recoil: 2.6, noise: 380, reload: 0.8, perRound: 0.5, boltTime: 0.55, rails: [ 'optic', 'light' ], sound: 'gun_shotgun', pitch: 1.03 },
		model: { arch: 'pump', v: '500' } } ),
	gun( 'spas12', 'SPAS-12', 'Italian combat shotgun that fires pump or semi-auto. Folding stock, heat shield.', {
		weight: 4.4, size: 13, rarity: 'rare', tags: [ 'police', 'military' ],
		firearm: { cls: 'shotgun', caliber: '12ga', feed: 'internal', capacity: 7, rpm: 240, modes: [ 'semi', 'pump' ], action: 'pump', damage: 14, pellets: 9, pelletSpread: 0.04, velocity: 400, range: 40, spread: 0.003, recoil: 2.35, noise: 380, reload: 0.8, perRound: 0.5, boltTime: 0.5, handling: 0.55, sound: 'gun_shotgun', pitch: 0.95 },
		model: { arch: 'spas' } } ),
	gun( 'saiga12', 'Saiga-12', 'AK-pattern semi-automatic shotgun with box magazines. Fast follow-ups.', {
		weight: 3.6, size: 13, rarity: 'rare', tags: [ 'gunstore', 'civilian' ],
		firearm: { cls: 'shotgun', caliber: '12ga', feed: 'mag', mags: [ 'mag_saiga12' ], rpm: 300, modes: [ 'semi' ], action: 'semi', damage: 14, pellets: 9, pelletSpread: 0.046, velocity: 390, range: 40, spread: 0.003, recoil: 2.2, noise: 380, reload: 2.9, rails: [ 'optic' ], sound: 'gun_shotgun', pitch: 1.05 },
		model: { arch: 'ak', v: 'saiga' } } ),
	gun( 'double_barrel', 'Double-barrel shotgun', 'Side-by-side 12 gauge coach gun. Two shots, then break it open.', {
		weight: 3.2, size: 14, rarity: 'common', tags: [ 'farm', 'civilian', 'hunting' ],
		firearm: { cls: 'shotgun', caliber: '12ga', feed: 'internal', capacity: 2, rpm: 400, modes: [ 'single' ], action: 'break', damage: 15, pellets: 9, pelletSpread: 0.04, velocity: 410, range: 40, spread: 0.003, recoil: 3.0, noise: 390, reload: 2.4, perRound: 0.6, sound: 'gun_shotgun', pitch: 0.95 },
		model: { arch: 'double', v: 'long' } } ),
	gun( 'sawed_off', 'Sawed-off shotgun', 'A double barrel with most of the barrel and stock cut away. Wide, brutal, short-ranged.', {
		weight: 2.2, size: 7, rarity: 'uncommon', tags: [ 'civilian', 'farm' ],
		firearm: { cls: 'shotgun', caliber: '12ga', feed: 'internal', capacity: 2, rpm: 400, modes: [ 'single' ], action: 'break', damage: 14, pellets: 9, pelletSpread: 0.075, velocity: 360, range: 20, spread: 0.006, recoil: 3.3, noise: 400, reload: 2.2, perRound: 0.55, handling: 0.85, hip: 0.025, slot: 'sidearm', sound: 'gun_shotgun', pitch: 0.9 },
		model: { arch: 'double', v: 'sawed' } } ),

	// ---- machine guns ----
	gun( 'm249', 'M249 SAW', 'Belt-fed 5.56 light machine gun. Also takes STANAG magazines.', {
		weight: 7.5, size: 20, rarity: 'legendary', tags: [ 'military' ],
		firearm: { cls: 'lmg', caliber: '5.56', feed: 'mag', mags: [ 'box_m249', 'mag_stanag30', 'mag_stanag60' ], rpm: 800, modes: [ 'auto' ], action: 'open', damage: 40, velocity: 915, range: 700, spread: 0.0014, recoil: 0.85, noise: 420, reload: 5.2, rails: [ 'optic', 'light' ], sound: 'gun_lmg', pitch: 1.05 },
		model: { arch: 'm249' } } ),
	gun( 'pkm', 'PKM', 'Soviet general-purpose machine gun in 7.62×54R. Heavy and relentless.', {
		weight: 7.5, size: 21, rarity: 'legendary', tags: [ 'military' ],
		firearm: { cls: 'lmg', caliber: '7.62x54r', feed: 'mag', mags: [ 'box_pkm' ], rpm: 700, modes: [ 'auto' ], action: 'open', damage: 70, velocity: 825, range: 800, spread: 0.0016, recoil: 1.3, noise: 550, reload: 5.8, rails: [ 'optic' ], sound: 'gun_lmg', pitch: 0.88 },
		model: { arch: 'pkm' } } ),

	// ---- bows ----
	gun( 'compound_bow', 'Compound bow', 'Silent hunting bow. Hold fire to draw, release to loose. Arrows can be recovered.', {
		weight: 1.9, size: 12, rarity: 'uncommon', tags: [ 'hunting', 'sports' ],
		firearm: { cls: 'bow', caliber: 'arrow', feed: 'internal', capacity: 1, rpm: 60, modes: [ 'single' ], action: 'bow', damage: 78, velocity: 95, range: 60, spread: 0.002, recoil: 0.15, noise: 8, reload: 0.7, perRound: 0.7, handling: 0.75, zero: 25, sound: 'bow_release', pitch: 1 },
		model: { arch: 'bow' } } ),
	gun( 'crossbow', 'Crossbow', 'Hunting crossbow with a scope rail. Slow to cock, silent and deadly.', {
		weight: 3.2, size: 13, rarity: 'uncommon', tags: [ 'hunting', 'sports' ],
		firearm: { cls: 'bow', caliber: 'bolt', feed: 'internal', capacity: 1, rpm: 60, modes: [ 'single' ], action: 'crossbow', damage: 88, velocity: 110, range: 80, spread: 0.0015, recoil: 0.35, noise: 12, reload: 2.6, perRound: 2.6, handling: 0.6, zero: 30, rails: [ 'optic' ], sound: 'crossbow', pitch: 1 },
		model: { arch: 'crossbow' } } ),
];

// ---- attachments ------------------------------------------------------------------------------------------------

const RIFLES_RAIL = [ 'rifle', 'smg', 'shotgun', 'lmg', 'sniper', 'bow' ];

const attachmentDefs = [
	{ id: 'optic_reddot', name: 'Red dot sight', desc: 'Compact 1× reflex sight. A red dot, both eyes open.', weight: 0.15, size: 1, rarity: 'uncommon', tags: [ 'military', 'police', 'gunstore' ],
		attachment: { slot: 'optic', zoom: 1, reticle: 'dot', color: 0xff2a1a, fits: RIFLES_RAIL }, model: { type: 'attachment', kind: 'reddot' } },
	{ id: 'optic_holo', name: 'Holographic sight', desc: '1× holographic sight with a ring-and-dot reticle.', weight: 0.3, size: 1, rarity: 'rare', tags: [ 'military', 'police', 'gunstore' ],
		attachment: { slot: 'optic', zoom: 1, reticle: 'holo', color: 0xff3020, fits: RIFLES_RAIL }, model: { type: 'attachment', kind: 'holo' } },
	{ id: 'optic_2x', name: '2× prism sight', desc: 'Small 2× prism optic with an illuminated dot.', weight: 0.25, size: 1, rarity: 'uncommon', tags: [ 'military', 'gunstore', 'hunting' ],
		attachment: { slot: 'optic', zoom: 2, reticle: 'dot', color: 0x30ff40, fits: RIFLES_RAIL }, model: { type: 'attachment', kind: 'prism' } },
	{ id: 'optic_acog', name: 'ACOG 4× scope', desc: 'Rugged 4×32 combat optic with a chevron reticle.', weight: 0.45, size: 2, rarity: 'rare', tags: [ 'military' ],
		attachment: { slot: 'optic', zoom: 4, reticle: 'acog', color: 0xff3a20, fits: [ 'rifle', 'lmg', 'sniper', 'smg' ] }, model: { type: 'attachment', kind: 'acog' } },
	{ id: 'optic_hunting', name: 'Hunting scope 3–9×', desc: 'Variable hunting scope with a duplex crosshair. Scroll while aiming to zoom.', weight: 0.5, size: 2, rarity: 'uncommon', tags: [ 'hunting', 'gunstore' ],
		attachment: { slot: 'optic', zoom: 4, zooms: [ 3, 6, 9 ], reticle: 'scope', fits: [ 'rifle', 'sniper', 'bow', 'shotgun' ] }, model: { type: 'attachment', kind: 'hunting' } },
	{ id: 'optic_sniper', name: 'Sniper scope 5–25×', desc: 'Tactical long-range scope with a mil-dot reticle. Scroll while aiming to zoom, hold N to steady.', weight: 0.9, size: 3, rarity: 'epic', tags: [ 'military' ],
		attachment: { slot: 'optic', zoom: 8, zooms: [ 5, 10, 16, 25 ], reticle: 'mildot', fits: [ 'sniper', 'rifle' ] }, model: { type: 'attachment', kind: 'sniper' } },
	{ id: 'optic_pso1', name: 'PSO-1 scope', desc: 'Soviet 4× side-mounted scope with a chevron rangefinder reticle.', weight: 0.6, size: 2, rarity: 'rare', tags: [ 'military' ],
		attachment: { slot: 'optic', zoom: 4, reticle: 'pso', fits: [ 'svd', 'ak74', 'akm', 'pkm', 'saiga12' ] }, model: { type: 'attachment', kind: 'pso' } },
	{ id: 'supp_pistol', name: 'Pistol suppressor', desc: 'Screws onto threaded pistol and SMG barrels. Takes the crack out of 9 mm and .45.', weight: 0.2, size: 1, rarity: 'rare', tags: [ 'military', 'police', 'gunstore' ],
		attachment: { slot: 'muzzle', noise: 0.22, flash: false, fits: [ 'pistol', 'smg' ] }, model: { type: 'attachment', kind: 'supp', len: 0.16, r: 0.017 } },
	{ id: 'supp_rifle', name: 'Rifle suppressor', desc: 'A 5.56 / 7.62 sound suppressor. Still loud, but hard to place.', weight: 0.5, size: 2, rarity: 'epic', tags: [ 'military' ],
		attachment: { slot: 'muzzle', noise: 0.35, flash: false, fits: [ 'rifle', 'sniper' ] }, model: { type: 'attachment', kind: 'supp', len: 0.17, r: 0.021 } },
	{ id: 'supp_sniper', name: 'Sniper suppressor', desc: 'Long full-power rifle suppressor for .308 and bigger.', weight: 0.7, size: 2, rarity: 'epic', tags: [ 'military' ],
		attachment: { slot: 'muzzle', noise: 0.38, flash: false, fits: [ 'sniper', 'rifle' ] }, model: { type: 'attachment', kind: 'supp', len: 0.22, r: 0.024 } },
	{ id: 'light_rail', name: 'Weapon light', desc: 'Rail-mounted weapon light. Toggle with L.', weight: 0.15, size: 1, rarity: 'uncommon', tags: [ 'police', 'military', 'gunstore' ],
		attachment: { slot: 'light', fits: [ 'pistol', 'smg', 'rifle', 'shotgun', 'lmg' ], light: { range: 48, angle: 0.36, color: 0xfff4e0 } }, model: { type: 'attachment', kind: 'light' } },
].map( d => ( { cat: 'attachment', stack: 1, ...d } ) );

// ---- melee ----------------------------------------------------------------------------------------------------

const MELEE = [
	// id, name, desc, damage, speed, reach, stamina, kind, twoHanded, wear, tools, weight, size, rarity, tags
	[ 'kitchen_knife', 'Kitchen knife', 'A sharp chef\'s knife. Cuts, opens cans, skins game.', 24, 2.1, 1.35, 4, 'blade', false, 0.012, [ 'cut', 'open_can', 'skin' ], 0.2, 1, 'common', [ 'kitchen', 'civilian' ] ],
	[ 'hunting_knife', 'Hunting knife', 'Fixed-blade hunting knife with a gut hook.', 30, 2.0, 1.4, 4, 'blade', false, 0.006, [ 'cut', 'skin', 'open_can' ], 0.3, 1, 'uncommon', [ 'hunting', 'sports' ] ],
	[ 'combat_knife', 'Combat knife', 'Military fighting knife. Quick, quiet and tough.', 34, 2.1, 1.4, 4, 'blade', false, 0.004, [ 'cut', 'skin', 'open_can' ], 0.32, 1, 'rare', [ 'military' ] ],
	[ 'machete', 'Machete', 'Long jungle blade. Clears brush and heads alike.', 46, 1.35, 1.85, 8, 'blade', false, 0.005, [ 'cut', 'chop', 'skin' ], 0.6, 3, 'common', [ 'farm', 'hardware', 'civilian' ] ],
	[ 'cane_knife', 'Cane knife', 'Hooked sugar-cane knife from the old plantations.', 44, 1.35, 1.8, 8, 'blade', false, 0.006, [ 'cut', 'chop' ], 0.65, 3, 'uncommon', [ 'farm' ] ],
	[ 'hatchet', 'Hatchet', 'Small axe. Chops wood and splits skulls.', 50, 1.25, 1.6, 9, 'axe', false, 0.004, [ 'chop', 'cut' ], 0.8, 2, 'common', [ 'hardware', 'farm', 'civilian' ] ],
	[ 'fire_axe', 'Fire axe', 'Heavy two-handed axe with a pick. Breaks doors too.', 85, 0.75, 2.1, 17, 'axe', true, 0.003, [ 'chop', 'pry' ], 2.6, 5, 'uncommon', [ 'fire_station', 'hardware' ] ],
	[ 'baseball_bat', 'Baseball bat', 'Aluminium bat. Solid two-handed hits.', 42, 1.05, 2.0, 11, 'blunt', true, 0.006, [], 1.0, 4, 'common', [ 'sports', 'civilian' ] ],
	[ 'nailed_bat', 'Nailed bat', 'A wooden bat with nails driven through it.', 56, 1.0, 2.0, 11, 'blunt', true, 0.012, [], 1.1, 4, 'uncommon', [ 'crafted' ] ],
	[ 'crowbar', 'Crowbar', 'Pries open doors, crates and heads.', 44, 1.1, 1.8, 10, 'blunt', false, 0.002, [ 'pry' ], 1.5, 3, 'uncommon', [ 'hardware', 'garage' ] ],
	[ 'lead_pipe', 'Lead pipe', 'A length of heavy pipe with an elbow joint.', 40, 1.05, 1.8, 10, 'blunt', false, 0.003, [], 1.4, 3, 'common', [ 'hardware', 'street' ] ],
	[ 'sledgehammer', 'Sledgehammer', 'Enormous two-handed hammer. Slow and devastating.', 95, 0.55, 2.0, 22, 'blunt', true, 0.002, [ 'break' ], 4.5, 6, 'uncommon', [ 'hardware', 'garage' ] ],
	[ 'shovel', 'Shovel', 'Digs holes, flattens heads.', 48, 0.85, 2.05, 14, 'blunt', true, 0.004, [ 'dig' ], 1.8, 5, 'common', [ 'farm', 'hardware', 'garage' ] ],
	[ 'golf_club', 'Golf club', 'A steel 7-iron from the resort course.', 34, 1.3, 2.0, 8, 'blunt', false, 0.015, [], 0.45, 4, 'common', [ 'sports', 'hotel' ] ],
	[ 'katana', 'Katana', 'A razor-sharp display katana that turns out to be real.', 72, 1.35, 2.1, 10, 'blade', true, 0.004, [ 'cut' ], 1.2, 5, 'rare', [ 'pawn', 'civilian' ] ],
	[ 'tire_iron', 'Tire iron', 'L-shaped lug wrench from a car trunk.', 38, 1.2, 1.7, 9, 'blunt', false, 0.002, [ 'pry', 'wrench' ], 1.0, 2, 'common', [ 'garage', 'car_trunk' ] ],
	[ 'frying_pan', 'Frying pan', 'Cast-iron skillet. Makes a satisfying sound.', 32, 1.15, 1.5, 9, 'blunt', false, 0.003, [ 'pan' ], 1.6, 3, 'common', [ 'kitchen' ] ],
	[ 'hammer', 'Hammer', 'Claw hammer. Handy for building and bashing.', 30, 1.6, 1.4, 6, 'blunt', false, 0.004, [ 'hammer', 'pry' ], 0.6, 2, 'common', [ 'hardware', 'toolbox', 'garage' ] ],
	[ 'wrench', 'Pipe wrench', 'Heavy adjustable wrench.', 32, 1.35, 1.5, 7, 'blunt', false, 0.003, [ 'wrench' ], 1.2, 2, 'common', [ 'hardware', 'toolbox', 'garage' ] ],
	[ 'pickaxe', 'Pickaxe', 'Two-handed pick. Digs, breaks rock and punches through skulls.', 72, 0.65, 2.0, 17, 'axe', true, 0.003, [ 'dig', 'pry', 'mine' ], 2.8, 6, 'uncommon', [ 'hardware', 'farm' ] ],
	[ 'fishing_spear', 'Fishing spear', 'Hawaiian three-prong spear. Long reach, catches fish in the shallows.', 40, 1.0, 2.6, 9, 'spear', true, 0.006, [ 'fish' ], 1.1, 5, 'common', [ 'beach', 'surf' ] ],
	[ 'canoe_paddle', 'Canoe paddle', 'Koa outrigger paddle. Better on the water than on a head.', 28, 1.0, 2.2, 10, 'blunt', true, 0.01, [ 'paddle' ], 1.0, 5, 'common', [ 'beach', 'surf' ] ],
	[ 'police_baton', 'Police baton', 'Telescopic steel baton.', 30, 1.75, 1.6, 6, 'blunt', false, 0.002, [], 0.5, 2, 'uncommon', [ 'police' ] ],
	[ 'broken_bottle', 'Broken bottle', 'A jagged bottle neck. Better than nothing, not by much.', 20, 2.0, 1.2, 4, 'blade', false, 0.12, [ 'cut' ], 0.3, 1, 'common', [ 'trash', 'bar' ] ],
];

const meleeDefs = MELEE.map( ( [ id, name, desc, damage, speed, reach, stamina, kind, twoHanded, wear, tools, weight, size, rarity, tags ] ) => ( {
	id, name, desc, cat: 'melee', weight, size, stack: 1, rarity, tags,
	melee: { damage, speed, reach, stamina, kind, twoHanded, wear, tools },
	model: { type: 'melee', kind: id },
} ) );

// ---- throwables ----------------------------------------------------------------------------------------------------

const throwableDefs = [
	{ id: 'grenade_frag', name: 'Frag grenade', desc: 'M67 fragmentation grenade. 4 s fuse. Hold fire to cook, release to throw.', weight: 0.4, size: 1, stack: 4, rarity: 'epic', tags: [ 'military' ],
		throwable: { kind: 'frag', fuse: 4, radius: 11, damage: 240 }, model: { type: 'throwable', kind: 'frag' } },
	{ id: 'grenade_smoke', name: 'Smoke grenade', desc: 'Thick white smoke for 30 s. Blocks sight lines.', weight: 0.5, size: 1, stack: 4, rarity: 'rare', tags: [ 'military', 'police' ],
		throwable: { kind: 'smoke', fuse: 1.6, radius: 9, damage: 0 }, model: { type: 'throwable', kind: 'smoke' } },
	{ id: 'grenade_flash', name: 'Flashbang', desc: 'Stun grenade. Blinds and deafens anything looking at it.', weight: 0.35, size: 1, stack: 4, rarity: 'rare', tags: [ 'police', 'military' ],
		throwable: { kind: 'flashbang', fuse: 1.8, radius: 14, damage: 4 }, model: { type: 'throwable', kind: 'flash' } },
	{ id: 'molotov', name: 'Molotov cocktail', desc: 'A bottle of fuel with a burning rag. Shatters into a pool of fire.', weight: 0.8, size: 2, stack: 3, rarity: 'uncommon', tags: [ 'crafted', 'civilian' ],
		throwable: { kind: 'molotov', fuse: 0, radius: 3.6, damage: 28 }, model: { type: 'throwable', kind: 'molotov' } },
].map( d => ( { cat: 'throwable', ...d } ) );

export const WEAPON_DEFS = [ ...ammoDefs, ...magDefs, ...firearmDefs, ...attachmentDefs, ...meleeDefs, ...throwableDefs ];
defineItems( WEAPON_DEFS );

// ids per group (tests, loot tables)
export const WEAPON_IDS = {
	firearms: firearmDefs.map( d => d.id ), ammo: ammoDefs.map( d => d.id ), magazines: magDefs.map( d => d.id ),
	attachments: attachmentDefs.map( d => d.id ), melee: meleeDefs.map( d => d.id ), throwables: throwableDefs.map( d => d.id ),
};
