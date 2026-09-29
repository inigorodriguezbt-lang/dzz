// A growable mesh builder for the building worker (no three.js): quads, boxes, cylinders, lathes and
// facade quads, with per-vertex texture-array layer, tint, tags (building / storey, used to hide shells
// when the real interior is loaded) and facade window parameters.
//
// Vertex format (see materials.js for the shader side):
//   position  f32x3      normal i8x3 (normalized)   aUv f32x2 (texture repeats)
//   color     u8x3 (sRGB tint, normalized)          aMat u8 (layer | 64 interior | 128 glow)
//   aTag      u16x2 (building index + 1, storey or 255 = never hidden)
//   aWin      u16x4 (u*32, v*32, bay*256, seed)     aWin2 u8x4 (winW*20, winH*20, sill*20, style)

export const F_IN = 64; // interior surface: dimmer sky light
export const F_GLOW = 128; // emissive (lanterns, candles)

export class Geo {
	constructor( cap = 2048 ) {
		this.cap = 0; this.icap = 0;
		this.n = 0; this.ni = 0;
		this._grow( cap, cap * 2 );
		// current transform (3x4, row-major: x' = m0 x + m1 y + m2 z + m3 ...)
		this.m = [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0 ];
		this.stack = [];
		this.tag0 = 0; this.tag1 = 255;
		this.win = null; // { u0, bay, w, h, sill, style, seed } for facade()
	}

	_grow( vc, ic ) {
		if ( vc > this.cap ) {
			const nc = Math.max( vc, this.cap * 2 );
			const g = ( A, k, old ) => { const a = new A( nc * k ); if ( old ) a.set( old.subarray( 0, this.n * k ) ); return a; };
			this.pos = g( Float32Array, 3, this.pos ); this.nor = g( Int8Array, 3, this.nor ); this.uv = g( Float32Array, 2, this.uv );
			this.col = g( Uint8Array, 3, this.col ); this.mat = g( Uint8Array, 1, this.mat ); this.tag = g( Uint16Array, 2, this.tag );
			this.wn = g( Uint16Array, 4, this.wn ); this.wn2 = g( Uint8Array, 4, this.wn2 );
			this.cap = nc;
		}
		if ( ic > this.icap ) {
			const nc = Math.max( ic, this.icap * 2 );
			const a = new Uint32Array( nc );
			if ( this.idx ) a.set( this.idx.subarray( 0, this.ni ) );
			this.idx = a; this.icap = nc;
		}
	}

	// ---- transforms ----
	identity() { this.m = [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0 ]; return this; }
	push() { this.stack.push( this.m.slice() ); return this; }
	pop() { this.m = this.stack.pop(); return this; }
	// post-multiply a translation then a rotation about y (radians, three.js convention) and optional tilt about x / z
	translate( x, y, z ) {
		const m = this.m;
		m[ 3 ] += m[ 0 ] * x + m[ 1 ] * y + m[ 2 ] * z;
		m[ 7 ] += m[ 4 ] * x + m[ 5 ] * y + m[ 6 ] * z;
		m[ 11 ] += m[ 8 ] * x + m[ 9 ] * y + m[ 10 ] * z;
		return this;
	}
	rotY( a ) {
		if ( ! a ) return this;
		const c = Math.cos( a ), s = Math.sin( a ), m = this.m;
		// R = [ c 0 s ; 0 1 0 ; -s 0 c ]
		for ( let r = 0; r < 3; r ++ ) {
			const a0 = m[ r * 4 ], a2 = m[ r * 4 + 2 ];
			m[ r * 4 ] = a0 * c - a2 * s;
			m[ r * 4 + 2 ] = a0 * s + a2 * c;
		}
		return this;
	}
	rotX( a ) {
		if ( ! a ) return this;
		const c = Math.cos( a ), s = Math.sin( a ), m = this.m;
		// R = [ 1 0 0 ; 0 c -s ; 0 s c ]
		for ( let r = 0; r < 3; r ++ ) {
			const a1 = m[ r * 4 + 1 ], a2 = m[ r * 4 + 2 ];
			m[ r * 4 + 1 ] = a1 * c + a2 * s;
			m[ r * 4 + 2 ] = - a1 * s + a2 * c;
		}
		return this;
	}
	rotZ( a ) {
		if ( ! a ) return this;
		const c = Math.cos( a ), s = Math.sin( a ), m = this.m;
		// R = [ c -s 0 ; s c 0 ; 0 0 1 ]
		for ( let r = 0; r < 3; r ++ ) {
			const a0 = m[ r * 4 ], a1 = m[ r * 4 + 1 ];
			m[ r * 4 ] = a0 * c + a1 * s;
			m[ r * 4 + 1 ] = - a0 * s + a1 * c;
		}
		return this;
	}
	// building frame: local (x, z) -> output via the bake angle (local x -> (cos a, sin a))
	frame( ox, oy, oz, angle ) {
		const c = Math.cos( angle ), s = Math.sin( angle );
		this.m = [ c, 0, - s, ox, 0, 1, 0, oy, s, 0, c, oz ];
		return this;
	}

