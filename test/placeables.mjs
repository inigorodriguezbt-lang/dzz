// Placeables (Node, a fake DOM for the canvas-drawn labels): node test/placeables.mjs
//   the kind registry and every item's `place` pointing at a registered kind; record serialize / load round trips
//   the pure numbers: snare chances and catches, rain filling and stale water, the alarm and radio timers
//   game.placeables on a stub game with the real Inventory, Actions, ItemUse, Survival and Physics: lights burning
//   down, the alarm ringing and drawing noise, the radio, the rain barrel filling a bottle, a snare's catch, a spring
//   trap holding one of the infected and the player, a stash buried and dug up, a tent, a barricade soaking blows,
//   placement checks, the use verbs, persistence with an unknown kind kept
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const THREE = await import( 'three' );
await import( '../src/game/items/defs/index.js' );
const { ITEMS, getItem, makeStack } = await import( '../src/game/items/ItemDB.js' );
const R = await import( '../src/game/items/placeables/registry.js' );
const L = await import( '../src/game/items/placeables/logic.js' );
const { Placeables } = await import( '../src/game/items/Placeables.js' );
const { wrapDoor } = await import( '../src/game/items/placeables/barricade.js' );
const { PlayerInventory, itemsOf } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Physics } = await import( '../src/game/Physics.js' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );

// ---- registry ---------------------------------------------------------------------------------------------------------
console.log( 'registry' );
for ( const k of [ 'trap', 'noise', 'collector', 'stash', 'light', 'barricade', 'shelter' ] ) ok( R.KINDS.has( k ), `kind ${k} registered` );
ok( R.placeOf( { place: 'light' } )?.kind === 'light' && R.placeOf( { place: { kind: 'trap', trap: 'jaw' } } ).trap === 'jaw' && R.placeOf( {} ) === null && R.placeOf( { place: {} } ) === null, 'placeOf normalises' );
const placeable = [ ...ITEMS.values() ].filter( d => d.place );
ok( placeable.length >= 14, `items with a place field (${placeable.length})` );
for ( const d of placeable ) ok( R.KINDS.has( R.placeOf( d )?.kind ), `${d.id}: place kind ${R.placeOf( d )?.kind} is registered` );
for ( const id of [ 'lantern', 'chemlight', 'torch', 'radio', 'tent', 'sleeping_bag', 'tarp', 'alarm_clock', 'snare', 'spring_trap', 'rain_barrel', 'stash_box', 'candle', 'tiki_torch' ] ) ok( !! getItem( id )?.place, `${id} places` );
ok( getItem( 'stash_box' ).container?.capacity === 30, 'the tote holds 30' );
{
	// a domain's own kind: its serialize / load shape the saved data, runtime fields (_x) never reach the save
	R.addPlaceable( 'test_kind', { serialize: ( p ) => ( { n: p.data.n, _skip: 1 } ), load: ( p, d ) => { p.data = { n: d.n * 1, loaded: true }; } } );
	const p = R.makeRecord( { kind: 'test_kind', item: 'lantern', pos: { x: 1.234, y: 2, z: - 3.456 }, yaw: 1.2345, stack: makeStack( 'lantern' ), data: { n: 3, _obj: {} }, born: 10 } );
	const o = JSON.parse( JSON.stringify( R.serializeRecord( p ) ) );
	ok( o.k === 'test_kind' && o.p[ 0 ] === 1.23 && o.p[ 2 ] === - 3.46 && o.y === 1.23 && o.d.n === 3 && o.d._skip === undefined && o.s.id === 'lantern', 'serialize: rounded position, kind data, stack, no runtime fields' );
	const q = R.loadRecord( o );
	ok( q.id === p.id && q.kind === 'test_kind' && q.data.loaded && q.data.n === 3 && q.stack.id === 'lantern' && q.born === 10, 'load: the kind rebuilds its data' );
	ok( R.loadRecord( { k: 5 } ) === null && R.loadRecord( null ) === null, 'load refuses junk' );
	R.KINDS.delete( 'test_kind' );
	ok( R.lc( 'Wire snare' ) === 'wire snare' && R.lc( 'LED lantern' ) === 'LED lantern', 'lc keeps acronyms' );
}

