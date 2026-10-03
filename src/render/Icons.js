// Item icons: 128² thumbnails rendered from the same procedural 3D models the world uses — 3/4 studio view,
// transparent background, auto-framed — then cached in memory and persisted in IndexedDB (localStorage when
// IndexedDB is unavailable), keyed by a version, the item's model spec and the builder's source hash so an icon
// re-renders whenever the model that draws it changes.
//   iconFor( id, v? ) -> Promise<dataURL|null>   queued, rendered a few per frame
//   iconSync( id, v? ) -> dataURL|null           only what is already cached
//   setIconRenderer( webglRenderer )             the game's renderer (no second WebGL context); a private one otherwise
// v = { w, h }: a variant for an inventory footprint of w x h cells (docs/UI_DAYZ.md grids): drawn at that aspect and
// VARIANT_CELL px per cell, long things level instead of on the diagonal. It is cached and stored under 'id@wxh'.
// Rendering goes into a half-float target (linear HDR), then a small pass applies ACES + sRGB and un-premultiplies
// alpha into an 8-bit target that is read back; 2× supersampling gives clean edges after the canvas downscale.
// No stalls on the game's context: a model's shaders are compiled for the stage first (in parallel where the
// browser can, then the icon is drawn on a later frame) and pixels come back through an async readback.
// An icon that comes back (nearly) empty — a lost context, a failed draw — is never cached or stored.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getItem } from '../game/items/ItemDB.js';
import { lookDef } from '../game/items/ext/gear/logic.js';
import { buildItemModel, hasModelBuilder, builderSignature } from './ItemModels.js';
import { G as UNI } from './Materials.js';

export const ICON_VERSION = 6; // bump to invalidate every stored icon (lighting / framing changes; 6: blank icons were kept)
const SIZE = 128, SS = 2;
const COVER = 0.004; // fewer drawn pixels than this share of the target: the draw failed, do not keep it
const VARIANT_CELL = 72, VARIANT_MAX = 432; // px per cell of a footprint variant, and its longest side
const WEAPON_TYPES = new Set( [ 'gun', 'mag', 'ammo_box', 'attachment', 'melee', 'throwable' ] );

// 'id' or 'id@3x2' (a footprint variant)
function keyOf( id, v ) { return v && ( v.w > 1 || v.h > 1 ) ? `${id}@${v.w | 0}x${v.h | 0}` : id; }
function parseKey( key ) {
	const at = key.indexOf( '@' );
	if ( at < 0 ) return { id: key, v: null };
	const m = /^(\d+)x(\d+)$/.exec( key.slice( at + 1 ) );
	return { id: key.slice( 0, at ), v: m ? { w: + m[ 1 ], h: + m[ 2 ] } : null };
}
// output size of a key's icon
function outSize( v ) {
	if ( ! v ) return { W: SIZE, H: SIZE };
	const k = Math.min( 1, VARIANT_MAX / ( Math.max( v.w, v.h ) * VARIANT_CELL ) );
	return { W: Math.round( v.w * VARIANT_CELL * k ), H: Math.round( v.h * VARIANT_CELL * k ) };
}

// the weapons module registers its builders when it loads; make sure they exist before drawing a weapon icon
let weaponModelModules = {};
try { weaponModelModules = import.meta.glob( '../weapons/*Models.js' ); } catch ( e ) { /* not built by Vite (Node tests) */ }
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

