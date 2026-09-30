// Standalone vegetation preview (not shipped): the plant models, their mid LOD and impostors side by
// side on a flat lawn, with the game's vegetation materials, sun shadows and wind.
//   /test/preview/vegetation.html?set=trees|small|forest|grass&cam=x,y,z&look=x,y,z&hour=..&frames=N&wind=0..1
//     set=grass: the grass field and pebbles (GrassField / PebbleField) on synthetic ground data: meadow
//     (moisture &moist=0..1) on the right, the backshore (dune grass, sea oats, creeper) and a pebbly
//     beach on the left
//     &aa=msaa|taa|none (LOD fade mode: alpha to coverage, moving dither, clean swap) &sun=..&hemi=.. (light)
//     &layout=pairs (levels side by side) &atlas=A|B|leaf (texture debug view)
// Rows (front to back): full model, mid model, impostor; set=forest: a far-band impostor forest seen
// from a mountainside. window.__ready / __done for test/shot.mjs.
import * as THREE from 'three';
import { G, preloadTextures } from '../../src/render/Materials.js';
import { SP, NSP, STRIDE, SPECIES } from '../../src/world/vegetation/species.js';
import { buildLeafAtlas } from '../../src/world/vegetation/LeafTextures.js';
import { VG, vegTextures, vegUniforms, makeVegMaterial, makeVegDepthMaterial } from '../../src/world/vegetation/VegMaterial.js';
import { Impostors } from '../../src/world/vegetation/Impostors.js';
import { InstanceTarget } from '../../src/world/vegetation/InstanceTarget.js';
import { GroundData } from '../../src/world/vegetation/GroundData.js';
import { GrassField } from '../../src/world/vegetation/GrassField.js';
import { PebbleField } from '../../src/world/vegetation/PebbleField.js';
import { getDetailTexture } from '../../src/world/terrain/DetailTextures.js';
import { SPEC } from '../../src/world/Vegetation.js';

const q = new URLSearchParams( location.search );
const SET = q.get( 'set' ) || 'trees';
const SETS = {
	trees: { list: [ SP.PALM, SP.PALM, SP.PALM, SP.MONKEYPOD, SP.KUKUI, SP.OHIA, SP.PINE, SP.IRONWOOD, SP.KIAWE ], gap: 20 },
	small: { list: [ SP.TREEFERN, SP.BANANA, SP.TI, SP.SHRUB, SP.NAUPAKA, SP.TALLGRASS, SP.PINEAPPLE, SP.CANE, SP.ROCK, SP.FERN, SP.DRIFTWOOD, SP.NUTS, SP.FROND, SP.MONSTERA, SP.KALO ], gap: 4.5 },
	// a lowland forest of far impostors seen from a mountainside (the game's far band)
	forest: { list: [], gap: 20 },
	// the grass field: backshore (left) beside a meadow (right), at eye height
	grass: { list: [], gap: 4 },
};
const set = SETS[ SET ];
// ?list=2,3: only these species (ids from species.js)
if ( q.get( 'list' ) ) set.list = q.get( 'list' ).split( ',' ).map( Number );

const info = document.getElementById( 'info' );
const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( 1 );
renderer.setSize( innerWidth, innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x9cc4e4 );
const camera = new THREE.PerspectiveCamera( + ( q.get( 'fov' ) || 60 ), innerWidth / innerHeight, 0.1, 5000 );

// sky stand-ins for the shared uniforms (fog colour, sun)
const sky = new THREE.DataTexture( new Uint8Array( [ 156, 196, 228, 255 ] ), 1, 1 );
sky.needsUpdate = true;
G.uSkyLUT.value = sky;
G.uCloudShadowK.value = 0;
// the shared lighting declares the sun's shadow cascades (sampler2DShadow): bind 1x1 depth textures
for ( const k of [ 'uCsm0', 'uCsm1', 'uCsm2' ] ) if ( G[ k ] && ! G[ k ].value ) {
	const d = new THREE.DepthTexture( 1, 1 );
	if ( k !== 'uCsm0' ) d.compareFunction = THREE.LessEqualCompare;
	const rt = new THREE.WebGLRenderTarget( 1, 1, { depthTexture: d } );
	renderer.setRenderTarget( rt ); renderer.clear(); renderer.setRenderTarget( null );
	G[ k ].value = d;
}
const hour = + ( q.get( 'hour' ) || 10 );
const el = Math.max( 0.05, Math.sin( ( hour - 6 ) / 12 * Math.PI ) ) * 1.1;
const az = + ( q.get( 'sunaz' ) || 200 ) * Math.PI / 180; // compass azimuth of the sun (0 north = -z)
const sunDir = new THREE.Vector3( Math.sin( az ) * Math.cos( el ), Math.sin( el ), - Math.cos( az ) * Math.cos( el ) ).normalize();
G.uSunDir.value.copy( sunDir );
const sun = new THREE.DirectionalLight( 0xfff1dc, + ( q.get( 'sun' ) ?? 3.2 ) );
sun.position.copy( sunDir ).multiplyScalar( 200 );
sun.castShadow = true;
sun.shadow.mapSize.set( 2048, 2048 );
Object.assign( sun.shadow.camera, { left: - 110, right: 110, top: 110, bottom: - 110, near: 1, far: 600 } );
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = - 0.0004;
sun.shadow.normalBias = 0.04;
scene.add( sun, sun.target );
scene.add( new THREE.HemisphereLight( 0xbfd8ff, 0x4a4030, + ( q.get( 'hemi' ) ?? 1.1 ) ) );
G.uSunColor.value.set( 0xfff1dc );

