// Ported from Tidewater src/engine/render/Shadows.js (SunShadows) and the shadow part of
// src/engine/render/wgsl/lighting.js (MIT, see LICENSE-Tidewater.txt).
// Cascaded sun shadow maps. Each cascade covers a sphere around the camera (the lighting picks the cascade by
// the distance to the camera, not the view depth), so its map doesn't depend on where the camera looks: turning
// never re-renders a cascade, and a camera-centred sphere is also smaller than one around a 90-degree-wide
// frustum slice. The centre is snapped to the texel grid (no shimmer when moving), and the map is pulled back
// 200 m toward the light for off-screen casters.
// Updates are amortised: one cascade a frame. The near one renders on even frames, the middle one on odd
// frames (each at half the frame rate: a moving caster's shadow is at most a frame late), and the last one (the
// widest, most casters) takes an odd frame from the middle one when the light direction took a step or every
// LAZY_REFRESH frames for moving casters. Any cascade renders at once when the camera has used up the slack
// its sphere was given. (It used to be up to all three a frame, and the widest every 4th: 2-3x spikes.)
// The light direction the maps use follows the sun in SUN_STEP steps (it moves ~0.1 degree/s at the default day
// length, and re-rendering every cascade whenever it had moved at all made slow frames slower still: below
// ~22 fps that was every frame), and a step reaches each cascade at its own next turn. A jump (time set, sun
// to moon) re-renders them all at once.
// They are three hidden DirectionalLights whose maps three's WebGLShadowMap renders (the custom depth
// materials keep working); the lighting samples them in COMMON_GLSL (sunShadowCSM): PCSS on the near cascade
// (raw depth reads), 5-tap hardware PCF on the others, seams blended over bands that grow with the distance.
// Depth is reversed (1 near the light).
import * as THREE from 'three';
import { G, CSM_FALLBACK } from './Materials.js';

// splits: the far edge of each cascade (m from the camera)
// soft: contact-hardening penumbrae (PCSS) on the near cascade, else the plain 5-tap PCF everywhere
const QUALITY = {
	off: null,
	low: { size: 1024, splits: [ 40 ], soft: false },
	medium: { size: 1024, splits: [ 12, 150 ], soft: false },
	high: { size: 2048, splits: [ 10, 60, 450 ], soft: true },
	ultra: { size: 4096, splits: [ 10, 60, 450 ], soft: true },
};
const NORMAL_BIAS = [ 0.015, 0.06, 0.3 ];
const LIGHT_MARGIN = 200;
const BIAS = 0.00002;
// camera travel a cascade's sphere allows before its map must follow, as a share of its split
const SLACK = 0.08;
// frames between refreshes of the last cascade (moving casters: vehicles, creatures)
const LAZY_REFRESH = 12;
// rad: the step of the maps' light direction, and the change that re-renders every cascade at once
const SUN_STEP = 0.003;
const SUN_JUMP = 0.05;

const _center = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _v4 = new THREE.Vector4();
const _eye = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _upY = new THREE.Vector3( 0, 1, 0 ), _upX = new THREE.Vector3( 1, 0, 0 );

export class SunShadows {
	constructor( renderer ) {
		this.r = renderer;
		this.lights = [];
		this.cfg = null;
		this.frame = 0;
		// the light direction the maps are rendered with (follows the key light in steps)
		this.lightDir = new THREE.Vector3( 0, - 2, 0 );
		this.enabled = false;
		this.stats = { renders: [ 0, 0, 0 ], frames: 0 };
		// WebGLShadowMap.render needs three's render state (set only during a render): the cascades are
		// rendered from the afterRender callback of an empty scene
		this._host = new THREE.Scene();
		this._todo = null;
		this._host.onAfterRender = ( gl, s, camera ) => {
			if ( ! this._todo ) return;
			gl.shadowMap.needsUpdate = true;
			gl.shadowMap.render( this._todo, this._scene, camera );
			this._todo = null;
		};
	}

