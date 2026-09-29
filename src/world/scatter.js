// Vegetation placement (runs in the world workers). Deterministic per cell: every candidate point
// lives on a global jittered lattice and all its random numbers come from hashes of its lattice
// index, so a cell always scatters the same plants and neighbouring cells agree along their seams.
//
// Job: { type: 'scatter', layer: 0 canopy | 1 detail | 2 grass, i, j (cell index on the layer grid),
//        bld: Float32Array [ cx, cz, halfW, halfD, angle, top ] building footprints near the cell,
//        seg: Float32Array [ ax, az, bx, bz, halfWidth, kind ] roads / streets near the cell (kind 0 road,
//             1 metro, 2 town, 3 village, 4 resort, 5 military / airport; halfWidth includes the sidewalk),
//        cty: Float32Array [ x, z, radius, urban ] town discs near the cell (see citiesNear) }
// Result: { data: Float32Array (instances, STRIDE floats, grouped by species), off: Int32Array (NSP + 1
//           instance offsets), transfer }
import { FLAG, hash2, vnoise } from './HeightField.js';
import { SP, NSP, STRIDE, LAYER_CELL } from './vegetation/species.js';

const TAU = Math.PI * 2;
const NO_GROW = FLAG.ROAD | FLAG.STREET | FLAG.RUNWAY | FLAG.BUILDING | FLAG.DIRT;
const PAVED = FLAG.ROAD | FLAG.STREET | FLAG.RUNWAY;

// how built-up each kind of settlement is inside its radius (1: lawns, yard and street trees only)
const URBAN = { metro: 1, town: 1, resort: 1, airport: 1, observatory: 1, military: 0.85, village: 0.75 };

// town discs touching a square cell, packed for the scatter job (main thread and tests)
export function citiesNear( cities, x0, z0, size ) {
	const out = [];
	for ( const c of cities || [] ) {
		const R = ( c.radius || 300 ) * 1.15, u = URBAN[ c.kind ] ?? 0.8;
		const dx = Math.max( x0 - c.x, 0, c.x - x0 - size ), dz = Math.max( z0 - c.z, 0, c.z - z0 - size );
		if ( dx * dx + dz * dz < R * R ) out.push( c.x, c.z, c.radius || 300, u );
	}
	return out.length ? new Float32Array( out ) : null;
}

const sstep = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };
// 1 inside [b, c], fading out below a and above d
const band = ( v, a, b, c, d ) => sstep( a, b, v ) * ( 1 - sstep( c, d, v ) );

// ---- per-cell environment: 8 m samples of height, slope and distance to the sea ---------------------

const ENV_STEP = 8;
const ENV_MARGIN = 96; // how far out the sea search looks (m)
const SEA_CAP = 110;

class Env {
	constructor( hf, x0, z0, size, cty ) {
		this.hf = hf;
		this.cty = cty;
		this.x0 = x0; this.z0 = z0;
		const n = size / ENV_STEP + 1;
		this.n = n;
		const M = ENV_MARGIN / ENV_STEP;
		const W = n + 2 * M;
		const hb = new Float32Array( W * W );
		const sea = [];
		for ( let j = 0; j < W; j ++ ) for ( let i = 0; i < W; i ++ ) {
			const x = x0 + ( i - M ) * ENV_STEP, z = z0 + ( j - M ) * ENV_STEP;
			const h = hf.baseHeight( x, z );
			hb[ j * W + i ] = h;
			if ( h < - 0.25 ) sea.push( i - M, j - M );
		}
		this.h = new Float32Array( n * n );
		this.sd = new Float32Array( n * n ); // distance to the sea (m, capped)
		this.gx = new Float32Array( n * n ); // unit direction towards the sea
		this.gz = new Float32Array( n * n );
		this.sl = new Float32Array( n * n ); // slope (rise / run)
		for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {
			const k = j * n + i, c = ( j + M ) * W + i + M;
			this.h[ k ] = hb[ c ];
			const dx = ( hb[ c + 1 ] - hb[ c - 1 ] ) / ( 2 * ENV_STEP ), dz = ( hb[ c + W ] - hb[ c - W ] ) / ( 2 * ENV_STEP );
			this.sl[ k ] = Math.hypot( dx, dz );
			let best = Infinity, bi = 0, bj = 0;
			for ( let s = 0; s < sea.length; s += 2 ) {
				const a = sea[ s ] - i, b = sea[ s + 1 ] - j;
				const d = a * a + b * b;
				if ( d < best ) { best = d; bi = a; bj = b; }
			}
			if ( best === Infinity ) { this.sd[ k ] = SEA_CAP; this.gx[ k ] = 0; this.gz[ k ] = 0; } else {
				const d = Math.sqrt( best );
				this.sd[ k ] = Math.min( SEA_CAP, d * ENV_STEP );
				this.gx[ k ] = d > 0 ? bi / d : 0; this.gz[ k ] = d > 0 ? bj / d : 0;
			}
		}
		this.s4 = [ 0, 0, 0, 0 ];
	}

