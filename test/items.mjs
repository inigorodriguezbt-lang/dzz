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
const { LOOT_TABLES, rollLoot, tableIds } = await import( '../src/game/items/Loot.js' );
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
		case 'book': ok( Array.isArray( d.book?.pages ) && d.book.pages.length > 0, `${id}: book pages` ); break;
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
	const toasts = [];
	const game = {
		mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
		scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {},
		events: { emit() {}, on() { return () => {}; } }, audio: { play() {}, loop() { return null; }, buffers: new Map() },
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
	const finish = () => game.actions.update( 999 );
	const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return inv.find( ( x ) => x.id === id ); };
	const act = ( st, re ) => U.actions( st ).find( a => re.test( a.label ) );

	// multi-portion food
	const spam = put( 'spam' );
	S.hunger = 20;
	ok( /^Eat \(3\/3\)/.test( U.actions( spam )[ 0 ]?.label ), 'spam: first action eats a portion: ' + U.actions( spam )[ 0 ]?.label );
	U.use( spam ); finish();
	ok( Math.abs( S.hunger - ( 20 + 1020 / 20 / 3 ) ) < 0.01 && spam.data.left === 2, `spam: one portion eaten (hunger ${S.hunger.toFixed( 1 )}, left ${spam.data.left})` );
	U.use( spam ); finish(); U.use( spam ); finish();
	ok( ! inv.count( 'spam' ), 'spam: gone after three portions' );

	// cans need an opener or a blade; stacks split so one can is opened
	const beans = put( 'canned_beans' );
	ok( /needs a can opener/.test( U.actions( beans )[ 0 ].label ), 'beans: needs a tool without one' );
	put( 'kitchen_knife' );
	ok( /Open with Kitchen knife/.test( U.actions( beans )[ 0 ].label ), 'beans: a knife opens it' );
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
	ok( /Cook on the fire/.test( U.actions( boar )[ 0 ].label ), 'raw meat: cooking is the default at a fire' );
	U.use( boar ); finish();
	ok( boar.id === 'cooked_boar', 'raw boar cooks' );
	// the fire burns down in game hours
	game.time.hours += 3; game.crafting.update( 0.1 );
	ok( ! fire.lit && fire.deadSince !== null, 'the campfire burns out' );
	ok( ! game.nearFire( game.player.pos ), 'a dead fire gives no warmth' );

	// medicine
	const band = put( 'bandage', 2 );
	S.bleeding = 0; toasts.length = 0; U.use( band ); finish();
	ok( band.qty === 2 && toasts.some( t => /not bleeding/.test( t ) ), 'bandage refused when not bleeding' );
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

	// lights drain batteries in game hours
	const fl = put( 'flashlight' );
	U.toggleLight( fl );
	ok( fl.data.on, 'flashlight on' );
	U._updateLights( 0 );
	ok( lights.spotSource && lights.spotSource.kind === 'flashlight', 'the flashlight feeds the spot light' );
	U._updateLights( 20 );
	ok( ! fl.data.on && fl.data.charge === 0, 'batteries run flat' );
	put( 'batteries', 2 );
	act( fl, /Replace the batteries/ ).run(); finish();
	ok( fl.data.charge === getItem( 'flashlight' ).tool.battery, 'fresh batteries' );

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
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
