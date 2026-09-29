// Ported from Tidewater src/world/terrain/DetailTextures.js (MIT, see LICENSE-Tidewater.txt).
//
// The shared 512^2 detail texture (R rock, G soil, B sand / pebbles, A fbm; see detailData.js),
// mipmapped, repeat wrapping, anisotropy 4. getDetailTexture() returns the one DataTexture at once;
// its texels arrive from a world worker ('detailTexture' job, started by the terrain) or, on pages
// without the terrain, are built on the main thread a moment later. The CPU copy stays in
// texture.image.data (RGBA8) for placement code (sampleDetail in detailData.js).
import * as THREE from 'three';
import { DETAIL_SIZE, buildDetailData } from './detailData.js';

let tex = null;
let started = false;
const waiters = [];

function fill( data ) {
	tex.image.data.set( data );
	tex.needsUpdate = true;
	tex.userData.ready = true;
	for ( const w of waiters.splice( 0 ) ) w( tex );
}

export function getDetailTexture() {
	if ( tex ) return tex;
	const S = DETAIL_SIZE;
	// neutral until the texels arrive (every field at its mean)
	const data = new Uint8Array( S * S * 4 ).fill( 118 );
	tex = new THREE.DataTexture( data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType );
	tex.name = 'terrainDetail';
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.magFilter = THREE.LinearFilter;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 4;
	tex.colorSpace = THREE.NoColorSpace;
	tex.userData.ready = false;
	tex.needsUpdate = true;
	// nobody asked a worker for it: build it here
	setTimeout( () => { if ( ! started ) { started = true; fill( buildDetailData() ); } }, 0 );
	return tex;
}

// build the texels in a world worker (pool: WorkerPool). Resolves with the texture once filled.
export function loadDetailTexture( pool ) {
	const t = getDetailTexture();
	if ( t.userData.ready ) return Promise.resolve( t );
	const p = new Promise( ( r ) => waiters.push( r ) );
	if ( ! started ) {
		started = true;
		pool.run( { type: 'detailTexture' }, - 1e9 ).then( ( r ) => fill( r.data ) ).catch( () => fill( buildDetailData() ) );
	}
	return p;
}

// resolves once the texels are in (for code that samples texture.image.data on the CPU)
export function detailTextureReady() {
	const t = getDetailTexture();
	return t.userData.ready ? Promise.resolve( t ) : new Promise( ( r ) => waiters.push( r ) );
}
