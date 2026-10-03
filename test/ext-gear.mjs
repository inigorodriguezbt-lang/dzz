// The gear items (Node, a fake DOM for canvas labels): node test/ext-gear.mjs
//   the catalogue: every gear item has a model, a place to be found (or is made) and something to do; the looks of a
//   dyed garment (key, def, name, what can be dyed); the tailoring numbers
//   game.combine / game.itemUse / game.crafting on a stub game: dyes (black, camo, tie-dye, bleach, a marker), patches
//   (and that they stop bites in Survival.hurt), pouches (Inventory.capacityOf), jeans cut into cutoffs, plates in and
//   out of the vest, pads, the lei band, the boonie net, a trash bag poncho, plastic cord, the locked cases and boxes,
//   wet clothes (the system and the fire verbs), a plastic bag tearing, the suitcase dragged, camouflage, the hydration
//   pack, dog tags, the recipes, the rain poncho rig and a save round trip
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const THREE = await import( 'three' );
await import( '../src/game/items/defs/index.js' );
const { ITEMS, getItem, makeStack, displayName } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, compileTable, rollLoot } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const C = await import( '../src/game/items/combos.js' );
const L = await import( '../src/game/items/ext/gear/logic.js' );
const RT = await import( '../src/game/items/ext/gear/runtime.js' );
const { hasModelBuilder, buildItemModel } = await import( '../src/render/ItemModels.js' );
const { PlayerInventory, capacityOf } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );
const { Events } = await import( '../src/core/Events.js' );
const { spoilRate, startSystems } = await import( '../src/game/items/hooks.js' );
const { Placeables } = await import( '../src/game/items/Placeables.js' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );

