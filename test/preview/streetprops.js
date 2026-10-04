// Street props and wreck preview (dev only, not shipped): the roads module's prop models and car shells with
// their real materials on a flat lot, for close-up screenshots of every model, LOD and wreck state.
//   window.props( [ { type, param, x, z, yaw, sx, tilt, lod: 'near'|'far' } ] )
//   window.cars( [ { type, x, z, yaw, color, rust, burn, flags, seed, lod: 'near'|'far'|'low' } ] )
//   window.view( [ x, y, z ], [ tx, ty, tz ], fov ) -> renders one frame;  ?night=1 for the lamps
import * as THREE from 'three';
import { G } from '../../src/render/Materials.js';
import { roadMaterials, makeCarMaterial } from '../../src/city/roads/materials.js';
import { MODELS, expandProp } from '../../src/city/roads/models.js';
import { carGeometries, carSpec, carPanels } from '../../src/city/roads/cars.js';
import { CAR_DIMS } from '../../src/city/roads/kinds.js';

const q = new URLSearchParams( location.search );
const W = + ( q.get( 'w' ) || 1280 ), H = + ( q.get( 'h' ) || 720 );
const canvas = document.getElementById( 'c' );
const r = new THREE.WebGLRenderer( { canvas, antialias: true, preserveDrawingBuffer: true } );
r.setSize( W, H, false );
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = + ( q.get( 'exp' ) || 1 );
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;

const night = q.get( 'night' ) === '1';
const scene = new THREE.Scene();
scene.background = new THREE.Color( night ? 0x070b16 : 0x9fbad4 );
function skyEnv() {
	const s = new THREE.Scene();
	const mat = new THREE.ShaderMaterial( {
		side: THREE.BackSide, uniforms: { uNight: { value: night ? 1 : 0 } },
		vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
		fragmentShader: `uniform float uNight; varying vec3 vP; void main(){
			vec3 d = normalize( vP );
			vec3 top = vec3( 0.18, 0.36, 0.75 ), hor = vec3( 0.85, 0.9, 0.95 ), gnd = vec3( 0.22, 0.2, 0.17 );
			vec3 c = d.y > 0.0 ? mix( hor, top, pow( d.y, 0.5 ) ) : mix( hor * 0.6, gnd, pow( -d.y, 0.4 ) );
			c *= mix( 1.2, 0.015, uNight );
			gl_FragColor = vec4( c, 1.0 );
		}`,
	} );
	s.add( new THREE.Mesh( new THREE.SphereGeometry( 50, 32, 16 ), mat ) );
	const pm = new THREE.PMREMGenerator( r );
	const t = pm.fromScene( s, 0.02 ).texture;
	pm.dispose();
	return t;
}
scene.environment = skyEnv();
scene.environmentIntensity = 0.85;
const sun = new THREE.DirectionalLight( 0xfff2e0, night ? 0.04 : 3.2 );
sun.position.set( 10, 12, 7 ); sun.castShadow = true;
sun.shadow.mapSize.set( 2048, 2048 );
sun.shadow.bias = - 0.0004; sun.shadow.normalBias = 0.02;
Object.assign( sun.shadow.camera, { left: - 25, right: 25, top: 25, bottom: - 25, near: 1, far: 80 } );
scene.add( sun, sun.target );
G.uSkyLUT.value = new THREE.DataTexture( new Uint8Array( [ 160, 185, 215, 255 ] ), 1, 1 ); G.uSkyLUT.value.needsUpdate = true;
G.uSunDir.value.copy( sun.position ).normalize();
G.uSunColor.value.setRGB( 3, 2.9, 2.7 );
G.uFogDensity.value = 1e-7;
G.uCloudCover.value = 0;
G.uNight.value = night ? 1 : 0;
if ( night ) scene.add( new THREE.HemisphereLight( 0x203050, 0x101010, 0.25 ) );

const ground = new THREE.Mesh( new THREE.PlaneGeometry( 200, 200 ), new THREE.MeshStandardMaterial( { color: 0x55565a, roughness: 0.92 } ) );
ground.rotation.x = - Math.PI / 2; ground.receiveShadow = true; scene.add( ground );
const cam = new THREE.PerspectiveCamera( + ( q.get( 'fov' ) || 40 ), W / H, 0.05, 800 );
const M = roadMaterials();
const shown = [];

// one instanced mesh per ( geometry, material ), like the game's bands
const groups = new Map();
function inst( geo, mat, attrs, matrix ) {
	const key = geo.uuid + mat.uuid;
	let e = groups.get( key );
	if ( ! e ) { e = { geo, mat, list: [] }; groups.set( key, e ); }
	e.list.push( { attrs, matrix } );
}
function flush() {
	for ( const m of shown ) { scene.remove( m ); m.geometry.dispose(); }
	shown.length = 0;
	for ( const { geo, mat, list } of groups.values() ) {
		const g = new THREE.BufferGeometry();
		for ( const k in geo.attributes ) g.setAttribute( k, geo.attributes[ k ] );
		if ( geo.index ) g.setIndex( geo.index );
		for ( const [ name, vals ] of list[ 0 ].attrs ) {
			const arr = new Float32Array( list.length * vals.length );
			list.forEach( ( it, i ) => arr.set( it.attrs.find( a => a[ 0 ] === name )[ 1 ], i * vals.length ) );
			g.setAttribute( name, new THREE.InstancedBufferAttribute( arr, vals.length ) );
		}
		const m = new THREE.InstancedMesh( g, mat, list.length );
		list.forEach( ( it, i ) => m.setMatrixAt( i, it.matrix ) );
		m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
		scene.add( m );
		shown.push( m );
	}
}
const clear = () => { groups.clear(); flush(); };
window.clear = clear;

