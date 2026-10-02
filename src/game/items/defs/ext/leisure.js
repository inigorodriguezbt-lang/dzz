// Leisure (docs/ITEMS_PLAN.md "leisure"): what keeps a survivor sane a week into the outbreak.
//   reading: a skill book and a magazine for every skill (`read: { skill, xp, hours }`), plus comics, novels, a surf
//     magazine, a travel guide (Mark sights: the nearest fruit stand and beach camp on the map) and a ukulele songbook
//     (learns "songs": the ukulele and the harmonica get "Play songs", a bigger lift);
//   toys and games (`toy`): cards, hanafuda, kōnane, dice, a harmonica, a yo-yo, a puzzle cube, a handheld game on AA
//     cells, a plush honu to hug; a frisbee you throw to draw the infected away; a surfboard and a bodyboard you ride
//     at the shore (a game hour passes, a big lift);
//   vices: cigarettes in packs and cartons, cigars, rolled cigarettes (tobacco + papers), chewing tobacco, a vape
//     (charge it, refill it), all calming; smoking needs a lighter, matches or a fire and makes a little noise; a hip
//     flask you fill with any spirit (it then counts as spirits: drink it, clean a cut with it);
//   keepsakes (`admire` + `fun`): souvenirs and valuables you Admire once a game day, more with a collection; set out
//     on display (`leisure_decor`) they ease boredom nearby; a koa bowl serves ʻawa stronger than a plain bowl;
//   seasonal: a party popper (loud), a glow bracelet (a weak light for hours).
// Runtime: ../../ext/leisure/*.js (verbs, keepsakes, the display kind, numbers, sounds).
import { defineItems } from '../../ItemDB.js';
import { extendLoot } from '../../Loot.js';
import { addRecipes, R } from '../../recipes.js';
import { addCombos, unitsIn } from '../../combos.js';
import { isSpirit, flaskRoom, flaskName, FLASK_SHOTS, VAPE_TANK, vapeJuice } from '../../ext/leisure/logic.js';
import { smoke } from '../../ext/leisure/verbs.js';
import '../../ext/leisure/decor.js';
// the outdoor sites' tables (site_<kind>) are defined there; imported first so they can be extended here
import '../../sites/tables.js';

// ---- helpers ----------------------------------------------------------------------------------------------------------

const EXTRA = [ 'fun', 'read', 'admire', 'smoke', 'toy', 'ride', 'throwToy', 'puzzle', 'dice', 'flip', 'pop', 'glow', 'unbox', 'sights', 'place', 'noise',
	'dismantle', 'dismantleTools', 'tool', 'drink' ];
function base( id, name, cat, o ) {
	const d = { id, name, cat, desc: o.desc || '', weight: o.w ?? 0.1, size: o.size ?? 1, stack: o.stack ?? 1, rarity: o.rarity || 'common',
		tags: [ ...( o.pre || [] ), 'leisure', ...( o.tags || [] ) ], model: o.model };
	for ( const k of EXTRA ) if ( o[ k ] !== undefined ) d[ k ] = o[ k ];
	return d;
}
const misc = ( id, name, o ) => base( id, name, 'misc', { ...o, pre: [ 'misc' ] } );
const tool = ( id, name, kind, o ) => base( id, name, 'tool', { ...o, pre: [ 'tool' ], tool: { kind, ...( o.tool || {} ) } } );
// a book or magazine: `read` drives ItemUse.read (skill, xp, hours; once when it teaches)
const book = ( id, name, o ) => ( { ...base( id, name, 'book', { w: 0.4, ...o, pre: [ 'book', 'paper' ] } ), book: o.learn ? { skill: o.learn } : {} } );
const skillBook = ( id, name, skill, title, sub, color, glyph, o = {} ) => book( id, name, { rarity: 'uncommon', w: 0.55, read: { skill, xp: 160, hours: 2 },
	model: { type: 'book', color, title, sub, glyph, fg: o.fg ?? 0xf2e6c8, size: o.size ?? [ 0.23, 0.032, 0.16 ], style: o.style }, desc: `Read: ${o.what || skill} skill.`, tags: o.tags } );
const mag = ( id, name, skill, title, sub, bg, art, o = {} ) => book( id, name, { w: 0.15, size: 0.5, read: { skill, xp: 55, hours: 0.5 },
	model: { type: 'leis_mag', bg, fg: o.fg ?? 0xffffff, title, sub, art, artColor: o.artColor ?? 0xffffff, accent: o.accent ?? 0xf2c21a }, desc: `Read: ${o.what || skill} tips.`,
	tags: [ 'magazine', ...( o.tags || [] ) ] } );
const funBook = ( id, name, hours, fun, model, o = {} ) => book( id, name, { w: o.w ?? 0.3, size: o.size ?? 1, read: { hours }, fun, model, desc: o.desc || 'Eases boredom.', tags: o.tags, rarity: o.rarity,
	sights: o.sights } );
const P = ( type, o = {} ) => ( { type: 'leis_' + type, ...o } );
// keepsake: Admire it (fun once a day), set it out on display
const DISPLAY = { kind: 'leisure_decor', verb: 'Display', gerund: 'Setting out' };
const keep = ( id, name, o ) => misc( id, name, { admire: o.admire || {}, place: o.display === false ? undefined : DISPLAY, desc: o.desc || 'Admire to cheer up. Display it.', ...o } );

// the skill magazines (one per skill), for the tables
const MAGS = [ 'mag_fishing', 'mag_survival', 'mag_foraging', 'mag_first_aid', 'mag_cooking', 'mag_mechanics', 'mag_carpentry', 'mag_tailoring',
	'mag_electrical', 'mag_aiming', 'mag_reloading', 'mag_maintenance', 'mag_stealth' ];
const FUN_READ = [ 'comic_manga', 'comic_marchers', 'novel_romance', 'novel_mystery', 'surf_magazine' ];

// ======================================================================================================================
// the items
// ======================================================================================================================

