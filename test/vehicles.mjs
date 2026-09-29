// Vehicle module tests (Node, no browser): model builds, dynamics of every kind on a synthetic test ground
// and on the real islands, damage, containers and save records.
//   node test/vehicles.mjs [--verbose]
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { Physics } from '../src/game/Physics.js';
import { Events } from '../src/core/Events.js';
import { HeightField } from '../src/world/HeightField.js';

// the models draw a decal atlas on a canvas: a do-nothing 2D context is enough here
const noop = () => {};
const ctx2d = new Proxy( {}, { get: ( t, k ) => k in t ? t[ k ] : ( k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ( { addColorStop: noop } ) : k === 'measureText' ? () => ( { width: 10 } ) : noop ), set: ( t, k, v ) => { t[ k ] = v; return true; } } );
globalThis.document = { createElement: () => ( { width: 0, height: 0, getContext: () => ctx2d, style: {} } ) };

const { Vehicle } = await import( '../src/vehicles/Vehicle.js' );
const { SPECS, TYPES } = await import( '../src/vehicles/specs.js' );
const { getModel, modelNames } = await import( '../src/vehicles/models/index.js' );

const VERBOSE = process.argv.includes( '--verbose' );
let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) { passes ++; if ( VERBOSE ) console.log( '  ✓ ' + msg ); } else { fails ++; console.error( '  ✗ ' + msg ); } };
const log = ( ...a ) => { if ( VERBOSE ) console.log( '   ', ...a ); };

// ---- a flat test ground: asphalt at y = 0.5 for x < 400, sand beyond, the sea (floor -6) for z > 300 ----------------
const flatHF = {
	heightAt: ( x, z ) => z > 300 ? - 6 : z > 280 ? 0.5 - ( z - 280 ) * 0.3 : 0.5,
	baseHeight( x, z ) { return this.heightAt( x, z ); },
	normalAt: ( x, z, out ) => out.set( 0, 1, 0 ),
	flagsNear: ( x ) => x < 400 ? 1 : 0,
	surfaceAt: ( x, z, o ) => { o[ 0 ] = 0.3; o[ 1 ] = 0; o[ 2 ] = 0; o[ 3 ] = 0; return o; },
	raycast: ( ox, oy, oz, dx, dy, dz, maxT ) => { if ( dy >= 0 ) return - 1; const t = ( oy - 0.5 ) / - dy; return t <= maxT ? t : - 1; },
	islandAt: () => 3,
};
const calmSea = { heightAt: () => 0, seaState: 0 };

function makeGame( hf = flatHF, ocean = calmSea ) {
	const game = {
		hf, events: new Events(), weather: { rain: 0 }, mode: 'survival', time: { hours: 12 },
		world: { isBeach: ( x ) => x >= 400, meta: { cities: [], buildings: { data: [] } } },
		scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
		audio: null, fx: null, entities: { near: () => [], list: [] },
		player: { pos: new THREE.Vector3(), shake: 0, inventory: { find: () => null } },
		survival: { hurt: ( n, kind ) => { game.hurt = ( game.hurt || 0 ) + n; } },
	};
	game.physics = new Physics( hf, ocean );
	return game;
}

// drive a vehicle for `sec` seconds at 60 fps with an input (or a function of the vehicle returning one)
function run( v, sec, inp, each ) {
	const dt = 1 / 60;
	for ( let i = 0; i < sec * 60; i ++ ) { v.simulate( dt, typeof inp === 'function' ? inp( v ) : inp ); if ( each ) each( v, i * dt ); }
	return v;
}
const IN = ( o = {} ) => Object.assign( { forward: false, back: false, left: false, right: false, steer: 0, hand: false, up: false, down: false, rollL: false, rollR: false }, o );
const speedKmh = ( v ) => v.body.v.length() * 3.6;
const upY = ( v ) => new THREE.Vector3( 0, 1, 0 ).applyQuaternion( v.body.q ).y;

// ---- models ------------------------------------------------------------------------------------------------------
console.log( 'models' );
for ( const n of modelNames() ) {
	const m = getModel( n );
	const tri = m.near.attributes.position.count / 3;
	ok( tri > 1000 && tri < 120000, `${n}: ${Math.round( tri )} triangles near` );
	ok( m.far.attributes.position.count / 3 < tri, `${n}: far model is lighter` );
	for ( const g of [ m.near, m.far, m.glass, m.wheelGeo, m.steering ] ) if ( g ) {
		const a = g.attributes.position.array;
		let bad = 0;
		for ( let i = 0; i < a.length; i ++ ) if ( ! Number.isFinite( a[ i ] ) ) bad ++;
		if ( bad ) ok( false, `${n}: ${bad} NaN positions` );
	}
}
for ( const t of TYPES ) ok( !! getModel( SPECS[ t ].model ), `spec ${t} has a model` );

