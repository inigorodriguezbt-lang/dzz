// Procedural plant models, built once at startup. Every plant is modelled in its own frame (base at the
// origin, +y up, nominal size); per-instance height, lean, yaw and tint are applied in the vertex shader.
// Each builder returns a BufferGeometry in the GeoBuilder layout; `lod` 0 is the full model, 1 the
// simplified mid-distance one.
//
// Ideas and the frond / crown construction follow Tidewater's PlantGeometry (MIT), rebuilt for the
// canvas leaf atlas and WebGL2.
import * as THREE from 'three';
import { GeoBuilder, PART, mulberry32, lin } from './GeoBuilder.js';
import { atlasUV } from './LeafTextures.js';
import { PALM_H } from './species.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const _uv = [ 0, 0 ];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const smooth = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };
const WHITE = atlasUV( 'WHITE', 0.5, 0.5, [ 0, 0 ] );

// ---- primitives ------------------------------------------------------------------------------------------

// Tube along a polyline (rotation-minimising frames). radius( f, angle ) with f = 0..1 along.
// o: { radial, part, veg( p, f ) -> vec4, ao( f ), col, texAround, texLen (m per texture repeat), cap }
function tube( b, pts, radius, o ) {
	const radial = o.radial;
	const start = b.count;
	const n = pts.length;
	let T = new THREE.Vector3().subVectors( pts[ 1 ], pts[ 0 ] ).normalize();
	let X = new THREE.Vector3().crossVectors( T, Math.abs( T.y ) < 0.95 ? UP : new THREE.Vector3( 1, 0, 0 ) ).normalize();
	let len = 0;
	const texAround = o.texAround ?? 1, texLen = o.texLen ?? 1.5;
	for ( let j = 0; j < n; j ++ ) {
		const f = j / ( n - 1 );
		if ( j > 0 ) len += pts[ j ].distanceTo( pts[ j - 1 ] );
		const Tn = new THREE.Vector3().subVectors( pts[ Math.min( n - 1, j + 1 ) ], pts[ Math.max( 0, j - 1 ) ] ).normalize();
		X.addScaledVector( Tn, - X.dot( Tn ) ).normalize();
		T = Tn;
		const Z = new THREE.Vector3().crossVectors( X, T ).normalize();
		for ( let i = 0; i <= radial; i ++ ) {
			const a = i / radial * Math.PI * 2;
			const nrm = _a.copy( X ).multiplyScalar( Math.cos( a ) ).addScaledVector( Z, Math.sin( a ) );
			const r = radius( f, a );
			const p = _b.copy( pts[ j ] ).addScaledVector( nrm, r );
			if ( o.fixedUV ) b.vertex( p, nrm, o.fixedUV[ 0 ], o.fixedUV[ 1 ], o.veg( p, f ), [ o.part, o.ao ? o.ao( f ) : 1, o.cr ?? 0.5, o.crown ?? 0 ], o.col );
			else b.vertex( p, nrm, i / radial * texAround, len / texLen, o.veg( p, f ), [ o.part, o.ao ? o.ao( f ) : 1, o.cr ?? 0.5, o.crown ?? 0 ], o.col );
		}
	}
	for ( let j = 0; j < n - 1; j ++ ) for ( let i = 0; i < radial; i ++ ) {
		const a = start + j * ( radial + 1 ) + i, c = a + radial + 1;
		b.quad( a, c, c + 1, a + 1 );
	}
	if ( o.cap ) {
		const top = pts[ n - 1 ];
		const t = b.vertex( top, T, o.fixedUV ? o.fixedUV[ 0 ] : 0.5, o.fixedUV ? o.fixedUV[ 1 ] : len / texLen, o.veg( top, 1 ), [ o.part, o.ao ? o.ao( 1 ) : 1, o.cr ?? 0.5, o.crown ?? 0 ], o.col );
		const ring = start + ( n - 1 ) * ( radial + 1 );
		for ( let i = 0; i < radial; i ++ ) b.tri( ring + i, t, ring + i + 1 );
	}
}

// quadratic Bezier sampled into points
function bezier( p0, c, p1, n ) {
	const out = [];
	for ( let k = 0; k <= n; k ++ ) {
		const t = k / n;
		out.push( new THREE.Vector3().copy( p0 ).multiplyScalar( ( 1 - t ) * ( 1 - t ) ).addScaledVector( c, 2 * ( 1 - t ) * t ).addScaledVector( p1, t * t ) );
	}
	return out;
}

// Pinnate frond / leaf: two wings hanging off a curved rachis; the atlas tile draws the leaflets
// (tile u across the wing, v along the frond). o: origin, azimuth, elevation, bend, twist, length, segs,
// cross, leafLen( s ), leafAngle( s ), droop( s ), curl, tile, veg: { u0 (trunk sway weight), flutter,
// phase }, mat: [ part, ao, cr, crown ], col, wings (default both)
function frond( b, o ) {
	const { origin, azimuth, elevation, bend, twist = 0, length, segs = 8, cross = 2, curl = 0.2, bendPow = 1.4, tile, minWidth = 0.03 } = o;
	const pts = [];
	const p = origin.clone();
	for ( let k = 0; k <= segs; k ++ ) {
		pts.push( p.clone() );
		const sm = ( k + 0.5 ) / segs;
		const el = elevation - bend * Math.pow( sm, bendPow );
		const az = azimuth + twist * sm;
		_a.set( Math.cos( el ) * Math.cos( az ), Math.sin( el ), Math.cos( el ) * Math.sin( az ) );
		p.addScaledVector( _a, length / segs );
	}
	const azPerp = new THREE.Vector3( - Math.sin( azimuth ), 0, Math.cos( azimuth ) );
	const T = new THREE.Vector3(), S = new THREE.Vector3(), N = new THREE.Vector3(), side = new THREE.Vector3(), ld = new THREE.Vector3();
	for ( const sigma of o.wings || [ - 1, 1 ] ) {
		const grid = [];
		for ( let k = 0; k <= segs; k ++ ) {
			const s = k / segs;
			T.subVectors( pts[ Math.min( segs, k + 1 ) ], pts[ Math.max( 0, k - 1 ) ] ).normalize();
			S.crossVectors( T, UP );
			if ( S.lengthSq() < 0.04 ) S.copy( azPerp );
			S.normalize();
			N.crossVectors( S, T ).normalize();
			const Ll = Math.max( o.leafLen( s ), minWidth );
			const al = o.leafAngle( s ), be = o.droop( s );
			side.copy( S ).multiplyScalar( sigma * Math.cos( be ) ).addScaledVector( N, - Math.sin( be ) );
			ld.copy( T ).multiplyScalar( Math.cos( al ) ).addScaledVector( side, Math.sin( al ) ).normalize();
			const row = [];
			for ( let j = 0; j <= cross; j ++ ) {
				const t = j / cross;
				const q = pts[ k ].clone().addScaledVector( ld, Ll * t ).addScaledVector( N, - Ll * curl * t * t );
				row.push( { q, s, t, nup: N.clone() } );
			}
			grid.push( row );
		}
		const ids = [];
		for ( let k = 0; k <= segs; k ++ ) {
			const r = [];
			for ( let j = 0; j <= cross; j ++ ) {
				const g = grid[ k ][ j ];
				_b.subVectors( grid[ Math.min( segs, k + 1 ) ][ j ].q, grid[ Math.max( 0, k - 1 ) ][ j ].q );
				_c.subVectors( grid[ k ][ Math.min( cross, j + 1 ) ].q, grid[ k ][ Math.max( 0, j - 1 ) ].q );
				_d.crossVectors( _b, _c );
				if ( _d.lengthSq() < 1e-12 ) _d.copy( g.nup );
				_d.normalize();
				if ( _d.dot( g.nup ) < 0 ) _d.negate();
				// normals lean up a little: fronds are lit like a canopy, not like flat planes
				_d.lerp( UP, 0.25 ).normalize();
				atlasUV( tile, g.t, g.s, _uv );
				const fl = g.t * smooth( 0.05, 0.3, g.s ) * ( o.veg.flutter ?? 1 );
				r.push( b.vertex( g.q, _d, _uv[ 0 ], _uv[ 1 ], [ o.veg.u0 ?? 1, g.s, fl, o.veg.phase ?? 0 ], o.mat, o.col ) );
			}
			ids.push( r );
		}
		for ( let k = 0; k < segs; k ++ ) for ( let j = 0; j < cross; j ++ ) {
			const a = ids[ k ][ j ], bb = ids[ k + 1 ][ j ], c = ids[ k + 1 ][ j + 1 ], d = ids[ k ][ j + 1 ];
			if ( sigma > 0 ) b.quad( a, d, c, bb ); else b.quad( a, bb, c, d );
		}
	}
	return pts;
}

