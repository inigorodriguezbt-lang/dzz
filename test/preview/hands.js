// Hands preview (dev only): one or two arms from src/weapons/Arms.js posed on grip cylinders, seen from any angle.
//   window.pose( { r, tight, thumb, side, grip: { p, a, n }, cam: [ yawDeg, pitchDeg, dist ], look: [ x, y, z ], sleeve, long, glove } )
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { G } from '../../src/render/Materials.js';
import { Arm, curlFor, wristMatrix, THUMB_POSE } from '../../src/weapons/Arms.js';

const q = new URLSearchParams( location.search );
const W = + ( q.get( 'w' ) || 960 ), H = + ( q.get( 'h' ) || 540 );
const renderer = new THREE.WebGLRenderer( { canvas: document.getElementById( 'c' ), antialias: true } );
renderer.setSize( W, H, false );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
G.uSkyLUT.value = new THREE.DataTexture( new Uint8Array( [ 150, 180, 215, 255 ] ), 1, 1 ); G.uSkyLUT.value.needsUpdate = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x6a6e72 );
scene.add( new THREE.HemisphereLight( 0xcfe6ff, 0x3a3326, 1.2 ) );
const sun = new THREE.DirectionalLight( 0xffffff, 2.2 ); sun.position.set( 2, 4, 1.5 ); scene.add( sun );
const pm = new THREE.PMREMGenerator( renderer );
const env = pm.fromScene( new RoomEnvironment(), 0.04 ).texture;
const cam = new THREE.PerspectiveCamera( 35, W / H, 0.005, 20 );
const armR = new Arm( 1 ), armL = new Arm( - 1 );
scene.add( armR.root, armL.root );
armR.setEnvironment( env, 0.5 ); armL.setEnvironment( env, 0.5 );
const cyl = new THREE.Mesh( new THREE.CylinderGeometry( 1, 1, 1, 24 ), new THREE.MeshStandardMaterial( { color: 0x2a2c30, roughness: 0.6, metalness: 0.3 } ) );
scene.add( cyl );
const V = ( a ) => new THREE.Vector3( ...a );
window.pose = ( o = {} ) => {
	const r = o.r ?? 0.017;
	const g = { p: V( o.grip?.p || [ 0, 0, 0 ] ), a: V( o.grip?.a || [ 0, 1, 0 ] ).normalize(), n: V( o.grip?.n || [ 0, 0, 1 ] ).normalize(), r };
	cyl.scale.set( r, 0.14, r );
	cyl.position.copy( g.p );
	cyl.quaternion.setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), g.a );
	cyl.visible = o.cyl !== false;
	for ( const [ arm, side ] of [ [ armR, 1 ], [ armL, - 1 ] ] ) {
		const on = ( o.side ?? 1 ) === side || !! o.both;
		arm.visible = on;
		if ( ! on ) continue;
		arm.style( { skin: o.skin ?? null, sleeve: o.sleeve ?? null, long: !! o.long, glove: o.glove ?? null } );
		const gg = side > 0 ? g : { ...g, p: g.p.clone().add( V( o.lOff || [ 0, - 0.1, 0 ] ) ) };
		const M = wristMatrix( gg, side, new THREE.Matrix4() );
		arm.setCurl( o.curl || curlFor( o.flat ? 0.2 : r, o.tight ?? 1 ), THUMB_POSE[ o.thumb || 'wrap' ] || o.thumbA, o.splay || 0 );
		arm.pose( V( o.shoulder || [ side * 0.2, - 0.35, 0.45 ] ), M, o.bend );
	}
	const [ yw, pt, d ] = o.cam || [ 30, 15, 0.45 ];
	const L = V( o.look || [ 0, 0, 0.0 ] );
	const a = yw * Math.PI / 180, b = pt * Math.PI / 180;
	cam.position.set( L.x + Math.sin( a ) * Math.cos( b ) * d, L.y + Math.sin( b ) * d, L.z + Math.cos( a ) * Math.cos( b ) * d );
	cam.lookAt( L );
	renderer.render( scene, cam );
	return { ok: true, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
};
window.__ready = true;
