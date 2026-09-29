// Island labels, rainfall, lava flows, red soil and land use on the coarse grid.
import { Grid, CS, smoothstep, mulberry32, fbm } from './grid.mjs';
import { lonLatToWorld } from './geo.mjs';
import { ISLANDS, VENTS, LANDUSE } from './places.mjs';

export function buildCoarse( fine ) {
	const c = new Grid( CS );
	const k = CS / fine.s;
	for ( let j = 0; j < c.nz; j ++ ) for ( let i = 0; i < c.nx; i ++ ) {
		// small box filter so the coarse grid is a faithful low-pass of the fine one
		let s = 0, n = 0;
		for ( let b = - 1; b <= 1; b ++ ) for ( let a = - 1; a <= 1; a ++ ) { s += fine.get( i * k + a * 2, j * k + b * 2 ); n ++; }
		c.h[ c.idx( i, j ) ] = s / n;
	}
	return c;
}

export function labelIslands( coarse ) {
	const lab = new Uint8Array( coarse.nx * coarse.nz );
	for ( const isl of ISLANDS ) {
		const [ x, z ] = lonLatToWorld( isl.lon, isl.lat );
		let si = Math.round( ( x - coarse.x0 ) / coarse.s ), sj = Math.round( ( z - coarse.z0 ) / coarse.s );
		// walk to the nearest land if the label point is off the coast
		let best = null;
		for ( let r = 0; r < 60 && ! best; r ++ ) for ( let b = - r; b <= r && ! best; b ++ ) for ( let a = - r; a <= r; a ++ ) {
			if ( coarse.get( si + a, sj + b ) > 2 ) { best = [ si + a, sj + b ]; break; }
		}
		if ( ! best ) continue;
		const stack = [ best ];
		while ( stack.length ) {
			const [ i, j ] = stack.pop();
			if ( i < 0 || j < 0 || i >= coarse.nx || j >= coarse.nz ) continue;
			const id = coarse.idx( i, j );
			if ( lab[ id ] || coarse.h[ id ] < - 3 ) continue; // include the fringe just under the waterline
			lab[ id ] = isl.id;
			stack.push( [ i + 1, j ], [ i - 1, j ], [ i, j + 1 ], [ i, j - 1 ] );
		}
	}
	// grow labels into the surrounding ocean so every cell knows its nearest island (for the map and spawns)
	return lab;
}

// trade winds blow from the east-north-east
const SRC = ( () => { const a = 62 * Math.PI / 180; return [ Math.sin( a ), - Math.cos( a ) ]; } )();

