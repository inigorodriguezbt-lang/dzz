// Boats and aircraft. Hulls are lofted from V / round-bilge sections (keel, chine, flared topsides, gunwale,
// then a closed deck or an open cockpit with its floor), fuselages from superellipse sections with the
// glazing, frames and liveries picked per face. Rotors, propellers and outboards are animated parts.
// Output matches the cars (car.js result()): near / far / glass geometries, wheels, steering, parts, meta.
//
// Frames: boats have y = 0 on the design waterline; aircraft y = 0 on the ground. f = -z forward.
import * as THREE from 'three';
import { Kit, MAT, mat, lerp } from '../kit.js';
import { ATLAS } from '../materials.js';
import { pchip, Bins } from './shell.js';
import { wheelKit, farWheelKit, steeringKit, seat, bench } from './parts.js';

export const CRAFT = {};

const V3 = THREE.Vector3;

// ---- generic loft over full rings -------------------------------------------------------------------

// rings: [ { f, pts: [ [ x, y ], ... ] } ] front to rear, every ring the same length, closed loops (bottom -> right -> top -> left)
// mf( ringIndex, segIndex, centroid [x,y,z], normalHint ) -> MAT or 'GLASS'
function loftRings( bins, gbins, rings, mf, { capFront = false, capRear = false } = {} ) {
	const L = rings.map( r => r.pts.map( p => [ p[ 0 ], p[ 1 ], - r.f ] ) );
	const m = L[ 0 ].length;
	for ( let i = 1; i < L.length; i ++ ) {
		const A = L[ i - 1 ], B = L[ i ];
		for ( let k = 0; k < m; k ++ ) {
			const k2 = ( k + 1 ) % m;
			const c = [ ( A[ k ][ 0 ] + B[ k2 ][ 0 ] ) / 2, ( A[ k ][ 1 ] + B[ k2 ][ 1 ] ) / 2, ( A[ k ][ 2 ] + B[ k2 ][ 2 ] ) / 2 ];
			const mm = mf( i, k, c );
			if ( mm === 'GLASS' ) gbins.quad( MAT.glassDark, A[ k ], A[ k2 ], B[ k2 ], B[ k ] );
			else if ( mm ) bins.quad( mm, A[ k ], A[ k2 ], B[ k2 ], B[ k ] );
		}
	}
	const cap = ( R, flip, mm ) => {
		const c = [ 0, 0, 0 ];
		for ( const p of R ) { c[ 0 ] += p[ 0 ] / m; c[ 1 ] += p[ 1 ] / m; c[ 2 ] += p[ 2 ] / m; }
		for ( let k = 0; k < m; k ++ ) { const k2 = ( k + 1 ) % m; if ( flip ) bins.tri( mm, c, R[ k2 ], R[ k ] ); else bins.tri( mm, c, R[ k ], R[ k2 ] ); }
	};
	if ( capFront ) cap( L[ 0 ], false, capFront );
	if ( capRear ) cap( L[ L.length - 1 ], true, capRear );
}

const mirrorLoop = ( h ) => {
	const o = h.slice();
	for ( let k = h.length - 2; k >= 1; k -- ) o.push( [ - h[ k ][ 0 ], h[ k ][ 1 ] ] );
	return o;
};

// superellipse ring (32 points from the bottom around the right side, over the top and down the left)
function superRing( w, h, cy, n = 2.2, N = 32, cx = 0 ) {
	const out = [];
	for ( let i = 0; i < N; i ++ ) {
		const t = - Math.PI / 2 + i / N * Math.PI * 2;
		const c = Math.cos( t ), s = Math.sin( t );
		out.push( [ cx + w * Math.sign( c ) * Math.pow( Math.abs( c ), 2 / n ), cy + h * Math.sign( s ) * Math.pow( Math.abs( s ), 2 / n ) ] );
	}
	return out;
}

// ---- hulls ------------------------------------------------------------------------------------------------

// H: { bow, transom, width, keel, chine (x fraction), chineY, sheer (keys), convex (round bilge), camber, wells: [ { f0, f1, floor, gunwale } ],
//      bottomMat, topsideMat, sheerMat, deckMat, floorMat, innerMat, boot (waterline stripe height) }
function hullRings( H, far ) {
	const fw = pchip( H.width ), fk = pchip( H.keel ), fc = pchip( H.chine ), fcy = pchip( H.chineY ), fs = pchip( H.sheer );
	const st = [];
	const n = far ? 14 : 44;
	// denser towards the bow where the lines change fastest
	for ( let i = 0; i <= n; i ++ ) { const t = i / n; st.push( lerp( H.bow, H.transom, 1 - Math.pow( 1 - t, 1.6 ) ) ); }
	for ( const w of H.wells || [] ) for ( const f of [ w.f0, w.f0 - 0.06, w.f1 + 0.06, w.f1 ] ) st.push( f );
	const fl = [ ...new Set( st.map( f => + f.toFixed( 4 ) ) ) ].sort( ( a, b ) => b - a );
	const rings = [];
	for ( const f of fl ) {
		const hw = Math.max( 0.012, fw( f ) ), yk = fk( f ), xc = Math.max( 0.008, hw * fc( f ) ), yc = fcy( f ), ys = fs( f );
		let o = 0, well = null;
		for ( const w of H.wells || [] ) { const t = ( f <= w.f0 && f >= w.f1 ) ? Math.min( 1, ( w.f0 - f ) / 0.06, ( f - w.f1 ) / 0.06 ) : 0; if ( t > o ) { o = t; well = w; } }
		const h = [ [ 0, yk ] ];
		const cv = H.convex ?? 0.03;
		// bottom panel from the keel to the chine, bowed out a little (round bilge when `convex` is large)
		for ( const t of [ 0.25, 0.5, 0.75 ] ) h.push( [ xc * t + cv * Math.sin( t * Math.PI ) * 0.6, lerp( yk, yc, t ) - cv * Math.sin( t * Math.PI ) * 0.5 ] );
		h.push( [ xc, yc ] );
		const cf = Math.min( 0.05, hw * 0.05 );
		h.push( [ xc + cf, yc + 0.005 ] );
		for ( const t of [ 0.3, 0.6, 1 ] ) h.push( [ lerp( xc + cf, hw, Math.sin( t * Math.PI / 2 ) ), lerp( yc, ys - 0.03, t ) ] );
		h.push( [ hw - 0.005, ys - 0.008 ], [ hw - 0.025, ys ] );
		const gw = well?.gunwale ?? 0.1;
		const camber = H.camber ?? 0.04;
		const closed = [ 0.15, 0.4, 0.65, 0.85, 1 ].map( s => [ ( hw - 0.025 ) * ( 1 - s ), ys + camber * ( 1 - ( 1 - s ) * ( 1 - s ) ) ] );
		if ( o > 0 ) {
			const xi = Math.max( 0.02, hw - 0.025 - gw );
			const open = [ [ xi, ys - 0.004 ], [ xi, lerp( ys, well.floor, 0.5 ) ], [ xi, well.floor ], [ xi * 0.5, well.floor ], [ 0, well.floor ] ];
			for ( let k = 0; k < 5; k ++ ) h.push( [ lerp( closed[ k ][ 0 ], open[ k ][ 0 ], o ), lerp( closed[ k ][ 1 ], open[ k ][ 1 ], o ) ] );
		} else for ( const p of closed ) h.push( p );
		rings.push( { f, pts: mirrorLoop( h ), o, well, n: h.length, ys } );
	}
	return rings;
}

function buildHull( k, glass, H, far ) {
	const rings = hullRings( H, far );
	const bins = new Bins(), gb = new Bins();
	const nh = rings[ 0 ].n;
	loftRings( bins, gb, rings, ( i, seg, c ) => {
		const kk = seg < nh - 1 ? seg : 2 * nh - 3 - seg; // index on the right half
		const R = rings[ i ].o > rings[ i - 1 ].o ? rings[ i ] : rings[ i - 1 ];
		if ( kk >= nh - 6 ) {
			// deck / cockpit
			if ( R.o > 0.5 ) { const q = kk - ( nh - 6 ); return q <= 0 ? MAT[ H.gunwaleMat || 'gelcoat' ] : q <= 2 ? MAT[ H.innerMat || 'gelcoat' ] : MAT[ H.floorMat || 'deck' ]; }
			return MAT[ H.deckMat || 'gelcoat' ];
		}
		if ( kk >= nh - 8 ) return MAT[ H.gunwaleMat || 'gelcoat' ];
		// bottom paint up to the chine (following the section, so the line stays clean), a boot top on the chine flat
		if ( kk <= 3 ) return MAT[ H.bottomMat || 'gelcoat' ];
		if ( kk === 4 ) return MAT[ H.bootMat || H.bottomMat || 'gelcoat' ];
		if ( H.sheerBand && c[ 1 ] > R.ys - H.sheerBand ) return MAT[ H.sheerMat || 'paint2' ];
		return MAT[ H.topsideMat || 'paint' ];
	}, { capRear: MAT[ H.transomMat || H.topsideMat || 'paint' ] } );
	bins.emit( k, 0.5 );
	gb.emit( glass, 0.9 );
	return rings;
}

