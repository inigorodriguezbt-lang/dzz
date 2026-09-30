// Which coarse cells hold sea water: a flood fill from the map border over cells below +0.5 m, dilated by
// one cell. Everything else below sea level (dips in the fine terrain behind the dunes, lava tubes, quarry
// floors) is dry land, so the sea plane never shows through as inland pools. Plain JS (Node tests).

export const SEA_FLOOD_MAX = 0.5; // m: coarse cells up to this height pass the sea on

// hf: HeightField; returns a Uint8Array cnx * cnz (255 = sea, 0 = land), row-major like hf.coarse
export function buildSeaMask( hf ) {
	const W = hf.cnx, H = hf.cnz, N = W * H;
	const lim = Math.round( SEA_FLOOD_MAX * hf.Q ); // coarse heights are quantised by Q
	const coarse = hf.coarse;
	const sea = new Uint8Array( N );
	const queue = new Int32Array( N );
	let head = 0, tail = 0;
	const seed = ( k ) => { if ( ! sea[ k ] && coarse[ k ] < lim ) { sea[ k ] = 1; queue[ tail ++ ] = k; } };
	for ( let i = 0; i < W; i ++ ) { seed( i ); seed( ( H - 1 ) * W + i ); }
	for ( let j = 0; j < H; j ++ ) { seed( j * W ); seed( j * W + W - 1 ); }
	while ( head < tail ) {
		const k = queue[ head ++ ];
		const i = k % W;
		if ( i > 0 ) seed( k - 1 );
		if ( i < W - 1 ) seed( k + 1 );
		if ( k >= W ) seed( k - W );
		if ( k < N - W ) seed( k + W );
	}
	// dilate by one cell (8-neighbourhood): the beach cells the sea laps onto
	const out = new Uint8Array( N );
	for ( let j = 0; j < H; j ++ ) for ( let i = 0; i < W; i ++ ) {
		let v = 0;
		for ( let dj = - 1; dj <= 1 && ! v; dj ++ ) {
			const jj = j + dj;
			if ( jj < 0 || jj >= H ) continue;
			for ( let di = - 1; di <= 1; di ++ ) {
				const ii = i + di;
				if ( ii >= 0 && ii < W && sea[ jj * W + ii ] ) { v = 255; break; }
			}
		}
		out[ j * W + i ] = v;
	}
	return out;
}

// bilinear mask (0..1) at world x, z, on the coarse cell centres (the uBathyRect mapping)
export function seaMaskAt( hf, mask, x, z ) {
	const fx = ( x - hf.x0 ) / hf.CS, fz = ( z - hf.z0 ) / hf.CS;
	let i = Math.floor( fx ), j = Math.floor( fz );
	const tx = fx - i, tz = fz - j;
	const W = hf.cnx, H = hf.cnz;
	const at = ( a, b ) => mask[ Math.min( H - 1, Math.max( 0, b ) ) * W + Math.min( W - 1, Math.max( 0, a ) ) ];
	const a = at( i, j ) * ( 1 - tx ) + at( i + 1, j ) * tx;
	const b = at( i, j + 1 ) * ( 1 - tx ) + at( i + 1, j + 1 ) * tx;
	return ( a * ( 1 - tz ) + b * tz ) / 255;
}
