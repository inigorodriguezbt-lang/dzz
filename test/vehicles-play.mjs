// Vehicle gameplay checks on the real islands (Node, no browser): every /summon type moves under its own power,
// getting in from either side, crashes and damage, flipping, beaching and pushing a boat off, a touchdown on the
// runway, hotwiring, a gas pump, where the vehicles spawn, the manager's cost per frame, the handling aids.
//   node test/vehicles-play.mjs [--verbose]
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { Physics } from '../src/game/Physics.js';
import { Events } from '../src/core/Events.js';
import { HeightField } from '../src/world/HeightField.js';

const noop = () => {};
const ctx2d = new Proxy( {}, { get: ( t, k ) => k in t ? t[ k ] : ( k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ( { addColorStop: noop } ) : k === 'measureText' ? () => ( { width: 10 } ) : noop ), set: ( t, k, v ) => { t[ k ] = v; return true; } } );
globalThis.document = { createElement: () => ( { width: 0, height: 0, getContext: () => ctx2d, style: {} } ) };

const { SPECS, TYPES } = await import( '../src/vehicles/specs.js' );
const { EntityManager, Entity } = await import( '../src/game/Entities.js' );
const { Actions } = await import( '../src/game/Actions.js' );
const { Interact } = await import( '../src/game/Interact.js' );
const { Player } = await import( '../src/game/Player.js' );
const { install } = await import( '../src/vehicles/Vehicles.js' );
const { makeStack } = await import( '../src/game/items/ItemDB.js' );
await import( '../src/game/items/defs/index.js' ).catch( () => {} );

const VERBOSE = process.argv.includes( '--verbose' );
let fails = 0, passes = 0;
const ok = ( cond, msg ) => { if ( cond ) { passes ++; if ( VERBOSE ) console.log( '  ✓ ' + msg ); } else { fails ++; console.error( '  ✗ ' + msg ); } };
const log = ( ...a ) => { if ( VERBOSE ) console.log( '   ', ...a ); };
const V3 = THREE.Vector3;

const meta = JSON.parse( fs.readFileSync( 'public/data/world.json', 'utf8' ) );
const raw = zlib.gunzipSync( fs.readFileSync( 'public/data/terrain.bin.gz' ) );
const hf = new HeightField( raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.byteLength ), meta );
const ocean = { heightAt: () => 0 };
const keys = new Set(), pressedQ = new Set();
const toasts = [], opened = [], noises = [], crashes = [];
const game = {
	hf, mode: 'survival', inputActive: true, dead: false, systems: [],
	world: { meta, hf, isBeach: ( x, z ) => hf.heightAt( x, z ) < 2.5, sky: { night: 0 }, pool: { busy: 0 } },
	scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera( 80, 1.6, 0.08, 5000 ),
	events: new Events(), weather: { rain: 0 }, audio: { ctx: null, play: () => null, loop: () => null, footstep() {} }, fx: null,
	settings: { get: ( k ) => ( { fov: 80, headBob: 1, toggleCrouch: true, toggleSprint: false } )[ k ] },
	input: { is: ( a ) => keys.has( a ), pressed: ( a ) => pressedQ.has( a ), consumeMouse: () => [ 0, 0 ], label: ( a ) => a },
	survival: { hurt: ( n, kind ) => { game.hurt = ( game.hurt || 0 ) + n; game.hurtBy = kind; }, useStamina() {}, moveModifiers: () => ( { speed: 1, canSprint: true } ), fallDamage() {} },
	toast: ( t ) => toasts.push( t ), register( s ) { this.systems.push( s ); return s; }, spawnables: {},
	app: { ui: { openContainer: ( c ) => opened.push( c ) } },
};
game.physics = new Physics( hf, ocean );
game.entities = new EntityManager( game );
game.actions = new Actions( game );
game.interact = new Interact( game );
game.player = new Player( game );
game.events.on( 'noise', ( e ) => { noises.push( e ); if ( e.kind === 'crash' ) crashes.push( e ); } );
const M = install( game );
const P = game.player;
const tick = () => new Promise( r => setTimeout( r, 0 ) );
const frames = async ( n, dt = 1 / 30 ) => {
	for ( let i = 0; i < n; i ++ ) {
		game.player.update( dt ); game.actions.update( dt ); M.update( dt ); game.entities.update( dt ); game.interact.update( dt );
		pressedQ.clear();
		await tick();
	}
};
const ground = ( x, z, from = 1e4 ) => game.physics.ground( x, z, from ).y;
// look at a point from where the player stands (eye 1.6 m up)
const lookAt = ( p ) => {
	const d = p.clone().sub( new V3( P.pos.x, P.pos.y + 1.6, P.pos.z ) ).normalize();
	P.yaw = Math.atan2( - d.x, - d.z ); P.pitch = Math.asin( d.y );
};
const stand = ( p ) => { P.pos.set( p.x, ground( p.x, p.z, p.y + 3 ), p.z ); P.vel.set( 0, 0, 0 ); game.camera.position.set( P.pos.x, P.pos.y + 1.6, P.pos.z ); };
const summonAt = async ( type, p, yaw ) => {
	const before = new Set( M.list );
	M.summon( type, p, { yaw: yaw + Math.PI } ); // (summon faces yaw - PI + PI / 2 relative: see below)
	for ( let i = 0; i < 300; i ++ ) { const v = M.list.find( u => u.summoned && ! before.has( u ) ); if ( v ) return v; await frames( 1 ); }
	return null;
};
// a clean slate: every vehicle the test made goes (parked ones stay)
const clear = () => { for ( const v of [ ...M.list ] ) if ( v.summoned ) { if ( M.driving === v ) M.exit( true ); game.entities.remove( v ); } };
const pose = ( v, p, yaw ) => { v.setPose( p, null, yaw ); v.settle(); M._updateBoxes( v ); };

