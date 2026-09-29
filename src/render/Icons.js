// Item icons: 128² thumbnails rendered from the same procedural 3D models the world uses — 3/4 studio view,
// transparent background, auto-framed — then cached in memory and persisted in IndexedDB (localStorage when
// IndexedDB is unavailable), keyed by a version, the item's model spec and the builder's source hash so an icon
// re-renders whenever the model that draws it changes.
//   iconFor( id ) -> Promise<dataURL|null>   queued, rendered a few per frame
//   iconSync( id ) -> dataURL|null           only what is already cached
//   setIconRenderer( webglRenderer )         the game's renderer (no second WebGL context); a private one otherwise
// Rendering goes into a half-float target (linear HDR), then a small pass applies ACES + sRGB and un-premultiplies
// alpha into an 8-bit target that is read back; 2× supersampling gives clean edges after the canvas downscale.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getItem } from '../game/items/ItemDB.js';
import { buildItemModel, hasModelBuilder, builderSignature } from './ItemModels.js';
import { G as UNI } from './Materials.js';

export const ICON_VERSION = 4; // bump to invalidate every stored icon (lighting / framing changes)
const SIZE = 128, SS = 2, RT = SIZE * SS;
const WEAPON_TYPES = new Set( [ 'gun', 'mag', 'ammo_box', 'attachment', 'melee', 'throwable' ] );

// the weapons module registers its builders when it loads; make sure they exist before drawing a weapon icon
const weaponModelModules = import.meta.glob( '../weapons/*Models.js' );
let weaponModelsLoading = null;
function loadWeaponModels() {
	if ( ! weaponModelsLoading ) weaponModelsLoading = Promise.all( Object.values( weaponModelModules ).map( f => f().catch( e => console.warn( 'icons: weapon models', e ) ) ) );
	return weaponModelsLoading;
}

let renderer = null;
let ownRenderer = null;
export function setIconRenderer( r ) { if ( r && r !== renderer ) { renderer = r; disposeStage(); } }

// ---- persistent store ------------------------------------------------------------------------------------------

const mem = new Map(); // id -> { sig, url }
const sigs = new Map(); // id -> signature (computed once per session, per builder state)
let db = null;
const LS_KEY = 'deadtide.icons.v' + ICON_VERSION;

function sigFor( id ) {
	const def = getItem( id );
	if ( ! def ) return null;
	const type = def.model?.type || 'box';
	const builder = hasModelBuilder( type ) ? builderSignature( type ) : 'fallback';
	const key = type + ':' + builder;
	let s = sigs.get( id );
	if ( s && s.key === key ) return s.sig;
	let h = 2166136261;
	const src = ICON_VERSION + JSON.stringify( def.model || {} ) + key;
	for ( let i = 0; i < src.length; i ++ ) { h ^= src.charCodeAt( i ); h = Math.imul( h, 16777619 ); }
	s = { key, sig: ( h >>> 0 ).toString( 36 ) };
	sigs.set( id, s );
	return s.sig;
}

const storeReady = ( async () => {
	try {
		if ( typeof indexedDB === 'undefined' ) throw new Error( 'no indexedDB' );
		db = await new Promise( ( resolve, reject ) => {
			const req = indexedDB.open( 'deadtide-icons', 1 );
			req.onupgradeneeded = () => req.result.createObjectStore( 'icons', { keyPath: 'id' } );
			req.onsuccess = () => resolve( req.result );
			req.onerror = () => reject( req.error );
			req.onblocked = () => reject( new Error( 'blocked' ) );
		} );
		const all = await new Promise( ( resolve, reject ) => {
			const req = db.transaction( 'icons', 'readonly' ).objectStore( 'icons' ).getAll();
			req.onsuccess = () => resolve( req.result || [] );
			req.onerror = () => reject( req.error );
		} );
		const stale = [];
		for ( const e of all ) { if ( e.v === ICON_VERSION ) mem.set( e.id, { sig: e.sig, url: e.url } ); else stale.push( e.id ); }
		if ( stale.length ) { const st = db.transaction( 'icons', 'readwrite' ).objectStore( 'icons' ); for ( const id of stale ) st.delete( id ); }
	} catch ( e ) {
		db = null;
		try { const o = JSON.parse( localStorage.getItem( LS_KEY ) || '{}' ); for ( const id in o ) mem.set( id, o[ id ] ); } catch ( e2 ) { /* private mode */ }
	}
} )();

