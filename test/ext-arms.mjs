// The arms items (Node, a fake DOM for canvas labels): node test/ext-arms.mjs
//   the catalogue: every arms item has a model (weapon parts through the weapons module's builders), a place to be
//   found or a way to be made, and something to do; loot weights keep the rare things rare
//   the rules: firecracker pops, the tripwire line, the shield's front arc, hit damage, parts kits by class, the
//   rail-free fittings and their handling numbers (src/weapons/ops.js)
//   on a stub game with the real Inventory, Survival, Actions, ItemUse, Crafting, Combine, Placeables, Physics and the
//   weapons module's Throwables: every combo and recipe, the verbs (slingshot, horns, thrown alarm clock and radio,
//   untaping, taking spears apart, arm guards), the thrown kinds (firecrackers drawing the infected, a knife hitting and
//   dropping to be picked up, slingshot shot, a road flare), the can tripwire tripped by the infected, the riot
//   shield's block, the sounds
import { installFakeDom } from './lib/fake-dom.mjs';
installFakeDom();
const THREE = await import( 'three' );
const warnings = [];
const warn0 = console.warn;
console.warn = ( ...a ) => { warnings.push( a.join( ' ' ) ); };
await import( '../src/game/items/defs/index.js' );
console.warn = warn0;
const { ITEMS, getItem, makeStack } = await import( '../src/game/items/ItemDB.js' );
const { LOOT_TABLES, compileTable } = await import( '../src/game/items/Loot.js' );
const { allRecipes } = await import( '../src/game/items/recipes.js' );
const C = await import( '../src/game/items/combos.js' );
const R = await import( '../src/game/items/placeables/registry.js' );
const L = await import( '../src/game/items/ext/arms/logic.js' );
const RT = await import( '../src/game/items/ext/arms/runtime.js' );
const { THROW_KINDS } = await import( '../src/game/items/ext/arms/throw.js' );
const { ARMS_SOUNDS, renderArmsSound } = await import( '../src/game/items/ext/arms/sounds.js' );
const { trip } = await import( '../src/game/items/ext/arms/kinds.js' );
const { hasModelBuilder, buildItemModel } = await import( '../src/render/ItemModels.js' );
const GM = await import( '../src/weapons/GunModels.js' );
const ops = await import( '../src/weapons/ops.js' );
const { Throwables } = await import( '../src/weapons/Throwables.js' );
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
ok( ! warnings.some( w => /duplicate (item|combo)/.test( w ) ), 'no duplicate ids: ' + warnings.filter( w => /duplicate/.test( w ) ).join( '; ' ) );
const ARMS = [ ...ITEMS.values() ].filter( d => d.tags.includes( 'arms' ) );
ok( ARMS.length >= 40, `arms items (${ARMS.length})` );
const byCat = {};
for ( const d of ARMS ) byCat[ d.cat ] = ( byCat[ d.cat ] || 0 ) + 1;
console.log( '   ' + JSON.stringify( byCat ) );
ok( ARMS.some( d => d.tool?.kind === 'whetstone' ), 'the tool kind whetstone exists (owned by arms)' );
for ( const id of [ 'leiomano', 'pahoa', 'newa', 'koa_spear' ] ) ok( getItem( id )?.rarity === 'epic' && getItem( id ).tags.includes( 'hawaiian' ), `${id}: a rare Hawaiian weapon` );
for ( const d of ARMS ) {
	ok( hasModelBuilder( d.model.type ), `${d.id}: model builder ${d.model.type}` );
	ok( d.desc && d.desc.length <= 44 && ! /!/.test( d.desc ), `${d.id}: a short plain description '${d.desc}'` );
	ok( /^[a-z0-9_]+$/.test( d.id ), `${d.id}: snake_case` );
}
// visible somewhere (a building's loot spots or an outdoor site), or made
const visible = new Set(), made = new Set();
for ( const [ name, t ] of Object.entries( LOOT_TABLES ) ) {
	if ( /^(car_|zombie_|gear_)/.test( name ) ) continue;
	for ( const e of compileTable( t ).entries ) for ( const id of e.ids ) visible.add( id );
}
const recipes = allRecipes();
for ( const r of recipes ) made.add( r.out[ 0 ] );
for ( const c of C.allCombos() ) for ( const [ id ] of c.out ) made.add( id );
made.add( 'screwdriver_shiv' ); made.add( 'sharpened_shovel' ); made.add( 'taped_flashlight' ); made.add( 'taped_bayonet' ); // combos that replace in place
for ( const d of ARMS ) ok( visible.has( d.id ) || made.has( d.id ), `${d.id}: found in the world or made` );
// something to do with each
const inRecipe = new Set();
for ( const r of recipes ) { for ( const [ id ] of r.in ) inRecipe.add( id ); inRecipe.add( r.out[ 0 ] ); }
const inCombo = ( d ) => {
	const st = makeStack( d.id, d.stack, { full: true } ); st.cond = 0.5;
	if ( d.tool?.battery ) st.data.charge = 0;
	return C.allCombos().some( c => C.matches( c.a, st, d ) || C.matches( c.b, st, d ) );
};
const VERBS = new Set( [ 'steel_shot', 'slingshot', 'air_horn', 'party_horn', 'machete_spear', 'knife_spear', 'taped_flashlight', 'taped_bayonet' ] );
const fitsSome = ( d ) => [ ...ITEMS.values() ].some( g => g.firearm && ops.attachmentFits( g, d ).ok );
for ( const d of ARMS ) {
	const does = d.melee || ( d.attachment && fitsSome( d ) ) || ( d.throwable && THROW_KINDS[ d.throwable.kind ] ) || d.clothing?.armor?.bite > 0 || d.place || inRecipe.has( d.id ) || VERBS.has( d.id ) || inCombo( d );
	ok( !! does, `${d.id}: does something` );
}
// every melee weapon kills the infected (~100 hp) in 1-5 blows, the shield aside (it shoves)
for ( const d of ARMS.filter( x => x.melee && ! x.melee.push ) ) {
	const m = d.melee, hits = Math.ceil( 100 / m.damage );
	ok( hits >= 1 && hits <= 5 && m.speed > 0 && m.reach > 1 && m.stamina > 0 && m.wear > 0, `${d.id}: melee numbers (${hits} blows)` );
	ok( [ 'blade', 'blunt', 'axe', 'spear', 'fist' ].includes( m.kind ), `${d.id}: melee kind ${m.kind}` );
}
// material tags of the shared vocabulary on what the other domains may look for
for ( const [ id, tag ] of [ [ 'barbed_wire', 'wire' ], [ 'barbed_wire', 'metal' ], [ 'whetstone', 'stone' ], [ 'gun_oil', 'oil' ], [ 'steel_shot', 'metal' ], [ 'spiked_plank', 'wood' ], [ 'kevlar_sleeves', 'cloth' ] ] ) ok( getItem( id ).tags.includes( tag ), `${id} tagged ${tag}` );