// ---- cars on the flat ground ---------------------------------------------------------------------------------------
console.log( 'cars' );
for ( const type of TYPES.filter( t => SPECS[ t ].kind === 'car' ) ) {
	const game = makeGame();
	const v = new Vehicle( game, type, { pos: new THREE.Vector3( 0, 0.5, 0 ), yaw: 0, fuel: 50 } );
	v.settle();
	v.driver = game.player;
	v.engine.running = true;
	v.wake();
	// settle on the springs
	run( v, 2, IN() );
	const rest = v.pos.y;
	ok( Math.abs( rest - 0.5 ) < 0.12, `${type}: rests on its wheels (origin y ${rest.toFixed( 3 )})` );
	ok( v.wheels.every( w => w.grounded ), `${type}: all wheels grounded at rest` );
	ok( v.body.v.length() < 0.05, `${type}: still at rest (${v.body.v.length().toFixed( 3 )} m/s)` );
	// 0-100 km/h
	let t100 = null;
	run( v, 30, IN( { forward: true } ), ( vv, t ) => { if ( t100 === null && speedKmh( vv ) >= 100 ) t100 = t; } );
	const top = speedKmh( v );
	log( `${type}: 0-100 ${t100?.toFixed( 1 )} s, speed after 30 s ${top.toFixed( 0 )} km/h, gear ${v.engine.gear}, rpm ${v.engine.rpm.toFixed( 0 )}` );
	if ( type === 'bus' || type === 'humvee' ) ok( top > 60, `${type}: reaches ${top.toFixed( 0 )} km/h` );
	else ok( t100 !== null && t100 < 16, `${type}: 0-100 km/h in ${t100?.toFixed( 1 )} s` );
	ok( top < 330, `${type}: top speed sane (${top.toFixed( 0 )})` );
	ok( Math.abs( v.pos.x ) < 3, `${type}: drives straight (x drift ${v.pos.x.toFixed( 2 )})` );
	ok( upY( v ) > 0.98, `${type}: stays level` );
	// brake to a stop
	const v0 = v.body.v.length();
	let stopT = null;
	run( v, 15, IN( { back: true } ), ( vv, t ) => { if ( stopT === null && vv.fwdSpeed < 0.5 ) stopT = t; } );
	const decel = v0 / ( stopT ?? 99 );
	log( `${type}: braking from ${( v0 * 3.6 ).toFixed( 0 )} km/h in ${stopT?.toFixed( 1 )} s (${( decel / 9.81 ).toFixed( 2 )} g)` );
	ok( stopT !== null && decel > 4, `${type}: brakes (${( decel / 9.81 ).toFixed( 2 )} g)` );
	// ... then reverses
	run( v, 3, IN( { back: true } ) );
	ok( v.engine.gear === - 1 && v.fwdSpeed < - 1, `${type}: reverses (gear ${v.engine.gear}, ${v.fwdSpeed.toFixed( 1 )} m/s)` );
	run( v, 4, IN() );
	// a turn at 40 km/h: steady circle, no rollover
	run( v, 3, IN( { forward: true } ) );
	let minUp = 1;
	run( v, 6, ( vv ) => IN( { forward: vv.fwdSpeed < 11, right: true, steer: - 1 } ), ( vv ) => { minUp = Math.min( minUp, upY( vv ) ); } );
	ok( minUp > 0.85, `${type}: corners without rolling (min up ${minUp.toFixed( 2 )})` );
	ok( v.body.w.y < - 0.1, `${type}: turns right (yaw rate ${v.body.w.y.toFixed( 2 )})` );
}

// ---- motorcycle ------------------------------------------------------------------------------------------------------
console.log( 'motorcycle' );
{
	const game = makeGame();
	const v = new Vehicle( game, 'motorbike', { pos: new THREE.Vector3( 0, 0.5, 0 ), yaw: 0, fuel: 10 } );
	v.settle();
	v.driver = game.player; v.engine.running = true; v.wake();
	run( v, 2, IN() );
	ok( upY( v ) > 0.99 && v.wheels.every( w => w.grounded ), `stands upright with the rider (up ${upY( v ).toFixed( 3 )})` );
	let t100 = null;
	run( v, 20, IN( { forward: true } ), ( vv, t ) => { if ( t100 === null && speedKmh( vv ) >= 100 ) t100 = t; } );
	log( `motorbike: 0-100 ${t100?.toFixed( 1 )} s, ${speedKmh( v ).toFixed( 0 )} km/h after 20 s` );
	ok( t100 !== null && t100 < 7, `0-100 km/h in ${t100?.toFixed( 1 )} s` );
	ok( speedKmh( v ) < 240 && Math.abs( v.pos.x ) < 2, `top speed ${speedKmh( v ).toFixed( 0 )} km/h, straight` );
	run( v, 10, IN( { back: true } ) );
	run( v, 4, ( vv ) => IN( { forward: vv.fwdSpeed < 12 } ) );
	let lean = 0, minUp = 1;
	run( v, 5, ( vv ) => IN( { forward: vv.fwdSpeed < 12, left: true, steer: 1 } ), ( vv ) => { lean = Math.max( lean, vv.lean ); minUp = Math.min( minUp, upY( vv ) ); } );
	ok( v.body.w.y > 0.2 && lean > 0.25, `leans into a left turn (lean ${lean.toFixed( 2 )}, yaw ${v.body.w.y.toFixed( 2 )})` );
	ok( minUp > 0.95, `the frame stays upright (${minUp.toFixed( 3 )})` );
	// without a rider it topples once pushed
	v.driver = null; v.engine.running = false;
	run( v, 12, IN() );
	v.knockback( new THREE.Vector3( 1, 0, 0 ), 0.5 );
	run( v, 6, IN() );
	ok( upY( v ) < 0.7, `falls over without a rider (up ${upY( v ).toFixed( 2 )})` );
}

