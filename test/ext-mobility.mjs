// The mobility items (Node, a fake DOM for canvas labels): node test/ext-mobility.mjs
//   the catalogue: every mobility item has a model, a place to be found (or is made) and something to do; rares stay rare
//   the numbers: a paraglider's polar, flare and landing, ridge lift and thermals, the reserve; rolling and bailing on
//   boards; paddling and waves; a zipline's cable; climbing rates
//   the real Player, Physics and Placeables on a stub world with the mobility system: gliding off a cliff to a landing and
//   packing the wing; the reserve; a crash; skating down a street into the grass, into a kerb, over it with an ollie;
//   paddling out and being knocked off, the board afloat; pushing a cart (its container, a wall, grass), a wagon pulled; a
//   ladder leant on a wall and climbed onto the roof; a rope tied off at the edge and climbed down; a grappling hook
//   thrown up; a zipline strung between two trees and ridden; inline skates; trekking poles; an umbrella in the rain;
//   a save -> load round trip of the placed ropes, ladders, carts and the zipline
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const THREE = await import( 'three' );
await import( '../src/game/items/defs/index.js' );
const { ITEMS, getItem, makeStack } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const C = await import( '../src/game/items/combos.js' );
const L = await import( '../src/game/items/ext/mobility/logic.js' );
const RT = await import( '../src/game/items/ext/mobility/runtime.js' );
const MODES = await import( '../src/game/items/ext/mobility/modes.js' );
const LEDGE = await import( '../src/game/items/ext/mobility/ledges.js' );
const { MOB, haulContainer } = await import( '../src/game/items/ext/mobility/kinds.js' );
const { mobSoundData, MOB_SOUNDS } = await import( '../src/game/items/ext/mobility/sounds.js' );
const { hasModelBuilder, buildItemModel } = await import( '../src/render/ItemModels.js' );
const { PlayerInventory, itemsOf } = await import( '../src/game/Inventory.js' );
const { Survival } = await import( '../src/game/Survival.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { ItemUse } = await import( '../src/game/items/ItemUse.js' );
const { Crafting } = await import( '../src/game/Crafting.js' );
const { Combine } = await import( '../src/game/items/Combine.js' );
const { Events } = await import( '../src/core/Events.js' );
const { Placeables } = await import( '../src/game/items/Placeables.js' );
const { Physics } = await import( '../src/game/Physics.js' );
const { Player } = await import( '../src/game/Player.js' );

let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) passes ++; else { fails ++; console.error( '  ✗ ' + msg ); } };