// ellipsoid from a subdivided icosahedron (coconuts, fruit, rocks); `disp( dir )` scales the radius
function blob( b, center, radii, detail, o, disp = null ) {
	const g = new THREE.IcosahedronGeometry( 1, detail );
	const pa = g.attributes.position;
	const map = new Map();
	const idx = [];
	for ( let i = 0; i < pa.count; i ++ ) {
		_a.fromBufferAttribute( pa, i );
		const key = _a.x.toFixed( 4 ) + ',' + _a.y.toFixed( 4 ) + ',' + _a.z.toFixed( 4 );
		let v = map.get( key );
		if ( v === undefined ) {
			const k = disp ? disp( _a ) : 1;
			_b.copy( _a ).multiplyScalar( k ).multiply( radii ).add( center );
			_c.copy( _a ).divide( radii ).normalize();
			const u = o.uvScale ? ( Math.atan2( _a.z, _a.x ) / ( Math.PI * 2 ) + 0.5 ) * o.uvScale : WHITE[ 0 ];
			const vv = o.uvScale ? ( _a.y * 0.5 + 0.5 ) * o.uvScale * 0.6 : WHITE[ 1 ];
			v = b.vertex( _b, _c, u, vv, o.veg ? o.veg( _b ) : [ 1, 0, 0, 0 ], [ o.part, o.ao ? o.ao( _a ) : 1, o.cr ?? 0.5, o.crown ?? 0 ], o.col );
			map.set( key, v );
		}
		idx.push( v );
	}
	for ( let i = 0; i < idx.length; i += 3 ) b.tri( idx[ i ], idx[ i + 1 ], idx[ i + 2 ] );
	g.dispose();
}

// Leaf-cluster card: a quad facing `normal`, rotated by `spin`. Normals bend outward from the clump
// and the crown centre (volumetric shading); aMat.y = exposure (inner leaves darker).
function card( b, o ) {
	const n = o.normal.clone().normalize();
	const tmp = Math.abs( n.y ) < 0.95 ? UP : new THREE.Vector3( 1, 0, 0 );
	const X = new THREE.Vector3().crossVectors( tmp, n ).normalize();
	const Y = new THREE.Vector3().crossVectors( n, X ).normalize();
	const cs = Math.cos( o.spin ), sn = Math.sin( o.spin );
	const Xr = X.clone().multiplyScalar( cs ).addScaledVector( Y, sn );
	const Yr = Y.clone().multiplyScalar( cs ).addScaledVector( X, - sn );
	const w = o.w ?? o.size, h = o.h ?? o.size;
	const ids = [];
	for ( const [ x, y, u, v ] of [ [ - 0.5, - 0.5, 0, 1 ], [ 0.5, - 0.5, 1, 1 ], [ 0.5, 0.5, 1, 0 ], [ - 0.5, 0.5, 0, 0 ] ] ) {
		const p = o.center.clone().addScaledVector( Xr, x * w ).addScaledVector( Yr, y * h );
		const dl = o.clumpC ? p.clone().sub( o.clumpC ).divideScalar( o.clumpR ) : p.clone().sub( o.lobeC ).divideScalar( o.lobeR );
		const dc = p.clone().sub( o.crownC ).divide( o.crownR );
		const nn = dl.clone().normalize().multiplyScalar( 0.45 ).addScaledVector( dc.clone().normalize(), 0.45 ).addScaledVector( n, 0.15 ).addScaledVector( UP, 0.15 ).normalize();
		const ext = Math.min( 1, 0.45 * Math.min( 1, dl.length() ) + 0.4 * Math.min( 1, dc.length() ) + 0.3 * Math.max( 0, dc.y ) );
		atlasUV( o.tile, o.u0 + u * ( o.u1 - o.u0 ), o.v0 + v * ( o.v1 - o.v0 ), _uv );
		const hf = Math.max( 0, p.y / o.H );
		ids.push( b.vertex( p, nn, _uv[ 0 ], _uv[ 1 ], [ hf, o.flex( p ), 1, o.phase ], [ PART.LEAF, 0.25 + 0.75 * ext * ext, o.cr, 0 ], o.col ) );
	}
	b.quad( ids[ 0 ], ids[ 1 ], ids[ 2 ], ids[ 3 ] );
}

// Clumps of crossing cards filling a lobe [ x, y, z, R ] (random directions biased outward / up)
function lobeClumps( b, lobe, o, rand ) {
	const lobeC = new THREE.Vector3( lobe[ 0 ], lobe[ 1 ], lobe[ 2 ] );
	const R = lobe[ 3 ];
	const clumps = Math.max( 1, Math.round( o.clumpsPerR * R ) );
	const specs = [];
	for ( let k = 0; k < clumps; k ++ ) {
		let x, y, z;
		do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; } while ( x * x + y * y + z * z > 1 || y < - 0.6 );
		const l = Math.hypot( x, y, z ) || 1;
		const reach = 0.3 + 0.7 * Math.sqrt( rand() );
		const c = new THREE.Vector3( x / l, y / l * ( o.flatten ?? 0.7 ), z / l ).multiplyScalar( reach * R * 0.85 ).add( lobeC );
		const rc = o.clumpR * ( 0.65 + rand() * 0.7 );
		const out = c.clone().sub( lobeC ).normalize();
		for ( let j = 0; j < o.cardsPer; j ++ ) {
			const dir = new THREE.Vector3( rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1 ).normalize().addScaledVector( out, 0.9 ).addScaledVector( UP, o.upBias ?? 0.55 ).normalize();
			if ( o.hang ) dir.y *= 0.25; // hanging cards (needles) stand upright
			const center = c.clone().addScaledVector( dir, rc * ( 0.1 + 0.3 * rand() ) ).add( new THREE.Vector3( rand() - 0.5, ( rand() - 0.5 ) * 0.6, rand() - 0.5 ).multiplyScalar( rc * 0.5 ) );
			specs.push( { center, size: o.size * rc / o.clumpR * ( 0.8 + rand() * 0.4 ), normal: dir, spin: o.hang ? ( rand() - 0.5 ) * 0.4 : rand() * 6.283, lobeC, lobeR: R, clumpC: c, clumpR: rc } );
		}
	}
	return specs;
}

// ---- coconut palm -----------------------------------------------------------------------------------------

const palmRadius = ( u ) => {
	const y = u * PALM_H;
	let r = 0.14 + 0.045 * ( 1 - u ) + 0.2 * Math.exp( - Math.max( y, 0 ) / 0.45 );
	r *= 1 + 0.04 * Math.sin( y * 1.7 ) * ( 1 - u );
	r += 0.07 * smooth( 0.955, 0.99, u ) - 0.1 * smooth( 0.995, 1.02, u ); // leaf-base boot
	return r;
};