defineItems( [
	// ================= skill books (the four guides already in the catalogue cover fishing, survival, foraging, first aid) =================
	skillBook( 'cookbook', 'ʻOno kine cooking', 'cooking', 'ʻONO KINE COOKING', 'Island recipes', 0xc0402a, 'fruit', { tags: [ 'kitchen' ] } ),
	skillBook( 'mechanic_manual', 'Island mechanic', 'mechanics', 'ISLAND MECHANIC', 'Engines and repairs', 0x2a3a4a, 'bolt', { fg: 0xf2c21a, tags: [ 'garage' ] } ),
	skillBook( 'carpentry_book', 'Post and beam', 'carpentry', 'POST & BEAM', 'Island carpentry', 0x6a4a2a, 'mountain', { fg: 0xf2e6c8 } ),
	skillBook( 'sewing_book', 'Sew it yourself', 'tailoring', 'SEW IT YOURSELF', 'Patterns and mending', 0xd86a8a, 'hibiscus', { fg: 0xffffff, what: 'tailoring' } ),
	skillBook( 'electronics_manual', 'Basic electronics', 'electrical', 'BASIC ELECTRONICS', 'Circuits explained', 0x1a5a3a, 'bolt', { fg: 0xe8f2e8, what: 'electrical' } ),
	skillBook( 'marksman_book', 'Marksman', 'aiming', 'MARKSMAN', 'Rifle fundamentals', 0x3a3a2a, 'dot', { fg: 0xe8d8a8, tags: [ 'hunting' ] } ),
	skillBook( 'reloading_manual', 'Reloader\'s handbook', 'reloading', 'RELOADER\'S HANDBOOK', 'Speed and feeding', 0x8a2a1a, 'bar', { fg: 0xf2e6c8 } ),
	skillBook( 'fixit_manual', 'Fix-it manual', 'maintenance', 'FIX-IT MANUAL', 'Tools and upkeep', 0xd8a020, 'bolt', { fg: 0x1a1a1a } ),
	skillBook( 'stalking_book', 'Still hunting', 'stealth', 'STILL HUNTING', 'Moving unseen', 0x3a4a2a, 'leaf', { fg: 0xd8e0c0, tags: [ 'hunting' ] } ),

	// ================= skill magazines =================
	mag( 'mag_fishing', 'Lawaiʻa magazine', 'fishing', 'LAWAIʻA', 'Shore & boat fishing', 0x1a6ab8, 'fish', { tags: [ 'fishing' ] } ),
	mag( 'mag_survival', 'Backcountry magazine', 'survival', 'BACKCOUNTRY', 'Hawaiʻi trails & camps', 0x3a5a2a, 'mountain' ),
	mag( 'mag_foraging', 'Island gardener', 'foraging', 'ISLAND GARDENER', 'Grow & gather', 0x5a8a2a, 'leaf' ),
	mag( 'mag_first_aid', 'Ocean safety bulletin', 'first_aid', 'OCEAN SAFETY', 'Lifeguard bulletin', 0xd82a2a, 'cross', { what: 'first aid' } ),
	mag( 'mag_cooking', 'Plate lunch magazine', 'cooking', 'PLATE LUNCH', 'Local kine grinds', 0xf28a1a, 'fruit', { fg: 0x1a1a1a, artColor: 0xc0282a } ),
	mag( 'mag_mechanics', 'Island wheels', 'mechanics', 'ISLAND WHEELS', 'Trucks & 4x4', 0x1a1a1a, 'bolt', { artColor: 0xf2c21a } ),
	mag( 'mag_carpentry', 'Woodshop magazine', 'carpentry', 'WOODSHOP', 'Build it right', 0x8a5a2a, 'mountain', { artColor: 0xf2d8a8 } ),
	mag( 'mag_tailoring', 'Aloha stitch', 'tailoring', 'ALOHA STITCH', 'Sew & mend', 0xe86a9a, 'hibiscus' ),
	mag( 'mag_electrical', 'Circuit magazine', 'electrical', 'CIRCUIT', 'Electronics hobbyist', 0x2a2a6a, 'bolt', { artColor: 0x5af2ff } ),
	mag( 'mag_aiming', 'Pig hunter', 'aiming', 'PIG HUNTER', 'Hawaiʻi hunting', 0x4a3a1a, 'meat', { artColor: 0xd8a070, tags: [ 'hunting' ] } ),
	mag( 'mag_reloading', 'Handloader', 'reloading', 'HANDLOADER', 'Faster reloads', 0x5a1a1a, 'bar', { artColor: 0xd4a64a } ),
	mag( 'mag_maintenance', 'Home fix-it', 'maintenance', 'HOME FIX-IT', 'Repair anything', 0x2a6a9a, 'bolt' ),
	mag( 'mag_stealth', 'Bow season', 'stealth', 'BOW SEASON', 'Bowhunting', 0x2a3a2a, 'leaf', { artColor: 0x9ac87a, tags: [ 'hunting' ] } ),

	// ================= reading for its own sake =================
	funBook( 'surf_magazine', 'Surf magazine', 0.5, { boredom: - 16, unhappy: - 6 }, P( 'mag', { bg: 0x1a9ad6, fg: 0xffffff, title: 'SWELL', sub: 'North Shore issue', art: 'wave', artColor: 0xffffff, accent: 0xf2c21a } ),
		{ w: 0.15, size: 0.5, tags: [ 'magazine', 'surf' ] } ),
	funBook( 'comic_manga', 'Manga', 0.5, { boredom: - 18, unhappy: - 6 }, { type: 'book', color: 0xf2f2f2, title: 'TSUNAMI NINJA', sub: 'Vol. 3', glyph: 'wave', fg: 0x1a1a1a, size: [ 0.18, 0.018, 0.13 ] },
		{ w: 0.2, size: 0.5, tags: [ 'comic' ] } ),
	funBook( 'comic_marchers', 'Horror comic', 0.5, { boredom: - 20, unhappy: - 4, stress: 3 }, { type: 'book', color: 0x1a1a2a, title: 'NIGHT MARCHERS', sub: '#1', glyph: 'mountain', fg: 0xe86a2a, size: [ 0.26, 0.006, 0.17 ] },
		{ w: 0.08, size: 0.5, tags: [ 'comic' ] } ),
	funBook( 'novel_romance', 'Romance novel', 2, { boredom: - 45, unhappy: - 14, stress: - 6 }, { type: 'book', color: 0xd85a7a, title: 'MOONLIGHT OVER LANIKAI', sub: 'A novel', glyph: 'hibiscus', fg: 0xfff2d8, size: [ 0.18, 0.03, 0.11 ] },
		{ tags: [ 'novel' ] } ),
	funBook( 'novel_mystery', 'Mystery novel', 2, { boredom: - 45, unhappy: - 12, stress: - 4 }, { type: 'book', color: 0x1a2a3a, title: 'MURDER ON MAUNA KEA', sub: 'A novel', glyph: 'mountain', fg: 0xd8c070, size: [ 0.18, 0.034, 0.11 ] },
		{ tags: [ 'novel' ] } ),
	funBook( 'travel_guide', 'Travel guide', 0.5, { boredom: - 12, unhappy: - 3 }, { type: 'book', color: 0x2aa8a0, title: 'ISLAND HOPPER', sub: 'Visitor\'s guide', glyph: 'palm', fg: 0xffffff, size: [ 0.2, 0.02, 0.12 ] },
		{ tags: [ 'tourist' ], desc: 'Marks fruit stands and beaches.', sights: [ 'farm_stand', 'beach_camp' ] } ),
	book( 'songbook', 'Ukulele songbook', { w: 0.3, rarity: 'uncommon', learn: 'songs', read: { hours: 1 }, tags: [ 'music' ],
		model: { type: 'book', color: 0xf2c21a, title: 'UKULELE SONGBOOK', sub: '50 island favorites', glyph: 'sun', fg: 0x5a2a0a, size: [ 0.28, 0.008, 0.21 ] },
		desc: 'Read: play songs on instruments.' } ),

	// ================= toys and games =================
	misc( 'playing_cards', 'Playing cards', { w: 0.1, size: 0.5, tags: [ 'game', 'paper' ], model: P( 'cards', { style: 'cards', color: 0xb8202a } ),
		toy: { verb: 'Play solitaire', gerund: 'Playing solitaire', time: 30, sound: 'leis_cards', light: true, calm: true, repeat: 600 },
		fun: { boredom: - 14, unhappy: - 3 }, desc: 'Play solitaire. Eases boredom.' } ),
	misc( 'hanafuda_deck', 'Hanafuda cards', { w: 0.1, size: 0.5, rarity: 'uncommon', tags: [ 'game', 'paper' ], model: P( 'cards', { style: 'hanafuda', color: 0x1a1a1a } ),
		toy: { verb: 'Play koi-koi', gerund: 'Playing koi-koi', time: 30, sound: 'leis_cards', light: true, calm: true, repeat: 600 },
		fun: { boredom: - 16, unhappy: - 4, stress: - 2 }, desc: 'Play koi-koi. Eases boredom.' } ),
	misc( 'dice', 'Dice', { w: 0.02, size: 0.2, tags: [ 'game', 'plastic' ], model: P( 'dice' ), dice: true, fun: { boredom: - 2 }, desc: 'Roll for fun.' } ),
	misc( 'konane_board', 'Kōnane board', { w: 1.4, size: 3, rarity: 'uncommon', tags: [ 'game', 'wood', 'local' ], model: P( 'konane' ),
		toy: { verb: 'Play kōnane', gerund: 'Playing kōnane', time: 45, sound: 'leis_dice', light: true, calm: true, repeat: 900 },
		fun: { boredom: - 22, unhappy: - 4, stress: - 4 }, desc: 'Play kōnane. Eases boredom.' } ),
	misc( 'harmonica', 'Harmonica', { w: 0.1, size: 0.5, rarity: 'uncommon', tags: [ 'music', 'metal' ], model: P( 'harmonica' ),
		toy: { time: 6, sound: 'leis_harmonica', noise: 30, songs: true, move: true },
		fun: { boredom: - 16, unhappy: - 6, stress: - 4 }, desc: 'Play to cheer up. Heard nearby.' } ),
	misc( 'yo_yo', 'Yo-yo', { w: 0.06, size: 0.5, tags: [ 'toy', 'plastic' ], model: P( 'yoyo', { color: 0xd82a2a } ),
		toy: { time: 6, sound: 'leis_yoyo', move: true }, fun: { boredom: - 7, stress: - 1 }, desc: 'Play, even on the move.' } ),
	misc( 'puzzle_cube', 'Puzzle cube', { w: 0.1, size: 0.5, tags: [ 'toy', 'plastic' ], model: P( 'cube' ), puzzle: { time: 40 },
		fun: { boredom: - 20, unhappy: - 4 }, desc: 'Solve it to pass the time.' } ),
	tool( 'handheld_game', 'Handheld game', 'handheld', { w: 0.25, size: 1, rarity: 'uncommon', tags: [ 'toy', 'device', 'electronics', 'plastic' ], tool: { battery: 6 },
		model: P( 'handheld', { color: 0x9aa0a8 } ), toy: { time: 15, sound: 'leis_beep', noise: 4, charge: 0.5, repeat: 300 },
		fun: { boredom: - 30, unhappy: - 6, stress: - 3 }, dismantle: [ [ 'circuit_board', 1, 0.6 ], [ 'electronic_scrap', 1 ], [ 'speaker', 1, 0.4 ] ], dismantleTools: [ 'screwdriver' ],
		desc: 'Play. Uses AA batteries.' } ),
	misc( 'frisbee', 'Frisbee', { w: 0.18, size: 2, tags: [ 'toy', 'sports', 'plastic' ], model: P( 'frisbee', { color: 0xf2702a } ), throwToy: 'frisbee',
		desc: 'Throw to draw the infected away.' } ),
	misc( 'plush_honu', 'Plush honu', { w: 0.25, size: 2, tags: [ 'toy', 'cloth', 'tourist' ], model: P( 'plush' ),
		toy: { verb: 'Hug', gerund: 'Hugging', time: 2, move: true, repeat: 600 }, fun: { stress: - 8, unhappy: - 5, panic: - 15 }, desc: 'Hug to calm down.' } ),
	misc( 'bodyboard', 'Bodyboard', { w: 1.2, size: 8, tags: [ 'surf', 'beach', 'plastic' ], model: P( 'bodyboard', { color: 0x1a8ad6, color2: 0xf2c21a } ), ride: 'bodyboard',
		desc: 'Ride waves at the shore.' } ),
	misc( 'surfboard', 'Surfboard', { w: 3.5, size: 16, rarity: 'uncommon', tags: [ 'surf', 'beach' ], model: P( 'surfboard', { color: 0xf4efe2, stripe: 0x1a8ad6 } ), ride: 'surf',
		desc: 'Surf at the shore.' } ),

	// ================= vices =================
	// packs and pouches count down in uses (tool.uses: itemUse.useUp), single smokes go one at a time
	misc( 'cigarettes', 'Cigarettes', { w: 0.03, size: 0.5, tags: [ 'tobacco', 'paper' ], tool: { kind: 'smokes', uses: 20 }, smoke: 'cigarette',
		model: P( 'pack', { brand: 'MAUKA', sub: 'Filter kings', color: 0xc0282a, band: 0xf2f2f2 } ), desc: 'Calms. Needs a light.' } ),
	misc( 'cigarette_carton', 'Cigarette carton', { w: 0.3, size: 2, rarity: 'uncommon', tags: [ 'tobacco', 'paper' ], unbox: [ 'cigarettes', 10 ],
		model: P( 'carton', { brand: 'MAUKA', sub: '10 packs · Filter kings', color: 0xc0282a, band: 0xf2f2f2 } ), desc: 'Open: ten packs.' } ),
	misc( 'cigar', 'Cigar', { w: 0.02, size: 0.3, stack: 5, rarity: 'uncommon', tags: [ 'tobacco' ], smoke: 'cigar', model: P( 'cigar' ),
		desc: 'Calms for longer. Needs a light.' } ),
	misc( 'rolled_cigarette', 'Rolled cigarette', { w: 0.002, size: 0.3, stack: 20, tags: [ 'tobacco', 'paper', 'crafted' ], smoke: 'cigarette', model: P( 'cig' ),
		desc: 'Calms. Needs a light.' } ),
	misc( 'tobacco_pouch', 'Tobacco pouch', { w: 0.08, size: 0.5, tags: [ 'tobacco' ], tool: { kind: 'tobacco', uses: 15 },
		model: { type: 'bag', size: [ 0.12, 0.1, 0.03 ], label: { bg: 0x3a5a2a, fg: 0xf2e6c8, text: 'PANIOLO', sub: 'Rolling tobacco', band: 0xd4a64a, style: 'band', size: 0.3 } },
		desc: 'Roll with papers.' } ),
	misc( 'rolling_papers', 'Rolling papers', { w: 0.01, size: 0.2, tags: [ 'tobacco', 'paper' ], tool: { kind: 'papers', uses: 32 }, model: P( 'papers' ),
		desc: 'Roll with tobacco.' } ),
	misc( 'chewing_tobacco', 'Chewing tobacco', { w: 0.05, size: 0.3, tags: [ 'tobacco' ], tool: { kind: 'chew', uses: 15 },
		model: P( 'tin', { color: 0x1a3a2a, text: 'KOA LEAF', sub: 'Wintergreen' } ), desc: 'Calms. No light needed.' } ),
	tool( 'vape', 'Vape pen', 'vape', { w: 0.08, size: 0.5, tags: [ 'tobacco', 'device', 'electronics', 'plastic' ], tool: { battery: 4, rechargeable: true, cell: 'usb' },
		model: P( 'vape', { color: 0x2a2e36 } ), dismantle: [ [ 'electronic_scrap', 1 ] ], dismantleTools: [ 'screwdriver' ], desc: 'Calms. Recharge and refill it.' } ),
	misc( 'vape_juice', 'Vape juice', { w: 0.04, size: 0.5, stack: 3, tags: [ 'tobacco', 'plastic' ],
		model: { type: 'pharm_dropper', color: 0xf2f2f2, cap: 0x2a8a6a, label: { text: 'GUAVA CLOUD', sub: 'E-liquid · 3 mg', bg: 0x2a8a6a, fg: 0xffffff, band: 0xf2c21a, style: 'plain', size: 0.3 } },
		desc: 'Refills a vape.' } ),
	misc( 'hip_flask', 'Hip flask', { w: 0.2, size: 0.5, rarity: 'uncommon', tags: [ 'metal', 'bar' ], model: P( 'flask' ), desc: 'Fill with spirits.' } ),
	base( 'hip_flask_full', 'Flask (spirits)', 'drink', { w: 0.45, size: 0.5, rarity: 'uncommon', pre: [ 'drink' ], tags: [ 'crafted', 'metal' ], model: P( 'flask', { cap: true } ),
		drink: { water: 6, kcal: 300, alcohol: 0.3, caffeine: 0, container: 'hip_flask', sick: 0, portions: FLASK_SHOTS }, desc: 'A few shots of spirits.' } ),

	// ================= keepsakes and valuables =================
	keep( 'snow_globe', 'Snow globe (Waikīkī)', { w: 0.4, size: 1, tags: [ 'tourist', 'glass' ], model: P( 'globe' ), admire: { verb: 'Shake', gerund: 'Shaking', time: 5, sound: 'leis_chime' },
		fun: { boredom: - 10, unhappy: - 5 }, desc: 'Shake to cheer up. Display it.' } ),
	keep( 'hula_figure', 'Hula dashboard figure', { w: 0.2, size: 1, tags: [ 'tourist', 'plastic', 'car' ], model: P( 'hula' ), fun: { boredom: - 8, unhappy: - 4 } } ),
	keep( 'koa_bowl', 'Koa bowl', { w: 0.5, size: 2, rarity: 'uncommon', tags: [ 'tourist', 'wood', 'local' ], model: P( 'bowl' ), fun: { boredom: - 6, unhappy: - 5, stress: - 2 },
		desc: 'Serve ʻawa in it. Admire it.' } ),
	keep( 'niihau_lei', 'Niʻihau shell lei', { w: 0.05, size: 0.5, rarity: 'rare', tags: [ 'valuable', 'tourist', 'shell' ], model: P( 'shells' ), fun: { boredom: - 8, unhappy: - 10 } } ),
	keep( 'whale_tooth_pendant', 'Whale tooth pendant', { w: 0.05, size: 0.3, rarity: 'uncommon', tags: [ 'tourist', 'plastic' ], model: P( 'pendant' ), display: false,
		fun: { boredom: - 6, unhappy: - 6 }, desc: 'A replica. Admire it.' } ),
	keep( 'quarter_set', 'Hawaiʻi quarter set', { w: 0.15, size: 0.5, rarity: 'uncommon', tags: [ 'tourist', 'metal', 'paper' ], model: P( 'coins' ), fun: { boredom: - 8, unhappy: - 3 } } ),
	keep( 'surf_trophy', 'Surf trophy', { w: 1.2, size: 3, rarity: 'rare', tags: [ 'surf', 'metal' ], model: P( 'trophy' ), fun: { boredom: - 8, unhappy: - 8 } } ),
	keep( 'duke_poster', 'Duke poster', { w: 0.2, size: 2, rarity: 'uncommon', tags: [ 'paper', 'surf' ], model: P( 'poster' ), fun: { boredom: - 8, unhappy: - 6 } } ),
	keep( 'signed_baseball', 'Signed baseball', { w: 0.15, size: 1, rarity: 'rare', tags: [ 'valuable', 'sports', 'leather' ], model: P( 'ball' ), throwToy: 'ball',
		fun: { boredom: - 8, unhappy: - 6 }, desc: 'Admire it. Throw it to distract.' } ),
	keep( 'vinyl_record', 'Vinyl record', { w: 0.25, size: 1, tags: [ 'music', 'plastic', 'paper' ], model: P( 'vinyl' ), fun: { boredom: - 8, unhappy: - 6 } } ),
	base( 'pocket_watch', 'Pocket watch', 'tool', { w: 0.12, size: 0.3, rarity: 'uncommon', pre: [ 'tool' ], tags: [ 'valuable', 'metal' ], tool: { kind: 'watch' },
		model: P( 'pocketwatch' ), admire: {}, fun: { boredom: - 6, unhappy: - 4 }, desc: 'Shows the time. Admire it.' } ),
	keep( 'gold_coin', 'Gold coin', { w: 0.03, size: 0.3, stack: 10, rarity: 'rare', tags: [ 'valuable', 'metal' ], model: P( 'coin' ), flip: true, display: false,
		fun: { boredom: - 5, unhappy: - 6 }, desc: 'Flip it. Admire it.' } ),
	base( 'luxury_watch', 'Luxury watch', 'tool', { w: 0.15, size: 0.3, rarity: 'epic', pre: [ 'tool' ], tags: [ 'valuable', 'metal' ], tool: { kind: 'watch' },
		model: P( 'watch' ), admire: {}, fun: { boredom: - 6, unhappy: - 8 }, desc: 'Shows the time. Admire it.' } ),

	// ================= seasonal =================
	misc( 'party_popper', 'Party popper', { w: 0.02, size: 0.5, stack: 6, tags: [ 'party', 'paper' ], model: P( 'popper' ), pop: 14,
		fun: { boredom: - 5, unhappy: - 4 }, desc: 'Pop it for fun. Loud.' } ),
	tool( 'glow_bracelet', 'Glow bracelet', 'chemlight', { w: 0.01, size: 0.3, stack: 5, tags: [ 'party', 'plastic' ], glow: true,
		tool: { battery: 6, light: { kind: 'point', range: 3.5, color: 0xff4ad8, intensity: 1.4 } }, place: { kind: 'light' }, model: P( 'glow', { color: 0xff4ad8 } ),
		fun: { boredom: - 4, unhappy: - 3 }, desc: 'A weak light for hours.' } ),

	// ================= made =================
	base( 'kava_koa', 'ʻAwa (koa bowl)', 'drink', { w: 0.8, size: 2, rarity: 'uncommon', pre: [ 'drink' ], tags: [ 'crafted', 'local' ], model: P( 'bowl', { fill: 0x9a8a68 } ),
		drink: { water: 16, kcal: 10, alcohol: 0, caffeine: 0, container: 'koa_bowl', sick: 0, portions: 1 }, fun: { stress: - 30, panic: - 12, unhappy: - 8 }, desc: 'Calms the nerves.' } ),
] );

