// Creatures preview (dev only, not shipped): the infected, survivors and animals from src/ai in a bare lit
// scene, posed by the same code the game runs. Driven from test/preview/creatures-shot.mjs:
//   await lineup( { ids, clip, t, cam } )          avatars side by side playing a clip
//   await bodies( { list: [ { id, state, t } ], cam } )   HumanBody states (walk, run, attack, crawl, ragdoll…)
//   await animals( { kinds, t, cam } )             procedural animals
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { G } from '../../src/render/Materials.js';
import { CharacterLib, AVATARS, ALOHA } from '../../src/ai/Characters.js';
import { HumanBody } from '../../src/ai/Body.js';
import { animalTemplate, animalInstance } from '../../src/ai/AnimalModels.js';

const q = new URLSearchParams( location.search );
const W = + ( q.get( 'w' ) || 1280 ), H = + ( q.get( 'h' ) || 720 );
const canvas = document.getElementById( 'c' );
const renderer = new THREE.WebGLRenderer( { canvas, antialias: true, preserveDrawingBuffer: true } );
renderer.setSize( W, H, false );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
G.uSkyLUT.value = new THREE.DataTexture( new Uint8Array( [ 160, 190, 225, 255 ] ), 1, 1 ); G.uSkyLUT.value.needsUpdate = true;
G.uFogDensity.value = 0;
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x8fa6bd );
const pm = new THREE.PMREMGenerator( renderer );
scene.environment = pm.fromScene( new RoomEnvironment(), 0.04 ).texture;
scene.environmentIntensity = 0.35;
scene.add( new THREE.HemisphereLight( 0xcfe6ff, 0x5a4a36, 0.9 ) );
const sun = new THREE.DirectionalLight( 0xfff1dc, 2.6 );
sun.position.set( 6, 10, 7 ); sun.castShadow = true;
sun.shadow.mapSize.set( 2048, 2048 );
Object.assign( sun.shadow.camera, { left: - 12, right: 12, top: 12, bottom: - 12, near: 0.5, far: 40 } );
scene.add( sun, sun.target );
G.uSunDir.value.copy( sun.position ).normalize();
const ground = new THREE.Mesh( new THREE.PlaneGeometry( 80, 80 ), new THREE.MeshStandardMaterial( { color: 0x6f6452, roughness: 0.95 } ) );
ground.rotation.x = - Math.PI / 2; ground.receiveShadow = true;
scene.add( ground );
const cam = new THREE.PerspectiveCamera( 35, W / H, 0.05, 200 );
const lib = new CharacterLib( null, { base: '/models/characters/' } );
window.lib = lib;
const live = [];

function clear() {
	for ( const o of live.splice( 0 ) ) { if ( o.release ) o.release(); else o.removeFromParent?.(); }
}
function setCam( c = {} ) {
	const [ yw, pt, d ] = c.orbit || [ 0, 8, 9 ];
	const L = new THREE.Vector3( ...( c.look || [ 0, 1, 0 ] ) );
	const a = yw * Math.PI / 180, b = pt * Math.PI / 180;
	cam.fov = c.fov || 35; cam.updateProjectionMatrix();
	cam.position.set( L.x + Math.sin( a ) * Math.cos( b ) * d, L.y + Math.sin( b ) * d, L.z + Math.cos( a ) * Math.cos( b ) * d );
	cam.lookAt( L );
	G.uCamPos.value.copy( cam.position );
}
function render() {
	scene.updateMatrixWorld();
	renderer.render( scene, cam );
	return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
}

// avatars in a row playing one clip at time t (s)
window.lineup = async ( o = {} ) => {
	clear();
	await lib.ready;
	const ids = o.ids || Object.keys( AVATARS ).slice( 0, 8 );
	const ts = await Promise.all( ids.map( id => lib.load( id ) ) );
	const gap = o.gap || 0.9;
	ts.forEach( ( t, i ) => {
		if ( ! t ) return;
		const inst = lib.acquire( t );
		inst.setLook( {
			infect: o.infect ?? 1, seed: i * 7.3, hue: o.hue ?? 0, dirt: o.dirt ?? 0.55, blood: o.blood ?? 0.35,
			aloha: o.aloha ? ALOHA[ i % ALOHA.length ] : null, skin: o.skin ? new THREE.Color( ...o.skin ) : null,
		} );
		inst.place( new THREE.Vector3( ( i - ( ts.length - 1 ) / 2 ) * gap, 0, 0 ), ( o.yaw || 0 ) * Math.PI / 180 );
		scene.add( inst.root );
		const rig = inst.rig;
		rig.clearOverlays();
		rig.begin();
		const clip = lib.bank.get( o.clip || 'idle' );
		rig.add( clip, ( o.t || 0 ) + i * 0.37, 1 );
		rig.end();
		live.push( { release: () => lib.release( inst ) } );
	} );
	setCam( o.cam || { orbit: [ 0, 6, Math.max( 5, ids.length * gap * 1.5 ) ], look: [ 0, 0.95, 0 ] } );
	return { ...render(), loaded: ts.filter( Boolean ).length };
};

// a flat world for the ragdoll
const flat = {
	ground: ( x, z ) => ( { y: 0, box: null } ), resolveCylinder: () => false, near: () => [], raycastBoxes: () => null,
};