	setTag( bid, storey = 255 ) { this.tag0 = bid; this.tag1 = storey; return this; }

	// ---- raw emit ----
	_v( x, y, z, nx, ny, nz, u, v, M ) {
		const m = this.m, i = this.n ++;
		const p = i * 3;
		this.pos[ p ] = m[ 0 ] * x + m[ 1 ] * y + m[ 2 ] * z + m[ 3 ];
		this.pos[ p + 1 ] = m[ 4 ] * x + m[ 5 ] * y + m[ 6 ] * z + m[ 7 ];
		this.pos[ p + 2 ] = m[ 8 ] * x + m[ 9 ] * y + m[ 10 ] * z + m[ 11 ];
		const tx = m[ 0 ] * nx + m[ 1 ] * ny + m[ 2 ] * nz, ty = m[ 4 ] * nx + m[ 5 ] * ny + m[ 6 ] * nz, tz = m[ 8 ] * nx + m[ 9 ] * ny + m[ 10 ] * nz;
		const l = 127 / ( Math.hypot( tx, ty, tz ) || 1 );
		this.nor[ p ] = Math.round( tx * l ); this.nor[ p + 1 ] = Math.round( ty * l ); this.nor[ p + 2 ] = Math.round( tz * l );
		this.uv[ i * 2 ] = u; this.uv[ i * 2 + 1 ] = v;
		const c = M.c;
		this.col[ p ] = c[ 0 ]; this.col[ p + 1 ] = c[ 1 ]; this.col[ p + 2 ] = c[ 2 ];
		this.mat[ i ] = M.l | ( M.f || 0 );
		this.tag[ i * 2 ] = this.tag0; this.tag[ i * 2 + 1 ] = this.tag1;
		this.wn[ i * 4 + 3 ] = 0; this.wn2[ i * 4 + 3 ] = 0;
		return i;
	}

	// quad a-b-c-d counter-clockwise seen from the front; uv given per corner
	quadUV( a, b, c, d, uvs, M, n = null ) {
		this._grow( this.n + 4, this.ni + 6 );
		if ( ! n ) n = qnormal( a, b, c );
		const i = this._v( a[ 0 ], a[ 1 ], a[ 2 ], n[ 0 ], n[ 1 ], n[ 2 ], uvs[ 0 ], uvs[ 1 ], M );
		this._v( b[ 0 ], b[ 1 ], b[ 2 ], n[ 0 ], n[ 1 ], n[ 2 ], uvs[ 2 ], uvs[ 3 ], M );
		this._v( c[ 0 ], c[ 1 ], c[ 2 ], n[ 0 ], n[ 1 ], n[ 2 ], uvs[ 4 ], uvs[ 5 ], M );
		this._v( d[ 0 ], d[ 1 ], d[ 2 ], n[ 0 ], n[ 1 ], n[ 2 ], uvs[ 6 ], uvs[ 7 ], M );
		const I = this.idx, k = this.ni;
		I[ k ] = i; I[ k + 1 ] = i + 1; I[ k + 2 ] = i + 2; I[ k + 3 ] = i; I[ k + 4 ] = i + 2; I[ k + 5 ] = i + 3;
		this.ni += 6;
		return i;
	}

