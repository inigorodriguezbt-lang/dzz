// Weapons preview (dev only, not shipped): the real Hands / ViewModel / FX / Ballistics running against a tiny
// fake game (flat ground, a wall, a few target dummies) so the view model, reloads, optics and effects can be
// posed and screenshotted without booting the island.
//   /test/preview/weapons.html?item=m4a1&att=optic_holo,supp_rifle&ads=1&act=reload_mag&t=0.4
//   window.pose( { item, att, ads, sprint, act, t, fire, time, torso, gloves } ) -> renders one frame
import * as THREE from 'three';
import { G } from '../../src/render/Materials.js';
import { Events } from '../../src/core/Events.js';
import { Physics } from '../../src/game/Physics.js';
import { Entity, EntityManager } from '../../src/game/Entities.js';
import { PlayerInventory } from '../../src/game/Inventory.js';
import { Actions } from '../../src/game/Actions.js';
import { makeStack, getItem, defineItems } from '../../src/game/items/ItemDB.js';
import '../../src/game/items/defs/index.js';
import { install } from '../../src/weapons/Hands.js';

const q = new URLSearchParams( location.search );
const W = + ( q.get( 'w' ) || 1280 ), H = + ( q.get( 'h' ) || 720 );
const canvas = document.getElementById( 'c' );
const renderer = new THREE.WebGLRenderer( { canvas, antialias: true } );
renderer.setSize( W, H, false );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.autoClear = false;
renderer.shadowMap.enabled = true;

// ---- a tiny world ----
G.uSkyLUT.value = new THREE.DataTexture( new Uint8Array( [ 150, 180, 215, 255 ] ), 1, 1 ); G.uSkyLUT.value.needsUpdate = true;
G.uSunDir.value.set( 0.4, 0.8, 0.3 ).normalize();
G.uSunColor.value.setRGB( 3, 2.9, 2.7 );
G.uFogDensity.value = 1 / 60000;
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x9fbad0 );
const sun = new THREE.DirectionalLight( 0xfff2e0, 2.6 ); sun.position.set( 20, 40, 15 ); scene.add( sun );
scene.add( new THREE.HemisphereLight( 0xbfd8ff, 0x4a4030, 0.9 ) );
const ground = new THREE.Mesh( new THREE.PlaneGeometry( 400, 400 ), new THREE.MeshStandardMaterial( { color: 0x6d7a55, roughness: 0.95 } ) );
ground.rotation.x = - Math.PI / 2; scene.add( ground );
const wallMat = new THREE.MeshStandardMaterial( { color: 0xb8ada0, roughness: 0.9 } );
const camera = new THREE.PerspectiveCamera( 80, W / H, 0.05, 2000 );
camera.rotation.order = 'YXZ';
const hf = {
	heightAt: () => 0, baseHeight: () => 0, normalAt: ( x, z, out = new THREE.Vector3() ) => out.set( 0, 1, 0 ),
	raycast: ( ox, oy, oz, dx, dy, dz, max ) => ( dy < 0 && oy > 0 && oy / - dy <= max ? oy / - dy : - 1 ),
	flagsNear: () => 0, surfaceAt: () => [ 0.5, 0, 0, 0 ], islandAt: () => 3,
};
const physics = new Physics( hf, null );
// a wall to shoot at, a wooden fence and a window
const addBox = ( x, y, z, hx, hy, hz, mat, color ) => {
	physics.add( { x, y, z, hx, hy, hz, yaw: 0, mat, kind: mat === 'glass' ? 'glass' : 'solid' } );
	const m = new THREE.Mesh( new THREE.BoxGeometry( hx * 2, hy * 2, hz * 2 ), mat === 'glass' ? new THREE.MeshStandardMaterial( { color: 0x8fb8d0, transparent: true, opacity: 0.35 } ) : new THREE.MeshStandardMaterial( { color, roughness: 0.85 } ) );
	m.position.set( x, y, z ); scene.add( m );
};
addBox( 0, 2, - 22, 8, 2, 0.15, 'concrete', 0xb8ada0 );
addBox( - 5, 1, - 12, 2, 1, 0.03, 'wood', 0x8a6a48 );
addBox( 5, 1.5, - 14, 1.2, 1, 0.01, 'glass' );
addBox( 3, 0.6, - 8, 0.8, 0.6, 0.8, 'metal', 0x5a6068 );
void wallMat;