// ---- the catalogue ---------------------------------------------------------------------------------------------------
console.log( 'catalogue' );
const GEAR = [ ...ITEMS.values() ].filter( d => d.tags.includes( 'gear' ) );
ok( GEAR.length >= 55, `gear items (${GEAR.length})` );
for ( const d of GEAR ) {
	ok( hasModelBuilder( d.model.type ), `${d.id}: model builder ${d.model.type}` );
	let obj = null;
	try { obj = buildItemModel( d ); } catch ( e ) { /* reported below */ }
	ok( obj && ! obj.userData.fallback, `${d.id}: model builds` );
	ok( d.desc && d.desc.length <= 40 && ! /!/.test( d.desc ), `${d.id}: short plain description` );
}
const visible = new Set(), made = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( /^(car_|zombie_|gear_)/.test( name ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
const recipes = allRecipes();
for ( const r of recipes ) made.add( r.out[ 0 ] );
for ( const c of C.allCombos() ) for ( const [ id ] of c.out ) made.add( id );
const REPLACED = [ 'tactical_vest_plated', 'tactical_vest_scrap', 'lauhala_hat_lei', 'boonie_net', 'trash_bag_poncho', 'denim_shorts' ];
for ( const d of GEAR ) ok( visible.has( d.id ) || made.has( d.id ) || REPLACED.includes( d.id ), `${d.id}: found in the world or made` );
// what each one does besides being worn
const inRecipe = new Set();
for ( const r of recipes ) { for ( const [ id ] of r.in ) inRecipe.add( id ); inRecipe.add( r.out[ 0 ] ); }
const inCombo = ( d ) => {
	const st = makeStack( d.id, d.stack, { full: true } ); st.cond = 0.5;
	return C.allCombos().some( c => C.matches( c.a, st, d ) || C.matches( c.b, st, d ) );
};
for ( const d of GEAR ) ok( !! ( d.clothing || d.backpack || d.place || d.dismantle || d.container || inRecipe.has( d.id ) || inCombo( d ) || [ 'dog_tags', 'lanyard_keys' ].includes( d.id ) ), `${d.id}: does something` );
// rare things stay rare: a plated vest is a sliver of an armory's loot
{
	const t = compileTable( LOOT_TABLES.military_armory ), e = t.entries.find( x => x.ids.length === 1 && x.ids[ 0 ] === 'tactical_vest_plated' );
	ok( e && e.w / t.total < 0.02, `plated vest ${( e.w / t.total * 100 ).toFixed( 2 )}% of armory rolls` );
}
// models that must read as an icon (a square, dark background): not a thin strip, not black on black, not too heavy
{
	const box = ( id ) => new THREE.Box3().setFromObject( buildItemModel( getItem( id ) ) ).getSize( new THREE.Vector3() );
	const tris = ( id ) => { let n = 0; buildItemModel( getItem( id ) ).traverse( m => { if ( m.isMesh ) n += ( m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count ) / 3; } ); return n; };
	const lv = box( 'lavalava' );
	ok( Math.max( lv.x, lv.z ) / Math.min( lv.x, lv.z ) < 2, `the lavalava folds square-ish (${lv.x.toFixed( 2 )} x ${lv.z.toFixed( 2 )})` );
	for ( const id of [ 'chest_protector', 'beekeeper_veil', 'trash_bag_poncho', 'holoku', 'lanyard_keys' ] ) ok( tris( id ) < 5000, `${id}: ${tris( id )} triangles` );
	const lum = ( c ) => ( ( c >> 16 & 255 ) * 0.3 + ( c >> 8 & 255 ) * 0.59 + ( c & 255 ) * 0.11 ) / 255;
	let plate = 0; buildItemModel( getItem( 'armor_plate' ) ).traverse( m => { if ( m.isMesh ) plate = Math.max( plate, lum( m.material.color.getHex() ) ); } );
	ok( plate > 0.3, `the steel plate's coat shows against a dark background (${plate.toFixed( 2 )})` );
	ok( lum( getItem( 'trash_bag_poncho' ).model.color ) > 0.12, 'the trash bag poncho is a shade off black' );
	const veil = box( 'beekeeper_veil' );
	ok( veil.y < 0.25 && veil.x > 0.4, 'the veil slumps round the hat (not a drum)' );
}
// the needle exists as a tool kind and a sewing kit provides one
ok( GEAR.some( d => d.tool?.kind === 'needle' ) && getItem( 'sewing_kit' ).tool.provides.includes( 'needle' ), 'needle: a tool kind, and a sewing kit has one' );
ok( getItem( 'hydration_pack' ).tool?.liquid === 2.5 && getItem( 'hydration_pack' ).backpack.slot === 'back', 'the hydration pack is a pack that holds water' );
ok( getItem( 'rain_poncho' ).place?.kind === 'collector' && getItem( 'rain_poncho' ).place.shape === 'tarp', 'a rain poncho rigs like a tarp' );
ok( getItem( 'ammo_can' ).container?.capacity > 0 && getItem( 'ammo_can' ).size >= getItem( 'ammo_can' ).container.capacity, 'an ammo can holds no more than it takes up' );
for ( const d of GEAR ) if ( d.container ) ok( d.size >= d.container.capacity, `${d.id}: a hand box adds no free room` );
// the cases' tables roll real things
for ( const t of [ 'gear_briefcase', 'gear_pistol_case', 'gear_lunch_box', 'gear_ammo_can' ] ) {
	let n = 0;
	for ( let i = 0; i < 200; i ++ ) for ( const s of rollLoot( t ) ) { n ++; ok( getItem( s.id ), `${t}: ${s.id}` ); }
	ok( t === 'gear_lunch_box' || n > 0, `${t} rolls` );
}

// ---- looks and numbers ---------------------------------------------------------------------------------------------------
console.log( 'looks' );
{
	ok( L.dyeable( getItem( 'tshirt' ) ) && L.dyeable( getItem( 'jeans' ) ) && L.dyeable( getItem( 'backpack_school' ) ) && L.dyeable( getItem( 'pau_skirt' ) ), 'shirts, jeans, bags and skirts dye' );
	ok( ! L.dyeable( getItem( 'military_helmet' ) ) && ! L.dyeable( getItem( 'motocross_helmet' ) ) && ! L.dyeable( getItem( 'sunglasses' ) ) && ! L.dyeable( getItem( 'trash_bag' ) ) && ! L.dyeable( getItem( 'water_bottle' ) ), 'helmets, glasses, plastic and tools don\'t' );
	ok( L.markable( getItem( 'baseball_cap' ) ) && L.markable( getItem( 'work_gloves' ) ) && ! L.markable( getItem( 'tshirt' ) ), 'a marker only covers small things' );
	const s = makeStack( 'aloha_shirt', 1 );
	ok( L.lookKey( s ) === 'aloha_shirt', 'an undyed stack draws as its item' );
	RT.setLook( s, 'black' );
	ok( L.lookKey( s ) === 'aloha_shirt~black' && displayName( s ) === 'Black aloha shirt', `dyed: key ${L.lookKey( s )}, name ${displayName( s )}` );
	const d = L.lookDef( 'aloha_shirt~black' );
	ok( d && d.id === 'aloha_shirt~black' && d.model.type === 'shirt' && d.model.color === L.DYES.black.color && d.model.print === 'hibiscus', 'the look keeps the print, recoloured' );
	ok( d.model.color2 !== getItem( 'aloha_shirt' ).model.color2 && d.clothing.color === L.DYES.black.color && d.clothing.visibility === L.DYES.black.vis, 'the print darkens, the garment colour and visibility follow' );
	ok( L.lookDef( 'aloha_shirt~black' ) === d, 'one cached def per look' );
	ok( L.lookDef( 'aloha_shirt' ) === getItem( 'aloha_shirt' ) && L.lookDef( 'nope~black' ) === undefined && L.lookDef( 'tshirt~purple' ) === undefined, 'plain ids and unknown looks' );
	const camo = L.lookDef( 'jeans~camo' );
	ok( camo.model.print === 'woodland' && camo.model.type === 'pants', 'camo prints woodland' );
	ok( getItem( 'tshirt' ).model.color !== L.lookDef( 'tshirt~bleach' ).model.color && L.dyedName( getItem( 'tshirt_black' ), 'tiedye' ) === 'Tie-dye t-shirt' && L.dyedName( getItem( 'hoodie' ), 'camo' ) === 'Camo hoodie', 'bleach fades; names drop the old colour' );
	ok( buildItemModel( camo ) && ! buildItemModel( camo ).userData.fallback, 'a look builds its own model' );
	// every dyeable gear item builds in every look, and the dye's print shows (a camo vest, poncho, rain hat)
	for ( const g of GEAR.filter( x => L.dyeable( x ) ) ) for ( const dye of Object.keys( L.DYES ) ) {
		let o = null; try { o = buildItemModel( L.lookDef( g.id + '~' + dye ) ); } catch ( e ) { /* reported */ }
		ok( o && ! o.userData.fallback, `${g.id}~${dye} builds` );
	}
	const printed = ( id ) => { let n = 0; buildItemModel( L.lookDef( id ) ).traverse( m => { if ( m.isMesh && m.material?.map ) n ++; } ); return n > 0; };
	for ( const id of [ 'tactical_vest~camo', 'rain_poncho~camo', 'sou_wester~tiedye', 'lavalava~tiedye' ] ) ok( printed( id ), `${id}: the print shows` );
	ok( ! L.dyeable( getItem( 'bandolier' ) ), 'a bandolier is not dyed (its shells would take the colour)' );
	RT.setLook( s, null );
	ok( ! s.data.look && ! s.data.name, 'a look comes off' );
	// tailoring bonuses are capped
	const j = makeStack( 'jeans', 1 );
	for ( let i = 0; i < 20; i ++ ) L.addMods( j, L.PATCH.leather );
	ok( getItem( 'jeans' ).clothing.armor.bite + j.data.mods.bite <= 0.6 + 1e-9, 'patches stop at a sane armour' );
	L.subMods( j, j.data.mods );
	ok( ! j.data.mods, 'mods taken off clear' );
	ok( L.camoFactor( {} ) > 0.95 && L.camoFactor( {} ) < 1.05, 'bare: seen as usual' );
	// how much clothes matter: everyday clothes a little, a hi-vis vest more, camouflage a lot, less so at night
	const outfit = ( o ) => { const e = {}; for ( const k in o ) e[ k ] = makeStack( o[ k ], 1 ); return e; };
	const civ = { torso: 'tshirt', legs: 'jeans', feet: 'sneakers', back: 'backpack_school' };
	const fc = ( o, night = 0 ) => L.camoFactor( outfit( o ), night );
	const cv = fc( civ ), dark = fc( { ...civ, torso: 'tshirt_black' } ), loud = fc( { ...civ, torso: 'aloha_shirt_yellow' } ), hv = fc( { ...civ, vest: 'hivis_vest' } );
	const camoKit = { torso: 'military_jacket', legs: 'camo_pants', head: 'boonie_hat', feet: 'combat_boots', hands: 'tactical_gloves', face: 'balaclava', vest: 'plate_carrier' };
	const cm = fc( camoKit ), ghillie = fc( { torso: 'ghillie_suit', head: 'ghillie_hood', legs: 'camo_pants' } );
	ok( cv > 0.95 && cv < 1.04, `everyday clothes: about as seen as bare (${cv.toFixed( 3 )})` );
	ok( dark > 0.85 && loud < 1.1 && loud - dark < 0.2, `dark or loud clothes shift it a little (${dark.toFixed( 3 )} .. ${loud.toFixed( 3 )})` );
	ok( hv >= cv + 0.07, `a hi-vis vest over a t-shirt shows (${hv.toFixed( 3 )})` );
	ok( cm < 0.8 && ghillie <= 0.7, `camouflage hides (${cm.toFixed( 3 )}, ghillie ${ghillie.toFixed( 3 )})` );
	ok( Math.abs( fc( { ...civ, vest: 'bandolier' } ) - cv ) < 0.03, 'a bandolier hardly covers the shirt' );
	ok( Math.abs( 1 - fc( camoKit, 1 ) ) < Math.abs( 1 - cm ) * 0.5 && Math.abs( 1 - fc( { ...civ, vest: 'hivis_vest' }, 1 ) ) < Math.abs( 1 - hv ) * 0.5, 'colours count less at night' );
	ok( L.camoFactor( { torso: makeStack( 'water_bottle', 1 ) } ) > 0.9, 'something odd in a slot: seen as skin' );
	ok( L.wetOnEquip( 0, 1, 'torso' ) > 0.8 && L.wetOnEquip( 0, 1, 'feet' ) < 0.3 && L.wetOnRemove( 1, 'torso' ) < 0.8, 'a wet shirt soaks you more than wet socks' );
	ok( L.strain( 'grocery_bag', 1, 10, { sprinting: true } ) === 0 && L.strain( 'grocery_bag', 8, 10, { sprinting: true } ) > 0.1 && L.strain( 'tshirt', 9, 10, { sprinting: true } ) === 0, 'plastic strains when loaded' );
}

// ---- a stub game ------------------------------------------------------------------------------------------------------------
const toasts = [], noises = [], dropped = [], reveals = [], opened = [];
let fire = false;
const sites = {
	reveal( kind, near, maxR ) { reveals.push( kind ); return kind === 'military_checkpoint' ? { key: 'm1', kind } : null; },
	find() { return null; }, near() { return []; },
};
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {},
	events: new Events(), audio: { play() { return null; }, loop() { return null; }, buffers: new Map() }, settings: { get: () => true },
	interact: { addProvider() { return () => {}; }, target: null, holdT: 0 },
	input: { pressed: () => false, released: () => false, is: () => false, codes: () => [], pressedQ: new Set(), down: new Set(), consumeWheel: () => 0 },
	world: { isIndoors: () => false, isBeach: () => false, meta: { cities: [] }, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } },
	weather: { rain: 0, state: 'clear', cover: 0.2 },
	player: { pos: new THREE.Vector3( 0, 2, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stanceH: 1.6, shake: 0, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ), moving: false, sprinting: false },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => dropped.push( s ), inputActive: true, dead: false,
	app: { ui: { inventory: { other: null }, openContainer: ( c ) => opened.push( c ) } }, sites,
	nearFire: () => fire,
	systems: [], register( s ) { this.systems.push( s ); },
};
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.survival = new Survival( game );
game.skills = game.survival.skills || game.skills;
game.actions = new Actions( game );
game.itemUse = new ItemUse( game, null );
game.crafting = new Crafting( game, null );
game.combine = new Combine( game );
game.placeables = new Placeables( game );
game.nearFire = () => fire; // after Crafting, which sets its own
const U = game.itemUse, K = game.combine, inv = game.player.inventory, S = game.survival;
inv.equip.back = makeStack( 'backpack_military', 1 );
const finish = () => { for ( let i = 0; i < 6 && game.actions.busy; i ++ ) game.actions.update( 999 ); };
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const has = ( id ) => inv.count( id );
const verb = ( st, v ) => U.actions( st ).find( a => a.verb === v || a.verb.startsWith( v ) );
const run = ( st, v ) => { const a = verb( st, v ); if ( ! a ) return false; a.run(); finish(); return true; };
const combo = ( id, a, b ) => { const st = K.state( C.getCombo( id ), a, b ); if ( ! st.ok ) return st; K.run( C.getCombo( id ), a, b ); finish(); return st; };
const clearInv = () => { for ( const s of [ ...inv.allStacks() ] ) if ( s !== inv.equip.back ) inv.remove( s ); };

