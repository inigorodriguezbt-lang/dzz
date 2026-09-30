// Item catalogue validation (Node, no DOM): node test/items.mjs
//   every def: unique id, required fields for its category, sane numbers, a model type with a builder
//   cross references: cooked / opensTo / container / unpack / recipes / loot tables all point at real ids
//   the shared ids other modules rely on (ARCHITECTURE.md) exist; the brief's minimum counts are met
//   every loot table rolls thousands of times without producing a broken stack
const warnings = [];
const warn0 = console.warn;
console.warn = ( ...a ) => { warnings.push( a.join( ' ' ) ); };
await import( '../src/game/items/defs/index.js' );
console.warn = warn0;
const { ITEMS, getItem, makeStack, stackWeight, stackVolume, freshness } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, rollLoot, tableIds, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const num = ( v ) => typeof v === 'number' && Number.isFinite( v );

// ---- model builders (the registry imports three + the material patch; the builders only need a DOM when run) ----
let hasModelBuilder = null;
try {
	const M = await import( '../src/render/ItemModels.js' );
	try { await import( '../src/weapons/GunModels.js' ); } catch ( e ) { /* weapons module may not be importable in Node */ }
	hasModelBuilder = M.hasModelBuilder;
} catch ( e ) { console.log( '  (model registry not importable in Node: ' + e.message + ')' ); }
const WEAPON_MODELS = new Set( [ 'gun', 'mag', 'ammo_box', 'attachment', 'melee', 'throwable' ] );

// ---- per item -----------------------------------------------------------------------------------------------
console.log( 'definitions' );
ok( ! warnings.some( w => w.includes( 'duplicate item' ) ), 'no duplicate ids: ' + warnings.filter( w => w.includes( 'duplicate' ) ).join( '; ' ) );
const CATS = [ 'firearm', 'ammo', 'magazine', 'attachment', 'melee', 'clothing', 'backpack', 'food', 'drink', 'medical', 'tool', 'throwable', 'material', 'fuel', 'vehicle', 'misc', 'key', 'book' ];
const RARITY = [ 'common', 'uncommon', 'rare', 'epic', 'legendary' ];
const SLOTS = [ 'head', 'face', 'eyes', 'torso', 'vest', 'hands', 'legs', 'feet', 'belt', 'back' ];
const has = ( id ) => ITEMS.has( id );
for ( const d of ITEMS.values() ) {
	const id = d.id;
	ok( /^[a-z0-9_]+$/.test( id ), `${id}: snake_case id` );
	ok( typeof d.name === 'string' && d.name.length > 1, `${id}: name` );
	ok( CATS.includes( d.cat ), `${id}: category ${d.cat}` );
	ok( num( d.weight ) && d.weight > 0 && d.weight < 40, `${id}: weight ${d.weight}` );
	ok( num( d.size ) && d.size > 0 && d.size <= 30, `${id}: size ${d.size}` );
	ok( Number.isInteger( d.stack ) && d.stack >= 1, `${id}: stack ${d.stack}` );
	ok( RARITY.includes( d.rarity ), `${id}: rarity ${d.rarity}` );
	ok( Array.isArray( d.tags ), `${id}: tags` );
	ok( d.model && typeof d.model.type === 'string', `${id}: model spec` );
	if ( hasModelBuilder && d.model?.type && ! WEAPON_MODELS.has( d.model.type ) ) ok( hasModelBuilder( d.model.type ), `${id}: model builder '${d.model.type}' exists` );
	if ( [ 'firearm', 'ammo', 'magazine', 'attachment', 'melee' ].includes( d.cat ) ) ok( d[ d.cat ], `${id}: ${d.cat} block` );
	switch ( d.cat ) {
		case 'clothing': case 'backpack': {
			const c = d[ d.cat ];
			ok( c && SLOTS.includes( c.slot ), `${id}: slot ${c?.slot}` );
			ok( num( c?.color ), `${id}: colour` );
			ok( num( c?.capacity ) && c.capacity >= 0, `${id}: capacity` );
			ok( num( c?.insulation ) && c.insulation >= 0 && c.insulation <= 1, `${id}: insulation` );
			ok( c?.armor && num( c.armor.bite ) && num( c.armor.bullet ), `${id}: armor` );
			if ( d.cat === 'backpack' ) ok( c.capacity > 0, `${id}: backpack capacity` );
			break;
		}
		case 'food': {
			const f = d.food;
			ok( f && num( f.kcal ) && num( f.water ) && num( f.spoil ) && f.spoil >= 0, `${id}: food numbers` );
			ok( num( f?.portions ) && f.portions >= 1, `${id}: portions` );
			if ( f?.cooked ) ok( has( f.cooked ) && ITEMS.get( f.cooked ).cat === 'food', `${id}: cooked → ${f.cooked}` );
			if ( d.opensTo ) ok( has( d.opensTo ), `${id}: opensTo → ${d.opensTo}` );
			ok( f.kcal > 0 || d.opensTo, `${id}: has calories or opens into something` );
			break;
		}
		case 'drink': {
			const k = d.drink;
			ok( k && num( k.water ) && num( k.kcal ), `${id}: drink numbers` );
			if ( k?.container ) ok( has( k.container ), `${id}: container → ${k.container}` );
			break;
		}
		case 'medical': {
			const m = d.medical;
			ok( m && num( m.use ) && m.use > 0, `${id}: use time` );
			const effect = m && ( m.heal || m.blood || m.bleed || m.infection || m.pain || m.splint || m.sick || m.energy || m.stamina || m.purify || d.unpack );
			ok( !! effect, `${id}: does something` );
			for ( const [ u ] of d.unpack || [] ) ok( has( u ), `${id}: unpacks ${u}` );
			break;
		}
		case 'tool': {
			const t = d.tool;
			ok( t && typeof t.kind === 'string', `${id}: tool kind` );
			if ( t?.battery ) ok( num( t.battery ) && t.battery > 0, `${id}: battery` );
			if ( t?.liquid ) ok( num( t.liquid ) && t.liquid > 0 && d.stack === 1, `${id}: liquid capacity, unstackable` );
			if ( t?.light ) ok( num( t.light.range ) && num( t.light.color ), `${id}: light spec` );
			break;
		}
		case 'fuel': ok( d.fuel && num( d.fuel.litres ) && d.fuel.kind, `${id}: fuel` ); break;
		case 'throwable': ok( d.throwable && typeof d.throwable.kind === 'string', `${id}: throwable kind` ); break;
		case 'vehicle': ok( d.vehicle && typeof d.vehicle.part === 'string', `${id}: vehicle part` ); break;
		case 'book': ok( d.book && ( d.book.skill === undefined || typeof d.book.skill === 'string' ), `${id}: book block` ); break;
	}
	// makeStack + weight / volume
	const s = makeStack( id, d.stack, { loot: true } );
	ok( s && s.qty === d.stack, `${id}: makeStack` );
	ok( num( stackWeight( s ) ) && num( stackVolume( s ) ), `${id}: stack weight / volume` );
	if ( d.cat === 'food' ) ok( freshness( s ) >= 0 && freshness( s ) <= 1, `${id}: freshness` );
}