	// bilinear lookups
	_w( x, z ) {
		const n = this.n;
		let fx = ( x - this.x0 ) / ENV_STEP, fz = ( z - this.z0 ) / ENV_STEP;
		fx = Math.max( 0, Math.min( n - 1.001, fx ) ); fz = Math.max( 0, Math.min( n - 1.001, fz ) );
		const i = Math.floor( fx ), j = Math.floor( fz );
		this._k = j * n + i; this._tx = fx - i; this._tz = fz - j;
	}
	_lerp( a ) {
		const k = this._k, n = this.n, tx = this._tx, tz = this._tz;
		return ( a[ k ] * ( 1 - tx ) + a[ k + 1 ] * tx ) * ( 1 - tz ) + ( a[ k + n ] * ( 1 - tx ) + a[ k + n + 1 ] * tx ) * tz;
	}
	// 0 wild .. 1 built-up: the CITY flag, or inside a town's radius (the flag only marks the blocks
	// the street grid encloses, the parcels, parks and beach fronts between them read as wild land)
	urban( x, z, flags ) {
		if ( flags & FLAG.CITY ) return 1;
		const c = this.cty;
		let u = 0;
		if ( c ) for ( let k = 0; k < c.length; k += 4 ) {
			const dx = x - c[ k ], dz = z - c[ k + 1 ], R = c[ k + 2 ];
			const d2 = dx * dx + dz * dz;
			if ( d2 > R * R * 1.3225 ) continue;
			u = Math.max( u, c[ k + 3 ] * ( 1 - sstep( R * 0.8, R * 1.15, Math.sqrt( d2 ) ) ) );
		}
		return u;
	}
	// fills e: h (base, m), sd, sl, seaX, seaZ, moist, lava, red, use, flags, u (urban)
	at( x, z, e ) {
		this._w( x, z );
		e.h = this._lerp( this.h );
		e.sd = this._lerp( this.sd );
		e.sl = this._lerp( this.sl );
		e.seaX = this._lerp( this.gx ); e.seaZ = this._lerp( this.gz );
		const s = this.hf.surfaceAt( x, z, this.s4 );
		e.m = s[ 0 ]; e.lava = s[ 1 ]; e.red = s[ 2 ]; e.use = s[ 3 ];
		e.flags = this.hf.flagsNear( x, z );
		e.u = this.urban( x, z, e.flags );
		return e;
	}
}

// ---- obstacles passed by the main thread (building footprints, road / street centre lines) ------------

function nearBuilding( bld, x, z, clear ) {
	if ( ! bld ) return false;
	for ( let k = 0; k < bld.length; k += 6 ) {
		const dx = x - bld[ k ], dz = z - bld[ k + 1 ];
		const c = Math.cos( bld[ k + 4 ] ), s = Math.sin( bld[ k + 4 ] );
		const u = dx * c + dz * s, v = - dx * s + dz * c;
		if ( Math.abs( u ) < bld[ k + 2 ] + clear && Math.abs( v ) < bld[ k + 3 ] + clear ) return true;
	}
	return false;
}

function nearRoad( seg, x, z, clear ) {
	if ( ! seg ) return false;
	for ( let k = 0; k < seg.length; k += 6 ) {
		const ax = seg[ k ], az = seg[ k + 1 ], bx = seg[ k + 2 ], bz = seg[ k + 3 ];
		const ex = bx - ax, ez = bz - az;
		const L2 = ex * ex + ez * ez;
		let t = L2 > 0 ? ( ( x - ax ) * ex + ( z - az ) * ez ) / L2 : 0;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const dx = x - ( ax + ex * t ), dz = z - ( az + ez * t );
		const r = seg[ k + 4 ] + clear;
		if ( dx * dx + dz * dz < r * r ) return true;
	}
	return false;
}

// the road / street segments near each 8 m square of a cell (many dense lattices test every point)
class SegGrid {
	constructor( seg, x0, z0, size, clear ) {
		this.seg = seg; this.x0 = x0; this.z0 = z0; this.n = Math.ceil( size / 8 );
		this.cells = Array.from( { length: this.n * this.n }, () => [] );
		if ( ! seg ) return;
		for ( let k = 0; k < seg.length; k += 6 ) {
			const r = seg[ k + 4 ] + clear + 1;
			const i0 = Math.max( 0, Math.floor( ( Math.min( seg[ k ], seg[ k + 2 ] ) - r - x0 ) / 8 ) ), i1 = Math.min( this.n - 1, Math.floor( ( Math.max( seg[ k ], seg[ k + 2 ] ) + r - x0 ) / 8 ) );
			const j0 = Math.max( 0, Math.floor( ( Math.min( seg[ k + 1 ], seg[ k + 3 ] ) - r - z0 ) / 8 ) ), j1 = Math.min( this.n - 1, Math.floor( ( Math.max( seg[ k + 1 ], seg[ k + 3 ] ) + r - z0 ) / 8 ) );
			for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) this.cells[ j * this.n + i ].push( k );
		}
	}
	near( x, z, clear ) {
		const i = Math.floor( ( x - this.x0 ) / 8 ), j = Math.floor( ( z - this.z0 ) / 8 );
		if ( i < 0 || j < 0 || i >= this.n || j >= this.n ) return nearRoad( this.seg, x, z, clear );
		const seg = this.seg;
		for ( const k of this.cells[ j * this.n + i ] ) {
			const ax = seg[ k ], az = seg[ k + 1 ], ex = seg[ k + 2 ] - ax, ez = seg[ k + 3 ] - az;
			const L2 = ex * ex + ez * ez;
			let t = L2 > 0 ? ( ( x - ax ) * ex + ( z - az ) * ez ) / L2 : 0;
			t = t < 0 ? 0 : t > 1 ? 1 : t;
			const dx = x - ( ax + ex * t ), dz = z - ( az + ez * t );
			const r = seg[ k + 4 ] + clear;
			if ( dx * dx + dz * dz < r * r ) return true;
		}
		return false;
	}
}