// ======================================================================================================================
// where they lie (building loot spots on shelves, tables and floors, and the outdoor sites: all visible)
// ======================================================================================================================

const I = ( ids, w, q ) => ( { ids, w, q } );
const add = ( t, e ) => extendLoot( t, e );

// ---- homes ----
add( 'house_living', [ [ 'playing_cards', 0.45 ], [ 'dice', 0.2 ], [ 'hanafuda_deck', 0.15 ], [ 'konane_board', 0.08 ], [ 'puzzle_cube', 0.2 ], [ 'yo_yo', 0.12 ],
	[ 'handheld_game', 0.18 ], [ 'harmonica', 0.08 ], [ 'plush_honu', 0.12 ], [ 'snow_globe', 0.2 ], [ 'hula_figure', 0.1 ], [ 'koa_bowl', 0.12 ], [ 'vinyl_record', 0.25 ],
	[ 'duke_poster', 0.08 ], [ 'surf_trophy', 0.03 ], [ 'signed_baseball', 0.02 ], [ 'quarter_set', 0.06 ], I( FUN_READ, 0.6 ), [ 'travel_guide', 0.1 ], [ 'songbook', 0.08 ],
	[ 'cigarettes', 0.3 ], [ 'chewing_tobacco', 0.06 ], [ 'cigar', 0.04 ], [ 'vape', 0.1 ], [ 'party_popper', 0.1 ], I( MAGS, 0.45 ) ] );
