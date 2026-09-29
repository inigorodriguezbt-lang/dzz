// World-worker side of the terrain bakes (plain JS): per-vertex horizon AO for the terrain nodes, the
// camera-centred height grid with max mips for the hill shadow, and the land-cover grid of the ground
// bounce.
//
// vertexAO is ported from Tidewater src/world/terrain/TerrainBake.js bakeTerrainMaps (horizon AO + cavity)
// and heightGrid's max mips from buildShadowHeights (MIT, see LICENSE-Tidewater.txt).
import { FLAG } from '../HeightField.js';

// sRGB -> linear (three's SRGBToLinear)
const srgbToLinear = ( c ) => c < 0.04045 ? c * 0.0773993808 : Math.pow( c * 0.9478672986 + 0.0521327014, 2.4 );

const AO_STEPS = [ 4, 8, 13, 19, 27, 38, 52, 72, 100 ];
const AO_DIRS = 8;
const DIRS = [];
for ( let d = 0; d < AO_DIRS; d ++ ) {
	const a = ( d + 0.5 ) / AO_DIRS * Math.PI * 2;
	DIRS.push( [ Math.cos( a ), Math.sin( a ) ] );
}
const APRON = AO_STEPS[ AO_STEPS.length - 1 ] + 16;

// height of the 8 m data grid point (gi, gj) (the base height there), coarse where no fine tile exists
function gridHeight( hf, gi, gj ) {
	const v = hf.fineAt( gi, gj );
	return v === v ? v : hf.coarseBilinear( hf.x0 + gi * hf.FS, hf.z0 + gj * hf.FS );
}

// Horizon AO (8 directions, steps 4..100 m, vis = mean of cos^2 of the horizon elevation) times the cavity
// of the height Laplacian (8 m baseline, the data spacing), computed on the data grid and bilinear to the
// node's vertices; written as 0..127 into the spare byte of the normals (nor[ k * 4 + 3 ]). The grid AO
// is a function of the grid point only, so every node and LOD level agrees on it (no seams): each worker
// keeps it in 16 x 16 blocks, the coarse node that first covers an area pays for it and the finer nodes
// that follow reuse it. Nodes coarser than 16 m get 1 (the material fades the AO out before them).
const BLK = 16, BLK_MAX = 6000;
const blocks = new Map();
let _hf = null;
function aoBlock( bi, bj ) {
	const key = bi * 65536 + bj;
	let b = blocks.get( key );
	if ( ! b ) {
		b = new Float32Array( BLK * BLK ).fill( NaN );
		blocks.set( key, b );
		if ( blocks.size > BLK_MAX ) { let n = blocks.size - BLK_MAX * 0.8; for ( const k of blocks.keys() ) { blocks.delete( k ); if ( -- n <= 0 ) break; } }
	}
	return b;
}
const AO_INV = AO_STEPS.map( s => 1 / s );

