import * as THREE from 'three';
import { Settings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { Renderer } from './render/Renderer.js';
import { World } from './game/World.js';

const loader = document.getElementById( 'loader' );
const status = ( s, p ) => {
	loader.querySelector( '.loader-status' ).textContent = s;
	loader.querySelector( '.loader-pct' ).textContent = Math.round( p * 100 ) + '%';
	loader.querySelector( '.loader-fill' ).style.transform = `scaleX(${Math.max( 0.02, p )})`;
};

async function boot() {
	const settings = new Settings();
	const canvas = document.getElementById( 'view' );
	const renderer = new Renderer( canvas, settings );
	const input = new Input( canvas, settings );
	const world = new World( renderer, settings );
	await world.load( status );
	const q = new URLSearchParams( location.search );
	const cam = world.camera;
	const [ x, z ] = ( q.get( 'at' ) || '4600,-2000' ).split( ',' ).map( Number );
	cam.position.set( x, world.hf.heightAt( x, z ) + + ( q.get( 'h' ) || 2 ), z );
	let yaw = + ( q.get( 'yaw' ) || 0 ) * Math.PI / 180, pitch = + ( q.get( 'pitch' ) || 0 ) * Math.PI / 180;
	world.sky.setTime( + ( q.get( 'hour' ) || 9 ), 120 );
	const resize = () => {
		renderer.resize( innerWidth, innerHeight );
		cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
		world.sky.resize( renderer.width, renderer.height );
	};
	resize();
	addEventListener( 'resize', resize );
	cam.rotation.order = 'YXZ';
	cam.rotation.set( pitch, yaw, 0 );
	cam.updateMatrixWorld();
	await world.warmup( status );
	loader.classList.add( 'tw-hidden' );
	canvas.addEventListener( 'click', () => input.lock() );
	let last = performance.now();
	const maxFrames = + ( q.get( 'frames' ) || 0 );
	const tick = () => {
		const now = performance.now();
		const dt = Math.min( 0.1, ( now - last ) / 1000 ); last = now;
		const [ mx, my ] = input.consumeMouse();
		yaw -= mx; pitch = Math.max( - 1.5, Math.min( 1.5, pitch - my ) );
		cam.rotation.set( pitch, yaw, 0 );
		const sp = input.is( 'sprint' ) ? 120 : 20;
		const f = new THREE.Vector3( - Math.sin( yaw ), 0, - Math.cos( yaw ) ), r = new THREE.Vector3( Math.cos( yaw ), 0, - Math.sin( yaw ) );
		if ( input.is( 'forward' ) ) cam.position.addScaledVector( f, sp * dt );
		if ( input.is( 'back' ) ) cam.position.addScaledVector( f, - sp * dt );
		if ( input.is( 'left' ) ) cam.position.addScaledVector( r, - sp * dt );
		if ( input.is( 'right' ) ) cam.position.addScaledVector( r, sp * dt );
		if ( input.is( 'jump' ) ) cam.position.y += sp * dt;
		if ( input.is( 'crouch' ) ) cam.position.y -= sp * dt;
		cam.updateMatrixWorld();
		world.update( dt );
		renderer.render( { scene: world.scene, camera: cam } );
		input.endFrame();
		window.__frames = ( window.__frames || 0 ) + 1;
		if ( maxFrames && window.__frames >= maxFrames ) { window.__done = true; return; }
		requestAnimationFrame( tick );
	};
	window.__world = world;
	window.__ready = true;
	requestAnimationFrame( tick );
}

boot().catch( e => {
	console.error( e );
	loader.classList.add( 'tw-error' );
	status( 'Failed to start: ' + e.message, 1 );
} );