export function buildSurface( coarse, islands ) {
	const N = coarse.nx * coarse.nz;
	const moist = new Float32Array( N ), lava = new Float32Array( N ), red = new Float32Array( N ), use = new Uint8Array( N );
	const age = {};
	for ( const i of ISLANDS ) age[ i.id ] = i.age;
	// rainfall: orographic lift on windward slopes, a rain shadow behind high ground and the trade-wind
	// inversion that leaves the high summits of Maui and Hawaiʻi dry
	for ( let j = 0; j < coarse.nz; j ++ ) for ( let i = 0; i < coarse.nx; i ++ ) {
		const id = coarse.idx( i, j ), h = coarse.h[ id ];
		if ( h < - 2 ) continue;
		const x = coarse.xOf( i ), z = coarse.zOf( j );
		const up = coarse.sample( x + SRC[ 0 ] * 700, z + SRC[ 1 ] * 700 );
		const lift = ( h - Math.max( up, 0 ) ) / 700;
		let shadow = 0;
		for ( let d = 250; d < 14000; d += 125 ) {
			const hu = coarse.sample( x + SRC[ 0 ] * d, z + SRC[ 1 ] * d );
			shadow = Math.max( shadow, ( hu - h ) * Math.exp( - d / 5000 ) );
		}
		const belt = smoothstep( 20, 140, h ) * ( 1 - smoothstep( 260, 420, h ) ) * 0.35;
		const inversion = smoothstep( 330, 520, h ) * 0.55;
		let m = 0.38 + 3.2 * Math.max( - 0.08, Math.min( 0.22, lift ) ) - 0.0045 * shadow + belt - inversion;
		m += ( fbm( x / 2500, z / 2500, 3, 7 ) - 0.5 ) * 0.18;
		moist[ id ] = Math.min( 1, Math.max( 0, m ) );
	}
	blur( moist, coarse.nx, coarse.nz, 4 );

	// lava flows traced downhill from the vents, wandering on a noise field
	const rnd = mulberry32( 1234 );
	for ( const v of VENTS ) {
		const [ vx, vz ] = lonLatToWorld( v.lon, v.lat );
		for ( let f = 0; f < v.count; f ++ ) {
			const seed = Math.floor( rnd() * 1e6 );
			let x = vx + ( rnd() - 0.5 ) * 600, z = vz + ( rnd() - 0.5 ) * 600;
			let dist = 0;
			const maxLen = ( 3000 + rnd() * 7000 ) * v.len;
			while ( dist < maxLen ) {
				const h = coarse.sample( x, z );
				if ( h < 0.5 ) break;
				// steepest descent on a perturbed surface
				let best = null, bh = Infinity;
				for ( let k = 0; k < 16; k ++ ) {
					const a = k / 16 * Math.PI * 2, px = x + Math.cos( a ) * 48, pz = z + Math.sin( a ) * 48;
					const ph = coarse.sample( px, pz ) + ( fbm( px / 700, pz / 700, 3, seed ) - 0.5 ) * 9;
					if ( ph < bh ) { bh = ph; best = [ px, pz ]; }
				}
				x = best[ 0 ]; z = best[ 1 ]; dist += 48;
				const w = v.width * ( 22 + dist * 0.012 ) * ( 0.5 + fbm( x / 300, z / 300, 3, seed + 3 ) * 1.1 );
				stamp( lava, coarse, x, z, w, 1 - v.age * 0.8 );
			}
		}
	}
	blur( lava, coarse.nx, coarse.nz, 1 );

	for ( let j = 0; j < coarse.nz; j ++ ) for ( let i = 0; i < coarse.nx; i ++ ) {
		const id = coarse.idx( i, j ), h = coarse.h[ id ];
		if ( h < - 2 ) continue;
		const isl = islands[ id ];
		const a = isl ? age[ isl ] : 0.3;
		const x = coarse.xOf( i ), z = coarse.zOf( j );
		// weathered red soil: old islands, dry to middling rainfall, off the beach
		const dry = 1 - smoothstep( 0.35, 0.75, moist[ id ] );
		const n = fbm( x / 900, z / 900, 3, 11 );
		red[ id ] = Math.min( 1, a * dry * smoothstep( 4, 30, h ) * ( 0.4 + n * 1.2 ) );
		// young lava islands: bare rock where it is dry and high even without a traced flow
		if ( a < 0.3 ) lava[ id ] = Math.max( lava[ id ], smoothstep( 0.3, 0.05, moist[ id ] ) * smoothstep( 150, 380, h ) * 0.75 * ( 0.6 + n * 0.8 ) );
	}
	for ( const lu of LANDUSE ) {
		const [ lx, lz ] = lonLatToWorld( lu.lon, lu.lat );
		const r = lu.r;
		const i0 = Math.floor( ( lx - r - coarse.x0 ) / CS ), i1 = Math.ceil( ( lx + r - coarse.x0 ) / CS );
		const j0 = Math.floor( ( lz - r - coarse.z0 ) / CS ), j1 = Math.ceil( ( lz + r - coarse.z0 ) / CS );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
			if ( i < 0 || j < 0 || i >= coarse.nx || j >= coarse.nz ) continue;
			const id = coarse.idx( i, j ), x = coarse.xOf( i ), z = coarse.zOf( j );
			const d = Math.hypot( x - lx, z - lz ) / r;
			if ( d + ( fbm( x / 300, z / 300, 2, 5 ) - 0.5 ) * 0.5 > 1 ) continue;
			if ( coarse.h[ id ] < 3 || lava[ id ] > 0.3 ) continue;
			// fields only where it is gentle
			const sl = Math.abs( coarse.get( i + 1, j ) - coarse.get( i - 1, j ) ) + Math.abs( coarse.get( i, j + 1 ) - coarse.get( i, j - 1 ) );
			if ( sl / ( 2 * CS ) > 0.12 ) continue;
			use[ id ] = lu.use;
		}
	}
	return { moist, lava, red, use };
}

function stamp( arr, g, x, z, r, v ) {
	const i0 = Math.floor( ( x - r - g.x0 ) / g.s ), i1 = Math.ceil( ( x + r - g.x0 ) / g.s );
	const j0 = Math.floor( ( z - r - g.z0 ) / g.s ), j1 = Math.ceil( ( z + r - g.z0 ) / g.s );
	for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
		if ( i < 0 || j < 0 || i >= g.nx || j >= g.nz ) continue;
		const d = Math.hypot( g.xOf( i ) - x, g.zOf( j ) - z );
		if ( d > r ) continue;
		const w = v * smoothstep( r, r * 0.6, d );
		const id = g.idx( i, j );
		if ( w > arr[ id ] ) arr[ id ] = w;
	}
}

export function blur( a, nx, nz, iters ) {
	const t = new Float32Array( a.length );
	for ( let it = 0; it < iters; it ++ ) {
		for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {
			const l = i > 0 ? i - 1 : i, r = i < nx - 1 ? i + 1 : i;
			t[ j * nx + i ] = ( a[ j * nx + l ] + 2 * a[ j * nx + i ] + a[ j * nx + r ] ) * 0.25;
		}
		for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {
			const u = j > 0 ? j - 1 : j, d = j < nz - 1 ? j + 1 : j;
			a[ j * nx + i ] = ( t[ u * nx + i ] + 2 * t[ j * nx + i ] + t[ d * nx + i ] ) * 0.25;
		}
	}
}