// ---- the catalogue ---------------------------------------------------------------------------------------------------
console.log( 'catalogue' );
const MOBI = [ ...ITEMS.values() ].filter( d => d.tags.includes( 'mobility' ) );
ok( MOBI.length >= 30, `mobility items (${MOBI.length})` );
for ( const d of MOBI ) {
	ok( hasModelBuilder( d.model.type ), `${d.id}: model builder ${d.model.type}` );
	let obj = null;
	try { obj = buildItemModel( d ); } catch ( e ) { console.error( e ); }
	ok( obj && ! obj.userData.fallback, `${d.id}: model builds` );
	if ( obj ) {
		const b = new THREE.Box3().setFromObject( obj );
		ok( Math.abs( b.min.y ) < 0.01, `${d.id}: rests on y = 0 (${b.min.y.toFixed( 3 )})` );
		let tris = 0; obj.traverse( m => { if ( m.isMesh ) tris += ( m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count ) / 3; } );
		ok( tris < 14000, `${d.id}: ${tris} triangles` );
	}
	ok( d.desc && d.desc.length <= 40 && ! /!/.test( d.desc ), `${d.id}: short plain description "${d.desc}"` );
}
// real sizes, roughly
{
	const size = ( id ) => new THREE.Box3().setFromObject( buildItemModel( getItem( id ) ) ).getSize( new THREE.Vector3() );
	const sk = size( 'skateboard' ), sup = size( 'paddleboard' ), cart = size( 'shopping_cart' ), bar = size( 'wheelbarrow' ), tr = size( 'hand_truck' ), ex = size( 'extension_ladder' );
	ok( sk.x > 0.75 && sk.x < 0.9 && sk.z > 0.18 && sk.z < 0.26, `a skateboard is a skateboard's size (${sk.x.toFixed( 2 )} x ${sk.z.toFixed( 2 )})` );
	ok( sup.x > 3 && sup.x < 3.5 && sup.z > 0.7 && sup.z < 0.95, `a paddleboard is 10'6" (${sup.x.toFixed( 2 )} x ${sup.z.toFixed( 2 )})` );
	ok( cart.y > 0.95 && cart.y < 1.15 && cart.x > 0.85 && cart.x < 1.05, `a shopping cart stands handle-high (${cart.y.toFixed( 2 )})` );
	ok( bar.x > 1.3 && bar.x < 1.7 && bar.z > 0.55 && bar.z < 0.8, `a wheelbarrow (${bar.x.toFixed( 2 )} x ${bar.z.toFixed( 2 )})` );
	ok( tr.y > 1.2 && tr.y < 1.4, `a hand truck stands upright (${tr.y.toFixed( 2 )})` );
	ok( ex.x > 3.4 && ex.x < 3.8, `an extension ladder closed (${ex.x.toFixed( 2 )})` );
	// the held ones that need their own first-person hold have one
	for ( const id of [ 'umbrella_open', 'extension_ladder', 'folding_ladder', 'paddleboard', 'sup_paddle', 'trekking_poles', 'holua_sled' ] ) {
		const u = buildItemModel( getItem( id ) ).userData;
		ok( u.view?.at && u.hold?.a, `${id}: a first-person hold of its own` );
	}
}
// found in the world (a table that spawns loose items) or made
const visible = new Set(), made = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( /^(car_|zombie_)/.test( name ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
for ( const r of allRecipes() ) made.add( r.out[ 0 ] );
for ( const c of C.allCombos() ) for ( const [ id ] of c.out ) made.add( id );
made.add( 'umbrella_open' ); // opening an umbrella
for ( const d of MOBI ) ok( visible.has( d.id ) || made.has( d.id ), `${d.id}: found in the world or made` );
// rares stay rare: a paraglider is a sliver of a hangar's loot, a zipline kit of a sports shop's
const share = ( table, id ) => { const t = compileTable( LOOT_TABLES[ table ] ); const e = t.entries.find( x => x.ids.length === 1 && x.ids[ 0 ] === id ); return e ? e.w / t.total : 0; };
ok( share( 'hangar', 'paraglider' ) < 0.012, `paraglider ${( share( 'hangar', 'paraglider' ) * 100 ).toFixed( 2 )}% of hangar rolls` );
ok( share( 'sports', 'paraglider' ) < 0.003, `paraglider ${( share( 'sports', 'paraglider' ) * 100 ).toFixed( 2 )}% of sports rolls` );
ok( share( 'sports', 'zipline_kit' ) < 0.003 && share( 'sports', 'ascender' ) < 0.004, 'zipline kits and ascenders are rare in sports shops' );
ok( share( 'grocery', 'shopping_cart' ) > 0.01, 'carts at the grocery' );
// what each does: a verb, a mix, a slot, a placed kind
const verbs = new Set( [ 'paraglider', 'grappling_hook', 'climbing_rope', 'folding_ladder', 'extension_ladder', 'rope_ladder', 'skateboard', 'longboard', 'kick_scooter',
	'holua_sled', 'paddleboard', 'beach_wagon', 'hand_truck', 'zipline_kit', 'umbrella', 'umbrella_open', 'variometer' ] );
const passive = new Set( [ 'reserve_chute', 'descender', 'ascender', 'chalk_bag', 'sup_paddle', 'board_leash', 'zip_trolley', 'trekking_poles', 'shopping_cart', 'wheelbarrow' ] );
const inCombo = ( d ) => { const st = makeStack( d.id, 1 ); st.cond = 0.5; return C.allCombos().some( c => C.matches( c.a, st, d ) || C.matches( c.b, st, d ) ); };
for ( const d of MOBI ) ok( verbs.has( d.id ) || passive.has( d.id ) || !! d.clothing || inCombo( d ), `${d.id}: does something` );
ok( C.getCombo( 'mob_rig_hook' ) && C.getCombo( 'mob_patch_canopy' ) && C.getCombo( 'mob_wheels' ) && C.getCombo( 'mob_resin' ), 'the mixes are registered' );
ok( MOB_SOUNDS.every( n => { const a = mobSoundData( n ); return a && a.length > 100 && a.every( Number.isFinite ); } ), `${MOB_SOUNDS.length} sounds render` );

// ---- the numbers ---------------------------------------------------------------------------------------------------------
console.log( 'numbers' );
{
	// the polar: about 8:1 at trim, worse on the bar, slower and sinking on deep brakes
	const glide = ( input, h = 200, env = {} ) => {
		const s = { heading: 0, V: 9.6, vy: - 1.1, bank: 0, open: 1 };
		let x = 0, z = 0, y = h, t = 0;
		while ( y > 0 && t < 600 ) { const v = L.glideStep( s, input, { wind: { x: 0, z: 0 }, lift: 0, loadK: 1, cond: 1, ...env }, 0.05 ); x += v.vx * 0.05; z += v.vz * 0.05; y += s.vy * 0.05; t += 0.05; }
		return { dist: Math.hypot( x, z ), t, s };
	};
	const trim = glide( { bar: 0, brake: 0, turn: 0 } ), bar = glide( { bar: 1, brake: 0, turn: 0 } );
	ok( trim.dist / 200 > 7.2 && trim.dist / 200 < 9.2, `glide ratio at trim ${( trim.dist / 200 ).toFixed( 1 )}` );
	ok( bar.dist / 200 < trim.dist / 200 && bar.t < trim.t * 0.85, `the speed bar: faster, steeper (${( bar.dist / 200 ).toFixed( 1 )}:1)` );
	ok( L.sinkAt( 9.6 ) > 1 && L.sinkAt( 9.6 ) < 1.3 && L.sinkAt( 5 ) > 2.5, `sink at trim ${L.sinkAt( 9.6 ).toFixed( 2 )}, stalled ${L.sinkAt( 5 ).toFixed( 1 )}` );
	// a turn costs height and swings the heading
	const s = { heading: 0, V: 9.6, vy: - 1.1, bank: 0, open: 1 };
	for ( let i = 0; i < 60; i ++ ) L.glideStep( s, { turn: 1 }, { wind: { x: 0, z: 0 }, cond: 1 }, 0.05 );
	ok( s.heading < - 0.5 && s.vy < - 1.3, `a right turn: heading ${s.heading.toFixed( 2 )}, sink ${s.vy.toFixed( 2 )}` );
	// the flare: from trim, the brakes at two metres trade the speed for a soft touchdown
	const land = ( flare ) => {
		const st = { heading: 0, V: 9.6, vy: - 1.15, bank: 0, open: 1 };
		let y = 4;
		for ( let t = 0; t < 10 && y > 0; t += 0.02 ) { const v = L.glideStep( st, { brake: flare && y < 2.2 ? 1 : 0 }, { wind: { x: 0, z: 0 }, cond: 1 }, 0.02 ); y += st.vy * 0.02; st.vh = Math.hypot( v.vx, v.vz ); }
		return st;
	};
	const soft = land( true ), hard = land( false );
	ok( soft.vh < hard.vh - 1.5 && soft.vy > hard.vy, `a flare: ${soft.vh.toFixed( 1 )} m/s and ${soft.vy.toFixed( 1 )} down vs ${hard.vh.toFixed( 1 )} / ${hard.vy.toFixed( 1 )}` );
	ok( L.landHurt( soft.vy, soft.vh ).hurt === 0 && L.landHurt( soft.vy, soft.vh ).fall === 0, 'a flared landing hurts nothing' );
	ok( L.landHurt( - 1.8, 12.4 ).hurt > 5, 'in fast on the bar: a tumble' );
	ok( L.landHurt( - 12, 3 ).fall > 3.2, 'dropping in: a fall' );
	// ridge lift: the trades up a windward slope hold you up; behind the crest they don't
	const ridge = ( x ) => Math.max( 0, 120 - Math.abs( x ) * 1.2 ); // a ridge along z, 120 m high
	const wind = { x: 7, z: 0 }; // blowing towards +x: the -x face is windward
	const up = L.lift( - 70, 60, 0, ( x ) => ridge( x ), wind ), lee = L.lift( 70, 60, 0, ( x ) => ridge( x ), wind ), flat = L.lift( - 500, 60, 0, () => 0, wind );
	ok( up > L.sinkAt( 9.6 ) && lee < 0.3 && flat < 0.1, `ridge lift ${up.toFixed( 2 )} m/s windward, ${lee.toFixed( 2 )} lee, ${flat.toFixed( 2 )} flat` );
	let therm = 0;
	for ( let i = 0; i < 400; i ++ ) therm = Math.max( therm, L.lift( i * 37, 300, i * 53, () => 20, { x: 0, z: 0 }, { sun: 1, cover: 0.2 } ) );
	ok( therm > 0.8 && therm < 3, `thermals by day (${therm.toFixed( 2 )} m/s at best)` );
	ok( L.lift( 100, 300, 100, () => 20, { x: 0, z: 0 }, { sun: 0 } ) === 0, 'no thermals at night' );
	// the reserve: straight down at ~5 m/s, which lands you on your feet
	const c = { heading: 0, vy: - 20, open: 0 };
	for ( let i = 0; i < 200; i ++ ) L.chuteStep( c, {}, { wind: { x: 0, z: 0 } }, 0.05 );
	ok( Math.abs( c.vy + L.CHUTE.sink ) < 0.2 && L.landHurt( c.vy, 0, L.CHUTE ).fall === 0, `a reserve comes down at ${( - c.vy ).toFixed( 1 )} m/s, no harm` );
	// boards: coasting on asphalt goes a long way, grass stops you, a slope pumps you along
	const coast = ( surf, v0 = 5, grade = 0 ) => { let v = v0, d = 0; for ( let t = 0; t < 120 && v > 0.05; t += 0.05 ) { v = Math.max( 0, v + L.rideAccel( L.RIDE.skateboard, v, grade, surf ) * 0.05 ); d += v * 0.05; } return { d, v }; };
	ok( coast( 'paved' ).d > 45 && coast( 'grass' ).d < 6, `coasting from 5 m/s: ${coast( 'paved' ).d.toFixed( 0 )} m on asphalt, ${coast( 'grass' ).d.toFixed( 1 )} m on grass` );
	ok( L.rideAccel( L.RIDE.skateboard, 3, - 0.08, 'paved' ) > 0.4, 'downhill pumps you along' );
	ok( L.rideAccel( L.RIDE.longboard, 8, 0, 'paved' ) > L.rideAccel( L.RIDE.skateboard, 8, 0, 'paved' ), 'a longboard rolls further' );
	ok( L.rideAccel( L.RIDE.holua_sled, 3, - 0.25, 'grass' ) > 1 && L.rideAccel( L.RIDE.holua_sled, 3, - 0.25, 'paved' ) < 0, 'a hōlua sled flies on grass and grinds on pavement' );
	ok( L.bailHurt( 8, true ) < L.bailHurt( 8, false ) * 0.6 && L.bailHurt( 2 ) === 0, 'pads take most of a fall; a slow one is nothing' );
	// paddling and the sea
	ok( L.PADDLE.stand.v > 1.6 * 1.5, 'a paddleboard is much faster than swimming' );
	ok( L.waveKnock( 'stand', 0.9, 1.5 ) > L.waveKnock( 'stand', 0.9, 8 ) && L.waveKnock( 'kneel', 0.9, 1.5 ) < L.waveKnock( 'stand', 0.9, 1.5 ) && L.waveKnock( 'stand', 0.2, 8 ) === 0, 'surf throws you, kneeling is steadier, flat water never' );
	// the zipline's cable
	const a = { x: 0, y: 20, z: 0 }, b = { x: 60, y: 12, z: 0 };
	ok( L.zipCheck( a, b ).ok && ! L.zipCheck( a, { x: 100, y: 0, z: 0 } ).ok && ! L.zipCheck( a, { x: 60, y: 19.5, z: 0 } ).ok, 'zipline: range and drop checked' );
	ok( L.zipShape( a, b, 0.5, L.ZIP.sag ).y < 16 - 1, 'the cable sags in the middle' );
	const gentle = { x: 60, y: 17, z: 0 };
	ok( L.zipAccel( L.zipGrade( a, b, 0.1 ), 0 ) > 0.5 && L.zipAccel( L.zipGrade( a, gentle, 0.95 ), 6 ) < 0, 'steep at the top; a gentle line slows near the end' );
	// climbing: gear helps
	const bare = L.climbRates( 'rope', {} ), kit = L.climbRates( 'rope', { harness: true, ascender: true, descender: true, gloves: true, chalk: true } );
	ok( kit.up > bare.up * 1.6 && kit.stamina < bare.stamina * 0.5 && kit.down > bare.down * 2, 'a harness, an ascender and a descender make a rope easy' );
	ok( L.climbRates( 'ladder' ).up > bare.up * 1.8, 'a ladder beats a rope' );
	ok( L.surfaceKind( { flags: L.FLAG.STREET } ) === 'paved' && L.surfaceKind( { beach: true } ) === 'sand' && L.surfaceKind( {} ) === 'grass' && L.surfaceKind( { box: { mat: 'wood' } } ) === 'wood', 'surfaces' );
}

// ---- a stub world ----------------------------------------------------------------------------------------------------------
// ground( x, z ): the terrain; flags( x, z ): hf flag bits; sea: the water level (0) where the terrain is under it
class HF {
	constructor() { this.f = () => 0; this.flags = () => 0; }
	heightAt( x, z ) { return this.f( x, z ); }
	baseHeight( x, z ) { return this.f( x, z ); }
	normalAt( x, z, out = new THREE.Vector3(), e = 1 ) { return out.set( this.f( x - e, z ) - this.f( x + e, z ), 2 * e, this.f( x, z - e ) - this.f( x, z + e ) ).normalize(); }
	flagsNear( x, z ) { return this.flags( x, z ); }
	surfaceAt() { return [ 0.5, 0, 0, 0 ]; }
	islandAt() { return 3; }
	raycast( ox, oy, oz, dx, dy, dz, maxT ) {
		for ( let t = 0; t <= maxT; t += 0.05 ) if ( oy + dy * t < this.f( ox + dx * t, oz + dz * t ) ) return Math.max( 0, t - 0.025 );
		return - 1;
	}
}
const hf = new HF();
const sea = { level: - 999, heightAt() { return sea.level; } };
const toasts = [], noises = [], spawned = [], drops = [];
const keys = new Set(), pressed = new Set();
const input = {
	consumeMouse: () => [ 0, 0 ], is: ( a ) => keys.has( a ), pressed: ( a ) => pressed.has( a ), released: () => false, codes: ( a ) => [ a ], codePressed: () => false,
	pressedQ: new Set(), down: new Set(), consumeWheel: () => 0, label: ( a ) => a,
};
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	playTime: 0, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera( 62, 1.6, 0.08, 1000 ), viewCamera: { fov: 44 }, stats: {},
	events: new Events(), audio: { play() { return null; }, loop() { return { set() {}, stop() {} }; }, footstep() {}, buffers: new Map() },
	settings: { get: ( k ) => k === 'fov' ? 62 : k === 'headBob' ? 1 : false },
	interact: { addProvider() { return () => {}; }, target: null, holdT: 0 },
	input, inputActive: true, dead: false, hf,
	world: { isIndoors: () => false, isBeach: () => false, meta: { cities: [] }, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } },
	weather: { rain: 0, state: 'clear', cover: 0.3, wind: 0, sea: 0.2 },
	entities: { near: () => [], raycast: () => null, add() {}, remove() {} },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => drops.push( s ),
	app: { ui: { inventory: { other: null }, openContainer: ( c ) => { game.opened = c; } } },
	nearFire: () => false, onPlayerDeath() { game.died = true; },
	systems: [], register( s ) { this.systems.push( s ); },
};
game.physics = new Physics( hf, sea );
game.player = new Player( game );
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.survival = new Survival( game );
game.skills = game.survival.skills || game.skills;
game.actions = new Actions( game );
game.itemUse = new ItemUse( game, null );
game.crafting = new Crafting( game, null );
game.combine = new Combine( game );
game.placeables = new Placeables( game );
game.items3d = {
	items: [],
	spawn( stack, pos ) { const it = { stack, pos: pos.clone(), id: spawned.length }; spawned.push( it ); this.items.push( it ); return it; },
	remove( it ) { const i = this.items.indexOf( it ); if ( i >= 0 ) this.items.splice( i, 1 ); return i >= 0; },
	byStack( s ) { return this.items.find( it => it.stack === s ) || null; },
	near() { return []; },
};
const sys = RT.attach( game );
RT.setWindDir( { x: 1, y: 0 } );
const p = game.player, inv = p.inventory, S = game.survival, P = game.physics, PL = game.placeables;
inv.equip.back = makeStack( 'backpack_military', 1 );
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const clearInv = () => { for ( const s of [ ...inv.allStacks() ] ) if ( s !== inv.equip.back ) inv.remove( s ); inv.hands = null; };
const verb = ( st, v ) => game.itemUse.actions( st ).find( a => a.verb === v );
const finish = () => { for ( let i = 0; i < 8 && game.actions.busy; i ++ ) game.actions.update( 999 ); };
const DT = 1 / 30;
function step( sec, onFrame = null ) {
	const n = Math.round( sec / DT );
	for ( let i = 0; i < n; i ++ ) {
		onFrame?.( i * DT );
		game.playTime += DT;
		p.update( DT );
		game.actions.update( DT );
		sys.update( DT );
		PL.update( DT );
		pressed.clear();
		if ( S.stamina < 100 && ! sys.mode ) S.stamina = Math.min( 100, S.stamina + 10 * DT );
	}
}
const reset = ( x = 0, y = 0, z = 0, yaw = 0 ) => {
	if ( sys.mode ) sys.endMode( sys.mode, 'test' );
	p.pos.set( x, y, z ); p.vel.set( 0, 0, 0 ); p.yaw = yaw; p.pitch = 0; p.onGround = true; p.fallStart = null; p.stance = 'stand'; p.swimming = false;
	keys.clear(); pressed.clear();
	S.health = 100; S.stamina = 100; S.bleeding = 0; S.fracture = false; S.sprain = 0;
	toasts.length = 0;
};
const allBoxes = [];
const box = ( x, y, z, hx, hy, hz, mat = 'concrete', yaw = 0 ) => { const b = P.add( { x, y, z, hx, hy, hz, yaw, mat } ); allBoxes.push( b ); return b; };
const clearBoxes = () => { for ( const b of allBoxes ) P.remove( b ); allBoxes.length = 0; };
const recs = ( kind ) => [ ...PL.list.values() ].filter( r => r.kind === kind );
const clearRecs = () => { for ( const r of [ ...PL.list.values() ] ) PL.remove( r, { give: false } ); };