// ---- dyes --------------------------------------------------------------------------------------------------------------------
console.log( 'dyes' );
{
	const tee = put( 'tshirt' ), dye = put( 'dye_black' );
	const st = K.state( C.getCombo( 'gear_dye_black' ), dye, tee );
	ok( ! st.ok && /water/i.test( st.reason ), 'dyeing needs water: ' + st.reason );
	const bottle = put( 'water_bottle', 1, { liquid: 'water' } );
	const L0 = bottle.data.amount;
	ok( combo( 'gear_dye_black', dye, tee ).ok, 'dye a t-shirt black' );
	ok( tee.data.look?.dye === 'black' && displayName( tee ) === 'Black t-shirt' && L.lookKey( tee ) === 'tshirt~black', `the t-shirt is black: ${displayName( tee )}` );
	near( bottle.data.amount, L0 - 0.5, 1e-6, 'half a litre of water used' );
	ok( dye.data.uses === 1, 'one use of dye left' );
	ok( K.find( dye, tee ).every( m => m.combo.id !== 'gear_dye_black' ), 'black on black is not offered' );
	// camo, tie-dye (fun), bleach strips a dye
	const hoodie = put( 'hoodie' ), camo = put( 'camo_dye_kit' );
	bottle.data.amount = 1; bottle.data.liquid = 'water';
	ok( combo( 'gear_dye_camo', camo, hoodie ).ok && hoodie.data.look.dye === 'camo' && L.lookDef( L.lookKey( hoodie ) ).model.print === 'woodland', 'a camo hoodie' );
	const pants = put( 'jeans' ), td = put( 'tiedye_kit' );
	bottle.data.amount = 1;
	S.boredom = 50;
	ok( combo( 'gear_dye_tiedye', td, pants ).ok && pants.data.look.dye === 'tiedye' && S.boredom < 50, `tie-dye jeans, and less bored (${S.boredom})` );
	const bleach = put( 'bleach' );
	bottle.data.amount = 1;
	ok( combo( 'gear_bleach', bleach, tee ).ok && ! tee.data.look && displayName( tee ) === 'White t-shirt', 'bleach strips the dye' );
	bottle.data.amount = 1;
	const red = put( 'flannel_shirt' );
	ok( combo( 'gear_bleach', bleach, red ).ok && red.data.look?.dye === 'bleach' && displayName( red ) === 'Bleached flannel shirt', 'bleach fades an undyed shirt: ' + displayName( red ) );
	// a marker on a cap, not on a shirt
	const cap = put( 'baseball_cap' ), mk = put( 'marker' );
	ok( combo( 'gear_marker', mk, cap ).ok && cap.data.look?.dye === 'black' && mk.data.uses === 3, 'a marker blacks out a cap' );
	ok( ! K.find( mk, red ).some( m => m.combo.id === 'gear_marker' ), 'a marker doesn\'t do a shirt' );
	// the arms and the world draw the look; a vest with the look keeps it through plates going in
	ok( L.lookOf( cap ).model.color === L.DYES.black.color, 'lookOf: the cap as it looks' );
	clearInv();
}

