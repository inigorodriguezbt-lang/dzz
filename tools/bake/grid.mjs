// The working height grid: one Float32 sample every FS metres over the whole world.
import { WORLD_HALF_X, WORLD_HALF_Z } from './geo.mjs';

export const FS = 8; // fine spacing (m)
export const CS = 32; // coarse spacing (m)
export const TILE = 1024; // fine tile size (m)
export const TILE_N = TILE / FS; // cells per tile side (128); samples = TILE_N + 1

export class Grid {
	constructor( spacing = FS ) {
		this.s = spacing;
		this.x0 = - WORLD_HALF_X;
		this.z0 = - WORLD_HALF_Z;
		this.nx = Math.ceil( WORLD_HALF_X * 2 / spacing ) + 1;
		this.nz = Math.ceil( WORLD_HALF_Z * 2 / spacing ) + 1;
		this.h = new Float32Array( this.nx * this.nz );
	}
	idx( i, j ) { return j * this.nx + i; }
	xOf( i ) { return this.x0 + i * this.s; }
	zOf( j ) { return this.z0 + j * this.s; }
	get( i, j ) {
		i = i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
		j = j < 0 ? 0 : j >= this.nz ? this.nz - 1 : j;
		return this.h[ j * this.nx + i ];
	}
	sample( x, z ) {
		const fx = ( x - this.x0 ) / this.s, fz = ( z - this.z0 ) / this.s;
		const i = Math.floor( fx ), j = Math.floor( fz );
		const tx = fx - i, tz = fz - j;
		const a = this.get( i, j ) + ( this.get( i + 1, j ) - this.get( i, j ) ) * tx;
		const b = this.get( i, j + 1 ) + ( this.get( i + 1, j + 1 ) - this.get( i, j + 1 ) ) * tx;
		return a + ( b - a ) * tz;
	}
	// average over a square of radius r (m)
	sampleAvg( x, z, r, n = 2 ) {
		let s = 0, c = 0;
		for ( let a = - n; a <= n; a ++ ) for ( let b = - n; b <= n; b ++ ) { s += this.sample( x + a * r / n, z + b * r / n ); c ++; }
		return s / c;
	}
}

export function smoothstep( a, b, x ) {
	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );
}

// deterministic PRNG
export function mulberry32( seed ) {
	let a = seed >>> 0;
	return function () {
		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

export function hashStr( s ) {
	let h = 2166136261;
	for ( let i = 0; i < s.length; i ++ ) { h ^= s.charCodeAt( i ); h = Math.imul( h, 16777619 ); }
	return h >>> 0;
}

// cheap value noise for shaping edges
export function vnoise( x, z, seed = 0 ) {
	const i = Math.floor( x ), j = Math.floor( z ), fx = x - i, fz = z - j;
	const h = ( a, b ) => {
		let n = Math.imul( a, 374761393 ) + Math.imul( b, 668265263 ) + Math.imul( seed, 1442695041 );
		n = Math.imul( n ^ ( n >>> 13 ), 1274126177 );
		return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296;
	};
	const u = fx * fx * ( 3 - 2 * fx ), v = fz * fz * ( 3 - 2 * fz );
	const a = h( i, j ) + ( h( i + 1, j ) - h( i, j ) ) * u;
	const b = h( i, j + 1 ) + ( h( i + 1, j + 1 ) - h( i, j + 1 ) ) * u;
	return a + ( b - a ) * v;
}

export function fbm( x, z, oct = 4, seed = 0 ) {
	let s = 0, a = 0.5, f = 1, n = 0;
	for ( let o = 0; o < oct; o ++ ) { s += a * vnoise( x * f, z * f, seed + o * 17 ); n += a; a *= 0.5; f *= 2.03; }
	return s / n;
}
