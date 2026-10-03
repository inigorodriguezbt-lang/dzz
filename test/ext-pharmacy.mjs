// The pharmacy domain (Node, no DOM): node test/ext-pharmacy.mjs
//   every new item: a model, a place to be found (or made), something to do with it; loot rates
//   the ailments in Survival.js on a stub game: box jellyfish stings (night swims, the moon), centipedes in the brush,
//   sunburn (skin, sunscreen, shade), heat exhaustion and stroke, leptospirosis from untreated water, open cuts that
//   get infected (dressings clean and dirty, soiling, changing them), a cough the infected hear, a sprained wrist, sore
//   eyes; medicine effects (beta blockers, antidepressants, sleeping pills, vitamin C, doxycycline), the crutch
//   the real ItemUse.medicate with the pharmacy's hook: refusals, a dressing change giving a used bandage, the AED,
//   surgery; the verbs (readouts, listening through walls, sunscreen, vinegar, spirits on a cut, super glue, ti leaves)
//   the mixes on the real Combine: herbs in the mortar, teas at a fire, noni juice, kukui oil and salve, candles,
//   used bandages boiled, soaked and washed, swabs, tinder, ORS; herbs eaten raw; save and load
import * as THREE from 'three';
// (canvas labels and leaf textures for the model checks at the end)
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const warnings = [];
const warn0 = console.warn;
console.warn = ( ...a ) => { warnings.push( a.join( ' ' ) ); };
await import( '../src/game/items/defs/index.js' );
console.warn = warn0;
const C = await import( '../src/game/items/combos.js' );
const { ITEMS, getItem, makeStack } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, rollLoot, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const { PlayerInventory } = await import( '../src/game/Inventory.js' );
const { Survival, AIL } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { LightPool } = await import( '../src/game/items/LightPool.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );
const { Gathering } = await import( '../src/game/items/Gathering.js' );
const { PATHS } = await import( '../src/ui/icons.js' );
const MED = await import( '../src/game/items/ext/pharmacy/med.js' );
const VERBS = await import( '../src/game/items/ext/pharmacy/verbs.js' );
const { PHARM_SOUNDS } = await import( '../src/game/items/ext/pharmacy/sounds.js' );
const fs = await import( 'node:fs' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );
// a run with Math.random pinned (a chance that must, or must not, come up)
const withRandom = ( v, fn ) => { const r0 = Math.random; Math.random = typeof v === 'function' ? v : () => v; try { return fn(); } finally { Math.random = r0; } };

// the pharmacy's ids, from its def file
const SRC = fs.readFileSync( new URL( '../src/game/items/defs/ext/pharmacy.js', import.meta.url ), 'utf8' );
const MINE = [ ...SRC.matchAll( /^\t(?:med|tool|mat|food|drink)\( '([a-z_]+)'/gm ) ].map( m => m[ 1 ] );
const VSRC = fs.readFileSync( new URL( '../src/game/items/ext/pharmacy/verbs.js', import.meta.url ), 'utf8' );

// ---- the catalogue ---------------------------------------------------------------------------------------------------
console.log( 'items' );
ok( MINE.length >= 50, `pharmacy items (${MINE.length})` );
ok( ! warnings.some( w => /duplicate|no table/.test( w ) ), 'no duplicate ids or missing tables: ' + warnings.join( '; ' ) );
const MENU_ONLY = new Set( [ 'car_trunk', 'car_glovebox' ] );
const visible = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( MENU_ONLY.has( name ) || name.startsWith( 'zombie_' ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
// only ever made (ground, brewed, mixed)
const MADE = new Set( [ 'olena_poultice', 'popolo_poultice', 'kukui_oil', 'olena_salve', 'uhaloa_tea', 'noni_juice', 'ors_solution' ] );
const comboIds = new Set( C.allCombos().flatMap( c => C.comboIds( c ) ) );
const recipeIds = new Set( allRecipes().flatMap( r => [ r.out[ 0 ], ...r.in.map( i => i[ 0 ] ) ] ) );
const comboKinds = new Set( C.allCombos().flatMap( c => [ ...c.tools, ...[ c.a, c.b ].map( m => m?.tool ).filter( Boolean ) ] ) );
for ( const id of MINE ) {
	const d = getItem( id );
	ok( !! d, `${id} defined` );
	if ( ! d ) continue;
	ok( d.model?.type, `${id}: model` );
	ok( d.desc.length > 0 && d.desc.length <= 40, `${id}: a short desc (${d.desc.length})` );
	ok( visible.has( id ) || MADE.has( id ), `${id}: lies somewhere you can see it, or is made` );
	// (a mix that turns its container into it names it in its run)
	if ( MADE.has( id ) ) ok( comboIds.has( id ) || recipeIds.has( id ) || ( SRC.match( new RegExp( `'${id}'`, 'g' ) ) || [] ).length > 1, `${id}: made by a mix or a recipe` );
	const kind = d.tool?.kind;
	const does = !! d.food || !! d.drink || !! d.medical || comboIds.has( id ) || recipeIds.has( id ) || ( kind && ( comboKinds.has( kind ) || VSRC.includes( `'${kind}'` ) ) ) || !! d.crutch
		|| !! d.tool?.provides?.some( k => comboKinds.has( k ) );
	ok( does, `${id}: does something` );
}
ok( getItem( 'mortar_pestle' ).tool.kind === 'grind' && getItem( 'stone_mortar' ).tool.kind === 'grind', 'the mortars are the grind tool kind' );
ok( getItem( 'bandage_rag' ).medical.dirty === true && getItem( 'aloe_gel' ).medical.cure?.sunburn > 0, 'base items join the rules (rags dirty, aloe for sunburn)' );
for ( const id of [ 'sting', 'centipede', 'sunburn', 'burn', 'lepto', 'cut', 'wound', 'dressing', 'cough', 'sprain', 'eye', 'sunscreen', 'steady', 'drowsy' ] ) ok( !! PATHS[ id ], `an icon for the ${id} condition` );
ok( PATHS.eyes && PATHS.eyes !== PATHS.eye, 'the eyewear slot icon is untouched' );
ok( [ 'pharm_cough', 'pharm_crack', 'pharm_defib', 'pharm_puff', 'pharm_spritz' ].every( n => PHARM_SOUNDS.includes( n ) ), 'the pharmacy sounds' );
for ( const r of allRecipes().filter( r => MINE.includes( r.out[ 0 ] ) || r.in.some( i => MINE.includes( i[ 0 ] ) ) ) ) {
	ok( getItem( r.out[ 0 ] ) && r.in.every( ( [ i ] ) => getItem( i ) ), `recipe ${r.id}: real ids` );
}

// loot: medicine in the pharmacy and the bathroom, herbs at the farm stand, rare things rare
{
	let rnd = 7;
	const R = () => { rnd = ( rnd * 16807 ) % 2147483647; return rnd / 2147483647; };
	const share = ( table, n ) => { let k = 0, all = 0; for ( let i = 0; i < n; i ++ ) for ( const s of rollLoot( table, R ) ) { all ++; if ( MINE.includes( s.id ) ) k ++; } return k / Math.max( 1, all ); };
	const ph = share( 'pharmacy', 800 ), bath = share( 'house_bathroom', 800 ), farm = share( 'site_farm_stand', 800 ), office = share( 'office', 800 );
	ok( ph > 0.2 && ph < 0.6, `a pharmacy shelf holds the new medicine, not only (${( ph * 100 ).toFixed( 0 )}%)` );
	ok( bath > 0.2 && bath < 0.6, `a bathroom (${( bath * 100 ).toFixed( 0 )}%)` );
	// (a share with room to spare: the other domains keep adding to the stand's table)
	ok( farm > 0.08 && farm < 0.45, `the farm stand's herbs (${( farm * 100 ).toFixed( 0 )}%)` );
	const HERBS = [ 'noni_fruit', 'olena_root', 'awa_root', 'kukui_nuts', 'aloe_leaf', 'mamaki_leaves', 'popolo_berries', 'uhaloa_root' ];
	const seen = new Set();
	for ( let i = 0; i < 3000; i ++ ) for ( const s of rollLoot( 'site_farm_stand', R, 1 ) ) seen.add( s.id );
	ok( HERBS.every( id => seen.has( id ) ), `every remedy herb shows at a farm stand (missing: ${HERBS.filter( id => ! seen.has( id ) ).join( ', ' ) || 'none'})` );
	// a stand has three counter slots on its own table (p 0.6, 0.45, 0.35: sites/layout.js): about one in six shows a herb
	let stands = 0, withHerb = 0;
	for ( let i = 0; i < 1500; i ++ ) {
		let got = false;
		for ( const p of [ 0.6, 0.45, 0.35 ] ) if ( R() < p && rollLoot( 'site_farm_stand', R, 1 ).some( s => HERBS.includes( s.id ) ) ) got = true;
		stands ++; if ( got ) withHerb ++;
	}
	ok( withHerb / stands > 0.1, `farm stands with a remedy herb out (${( withHerb / stands * 100 ).toFixed( 0 )}%)` );
	ok( office < 0.15, `an office: little of it (${( office * 100 ).toFixed( 0 )}%)` );
	let aed = 0, rolls = 0;
	for ( const t of [ 'hospital', 'fire_station', 'school', 'office' ] ) for ( let i = 0; i < 500; i ++ ) for ( const s of rollLoot( t, R ) ) { rolls ++; if ( s.id === 'defibrillator' ) aed ++; }
	ok( aed > 0 && aed / rolls < 0.02, `the AED is rare (${aed} in ${rolls})` );
}

// ---- a stub game (as test/ext-kitchen.mjs) ------------------------------------------------------------------------
console.log( 'stub game' );
const toasts = [], noises = [];
const sky = { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0, moonPhase: 0.3 };
const zombies = [];
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {}, playTime: 0,
	events: new Events(), audio: { play() { return null; }, loop() { return null; }, buffers: new Map() },
	interact: { addProvider() { return () => {}; } }, settings: { get: () => true }, input: { pressed: () => false },
	world: { isIndoors: () => false, isBeach: () => false, sky, handVis: 1 }, weather: { rain: 0, cover: 0.3 },
	hf: { heightAt: () => 0.5, flagsNear: () => 0, surfaceAt: ( x, z, o ) => { o[ 0 ] = 0.6; o[ 1 ] = 0; o[ 2 ] = 0; o[ 3 ] = 0; return o; }, normalAt: ( x, z, n ) => n.set( 0, 1, 0 ) },
	physics: { waterLevel: () => 0, lineOfSight: ( a, b ) => b.x < 5 },
	entities: { near: ( p, r, type ) => zombies.filter( z => z.pos.distanceTo( p ) <= r ) },
	player: { pos: new THREE.Vector3(), eye: 1.6, yaw: 0, stanceH: 1.6, shake: 0, stance: 'stand', moving: false, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
	toast: ( t ) => toasts.push( t ), dropStack: () => {}, inputActive: true, onPlayerDeath() {},
	items3d: { near: () => [], byStack: () => null, remove: () => false, claim: ( w ) => w, refresh() {}, items: [] },
	app: { ui: { inventory: { other: null } } },
};
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.survival = new Survival( game );
game.actions = new Actions( game );
const lights = new LightPool( game );
game.itemUse = new ItemUse( game, lights );
game.crafting = new Crafting( game, lights );
const KB = game.combine = new Combine( game );
let fire = false;
game.nearFire = () => fire;
const inv = game.player.inventory, S = game.survival, U = game.itemUse, p = game.player;
inv.equip.back = makeStack( 'backpack_hiking', 1 );
const finish = () => game.actions.update( 999 );
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const has = ( id ) => inv.count( id );
const find = ( id ) => inv.find( ( s ) => s.id === id );
const combo = ( id ) => C.getCombo( id );
const run = ( id, a, b ) => { const r = KB.run( combo( id ), a, b ); finish(); return r; };
const verb = ( s, v ) => U.actions( s ).find( a => a.verb === v );
const med = ( s ) => { toasts.length = 0; U.medicate( s ); finish(); return toasts.slice(); };
const step = ( sec, dt = 0.5 ) => { for ( let t = 0; t < sec; t += dt ) S.update( dt ); };
// a clean body and bag between checks; the world at a calm noon, indoors-free, out of the brush unless asked
function fresh() {
	for ( const s of [ ...inv.allStacks() ] ) if ( s !== inv.equip.back ) inv.remove( s );
	for ( const k of Object.keys( inv.equip ) ) if ( k !== 'back' ) inv.equip[ k ] = null;
	S.reset(); S.thirst = 90; S.hunger = 90; S.energy = 70;
	Object.assign( p, { swimming: false, underwater: false, moving: false, sprinting: false, vehicle: null, stance: 'stand' } );
	sky.sunDir.set( 0, 0.2, 1 ).normalize(); sky.night = 0; sky.moonPhase = 0.3;
	game.world.handVis = 1; game.weather.cover = 0.3; game.time.hours = 100; fire = false;
	game.hf.flagsNear = () => 32; // town: no brush unless a check asks for it
	toasts.length = 0; noises.length = 0; zombies.length = 0;
}

// ---- jellyfish ---------------------------------------------------------------------------------------------------------
console.log( 'box jellyfish' );
{
	fresh();
	// (seeded, so the rates compare the same way every run)
	const count = ( n ) => { let sd = 12345, k = 0; withRandom( () => ( sd = ( sd * 16807 ) % 2147483647 ) / 2147483647, () => { for ( let i = 0; i < n; i ++ ) { S.sting = 0; S._ailRoll(); if ( S.sting > 0 ) k ++; } } ); return k; };
	p.swimming = true; sky.night = 1;
	S._ailEnv();
	const nightN = count( 6000 );
	ok( nightN > 15 && nightN < 80, `a night swim: a sting every couple of minutes (${nightN} in 6000 s)` );
	sky.moonPhase = 0.8;
	const moonN = count( 6000 );
	ok( moonN > nightN * 1.8, `more on the jellyfish days after the full moon (${moonN})` );
	sky.night = 0; sky.moonPhase = 0.3;
	const dayN = count( 6000 );
	ok( dayN < nightN / 4, `rare by day (${dayN})` );
	inv.equip.torso = makeStack( 'rash_guard', 1 ); S._ailEnv(); sky.night = 1;
	ok( count( 6000 ) < nightN * 0.7, 'a rash guard keeps most off' );
	inv.equip.torso = null;
	fresh();
	S.stung();
	ok( S.sting > 0.5 && S.health < 100 && toasts.includes( 'Jellyfish sting' ), 'stung: pain and a message' );
	ok( S.conditions().some( c => c.id === 'sting' && c.label === 'Jellyfish sting' ), 'the HUD shows it' );
	const sway = S.swayMul();
	step( 60 );
	ok( S.sting > 0.3 && S.pain >= S.sting * 0.69, 'it burns on for minutes' );
	ok( S.swayMul() > 1, `it shakes the aim (${sway.toFixed( 2 )})` );
	const spray = put( 'vinegar_spray' );
	ok( med( spray ).length === 0 && S.sting === 0 && spray.data.uses === 5, 'vinegar stops it (a use of the spray)' );
	ok( med( spray )[ 0 ] === 'No sting', 'nothing to douse: refused' );
	// the kitchen's rice vinegar works too, as a verb
	S.stung();
	const rv = put( 'rice_vinegar' );
	const dv = verb( rv, 'Douse sting' );
	ok( !! dv, 'rice vinegar: "Douse sting" while stung' );
	dv.run(); finish();
	ok( S.sting === 0 && find( 'rice_vinegar' )?.data.left === 7, 'one portion of it used' );
	ok( ! verb( find( 'rice_vinegar' ), 'Douse sting' ), 'no sting, no verb' );
	step( 400 );
}

// ---- centipedes --------------------------------------------------------------------------------------------------------
console.log( 'centipedes' );
{
	fresh();
	game.hf.flagsNear = () => 0; p.moving = true; sky.night = 1;
	S._ailEnv();
	ok( S._brush, 'open, moist ground off the roads is the brush' );
	let n = 0;
	for ( let i = 0; i < 6000; i ++ ) { S.centipede = 0; S._ailRoll(); if ( S.centipede > 0 ) n ++; }
	ok( n > 3 && n < 25, `a night walk through the brush: now and then (${n} in 6000 s)` );
	game.hf.flagsNear = () => 1; S._ailEnv();
	ok( ! S._brush, 'not on a road' );
	game.hf.flagsNear = () => 0; game.world.isBeach = () => true; S._ailEnv();
	ok( ! S._brush, 'not on the beach' );
	game.world.isBeach = () => false;
	fresh();
	S.bitten();
	ok( S.centipede > 0.6 && S.wound > 0 && toasts.includes( 'Centipede bite' ), 'bitten: pain, a small wound, a message' );
	const maxS = S.maxStamina();
	ok( maxS < 95, `it takes the wind out of you (max stamina ${maxS.toFixed( 0 )})` );
	const anti = put( 'antihistamine', 2 );
	med( anti );
	ok( S.centipede < 0.35 && S.fxOn( 'drowsy' ) && anti.qty === 1, 'an antihistamine eases it, and makes you drowsy' );
	ok( S.conditions().some( c => c.id === 'drowsy' ), 'drowsy shows' );
	// a night on the ground in the brush
	fresh();
	game.hf.flagsNear = () => 0; S._ailEnv();
	withRandom( 0.01, () => S.slept( 6 ) );
	ok( S.centipede > 0, 'a night asleep in the brush: a centipede' );
}

// ---- sunburn ---------------------------------------------------------------------------------------------------------
console.log( 'sunburn' );
{
	fresh();
	sky.sunDir.set( 0, 1, 0 );
	S._ailEnv();
	ok( S._uv > 0.9 && S._skin > 0.9, `noon sun on bare skin (uv ${S._uv.toFixed( 2 )}, skin ${S._skin.toFixed( 2 )})` );
	step( 300 );
	ok( S.sunburn > 0.3 && S.conditions().some( c => c.id === 'sunburn' ), `five minutes shirtless at noon: sunburn (${S.sunburn.toFixed( 2 )})` );
	ok( toasts.includes( 'Sunburn' ), 'a message' );
	const burnt = S.sunburn;
	const as = put( 'after_sun' );
	med( as );
	near( S.sunburn, burnt - 0.45, 0.02, 'after-sun takes it down' );
	ok( as.data.uses === 3, 'a use of the bottle' );
	// covered up
	fresh(); sky.sunDir.set( 0, 1, 0 );
	inv.equip.head = makeStack( 'baseball_cap', 1 ); inv.equip.torso = makeStack( 'tshirt', 1 ); inv.equip.legs = makeStack( 'jeans', 1 );
	S._ailEnv();
	step( 300 );
	ok( S.sunburn < 0.08, `a hat, a shirt and jeans: hardly (${S.sunburn.toFixed( 3 )})` );
	// sunscreen
	fresh(); sky.sunDir.set( 0, 1, 0 );
	const sc = put( 'sunscreen' );
	const ap = verb( sc, 'Apply' );
	ok( !! ap && U.actions( sc )[ 0 ].verb === 'Apply', 'sunscreen: Apply is its default' );
	ap.run(); finish();
	ok( S.fxOn( 'sunscreen' ) && sc.data.uses === 5 && S.conditions().some( c => c.id === 'sunscreen' ), 'on for hours, a use of the bottle, shown' );
	step( 300 );
	ok( S.sunburn < 0.07, `sunscreen keeps it off (${S.sunburn.toFixed( 3 )})` );
	// the sea washes it off
	p.swimming = true; step( 200 ); p.swimming = false;
	ok( ! S.fxOn( 'sunscreen' ), 'a long swim washes it off' );
	// shade and clouds
	fresh(); sky.sunDir.set( 0, 1, 0 ); game.world.handVis = 0; S._ailEnv();
	ok( S._uv === 0, 'in the shade: none' );
	game.world.handVis = 1; game.weather.cover = 0.95; S._ailEnv();
	ok( S._uv < 0.35, 'overcast: little' );
	fresh(); sky.sunDir.set( 0.8, 0.3, 0 ).normalize(); S._ailEnv();
	ok( S._uv === 0, 'the low sun of the morning: none' );
	// it heals out of the sun
	S.sunburn = 0.4; step( 200 );
	ok( S.sunburn < 0.35, 'it heals in time' );
	// aloe and kukui oil too
	S.sunburn = 0.5;
	med( put( 'aloe_leaf' ) ); med( put( 'kukui_oil' ) );
	ok( S.sunburn < 0.05, 'aloe and kukui oil soothe it' );
	// burns from fire
	fresh();
	S.hurt( 6, 'burn' );
	ok( S.burn > 0.25 && S.conditions().some( c => c.id === 'burn' ), 'a burn from fire shows as Burns' );
	const bc = put( 'burn_cream' );
	med( bc );
	ok( S.burn < 0.05 && bc.data.uses === 2, 'burn cream treats it' );
	ok( med( bc )[ 0 ] === 'No burns', 'nothing to treat: refused' );
}

// ---- heat ----------------------------------------------------------------------------------------------------------
console.log( 'heat' );
{
	fresh();
	S.temp = 39.2;
	S._ailments( 0.5 ); // (the temperature model pulls it back each update; the build-up is checked directly)
	for ( let i = 0; i < 200; i ++ ) { S.temp = 39.2; S._ailments( 0.5 ); }
	ok( S.heat > AIL.heat.stroke && S.conditions().some( c => c.id === 'hot' && c.label === 'Heat stroke' ), `a body at 39 °C for a while: heat stroke (${S.heat.toFixed( 2 )})` );
	const hp = S.health;
	for ( let i = 0; i < 40; i ++ ) { S.temp = 39.2; S._ailments( 0.5 ); }
	ok( S.health < hp, 'it hurts' );
	ok( S.maxStamina() < 85, 'and saps stamina' );
	const cp = put( 'cold_pack', 2 );
	const t0 = S.temp, h0 = S.heat;
	med( cp );
	ok( S.heat < h0 - 0.35 && S.temp < t0 - 0.5 && S.fxOn( 'cool' ) && cp.qty === 1, 'a cold pack cools you' );
	S.heat = 0.5; S.temp = 37;
	step( 120 );
	ok( S.heat < 0.25, 'it passes in the cool' );
	// the sun and thirst heat the body
	fresh(); sky.sunDir.set( 0, 1, 0 ); S._ailEnv(); S.thirst = 5;
	S._ailments( 0.1 );
	ok( S._tempAdd > 0.6, `the noon sun and thirst raise the body's heat (+${S._tempAdd.toFixed( 2 )} °C)` );
	// ORS
	fresh();
	const wb = put( 'water_bottle', 1, { liquid: 'water' } ); wb.data.amount = 0.5;
	const ors = put( 'ors_packet', 2 );
	ok( run( 'mix_ors', ors, wb ) && find( 'ors_solution' ) && ors.qty === 1, 'an ORS packet into a bottle of water: a rehydration drink' );
	S.heat = 0.5; S.sick = 0.5; S.thirst = 40;
	const os = find( 'ors_solution' );
	U.drinkItem( os ); finish();
	ok( S.heat < 0.15 && S.sick < 0.25 && S.thirst > 90 && find( 'water_bottle' ), 'it rehydrates, eases heat and nausea, and the bottle comes back' );
}

// ---- leptospirosis ----------------------------------------------------------------------------------------------------
console.log( 'leptospirosis' );
{
	fresh();
	withRandom( 0.99, () => S.drink( null, 0.5, 'dirty' ) );
	ok( S.leptoT === 0, 'lucky: untreated water without it' );
	withRandom( 0.05, () => S.drink( null, 0.5, 'dirty' ) );
	ok( S.leptoT >= AIL.lepto.incub[ 0 ] && S.lepto === 0, 'untreated water: it incubates, unseen' );
	ok( ! S.conditions().some( c => c.id === 'lepto' ), 'nothing shows yet' );
	step( 700 );
	ok( S.lepto > 0.25 && toasts.includes( 'Leptospirosis' ) && S.conditions().some( c => c.id === 'lepto' ), 'then fever and aches: Leptospirosis' );
	ok( S._tempAdd > 0.3, 'a fever' );
	const doxy = put( 'doxycycline', 2 );
	med( doxy );
	ok( S.lepto === 0 && S.fxOn( 'doxy' ), 'doxycycline ends it' );
	withRandom( 0.01, () => S.drink( null, 0.5, 'dirty' ) );
	ok( S.leptoT === 0, 'and keeps it off for a day' );
	// taken before drinking: prevents it
	fresh();
	const dx = put( 'doxycycline' );
	ok( med( dx ).length === 0 && S.fxOn( 'doxy' ) && ! find( 'doxycycline' ), 'doxycycline taken while well: protected for a day' );
	withRandom( 0.01, () => S.drink( null, 0.5, 'dirty' ) );
	ok( S.leptoT === 0, 'and the stream water is safe from it' );
	S.sick = 0;
	const amx = med( put( 'antibiotics' ) );
	ok( amx[ 0 ] === 'No infection', 'amoxicillin while well: refused ' + JSON.stringify( amx ) );
	// amoxicillin works too; untreated it peaks and passes
	fresh();
	S.lepto = 0.6;
	med( put( 'antibiotics' ) );
	ok( S.lepto === 0, 'amoxicillin treats it' );
	fresh();
	S.lepto = 0.25;
	step( 1000, 1 );
	ok( S.leptoPeak, 'untreated it peaks' );
	step( 1800, 1 );
	ok( S.lepto === 0 && toasts.includes( 'Fever gone' ), 'and passes' );
	ok( S.health > 50, `gently (health ${S.health.toFixed( 0 )})` );
	// clean water and remedies never carry it
	fresh();
	withRandom( 0.01, () => S.drink( null, 0.5, 'water' ) );
	ok( S.leptoT === 0, 'clean water: no' );
}

// ---- cuts and dressings --------------------------------------------------------------------------------------------
console.log( 'cuts and dressings' );
{
	fresh();
	withRandom( 0.1, () => S.hurt( 8, 'melee' ) );
	ok( S.bleeding === 1 && S.wound >= AIL.wound.close - 1, 'a bleeding wound is an open cut' );
	const rag = put( 'bandage_rag', 2 );
	med( rag );
	ok( S.bleeding === 0 && S.dressing === 2, 'a rag stops the bleeding: a dirty dressing' );
	ok( S.conditions().some( c => c.id === 'dressing' && c.label === 'Dirty dressing' ), 'shown as a dirty dressing' );
	// change it for a sterile one: the old one comes off as a used bandage
	const ster = put( 'bandage', 2 );
	ok( med( ster ).includes( 'Dressing changed' ) && S.dressing === 1 && has( 'bandage_dirty' ) === 1, 'a sterile bandage over it: changed, a used bandage back' );
	ok( med( ster )[ 0 ] === 'Dressing clean', 'a clean dressing: not changed again' );
	ok( S.conditions().some( c => c.id === 'dressing' && c.label === 'Dressed cut' ), 'a dressed cut' );
	// a dressing soils in time
	S.dressAge = AIL.wound.soil - 1; step( 2 );
	ok( S.dressing === 2 && toasts.includes( 'Dressing dirty' ), 'a dressing soils' );
	// disinfecting: rubbing alcohol on an open cut
	const ra = put( 'rubbing_alcohol' );
	ok( S.ailing( 'dirty' ) && med( ra ).length === 0 && S.woundClean && ra.data.uses === 7, 'alcohol cleans the cut' );
	ok( med( ra )[ 0 ] === 'Cut is clean', 'not twice' );
	// the cut closes and the dressing comes off
	step( 700, 1 );
	ok( S.wound === 0 && S.dressing === 0, 'the cut closes' );
	ok( med( ster )[ 0 ] === 'Not bleeding', 'no cut, no bandage' );
	// infection risk by dressing: none, clean, dirty
	const risk = ( dressing, clean ) => AIL.wound.risk * AIL.wound.dress[ dressing ] * ( clean ? AIL.wound.clean : 1 );
	ok( risk( 2, false ) > risk( 0, false ) && risk( 0, false ) > risk( 1, false ) && risk( 1, true ) < risk( 1, false ), 'dirty > none > clean > cleaned and clean' );
	const p600 = ( r ) => 1 - Math.pow( 1 - r, 600 );
	ok( p600( risk( 0, false ) ) > 0.15 && p600( risk( 0, false ) ) < 0.4 && p600( risk( 1, true ) ) < 0.05, `over a cut's life: untreated ${( p600( risk( 0, false ) ) * 100 ).toFixed( 0 )}%, cleaned and dressed ${( p600( risk( 1, true ) ) * 100 ).toFixed( 1 )}%` );
	// an infected cut grows, brings fever, stops healing; ʻōlena, antibiotics and the salve treat it
	fresh();
	S.openWound();
	withRandom( 0, () => S.update( 0.5 ) );
	ok( S.cut > 0 && toasts.includes( 'Infected cut' ) && S.conditions().some( c => c.id === 'cut' ), 'an open cut can get infected' );
	S.cut = 0.7; S.health = 80;
	step( 30 );
	ok( S._tempAdd > 0.3 && S.health < 80, 'a bad one brings fever and hurts' );
	const op = put( 'olena_poultice' );
	med( op );
	ok( S.cut < 0.3 && S.woundClean, 'an ʻōlena poultice fights it (and cleans the cut)' );
	med( put( 'antibiotics' ) );
	ok( S.cut === 0 && toasts.includes( 'Infection gone' ), 'antibiotics finish it' );
	// gloves keep a dressing cleaner
	fresh();
	inv.equip.hands = makeStack( 'latex_gloves', 1 );
	withRandom( 0.1, () => S.hurt( 8, 'melee' ) );
	med( put( 'bandage' ) );
	ok( S.dressK === 0.5 && inv.equip.hands.cond < 1, 'nitrile gloves on: a cleaner dressing (the gloves wear)' );
	// closure strips and super glue
	fresh();
	withRandom( 0.1, () => S.hurt( 8, 'melee' ) );
	const w0 = S.wound;
	med( put( 'butterfly_strips' ) );
	ok( S.bleeding === 0 && S.wound < w0 - 250, 'closure strips: the cut closes sooner' );
	fresh();
	withRandom( 0.1, () => S.hurt( 8, 'melee' ) );
	const glue = put( 'superglue' );
	const gv = verb( glue, 'Glue cut' );
	ok( !! gv, 'super glue: "Glue cut" while bleeding' );
	gv.run(); finish();
	ok( S.bleeding === 0 && S.woundClean && glue.data.uses === 2, 'glued shut, clean' );
	// a shot of spirits poured on it
	fresh();
	withRandom( 0.1, () => S.hurt( 8, 'melee' ) );
	med( put( 'bandage_rag' ) );
	const rum = put( 'rum' );
	const dc = verb( rum, 'Disinfect cut' );
	ok( !! dc, 'rum: "Disinfect cut" on an open cut' );
	dc.run(); finish();
	ok( S.woundClean && find( 'rum' )?.data.left === 3, 'a shot poured on (not drunk)' );
	ok( S.drunk === 0, 'and not drunk' );
}

// ---- the used bandage cycle ------------------------------------------------------------------------------------------
console.log( 'used bandages' );
{
	fresh();
	const dirty = put( 'bandage_dirty', 3 );
	const pot = put( 'cooking_pot', 1, { liquid: 'water' } ); pot.data.amount = 1;
	ok( ! KB.state( combo( 'boil_dirty_bandages' ), dirty, pot ).ok, 'boiling needs a fire' );
	fire = true;
	ok( run( 'boil_dirty_bandages', dirty, pot ) && has( 'bandage' ) === 3 && ! has( 'bandage_dirty' ), 'boiled at a fire: three sterile bandages' );
	fire = false;
	const d2 = put( 'bandage_dirty', 2 );
	const rum = put( 'rum' );
	ok( run( 'soak_dirty_bandage', rum, d2 ) && has( 'bandage' ) === 4 && find( 'rum' ).data.left === 3, 'soaked in rum: sterile (a shot used)' );
	const ra = put( 'rubbing_alcohol' );
	ok( run( 'soak_dirty_bandage', ra, find( 'bandage_dirty' ) ) && has( 'bandage' ) === 5 && ra.data.uses === 7, 'or in rubbing alcohol (a use)' );
	const d3 = put( 'bandage_dirty' );
	const wb = put( 'water_bottle', 1, { liquid: 'water' } ); wb.data.amount = 0.5;
	ok( run( 'wash_dirty_bandage', d3, wb ) && has( 'bandage_rag' ) === 1 && wb.data.amount < 0.25, 'washed in water: a rag bandage (not sterile)' );
	ok( run( 'sterilize_rag', ra, find( 'bandage_rag' ) ) && has( 'bandage' ) === 6, 'rubbing alcohol sterilizes a rag bandage' );
	const cot = put( 'cotton_balls', 2 );
	ok( run( 'alcohol_swabs', ra, cot ) && has( 'alcohol_wipes' ) === 4, 'cotton and alcohol: swabs' );
}

// ---- cough, sprain, eyes ------------------------------------------------------------------------------------------
console.log( 'cough, sprain, eyes' );
{
	fresh();
	for ( let i = 0; i < 400; i ++ ) { S.temp = 35.5; S._ailments( 1 ); }
	ok( S.cough > 0.25 && S.conditions().some( c => c.id === 'cough' ), `cold and wet: a cough (${S.cough.toFixed( 2 )})` );
	noises.length = 0;
	for ( let i = 0; i < 120; i ++ ) { S.temp = 35.5; S._ailments( 1 ); }
	ok( noises.some( n => n.kind === 'cough' && n.radius >= 10 ), `coughing fits the infected hear (${noises.length})` );
	const inh = put( 'inhaler' );
	med( inh );
	noises.length = 0;
	for ( let i = 0; i < 120; i ++ ) { S.temp = 35.5; S._ailments( 1 ); }
	ok( noises.length === 0 && S.stamina > 0 && inh.data.uses === 7, 'an inhaler quiets it for a while' );
	const cs = put( 'cough_syrup' );
	const c0 = S.cough;
	med( cs );
	ok( S.cough < c0 - 0.4 && S.fxOn( 'drowsy' ), 'cough syrup stops it, drowsy' );
	S.cough = 0.5;
	S.drink( { drink: getItem( 'uhaloa_tea' ).drink }, 0.3 );
	ok( S.cough < 0.05, 'ʻuhaloa tea too' );
	// sprain
	fresh();
	withRandom( 0.1, () => S.hurt( 3, 'fall', { fall: 3.6 } ) );
	ok( S.sprain > 0.7 && ! S.fracture && toasts.includes( 'Sprained wrist' ), 'a fall: a sprained wrist' );
	const sw = S.swayMul();
	ok( sw > 1.2, `a shaky aim (${sw.toFixed( 2 )})` );
	const sling = put( 'arm_sling' );
	med( sling );
	ok( S.sling && ! find( 'arm_sling' ) && S.swayMul() < sw, 'in a sling: steadier' );
	const sp = S.sprain;
	step( 100 );
	near( sp - S.sprain, 100 * AIL.sprain.fade * AIL.sprain.sling, 0.01, 'it mends three times faster' );
	S.sprain = 0.001; step( 2 );
	ok( S.sprain === 0 && ! S.sling && toasts.includes( 'Wrist healed' ), 'healed: the sling comes off' );
	ok( med( put( 'arm_sling' ) )[ 0 ] === 'No sprain', 'no sprain: refused' );
	// eyes
	fresh();
	p.underwater = true; S._ailEnv(); step( 30 ); p.underwater = false;
	ok( S.eye > 0.3 && S.conditions().some( c => c.id === 'eye' && c.label === 'Sore eyes' ), 'seawater in open eyes: sore' );
	const ed = put( 'eye_drops' );
	med( ed );
	ok( S.eye === 0, 'eye drops' );
	ok( med( ed )[ 0 ] === 'Eyes fine', 'not when fine' );
	fresh();
	inv.equip.face = makeStack( 'dive_mask', 1 ); p.underwater = true; S._ailEnv(); step( 30 );
	ok( S.eye === 0, 'a dive mask keeps them fine' );
}

// ---- medicine effects ---------------------------------------------------------------------------------------------
console.log( 'medicine effects' );
{
	fresh();
	S.stress = 60;
	const sw = S.swayMul();
	med( put( 'beta_blockers' ) );
	ok( S.fxOn( 'steady' ) && S.swayMul() < sw * 0.65 && S.vitals().hr < 75, 'propranolol: a steady aim, a slow pulse' );
	game.time.hours += 5;
	ok( ! S.fxOn( 'steady' ), 'it wears off after hours' );
	fresh();
	S.stress = 60; S.unhappy = 60;
	med( put( 'antidepressants' ) );
	step( 600 );
	ok( S.stress < 50 && S.unhappy < 52, `sertraline eases stress and gloom over time (${S.stress.toFixed( 0 )}, ${S.unhappy.toFixed( 0 )})` );
	fresh();
	S.energy = 90;
	med( put( 'sleeping_pills' ) );
	ok( S.energy < 70 && S.fxOn( 'deep' ), 'sleeping pills: tired enough to sleep' );
	S.unhappy = 80;
	const e0 = S.energy;
	game.time.hours += 6; S.slept( 6 );
	ok( S.energy > e0 && ! S.fx.deep && ! toasts.includes( 'Slept badly' ), 'a deep sleep, even unhappy' );
	fresh();
	med( put( 'vitamin_c' ) );
	ok( S.fxOn( 'immune' ), 'vitamin C: fewer infections for hours' );
	fresh();
	S.health = 60;
	const nf = put( 'noni_fruit' );
	U.eat( nf ); finish();
	ok( S.fxOn( 'regen' ) && S.unhappy > 0, 'noni: a slow heal, and awful' );
	const h0 = S.health; S.hunger = 30; step( 60 );
	ok( S.health > h0 + 1, 'it mends even hungry' );
	fresh();
	const aw = put( 'awa_root' );
	U.eat( aw ); finish();
	ok( S.painkiller >= 0.3 && S.fxOn( 'drowsy' ), 'ʻawa root chewed: less pain, drowsy' );
	fresh();
	const kn = put( 'kukui_nuts', 3 );
	withRandom( 0.1, () => { U.eat( kn ); finish(); } );
	ok( S.sick > 0, 'raw kukui nuts: a purge' );
	fresh();
	S.energy = 50;
	med( put( 'glucose_gel' ) );
	ok( S.energy > 55 && S.hunger > 90, 'glucose gel: quick energy' );
	fresh();
	S.temp = 35.4;
	med( put( 'heat_pack' ) );
	ok( S.temp > 35.6 && S.fxOn( 'warm' ), 'a hand warmer warms you' );
}

// ---- the crutch ---------------------------------------------------------------------------------------------------
console.log( 'crutch' );
{
	fresh();
	S.breakLeg();
	const slow = S.moveModifiers().speed;
	const cr = put( 'crutch' );
	inv.hands = cr.uid;
	const fast = S.moveModifiers().speed;
	ok( fast > slow * 1.3 && ! S.moveModifiers().canSprint, `a crutch in the hands: faster on a broken leg (${slow.toFixed( 2 )} → ${fast.toFixed( 2 )})` );
	S.splint = true;
	ok( S.moveModifiers().speed <= 0.82, 'never full speed' );
	inv.hands = null;
	const r = put( 'rags', 2 ), ls = put( 'long_stick' ), kn = put( 'kitchen_knife' );
	ok( run( 'rag_crutch', r, ls ) && find( 'crutch_improvised' ), 'rags on a long stick: an improvised crutch' );
	inv.hands = find( 'crutch_improvised' ).uid;
	ok( S.moveModifiers().speed > 0.6, 'that works too' );
	void kn;
}

// ---- instruments and the big kit ------------------------------------------------------------------------------------
console.log( 'instruments' );
{
	fresh();
	S.temp = 38.43;
	const th = put( 'thermometer' );
	ok( U.actions( th )[ 0 ].verb === 'Take temperature', 'thermometer: Take temperature' );
	U.actions( th )[ 0 ].run(); finish();
	ok( toasts.includes( '38.4 °C' ), 'an exact readout: ' + toasts.join( ', ' ) );
	fresh();
	const bp = put( 'bp_cuff' );
	U.actions( bp )[ 0 ].run(); finish();
	ok( /^BP 1\d\d\/\d\d · Pulse \d+$/.test( toasts[ 0 ] || '' ), 'blood pressure and pulse: ' + toasts[ 0 ] );
	S.blood = 3000; toasts.length = 0;
	U.actions( bp )[ 0 ].run(); finish();
	ok( /^BP (\d+)/.exec( toasts[ 0 ] )?.[ 1 ] < 100, 'blood loss shows as low pressure: ' + toasts[ 0 ] );
	fresh();
	const st = put( 'stethoscope' );
	S.cough = 0.6;
	U.actions( st )[ 0 ].run(); finish();
	ok( /^Pulse \d+ · Wheezing$/.test( toasts[ 0 ] || '' ), 'stethoscope: pulse and lungs: ' + toasts[ 0 ] );
	// listening through walls: the infected out of sight (the stub's walls: beyond x = 5)
	zombies.push( { pos: new THREE.Vector3( 8, 0, 0 ), alive: true }, { pos: new THREE.Vector3( 9, 0, 2 ), alive: true }, { pos: new THREE.Vector3( 3, 0, 0 ), alive: true }, { pos: new THREE.Vector3( 30, 0, 0 ), alive: true } );
	toasts.length = 0;
	verb( st, 'Listen' ).run(); finish();
	ok( toasts[ 0 ] === '2 moving close', 'Listen: the two behind the wall, not the one in sight or the far one: ' + toasts[ 0 ] );
	zombies.length = 0; toasts.length = 0;
	verb( st, 'Listen' ).run(); finish();
	ok( toasts[ 0 ] === 'Quiet', 'quiet' );
	// the AED
	fresh();
	const aed = put( 'defibrillator' );
	ok( med( aed )[ 0 ] === 'No shock advised', 'the AED: no shock for the healthy' );
	S.health = 18;
	ok( med( aed ).includes( 'Shock delivered' ) && S.health > 60 && aed.data.uses === 2, 'near death: a shock and a big heal (a pad used)' );
	ok( getItem( 'defibrillator' ).dismantle?.length > 0, 'it dismantles into parts' );
	// surgery
	fresh();
	ok( med( put( 'surgery_kit' ) )[ 0 ] === 'Nothing to treat', 'surgery: nothing to fix' );
	S.breakLeg(); S.cut = 0.5; S.openWound();
	const sk = put( 'surgery_kit' );
	withRandom( 0.01, () => med( sk ) );
	ok( S.splint && S.cut === 0 && S.dressing === 1 && toasts.includes( 'Operation done' ), 'a good operation: the leg set, the infection gone, dressed' );
	fresh();
	S.breakLeg();
	withRandom( 0.99, () => med( put( 'surgery_kit' ) ) );
	ok( toasts.includes( 'Operation went badly' ) && S.bleeding > 0, 'or it goes badly' );
	ok( MED.surgeryChance( 10, true ) > MED.surgeryChance( 0, false ), 'practice and the manual help' );
	// the trauma kit
	fresh();
	withRandom( 0.1, () => { S.hurt( 8, 'melee' ); S.hurt( 8, 'melee' ); S.hurt( 8, 'melee' ); } );
	const tk = put( 'trauma_kit' );
	med( tk );
	ok( S.bleeding === 0 && S.woundClean && S.dressing === 1 && tk.data.uses === 1, 'a trauma kit: all bleeding stopped, cleaned, dressed' );
}

// ---- the herbal mixes ----------------------------------------------------------------------------------------------
console.log( 'herbs' );
{
	fresh();
	const mortar = put( 'mortar_pestle' );
	const ol = put( 'olena_root', 3 );
	ok( KB.accepts( mortar, ol )?.ok, 'the mortar onto ʻōlena: ' + KB.accepts( mortar, ol )?.verb );
	ok( run( 'grind_olena', mortar, ol ) && find( 'olena_poultice' ) && ol.qty === 2 && mortar.cond < 1, 'ground into a poultice (the mortar wears a little)' );
	const pp = put( 'popolo_berries', 1 );
	ok( ! KB.state( combo( 'grind_popolo' ), mortar, pp ).ok, 'pōpolo needs two' );
	pp.qty = 2;
	ok( run( 'grind_popolo', mortar, pp ) && find( 'popolo_poultice' ), 'a pōpolo poultice' );
	S.stung();
	med( find( 'popolo_poultice' ) );
	ok( S.sting < 0.3, 'it soothes a sting' );
	const nuts = put( 'kukui_nuts', 6 );
	ok( run( 'grind_kukui', mortar, nuts ) && find( 'kukui_oil' ) && nuts.qty === 3, 'three kukui nuts pressed: oil' );
	ok( run( 'olena_salve', ol, find( 'kukui_oil' ) ) && find( 'olena_salve' ) && ! find( 'kukui_oil' ), 'ʻōlena into the oil with the mortar: a salve' );
	const stick = put( 'stick', 2 ), knife = put( 'kitchen_knife' );
	ok( run( 'kukui_candle', nuts, stick ) && find( 'candle' ) && ! find( 'kukui_nuts' ), 'kukui nuts on a stick: a candle' );
	void knife;
	const aw = put( 'awa_root' );
	ok( run( 'grind_awa', mortar, aw ) && find( 'kava_powder' ), 'ʻawa root ground: the kitchen\'s ʻawa powder' );
	// noni juice in a jar, drunk back to the jar
	const nf = put( 'noni_fruit', 2 ), jar = put( 'canning_jar' );
	ok( run( 'noni_juice', nf, jar ) && find( 'noni_juice' ) && ! find( 'noni_fruit' ), 'two noni mashed into a jar: noni juice' );
	const nj = find( 'noni_juice' );
	U.drinkItem( nj ); finish(); U.drinkItem( find( 'noni_juice' ) ); finish();
	ok( S.fxOn( 'regen' ) && find( 'canning_jar' ) && ! find( 'noni_juice' ), 'drunk: a slow heal, the jar back' );
	// teas at a fire
	const mug = put( 'camp_mug', 1, { liquid: 'dirty' } ); mug.data.amount = 0.3;
	const uh = put( 'uhaloa_root', 2 );
	ok( ! KB.state( combo( 'brew_uhaloa' ), uh, mug ).ok, 'tea needs a fire' );
	fire = true;
	ok( run( 'brew_uhaloa', uh, mug ) && mug.id === 'uhaloa_tea', 'ʻuhaloa ground into a mug of water at a fire: tea' );
	S.cough = 0.7;
	U.drinkItem( mug ); finish();
	ok( S.cough < 0.15 && find( 'camp_mug' ), 'it stops a cough; the mug comes back' );
	const mug2 = find( 'camp_mug' ); mug2.data.liquid = 'water'; mug2.data.amount = 0.3;
	ok( run( 'brew_mamaki_leaves', put( 'mamaki_leaves' ), mug2 ) && mug2.id === 'mug_tea', 'fresh māmaki leaves: the kitchen\'s māmaki tea' );
	fire = false;
	// a ti-leaf wrap from the crafting panel
	const r = allRecipes().find( x => x.id === 'ti_leaf_wrap' );
	ok( r && r.in[ 0 ][ 0 ] === 'ti_leaves', 'ti leaves into a wrap (a recipe)' );
	// ti leaves cool a fever
	fresh();
	S.lepto = 0.5;
	const ti = put( 'ti_leaves', 2 );
	const cf = verb( ti, 'Cool forehead' );
	ok( !! cf, 'ti leaves: "Cool forehead" with a fever' );
	const t0 = S.temp; cf.run(); finish();
	ok( S.temp < t0 && ti.qty === 1, 'cooler, a leaf used' );
	// the stone mortar
	ok( allRecipes().find( x => x.id === 'stone_mortar' )?.in[ 0 ][ 0 ] === 'stone', 'a stone mortar from two stones' );
}

// ---- tinder, splints and the rest ----------------------------------------------------------------------------------
console.log( 'tinder and odds' );
{
	fresh();
	const pj = put( 'petroleum_jelly' ), cot = put( 'cotton_balls', 2 );
	ok( run( 'jelly_tinder', pj, cot ) && has( 'fire_tinder' ) === 3 && pj.data.uses === 4, 'cotton and petroleum jelly: tinder' );
	const st = put( 'stick', 3 );
	ok( run( 'tinder_fire_kit', find( 'fire_tinder' ), st ) && find( 'campfire_kit' ) && ! find( 'stick' ), 'tinder and three sticks: a fire kit' );
	const hs = put( 'hand_sanitizer' );
	ok( run( 'sanitizer_tinder', hs, find( 'cotton_balls' ) ) && has( 'fire_tinder' ) === 4, 'hand sanitizer soaks cotton into tinder' );
	const eb = put( 'elastic_bandage' ), st2 = put( 'stick', 2 );
	ok( run( 'elastic_splint', eb, st2 ) && find( 'splint_improvised' ) && eb.data.uses === 1, 'an elastic bandage and sticks: a splint' );
	const sh = put( 'trauma_shears' ), ts = put( 'tshirt' );
	ok( KB.find( sh, ts ).some( m => m.combo.id === 'cut_rags' ), 'trauma shears cut clothes into rags' );
}

// ---- the stethoscope's pulse, the vitals ------------------------------------------------------------------------------
console.log( 'vitals' );
{
	fresh();
	const v = S.vitals();
	ok( v.temp > 36 && v.temp < 37.5 && v.hr > 55 && v.hr < 90 && v.sys > 105 && v.sys < 135 && v.lungs === 'Lungs clear', 'a calm body reads normal: ' + JSON.stringify( v ) );
	S.panic = 80; p.sprinting = true;
	ok( S.vitals().hr > 130, 'panic and a sprint race the pulse' );
	ok( VERBS.readout.thermometer( { temp: 37 } ) === '37.0 °C', 'the readout keeps a decimal' );
}

// ---- foraging ----------------------------------------------------------------------------------------------------------
console.log( 'foraging' );
{
	game.hf.flagsNear = () => 0;
	const ga = new Gathering( game );
	const k = ga.kind( 0, 0, 5 );
	const ids = new Set( k.loot.map( l => l[ 0 ] ) );
	ok( [ 'uhaloa_root', 'popolo_berries', 'mamaki_leaves', 'olena_root', 'kukui_nuts', 'awa_root' ].every( id => ids.has( id ) ), 'the herbs grow wild in the brush' );
	game.world.isBeach = () => true;
	ok( ga.kind( 0, 0, 1 ).loot.some( l => l[ 0 ] === 'noni_fruit' ), 'noni on the coast' );
	game.world.isBeach = () => false;
}

// ---- creative, save and load ------------------------------------------------------------------------------------------
console.log( 'save and load' );
{
	fresh();
	S.stung(); S.sunburn = 0.4; S.cut = 0.2; S.openWound(); S.dressing = 2; S.lepto = 0.3; S.leptoPeak = true; S.sprain = 0.5; S.sling = true;
	S.fxAdd( 'steady', 3 );
	const saved = JSON.parse( JSON.stringify( S.serialize() ) );
	S.reset();
	ok( S.sting === 0 && ! S.fxOn( 'steady' ), 'a new character is clear' );
	S.load( saved );
	ok( S.sting > 0.5 && S.sunburn === 0.4 && S.cut === 0.2 && S.dressing === 2 && S.leptoPeak && S.sling && S.fxOn( 'steady' ), 'ailments and effects come back with a save' );
	S.load( { health: 80 } );
	ok( S.sting === 0 && S.wound === 0 && S.fx && ! S.fxOn( 'steady' ), 'an old save without them: clear' );
	game.mode = 'creative';
	S.stung(); S.sunburn = 0.5; S.update( 0.1 );
	ok( S.sting === 0 && S.sunburn === 0, 'creative: none of it' );
	game.mode = 'survival';
}

// ---- review (the pharmacy and outdoors pass) ----------------------------------------------------------------------
console.log( 'review' );
{
	// box jellyfish: night swims (and dusk), never by day
	fresh();
	p.swimming = true; sky.night = 0; S._ailEnv();
	let day = 0;
	for ( let i = 0; i < 20000; i ++ ) { S.sting = 0; S._ailRoll(); if ( S.sting > 0 ) day ++; }
	ok( day === 0, `no stings by day (${day} in 20000 s)` );
	sky.night = 0.3;
	let dusk = 0;
	withRandom( 0.0005, () => { S.sting = 0; S._ailRoll(); if ( S.sting > 0 ) dusk ++; } );
	ok( dusk === 1, 'at dusk they come' );
	p.swimming = false;
	// a fever is not the heat: leptospirosis or an infected cut warms you without building towards heat stroke
	fresh();
	S.lepto = 1; S.leptoPeak = true;
	for ( let i = 0; i < 400; i ++ ) { S.temp = 38.9; S._ailments( 0.5 ); }
	ok( S.heat < 0.05, `a fever of 38.9 °C: no heat stroke from it (${S.heat.toFixed( 2 )})` );
	fresh();
	for ( let i = 0; i < 400; i ++ ) { S.temp = 38.9; S._ailments( 0.5 ); }
	ok( S.heat > AIL.heat.exhaust, `38.9 °C from the sun and running: heat exhaustion (${S.heat.toFixed( 2 )})` );
	// a small infection in a cut that has closed passes on its own; a big one doesn't
	fresh();
	S.cut = 0.12; S.wound = 0;
	step( 600, 1 );
	ok( S.cut === 0 && toasts.includes( 'Infection gone' ), 'a small infected cut, closed: it passes' );
	fresh();
	S.cut = 0.4; S.wound = 0;
	step( 60, 1 );
	ok( S.cut > 0.4, 'a bad one keeps growing until treated' );
	// an untreated infected cut gets serious slowly (game hours, not minutes)
	fresh();
	S.cut = 0.08; S.wound = 300;
	let t = 0;
	while ( S.cut < 0.5 && t < 7200 ) { S._ailments( 1 ); S.wound = Math.max( S.wound, 1 ); t ++; }
	ok( t > 600, `from infected to fever: ${( t / 60 ).toFixed( 0 )} min of play` );
	// the lifeguard's vinegar spray is medicine, not pickling vinegar: the kitchen's pickle mix doesn't take it
	fresh();
	put( 'vinegar_spray' );
	const jar = put( 'canning_jar' ), cab = put( 'cabbage' );
	ok( ! getItem( 'vinegar_spray' ).tags.includes( 'vinegar' ), 'the spray is not tagged vinegar' );
	if ( combo( 'pickle' ) ) ok( KB.state( combo( 'pickle' ), cab, jar ).reason === 'Need vinegar', 'pickling with only the spray: "Need vinegar"' );
	// models: what the icon camera sees (render/Icons.js: long things side on, flat things from above); a leaf or a
	// poultice seen side on is a green line
	const { buildItemModel } = await import( '../src/render/ItemModels.js' );
	const box = ( id ) => new THREE.Box3().setFromObject( buildItemModel( getItem( id ) ), true ).getSize( new THREE.Vector3() );
	for ( const id of [ 'aloe_leaf', 'olena_poultice', 'popolo_poultice', 'ti_leaf_wrap', 'mamaki_leaves' ] ) {
		const sz = box( id );
		ok( sz.x <= 2.2 * Math.max( sz.y, sz.z ), `${id}: not a side-on sliver in its icon (${sz.x.toFixed( 2 )} × ${sz.z.toFixed( 2 )})` );
	}
	ok( box( 'crutch' ).y > 0.05, 'the crutch lies tipped on its pad, its frame showing from the side' );
	for ( const id of MINE ) {
		const sz = box( id );
		ok( sz.y > 0.002 && sz.y < 0.6 && sz.x < 1.6 && sz.x > 0.01, `${id}: a sane size (${sz.x.toFixed( 2 )} × ${sz.y.toFixed( 2 )} × ${sz.z.toFixed( 2 )})` );
	}
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
