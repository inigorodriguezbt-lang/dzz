// Shoreline stations for the breakers (ours, after Tidewater src/ocean/Breakers.js buildStations, MIT, see
// LICENSE-Tidewater.txt). Tidewater lays its stations along one known beach; ours trace the waterline of
// the tile around the camera (marching squares on the ground heights), keep the stretches with open water in
// front, smooth them like Tidewater (30 passes of [1 2 1] / 4) and resample them every 0.6 m, each with the
// unit direction toward the sea. Plain JS (the water's worker).
// Returns { data: Float32Array( n * 4 ) ( x, z, nx, nz ), count, spacing }: consecutive stations of one
// shoreline are 0.6 m apart; a larger gap separates two shorelines.

export function buildStations( h, n, step, x0, z0, { cx, cz, radius = 420, spacing = 0.6, maxCount = 4096 } = {} ) {
	const at = ( i, j ) => h[ Math.min( n - 1, Math.max( 0, j ) ) * n + Math.min( n - 1, Math.max( 0, i ) ) ];
	const X = ( i ) => x0 + ( i + 0.5 ) * step, Z = ( j ) => z0 + ( j + 0.5 ) * step;
	const heightAt = ( x, z ) => {
		const fx = ( x - x0 ) / step - 0.5, fz = ( z - z0 ) / step - 0.5;
		const i = Math.floor( fx ), j = Math.floor( fz ), tx = fx - i, tz = fz - j;
		return ( at( i, j ) * ( 1 - tx ) + at( i + 1, j ) * tx ) * ( 1 - tz ) + ( at( i, j + 1 ) * ( 1 - tx ) + at( i + 1, j + 1 ) * tx ) * tz;
	};
	const r = Math.ceil( radius / step );
	const ci = Math.round( ( cx - x0 ) / step - 0.5 ), cj = Math.round( ( cz - z0 ) / step - 0.5 );
	const i0 = Math.max( 0, ci - r ), i1 = Math.min( n - 2, ci + r ), j0 = Math.max( 0, cj - r ), j1 = Math.min( n - 2, cj + r );
	// marching squares on the 0 m contour: segments between edge crossings, keyed for linking
	const pts = new Map(); // edge key -> [ x, z ]
	const adj = new Map(); // edge key -> [ neighbour keys ]
	const edgeKey = ( i, j, horiz ) => ( ( j * n + i ) * 2 + ( horiz ? 0 : 1 ) );
	const cross = ( i, j, horiz ) => {
		const k = edgeKey( i, j, horiz );
		if ( ! pts.has( k ) ) {
			const a = at( i, j ), b = horiz ? at( i + 1, j ) : at( i, j + 1 );
			const t = a / ( a - b );
			pts.set( k, horiz ? [ X( i ) + t * step, Z( j ) ] : [ X( i ), Z( j ) + t * step ] );
		}
		return k;
	};
	const link = ( a, b ) => { ( adj.get( a ) || adj.set( a, [] ).get( a ) ).push( b ); ( adj.get( b ) || adj.set( b, [] ).get( b ) ).push( a ); };
	for ( let j = j0; j < j1; j ++ ) for ( let i = i0; i < i1; i ++ ) {
		const a = at( i, j ) > 0, b = at( i + 1, j ) > 0, c = at( i + 1, j + 1 ) > 0, d = at( i, j + 1 ) > 0;
		const code = ( a ? 1 : 0 ) | ( b ? 2 : 0 ) | ( c ? 4 : 0 ) | ( d ? 8 : 0 );
		if ( code === 0 || code === 15 ) continue;
		// edges: bottom ( i, j ) horiz, right ( i + 1, j ) vert, top ( i, j + 1 ) horiz, left ( i, j ) vert
		const E = [ () => cross( i, j, true ), () => cross( i + 1, j, false ), () => cross( i, j + 1, true ), () => cross( i, j, false ) ];
		const segs = {
			1: [ [ 3, 0 ] ], 2: [ [ 0, 1 ] ], 3: [ [ 3, 1 ] ], 4: [ [ 1, 2 ] ], 5: [ [ 3, 2 ], [ 0, 1 ] ], 6: [ [ 0, 2 ] ], 7: [ [ 3, 2 ] ],
			8: [ [ 2, 3 ] ], 9: [ [ 0, 2 ] ], 10: [ [ 0, 3 ], [ 1, 2 ] ], 11: [ [ 1, 2 ] ], 12: [ [ 1, 3 ] ], 13: [ [ 0, 1 ] ], 14: [ [ 0, 3 ] ],
		}[ code ];
		for ( const [ e0, e1 ] of segs ) link( E[ e0 ](), E[ e1 ]() );
	}
	// chain the segments into polylines
	const used = new Set();
	const lines = [];
	for ( const start of adj.keys() ) {
		if ( used.has( start ) ) continue;
		// walk to one end first (open lines), then collect
		let a = start, prev = - 1;
		for ( let guard = 0; guard < 1e6; guard ++ ) {
			const nb = adj.get( a ).filter( ( k ) => k !== prev );
			if ( adj.get( a ).length < 2 || ! nb.length || nb[ 0 ] === start ) break;
			prev = a; a = nb[ 0 ];
		}
		const line = [];
		prev = - 1;
		for ( let guard = 0; guard < 1e6; guard ++ ) {
			used.add( a );
			line.push( pts.get( a ) );
			const nb = adj.get( a ).filter( ( k ) => k !== prev && ! used.has( k ) );
			if ( ! nb.length ) break;
			prev = a; a = nb[ 0 ];
		}
		if ( line.length > 8 ) lines.push( line );
	}
	// smooth each polyline (the transects should not follow every wiggle of the waterline), resample by arc
	// length, the normal toward the sea; keep stations with open water in front
	const out = [];
	let count = 0;
	for ( const line of lines ) {
		let sm = line.map( ( p ) => [ p[ 0 ], p[ 1 ] ] );
		for ( let it = 0; it < 30; it ++ ) {
			sm = sm.map( ( p, k ) => {
				if ( k === 0 || k === sm.length - 1 ) return p;
				return [ ( sm[ k - 1 ][ 0 ] + 2 * p[ 0 ] + sm[ k + 1 ][ 0 ] ) * 0.25, ( sm[ k - 1 ][ 1 ] + 2 * p[ 1 ] + sm[ k + 1 ][ 1 ] ) * 0.25 ];
			} );
		}
		let acc = 0, next = 0, run = [];
		const flush = () => { if ( run.length >= 8 ) { for ( const s of run ) out.push( s ); count += run.length; } run = []; };
		for ( let k = 1; k < sm.length; k ++ ) {
			const [ ax, az ] = sm[ k - 1 ], [ bx, bz ] = sm[ k ];
			const seg = Math.hypot( bx - ax, bz - az );
			if ( seg < 1e-6 ) continue;
			while ( next <= acc + seg ) {
				const t = ( next - acc ) / seg;
				const x = ax + ( bx - ax ) * t, z = az + ( bz - az ) * t;
				const tx = ( bx - ax ) / seg, tz = ( bz - az ) / seg;
				let nx = - tz, nz = tx;
				if ( heightAt( x + nx * 3, z + nz * 3 ) > heightAt( x - nx * 3, z - nz * 3 ) ) { nx = - nx; nz = - nz; }
				const inRange = Math.hypot( x - cx, z - cz ) < radius;
				const open = heightAt( x + nx * 12, z + nz * 12 ) < - 0.3;
				if ( inRange && open ) run.push( [ x, z, nx, nz ] ); else flush();
				next += spacing;
			}
			acc += seg;
		}
		flush();
		if ( count >= maxCount ) break;
	}
	const N = Math.min( count, maxCount );
	const data = new Float32Array( N * 4 );
	for ( let k = 0; k < N; k ++ ) data.set( out[ k ], k * 4 );
	return { data, count: N, spacing };
}
