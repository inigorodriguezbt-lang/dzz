// Creatures simulation harness (dev only, not shipped): the real src/ai module installed on a small stand-in
// game (flat ground, a few walls and a door, real Physics / EntityManager / Events / Ballistics, stubbed
// survival, UI, audio and FX), so the AI can be stepped and inspected in seconds instead of booting the world.
// Driven by test/preview/creatures-sim.mjs:  window.reset( opts ), step( sec ), shot(), and the scenario helpers.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { G } from '../../src/render/Materials.js';
import { Events } from '../../src/core/Events.js';
import { Physics } from '../../src/game/Physics.js';
import { EntityManager } from '../../src/game/Entities.js';
import { Ballistics, hitEntity } from '../../src/weapons/Ballistics.js';
import '../../src/game/items/defs/index.js';
import { install } from '../../src/ai/Creatures.js';

const q = new URLSearchParams( location.search );
const W = + ( q.get( 'w' ) || 1280 ), H = + ( q.get( 'h' ) || 720 );
const canvas = document.getElementById( 'c' );
const renderer = new THREE.WebGLRenderer( { canvas, antialias: true, preserveDrawingBuffer: true } );
renderer.setSize( W, H, false );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
G.uSkyLUT.value = new THREE.DataTexture( new Uint8Array( [ 160, 190, 225, 255 ] ), 1, 1 ); G.uSkyLUT.value.needsUpdate = true;
G.uFogDensity.value = 0;
const GROUND = 0.5;
const noop = new Proxy( {}, { get: () => () => null } );

// flat land at y = 0.5 with the height-field API the module uses
const hf = {
	heightAt: () => GROUND, baseHeight: () => GROUND, normalAt: ( x, z, out = new THREE.Vector3() ) => out.set( 0, 1, 0 ),
	surfaceAt: ( x, z, out = [ 0, 0, 0, 0 ] ) => { out[ 0 ] = 0.6; out[ 1 ] = 0; out[ 2 ] = 0; out[ 3 ] = 0; return out; },
	flagsNear: () => 32 | 16 | 4, islandAt: () => 3,
	raycast( ox, oy, oz, dx, dy, dz, maxT ) { if ( dy >= - 1e-9 ) return - 1; const t = ( oy - GROUND ) / - dy; return t >= 0 && t <= maxT ? t : - 1; },
};

let game = null, scene = null, cam = null, log = [];