// ---- output accumulation ---------------------------------------------------------------------------------

class Out {
	constructor() { this.lists = Array.from( { length: NSP }, () => [] ); }
	add( sp, x, y, z, s, yaw, rank, a, b ) { this.lists[ sp ].push( x, y, z, s, yaw, rank, a, b ); }
	finish() {
		const off = new Int32Array( NSP + 1 );
		let n = 0;
		for ( let s = 0; s < NSP; s ++ ) { off[ s ] = n; n += this.lists[ s ].length / STRIDE; }
		off[ NSP ] = n;
		const data = new Float32Array( n * STRIDE );
		for ( let s = 0; s < NSP; s ++ ) data.set( this.lists[ s ], off[ s ] * STRIDE );
		return { data, off, transfer: [ data.buffer, off.buffer ] };
	}
}

// ground height as the terrain mesh draws it (2 m grid, same triangle split as the terrain nodes) so
// small plants sit exactly on the rendered surface
class MeshGround {
	constructor( hf, x0, z0, size ) {
		this.hf = hf;
		this.x0 = x0; this.z0 = z0;
		this.n = size / 2 + 3;
		this.h = new Float32Array( this.n * this.n );
		for ( let j = 0; j < this.n; j ++ ) for ( let i = 0; i < this.n; i ++ ) this.h[ j * this.n + i ] = hf.heightAt( x0 + ( i - 1 ) * 2, z0 + ( j - 1 ) * 2 );
	}
	at( x, z ) {
		const fx = ( x - this.x0 ) / 2 + 1, fz = ( z - this.z0 ) / 2 + 1;
		let i = Math.floor( fx ), j = Math.floor( fz );
		if ( i < 0 || j < 0 || i >= this.n - 1 || j >= this.n - 1 ) return this.hf.heightAt( x, z );
		const tx = fx - i, tz = fz - j, n = this.n, H = this.h;
		const ha = H[ j * n + i ], hb = H[ j * n + i + 1 ], hc = H[ ( j + 1 ) * n + i ], hd = H[ ( j + 1 ) * n + i + 1 ];
		// the terrain alternates its diagonal by the parity of the global 2 m lattice index
		const gi = Math.floor( ( x + 65536 ) / 2 ), gj = Math.floor( ( z + 65536 ) / 2 );
		if ( ( gi + gj ) & 1 ) {
			if ( tx + tz <= 1 ) return ha + ( hb - ha ) * tx + ( hc - ha ) * tz;
			return hd + ( hc - hd ) * ( 1 - tx ) + ( hb - hd ) * ( 1 - tz );
		}
		if ( tx >= tz ) return ha + ( hb - ha ) * tx + ( hd - hb ) * tz;
		return ha + ( hc - ha ) * tz + ( hd - hc ) * tx;
	}
}

// ---- entry point ----------------------------------------------------------------------------------------

export function scatterCell( hf, msg ) {
	const layer = msg.layer | 0;
	const size = LAYER_CELL[ layer ];
	const x0 = msg.i * size, z0 = msg.j * size;
	const out = new Out();
	const [ lo, hi ] = hf.rangeOver( x0, z0, size );
	if ( hi < 0.3 || lo > 700 ) return out.finish();
	const env = new Env( hf, x0, z0, size, msg.cty || null );
	const ctx = { hf, env, out, x0, z0, size, bld: msg.bld || null, seg: msg.seg || null, e: {}, isl: hf.islandAt( x0 + size / 2, z0 + size / 2 ) };
	if ( layer === 0 ) { canopy( ctx ); streetTrees( ctx ); yardTrees( ctx ); } else if ( layer === 1 ) { understory( ctx ); crops( ctx ); } else grass( ctx );
	return out.finish();
}

// iterate a global jittered lattice (spacing sp) over the cell; fn( x, z, gi, gj )
function lattice( ctx, sp, salt, fn ) {
	const { x0, z0, size } = ctx;
	const i0 = Math.floor( x0 / sp ) - 1, i1 = Math.floor( ( x0 + size ) / sp ) + 1;
	const j0 = Math.floor( z0 / sp ) - 1, j1 = Math.floor( ( z0 + size ) / sp ) + 1;
	for ( let gj = j0; gj <= j1; gj ++ ) for ( let gi = i0; gi <= i1; gi ++ ) {
		const x = ( gi + 0.1 + 0.8 * hash2( gi, gj, salt ) ) * sp;
		const z = ( gj + 0.1 + 0.8 * hash2( gi, gj, salt + 1 ) ) * sp;
		if ( x < x0 || z < z0 || x >= x0 + size || z >= z0 + size ) continue;
		fn( x, z, gi, gj );
	}
}

// trunk stays clear of pavement and buildings (checked a few metres around for the big plants)
function clearGround( ctx, x, z, r, flags ) {
	if ( flags & NO_GROW ) return false;
	const hf = ctx.hf;
	if ( r > 0 ) {
		if ( ( hf.flagsNear( x + r, z ) | hf.flagsNear( x - r, z ) | hf.flagsNear( x, z + r ) | hf.flagsNear( x, z - r ) ) & PAVED ) return false;
	}
	return true;
}