// ---- loot balance ----------------------------------------------------------------------------------------------------------
console.log( 'loot' );
// the share of a table's rolls one id gets (its own entries and its part of multi-id entries)
function share( table, id ) {
	const t = compileTable( LOOT_TABLES[ table ] );
	let w = 0;
	for ( const e of t.entries ) { const i = e.ids.indexOf( id ); if ( i >= 0 ) w += e.w * e.weights[ i ] / e.total; }
	return w / t.total;
}
{
	let worst = 0, worstAt = '';
	for ( const d of ARMS ) for ( const name of Object.keys( LOOT_TABLES ) ) {
		if ( /^(car_|zombie_|gear_)/.test( name ) ) continue;
		const s = share( name, d.id );
		if ( s > worst ) { worst = s; worstAt = `${d.id} in ${name}`; }
	}
	ok( worst < 0.06, `no arms item floods a table (worst ${( worst * 100 ).toFixed( 2 )}%: ${worstAt})` );
	for ( const id of [ 'leiomano', 'pahoa', 'newa', 'koa_spear' ] ) ok( share( 'pawn', id ) < 0.01, `${id} is under 1% of pawn rolls (${( share( 'pawn', id ) * 100 ).toFixed( 2 )}%)` );
	ok( share( 'police', 'riot_shield' ) < 0.02 && share( 'gunstore', 'gun_oil' ) > share( 'gunstore', 'parts_rifle' ), 'riot shields are scarce, gun oil commoner than parts' );
	ok( share( 'bar', 'pool_cue' ) > 0.02 && share( 'farm', 'sickle' ) > 0.01 && share( 'site_military_checkpoint', 'barbed_wire' ) > 0.01, 'things are where you would look' );
}

// ---- models (the weapons module's toolkit) ----------------------------------------------------------------------------------
console.log( 'models' );
for ( const d of ARMS ) {
	let n = 0;
	try {
		const o = d.cat === 'melee' ? GM.buildMeleeView( d, 'world' ).obj : d.cat === 'attachment' ? GM.buildAttachmentView( d, 'world' ).obj : d.cat === 'throwable' ? GM.buildThrowableView( d, 'world' ) : buildItemModel( d );
		n = GM.countTris( o );
	} catch ( e ) { console.error( d.id, e ); }
	ok( n > 0 && n < 6000, `${d.id}: model builds (${n | 0} tris)` );
	ok( ! buildItemModel( d ).userData.fallback, `${d.id}: not a placeholder box` );
	if ( d.melee ) {
		const info = GM.meleeData( d ).info;
		ok( info.grip != null && info.len > 0, `${d.id}: melee grip and length` );
		if ( d.melee.twoHanded ) ok( info.grip2 != null, `${d.id}: two-handed grip` );
		if ( d.melee.kind === 'spear' ) ok( info.spear || info.len > 1.2, `${d.id}: a long spear` );
	}
}
ok( GM.meleeData( getItem( 'riot_shield' ) ).info.hold === 'shield', 'the shield has its own hold' );

// ---- the rules -------------------------------------------------------------------------------------------------------------
console.log( 'logic' );
{
	let seed = 11;
	const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	for ( const [ id, spec ] of Object.entries( L.FIRECRACKER ) ) {
		const t = L.popTimes( spec, rnd );
		ok( t.length > spec.pops * 0.6 && t.length <= spec.pops && t[ t.length - 1 ] <= spec.dur && t.every( ( x, i ) => i === 0 || x >= t[ i - 1 ] ), `${id}: ${t.length} pops in ${t[ t.length - 1 ].toFixed( 1 )} s` );
	}
	ok( L.FIRECRACKER.firecracker_roll.dur > L.FIRECRACKER.firecracker_string.dur * 2 && L.FIRECRACKER.firecracker_roll.noise > L.FIRECRACKER.firecracker_string.noise, 'the roll is longer and louder' );
	near( L.segDist( 0, 1, - 1, 0, 1, 0 ), 1, 1e-9, 'distance to the line' );
	near( L.segDist( 3, 0, - 1, 0, 1, 0 ), 2, 1e-9, 'distance past the end' );
	const pos = { x: 10, z: 5 }, yaw = 0.7;
	const [ ax, az, bx, bz ] = L.tripEnds( pos, yaw );
	near( Math.hypot( bx - ax, bz - az ), L.TRIP.len, 1e-9, 'the line is 2.6 m' );
	ok( L.crossesTrip( { x: ( ax + bx ) / 2 + 0.05, z: ( az + bz ) / 2 }, pos, yaw ) && ! L.crossesTrip( { x: pos.x + Math.sin( yaw ) * 1.5, z: pos.z + Math.cos( yaw ) * 1.5 }, pos, yaw ), 'on the line trips it, a step off does not' );
	const look = { x: 0, z: - 1 };
	ok( L.inFront( { x: 0, z: 1 }, look ) && ! L.inFront( { x: 0, z: - 1 }, look ) && ! L.inFront( { x: 1, z: 0 }, look ), 'the shield covers the front, not the back or the side' );
	ok( L.hitDamage( 40, 'head' ) > L.hitDamage( 40, 'torso' ) && L.hitDamage( 40, 'torso' ) > L.hitDamage( 40, 'leg' ) && L.hitDamage( 40, 'torso', 0.2 ) < L.hitDamage( 40, 'torso' ), 'hits: head, body, limbs; a slow one less' );
	ok( L.kitFits( 'parts_pistol', getItem( 'glock17' ) ) && ! L.kitFits( 'parts_pistol', getItem( 'm4a1' ) ) && L.kitFits( 'parts_rifle', getItem( 'mp5' ) ) && L.kitFits( 'parts_shotgun', getItem( 'double_barrel' ) ), 'parts kits by class' );
	ok( L.rollable( getItem( 'comic_book' ) ) && ! L.rollable( getItem( 'bible' ) ) && L.smallBlade( getItem( 'kitchen_knife' ) ) && ! L.smallBlade( getItem( 'machete' ) ), 'what rolls into a guard, what tapes onto a pole' );
}

