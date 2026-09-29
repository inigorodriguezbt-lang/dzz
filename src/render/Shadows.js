// Ported from Tidewater src/engine/render/Shadows.js (SunShadows) and the shadow part of
// src/engine/render/wgsl/lighting.js (MIT, see LICENSE-Tidewater.txt).
// Cascaded sun shadow maps: cascades fitted to bounding spheres of slices of the camera frustum (stable under
// rotation, the radius quantised to 1/16 m) and snapped to their texel grid (no shimmer when moving), pulled
// back 200 m toward the light for off-screen casters. The near cascade renders every frame, the next every
// 2nd, the last every 4th (all of them when the light moves). They are three hidden DirectionalLights whose
// maps three's WebGLShadowMap renders (the custom depth materials keep working); the lighting samples them in
// COMMON_GLSL (sunShadowCSM): PCSS on the near cascade (raw depth reads), 5-tap hardware PCF on the others,
// seams blended over bands that grow with the distance. Depth is reversed (1 near the light).
import * as THREE from 'three';
import { G } from './Materials.js';

const QUALITY = {
	off: null,
	medium: { size: 1024, splits: [ 10, 120 ] },
	high: { size: 2048, splits: [ 10, 60, 400 ] },
	ultra: { size: 4096, splits: [ 10, 60, 400 ] },
};
const NORMAL_BIAS = [ 0.015, 0.06, 0.3 ];
const LIGHT_MARGIN = 200;
const BIAS = 0.00002;

const _corners = [];
for ( let i = 0; i < 8; i ++ ) _corners.push( new THREE.Vector3() );
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
		this.lastSun = new THREE.Vector3( 0, - 2, 0 );
		this.enabled = false;
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
		const cfg = QUALITY[ q ] ?? QUALITY.high;
		for ( const L of this.lights ) L.shadow.dispose();
		this.lights = [];
		this.cfg = cfg;
		this.enabled = !! cfg;
		G.uCsmOn.value = 0;
		if ( ! cfg ) return;
		const n = cfg.splits.length;
		this.periods = cfg.splits.map( ( _, i ) => i === 0 ? 1 : i === 1 ? 2 : 4 );
		for ( let i = 0; i < n; i ++ ) {
			const L = new THREE.DirectionalLight( 0xffffff, 0 );
			L.castShadow = true;
			L.shadow.autoUpdate = false;
			L.shadow.mapSize.set( cfg.size, cfg.size );
			L.shadow.bias = 0;
			L.shadow.normalBias = 0;
			L.userData.dirty = true;
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
		G.uCsmSize.value = cfg.size;
		G.uCsmBias.value = this.r.reversed ? BIAS : - BIAS;
		G.uCsm0.value = this.lights[ 0 ].shadow.map.depthTexture;
		G.uCsm1.value = n > 1 ? this.lights[ 1 ].shadow.map.depthTexture : null;
		G.uCsm2.value = n > 2 ? this.lights[ 2 ].shadow.map.depthTexture : null;
		for ( let i = 0; i < 3; i ++ ) G.uCsmInfo.value[ i ].set( i < n ? 0 : - 1, 1, 0, 1 );
	}

	// seam blend band at view distance d (SoftCSMShadowNode: max( 0.25 e^2, 0.25 e ) of the normalised break,
	// times the shadow distance)
	_margin( d ) {
		const far = this.cfg.splits[ this.cfg.splits.length - 1 ];
		const e = d / far;
		return Math.max( 0.25 * e * e, 0.25 * e ) * far;
	}

	// fit cascade i to the view-distance slice of the camera, widened by half the seam blend bands
	_fit( i, camera, L ) {
		const splits = this.cfg.splits, n = splits.length, size = this.cfg.size;
		const light = this.lights[ i ];
		const x = i === 0 ? 0 : splits[ i - 1 ];
		const y = splits[ i ];
		const mN = this._margin( x ), mF = this._margin( y );
		const near = Math.max( camera.near, x - mN * 0.5 );
		const far = i === n - 1 ? y : y + mF * 0.5;
		G.uCsmBlend.value[ i ].set( x, y, mN, mF );
		// slice corners in world space
		const tanY = Math.tan( camera.fov * Math.PI / 360 ) / ( camera.zoom || 1 );
		const tanX = tanY * camera.aspect;
		let k = 0;
		for ( const d of [ near, far ] ) for ( const sx of [ - 1, 1 ] ) for ( const sy of [ - 1, 1 ] ) _corners[ k ++ ].set( sx * tanX * d, sy * tanY * d, - d ).applyMatrix4( camera.matrixWorld );
		// bounding sphere of the slice: centre on the axis, radius to the farthest corner
		const zc = Math.min( far, ( near + far ) / 2 * ( 1 + tanX * tanX + tanY * tanY ) );
		_center.set( 0, 0, - zc ).applyMatrix4( camera.matrixWorld );
		let r = 0;
		for ( const p of _corners ) r = Math.max( r, p.distanceTo( _center ) );
		r = Math.ceil( r * 16 ) / 16; // quantised: the texel size stays fixed while the camera turns
		// light view looking along -L (three's lookAt basis), the centre snapped to texels
		const up = Math.abs( L.y ) > 0.99 ? _upX : _upY;
		_rot.lookAt( L, _origin, up );
		_inv.copy( _rot ).invert();
		const texel = 2 * r / size;
		const ls = _v4.set( _center.x, _center.y, _center.z, 1 ).applyMatrix4( _inv );
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
		// far split, texel (m), normal bias (m), depth range (m)
		G.uCsmInfo.value[ i ].set( far, texel, NORMAL_BIAS[ i ] ?? 0.05, cam.far - cam.near );
	}

	// fit the cascades due this frame and render them (before the main render)
	update( camera, L, scene ) {
		if ( ! this.enabled ) return;
		this.frame ++;
		const on = L.y > - 0.05;
		G.uCsmOn.value = on ? 1 : 0;
		if ( ! on ) return;
		camera.updateMatrixWorld();
		const sunMoved = this.lastSun.angleTo( L ) > 1e-4;
		this.lastSun.copy( L );
		const todo = [];
		for ( let i = 0; i < this.lights.length; i ++ ) {
			const light = this.lights[ i ];
			if ( sunMoved || light.userData.dirty || ( this.frame + i ) % this.periods[ i ] === 0 ) {
				this._fit( i, camera, L );
				light.userData.dirty = false;
				light.shadow.needsUpdate = true;
				todo.push( light );
			}
		}
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

	// the shadow source for the post passes (the haze march): one hard tap per cascade
	get source() {
		if ( ! this.enabled || G.uCsmOn.value < 0.5 ) return null;
		return { lights: this.lights };
	}
}