// ---- boats -----------------------------------------------------------------------------------------------------------
console.log( 'boats' );
for ( const type of TYPES.filter( t => SPECS[ t ].kind === 'boat' ) ) {
	const game = makeGame();
	const v = new Vehicle( game, type, { pos: new THREE.Vector3( 0, 0, 400 ), yaw: Math.PI, fuel: 50 } );
	v.settle();
	v.driver = game.player; v.engine.running = true; v.wake();
	run( v, 6, IN() );
	log( `${type}: floats at ${v.pos.y.toFixed( 3 )}, inWater ${v.inWater.toFixed( 2 )}, up ${upY( v ).toFixed( 3 )}` );
	ok( v.pos.y > - 0.6 && v.pos.y < 0.3, `${type}: floats near its waterline (${v.pos.y.toFixed( 2 )})` );
	ok( upY( v ) > 0.97, `${type}: floats upright` );
	ok( v.body.v.length() < 0.3, `${type}: settles (${v.body.v.length().toFixed( 2 )} m/s)` );
	run( v, 25, IN( { forward: true } ) );
	const top = v.fwdSpeed * 1.944;
	log( `${type}: ${top.toFixed( 1 )} kn after 25 s, bow up ${( Math.asin( new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( v.body.q ).y ) * 57.3 ).toFixed( 1 )} deg` );
	ok( top > ( type === 'fishing_boat' ? 7 : 25 ), `${type}: under way at ${top.toFixed( 0 )} kn` );
	ok( top < 70, `${type}: top speed sane (${top.toFixed( 0 )} kn)` );
	ok( upY( v ) > 0.9, `${type}: stays upright under way` );
	run( v, 6, IN( { forward: true, left: true, steer: 1 } ) );
	ok( v.body.w.y > 0.05, `${type}: turns left (${v.body.w.y.toFixed( 2 )})` );
	ok( upY( v ) > 0.8, `${type}: turns without capsizing (${upY( v ).toFixed( 2 )})` );
}

// ---- helicopter ----------------------------------------------------------------------------------------------------------
console.log( 'helicopter' );
{
	const game = makeGame();
	const v = new Vehicle( game, 'helicopter', { pos: new THREE.Vector3( 0, 0.5, 0 ), yaw: 0, fuel: 400 } );
	v.settle();
	v.driver = game.player; v.engine.running = true; v.wake();
	run( v, 8, IN() );
	ok( v.rotor > 0.7, `rotor spools up (${v.rotor.toFixed( 2 )})` );
	ok( v.pos.y < 1.0, `stays on the ground at idle (${v.pos.y.toFixed( 2 )})` );
	run( v, 3, IN( { forward: true } ) );
	ok( Math.hypot( v.body.v.x, v.body.v.z ) < 0.5 && Math.hypot( v.pos.x, v.pos.z ) < 0.5, `the stick alone does not slide it along the ground (${Math.hypot( v.pos.x, v.pos.z ).toFixed( 2 )} m)` );
	run( v, 6, IN( { up: true } ) );
	ok( v.pos.y > 10, `climbs (${v.pos.y.toFixed( 1 )} m)` );
	const h0 = v.pos.y;
	run( v, 5, IN() );
	ok( Math.abs( v.pos.y - h0 - v.body.v.y * 0 ) < 8 && Math.abs( v.body.v.y ) < 1.5, `holds altitude (${h0.toFixed( 1 )} -> ${v.pos.y.toFixed( 1 )}, vy ${v.body.v.y.toFixed( 2 )})` );
	run( v, 10, IN( { forward: true } ) );
	log( `heli forward ${speedKmh( v ).toFixed( 0 )} km/h, alt ${v.pos.y.toFixed( 1 )}` );
	ok( v.fwdSpeed > 20, `flies forward (${( v.fwdSpeed * 3.6 ).toFixed( 0 )} km/h)` );
	ok( v.fwdSpeed * 3.6 < 320, 'forward speed sane' );
	run( v, 6, IN() );
	ok( upY( v ) > 0.97, `levels out when the stick is released (${upY( v ).toFixed( 3 )})` );
	run( v, 3, IN( { left: true } ) );
	ok( v.body.w.y > 0.3, `yaws left (${v.body.w.y.toFixed( 2 )})` );
	// land: descend until the skids touch
	run( v, 30, IN( { down: true } ) );
	ok( v.pos.y < 1.2 && v.health > v.maxHealth * 0.5, `lands gently (y ${v.pos.y.toFixed( 2 )}, health ${v.health.toFixed( 0 )})` );
}

