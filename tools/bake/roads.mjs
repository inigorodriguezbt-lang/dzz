// Highways routed with A* over the terrain between towns, then graded and cut into the ground.
import { smoothstep } from './grid.mjs';

class Heap {
	constructor() { this.k = []; this.v = []; }
	push( key, val ) {
		const k = this.k, v = this.v; let i = k.length; k.push( key ); v.push( val );
		while ( i > 0 ) { const p = ( i - 1 ) >> 1; if ( k[ p ] <= key ) break; k[ i ] = k[ p ]; v[ i ] = v[ p ]; i = p; }
		k[ i ] = key; v[ i ] = val;
	}
	pop() {
		const k = this.k, v = this.v, top = v[ 0 ], lk = k.pop(), lv = v.pop(), n = k.length;
		if ( n ) {
			let i = 0;
			for ( ;; ) {
				let c = 2 * i + 1; if ( c >= n ) break;
				if ( c + 1 < n && k[ c + 1 ] < k[ c ] ) c ++;
				if ( k[ c ] >= lk ) break;
				k[ i ] = k[ c ]; v[ i ] = v[ c ]; i = c;
			}
			k[ i ] = lk; v[ i ] = lv;
		}
		return top;
	}
	get size() { return this.k.length; }
}

// pathfinding grid at 16 m sampled from the fine grid; flags mark city streets (cheap) and blocks (dear)
export function makePathGrid( fine, streetMask, used ) {
	const S = 16, k = S / fine.s;
	const nx = Math.floor( ( fine.nx - 1 ) / k ) + 1, nz = Math.floor( ( fine.nz - 1 ) / k ) + 1;
	const h = new Float32Array( nx * nz ), f = new Uint8Array( nx * nz );
	for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {
		h[ j * nx + i ] = fine.get( i * k, j * k );
		f[ j * nx + i ] = streetMask[ ( j * k ) * fine.nx + i * k ];
	}
	return { S, nx, nz, h, f, x0: fine.x0, z0: fine.z0, used };
}

