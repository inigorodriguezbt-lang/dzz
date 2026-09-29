// Procedural car shells for the wrecks: nine body types lofted from a few cross-section stations, with
// wheels, lights, bumpers, a dark interior, and per-type data the car shader needs (door / trunk / hood
// regions, wheel arches). Forward is local -z, +x is the car's right side, y = 0 on the ground.
//
// Vertex attributes: position, normal, color (linear, used by everything but the paint), cpart = ( part,
// roughness, metalness ). Parts: 0 paint, 1 trim, 2 chrome, 3 tyre, 4 rim, 5 side glass, 6 windscreen,
// 7 headlight, 8 taillight, 9 interior, 10 lightbar red, 11 lightbar blue, 12 plate, 13 canvas.
import * as THREE from 'three';
import { MB } from './meshkit.js';
import { CAR, CAR_DIMS } from './kinds.js';

export const PART = { PAINT: 0, TRIM: 1, CHROME: 2, TYRE: 3, RIM: 4, GLASS: 5, SCREEN: 6, HEAD: 7, TAIL: 8, INTERIOR: 9, RED: 10, BLUE: 11, PLATE: 12, CANVAS: 13 };
const P = ( part, r, m ) => [ part, r, m ];
const TAG = {
	paint: P( 0, 0.35, 0.3 ), trim: P( 1, 0.7, 0 ), chrome: P( 2, 0.2, 1 ), tyre: P( 3, 0.9, 0 ), rim: P( 4, 0.35, 0.8 ),
	glass: P( 5, 0.05, 0 ), screen: P( 6, 0.05, 0 ), head: P( 7, 0.1, 0.2 ), tail: P( 8, 0.2, 0 ), interior: P( 9, 0.9, 0 ),
	red: P( 10, 0.3, 0 ), blue: P( 11, 0.3, 0 ), plate: P( 12, 0.5, 0.2 ), canvas: P( 13, 0.95, 0 ),
};