// ---- counts the brief asks for -----------------------------------------------------------------------------
console.log( 'counts' );
const count = ( cat ) => [ ...ITEMS.values() ].filter( d => d.cat === cat ).length;
const counts = { clothing: count( 'clothing' ), backpack: count( 'backpack' ), food: count( 'food' ), drink: count( 'drink' ), medical: count( 'medical' ), tool: count( 'tool' ), material: count( 'material' ) };
console.log( '  ', JSON.stringify( counts ), 'total', ITEMS.size );
ok( counts.clothing >= 50, 'clothing ≥ 50' );
ok( counts.backpack >= 8, 'backpacks ≥ 8' );
ok( counts.food >= 45, 'food ≥ 45' );
ok( counts.drink >= 20, 'drinks ≥ 20' );
ok( counts.medical >= 20, 'medical ≥ 20' );
ok( counts.tool >= 30, 'tools ≥ 30' );

// ---- shared ids -------------------------------------------------------------------------------------------
console.log( 'shared ids' );
const SHARED = [
	'aloha_shirt', 'tshirt', 'tank_top', 'board_shorts', 'jeans', 'cargo_shorts', 'slippers', 'bandage_rag', 'road_flare', 'chemlight', 'water_bottle',
	'crackers', 'granola_bar', 'macadamia_nuts', 'backpack_hiking',
	'raw_boar', 'raw_goat', 'raw_venison', 'raw_chicken', 'raw_fish', 'raw_shark', 'cooked_boar', 'cooked_goat', 'cooked_venison', 'cooked_chicken', 'cooked_fish', 'cooked_shark',
	'animal_hide', 'feathers', 'bone',
	'jerrycan', 'gas_can', 'car_battery', 'spark_plug', 'tire', 'repair_kit', 'car_keys',
	'flashlight', 'headlamp', 'lighter', 'matches', 'can_opener', 'map_hawaii', 'compass', 'binoculars', 'fishing_rod', 'lockpick', 'toolbox', 'cooking_pot', 'canteen',
	'coconut', 'banana', // shaken / picked by the vegetation module
];
for ( const id of SHARED ) ok( has( id ), `shared id ${id}` );
ok( ITEMS.get( 'jerrycan' )?.fuel?.litres === 20 && ITEMS.get( 'gas_can' )?.fuel?.litres === 5, 'jerrycan 20 L, gas can 5 L' );
ok( ITEMS.get( 'water_bottle' )?.tool?.liquid > 0, 'water_bottle is a liquid container (spawn kit fills it)' );
ok( ITEMS.get( 'banana' )?.stack >= 5, 'bananas stack (a picked hand is 3-5)' );
ok( ITEMS.get( 'canteen' )?.tool?.liquid > 0 && ITEMS.get( 'cooking_pot' )?.tool?.kind === 'pot', 'canteen / pot' );

// ---- recipes ----------------------------------------------------------------------------------------------
console.log( 'recipes' );
const recipes = allRecipes();
ok( recipes.length >= 20, `recipes (${recipes.length})` );
const rids = new Set();
const toolKinds = new Set();
for ( const d of ITEMS.values() ) { if ( d.tool?.kind ) toolKinds.add( d.tool.kind ); for ( const t of d.melee?.tools || [] ) toolKinds.add( t ); }
for ( const r of recipes ) {
	ok( ! rids.has( r.id ), `recipe id unique ${r.id}` ); rids.add( r.id );
	ok( Array.isArray( r.out ) && has( r.out[ 0 ] ), `${r.id}: output ${r.out?.[ 0 ]}` );
	for ( const [ id, q ] of r.in ) ok( has( id ) && q > 0, `${r.id}: input ${id}` );
	for ( const t of r.tools ) ok( toolKinds.has( t ), `${r.id}: tool kind '${t}' exists on some item` );
	ok( num( r.time ) && r.time > 0, `${r.id}: time` );
	if ( r.station ) ok( r.station === 'fire', `${r.id}: station` );
}
ok( [ 'rag_bandage', 'splint', 'spear', 'torch', 'campfire_kit', 'fishing_rod', 'arrows', 'molotov', 'boil_water', 'lockpick', 'repair_kit' ].every( id => rids.has( id ) ), 'core recipes present' );
ok( recipes.some( r => r.id === 'cook_raw_boar' ) && recipes.some( r => r.id === 'cook_raw_fish' ), 'cooking recipes for raw meat' );