add( 'house_bedroom', [ I( FUN_READ, 0.5 ), [ 'plush_honu', 0.2 ], [ 'handheld_game', 0.12 ], [ 'puzzle_cube', 0.1 ], [ 'yo_yo', 0.06 ], [ 'playing_cards', 0.12 ],
	[ 'glow_bracelet', 0.1, [ 1, 3 ] ], [ 'pocket_watch', 0.05 ], [ 'gold_coin', 0.02 ], [ 'luxury_watch', 0.012 ], [ 'niihau_lei', 0.02 ], [ 'whale_tooth_pendant', 0.05 ],
	[ 'cigarettes', 0.2 ], [ 'vape', 0.1 ], [ 'vape_juice', 0.06 ], [ 'rolling_papers', 0.06 ], [ 'tobacco_pouch', 0.05 ], [ 'sewing_book', 0.08 ], [ 'harmonica', 0.04 ],
	[ 'hip_flask', 0.04 ], I( MAGS, 0.2 ) ] );
add( 'house_kitchen', [ [ 'cookbook', 0.15 ], [ 'mag_cooking', 0.15 ], [ 'koa_bowl', 0.06 ] ] );
add( 'house_garage', [ [ 'mechanic_manual', 0.1 ], [ 'carpentry_book', 0.08 ], [ 'fixit_manual', 0.1 ], [ 'mag_mechanics', 0.15 ], [ 'mag_carpentry', 0.1 ], [ 'mag_maintenance', 0.1 ],
	[ 'frisbee', 0.12 ], [ 'bodyboard', 0.15 ], [ 'surfboard', 0.08 ], [ 'cigarettes', 0.15 ], [ 'duke_poster', 0.04 ] ] );