// lower body stations: [ z, yBottom, yBelt, yTop, width fraction ]; cabin: z stations [ zA, zB, zC, zD ],
// roof height, roof half-width fraction, glass rule; regions for the shader
const SPECS = {
	[ CAR.SEDAN ]: {
		body: [ [ - 2.375, 0.33, 0.55, 0.62, 0.9 ], [ - 2.3, 0.25, 0.66, 0.74, 0.96 ], [ - 2.05, 0.21, 0.76, 0.84, 1 ], [ - 1.2, 0.2, 0.8, 0.9, 1 ], [ - 0.85, 0.2, 0.84, 0.93, 1 ], [ 1.5, 0.2, 0.88, 0.96, 1 ], [ 2.05, 0.22, 0.88, 0.97, 0.99 ], [ 2.3, 0.28, 0.82, 0.92, 0.95 ], [ 2.375, 0.36, 0.7, 0.8, 0.9 ] ],
		cab: { z: [ - 0.85, - 0.05, 0.85, 1.5 ], roof: 1.44, w: 0.78, pillarB: 0.33, cPillar: true },
		doors: [ [ - 0.8, 0.33 ], [ 0.33, 1.2 ] ], trunk: [ 1.55, 2.33, 'lid' ], hood: [ - 2.2, - 0.9 ],
	},
	[ CAR.HATCH ]: {
		body: [ [ - 2.05, 0.31, 0.55, 0.62, 0.9 ], [ - 1.98, 0.25, 0.66, 0.74, 0.96 ], [ - 1.75, 0.21, 0.76, 0.85, 1 ], [ - 1.0, 0.2, 0.8, 0.9, 1 ], [ - 0.75, 0.2, 0.84, 0.93, 1 ], [ 1.8, 0.2, 0.88, 0.97, 1 ], [ 1.98, 0.27, 0.84, 0.94, 0.97 ], [ 2.05, 0.34, 0.74, 0.84, 0.92 ] ],
		cab: { z: [ - 0.75, - 0.02, 1.55, 1.98 ], roof: 1.5, w: 0.8, pillarB: 0.42, cPillar: false },
		doors: [ [ - 0.7, 0.42 ], [ 0.42, 1.2 ] ], trunk: [ 1.55, 2.02, 'hatch' ], hood: [ - 1.9, - 0.8 ],
	},
	[ CAR.SUV ]: {
		body: [ [ - 2.425, 0.42, 0.66, 0.76, 0.92 ], [ - 2.35, 0.34, 0.8, 0.9, 0.97 ], [ - 2.1, 0.31, 0.94, 1.04, 1 ], [ - 1.2, 0.3, 0.99, 1.09, 1 ], [ - 0.95, 0.3, 1.01, 1.11, 1 ], [ 2.28, 0.3, 1.06, 1.13, 1 ], [ 2.4, 0.38, 1.0, 1.1, 0.97 ], [ 2.425, 0.46, 0.86, 0.96, 0.93 ] ],
		cab: { z: [ - 0.95, - 0.2, 2.2, 2.38 ], roof: 1.78, w: 0.86, pillarB: 0.36, cPillar: false },
		doors: [ [ - 0.9, 0.36 ], [ 0.36, 1.36 ] ], trunk: [ 1.9, 2.4, 'hatch' ], hood: [ - 2.3, - 1.0 ],
	},
	[ CAR.PICKUP ]: {
		body: [ [ - 2.7, 0.43, 0.7, 0.8, 0.92 ], [ - 2.62, 0.35, 0.86, 0.96, 0.97 ], [ - 2.35, 0.33, 1.0, 1.1, 1 ], [ - 1.25, 0.32, 1.06, 1.15, 1 ], [ - 1.0, 0.32, 1.08, 1.17, 1 ], [ 0.62, 0.32, 1.08, 1.17, 1 ], [ 0.66, 0.36, 0.9, 0.96, 1 ], [ 2.62, 0.36, 0.9, 0.96, 1 ], [ 2.7, 0.44, 0.88, 0.95, 0.97 ] ],
		cab: { z: [ - 1.0, - 0.3, 0.48, 0.6 ], roof: 1.86, w: 0.84, pillarB: 99, cPillar: true },
		doors: [ [ - 0.95, 0.42 ], null ], trunk: [ 2.58, 2.7, 'tailgate' ], hood: [ - 2.55, - 1.05 ], bed: [ 0.66, 2.66, 0.96, 1.3 ],
	},
	[ CAR.VAN ]: {
		body: [ [ - 2.55, 0.38, 0.62, 0.72, 0.92 ], [ - 2.48, 0.31, 0.8, 0.9, 0.97 ], [ - 2.2, 0.29, 0.97, 1.04, 1 ], [ - 1.72, 0.28, 1.0, 1.08, 1 ], [ 2.45, 0.3, 1.04, 1.1, 1 ], [ 2.55, 0.38, 0.95, 1.04, 0.97 ] ],
		cab: { z: [ - 1.72, - 0.95, 2.48, 2.55 ], roof: 2.12, w: 0.9, pillarB: - 0.2, cPillar: false, glassTo: - 0.25 },
		doors: [ [ - 1.3, - 0.25 ], [ - 0.1, 1.2 ] ], trunk: [ 2.2, 2.55, 'hatch' ], hood: [ - 2.45, - 1.8 ],
	},
	[ CAR.POLICE ]: {
		body: [ [ - 2.475, 0.33, 0.56, 0.63, 0.9 ], [ - 2.4, 0.25, 0.67, 0.76, 0.96 ], [ - 2.15, 0.21, 0.78, 0.86, 1 ], [ - 1.25, 0.2, 0.82, 0.92, 1 ], [ - 0.9, 0.2, 0.86, 0.95, 1 ], [ 1.55, 0.2, 0.9, 0.98, 1 ], [ 2.15, 0.22, 0.9, 0.99, 0.99 ], [ 2.4, 0.28, 0.84, 0.94, 0.95 ], [ 2.475, 0.36, 0.72, 0.82, 0.9 ] ],
		cab: { z: [ - 0.9, - 0.08, 0.88, 1.55 ], roof: 1.52, w: 0.78, pillarB: 0.34, cPillar: true },
		doors: [ [ - 0.85, 0.34 ], [ 0.34, 1.25 ] ], trunk: [ 1.6, 2.43, 'lid' ], hood: [ - 2.3, - 0.95 ], police: true,
	},
	[ CAR.HUMVEE ]: {
		body: [ [ - 2.3, 0.52, 0.86, 0.92, 0.94 ], [ - 2.2, 0.46, 1.0, 1.08, 1 ], [ - 1.1, 0.46, 1.04, 1.12, 1 ], [ - 0.9, 0.46, 1.06, 1.13, 1 ], [ 2.2, 0.46, 1.06, 1.13, 1 ], [ 2.3, 0.52, 0.98, 1.08, 0.97 ] ],
		cab: { z: [ - 0.9, - 0.62, 1.25, 2.22 ], roof: 1.86, w: 0.9, pillarB: 0.2, cPillar: true, slit: true },
		doors: [ [ - 0.85, 0.2 ], [ 0.2, 1.12 ] ], trunk: [ 1.3, 2.25, 'hatch' ], hood: [ - 2.2, - 0.95 ], military: true,
	},
	[ CAR.MTRUCK ]: {
		body: [ [ - 3.6, 0.72, 1.15, 1.25, 0.95 ], [ - 3.5, 0.64, 1.3, 1.42, 1 ], [ - 2.2, 0.64, 1.35, 1.48, 1 ], [ - 1.0, 0.66, 1.3, 1.42, 1 ], [ - 0.95, 0.9, 1.3, 1.42, 1 ], [ 3.5, 0.9, 1.35, 1.42, 1 ], [ 3.6, 0.95, 1.3, 1.4, 0.98 ] ],
		cab: { z: [ - 3.45, - 3.2, - 1.15, - 1.05 ], roof: 2.75, w: 0.92, pillarB: 99, cPillar: false, slit: true },
		doors: [ [ - 3.0, - 1.9 ], null ], trunk: null, hood: null, military: true, cover: [ - 0.9, 3.55, 1.42, 3.1 ],
	},
	[ CAR.BUS ]: {
		body: [ [ - 6.0, 0.36, 0.95, 1.05, 0.97 ], [ - 5.9, 0.3, 1.15, 1.25, 1 ], [ 5.9, 0.3, 1.15, 1.25, 1 ], [ 6.0, 0.36, 1.05, 1.15, 0.97 ] ],
		cab: { z: [ - 5.98, - 5.75, 5.85, 5.98 ], roof: 3.1, w: 0.97, pillarB: 99, cPillar: false, pillars: 1.35 },
		doors: [ [ - 5.4, - 4.3 ], [ 0.2, 1.3 ] ], trunk: null, hood: null, bus: true,
	},
};

