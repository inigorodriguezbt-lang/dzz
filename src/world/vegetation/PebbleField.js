// Camera-following ground clutter: pebbles, cobbles and shell / coral grit on the beaches, rocky shores
// and dirt tracks (one draw call, no shadow casting). Ported from Tidewater src/world/debris/PebbleField.js
// with its stone shapes (DebrisShapes.js stonePart, icosphere) and stone surface (NatureMaterial.js
// debrisStoneSurface) (MIT, see LICENSE-Tidewater.txt), WGSL translated to GLSL.
//
// The ground is divided into PCELL x PCELL cells; every visible cell near the camera draws one instance
// of a patch of blue-noise slots (small pebbles, cobbles, flat shell / coral chips). In the vertex shader
// each slot looks up its density in the pebble mask (GroundData: R pebbles, G cobbles, B grit, A stone
// palette, scatter.js groundData), picks its size, shape, yaw from hashes of its world position (stable
// while the camera moves), sits on the terrain mesh (GroundData groundAt) and shrinks to nothing with
// distance (small grit before cobbles): no popping. Empty cells are skipped on the CPU and cells are
// frustum culled when the camera moves.
import * as THREE from 'three';
import { patchMaterial } from '../../render/Materials.js';
import { VG, SRGB } from './VegMaterial.js';
import { GROUND_GLSL } from './GroundData.js';

export const PCELL = 4;
export const R_FAR = 25;
const FADE_SMALL = [ 8, 15 ];
const FADE_COBBLE = [ 15, 24 ];
const MAX_CELLS = 240;
const N_COBBLE = 18, N_CHIP = 44, N_SMALL = 150;
const BEACH_V = 1.8; // our beach heights are compressed (Terrain.js): Tidewater's beach metres

function blueNoise( rand, n, size, k = 12 ) {
	const pts = [];
	for ( let i = 0; i < n; i ++ ) {
		let best = null, bestD = - 1;
		for ( let c = 0; c < ( i === 0 ? 1 : k ); c ++ ) {
			const x = rand() * size, z = rand() * size;
			let dmin = Infinity;
			for ( const p of pts ) {
				let dx = Math.abs( p[ 0 ] - x ), dz = Math.abs( p[ 1 ] - z );
				dx = Math.min( dx, size - dx );
				dz = Math.min( dz, size - dz );
				dmin = Math.min( dmin, dx * dx + dz * dz );
			}
			if ( dmin > bestD ) { bestD = dmin; best = [ x, z ]; }
		}
		pts.push( best );
	}
	return pts;
}

// ---- stone shapes (Tidewater DebrisShapes.js) ---------------------------------------------------------

function hash1( n ) {
	const s = Math.sin( n * 127.1 + 311.7 ) * 43758.5453;
	return s - Math.floor( s );
}

function hash3( i, j, k, s ) {
	let h = ( i * 374761393 + j * 668265263 + k * 1440662683 + s * 2147483647 ) | 0;
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	h ^= h >>> 16;
	return ( h >>> 0 ) / 4294967296;
}

// smooth 3D value noise in [-1, 1]
function vnoise3( x, y, z, s = 0 ) {
	const i = Math.floor( x ), j = Math.floor( y ), k = Math.floor( z );
	const fx = x - i, fy = y - j, fz = z - k;
	const ux = fx * fx * ( 3 - 2 * fx ), uy = fy * fy * ( 3 - 2 * fy ), uz = fz * fz * ( 3 - 2 * fz );
	const l = ( a, b, t ) => a + ( b - a ) * t;
	const h = ( a, b, c ) => hash3( i + a, j + b, k + c, s );
	return l(
		l( l( h( 0, 0, 0 ), h( 1, 0, 0 ), ux ), l( h( 0, 1, 0 ), h( 1, 1, 0 ), ux ), uy ),
		l( l( h( 0, 0, 1 ), h( 1, 0, 1 ), ux ), l( h( 0, 1, 1 ), h( 1, 1, 1 ), ux ), uy ),
		uz
	) * 2 - 1;
}