function palmFronds( rand, count ) {
	const list = [];
	for ( let i = 0; i < count; i ++ ) {
		const a = count > 1 ? i / ( count - 1 ) : 0.5; // 0 youngest .. 1 oldest
		const dead = i >= count - 1 && count > 10;
		const len = ( 3.9 + 1.4 * smooth( 0, 0.45, a ) ) * ( 0.9 + 0.2 * rand() );
		list.push( {
			a, dead, k: i,
			azimuth: i * 2.39996 + ( rand() - 0.5 ) * 0.35,
			elevation: dead ? - 1.25 : 1.05 - 1.45 * Math.pow( a, 0.8 ) + ( rand() - 0.5 ) * 0.25,
			bend: dead ? 0.15 : 0.6 + 0.85 * a + rand() * 0.3,
			twist: ( rand() - 0.5 ) * 0.3,
			length: dead ? len * 0.85 : len,
			attachY: 0.3 - 0.45 * a,
			phase: rand(),
		} );
	}
	return list;
}

export function buildPalm( lod = 0, seed = 11 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const H = PALM_H;
	// trunk: the vertex shader maps u (aVeg.x) to the instance height, bends it and moves the crown
	const rows = lod === 0 ? [ - 0.03, 0, 0.015, 0.04, 0.08, 0.14, 0.22, 0.32, 0.43, 0.54, 0.65, 0.76, 0.86, 0.94, 0.975, 0.992, 1.005 ] : [ - 0.03, 0.03, 0.2, 0.5, 0.8, 1.0 ];
	const radial = lod === 0 ? 10 : 5;
	const start = b.count;
	for ( const u of rows ) {
		const r = palmRadius( u );
		const dr = ( palmRadius( u + 0.01 ) - palmRadius( u - 0.01 ) ) / ( 0.02 * H );
		for ( let i = 0; i <= radial; i ++ ) {
			const a = i / radial * Math.PI * 2;
			_a.set( Math.cos( a ) * r, u * H, Math.sin( a ) * r );
			_b.set( Math.cos( a ), - dr, Math.sin( a ) ).normalize();
			// uv.y: height fraction; the shader scales it by the trunk length for the ring texture
			b.vertex( _a, _b, i / radial * 2, u, [ u, 0, 0, 0 ], [ PART.PALMBARK, 0.55 + 0.45 * smooth( 0, 0.2, u ) * ( 1 - 0.5 * smooth( 0.9, 1, u ) ), 0.5, 0 ], [ 1, 1, 1 ] );
		}
	}
	for ( let j = 0; j < rows.length - 1; j ++ ) for ( let i = 0; i < radial; i ++ ) {
		const a = start + j * ( radial + 1 ) + i, c = a + radial + 1;
		b.quad( a, c, c + 1, a + 1 );
	}
	// crown: coconuts under the fronds (crown id 20 is never hidden per instance)
	const nuts = lod === 0 ? 7 : 3;
	for ( let i = 0; i < nuts; i ++ ) {
		const az = i * 2.39996 + rand() * 0.5;
		const rr = 0.2 + rand() * 0.12;
		const c = new THREE.Vector3( Math.cos( az ) * rr, H - 0.3 - rand() * 0.4, Math.sin( az ) * rr );
		const s = 0.12 + rand() * 0.035;
		const ripe = rand();
		const col = ripe < 0.6 ? lin( 0x6f7f2a ) : ripe < 0.85 ? lin( 0xa08a30 ) : lin( 0x6a4a26 );
		blob( b, c, new THREE.Vector3( s, s * 1.12, s ), lod === 0 ? 1 : 0, { part: PART.SOLID, crown: 20, col, ao: () => 0.6 } );
	}
	const fronds = palmFronds( rand, 15 );
	const use = lod === 0 ? fronds : fronds.filter( ( f, i ) => i % 3 !== 1 );
	for ( const f of use ) {
		const origin = new THREE.Vector3( Math.cos( f.azimuth ) * 0.14, H + f.attachY, Math.sin( f.azimuth ) * 0.14 );
		const Lf = f.length;
		// colour by age: young fronds a fresh yellow-green, old ones yellowing, the dead one brown
		const col = f.dead ? lin( 0x8a7048 ) : [ 1 + 0.12 * ( 1 - f.a ) - 0.05, 1.02, 0.85 + 0.1 * f.a ].map( ( v, q ) => v * ( q === 2 ? 1 - 0.25 * smooth( 0.75, 1, f.a ) : 1 ) );
		frond( b, {
			origin, azimuth: f.azimuth, elevation: f.elevation, bend: f.bend, twist: f.twist, length: Lf,
			segs: lod === 0 ? 9 : 4, cross: lod === 0 ? 2 : 1, tile: 'FROND',
			leafLen: ( s ) => ( lod === 0 ? 1 : 1.1 ) * 0.2 * Lf * ( smooth( 0.03, 0.22, s ) * ( 1 - 0.6 * smooth( 0.35, 1.0, s ) ) ),
			leafAngle: ( s ) => 1.05 - 0.4 * s,
			droop: ( s ) => ( f.dead ? 1.25 : 0.45 + 0.5 * f.a ) + 0.32 * s,
			curl: f.dead ? 0.1 : 0.22, minWidth: 0.05,
			veg: { u0: 1, flutter: f.dead ? 0.3 : 1, phase: f.phase },
			mat: [ PART.LEAF, 0.55 + 0.45 * ( 1 - f.a ), rand(), 1 + f.k ], col,
		} );
	}
	return b.build();
}

// ---- broadleaf trees ---------------------------------------------------------------------------------------