// ---- canopy: palms and trees ------------------------------------------------------------------------

const CAN_SP = 4.6;
// the forest thins out above ~300 m (1800 m real) and stops at the tree line (~3100 m real); the
// high slopes and the summits get shrubs, grass and rocks only
const TREELINE = 525;
const treeAlt = ( h ) => ( 1 - sstep( 290, 400, h ) * 0.75 ) * ( 1 - sstep( 450, TREELINE, h ) );
const PALM_MAX = 240; // coconut palms are lowland trees
const W = new Float32Array( 7 ); // palm, monkeypod, kukui, ohia, pine, ironwood, kiawe
const CAN_SPECIES = [ SP.PALM, SP.MONKEYPOD, SP.KUKUI, SP.OHIA, SP.PINE, SP.IRONWOOD, SP.KIAWE ];

function canopy( ctx ) {
	const { env, e, hf } = ctx;
	lattice( ctx, CAN_SP, 101, ( x, z, gi, gj ) => {
		env.at( x, z, e );
		const h = e.h;
		if ( h < 0.7 || h > TREELINE ) return;
		// towns get their own yard / street trees, fields stay clean
		if ( e.flags & FLAG.FIELD ) return;
		const wild = 1 - e.u;
		if ( wild < 0.02 ) return;
		const m = e.m, sd = e.sd, lava = e.lava;
		const alt = treeAlt( h );
		const slopeK = 1 - sstep( 0.55, 1.05, e.sl );
		// clearings and groves so forests aren't a uniform carpet
		// (the wettest forests close up: fewer, smaller clearings)
		const clear = 0.42 + 0.58 * Math.max( sstep( 0.28, 0.5, vnoise( x / 230, z / 230, 11 ) ), sstep( 0.75, 0.95, e.m ) * 0.6 );
		const grove = sstep( 0.4, 0.66, vnoise( x / 150, z / 150, 7 ) );
		const pasture = e.use === 3 ? 1 : 0;
		const fresh = sstep( 0.45, 0.75, lava ); // young flows: nearly bare

		const coast = sstep( 120, 35, sd ) * ( h < 32 ? 1 : 0 ) * ( sd > 5 ? 1 : 0 );
		W[ 0 ] = ( coast * ( 0.08 + 0.55 * grove ) + ( h < 55 && m > 0.2 ? 0.012 : 0 ) ) * ( 1 - fresh * 0.8 );
		W[ 1 ] = 0.03 * band( h, 1, 4, 140, 200 ) * band( m, 0.15, 0.25, 0.7, 0.85 ) * ( 1 + pasture * 0.6 );
		W[ 2 ] = 0.1 * sstep( 0.45, 0.72, m ) * band( h, 3, 10, 230, 300 ) * ( 0.5 + Math.min( 1, e.sl * 1.5 ) ) * clear;
		W[ 3 ] = ( 0.72 * sstep( 0.4, 0.78, m ) * band( h, 25, 60, 480, 540 ) * clear + 0.07 * band( lava, 0.2, 0.3, 0.6, 0.8 ) * sstep( 0.22, 0.4, m ) * ( h > 20 ? 1 : 0 ) );
		W[ 4 ] = ( ctx.isl === 5 && h > 50 ? 0.09 * ( 0.3 + grove ) : 0 ) + 0.012 * band( h, 130, 170, 420, 480 ) * band( m, 0.25, 0.3, 0.6, 0.7 ) + pasture * 0.008;
		W[ 5 ] = 0.05 * sstep( 200, 60, sd ) * ( h < 45 ? 1 : 0 ) * band( m, 0.05, 0.12, 0.42, 0.55 ) + 0.022 * band( h, 50, 80, 330, 380 ) * band( m, 0.22, 0.3, 0.48, 0.58 );
		W[ 6 ] = 0.15 * sstep( 0.33, 0.12, m ) * band( h, 0.8, 2, 130, 180 ) * ( 1 - fresh * 0.6 );
		let sum = 0;
		for ( let k = 0; k < 7; k ++ ) sum += W[ k ];
		const p = Math.min( 0.88, sum * alt * slopeK * ( pasture ? 0.25 : 1 ) * ( 1 - fresh * 0.75 ) ) * wild * wild;
		if ( p <= 0 || hash2( gi, gj, 111 ) >= p ) return;
		// species by weight
		let r = hash2( gi, gj, 112 ) * sum, k = 0;
		while ( k < 6 && r > W[ k ] ) { r -= W[ k ]; k ++; }
		const sp = CAN_SPECIES[ k ];
		const big = sp === SP.MONKEYPOD || sp === SP.PINE;
		if ( ! clearGround( ctx, x, z, big ? 6 : 3.5, e.flags ) ) return;
		if ( nearBuilding( ctx.bld, x, z, big ? 9 : sp === SP.PALM ? 2 : 5 ) || nearRoad( ctx.seg, x, z, big ? 5 : 2.5 ) ) return;
		placeTree( ctx, sp, x, z, gi, gj, e );
	} );
}