// ---- loot tables --------------------------------------------------------------------------------------------
console.log( 'loot' );
const TABLES = [ 'house_kitchen', 'house_living', 'house_bedroom', 'house_bathroom', 'house_garage', 'fridge', 'grocery', 'convenience', 'pharmacy', 'medicine_cabinet',
	'hospital', 'clinic', 'police', 'police_locker', 'gunstore', 'gun_safe', 'military', 'military_armory', 'military_locker', 'hardware', 'toolbox', 'clothing_store', 'wardrobe',
	'sports', 'surf', 'restaurant', 'restaurant_kitchen', 'bar', 'fastfood', 'office', 'desk', 'school', 'fire_station', 'warehouse', 'garage_shop', 'hotel_room', 'gas_station',
	'church', 'bank', 'post', 'pawn', 'market', 'hangar', 'farm', 'beach', 'street', 'car_trunk', 'car_glovebox', 'zombie_civilian', 'zombie_police', 'zombie_military',
	'zombie_medic', 'zombie_tourist', 'trash', 'observatory' ];
for ( const t of TABLES ) ok( LOOT_TABLES[ t ], `table ${t}` );
let seed = 12345;
const rnd = () => { seed = ( seed * 1664525 + 1013904223 ) >>> 0; return seed / 4294967296; };
const seen = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	for ( const id of tableIds( t ) ) ok( has( id ), `${name}: references ${id}` );
	let produced = 0, bad = 0;
	for ( let i = 0; i < 400; i ++ ) {
		for ( const s of rollLoot( name, rnd ) ) {
			produced ++;
			seen.add( s.id );
			const d = ITEMS.get( s.id );
			if ( ! d || ! ( s.qty >= 1 && s.qty <= d.stack ) || ! ( s.cond > 0 && s.cond <= 1 ) || ! s.uid ) bad ++;
			if ( d?.cat === 'firearm' && s.data.mag && ! ITEMS.has( s.data.mag.id ) ) bad ++;
		}
	}
	ok( produced > 0 && bad === 0, `${name}: rolls valid stacks (${produced} produced, ${bad} bad)` );
}
const r1 = rollLoot( 'house_kitchen', () => 0.5, 3 );
ok( r1.length >= 1 && r1.length <= 3, 'explicit roll count' );
ok( rollLoot( 'no_such_table' ).length === 0, 'unknown table → nothing' );
// every id any table can produce (tag entries resolved), not just what the random rolls happened to hit
for ( const t of Object.values( LOOT_TABLES ) ) for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) seen.add( id );
const lootable = [ ...ITEMS.values() ].filter( d => ! d.tags.includes( 'crafted' ) && ! [ 'cooked' ].some( t => d.tags.includes( t ) ) );
const never = lootable.filter( d => ! seen.has( d.id ) ).map( d => d.id );
console.log( `   ${seen.size} of ${ITEMS.size} ids appear in loot; never looted (not crafted/cooked): ${never.length ? never.join( ' ' ) : 'none'}` );