// Species crowns: lobes generated from a few shape parameters (seeded, so every variant is stable)
function crownLobes( kind, rand ) {
	const L = [];
	if ( kind === 'monkeypod' ) {
		// wide umbrella: a ring of flattened lobes on long spreading limbs and a few on top
		const n = 9;
		for ( let i = 0; i < n; i ++ ) {
			const a = i / n * Math.PI * 2 + ( rand() - 0.5 ) * 0.4;
			const r = 5.2 + rand() * 3.2;
			L.push( [ Math.cos( a ) * r, 9.2 + rand() * 1.6 - ( r - 5 ) * 0.25, Math.sin( a ) * r, 2.7 + rand() * 0.9 ] );
		}
		for ( let i = 0; i < 4; i ++ ) { const a = rand() * 6.28, r = rand() * 2.5; L.push( [ Math.cos( a ) * r, 11.2 + rand() * 1.2, Math.sin( a ) * r, 2.9 + rand() * 0.6 ] ); }
		return { lobes: L, fork: 2.8, H: 13, crownC: [ 0, 10, 0 ], crownR: [ 9, 3, 9 ], flatten: 0.5, limbR: 0.22, trunkR: 0.5 };
	}
	if ( kind === 'kukui' ) {
		for ( let i = 0; i < 9; i ++ ) {
			const a = i * 2.39996 + rand() * 0.5, e = ( rand() - 0.35 ) * 1.4;
			const r = 3.4 + rand() * 1.2;
			L.push( [ Math.cos( a ) * Math.cos( e ) * r, 9.2 + Math.sin( e ) * r * 0.9, Math.sin( a ) * Math.cos( e ) * r, 2.2 + rand() * 0.8 ] );
		}
		L.push( [ 0, 12, 0, 2.4 ] );
		return { lobes: L, fork: 4, H: 13.5, crownC: [ 0, 9.5, 0 ], crownR: [ 5, 3.8, 5 ], flatten: 0.72, limbR: 0.16, trunkR: 0.3 };
	}
	if ( kind === 'ohia' ) {
		// irregular: clumps at different heights, gaps between them
		for ( let i = 0; i < 10; i ++ ) {
			const a = i * 2.39996 + rand() * 0.8;
			const r = 0.8 + rand() * 3.3;
			L.push( [ Math.cos( a ) * r, 5.2 + rand() * 6.2, Math.sin( a ) * r, 1.4 + rand() * 1.0 ] );
		}
		L.push( [ 0.3, 11.5, - 0.2, 1.7 ] );
		return { lobes: L, fork: 3.2, H: 12.5, crownC: [ 0, 8.5, 0 ], crownR: [ 4, 3.8, 4 ], flatten: 0.8, limbR: 0.12, trunkR: 0.26 };
	}
	if ( kind === 'kiawe' ) {
		for ( let i = 0; i < 9; i ++ ) {
			const a = i / 9 * Math.PI * 2 + rand() * 0.6;
			const r = 1.8 + rand() * 3.4;
			L.push( [ Math.cos( a ) * r, 4.6 + rand() * 1.6, Math.sin( a ) * r, 1.8 + rand() * 0.8 ] );
		}
		return { lobes: L, fork: 1.2, H: 7, crownC: [ 0, 5.2, 0 ], crownR: [ 5, 1.8, 5 ], flatten: 0.45, limbR: 0.11, trunkR: 0.2, stems: 3 };
	}
	if ( kind === 'ironwood' ) {
		for ( let i = 0; i < 12; i ++ ) {
			const a = i * 2.39996 + rand() * 0.6;
			const y = 5.5 + rand() * 10;
			const r = ( 0.6 + rand() * 2.6 ) * ( 1 - ( y - 5 ) / 14 );
			L.push( [ Math.cos( a ) * r, y, Math.sin( a ) * r, 1.3 + rand() * 1.0 ] );
		}
		L.push( [ 0, 16, 0, 1.2 ] );
		return { lobes: L, fork: 5, H: 17, crownC: [ 0, 11, 0 ], crownR: [ 3.5, 6, 3.5 ], flatten: 0.9, limbR: 0.09, trunkR: 0.26 };
	}
	throw new Error( 'crown ' + kind );
}

const LEAF_STYLE = {
	monkeypod: { tile: 'FINE', size: 1.9, clumpR: 1.0, clumpsPerR: 3.3, cardsPer: 3, col: [ 1, 1, 1 ] },
	kukui: { tile: 'BROAD', size: 1.6, clumpR: 0.85, clumpsPerR: 3.6, cardsPer: 3, col: [ 1, 1, 1 ] },
	ohia: { tile: 'SMALL', size: 1.25, clumpR: 0.7, clumpsPerR: 4.2, cardsPer: 3, col: [ 1, 1, 1 ] },
	kiawe: { tile: 'FINE', size: 1.5, clumpR: 0.8, clumpsPerR: 3.2, cardsPer: 2, col: [ 1.15, 1.12, 0.85 ] },
	ironwood: { tile: 'NEEDLE', size: 1.9, clumpR: 0.9, clumpsPerR: 2.6, cardsPer: 3, col: [ 1, 1, 1 ], hang: true, upBias: 0.1 },
};

export function buildBroadleaf( kind, lod = 0, seed = 21 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const cr = crownLobes( kind, mulberry32( seed * 7 + 3 ) );
	const style = LEAF_STYLE[ kind ];
	const H = cr.H;
	const crownC = new THREE.Vector3( ...cr.crownC ), crownR = new THREE.Vector3( ...cr.crownR );
	const flex = ( p ) => Math.min( 1, Math.hypot( p.x, p.z ) / 5 ) * smooth( cr.fork, cr.fork + 3, p.y );
	const barkVeg = ( p ) => [ Math.max( 0, p.y / H ), flex( p ), 0, 0 ];
	const barkCol = kind === 'kukui' ? lin( 0xb0aca0 ) : kind === 'ohia' ? lin( 0x9a8f80 ) : kind === 'ironwood' ? lin( 0x8a7a6a ) : kind === 'kiawe' ? lin( 0x7a6e62 ) : lin( 0x9a9488 );
	const radial = lod === 0 ? 9 : 5;
	// trunk(s) with a flared foot
	const stems = cr.stems || 1;
	const forks = [];
	for ( let s = 0; s < stems; s ++ ) {
		const lean = stems > 1 ? 0.35 + rand() * 0.25 : ( rand() - 0.5 ) * 0.12;
		const az = s / stems * Math.PI * 2 + rand();
		const fork = new THREE.Vector3( Math.cos( az ) * lean * cr.fork, cr.fork, Math.sin( az ) * lean * cr.fork );
		const mid = new THREE.Vector3( fork.x * 0.4 + ( rand() - 0.5 ) * 0.3, cr.fork * 0.5, fork.z * 0.4 + ( rand() - 0.5 ) * 0.3 );
		const pts = bezier( new THREE.Vector3( 0, - 0.4, 0 ), mid, fork, lod === 0 ? 6 : 3 );
		const R0 = cr.trunkR / Math.sqrt( stems );
		tube( b, pts, ( f, a ) => {
			const y = f * cr.fork;
			const fin = Math.pow( Math.max( 0, Math.cos( 4 * a + 0.4 ) ), 4 ) * Math.exp( - Math.max( y, 0 ) / 0.7 );
			return R0 * ( 1 - 0.25 * f ) * ( 1 + ( kind === 'monkeypod' ? 0.8 : 0.5 ) * fin + 0.3 * Math.exp( - Math.max( y + 0.4, 0 ) / 0.4 ) );
		}, { radial, part: PART.BARK, veg: barkVeg, ao: ( f ) => 0.45 + 0.35 * f, col: barkCol, texAround: 1, texLen: 2 } );
		forks.push( fork );
	}
	// limbs from the fork(s) to the lobes; lobes far from the fork get a secondary limb
	const limbRows = lod === 0 ? 5 : 2, limbRadial = lod === 0 ? 6 : 4;
	cr.lobes.forEach( ( L, i ) => {
		const lc = new THREE.Vector3( L[ 0 ], L[ 1 ] - L[ 3 ] * 0.35, L[ 2 ] );
		let best = forks[ 0 ];
		for ( const f of forks ) if ( f.distanceTo( lc ) < best.distanceTo( lc ) ) best = f;
		const start = best.clone().add( new THREE.Vector3( ( rand() - 0.5 ) * 0.2, - 0.2 - rand() * 0.3, ( rand() - 0.5 ) * 0.2 ) );
		const d = lc.clone().sub( start );
		const ctrl = start.clone().lerp( lc, 0.5 ).add( new THREE.Vector3( - d.x * 0.22, d.length() * 0.18, - d.z * 0.22 ) )
			.add( new THREE.Vector3( rand() - 0.5, ( rand() - 0.5 ) * 0.6, rand() - 0.5 ).multiplyScalar( d.length() * 0.2 ) );
		if ( lod === 1 && i % 2 ) return;
		const pts = bezier( start, ctrl, lc, limbRows );
		const r0 = cr.limbR * ( i < 5 ? 1 : 0.7 ), r1 = 0.04;
		tube( b, pts, ( f ) => r0 + ( r1 - r0 ) * Math.pow( f, 0.8 ), { radial: limbRadial, part: PART.BARK, veg: barkVeg, ao: ( f ) => 0.5 + 0.2 * f, col: barkCol, texAround: 1, texLen: 2 } );
	} );
	// leaf cards (outermost first)
	const specs = [];
	for ( const L of cr.lobes ) {
		specs.push( ...lobeClumps( b, L, {
			clumpsPerR: style.clumpsPerR * ( lod === 0 ? 1 : 0.4 ), clumpR: style.clumpR * ( lod === 0 ? 1 : 1.6 ), cardsPer: lod === 0 ? style.cardsPer : 2,
			size: style.size * ( lod === 0 ? 1 : 1.65 ), flatten: cr.flatten, hang: style.hang, upBias: style.upBias,
		}, rand ) );
	}
	specs.sort( ( a, c ) => c.center.distanceToSquared( crownC ) - a.center.distanceToSquared( crownC ) );
	for ( const s of specs ) {
		card( b, {
			...s, tile: style.tile, u0: 0, u1: 1, v0: 0, v1: 1, crownC, crownR, H, flex, phase: rand(), cr: rand(), col: style.col,
		} );
	}
	return b.build();
}

