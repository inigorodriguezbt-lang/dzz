// The leisure domain (Node, no DOM): node test/ext-leisure.mjs
//   every new item: a model, a place to be found (or made), something to do with it; a book and a magazine for every
//   skill; loot rates (rare things rare)
//   the verbs on a stub game with the real ItemUse, Survival, Skills, Actions and Combine: reading (skill books once,
//   fun reads damped on a re-read, the songbook teaching "Play songs"), the ukulele's Play cheering, card games (light,
//   calm), the harmonica's noise, the handheld game's batteries, the puzzle cube, dice, the plush; smoking (needs a
//   light, uses it, a little noise, a fire works), a carton opened, cigarettes rolled, the vape (juice, charge,
//   refill), chewing tobacco; the hip flask (filled from spirits, topped up, drunk down to the empty flask, cleaning a
//   rag as spirits); ʻawa in the koa bowl; keepsakes (Admire once a day, the collection bonus, the catalogue's old
//   souvenirs, a coin flip); surfing only at the shore (an hour passes, wet, tired); a frisbee thrown (lands short of a
//   wall, the infected hear it land); a party popper; a glow bracelet as a light to read by; the travel guide marking
//   sites; keepsakes on display easing boredom (three at most); the sounds render
import * as THREE from 'three';
const warnings = [];
const warn0 = console.warn;
console.warn = ( ...a ) => { warnings.push( a.join( ' ' ) ); };
await import( '../src/game/items/defs/index.js' );
console.warn = warn0;
const C = await import( '../src/game/items/combos.js' );
const { getItem, makeStack, displayName } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, rollLoot, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const { PlayerInventory } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { SKILLS } = await import( '../src/game/Skills.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { LightPool } = await import( '../src/game/items/LightPool.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );
const { getPlaceable } = await import( '../src/game/items/placeables/registry.js' );
const L = await import( '../src/game/items/ext/leisure/logic.js' );
const V = await import( '../src/game/items/ext/leisure/verbs.js' );
const A = await import( '../src/game/items/ext/leisure/admire.js' );
const SND = await import( '../src/game/items/ext/leisure/sounds.js' );
const fs = await import( 'node:fs' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };

const SRC = fs.readFileSync( new URL( '../src/game/items/defs/ext/leisure.js', import.meta.url ), 'utf8' );
const MODELS = fs.readFileSync( new URL( '../src/game/items/models/ext/leisure.js', import.meta.url ), 'utf8' );
const { allItems } = await import( '../src/game/items/ItemDB.js' );
const MINE = allItems().filter( d => d.tags.includes( 'leisure' ) ).map( d => d.id );