export function vertexAO( hf, x0, z0, size, step, V, nor ) {
	const nV = V * V;
	if ( step > 16 ) { for ( let k = 0; k < nV; k ++ ) nor[ k * 4 + 3 ] = 127; return; }
	if ( _hf !== hf ) { _hf = hf; blocks.clear(); }
	const FS = hf.FS;
	// the grid points under the node (one extra for the bilinear), global indices
	const ci0 = Math.floor( ( x0 - hf.x0 ) / FS ), cj0 = Math.floor( ( z0 - hf.z0 ) / FS );
	const ci1 = Math.ceil( ( x0 + size - hf.x0 ) / FS ), cj1 = Math.ceil( ( z0 + size - hf.z0 ) / FS );
	const AW = ci1 - ci0 + 1, AH = cj1 - cj0 + 1;
	const ao = new Float32Array( AW * AH );
	// gather what the blocks already know
	let missing = 0;
	for ( let b = 0; b < AH; b ++ ) for ( let a = 0; a < AW; a ++ ) {
		const gi = ci0 + a, gj = cj0 + b;
		const bi = Math.floor( gi / BLK ), bj = Math.floor( gj / BLK );
		const v = aoBlock( bi, bj )[ ( gj - bj * BLK ) * BLK + gi - bi * BLK ];
		ao[ b * AW + a ] = v;
		if ( v !== v ) missing ++;
	}
	if ( missing ) {
		// heights on the data grid over the node plus the ray apron
		const R = Math.ceil( APRON / FS );
		const gi0 = ci0 - R, gj0 = cj0 - R;
		const W = AW + 2 * R, Hn = AH + 2 * R;
		const H = new Float32Array( W * Hn );
		for ( let j = 0; j < Hn; j ++ ) for ( let i = 0; i < W; i ++ ) H[ j * W + i ] = gridHeight( hf, gi0 + i, gj0 + j );
		// the rays read the nearest grid point at each step (Tidewater's Math.round sampling), as fixed index
		// offsets per direction and step
		const NS = AO_STEPS.length;
		const off = new Int32Array( AO_DIRS * NS );
		for ( let d = 0; d < AO_DIRS; d ++ ) for ( let s = 0; s < NS; s ++ ) {
			off[ d * NS + s ] = Math.round( DIRS[ d ][ 1 ] * AO_STEPS[ s ] / FS ) * W + Math.round( DIRS[ d ][ 0 ] * AO_STEPS[ s ] / FS );
		}
		for ( let b = 0; b < AH; b ++ ) for ( let a = 0; a < AW; a ++ ) {
			if ( ao[ b * AW + a ] === ao[ b * AW + a ] ) continue;
			const q = ( b + R ) * W + a + R;
			const h0 = H[ q ];
			let v = 1;
			if ( h0 >= - 25 ) {
				let vis = 0;
				for ( let d = 0; d < AO_DIRS; d ++ ) {
					let maxT = 0;
					const o = d * NS;
					for ( let s = 0; s < NS; s ++ ) {
						const t = ( H[ q + off[ o + s ] ] - h0 - 0.3 ) * AO_INV[ s ];
						if ( t > maxT ) maxT = t;
					}
					vis += 1 / ( 1 + maxT * maxT ); // cos^2 of the horizon elevation
				}
				// cavity from the Laplacian (negative = convex)
				const lap = ( H[ q - 1 ] + H[ q + 1 ] + H[ q - W ] + H[ q + W ] - 4 * h0 ) * 0.25;
				let cav = 0.5 + lap * 0.9;
				cav = cav < 0 ? 0 : cav > 1 ? 1 : cav;
				v = vis / AO_DIRS * ( 1 - Math.max( 0, cav - 0.5 ) * 0.7 );
				v = v < 0 ? 0 : v;
			}
			ao[ b * AW + a ] = v;
			const gi = ci0 + a, gj = cj0 + b;
			const bi = Math.floor( gi / BLK ), bj = Math.floor( gj / BLK );
			aoBlock( bi, bj )[ ( gj - bj * BLK ) * BLK + gi - bi * BLK ] = v;
		}
	}
	// per vertex: bilinear over the grid AO
	const bx = hf.x0 + ci0 * FS, bz = hf.z0 + cj0 * FS;
	for ( let j = 0; j < V; j ++ ) for ( let i = 0; i < V; i ++ ) {
		let fx = ( x0 + i * step - bx ) / FS, fz = ( z0 + j * step - bz ) / FS;
		fx = fx < 0 ? 0 : fx > AW - 1.001 ? AW - 1.001 : fx;
		fz = fz < 0 ? 0 : fz > AH - 1.001 ? AH - 1.001 : fz;
		const a = fx | 0, b = fz | 0, tx = fx - a, tz = fz - b, q = b * AW + a;
		const v = ( ao[ q ] * ( 1 - tx ) + ao[ q + 1 ] * tx ) * ( 1 - tz ) + ( ao[ q + AW ] * ( 1 - tx ) + ao[ q + AW + 1 ] * tx ) * tz;
		nor[ ( j * V + i ) * 4 + 3 ] = Math.round( Math.min( 1, v ) * 127 );
	}
}

// ---- half floats (DataUtils.toHalfFloat without three) ------------------------------------------------
const _f = new Float32Array( 1 ), _u = new Uint32Array( _f.buffer );
function toHalf( v ) {
	_f[ 0 ] = v;
	const x = _u[ 0 ];
	const s = ( x >>> 16 ) & 0x8000;
	const e = ( x >>> 23 ) & 0xff;
	let m = x & 0x7fffff;
	if ( e === 0xff ) return s | 0x7c00 | ( m ? 0x200 : 0 );
	const E = e - 112;
	if ( E >= 31 ) return s | 0x7bff; // clamp to the largest finite half
	if ( E <= 0 ) {
		if ( E < - 10 ) return s;
		m = ( m | 0x800000 ) >> ( 1 - E );
		return s | ( ( m + 0x1000 ) >> 13 );
	}
	return s | ( E << 10 ) | ( ( m + 0x1000 ) >> 13 );
}

