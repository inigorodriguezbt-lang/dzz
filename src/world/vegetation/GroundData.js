// Camera-centred ground data for the flora placed in the vertex shader (GrassField, PebbleField): the
// world workers compute it per 32 m grass-layer cell (scatter.js groundData) and it lands in toroidal
// textures that wrap every 512 m, so a cell's texels never move while the camera streams around:
//   tGroundH  RGBA32F, 2 m texels at the terrain's vertex lattice: height, rainfall, slope, south exposure
//             (read with texelFetch: groundAt() rebuilds the terrain mesh's own triangles)
//   tGroundG  RGBA8, 1 m texels, bilinear: R dune grass, G tall meadow grass, B sea oats, A beach creeper
//   tGroundP  RGBA8, 1 m texels, bilinear: R pebbles, G cobbles, B shell / coral grit, A stone palette
// The shaders work in coordinates relative to uGroundOrigin, a multiple of the wrap (512 m): the texel of
// a relative position is then its own (no precision loss far from the world origin).
import * as THREE from 'three';
import { GROUND } from '../scatter.js';

export const WRAP = 512; // m
const NB = WRAP / 32; // blocks per side
const HT = WRAP / 2, MT = WRAP; // texels per side (heights, masks)
const HN = GROUND.N, MN = GROUND.M, CN = GROUND.C;

// GLSL shared by the grass and pebble shaders (needs the uniforms below)
export const GROUND_GLSL = /* glsl */`
	uniform highp sampler2D tGroundH; uniform sampler2D tGroundG; uniform sampler2D tGroundP;
	// ground data at a position relative to uGroundOrigin: the terrain mesh's height (its 2 m triangles,
	// the diagonal alternating with the lattice parity, scatter.js MeshGround) and the vertex data
	// (rainfall, slope, south) interpolated the same way
	vec4 groundAt( vec2 rel ) {
		vec2 g = rel * 0.5;
		vec2 gi = floor( g );
		vec2 t = g - gi;
		ivec2 i0 = ivec2( gi ) & ivec2( ${ HT - 1 } );
		ivec2 i1 = ( ivec2( gi ) + 1 ) & ivec2( ${ HT - 1 } );
		vec4 ha = texelFetch( tGroundH, i0, 0 ), hb = texelFetch( tGroundH, ivec2( i1.x, i0.y ), 0 );
		vec4 hc = texelFetch( tGroundH, ivec2( i0.x, i1.y ), 0 ), hd = texelFetch( tGroundH, i1, 0 );
		if ( mod( gi.x + gi.y, 2.0 ) > 0.5 ) {
			if ( t.x + t.y <= 1.0 ) return ha + ( hb - ha ) * t.x + ( hc - ha ) * t.y;
			return hd + ( hc - hd ) * ( 1.0 - t.x ) + ( hb - hd ) * ( 1.0 - t.y );
		}
		if ( t.x >= t.y ) return ha + ( hb - ha ) * t.x + ( hd - hb ) * t.y;
		return ha + ( hc - ha ) * t.y + ( hd - hc ) * t.x;
	}
	vec4 groundGrass( vec2 rel ) { return textureLod( tGroundG, rel / ${ MT.toFixed( 1 ) }, 0.0 ); }
	vec4 groundPebbles( vec2 rel ) { return textureLod( tGroundP, rel / ${ MT.toFixed( 1 ) }, 0.0 ); }
`;

function dataTex( data, size, type, format, linear ) {
	const t = new THREE.DataTexture( data, size, size, format, type );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.magFilter = t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
	t.generateMipmaps = false;
	t.colorSpace = THREE.NoColorSpace;
	t.needsUpdate = true;
	return t;
}