// ---- rail-free fittings (src/weapons/ops.js) ----------------------------------------------------------------------------------
console.log( 'fittings' );
{
	const fit = ( g, a ) => ops.attachmentFits( getItem( g ), getItem( a ) );
	ok( fit( 'mosin', 'bayonet' ).ok && fit( 'remington_870', 'bayonet' ).ok && fit( 'm4a1', 'taped_bayonet' ).ok, 'a bayonet on a rifle or shotgun, no rail needed' );
	ok( ! fit( 'glock17', 'bayonet' ).ok && ! fit( 'mp5', 'bayonet' ).ok, 'no bayonet on a pistol or an SMG' );
	ok( fit( 'mosin', 'taped_flashlight' ).ok && fit( 'sks', 'taped_flashlight' ).ok && fit( 'glock17', 'taped_flashlight' ).ok, 'a taped light on any long gun, or a pistol with a light rail' );
	ok( ! fit( 'm1911', 'taped_flashlight' ).ok && fit( 'm1911', 'taped_flashlight' ).reason === 'No light rail', 'not on a pistol without a rail' );
	ok( fit( 'double_barrel', 'rifle_sling' ).ok && fit( 'pkm', 'stock_wrap' ).ok && ! fit( 'revolver_357', 'rifle_sling' ).ok && ! fit( 'compound_bow', 'rifle_sling' ).ok, 'slings and wraps on long guns only' );
	ok( fit( 'm4a1', 'light_rail' ).ok && ! fit( 'mosin', 'light_rail' ).ok && ! fit( 'mosin', 'supp_rifle' ).ok, 'railed attachments still need their rail' );
	const gun = makeStack( 'mosin', 1 );
	ok( ops.attMod( gun, 'recoil' ) === 1, 'a bare gun handles as it is' );
	gun.data.att = { sling: makeStack( 'rifle_sling' ), stock: makeStack( 'stock_wrap' ) };
	near( ops.attMod( gun, 'raise' ), 0.75, 1e-9, 'a sling raises it faster' );
	near( ops.attMod( gun, 'sway' ), 0.88, 1e-9, 'and steadies it' );
	near( ops.attMod( gun, 'recoil' ), 0.88, 1e-9, 'a stock wrap takes some kick' );
	gun.data.att.stock.cond = 0;
	ok( ops.attMod( gun, 'recoil' ) === 1, 'a worn-out wrap does nothing' );
	ok( getItem( 'bayonet' ).attachment.stab > 22 && getItem( 'taped_bayonet' ).attachment.stab < getItem( 'bayonet' ).attachment.stab, 'a bayonet stab beats a rifle butt, a taped knife less so' );
}