	// quad with uv projected on its own plane (u along a->b, v perpendicular), in metres / M.s
	quad( a, b, c, d, M ) {
		const n = qnormal( a, b, c );
		let tx = b[ 0 ] - a[ 0 ], ty = b[ 1 ] - a[ 1 ], tz = b[ 2 ] - a[ 2 ];
		const tl = Math.hypot( tx, ty, tz ) || 1; tx /= tl; ty /= tl; tz /= tl;
		// bitangent = n x t
		const bx = n[ 1 ] * tz - n[ 2 ] * ty, by = n[ 2 ] * tx - n[ 0 ] * tz, bz = n[ 0 ] * ty - n[ 1 ] * tx;
		const s = 1 / ( M.s || 1 );
		const ox = M.uo || 0, oy = M.vo || 0;
		const P = ( p ) => [ ( ( p[ 0 ] - a[ 0 ] ) * tx + ( p[ 1 ] - a[ 1 ] ) * ty + ( p[ 2 ] - a[ 2 ] ) * tz ) * s + ox, ( ( p[ 0 ] - a[ 0 ] ) * bx + ( p[ 1 ] - a[ 1 ] ) * by + ( p[ 2 ] - a[ 2 ] ) * bz ) * s + oy ];
		const A = P( a ), B = P( b ), C = P( c ), D = P( d );
		return this.quadUV( a, b, c, d, [ A[ 0 ], A[ 1 ], B[ 0 ], B[ 1 ], C[ 0 ], C[ 1 ], D[ 0 ], D[ 1 ] ], M, n );
	}

	tri( a, b, c, M ) {
		this._grow( this.n + 3, this.ni + 3 );
		const n = qnormal( a, b, c );
		let tx = b[ 0 ] - a[ 0 ], ty = b[ 1 ] - a[ 1 ], tz = b[ 2 ] - a[ 2 ];
		const tl = Math.hypot( tx, ty, tz ) || 1; tx /= tl; ty /= tl; tz /= tl;
		const bx = n[ 1 ] * tz - n[ 2 ] * ty, by = n[ 2 ] * tx - n[ 0 ] * tz, bz = n[ 0 ] * ty - n[ 1 ] * tx;
		const s = 1 / ( M.s || 1 );
		const i = this.n;
		for ( const p of [ a, b, c ] ) {
			const u = ( ( p[ 0 ] - a[ 0 ] ) * tx + ( p[ 1 ] - a[ 1 ] ) * ty + ( p[ 2 ] - a[ 2 ] ) * tz ) * s;
			const v = ( ( p[ 0 ] - a[ 0 ] ) * bx + ( p[ 1 ] - a[ 1 ] ) * by + ( p[ 2 ] - a[ 2 ] ) * bz ) * s;
			this._v( p[ 0 ], p[ 1 ], p[ 2 ], n[ 0 ], n[ 1 ], n[ 2 ], u, v, M );
		}
		this.idx[ this.ni ++ ] = i; this.idx[ this.ni ++ ] = i + 1; this.idx[ this.ni ++ ] = i + 2;
	}

	// axis-aligned box in the current space. M: material or { px, nx, py, ny, pz, nz } per face.
	// skip: bit mask of faces not drawn (1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z)
	box( x0, y0, z0, x1, y1, z1, M, skip = 0 ) {
		if ( x1 < x0 ) { const t = x0; x0 = x1; x1 = t; }
		if ( y1 < y0 ) { const t = y0; y0 = y1; y1 = t; }
		if ( z1 < z0 ) { const t = z0; z0 = z1; z1 = t; }
		const per = M.l === undefined;
		const f = ( k ) => per ? ( M[ k ] || M.all ) : M;
		let q;
		if ( ! ( skip & 1 ) && ( q = f( 'px' ) ) ) this._face( [ x1, y0, z1 ], [ x1, y0, z0 ], [ x1, y1, z0 ], [ x1, y1, z1 ], - z1, - z0, y0, y1, q, [ 1, 0, 0 ] );
		if ( ! ( skip & 2 ) && ( q = f( 'nx' ) ) ) this._face( [ x0, y0, z0 ], [ x0, y0, z1 ], [ x0, y1, z1 ], [ x0, y1, z0 ], z0, z1, y0, y1, q, [ - 1, 0, 0 ] );
		if ( ! ( skip & 4 ) && ( q = f( 'py' ) ) ) this._face( [ x0, y1, z1 ], [ x1, y1, z1 ], [ x1, y1, z0 ], [ x0, y1, z0 ], x0, x1, - z1, - z0, q, [ 0, 1, 0 ] );
		if ( ! ( skip & 8 ) && ( q = f( 'ny' ) ) ) this._face( [ x0, y0, z0 ], [ x1, y0, z0 ], [ x1, y0, z1 ], [ x0, y0, z1 ], x0, x1, z0, z1, q, [ 0, - 1, 0 ] );
		if ( ! ( skip & 16 ) && ( q = f( 'pz' ) ) ) this._face( [ x0, y0, z1 ], [ x1, y0, z1 ], [ x1, y1, z1 ], [ x0, y1, z1 ], x0, x1, y0, y1, q, [ 0, 0, 1 ] );
		if ( ! ( skip & 32 ) && ( q = f( 'nz' ) ) ) this._face( [ x1, y0, z0 ], [ x0, y0, z0 ], [ x0, y1, z0 ], [ x1, y1, z0 ], - x1, - x0, y0, y1, q, [ 0, 0, - 1 ] );
	}