// one tree: height, lean, tint from the lattice hashes; the base sinks a little into slopes
function placeTree( ctx, sp, x, z, gi, gj, e, salt = 0 ) {
	const hf = ctx.hf;
	const r0 = hash2( gi, gj, 121 + salt ), r1 = hash2( gi, gj, 122 + salt ), r2 = hash2( gi, gj, 123 + salt ), r3 = hash2( gi, gj, 124 + salt );
	const rank = hash2( gi, gj, 125 + salt );
	const yaw = r0 * TAU;
	const g = hf.heightAt( x, z );
	if ( g < 0.5 ) return; // the 8 m environment grid rounds the shoreline: the real ground decides
	const y = g - 0.15 - Math.min( 0.6, e.sl * 0.5 );
	if ( sp === SP.PALM ) {
		// 10 % young palms, the rest 7-16 m; beach palms lean seawards, some grow in a banana curve
		const H = r1 < 0.1 ? 3.5 + r2 * 2.5 : 7 + 9 * Math.pow( r2, 0.9 );
		const seaward = e.sd < 70 && ( e.seaX || e.seaZ );
		const kind = r3 < 0.38 ? 0 : r3 < 0.72 ? 1 : 2; // straight, leaning, curved
		let lean = kind === 0 ? r1 * 0.04 : kind === 1 ? 0.06 + 0.16 * r2 : 0.12 + 0.2 * r1;
		if ( seaward && e.sd < 40 ) lean *= 1.3;
		if ( H < 6 ) lean *= 0.5;
		let az = hash2( gi, gj, 126 + salt ) * TAU;
		if ( seaward && hash2( gi, gj, 127 + salt ) < 0.8 ) az = Math.atan2( e.seaZ, e.seaX ) + ( hash2( gi, gj, 128 + salt ) - 0.5 ) * 1.4;
		az = ( ( az % TAU ) + TAU ) % TAU;
		ctx.out.add( sp, x, y, z, H, yaw, rank, lean, az + ( kind === 2 ? 8 : 0 ) );
		return;
	}
	let s, a = 0.88 + 0.28 * r2, b = r3;
	switch ( sp ) {
		case SP.MONKEYPOD: s = 0.75 + 0.55 * r1; break;
		case SP.KUKUI: s = 0.7 + 0.5 * r1; break;
		case SP.OHIA: s = ( 0.62 + 0.62 * r1 ) * ( e.lava > 0.3 ? 0.6 : 1 ) * ( e.h > 380 ? 0.7 : 1 ); break;
		case SP.PINE: s = 0.7 + 0.5 * r1; a = r2 * 0.045; b = 3.3 + ( r3 - 0.5 ) * 0.8; break; // Cook pines lean towards the equator (south)
		case SP.IRONWOOD: s = 0.7 + 0.5 * r1; break;
		case SP.KIAWE: s = 0.65 + 0.55 * r1; a = 0.8 + 0.35 * r2; break;
		default: s = 1;
	}
	ctx.out.add( sp, x, y, z, s, yaw, rank, a, b );
}

// street trees: planted in the verge just outside the sidewalk, every 14-26 m, per town kind
const STREET_P = [ 0.05, 0.32, 0.3, 0.26, 0.62, 0.1 ];
function streetTrees( ctx ) {
	const seg = ctx.seg;
	if ( ! seg ) return;
	const { x0, z0, size, e, env } = ctx;
	for ( let k = 0; k < seg.length; k += 6 ) {
		const ax = seg[ k ], az = seg[ k + 1 ], bx = seg[ k + 2 ], bz = seg[ k + 3 ], hw = seg[ k + 4 ], kind = seg[ k + 5 ];
		const L = Math.hypot( bx - ax, bz - az );
		if ( L < 4 ) continue;
		const tx = ( bx - ax ) / L, tz = ( bz - az ) / L;
		// global seed from the segment's end points so both cells agree
		const sid = Math.floor( ax * 7.1 + az * 3.3 + bx * 1.7 + bz * 5.9 );
		const spacing = kind === 4 ? 14 : 20;
		for ( let side = - 1; side <= 1; side += 2 ) {
			for ( let d = spacing * 0.5 * ( 0.6 + hash2( sid, side, 131 ) * 0.8 ), n = 0; d < L - 3; d += spacing * ( 0.75 + 0.5 * hash2( sid, n, 132 + side ) ), n ++ ) {
				const off = hw + 1.3;
				const x = ax + tx * d - tz * off * side, z = az + tz * d + tx * off * side;
				if ( x < x0 || z < z0 || x >= x0 + size || z >= z0 + size ) continue;
				if ( hash2( sid, n * 2 + ( side > 0 ? 1 : 0 ), 133 ) > STREET_P[ kind ] ) continue;
				env.at( x, z, e );
				if ( e.h < 0.8 || e.h > TREELINE - 60 || ( e.flags & ( FLAG.BUILDING | FLAG.RUNWAY ) ) ) continue;
				if ( hash2( sid, n * 2 + ( side > 0 ? 1 : 0 ), 135 ) > treeAlt( e.h ) ) continue;
				if ( nearBuilding( ctx.bld, x, z, 2.2 ) || nearRoad( ctx.seg, x, z, 0.6 ) ) continue;
				const r = hash2( sid, n, 134 + side );
				let sp = kind === 4 ? ( r < 0.85 ? SP.PALM : SP.MONKEYPOD ) : kind === 0 ? ( r < 0.6 ? SP.PALM : SP.IRONWOOD ) : ( ctx.isl === 5 && r < 0.5 ? SP.PINE : r < 0.55 ? SP.PALM : r < 0.85 ? SP.MONKEYPOD : SP.KUKUI );
				if ( sp === SP.PALM && e.h > PALM_MAX ) sp = e.m > 0.4 ? SP.KUKUI : SP.IRONWOOD;
				placeTree( ctx, sp, x, z, sid, n * 2 + ( side > 0 ? 1 : 0 ), e, 40 );
			}
		}
	}
}