// ---- a stub game ----------------------------------------------------------------------------------------------------------
const hf = {
	heightAt: () => 2, baseHeight: () => 2, normalAt: ( x, z, out ) => out.set( 0, 1, 0 ), surfaceAt: () => [ 0.6, 0, 0, 0 ], islandAt: () => 3, flagsNear: () => 0,
	raycast: ( ox, oy, oz, dx, dy, dz, maxT ) => { const t = dy < 0 ? ( oy - 2 ) / - dy : - 1; return t >= 0 && t <= maxT ? t : - 1; },
};
const toasts = [], noises = [], spawned = [], entities = [], played = [];
// a dummy of the infected: a capsule 1.8 m tall
class Dummy {
	constructor( x, z, type = 'zombie' ) { this.type = type; this.pos = new THREE.Vector3( x, 2, z ); this.alive = true; this.radius = 0.35; this.height = 1.8; this.hits = []; this.staggered = 0; }
	damage( a, info ) { this.hits.push( { a, ...info } ); }
	stagger( dir, k ) { this.staggered += k; }
}
const entityRay = ( o, d, maxT ) => {
	let best = null;
	for ( const e of entities ) {
		if ( ! e.alive ) continue;
		// a vertical cylinder test, good enough here
		const ox = o.x - e.pos.x, oz = o.z - e.pos.z, a = d.x * d.x + d.z * d.z, b = 2 * ( ox * d.x + oz * d.z ), c = ox * ox + oz * oz - e.radius * e.radius;
		const disc = b * b - 4 * a * c;
		if ( a < 1e-9 || disc < 0 ) continue;
		const t = ( - b - Math.sqrt( disc ) ) / ( 2 * a );
		if ( t < 0 || t > maxT ) continue;
		const y = o.y + d.y * t - e.pos.y;
		if ( y < 0 || y > e.height ) continue;
		if ( ! best || t < best.t ) best = { entity: e, t, zone: y > 1.5 ? 'head' : y < 0.8 ? 'leg' : 'torso' };
	}
	return best;
};
const game = {
	mode: 'survival', difficulty: 'normal', time: { hours: 100, dayMinutes: 48 }, get hour() { return this.time.hours % 24; }, get day() { return 5; },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), stats: {}, hf, physics: new Physics( hf, null ),
	events: new Events(), audio: { play( n, o ) { played.push( n ); return null; }, loop() { return null; }, buffers: new Map() }, settings: { get: () => true },
	interact: { addProvider() { return () => {}; }, target: null, holdT: 0 },
	input: { pressed: () => false, released: () => false, is: () => false, codes: () => [], pressedQ: new Set(), down: new Set(), consumeWheel: () => 0 },
	world: { isIndoors: () => false, isBeach: () => false, meta: { cities: [] }, sky: { sunDir: new THREE.Vector3( 0, 1, 0 ), night: 0 } },
	weather: { rain: 0, state: 'clear', cover: 0.2 },
	player: { pos: new THREE.Vector3( 0, 2, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stanceH: 1.6, shake: 0, height: 1.8, inventory: new PlayerInventory(), lookDir: ( o ) => o.set( 0, 0, - 1 ) },
	entities: {
		near: ( pos, r, type, out = [] ) => { out.length = 0; for ( const e of entities ) if ( ( ! type || e.type === type ) && Math.hypot( e.pos.x - pos.x, e.pos.z - pos.z ) <= r ) out.push( e ); return out; },
		raycast: ( o, d, maxT ) => entityRay( o, d, maxT ),
	},
	items3d: { spawn: ( st, pos ) => { spawned.push( { st, pos: pos.clone() } ); return { stack: st, pos }; }, byStack: () => null, items: new Set() },
	fx: { light() {}, lightNow() {}, sparks() {}, blood() {}, impact() {}, decal() {}, splash() {}, add: { emit() {} }, alpha: { emit() {} } },
	toast: ( t ) => toasts.push( t ), dropStack: ( s ) => spawned.push( { st: s } ), inputActive: true, dead: false,
	app: { ui: { inventory: { other: null } } }, vehicles: { list: [], driving: null },
	register() {},
	onPlayerDeath() {},
};
game.camera.position.set( 0, 3.6, 0 );
game.events.on( 'noise', ( e ) => noises.push( e ) );
game.survival = new Survival( game );
game.skills = game.survival.skills || game.skills;
game.actions = new Actions( game );
game.itemLights = { add: ( s ) => s, remove: () => {} };
game.itemUse = new ItemUse( game, null );
game.crafting = new Crafting( game, null );
game.combine = new Combine( game );
const M = game.placeables = new Placeables( game );
const TH = game.throwables = new Throwables( game );
const U = game.itemUse, K = game.combine, inv = game.player.inventory, S = game.survival;
inv.equip.back = makeStack( 'backpack_military', 1 );
inv.equip.legs = makeStack( 'cargo_pants', 1 );
const finish = () => { for ( let i = 0; i < 4 && game.actions.busy; i ++ ) game.actions.update( 999 ); };
const put = ( id, q = 1, o = {} ) => { const st = makeStack( id, q, o ); inv.add( st, { autoEquip: false } ); return st; };
const has = ( id ) => inv.count( id );
const find = ( id ) => inv.find( ( s ) => s.id === id );
const verb = ( st, v ) => U.actions( st ).find( a => a.verb === v || a.verb.startsWith( v ) );
const run = ( st, v ) => { const a = verb( st, v ); if ( ! a ) return false; a.run(); finish(); return true; };
const combo = ( id, a, b ) => { const r = K.run( C.getCombo( id ), a, b ); finish(); return r; };
const clearInv = () => { for ( const s of [ ...inv.allStacks() ] ) if ( s !== inv.equip.back && s !== inv.equip.legs ) inv.remove( s ); inv.hands = null; };
const rand = Math.random;
const fixRandom = ( v ) => { Math.random = () => v; };
const realRandom = () => { Math.random = rand; };
// step the thrown things for a while
const fly = ( secs, dt = 1 / 60 ) => { for ( let t = 0; t < secs; t += dt ) TH.update( dt ); };

// ---- making weapons ----------------------------------------------------------------------------------------------------------
console.log( 'combos: weapons' );
{
	put( 'hammer' );
	const nails = put( 'nails', 20 ), planks = put( 'planks', 2 );
	noises.length = 0;
	ok( combo( 'arms_spiked_plank', nails, planks ) && has( 'spiked_plank' ) === 1 && nails.qty === 12 && planks.qty === 1, 'eight nails through a plank: a spiked plank' );
	ok( noises.some( n => n.radius === 25 ), 'hammering is heard' );
	clearInv();

	const bat = put( 'baseball_bat' ); bat.cond = 0.7;
	const bw = put( 'barbed_wire' );
	const h0 = S.health;
	ok( combo( 'arms_barbed_bat', bw, bat ) && has( 'barbed_bat' ) && ! has( 'baseball_bat' ) && Math.abs( find( 'barbed_bat' ).cond - 0.7 ) < 1e-9, 'barbed wire round a bat (it keeps its wear)' );
	ok( S.health < h0 && toasts.includes( 'Cut your hands' ), 'bare hands get cut' );
	inv.equip.hands = makeStack( 'work_gloves' );
	const h1 = S.health;
	combo( 'arms_barbed_bat', put( 'barbed_wire' ), put( 'baseball_bat' ) );
	ok( S.health === h1, 'gloves save them' );
	inv.equip.hands = null;
	clearInv();

	const mach = put( 'machete' ); mach.cond = 0.6;
	const pole = put( 'long_stick' );
	toasts.length = 0;
	ok( ! K.run( C.getCombo( 'arms_machete_spear' ), mach, pole ) && toasts.includes( 'Need duct tape' ), 'a machete spear needs tape' );
	const tape = put( 'duct_tape' );
	ok( combo( 'arms_machete_spear', mach, pole ) && has( 'machete_spear' ) && ! has( 'machete' ) && tape.data.uses === 4, 'a machete taped to a pole, one turn of tape' );
	const ms = find( 'machete_spear' );
	ok( Math.abs( ms.cond - 0.6 ) < 1e-9, 'it keeps the machete\'s wear' );
	ok( run( ms, 'Take apart' ) && has( 'machete' ) && has( 'long_stick' ) && ! has( 'machete_spear' ) && Math.abs( find( 'machete' ).cond - 0.6 ) < 1e-9, 'taken apart: the machete and the pole back' );
	const hk = put( 'hunting_knife' );
	ok( combo( 'arms_knife_spear', hk, find( 'long_stick' ) ) && find( 'knife_spear' )?.data.knife === 'hunting_knife', 'any small knife makes a knife spear (it remembers which)' );
	run( find( 'knife_spear' ), 'Take apart' );
	ok( has( 'hunting_knife' ) && ! has( 'knife_spear' ), 'and the hunting knife comes back' );
	clearInv();

	// a shiv and a sharpened shovel: in place (the same uid), quicker on a whetstone than a stone
	const sd = put( 'screwdriver' ), stone = put( 'stone' );
	const cs = C.getCombo( 'arms_shiv' );
	const tStone = K.timeOf( cs, stone, sd );
	const ws = put( 'whetstone' );
	ok( K.timeOf( cs, ws, sd ) < tStone, 'a whetstone works faster than a river stone' );
	const uid = sd.uid;
	ok( combo( 'arms_shiv', ws, sd ) && find( 'screwdriver_shiv' )?.uid === uid && ! has( 'screwdriver' ), 'a screwdriver ground to a shiv where it lay' );
	ok( getItem( 'screwdriver_shiv' ).melee.tools.includes( 'screwdriver' ) && inv.hasTool( 'screwdriver' ), 'the shiv still drives screws' );
	const sh = put( 'shovel' );
	ok( combo( 'arms_sharpen_shovel', stone, sh ) && has( 'sharpened_shovel' ) && inv.hasTool( 'chop' ) && inv.hasTool( 'dig' ), 'a sharpened shovel chops and digs' );
	clearInv();

	// the crafting panel
	put( 'hammer' ); put( 'planks' ); put( 'nails', 8 );
	const r = game.crafting.recipes.find( x => x.id === 'arms_spiked_plank' );
	ok( r && game.crafting.canCraft( r ), 'the spiked plank recipe' );
	game.crafting.craft( r ); finish();
	ok( has( 'spiked_plank' ) && ! has( 'planks' ), 'crafted' );
	clearInv();
	for ( const id of [ 'empty_can', 'empty_can', 'empty_can', 'empty_can' ] ) put( id );
	put( 'wire' );
	const r2 = game.crafting.recipes.find( x => x.id === 'arms_can_tripwire' );
	ok( r2 && game.crafting.canCraft( r2 ), 'four cans and a wire: a tripwire' );
	clearInv();
}