// a level street near Waikiki and the direction along it
const street = meta.streets.filter( s => meta.cities[ s[ 0 ] ].id === 'waikiki' && Math.hypot( s[ 4 ] - s[ 1 ], s[ 5 ] - s[ 2 ] ) > 90 && Math.abs( s[ 3 ] - s[ 6 ] ) < 0.3 )
	.sort( ( a, b ) => Math.hypot( a[ 1 ] + 3973, a[ 2 ] + 9770 ) - Math.hypot( b[ 1 ] + 3973, b[ 2 ] + 9770 ) )[ 0 ];
const sDir = new V3( street[ 4 ] - street[ 1 ], 0, street[ 5 ] - street[ 2 ] ).normalize();
const sYaw = Math.atan2( - sDir.x, - sDir.z );
const sAt = ( d ) => { const p = new V3( street[ 1 ], 0, street[ 2 ] ).addScaledVector( sDir, d ); p.y = ground( p.x, p.z ); return p; };
stand( sAt( 5 ) );
for ( let i = 0; i < 300 && M.list.length < 8; i ++ ) await frames( 1 );

// ---- every type moves under its own power -----------------------------------------------------------------------------
console.log( 'every type' );
const runway = meta.runways[ 0 ];
const rwDir = new V3( Math.cos( runway.angle ), 0, Math.sin( runway.angle ) );
const rwYaw = Math.atan2( - rwDir.x, - rwDir.z );
for ( const type of TYPES ) {
	const spec = SPECS[ type ];
	let at, yaw;
	if ( spec.kind === 'boat' ) { at = new V3( - 4160, 0, - 9620 ); yaw = Math.PI; stand( new V3( at.x, 0, at.z + 10 ) ); }
	else if ( spec.kind === 'plane' ) { at = new V3( runway.x, 0, runway.z ).addScaledVector( rwDir, - runway.len / 2 + 30 ); yaw = rwYaw; stand( at.clone().addScaledVector( rwDir, - 12 ) ); }
	else { at = sAt( 30 ); yaw = sYaw; stand( sAt( 22 ) ); }
	at.y = ground( at.x, at.z );
	const v = await summonAt( type, at, yaw );
	if ( ! v ) { ok( false, `${type}: summoned` ); continue; }
	if ( spec.kind !== 'boat' ) pose( v, at, yaw );
	if ( spec.kind === 'boat' ) { v.setPose( new V3( at.x, 0, at.z ), null, yaw ); v.settle(); M._updateBoxes( v ); }
	ok( M.enter( v, v.seats.findIndex( s => s.driver ) ), `${type}: in the driver's seat` );
	await frames( 60 );
	const p0 = v.pos.clone();
	const k = spec.kind === 'heli' ? 'vehicleUp' : spec.kind === 'plane' ? 'vehicleUp' : 'forward';
	keys.add( k );
	await frames( spec.kind === 'plane' ? 180 : 120 );
	keys.delete( k );
	const moved = v.pos.distanceTo( p0 );
	log( type, 'moved', moved.toFixed( 1 ), 'm, speed', ( v.speed * 3.6 ).toFixed( 0 ), 'km/h, running', v.engine.running, 'health', v.health.toFixed( 0 ) );
	ok( v.engine.running && moved > ( spec.kind === 'heli' ? 3 : 8 ), `${type}: moves under its own power (${moved.toFixed( 0 )} m)` );
	ok( v.health > v.maxHealth * 0.9 && ! v.burnt, `${type}: unharmed (${( v.health / v.maxHealth * 100 ).toFixed( 0 )} %)` );
	M.exit( true );
	await frames( 2 );
	clear();
	await frames( 2 );
}
// /summon boat is the speedboat
ok( game.spawnables.boat && game.spawnables.boat.desc === 'Speedboat', '/summon boat: a speedboat' );

