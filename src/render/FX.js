// World effects: pooled billboard particles (sparks, dust, smoke, blood, flames, debris, splashes), fading
// decals (bullet holes, blood, scorch marks), tracer beams, short-lived and flickering point lights, fires,
// smoke screens and ejected brass. Everything is drawn in a handful of instanced draw calls, depth-tested against the
// opaque scene: decals and the alpha particles on render layer 1 (after the water composite), the additive particles
// (sparks, flashes, fire) and the tracers on LAYER_OVERLAY (after the TAA resolve, so they don't ghost).
//
//   game.fx = new FX( game )
//   impact( point, normal, mat, opts )   bullet / melee hit on a surface (particles + decal + sound)
//   blood( point, dir, amount )          blood mist, droplets and a splatter on whatever is behind
//   bloodDrip( pos )                     a drop on the ground (bleeding player)
//   muzzle( pos, dir, opts )             world-space muzzle flash + smoke (NPC shots, the player's smoke)
//   tracer( a, b, opts )                 a fading beam; beam( a, b, … ) draws one for this frame only
//   explosion( pos, r, opts )            fireball, debris, smoke column, scorch, light, sound, camera shake
//   fire( pos, opts ) -> handle          burning area (molotov, flare); handle.stop()
//   smoke( pos, opts ) -> handle         smoke screen; inSmoke( pos ), smokeBlocks( a, b ) for sight checks
//   sparks( pos, dir, n ), splash( pos, size ), casing( pos, vel, opts ), light( pos, color, i, range, dur )
//   decal( point, normal, kind, size )
import * as THREE from 'three';
import { G, COMMON_GLSL, patchMaterial } from './Materials.js';
import { LAYER_OVERLAY } from './Renderer.js';
import { setDynamic, setReactive } from './post/Motion.js';

export const FX_LAYER = 1;
const N = 4; // atlas cells per side

// particle atlas frames
export const F = {
	puff: 0, smoke: 1, spark: 2, blood: 3, dust: 4, chunk: 5, flame: 6, flame2: 7, star: 8, shard: 9, leaf: 10, drop: 11,
	ember: 12, ring: 13, glow: 14, cone: 15,
};
// decal atlas frames
const D = {
	hole_concrete: 0, hole_concrete2: 1, hole_wood: 2, hole_metal: 3, hole_glass: 4, hole_dirt: 5, blood: 6, blood2: 7,
	blood3: 8, blood_small: 9, scorch: 10, blood_pool: 11, hole_flesh: 12,
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const Z = new THREE.Vector3( 0, 0, 1 );
const rnd = Math.random;
const rr = ( a, b ) => a + ( b - a ) * rnd();

// ---- textures ------------------------------------------------------------------------------------------------

function canvas( w, h ) {
	const c = document.createElement( 'canvas' ); c.width = w; c.height = h;
	return c;
}

function particleAtlas() {
	const S = 128, c = canvas( S * N, S * N ), g = c.getContext( '2d' );
	let seed = 11;
	const R = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const cell = ( i, fn ) => { g.save(); g.translate( ( i % N ) * S, Math.floor( i / N ) * S ); g.beginPath(); g.rect( 0, 0, S, S ); g.clip(); fn( S / 2 ); g.restore(); };
	const radial = ( x, y, r, stops ) => { const gr = g.createRadialGradient( x, y, 0, x, y, r ); for ( const [ o, col ] of stops ) gr.addColorStop( o, col ); g.fillStyle = gr; g.beginPath(); g.arc( x, y, r, 0, 7 ); g.fill(); };
	// 0 soft puff
	cell( F.puff, h => radial( h, h, h, [ [ 0, 'rgba(255,255,255,1)' ], [ 0.45, 'rgba(255,255,255,0.55)' ], [ 1, 'rgba(255,255,255,0)' ] ] ) );
	// 1 billowy smoke: overlapping lumps
	cell( F.smoke, h => { for ( let i = 0; i < 16; i ++ ) { const a = R() * 6.28, d = R() * h * 0.42, r = h * ( 0.28 + R() * 0.3 ); radial( h + Math.cos( a ) * d, h + Math.sin( a ) * d, r, [ [ 0, 'rgba(255,255,255,0.5)' ], [ 0.6, 'rgba(235,235,235,0.25)' ], [ 1, 'rgba(220,220,220,0)' ] ] ); } } );
	// 2 spark: hot core
	cell( F.spark, h => radial( h, h, h, [ [ 0, 'rgba(255,255,255,1)' ], [ 0.15, 'rgba(255,255,255,0.9)' ], [ 0.4, 'rgba(255,255,255,0.25)' ], [ 1, 'rgba(255,255,255,0)' ] ] ) );
	// 3 blood droplets
	cell( F.blood, h => { for ( let i = 0; i < 9; i ++ ) { const a = R() * 6.28, d = R() * h * 0.5, r = h * ( 0.08 + R() * 0.2 ); radial( h + Math.cos( a ) * d, h + Math.sin( a ) * d, r, [ [ 0, 'rgba(255,255,255,1)' ], [ 0.7, 'rgba(255,255,255,0.9)' ], [ 1, 'rgba(255,255,255,0)' ] ] ); } } );
	// 4 dust: irregular soft
	cell( F.dust, h => { for ( let i = 0; i < 26; i ++ ) { const a = R() * 6.28, d = R() * h * 0.55, r = h * ( 0.12 + R() * 0.22 ); radial( h + Math.cos( a ) * d, h + Math.sin( a ) * d, r, [ [ 0, 'rgba(255,255,255,0.35)' ], [ 1, 'rgba(255,255,255,0)' ] ] ); } } );
	// 5 debris chunk: a hard irregular polygon
	cell( F.chunk, h => { g.fillStyle = '#fff'; g.beginPath(); for ( let i = 0; i < 7; i ++ ) { const a = i / 7 * 6.28, r = h * ( 0.35 + R() * 0.45 ); g.lineTo( h + Math.cos( a ) * r, h + Math.sin( a ) * r ); } g.fill(); } );
	// 6, 7 flames: teardrops with a hot base
	for ( const [ fi, wob ] of [ [ F.flame, 0.2 ], [ F.flame2, - 0.25 ] ] ) {
		cell( fi, h => {
			for ( let k = 0; k < 3; k ++ ) {
				const gr = g.createRadialGradient( h, h * 1.35, 0, h, h * 1.1, h * ( 0.95 - k * 0.2 ) );
				gr.addColorStop( 0, 'rgba(255,255,255,0.9)' ); gr.addColorStop( 0.5, 'rgba(255,255,255,0.45)' ); gr.addColorStop( 1, 'rgba(255,255,255,0)' );
				g.fillStyle = gr;
				g.beginPath();
				g.moveTo( h + wob * h * ( 1 - k * 0.3 ), h * 0.08 + k * h * 0.15 );
				g.bezierCurveTo( h + h * 0.75, h * 0.8, h + h * 0.55, h * 1.9, h, h * 1.9 );
				g.bezierCurveTo( h - h * 0.55, h * 1.9, h - h * 0.75, h * 0.8, h + wob * h * ( 1 - k * 0.3 ), h * 0.08 + k * h * 0.15 );
				g.fill();
			}
		} );
	}
	// 8 muzzle star: 5 spikes + core
	cell( F.star, h => {
		radial( h, h, h * 0.55, [ [ 0, 'rgba(255,255,255,1)' ], [ 0.5, 'rgba(255,255,255,0.6)' ], [ 1, 'rgba(255,255,255,0)' ] ] );
		for ( let i = 0; i < 6; i ++ ) {
			const a = i / 6 * 6.28 + R() * 0.4, L = h * ( 0.7 + R() * 0.3 ), w = h * 0.12;
			g.save(); g.translate( h, h ); g.rotate( a );
			const gr = g.createLinearGradient( 0, 0, L, 0 ); gr.addColorStop( 0, 'rgba(255,255,255,0.95)' ); gr.addColorStop( 1, 'rgba(255,255,255,0)' );
			g.fillStyle = gr; g.beginPath(); g.moveTo( 0, - w ); g.lineTo( L, 0 ); g.lineTo( 0, w ); g.fill(); g.restore();
		}
	} );
	// 9 glass shard: a thin bright diamond
	cell( F.shard, h => { g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.moveTo( h, h * 0.2 ); g.lineTo( h * 1.3, h ); g.lineTo( h, h * 1.8 ); g.lineTo( h * 0.8, h ); g.fill(); } );
	// 10 leaf
	cell( F.leaf, h => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse( h, h, h * 0.35, h * 0.8, 0.5, 0, 7 ); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo( h - h * 0.3, h + h * 0.6 ); g.lineTo( h + h * 0.3, h - h * 0.6 ); g.stroke(); } );
	// 11 water droplet
	cell( F.drop, h => radial( h, h, h * 0.7, [ [ 0, 'rgba(255,255,255,0.95)' ], [ 0.6, 'rgba(255,255,255,0.5)' ], [ 1, 'rgba(255,255,255,0)' ] ] ) );
	// 12 ember: small hard dot
	cell( F.ember, h => radial( h, h, h * 0.4, [ [ 0, 'rgba(255,255,255,1)' ], [ 0.6, 'rgba(255,255,255,0.8)' ], [ 1, 'rgba(255,255,255,0)' ] ] ) );
	// 13 ring
	cell( F.ring, h => { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = h * 0.12; g.beginPath(); g.arc( h, h, h * 0.8, 0, 7 ); g.stroke(); } );
	// 14 wide glow
	cell( F.glow, h => radial( h, h, h, [ [ 0, 'rgba(255,255,255,1)' ], [ 0.2, 'rgba(255,255,255,0.5)' ], [ 0.5, 'rgba(255,255,255,0.12)' ], [ 1, 'rgba(255,255,255,0)' ] ] ) );
	// 15 side flame cone (points +x)
	cell( F.cone, h => {
		const gr = g.createLinearGradient( 0, h, S, h ); gr.addColorStop( 0, 'rgba(255,255,255,1)' ); gr.addColorStop( 0.6, 'rgba(255,255,255,0.5)' ); gr.addColorStop( 1, 'rgba(255,255,255,0)' );
		g.fillStyle = gr; g.beginPath(); g.moveTo( 0, h - h * 0.3 ); g.quadraticCurveTo( h, h - h * 0.5, S, h ); g.quadraticCurveTo( h, h + h * 0.5, 0, h + h * 0.3 ); g.fill();
	} );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.NoColorSpace;
	t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
	return t;
}