// a sheet of quads over rows of points (rows along the car, columns across), smooth along the rows,
// wound so its normals point along `hint` (a function of the quad centre giving the outward direction)
function sheet( b, rows, hex, tag, hint ) {
	const R = rows.length, C = rows[ 0 ].length;
	const pos = [];
	for ( const r of rows ) for ( const p of r ) pos.push( p[ 0 ], p[ 1 ], p[ 2 ] );
	const idx = [];
	for ( let r = 0; r < R - 1; r ++ ) for ( let c = 0; c < C - 1; c ++ ) {
		const a = r * C + c, bb = a + 1, cc = a + C, d = cc + 1;
		// orient each quad by its own normal vs the hint
		const A = rows[ r ][ c ], B = rows[ r ][ c + 1 ], Cc = rows[ r + 1 ][ c ];
		const ux = B[ 0 ] - A[ 0 ], uy = B[ 1 ] - A[ 1 ], uz = B[ 2 ] - A[ 2 ], vx = Cc[ 0 ] - A[ 0 ], vy = Cc[ 1 ] - A[ 1 ], vz = Cc[ 2 ] - A[ 2 ];
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		if ( Math.abs( nx ) + Math.abs( ny ) + Math.abs( nz ) < 1e-9 ) { const D = rows[ r + 1 ][ c + 1 ]; const wx = D[ 0 ] - B[ 0 ], wy = D[ 1 ] - B[ 1 ], wz = D[ 2 ] - B[ 2 ]; nx = uy * wz - uz * wy; ny = uz * wx - ux * wz; nz = ux * wy - uy * wx; }
		const h = hint( ( A[ 0 ] + B[ 0 ] + Cc[ 0 ] ) / 3, ( A[ 1 ] + B[ 1 ] + Cc[ 1 ] ) / 3, ( A[ 2 ] + B[ 2 ] + Cc[ 2 ] ) / 3 );
		if ( nx * h[ 0 ] + ny * h[ 1 ] + nz * h[ 2 ] >= 0 ) idx.push( a, bb, cc, bb, d, cc ); else idx.push( a, cc, bb, bb, cc, d );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	b.add( g, hex, tag );
}

const mirror = ( rows ) => rows.map( r => r.map( p => [ - p[ 0 ], p[ 1 ], p[ 2 ] ] ) );

function wheel( b, x, z, r, lod, side ) {
	if ( lod > 1 ) { b.box( 0.23, r * 1.7, r * 1.7, 0x141414, TAG.tyre, { x, y: r * 0.9, z } ); return; }
	const seg = lod ? 8 : 16;
	const w = 0.23;
	b.cyl( r, r, w, seg, 0x141414, TAG.tyre, { x, y: r, z, axis: 'x' } );
	b.cyl( r * 0.63, r * 0.63, w + 0.012, seg, 0x8a8d90, TAG.rim, { x, y: r, z, axis: 'x' } );
	if ( ! lod ) {
		b.cyl( r * 0.2, r * 0.25, 0.04, 8, 0x5a5d60, TAG.rim, { x: x + side * ( w / 2 + 0.02 ), y: r, z, axis: 'x' } );
		for ( let k = 0; k < 5; k ++ ) {
			const a = k / 5 * Math.PI * 2;
			b.box( 0.02, r * 0.35, 0.05, 0x6a6d70, TAG.rim, { x: x + side * ( w / 2 + 0.008 ), y: r + Math.cos( a ) * r * 0.38, z: z + Math.sin( a ) * r * 0.38, rx: - a } );
		}
	}
}

function buildCar( type, lod ) {
	const S = SPECS[ type ], D = CAR_DIMS[ type ];
	const b = new MB();
	const hw = D.W / 2;
	// lod 0 full, 1 fewer stations and no interior, 2 a coarse shell for the distance
	const body = lod > 1 ? S.body.filter( ( s, i ) => i === 0 || i === S.body.length - 1 || i === Math.floor( S.body.length / 2 ) )
		: lod ? S.body.filter( ( s, i ) => i === 0 || i === S.body.length - 1 || i % 2 === 1 || S.body.length <= 6 ) : S.body;
	// ---- lower body: strips per section edge (smooth along the car, creased across) ----
	const sec = ( s ) => {
		const [ z, yb, ybelt, yt, wf ] = s, w = hw * wf;
		return [ [ w * 0.4, yb, z ], [ w * 0.93, yb, z ], [ w, yb + 0.1, z ], [ w * 0.995, ybelt, z ], [ w * 0.93, yt, z ], [ 0, yt + 0.025, z ] ];
	};
	const secs = body.map( sec );
	const edges = [ [ 0, 1, 0x101010, TAG.trim ], [ 1, 2, 0x1a1a1a, TAG.trim ], [ 2, 3, 0xffffff, TAG.paint ], [ 3, 4, 0xffffff, TAG.paint ], [ 4, 5, 0xffffff, TAG.paint ] ];
	for ( const [ e0, e1, hex, tag ] of edges ) {
		const rows = secs.map( s => [ s[ e0 ], s[ e1 ] ] );
		const out = e1 === 5 ? ( () => [ 0, 1, 0 ] ) : e1 <= 1 ? ( () => [ 0, - 1, 0 ] ) : ( () => [ 1, 0, 0 ] );
		sheet( b, rows, hex, tag, out );
		sheet( b, mirror( rows ), hex, tag, ( x, y, z ) => { const o = out(); return [ - o[ 0 ], o[ 1 ], o[ 2 ] ]; } );
	}
	// underside centre strip and the two end caps
	sheet( b, secs.map( s => [ [ - s[ 0 ][ 0 ], s[ 0 ][ 1 ], s[ 0 ][ 2 ] ], s[ 0 ] ] ), 0x0c0c0c, TAG.trim, () => [ 0, - 1, 0 ] );
	for ( const [ s, dir ] of [ [ secs[ 0 ], - 1 ], [ secs[ secs.length - 1 ], 1 ] ] ) {
		const ring = [ ...s, ...mirror( [ s.slice().reverse() ] )[ 0 ] ];
		const c = [ 0, ( s[ 0 ][ 1 ] + s[ 5 ][ 1 ] ) / 2, s[ 0 ][ 2 ] ];
		const tri = [];
		for ( let k = 0; k < ring.length; k ++ ) tri.push( c, ring[ k ], ring[ ( k + 1 ) % ring.length ] );
		b.tris( tri, 0xffffff, TAG.paint, [ 0, c[ 1 ], c[ 2 ] - dir ] );
	}
	// ---- cabin / greenhouse ----
	const cab = S.cab;
	const topAt = ( z ) => {
		// the lower body's top edge height and half width at z
		for ( let i = 0; i < S.body.length - 1; i ++ ) {
			const a = S.body[ i ], c = S.body[ i + 1 ];
			if ( z >= a[ 0 ] && z <= c[ 0 ] ) { const t = ( z - a[ 0 ] ) / ( c[ 0 ] - a[ 0 ] || 1 ); return [ a[ 3 ] + ( c[ 3 ] - a[ 3 ] ) * t, hw * ( a[ 4 ] + ( c[ 4 ] - a[ 4 ] ) * t ) * 0.93 ]; }
		}
		return [ S.body[ 0 ][ 3 ], hw * 0.9 ];
	};
	const [ zA, zB, zC, zD ] = cab.z;
	const roofW = hw * cab.w;
	// stations with a curved windscreen and rear window
	const st = [];
	const push = ( z, f ) => { const [ yb, wb ] = topAt( z ); st.push( { z, yb, wb, yr: yb + ( cab.roof - yb ) * f, wr: wb + ( roofW - wb ) * f } ); };
	push( zA, 0 ); if ( lod < 2 ) push( zA + ( zB - zA ) * 0.45, 0.62 ); push( zB, 1 );
	const mids = [ zB ];
	if ( lod < 2 ) {
		if ( cab.pillarB < zC && cab.pillarB > zB ) mids.push( cab.pillarB - 0.06, cab.pillarB + 0.06 );
		if ( cab.pillars ) for ( let z = zB + cab.pillars; z < zC - 0.3; z += cab.pillars ) mids.push( z - 0.07, z + 0.07 );
	}
	if ( cab.glassTo !== undefined ) mids.push( cab.glassTo );
	mids.push( zC );
	for ( const z of mids.slice( 1 ) ) push( z, 1 );
	if ( lod < 2 ) push( zC + ( zD - zC ) * 0.55, 0.6 );
	push( zD, 0 );
	st.sort( ( a, c ) => a.z - c.z );
	const crown = 0.03;
	// side strips between consecutive stations: glass in the door windows, paint on the pillars
	for ( let i = 0; i < st.length - 1; i ++ ) {
		const a = st[ i ], c = st[ i + 1 ];
		const zm = ( a.z + c.z ) / 2;
		let glass = zm > zB && zm < zC;
		if ( cab.pillarB < zC && Math.abs( zm - cab.pillarB ) < 0.07 ) glass = false;
		if ( cab.pillars && ( ( zm - zB ) % cab.pillars < 0.08 || ( zm - zB ) % cab.pillars > cab.pillars - 0.08 ) && zm > zB + 0.2 ) glass = false;
		if ( cab.glassTo !== undefined && zm > cab.glassTo ) glass = false;
		if ( ! cab.cPillar && zm >= zC && zm < zD ) glass = true;
		if ( zm < zB && zm > zA && ( type === CAR.BUS ) ) glass = true;
		// glass is inset slightly from the body line and framed by a thin band of paint below the roof
		const rows = [ [ [ a.wb, a.yb, a.z ], [ a.wr, a.yr, a.z ] ], [ [ c.wb, c.yb, c.z ], [ c.wr, c.yr, c.z ] ] ];
		if ( glass && lod > 1 ) {
			sheet( b, rows, 0x0b0e10, TAG.glass, () => [ 1, 0, 0 ] );
			sheet( b, mirror( rows ), 0x0b0e10, TAG.glass, () => [ - 1, 0, 0 ] );
		} else if ( glass ) {
			const lerp = ( p, q, t ) => [ p[ 0 ] + ( q[ 0 ] - p[ 0 ] ) * t, p[ 1 ] + ( q[ 1 ] - p[ 1 ] ) * t, p[ 2 ] ];
			const lo = cab.slit ? 0.38 : 0.06, hi = cab.slit ? 0.86 : 0.93;
			const r0 = rows.map( r => [ r[ 0 ], lerp( r[ 0 ], r[ 1 ], lo ) ] );
			const r1 = rows.map( r => [ lerp( r[ 0 ], r[ 1 ], lo ), lerp( r[ 0 ], r[ 1 ], hi ) ] );
			const r2 = rows.map( r => [ lerp( r[ 0 ], r[ 1 ], hi ), r[ 1 ] ] );
			for ( const [ rr, hex, tag ] of [ [ r0, 0xffffff, TAG.paint ], [ r1, 0x0b0e10, TAG.glass ], [ r2, 0xffffff, TAG.paint ] ] ) {
				sheet( b, rr, hex, tag, () => [ 1, 0, 0 ] );
				sheet( b, mirror( rr ), hex, tag, () => [ - 1, 0, 0 ] );
			}
		} else {
			sheet( b, rows, 0xffffff, TAG.paint, () => [ 1, 0, 0 ] );
			sheet( b, mirror( rows ), 0xffffff, TAG.paint, () => [ - 1, 0, 0 ] );
		}
		// top: windscreen / roof / rear window
		const top = [ [ [ a.wr, a.yr, a.z ], [ 0, a.yr + crown * ( a.yr > a.yb + 0.05 ? 1 : 0 ), a.z ] ], [ [ c.wr, c.yr, c.z ], [ 0, c.yr + crown * ( c.yr > c.yb + 0.05 ? 1 : 0 ), c.z ] ] ];
		const screen = zm < zB || ( zm > zC && ( type !== CAR.PICKUP || true ) );
		const hex = screen ? 0x0b0e10 : 0xffffff, tag = screen ? TAG.screen : TAG.paint;
		const up = ( x, y, z ) => [ 0, 1, zm < zB ? - 1 : zm > zC ? 1 : 0 ];
		sheet( b, top, hex, tag, up );
		sheet( b, mirror( top ), hex, tag, up );
	}
	// ---- lights, grille, bumpers, plates, mirrors ----
	const f = S.body[ 0 ], r = S.body[ S.body.length - 1 ];
	const zF = f[ 0 ], zR = r[ 0 ];
	const yL = ( f[ 2 ] + f[ 3 ] ) / 2 + 0.02;
	const hwF = hw * f[ 4 ];
	if ( type === CAR.BUS ) {
		b.box( D.W * 0.9, 0.3, 0.03, 0x111111, TAG.trim, { y: 2.8, z: zF - 0.01 } );
		b.box( D.W * 0.7, 0.18, 0.02, 0xd08a20, TAG.head, { y: 2.8, z: zF - 0.03 } );
	}
	for ( const s of lod > 1 ? [] : [ - 1, 1 ] ) {
		b.box( 0.3, 0.12, 0.05, 0xdcdcd4, TAG.head, { x: s * ( hwF - 0.22 ), y: yL, z: zF - 0.005 } );
		b.box( 0.26, 0.12, 0.05, 0x8a1010, TAG.tail, { x: s * ( hw * r[ 4 ] - 0.2 ), y: ( r[ 2 ] + r[ 3 ] ) / 2, z: zR + 0.005 } );
		if ( ! lod && type !== CAR.BUS && type !== CAR.MTRUCK ) {
			const [ yb, wb ] = topAt( zB + 0.1 );
			b.box( 0.14, 0.09, 0.07, 0xffffff, TAG.paint, { x: s * ( wb + 0.1 ), y: yb + 0.12, z: zA + ( zB - zA ) * 0.8 } );
			b.box( 0.12, 0.08, 0.01, 0x7a8288, TAG.chrome, { x: s * ( wb + 0.1 ), y: yb + 0.12, z: zA + ( zB - zA ) * 0.8 + 0.036 } );
		}
	}
	if ( type !== CAR.BUS ) {
		b.box( hwF * 0.9, 0.14, 0.04, 0x0e0e0e, TAG.trim, { y: yL - 0.02, z: zF - 0.01 } ); // grille
		b.box( D.W * 0.96, 0.14, 0.12, S.military ? 0x2a2d20 : 0x1b1b1b, TAG.trim, { y: f[ 1 ] + 0.08, z: zF + 0.03 } );
		b.box( D.W * 0.96, 0.14, 0.12, S.military ? 0x2a2d20 : 0x1b1b1b, TAG.trim, { y: r[ 1 ] + 0.06, z: zR - 0.03 } );
	}
	if ( ! S.military && lod < 2 ) {
		b.box( 0.32, 0.16, 0.01, 0xe2dfd0, TAG.plate, { y: f[ 1 ] + 0.2, z: zF - 0.035 } );
		b.box( 0.32, 0.16, 0.01, 0xe2dfd0, TAG.plate, { y: r[ 1 ] + 0.25, z: zR + 0.035 } );
	}
	// ---- type extras ----
	if ( S.bed ) {
		const [ z0, z1, yf, yt ] = S.bed;
		for ( const s of [ - 1, 1 ] ) b.box( 0.07, yt - yf + 0.34, z1 - z0, 0xffffff, TAG.paint, { x: s * ( hw - 0.035 ), y: ( yf - 0.34 + yt ) / 2 + 0.17, z: ( z0 + z1 ) / 2 } );
		b.box( D.W - 0.14, yt - yf, 0.07, 0xffffff, TAG.paint, { y: ( yf + yt ) / 2, z: z0 + 0.035 } );
		b.box( D.W, yt - yf + 0.34, 0.07, 0xffffff, TAG.paint, { y: ( yf - 0.34 + yt ) / 2 + 0.17, z: z1 } );
		b.box( D.W - 0.14, 0.02, z1 - z0, 0x1c1c1c, TAG.trim, { y: yf + 0.01, z: ( z0 + z1 ) / 2 } );
	}
	if ( S.cover ) {
		const [ z0, z1, y0, y1 ] = S.cover;
		const prof = [];
		for ( let k = 0; k <= 8; k ++ ) { const a = k / 8 * Math.PI; prof.push( [ Math.cos( a ) * hw, y1 - 0.35 + Math.sin( a ) * 0.35 ] ); }
		const pts = [ [ hw, y0 ], ...prof, [ - hw, y0 ] ];
		const rows = [ pts.map( ( [ x, y ] ) => [ x, y, z0 ] ), pts.map( ( [ x, y ] ) => [ x, y, z1 ] ) ];
		const rowsT = rows[ 0 ].map( ( _, i ) => [ rows[ 0 ][ i ], rows[ 1 ][ i ] ] );
		sheet( b, rowsT, 0x5b6340, TAG.canvas, ( x, y ) => [ x, y - ( y1 - 0.6 ), 0 ] );
		for ( const [ z, d ] of [ [ z0, - 1 ], [ z1, 1 ] ] ) {
			const tri = [];
			const c = [ 0, ( y0 + y1 ) / 2, z ];
			const ring = pts.map( ( [ x, y ] ) => [ x, y, z ] );
			for ( let k = 0; k < ring.length; k ++ ) tri.push( c, ring[ k ], ring[ ( k + 1 ) % ring.length ] );
			b.tris( tri, d > 0 ? 0x1c1f14 : 0x4f5736, TAG.canvas, [ 0, c[ 1 ], z - d ] );
		}
		b.box( D.W, 0.12, z1 - z0, 0x3a3f28, TAG.paint, { y: y0 + 0.06, z: ( z0 + z1 ) / 2 } );
	}
	if ( S.police && lod < 2 ) {
		const y = cab.roof + 0.02;
		b.box( 1.2, 0.05, 0.28, 0x111111, TAG.trim, { y: y + 0.025, z: ( zB + zC ) / 2 - 0.15 } );
		for ( const s of [ - 1, 1 ] ) b.box( 0.55, 0.1, 0.24, s < 0 ? 0x7a0a0a : 0x0a1a7a, s < 0 ? TAG.red : TAG.blue, { x: s * 0.3, y: y + 0.1, z: ( zB + zC ) / 2 - 0.15 } );
		// push bumper
		for ( const s of [ - 1, 1 ] ) b.box( 0.06, 0.45, 0.06, 0x111111, TAG.trim, { x: s * 0.45, y: f[ 1 ] + 0.35, z: zF - 0.12 } );
		b.box( 1.0, 0.06, 0.06, 0x111111, TAG.trim, { y: f[ 1 ] + 0.55, z: zF - 0.12 } );
		b.box( 1.0, 0.06, 0.06, 0x111111, TAG.trim, { y: f[ 1 ] + 0.2, z: zF - 0.12 } );
	}
	if ( S.military && type === CAR.HUMVEE && lod < 2 ) {
		b.box( D.W * 0.5, 0.06, 0.8, 0x2a2d20, TAG.trim, { y: cab.roof + 0.03, z: 0.2 } ); // hatch ring
		b.box( 0.3, 0.5, 0.15, 0x2a2d20, TAG.trim, { x: hw - 0.3, y: 1.35, z: zR + 0.05 } ); // jerrycan rack
	}
	if ( type === CAR.BUS ) b.box( 1.2, 0.3, 1.8, 0xb0b0aa, TAG.paint, { y: cab.roof + 0.15, z: 1.5 } ); // A/C pod
	// ---- interior (seen through broken glass and open doors) ----
	if ( ! lod ) {
		const [ yb ] = topAt( zB );
		const floorY = S.body[ 2 ][ 1 ] + 0.12;
		const IN = 0x1d1c1a;
		b.box( D.W - 0.3, yb - floorY, 0.4, IN, TAG.interior, { y: ( yb + floorY ) / 2, z: zA + 0.15 } ); // dash
		const seatZ = ( type === CAR.BUS || type === CAR.MTRUCK ) ? [ zA + 1.1 ] : [ zB + 0.45, ...( S.doors[ 1 ] ? [ S.doors[ 1 ][ 0 ] + 0.55 ] : [] ) ];
		for ( const z of seatZ ) {
			b.box( D.W - 0.4, 0.14, 0.55, 0x2a2724, TAG.interior, { y: floorY + 0.3, z } );
			b.box( D.W - 0.4, 0.6, 0.12, 0x2a2724, TAG.interior, { y: floorY + 0.65, z: z + 0.3, rx: - 0.15 } );
		}
		b.torus( 0.18, 0.025, 6, 12, 0x111111, TAG.trim, { x: - hw * 0.45, y: yb + 0.05, z: zA + 0.45, rx: 1.1 } );
	}
	// ---- wheels ----
	for ( const z of [ D.zf, D.zr ] ) for ( const s of [ - 1, 1 ] ) wheel( b, s * D.tr, z, D.r, lod, s );
	if ( type === CAR.MTRUCK || type === CAR.BUS ) for ( const s of [ - 1, 1 ] ) wheel( b, s * D.tr, D.zr + ( type === CAR.BUS ? 0 : - 1.3 ), D.r, lod, s );
	return b.build( 'cpart', 3 );
}

// door panel (unit: 0.05 thick along x, y 0..1, z 0..1 from the hinge rearwards) and a lid panel
function buildDoor() {
	const b = new MB();
	b.box( 0.05, 0.58, 1, 0xffffff, TAG.paint, { x: 0, y: 0.29, z: 0.5 } );
	b.box( 0.02, 0.38, 0.9, 0x0b0e10, TAG.glass, { x: 0.005, y: 0.78, z: 0.52 } );
	b.box( 0.04, 0.04, 1, 0xffffff, TAG.paint, { y: 0.98, z: 0.5 } );
	b.box( 0.04, 0.42, 0.05, 0xffffff, TAG.paint, { y: 0.78, z: 0.975 } );
	b.box( 0.03, 0.5, 0.9, 0x2a2724, TAG.interior, { x: - 0.03, y: 0.3, z: 0.5 } ); // door card
	return b.build( 'cpart', 3 );
}
function buildLid() {
	const b = new MB();
	b.box( 1, 1, 1, 0xffffff, TAG.paint, { y: 0.5, z: 0.5 } );
	return b.build( 'cpart', 3 );
}

export const CAR_KEYS = [ 'sedan', 'hatch', 'suv', 'pickup', 'van', 'police', 'humvee', 'mtruck', 'bus' ];

let _geo = null;
export function carGeometries() {
	if ( _geo ) return _geo;
	_geo = { near: [], far: [], low: [], door: buildDoor(), lid: buildLid() };
	for ( let t = 0; t < CAR_KEYS.length; t ++ ) { _geo.near.push( buildCar( t, 0 ) ); _geo.far.push( buildCar( t, 1 ) ); _geo.low.push( buildCar( t, 2 ) ); }
	return _geo;
}

export function carSpec( type ) { return SPECS[ type ]; }

// door / lid placements for a car's flags: [ { kind: 'door' | 'lid', m: Matrix4 (car local) } ]
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
export function carPanels( type, flags, seed, out ) {
	const S = SPECS[ type ], D = CAR_DIMS[ type ];
	const hw = D.W / 2;
	const doorY0 = S.body[ 2 ][ 1 ] + 0.05, doorY1 = S.cab.roof - 0.03;
	const bits = [ 1, 2, 4, 8 ];
	for ( let i = 0; i < 4; i ++ ) {
		if ( ! ( flags & bits[ i ] ) ) continue;
		const d = S.doors[ i >> 1 ];
		if ( ! d ) continue;
		const side = i & 1 ? 1 : - 1;
		const ang = ( 0.75 + ( ( seed >> ( i * 3 ) ) & 7 ) / 7 * 0.45 ) * side;
		const m = new THREE.Matrix4().makeTranslation( side * ( hw - 0.02 ), doorY0, d[ 0 ] );
		m.multiply( _m1.makeRotationY( ang ) );
		m.multiply( _m2.makeScale( side, doorY1 - doorY0, d[ 1 ] - d[ 0 ] ) );
		out.push( { kind: 'door', m } );
	}
	if ( ( flags & 16 ) && S.trunk ) {
		const [ z0, z1, kind ] = S.trunk;
		if ( kind === 'tailgate' ) {
			const m = new THREE.Matrix4().makeTranslation( 0, S.body[ S.body.length - 1 ][ 1 ] + 0.05, z1 );
			m.multiply( _m1.makeRotationX( Math.PI / 2 ) );
			m.multiply( _m2.makeScale( D.W * 0.94, 0.05, S.bed ? S.bed[ 3 ] - S.bed[ 2 ] + 0.3 : 0.5 ) );
			out.push( { kind: 'lid', m } );
		} else {
			// lid / hatch hinged at its front edge, swung up
			const yH = kind === 'hatch' ? S.cab.roof - 0.05 : S.body[ S.body.length - 3 ][ 3 ] + 0.02;
			const m = new THREE.Matrix4().makeTranslation( 0, yH, z0 );
			m.multiply( _m1.makeRotationX( kind === 'hatch' ? - 0.25 : - 1.15 ) );
			m.multiply( _m2.makeScale( D.W * 0.86, 0.05, ( kind === 'hatch' ? 1.0 : z1 - z0 ) ) );
			out.push( { kind: 'lid', m } );
		}
	}
	if ( ( flags & 32 ) && S.hood ) {
		const [ z0, z1 ] = S.hood;
		const m = new THREE.Matrix4().makeTranslation( 0, S.body[ 3 ][ 3 ] + 0.02, z1 );
		m.multiply( _m1.makeRotationY( Math.PI ) );
		m.multiply( _m2.makeRotationX( - 1.0 ) );
		m.multiply( _m1.makeScale( D.W * 0.88, 0.05, z1 - z0 ) );
		out.push( { kind: 'lid', m } );
	}
	return out;
}