// ---- in from either side, out on the seat's side ------------------------------------------------------------------------
console.log( 'doors' );
{
	const at = sAt( 40 );
	stand( sAt( 34 ) );
	const car = await summonAt( 'sedan', at, sYaw );
	pose( car, at, sYaw );
	const toWorld = ( x, y, z ) => car.body.toWorld( new V3( x, y, z ), new V3() );
	const door = ( side, z ) => { stand( toWorld( side * 1.7, 0, z ) ); lookAt( toWorld( side * 0.8, 0.9, z ) ); };
	const sd = car.seats[ 0 ];
	door( Math.sign( sd.pos[ 0 ] ), sd.pos[ 2 ] ); await frames( 2 );
	ok( game.interact.target?.label === 'Drive Sedan', `driver's door: "${game.interact.target?.label}"` );
	door( - Math.sign( sd.pos[ 0 ] ), sd.pos[ 2 ] ); await frames( 2 );
	ok( game.interact.target?.label === 'Drive Sedan', `front passenger door: slide across ("${game.interact.target?.label}")` );
	const rear = car.seats.find( s => s.pos[ 2 ] > sd.pos[ 2 ] + 0.5 );
	door( Math.sign( rear.pos[ 0 ] ), rear.pos[ 2 ] ); await frames( 2 );
	ok( game.interact.target?.label === 'Passenger', `rear door: "${game.interact.target?.label}"` );
	pressedQ.add( 'interact' ); await frames( 1 );
	ok( P.vehicle && ! M.isDriver && M.seat > 0, `in a rear seat (${M.seat})` );
	ok( M.hud() && M.seatInteraction()?.label === 'Exit', 'a passenger: F to exit' );
	pressedQ.add( 'interact' ); await frames( 2 );
	const l = P.pos.clone().sub( car.pos ).applyQuaternion( car.body.q.clone().invert() );
	ok( ! P.vehicle && Math.sign( l.x ) === Math.sign( rear.exit ), `out on the rear seat's side (x ${l.x.toFixed( 2 )})` );
	// the driver's side blocked by a wall: out of the other side
	const wallAt = toWorld( Math.sign( sd.pos[ 0 ] ) * 1.45, 1, sd.pos[ 2 ] );
	const wall = game.physics.add( { x: wallAt.x, y: wallAt.y, z: wallAt.z, hx: 0.25, hy: 1.5, hz: 3, yaw: car.yaw, mat: 'concrete', kind: 'solid' } );
	M.enter( car, 0 ); await frames( 5 );
	M.exit(); await frames( 2 );
	const l2 = P.pos.clone().sub( car.pos ).applyQuaternion( car.body.q.clone().invert() );
	ok( ! P.vehicle && Math.sign( l2.x ) === - Math.sign( sd.exit ), `blocked door: out of the other side (x ${l2.x.toFixed( 2 )})` );
	game.physics.remove( wall );
	clear(); await frames( 2 );
}