function makeGame( o = {} ) {
	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x8fa6bd );
	const pm = new THREE.PMREMGenerator( renderer );
	scene.environment = pm.fromScene( new RoomEnvironment(), 0.04 ).texture;
	scene.environmentIntensity = 0.35;
	scene.add( new THREE.HemisphereLight( 0xcfe6ff, 0x5a4a36, 0.9 ) );
	const sun = new THREE.DirectionalLight( 0xfff1dc, 2.6 );
	sun.position.set( 20, 30, 14 ); sun.castShadow = true;
	sun.shadow.mapSize.set( 2048, 2048 );
	Object.assign( sun.shadow.camera, { left: - 30, right: 30, top: 30, bottom: - 30, near: 1, far: 100 } );
	scene.add( sun, sun.target );
	G.uSunDir.value.copy( sun.position ).normalize();
	const ground = new THREE.Mesh( new THREE.PlaneGeometry( 400, 400 ), new THREE.MeshStandardMaterial( { color: 0x6f6452, roughness: 0.95 } ) );
	ground.rotation.x = - Math.PI / 2; ground.position.y = GROUND; ground.receiveShadow = true;
	scene.add( ground );
	cam = new THREE.PerspectiveCamera( 70, W / H, 0.05, 500 );
	log = [];
	const g = {
		mode: o.mode || 'survival', difficulty: o.difficulty || 'normal', time: { hours: o.hour ?? 10, dayMinutes: 48 },
		get hour() { return this.time.hours % 24; }, systems: [], scene, camera: cam, hf, save: { world: {} },
		settings: { get: ( k ) => ( { quality: o.quality || 'high' } )[ k ] },
		events: new Events(), audio: { play: ( n, op ) => { if ( n.startsWith( 'z_' ) || n === 'death' ) log.push( [ 'snd', n ] ); return null; }, buffers: new Map(), ctx: null },
		fx: noop, toast: ( t ) => log.push( [ 'toast', t ] ),
		world: { meta: o.meta || META, sky: { night: o.night || 0 }, isIndoors: () => false, isBeach: () => false },
		register( s ) { this.systems.push( s ); return s; },
		interact: { providers: [], addProvider( fn ) { this.providers.push( fn ); return () => {}; } },
		actions: { start: ( a ) => { log.push( [ 'action', a.label ] ); a.onDone?.(); return a; }, busy: false },
		app: { ui: { openContainer: ( c ) => { log.push( [ 'container', c.label, c.items.map( s => s.id + 'x' + s.qty ) ] ); game.lastContainer = c; } } },
		items3d: { spawn: ( st ) => { log.push( [ 'item', st.id, st.qty ] ); } },
		dropStack: ( st ) => log.push( [ 'drop', st.id ] ),
		survival: { hurt: ( a, kind, info ) => log.push( [ 'hurt', kind, + a.toFixed( 1 ), info.cause ] ) },
		city: { doorAt: ( p ) => game._door && game._door.box && Math.hypot( p.x - game._door.box.x, p.z - game._door.box.z ) < 2 ? game._door : null },
	};
	g.world.scene = scene;
	g.physics = new Physics( hf, null );
	g.entities = new EntityManager( g );
	g.player = {
		pos: new THREE.Vector3( 0, GROUND, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stance: 'stand', speedNow: 0, sprinting: false, alive: true,
		vehicle: null, swimming: false, height: 1.8, inventory: { hasTool: () => true, find: () => null },
		get eye() { return this.pos.y + 1.66; },
		lookDir( out = new THREE.Vector3() ) { return out.set( - Math.sin( this.yaw ) * Math.cos( this.pitch ), Math.sin( this.pitch ), - Math.cos( this.yaw ) * Math.cos( this.pitch ) ); },
	};
	g.ballistics = new Ballistics( g );
	g.register( g.ballistics );
	g.events.on( 'kill', ( e ) => log.push( [ 'kill', e.target?.type, e.target?.kind || e.target?.species, e.source === g.player ? 'player' : e.source?.type || String( e.source ) ] ) );
	game = g;
	window.game = g;
	// walls: a long wall east-west, a box building with a door gap and a door
	for ( const w of o.walls || [] ) g.physics.add( { x: w[ 0 ], y: GROUND + 1.5, z: w[ 1 ], hx: w[ 2 ], hy: 1.5, hz: w[ 3 ], yaw: w[ 4 ] || 0, mat: 'concrete' } );
	for ( const w of o.walls || [] ) {
		const m = new THREE.Mesh( new THREE.BoxGeometry( w[ 2 ] * 2, 3, w[ 3 ] * 2 ), new THREE.MeshStandardMaterial( { color: 0xb0a898 } ) );
		m.position.set( w[ 0 ], GROUND + 1.5, w[ 1 ] ); m.rotation.y = w[ 4 ] || 0; m.castShadow = m.receiveShadow = true; scene.add( m );
	}
	if ( o.door ) {
		const [ x, z, hx, hz ] = o.door;
		const box = g.physics.add( { x, y: GROUND + 1.05, z, hx, hy: 1.05, hz, yaw: 0, mat: 'wood', kind: 'door' } );
		const m = new THREE.Mesh( new THREE.BoxGeometry( hx * 2, 2.1, hz * 2 ), new THREE.MeshStandardMaterial( { color: 0x7a4a2a } ) );
		m.position.set( x, GROUND + 1.05, z ); scene.add( m );
		g._door = { box, hp: o.doorHp ?? 60, mesh: m, bash( a ) { this.hp -= a; log.push( [ 'bash', + a.toFixed( 1 ), + this.hp.toFixed( 1 ) ] ); if ( this.hp <= 0 && this.box ) { g.physics.remove( this.box ); this.box = null; m.visible = false; log.push( [ 'door broken' ] ); } } };
	}
	install( g );
	if ( o.noPopulate ) { g.creatures._populate = () => {}; g.creatures.animals.update = () => {}; g.creatures.bandits.update = () => {}; }
	return g;
}

// a small town for the population model: buildings around the origin
const META = { cities: [ { name: 'Test', id: 'test', kind: 'town', x: 0, z: 0, radius: 400 } ], roads: [], streets: [], runways: [],
	buildings: { fields: [ 'x', 'z', 'w', 'd', 'angle', 'base', 'lo', 'type', 'floors', 'city', 'style' ], data: [] } };