function sigFor( ikey ) {
	// an id, or a look key ('tshirt~black': a dyed stack, the gear domain's lookKey), maybe with a variant ('@3x2')
	const { id, v } = parseKey( ikey );
	const def = getItem( id ) || lookDef( id );
	if ( ! def ) return null;
	const type = def.model?.type || 'box';
	const builder = hasModelBuilder( type ) ? builderSignature( type ) : 'fallback';
	const key = type + ':' + builder;
	let s = sigs.get( ikey );
	if ( s && s.key === key ) return s.sig;
	let h = 2166136261;
	const src = ICON_VERSION + JSON.stringify( def.model || {} ) + key + ( v ? `@${v.w}x${v.h}:${VARIANT_CELL}` : '' );
	for ( let i = 0; i < src.length; i ++ ) { h ^= src.charCodeAt( i ); h = Math.imul( h, 16777619 ); }
	s = { key, sig: ( h >>> 0 ).toString( 36 ) };
	sigs.set( ikey, s );
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

export function iconSync( id, v = null ) {
	const key = keyOf( id, v );
	const e = mem.get( key );
	if ( ! e ) return null;
	return e.sig === sigFor( key ) ? e.url : null;
}

const queue = [];
const pending = new Map();
export function iconFor( id, v = null ) {
	const key = keyOf( id, v );
	const now = iconSync( key );
	if ( now ) return Promise.resolve( now );
	let p = pending.get( key );
	if ( p ) return p;
	p = new Promise( ( resolve ) => queue.push( { key, ...parseKey( key ), resolve } ) );
	pending.set( key, p );
	p.then( () => pending.delete( key ) );
	schedule();
	return p;
}

// forget everything (the item preview page's ?fresh=1)
export async function clearIcons() {
	mem.clear();
	try { if ( db ) db.transaction( 'icons', 'readwrite' ).objectStore( 'icons' ).clear(); localStorage.removeItem( LS_KEY ); } catch ( e ) { /* ignore */ }
}

// ---- the render queue --------------------------------------------------------------------------------------

let scheduled = false;
let inFlight = 0; // icons drawn and waiting for their pixels
const MAX_IN_FLIGHT = 4;
function schedule() {
	if ( scheduled ) return;
	scheduled = true;
	const run = async () => {
		await storeReady;
		const t0 = performance.now();
		// a few per frame so opening a full inventory never stalls the game
		const later = [];
		while ( queue.length && inFlight < MAX_IN_FLIGHT && ( performance.now() - t0 < 6 ) ) {
			const job = queue.shift();
			const cached = iconSync( job.key );
			if ( cached ) { job.resolve( cached ); continue; }
			const def = getItem( job.id ) || lookDef( job.id );
			if ( ! def ) { job.resolve( null ); continue; }
			if ( WEAPON_TYPES.has( def.model?.type ) && ! hasModelBuilder( def.model.type ) && Object.keys( weaponModelModules ).length ) {
				await loadWeaponModels();
				sigs.delete( job.key );
			}
			// a model textured with a world image that is still downloading would bake a black icon into the
			// store: wait for it (a few seconds at most, then draw it anyway but do not keep it)
			const ready = texturesReady( buildItemModel( def ) );
			if ( ! ready && ( job.tries = ( job.tries || 0 ) + 1 ) < 60 ) { later.push( job ); continue; }
			try {
				if ( ! job.compiled ) {
					// new shaders compile off the frame; the icon is drawn once they are ready
					job.compiled = true;
					const p = prepare( def );
					if ( p ) { p.then( () => { queue.unshift( job ); schedule(); }, () => { queue.unshift( job ); schedule(); } ); continue; }
				}
				inFlight ++;
				render( def, ! ready, job.key, job.v ).then( ( url ) => job.resolve( url ), ( e ) => { console.warn( 'icon', job.key, e ); job.resolve( null ); } ).finally( () => { inFlight --; if ( queue.length ) schedule(); } );
			} catch ( e ) { console.warn( 'icon', job.id, e ); job.resolve( null ); }
		}
		scheduled = false;
		if ( later.length ) { queue.push( ...later ); if ( ! scheduled ) setTimeout( schedule, 100 ); return; }
		if ( queue.length && inFlight < MAX_IN_FLIGHT ) schedule();
	};
	if ( typeof requestAnimationFrame === 'function' ) requestAnimationFrame( () => { run(); } );
	else setTimeout( run, 16 );
}

// ---- the stage ----------------------------------------------------------------------------------------------

let stage = null;

// every texture the model samples has its image decoded
const TEX_SLOTS = [ 'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap' ];
function texturesReady( obj ) {
	let ok = true;
	obj.traverse( ( o ) => {
		if ( ! ok || ! o.isMesh ) return;
		for ( const m of Array.isArray( o.material ) ? o.material : [ o.material ] ) {
			for ( const k of TEX_SLOTS ) {
				const img = m?.[ k ]?.image;
				if ( ! m?.[ k ] ) continue;
				if ( ! img || ( img.complete === false ) || ( img.naturalWidth === 0 && img.width === 0 ) ) { ok = false; return; }
			}
		}
	} );
	return ok;
}

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
	for ( const b of stage.bufs.values() ) { b.hdr.dispose(); b.ldr.dispose(); }
	stage.bufs.clear();
	stage.quad.dispose(); stage.env?.dispose();
	stage = null;
}

