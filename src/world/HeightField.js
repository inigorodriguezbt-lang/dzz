// The baked Hawaiian terrain (tools/bake): heights, surface maps and flags, with the queries the
// game and the world workers share. Everything here is plain JS so a worker can import it.
//
// World frame: +x east, +z south, +y up, metres; sea level y = 0; origin at the centre of the chain.

export const FLAG = { ROAD: 1, DIRT: 2, STREET: 4, RUNWAY: 8, BUILDING: 16, CITY: 32, FIELD: 64 };

export async function loadTerrainBuffer( url, onProgress ) {
	const res = await fetch( url );
	if ( ! res.ok ) throw new Error( `terrain data: HTTP ${res.status}` );
	const total = + res.headers.get( 'content-length' ) || 0;
	const reader = res.body.getReader();
	const chunks = [];
	let got = 0;
	for ( ;; ) {
		const { done, value } = await reader.read();
		if ( done ) break;
		chunks.push( value ); got += value.length;
		if ( onProgress && total ) onProgress( got / total );
	}
	let buf = new Uint8Array( got );
	let o = 0;
	for ( const c of chunks ) { buf.set( c, o ); o += c.length; }
	if ( buf[ 0 ] === 0x1f && buf[ 1 ] === 0x8b ) {
		const ds = new DecompressionStream( 'gzip' );
		const stream = new Blob( [ buf ] ).stream().pipeThrough( ds );
		buf = new Uint8Array( await new Response( stream ).arrayBuffer() );
	}
	return buf.buffer;
}

export class HeightField {
	constructor( buffer, meta ) {
		this.buffer = buffer;
		const h = new Uint32Array( buffer, 0, 16 );
		if ( h[ 0 ] !== 0x44545731 ) throw new Error( 'terrain data: bad magic' );
		const [ , , cnx, cnz, TX, TZ, NT, TS, Q, CS, FS, TILE ] = h;
		Object.assign( this, { cnx, cnz, TX, TZ, NT, TS, Q, CS, FS, TILE } );
		this.halfX = meta.halfX; this.halfZ = meta.halfZ;
		this.x0 = - meta.halfX; this.z0 = - meta.halfZ;
		let off = 64;
		const take = ( Type, n ) => {
			const a = new Type( buffer, off, n );
			off += n * Type.BYTES_PER_ELEMENT; off = ( off + 3 ) & ~ 3;
			return a;
		};
		this.coarse = take( Int16Array, cnx * cnz );
		this.surf = take( Uint8Array, cnx * cnz * 4 );
		this.island = take( Uint8Array, cnx * cnz );
		this.tileIndex = take( Int16Array, TX * TZ );
		this.fine = take( Int16Array, NT * TS * TS );
		this.mask = take( Uint8Array, NT * TS * TS );
		// undo the row delta coding (in place, once: flag it on the buffer so a transferred copy isn't decoded twice)
		const decoded = new Uint8Array( buffer, 60, 4 );
		if ( decoded[ 0 ] !== 1 ) {
			undelta( this.coarse, cnx );
			undelta( this.fine, TS );
			decoded[ 0 ] = 1;
		}
		this.iq = 1 / Q;
		this.TN = TS - 1;
		this._buildMinMax();
	}

	// ---- raw grids --------------------------------------------------------------------------------

	coarseAt( i, j ) {
		i = i < 0 ? 0 : i >= this.cnx ? this.cnx - 1 : i;
		j = j < 0 ? 0 : j >= this.cnz ? this.cnz - 1 : j;
		return this.coarse[ j * this.cnx + i ] * this.iq;
	}

	coarseBilinear( x, z ) {
		const fx = ( x - this.x0 ) / this.CS, fz = ( z - this.z0 ) / this.CS;
		const i = Math.floor( fx ), j = Math.floor( fz ), tx = fx - i, tz = fz - j;
		const a = this.coarseAt( i, j ) * ( 1 - tx ) + this.coarseAt( i + 1, j ) * tx;
		const b = this.coarseAt( i, j + 1 ) * ( 1 - tx ) + this.coarseAt( i + 1, j + 1 ) * tx;
		return a * ( 1 - tz ) + b * tz;
	}