// ---- plane ---------------------------------------------------------------------------------------------------------------
console.log( 'plane' );
{
	const game = makeGame();
	const v = new Vehicle( game, 'plane', { pos: new THREE.Vector3( 0, 0.5, 0 ), yaw: 0, fuel: 150 } );
	v.settle();
	v.driver = game.player; v.engine.running = true; v.wake();
	run( v, 3, IN() );
	ok( v.wheels.filter( w => w.grounded ).length === 3, 'stands on its gear' );
	run( v, 6, IN( { up: true } ) );
	ok( v.throttleSet > 0.95, `throttle opens (${v.throttleSet.toFixed( 2 )})` );
	let rot = null;
	run( v, 25, ( vv ) => IN( { back: vv.fwdSpeed > 28 } ), ( vv, t ) => { if ( rot === null && vv.pos.y > 3 ) rot = t; } );
	log( `plane: airborne after ${rot?.toFixed( 1 )} s at ${( v.fwdSpeed * 3.6 ).toFixed( 0 )} km/h, alt ${v.pos.y.toFixed( 0 )}` );
	ok( rot !== null, 'takes off' );
	ok( v.pos.y > 20, `climbs (${v.pos.y.toFixed( 0 )} m)` );
	run( v, 10, IN() );
	ok( ! v.stalled && v.fwdSpeed > 25, `cruises (${( v.fwdSpeed * 3.6 ).toFixed( 0 )} km/h)` );
	run( v, 0.6, IN( { right: true } ) );
	ok( new THREE.Vector3( 1, 0, 0 ).applyQuaternion( v.body.q ).y < - 0.2, 'rolls right' );
	run( v, 6, IN() );
	ok( Math.abs( new THREE.Vector3( 1, 0, 0 ).applyQuaternion( v.body.q ).y ) < 0.1, 'levels its wings hands off' );
}

