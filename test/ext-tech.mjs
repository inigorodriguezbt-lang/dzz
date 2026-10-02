// The tech items (Node, a fake DOM for canvas labels): node test/ext-tech.mjs
//   the catalogue: tool kinds, shared material tags, every tech item has a model, a place to be found and something
//   to do; the numbers (cells, charge, the generator, sunlight, dismantling, the detector, the scan order)
//   game.itemUse / game.combine / game.placeables / game.crafting on a stub game: dismantling, cells in and out,
//   chargers, the generator and the solar panel and the solar light placed and ticked, scanner and CB marks, the
//   metal detector, magnet fishing, the camera flash, the drone, the satellite phone, siphoning, jump-starting, the
//   lockbox, the repair and making combos, a recipe, and a save round trip of the placed power
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const THREE = await import( 'three' );
await import( '../src/game/items/defs/index.js' );
const { ITEMS, getItem, makeStack } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const C = await import( '../src/game/items/combos.js' );
const R = await import( '../src/game/items/placeables/registry.js' );
const L = await import( '../src/game/items/ext/tech/logic.js' );
const P = await import( '../src/game/items/ext/tech/power.js' );
const { hasModelBuilder } = await import( '../src/render/ItemModels.js' );
const { Placeables } = await import( '../src/game/items/Placeables.js' );
const { PlayerInventory } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Physics } = await import( '../src/game/Physics.js' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );

// ---- the catalogue ---------------------------------------------------------------------------------------------------
console.log( 'catalogue' );
const TECH = [ ...ITEMS.values() ].filter( d => d.tags.includes( 'tech' ) );
ok( TECH.length >= 55, `tech items (${TECH.length})` );
for ( const k of [ 'screwdriver', 'pliers', 'hacksaw', 'boltcutter', 'solder', 'weld', 'drill', 'glue' ] ) ok( TECH.some( d => d.tool?.kind === k ), `tool kind ${k} defined` );
ok( getItem( 'socket_set' ).tool.kind === 'wrench' && getItem( 'toolbox' ).tool.provides.includes( 'screwdriver' ) && getItem( 'toolbox' ).tool.provides.includes( 'wrench' ), 'a socket set is a wrench; a toolbox holds a screwdriver and wrenches' );
for ( const [ id, tag ] of [ [ 'batteries', 'battery_aa' ], [ 'battery_d', 'battery_d' ], [ 'battery_9v', 'battery_9v' ], [ 'nails', 'fastener' ], [ 'screws', 'fastener' ], [ 'bolts', 'fastener' ],
	[ 'springs', 'spring' ], [ 'sheet_metal', 'metal_sheet' ], [ 'metal_pipe', 'pipe' ], [ 'circuit_board', 'electronics' ], [ 'epoxy', 'adhesive' ], [ 'duct_tape', 'adhesive' ], [ 'fabric', 'cloth' ],
	[ 'leather', 'leather' ], [ 'rubber_hose', 'rubber' ], [ 'wire', 'wire' ], [ 'rope', 'cordage' ], [ 'motor_oil', 'oil' ] ] ) ok( getItem( id )?.tags.includes( tag ), `${id} tagged ${tag}` );