// ---- tailoring ---------------------------------------------------------------------------------------------------------------
console.log( 'tailoring' );
{
	const jeans = put( 'jeans' ), scraps = put( 'denim_scrap', 4 );
	let st = K.state( C.getCombo( 'gear_patch' ), scraps, jeans );
	ok( ! st.ok && /sewing kit|needle/.test( st.reason ), 'patching needs a needle: ' + st.reason );
	const kit = put( 'sewing_kit' );
	jeans.cond = 0.6;
	for ( let i = 0; i < 3; i ++ ) ok( combo( 'gear_patch', scraps, jeans ).ok, `patch ${i + 1}` );
	ok( jeans.data.patches === 3 && Math.abs( jeans.data.mods.bite - 0.12 ) < 1e-9 && jeans.cond > 0.9, `three denim patches: bite +${jeans.data.mods.bite}, cond ${jeans.cond.toFixed( 2 )}` );
	ok( ( kit.data.uses ?? getItem( 'sewing_kit' ).tool.uses ) === getItem( 'sewing_kit' ).tool.uses - 3, 'the kit spends thread' );
	st = K.state( C.getCombo( 'gear_patch' ), scraps, jeans );
	ok( ! st.ok && st.soft, 'a fourth patch is not offered' );
	// the patches work: Survival.hurt takes the sewn-on armour
	game.mode = 'survival';
	inv.remove( jeans ); inv.equip.legs = jeans;
	const hit = () => { S.health = 100; const r = Math.random; Math.random = () => 0.99; S.hurt( 20, 'bite' ); Math.random = r; return 100 - S.health; };
	const withPatches = hit();
	const saved = jeans.data.mods; delete jeans.data.mods;
	const without = hit();
	jeans.data.mods = saved;
	ok( withPatches < without, `patched jeans stop more of a bite (${withPatches.toFixed( 2 )} vs ${without.toFixed( 2 )})` );
	S.health = 100; S.bleeding = 0; S.infected = false; S.infection = 0;
	// pouches on a plain belt give it storage
	const belt = put( 'belt' ), pouch = put( 'utility_pouch', 3 );
	ok( capacityOf( belt ) === 0, 'a plain belt holds nothing' );
	ok( combo( 'gear_sew_pouch', pouch, belt ).ok && capacityOf( belt ) === 2, 'a pouch sewn on: storage 2' );
	inv.remove( belt ); inv.equip.belt = belt;
	ok( inv.containers().some( c => c.owner === belt && c.capacity === 2 ), 'the belt is a container now' );
	ok( K.state( C.getCombo( 'gear_sew_pouch' ), pouch, inv.equip.back ).ok, 'pouches go on bags too' );
	// a kapa patch is warm
	const shirt = put( 'aloha_shirt' ), kapa = put( 'kapa_cloth' );
	ok( combo( 'gear_patch', kapa, shirt ).ok && shirt.data.mods.ins === 0.06, 'kapa warms' );
	clearInv(); delete inv.equip.legs; delete inv.equip.belt;
}