function decalAtlas() {
	const S = 128, c = canvas( S * N, S * N ), g = c.getContext( '2d' );
	let seed = 5;
	const R = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const cell = ( i, fn ) => { g.save(); g.translate( ( i % N ) * S, Math.floor( i / N ) * S ); g.beginPath(); g.rect( 0, 0, S, S ); g.clip(); fn( S / 2 ); g.restore(); };
	const radial = ( x, y, r, stops ) => { const gr = g.createRadialGradient( x, y, 0, x, y, r ); for ( const [ o, col ] of stops ) gr.addColorStop( o, col ); g.fillStyle = gr; g.beginPath(); g.arc( x, y, r, 0, 7 ); g.fill(); };
	// rgb = colour, a = coverage
	const hole = ( h, rim, core, chips ) => {
		radial( h, h, h * 0.9, [ [ 0, rim ], [ 0.35, rim.replace( /[\d.]+\)$/, '0.55)' ) ], [ 1, 'rgba(0,0,0,0)' ] ] );
		for ( let i = 0; i < chips; i ++ ) { const a = R() * 6.28, d = h * ( 0.15 + R() * 0.45 ); g.fillStyle = rim.replace( /[\d.]+\)$/, ( 0.3 + R() * 0.4 ).toFixed( 2 ) + ')' ); g.beginPath(); g.arc( h + Math.cos( a ) * d, h + Math.sin( a ) * d, h * ( 0.03 + R() * 0.08 ), 0, 7 ); g.fill(); }
		radial( h, h, h * 0.22, [ [ 0, core ], [ 0.7, core ], [ 1, 'rgba(0,0,0,0)' ] ] );
	};
	cell( D.hole_concrete, h => hole( h, 'rgba(120,114,104,0.9)', 'rgba(18,16,14,1)', 14 ) );
	cell( D.hole_concrete2, h => hole( h, 'rgba(96,92,86,0.85)', 'rgba(14,12,10,1)', 20 ) );
	cell( D.hole_wood, h => {
		for ( let i = 0; i < 10; i ++ ) { const a = R() * 6.28; g.strokeStyle = `rgba(${150 + R() * 40 | 0},${110 + R() * 30 | 0},70,0.7)`; g.lineWidth = 2 + R() * 3; g.beginPath(); g.moveTo( h, h ); g.lineTo( h + Math.cos( a ) * h * ( 0.3 + R() * 0.5 ), h + Math.sin( a ) * h * ( 0.2 + R() * 0.3 ) ); g.stroke(); }
		radial( h, h, h * 0.2, [ [ 0, 'rgba(20,12,6,1)' ], [ 0.8, 'rgba(30,18,8,1)' ], [ 1, 'rgba(0,0,0,0)' ] ] );
	} );
	cell( D.hole_metal, h => { radial( h, h, h * 0.35, [ [ 0, 'rgba(10,10,10,1)' ], [ 0.45, 'rgba(15,15,15,1)' ], [ 0.6, 'rgba(210,205,200,0.9)' ], [ 0.85, 'rgba(160,150,140,0.5)' ], [ 1, 'rgba(0,0,0,0)' ] ] ); } );
	cell( D.hole_glass, h => {
		g.strokeStyle = 'rgba(235,240,245,0.75)'; g.lineWidth = 1.5;
		for ( let i = 0; i < 12; i ++ ) { const a = i / 12 * 6.28 + R() * 0.3; g.beginPath(); g.moveTo( h, h ); let x = h, y = h; for ( let k = 0; k < 4; k ++ ) { x += Math.cos( a + ( R() - 0.5 ) * 0.5 ) * h * 0.22; y += Math.sin( a + ( R() - 0.5 ) * 0.5 ) * h * 0.22; g.lineTo( x, y ); } g.stroke(); }
		for ( let r = 0.25; r < 0.8; r += 0.22 ) { g.beginPath(); for ( let i = 0; i <= 12; i ++ ) { const a = i / 12 * 6.28; g.lineTo( h + Math.cos( a ) * h * r * ( 0.9 + R() * 0.2 ), h + Math.sin( a ) * h * r * ( 0.9 + R() * 0.2 ) ); } g.stroke(); }
		radial( h, h, h * 0.12, [ [ 0, 'rgba(20,24,28,0.9)' ], [ 1, 'rgba(200,210,220,0.3)' ] ] );
	} );
	cell( D.hole_dirt, h => { radial( h, h, h * 0.8, [ [ 0, 'rgba(38,28,20,0.95)' ], [ 0.4, 'rgba(60,45,32,0.6)' ], [ 1, 'rgba(0,0,0,0)' ] ] ); } );
	const splat = ( h, n, spread, drops ) => {
		const col = () => `rgba(${95 + R() * 30 | 0},${6 + R() * 8 | 0},${8 + R() * 6 | 0},${0.8 + R() * 0.2})`;
		for ( let i = 0; i < n; i ++ ) { const a = R() * 6.28, d = R() * h * spread; g.fillStyle = col(); g.beginPath(); g.ellipse( h + Math.cos( a ) * d, h + Math.sin( a ) * d, h * ( 0.08 + R() * 0.2 ), h * ( 0.06 + R() * 0.14 ), a, 0, 7 ); g.fill(); }
		for ( let i = 0; i < drops; i ++ ) { const a = R() * 6.28, d = h * ( 0.4 + R() * 0.55 ); g.fillStyle = col(); g.beginPath(); g.arc( h + Math.cos( a ) * d, h + Math.sin( a ) * d, h * ( 0.015 + R() * 0.04 ), 0, 7 ); g.fill(); }
	};
	cell( D.blood, h => splat( h, 12, 0.35, 30 ) );
	cell( D.blood2, h => splat( h, 18, 0.5, 20 ) );
	cell( D.blood3, h => { splat( h, 6, 0.2, 40 ); } );
	cell( D.blood_small, h => splat( h, 4, 0.15, 6 ) );
	cell( D.scorch, h => { for ( let i = 0; i < 20; i ++ ) { const a = R() * 6.28, d = R() * h * 0.5; radial( h + Math.cos( a ) * d, h + Math.sin( a ) * d, h * ( 0.3 + R() * 0.3 ), [ [ 0, 'rgba(8,7,6,0.5)' ], [ 1, 'rgba(0,0,0,0)' ] ] ); } } );
	cell( D.blood_pool, h => { g.fillStyle = 'rgba(70,4,6,0.95)'; g.beginPath(); for ( let i = 0; i <= 16; i ++ ) { const a = i / 16 * 6.28, r = h * ( 0.55 + R() * 0.3 ); g.lineTo( h + Math.cos( a ) * r, h + Math.sin( a ) * r ); } g.fill(); radial( h * 0.8, h * 0.8, h * 0.4, [ [ 0, 'rgba(140,30,30,0.35)' ], [ 1, 'rgba(0,0,0,0)' ] ] ); } );
	cell( D.hole_flesh, h => splat( h, 5, 0.1, 12 ) );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

// ---- shaders ---------------------------------------------------------------------------------------------------

const PARS = /* glsl */`
	uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform sampler2D uSkyLUT;
	uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBoost; uniform float uCloudCover;
	uniform vec2 uCloudOffset; uniform float uCloudShadowK; uniform float uNight; uniform float uTime;
`;

