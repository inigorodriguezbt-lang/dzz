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

// max pyramid of the mask (level 0 is the mask itself): anySea() answers "is there sea under this square" in a
// few lookups. The sea mesh skips quadtree nodes with none (ocean/CDLOD.js cull): the shader would discard all
// of their fragments anyway (vSeaMask), after the whole water shading
export function seaPyramid( hf, mask ) {
	let w = hf.cnx, h = hf.cnz, m = mask;
	const levels = [ { w, h, m, cell: hf.CS } ];
	while ( w > 1 || h > 1 ) {
		const nw = Math.ceil( w / 2 ), nh = Math.ceil( h / 2 ), n = new Uint8Array( nw * nh );
		for ( let j = 0; j < nh; j ++ ) for ( let i = 0; i < nw; i ++ ) {
			const i0 = i * 2, j0 = j * 2, i1 = Math.min( w - 1, i0 + 1 ), j1 = Math.min( h - 1, j0 + 1 );
			n[ j * nw + i ] = m[ j0 * w + i0 ] | m[ j0 * w + i1 ] | m[ j1 * w + i0 ] | m[ j1 * w + i1 ];
		}
		w = nw; h = nh; m = n;
		levels.push( { w, h, m, cell: levels[ levels.length - 1 ].cell * 2 } );
	}
	return levels;
}

// any sea cell within the square (x0, z0, size) grown by `margin` m (off the map counts as sea)
export function anySea( pyr, hf, x0, z0, size, margin = 2 * hf.CS ) {
	const a = x0 - margin - hf.x0, b = x0 + size + margin - hf.x0, c = z0 - margin - hf.z0, d = z0 + size + margin - hf.z0;
	let L = 0;
	while ( L < pyr.length - 1 && pyr[ L ].cell * 2 < size + 2 * margin ) L ++;
	const lv = pyr[ L ];
	const i0 = Math.floor( a / lv.cell ), i1 = Math.floor( b / lv.cell ), j0 = Math.floor( c / lv.cell ), j1 = Math.floor( d / lv.cell );
	if ( i0 < 0 || j0 < 0 || i1 >= lv.w || j1 >= lv.h ) return true;
	for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) if ( lv.m[ j * lv.w + i ] ) return true;
	return false;
}
