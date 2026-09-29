// Vegetation on the real islands without the rest of the game (not shipped): the game's Renderer,
// World (terrain, sky, ocean, workers) and the Vegetation module on a mocked Game, so a view boots in
// seconds instead of minutes.
//   /test/preview/vegworld.html?at=x,z | label=Mauna Kea  &h=eye height (m) | y=absolute
//     &yaw=deg&pitch=deg&hour=10&veg=high&rd=1400&grass=1&wind=0.45&frames=N&settle=N
// window.__ready once the cells around the camera are in, window.__done after `frames` more frames,
// window.__grab() renders a frame and returns it as a PNG data URL (see vegshot.mjs).
import * as THREE from 'three';
import { Settings } from '../../src/core/Settings.js';
import { Renderer } from '../../src/render/Renderer.js';
import { World } from '../../src/game/World.js';
import { install } from '../../src/world/Vegetation.js';

const q = new URLSearchParams( location.search );
const info = document.getElementById( 'info' );
const settings = new Settings();
const setq = ( k, key, conv = ( v ) => v ) => { if ( q.has( k ) ) settings.set( key, conv( q.get( k ) ), false ); };
setq( 'veg', 'vegetation' );
setq( 'rd', 'renderDistance', Number );
setq( 'grass', 'grass', ( v ) => v !== '0' );
setq( 'shadows', 'shadows' );
setq( 'aa', 'antialias' );
setq( 'fov', 'fov', Number );

const canvas = document.getElementById( 'view' );
const renderer = new Renderer( canvas, settings );
const world = new World( renderer, settings );
await world.load( ( s, p ) => { info.textContent = `${s} ${( p * 100 ) | 0}%`; } );
const cam = world.camera;
function resize() {
	renderer.resize( innerWidth, innerHeight );
	world.sky.resize( renderer.width, renderer.height );
	cam.aspect = innerWidth / innerHeight;
	cam.fov = settings.get( 'fov' ) * 0.75;
	cam.updateProjectionMatrix();
}
resize();
addEventListener( 'resize', resize );

let x = 0, z = 0;
if ( q.get( 'label' ) ) {
	const l = world.meta.labels.find( ( l ) => l.name === q.get( 'label' ) );
	if ( l ) { x = l.x; z = l.z; }
}
if ( q.get( 'at' ) ) [ x, z ] = q.get( 'at' ).split( ',' ).map( Number );
const ground = world.hf.heightAt( x, z );
const eyeY = q.has( 'y' ) ? + q.get( 'y' ) : Math.max( ground, 0 ) + + ( q.get( 'h' ) || 1.7 );
cam.position.set( x, eyeY, z );
cam.rotation.set( + ( q.get( 'pitch' ) || 0 ) * Math.PI / 180, + ( q.get( 'yaw' ) || 0 ) * Math.PI / 180, 0, 'YXZ' );
cam.updateMatrixWorld();
const hour = + ( q.get( 'hour' ) || 10 );
world.sky.setTime( hour, 120 );

// the parts of Game the vegetation touches
const boxes = new Set();
const game = {
	world, scene: world.scene, camera: cam, hf: world.hf, settings, renderer,
	player: { pos: new THREE.Vector3( x, Math.max( ground, 0 ), z ), inventory: { add: () => 0, changed() {} } },
	physics: {
		add( b ) { boxes.add( b ); return b; }, remove( b ) { boxes.delete( b ); },
		removeOwner( o ) { for ( const b of boxes ) if ( b.owner === o ) boxes.delete( b ); },
		ground( gx, gz ) { return { y: world.hf.heightAt( gx, gz ) }; },
	},
	weather: { wind: + ( q.get( 'wind' ) ?? 0.45 ) },
	time: { hours: hour },
	systems: [],
	register( s ) { this.systems.push( s ); },
	toast() {},
};
const t0 = performance.now();
const veg = install( game );
const installMs = performance.now() - t0;
window.__veg = veg;
window.__world = world;
window.__game = game;
window.__boxes = boxes;

await world.warmup( () => {} );

let last = performance.now(), frames = 0, settled = 0, readyAt = - 1;
const maxFrames = + ( q.get( 'frames' ) || 0 );
const settle = + ( q.get( 'settle' ) || 3 );
function frame( dt ) {
	veg.update( dt );
	world.update( dt );
	renderer.render( { scene: world.scene, camera: cam, viewScene: null, grade: { exposure: 1.0 + world.sky.night * 1.4, night: world.sky.night, time: world.clock } } );
}
window.__grab = () => { frame( 0.016 ); return canvas.toDataURL( 'image/png' ); };
function loop() {
	const now = performance.now(), dt = Math.min( 0.1, ( now - last ) / 1000 );
	last = now;
	frame( dt );
	frames ++;
	const busy = world.pool.busy + veg.inFlight + world.terrain.pending;
	if ( readyAt < 0 ) {
		settled = busy === 0 ? settled + 1 : 0;
		if ( settled >= settle ) { readyAt = frames; window.__ready = true; }
	}
	const r = renderer.gl.info.render, s = veg.stats;
	info.textContent = `install ${installMs.toFixed( 0 )} ms  bake ${veg.impostors.bakeMs?.toFixed( 0 )} ms  calls ${r.calls}  tris ${( r.triangles / 1000 ) | 0}k\n` +
		`cells ${veg.cells.size}  near ${s.near} mid ${s.mid} far ${s.far} grass ${s.grass}  refill ${s.rebuildMs.toFixed( 1 )} ms  colliders ${boxes.size}`;
	window.__frames = frames;
	if ( readyAt >= 0 && maxFrames && frames - readyAt >= maxFrames ) { window.__done = true; return; }
	requestAnimationFrame( loop );
}
loop();
