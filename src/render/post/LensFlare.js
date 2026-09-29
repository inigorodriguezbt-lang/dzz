// Ported from Tidewater src/post/LensFlare.js (MIT, see LICENSE-Tidewater.txt).
// Camera lens flare for the sun, built from what a real multi-element lens does: ghosts (images of the
// 7-blade aperture strung along the line from the sun through the image centre, with dispersion fringes),
// a faint dispersive halo, a 14-spike diffraction starburst and veiling glare. The sun's visibility (the
// fraction of its disc not hidden by the scene, times the cloud transmittance) is measured every frame from
// 24 depth taps and eased, so fronds crossing the sun make the flare flicker without popping.
// The light (key light colour x visibility x 0.02) is added in the grade before the exposure.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G, COMMON_GLSL, SHARED_PARS } from '../Materials.js';
import { CLOUD_VIEW_GLSL } from '../sky/Clouds.js';

const BLADES = 7;
const ROT = 0.3; // aperture rotation (rad)
// a: position along the axis (1 = sun, 0 = image centre, < 0 past it), r: radius (fraction of the image
// height), tint, strength
const GHOSTS = [
	{ a: 0.72, r: 0.018, tint: [ 1.0, 0.85, 0.6 ], k: 0.55 },
	{ a: 0.44, r: 0.045, tint: [ 0.55, 0.9, 1.0 ], k: 0.35 },
	{ a: 0.16, r: 0.022, tint: [ 0.8, 1.0, 0.7 ], k: 0.45 },
	{ a: - 0.18, r: 0.07, tint: [ 0.6, 0.75, 1.0 ], k: 0.22 },
	{ a: - 0.42, r: 0.03, tint: [ 1.0, 0.7, 0.9 ], k: 0.4 },
	{ a: - 0.75, r: 0.11, tint: [ 0.7, 1.0, 0.85 ], k: 0.14 },
	{ a: - 1.15, r: 0.05, tint: [ 1.0, 0.8, 0.55 ], k: 0.28 },
];
const VIS_TAPS = 24;

const f = ( x ) => {
	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';
};

let taps = '';
for ( let i = 0; i < VIS_TAPS; i ++ ) {
	// golden-angle spiral over the sun's disc
	const r = Math.sqrt( ( i + 0.5 ) / VIS_TAPS );
	const t = i * 2.39996323;
	taps += `\t\tsky += flareSkyTap( c + vec2( ${f( Math.cos( t ) * r )}, ${f( Math.sin( t ) * r )} ) * uDiscPx, size );\n`;
}

const VIS_FRAG = /* glsl */`
	${SHARED_PARS}
	uniform sampler2D tDepth; uniform sampler2D tPrev; uniform vec2 uFlareSunUV; uniform float uInView; uniform float uAboveWater;
	uniform float uDiscPx; uniform float uDt;
	${COMMON_GLSL}
	${CLOUD_VIEW_GLSL}
	float flareSkyTap( vec2 p, ivec2 size ) {
		ivec2 q = clamp( ivec2( p ), ivec2( 0 ), size - 1 );
		// reversed depth: the sky is at 0
		return texelFetch( tDepth, q, 0 ).r < 1e-7 ? 1.0 : 0.0;
	}
	void main() {
		ivec2 size = textureSize( tDepth, 0 );
		vec2 c = uFlareSunUV * vec2( size );
		float sky = 0.0;
${taps}
		float cloudT = cloudsSunTransmittance( cloudsSampleView( uSkySunDir ).a );
		float up = smoothstep( -0.02, 0.04, uSkySunDir.y );
		float tgt = sky / ${f( VIS_TAPS )} * cloudT * up * uInView * uAboveWater;
		float v = texelFetch( tPrev, ivec2( 0 ), 0 ).r;
		gl_FragColor = vec4( mix( v, tgt, 1.0 - exp( uDt * -14.0 ) ), 0.0, 0.0, 1.0 );
	}`;