const ground = new THREE.Mesh( new THREE.PlaneGeometry( 4000, 4000 ), new THREE.MeshStandardMaterial( { color: 0x5b6e32, roughness: 1 } ) );
ground.rotation.x = - Math.PI / 2;
ground.receiveShadow = true;
scene.add( ground );

await preloadTextures( [ 'palmbark_d', 'bark_d', 'rock_d' ] );
const t0 = performance.now();
const atlas = buildLeafAtlas();
vegTextures( atlas.texture );
const models = [], targets = [];
const all = [ ...new Set( [ ...SETS.trees.list, ...SETS.small.list ] ) ];
const lods = {};
for ( const s of all ) {
	const cfg = SPEC[ s ];
	models[ s ] = cfg.build( 0 );
	const make = ( g, name, shadow ) => {
		const U = vegUniforms( cfg.kind, cfg.tint[ 0 ], cfg.tint[ 1 ], cfg.bark, cfg.mode, cfg.leaf );
		U.uLod.value.set( 0, 0, 1e6, 1e6 );
		const t = new InstanceTarget( SPECIES[ s ].name + '-' + name, g, makeVegMaterial( U ), shadow ? makeVegDepthMaterial( U ) : null, 16 );
		t.mesh.castShadow = !! shadow;
		scene.add( t.mesh );
		targets.push( t );
		return t;
	};
	lods[ s ] = { near: make( models[ s ], 'near', cfg.shadow !== false ), mid: cfg.mid ? make( cfg.build( 1 ), 'mid', false ) : null };
}
const buildMs = performance.now() - t0;
window.__targets = targets; window.__renderer = renderer; window.__scene = scene; window.__camera = camera;
// models[] may have holes for species not in the preview: the impostor atlas only measures its own
for ( let s = 0; s < NSP; s ++ ) if ( ! models[ s ] && SPEC[ s ].imp ) models[ s ] = SPEC[ s ].build( 0 );
const imp = new Impostors( renderer, models, SPEC );
const impT = imp.makeTarget( 'mid' );
scene.add( impT.mesh );
for ( const k of imp.uniforms.uImpRange.value ) k.set( - 2, - 1, 1e6, 1e6 );
impT.U.uImpThin.value.set( 0, 0, 1, + ( q.get( 'blend' ) || 220 ) );