// yards, parks and beach fronts inside towns: sparse palms and shade trees clear of the houses,
// thinning out where the town gives way to the wild canopy
function yardTrees( ctx ) {
	const { env, e } = ctx;
	lattice( ctx, 11, 141, ( x, z, gi, gj ) => {
		env.at( x, z, e );
		if ( e.u <= 0 || ( e.flags & NO_GROW ) || e.h < 0.8 || e.h > TREELINE - 60 ) return;
		if ( hash2( gi, gj, 144 ) > e.u ) return;
		const beach = e.sd < 70 && e.h < 5;
		if ( beach && e.sd < 12 ) return; // not in the swash
		if ( hash2( gi, gj, 142 ) > ( beach ? 0.3 : 0.1 ) * treeAlt( e.h ) ) return;
		const r = hash2( gi, gj, 143 );
		// planted trees: coconut palms, monkeypods, Cook pines (Lānaʻi City) and kukui where it's wet
		let sp = beach || r < 0.6 ? SP.PALM : r < 0.85 || e.m < 0.4 ? SP.MONKEYPOD : ctx.isl === 5 ? SP.PINE : SP.KUKUI;
		if ( sp === SP.PALM && e.h > PALM_MAX ) sp = e.m > 0.4 ? SP.KUKUI : SP.IRONWOOD;
		const clear = sp === SP.PALM ? 2 : 7;
		if ( ! clearGround( ctx, x, z, 3, e.flags ) || nearBuilding( ctx.bld, x, z, clear ) || nearRoad( ctx.seg, x, z, sp === SP.PALM ? 1.2 : 4 ) ) return;
		placeTree( ctx, sp, x, z, gi, gj, e, 60 );
	} );
}

// ---- understory, shrubs, rocks ------------------------------------------------------------------------

const UND_SP = 2.3;
const U = new Float32Array( 9 );
const UND_SPECIES = [ SP.FERN, SP.TREEFERN, SP.BANANA, SP.TI, SP.SHRUB, SP.NAUPAKA, SP.TALLGRASS, SP.ROCK, SP.SHRUB ];