// the targets and canvases for one output size (W x H px): the square icon's, and a few footprint variants' (least
// recently used ones are freed)
const MAX_BUFS = 4;
function bufsFor( S, W, H ) {
	const k = W + 'x' + H;
	let b = S.bufs.get( k );
	if ( b ) { S.bufs.delete( k ); S.bufs.set( k, b ); return b; }
	const RW = W * SS, RH = H * SS;
	const hdr = new THREE.WebGLRenderTarget( RW, RH, { type: THREE.HalfFloatType, depthBuffer: true } );
	const ldr = new THREE.WebGLRenderTarget( RW, RH, { type: THREE.UnsignedByteType, depthBuffer: false } );
	const canvas = document.createElement( 'canvas' ); canvas.width = RW; canvas.height = RH;
	const out = document.createElement( 'canvas' ); out.width = W; out.height = H;
	// (CPU canvases: the pixels go in with putImageData and out with toDataURL; a GPU-backed canvas made every icon
	// a synchronous GPU readback in the GPU process, "GPU stall due to ReadPixels")
	const octx = out.getContext( '2d', { willReadFrequently: true } );
	octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
	b = { W, H, RW, RH, hdr, ldr, canvas, ctx: canvas.getContext( '2d', { willReadFrequently: true } ), out, octx, img: new ImageData( RW, RH ), pool: [] };
	S.bufs.set( k, b );
	for ( const [ kk, bb ] of S.bufs ) {
		if ( S.bufs.size <= MAX_BUFS ) break;
		if ( kk === SIZE + 'x' + SIZE || bb === b ) continue;
		bb.hdr.dispose(); bb.ldr.dispose();
		S.bufs.delete( kk );
	}
	return b;
}

function getStage() {
	const r = getRenderer();
	if ( ! stage || stage.renderer !== r ) { disposeStage(); stage = makeStage( r ); }
	return stage;
}

const contextLost = ( r ) => !! r.getContext?.()?.isContextLost?.();

// the renderer state an icon draws with (the program cache keys on some of it: the target, shadows)
function enter( r, B ) {
	const prev = { target: r.getRenderTarget(), clear: r.getClearColor( new THREE.Color() ), alpha: r.getClearAlpha(), auto: r.autoClear, xr: r.xr.enabled, shadow: r.shadowMap.enabled };
	r.xr.enabled = false;
	r.shadowMap.enabled = false;
	r.setRenderTarget( B.hdr );
	return prev;
}
function leave( r, prev ) {
	r.setRenderTarget( prev.target );
	r.setClearColor( prev.clear, prev.alpha );
	r.autoClear = prev.auto; r.xr.enabled = prev.xr; r.shadowMap.enabled = prev.shadow;
}