// ---- shops ----
add( 'convenience', [ [ 'cigarettes', 1.4 ], [ 'cigarette_carton', 0.15 ], [ 'chewing_tobacco', 0.4 ], [ 'rolling_papers', 0.35 ], [ 'tobacco_pouch', 0.25 ], [ 'vape', 0.25 ],
	[ 'vape_juice', 0.4 ], [ 'party_popper', 0.25, [ 1, 4 ] ], [ 'glow_bracelet', 0.25, [ 1, 4 ] ], I( MAGS, 0.9 ), [ 'comic_manga', 0.15 ], [ 'surf_magazine', 0.25 ],
	[ 'playing_cards', 0.25 ], [ 'dice', 0.08 ] ] );
add( 'gas_station', [ [ 'cigarettes', 1.2 ], [ 'cigarette_carton', 0.15 ], [ 'chewing_tobacco', 0.35 ], [ 'rolling_papers', 0.25 ], [ 'tobacco_pouch', 0.15 ], [ 'vape', 0.15 ],
	[ 'vape_juice', 0.25 ], I( MAGS, 0.6 ), [ 'mag_mechanics', 0.25 ], [ 'travel_guide', 0.25 ], [ 'glow_bracelet', 0.15, [ 1, 3 ] ], [ 'party_popper', 0.1 ],
	[ 'hula_figure', 0.2 ], [ 'snow_globe', 0.08 ], [ 'playing_cards', 0.15 ] ] );
add( 'bar', [ [ 'cigarettes', 0.7 ], [ 'cigar', 0.35, [ 1, 3 ] ], [ 'playing_cards', 0.4 ], [ 'dice', 0.4 ], [ 'hanafuda_deck', 0.15 ], [ 'hip_flask', 0.25 ], [ 'duke_poster', 0.12 ],
	[ 'vinyl_record', 0.15 ], [ 'surf_trophy', 0.04 ], [ 'signed_baseball', 0.03 ], [ 'vape', 0.1 ], [ 'rolling_papers', 0.12 ] ] );