const PARTICLE_VS = /* glsl */`
	#include <common>
	#include <logdepthbuf_pars_vertex>
	attribute vec2 corner;
	attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iMisc; attribute vec3 iColor;
	varying vec2 vUv; varying vec4 vColor; varying vec3 vWorld;
	void main() {
		vec4 mv = viewMatrix * vec4( iPos, 1.0 );
		float size = iMisc.x;
		vec3 velV = ( viewMatrix * vec4( iVel, 0.0 ) ).xyz;
		float sl = length( velV.xy );
		vec2 off;
		if ( sl > 1e-5 ) {
			// stretched along the screen-projected velocity (sparks, rain of debris)
			vec2 ax = velV.xy / sl, ay = vec2( - ax.y, ax.x );
			off = ax * corner.x * ( size + sl ) + ay * corner.y * size;
		} else {
			float cs = cos( iMisc.y ), sn = sin( iMisc.y );
			off = vec2( corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs ) * size;
		}
		mv.xy += off;
		// fade what gets right up to the lens instead of filling the screen
		float nearFade = smoothstep( 0.15, 0.9, - mv.z );
		gl_Position = projectionMatrix * mv;
		#include <logdepthbuf_vertex>
		float f = iMisc.z;
		vec2 cell = vec2( mod( f, ${N}.0 ), ${N - 1}.0 - floor( f / ${N}.0 ) );
		vUv = ( cell + corner * 0.5 + 0.5 ) / ${N}.0;
		vColor = vec4( iColor, iMisc.w * nearFade );
		vWorld = iPos;
	}`;

const PARTICLE_FS = /* glsl */`
	#include <common>
	#include <logdepthbuf_pars_fragment>
	${PARS}
	${COMMON_GLSL}
	uniform sampler2D uAtlas;
	varying vec2 vUv; varying vec4 vColor; varying vec3 vWorld;
	void main() {
		#include <logdepthbuf_fragment>
		vec4 t = texture2D( uAtlas, vUv );
		float a = t.a * vColor.a;
		if ( a < 0.003 ) discard;
		#ifdef ADDITIVE
			// hot things: fade with the air between us and them
			float d = length( vWorld - uCamPos );
			float T = exp( - d * uFogDensity * uFogBoost * 2.0 );
			gl_FragColor = vec4( vColor.rgb * t.rgb * T, a );
		#else
			// dust, smoke and blood catch the sun and the sky
			float day = clamp( uSunDir.y * 3.0 + 0.3, 0.0, 1.0 );
			vec3 L = uSunColor * 0.32 * day + mix( vec3( 0.34, 0.37, 0.42 ), vec3( 0.03, 0.04, 0.07 ), uNight );
			vec3 col = vColor.rgb * t.rgb * L;
			col = atmosphereFog( col, vWorld );
			gl_FragColor = vec4( col, a );
		#endif
	}`;

const DECAL_VS = /* glsl */`
	#include <common>
	#include <logdepthbuf_pars_vertex>
	attribute vec2 iDecal; // frame, alpha
	varying vec2 vUv; varying float vAlpha; varying vec3 vWorld; varying vec3 vNormalW;
	void main() {
		vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
		vNormalW = normalize( mat3( modelMatrix * instanceMatrix ) * vec3( 0.0, 0.0, 1.0 ) );
		vWorld = wp.xyz;
		gl_Position = projectionMatrix * viewMatrix * wp;
		#include <logdepthbuf_vertex>
		float f = iDecal.x;
		vec2 cell = vec2( mod( f, ${N}.0 ), ${N - 1}.0 - floor( f / ${N}.0 ) );
		vUv = ( cell + uv ) / ${N}.0;
		vAlpha = iDecal.y;
	}`;

const DECAL_FS = /* glsl */`
	#include <common>
	#include <logdepthbuf_pars_fragment>
	${PARS}
	${COMMON_GLSL}
	uniform sampler2D uAtlas;
	varying vec2 vUv; varying float vAlpha; varying vec3 vWorld; varying vec3 vNormalW;
	void main() {
		#include <logdepthbuf_fragment>
		vec4 t = texture2D( uAtlas, vUv );
		float a = t.a * vAlpha;
		if ( a < 0.01 ) discard;
		vec3 s = normalize( uSunDir );
		float ndl = max( dot( vNormalW, s ), 0.0 ) * cloudShadowAt( vWorld );
		vec3 L = uSunColor * ndl * 0.3 + mix( vec3( 0.32, 0.34, 0.38 ), vec3( 0.03, 0.035, 0.06 ), uNight );
		vec3 col = atmosphereFog( t.rgb * L, vWorld );
		gl_FragColor = vec4( col, a );
	}`;

const BEAM_VS = /* glsl */`
	#include <common>
	#include <logdepthbuf_pars_vertex>
	attribute vec2 corner; // x 0..1 along, y -1..1 across
	attribute vec3 iA; attribute vec3 iB; attribute vec4 iColor; attribute float iWidth;
	varying vec2 vC; varying vec4 vColor; varying vec3 vWorld;
	void main() {
		vec3 a = ( viewMatrix * vec4( iA, 1.0 ) ).xyz, b = ( viewMatrix * vec4( iB, 1.0 ) ).xyz;
		vec3 p = mix( a, b, corner.x );
		vec3 t = normalize( b - a + vec3( 1e-6 ) );
		vec3 side = normalize( cross( t, normalize( p ) ) + vec3( 1e-6 ) );
		// keep a minimum on-screen width so distant tracers don't vanish into sub-pixel lines
		float w = max( iWidth, - p.z * 0.0012 );
		p += side * corner.y * w;
		gl_Position = projectionMatrix * vec4( p, 1.0 );
		#include <logdepthbuf_vertex>
		vC = corner;
		vColor = iColor;
		vWorld = mix( iA, iB, corner.x );
	}`;

const BEAM_FS = /* glsl */`
	#include <common>
	#include <logdepthbuf_pars_fragment>
	varying vec2 vC; varying vec4 vColor; varying vec3 vWorld;
	void main() {
		#include <logdepthbuf_fragment>
		float across = 1.0 - vC.y * vC.y;
		float along = smoothstep( 0.0, 0.7, vC.x );
		gl_FragColor = vec4( vColor.rgb, vColor.a * across * across * along );
	}`;

// ---- particle pool ---------------------------------------------------------------------------------------------

class Pool {
	constructor( max, additive, atlas ) {
		this.max = max;
		this.n = 0;
		const geo = new THREE.InstancedBufferGeometry();
		geo.setAttribute( 'corner', new THREE.Float32BufferAttribute( [ - 1, - 1, 1, - 1, 1, 1, - 1, 1 ], 2 ) );
		geo.setAttribute( 'position', new THREE.Float32BufferAttribute( new Float32Array( 12 ), 3 ) );
		geo.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
		this.aPos = new THREE.InstancedBufferAttribute( new Float32Array( max * 3 ), 3 ).setUsage( THREE.DynamicDrawUsage );
		this.aVel = new THREE.InstancedBufferAttribute( new Float32Array( max * 3 ), 3 ).setUsage( THREE.DynamicDrawUsage );
		this.aMisc = new THREE.InstancedBufferAttribute( new Float32Array( max * 4 ), 4 ).setUsage( THREE.DynamicDrawUsage );
		this.aCol = new THREE.InstancedBufferAttribute( new Float32Array( max * 3 ), 3 ).setUsage( THREE.DynamicDrawUsage );
		geo.setAttribute( 'iPos', this.aPos ); geo.setAttribute( 'iVel', this.aVel ); geo.setAttribute( 'iMisc', this.aMisc ); geo.setAttribute( 'iColor', this.aCol );
		geo.instanceCount = 0;
		const mat = new THREE.ShaderMaterial( {
			name: additive ? 'FXAdd' : 'FXAlpha',
			uniforms: Object.assign( { uAtlas: { value: atlas } }, G ),
			vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
			defines: additive ? { ADDITIVE: '' } : {},
			transparent: true, depthWrite: false,
			blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
		} );
		this.mesh = new THREE.Mesh( geo, mat );
		this.mesh.frustumCulled = false;
		// (the additive pool: sparks, flashes, fire. They move too fast for the TAA history: drawn after its resolve)
		this.mesh.layers.set( additive ? LAYER_OVERLAY : FX_LAYER );
		this.mesh.renderOrder = additive ? 12 : 10;
		this.geo = geo;
		// simulation state (struct of arrays)
		const f = n => new Float32Array( max * n );
		this.p = f( 3 ); this.v = f( 3 ); this.c = f( 3 );
		this.life = f( 1 ); this.maxLife = f( 1 ); this.s0 = f( 1 ); this.s1 = f( 1 ); this.rot = f( 1 ); this.rotV = f( 1 );
		this.frame = f( 1 ); this.a0 = f( 1 ); this.grav = f( 1 ); this.drag = f( 1 ); this.stretch = f( 1 ); this.floor = f( 1 );
		this.fadeIn = f( 1 ); this.bounce = f( 1 );
	}