	// fine sample by global fine index (gi, gj); NaN when that tile isn't stored
	fineAt( gi, gj ) {
		const TN = this.TN;
		let ti = Math.floor( gi / TN ), tj = Math.floor( gj / TN );
		if ( ti >= this.TX ) ti = this.TX - 1;
		if ( tj >= this.TZ ) tj = this.TZ - 1;
		if ( ti < 0 || tj < 0 ) return NaN;
		const t = this.tileIndex[ tj * this.TX + ti ];
		if ( t < 0 ) return NaN;
		const li = gi - ti * TN, lj = gj - tj * TN;
		if ( li < 0 || lj < 0 || li > TN || lj > TN ) return NaN;
		return this.fine[ t * this.TS * this.TS + lj * this.TS + li ] * this.iq;
	}

	maskAt( gi, gj ) {
		const TN = this.TN;
		const ti = Math.floor( gi / TN ), tj = Math.floor( gj / TN );
		if ( ti < 0 || tj < 0 || ti >= this.TX || tj >= this.TZ ) return 0;
		const t = this.tileIndex[ tj * this.TX + ti ];
		if ( t < 0 ) return 0;
		return this.mask[ t * this.TS * this.TS + ( gj - tj * TN ) * this.TS + ( gi - ti * TN ) ];
	}

	hasFine( x, z ) {
		const ti = Math.floor( ( x - this.x0 ) / this.TILE ), tj = Math.floor( ( z - this.z0 ) / this.TILE );
		if ( ti < 0 || tj < 0 || ti >= this.TX || tj >= this.TZ ) return false;
		return this.tileIndex[ tj * this.TX + ti ] >= 0;
	}

	// ---- base height: Catmull-Rom over the 8 m grid where it exists, bilinear coarse elsewhere ------

	baseHeight( x, z ) {
		const fx = ( x - this.x0 ) / this.FS, fz = ( z - this.z0 ) / this.FS;
		const i = Math.floor( fx ), j = Math.floor( fz );
		const tx = fx - i, tz = fz - j;
		// the 4x4 neighbourhood; fall back to coarse if any sample is missing
		const s = _s;
		for ( let b = 0; b < 4; b ++ ) for ( let a = 0; a < 4; a ++ ) {
			const v = this.fineAt( i + a - 1, j + b - 1 );
			if ( v !== v ) return this.coarseBilinear( x, z );
			s[ b * 4 + a ] = v;
		}
		const r0 = cr( s[ 0 ], s[ 1 ], s[ 2 ], s[ 3 ], tx );
		const r1 = cr( s[ 4 ], s[ 5 ], s[ 6 ], s[ 7 ], tx );
		const r2 = cr( s[ 8 ], s[ 9 ], s[ 10 ], s[ 11 ], tx );
		const r3 = cr( s[ 12 ], s[ 13 ], s[ 14 ], s[ 15 ], tx );
		return cr( r0, r1, r2, r3, tz );
	}

	// 0 where the ground is built on (roads, streets, runways, building pads, city), 1 in the wild
	wildness( x, z ) {
		const fx = ( x - this.x0 ) / this.FS, fz = ( z - this.z0 ) / this.FS;
		const i = Math.floor( fx ), j = Math.floor( fz ), tx = fx - i, tz = fz - j;
		const M = FLAG.ROAD | FLAG.STREET | FLAG.RUNWAY | FLAG.BUILDING | FLAG.CITY | FLAG.DIRT;
		const w = ( a, b ) => ( this.maskAt( a, b ) & M ) ? 0 : 1;
		const a = w( i, j ) * ( 1 - tx ) + w( i + 1, j ) * tx;
		const b = w( i, j + 1 ) * ( 1 - tx ) + w( i + 1, j + 1 ) * tx;
		return a * ( 1 - tz ) + b * tz;
	}

	// the playable ground: base height plus a little procedural relief off the built-up areas
	heightAt( x, z ) {
		const h = this.baseHeight( x, z );
		if ( h < - 4 ) return h;
		const w = this.wildness( x, z );
		if ( w <= 0 ) return h;
		const shore = h < 0 ? 0.35 : Math.min( 1, 0.35 + h * 0.25 );
		return h + detail( x, z ) * w * shore;
	}