function understory( ctx ) {
	const { env, e, hf } = ctx;
	lattice( ctx, UND_SP, 201, ( x, z, gi, gj ) => {
		env.at( x, z, e );
		const h = e.h;
		if ( h < 0.6 || h > 640 ) return;
		if ( e.flags & ( NO_GROW | FLAG.FIELD ) ) return;
		// towns keep lawns and planted trees only
		const wild = 1 - e.u;
		if ( wild < 0.02 || hash2( gi, gj, 213 ) > wild ) return;
		const m = e.m, sd = e.sd, lava = e.lava, sl = e.sl;
		const sand = sd < 40 && h < 3.2 ? 1 : 0;
		const alt = 1 - sstep( 360, 520, h ) * 0.7;
		const fresh = sstep( 0.5, 0.8, lava );
		const clump = sstep( 0.35, 0.7, vnoise( x / 45, z / 45, 21 ) );
		const open = 1 - sstep( 0.55, 0.78, m );
		U[ 0 ] = 0.3 * sstep( 0.55, 0.8, m ) * band( h, 25, 45, 470, 520 );
		U[ 1 ] = 0.1 * sstep( 0.66, 0.88, m ) * band( h, 50, 90, 400, 450 ) * ( 0.4 + clump );
		U[ 2 ] = 0.014 * sstep( 0.4, 0.6, m ) * band( h, 1.5, 3, 150, 200 ) * ( 0.2 + 2 * clump );
		U[ 3 ] = 0.012 * sstep( 0.45, 0.7, m ) * band( h, 1.5, 3, 280, 330 );
		U[ 4 ] = ( 0.025 + 0.06 * sstep( 0.12, 0.6, m ) ) * band( h, 1.2, 3, 520, 590 ) * ( 1 - sand * 0.85 ) * ( 1 - fresh * 0.8 );
		U[ 5 ] = 0.2 * band( sd, 3, 7, 30, 48 ) * ( h < 6 ? 1 : 0 ) * ( 0.25 + 1.5 * clump ); // naupaka hedges along the backshore
		U[ 6 ] = ( 0.07 * open * sstep( 0.1, 0.25, m ) + 0.09 * sstep( 0.28, 0.12, m ) * ( 1 - fresh * 0.5 ) + 0.06 * band( lava, 0.15, 0.25, 0.6, 0.8 ) ) * band( h, 2, 5, 330, 420 ) * ( 1 - sand ) * ( e.use === 3 ? 0.15 : 1 );
		U[ 7 ] = 0.004 + 0.06 * sstep( 0.45, 0.9, sl ) + 0.045 * sstep( 0.3, 0.6, lava ) + 0.1 * ( sd < 16 && sl > 0.22 ? 1 : 0 ) + 0.05 * sstep( 440, 520, h ) + 0.012 * sstep( 0.22, 0.1, m );
		U[ 8 ] = 0.035 * sstep( 520, 560, h ) * ( 1 - sstep( 585, 615, h ) ); // sparse alpine scrub, bare summits
		let sum = 0;
		for ( let k = 0; k < 9; k ++ ) sum += U[ k ];
		const p = Math.min( 0.8, sum * alt * ( 1 - sstep( 0.9, 1.3, sl ) * 0.8 ) );
		if ( p <= 0 || hash2( gi, gj, 211 ) >= p ) return;
		let r = hash2( gi, gj, 212 ) * sum, k = 0;
		while ( k < 8 && r > U[ k ] ) { r -= U[ k ]; k ++; }
		const sp = UND_SPECIES[ k ];
		if ( sp === SP.TREEFERN || sp === SP.ROCK || sp === SP.BANANA ) { if ( ! clearGround( ctx, x, z, 2, e.flags ) ) return; }
		// houses out in the country keep a cleared yard, road shoulders stay open
		if ( nearBuilding( ctx.bld, x, z, 9 ) || nearRoad( ctx.seg, x, z, 1.5 ) ) return;
		const r0 = hash2( gi, gj, 221 ), r1 = hash2( gi, gj, 222 ), r2 = hash2( gi, gj, 223 ), r3 = hash2( gi, gj, 224 );
		const rank = hash2( gi, gj, 225 );
		const yaw = r0 * TAU;
		let y = hf.heightAt( x, z ), s = 1, a = 0, b = r3;
		if ( y < 0.35 ) return;
		switch ( sp ) {
			case SP.FERN: s = 0.6 + 0.7 * r1; y -= 0.05; break;
			case SP.TREEFERN: s = 0.6 + 0.8 * r1; a = 0.7 + 0.8 * r2; y -= 0.1; break;
			case SP.BANANA: s = 0.75 + 0.5 * r1; y -= 0.1; break;
			case SP.TI: s = 0.7 + 0.6 * r1; y -= 0.05; break;
			case SP.SHRUB: s = ( 0.55 + 0.8 * r1 ) * ( h > 480 ? 0.55 : 1 ); a = m > 0.5 ? r2 : 0; y -= 0.1; break;
			case SP.NAUPAKA: s = 0.7 + 0.6 * r1; y -= 0.15; break;
			case SP.TALLGRASS: s = ( 0.6 + 0.6 * r1 ) * ( m < 0.25 ? 0.7 : 1 ); a = Math.min( 1, Math.max( 0, 1 - sstep( 0.12, 0.5, m ) + ( r2 - 0.5 ) * 0.3 + lava * 0.4 ) ); y -= 0.05; break;
			case SP.ROCK: {
				// boulders on steep ground and rocky shores, lava chunks on the flows
				s = 0.35 + 1.5 * Math.pow( r1, 2.2 ) + ( sl > 0.6 ? 0.5 * r2 : 0 );
				a = 0.45 + 0.45 * r2;
				b = Math.min( 1, lava * 1.6 + ( h > 440 ? 0.5 : 0 ) + ( ctx.isl === 8 ? 0.25 : 0 ) );
				y -= s * a * 0.3;
				break;
			}
		}
		ctx.out.add( sp, x, y, z, s, yaw, rank, a, b );
	} );
}

// pineapple double rows (they line up with the terrain's field stripes: rows every 1.6 m across the
// (1, 1) diagonal) and blocks of sugar cane
const PINE_ROW = 1.6, PINE_SEG = 2.4;
function crops( ctx ) {
	const { hf, env, e, x0, z0, size } = ctx;
	const has = ( use ) => {
		for ( let k = 0; k < 9; k ++ ) {
			const x = x0 + ( k % 3 ) * size / 2, z = z0 + Math.floor( k / 3 ) * size / 2;
			if ( ( hf.flagsNear( x, z ) & FLAG.FIELD ) && hf.surfaceAt( x, z )[ 3 ] === use ) return true;
		}
		return false;
	};
	const R = Math.SQRT1_2;
	if ( has( 1 ) ) {
		// n: across the rows, t: along them
		const cs = [ x0 * R + z0 * R, ( x0 + size ) * R + z0 * R, x0 * R + ( z0 + size ) * R, ( x0 + size ) * R + ( z0 + size ) * R ];
		const ct = [ x0 * R - z0 * R, ( x0 + size ) * R - z0 * R, x0 * R - ( z0 + size ) * R, ( x0 + size ) * R - ( z0 + size ) * R ];
		const k0 = Math.floor( Math.min( ...cs ) / PINE_ROW ), k1 = Math.ceil( Math.max( ...cs ) / PINE_ROW );
		const m0 = Math.floor( Math.min( ...ct ) / PINE_SEG ), m1 = Math.ceil( Math.max( ...ct ) / PINE_SEG );
		for ( let k = k0; k <= k1; k ++ ) for ( let mm = m0; mm <= m1; mm ++ ) {
			const n = k * PINE_ROW, t = ( mm + 0.5 ) * PINE_SEG;
			const x = ( n + t ) * R, z = ( n - t ) * R;
			if ( x < x0 || z < z0 || x >= x0 + size || z >= z0 + size ) continue;
			const fl = hf.flagsNear( x, z );
			if ( ! ( fl & FLAG.FIELD ) || ( fl & NO_GROW ) || hf.surfaceAt( x, z )[ 3 ] !== 1 ) continue;
			if ( hash2( k, mm, 301 ) < 0.04 ) continue; // gaps
			const y = hf.heightAt( x, z ) - 0.04;
			const flip = hash2( k, mm, 302 ) < 0.5 ? 0 : Math.PI;
			ctx.out.add( SP.PINEAPPLE, x, y, z, 0.85 + 0.3 * hash2( k, mm, 303 ), Math.PI / 4 + flip, hash2( k, mm, 304 ), 0, hash2( k, mm, 305 ) );
		}
	}
	if ( has( 2 ) ) {
		lattice( ctx, 2.6, 311, ( x, z, gi, gj ) => {
			const fl = hf.flagsNear( x, z );
			if ( ! ( fl & FLAG.FIELD ) || ( fl & NO_GROW ) || hf.surfaceAt( x, z )[ 3 ] !== 2 ) return;
			// blocks planted at different times: young, half grown and tall cane
			const blk = vnoise( x / 70, z / 70, 31 );
			const H = blk < 0.3 ? 1.1 + blk * 2 : blk < 0.55 ? 2.2 + ( blk - 0.3 ) * 3 : 3.3 + ( blk - 0.55 ) * 1.6;
			const y = hf.heightAt( x, z ) - 0.05;
			ctx.out.add( SP.CANE, x, y, z, H * ( 0.9 + 0.2 * hash2( gi, gj, 312 ) ), hash2( gi, gj, 313 ) * TAU, hash2( gi, gj, 314 ), 0, hash2( gi, gj, 315 ) );
		} );
	}
	void env; void e;
}

