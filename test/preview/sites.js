// Outdoor loot site preview (not shipped): every site kind (or ?kinds=a,b) laid out on flat ground with its props,
// decals and a seeded roll of its loot as item models; ?seed=N varies the layouts, ?yaw/?pitch/?dist/?focus=kind
// frame the camera, ?night=1. Sets window.__ready / __done for headless screenshots:
//   node test/preview/items-sheet.mjs "http://127.0.0.1:5190/test/preview/sites.html?kinds=campsite,heli_crash" out.jpg
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import '../../src/game/items/defs/index.js';
import { getItem } from '../../src/game/items/ItemDB.js';
import { rollLoot } from '../../src/game/items/Loot.js';
import { buildItemModel } from '../../src/render/ItemModels.js';
import { G } from '../../src/render/Materials.js';
import { KIND_LIST, rng, hash32 } from '../../src/game/items/sites/kinds.js';
import { layout, tableOf } from '../../src/game/items/sites/layout.js';
import { Kit, geo } from '../../src/game/items/sites/kit.js';
import { PROPS } from '../../src/game/items/sites/props.js';

const q = new URLSearchParams( location.search );
const kinds = q.get( 'kinds' ) ? q.get( 'kinds' ).split( ',' ) : KIND_LIST;
const seed = + ( q.get( 'seed' ) || 7 );
G.uSkyLUT.value = new THREE.DataTexture( new Uint8Array( [ 150, 180, 210, 255 ] ), 1, 1 );
G.uSkyLUT.value.needsUpdate = true;

const canvas = document.getElementById( 'c' );
const r = new THREE.WebGLRenderer( { canvas, antialias: true } );
r.setPixelRatio( Math.min( 2, devicePixelRatio ) );
r.setSize( innerWidth, innerHeight );
r.toneMapping = THREE.ACESFilmicToneMapping;
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x9fb6c8 );
const pm = new THREE.PMREMGenerator( r );
scene.environment = pm.fromScene( new RoomEnvironment(), 0.04 ).texture;
scene.environmentIntensity = 0.55;
const sun = new THREE.DirectionalLight( 0xfff0dc, 2.6 );
sun.castShadow = true; sun.shadow.mapSize.set( 4096, 4096 ); sun.shadow.bias = - 0.0004; sun.shadow.normalBias = 0.02;
scene.add( sun, sun.target );
scene.add( new THREE.HemisphereLight( 0xbfd8ff, 0x4a4030, 0.6 ) );
const groundCol = q.get( 'ground' ) === 'sand' ? 0xcbb995 : 0x6f6a52;
const ground = new THREE.Mesh( new THREE.PlaneGeometry( 600, 600 ), new THREE.MeshStandardMaterial( { color: groundCol, roughness: 0.95 } ) );
ground.rotation.x = - Math.PI / 2; ground.receiveShadow = true; scene.add( ground );
const cam = new THREE.PerspectiveCamera( 40, innerWidth / innerHeight, 0.05, 900 );