// ---- Cook pine: a tall column of short whorled branches covered in foxtail branchlets ------------------------

export function buildPine( lod = 0, seed = 41 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const H = 30;
	const flex = ( p ) => Math.min( 1, Math.hypot( p.x, p.z ) / 3 );
	const veg = ( p ) => [ Math.max( 0, p.y / H ), flex( p ), 0, 0 ];
	const barkCol = lin( 0x8a7560 );
	const pts = [];
	for ( let k = 0; k <= ( lod === 0 ? 10 : 4 ); k ++ ) pts.push( new THREE.Vector3( 0, - 0.3 + k / ( lod === 0 ? 10 : 4 ) * ( H + 0.3 ), 0 ) );
	tube( b, pts, ( f ) => 0.36 * ( 1 - f * 0.9 ) + 0.1 * Math.exp( - f * 30 ), { radial: lod === 0 ? 8 : 5, part: PART.BARK, veg, ao: () => 0.6, col: barkCol, texAround: 1, texLen: 2.2 } );
	const step = lod === 0 ? 0.85 : 1.7;
	for ( let y = 2.4; y < H - 0.3; y += step * ( 0.85 + rand() * 0.3 ) ) {
		const f = y / H;
		// narrow column, a little wider low down, tapering to the spire
		const Lmax = ( 1.2 + 2.2 * Math.sin( Math.min( 1, f * 1.4 ) * Math.PI * 0.5 ) * ( 1 - Math.pow( f, 2.2 ) ) ) * ( 0.75 + 0.5 * rand() );
		const nb = lod === 0 ? 5 : 4;
		const a0 = rand() * 6.28;
		for ( let k = 0; k < nb; k ++ ) {
			if ( rand() < 0.12 ) continue;
			const a = a0 + k / nb * Math.PI * 2 + ( rand() - 0.5 ) * 0.5;
			const L = Math.max( 0.35, Lmax * ( 0.7 + 0.5 * rand() ) );
			const dir = new THREE.Vector3( Math.cos( a ), - 0.08 + rand() * 0.12, Math.sin( a ) ).normalize();
			const c = new THREE.Vector3( 0, y, 0 ).addScaledVector( dir, L * 0.5 + 0.1 );
			// horizontal card along the branch plus a vertical one (the foxtails hang)
			const side = new THREE.Vector3( - dir.z, 0, dir.x );
			const nH = new THREE.Vector3().crossVectors( dir, side ).normalize();
			if ( nH.y < 0 ) nH.negate();
			const ph = rand(), crr = rand();
			for ( const [ n, w ] of lod === 0 ? [ [ nH, 1.1 ], [ side, 1.0 ] ] : [ [ nH.clone().lerp( side, 0.5 ).normalize(), 1.3 ] ] ) {
				card( b, {
					center: c, w: L + 0.2, h: w * ( 0.6 + 0.3 * f ), normal: n, spin: Math.atan2( dir.y, 1 ) * 0 + angleInPlane( n, dir ),
					tile: 'PINEBR', u0: 0, u1: 1, v0: 0, v1: 1, lobeC: new THREE.Vector3( 0, y, 0 ), lobeR: L + 0.3,
					crownC: new THREE.Vector3( 0, H * 0.5, 0 ), crownR: new THREE.Vector3( 3, H * 0.5, 3 ), H, flex, phase: ph, cr: crr, col: [ 1, 1, 1 ],
				} );
			}
		}
	}
	return b.build();
}

// spin that turns a card's local x axis (see card()) onto `dir` within the plane with normal n
function angleInPlane( n, dir ) {
	const nn = n.clone().normalize();
	const tmp = Math.abs( nn.y ) < 0.95 ? UP : new THREE.Vector3( 1, 0, 0 );
	const X = new THREE.Vector3().crossVectors( tmp, nn ).normalize();
	const Y = new THREE.Vector3().crossVectors( nn, X ).normalize();
	return Math.atan2( dir.dot( Y ), dir.dot( X ) );
}

// ---- hāpuʻu tree fern ---------------------------------------------------------------------------------------

export function buildTreeFern( lod = 0, seed = 51 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const TH = 3.2;
	const pts = [];
	const lx = ( rand() - 0.5 ) * 0.4, lz = ( rand() - 0.5 ) * 0.4;
	for ( let k = 0; k <= 5; k ++ ) { const f = k / 5; pts.push( new THREE.Vector3( lx * f * f, - 0.2 + f * ( TH + 0.2 ), lz * f * f ) ); }
	tube( b, pts, ( f ) => 0.2 + 0.06 * Math.exp( - f * 6 ) + 0.03 * f, { radial: lod === 0 ? 8 : 5, part: PART.BARK, veg: ( p ) => [ Math.max( 0, p.y / 5 ), 0, 0, 0 ], ao: () => 0.55, col: lin( 0x5a4430 ), texAround: 1, texLen: 1.2, cap: true } );
	const top = pts[ pts.length - 1 ];
	const n = lod === 0 ? 13 : 8;
	for ( let i = 0; i < n; i ++ ) {
		const a = i / ( n - 1 );
		const dead = i >= n - 2 && lod === 0;
		const az = i * 2.39996 + rand() * 0.4;
		const Lf = ( 2.4 + 1.0 * rand() ) * ( dead ? 0.8 : 1 );
		frond( b, {
			origin: top.clone().add( new THREE.Vector3( Math.cos( az ) * 0.12, 0.05, Math.sin( az ) * 0.12 ) ), azimuth: az,
			elevation: dead ? - 1.2 : 1.1 - 0.75 * a + ( rand() - 0.5 ) * 0.2, bend: dead ? 0.2 : 1.0 + 0.6 * a, twist: ( rand() - 0.5 ) * 0.3, length: Lf,
			segs: lod === 0 ? 7 : 3, cross: 1, bendPow: 1.3, tile: 'FERN',
			leafLen: ( s ) => 0.36 * Lf * ( smooth( 0.02, 0.2, s ) * ( 1 - 0.75 * smooth( 0.4, 1, s ) ) ),
			leafAngle: () => 1.35, droop: ( s ) => 0.12 + 0.25 * s, curl: 0.1, minWidth: 0.02,
			veg: { u0: 1, flutter: 0.6, phase: rand() },
			mat: [ PART.LEAF, 0.5 + 0.5 * ( 1 - a ), rand(), 0 ], col: dead ? lin( 0x8a6a40 ) : [ 1, 1, 1 ],
		} );
	}
	return b.build();
}

// ---- banana: pseudostems with huge paddle leaves (+ a hanging bunch, shown per instance) -----------------------