let ghosts = '';
for ( const g of GHOSTS ) {
	ghosts += /* glsl */`
		{
			float pd = flarePolyDist( p - s * ${f( g.a )} );
			vec3 body = vec3( smoothstep( ${f( g.r * 0.975 )}, ${f( g.r * 0.975 * 0.9 )}, pd ), smoothstep( ${f( g.r )}, ${f( g.r * 0.9 )}, pd ), smoothstep( ${f( g.r * 1.025 )}, ${f( g.r * 1.025 * 0.9 )}, pd ) );
			float rim = smoothstep( ${f( g.r * 0.55 )}, ${f( g.r )}, pd ) * 0.7 + 0.3;
			// smaller ghosts concentrate the same reflected energy: brighter
			ghosts += body * rim * vec3( ${g.tint.map( f ).join( ', ' )} ) * ${f( g.k * 0.0028 / ( g.r * g.r ) )};
		}`;
}

// for the grade: flareLight( uv ) -> HDR light (before exposure). Uniforms: tFlareVis, uFlareSunUV,
// uFlareAspect, uFlareStrength, uFlareColor, uFlareResY
export const FLARE_GLSL = /* glsl */`
	uniform sampler2D tFlareVis; uniform vec2 uFlareSunUV; uniform float uFlareAspect; uniform float uFlareStrength;
	uniform vec3 uFlareColor; uniform float uFlareResY;
	const float FLARE_SEG = ${f( 2 * Math.PI / BLADES )};
	// aperture polygon: distance scaled so the polygon edge sits at the given radius
	float flarePolyDist( vec2 d ) {
		float a = atan( d.y, d.x ) + ${f( ROT )};
		return length( d ) * cos( floor( a / FLARE_SEG + 0.5 ) * FLARE_SEG - a );
	}
	vec3 flareLight( vec2 uv ) {
		if ( uFlareStrength <= 0.0 ) return vec3( 0.0 );
		float vis = texelFetch( tFlareVis, ivec2( 0 ), 0 ).r;
		if ( vis <= 0.0 ) return vec3( 0.0 );
		vec2 asp = vec2( uFlareAspect, 1.0 );
		vec2 p = ( uv - 0.5 ) * asp;
		vec2 s = ( uFlareSunUV - 0.5 ) * asp;
		// light arriving from the sun disc (the key light colour follows the atmosphere's transmittance)
		vec3 light = uFlareColor * vis * uFlareStrength * 0.02;
		vec3 ghosts = vec3( 0.0 );
${ghosts}
		// fade the ghosts as the sun nears the centre (they collapse onto it and vanish)
		float offAxis = smoothstep( 0.02, 0.2, length( s ) );
		// halo: dispersive ring about the image centre
		float rc = length( p );
		vec3 halo = vec3( smoothstep( 0.03, 0.0, abs( rc - 0.43 ) ), smoothstep( 0.03, 0.0, abs( rc - 0.445 ) ), smoothstep( 0.03, 0.0, abs( rc - 0.46 ) ) ) * smoothstep( 0.25, 0.8, length( s ) ) * 0.12;
		// starburst and veiling glare around the sun (distances in image heights)
		vec2 q = p - s;
		float rq = max( length( q ), 1e-4 );
		float aq = atan( q.y, q.x ) + ${f( ROT )};
		float px = 1.0 / max( uFlareResY, 1.0 );
		// the nearest spike (two per blade) and this pixel's distance from its line
		float seg = ${f( Math.PI / BLADES )};
		float k = floor( aq / seg + 0.5 );
		float perp = abs( sin( aq - k * seg ) ) * rq;
		float ki = k - ${f( 2 * BLADES )} * floor( k / ${f( 2 * BLADES )} );
		float h1 = fract( sin( ki * 12.9898 + 4.1 ) * 43758.5453 );
		float h2 = fract( sin( ki * 78.233 + 1.7 ) * 43758.5453 );
		// thin at the disc, a little softer outward (same energy across the line: dimmer as it widens)
		float width = px * 0.8 + rq * 0.003;
		float line = exp( - ( perp * perp ) / ( width * width ) ) * ( px * 0.8 / width );
		float len = 0.05 + 0.08 * h1;
		vec3 lenC = vec3( len * 1.12, len, len * 0.88 );
		vec3 taper = exp( - rq / lenC - ( rq * rq ) / ( lenC * lenC * 4.0 ) );
		vec3 spikes = line * taper * ( 0.45 + 0.55 * h2 ) * 1.4;
		// fine streaks around the disc: smooth angular noise, short
		float t = ( aq * ${f( 1 / ( 2 * Math.PI ) )} + 0.5 ) * 48.0;
		float ti = floor( t );
		float hA = fract( sin( ( ti - 48.0 * floor( ti / 48.0 ) ) * 91.345 ) * 43758.5453 );
		float hB = fract( sin( ( ti + 1.0 - 48.0 * floor( ( ti + 1.0 ) / 48.0 ) ) * 91.345 ) * 43758.5453 );
		float n = mix( hA, hB, smoothstep( 0.0, 1.0, t - ti ) );
		float fine = pow( n, 5.0 ) * exp( - rq / 0.03 ) * 0.3;
		float glow = exp( rq * -5.0 ) * 0.05 + exp( rq * -40.0 ) * 0.4;
		vec3 burst = spikes + vec3( fine + glow );
		return light * ( ghosts * offAxis + halo + burst );
	}
`;