// ---- gliding ---------------------------------------------------------------------------------------------------------------
console.log( 'gliding' );
{
	// a cliff: 100 m up for x < 0, a plain below beyond it; the trades blowing onto it from the plain side (towards -x)
	hf.f = ( x ) => x < 0 ? 100 : x < 30 ? 100 - ( x / 30 ) * 100 : 0;
	game.weather.wind = 0;
	reset( - 5, 100, 0, - Math.PI / 2 ); // facing +x, over the edge
	clearInv();
	const wing = put( 'paraglider' ), vario = put( 'variometer' );
	vario.data.on = true;
	// not on the ground
	ok( ! sys.deployable(), 'nothing to open standing on the cliff' );
	// a jump off the edge: falling, with height under you
	p.pos.set( 40, 100, 0 ); p.vel.set( 2, - 4, 0 ); p.onGround = false;
	const d = sys.deployable();
	ok( d && d.stack === wing && ! d.chute, 'falling with a paraglider: open it' );
	const cand = sys.provide( { origin: new THREE.Vector3(), dir: new THREE.Vector3( 0, 0, - 1 ) }, 3 );
	ok( cand?.[ 0 ]?.key === 'jump' && /paraglider/i.test( cand[ 0 ].label ), `the prompt is on the jump key: ${cand?.[ 0 ]?.label}` );
	sys.deploy( d.stack, false );
	ok( sys.mode?.kind === 'glide' && p.mode === sys.mode, 'gliding' );
	const y0 = p.pos.y, x0 = p.pos.x;
	step( 20 );
	const drop = y0 - p.pos.y, run = Math.hypot( p.pos.x - x0, p.pos.z );
	ok( sys.mode?.kind === 'glide' && run / drop > 5.5, `twenty seconds on the wing: ${run.toFixed( 0 )} m forward, ${drop.toFixed( 0 )} m down` );
	ok( sys.mode.hud().altitude > 0 && sys.mode.hud().climb < 0, 'the HUD readout: height and climb' );
	// steering: right
	const h0 = p.yaw;
	keys.add( 'right' ); step( 3 ); keys.delete( 'right' );
	ok( p.yaw < h0 - 0.4, `turned right with the wing (${( h0 - p.yaw ).toFixed( 2 )} rad)` );
	// down to the ground: flare near the bottom
	let landed = false;
	step( 120, () => { if ( sys.mode && sys.mode.alt < 2.5 ) keys.add( 'back' ); if ( ! sys.mode && ! landed ) landed = true; } );
	keys.clear();
	ok( landed && ! sys.mode && p.onGround, 'landed' );
	ok( S.health > 99, `a flared landing on the plain (health ${S.health.toFixed( 1 )})` );
	const canopy = recs( 'mob_canopy' )[ 0 ];
	ok( canopy && canopy.stack === wing && ! inv.findUid( wing.uid ), 'the wing lies spread out where you landed' );
	ok( wing.cond < 1, `the wing wore a little (${wing.cond.toFixed( 4 )})` );
	// packing it up takes a while
	const A = PL.actionsOf( canopy );
	ok( A[ 0 ]?.label === 'Pack paraglider', 'F: pack it' );
	A[ 0 ].run(); finish();
	ok( ! recs( 'mob_canopy' ).length && inv.findUid( wing.uid ) && ! wing.data.spread, 'packed and carried again' );
	// ridge soaring: the wind up the cliff face holds you there
	game.weather.wind = 0.9; RT.setWindDir( { x: - 1, y: 0 } );
	reset( 15, 80, 0, - Math.PI / 2 ); // over the slope, facing +x: into the wind
	p.onGround = false; p.vel.set( 0, - 3, 0 );
	sys.deploy( wing, false );
	const yy = p.pos.y;
	const trace = [];
	step( 15, ( t ) => { if ( sys.mode && Math.round( t * 30 ) % 30 === 0 ) trace.push( `${t.toFixed( 0 )}s x ${p.pos.x.toFixed( 1 )} y ${p.pos.y.toFixed( 1 )} lift ${sys.mode.lift.toFixed( 2 )} vy ${sys.mode.s.vy.toFixed( 2 )}` ); } );
	keys.clear();
	if ( process.env.TRACE ) console.log( trace.join( '\n' ) );
	ok( sys.mode?.kind === 'glide' && p.pos.y > yy - 6, `ridge lift on the windward face (${( p.pos.y - yy ).toFixed( 1 )} m in 15 s)` );
	sys.endMode( sys.mode, 'test' );
	game.weather.wind = 0;
	// too low to open
	reset( 200, 3, 0 ); p.onGround = false; p.vel.set( 0, - 5, 0 );
	ok( ! sys.deployable(), 'three metres up: too low to open anything' );
	// the reserve, when there's no wing
	clearInv(); const res = put( 'reserve_chute' );
	reset( 200, 40, 0 ); p.onGround = false; p.vel.set( 0, - 15, 0 );
	const d2 = sys.deployable();
	ok( d2?.chute && d2.stack === res, 'falling with only a reserve: pull it' );
	sys.deploy( res, true );
	step( 4 );
	ok( sys.mode?.kind === 'chute' && Math.abs( p.vel.y + L.CHUTE.sink ) < 0.6, `under the reserve at ${( - p.vel.y ).toFixed( 1 )} m/s` );
	step( 20 );
	ok( ! sys.mode && S.health > 99, 'down on the reserve, unhurt' );
	ok( res.data.used && recs( 'mob_canopy' ).some( r => r.data.chute ), 'the reserve is spent and lies on the ground' );
	const rc = recs( 'mob_canopy' ).find( r => r.data.chute );
	PL.actionsOf( rc )[ 0 ].run(); finish();
	ok( inv.findUid( res.uid ) && ! res.data.used, 'repacked' );
	// a crash: straight into a wall
	clearInv(); const w2 = put( 'paraglider' );
	hf.f = () => 0;
	reset( 0, 30, 0, - Math.PI / 2 ); p.onGround = false; p.vel.set( 9, - 2, 0 );
	box( 25, 20, 0, 1, 20, 10 );
	sys.deploy( w2, false );
	sys.mode.s.open = 1; sys.mode.s.V = 9.6;
	step( 6 );
	ok( ! sys.mode?.kind && S.health < 95 && w2.cond < 0.9 && toasts.includes( 'Crashed' ), `into the wall: hurt (${S.health.toFixed( 0 )}), the wing torn (${w2.cond.toFixed( 2 )})` );
	clearBoxes();
	for ( const r of recs( 'mob_canopy' ) ) PL.remove( r, { give: false } );
}