export function buildBanana( lod = 0, seed = 61 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const stems = [ [ 0, 0, 2.9, 8 ], [ 0.55, 0.3, 1.7, 5 ], [ - 0.45, 0.4, 1.2, 4 ] ];
	for ( let si = 0; si < ( lod === 0 ? 3 : 2 ); si ++ ) {
		const [ sx, sz, SH, nL ] = stems[ si ];
		const pts = [ new THREE.Vector3( sx, - 0.1, sz ), new THREE.Vector3( sx, SH * 0.5, sz ), new THREE.Vector3( sx, SH, sz ) ];
		tube( b, pts, ( f ) => ( 0.13 - 0.05 * f + 0.05 * Math.exp( - f * 8 ) ) * ( SH / 2.9 + 0.3 ), { radial: lod === 0 ? 7 : 5, part: PART.SOLID, veg: ( p ) => [ Math.max( 0, p.y / 3.5 ), 0, 0, 0 ], ao: ( f ) => 0.6 + 0.3 * f, col: lin( 0x5f7a38 ), fixedUV: WHITE, cap: true } );
		const n = lod === 0 ? nL : Math.ceil( nL * 0.6 );
		for ( let i = 0; i < n; i ++ ) {
			const a = i / Math.max( 1, n - 1 );
			const az = i * 2.39996 + rand() * 0.4;
			const Lf = ( 1.3 + 0.9 * rand() ) * ( SH / 2.9 * 0.6 + 0.4 ) * ( a > 0.85 ? 0.9 : 1 );
			const W = 0.3 + 0.1 * rand();
			const old = a > 0.8 && rand() < 0.7;
			frond( b, {
				origin: new THREE.Vector3( sx + Math.cos( az ) * 0.06, SH + 0.1 - 0.35 * a, sz + Math.sin( az ) * 0.06 ), azimuth: az,
				elevation: 1.25 - 0.8 * a + ( rand() - 0.5 ) * 0.2, bend: 0.5 + 0.9 * a + ( old ? 0.8 : 0 ), twist: ( rand() - 0.5 ) * 0.25, length: Lf,
				segs: lod === 0 ? 6 : 3, cross: 1, tile: 'BANANA',
				leafLen: ( s ) => W * Math.pow( Math.max( 0, Math.sin( Math.PI * Math.min( 1, Math.max( 0, ( s - 0.12 ) / 0.88 ) ) ) ), 0.5 ),
				leafAngle: () => 1.45, droop: ( s ) => 0.15 + 0.35 * s, curl: 0.12, minWidth: 0.02,
				veg: { u0: 0.8, flutter: 0.8, phase: rand() },
				mat: [ PART.LEAF, 0.6 + 0.4 * ( 1 - a ), rand(), 0 ], col: old ? lin( 0xa08850 ) : [ 1, 1, 1 ],
			} );
		}
	}
	if ( lod === 0 ) {
		// the bunch: green fingers around a hanging stalk and the purple bud (crown id 99: fruiting instances only)
		const top = new THREE.Vector3( 0.25, 2.2, 0 );
		for ( let r = 0; r < 5; r ++ ) for ( let k = 0; k < 6; k ++ ) {
			const a = k / 6 * Math.PI * 2 + r * 0.5;
			blob( b, top.clone().add( new THREE.Vector3( Math.cos( a ) * 0.13, - r * 0.12, Math.sin( a ) * 0.13 ) ), new THREE.Vector3( 0.045, 0.1, 0.045 ), 0, { part: PART.SOLID, crown: 99, col: lin( 0x7a9a3a ), ao: () => 0.7 } );
		}
		blob( b, top.clone().add( new THREE.Vector3( 0, - 0.8, 0 ) ), new THREE.Vector3( 0.09, 0.16, 0.09 ), 1, { part: PART.SOLID, crown: 99, col: lin( 0x5a2440 ), ao: () => 0.8 } );
	}
	return b.build();
}

// ---- ti: slender canes with a tuft of glossy leaves -----------------------------------------------------------

function leafStrip( b, base, dir, len, width, bend, tile, mat, col, veg, segs = 3 ) {
	// a bent strip: rises along dir, curving down by `bend`
	const side = new THREE.Vector3( - dir.z, 0, dir.x ).normalize();
	if ( side.lengthSq() < 0.01 ) side.set( 1, 0, 0 );
	const ids = [];
	const p = base.clone();
	const d = dir.clone().normalize();
	for ( let k = 0; k <= segs; k ++ ) {
		const s = k / segs;
		const w = width * Math.sin( Math.PI * Math.min( 1, 0.08 + s * 0.92 ) ) * ( 1 - 0.3 * s );
		const nrm = new THREE.Vector3().crossVectors( side, d ).normalize();
		if ( nrm.y < 0 ) nrm.negate();
		nrm.lerp( UP, 0.35 ).normalize();
		for ( const q of [ - 1, 1 ] ) {
			atlasUV( tile, 0.5 + q * 0.5, s, _uv );
			const pp = p.clone().addScaledVector( side, q * Math.max( w, 0.004 ) * 0.5 );
			ids.push( b.vertex( pp, nrm, _uv[ 0 ], _uv[ 1 ], [ veg[ 0 ], s * veg[ 1 ], s, veg[ 3 ] ], mat, col ) );
		}
		p.addScaledVector( d, len / segs );
		d.y -= bend / segs;
		d.normalize();
	}
	for ( let k = 0; k < segs; k ++ ) b.quad( ids[ k * 2 ], ids[ k * 2 + 1 ], ids[ k * 2 + 3 ], ids[ k * 2 + 2 ] );
}

export function buildTi( lod = 0, seed = 71 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const canes = lod === 0 ? 3 : 2;
	for ( let c = 0; c < canes; c ++ ) {
		const a = c / canes * 6.28 + rand();
		const h = 1.2 + rand() * 0.9;
		const top = new THREE.Vector3( Math.cos( a ) * 0.18 * c, h, Math.sin( a ) * 0.18 * c );
		tube( b, [ new THREE.Vector3( top.x * 0.3, - 0.1, top.z * 0.3 ), top.clone().multiplyScalar( 0.6 ), top ], ( f ) => 0.025 - 0.008 * f, { radial: 4, part: PART.BARK, veg: ( p ) => [ Math.max( 0, p.y / 2.2 ), 0, 0, 0 ], ao: () => 0.6, col: lin( 0x6a5a48 ), texAround: 0.25, texLen: 2 } );
		const n = lod === 0 ? 14 : 8;
		for ( let k = 0; k < n; k ++ ) {
			const az = k * 2.39996 + rand() * 0.4;
			const el = 0.3 + rand() * 1.1;
			const dir = new THREE.Vector3( Math.cos( az ) * Math.cos( el ), Math.sin( el ), Math.sin( az ) * Math.cos( el ) );
			leafStrip( b, top.clone().add( new THREE.Vector3( 0, ( rand() - 0.5 ) * 0.15, 0 ) ), dir, 0.35 + rand() * 0.25, 0.11 + rand() * 0.04, 0.5 + rand() * 0.6, 'TI',
				[ PART.LEAF, 0.6 + 0.4 * rand(), rand(), 0 ], [ 1, 1, 1 ], [ top.y / 2.2, 1, 1, rand() ], lod === 0 ? 3 : 2 );
		}
	}
	return b.build();
}

// ---- lobed shrubs: generic shrub, naupaka --------------------------------------------------------------------