function icosphere( detail ) {
	const t = ( 1 + Math.sqrt( 5 ) ) / 2;
	const V = [ [ - 1, t, 0 ], [ 1, t, 0 ], [ - 1, - t, 0 ], [ 1, - t, 0 ], [ 0, - 1, t ], [ 0, 1, t ], [ 0, - 1, - t ], [ 0, 1, - t ], [ t, 0, - 1 ], [ t, 0, 1 ], [ - t, 0, - 1 ], [ - t, 0, 1 ] ]
		.map( ( v ) => { const l = Math.hypot( v[ 0 ], v[ 1 ], v[ 2 ] ); return [ v[ 0 ] / l, v[ 1 ] / l, v[ 2 ] / l ]; } );
	let F = [ 0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1 ];
	for ( let d = 0; d < detail; d ++ ) {
		const cache = new Map();
		const mid = ( a, b ) => {
			const key = a < b ? a * 100000 + b : b * 100000 + a;
			let r = cache.get( key );
			if ( r === undefined ) {
				const p = [ V[ a ][ 0 ] + V[ b ][ 0 ], V[ a ][ 1 ] + V[ b ][ 1 ], V[ a ][ 2 ] + V[ b ][ 2 ] ];
				const l = Math.hypot( p[ 0 ], p[ 1 ], p[ 2 ] );
				V.push( [ p[ 0 ] / l, p[ 1 ] / l, p[ 2 ] / l ] );
				r = V.length - 1;
				cache.set( key, r );
			}
			return r;
		};
		const F2 = [];
		for ( let f = 0; f < F.length; f += 3 ) {
			const a = F[ f ], b = F[ f + 1 ], c = F[ f + 2 ];
			const ab = mid( a, b ), bc = mid( b, c ), ca = mid( c, a );
			F2.push( a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca );
		}
		F = F2;
	}
	return { V, F };
}
const ICO = [ icosphere( 0 ), icosphere( 1 ) ];

function vertexNormals( p, idx ) {
	const n = new Float32Array( p.length );
	for ( let t = 0; t < idx.length; t += 3 ) {
		const a = idx[ t ] * 3, b = idx[ t + 1 ] * 3, c = idx[ t + 2 ] * 3;
		const ux = p[ b ] - p[ a ], uy = p[ b + 1 ] - p[ a + 1 ], uz = p[ b + 2 ] - p[ a + 2 ];
		const vx = p[ c ] - p[ a ], vy = p[ c + 1 ] - p[ a + 1 ], vz = p[ c + 2 ] - p[ a + 2 ];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		for ( const o of [ a, b, c ] ) { n[ o ] += nx; n[ o + 1 ] += ny; n[ o + 2 ] += nz; }
	}
	for ( let i = 0; i < n.length; i += 3 ) {
		const l = Math.hypot( n[ i ], n[ i + 1 ], n[ i + 2 ] ) || 1;
		n[ i ] /= l; n[ i + 1 ] /= l; n[ i + 2 ] /= l;
	}
	return n;
}

// triangles wound so their face normal agrees with the vertex normals (village GeoBuilder fixWinding)
function fixWinding( part ) {
	const { p, n, idx } = part;
	for ( let t = 0; t < idx.length; t += 3 ) {
		const i0 = idx[ t ], i1 = idx[ t + 1 ], i2 = idx[ t + 2 ];
		const bx = p[ i1 * 3 ] - p[ i0 * 3 ], by = p[ i1 * 3 + 1 ] - p[ i0 * 3 + 1 ], bz = p[ i1 * 3 + 2 ] - p[ i0 * 3 + 2 ];
		const cx = p[ i2 * 3 ] - p[ i0 * 3 ], cy = p[ i2 * 3 + 1 ] - p[ i0 * 3 + 1 ], cz = p[ i2 * 3 + 2 ] - p[ i0 * 3 + 2 ];
		const fx = by * cz - bz * cy, fy = bz * cx - bx * cz, fz = bx * cy - by * cx;
		const nx = n[ i0 * 3 ] + n[ i1 * 3 ] + n[ i2 * 3 ], ny = n[ i0 * 3 + 1 ] + n[ i1 * 3 + 1 ] + n[ i2 * 3 + 1 ], nz = n[ i0 * 3 + 2 ] + n[ i1 * 3 + 2 ] + n[ i2 * 3 + 2 ];
		if ( fx * nx + fy * ny + fz * nz < 0 ) { idx[ t + 1 ] = i2; idx[ t + 2 ] = i1; }
	}
	return part;
}