// ---- fuselages -----------------------------------------------------------------------------------------------

// S: [ [ f, w, h, cy, n ] ] stations front to rear
function podRings( S, far ) {
	const N = far ? 16 : 32;
	const fw = pchip( S.map( s => [ s[ 0 ], s[ 1 ] ] ) ), fh = pchip( S.map( s => [ s[ 0 ], s[ 2 ] ] ) ), fy = pchip( S.map( s => [ s[ 0 ], s[ 3 ] ] ) ), fn = pchip( S.map( s => [ s[ 0 ], s[ 4 ] ?? 2.2 ] ) );
	const f0 = S[ 0 ][ 0 ], f1 = S[ S.length - 1 ][ 0 ];
	const list = [];
	const steps = far ? 18 : 70;
	for ( let i = 0; i <= steps; i ++ ) list.push( lerp( f0, f1, i / steps ) );
	for ( const s of S ) list.push( s[ 0 ] );
	const fl = [ ...new Set( list.map( f => + f.toFixed( 4 ) ) ) ].sort( ( a, b ) => b - a );
	return fl.map( f => ( { f, pts: superRing( Math.max( 0.01, fw( f ) ), Math.max( 0.01, fh( f ) ), fy( f ), fn( f ), N ), w: fw( f ), h: fh( f ), cy: fy( f ) } ) );
}

