// Vehicle model preview (dev only, not shipped): the real vehicle visuals (src/vehicles/visual.js) on a
// flat lot under a sky-like environment, for screenshots of every type, LOD and wear state.
//   window.show( [ { name, x, z, yaw, lod: 'active'|'parked'|'far', paint, paint2, metal, dirt, rust, fade, burnt, crack, emit: { head: 1, ... } } ] )
//   window.view( [ x, y, z ], [ tx, ty, tz ], fov ) -> renders one frame
import * as THREE from 'three';
import { G } from '../../src/render/Materials.js';
import { VehicleVisual, EMIT } from '../../src/vehicles/visual.js';
import { modelNames, getModel } from '../../src/vehicles/models/index.js';
import { SPECS, seatsFromModel } from '../../src/vehicles/specs.js';

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
scene.background = new THREE.Color( night ? 0x0a1020 : 0x9fbad4 );

// a sky-like environment: gradient dome, bright horizon, warm ground, a sun disc
function skyEnv() {
	const s = new THREE.Scene();
	const geo = new THREE.SphereGeometry( 50, 32, 16 );
	const mat = new THREE.ShaderMaterial( {
		side: THREE.BackSide,
		uniforms: { uNight: { value: night ? 1 : 0 } },
		vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
		fragmentShader: `uniform float uNight; varying vec3 vP; void main(){
			vec3 d = normalize( vP );
			vec3 top = vec3( 0.18, 0.36, 0.75 ), hor = vec3( 0.85, 0.9, 0.95 ), gnd = vec3( 0.22, 0.2, 0.17 );
			vec3 c = d.y > 0.0 ? mix( hor, top, pow( d.y, 0.5 ) ) : mix( hor * 0.6, gnd, pow( -d.y, 0.4 ) );
			vec3 sun = normalize( vec3( 0.5, 0.6, 0.35 ) );
			c += vec3( 30.0, 27.0, 22.0 ) * smoothstep( 0.9985, 0.9995, dot( d, sun ) );
			c *= mix( 1.2, 0.02, uNight );
			gl_FragColor = vec4( c, 1.0 );
		}`,
	} );
	s.add( new THREE.Mesh( geo, mat ) );
	const pm = new THREE.PMREMGenerator( r );
	const t = pm.fromScene( s, 0.02 ).texture;
	pm.dispose();
	return t;
}
scene.environment = skyEnv();
scene.environmentIntensity = 0.85;

const sun = new THREE.DirectionalLight( 0xfff2e0, night ? 0.05 : 3.2 );
sun.position.set( 10, 12, 7 ); sun.castShadow = true;
sun.shadow.mapSize.set( 2048, 2048 );
sun.shadow.bias = - 0.0004; sun.shadow.normalBias = 0.02;
Object.assign( sun.shadow.camera, { left: - 20, right: 20, top: 20, bottom: - 20, near: 1, far: 60 } );
scene.add( sun, sun.target );

// shared uniforms the patched materials read (fog off, flat sky LUT)
G.uSkyLUT.value = new THREE.DataTexture( new Uint8Array( [ 160, 185, 215, 255 ] ), 1, 1 ); G.uSkyLUT.value.needsUpdate = true;
G.uSunDir.value.copy( sun.position ).normalize();
G.uSunColor.value.setRGB( 3, 2.9, 2.7 );
G.uFogDensity.value = 1e-7;
G.uCloudCover.value = 0;

// the lot: asphalt with painted stalls
const lotTex = ( () => {
	const c = document.createElement( 'canvas' ); c.width = c.height = 512;
	const g = c.getContext( '2d' );
	g.fillStyle = '#3c3d3f'; g.fillRect( 0, 0, 512, 512 );
	for ( let i = 0; i < 9000; i ++ ) { const v = 40 + Math.random() * 40; g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect( Math.random() * 512, Math.random() * 512, 2, 2 ); }
	g.fillStyle = '#d8d6cc'; for ( let i = 0; i < 512; i += 128 ) g.fillRect( i, 0, 4, 300 );
	const t = new THREE.CanvasTexture( c ); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set( 12, 12 ); t.anisotropy = 8;
	return t;
} )();
const ground = new THREE.Mesh( new THREE.PlaneGeometry( 120, 120 ), new THREE.MeshStandardMaterial( { map: lotTex, roughness: 0.92 } ) );
ground.rotation.x = - Math.PI / 2; ground.receiveShadow = true; scene.add( ground );
// water strip for the boats
const water = new THREE.Mesh( new THREE.PlaneGeometry( 60, 40 ), new THREE.MeshStandardMaterial( { color: 0x0d4a5c, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 } ) );
water.rotation.x = - Math.PI / 2; water.position.set( 0, 0.01, - 50 ); scene.add( water );
if ( night ) { const hl = new THREE.HemisphereLight( 0x203050, 0x101010, 0.3 ); scene.add( hl ); }

const cam = new THREE.PerspectiveCamera( + ( q.get( 'fov' ) || 40 ), W / H, 0.05, 500 );
const shown = [];

window.show = ( list ) => {
	for ( const s of shown ) s.dispose();
	shown.length = 0;
	const out = [];
	for ( const it of list ) {
		const v = new VehicleVisual( it.name, { paint: it.paint ?? 0x9a1b1b, paint2: it.paint2 ?? 0xf2f2f0, metallic: it.metal ?? 0.5, dirt: it.dirt ?? 0, rust: it.rust ?? 0, fade: it.fade ?? 0, burnt: it.burnt ?? 0, crack: it.crack ?? 0, gdirt: it.gdirt ?? 0, dent: it.dent ?? 0 } );
		v.setLOD( it.lod || 'active' );
		for ( const k in it.emit || {} ) v.emit[ EMIT[ k ] ] = it.emit[ k ];
		if ( it.wheels ) v.poseWheels( it.wheels );
		if ( it.parts ) for ( const k in it.parts ) if ( v.parts[ k ] ) v.parts[ k ].rotation.fromArray( it.parts[ k ] );
		if ( it.rider != null ) { const spec = SPECS[ it.name ]; v.setRider( spec.seats || seatsFromModel( v.model.P ), spec.kind, it.rider, it.head !== false ); }
		if ( it.lean ) v.group.rotation.z = it.lean;
		v.group.position.set( it.x || 0, it.y || 0, it.z || 0 );
		v.group.rotation.y = it.yaw || 0;
		scene.add( v.group );
		shown.push( v );
		const m = v.model;
		out.push( { name: it.name, tris: Math.round( m.near.attributes.position.count / 3 ), far: Math.round( m.far.attributes.position.count / 3 ), size: m.bounds.getSize( new THREE.Vector3() ).toArray().map( x => + x.toFixed( 2 ) ) } );
	}
	return out;
};
window.view = ( p, t, fov ) => {
	if ( fov ) { cam.fov = fov; cam.updateProjectionMatrix(); }
	cam.layers.enable( 1 ); cam.position.set( ...p ); cam.lookAt( ...t );
	G.uCamPos.value.copy( cam.position );
	r.render( scene, cam );
	return true;
};
window.models = () => modelNames();
window.getModel = getModel;
window.__ready = true;