	setQuality( q ) {
		// ('off' maps to null: a plain ?? fallback turned it into 'high', so shadows could never be switched off)
		const cfg = q in QUALITY ? QUALITY[ q ] : QUALITY.high;
		for ( const L of this.lights ) L.shadow.dispose();
		this.lights = [];
		this.cfg = cfg;
		this.enabled = !! cfg;
		G.uCsmOn.value = 0;
		// (never leave a sampler on a disposed or missing map: the draws would fail)
		G.uCsm0.value = CSM_FALLBACK.raw;
		G.uCsm1.value = G.uCsm2.value = CSM_FALLBACK.cmp;
		if ( ! cfg ) return;
		const n = cfg.splits.length;
		for ( let i = 0; i < n; i ++ ) {
			const L = new THREE.DirectionalLight( 0xffffff, 0 );
			L.castShadow = true;
			L.shadow.autoUpdate = false;
			L.shadow.mapSize.set( cfg.size, cfg.size );
			L.shadow.bias = 0;
			L.shadow.normalBias = 0;
			// the sphere: the slice's far edge (with half its seam band) plus the slack
			const x = i === 0 ? 0 : cfg.splits[ i - 1 ], y = cfg.splits[ i ];
			const far = i === n - 1 ? y : y + this._margin( y ) * 0.5;
			const slack = Math.max( 1.5, y * SLACK );
			L.userData = { dirty: true, stale: false, last: - 1e9, centre: new THREE.Vector3( 1e9, 0, 0 ), slack, radius: Math.ceil( ( far + slack ) * 16 ) / 16, x, y, far };
			// the near cascade is read raw (PCSS): a plain depth texture, nearest; the others compare in hardware
			// (the colour attachment is never read: one byte per texel instead of four)
			const map = new THREE.WebGLRenderTarget( cfg.size, cfg.size, { format: THREE.RedFormat, type: THREE.UnsignedByteType, generateMipmaps: false } );
			map.depthTexture = new THREE.DepthTexture( cfg.size, cfg.size, THREE.UnsignedIntType );
			map.depthTexture.format = THREE.DepthFormat;
			map.depthTexture.name = 'sunCascade' + i;
			if ( i === 0 ) {
				map.depthTexture.compareFunction = null;
				map.depthTexture.minFilter = map.depthTexture.magFilter = THREE.NearestFilter;
			} else {
				map.depthTexture.compareFunction = this.r.reversed ? THREE.GreaterEqualCompare : THREE.LessEqualCompare;
				map.depthTexture.minFilter = map.depthTexture.magFilter = THREE.LinearFilter;
			}
			L.shadow.map = map;
			this.lights.push( L );
		}
		G.uCsmCount.value = n;
		G.uCsmSoft.value = cfg.soft ? 1 : 0;
		G.uCsmSize.value = cfg.size;
		G.uCsmBias.value = this.r.reversed ? BIAS : - BIAS;
		G.uCsm0.value = this.lights[ 0 ].shadow.map.depthTexture;
		if ( n > 1 ) G.uCsm1.value = this.lights[ 1 ].shadow.map.depthTexture;
		if ( n > 2 ) G.uCsm2.value = this.lights[ 2 ].shadow.map.depthTexture;
		for ( let i = 0; i < 3; i ++ ) G.uCsmInfo.value[ i ].set( i < n ? 0 : - 1, 1, 0, 1 );
		for ( let i = 0; i < n; i ++ ) {
			const u = this.lights[ i ].userData;
			G.uCsmBlend.value[ i ].set( u.x, u.y, this._margin( u.x ), this._margin( u.y ) );
		}
		this.lightDir.set( 0, - 2, 0 );
	}

	// seam blend band at distance d (SoftCSMShadowNode: max( 0.25 e^2, 0.25 e ) of the normalised break,
	// times the shadow distance)
	_margin( d ) {
		const far = this.cfg.splits[ this.cfg.splits.length - 1 ];
		const e = d / far;
		return Math.max( 0.25 * e * e, 0.25 * e ) * far;
	}