add( 'surf', [ [ 'surfboard', 0.7 ], [ 'bodyboard', 0.9 ], [ 'surf_magazine', 0.5 ], [ 'surf_trophy', 0.06 ], [ 'duke_poster', 0.18 ], [ 'frisbee', 0.15 ] ] );
add( 'sports', [ [ 'frisbee', 0.7 ], [ 'yo_yo', 0.15 ], [ 'signed_baseball', 0.06 ], [ 'bodyboard', 0.3 ], [ 'surfboard', 0.12 ], [ 'stalking_book', 0.15 ], [ 'mag_stealth', 0.15 ],
	[ 'mag_aiming', 0.15 ], [ 'mag_fishing', 0.15 ], [ 'mag_survival', 0.15 ], [ 'surf_trophy', 0.04 ] ] );
add( 'pawn', [ [ 'luxury_watch', 0.1 ], [ 'pocket_watch', 0.4 ], [ 'gold_coin', 0.3, [ 1, 3 ] ], [ 'signed_baseball', 0.2 ], [ 'vinyl_record', 0.4 ], [ 'quarter_set', 0.3 ],
	[ 'niihau_lei', 0.1 ], [ 'whale_tooth_pendant', 0.2 ], [ 'surf_trophy', 0.15 ], [ 'duke_poster', 0.15 ], [ 'handheld_game', 0.3 ], [ 'harmonica', 0.15 ], [ 'surfboard', 0.2 ],
	[ 'hanafuda_deck', 0.08 ], [ 'hip_flask', 0.15 ] ] );
add( 'hotel_room', [ [ 'snow_globe', 0.35 ], [ 'hula_figure', 0.2 ], [ 'travel_guide', 0.45 ], [ 'quarter_set', 0.12 ], [ 'playing_cards', 0.3 ], [ 'cigarettes', 0.2 ],
	[ 'cigar', 0.06 ], [ 'hip_flask', 0.06 ], I( FUN_READ, 0.6 ), [ 'vape', 0.1 ], [ 'party_popper', 0.06 ], [ 'glow_bracelet', 0.12 ], [ 'whale_tooth_pendant', 0.06 ],
	[ 'luxury_watch', 0.012 ], [ 'plush_honu', 0.1 ] ] );
add( 'clothing_store', [ [ 'sewing_book', 0.2 ], [ 'mag_tailoring', 0.25 ], [ 'glow_bracelet', 0.15, [ 1, 3 ] ] ] );
add( 'hardware', [ [ 'carpentry_book', 0.25 ], [ 'fixit_manual', 0.25 ], [ 'electronics_manual', 0.1 ], [ 'mechanic_manual', 0.08 ], [ 'mag_carpentry', 0.25 ], [ 'mag_maintenance', 0.25 ],
	[ 'mag_electrical', 0.15 ] ] );
add( 'garage_shop', [ [ 'mechanic_manual', 0.25 ], [ 'mag_mechanics', 0.35 ], [ 'fixit_manual', 0.12 ], [ 'hula_figure', 0.08 ], [ 'cigarettes', 0.25 ], [ 'chewing_tobacco', 0.1 ] ] );
add( 'gunstore', [ [ 'marksman_book', 0.45 ], [ 'reloading_manual', 0.45 ], [ 'mag_aiming', 0.45 ], [ 'mag_reloading', 0.45 ], [ 'stalking_book', 0.15 ], [ 'mag_stealth', 0.15 ],
	[ 'chewing_tobacco', 0.12 ] ] );
add( 'market', [ [ 'koa_bowl', 0.25 ], [ 'mag_cooking', 0.15 ], [ 'hula_figure', 0.08 ], [ 'mag_foraging', 0.12 ] ] );

// ---- services and public buildings ----
add( 'school', [ [ 'cookbook', 0.1 ], [ 'carpentry_book', 0.1 ], [ 'sewing_book', 0.1 ], [ 'electronics_manual', 0.15 ], I( MAGS, 0.35 ), [ 'comic_manga', 0.3 ],
	[ 'comic_marchers', 0.2 ], [ 'puzzle_cube', 0.3 ], [ 'yo_yo', 0.3 ], [ 'handheld_game', 0.15 ], [ 'playing_cards', 0.2 ], [ 'frisbee', 0.15 ], [ 'songbook', 0.25 ],
	[ 'harmonica', 0.06 ], [ 'dice', 0.08 ], [ 'glow_bracelet', 0.12, [ 1, 3 ] ], [ 'party_popper', 0.06 ] ] );
add( 'office', [ I( MAGS, 0.25 ), I( FUN_READ, 0.15 ), [ 'puzzle_cube', 0.15 ], [ 'playing_cards', 0.1 ], [ 'cigarettes', 0.25 ], [ 'vape', 0.15 ], [ 'fixit_manual', 0.04 ],
	[ 'electronics_manual', 0.06 ], [ 'duke_poster', 0.04 ], [ 'hula_figure', 0.08 ], [ 'surf_trophy', 0.02 ], [ 'snow_globe', 0.08 ] ] );
add( 'desk', [ [ 'cigarettes', 0.25 ], [ 'vape', 0.12 ], [ 'playing_cards', 0.08 ], [ 'dice', 0.06 ], [ 'puzzle_cube', 0.12 ], [ 'yo_yo', 0.06 ], [ 'hula_figure', 0.1 ],
	[ 'snow_globe', 0.06 ], [ 'pocket_watch', 0.03 ], [ 'gold_coin', 0.015 ], I( MAGS, 0.15 ), [ 'comic_manga', 0.06 ] ] );
add( 'church', [ [ 'songbook', 0.45 ], [ 'hanafuda_deck', 0.15 ], [ 'cookbook', 0.15 ], [ 'sewing_book', 0.15 ], [ 'novel_romance', 0.1 ], [ 'party_popper', 0.12 ], [ 'glow_bracelet', 0.08 ] ] );
add( 'post', [ I( MAGS, 0.5 ), [ 'quarter_set', 0.12 ], [ 'travel_guide', 0.15 ], [ 'comic_marchers', 0.1 ], [ 'surf_magazine', 0.1 ] ] );
add( 'police', [ [ 'marksman_book', 0.08 ], [ 'mag_aiming', 0.08 ], [ 'reloading_manual', 0.08 ], [ 'cigarettes', 0.2 ] ] );
add( 'military', [ [ 'marksman_book', 0.12 ], [ 'reloading_manual', 0.12 ], [ 'cigarettes', 0.25 ], [ 'playing_cards', 0.25 ], [ 'dice', 0.08 ] ] );
add( 'military_locker', [ [ 'reloading_manual', 0.12 ], [ 'marksman_book', 0.08 ], [ 'mag_aiming', 0.1 ], [ 'cigarettes', 0.3 ], [ 'playing_cards', 0.25 ], [ 'harmonica', 0.04 ],
	[ 'hip_flask', 0.08 ], [ 'chewing_tobacco', 0.15 ] ] );
