// Ported from Tidewater src/world/ShoreField.js (MIT, see LICENSE-Tidewater.txt)
// Wave-propagation field for the shoreline waves on a tile around the camera. Solves the Eikonal equation
// |grad T| = 1 / c(x) with the Fast Marching Method, where c = sqrt( g depth ) is the shallow-water wave
// speed (capped offshore). Sources are the tile's border water cells, initialized with a plane wave
// travelling along swellDir, so wave fronts refract around headlands and align with the depth contours
// near the beach. (Ours: the plane wave's timing is referenced to the world origin, so overlapping tiles
// with the same swell direction agree; the direction is picked per tile from the open water around it.)
// Output (RGBA float, res x res over the tile): r = arrival time T (s), g, b = propagation direction x
// exposure (length = exposure 0..1), a = arrival time at the nearest shoreline (extended onto land for the
// swash timing). (Ours) psi: the along-crest coordinate (m), carried along the rays from the plane wave's
// along-crest position at the border (Tidewater projects the position on the local crest direction, which only
// holds near its origin: 15 km out, a 0.1 degree turn of the direction moves that by 25 m). packShoreField
// packs both for the GPU. Plain JS (the water's worker).

export const GRAVITY = 9.81;

class MinHeap {
	constructor( cap ) {
		this.keys = new Float64Array( cap );
		this.vals = new Int32Array( cap );
		this.size = 0;
	}

	push( k, v ) {
		let i = this.size ++;
		const keys = this.keys, vals = this.vals;
		while ( i > 0 ) {
			const p = ( i - 1 ) >> 1;
			if ( keys[ p ] <= k ) break;
			keys[ i ] = keys[ p ]; vals[ i ] = vals[ p ];
			i = p;
		}
		keys[ i ] = k; vals[ i ] = v;
	}

	pop() {
		const keys = this.keys, vals = this.vals;
		const top = vals[ 0 ];
		const k = keys[ -- this.size ], v = vals[ this.size ];
		let i = 0;
		const n = this.size;
		while ( true ) {
			let c = 2 * i + 1;
			if ( c >= n ) break;
			if ( c + 1 < n && keys[ c + 1 ] < keys[ c ] ) c ++;
			if ( keys[ c ] >= k ) break;
			keys[ i ] = keys[ c ]; vals[ i ] = vals[ c ];
			i = c;
		}
		keys[ i ] = k; vals[ i ] = v;
		return top;
	}
}

