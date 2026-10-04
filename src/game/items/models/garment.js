// The garment toolkit shared by the clothing and gear models (clothing.js, ext/gear.js): soft cloth panels of any
// outline (a flat shape puffed up with rounded edges, interior vertices for folds and wrinkles), surfaces over a
// (u, v) grid (shoe uppers, shafts, crowns), soft boxes for bag bodies, straps and seams laid along paths, and the
// cloth materials: a print (lib.printTex) over a weave normal map (cotton, twill, knit, rib, ripstop, canvas, nylon,
// leather, neoprene, straw, corduroy, fleece).
// Panels and details share one planar UV frame (uvOf: metres / UV_S), so a print runs on across seams and folds.
import * as THREE from 'three';
import { canvasTex, printTex, PI } from './lib.js';
import { patchMaterial } from '../../../render/Materials.js';

const TAU = PI * 2;
export const UV_S = 0.3; // metres of cloth per UV unit
const clamp = ( v, a, b ) => v < a ? a : v > b ? b : v;
export const smooth = ( a, b, x ) => { const t = clamp( ( x - a ) / ( b - a ), 0, 1 ); return t * t * ( 3 - 2 * t ); };
export const lerp = ( a, b, t ) => a + ( b - a ) * t;

function rng( seed ) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; }; }

// ---- weave normal maps ---------------------------------------------------------------------------------------------

// height over a tile in cell units (n cells across, so it tiles); k: bump strength; rep: tiles per UV unit; rough
const hash2 = ( i, j, s = 0 ) => { let h = ( i * 374761393 + j * 668265263 + s * 2147483647 ) | 0; h = Math.imul( h ^ ( h >>> 13 ), 1274126177 ); return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296; };
const fr = ( x ) => x - Math.floor( x );
const WEAVES = {
	// cotton plain weave: over-under threads
	plain: { n: 24, k: 2.2, rep: 7, rough: 0.9, h: ( x, y ) => Math.sin( x * TAU ) * Math.sin( y * TAU ) * 0.5 + hash2( Math.floor( x * 2 ), Math.floor( y ), 1 ) * 0.15 },
	// denim / chino twill: diagonal wales and a slubby weft
	twill: { n: 32, k: 2.6, rep: 6, rough: 0.88, h: ( x, y ) => Math.sin( ( x + y * 0.5 ) * TAU ) * 0.5 + hash2( 0, Math.floor( y ), 2 ) * 0.25 },
	// jersey knit: columns of little V loops
	knit: { n: 24, k: 2.4, rep: 7, rough: 0.95, h: ( x, y ) => { const u = fr( x ) - 0.5; return Math.cos( u * PI ) ** 2 * ( 0.6 + 0.4 * Math.sin( ( y + Math.abs( u ) * 1.2 ) * TAU ) ); } },
	// rib knit (cuffs, collars, beanies): strong vertical ribs
	rib: { n: 16, k: 4, rep: 6, rough: 0.95, h: ( x ) => Math.pow( Math.abs( Math.cos( x * PI ) ), 0.6 ) },
	// ripstop nylon: a fine weave with a raised grid every few millimetres
	ripstop: { n: 32, k: 2.4, rep: 4, rough: 0.6, h: ( x, y ) => Math.sin( x * TAU * 2 ) * Math.sin( y * TAU * 2 ) * 0.2 + ( fr( x / 8 ) < 0.09 || fr( y / 8 ) < 0.09 ? 0.9 : 0 ) },
	// canvas / cordura: a coarse, uneven basket weave
	canvas: { n: 16, k: 2.8, rep: 6, rough: 0.9, h: ( x, y ) => Math.sin( x * TAU ) * Math.sin( y * TAU ) * 0.45 + ( hash2( Math.floor( x ), Math.floor( y ), 3 ) - 0.5 ) * 0.35 },
	// nylon taffeta: smooth with a faint weave
	nylon: { n: 32, k: 0.9, rep: 8, rough: 0.45, h: ( x, y ) => Math.sin( x * TAU ) * Math.sin( y * TAU ) * 0.5 },
	// leather: a pebbled grain (cells round a jittered point each)
	leather: { n: 12, k: 3, rep: 5, rough: 0.55, h: ( x, y ) => {
		let best = 9;
		const ix = Math.floor( x ), iy = Math.floor( y );
		for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) {
			const cx = ix + dx, cy = iy + dy, wx = ( ( cx % 12 ) + 12 ) % 12, wy = ( ( cy % 12 ) + 12 ) % 12;
			const px = cx + hash2( wx, wy, 5 ), py = cy + hash2( wx, wy, 6 );
			best = Math.min( best, ( x - px ) ** 2 + ( y - py ) ** 2 );
		}
		return Math.sqrt( best ) * - 0.9;
	} },
	// neoprene: a tight knit face
	neoprene: { n: 40, k: 1.2, rep: 6, rough: 0.6, h: ( x, y ) => Math.sin( x * TAU ) * Math.sin( ( y + 0.5 * Math.floor( x ) ) * TAU ) * 0.5 },
	// plaited lauhala / straw: wide strips over and under
	straw: { n: 8, k: 3.2, rep: 5, rough: 0.85, h: ( x, y ) => { const along = ( Math.floor( x ) + Math.floor( y ) ) % 2; return along ? Math.sin( fr( y ) * PI ) : Math.sin( fr( x ) * PI ) * 0.9; } },
	// corduroy wales
	cord: { n: 16, k: 3.6, rep: 5, rough: 0.95, h: ( x ) => Math.sin( fr( x ) * PI ) },
	// fleece / sweatshirt: soft noise
	fleece: { n: 32, k: 1.6, rep: 5, rough: 0.98, h: ( x, y ) => hash2( Math.floor( x ), Math.floor( y ), 7 ) * 0.6 + Math.sin( x * TAU ) * Math.sin( y * TAU ) * 0.2 },
};
export const weaveRough = ( w ) => WEAVES[ w ]?.rough ?? 0.9;

function weaveTex( kind ) {
	const W = WEAVES[ kind ];
	return canvasTex( 'weave:' + kind, 128, 128, ( ctx, w, h ) => {
		// heights first (wrapping), then a normal from the slope at every texel
		const H = new Float32Array( w * h );
		for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) H[ y * w + x ] = W.h( x / w * W.n, y / h * W.n );
		const img = ctx.getImageData( 0, 0, w, h ), d = img.data;
		const at = ( x, y ) => H[ ( ( y + h ) % h ) * w + ( ( x + w ) % w ) ];
		const k = W.k * W.n / w;
		for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) {
			const nx = - ( at( x + 1, y ) - at( x - 1, y ) ) * k, ny = ( at( x, y + 1 ) - at( x, y - 1 ) ) * k, l = Math.hypot( nx, ny, 1 );
			const i = ( y * w + x ) * 4;
			d[ i ] = ( nx / l * 0.5 + 0.5 ) * 255; d[ i + 1 ] = ( ny / l * 0.5 + 0.5 ) * 255; d[ i + 2 ] = ( 1 / l * 0.5 + 0.5 ) * 255; d[ i + 3 ] = 255;
		}
		ctx.putImageData( img, 0, 0 );
	}, { repeat: true, srgb: false } );
}

// ---- cloth materials ------------------------------------------------------------------------------------------------

// A cached cloth material: a colour or a print (lib.printTex kinds) over a weave normal map.
// o: { print, color2, color3, rep (print tiles per UV unit), weave (WEAVES key | 'none'), wrep (weave scale), bump,
//      rough, metal, side, emissive, emissiveIntensity }
const clothMats = new Map();
export function cloth( color, o = {} ) {
	const print = o.print && o.print !== 'plain' ? o.print : null, weave = o.weave ?? 'plain';
	const key = [ color, print, o.color2, o.color3, o.rep, weave, o.wrep, o.bump, o.rough, o.metal, o.side, o.emissive, o.emissiveIntensity ].join( '|' );
	let m = clothMats.get( key );
	if ( m ) return m;
	const W = WEAVES[ weave ];
	m = new THREE.MeshStandardMaterial( { color: print ? 0xffffff : color, roughness: o.rough ?? W?.rough ?? 0.9, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide,
		emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1 } );
	if ( print ) {
		const t = printTex( print, color, o.color2 ?? 0xffffff, o.color3 ?? null ).clone();
		t.repeat.set( o.rep ?? 1.4, o.rep ?? 1.4 ); t.needsUpdate = true;
		m.map = t;
	}
	if ( W ) {
		const n = weaveTex( weave ).clone(), r = W.rep * ( o.wrep ?? 1 );
		n.repeat.set( r, r ); n.needsUpdate = true;
		m.normalMap = n;
		const b = o.bump ?? 0.8;
		m.normalScale.set( b, b );
	}
	patchMaterial( m, 'item' );
	m.name = 'cloth:' + key;
	clothMats.set( key, m );
	return m;
}

// ---- geometry helpers -----------------------------------------------------------------------------------------------

// planar cloth UVs: x across, -z up the texture, centred on ( cx, cz ) (a print's middle lands there)
export function uvOf( geo, cx = 0, cz = 0, s = UV_S ) {
	const p = geo.attributes.position, uv = new Float32Array( p.count * 2 );
	for ( let i = 0; i < p.count; i ++ ) { uv[ i * 2 ] = ( p.getX( i ) - cx ) / s + 0.5; uv[ i * 2 + 1 ] = 0.5 - ( p.getZ( i ) - cz ) / s; }
	geo.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	return geo;
}

// smooth normals across split vertices (same position) while keeping their own UVs
export function smoothNormals( geo, eps = 1e-5 ) {
	geo.computeVertexNormals();
	const p = geo.attributes.position, n = geo.attributes.normal, acc = new Map(), keys = new Array( p.count );
	for ( let i = 0; i < p.count; i ++ ) {
		const k = Math.round( p.getX( i ) / eps ) + ',' + Math.round( p.getY( i ) / eps ) + ',' + Math.round( p.getZ( i ) / eps );
		keys[ i ] = k;
		const a = acc.get( k );
		if ( a ) { a[ 0 ] += n.getX( i ); a[ 1 ] += n.getY( i ); a[ 2 ] += n.getZ( i ); } else acc.set( k, [ n.getX( i ), n.getY( i ), n.getZ( i ) ] );
	}
	for ( let i = 0; i < p.count; i ++ ) { const a = acc.get( keys[ i ] ), l = Math.hypot( a[ 0 ], a[ 1 ], a[ 2 ] ) || 1; n.setXYZ( i, a[ 0 ] / l, a[ 1 ] / l, a[ 2 ] / l ); }
	n.needsUpdate = true;
	return geo;
}

// polygon tools on [ [ x, z ], ... ] (closed implicitly)
export function inPoly( P, x, z ) {
	let c = false;
	for ( let i = 0, j = P.length - 1; i < P.length; j = i ++ ) {
		const a = P[ i ], b = P[ j ];
		if ( ( a[ 1 ] > z ) !== ( b[ 1 ] > z ) && x < ( b[ 0 ] - a[ 0 ] ) * ( z - a[ 1 ] ) / ( b[ 1 ] - a[ 1 ] ) + a[ 0 ] ) c = ! c;
	}
	return c;
}
export function polyDist( P, x, z ) {
	let best = Infinity;
	for ( let i = 0, n = P.length; i < n; i ++ ) {
		const a = P[ i ], b = P[ ( i + 1 ) % n ], dx = b[ 0 ] - a[ 0 ], dz = b[ 1 ] - a[ 1 ];
		const t = clamp( ( ( x - a[ 0 ] ) * dx + ( z - a[ 1 ] ) * dz ) / ( dx * dx + dz * dz || 1 ), 0, 1 );
		const ex = a[ 0 ] + dx * t - x, ez = a[ 1 ] + dz * t - z, d = ex * ex + ez * ez;
		if ( d < best ) best = d;
	}
	return Math.sqrt( best );
}
// edges no longer than `step`
export function resample( P, step ) {
	const out = [];
	for ( let i = 0, n = P.length; i < n; i ++ ) {
		const a = P[ i ], b = P[ ( i + 1 ) % n ], k = Math.max( 1, Math.ceil( Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ) / step ) );
		for ( let j = 0; j < k; j ++ ) out.push( [ lerp( a[ 0 ], b[ 0 ], j / k ), lerp( a[ 1 ], b[ 1 ], j / k ) ] );
	}
	return out;
}
// a rounded rectangle outline centred on ( cx, cz ); r may be a number or [ r( -x -z ), r( +x -z ), r( +x +z ), r( -x +z ) ]
export function roundRect( w, d, r, cx = 0, cz = 0, seg = 5 ) {
	const R = Array.isArray( r ) ? r : [ r, r, r, r ], P = [], x = w / 2, z = d / 2;
	const corner = ( px, pz, rr, a0 ) => { if ( rr <= 1e-5 ) { P.push( [ cx + px, cz + pz ] ); return; } for ( let i = 0; i <= seg; i ++ ) { const a = a0 + i / seg * PI / 2; P.push( [ cx + px + Math.cos( a ) * rr, cz + pz + Math.sin( a ) * rr ] ); } };
	corner( - x + R[ 0 ], - z + R[ 0 ], R[ 0 ], PI );
	corner( x - R[ 1 ], - z + R[ 1 ], R[ 1 ], PI * 1.5 );
	corner( x - R[ 2 ], z - R[ 2 ], R[ 2 ], 0 );
	corner( - x + R[ 3 ], z - R[ 3 ], R[ 3 ], PI / 2 );
	return P;
}
// a smooth closed curve through control points (Catmull-Rom), n points
export function curveLoop( C, n = 48 ) {
	const c = new THREE.CatmullRomCurve3( C.map( p => new THREE.Vector3( p[ 0 ], 0, p[ 1 ] ) ), true, 'centripetal' );
	return c.getSpacedPoints( n ).slice( 0, n ).map( v => [ v.x, v.z ] );
}

// Delaunay triangulation (Bowyer-Watson) of points [ [ x, z ], ... ]: index triples
function delaunay( pts ) {
	const n = pts.length;
	let minX = Infinity, minZ = Infinity, maxX = - Infinity, maxZ = - Infinity;
	for ( const p of pts ) { minX = Math.min( minX, p[ 0 ] ); maxX = Math.max( maxX, p[ 0 ] ); minZ = Math.min( minZ, p[ 1 ] ); maxZ = Math.max( maxZ, p[ 1 ] ); }
	const s = Math.max( maxX - minX, maxZ - minZ ) * 20, mx = ( minX + maxX ) / 2, mz = ( minZ + maxZ ) / 2;
	const X = pts.map( p => p[ 0 ] ), Z = pts.map( p => p[ 1 ] );
	X.push( mx - s, mx, mx + s ); Z.push( mz - s, mz + s, mz - s );
	let tris = [];
	const mk = ( a, b, c ) => {
		const ax = X[ a ], az = Z[ a ], bx = X[ b ], bz = Z[ b ], cx = X[ c ], cz = Z[ c ];
		const d = 2 * ( ax * ( bz - cz ) + bx * ( cz - az ) + cx * ( az - bz ) ) || 1e-12;
		const ux = ( ( ax * ax + az * az ) * ( bz - cz ) + ( bx * bx + bz * bz ) * ( cz - az ) + ( cx * cx + cz * cz ) * ( az - bz ) ) / d;
		const uz = ( ( ax * ax + az * az ) * ( cx - bx ) + ( bx * bx + bz * bz ) * ( ax - cx ) + ( cx * cx + cz * cz ) * ( bx - ax ) ) / d;
		return { a, b, c, ux, uz, r2: ( ax - ux ) ** 2 + ( az - uz ) ** 2 };
	};
	tris.push( mk( n, n + 1, n + 2 ) );
	const edges = new Map();
	for ( let i = 0; i < n; i ++ ) {
		const x = X[ i ], z = Z[ i ], keep = [];
		edges.clear();
		const edge = ( a, b ) => { const k = a < b ? a * 65536 + b : b * 65536 + a, e = edges.get( k ); if ( e ) e.n ++; else edges.set( k, { a, b, n: 1 } ); };
		for ( const t of tris ) {
			if ( ( x - t.ux ) ** 2 + ( z - t.uz ) ** 2 < t.r2 * ( 1 + 1e-9 ) ) { edge( t.a, t.b ); edge( t.b, t.c ); edge( t.c, t.a ); } else keep.push( t );
		}
		for ( const e of edges.values() ) if ( e.n === 1 ) keep.push( mk( e.a, e.b, i ) );
		tris = keep;
	}
	return tris.filter( t => t.a < n && t.b < n && t.c < n ).map( t => [ t.a, t.b, t.c ] );
}

// A soft cloth panel: an outline [ [ x, z ], ... ] puffed up to T with rounded edges R wide.
// o: { T, R, cell (vertex spacing inside), disp( x, z, d ) extra height (d: distance in from the edge; fades to 0 at
//      the edge), y0 (base), bottom (close the underside), uv: [ cx, cz ] (print centre), lift (the edge stays at y0 + lift) }
// Returns { geo, top( x, z ) (the surface height there), P (the outline) }.
export function panel( outline, o = {} ) {
	const T = o.T ?? 0.02, R = Math.max( 1e-4, o.R ?? T * 1.3 ), y0 = o.y0 ?? 0, lift = o.lift ?? 0;
	let minX = Infinity, minZ = Infinity, maxX = - Infinity, maxZ = - Infinity;
	for ( const p of outline ) { minX = Math.min( minX, p[ 0 ] ); maxX = Math.max( maxX, p[ 0 ] ); minZ = Math.min( minZ, p[ 1 ] ); maxZ = Math.max( maxZ, p[ 1 ] ); }
	const cell = o.cell ?? clamp( Math.min( maxX - minX, maxZ - minZ ) / 8, 0.008, 0.03 );
	const P = resample( outline, cell * 0.7 );
	const disp = o.disp || null;
	const prof = ( d ) => { const q = clamp( d / R, 0, 1 ); return lift + ( T - lift ) * Math.sqrt( 1 - ( 1 - q ) * ( 1 - q ) ); };
	const height = ( x, z, d ) => y0 + prof( d ) + ( disp ? disp( x, z, d ) * smooth( 0, R * 1.2, d ) : 0 );
	const pts = P.map( p => [ p[ 0 ], p[ 1 ] ] ), dist = P.map( () => 0 );
	const r = rng( 9 );
	// rings just inside the edge round it off
	const n = P.length;
	const rings = ( R > cell * 2.5 ? [ 0.14, 0.4, 0.75 ] : R > cell * 0.6 ? [ 0.18, 0.55 ] : [ 0.4 ] ).map( k => k * R );
	for ( const dd of rings ) {
		const step = Math.max( 1, Math.round( cell * 0.6 / Math.max( dd, cell * 0.6 ) ) );
		for ( let i = 0; i < n; i += step ) {
			const a = P[ ( i - 1 + n ) % n ], b = P[ ( i + 1 ) % n ];
			let nx = - ( b[ 1 ] - a[ 1 ] ), nz = b[ 0 ] - a[ 0 ];
			const l = Math.hypot( nx, nz ) || 1; nx /= l; nz /= l;
			for ( const sgn of [ 1, - 1 ] ) {
				const x = P[ i ][ 0 ] + nx * dd * sgn, z = P[ i ][ 1 ] + nz * dd * sgn;
				if ( ! inPoly( P, x, z ) ) continue;
				const real = polyDist( P, x, z );
				if ( Math.abs( real - dd ) < dd * 0.35 ) { pts.push( [ x, z ] ); dist.push( real ); }
				break;
			}
		}
	}
	// a jittered grid inside
	const inner = rings[ rings.length - 1 ] + cell * 0.45;
	for ( let x = minX + cell * 0.5; x < maxX; x += cell ) for ( let z = minZ + cell * 0.5; z < maxZ; z += cell ) {
		const jx = x + ( r() - 0.5 ) * cell * 0.08, jz = z + ( r() - 0.5 ) * cell * 0.08;
		if ( ! inPoly( P, jx, jz ) ) continue;
		const d = polyDist( P, jx, jz );
		if ( d < Math.max( inner, cell * 0.5 ) ) continue;
		pts.push( [ jx, jz ] ); dist.push( d );
	}
	// triangles inside the outline only
	const tris = delaunay( pts ).filter( ( [ a, b, c ] ) => {
		const x = ( pts[ a ][ 0 ] + pts[ b ][ 0 ] + pts[ c ][ 0 ] ) / 3, z = ( pts[ a ][ 1 ] + pts[ b ][ 1 ] + pts[ c ][ 1 ] ) / 3;
		if ( ! inPoly( P, x, z ) ) return false;
		// (a sliver along a concave stretch of the edge)
		if ( a < n && b < n && c < n ) return polyDist( P, x, z ) > cell * 0.02;
		return true;
	} );
	const pos = [], idx = [];
	for ( let i = 0; i < pts.length; i ++ ) pos.push( pts[ i ][ 0 ], height( pts[ i ][ 0 ], pts[ i ][ 1 ], dist[ i ] ), pts[ i ][ 1 ] );
	for ( const [ a, b, c ] of tris ) {
		// facing up
		const ux = pts[ b ][ 0 ] - pts[ a ][ 0 ], uz = pts[ b ][ 1 ] - pts[ a ][ 1 ], vx = pts[ c ][ 0 ] - pts[ a ][ 0 ], vz = pts[ c ][ 1 ] - pts[ a ][ 1 ];
		if ( uz * vx - ux * vz > 0 ) idx.push( a, b, c ); else idx.push( a, c, b );
	}
	if ( o.bottom !== false ) {
		const base = pts.length;
		for ( const p of P ) pos.push( p[ 0 ], y0, p[ 1 ] );
		const f = THREE.ShapeUtils.triangulateShape( P.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ), [] );
		for ( const [ a, b, c ] of f ) {
			const ux = P[ b ][ 0 ] - P[ a ][ 0 ], uz = P[ b ][ 1 ] - P[ a ][ 1 ], vx = P[ c ][ 0 ] - P[ a ][ 0 ], vz = P[ c ][ 1 ] - P[ a ][ 1 ];
			if ( uz * vx - ux * vz > 0 ) idx.push( base + a, base + c, base + b ); else idx.push( base + a, base + b, base + c );
		}
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	geo.setIndex( idx );
	geo.computeVertexNormals();
	const uvc = o.uv || [ ( minX + maxX ) / 2, ( minZ + maxZ ) / 2 ];
	uvOf( geo, uvc[ 0 ], uvc[ 1 ] );
	const top = ( x, z ) => inPoly( P, x, z ) ? height( x, z, polyDist( P, x, z ) ) : y0 + lift;
	return { geo, top, P };
}

// lay a detail's geometry onto a surface: every vertex is raised by top( x, z ) (+ off)
export function conform( geo, top, off = 0 ) {
	const p = geo.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) p.setY( i, p.getY( i ) + top( p.getX( i ), p.getZ( i ) ) + off );
	p.needsUpdate = true;
	geo.computeVertexNormals();
	geo.computeBoundingBox(); geo.computeBoundingSphere();
	return geo;
}

// a surface over a ( u, v ) grid: fn( u, v ) -> [ x, y, z ]; closeU joins u = 1 back to u = 0 (a loop round)
export function grid( nu, nv, fn, { closeU = false, uvScale = null } = {} ) {
	const pos = [], uv = [], idx = [], cu = closeU ? nu : nu + 1;
	for ( let j = 0; j <= nv; j ++ ) for ( let i = 0; i < cu; i ++ ) {
		const u = i / nu, v = j / nv, p = fn( u, v );
		pos.push( p[ 0 ], p[ 1 ], p[ 2 ] );
		uv.push( uvScale ? u * uvScale[ 0 ] : u, uvScale ? v * uvScale[ 1 ] : v );
	}
	for ( let j = 0; j < nv; j ++ ) for ( let i = 0; i < nu; i ++ ) {
		const a = j * cu + i, b = j * cu + ( i + 1 ) % cu, c = a + cu, d = b + cu;
		idx.push( a, c, b, b, c, d );
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
	geo.setIndex( idx );
	geo.computeVertexNormals();
	return geo;
}

// A soft box (bag bodies): w x h x d standing on y = 0, edges rounded r, faces subdivided so they can bulge.
// o: { seg (faces), shape( x, y, z, nx, ny, nz ) -> [ x, y, z ] moves each point after rounding }
export function softBox( w, h, d, r, o = {} ) {
	const seg = o.seg ?? 6, R = Math.min( r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4 );
	const geo = new THREE.BoxGeometry( 1, 1, 1, seg + 2, seg + 2, seg + 2 );
	const p = geo.attributes.position, half = [ w / 2, h / 2, d / 2 ], inner = half.map( v => v - R );
	// grid lines bunch up towards the edges so the rounding has vertices to bend
	const remap = ( u, hs, ins ) => { const s = Math.sign( u ), a = Math.abs( u ) * 2, k = seg + 2; const edge = 1 / k; return s * ( a <= 1 - edge ? a / ( 1 - edge ) * ins : ins + ( a - ( 1 - edge ) ) / edge * ( hs - ins ) ); };
	for ( let i = 0; i < p.count; i ++ ) {
		const v = [ p.getX( i ), p.getY( i ), p.getZ( i ) ].map( ( u, k ) => remap( u, half[ k ], inner[ k ] ) );
		const c = v.map( ( u, k ) => clamp( u, - inner[ k ], inner[ k ] ) );
		const o3 = v.map( ( u, k ) => u - c[ k ] ), l = Math.hypot( o3[ 0 ], o3[ 1 ], o3[ 2 ] ) || 1;
		let q = c.map( ( u, k ) => u + o3[ k ] / l * R );
		if ( o.shape ) q = o.shape( q[ 0 ], q[ 1 ] + h / 2, q[ 2 ], o3[ 0 ] / l, o3[ 1 ] / l, o3[ 2 ] / l );
		else q[ 1 ] += h / 2;
		p.setXYZ( i, q[ 0 ], q[ 1 ], q[ 2 ] );
	}
	// box-projected cloth UVs (per face, from the box's own face UVs scaled to metres)
	const uv = geo.attributes.uv, nrm = geo.attributes.normal;
	for ( let i = 0; i < uv.count; i ++ ) {
		const ax = Math.abs( nrm.getX( i ) ) > 0.5 ? 0 : Math.abs( nrm.getY( i ) ) > 0.5 ? 1 : 2;
		const sx = ax === 0 ? d : w, sy = ax === 1 ? d : h;
		uv.setXY( i, uv.getX( i ) * sx / UV_S, uv.getY( i ) * sy / UV_S );
	}
	return smoothNormals( geo );
}

// ---- along paths ------------------------------------------------------------------------------------------------------

// A flat band along a path of [ x, y, z ] points (Catmull-Rom): w wide, t thick, its face turned towards `up`
// (a vector, or fn( point, tangent ) -> vector). o: { seg, closed, round (soft edges) }
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _u = new THREE.Vector3();
export function band( pts, w, t, o = {} ) {
	const curve = new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( p[ 0 ], p[ 1 ], p[ 2 ] ) ), !! o.closed, 'centripetal' );
	const seg = o.seg ?? Math.max( 1, ( pts.length - ( o.closed ? 0 : 1 ) ) * 3 ), len = curve.getLength();
	const up = o.up ?? [ 0, 1, 0 ];
	// cross-section: a flat rectangle with softened corners
	const cs = o.round ? [ [ 0.5, 0 ], [ 0.36, 1 ], [ - 0.36, 1 ], [ - 0.5, 0 ], [ - 0.36, - 1 ], [ 0.36, - 1 ] ] : [ [ 0.5, 1 ], [ - 0.5, 1 ], [ - 0.5, - 1 ], [ 0.5, - 1 ] ];
	const frames = [];
	for ( let i = 0; i <= seg; i ++ ) {
		const u = i / seg, P = curve.getPointAt( o.closed ? u % 1 : u ), T = curve.getTangentAt( o.closed ? u % 1 : u, _t ).clone();
		const U = typeof up === 'function' ? up( P, T ) : up;
		_u.set( U[ 0 ], U[ 1 ], U[ 2 ] );
		const B = _b.crossVectors( T, _u ).normalize().clone();
		if ( B.lengthSq() < 1e-6 ) B.set( 1, 0, 0 );
		const N = _n.crossVectors( B, T ).normalize().clone();
		frames.push( { P, B, N } );
	}
	const geo = grid( cs.length, seg, ( a, v ) => {
		const f = frames[ Math.round( v * seg ) ], c = cs[ Math.round( a * cs.length ) % cs.length ];
		return [ f.P.x + f.B.x * c[ 0 ] * w + f.N.x * c[ 1 ] * t / 2, f.P.y + f.B.y * c[ 0 ] * w + f.N.y * c[ 1 ] * t / 2, f.P.z + f.B.z * c[ 0 ] * w + f.N.z * c[ 1 ] * t / 2 ];
	}, { closeU: true, uvScale: [ w / UV_S, len / UV_S ] } );
	return geo;
}

// a seam: a thin raised line along [ [ x, z ], ... ] on a surface top( x, z )
export function seam( pts, top, w = 0.0016, lift = 0.0006 ) {
	const P = pts.map( p => [ p[ 0 ], top( p[ 0 ], p[ 1 ] ) + lift, p[ 1 ] ] );
	return band( P, w, 0.0008, { seg: Math.max( 1, Math.ceil( pathLen( P ) / 0.02 ) ) } );
}
export const pathLen = ( P ) => { let l = 0; for ( let i = 1; i < P.length; i ++ ) l += Math.hypot( P[ i ][ 0 ] - P[ i - 1 ][ 0 ], P[ i ][ 1 ] - P[ i - 1 ][ 1 ], ( P[ i ][ 2 ] ?? 0 ) - ( P[ i - 1 ][ 2 ] ?? 0 ) ); return l; };

// points along a line or arc in x z (for seams and zips)
export const line = ( a, b, n = 2 ) => { const o = []; for ( let i = 0; i < n; i ++ ) o.push( [ lerp( a[ 0 ], b[ 0 ], i / ( n - 1 ) ), lerp( a[ 1 ], b[ 1 ], i / ( n - 1 ) ) ] ); return o; };
export const arc = ( cx, cz, rx, rz, a0, a1, n = 12 ) => { const o = []; for ( let i = 0; i <= n; i ++ ) { const a = lerp( a0, a1, i / n ); o.push( [ cx + Math.cos( a ) * rx, cz + Math.sin( a ) * rz ] ); } return o; };

// a sewn-on button: a shallow lathe with a rim, lying on a surface ( y at its back )
export function buttonGeo( r = 0.006, h = 0.0022 ) {
	return new THREE.LatheGeometry( [ [ r, 0 ], [ r * 0.92, h ], [ r * 0.55, h * 0.75 ], [ 0, h * 0.75 ] ].map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ), 8 );
}