add( 'fire_station', [ [ 'fixit_manual', 0.08 ], [ 'mag_first_aid', 0.25 ], [ 'playing_cards', 0.25 ], [ 'cigarettes', 0.1 ] ] );
add( 'hospital', [ [ 'mag_first_aid', 0.15 ], [ 'novel_romance', 0.08 ], [ 'plush_honu', 0.1 ], [ 'playing_cards', 0.08 ] ] );
add( 'clinic', [ [ 'mag_first_aid', 0.2 ], [ 'surf_magazine', 0.08 ] ] );
add( 'observatory', [ [ 'electronics_manual', 0.15 ], [ 'mag_electrical', 0.15 ], [ 'playing_cards', 0.15 ], [ 'novel_mystery', 0.08 ], [ 'puzzle_cube', 0.08 ] ] );
add( 'farm', [ [ 'mag_foraging', 0.25 ], [ 'stalking_book', 0.08 ], [ 'mag_aiming', 0.12 ], [ 'chewing_tobacco', 0.25 ], [ 'cigarettes', 0.15 ] ] );
add( 'warehouse', [ [ 'fixit_manual', 0.08 ], [ 'carpentry_book', 0.08 ], [ 'mag_mechanics', 0.08 ], [ 'cigarettes', 0.15 ], [ 'cigarette_carton', 0.06 ] ] );
add( 'restaurant_kitchen', [ [ 'cookbook', 0.25 ], [ 'mag_cooking', 0.25 ] ] );
add( 'restaurant', [ [ 'mag_cooking', 0.08 ], [ 'cigarettes', 0.08 ] ] );
add( 'hangar', [ [ 'mag_mechanics', 0.15 ], [ 'mechanic_manual', 0.08 ], [ 'playing_cards', 0.15 ], [ 'cigarettes', 0.15 ] ] );
add( 'beach', [ [ 'frisbee', 0.25 ], [ 'bodyboard', 0.15 ], [ 'surf_magazine', 0.15 ], [ 'cigarettes', 0.15 ], [ 'glow_bracelet', 0.08 ] ] );
add( 'street', [ [ 'cigarettes', 0.25 ], [ 'rolled_cigarette', 0.1, [ 1, 3 ] ], [ 'comic_marchers', 0.08 ], [ 'party_popper', 0.06 ] ] );
add( 'trash', [ [ 'cigarettes', 0.15 ], I( MAGS, 0.12 ), [ 'comic_manga', 0.06 ] ] );

// ---- outdoor sites ----
add( 'site_beach_camp', [ [ 'frisbee', 0.6 ], [ 'bodyboard', 0.45 ], [ 'surfboard', 0.18 ], [ 'surf_magazine', 0.4 ], [ 'playing_cards', 0.25 ], [ 'novel_romance', 0.25 ],
	[ 'cigarettes', 0.3 ], [ 'vape', 0.15 ], [ 'glow_bracelet', 0.15 ], [ 'party_popper', 0.1 ], [ 'plush_honu', 0.08 ], [ 'hip_flask', 0.06 ], [ 'snow_globe', 0.04 ],
	[ 'travel_guide', 0.25 ] ] );
add( 'site_picnic', [ [ 'frisbee', 0.5 ], [ 'playing_cards', 0.35 ], [ 'dice', 0.15 ], [ 'hanafuda_deck', 0.15 ], [ 'konane_board', 0.12 ], [ 'party_popper', 0.3, [ 1, 3 ] ],
	[ 'glow_bracelet', 0.15 ], [ 'cigarettes', 0.25 ], [ 'harmonica', 0.08 ], [ 'yo_yo', 0.15 ], I( MAGS, 0.15 ) ] );
add( 'site_campsite', [ [ 'playing_cards', 0.35 ], [ 'harmonica', 0.15 ], [ 'hip_flask', 0.15 ], [ 'cigarettes', 0.35 ], [ 'rolling_papers', 0.15 ], [ 'tobacco_pouch', 0.15 ],
	[ 'mag_survival', 0.2 ], [ 'stalking_book', 0.08 ], [ 'novel_mystery', 0.15 ], [ 'mag_fishing', 0.12 ], [ 'glow_bracelet', 0.12 ], [ 'dice', 0.08 ] ] );
add( 'site_body', [ [ 'cigarettes', 0.45 ], [ 'rolled_cigarette', 0.15, [ 1, 4 ] ], [ 'hip_flask', 0.12 ], [ 'playing_cards', 0.12 ], [ 'pocket_watch', 0.05 ], [ 'gold_coin', 0.03 ],
	I( FUN_READ, 0.1 ), [ 'plush_honu', 0.04 ], [ 'handheld_game', 0.06 ], [ 'mag_survival', 0.08 ] ] );
add( 'site_bus_stop', [ I( MAGS, 0.4 ), [ 'comic_manga', 0.15 ], [ 'comic_marchers', 0.1 ], [ 'novel_romance', 0.1 ], [ 'cigarettes', 0.35 ], [ 'vape', 0.15 ],
	[ 'handheld_game', 0.08 ], [ 'yo_yo', 0.08 ], [ 'travel_guide', 0.12 ] ] );
add( 'site_roadside', [ I( FUN_READ, 0.2 ), [ 'travel_guide', 0.15 ], [ 'snow_globe', 0.12 ], [ 'hula_figure', 0.12 ], [ 'cigarettes', 0.25 ], [ 'vape', 0.12 ],
	[ 'handheld_game', 0.08 ], [ 'plush_honu', 0.08 ], [ 'playing_cards', 0.12 ], [ 'quarter_set', 0.04 ], [ 'luxury_watch', 0.008 ] ] );
add( 'site_hiker', [ [ 'harmonica', 0.12 ], [ 'mag_survival', 0.15 ], [ 'mag_foraging', 0.12 ], [ 'stalking_book', 0.06 ], [ 'cigarettes', 0.15 ], [ 'hip_flask', 0.08 ],
	[ 'playing_cards', 0.08 ], [ 'novel_mystery', 0.08 ] ] );