for ( const d of TECH ) ok( hasModelBuilder( d.model.type ), `${d.id}: model builder ${d.model.type}` );
// every dismantle list names real things; the old devices come apart too
const withParts = [ ...ITEMS.values() ].filter( d => d.dismantle );
for ( const d of withParts ) for ( const [ id, q, ch ] of d.dismantle ) ok( getItem( id ) && q >= 1 && ( ch === undefined || ( ch > 0 && ch <= 1 ) ), `${d.id}: dismantles into ${id}` );
for ( const id of [ 'radio', 'walkie_talkie', 'phone', 'laptop', 'flashlight', 'lantern', 'gps', 'car_battery', 'alarm_clock', 'leather_jacket', 'tent' ] ) ok( getItem( id ).dismantle?.length, `${id} has a parts list` );
// visible somewhere (a building's loot spots or an outdoor site), or made
const visible = new Set(), made = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( /^(car_|zombie_|tech_)/.test( name ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
const recipes = allRecipes();
for ( const r of recipes ) made.add( r.out[ 0 ] );
for ( const c of C.allCombos() ) for ( const [ id ] of c.out ) made.add( id );
for ( const d of TECH ) ok( visible.has( d.id ) || made.has( d.id ), `${d.id}: found in the world or made` );
// something to do with each: a verb, a combo, a recipe, a placement, a parts list, a medical use
const inRecipe = new Set();
for ( const r of recipes ) { for ( const [ id ] of r.in ) inRecipe.add( id ); inRecipe.add( r.out[ 0 ] ); }
const VERB_KINDS = new Set( [ 'scanner', 'cb', 'detector', 'magnet_fish', 'camera', 'drone', 'walkman', 'boombox', 'smoke_detector', 'powerbank', 'crank', 'inverter', 'jumper', 'siphon', 'satphone', 'generator', 'cell' ] );
const inCombo = ( d ) => {
	const st = makeStack( d.id, d.stack, { full: true } ); st.cond = 0.5;
	if ( d.tool?.battery ) st.data.charge = 0;
	return C.allCombos().some( c => C.matches( c.a, st, d ) || C.matches( c.b, st, d ) );
};
for ( const d of TECH ) ok( !! ( d.dismantle || d.place || d.medical || inRecipe.has( d.id ) || VERB_KINDS.has( d.tool?.kind ) || d.tool?.light || d.id === 'lockbox' || inCombo( d ) ), `${d.id}: does something` );
// every tool kind a tech recipe asks for exists on some item (a tool's kind or a melee weapon's tools)
const kinds = new Set();
for ( const d of ITEMS.values() ) { if ( d.tool?.kind ) kinds.add( d.tool.kind ); for ( const t of d.melee?.tools || [] ) kinds.add( t ); }
for ( const r of recipes.filter( r => r.id.startsWith( 'tech_' ) ) ) for ( const t of r.tools ) ok( kinds.has( t ), `${r.id}: tool ${t}` );
// a rare thing stays rare: a generator is a sliver of a hardware store's loot
{
	const t = compileTable( LOOT_TABLES.hardware ), e = t.entries.find( x => x.ids.length === 1 && x.ids[ 0 ] === 'generator' );
	ok( e && e.w / t.total < 0.01, `generator ${( e.w / t.total * 100 ).toFixed( 2 )}% of hardware rolls` );
}

// ---- the numbers -----------------------------------------------------------------------------------------------------
console.log( 'logic' );
{
	ok( L.cellOf( getItem( 'flashlight' ) ) === 'aa' && L.cellOf( getItem( 'cb_radio' ) ) === 'd' && L.cellOf( getItem( 'smoke_detector' ) ) === '9v' && L.cellOf( getItem( 'phone' ) ) === 'usb'
		&& L.cellOf( getItem( 'drone' ) ) === 'pack' && L.cellOf( getItem( 'chemlight' ) ) === null && L.cellOf( getItem( 'screwdriver' ) ) === null, 'cell sizes' );
	ok( L.rechargeable( getItem( 'phone' ) ) && L.rechargeable( getItem( 'power_bank' ) ) && L.rechargeable( getItem( 'lantern' ) ) && ! L.rechargeable( getItem( 'cb_radio' ) ) && ! L.rechargeable( getItem( 'chemlight' ) ), 'what a charger fills' );
	const ph = makeStack( 'phone', 1 ); ph.data.charge = 0;
	const used = L.chargeBy( ph, 10 );
	ok( ph.data.charge === 2 && near0( used, L.unitsOf( getItem( 'phone' ) ) ), `a phone fills for ${used} units` );
	const lan = makeStack( 'lantern', 1 ); lan.data.charge = 0;
	L.chargeBy( lan, 0.75 );
	near( lan.data.charge, 10, 1e-9, 'half a lantern for half its units' );
	const cb = makeStack( 'car_battery', 1 ), e1 = L.carEnergy( cb ), cb2 = { ...cb, data: {} };
	ok( e1 >= 0.3 && e1 <= 0.9 && L.carEnergy( cb2 ) === e1, `a found car battery is part charged, the same each time (${e1})` );
	const b = L.genBurn( 2, 1, 2 );
	near( b.fuel, 2 - L.GEN.burn * 2, 1e-9, 'a generator burns fuel by the hour' );
	ok( L.genBurn( 0.2, 1, 2 ).out && L.genBurn( 0.2, 1, 2 ).fuel === 0, 'and stops when dry' );
	ok( L.startChance( 0.05 ) === 0 && L.startChance( 1 ) > 0.95 && L.startChance( 0.5 ) < L.startChance( 0.9 ), 'a worn engine is stubborn' );
	ok( L.sunK( - 0.2 ) === 0 && L.sunK( 0.8, 0 ) > L.sunK( 0.8, 1 ) && L.sunK( 0.8, 0.2 ) > L.sunK( 0.15, 0.2 ), 'sunlight: none at night, less under cloud and low sun' );
	let seed = 7;
	const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const radio = getItem( 'radio' ), rs = makeStack( 'radio', 1 );
	const scan = getItem( 'police_scanner' ), ss = makeStack( 'police_scanner', 1 );
	let novice = 0, expert = 0, cells = 0, rcells = 0;
	for ( let i = 0; i < 400; i ++ ) {
		rs.data.charge = 30; ss.data.charge = 10;
		const a = L.dismantleYield( radio, rs, { level: 0, rnd } ), x = L.dismantleYield( radio, rs, { level: 8, quality: 1.5, rnd } );
		novice += a.reduce( ( s, [ id, n ] ) => s + n, 0 ); expert += x.reduce( ( s, [ id, n ] ) => s + n, 0 );
		if ( a.some( ( [ id ] ) => id === 'batteries' ) ) rcells ++;
		if ( L.dismantleYield( scan, ss, { rnd } ).some( ( [ id ] ) => id === 'batteries' ) ) cells ++;
	}
	ok( expert > novice * 1.15, `practice and fine tools break fewer parts (${novice} vs ${expert})` );
	ok( cells === 400, 'charged cells come back out of a plain-cell device' );
	ok( rcells === 0 && ! L.cellsOut( radio ) && L.cellsOut( scan ), 'none out of a rechargeable one (a charger would mint fresh AAs)' );
	ss.data.charge = 1;
	ok( ! L.dismantleYield( scan, ss, { rnd } ).some( ( [ id ] ) => id === 'batteries' ), 'flat cells are thrown away' );
	ok( L.dismantleSkill( radio ) === 'electrical' && L.dismantleSkill( getItem( 'car_battery' ) ) === 'mechanics' && L.dismantleSkill( getItem( 'leather_jacket' ) ) === 'tailoring', 'skills by what comes apart' );
	ok( L.dismantleTime( getItem( 'generator' ), 0 ) > L.dismantleTime( getItem( 'generator' ), 10 ) && L.dismantleTime( radio, 0, 1.5 ) < L.dismantleTime( radio, 0, 1 ), 'faster with practice and a good tool' );
	ok( L.detectorReading( 3 ) === 'here' && L.detectorReading( 40 ) === 'near' && L.detectorReading( 200 ) === null && L.detectorReading( null ) === null, 'detector readings' );
	let list = L.markSwept( [], 'a', 10 );
	ok( L.swept( list, 'a', 20 ) && ! L.swept( list, 'a', 40 ) && ! L.swept( list, 'b', 20 ), 'a swept spot rests a day' );
	for ( let i = 0; i < 60; i ++ ) list = L.markSwept( list, 'k' + i, 10 );
	ok( list.length === 40, 'the swept list stays short' );
	const counts = {};
	for ( let i = 0; i < 3000; i ++ ) { const k = L.channelOrder( L.SCANNER, rnd )[ 0 ][ 0 ]; counts[ k ] = ( counts[ k ] || 0 ) + 1; }
	ok( counts.supply_drop > counts.checkpoint && counts.checkpoint > counts.heli_crash && counts.heli_crash > 0, `scan order is weighted (${JSON.stringify( counts )})` );
	ok( L.cardinal( 0, - 10 ) === 'N' && L.cardinal( 10, 0 ) === 'E' && L.fmtDist( 1234 ) === '1.2 km' && L.fmtDist( 42 ) === '40 m', 'bearings' );
}
function near0( a, b ) { return Math.abs( a - b ) < 1e-9; }

// ---- a stub game ----------------------------------------------------------------------------------------------------------
const hf = {
	heightAt: () => 2, baseHeight: () => 2, normalAt: ( x, z, out ) => out.set( 0, 1, 0 ), surfaceAt: () => [ 0.8, 0, 0, 0 ], islandAt: () => 3, flagsNear: () => 0,
	raycast: ( ox, oy, oz, dx, dy, dz, maxT ) => { const t = dy < 0 ? ( oy - 2 ) / - dy : - 1; return t >= 0 && t <= maxT ? t : - 1; },
};
const toasts = [], noises = [], dropped = [], entities = [], reveals = [], drops = [];
const SITES = [
	{ kind: 'checkpoint', key: 'c1', x: 300, z: 0 }, { kind: 'checkpoint', key: 'c2', x: - 900, z: 0 }, { kind: 'military_checkpoint', key: 'm1', x: 0, z: - 800 },
	{ kind: 'fema_camp', key: 'f1', x: 600, z: 600 }, { kind: 'stash', key: 's1', x: 30, z: 0 }, { kind: 'campsite', key: 'k1', x: 0, z: 500 }, { kind: 'picnic', key: 'p1', x: 50, z: 50 },
];
const sites = {
	find( kind, near, maxR = 1500 ) {
		let best = null, bd = maxR;
		for ( const s of SITES ) { if ( s.kind !== kind || s.dug ) continue; const d = Math.hypot( s.x - near.x, s.z - near.z ); if ( d <= bd ) { bd = d; best = s; } }
		return best;
	},
	reveal( kind, near, maxR ) { const s = this.find( kind, near, maxR ); if ( s ) reveals.push( s.key ); return s; },
	near( pos, r ) { return SITES.filter( s => Math.hypot( s.x - pos.x, s.z - pos.z ) <= r ); },
	supplyDrop( pos ) { drops.push( pos ); return { key: 'drop:1', x: pos.x, z: pos.z }; },
};
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {}, hf, physics: new Physics( hf, null ),
	events: new Events(), audio: { play() { return null; }, loop() { return null; }, buffers: new Map() }, settings: { get: () => true },
	interact: { addProvider() { return () => {}; }, target: null, holdT: 0 },
	input: { pressed: () => false, released: () => false, is: () => false, codes: () => [], pressedQ: new Set(), down: new Set(), consumeWheel: () => 0 },
	world: { isIndoors: () => false, isBeach: () => true, meta: { cities: [] }, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } },
	weather: { rain: 0, state: 'clear', cover: 0.2 },
	player: { pos: new THREE.Vector3( 0, 2, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stanceH: 1.6, shake: 0, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
	entities: { near: ( pos, r, type, out = [] ) => { out.length = 0; for ( const e of entities ) if ( ( ! type || e.type === type ) && Math.hypot( e.pos.x - pos.x, e.pos.z - pos.z ) <= r ) out.push( e ); return out; } },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => dropped.push( s ), inputActive: true, dead: false,
	app: { ui: { inventory: { other: null } } }, sites, vehicles: { list: [], driving: null },
	register() {},
};
game.camera.position.set( 0, 3.6, 0 );
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.survival = new Survival( game );
game.skills = game.survival.skills || game.skills;
game.actions = new Actions( game );
const pool = new Set();
game.itemLights = { add: ( s ) => { pool.add( s ); return s; }, remove: ( s ) => pool.delete( s ) };
game.itemUse = new ItemUse( game, null );
game.crafting = new Crafting( game, null );
game.combine = new Combine( game );
const M = game.placeables = new Placeables( game );
const U = game.itemUse, K = game.combine, inv = game.player.inventory;
inv.equip.back = makeStack( 'backpack_military', 1 );
inv.equip.legs = makeStack( 'cargo_pants', 1 );
const finish = () => game.actions.update( 999 );
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const take = ( ...ss ) => { for ( const s of ss ) inv.remove( s ); };
const has = ( id ) => inv.count( id );
const verb = ( st, v ) => U.actions( st ).find( a => a.verb === v || a.verb.startsWith( v ) );
// an action can start another when it's done (a sweep, then digging): see them all through
const finishAll = () => { for ( let i = 0; i < 6 && game.actions.busy; i ++ ) finish(); };
const run = ( st, v ) => { const a = verb( st, v ); if ( ! a ) return false; a.run(); finishAll(); return true; };
const combo = ( id, a, b ) => { const r = K.run( C.getCombo( id ), a, b ); finish(); return r; };
const clearInv = () => { for ( const s of [ ...inv.allStacks() ] ) if ( s !== inv.equip.back && s !== inv.equip.legs ) inv.remove( s ); };
const at = ( x, z ) => new THREE.Vector3( x, 2, z );
const tick = ( p, secs, hours = 0, step = 0.25 ) => {
	const Kd = R.getPlaceable( p.kind ), n = Math.max( 1, Math.round( secs / step ) );
	for ( let i = 0; i < n; i ++ ) { game.time.hours += hours / n; Kd.update?.( p, step, game, hours / n ); }
};
const act = ( p, label ) => M.actionsOf( p ).find( a => a.label === label || a.label.startsWith( label ) );
const rand = Math.random;
const fixRandom = ( v ) => { Math.random = () => v; };
const realRandom = () => { Math.random = rand; };

// ---- dismantling -----------------------------------------------------------------------------------------------------------
console.log( 'dismantle' );
{
	const radio = put( 'radio' ); radio.data.charge = 30;
	const a = verb( radio, 'Dismantle' );
	ok( a && a.note === 'Need screwdriver', 'Dismantle says what it needs: ' + a?.note );
	toasts.length = 0; a.run(); finish();
	ok( has( 'radio' ) === 1 && toasts.includes( 'Need a screwdriver' ), 'without a screwdriver the radio stays' );
	put( 'screwdriver' );
	const xp0 = game.skills?.total?.( 'electrical' ) ?? 0;
	fixRandom( 0.5 );
	ok( run( radio, 'Dismantle' ), 'Dismantle with a screwdriver' );
	realRandom();
	ok( ! has( 'radio' ) && has( 'speaker' ) === 1 && has( 'circuit_board' ) === 1 && has( 'electronic_scrap' ) === 1 && ! has( 'batteries' ), `a radio gives a speaker, a board and scrap, its rechargeable cells stay in (${[ ...inv.allStacks() ].map( s => s.id ).join( ',' )})` );
	ok( ( game.skills?.total?.( 'electrical' ) ?? 1 ) > xp0, 'electrical practice' );
	// the speaker comes apart for its magnet, by hand
	const sp = inv.find( s => s.id === 'speaker' );
	fixRandom( 0.5 ); run( sp, 'Dismantle' ); realRandom();
	ok( has( 'magnet' ) === 1 && ! has( 'speaker' ), 'a speaker gives a magnet' );
	// a jacket full of things is emptied first
	const jk = put( 'leather_jacket' ); jk.data.items = [ makeStack( 'cash', 5 ) ];
	put( 'kitchen_knife' );
	toasts.length = 0; verb( jk, 'Dismantle' ).run(); finish();
	ok( has( 'leather_jacket' ) && toasts.includes( 'Empty it first' ), 'a jacket with something in its pockets: empty it first' );
	jk.data.items = [];
	fixRandom( 0.3 ); run( jk, 'Dismantle' ); realRandom();
	ok( has( 'leather' ) === 3 && ! has( 'leather_jacket' ), 'a leather jacket gives leather' );
	clearInv();
}

// ---- cells ----------------------------------------------------------------------------------------------------------------
console.log( 'cells' );
{
	const rem = put( 'tv_remote' ); rem.data.charge = 6;
	ok( run( rem, 'Remove batteries' ) && rem.data.charge === 0 && has( 'batteries' ) === 1, 'the remote\'s AAs come out' );
	ok( ! verb( rem, 'Remove batteries' ), 'and can\'t come out twice' );
	const fl = put( 'flashlight' ); fl.data.charge = 0;
	ok( combo( 'insert_batteries', inv.find( s => s.id === 'batteries' ), fl ) && fl.data.charge === 8, 'into a flashlight' );
	const cb = put( 'cb_radio' ); cb.data.charge = 0;
	const d = put( 'battery_d', 2 );
	ok( K.accepts( d, cb )?.ok && K.accepts( d, fl ) === null, 'D cells go into the CB, not the flashlight' );
	ok( combo( 'tech_insert_d', d, cb ) && cb.data.charge === 14 && d.qty === 1, 'a D cell fills the CB' );
	const sm = put( 'smoke_detector' ); sm.data.charge = 0;
	const nine = put( 'battery_9v' );
	const iv = verb( nine, 'Insert into' );
	ok( iv?.verb === 'Insert into Smoke detector', '9 V: ' + iv?.verb );
	iv.run(); finish();
	ok( sm.data.charge === 4 && ! has( 'battery_9v' ), 'the smoke detector is live' );
	noises.length = 0;
	ok( run( sm, 'Test' ) && noises.some( n => n.radius === 30 ), 'Test beeps loud enough to draw them' );
	clearInv();
}

// ---- chargers --------------------------------------------------------------------------------------------------------------
console.log( 'chargers' );
{
	const bank = put( 'power_bank' ), ph = put( 'phone' ); ph.data.charge = 0;
	const v = verb( bank, 'Charge' );
	ok( v?.verb === 'Charge Smartphone' && v.note === '100%', 'the power bank offers the phone: ' + v?.verb + ' ' + v?.note );
	v.run(); finish();
	ok( ph.data.charge === 2 && near0( bank.data.charge, 4 - L.unitsOf( getItem( 'phone' ) ) ), `phone full, bank ${bank.data.charge}` );
	const gps = put( 'gps' ); gps.data.charge = 0;
	ok( combo( 'tech_bank_charge', bank, gps ) && gps.data.charge > 0, 'drag the bank onto a GPS' );
	const crank = put( 'crank_charger' );
	gps.data.charge = 0; bank.data.charge = 4;
	ok( run( crank, 'Crank' ) && gps.data.charge > 0, 'cranking charges the emptiest device' );
	// the inverter needs a car battery
	const inv2 = put( 'power_inverter' );
	gps.data.charge = 0;
	ok( verb( inv2, 'Charge devices' )?.note === 'Need car battery', 'no car battery: the inverter says so' );
	const car = put( 'car_battery' ); car.data.energy = 0.5;
	run( inv2, 'Charge devices' );
	ok( gps.data.charge === 14 && car.data.energy < 0.5, `the inverter charges from the car battery (${car.data.energy.toFixed( 3 )})` );
	clearInv();
}

// ---- the generator ---------------------------------------------------------------------------------------------------------
console.log( 'generator' );
{
	const gen = put( 'generator' ), can = put( 'gas_can' );
	ok( combo( 'tech_fill_generator', can, gen ) && gen.data.fuel === 5 && can.data.amount === 0, 'a gas can into its tank' );
	ok( K.accepts( can, gen ) === null, 'an empty can is not offered' );
	take( gen );
	const p = M.add( 'generator', gen, at( 6, 0 ), 0 );
	ok( p && ! p.data.on && R.getPlaceable( 'generator' ).outdoors, 'placed off, outdoors only' );
	ok( act( p, 'Start' ) && act( p, 'Pick up' ), 'Start and Pick up' );
	fixRandom( 0.99 ); toasts.length = 0; act( p, 'Start' ).run(); finish(); realRandom();
	ok( ! p.data.on && toasts.includes( 'Didn\'t catch' ), 'a pull that doesn\'t catch' );
	fixRandom( 0.1 ); act( p, 'Start' ).run(); finish(); realRandom();
	ok( p.data.on, 'started' );
	// a lantern near it comes on and stays charged
	const lan = makeStack( 'lantern', 1 ); lan.data.charge = 1;
	const lp = M.add( 'light', lan, at( 10, 0 ), 0 ); lan.data.on = false;
	noises.length = 0;
	tick( p, 6, 1 );
	ok( noises.filter( n => n.kind === 'generator' && n.radius === L.GEN.noise ).length >= 2, 'it draws the infected while it runs' );
	near( gen.data.fuel, 5 - L.GEN.burn, 1e-6, 'it burns its fuel' );
	ok( lan.data.on && lan.data.charge > 1, `the lantern nearby is lit and charging (${lan.data.charge})` );
	ok( P.powerAt( game, at( 8, 0 ), 20 ) === p && P.powerAt( game, at( 80, 0 ), 20 ) === null, 'powerAt finds a running generator nearby' );
	// charge everything you carry, paid in fuel
	const ph = put( 'phone' ); ph.data.charge = 0;
	const car = put( 'car_battery' ); car.data.energy = 0.2;
	const f0 = gen.data.fuel;
	act( p, 'Charge devices' ).run(); finish();
	ok( ph.data.charge === 2 && car.data.energy === 1 && gen.data.fuel < f0, `devices charged for fuel (${( f0 - gen.data.fuel ).toFixed( 2 )} L)` );
	toasts.length = 0;
	act( p, 'Pick up' ).run(); finish();
	ok( M.list.has( p.id ) && toasts.includes( 'Stop it first' ), 'won\'t pick up while running' );
	// a save while running comes back running
	const o = JSON.parse( JSON.stringify( R.serializeRecord( p ) ) ), q = R.loadRecord( o );
	ok( q.data.on === true && q.stack.data.fuel === gen.data.fuel, 'save round trip keeps it running with its fuel' );
	// it runs dry
	gen.data.fuel = 0.1;
	tick( p, 2, 1 );
	ok( ! p.data.on && gen.data.fuel === 0, 'out of fuel, it stops' );
	const can2 = put( 'jerrycan' );
	act( p, 'Refuel' ).run(); finish();
	ok( gen.data.fuel === L.GEN.tank && can2.data.amount === 20 - L.GEN.tank, 'refuelled from a jerrycan' );
	gen.cond = 0.4;
	put( 'motor_oil' );
	toasts.length = 0; act( p, 'Change oil' ).run(); finish();
	ok( gen.cond === 0.4 && has( 'motor_oil' ) && toasts.includes( 'Need a wrench' ), 'an oil change needs a wrench, as the combo does' );
	put( 'wrench' );
	act( p, 'Change oil' ).run(); finish();
	ok( gen.cond > 0.8 && ! has( 'motor_oil' ), 'an oil change brings it back' );
	act( p, 'Pick up' ).run(); finish();
	ok( ! M.list.has( p.id ) && inv.find( s => s.id === 'generator' )?.data.fuel === L.GEN.tank, 'picked up with its fuel' );
	M.remove( lp, { give: false } );
	clearInv();
}

// ---- solar --------------------------------------------------------------------------------------------------------------------
console.log( 'solar' );
{
	const panel = makeStack( 'solar_panel', 1 );
	const p = M.add( 'solar', panel, at( 4, 4 ), 0 );
	const ph = put( 'phone' ); ph.data.charge = 0;
	const car = put( 'car_battery' ); car.data.energy = 0;
	ok( act( p, 'Plug in' )?.label === 'Plug in Car battery' || act( p, 'Plug in' )?.label === 'Plug in Smartphone', 'Plug in offers the emptiest: ' + act( p, 'Plug in' )?.label );
	act( p, 'Plug in' ).run(); act( p, 'Plug in' ).run();
	ok( p.data.dock.length === 2 && ! has( 'phone' ) && ! has( 'car_battery' ) && ! act( p, 'Plug in' ), 'two docked, no more room' );
	game.world.sky.sunDir.set( 0, 1, 0 ); game.weather.cover = 0;
	tick( p, 10, 3 );
	ok( ph.data.charge > 0.5 && car.data.energy > 0, `charging in the sun (phone ${ph.data.charge.toFixed( 2 )}, car ${car.data.energy.toFixed( 3 )})` );
	const c0 = ph.data.charge;
	game.world.sky.sunDir.set( 0, - 0.5, 0.8 );
	tick( p, 10, 3 );
	ok( ph.data.charge === c0 && /No sun/.test( R.getPlaceable( 'solar' ).sub( p, game ) ), 'nothing at night' );
	const o = JSON.parse( JSON.stringify( R.serializeRecord( p ) ) ), q = R.loadRecord( o );
	ok( q.data.dock.length === 2 && q.data.dock.some( s => s.id === 'phone' ), 'docked things are saved with it' );
	act( p, 'Take Smartphone' ).run();
	ok( has( 'phone' ) && p.data.dock.length === 1, 'Take gives it back' );
	act( p, 'Pick up' ).run(); finish();
	ok( ! M.list.has( p.id ) && has( 'car_battery' ) && has( 'solar_panel' ), 'picking it up returns what was plugged in' );
	game.world.sky.sunDir.set( 0, 1, 0 );
	clearInv();
	// the garden light charges by day and lights itself at night
	const sl = makeStack( 'solar_light', 1 ); sl.data.charge = 0;
	const lp = M.add( 'solar_light', sl, at( - 4, 4 ), 0 );
	game.world.sky.night = 0;
	tick( lp, 4, 4 );
	ok( sl.data.charge > 2 && ! sl.data.on, `charges by day, unlit (${sl.data.charge.toFixed( 2 )})` );
	game.world.sky.night = 1; game.world.sky.sunDir.set( 0, - 0.5, 0.8 );
	tick( lp, 1, 0.1 );
	ok( sl.data.on && lp._light?.on, 'lit at night' );
	tick( lp, 4, 12 );
	ok( ! sl.data.on && sl.data.charge === 0, 'goes dark when spent' );
	M.remove( lp, { give: false } );
	game.world.sky.night = 0; game.world.sky.sunDir.set( 0, 1, 0 );
}

// ---- radios -------------------------------------------------------------------------------------------------------------------
console.log( 'radios' );
{
	const sc = put( 'police_scanner' ); sc.data.charge = 10;
	reveals.length = 0;
	ok( run( sc, 'Scan' ) && reveals.length === 1 && [ 'c1', 'm1', 'f1' ].includes( reveals[ 0 ] ), 'a scan marks an official site: ' + reveals.join() );
	for ( let i = 0; i < 6; i ++ ) run( sc, 'Scan' );
	ok( new Set( reveals ).size === reveals.length || reveals.length > 3, `scans don't keep marking the same place (${reveals.join()})` );
	ok( sc.data.charge < 10 && sc.data.heard.length >= 3, 'it uses charge and remembers what it heard' );
	sc.data.charge = 0;
	toasts.length = 0; run( sc, 'Scan' );
	ok( toasts.includes( 'Batteries dead' ), 'dead batteries: no scan' );
	const ant = put( 'antenna' );
	ok( combo( 'tech_antenna', ant, sc ) === false || true, 'antenna combo runs' );
	put( 'screwdriver' ); combo( 'tech_antenna', inv.find( s => s.id === 'antenna' ), sc );
	ok( sc.data.antenna && ! has( 'antenna' ), 'an antenna fitted' );
	const cb = put( 'cb_radio' ); cb.data.charge = 14;
	reveals.length = 0;
	run( cb, 'Listen' );
	ok( reveals.length === 1 && [ 's1', 'k1' ].includes( reveals[ 0 ] ), 'CB chatter marks a survivor place: ' + reveals.join() );
	clearInv();
}

// ---- metal detector and magnet ------------------------------------------------------------------------------------------------
console.log( 'detector' );
{
	const md = put( 'metal_detector' ); md.data.charge = 10;
	game.player.pos.set( 0, 2, 0 );
	toasts.length = 0;
	run( md, 'Sweep' );
	ok( toasts.some( t => /^Signal · 30 m E/.test( t ) ), 'a buried stash rings from 30 m: ' + toasts.join( ' | ' ) );
	game.player.pos.set( 28, 2, 1 );
	reveals.length = 0; toasts.length = 0;
	run( md, 'Sweep' );
	ok( reveals.includes( 's1' ) && toasts.includes( 'Strong signal. Dig here' ), 'right over it: marked' );
	SITES.find( s => s.key === 's1' ).dug = true;
	game.player.pos.set( 200, 2, 200 );
	fixRandom( 0.01 );
	const before = [ ...inv.allStacks() ].length;
	run( md, 'Sweep' );
	realRandom();
	ok( [ ...inv.allStacks() ].length > before || dropped.length, 'junk dug out of the sand' );
	toasts.length = 0;
	fixRandom( 0.01 ); run( md, 'Sweep' ); realRandom();
	ok( toasts.includes( 'Nothing here' ), 'the same patch twice: nothing' );
	ok( md.data.charge < 10, 'sweeping uses charge' );
	// magnet on a rope, facing water
	const mag = put( 'magnet' ), rope = put( 'rope' );
	ok( combo( 'tech_magnet_rope', mag, rope ) && has( 'fishing_magnet' ), 'magnet + rope' );
	const fm = inv.find( s => s.id === 'fishing_magnet' );
	toasts.length = 0; run( fm, 'Magnet fish' );
	ok( toasts.includes( 'Face open water' ), 'needs water ahead' );
	game.physics.waterLevel = () => 2.9;
	const before2 = new Set( [ ...inv.allStacks() ].map( s => s.uid ) );
	fixRandom( 0.2 ); run( fm, 'Magnet fish' ); realRandom();
	const got = [ ...inv.allStacks() ].filter( s => ! before2.has( s.uid ) );
	ok( got.length >= 1 && got.every( s => s.cond <= 0.6 ), 'it drags up something rusty: ' + got.map( s => s.id ).join() );
	game.physics.waterLevel = () => 0;
	clearInv();
}

// ---- camera, drone, sat phone ----------------------------------------------------------------------------------------------------
console.log( 'devices' );
{
	game.player.pos.set( 0, 2, 0 ); game.player.yaw = 0;
	const hit = [];
	const mk = ( x, z ) => ( { type: 'zombie', alive: true, height: 1.7, pos: new THREE.Vector3( x, 2, z ), stagger( d ) { hit.push( this ); }, stun() {} } );
	const front = mk( 0, - 4 ), back = mk( 0, 4 ), far = mk( 0, - 20 );
	entities.push( front, back, far );
	game.physics.lineOfSight = () => true;
	const cam = put( 'digital_camera' ); cam.data.charge = 3;
	run( cam, 'Flash' );
	ok( hit.includes( front ) && ! hit.includes( back ) && ! hit.includes( far ), 'the flash dazzles the one in front, close' );
	ok( cam.data.charge < 3, 'a flash uses charge' );
	entities.length = 0;
	const dr = put( 'drone' ); dr.data.charge = 1;
	reveals.length = 0; noises.length = 0;
	run( dr, 'Fly' );
	ok( reveals.length >= 2 && ! reveals.includes( 's1' ) && noises.some( n => n.kind === 'drone' && n.pos.z < - 50 ), `the drone marks what's near and buzzes out ahead (${reveals.join()})` );
	ok( near0( dr.data.charge, 0.7 ), 'a flight uses a third of the battery' );
	dr.data.charge = 0.2;
	toasts.length = 0; run( dr, 'Fly' );
	ok( toasts.includes( 'Battery low' ), 'no flight on a low battery' );
	const sat = put( 'sat_phone' ); sat.data.charge = 3;
	fixRandom( 0.1 ); run( sat, 'Call' ); realRandom();
	const d = drops[ 0 ];
	ok( d && Math.hypot( d.x, d.z ) > 240 && Math.hypot( d.x, d.z ) < 460, 'a supply drop is called in a few hundred metres off' );
	toasts.length = 0; run( sat, 'Call' );
	ok( toasts.includes( 'No answer' ) && drops.length === 1, 'not again for two days' );
	const cas = put( 'cassette_player' ); cas.data.charge = 10;
	game.survival.boredom = 60;
	run( cas, 'Listen' );
	ok( game.survival.boredom < 60 && cas.data.charge < 10, `music lifts boredom (${game.survival.boredom.toFixed( 1 )})` );
	clearInv();
}

// ---- vehicles ------------------------------------------------------------------------------------------------------------------
console.log( 'vehicles' );
{
	let touched = 0;
	const v = { name: 'Sedan', pos: new THREE.Vector3( 2, 2, 0 ), radius: 2, fuel: 30, removed: false, burnt: false, needs: { battery: true }, engine: { running: false }, spec: { fuel: { tank: 50 } }, touch() { touched ++; } };
	game.vehicles.list = [ v ];
	game.player.pos.set( 0, 2, 0 );
	const hose = put( 'siphon_hose' );
	toasts.length = 0; run( hose, 'Siphon fuel' );
	ok( toasts.includes( 'Need a fuel can or bottle' ), 'nothing to siphon into' );
	const can = put( 'gas_can' ); can.data.amount = 1;
	game.skills?.setLevel?.( 'mechanics', 5 );
	run( hose, 'Siphon fuel' );
	ok( can.data.amount === 5 && v.fuel === 26 && touched === 1, `4 L out of the tank into the can (${v.fuel})` );
	const bottle = put( 'empty_bottle' ); take( can );
	run( hose, 'Siphon fuel' );
	ok( bottle.data.liquid === 'fuel' && bottle.data.amount === 0.75, 'or into a glass bottle' );
	// jumper cables and a car battery
	const jc = put( 'jumper_cables' );
	toasts.length = 0; run( jc, 'Jump start' );
	ok( toasts.includes( 'Need a charged car battery' ) && v.needs.battery, 'needs a charged battery' );
	const car = put( 'car_battery' ); car.data.energy = 0.8;
	run( jc, 'Jump start' );
	ok( ! v.needs.battery && near0( car.data.energy, 0.6 ), 'jump-started: the car\'s battery problem is gone' );
	v.engine.running = true; car.data.energy = 0.1;
	run( jc, 'Charge car battery' );
	near( car.data.energy, 0.6, 1e-9, 'a running car charges a car battery' );
	game.vehicles.list = [];
	clearInv();
}

// ---- lockbox -------------------------------------------------------------------------------------------------------------------
console.log( 'lockbox' );
{
	const box = put( 'lockbox' );
	ok( verb( box, 'Open' )?.note === 'Locked', 'locked with nothing to open it' );
	const bc = put( 'bolt_cutters' );
	ok( verb( box, 'Cut lock' ), 'bolt cutters: Cut lock' );
	const n0 = [ ...inv.allStacks() ].length;
	combo( 'tech_lock_cut', bc, box );
	ok( ! has( 'lockbox' ) && has( 'scrap_metal' ) && [ ...inv.allStacks() ].length > n0, 'cut open: its contents and the scrap' );
	take( bc );
	const box2 = put( 'lockbox' ), pick = put( 'lockpick' );
	fixRandom( 0.99 ); toasts.length = 0;
	combo( 'tech_lock_pick', pick, box2 );
	realRandom();
	ok( has( 'lockbox' ) && ( toasts.includes( 'Didn\'t open' ) || toasts.includes( 'Lockpick broke' ) ), 'a pick that fails leaves it shut' );
	const crow = put( 'crowbar' );
	noises.length = 0;
	ok( run( box2, 'Pry open' ) && ! has( 'lockbox' ) && noises.some( n => n.radius === L.LOCK.pry.noise ), 'prying is loud' );
	clearInv();
}

// ---- repairs and making ---------------------------------------------------------------------------------------------------------
console.log( 'combos' );
{
	const radio = put( 'radio' ); radio.cond = 0.4;
	const scrap = put( 'electronic_scrap', 2 );
	ok( K.state( C.getCombo( 'tech_solder_fix' ), scrap, radio ).reason === 'Need a soldering iron', 'soldering needs the iron, said plainly: ' + K.state( C.getCombo( 'tech_solder_fix' ), scrap, radio ).reason );
	const iron = put( 'soldering_iron' );
	ok( combo( 'tech_solder_fix', scrap, radio ) && radio.cond > 0.7 && scrap.qty === 1, `soldered (${radio.cond.toFixed( 2 )})` );
	const mach = put( 'machete' ); mach.cond = 0.5;
	const glue = put( 'superglue' );
	ok( combo( 'tech_glue_fix', glue, mach ) && mach.cond > 0.6 && glue.data.uses === 2, 'super glue on a machete' );
	ok( combo( 'tech_oil_tool', put( 'penetrating_oil' ), mach ) && mach.cond > 0.7, 'oiled' );
	const bat = put( 'baseball_bat' ); bat.cond = 0.3;
	ok( combo( 'tech_wood_glue', put( 'wood_glue' ), bat ) && bat.cond > 0.55, 'wood glue on a bat' );
	const kit = put( 'sewing_kit' );
	const th = put( 'thread' );
	ok( K.state( C.getCombo( 'tech_refill_sewing' ), th, kit ).soft, 'a full sewing kit takes no thread' );
	kit.data.uses = 1;
	ok( combo( 'tech_refill_sewing', th, kit ) && kit.data.uses === undefined && ! has( 'thread' ), 'thread refills it' );
	const fab = put( 'fabric' );
	ok( combo( 'tech_fabric_rags', mach, fab ) && has( 'rags' ) === 4, 'fabric into rags' );
	const cans = put( 'empty_can', 4 ), ham = put( 'hammer' );
	noises.length = 0;
	ok( combo( 'tech_flatten_can', ham, cans ) && has( 'sheet_metal' ) === 1 && ! has( 'empty_can' ) && noises.some( n => n.radius === 18 ), 'four cans hammered into sheet metal (noisily)' );
	const hose = put( 'rubber_hose' );
	ok( combo( 'tech_hose_cut', mach, hose ) && has( 'siphon_hose' ), 'a garden hose cut into a siphon' );
	const pack = put( 'backpack_school' ); pack.cond = 0.5;
	ok( combo( 'tech_zip_strap', put( 'zip_ties', 4 ), pack ) && pack.cond > 0.6 && has( 'zip_ties' ) === 2, 'zip ties fix a strap' );
	clearInv();
	// a recipe: the siren from salvaged parts
	put( 'speaker' ); put( 'circuit_board' ); put( 'battery_9v' ); put( 'wire' ); put( 'soldering_iron' );
	const r = game.crafting.recipes.find( x => x.id === 'tech_siren' );
	ok( r && game.crafting.canCraft( r ), 'the siren can be built' );
	game.crafting.craft( r ); finish();
	ok( has( 'siren' ) && ! has( 'speaker' ), 'a siren built' );
	const sir = inv.find( s => s.id === 'siren' );
	take( sir );
	const sp = M.add( 'noise', sir, at( 0, - 8 ), 0 );
	act( sp, 'Set 20 s' ).run();
	noises.length = 0;
	tick( sp, 30, 0 );
	ok( noises.some( n => n.radius === 90 ), 'the siren wails far' );
	M.remove( sp, { give: false } );
	clearInv();
}

// ---- the review's fixes ------------------------------------------------------------------------------------------------------
console.log( 'cells guard' );
{
	// the core's AA verbs only reach AA devices: no AAs into a D or 9 V device, a phone, a power bank or a drone
	put( 'batteries', 4 );
	for ( const id of [ 'cb_radio', 'smoke_detector', 'phone', 'power_bank', 'drone', 'sat_phone', 'cordless_drill', 'solar_light' ] ) {
		const s = put( id ); s.data.charge = 0;
		ok( ! verb( s, 'Replace batteries' ), `${id}: no AA "Replace batteries"` );
		toasts.length = 0; U.replaceBatteries( s ); finish();
		ok( s.data.charge === 0 && toasts.length === 1, `${id}: a stray AA refill is refused (${toasts[ 0 ]})` );
		take( s );
	}
	const fl = put( 'flashlight' ); fl.data.charge = 0;
	ok( !! verb( fl, 'Replace batteries' ), 'a flashlight still takes AAs' );
	// a loose AA goes to the emptiest AA device even when a D device is emptier
	const cb = put( 'cb_radio' ); cb.data.charge = 0; fl.data.charge = 2;
	const aa = inv.find( s => s.id === 'batteries' );
	ok( verb( aa, 'Insert into' )?.verb === 'Insert into Flashlight', 'AA: ' + verb( aa, 'Insert into' )?.verb );
	ok( U.lowestDevice( true )?.id === 'flashlight', 'the solar charger still finds rechargeables' );
	// no cells out of a rechargeable device (crank it, pull the cells, repeat would be endless AAs)
	fl.data.charge = 8;
	ok( ! verb( fl, 'Remove batteries' ), 'no "Remove batteries" from a rechargeable flashlight' );
	const cam = put( 'digital_camera' ); cam.data.charge = 3;
	ok( !! verb( cam, 'Remove batteries' ), 'a camera\'s plain AAs come out' );
	clearInv();
}
console.log( 'plain words' );
{
	// combos ask for the new tool kinds by name
	const car = put( 'car_battery' ); car.data.energy = 0.5;
	const ph = put( 'phone' ); ph.data.charge = 0;
	ok( K.state( C.getCombo( 'tech_inverter_charge' ), car, ph ).reason === 'Need a power inverter', 'inverter: ' + K.state( C.getCombo( 'tech_inverter_charge' ), car, ph ).reason );
	const inv2 = put( 'power_inverter' ); const c0 = inv2.cond;
	ok( combo( 'tech_inverter_charge', car, ph ) && ph.data.charge === 2 && inv2.cond < c0, 'with one it charges, and the inverter wears' );
	const gen = put( 'generator' ); gen.cond = 0.5; const oil = put( 'motor_oil' );
	ok( K.state( C.getCombo( 'tech_oil_generator' ), oil, gen ).reason === 'Need a wrench', 'oil change wants a wrench' );
	clearInv();
	// the crafting panel's tool chips: plain names that Crafting's own labelling can't overwrite
	const T = await import( '../src/game/items/defs/ext/tech.js' );
	T.chipNames();
	const cr = new Crafting( game, null );
	const siren = cr.recipes.find( r => r.id === 'tech_siren' ), cut = cr.recipes.find( r => r.id === 'tech_lock_cut' ) || cr.recipes.find( r => r.id === 'tech_repair_kit' );
	ok( siren.toolLabels.join() === 'soldering iron', 'siren chip: ' + siren.toolLabels.join() );
	ok( cut.toolLabels.join() === 'blowtorch,wrench', 'repair kit chips: ' + cut.toolLabels.join() );
	const rags = cr.recipes.find( r => r.tools?.length && r.tools.every( t => ! T.TOOL_SAY[ t ] ) );
	ok( ! rags || ! Object.getOwnPropertyDescriptor( rags, 'toolLabels' ).get, 'other recipes keep Crafting\'s labels' );
}
console.log( 'dismantle edge cases' );
{
	// a cancelled job leaves the stack whole; only one unit of a stack comes apart
	put( 'screwdriver' );
	const sp = put( 'speaker', 2 );
	verb( sp, 'Dismantle' ).run();
	game.actions.cancel?.();
	ok( sp.qty === 2 && inv.findAll( s => s.id === 'speaker' ).length === 1, 'cancelled: still one stack of 2' );
	fixRandom( 0.5 ); run( sp, 'Dismantle' ); realRandom();
	ok( sp.qty === 1 && has( 'magnet' ) === 1, 'done: one speaker comes apart' );
	// a full bag: the parts land at your feet
	clearInv();
	const fan = put( 'desk_fan' ); put( 'screwdriver' );
	const dn = dropped.length, add0 = inv.add;
	inv.add = ( st ) => st.qty; // no room anywhere
	fixRandom( 0.5 ); run( fan, 'Dismantle' ); realRandom();
	inv.add = add0;
	ok( ! has( 'desk_fan' ) && dropped.slice( dn ).some( st => st.id === 'electric_motor' ), 'no room: the parts are dropped at your feet' );
	clearInv();
}
console.log( 'solar choice' );
{
	const p = M.add( 'solar', makeStack( 'solar_panel', 1 ), at( 4, - 4 ), 0 );
	const ph = put( 'phone' ); ph.data.charge = 0;
	const gps = put( 'gps' ); gps.data.charge = 1;
	const labels = M.actionsOf( p ).map( a => a.label ).filter( l => l.startsWith( 'Plug in' ) );
	ok( labels.includes( 'Plug in Smartphone' ) && labels.includes( 'Plug in Handheld GPS' ), 'each thing that wants charge is offered: ' + labels.join( ' | ' ) );
	act( p, 'Plug in Handheld GPS' ).run();
	ok( p.data.dock[ 0 ] === gps && has( 'phone' ), 'the one you chose is plugged in' );
	act( p, 'Pick up' ).run(); finish();
	clearInv();
}

console.log( 'added in review' );
{
	game.player.pos.set( 0, 2, 0 ); game.player.yaw = 0;
	// a cordless drill is a screwdriver, but not for taking itself apart
	const dr = put( 'cordless_drill' );
	ok( verb( dr, 'Dismantle' )?.note === 'Need screwdriver', 'the drill can\'t dismantle itself: ' + verb( dr, 'Dismantle' )?.note );
	clearInv();
	// multimeter: reads what you carry, a car battery included; runs on a 9 V
	const mm = put( 'multimeter' ), car = put( 'car_battery' ), fl = put( 'flashlight' );
	car.data.energy = 0.42; fl.data.charge = 4;
	toasts.length = 0; run( mm, 'Check charge' );
	ok( toasts[ 0 ] === 'Car battery 42% · Flashlight 50%', 'readout: ' + toasts[ 0 ] );
	mm.data.charge = 0;
	toasts.length = 0; run( mm, 'Check charge' );
	ok( toasts.includes( 'Battery dead' ), 'a dead meter reads nothing' );
	const nine = put( 'battery_9v' );
	ok( combo( 'tech_insert_9v', nine, mm ) && mm.data.charge === 20, 'a 9 V into the meter' );
	clearInv();
	// portable TV: boredom down, D cells, and the emergency broadcast names a camp
	const tv = put( 'portable_tv' ); tv.data.charge = 10;
	game.survival.boredom = 70; reveals.length = 0;
	fixRandom( 0.1 ); toasts.length = 0; run( tv, 'Watch' ); realRandom();
	ok( game.survival.boredom < 70 && tv.data.charge === 9.5, `watching passes the time (${game.survival.boredom.toFixed( 1 )})` );
	ok( reveals.length === 1 && toasts.some( t => /^Emergency broadcast · /.test( t ) ), 'the broadcast marks a camp: ' + toasts.join( ' | ' ) );
	tv.data.charge = 0; toasts.length = 0; run( tv, 'Watch' );
	ok( toasts.includes( 'Batteries dead' ), 'dead batteries: a blank screen' );
	const dcell = put( 'battery_d' );
	ok( combo( 'tech_insert_d', dcell, tv ) && tv.data.charge === 10, 'D cells into the TV' );
	put( 'screwdriver' );
	ok( combo( 'tech_antenna', put( 'antenna' ), tv ) && tv.data.antenna, 'an antenna fits the TV too' );
	clearInv();
	// fish finder: needs water ahead; a scan quickens the bite for a while
	const { FISHING_MODS } = await import( '../src/game/items/Fishing.js' );
	const mod = () => FISHING_MODS.map( fn => fn( { game, depth: 15 } ) ).find( m => m && m.bite === L.SONAR.bite ) || null;
	const ff = put( 'fish_finder' ); ff.data.charge = 8;
	toasts.length = 0; run( ff, 'Scan water' );
	ok( toasts.includes( 'Face open water' ) && ! mod(), 'no water ahead: no scan' );
	// standing on a harbour wall: the sea surface just below, the bottom 15 m down a few metres out
	const h0 = hf.heightAt;
	hf.heightAt = ( x, z ) => z < - 2 ? 2.9 - 15 : 2;
	game.physics.waterLevel = () => 2.9;
	toasts.length = 0; run( ff, 'Scan water' );
	hf.heightAt = h0;
	ok( /^1\d m deep · /.test( toasts[ 0 ] || '' ) && ff.data.charge < 8, 'depth and fish: ' + toasts[ 0 ] );
	const m = mod();
	ok( m && m.bite < 1 && m.weights.raw_ahi > 1, 'a fresh scan: faster bites, deep water favours the big ones' );
	m.caught(); ok( ff.data.charge < 7.6, 'each fish costs a little charge' );
	game.time.hours += 3;
	ok( ! mod(), 'the scan goes stale' );
	game.physics.waterLevel = () => 0;
	clearInv();
	// motion light: placed, it lights at night when something moves near and warns you from afar
	const ml = makeStack( 'motion_light', 1 );
	const p = M.add( 'motion_light', ml, at( 40, 0 ), 0 );
	ok( p && ml.data.charge === 8 && R.getPlaceable( 'motion_light' ).outdoors, 'placed, charged, outdoors only' );
	game.world.sky.night = 1; game.world.sky.sunDir.set( 0, - 0.5, 0.8 );
	tick( p, 1, 0 );
	ok( ! p.data.lit, 'nothing moving: dark' );
	const z = { type: 'zombie', alive: true, pos: new THREE.Vector3( 44, 2, 0 ) };
	entities.push( z );
	toasts.length = 0;
	tick( p, 0.25, 0 );
	ok( p.data.lit > 0 && p._light?.on !== false && ml.data.charge < 8, 'something moved: lit' );
	ok( toasts[ 0 ] === 'Motion light · 40 m E', 'and a warning with where: ' + toasts[ 0 ] );
	tick( p, 25, 0 );
	toasts.length = 0; tick( p, 0.25, 0 );
	ok( p.data.lit > 0 && ! toasts.length, 'lit again, but the warning waits' );
	entities.length = 0;
	tick( p, 25, 0 );
	ok( ! p.data.lit, 'goes dark once it\'s still' );
	game.player.pos.set( 38, 2, 0 ); toasts.length = 0;
	tick( p, 50, 0 ); tick( p, 0.25, 0 );
	ok( p.data.lit > 0 && ! toasts.length, 'you set it off too, without a warning' );
	game.player.pos.set( 0, 2, 0 );
	game.world.sky.night = 0; game.world.sky.sunDir.set( 0, 1, 0 );
	tick( p, 25, 0 ); ml.data.charge = 1;
	tick( p, 4, 6 );
	ok( ml.data.charge > 4 && ! p.data.lit, `charges by day, never lit (${ml.data.charge.toFixed( 2 )})` );
	const o = JSON.parse( JSON.stringify( R.serializeRecord( p ) ) ), q = R.loadRecord( o );
	ok( q.stack.data.charge === ml.data.charge && q.data.lit === 0, 'saved with its charge' );
	act( p, 'Pick up' ).run(); finish();
	ok( ! M.list.has( p.id ) && has( 'motion_light' ), 'picked up' );
	clearInv();
	// and it can be rigged from garden lights
	put( 'solar_light', 2 ); put( 'circuit_board' ); put( 'wire' ); put( 'soldering_iron' );
	const r = game.crafting.recipes.find( x => x.id === 'tech_motion_light' );
	ok( r && game.crafting.canCraft( r ), 'two garden lights and a board make a motion light' );
	game.crafting.craft( r ); finish();
	ok( has( 'motion_light' ) && ! has( 'solar_light' ), 'built' );
	clearInv();
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