// Unit-radius stone: rounded (beach pebble / cobble) or angular (a few flat fracture faces)
function stonePart( variant, detail = 1, angular = 0 ) {
	const { V, F } = ICO[ detail ];
	const s = variant * 17 + 3;
	const planes = [];
	for ( let k = 0; k < Math.round( angular * 6 ); k ++ ) {
		const u = hash1( s + k * 3.1 ) * 2 - 1, a = hash1( s + k * 5.7 ) * Math.PI * 2;
		const rr = Math.sqrt( 1 - u * u );
		planes.push( [ rr * Math.cos( a ), u * 0.7, rr * Math.sin( a ), 0.68 + hash1( s + k * 9.3 ) * 0.22 ] );
	}
	const p = [];
	for ( const v of V ) {
		let r = 1 + 0.13 * vnoise3( v[ 0 ] * 1.3 + s, v[ 1 ] * 1.3, v[ 2 ] * 1.3, s ) + 0.05 * vnoise3( v[ 0 ] * 3.1, v[ 1 ] * 3.1 + s, v[ 2 ] * 3.1, s + 1 );
		for ( const q of planes ) {
			const d = v[ 0 ] * q[ 0 ] + v[ 1 ] * q[ 1 ] + v[ 2 ] * q[ 2 ];
			if ( d > 0.05 ) {
				// soft-min with the plane distance: flat face, rounded edge
				const rp = q[ 3 ] / d;
				const k = 0.08;
				const h = Math.max( 0, Math.min( 1, 0.5 + 0.5 * ( rp - r ) / k ) );
				r = rp + ( r - rp ) * h - k * h * ( 1 - h );
			}
		}
		p.push( v[ 0 ] * r, v[ 1 ] * r, v[ 2 ] * r );
	}
	const idx = F.slice();
	const n = vertexNormals( p, idx );
	return fixWinding( { p, n: Array.from( n ), idx } );
}

// flat, slightly domed fragment with a ragged outline (shell / coral grit), unit radius
function chipPart( v ) {
	const p = [ 0, 0.3, 0 ], idx = [];
	const m = 6;
	for ( let k = 0; k < m; k ++ ) {
		const a = ( k + ( ( v * 7 + k * 3 ) % 5 ) * 0.12 ) / m * Math.PI * 2;
		const r = 0.65 + ( ( v * 13 + k * 7 ) % 9 ) / 9 * 0.45;
		p.push( Math.cos( a ) * r, 0, Math.sin( a ) * r );
	}
	for ( let k = 0; k < m; k ++ ) idx.push( 0, 1 + ( k + 1 ) % m, 1 + k );
	const n = new Array( p.length ).fill( 0 );
	for ( let t = 0; t < idx.length; t += 3 ) {
		const a = idx[ t ] * 3, b = idx[ t + 1 ] * 3, c = idx[ t + 2 ] * 3;
		const ux = p[ b ] - p[ a ], uy = p[ b + 1 ] - p[ a + 1 ], uz = p[ b + 2 ] - p[ a + 2 ];
		const vx = p[ c ] - p[ a ], vy = p[ c + 1 ] - p[ a + 1 ], vz = p[ c + 2 ] - p[ a + 2 ];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		for ( const o of [ a, b, c ] ) { n[ o ] += nx; n[ o + 1 ] += ny; n[ o + 2 ] += nz; }
	}
	for ( let i = 0; i < n.length; i += 3 ) {
		if ( n[ i + 1 ] < 0 ) { n[ i ] = - n[ i ]; n[ i + 1 ] = - n[ i + 1 ]; n[ i + 2 ] = - n[ i + 2 ]; }
		n[ i + 1 ] += 0.6; // rounded edges read softer
		const l = Math.hypot( n[ i ], n[ i + 1 ], n[ i + 2 ] );
		n[ i ] /= l; n[ i + 1 ] /= l; n[ i + 2 ] /= l;
	}
	// faces up
	for ( let t = 0; t < idx.length; t += 3 ) {
		const a = idx[ t ] * 3, b = idx[ t + 1 ] * 3, c = idx[ t + 2 ] * 3;
		const ux = p[ b ] - p[ a ], uz = p[ b + 2 ] - p[ a + 2 ], vx = p[ c ] - p[ a ], vz = p[ c + 2 ] - p[ a + 2 ];
		if ( uz * vx - ux * vz < 0 ) { const s = idx[ t + 1 ]; idx[ t + 1 ] = idx[ t + 2 ]; idx[ t + 2 ] = s; }
	}
	return { p, n, idx };
}

