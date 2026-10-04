// A tiny modelling kit for the procedural street props and car shells: primitives are transformed, coloured
// (linear vertex colour), tagged (pbr = roughness, metalness, flag  or  part id) and merged into one
// non-indexed BufferGeometry per model.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

export class MB {
	constructor() { this.pos = []; this.nor = []; this.col = []; this.tag = []; }

	// append a geometry: colour (sRGB hex), tag [ a, b, c ], transform { x, y, z, rx, ry, rz, sx, sy, sz }
	add( geo, hex, tag, t = {} ) {
		const g = geo.index ? geo.toNonIndexed() : geo;
		_e.set( t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ' );
		_q.setFromEuler( _e );
		_s.set( t.sx ?? 1, t.sy ?? 1, t.sz ?? 1 );
		_p.set( t.x || 0, t.y || 0, t.z || 0 );
		_m.compose( _p, _q, _s );
		g.applyMatrix4( _m );
		if ( t.m ) g.applyMatrix4( t.m );
		if ( ! g.attributes.normal ) g.computeVertexNormals();
		const P = g.attributes.position.array, N = g.attributes.normal.array;
		// flip: the inside of a thin shell (a visor, a hood), so a single-sided material shows both faces
		if ( t.flip ) {
			for ( let i = 0; i < P.length; i += 9 ) for ( let c = 0; c < 3; c ++ ) { const a = P[ i + 3 + c ]; P[ i + 3 + c ] = P[ i + 6 + c ]; P[ i + 6 + c ] = a; const n = N[ i + 3 + c ]; N[ i + 3 + c ] = N[ i + 6 + c ]; N[ i + 6 + c ] = n; }
			for ( let i = 0; i < N.length; i ++ ) N[ i ] = - N[ i ];
		}
		_c.setHex( hex );
		const n = P.length / 3;
		for ( let i = 0; i < n; i ++ ) {
			this.pos.push( P[ i * 3 ], P[ i * 3 + 1 ], P[ i * 3 + 2 ] );
			this.nor.push( N[ i * 3 ], N[ i * 3 + 1 ], N[ i * 3 + 2 ] );
			this.col.push( _c.r, _c.g, _c.b );
			this.tag.push( tag[ 0 ], tag[ 1 ], tag[ 2 ] );
		}
		if ( g !== geo ) g.dispose();
		geo.dispose();
		return this;
	}

	box( w, h, d, hex, tag, t = {} ) { return this.add( new THREE.BoxGeometry( w, h, d ), hex, tag, t ); }
	// cylinder along y from its centre; axis: 'x' | 'z' lays it down
	cyl( rt, rb, h, seg, hex, tag, t = {}, open = false ) {
		const g = new THREE.CylinderGeometry( rt, rb, h, seg, 1, open );
		if ( t.axis === 'x' ) g.rotateZ( Math.PI / 2 );
		else if ( t.axis === 'z' ) g.rotateX( Math.PI / 2 );
		return this.add( g, hex, tag, t );
	}
	sphere( r, ws, hs, hex, tag, t = {} ) { return this.add( new THREE.SphereGeometry( r, ws, hs ), hex, tag, t ); }
	cone( r, h, seg, hex, tag, t = {} ) { return this.add( new THREE.ConeGeometry( r, h, seg ), hex, tag, t ); }
	torus( r, tube, rs, ts, hex, tag, t = {} ) { return this.add( new THREE.TorusGeometry( r, tube, rs, ts ), hex, tag, t ); }
	// a surface of revolution about y: profile [ [ radius, y ] ... ] from the bottom up (faces outward)
	lathe( prof, seg, hex, tag, t = {} ) {
		const g = new THREE.LatheGeometry( prof.map( ( [ r, y ] ) => new THREE.Vector2( r, y ) ), seg );
		if ( t.axis === 'x' ) g.rotateZ( - Math.PI / 2 );
		else if ( t.axis === 'z' ) g.rotateX( Math.PI / 2 );
		return this.add( g, hex, tag, t );
	}
	// a box whose top is a different size from its bottom (bins, booths), base on y = 0
	taper( w0, d0, w1, d1, h, hex, tag, t = {} ) {
		const g = new THREE.BoxGeometry( 1, 1, 1 );
		const p = g.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) {
			const top = p.getY( i ) > 0;
			p.setXYZ( i, p.getX( i ) * ( top ? w1 : w0 ), ( p.getY( i ) + 0.5 ) * h, p.getZ( i ) * ( top ? d1 : d0 ) );
		}
		g.computeVertexNormals();
		return this.add( g, hex, tag, t );
	}
	// a thin box between two points (rails, braces, wires)
	beam( a, b, w, h, hex, tag ) {
		const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ], dz = b[ 2 ] - a[ 2 ];
		const L = Math.hypot( dx, dy, dz );
		const g = new THREE.BoxGeometry( w, h, L );
		const m = new THREE.Matrix4().lookAt( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( dx, dy, dz ), Math.abs( dy ) > 0.99 * L ? new THREE.Vector3( 1, 0, 0 ) : new THREE.Vector3( 0, 1, 0 ) );
		g.applyMatrix4( m );
		g.translate( ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 );
		return this.add( g, hex, tag );
	}
	// round tube along a polyline
	tube( pts, r, seg, hex, tag ) {
		for ( let i = 0; i < pts.length - 1; i ++ ) {
			const a = pts[ i ], b = pts[ i + 1 ];
			const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ], dz = b[ 2 ] - a[ 2 ];
			const L = Math.hypot( dx, dy, dz );
			const g = new THREE.CylinderGeometry( r, r, L + r * 0.6, seg, 1, true );
			g.rotateX( Math.PI / 2 );
			const m = new THREE.Matrix4().lookAt( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( dx, dy, dz ), Math.abs( dy ) > 0.99 * L ? new THREE.Vector3( 1, 0, 0 ) : new THREE.Vector3( 0, 1, 0 ) );
			g.applyMatrix4( m );
			g.translate( ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 );
			this.add( g, hex, tag );
		}
		return this;
	}
	// raw triangles: tris = [ [ x, y, z ] x 3 ... ] (flat normals); with `center` every triangle is wound to
	// face away from that point
	tris( list, hex, tag, center = null ) {
		if ( center ) {
			list = list.slice();
			for ( let k = 0; k < list.length; k += 3 ) {
				const a = list[ k ], b = list[ k + 1 ], c = list[ k + 2 ];
				const ux = b[ 0 ] - a[ 0 ], uy = b[ 1 ] - a[ 1 ], uz = b[ 2 ] - a[ 2 ], vx = c[ 0 ] - a[ 0 ], vy = c[ 1 ] - a[ 1 ], vz = c[ 2 ] - a[ 2 ];
				const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
				const mx = ( a[ 0 ] + b[ 0 ] + c[ 0 ] ) / 3 - center[ 0 ], my = ( a[ 1 ] + b[ 1 ] + c[ 1 ] ) / 3 - center[ 1 ], mz = ( a[ 2 ] + b[ 2 ] + c[ 2 ] ) / 3 - center[ 2 ];
				if ( nx * mx + ny * my + nz * mz < 0 ) { list[ k + 1 ] = c; list[ k + 2 ] = b; }
			}
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( list.flat(), 3 ) );
		g.computeVertexNormals();
		return this.add( g, hex, tag );
	}
	// a prism: 2-D profile (in the yz plane: [ z, y ] pairs, counter-clockwise seen from +x) extruded along x
	extrudeX( profile, x0, x1, hex, tag, t = {} ) {
		// shape x = -z so that a proper rotation (+90 deg about y) maps it to world z and the extrusion to world x
		const shape = new THREE.Shape( profile.map( ( [ z, y ] ) => new THREE.Vector2( - z, y ) ) );
		const g = new THREE.ExtrudeGeometry( shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 } );
		g.rotateY( Math.PI / 2 );
		g.translate( x0, 0, 0 );
		g.deleteAttribute( 'uv' );
		g.computeVertexNormals();
		return this.add( g, hex, tag, t );
	}

	count() { return this.pos.length / 3; }

	// tagName: the attribute the tag goes into ('pbr' for props, 'part' uses only tag[0])
	build( tagName = 'pbr', tagSize = 3 ) {
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nor, 3 ) );
		g.setAttribute( 'color', new THREE.Float32BufferAttribute( this.col, 3 ) );
		if ( tagSize === 3 ) g.setAttribute( tagName, new THREE.Float32BufferAttribute( this.tag, 3 ) );
		else g.setAttribute( tagName, new THREE.Float32BufferAttribute( this.tag.filter( ( _, i ) => i % 3 < tagSize ), tagSize ) );
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;
	}
}