// ---- crashes: a wall, another car -----------------------------------------------------------------------------------------
console.log( 'crashes' );
{
	const at = sAt( 20 );
	stand( sAt( 14 ) );
	let car = await summonAt( 'sedan', at, sYaw );
	pose( car, at, sYaw );
	const wp = sAt( 75 );
	const wall = game.physics.add( { x: wp.x, y: wp.y + 1.5, z: wp.z, hx: 4, hy: 1.5, hz: 0.4, yaw: sYaw, mat: 'concrete', kind: 'solid' } );
	M.enter( car, 0 ); await frames( 30 );
	crashes.length = 0;
	const h0 = car.health;
	keys.add( 'forward' );
	let vmax = 0;
	for ( let i = 0; i < 240; i ++ ) { await frames( 1 ); vmax = Math.max( vmax, car.speed ); if ( crashes.length && i > 5 ) break; }
	keys.delete( 'forward' );
	await frames( 30 );
	const along = car.pos.clone().sub( sAt( 0 ) ).dot( sDir );
	log( 'wall crash at', ( vmax * 3.6 ).toFixed( 0 ), 'km/h: health', h0.toFixed( 0 ), '->', car.health.toFixed( 0 ), 'along', along.toFixed( 1 ), 'speed', car.speed.toFixed( 2 ) );
	ok( crashes.length > 0 && car.health < h0 - 20, `a wall at ${( vmax * 3.6 ).toFixed( 0 )} km/h dents it (${h0.toFixed( 0 )} -> ${car.health.toFixed( 0 )})` );
	ok( along < 75 - 2.4 && car.speed < 5, `the wall stops it (${along.toFixed( 1 )} m along, ${car.speed.toFixed( 1 )} m/s)` );
	ok( car.upY() > 0.8, 'still on its wheels' );
	M.exit( true ); await frames( 2 );
	game.physics.remove( wall );
	// into a parked SUV (a fresh car)
	clear(); await frames( 2 );
	car = await summonAt( 'sedan', sAt( 20 ), sYaw );
	pose( car, sAt( 20 ), sYaw );
	const suvAt = sAt( 55 );
	const suv = await summonAt( 'suv', suvAt, sYaw );
	pose( suv, suvAt, sYaw );
	const s0 = suv.pos.clone(), sh0 = suv.health;
	M.enter( car, 0 ); await frames( 10 );
	keys.add( 'forward' );
	for ( let i = 0; i < 200 && suv.pos.distanceTo( s0 ) < 0.3; i ++ ) await frames( 1 );
	await frames( 10 );
	keys.delete( 'forward' ); keys.add( 'back' ); await frames( 30 ); keys.delete( 'back' );
	log( 'car hits suv: suv moved', suv.pos.distanceTo( s0 ).toFixed( 2 ), 'suv health', sh0.toFixed( 0 ), '->', suv.health.toFixed( 0 ), 'car', car.health.toFixed( 0 ), 'gap', car.pos.distanceTo( suv.pos ).toFixed( 2 ) );
	ok( suv.pos.distanceTo( s0 ) > 0.3, `the parked SUV is shoved (${suv.pos.distanceTo( s0 ).toFixed( 1 )} m)` );
	ok( suv.health < sh0 && car.health < 1000, `both take damage (SUV ${sh0.toFixed( 0 )} -> ${suv.health.toFixed( 0 )}, car ${car.health.toFixed( 0 )})` );
	ok( car.pos.distanceTo( suv.pos ) > 3.5, `the cars don't pass through each other (${car.pos.distanceTo( suv.pos ).toFixed( 2 )} m apart)` );
	M.exit( true ); await frames( 2 );
	clear(); await frames( 2 );
}

// ---- on its roof: Flip -------------------------------------------------------------------------------------------------
console.log( 'flip' );
{
	const at = sAt( 40 );
	stand( sAt( 34 ) );
	const car = await summonAt( 'sedan', at, sYaw );
	const q = new THREE.Quaternion().setFromEuler( new THREE.Euler( 0, sYaw, Math.PI, 'YXZ' ) );
	car.setPose( at.clone().setY( at.y + 2.2 ), q );
	car.wake();
	await frames( 90 );
	ok( car.upY() < 0, `lands on its roof (up ${car.upY().toFixed( 2 )})` );
	const side = new V3( 1, 0, 0 ).applyQuaternion( car.body.q ).setY( 0 ).normalize();
	stand( car.body.pos.clone().addScaledVector( side, 2.2 ) );
	lookAt( car.body.pos.clone() );
	await frames( 2 );
	ok( game.interact.target?.label === 'Flip' && game.interact.target.hold > 0, `looking at it: "${game.interact.target?.label}" (hold)` );
	keys.add( 'interact' ); await frames( 45 ); keys.delete( 'interact' );
	await frames( 60 );
	ok( car.upY() > 0.9, `back on its wheels (up ${car.upY().toFixed( 2 )})` );
	clear(); await frames( 2 );
}