	normalAt( x, z, out, e = 1 ) {
		const hx = this.heightAt( x + e, z ) - this.heightAt( x - e, z );
		const hz = this.heightAt( x, z + e ) - this.heightAt( x, z - e );
		const nx = - hx, ny = 2 * e, nz = - hz;
		const l = Math.hypot( nx, ny, nz );
		out.x = nx / l; out.y = ny / l; out.z = nz / l;
		return out;
	}

	// ---- surface maps ------------------------------------------------------------------------------

	// [ moisture, lava, red soil, land use ] (0..1, 0..1, 0..1, code) bilinear from the 32 m map
	surfaceAt( x, z, out = [ 0, 0, 0, 0 ] ) {
		const fx = ( x - this.x0 ) / this.CS, fz = ( z - this.z0 ) / this.CS;
		let i = Math.floor( fx ), j = Math.floor( fz );
		const tx = fx - i, tz = fz - j;
		i = Math.max( 0, Math.min( this.cnx - 2, i ) ); j = Math.max( 0, Math.min( this.cnz - 2, j ) );
		const S = this.surf, n = this.cnx;
		for ( let c = 0; c < 3; c ++ ) {
			const a = S[ ( j * n + i ) * 4 + c ] * ( 1 - tx ) + S[ ( j * n + i + 1 ) * 4 + c ] * tx;
			const b = S[ ( ( j + 1 ) * n + i ) * 4 + c ] * ( 1 - tx ) + S[ ( ( j + 1 ) * n + i + 1 ) * 4 + c ] * tx;
			out[ c ] = ( a * ( 1 - tz ) + b * tz ) / 255;
		}
		out[ 3 ] = S[ ( Math.round( fz ) * n + Math.round( fx ) ) * 4 + 3 ] || 0;
		return out;
	}

	// fraction of the four nearest fine samples carrying a flag
	flagAt( x, z, bit ) {
		const fx = ( x - this.x0 ) / this.FS, fz = ( z - this.z0 ) / this.FS;
		const i = Math.floor( fx ), j = Math.floor( fz ), tx = fx - i, tz = fz - j;
		const w = ( a, b ) => ( this.maskAt( a, b ) & bit ) ? 1 : 0;
		const a = w( i, j ) * ( 1 - tx ) + w( i + 1, j ) * tx;
		const b = w( i, j + 1 ) * ( 1 - tx ) + w( i + 1, j + 1 ) * tx;
		return a * ( 1 - tz ) + b * tz;
	}

	flagsNear( x, z ) {
		return this.maskAt( Math.round( ( x - this.x0 ) / this.FS ), Math.round( ( z - this.z0 ) / this.FS ) );
	}

	islandAt( x, z ) {
		const i = Math.round( ( x - this.x0 ) / this.CS ), j = Math.round( ( z - this.z0 ) / this.CS );
		if ( i < 0 || j < 0 || i >= this.cnx || j >= this.cnz ) return 0;
		return this.island[ j * this.cnx + i ];
	}

	// ---- min / max pyramid over the coarse grid (culling the quadtree, far LOD) ----------------------

	_buildMinMax() {
		const levels = [];
		let w = this.cnx, h = this.cnz;
		let mn = new Float32Array( w * h ), mx = new Float32Array( w * h );
		for ( let i = 0; i < w * h; i ++ ) { mn[ i ] = mx[ i ] = this.coarse[ i ] * this.iq; }
		levels.push( { w, h, mn, mx, cell: this.CS } );
		while ( w > 1 || h > 1 ) {
			const nw = Math.ceil( w / 2 ), nh = Math.ceil( h / 2 );
			const nmn = new Float32Array( nw * nh ), nmx = new Float32Array( nw * nh );
			for ( let j = 0; j < nh; j ++ ) for ( let i = 0; i < nw; i ++ ) {
				let a = Infinity, b = - Infinity;
				for ( let dj = 0; dj < 2; dj ++ ) for ( let di = 0; di < 2; di ++ ) {
					const si = Math.min( w - 1, i * 2 + di ), sj = Math.min( h - 1, j * 2 + dj );
					a = Math.min( a, mn[ sj * w + si ] ); b = Math.max( b, mx[ sj * w + si ] );
				}
				nmn[ j * nw + i ] = a; nmx[ j * nw + i ] = b;
			}
			w = nw; h = nh; mn = nmn; mx = nmx;
			levels.push( { w, h, mn, mx, cell: levels[ levels.length - 1 ].cell * 2 } );
		}
		this.pyr = levels;
	}