// ---- edges and guns -----------------------------------------------------------------------------------------------------------
console.log( 'combos: gun care' );
{
	const ws = put( 'whetstone' ), mach = put( 'machete' ); mach.cond = 0.4;
	ok( combo( 'arms_whet_blade', ws, mach ) && mach.cond > 0.6 && ws.cond < 1, 'a whetstone puts an edge back (and wears a little)' );
	const bay = put( 'bayonet' ); bay.cond = 0.5;
	ok( combo( 'arms_whet_blade', ws, bay ) && bay.cond > 0.6, 'a bayonet sharpens too' );
	ok( K.accepts( ws, put( 'baseball_bat' ) ) === null, 'a bat is not offered' );

	const gun = put( 'akm' ); gun.cond = 0.5; gun.data.jam = true;
	const oil = put( 'gun_oil' );
	toasts.length = 0;
	ok( combo( 'arms_oil_gun', oil, gun ) && gun.cond > 0.55 && ! gun.data.jam && oil.data.uses === 5 && toasts.includes( 'Jam cleared' ), 'gun oil: a little better, the jam cleared, a dose used' );
	const rod = put( 'cleaning_rod' );
	take( oil );
	toasts.length = 0;
	ok( ! K.run( C.getCombo( 'arms_clean_bore' ), rod, gun ) && toasts.includes( 'Need gun oil' ), 'the cleaning rod wants oil' );
	const oil2 = put( 'gun_oil' );
	const c0 = gun.cond;
	ok( combo( 'arms_clean_bore', rod, gun ) && gun.cond > c0 + 0.25 && oil2.data.uses === 5, 'rod and oil: a proper clean' );
	gun.cond = L.CARE.bore.max;
	ok( K.state( C.getCombo( 'arms_clean_bore' ), rod, gun ).soft, 'a clean gun is not offered again' );
	// parts kits by class, with a screwdriver
	const glock = put( 'glock17' ); glock.cond = 0.3;
	const kit = put( 'parts_pistol' );
	ok( K.accepts( kit, gun ) === null, 'a pistol kit is not for a rifle' );
	toasts.length = 0;
	ok( ! K.run( C.getCombo( 'arms_kit_pistol' ), kit, glock ) && toasts.includes( 'Need a screwdriver' ), 'a kit needs a screwdriver' );
	put( 'screwdriver' );
	ok( combo( 'arms_kit_pistol', kit, glock ) && glock.cond > 0.7 && ! has( 'parts_pistol' ), 'a pistol rebuilt from its kit' );
	const sg = put( 'remington_870' ); sg.cond = 0.2;
	ok( combo( 'arms_kit_shotgun', put( 'parts_shotgun' ), sg ) && sg.cond > 0.6, 'a shotgun kit' );
	clearInv();
}