	// o: { x,y,z, vx,vy,vz, life, s0, s1, rot, rotV, frame, r,g,b, a, grav, drag, stretch, floor, fadeIn, bounce }
	emit( o ) {
		let i = this.n;
		if ( i >= this.max ) { i = Math.floor( rnd() * this.max ); } else this.n ++;
		const i3 = i * 3;
		this.p[ i3 ] = o.x; this.p[ i3 + 1 ] = o.y; this.p[ i3 + 2 ] = o.z;
		this.v[ i3 ] = o.vx || 0; this.v[ i3 + 1 ] = o.vy || 0; this.v[ i3 + 2 ] = o.vz || 0;
		this.c[ i3 ] = o.r ?? 1; this.c[ i3 + 1 ] = o.g ?? 1; this.c[ i3 + 2 ] = o.b ?? 1;
		this.life[ i ] = 0; this.maxLife[ i ] = o.life || 1;
		this.s0[ i ] = o.s0 ?? 0.1; this.s1[ i ] = o.s1 ?? this.s0[ i ];
		this.rot[ i ] = o.rot ?? rnd() * 6.28; this.rotV[ i ] = o.rotV || 0;
		this.frame[ i ] = o.frame || 0; this.a0[ i ] = o.a ?? 1;
		this.grav[ i ] = o.grav || 0; this.drag[ i ] = o.drag || 0; this.stretch[ i ] = o.stretch || 0;
		this.floor[ i ] = o.floor ?? - 1e9; this.fadeIn[ i ] = o.fadeIn || 0; this.bounce[ i ] = o.bounce ?? 0.3;
	}

	update( dt ) {
		let w = 0;
		const P = this.aPos.array, V = this.aVel.array, M = this.aMisc.array, C = this.aCol.array;
		for ( let i = 0; i < this.n; i ++ ) {
			const L = this.life[ i ] + dt;
			if ( L >= this.maxLife[ i ] ) continue;
			const i3 = i * 3;
			// integrate
			let vx = this.v[ i3 ], vy = this.v[ i3 + 1 ], vz = this.v[ i3 + 2 ];
			const dr = Math.max( 0, 1 - this.drag[ i ] * dt );
			vx *= dr; vy = vy * dr - this.grav[ i ] * dt; vz *= dr;
			let x = this.p[ i3 ] + vx * dt, y = this.p[ i3 + 1 ] + vy * dt, z = this.p[ i3 + 2 ] + vz * dt;
			if ( y < this.floor[ i ] ) {
				y = this.floor[ i ];
				const b = this.bounce[ i ];
				vy = - vy * b; vx *= 0.55; vz *= 0.55;
				if ( Math.abs( vy ) < 0.4 ) { vy = 0; vx *= 0.8; vz *= 0.8; }
			}
			// compact into slot w
			const w3 = w * 3;
			this.p[ w3 ] = x; this.p[ w3 + 1 ] = y; this.p[ w3 + 2 ] = z;
			this.v[ w3 ] = vx; this.v[ w3 + 1 ] = vy; this.v[ w3 + 2 ] = vz;
			if ( w !== i ) {
				this.c[ w3 ] = this.c[ i3 ]; this.c[ w3 + 1 ] = this.c[ i3 + 1 ]; this.c[ w3 + 2 ] = this.c[ i3 + 2 ];
				this.maxLife[ w ] = this.maxLife[ i ]; this.s0[ w ] = this.s0[ i ]; this.s1[ w ] = this.s1[ i ];
				this.rotV[ w ] = this.rotV[ i ]; this.frame[ w ] = this.frame[ i ]; this.a0[ w ] = this.a0[ i ];
				this.grav[ w ] = this.grav[ i ]; this.drag[ w ] = this.drag[ i ]; this.stretch[ w ] = this.stretch[ i ];
				this.floor[ w ] = this.floor[ i ]; this.fadeIn[ w ] = this.fadeIn[ i ]; this.bounce[ w ] = this.bounce[ i ];
			}
			this.life[ w ] = L;
			this.rot[ w ] = this.rot[ i ] + this.rotV[ w ] * dt;
			const t = L / this.maxLife[ w ];
			// attributes
			P[ w3 ] = x; P[ w3 + 1 ] = y; P[ w3 + 2 ] = z;
			const st = this.stretch[ w ];
			V[ w3 ] = vx * st; V[ w3 + 1 ] = vy * st; V[ w3 + 2 ] = vz * st;
			const w4 = w * 4;
			M[ w4 ] = this.s0[ w ] + ( this.s1[ w ] - this.s0[ w ] ) * t;
			M[ w4 + 1 ] = this.rot[ w ];
			M[ w4 + 2 ] = this.frame[ w ];
			const fi = this.fadeIn[ w ];
			M[ w4 + 3 ] = this.a0[ w ] * ( 1 - t ) * ( 1 - t * 0.3 ) * ( fi > 0 ? Math.min( 1, t / fi ) : 1 );
			C[ w3 ] = this.c[ w3 ]; C[ w3 + 1 ] = this.c[ w3 + 1 ]; C[ w3 + 2 ] = this.c[ w3 + 2 ];
			w ++;
		}
		this.n = w;
		this.geo.instanceCount = w;
		if ( w ) {
			for ( const a of [ this.aPos, this.aVel, this.aCol ] ) { a.clearUpdateRanges(); a.addUpdateRange( 0, w * 3 ); a.needsUpdate = true; }
			this.aMisc.clearUpdateRanges(); this.aMisc.addUpdateRange( 0, w * 4 ); this.aMisc.needsUpdate = true;
		}
	}
}

// ---- the FX system ---------------------------------------------------------------------------------------------

const MAT_FX = {
	concrete: { dust: [ 0.62, 0.6, 0.56 ], chunk: [ 0.55, 0.53, 0.5 ], decal: [ D.hole_concrete, D.hole_concrete2 ], sound: 'hit_concrete', sparks: 2 },
	rock: { dust: [ 0.55, 0.52, 0.48 ], chunk: [ 0.42, 0.4, 0.38 ], decal: [ D.hole_concrete2 ], sound: 'hit_concrete', sparks: 3 },
	metal: { dust: [ 0.35, 0.33, 0.32 ], chunk: [ 0.3, 0.3, 0.3 ], decal: [ D.hole_metal ], sound: 'hit_metal', sparks: 12 },
	wood: { dust: [ 0.62, 0.5, 0.36 ], chunk: [ 0.55, 0.4, 0.24 ], decal: [ D.hole_wood ], sound: 'hit_wood', sparks: 0 },
	glass: { dust: [ 0.8, 0.84, 0.88 ], chunk: [ 0.85, 0.9, 0.95 ], decal: [ D.hole_glass ], sound: 'glass', sparks: 0, shards: 1 },
	dirt: { dust: [ 0.5, 0.42, 0.32 ], chunk: [ 0.3, 0.24, 0.18 ], decal: [ D.hole_dirt ], sound: 'hit_concrete', rate: 0.6, sparks: 0 },
	sand: { dust: [ 0.85, 0.78, 0.62 ], chunk: [ 0.75, 0.68, 0.52 ], decal: [ D.hole_dirt ], sound: 'hit_concrete', rate: 0.5, sparks: 0 },
	foliage: { dust: [ 0.35, 0.45, 0.25 ], chunk: [ 0.25, 0.45, 0.18 ], decal: null, sound: null, sparks: 0, leaves: 1 },
	flesh: { blood: 1 },
	water: { water: 1 },
};

export class FX {
	constructor( game, scene = null ) {
		this.game = game;
		this.scene = scene || game.scene;
		const atlas = particleAtlas();
		this.alpha = new Pool( 1600, false, atlas );
		this.add = new Pool( 900, true, atlas );
		this.scene.add( this.alpha.mesh, this.add.mesh );
		// the alpha particles go through the TAA: its history fades under them in proportion to their alpha
		setReactive( this.alpha.mesh, 0.8 );
		this._p = {};
		this.t = 0;
		this._initDecals();
		this._initBeams();
		this._initLights();
		this._initCasings();
		this.fires = [];
		this.smokes = [];
		this.tracers = [];
	}

	get audio() { return this.game?.audio; }
	get physics() { return this.game?.physics; }

