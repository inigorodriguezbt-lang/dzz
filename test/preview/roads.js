// Standalone preview of the roads module: the world (terrain, sky, ocean) + game.roads only, no other modules.
// /test/preview/roads.html?at=X,Z&yaw=DEG&pitch=DEG&h=M&hour=H&wet=0..1&frames=N&look=X,Y,Z
import * as THREE from 'three';
import { Settings } from '../../src/core/Settings.js';
import { Renderer } from '../../src/render/Renderer.js';
import { World } from '../../src/game/World.js';
import { Physics } from '../../src/game/Physics.js';
import { G } from '../../src/render/Materials.js';
import { install } from '../../src/city/Roads.js';

const q = new URLSearchParams( location.search );
const info = document.getElementById( 'info' );
const settings = new Settings();
const canvas = document.getElementById( 'view' );
const renderer = new Renderer( canvas, settings );
const world = new World( renderer, settings );
await world.load( ( s, p ) => { info.textContent = s + ' ' + Math.round( p * 100 ) + '%'; } );
const resize = () => { renderer.resize( innerWidth, innerHeight ); world.camera.aspect = innerWidth / innerHeight; if ( q.get( 'fov' ) ) world.camera.fov = + q.get( 'fov' ); world.camera.updateProjectionMatrix(); world.sky.resize( renderer.width, renderer.height ); };
resize(); addEventListener( 'resize', resize );

const [ x, z ] = ( q.get( 'at' ) || '-4390,-10255' ).split( ',' ).map( Number );
const cam = world.camera;
const h = + ( q.get( 'h' ) || 1.7 );
cam.position.set( x, Math.max( world.hf.heightAt( x, z ), 0 ) + h, z );
cam.rotation.set( ( + q.get( 'pitch' ) || 0 ) * Math.PI / 180, ( + q.get( 'yaw' ) || 0 ) * Math.PI / 180, 0, 'YXZ' );
if ( q.get( 'look' ) ) { const [ lx, ly, lz ] = q.get( 'look' ).split( ',' ).map( Number ); cam.lookAt( lx, ly, lz ); }
cam.updateMatrixWorld();
if ( q.get( 'fov' ) ) { cam.fov = + q.get( 'fov' ); cam.updateProjectionMatrix(); }
const hour = + ( q.get( 'hour' ) || 10 );
world.sky.setTime( hour, 120 );

const systems = [];
const game = {
	world, scene: world.scene, camera: cam, hf: world.hf, settings, seed: 1234,
	physics: new Physics( world.hf, world.ocean ),
	interact: { addProvider( fn ) { game._prov = fn; return () => {}; } },
	player: { pos: cam.position.clone().setY( cam.position.y - 1.6 ) },
	register( s ) { systems.push( s ); return s; },
	app: { ui: { openContainer( c ) { console.log( 'open', c.label, c.items.length ); } } },
};
window.__game = game;
// jump the camera (used by test/roads-shots.mjs): x, z, height above ground, yaw, pitch, fov, hour, wet
window.__view = ( x, z, h = 1.7, yaw = 0, pitch = 0, fov = 0, hr = 10, wet = 0 ) => {
	cam.position.set( x, Math.max( world.hf.heightAt( x, z ), 0 ) + h, z );
	cam.rotation.set( pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ' );
	if ( fov ) { cam.fov = fov; cam.updateProjectionMatrix(); }
	cam.updateMatrixWorld();
	world.sky.setTime( hr, 120 );
	q.set( 'wet', wet );
	game.player.pos.set( cam.position.x, cam.position.y - 1.6, cam.position.z );
};
window.__idle = () => ! [ ...game.roads.cells.values() ].some( c => c.job ) && world.pool.busy === 0 && world.terrain.pending === 0;
install( game );
await world.warmup( ( s, p ) => { info.textContent = s + ' ' + Math.round( p * 100 ) + '%'; } );
// let the street cells arrive
for ( let i = 0; i < 400; i ++ ) {
	world.update( 0.016 );
	for ( const s of systems ) s.update( 0.016 );
	const pending = [ ...game.roads.cells.values() ].filter( c => c.job ).length;
	info.textContent = 'streets pending ' + pending;
	if ( i > 5 && pending === 0 && world.pool.busy === 0 ) break;
	await new Promise( r => setTimeout( r, 50 ) );
}
G.uWet.value = + ( q.get( 'wet' ) || 0 );
const frames = + ( q.get( 'frames' ) || 0 );
let n = 0, last = performance.now();
window.__ready = true;
function loop() {
	const now = performance.now(), dt = Math.min( 0.1, ( now - last ) / 1000 ); last = now;
	world.update( dt );
	G.uWet.value = + ( q.get( 'wet' ) || 0 );
	for ( const s of systems ) s.update( dt );
	renderer.render( { scene: world.scene, camera: cam, grade: { exposure: 1.0 + world.sky.night * 1.4, night: world.sky.night, time: world.clock } } );
	const ri = renderer.gl.info.render;
	info.textContent = `calls ${ri.calls} tris ${( ri.triangles / 1e3 ).toFixed( 0 )}k cells ${game.roads.cells.size} boxes ${game.physics.boxes.size}`;
	n ++;
	window.__frames = n;
	if ( frames && n >= frames ) { window.__done = true; return; }
	requestAnimationFrame( loop );
}
loop();