// common surface tags ( roughness, metalness, flag ). The flag's whole part is the material class the prop shader
// weathers (0 plain, 1 lamp bulb, 2 timber, 3 concrete, 4 bare / galvanised metal, 5 painted metal, 6 plastic,
// 7 rubber, 8 fabric, 9 retroreflective sheeting, 10 diagonal hazard stripes, 11 HESCO mesh); + 0.5 takes the
// instance tint
export const T = {
	paint: [ 0.55, 0.15, 5 ], tint: [ 0.55, 0.1, 5.5 ], tintMatte: [ 0.85, 0, 6.5 ], galv: [ 0.45, 0.75, 4 ], steel: [ 0.4, 0.85, 4 ],
	iron: [ 0.7, 0.6, 5 ], wood: [ 0.9, 0, 2 ], concrete: [ 0.92, 0, 3 ], plastic: [ 0.55, 0, 6 ], rubber: [ 0.9, 0, 7 ],
	glass: [ 0.06, 0.1, 0 ], lens: [ 0.15, 0.05, 0 ], bulb: [ 0.2, 0, 1 ], fabric: [ 0.95, 0, 8 ], shiny: [ 0.3, 0, 9 ], sand: [ 1, 0, 0 ],
	tintShiny: [ 0.3, 0, 6.5 ], porcelain: [ 0.25, 0, 0 ], stripes: [ 0.35, 0, 10 ], hesco: [ 0.95, 0, 11 ], tintPlastic: [ 0.6, 0, 6.5 ],
	alu: [ 0.35, 0.8, 4 ],
};
