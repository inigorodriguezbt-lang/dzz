// Item model / icon preview (not shipped). Open /test/preview/items.html on the dev server:
//   ?mode=grid (default) 3D models on a table in rows, ?cat=food|clothing|… filter, ?q=substring, ?cols=N
//   ?mode=icons          the icon sheet rendered by src/render/Icons.js
//   ?fresh=1             re-render every icon (clears the icon store)
//   ?fire=1[&night=1]    a lit campfire and camp stove next to the grid (use ?q=none for the fires alone)
//   drag to orbit, wheel to zoom. Sets window.__ready / __done for headless screenshots:
//   node test/preview/items-sheet.mjs "http://127.0.0.1:<port>/test/preview/items.html?mode=icons&cat=food" out.png
// Model statistics (triangles, parts, size per item): /test/preview/items-stats.html (window.__stats).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import '../../src/game/items/defs/index.js';
import { ITEMS } from '../../src/game/items/ItemDB.js';
import { buildItemModel, modelInfo, instanceParts } from '../../src/render/ItemModels.js';
import { G } from '../../src/render/Materials.js';

const q = new URLSearchParams( location.search );
const mode = q.get( 'mode' ) || 'grid';
const cat = q.get( 'cat' );
const needle = q.get( 'q' );
const hud = document.getElementById( 'hud' );

// weapon builders live in the weapons module; load them if present so guns preview too
const weaponMods = import.meta.glob( '../../src/weapons/*Models.js' );
for ( const f of Object.values( weaponMods ) ) { try { await f(); } catch ( e ) { console.warn( 'weapon models', e ); } }

const defs = [ ...ITEMS.values() ].filter( d => ( ! cat || d.cat === cat ) && ( ! needle || d.id.includes( needle ) ) );
G.uSkyLUT.value = new THREE.DataTexture( new Uint8Array( [ 150, 180, 210, 255 ] ), 1, 1 );
G.uSkyLUT.value.needsUpdate = true;