function buildLobed( lobes, crown, tile, lod, seed, { size, clumpR, clumpsPerR, cardsPer, flatten, stems = 3, stemCol } ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const H = crown.H;
	const crownC = new THREE.Vector3( ...crown.c ), crownR = new THREE.Vector3( ...crown.r );
	const flex = ( p ) => Math.min( 1, p.y / H );
	for ( let i = 0; i < stems && lod === 0; i ++ ) {
		const L = lobes[ ( i + 1 ) % lobes.length ];
		tube( b, [ new THREE.Vector3( 0, - 0.1, 0 ), new THREE.Vector3( L[ 0 ] * 0.3, L[ 1 ] * 0.4, L[ 2 ] * 0.3 ), new THREE.Vector3( L[ 0 ] * 0.6, L[ 1 ] * 0.7, L[ 2 ] * 0.6 ) ], ( f ) => 0.035 - 0.02 * f,
			{ radial: 3, part: PART.BARK, veg: ( p ) => [ Math.max( 0, p.y / H ), flex( p ), 0, 0 ], ao: () => 0.4, col: stemCol || lin( 0x6a5a48 ), texAround: 0.25, texLen: 1 } );
	}
	const specs = [];
	for ( const L of lobes ) specs.push( ...lobeClumps( b, L, { clumpsPerR: clumpsPerR * ( lod === 0 ? 1 : 0.45 ), clumpR: clumpR * ( lod === 0 ? 1 : 1.5 ), cardsPer: lod === 0 ? cardsPer : 2, size: size * ( lod === 0 ? 1 : 1.5 ), flatten }, rand ) );
	specs.sort( ( a, c ) => c.center.distanceToSquared( crownC ) - a.center.distanceToSquared( crownC ) );
	for ( const s of specs ) card( b, { ...s, tile, u0: 0, u1: 1, v0: 0, v1: 1, crownC, crownR, H, flex, phase: rand(), cr: rand(), col: [ 1, 1, 1 ] } );
	return b.build();
}

export function buildShrub( lod = 0, seed = 81 ) {
	return buildLobed( [ [ 0, 0.85, 0, 0.8 ], [ 0.75, 0.6, 0.35, 0.6 ], [ - 0.6, 0.55, 0.55, 0.6 ], [ - 0.25, 0.65, - 0.75, 0.62 ], [ 0.35, 1.25, - 0.25, 0.48 ] ],
		{ H: 1.7, c: [ 0, 0.75, 0 ], r: [ 1.1, 0.8, 1.1 ] }, 'SHRUB', lod, seed, { size: 0.8, clumpR: 0.42, clumpsPerR: 5, cardsPer: 3, flatten: 0.8 } );
}

export function buildNaupaka( lod = 0, seed = 91 ) {
	const L = [];
	const rand = mulberry32( seed + 5 );
	for ( let i = 0; i < 7; i ++ ) { const a = i / 7 * 6.28 + rand() * 0.5, r = 0.5 + rand() * 0.8; L.push( [ Math.cos( a ) * r, 0.45 + rand() * 0.35, Math.sin( a ) * r, 0.55 + rand() * 0.25 ] ); }
	L.push( [ 0, 0.85, 0, 0.7 ] );
	return buildLobed( L, { H: 1.2, c: [ 0, 0.55, 0 ], r: [ 1.4, 0.6, 1.4 ] }, 'NAUPAKA', lod, seed, { size: 0.75, clumpR: 0.4, clumpsPerR: 5.5, cardsPer: 3, flatten: 0.6, stems: 0 } );
}

// ---- grasses ----------------------------------------------------------------------------------------------------

// tall tussock (guinea grass / fountain grass): arching crossed cards of the grass tile and seed heads
export function buildTallGrass( lod = 0, seed = 101 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const n = lod === 0 ? 7 : 3;
	for ( let k = 0; k < n; k ++ ) {
		const a = k / n * Math.PI + rand() * 0.4;
		const tilt = ( rand() - 0.5 ) * 0.5;
		const h = 1.3 + rand() * 0.5, w = 1.3 + rand() * 0.4;
		const n0 = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) );
		const side = new THREE.Vector3( - n0.z, 0, n0.x );
		const ph = rand();
		// two rows so the card bends over at the top
		const ids = [];
		for ( let r = 0; r <= 2; r ++ ) {
			const f = r / 2;
			const y = h * f * ( 1 - 0.12 * f );
			const off = side.clone().multiplyScalar( tilt * f * f * 0.6 );
			for ( const q of [ - 1, 1 ] ) {
				const p = new THREE.Vector3( 0, y, 0 ).addScaledVector( n0, q * w * 0.5 * ( 0.35 + 0.65 * f ) ).add( off );
				atlasUV( 'GRASS', q * 0.5 + 0.5, 1 - f, _uv );
				const nrm = side.clone().multiplyScalar( 0.4 ).add( UP ).normalize();
				ids.push( b.vertex( p, nrm, _uv[ 0 ], _uv[ 1 ], [ f, f, f, ph ], [ PART.LEAF, 0.35 + 0.65 * f, rand(), 0 ], [ 1, 1, 1 ] ) );
			}
		}
		b.quad( ids[ 0 ], ids[ 1 ], ids[ 3 ], ids[ 2 ] );
		b.quad( ids[ 2 ], ids[ 3 ], ids[ 5 ], ids[ 4 ] );
	}
	// seed heads (plume tile) above the tuft
	for ( let k = 0; k < ( lod === 0 ? 3 : 1 ); k ++ ) {
		const a = rand() * Math.PI;
		const n0 = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) );
		const ids = [];
		for ( const [ x, y, u, v ] of [ [ - 0.3, 0.2, 0, 1 ], [ 0.3, 0.2, 1, 1 ], [ 0.3, 2.1, 1, 0 ], [ - 0.3, 2.1, 0, 0 ] ] ) {
			atlasUV( 'PLUME', u, v, _uv );
			ids.push( b.vertex( new THREE.Vector3( 0, y, 0 ).addScaledVector( n0, x ), UP, _uv[ 0 ], _uv[ 1 ], [ y / 2, y / 2, y / 2, rand() ], [ PART.LEAF, 0.9, 0.5, 30 ], [ 1, 1, 1 ] ) );
		}
		b.quad( ids[ 0 ], ids[ 1 ], ids[ 2 ], ids[ 3 ] );
	}
	return b.build();
}

// ground fern (uluhe / sword fern): fountain of arching fronds
export function buildFern( lod = 0, seed = 111 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const n = lod === 0 ? 9 : 5;
	for ( let i = 0; i < n; i ++ ) {
		const a = i / ( n - 1 );
		const az = i * 2.39996 + rand() * 0.5;
		const Lf = ( 0.75 + 0.5 * a ) * ( 0.85 + 0.3 * rand() );
		frond( b, {
			origin: new THREE.Vector3( 0, 0.05, 0 ), azimuth: az,
			elevation: 1.3 - 0.55 * a + ( rand() - 0.5 ) * 0.2, bend: 1.3 + 0.8 * a, twist: ( rand() - 0.5 ) * 0.5, length: Lf,
			segs: lod === 0 ? 4 : 2, cross: 1, bendPow: 1.2, tile: 'FERN',
			leafLen: ( s ) => 0.24 * Lf * ( smooth( 0.02, 0.2, s ) * ( 1 - 0.8 * smooth( 0.35, 1, s ) ) ),
			leafAngle: () => 1.35, droop: ( s ) => 0.12 + 0.2 * s, curl: 0.08, minWidth: 0.012,
			veg: { u0: 0.3, flutter: 0.6, phase: rand() }, mat: [ PART.LEAF, 0.55 + 0.45 * a, rand(), 0 ], col: [ 1, 1, 1 ],
		} );
	}
	return b.build();
}