// heightAt( x, z ): ground height; the tile covers [ x0, x0 + size ] x [ z0, z0 + size ]
export function computeShoreField( heightAt, { x0, z0, size, res = 512, swellDir = [ 0, - 1 ], seaLevel = 0, maxDepth = 25, minDepth = 0.25 } = {} ) {
	const h = size / res;
	const N = res * res;

	const depth = new Float32Array( N );
	const speed = new Float32Array( N );
	for ( let j = 0; j < res; j ++ ) {
		const z = z0 + ( j + 0.5 ) * h;
		for ( let i = 0; i < res; i ++ ) {
			const x = x0 + ( i + 0.5 ) * h;
			const d = seaLevel - heightAt( x, z );
			depth[ j * res + i ] = d;
			speed[ j * res + i ] = d > 0 ? Math.sqrt( GRAVITY * Math.min( Math.max( d, minDepth ), maxDepth ) ) : 0;
		}
	}

	const T = new Float32Array( N ).fill( Infinity );
	const psi = new Float32Array( N ).fill( Infinity );
	const state = new Uint8Array( N ); // 0 far, 1 trial, 2 known
	const heap = new MinHeap( N * 4 );
	const [ sdx, sdz ] = swellDir;
	const c0 = Math.sqrt( GRAVITY * maxDepth );

	// plane-wave initial condition on the border water cells (world-referenced timing)
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {
		if ( i !== 0 && j !== 0 && i !== res - 1 && j !== res - 1 ) continue;
		const k = j * res + i;
		if ( speed[ k ] <= 0 ) continue;
		const x = x0 + ( i + 0.5 ) * h, z = z0 + ( j + 0.5 ) * h;
		T[ k ] = ( x * sdx + z * sdz ) / c0 + 4096; // offset keeps T positive
		psi[ k ] = z * sdx - x * sdz; // along the plane wave's crest: dot( xz, ( - sdz, sdx ) )
		state[ k ] = 1;
		heap.push( T[ k ], k );
	}

	// (the along-crest coordinate of the solved cell goes to solvedPsi: the upwind neighbours' values weighted
	// by the characteristic direction ( t - tx, t - tz ), i.e. constant along the rays)
	let solvedPsi = 0;
	const solve = ( i, j ) => {
		const k = j * res + i;
		const c = speed[ k ];
		if ( c <= 0 ) return Infinity;
		const f = h / c;
		const kl = i > 0 && state[ k - 1 ] === 2 ? k - 1 : - 1, kr = i < res - 1 && state[ k + 1 ] === 2 ? k + 1 : - 1;
		const kd = j > 0 && state[ k - res ] === 2 ? k - res : - 1, ku = j < res - 1 && state[ k + res ] === 2 ? k + res : - 1;
		const kx = kl < 0 ? kr : kr < 0 ? kl : T[ kl ] <= T[ kr ] ? kl : kr;
		const kz = kd < 0 ? ku : ku < 0 ? kd : T[ kd ] <= T[ ku ] ? kd : ku;
		const tx = kx < 0 ? Infinity : T[ kx ], tz = kz < 0 ? Infinity : T[ kz ];
		const a = Math.min( tx, tz ), b = Math.max( tx, tz );
		if ( ! isFinite( b ) || b - a >= f ) { solvedPsi = psi[ tx <= tz ? kx : kz ]; return a + f; }
		const t = 0.5 * ( a + b + Math.sqrt( 2 * f * f - ( a - b ) * ( a - b ) ) );
		const wx = t - tx, wz = t - tz;
		solvedPsi = ( wx * psi[ kx ] + wz * psi[ kz ] ) / Math.max( wx + wz, 1e-9 );
		return t;
	};

	while ( heap.size > 0 ) {
		const k = heap.pop();
		if ( state[ k ] === 2 ) continue;
		state[ k ] = 2;
		const i = k % res, j = ( k / res ) | 0;
		for ( let q = 0; q < 4; q ++ ) {
			const ni = q === 0 ? i - 1 : q === 1 ? i + 1 : i, nj = q === 2 ? j - 1 : q === 3 ? j + 1 : j;
			if ( ni < 0 || nj < 0 || ni >= res || nj >= res ) continue;
			const nk = nj * res + ni;
			if ( state[ nk ] === 2 || speed[ nk ] <= 0 ) continue;
			const t = solve( ni, nj );
			if ( t < T[ nk ] ) {
				T[ nk ] = t;
				psi[ nk ] = solvedPsi;
				state[ nk ] = 1;
				heap.push( t, nk );
			}
		}
	}

	// Extend a field onto land one ring of cells per pass (average of the known neighbours + inc). Each pass
	// reads the previous pass only: filling in place while scanning would let values from far away sweep
	// across the land in a single pass.
	const extend = ( F, passes, inc ) => {
		const prev = new Float32Array( N );
		for ( let pass = 0; pass < passes; pass ++ ) {
			prev.set( F );
			let changed = false;
			for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {
				const k = j * res + i;
				if ( isFinite( prev[ k ] ) ) continue;
				let s = 0, n = 0;
				if ( i > 0 && isFinite( prev[ k - 1 ] ) ) { s += prev[ k - 1 ]; n ++; }
				if ( i < res - 1 && isFinite( prev[ k + 1 ] ) ) { s += prev[ k + 1 ]; n ++; }
				if ( j > 0 && isFinite( prev[ k - res ] ) ) { s += prev[ k - res ]; n ++; }
				if ( j < res - 1 && isFinite( prev[ k + res ] ) ) { s += prev[ k + res ]; n ++; }
				if ( n > 0 ) { F[ k ] = s / n + inc; changed = true; }
			}
			if ( ! changed ) break;
		}
	};

	// arrival time at the nearest shoreline, extended unchanged onto land (swash timing)
	const Tshore = new Float32Array( T );
	extend( Tshore, 40, 0 );

	// extend T onto land (so the swash zone has a continuous phase), continuing slowly up the beach
	const Tfilled = new Float32Array( T );
	extend( Tfilled, 24, h / 1.5 );

	// the along-crest coordinate the same way (onto land unchanged)
	const psiFilled = new Float32Array( psi );
	extend( psiFilled, 24, 0 );

	// smooth to remove first-order FMM kinks (keeps phase monotonic)
	const smooth3 = ( Ts ) => {
	for ( let it = 0; it < 3; it ++ ) {
		const out = new Float32Array( N );
		for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {
			const k = j * res + i;
			if ( ! isFinite( Ts[ k ] ) ) { out[ k ] = Ts[ k ]; continue; }
			let s = Ts[ k ] * 4, w = 4;
			if ( i > 0 && isFinite( Ts[ k - 1 ] ) ) { s += Ts[ k - 1 ]; w ++; }
			if ( i < res - 1 && isFinite( Ts[ k + 1 ] ) ) { s += Ts[ k + 1 ]; w ++; }
			if ( j > 0 && isFinite( Ts[ k - res ] ) ) { s += Ts[ k - res ]; w ++; }
			if ( j < res - 1 && isFinite( Ts[ k + res ] ) ) { s += Ts[ k + res ]; w ++; }
			out[ k ] = s / w;
		}
		Ts = out;
	}
	return Ts;
	};
	const Ts = smooth3( Tfilled );
	const psiS = smooth3( psiFilled );

	// directions + exposure
	const data = new Float32Array( N * 4 );
	const psiOut = new Float32Array( N );
	const sl = Math.hypot( sdx, sdz );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {
		const k = j * res + i;
		const t = Ts[ k ];
		const g = ( a, b ) => ( isFinite( a ) && isFinite( b ) ) ? ( a - b ) : 0;
		const tl = i > 0 ? Ts[ k - 1 ] : t, tr = i < res - 1 ? Ts[ k + 1 ] : t;
		const td = j > 0 ? Ts[ k - res ] : t, tu = j < res - 1 ? Ts[ k + res ] : t;
		let gx = g( tr, tl ), gz = g( tu, td );
		if ( gx === 0 && isFinite( tr ) && isFinite( t ) ) gx = tr - t;
		if ( gz === 0 && isFinite( tu ) && isFinite( t ) ) gz = tu - t;
		const len = Math.hypot( gx, gz ) || 1;
		const dx = gx / len, dz = gz / len;
		// exposure: how directly the local wave direction faces the incoming swell
		const align = ( dx * sdx + dz * sdz ) / sl;
		const exposure = Math.min( 1, Math.max( 0.02, align * 1.4 + 0.1 ) );
		// direction scaled by exposure (length = exposure), alpha = shoreline arrival time
		const reached = isFinite( t );
		data[ k * 4 ] = reached ? t : 1e5;
		data[ k * 4 + 1 ] = reached ? dx * exposure : 0;
		data[ k * 4 + 2 ] = reached ? dz * exposure : 0;
		data[ k * 4 + 3 ] = isFinite( Tshore[ k ] ) ? Tshore[ k ] : ( reached ? t : 1e5 );
		psiOut[ k ] = isFinite( psiS[ k ] ) ? psiS[ k ] : 0;
	}

	return { data, psi: psiOut, res, cellSize: h, x0, z0, size, swellDir: [ sdx, sdz ] };
}

