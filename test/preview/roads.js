// Standalone preview of the roads module: the world (terrain, sky, ocean) + game.roads only, no other modules.
// /test/preview/roads.html?at=X,Z&yaw=DEG&pitch=DEG&h=M&hour=H&wet=0..1&frames=N&look=X,Y,Z
import * as THREE from 'three';
import { Settings } from '../../src/core/Settings.js';
import { Renderer } from '../../src/render/Renderer.js';
import { World } from '../../src/game/World.js';
import { Physics } from '../../src/game/Physics.js';
import { G } from '../../src/render/Materials.js';
import { install } from '../../src/city/Roads.js';
import { LightPool } from '../../src/game/items/LightPool.js';

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

// gallery: every prop type and every car body in rows on a flat spot, injected as a fake near cell
window.__gallery = ( gx, gz ) => {
	const R = game.roads, hf = world.hf;
	const props = [], cars = [], signs = [], decals = [];
	const types = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33 ];
	types.forEach( ( t, i ) => {
		const x = gx + ( i % 8 ) * 7, z = gz + Math.floor( i / 8 ) * 9;
		props.push( t, x - gx, hf.heightAt( x, z ), z - gz, 0, t === 25 ? 5 : 1, 0, t === 0 || t === 1 ? 1 : 0 );
	} );
	for ( let t = 0; t < 9; t ++ ) {
		const x = gx + t * 7 - 2, z = gz + 40;
		const flags = [ 0, 1 | 16, 2 | 64, 128, 1 | 2 | 4 | 8, 16 | 32, 256 | 1024, 0, 0 ][ t ];
		cars.push( t, x - gx, hf.heightAt( x, z ), z - gz, 0.5, 0, 0, t === 5 ? 20 : t >= 6 ? 16 : t * 2, t * 0.12, 0, flags | 8192, t * 777 );
		const z2 = gz + 52;
		cars.push( t, x - gx, hf.heightAt( x, z2 ), z2 - gz, 2.6, 0, 0, t, 0.6, t === 3 || t === 7 ? 0.9 : 0, 128, t * 331 );
	}
	signs.push( 0, 200, 0, hf.heightAt( gx, gz - 6 ) + 2, - 6, 0, 0.76, 0.76, 0, 0 );
	signs.push( 0, 300, 5, hf.heightAt( gx + 5, gz - 6 ) + 1.4, - 6, 0, 1.9, 0.48, 1, 0 );
	signs.push( 0, 3, 10, hf.heightAt( gx + 10, gz - 6 ) + 2.5, - 6, 0, 0.95, 0.2, 1, 0 );
	for ( let k = 0; k < 12; k ++ ) decals.push( k, k * 4, hf.heightAt( gx + k * 4, gz - 12 ) + 0.1, - 12, 0, 3, 3, 1 );
	const r = { lod: 0, ox: gx, oz: gz, props: new Float32Array( props ), cars: new Float32Array( cars ), signs: new Float32Array( signs ), decals: new Float32Array( decals ), boxes: new Float32Array( 0 ), wires: new Float32Array( 0 ) };
	const c = { key: - 1, ci: Math.floor( gx / 320 ), cj: Math.floor( gz / 320 ), lod: - 1, job: null, meshes: [], boxes: [], inst: null, dyn: [], wrecks: [], lamps: [], dist: 0 };
	R.cells.set( - 1, c );
	R._load( c, r );
};

window.__idle = () => ! [ ...game.roads.cells.values() ].some( c => c.job ) && world.pool.busy === 0 && world.terrain.pending === 0;
install( game );
// the items module's shared light pool (the roads module hangs real lights under flickering lamps in it)
game.itemLights = new LightPool( game );
systems.push( { update: ( dt ) => game.itemLights.update( dt ) } );
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
// __budget: -1 renders continuously; >= 0 keeps updating (streaming) but renders only that many more frames. The
// shot script renders a couple of frames per view and waits for the GPU (SwiftShader frames are very slow).
window.__budget = - 1;
window.__synced = 0;
window.__ready = true;
const px = new Uint8Array( 4 );
function loop() {
	requestAnimationFrame( loop );
	const now = performance.now(), dt = Math.min( 0.1, ( now - last ) / 1000 ); last = now;
	world.update( dt );
	G.uWet.value = + ( q.get( 'wet' ) || 0 );
	for ( const s of systems ) s.update( dt );
	if ( window.__budget === 0 ) return;
	if ( window.__budget > 0 ) window.__budget --;
	renderer.render( { scene: world.scene, camera: cam, grade: { exposure: 1.0 + world.sky.night * 1.4, night: world.sky.night, time: world.clock } } );
	const ri = renderer.gl.info.render;
	info.textContent = `calls ${ri.calls} tris ${( ri.triangles / 1e3 ).toFixed( 0 )}k cells ${game.roads.cells.size} boxes ${game.physics.boxes.size}`;
	n ++;
	window.__frames = n;
	if ( window.__budget === 0 ) {
		// block until the GPU has really finished the frame
		const gl = renderer.gl.getContext();
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		gl.readPixels( 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px );
		window.__synced ++;
	}
	if ( frames && n >= frames ) { window.__done = true; window.__budget = 0; }
}
loop();