const VERT = /* glsl */`
	void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class LensFlare {
	constructor() {
		const t1 = () => {
			const t = new THREE.WebGLRenderTarget( 1, 1, { type: THREE.FloatType, depthBuffer: false } );
			t.texture.minFilter = t.texture.magFilter = THREE.NearestFilter;
			t.texture.generateMipmaps = false;
			return t;
		};
		this.vis = [ t1(), t1() ];
		this._i = 0;
		this.sunUV = new THREE.Vector2( 0.5, 0.5 );
		this.inView = 0;
		this.cloudSource = null;
		this.mat = new THREE.ShaderMaterial( {
			name: 'FlareVisibility', vertexShader: VERT, fragmentShader: VIS_FRAG, depthTest: false, depthWrite: false,
			uniforms: Object.assign( {
				tDepth: { value: null }, tPrev: { value: null }, uFlareSunUV: { value: this.sunUV }, uInView: { value: 0 }, uAboveWater: { value: 1 },
				uDiscPx: { value: 6 }, uDt: { value: 1 / 60 },
				uCloudView: { value: null }, uCvRight: { value: new THREE.Vector3() }, uCvUp: { value: new THREE.Vector3() },
				uCvFwd: { value: new THREE.Vector3() }, uCvTan: { value: new THREE.Vector2( 1, 1 ) }, uCvValid: { value: 0 },
			}, G ),
		} );
		this.quad = new FullScreenQuad( this.mat );
	}

	get texture() { return this.vis[ this._i ].texture; }

	// measure this frame's visibility (depth: the scene depth with the water, before the view model)
	update( gl, camera, depth, height, dt ) {
		const u = this.mat.uniforms;
		const d = G.uSkySunDir.value;
		camera.updateMatrixWorld();
		const v = _v.copy( camera.position ).addScaledVector( d, 1000 ).project( camera );
		const ahead = _f.set( 0, 0, - 1 ).applyQuaternion( camera.quaternion ).dot( d ) > 0.05;
		this.sunUV.set( v.x * 0.5 + 0.5, v.y * 0.5 + 0.5 );
		// fade out over the last 5 % before the frame edge (no pop when the sun leaves the view)
		const edge = Math.max( Math.abs( v.x ), Math.abs( v.y ) );
		this.inView = ahead ? THREE.MathUtils.clamp( ( 1.0 - edge ) / 0.1, 0, 1 ) : 0;
		u.uInView.value = this.inView;
		u.uAboveWater.value = G.uUnderwater.value > 0.5 ? 0 : 1;
		u.uDt.value = Math.min( dt, 0.1 );
		// the sun disc radius (0.265 degrees) in depth-buffer pixels
		u.uDiscPx.value = Math.max( 1.5, 0.004625 / Math.tan( THREE.MathUtils.degToRad( camera.fov ) * 0.5 ) * height * 0.5 );
		u.tDepth.value = depth;
		const cs = this.cloudSource;
		u.uCvValid.value = cs && cs.viewValid ? 1 : 0;
		if ( cs ) {
			u.uCloudView.value = cs.viewTex;
			u.uCvRight.value.copy( cs.viewRight ); u.uCvUp.value.copy( cs.viewUp ); u.uCvFwd.value.copy( cs.viewFwd ); u.uCvTan.value.copy( cs.viewTan );
		}
		u.tPrev.value = this.vis[ this._i ].texture;
		this._i = 1 - this._i;
		gl.setRenderTarget( this.vis[ this._i ] );
		this.quad.render( gl );
	}
}