	_face( a, b, c, d, u0, u1, v0, v1, M, n ) {
		const s = 1 / ( M.s || 1 );
		let uvs;
		const ou = M.uo || 0, ov = M.vo || 0;
		if ( M.r ) uvs = [ v0 * s + ou, u0 * s + ov, v0 * s + ou, u1 * s + ov, v1 * s + ou, u1 * s + ov, v1 * s + ou, u0 * s + ov ];
		else if ( M.fit ) uvs = [ M.fit[ 0 ], M.fit[ 1 ], M.fit[ 2 ], M.fit[ 1 ], M.fit[ 2 ], M.fit[ 3 ], M.fit[ 0 ], M.fit[ 3 ] ];
		else uvs = [ u0 * s + ou, v0 * s + ov, u1 * s + ou, v0 * s + ov, u1 * s + ou, v1 * s + ov, u0 * s + ou, v1 * s + ov ];
		this.quadUV( a, b, c, d, uvs, M, n );
	}

	// box given by centre and half sizes
	cbox( cx, cy, cz, hx, hy, hz, M, skip = 0 ) { this.box( cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz, M, skip ); }

	// vertical wall quad from (x0,z0) to (x1,z1) facing its right-hand side outward, with facade windows.
	// win: { bay, w, h, sill, style, seed } or null; u runs 0..len from (x0,z0)
	facade( x0, z0, x1, z1, y0, y1, M, win, uStart = 0 ) {
		const len = Math.hypot( x1 - x0, z1 - z0 );
		if ( len < 1e-3 ) return;
		// outward normal: the wall runs to the right of a viewer outside, so n = t x up = (-dz, 0, dx) / len
		const nx = - ( z1 - z0 ) / len, nz = ( x1 - x0 ) / len;
		const s = 1 / ( M.s || 1 );
		const a = [ x0, y0, z0 ], b = [ x1, y0, z1 ], c = [ x1, y1, z1 ], d = [ x0, y1, z0 ];
		const u0 = ( uStart ) * s, u1 = ( uStart + len ) * s;
		const uv = M.r ? [ y0 * s, u0, y0 * s, u1, y1 * s, u1, y1 * s, u0 ] : [ u0, y0 * s, u1, y0 * s, u1, y1 * s, u0, y1 * s ];
		const i = this.quadUV( a, b, c, d, uv, M, [ nx, 0, nz ] );
		if ( win && win.style ) {
			const H = y1 - y0;
			const set = ( k, u, v ) => {
				const w = this.wn, w2 = this.wn2, o = ( i + k ) * 4;
				w[ o ] = Math.round( u * 32 ); w[ o + 1 ] = Math.round( v * 32 ); w[ o + 2 ] = Math.round( win.bay * 256 ); w[ o + 3 ] = win.seed & 0xffff;
				w2[ o ] = Math.round( win.w * 20 ); w2[ o + 1 ] = Math.round( win.h * 20 ); w2[ o + 2 ] = Math.round( win.sill * 20 ); w2[ o + 3 ] = win.style;
			};
			const vb = win.v0 || 0;
			set( 0, 0, vb ); set( 1, len, vb ); set( 2, len, vb + H ); set( 3, 0, vb + H );
		}
	}