function buildPatch() {
	let s = 1234567;
	const rand = () => { s = ( s * 16807 ) % 2147483647; return ( s - 1 ) / 2147483646; };
	const pts = blueNoise( rand, N_COBBLE + N_CHIP + N_SMALL, PCELL );
	const pos = [], nor = [], slot = [], idx = [];
	for ( let k = 0; k < pts.length; k ++ ) {
		const type = k < N_COBBLE ? 1 : k < N_COBBLE + N_CHIP ? 2 : 0;
		const part = type === 2 ? chipPart( k % 7 ) : type === 1 ? stonePart( 30 + ( k % 6 ), 1, k % 2 ? 0.5 : 0.05 ) : stonePart( 20 + ( k % 7 ), 0, k % 3 === 0 ? 0.8 : 0.1 );
		const base = pos.length / 3;
		for ( let i = 0; i < part.p.length; i ++ ) pos.push( part.p[ i ] );
		for ( let i = 0; i < part.n.length; i ++ ) nor.push( part.n[ i ] );
		for ( let i = 0; i < part.p.length / 3; i ++ ) slot.push( pts[ k ][ 0 ], pts[ k ][ 1 ], rand(), type );
		for ( let i = 0; i < part.idx.length; i ++ ) idx.push( base + part.idx[ i ] );
	}
	const g = new THREE.InstancedBufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( nor, 3 ) );
	g.setAttribute( 'aSlot', new THREE.Float32BufferAttribute( slot, 4 ) );
	g.setIndex( new THREE.Uint16BufferAttribute( idx, 1 ) );
	g.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
	return g;
}

// ---- GLSL ----------------------------------------------------------------------------------------------

const f1 = ( x ) => Number( x ).toFixed( 1 );