let lsTimer = 0;
function persist( id, entry ) {
	if ( db ) {
		try { db.transaction( 'icons', 'readwrite' ).objectStore( 'icons' ).put( { id, v: ICON_VERSION, sig: entry.sig, url: entry.url } ); } catch ( e ) { /* quota / closed */ }
		return;
	}
	// localStorage: debounce and stop quietly at the quota
	clearTimeout( lsTimer );
	lsTimer = setTimeout( () => {
		const o = {};
		for ( const [ k, v ] of mem ) if ( ! v.fallback ) o[ k ] = { sig: v.sig, url: v.url };
		try { localStorage.setItem( LS_KEY, JSON.stringify( o ) ); } catch ( e ) { /* full */ }
	}, 1500 );
}

// ---- public -------------------------------------------------------------------------------------------------

export function iconSync( id ) {
	const e = mem.get( id );
	if ( ! e ) return null;
	return e.sig === sigFor( id ) ? e.url : null;
}

const queue = [];
const pending = new Map();
export function iconFor( id ) {
	const now = iconSync( id );
	if ( now ) return Promise.resolve( now );
	let p = pending.get( id );
	if ( p ) return p;
	p = new Promise( ( resolve ) => queue.push( { id, resolve } ) );
	pending.set( id, p );
	p.then( () => pending.delete( id ) );
	schedule();
	return p;
}

// forget everything (debug: window.__icons.clear())
export async function clearIcons() {
	mem.clear();
	try { if ( db ) db.transaction( 'icons', 'readwrite' ).objectStore( 'icons' ).clear(); localStorage.removeItem( LS_KEY ); } catch ( e ) { /* ignore */ }
}

// ---- the render queue --------------------------------------------------------------------------------------

let scheduled = false;
function schedule() {
	if ( scheduled ) return;
	scheduled = true;
	const run = async () => {
		await storeReady;
		const t0 = performance.now();
		// a few per frame so opening a full inventory never stalls the game
		while ( queue.length && ( performance.now() - t0 < 7 ) ) {
			const job = queue.shift();
			const cached = iconSync( job.id );
			if ( cached ) { job.resolve( cached ); continue; }
			const def = getItem( job.id );
			if ( ! def ) { job.resolve( null ); continue; }
			if ( WEAPON_TYPES.has( def.model?.type ) && ! hasModelBuilder( def.model.type ) && Object.keys( weaponModelModules ).length ) {
				await loadWeaponModels();
				sigs.delete( job.id );
			}
			let url = null;
			try { url = render( def ); } catch ( e ) { console.warn( 'icon', job.id, e ); }
			job.resolve( url );
		}
		scheduled = false;
		if ( queue.length ) schedule();
	};
	if ( typeof requestAnimationFrame === 'function' ) requestAnimationFrame( () => { run(); } );
	else setTimeout( run, 16 );
}

// ---- the stage ----------------------------------------------------------------------------------------------

let stage = null;

function getRenderer() {
	if ( renderer ) return renderer;
	if ( ! ownRenderer ) {
		ownRenderer = new THREE.WebGLRenderer( { antialias: false, alpha: true, preserveDrawingBuffer: false } );
		ownRenderer.setPixelRatio( 1 );
		ownRenderer.setSize( 4, 4, false );
		ownRenderer.outputColorSpace = THREE.LinearSRGBColorSpace;
		ownRenderer.toneMapping = THREE.NoToneMapping;
	}
	return ownRenderer;
}

function disposeStage() {
	if ( ! stage ) return;
	stage.hdr.dispose(); stage.ldr.dispose(); stage.quad.dispose(); stage.env?.dispose();
	stage = null;
}