// start compiling the model's shaders for the stage's lights and target (the icon stage lights differ from the
// world's, so each material needs its own program here); a promise for when they are ready, or null when they
// already are
function prepare( def ) {
	const r = getRenderer();
	if ( ! r.compile || ! r.properties || contextLost( r ) ) return null;
	const S = getStage();
	const model = buildItemModel( def );
	const prevParent = model.parent;
	S.scene.add( model );
	const prev = enter( r, bufsFor( S, SIZE, SIZE ) );
	let mats = null;
	try { mats = r.compile( S.scene, S.camera ); } finally {
		leave( r, prev );
		S.scene.remove( model );
		if ( prevParent ) prevParent.add( model );
	}
	const busy = () => [ ...( mats || [] ) ].some( m => { const pr = r.properties.get( m ).currentProgram; return pr && ! pr.isReady(); } );
	if ( ! busy() ) return null;
	return new Promise( ( resolve ) => { const poll = () => busy() ? setTimeout( poll, 12 ) : resolve(); setTimeout( poll, 12 ); } );
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
	const quad = new FullScreenQuad( new THREE.ShaderMaterial( {
		uniforms: { tSrc: { value: null }, exposure: { value: 1.05 } },
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
	const probe = document.createElement( 'canvas' ); probe.width = probe.height = 2;
	const webp = probe.toDataURL( 'image/webp' ).startsWith( 'data:image/webp' );
	return { renderer: r, scene, camera, quad, env, webp, bufs: new Map() };
}

const _box = new THREE.Box3(), _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _up = new THREE.Vector3( 0, 1, 0 );
const _right = new THREE.Vector3(), _camUp = new THREE.Vector3();

async function render( def, noKeep = false, key = def.id, v = null ) {
	const r = getRenderer();
	if ( contextLost( r ) ) return null;
	const S = getStage();
	const { W, H } = outSize( v );
	const B = bufsFor( S, W, H );
	const aspect = W / H;
	const model = buildItemModel( def );
	const fallback = !! model.userData.fallback;
	const prevParent = model.parent;
	S.scene.add( model );
	model.updateMatrixWorld( true );
	_box.setFromObject( model, true );
	if ( _box.isEmpty() ) _box.set( _v.set( - 0.1, 0, - 0.1 ), new THREE.Vector3( 0.1, 0.1, 0.1 ) );
	const size = _box.getSize( new THREE.Vector3() ), centre = _box.getCenter( new THREE.Vector3() );

	// view direction by shape: long things in profile, flat things from above, everything else 3/4; a model may say
	// its own (userData.iconDir [ x, y, z ]: a crutch, long and flat, reads only from above)
	const thick = Math.max( size.y, size.z, 1e-4 );
	const long = size.x > 2.2 * thick;
	const flat = size.y < 0.18 * Math.max( size.x, size.z );
	const own = model.userData.iconDir;
	if ( own ) _dir.set( own[ 0 ], own[ 1 ], own[ 2 ] );
	else if ( long ) _dir.set( 0.18, 0.42, 1 );
	else if ( flat ) _dir.set( 0.45, 1.25, 0.9 );
	else _dir.set( 0.8, 0.7, 1 );
	_dir.normalize();
	// long things (rifles, blades, rods) fill a square icon better on the diagonal; the very thin ones (a rod,
	// a pole) also get a fatter cross-section so the handle, reel or guard still reads
	const ratio = size.x / thick;
	// long guns all tilt the same way whatever their magazine or stock does to the proportions
	// (a footprint variant draws them along its long side instead: level, or upright in a tall one)
	const diagonal = ! v && ( def.firearm ? [ 'rifle', 'sniper', 'shotgun', 'lmg', 'launcher' ].includes( def.firearm.cls ) : ratio > 3.2 );
	const upright = !! v && long && aspect < 0.8;
	const fatten = ratio > 14 ? Math.min( 2.6, ratio / 14 ) : 1;
	const prevScale = model.scale.clone();
	if ( fatten > 1 ) { model.scale.set( prevScale.x, prevScale.y * fatten, prevScale.z * fatten ); model.updateMatrixWorld( true ); _box.setFromObject( model, true ); _box.getCenter( centre ); _box.getSize( size ); }
	const cam = S.camera;
	const dist = size.length() * 2 + 1;
	cam.position.copy( centre ).addScaledVector( _dir, dist );
	cam.up.copy( _up );
	cam.lookAt( centre );
	if ( diagonal ) cam.rotateZ( - Math.PI / 4 ); // the far (+x) end towards the top right
	else if ( upright ) cam.rotateZ( - Math.PI / 2 );
	cam.updateMatrixWorld( true );
	// fit what is actually drawn: every vertex projected on the view plane (the bounding box corners of a
	// diagonal rod would leave half the icon empty)
	_right.setFromMatrixColumn( cam.matrixWorld, 0 ); _camUp.setFromMatrixColumn( cam.matrixWorld, 1 );
	let minX = Infinity, maxX = - Infinity, minY = Infinity, maxY = - Infinity;
	model.traverse( ( o ) => {
		if ( ! o.isMesh || ! o.visible ) return;
		const pos = o.geometry.attributes.position;
		const step = Math.max( 1, Math.floor( pos.count / 4000 ) );
		for ( let i = 0; i < pos.count; i += step ) {
			_v.fromBufferAttribute( pos, i ).applyMatrix4( o.matrixWorld ).sub( cam.position );
			const x = _v.dot( _right ), y = _v.dot( _camUp );
			if ( x < minX ) minX = x; if ( x > maxX ) maxX = x; if ( y < minY ) minY = y; if ( y > maxY ) maxY = y;
		}
	} );
	if ( ! Number.isFinite( minX ) ) { minX = minY = - 0.1; maxX = maxY = 0.1; }
	// a frame of the icon's aspect with a margin, centred on the projected bounds
	let hh = Math.max( ( maxX - minX ) / aspect, maxY - minY ) * 0.5 * ( v ? 1.06 : 1.1 );
	const hw = hh * aspect;
	const cx = ( minX + maxX ) / 2, cy = ( minY + maxY ) / 2;
	cam.left = cx - hw; cam.right = cx + hw; cam.top = cy + hh; cam.bottom = cy - hh;
	cam.near = 0.01; cam.far = dist * 2 + size.length() * 2;
	cam.updateProjectionMatrix();

	// the world's atmosphere patch would fog the model (it sits far from the game camera): neutralise it
	const saved = { fog: UNI.uFogDensity.value, wet: UNI.uWet.value, cs: UNI.uCloudShadowK.value, cam: UNI.uCamPos.value.clone() };
	UNI.uFogDensity.value = 0; UNI.uWet.value = 0; UNI.uCloudShadowK.value = 0; UNI.uCamPos.value.copy( cam.position );
	const px = B.pool.pop() || new Uint8Array( B.RW * B.RH * 4 );
	let read = null;
	const prev = enter( r, B );
	try {
		r.setClearColor( 0x000000, 0 );
		r.clear( true, true, false );
		r.render( S.scene, cam );
		r.setRenderTarget( B.ldr );
		r.clear( true, false, false );
		S.quad.material.uniforms.tSrc.value = B.hdr.texture;
		S.quad.render( r );
		// the copy is queued now (the targets are free for the next icon); the pixels arrive a frame or so later
		read = r.readRenderTargetPixelsAsync ? r.readRenderTargetPixelsAsync( B.ldr, 0, 0, B.RW, B.RH, px ) : ( r.readRenderTargetPixels( B.ldr, 0, 0, B.RW, B.RH, px ), null );
	} finally {
		leave( r, prev );
		UNI.uFogDensity.value = saved.fog; UNI.uWet.value = saved.wet; UNI.uCloudShadowK.value = saved.cs; UNI.uCamPos.value.copy( saved.cam );
		S.scene.remove( model );
		model.scale.copy( prevScale );
		model.updateMatrixWorld( true );
		if ( prevParent ) prevParent.add( model );
	}
	try {
		if ( read ) await read;
		return finish( S, B, key, px, fallback, noKeep );
	} finally { B.pool.push( px ); }
}

// how many pixels the model covers (alpha above ~3%)
export function coverage( px ) {
	let n = 0;
	for ( let i = 3; i < px.length; i += 4 ) if ( px[ i ] > 8 ) n ++;
	return n;
}

function finish( S, B, key, px, fallback, noKeep ) {
	// a lost context reads back zeros and a failed draw leaves the target empty: show nothing, keep nothing
	if ( contextLost( S.renderer ) || coverage( px ) < B.RW * B.RH * COVER ) return null;
	// GL rows are bottom-up
	const dst = B.img.data, row = B.RW * 4, RH = B.RH;
	for ( let y = 0; y < RH; y ++ ) dst.set( px.subarray( ( RH - 1 - y ) * row, ( RH - y ) * row ), y * row );
	B.ctx.putImageData( B.img, 0, 0 );
	B.octx.clearRect( 0, 0, B.W, B.H );
	B.octx.drawImage( B.canvas, 0, 0, B.W, B.H );
	const url = S.webp ? B.out.toDataURL( 'image/webp', 0.92 ) : B.out.toDataURL( 'image/png' );
	const entry = { sig: sigFor( key ), url, fallback: fallback || noKeep };
	if ( noKeep ) return url; // textures never arrived: show it this once, try again next time
	mem.set( key, entry );
	if ( ! fallback ) persist( key, entry );
	return url;
}