	// vertical cylinder (or prism with seg sides), open or capped
	cyl( cx, y0, cz, r, h, seg, M, caps = 3, r1 = r ) {
		const top = y0 + h;
		const s = 1 / ( M.s || 1 );
		for ( let k = 0; k < seg; k ++ ) {
			const a0 = k / seg * Math.PI * 2, a1 = ( k + 1 ) / seg * Math.PI * 2;
			const c0 = Math.cos( a0 ), s0 = Math.sin( a0 ), c1 = Math.cos( a1 ), s1 = Math.sin( a1 );
			const am = ( a0 + a1 ) / 2;
			// cone normal: (cos * h, r - r1, sin * h)
			const nl = Math.hypot( h, r - r1 ) || 1;
			const nx = Math.cos( am ) * h / nl, ny = ( r - r1 ) / nl, nz = Math.sin( am ) * h / nl;
			const u0 = - a1 * r * s, u1 = - a0 * r * s;
			// seen from outside the angle decreases to the right: a1 is the left edge
			this.quadUV( [ cx + c1 * r, y0, cz + s1 * r ], [ cx + c0 * r, y0, cz + s0 * r ], [ cx + c0 * r1, top, cz + s0 * r1 ], [ cx + c1 * r1, top, cz + s1 * r1 ],
				[ u0, y0 * s, u1, y0 * s, u1, top * s, u0, top * s ], M, [ nx, ny, nz ] );
		}
		// caps as fans (triangles)
		if ( caps & 1 && r1 > 0 ) this._cap( cx, top, cz, r1, seg, M, 1 );
		if ( caps & 2 && r > 0 ) this._cap( cx, y0, cz, r, seg, M, - 1 );
	}

	_cap( cx, y, cz, r, seg, M, dir ) {
		const s = 1 / ( M.s || 1 );
		this._grow( this.n + seg + 1, this.ni + seg * 3 );
		const c = this._v( cx, y, cz, 0, dir, 0, cx * s, cz * s, M );
		for ( let k = 0; k < seg; k ++ ) {
			const a = k / seg * Math.PI * 2;
			this._v( cx + Math.cos( a ) * r, y, cz + Math.sin( a ) * r, 0, dir, 0, ( cx + Math.cos( a ) * r ) * s, ( cz + Math.sin( a ) * r ) * s, M );
		}
		for ( let k = 0; k < seg; k ++ ) {
			const a = c + 1 + k, b = c + 1 + ( k + 1 ) % seg;
			if ( dir > 0 ) { this.idx[ this.ni ++ ] = c; this.idx[ this.ni ++ ] = b; this.idx[ this.ni ++ ] = a; } else { this.idx[ this.ni ++ ] = c; this.idx[ this.ni ++ ] = a; this.idx[ this.ni ++ ] = b; }
		}
	}

	// surface of revolution around the y axis through (cx, cz); prof = [[r, y], ...] bottom to top
	lathe( cx, cz, prof, seg, M, a0 = 0, a1 = Math.PI * 2 ) {
		const s = 1 / ( M.s || 1 );
		const n = prof.length;
		this._grow( this.n + ( seg + 1 ) * n, this.ni + seg * ( n - 1 ) * 6 );
		const base = this.n;
		let acc = 0;
		const vs = [ 0 ];
		for ( let j = 1; j < n; j ++ ) { acc += Math.hypot( prof[ j ][ 0 ] - prof[ j - 1 ][ 0 ], prof[ j ][ 1 ] - prof[ j - 1 ][ 1 ] ); vs.push( acc ); }
		for ( let k = 0; k <= seg; k ++ ) {
			const a = a0 + ( a1 - a0 ) * k / seg, ca = Math.cos( a ), sa = Math.sin( a );
			for ( let j = 0; j < n; j ++ ) {
				const [ r, y ] = prof[ j ];
				// profile normal from neighbours
				const p0 = prof[ Math.max( 0, j - 1 ) ], p1 = prof[ Math.min( n - 1, j + 1 ) ];
				let dr = p1[ 0 ] - p0[ 0 ], dy = p1[ 1 ] - p0[ 1 ];
				const l = Math.hypot( dr, dy ) || 1; dr /= l; dy /= l;
				this._v( cx + ca * r, y, cz + sa * r, ca * dy, - dr, sa * dy, a * Math.max( r, 0.05 ) * s, vs[ j ] * s, M );
			}
		}
		for ( let k = 0; k < seg; k ++ ) for ( let j = 0; j < n - 1; j ++ ) {
			const a = base + k * n + j, b = base + ( k + 1 ) * n + j;
			this.idx[ this.ni ++ ] = a; this.idx[ this.ni ++ ] = a + 1; this.idx[ this.ni ++ ] = b;
			this.idx[ this.ni ++ ] = b; this.idx[ this.ni ++ ] = a + 1; this.idx[ this.ni ++ ] = b + 1;
		}
	}