// Heights on an n x n grid of texel centres x0 + ( i + 0.5 ) * step (step a multiple of the 8 m data
// spacing with the centres on data points: exact samples; else the base height). mips: the chain of
// 2 x 2 maxima (ridges keep their height when marched from afar) as half floats for a DataTexture.
export function heightGrid( hf, { x0, z0, n, step, mips = false } ) {
	const h = new Float32Array( n * n );
	const FS = hf.FS;
	const gx = ( x0 + step * 0.5 - hf.x0 ) / FS, gz = ( z0 + step * 0.5 - hf.z0 ) / FS, gs = step / FS;
	const onGrid = Math.abs( gx - Math.round( gx ) ) < 1e-6 && Math.abs( gz - Math.round( gz ) ) < 1e-6 && Math.abs( gs - Math.round( gs ) ) < 1e-6;
	let hMax = - Infinity;
	for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {
		const v = onGrid ? gridHeight( hf, Math.round( gx ) + i * Math.round( gs ), Math.round( gz ) + j * Math.round( gs ) )
			: hf.baseHeight( x0 + ( i + 0.5 ) * step, z0 + ( j + 0.5 ) * step );
		h[ j * n + i ] = v;
		if ( v > hMax ) hMax = v;
	}
	if ( ! mips ) return { result: { h, hMax }, transfer: [ h.buffer ] };
	const half = ( src ) => { const o = new Uint16Array( src.length ); for ( let i = 0; i < src.length; i ++ ) o[ i ] = toHalf( src[ i ] ); return o; };
	const levels = [ { data: half( h ), width: n, height: n } ];
	let cur = h, w = n;
	while ( w > 1 ) {
		const m = w >> 1;
		const next = new Float32Array( m * m );
		for ( let j = 0; j < m; j ++ ) for ( let i = 0; i < m; i ++ ) {
			const a = 2 * j * w + 2 * i;
			next[ j * m + i ] = Math.max( cur[ a ], cur[ a + 1 ], cur[ a + w ], cur[ a + w + 1 ] );
		}
		levels.push( { data: half( next ), width: m, height: m } );
		cur = next;
		w = m;
	}
	return { result: { levels, hMax }, transfer: levels.map( l => l.data.buffer ) };
}

// ---- ground bounce land cover (Tidewater src/materials/GroundBounce.js bake, the part that does not
// depend on the sun): RGBA32F ( albedo of what the ground reflects, ground height ) on an n x n grid
const lin = ( r, g, b ) => [ srgbToLinear( r ), srgbToLinear( g ), srgbToLinear( b ) ];
const MEADOW = lin( 0.3, 0.36, 0.16 ), JUNGLE = lin( 0.12, 0.17, 0.07 ), SAND = lin( 0.86, 0.79, 0.66 );
const SEABED = lin( 0.62, 0.58, 0.48 ), ROCK = [ 0.08, 0.075, 0.065 ], LAVA = [ 0.03, 0.029, 0.028 ];
const TOWN = lin( 0.45, 0.44, 0.42 ), CINDER = lin( 0.32, 0.22, 0.17 );
// water absorption + scattering per metre (Tidewater Frame.js defaults)
const WATER_K = [ 0.42 + 0.012, 0.075 + 0.018, 0.035 + 0.024 ];
const BEACH_V = 1.8; // = Terrain.js BEACH_V
const sstep = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };

export function bounceGrid( hf, { x0, z0, n, step } ) {
	const H = heightGrid( hf, { x0, z0, n, step } ).result.h;
	// distance to the sea within the grid (two-pass chamfer), for the beaches
	const D = new Float32Array( n * n );
	for ( let k = 0; k < n * n; k ++ ) D[ k ] = H[ k ] < 0 ? 0 : 1e9;
	const d1 = step, d2 = step * Math.SQRT2;
	for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {
		const k = j * n + i;
		let v = D[ k ];
		if ( i > 0 ) v = Math.min( v, D[ k - 1 ] + d1 );
		if ( j > 0 ) { v = Math.min( v, D[ k - n ] + d1 ); if ( i > 0 ) v = Math.min( v, D[ k - n - 1 ] + d2 ); if ( i < n - 1 ) v = Math.min( v, D[ k - n + 1 ] + d2 ); }
		D[ k ] = v;
	}
	for ( let j = n - 1; j >= 0; j -- ) for ( let i = n - 1; i >= 0; i -- ) {
		const k = j * n + i;
		let v = D[ k ];
		if ( i < n - 1 ) v = Math.min( v, D[ k + 1 ] + d1 );
		if ( j < n - 1 ) { v = Math.min( v, D[ k + n ] + d1 ); if ( i < n - 1 ) v = Math.min( v, D[ k + n + 1 ] + d2 ); if ( i > 0 ) v = Math.min( v, D[ k + n - 1 ] + d2 ); }
		D[ k ] = v;
	}
	const out = new Float32Array( n * n * 4 );
	const s4 = [ 0, 0, 0, 0 ];
	const land = [ 0, 0, 0 ];
	for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {
		const k = j * n + i;
		const x = x0 + ( i + 0.5 ) * step, z = z0 + ( j + 0.5 ) * step;
		const h = H[ k ];
		const hx = ( H[ j * n + Math.min( n - 1, i + 1 ) ] - H[ j * n + Math.max( 0, i - 1 ) ] ) / ( 2 * step );
		const hz = ( H[ Math.min( n - 1, j + 1 ) * n + i ] - H[ Math.max( 0, j - 1 ) * n + i ] ) / ( 2 * step );
		const slope = 1 - 1 / Math.sqrt( 1 + hx * hx + hz * hz );
		hf.surfaceAt( x, z, s4 );
		const wetM = Math.min( 1, s4[ 0 ] * 1.15 + 0.14 );
		const shore = h < 0.2 ? 1 : h > 9 ? 0 : D[ k ] < 52 ? 1 - D[ k ] / 52 : 0;
		const city = hf.flagAt( x, z, FLAG.CITY | FLAG.BUILDING | FLAG.STREET );
		const lava = sstep( 0.35, 0.6, s4[ 1 ] );
		const field = ( hf.flagsNear( x, z ) & FLAG.FIELD ) ? 1 : 0;
		// the same land cover as the terrain material, coarsely (no noise)
		const rockMask = shore * sstep( 0.12, 0.3, slope );
		const rockW = sstep( 0.35, 0.6, rockMask * 0.7 + sstep( 0.3, 0.62, slope ) * 0.5 );
		const spSand = ( 1 - sstep( 1.9, 2.8, h ) ) * sstep( 0.15, 0.6, shore ) * ( 1 - sstep( 0.2, 0.42, slope ) ) * ( 1 - city ) * ( 1 - lava * 0.7 );
		const sandW = sstep( 0.3, 0.72, spSand ) * ( 1 - rockW );
		const treeAlt = ( 1 - sstep( 290, 400, h ) * 0.75 ) * ( 1 - sstep( 450, 525, h ) );
		const jungleW = Math.min( 1, sstep( 0.52, 0.8, wetM ) + sstep( 0.18, 0.36, slope ) * sstep( 0.3, 0.55, wetM ) ) * treeAlt
			* sstep( 1.5, 5, h ) * ( 1 - ( s4[ 3 ] === 3 ? 0.85 : 0 ) ) * ( 1 - field ) * ( 1 - city ) * ( 1 - lava );
		const damp = 0.6 + 0.4 * sstep( 0.2, 1.2, h * BEACH_V );
		const alpine = sstep( 430, 530, h );
		for ( let c = 0; c < 3; c ++ ) {
			let v = MEADOW[ c ] + ( JUNGLE[ c ] - MEADOW[ c ] ) * jungleW;
			v += ( SAND[ c ] * damp - v ) * sandW;
			v += ( ROCK[ c ] - v ) * rockW;
			v += ( LAVA[ c ] - v ) * lava;
			v += ( CINDER[ c ] - v ) * alpine;
			v += ( TOWN[ c ] - v ) * city * 0.8;
			land[ c ] = v;
		}
		// sea: the seabed seen through the water column, down and back up
		const depth = Math.max( - h, 0 ) * BEACH_V;
		const wet = sstep( 0.05, - 0.1, h );
		const SEA_ADD = [ 0.01, 0.025, 0.03 ];
		for ( let c = 0; c < 3; c ++ ) {
			const sea = SEABED[ c ] * Math.exp( - WATER_K[ c ] * depth * 2.4 ) * 0.9 + SEA_ADD[ c ];
			out[ k * 4 + c ] = land[ c ] + ( sea - land[ c ] ) * wet;
		}
		out[ k * 4 + 3 ] = h;
	}
	return { result: { data: out }, transfer: [ out.buffer ] };
}
