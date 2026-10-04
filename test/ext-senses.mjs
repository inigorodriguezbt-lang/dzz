// The senses, hazards and diving equipment (Node, a fake DOM for canvas labels): node test/ext-senses.mjs
//   the catalogue: every item has a polished model (no placeholder, a sane triangle count), a place in the world (rares
//   stay rare) or is made, something to do and short plain text
//   the numbers (ext/senses/logic.js): vog round Kīlauea's vents and downwind, the detector's beeping, the vog condition,
//   what masks keep out and how filters wear, scuba air by depth, the rebreather, nitrogen and the bends, ear protection
//   and ringing, the grade's uniforms for night vision and thermal
//   the system on a stub game (game.senses): goggles and their batteries, handhelds at the eye, the IR beam, thermal
//   warming the living and chilling the infected (and putting it back), ears (plugs, muffs, the electronic defenders and
//   ringing after gunfire), the vog zone with and without a mask (coughs the infected hear, filter life, the cure),
//   scuba air under water against Survival's breath, the rebreather's oxygen limit, the bends, lights flooding, the
//   laser lure, the parabolic mic, the gas detector, the smartwatch, the weather radio's forecast, the combos and
//   verbs, the placed compressor, motion sensors and spotting scope, Game.grade's keys, and a save round trip
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const THREE = await import( 'three' );
await import( '../src/game/items/defs/index.js' );
const { ITEMS, getItem, makeStack } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const C = await import( '../src/game/items/combos.js' );
const L = await import( '../src/game/items/ext/senses/logic.js' );
const RT = await import( '../src/game/items/ext/senses/runtime.js' );
const K = await import( '../src/game/items/ext/senses/kinds.js' );
const { hasModelBuilder, buildItemModel } = await import( '../src/render/ItemModels.js' );
const { PlayerInventory } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );
const { Events } = await import( '../src/core/Events.js' );
const { startSystems } = await import( '../src/game/items/hooks.js' );
const { Placeables } = await import( '../src/game/items/Placeables.js' );
const { getPlaceable } = await import( '../src/game/items/placeables/registry.js' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };
const near = ( a, b, eps, msg ) => ok( Math.abs( a - b ) <= eps, `${msg} (${a} vs ${b})` );