// target dummies
class Dummy extends Entity {
	constructor( game, x, z ) {
		super( game, 'zombie' );
		this.pos.set( x, 0, z );
		this.health = 100;
		this.object = new THREE.Mesh( new THREE.CapsuleGeometry( 0.3, 1.2, 4, 8 ), new THREE.MeshStandardMaterial( { color: 0x6a7a5a } ) );
		this.object.position.set( x, 0.9, z );
	}
	damage( a, info ) { super.damage( a, info ); window.__hits = ( window.__hits || [] ); window.__hits.push( { a: Math.round( a ), zone: info.zone, kind: info.kind } ); }
	die() { this.object.rotation.x = - Math.PI / 2; this.object.position.y = 0.3; }
	stagger() {}
}

// ---- the fake game ----
const settings = { v: { fov: 80, toggleAim: false, sfxVolume: 1, hitMarkers: true, headBob: 1 }, get( k ) { return this.v[ k ]; }, on() { return () => {}; } };
const down = new Set(), pressed = new Set(), released = new Set();
const input = {
	is: ( a ) => down.has( a ), pressed: ( a ) => pressed.has( a ), released: ( a ) => released.has( a ), consumeWheel: () => 0, consumeMouse: () => [ 0, 0 ],
};
const viewScene = new THREE.Scene();
const viewCamera = new THREE.PerspectiveCamera( 57.6, W / H, 0.01, 10 );
viewScene.add( new THREE.HemisphereLight( 0xcfe6ff, 0x3a3326, 1.2 ) );
const viewSun = new THREE.DirectionalLight( 0xffffff, 1.5 ); viewSun.position.set( 2, 4, 1.5 ); viewSun.color.setRGB( 3, 2.9, 2.7 ).multiplyScalar( 0.55 );
viewScene.add( viewSun );
const player = {
	pos: new THREE.Vector3( 0, 0, 0 ), vel: new THREE.Vector3(), yaw: 0, pitch: 0, stance: 'stand', bob: 0, bobAmt: 0, speedNow: 0, onGround: true,
	recoil: new THREE.Vector2(), shake: 0, aimFov: 1, freeLook: { yaw: 0, pitch: 0 }, swimming: false, sprinting: false, vehicle: null, alive: true,
	inventory: new PlayerInventory(), height: 1.8,
	lookDir( out = new THREE.Vector3() ) { const cp = Math.cos( this.pitch ); return out.set( - Math.sin( this.yaw ) * cp, Math.sin( this.pitch ), - Math.cos( this.yaw ) * cp ); },
};
const game = {
	mode: q.get( 'mode' ) || 'survival', scene, camera, viewScene, viewCamera, physics, hf, settings, input, player,
	events: new Events(), time: { hours: 12, dayMinutes: 48 }, systems: [], inputActive: true, dead: false,
	world: { sky: { night: + ( q.get( 'night' ) || 0 ) }, isIndoors: () => false, isBeach: () => false },
	audio: null, renderer: { gl: renderer },
	survival: { stamina: 100, useStamina( n ) { this.stamina = Math.max( 0, this.stamina - n ); }, hurt() {} },
	register( s ) { this.systems.push( s ); return s; },
	toast( t ) { console.log( 'toast:', t ); },
	dropStack() {},
};
game.entities = new EntityManager( game );
game.actions = new Actions( game );
game.interact = { addProvider: () => () => {} };
for ( const [ x, z ] of [ [ - 1.5, - 9 ], [ 1.2, - 16 ], [ 0.2, - 5 ] ] ) game.entities.add( new Dummy( game, x, z ) );
game.entities.update( 0 );
install( game );
const hands = game.hands;
window.game = game;
// the player's clothes: arms pick up the sleeves
const inv = player.inventory;
const put = ( id ) => { const s = makeStack( id ); if ( s ) inv.add( s ); return s; };
put( q.get( 'torso' ) || 'military_combat_shirt' );
if ( q.get( 'gloves' ) ) put( q.get( 'gloves' ) );