// instance record for a species: [ x, y, z, s, yaw, rank, a, b ]
function inst( s, x, z, k ) {
	switch ( s ) {
		case SP.PALM: return [ x, 0, z, [ 12, 9, 15 ][ k % 3 ], 0.3 + k, 0.4, [ 0.03, 0.15, 0.22 ][ k % 3 ], k % 3 === 2 ? 8 + 1.2 : 1.2 ];
		case SP.PINE: return [ x, 0, z, 0.8, 0, 0.3, 0.03, 3.3 ];
		case SP.BANANA: return [ x, 0, z, 1, 0.5, 0.3, 0, 0.8 ];
		case SP.TALLGRASS: return [ x, 0, z, 1, 0.5, 0.3, 0.4, 0.3 ];
		case SP.PINEAPPLE: return [ x, 0, z, 1, 0.78, 0.3, 0, 0.8 ];
		case SP.CANE: return [ x, 0, z, 3.2, 0.5, 0.3, 0, 0.3 ];
		case SP.ROCK: return [ x, 0, z, 1.2, 0.5, 0.3, 0.7, 0.2 ];
		case SP.SHRUB: return [ x, 0, z, 1, 0.5, 0.3, 0.8, 0.1 ];
		default: return [ x, 0, z, 1, 0.5, 0.3, 1, 0.3 ];
	}
}
const origin = new THREE.Vector3();
// ?aa=msaa (alpha to coverage, default) | taa (moving dither) | none (clean swap): the LOD fade modes
const AA = q.get( 'aa' ) || 'msaa';
VG.uVegFadeMode.value = AA === 'taa' ? 1 : 0;
for ( const t of [ ...targets, impT ] ) t.material.alphaToCoverage = AA === 'msaa';
let impF = null;
if ( SET === 'forest' ) {
	impF = imp.makeTarget( 'far' );
	impF.material.alphaToCoverage = AA === 'msaa';
	scene.add( impF.mesh );
	const R = + ( q.get( 'rd' ) || 1400 );
	const ranges = [];
	for ( let s = 0; s < NSP; s ++ ) if ( SPEC[ s ].imp === 'far' ) ranges[ s ] = { imp: [ SPEC[ s ].mid || SPEC[ s ].near, R ] };
	imp.setRanges( ranges, { far: 1, blend: 1e5 }, 0.03 );
	let seed = 7;
	const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const W = [ [ SP.PALM, 0.3 ], [ SP.MONKEYPOD, 0.15 ], [ SP.KUKUI, 0.15 ], [ SP.OHIA, 0.25 ], [ SP.IRONWOOD, 0.1 ], [ SP.KIAWE, 0.05 ] ];
	const rec = new Float32Array( STRIDE );
	impF.begin();
	const cx = + ( q.get( 'fx' ) || 0 ), cz = + ( q.get( 'fz' ) || - 700 );
	for ( let n = 0; n < 60000; n ++ ) {
		const x = cx + ( rnd() - 0.5 ) * 2600, z = cz + ( rnd() - 0.5 ) * 1400;
		// clearings: a coarse checkerboard of groves
		if ( ( Math.floor( x / 180 ) + Math.floor( z / 140 ) ) % 3 === 0 && rnd() < 0.8 ) continue;
		let r = rnd(), k = 0;
		while ( k < W.length - 1 && r > W[ k ][ 1 ] ) { r -= W[ k ][ 1 ]; k ++; }
		const s = W[ k ][ 0 ], rank = rnd();
		const d = Math.hypot( x, z );
		if ( d > R || rank > imp.keepAt( d ) + 0.15 ) continue;
		rec.set( s === SP.PALM ? [ x, 0, z, 7 + 9 * rnd(), rnd() * 6.28, rank, 0.1 * rnd(), rnd() * 6.28 ] : [ x, 0, z, 0.7 + 0.5 * rnd(), rnd() * 6.28, rank, 0.9 + 0.2 * rnd(), rnd() ] );
		impF.push( rec, 0, 0, 0, 0, imp.slot[ s ] + rank * 0.999 );
	}
	impF.end( origin );
	window.__impF = impF;
}
for ( const t of targets ) t.begin();
impT.begin();
// layout=rows: full / mid / impostor rows one behind the other; layout=pairs: side by side
const pairs = q.get( 'layout' ) === 'pairs';
if ( pairs ) set.gap *= 1.6;
const rowZ = pairs ? [ 0, 0, 0 ] : [ 0, - set.gap * 1.6, - set.gap * 3.2 ];
const rowX = pairs ? [ - set.gap * 0.3, 0, set.gap * 0.3 ] : [ 0, 0, 0 ];
set.list.forEach( ( s, k ) => {
	const x = ( k - ( set.list.length - 1 ) / 2 ) * set.gap;
	const rec = new Float32Array( STRIDE );
	rec.set( inst( s, x + rowX[ 0 ], rowZ[ 0 ], k ) ); lods[ s ].near.push( rec, 0, 0, 0, 0 );
	if ( lods[ s ].mid ) { rec.set( inst( s, x + rowX[ 1 ], rowZ[ 1 ], k ) ); lods[ s ].mid.push( rec, 0, 0, 0, 0 ); }
	if ( imp.slot[ s ] >= 0 ) { rec.set( inst( s, x + rowX[ 2 ], rowZ[ 2 ], k ) ); impT.push( rec, 0, 0, 0, 0, imp.slot[ s ] + rec[ 5 ] * 0.999 ); }
} );
// the shared detail texture (meadow tone, gusts: built on this thread a moment after)
VG.tDetail.value = getDetailTexture();
VG.uDetailOn.value = 1;
let grassF = null, pebF = null, groundD = null;
if ( SET === 'grass' ) {
	// synthetic ground data (scatter.js groundData layout) for the blocks around the origin: flat ground,
	// a meadow for x > 0, the backshore for x < 0 (dune grass, oats, creeper) with a pebbly beach in front
	groundD = new GroundData( renderer );
	const moist = + ( q.get( 'moist' ) ?? 0.35 );
	for ( let bj = - 4; bj < 4; bj ++ ) for ( let bi = - 4; bi < 4; bi ++ ) {
		const h = new Float32Array( 16 * 16 * 4 ), gm = new Uint8Array( 32 * 32 * 4 ), pm = new Uint8Array( 32 * 32 * 4 ), cells = new Float32Array( 64 * 4 );
		for ( let k = 0; k < 256; k ++ ) { h[ k * 4 ] = 0; h[ k * 4 + 1 ] = moist; }
		for ( let j = 0; j < 32; j ++ ) for ( let i = 0; i < 32; i ++ ) {
			const x = bi * 32 + i + 0.5, z = bj * 32 + j + 0.5, o = ( j * 32 + i ) * 4;
			const n = Math.sin( x * 0.7 + z * 0.3 ) * Math.sin( z * 0.9 - x * 0.2 );
			if ( x > 0 ) gm[ o + 1 ] = 230;
			else if ( z < - 3 ) { gm[ o ] = n > - 0.3 ? 220 : 60; gm[ o + 2 ] = z > - 8 && n > 0.2 ? 200 : 0; gm[ o + 3 ] = z > - 6 ? 180 : 0; }
			else { pm[ o ] = 120; pm[ o + 1 ] = 20; pm[ o + 2 ] = 150; pm[ o + 3 ] = 170; }
		}
		for ( let k = 0; k < 64; k ++ ) { cells[ k * 4 + 1 ] = 0; cells[ k * 4 + 2 ] = 1; cells[ k * 4 + 3 ] = 1; }
		groundD.put( bi, bj, { h, gm, pm, cells } );
	}
	grassF = new GrassField( groundD );
	pebF = new PebbleField( groundD );
	grassF.setQuality( q.get( 'veg' ) || 'high' );
	pebF.setQuality( q.get( 'veg' ) || 'high' );
	scene.add( ...grassF.meshes, pebF.mesh );
	ground.material.color.set( 0x3a3322 );
	window.__grass = grassF; window.__pebbles = pebF;
}
for ( const t of targets ) t.end( origin );
impT.end( origin );