// grass clump for the dense ground cover: geometric blades (no alpha test, cheap to fill)
export function buildGrassClump( seed = 121 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const blades = 11;
	for ( let k = 0; k < blades; k ++ ) {
		const a = rand() * Math.PI * 2;
		const r = Math.sqrt( rand() ) * 0.22;
		const bx = Math.cos( a ) * r, bz = Math.sin( a ) * r;
		const dirA = rand() * Math.PI * 2;
		const dx = Math.cos( dirA ), dz = Math.sin( dirA );
		const lean = 0.15 + rand() * 0.45;
		const h = 0.28 + rand() * 0.34;
		const wd = 0.012 + rand() * 0.01;
		const curve = 0.2 + rand() * 0.35;
		const ph = rand();
		const tone = 0.8 + rand() * 0.4;
		const col = [ tone, tone, tone ];
		const ids = [];
		const rows = [ 0, 0.4, 0.75, 1 ];
		for ( let q = 0; q < rows.length; q ++ ) {
			const f = rows[ q ];
			const out = ( Math.sin( lean ) * f + curve * f * f ) * h;
			const up = ( Math.cos( lean ) * f - curve * 0.3 * f * f ) * h;
			const p = new THREE.Vector3( bx + dx * out, up, bz + dz * out );
			const w = wd * ( 1 - f * 0.85 );
			const side = new THREE.Vector3( - dz, 0, dx );
			// normals mostly up: the lawn is lit like the ground under it
			const n = new THREE.Vector3( dx * 0.3, 1, dz * 0.3 ).normalize();
			if ( q === rows.length - 1 ) {
				ids.push( b.vertex( p, n, WHITE[ 0 ], WHITE[ 1 ], [ f, f, f, ph ], [ PART.SOLID, 0.35 + 0.65 * f, rand(), 0 ], col ) );
			} else {
				ids.push( b.vertex( p.clone().addScaledVector( side, - w ), n, WHITE[ 0 ], WHITE[ 1 ], [ f, f, f, ph ], [ PART.SOLID, 0.35 + 0.65 * f, 0.5, 0 ], col ) );
				ids.push( b.vertex( p.clone().addScaledVector( side, w ), n, WHITE[ 0 ], WHITE[ 1 ], [ f, f, f, ph ], [ PART.SOLID, 0.35 + 0.65 * f, 0.5, 0 ], col ) );
			}
		}
		b.quad( ids[ 0 ], ids[ 1 ], ids[ 3 ], ids[ 2 ] );
		b.quad( ids[ 2 ], ids[ 3 ], ids[ 5 ], ids[ 4 ] );
		b.tri( ids[ 4 ], ids[ 5 ], ids[ 6 ] );
	}
	return b.build();
}

// ---- crops ------------------------------------------------------------------------------------------------------

// pineapple row segment (2.4 m of a double row): spiky rosettes, some with a fruit (crown id 99)
export function buildPineappleRow( lod = 0, seed = 131 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const leafCol = lin( 0x6f8a62 );
	for ( const row of [ - 0.24, 0.24 ] ) {
		for ( let k = 0; k < 3; k ++ ) {
			const cx = - 1.2 + ( k + 0.5 + ( row > 0 ? 0.5 : 0 ) ) * 0.8 - ( row > 0 ? 0.4 : 0 ) + ( rand() - 0.5 ) * 0.1;
			const cz = row + ( rand() - 0.5 ) * 0.06;
			const base = new THREE.Vector3( cx, 0, cz );
			const n = 11;
			for ( let q = 0; q < n; q ++ ) {
				const az = q * 2.39996 + rand() * 0.3;
				const el = 0.35 + rand() * 0.8;
				const dir = new THREE.Vector3( Math.cos( az ) * Math.cos( el ), Math.sin( el ), Math.sin( az ) * Math.cos( el ) );
				leafStrip( b, base, dir, 0.45 + rand() * 0.3, 0.07, 0.25 + rand() * 0.4, 'PANDAN', [ PART.LEAF, 0.4 + 0.6 * rand(), rand(), 0 ], leafCol.map( v => v * ( 0.85 + rand() * 0.3 ) ), [ 0, 0.6, 0.4, rand() ], 2 );
			}
			if ( lod === 0 ) {
				const fy = 0.42 + rand() * 0.08;
				blob( b, base.clone().add( new THREE.Vector3( 0, fy, 0 ) ), new THREE.Vector3( 0.08, 0.12, 0.08 ), 1, { part: PART.SOLID, crown: 99, col: lin( 0xc08a2a ), ao: () => 0.8 } );
				for ( let q = 0; q < 5; q ++ ) {
					const az = q / 5 * 6.28;
					leafStrip( b, base.clone().add( new THREE.Vector3( 0, fy + 0.1, 0 ) ), new THREE.Vector3( Math.cos( az ) * 0.4, 1, Math.sin( az ) * 0.4 ), 0.13, 0.04, 0.2, 'PANDAN', [ PART.LEAF, 0.9, 0.5, 99 ], leafCol, [ 0, 0.3, 0.2, 0 ], 1 );
				}
			}
		}
	}
	return b.build();
}

// sugar cane patch (unit height, the instance scales y): crossed cards of the cane tile
export function buildCanePatch( lod = 0, seed = 141 ) {
	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	const n = lod === 0 ? 5 : 2;
	for ( let k = 0; k < n; k ++ ) {
		const a = k / n * Math.PI + ( rand() - 0.5 ) * 0.3;
		const c = new THREE.Vector3( ( rand() - 0.5 ) * 1.2, 0, ( rand() - 0.5 ) * 1.2 );
		const n0 = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) );
		const side = new THREE.Vector3( - n0.z, 0, n0.x );
		const w = 2.4 + rand() * 0.6;
		const ph = rand();
		const ids = [];
		for ( let r = 0; r <= 2; r ++ ) {
			const f = r / 2;
			for ( const q of [ - 1, 1 ] ) {
				const p = c.clone().addScaledVector( n0, q * w * 0.5 ).addScaledVector( side, ( rand() - 0.5 ) * 0.2 * f );
				p.y = f * 1.05;
				atlasUV( 'CANE', q * 0.5 + 0.5, 1 - f, _uv );
				ids.push( b.vertex( p, side.clone().multiplyScalar( 0.3 ).add( UP ).normalize(), _uv[ 0 ], _uv[ 1 ], [ f, f, f, ph ], [ PART.LEAF, 0.3 + 0.7 * f, rand(), 0 ], [ 1, 1, 1 ] ) );
			}
		}
		b.quad( ids[ 0 ], ids[ 1 ], ids[ 3 ], ids[ 2 ] );
		b.quad( ids[ 2 ], ids[ 3 ], ids[ 5 ], ids[ 4 ] );
	}
	return b.build();
}

// ---- rocks ---------------------------------------------------------------------------------------------------------

export function buildRock( lod = 0, seed = 151 ) {
	const b = new GeoBuilder();
	const rand = mulberry32( seed );
	const bumps = Array.from( { length: 7 }, () => [ new THREE.Vector3( rand() - 0.5, rand() - 0.5, rand() - 0.5 ).normalize(), 0.12 + rand() * 0.2 ] );
	const disp = ( d ) => {
		let k = 1;
		for ( const [ c, a ] of bumps ) k += a * Math.max( 0, d.dot( c ) - 0.4 );
		k *= 1 - 0.18 * Math.abs( Math.sin( d.x * 5.1 + d.z * 3.3 ) * Math.cos( d.y * 4.2 ) );
		// flattened bottom sitting in the ground
		return k * ( d.y < - 0.2 ? 0.8 : 1 );
	};
	blob( b, new THREE.Vector3( 0, 0.5, 0 ), new THREE.Vector3( 1, 0.75, 0.9 ), lod === 0 ? 2 : 1, { part: PART.ROCK, uvScale: 2, col: [ 1, 1, 1 ], ao: ( d ) => 0.55 + 0.45 * Math.max( 0, d.y * 0.5 + 0.5 ), veg: () => [ 0, 0, 0, 0 ] }, disp );
	return b.build();
}