const VERT_PARS = /* glsl */`
	attribute vec4 iCell; attribute vec4 aSlot;
	uniform vec3 uGroundOrigin; uniform vec2 uGroundCam; uniform vec2 uPebFade; uniform vec3 uCamPos;
	${ GROUND_GLSL }
	varying vec4 vPebble; // type, palette, seed, radius
	varying vec4 vPebRel; // position relative to the ground origin, ground height under it
	float pebHash12( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
	vec3 pebP; vec3 pebN;
	void pebDeform() {
		vec2 rel = iCell.xy + aSlot.xy;
		vec2 xz = iCell.zw + aSlot.xy; // world: hashes (stable while the camera moves)
		vec3 P = position;
		vec3 N = normal;
		vec4 m = groundPebbles( rel );
		float ptype = aSlot.w;
		bool isSmall = ptype < 0.5;
		bool isCob = ptype > 0.5 && ptype < 1.5;
		bool isChip = ptype > 1.5;
		float dens = isSmall ? m.x : isCob ? m.y : m.z;
		// (hashes of the world position modulo 4 km: sin() keeps its precision)
		vec2 hp = mod( xz, 4096.0 );
		float h1 = pebHash12( hp * 1.37 + 0.51 );
		float h2 = pebHash12( hp * 2.11 + 7.3 );
		float h3 = pebHash12( hp * 3.7 + 1.1 );
		float h4 = pebHash12( hp * 5.3 + 2.9 );
		float h5 = pebHash12( hp * 8.9 + 4.7 );
		float present = step( h1, dens );
		float d = length( rel - uGroundCam );
		float fade = 1.0 - smoothstep( isCob ? ${ f1( FADE_COBBLE[ 0 ] ) } : ${ f1( FADE_SMALL[ 0 ] ) }, isCob ? ${ f1( FADE_COBBLE[ 1 ] ) } : ${ f1( FADE_SMALL[ 1 ] ) }, d / uPebFade.x + h4 * 2.5 );
		// size: denser patches have more but slightly smaller stones
		float r = ( isSmall ? mix( 0.007, 0.024, h2 * h2 ) : isCob ? mix( 0.03, 0.09, h2 * h2 ) : mix( 0.008, 0.022, h2 ) ) * ( 1.15 - dens * 0.3 );
		vec3 sc = vec3( r * mix( 1.0, 1.55, h3 ), r * ( isChip ? 0.28 : mix( 0.42, 0.8, h4 ) ), r );
		// (ours) stones smaller than about a pixel shrink away: without temporal anti-aliasing they would
		// flicker as single dark pixels (uPebFade.y: pixels per radian)
		float px = r * uPebFade.y / max( distance( vec3( xz.x, uCamPos.y, xz.y ), uCamPos ), 0.1 );
		float k = present * fade * smoothstep( 0.3, 0.9, px );
		// tilt about the local x axis (the stones don't all lie flat), then yaw
		float tilt = ( h5 - 0.5 ) * ( isChip ? 0.5 : 0.9 );
		float ct = cos( tilt ), st = sin( tilt );
		vec3 q0 = P * sc * k;
		vec3 q = vec3( q0.x, q0.y * ct - q0.z * st, q0.y * st + q0.z * ct );
		float yaw = h3 * 6.2832;
		float c = cos( yaw ), s = sin( yaw );
		float gy = groundAt( rel ).x;
		float lift = sc.y * ( isChip ? 0.35 : 0.15 ) * k;
		vec3 n0 = N / max( sc, vec3( 1e-6 ) );
		vec3 nl = vec3( n0.x, n0.y * ct - n0.z * st, n0.y * st + n0.z * ct );
		pebN = normalize( vec3( nl.x * c + nl.z * s, nl.y, nl.z * c - nl.x * s ) );
		// palette: dark basalt / grey / pale coral limestone in proportions set by the region
		// (mask alpha: 0 rocky shore .. 1 white coral beach)
		float dark = mix( 0.72, 0.24, m.w ), grey = mix( 0.26, 0.3, m.w );
		float pal = h4 < dark ? mix( 0.02, 0.3, h2 ) : h4 < dark + grey ? mix( 0.32, 0.56, h2 ) : mix( 0.6, 0.97, h2 );
		vPebble = vec4( ptype, pal, h2 + h3, r );
		pebP = vec3( rel.x + q.x * c + q.z * s, gy + lift + q.y, rel.y + q.z * c - q.x * s );
		vPebRel = vec4( pebP, gy );
	}
`;