// ---- taped onto a gun --------------------------------------------------------------------------------------------------------
console.log( 'combos: taped on' );
{
	const mosin = put( 'mosin' ), fl = put( 'flashlight' ); fl.data.charge = 4;
	const tape = put( 'duct_tape' );
	ok( K.accepts( fl, mosin )?.ok, 'a flashlight drags onto a rifle without a rail' );
	ok( combo( 'arms_tape_light', fl, mosin ) && mosin.data.att.light?.id === 'taped_flashlight' && ! has( 'flashlight' ) && tape.data.uses === 4, 'taped on: the gun has a light' );
	near( mosin.data.att.light.data.charge, 4, 1e-9, 'with the flashlight\'s charge' );
	ok( K.accepts( put( 'flashlight' ), mosin ) === null, 'one light per gun' );
	ok( K.accepts( find( 'flashlight' ), put( 'm1911' ) )?.ok !== true, 'not on a pistol without a rail' );
	// detached it is an item that untapes back into the flashlight
	const tl = mosin.data.att.light;
	delete mosin.data.att.light;
	inv.add( tl, { autoEquip: false } );
	ok( run( tl, 'Untape' ) && inv.findAll( ( s ) => s.id === 'flashlight' ).some( ( s ) => Math.abs( s.data.charge - 4 ) < 1e-9 ) && ! has( 'taped_flashlight' ), 'untaped: the flashlight back with its charge' );
	const kn = put( 'kitchen_knife' ); kn.cond = 0.8;
	ok( combo( 'arms_tape_bayonet', kn, mosin ) && mosin.data.att.bayonet?.id === 'taped_bayonet' && Math.abs( mosin.data.att.bayonet.cond - 0.8 ) < 1e-9, 'a kitchen knife taped under the barrel' );
	const tb = mosin.data.att.bayonet;
	delete mosin.data.att.bayonet;
	inv.add( tb, { autoEquip: false } );
	run( tb, 'Untape' );
	ok( has( 'kitchen_knife' ) && ! has( 'taped_bayonet' ), 'untaped: the knife back' );
	clearInv();
}

// ---- armour --------------------------------------------------------------------------------------------------------------------
console.log( 'combos: armour' );
{
	const comic = put( 'comic_book' ), tape = put( 'duct_tape' );
	ok( combo( 'arms_mag_guards', comic, tape ) && has( 'magazine_guards' ) && ! has( 'comic_book' ) && tape.data.uses === 3, 'a comic rolled and taped: arm guards' );
	const np = put( 'newspaper', 3 );
	ok( combo( 'arms_paper_guards', np, tape ) && has( 'magazine_guards' ) === 2 && ! has( 'newspaper' ), 'or three newspapers' );
	const tee = put( 'tshirt' );
	const g = find( 'magazine_guards' );
	ok( combo( 'arms_tape_guards', g, tee ) && near0( tee.data.mods.bite, L.GUARDS.magazine_guards ) && tee.data.guards?.id === 'magazine_guards', 'guards taped onto a t-shirt: bite protection' );
	ok( K.accepts( find( 'magazine_guards' ), tee ) === null, 'one pair per top' );
	// worn, they take the edge off a bite
	inv.equip.torso = tee; inv.remove( tee ); inv.equip.torso = tee;
	S.health = 100;
	fixRandom( 0.99 );
	S.hurt( 20, 'bite', { dir: new THREE.Vector3( 0, 0, 1 ) } );
	realRandom();
	ok( S.health > 100 - 20 * S.diff.dmgIn * 0.9, `a bite through the guards hurts less (${( 100 - S.health ).toFixed( 1 )})` );
	run( tee, 'Take off arm guards' );
	ok( ! tee.data.guards && ! tee.data.mods.bite && has( 'magazine_guards' ) === 2, 'they come off again' );
	const hood = put( 'hoodie' );
	ok( combo( 'arms_pull_sleeves', put( 'kevlar_sleeves' ), hood ) && near0( hood.data.mods.bite, L.GUARDS.kevlar_sleeves ), 'kevlar sleeves pulled over a hoodie' );
	inv.equip.torso = null;
	ok( getItem( 'welder_mask' ).clothing.shade > 0.5 && getItem( 'chainmail_glove' ).clothing.armor.bite > getItem( 'work_gloves' ).clothing.armor.bite, 'the welder\'s mask shades, the mail glove beats work gloves' );
	clearInv();
}
function near0( a, b ) { return Math.abs( a - b ) < 1e-9; }
function take( ...ss ) { for ( const s of ss ) inv.remove( s ); }

// ---- verbs ---------------------------------------------------------------------------------------------------------------------
console.log( 'verbs' );
{
	// the slingshot: from the bag it goes to the hands; held, it shoots steel first, then stones
	const sl = put( 'slingshot' );
	ok( verb( sl, 'Hold' ) && ! verb( sl, 'Shoot' ), 'in the bag: Hold' );
	inv.hands = sl.uid;
	toasts.length = 0;
	ok( verb( sl, 'Shoot' )?.note === 'No shot', 'held, with nothing to shoot: ' + verb( sl, 'Shoot' )?.note );
	verb( sl, 'Shoot' ).run();
	ok( toasts.includes( 'No shot' ), 'it says so' );
	put( 'steel_shot', 3 ); put( 'stone', 2 );
	ok( U.actions( sl )[ 0 ].verb === 'Shoot' && verb( sl, 'Shoot' ).note === '5', 'the fire button shoots (5 to shoot)' );
	const st = RT.state( game ) || RT.attach( game );
	st.lastShot = - 1e9;
	noises.length = 0;
	const n0 = TH.list.length;
	verb( sl, 'Shoot' ).run();
	ok( TH.list.length === n0 + 1 && TH.list[ TH.list.length - 1 ].kind === 'arms_shot' && has( 'steel_shot' ) === 2, 'a steel ball leaves the slingshot' );
	ok( noises.some( n => n.kind === 'sling' && n.radius <= 8 ), 'quietly' );
	verb( sl, 'Shoot' ).run();
	ok( has( 'steel_shot' ) === 2, 'not twice in the same instant' );
	for ( let i = 0; i < 3; i ++ ) { st.lastShot = - 1e9; verb( sl, 'Shoot' ).run(); }
	ok( ! has( 'steel_shot' ) && has( 'stone' ) === 1, 'steel shot first, then stones' );
	TH.list.length = 0;
	inv.hands = null;
	clearInv();

	// horns
	const ah = put( 'air_horn' );
	noises.length = 0;
	ok( U.actions( ah )[ 0 ].verb === 'Blast' && run( ah, 'Blast' ) && noises.some( n => n.radius === L.HORN.air_horn.radius ) && ah.data.uses === 11, 'the air horn: a blast heard far off' );
	const ph = put( 'party_horn' );
	S.boredom = 50;
	noises.length = 0;
	run( ph, 'Blow' );
	ok( noises.some( n => n.radius === L.HORN.party_horn.radius ) && S.boredom < 50, 'a party horn: a squawk and a smile' );
	clearInv();

	// an alarm clock thrown: it lands, then rings where it lies (the placeables' noise kind)
	const clock = put( 'alarm_clock' );
	game.camera.position.set( 0, 3.6, 0 ); game.camera.quaternion.identity(); game.camera.updateMatrixWorld();
	ok( run( clock, 'Set and throw' ) && ! has( 'alarm_clock' ) && TH.list.length === 1 && TH.list[ 0 ].kind === 'arms_item', 'Set and throw' );
	fly( 4 );
	const placed = [ ...M.list.values() ].find( p => p.kind === 'noise' && p.item === 'alarm_clock' );
	ok( placed && placed.pos.z < - 3 && placed.data.left > 0, `it lands ${placed ? Math.abs( placed.pos.z ).toFixed( 1 ) : '?'} m off, set to ring` );
	noises.length = 0;
	if ( placed ) for ( let i = 0; i < 40; i ++ ) R.getPlaceable( 'noise' ).update( placed, 0.25, game, 0 );
	ok( noises.some( n => n.kind === 'alarm' ), 'and rings there, drawing them' );
	if ( placed ) M.remove( placed, { give: false } );
	TH.list.length = 0;
	const radio = put( 'radio' ); radio.data.charge = 0;
	ok( ! verb( radio, 'Turn on and throw' ), 'a dead radio is not thrown' );
	radio.data.charge = 10;
	ok( run( radio, 'Turn on and throw' ) && TH.list[ 0 ]?.place?.on === true, 'a live one is thrown playing' );
	TH.list.length = 0;
	clearInv();
}