function setCamera() {
	camera.position.set( player.pos.x, 1.66, player.pos.z );
	camera.rotation.set( player.pitch, player.yaw, 0, 'YXZ' );
	camera.fov = settings.get( 'fov' ) * player.aimFov;
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld();
	G.uCamPos.value.copy( camera.position );
}

function frame( dt ) {
	game.entities.update( dt );
	setCamera();
	for ( const s of game.systems ) s.update( dt );
	game.actions.update( dt );
	viewCamera.fov = Math.min( 70, settings.get( 'fov' ) * 0.72 ) * hands.viewFov();
	viewCamera.updateProjectionMatrix();
	pressed.clear(); released.clear();
}
function render() {
	renderer.setRenderTarget( null );
	renderer.clear();
	renderer.render( scene, camera );
	renderer.clearDepth();
	renderer.render( viewScene, viewCamera );
}

let current = null;
// o: { item, att: [ ids ], mag, ads, sprint, act, t, time, fire, torso, gloves, steps }
window.pose = ( o = {} ) => {
	window.__hits = [];
	if ( o.item && o.item !== current ) {
		const d = getItem( o.item );
		if ( ! d ) return 'unknown item ' + o.item;
		let st = inv.find( s => s.id === o.item );
		if ( ! st ) { st = makeStack( o.item, d.stack > 1 ? 3 : 1, { full: true } ); inv.add( st ); if ( ! inv.findUid( st.uid ) ) inv.pockets.push( st ); }
		hands.select( st );
		current = o.item;
		// spare ammo and magazines
		if ( d.firearm ) {
			for ( const m of d.firearm.mags || [] ) if ( ! inv.find( s => s.id === m ) ) inv.pockets.push( makeStack( m, 1, { full: true } ) );
			const a = inv.find( ( s, dd ) => dd?.ammo?.caliber === d.firearm.caliber );
			if ( ! a ) for ( const dd of [ ...getAll() ] ) if ( dd.ammo?.caliber === d.firearm.caliber ) { inv.pockets.push( makeStack( dd.id, dd.stack ) ); break; }
		}
		for ( let i = 0; i < 40; i ++ ) frame( 1 / 60 );
	}
	// clothes on the arms: { torso: id | '', gloves: id | '' }
	if ( o.torso !== undefined ) { inv.equip.torso = o.torso ? makeStack( o.torso ) : null; inv.changed(); }
	if ( o.gloves !== undefined ) { inv.equip.hands = o.gloves ? makeStack( o.gloves ) : null; inv.changed(); }
	const st = inv.heldStack();
	if ( st && o.att ) { st.data.att = {}; for ( const id of o.att ) { const a = makeStack( id ); const fit = getItem( id ).attachment.slot; st.data.att[ fit ] = a; } inv.changed(); }
	if ( o.time != null ) hands.vm.t = o.time;
	player.stance = o.stance || 'stand';
	player.sprinting = !! o.sprint;
	player.pitch = o.pitch ?? 0; player.yaw = o.yaw ?? 0;
	if ( o.ads ) down.add( 'aim' ); else down.delete( 'aim' );
	if ( o.zoom ) down.add( 'zoom' ); else down.delete( 'zoom' );
	for ( let i = 0; i < ( o.steps ?? 30 ); i ++ ) frame( 1 / 60 );
	if ( o.fire ) { for ( let i = 0; i < o.fire; i ++ ) { pressed.add( 'fire' ); down.add( 'fire' ); frame( 1 / 60 ); down.delete( 'fire' ); for ( let k = 0; k < ( o.gap ?? 8 ); k ++ ) frame( 1 / 60 ); } }
	if ( o.hold ) { down.add( 'fire' ); pressed.add( 'fire' ); for ( let i = 0; i < o.hold; i ++ ) frame( 1 / 60 ); down.delete( 'fire' ); released.add( 'fire' ); frame( 1 / 60 ); }
	// hold fire without letting go (a drawn bow, a cooking grenade)
	if ( o.holdKeep ) { down.add( 'fire' ); pressed.add( 'fire' ); for ( let i = 0; i < o.holdKeep; i ++ ) frame( 1 / 60 ); }
	else down.delete( 'fire' );
	if ( o.key ) { pressed.add( o.key ); down.add( o.key ); frame( 1 / 60 ); down.delete( o.key ); released.add( o.key ); }
	if ( o.after ) for ( let i = 0; i < o.after; i ++ ) frame( 1 / 60 );
	// freeze an action at a given moment for the screenshot
	if ( o.act ) {
		const a = hands.act || { p: {} };
		const p = { magOut: 0.3, magIn: 0.66, charge: 0.86, hadMag: true, newMag: st?.data?.mag?.id, ...( o.p || {} ) };
		hands.act = { type: o.act, t: ( o.t ?? 0.5 ) * 1, dur: 1, p, ev: [], i: 0 };
		void a;
		hands.update( 0.0001 );
		hands.act.t = o.t ?? 0.5;
		const vs = hands.vm.s; vs.act = { type: o.act, t: o.t ?? 0.5, p };
		hands.vm.update( 0.0001, viewCamera );
	}
	if ( o.flash ) { hands.vm.muzzleFlash( 1 ); hands.vm.update( 0.001, viewCamera ); }
	if ( o.orbit ) {
		// look at the view model from outside: o.orbit = [ yaw deg, pitch deg, distance ], o.look = [ x, y, z ] view space
		const [ yw, pt, d ] = o.orbit, L = new THREE.Vector3( ...( o.look || [ 0.08, - 0.15, - 0.35 ] ) );
		const oc = new THREE.PerspectiveCamera( 40, W / H, 0.005, 20 );
		const a = yw * Math.PI / 180, b = pt * Math.PI / 180;
		oc.position.set( L.x + Math.sin( a ) * Math.cos( b ) * d, L.y + Math.sin( b ) * d, L.z + Math.cos( a ) * Math.cos( b ) * d );
		oc.lookAt( L );
		renderer.setRenderTarget( null );
		renderer.setClearColor( 0x707478 ); renderer.clear();
		renderer.render( viewScene, oc );
		renderer.setClearColor( 0x000000 );
		return { held: st?.id, orbit: true };
	}
	render();
	return { held: st?.id, act: hands.act?.type || null, ammo: hands.ammoInfo(), hits: window.__hits, tris: renderer.info.render.triangles, calls: renderer.info.render.calls };
};
function* getAll() { for ( const d of ( window.__items || [] ) ) yield d; }
import( '../../src/game/items/ItemDB.js' ).then( m => { window.__items = m.allItems(); } );

const initial = {
	item: q.get( 'item' ) || 'm4a1', att: q.get( 'att' ) ? q.get( 'att' ).split( ',' ) : undefined, ads: + ( q.get( 'ads' ) || 0 ), sprint: !! + ( q.get( 'sprint' ) || 0 ),
	act: q.get( 'act' ) || null, t: + ( q.get( 't' ) || 0.5 ), time: 0.5,
};
setTimeout( () => { console.log( JSON.stringify( window.pose( initial ) ) ); window.__ready = true; }, 50 );
void defineItems;