// a tapered slab between two chord lines (wing, fin, stabiliser): root and tip = { p: [x,y,z] leading edge, chord, thick }
// span direction from root to tip, chord along +z (trailing), thickness along `up`
function airfoil( k, root, tip, m, up = [ 0, 1, 0 ], segs = 10 ) {
	const prof = [];
	for ( let i = 0; i <= segs; i ++ ) {
		const t = i / segs;
		// NACA-like thickness distribution, closed trailing edge
		const th = 5 * ( 0.2969 * Math.sqrt( t ) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4 );
		prof.push( [ t, th ] );
	}
	const U = new V3( ...up );
	const pt = ( sec, t, side ) => {
		const i = Math.round( t * segs );
		const th = prof[ i ][ 1 ] * sec.thick / 2 * side;
		return new V3( ...sec.p ).add( new V3( 0, 0, sec.chord * t ) ).addScaledVector( U, th + ( sec.camber ?? 0 ) * Math.sin( t * Math.PI ) );
	};
	const pos = [];
	for ( const side of [ 1, - 1 ] ) {
		for ( let i = 0; i < segs; i ++ ) {
			const t0 = i / segs, t1 = ( i + 1 ) / segs;
			const a = pt( root, t0, side ), b = pt( root, t1, side ), c = pt( tip, t1, side ), d = pt( tip, t0, side );
			if ( side > 0 ) pos.push( ...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray() );
			else pos.push( ...a.toArray(), ...c.toArray(), ...b.toArray(), ...a.toArray(), ...d.toArray(), ...c.toArray() );
		}
	}
	// tip cap
	for ( let i = 0; i < segs; i ++ ) {
		const t0 = i / segs, t1 = ( i + 1 ) / segs;
		const a = pt( tip, t0, 1 ), b = pt( tip, t1, 1 ), c = pt( tip, t1, - 1 ), d = pt( tip, t0, - 1 );
		pos.push( ...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray() );
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.computeVertexNormals();
	return k.add( g, m );
}

// finish a craft model: geometries + bounds (same shape as the cars)
function result( P, k, glass, fk, extra = {}, fg = null ) {
	// far model: dark glass merged in
	if ( fg ) for ( const p of fg.parts ) fk.parts.push( p );
	const near = k.build(), far = fk.build();
	const gl = glass.parts.length ? glass.build() : null;
	near.computeBoundingBox();
	const bounds = near.boundingBox.clone();
	return { P, near, far, glass: gl, wheelGeo: extra.wheelGeo || null, wheels: extra.wheels || [], steering: extra.steering || null, bounds, parts: extra.parts || [], meta: extra.meta || {} };
}

// ---- outboard motor (a part: pivot on the transom bracket, the propeller a child part) -----------------------------

function outboard( hp = 250 ) {
	const k = new Kit();
	const s = hp > 150 ? 1 : 0.75;
	const cm = mat( 'white', { c: 0xf0f0ee, r: 0.3 } ), dk = mat( 'gloss', { c: 0x1c1d20, r: 0.35 } );
	// cowling (pivot at the top of the transom; the motor hangs aft and down)
	k.box( 0.42 * s, 0.5 * s, 0.62 * s, cm, { p: [ 0, 0.34 * s, 0.26 * s ] }, 0.12 * s );
	k.box( 0.44 * s, 0.1 * s, 0.64 * s, dk, { p: [ 0, 0.1 * s, 0.26 * s ] }, 0.04 );
	k.box( 0.36 * s, 0.03, 0.5 * s, dk, { p: [ 0, 0.5 * s, 0.26 * s ] }, 0.02 );
	// midsection and lower unit down past the keel
	k.box( 0.2 * s, 0.9, 0.34 * s, dk, { p: [ 0, - 0.42, 0.24 * s ] }, 0.06 );
	k.box( 0.14, 0.4, 0.26, dk, { p: [ 0, - 1.05, 0.22 ] }, 0.05 );
	k.cyl( 0.08, 0.06, 0.4, dk, { p: [ 0, - 1.1, 0.22 ], r: [ Math.PI / 2, 0, 0 ] }, 12 );
	k.box( 0.04, 0.28, 0.3, dk, { p: [ 0, - 1.3, 0.24 ] }, 0.015 );
	k.box( 0.3, 0.02, 0.2, dk, { p: [ 0, - 0.95, 0.28 ] }, 0.01 );
	// clamp bracket
	k.box( 0.3, 0.3, 0.12, MAT.steel, { p: [ 0, - 0.05, 0.02 ] }, 0.02 );
	return k.build();
}

function propeller( R = 0.17, blades = 3, m = MAT.steel ) {
	const k = new Kit();
	k.cyl( 0.045, 0.035, 0.12, m, { r: [ Math.PI / 2, 0, 0 ] }, 12 );
	for ( let i = 0; i < blades; i ++ ) {
		const a = i / blades * Math.PI * 2;
		k.box( 0.012, R, 0.09, m, { p: [ Math.cos( a ) * R / 2, Math.sin( a ) * R / 2, 0 ], r: [ 0.5, 0, a - Math.PI / 2 ] }, 0.006 );
	}
	return k.build();
}

// ---- speedboat (21 ft bowrider class) ----------------------------------------------------------------------------------

CRAFT.speedboat = () => ( {
	kind: 'boat', L: 6.4, W: 2.4, H: 1.5,
	hull: {
		bow: 3.2, transom: - 3.15,
		width: [ [ 3.2, 0.02 ], [ 3.0, 0.36 ], [ 2.6, 0.74 ], [ 2.0, 1.0 ], [ 1.0, 1.15 ], [ 0, 1.2 ], [ - 2.0, 1.2 ], [ - 3.15, 1.15 ] ],
		keel: [ [ 3.2, 0.78 ], [ 3.0, 0.3 ], [ 2.6, - 0.05 ], [ 2.0, - 0.24 ], [ 1.0, - 0.34 ], [ 0, - 0.38 ], [ - 3.15, - 0.38 ] ],
		chine: [ [ 3.2, 0.3 ], [ 2.5, 0.6 ], [ 1.5, 0.78 ], [ - 3.15, 0.84 ] ],
		chineY: [ [ 3.2, 0.72 ], [ 2.6, 0.3 ], [ 2.0, 0.04 ], [ 1.0, - 0.08 ], [ 0, - 0.11 ], [ - 3.15, - 0.13 ] ],
		sheer: [ [ 3.2, 1.04 ], [ 2.6, 0.97 ], [ 2.0, 0.91 ], [ 1.0, 0.85 ], [ 0, 0.81 ], [ - 3.15, 0.79 ] ],
		convex: 0.02, camber: 0.05,
		wells: [ { f0: 1.35, f1: - 2.92, floor: 0.12, gunwale: 0.12 } ],
		bottomMat: 'gelcoat', topsideMat: 'paint', sheerBand: 0.14, sheerMat: 'gelcoat', deckMat: 'gelcoat', floorMat: 'deckGrey', innerMat: 'gelcoat', bootMat: 'paint2',
	},
	build: buildSpeedboat,
} );

function buildSpeedboat( P ) {
	const k = new Kit(), glass = new Kit(), fk = new Kit(), fg = new Kit();
	const H = P.hull;
	buildHull( k, glass, H, false );
	buildHull( fk, fg, H, true );
	const sheer = pchip( H.sheer ), width = pchip( H.width );
	// swim platform and transom details
	const add = ( fn ) => { const n = k.parts.length; fn(); for ( let i = n; i < k.parts.length; i ++ ) fk.parts.push( k.parts[ i ] ); };
	add( () => {
		k.box( 2.1, 0.06, 0.45, MAT.teak, { p: [ 0, 0.14, 3.15 + 0.22 ] }, 0.02 );
		k.box( 2.3, 0.05, 0.05, MAT.chrome, { p: [ 0, 0.1, 3.15 + 0.44 ] }, 0.02 );
		// windscreen frame (the glass itself goes to the glass kit)
		for ( const s of [ - 1, 1 ] ) k.rod( [ s * 1.0, 0.86, - 1.28 ], [ s * 0.9, 1.3, - 1.05 ], 0.015, MAT.chrome, 8 );
		k.tube( [ [ - 0.9, 1.3, - 1.05 ], [ - 0.5, 1.33, - 1.18 ], [ 0, 1.34, - 1.22 ], [ 0.5, 1.33, - 1.18 ], [ 0.9, 1.3, - 1.05 ] ], 0.014, MAT.chrome, 16, 6 );
		// rub rail along the sheer
		const pts = ( side ) => { const o = []; for ( let f = 3.1; f >= - 3.15; f -= 0.25 ) o.push( [ side * ( width( f ) + 0.012 ), sheer( f ) - 0.02, - f ] ); return o; };
		for ( const s of [ - 1, 1 ] ) k.tube( pts( s ), 0.022, MAT.trim, 40, 5 );
		// bow rails
		for ( const s of [ - 1, 1 ] ) {
			const r = []; for ( let f = 3.0; f >= 1.4; f -= 0.3 ) r.push( [ s * ( width( f ) - 0.06 ), sheer( f ) + 0.28, - f ] );
			k.tube( r, 0.014, MAT.chrome, 16, 6 );
			for ( let f = 2.9; f >= 1.4; f -= 0.5 ) k.rod( [ s * ( width( f ) - 0.06 ), sheer( f ), - f ], [ s * ( width( f ) - 0.06 ), sheer( f ) + 0.28, - f ], 0.012, MAT.chrome, 6 );
		}
		// nav lights: red to port (left), green to starboard (right), a white all-round light on a pole aft
		k.box( 0.06, 0.04, 0.1, MAT.navRed, { p: [ - 0.28, sheer( 2.8 ) + 0.05, - 2.8 ] }, 0.01 );
		k.box( 0.06, 0.04, 0.1, MAT.navGreen, { p: [ 0.28, sheer( 2.8 ) + 0.05, - 2.8 ] }, 0.01 );
		k.rod( [ 0.95, 0.8, 2.9 ], [ 0.95, 1.8, 2.9 ], 0.012, MAT.chrome, 6 );
		k.sphere( 0.04, MAT.navWhite, { p: [ 0.95, 1.82, 2.9 ] } );
		// name on the topsides
		for ( const s of [ - 1, 1 ] ) {
			const f = 1.6, y = 0.55;
			const x = s * ( width( f ) + 0.004 );
			const w = 1.0, h = 0.2;
			const z0 = - f - w / 2 * s, z1 = - f + w / 2 * s;
			k.quad( [ x, y - h / 2, s > 0 ? z1 : z0 ], [ x, y - h / 2, s > 0 ? z0 : z1 ], [ x, y + h / 2, s > 0 ? z0 : z1 ], [ x, y + h / 2, s > 0 ? z1 : z0 ], mat( 'white', { uv: ATLAS.boatname, r: 0.3 } ) );
		}
	} );
	// windscreen glass
	glass.grid( ( u, v ) => {
		const a = ( u * 2 - 1 );
		const x = a * lerp( 0.98, 0.9, v ), y = lerp( 0.88, 1.3, v );
		const z = - ( lerp( 1.32, 1.1, v ) - 0.16 * a * a * lerp( 1, 0.8, v ) );
		return [ x, y, z ];
	}, 12, 3, MAT.glassDark );
	// helm and passenger consoles, seats, the rear bench
	k.with( 'near', () => {
		for ( const s of [ - 1, 1 ] ) {
			k.box( 0.72, 0.78, 0.55, MAT.gelcoat, { p: [ s * 0.55, 0.5, - 0.95 ] }, 0.08 );
			k.box( 0.7, 0.05, 0.42, mat( 'dash', {} ), { p: [ s * 0.55, 0.9, - 0.92 ], r: [ 0.5, 0, 0 ] }, 0.02 );
		}
		k.quad( [ 0.75, 0.86, - 0.76 ], [ 0.35, 0.86, - 0.76 ], [ 0.35, 0.95, - 0.9 ], [ 0.75, 0.95, - 0.9 ], mat( 'gauge', { uv: ATLAS.gauges } ) );
		// throttle lever
		k.box( 0.08, 0.1, 0.12, MAT.darksteel, { p: [ 0.9, 0.95, - 0.72 ] }, 0.02 );
		k.rod( [ 0.9, 0.98, - 0.72 ], [ 0.9, 1.12, - 0.66 ], 0.01, MAT.chrome, 6 );
		const sm = mat( 'seat', { c: 0xece8de, r: 0.55 } );
		seat( k, 0.55, 0.62, - 0.05, sm, 0.55, { noHead: true } );
		seat( k, - 0.55, 0.62, - 0.05, sm, 0.55, { noHead: true } );
		k.box( 2.05, 0.3, 0.55, sm, { p: [ 0, 0.3, 2.62 ] }, 0.08 );
		k.box( 2.05, 0.45, 0.14, sm, { p: [ 0, 0.62, 2.88 ] }, 0.06 );
		// engine box under the bench, cleats
		for ( const s of [ - 1, 1 ] ) k.box( 0.16, 0.03, 0.05, MAT.chrome, { p: [ s * 1.02, 0.83, 2.9 ] }, 0.012 );
	} );
	const steering = steeringKit( 0.17, 'car' ).build();
	P.steer = { x: 0.55, y: 1.02, f: 0.72, tilt: 0.55, r: 0.17 };
	const parts = [
		{ name: 'motor', geo: outboard( 250 ), pos: [ 0, 0.78, 3.2 ] },
		{ name: 'prop', geo: propeller( 0.19 ), pos: [ 0, - 1.1, 0.46 ], parent: 'motor' },
	];
	for ( const p of glass.parts ) fg.parts.push( p );
	return result( P, k, glass, fk, { steering, parts, meta: { prop: [ 0, - 0.32, 3.66 ], spray: [ 2.2, - 0.05 ] } }, fg );
}

// ---- fishing boat (small sampan-style workboat with a wheelhouse) ---------------------------------------------------------

CRAFT.fishing_boat = () => ( {
	kind: 'boat', L: 9.0, W: 3.0, H: 4.2,
	hull: {
		bow: 4.5, transom: - 4.4,
		width: [ [ 4.5, 0.02 ], [ 4.2, 0.55 ], [ 3.5, 1.1 ], [ 2.5, 1.42 ], [ 1.0, 1.5 ], [ - 2.5, 1.48 ], [ - 4.4, 1.3 ] ],
		keel: [ [ 4.5, 1.35 ], [ 4.2, 0.4 ], [ 3.6, - 0.3 ], [ 2.6, - 0.6 ], [ 0, - 0.7 ], [ - 3.5, - 0.68 ], [ - 4.4, - 0.42 ] ],
		chine: [ [ 4.5, 0.4 ], [ 3.5, 0.62 ], [ 0, 0.7 ], [ - 4.4, 0.72 ] ],
		chineY: [ [ 4.5, 1.2 ], [ 3.5, 0.1 ], [ 2.0, - 0.22 ], [ 0, - 0.3 ], [ - 4.4, - 0.08 ] ],
		sheer: [ [ 4.5, 1.9 ], [ 3.5, 1.58 ], [ 2.0, 1.38 ], [ 0, 1.28 ], [ - 2.5, 1.22 ], [ - 4.4, 1.24 ] ],
		convex: 0.14, camber: 0.08,
		wells: [ { f0: 2.95, f1: - 4.25, floor: 0.42, gunwale: 0.1 } ],
		bottomMat: 'antifoul', topsideMat: 'paint', sheerBand: 0.22, sheerMat: 'paint2', deckMat: 'gelcoat', floorMat: 'teak', innerMat: 'gelcoat', gunwaleMat: 'teak', bootMat: 'white',
	},
	build: buildFishingBoat,
} );

function buildFishingBoat( P ) {
	const k = new Kit(), glass = new Kit(), fk = new Kit(), fg = new Kit();
	const H = P.hull;
	buildHull( k, glass, H, false );
	buildHull( fk, fg, H, true );
	const sheer = pchip( H.sheer ), width = pchip( H.width );
	const add = ( fn ) => { const n = k.parts.length; fn(); for ( let i = n; i < k.parts.length; i ++ ) fk.parts.push( k.parts[ i ] ); };
	const wf0 = 2.55, wf1 = 0.55, ww = 1.05, fy = 0.42, ry = 2.55;
	add( () => {
		// wheelhouse walls (below the windows), corner posts, roof with an overhang
		const wall = MAT.gelcoat;
		k.box( ww * 2, 0.62, 0.06, wall, { p: [ 0, fy + 0.31, - wf0 ] }, 0.01 );
		for ( const s of [ - 1, 1 ] ) k.box( 0.06, 0.62, wf0 - wf1, wall, { p: [ s * ww, fy + 0.31, - ( wf0 + wf1 ) / 2 ] }, 0.01 );
		for ( const s of [ - 1, 1 ] ) k.box( 0.5, ry - fy, 0.06, wall, { p: [ s * ( ww - 0.25 ), ( fy + ry ) / 2, - wf1 ] }, 0.01 );
		k.box( ww * 2 - 1.0, 0.3, 0.06, wall, { p: [ 0, ry - 0.15, - wf1 ] }, 0.01 );
		for ( const x of [ - ww, ww ] ) for ( const f of [ wf0, wf1 ] ) k.box( 0.08, ry - fy, 0.08, wall, { p: [ x, ( fy + ry ) / 2, - f ] }, 0.01 );
		for ( const x of [ - ww / 3, ww / 3 ] ) k.box( 0.05, ry - fy - 0.62, 0.05, wall, { p: [ x, fy + 0.62 + ( ry - fy - 0.62 ) / 2, - wf0 ] } );
		k.box( 0.05, ry - fy - 0.62, 0.05, wall, { p: [ ww, fy + 0.62 + ( ry - fy - 0.62 ) / 2, - ( wf0 + wf1 ) / 2 ] } );
		k.box( 0.05, ry - fy - 0.62, 0.05, wall, { p: [ - ww, fy + 0.62 + ( ry - fy - 0.62 ) / 2, - ( wf0 + wf1 ) / 2 ] } );
		k.box( ww * 2 + 0.3, 0.08, wf0 - wf1 + 0.5, MAT.paint2, { p: [ 0, ry + 0.04, - ( wf0 + wf1 ) / 2 + 0.15 ] }, 0.03 );
		// mast, radar dome, lights, outrigger poles
		k.rod( [ 0, ry, - 1.2 ], [ 0, ry + 1.5, - 1.2 ], 0.04, MAT.alu, 8 );
		k.cyl( 0.28, 0.3, 0.2, MAT.white, { p: [ 0, ry + 0.18, - 1.9 ] }, 16 );
		k.sphere( 0.05, MAT.navWhite, { p: [ 0, ry + 1.55, - 1.2 ] } );
		k.box( 0.06, 0.05, 0.12, MAT.navRed, { p: [ - ww - 0.08, ry - 0.2, - wf0 + 0.2 ] }, 0.01 );
		k.box( 0.06, 0.05, 0.12, MAT.navGreen, { p: [ ww + 0.08, ry - 0.2, - wf0 + 0.2 ] }, 0.01 );
		for ( const s of [ - 1, 1 ] ) k.rod( [ s * 0.9, ry, - 1.0 ], [ s * 3.4, ry + 3.2, 0.2 ], 0.035, MAT.alu, 8, 0.02 );
		// life ring, fish hold hatch, coolers, rope
		k.torus( 0.28, 0.06, mat( 'white', { c: 0xe8541c } ), { p: [ 0, fy + 1.1, - wf1 + 0.06 ], r: [ 0, 0, 0 ] }, 8, 18 );
		k.box( 1.2, 0.12, 1.0, MAT.teak, { p: [ 0, fy + 0.06, 1.8 ] }, 0.02 );
		k.box( 0.8, 0.5, 0.5, mat( 'white', { c: 0x2a70c8 } ), { p: [ - 0.8, fy + 0.25, 3.3 ] }, 0.05 );
		k.box( 0.8, 0.5, 0.5, MAT.white, { p: [ 0.8, fy + 0.25, 3.0 ] }, 0.05 );
		k.torus( 0.22, 0.04, mat( 'canvas', { c: 0xc8b890 } ), { p: [ 0.9, fy + 0.04, 2.1 ], r: [ Math.PI / 2, 0, 0 ] }, 6, 16 );
		// rod holders along the stern gunwale
		for ( const x of [ - 1.0, - 0.4, 0.4, 1.0 ] ) k.rod( [ x, sheer( - 4.2 ), 4.2 ], [ x, sheer( - 4.2 ) + 0.28, 4.3 ], 0.02, MAT.chrome, 6 );
		// name on the bow
		for ( const s of [ - 1, 1 ] ) {
			const f = 3.3, y = 1.2, x = s * ( width( f ) + 0.02 );
			const w = 1.2, h = 0.24;
			const za = - f - w / 2, zb = - f + w / 2;
			k.quad( [ x, y - h / 2, s > 0 ? zb : za ], [ x, y - h / 2, s > 0 ? za : zb ], [ x, y + h / 2, s > 0 ? za : zb ], [ x, y + h / 2, s > 0 ? zb : za ], mat( 'white', { uv: ATLAS.boatname, r: 0.3 } ) );
		}
		// rudder stock
		k.box( 0.05, 0.4, 0.05, MAT.darksteel, { p: [ 0, - 0.3, 4.05 ] } );
	} );
	// wheelhouse windows (front three panes, two per side)
	const winY0 = fy + 0.64, winY1 = ry - 0.32;
	for ( let i = 0; i < 3; i ++ ) {
		const x0 = - ww + i * ( 2 * ww / 3 ) + 0.04, x1 = x0 + 2 * ww / 3 - 0.08;
		glass.quad( [ x1, winY0, - wf0 ], [ x0, winY0, - wf0 ], [ x0, winY1, - wf0 - 0.05 ], [ x1, winY1, - wf0 - 0.05 ], MAT.glassDark );
	}
	for ( const s of [ - 1, 1 ] ) for ( const [ a, b ] of [ [ wf0 - 0.06, ( wf0 + wf1 ) / 2 + 0.04 ], [ ( wf0 + wf1 ) / 2 - 0.04, wf1 + 0.06 ] ] ) {
		glass.quad( [ s * ww, winY0, - ( s > 0 ? b : a ) ], [ s * ww, winY0, - ( s > 0 ? a : b ) ], [ s * ww, winY1, - ( s > 0 ? a : b ) ], [ s * ww, winY1, - ( s > 0 ? b : a ) ], MAT.glassDark );
	}
	// inside: console, helm seat
	k.with( 'near', () => {
		k.box( 1.6, 0.5, 0.45, MAT.teak, { p: [ 0, fy + 0.7, - ( wf0 - 0.3 ) ] }, 0.03 );
		k.box( 1.2, 0.03, 0.3, mat( 'white', { uv: ATLAS.panel } ), { p: [ 0.1, fy + 0.96, - ( wf0 - 0.36 ) ], r: [ 0.5, 0, 0 ] } );
		seat( k, 0.45, fy + 0.62, wf0 - 1.3, mat( 'seat', { c: 0x2a3a4a } ), 0.5 );
		k.box( 0.6, 0.6, 0.6, MAT.teak, { p: [ - 0.5, fy + 0.3, - ( wf0 - 1.4 ) ] }, 0.03 );
	} );
	const steering = steeringKit( 0.26, 'wood' ).build();
	P.steer = { x: 0.45, y: fy + 1.08, f: wf0 - 0.62, tilt: 0.35, r: 0.26 };
	const parts = [
		{ name: 'prop', geo: propeller( 0.32, 4, mat( 'steel', { c: 0xb08a4a, r: 0.35 } ) ), pos: [ 0, - 0.5, 3.85 ] },
		{ name: 'rudder', geo: ( () => { const r = new Kit(); r.box( 0.05, 0.6, 0.5, MAT.darksteel, { p: [ 0, 0, 0.25 ] }, 0.01 ); return r.build(); } )(), pos: [ 0, - 0.45, 4.05 ] },
	];
	for ( const p of glass.parts ) fg.parts.push( p );
	return result( P, k, glass, fk, { steering, parts, meta: { prop: [ 0, - 0.5, 3.85 ], spray: [ 3.3, 0.1 ] } }, fg );
}

// ---- personal watercraft --------------------------------------------------------------------------------------------------

CRAFT.jetski = () => ( {
	kind: 'boat', L: 3.3, W: 1.2, H: 1.2,
	hull: {
		bow: 1.65, transom: - 1.65,
		width: [ [ 1.65, 0.02 ], [ 1.45, 0.3 ], [ 1.0, 0.54 ], [ 0.2, 0.6 ], [ - 1.4, 0.58 ], [ - 1.65, 0.52 ] ],
		keel: [ [ 1.65, 0.5 ], [ 1.3, 0.05 ], [ 0.8, - 0.17 ], [ 0, - 0.21 ], [ - 1.65, - 0.2 ] ],
		chine: [ [ 1.65, 0.4 ], [ 1.0, 0.72 ], [ - 1.65, 0.78 ] ],
		chineY: [ [ 1.65, 0.45 ], [ 1.0, 0.0 ], [ 0, - 0.05 ], [ - 1.65, - 0.06 ] ],
		sheer: [ [ 1.65, 0.6 ], [ 1.2, 0.58 ], [ 0.5, 0.5 ], [ 0, 0.44 ], [ - 1.65, 0.44 ] ],
		convex: 0.02, camber: 0.06,
		bottomMat: 'gelcoat', topsideMat: 'gelcoat', deckMat: 'paint',
	},
	build: buildJetski,
} );

function buildJetski( P ) {
	const k = new Kit(), glass = new Kit(), fk = new Kit(), fg = new Kit();
	const H = P.hull;
	buildHull( k, glass, H, false );
	buildHull( fk, fg, H, true );
	const add = ( fn ) => { const n = k.parts.length; fn(); for ( let i = n; i < k.parts.length; i ++ ) fk.parts.push( k.parts[ i ] ); };
	const vinyl = mat( 'seat', { c: 0x1b1c1e, r: 0.55 } );
	add( () => {
		// the hood over the bow, the steering pod and the seat with its rear grab handle
		const bins = new Bins();
		const hoodRings = [];
		for ( let i = 0; i <= 12; i ++ ) {
			const f = lerp( 1.55, 0.25, i / 12 );
			const t = i / 12;
			const w = 0.46 * Math.sin( Math.min( 1, t * 1.6 + 0.1 ) * Math.PI / 2 ) * ( 1 - t * 0.2 );
			const h = 0.3 * Math.sin( Math.min( 1, t * 1.3 + 0.15 ) * Math.PI / 2 );
			hoodRings.push( { f, pts: superRing( Math.max( 0.02, w ), Math.max( 0.02, h ), 0.5, 2.4, 20 ) } );
		}
		loftRings( bins, bins, hoodRings, () => MAT.paint2 );
		bins.emit( k, 0.7 );
		k.box( 0.5, 0.2, 0.55, MAT.paint2, { p: [ 0, 0.72, - 0.2 ] }, 0.08 );
		k.box( 0.44, 0.18, 1.2, vinyl, { p: [ 0, 0.62, 0.72 ] }, 0.09 );
		k.box( 0.4, 0.1, 1.05, vinyl, { p: [ 0, 0.74, 0.7 ] }, 0.05 );
		// footwells
		for ( const s of [ - 1, 1 ] ) k.box( 0.18, 0.04, 1.3, mat( 'trim', { uv: ATLAS.tread } ), { p: [ s * 0.38, 0.44, 0.55 ] }, 0.01 );
		k.box( 0.3, 0.05, 0.08, MAT.trim, { p: [ 0, 0.7, 1.4 ] }, 0.02 );
		// jet nozzle at the stern
		k.cyl( 0.09, 0.1, 0.25, MAT.darksteel, { p: [ 0, - 0.05, 1.7 ], r: [ Math.PI / 2, 0, 0 ] }, 12 );
		// stripes
		for ( const s of [ - 1, 1 ] ) k.box( 0.01, 0.06, 1.8, MAT.paint, { p: [ s * 0.585, 0.32, 0.1 ] } );
	} );
	// handlebars on a column (the steering part)
	const bars = new Kit();
	bars.rod( [ 0, - 0.2, 0 ], [ 0, 0.02, 0 ], 0.03, MAT.darksteel, 8 );
	bars.rod( [ - 0.34, 0.04, 0.04 ], [ 0.34, 0.04, 0.04 ], 0.014, MAT.chrome, 8 );
	for ( const s of [ - 1, 1 ] ) bars.cyl( 0.02, 0.02, 0.12, MAT.rubber, { p: [ s * 0.3, 0.04, 0.04 ], r: [ 0, 0, Math.PI / 2 ] }, 8 );
	bars.box( 0.16, 0.06, 0.08, MAT.trim, { p: [ 0, 0.06, 0 ] }, 0.02 );
	P.steer = { x: 0, y: 0.92, f: 0.12, tilt: - 0.45, r: 0.3, axis: 'y' };
	return result( P, k, glass, fk, { steering: bars.build(), parts: [], meta: { prop: [ 0, - 0.1, 1.6 ], spray: [ 1.1, 0.0 ] } }, fg );
}

// ---- tour helicopter (AS350 class) ------------------------------------------------------------------------------------

CRAFT.helicopter = () => ( {
	kind: 'heli', L: 10.9, W: 2.2, H: 3.3, glassTint: 0.08,
	pod: [
		[ 2.575, 0.03, 0.03, 1.09, 2 ], [ 2.54, 0.17, 0.2, 1.1, 2 ], [ 2.5, 0.27, 0.32, 1.11, 2.1 ], [ 2.45, 0.36, 0.44, 1.12, 2.2 ], [ 2.2, 0.62, 0.7, 1.26, 2.3 ], [ 1.8, 0.8, 0.85, 1.36, 2.4 ], [ 1.2, 0.88, 0.94, 1.41, 2.5 ],
		[ 0.0, 0.9, 0.97, 1.43, 2.6 ], [ - 0.9, 0.88, 0.95, 1.44, 2.6 ], [ - 1.35, 0.72, 0.78, 1.55, 2.4 ], [ - 1.85, 0.42, 0.45, 1.78, 2.2 ],
		[ - 2.35, 0.28, 0.3, 1.88, 2 ], [ - 6.6, 0.16, 0.17, 1.96, 2 ], [ - 6.95, 0.1, 0.12, 2.0, 2 ], [ - 7.05, 0.02, 0.02, 2.0, 2 ],
	],
	build: buildHeli,
} );

function buildHeli( P ) {
	const k = new Kit(), glass = new Kit(), fk = new Kit(), fg = new Kit();
	for ( const [ kit, gk, far ] of [ [ k, glass, false ], [ fk, fg, true ] ] ) {
		const rings = podRings( P.pod, far );
		const bins = new Bins(), gb = new Bins();
		loftRings( bins, gb, rings, ( i, seg, c ) => {
			const f = - c[ 2 ], x = c[ 0 ], y = c[ 1 ];
			const R = rings[ i ];
			const rel = ( y - R.cy ) / Math.max( 0.05, R.h ); // -1 bottom .. 1 top
			// the bubble: the front of the cabin above the floor line, a centre frame down the middle
			if ( f > 1.02 && f < 2.56 && rel > - 0.85 ) {
				if ( Math.abs( x ) < 0.035 && rel > 0.2 && f < 2.3 ) return MAT.gloss;
				// frames: the rim, and the floor line between the bubble and the chin windows (the bubble runs out to a
				// small cap on the nose)
				if ( f < 1.07 || rel < - 0.8 || Math.abs( rel + 0.42 ) < 0.04 ) return MAT.gloss;
				return 'GLASS';
			}
			// side windows (front doors and rear doors) and roof windows over the front seats
			if ( f < 0.95 && f > - 0.92 && rel > 0.02 && rel < 0.72 && Math.abs( x ) > 0.45 ) {
				if ( Math.abs( f ) < 0.05 || f > 0.9 || f < - 0.87 || rel < 0.07 || rel > 0.67 ) return MAT.gloss;
				return 'GLASS';
			}
			if ( f < 1.05 && f > 0.35 && rel > 0.82 && Math.abs( x ) < 0.4 ) return Math.abs( x ) < 0.04 || f < 0.4 || f > 1.0 ? MAT.gloss : 'GLASS';
			if ( rel < - 0.45 && f > - 1.4 ) return MAT.paint2; // two-tone belly
			if ( f < - 2.3 && Math.abs( rel ) < 0.2 ) return MAT.paint2; // boom stripe
			return MAT.paint;
		}, { capRear: MAT.paint } );
		bins.emit( kit, 0.6 );
		gb.emit( gk, 0.8 );
	}
	const add = ( fn ) => { const n = k.parts.length; fn(); for ( let i = n; i < k.parts.length; i ++ ) fk.parts.push( k.parts[ i ] ); };
	add( () => {
		// engine / transmission fairing and the mast
		k.box( 1.08, 0.5, 2.1, MAT.paint, { p: [ 0, 2.42, 0.75 ] }, 0.22 );
		k.box( 0.9, 0.36, 1.2, MAT.paint, { p: [ 0, 2.3, - 0.45 ] }, 0.2 );
		for ( const s of [ - 1, 1 ] ) k.box( 0.02, 0.18, 0.5, mat( 'trim', { uv: ATLAS.vents } ), { p: [ s * 0.545, 2.45, 0.4 ] } );
		k.cyl( 0.12, 0.14, 0.35, MAT.darksteel, { p: [ 0, 1.95, 1.95 ], r: [ 1.3, 0, 0 ] }, 12, true );
		k.cyl( 0.09, 0.12, 0.42, MAT.darksteel, { p: [ 0, 2.82, 0.15 ] }, 12 );
		// horizontal stabiliser with end plates, vertical fin
		airfoil( k, { p: [ - 1.25, 1.96, 5.7 ], chord: 0.45, thick: 0.05 }, { p: [ 1.25, 1.96, 5.78 ], chord: 0.38, thick: 0.04 }, MAT.paint, [ 0, 1, 0 ], 8 );
		for ( const s of [ - 1, 1 ] ) k.box( 0.03, 0.4, 0.4, MAT.paint, { p: [ s * 1.26, 1.96, 5.95 ] }, 0.01 );
		const fin = ( y0, y1, z0, z1, ch0, ch1 ) => airfoil( k, { p: [ 0, y0, z0 ], chord: ch0, thick: 0.08 }, { p: [ 0, y1, z1 ], chord: ch1, thick: 0.05 }, MAT.paint, [ 1, 0, 0 ], 8 );
		fin( 1.95, 3.05, 6.55, 7.1, 0.7, 0.42 );
		fin( 1.95, 1.45, 6.6, 6.85, 0.55, 0.35 );
		// skids: long tubes with upturned toes, cross tubes to the belly
		for ( const s of [ - 1, 1 ] ) {
			const x = s * 1.08;
			k.tube( [ [ x, 0.35, - 1.85 ], [ x, 0.12, - 1.62 ], [ x, 0.05, - 1.3 ], [ x, 0.05, 0.0 ], [ x, 0.05, 1.5 ], [ x, 0.07, 2.2 ] ], 0.04, MAT.alu, 24, 8 );
			for ( const z of [ - 0.9, 1.0 ] ) k.tube( [ [ x, 0.06, z ], [ x * 0.92, 0.35, z ], [ x * 0.65, 0.5, z ], [ x * 0.3, 0.5, z ] ], 0.035, MAT.alu, 10, 6 );
			k.box( 0.3, 0.03, 0.18, MAT.alu, { p: [ x * 0.86, 0.33, - 0.5 ] }, 0.01 );
		}
		// lights: nav on the stabiliser tips, beacon on the fairing, landing light under the nose
		k.box( 0.04, 0.05, 0.08, MAT.navRed, { p: [ - 1.28, 1.99, 5.8 ] }, 0.01 );
		k.box( 0.04, 0.05, 0.08, MAT.navGreen, { p: [ 1.28, 1.99, 5.8 ] }, 0.01 );
		k.sphere( 0.06, MAT.strobe, { p: [ 0, 2.7, 1.5 ] } );
		k.sphere( 0.06, MAT.navWhite, { p: [ 0, 3.05, 7.12 ] } );
		k.cyl( 0.08, 0.08, 0.04, MAT.head, { p: [ 0, 0.5, - 1.5 ], r: [ 0.3, 0, 0 ] }, 14 );
		// livery: operator name under the rear windows, tail number on the boom
		for ( const s of [ - 1, 1 ] ) {
			const x = s * 0.9, y = 1.12, w = 1.5, h = 0.25, f = - 0.2;
			const za = - f - w / 2, zb = - f + w / 2;
			k.quad( [ x, y - h / 2, s > 0 ? zb : za ], [ x, y - h / 2, s > 0 ? za : zb ], [ x, y + h / 2, s > 0 ? za : zb ], [ x, y + h / 2, s > 0 ? zb : za ], mat( 'white', { uv: ATLAS.tours, r: 0.35 } ) );
			const xb = s * 0.235, yb = 1.93, wb = 0.9, hb = 0.16, fb = - 3.6;
			const zc = - fb - wb / 2, zd = - fb + wb / 2;
			k.quad( [ xb, yb - hb / 2, s > 0 ? zd : zc ], [ xb, yb - hb / 2, s > 0 ? zc : zd ], [ xb, yb + hb / 2, s > 0 ? zc : zd ], [ xb, yb + hb / 2, s > 0 ? zd : zc ], mat( 'white', { uv: ATLAS.numbers, r: 0.35 } ) );
		}
	} );
	// the cabin: panel, seats (the pilot sits on the right), cyclic and collective
	k.with( 'near', () => {
		// the floor runs forward to the pedals over the chin windows
		k.box( 1.4, 0.05, 1.9, MAT.carpet, { p: [ 0, 0.55, - 0.2 ] } );
		k.box( 1.3, 0.05, 0.6, MAT.carpet, { p: [ 0, 0.56, - 1.43 ] } );
		// the instrument panel: a T across the cabin under a dark glare shield, on a pedestal between the seats
		const pm = MAT.dash;
		k.box( 1.2, 0.34, 0.1, pm, { p: [ 0, 1.2, - 1.55 ], r: [ - 0.28, 0, 0 ] }, 0.03 );
		k.quad( [ 0.56, 1.07, - 1.445 ], [ - 0.56, 1.07, - 1.445 ], [ - 0.56, 1.35, - 1.525 ], [ 0.56, 1.35, - 1.525 ], mat( 'gauge', { uv: ATLAS.panel } ) );
		k.box( 1.26, 0.035, 0.26, mat( 'trim', { c: 0x0c0c0d, r: 0.85 } ), { p: [ 0, 1.39, - 1.56 ], r: [ 0.06, 0, 0 ] }, 0.015 );
		k.box( 1.2, 0.08, 0.04, pm, { p: [ 0, 1.36, - 1.39 ] }, 0.02 );
		k.box( 0.3, 0.52, 0.34, pm, { p: [ 0, 0.83, - 1.38 ], r: [ - 0.12, 0, 0 ] }, 0.03 );
		k.quad( [ 0.12, 0.66, - 1.19 ], [ - 0.12, 0.66, - 1.19 ], [ - 0.12, 1.0, - 1.24 ], [ 0.12, 1.0, - 1.24 ], mat( 'gloss', { c: 0x0a0c10, e: 8, uv: ATLAS.gauges } ) );
		for ( let i = 0; i < 4; i ++ ) k.cyl( 0.012, 0.012, 0.02, MAT.alu, { p: [ ( i - 1.5 ) * 0.06, 0.62, - 1.2 ], r: [ Math.PI / 2 - 0.12, 0, 0 ] }, 8 );
		// anti-torque pedals for both seats
		for ( const sx of [ - 0.42, 0.42 ] ) for ( const d of [ - 0.1, 0.1 ] ) {
			k.rod( [ sx + d, 0.58, - 1.55 ], [ sx + d, 0.72, - 1.5 ], 0.012, MAT.darksteel, 6 );
			k.box( 0.08, 0.14, 0.03, MAT.rubber, { p: [ sx + d, 0.74, - 1.5 ], r: [ - 0.35, 0, 0 ] }, 0.01 );
		}
		const sm = mat( 'seat', { c: 0x3a3632 } );
		seat( k, 0.42, 0.98, 0.55, sm, 0.48 );
		seat( k, - 0.42, 0.98, 0.55, sm, 0.48 );
		bench( k, 1.5, 0.98, - 0.55, sm, 0, { heads: [ - 0.5, 0, 0.5 ] } );
		k.rod( [ 0.42, 0.6, - 0.95 ], [ 0.42, 1.1, - 0.85 ], 0.018, MAT.trim, 6 );
		k.sphere( 0.035, MAT.trim, { p: [ 0.42, 1.12, - 0.84 ] } );
		k.rod( [ 0.12, 0.62, - 0.4 ], [ 0.14, 0.82, - 0.9 ], 0.02, MAT.trim, 6 );
	} );
	// main rotor: hub + three blades, spun about y; tail rotor: two blades on the fin's left side, spun about x
	const rot = new Kit();
	rot.cyl( 0.16, 0.2, 0.22, MAT.darksteel, null, 14 );
	rot.cyl( 0.08, 0.08, 0.2, MAT.darksteel, { p: [ 0, 0.2, 0 ] }, 10 );
	for ( let i = 0; i < 3; i ++ ) {
		const a = i / 3 * Math.PI * 2;
		const c = Math.cos( a ), s = Math.sin( a );
		rot.box( 0.5, 0.06, 0.14, MAT.darksteel, { p: [ c * 0.35, 0, - s * 0.35 ], r: [ 0, a, 0 ] }, 0.02 );
		rot.box( 4.95, 0.035, 0.3, mat( 'gloss', { c: 0x2a2c30, r: 0.35 } ), { p: [ c * 2.95, 0.02, - s * 2.95 ], r: [ 0, a, 0.015 ] }, 0.015 );
		rot.box( 0.3, 0.036, 0.305, mat( 'white', { c: 0xf0c020 } ), { p: [ c * 5.3, 0.02, - s * 5.3 ], r: [ 0, a, 0.015 ] }, 0.015 );
	}
	const disc = new THREE.RingGeometry( 0.5, 5.4, 48, 1 ).rotateX( - Math.PI / 2 );
	const tr = new Kit();
	tr.cyl( 0.06, 0.06, 0.12, MAT.darksteel, { r: [ 0, 0, Math.PI / 2 ] }, 10 );
	for ( const s of [ - 1, 1 ] ) tr.box( 0.015, 0.85, 0.16, mat( 'white', { c: 0xe8e8e4 } ), { p: [ - 0.02, s * 0.46, 0 ], r: [ s * 0.1, 0, 0 ] }, 0.008 );
	const tdisc = new THREE.RingGeometry( 0.08, 0.93, 24, 1 ).rotateY( Math.PI / 2 );
	const parts = [
		{ name: 'rotor', geo: rot.build(), pos: [ 0, 3.1, 0.15 ], disc, noShadow: false },
		{ name: 'tailRotor', geo: tr.build(), pos: [ - 0.14, 2.55, 6.95 ], disc: tdisc },
	];
	// far model: blades at rest
	fk.addBuilt( parts[ 0 ].geo, { p: parts[ 0 ].pos } );
	fk.addBuilt( parts[ 1 ].geo, { p: parts[ 1 ].pos } );
	P.steer = null;
	return result( P, k, glass, fk, { parts, meta: { rotor: [ 0, 3.1, 0.15 ], rotorR: 5.35, skids: [ [ - 1.08, 0.02, - 1.5 ], [ 1.08, 0.02, - 1.5 ], [ - 1.08, 0.02, 1.6 ], [ 1.08, 0.02, 1.6 ] ] } }, fg );
}

// ---- light aircraft (Cessna 172 class) ----------------------------------------------------------------------------------

CRAFT.plane = () => ( {
	kind: 'plane', L: 8.28, W: 11.0, H: 2.72, glassTint: 0.1,
	pod: [
		[ 2.55, 0.38, 0.34, 1.28, 2.2 ], [ 2.1, 0.5, 0.47, 1.33, 2.4 ], [ 1.4, 0.55, 0.6, 1.44, 2.6 ], [ 0.8, 0.56, 0.69, 1.5, 2.8 ], [ - 0.4, 0.56, 0.69, 1.5, 2.8 ],
		[ - 1.0, 0.47, 0.6, 1.52, 2.6 ], [ - 2.0, 0.3, 0.44, 1.54, 2.4 ], [ - 3.6, 0.13, 0.28, 1.64, 2.2 ], [ - 4.35, 0.05, 0.18, 1.72, 2 ], [ - 4.5, 0.02, 0.04, 1.75, 2 ],
	],
	wheelR: 0.21, wheelW: 0.14,
	build: buildPlane,
} );

function buildPlane( P ) {
	const k = new Kit(), glass = new Kit(), fk = new Kit(), fg = new Kit();
	for ( const [ kit, gk, far ] of [ [ k, glass, false ], [ fk, fg, true ] ] ) {
		const rings = podRings( P.pod, far );
		const bins = new Bins(), gb = new Bins();
		loftRings( bins, gb, rings, ( i, seg, c ) => {
			const f = - c[ 2 ], x = c[ 0 ], y = c[ 1 ];
			const R = rings[ i ];
			const rel = ( y - R.cy ) / Math.max( 0.05, R.h );
			// windshield between the cowl and the wing, side windows, the rear window behind the wing
			if ( f < 1.35 && f > 0.72 && rel > 0.28 ) return Math.abs( x ) < 0.03 || f > 1.3 || f < 0.77 ? MAT.gloss : 'GLASS';
			if ( f < 0.68 && f > - 1.35 && rel > 0.02 && rel < 0.78 && Math.abs( x ) > 0.3 ) {
				if ( Math.abs( f + 0.45 ) < 0.04 || f > 0.63 || f < - 1.3 || rel < 0.07 || rel > 0.73 ) return MAT.gloss;
				return 'GLASS';
			}
			if ( f < - 1.2 && f > - 2.1 && rel > 0.55 ) return f > - 1.25 || f < - 2.05 ? MAT.gloss : 'GLASS';
			if ( Math.abs( rel + 0.05 ) < 0.09 && f < 0.7 ) return MAT.paint2; // cheat line
			if ( f > 1.45 ) return MAT.paint; // cowling
			return MAT.white;
		}, { capFront: MAT.darksteel, capRear: MAT.white } );
		bins.emit( kit, 0.6 );
		gb.emit( gk, 0.8 );
	}
	const add = ( fn ) => { const n = k.parts.length; fn(); for ( let i = n; i < k.parts.length; i ++ ) fk.parts.push( k.parts[ i ] ); };
	add( () => {
		// high wing with dihedral, struts
		const wy = 2.2, dih = 0.03;
		for ( const s of [ - 1, 1 ] ) {
			airfoil( k, { p: [ s * 0.3, wy, - 0.95 ], chord: 1.62, thick: 0.2, camber: 0.03 }, { p: [ s * 2.6, wy + dih * 2.3, - 0.95 ], chord: 1.62, thick: 0.19, camber: 0.03 }, MAT.white, [ 0, 1, 0 ], 12 );
			airfoil( k, { p: [ s * 2.6, wy + dih * 2.3, - 0.95 ], chord: 1.62, thick: 0.19, camber: 0.03 }, { p: [ s * 5.5, wy + dih * 5.2, - 0.8 ], chord: 1.15, thick: 0.13, camber: 0.02 }, MAT.white, [ 0, 1, 0 ], 12 );
			k.beam( [ s * 0.52, 1.02, - 0.35 ], [ s * 2.6, wy - 0.04, - 0.35 ], 0.05, 0.14, MAT.white, [ 0, 0, 1 ], 0.02 );
			// wingtip nav lights, landing light in the left leading edge
			k.box( 0.04, 0.05, 0.1, s < 0 ? MAT.navRed : MAT.navGreen, { p: [ s * 5.52, wy + dih * 5.2 + 0.04, - 0.8 ] }, 0.01 );
			// flap / aileron gaps
			k.box( 5.0, 0.004, 0.008, MAT.gap, { p: [ s * 3.0, wy + 0.1 + dih * 3, 0.36 ] } );
		}
		k.box( 0.12, 0.08, 0.06, MAT.head, { p: [ - 2.0, 2.2, 0.95 ] }, 0.02 );
		// tailplane and fin
		for ( const s of [ - 1, 1 ] ) airfoil( k, { p: [ s * 0.1, 1.72, 3.75 ], chord: 0.95, thick: 0.08 }, { p: [ s * 1.72, 1.74, 3.95 ], chord: 0.65, thick: 0.05 }, MAT.white, [ 0, 1, 0 ], 8 );
		airfoil( k, { p: [ 0, 1.72, 3.55 ], chord: 1.1, thick: 0.09 }, { p: [ 0, 2.72, 4.35 ], chord: 0.55, thick: 0.05 }, MAT.white, [ 1, 0, 0 ], 8 );
		k.sphere( 0.04, MAT.strobe, { p: [ 0, 2.74, 4.55 ] } );
		// tail number
		for ( const s of [ - 1, 1 ] ) {
			const x = s * 0.2, y = 1.62, w = 1.1, h = 0.2, f = - 2.7;
			const za = - f - w / 2, zb = - f + w / 2;
			k.quad( [ x, y - h / 2, s > 0 ? zb : za ], [ x, y - h / 2, s > 0 ? za : zb ], [ x, y + h / 2, s > 0 ? za : zb ], [ x, y + h / 2, s > 0 ? zb : za ], mat( 'white', { uv: ATLAS.numbers, r: 0.35 } ) );
		}
		// main gear legs and wheel fairings, nose strut
		for ( const s of [ - 1, 1 ] ) {
			k.beam( [ s * 0.3, 0.95, 0.35 ], [ s * 1.25, 0.24, 0.35 ], 0.06, 0.02, MAT.white, [ 0, 0, 1 ], 0.008 );
			k.sphere( 1, MAT.white, { p: [ s * 1.25, 0.25, 0.33 ], s: [ 0.1, 0.22, 0.45 ] } );
		}
		k.rod( [ 0, 0.95, - 2.0 ], [ 0, 0.2, - 2.08 ], 0.035, MAT.chrome, 8 );
		k.box( 0.06, 0.05, 0.25, MAT.darksteel, { p: [ 0, 0.36, - 2.08 ] }, 0.01 );
		// exhaust stub and air intakes
		k.cyl( 0.03, 0.03, 0.12, MAT.darksteel, { p: [ 0.2, 0.9, - 1.6 ], r: [ 0.5, 0, 0 ] }, 8, true );
		for ( const s of [ - 1, 1 ] ) k.box( 0.12, 0.08, 0.02, MAT.gloss, { p: [ s * 0.2, 1.1, - 2.56 ] }, 0.01 );
	} );
	k.with( 'near', () => {
		k.box( 1.0, 0.04, 2.2, MAT.carpet, { p: [ 0, 0.9, 0.2 ] } );
		// the firewall and the footwell close off the engine bay; the panel spans the cabin under a glare shield
		k.box( 1.12, 0.62, 0.05, MAT.dash, { p: [ 0, 1.2, - 1.36 ] } );
		k.box( 1.0, 0.04, 0.5, MAT.carpet, { p: [ 0, 0.92, - 1.1 ], r: [ 0.3, 0, 0 ] } );
		k.box( 1.12, 0.3, 0.14, MAT.dash, { p: [ 0, 1.6, - 1.26 ] }, 0.03 );
		k.quad( [ 0.5, 1.5, - 1.185 ], [ - 0.5, 1.5, - 1.185 ], [ - 0.5, 1.72, - 1.2 ], [ 0.5, 1.72, - 1.2 ], mat( 'gauge', { uv: ATLAS.panel } ) );
		k.box( 1.14, 0.03, 0.22, mat( 'trim', { c: 0x0c0c0d, r: 0.85 } ), { p: [ 0, 1.765, - 1.24 ], r: [ 0.08, 0, 0 ] }, 0.012 );
		// throttle and mixture knobs in the middle of the panel
		k.rod( [ 0, 1.55, - 1.19 ], [ 0, 1.55, - 1.1 ], 0.006, MAT.chrome, 6 );
		k.sphere( 0.018, MAT.gloss, { p: [ 0, 1.55, - 1.09 ] } );
		k.rod( [ 0.06, 1.55, - 1.19 ], [ 0.06, 1.55, - 1.12 ], 0.005, MAT.chrome, 6 );
		k.sphere( 0.016, mat( 'gloss', { c: 0xb01010 } ), { p: [ 0.06, 1.55, - 1.11 ] } );
		// rudder pedals
		for ( const sx of [ - 0.27, 0.27 ] ) for ( const d of [ - 0.08, 0.08 ] ) k.box( 0.07, 0.12, 0.03, MAT.rubber, { p: [ sx + d, 1.02, - 1.18 ], r: [ - 0.5, 0, 0 ] }, 0.01 );
		const sm = mat( 'seat', { c: 0x4a4038 } );
		seat( k, - 0.27, 1.2, 0.2, sm, 0.46 );
		seat( k, 0.27, 1.2, 0.2, sm, 0.46 );
		bench( k, 0.95, 1.18, - 0.72, sm, 0, { heads: [ - 0.25, 0.25 ] } );
		// the right-hand yoke (the left one is the steering part)
		k.rod( [ 0.27, 1.5, - 1.19 ], [ 0.27, 1.5, - 0.9 ], 0.015, MAT.trim, 6 );
		k.box( 0.28, 0.05, 0.04, MAT.trim, { p: [ 0.27, 1.5, - 0.88 ] }, 0.015 );
	} );
	// yoke (the steering part rolls with the ailerons)
	const yoke = new Kit();
	yoke.box( 0.3, 0.05, 0.04, MAT.trim, null, 0.015 );
	for ( const s of [ - 1, 1 ] ) yoke.box( 0.04, 0.12, 0.04, MAT.trim, { p: [ s * 0.14, 0.05, 0 ] }, 0.012 );
	yoke.rod( [ 0, 0, - 0.02 ], [ 0, 0, - 0.3 ], 0.015, MAT.trim, 6 );
	P.steer = { x: - 0.27, y: 1.5, f: 0.88, tilt: 0, r: 0.15 };
	// propeller with its spinner
	const pr = new Kit();
	pr.lathe( [ [ 0.001, - 0.28 ], [ 0.08, - 0.2 ], [ 0.13, - 0.08 ], [ 0.14, 0.02 ] ], MAT.white, { r: [ Math.PI / 2, 0, 0 ] }, 16 );
	for ( const s of [ - 1, 1 ] ) {
		pr.box( 0.11, 0.9, 0.025, mat( 'gloss', { c: 0x151515, r: 0.4 } ), { p: [ 0, s * 0.5, - 0.02 ], r: [ 0, s * 0.25, 0 ] }, 0.01 );
		pr.box( 0.11, 0.08, 0.026, mat( 'white', { c: 0xf0c020 } ), { p: [ 0, s * 0.92, - 0.02 ], r: [ 0, s * 0.25, 0 ] }, 0.01 );
	}
	const disc = new THREE.CircleGeometry( 0.96, 32 );
	const parts = [ { name: 'prop', geo: pr.build(), pos: [ 0, 1.3, - 2.62 ], disc } ];
	fk.addBuilt( parts[ 0 ].geo, { p: parts[ 0 ].pos } );
	// tricycle gear wheels (the nose wheel steers)
	const R = P.wheelR, W = P.wheelW;
	const wheelGeo = wheelKit( R, W, 'alloy', { spokes: 3, rimR: R * 0.55, brakes: false } ).build();
	const wheels = [
		{ x: - 1.25, y: R, z: 0.33, R, W, side: - 1, steer: 0, front: false },
		{ x: 1.25, y: R, z: 0.33, R, W, side: 1, steer: 0, front: false },
		{ x: 0, y: 0.19, z: - 2.08, R: 0.19, W: 0.12, side: 1, steer: 1, front: true },
	];
	const fw = farWheelKit( R, W ).build();
	for ( const w of wheels ) fk.addBuilt( fw, { p: [ w.x, w.y, w.z ], s: [ w.side, 1, 1 ] } );
	return result( P, k, glass, fk, { wheelGeo, wheels, steering: yoke.build(), parts, meta: { prop: [ 0, 1.3, - 2.62 ] } }, fg );
}
