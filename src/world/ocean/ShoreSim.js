// Ported from Tidewater src/ocean/ShoreSim.js (MIT, see LICENSE-Tidewater.txt)
// Eulerian state over the beach, updated every frame on the GPU (a fragment pass instead of the kernel):
//   r = foam carried by the water (made by the bore roller, the plunge point, the swash front; advected
//       with the actual flow: bores, uprush, backwash; thinned where the flow spreads it out)
//   g = sand wetness (1 while covered, dries over ~half a minute)
//   b = foam stranded on the sand when the water drains away (pops over a few seconds)
//   a = depth-averaged flow speed along the local wave direction (m/s): carries the foam pattern
//       (SurfFoam flow map) and gives the divergence that thins the foam
// Ours: Tidewater's region is fixed over its one beach; this one (the same 380 m at 768^2) follows the
// camera, moved in whole texels (the state is carried over). The spray deposit (Breakers) is not in.
// GLSL (SHORE_SIM_GLSL, for the water and for the terrain's wet sand):
//   vec2 shoreSimUvOf( xz ), float shoreSimInside( uv ), vec4 shoreSimSample( xz ) ( foam on the water,
//   sand wetness, foam left on the sand, flow speed ), float shoreSimSandFoam( xz, s, h )
// with the uniforms of shoreSimUniforms() (uShoreSim, uShoreSimRect).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { LACE_TILE } from './SurfFoam.js';

const SIZE = 380, RES = 768;
const RECENTRE = 48; // m from the region centre before it moves

export const SHORE_SIM_GLSL = /* glsl */`
	uniform sampler2D uShoreSim; uniform vec4 uShoreSimRect; // x0, z0, size, res
	vec2 shoreSimUvOf( vec2 xz ) { return ( xz - uShoreSimRect.xy ) / uShoreSimRect.z; }
	float shoreSimInside( vec2 uv ) {
		return smoothstep( 0.0, 0.02, uv.x ) * smoothstep( 1.0, 0.98, uv.x ) * smoothstep( 0.0, 0.02, uv.y ) * smoothstep( 1.0, 0.98, uv.y );
	}
	// ( foam amount on the water, sand wetness, foam amount left on the sand, flow speed ), faded out at the
	// region border (hardware bilinear on the half-float state)
	vec4 shoreSimSample( vec2 xz ) {
		vec2 uv = shoreSimUvOf( xz );
		vec4 o = vec4( 0.0 );
		if ( uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0 ) o = textureLod( uShoreSim, uv, 0.0 ) * shoreSimInside( uv );
		return o;
	}
`;

// Foam left on the sand (0..1, for the terrain): thin bubble lines and single bubbles where the draining water
// left its foam, popping patch by patch as it dries. Needs a lace lookup: laceFn( q ) -> vec4 (the pattern
// array's layer 1 at q / LACE_TILE, e.g. texture( uPatterns, vec3( q / 3.5, 1.0 ) )).
export const SHORE_SIM_SAND_GLSL = ( laceFn ) => /* glsl */`
	float shoreSimSandFoam( vec2 xz, vec4 s, float h ) {
		float r = s.z;
		// (screen-space footprint first: derivatives before the branch)
		float fp = length( fwidth( xz ) ) / ${ LACE_TILE.toFixed( 1 ) } * 512.0;
		float o = 0.0;
		if ( r > 0.01 ) {
			vec4 lace = ${ laceFn( 'xz + 11.3' ) };
			// fade to the average where a pixel covers several strands
			float near = smoothstep( 3.0, 1.2, fp );
			float keep = smoothstep( lace.w * 0.55, lace.w * 0.55 + 0.08, r ); // staggered popping
			// thin bubble lines where the strands were, a little wider where more foam was left
			float lw = r * 0.1 + 0.06;
			float strand = ( 1.0 - smoothstep( lw, lw + 0.07, lace.x ) ) * ( lace.z * 0.5 + 0.6 );
			float lines = max( strand * smoothstep( 0.02, 0.25, r ) * keep, lace.y * keep * 0.8 );
			o = mix( smoothstep( 0.08, 0.6, r ) * 0.12, lines, near ) * 0.85;
		}
		return o;
	}
`;