// ---- cutting, plates, pads, mixes ------------------------------------------------------------------------------------------
console.log( 'mixes' );
{
	const knife = put( 'kitchen_knife' ), jeans = put( 'jeans' ), dye = put( 'dye_black' ), bottle = put( 'water_bottle', 1, { liquid: 'water' } );
	combo( 'gear_dye_black', dye, jeans );
	jeans.data.items = [ makeStack( 'cash', 20 ) ];
	const uid = jeans.uid;
	ok( K.find( knife, jeans ).length >= 2, 'a blade on jeans: rags or shorts (a chooser)' );
	ok( combo( 'gear_cut_jeans', knife, jeans ).ok, 'cut jeans' );
	const shorts = inv.findUid( uid );
	ok( shorts?.id === 'denim_shorts' && shorts.data.items?.[ 0 ]?.id === 'cash' && shorts.data.look?.dye === 'black' && displayName( shorts ) === 'Black cutoffs', `cutoffs keep the pockets and the dye: ${displayName( shorts )}` );
	ok( has( 'denim_scrap' ) === 2, 'and the legs come off as denim scraps' );
	// padded, patched jeans: the patches stay on the shorts, the pads come back
	{
		const pj = put( 'jeans' ), pd = put( 'skate_pads' );
		L.addMods( pj, L.PATCH.leather ); pj.data.patches = 1;
		combo( 'gear_pads', pd, pj );
		ok( ! has( 'skate_pads' ) && pj.data.pads, 'pads on the jeans' );
		const pu = pj.uid;
		ok( combo( 'gear_cut_jeans', knife, pj ).ok, 'cut the padded jeans' );
		const ps = inv.findUid( pu );
		ok( ps?.id === 'denim_shorts' && ps.data.patches === 1 && Math.abs( ( ps.data.mods?.bite || 0 ) - L.PATCH.leather.bite ) < 1e-9 && ! ps.data.pads && has( 'skate_pads' ) === 1, `patches kept, pads back (${JSON.stringify( ps?.data.mods )})` );
		inv.remove( ps ); inv.remove( inv.find( s => s.id === 'skate_pads' ) );
		for ( const s of inv.findAll( s => s.id === 'denim_scrap' ) ) inv.remove( s );
		put( 'denim_scrap', 2 );
	}
	// plates into the vest and out again
	const vest = put( 'tactical_vest' ), plates = put( 'armor_plate', 2 );
	vest.data.items = [ makeStack( 'bandage', 1 ) ];
	const vu = vest.uid;
	ok( combo( 'gear_plates_steel', plates, vest ).ok, 'insert plates' );
	const pv = inv.findUid( vu );
	ok( pv?.id === 'tactical_vest_plated' && pv.data.items?.length === 1 && ! has( 'armor_plate' ), 'a plated vest, its pouch contents kept' );
	ok( run( pv, 'Remove plates' ), 'Remove plates' );
	ok( inv.findUid( vu )?.id === 'tactical_vest' && inv.findUid( vu ).data.items?.length === 1 && has( 'armor_plate' ) === 2, 'the plates come back out, the bandage stays' );
	// scrap plates from sheet metal (a recipe), then into the vest
	ok( recipes.some( r => r.id === 'gear_scrap_plate' && r.in.some( ( [ id ] ) => id === 'sheet_metal' ) ), 'scrap plates are beaten from sheet metal' );
	const sp = put( 'scrap_plate', 2 );
	ok( combo( 'gear_plates_scrap', sp, inv.findUid( vu ) ).ok && inv.findUid( vu ).id === 'tactical_vest_scrap', 'a scrap-plated vest' );
	// pads strapped onto trousers and off
	const cargo = put( 'cargo_pants' ), pads = put( 'skate_pads' );
	ok( combo( 'gear_pads', pads, cargo ).ok && cargo.data.pads === 1 && cargo.data.mods.bite === L.PADS.bite && ! has( 'skate_pads' ), 'pads on' );
	ok( run( cargo, 'Take off pads' ) && ! cargo.data.pads && ! cargo.data.mods && has( 'skate_pads' ) === 1, 'pads off' );
	// the feather lei band onto a lauhala hat; a mosquito net onto a boonie
	const hat = put( 'lauhala_hat' ), band = put( 'feather_lei_band' );
	ok( combo( 'gear_lei_band', band, hat ).ok && hat.id === 'lauhala_hat_lei', 'a lauhala hat with a feather lei' );
	const boonie = put( 'boonie_hat' ), net = put( 'mosquito_net' );
	ok( combo( 'gear_boonie_net', net, boonie ).ok && boonie.id === 'boonie_net', 'a boonie with netting' );
	// a trash bag cut into a poncho; three grocery bags twisted into cord
	const tb = put( 'trash_bag' );
	ok( combo( 'gear_trash_poncho', knife, tb ).ok && tb.id === 'trash_bag_poncho', 'a trash bag poncho' );
	const gb = put( 'grocery_bag', 1 ); put( 'grocery_bag', 1 ); put( 'grocery_bag', 1 );
	const rope0 = has( 'rope' );
	ok( combo( 'gear_plarn', knife, gb ).ok && has( 'rope' ) === rope0 + 1 && ! has( 'grocery_bag' ), 'three plastic bags make a cord' );
	void bottle;
	clearInv();
}