const FRAG_PARS = /* glsl */`
	uniform sampler2D tDetail;
	varying vec4 vPebble; varying vec4 vPebRel;
	float debrisHashS( float s, float k ) { return fract( sin( s * 91.345 + k ) * 47453.5453 ); }
	// Stone surface (Tidewater NatureMaterial.js debrisStoneSurface, style 0): T triplanar detail sample
	// (r facets, g soil / stones, b grains / pits, a fbm); pal 0..1 basalt .. limestone .. ochre
	vec3 pebStone( vec4 T, float pal, float seed, out float rough, out float hd, float tile ) {
		vec3 col = mix( ${ SRGB( 0.15, 0.145, 0.14 ) }, ${ SRGB( 0.4, 0.38, 0.35 ) }, smoothstep( 0.12, 0.42, pal ) );
		col = mix( col, ${ SRGB( 0.76, 0.72, 0.63 ) }, smoothstep( 0.5, 0.72, pal ) );
		col = mix( col, ${ SRGB( 0.55, 0.4, 0.28 ) }, smoothstep( 0.88, 0.97, pal ) );
		// per stone tone, speckles and pits, soft blotches
		col *= debrisHashS( seed, 1.7 ) * 0.3 + 0.85;
		col *= ( ( T.b - 0.5 ) * 0.5 + 1.0 ) * ( ( T.a - 0.5 ) * 0.6 + 1.0 );
		float pits = smoothstep( 0.62, 0.85, T.b ) * smoothstep( 0.45, 0.8, pal );
		col = mix( col, col * 0.55, pits * 0.6 );
		// quartz veins / bands in a few of the dark stones
		float vein = smoothstep( 0.03, 0.0, abs( fract( T.a * 7.0 + seed * 3.0 ) - 0.5 ) ) * step( debrisHashS( seed, 5.1 ), 0.25 ) * ( 1.0 - smoothstep( 0.3, 0.5, pal ) );
		col = mix( col, ${ SRGB( 0.7, 0.68, 0.62 ) }, vein * 0.7 );
		rough = 0.74 + T.b * 0.12;
		hd = ( T.r * 0.6 + T.b * 0.3 ) * tile * 0.06;
		return col;
	}
`;

const FRAG_COLOR = /* glsl */`
	vec3 pp = vPebRel.xyz;
	vec3 pN = normalize( ( vec4( normalize( vNormal ), 0.0 ) * viewMatrix ).xyz ); // world
	float ptype = vPebble.x; float pal = vPebble.y; float seed = vPebble.z; float pr = vPebble.w;
	float isChip = step( 1.5, ptype );
	float tile = clamp( pr * 4.0, 0.03, 0.3 );
	vec3 tw = pow( abs( pN ), vec3( 4.0 ) ); tw /= tw.x + tw.y + tw.z;
	vec4 T3 = texture2D( tDetail, pp.zy / tile ) * tw.x + texture2D( tDetail, pp.xz / tile + 0.37 ) * tw.y + texture2D( tDetail, pp.xy / tile + 0.71 ) * tw.z;
	float pRough, pHd;
	vec3 stoneC = pebStone( T3, pal, seed, pRough, pHd, tile );
	// shell and coral grit: white / cream / pink chips with growth bands
	float hue = fract( seed * 7.13 );
	vec3 chip = mix( ${ SRGB( 0.94, 0.92, 0.88 ) }, ${ SRGB( 0.86, 0.74, 0.56 ) }, smoothstep( 0.3, 0.45, hue ) );
	chip = mix( chip, ${ SRGB( 0.9, 0.6, 0.56 ) }, smoothstep( 0.58, 0.66, hue ) );
	chip = mix( chip, ${ SRGB( 0.58, 0.4, 0.28 ) }, smoothstep( 0.76, 0.82, hue ) );
	chip = mix( chip, ${ SRGB( 0.36, 0.33, 0.4 ) }, smoothstep( 0.9, 0.95, hue ) );
	chip *= ( ( T3.a - 0.5 ) * 0.5 + 1.0 ) * ( sin( ( pp.x + pp.z ) * 900.0 ) * 0.06 + 0.97 );
	// sea glass among the grit (frosted green / brown / white) and pumice among the pebbles (pale, porous)
	float glass = step( 0.955, fract( seed * 3.71 ) ) * isChip;
	float gh = fract( seed * 13.3 );
	vec3 glassC = gh < 0.45 ? ${ SRGB( 0.42, 0.62, 0.45 ) } : gh < 0.75 ? ${ SRGB( 0.52, 0.34, 0.18 ) } : ${ SRGB( 0.8, 0.84, 0.82 ) };
	chip = mix( chip, glassC, glass );
	float pumice = step( 0.93, fract( seed * 5.17 ) ) * ( 1.0 - isChip );
	vec3 pumiceC = ${ SRGB( 0.66, 0.64, 0.6 ) } * ( 1.0 - smoothstep( 0.55, 0.8, T3.b ) * 0.45 );
	vec3 pCol = mix( mix( stoneC, pumiceC, pumice ), chip, isChip );
	float pRoughF = mix( mix( pRough, 0.95, pumice ), mix( 0.5, 0.12, glass ), isChip );
	// wet near the sea, dusted with sand where they touch the ground (heights in Tidewater's beach metres)
	float ground = vPebRel.w;
	float contact = 1.0 - smoothstep( 0.0, max( pr * 0.7, 0.006 ), pp.y - ground );
	float wet = 1.0 - smoothstep( 0.4, 1.0, pp.y * ${ BEACH_V.toFixed( 1 ) } );
	pCol = mix( pCol, ${ SRGB( 0.78, 0.7, 0.56 ) }, contact * smoothstep( 0.8, 1.6, ground * ${ BEACH_V.toFixed( 1 ) } ) * 0.35 );
	pCol *= 1.0 - wet * 0.45;
	pRoughF = mix( pRoughF, 0.22, wet * 0.85 );
	diffuseColor.rgb = pCol;
	dtAO *= clamp( 1.0 - contact * 0.5, 0.0, 1.0 );
	float pebBump = pHd * ( 1.0 - isChip );
`;

