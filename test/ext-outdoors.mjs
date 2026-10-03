// The outdoors domain (Node, a fake DOM for the canvas-drawn labels): node test/ext-outdoors.mjs
//   every new item: a model builder, a place to be found (or made), something to do with it, short text
//   the numbers (ext/outdoors/logic.js): traps, spearfishing, the net, the still, mosquitoes, the pig trap
//   mixes and recipes on the real Combine / Crafting with a stub game: husking a coconut, sennit and rope, line from
//   paracord, the bedroll, filters, lighting a torch with the sun or a bow drill, squid into bait
//   verbs on the real ItemUse: spearfishing in the sea, the throw net, the filter straw, bug spray, the blanket, cutting
//   fronds and bamboo, knapping, the deer call, the signal mirror, lighting a campfire without a lighter
//   the placed kinds on the real Placeables: the ʻie and crab traps, the smoking rack, the tanning frame, the pig trap,
//   the solar still, the lean-to keeping the rain off, beds, the chair, the mosquito coil; save and load
//   the fishing hook (lures, squid jigs) on the real Fishing; the coconut shell; the stringer; mosquitoes at dusk
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const warnings = [];
const warn0 = console.warn;
console.warn = ( ...a ) => { warnings.push( a.join( ' ' ) ); };
await import( '../src/game/items/defs/index.js' );
console.warn = warn0;
const THREE = await import( 'three' );
const C = await import( '../src/game/items/combos.js' );
const { ITEMS, getItem, makeStack } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, rollLoot, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const { hasModelBuilder } = await import( '../src/render/ItemModels.js' );
const { PlayerInventory } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );
const { Placeables } = await import( '../src/game/items/Placeables.js' );
const { Physics } = await import( '../src/game/Physics.js' );
const { Fishing } = await import( '../src/game/items/Fishing.js' );
const R = await import( '../src/game/items/placeables/registry.js' );
const L = await import( '../src/game/items/ext/outdoors/logic.js' );
const RT = await import( '../src/game/items/ext/outdoors/runtime.js' );
const { OUT } = await import( '../src/game/items/ext/outdoors/kinds.js' );
const D = await import( '../src/game/items/defs/ext/outdoors.js' );
const fs = await import( 'node:fs' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );
// a seeded Math.random for the rolls inside the game code
let seed = 7;
const seeded = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
const random0 = Math.random;
const withRandom = ( v, fn ) => { const r = Math.random; Math.random = typeof v === 'function' ? v : () => v; try { return fn(); } finally { Math.random = r; } };

