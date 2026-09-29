// Ported from Tidewater src/materials/GroundBounce.js (the bake, lines 28-150; MIT, see
// LICENSE-Tidewater.txt). The shading hook (groundBounce) lives in Materials.js.
//
// Sunlight bounced off the ground (one diffuse bounce, the dominant indirect light on a sunny beach):
// sunlit coral sand lights the underside of piers, eaves, car bodies, palm trunks and fronds.
// Bake: a 512^2 map at 4 m (2 km, camera-centred) of the light the ground reflects per unit of sun
// irradiance: albedo (sand / meadow / forest / rock / town from our land cover, the sea as the seabed
// seen through the water column; a world worker builds it, 'bounceGrid') x cos(sun, ground normal) x
// the hill shadow, minus what the environment's own ground already gives (0.08), then a 5 x 5 binomial
// blur. Alpha: height of the bouncing surface (ground or sea level). Re-baked when the hill shadow is
// (the key light moved) and after the camera moved a quarter of the map.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G } from '../../render/Materials.js';

const N = 512;
const STEP = 4;
// the environment map's lower hemisphere (the atmosphere's planet ground albedo)
const ENV_GROUND = 0.08;
const RECENTRE = 0.25;

const VERT = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

export class GroundBounce {
	constructor( hf, pool, hillShadow ) {
		this.hf = hf;
		this.pool = pool;
		this.hill = hillShadow;
		this.rect = new THREE.Vector4( 0, 0, N * STEP, N * STEP );
		this.centre = null;
		this.pending = null;
		this.cover = null;
		this.hillVersion = - 1;
		const make = ( name ) => {
			const rt = new THREE.WebGLRenderTarget( N, N, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false } );
			rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
			rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
			rt.texture.name = name;
			return rt;
		};
		this.raw = make( 'groundBounceRaw' );
		this.map = make( 'groundBounce' );
		this.bakePass = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'GroundBounceBake',
			uniforms: {
				uCover: { value: null }, uRect: { value: this.rect }, uL: { value: new THREE.Vector3( 0, 1, 0 ) },
				uHill: { value: null }, uHillRect: { value: new THREE.Vector4() }, uHillOn: { value: 0 },
			},
			vertexShader: VERT,
			fragmentShader: /* glsl */`
				precision highp sampler2D;
				uniform sampler2D uCover; uniform vec4 uRect; uniform vec3 uL;
				uniform sampler2D uHill; uniform vec4 uHillRect; uniform float uHillOn;
				varying vec2 vUv;
				// Tidewater terrainSunShadowAt
				float hillShadowAt( vec3 P ) {
					if ( uHillOn < 0.5 ) return 1.0;
					vec2 uv = ( P.xz - uHillRect.xy ) / uHillRect.zw;
					if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return 1.0;
					vec2 s = texture2D( uHill, uv ).xy;
					float w = s.y * 0.012 + 0.35;
					return smoothstep( -w, w, P.y - s.x );
				}
				void main() {
					ivec2 c = ivec2( gl_FragCoord.xy );
					vec4 a = texelFetch( uCover, c, 0 );
					float h = a.w;
					// ground normal from the neighbouring heights (4 m)
					float hx = texelFetch( uCover, clamp( c + ivec2( 1, 0 ), ivec2( 0 ), ivec2( ${ N - 1 } ) ), 0 ).w - texelFetch( uCover, clamp( c - ivec2( 1, 0 ), ivec2( 0 ), ivec2( ${ N - 1 } ) ), 0 ).w;
					float hz = texelFetch( uCover, clamp( c + ivec2( 0, 1 ), ivec2( 0 ), ivec2( ${ N - 1 } ) ), 0 ).w - texelFetch( uCover, clamp( c - ivec2( 0, 1 ), ivec2( 0 ), ivec2( ${ N - 1 } ) ), 0 ).w;
					vec3 n = normalize( vec3( -hx, ${ ( 2 * STEP ).toFixed( 1 ) }, -hz ) );
					vec3 L = uL;
					float wet = smoothstep( 0.05, -0.1, h );
					vec3 nSurf = normalize( mix( n, vec3( 0.0, 1.0, 0.0 ), wet ) );
					float top = max( h, 0.0 );
					vec2 xz = uRect.xy + vUv * uRect.zw;
					float vis = hillShadowAt( vec3( xz.x, top, xz.y ) );
					float E = max( dot( nSurf, L ), 0.0 ) * vis * smoothstep( -0.02, 0.05, L.y );
					vec3 o = max( a.rgb * E - ${ ENV_GROUND.toFixed( 2 ) } * max( L.y, 0.0 ), vec3( 0.0 ) );
					gl_FragColor = vec4( o, top );
				}`,
			depthTest: false, depthWrite: false,
		} ) );
		const w = [ 1, 4, 6, 4, 1 ];
		let taps = '';
		for ( let y = - 2; y <= 2; y ++ ) for ( let x = - 2; x <= 2; x ++ ) taps += `\t\t\t\t\tsum += texelFetch( uRaw, clamp( c + ivec2( ${ x }, ${ y } ), ivec2( 0 ), ivec2( ${ N - 1 } ) ), 0 ) * ${ ( w[ x + 2 ] * w[ y + 2 ] / 256 ).toFixed( 8 ) };\n`;
		this.blurPass = new FullScreenQuad( new THREE.ShaderMaterial( {
			name: 'GroundBounceBlur',
			uniforms: { uRaw: { value: this.raw.texture } },
			vertexShader: VERT,
			fragmentShader: /* glsl */`
				uniform sampler2D uRaw;
				void main() {
					ivec2 c = ivec2( gl_FragCoord.xy );
					vec4 sum = vec4( 0.0 );
${ taps }					gl_FragColor = sum;
				}`,
			depthTest: false, depthWrite: false,
		} ) );
	}

	_request( cx, cz ) {
		const half = N * STEP / 2;
		const x0 = Math.round( ( cx - half ) / STEP ) * STEP, z0 = Math.round( ( cz - half ) / STEP ) * STEP;
		this.pending = { x0, z0 };
		this.pool.run( { type: 'bounceGrid', x0, z0, n: N, step: STEP }, 4 ).then( ( r ) => {
			if ( ! r || this.pending?.x0 !== x0 || this.pending?.z0 !== z0 ) return;
			this.pending = null;
			const tex = new THREE.DataTexture( r.data, N, N, THREE.RGBAFormat, THREE.FloatType );
			tex.minFilter = tex.magFilter = THREE.NearestFilter;
			tex.generateMipmaps = false;
			tex.needsUpdate = true;
			if ( this.cover ) this.cover.dispose();
			this.cover = tex;
			this.rect.set( x0, z0, N * STEP, N * STEP );
			this.centre = new THREE.Vector2( x0 + half, z0 + half );
			this.dirty = true;
		} ).catch( ( e ) => { console.warn( 'ground bounce cover', e ); this.pending = null; } );
	}

	update( gl, camPos ) {
		const ext = N * STEP;
		if ( ! this.pending && ( ! this.centre || Math.max( Math.abs( camPos.x - this.centre.x ), Math.abs( camPos.z - this.centre.y ) ) > ext * RECENTRE ) ) this._request( camPos.x, camPos.z );
		if ( ! this.cover ) return;
		// re-bake whenever the hill shadow was re-baked (the key light moved) or the map moved
		if ( ! this.dirty && this.hillVersion === this.hill.version ) return;
		this.dirty = false;
		this.hillVersion = this.hill.version;
		const u = this.bakePass.material.uniforms;
		u.uCover.value = this.cover;
		u.uL.value.copy( G.uSunDir.value ).normalize();
		u.uHill.value = G.uHillShadow.value;
		u.uHillRect.value.copy( G.uHillShadowRect.value );
		u.uHillOn.value = G.uHillShadowOn.value;
		const prev = gl.getRenderTarget();
		gl.setRenderTarget( this.raw );
		this.bakePass.render( gl );
		gl.setRenderTarget( this.map );
		this.blurPass.render( gl );
		gl.setRenderTarget( prev );
		G.uBounceMap.value = this.map.texture;
		G.uBounceRect.value.copy( this.rect );
		G.uBounceOn.value = 1;
	}

	dispose() {
		this.raw.dispose(); this.map.dispose();
		this.bakePass.dispose(); this.blurPass.dispose();
		if ( this.cover ) this.cover.dispose();
	}
}