// ---- logic ------------------------------------------------------------------------------------------------------------
console.log( 'logic' );
{
	ok( L.wildness( 0 ) < L.wildness( 400 ) && L.wildness( 400 ) < L.wildness( 800 ) && L.wildness( 800 ) < L.wildness( 4000 ) && L.wildness( 1e6 ) <= 1.4, 'wilder further from town' );
	const base = { townEdge: 3000, moist: 0.8, hour: 12 };
	const c = L.snareChance( base );
	ok( c > 0 && c < 0.1, `snare chance per hour in the woods at noon (${c.toFixed( 3 )})` );
	ok( L.snareChance( { ...base, townEdge: 0 } ) < c * 0.2, 'a snare in town rarely catches' );
	near( L.snareChance( { ...base, bait: true } ) / c, 2.2, 1e-9, 'bait doubles it and more' );
	ok( L.snareChance( { ...base, hour: 6 } ) > c && L.snareChance( { ...base, watched: true } ) === 0, 'dawn is better; nothing comes while you watch' );
	ok( L.snareChance( { ...base, beach: true } ) < c && L.snareChance( { ...base, lava: 1 } ) < c * 0.3, 'beaches and lava are poor' );
	near( L.chanceOver( 0.1, 10 ), 1 - 0.9 ** 10, 1e-9, 'chance over hours' );
	ok( L.chanceOver( 0.1, 0 ) === 0, 'no time, no catch' );
	let seed = 1;
	const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const kauai = { chicken: 0, mongoose: 0, rat: 0 }, oahu = { chicken: 0, mongoose: 0, rat: 0 };
	for ( let i = 0; i < 2000; i ++ ) { kauai[ L.pickCatch( rnd, { kauai: true } ) ] ++; oahu[ L.pickCatch( rnd, { kauai: false } ) ] ++; }
	ok( kauai.mongoose === 0 && kauai.chicken > kauai.rat, `no mongooses on Kauaʻi, chickens everywhere (${JSON.stringify( kauai )})` );
	ok( oahu.mongoose > 0 && oahu.rat > 0 && oahu.chicken > 0, `Oʻahu catches all three (${JSON.stringify( oahu )})` );
	for ( const k of Object.keys( L.CATCH ) ) for ( const [ id, n ] of L.rollYields( k, rnd ) ) ok( getItem( id ) && n >= 1, `${k} yields ${id} ×${n}` );
	ok( L.rainFill( 5, 120, 0, 3 ) === 5 && L.rainFill( 5, 120, 1, 0 ) === 5, 'no rain or no time: nothing' );
	near( L.rainFill( 0, 120, 1, 1 ), 8, 1e-9, 'a barrel in a downpour: 8 L an hour' );
	ok( L.rainFill( 110, 120, 1, 5 ) === 120 && L.rainFill( 0, 30, 1, 1, 3 ) === 24, 'capped; a tarp catches three times as much' );
	ok( L.collectedLiquid( 10 ) === 'water' && L.collectedLiquid( L.STALE_H + 1 ) === 'dirty', 'rainwater goes stale' );
	// the alarm: 20 s, then 45 s of ringing with a pulse every 2 s
	const s = { left: 20, ring: 0, pulse: 0 };
	let t = 0, start = - 1, stop = - 1, pulses = 0;
	while ( t < 80 ) { const r = L.alarmTick( s, 0.25, { ring: 45, every: 2 } ); t += 0.25; if ( r.start ) start = t; if ( r.emit ) pulses ++; if ( r.stop ) stop = t; }
	near( start, 20, 1e-9, 'rings at 20 s' );
	near( stop, 65, 1e-9, 'stops 45 s later' );
	ok( pulses >= 22 && pulses <= 24, `a noise every 2 s while ringing (${pulses})` );
	// slow far ticks still ring and pulse
	const s2 = { left: 3, ring: 0, pulse: 0 };
	let p2 = 0;
	for ( let i = 0; i < 10; i ++ ) if ( L.alarmTick( s2, 2, { ring: 45, every: 2 } ).emit ) p2 ++;
	ok( p2 >= 8, `2 s ticks pulse too (${p2})` );
	const d = { on: true, charge: 1, pulse: 0 };
	let e = 0, died = false;
	for ( let i = 0; i < 40; i ++ ) { const r = L.deviceTick( d, 1, 0.05, { every: 4, drain: 1 } ); if ( r.emit ) e ++; if ( r.died ) died = true; }
	ok( e >= 4 && died && ! d.on && d.charge === 0, `a radio pulses every 4 s and dies with its batteries (${e})` );
	ok( L.planksLeft( 180 ) === 2 && L.planksLeft( 91 ) === 2 && L.planksLeft( 90 ) === 1 && L.planksLeft( 0 ) === 0 && L.planksLeft( - 5 ) === 0, 'planks left for a barricade hp' );
}