// float32 -> IEEE half bits (round to nearest even; the direction x exposure stays within +-1)
const _f32 = new Float32Array( 1 ), _u32 = new Uint32Array( _f32.buffer );
function toHalf( v ) {
	_f32[ 0 ] = v;
	const x = _u32[ 0 ];
	const sign = ( x >>> 16 ) & 0x8000;
	let e = ( ( x >>> 23 ) & 0xff ) - 127 + 15;
	let m = x & 0x7fffff;
	if ( e >= 31 ) return sign | 0x7c00;
	if ( e <= 0 ) {
		if ( e < - 10 ) return sign;
		m = ( m | 0x800000 ) >>> ( 1 - e );
		return sign | ( ( m + 0x1000 ) >>> 13 );
	}
	const r = ( ( e << 10 ) | ( m >>> 13 ) ) + ( ( m & 0x1fff ) > 0x1000 || ( ( m & 0x1fff ) === 0x1000 && ( m & 0x2000 ) ) ? 1 : 0 );
	return sign | r;
}

// (ours) the field for the GPU as RGBA32UI (exact loads, one sampler): r = bits of T, g = packHalf2x16( direction x
// exposure ), b = bits of psi, a = bits of the shoreline arrival time (ShoreWaves shoreFieldSample decodes it)
export function packShoreField( F ) {
	const N = F.res * F.res, D = F.data, out = new Uint32Array( N * 4 );
	const fv = new Float32Array( out.buffer );
	for ( let k = 0; k < N; k ++ ) {
		fv[ k * 4 ] = D[ k * 4 ];
		out[ k * 4 + 1 ] = ( toHalf( D[ k * 4 + 1 ] ) | ( toHalf( D[ k * 4 + 2 ] ) << 16 ) ) >>> 0;
		fv[ k * 4 + 2 ] = F.psi[ k ];
		fv[ k * 4 + 3 ] = D[ k * 4 + 3 ];
	}
	return out;
}

// (ours) the swell direction for a tile: from the open water around its centre toward it, snapped to 16
// compass directions so neighbouring tiles agree. depthAt( x, z ) > 0 in the sea. Returns a unit [ dx, dz ]
// (the travel direction) or null when there is no open water.
export function pickSwellDir( depthAt, cx, cz, reach = 1000 ) {
	let best = - 1, bi = - 1;
	const D = 16;
	for ( let k = 0; k < D; k ++ ) {
		const a = k / D * Math.PI * 2, ux = Math.cos( a ), uz = Math.sin( a );
		let s = 0;
		for ( let r = 16; r <= reach; r += 16 ) s += Math.min( 25, Math.max( 0, depthAt( cx + ux * r, cz + uz * r ) ) ) * ( 0.5 + r / reach );
		if ( s > best ) { best = s; bi = k; }
	}
	if ( best <= 0 ) return null;
	// the waves travel from that water toward the centre
	const a = bi / D * Math.PI * 2;
	return [ - Math.cos( a ), - Math.sin( a ) ];
}