function makeStage( r ) {
	const scene = new THREE.Scene();
	// studio: soft sky/ground fill, a warm key from the upper left, a cool fill and a rim light behind
	scene.add( new THREE.HemisphereLight( 0xe4efff, 0x5a5048, 1.1 ) );
	const key = new THREE.DirectionalLight( 0xfff4e6, 2.6 ); key.position.set( - 2, 4, 3 );
	const fill = new THREE.DirectionalLight( 0xcfe0ff, 0.9 ); fill.position.set( 4, 1.5, 2 );
	const rim = new THREE.DirectionalLight( 0xffffff, 1.8 ); rim.position.set( 1, 2.5, - 4 );
	scene.add( key, fill, rim );
	let env = null;
	try {
		const pm = new THREE.PMREMGenerator( r );
		env = pm.fromScene( new RoomEnvironment(), 0.04 ).texture;
		pm.dispose();
		scene.environment = env;
		scene.environmentIntensity = 0.55;
	} catch ( e ) { /* no environment: metals just look darker */ }
	const camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0.01, 100 );
	camera.layers.enableAll();
	const hdr = new THREE.WebGLRenderTarget( RT, RT, { type: THREE.HalfFloatType, depthBuffer: true } );
	const ldr = new THREE.WebGLRenderTarget( RT, RT, { type: THREE.UnsignedByteType, depthBuffer: false } );
	const quad = new FullScreenQuad( new THREE.ShaderMaterial( {
		uniforms: { tSrc: { value: hdr.texture }, exposure: { value: 1.05 } },
		vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
		fragmentShader: /* glsl */`
			uniform sampler2D tSrc; uniform float exposure; varying vec2 vUv;
			vec3 RRTAndODTFit( vec3 v ) { vec3 a = v * ( v + 0.0245786 ) - 0.000090537; vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081; return a / b; }
			vec3 aces( vec3 c ) {
				const mat3 I = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
				const mat3 O = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
				c *= exposure / 0.6; c = I * c; c = RRTAndODTFit( c ); c = O * c; return clamp( c, 0.0, 1.0 );
			}
			vec3 srgb( vec3 c ) { return mix( 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, c * 12.92, vec3( lessThanEqual( c, vec3( 0.0031308 ) ) ) ); }
			void main() {
				vec4 s = texture2D( tSrc, vUv );
				float a = clamp( s.a, 0.0, 1.0 );
				vec3 c = a > 0.0 ? s.rgb / a : vec3( 0.0 ); // the target blended over transparent black
				gl_FragColor = vec4( srgb( aces( c ) ), a );
			}`,
		depthTest: false, depthWrite: false, blending: THREE.NoBlending,
	} ) );
	const canvas = document.createElement( 'canvas' ); canvas.width = RT; canvas.height = RT;
	const out = document.createElement( 'canvas' ); out.width = SIZE; out.height = SIZE;
	const octx = out.getContext( '2d' );
	octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
	const webp = out.toDataURL( 'image/webp' ).startsWith( 'data:image/webp' );
	return { renderer: r, scene, camera, hdr, ldr, quad, env, canvas, ctx: canvas.getContext( '2d' ), out, octx, webp, pixels: new Uint8Array( RT * RT * 4 ), img: new ImageData( RT, RT ) };
}

const _box = new THREE.Box3(), _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _up = new THREE.Vector3( 0, 1, 0 );
const _right = new THREE.Vector3(), _camUp = new THREE.Vector3();

