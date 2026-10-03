// Small visual pieces placed things share: an item's model as the world items draw it (merged per material), a soft
// additive glow sprite (lanterns, chemlights), a licking flame (candles, torches; one material for all, its clock
// advanced once a frame), the water a barrel or tarp holds, and the translucent green / red ghost shown while placing.
import * as THREE from 'three';
import { patchMaterial } from '../../../render/Materials.js';
import { setReactive } from '../../../render/post/Motion.js';
import { instanceParts } from '../../../render/ItemModels.js';
import { getItem } from '../ItemDB.js';
import { lookDef, lookKey } from '../ext/gear/logic.js';

// the def a placed thing is drawn from: its stack as it looks (a dyed poncho in its dye, the gear domain's looks), or
// the made thing's own def when the stack is the tool that made it
export function placedDef( p ) {
	return ( p?.stack && p.stack.id === p.item ? lookDef( lookKey( p.stack ) ) : null ) || getItem( p?.item );
}

// an item's model as a few meshes (one per material, the geometry the world items share): a lantern draws in three
// calls instead of ten
export function itemModel( def ) {
	const g = new THREE.Group();
	if ( ! def ) return g;
	for ( const part of instanceParts( def ) ) {
		const m = new THREE.Mesh( part.geometry, part.material );
		m.castShadow = part.castShadow;
		m.receiveShadow = true;
		if ( part.layer ) m.layers.set( part.layer );
		g.add( m );
	}
	return g;
}

let glowTex = null;
function glowTexture() {
	if ( glowTex ) return glowTex;
	const c = document.createElement( 'canvas' ); c.width = c.height = 64;
	const ctx = c.getContext( '2d' );
	const gr = ctx.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	gr.addColorStop( 0, 'rgba(255,255,255,1)' ); gr.addColorStop( 0.22, 'rgba(255,255,255,0.5)' ); gr.addColorStop( 1, 'rgba(255,255,255,0)' );
	ctx.fillStyle = gr; ctx.fillRect( 0, 0, 64, 64 );
	glowTex = new THREE.CanvasTexture( c );
	return glowTex;
}

export function glowSprite( color, size ) {
	const s = new THREE.Sprite( new THREE.SpriteMaterial( { map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false } ) );
	s.scale.setScalar( size );
	s.layers.set( 1 );
	s.renderOrder = 6;
	s.userData.fx = true;
	return s;
}

const FLAME_VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const FLAME_FRAG = /* glsl */`
	uniform float uT; varying vec2 vUv;
	float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
	float n2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( h( i ), h( i + vec2( 1, 0 ) ), u.x ), mix( h( i + vec2( 0, 1 ) ), h( i + vec2( 1, 1 ) ), u.x ), u.y ); }
	void main() {
		float y = vUv.y;
		float n = n2( vec2( vUv.x * 4.0, y * 3.0 - uT * 3.2 ) ) * 0.6 + n2( vec2( vUv.x * 9.0, y * 6.0 - uT * 5.0 ) ) * 0.4;
		float x = abs( vUv.x - 0.5 + ( n - 0.5 ) * 0.3 * y ) * 2.0;
		float width = mix( 0.85, 0.04, pow( y, 0.7 ) );
		float f = ( 1.0 - smoothstep( width * 0.5, width, x ) ) * smoothstep( 1.0, 0.3, y ) * ( 0.6 + n * 0.8 );
		f = clamp( f, 0.0, 1.0 );
		vec3 col = mix( vec3( 1.0, 0.32, 0.05 ), vec3( 1.0, 0.92, 0.6 ), smoothstep( 0.35, 0.95, f ) );
		gl_FragColor = vec4( col * ( 1.5 + 2.5 * f ), f * smoothstep( 0.0, 0.1, y ) );
	}`;
let flameMat = null, flameGeo = null;
export function flameMaterial() {
	return flameMat || ( flameMat = new THREE.ShaderMaterial( { uniforms: { uT: { value: 0 } }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } ) );
}
export function tickFlames( t ) { if ( flameMat ) flameMat.uniforms.uT.value = t; }

// crossed planes, `size` m tall, base at the origin
export function flame( size ) {
	flameGeo = flameGeo || new THREE.PlaneGeometry( 0.6, 1, 1, 1 ).translate( 0, 0.5, 0 );
	const g = new THREE.Group();
	for ( let i = 0; i < 2; i ++ ) {
		const m = new THREE.Mesh( flameGeo, flameMaterial() );
		m.rotation.y = i * Math.PI / 2;
		m.layers.set( 1 );
		m.renderOrder = 6;
		g.add( m );
	}
	g.scale.setScalar( size );
	g.userData.fx = true;
	return setReactive( g, 1 );
}

const waterMats = {};
export function waterMaterial( liquid ) {
	const k = liquid === 'dirty' ? 'dirty' : 'water';
	if ( waterMats[ k ] ) return waterMats[ k ];
	const m = new THREE.MeshStandardMaterial( { color: k === 'dirty' ? 0x3e3a26 : 0x2a4850, roughness: 0.04, metalness: 0.1 } );
	patchMaterial( m, 'item' );
	return ( waterMats[ k ] = m );
}

const ghostMats = {};
export function ghostMaterial( ok ) {
	const k = ok ? 'ok' : 'no';
	return ghostMats[ k ] || ( ghostMats[ k ] = new THREE.MeshBasicMaterial( { color: ok ? 0x5cff8a : 0xff4a3a, transparent: true, opacity: 0.38, depthWrite: false, fog: false } ) );
}

// turn a model clone into a ghost: every mesh drawn translucent on the post layer, effects hidden
export function ghostify( obj, ok ) {
	obj.traverse( ( o ) => {
		if ( o.userData.fx ) { o.visible = false; return; }
		if ( ! o.isMesh ) return;
		o.material = ghostMaterial( ok );
		o.castShadow = false; o.receiveShadow = false;
		o.layers.set( 1 );
		o.renderOrder = 7;
	} );
	return obj;
}

export function setGhost( obj, ok ) {
	const m = ghostMaterial( ok );
	obj.traverse( ( o ) => { if ( o.isMesh && ! o.userData.fx && o.material !== m ) o.material = m; } );
	const ring = obj.userData.ring;
	if ( ring ) ring.material = ringMaterial( ok );
}

// a footprint ring on the ground under the ghost, drawn over everything: small things (a snare, a candle) are easy
// to lose on the ground, and the ring shows where they will stand and how much room they take
const ringMats = {};
let ringGeo = null;
function ringMaterial( ok ) {
	const k = ok ? 'ok' : 'no';
	return ringMats[ k ] || ( ringMats[ k ] = new THREE.MeshBasicMaterial( { color: ok ? 0x5cff8a : 0xff4a3a, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false, fog: false } ) );
}
export function addFootprint( obj, r ) {
	ringGeo = ringGeo || new THREE.RingGeometry( 0.74, 1, 40 ).rotateX( - Math.PI / 2 );
	const ring = new THREE.Mesh( ringGeo, ringMaterial( false ) );
	ring.scale.setScalar( Math.max( 0.16, r + 0.06 ) );
	ring.position.y = 0.02;
	ring.layers.set( 1 );
	ring.renderOrder = 8;
	ring.userData.fx = true;
	obj.add( ring );
	obj.userData.ring = ring;
	return ring;
}