// ---- the catalogue ---------------------------------------------------------------------------------------------------
console.log( 'catalogue' );
const SENSES = [ ...ITEMS.values() ].filter( d => d.tags.includes( 'senses' ) );
const NEW = SENSES.filter( d => ! [ 'gas_mask', 'gas_mask_civil', 'respirator' ].includes( d.id ) );
ok( NEW.length >= 25 && NEW.length <= 40, `senses items (${NEW.length})` );
const tris = ( obj ) => { let n = 0; obj.traverse( m => { if ( m.isMesh ) n += ( m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count ) / 3; } ); return n; };
for ( const d of SENSES ) {
	ok( hasModelBuilder( d.model.type ), `${d.id}: model builder ${d.model.type}` );
	let obj = null;
	try { obj = buildItemModel( d ); } catch ( e ) { /* reported below */ }
	ok( obj && ! obj.userData.fallback, `${d.id}: model builds` );
	if ( obj ) {
		const size = new THREE.Box3().setFromObject( obj ).getSize( new THREE.Vector3() );
		ok( size.y > 0.002 && Math.max( size.x, size.z ) < 1 && Math.max( size.x, size.y, size.z ) > 0.02, `${d.id}: real size (${size.toArray().map( v => v.toFixed( 3 ) ).join( ' x ' )})` );
		ok( tris( obj ) < 9000, `${d.id}: ${Math.round( tris( obj ) )} triangles` );
	}
	ok( d.desc && d.desc.length <= 40 && ! /!/.test( d.desc ), `${d.id}: short plain description "${d.desc}"` );
}
const visible = new Set(), made = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( /^(car_|zombie_)/.test( name ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
for ( const r of allRecipes() ) made.add( r.out[ 0 ] );
for ( const c of C.allCombos() ) for ( const [ id ] of c.out ) made.add( id );
made.add( 'scuba_set' ); // a regulator onto a tank (the combo's run replaces the tank)
for ( const d of NEW ) ok( visible.has( d.id ) || made.has( d.id ), `${d.id}: found in the world or made` );
// rare kit stays rare: the share of an armory's or a helicopter's rolls
const share = ( table, id ) => { const t = compileTable( LOOT_TABLES[ table ] ), e = t.entries.find( x => x.ids.length === 1 && x.ids[ 0 ] === id ); return e ? e.w / t.total : 0; };
ok( share( 'military_armory', 'nvg_goggles' ) < 0.012 && share( 'military_armory', 'nvg_goggles' ) > 0, `NVGs ${( share( 'military_armory', 'nvg_goggles' ) * 100 ).toFixed( 2 )}% of armory rolls` );
ok( share( 'military_armory', 'thermal_goggles' ) < 0.005, 'thermal goggles rarer still' );
ok( share( 'site_heli_crash', 'rebreather' ) < 0.003 && getItem( 'rebreather' ).rarity === 'legendary', 'a rebreather is a find' );
ok( share( 'surf', 'scuba_tank' ) > 0.01, 'tanks in the dive and surf shops' );
// the military kit isn't tagged into the tag-picked pools (a bedroom or a locker's clothing pick)
for ( const d of NEW ) ok( ! d.tags.some( t => [ 'military', 'clothing', 'casual', 'surf', 'sports', 'police', 'tourist', 'valuable' ].includes( t ) ), `${d.id}: no pool tag` );
// devices: batteries, cells and slots
for ( const d of NEW ) if ( d.tool?.battery ) ok( [ 'aa', 'cr123', 'usb', 'd' ].includes( d.tool.cell ?? 'aa' ), `${d.id}: cell ${d.tool.cell}` );
ok( getItem( 'nvg_goggles' ).clothing.slot === 'eyes' && getItem( 'thermal_goggles' ).clothing.slot === 'eyes' && getItem( 'electronic_earmuffs' ).clothing.slot === 'head', 'goggles on the eyes, defenders on the head' );
ok( getItem( 'scuba_set' ).clothing.slot === 'back' && getItem( 'rebreather' ).clothing.slot === 'vest' && getItem( 'scuba_bcd' ).clothing.slot === 'vest', 'a set on the back, a rebreather on the chest' );
ok( getItem( 'nvg_monocular' ).tool.kind === 'binoculars' && getItem( 'thermal_monocular' ).tool.kind === 'binoculars', 'handhelds aim like binoculars' );
ok( getItem( 'gas_mask' ).senses?.filter === 'gas_filter' && getItem( 'respirator' ).senses?.filter === 'respirator_cartridges', 'masks take filters' );

// ---- the numbers ---------------------------------------------------------------------------------------------------------
console.log( 'numbers' );
{
	const H = L.VENTS[ 0 ];
	const at = ( x, z, w = 0.45 ) => L.vogAt( x, z, L.TRADES.x, L.TRADES.z, w );
	ok( at( H.x, H.z ).vog > 0.95, 'thick at Halemaʻumaʻu' );
	ok( at( H.x + 3000, H.z - 3000 ).vog === 0 && at( 0, 0 ).vog === 0, 'clear far away and in Honolulu' );
	const down = at( H.x + L.TRADES.x * 600, H.z + L.TRADES.z * 600 ).vog, up = at( H.x - L.TRADES.x * 600, H.z - L.TRADES.z * 600 ).vog;
	ok( down > 0.2 && up < 0.01, `the plume trails downwind (${down.toFixed( 2 )} vs ${up.toFixed( 2 )} upwind)` );
	ok( at( H.x + L.TRADES.x * 900, H.z + L.TRADES.z * 900, 1 ).vog > at( H.x + L.TRADES.x * 900, H.z + L.TRADES.z * 900, 0 ).vog, 'a stronger wind carries it further' );
	const lz = L.VENTS.find( v => v.laze );
	ok( at( lz.x, lz.z ).laze > 0.8 && at( lz.x, lz.z ).vog < 0.01, 'laze at the ocean entry' );
	ok( L.ppm( 1 ) > 10 && L.beepEvery( 0.05 ) === 0 && L.beepEvery( 0.5 ) > L.beepEvery( 4 ) && Math.abs( L.beepEvery( 20 ) - L.DETECTOR.every[ 1 ] ) < 1e-9, 'the detector beeps faster as it thickens' );
	let v = 0;
	for ( let i = 0; i < 60; i ++ ) v = L.vogStep( v, 1, 0, 1 );
	ok( v > 0.6, `a minute in thick vog unmasked (${v.toFixed( 2 )})` );
	let m = 0;
	for ( let i = 0; i < 600; i ++ ) m = L.vogStep( m, 1, 0.98, 1 );
	ok( m === 0, 'a filtered gas mask keeps it out' );
	let r1 = v, r2 = v;
	for ( let i = 0; i < 60; i ++ ) { r1 = L.vogStep( r1, 0, 0, 1 ); r2 = L.vogStep( r2, 0, 0, 1, true ); }
	ok( r1 < v && r2 < r1, 'it clears in clean air, faster with the inhaler' );
	const mask = makeStack( 'gas_mask' ); mask.data.filter = { id: 'gas_filter', life: 1 };
	ok( L.maskProtection( mask ).k === 0.98 && L.maskProtection( mask ).eyes, 'gas mask with a filter: 98 %, eyes covered' );
	mask.data.filter.life = 0;
	ok( L.maskProtection( mask ).k === L.NO_FILTER, 'a spent filter barely helps' );
	const resp = makeStack( 'respirator' ); resp.data.filter = { id: 'respirator_cartridges', life: 0.5 };
	ok( L.maskProtection( resp ).k === 0.9 && ! L.maskProtection( resp ).eyes, 'the half mask: 90 %, the eyes bare' );
	ok( L.maskProtection( makeStack( 'n95_mask' ) ).k < 0.4 && L.maskProtection( null ).k === 0, 'an N95 a little, nothing nothing' );
	const scba = makeStack( 'scba_pack' ); scba.data.air = 200;
	ok( L.maskProtection( null, scba ).k === 1 && L.maskProtection( null, scba ).air, 'an SCBA: clean air' );
	const f = { id: 'gas_filter', life: 1 };
	L.wearFilter( f, 1, L.FILTERS.gas_filter / 2 );
	near( f.life, 0.5, 1e-9, 'a filter wears by the vog it stops' );
	L.wearFilter( f, 0, 1000 );
	near( f.life, 0.5, 1e-9, 'not in clean air' );
	// air
	ok( Math.abs( L.airUse( 10, 60 ) / L.airUse( 0, 60 ) - 2 ) < 1e-9 && Math.abs( L.airUse( 30, 60 ) / L.airUse( 0, 60 ) - 4 ) < 1e-9, 'air by ambient pressure: 2× at 10 m, 4× at 30 m' );
	ok( L.minutesLeft( 200, 0 ) > 30 && L.minutesLeft( 200, 30 ) < 12 && L.minutesLeft( 200, 30 ) > 8, `a full tank: ${L.minutesLeft( 200, 0 ).toFixed( 0 )} min at the surface, ${L.minutesLeft( 200, 30 ).toFixed( 1 )} at 30 m` );
	let n = 0;
	for ( let i = 0; i < 360; i ++ ) n = L.nitrogen( n, 25, 1 );
	ok( n > 1.2 && L.ndl( n, 25 ) === 0 && L.ndl( 0, 18 ) > 5 && L.ndl( 0, 5 ) === 99, `six minutes at 25 m loads ${n.toFixed( 2 )}; the no-stop time (${L.ndl( 0, 18 )} min at 18 m)` );
	ok( L.bubbleStep( 3, 1, 1 ) > 0 && L.bubbleStep( 1.5, 1, 1 ) === 0 && L.bubbleStep( 3, 0.1, 1 ) === 0, 'bubbles from a fast ascent when loaded (swimming up is fine, floating up is not)' );
	for ( let i = 0; i < 400; i ++ ) n = L.nitrogen( n, 3, 1 );
	ok( n === 0, 'a slow surface interval clears it' );
	// hearing
	ok( L.earMix( 'open' ).dry === 1 && L.earMix( 'plugs' ).dry < 0.5 && L.earMix( 'plugs' ).lp < 4000, 'plugs: quieter and duller' );
	const act = L.earMix( 'active' );
	ok( act.wet === 1 && act.dry === 0 && act.threshold < - 20 && act.makeup > 1, 'electronic: the limiter path with make-up gain' );
	ok( L.ringFrom( 300, 2, false, 0 ) > 0.1 && L.ringFrom( 300, 2, true, 0 ) > L.ringFrom( 300, 2, false, 0 ) && L.ringFrom( 300, 2, false, 1 ) === 0 && L.ringFrom( 300, 40, false, 0 ) < L.ringFrom( 300, 2, false, 0 ), 'ringing: louder indoors, none covered, less far off' );
	ok( L.earMix( 'open', 0.9 ).lp < 4000, 'ringing dulls the mix' );
	// the grade
	const g1 = L.viewGrade( { mode: 1, tube: 'gen3', k: 1 } );
	ok( g1.nv === 1 && g1.thermal === 0 && g1.nvGain === L.TUBES.gen3.gain && g1.nvTint.length === 3, 'night vision: the gen 3 tube' );
	const g0 = L.viewGrade( { mode: 1, tube: 'gen1', k: 0.5, low: true } );
	ok( g0.nv === 0.5 && g0.nvGain < L.TUBES.gen1.gain && g0.nvWarp > 0, 'a Gen-1 with weak batteries: dimmer, warped' );
	const g2 = L.viewGrade( { mode: 2, core: 'handheld', palette: 2, k: 1 } );
	ok( g2.thermal === 1 && g2.nv === 0 && g2.thPalette === 2 && g2.thRes === L.CORES.handheld.res, 'thermal: the palette and the coarse core' );
	ok( L.viewGrade( null ).nv === 0 && L.viewGrade( { mode: 0 } ).thermal === 0, 'nothing on: both off' );
}

// ---- a stub game ------------------------------------------------------------------------------------------------------------
const toasts = [], noises = [], dropped = [], played = [];
let waterLevel = 0;
const lineOfSight = { ok: true };
const physics = {
	waterLevel: () => waterLevel,
	raycast: ( o, d, maxT ) => physics.hit && physics.hit.t <= maxT ? { t: physics.hit.t, point: o.clone().addScaledVector( d, physics.hit.t ), normal: new THREE.Vector3( 0, 1, 0 ) } : null,
	lineOfSight: () => lineOfSight.ok, ground: ( x, z, y ) => ( { y: 0 } ), add: ( b ) => b, remove() {}, update() {},
	hit: null,
};
const entities = { list: [], near( p, r, type, out = [] ) { out.length = 0; for ( const e of this.list ) if ( ( ! type || e.type === type ) && Math.hypot( e.pos.x - p.x, e.pos.z - p.z ) <= r ) out.push( e ); return out; }, raycast: () => null };
const sky = { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0, sunColor: new THREE.Color( 3, 3, 3 ), moonPhase: 0.2 };
const weather = { rain: 0, wind: 0.45, sea: 0.4, state: 'fair', cover: 0.4, nextChange: 2, set( s ) { this.state = s; this.nextChange = 4; return true; } };
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {},
	events: new Events(), audio: { play( n, o ) { played.push( [ n, o ] ); return null; }, loop() { return { set() {}, stop() {} }; }, buffers: new Map() }, settings: { get: ( k ) => k === 'fov' ? 62 : true },
	interact: { addProvider() { return () => {}; }, target: null, holdT: 0 },
	input: { pressed: () => false, released: () => false, is: () => false, codes: () => [], pressedQ: new Set(), down: new Set(), consumeWheel: () => 0, codePressed: ( c ) => game.input.pressedQ.has( c ) },
	world: { isIndoors: () => false, isBeach: () => false, meta: { cities: [] }, sky },
	weather, physics, entities,
	hf: { heightAt: () => 0, surfaceAt: ( x, z, o = [ 0.5, 0, 0, 0 ] ) => o, flagsNear: () => 0 },
	player: { pos: new THREE.Vector3( 0, 2, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stanceH: 1.6, shake: 0, aimFov: 1, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ), moving: false, sprinting: false, underwater: false, swimming: false },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => dropped.push( s ), inputActive: true, dead: false,
	app: { ui: { inventory: { other: null }, openContainer() {} } },
	nearFire: () => false,
	onPlayerDeath( c ) { this.dead = true; this.deathCause = c; },
	systems: [], register( s ) { this.systems.push( s ); return s; },
};
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.survival = new Survival( game );
game.actions = new Actions( game );
game.itemUse = new ItemUse( game, null );
game.crafting = new Crafting( game, null );
game.combine = new Combine( game );
game.placeables = new Placeables( game );
startSystems( game );
const S = game.survival, inv = game.player.inventory, U = game.itemUse, KB = game.combine;
const sys = game.senses;
ok( sys && RT.system( game ) === sys && game.systems.includes( sys ), 'the senses system starts with the items module (game.senses)' );
ok( S.airSources.length >= 1, 'it gives Survival an air source' );
inv.equip.back = makeStack( 'backpack_military' );
const finish = () => { for ( let i = 0; i < 8 && game.actions.busy; i ++ ) game.actions.update( 999 ); };
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const verb = ( st, v ) => U.actions( st ).find( a => a.verb === v || a.verb.startsWith( v ) );
const run = ( st, v ) => { const a = verb( st, v ); if ( ! a ) return false; a.run(); finish(); return true; };
const combo = ( id, a, b ) => { const st = KB.state( C.getCombo( id ), a, b ); if ( ! st.ok ) { console.log( '   (combo ' + id + ': ' + st.reason + ')' ); return st; } KB.run( C.getCombo( id ), a, b ); finish(); return st; };
// (a big bag on the back for what the tests carry)
const clearInv = () => { for ( const s of [ ...inv.allStacks() ] ) inv.remove( s ); for ( const k of Object.keys( inv.equip ) ) delete inv.equip[ k ]; inv.equip.back = makeStack( 'backpack_military' ); };
// one second of the world: Survival, then the systems (the frame order)
const tick = ( dt = 0.25, n = 1, hours = 0 ) => { for ( let i = 0; i < n; i ++ ) { game.time.hours += hours; S.update( dt ); for ( const s of [ ...game.systems ] ) s.update?.( dt ); } };
const wear = ( id, slot, data = {} ) => { const st = makeStack( id, 1, { full: true } ); Object.assign( st.data, data ); inv.equip[ slot ] = st; return st; };

// ---- vision -----------------------------------------------------------------------------------------------------------------
console.log( 'vision' );
{
	const nvg = wear( 'nvg_goggles', 'eyes', { charge: 12 } );
	tick();
	ok( sys.view.mode === 0, 'goggles worn but off: the eye' );
	ok( verb( nvg, 'Turn on' ) && sys.toggleGoggles(), 'switch them on' );
	ok( played.some( p => p[ 0 ] === 'senses_nv_on' ), 'the tube whines up' );
	tick( 0.25, 4 );
	ok( sys.view.mode === 1 && sys.view.src === nvg && sys.view.k > 0.9, 'night vision' );
	const out = game.grade ? null : {};
	const gr = sys.grade( {} );
	ok( gr.nv > 0.9 && gr.thermal === 0 && gr.tube === L.TUBES.gen3.tube && gr.nvGain > 100, `the grade: nv ${gr.nv.toFixed( 2 )}, tube ${gr.tube}` );
	void out;
	// batteries drain in game hours and the tube dies
	const c0 = nvg.data.charge;
	tick( 0.25, 4, 0.5 );
	near( nvg.data.charge, c0 - 2, 0.01, 'two game hours of charge used' );
	nvg.data.charge = 0.1;
	tick( 0.25, 2, 0.2 );
	ok( ! nvg.data.on && sys.view.mode === 0 && toasts.some( t => /batteries dead/.test( t ) ), 'it dies and switches off' );
	ok( ! sys.toggleGoggles() && toasts.at( - 1 ) === 'Batteries dead', 'won\'t switch on dead' );
	// fresh AAs through the base combo (a clothing device with cells)
	const aa = put( 'batteries', 2 );
	ok( combo( 'insert_batteries', aa, nvg ).ok && nvg.data.charge === 12, 'AA batteries into the goggles' );
	// U on the keyboard
	game.input.pressedQ.add( 'KeyU' ); tick(); game.input.pressedQ.clear();
	ok( nvg.data.on, 'U switches them on' );
	// the IR illuminator: lights only what a tube sees
	const ir = put( 'battery_cr123', 2 ) && put( 'ir_illuminator' );
	ir.data.charge = 5;
	ok( run( ir, 'Turn on' ) && ir.data.on, 'IR on' );
	tick();
	ok( sys.ir === true, 'its beam shows in night vision' );
	nvg.data.on = false; tick();
	ok( sys.ir === false, 'and not to the eye' );
	const cr = inv.find( s => s.id === 'battery_cr123' );
	ok( combo( 'senses_insert_cr123', cr, ir ).ok && ir.data.charge === getItem( 'ir_illuminator' ).tool.battery, 'CR123 cells into it' );
	// thermal goggles: warm animals and bandits glow, the infected run cold; switched off, they look themselves again
	delete inv.equip.eyes;
	const th = wear( 'thermal_goggles', 'eyes', { charge: 6, on: true } );
	const mat = ( c ) => new THREE.MeshStandardMaterial( { color: c } );
	const ent = ( type, pos, c ) => { const o = new THREE.Group(); o.add( new THREE.Mesh( new THREE.BoxGeometry(), mat( c ) ) ); const e = { type, pos: pos.clone(), object: o, alive: true, state: 'idle', alertTo( p ) { this.lured = p; } }; entities.list.push( e ); return e; };
	const z1 = ent( 'zombie', new THREE.Vector3( 10, 0, 0 ), 0xffffff ), boar = ent( 'animal', new THREE.Vector3( - 10, 0, 0 ), 0x806040 ), bandit = ent( 'npc', new THREE.Vector3( 0, 0, 10 ), 0xffffff );
	tick( 0.25, 4 );
	const zm = z1.object.children[ 0 ].material, bm = boar.object.children[ 0 ].material, nm = bandit.object.children[ 0 ].material;
	ok( sys.view.mode === 2 && sys.grade( {} ).thermal > 0.9 && sys.grade( {} ).heatRef > 0, 'thermal view and its heat reference' );
	ok( zm.color.r < 0.05 && zm.emissiveIntensity === 0, 'the infected go cold (dark)' );
	ok( bm.emissive.r === 1 && bm.emissiveIntensity > sys.grade( {} ).heatRef && nm.emissiveIntensity > 0, 'the boar and the bandit glow' );
	ok( verb( th, 'Palette' ) && run( th, 'Palette' ) && th.data.palette === 1 && sys.grade( {} ).thPalette === 1, 'black hot' );
	th.data.on = false; tick();
	ok( zm.color.getHex() === 0xffffff && bm.emissiveIntensity === 1 && bm.emissive.getHex() === 0 && sys.heated.size === 0, 'off: everyone as they were' );
	entities.list.length = 0;
	delete inv.equip.eyes;
	// a handheld: night vision only while it's at the eye
	const mono = put( 'nvg_monocular' ); mono.data.charge = 8;
	game.hands = { held: mono, binoc: 0, adsWant: false };
	tick();
	ok( sys.view.mode === 0, 'held down: nothing' );
	game.hands.binoc = 1; tick();
	ok( sys.view.mode === 1 && sys.view.handheld && sys.view.tube === 'gen1' && sys.grade( {} ).nvWarp > 0, 'aimed: the Gen-1 tube' );
	game.hands.binoc = 0; tick();
	ok( sys.view.mode === 0, 'lowered: the eye' );
	game.hands = null;
	clearInv();
}

// ---- hearing ------------------------------------------------------------------------------------------------------------------
console.log( 'hearing' );
{
	ok( sys.earsMode() === 'open', 'nothing on the ears' );
	const shot = () => game.events.emit( 'noise', { pos: game.player.pos.clone(), radius: 400, source: game.player, kind: 'gunshot' } );
	sys.ring = 0; shot(); shot();
	ok( sys.ring > 0.3, `two rifle shots unprotected ring the ears (${sys.ring.toFixed( 2 )})` );
	tick( 0.5, 1 );
	ok( played.some( p => p[ 0 ] === 'tinnitus' ), 'a ringing tone' );
	ok( sys._mix.lp < 20000, 'and a duller mix while it lasts' );
	for ( let i = 0; i < 40; i ++ ) tick( 0.5 );
	ok( sys.ring === 0, 'it fades' );
	// earplugs: put in, they dull everything and stop the ringing
	const plugs = put( 'foam_earplugs', 4 );
	ok( run( plugs, 'Put in' ) && sys.earsMode() === 'plugs', 'earplugs in' );
	const inEar = inv.find( s => s.id === 'foam_earplugs' && s.data.in );
	ok( inEar && inEar.qty === 1 && plugs.qty === 3, 'one pair in, the rest in the pack' );
	shot();
	ok( sys.ring < 0.05, 'a shot barely rings through plugs' );
	ok( run( inEar, 'Take out' ) && sys.earsMode() === 'open', 'out again' );
	// electronic defenders: off they are muffs, on the limiter path; they need batteries
	const ear = wear( 'electronic_earmuffs', 'head', { charge: 40 } );
	ok( sys.earsMode() === 'muffs', 'defenders off: passive muffs' );
	ok( run( ear, 'Turn on' ) && sys.earsMode() === 'active', 'switched on' );
	sys.ring = 0; shot(); shot(); shot();
	ok( sys.ring === 0, 'no ringing through electronic defenders' );
	tick();
	ok( sys._mix.wet === 1 && sys._mix.dry === 0 && sys._mix.threshold < - 20, 'the mix goes through the limiter' );
	ok( sys.audioState().mode === 'active', 'audioState reports it' );
	ear.data.charge = 0.05; tick( 0.25, 1, 0.1 );
	ok( ! ear.data.on && sys.earsMode() === 'muffs', 'dead batteries: back to muffs' );
	clearInv();
}

// ---- vog -------------------------------------------------------------------------------------------------------------------------
console.log( 'vog' );
{
	const H = L.VENTS[ 0 ];
	game.player.pos.set( H.x, 180, H.z );
	S.vog = 0; S.eye = 0; noises.length = 0;
	tick( 0.5, 120 );
	ok( S.vog > 0.4, `a minute at Halemaʻumaʻu bare-faced (vog ${S.vog.toFixed( 2 )})` );
	ok( S.conditions().some( c => c.id === 'vog' ), 'the Vog condition shows' );
	ok( noises.some( e => e.kind === 'cough' ), 'coughing fits the infected hear' );
	ok( S.eye > 0.3, 'sore eyes' );
	ok( S.maxStamina() < 90, 'short of breath' );
	ok( sys.grade( {} ).vog > 0.5, 'the yellow-grey haze in the grade' );
	// a gas mask with a filter: nothing gets in, the filter wears; the eyes clear
	const mask = wear( 'gas_mask', 'face' );
	mask.data.filter = { id: 'gas_filter', life: 1 };
	const v0 = S.vog;
	tick( 0.5, 60 );
	ok( S.vog < v0, 'masked, it eases' );
	ok( mask.data.filter.life < 1 && mask.data.filter.life > 0.9, `the filter wears (${mask.data.filter.life.toFixed( 3 )})` );
	ok( sys.grade( {} ).mask === 1 && sys.grade( {} ).maskKind === 1, 'the mask\'s lenses in the grade' );
	// the filter runs out
	mask.data.filter.life = 0.002;
	tick( 0.5, 10 );
	ok( mask.data.filter.life === 0 && toasts.includes( 'Filter spent' ), 'spent' );
	const v1 = S.vog;
	tick( 0.5, 30 );
	ok( S.vog > v1, 'a spent filter lets it back in' );
	// a fresh filter screwed in: the old one comes back out only if it had life left
	const fresh = put( 'gas_filter' ); fresh.cond = 1;
	ok( combo( 'senses_fit_filter', fresh, mask ).ok && mask.data.filter.life === 1 && ! inv.find( s => s.id === 'gas_filter' ), 'a fresh filter in (the spent one thrown away)' );
	const spare = put( 'gas_filter' ); spare.cond = 0.8;
	mask.data.filter.life = 0.5;
	ok( combo( 'senses_fit_filter', spare, mask ).ok && mask.data.filter.life === 0.8 && inv.find( s => s.id === 'gas_filter' )?.cond === 0.5, 'swapped: the half-used one comes back out' );
	ok( run( mask, 'Remove filter' ) && mask.data.filter === null && inv.count( 'gas_filter' ) === 2, 'unscrewed' );
	// out of the zone, with the inhaler it clears
	game.player.pos.set( 0, 2, 0 );
	S.vog = 0.6; S.fxAdd( 'breathe', 1 );
	tick( 0.5, 60 );
	ok( S.vog < 0.5, `clean air and the inhaler (${S.vog.toFixed( 2 )})` );
	S.vog = 0; delete S.fx.breathe;
	// the half mask: lungs fine, eyes still sting
	delete inv.equip.face;
	const resp = wear( 'respirator', 'face' ); resp.data.filter = { id: 'respirator_cartridges', life: 1 };
	game.player.pos.set( H.x, 180, H.z ); S.eye = 0;
	tick( 0.5, 40 );
	ok( S.vog < 0.05 && S.eye > 0.2, `half mask: vog ${S.vog.toFixed( 2 )}, eyes ${S.eye.toFixed( 2 )}` );
	// the laze at the ocean entry burns bare skin and eyes
	delete inv.equip.face;
	const lz = L.VENTS.find( v => v.laze );
	game.player.pos.set( lz.x, 5, lz.z ); S.burn = 0; S.eye = 0;
	tick( 0.5, 40 );
	ok( S.burn > 0 && S.eye > 0.3, 'laze burns' );
	// the gas detector: beeps in the plume before it's thick
	game.player.pos.set( H.x + L.TRADES.x * 1500, 150, H.z + L.TRADES.z * 1500 );
	S.vog = 0; S.eye = 0; S.burn = 0;
	const det = put( 'gas_detector' ); det.data.charge = 30;
	played.length = 0;
	tick( 0.5, 20 );
	ok( sys.ppm > 0.1 && played.some( p => p[ 0 ] === 'senses_beep' ), `the detector beeps at ${sys.ppm.toFixed( 2 )} ppm` );
	ok( run( det, 'Check' ) && /SO₂/.test( toasts.at( - 1 ) ), 'Check: ' + toasts.at( - 1 ) );
	// in creative nothing builds
	game.mode = 'creative'; game.player.pos.set( H.x, 180, H.z ); S.vog = 0;
	tick( 0.5, 20 );
	ok( S.vog === 0, 'creative: no vog' );
	game.mode = 'survival';
	game.player.pos.set( 0, 2, 0 );
	S.vog = 0; S.eye = 0; S.health = 100;
	clearInv();
}

// ---- diving --------------------------------------------------------------------------------------------------------------------
console.log( 'diving' );
{
	const P = game.player;
	const dive = ( depth ) => { P.underwater = true; P.swimming = true; waterLevel = 0; game.camera.position.set( 0, - depth, 0 ); P.pos.set( 0, - depth - 1.6, 0 ); };
	const surface = () => { P.underwater = false; P.swimming = true; game.camera.position.set( 0, 0.2, 0 ); P.pos.set( 0, - 1.4, 0 ); };
	// no air: the breath runs down
	dive( 5 ); S.breath = 100;
	tick( 0.5, 10 );
	ok( S.breath < 90, `holding your breath (${S.breath.toFixed( 0 )})` );
	surface(); tick( 0.5, 10 );
	// a scuba set: breath stays, the air goes by depth
	const set = wear( 'scuba_set', 'back', { air: 200 } );
	dive( 0.5 ); S.breath = 100;
	tick( 0.5, 20 );
	const shallow = 200 - set.data.air;
	ok( S.breath === 100 && shallow > 0, `breathing from the tank (${shallow.toFixed( 2 )} bar in 10 s near the top)` );
	set.data.air = 200;
	dive( 20 ); tick( 0.5, 20 );
	const deep = 200 - set.data.air;
	ok( deep > shallow * 2.4, `at 20 m it goes ${( deep / shallow ).toFixed( 1 )}× as fast` );
	// the readout and the low-air warning
	const comp = put( 'dive_computer' ); comp.data.charge = 80;
	ok( sys.diveComputer() === comp && sys.dive.depth > 19 && sys.dive.t > 5, `the computer reads ${sys.dive.depth.toFixed( 1 )} m, ${sys.dive.t.toFixed( 0 )} s` );
	set.data.air = L.DIVE.reserve + 0.1;
	tick( 0.5, 4 );
	ok( toasts.includes( 'Low air' ), 'low air' );
	set.data.air = 0.05; S.breath = 100;
	tick( 0.5, 6 );
	ok( toasts.includes( 'Out of air' ) && S.breath < 100, 'out of air: holding your breath again' );
	// the bends: loaded at depth, a fast ascent, the surface
	set.data.air = 200; S.bends = 0; sys.dive.n = 0; sys.dive.bub = 0;
	dive( 28 ); tick( 0.5, 600 );
	ok( sys.dive.n > 1, `nitrogen at 28 m (${sys.dive.n.toFixed( 2 )})` );
	ok( L.ndl( sys.dive.n, 28 ) === 0, 'past the no-stop limit' );
	for ( let d = 28; d > 0; d -= 1.5 ) { dive( d ); tick( 0.5 ); }
	ok( sys.dive.fast || sys.dive.bub > 0, 'ascending too fast' );
	surface(); tick( 0.5, 2 );
	ok( S.bends > 0.2 && S.conditions().some( c => c.id === 'bends' ), `the bends (${S.bends.toFixed( 2 )})` );
	const p0 = S.pain;
	ok( p0 > 0.1 && S.maxStamina() < 95, 'it hurts, short of strength' );
	// back down with air, they shrink faster
	const b0 = S.bends;
	dive( 8 ); sys.dive.bub = 0; tick( 0.5, 20 );
	const under = b0 - S.bends;
	surface(); sys.dive.bub = 0; const b1 = S.bends; tick( 0.5, 20 );
	ok( under > ( b1 - S.bends ) * 2, 'recompression under water helps' );
	S.bends = 0; sys.dive.n = 0; sys.dive.bub = 0;
	// a careful ascent: no bends
	dive( 28 ); tick( 0.5, 240 );
	for ( let d = 28; d > 4; d -= 0.2 ) { dive( d ); tick( 0.5 ); }
	dive( 5 ); tick( 0.5, 240 );
	for ( let d = 5; d > 0; d -= 0.2 ) { dive( d ); tick( 0.5 ); }
	surface(); tick( 0.5, 4 );
	ok( S.bends === 0, `a slow ascent with a stop: no bends (n ${sys.dive.n.toFixed( 2 )})` );
	// a BCD holds you at depth: the swim's lift cancelled
	inv.equip.vest = makeStack( 'scuba_bcd' );
	P.vel.set( 0, 2, 0 ); dive( 10 ); tick( 0.016 );
	ok( P.vel.y < 0 && P.vel.y > - 1.5, `the BCD cancels the lift (${P.vel.y.toFixed( 2 )})` );
	// with Player's swim step (no input: damp toward 0 by dt * 3, lift by ( surface - y ) * dt * 6, move) the diver
	// stays at depth
	const y0 = P.pos.y;
	for ( let i = 0; i < 200; i ++ ) {
		const dt = 0.05;
		P.vel.multiplyScalar( 1 - Math.min( 1, dt * 3 ) );
		if ( P.pos.y < - 1.45 ) P.vel.y += ( - 1.45 - P.pos.y ) * dt * 6;
		P.pos.addScaledVector( P.vel, dt );
		game.camera.position.y = P.pos.y + 1.6;
		tick( dt );
	}
	ok( Math.abs( P.pos.y - y0 ) < 0.3, `held at depth for 10 s (${( P.pos.y - y0 ).toFixed( 2 )} m)` );
	delete inv.equip.vest;
	// lights that aren't sealed flood; the dive light doesn't
	const torch = put( 'flashlight' ); torch.data.on = true; torch.data.charge = 5;
	const dl = put( 'dive_light' ); dl.data.on = true; dl.data.charge = 5;
	dive( 3 ); tick( 0.5, 6 );
	ok( ! torch.data.on && torch.cond < 1 && dl.data.on, 'the flashlight floods, the dive light keeps going' );
	surface(); tick( 0.5, 2 );
	// the rebreather: oxygen by time not depth, toxic below its limit
	delete inv.equip.back;
	const reb = wear( 'rebreather', 'vest', { o2: 1000, scrub: 1000 } );
	dive( 2 ); S.breath = 100; tick( 0.5, 20 );
	const r2 = 1000 - reb.data.o2;
	reb.data.o2 = 1000;
	dive( 6 ); tick( 0.5, 20 );
	const r6 = 1000 - reb.data.o2;
	ok( S.breath === 100 && Math.abs( r2 - r6 ) < 0.5, `the rebreather uses the same at 2 m and 6 m (${r2.toFixed( 1 )} / ${r6.toFixed( 1 )})` );
	const rnd = Math.random; Math.random = () => 0;
	const h0 = S.health;
	dive( 15 ); tick( 0.5, 2 );
	Math.random = rnd;
	ok( S.health < h0 && toasts.includes( 'Oxygen toxicity' ), 'pure oxygen at 15 m: a convulsion' );
	S.health = 100;
	ok( sys.grade( {} ).mask === 0, 'no face mask: no lens frame' );
	wear( 'dive_mask', 'eyes' );
	ok( sys.grade( {} ).maskKind === 2 && sys.grade( {} ).mask === 1, 'a dive mask: its window' );
	surface(); tick( 0.5, 2 );
	clearInv();
	// combos: a regulator onto a tank, a fuller tank swapped on, the regulator off again
	const tank = put( 'scuba_tank' ); tank.data.air = 150;
	const reg = put( 'scuba_regulator' );
	ok( combo( 'senses_regulator', reg, tank ).ok && tank.id === 'scuba_set' && tank.data.air === 150 && ! inv.count( 'scuba_regulator' ), 'a regulator onto a tank: a scuba set' );
	const full = put( 'scuba_tank' ); full.data.air = 200;
	ok( combo( 'senses_tank_swap', full, tank ).ok && tank.data.air === 200 && full.data.air === 150, 'a full tank swapped on' );
	ok( KB.state( C.getCombo( 'senses_tank_swap' ), full, tank ).soft, 'not offered for an emptier tank' );
	ok( run( tank, 'Remove regulator' ) && inv.count( 'scuba_regulator' ) === 1 && inv.find( s => s.id === 'scuba_tank' && s.data.air === 200 ), 'the regulator off: a tank again' );
	const rb = put( 'rebreather' ); rb.data.o2 = 10; rb.data.scrub = 10;
	const refill = put( 'rebreather_refill' );
	ok( combo( 'senses_rebreather_refill', refill, rb ).ok && rb.data.o2 === L.REBREATHER.o2 && ! inv.count( 'rebreather_refill' ), 'a rebreather refilled' );
	clearInv();
}

// ---- gadgets -------------------------------------------------------------------------------------------------------------------
console.log( 'gadgets' );
{
	game.player.pos.set( 0, 2, 0 ); game.camera.position.set( 0, 3.6, 0 ); game.camera.quaternion.identity();
	// the laser: the infected near its dot go to look (at night); by day only close by
	const las = put( 'laser_pointer' ); las.data.charge = 8;
	game.hands = { held: las, binoc: 0, adsWant: false, select() {} };
	ok( verb( las, 'Turn on' ) && run( las, 'Turn on' ) && las.data.on, 'the laser on' );
	physics.hit = { t: 30 };
	sky.night = 1;
	const mk = ( x, z ) => { const e = { type: 'zombie', pos: new THREE.Vector3( x, 0, z ), alive: true, state: 'idle', alertTo( p ) { this.lured = p.clone(); } }; entities.list.push( e ); return e; };
	const z1 = mk( 5, - 40 ), z2 = mk( 30, - 70 ), z3 = mk( 0, - 30 );
	z3.state = 'chase';
	tick( 0.25, 4 );
	ok( sys.laser.on && sys.laser.hit && Math.abs( sys.laser.hit.z + 30 ) < 0.1, 'the dot 30 m ahead' );
	ok( z1.lured && Math.abs( z1.lured.z + 30 ) < 0.5 && ! z2.lured && ! z3.lured, 'the one nearby follows it (not the far one, not the one already chasing)' );
	sky.night = 0; z1.lured = null; z1.pos.set( 15, 0, - 40 );
	tick( 0.25, 4 );
	ok( ! z1.lured, 'by day it only shows up close' );
	lineOfSight.ok = false; sky.night = 1; z1.lured = null;
	tick( 0.25, 4 );
	ok( ! z1.lured, 'not through a wall' );
	lineOfSight.ok = true;
	entities.list.length = 0; physics.hit = null; sky.night = 0;
	// the parabolic microphone: aim to listen; it counts what groans ahead, far off
	const mic = put( 'parabolic_mic' ); mic.data.charge = 14;
	game.hands = { held: mic, binoc: 0, adsWant: true, select() {} };
	mk( 2, - 120 ); mk( - 3, - 150 ); mk( 100, 50 );
	played.length = 0;
	tick( 0.5, 6 );
	ok( sys.mic.on && sys.mic.count === 2 && sys.mic.near.d > 100, `two infected heard ahead (${sys.mic.count}, nearest ${sys.mic.near?.d.toFixed( 0 )} m)` );
	ok( played.some( p => /^z_/.test( p[ 0 ] ) && p[ 1 ].max > 150 ), 'their groans played from far off' );
	sys.ring = 0;
	game.events.emit( 'noise', { pos: game.player.pos.clone(), radius: 400, source: game.player, kind: 'gunshot' } );
	ok( sys.ring >= 0.5, 'a gunshot through the headphones hurts' );
	sys.ring = 0;
	game.hands.adsWant = false; tick();
	ok( ! sys.mic.on, 'lowered: off' );
	entities.list.length = 0; game.hands = null;
	// the smartwatch: the time and vitals; it buzzes at a racing heart
	const watch = put( 'smartwatch' ); watch.data.charge = 30;
	ok( run( watch, 'Check' ) && /HR \d+/.test( toasts.at( - 1 ) ) && /SpO₂/.test( toasts.at( - 1 ) ), 'Check: ' + toasts.at( - 1 ) );
	S.panic = 100; game.player.sprinting = true; sys.watchQuiet = 0; played.length = 0;
	tick( 0.5, 4 );
	ok( played.some( p => p[ 0 ] === 'senses_buzz' ) && /Heart rate/.test( toasts.at( - 1 ) ), 'it buzzes: ' + toasts.at( - 1 ) );
	S.panic = 0; game.player.sprinting = false;
	// the weather radio: a bulletin, the forecast honoured, a storm warning
	const radio = put( 'weather_radio' ); radio.data.charge = 40;
	ok( run( radio, 'Listen' ) && /Wind \d+ mph/.test( toasts.at( - 1 ) ) && /Surf/.test( toasts.at( - 1 ) ), 'Listen: ' + toasts.at( - 1 ) );
	const fc = sys.forecast();
	weather.state = fc.from === 'storm' ? 'clear' : 'storm';
	tick();
	ok( fc.state === weather.state || fc.from === weather.state, `the weather keeps to the forecast (${fc.from} → ${fc.state}: ${weather.state})` );
	weather.state = 'fair'; sys.radio.fc = { from: 'fair', state: 'storm', at: game.time.hours + 1 }; sys.radio.lastState = 'fair';
	radio.data.on = true; sys.radio.t = 0; played.length = 0;
	tick();
	ok( toasts.some( t => /Storm warning/.test( t ) ) && played.some( p => p[ 0 ] === 'senses_alert' ), 'a storm warning' );
	radio.data.on = false;
	clearInv();
}

// ---- placed things ---------------------------------------------------------------------------------------------------------------
console.log( 'placed' );
{
	const PL = game.placeables;
	game.player.pos.set( 0, 0, 0 );
	// motion sensors: numbered; something passing chimes the receiver you carry
	const s1 = PL.add( 'senses_sensor', makeStack( 'motion_sensor' ), { x: 40, y: 0, z: 0 } );
	const s2 = PL.add( 'senses_sensor', makeStack( 'motion_sensor' ), { x: - 40, y: 0, z: 0 } );
	ok( s1.data.zone === 1 && s2.data.zone === 2, 'sensors 1 and 2' );
	const rx = put( 'alarm_receiver' ); rx.data.charge = 48;
	entities.list.push( { type: 'zombie', pos: new THREE.Vector3( 41, 0, 1 ), alive: true } );
	s1.data.armT = 0; played.length = 0;
	getPlaceable( 'senses_sensor' ).update( s1, 0.5, game, 0 );
	ok( played.some( p => p[ 0 ] === 'senses_chime' ) && /Sensor 1 · 40 m E/.test( toasts.at( - 1 ) ), 'chime: ' + toasts.at( - 1 ) );
	const n = toasts.length;
	getPlaceable( 'senses_sensor' ).update( s1, 0.5, game, 0 );
	ok( toasts.length === n, 'quiet a moment after' );
	ok( run( rx, 'Last alarm' ) && /Sensor 1/.test( toasts.at( - 1 ) ), 'the receiver remembers' );
	rx.data.on = false; s1.data.quiet = 0; played.length = 0;
	getPlaceable( 'senses_sensor' ).update( s1, 0.5, game, 0 );
	ok( ! played.some( p => p[ 0 ] === 'senses_chime' ), 'receiver off: nothing' );
	entities.list.length = 0;
	// the compressor: fuel, start, fill a tank
	const can = put( 'gas_can' );
	const cp = PL.add( 'senses_compressor', makeStack( 'dive_compressor' ), { x: 1, y: 0, z: 0 } );
	const acts = () => getPlaceable( 'senses_compressor' ).actions( cp, game );
	ok( acts().some( a => a.label === 'Refuel' ) && ! acts().some( a => a.label === 'Start' ), 'no fuel: refuel first' );
	acts().find( a => a.label === 'Refuel' ).run(); finish();
	ok( cp.stack.data.fuel > 1, `refuelled (${cp.stack.data.fuel.toFixed( 1 )} L)` );
	const rnd = Math.random; Math.random = () => 0;
	acts().find( a => a.label === 'Start' ).run(); finish();
	Math.random = rnd;
	ok( cp.data.on, 'running' );
	noises.length = 0;
	getPlaceable( 'senses_compressor' ).update( cp, 0.5, game, 0.01 );
	ok( noises.some( e => e.kind === 'compressor' ), 'loud: the infected hear it' );
	const tank = put( 'scuba_tank' ); tank.data.air = 20;
	const fill = acts().find( a => /^Fill scuba tank/.test( a.label ) );
	ok( fill, 'Fill offered: ' + acts().map( a => a.label ).join( ', ' ) );
	fill.run(); finish();
	ok( tank.data.air === L.DIVE.bar, 'the tank full' );
	// the spotting scope: look through it; stepping away ends it
	const sc = PL.add( 'senses_scope', makeStack( 'spotting_scope' ), { x: 0.5, y: 0, z: 0 } );
	game.hands = { held: null, binoc: 0, holster() {} };
	getPlaceable( 'senses_scope' ).actions( sc, game )[ 0 ].run();
	ok( sys.scope?.p === sc, 'looking through the scope' );
	for ( let i = 0; i < 6; i ++ ) sys.lateUpdate( 0.25 );
	ok( game.player.aimFov < 0.1, `zoomed (${game.player.aimFov.toFixed( 3 )})` );
	ok( sys.grade( {} ).tube > 0.3, 'its eyepiece circle' );
	game.player.pos.set( 5, 0, 0 ); sys.lateUpdate( 0.25 );
	ok( ! sys.scope && game.player.aimFov === 1, 'stepped away: the eye again' );
	game.hands = null;
	PL.remove( s1 ); PL.remove( s2 ); PL.remove( cp, { give: false } ); PL.remove( sc, { give: false } );
	clearInv();
}

// ---- verbs and the found state ---------------------------------------------------------------------------------------------------
console.log( 'found' );
{
	const m = put( 'gas_mask' ), tk = put( 'scuba_tank' ), nv = put( 'thermal_goggles' );
	tick( 0.5, 2 );
	ok( m.data.filter !== undefined && tk.data.air >= 0 && tk.data.air <= L.DIVE.bar && nv.data.charge > 0 && nv.data.charge <= nv.data.charge, 'a found mask, tank and goggles get their state' );
	ok( verb( tk, 'Check air' ) && run( tk, 'Check air' ) && /bar/.test( toasts.at( - 1 ) ), 'Check air: ' + toasts.at( - 1 ) );
	// labels stay short
	for ( const d of SENSES ) { const st = makeStack( d.id, 1, { loot: true } ); for ( const a of U.actions( st ) ) ok( a.label.length <= 32 && ! /!/.test( a.label ), `${d.id}: "${a.label}"` ); }
	clearInv();
}

// ---- Game.grade and the renderer's uniforms ----------------------------------------------------------------------------------------
console.log( 'grade' );
{
	const { readFileSync } = await import( 'node:fs' );
	const src = readFileSync( new URL( '../src/render/Renderer.js', import.meta.url ), 'utf8' );
	const keys = [ 'nv', 'nvGain', 'nvFloor', 'nvTarget', 'nvNoise', 'nvHalo', 'nvWarp', 'nvTint', 'thermal', 'thPalette', 'thRes', 'thNoise', 'heatRef', 'tube', 'mask', 'maskKind', 'maskFog', 'vog' ];
	for ( const k of keys ) ok( new RegExp( `\\b${k}: \\{ value` ).test( src ), `the grade has a ${k} uniform` );
	ok( /SENSE_SWITCHES/.test( src ) && /nightVision\(/.test( src ) && /thermalView\(/.test( src ) && /maskVis\(/.test( src ), 'the grade shader reads them' );
	const gsrc = readFileSync( new URL( '../src/game/Game.js', import.meta.url ), 'utf8' );
	ok( /this\.senses\?\.grade\?\.\( out \)/.test( gsrc ), 'Game.grade asks the senses' );
	const out = sys.grade( {} );
	for ( const k of [ 'nv', 'thermal', 'vog' ] ) ok( typeof out[ k ] === 'number', `grade() always sets ${k}` );
}

// ---- save and load ---------------------------------------------------------------------------------------------------------------
console.log( 'save' );
{
	sys.dive.n = 0.7; sys.dive.bub = 0.1; sys.dive.log = { t: 300, max: 18, at: 99 }; sys.radio.fc = { from: 'fair', state: 'showers', at: 102 }; sys.ring = 0.2;
	const save = { world: {} };
	sys.serialize( save );
	const back = JSON.parse( JSON.stringify( save ) );
	sys.dive.n = 0; sys.dive.log = null; sys.radio.fc = null; sys.ring = 0;
	sys.load( back );
	ok( sys.dive.n === 0.7 && sys.dive.log.max === 18 && sys.radio.fc.state === 'showers' && sys.ring === 0.2, 'nitrogen, the last dive, the forecast and the ringing come back' );
	S.vog = 0.4; S.bends = 0.3;
	const s2 = S.serialize();
	S.vog = 0; S.bends = 0;
	S.load( JSON.parse( JSON.stringify( s2 ) ) );
	ok( S.vog === 0.4 && S.bends === 0.3, 'Survival saves the vog and the bends' );
	// a stack's state is plain JSON (it saves with the inventory)
	const mask = makeStack( 'gas_mask' ); mask.data.filter = { id: 'gas_filter', life: 0.4 };
	ok( JSON.parse( JSON.stringify( mask ) ).data.filter.life === 0.4, 'a mask keeps its filter' );
	sys.dispose();
	ok( sys.heated.size === 0, 'disposed cleanly' );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