// ---- item use / crafting / fires with a stub game (no DOM, no renderer) ---------------------------------------
console.log( 'item use' );
{
	const THREE = await import( 'three' );
	const { PlayerInventory } = await import( '../src/game/Inventory.js' );
	const { Survival } = await import( '../src/game/Survival.js' );
	const { Actions } = await import( '../src/game/Actions.js' );
	const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
	const { Crafting } = await import( '../src/game/Crafting.js' );
	const { LightPool } = await import( '../src/game/items/LightPool.js' );
	const { Events } = await import( '../src/core/Events.js' );
	const toasts = [];
	const game = {
		mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
		scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {},
		events: new Events(), audio: { play() {}, loop() { return null; }, buffers: new Map() },
		interact: { addProvider() { return () => {}; } }, settings: { get: () => true }, input: { pressed: () => false },
		world: { isIndoors: () => false, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } }, weather: { rain: 0, cover: 0.3 },
		player: { pos: new THREE.Vector3(), yaw: 0, stanceH: 1.6, shake: 0, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
		toast: ( t ) => toasts.push( t ), dropStack: () => {}, inputActive: true,
	};
	game.survival = new Survival( game );
	game.actions = new Actions( game );
	const lights = new LightPool( game );
	game.itemUse = new ItemUse( game, lights );
	game.crafting = new Crafting( game, lights );
	const U = game.itemUse, S = game.survival, inv = game.player.inventory;
	inv.equip.back = makeStack( 'backpack_military', 1 ); // room for everything
	inv.equip.vest = makeStack( 'chest_rig', 1 ); inv.equip.legs = makeStack( 'cargo_pants', 1 );
	const finish = () => game.actions.update( 999 );
	const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return inv.find( ( x ) => x.id === id ); };
	const act = ( st, re ) => U.actions( st ).find( a => re.test( a.label ) );

	// multi-portion food
	const spam = put( 'spam' );
	S.hunger = 20;
	ok( /^Eat \(3\/3\)/.test( U.actions( spam )[ 0 ]?.label ), 'spam: first action eats a portion: ' + U.actions( spam )[ 0 ]?.label );
	{
		// the verb and its state come separately too (the label keeps the bracket form the inventory screen parses)
		const a = U.actions( spam )[ 0 ];
		ok( a.verb === 'Eat' && a.note === '3/3' && a.label === 'Eat (3/3)', `spam: verb ${a.verb}, note ${a.note}` );
		const rot = makeStack( 'poke', 1 ); rot.data.age = 999;
		const b = U.actions( rot )[ 0 ];
		ok( b.verb === 'Eat' && b.note === 'Rotten' && b.label === 'Eat (rotten)', `rotten poke: verb ${b.verb}, note ${b.note}, label ${b.label}` );
		const pog = makeStack( 'pog_juice', 1 );
		const c = U.actions( pog ).find( x => x.verb === 'Drink' );
		ok( c && ( getItem( 'pog_juice' ).drink.portions > 1 ? /^\d+\/\d+$/.test( c.note ) : c.note === null ), `drink: verb Drink, note ${c?.note}` );
		ok( U.actions( makeStack( 'canned_beans', 1 ) ).every( x => typeof x.verb === 'string' && ! /[()]/.test( x.verb ) && ( x.note === null || typeof x.note === 'string' ) ), 'every action has a plain verb and a note or null' );
	}
	U.use( spam ); finish();
	ok( Math.abs( S.hunger - ( 20 + 1020 / 20 / 3 ) ) < 0.01 && spam.data.left === 2, `spam: one portion eaten (hunger ${S.hunger.toFixed( 1 )}, left ${spam.data.left})` );
	U.use( spam ); finish(); U.use( spam ); finish();
	ok( ! inv.count( 'spam' ), 'spam: gone after three portions' );

	// cans need an opener or a blade; stacks split so one can is opened
	const beans = put( 'canned_beans' );
	ok( U.actions( beans )[ 0 ].label === 'Open', 'beans: Open is the default' );
	toasts.length = 0; U.use( beans ); finish();
	ok( ! beans.data.open && toasts.some( t => /Need a can opener/.test( t ) ), 'beans: needs a tool without one' );
	put( 'kitchen_knife' );
	U.use( beans ); finish();
	ok( beans.data.open && beans.data.spill > 0, 'beans: opened with a knife spills a little' );
	ok( /^Eat/.test( U.actions( beans )[ 0 ].label ), 'beans: then it can be eaten' );
	const tuna = put( 'canned_tuna', 4 );
	put( 'can_opener' );
	U.use( tuna ); finish();
	const opened = inv.findAll( ( x ) => x.id === 'canned_tuna' );
	ok( opened.length === 2 && opened.some( x => x.qty === 3 && ! x.data.open ) && opened.some( x => x.qty === 1 && x.data.open && ! x.data.spill ), 'tuna: one can split off and opened cleanly with the opener' );

	// coconut: crack with a blade into drink + food
	put( 'machete' );
	const coco = put( 'coconut' );
	U.use( coco ); finish();
	ok( coco.id === 'coconut_open', 'coconut cracks open with a machete' );
	const th0 = S.thirst; U.use( coco ); finish();
	ok( S.thirst > th0, 'cracked coconut gives water' );

	// drinks leave their bottle
	const beer = put( 'beer_bottle' );
	U.use( beer ); finish();
	ok( beer.id === 'empty_bottle' && S.drunk > 0, 'beer: drunk, the empty bottle stays' );

	// water containers, seawater, boiling at a fire
	const bottle = put( 'water_bottle' );
	U.fillFrom( 'sea', bottle ); finish();
	ok( bottle.data.liquid === 'sea' && bottle.data.amount > 0.49, 'fill a bottle with seawater' );
	S.thirst = 50; U.drinkFrom( bottle ); finish();
	ok( S.thirst < 50, 'seawater makes thirst worse' );
	const canteen = put( 'canteen' );
	U.fillFrom( 'sea', canteen ); finish();
	const boil = game.crafting.recipes.find( r => r.id === 'boil_water' );
	ok( ! game.crafting.canCraft( boil ), 'boiling needs a fire' );
	const fire = game.crafting.placeFire( 'campfire', new THREE.Vector3( 0.5, 0, 0 ), { lit: true, fuel: 2 } );
	ok( game.nearFire( game.player.pos ), 'a lit campfire is near' );
	ok( game.crafting.canCraft( boil ), 'boiling possible at the fire with a canteen' );
	game.crafting.craft( boil ); finish();
	ok( canteen.data.liquid === 'water' && Math.abs( canteen.data.amount - 0.6 ) < 0.01, `boiled seawater is drinkable, 60% left (${canteen.data.amount})` );
	S.thirst = 40; U.drinkFrom( canteen ); finish();
	ok( S.thirst > 40, 'boiled water quenches thirst' );

	// cooking raw meat at the fire
	const boar = put( 'raw_boar' );
	ok( U.actions( boar )[ 0 ].label === 'Cook', 'raw meat: cooking is the default at a fire' );
	U.use( boar ); finish();
	ok( boar.id === 'cooked_boar', 'raw boar cooks' );
	// what was eaten raw stays eaten: half a breadfruit cooks into half a roasted one
	{
		const bf = put( 'breadfruit' ); bf.data.left = 1;
		U.cook( bf ); finish();
		ok( bf.id === 'cooked_breadfruit' && bf.data.left === 1, `half-eaten breadfruit cooks into a half (${bf.id}, left ${bf.data.left})` );
		// rice cooks in a pot of water (its recipe): no pot, no cooking; a bag gives five bowls, half a bag fewer
		const rice = put( 'rice_bag' );
		const cookRice = U.actions( rice ).find( a => a.verb === 'Cook' );
		toasts.length = 0; cookRice?.run(); finish();
		ok( inv.count( 'rice_bag' ) === 1 && toasts.some( t => /pot/i.test( t ) ), 'rice: Cook needs a pot: ' + toasts.join( ' | ' ) );
		put( 'cooking_pot' );
		const jug = put( 'water_jug' ); jug.data.liquid = 'water'; jug.data.amount = getItem( 'water_jug' ).tool.liquid;
		const bowls0 = inv.count( 'cooked_rice' );
		U.actions( rice ).find( a => a.verb === 'Cook' ).run(); finish();
		ok( ! inv.count( 'rice_bag' ) && inv.count( 'cooked_rice' ) === bowls0 + 5, `rice bag cooks into 5 bowls (${inv.count( 'cooked_rice' ) - bowls0})` );
		const rice2 = put( 'rice_bag' ); rice2.data.left = 5;
		const b1 = inv.count( 'cooked_rice' );
		U.actions( rice2 ).find( a => a.verb === 'Cook' ).run(); finish();
		ok( inv.count( 'cooked_rice' ) - b1 === 3, `half a bag of rice cooks into 3 bowls (${inv.count( 'cooked_rice' ) - b1})` );
		const eggs = put( 'eggs', 2 );
		const e0 = inv.count( 'cooked_egg' );
		U.actions( eggs ).find( a => a.verb === 'Cook' ).run(); finish();
		ok( inv.count( 'cooked_egg' ) === e0 + 1 && inv.count( 'eggs' ) === 1, 'an egg boils in the pot (its recipe)' );
		for ( const x of inv.findAll( ( st ) => [ 'cooking_pot', 'water_jug', 'cooked_rice', 'eggs', 'cooked_egg', 'cooked_breadfruit' ].includes( st.id ) ) ) inv.remove( x );
	}
	// the fire burns down in game hours
	game.time.hours += 3; game.crafting.update( 0.1 );
	ok( ! fire.lit && fire.deadSince !== null, 'the campfire burns out' );
	ok( ! game.nearFire( game.player.pos ), 'a dead fire gives no warmth' );

	// medicine
	const band = put( 'bandage', 2 );
	S.bleeding = 0; toasts.length = 0; U.use( band ); finish();
	ok( band.qty === 2 && toasts.some( t => /Not bleeding/.test( t ) ), 'bandage refused when not bleeding' );
	S.bleeding = 1; U.use( band ); finish();
	ok( S.bleeding === 0 && band.qty === 1, 'bandage stops a bleed' );
	const kit = put( 'first_aid_kit' );
	const nb = inv.count( 'bandage' );
	U.use( kit ); finish();
	ok( ! inv.count( 'first_aid_kit' ) && inv.count( 'bandage' ) === nb + 3 && inv.count( 'painkillers' ) >= 6, 'first aid kit unpacks' );
	S.infected = true; S.infection = 0.3;
	const cipro = put( 'antibiotics_strong', 2 );
	U.use( cipro ); finish();
	ok( ! S.infected, 'strong antibiotics clear an infection' );

	// the rags recipe takes a spare shirt, not the one you wear with something in its pocket
	{
		const worn = makeStack( 'tshirt', 1 ); const chain = makeStack( 'gold_chain', 1 );
		const holder = getItem( 'tshirt' ).clothing.capacity > 0;
		if ( holder ) worn.data.items = [ chain ];
		const prevTorso = inv.equip.torso; inv.equip.torso = worn;
		const rec = game.crafting.recipes.find( r => r.id === 'rags_tshirt' );
		if ( holder ) ok( ! game.crafting.canCraft( rec ) && game.crafting.check( rec ).reason === 'Empty it first', 'rags recipe: a worn shirt with something in it is not used: ' + game.crafting.check( rec ).reason );
		const spare = makeStack( 'tshirt', 1 ); inv.add( spare, { autoEquip: false } );
		ok( game.crafting.canCraft( rec ), 'rags recipe: a spare shirt can be used' );
		game.crafting.craft( rec ); finish();
		ok( inv.equip.torso === worn && ( ! holder || worn.data.items[ 0 ] === chain ) && ! inv.findAll( x => x === spare ).length, 'rags recipe: the spare shirt went, the worn one and its pocket stayed' );
		if ( prevTorso ) inv.equip.torso = prevTorso; else delete inv.equip.torso;
	}
	// rags from a t-shirt, bandage from rags (crafting)
	const tee = put( 'tshirt' );
	U.actions( tee ).find( a => /Rip/.test( a.label ) ).run(); finish();
	ok( ! inv.count( 'tshirt' ) && inv.count( 'rags' ) >= 1, `t-shirt ripped into ${inv.count( 'rags' )} rags` );
	put( 'rags', 2 );
	const rb = game.crafting.recipes.find( r => r.id === 'rag_bandage' );
	const before = inv.count( 'bandage_rag' );
	game.crafting.craft( rb ); finish();
	ok( inv.count( 'bandage_rag' ) === before + 1, 'craft a rag bandage' );
	const spear = game.crafting.recipes.find( r => r.id === 'spear' );
	ok( ! game.crafting.canCraft( spear ) && /long stick/i.test( game.crafting.check( spear ).reason ), 'spear needs a long stick: ' + game.crafting.check( spear ).reason );

	// the fire's F prompt feeds real fuel, the longest burning first (not rags, books or a ukulele)
	{
		const f2 = game.crafting.placeFire( 'campfire', new THREE.Vector3( 0.4, 0, 0.3 ), { lit: true, fuel: 0.5 } );
		put( 'rags', 3 ); put( 'bible' ); put( 'stick', 2 ); put( 'firewood', 1 );
		ok( game.crafting.bestFuel()?.id === 'firewood', 'best fuel: firewood before sticks, rags or a bible' );
		const opts = game.crafting.provide( { origin: new THREE.Vector3( 0.4, 1, 1.3 ), dir: new THREE.Vector3( 0, - 0.55, - 0.84 ).normalize() }, 4 );
		ok( opts?.[ 0 ]?.label === 'Add Firewood', 'a low fire offers firewood on F: ' + opts?.[ 0 ]?.label );
		game.crafting.removeFire( f2 );
		for ( const x of inv.findAll( ( st ) => [ 'rags', 'bible', 'stick', 'firewood' ].includes( st.id ) ) ) inv.remove( x );
	}

	// lights drain batteries in game hours
	const fl = put( 'flashlight' );
	U.toggleLight( fl );
	ok( fl.data.on, 'flashlight on' );
	U._updateLights( 0 );
	ok( lights.spotSource && lights.spotSource.kind === 'flashlight', 'the flashlight feeds the spot light' );
	U._updateLights( 20 );
	ok( ! fl.data.on && fl.data.charge === 0, 'batteries run flat' );
	put( 'batteries', 2 );
	act( fl, /Replace batteries/ ).run(); finish();
	ok( fl.data.charge === getItem( 'flashlight' ).tool.battery, 'fresh batteries' );
	{
		// no idle spot light in the world scene: the pool is three point lights
		const L2 = new LightPool( { ...game, scene: new THREE.Scene() } );
		ok( ! L2.spot && L2.game.scene.children.length === 3, 'a fresh light pool adds three point lights and no spot light' );
		L2.dispose();
		// with a hands module, a flashlight left on in the bag switches off (the hands draw the held one)
		const selected = [];
		game.hands = { select: ( st ) => { selected.push( st ); inv.hands = st.uid; return true; } };
		fl.data.on = true; inv.hands = null;
		U._updateLights( 0 );
		ok( ! fl.data.on, 'with hands: a flashlight on in the bag switches off' );
		act( fl, /Turn on/ ).run();
		ok( fl.data.on && selected[ 0 ] === fl, 'with hands: Turn on takes the flashlight into the hands' );
		U._updateLights( 0 );
		ok( fl.data.on && ! lights.spotSource, 'with hands: the held flashlight stays on, drawn by the hands' );
		fl.data.on = false; inv.hands = null; delete game.hands;
	}

	// food spoils with game time
	const poke = put( 'poke' ); poke.data.age = 0;
	U._spoil( 10 );
	ok( freshness( poke ) === 0, 'poke rots within hours' );
	const nuts = put( 'macadamia_nuts' );
	U._spoil( 1000 );
	ok( freshness( nuts ) === 1, 'canned nuts never spoil' );

	// sleeping bag hands over to game.sleep
	let slept = null; game.sleep = ( h, q ) => { slept = [ h, q ]; return true; };
	S.energy = 30;
	U.use( put( 'sleeping_bag' ) );
	ok( slept && slept[ 0 ] >= 2 && slept[ 1 ] > 0.5, 'sleeping bag sleeps ' + slept?.[ 0 ] + ' h' );

	// shore fishing: cast over deep water, the bobber bites, strike, land a fish (bait used)
	{
		const { Fishing } = await import( '../src/game/items/Fishing.js' );
		game.physics = { waterLevel: () => 0, raycastBoxes: () => null, raycast: () => null };
		game.hf = { heightAt: ( x ) => x < 3 ? 1 : - 4 };
		game.player.pos.set( 0, 1, 0 ); game.player.swimming = false; game.player.vehicle = null;
		const F = new Fishing( game );
		const rod = put( 'fishing_rod' ); put( 'fishing_bait', 2 );
		const tg = F.target( { origin: new THREE.Vector3( 0, 2.6, 0 ), dir: new THREE.Vector3( 1, - 0.2, 0 ).normalize() } );
		ok( tg && tg.depth > 3, 'fishing: a cast lands on deep water' );
		ok( ! F.target( { origin: new THREE.Vector3( 0, 2.6, 0 ), dir: new THREE.Vector3( - 1, - 0.2, 0 ).normalize() } ), 'fishing: no cast onto dry land' );
		F.cast( rod, tg ); finish();
		ok( F.state === 'wait', 'fishing: waiting for a bite' );
		F.waitT = 0; F.update( 0.016 );
		ok( F.state === 'bite', 'fishing: a bite' );
		const fish0 = inv.findAll( ( x, d ) => d?.food ).length, bait0 = inv.count( 'fishing_bait' );
		const rnd0 = Math.random; Math.random = () => 0.1;
		try { F.strike(); finish(); } finally { Math.random = rnd0; }
		ok( F.state === null && inv.findAll( ( x, d ) => d?.food ).length === fish0 + 1 && inv.count( 'fishing_bait' ) === bait0 - 1, 'fishing: strike lands a fish and uses bait' );
		F.dispose();
	}

	// guides teach a skill once
	const guide = put( 'fishing_guide' );
	act( guide, /^Read$/ ).run(); finish();
	ok( U.knowledge.fishing && ! act( guide, /^Read$/ ), 'fishing guide teaches fishing once' );
	// and it dies with the character
	game.events.emit( 'playerDeath', {} );
	ok( ! U.knowledge.fishing && act( guide, /^Read$/ ), 'knowledge is forgotten on death' );

	// splitting one unit off never overfills its container: it goes where there is room
	{
		const { containerVolume } = await import( '../src/game/Inventory.js' );
		const pockets = inv.pockets;
		const filler = [ ...ITEMS.values() ].find( d => d.size === 1 && d.stack === 1 && d.cat === 'material' ) || [ ...ITEMS.values() ].find( d => d.size === 1 && d.stack === 1 );
		const tuna = makeStack( 'canned_tuna', 4 );
		inv.pockets = [ tuna, makeStack( 'canned_tuna', 1 ), makeStack( filler.id, 1 ), makeStack( filler.id, 1 ), makeStack( filler.id, 1 ) ];
		const full = containerVolume( inv.pockets );
		const one = U.splitOne( tuna );
		ok( full === 4 && containerVolume( inv.pockets ) <= 4 && one !== tuna && one.qty === 1 && tuna.qty === 3 && U.where( one )?.kind === 'inv' && ! inv.pockets.includes( one ), `split: the unit went to another container (pockets ${containerVolume( inv.pockets )}/4)` );
		inv.remove( one );
		inv.pockets = pockets;
		// an open can stays its own stack
		const { canMerge } = await import( '../src/game/items/ItemDB.js' );
		const c1 = makeStack( 'canned_tuna', 1 ), c2 = makeStack( 'canned_tuna', 1 ); c2.data.open = true;
		ok( ! canMerge( c1, c2 ) && canMerge( c1, makeStack( 'canned_tuna', 2 ) ), 'an open can does not merge into closed ones' );
	}

	// player-facing text: short, plain, no exclamation marks
	const labels = new Set();
	for ( const d of ITEMS.values() ) {
		const st = makeStack( d.id, 1, { loot: true } );
		for ( const a of U.actions( st ) ) labels.add( a.label );
	}
	const long = [ ...labels ].filter( l => l.length > 32 || /!/.test( l ) );
	ok( ! long.length, 'action labels are short: ' + long.join( ' | ' ) );
	const loud = toasts.filter( t => t.length > 40 || /!/.test( t ) );
	ok( ! loud.length, 'toasts are short: ' + loud.join( ' | ' ) );
	const descs = [ ...ITEMS.values() ].filter( d => ! d.firearm && ! d.melee && ! d.ammo && ! d.magazine && ! d.attachment && ( d.cat !== 'throwable' || d.id === 'road_flare' ) && ( d.desc.length > 40 || /!/.test( d.desc ) ) );
	ok( ! descs.length, 'item descriptions are short: ' + descs.map( d => d.id ).join( ' ' ) );
}

