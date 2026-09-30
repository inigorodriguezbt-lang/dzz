// The fine ground under the sea around the camera: a 2 km tile of heights at the terrain mesh's 2 m
// spacing (float32, read with exact loads), built by the water's own worker and re-centred as the camera
// moves. Outside it (and until the first tile arrives) the coarse 32 m bathymetry is used; the two blend
// over the tile's outer 6 %. The same lookup runs on the CPU (groundAt) and in GLSL (GROUND_GLSL).
import * as THREE from 'three';

export const TILE_N = 1024, TILE_STEP = 2;
const RECENTRE = 384; // m from the tile centre before a new one is requested
const EDGE = 0.06; // blend band (fraction of the tile)

// fragment: without the coarse bathymetry sampler (the ocean fragment shader is at the sampler limit): off the
// tile it takes the depth interpolated from the vertices (vSeaDepth), only ever used far from the camera
export const groundGLSL = ( fragment ) => /* glsl */`
	uniform highp sampler2D uLocalH; uniform vec4 uLocalRect; uniform float uLocalOn;
	${ fragment ? '' : 'uniform sampler2D uBathy; uniform vec4 uBathyRect;' }
	float waterLocalWeight( vec2 xz, out vec2 f ) {
		float res = uLocalRect.w;
		f = ( xz - uLocalRect.xy ) / uLocalRect.z * res - 0.5;
		vec2 e = min( f, res - 1.0 - f );
		return uLocalOn * smoothstep( 0.0, res * ${ EDGE.toFixed( 3 ) }, min( e.x, e.y ) );
	}
	float waterLocalHeight( vec2 f ) {
		float res = uLocalRect.w;
		vec2 fc = clamp( f, vec2( 0.0 ), vec2( res - 1.001 ) );
		ivec2 i = ivec2( floor( fc ) );
		vec2 t = fract( fc );
		float a = texelFetch( uLocalH, i, 0 ).r;
		float b = texelFetch( uLocalH, i + ivec2( 1, 0 ), 0 ).r;
		float c = texelFetch( uLocalH, i + ivec2( 0, 1 ), 0 ).r;
		float d = texelFetch( uLocalH, i + ivec2( 1, 1 ), 0 ).r;
		return mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
	}
	// ground height under the sea at xz (m)
	float waterGroundAt( vec2 xz ) {
		float coarse = ${ fragment ? 'uWaterLevel - vSeaDepth' : 'textureLod( uBathy, ( xz - uBathyRect.xy ) / uBathyRect.zw, 0.0 ).r' };
		vec2 f;
		float w = waterLocalWeight( xz, f );
		return w > 0.0 ? mix( coarse, waterLocalHeight( f ), w ) : coarse;
	}
	// whether xz lies on the fine tile
	bool waterOnTile( vec2 xz ) { vec2 f; return waterLocalWeight( xz, f ) > 0.999; }
	// the xz of the ground normal ( -dh/dx, -dh/dz ) / len: the gradient of the bilinear patch on the tile (one
	// lookup of 4 texels), a central difference of the coarse heights off it
	vec2 waterGroundSlope( vec2 xz ) {
		vec2 f;
		float w = waterLocalWeight( xz, f );
		vec2 g;
		if ( w > 0.0 ) {
			float res = uLocalRect.w, stp = uLocalRect.z / res;
			vec2 fc = clamp( f, vec2( 0.0 ), vec2( res - 1.001 ) );
			ivec2 i = ivec2( floor( fc ) );
			vec2 t = fract( fc );
			float a = texelFetch( uLocalH, i, 0 ).r;
			float b = texelFetch( uLocalH, i + ivec2( 1, 0 ), 0 ).r;
			float c = texelFetch( uLocalH, i + ivec2( 0, 1 ), 0 ).r;
			float d = texelFetch( uLocalH, i + ivec2( 1, 1 ), 0 ).r;
			g = vec2( mix( b - a, d - c, t.y ), mix( c - a, d - b, t.x ) ) / stp;
		} else {
			float e = 16.0;
			g = vec2( waterGroundAt( xz + vec2( e, 0.0 ) ) - waterGroundAt( xz - vec2( e, 0.0 ) ), waterGroundAt( xz + vec2( 0.0, e ) ) - waterGroundAt( xz - vec2( 0.0, e ) ) ) / ( 2.0 * e );
		}
		vec3 n = normalize( vec3( - g.x, 1.0, - g.y ) );
		return n.xz;
	}
`;
export const GROUND_GLSL = groundGLSL( false );