// ---- cases ----------------------------------------------------------------------------------------------------------------
console.log( 'cases' );
{
	const bc = put( 'briefcase' );
	ok( RT.locked( bc ) && verb( bc, 'Force open' ) && ! verb( bc, 'Open' ), 'a briefcase is locked' );
	ok( ! verb( bc, 'Pick lock' ), 'no pick without a lockpick' );
	toasts.length = 0;
	run( bc, 'Force open' );
	ok( toasts.some( t => /Need/.test( t ) ) && RT.locked( bc ), 'forcing it needs a tool' );
	put( 'crowbar' );
	noises.length = 0; opened.length = 0;
	run( bc, 'Force open' );
	ok( ! RT.locked( bc ) && bc.cond < 1 && noises.length === 1 && opened.length === 1 && opened[ 0 ].owner === bc, 'pried open: loud, bent, open next to the inventory' );
	const vol = ( bc.data.items || [] ).reduce( ( v, s ) => v + ( getItem( s.id ).size * ( getItem( s.id ).stack > 1 ? 1 : s.qty ) ), 0 );
	ok( bc.data.opened && vol <= capacityOf( bc ) + 1e-6, `what was inside fits (${bc.data.items?.length} things)` );
	const first = JSON.stringify( bc.data.items );
	ok( verb( bc, 'Open' ) && run( bc, 'Open' ) && JSON.stringify( bc.data.items ) === first, 'opening again rolls nothing new' );
	// a lockpick keeps the lock
	const pc = put( 'pistol_case' ); put( 'lockpick' );
	ok( verb( pc, 'Pick lock' ), 'Pick lock with a lockpick' );
	run( pc, 'Pick lock' );
	ok( ! RT.locked( pc ) && pc.cond === 1 && pc.data.items?.length >= 1, 'picked: a pistol case, its gun inside' );
	ok( pc.data.items.some( s => getItem( s.id ).cat === 'firearm' || getItem( s.id ).cat === 'magazine' || getItem( s.id ).cat === 'ammo' ), 'a gun case holds gun things' );
	// someone's keys: tried once on each case, quiet, and they fit about a third of them
	{
		const keys = put( 'lanyard_keys' );
		let fit = null, miss = null;
		for ( let i = 0; i < 40 && ! ( fit && miss ); i ++ ) { const c = makeStack( 'briefcase', 1 ); if ( L.keyFits( c.uid, keys.uid ) ) fit = fit || c; else miss = miss || c; }
		let n = 0; for ( let i = 0; i < 2000; i ++ ) if ( L.keyFits( 'case' + i, keys.uid ) ) n ++;
		ok( n > 2000 * L.KEY_FIT * 0.8 && n < 2000 * L.KEY_FIT * 1.2, `keys fit about a third of cases (${n} of 2000)` );
		inv.add( fit, { autoEquip: false } ); inv.add( miss, { autoEquip: false } );
		ok( verb( fit, 'Try keys' ) && verb( miss, 'Try keys' ), 'Try keys on locked cases' );
		noises.length = 0; opened.length = 0; toasts.length = 0;
		run( miss, 'Try keys' );
		ok( RT.locked( miss ) && toasts.includes( 'No key fits' ) && ! verb( miss, 'Try keys' ) && verb( miss, 'Force open' ), 'no key fits: not offered again, still forceable' );
		run( fit, 'Try keys' );
		ok( ! RT.locked( fit ) && fit.cond === 1 && noises.length === 0 && opened.some( c => c.owner === fit ), 'a key fits: open, quiet, unharmed' );
		inv.remove( keys ); inv.remove( fit ); inv.remove( miss );
	}
	// an ammo can opens and stashes
	const can = put( 'ammo_can' );
	ok( verb( can, 'Open' ) && ! verb( can, 'Force open' ), 'an ammo can just opens' );
	ok( verb( can, 'Stash' ), 'and can be stashed' );
	clearInv();
}