export function route( g, ax, az, bx, bz, lanes ) {
	const toI = x => Math.round( ( x - g.x0 ) / g.S ), toJ = z => Math.round( ( z - g.z0 ) / g.S );
	const snap = ( i, j ) => {
		for ( let r = 0; r < 80; r ++ ) for ( let b = - r; b <= r; b ++ ) for ( let a = - r; a <= r; a ++ ) {
			if ( Math.max( Math.abs( a ), Math.abs( b ) ) !== r ) continue;
			const ii = i + a, jj = j + b;
			if ( ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz ) continue;
			if ( g.h[ jj * g.nx + ii ] > 1.5 ) return [ ii, jj ];
		}
		return [ i, j ];
	};
	const [ si, sj ] = snap( toI( ax ), toJ( az ) ), [ ti, tj ] = snap( toI( bx ), toJ( bz ) );
	const span = Math.hypot( ti - si, tj - sj );
	const pad = Math.ceil( span * 0.45 + 90 );
	const bi0 = Math.max( 1, Math.min( si, ti ) - pad ), bi1 = Math.min( g.nx - 2, Math.max( si, ti ) + pad );
	const bj0 = Math.max( 1, Math.min( sj, tj ) - pad ), bj1 = Math.min( g.nz - 2, Math.max( sj, tj ) + pad );
	const W = bi1 - bi0 + 1, H = bj1 - bj0 + 1;
	const cost = new Float32Array( W * H ).fill( Infinity ), from = new Int32Array( W * H ).fill( - 1 );
	const closed = new Uint8Array( W * H );
	const L = ( i, j ) => ( j - bj0 ) * W + ( i - bi0 );
	const heap = new Heap();
	cost[ L( si, sj ) ] = 0; heap.push( 0, L( si, sj ) );
	const minF = 0.3;
	const dirs = [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ], [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ], [ 2, 1 ], [ 1, 2 ], [ - 2, 1 ], [ - 1, 2 ], [ 2, - 1 ], [ 1, - 2 ], [ - 2, - 1 ], [ - 1, - 2 ] ];
	const goal = L( ti, tj );
	let found = false;
	while ( heap.size ) {
		const cur = heap.pop();
		if ( closed[ cur ] ) continue;
		closed[ cur ] = 1;
		if ( cur === goal ) { found = true; break; }
		const ci = cur % W + bi0, cj = Math.floor( cur / W ) + bj0;
		const ch = g.h[ cj * g.nx + ci ];
		for ( const [ di, dj ] of dirs ) {
			const ni = ci + di, nj = cj + dj;
			if ( ni < bi0 || nj < bj0 || ni > bi1 || nj > bj1 ) continue;
			const nl = L( ni, nj );
			if ( closed[ nl ] ) continue;
			const gi = nj * g.nx + ni;
			const nh = g.h[ gi ];
			if ( nh < 0.9 ) continue;
			// a knight's move must not jump over water or a cliff
			if ( Math.abs( di ) + Math.abs( dj ) === 3 ) {
				const mh = g.h[ ( cj + Math.round( dj / 2 ) ) * g.nx + ci + Math.round( di / 2 ) ];
				if ( mh < 0.9 ) continue;
			}
			const len = Math.hypot( di, dj ) * g.S;
			const slope = Math.abs( nh - ch ) / len;
			let f = 1 + 60 * slope * slope + ( slope > 0.1 ? 120 * ( slope - 0.1 ) : 0 ) + ( slope > 0.2 ? 4000 * ( slope - 0.2 ) : 0 );
			if ( nh < 1.8 ) f += 1.5; // keep off the beach
			const fl = g.f[ gi ];
			if ( fl === 1 ) f *= 0.35; // city street
			else if ( fl === 2 ) f *= 4; // city block
			if ( g.used[ gi ] ) f *= 0.45; // share existing highways
			const nc = cost[ cur ] + len * f;
			if ( nc < cost[ nl ] ) {
				cost[ nl ] = nc; from[ nl ] = cur;
				heap.push( nc + Math.hypot( ti - ni, tj - nj ) * g.S * minF, nl );
			}
		}
	}
	if ( ! found ) return null;
	const pts = [];
	for ( let c = goal; c !== - 1; c = from[ c ] ) {
		const i = c % W + bi0, j = Math.floor( c / W ) + bj0;
		pts.push( [ g.x0 + i * g.S, g.z0 + j * g.S ] );
		g.used[ j * g.nx + i ] = 1;
	}
	pts.reverse();
	return pts;
}

export function simplify( pts, tol ) {
	if ( pts.length < 3 ) return pts;
	const keep = new Uint8Array( pts.length ); keep[ 0 ] = keep[ pts.length - 1 ] = 1;
	const st = [ [ 0, pts.length - 1 ] ];
	while ( st.length ) {
		const [ a, b ] = st.pop();
		let md = 0, mi = - 1;
		const [ ax, az ] = pts[ a ], [ bx, bz ] = pts[ b ];
		const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
		for ( let i = a + 1; i < b; i ++ ) {
			const t = Math.max( 0, Math.min( 1, ( ( pts[ i ][ 0 ] - ax ) * dx + ( pts[ i ][ 1 ] - az ) * dz ) / l2 ) );
			const d = Math.hypot( pts[ i ][ 0 ] - ax - t * dx, pts[ i ][ 1 ] - az - t * dz );
			if ( d > md ) { md = d; mi = i; }
		}
		if ( md > tol ) { keep[ mi ] = 1; st.push( [ a, mi ], [ mi, b ] ); }
	}
	return pts.filter( ( _, i ) => keep[ i ] );
}

export function chaikin( pts, iters ) {
	for ( let it = 0; it < iters; it ++ ) {
		const o = [ pts[ 0 ] ];
		for ( let i = 0; i < pts.length - 1; i ++ ) {
			const [ ax, az ] = pts[ i ], [ bx, bz ] = pts[ i + 1 ];
			o.push( [ ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25 ], [ ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75 ] );
		}
		o.push( pts[ pts.length - 1 ] );
		pts = o;
	}
	return pts;
}