// ---- skating ---------------------------------------------------------------------------------------------------------------
console.log( 'skating' );
{
	clearRecs();
	// a street (paved) along x for x < 40, grass beyond; a gentle downhill
	hf.f = ( x ) => - x * 0.03;
	hf.flags = ( x ) => x < 40 ? L.FLAG.STREET : 0;
	clearInv();
	const board = put( 'skateboard' );
	reset( 0, 0, 0, - Math.PI / 2 ); // facing +x
	inv.hands = board.uid;
	ok( verb( board, 'Ride' ), 'a skateboard: Ride' );
	verb( board, 'Ride' ).run();
	ok( sys.mode?.kind === 'ride' && ! inv.hands, 'on the board, hands free' );
	keys.add( 'forward' ); step( 3 ); keys.delete( 'forward' );
	const v3 = sys.mode.v;
	ok( v3 > 3.5 && v3 < 7, `pushed up to ${v3.toFixed( 1 )} m/s` );
	ok( noises.some( n => n.kind === 'skate' ), 'the wheels are heard' );
	step( 2 );
	ok( sys.mode.v >= v3 - 0.2, `rolling on down the hill (${sys.mode.v.toFixed( 1 )} m/s)` );
	// on into the grass: a fall
	let stunned = false;
	step( 12, () => { if ( ! sys.mode && ! stunned && sys.stunT > 0 ) stunned = S.moveModifiers().speed < 0.5; } );
	ok( ! sys.mode && toasts.includes( 'Hit the grass' ) && S.health < 100, `off into the grass at speed: a fall (health ${S.health.toFixed( 1 )})` );
	ok( spawned.some( s => s.stack === board ) && ! inv.findUid( board.uid ), 'the board rolled on without you' );
	ok( stunned, 'a moment to get up' );
	// pads: the same fall hurts less
	const hit = ( pads ) => { S.health = 100; inv.equip.legs = makeStack( 'jeans', 1 ); if ( pads ) inv.equip.legs.data.pads = 1; const m = new MODES.RideMode( sys, board, 'skateboard' ); sys.start( m ); m.v = 7; sys.bail( m, 'test', 7 ); const h = 100 - S.health; delete inv.equip.legs; return h; };
	const r0 = Math.random; Math.random = () => 0.99;
	const bare = hit( false ), padded = hit( true );
	Math.random = r0;
	ok( padded < bare * 0.7 && bare > 4, `knee and elbow pads: ${padded.toFixed( 1 )} vs ${bare.toFixed( 1 )}` );
	// a kerb: rolled into fast throws you; an ollie clears it
	hf.f = () => 0; hf.flags = () => L.FLAG.STREET;
	const kerb = box( 10, 0.075, 0, 2, 0.075, 20 );
	reset( 0, 0, 0, - Math.PI / 2 ); inv.add( board ); board.cond = 1;
	sys.ride( board ); sys.mode.v = 5;
	step( 2.5 );
	ok( ! sys.mode && toasts.includes( 'Hit a kerb' ), 'into a kerb at speed: off' );
	reset( 0, 0, 0, - Math.PI / 2 ); if ( ! inv.findUid( board.uid ) ) inv.add( board );
	sys.ride( board ); sys.mode.v = 5;
	let onKerb = 0;
	step( 2.5, ( t ) => { if ( Math.abs( p.pos.x - 7.9 ) < 0.12 && ! sys.mode?.air ) pressed.add( 'jump' ); if ( p.pos.x > 9 && p.pos.x < 11 ) onKerb = Math.max( onKerb, p.pos.y ); } );
	ok( sys.mode?.kind === 'ride' && p.pos.x > 11 && onKerb > 0.14, `an ollie up the kerb, and on (x ${p.pos.x.toFixed( 1 )}, up ${onKerb.toFixed( 2 )})` );
	P.remove( kerb );
	// a wall square on: crashed
	box( 20, 1, 0, 0.5, 1, 5 );
	sys.mode.v = 5; sys.mode.heading = - Math.PI / 2; p.yaw = - Math.PI / 2;
	step( 3 );
	ok( ! sys.mode && toasts.includes( 'Crashed' ), 'into a wall: crashed' );
	clearBoxes();
	// stepping off hands it back
	reset( 0, 0, 0 ); if ( ! inv.findUid( board.uid ) ) inv.add( board );
	sys.ride( board );
	const pr = sys.mode.prompt();
	ok( pr?.label === 'Step off', 'F: step off' );
	pr.action();
	ok( ! sys.mode && inv.hands === board.uid, 'off, the board in your hand' );
	// grass: no riding there
	hf.flags = () => 0;
	toasts.length = 0; sys.ride( board );
	ok( ! sys.mode && toasts.includes( 'Needs pavement' ), 'a board needs pavement' );
	// inline skates: worn, they skate wherever it's paved, and clump along on grass
	clearInv();
	const sk = makeStack( 'inline_skates', 1 ); inv.equip.feet = sk;
	hf.flags = ( x ) => x < 30 ? L.FLAG.STREET : 0;
	reset( 0, 0, 0, - Math.PI / 2 );
	step( 1 );
	ok( sys.mode?.kind === 'ride' && sys.mode.rkind === 'inline_skates', 'skates on pavement: skating' );
	keys.add( 'forward' ); step( 3 );
	ok( sys.mode?.v > 4, `striding along (${sys.mode?.v.toFixed( 1 )} m/s)` );
	keys.delete( 'forward' );
	sys.mode.v = 2; step( 20 );
	ok( ! sys.mode || sys.mode.surface !== 'grass', 'off the pavement the skating stops' );
	if ( sys.mode ) sys.endMode( sys.mode, 'test' );
	p.pos.set( 40, 0, 0 ); step( 0.6 );
	ok( ! sys.mode && S.moveModifiers().speed < 0.6 && ! S.moveModifiers().canSprint, 'skates on grass: slow going' );
	delete inv.equip.feet;
	// a hōlua sled down a grassy slope
	clearInv();
	const sled = put( 'holua_sled' );
	hf.f = ( x ) => - x * 0.3; hf.flags = () => 0;
	reset( 0, 0, 0, - Math.PI / 2 );
	sys.ride( sled );
	ok( sys.mode?.rkind === 'holua_sled', 'on the sled' );
	step( 4 );
	ok( sys.mode?.v > 6, `racing down the slope (${sys.mode?.v.toFixed( 1 )} m/s)` );
	sys.endMode( sys.mode, 'test' );
	hf.f = () => 0;
	reset( 0, 0, 0 ); toasts.length = 0; sys.ride( sled );
	ok( ! sys.mode && toasts.includes( 'Needs a slope' ), 'no slope: no sledding' );
}

