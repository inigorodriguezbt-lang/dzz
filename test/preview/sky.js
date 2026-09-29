// Sky / clouds / post preview without the world: the renderer, the sky and a few lit objects on a sand
// plane. ?hour=12.5&yaw=150&pitch=5&cover=0.49&clouds=high. window.__sky: set( { hour, yaw, pitch, cover } ),
// stats(), frames.
import * as THREE from 'three';
import { Renderer } from '../../src/render/Renderer.js';
import { Sky } from '../../src/world/Sky.js';
import { G, patchMaterial } from '../../src/render/Materials.js';
import { SunShadows } from '../../src/render/Shadows.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const q = new URLSearchParams( location.search );
const values = { clouds: q.get( 'clouds' ) || 'high', bloom: true, antialias: q.get( 'aa' ) || 'fxaa', renderScale: 1, shadows: 'high', nightBrightness: 1, ao: true };
const settings = { get: ( k ) => values[ k ], set: ( k, v ) => { values[ k ] = v; }, on() {}, values };
const canvas = document.getElementById( 'c' );
const renderer = new Renderer( canvas, settings );
const gl = renderer.gl;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 62, innerWidth / innerHeight, 0.1, 70000 );
const sky = new Sky( renderer, settings );
scene.add( sky.dome );

// sand plane, a few boxes and spheres
const std = ( c, r = 0.9, m = 0 ) => patchMaterial( new THREE.MeshStandardMaterial( { color: c, roughness: r, metalness: m } ), 'sky-std' );
const sandCol = new THREE.Color().setRGB( 0.62, 0.52, 0.36 ); // linear sand albedo (Tidewater)
const ground = new THREE.Mesh( new THREE.PlaneGeometry( 60000, 60000, 1, 1 ).rotateX( - Math.PI / 2 ), std( sandCol ) );
ground.receiveShadow = true;
scene.add( ground );
const objs = [
	[ new THREE.BoxGeometry( 3, 3, 3 ), std( new THREE.Color().setRGB( 0.35, 0.3, 0.25 ) ), 8, 1.5, - 12 ],
	[ new THREE.SphereGeometry( 1.5, 32, 16 ), std( new THREE.Color().setRGB( 0.7, 0.7, 0.7 ), 0.3 ), - 5, 1.5, - 10 ],
	[ new THREE.CylinderGeometry( 0.25, 0.3, 9, 12 ), std( new THREE.Color().setRGB( 0.3, 0.25, 0.2 ) ), 2, 4.5, - 18 ],
	[ new THREE.BoxGeometry( 8, 5, 6 ), std( new THREE.Color().setRGB( 0.5, 0.55, 0.6 ) ), - 14, 2.5, - 30 ],
	[ new THREE.BoxGeometry( 40, 60, 40 ), std( new THREE.Color().setRGB( 0.4, 0.35, 0.3 ) ), 60, 30, - 400 ],
];
for ( const [ g, m, x, y, z ] of objs ) {
	const o = new THREE.Mesh( g, m );
	o.position.set( x, y, z );
	o.castShadow = o.receiveShadow = true;
	scene.add( o );
}
const sun = new THREE.DirectionalLight( 0xffffff, 1 );
scene.add( sun, sun.target );
const csm = new SunShadows( renderer );
csm.setQuality( values.shadows );
renderer.shadows = csm;
renderer.haze.cloudSource = sky.clouds;
renderer.flare.cloudSource = sky.clouds;

const state = { hour: + ( q.get( 'hour' ) || 12.5 ), yaw: + ( q.get( 'yaw' ) || 150 ), pitch: + ( q.get( 'pitch' ) || 5 ), cover: + ( q.get( 'cover' ) || 0.49 ), y: + ( q.get( 'y' ) || 1.7 ) };
function resize() {
	renderer.resize( innerWidth, innerHeight );
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	sky.resize( renderer.width, renderer.height );
}
addEventListener( 'resize', resize );
resize();

let last = performance.now();
const debugQuad = q.get( 'debug' ) ? new FullScreenQuad( new THREE.ShaderMaterial( {
	uniforms: { t: { value: null } },
	vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
	fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { vec3 c = texture2D( t, vUv ).rgb; ' + ( /depth/.test( q.get( 'debug' ) ) ? 'c = vec3( pow( c.r, 0.2 ) );' : /ao/.test( q.get( 'debug' ) ) ? 'c = c.rrr;' : 'c = c / ( c + 0.5 );' ) + ' gl_FragColor = vec4( c, 1.0 ); }',
	depthTest: false, depthWrite: false,
} ) ) : null;
window.__sky = {
	frames: 0, sky, renderer, scene, camera, G, settings,
	set( o ) { const { values: v, ...rest } = o; if ( v ) { Object.assign( values, v ); if ( v.shadows ) csm.setQuality( v.shadows ); } Object.assign( state, rest ); renderer.resetExposure(); },
	stats() {
		const s = sky;
		return { sun: s.sunColor.toArray().map( v => + v.toFixed( 3 ) ), key: s.keyColor.toArray().map( v => + v.toFixed( 4 ) ), irr: s.skyIrradiance.toArray().map( v => + v.toFixed( 4 ) ), hor: s.horizonColor.toArray().map( v => + v.toFixed( 3 ) ), sunY: + s.sunDir.y.toFixed( 3 ), sunYaw: + ( Math.atan2( - s.sunDir.x, - s.sunDir.z ) * 180 / Math.PI ).toFixed( 1 ), night: + s.night.toFixed( 3 ), calls: gl.info.render.calls, maxTex: gl.capabilities.maxTextures };
	},
};
function frame() {
	const now = performance.now();
	const dt = Math.min( 0.1, ( now - last ) / 1000 );
	last = now;
	sky.setTime( state.hour, 120 );
	sky.cloudCover = state.cover;
	camera.position.set( state.x || 0, state.y, state.z || 0 );
	camera.rotation.set( state.pitch * Math.PI / 180, state.yaw * Math.PI / 180, 0, 'YXZ' );
	camera.updateMatrixWorld();
	G.uTime.value += dt;
	G.uCamPos.value.copy( camera.position );
	sky.update( dt, camera, scene, settings );
	const L = sky.keyDir;
	sun.position.copy( camera.position ).addScaledVector( L, 700 );
	sun.target.position.copy( camera.position );
	sun.target.updateMatrixWorld();
	sun.color.copy( sky.keyColor );
	csm.update( camera, L, scene );
	renderer.render( { scene, camera, grade: { time: G.uTime.value } } );
	// ?debug=ao | aoraw | depth: a texture of the renderer in the lower-left quarter
	if ( debugQuad ) {
		const t = { ao: renderer.gtao.blurY.texture, aoraw: renderer.gtao.aoRT.texture, depth: renderer.gtao.depthRT.texture, scene: renderer.targets.scene.texture, beauty: renderer.targets.beauty.texture, taa: renderer.taa.texture, prevdepth: renderer.taa.prevDepth.texture }[ q.get( 'debug' ) ];
		debugQuad.material.uniforms.t.value = t;
		gl.setRenderTarget( null );
		gl.setViewport( 0, 0, innerWidth / 2, innerHeight / 2 );
		debugQuad.render( gl );
		gl.setViewport( 0, 0, innerWidth, innerHeight );
	}
	window.__sky.frames ++;
	requestAnimationFrame( frame );
}
window.__ready = true;
requestAnimationFrame( frame );