// ---- the manager in a small game on the real islands --------------------------------------------------------------------
console.log( 'manager' );
{
	const { EntityManager } = await import( '../src/game/Entities.js' );
	const { Actions } = await import( '../src/game/Actions.js' );
	const { Interact } = await import( '../src/game/Interact.js' );
	const { Player } = await import( '../src/game/Player.js' );
	const { install } = await import( '../src/vehicles/Vehicles.js' );
	const { defineItems, makeStack } = await import( '../src/game/items/ItemDB.js' );
	await import( '../src/game/items/defs/index.js' ).catch( () => {} );
	const meta = JSON.parse( fs.readFileSync( 'public/data/world.json', 'utf8' ) );
	const raw = zlib.gunzipSync( fs.readFileSync( 'public/data/terrain.bin.gz' ) );
	const hf = new HeightField( raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength ), meta );
	const ocean = { heightAt: () => 0 };
	const keys = new Set(), pressedQ = new Set();
	const toasts = [], opened = [], noises = [];
	const game = {
		hf, mode: 'survival', inputActive: true, dead: false, systems: [],
		world: { meta, hf, isBeach: () => false, sky: { night: 0.8 }, pool: { busy: 0 } },
		scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera( 80, 1.6, 0.08, 5000 ),
		events: new Events(), weather: { rain: 0 }, audio: { ctx: null, play: () => null, loop: () => null, footstep() {} }, fx: null,
		settings: { get: ( k ) => ( { fov: 80, headBob: 1, toggleCrouch: true, toggleSprint: false } )[ k ] },
		input: { is: ( a ) => keys.has( a ), pressed: ( a ) => pressedQ.has( a ), consumeMouse: () => [ 0, 0 ], label: ( a ) => a },
		survival: { hurt: ( n, kind ) => { game.hurtBy = kind; }, useStamina() {}, moveModifiers: () => ( { speed: 1, canSprint: true } ), fallDamage() {} },
		toast: ( t ) => toasts.push( t ), register( s ) { this.systems.push( s ); return s; }, spawnables: {},
		app: { ui: { openContainer: ( c ) => opened.push( c ) } },
	};
	game.physics = new Physics( hf, ocean );
	game.entities = new EntityManager( game );
	game.actions = new Actions( game );
	game.interact = new Interact( game );
	game.player = new Player( game );
	game.events.on( 'noise', ( e ) => noises.push( e ) );
	const mgr = install( game );
	ok( game.vehicles === mgr && game.spawnables.sedan && game.spawnables.helicopter && game.spawnables.motorbike && game.spawnables.boat, 'installs the manager and the /summon names' );
	ok( mgr.spawner.sites.length > 1000, `${mgr.spawner.sites.length} vehicle sites across the islands` );
	const tick = () => new Promise( r => setTimeout( r, 0 ) );
	const frames = async ( n, dt = 1 / 30 ) => {
		for ( let i = 0; i < n; i ++ ) {
			game.player.update( dt );
			game.actions.update( dt );
			mgr.update( dt );
			game.entities.update( dt );
			game.interact.update( dt );
			pressedQ.clear();
			await tick();
		}
	};
	// Waikiki: parked cars appear around the player
	const P = game.player;
	P.pos.set( - 3973, hf.heightAt( - 3973, - 9770 ), - 9770 );
	game.camera.position.set( P.pos.x, P.pos.y + 1.6, P.pos.z );
	for ( let i = 0; i < 400 && mgr.list.length < 12; i ++ ) await frames( 1 );
	log( 'active', mgr.list.length, mgr.list.map( v => v.typeName ).join( ' ' ) );
	ok( mgr.list.length >= 8, `parked vehicles stream in (${mgr.list.length})` );
	ok( mgr.list.every( v => v.pos.distanceTo( P.pos ) < 380 ), 'all within the spawn radius' );
	ok( mgr.list.every( v => v.boxes.length > 0 ), 'every vehicle has a collision box' );
	const kinds = new Set( mgr.list.map( v => v.kind ) );
	log( 'kinds', [ ...kinds ].join( ' ' ) );
	// summon a sedan and a helicopter in front of the player
	P.yaw = 0;
	const at = new THREE.Vector3( P.pos.x, 0, P.pos.z - 6 );
	at.y = game.physics.ground( at.x, at.z, P.pos.y + 3 ).y;
	game.spawnables.sedan.spawn( at, { yaw: P.yaw + Math.PI } );
	for ( let i = 0; i < 100 && ! mgr.list.find( v => v.summoned ); i ++ ) await frames( 1 );
	const car = mgr.list.find( v => v.summoned );
	ok( !! car, 'summons a sedan' );
	ok( car && car.fuel === SPECS.sedan.fuel.tank && car.keysIn, 'summoned: full tank, keys in' );
	// walk up and look at the driver's door: the prompt
	const side = new THREE.Vector3( - 1, 0, 0 ).applyQuaternion( car.body.q );
	const doorAt = car.pos.clone().addScaledVector( side, 1.6 ).add( new THREE.Vector3( 0, 0, 0 ).applyQuaternion( car.body.q ) );
	P.pos.set( doorAt.x, game.physics.ground( doorAt.x, doorAt.z, car.pos.y + 2 ).y, doorAt.z );
	const toCar = car.pos.clone().setY( car.pos.y + 0.9 ).sub( new THREE.Vector3( P.pos.x, P.pos.y + 1.6, P.pos.z ) ).normalize();
	P.yaw = Math.atan2( - toCar.x, - toCar.z ); P.pitch = Math.asin( toCar.y );
	await frames( 2 );
	log( 'prompt', game.interact.target?.label );
	ok( /^Drive Sedan$/.test( game.interact.target?.label || '' ), `looking at the driver's door: "${game.interact.target?.label}"` );
	// get in: the engine starts (keys in), drive off
	pressedQ.add( 'interact' );
	await frames( 1 );
	ok( P.vehicle && mgr.driving === car && mgr.isDriver, 'F: in the driver\'s seat' );
	await frames( 40 );
	ok( car.engine.running, 'the engine starts' );
	ok( mgr.hud()?.name === 'Sedan' && mgr.hud().fuel > 0.99, 'the HUD numbers' );
	const start = car.pos.clone();
	keys.add( 'forward' );
	await frames( 120 );
	keys.delete( 'forward' );
	const moved = car.pos.distanceTo( start );
	log( 'drove', moved.toFixed( 1 ), 'm, speed', ( car.speed * 3.6 ).toFixed( 0 ), 'km/h' );
	ok( moved > 15, `drives (${moved.toFixed( 0 )} m in 4 s)` );
	ok( P.pos.distanceTo( car.pos ) < 2.5, 'the player rides along' );
	ok( noises.some( n => n.kind === 'engine' ), 'the engine is heard' );
	keys.add( 'back' );
	for ( let i = 0; i < 120 && car.fwdSpeed > 0.3; i ++ ) await frames( 1 );
	keys.delete( 'back' );
	await frames( 20 );
	log( 'after braking', car.fwdSpeed.toFixed( 2 ), car.body.v.toArray().map( x => x.toFixed( 2 ) ).join( ',' ), 'gear', car.engine.gear, 'up', car.upY().toFixed( 3 ), 'grounded', car.wheels.map( w => w.grounded ? 1 : 0 ).join( '' ), 'n', hf.normalAt( car.pos.x, car.pos.z, new THREE.Vector3() ).toArray().map( x => x.toFixed( 3 ) ).join( ',' ) );
	ok( car.speed < 1.5, `brakes to a stop (${car.speed.toFixed( 2 )} m/s)` );
	// save while seated, then out
	const save = { world: {} };
	mgr.serialize( save );
	ok( save.world.vehicles.occupied?.k === car.key && save.world.vehicles.list.some( r => r.k === car.key ), 'the save knows the car and the seat' );
	pressedQ.add( 'interact' );
	await frames( 2 );
	ok( ! P.vehicle && ! mgr.driving, 'F again: out' );
	ok( P.pos.distanceTo( car.pos ) > 1.2 && P.pos.distanceTo( car.pos ) < 4, `standing beside the car (${P.pos.distanceTo( car.pos ).toFixed( 2 )} m)` );
	ok( ! car.engine.running, 'engine off when parked' );
	// the trunk
	const back = new THREE.Vector3( 0, 0, 1 ).applyQuaternion( car.body.q );
	const rearAt = car.pos.clone().addScaledVector( back, 3.6 );
	P.pos.set( rearAt.x, game.physics.ground( rearAt.x, rearAt.z, car.pos.y + 2 ).y, rearAt.z );
	const toRear = car.trunkPos.clone().sub( new THREE.Vector3( P.pos.x, P.pos.y + 1.6, P.pos.z ) ).normalize();
	P.yaw = Math.atan2( - toRear.x, - toRear.z ); P.pitch = Math.asin( toRear.y );
	await frames( 2 );
	ok( game.interact.target?.label === 'Search trunk', `at the back: "${game.interact.target?.label}"` );
	pressedQ.add( 'interact' ); await frames( 1 );
	ok( opened.length === 1 && opened[ 0 ].capacity === SPECS.sedan.containers.trunk && opened[ 0 ].pos, 'opens the trunk (with a position for the UI)' );
	// a restored game: the player back in the seat
	const game2 = Object.assign( Object.create( Object.getPrototypeOf( game ) ), game );
	const mgr2 = new mgr.constructor( game );
	for ( const v of [ ...mgr.list ] ) game.entities.remove( v );
	mgr.dispose();
	game.entities.update( 0 );
	ok( game.physics.boxes.size === 0 || [ ...game.physics.boxes.values() ].every( b => ! b.owner?.isVehicle ), 'quitting removes every vehicle collision box' );
	game.vehicles = mgr2;
	mgr2.load( save );
	ok( !! P.vehicle && mgr2.pendingEnter, 'load: waiting for the seat' );
	for ( let i = 0; i < 60 && ! mgr2.driving; i ++ ) { mgr2.update( 1 / 30 ); game.entities.update( 1 / 30 ); await tick(); }
	ok( mgr2.driving?.key === car.key && P.vehicle?.vehicle === mgr2.driving, 'load: back in the saved seat' );
	void game2;
	const M = mgr2;
	const frames2 = async ( n, dt = 1 / 30 ) => {
		for ( let i = 0; i < n; i ++ ) { game.player.update( dt ); game.actions.update( dt ); M.update( dt ); game.entities.update( dt ); game.interact.update( dt ); pressedQ.clear(); await tick(); }
	};
	M.exit( true );
	await frames2( 2 );
	ok( ! P.vehicle, 'exit( true )' );
	// running a zombie over
	const { Entity } = await import( '../src/game/Entities.js' );
	class Dummy extends Entity {
		constructor() { super( game, 'zombie' ); this.hits = 0; this.health = 100; }
		damage( n, info ) { this.hits ++; this.info = info; super.damage( n, info ); }
		knockback( d, s ) { this.kb = s; }
	}
	const car2 = M.driving || M.list.find( v => v.key === car.key );
	// on a level stretch of street near Waikiki, pointing along it
	const st = meta.streets.filter( s => meta.cities[ s[ 0 ] ].id === 'waikiki' && Math.hypot( s[ 4 ] - s[ 1 ], s[ 5 ] - s[ 2 ] ) > 70 && Math.abs( s[ 3 ] - s[ 6 ] ) < 0.3 )
		.sort( ( a, b ) => Math.hypot( a[ 1 ] + 3973, a[ 2 ] + 9770 ) - Math.hypot( b[ 1 ] + 3973, b[ 2 ] + 9770 ) )[ 0 ];
	const sd = new THREE.Vector3( st[ 4 ] - st[ 1 ], 0, st[ 5 ] - st[ 2 ] ).normalize();
	const s0 = new THREE.Vector3( st[ 1 ], 0, st[ 2 ] ).addScaledVector( sd, 12 );
	s0.y = game.physics.ground( s0.x, s0.z, 1e4 ).y;
	car2.setPose( s0, null, Math.atan2( - sd.x, - sd.z ) );
	car2.settle();
	M.enter( car2, 0 );
	await frames2( 30 );
	const ahead = new THREE.Vector3( 0, 0, - 1 ).applyQuaternion( car2.body.q );
	const z = new Dummy();
	z.pos.copy( car2.pos ).addScaledVector( ahead, 22 );
	z.pos.y = game.physics.ground( z.pos.x, z.pos.z, car2.pos.y + 2 ).y;
	game.entities.add( z );
	let kills = 0;
	game.events.on( 'kill', ( e ) => { if ( e.source === P && e.target === z ) kills ++; } );
	keys.add( 'forward' );
	for ( let i = 0; i < 150 && ! z.hits; i ++ ) await frames2( 1 );
	keys.delete( 'forward' );
	log( 'zombie run', 'car', car2.pos.toArray().map( x => x.toFixed( 1 ) ).join( ',' ), 'z', z.pos.toArray().map( x => x.toFixed( 1 ) ).join( ',' ), 'speed', car2.speed.toFixed( 1 ), 'driving', M.driving === car2, 'running', car2.engine.running, 'near', game.entities.near( car2.pos, 10, 'zombie' ).length );
	ok( z.hits === 1 && z.info?.kind === 'vehicle' && z.info.source === P, `runs the zombie down (hits ${z.hits})` );
	ok( ! z.alive ? kills === 1 : z.kb > 0, 'killed (a kill event) or knocked down' );
	keys.add( 'back' ); for ( let i = 0; i < 120 && car2.fwdSpeed > 0.3; i ++ ) await frames2( 1 ); keys.delete( 'back' );
	M.exit( true ); await frames2( 2 );
	ok( ! P.vehicle && ! M.driving, 'out again' );
	// the collision box keeps the player out of the car
	const pp = car2.pos.clone(); pp.y = game.physics.ground( pp.x, pp.z, car2.pos.y + 3 ).y;
	const test = new THREE.Vector3( car2.pos.x, car2.pos.y, car2.pos.z );
	game.physics.resolveCylinder( test, 0.3, 1.8, 0.45 );
	ok( test.distanceTo( car2.pos ) > 0.8, 'the car pushes a body out of its footprint' );
	// refuel from a jerrycan in the hands
	car2.fuel = 5;
	const can = makeStack( 'jerrycan', 1 );
	const pack = makeStack( 'backpack_hiking', 1 );
	if ( can && pack ) {
		P.inventory.add( pack );
		P.inventory.add( can );
		ok( !! P.inventory.findUid( can.uid ), 'the jerrycan is carried' );
		P.inventory.hands = can.uid;
		const fp = car2.model.meta.fuel;
		const fw = car2.body.toWorld( new THREE.Vector3( ...fp ), new THREE.Vector3() );
		const out = new THREE.Vector3( fp[ 0 ] > 0 ? 1 : - 1, 0, 0 ).applyQuaternion( car2.body.q );
		const stand = fw.clone().addScaledVector( out, 1.2 );
		P.pos.set( stand.x, game.physics.ground( stand.x, stand.z, car2.pos.y + 2 ).y, stand.z );
		const dir = fw.clone().sub( new THREE.Vector3( P.pos.x, P.pos.y + 1.6, P.pos.z ) ).normalize();
		P.yaw = Math.atan2( - dir.x, - dir.z ); P.pitch = Math.asin( dir.y );
		await frames2( 2 );
		ok( game.interact.target?.label === 'Refuel', `a jerrycan in the hands: "${game.interact.target?.label}"` );
		pressedQ.add( 'interact' ); await frames2( 1 );
		ok( game.actions.busy && game.actions.current.label === 'Refuelling', 'a timed refuelling action' );
		for ( let i = 0; i < 700 && game.actions.busy; i ++ ) await frames2( 1 );
		ok( car2.fuel > 20 && can.data.amount < 1, `fuel poured in (${car2.fuel.toFixed( 1 )} L, can ${can.data.amount.toFixed( 1 )} L)` );
		P.inventory.hands = null;
	} else ok( false, 'jerrycan item' );
	// a helicopter: take off, climb, land
	const hp = new THREE.Vector3( P.pos.x + 30, 0, P.pos.z + 30 );
	hp.y = game.physics.ground( hp.x, hp.z, 1e4 ).y;
	M.summon( 'helicopter', hp, { yaw: 0 } );
	for ( let i = 0; i < 200 && ! M.list.find( v => v.typeName === 'helicopter' && v.summoned ); i ++ ) await frames2( 1 );
	const heli = M.list.find( v => v.typeName === 'helicopter' && v.summoned );
	ok( !! heli, 'summons a helicopter' );
	if ( heli ) {
		ok( M.enter( heli, 0 ), 'gets into the helicopter' );
		ok( M.isDriver && M.seatInteraction()?.label === 'Exit', 'in the pilot seat: F to exit' );
		await frames2( 200 );
		const y0 = heli.pos.y;
		keys.add( 'vehicleUp' ); await frames2( 150 ); keys.delete( 'vehicleUp' );
		ok( heli.pos.y - y0 > 8, `climbs with the collective (${( heli.pos.y - y0 ).toFixed( 1 )} m)` );
		ok( M.hud()?.altitude > 5, 'the HUD shows the altitude' );
		ok( M.seatInteraction()?.label === 'Jump out', 'in the air: "Jump out"' );
		keys.add( 'forward' ); await frames2( 150 ); keys.delete( 'forward' );
		ok( heli.fwdSpeed > 10, `flies forward (${( heli.fwdSpeed * 3.6 ).toFixed( 0 )} km/h)` );
		keys.add( 'vehicleDown' );
		for ( let i = 0; i < 900 && heli.altitudeAGL > 0.8; i ++ ) await frames2( 1 );
		keys.delete( 'vehicleDown' );
		await frames2( 60 );
		ok( heli.health > heli.maxHealth * 0.5 && ! heli.burnt, `lands (health ${( heli.health / heli.maxHealth * 100 ).toFixed( 0 )} %, agl ${heli.altitudeAGL?.toFixed( 2 )})` );
		M.exit();
		await frames2( 2 );
		ok( ! P.vehicle, 'gets out of the helicopter' );
	}
	// a boat from the water
	const bp = new THREE.Vector3( - 4100, 0, - 9634 ); // off Waikiki
	P.pos.set( bp.x, 0, bp.z + 8 );
	for ( const v of [ ...M.list ] ) if ( ! v.touched ) { M._deactivate( v ); }
	game.entities.update( 0 );
	M.summon( 'speedboat', bp, { yaw: 0 } );
	for ( let i = 0; i < 200 && ! M.list.find( v => v.typeName === 'speedboat' && v.summoned ); i ++ ) await frames2( 1 );
	const boat = M.list.find( v => v.typeName === 'speedboat' && v.summoned );
	ok( !! boat && boat.inWater >= 0 && hf.heightAt( boat.pos.x, boat.pos.z ) < - 1, 'a speedboat summoned onto the water' );
	if ( boat ) {
		M.enter( boat, 0 );
		await frames2( 60 );
		keys.add( 'forward' ); await frames2( 150 ); keys.delete( 'forward' );
		log( 'boat', ( boat.fwdSpeed * 1.94 ).toFixed( 1 ), 'kn', 'inWater', boat.inWater.toFixed( 2 ) );
		ok( boat.fwdSpeed > 6 || boat.inWater < 0.2, `under way (${( boat.fwdSpeed * 1.94 ).toFixed( 0 )} kn)` );
		M.exit( true );
		await frames2( 3 );
		ok( ! P.vehicle, 'off the boat' );
	}
	// a motorcycle
	const mp = new THREE.Vector3( P.pos.x, 0, P.pos.z );
	P.pos.set( - 3973, hf.heightAt( - 3973, - 9770 ), - 9770 );
	mp.set( P.pos.x + 4, 0, P.pos.z ); mp.y = game.physics.ground( mp.x, mp.z, P.pos.y + 3 ).y;
	M.summon( 'motorbike', mp, { yaw: 0 } );
	for ( let i = 0; i < 200 && ! M.list.find( v => v.typeName === 'motorbike' && v.summoned ); i ++ ) await frames2( 1 );
	const bike = M.list.find( v => v.typeName === 'motorbike' && v.summoned );
	ok( !! bike, 'summons a motorcycle' );
	if ( bike ) {
		M.enter( bike, 0 );
		await frames2( 40 );
		keys.add( 'forward' ); await frames2( 90 ); keys.delete( 'forward' );
		ok( bike.speed > 8 && bike.upY() > 0.9, `rides (${( bike.speed * 3.6 ).toFixed( 0 )} km/h, up ${bike.upY().toFixed( 2 )})` );
		keys.add( 'back' ); for ( let i = 0; i < 150 && bike.fwdSpeed > 0.3; i ++ ) await frames2( 1 ); keys.delete( 'back' );
		await frames2( 10 );
		M.exit(); await frames2( 4 );
		ok( ! P.vehicle && bike.sleeping && bike.upY() > 0.9, 'parks on its stand' );
	}
	// save: touched vehicles only
	const s2 = { world: {} };
	M.serialize( s2 );
	ok( s2.world.vehicles.list.every( r => r.k && r.t && r.p.length === 3 ), `save records (${s2.world.vehicles.list.length})` );
	ok( JSON.stringify( s2 ).length < 200000, 'the save stays small' );
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