// ---- thrown kinds (the weapons module's Throwables, the arms kinds) ---------------------------------------------------------------------
console.log( 'throwables' );
const launch = ( id, vel, at = new THREE.Vector3( 0, 3.5, 0 ) ) => TH.launch( getItem( id ), { origin: at.clone(), vel: vel.clone(), source: game.player } );
{
	// firecrackers: without a lighter, a dud you can pick up again
	toasts.length = 0; spawned.length = 0;
	const dud = launch( 'firecracker_string', new THREE.Vector3( 0, 2, - 6 ) );
	ok( dud.dud && toasts.includes( 'No lighter' ), 'nothing to light it with: a dud' );
	fly( 4 );
	ok( spawned.some( s => s.st.id === 'firecracker_string' ), 'it lies where it landed, to pick up' );
	// lit: a fuse, then pops for seconds, a pulse of noise every half second that draws the infected
	put( 'lighter' );
	noises.length = 0; played.length = 0;
	const fc = launch( 'firecracker_string', new THREE.Vector3( 0, 2, - 8 ) );
	ok( fc.armed && ! fc.dud, 'lit from the lighter you carry' );
	fly( 1.4 );
	ok( ! noises.some( n => n.kind === 'firecracker' ), 'quiet while the fuse burns' );
	fly( 9 );
	const pulses = noises.filter( n => n.kind === 'firecracker' );
	const spec = L.FIRECRACKER.firecracker_string;
	ok( pulses.length >= spec.dur / spec.every * 0.6 && pulses.every( n => n.radius === spec.noise ), `${pulses.length} pulses of noise, radius ${spec.noise}` );
	ok( pulses.every( n => n.pos.z < - 3 ), 'where it landed, away from you' );
	ok( played.filter( n => n === 'arms_pop' ).length > spec.pops * 0.5, 'and the pops are heard' );
	ok( ! TH.list.includes( fc ), 'then it is gone' );
	// a zombie stub reacts to the 'noise' event as the creatures module does
	const z = new Dummy( 5, - 30 );
	let heard = null;
	const off = game.events.on( 'noise', ( e ) => { if ( e.kind === 'firecracker' && z.pos.distanceTo( e.pos ) < e.radius ) heard = e.pos.clone(); } );
	launch( 'firecracker_roll', new THREE.Vector3( 0, 2, - 10 ) );
	fly( 6 );
	ok( heard && heard.distanceTo( z.pos ) < L.FIRECRACKER.firecracker_roll.noise, 'a roll is heard 30 m off and draws them to it' );
	off?.();
	TH.list.length = 0;
	clearInv();

	// a throwing knife: the head shot drops them, it lands at their feet to be picked up
	entities.length = 0; spawned.length = 0;
	const zz = new Dummy( 0, - 8 );
	entities.push( zz );
	launch( 'throwing_knife', new THREE.Vector3( 0, 0.5, - 21 ), new THREE.Vector3( 0, 4.2, 0 ) );
	fly( 1.5 );
	ok( zz.hits.length === 1 && zz.hits[ 0 ].kind === 'arrow' && zz.hits[ 0 ].weapon === 'throwing_knife', 'a thrown knife hits' );
	ok( zz.hits[ 0 ]?.zone === 'head' && zz.hits[ 0 ].a >= 45, `in the head it is a kill (${zz.hits[ 0 ]?.a.toFixed( 0 )})` );
	ok( spawned.some( s => s.st.id === 'throwing_knife' && Math.hypot( s.pos.x - zz.pos.x, s.pos.z - zz.pos.z ) < 0.6 ), 'and drops at their feet' );
	spawned.length = 0;
	entities.length = 0;
	launch( 'throwing_knife', new THREE.Vector3( 0, 1, - 12 ) );
	fly( 4 );
	ok( spawned.some( s => s.st.id === 'throwing_knife' ), 'a miss lies where it lands' );
	// slingshot shot through the runtime: a hit to the body, the ball often found again
	entities.push( zz ); zz.hits.length = 0;
	const sl = put( 'slingshot' ); put( 'steel_shot', 5 );
	inv.hands = sl.uid;
	( RT.state( game ) || RT.attach( game ) ).lastShot = - 1e9;
	game.camera.position.set( 0, 3.0, 0 );
	fixRandom( 0.1 );
	spawned.length = 0;
	RT.shoot( game, sl );
	fly( 1.5 );
	realRandom();
	ok( zz.hits.length === 1 && zz.hits[ 0 ].weapon === 'slingshot' && zz.hits[ 0 ].a > 10 && zz.hits[ 0 ].a < 60, `steel shot hits (${zz.hits[ 0 ]?.a.toFixed( 0 )})` );
	ok( spawned.some( s => s.st.id === 'steel_shot' ), 'and is found again' );
	inv.hands = null;
	entities.length = 0;
	// a road flare thrown with the throw key lights where it lands (ItemUse's flares)
	const n0 = U.flares.length;
	launch( 'road_flare', new THREE.Vector3( 0, 2, - 6 ) );
	ok( U.flares.length === n0 + 1 && U.flares[ U.flares.length - 1 ].flying, 'a quick-thrown road flare burns' );
	TH.list.length = 0;
	clearInv();
}