// the domain's ids, from its def file
const SRC = fs.readFileSync( new URL( '../src/game/items/defs/ext/outdoors.js', import.meta.url ), 'utf8' );
const KSRC = fs.readFileSync( new URL( '../src/game/items/ext/outdoors/kinds.js', import.meta.url ), 'utf8' );
const MINE = [ ...SRC.matchAll( /^\t(?:tool|mat|melee)\( '([a-z_]+)'/gm ) ].map( m => m[ 1 ] );
for ( const m of SRC.matchAll( /^\t\.\.\.seaPair\( '([a-z_]+)'/gm ) ) MINE.push( 'raw_' + m[ 1 ], 'cooked_' + m[ 1 ] );

// ---- the catalogue ---------------------------------------------------------------------------------------------------
console.log( 'items' );
ok( MINE.length >= 55, `outdoors items (${MINE.length})` );
ok( ! warnings.some( w => /duplicate|no table/.test( w ) ), 'no duplicate ids or missing tables: ' + warnings.join( '; ' ) );
const MENU_ONLY = new Set( [ 'car_trunk', 'car_glovebox', 'site_stash', 'site_stash_rich' ] );
const visible = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( MENU_ONLY.has( name ) || name.startsWith( 'zombie_' ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
// only ever made (crafted, knapped, cooked, rolled up)
const MADE = new Set( [ 'bottle_filter', 'bamboo_canteen', 'cooked_squid', 'cooked_lobster', 'sennit', 'palm_thatch', 'thatch_shelter', 'frond_bed', 'basalt_flake', 'tanning_frame', 'bamboo_spear', 'stone_adze' ] );
const comboIds = new Set( C.allCombos().flatMap( c => C.comboIds( c ) ) );
const recipeIds = new Set( allRecipes().flatMap( r => [ r.out[ 0 ], ...r.in.map( i => i[ 0 ] ) ] ) );
const VERBS = /def\.id === '([a-z_]+)'|def\.id !== '([a-z_]+)'/g;
const verbIds = new Set( [ ...SRC.matchAll( VERBS ) ].map( m => m[ 1 ] || m[ 2 ] ) );
// what the placed kinds take from you (meat hooks on the rack)
for ( const m of KSRC.matchAll( /s\.id === '([a-z_]+)'/g ) ) verbIds.add( m[ 1 ] );
const KIND_VERBS = new Set( [ 'fish', 'lighter', 'fishingrod', 'sleepingbag', 'cut', 'lure', 'jig', 'stringer', 'cup', 'bottle', 'bucket' ] );
for ( const id of MINE ) {
	const d = getItem( id );
	ok( !! d, `${id} defined` );
	if ( ! d ) continue;
	ok( d.model?.type && hasModelBuilder( d.model.type ), `${id}: model builder ${d.model?.type}` );
	ok( d.desc.length > 0 && d.desc.length <= 40 && ! /!/.test( d.desc ), `${id}: short desc` );
	ok( /^[A-Zʻ]/.test( d.name ) && d.name.length < 28, `${id}: plain name` );
	ok( visible.has( id ) || MADE.has( id ), `${id}: lies somewhere you can see it, or is made` );
	if ( MADE.has( id ) ) ok( recipeIds.has( id ) || comboIds.has( id ) || [ ...ITEMS.values() ].some( x => x.food?.cooked === id ) || /basalt_flake/.test( id ), `${id}: made by something` );
	const does = !! d.food || !! d.place || !! d.melee || comboIds.has( id ) || recipeIds.has( id ) || verbIds.has( id ) || KIND_VERBS.has( d.tool?.kind ) || !! d.tool?.liquid;
	ok( does, `${id}: does something` );
	if ( d.tool?.liquid ) ok( d.stack === 1, `${id}: a container doesn't stack` );
}
for ( const d of MINE.map( getItem ).filter( d => d?.place ) ) ok( R.KINDS.has( d.place.kind ), `${d.id}: place kind ${d.place.kind} registered` );
for ( const k of [ 'fish_trap', 'crab_trap', 'smoking_rack', 'tanning_frame', 'pig_trap', 'solar_still', 'lean_to', 'hammock', 'camp_seat', 'camp_bed', 'mosquito_coil' ] ) {
	ok( R.KINDS.has( k ), `kind ${k}` );
	ok( typeof OUT.look[ k ] === 'function', `${k}: a placed look` );
}
// the melee ones are held as the weapons module's shapes
for ( const id of [ 'dive_knife', 'skinning_knife', 'stone_adze', 'bamboo_spear' ] ) ok( getItem( id ).model.kind && getItem( id ).melee.tools.length, `${id}: held shape ${getItem( id ).model.kind}` );
ok( getItem( 'bamboo_spear' ).melee.tools.includes( 'fish' ) && getItem( 'hawaiian_sling' ).tool.kind === 'fish', 'spears and the sling spearfish' );
ok( getItem( 'ferro_rod' ).tool.kind === 'lighter' && getItem( 'ferro_rod' ).tool.uses >= 200, 'the ferro rod lights what a lighter lights' );

// ---- loot ----------------------------------------------------------------------------------------------------------------
console.log( 'loot' );
{
	seed = 3;
	const share = ( table, n ) => { let k = 0, all = 0; for ( let i = 0; i < n; i ++ ) for ( const s of rollLoot( table, seeded ) ) { all ++; if ( MINE.includes( s.id ) ) k ++; } return k / Math.max( 1, all ); };
	const sports = share( 'sports', 500 ), camp = share( 'site_campsite', 500 ), fishing = share( 'site_fishing_spot', 500 ), grocery = share( 'grocery', 500 ), kitchen = share( 'house_kitchen', 300 );
	ok( sports > 0.12 && sports < 0.45, `a sports shop holds camp gear, not only (${( sports * 100 ).toFixed( 0 )}%)` );
	ok( camp > 0.12 && camp < 0.45, `a campsite (${( camp * 100 ).toFixed( 0 )}%)` );
	ok( fishing > 0.15 && fishing < 0.5, `a fishing spot (${( fishing * 100 ).toFixed( 0 )}%)` );
	ok( grocery < 0.06 && kitchen < 0.02, `groceries and kitchens barely change (${( grocery * 100 ).toFixed( 1 )}%, ${( kitchen * 100 ).toFixed( 1 )}%)` );
	let guns = 0, n = 0;
	for ( let i = 0; i < 800; i ++ ) for ( const s of rollLoot( 'sports', seeded ) ) { n ++; if ( s.id === 'spear_gun' ) guns ++; }
	ok( guns > 0 && guns / n < 0.01, `spear guns are rare (${guns}/${n})` );
}

// ---- the numbers ------------------------------------------------------------------------------------------------------------
console.log( 'logic' );
{
	const t = L.trapChance( 'fish', { depth: 1.5, hour: 12 } );
	ok( t > 0 && t < 0.2, `a fish trap at noon (${t.toFixed( 3 )} an hour)` );
	ok( L.trapChance( 'fish', { depth: 1.5, hour: 12, bait: true } ) > t * 1.9 && L.trapChance( 'fish', { depth: 1.5, hour: 6 } ) > t, 'bait and dawn help' );
	ok( L.trapChance( 'fish', { watched: true } ) === 0 && L.trapChance( 'fish', { depth: 0.2 } ) < t, 'nothing comes while you watch; ankle-deep is poor' );
	ok( L.trapChance( 'crab', { hour: 23 } ) > L.trapChance( 'crab', { hour: 12 } ) * 2, 'crabs come at night' );
	ok( L.trapChance( 'fish', { skill: 10, depth: 1.5 } ) > t * 1.7, 'fishing practice fills traps' );
	ok( L.spearChance( { tool: 'gun' } ) > L.spearChance( { tool: 'sling' } ) && L.spearChance( { tool: 'sling' } ) > L.spearChance( { tool: 'pole' } ), 'a spear gun beats a sling beats a pole' );
	ok( L.spearChance( { mask: true } ) > L.spearChance( {} ) + 0.1 && L.spearChance( { night: true } ) < L.spearChance( {} ) * 0.5 && L.spearChance( { night: true, light: true } ) === L.spearChance( {} ), 'a mask helps, the dark needs a light' );
	seed = 11;
	const big = new Set( [ 'raw_ulua', 'raw_mahimahi', 'raw_ahi' ] );
	let poleBig = 0, gunBig = 0;
	for ( let i = 0; i < 400; i ++ ) { if ( big.has( L.spearCatch( seeded, 20, 'pole' ) ) ) poleBig ++; if ( big.has( L.spearCatch( seeded, 20, 'gun' ) ) ) gunBig ++; }
	ok( poleBig === 0 && gunBig > 150, `only a spear gun lands the big ones (${poleBig}, ${gunBig})` );
	ok( L.sharkChance( 1, false ) === 0 && L.sharkChance( 20, true ) > L.sharkChance( 20, false ), 'sharks in deep water, more at night' );
	let fish = 0, snags = 0;
	for ( let i = 0; i < 300; i ++ ) { const r = L.castNet( seeded, { depth: 1.2, hour: 7 } ); fish += r.out.filter( x => x[ 0 ] === 'raw_fish' ).length; if ( r.snag ) snags ++; }
	ok( fish > 120 && fish < 300 && snags > 10 && snags < 70, `the net: ${fish} hauls with fish, ${snags} snags in 300` );
	ok( L.stillRate( { sun: 0 } ) === 0 && L.stillRate( { sun: 1, basin: true } ) > L.stillRate( { sun: 1 } ) * 2 && L.stillRate( { sun: 1, rain: 0.6 } ) === 0, 'the still: sun only, seawater makes far more' );
	ok( L.pigChance( { bait: true, townEdge: 3000, moist: 0.8 } ) > L.pigChance( { bait: false, townEdge: 3000, moist: 0.8 } ) * 4 && L.pigChance( { pigs: false, bait: true } ) === 0 && L.pigChance( { watched: true, bait: true } ) === 0, 'a pig trap wants bait, wild pigs, no one watching' );
	ok( L.mosquitoLevel( { hour: 19 } ) > L.mosquitoLevel( { hour: 6 } ) && L.mosquitoLevel( { hour: 6 } ) > L.mosquitoLevel( { hour: 23 } ) && L.mosquitoLevel( { hour: 13, moist: 0.3 } ) === 0, 'mosquitoes: dusk worst, dawn, a little at night, none at midday' );
	ok( L.mosquitoLevel( { hour: 19, y: 400 } ) === 0 && L.mosquitoLevel( { hour: 19, beach: true } ) < L.mosquitoLevel( { hour: 19 } ) * 0.5, 'none up the mountain, fewer on a windy beach' );
	ok( L.smokeOut( getItem( 'raw_boar' ) ) === 'smoked_meat' && L.smokeOut( getItem( 'raw_squid' ) ) === 'smoked_fish' && L.smokeOut( getItem( 'cooked_boar' ) ) === null, 'what smokes into what' );
	ok( L.tanHours( true ) < L.tanHours( false ), 'salt cures a hide sooner' );
	ok( L.pickWeighted( () => 0.999, [ [ 'a', 1 ], [ 'b', 0 ] ] ) === 'a', 'weighted pick skips zero weights' );
}

// ---- a stub game -------------------------------------------------------------------------------------------------------------
console.log( 'stub game' );
let ground = 2, wl = 0;
const hf = {
	heightAt: () => ground, baseHeight: () => ground, normalAt: ( x, z, out ) => out.set( 0, 1, 0 ), surfaceAt: ( x, z, out = [] ) => { out[ 0 ] = 0.8; out[ 1 ] = 0; out[ 2 ] = 0; out[ 3 ] = 0; return out; },
	islandAt: () => 5, flagsNear: () => 0,
	raycast: ( ox, oy, oz, dx, dy, dz, maxT ) => { const t = dy < 0 ? ( oy - ground ) / - dy : - 1; return t >= 0 && t <= maxT ? t : - 1; },
};
const toasts = [], noises = [], dropped = [], spawned = [], picked = [];
let beach = false, indoors = false;
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return Math.floor( this.time.hours / 24 ); },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {}, hf, physics: new Physics( hf, null ),
	events: new Events(), audio: { play() { return null; }, loop() { return null; }, buffers: new Map() }, settings: { get: () => true },
	interact: { addProvider() { return () => {}; }, target: null, holdT: 0 },
	input: { pressed: () => false, released: () => false, is: () => false, codes: () => [], pressedQ: new Set(), down: new Set(), consumeWheel: () => 0 },
	world: { isIndoors: () => indoors, isBeach: () => beach, meta: { cities: [ { x: 5000, z: 0, radius: 500 } ] }, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } },
	weather: { rain: 0, state: 'clear', cover: 0.2 },
	player: { pos: new THREE.Vector3( 0, 2, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stanceH: 1.6, get eye() { return this.pos.y + 1.6; }, shake: 0, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ), swimming: false, underwater: false },
	entities: { near: ( pos, r, type, out = [] ) => { out.length = 0; return out; }, add() {}, remove() {} },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => dropped.push( s ), inputActive: true, dead: false,
	app: { ui: { inventory: { other: null }, closeScreen() {} } },
	systems: [], register( s ) { this.systems.push( s ); return s; },
	sleepCalls: [], sleep( h, q ) { this.sleepCalls.push( q ); return true; },
	sites: { drops: 0, supplyDrop() { this.drops ++; return { id: 1 }; } },
	animals: { list: [], spawn( sp, pos, o ) { spawned.push( { sp, pos, o } ); return { sp }; }, habitat: ( x, z, out ) => { out.deer = 2.6; return out; } },
};
game.physics.waterLevel = () => wl;
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.events.on( 'item:pick', ( e ) => picked.push( e.stack ) );
game.survival = new Survival( game );
game.actions = new Actions( game );
game.itemLights = { add: ( s ) => s, remove() {} };
game.itemUse = new ItemUse( game, null );
game.crafting = new Crafting( game, null );
const KB = game.combine = new Combine( game );
const M = game.placeables = new Placeables( game );
const inv = game.player.inventory, S = game.survival, U = game.itemUse;
inv.equip.back = makeStack( 'backpack_military', 1 );
inv.equip.legs = makeStack( 'cargo_pants', 1 );
const finish = () => game.actions.update( 999 );
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const find = ( id ) => inv.find( ( s ) => s.id === id );
const count = ( id ) => inv.count( id );
const combo = ( id ) => C.getCombo( id );
const run = ( id, a, b ) => { const r = KB.run( combo( id ), a, b ); finish(); return r; };
const verbs = ( s ) => U.actions( s ).map( a => a.verb );
const doVerb = ( s, verb ) => { const a = U.actions( s ).find( x => x.verb === verb ); if ( ! a ) return false; a.run(); finish(); return true; };
const recipe = ( id ) => game.crafting.recipes.find( r => r.id === id );
const craft = ( id ) => { const ok2 = game.crafting.craft( recipe( id ) ); finish(); return ok2; };
const at = ( x, z, y = ground ) => new THREE.Vector3( x, y, z );
const tick = ( p, hours, steps = 8 ) => { const K = R.getPlaceable( p.kind ); for ( let i = 0; i < steps; i ++ ) { game.time.hours += hours / steps; K.update?.( p, 0.25, game, hours / steps ); } };
const act = ( p, label ) => M.actionsOf( p ).find( a => a.label === label || a.label.startsWith( label ) );
const labels = ( p ) => M.actionsOf( p ).map( a => a.label );
const clear = () => { for ( const c of inv.containers() ) c.items.length = 0; };
// the outdoors system starts with the items module (hooks.js addSystem; WorldItems install calls startSystems)
const { startSystems } = await import( '../src/game/items/hooks.js' );
startSystems( game );
const sys = game.systems.find( s => s instanceof RT.OutdoorsSystem );
ok( !! sys && RT.state( game ) === sys.st, 'the outdoors system starts with the items module' );
U.update( 1.1 ); game.time.hours += 0.05; U.update( 1.1 );
startSystems( game );
ok( game.systems.filter( s => s instanceof RT.OutdoorsSystem ).length === 1, 'and only once' );

// ---- mixes and recipes --------------------------------------------------------------------------------------------------------
console.log( 'mixes' );
{
	clear();
	const knife = put( 'machete' ), coco = put( 'coconut' ), other = put( 'coconut' );
	ok( run( 'husk_coconut', knife, coco ) && count( 'coconut_husk' ) === 2, 'husk a coconut: two husks' );
	const husked = inv.find( s => s.id === 'coconut' && s.data.husked );
	ok( husked === coco && ! other.data.husked, 'one coconut husked, the other still whole' );
	ok( ! KB.state( combo( 'husk_coconut' ), knife, husked ).ok || ! C.matches( combo( 'husk_coconut' ).b, husked ), 'a husked coconut has nothing more to give' );
	ok( craft( 'sennit' ) && count( 'sennit' ) === 2 && count( 'coconut_husk' ) === 0, 'two husks braid into sennit' );
	put( 'sennit', 1 );
	ok( craft( 'rope_sennit' ) && count( 'rope' ) === 1, 'three sennit make a rope' );
	const cord = put( 'paracord', 1 );
	ok( run( 'gut_paracord', knife, cord ) && count( 'fishing_line' ) === 2 && ! count( 'paracord' ), 'paracord gutted for fishing line' );
	const rod = put( 'fishing_rod' ); rod.cond = 0.4;
	ok( run( 'restring_rod', find( 'fishing_line' ), rod ) && rod.cond > 0.7 && count( 'fishing_line' ) === 1, `a frayed rod restrung (${rod.cond.toFixed( 2 )})` );
	const pad = put( 'sleeping_pad' ), bag = put( 'sleeping_bag' );
	ok( run( 'roll_bedroll', pad, bag ) && count( 'bedroll' ) === 1 && ! count( 'sleeping_pad' ) && ! count( 'sleeping_bag' ), 'pad and bag rolled into a bedroll' );
	ok( doVerb( find( 'bedroll' ), 'Unroll' ) && count( 'sleeping_pad' ) === 1 && count( 'sleeping_bag' ) === 1 && ! count( 'bedroll' ), 'and unrolled again' );
	// filters
	const jug = put( 'water_jug' ); jug.data.liquid = 'dirty'; jug.data.amount = 3;
	const gf = put( 'gravity_filter' );
	ok( run( 'filter_water', gf, jug ) && jug.data.liquid === 'water' && jug.data.amount === 3 && gf.cond < 1 && gf.cond > 0.95, `a gravity filter cleans 3 L (${gf.cond.toFixed( 3 )})` );
	const bf = put( 'bottle_filter' ), pot = put( 'cooking_pot' ); pot.data.liquid = 'dirty'; pot.data.amount = 2;
	run( 'filter_water', bf, pot );
	ok( pot.data.liquid === 'water' && bf.cond < 0.9, `a bottle filter clogs faster (${bf.cond.toFixed( 2 )})` );
	const sea = put( 'water_bottle' ); sea.data.liquid = 'sea'; sea.data.amount = 0.5;
	ok( ! KB.find( gf, sea ).length, "filters don't take the salt out" );
	// fire without a lighter
	const torch = put( 'torch' ), glass = put( 'magnifying_glass' );
	game.weather.cover = 0.2; game.world.sky.sunDir.set( 0, 1, 0 );
	ok( run( 'sun_torch', glass, torch ) && torch.data.on, 'a magnifying glass lights a torch in the sun' );
	const torch2 = put( 'torch' );
	game.world.sky.sunDir.set( 0, - 0.3, 0.9 );
	ok( ! KB.state( combo( 'sun_torch' ), glass, torch2 ).ok && /sun/i.test( KB.state( combo( 'sun_torch' ), glass, torch2 ).reason ), 'not at night' );
	game.world.sky.sunDir.set( 0, 1, 0 );
	const drill = put( 'bow_drill' ), st0 = S.stamina;
	withRandom( 0.1, () => run( 'drill_torch', drill, torch2 ) );
	ok( torch2.data.on && S.stamina < st0 && drill.cond < 1, 'a bow drill gets there, for sweat' );
	const sq = put( 'raw_squid' );
	ok( run( 'squid_bait', knife, sq ) && count( 'fishing_bait' ) === 6, 'a squid cut into six baits' );
	// the recipes' ingredients all exist and the crafting panel lists them
	for ( const id of [ 'sennit', 'bone_hook', 'hand_line', 'kona_lure', 'ie_trap', 'crab_trap', 'smoking_rack', 'smoking_rack_bamboo', 'tanning_frame', 'tarp_shelter', 'palm_thatch', 'thatch_shelter', 'frond_bed', 'hammock', 'solar_still', 'bottle_filter', 'shell_charcoal', 'pig_trap', 'stone_adze', 'bow_drill', 'bamboo_spear', 'bamboo_canteen', 'stringer_sennit' ] ) ok( !! recipe( id ), `recipe ${id} in the panel` );
	clear();
	put( 'bone', 1 ); put( 'hunting_knife' );
	ok( craft( 'bone_hook' ) && count( 'bone_hook' ) === 2, 'a bone carved into two makau' );
	put( 'fishing_line', 1 ); put( 'stick', 1 );
	ok( craft( 'hand_line' ) && find( 'hand_line' )?.id === 'hand_line', 'a hand line from line, a makau and a stick' );
	ok( getItem( 'hand_line' ).tool.kind === 'fishingrod' && U.actions( find( 'hand_line' ) ).some( a => a.verb === 'Fish' ), 'the hand line fishes like a rod' );
}

// ---- fishing: lures, jigs, the hand line ----------------------------------------------------------------------------------------
console.log( 'fishing' );
{
	clear();
	const F = new Fishing( game );
	const line = put( 'hand_line' );
	F.rod = line; F.depth = 6;
	game.time.hours = 112; // midday
	const base = withRandom( 0.5, () => F._biteTime() );
	const lure = put( 'fishing_lure' );
	const lured = withRandom( 0.5, () => F._biteTime() );
	ok( lured < base * 0.8, `a Kona lure on the reef: bites sooner (${base.toFixed( 1 )} → ${lured.toFixed( 1 )} s)` );
	const tally = () => { const n = {}; seed = 5; for ( let i = 0; i < 600; i ++ ) { const id = withRandom( seeded, () => F._pick() ); n[ id ] = ( n[ id ] || 0 ) + 1; } return n; };
	const withLure = tally();
	inv.remove( lure );
	const plain = tally();
	ok( ( withLure.raw_ulua || 0 ) > ( plain.raw_ulua || 0 ) * 1.2, `more ulua with the lure (${plain.raw_ulua} → ${withLure.raw_ulua})` );
	ok( ! plain.raw_squid, 'no squid without a jig' );
	put( 'squid_jig' );
	game.time.hours = 120 + 21; game.world.sky.night = 1;
	const night = tally();
	ok( night.raw_squid > 40, `a squid jig at night: squid (${night.raw_squid})` );
	F.catchId = 'raw_squid'; F.state = 'reel';
	const jig = find( 'squid_jig' ), c0 = jig.cond;
	withRandom( 0.01, () => F._land() );
	ok( count( 'raw_squid' ) === 1 && jig.cond < c0, 'a squid landed, the jig a little worn' );
	game.world.sky.night = 0; game.time.hours = 124;
	F.dispose();
}

// ---- verbs -----------------------------------------------------------------------------------------------------------------
console.log( 'verbs' );
{
	clear();
	// spearfishing: only in the water
	const sling = put( 'hawaiian_sling' ), spear = put( 'fishing_spear' );
	ok( ! verbs( sling ).includes( 'Spearfish' ), 'no spearfishing on dry land' );
	wl = 3; ground = 0.5; game.player.pos.set( 0, 0.5, 0 ); // wading in to the chest
	ok( verbs( sling ).includes( 'Spearfish' ) && verbs( spear ).includes( 'Spearfish' ), 'in the sea: the sling and the pole spear spearfish' );
	inv.equip.eyes = makeStack( 'dive_mask' );
	withRandom( 0.05, () => doVerb( sling, 'Spearfish' ) );
	ok( inv.findAll( s => /^raw_/.test( s.id ) ).length === 1 && toasts.at( - 1 ).startsWith( 'Speared' ), 'speared one: ' + toasts.at( - 1 ) );
	ok( picked.some( s => /^raw_/.test( s.id ) ), 'it shows in the pickup row' );
	withRandom( 0.99, () => doVerb( sling, 'Spearfish' ) );
	ok( toasts.at( - 1 ) === 'Missed' && sling.cond < 1, 'missed, and the bands wear' );
	{
		const g0 = ground; ground = 2.55; game.player.pos.set( 0, 2.55, 0 ); // knee-deep
		withRandom( 0.99, () => doVerb( sling, 'Spearfish' ) );
		ok( toasts.at( - 1 ) === 'Too shallow', 'a miss in knee-deep water says why: ' + toasts.at( - 1 ) );
		ground = g0; game.player.pos.set( 0, 0.5, 0 );
	}
	// blood in deep water draws a shark
	wl = 20; ground = - 18; game.player.pos.set( 0, 18, 0 ); game.player.swimming = true;
	const gun = put( 'spear_gun' );
	withRandom( 0.01, () => doVerb( gun, 'Spearfish' ) );
	ok( spawned.some( s => s.sp === 'shark' ) && toasts.includes( 'Shark' ), 'a catch in deep water: a shark comes' );
	game.player.swimming = false;
	// the stringer keeps fish alive in the water
	clear();
	const str = put( 'fish_stringer' ), fish = put( 'raw_fish' );
	fish.data.age = 1;
	game.time.hours += 2; U.update( 1.1 );
	ok( fish.data.age <= 1.01, `fish on the stringer don't age in the water (${fish.data.age.toFixed( 2 )})` );
	wl = 0; ground = 2; game.player.pos.set( 0, 2, 0 );
	game.time.hours += 2; U.update( 1.1 );
	ok( fish.data.age > 2.5, `out of the water they do (${fish.data.age.toFixed( 2 )})` );
	inv.remove( str );
	// the throw net: shallow water in front of you
	const net = put( 'throw_net' );
	game.fishing = { target: () => ( { pos: new THREE.Vector3( 0, 0, - 5 ), depth: 1.2 } ) };
	game.camera.position.set( 0, 3.6, 0 );
	const before = inv.findAll( s => s.id === 'raw_fish' ).reduce( ( a, s ) => a + s.qty, 0 );
	withRandom( 0.05, () => doVerb( net, 'Cast net' ) );
	const after = inv.findAll( s => s.id === 'raw_fish' ).reduce( ( a, s ) => a + s.qty, 0 );
	ok( after > before && count( 'fishing_bait' ) > 0, `a cast: fish (${after - before}) and baitfish (${count( 'fishing_bait' )})` );
	game.fishing = { target: () => null };
	toasts.length = 0;
	doVerb( net, 'Cast net' );
	ok( toasts.at( - 1 ) === 'Look at shallow water', 'nothing to cast at: ' + toasts.at( - 1 ) );
	// the filter straw
	const straw = put( 'filter_straw' ), dirty = put( 'canteen' ); dirty.data.liquid = 'dirty'; dirty.data.amount = 1;
	S.thirst = 40; S.sick = 0;
	withRandom( 0.01, () => doVerb( straw, 'Drink through straw' ) );
	ok( S.thirst > 60 && S.sick === 0 && dirty.data.amount === 0.5 && straw.cond < 1, `dirty water through the straw: no sickness (thirst ${S.thirst.toFixed( 0 )})` );
	// bug spray and the blanket
	const spray = put( 'bug_spray' );
	doVerb( spray, 'Spray on' );
	ok( RT.state( game ).sprayUntil > game.time.hours + 3.9 && spray.data.uses === 7, 'repellent on for 4 h' );
	ok( U.actions( spray ).find( a => a.verb === 'Spray on' ).note === '4 h left', 'the menu says how long' );
	const blanket = put( 'emergency_blanket' );
	doVerb( blanket, 'Wrap up' );
	ok( RT.state( game ).wrapUntil > game.time.hours && verbs( blanket )[ 0 ] === 'Take off', 'wrapped up' );
	S.temp = 35.6; S.wet = 0.6;
	for ( let i = 0; i < 40; i ++ ) sys.update( 0.5 );
	ok( S.temp > 35.7 && S.wet < 0.6, `the blanket warms and dries you (${S.temp.toFixed( 2 )} °C, wet ${S.wet.toFixed( 2 )})` );
	doVerb( blanket, 'Take off' );
	ok( RT.state( game ).wrapUntil < 0, 'and off again' );
	// cutting fronds on the coast, bamboo in a wet valley
	clear();
	const machete = put( 'machete' );
	beach = true;
	ok( verbs( machete ).includes( 'Cut fronds' ), 'a machete on the beach: Cut fronds' );
	withRandom( 0.1, () => doVerb( machete, 'Cut fronds' ) );
	ok( count( 'palm_frond' ) >= 2, `fronds cut (${count( 'palm_frond' )})` );
	ok( ! verbs( machete ).includes( 'Cut fronds' ), 'the patch is bare for a day' );
	beach = false; game.player.pos.set( 200, 40, 200 ); ground = 40;
	ok( verbs( machete ).includes( 'Cut bamboo' ), 'up a wet valley: Cut bamboo' );
	ok( ! verbs( put( 'kitchen_knife' ) ).includes( 'Cut bamboo' ), "a kitchen knife won't fell bamboo" );
	withRandom( 0.1, () => doVerb( machete, 'Cut bamboo' ) );
	ok( count( 'bamboo_pole' ) >= 1, `bamboo cut (${count( 'bamboo_pole' )})` );
	// knapping a flake off a stone
	const stones = put( 'stone', 3 );
	withRandom( 0.1, () => doVerb( stones, 'Knap flake' ) );
	ok( count( 'basalt_flake' ) === 1 && count( 'stone' ) === 2, 'a basalt flake knapped' );
	ok( getItem( 'basalt_flake' ).tool.kind === 'cut' && getItem( 'basalt_flake' ).tool.provides.includes( 'skin' ), 'it cuts and skins' );
	// the deer call: deer nearby drift your way; none about, a few come
	const deer = { alive: true, species: 'deer', state: 'graze', pos: new THREE.Vector3( 260, 40, 200 ), herd: new THREE.Vector3( 280, 0, 210 ), goal: new THREE.Vector3() };
	game.animals.list = [ deer ];
	const call = put( 'deer_call' );
	noises.length = 0;
	doVerb( call, 'Blow' );
	ok( Math.hypot( deer.herd.x - 200, deer.herd.z - 200 ) < 30 && noises.some( n => n.radius === 30 ), `the herd turns towards you, and the call is heard (${deer.herd.x.toFixed( 0 )}, ${deer.herd.z.toFixed( 0 )})` );
	game.animals.list = [];
	spawned.length = 0;
	withRandom( 0.1, () => doVerb( call, 'Blow' ) );
	ok( spawned.filter( s => s.sp === 'deer' ).length >= 2 && toasts.at( - 1 ) === 'Something answers', 'none about: a few answer the call' );
	// the signal mirror: a plane may answer, once in a while
	const mirror = put( 'signal_mirror' );
	game.weather.cover = 0.2;
	withRandom( 0.01, () => doVerb( mirror, 'Signal' ) );
	ok( game.sites.drops === 1 && toasts.at( - 1 ) === 'Signal seen', 'a flash seen: a supply drop' );
	withRandom( 0.01, () => doVerb( mirror, 'Signal' ) );
	ok( game.sites.drops === 1 && toasts.at( - 1 ) === 'No answer', 'not again for hours' );
	// a campfire lit without a lighter
	clear();
	const fire = game.crafting.placeFire( 'campfire', at( 201, 201, 40 ), { lit: false, fuel: 1.5 } );
	const glass = put( 'magnifying_glass' );
	ok( verbs( glass ).includes( 'Light fire' ), 'a magnifying glass by an unlit fire: Light fire' );
	doVerb( glass, 'Light fire' );
	ok( fire.lit, 'lit by the sun' );
	fire.putOut();
	const drill = put( 'bow_drill' );
	withRandom( 0.99, () => doVerb( drill, 'Light fire' ) );
	ok( ! fire.lit && toasts.at( - 1 ) === 'No ember', 'the bow drill can fail' );
	withRandom( 0.05, () => doVerb( drill, 'Light fire' ) );
	ok( fire.lit, 'and then it catches' );
	game.crafting.removeFire( fire );
	game.player.pos.set( 0, 2, 0 ); ground = 2;
	// the last of a cracked coconut leaves its shell
	const nut = put( 'coconut_open' ); nut.data.left = 1;
	S.hunger = 50;
	doVerb( nut, 'Eat' );
	ok( count( 'coconut_shell' ) === 1, 'the coconut eaten, its shell kept' );
	ok( getItem( 'coconut_shell' ).tool.liquid > 0, 'a shell holds water' );
}

// ---- placed things ------------------------------------------------------------------------------------------------------------
console.log( 'placed' );
{
	clear();
	// an ʻie in the shallows
	wl = 1.2; ground = 0.4;
	const trap = M.add( 'fish_trap', makeStack( 'fish_trap' ), at( 30, 0 ), 0 );
	ok( trap.data.set && Math.abs( trap.data.depth - 0.8 ) < 0.01, `set in ${trap.data.depth} m of water` );
	put( 'fishing_bait', 2 );
	act( trap, 'Bait with' ).run(); finish();
	ok( trap.data.bait === 'fishing_bait' && count( 'fishing_bait' ) === 1, 'baited' );
	game.player.pos.set( 30, 2, 1 );
	tick( trap, 48 );
	ok( ! trap.data.catch.length, 'nothing comes while you stand over it' );
	game.player.pos.set( 0, 2, 0 );
	withRandom( seeded, () => tick( trap, 48, 48 ) );
	ok( trap.data.catch.length >= 1 && trap.data.catch.length <= L.TRAP.fish.cap, `two days later: ${trap.data.catch.map( c => c.id ).join( ', ' )}` );
	const n = trap.data.catch.length;
	act( trap, 'Empty trap' ).run(); finish();
	ok( inv.findAll( s => /^raw_/.test( s.id ) ).reduce( ( a, s ) => a + s.qty, 0 ) === n && ! trap.data.catch.length, `emptied: ${n} into the bag` );
	ok( act( trap, 'Pick up' ) && R.getPlaceable( 'fish_trap' ).water === 'only', 'it picks back up; it needs water' );
	// a crab trap at night
	const crab = M.add( 'crab_trap', makeStack( 'crab_trap' ), at( 40, 0 ), 0 );
	game.time.hours = Math.floor( game.time.hours / 24 ) * 24 + 20;
	withRandom( seeded, () => tick( crab, 30, 30 ) );
	ok( crab.data.catch.every( c => [ 'raw_crab', 'raw_lobster', 'raw_tako' ].includes( c.id ) ) && crab.data.catch.length > 0, `crabs and lobsters: ${crab.data.catch.map( c => c.id ).join( ', ' )}` );
	wl = 0; ground = 2;

	// the smoking rack
	clear();
	const rack = M.add( 'smoking_rack', makeStack( 'smoking_rack' ), at( 10, 10 ), 0 );
	put( 'raw_boar' ); put( 'raw_boar' ); put( 'raw_fish', 1 ); put( 'firewood', 2 ); put( 'lighter' ); put( 'meat_hook', 1 );
	act( rack, 'Add meat hook' ).run(); finish();
	ok( rack.data.hooks === 1 && ! count( 'meat_hook' ), 'a meat hook hung: room for more' );
	act( rack, 'Hang meat' ).run(); finish();
	ok( rack.data.load.length === 3 && ! count( 'raw_boar' ) && ! count( 'raw_fish' ), 'boar and fish hung' );
	ok( ! act( rack, 'Light' ), 'nothing to burn yet' );
	act( rack, 'Add firewood' ).run(); finish();
	act( rack, 'Add firewood' ).run(); finish();
	ok( rack.data.fuel === 6, 'two loads of firewood: 6 h' );
	act( rack, 'Light' ).run(); finish();
	ok( rack.data.lit, 'lit with the lighter' );
	ok( RT.smokeNear( game, at( 11, 10 ) ), 'its smoke keeps mosquitoes off' );
	tick( rack, 3 );
	ok( ! rack.data.load.some( e => e.done ) && /left/.test( R.getPlaceable( 'smoking_rack' ).sub( rack ) ), 'half way: ' + R.getPlaceable( 'smoking_rack' ).sub( rack ) );
	tick( rack, 3.2 );
	ok( rack.data.load.every( e => e.done ) && ! rack.data.lit, 'six hours on: smoked, and the wood burnt out' );
	act( rack, 'Take smoked' ).run(); finish();
	ok( count( 'smoked_meat' ) === 2 && count( 'smoked_fish' ) === 1 && find( 'smoked_meat' ).data.age === 0, 'smoked meat and fish taken down' );
	// rain puts it out; meat hanging cold ages
	put( 'raw_venison', 1 ); put( 'firewood', 1 );
	act( rack, 'Hang meat' ).run(); finish();
	act( rack, 'Add firewood' ).run(); finish();
	act( rack, 'Light' ).run(); finish();
	game.weather.rain = 0.8;
	tick( rack, 1 );
	game.weather.rain = 0;
	ok( ! rack.data.lit && rack.data.load[ 0 ].age > 0, 'rain put the fire out; the meat hangs and ages' );
	act( rack, 'Take down raw' ).run(); finish();
	ok( count( 'raw_venison' ) === 1 && ! rack.data.load.length, 'taken down raw' );
	act( rack, 'Take apart' ).run(); finish();
	ok( ! M.list.has( rack.id ) && count( 'smoking_rack' ) === 1 && count( 'meat_hook' ) === 1, 'the rack and its hook back in the bag' );

	// the tanning frame
	clear();
	const frame = M.add( 'tanning_frame', makeStack( 'tanning_frame' ), at( 12, 12 ), 0 );
	put( 'animal_hide', 1 );
	toasts.length = 0;
	act( frame, 'Stretch hide' ).run(); finish();
	ok( ! frame.data.hide && toasts.at( - 1 ) === 'Need a blade to scrape it', 'needs a blade' );
	put( 'skinning_knife' ); put( 'alaea_salt', 1 );
	act( frame, 'Stretch hide' ).run(); finish();
	ok( frame.data.hide && frame.data.yield === L.TAN.skinYield && ! count( 'animal_hide' ), 'scraped and laced with a skinning knife' );
	act( frame, 'Salt hide' ).run(); finish();
	ok( frame.data.salted, 'salted' );
	tick( frame, 10 );
	ok( ! act( frame, 'Take leather' ), 'still curing: ' + R.getPlaceable( 'tanning_frame' ).sub( frame ) );
	tick( frame, 9 );
	act( frame, 'Take leather' ).run(); finish();
	ok( count( 'leather' ) === L.TAN.skinYield && ! frame.data.hide, `leather: ${count( 'leather' )}` );

	// the pig trap
	clear();
	game.player.pos.set( 0, 2, 0 );
	const cage = M.add( 'pig_trap', makeStack( 'pig_trap' ), at( 3000, 3000 ), 0 );
	ok( cage.data.set && cage.data.pigs && cage.data.town > 2000, 'set out in the wild' );
	put( 'banana', 2 );
	act( cage, 'Bait with' ).run(); finish();
	ok( cage.data.bait === 'banana', 'baited with a banana' );
	withRandom( seeded, () => tick( cage, 60, 60 ) );
	ok( cage.data.pig != null && R.getPlaceable( 'pig_trap' ).sub( cage ) === 'Feral pig', 'a pig in the cage' );
	game.player.pos.set( 2995, 2, 3000 );
	noises.length = 0;
	cage._sq = 0;
	R.getPlaceable( 'pig_trap' ).update( cage, 0.5, game, 0.001 );
	ok( noises.some( n => n.radius === L.PIG.squealR ), 'it squeals: the infected hear it' );
	toasts.length = 0;
	act( cage, 'Kill pig' ).run(); finish();
	ok( toasts.at( - 1 ) === 'Need a blade or a spear' && cage.data.pig != null, 'bare hands: no' );
	put( 'hunting_knife' );
	act( cage, 'Kill pig' ).run(); finish();
	ok( count( 'raw_boar' ) >= 3 && count( 'animal_hide' ) === 1 && count( 'bone' ) >= 1 && cage.data.pig == null, 'boar meat, a hide and bones' );
	ok( act( cage, 'Set' ), 'and it can be set again' );
	game.player.pos.set( 0, 2, 0 );

	// the solar still
	clear();
	const still = M.add( 'solar_still', makeStack( 'solar_still' ), at( 15, 15 ), 0 );
	game.world.sky.sunDir.set( 0, 1, 0 ); game.weather.cover = 0.1; game.weather.rain = 0;
	tick( still, 4 );
	const fromGround = still.data.L;
	ok( fromGround > 0.1 && fromGround < 0.5, `four sunny hours from damp ground (${fromGround.toFixed( 2 )} L)` );
	const sb = put( 'water_jug' ); sb.data.liquid = 'sea'; sb.data.amount = 3;
	act( still, 'Pour in' ).run(); finish();
	ok( still.data.sea === 3 && sb.data.amount === 0 && ! sb.data.liquid, 'seawater poured into its basin' );
	tick( still, 4 );
	ok( still.data.L - fromGround > fromGround * 2, `four more hours over seawater (${still.data.L.toFixed( 2 )} L)` );
	game.world.sky.sunDir.set( 0, - 0.5, 0.8 );
	const L0 = still.data.L;
	tick( still, 6 );
	ok( still.data.L === L0, 'nothing at night' );
	game.world.sky.sunDir.set( 0, 1, 0 );
	inv.remove( sb );
	const bottle = put( 'water_bottle' );
	act( still, 'Fill' ).run(); finish();
	ok( bottle.data.liquid === 'water' && bottle.data.amount > 0.4, 'a bottle filled with clean water' );

	// the lean-to: rain doesn't reach you under it
	clear();
	const lean = M.add( 'lean_to', makeStack( 'tarp_shelter' ), at( 0, 0.5 ), 0 );
	game.player.pos.set( 0, 2, 0 );
	game.weather.rain = 0.9; S.wet = 0.5;
	for ( let i = 0; i < 20; i ++ ) sys.update( 0.5 );
	const wetUnder = S.wet;
	ok( wetUnder < 0.5, `under the tarp you dry off in the rain (${wetUnder.toFixed( 3 )})` );
	ok( labels( lean ).includes( 'Sleep' ) && R.getPlaceable( 'lean_to' ).sub( lean, game ) === 'Dry under it', 'it says so' );
	game.weather.rain = 0;
	act( lean, 'Sleep' ).run();
	ok( game.sleepCalls.at( - 1 ) === 0.9 || toasts.at( - 1 ) === "You aren't tired", 'sleep under it' );
	// beds, the hammock, the chair
	S.energy = 30;
	const ham = M.add( 'hammock', makeStack( 'hammock' ), at( 5, - 5 ), 0 );
	act( ham, 'Sleep' ).run();
	ok( game.sleepCalls.at( - 1 ) === 0.95, 'a hammock sleeps well' );
	const bed = M.add( 'camp_bed', makeStack( 'frond_bed' ), at( - 5, - 5 ), 0 );
	act( bed, 'Sleep' ).run();
	ok( game.sleepCalls.at( - 1 ) === 0.7 && labels( bed ).includes( 'Gather up' ), 'a frond bed, less so' );
	const chair = M.add( 'camp_seat', makeStack( 'camping_chair' ), at( - 5, 5 ), 0 );
	S.stamina = 10; S.boredom = 40; game.mode = 'survival';
	act( chair, 'Sit' ).run(); finish();
	ok( S.stamina >= ( S.maxStamina?.() ?? 100 ) - 0.01 && S.boredom < 40, `sitting: rested (${S.stamina.toFixed( 0 )}), less bored (${S.boredom.toFixed( 1 )})` );

	// the mosquito coil
	const coil = M.add( 'mosquito_coil', makeStack( 'mosquito_coil' ), at( 1, 1 ), 0 );
	put( 'matches' );
	act( coil, 'Light' ).run(); finish();
	ok( coil.data.lit && RT.smokeNear( game, at( 2, 2 ) ), 'a lit coil keeps them off nearby' );
	tick( coil, 8 );
	ok( ! coil.data.lit && labels( coil )[ 0 ] === 'Clear ash', 'burnt out after 7 h' );
	act( coil, 'Clear ash' ).run();
	ok( ! M.list.has( coil.id ), 'cleared away' );

	// save and load: every kind's state survives
	const saved = { world: {} };
	M.serialize( saved );
	const recs = JSON.parse( JSON.stringify( saved ) ).world.placeables;
	const back = recs.map( R.loadRecord );
	const still2 = back.find( p => p.kind === 'solar_still' ), cage2 = back.find( p => p.kind === 'pig_trap' );
	ok( still2 && Math.abs( still2.data.L - still.data.L ) < 0.01 && cage2 && cage2.data.town === cage.data.town, 'records round-trip through a save' );
	// the outdoors system's own state
	RT.state( game ).sprayUntil = game.time.hours + 2;
	RT.state( game ).harvested.set( '3,4', game.time.hours - 1 );
	const s2 = {}; sys.serialize( s2 );
	ok( s2.world.outdoors.sprayUntil === RT.state( game ).sprayUntil && Object.keys( s2.world.outdoors.harvested ).length >= 1, 'spray and harvested patches saved' );
	const sys2 = new RT.OutdoorsSystem( { ...game, save: JSON.parse( JSON.stringify( s2 ) ) } );
	ok( sys2.st.sprayUntil === RT.state( game ).sprayUntil && sys2.st.harvested.size >= 1, 'and read back' );
}

// ---- mosquitoes at dusk ------------------------------------------------------------------------------------------------------
console.log( 'mosquitoes' );
{
	for ( const p of [ ...M.list.values() ] ) M.remove( p, { give: false } );
	game.mode = 'survival';
	game.player.pos.set( 500, 5, 500 ); ground = 5;
	game.time.hours = Math.floor( game.time.hours / 24 ) * 24 + 24 + 18.5;
	RT.state( game ).sprayUntil = - 1;
	S.stress = 0; S.unhappy = 0;
	toasts.length = 0;
	for ( let i = 0; i < 60; i ++ ) sys.update( 0.5 );
	ok( sys.level > 0.5 && S.stress > 0.8, `dusk in a damp lowland: bitten (level ${sys.level.toFixed( 2 )}, stress ${S.stress.toFixed( 2 )})` );
	ok( toasts.includes( 'Mosquitoes' ), 'a toast, once' );
	const s0 = S.stress;
	RT.state( game ).sprayUntil = game.time.hours + 4;
	for ( let i = 0; i < 60; i ++ ) sys.update( 0.5 );
	ok( sys.level === 0 && S.stress <= s0 + 1e-9, 'bug spray: none' );
	RT.state( game ).sprayUntil = - 1;
	indoors = true;
	for ( let i = 0; i < 4; i ++ ) sys.update( 0.5 );
	ok( sys.level === 0, 'none indoors' );
	indoors = false;
	game.time.hours = Math.floor( game.time.hours / 24 ) * 24 + 13;
	for ( let i = 0; i < 4; i ++ ) sys.update( 0.5 );
	ok( sys.level === 0, 'none at midday' );
	// a night outside without a net: bites in the morning
	game.time.hours = Math.floor( game.time.hours / 24 ) * 24 + 21;
	S.unhappy = 0;
	game.sleeping = true; sys.update( 0.1 );
	game.time.hours += 8; game.sleeping = false; sys.update( 0.1 );
	ok( S.unhappy > 2 && toasts.at( - 1 ) === 'Mosquito bites', `a night out unprotected (${S.unhappy.toFixed( 1 )})` );
	put( 'mosquito_net' );
	S.unhappy = 0;
	game.sleeping = true; sys.update( 0.1 );
	game.time.hours += 8; game.sleeping = false; sys.update( 0.1 );
	ok( S.unhappy === 0, 'under a mosquito net: a good night' );
	game.mode = 'creative';
	game.time.hours = Math.floor( game.time.hours / 24 ) * 24 + 18.5;
	inv.remove( find( 'mosquito_net' ) );
	for ( let i = 0; i < 4; i ++ ) sys.update( 0.5 );
	ok( sys.level === 0, 'none in creative' );
	game.mode = 'survival';
}

// ---- the placed looks build (with the fake DOM) ---------------------------------------------------------------------------------
console.log( 'looks' );
{
	const cases = [ [ 'fish_trap', 'fish_trap', { catch: [ { id: 'raw_fish' } ] } ], [ 'crab_trap', 'crab_trap', { catch: [] } ], [ 'smoking_rack', 'smoking_rack', { load: [ { id: 'raw_boar', done: true } ], lit: true, fuel: 2 } ],
		[ 'tanning_frame', 'tanning_frame', { hide: true, t: 5 } ], [ 'pig_trap', 'pig_trap', { pig: 1, set: false } ], [ 'solar_still', 'solar_still', { L: 1, sea: 2 } ], [ 'lean_to', 'thatch_shelter', {} ],
		[ 'hammock', 'hammock', {} ], [ 'camp_seat', 'camping_chair', {} ], [ 'camp_bed', 'bedroll', {} ], [ 'mosquito_coil', 'mosquito_coil', { lit: true, left: 3 } ] ];
	for ( const [ kind, item, data ] of cases ) {
		let obj = null, err = null;
		try { obj = OUT.look[ kind ]( { kind, item, data, pos: { x: 0, y: 0, z: 0 } }, game ); } catch ( e ) { err = e; }
		let meshes = 0;
		obj?.traverse( o => { if ( o.isMesh || o.isSprite ) meshes ++; } );
		ok( obj && ! err && meshes >= 1 && meshes <= 12, `${kind} look builds in ${meshes} draws${err ? ': ' + err.message : ''}` );
	}
	const t = OUT.look.fish_trap( { kind: 'fish_trap', item: 'fish_trap', data: { catch: [] }, pos: { x: 0, y: 0, z: 0 } }, game );
	ok( !! t.userData.float, 'a trap has a float to lift to the surface' );
}

// ---- review (the pharmacy and outdoors pass) ----------------------------------------------------------------------
console.log( 'review' );
{
	// the throw net from the sand: the crosshair on the beach, the sea a few metres ahead (as in the real game)
	const h0 = hf.heightAt, f0 = game.fishing;
	game.player.pos.set( 0, 2, 0 ); game.player.swimming = false;
	game.camera.position.set( 0, 3.6, 0 ); game.camera.rotation.set( - 0.5, 0, 0 ); game.camera.updateMatrixWorld( true );
	game.fishing = { target: () => null };
	wl = 0;
	hf.heightAt = ( x, z ) => z < - 4 ? - 1.1 : 0.5;
	const spot = D.netSpot( game );
	ok( spot && Math.abs( spot.depth - 1.1 ) < 0.01 && spot.pos.z < - 4 && spot.pos.z > - 5, `facing the sea from the sand: the net lands in it (${spot && spot.depth.toFixed( 2 )} m)` );
	hf.heightAt = ( x, z ) => z < - 4 ? - 6 : 0.5;
	ok( D.netSpot( game ) === null, 'deep water ahead: no' );
	hf.heightAt = ( x, z ) => z < - 12 ? - 1 : 0.5;
	ok( D.netSpot( game ) === null, 'the sea out of reach: no' );
	// the crosshair on the water still wins, when it is within a throw
	game.fishing = { target: () => ( { pos: new THREE.Vector3( 0, 0, - 6 ), depth: 0.8 } ) };
	ok( D.netSpot( game )?.depth === 0.8, 'the water under the crosshair' );
	hf.heightAt = h0; game.fishing = f0; game.camera.rotation.set( 0, 0, 0 ); game.camera.updateMatrixWorld( true );
	// a trap set in the sea is picked by its float: looking down at it from above the water, its prompt is nearer than
	// the surface (where the sea's own Drink / Fill prompt sits)
	{
		wl = 1.2; ground = 0.1;
		const tr = M.add( 'fish_trap', makeStack( 'fish_trap' ), at( 60, 0 ), 0 );
		M.refresh( tr );
		// (wading beside it, looking down at the basket on the bottom)
		const eye = new THREE.Vector3( 61.3, 2.9, 0 ), dir = new THREE.Vector3( 60, 0.2, 0 ).sub( eye ).normalize();
		const c = M.provide( { origin: eye, dir }, 4.1 )?.find( x => x );
		const tSurface = ( eye.y - wl ) / - dir.y;
		ok( Math.abs( tr._cy - 1.1 ) < 0.01 && c && c.t < tSurface, `looking down at it: the trap's prompt (t ${c?.t?.toFixed( 2 )}) before the water (t ${tSurface.toFixed( 2 )})` );
		M.remove( tr, { give: false } );
		wl = 0; ground = 2;
	}
	// every non-crafted item lies where you can see it: the pig trap at the hardware store and the farm stands
	for ( const tbl of [ 'hardware', 'site_farm_stand' ] ) ok( compileTable( LOOT_TABLES[ tbl ] ).entries.some( e => e.ids.includes( 'pig_trap' ) ), `a pig trap in ${tbl}` );
	// models: kits and coils the icon camera looks down on (long thin ones it shows side on: a hairline)
	const { buildItemModel } = await import( '../src/render/ItemModels.js' );
	const box = ( id ) => new THREE.Box3().setFromObject( buildItemModel( getItem( id ) ), true ).getSize( new THREE.Vector3() );
	for ( const id of [ 'fish_stringer', 'bow_drill', 'smoking_rack', 'tanning_frame', 'thatch_shelter' ] ) {
		const sz = box( id );
		ok( sz.x <= 2.2 * Math.max( sz.y, sz.z ), `${id}: its icon looks down on it (${sz.x.toFixed( 2 )} × ${sz.z.toFixed( 2 )})` );
	}
	for ( const id of MINE ) {
		const sz = box( id );
		ok( sz.y > 0.002 && sz.y < 1 && sz.x > 0.01 && sz.x < 2.5, `${id}: a sane size (${sz.x.toFixed( 2 )} × ${sz.y.toFixed( 2 )} × ${sz.z.toFixed( 2 )})` );
	}
}

Math.random = random0;
console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