// ---- paddling ---------------------------------------------------------------------------------------------------------------
console.log( 'paddling' );
{
	clearRecs();
	// the sea: the bed falls away from the beach at x = 0 (sea for x > 0), water level 0
	hf.f = ( x ) => 1 - x * 0.4; hf.flags = () => 0;
	sea.level = 0;
	game.weather.sea = 0.1; game.weather.wind = 0;
	clearInv();
	const sup = put( 'paddleboard' ), pad = put( 'sup_paddle' ), leash = put( 'board_leash' );
	reset( 2, 0.8, 0, - Math.PI / 2 ); // on the sand, facing the water (+x)
	verb( sup, 'Paddle out' ).run();
	ok( sys.mode?.kind === 'paddle' && sys.mode.stance === 'stand', 'standing on the board in the water' );
	ok( sys.mode.view?.kind === 'paddle' && sys.mode.view.paddle === 'sup_paddle', 'the paddle in your hands' );
	keys.add( 'forward' ); step( 8 );
	const v = sys.mode.v;
	ok( v > 2.2 && p.pos.x > 15, `paddling at ${v.toFixed( 1 )} m/s, out to x ${p.pos.x.toFixed( 0 )}` );
	ok( Math.abs( p.pos.y - ( L.PADDLE.stand.eye ? 0.14 - L.PADDLE.draft : 0 ) ) < 0.2 && ! p.swimming, 'riding the surface' );
	keys.delete( 'forward' );
	// kneel: lower
	keys.add( 'crouch' ); step( 0.5 );
	ok( sys.mode.stance === 'kneel' && sys.mode.eye < 1.2, 'kneeling' );
	keys.delete( 'crouch' );
	// a big sea: thrown off; the board stays on its leash beside you
	game.weather.sea = 1;
	sys.mode.v = 0; p.pos.x = 8;
	let t = 0;
	// (the dice fixed low: a knock comes on the first roll the sea allows)
	const rk = Math.random; Math.random = () => 0.004;
	step( 60, () => { t += sys.mode ? DT : 0; } );
	Math.random = rk;
	ok( ! sys.mode && toasts.includes( 'Knocked off' ), `the sea threw you off (after ${t.toFixed( 0 )} s)` );
	const fb = recs( 'mob_board' )[ 0 ];
	ok( fb && fb.data.leash && ! inv.findUid( sup.uid ), 'the board afloat on its leash' );
	game.weather.sea = 0.1;
	// climbing back on
	p.swimming = true;
	ok( sys.canBoard( fb ) && PL.actionsOf( fb )[ 0 ]?.label === 'Climb on', 'F: climb back on' );
	PL.actionsOf( fb )[ 0 ].run();
	ok( sys.mode?.kind === 'paddle' && ! recs( 'mob_board' ).length, 'back on the board' );
	// in to the beach: off onto the sand, the board left there
	p.yaw = Math.PI / 2; sys.mode.heading = Math.PI / 2; // facing -x, the beach
	keys.add( 'forward' ); step( 25 ); keys.clear();
	ok( ! sys.mode && recs( 'mob_board' )[ 0 ]?.data.beached, 'beached: off, the board on the sand' );
	const bb = recs( 'mob_board' )[ 0 ];
	p.pos.set( bb.pos.x, bb.pos.y, bb.pos.z );
	const pick = PL.actionsOf( bb ).find( a => a.label === 'Pick up' );
	if ( process.env.TRACE ) console.log( 'board acts', PL.actionsOf( bb ).map( a => a.label ), bb.stack?.uid, sup.uid );
	pick?.run();
	ok( inv.findUid( sup.uid ) && ! recs( 'mob_board' ).length, 'picked up' );
	// dropped into the sea it floats
	inv.remove( sup );
	const it = game.items3d.spawn( sup, new THREE.Vector3( 20, 0.5, 0 ) );
	sys.onDrop( sup );
	ok( recs( 'mob_board' ).length === 1 && ! game.items3d.items.includes( it ), 'a board dropped in the sea floats' );
	PL.remove( recs( 'mob_board' )[ 0 ], { give: false } );
	// a surfboard paddled prone, no paddle needed
	clearInv();
	const surf = put( 'surfboard' );
	reset( 15, - 0.5, 0, - Math.PI / 2 ); p.swimming = true;
	const c2 = sys.provide( { origin: new THREE.Vector3(), dir: new THREE.Vector3( 0, 0, - 1 ) }, 3 );
	ok( c2?.some( c => c.label === 'Climb on board' ), 'swimming with a board: climb on' );
	c2.find( c => c.label === 'Climb on board' ).action();
	ok( sys.mode?.kind === 'paddle' && sys.mode.prone && sys.mode.eye < 0.6, 'lying on the surfboard' );
	keys.add( 'forward' ); step( 5 ); keys.clear();
	ok( sys.mode.v > 1.7, `prone paddling ${sys.mode.v.toFixed( 1 )} m/s (swimming is 1.6)` );
	sys.endMode( sys.mode, 'off' );
	for ( const r of recs( 'mob_board' ) ) PL.remove( r, { give: false } );
	sea.level = - 999;
}