// ---- world items: loot spots, pickups, claims (the real WorldItems with a stub game) ------------------------------
console.log( 'world items' );
{
	const THREE = await import( 'three' );
	const { PlayerInventory } = await import( '../src/game/Inventory.js' );
	const { Survival } = await import( '../src/game/Survival.js' );
	const { Actions } = await import( '../src/game/Actions.js' );
	const { Events } = await import( '../src/core/Events.js' );
	const { WorldItems, drawRange } = await import( '../src/game/items/WorldItems.js' );
	const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
	const picks = [];
	const game = {
		mode: 'survival', time: { hours: 50, dayMinutes: 48 }, get hour() { return 12; }, get day() { return 3; },
		scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {}, events: new Events(),
		audio: { play() {}, loop() { return null; }, buffers: new Map() }, settings: { get: () => true }, input: { pressed: () => false },
		interact: { addProvider() { return () => {}; }, target: null }, entities: { add() {}, remove() {} },
		physics: { ground: () => ( { y: 0, box: null } ), waterLevel: () => - 50, raycastBoxes: () => null },
		hf: { normalAt: ( x, z, out ) => out.set( 0, 1, 0 ), heightAt: () => 0 },
		world: { isIndoors: () => false, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } }, weather: { rain: 0 },
		player: { pos: new THREE.Vector3(), yaw: 0, eye: 1.6, stanceH: 1.6, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
		toast: () => {}, dropStack: () => {}, inputActive: true,
	};
	game.survival = new Survival( game );
	game.actions = new Actions( game );
	const W = game.items3d = new WorldItems( game );
	const U = game.itemUse = new ItemUse( game, null );
	const inv = game.player.inventory;
	inv.equip.back = makeStack( 'backpack_military', 1 );
	const finish = () => game.actions.update( 999 );
	game.events.on( 'item:pick', e => picks.push( e.stack.qty ) );
	const taken = [];
	W.addTakenListener( ( it, st ) => taken.push( { key: it.key, qty: st.qty } ) );

	// eating from a streamed loot item on a table: the spot counts as looted, the rest is saved like a drop
	const spam = makeStack( 'spam', 1 );
	const loot = W.spawn( spam, new THREE.Vector3( 0.3, 0.8, 0 ), { key: '12:0:s3', persistent: false, settle: false } );
	U.actions( spam )[ 0 ].run(); finish();
	const now = W.byStack( spam );
	ok( taken.some( t => t.key === '12:0:s3' ), 'eating from a loot item marks its spot looted' );
	ok( now && now !== loot && now.persistent && now.key === null && ! W.items.has( loot ) && spam.data.left === 2, 'the part-eaten item is now a persistent twin (the building drops the original)' );
	// used up where it lies: taken
	taken.length = 0;
	const kit = makeStack( 'first_aid_kit', 1 );
	W.spawn( kit, new THREE.Vector3( - 0.3, 0.8, 0 ), { key: '12:0:s4', persistent: false, settle: false } );
	U.use( kit ); finish();
	ok( taken.some( t => t.key === '12:0:s4' ) && ! W.byStack( kit ), 'unpacking a kit on the floor takes it (spot looted)' );
	// a pickup that tops up a stack you carry reports what was picked up, not the emptied stack
	inv.add( makeStack( 'ammo_9mm', 10 ), { autoEquip: false } );
	taken.length = 0; picks.length = 0;
	const rounds = W.spawn( makeStack( 'ammo_9mm', 20 ), new THREE.Vector3( 0, 0, 0.5 ), { persistent: true } );
	W.take( rounds );
	ok( inv.count( 'ammo_9mm' ) === 30 && picks[ 0 ] === 20 && taken[ 0 ]?.qty === 20, `merged pickup reports 20 rounds (event ${picks[ 0 ]}, listener ${taken[ 0 ]?.qty})` );
	// a taken item is gone from the spatial hash too (a shelf item used to linger there, still drawn and hoverable)
	const shelf = W.spawn( makeStack( 'crackers', 1 ), new THREE.Vector3( 1, 0.9, 0 ), { key: '12:0:s6', settle: false } );
	W.take( shelf );
	ok( ! W.near( new THREE.Vector3( 1, 0.9, 0 ), 2 ).includes( shelf ) && ! W.near( new THREE.Vector3( 0, 0, 0.5 ), 2 ).includes( rounds ), 'taken items leave no ghost in the spatial hash' );
	// splitting a unit off a stack on the ground claims the stack
	taken.length = 0;
	const cans = makeStack( 'canned_tuna', 3 );
	W.spawn( cans, new THREE.Vector3( 0.6, 0, 0 ), { key: '12:0:s5', persistent: false, settle: false } );
	inv.add( makeStack( 'can_opener', 1 ), { autoEquip: false } );
	U.use( cans ); finish();
	ok( taken.some( t => t.key === '12:0:s5' ) && W.byStack( cans )?.persistent && cans.qty === 2, 'opening one can of a pile on the floor claims the pile' );
	// small things are drawn less far
	ok( drawRange( 0.02 ) === 10 && drawRange( 0.1 ) === 35 && drawRange( 0.4 ) === 55, 'draw range scales with model size' );
	W.dispose(); U.dispose();
}