export class GroundData {
	constructor( renderer ) {
		this.gl = renderer; // WebGLRenderer (block uploads)
		this.H = dataTex( new Float32Array( HT * HT * 4 ), HT, THREE.FloatType, THREE.RGBAFormat, false );
		this.G = dataTex( new Uint8Array( MT * MT * 4 ), MT, THREE.UnsignedByteType, THREE.RGBAFormat, true );
		this.P = dataTex( new Uint8Array( MT * MT * 4 ), MT, THREE.UnsignedByteType, THREE.RGBAFormat, true );
		this.H.name = 'vegGroundH'; this.G.name = 'vegGroundG'; this.P.name = 'vegGroundP';
		// block sources for the sub-image uploads (never drawn: copyTextureToTexture reads their image data)
		this._srcH = new THREE.DataTexture( new Float32Array( HN * HN * 4 ), HN, HN, THREE.RGBAFormat, THREE.FloatType );
		this._srcM = new THREE.DataTexture( new Uint8Array( MN * MN * 4 ), MN, MN, THREE.RGBAFormat, THREE.UnsignedByteType );
		for ( const t of [ this._srcH, this._srcM ] ) { t.flipY = false; t.unpackAlignment = 1; }
		this._pos = new THREE.Vector2();
		// per slot: the block it holds (key), its 4 m cells [ minY, maxY, grass, pebbles ]
		this.key = new Float64Array( NB * NB ).fill( NaN );
		this.cells = new Float32Array( NB * NB * CN * CN * 4 );
		this.origin = new THREE.Vector3();
		this.uniforms = { tGroundH: { value: this.H }, tGroundG: { value: this.G }, tGroundP: { value: this.P }, uGroundOrigin: { value: this.origin } };
		this.pending = [];
		this.version = 0;
	}

	static key( bi, bj ) { return ( bi + 32768 ) * 65536 + ( bj + 32768 ); }
	_slot( bi, bj ) { return ( ( bj % NB + NB ) % NB ) * NB + ( ( bi % NB + NB ) % NB ); }

	// a block's data arrived (g null: open sea, nothing grows)
	put( bi, bj, g ) {
		const s = this._slot( bi, bj );
		this.key[ s ] = GroundData.key( bi, bj );
		const c = this.cells.subarray( s * CN * CN * 4, ( s + 1 ) * CN * CN * 4 );
		if ( g ) c.set( g.cells ); else c.fill( 0 );
		this.pending.push( { bi, bj, g } );
		this.version ++;
	}

	has( bi, bj ) { return this.key[ this._slot( bi, bj ) ] === GroundData.key( bi, bj ); }

	// the block and its eight neighbours are in (the shaders filter across the block edges)
	ready( bi, bj ) {
		for ( let j = - 1; j <= 1; j ++ ) for ( let i = - 1; i <= 1; i ++ ) if ( ! this.has( bi + i, bj + j ) ) return false;
		return true;
	}

	// the 4 m cell at integer index ( ci, cj ) (world / 4): offset into this.cells, or -1 if not loaded
	cell4( ci, cj ) {
		const bi = Math.floor( ci / CN ), bj = Math.floor( cj / CN );
		const s = this._slot( bi, bj );
		if ( this.key[ s ] !== GroundData.key( bi, bj ) ) return - 1;
		return ( s * CN * CN + ( cj - bj * CN ) * CN + ( ci - bi * CN ) ) * 4;
	}

	// upload the blocks that arrived (sub-images) and follow the camera with the origin
	update( cam ) {
		this.origin.set( Math.round( cam.x / WRAP ) * WRAP, 0, Math.round( cam.z / WRAP ) * WRAP );
		if ( ! this.pending.length ) return;
		const gl = this.gl;
		// the first upload allocates the full textures
		if ( ! this._init ) {
			this._init = true;
			for ( const t of [ this.H, this.G, this.P ] ) gl.initTexture( t );
		}
		for ( const { bi, bj, g } of this.pending.splice( 0 ) ) {
			if ( ! this.has( bi, bj ) ) continue; // replaced meanwhile
			const hx = ( ( bi % NB + NB ) % NB ) * HN, hz = ( ( bj % NB + NB ) % NB ) * HN;
			this._srcH.image.data = g ? g.h : new Float32Array( HN * HN * 4 );
			gl.copyTextureToTexture( this._srcH, this.H, null, this._pos.set( hx, hz ) );
			const mx = hx * 2, mz = hz * 2;
			const zero = g ? null : new Uint8Array( MN * MN * 4 );
			this._srcM.image.data = g ? g.gm : zero;
			gl.copyTextureToTexture( this._srcM, this.G, null, this._pos.set( mx, mz ) );
			this._srcM.image.data = g ? g.pm : zero;
			gl.copyTextureToTexture( this._srcM, this.P, null, this._pos.set( mx, mz ) );
		}
	}

	dispose() {
		for ( const t of [ this.H, this.G, this.P ] ) t.dispose();
	}
}