const lodGeo = {};
window.props = ( list ) => {
	const out = [];
	for ( const p of list ) {
		const seed = p.seed ?? 0.37;
		for ( const part of expandProp( p.type, p.param || 0, seed ) ) {
			const model = MODELS[ part.key ];
			const geo = p.lod === 'far' && model.lod ? ( lodGeo[ part.key ] ||= model.lod() ) : ( model.geo ||= model.build() );
			const S = new THREE.Vector3( 1, 1, 1 ), sx = p.sx ?? 1;
			if ( part.sx === 'u' ) S.set( sx, sx, sx ); else if ( part.sx === 'x' ) S.x = sx; else if ( part.sx === 'y' ) S.y = sx;
			const Q = new THREE.Quaternion().setFromEuler( new THREE.Euler( p.tilt || 0, p.yaw || 0, 0, 'YXZ' ) );
			const m = new THREE.Matrix4().compose( new THREE.Vector3( p.x, p.y || 0, p.z ), Q, S );
			const t = part.tint || [ 1, 1, 1 ];
			inst( geo, M.prop, [ [ 'iTint', t ], [ 'iMisc', [ part.flicker ? 1 : 0, seed, 0.5 + seed * 0.5, 0 ] ] ], m );
			out.push( { key: part.key, tris: geo.attributes.position.count / 3 } );
		}
	}
	flush();
	return out;
};

const carMats = [];
function carMat( t ) {
	if ( carMats[ t ] ) return carMats[ t ];
	const S = carSpec( t ), D = CAR_DIMS[ t ];
	const belt = S.body[ Math.min( 4, S.body.length - 2 ) ][ 2 ];
	const trunkY = S.trunk ? ( S.trunk[ 2 ] === 'tailgate' ? S.body[ S.body.length - 1 ][ 1 ] + 0.1 : belt - 0.06 ) : 99;
	return ( carMats[ t ] = makeCarMaterial( {
		arch: [ D.W / 2, D.zf, D.zr, D.r ],
		doors: [ ...( S.doors[ 0 ] || [ 99, 99 ] ), ...( S.doors[ 1 ] || [ 99, 99 ] ) ],
		doorY: [ S.body[ 2 ][ 1 ] + 0.06, S.cab.roof - 0.04, belt, S.cab.roof ],
		lids: [ ...( S.trunk ? S.trunk.slice( 0, 2 ) : [ 99, 99 ] ), ...( S.hood || [ 99, 99 ] ) ],
		lidY: [ trunkY, belt - 0.2, 0, 0 ],
	} ) );
}
let panelMat = null;
window.cars = ( list ) => {
	const cg = carGeometries();
	panelMat ||= makeCarMaterial( { panel: true } );
	const out = [];
	for ( const c of list ) {
		const D = CAR_DIMS[ c.type ];
		const flags = c.flags || 0, seed = c.seed ?? 1234;
		// the placement lowers a car with flat tyres (the worker does it from the wheel contacts)
		const drop = ( f ) => ( flags & 4096 ) ? D.r * 0.55 : ( flags & f ) ? D.r * 0.3 : 0;
		const hFL = - drop( 256 ), hFR = - drop( 512 ), hRL = - drop( 1024 ), hRR = - drop( 2048 );
		const y = ( hFL + hFR + hRL + hRR ) / 4;
		const pitch = Math.atan2( ( hFL + hFR ) / 2 - ( hRL + hRR ) / 2, D.zr - D.zf ), roll = Math.atan2( ( hFR + hRR ) / 2 - ( hFL + hRL ) / 2, 2 * D.tr );
		const m = new THREE.Matrix4().compose( new THREE.Vector3( c.x, y, c.z ), new THREE.Quaternion().setFromEuler( new THREE.Euler( pitch, c.yaw || 0, roll, 'YXZ' ) ), new THREE.Vector3( 1, 1, 1 ) );
		const vals = [ [ 'iCar', [ c.color ?? 4, c.rust || 0, c.burn || 0, flags ] ], [ 'iCar2', [ seed / 65536, 0, 0, 0 ] ] ];
		inst( cg[ c.lod || 'near' ][ c.type ], carMat( c.type ), vals, m );
		const panels = carPanels( c.type, flags, seed, [] );
		for ( const p of panels ) inst( p.kind === 'door' ? cg.door : cg.lid, panelMat, vals, new THREE.Matrix4().multiplyMatrices( m, p.m ) );
		out.push( { type: c.type, tris: cg[ c.lod || 'near' ][ c.type ].attributes.position.count / 3 } );
	}
	flush();
	return out;
};
window.view = ( p, t, fov ) => {
	if ( fov ) { cam.fov = fov; cam.updateProjectionMatrix(); }
	cam.position.set( ...p ); cam.lookAt( ...t );
	G.uCamPos.value.copy( cam.position );
	G.uTime.value = 3.2;
	r.render( scene, cam );
	return r.info.render.triangles;
};
window.__scene = scene; window.__r = r; window.THREE = THREE;
window.__ready = true;