add( 'site_fishing_spot', [ [ 'mag_fishing', 0.35 ], [ 'cigarettes', 0.25 ], [ 'chewing_tobacco', 0.15 ], [ 'playing_cards', 0.08 ], [ 'hip_flask', 0.08 ] ] );
add( 'site_crash_car', [ [ 'hula_figure', 0.25 ], [ 'cigarettes', 0.25 ], [ 'cigarette_carton', 0.08 ], [ 'travel_guide', 0.12 ], I( MAGS, 0.15 ), [ 'handheld_game', 0.08 ] ] );
add( 'site_fema_camp', [ [ 'playing_cards', 0.35 ], [ 'dice', 0.08 ], [ 'cigarettes', 0.35 ], I( FUN_READ, 0.3 ), [ 'plush_honu', 0.15 ], [ 'puzzle_cube', 0.08 ] ] );
add( 'site_military_checkpoint', [ [ 'playing_cards', 0.25 ], [ 'cigarettes', 0.35 ], [ 'chewing_tobacco', 0.15 ], [ 'mag_aiming', 0.08 ], [ 'harmonica', 0.04 ] ] );
add( 'site_checkpoint', [ [ 'cigarettes', 0.25 ], [ 'playing_cards', 0.08 ] ] );
add( 'site_heli_crash', [ [ 'playing_cards', 0.15 ], [ 'cigarettes', 0.15 ] ] );
add( 'site_farm_stand', [ [ 'mag_foraging', 0.15 ], [ 'koa_bowl', 0.1 ], [ 'chewing_tobacco', 0.08 ] ] );
add( 'site_supply_drop', [ [ 'playing_cards', 0.15 ] ] );
add( 'site_stash', [ [ 'gold_coin', 0.35, [ 1, 4 ] ], [ 'luxury_watch', 0.05 ], [ 'pocket_watch', 0.15 ], [ 'cigarette_carton', 0.15 ], [ 'hip_flask', 0.12 ] ] );
add( 'site_stash_rich', [ [ 'gold_coin', 0.5, [ 2, 6 ] ], [ 'luxury_watch', 0.12 ], [ 'niihau_lei', 0.08 ], [ 'signed_baseball', 0.05 ] ] );

// ---- pockets (menus only; the items above all lie somewhere visible too) ----
add( 'zombie_civilian', [ [ 'cigarettes', 0.35 ], [ 'vape', 0.1 ], [ 'rolled_cigarette', 0.08 ] ] );
add( 'zombie_tourist', [ [ 'snow_globe', 0.15 ], [ 'hula_figure', 0.08 ], [ 'travel_guide', 0.15 ], [ 'quarter_set', 0.04 ] ] );
add( 'zombie_police', [ [ 'cigarettes', 0.2 ] ] );
add( 'zombie_military', [ [ 'cigarettes', 0.25 ], [ 'playing_cards', 0.12 ], [ 'chewing_tobacco', 0.1 ] ] );
add( 'car_glovebox', [ [ 'cigarettes', 0.4 ], [ 'hula_figure', 0.15 ], [ 'travel_guide', 0.2 ], [ 'vape', 0.1 ] ] );

// ======================================================================================================================
// mixes
// ======================================================================================================================

const SPIRIT = { fn: isSpirit, not: { ids: [ 'hip_flask_full' ] } };
const SMOKABLE = { fn: ( s, d ) => !! d.smoke };
// a vape not yet full (a full one refuses softly, so the drag passes it by)
const vapeFull = ( c ) => vapeJuice( c.b ) >= VAPE_TANK ? { reason: 'Full', soft: true } : null;

addCombos( [
	// a hip flask topped up from any bottle of spirits: up to four shots
	{ id: 'leis_fill_flask', verb: 'Fill', label: 'Fill flask', a: SPIRIT, b: { ids: [ 'hip_flask', 'hip_flask_full' ] }, use: { a: 0, b: 0 }, time: 4, sound: 'pour',
		check: ( c ) => flaskRoom( c.b ) <= 0 ? { reason: 'Full', soft: true } : unitsIn( c.a, 'portions' ) < 1 ? 'Empty' : null,
		run: ( c ) => {
			const room = flaskRoom( c.b ), n = Math.min( room, unitsIn( c.a, 'portions' ) );
			const was = c.b.id === 'hip_flask_full' ? ( c.b.data.left ?? FLASK_SHOTS ) : 0;
			c.consume( c.a, n );
			if ( c.b.id === 'hip_flask' ) c.replace( c.b, 'hip_flask_full', { left: n, name: flaskName( c.A ) } );
			else { c.b.data.left = was + n; if ( ! c.b.data.name ) c.b.data.name = flaskName( c.A ); }
		} },
	// ʻawa served in koa: the old way, and it hits harder
	{ id: 'leis_koa_kava', verb: 'Mix', label: 'Mix ʻawa in koa bowl', a: 'kava_powder', b: 'koa_bowl', use: { a: 1, b: 0 }, liquid: { kind: 'water', litres: 0.3 },
		time: 10, sound: 'pour', skill: 'cooking', xp: 2, run: ( c ) => c.replace( c.b, 'kava_koa', {} ) },
	// tobacco rolled in a paper
	{ id: 'leis_roll_cigarette', verb: 'Roll', label: 'Roll cigarette', a: { tool: 'papers' }, b: { tool: 'tobacco' }, use: { a: 1, b: 1 },
		out: [ 'rolled_cigarette', 1 ], time: 6, sound: 'tear' },
	// a light dragged onto something to smoke lights it up (the smoke itself is the verb's timed action)
	{ id: 'leis_light_up', verb: 'Light up', label: 'Light up {b}', a: { tool: [ 'lighter', 'matches' ] }, b: SMOKABLE, use: { a: 0, b: 0 }, time: 0,
		check: ( c ) => ( c.use?.usesLeft?.( c.a ) ?? 1 ) > 0 ? null : 'Empty',
		run: ( c ) => { smoke( c.game, c.b, c.B, c.a ); } },
	// a vape refilled from a bottle of juice
	{ id: 'leis_refill_vape', verb: 'Refill', label: 'Refill vape', a: 'vape_juice', b: { tool: 'vape' }, use: { a: 1, b: 0 }, time: 3, sound: 'pour', check: vapeFull,
		run: ( c ) => { c.b.data.juice = VAPE_TANK; } },
] );

// made at a bench: a board game from a plank and pebbles, dice whittled from bone
addRecipes( [
	R( 'leis_konane', 'Kōnane board', [ 'konane_board', 1 ], [ [ 'planks', 1 ], [ 'stone', 2 ] ], { tools: [ 'cut' ], time: 30, cat: 'tools', skill: 'carpentry', xp: 10 } ),
	R( 'leis_bone_dice', 'Bone dice', [ 'dice', 1 ], [ [ 'bone', 1 ] ], { tools: [ 'cut' ], time: 20, cat: 'tools', skill: 'carpentry', xp: 6 } ),
] );