// ---- hauling ---------------------------------------------------------------------------------------------------------------
console.log( 'hauling' );
{
	clearRecs();
	hf.f = () => 0; hf.flags = ( x ) => x < 30 ? L.FLAG.STREET : 0;
	clearInv();
	reset( 0, 0, 0, - Math.PI / 2 );
	// a cart picked up some other way goes in front of you
	put( 'shopping_cart' );
	step( 0.4 );
	ok( sys.mode?.kind === 'haul' && ! inv.count( 'shopping_cart' ), 'a shopping cart is pushed, not carried' );
	const rec = sys.mode.rec;
	ok( rec.kind === 'mob_hauler' && rec._held, 'it is a cart in the world' );
	// its basket
	const c = haulContainer( rec );
	ok( c.capacity === 60 && c.items === itemsOf( rec.stack ), 'it holds 60' );
	c.items.push( makeStack( 'canned_beans', 6 ), makeStack( 'water_jug', 1 ) );
	// push it down the street
	keys.add( 'forward' ); step( 5 ); keys.delete( 'forward' );
	const run = p.pos.x;
	ok( run > 10 && run < 22, `pushed ${run.toFixed( 1 )} m in 5 s` );
	ok( Math.abs( rec.pos.x - ( p.pos.x + 0.95 ) ) < 0.3, 'the cart goes in front of you' );
	ok( noises.some( n => n.kind === 'cart' && n.radius > 10 ), 'a shopping cart rattles' );
	// on the grass it's hard going
	p.pos.x = 35; keys.add( 'forward' ); step( 5 ); keys.delete( 'forward' );
	ok( p.pos.x - 35 < run * 0.5, `on grass: ${( p.pos.x - 35 ).toFixed( 1 )} m` );
	// a wall stops the cart (and you)
	box( 48, 1, 0, 0.3, 1, 5 );
	keys.add( 'forward' ); step( 8 ); keys.delete( 'forward' );
	ok( rec.pos.x < 48 - 0.3 && p.pos.x < 47, `stopped by the wall (cart at ${rec.pos.x.toFixed( 2 )})` );
	clearBoxes();
	// the inventory key opens it; F lets go and it stays
	sys.openHauler( rec );
	ok( game.opened?.key === 'mob:' + rec.id, 'open the cart' );
	sys.mode.prompt().action();
	ok( ! sys.mode && PL.list.has( rec.id ) && ! rec._held && rec._box, 'let go: it stands there (in the way)' );
	const acts = PL.actionsOf( rec ).map( a => a.label );
	ok( acts[ 0 ] === 'Push' && acts.includes( 'Open' ), `its F list: ${acts.join( ', ' )}` );
	// a blow knocks your hands off it
	PL.actionsOf( rec )[ 0 ].run();
	S.hurt( 3, 'scratch', {} ); sys.update( DT );
	ok( ! sys.mode, 'a scratch: you let go' );
	// a wagon: pulled behind, folds when empty
	clearInv();
	const wag = put( 'beach_wagon' );
	reset( 0, 0, 0, - Math.PI / 2 );
	verb( wag, 'Unfold' ).run(); finish();
	const wr = recs( 'mob_hauler' ).find( r => r.stack?.id === 'beach_wagon' );
	ok( wr && ! inv.findUid( wag.uid ), 'unfolded on the ground' );
	sys.haul( wr );
	ok( sys.mode?.pull && ! sys.mode.busyHands, 'pulling it, a hand free' );
	keys.add( 'forward' ); step( 4 ); keys.delete( 'forward' );
	ok( Math.hypot( wr.pos.x - p.pos.x, wr.pos.z - p.pos.z ) <= 1.7 && wr.pos.x < p.pos.x, `it trails behind (${( p.pos.x - wr.pos.x ).toFixed( 2 )} m)` );
	sys.endMode( sys.mode, 'letgo' );
	itemsOf( wr.stack ).push( makeStack( 'towel', 1 ) );
	PL.actionsOf( wr ).find( a => a.label === 'Fold' ).run();
	ok( toasts.includes( 'Empty it first' ), 'fold it: empty it first' );
	itemsOf( wr.stack ).length = 0;
	PL.actionsOf( wr ).find( a => a.label === 'Fold' ).run(); finish();
	ok( inv.findUid( wag.uid ) && ! PL.list.has( wr.id ), 'folded and carried' );
	// a hand truck moves a placed rain barrel
	clearInv();
	const ht = put( 'hand_truck' );
	reset( 0, 0, 0, - Math.PI / 2 );
	verb( ht, 'Set down' ).run(); finish();
	const tr = recs( 'mob_hauler' ).find( r => r.stack?.id === 'hand_truck' );
	const barrel = PL.add( 'collector', makeStack( 'rain_barrel', 1 ), { x: tr.pos.x + 1, y: 0, z: 0 }, 0 );
	barrel.data.litres = 40;
	const ld = PL.actionsOf( tr ).find( a => a.label.startsWith( 'Load' ) );
	ok( ld, `the hand truck offers: ${ld?.label}` );
	ld.run();
	if ( process.env.TRACE ) console.log( 'loading', game.actions.current?.label, toasts.slice( - 3 ) );
	finish();
	ok( tr.data.load && ! PL.list.has( barrel.id ), 'the barrel is on the truck' );
	sys.haul( tr );
	keys.add( 'forward' ); step( 3 ); keys.delete( 'forward' );
	sys.endMode( sys.mode, 'letgo' );
	PL.actionsOf( tr ).find( a => a.label === 'Unload' ).run(); finish();
	const moved = [ ...PL.list.values() ].find( r => r.id === barrel.id );
	ok( moved && moved.data.litres === 40 && moved.pos.x > 5, `unloaded ${moved?.pos.x.toFixed( 1 )} m on, its water still in it` );
	PL.remove( moved, { give: false } );
}