// ---- wet clothes, bags that tear, the suitcase, camouflage --------------------------------------------------------------
console.log( 'system' );
{
	ok( ! RT.system( game ) && spoilRate( [], 1, 0, game ) === 1 && ! RT.system( game ), 'the spoil hooks are for spoilage only' );
	startSystems( game );
	const sys = RT.system( game );
	ok( sys && game.systems.includes( sys ), 'the gear system starts with the items module (addSystem)' );
	startSystems( game );
	ok( game.systems.filter( s => s === sys ).length === 1, 'once' );
	const tick = ( n = 1, dh = 0 ) => { for ( let i = 0; i < n; i ++ ) { game.time.hours += dh; sys.update( 0.6 ); } };
	// worn clothes are as wet as you are; off you dry a little, the shirt stays wet
	const shirt = makeStack( 'tshirt', 1 );
	inv.equip.torso = shirt;
	S.wet = 1;
	tick();
	ok( shirt.data.wet > 0.9, 'a worn shirt is as wet as you' );
	inv.remove( shirt ); inv.add( shirt, { autoEquip: false } );
	tick();
	ok( shirt.data.wet > 0.9 && S.wet < 0.8, `taken off: the shirt wet (${shirt.data.wet}), you drier (${S.wet.toFixed( 2 )})` );
	// putting a wet one on soaks you
	S.wet = 0;
	inv.remove( shirt ); inv.equip.torso = shirt;
	tick();
	ok( S.wet > 0.8, `a wet shirt on: wet again (${S.wet.toFixed( 2 )})` );
	S.wet = 0;
	inv.remove( shirt ); inv.add( shirt, { autoEquip: false } );
	shirt.data.wet = 1;
	tick();
	// carried, it dries slowly; by a fire fast, or with the verb
	game.world.sky.sunDir.set( 0, - 1, 0 );
	tick( 4, 1 );
	ok( shirt.data.wet > 0.4 && shirt.data.wet < 0.7, `dries slowly in a bag (${shirt.data.wet})` );
	ok( ! verb( shirt, 'Dry' ) && verb( shirt, 'Wring out' ), 'no fire: wring it out' );
	run( shirt, 'Wring out' );
	ok( shirt.data.wet <= 0.3, 'wrung out' );
	shirt.data.wet = 0.9;
	fire = true;
	ok( verb( shirt, 'Dry' ), 'Dry by a fire' );
	run( shirt, 'Dry' );
	ok( ! shirt.data.wet, 'dry' );
	inv.remove( shirt ); inv.equip.torso = shirt;
	S.wet = 0.8; tick();
	ok( verb( shirt, 'Dry by the fire' ), 'worn and wet by a fire: dry off' );
	run( shirt, 'Dry by the fire' );
	ok( S.wet === 0 && ! shirt.data.wet, 'dried off' );
	fire = false;
	game.world.sky.sunDir.set( 0, 1, 0 );
	// a plastic bag overloaded and run with tears, and what was in it falls out
	const gb = makeStack( 'grocery_bag', 1 );
	gb.data.items = [ makeStack( 'rice_bag', 1 ), makeStack( 'canned_beans', 1 ), makeStack( 'water_jug', 1 ) ];
	inv.equip.belt = gb;
	game.player.sprinting = true; game.player.moving = true;
	dropped.length = 0; toasts.length = 0;
	tick( 400 );
	ok( ! inv.equip.belt && dropped.length === 3 && toasts.some( t => /ripped/i.test( t ) ), `the bag tore, ${dropped.length} things fell` );
	game.player.sprinting = false;
	// a light load holds
	const gb2 = makeStack( 'grocery_bag', 1 ); gb2.data.items = [ makeStack( 'candy_bar', 1 ) ];
	inv.equip.belt = gb2; tick( 200 );
	ok( inv.equip.belt === gb2 && gb2.cond === 1, 'a candy bar doesn\'t tear it' );
	// a hit tears it a bit
	gb2.cond = 1; S.health = 100; tick(); S.health = 90; tick();
	ok( gb2.cond < 1, 'a hit nicks a plastic bag' );
	S.health = 100;
	delete inv.equip.belt;
	// the suitcase: slow, no sprinting, the wheels heard
	const sc = makeStack( 'rolling_suitcase', 1 );
	const pack = inv.equip.back;
	inv.equip.back = sc;
	const m = S.moveModifiers();
	ok( m.speed <= 0.86 && m.canSprint === false, `dragging a suitcase: speed ${m.speed}, no sprinting` );
	noises.length = 0;
	game.player.moving = true;
	for ( let i = 0; i < 60; i ++ ) sys.update( 0.1 );
	ok( noises.some( n => n.kind === 'suitcase' && n.radius > 5 ), 'its wheels are heard' );
	game.player.moving = false;
	inv.equip.back = pack;
	ok( S.moveModifiers().canSprint !== false || S.moveModifiers().speed > 0.86, 'without it, back to normal' );
	// camouflage: a ghillie top and hood, versus hi-vis
	inv.equip.torso = makeStack( 'ghillie_suit', 1 ); inv.equip.head = makeStack( 'ghillie_hood', 1 ); inv.equip.legs = makeStack( 'camo_pants', 1 );
	tick();
	const hidden = game.player.camo;
	inv.equip.torso = makeStack( 'tshirt', 1 ); inv.equip.vest = makeStack( 'hivis_vest', 1 ); inv.equip.head = makeStack( 'baseball_cap', 1 );
	tick();
	ok( hidden < 0.8 && game.player.camo > hidden + 0.2, `a ghillie hides you (${hidden.toFixed( 2 )}), hi-vis shows you (${game.player.camo.toFixed( 2 )})` );
	// a dyed shirt counts as its dye
	const blk = makeStack( 'tshirt', 1 ); RT.setLook( blk, 'black' );
	ok( L.wornStats( blk ).vis === L.DYES.black.vis, 'a black-dyed shirt hides like a dark one' );
	for ( const k of [ 'torso', 'vest', 'head', 'legs' ] ) delete inv.equip[ k ];
	tick();
	// a net over the face keeps the mosquitoes off (the outdoors system's protection)
	const out = await import( '../src/game/items/ext/outdoors/runtime.js' );
	const osys = out.attach( game );
	ok( ! osys.protectedNow( game.player.pos ) || out.state( game ).sprayUntil > game.time.hours, 'no net, no protection (nothing sprayed)' );
	inv.equip.head = makeStack( 'beekeeper_veil', 1 );
	ok( osys.protectedNow( game.player.pos ), 'a beekeeper veil keeps them off' );
	ok( osys._sleepLevel() === 0, 'and off you while you sleep in it' );
	delete inv.equip.head;
	ok( osys._sleepLevel() > 0, 'no net, no tent: bitten in the night' );
	// a game whose outdoors system isn't there yet: the gear system brings it in and still wraps it
	{
		const g2 = { ...game, systems: [], register( s ) { this.systems.push( s ); } };
		const gs = RT.attach( g2 ), os2 = out.attach( g2 );
		ok( gs && os2 && g2.systems.includes( os2 ) && g2.systems.filter( x => x === os2 ).length === 1, 'the outdoors system comes in once with the gear system' );
		inv.equip.head = makeStack( 'boonie_net', 1 );
		ok( os2.protectedNow( game.player.pos ), 'a boonie net keeps them off there too' );
		delete inv.equip.head;
	}
}