// ---- the catalogue ---------------------------------------------------------------------------------------------------
console.log( 'items' );
ok( MINE.length >= 50, `leisure items (${MINE.length})` );
// the boards are big: a surfboard fills most of a hiking pack, two don't fit a military one; a bodyboard is half that
{
	const sb = getItem( 'surfboard' ).size, bb = getItem( 'bodyboard' ).size;
	ok( sb <= getItem( 'backpack_hiking' ).backpack.capacity && sb * 2 > getItem( 'backpack_military' ).backpack.capacity && bb >= sb * 0.4 && bb < sb, `board sizes (${sb}, ${bb})` );
}
ok( ! warnings.some( w => /duplicate|no table/.test( w ) ), 'no duplicate ids or missing tables: ' + warnings.join( '; ' ) );
const MENU_ONLY = new Set( [ 'car_trunk', 'car_glovebox' ] );
const visible = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( MENU_ONLY.has( name ) || name.startsWith( 'zombie_' ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
const MADE = new Set( [ 'hip_flask_full', 'kava_koa' ] );
const comboIds = new Set( C.allCombos().flatMap( c => C.comboIds( c ) ) );
const recipeIds = new Set( allRecipes().flatMap( r => [ r.out[ 0 ], ...r.in.map( i => i[ 0 ] ) ] ) );
const VERBS = [ 'admire', 'toy', 'smoke', 'ride', 'throwToy', 'puzzle', 'dice', 'flip', 'pop', 'glow', 'unbox', 'sights', 'read', 'drink', 'place' ];
for ( const id of MINE ) {
	const d = getItem( id );
	ok( d.model?.type && ( d.model.type.startsWith( 'leis_' ) ? MODELS.includes( `reg( '${d.model.type}'` ) : true ), `${id}: a model (${d.model?.type})` );
	ok( d.desc.length > 0 && d.desc.length <= 40, `${id}: a short desc (${d.desc.length})` );
	ok( visible.has( id ) || MADE.has( id ), `${id}: lies somewhere you can see it, or is made` );
	if ( MADE.has( id ) ) ok( comboIds.has( id ) || ( SRC.match( new RegExp( `'${id}'`, 'g' ) ) || [] ).length > 1, `${id}: made by a mix` );
	const does = VERBS.some( k => d[ k ] ) || comboIds.has( id ) || recipeIds.has( id ) || [ 'vape', 'chew', 'papers', 'tobacco', 'watch' ].includes( d.tool?.kind );
	ok( does, `${id}: does something` );
	ok( ! /[A-Z]{2,}/.test( d.name ) || /^[A-Z]/.test( d.name ), `${id}: a plain name` );
}
// a book and a magazine for every skill
for ( const sk of SKILLS ) {
	const reads = allItems().filter( d => ( d.read?.skill === sk || d.book?.skill === sk ) && d.cat === 'book' );
	ok( reads.length >= 2, `${sk}: a book and a magazine (${reads.map( d => d.id ).join( ', ' )})` );
	ok( reads.some( d => d.tags.includes( 'magazine' ) ), `${sk}: a magazine` );
}
for ( const r of allRecipes().filter( r => r.id.startsWith( 'leis_' ) ) ) ok( getItem( r.out[ 0 ] ) && r.in.every( ( [ i ] ) => getItem( i ) ), `recipe ${r.id}: real ids` );
ok( allRecipes().some( r => r.id === 'leis_konane' ) && allRecipes().some( r => r.id === 'leis_bone_dice' ), 'recipes: a kōnane board, bone dice' );
ok( !! getPlaceable( 'leisure_decor' ), 'the display kind is registered' );
ok( getItem( 'kava_powder' ), 'the pharmacy\'s ʻawa powder exists (the koa bowl mix)' );

// loot: a living room has games and books, a convenience store smokes and magazines, a pawn shop valuables
{
	let rnd = 11;
	const R = () => { rnd = ( rnd * 16807 ) % 2147483647; return rnd / 2147483647; };
	const set = new Set( MINE );
	const share = ( table, n ) => { let k = 0, all = 0; for ( let i = 0; i < n; i ++ ) for ( const s of rollLoot( table, R ) ) { all ++; if ( set.has( s.id ) ) k ++; } return k / Math.max( 1, all ); };
	const rates = {};
	for ( const t of [ 'house_living', 'house_bedroom', 'hotel_room', 'school', 'office', 'convenience', 'gas_station', 'pawn', 'bar', 'surf', 'site_beach_camp', 'site_picnic', 'site_body', 'hardware', 'grocery', 'pharmacy' ] ) rates[ t ] = share( t, 600 );
	console.log( '   shares: ' + Object.entries( rates ).map( ( [ k, v ] ) => `${k} ${( v * 100 ).toFixed( 0 )}%` ).join( ', ' ) );
	for ( const t of [ 'house_living', 'convenience', 'pawn', 'school', 'site_beach_camp', 'site_picnic' ] ) ok( rates[ t ] > 0.08 && rates[ t ] < 0.35, `${t}: leisure finds, not a flood (${( rates[ t ] * 100 ).toFixed( 0 )}%)` );
	ok( rates.hardware < 0.08 && rates.grocery < 0.03 && rates.pharmacy < 0.03, 'a hardware store, a grocery, a pharmacy: little or none' );
	let lux = 0, rolls = 0;
	for ( const t of [ 'pawn', 'house_bedroom', 'hotel_room', 'site_roadside' ] ) for ( let i = 0; i < 500; i ++ ) for ( const s of rollLoot( t, R ) ) { rolls ++; if ( s.id === 'luxury_watch' ) lux ++; }
	ok( lux > 0 && lux / rolls < 0.01, `the luxury watch is rare (${lux} in ${rolls})` );
}

// ---- a stub game (as test/ext-pharmacy.mjs) ------------------------------------------------------------------------
console.log( 'stub game' );
const toasts = [], noises = [], spawned = [], revealed = [];
const sky = { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0, moonPhase: 0.3 };
const zombies = [];
let wallT = null, decor = [];
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return Math.floor( this.time.hours / 24 ); },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {}, playTime: 0,
	events: new Events(), audio: { play() { return null; }, loop() { return null; }, buffers: new Map() },
	interact: { addProvider() { return () => {}; } }, settings: { get: () => true }, input: { pressed: () => false },
	world: { isIndoors: () => false, isBeach: () => false, sky, handVis: 1 }, weather: { rain: 0, cover: 0.3 },
	hf: { heightAt: () => 0.5, flagsNear: () => 32, surfaceAt: ( x, z, o ) => { o[ 0 ] = 0.6; o[ 1 ] = 0; o[ 2 ] = 0; o[ 3 ] = 0; return o; }, normalAt: ( x, z, n ) => n.set( 0, 1, 0 ) },
	physics: { waterLevel: () => 0, lineOfSight: () => true, raycast: () => wallT == null ? null : { t: wallT }, ground: () => ( { y: 0.5, box: null } ) },
	entities: { near: ( p, r ) => zombies.filter( z => z.pos.distanceTo( p ) <= r ) },
	player: { pos: new THREE.Vector3( 0, 0.5, 0 ), eye: 2.1, yaw: 0, stanceH: 1.6, shake: 0, stance: 'stand', moving: false, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
	toast: ( t ) => toasts.push( t ), dropStack: () => {}, inputActive: true, onPlayerDeath() {},
	items3d: { near: () => [], byStack: () => null, remove: () => false, claim: ( w ) => w, refresh() {}, items: [], spawn: ( s, pos ) => { spawned.push( { s, pos: pos.clone() } ); return { stack: s, pos }; } },
	sites: { reveal: ( kind ) => { revealed.push( kind ); return { kind }; } },
	placeables: { near: ( pos, r, kind ) => decor.filter( p => ( ! kind || p.kind === kind ) && Math.hypot( p.pos.x - pos.x, p.pos.z - pos.z ) <= r ) },
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
const inv = game.player.inventory, S = game.survival, U = game.itemUse, p = game.player, SK = game.skills;
inv.equip.back = makeStack( 'backpack_hiking', 1 );
const finish = () => game.actions.update( 999 );
const put = ( id, q = 1 ) => { const st = makeStack( id, q ); inv.add( st, { autoEquip: false } ); return st; };
const find = ( id ) => inv.find( ( s ) => s.id === id );
const has = ( id ) => inv.count( id );
const run = ( id, a, b ) => { const r = KB.run( C.getCombo( id ), a, b ); finish(); return r; };
const verb = ( s, v ) => U.actions( s ).find( x => x.verb === v );
const act = ( s, v ) => { const x = verb( s, v ); ok( !! x, `${s.id}: "${v}" offered (${U.actions( s ).map( a => a.verb ).join( ', ' )})` ); if ( x ) { x.run(); finish(); } return !! x; };
function fresh() {
	for ( const s of [ ...inv.allStacks() ] ) if ( s !== inv.equip.back ) inv.remove( s );
	S.reset(); S.thirst = 90; S.hunger = 90; S.energy = 80;
	Object.assign( p, { swimming: false, underwater: false, moving: false, vehicle: null } );
	p.pos.set( 0, 0.5, 0 ); p.yaw = 0;
	sky.night = 0; game.time.hours = 100; fire = false; wallT = null; decor = [];
	delete game.hf.baseHeight;
	U.funT = {};
	toasts.length = 0; noises.length = 0; zombies.length = 0; spawned.length = 0; revealed.length = 0;
}
const bored = ( v = 60 ) => { S.boredom = v; S.unhappy = v; S.stress = v; };

// ---- reading ---------------------------------------------------------------------------------------------------------------
console.log( 'reading' );
{
	fresh();
	const cb = put( 'cookbook' );
	ok( U.actions( cb )[ 0 ].verb === 'Read', 'a skill book: Read is the default' );
	U.read( cb ); finish();
	ok( SK.total( 'cooking' ) >= 159 && SK.level( 'cooking' ) >= 1, `the cookbook: cooking practice (${SK.total( 'cooking' )} xp, level ${SK.level( 'cooking' )})` );
	ok( game.time.hours > 101.9, 'two hours went by' );
	ok( ! verb( cb, 'Read' ), 'read once: no more Read' );
	const mg = put( 'mag_stealth' );
	U.read( mg ); finish();
	ok( SK.total( 'stealth' ) >= 54 && SK.total( 'stealth' ) < 75, `a magazine: a little stealth (${SK.total( 'stealth' )})` );

	bored();
	const nv = put( 'novel_romance' );
	U.read( nv ); finish();
	const b1 = 60 - S.boredom;
	ok( b1 >= 40 && S.unhappy < 50, `a novel eases boredom a lot (${b1.toFixed( 1 )}) and gloom` );
	ok( !! verb( nv, 'Read' ), 'a novel can be read again' );
	S.boredom = 60; game.playTime += 60;
	U.read( nv ); finish();
	ok( 60 - S.boredom < b1 * 0.3, `read again straight away: much less (${( 60 - S.boredom ).toFixed( 1 )})` );
}

// ---- the songbook, the ukulele, the harmonica -------------------------------------------------------------------------------
console.log( 'music' );
{
	fresh(); bored();
	const uke = put( 'ukulele' );
	ok( ! verb( uke, 'Play songs' ), 'no songs before the songbook' );
	act( uke, 'Play' );
	const strum = 60 - S.boredom;
	ok( strum >= 15, `the ukulele's Play cheers (${strum.toFixed( 1 )})` );
	const sb = put( 'songbook' );
	U.read( sb ); finish();
	ok( SK.knows( 'songs' ) && toasts.some( t => /Learned/.test( t ) ), 'the songbook teaches songs' );
	ok( toasts.includes( 'Learned: songs' ), 'in plain words: ' + toasts.find( t => /Learned/.test( t ) ) );
	S.boredom = 60; game.playTime += 1000; noises.length = 0;
	act( uke, 'Play songs' );
	ok( 60 - S.boredom > strum * 1.4, `songs lift more than strumming (${( 60 - S.boredom ).toFixed( 1 )})` );
	ok( noises.some( n => n.radius === 45 ), 'and the infected hear it' );
	const hp = put( 'harmonica' );
	S.boredom = 60; noises.length = 0;
	act( hp, 'Play' );
	ok( S.boredom < 50 && noises.some( n => n.radius === 30 ), 'the harmonica: a lift, heard 30 m off' );
	ok( !! verb( hp, 'Play songs' ), 'the harmonica plays songs too' );
}

// ---- games and toys ---------------------------------------------------------------------------------------------------------
console.log( 'games' );
{
	fresh(); bored();
	const pc = put( 'playing_cards' );
	sky.night = 1;
	toasts.length = 0; verb( pc, 'Play solitaire' ).run(); finish();
	ok( toasts.includes( 'Too dark' ) && S.boredom === 60, 'cards in the dark: refused' );
	sky.night = 0;
	zombies.push( { pos: new THREE.Vector3( 4, 0, 0 ), alive: true, target: p } );
	toasts.length = 0; verb( pc, 'Play solitaire' ).run(); finish();
	ok( toasts.includes( 'Not now' ), 'with the infected after you: refused' );
	zombies.length = 0;
	act( pc, 'Play solitaire' );
	ok( S.boredom < 50, `solitaire passes the time (${S.boredom.toFixed( 1 )})` );

	const hg = put( 'handheld_game' );
	hg.data.charge = 6;
	S.boredom = 60;
	act( hg, 'Play' );
	ok( S.boredom < 40 && Math.abs( hg.data.charge - 5.5 ) < 1e-6, `the handheld: a big lift, half an hour of its cells (${hg.data.charge})` );
	hg.data.charge = 0.1;
	toasts.length = 0; verb( hg, 'Play' ).run(); finish();
	ok( toasts.includes( 'Batteries dead' ), 'flat cells: refused' );
	put( 'batteries', 2 );
	ok( run( 'insert_batteries', find( 'batteries' ), hg ) && hg.data.charge === 6, 'AA cells into the handheld (the base combo)' );

	const cube = put( 'puzzle_cube' );
	S.boredom = 60;
	act( cube, 'Solve' );
	ok( cube.data.solved && toasts.includes( 'Solved' ) && S.boredom < 45, 'the cube solved: a lift' );
	ok( ! verb( cube, 'Solve' ) && !! verb( cube, 'Scramble' ), 'solved: only Scramble' );
	act( cube, 'Scramble' );
	ok( ! cube.data.solved && !! verb( cube, 'Solve' ), 'scrambled again' );

	const dc = put( 'dice' );
	toasts.length = 0;
	const r = V.rollDice( game, getItem( 'dice' ), () => 0.99 );
	ok( r[ 0 ] === 6 && r[ 1 ] === 6 && toasts.includes( 'Double 6' ), 'double six' );
	ok( !! verb( dc, 'Roll' ), 'dice: Roll' );

	const hon = put( 'plush_honu' );
	S.panic = 40; S.stress = 50;
	act( hon, 'Hug' );
	ok( S.panic <= 25 && S.stress < 50, `a hug calms (${S.panic}, ${S.stress})` );
	const kb = put( 'konane_board' );
	S.boredom = 60;
	act( kb, 'Play kōnane' );
	ok( S.boredom < 45, 'kōnane' );
}

// ---- smoking and the rest -------------------------------------------------------------------------------------------------
console.log( 'vices' );
{
	fresh(); S.stress = 60;
	const pk = put( 'cigarettes' );
	ok( verb( pk, 'Smoke' )?.note === '20/20', 'a fresh pack: 20/20' );
	toasts.length = 0; verb( pk, 'Smoke' ).run(); finish();
	ok( toasts.includes( 'Need a lighter or matches' ) && S.stress === 60, 'no light: refused' );
	const lt = put( 'lighter' );
	noises.length = 0;
	act( pk, 'Smoke' );
	ok( S.stress < 50 && pk.data.uses === 19 && lt.data.uses === 119, `a smoke: calmer, one cigarette and one use of the lighter (${S.stress}, ${pk.data.uses}, ${lt.data.uses})` );
	ok( noises.some( n => n.radius === 5 && n.kind === 'smoke' ), 'a little noise' );
	// chain smoking calms less
	S.stress = 60; game.playTime += 10;
	act( pk, 'Smoke' );
	ok( 60 - S.stress < 4, `straight after: hardly calmer (${( 60 - S.stress ).toFixed( 1 )})` );
	// a fire lights it without the lighter
	inv.remove( lt ); fire = true; S.stress = 60; game.playTime += 1000;
	const cg = put( 'cigar', 2 );
	act( cg, 'Smoke' );
	ok( S.stress < 45 && cg.qty === 1, 'a cigar off the fire: calmer, one cigar gone' );
	fire = false;
	// a carton opens into ten packs
	const ct = put( 'cigarette_carton' );
	act( ct, 'Open' );
	ok( ! has( 'cigarette_carton' ) && has( 'cigarettes' ) === 11, `the carton: ten packs (${has( 'cigarettes' )})` );
	// rolling your own
	const pp = put( 'rolling_papers' ), tb = put( 'tobacco_pouch' );
	ok( run( 'leis_roll_cigarette', pp, tb ) && has( 'rolled_cigarette' ) === 1 && pp.data.uses === 31 && tb.data.uses === 14, 'tobacco and papers: a rolled cigarette' );
	// a match dragged onto a cigar lights it up
	const mt = put( 'matches' );
	S.stress = 60; game.playTime += 1000;
	ok( run( 'leis_light_up', mt, cg ) && S.stress < 45 && ! has( 'cigar' ) && mt.data.uses === 19, 'a match onto the cigar: lit and smoked' );
	// the vape: juice and charge, a refill
	const vp = put( 'vape' );
	vp.data.charge = 4; S.stress = 60; game.playTime += 1000;
	act( vp, 'Vape' );
	ok( S.stress < 55 && vp.data.juice === 19 && vp.data.charge === 3.75, `a puff: juice and charge (${vp.data.juice}, ${vp.data.charge})` );
	const vj = put( 'vape_juice' );
	ok( KB.state( C.getCombo( 'leis_refill_vape' ), vj, vp ).ok, 'a part-empty vape takes a refill' );
	vp.data.juice = 0;
	toasts.length = 0; verb( vp, 'Vape' ).run(); finish();
	ok( toasts.includes( 'Tank empty' ), 'empty: refused' );
	ok( run( 'leis_refill_vape', vj, vp ) && vp.data.juice === L.VAPE_TANK && ! has( 'vape_juice' ), 'refilled' );
	ok( KB.state( C.getCombo( 'leis_refill_vape' ), put( 'vape_juice' ), vp ).soft, 'a full vape: not offered' );
	const ch = put( 'chewing_tobacco' );
	S.stress = 60; game.playTime += 1000;
	act( ch, 'Chew' );
	ok( S.stress < 55 && ch.data.uses === 14 && ! noises.some( n => n.kind === 'chew' ), 'a chew: calmer, silent' );
}

// ---- the hip flask -------------------------------------------------------------------------------------------------------
console.log( 'flask' );
{
	fresh();
	const fl = put( 'hip_flask' ), rum = put( 'rum' );
	ok( run( 'leis_fill_flask', rum, fl ), 'fill the flask from rum' );
	const full = find( 'hip_flask_full' );
	ok( full && ( full.data.left ?? 4 ) === 4 && displayName( full ) === 'Flask (dark rum)', `a full flask (${full && displayName( full )})` );
	ok( has( 'empty_bottle' ) === 1 && ! has( 'rum' ), 'the four shots of rum: the empty bottle stays' );
	ok( KB.state( C.getCombo( 'leis_fill_flask' ), put( 'whiskey' ), full ).soft, 'a full flask: not offered' );
	U.drinkItem( full ); finish();
	ok( full.data.left === 3 && S.drunk > 0, 'a nip' );
	ok( run( 'leis_fill_flask', find( 'whiskey' ), full ) && full.data.left === 4 && find( 'whiskey' ).data.left === 3, 'topped up from whiskey: one shot' );
	// a metal flask is no molotov bottle (the base combo takes a strong spirit whole); a bottle of rum still is
	const rags = put( 'rags' );
	ok( ! KB.find( rags, full ).some( m => m.combo.id === 'molotov_spirit' ) && ! KB.partners( rags ).some( p => p.combo.id === 'molotov_spirit' && p.other === full ), 'no molotov from the flask' );
	ok( KB.find( rags, makeStack( 'whiskey' ) ).some( m => m.combo.id === 'molotov_spirit' ), 'a bottle of whiskey still makes one' );
	inv.remove( rags );
	// the flask counts as spirits: it cleans a rag
	const rag = put( 'bandage_rag' );
	ok( run( 'disinfect_rag', full, rag ) && has( 'bandage' ) === 1 && full.data.left === 3, 'a shot from the flask makes a sterile bandage' );
	for ( let i = 0; i < 3; i ++ ) { U.drinkItem( find( 'hip_flask_full' ) ); finish(); }
	ok( ! has( 'hip_flask_full' ) && has( 'hip_flask' ) === 1 && ! displayName( find( 'hip_flask' ) ).includes( 'rum' ), 'drunk dry: the empty flask' );
	// coconut rum carries the spirit tag
	ok( C.findCombos( makeStack( 'coconut_rum' ), find( 'hip_flask' ) ).some( m => m.combo.id === 'leis_fill_flask' ), 'any spirit fills it (coconut rum)' );
	ok( ! C.findCombos( makeStack( 'beer_can' ), find( 'hip_flask' ) ).some( m => m.combo.id === 'leis_fill_flask' ), 'not beer' );
}

// ---- ʻawa in the koa bowl ------------------------------------------------------------------------------------------------------
console.log( 'koa bowl' );
{
	fresh();
	const kb = put( 'koa_bowl' ), kp = put( 'kava_powder' ), wb = put( 'water_bottle' );
	wb.data.liquid = 'water'; wb.data.amount = 0.5;
	ok( run( 'leis_koa_kava', kp, kb ) && find( 'kava_koa' ) && wb.data.amount < 0.21, 'ʻawa mixed in the koa bowl' );
	S.stress = 60;
	U.drinkItem( find( 'kava_koa' ) ); finish();
	ok( S.stress <= 30 && has( 'koa_bowl' ) === 1, `drunk: calm, the bowl stays (${S.stress})` );
}

// ---- keepsakes -------------------------------------------------------------------------------------------------------------------
console.log( 'keepsakes' );
{
	fresh(); bored();
	const sg = put( 'snow_globe' );
	act( sg, 'Shake' );
	const d1 = 60 - S.boredom;
	ok( d1 >= 9.9 && d1 < 10.1, `a snow globe shaken: a lift (${d1.toFixed( 2 )})` );
	S.boredom = 60; game.playTime += 30; toasts.length = 0;
	act( sg, 'Shake' );
	ok( 60 - S.boredom < 2 && toasts.includes( 'Seen it today' ), 'again the same day: little, "Seen it today"' );
	game.playTime += L.daySeconds( game ); S.boredom = 60;
	act( sg, 'Shake' );
	ok( 60 - S.boredom > 9.9, 'a day later: the full lift again' );
	// a collection: three kinds carried
	put( 'surf_trophy' ); put( 'gold_coin' );
	ok( A.collectionKinds( game ) === 3 && Math.abs( L.collectionK( 3 ) - 1.2 ) < 1e-9, 'three kinds: a fifth more' );
	const tr = find( 'surf_trophy' );
	S.boredom = 60;
	act( tr, 'Admire' );
	ok( Math.abs( ( 60 - S.boredom ) - 8 * 1.2 ) < 0.05, `the trophy admired with a collection (${( 60 - S.boredom ).toFixed( 2 )})` );
	// the catalogue's old souvenirs join in
	const tk = put( 'tiki' );
	ok( !! verb( tk, 'Admire' ) && A.collectionKinds( game ) === 4, 'the tiki can be admired and counts' );
	// a coin flip
	toasts.length = 0;
	act( find( 'gold_coin' ), 'Flip' );
	ok( toasts.some( t => t === 'Heads' || t === 'Tails' ), 'a gold coin flips' );
	// watches still tell the time
	const lw = put( 'luxury_watch' );
	ok( !! verb( lw, 'Check time' ) && !! verb( lw, 'Admire' ), 'the luxury watch: Check time and Admire' );
	// a double-click admires a keepsake (not Display); a watch still tells the time first
	ok( U.actions( sg )[ 0 ].verb === 'Shake' && U.actions( tr )[ 0 ].verb === 'Admire' && U.actions( lw )[ 0 ].verb === 'Check time', `defaults: ${U.actions( tr ).map( a => a.verb ).join( ', ' )}` );
	ok( getItem( 'duke_poster' ).place?.kind === 'leisure_decor' && ! getItem( 'whale_tooth_pendant' ).place, 'posters go on display, a pendant does not' );
}

// ---- keepsakes on display ---------------------------------------------------------------------------------------------------------
console.log( 'display' );
{
	fresh(); S.boredom = 50; S.unhappy = 50;
	const K = getPlaceable( 'leisure_decor' );
	const mk = ( item, x ) => ( { id: 'd' + x, kind: 'leisure_decor', item, pos: { x, y: 0.5, z: 0 }, stack: makeStack( item ), data: {} } );
	decor = [ mk( 'snow_globe', 1 ), mk( 'surf_trophy', 2 ), mk( 'duke_poster', 3 ), mk( 'koa_bowl', 4 ), mk( 'hula_figure', 5 ) ];
	for ( let i = 0; i < 60; i ++ ) for ( const d of decor ) K.update( d, 1, game, 0 );
	ok( Math.abs( ( 50 - S.boredom ) - 3 * - L.DECOR.boredom ) < 0.01 && S.unhappy < 50, `a minute among five pieces: three count (${( 50 - S.boredom ).toFixed( 2 )})` );
	S.boredom = 50; p.pos.set( 40, 0.5, 0 );
	for ( let i = 0; i < 60; i ++ ) for ( const d of decor ) K.update( d, 1, game, 0 );
	ok( S.boredom === 50, 'far off: nothing' );
	// sitting about indoors with three pieces out: bored more slowly, not cured
	ok( 3 * - L.DECOR.boredom < 1.55 * 0.8, 'a display slows boredom, it doesn\'t stop it' );
	// a game without the placeables' near(): the one piece counts
	p.pos.set( 0, 0.5, 0 ); S.boredom = 50;
	const noNear = { ...game, placeables: {} };
	for ( let i = 0; i < 60; i ++ ) K.update( decor[ 0 ], 1, noNear, 0 );
	ok( Math.abs( ( 50 - S.boredom ) + L.DECOR.boredom ) < 0.01, `without near(): one piece (${( 50 - S.boredom ).toFixed( 2 )})` );
	p.pos.set( 0, 0.5, 0 );
	ok( A.collectionKinds( game ) === 5, 'pieces on display count towards the collection' );
	const acts = K.actions( decor[ 0 ], { ...game, placeables: { ...game.placeables, pickUpAction: () => ( { label: 'Pick up', run() {} } ) } } );
	ok( acts[ 0 ].label === 'Shake' && acts[ 1 ].label === 'Pick up', 'F on a display: its verb, Pick up' );
}

// ---- the shore ---------------------------------------------------------------------------------------------------------------------
console.log( 'surfing' );
{
	fresh(); bored();
	const sb = put( 'surfboard' );
	toasts.length = 0; verb( sb, 'Surf' ).run(); finish();
	ok( toasts.includes( 'At the shore only' ) && S.boredom === 60, 'inland: refused' );
	game.hf.baseHeight = ( x ) => x > 5 ? - 2 : 0.5;
	ok( L.atShore( game ), 'at the water\'s edge' );
	p.pos.y = 30; ok( ! L.atShore( game ), 'up on a cliff: no' ); p.pos.y = 0.5;
	const h0 = game.time.hours, st0 = S.stamina;
	act( sb, 'Surf' );
	ok( S.boredom <= 10 && S.unhappy <= 36 && game.time.hours - h0 >= 0.99, `a surf: an hour, a big lift (${S.boredom}, ${S.unhappy})` );
	ok( S.wet === 1 && S.stamina < st0 && sb.cond < 1, 'wet, tired, a little wear on the board' );
	sky.night = 1; toasts.length = 0; verb( sb, 'Surf' ).run(); finish();
	ok( toasts.includes( 'Too dark' ), 'not at night' );
	sky.night = 0;
	inv.remove( sb ); // (two boards don't fit one pack)
	const bb = put( 'bodyboard' );
	S.boredom = 60; game.playTime += 5000; S.stamina = 100;
	act( bb, 'Bodyboard' );
	ok( S.boredom < 35 && S.boredom > 25, `a bodyboard: less (${S.boredom})` );
}

// ---- throwing --------------------------------------------------------------------------------------------------------------------
console.log( 'throwing' );
{
	fresh();
	const fb = put( 'frisbee' );
	const at = V.throwToy( game, fb, getItem( 'frisbee' ) );
	ok( ! has( 'frisbee' ) && spawned.length === 1 && spawned[ 0 ].s.id === 'frisbee', 'the frisbee leaves your hands for the world' );
	ok( Math.abs( at.z + 16 ) < 0.01 && noises.some( n => n.radius === 22 && n.kind === 'thud' && Math.abs( n.pos.z + 16 ) < 0.01 ), 'it lands 16 m ahead, and the infected hear it there' );
	const bs = put( 'signed_baseball' );
	wallT = 5; noises.length = 0;
	const at2 = V.throwToy( game, bs, getItem( 'signed_baseball' ) );
	ok( Math.abs( at2.z + 4.6 ) < 0.01 && noises[ 0 ]?.radius === 16, `a ball thrown at a wall lands short of it (${at2.z.toFixed( 2 )})` );
	ok( !! verb( put( 'frisbee' ), 'Throw' ), 'Throw in the menu' );
}

// ---- seasonal, the travel guide --------------------------------------------------------------------------------------------------
console.log( 'odds and ends' );
{
	fresh(); bored();
	const pp = put( 'party_popper', 3 );
	act( pp, 'Pop' );
	ok( pp.qty === 2 && noises.some( n => n.radius === 14 ) && S.boredom < 60, 'a popper: bang, a little fun, one fewer' );
	const gb = put( 'glow_bracelet', 2 );
	sky.night = 1;
	ok( ! U.canSee(), 'dark: no light to read by' );
	act( gb, 'Put on' );
	const on = inv.find( ( s ) => s.id === 'glow_bracelet' && s.data.on );
	ok( on && on.data.charge === 6 && U.lightNear() && U.canSee(), 'a glow bracelet on: a light to read by' );
	sky.night = 0;
	const tg = put( 'travel_guide' );
	act( tg, 'Mark sights' );
	ok( revealed.includes( 'farm_stand' ) && revealed.includes( 'beach_camp' ) && toasts.includes( 'Marked on map' ) && tg.data.marked, 'the travel guide marks a fruit stand and a beach' );
	ok( ! verb( tg, 'Mark sights' ) && !! verb( tg, 'Read' ), 'once: then just a read' );
}

// ---- sounds --------------------------------------------------------------------------------------------------------------------------
console.log( 'sounds' );
{
	const all = SND.renderAll( 8000 );
	for ( const [ k, a ] of Object.entries( all ) ) ok( a.length > 100 && a.every( Number.isFinite ) && Math.max( ...a.map( Math.abs ) ) <= 1, `${k} renders` );
	ok( Object.keys( all ).length >= 10, 'ten sounds' );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