// ---- grass clumps (32 m cells around the player) --------------------------------------------------------

// ~3.7 clumps / m² (x 9 blades near the camera, see buildGrassClump)
const GRASS_SP = 0.52;
function grass( ctx ) {
	const { env, e, x0, z0, size } = ctx;
	const ground = new MeshGround( ctx.hf, x0, z0, size );
	const roads = new SegGrid( ctx.seg, x0, z0, size, 0.4 );
	lattice( ctx, GRASS_SP, 401, ( x, z, gi, gj ) => {
		env.at( x, z, e );
		const h = e.h;
		if ( h < 0.9 || h > 610 ) return;
		if ( e.flags & ( NO_GROW | FLAG.FIELD ) ) return;
		if ( e.sd < 45 && h < 3.4 ) return; // beach sand
		const m = e.m;
		// the flagged town blocks are mown lawns (the terrain paints them); the rest of a town has no
		// wild meadow grass, and neither have the cleared yards of country houses
		const city = ( e.flags & FLAG.CITY ) ? 1 : 0;
		if ( ! city && ( hash2( gi, gj, 416 ) < e.u || nearBuilding( ctx.bld, x, z, 6 ) ) ) return;
		let d = 0.3 + 0.7 * sstep( 0.06, 0.38, m );
		// where the terrain paints the rain forest's floor (Terrain.js jungleW) only a little grass grows
		const wetM = Math.min( 1, m * 1.15 + 0.14 );
		d *= 1 - sstep( 0.52, 0.8, wetM ) * ( e.use === 3 ? 0.15 : 0.8 );
		d *= 1 - sstep( 0.35, 0.6, e.lava ) * 0.85;
		d *= 1 - sstep( 0.6, 0.95, e.sl );
		d *= 1 - sstep( 480, 600, h ) * 0.8;
		d *= 0.5 + 0.5 * sstep( 0.2, 0.6, vnoise( x / 6.5, z / 6.5, 41 ) ); // clumpy meadows
		if ( city ) d = 0.5;
		if ( e.use === 3 ) d = Math.max( d, 0.9 );
		if ( hash2( gi, gj, 411 ) >= d ) return;
		// clear of the pavement (the flag grid is 8 m coarse): streets, their sidewalks and road shoulders
		if ( roads.near( x, z, city ? 0.4 : 0.25 ) || ( city && nearBuilding( ctx.bld, x, z, 0.8 ) ) ) return;
		const r1 = hash2( gi, gj, 412 );
		const s = city ? 0.2 + 0.08 * r1 : e.use === 3 ? 0.5 + 0.3 * r1 : ( 0.6 + 0.55 * r1 ) * ( 0.8 + 0.4 * sstep( 0.2, 0.6, m ) );
		const gy = ground.at( x, z );
		if ( gy < 0.4 ) return;
		// the ground's slope and south exposure (the terrain's meadow tone depends on them)
		const hx = ground.at( x + 1, z ) - ground.at( x - 1, z ), hz = ground.at( x, z + 1 ) - ground.at( x, z - 1 );
		const nl = Math.hypot( hx, 2, hz );
		const slope = 1 - 2 / nl, south = - hz / nl;
		// a: moisture, slope and south exposure packed in 8 bits each (the blades take the terrain's tone
		// there, see VegMaterial vegGroundTone), b: lawn
		const pk = Math.round( m * 255 ) + Math.round( Math.min( 1, slope ) * 255 ) * 256 + Math.round( ( south * 0.5 + 0.5 ) * 255 ) * 65536;
		ctx.out.add( SP.GRASS, x, gy - 0.03, z, s, hash2( gi, gj, 414 ) * TAU, hash2( gi, gj, 415 ), pk, city );
	} );
}