// ---- the can tripwire ----------------------------------------------------------------------------------------------------------
console.log( 'tripwire' );
{
	const K2 = R.getPlaceable( 'arms_tripwire' );
	ok( K2 && R.placeOf( getItem( 'can_tripwire' ) )?.kind === 'arms_tripwire', 'a placeable kind' );
	const st = makeStack( 'can_tripwire' );
	game.player.pos.set( 20, 2, 20 );
	const p = M.add( 'arms_tripwire', st, new THREE.Vector3( 20, 2, 20 ), 0 );
	ok( p.data.set && p._safe, 'set, and whoever strung it can step out' );
	ok( M.buildModel( p ).children.length > 4, 'stakes, wire and cans' );
	K2.frame( p, 0.016, game );
	ok( p.data.set, 'standing in it as you string it does not trip it' );
	game.player.pos.set( 40, 2, 40 );
	K2.frame( p, 0.016, game );
	ok( ! p._safe, 'once clear it is armed' );
	entities.length = 0;
	const z = new Dummy( 20.4, 23 );
	entities.push( z );
	noises.length = 0; toasts.length = 0;
	K2.frame( p, 0.016, game );
	ok( p.data.set, 'not yet' );
	z.pos.set( 20.4, 2, 20.05 );
	game.player.pos.set( 20, 2, 60 );
	K2.frame( p, 0.016, game );
	ok( ! p.data.set && noises.some( n => n.kind === 'tripwire' && n.radius === L.TRIP.noise ), 'one of the infected walks into it: the cans rattle' );
	ok( toasts.includes( 'Cans rattled' ), 'you hear it 40 m off' );
	ok( M.buildModel( p ).children.length > 4, 'the cans lie where they fell' );
	const reset = M.actionsOf ? M.actionsOf( p ).find( a => a.label === 'Reset' ) : K2.actions( p, game ).find( a => a.label === 'Reset' );
	reset.run(); finish();
	ok( p.data.set, 'reset' );
	// a save keeps it
	const q = R.loadRecord( JSON.parse( JSON.stringify( R.serializeRecord( p ) ) ) );
	ok( q.data.set === true && q.data.horn === false, 'save round trip' );
	M.remove( p, { give: false } );
	// rigged with an air horn
	const kit = put( 'can_tripwire' ), ah = put( 'air_horn' );
	ok( combo( 'arms_horn_tripwire', ah, kit ) && kit.data.horn && kit.data.name === 'Horn tripwire' && ! has( 'air_horn' ), 'an air horn rigged to it' );
	const p2 = M.add( 'arms_tripwire', kit, new THREE.Vector3( 0, 2, 50 ), 0 );
	noises.length = 0;
	trip( p2, game, z );
	ok( p2.data.horn && noises.some( n => n.radius === L.TRIP.hornNoise ), 'it blasts the horn: heard far off' );
	M.remove( p2, { give: false } );
	entities.length = 0;
	game.player.pos.set( 0, 2, 0 );
	clearInv();
}

// ---- the riot shield -----------------------------------------------------------------------------------------------------------
console.log( 'riot shield' );
{
	RT.attach( game );
	const sh = put( 'riot_shield' );
	S.health = 100; S.stamina = 100;
	const front = { dir: new THREE.Vector3( 0, 0, 1 ), source: new Dummy( 0, - 1 ) }; // from in front: the attacker at -z, you look at -z
	fixRandom( 0.99 );
	S.hurt( 15, 'bite', front );
	ok( S.health < 100, 'without it in the hands a bite lands' );
	S.health = 100;
	inv.hands = sh.uid;
	const st0 = S.stamina, c0 = sh.cond;
	S.hurt( 15, 'bite', front );
	ok( S.health === 100 && S.stamina < st0 && sh.cond < c0 && front.source.staggered > 0, 'held, a bite from the front hits the shield (stamina, wear, the attacker pushed off)' );
	S.hurt( 15, 'scratch', { dir: new THREE.Vector3( 0, 0, - 1 ) } );
	ok( S.health < 100, 'from behind it still lands' );
	S.health = 100; S.stamina = 2;
	S.hurt( 15, 'bite', front );
	ok( S.health < 100, 'too tired to hold it up: it lands' );
	S.stamina = 100; S.health = 100;
	S.hurt( 15, 'fall', front );
	ok( S.health < 100, 'it does nothing for a fall' );
	realRandom();
	ok( S.moveModifiers().speed < 1, 'it is heavy to carry about' );
	inv.hands = null;
	ok( S.moveModifiers().speed === 1, 'put away, you move freely' );
	ok( getItem( 'riot_shield' ).melee.push && getItem( 'riot_shield' ).melee.stagger > 1, 'it shoves hard' );
	// through Survival's hooks, not wrappers: attached once however often it is asked
	RT.attach( game );
	ok( S.hurt === Survival.prototype.hurt && S.moveModifiers === Survival.prototype.moveModifiers && S.hurtGuards.length === 1, 'the block and the weight are Survival hooks (addHurtGuard, addMoveMod)' );
	clearInv();
}

// ---- sounds ----------------------------------------------------------------------------------------------------------------------
console.log( 'sounds' );
for ( const n of ARMS_SOUNDS ) {
	const a = renderArmsSound( n, 8000 );
	ok( a && a.length > 100 && a.every( Number.isFinite ) && Math.max( ...a.map( Math.abs ) ) > 0.1, `${n} renders` );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