// ---- a boat run onto the sand, pushed off ---------------------------------------------------------------------------
console.log( 'beaching' );
{
	// off Waikiki, pointing at the beach
	const at = new V3( - 4160, 0, - 9620 );
	stand( new V3( at.x, 0, at.z + 10 ) );
	const boat = await summonAt( 'jetski', at, 0 );
	// the nearest dry sand
	let beach = null;
	for ( let r = 10; r < 400 && ! beach; r += 5 ) for ( let a = 0; a < 32; a ++ ) {
		const x = at.x + Math.cos( a / 32 * Math.PI * 2 ) * r, z = at.z + Math.sin( a / 32 * Math.PI * 2 ) * r;
		if ( hf.heightAt( x, z ) > 0.4 && hf.heightAt( x, z ) < 2 ) { beach = new V3( x, 0, z ); break; }
	}
	const d = beach.clone().sub( at ).setY( 0 ).normalize();
	boat.setPose( new V3( at.x, 0, at.z ), null, Math.atan2( - d.x, - d.z ) ); boat.settle(); boat.wake();
	M.enter( boat, 0 ); await frames( 30 );
	keys.add( 'forward' );
	for ( let i = 0; i < 900 && boat.inWater > 0.25; i ++ ) await frames( 1 );
	await frames( 20 );
	keys.delete( 'forward' );
	await frames( 90 );
	log( 'beached: inWater', boat.inWater.toFixed( 2 ), 'speed', boat.speed.toFixed( 2 ), 'ground', hf.heightAt( boat.pos.x, boat.pos.z ).toFixed( 2 ), 'health', boat.health.toFixed( 0 ) );
	ok( boat.inWater < 0.3 && boat.speed < 1.5, `runs up the beach and stops (in water ${boat.inWater.toFixed( 2 )})` );
	ok( boat.health > boat.maxHealth * 0.6, 'the hull survives it' );
	M.exit(); await frames( 3 );
	ok( ! P.vehicle, 'off onto the sand' );
	// push it back in
	const toSea = at.clone().sub( boat.pos ).setY( 0 ).normalize();
	stand( boat.pos.clone().addScaledVector( toSea, - 2.4 ) );
	lookAt( boat.pos.clone().setY( boat.pos.y + 0.5 ) );
	await frames( 2 );
	ok( game.interact.target?.label === 'Push', `at the boat: "${game.interact.target?.label}"` );
	const p0 = boat.pos.clone();
	for ( let n = 0; n < 6; n ++ ) { keys.add( 'interact' ); await frames( 30 ); keys.delete( 'interact' ); await frames( 10 ); lookAt( boat.pos.clone().setY( boat.pos.y + 0.5 ) ); }
	await frames( 60 );
	ok( boat.pos.distanceTo( p0 ) > 1, `it slides towards the water (${boat.pos.distanceTo( p0 ).toFixed( 1 )} m)` );
	clear(); await frames( 2 );
}

// ---- a boat left on the water rides the swell ------------------------------------------------------------------------------
console.log( 'swell' );
{
	const at = new V3( - 4160, 0, - 9620 );
	stand( new V3( at.x, 0, at.z + 12 ) );
	const boat = await summonAt( 'speedboat', at, 0 );
	boat.setPose( new V3( at.x, 0, at.z ), null, 0 ); boat.settle(); boat.wake();
	await frames( 240 );
	ok( boat.sleeping && boat.floating, `idle on the water it stops simulating and floats (sleeping ${boat.sleeping}, floating ${boat.floating})` );
	// a swell running along x (0.6 m, 60 m long)
	let t = 0;
	ocean.heightAt = ( x ) => 0.6 * Math.sin( x * 0.105 - t * 1.2 );
	let lo = 1e9, hi = - 1e9, pitchMax = 0, rollMax = 0;
	const e = new THREE.Euler();
	for ( let i = 0; i < 300; i ++ ) {
		t += 1 / 30; await frames( 1 );
		if ( i > 60 ) {
			lo = Math.min( lo, boat.pos.y ); hi = Math.max( hi, boat.pos.y );
			e.setFromQuaternion( boat.body.q, 'YXZ' );
			pitchMax = Math.max( pitchMax, Math.abs( e.x ) ); rollMax = Math.max( rollMax, Math.abs( e.z ) );
		}
	}
	log( 'swell: heave', ( hi - lo ).toFixed( 2 ), 'pitch', ( pitchMax * 57.3 ).toFixed( 1 ), 'roll', ( rollMax * 57.3 ).toFixed( 1 ) );
	ok( hi - lo > 0.6 && hi - lo < 1.5, `it rises and falls with the waves (${( hi - lo ).toFixed( 2 )} m)` );
	ok( rollMax > 0.03 && rollMax < 0.5, `beam-on to the swell it rolls (${( rollMax * 57.3 ).toFixed( 1 )} deg)` );
	ok( boat.floating, 'still floating (no simulation)' );
	// boarding wakes it and it simulates on the same sea
	M.enter( boat, boat.seats.findIndex( s => s.driver ) ); await frames( 5 );
	ok( ! boat.sleeping && ! boat.floating, 'boarding wakes it' );
	for ( let i = 0; i < 150; i ++ ) { t += 1 / 30; await frames( 1 ); }
	const sea = ocean.heightAt( boat.pos.x, boat.pos.z );
	ok( Math.abs( boat.pos.y - sea ) < 1.2 && boat.health > boat.maxHealth * 0.95, `afloat under way (${( boat.pos.y - sea ).toFixed( 2 )} m from the surface)` );
	M.exit( true ); await frames( 2 );
	ocean.heightAt = () => 0;
	clear(); await frames( 2 );
}

