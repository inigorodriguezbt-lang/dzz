// Builds (once per type) and caches the vehicle geometries:
//   near     body + interior (one draw call), glass (layer 1), wheel, steering wheel, moving parts
//   far      body + dark glass + light wheels merged (one draw call for distant vehicles)
// A type takes 0.05-2.5 s to build (the shells are probed with hundreds of rays), far too long for a frame,
// so loadModel() builds it in a dedicated worker (models/worker.js) and ships the geometry back as typed
// arrays. getModel() builds synchronously: the fallback when there is no worker (Node tests, the preview).
import * as THREE from 'three';
import { CARS } from './cars.js';
import { CRAFT } from './craft.js';
import { MOTO } from './moto.js';

const cache = new Map();
const pending = new Map(); // name -> { promise, resolve, reject, priority }

export function modelNames() { return [ ...Object.keys( CARS ), ...Object.keys( CRAFT ), ...Object.keys( MOTO ) ]; }

export function buildModel( name ) {
	const make = CARS[ name ] || CRAFT[ name ] || MOTO[ name ];
	if ( ! make ) throw new Error( 'unknown vehicle model ' + name );
	const def = make();
	const m = def.build( def );
	m.name = name;
	return m;
}

export function hasModel( name ) { return cache.has( name ); }

export function getModel( name ) {
	let m = cache.get( name );
	if ( m ) return m;
	m = buildModel( name );
	cache.set( name, m );
	const p = pending.get( name );
	if ( p ) { pending.delete( name ); p.resolve( m ); }
	return m;
}

// ---- the worker --------------------------------------------------------------------------------------------------

let worker = null, workerFailed = false, busy = null;

function startWorker() {
	if ( worker || workerFailed ) return worker;
	try {
		if ( typeof Worker === 'undefined' ) throw new Error( 'no workers' );
		worker = new Worker( new URL( './worker.js', import.meta.url ), { type: 'module' } );
		worker.onmessage = ( e ) => {
			const { name, data, error } = e.data;
			busy = null;
			const p = pending.get( name );
			if ( error ) { console.warn( 'vehicle model worker:', error ); if ( ! cache.has( name ) ) { try { getModel( name ); } catch ( err ) { p?.reject( err ); pending.delete( name ); } } }
			else if ( ! cache.has( name ) ) {
				const m = unpackModel( data );
				cache.set( name, m );
				if ( p ) { pending.delete( name ); p.resolve( m ); }
			}
			pump();
		};
		worker.onerror = ( e ) => {
			// a module worker that can't load: build here instead (one type per frame, see pump)
			console.warn( 'vehicle model worker failed, building on the main thread', e.message || e );
			workerFailed = true; worker = null; busy = null;
			pump();
		};
	} catch ( e ) { workerFailed = true; worker = null; }
	return worker;
}

function pump() {
	if ( busy ) return;
	let best = null;
	for ( const [ name, p ] of pending ) if ( ! cache.has( name ) && ( ! best || p.priority < best[ 1 ].priority ) ) best = [ name, p ];
	if ( ! best ) return;
	const [ name ] = best;
	if ( startWorker() ) {
		busy = name;
		worker.postMessage( { name } );
	} else {
		// no worker: one build per task so a frame can be drawn in between
		busy = name;
		setTimeout( () => { busy = null; try { getModel( name ); } catch ( e ) { const p = pending.get( name ); pending.delete( name ); p?.reject( e ); } pump(); }, 0 );
	}
}

// the model, built in the background; lower priority numbers first
export function loadModel( name, priority = 1 ) {
	const m = cache.get( name );
	if ( m ) return Promise.resolve( m );
	let p = pending.get( name );
	if ( p ) { p.priority = Math.min( p.priority, priority ); return p.promise; }
	p = { priority };
	p.promise = new Promise( ( resolve, reject ) => { p.resolve = resolve; p.reject = reject; } );
	pending.set( name, p );
	pump();
	return p.promise;
}

export function stopModelWorker() {
	if ( worker ) worker.terminate();
	worker = null; busy = null;
}

// ---- transfer: geometries as typed arrays, the parameters without their functions -----------------------------------

function packGeo( g, transfer ) {
	if ( ! g ) return null;
	const attrs = {};
	for ( const k in g.attributes ) {
		const a = g.attributes[ k ];
		attrs[ k ] = { array: a.array, itemSize: a.itemSize, normalized: a.normalized };
		transfer.add( a.array.buffer );
	}
	const index = g.index ? g.index.array : null;
	if ( index ) transfer.add( index.buffer );
	return { attrs, index };
}

function unpackGeo( o ) {
	if ( ! o ) return null;
	const g = new THREE.BufferGeometry();
	for ( const k in o.attrs ) { const a = o.attrs[ k ]; g.setAttribute( k, new THREE.BufferAttribute( a.array, a.itemSize, a.normalized ) ); }
	if ( o.index ) g.setIndex( new THREE.BufferAttribute( o.index, 1 ) );
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;
}

// plain data only (the model parameters carry build / extra / livery functions)
function plain( o ) {
	if ( typeof o === 'function' ) return undefined;
	if ( Array.isArray( o ) ) return o.map( plain );
	if ( o && typeof o === 'object' ) {
		if ( o.isVector3 ) return [ o.x, o.y, o.z ];
		const out = {};
		for ( const k in o ) { const v = plain( o[ k ] ); if ( v !== undefined ) out[ k ] = v; }
		return out;
	}
	return o;
}

export function packModel( m ) {
	const transfer = new Set();
	const data = {
		name: m.name, P: plain( m.P ), meta: plain( m.meta ),
		near: packGeo( m.near, transfer ), far: packGeo( m.far, transfer ), glass: packGeo( m.glass, transfer ),
		wheelGeo: packGeo( m.wheelGeo, transfer ), steering: packGeo( m.steering, transfer ),
		wheels: plain( m.wheels ), bounds: [ m.bounds.min.toArray(), m.bounds.max.toArray() ],
		parts: ( m.parts || [] ).map( p => ( { ...plain( { ...p, geo: null, disc: null } ), geo: packGeo( p.geo, transfer ), disc: packGeo( p.disc, transfer ) } ) ),
	};
	return { data, transfer: [ ...transfer ] };
}

export function unpackModel( d ) {
	return {
		name: d.name, P: d.P, meta: d.meta,
		near: unpackGeo( d.near ), far: unpackGeo( d.far ), glass: unpackGeo( d.glass ),
		wheelGeo: unpackGeo( d.wheelGeo ), steering: unpackGeo( d.steering ), wheels: d.wheels,
		bounds: new THREE.Box3( new THREE.Vector3( ...d.bounds[ 0 ] ), new THREE.Vector3( ...d.bounds[ 1 ] ) ),
		parts: d.parts.map( p => ( { ...p, geo: unpackGeo( p.geo ), disc: unpackGeo( p.disc ) || undefined } ) ),
	};
}
