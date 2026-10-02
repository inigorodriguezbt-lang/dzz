// The kitchen domain (Node, no DOM): node test/ext-kitchen.mjs
//   every new item: a model, a place to be found (or made), something to do with it
//   evolved dishes on the real Combine / ItemUse / Survival with a stub game: a pot of stew from start to the last
//   portion (names, nutrition, cooking at a fire, the pot back), stir-fry with oil, poke in a bowl, a sandwich, a loco
//   moco rice bowl, refusals (a sealed can, raw chicken in a salad, a full pot)
//   mixes: cocktails, coffee from the bean, poke, salting, smoking, pickles, li hing fruit, shave ice, desserts, the rice
//   cooker, rot into bait; ice in a cooler; the imu from the dig to the feast; the verbs (sea salt, snow, Dig imu)
const warnings = [];
const warn0 = console.warn;
console.warn = ( ...a ) => { warnings.push( a.join( ' ' ) ); };
await import( '../src/game/items/defs/index.js' );
console.warn = warn0;
const C = await import( '../src/game/items/combos.js' );
const { ITEMS, getItem, makeStack, displayName } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, rollLoot, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const THREE = await import( 'three' );
const { PlayerInventory } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { LightPool } = await import( '../src/game/items/LightPool.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );
const { getPlaceable } = await import( '../src/game/items/placeables/registry.js' );
const EV = await import( '../src/game/items/ext/kitchen/evolved.js' );
const COLD = await import( '../src/game/items/ext/kitchen/cold.js' );
const { IMU, imuOut } = await import( '../src/game/items/ext/kitchen/imu.js' );
const K = await import( '../src/game/items/defs/ext/kitchen.js' );
const fs = await import( 'node:fs' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );

// the kitchen's ids, from its def file
const SRC = fs.readFileSync( new URL( '../src/game/items/defs/ext/kitchen.js', import.meta.url ), 'utf8' );
const MINE = [ ...SRC.matchAll( /^\t(?:food|drink|tool|mat)\( '([a-z_]+)'/gm ) ].map( m => m[ 1 ] );

// ---- the catalogue ---------------------------------------------------------------------------------------------------
console.log( 'items' );
ok( MINE.length >= 70, `kitchen items (${MINE.length})` );
ok( ! warnings.some( w => /duplicate|no table/.test( w ) ), 'no duplicate ids or missing tables: ' + warnings.join( '; ' ) );
// visible loot: building tables that feed shelves and floors, and the outdoor sites (not trunks, gloveboxes, the dead)
const MENU_ONLY = new Set( [ 'car_trunk', 'car_glovebox' ] );
const visible = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( MENU_ONLY.has( name ) || name.startsWith( 'zombie_' ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
// only ever made (cooked, mixed, brewed, dug out of an imu)
const MADE = new Set( [ 'laulau_raw', 'laulau', 'kulolo', 'li_hing_fruit', 'shave_ice', 'smoked_meat', 'smoked_fish', 'pickled_vegetables', 'sea_salt', 'cooked_crab',
	'soup_pot_raw', 'soup_pot', 'stirfry_raw', 'stirfry', 'salad_bowl', 'sandwich', 'rice_bowl', 'mug_coffee', 'sweet_coffee', 'mug_tea', 'mug_cocoa', 'kava_drink',
	'mai_tai', 'blue_hawaii', 'lava_flow',
	// always found rotten (Loot PERISHABLE_H), so made rather than looted: a combo, a recipe, the rocks at the shore
	'mac_salad', 'lomi_salmon', 'opihi' ] );
const comboIds = new Set( C.allCombos().flatMap( c => C.comboIds( c ) ) );
const recipeIds = new Set( allRecipes().flatMap( r => [ r.out[ 0 ], ...r.in.map( i => i[ 0 ] ) ] ) );
for ( const id of MINE ) {
	const d = getItem( id );
	ok( !! d, `${id} defined` );
	if ( ! d ) continue;
	ok( d.model?.type, `${id}: model` );
	ok( d.desc.length <= 40, `${id}: short desc` );
	ok( visible.has( id ) || MADE.has( id ), `${id}: lies somewhere you can see it, or is made` );
	// named again past its definition: a combo, a recipe, a verb or a cooked form makes it or uses it
	const named = ( SRC.match( new RegExp( `'${id}'`, 'g' ) ) || [] ).length > 1 || [ ...ITEMS.values() ].some( x => x.food?.cooked === id );
	if ( MADE.has( id ) ) ok( comboIds.has( id ) || recipeIds.has( id ) || named || EV.isDish( id ), `${id}: made by something` );
	// something to do with it: eat, drink, a combo, a recipe, a dish ingredient, a tool kind the mixes ask for
	const kind = d.tool?.kind;
	const does = !! d.food || !! d.drink || comboIds.has( id ) || recipeIds.has( id ) || !! EV.ingredient( d ) || !! d.chill || named
		|| ( kind && C.allCombos().some( c => c.tools.includes( kind ) || JSON.stringify( [ c.a, c.b ] ).includes( `"${kind}"` ) || String( c.a?.fn || '' ).includes( `'${kind}'` ) || String( c.b?.fn || '' ).includes( `'${kind}'` ) ) );
	ok( does, `${id}: does something` );
}
for ( const k of [ 'pan', 'bowl', 'grater', 'grinder' ] ) ok( MINE.some( id => getItem( id ).tool?.kind === k ), `tool kind ${k} exists` );
ok( getItem( 'coffee_grinder' ).tool.provides.includes( 'grind' ), 'the grinder provides grind (a mortar for the pharmacy)' );
// loot: rolls give kitchen things where they should
{
	let rnd = 1;
	const R = () => { rnd = ( rnd * 16807 ) % 2147483647; return rnd / 2147483647; };
	const count = ( table, n ) => { let k = 0, all = 0; for ( let i = 0; i < n; i ++ ) for ( const s of rollLoot( table, R ) ) { all ++; if ( MINE.includes( s.id ) ) k ++; } return k / Math.max( 1, all ); };
	const kitchen = count( 'house_kitchen', 600 ), grocery = count( 'grocery', 600 ), office = count( 'office', 600 );
	ok( kitchen > 0.12 && kitchen < 0.4, `a kitchen holds kitchen things, not only (${( kitchen * 100 ).toFixed( 0 )}%)` );
	ok( grocery > 0.1 && grocery < 0.4, `a grocery shelf (${( grocery * 100 ).toFixed( 0 )}%)` );
	ok( office > 0.03 && office < 0.3, `an office: mugs and coffee (${( office * 100 ).toFixed( 0 )}%)` );
	// what is only ever made never turns up in loot (a tag entry picking it up: a Mai Tai on a grocery shelf)
	for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) if ( MADE.has( id ) ) ok( false, `${name} can roll ${id}, which is only made` );
	// ice only where relief supplies are handed out (and a week into the outage, not on a shop shelf)
	for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) if ( compileTable( t ).entries.some( e => e.ids.includes( 'ice_bag' ) ) ) ok( name === 'site_fema_camp', `ice in ${name}` );
	let ice = 0; for ( let i = 0; i < 400; i ++ ) if ( rollLoot( 'site_fema_camp', R ).some( s => s.id === 'ice_bag' ) ) ice ++;
	ok( ice > 0 && ice < 60, `relief ice at FEMA camps, now and then (${ice}/400)` );
	// what is found rotten (a week without power) is rare: no more than a few percent of a table's finds
	const { freshness } = await import( '../src/game/items/ItemDB.js' );
	for ( const t of [ 'restaurant', 'fridge', 'market', 'site_fishing_spot', 'site_picnic', 'fastfood' ] ) {
		let all = 0, bad = 0;
		for ( let i = 0; i < 800; i ++ ) for ( const st of rollLoot( t, R ) ) { all ++; if ( MINE.includes( st.id ) && getItem( st.id ).food?.spoil && freshness( st ) <= 0 ) bad ++; }
		ok( bad / Math.max( 1, all ) < 0.03, `${t}: kitchen finds that are rotten ${( bad / all * 100 ).toFixed( 1 )}%` );
	}
}

// ---- a stub game (as test/combos.mjs) ----------------------------------------------------------------------------------
console.log( 'stub game' );
const toasts = [], dropped = [];
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {},
	events: new Events(), audio: { play() { return null; }, loop() { return null; }, buffers: new Map() },
	interact: { addProvider() { return () => {}; } }, settings: { get: () => true }, input: { pressed: () => false },
	world: { isIndoors: () => false, isBeach: () => false, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } }, weather: { rain: 0, cover: 0.3 },
	hf: { heightAt: ( x ) => x > 1 ? - 2 : 0.5 }, physics: { waterLevel: () => 0 },
	player: { pos: new THREE.Vector3(), yaw: 0, stanceH: 1.6, shake: 0, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => dropped.push( s ), inputActive: true,
	items3d: { near: () => [], byStack: () => null, remove: () => false, claim: ( w ) => w, refresh() {}, items: [] },
	app: { ui: { inventory: { other: null } } },
};
game.survival = new Survival( game );
game.actions = new Actions( game );
const lights = new LightPool( game );
game.itemUse = new ItemUse( game, lights );
game.crafting = new Crafting( game, lights );
const KB = game.combine = new Combine( game );
let fire = true;
game.nearFire = () => fire;
const inv = game.player.inventory, S = game.survival, U = game.itemUse;
inv.equip.back = makeStack( 'backpack_hiking', 1 );
inv.equip.legs = makeStack( 'cargo_pants', 1 );
const finish = () => game.actions.update( 999 );
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const has = ( s ) => !! inv.findAll( x => x === s ).length;
const find = ( id ) => inv.find( ( s ) => s.id === id );
const combo = ( id ) => C.getCombo( id );
const run = ( id, a, b ) => { const r = KB.run( combo( id ), a, b ); finish(); return r; };
const verb = ( s, v ) => U.actions( s ).find( a => a.verb === v );
const clear = () => { for ( const s of [ ...inv.allStacks() ] ) if ( s !== inv.equip.back && s !== inv.equip.legs ) inv.remove( s ); toasts.length = 0; dropped.length = 0; };

// ---- a pot of stew, start to finish ------------------------------------------------------------------------------------
console.log( 'stew' );
{
	clear();
	const pot = put( 'cooking_pot', 1, { liquid: 'water' } ); pot.data.amount = 1.2; pot.cond = 0.8;
	const taro = put( 'taro', 2 ), spam = put( 'spam' ), onion = put( 'onion' ), shoyu = put( 'shoyu' );
	ok( KB.accepts( taro, pot )?.ok && KB.accepts( taro, pot ).verb === 'Add to pot', 'taro onto a pot of water: ' + KB.accepts( taro, pot )?.verb );
	ok( ! C.findCombos( shoyu, pot ).some( x => x.combo.id === 'dish_pot' ), 'a seasoning alone does not start a soup' );
	ok( run( 'dish_pot', taro, pot ) && pot.id === 'soup_pot_raw' && taro.qty === 1, `the pot became an uncooked stew (${pot.id}), one taro used (${taro.qty})` );
	const D = pot.data.dish;
	ok( D?.base === 'pot' && D.vessel?.id === 'cooking_pot' && D.vessel.cond === 0.8 && D.water > 40, 'the dish remembers its pot and its broth' );
	ok( displayName( pot ) === 'Uncooked stew (taro)', 'named after what is in it: ' + displayName( pot ) );
	run( 'dish_pot_add', spam, pot ); run( 'dish_pot_add', onion, pot );
	ok( ! has( spam ) && ! has( onion ) && displayName( pot ) === 'Uncooked stew (taro, Spam, onion)', 'more in: ' + displayName( pot ) );
	run( 'dish_pot_add', shoyu, pot );
	ok( shoyu.data.left === 9 && D.spice === 1 && displayName( pot ) === 'Uncooked stew (taro, Spam, onion)', `a seasoning: one portion (${shoyu.data.left} left), not in the name` );
	const kcal = 300 + 1020 + 45 + 8;
	near( D.kcal, kcal, 1, 'the kcal add up' );
	ok( D.raw > 0.3, 'raw taro: unsafe until cooked' );
	// a sealed can, and a full pot
	const milk = put( 'coconut_milk' );
	ok( KB.state( combo( 'dish_pot_add' ), milk, pot ).reason === 'Open it first', 'a sealed can: open it first' );
	milk.data.open = true;
	for ( let i = 0; i < 2; i ++ ) run( 'dish_pot_add', put( 'onion' ), pot );
	run( 'dish_pot_add', milk, pot );
	ok( KB.state( combo( 'dish_pot_add' ), put( 'tomato' ), pot ).reason === 'Full', 'six things fill a pot' );
	// cooking it
	fire = false;
	ok( ! verb( pot, 'Cook' ), 'no Cook away from a fire' );
	fire = true;
	ok( U.actions( pot )[ 0 ].verb === 'Cook', 'at a fire, Cook is the default' );
	game.skills.setLevel?.( 'cooking', 5 );
	const xp0 = game.skills.total?.( 'cooking' ) ?? 0;
	verb( pot, 'Cook' ).run(); finish();
	ok( pot.id === 'soup_pot' && pot.data.dish.cooked && pot.data.dish.raw === 0, 'cooked: a stew now' );
	ok( displayName( pot ) === 'Stew (taro, Spam, onion, …)', 'the cooked name: ' + displayName( pot ) );
	ok( ( game.skills.total?.( 'cooking' ) ?? 1 ) > xp0, 'cooking xp' );
	near( pot.data.dish.mul, 1.15, 1e-6, 'level 5: +15% food' );
	// eating it: four portions, the summed food, then the pot back
	S.hunger = 0; S.thirst = 0;
	const per = pot.data.dish.kcal * EV.kcalMul( pot.data.dish ) / 4 / 20;
	const potUid = pot.uid;
	verb( pot, 'Eat' ).run(); finish();
	near( S.hunger, per, 0.6, 'one portion feeds a quarter of the stew' );
	ok( S.thirst > 5, 'soup is drink too' );
	for ( let i = 0; i < 3; i ++ ) { const st = inv.findUid( potUid ); if ( st ) { verb( st, 'Eat' ).run(); finish(); } }
	const back = find( 'cooking_pot' );
	ok( ! inv.findUid( potUid ) && back && Math.abs( back.cond - 0.8 ) < 1e-6, 'the last portion gives the pot back (its condition kept)' );
	near( S.hunger, Math.min( 110, per * 4 ), 1, 'all of it eaten' );
	game.skills.setLevel?.( 'cooking', 0 );
}

// ---- stir-fry: oil, a named dish, the frying pan ---------------------------------------------------------------------------
console.log( 'stir-fry' );
{
	clear();
	const wok = put( 'wok' ), rice = put( 'cooked_rice', 2 ), spam = put( 'spam' );
	ok( KB.state( combo( 'dish_pan' ), rice, wok ).reason === 'Need cooking oil', 'no oil: no stir-fry' );
	const oil = put( 'cooking_oil' );
	ok( run( 'dish_pan', rice, wok ) && wok.id === 'stirfry_raw' && oil.data.splash === 7, `oiled and in (${wok.id}, oil ${oil.data.splash})` );
	ok( displayName( wok ) === 'Uncooked fried rice', displayName( wok ) );
	run( 'dish_pan_add', spam, wok );
	ok( displayName( wok ) === 'Uncooked Spam fried rice', 'a dish it knows: ' + displayName( wok ) );
	verb( wok, 'Cook' ).run(); finish();
	ok( wok.id === 'stirfry' && displayName( wok ) === 'Spam fried rice' && toasts.includes( 'New dish: Spam fried rice' ), 'cooked; the first time is news' );
	toasts.length = 0;
	const w2 = put( 'wok' ); run( 'dish_pan', put( 'eggs' ), w2 ); run( 'dish_pan_add', put( 'spam' ), w2 ); verb( w2, 'Cook' ).run(); finish();
	ok( displayName( w2 ) === 'Spam and eggs', displayName( w2 ) );
	// Empty out gives the wok back
	verb( w2, 'Empty out' ).run(); finish();
	ok( w2.id === 'wok', 'emptied: the wok again' );
	// the frying pan in a weapon slot: not while held
	const pan = makeStack( 'frying_pan', 1 ); inv.weapons.melee = pan;
	ok( KB.state( combo( 'dish_pan' ), put( 'eggs' ), pan ).reason === 'Put it in a bag first', 'a frying pan in a weapon slot is not fried in' );
	delete inv.weapons.melee;
}

// ---- cold dishes: poke, a salad refusal, a sandwich, a loco moco -----------------------------------------------------------
console.log( 'bowls, bread and rice' );
{
	clear();
	const bowls = put( 'bowl', 3 ), ahi = put( 'raw_ahi' ), shoyu = put( 'shoyu' );
	ok( run( 'dish_bowl', ahi, bowls ) && bowls.qty === 2, 'one bowl of three used' );
	const salad = find( 'salad_bowl' );
	run( 'dish_bowl_add', shoyu, salad );
	ok( displayName( salad ) === 'Poke', 'raw ahi and shoyu in a bowl: ' + displayName( salad ) );
	run( 'dish_bowl_add', put( 'cooked_rice' ), salad );
	ok( displayName( salad ) === 'Poke bowl', displayName( salad ) );
	ok( KB.state( combo( 'dish_bowl' ), put( 'raw_chicken' ), bowls ).reason === 'Cook it first', 'raw chicken in a salad: cook it first' );
	const fruit = find( 'bowl' ); run( 'dish_bowl', put( 'mango' ), fruit ); const fs2 = find( 'salad_bowl' ) === salad ? inv.findAll( s => s.id === 'salad_bowl' )[ 1 ] : find( 'salad_bowl' );
	run( 'dish_bowl_add', put( 'papaya' ), fs2 );
	ok( displayName( fs2 ) === 'Fruit salad', displayName( fs2 ) );
	// a sandwich from a loaf: one slice used
	const loaf = put( 'bread_loaf' ), spam = put( 'spam' );
	ok( run( 'dish_bread', spam, loaf ) && loaf.data.left === 7, 'a slice of the loaf' );
	const sw = find( 'sandwich' );
	ok( sw && displayName( sw ) === 'Spam sandwich' && sw.data.dish.kcal > 1000, 'Spam sandwich: ' + ( sw && displayName( sw ) ) );
	// a rice bowl: egg and meat make a loco moco
	const rice = put( 'cooked_rice', 3 );
	run( 'dish_rice', put( 'cooked_egg' ), rice );
	const rb = find( 'rice_bowl' );
	run( 'dish_rice_add', put( 'cooked_boar' ), rb );
	ok( rice.qty === 2 && displayName( rb ) === 'Loco moco', 'rice + egg + meat: ' + displayName( rb ) );
	S.hunger = 0; verb( rb, 'Eat' ).run(); finish();
	ok( S.hunger > 15, `eating a portion of it (${S.hunger.toFixed( 1 )})` );
}

// ---- mixes -----------------------------------------------------------------------------------------------------------------
console.log( 'mixes' );
{
	clear();
	// cocktails
	const rum = put( 'rum' ), pog = put( 'pog_juice' );
	ok( run( 'mix_mai_tai', rum, pog ) && find( 'mai_tai' ) && rum.data.left === 3 && pog.data.left === 1, 'rum and POG: a Mai Tai (a shot and a portion)' );
	const cr = put( 'coconut_rum' ), pj = put( 'pineapple_juice' );
	ok( KB.state( combo( 'mix_lava_flow' ), cr, pj ).reason === 'Need a shaker' || /shaker/.test( KB.state( combo( 'mix_lava_flow' ), cr, pj ).reason ), 'lava flow: the shaker first' );
	put( 'cocktail_shaker' );
	ok( KB.state( combo( 'mix_lava_flow' ), cr, pj ).reason === 'Need ice', 'then ice' );
	const ice = put( 'ice_bag' );
	ok( run( 'mix_lava_flow', cr, pj ) && find( 'lava_flow' ) && ice.data.left === 3, 'with ice: a lava flow' );
	S.unhappy = 50; verb( find( 'lava_flow' ), 'Drink' ).run(); finish();
	ok( S.unhappy < 40 && S.drunk > 0, 'a cocktail cheers (and goes to your head)' );
	// coffee from the bean
	clear();
	const beans = put( 'kona_coffee_beans' ), grinder = put( 'coffee_grinder' );
	ok( run( 'grind_coffee', grinder, beans ) && find( 'coffee_grounds' ) && ! has( beans ), 'ground' );
	const mug = put( 'camp_mug', 1, { liquid: 'water' } ); mug.data.amount = 0.35;
	fire = false; ok( KB.state( combo( 'brew_coffee' ), find( 'coffee_grounds' ), mug ).reason === 'Need a fire', 'brewing needs a fire' ); fire = true;
	run( 'brew_coffee', find( 'coffee_grounds' ), mug );
	ok( mug.id === 'mug_coffee' && find( 'coffee_grounds' ).data.left === 7, 'a mug of coffee, a portion of grounds' );
	run( 'sweeten_coffee', put( 'sugar' ), mug );
	ok( mug.id === 'sweet_coffee', 'sugar in it' );
	S.caffeine = 0; verb( mug, 'Drink' ).run(); finish();
	ok( S.caffeine > 100 && mug.id === 'camp_mug', 'drunk: caffeine, and the mug back' );
	// poke from a whole ahi
	clear();
	put( 'kitchen_knife' );
	const ahi = put( 'raw_ahi' ), sh = put( 'shoyu' );
	ok( run( 'make_poke', sh, ahi ) && inv.findAll( s => s.id === 'poke' ).length === 3, 'an ahi makes three poke' );
	run( 'make_poke', sh, put( 'raw_tako' ) );
	ok( inv.findAll( s => s.id === 'poke' ).some( s => displayName( s ) === 'Tako poke' ), 'tako poke' );
	// salting and smoking
	const salt = put( 'alaea_salt' ), boar = put( 'raw_boar' );
	ok( run( 'salt_meat', salt, boar ) && boar.id === 'salt_meat' && salt.data.left === 8, 'salted meat (two pinches)' );
	ok( getItem( 'salt_meat' ).food.spoil > 1000, 'salted meat keeps' );
	const grate = put( 'grill_grate' ), fish = put( 'raw_fish' );
	fire = false; ok( KB.state( combo( 'smoke_food' ), grate, fish ).reason === 'Need a fire', 'smoking needs a fire' ); fire = true;
	ok( run( 'smoke_food', grate, fish ) && fish.id === 'smoked_fish', 'smoked fish' );
	// pickles: vinegar, a jar; cabbage and chili make kim chee, and the jar comes back when they're eaten
	const jar = put( 'canning_jar' ), cab = put( 'cabbage' );
	ok( KB.state( combo( 'pickle' ), cab, jar ).reason === 'Need vinegar', 'pickling needs vinegar' );
	put( 'rice_vinegar' );
	run( 'pickle', cab, jar );
	ok( jar.id === 'pickled_vegetables' && displayName( jar ) === 'Pickled cabbage', displayName( jar ) );
	run( 'pickle_add', put( 'chili_peppers' ), jar );
	ok( displayName( jar ) === 'Kim chee', 'cabbage and chili: ' + displayName( jar ) );
	for ( let i = 0; i < 3; i ++ ) { const j = find( 'pickled_vegetables' ); if ( j ) { verb( j, 'Eat' ).run(); finish(); } }
	ok( ! find( 'pickled_vegetables' ) && find( 'canning_jar' ), 'eaten: the jar back' );
	// li hing mango
	const m = put( 'mango' );
	run( 'li_hing_fruit', put( 'li_hing_powder' ), m );
	ok( m.id === 'li_hing_fruit' && displayName( m ) === 'Li hing mango' && m.data.dish.kcal > 150, 'li hing mango' );
	S.hunger = 0; verb( m, 'Eat' ).run(); finish();
	ok( S.hunger > 7, 'it feeds like the mango it was' );
	// shave ice
	const syr = put( 'shave_ice_syrup' ), ice2 = put( 'ice_bag' );
	ok( run( 'shave_ice', syr, ice2 ) && find( 'shave_ice' ) && ice2.data.left === 3, 'shave ice' );
	// haupia: an opened can of coconut milk, sugar, a pot, a fire
	const cm = put( 'coconut_milk' ), sug = put( 'sugar' );
	ok( KB.state( combo( 'make_haupia' ), sug, cm ).reason === 'Need a cooking pot', 'haupia needs a pot' );
	put( 'cooking_pot' );
	ok( KB.state( combo( 'make_haupia' ), sug, cm ).reason === 'Open it first', 'and the can open' );
	cm.data.open = true;
	ok( run( 'make_haupia', sug, cm ) && find( 'haupia' ) && ! has( cm ), 'haupia' );
	// mac salad and a plate lunch
	put( 'water_jug', 1, { liquid: 'water' } ).data.amount = 3;
	ok( run( 'make_mac_salad', put( 'mayo' ), put( 'macaroni' ) ) && inv.count( 'mac_salad' ) === 2, 'two mac salads from a box' );
	// the rice cooker: power or a fire
	clear();
	put( 'water_jug', 1, { liquid: 'water' } ).data.amount = 3;
	const rc = put( 'rice_cooker' ), bag = put( 'rice_bag' );
	fire = false; ok( KB.state( combo( 'rice_cooker' ), bag, rc ).reason === 'Needs power or a fire', 'no power, no fire' );
	game.placeables = { near: () => [ { kind: 'generator', data: { on: true } } ] };
	ok( KB.state( combo( 'rice_cooker' ), bag, rc ).ok, 'a running generator nearby powers it' );
	delete game.placeables; fire = true;
	ok( !! verb( rc, 'Cook rice' ), 'Cook rice on the cooker' );
	const r0 = inv.count( 'cooked_rice' );
	run( 'rice_cooker', bag, rc );
	ok( inv.count( 'cooked_rice' ) - r0 === 7 && ! has( bag ), 'seven bowls from a bag (a pot gives five)' );
	// rot into bait: not offered while fresh
	put( 'kitchen_knife' );
	const pork = put( 'raw_boar' );
	ok( KB.state( combo( 'rotten_bait' ), find( 'kitchen_knife' ), pork ).soft, 'fresh meat is not cut into bait' );
	pork.data.age = 9999;
	ok( run( 'rotten_bait', find( 'kitchen_knife' ), pork ) && inv.count( 'fishing_bait' ) >= 3, 'rotten meat: bait' );
	// recipes in the crafting panel
	for ( const id of [ 'spam_musubi', 'lomi_salmon', 'laulau_pork', 'laulau_fish', 'plate_lunch' ] ) ok( game.crafting.recipes.some( r => r.id === id ), `recipe ${id}` );
	clear();
	put( 'kitchen_knife' ); put( 'salted_salmon' ); put( 'tomato', 2 ); put( 'onion' );
	const r = game.crafting.recipes.find( x => x.id === 'lomi_salmon' );
	ok( game.crafting.check( r ).ok, 'lomi salmon can be made from what you carry' );
}

// ---- ice in a cooler ---------------------------------------------------------------------------------------------------
console.log( 'ice' );
{
	clear();
	const cooler = makeStack( 'cooler_bag', 1 ); cooler.data.items = [];
	const back = inv.equip.back; inv.equip.back = cooler;
	const fishA = makeStack( 'raw_fish', 1 ), ice = makeStack( 'ice_bag', 1 );
	cooler.data.items.push( fishA, ice );
	const fishB = put( 'raw_fish' ); // in a pocket, no ice
	U.lastHours = game.time.hours; game.time.hours += 4; U.tickT = 1; U.update( 0 );
	near( fishB.data.age, 4, 1e-6, 'a fish in a pocket ages 4 h in 4 h' );
	near( fishA.data.age, 4 * 0.5 * 0.25, 1e-6, 'in a cooler with ice: an eighth of that' );
	near( ice.data.cold, 1 - 4 * 0.5 / 8, 1e-6, 'the ice melts slower in the cooler' );
	game.time.hours += 20; U.tickT = 1; U.update( 0 );
	ok( ! cooler.data.items.includes( ice ) && toasts.includes( 'Bag of ice melted' ), 'melted away' );
	const pack = makeStack( 'freezer_pack', 1 );
	ok( COLD.coldLeft( pack ) === 0, 'a freezer pack found a week into the outage is warm' );
	COLD.freeze( pack ); ok( COLD.coldLeft( pack ) === 1 && ! pack.data.name, 'frozen again' );
	ok( COLD.chillItems( [ pack, makeStack( 'raw_fish', 1 ) ], 1, 0 ) === 0.3, 'a frozen pack slows food to 0.3' );
	inv.equip.back = back;
}

// ---- verbs: sea salt, snow, ʻopihi, Dig imu -------------------------------------------------------------------------------
console.log( 'verbs' );
{
	clear();
	const pot = put( 'cooking_pot', 1, { liquid: 'sea' } ); pot.data.amount = 1.5;
	verb( pot, 'Boil down to salt' ).run(); finish();
	ok( pot.data.amount === 0 && find( 'sea_salt' ), 'seawater boiled down to sea salt' );
	const pack = put( 'freezer_pack' );
	ok( ! verb( pack, 'Pack in snow' ), 'no snow at the beach' );
	game.player.pos.y = 700;
	verb( pack, 'Pack in snow' ).run(); finish();
	ok( COLD.coldLeft( pack ) === 1, 'packed in summit snow: frozen' );
	const syr = put( 'shave_ice_syrup' );
	verb( syr, 'Make snow cone' ).run(); finish();
	ok( find( 'shave_ice' ) && syr.data.left === 7, 'a snow cone off Mauna Kea' );
	game.player.pos.set( 0, 0.4, 0 );
	const knife = put( 'kitchen_knife' );
	ok( K.atRockyShore( game ) && !! verb( knife, 'Pick ʻopihi' ), 'a blade at a rocky shore picks ʻopihi' );
	verb( knife, 'Pick ʻopihi' ).run(); finish();
	ok( ! verb( knife, 'Pick ʻopihi' ), 'the rocks here are picked for the day' );
	game.world.isBeach = () => true;
	game.player.pos.set( 32, 0.4, 32 );
	ok( ! K.atRockyShore( game ), 'not on sand' );
	game.world.isBeach = () => false;
	const shovel = put( 'shovel' );
	ok( ! verb( shovel, 'Dig imu' ), 'Dig imu needs the placeables runtime' );
	let began = null;
	game.placeables = { beginPlace: ( s, o ) => { began = o; return true; } };
	verb( shovel, 'Dig imu' ).run();
	ok( began?.kind === 'imu' && began.keep, 'Dig imu: the placer, the shovel kept' );
	delete game.placeables;
}

// ---- the imu ---------------------------------------------------------------------------------------------------------------
console.log( 'imu' );
{
	clear();
	const K2 = getPlaceable( 'imu' );
	ok( !! K2, 'imu kind registered' );
	const refreshed = [];
	game.placeables = {
		timed: ( l, t, s, fn ) => fn(), refresh: ( p ) => refreshed.push( p.data.stage ), light() {}, loop() {}, stopLoop() {}, remove: ( p ) => { p.removed = true; },
	};
	const p = { id: 'imu1', kind: 'imu', pos: { x: 0, y: 0, z: 0 }, data: null };
	K2.onPlace( p );
	ok( p.data.stage === 'pit' && K2.label( p ) === 'Imu', 'a dug pit' );
	const act = ( label ) => K2.actions( p, game ).find( a => a.label.startsWith( label ) );
	act( 'Build fire' ).run();
	ok( p.data.stage === 'pit' && toasts.includes( 'Need 3 firewood' ), 'firewood first' );
	put( 'firewood', 3 ); put( 'stone', 3 ); const lighter = put( 'lighter' );
	act( 'Build fire' ).run();
	ok( p.data.stage === 'fire' && ! inv.count( 'firewood' ) && ! inv.count( 'stone' ) && lighter.data.uses === 119, 'a fire on the stones' );
	game.time.hours += 0.5; K2.update( p, 1, game );
	ok( p.data.stage === 'fire', 'still heating' );
	game.time.hours += 0.6; K2.update( p, 1, game );
	ok( p.data.stage === 'hot', 'the stones are hot' );
	put( 'raw_boar' ); put( 'taro', 2 ); put( 'laulau_raw' );
	act( 'Lay in food' ).run();
	ok( p.data.stage === 'hot' && toasts.includes( 'Need ti leaves to wrap it' ), 'wrapped in ti leaves first' );
	put( 'ti_leaves', 3 );
	act( 'Lay in food' ).run();
	ok( p.data.food.length === 3 && ! inv.count( 'ti_leaves' ), `three wrapped and laid in (${p.data.food.join( ', ' )})` );
	ok( ! act( 'Cover' ) || ( act( 'Cover' ).run(), toasts.includes( 'Need a shovel' ) ), 'covering needs a shovel' );
	put( 'shovel' );
	act( 'Cover' ).run();
	ok( p.data.stage === 'cooking' && /Cooking · 4 h left/.test( K2.sub( p, game ) ), 'buried: ' + K2.sub( p, game ) );
	game.time.hours += 4.1; K2.update( p, 1, game );
	ok( p.data.stage === 'done', 'ready' );
	game.survival.unhappy = 30;
	act( 'Dig up' ).run();
	const got = [ 'kalua_pig', 'cooked_taro', 'laulau' ].filter( id => inv.count( id ) > 0 );
	ok( p.data.stage === 'pit' && inv.count( 'kalua_pig' ) >= 1 && inv.count( 'stone' ) === 3 && got.length >= 2, 'the feast comes up, the stones back: ' + got.join( ', ' ) );
	ok( game.survival.unhappy < 30, 'a feast cheers' );
	ok( imuOut( 'raw_boar' ) === 'kalua_pig' && imuOut( 'breadfruit' ) === 'cooked_breadfruit' && imuOut( 'spam' ) === null, 'what the imu makes of things' );
	// hot stones left uncovered go cold
	p.data.stage = 'hot'; p.data.t = game.time.hours; p.data.food = [];
	game.time.hours += IMU.COOL_H + 0.1; K2.update( p, 1, game );
	ok( p.data.stage === 'pit', 'stones left too long go cold' );
	delete game.placeables;
}

// ---- the evolved logic on its own ---------------------------------------------------------------------------------------------
console.log( 'evolved' );
{
	const d = EV.startDish( 'pot', null, { water: 40 } );
	EV.addTo( d, makeStack( 'raw_chicken', 1 ), getItem( 'raw_chicken' ) );
	EV.addTo( d, makeStack( 'saimin', 1 ), getItem( 'saimin' ) );
	EV.addTo( d, makeStack( 'ginger', 1 ), getItem( 'ginger' ) );
	ok( EV.recognise( d ) === 'Saimin', 'noodles from a saimin pack make saimin: ' + EV.recognise( d ) );
	const d2 = EV.startDish( 'pot', null );
	EV.addTo( d2, makeStack( 'raw_chicken', 1 ), getItem( 'raw_chicken' ) );
	EV.addTo( d2, makeStack( 'canned_spaghetti', 1 ), getItem( 'canned_spaghetti' ) );
	EV.addTo( d2, makeStack( 'ginger', 1 ), getItem( 'ginger' ) );
	ok( EV.recognise( d2 ) === 'Chicken long rice', EV.recognise( d2 ) );
	const sick = { hunger: 0, thirst: 0, sick: 0, mood() {}, msg() {} };
	ok( EV.eatDish( { ...d2, sick: 0, raw: 0.9, cooked: false }, 1, sick, 0, () => 0.1 ) === 'sick' && sick.sick > 0, 'raw chicken in an uncooked pot makes you ill' );
	const well = { hunger: 0, thirst: 0, sick: 0, mood() {}, msg() {} };
	ok( EV.eatDish( EV.cookDish( { ...d2, fun: { ...d2.fun } }, 0 ), 1, well, 0, () => 0.1 ) === null, 'cooked, it does not' );
	const rot = makeStack( 'onion', 1 ); rot.data.age = 9999;
	ok( EV.contribution( rot, getItem( 'onion' ) ).sick >= 0.5, 'a rotten ingredient spoils the dish' );
	ok( K.KITCHEN.pickleName( [ 'onion', 'chili_peppers' ] ) === 'Pickled onion and chili', K.KITCHEN.pickleName( [ 'onion', 'chili_peppers' ] ) );
}


// ---- the review's fixes and additions ------------------------------------------------------------------------------------
console.log( 'review' );
{
	const { freshness } = await import( '../src/game/items/ItemDB.js' );
	// an uncooked pot of safe things is not "raw" food itself (its data.dish says what is): Eat, not Eat raw
	clear();
	ok( ! getItem( 'soup_pot_raw' ).food.raw && ! getItem( 'stirfry_raw' ).food.raw, 'uncooked dishes are not raw items' );
	{
		const pot = put( 'cooking_pot', 1, { liquid: 'water' } ); pot.data.amount = 1;
		const beans = put( 'canned_beans' ); beans.data.open = true;
		run( 'dish_pot', beans, pot );
		ok( pot.id === 'soup_pot_raw' && !! verb( pot, 'Eat' ) && ! verb( pot, 'Eat raw' ), 'an uncooked soup of beans: Eat' );
		ok( ( pot.data.dish.raw || 0 ) === 0 && ! pot.data.dish.dirty, 'nothing raw in it' );
		// eaten uncooked: no sickness from the def (Survival.eat), none from the dish
		let sick = 0;
		const rnd = Math.random; Math.random = () => 0.2;
		S.sick = 0; verb( pot, 'Eat' ).run(); finish(); sick = S.sick;
		Math.random = rnd;
		ok( sick === 0, 'an uncooked soup of safe things does not make you ill' );
	}
	// li hing: not on rotten fruit, and the fruit's age carries over
	clear();
	{
		const lh = put( 'li_hing_powder' ), m = put( 'mango' ), rot = put( 'mango' );
		const sp = getItem( 'mango' ).food.spoil;
		m.data.age = sp * 0.5; rot.data.age = sp * 2;
		ok( KB.state( combo( 'li_hing_fruit' ), lh, rot ).reason === 'Too far gone', 'no li hing on a rotten mango' );
		run( 'li_hing_fruit', lh, m );
		near( freshness( m ), 0.5, 0.01, 'li hing mango keeps the mango\'s freshness' );
	}
	// salting and smoking keep what was left of the meat's life (a day-old fish does not become new)
	{
		const salt = put( 'alaea_salt' ), boar = put( 'raw_boar' );
		boar.data.age = getItem( 'raw_boar' ).food.spoil * 0.75;
		run( 'salt_meat', salt, boar );
		near( freshness( boar ), 0.25, 0.01, 'salted meat from three-quarters-gone pork: a quarter of its keep left' );
		ok( freshness( boar ) * getItem( 'salt_meat' ).food.spoil > getItem( 'raw_boar' ).food.spoil * 0.25, 'still keeps far longer than it would have raw' );
		const grate = put( 'grill_grate' ), fish = put( 'raw_fish' );
		fish.data.age = getItem( 'raw_fish' ).food.spoil * 0.5;
		run( 'smoke_food', grate, fish );
		near( freshness( fish ), 0.5, 0.01, 'smoked fish keeps the fish\'s freshness' );
		const jar = put( 'canning_jar' ), cab = put( 'cabbage' ); put( 'rice_vinegar' );
		cab.data.age = getItem( 'cabbage' ).food.spoil * 3;
		ok( KB.state( combo( 'pickle' ), cab, jar ).reason === 'Too far gone', 'no pickles from rot' );
	}
	// the rice cooker: a part-used bag gives less
	clear();
	{
		fire = true;
		put( 'water_jug', 1, { liquid: 'water' } ).data.amount = 3;
		const rc = put( 'rice_cooker' ), bag = put( 'rice_bag' );
		bag.data.left = 5;
		run( 'rice_cooker', bag, rc );
		ok( inv.count( 'cooked_rice' ) === 4 && ! has( bag ), `half a bag: half the bowls (${inv.count( 'cooked_rice' )})` );
	}
	// a plate lunch no longer loses half the food that went into it
	{
		const r = game.crafting.recipes.find( x => x.id === 'plate_lunch' );
		const kin = r.in.reduce( ( a, [ id, n ] ) => a + getItem( id ).food.kcal * n, 0 ), kout = getItem( r.out[ 0 ] ).food.kcal * r.out[ 1 ];
		ok( kout >= kin * 0.85, `plate lunch: ${kout} kcal out of ${kin}` );
	}
	// the imu: rotten meat and rice bags are not laid in; cold stones stay in the pit; food can come back out
	clear();
	{
		const K2 = getPlaceable( 'imu' );
		game.placeables = { timed: ( l, t, sd, fn ) => fn(), refresh() {}, light() {}, loop() {}, stopLoop() {}, remove: ( p ) => { p.removed = true; } };
		const p = { id: 'imu2', kind: 'imu', pos: { x: 0, y: 0, z: 0 }, data: null };
		K2.onPlace( p );
		const act = ( label ) => K2.actions( p, game ).find( a => a.label.startsWith( label ) );
		put( 'firewood', 3 ); put( 'stone', 3 ); put( 'lighter' );
		act( 'Build fire' ).run();
		game.time.hours += 1.1; K2.update( p, 1, game );
		ok( p.data.stage === 'hot', 'hot stones' );
		const rot = put( 'raw_boar' ); rot.data.age = 9999;
		put( 'rice_bag' ); put( 'eggs', 2 );
		put( 'ti_leaves', 4 );
		ok( ! act( 'Lay in food' ) || ( act( 'Lay in food' ).run(), p.data.food.length === 0 ), 'rotten pork, a rice bag and eggs are not laid in: ' + p.data.food.join( ', ' ) );
		const fresh = put( 'raw_boar' );
		act( 'Lay in food' ).run();
		ok( p.data.food.length === 1 && ! has( fresh ) && has( rot ) && inv.count( 'rice_bag' ) === 1, 'the fresh pork is laid in' );
		// left uncovered, the stones go cold; the food comes back out, raw and older
		game.time.hours += IMU.COOL_H + 0.1; K2.update( p, 1, game );
		ok( p.data.stage === 'pit' && p.data.food.length === 1 && ! act( 'Build fire' ), 'cold stones with the food still on them: no new fire on top' );
		act( 'Take out food' ).run();
		const back = inv.findAll( s => s.id === 'raw_boar' && s !== rot )[ 0 ];
		ok( back && back.data.age > 3 && ! p.data.food.length, `the pork back out, ${back?.data.age.toFixed( 1 )} h older` );
		// the stones are still in the pit: a new fire needs only firewood
		put( 'firewood', 3 );
		const st0 = inv.count( 'stone' );
		act( 'Build fire' ).run();
		ok( p.data.stage === 'fire' && inv.count( 'stone' ) === st0, 'relit on the stones already in the pit' );
		// filled in, the stones come back
		p.data.stage = 'pit'; put( 'shovel' );
		act( 'Fill in' ).run();
		ok( p.removed && inv.count( 'stone' ) === st0 + 3, 'filled in: the stones back' );
		delete game.placeables;
	}
	// ice dropped on the ground melts; loot lying where it was found is left alone; a freezer pack found warm says so
	clear();
	{
		const iceDrop = makeStack( 'ice_bag', 1 ), iceLoot = makeStack( 'ice_bag', 1 );
		const removed = [];
		const items = [];
		game.items3d = { ...game.items3d, items, remove: ( it ) => { removed.push( it ); items.splice( items.indexOf( it ), 1 ); return true; } };
		COLD.meltGround( game ); // the clock it melts by, from now
		items.push( { stack: iceDrop, persistent: true }, { stack: iceLoot, persistent: false } );
		COLD.meltGround( game, 3 );
		ok( iceDrop.data.cold === undefined, 'once a game time: nothing more at the same hour' );
		game.time.hours += 4; COLD.meltGround( game );
		near( iceDrop.data.cold, 0.5, 1e-6, 'a dropped bag of ice melts in the open' );
		ok( iceLoot.data.cold === undefined, 'relief ice lying at its camp is left to its spot' );
		game.time.hours += 5; COLD.meltGround( game );
		ok( removed.length === 1 && removed[ 0 ].stack === iceDrop, 'melted away' );
		// the first call after a load melts by the hours its caller says passed (a sleep straight after loading)
		const g2 = { time: { hours: 50 }, items3d: { items: [ { stack: makeStack( 'ice_bag', 1 ), persistent: true } ], remove() {} } };
		COLD.meltGround( g2, 2 );
		near( g2.items3d.items[ 0 ].stack.data.cold, 0.75, 1e-6, 'first call: by the caller\'s hours' );
		game.items3d = { ...game.items3d, items: [] };
		const pack = put( 'freezer_pack' );
		U.lastHours = game.time.hours; game.time.hours += 0.5; U.tickT = 1; U.update( 0 );
		ok( displayName( pack ) === 'Freezer pack (warm)', 'a pack found warm: ' + displayName( pack ) );
	}
	// a dish survives a save and load (stack.data is plain JSON) and still feeds and names itself
	clear();
	{
		const wok = put( 'wok' ); put( 'cooking_oil' );
		run( 'dish_pan', put( 'raw_chicken' ), wok );
		run( 'dish_pan_add', put( 'teriyaki_sauce' ), wok );
		ok( displayName( wok ) === 'Uncooked teriyaki chicken', displayName( wok ) );
		verb( wok, 'Cook' ).run(); finish();
		const copy = JSON.parse( JSON.stringify( wok ) );
		ok( displayName( copy ) === 'Teriyaki chicken' && copy.data.dish.cooked && copy.data.dish.vessel.id === 'wok', 'saved and loaded: ' + displayName( copy ) );
		// a full inventory: the wok comes back at your feet with the last portion
		inv.remove( wok ); inv.add( copy );
		const filler = [];
		for ( let i = 0; i < 80; i ++ ) { const b = makeStack( 'firewood', 4 ); if ( inv.add( b, { autoEquip: false } ) > 0 ) break; filler.push( b ); }
		dropped.length = 0;
		for ( let i = 0; i < 3; i ++ ) { const st = inv.findUid( copy.uid ); if ( st ) { verb( st, 'Eat' ).run(); finish(); } }
		ok( ! inv.findUid( copy.uid ) && dropped.some( d => d.id === 'wok' ), 'no room: the wok is dropped at your feet' );
	}
	// the newer pantry: ʻinamona from kukui nuts, malasadas, lilikoʻi butter, the musubi mold, named dishes
	clear();
	{
		const nuts = put( 'kukui_nuts', 4 ), salt = put( 'sea_salt' );
		ok( KB.state( combo( 'roast_inamona' ), nuts, salt ).reason === 'Need a pan', 'ʻinamona: roasted in a pan' );
		const wok = put( 'wok' );
		fire = false; ok( KB.state( combo( 'roast_inamona' ), nuts, salt ).reason === 'Need a fire', 'at a fire' ); fire = true;
		ok( run( 'roast_inamona', nuts, salt ) && find( 'inamona' ) && nuts.qty === 1 && salt.data.left === 9 && wok.id === 'wok', 'three nuts and a pinch of salt: ʻinamona' );
		const bowl = put( 'bowl' );
		run( 'dish_bowl', put( 'raw_ahi' ), bowl );
		run( 'dish_bowl_add', find( 'inamona' ), find( 'salad_bowl' ) );
		ok( displayName( find( 'salad_bowl' ) ) === 'Hawaiian poke', 'ahi and ʻinamona: ' + displayName( find( 'salad_bowl' ) ) );
		// malasadas: flour, sugar, an egg and oil in a pan at a fire
		const flour = put( 'flour' );
		ok( KB.state( combo( 'fry_malasadas' ), flour, wok ).reason === 'Need cooking oil', 'malasadas need oil' );
		put( 'cooking_oil' ); put( 'sugar' );
		ok( KB.state( combo( 'fry_malasadas' ), flour, wok ).reason === 'Need an egg', 'and an egg' );
		put( 'eggs', 2 );
		ok( run( 'fry_malasadas', flour, wok ) && inv.count( 'malasada' ) === 3 && inv.count( 'eggs' ) === 1 && flour.data.left === 7, 'three malasadas' );
		// lilikoʻi butter
		const lil = put( 'lilikoi', 5 ), sug = find( 'sugar' );
		put( 'cooking_pot' );
		ok( run( 'make_lilikoi_butter', lil, sug ) && find( 'lilikoi_butter' ) && lil.qty === 1 && ! inv.count( 'eggs' ), 'lilikoʻi butter' );
		const loaf = put( 'bread_loaf' );
		run( 'dish_bread', find( 'lilikoi_butter' ), loaf );
		ok( displayName( find( 'sandwich' ) ) === 'Lilikoʻi butter sandwich', displayName( find( 'sandwich' ) ) );
		// the mold: four musubi from a can instead of three
		const r = game.crafting.recipes.find( x => x.id === 'spam_musubi_mold' );
		put( 'kitchen_knife' ); put( 'spam' ); put( 'cooked_rice' ); put( 'nori' );
		ok( ! game.crafting.check( r ).ok && /musubi mold/.test( game.crafting.check( r ).reason ), 'the mold recipe needs the mold: ' + game.crafting.check( r ).reason );
		put( 'musubi_mold' );
		ok( game.crafting.check( r ).ok && r.out[ 1 ] === 4, 'with it: four' );
	}
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