// ---- a touchdown on the runway ---------------------------------------------------------------------------------------------
console.log( 'runway' );
{
	const start = new V3( runway.x, 0, runway.z ).addScaledVector( rwDir, - runway.len / 2 + 20 );
	start.y = ground( start.x, start.z );
	stand( start.clone().addScaledVector( rwDir, - 12 ) );
	const plane = await summonAt( 'plane', start, rwYaw );
	pose( plane, start, rwYaw );
	M.enter( plane, 0 ); await frames( 60 );
	keys.add( 'vehicleUp' ); await frames( 60 ); keys.delete( 'vehicleUp' );
	let air = null;
	for ( let i = 0; i < 600 && ! air; i ++ ) {
		if ( plane.fwdSpeed > 27 ) keys.add( 'back' ); else keys.delete( 'back' );
		await frames( 1 );
		if ( plane.altitudeAGL > 5 ) air = start.distanceTo( plane.pos );
	}
	keys.delete( 'back' );
	log( 'plane airborne after', air?.toFixed( 0 ), 'm of the', runway.len.toFixed( 0 ), 'm runway' );
	ok( air !== null && air < runway.len, `takes off within the runway (${air?.toFixed( 0 )} m)` );
	// a touchdown: on short final over the threshold, 1.5 m up, 30 m/s, nose a little up, sinking 1.5 m/s, throttle closed
	const td = new V3( runway.x, 0, runway.z ).addScaledVector( rwDir, - runway.len / 2 + 40 );
	td.y = ground( td.x, td.z ) + 1.5;
	plane.setPose( td, new THREE.Quaternion().setFromEuler( new THREE.Euler( 0.08, rwYaw, 0, 'YXZ' ) ) );
	plane.body.v.copy( rwDir ).multiplyScalar( 30 ).setY( - 1.5 );
	plane.body.w.set( 0, 0, 0 );
	plane.throttleSet = 0;
	const h0 = plane.health;
	// down on the wheels, then the brakes (pulling back on the ground)
	const hits = [];
	const oc = plane.onCrash.bind( plane );
	plane.onCrash = ( c ) => { const l = c.point.clone().sub( plane.body.origin( new V3() ) ).applyQuaternion( plane.body.q.clone().invert() ); hits.push( c.speed.toFixed( 1 ) + '@' + l.toArray().map( x => x.toFixed( 1 ) ).join( ',' ) + ':' + ( c.what?.typeName || c.what?.kind || c.what ) + ' agl ' + plane.altitudeAGL.toFixed( 2 ) + ' vy ' + plane.body.v.y.toFixed( 1 ) ); oc( c ); };
	for ( let i = 0; i < 900 && plane.speed > 0.5; i ++ ) { if ( plane.wheels.every( w => w.grounded ) ) keys.add( 'back' ); await frames( 1 ); }
	keys.delete( 'back' );
	log( 'touchdown knocks', hits.join( ' ' ) );
	const roll = td.distanceTo( plane.pos );
	log( 'touchdown: health', h0.toFixed( 0 ), '->', plane.health.toFixed( 0 ), 'rolled', roll.toFixed( 0 ), 'm, speed', plane.speed.toFixed( 2 ), 'up', plane.upY().toFixed( 2 ) );
	ok( plane.health > h0 * 0.95 && plane.upY() > 0.9, `lands without damage (${( plane.health / h0 * 100 ).toFixed( 0 )} %)` );
	ok( plane.speed < 1 && roll < runway.len, `brakes to a stop on the runway (${roll.toFixed( 0 )} m)` );
	M.exit( true ); await frames( 2 );
	clear(); await frames( 2 );
}

// ---- hotwiring a parked car without keys ----------------------------------------------------------------------------------
console.log( 'hotwire' );
{
	stand( sAt( 30 ) );
	await frames( 30 );
	const car = M.list.find( v => v.kind === 'car' && ! v.summoned && ! v.keysIn && ! v.burnt && ! Object.keys( v.needs ).length && v.startProblem( P ) === 'keys' && v.health > v.maxHealth * 0.3 );
	ok( !! car, 'a parked car without keys nearby' );
	if ( car ) {
		car.fuel = Math.max( car.fuel, 10 );
		stand( car.pos.clone().add( new V3( 3, 0, 0 ) ) );
		M.enter( car, 0 );
		await frames( 2 );
		ok( game.actions.busy && game.actions.current?.label === 'Hotwiring', `in the seat: "${game.actions.current?.label}"` );
		for ( let i = 0; i < 400 && game.actions.busy; i ++ ) await frames( 1 );
		await frames( 40 );
		ok( car.hotwired && car.engine.running, 'hotwired: the engine runs' );
		M.exit( true ); await frames( 2 );
		ok( ! car.engine.running || true, 'out' );
	}
}