for ( let i = - 8; i <= 8; i ++ ) for ( let j = - 8; j <= 8; j ++ ) if ( Math.abs( i ) + Math.abs( j ) > 1 ) META.buildings.data.push( i * 40, j * 40, 12, 10, 0, 0.5, 0.5, ( i * 7 + j * 3 ) % 5 === 0 ? 17 : 2, 2, 0, 0 );

window.reset = async ( o = {} ) => {
	if ( game ) { for ( const s of game.systems ) s.dispose?.(); for ( const e of game.entities.list ) e.dispose(); }
	makeGame( o );
	await game.creatures.lib.ready;
	// the everyday avatars (the game warms the same cache)
	await Promise.all( ( o.avatars || [ 'm_casual2', 'f_casual2', 'm_tourist1', 'm_casual1' ] ).map( id => game.creatures.lib.load( id ) ) );
	return { ok: true };
};

window.step = async ( sec, dt = 1 / 30, each = null ) => {
	const g = game, n = Math.ceil( sec / dt );
	for ( let i = 0; i < n; i ++ ) {
		const p = g.player;
		cam.position.set( p.pos.x, p.eye, p.pos.z );
		cam.rotation.set( p.pitch, p.yaw, 0, 'YXZ' );
		cam.updateMatrixWorld();
		g.time.hours += dt / ( 48 * 60 ) * 24;
		for ( const s of g.systems ) s.update?.( dt );
		g.entities.update( dt );
		scene.updateMatrixWorld();
		if ( each ) each( i * dt );
		if ( i % 30 === 29 ) await new Promise( r => setTimeout( r, 0 ) );
	}
};

// render from the player's eyes or an orbit camera { orbit: [ yawDeg, pitchDeg, dist ], look: [ x, y, z ] }
window.shot = ( c = null ) => {
	const p = game.player;
	if ( c ) {
		const [ yw, pt, d ] = c.orbit; const L = new THREE.Vector3( ...c.look );
		const a = yw * Math.PI / 180, b = pt * Math.PI / 180;
		cam.position.set( L.x + Math.sin( a ) * Math.cos( b ) * d, L.y + Math.sin( b ) * d, L.z + Math.cos( a ) * Math.cos( b ) * d );
		cam.lookAt( L );
	} else { cam.position.set( p.pos.x, p.eye, p.pos.z ); cam.rotation.set( p.pitch, p.yaw, 0, 'YXZ' ); }
	cam.updateMatrixWorld();
	G.uCamPos.value.copy( cam.position );
	scene.updateMatrixWorld();
	// (lavapipe drops some freshly re-skinned characters from a render: a few renders make the shot reliable)
	for ( let i = 0; i < 3; i ++ ) renderer.render( scene, cam );
	return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
};

// a point in front of the player
window.ahead = ( d, side = 0 ) => {
	const p = game.player, fx = - Math.sin( p.yaw ), fz = - Math.cos( p.yaw );
	return new THREE.Vector3( p.pos.x + fx * d + fz * side, GROUND, p.pos.z + fz * d - fx * side );
};

// the player fires: a ray from the eyes at a world point, through the real ballistics
window.fireAt = ( target, weapon = 'm4a1' ) => {
	const p = game.player, o = new THREE.Vector3( p.pos.x, p.eye, p.pos.z );
	const d = target.clone().sub( o ).normalize();
	game.ballistics.fire( o, d, { weapon, source: p } );
};
window.hit = ( e, amount, info ) => hitEntity( game, e, amount, { source: game.player, dir: new THREE.Vector3( 0, 0, - 1 ), ...info } );
window.log = () => log;
window.clearLog = () => { log.length = 0; };
window.interactAt = ( maxT = 4 ) => {
	const p = game.player, ray = { origin: new THREE.Vector3( p.pos.x, p.eye, p.pos.z ), dir: p.lookDir( new THREE.Vector3() ) };
	const out = [];
	for ( const fn of game.interact.providers ) for ( const c of fn( ray, maxT ) || [] ) out.push( c );
	out.sort( ( a, b ) => a.t - b.t );
	return out;
};
window.lookAt = ( v ) => {
	const p = game.player, dx = v.x - p.pos.x, dy = v.y - p.eye, dz = v.z - p.pos.z;
	p.yaw = Math.atan2( - dx, - dz ); p.pitch = Math.atan2( dy, Math.hypot( dx, dz ) );
};
window.THREE = THREE;
window.__ready = true;