	get empty() { return this.ni === 0; }

	// typed arrays sized to the content (copies, ready to transfer)
	finish( withWin = true ) {
		const n = this.n, ni = this.ni;
		const out = {
			count: n,
			pos: this.pos.slice( 0, n * 3 ), nor: this.nor.slice( 0, n * 3 ), uv: this.uv.slice( 0, n * 2 ), col: this.col.slice( 0, n * 3 ),
			mat: this.mat.slice( 0, n ), tag: this.tag.slice( 0, n * 2 ),
			idx: n < 65536 ? Uint16Array.from( this.idx.subarray( 0, ni ) ) : this.idx.slice( 0, ni ),
		};
		if ( withWin ) { out.wn = this.wn.slice( 0, n * 4 ); out.wn2 = this.wn2.slice( 0, n * 4 ); }
		// bounds for culling
		let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = - Infinity, y1 = - Infinity, z1 = - Infinity;
		const p = out.pos;
		for ( let i = 0; i < n * 3; i += 3 ) {
			if ( p[ i ] < x0 ) x0 = p[ i ]; if ( p[ i ] > x1 ) x1 = p[ i ];
			if ( p[ i + 1 ] < y0 ) y0 = p[ i + 1 ]; if ( p[ i + 1 ] > y1 ) y1 = p[ i + 1 ];
			if ( p[ i + 2 ] < z0 ) z0 = p[ i + 2 ]; if ( p[ i + 2 ] > z1 ) z1 = p[ i + 2 ];
		}
		out.bounds = n ? [ x0, y0, z0, x1, y1, z1 ] : [ 0, 0, 0, 0, 0, 0 ];
		return out;
	}
}

export function transferOf( g ) {
	if ( ! g ) return [];
	const t = [ g.pos.buffer, g.nor.buffer, g.uv.buffer, g.col.buffer, g.mat.buffer, g.tag.buffer, g.idx.buffer ];
	if ( g.wn ) t.push( g.wn.buffer, g.wn2.buffer );
	return t;
}

function qnormal( a, b, c ) {
	const ux = b[ 0 ] - a[ 0 ], uy = b[ 1 ] - a[ 1 ], uz = b[ 2 ] - a[ 2 ];
	const vx = c[ 0 ] - a[ 0 ], vy = c[ 1 ] - a[ 1 ], vz = c[ 2 ] - a[ 2 ];
	const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
	const l = Math.hypot( nx, ny, nz ) || 1;
	return [ nx / l, ny / l, nz / l ];
}

// A simpler position+normal builder for glass panes (drawn transparent on layer 1)
export class GlassGeo {
	constructor() { this.p = []; this.i = []; this.n = []; this.m = null; }
	setMatrix( m ) { this.m = m; }
	quad( a, b, c, d, nrm ) {
		const m = this.m;
		const T = ( p ) => m ? [ m[ 0 ] * p[ 0 ] + m[ 1 ] * p[ 1 ] + m[ 2 ] * p[ 2 ] + m[ 3 ], m[ 4 ] * p[ 0 ] + m[ 5 ] * p[ 1 ] + m[ 6 ] * p[ 2 ] + m[ 7 ], m[ 8 ] * p[ 0 ] + m[ 9 ] * p[ 1 ] + m[ 10 ] * p[ 2 ] + m[ 11 ] ] : p;
		const N = m ? [ m[ 0 ] * nrm[ 0 ] + m[ 2 ] * nrm[ 2 ], nrm[ 1 ], m[ 8 ] * nrm[ 0 ] + m[ 10 ] * nrm[ 2 ] ] : nrm;
		const k = this.p.length / 3;
		for ( const q of [ a, b, c, d ] ) { this.p.push( ...T( q ) ); this.n.push( N[ 0 ], N[ 1 ], N[ 2 ] ); }
		this.i.push( k, k + 1, k + 2, k, k + 2, k + 3 );
	}
	finish() {
		if ( ! this.i.length ) return null;
		return { pos: new Float32Array( this.p ), nor: new Float32Array( this.n ), idx: new Uint32Array( this.i ) };
	}
}