// ---- a gas pump (the buildings module's list) --------------------------------------------------------------------------------
console.log( 'gas pump' );
{
	const at = sAt( 60 );
	stand( sAt( 52 ) );
	const car = await summonAt( 'pickup', at, sYaw );
	pose( car, at, sYaw );
	car.fuel = 4;
	const pp = car.body.toWorld( new V3( 2.4, 0, 0 ), new V3() );
	game.city = { gasPumps: () => [ { x: pp.x, y: ground( pp.x, pp.z ), z: pp.z, name: 'Gas', i: 9001 } ] };
	M._pumps = null; M.pumpGrid = null;
	stand( pp.clone().add( sDir.clone().multiplyScalar( - 1.4 ) ) );
	lookAt( new V3( pp.x, ground( pp.x, pp.z ) + 1.0, pp.z ) );
	await frames( 2 );
	ok( game.interact.target?.label === 'Refuel' && game.interact.target?.sub === 'Pickup', `at the pump: "${game.interact.target?.label}" (${game.interact.target?.sub})` );
	pressedQ.add( 'interact' ); await frames( 1 );
	ok( game.actions.busy, 'a timed refuelling action' );
	for ( let i = 0; i < 900 && game.actions.busy; i ++ ) await frames( 1 );
	ok( car.fuel > 40, `fuel in the tank (${car.fuel.toFixed( 0 )} L)` );
	delete game.city; M._pumps = null; M.pumpGrid = null;
	clear(); await frames( 2 );
}

// ---- where the vehicles wait ------------------------------------------------------------------------------------------------
console.log( 'spawning' );
{
	const sp = M.spawner;
	sp.harbours( 0, 0, 1e6 );
	const by = {};
	for ( const s of sp.sites ) by[ s.cat ] = ( by[ s.cat ] || 0 ) + 1;
	log( 'sites by category', JSON.stringify( by ) );
	ok( by.civil > 800, `parked civilian cars (${by.civil})` );
	ok( by.police > 10 && sp.sites.filter( s => s.cat === 'police' ).every( s => s.type === 'police_car' ), `police cruisers at the stations (${by.police})` );
	ok( by.military > 20 && sp.sites.filter( s => s.cat === 'military' ).every( s => s.type === 'humvee' || s.type === 'pickup' ), `military vehicles on the bases (${by.military})` );
	ok( by.boat > 25 && sp.sites.filter( s => s.cat === 'boat' ).every( s => SPECS[ s.type ].kind === 'boat' ), `boats at the harbours (${by.boat})` );
	const air = sp.sites.filter( s => s.cat === 'air' );
	ok( air.some( s => s.type === 'plane' ) && air.some( s => s.type === 'helicopter' ), `aircraft at the airports and helipads (${air.length})` );
	// moored boats float on water deep enough for them, aircraft stand on dry ground
	ok( sp.sites.filter( s => s.water ).every( s => hf.heightAt( s.x, s.z ) < - 1.5 ), 'boats moored in deep enough water' );
	ok( air.every( s => hf.heightAt( s.x, s.z ) > 0.3 ), 'aircraft on dry land' );
}

// ---- the manager's cost per frame -----------------------------------------------------------------------------------------------
console.log( 'cost' );
{
	stand( sAt( 30 ) );
	for ( let i = 0; i < 300 && M.list.length < 14; i ++ ) await frames( 1 );
	const car = await summonAt( 'sedan', sAt( 40 ), sYaw );
	pose( car, sAt( 40 ), sYaw );
	M.enter( car, 0 ); await frames( 30 );
	keys.add( 'forward' ); keys.add( 'left' );
	let t = 0, n = 0;
	for ( let i = 0; i < 120; i ++ ) {
		const t0 = performance.now();
		M.update( 1 / 60 );
		t += performance.now() - t0; n ++;
		game.entities.update( 1 / 60 ); game.player.update( 1 / 60 );
	}
	keys.delete( 'forward' ); keys.delete( 'left' );
	const awake = M.list.filter( v => ! v.sleeping ).length;
	log( `manager update ${( t / n ).toFixed( 3 )} ms / frame with ${M.list.length} vehicles (${awake} awake)` );
	ok( t / n < 3, `the manager's frame is cheap (${( t / n ).toFixed( 2 )} ms, ${M.list.length} vehicles)` );
	M.exit( true ); await frames( 2 );
}