// HumanBody states side by side: list [ { id, state, t, speed, style, yaw } ]
window.bodies = async ( o = {} ) => {
	clear();
	await lib.ready;
	const list = o.list;
	const ts = await Promise.all( list.map( e => lib.load( e.id ) ) );
	const gap = o.gap || 1.2;
	const out = [];
	list.forEach( ( e, i ) => {
		const t = ts[ i ];
		if ( ! t ) return;
		const inst = lib.acquire( t );
		inst.scale = e.scale || 1;
		inst.setLook( { infect: 1, seed: i * 5.1, dirt: 0.6, blood: e.blood ?? 0.5, aloha: e.aloha != null ? ALOHA[ e.aloha ] : null, skin: new THREE.Color( 0.62, 0.66, 0.55 ) } );
		scene.add( inst.root );
		const body = new HumanBody( inst, Object.assign( { idle: 'idle_drunk', walk: 'walk_drunk', run: 'run_injured', hunch: 0.3, tilt: 0.15, twitch: 0 }, e.style || {} ) );
		const yaw = ( e.yaw ?? 0 ) * Math.PI / 180;
		const pos = new THREE.Vector3( ( i - ( list.length - 1 ) / 2 ) * gap, 0, e.z || 0 );
		body.yaw = yaw;
		const place = () => {
			if ( body.mode === 'crawl' ) {
				const fx = - Math.sin( yaw ), fz = - Math.cos( yaw );
				inst.place( new THREE.Vector3( pos.x - fx * 0.95, 0.13, pos.z - fz * 0.95 ), yaw, body.tiltQuat( Math.PI / 2, 1, new THREE.Quaternion() ) );
			} else if ( body.mode === 'rise' || body.mode === 'lying' ) inst.place( pos, body.yaw, body.tiltQuat( body.mode === 'lying' ? Math.PI / 2 : body.tiltAngle, body.riseFace, new THREE.Quaternion() ) );
			else if ( body.mode !== 'ragdoll' ) inst.place( pos, body.yaw );
		};
		const st = e.state || 'idle';
		body.speed = e.speed ?? ( st === 'walk' ? 0.8 : st === 'run' ? 3.2 : st === 'crawl' ? 0.4 : 0 );
		if ( st === 'crawl' ) body.mode = 'crawl';
		if ( st === 'lying' ) { body.mode = 'lying'; body.riseFace = e.face || 1; }
		if ( st === 'reach' ) { body.reachW = 1; body.aggro = 1; }
		if ( [ 'swipeL', 'swipeR', 'bite', 'bash', 'eat' ].includes( st ) ) { body.aggro = 1; body.act( st, st === 'bash' || st === 'eat' ? 100 : st === 'bite' ? 1.15 : 0.95 ); }
		const T = e.t ?? 1;
		const h = 1 / 30;
		place();
		body.update( h );
		inst.updateWorld();
		if ( st === 'ragdoll' || st === 'rise' ) {
			const dir = new THREE.Vector3( ...( e.dir || [ 0, 0, 1 ] ) ).normalize();
			body.ragdoll( flat, new THREE.Vector3(), { point: new THREE.Vector3( pos.x, 1.3, pos.z ), dir, strength: e.strength ?? 3 } );
			for ( let k = 0; k < ( e.rag ?? 3 ) * 60; k ++ ) body.update( 1 / 60 );
			if ( st === 'rise' ) {
				const feet = body.feetCentre( new THREE.Vector3() ); feet.y = 0;
				pos.copy( feet );
				body.riseFromRagdoll( feet );
				for ( let k = 0; k < T * 30; k ++ ) { body.update( h ); place(); }
			}
		} else {
			for ( let k = 0; k < T * 30; k ++ ) { body.update( h ); place(); }
		}
		inst.updateWorld();
		// capsule check: a ray from the camera side through the chest
		const hit = body.hitTest( new THREE.Vector3( pos.x, 1.3, 5 ), new THREE.Vector3( 0, 0, - 1 ), 20 );
		out.push( { id: e.id, st, mode: body.mode, asleep: body.asleep, mv: body.rag?.lastMove, calm: body.rag?.calm, hit: hit && hit.zone } );
		live.push( { release: () => lib.release( inst ) } );
	} );
	setCam( o.cam || { orbit: [ 20, 12, Math.max( 5, list.length * gap * 1.3 ) ], look: [ 0, 0.8, 0 ] } );
	return { ...render(), out };
};

// procedural animals in a row: list [ { species, male, hereford, coat, yaw } ]
window.animals = async ( o = {} ) => {
	clear();
	const list = o.list || [ { species: 'boar' }, { species: 'goat' }, { species: 'deer', male: true }, { species: 'cow' }, { species: 'chicken', male: true }, { species: 'nene' }, { species: 'turtle' }, { species: 'shark' } ];
	let x = 0;
	const out = [];
	const gap = o.gap || 0.6;
	const sizes = list.map( e => animalTemplate( e.species, e ).bound.radius * 2 );
	const total = sizes.reduce( ( a, b ) => a + b + gap, 0 );
	x = - total / 2;
	list.forEach( ( e, i ) => {
		const t = animalTemplate( e.species, e );
		const a = animalInstance( t );
		x += sizes[ i ] / 2;
		a.mesh.position.set( x, e.species === 'shark' ? 0.5 : 0, 0 );
		a.mesh.rotation.y = ( e.yaw ?? 90 ) * Math.PI / 180;
		x += sizes[ i ] / 2 + gap;
		scene.add( a.mesh );
		out.push( { s: e.species, verts: t.geo.attributes.position.count, tris: t.geo.index.count / 3, bones: t.bones.length } );
		live.push( a.mesh );
	} );
	setCam( o.cam || { orbit: [ 10, 10, total * 1.05 ], look: [ 0, 0.5, 0 ] } );
	return { ...render(), out };
};

window.__ready = true;
