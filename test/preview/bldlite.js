// Lightweight buildings preview without the world: shells and interiors built on the main thread, a flat
// ground, a sun and a sky environment. Fast to boot for shader and geometry work.
// /test/preview/bldlite.html?ids=3221,3220&lod=0&int=1&hour=10
// window.__show( ids, { lod, int: storeys | 'all', far } ), window.__view( x, y, z, yaw, pitch ), window.__look( x, y, z )
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { preloadTextures, G } from '../../src/render/Materials.js';
import { readBuilding } from '../../src/city/buildings/data.js';
import { makePlan } from '../../src/city/buildings/plan.js';
import { buildShell } from '../../src/city/buildings/exterior.js';
import { buildStorey } from '../../src/city/buildings/interior.js';
import { Geo } from '../../src/city/buildings/geo.js';
import { buildingMaterials, geoToBuffer, decalToBuffer, glassToBuffer, setBuildingState, commitState } from '../../src/city/buildings/materials.js';

const q = new URLSearchParams( location.search );
const info = document.getElementById( 'info' );
const canvas = document.getElementById( 'view' );
const renderer = new THREE.WebGLRenderer( { canvas, antialias: true } );
renderer.setPixelRatio( 1 );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = + ( q.get( 'exp' ) || 1.0 );
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x9cc4e8 );
const cam = new THREE.PerspectiveCamera( 70, 1, 0.05, 5000 );
cam.layers.enableAll();
const resize = () => { renderer.setSize( innerWidth, innerHeight, false ); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
resize(); addEventListener( 'resize', resize );
const pm = new THREE.PMREMGenerator( renderer );
scene.environment = pm.fromScene( new RoomEnvironment(), 0.04 ).texture;
scene.environmentIntensity = 0.8;
const sun = new THREE.DirectionalLight( 0xfff2e0, 3.0 );
sun.castShadow = true;
sun.shadow.mapSize.set( 2048, 2048 );
const sc = sun.shadow.camera; sc.left = sc.bottom = - 60; sc.right = sc.top = 60; sc.near = 1; sc.far = 600;
sun.shadow.bias = - 0.0004; sun.shadow.normalBias = 0.04;
scene.add( sun, sun.target );
// the world's cascaded shadow samplers need depth textures bound even though this page has no cascades
if ( 'uCsm0' in G ) {
	const depthRT = ( compare ) => {
		const dt = new THREE.DepthTexture( 4, 4 );
		if ( compare ) dt.compareFunction = THREE.LessEqualCompare;
		const rt = new THREE.WebGLRenderTarget( 4, 4, { depthTexture: dt } );
		renderer.setRenderTarget( rt ); renderer.clear(); renderer.setRenderTarget( null );
		return dt;
	};
	G.uCsm0.value = depthRT( false ); G.uCsm1.value = depthRT( true ); G.uCsm2.value = G.uCsm1.value;
}
const hour = + ( q.get( 'hour' ) || 10 );
const setHour = ( h ) => {
	const a = ( h - 6 ) / 12 * Math.PI;
	const d = new THREE.Vector3( Math.cos( a ) * 0.8, Math.max( - 0.2, Math.sin( a ) ), 0.35 ).normalize();
	G.uSunDir.value.copy( d );
	const day = THREE.MathUtils.smoothstep( d.y, - 0.1, 0.15 );
	G.uSunColor.value.setRGB( 3.2, 3.0, 2.7 ).multiplyScalar( day );
	G.uNight.value = 1 - day;
	sun.intensity = 3.0 * day;
	scene.environmentIntensity = 0.05 + 0.75 * day;
	scene.background.setRGB( 0.6 * day + 0.01, 0.75 * day + 0.015, 0.9 * day + 0.03 );
	window.__sunDir = d;
};
setHour( hour );
info.textContent = 'loading textures';
// the world's texture list (not imported: World.js pulls in the whole terrain)
const TEXTURES = [ 'asphalt', 'sidewalk', 'stucco', 'plaster', 'beige', 'bluewall', 'panels', 'planks', 'oldplanks', 'brick', 'tinroof', 'roof', 'greyroof', 'bitumen', 'woodfloor', 'tiles', 'carpet', 'concrete', 'metal', 'rust', 'fabric' ];
await preloadTextures( TEXTURES.flatMap( t => [ t + '_d', t + '_n' ] ) );
const W = await ( await fetch( 'data/world.json' ) ).json();
const data = W.buildings.data;
const mats = buildingMaterials( data.length / 11 );
const group = new THREE.Group();
scene.add( group );
let ground = null;

window.__show = ( ids, o = {} ) => {
	for ( const m of [ ...group.children ] ) { group.remove( m ); m.geometry.dispose(); }
	const lod = o.lod ?? 0;
	let minY = Infinity, cx = 0, cz = 0;
	const out = [];
	for ( const i of ids ) {
		const r = readBuilding( data, i );
		const P = makePlan( r, W.cities );
		minY = Math.min( minY, r.lo ); cx += r.x / ids.length; cz += r.z / ids.length;
		const g = new Geo( 4096 );
		g.frame( r.x, 0, r.z, r.angle );
		buildShell( g, P, lod, null );
		const sm = new THREE.Mesh( geoToBuffer( g.finish( true ) ), lod ? mats.far : mats.near );
		sm.customDepthMaterial = lod ? mats.depthFar : mats.depthNear;
		sm.castShadow = sm.receiveShadow = true;
		group.add( sm );
		const sts = o.int === 'all' ? P.storeys.map( s => s.i ) : ( o.int || [] );
		for ( const si of sts ) {
			const res = buildStorey( P, si, null );
			const place = ( m ) => { m.position.set( r.x, 0, r.z ); m.rotation.y = - r.angle; group.add( m ); return m; };
			if ( res.geo ) { const m = place( new THREE.Mesh( geoToBuffer( res.geo ), mats.interior ) ); m.castShadow = m.receiveShadow = true; }
			if ( res.fine ) { const m = place( new THREE.Mesh( geoToBuffer( res.fine ), mats.interior ) ); m.receiveShadow = true; }
			if ( res.dec ) place( new THREE.Mesh( decalToBuffer( res.dec ), mats.decal ) );
			if ( res.glass ) place( new THREE.Mesh( glassToBuffer( res.glass ), mats.glass ) );
			out.push( { i, si, doors: res.doors.length, containers: res.containers.map( c => c.label ), spots: res.spots.length, beds: res.beds.length, lights: res.lights.length } );
		}
		if ( sts.length ) {
			const up = sts.filter( s => s > 0 );
			setBuildingState( mats, i, false, up.length ? Math.min( ...up ) : 255, up.length ? Math.max( ...up ) : 0, sts.includes( 0 ) ? 1 : 0 );
		}
		window.__P = P;
	}
	commitState( mats );
	if ( ground ) { scene.remove( ground ); ground.geometry.dispose(); }
	ground = new THREE.Mesh( new THREE.PlaneGeometry( 2000, 2000 ), new THREE.MeshStandardMaterial( { color: 0x6f7a55, roughness: 1 } ) );
	ground.rotation.x = - Math.PI / 2; ground.position.set( cx, minY + 0.02, cz ); ground.receiveShadow = true;
	scene.add( ground );
	sun.target.position.set( cx, minY, cz ); sun.position.set( cx, minY, cz ).addScaledVector( window.__sunDir, 300 );
	sun.target.updateMatrixWorld();
	return out;
};
window.__view = ( x, y, z, yaw = 0, pitch = 0 ) => { cam.position.set( x, y, z ); cam.rotation.set( pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ' ); cam.updateMatrixWorld(); };
window.__look = ( x, y, z ) => { cam.lookAt( x, y, z ); cam.updateMatrixWorld(); };
window.__hour = setHour;
window.__mats = mats;
// camera in front of building i (side 0 street), d m away, h high
window.__front = ( i, d = 20, h = 1.7, side = 0, up = 0.3 ) => {
	const r = readBuilding( data, i );
	const P = makePlan( r, W.cities ), rect = P.rect, S = P.S;
	const dirs = [ [ 0, - 1 ], [ 1, 0 ], [ 0, 1 ], [ - 1, 0 ] ][ side ];
	const lx = ( side === 1 ? rect.x1 : side === 3 ? rect.x0 : ( rect.x0 + rect.x1 ) / 2 ) + dirs[ 0 ] * d, lz = ( side === 0 ? rect.z0 : side === 2 ? rect.z1 : ( rect.z0 + rect.z1 ) / 2 ) + dirs[ 1 ] * d;
	const w = ( a, b ) => [ r.x + a * r.c - b * r.s, r.z + a * r.s + b * r.c ];
	const [ x, z ] = w( lx, lz ), [ tx, tz ] = w( ( rect.x0 + rect.x1 ) / 2, ( rect.z0 + rect.z1 ) / 2 );
	cam.position.set( x, r.base + h, z ); cam.lookAt( tx, S.fy + ( S.top - S.fy ) * up, tz ); cam.updateMatrixWorld();
};
// inside building i at local fractions (fx, fz) of the rect, storey si, looking along local yaw
window.__inside = ( i, fx = 0.5, fz = 0.5, si = 0, yawDeg = 0, pitch = 0 ) => {
	const r = readBuilding( data, i );
	const P = makePlan( r, W.cities ), rect = P.rect;
	const lx = rect.x0 + ( rect.x1 - rect.x0 ) * fx, lz = rect.z0 + ( rect.z1 - rect.z0 ) * fz;
	const x = r.x + lx * r.c - lz * r.s, z = r.z + lx * r.s + lz * r.c;
	const t = Math.PI - r.angle + yawDeg * Math.PI / 180;
	window.__view( x, P.S.ys[ si ] + 1.6, z, t * 180 / Math.PI, pitch );
};
const ids = ( q.get( 'ids' ) || '3221' ).split( ',' ).map( Number );
window.__show( ids, { lod: + ( q.get( 'lod' ) || 0 ), int: q.get( 'int' ) ? [ 0 ] : [] } );
window.__front( ids[ 0 ], 18 );
let frames = 0;
window.__frames = 0;
function loop() {
	G.uTime.value += 0.016;
	G.uCamPos.value.copy( cam.position );
	renderer.render( scene, cam );
	window.__frames = ++ frames;
	const r = renderer.info.render;
	info.textContent = `calls ${r.calls} tris ${( r.triangles / 1e3 ).toFixed( 0 )}k`;
	requestAnimationFrame( loop );
}
window.__ready = true;
loop();