// ---- loot: perishables have gone off a week into the outbreak ------------------------------------------------
{
	const { PERISHABLE_H } = await import( '../src/game/items/Loot.js' );
	let fresh = 0, found = 0;
	for ( let i = 0; i < 300; i ++ ) for ( const t of [ 'fridge', 'restaurant', 'fastfood' ] ) for ( const st of rollLoot( t, rnd ) ) {
		const f = ITEMS.get( st.id ).food;
		if ( ! f?.spoil || f.spoil > PERISHABLE_H ) continue;
		found ++; if ( freshness( st ) > 0 ) fresh ++;
	}
	ok( found > 0 && fresh === 0, `perishable loot is rotten (${found} found, ${fresh} fresh)` );
	const tin = rollLoot( { rolls: [ 1, 1 ], items: [ 'spam' ] }, rnd )[ 0 ];
	ok( freshness( tin ) === 1, 'tinned food is still good' );
}

// ---- icons: an empty render is not an icon -----------------------------------------------------------------
{
	const { coverage, ICON_VERSION } = await import( '../src/render/Icons.js' );
	const px = new Uint8Array( 256 * 256 * 4 );
	ok( coverage( px ) === 0, 'icons: an empty read-back covers nothing' );
	for ( let i = 0; i < 4000; i ++ ) px[ i * 4 + 3 ] = 255;
	ok( coverage( px ) === 4000 && ICON_VERSION >= 6, 'icons: coverage counts drawn pixels' );
}