// relief of the stone surface: surface gradient of the height from its screen derivatives
const FRAG_NORMAL = /* glsl */`
	{
		vec3 dpx = dFdx( -vViewPosition ), dpy = dFdy( -vViewPosition );
		float dhx = dFdx( pebBump ), dhy = dFdy( pebBump );
		vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
		float det = dot( dpx, r1 );
		vec3 grad = sign( det ) * ( dhx * r1 + dhy * r2 );
		normal = normalize( abs( det ) * normal - grad );
	}
`;

export const PEBBLE_QUALITY = { low: 0, medium: 0.72, high: 1, ultra: 1 };

export class PebbleField {
	constructor( ground ) {
		this.ground = ground;
		this.U = { uPebFade: { value: new THREE.Vector2( 1, 0 ) }, uGroundCam: { value: new THREE.Vector2() }, ...ground.uniforms };
		const m = new THREE.MeshStandardMaterial( { roughness: 0.8, metalness: 0 } );
		patchMaterial( m, 'vegPebbles', ( shader ) => {
			Object.assign( shader.uniforms, VG, this.U );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + VERT_PARS )
				.replace( '#include <beginnormal_vertex>', 'pebDeform();\nvec3 objectNormal = pebN;' )
				.replace( '#include <begin_vertex>', 'vec3 transformed = pebP;' );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + FRAG_PARS )
				.replace( '#include <map_fragment>', FRAG_COLOR )
				.replace( '#include <normal_fragment_maps>', FRAG_NORMAL )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( pRoughF, 0.05, 1.0 );' );
		} );
		this.material = m;
		const geometry = buildPatch();
		this.patchTris = geometry.index.count / 3;
		this.arr = new Float32Array( MAX_CELLS * 4 );
		this.attr = new THREE.InstancedBufferAttribute( this.arr, 4 );
		this.attr.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( 'iCell', this.attr );
		geometry.instanceCount = 0;
		this.geometry = geometry;
		this.mesh = new THREE.Mesh( geometry, m );
		this.mesh.name = 'veg-pebbles';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = true;
		this.count = 0;
		this._frustum = new THREE.Frustum();
		this._mat = new THREE.Matrix4();
		this._box = new THREE.Box3();
		this._last = new Float64Array( 9 ).fill( NaN );
		this.setQuality( 'high' );
	}

	setQuality( name ) {
		this.k = PEBBLE_QUALITY[ name ] ?? 1;
		this.mesh.visible = this.k > 0;
		this.U.uPebFade.value.x = Math.max( this.k, 0.01 );
		this._last.fill( NaN );
	}

	get radius() { return R_FAR * this.k; }

	// recompute the visible cells (skipped when the camera and the ground data did not change)
	update( camera, groundY ) {
		const gd = this.ground;
		// pixels per radian at the centre of the view (the stones' screen-size fade)
		this.U.uPebFade.value.y = ( this.pixelHeight || 1080 ) / ( 2 * Math.tan( camera.fov * Math.PI / 360 ) );
		const e = camera.matrixWorld.elements;
		this.U.uGroundCam.value.set( e[ 12 ] - gd.origin.x, e[ 14 ] - gd.origin.z );
		this.mesh.position.copy( gd.origin );
		if ( this.k <= 0 ) return false;
		const L = this._last;
		const pe = camera.projectionMatrix.elements;
		if ( Math.abs( e[ 12 ] - L[ 0 ] ) < 0.05 && Math.abs( e[ 13 ] - L[ 1 ] ) < 0.05 && Math.abs( e[ 14 ] - L[ 2 ] ) < 0.05 &&
			Math.abs( e[ 8 ] - L[ 3 ] ) < 1e-3 && Math.abs( e[ 9 ] - L[ 4 ] ) < 1e-3 && Math.abs( e[ 10 ] - L[ 5 ] ) < 1e-3 &&
			pe[ 0 ] === L[ 6 ] && pe[ 5 ] === L[ 7 ] && gd.version === L[ 8 ] ) return false;
		L[ 0 ] = e[ 12 ]; L[ 1 ] = e[ 13 ]; L[ 2 ] = e[ 14 ];
		L[ 3 ] = e[ 8 ]; L[ 4 ] = e[ 9 ]; L[ 5 ] = e[ 10 ];
		L[ 6 ] = pe[ 0 ]; L[ 7 ] = pe[ 5 ]; L[ 8 ] = gd.version;
		this._mat.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._mat, camera.coordinateSystem, camera.reversedDepth );
		const cx = e[ 12 ], cy = e[ 13 ], cz = e[ 14 ];
		const R = this.radius;
		let count = 0;
		// nothing to see from high above
		if ( cy - groundY < R ) {
			const i0 = Math.floor( ( cx - R ) / PCELL ), i1 = Math.floor( ( cx + R ) / PCELL );
			const j0 = Math.floor( ( cz - R ) / PCELL ), j1 = Math.floor( ( cz + R ) / PCELL );
			const C = gd.cells;
			for ( let j = j0; j <= j1 && count < MAX_CELLS; j ++ ) for ( let i = i0; i <= i1; i ++ ) {
				const x0 = i * PCELL, z0 = j * PCELL;
				const dx = Math.max( x0 - cx, 0, cx - x0 - PCELL ), dz = Math.max( z0 - cz, 0, cz - z0 - PCELL );
				if ( Math.hypot( dx, dz ) > R ) continue;
				const k = gd.cell4( i, j );
				if ( k < 0 || ! C[ k + 3 ] ) continue;
				if ( ! gd.ready( Math.floor( x0 / 32 ), Math.floor( z0 / 32 ) ) ) continue;
				this._box.min.set( x0, C[ k ] - 0.2, z0 );
				this._box.max.set( x0 + PCELL, C[ k + 1 ] + 0.3, z0 + PCELL );
				if ( ! this._frustum.intersectsBox( this._box ) ) continue;
				if ( count >= MAX_CELLS ) break;
				this.arr[ count * 4 ] = x0 - gd.origin.x;
				this.arr[ count * 4 + 1 ] = z0 - gd.origin.z;
				this.arr[ count * 4 + 2 ] = x0;
				this.arr[ count * 4 + 3 ] = z0;
				count ++;
			}
		}
		this.count = count;
		this.geometry.instanceCount = count;
		this.attr.clearUpdateRanges();
		this.attr.addUpdateRange( 0, Math.max( 1, count ) * 4 );
		this.attr.needsUpdate = true;
		return true;
	}

	get triangles() { return this.count * this.patchTris; }

	dispose() {
		this.material.dispose();
		this.geometry.dispose();
	}
}