export class ShoreSim {
	// shoreGLSL: the ground + perlin + shore modules the sim evaluates (shoreEvaluateWorld)
	constructor( renderer, shoreGLSL, shoreUniforms ) {
		this.renderer = renderer;
		this.size = SIZE;
		this.res = RES;
		const mk = () => {
			const rt = new THREE.WebGLRenderTarget( RES, RES, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping } );
			return rt;
		};
		this.rts = [ mk(), mk() ];
		this.cur = 0;
		this.rect = new THREE.Vector4( 0, 0, SIZE, RES ); // current region: x0, z0, size, res
		this.prevRect = new THREE.Vector4( 0, 0, SIZE, RES );
		this.placed = false;
		this.params = { dryTime: 28, foamLife: 4.5, surfFoamLife: 2.6, residueLife: 5.0, foamGen: 1.0 };
		this.quad = new FullScreenQuad( null );
		this.mat = new THREE.ShaderMaterial( {
			uniforms: Object.assign( {
				tPrev: { value: null }, uPrevRect: { value: this.prevRect }, uRect: { value: this.rect }, uDt: { value: 0 },
				uDryTime: { value: 28 }, uFoamLife: { value: 4.5 }, uSurfFoamLife: { value: 2.6 }, uResidueLife: { value: 5 }, uFoamGen: { value: 1 },
				uFirst: { value: 1 },
			}, shoreUniforms ),
			vertexShader: /* glsl */`void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
			fragmentShader: /* glsl */`
				uniform sampler2D tPrev; uniform vec4 uPrevRect; uniform vec4 uRect; uniform float uDt;
				uniform float uDryTime; uniform float uFoamLife; uniform float uSurfFoamLife; uniform float uResidueLife; uniform float uFoamGen;
				uniform float uFirst;
				${ shoreGLSL }
				// the previous state at a world point (bilinear; nothing outside the previous region)
				vec4 simPrevAt( vec2 xz ) {
					vec2 uv = ( xz - uPrevRect.xy ) / uPrevRect.z;
					if ( uFirst > 0.5 || any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return vec4( 0.0 );
					return textureLod( tPrev, uv, 0.0 );
				}
				void main() {
					float res = uRect.w;
					vec2 uv = floor( gl_FragCoord.xy ) / res + 0.5 / res;
					vec2 p = uRect.xy + uv * uRect.z;
					float ground = waterGroundAt( p );
					float depth = uWaterLevel - ground;
					float dt = uDt;
					vec4 here = simPrevAt( p );
					// far from the surf and swash zone nothing happens: just let everything decay
					if ( depth > 7.0 || ground > 3.2 ) {
						float k = exp( - dt / 2.0 );
						gl_FragColor = vec4( here.x * k, here.y * exp( - dt / uDryTime ), here.z * k, 0.0 );
						return;
					}
					ShoreSample sw = shoreEvaluateWorld( p, depth, ground );
					// fraction of this texel covered by water: open water, or the swash sheet up to its leading edge
					// (soft over one texel, so no field stored here shows the texel grid)
					float h = uRect.z / res;
					float cov = depth > 0.03 ? 1.0 : clamp( ( sw.runup - sw.inland ) / h + 0.5, 0.0, 1.0 );
					bool covered = cov > 0.5;
					vec2 vel = covered ? sw.flow : vec2( 0.0 );
					// semi-Lagrangian advection (backtrace)
					vec4 prev = simPrevAt( p - vel * dt );
					// foam: made where the bore roller / plunge point / swash front pass, torn into patches by the
					// mottling of the lace texture, then it decays (bubbles rising and popping) and drains into the
					// sand once the water has gone
					float mott = textureLod( uPatterns, vec3( p / ( ${ LACE_TILE.toFixed( 1 ) } * 4.3 ), 1.0 ), 2.0 ).z;
					float patchK = smoothstep( 0.25, 0.75, mott ) * 0.8 + 0.35;
					float swashy = smoothstep( 0.35, 0.05, depth );
					// dense foam collapses within a second or two (big bubbles burst first), the lace it leaves lingers
					float laceLife = mix( uSurfFoamLife, uFoamLife, swashy );
					float life = mix( 0.7, mix( laceLife, 0.8, smoothstep( 0.3, 0.8, prev.x ) ), cov );
					float gen = ( sw.foam * 2.2 + sw.swashFoam * 1.4 ) * patchK * cov;
					// the foam is diluted where the flow spreads it out (the uprush thinning as it climbs, the
					// backwash draining): d(foam)/dt = - foam * du/ds along the flow
					float uAhead = simPrevAt( p + sw.dir * h ).w;
					float uBehind = simPrevAt( p - sw.dir * h ).w;
					float spreadRate = max( ( uAhead - uBehind ) / ( 2.0 * h ), 0.0 );
					float foam = min( prev.x * exp( - dt * ( 1.0 / life + spreadRate ) ) + gen * uFoamGen * dt, 1.0 );
					// wetness: saturated while covered, then dries
					float wet = max( here.y * exp( - dt / uDryTime ), cov );
					// residue: foam stranded on the sand when the water leaves (the draining film gathers its bubbles
					// into lines, so it concentrates); washed away by the next uprush
					float stranded = min( here.x * 2.4, 1.0 ) * ( 1.0 - cov );
					float residue = max( here.z * mix( exp( - dt / uResidueLife ), 0.85, cov ), stranded );
					gl_FragColor = vec4( foam, wet, residue, dot( vel, sw.dir ) );
				}`,
			depthTest: false, depthWrite: false,
		} );
	}

	get texture() { return this.rts[ this.cur ].texture; }

	uniforms() { return { uShoreSim: { value: this.texture }, uShoreSimRect: { value: this.rect } }; }

	update( dt, cam, time ) {
		const h = SIZE / RES;
		const cx = this.rect.x + SIZE / 2, cz = this.rect.y + SIZE / 2;
		const u = this.mat.uniforms;
		this.prevRect.copy( this.rect );
		u.uFirst.value = this.placed ? 0 : 1;
		if ( ! this.placed || Math.abs( cam.x - cx ) > RECENTRE || Math.abs( cam.z - cz ) > RECENTRE ) {
			// whole texels: the texel centres stay put in the world
			this.rect.x = Math.round( ( cam.x - SIZE / 2 ) / h ) * h;
			this.rect.y = Math.round( ( cam.z - SIZE / 2 ) / h ) * h;
			this.placed = true;
		}
		const P = this.params;
		u.uDt.value = Math.min( dt, 0.1 );
		u.uDryTime.value = P.dryTime; u.uFoamLife.value = P.foamLife; u.uSurfFoamLife.value = P.surfFoamLife;
		u.uResidueLife.value = P.residueLife; u.uFoamGen.value = P.foamGen;
		u.tPrev.value = this.rts[ this.cur ].texture;
		void time;
		const gl = this.renderer;
		const prev = gl.getRenderTarget();
		this.cur = 1 - this.cur;
		this.quad.material = this.mat;
		gl.setRenderTarget( this.rts[ this.cur ] );
		this.quad.render( gl );
		gl.setRenderTarget( prev );
	}

	dispose() {
		for ( const rt of this.rts ) rt.dispose();
		this.mat.dispose();
		this.quad.dispose();
	}
}