// ---- the hydration pack, dog tags, recipes, the poncho rig, saving ----------------------------------------------------------
console.log( 'odds and ends' );
{
	clearInv();
	const hp = makeStack( 'hydration_pack', 1 );
	const pack = inv.equip.back;
	inv.equip.back = hp;
	const wb = put( 'water_jug', 1, { liquid: 'water' } );
	ok( C.findCombos( wb, hp ).some( m => m.combo.id === 'pour' ), 'pour water into the hydration pack' );
	K.run( C.getCombo( 'pour' ), wb, hp ); finish();
	ok( hp.data.amount > 2 && hp.data.liquid === 'water', `the bladder holds ${hp.data.amount?.toFixed( 1 )} L` );
	ok( U.actions( hp ).some( a => /^Drink/.test( a.verb ) ), 'drink from it while wearing it' );
	const th = S.thirst; S.thirst = 40;
	run( hp, 'Drink' );
	ok( S.thirst > 40, 'a drink on the move' );
	S.thirst = th;
	inv.equip.back = pack;
	// dog tags mark their unit's post
	const tags = put( 'dog_tags' );
	reveals.length = 0;
	run( tags, 'Read' );
	ok( reveals[ 0 ] === 'military_checkpoint' && toasts.includes( 'Marked on map' ), 'dog tags: their post marked' );
	// recipes: what a needle makes
	game.crafting.recipes = game.crafting.recipes || recipes;
	for ( const id of [ 'gear_drawstring_bag', 'gear_pouch_leather', 'gear_pouch_denim', 'gear_lavalava', 'gear_feather_band', 'gear_scrap_plate' ] ) ok( recipes.some( r => r.id === id ), `recipe ${id}` );
	ok( recipes.filter( r => r.id.startsWith( 'gear_' ) ).every( r => r.in.every( ( [ id ] ) => getItem( id ) ) ), 'gear recipes name real things' );
	// the poncho rigs as a rain catcher (the placeables verb)
	const po = put( 'rain_poncho' );
	ok( U.actions( po ).some( a => a.verb === 'Rig' ), 'a poncho has Rig' );
	// rigged, a dyed poncho keeps its dye (placeables draw the stack's look)
	{
		const FX = await import( '../src/game/items/placeables/fx.js' );
		const dyed = makeStack( 'rain_poncho', 1 ); RT.setLook( dyed, 'black' );
		const p = game.placeables.add( 'collector', dyed, new THREE.Vector3( 3, 0, 3 ), 0, null, 'rain_poncho' );
		ok( FX.placedDef( p )?.model?.color === L.DYES.black.color && FX.placedDef( p ).id === 'rain_poncho~black', 'a rigged black poncho draws black: ' + FX.placedDef( p )?.id );
		let mesh = null;
		try { mesh = game.placeables.buildModel( p ); } catch ( e ) { console.log( e ); }
		// the tarp's colour is baked into its vertex colours: black (near 0), not the poncho's blue
		let blue = false, dark = false;
		mesh?.traverse( ( o ) => { const c = o.geometry?.attributes?.color; if ( c ) for ( let i = 0; i < c.count; i ++ ) { if ( c.getZ( i ) > 0.3 && c.getX( i ) < 0.1 ) blue = true; if ( c.getX( i ) + c.getY( i ) + c.getZ( i ) < 0.05 ) dark = true; } } );
		ok( !! mesh && dark && ! blue, 'and its model builds black, not blue' );
		const plain = game.placeables.add( 'collector', makeStack( 'rain_poncho', 1 ), new THREE.Vector3( 6, 0, 3 ), 0, null, 'rain_poncho' );
		ok( FX.placedDef( plain ) === getItem( 'rain_poncho' ), 'an undyed one draws as itself' );
		game.placeables.remove( p, { give: false } ); game.placeables.remove( plain, { give: false } );
	}
	// a dyed, patched, wet stack survives a save
	const s = makeStack( 'hoodie', 1 ); RT.setLook( s, 'camo' ); L.addMods( s, L.PATCH.leather ); s.data.patches = 1; s.data.wet = 0.4;
	const back = JSON.parse( JSON.stringify( s ) );
	ok( back.data.look.dye === 'camo' && back.data.mods.bite === 0.07 && displayName( back ) === 'Camo hoodie' && L.lookKey( back ) === 'hoodie~camo', 'dye, patches and wetness survive a save' );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