export class LocalTile {
	constructor( hf ) {
		this.hf = hf;
		this.worker = null;
		this.pending = null;
		this.tile = null; // { x0, z0, n, step, h }
		this.texture = new THREE.DataTexture( new Float32Array( 1 ), 1, 1, THREE.RedFormat, THREE.FloatType );
		this.texture.needsUpdate = true;
		this.rect = new THREE.Vector4( 0, 0, 1, 1 );
		this.on = 0;
		this._id = 1;
		this._cb = new Map();
		this.listeners = [];
		if ( typeof Worker !== 'undefined' && hf.buffer ) {
			try {
				this.worker = new Worker( new URL( './shore.worker.js', import.meta.url ), { type: 'module' } );
				this.worker.onmessage = ( e ) => { const cb = this._cb.get( e.data.id ); this._cb.delete( e.data.id ); if ( cb ) cb( e.data ); };
				this.worker.onerror = ( e ) => console.warn( 'shore worker error', e.message || e );
				const buf = hf.buffer.slice( 0 );
				this._call( { type: 'init', meta: { halfX: hf.halfX, halfZ: hf.halfZ }, buffer: buf }, [ buf ] );
			} catch ( e ) { console.warn( 'shore worker unavailable', e ); this.worker = null; }
		}
	}

	// the surf lace (0.7 s of work, off the main thread): resolves to { size, data } or null
	lace( size = 512 ) {
		if ( ! this.worker ) return Promise.resolve( null );
		return this._call( { type: 'lace', size } ).then( ( r ) => r.result || null );
	}

	_call( msg, transfer = [] ) {
		return new Promise( ( resolve ) => {
			const id = this._id ++;
			this._cb.set( id, resolve );
			this.worker.postMessage( { ...msg, id }, transfer );
		} );
	}

	// re-centre on the camera when it has moved far enough
	update( cam ) {
		if ( ! this.worker || this.pending ) return;
		const t = this.tile;
		if ( t ) {
			const cx = t.x0 + t.n * t.step / 2, cz = t.z0 + t.n * t.step / 2;
			if ( Math.abs( cam.x - cx ) < RECENTRE && Math.abs( cam.z - cz ) < RECENTRE ) return;
		}
		const size = TILE_N * TILE_STEP;
		// centre on a 128 m lattice; texel centres on the terrain's even-metre vertex lattice
		const cx = Math.round( cam.x / 128 ) * 128, cz = Math.round( cam.z / 128 ) * 128;
		const x0 = cx - size / 2 - TILE_STEP / 2, z0 = cz - size / 2 - TILE_STEP / 2;
		this.pending = this._call( { type: 'tile', x0, z0, n: TILE_N, step: TILE_STEP, fieldRes: 512 } ).then( ( r ) => {
			this.pending = null;
			if ( r.error || ! r.result ) { console.warn( 'shore tile failed', r.error ); return; }
			this._apply( r.result );
		} );
	}

	_apply( t ) {
		this.tile = t;
		const tex = this.texture;
		if ( tex.image.width !== t.n ) {
			tex.dispose();
			this.texture = new THREE.DataTexture( t.h, t.n, t.n, THREE.RedFormat, THREE.FloatType );
			this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
			this.texture.generateMipmaps = false;
		} else tex.image.data = t.h;
		this.texture.needsUpdate = true;
		this.rect.set( t.x0, t.z0, t.n * t.step, t.n );
		this.on = 1;
		for ( const fn of this.listeners ) fn( t );
	}

	// the same lookup as GLSL waterGroundAt (coarse bathymetry blended into the fine tile)
	groundAt( x, z ) {
		const coarse = this.hf.coarseBilinear( x, z );
		const t = this.tile;
		if ( ! t ) return coarse;
		const res = t.n;
		const fx = ( x - t.x0 ) / ( t.n * t.step ) * res - 0.5, fz = ( z - t.z0 ) / ( t.n * t.step ) * res - 0.5;
		const e = Math.min( fx, res - 1 - fx, fz, res - 1 - fz );
		const k = Math.min( 1, Math.max( 0, e / ( res * EDGE ) ) );
		const w = k * k * ( 3 - 2 * k );
		if ( w <= 0 ) return coarse;
		const cx = Math.min( Math.max( fx, 0 ), res - 1.001 ), cz = Math.min( Math.max( fz, 0 ), res - 1.001 );
		const i = Math.floor( cx ), j = Math.floor( cz ), tx = cx - i, tz = cz - j, h = t.h;
		const a = h[ j * res + i ] * ( 1 - tx ) + h[ j * res + i + 1 ] * tx;
		const b = h[ ( j + 1 ) * res + i ] * ( 1 - tx ) + h[ ( j + 1 ) * res + i + 1 ] * tx;
		const fine = a * ( 1 - tz ) + b * tz;
		return coarse + ( fine - coarse ) * w;
	}

	dispose() { if ( this.worker ) this.worker.terminate(); this.worker = null; this.texture.dispose(); }
}