// ---- climbing ---------------------------------------------------------------------------------------------------------------
console.log( 'climbing' );
{
	hf.f = () => 0; hf.flags = () => 0;
	clearRecs();
	// a building 6 m tall, its front face at x = 10 (the player out at x < 10), a flat roof
	const bld = box( 15, 3, 0, 5, 3, 8 );
	clearInv();
	const lad = put( 'extension_ladder' );
	reset( 8, 0, 0, - Math.PI / 2 ); // facing +x, the wall 2 m ahead
	const spot = LEDGE.ladderSpot( game, new THREE.Vector3( 8, 1.66, 0 ), new THREE.Vector3( 1, 0.2, 0 ).normalize(), L.LADDERS.extension_ladder );
	ok( spot.ok && Math.abs( spot.top.y - 6 ) < 0.1 && spot.ledge && Math.abs( spot.ledge.y - 6 ) < 0.05, `a ladder spot: head at ${spot.top?.y.toFixed( 2 )}, a roof to step onto` );
	ok( spot.bot.x < 10 - 1 && spot.bot.x > 10 - 2.5, `its foot out from the wall (${( 10 - spot.bot.x ).toFixed( 2 )} m)` );
	const short = LEDGE.ladderSpot( game, new THREE.Vector3( 8, 1.66, 0 ), new THREE.Vector3( 1, 0.2, 0 ).normalize(), L.LADDERS.folding_ladder );
	ok( short.ok && ! short.ledge && short.note, `a short ladder reaches only part way: ${short.note || short.reason}` );
	// the verb aims; F puts it up
	verb( lad, 'Lean on wall' ).run();
	ok( sys.aim, 'aiming the ladder' );
	p.pitch = 0.2;
	step( 0.3 );
	pressed.add( 'interact' ); sys.update( DT ); pressed.clear();
	finish();
	const lr = recs( 'mob_ladder' )[ 0 ];
	ok( lr && ! inv.findUid( lad.uid ) && ! sys.aim, 'the ladder is up' );
	// climb it from the bottom, up onto the roof
	p.pos.set( lr.pos.x - 0.6, 0, 0 );
	sys.climb( lr, false );
	ok( sys.mode?.kind === 'climb' && sys.mode.path.kind === 'ladder', 'on the ladder' );
	keys.add( 'forward' ); step( 10, () => { if ( ! sys.mode ) keys.clear(); } ); keys.clear();
	ok( ! sys.mode && Math.abs( p.pos.y - 6 ) < 0.1 && p.pos.x > 10.2, `over the top onto the roof (${p.pos.x.toFixed( 2 )}, ${p.pos.y.toFixed( 2 )})` );
	ok( noises.some( n => n.kind === 'climb' ), 'the rungs clank' );
	// pull it up after you, lower it again
	sys.pullUp( lr ); finish();
	ok( lr.data.up && Math.abs( lr.pos.y - 6 ) < 0.1, 'pulled up onto the roof' );
	sys.pullUp( lr ); finish();
	ok( ! lr.data.up && lr.pos.y < 0.1, 'lowered again' );
	// a rope tied off at the edge, climbed down
	const rope = put( 'climbing_rope' );
	p.pos.set( 10.6, 6, 0 ); p.yaw = Math.PI / 2; p.pitch = - 0.5; // on the roof, facing out over the edge (-x)
	const eb = LEDGE.edgeBelow( game, p.pos, p.lookDir( new THREE.Vector3() ), 28 );
	ok( eb.ok && Math.abs( eb.drop - 6 ) < 0.2 && eb.top.x < 10.1, `the edge in front: ${eb.drop?.toFixed( 1 )} m down` );
	verb( rope, 'Tie off at edge' ).run();
	step( 0.3 );
	pressed.add( 'fire' ); sys.update( DT ); pressed.clear(); finish();
	const rr = recs( 'mob_rope' )[ 0 ];
	ok( rr && Math.abs( rr.data.top[ 1 ] - 6 ) < 0.1 && rr.pos.y < 0.1, 'the rope hangs from the edge to the ground' );
	sys.climb( rr, true );
	ok( sys.mode?.kind === 'climb' && sys.mode.path.kind === 'rope', 'climbing down' );
	keys.add( 'back' ); step( 12 ); keys.clear();
	ok( ! sys.mode && p.pos.y < 0.1 && p.onGround, 'down at the bottom' );
	// up it again: slower than the ladder, harder work; with a harness and an ascender, quicker
	const up = ( kit ) => {
		reset( rr.pos.x - 0.3, 0, 0, - Math.PI / 2 );
		if ( kit ) { inv.equip.belt = makeStack( 'climbing_harness', 1 ); put( 'ascender' ); }
		sys.climb( rr, false );
		keys.add( 'forward' ); let t = 0;
		step( 30, () => { if ( sys.mode ) t += DT; } );
		keys.clear();
		if ( kit ) { delete inv.equip.belt; inv.remove( inv.find( s => s.id === 'ascender' ) ); }
		return t;
	};
	const tBare = up( false ), tKit = up( true );
	ok( tBare > 9 && tKit < tBare * 0.75, `six metres of rope: ${tBare.toFixed( 1 )} s bare, ${tKit.toFixed( 1 )} s with a harness and ascender` );
	// letting go part way: a fall
	reset( rr.pos.x - 0.3, 0, 0 ); sys.climb( rr, false ); sys.mode.u = 4; step( DT );
	pressed.add( 'jump' ); step( DT );
	ok( ! sys.mode && p.fallStart > 3, 'let go: falling' );
	step( 2 );
	// a rope ladder hung from the roof edge
	const rl = put( 'rope_ladder' );
	reset( 10.6, 6, 0, Math.PI / 2 ); p.pitch = - 0.5;
	sys.aimAt( rl, 'rope_ladder' );
	step( 0.3 );
	pressed.add( 'fire' ); sys.update( DT ); pressed.clear(); finish();
	ok( recs( 'mob_rope_ladder' ).length === 1, 'an escape ladder hung over the edge' );
	// a grappling hook thrown up from below
	for ( const r of [ ...recs( 'mob_rope' ), ...recs( 'mob_rope_ladder' ) ] ) PL.remove( r, { give: false } );
	const hook = put( 'grappling_hook' ), r9 = put( 'rope' );
	ok( ! verb( hook, 'Throw' ), 'an unrigged hook is not thrown' );
	const m = C.getCombo( 'mob_rig_hook' );
	ok( game.combine.state( m, r9, hook ).ok, 'rig the hook with a rope' );
	game.combine.run( m, r9, hook ); finish();
	ok( hook.data.rope === 'rope' && ! inv.count( 'rope' ) && verb( hook, 'Throw' ), 'rigged: Throw' );
	reset( 5, 0, 0, - Math.PI / 2 ); p.pitch = 0.6; // aiming high up the wall from 5 m out
	const r1 = Math.random; Math.random = () => 0.1;
	verb( hook, 'Throw' ).run();
	step( 1.5 );
	Math.random = r1;
	const hr = recs( 'mob_rope' )[ 0 ];
	ok( hr?.data.hook && Math.abs( hr.data.top[ 1 ] - 6 ) < 0.15 && toasts.includes( 'Hook caught' ), `the hook caught the roof's edge (${hr?.data.top[ 1 ].toFixed( 2 )})` );
	// yank it down from below
	const r2 = Math.random; Math.random = () => 0.9;
	sys.takeDown( hr, 'yank' ); finish();
	Math.random = r2;
	ok( ! PL.list.has( hr.id ) && inv.findUid( hook.uid )?.data.rope === 'rope', 'yanked down, still rigged' );
	// an awning over the shop front: no ladder up through it, and a hook's rope would hang onto it out of reach
	const awn = box( 9.3, 3.2, 0, 0.7, 0.08, 3 );
	reset( 8, 0, 0, - Math.PI / 2 );
	const la = LEDGE.ladderSpot( game, new THREE.Vector3( 8, 1.66, 0 ), new THREE.Vector3( 1, 0.2, 0 ).normalize(), L.LADDERS.extension_ladder );
	reset( 5, 0, 0, - Math.PI / 2 );
	const hk = LEDGE.hookSpot( game, new THREE.Vector3( 5, 1.66, 0 ), new THREE.Vector3( 5, 3.3, 0 ).normalize(), 9 );
	ok( la.reason === 'Something in the way' && hk.reason === 'Out of reach', `under an awning: ladder ${la.reason}, hook ${hk.reason}` );
	P.remove( awn );
	P.remove( bld );
	// a roof behind a parapet a metre high: the ladder's head on the parapet, a step down onto the roof
	const low = box( 15, 2.5, 0, 5, 2.5, 8 ), par = box( 10.12, 5.5, 0, 0.12, 0.5, 8 );
	reset( 8, 0, 0, - Math.PI / 2 );
	const ps = LEDGE.ladderSpot( game, new THREE.Vector3( 8, 1.66, 0 ), new THREE.Vector3( 1, 0.2, 0 ).normalize(), L.LADDERS.extension_ladder );
	ok( ps.ok && Math.abs( ps.top.y - 6 ) < 0.1 && ps.ledge && Math.abs( ps.ledge.y - 5 ) < 0.05, `over a parapet: head at ${ps.top?.y.toFixed( 2 )}, roof at ${ps.ledge?.y.toFixed( 2 )}` );
	const pl2 = PL.add( 'mob_ladder', makeStack( 'extension_ladder', 1 ), { x: ps.bot.x, y: ps.bot.y, z: ps.bot.z }, ps.face, { top: [ ps.top.x, ps.top.y, ps.top.z ], bot: [ ps.bot.x, ps.bot.y, ps.bot.z ], face: ps.face, ledge: [ ps.ledge.x, ps.ledge.y, ps.ledge.z ] }, 'extension_ladder' );
	p.pos.set( ps.bot.x - 0.6, 0, 0 );
	sys.climb( pl2, false );
	let peak = 0;
	keys.add( 'forward' ); step( 12, () => { peak = Math.max( peak, p.pos.y ); if ( ! sys.mode ) keys.clear(); } ); keys.clear();
	ok( ! sys.mode && Math.abs( p.pos.y - 5 ) < 0.1 && p.pos.x > 10.3 && peak > 6, `over the parapet onto the roof (${p.pos.x.toFixed( 2 )}, ${p.pos.y.toFixed( 2 )}, feet up to ${peak.toFixed( 2 )})` );
	PL.remove( pl2, { give: false } );
	P.remove( low ); P.remove( par );
	for ( const r of recs( 'mob_ladder' ) ) PL.remove( r, { give: false } );
}