function render( def ) {
	const r = getRenderer();
	if ( ! stage || stage.renderer !== r ) { disposeStage(); stage = makeStage( r ); }
	const S = stage;
	const model = buildItemModel( def );
	const fallback = !! model.userData.fallback;
	const prevParent = model.parent;
	S.scene.add( model );
	model.updateMatrixWorld( true );
	_box.setFromObject( model, true );
	if ( _box.isEmpty() ) _box.set( _v.set( - 0.1, 0, - 0.1 ), new THREE.Vector3( 0.1, 0.1, 0.1 ) );
	const size = _box.getSize( new THREE.Vector3() ), centre = _box.getCenter( new THREE.Vector3() );

	// view direction by shape: long things in profile, flat things from above, everything else 3/4
	const long = size.x > 2.2 * Math.max( size.y, size.z );
	const flat = size.y < 0.18 * Math.max( size.x, size.z );
	if ( long ) _dir.set( 0.18, 0.42, 1 );
	else if ( flat ) _dir.set( 0.45, 1.25, 0.9 );
	else _dir.set( 0.8, 0.7, 1 );
	_dir.normalize();
	const cam = S.camera;
	const dist = size.length() * 2 + 1;
	cam.position.copy( centre ).addScaledVector( _dir, dist );
	cam.up.copy( _up );
	cam.lookAt( centre );
	cam.updateMatrixWorld( true );
	// fit the eight corners in view space
	_right.setFromMatrixColumn( cam.matrixWorld, 0 ); _camUp.setFromMatrixColumn( cam.matrixWorld, 1 );
	let minX = Infinity, maxX = - Infinity, minY = Infinity, maxY = - Infinity;
	for ( let i = 0; i < 8; i ++ ) {
		_v.set( i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z ).sub( cam.position );
		const x = _v.dot( _right ), y = _v.dot( _camUp );
		minX = Math.min( minX, x ); maxX = Math.max( maxX, x ); minY = Math.min( minY, y ); maxY = Math.max( maxY, y );
	}
	// square frame with a margin, centred on the projected bounds
	const half = Math.max( maxX - minX, maxY - minY ) * 0.5 * 1.1;
	const cx = ( minX + maxX ) / 2, cy = ( minY + maxY ) / 2;
	cam.left = cx - half; cam.right = cx + half; cam.top = cy + half; cam.bottom = cy - half;
	cam.near = 0.01; cam.far = dist * 2 + size.length() * 2;
	cam.updateProjectionMatrix();

	// the world's atmosphere patch would fog the model (it sits far from the game camera): neutralise it
	const saved = { fog: UNI.uFogDensity.value, wet: UNI.uWet.value, cs: UNI.uCloudShadowK.value, cam: UNI.uCamPos.value.clone() };
	UNI.uFogDensity.value = 0; UNI.uWet.value = 0; UNI.uCloudShadowK.value = 0; UNI.uCamPos.value.copy( cam.position );
	const prevTarget = r.getRenderTarget();
	const prevClear = r.getClearColor( new THREE.Color() ), prevAlpha = r.getClearAlpha();
	const prevAuto = r.autoClear, prevXR = r.xr.enabled;
	const prevShadow = r.shadowMap.enabled;
	let url = null;
	try {
		r.xr.enabled = false;
		r.shadowMap.enabled = false;
		r.setRenderTarget( S.hdr );
		r.setClearColor( 0x000000, 0 );
		r.clear( true, true, false );
		r.render( S.scene, cam );
		r.setRenderTarget( S.ldr );
		r.clear( true, false, false );
		S.quad.render( r );
		r.readRenderTargetPixels( S.ldr, 0, 0, RT, RT, S.pixels );
	} finally {
		r.setRenderTarget( prevTarget );
		r.setClearColor( prevClear, prevAlpha );
		r.autoClear = prevAuto; r.xr.enabled = prevXR; r.shadowMap.enabled = prevShadow;
		UNI.uFogDensity.value = saved.fog; UNI.uWet.value = saved.wet; UNI.uCloudShadowK.value = saved.cs; UNI.uCamPos.value.copy( saved.cam );
		S.scene.remove( model );
		if ( prevParent ) prevParent.add( model );
	}
	// GL rows are bottom-up
	const px = S.pixels, dst = S.img.data, row = RT * 4;
	for ( let y = 0; y < RT; y ++ ) dst.set( px.subarray( ( RT - 1 - y ) * row, ( RT - y ) * row ), y * row );
	S.ctx.putImageData( S.img, 0, 0 );
	S.octx.clearRect( 0, 0, SIZE, SIZE );
	S.octx.drawImage( S.canvas, 0, 0, SIZE, SIZE );
	url = S.webp ? S.out.toDataURL( 'image/webp', 0.92 ) : S.out.toDataURL( 'image/png' );
	const entry = { sig: sigFor( def.id ), url, fallback };
	mem.set( def.id, entry );
	if ( ! fallback ) persist( def.id, entry );
	return url;
}

if ( typeof window !== 'undefined' ) window.__icons = { iconFor, iconSync, clear: clearIcons, version: ICON_VERSION };