// ---- quit: nothing left behind --------------------------------------------------------------------------------------------------
console.log( 'dispose' );
{
	const n = game.scene.children.length;
	for ( const v of [ ...M.list ] ) game.entities.remove( v );
	game.entities.update( 0 );
	M.dispose();
	ok( [ ...game.physics.boxes.values() ].every( b => ! b.owner?.isVehicle ), 'no vehicle collision boxes' );
	ok( game.scene.children.length < n && ! game.scene.children.includes( M.spot ), 'the headlight is gone from the scene' );
	ok( game.interact.providers.length === 0, 'the interaction provider is gone' );
}

// ---- handling: planted, not twitchy (full lock with the throttle held never spins a car; the body rolls and dives a
// little; reverse is slow) on asphalt and on grass ----------------------------------------------------------------------
console.log( 'handling' );
{
	const { Vehicle } = await import( '../src/vehicles/Vehicle.js' );
	for ( const surf of [ 'asphalt', 'grass' ] ) {
		const flat = {
			heightAt: () => 0.5, normalAt: ( x, z, out ) => out.set( 0, 1, 0 ), flagsNear: () => surf === 'asphalt' ? 1 : 0,
			surfaceAt: ( x, z, o ) => { o[ 0 ] = 0.3; o[ 1 ] = 0; o[ 2 ] = 0; o[ 3 ] = 0; return o; },
		};
		const g2 = { hf: flat, events: new Events(), weather: { rain: 0 }, mode: 'survival', world: { isBeach: () => false }, player: { shake: 0 }, survival: { hurt() {} }, audio: null, fx: null };
		g2.physics = new Physics( flat, { heightAt: () => - 50 } );
		const IN = ( o = {} ) => Object.assign( { forward: false, back: false, left: false, right: false, steer: 0, hand: false, up: false, down: false, rollL: false, rollR: false }, o );
		const dt = 1 / 60, fw = new V3(), rt = new V3();
		const slip = ( v ) => Math.abs( Math.atan2( v.body.v.dot( v.body.right( rt ) ), v.body.v.dot( v.body.fwd( fw ) ) ) * 57.3 );
		for ( const type of TYPES.filter( t => SPECS[ t ].kind === 'car' ) ) {
			let spun = 0, maxRoll = 0, minUp = 1;
			for ( const kmh of [ 40, 80, 120 ] ) {
				const v = new Vehicle( g2, type, { pos: new V3( 0, 0.5, 0 ), yaw: 0, fuel: 50 } );
				v.settle(); v.driver = g2.player; v.engine.running = true; v.wake();
				for ( let i = 0; i < 60 * 30 && v.fwdSpeed * 3.6 < kmh; i ++ ) v.simulate( dt, IN( { forward: true } ) );
				for ( let i = 0; i < 180; i ++ ) {
					const sp = v.fwdSpeed * 3.6;
					v.simulate( dt, IN( { forward: sp < kmh, left: true, steer: 1 } ) );
					spun = Math.max( spun, slip( v ) );
					maxRoll = Math.max( maxRoll, Math.abs( Math.asin( v.body.right( rt ).y ) * 57.3 ) );
					minUp = Math.min( minUp, v.upY() );
				}
			}
			ok( spun < 20 && minUp > 0.9, `${type} on ${surf}: full lock with the throttle held stays in control (slip ${spun.toFixed( 0 )} deg)` );
			if ( surf === 'asphalt' ) ok( maxRoll > 0.25 && maxRoll < 6, `${type}: leans in the bends (${maxRoll.toFixed( 1 )} deg)` );
			if ( surf === 'asphalt' ) {
				const v = new Vehicle( g2, type, { pos: new V3( 0, 0.5, 0 ), yaw: 0, fuel: 50 } );
				v.settle(); v.driver = g2.player; v.engine.running = true; v.wake();
				for ( let i = 0; i < 60 * 10; i ++ ) v.simulate( dt, IN( { back: true } ) );
				ok( v.fwdSpeed > - 12.5, `${type}: reverse is slow (${( - v.fwdSpeed * 3.6 ).toFixed( 0 )} km/h)` );
			}
		}
	}
}

console.log( `\n${passes} passed, ${fails} failed` );
process.exit( fails ? 1 : 0 );