	// centre cascade i on the camera (snapped to its texels) for the light direction L
	_fit( i, camPos, L ) {
		const light = this.lights[ i ], u = light.userData, size = this.cfg.size;
		const r = u.radius;
		// light view looking along -L (three's lookAt basis), the centre snapped to texels
		const up = Math.abs( L.y ) > 0.99 ? _upX : _upY;
		_rot.lookAt( L, _origin, up );
		_inv.copy( _rot ).invert();
		const texel = 2 * r / size;
		const ls = _v4.set( camPos.x, camPos.y, camPos.z, 1 ).applyMatrix4( _inv );
		ls.x = Math.round( ls.x / texel ) * texel;
		ls.y = Math.round( ls.y / texel ) * texel;
		const back = r + LIGHT_MARGIN;
		_eye.set( ls.x, ls.y, ls.z + back ).applyMatrix4( _rot );
		light.position.copy( _eye );
		light.target.position.copy( _eye ).sub( L );
		light.updateMatrixWorld();
		light.target.updateMatrixWorld();
		const cam = light.shadow.camera;
		cam.up.copy( up );
		cam.left = - r; cam.right = r; cam.top = r; cam.bottom = - r;
		cam.near = 0.1; cam.far = back + r;
		cam._reversedDepth = this.r.reversed;
		cam.updateProjectionMatrix();
		light.shadow.updateMatrices( light );
		G.uCsmMat.value[ i ].copy( light.shadow.matrix );
		// far edge (m from the camera), texel (m), normal bias (m), depth range (m)
		G.uCsmInfo.value[ i ].set( u.far, texel, NORMAL_BIAS[ i ] ?? 0.05, cam.far - cam.near );
	}

	// fit and render the cascades due this frame (before the main render)
	update( camera, L, scene ) {
		if ( ! this.enabled ) return;
		this.frame ++;
		const on = L.y > - 0.05;
		G.uCsmOn.value = on ? 1 : 0;
		if ( ! on ) return;
		camera.updateMatrixWorld();
		_center.setFromMatrixPosition( camera.matrixWorld );
		const n = this.lights.length, last = n - 1;
		// the maps' light direction: a step marks every cascade stale (each catches up at its next turn), a jump
		// re-renders them all now
		const a = this.lightDir.angleTo( L );
		if ( a > SUN_JUMP || this.lightDir.y < - 1.5 ) {
			this.lightDir.copy( L );
			for ( const light of this.lights ) light.userData.dirty = true;
		} else if ( a > SUN_STEP ) {
			this.lightDir.copy( L );
			for ( const light of this.lights ) light.userData.stale = true;
		}
		// even frames: the near cascade; odd frames: the middle one, or the last one when it is due (the
		// middle one then waits a turn): one cascade a frame, never two
		const phase = this.frame % 2;
		const lz = this.lights[ last ].userData;
		const lazyDue = n > 1 && phase === 1 && ( lz.stale || this.frame - lz.last >= LAZY_REFRESH );
		const todo = [];
		for ( let i = 0; i < n; i ++ ) {
			const light = this.lights[ i ], u = light.userData;
			const moved = _center.distanceToSquared( u.centre ) > u.slack * u.slack;
			let due = u.dirty || moved;
			if ( ! due ) {
				if ( i === 0 ) due = phase === 0;
				else if ( i === last ) due = lazyDue;
				else due = phase === 1 && ! lazyDue;
			}
			if ( ! due ) continue;
			this._fit( i, _center, this.lightDir );
			u.dirty = false;
			u.stale = false;
			u.last = this.frame;
			u.centre.copy( _center );
			light.shadow.needsUpdate = true;
			todo.push( light );
			this.stats.renders[ i ] ++;
		}
		this.stats.frames ++;
		if ( ! todo.length ) return;
		const gl = this.r.gl;
		const layers = camera.layers.mask;
		camera.layers.set( 0 );
		this._todo = todo;
		this._scene = scene;
		gl.render( this._host, camera );
		this._scene = null;
		camera.layers.mask = layers;
	}

	// re-render every cascade on the next update (after a teleport, or when casters changed wholesale)
	invalidate() { for ( const light of this.lights ) light.userData.dirty = true; }

	// the shadow source for the post passes (the haze march): one hard tap per cascade
	get source() {
		if ( ! this.enabled || G.uCsmOn.value < 0.5 ) return null;
		return { lights: this.lights };
	}
}