	// conservative min / max height over a square (x0, z0, size)
	rangeOver( x0, z0, size ) {
		let L = 0;
		while ( L < this.pyr.length - 1 && this.pyr[ L ].cell * 2 < size ) L ++;
		const lv = this.pyr[ L ];
		const i0 = Math.max( 0, Math.floor( ( x0 - this.x0 ) / lv.cell ) - 1 ), i1 = Math.min( lv.w - 1, Math.floor( ( x0 + size - this.x0 ) / lv.cell ) + 1 );
		const j0 = Math.max( 0, Math.floor( ( z0 - this.z0 ) / lv.cell ) - 1 ), j1 = Math.min( lv.h - 1, Math.floor( ( z0 + size - this.z0 ) / lv.cell ) + 1 );
		let a = Infinity, b = - Infinity;
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) { a = Math.min( a, lv.mn[ j * lv.w + i ] ); b = Math.max( b, lv.mx[ j * lv.w + i ] ); }
		if ( a === Infinity ) return [ - 1000, - 1000 ];
		return [ a - 2, b + 2 ];
	}

	// ---- ray march against the ground (bullets, line of sight, picking) ---------------------------------

	raycast( ox, oy, oz, dx, dy, dz, maxDist, step = 1.5 ) {
		let prevT = 0, prevD = oy - this.heightAt( ox, oz );
		if ( prevD < 0 ) return 0;
		for ( let t = step; t <= maxDist + step; t += step ) {
			const tt = Math.min( t, maxDist );
			const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
			const d = y - this.heightAt( x, z );
			if ( d < 0 ) {
				// refine by bisection
				let a = prevT, b = tt;
				for ( let k = 0; k < 8; k ++ ) {
					const m = ( a + b ) / 2;
					if ( oy + dy * m - this.heightAt( ox + dx * m, oz + dz * m ) < 0 ) b = m; else a = m;
				}
				return ( a + b ) / 2;
			}
			prevT = tt; prevD = d;
			if ( tt >= maxDist ) break;
			// grow the step with distance, never skipping more than the clearance allows
			step = Math.max( 0.5, Math.min( 8, d * 0.5 ) );
		}
		return - 1;
	}
}

const _s = new Float64Array( 16 );

function cr( p0, p1, p2, p3, t ) {
	const t2 = t * t, t3 = t2 * t;
	return 0.5 * ( 2 * p1 + ( - p0 + p2 ) * t + ( 2 * p0 - 5 * p1 + 4 * p2 - p3 ) * t2 + ( - p0 + 3 * p1 - 3 * p2 + p3 ) * t3 );
}

function undelta( a, w ) {
	const rows = a.length / w;
	for ( let r = 0; r < rows; r ++ ) {
		let p = 0;
		const o = r * w;
		for ( let c = 0; c < w; c ++ ) { p = ( p + a[ o + c ] ) << 16 >> 16; a[ o + c ] = p; }
	}
}

// ---- noise ------------------------------------------------------------------------------------------

export function hash2( i, j, s = 0 ) {
	let n = Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) + Math.imul( s, 1442695041 );
	n = Math.imul( n ^ ( n >>> 13 ), 1274126177 );
	return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296;
}

export function vnoise( x, z, s = 0 ) {
	const i = Math.floor( x ), j = Math.floor( z ), fx = x - i, fz = z - j;
	const u = fx * fx * ( 3 - 2 * fx ), v = fz * fz * ( 3 - 2 * fz );
	const a = hash2( i, j, s ) * ( 1 - u ) + hash2( i + 1, j, s ) * u;
	const b = hash2( i, j + 1, s ) * ( 1 - u ) + hash2( i + 1, j + 1, s ) * u;
	return a * ( 1 - v ) + b * v;
}

// small-scale relief on the wild ground (m)
export function detail( x, z ) {
	return ( vnoise( x / 23, z / 23, 3 ) - 0.5 ) * 1.1 + ( vnoise( x / 9.3, z / 9.3, 5 ) - 0.5 ) * 0.35;
}