export function resample( pts, step ) {
	const out = [ pts[ 0 ] ];
	let carry = 0;
	for ( let i = 0; i < pts.length - 1; i ++ ) {
		const [ ax, az ] = pts[ i ], [ bx, bz ] = pts[ i + 1 ];
		const l = Math.hypot( bx - ax, bz - az );
		let t = step - carry;
		while ( t < l ) { out.push( [ ax + ( bx - ax ) * t / l, az + ( bz - az ) * t / l ] ); t += step; }
		carry = l - ( t - step );
	}
	const last = pts[ pts.length - 1 ], pl = out[ out.length - 1 ];
	if ( Math.hypot( last[ 0 ] - pl[ 0 ], last[ 1 ] - pl[ 1 ] ) > step * 0.3 ) out.push( last ); else out[ out.length - 1 ] = last;
	return out;
}

// height profile: smoothed terrain, grade-limited, never down to the sea
export function profile( fine, pts, step ) {
	const raw = pts.map( ( [ x, z ] ) => fine.sampleAvg( x, z, 6, 1 ) );
	const n = raw.length, win = Math.max( 1, Math.round( 40 / step ) );
	let h = raw.map( ( _, i ) => {
		let s = 0, c = 0;
		for ( let k = - win; k <= win; k ++ ) { const j = Math.min( n - 1, Math.max( 0, i + k ) ); s += raw[ j ]; c ++; }
		return s / c;
	} );
	const maxD = 0.14 * step;
	for ( let it = 0; it < 4; it ++ ) {
		for ( let i = 1; i < n; i ++ ) h[ i ] = Math.min( h[ i - 1 ] + maxD, Math.max( h[ i - 1 ] - maxD, h[ i ] ) );
		for ( let i = n - 2; i >= 0; i -- ) h[ i ] = Math.min( h[ i + 1 ] + maxD, Math.max( h[ i + 1 ] - maxD, h[ i ] ) );
	}
	return h.map( v => Math.max( 1.6, v ) );
}

// cut / fill the terrain along a polyline with heights; writes into best weight / height buffers
export function flattenAlong( fine, pts, hs, half, blend, wBest, hBest, mask, maskBit ) {
	const shoulder = half + 1.5;
	const reach = shoulder + blend;
	for ( let s = 0; s < pts.length - 1; s ++ ) {
		const [ ax, az ] = pts[ s ], [ bx, bz ] = pts[ s + 1 ];
		const ha = hs[ s ], hb = hs[ s + 1 ];
		const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
		const i0 = Math.max( 0, Math.floor( ( Math.min( ax, bx ) - reach - fine.x0 ) / fine.s ) ), i1 = Math.min( fine.nx - 1, Math.ceil( ( Math.max( ax, bx ) + reach - fine.x0 ) / fine.s ) );
		const j0 = Math.max( 0, Math.floor( ( Math.min( az, bz ) - reach - fine.z0 ) / fine.s ) ), j1 = Math.min( fine.nz - 1, Math.ceil( ( Math.max( az, bz ) + reach - fine.z0 ) / fine.s ) );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
			const x = fine.xOf( i ), z = fine.zOf( j );
			const t = Math.max( 0, Math.min( 1, ( ( x - ax ) * dx + ( z - az ) * dz ) / l2 ) );
			const d = Math.hypot( x - ax - t * dx, z - az - t * dz );
			if ( d > reach ) continue;
			const w = 1 - smoothstep( shoulder, reach, d );
			const id = fine.idx( i, j );
			if ( w > wBest[ id ] ) { wBest[ id ] = w; hBest[ id ] = ha + ( hb - ha ) * t; }
			if ( mask && d < half + 1 ) mask[ id ] |= maskBit;
		}
	}
}