// ---- the zipline ------------------------------------------------------------------------------------------------------------
console.log( 'zipline' );
{
	clearRecs();
	// a hill: 20 m up at x = 0 down to 0 at x = 60; a tree at each end
	hf.f = ( x ) => x <= 0 ? 20 : x >= 60 ? 0 : 20 * ( 1 - x / 60 ) ** 2;
	hf.flags = () => 0;
	const t1 = box( 0, 20 + 4, 1, 0.2, 4, 0.2, 'wood' ), t2 = box( 60, 4, 1, 0.2, 4, 0.2, 'wood' );
	clearInv();
	const kit = put( 'zipline_kit' ), trolley = put( 'zip_trolley' );
	reset( 30, 10, 0 );
	toasts.length = 0; verb( kit, 'Tie first end' ).run();
	ok( toasts.includes( 'Stand by a tree or a post' ), 'the first end needs a tree' );
	reset( 0, 20, 0 );
	verb( kit, 'Tie first end' ).run(); finish();
	const zr = recs( 'mob_zipline' )[ 0 ];
	ok( zr && ! zr.data.b && sys.zip?.id === zr.id && Math.abs( zr.data.a.y - 22.3 ) < 0.3, 'one end tied round the tree' );
	// walk the cable to the far tree and tie it off
	reset( 60, 0, 0 );
	const cands = sys.provide( { origin: new THREE.Vector3( 60, 1.6, 0 ), dir: new THREE.Vector3( 0, 0, 1 ) }, 3 ) || [];
	const tie = cands.find( c => c.label === 'Tie off zipline' );
	ok( tie && tie.hold && /m$/.test( tie.sub ), `at the far tree: ${tie?.label} (${tie?.sub})` );
	tie.action(); finish();
	ok( zr.data.b && zr.data.a.y > zr.data.b.y && ! sys.zip, `strung: ${L.zipCheck( zr.data.a, zr.data.b ).L.toFixed( 0 )} m of cable` );
	// ride it down from the top on the trolley
	reset( 0.5, 20, 0 );
	const rc = ( sys.provide( { origin: new THREE.Vector3( 0.5, 21.66, 0 ), dir: new THREE.Vector3( - 0.3, 0.2, 0.9 ).normalize() }, 3 ) || [] ).find( c => c.label === 'Ride zipline' );
	ok( rc, 'Ride zipline at the top' );
	rc?.action();
	ok( sys.mode?.kind === 'zip' && sys.mode.trolley === trolley, 'on the trolley' );
	let vmax = 0;
	step( 25, () => { if ( sys.mode ) vmax = Math.max( vmax, sys.mode.v ); } );
	ok( ! sys.mode && p.pos.x > 45, `down the line (x ${p.pos.x.toFixed( 0 )}, top speed ${vmax.toFixed( 1 )} m/s)` );
	ok( vmax > 6 && vmax < 20, 'a fast ride' );
	// without a trolley: hand over hand, slowly, while the arms last
	inv.remove( trolley );
	reset( 0.5, 20, 0, - Math.PI / 2 );
	sys.zipRide( zr, 0.02 );
	ok( sys.mode?.kind === 'zip' && ! sys.mode.trolley, 'hand over hand' );
	const s0 = sys.mode.s;
	keys.add( 'forward' ); step( 4 ); keys.clear();
	ok( sys.mode && ( sys.mode.s - s0 ) * sys.mode.L > 1.5 && ( sys.mode.s - s0 ) * sys.mode.L < 3.5 && S.stamina < 80, 'slow going and hard work' );
	sys.letGo( sys.mode );
	step( 2 );
	// take it down
	reset( 0.5, 20, 0 );
	sys.zipTakeDown( zr ); finish();
	ok( ! PL.list.has( zr.id ) && inv.count( 'zipline_kit' ), 'taken down, the kit back' );
	P.remove( t1 ); P.remove( t2 );
}

// ---- small things ----------------------------------------------------------------------------------------------------------
console.log( 'held and worn' );
{
	clearRecs();
	hf.f = ( x ) => x * 1.38; hf.flags = () => 0;
	clearInv();
	// trekking poles: a slope too steep to walk up becomes climbable
	reset( 0, 0, 0, Math.PI / 2 ); // facing -x: uphill is +x... face +x
	p.yaw = - Math.PI / 2;
	keys.add( 'forward' ); step( 3 ); const bare = p.pos.x; keys.clear();
	const poles = put( 'trekking_poles' ); inv.hands = poles.uid;
	reset( 0, 0, 0, - Math.PI / 2 ); inv.hands = poles.uid;
	keys.add( 'forward' ); step( 3 ); keys.clear();
	ok( bare < 0.5 && p.pos.x > 3, `a 54° slope: ${bare.toFixed( 2 )} m without poles, ${p.pos.x.toFixed( 1 )} m with` );
	inv.hands = null;
	// an umbrella: open in the rain, you stay dry
	hf.f = () => 0;
	const um = put( 'umbrella' );
	ok( getItem( 'umbrella' ).tool.jab?.damage > 3 && ! getItem( 'umbrella_open' ).tool.jab, 'furled, it jabs (a little harder than a shove); open, it does not' );
	verb( um, 'Open' ).run();
	ok( um.id === 'umbrella_open' && verb( um, 'Close' ), 'opened' );
	inv.hands = um.uid;
	game.weather.rain = 1;
	S.wet = 0.1;
	for ( let i = 0; i < 60; i ++ ) { S.wet = Math.min( 1, S.wet + 0.01 ); sys.update( DT ); }
	ok( S.wet < 0.12, `held open in the rain: dry (${S.wet.toFixed( 3 )})` );
	inv.hands = null; sys.update( DT );
	for ( let i = 0; i < 10; i ++ ) { S.wet += 0.01; sys.update( DT ); }
	ok( S.wet > 0.18, 'put away: wet' );
	game.weather.rain = 0;
	// a variometer runs its batteries down while on
	const vr = put( 'variometer' );
	verb( vr, 'Turn on' ).run();
	const c0 = vr.data.charge;
	game.time.dayMinutes = 1;
	step( 2 );
	game.time.dayMinutes = 48;
	ok( vr.data.on && vr.data.charge < c0, 'the variometer drains its cells while on' );
}

// ---- saving -----------------------------------------------------------------------------------------------------------------
console.log( 'save and load' );
{
	hf.f = () => 0;
	for ( const r of [ ...PL.list.values() ] ) PL.remove( r, { give: false } );
	const cart = PL.add( 'mob_hauler', makeStack( 'shopping_cart', 1 ), { x: 3, y: 0, z: 0 }, 0.4, {}, 'shopping_cart' );
	itemsOf( cart.stack ).push( makeStack( 'spam', 1 ), makeStack( 'rope', 1 ) );
	const lad = PL.add( 'mob_ladder', makeStack( 'folding_ladder', 1 ), { x: 5, y: 0, z: 0 }, 1.2, { top: [ 5.5, 3.4, 0 ], bot: [ 5, 0, 0 ], face: 1.2, ledge: [ 6, 3.4, 0 ] }, 'folding_ladder' );
	const rope = PL.add( 'mob_rope', makeStack( 'grappling_hook', 1 ), { x: 8, y: 0, z: 0 }, 0, { top: [ 8, 6, 0 ], bot: [ 8, 0, 0 ], face: 0, ledge: null, hook: true }, 'grappling_hook' );
	rope.stack.data.rope = 'climbing_rope';
	const zip = PL.add( 'mob_zipline', makeStack( 'zipline_kit', 1 ), { x: 0, y: 0, z: 0 }, 0, { a: { x: 0, y: 10, z: 0 }, b: null }, 'zipline_kit' );
	sys.zip = { id: zip.id };
	const save = { world: {} };
	PL.serialize( save ); sys.serialize( save );
	const json = JSON.parse( JSON.stringify( save ) );
	for ( const r of [ ...PL.list.values() ] ) PL.remove( r, { give: false } );
	sys.zip = null;
	PL.load( json ); sys.load( json );
	const c2 = recs( 'mob_hauler' )[ 0 ], l2 = recs( 'mob_ladder' )[ 0 ], r2 = recs( 'mob_rope' )[ 0 ], z2 = recs( 'mob_zipline' )[ 0 ];
	ok( c2 && itemsOf( c2.stack ).length === 2 && itemsOf( c2.stack ).some( s => s.id === 'spam' ) && Math.abs( c2.yaw - 0.4 ) < 0.01, 'the cart and what was in it' );
	ok( l2 && l2.data.ledge?.[ 1 ] === 3.4 && l2.stack.id === 'folding_ladder', 'the ladder where it was leant' );
	ok( r2 && r2.data.hook && r2.stack.data.rope === 'climbing_rope', 'the hooked rope, rigged' );
	ok( z2 && ! z2.data.b && sys.zip?.id === z2.id, 'the zipline still being strung' );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