// sizes so the grid leaves room for each scene
const SIZE = { fema_camp: 34, heli_crash: 26, military_checkpoint: 18, checkpoint: 18, crash_car: 13, campsite: 11 };
const cols = + ( q.get( 'cols' ) || Math.ceil( Math.sqrt( kinds.length ) ) );
let x = 0, z = 0, rowD = 0, maxX = 0, tris = 0, n = 0;
const centres = {};
const t0 = performance.now();
const labs = [];
for ( const kind of kinds ) {
	const S = SIZE[ kind ] ?? 9;
	const site = { kind, key: 'pv:' + kind, x: x + S / 2, z: z + S / 2, yaw: 0, seed: hash32( seed, kind.length, kind.charCodeAt( 0 ) ), dug: q.get( 'dug' ) !== '0', rich: false };
	if ( [ 'roadside', 'bus_stop', 'checkpoint', 'farm_stand', 'military_checkpoint', 'fema_camp', 'crash_car' ].includes( kind ) && q.get( 'road' ) !== '0' ) { site.ro = 6; site.rw = 7.5; }
	const L = layout( site );
	const k = new Kit();
	const R = rng( site.seed ^ 0x9e37 );
	const props = L.props.slice();
	for ( const b of L.bodies ) props.push( { t: b.as === 'military' || b.as === 'police' ? 'body_bag' : 'body_covered', x: b.x, z: b.z, yaw: b.yaw } );
	for ( const pr of props ) {
		const fn = PROPS[ pr.t ];
		if ( ! fn ) { console.warn( 'no prop', pr.t ); continue; }
		k.push( [ pr.x, pr.dy || 0, pr.z ], [ 0, pr.yaw || 0, 0 ] );
		fn( k, pr, R );
		k.pop();
	}
	for ( const f of L.fx ) if ( f.fx === 'embers' ) for ( let i = 0; i < 5; i ++ ) k.part( geo.ico( 0.08, 0 ), 'glow', 0xffffff, [ f.x + ( R() - 0.5 ) * 0.9, 0.03, f.z + ( R() - 0.5 ) * 0.9 ], null, [ 1, 0.5, 1 ] );
	for ( const d of L.decals ) k.decal( d.d, d.x, d.z, d.s, d.yaw, () => 0 );
	const out = k.build( kind );
	out.group.position.set( site.x, 0, site.z );
	scene.add( out.group );
	tris += out.tris;
	// a road strip under the roadside kinds
	if ( site.ro !== undefined ) {
		const road = new THREE.Mesh( new THREE.PlaneGeometry( S, site.rw ), new THREE.MeshStandardMaterial( { color: 0x3a3b3d, roughness: 0.9 } ) );
		road.rotation.x = - Math.PI / 2; road.position.set( site.x, 0.01, site.z + site.ro ); road.receiveShadow = true; scene.add( road );
	}
	// the loot, rolled as the game would
	L.slots.forEach( ( sl, i ) => {
		const Rr = rng( hash32( seed, i, kind.length * 31 ) );
		if ( Rr() > sl.p ) return;
		const st = rollLoot( tableOf( site, sl ), Rr, 1 )[ 0 ];
		if ( ! st ) return;
		const m = buildItemModel( getItem( st.id ) ).clone();
		m.position.set( site.x + sl.x, sl.h, site.z + sl.z );
		m.rotation.y = Rr() * 6.28;
		m.traverse( o => { if ( o.isMesh ) { o.castShadow = true; o.receiveShadow = true; o.layers.set( 0 ); } } );
		scene.add( m );
	} );
	centres[ kind ] = new THREE.Vector3( site.x, 0, site.z );
	const lab = document.createElement( 'div' ); lab.className = 'lab'; lab.textContent = kind; document.body.appendChild( lab ); lab._at = new THREE.Vector3( site.x, 0, site.z + S / 2 - 0.5 ); lab._k = kind; labs.push( lab );
	x += S; rowD = Math.max( rowD, S ); maxX = Math.max( maxX, x );
	if ( ++ n % cols === 0 ) { x = 0; z += rowD; rowD = 0; }
}
const span = Math.max( maxX, z + rowD );
const focus = q.get( 'focus' );
const target = focus && centres[ focus ] ? centres[ focus ] : new THREE.Vector3( maxX / 2, 0, ( z + rowD ) / 2 );
sun.target.position.copy( target ); sun.position.copy( target ).add( new THREE.Vector3( 30, 50, 22 ) );
Object.assign( sun.shadow.camera, { left: - span * 0.8, right: span * 0.8, top: span * 0.8, bottom: - span * 0.8, far: 200 } );
sun.shadow.camera.updateProjectionMatrix();
if ( q.get( 'night' ) ) { sun.intensity = 0.04; scene.background.setHex( 0x0a0f18 ); scene.environmentIntensity = 0.04; }
let yaw = + ( q.get( 'yaw' ) || 0.6 ), pitch = + ( q.get( 'pitch' ) || 0.75 ), dist = + ( q.get( 'dist' ) || ( focus ? 16 : span * 0.9 ) );
const place = () => {
	cam.position.set( target.x + Math.sin( yaw ) * Math.cos( pitch ) * dist, Math.sin( pitch ) * dist, target.z + Math.cos( yaw ) * Math.cos( pitch ) * dist );
	cam.lookAt( target );
	G.uCamPos.value.copy( cam.position );
};
place();
// headless: frame a kind ( __focus( 'campsite', yaw, pitch, dist ) )
window.__focus = ( kind, y = yaw, p = pitch, d = 14 ) => { if ( centres[ kind ] ) target.copy( centres[ kind ] ); yaw = y; pitch = p; dist = d; place(); for ( const l of labs ) l.style.visibility = 'hidden'; };
let drag = null;
canvas.addEventListener( 'pointerdown', e => { drag = [ e.clientX, e.clientY ]; } );
addEventListener( 'pointerup', () => { drag = null; } );
addEventListener( 'pointermove', e => { if ( ! drag ) return; yaw -= ( e.clientX - drag[ 0 ] ) * 0.005; pitch = Math.max( 0.05, Math.min( 1.5, pitch + ( e.clientY - drag[ 1 ] ) * 0.005 ) ); drag = [ e.clientX, e.clientY ]; place(); } );
canvas.addEventListener( 'wheel', e => { dist *= Math.exp( e.deltaY * 0.001 ); place(); } );
document.getElementById( 'hud' ).textContent = `${kinds.length} kinds · ${Math.round( tris )} triangles · ${( performance.now() - t0 ).toFixed( 0 )} ms`;
let frames = 0;
const loop = () => {
	r.render( scene, cam );
	for ( const l of labs ) { const v = l._at.clone().project( cam ); l.style.left = ( v.x * 0.5 + 0.5 ) * innerWidth + 'px'; l.style.top = ( - v.y * 0.5 + 0.5 ) * innerHeight + 'px'; l.style.display = v.z < 1 && ! focus ? '' : 'none'; }
	if ( ++ frames === 3 ) { window.__ready = true; window.__done = true; }
	requestAnimationFrame( loop );
};
loop();