// ---- a stub game --------------------------------------------------------------------------------------------------------
const hf = {
	heightAt: () => 2, baseHeight: () => 2, normalAt: ( x, z, out ) => out.set( 0, 1, 0 ), surfaceAt: () => [ 0.8, 0, 0, 0 ], islandAt: () => 3, flagsNear: () => 0,
	raycast: ( ox, oy, oz, dx, dy, dz, maxT ) => { const t = dy < 0 ? ( oy - 2 ) / - dy : - 1; return t >= 0 && t <= maxT ? t : - 1; },
};
const toasts = [], noises = [], dropped = [], entities = [];
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {}, hf, physics: new Physics( hf, null ),
	events: new Events(), audio: { play() { return null; }, loop() { return null; }, buffers: new Map() }, settings: { get: () => true },
	interact: { addProvider( fn ) { this.fn = fn; return () => {}; }, target: null, holdT: 0 },
	input: { pressed: () => false, released: () => false, is: () => false, codes: () => [], pressedQ: new Set(), down: new Set(), consumeWheel: () => 0 },
	world: { isIndoors: () => false, isBeach: () => false, meta: { cities: [ { x: 5000, z: 0, radius: 500 } ] }, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 1 } },
	weather: { rain: 0, state: 'clear', cover: 0.3 },
	player: { pos: new THREE.Vector3( 0, 2, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stanceH: 1.6, get eye() { return this.pos.y + 1.6; }, shake: 0, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
	entities: { near: ( pos, r, type, out = [] ) => { out.length = 0; for ( const e of entities ) if ( Math.hypot( e.pos.x - pos.x, e.pos.z - pos.z ) <= r ) out.push( e ); return out; } },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => dropped.push( s ), inputActive: true, dead: false,
	app: { ui: { inventory: { other: null } } },
	register() {},
};
game.camera.position.set( 0, 3.6, 0 );
game.camera.updateMatrixWorld();
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.survival = new Survival( game );
game.actions = new Actions( game );
const pool = new Set();
game.itemLights = { add: ( s ) => { pool.add( s ); return s; }, remove: ( s ) => pool.delete( s ) };
game.itemUse = new ItemUse( game, null );
const M = game.placeables = new Placeables( game );
const inv = game.player.inventory;
inv.equip.back = makeStack( 'backpack_military', 1 );
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const finish = () => game.actions.update( 999 );
const at = ( x, z ) => new THREE.Vector3( x, 2, z );
// tick a record: real seconds in steps, and game hours along with them
const tick = ( p, secs, hours = 0, step = 0.25 ) => {
	const K = R.getPlaceable( p.kind ), n = Math.max( 1, Math.round( secs / step ) );
	for ( let i = 0; i < n; i ++ ) { game.time.hours += hours / n; K.update?.( p, step, game, hours / n ); }
};
const act = ( p, label ) => M.actionsOf( p ).find( a => a.label === label || a.label.startsWith( label ) );
const labels = ( p ) => M.actionsOf( p ).map( a => a.label );

// ---- light --------------------------------------------------------------------------------------------------------------
console.log( 'light' );
{
	const st = makeStack( 'lantern', 1, { full: true } );
	const p = M.add( 'light', st, at( 3, 0 ), 0 );
	ok( p && st.data.on && st.data.charge > 0 && p._light && pool.has( p._light ) && p._light.intensity === 16, 'a placed lantern switches on and lights the pool' );
	ok( p._obj && M.group.children.includes( p._obj ) && p._r > 0, 'it is drawn' );
	const c0 = st.data.charge;
	tick( p, 1, 2 );
	near( st.data.charge, c0 - 2, 1e-6, 'batteries drain in game hours' );
	st.data.charge = 0.05;
	tick( p, 1, 1 );
	ok( ! st.data.on && ! p._light && M.list.has( p.id ), 'flat batteries: off, no light, still there' );
	put( 'batteries', 2 );
	ok( labels( p ).includes( 'Replace batteries' ) && labels( p ).includes( 'Pick up' ), 'replace batteries offered: ' + labels( p ) );
	act( p, 'Replace batteries' ).run(); finish();
	ok( st.data.charge === getItem( 'lantern' ).tool.battery && inv.count( 'batteries' ) === 1, 'new batteries' );
	act( p, 'Turn on' ).run();
	ok( st.data.on && p._light, 'turned back on' );
	act( p, 'Pick up' ).run(); finish();
	ok( ! M.list.has( p.id ) && inv.find( s => s === st ) && ! pool.size, 'picked up as it was, light gone' );
	inv.remove( st );
	// a chemlight snaps as it goes down and is gone when it fades
	const ch = makeStack( 'chemlight', 1 );
	const q = M.add( 'light', ch, at( - 3, 0 ), 0 );
	ok( ch.data.on && q._light, 'a chemlight snaps and glows' );
	tick( q, 1, 11 );
	ok( ! M.list.has( q.id ) && ! pool.size, 'and fades away' );
	// a candle is lit where it stands, and burns out
	const cd = makeStack( 'candle', 1 );
	const r = M.add( 'light', cd, at( 0, 3 ), 0 );
	ok( ! cd.data.on && labels( r )[ 0 ] === 'Light', 'a candle waits to be lit' );
	act( r, 'Light' ).run(); finish();
	ok( ! cd.data.on && toasts.includes( 'Need a lighter or matches' ), 'needs a light' );
	put( 'lighter' );
	act( r, 'Light' ).run(); finish();
	ok( cd.data.on && r._light, 'lit with a lighter' );
	tick( r, 1, 9 );
	ok( ! M.list.has( r.id ), 'burnt out after 8 h' );
}

// ---- noise --------------------------------------------------------------------------------------------------------------
console.log( 'noise' );
{
	const p = M.add( 'noise', makeStack( 'alarm_clock' ), at( 10, 0 ), 0 );
	ok( labels( p ).slice( 0, 3 ).join( '|' ) === 'Set 20 s|Set 1 min|Set 3 min', 'alarm: set it: ' + labels( p ) );
	act( p, 'Set 20 s' ).run();
	ok( p.data.left === 20 && M.list.has( p.id ), 'set to ring in 20 s' );
	noises.length = 0;
	tick( p, 19 );
	ok( noises.length === 0, 'quiet while it counts down' );
	tick( p, 50 );
	const alarm = noises.filter( n => n.kind === 'alarm' );
	ok( alarm.length >= 20 && alarm.every( n => n.radius === 50 && n.source === p && Math.abs( n.pos.x - 10 ) < 1e-9 ), `rings with noise the infected hear (${alarm.length})` );
	ok( p.data.ring === 0 && p.data.left === 0 && labels( p )[ 0 ] === 'Set 20 s', 'and stops, ready to set again' );
	const rad = makeStack( 'radio', 1, { full: true } );
	const q = M.add( 'noise', rad, at( - 10, 0 ), 0 );
	act( q, 'Turn on' ).run();
	noises.length = 0;
	tick( q, 20, 0.5 );
	ok( noises.filter( n => n.kind === 'radio' && n.radius === 32 ).length >= 4 && rad.data.charge < getItem( 'radio' ).tool.battery, 'a radio playing draws them and drains' );
	rad.data.charge = 0.01;
	tick( q, 2, 0.5 );
	ok( ! q.data.on && labels( q ).includes( 'Crank' ), 'dead batteries: the emergency radio cranks' );
	act( q, 'Crank' ).run(); finish();
	ok( rad.data.charge >= 2, 'cranked' );
	M.remove( q, { give: false } ); M.remove( p, { give: false } );
}

// ---- collector ----------------------------------------------------------------------------------------------------------
console.log( 'collector' );
{
	const p = M.add( 'collector', makeStack( 'rain_barrel' ), at( 0, - 6 ), 0 );
	ok( p.data.L === 0 && p._box && game.physics.boxes.has( p._box.id ), 'a barrel stands in the way' );
	tick( p, 2, 2 );
	ok( p.data.L === 0, 'no rain, no water' );
	game.weather.rain = 1;
	tick( p, 2, 2 );
	near( p.data.L, 16, 0.01, 'a downpour fills it' );
	ok( p._obj.userData.water.visible && p._obj.userData.water.position.y > 0.1, 'the water shows' );
	game.weather.rain = 0;
	const bottle = put( 'water_bottle' ); bottle.data.amount = 0; bottle.data.liquid = null;
	const fill = M.actionsOf( p )[ 0 ];
	ok( /^Fill water bottle/i.test( fill.label ), 'fill a bottle: ' + fill.label );
	fill.run(); finish();
	const cap = getItem( 'water_bottle' ).tool.liquid;
	ok( Math.abs( bottle.data.amount - cap ) < 1e-6 && bottle.data.liquid === 'water' && Math.abs( p.data.L - ( 16 - cap ) ) < 1e-6, `bottle filled (${bottle.data.amount} L), barrel down to ${p.data.L.toFixed( 2 )} L` );
	act( p, 'Pick up' ).run(); finish();
	ok( M.list.has( p.id ) && toasts.at( - 1 ) === 'Empty it first', 'a full barrel stays put' );
	game.time.hours += L.STALE_H + 1;
	tick( p, 1, 0.1 );
	ok( p.data.liquid === 'dirty' && /stale/.test( R.getPlaceable( 'collector' ).sub( p ) ), 'three days later the water is stale' );
	game.world.isIndoors = () => true;
	game.weather.rain = 1;
	const L0 = p.data.L;
	tick( p, 1, 1 );
	ok( p.data.L === L0, 'nothing under a roof' );
	game.world.isIndoors = () => false; game.weather.rain = 0;
	act( p, 'Tip out' ).run(); finish();
	act( p, 'Pick up' ).run(); finish();
	ok( ! M.list.has( p.id ) && ! game.physics.boxes.has( p._box?.id ?? - 1 ) && inv.count( 'rain_barrel' ) + dropped.filter( s => s.id === 'rain_barrel' ).length === 1, 'emptied and picked up' );
	const t = M.add( 'collector', makeStack( 'tarp' ), at( 0, - 9 ), 0 );
	game.weather.rain = 1; tick( t, 1, 1 ); game.weather.rain = 0;
	ok( t.data.L === 24 && ! t._box, 'a tarp catches more, and you can walk round it' );
	M.remove( t, { give: false } );
}

// ---- traps --------------------------------------------------------------------------------------------------------------
console.log( 'traps' );
{
	const p = M.add( 'trap', makeStack( 'snare' ), at( 40, 40 ), 0 );
	ok( p.data.set && p.data.town > 4000 && p.data.moist === 0.8, `snare set, ${p.data.town} m from town` );
	const bait = put( 'fishing_bait', 2 );
	ok( /^Bait with squid bait/.test( labels( p )[ 0 ] ), 'bait it: ' + labels( p )[ 0 ] );
	M.actionsOf( p )[ 0 ].run(); finish();
	ok( p.data.bait === 'fishing_bait' && bait.qty === 1, 'baited' );
	game.player.pos.set( 40, 2, 41 );
	tick( p, 1, 500 );
	ok( ! p.data.catch, 'nothing comes while you stand there' );
	game.player.pos.set( 0, 2, 0 );
	tick( p, 1, 500 );
	ok( p.data.catch && ! p.data.set && L.CATCH[ p.data.catch ], 'a catch: ' + p.data.catch );
	game.time.hours += 30;
	const label = M.actionsOf( p )[ 0 ].label;
	ok( /^Take /.test( label ) && /rotten/.test( R.getPlaceable( 'trap' ).sub( p, game ) ), `take it (${label}), rotten after a day` );
	const before = [ ...inv.allStacks() ].length;
	M.actionsOf( p )[ 0 ].run(); finish();
	const got = [ ...inv.allStacks() ].filter( s => /raw_|feathers|bone/.test( s.id ) );
	ok( [ ...inv.allStacks() ].length > before && got.some( s => s.data.age >= 30 ), 'the meat has been lying there: ' + got.map( s => `${s.id}:${s.data.age ?? '-'}` ).join( ' ' ) );
	if ( M.list.has( p.id ) ) {
		ok( labels( p )[ 0 ] === 'Reset', 'then reset it' );
		M.actionsOf( p )[ 0 ].run(); finish();
		ok( p.data.set, 'set again' );
		M.remove( p, { give: false } );
	}

	// the spring trap
	const j = M.add( 'trap', makeStack( 'spring_trap' ), at( - 20, 20 ), 0 );
	ok( j.data.set, 'spring trap set' );
	const z = { type: 'zombie', alive: true, pos: new THREE.Vector3( - 20.6, 2, 20 ), radius: 0.32, health: 100, speed: 2, hits: [],
		damage( a, info ) { this.hits.push( { a, info } ); this.health -= a; if ( this.health <= 0 ) this.alive = false; } };
	entities.push( z );
	const K = R.getPlaceable( 'trap' );
	K.frame( j, 0.016, game );
	ok( j.data.set && ! z.hits.length, 'not yet: it is beside the trap' );
	z.pos.set( - 20.1, 2, 20.1 );
	noises.length = 0;
	K.frame( j, 0.016, game );
	ok( ! j.data.set && z.hits[ 0 ]?.a === L.JAW.zombie.dmg && z.hits[ 0 ].info.zone === 'leg' && noises.some( n => n.kind === 'trap' ), 'snap: a leg wound, and a loud one' );
	ok( j._victim === z, 'and it holds on' );
	z.pos.set( - 19, 2, 21 );
	K.frame( j, 0.1, game );
	ok( z.pos.x === - 20 && z.pos.z === 20 && z.speed === 0, 'pinned where it stood' );
	for ( let i = 0; i < 300; i ++ ) K.frame( j, 0.1, game );
	ok( ! j._victim && z.hits.length === 2, 'it tears free after a while, with another wound' );
	entities.length = 0;
	ok( labels( j )[ 0 ] === 'Reset', 'reset it' );
	M.actionsOf( j )[ 0 ].run(); finish();
	ok( j.data.set, 'set again' );
	// whoever set it steps off it first
	ok( j._safe, 'the setter is safe on it' );
	game.player.pos.set( - 20.1, 2, 20 );
	K.frame( j, 0.016, game );
	ok( j.data.set && ! M.held, 'standing where you set it does not spring it' );
	game.player.pos.set( - 22, 2, 20 );
	K.frame( j, 0.016, game );
	ok( ! j._safe, 'armed once you step away' );
	// the player steps in
	const hp = game.survival.health;
	game.player.pos.set( - 20.1, 2, 20 );
	K.frame( j, 0.016, game );
	ok( game.survival.health < hp && M.held === j && toasts.includes( 'Caught in a trap' ), 'you step in: hurt and caught' );
	ok( game.survival.moveModifiers().speed === 0, 'no walking away' );
	const free = game.interact.fn( { origin: new THREE.Vector3(), dir: new THREE.Vector3( 0, 0, - 1 ) }, 4 );
	ok( free?.[ 0 ]?.label === 'Pry open' && free[ 0 ].hold > 0, 'hold F to pry it open' );
	free[ 0 ].action();
	ok( ! M.held && game.survival.moveModifiers().speed > 0, 'free again' );
	game.player.pos.set( 0, 2, 0 );
	game.survival.health = 100; game.survival.bleeding = 0; game.survival.fracture = false;
	M.remove( j, { give: false } );
}

// ---- stash ----------------------------------------------------------------------------------------------------------------
console.log( 'stash' );
{
	const box = makeStack( 'stash_box' );
	const p = M.add( 'stash', box, at( 5, 5 ), 0 );
	itemsOf( box ).push( makeStack( 'canned_beans', 2 ) );
	let opened = null;
	game.app.ui.openContainer = ( c ) => { opened = c; };
	act( p, 'Open' ).run();
	ok( opened?.items === itemsOf( box ) && opened.capacity === 30 && opened.key === 'stash:' + p.id, 'opens as a container holding the tote\'s own items' );
	ok( ! labels( p ).includes( 'Bury' ), 'no shovel, no burying' );
	const sh = put( 'shovel' );
	act( p, 'Bury' ).run(); finish();
	ok( p.data.buried && labels( p ).join() === 'Dig up', 'buried: only digging gets at it' );
	inv.remove( sh );
	act( p, 'Dig up' ).run(); finish();
	ok( p.data.buried && toasts.at( - 1 ) === 'Need a shovel', 'needs the shovel back' );
	inv.add( sh );
	act( p, 'Dig up' ).run(); finish();
	ok( ! p.data.buried, 'dug up' );
	// round trip with its contents
	const save = { world: {} };
	M.serialize( save );
	const rec = save.world.placeables.find( o => o.i === p.id );
	ok( rec && rec.s.data.items[ 0 ].id === 'canned_beans', 'the save keeps the contents' );
	act( p, 'Pick up' ).run(); finish();
	const back = inv.find( s => s.id === 'stash_box' ) || dropped.find( s => s.id === 'stash_box' );
	ok( back === box && itemsOf( back ).length === 1, 'picked up with everything in it' );
	// any bag can be a stash
	ok( game.itemUse.actions( inv.equip.back ).some( a => a.verb === 'Stash' ), 'a backpack has a Stash verb' );
	// a shovel digs a bare hole: the shovel stays, the hole holds things, fills in once empty
	ok( game.itemUse.actions( sh ).some( a => a.verb === 'Dig stash' ), 'a shovel digs a stash' );
	ok( M.beginPlace( sh, { kind: 'stash', hole: true } ) && M.placer.active.spec.hole, 'placing a hole' );
	hf.flagsNear = () => 16;
	M.placer.active.pos.set( 0, 2, - 2 );
	ok( M.placer.check( M.placer.active, null, null ) === 'Needs soft ground', 'not through a floor' );
	hf.flagsNear = () => 0;
	const n0 = M.list.size;
	M.placer._commit( M.placer.active ); finish();
	const h = [ ...M.list.values() ].find( q => q.kind === 'stash' && ! q.stack );
	ok( M.list.size === n0 + 1 && h && inv.find( s => s === sh ) && M.nameOf( h ) === 'Hole', 'dug: the shovel is still yours' );
	act( h, 'Open' ).run();
	ok( opened.items === h.data.items && opened.capacity > 0, 'it opens as a container' );
	h.data.items.push( makeStack( 'rope' ) );
	act( h, 'Fill in' ).run(); finish();
	ok( M.list.has( h.id ) && toasts.at( - 1 ) === 'Empty it first', 'not filled in with things in it' );
	h.data.items.length = 0;
	act( h, 'Fill in' ).run(); finish();
	ok( ! M.list.has( h.id ), 'filled in' );
}

// ---- shelter --------------------------------------------------------------------------------------------------------------
console.log( 'shelter' );
{
	const p = M.add( 'shelter', makeStack( 'tent' ), at( - 8, - 8 ), 0 );
	ok( labels( p ).join( '|' ) === 'Sleep|Open|Pack up' && p._box, 'a tent: sleep, open, pack up; solid: ' + labels( p ) );
	p.data.items.push( makeStack( 'rope' ) );
	act( p, 'Pack up' ).run(); finish();
	ok( M.list.has( p.id ) && toasts.at( - 1 ) === 'Empty it first', 'not with gear inside' );
	p.data.items.length = 0;
	act( p, 'Pack up' ).run(); finish();
	ok( ! M.list.has( p.id ) && ! game.physics.boxes.has( p._box?.id ?? - 1 ), 'packed up' );
	const b = M.add( 'shelter', makeStack( 'sleeping_bag' ), at( - 8, - 4 ), 0 );
	ok( labels( b ).join( '|' ) === 'Sleep|Roll up' && ! b._box, 'a sleeping bag: sleep, roll up' );
	M.remove( b, { give: false } );
}

// ---- barricade ------------------------------------------------------------------------------------------------------------
console.log( 'barricade' );
{
	const door = { key: '12:0:d3', pos: new THREE.Vector3( 0, 3.1, - 2 ), leaves: [ { yaw0: 0, y: 2, batch: { t: 0.045 } } ], w: 1, h: 2.1, broken: false, isOpen: false, hp: 140 };
	// (doors.js binds bash as an arrow, so the wrapper calls it bare)
	door.bash = ( a ) => { door.hp -= a; return true; };
	const p = M.add( 'barricade', null, { x: 0, y: 2, z: - 1.95 }, 0, { door: door.key, n: 2, hp: 2 * L.PLANK_HP, w: 1, item: 'planks' } );
	ok( M.byDoor( door.key ) === p && p._obj, 'a barricade on the door' );
	wrapDoor( game, door );
	door.bash( 50 );
	ok( door.hp === 140 && p.data.n === 2 && p.data.hp === 130, 'blows go into the planks first' );
	door.bash( 60 );
	ok( p.data.n === 1 && door.hp === 140, 'a plank gives way' );
	door.bash( 100 );
	ok( ! M.list.has( p.id ) && door.hp === 140, 'the last one breaks off' );
	door.bash( 30 );
	ok( door.hp === 110, 'then the door takes it' );
	ok( getItem( 'planks' ) && R.getPlaceable( 'barricade' ).sub( { data: { n: 3 } } ) === '3 planks', 'sub' );
}

// ---- placing ----------------------------------------------------------------------------------------------------------------
console.log( 'placing' );
{
	inv.equip.back = makeStack( 'backpack_military', 1 ); // an empty bag: room for what follows
	const lan = put( 'lantern', 1, { full: true } );
	ok( game.itemUse.actions( lan ).some( a => a.verb === 'Place' ), 'a lantern has a Place verb' );
	for ( const [ id, verb ] of [ [ 'snare', 'Set' ], [ 'tent', 'Pitch' ], [ 'sleeping_bag', 'Lay out' ], [ 'torch', 'Plant' ], [ 'tarp', 'Rig' ], [ 'alarm_clock', 'Place' ] ] ) {
		const s = makeStack( id );
		ok( game.itemUse.actions( s ).some( a => a.verb === verb ), `${id}: ${verb}` );
	}
	ok( M.beginPlace( lan ) && M.placing, 'placing starts' );
	const A = M.placer.active;
	A.pos.set( 0, 2, - 2 );
	ok( M.placer.check( A, null, null ) === null, 'open ground is fine' );
	A.pos.set( 0, 2, - 20 );
	ok( M.placer.check( A, null, null ) === 'Too far', 'too far' );
	A.pos.set( 0, 2, - 2 );
	const wall = game.physics.add( { x: 0, y: 3, z: - 2, hx: 1, hy: 1, hz: 0.1, yaw: 0 } );
	ok( M.placer.check( A, null, null ) === 'Blocked', 'a wall in the way' );
	game.physics.remove( wall );
	hf.normalAt = ( x, z, out ) => out.set( 0.75, 0.66, 0 ).normalize();
	ok( M.placer.check( A, null, null ) === 'Too steep', 'a slope' );
	hf.normalAt = ( x, z, out ) => out.set( 0, 1, 0 );
	const other = M.add( 'light', makeStack( 'candle' ), { x: 0.05, y: 2, z: - 2 }, 0 );
	ok( M.placer.check( A, null, null ) === 'Too close', 'on top of another' );
	M.remove( other, { give: false } );
	M.placer.cancel();
	// a rain barrel needs the sky, a snare soft ground
	ok( M.beginPlace( put( 'rain_barrel' ) ) );
	game.world.isIndoors = () => true;
	M.placer.active.pos.set( 0, 2, - 2.5 );
	ok( M.placer.check( M.placer.active, null, null ) === 'Needs open sky', 'barrel indoors' );
	game.world.isIndoors = () => false;
	M.placer.cancel();
	ok( M.beginPlace( put( 'snare' ) ) );
	hf.flagsNear = () => 1;
	M.placer.active.pos.set( 0, 2, - 2 );
	ok( M.placer.check( M.placer.active, null, null ) === 'Needs soft ground', 'snare on a road' );
	hf.flagsNear = () => 0;
	// confirming: one unit leaves the inventory and becomes the record
	const n0 = M.list.size, snares = inv.count( 'snare' );
	M.placer.active.pos.set( 0, 2, - 2 );
	M.placer._commit( M.placer.active ); finish();
	ok( M.list.size === n0 + 1 && inv.count( 'snare' ) === snares - 1 && ! M.placing, `placed one (${M.list.size - n0}, ${snares} -> ${inv.count( 'snare' )}, ${M.placing})` );
}

// ---- edge cases ------------------------------------------------------------------------------------------------------------
console.log( 'edge cases' );
{
	const { countMeshes } = await import( '../src/game/items/placeables/merge.js' );
	const realInv = game.player.inventory;
	// draw calls: every placed thing is a handful of meshes (merged per material), however many parts its model has
	for ( const id of [ 'lantern', 'chemlight', 'torch', 'radio', 'tent', 'sleeping_bag', 'tarp', 'alarm_clock', 'snare', 'spring_trap', 'rain_barrel', 'stash_box', 'candle', 'tiki_torch', 'backpack_hiking' ] ) {
		const spec = R.placeOf( getItem( id ) ) || { kind: 'stash' };
		const p = M.add( spec.kind, makeStack( id, 1, { full: true } ), at( 30, 30 ), 0 );
		const n = countMeshes( p._obj );
		ok( n <= 6, `${id} placed draws ${n} meshes` );
		M.remove( p, { give: false } );
	}
	const bar = M.add( 'barricade', null, { x: 30, y: 2, z: 30 }, 0, { door: 'x:0:d9', n: 4, hp: 360, w: 1, item: 'planks' } );
	ok( countMeshes( bar._obj ) <= 3, `four planks draw ${countMeshes( bar._obj )} meshes` );
	M.remove( bar, { give: false } );

	// one off a stack in full pockets: the rest stays put, nothing is dropped
	game.player.inventory = new PlayerInventory();
	const pk = game.player.inventory;
	const four = makeStack( 'snare', 4 );
	pk.pockets.push( four );
	const drops = dropped.length;
	ok( M.beginPlace( four ), 'placing from a full pocket' );
	M.placer.active.pos.set( 0, 2, - 2 );
	M.placer._commit( M.placer.active ); finish();
	const sn = [ ...M.list.values() ].find( q => q.item === 'snare' && q.stack !== four );
	ok( sn && sn.stack.qty === 1 && four.qty === 3 && pk.pockets[ 0 ] === four && dropped.length === drops && sn.stack.uid !== four.uid, `one set, three left in the pocket, nothing dropped (${four.qty}, ${dropped.length - drops} dropped)` );
	M.remove( sn, { give: false } );

	// from the container on screen: closing the screen to place doesn't lose it
	const shelf = { items: [ makeStack( 'rain_barrel' ) ], capacity: 100, pos: at( 0, - 1 ) };
	const barrel = shelf.items[ 0 ];
	game.app.ui.inventory.other = shelf;
	let closed = 0;
	game.app.ui.closeScreen = () => { closed ++; game.app.ui.inventory.other = null; };
	ok( M.beginPlace( barrel ) && closed === 1 && M.placer.active.box === shelf, 'placing from a shelf remembers the shelf' );
	ok( M._has( barrel, M.placer.active.box ), 'still there after the screen closed' );
	M.placer.active.pos.set( 0, 2, - 2.5 );
	M.placer._commit( M.placer.active ); finish();
	const rb = [ ...M.list.values() ].find( q => q.stack === barrel );
	ok( rb && shelf.items.length === 0 && shelf.dirty, 'the barrel left the shelf and stands there' );
	M.remove( rb, { give: false } );
	delete game.app.ui.closeScreen;

	// a tool that makes something and stays yours (a domain's rack, an imu)
	R.addPlaceable( 'test_made', { place: { time: 2, gerund: 'Building' } } );
	const ham = makeStack( 'hammer' );
	pk.pockets.push( ham );
	ok( M.beginPlace( ham, { kind: 'test_made', keep: true, item: 'planks', name: 'Rack', spec: { verb: 'Build' } } ), 'a hammer builds a rack' );
	ok( M.placer.candidate().label === 'Build rack', 'prompt: ' + M.placer.candidate().label );
	M.placer.active.pos.set( 0, 2, - 2 );
	M.placer._commit( M.placer.active ); finish();
	const rack = [ ...M.list.values() ].find( q => q.kind === 'test_made' );
	ok( rack && rack.item === 'planks' && ! rack.stack && pk.pockets.includes( ham ), 'built; the hammer is still yours' );
	M.remove( rack, { give: false } );
	R.KINDS.delete( 'test_made' );

	// water: refused unless the kind wants it
	R.addPlaceable( 'test_wet', { water: 'only' } );
	ok( M.beginPlace( ham, { kind: 'test_wet', keep: true } ) );
	const A = M.placer.active;
	A.pos.set( 2, 2, 0 );
	ok( M.placer.check( A, null, null ) === 'Needs water', 'a fish trap needs water' );
	const wl = game.physics.waterLevel;
	game.physics.waterLevel = () => 2.4; // the shallows: the ground under 40 cm of water
	ok( M.placer.check( A, null, null ) === null, 'and goes in it: ' + M.placer.check( A, null, null ) );
	M.placer.cancel();
	ok( M.beginPlace( put( 'candle' ) ) );
	M.placer.active.pos.set( 2, 2, 0 );
	ok( M.placer.check( M.placer.active, null, null ) === 'In water', 'a candle does not' );
	M.placer.cancel();
	game.physics.waterLevel = wl;
	R.KINDS.delete( 'test_wet' );
	game.player.inventory = realInv;

	// food left in a stash or a tent goes off; the open one is aged by ItemUse instead, a cooler bag halves it
	const tote = makeStack( 'stash_box' );
	itemsOf( tote ).push( makeStack( 'raw_chicken' ) );
	const st = M.add( 'stash', tote, at( 6, 6 ), 0 );
	tick( st, 2, 10 );
	near( itemsOf( tote )[ 0 ].data.age || 0, 10, 1e-6, 'meat in a tote ages' );
	game.app.ui.inventory.other = { items: itemsOf( tote ), capacity: 30 };
	tick( st, 2, 10 );
	near( itemsOf( tote )[ 0 ].data.age, 10, 1e-6, 'not twice while it is open' );
	game.app.ui.inventory.other = null;
	M.remove( st, { give: false } );
	const cool = makeStack( 'cooler_bag' );
	if ( getItem( 'cooler_bag' )?.backpack?.keepsFresh ) {
		itemsOf( cool ).push( makeStack( 'raw_chicken' ) );
		const cs = M.add( 'stash', cool, at( 6, 8 ), 0 );
		tick( cs, 2, 10 );
		ok( itemsOf( cool )[ 0 ].data.age < 10, `a cooler bag slows it (${itemsOf( cool )[ 0 ].data.age})` );
		M.remove( cs, { give: false } );
	}
	const tent = M.add( 'shelter', makeStack( 'tent' ), at( - 6, 8 ), 0 );
	tent.data.items.push( makeStack( 'raw_chicken' ) );
	tick( tent, 2, 5 );
	near( tent.data.items[ 0 ].data.age || 0, 5, 1e-6, 'and in a tent' );
	M.remove( tent, { give: false } );

	// placed lights hardly show by day outdoors; at night, or indoors, they light fully
	const lan = M.add( 'light', makeStack( 'lantern', 1, { full: true } ), at( 9, 9 ), 0 );
	game.world.sky.night = 0; M.light( lan, { color: 0xffffff, intensity: 16, range: 12 } );
	ok( lan._light.dim < 0.3, `dim by day (${lan._light.dim})` );
	game.world.sky.night = 1; M.light( lan, { color: 0xffffff, intensity: 16, range: 12 } );
	ok( lan._light.dim === 1, 'full at night' );
	game.world.sky.night = 0; lan._in = true; M.light( lan, { color: 0xffffff, intensity: 16, range: 12 } );
	ok( lan._light.dim === 1, 'full indoors' );
	game.world.sky.night = 1;
	M.remove( lan, { give: false } );

	// the prompt follows a tap at once
	const al = M.add( 'noise', makeStack( 'alarm_clock' ), at( 0, - 2 ), 0 );
	const ray = { origin: new THREE.Vector3( 0, 2.5, 0 ), dir: new THREE.Vector3( 0, - 0.3, - 1 ).normalize() };
	let c = game.interact.fn( ray, 4 )?.find( x => x.plRec === al );
	ok( c && c.label === 'Set 20 s' && c.plTap && c.hold > 0, 'prompt: ' + c?.label );
	ok( game.interact.fn( ray, 4 )?.find( x => x.plRec === al ) === c, 'the prompt is reused while nothing changes' );
	c.plTap();
	c = game.interact.fn( ray, 4 )?.find( x => x.plRec === al );
	ok( c?.label === 'Turn off' && /Rings in 20 s/.test( c.sub ), 'and changes as soon as it is set: ' + c?.label + ' / ' + c?.sub );
	M.remove( al, { give: false } );

	// a barricade from the far side: the door just won't open
	const door = { key: '9:0:d1', pos: new THREE.Vector3( 0, 3.1, - 2 ) };
	const b2 = M.add( 'barricade', null, { x: 0, y: 2, z: - 1.95 }, 0, { door: door.key, n: 2, hp: 180, w: 1, item: 'planks' } );
	game.player.pos.set( 0, 2, 0 );
	ok( ! M._farSide( b2, door ), 'on the planks side' );
	game.player.pos.set( 0, 2, - 4 );
	ok( M._farSide( b2, door ), 'on the far side' );
	const fc = M._blockedC( b2, door );
	fc.action();
	ok( fc.label === 'Open' && fc.sub === 'Barricaded' && M.list.has( b2.id ) && b2.data.n === 2, 'nothing comes off from there' );
	game.player.pos.set( 0, 2, 0 );
	M.remove( b2, { give: false } );

	// dying lets go of the trap and drops the ghost
	const jt = M.add( 'trap', makeStack( 'spring_trap' ), at( 12, 0 ), 0 );
	M.hold( jt );
	ok( M.beginPlace( put( 'candle' ) ) && M.placing );
	game.dead = true;
	M.update( 0.016 );
	ok( ! M.held && ! M.placing, 'dead: free of the trap, nothing being placed' );
	game.dead = false;
	// in creative the jaws never take the player
	game.mode = 'creative';
	jt._safe = false;
	game.player.pos.set( 12, 2, 0 );
	R.getPlaceable( 'trap' ).frame( jt, 0.016, game );
	ok( jt.data.set && ! M.held, 'creative: walk over it' );
	game.mode = 'survival';
	game.player.pos.set( 0, 2, 0 );
	M.remove( jt, { give: false } );
}

// ---- persistence ----------------------------------------------------------------------------------------------------------
console.log( 'persistence' );
{
	const save = { world: {} };
	const a = M.add( 'noise', makeStack( 'alarm_clock' ), at( 1, 1 ), 0.5 );
	a.data.left = 33;
	M.serialize( save );
	save.world.placeables.push( { i: 'x1', k: 'fish_trap_from_a_domain', it: 'tarp', p: [ 0, 0, 0 ], y: 0, s: null, d: { fish: 2 } } );
	const n = save.world.placeables.length;
	const M2 = new Placeables( game );
	M2.load( save );
	ok( M2.list.size === n - 1 && M2.orphans.length === 1, 'loads every known kind, keeps the unknown one aside' );
	const a2 = M2.list.get( a.id );
	ok( a2 && a2.data.left === 33 && Math.abs( a2.yaw - 0.5 ) < 0.01 && a2._obj, 'the alarm comes back set, turned, drawn' );
	const save2 = { world: {} };
	M2.serialize( save2 );
	ok( save2.world.placeables.length === n && save2.world.placeables.some( o => o.k === 'fish_trap_from_a_domain' && o.d.fish === 2 ), 'and saves the unknown one again' );
	M2.dispose();
	// through JSON, as the save system stores it: lit lights light again, a ringing alarm rings, stashes keep their
	// contents, water stays in the barrel
	for ( const p of [ ...M.list.values() ] ) M.remove( p, { give: false } );
	pool.clear();
	const lit = M.add( 'light', makeStack( 'lantern', 1, { full: true } ), at( 2, 2 ), 0 );
	const ring = M.add( 'noise', makeStack( 'alarm_clock' ), at( - 2, 2 ), 0 );
	ring.data.left = 0; ring.data.ring = 30; ring.data.pulse = 1;
	const tote = M.add( 'stash', makeStack( 'stash_box' ), at( 2, - 4 ), 0 );
	itemsOf( tote.stack ).push( makeStack( 'canned_beans', 3 ) );
	const hole = M.add( 'stash', null, at( - 2, - 4 ), 0, null, 'hole' );
	hole.data.items.push( makeStack( 'rope' ) ); hole.data.buried = true;
	const brl = M.add( 'collector', makeStack( 'rain_barrel' ), at( 5, - 4 ), 0 );
	brl.data.L = 42;
	const s3 = { world: {} };
	M.serialize( s3 );
	const json = JSON.parse( JSON.stringify( s3 ) );
	for ( const p of [ ...M.list.values() ] ) M.remove( p, { give: false } );
	ok( ! pool.size, 'all gone' );
	const loops = [];
	game.audio.loop = ( name ) => { loops.push( name ); return { stop() {} }; };
	const M3 = new Placeables( game );
	M3.load( json );
	const g = ( id ) => M3.list.get( id );
	ok( M3.list.size === 5 && g( lit.id )?._light && pool.has( g( lit.id )._light ) && g( lit.id ).stack.data.on, 'the lantern comes back lit' );
	ok( g( ring.id )?.data.ring === 30 && loops.includes( 'alarm_ring' ), 'the alarm comes back ringing' );
	ok( itemsOf( g( tote.id ).stack )[ 0 ]?.id === 'canned_beans' && itemsOf( g( tote.id ).stack )[ 0 ].qty === itemsOf( tote.stack )[ 0 ].qty, 'the tote keeps its beans' );
	ok( g( hole.id ).data.buried && g( hole.id ).data.items[ 0 ]?.id === 'rope' && M3.nameOf( g( hole.id ) ) === 'Mound', 'the buried hole keeps its rope' );
	ok( g( brl.id ).data.L === 42 && g( brl.id )._obj.userData.water.visible && g( brl.id )._box, 'the barrel keeps its water and stands in the way' );
	M3.dispose();
	ok( ! pool.size, 'disposed: no lights left' );
	game.audio.loop = () => null;
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