if ( mode === 'icons' ) {
	document.getElementById( 'c' ).style.display = 'none';
	const sheet = document.getElementById( 'sheet' );
	sheet.style.display = 'flex';
	const { iconFor, clearIcons } = await import( '../../src/render/Icons.js' );
	if ( q.get( 'fresh' ) ) await clearIcons();
	const t0 = performance.now();
	const lim = + ( q.get( 'n' ) || 400 );
	const list = defs.slice( + ( q.get( 'from' ) || 0 ), + ( q.get( 'from' ) || 0 ) + lim );
	await Promise.all( list.map( async d => {
		const el = document.createElement( 'div' ); el.className = 'i';
		const img = document.createElement( 'img' );
		const name = document.createElement( 'span' ); name.textContent = d.name; name.title = d.id;
		el.append( img, name ); sheet.appendChild( el );
		img.src = await iconFor( d.id ) || '';
	} ) );
	hud.textContent = `${list.length} icons in ${( ( performance.now() - t0 ) / 1000 ).toFixed( 1 )} s`;
	hud.style.zIndex = 5;
	window.__ready = true; window.__done = true;
} else {
	const canvas = document.getElementById( 'c' );
	const r = new THREE.WebGLRenderer( { canvas, antialias: true } );
	r.setPixelRatio( Math.min( 2, devicePixelRatio ) );
	r.setSize( innerWidth, innerHeight );
	r.toneMapping = THREE.ACESFilmicToneMapping;
	r.shadowMap.enabled = true;
	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x8fa6b8 );
	const pm = new THREE.PMREMGenerator( r );
	scene.environment = pm.fromScene( new RoomEnvironment(), 0.04 ).texture;
	scene.environmentIntensity = 0.6;
	const sun = new THREE.DirectionalLight( 0xfff2e0, 2.4 );
	sun.position.set( 6, 12, 8 ); sun.castShadow = true; sun.shadow.mapSize.set( 2048, 2048 );
	scene.add( sun, sun.target );
	scene.add( new THREE.HemisphereLight( 0xbfd8ff, 0x3a3020, 0.5 ) );
	const ground = new THREE.Mesh( new THREE.PlaneGeometry( 200, 200 ), new THREE.MeshStandardMaterial( { color: 0x6a655c, roughness: 0.95 } ) );
	ground.rotation.x = - Math.PI / 2; ground.receiveShadow = true; scene.add( ground );
	const cam = new THREE.PerspectiveCamera( 40, innerWidth / innerHeight, 0.01, 200 );
	// lay the models out in rows, spaced by their size; `inst=1` draws them through instanceParts like the world does
	const cols = + ( q.get( 'cols' ) || Math.ceil( Math.sqrt( defs.length * 1.6 ) ) );
	const useInst = q.get( 'inst' ) === '1';
	let x = 0, z = 0, rowD = 0, n = 0, tris = 0, maxX = 0;
	const t0 = performance.now();
	for ( const d of defs ) {
		const info = modelInfo( d );
		const w = Math.max( 0.18, info.size.x ) + 0.08, dd = Math.max( 0.18, info.size.z ) + 0.08;
		let obj;
		if ( useInst ) {
			obj = new THREE.Group();
			for ( const p of instanceParts( d ) ) { const m = new THREE.Mesh( p.geometry, p.material ); m.layers.set( 0 ); m.castShadow = p.castShadow; m.receiveShadow = true; obj.add( m ); tris += p.geometry.attributes.position.count / 3; }
		} else {
			obj = buildItemModel( d ).clone();
			obj.traverse( o => { if ( o.isMesh ) { o.layers.set( 0 ); tris += ( o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count ) / 3; } } );
		}
		obj.position.set( x + w / 2 - info.centre.x, 0, z + dd / 2 - info.centre.z );
		scene.add( obj );
		x += w; rowD = Math.max( rowD, dd ); maxX = Math.max( maxX, x );
		if ( ++ n % cols === 0 ) { x = 0; z += rowD; rowD = 0; }
	}
	const buildMs = performance.now() - t0;
	const span = Math.max( maxX, z + rowD );
	const target = new THREE.Vector3( maxX / 2, 0, ( z + rowD ) / 2 );
	sun.target.position.copy( target ); sun.position.copy( target ).add( new THREE.Vector3( 6, 12, 8 ) );
	Object.assign( sun.shadow.camera, { left: - span, right: span, top: span, bottom: - span, far: 60 } );
	sun.shadow.camera.updateProjectionMatrix();
	let yaw = + ( q.get( 'yaw' ) || 0.5 ), pitch = + ( q.get( 'pitch' ) || 0.9 ), dist = + ( q.get( 'dist' ) || span * 0.95 + 0.5 );
	const place = () => {
		cam.position.set( target.x + Math.sin( yaw ) * Math.cos( pitch ) * dist, Math.sin( pitch ) * dist, target.z + Math.cos( yaw ) * Math.cos( pitch ) * dist );
		cam.lookAt( target );
		G.uCamPos.value.copy( cam.position );
	};
	place();
	let drag = null;
	canvas.addEventListener( 'pointerdown', e => { drag = [ e.clientX, e.clientY ]; } );
	addEventListener( 'pointerup', () => { drag = null; } );
	addEventListener( 'pointermove', e => { if ( ! drag ) return; yaw -= ( e.clientX - drag[ 0 ] ) * 0.005; pitch = Math.max( 0.05, Math.min( 1.5, pitch + ( e.clientY - drag[ 1 ] ) * 0.005 ) ); drag = [ e.clientX, e.clientY ]; place(); } );
	canvas.addEventListener( 'wheel', e => { dist *= Math.exp( e.deltaY * 0.001 ); place(); } );
	addEventListener( 'resize', () => { r.setSize( innerWidth, innerHeight ); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); } );
	hud.textContent = `${defs.length} items · ${Math.round( tris )} triangles (avg ${Math.round( tris / Math.max( 1, defs.length ) )}) · built in ${buildMs.toFixed( 0 )} ms`;
	// ?fire=1: a lit campfire and a camp stove in front of the grid (Campfire with a stand-in game), lit by a point light
	const fires = [];
	if ( q.get( 'fire' ) ) {
		const { Campfire } = await import( '../../src/game/items/Campfire.js' );
		const fakeGame = { scene, camera: cam, time: { hours: 20 }, world: { isIndoors: () => false }, weather: null, audio: null, player: { pos: new THREE.Vector3( 1e5, 0, 0 ), vehicle: null }, survival: null };
		const at = new THREE.Vector3( target.x - 0.9, 0, target.z + span * 0.5 + 0.6 );
		fires.push( new Campfire( fakeGame, { lights: null }, 'campfire', at, { lit: true, fuel: 3 } ) );
		fires.push( new Campfire( fakeGame, { lights: null }, 'stove', at.clone().add( new THREE.Vector3( 1.1, 0, 0.1 ) ), { lit: true, fuel: 1 } ) );
		const glow = new THREE.PointLight( 0xff8a3a, 6, 6, 2 ); glow.position.copy( at ).add( new THREE.Vector3( 0, 0.45, 0 ) ); scene.add( glow );
		if ( q.get( 'night' ) ) { sun.intensity = 0.05; scene.background.setHex( 0x0a0f18 ); scene.environmentIntensity = 0.05; }
	}
	let frames = 0, last = performance.now();
	const loop = () => {
		const now = performance.now(), dt = Math.min( 0.1, ( now - last ) / 1000 ); last = now;
		for ( const f of fires ) f.update( dt, 0 );
		r.render( scene, cam );
		if ( ++ frames === 2 ) { window.__ready = true; window.__done = true; }
		requestAnimationFrame( loop );
	};
	loop();
}