// ---- models: every item model builds, rests on y = 0 (no DOM: a no-op canvas stands in) ---------------------------
console.log( 'models' );
{
	const noop = () => {};
	const ctx2d = new Proxy( {}, { get: ( t, k ) => {
		if ( k in t ) return t[ k ];
		if ( k === 'measureText' ) return () => ( { width: 10 } );
		if ( k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ) return () => ( { addColorStop: noop } );
		if ( k === 'getImageData' ) return ( x, y, w, h ) => ( { data: new Uint8ClampedArray( w * h * 4 ), width: w, height: h } );
		return noop;
	}, set: ( t, k, v ) => { t[ k ] = v; return true; } } );
	const el = () => ( { width: 1, height: 1, style: {}, getContext: () => ctx2d, toDataURL: () => 'data:,', addEventListener: noop, removeEventListener: noop, setAttribute: noop } );
	const hadDoc = 'document' in globalThis;
	if ( ! hadDoc ) globalThis.document = { createElement: el, createElementNS: el };
	try {
		const M = await import( '../src/render/ItemModels.js' );
		let built = 0;
		const fell = [], low = [];
		for ( const d of ITEMS.values() ) {
			if ( WEAPON_MODELS.has( d.model?.type ) ) continue;
			try {
				const info = M.modelInfo( d );
				built ++;
				if ( M.buildItemModel( d ).userData.fallback ) fell.push( d.id );
				if ( info.box.min.y < - 0.005 ) low.push( `${d.id} ${info.box.min.y.toFixed( 3 )}` );
			} catch ( e ) { fell.push( d.id + ': ' + e.message ); }
		}
		ok( built > 300 && ! fell.length, `${built} models build without the placeholder: ${fell.join( ' | ' )}` );
		ok( ! low.length, 'models rest on y = 0 (nothing below the origin): ' + low.join( ' | ' ) );
	} finally { if ( ! hadDoc ) delete globalThis.document; }
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