const W = set.gap * set.list.length;
const cam = ( q.get( 'cam' ) || '' ).split( ',' ).map( Number );
const look = ( q.get( 'look' ) || '' ).split( ',' ).map( Number );
const forest = SET === 'forest';
const lawnSet = SET === 'grass';
camera.position.set( ...( cam.length === 3 ? cam : forest ? [ 0, 300, 0 ] : lawnSet ? [ 0, 1.7, 2 ] : [ 0, set.gap * 0.5, W * 0.62 ] ) );
camera.lookAt( ...( look.length === 3 ? look : forest ? [ 0, 0, - 1400 ] : lawnSet ? [ 0, 0, - 8 ] : [ 0, set.gap * 0.35, rowZ[ 1 ] ] ) );
VG.uWindStr.value = 0.25 + + ( q.get( 'wind' ) ?? 0.45 ) * 0.95;

// atlas debug view: ?atlas=A|B draws the impostor atlas full screen, ?atlas=leaf the foliage atlas
if ( q.get( 'atlas' ) ) {
	const which = q.get( 'atlas' );
	const m = new THREE.MeshBasicMaterial( { map: which === 'leaf' ? atlas.texture : which === 'B' ? imp.rtB.texture : imp.rtA.texture, transparent: true } );
	const quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), m );
	const s2 = new THREE.Scene(); s2.background = new THREE.Color( 0x303040 ); s2.add( quad );
	const oc = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	renderer.toneMapping = THREE.NoToneMapping;
	renderer.render( s2, oc );
	window.__ready = true; window.__done = true;
} else {
	// (a few frames more than asked: headless drivers can finish the first shader compiles late)
	const maxFrames = q.get( 'frames' ) ? + q.get( 'frames' ) + 9 : 0;
	let frames = 0;
	let last = performance.now();
	const loop = () => {
		const now = performance.now(), dt = ( now - last ) / 1000; last = now;
		G.uTime.value += dt;
		G.uCamPos.value.copy( camera.position );
		if ( grassF ) {
			camera.updateMatrixWorld();
			groundD.update( camera.position );
			grassF.update( camera );
			pebF.update( camera, 0 );
		}
		renderer.render( scene, camera );
		frames ++;
		const r = renderer.info.render;
		info.textContent = `${SET}  build ${buildMs.toFixed( 0 )} ms  bake ${imp.bakeMs?.toFixed( 0 )} ms  calls ${r.calls}  tris ${r.triangles}\n` +
			all.map( s => `${SPECIES[ s ].name}: ${( models[ s ].index.count / 3 ) | 0} tris` ).join( '\n' );
		window.__frames = frames;
		if ( frames === 2 ) window.__ready = true;
		if ( maxFrames && frames >= maxFrames ) { window.__done = true; return; }
		requestAnimationFrame( loop );
	};
	loop();
}
addEventListener( 'resize', () => { renderer.setSize( innerWidth, innerHeight ); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } );
