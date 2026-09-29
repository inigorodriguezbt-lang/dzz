// Geometry kit for the procedural vehicles. Every part is baked into one non-indexed geometry per
// vehicle model with per-vertex material data, so a whole car draws with one material (one draw call):
//   color  (vec3)  base albedo (lights: the lamp colour; paint: a tint multiplied by the car's paint)
//   aMat   (vec4)  x roughness, y metalness, z paint slot (0 none, 1 paint, 2 second paint), w emissive channel
//   uv     (vec2)  into the decal atlas (plates, gauges, liveries); plain parts sample its white corner
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const WHITE_UV = [ 0.02, 0.98 ];

// material presets: c colour, r roughness, m metalness, p paint slot, e emissive channel
export const MAT = {
	paint: { c: 0xffffff, r: 0.4, m: 0, p: 1 },
	paint2: { c: 0xffffff, r: 0.4, m: 0, p: 2 },
	chrome: { c: 0xf2f2f2, r: 0.07, m: 1 },
	alu: { c: 0xc9ccd0, r: 0.28, m: 1 },
	steel: { c: 0x8a8d90, r: 0.45, m: 1 },
	darksteel: { c: 0x3a3c3e, r: 0.5, m: 0.9 },
	trim: { c: 0x0b0b0c, r: 0.62, m: 0 },
	gloss: { c: 0x060607, r: 0.18, m: 0 },
	rubber: { c: 0x101010, r: 0.92, m: 0 },
	tread: { c: 0x0c0c0c, r: 0.97, m: 0 },
	under: { c: 0x151412, r: 0.9, m: 0.1 },
	glassDark: { c: 0x0b1015, r: 0.05, m: 0.55 },
	seat: { c: 0x1d1d1f, r: 0.95, m: 0 },
	seatTan: { c: 0x6a5238, r: 0.6, m: 0 },
	carpet: { c: 0x19191a, r: 1, m: 0 },
	dash: { c: 0x151516, r: 0.75, m: 0 },
	headliner: { c: 0xb8b2a6, r: 0.95, m: 0 },
	plastic: { c: 0x2a2b2d, r: 0.7, m: 0 },
	white: { c: 0xf4f4f2, r: 0.45, m: 0 },
	gelcoat: { c: 0xf3f3ef, r: 0.22, m: 0 },
	canvas: { c: 0x4d4f36, r: 0.95, m: 0 },
	canvasTan: { c: 0x8c8062, r: 0.95, m: 0 },
	gap: { c: 0x040405, r: 0.6, m: 0 },
	deck: { c: 0xe4e2da, r: 0.8, m: 0 },
	deckGrey: { c: 0xc9cac6, r: 0.85, m: 0 },
	antifoul: { c: 0x5c1a14, r: 0.85, m: 0 },
	wood: { c: 0x6b4a2c, r: 0.7, m: 0 },
	teak: { c: 0x8a6a45, r: 0.75, m: 0 },
	skin: { c: 0xb98463, r: 0.7, m: 0 },
	hair: { c: 0x1a120c, r: 0.85, m: 0 },
	head: { c: 0xfffcf2, r: 0.1, m: 0.2, e: 1 },
	tail: { c: 0xd01010, r: 0.15, m: 0.1, e: 2 },
	reverse: { c: 0xfafafa, r: 0.1, m: 0.2, e: 3 },
	indL: { c: 0xff8a10, r: 0.15, m: 0.1, e: 4 },
	indR: { c: 0xff8a10, r: 0.15, m: 0.1, e: 5 },
	red: { c: 0xff1a1a, r: 0.2, m: 0, e: 6 },
	blue: { c: 0x1a4dff, r: 0.2, m: 0, e: 7 },
	gauge: { c: 0xffffff, r: 0.3, m: 0, e: 8 },
	navRed: { c: 0xff2020, r: 0.2, m: 0, e: 9 },
	navGreen: { c: 0x20ff40, r: 0.2, m: 0, e: 9 },
	navWhite: { c: 0xffffff, r: 0.2, m: 0, e: 9 },
	strobe: { c: 0xff3030, r: 0.2, m: 0, e: 10 },
	reflector: { c: 0xb01010, r: 0.2, m: 0.3 },
	amber: { c: 0xd87a10, r: 0.2, m: 0.3 },
};

export function mat( base, over ) { return Object.assign( {}, typeof base === 'string' ? MAT[ base ] : base, over ); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _c = new THREE.Color();

export function makeMatrix( t ) {
	if ( ! t ) return null;
	if ( t.isMatrix4 ) return t;
	_p.set( ...( t.p || [ 0, 0, 0 ] ) );
	_e.set( ...( t.r || [ 0, 0, 0 ] ), t.order || 'XYZ' );
	_q.setFromEuler( _e );
	if ( t.q ) _q.copy( t.q );
	const s = t.s ?? 1;
	if ( typeof s === 'number' ) _s.set( s, s, s ); else _s.set( ...s );
	return new THREE.Matrix4().compose( _p, _q, _s );
}

export class Kit {
	constructor() {
		this.parts = []; // { pos, nrm, uv, col, mat, tags }
		this.tag = null; // 'near' parts are left out of the far model
		this.mirror = false;
	}

	// run fn with a tag on every part it adds
	with( tag, fn ) { const t = this.tag; this.tag = tag; fn(); this.tag = t; }

	add( geo, m, t = null ) {
		m = typeof m === 'string' ? MAT[ m ] : m;
		let g = geo.index ? geo.toNonIndexed() : geo;
		if ( ! g.attributes.normal ) g.computeVertexNormals();
		const M = makeMatrix( t );
		const n = g.attributes.position.count;
		const pos = new Float32Array( g.attributes.position.array.length );
		pos.set( g.attributes.position.array );
		const nrm = new Float32Array( n * 3 );
		nrm.set( g.attributes.normal.array );
		if ( M ) {
			_n3.getNormalMatrix( M );
			for ( let i = 0; i < n; i ++ ) {
				_v.fromArray( pos, i * 3 ).applyMatrix4( M ).toArray( pos, i * 3 );
				_v.fromArray( nrm, i * 3 ).applyMatrix3( _n3 ).normalize().toArray( nrm, i * 3 );
			}
			// a mirroring transform flips the winding
			if ( M.determinant() < 0 ) flipWinding( pos, nrm );
		}
		const uv = new Float32Array( n * 2 );
		const guv = g.attributes.uv;
		if ( m.uv && guv ) {
			const [ u0, v0, u1, v1 ] = m.uv;
			for ( let i = 0; i < n; i ++ ) { uv[ i * 2 ] = u0 + ( u1 - u0 ) * guv.getX( i ); uv[ i * 2 + 1 ] = v0 + ( v1 - v0 ) * guv.getY( i ); }
		} else for ( let i = 0; i < n; i ++ ) { uv[ i * 2 ] = WHITE_UV[ 0 ]; uv[ i * 2 + 1 ] = WHITE_UV[ 1 ]; }
		const col = new Float32Array( n * 3 );
		_c.set( m.c ?? 0xffffff );
		if ( m.srgb !== false ) _c.convertSRGBToLinear();
		for ( let i = 0; i < n; i ++ ) { col[ i * 3 ] = _c.r; col[ i * 3 + 1 ] = _c.g; col[ i * 3 + 2 ] = _c.b; }
		const mt = new Float32Array( n * 4 );
		for ( let i = 0; i < n; i ++ ) { mt[ i * 4 ] = m.r ?? 0.5; mt[ i * 4 + 1 ] = m.m ?? 0; mt[ i * 4 + 2 ] = m.p || 0; mt[ i * 4 + 3 ] = m.e || 0; }
		const part = { pos, nrm, uv, col, mat: mt, tag: this.tag };
		this.parts.push( part );
		if ( g !== geo ) g.dispose();
		return part;
	}

	// append an already built kit geometry (keeps its per-vertex material data) under a transform
	addBuilt( geo, t = null ) {
		const M = makeMatrix( t );
		const n = geo.attributes.position.count;
		const pos = geo.attributes.position.array.slice(), nrm = geo.attributes.normal.array.slice();
		if ( M ) {
			_n3.getNormalMatrix( M );
			for ( let i = 0; i < n; i ++ ) {
				_v.fromArray( pos, i * 3 ).applyMatrix4( M ).toArray( pos, i * 3 );
				_v.fromArray( nrm, i * 3 ).applyMatrix3( _n3 ).normalize().toArray( nrm, i * 3 );
			}
			if ( M.determinant() < 0 ) flipWinding( pos, nrm );
		}
		const part = { pos, nrm, uv: geo.attributes.uv.array.slice(), col: geo.attributes.color.array.slice(), mat: geo.attributes.aMat.array.slice(), tag: this.tag };
		this.parts.push( part );
		return part;
	}

	// the same part again, mirrored across x = 0
	addMirrored( geo, m, t ) {
		this.add( geo, m, t );
		const M = makeMatrix( t ) || new THREE.Matrix4();
		const mir = new THREE.Matrix4().makeScale( - 1, 1, 1 ).multiply( M );
		this.add( geo, m, mir );
	}

	// ---- primitives ----
	box( w, h, d, m, t, r = 0 ) {
		const g = r > 0 ? new RoundedBoxGeometry( w, h, d, 2, Math.min( r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3 ) ) : new THREE.BoxGeometry( w, h, d );
		return this.add( g, m, t );
	}
	cyl( rt, rb, h, m, t, seg = 16, open = false ) { return this.add( new THREE.CylinderGeometry( rt, rb, h, seg, 1, open ), m, t ); }
	sphere( r, m, t, ws = 14, hs = 10 ) { return this.add( new THREE.SphereGeometry( r, ws, hs ), m, t ); }
	torus( R, r, m, t, rs = 8, ts = 24, arc = Math.PI * 2 ) { return this.add( new THREE.TorusGeometry( R, r, rs, ts, arc ), m, t ); }
	lathe( pts, m, t, seg = 20 ) { return this.add( new THREE.LatheGeometry( pts.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ), seg ), m, t ); }
	tube( pts, r, m, seg = 24, radial = 8, closed = false ) {
		const curve = new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( ...p ) ), closed, 'catmullrom', 0.2 );
		return this.add( new THREE.TubeGeometry( curve, seg, r, radial, closed ), m );
	}
	// a box running from a to b (w across, h along `up`)
	beam( a, b, w, h, m, up = [ 0, 1, 0 ], r = 0 ) {
		const A = new THREE.Vector3( ...a ), B = new THREE.Vector3( ...b );
		const len = A.distanceTo( B );
		const z = B.clone().sub( A ).normalize();
		let y = new THREE.Vector3( ...up );
		let x = new THREE.Vector3().crossVectors( y, z );
		if ( x.lengthSq() < 1e-6 ) x.set( 1, 0, 0 );
		x.normalize(); y = new THREE.Vector3().crossVectors( z, x ).normalize();
		const M = new THREE.Matrix4().makeBasis( x, y, z ).setPosition( A.clone().add( B ).multiplyScalar( 0.5 ) );
		const g = r > 0 ? new RoundedBoxGeometry( w, h, len, 2, Math.min( r, w / 2 - 1e-3, h / 2 - 1e-3 ) ) : new THREE.BoxGeometry( w, h, len );
		return this.add( g, m, M );
	}
	// a rod (cylinder) from a to b
	rod( a, b, r, m, seg = 10, r2 = r ) {
		const A = new THREE.Vector3( ...a ), B = new THREE.Vector3( ...b );
		const len = A.distanceTo( B );
		const q = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), B.clone().sub( A ).normalize() );
		const M = new THREE.Matrix4().compose( A.clone().add( B ).multiplyScalar( 0.5 ), q, new THREE.Vector3( 1, 1, 1 ) );
		return this.add( new THREE.CylinderGeometry( r2, r, len, seg ), m, M );
	}
	// planar polygon through 3D points (fan), both faces
	poly( pts, m, twoSided = false ) {
		const pos = [];
		for ( let i = 1; i < pts.length - 1; i ++ ) pos.push( ...pts[ 0 ], ...pts[ i ], ...pts[ i + 1 ] );
		if ( twoSided ) for ( let i = 1; i < pts.length - 1; i ++ ) pos.push( ...pts[ 0 ], ...pts[ i + 1 ], ...pts[ i ] );
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.computeVertexNormals();
		return this.add( g, m );
	}
	// quad with uvs (for decals): corners in order bottom-left, bottom-right, top-right, top-left
	quad( a, b, c, d, m ) {
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ ...a, ...b, ...c, ...a, ...c, ...d ], 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( [ 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1 ], 2 ) );
		g.computeVertexNormals();
		return this.add( g, m );
	}
	// parametric surface fn( u, v ) -> [ x, y, z ] over nu x nv cells
	grid( fn, nu, nv, m, t ) {
		const pos = [], uv = [];
		const P = [];
		for ( let j = 0; j <= nv; j ++ ) for ( let i = 0; i <= nu; i ++ ) P.push( fn( i / nu, j / nv ) );
		for ( let j = 0; j < nv; j ++ ) for ( let i = 0; i < nu; i ++ ) {
			const a = j * ( nu + 1 ) + i, b = a + 1, c = a + nu + 1, d = c + 1;
			pos.push( ...P[ a ], ...P[ b ], ...P[ d ], ...P[ a ], ...P[ d ], ...P[ c ] );
			uv.push( i / nu, j / nv, ( i + 1 ) / nu, j / nv, ( i + 1 ) / nu, ( j + 1 ) / nv, i / nu, j / nv, ( i + 1 ) / nu, ( j + 1 ) / nv, i / nu, ( j + 1 ) / nv );
		}
		let g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
		g = smoothNormals( g );
		return this.add( g, m, t );
	}
	// loft through cross-sections: rings[ i ] = array of [ x, y, z ] (same count each), open or closed rings
	loft( rings, m, { closed = false, capStart = false, capEnd = false, crease = 0.6 } = {} ) {
		const pos = [];
		const n = rings[ 0 ].length;
		const segs = closed ? n : n - 1;
		for ( let i = 0; i < rings.length - 1; i ++ ) {
			const A = rings[ i ], B = rings[ i + 1 ];
			for ( let k = 0; k < segs; k ++ ) {
				const k2 = ( k + 1 ) % n;
				pos.push( ...A[ k ], ...B[ k ], ...B[ k2 ], ...A[ k ], ...B[ k2 ], ...A[ k2 ] );
			}
		}
		const cap = ( R, flip ) => {
			const c = [ 0, 0, 0 ];
			for ( const p of R ) { c[ 0 ] += p[ 0 ] / n; c[ 1 ] += p[ 1 ] / n; c[ 2 ] += p[ 2 ] / n; }
			for ( let k = 0; k < segs; k ++ ) {
				const k2 = ( k + 1 ) % n;
				if ( flip ) pos.push( ...c, ...R[ k2 ], ...R[ k ] ); else pos.push( ...c, ...R[ k ], ...R[ k2 ] );
			}
		};
		if ( capStart ) cap( rings[ 0 ], true );
		if ( capEnd ) cap( rings[ rings.length - 1 ], false );
		let g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g = toCreasedNormals( g, crease );
		return this.add( g, m );
	}
	// side profile [ [ f, y ], ... ] (f forward) extruded across x from -hw to +hw
	extrudeSide( pts, hw, m, { bevel = 0.02, segs = 2, steps = 1, crease = 0.5, curve = 6 } = {} ) {
		const g = sideExtrude( pts, hw, { bevel, segs, steps, curve } );
		return this.add( toCreasedNormals( g, crease ), m );
	}

	// merge the parts (optionally filtered) into one geometry
	build( filter = null ) {
		const parts = filter ? this.parts.filter( filter ) : this.parts;
		let n = 0;
		for ( const p of parts ) n += p.pos.length / 3;
		const pos = new Float32Array( n * 3 ), nrm = new Float32Array( n * 3 ), uv = new Float32Array( n * 2 ), col = new Float32Array( n * 3 ), mt = new Float32Array( n * 4 );
		let o = 0;
		for ( const p of parts ) {
			const c = p.pos.length / 3;
			pos.set( p.pos, o * 3 ); nrm.set( p.nrm, o * 3 ); uv.set( p.uv, o * 2 ); col.set( p.col, o * 3 ); mt.set( p.mat, o * 4 );
			o += c;
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
		g.setAttribute( 'normal', new THREE.BufferAttribute( nrm, 3 ) );
		g.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
		g.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
		g.setAttribute( 'aMat', new THREE.BufferAttribute( mt, 4 ) );
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;
	}
}

function flipWinding( pos, nrm ) {
	for ( let i = 0; i < pos.length; i += 9 ) {
		for ( let k = 0; k < 3; k ++ ) {
			const a = pos[ i + 3 + k ]; pos[ i + 3 + k ] = pos[ i + 6 + k ]; pos[ i + 6 + k ] = a;
			const b = nrm[ i + 3 + k ]; nrm[ i + 3 + k ] = nrm[ i + 6 + k ]; nrm[ i + 6 + k ] = b;
		}
	}
}

// smooth normals across shared positions (for parametric grids)
export function smoothNormals( g ) {
	g.computeVertexNormals();
	return toCreasedNormals( g, Math.PI * 0.45 );
}

// extrude a side profile (f, y) across x. Built by hand (instead of ExtrudeGeometry) so the caps
// are triangulated with ShapeUtils and the rim gets rounded bevel rings.
export function sideExtrude( pts, hw, { bevel = 0.02, segs = 2, steps = 1, curve = 6 } = {} ) {
	const shape = new THREE.Shape( pts.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ) );
	const g = new THREE.ExtrudeGeometry( shape, {
		depth: Math.max( 0.001, hw * 2 - bevel * 2 ), steps, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: - bevel, bevelSegments: segs, curveSegments: curve,
	} );
	// shape x (forward) -> vehicle -z, extrusion z -> vehicle x
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {
		const f = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		p.setXYZ( i, z - ( hw - bevel ), y, - f );
	}
	// (f, y, z) -> (z, y, -f) is a proper rotation, so the winding stays outward
	g.deleteAttribute( 'normal' );
	g.deleteAttribute( 'uv' );
	g.computeVertexNormals();
	return g;
}

// a closed 2D outline as [ f, y ] points: rounded polygon through control points with corner radii
// pts: [ [ f, y, radius ], ... ]
export function roundedOutline( pts, seg = 4 ) {
	const out = [];
	const n = pts.length;
	for ( let i = 0; i < n; i ++ ) {
		const [ x, y, r = 0 ] = pts[ i ];
		if ( r <= 0 ) { out.push( [ x, y ] ); continue; }
		const P = pts[ ( i - 1 + n ) % n ], N = pts[ ( i + 1 ) % n ];
		const ax = P[ 0 ] - x, ay = P[ 1 ] - y, bx = N[ 0 ] - x, by = N[ 1 ] - y;
		const la = Math.hypot( ax, ay ), lb = Math.hypot( bx, by );
		const rr = Math.min( r, la * 0.45, lb * 0.45 );
		const s = [ x + ax / la * rr, y + ay / la * rr ], e = [ x + bx / lb * rr, y + by / lb * rr ];
		// quadratic bezier from s through the corner to e
		for ( let k = 0; k <= seg; k ++ ) {
			const t = k / seg, u = 1 - t;
			out.push( [ u * u * s[ 0 ] + 2 * u * t * x + t * t * e[ 0 ], u * u * s[ 1 ] + 2 * u * t * y + t * t * e[ 1 ] ] );
		}
	}
	return out;
}

// arc points (f, y) around a centre from angle a0 to a1
export function arc( cf, cy, r, a0, a1, seg = 10 ) {
	const out = [];
	for ( let k = 0; k <= seg; k ++ ) { const a = a0 + ( a1 - a0 ) * k / seg; out.push( [ cf + Math.cos( a ) * r, cy + Math.sin( a ) * r ] ); }
	return out;
}

export const smooth = ( a, b, x ) => { const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };
export const lerp = ( a, b, t ) => a + ( b - a ) * t;