	// ---- decals ----
	_initDecals() {
		const MAX = 320;
		const geo = new THREE.PlaneGeometry( 1, 1 );
		this.dAttr = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 2 ), 2 ).setUsage( THREE.DynamicDrawUsage );
		geo.setAttribute( 'iDecal', this.dAttr );
		const mat = new THREE.ShaderMaterial( {
			name: 'FXDecal', uniforms: Object.assign( { uAtlas: { value: decalAtlas() } }, G ),
			vertexShader: DECAL_VS, fragmentShader: DECAL_FS, transparent: true, depthWrite: false,
		} );
		this.decals = new THREE.InstancedMesh( geo, mat, MAX );
		this.decals.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
		this.decals.count = 0;
		this.decals.frustumCulled = false;
		this.decals.layers.set( FX_LAYER );
		this.decals.renderOrder = 5;
		this.scene.add( this.decals );
		this.dMax = MAX; this.dNext = 0; this.dBorn = new Float32Array( MAX ); this.dLife = new Float32Array( MAX ); this.dA = new Float32Array( MAX );
	}

	// kind: a D key; size in metres
	decal( point, normal, kind = 'hole_concrete', size = 0.1, life = 120, alpha = 1 ) {
		const i = this.dNext;
		this.dNext = ( this.dNext + 1 ) % this.dMax;
		if ( this.decals.count < this.dMax ) this.decals.count = Math.max( this.decals.count, i + 1 );
		_v.copy( normal ).normalize();
		_q.setFromUnitVectors( Z, _v );
		const spin = new THREE.Quaternion().setFromAxisAngle( Z, rnd() * 6.28 );
		_q.multiply( spin );
		_v2.copy( point ).addScaledVector( _v, 0.008 + rnd() * 0.004 );
		_m.compose( _v2, _q, _s.set( size, size, size ) );
		this.decals.setMatrixAt( i, _m );
		this.decals.instanceMatrix.needsUpdate = true;
		this.dAttr.array[ i * 2 ] = typeof kind === 'number' ? kind : D[ kind ] ?? 0;
		this.dAttr.array[ i * 2 + 1 ] = alpha;
		this.dA[ i ] = alpha;
		this.dAttr.needsUpdate = true;
		this.dBorn[ i ] = this.t; this.dLife[ i ] = life;
	}

	_updateDecals() {
		// fade the last fifth of each decal's life (checked a few times a second)
		if ( ( this._dT = ( this._dT || 0 ) + 1 ) % 10 ) return;
		let dirty = false;
		for ( let i = 0; i < this.decals.count; i ++ ) {
			const age = this.t - this.dBorn[ i ], L = this.dLife[ i ];
			if ( age < L * 0.8 ) continue;
			const a = age >= L ? 0 : this.dA[ i ] * ( 1 - ( age - L * 0.8 ) / ( L * 0.2 ) );
			if ( this.dAttr.array[ i * 2 + 1 ] !== a ) { this.dAttr.array[ i * 2 + 1 ] = a; dirty = true; }
		}
		if ( dirty ) this.dAttr.needsUpdate = true;
	}

	// ---- beams (tracers) ----
	_initBeams() {
		const MAX = 96;
		const geo = new THREE.InstancedBufferGeometry();
		geo.setAttribute( 'corner', new THREE.Float32BufferAttribute( [ 0, - 1, 1, - 1, 1, 1, 0, 1 ], 2 ) );
		geo.setAttribute( 'position', new THREE.Float32BufferAttribute( new Float32Array( 12 ), 3 ) );
		geo.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
		this.bA = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 3 ), 3 ).setUsage( THREE.DynamicDrawUsage );
		this.bB = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 3 ), 3 ).setUsage( THREE.DynamicDrawUsage );
		this.bC = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 4 ), 4 ).setUsage( THREE.DynamicDrawUsage );
		this.bW = new THREE.InstancedBufferAttribute( new Float32Array( MAX ), 1 ).setUsage( THREE.DynamicDrawUsage );
		geo.setAttribute( 'iA', this.bA ); geo.setAttribute( 'iB', this.bB ); geo.setAttribute( 'iColor', this.bC ); geo.setAttribute( 'iWidth', this.bW );
		geo.instanceCount = 0;
		const mat = new THREE.ShaderMaterial( { name: 'FXBeam', vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } );
		this.beams = new THREE.Mesh( geo, mat );
		this.beams.frustumCulled = false;
		this.beams.layers.set( LAYER_OVERLAY ); // tracers: after the TAA resolve, they'd ghost through its history
		this.beams.renderOrder = 13;
		this.scene.add( this.beams );
		this.bMax = MAX; this.bN = 0;
	}

	// a beam for this frame only (live tracers, laser-ish streaks)
	beam( a, b, color = 0xffc080, width = 0.01, alpha = 1, intensity = 3 ) {
		if ( this.bN >= this.bMax ) return;
		const i = this.bN ++;
		// (element by element: no temporary arrays per bullet per frame)
		const A = this.bA.array, B = this.bB.array, C = this.bC.array;
		A[ i * 3 ] = a.x; A[ i * 3 + 1 ] = a.y; A[ i * 3 + 2 ] = a.z;
		B[ i * 3 ] = b.x; B[ i * 3 + 1 ] = b.y; B[ i * 3 + 2 ] = b.z;
		const c = _col.set( color );
		C[ i * 4 ] = c.r * intensity; C[ i * 4 + 1 ] = c.g * intensity; C[ i * 4 + 2 ] = c.b * intensity; C[ i * 4 + 3 ] = alpha;
		this.bW.array[ i ] = width;
	}

	// a fading straight tracer from a to b
	tracer( a, b, o = {} ) {
		this.tracers.push( { a: a.clone(), b: b.clone(), t: 0, life: o.life ?? 0.12, color: o.color ?? 0xffb070, width: o.width ?? 0.012, i: o.intensity ?? 4 } );
		if ( this.tracers.length > 60 ) this.tracers.shift();
	}

	_updateBeams( dt ) {
		for ( let k = this.tracers.length - 1; k >= 0; k -- ) {
			const tr = this.tracers[ k ];
			tr.t += dt;
			if ( tr.t >= tr.life ) { this.tracers.splice( k, 1 ); continue; }
			this.beam( tr.a, tr.b, tr.color, tr.width, 1 - tr.t / tr.life, tr.i );
		}
		const n = this.bN;
		this.beams.geometry.instanceCount = n;
		if ( n ) {
			for ( const a of [ this.bA, this.bB, this.bC, this.bW ] ) a.needsUpdate = true;
		}
		this.bN = 0; // next frame starts empty; the draw uses this frame's buffers
	}

	// ---- lights: the two flashes / fires that matter most this frame, as point lights. In the world scene they are
	// proxies the world's shared lamps take from (render/Lamps.js: a constant light count, no recompiles) ----
	_initLights() {
		const lamps = this.scene === this.game?.world?.scene ? this.game.world.lamps : null;
		this.lights = [ 0, 1 ].map( () => { const l = new THREE.PointLight( 0xffaa66, 0, 30, 2 ); l.castShadow = false; if ( lamps ) lamps.addPoint( l ); else this.scene.add( l ); return l; } );
		this.lightReq = []; // transient: { pos, color, i, range, t, dur, flicker }
		this._frameLights = [];
	}

	light( pos, color = 0xffb070, intensity = 20, range = 18, dur = 0.08, flicker = 0 ) {
		this.lightReq.push( { pos: pos.clone(), color: new THREE.Color( color ), i: intensity, range, t: 0, dur, flicker } );
		if ( this.lightReq.length > 24 ) this.lightReq.shift();
	}

	// a light for this frame only (fires, burning flares)
	lightNow( pos, color, intensity, range ) { this._frameLights.push( { pos, color, i: intensity, range } ); }

	_updateLights( dt ) {
		const cam = this.game?.camera;
		const cands = this._frameLights;
		for ( let k = this.lightReq.length - 1; k >= 0; k -- ) {
			const r = this.lightReq[ k ];
			r.t += dt;
			if ( r.t >= r.dur ) { this.lightReq.splice( k, 1 ); continue; }
			const f = 1 - r.t / r.dur;
			cands.push( { pos: r.pos, color: r.color, i: r.i * f * f * ( r.flicker ? 0.75 + rnd() * 0.5 : 1 ), range: r.range } );
		}
		// the two that matter most at the camera
		const cp = cam ? cam.position : _v.set( 0, 0, 0 );
		for ( const c of cands ) { const d2 = c.pos.distanceToSquared( cp ); c.score = c.i / ( 1 + d2 / ( c.range * c.range ) ) * ( d2 < c.range * c.range * 9 ? 1 : 0 ); }
		cands.sort( ( a, b ) => b.score - a.score );
		for ( let k = 0; k < this.lights.length; k ++ ) {
			const L = this.lights[ k ], c = cands[ k ];
			if ( c && c.score > 0 ) { L.position.copy( c.pos ); L.color.copy( c.color ); L.intensity = c.i; L.distance = c.range; }
			else L.intensity = 0;
		}
		cands.length = 0;
	}

	// ---- ejected brass (instanced, rests on the ground for a while) ----
	_initCasings() {
		const MAX = 64;
		const geo = new THREE.CylinderGeometry( 0.0048, 0.0048, 0.045, 7, 1 );
		geo.rotateZ( Math.PI / 2 );
		const mat = patchMaterial( new THREE.MeshStandardMaterial( { color: 0xd2a24a, metalness: 1, roughness: 0.32 } ), 'fx-brass' );
		this.cas = new THREE.InstancedMesh( geo, mat, MAX );
		this.cas.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
		this.cas.count = 0;
		this.cas.frustumCulled = false;
		this.cas.castShadow = false;
		// (each casing keeps its slot: motion vectors for the TAA while they fly)
		this.scene.add( setDynamic( this.cas ) );
		this.casList = [];
		this.casMax = MAX;
		this.casNext = 0;
	}

	// o: { len, r, color (shotgun hulls are red), sound }
	casing( pos, vel, o = {} ) {
		const P = this.physics;
		const c = { p: pos.clone(), v: vel.clone(), rot: new THREE.Euler( rnd() * 6, rnd() * 6, rnd() * 6 ), w: new THREE.Vector3( rr( - 20, 20 ), rr( - 20, 20 ), rr( - 20, 20 ) ), t: 0, rest: false, bounces: 0,
			floor: P ? P.ground( pos.x, pos.z, pos.y + 0.2 ).y : - 1e9, s: o.scale || 1, sound: o.sound ?? 'casing', idx: this.casNext };
		this.casNext = ( this.casNext + 1 ) % this.casMax;
		this.casList = this.casList.filter( x => x.idx !== c.idx );
		this.casList.push( c );
		this.cas.count = Math.max( this.cas.count, c.idx + 1 );
		if ( o.color != null ) { this.cas.setColorAt( c.idx, _col.set( o.color ) ); this.cas.instanceColor.needsUpdate = true; }
		else if ( this.cas.instanceColor ) { this.cas.setColorAt( c.idx, _col.set( 0xffffff ) ); this.cas.instanceColor.needsUpdate = true; }
	}

	_updateCasings( dt ) {
		let dirty = false;
		for ( let k = this.casList.length - 1; k >= 0; k -- ) {
			const c = this.casList[ k ];
			c.t += dt;
			if ( c.t > 40 ) { this.cas.setMatrixAt( c.idx, _m.makeScale( 0, 0, 0 ) ); this.casList.splice( k, 1 ); dirty = true; continue; }
			if ( c.rest ) continue;
			c.v.y -= 9.8 * dt;
			c.p.addScaledVector( c.v, dt );
			c.rot.x += c.w.x * dt; c.rot.y += c.w.y * dt; c.rot.z += c.w.z * dt;
			if ( c.p.y < c.floor + 0.005 ) {
				c.p.y = c.floor + 0.005;
				if ( c.bounces === 0 && c.sound && this.audio ) this.audio.play( c.sound, { pos: c.p, vol: 0.25, max: 25, detune: 0.3 } );
				c.bounces ++;
				c.v.y = - c.v.y * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar( 0.5 );
				if ( Math.abs( c.v.y ) < 0.3 || c.bounces > 3 ) { c.rest = true; c.rot.x = Math.PI / 2 * ( rnd() < 0.5 ? 1 : - 1 ) * 0; c.rot.z = 0; c.rot.x = 0; }
			}
			_q.setFromEuler( c.rot );
			this.cas.setMatrixAt( c.idx, _m.compose( c.p, _q, _s.set( c.s, c.s, c.s ) ) );
			dirty = true;
		}
		if ( dirty ) this.cas.instanceMatrix.needsUpdate = true;
	}

	// ---- particle helpers ----
	_emit( pool, o ) { pool.emit( o ); }

	sparks( pos, dir, n = 8, o = {} ) {
		const P = this.physics;
		const floor = P ? P.ground( pos.x, pos.z, pos.y + 0.05 ).y : - 1e9;
		for ( let i = 0; i < n; i ++ ) {
			_v.set( rr( - 1, 1 ), rr( - 1, 1 ), rr( - 1, 1 ) ).normalize().multiplyScalar( 0.6 ).add( dir ).normalize().multiplyScalar( rr( 3, o.speed || 11 ) );
			this.add.emit( { x: pos.x, y: pos.y, z: pos.z, vx: _v.x, vy: _v.y, vz: _v.z, life: rr( 0.15, 0.5 ), s0: rr( 0.006, 0.012 ), s1: 0.004, frame: F.spark,
				r: 4, g: 2.4, b: 1.1, a: 1, grav: 9.8, drag: 1.5, stretch: 0.025, floor, bounce: 0.4 } );
		}
	}

	// bullet / blade / blunt hit on a static surface. o: { size (1 = rifle round), dir (incoming), sound, decal, kind: 'bullet'|'melee' }
	impact( point, normal, mat = 'concrete', o = {} ) {
		const M = MAT_FX[ mat ] || MAT_FX.concrete;
		if ( M.blood ) { this.blood( point, o.dir || normal, 0.6 * ( o.size || 1 ) ); return; }
		if ( M.water ) { this.splash( point, 0.5 * ( o.size || 1 ) ); if ( o.sound !== false ) this.audio?.play( 'plop', { pos: point, vol: 0.5, max: 60 } ); return; }
		const k = o.size || 1;
		const P = this.physics;
		const floor = P ? P.ground( point.x, point.z, point.y + 0.05 ).y : - 1e9;
		// dust puff pushed out along the normal
		for ( let i = 0; i < 3 + k * 2; i ++ ) {
			_v.copy( normal ).multiplyScalar( rr( 0.4, 1.6 ) ).add( _v2.set( rr( - 0.4, 0.4 ), rr( 0, 0.4 ), rr( - 0.4, 0.4 ) ) );
			this.alpha.emit( { x: point.x, y: point.y, z: point.z, vx: _v.x, vy: _v.y, vz: _v.z, life: rr( 0.6, 1.4 ), s0: 0.05 * k, s1: rr( 0.25, 0.45 ) * k, frame: F.dust,
				r: M.dust[ 0 ], g: M.dust[ 1 ], b: M.dust[ 2 ], a: 0.7, grav: - 0.15, drag: 2.5, rotV: rr( - 1, 1 ) } );
		}
		// chips / splinters / dirt thrown out
		const chips = M.leaves ? 5 : ( mat === 'dirt' || mat === 'sand' ? 9 : 5 ) * k;
		for ( let i = 0; i < chips; i ++ ) {
			_v.copy( normal ).multiplyScalar( rr( 1.5, 5 ) ).add( _v2.set( rr( - 1.5, 1.5 ), rr( 0, 2 ), rr( - 1.5, 1.5 ) ) );
			if ( M.leaves ) _v.multiplyScalar( 0.4 );
			( M.shards ? this.add : this.alpha ).emit( { x: point.x, y: point.y, z: point.z, vx: _v.x, vy: _v.y, vz: _v.z, life: M.leaves ? rr( 1.5, 3 ) : rr( 0.5, 1.1 ),
				s0: M.leaves ? 0.03 : rr( 0.008, 0.02 ), frame: M.leaves ? F.leaf : M.shards ? F.shard : F.chunk,
				r: M.shards ? 1.6 : M.chunk[ 0 ], g: M.shards ? 1.7 : M.chunk[ 1 ], b: M.shards ? 1.8 : M.chunk[ 2 ], a: 1, grav: M.leaves ? 1.2 : 9.8, drag: M.leaves ? 3 : 0.5, rotV: rr( - 12, 12 ), floor, bounce: 0.25 } );
		}
		if ( M.sparks && ( o.kind !== 'melee' || mat === 'metal' ) ) this.sparks( point, normal, Math.round( M.sparks * ( 0.5 + rnd() ) * Math.min( 1.5, k ) ) );
		if ( M.decal && o.decal !== false ) {
			const dk = M.decal[ Math.floor( rnd() * M.decal.length ) ];
			const sz = ( o.kind === 'melee' ? 0.09 : mat === 'glass' ? 0.22 : mat === 'dirt' || mat === 'sand' ? 0.1 : 0.075 ) * Math.sqrt( k );
			this.decal( point, normal, dk, sz, mat === 'dirt' || mat === 'sand' ? 40 : 150 );
		}
		if ( o.sound !== false && M.sound && this.audio ) this.audio.play( M.sound, { pos: point, vol: ( o.kind === 'melee' ? 0.7 : 0.45 ) * ( mat === 'glass' ? 0.5 : 1 ), rate: ( M.rate || 1 ) * rr( 0.9, 1.2 ), max: 70 } );
	}

	splash( pos, size = 0.5 ) {
		for ( let i = 0; i < 10 * size + 4; i ++ ) {
			const a = rnd() * 6.28, s = rr( 0.5, 2 ) * size;
			this.alpha.emit( { x: pos.x, y: pos.y, z: pos.z, vx: Math.cos( a ) * s * 0.5, vy: rr( 2, 5 ) * size + 1, vz: Math.sin( a ) * s * 0.5, life: rr( 0.5, 0.9 ),
				s0: 0.03 * size + 0.02, s1: 0.06 * size + 0.03, frame: F.drop, r: 0.9, g: 0.95, b: 1, a: 0.9, grav: 9.8, drag: 0.3, stretch: 0.02, floor: pos.y - 0.05 } );
		}
		this.alpha.emit( { x: pos.x, y: pos.y + 0.05, z: pos.z, vy: 0.3, life: 1.2, s0: 0.1, s1: 0.8 * size + 0.2, frame: F.puff, r: 0.85, g: 0.9, b: 0.95, a: 0.4, drag: 2 } );
	}

	// blood mist and droplets at a wound, a splatter on the surface behind, drops on the ground below
	blood( point, dir = null, amount = 1 ) {
		const d = dir ? _v2.copy( dir ).normalize() : _v2.set( 0, 0, 0 );
		const dx = d.x, dy = d.y, dz = d.z;
		const P = this.physics;
		const floor = P ? P.ground( point.x, point.z, point.y ).y : - 1e9;
		const n = Math.round( 4 + amount * 6 );
		for ( let i = 0; i < n; i ++ ) {
			this.alpha.emit( { x: point.x, y: point.y, z: point.z, vx: dx * rr( 0.5, 2 ) + rr( - 0.6, 0.6 ), vy: dy * rr( 0.5, 2 ) + rr( - 0.2, 0.8 ), vz: dz * rr( 0.5, 2 ) + rr( - 0.6, 0.6 ),
				life: rr( 0.35, 0.8 ), s0: 0.04, s1: rr( 0.18, 0.35 ) * Math.sqrt( amount ), frame: F.puff, r: 0.42, g: 0.02, b: 0.02, a: 0.75, drag: 4, grav: 0.5 } );
		}
		for ( let i = 0; i < n * 1.5; i ++ ) {
			this.alpha.emit( { x: point.x, y: point.y, z: point.z, vx: dx * rr( 1, 4 ) + rr( - 1.2, 1.2 ), vy: dy * rr( 1, 3 ) + rr( 0, 2 ), vz: dz * rr( 1, 4 ) + rr( - 1.2, 1.2 ),
				life: rr( 0.4, 0.9 ), s0: rr( 0.01, 0.025 ), frame: F.ember, r: 0.35, g: 0.01, b: 0.01, a: 1, grav: 9.8, drag: 0.4, stretch: 0.02, floor, bounce: 0 } );
		}
		if ( ! P ) return;
		// splatter on whatever is behind the wound
		if ( dir && amount > 0.3 ) {
			const hit = P.raycast( point, d, 2.8, { water: false } );
			if ( hit ) this.decal( hit.point, hit.normal, [ D.blood, D.blood2, D.blood3 ][ Math.floor( rnd() * 3 ) ], rr( 0.35, 0.7 ) * Math.min( 1.5, amount ), 180 );
		}
		// drops on the ground
		const g = P.ground( point.x + rr( - 0.3, 0.3 ), point.z + rr( - 0.3, 0.3 ), point.y );
		if ( point.y - g.y < 2.5 ) this.decal( _v.set( point.x + rr( - 0.3, 0.3 ), g.y, point.z + rr( - 0.3, 0.3 ) ), _v2.set( 0, 1, 0 ), D.blood_small, rr( 0.12, 0.3 ) * Math.min( 1.5, amount + 0.3 ), 150 );
	}

	bloodDrip( pos ) {
		const P = this.physics;
		const x = pos.x + rr( - 0.25, 0.25 ), z = pos.z + rr( - 0.25, 0.25 );
		const y = P ? P.ground( x, z, pos.y + 0.3 ).y : pos.y;
		this.decal( _v.set( x, y, z ), _v2.set( 0, 1, 0 ), D.blood_small, rr( 0.05, 0.12 ), 90 );
	}

	bloodPool( pos, size = 1 ) {
		const P = this.physics;
		const y = P ? P.ground( pos.x, pos.z, pos.y + 0.3 ).y : pos.y;
		this.decal( _v.set( pos.x, y, pos.z ), _v2.set( 0, 1, 0 ), D.blood_pool, 1.1 * size, 300, 0.9 );
	}

	// world-space muzzle flash. o: { scale, suppressed, flash (false = smoke only), smoke }
	muzzle( pos, dir, o = {} ) {
		const k = o.scale || 1;
		if ( o.flash !== false && ! o.suppressed ) {
			this.add.emit( { x: pos.x, y: pos.y, z: pos.z, life: 0.05, s0: 0.14 * k, s1: 0.2 * k, frame: F.star, r: 7, g: 4.5, b: 2, a: 1 } );
			for ( let i = 0; i < 3; i ++ ) {
				const s = rr( 0.4, 1 ) * k;
				this.add.emit( { x: pos.x + dir.x * 0.08 * s, y: pos.y + dir.y * 0.08 * s, z: pos.z + dir.z * 0.08 * s, vx: dir.x * 0.001, vy: dir.y * 0.001, vz: dir.z * 0.001,
					life: 0.045, s0: 0.05 * k, frame: F.cone, r: 6, g: 3.5, b: 1.5, a: 1, stretch: 180 * s } );
			}
			this.light( _v.copy( pos ).addScaledVector( dir, 0.3 ), 0xffb46a, 26 * k, 16 * Math.sqrt( k ), 0.06 );
		}
		if ( o.smoke !== false ) {
			for ( let i = 0; i < ( o.suppressed ? 1 : 3 ); i ++ ) {
				const s = rr( 0.3, 1.2 );
				this.alpha.emit( { x: pos.x, y: pos.y, z: pos.z, vx: dir.x * s + rr( - 0.1, 0.1 ), vy: dir.y * s + rr( 0.05, 0.25 ), vz: dir.z * s + rr( - 0.1, 0.1 ),
					life: rr( 0.8, 1.8 ), s0: 0.04 * k, s1: rr( 0.2, 0.4 ) * k, frame: F.smoke, r: 0.8, g: 0.8, b: 0.8, a: o.suppressed ? 0.12 : 0.22, drag: 2.2, grav: - 0.25, rotV: rr( - 0.8, 0.8 ) } );
			}
		}
	}

	// ---- explosions, fire, smoke ----
	explosion( pos, r = 6, o = {} ) {
		const P = this.physics;
		const floor = P ? P.ground( pos.x, pos.z, pos.y + 0.5 ).y : pos.y - 0.2;
		const k = r / 6;
		// flash + fireball
		this.light( _v.copy( pos ).setY( pos.y + 1 ), 0xffa050, 900 * k, 60 * Math.sqrt( k ), 0.45, 1 );
		this.add.emit( { x: pos.x, y: pos.y + 0.5, z: pos.z, life: 0.18, s0: 1.5 * k, s1: 5 * k, frame: F.glow, r: 10, g: 7, b: 4, a: 1 } );
		for ( let i = 0; i < 26; i ++ ) {
			_v.set( rr( - 1, 1 ), rr( 0, 1.2 ), rr( - 1, 1 ) ).normalize().multiplyScalar( rr( 2, 9 ) * k );
			this.add.emit( { x: pos.x, y: pos.y + 0.3, z: pos.z, vx: _v.x, vy: _v.y, vz: _v.z, life: rr( 0.25, 0.6 ), s0: rr( 0.4, 0.9 ) * k, s1: rr( 1.2, 2.4 ) * k,
				frame: rnd() < 0.5 ? F.flame : F.flame2, r: 6, g: rr( 2.2, 3.5 ), b: 0.8, a: 1, drag: 4, grav: - 2, rotV: rr( - 3, 3 ) } );
		}
		// debris and burning fragments
		for ( let i = 0; i < 40; i ++ ) {
			_v.set( rr( - 1, 1 ), rr( 0.2, 1.5 ), rr( - 1, 1 ) ).normalize().multiplyScalar( rr( 6, 26 ) * Math.sqrt( k ) );
			const hot = rnd() < 0.5;
			( hot ? this.add : this.alpha ).emit( { x: pos.x, y: pos.y + 0.3, z: pos.z, vx: _v.x, vy: _v.y, vz: _v.z, life: rr( 0.6, 2 ), s0: hot ? rr( 0.02, 0.04 ) : rr( 0.03, 0.08 ),
				frame: hot ? F.spark : F.chunk, r: hot ? 5 : 0.25, g: hot ? 2.5 : 0.22, b: hot ? 0.8 : 0.2, a: 1, grav: 9.8, drag: 0.6, stretch: hot ? 0.03 : 0, rotV: rr( - 10, 10 ), floor, bounce: 0.3 } );
		}
		// smoke column and a dust ring along the ground
		for ( let i = 0; i < 24; i ++ ) {
			_v.set( rr( - 1, 1 ), rr( 0.3, 1.5 ), rr( - 1, 1 ) ).multiplyScalar( rr( 0.5, 2.5 ) * k );
			const g = rr( 0.12, 0.3 );
			this.alpha.emit( { x: pos.x + rr( - 0.5, 0.5 ), y: pos.y + rr( 0.2, 1.5 ), z: pos.z + rr( - 0.5, 0.5 ), vx: _v.x, vy: _v.y + 1.5, vz: _v.z, life: rr( 3, 7 ), s0: rr( 0.8, 1.6 ) * k, s1: rr( 3.5, 6 ) * k,
				frame: F.smoke, r: g, g: g * 0.95, b: g * 0.9, a: 0.85, drag: 1.2, grav: - 0.6, rotV: rr( - 0.4, 0.4 ), fadeIn: 0.05 } );
		}
		for ( let i = 0; i < 16; i ++ ) {
			const a = i / 16 * 6.28;
			this.alpha.emit( { x: pos.x, y: floor + 0.3, z: pos.z, vx: Math.cos( a ) * 9 * k, vy: 0.4, vz: Math.sin( a ) * 9 * k, life: rr( 1.2, 2.2 ), s0: 0.6 * k, s1: 2.5 * k,
				frame: F.dust, r: 0.55, g: 0.48, b: 0.4, a: 0.6, drag: 2.8 } );
		}
		if ( P && pos.y - floor < r * 0.6 ) this.decal( _v.set( pos.x, floor, pos.z ), _v2.set( 0, 1, 0 ), D.scorch, r * 0.7, 400, 0.95 );
		if ( o.sound !== false ) this.audio?.play( 'explosion', { pos, vol: 1.3, max: 1800, ref: 12 } );
		// shake whoever is watching
		const g = this.game;
		if ( g?.player && o.shake !== false ) {
			const d = g.player.pos.distanceTo( pos );
			g.player.shake = Math.max( g.player.shake || 0, Math.min( 1.2, 3 * k / ( 1 + d * 0.12 ) ) );
		}
	}

	// o: { radius, duration, intensity, sound, smoke } -> handle { pos, radius, alive, stop(), intensity }
	fire( pos, o = {} ) {
		const h = { pos: pos.clone(), radius: o.radius ?? 1, dur: o.duration ?? 20, t: 0, acc: 0, alive: true, intensity: o.intensity ?? 1, smoke: o.smoke ?? true, floor: pos.y, snd: null };
		if ( this.physics ) h.floor = this.physics.ground( pos.x, pos.z, pos.y + 0.5 ).y;
		if ( o.sound !== false && this.audio?.ctx ) h.snd = this.audio.loop( 'fire_loop', { pos: h.pos, vol: 0.5 * h.intensity, bus: 'sfx', ref: 3 } );
		h.stop = () => { h.dur = Math.min( h.dur, h.t + 1.5 ); };
		this.fires.push( h );
		return h;
	}

	_updateFires( dt ) {
		for ( let k = this.fires.length - 1; k >= 0; k -- ) {
			const h = this.fires[ k ];
			h.t += dt;
			const left = h.dur - h.t;
			if ( left <= 0 ) { h.alive = false; h.snd?.stop(); this.fires.splice( k, 1 ); continue; }
			const f = Math.min( 1, h.t * 3 ) * Math.min( 1, left / 1.5 ) * h.intensity;
			const R = h.radius;
			h.acc += dt * ( 14 + 26 * R ) * f;
			while ( h.acc > 1 ) {
				h.acc -= 1;
				const a = rnd() * 6.28, d = Math.sqrt( rnd() ) * R * 0.85;
				const x = h.pos.x + Math.cos( a ) * d, z = h.pos.z + Math.sin( a ) * d;
				const s = rr( 0.25, 0.55 ) * Math.min( 1.6, 0.5 + R * 0.5 );
				this.add.emit( { x, y: h.floor + 0.05, z, vx: rr( - 0.2, 0.2 ), vy: rr( 1.2, 2.4 ), vz: rr( - 0.2, 0.2 ), life: rr( 0.45, 0.9 ), s0: s, s1: s * 0.3,
					frame: rnd() < 0.5 ? F.flame : F.flame2, r: 5, g: rr( 1.8, 2.8 ), b: 0.6, a: 0.9, drag: 0.8, rot: rr( - 0.3, 0.3 ), fadeIn: 0.15 } );
				if ( rnd() < 0.15 ) this.add.emit( { x, y: h.floor + 0.3, z, vx: rr( - 0.5, 0.5 ), vy: rr( 2, 4 ), vz: rr( - 0.5, 0.5 ), life: rr( 0.8, 1.8 ), s0: 0.012, frame: F.ember, r: 5, g: 2, b: 0.5, a: 1, drag: 0.5, grav: - 0.5 } );
				if ( h.smoke && rnd() < 0.3 ) {
					const g = rr( 0.1, 0.22 );
					this.alpha.emit( { x, y: h.floor + 1 + R * 0.3, z, vx: rr( - 0.2, 0.2 ) + G.uWind.value.x * 0.6, vy: rr( 1, 2 ), vz: rr( - 0.2, 0.2 ) + G.uWind.value.y * 0.6, life: rr( 2.5, 5 ),
						s0: 0.4 * R, s1: rr( 1.5, 3 ) * R, frame: F.smoke, r: g, g, b: g, a: 0.5, drag: 0.4, grav: - 0.3, fadeIn: 0.1, rotV: rr( - 0.3, 0.3 ) } );
				}
			}
			this.lightNow( _v.copy( h.pos ).setY( h.floor + 0.8 ).clone(), _fireCol, ( 14 + R * 10 ) * f * ( 0.75 + 0.5 * rnd() ), 10 + R * 5 );
			h.snd?.set( 0.5 * f, null, h.pos );
		}
	}

	// smoke screen. o: { radius, duration, color } -> handle
	smoke( pos, o = {} ) {
		const h = { pos: pos.clone(), radius: o.radius ?? 8, dur: o.duration ?? 30, t: 0, acc: 0, color: o.color ?? [ 0.86, 0.87, 0.88 ], alive: true, density: 0 };
		if ( this.physics ) h.floor = this.physics.ground( pos.x, pos.z, pos.y + 0.5 ).y; else h.floor = pos.y;
		if ( this.audio?.buffer?.( 'smoke_hiss' ) ) h.snd = this.audio.loop( 'smoke_hiss', { pos: h.pos, vol: 0.4, bus: 'sfx', ref: 3 } );
		h.stop = () => { h.dur = Math.min( h.dur, h.t ); };
		this.smokes.push( h );
		return h;
	}

	_updateSmokes( dt ) {
		const wind = G.uWind.value;
		for ( let k = this.smokes.length - 1; k >= 0; k -- ) {
			const h = this.smokes[ k ];
			h.t += dt;
			const emitting = h.t < h.dur;
			// the cloud builds for ~5 s and lingers ~8 s after the canister dies
			h.density = emitting ? Math.min( 1, h.t / 5 ) : Math.max( 0, 1 - ( h.t - h.dur ) / 8 );
			h.pos.x += wind.x * dt * 0.25; h.pos.z += wind.y * dt * 0.25;
			if ( h.snd ) { h.snd.set( emitting ? 0.4 : 0, null, h.pos ); if ( ! emitting ) { h.snd.stop(); h.snd = null; } }
			if ( h.density <= 0 && ! emitting ) { h.alive = false; this.smokes.splice( k, 1 ); continue; }
			if ( ! emitting ) continue;
			h.acc += dt * 26;
			while ( h.acc > 1 ) {
				h.acc -= 1;
				const a = rnd() * 6.28, sp = rr( 0.5, 2.2 ) * Math.min( 1, h.t / 2 + 0.3 );
				const c = h.color, sh = rr( 0.9, 1.05 );
				this.alpha.emit( { x: h.pos.x, y: h.floor + 0.3, z: h.pos.z, vx: Math.cos( a ) * sp + wind.x * 0.4, vy: rr( 0.3, 1.2 ), vz: Math.sin( a ) * sp + wind.y * 0.4,
					life: rr( 7, 12 ), s0: 0.6, s1: rr( 3.5, 5.5 ) * h.radius / 8, frame: F.smoke, r: c[ 0 ] * sh, g: c[ 1 ] * sh, b: c[ 2 ] * sh, a: 0.62, drag: 0.35, grav: - 0.08, rotV: rr( - 0.2, 0.2 ), fadeIn: 0.08 } );
			}
		}
	}

	// 0..1 how deep in a smoke cloud this point is
	inSmoke( p ) {
		let d = 0;
		for ( const h of this.smokes ) {
			const r = h.radius * ( 0.5 + 0.5 * Math.min( 1, h.t / 6 ) );
			const dist = Math.hypot( p.x - h.pos.x, ( p.y - h.floor - 1.5 ) * 0.6, p.z - h.pos.z );
			if ( dist < r ) d = Math.max( d, h.density * ( 1 - dist / r ) * 1.6 );
		}
		return Math.min( 1, d );
	}

	// does a line of sight pass through thick smoke?
	smokeBlocks( a, b ) {
		for ( const h of this.smokes ) {
			if ( h.density < 0.5 ) continue;
			const r = h.radius * 0.8 * Math.min( 1, h.t / 6 + 0.3 );
			_v.set( h.pos.x, h.floor + 1.5, h.pos.z );
			// closest point of the segment to the cloud centre
			_v2.subVectors( b, a );
			const L2 = _v2.lengthSq() || 1;
			const t = Math.max( 0, Math.min( 1, _v.clone().sub( a ).dot( _v2 ) / L2 ) );
			const c = a.clone().addScaledVector( _v2, t );
			if ( c.distanceTo( _v ) < r ) return true;
		}
		return false;
	}

	update( dt ) {
		this.t += dt;
		this._updateFires( dt );
		this._updateSmokes( dt );
		this.alpha.update( dt );
		this.add.update( dt );
		this._updateBeams( dt );
		this._updateLights( dt );
		this._updateCasings( dt );
		this._updateDecals();
	}

	dispose() {
		for ( const h of this.fires ) h.snd?.stop();
		for ( const h of this.smokes ) h.snd?.stop();
		for ( const l of this.lights ) this.game?.world?.lamps?.remove( l );
		for ( const o of [ this.alpha.mesh, this.add.mesh, this.decals, this.beams, this.cas, ...this.lights ] ) {
			o.parent?.remove( o );
			o.geometry?.dispose?.();
			if ( o.material ) { o.material.uniforms?.uAtlas?.value?.dispose?.(); o.material.dispose(); }
		}
		this.fires.length = 0; this.smokes.length = 0;
	}
}

const _col = new THREE.Color();
const _fireCol = new THREE.Color( 1, 0.55, 0.22 );
