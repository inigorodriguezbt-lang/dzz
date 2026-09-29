// Car body shells, built from a handful of key stations per vehicle:
//
//   lower body  cross-sections lofted along the length. Each section runs from the underbody centre out
//               over the rocker, up the side (tuck, shoulder, tumblehome) and over the top (hood / deck) to
//               the centre line; inside cabins and beds the "top" folds down into an inner wall and a floor,
//               so one closed loft gives the outer skin, the door cards and the floor. Wheel arches lift the
//               outer part of the section around each axle (a real wheel well, the underbody stays low);
//               the ends close with shallow domed caps.
//   greenhouse  one parametric sheet G( ring node, s ): s = 0 on the belt (the lower body's top edge), 1 at
//               the roof edge, 1..2 over the roof to its centre. Ring nodes run around the car (windshield,
//               A-pillar corners, the side with its posts, the rear corners, the rear window), so windows,
//               frit bands and pillars are exact grid regions: glass goes to its own kit (render layer 1),
//               everything else is paint / black trim, with a headliner layer inside.
//
// Vehicle frame: x right, y up (0 = ground at rest), z back; f = -z forward.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, smooth, lerp } from '../kit.js';

// monotone cubic (PCHIP) interpolation through [ [ x, y ], ... ] — no overshoot between the keys
export function pchip( keys ) {
	if ( typeof keys === 'number' ) return () => keys;
	const k = keys.slice().sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
	const n = k.length;
	if ( n === 1 ) return () => k[ 0 ][ 1 ];
	const xs = k.map( p => p[ 0 ] ), ys = k.map( p => p[ 1 ] );
	const h = [], d = [], m = new Array( n );
	for ( let i = 0; i < n - 1; i ++ ) { h[ i ] = xs[ i + 1 ] - xs[ i ]; d[ i ] = ( ys[ i + 1 ] - ys[ i ] ) / h[ i ]; }
	m[ 0 ] = d[ 0 ]; m[ n - 1 ] = d[ n - 2 ];
	for ( let i = 1; i < n - 1; i ++ ) {
		if ( d[ i - 1 ] * d[ i ] <= 0 ) m[ i ] = 0;
		else { const w1 = 2 * h[ i ] + h[ i - 1 ], w2 = h[ i ] + 2 * h[ i - 1 ]; m[ i ] = ( w1 + w2 ) / ( w1 / d[ i - 1 ] + w2 / d[ i ] ); }
	}
	return ( x ) => {
		if ( x <= xs[ 0 ] ) return ys[ 0 ];
		if ( x >= xs[ n - 1 ] ) return ys[ n - 1 ];
		let i = 0;
		while ( x > xs[ i + 1 ] ) i ++;
		const t = ( x - xs[ i ] ) / h[ i ], t2 = t * t, t3 = t2 * t;
		return ( 2 * t3 - 3 * t2 + 1 ) * ys[ i ] + ( t3 - 2 * t2 + t ) * h[ i ] * m[ i ] + ( - 2 * t3 + 3 * t2 ) * ys[ i + 1 ] + ( t3 - t2 ) * h[ i ] * m[ i + 1 ];
	};
}

const D2R = Math.PI / 180;
// section point indices kept for the far LOD (see Shell.section)
const FAR_IDX = [ 0, 1, 2, 3, 5, 6, 8, 10, 11, 13, 15, 16, 17, 18, 20, 21, 22, 23 ];
// what each segment of the right half section is (segment k runs from point k to k + 1)
const SEG = [ 'under', 'well', 'under', 'under', 'under', 'under', 'side', 'side', 'side', 'side', 'side', 'side', 'side', 'edge', 'edge', 'edge', 'top', 'top', 'top', 'top', 'top', 'top', 'top' ];

// append triangles (skipping slivers) to a flat position array
function tri( out, a, b, c ) {
	const ux = b[ 0 ] - a[ 0 ], uy = b[ 1 ] - a[ 1 ], uz = b[ 2 ] - a[ 2 ];
	const vx = c[ 0 ] - a[ 0 ], vy = c[ 1 ] - a[ 1 ], vz = c[ 2 ] - a[ 2 ];
	const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
	if ( nx * nx + ny * ny + nz * nz < 1e-12 ) return;
	out.push( a[ 0 ], a[ 1 ], a[ 2 ], b[ 0 ], b[ 1 ], b[ 2 ], c[ 0 ], c[ 1 ], c[ 2 ] );
}

// triangles grouped by material -> kit parts (normals creased per group so panels stay crisp at material edges)
export class Bins {
	constructor() { this.map = new Map(); }
	quad( m, a, b, c, d ) { const arr = this.get( m ); tri( arr, a, b, c ); tri( arr, a, c, d ); }
	tri( m, a, b, c ) { tri( this.get( m ), a, b, c ); }
	get( m ) { let a = this.map.get( m ); if ( ! a ) { a = []; this.map.set( m, a ); } return a; }
	// one geometry with creased normals, then split back into material groups
	emit( kit, crease = 0.55 ) {
		const all = [], ranges = [];
		for ( const [ m, a ] of this.map ) { ranges.push( [ m, all.length / 3, a.length / 3 ] ); for ( let i = 0; i < a.length; i ++ ) all.push( a[ i ] ); }
		if ( ! all.length ) return;
		let g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( all, 3 ) );
		g = toCreasedNormals( g, crease );
		const P = g.attributes.position.array, N = g.attributes.normal.array;
		for ( const [ m, start, count ] of ranges ) {
			const gg = new THREE.BufferGeometry();
			gg.setAttribute( 'position', new THREE.BufferAttribute( P.slice( start * 3, ( start + count ) * 3 ), 3 ) );
			gg.setAttribute( 'normal', new THREE.BufferAttribute( N.slice( start * 3, ( start + count ) * 3 ), 3 ) );
			kit.add( gg, m );
		}
	}
}

export class Shell {
	constructor( P ) {
		this.P = P;
		const B = P.body;
		this.B = B;
		this.fHW = pchip( B.width ); this.fYB = pchip( B.bottom ); this.fYE = pchip( B.edge ); this.fYT = pchip( B.top );
		this.fSh = pchip( B.shoulder ?? 0.14 );
		this.fTum = pchip( B.tumble ?? 0.05 );
		this.axles = P.axles || [ P.axleR, P.axleF ];
		this.archR = P.archR ?? P.wheelR + 0.05;
		this.cy = P.wheelR + ( P.archLift ?? 0.02 );
		this.xWell = P.track / 2 - P.wheelW / 2 - 0.035;
		this.front = P.front; this.rear = P.rear;
		this.wells = P.wells || [];
	}

	archY( f ) {
		let y = - Infinity;
		const R = this.archR;
		if ( this.P.noArches ) return y;
		for ( const a of this.axles ) { const d = f - a; if ( Math.abs( d ) < R ) y = Math.max( y, this.cy + Math.sqrt( R * R - d * d ) ); }
		return y;
	}

	// open (cabin / bed) factor at f and the well it belongs to
	openAt( f ) {
		let o = 0, well = null;
		for ( const w of this.wells ) {
			const r = w.ramp ?? 0.08;
			const t = smooth( w.f0, w.f0 - r, f ) * smooth( w.f1, w.f1 + r, f );
			if ( t > o ) { o = t; well = w; }
		}
		return { o, well };
	}

	// the station's numbers (used by the section and by the detail placement)
	frame( f ) {
		const B = this.B;
		const hw = this.fHW( f ), yb = this.fYB( f );
		let ye = this.fYE( f );
		const yt = this.fYT( f );
		const tum = this.fTum( f ), tuck = B.tuck ?? 0.04, rb = B.rb ?? 0.05, re = B.re ?? 0.035;
		const ya = Math.max( yb, this.archY( f ) );
		let sh = ye - this.fSh( f );
		if ( ya + rb + 0.03 > sh ) sh = ya + rb + 0.03;
		if ( sh + re + 0.02 > ye ) ye = sh + re + 0.02;
		const hwb = hw * ( 1 - tuck ), xE = hw - tum;
		return { f, hw, yb, ye, yt, tum, rb, re, ya, sh, hwb, xE, ...this.openAt( f ) };
	}

	// right half of the section at f: 24 points [ x, y ] from the underbody centre to the top centre
	section( f ) {
		const S = this.frame( f );
		const { hw, yb, ye, yt, rb, re, ya, sh, hwb, xE, o, well } = S;
		const xw = Math.min( this.xWell, hwb - rb - 0.01 );
		const pts = [ [ 0, yb ], [ xw, yb ], [ xw, ya ], [ hwb - rb, ya ] ];
		for ( const a of [ - 60, - 30, 0 ] ) pts.push( [ hwb - rb + Math.cos( a * D2R ) * rb, ya + rb + Math.sin( a * D2R ) * rb ] );
		// side: from the bottom corner out to the shoulder, bowed so the reflections flow
		for ( const t of [ 0.2, 0.4, 0.6, 0.8, 1 ] ) pts.push( [ hwb + ( hw - hwb ) * Math.sin( t * Math.PI / 2 ), lerp( ya + rb, sh, t ) ] );
		// tumblehome to the top edge
		for ( const t of [ 0.5, 1 ] ) pts.push( [ lerp( hw, xE, Math.pow( t, 1.4 ) ), lerp( sh, ye - re, t ) ] );
		for ( const a of [ 30, 60, 90 ] ) pts.push( [ xE - re + Math.cos( a * D2R ) * re, ye - re + Math.sin( a * D2R ) * re ] );
		// top: the hood / deck (closed) or the door card and floor (open), blended through the cowl and the seat backs
		const xt = xE - re, cp = this.B.crownPow ?? 1.8;
		const closed = [ 0.1, 0.25, 0.42, 0.6, 0.76, 0.9, 1 ].map( s => [ xt * ( 1 - s ), yt + ( ye - yt ) * Math.pow( 1 - s, cp ) ] );
		if ( o > 0 ) {
			const fl = well.floor, wallT = well.wall ?? 0.075;
			const xW = xt - wallT;
			const hump = xW > xw + 0.03 && ya > fl - 0.01;
			const flW = hump ? Math.max( fl, ya + 0.03 ) : fl;
			const xh = Math.max( 0.05, Math.min( xW - 0.01, xw - 0.03 ) );
			const open = [ [ xt - 0.012, ye - 0.004 ], [ xW, ye - 0.03 ], [ xW, lerp( ye, flW, 0.45 ) ], [ xW, flW ], [ xh, flW ], [ xh, fl ], [ 0, fl ] ];
			for ( let k = 0; k < 7; k ++ ) pts.push( [ lerp( closed[ k ][ 0 ], open[ k ][ 0 ], o ), lerp( closed[ k ][ 1 ], open[ k ][ 1 ], o ) ] );
		} else for ( const p of closed ) pts.push( p );
		return pts;
	}

	// height of the lower body's top surface at (x, f) (hood, deck, or the door tops in the cabin)
	topY( x, f ) {
		const S = this.frame( f );
		const xt = S.xE - S.re;
		const closed = S.yt + ( S.ye - S.yt ) * Math.pow( Math.min( 1, Math.abs( x ) / xt ), this.B.crownPow ?? 1.8 );
		return lerp( closed, S.ye, S.o );
	}

	// station list (front to rear): regular spacing, arches sampled by angle, the well ramps exactly
	stations( far ) {
		const step = far ? 0.16 : 0.045;
		const f0 = this.front - ( this.B.nose ?? 0.08 ), f1 = this.rear + ( this.B.tail ?? 0.08 );
		const list = [];
		const R = this.archR, yb = ( f ) => this.fYB( f );
		const spans = [];
		if ( ! this.P.noArches ) for ( const a of this.axles ) {
			const dy = this.cy - yb( a );
			if ( dy >= R ) continue;
			const phi0 = Math.asin( Math.max( - 1, - dy / R ) );
			const n = far ? 6 : 16;
			const arc = [];
			for ( let k = 0; k <= n; k ++ ) { const p = phi0 + ( Math.PI - 2 * phi0 ) * k / n; arc.push( a + R * Math.cos( p ) ); }
			spans.push( [ Math.min( ...arc ), Math.max( ...arc ) ] );
			list.push( ...arc );
		}
		for ( let f = f0; f > f1; f -= step ) if ( ! spans.some( s => f > s[ 0 ] - step * 0.4 && f < s[ 1 ] + step * 0.4 ) ) list.push( f );
		list.push( f0, f1 );
		for ( const w of this.wells ) {
			const r = w.ramp ?? 0.08;
			for ( const f of [ w.f0, w.f0 - r, w.f1, w.f1 + r ] ) if ( ! spans.some( s => f > s[ 0 ] && f < s[ 1 ] ) ) list.push( f );
			if ( ! far ) for ( const f of [ w.f0 - r * 0.5, w.f1 + r * 0.5 ] ) list.push( f );
		}
		for ( const f of this.P.extraStations || [] ) list.push( f );
		const out = list.filter( f => f <= f0 + 1e-6 && f >= f1 - 1e-6 ).sort( ( a, b ) => b - a );
		return out.filter( ( f, i ) => i === 0 || out[ i - 1 ] - f > 0.004 );
	}

	// the lower body into kit (materials from the section part, the well settings and the height)
	lowerBody( kit, far = false ) {
		const P = this.P, B = this.B;
		const st = this.stations( far );
		const rings = [];
		const idx = far ? FAR_IDX : null;
		for ( const f of st ) {
			let h = this.section( f );
			const opn = this.openAt( f );
			if ( idx ) h = idx.map( i => h[ i ] );
			rings.push( { f, h, o: opn.o, well: opn.well } );
		}
		const n = rings[ 0 ].h.length;
		// full loop: right half, then the left half mirrored (shared centre points once)
		const loop = ( h, f ) => {
			const z = - f;
			const o = h.map( p => [ p[ 0 ], p[ 1 ], z ] );
			for ( let k = n - 2; k >= 1; k -- ) o.push( [ - h[ k ][ 0 ], h[ k ][ 1 ], z ] );
			return o;
		};
		// the original (full resolution) index a loop segment starts at, on either half
		const orig = ( k ) => { const kk = k < n - 1 ? k : 2 * n - 3 - k; return idx ? idx[ kk ] : kk; };
		const bins = new Bins();
		const cladY = P.cladY ?? - 1;
		const matFor = ( oi, ringA, c ) => {
			const seg = SEG[ oi ];
			const w = ringA.o > 0.5 ? ringA.well : null;
			if ( seg === 'under' || seg === 'well' ) return MAT.under;
			if ( oi >= 16 ) {
				if ( w ) {
					// the fold: sill, door card, then the floor
					const topK = oi - 17;
					if ( topK <= 0 ) return MAT[ w.sill || 'trim' ];
					if ( topK <= 2 ) return MAT[ w.inner || 'plastic' ];
					return MAT[ w.floorMat || 'carpet' ];
				}
				return MAT[ B.topMat || 'paint' ];
			}
			if ( c[ 1 ] < cladY ) return MAT.trim;
			// two-tone liveries (police doors, bus skirts): P.livery( centroid ) -> MAT key or null
			if ( P.livery ) { const lv = P.livery( c ); if ( lv ) return MAT[ lv ]; }
			return MAT.paint;
		};
		const L = loop.bind( null );
		let prev = L( rings[ 0 ].h, rings[ 0 ].f );
		for ( let i = 1; i < rings.length; i ++ ) {
			const cur = L( rings[ i ].h, rings[ i ].f );
			const m = prev.length;
			for ( let k = 0; k < m; k ++ ) {
				const k2 = ( k + 1 ) % m;
				const c = [ ( prev[ k ][ 0 ] + cur[ k2 ][ 0 ] ) / 2, ( prev[ k ][ 1 ] + cur[ k2 ][ 1 ] ) / 2, ( prev[ k ][ 2 ] + cur[ k2 ][ 2 ] ) / 2 ];
				const ringA = rings[ i - 1 ].o > rings[ i ].o ? rings[ i - 1 ] : rings[ i ];
				// front-to-rear stations and a loop running bottom -> right side -> top -> left side: this winding faces out
				bins.quad( matFor( orig( k ), ringA, c ), prev[ k ], prev[ k2 ], cur[ k2 ], cur[ k ] );
			}
			prev = cur;
		}
		// domed end caps
		const cap = ( ring, dir, depth, cyk ) => {
			const base = L( ring.h, ring.f );
			let cyv = 0, cnt = 0;
			for ( const p of base ) { cyv += p[ 1 ]; cnt ++; }
			const cyc = cyk ?? cyv / cnt;
			const N = far ? 2 : 5;
			let pr = base;
			for ( let r = 1; r <= N; r ++ ) {
				const th = r / N * Math.PI / 2, k = Math.cos( th ), df = depth * Math.sin( th );
				const z = - ( ring.f + dir * df );
				const cur = base.map( p => [ p[ 0 ] * k, cyc + ( p[ 1 ] - cyc ) * k, z ] );
				for ( let q = 0; q < pr.length; q ++ ) {
					const q2 = ( q + 1 ) % pr.length;
					const cy = ( pr[ q ][ 1 ] + cur[ q ][ 1 ] ) / 2;
					const low = pr[ q ][ 1 ] < ( B.bumperLow ?? - 1 ) && r <= 2;
					const m = cy < ring.h[ 0 ][ 1 ] + 0.04 && r <= 1 ? MAT.under : low ? MAT.trim : ( cy < cladY ? MAT.trim : MAT.paint );
					if ( dir > 0 ) bins.quad( m, pr[ q ], cur[ q ], cur[ q2 ], pr[ q2 ] );
					else bins.quad( m, pr[ q ], pr[ q2 ], cur[ q2 ], cur[ q ] );
				}
				pr = cur;
			}
		};
		cap( rings[ 0 ], 1, B.nose ?? 0.08, B.noseY );
		cap( rings[ rings.length - 1 ], - 1, B.tail ?? 0.08, B.tailY );
		bins.emit( kit, B.crease ?? 0.6 );
	}

	// ---- greenhouse ------------------------------------------------------------------------------------------

	greenhouse( kit, glass, far = false ) {
		const P = this.P, G = P.gh;
		if ( ! G ) return;
		const fA0 = G.belt[ 0 ], fC0 = G.belt[ 1 ], fA1 = G.roof[ 0 ], fC1 = G.roof[ 1 ];
		const inset = G.inset ?? 0.015;
		const bx = ( f ) => { const S = this.frame( f ); return S.xE - S.re - inset; };
		const wr = pchip( G.w );
		const yr = pchip( G.y );
		const crB = G.cr ?? 0.1, crR = G.crR ?? 0.12;
		const crown = G.crown ?? 0.04, edgeRise = G.edgeRise ?? 0.02;
		const wsB = G.wsBulge ?? 0.06, rwB = G.rwBulge ?? 0.04;
		const frame = G.frame ?? 0.025;
		const nodes = []; // right half, front centre -> rear centre: { b: [x,y,z], r: [x,y,z], out: [ox, oz], bulge }
		const reg = []; // region of the interval node i -> i + 1
		const beltP = ( x, f ) => [ x, this.topY( x, f ) + 0.002, - f ];
		const roofP = ( x, f, crownK = 0 ) => [ x, yr( f ) + crownK, - f ];
		// windshield
		const xbF = bx( fA0 - crB ), xrF = wr( fA1 - crR );
		const wsU = far ? [ 0, 0.5, 1 ] : [ 0, 0.25, 0.5, 0.72, 0.88, 1 ];
		const fuW = Math.min( 0.2, frame * 1.6 / Math.max( 0.3, xbF - crB ) );
		const us = [ ...new Set( [ ...wsU, 1 - fuW ] ) ].sort( ( a, b ) => a - b );
		for ( const u of us ) {
			nodes.push( { b: beltP( u * ( xbF - crB ), fA0 + wsB * ( 1 - u * u ) ), r: roofP( u * ( xrF - crR ), fA1 + wsB * 0.6 * ( 1 - u * u ), crown * 0.5 * ( 1 - u * u ) ), out: [ 0, - 1 ], bulge: 0 } );
			reg.push( u >= 1 - fuW - 1e-6 ? 'frame' : ( G.windshield === false ? 'paint' : 'glass' ) );
		}
		reg.pop();
		// front corner (A-pillar)
		const nA = far ? 1 : 3;
		for ( let k = 1; k <= nA; k ++ ) {
			const ph = k / nA * Math.PI / 2;
			reg.push( G.aPillar || 'paint' );
			nodes.push( {
				b: beltP( xbF - crB + crB * Math.sin( ph ), fA0 - crB + crB * Math.cos( ph ) ),
				r: roofP( xrF - crR + crR * Math.sin( ph ), fA1 - crR + crR * Math.cos( ph ) ),
				out: [ Math.sin( ph ), - Math.cos( ph ) ], bulge: 0,
			} );
		}
		// side: posts from the corner end to the rear corner start
		const sideStart = [ fA0 - crB, fA1 - crR ], sideEnd = [ fC0 + crB, fC1 + crR ];
		const knots = [ { at: sideStart } ];
		for ( const s of G.side ) knots.push( { at: s.to === 'end' ? sideEnd : s.to, kind: s.kind } );
		if ( knots[ knots.length - 1 ].at !== sideEnd ) knots.push( { at: sideEnd, kind: G.cPillar || 'paint' } );
		const sideNode = ( fb, fr ) => ( { b: beltP( bx( fb ), fb ), r: roofP( wr( fr ), fr ), out: [ 1, 0 ], bulge: G.bulge ?? 0.025 } );
		const frameF = frame * 1.2;
		for ( let q = 1; q < knots.length; q ++ ) {
			const a = knots[ q - 1 ].at, b = knots[ q ].at, kind = knots[ q ].kind;
			if ( kind === 'glass' ) {
				const len = a[ 0 ] - b[ 0 ];
				const sub = far ? 1 : Math.max( 1, Math.round( len / 0.3 ) );
				// frame band, glass (subdivided so the bow reads), frame band
				reg.push( 'frame' );
				nodes.push( sideNode( a[ 0 ] - frameF, a[ 1 ] - frameF ) );
				for ( let s = 1; s <= sub; s ++ ) {
					const t = s / sub;
					const fb = lerp( a[ 0 ] - frameF, b[ 0 ] + frameF, t ), fr = lerp( a[ 1 ] - frameF, b[ 1 ] + frameF, t );
					reg.push( 'glass' );
					nodes.push( sideNode( fb, fr ) );
				}
				reg.push( 'frame' );
				nodes.push( sideNode( b[ 0 ], b[ 1 ] ) );
			} else {
				const sub = far ? 1 : Math.max( 1, Math.round( ( a[ 0 ] - b[ 0 ] ) / 0.35 ) );
				for ( let s = 1; s <= sub; s ++ ) {
					reg.push( kind );
					nodes.push( sideNode( lerp( a[ 0 ], b[ 0 ], s / sub ), lerp( a[ 1 ], b[ 1 ], s / sub ) ) );
				}
			}
		}
		// rear corner
		const xbR = bx( fC0 + crB ), xrR = wr( fC1 + crR );
		for ( let k = 1; k <= nA; k ++ ) {
			const ph = Math.PI / 2 + k / nA * Math.PI / 2;
			reg.push( G.cPillar || 'paint' );
			nodes.push( {
				b: beltP( xbR - crB + crB * Math.sin( ph ), fC0 + crB + crB * Math.cos( ph ) ),
				r: roofP( xrR - crR + crR * Math.sin( ph ), fC1 + crR + crR * Math.cos( ph ) ),
				out: [ Math.sin( ph ), - Math.cos( ph ) ], bulge: 0,
			} );
		}
		// rear window
		const fuR = Math.min( 0.2, frame * 1.6 / Math.max( 0.3, xbR - crB ) );
		const rus = [ ...new Set( [ ...wsU, 1 - fuR ] ) ].sort( ( a, b ) => b - a ).slice( 1 );
		for ( const u of rus ) {
			reg.push( u >= 1 - fuR - 1e-6 ? 'frame' : ( G.rearWindow === false ? ( G.rearKind || 'paint' ) : 'glass' ) );
			nodes.push( { b: beltP( u * ( xbR - crB ), fC0 - rwB * ( 1 - u * u ) ), r: roofP( u * ( xrR - crR ), fC1 - rwB * 0.6 * ( 1 - u * u ), crown * 0.5 * ( 1 - u * u ) ), out: [ 0, 1 ], bulge: 0 } );
		}
		// the full ring: right half, then the left half mirrored back to the front
		const nR = nodes.length;
		const ring = nodes.slice(), rreg = reg.slice();
		for ( let i = nR - 2; i >= 1; i -- ) {
			const nd = nodes[ i ];
			ring.push( { b: [ - nd.b[ 0 ], nd.b[ 1 ], nd.b[ 2 ] ], r: [ - nd.r[ 0 ], nd.r[ 1 ], nd.r[ 2 ] ], out: [ - nd.out[ 0 ], nd.out[ 1 ] ], bulge: nd.bulge } );
		}
		for ( let i = nR - 2; i >= 0; i -- ) rreg.push( reg[ i ] );
		// s knots: belt moulding, frame, window band, frame, roof rail, then over the roof
		const [ sg0, sg1 ] = G.band ?? [ 0.06, 0.93 ];
		const hAvg = ( yr( ( fA1 + fC1 ) / 2 ) - this.topY( 0.5, ( fA0 + fC0 ) / 2 ) ) || 0.5;
		const fr = Math.min( 0.12, frame / hAvg );
		const sKn = far ? [ 0, sg0, sg1, 1 ] : [ 0, sg0, sg0 + fr, lerp( sg0 + fr, sg1 - fr, 0.33 ), lerp( sg0 + fr, sg1 - fr, 0.66 ), sg1 - fr, sg1, 1 ];
		const uKn = far ? [ 0.1, 0.4, 1 ] : [ 0.03, 0.08, 0.15, 0.28, 0.45, 0.65, 0.85, 1 ];
		const S = [ ...sKn, ...uKn.map( u => 1 + u ) ];
		const bandOf = ( s0, s1 ) => {
			const s = ( s0 + s1 ) / 2;
			if ( s < sg0 ) return 'belt';
			if ( s < sg0 + fr ) return 'frameB';
			if ( s < sg1 - fr ) return 'window';
			if ( s < sg1 ) return 'frameT';
			if ( s < 1 ) return 'rail';
			return 'roof';
		};
		// the spine the roof closes onto
		const midF = ( fA1 + fC1 ) / 2;
		const spF = Math.max( midF, fA1 - crR - 0.35 ), spR = Math.min( midF, fC1 + crR + 0.35 );
		const pt = ( nd, s ) => {
			if ( s <= 1 ) {
				const bw = Math.sin( Math.PI * Math.min( 1, Math.max( 0, ( s - sg0 ) / ( sg1 - sg0 ) ) ) ) * nd.bulge;
				return [ lerp( nd.b[ 0 ], nd.r[ 0 ], s ) + nd.out[ 0 ] * bw, lerp( nd.b[ 1 ], nd.r[ 1 ], s ), lerp( nd.b[ 2 ], nd.r[ 2 ], s ) + nd.out[ 1 ] * bw ];
			}
			const u = s - 1;
			const fcur = - nd.r[ 2 ];
			const ft = Math.min( spF, Math.max( spR, fcur ) );
			const y = nd.r[ 1 ] + edgeRise * Math.sin( Math.min( 1, u * 6 ) * Math.PI / 2 ) + ( crown ) * ( 1 - ( 1 - u ) * ( 1 - u ) );
			return [ nd.r[ 0 ] * ( 1 - u ), y, - lerp( fcur, ft, u ) ];
		};
		const Npts = ring.map( nd => S.map( s => pt( nd, s ) ) );
		const bins = new Bins(), gbins = new Bins(), ibins = new Bins();
		const mOf = ( r, band ) => {
			if ( band === 'belt' ) return MAT[ G.beltMat || 'trim' ];
			if ( band === 'rail' ) return MAT[ G.railMat || G.roofMat || 'paint' ];
			if ( band === 'roof' ) return MAT[ G.roofMat || 'paint' ];
			if ( r === 'glass' ) return band === 'window' ? 'GLASS' : MAT.gloss;
			if ( r === 'frame' ) return MAT.gloss;
			if ( r === 'black' ) return MAT.gloss;
			if ( r === 'trim' ) return MAT.trim;
			return MAT[ r ] || MAT.paint;
		};
		const nn = ring.length;
		for ( let i = 0; i < nn; i ++ ) {
			const i2 = ( i + 1 ) % nn;
			const r = rreg[ i ];
			for ( let j = 0; j < S.length - 1; j ++ ) {
				const band = bandOf( S[ j ], S[ j + 1 ] );
				const m = mOf( r, band );
				const a = Npts[ i ][ j ], b = Npts[ i2 ][ j ], c = Npts[ i2 ][ j + 1 ], d = Npts[ i ][ j + 1 ];
				// the ring runs clockwise seen from above (front -> right -> rear) and s runs up / inward: (a, d, c, b) faces out
				if ( m === 'GLASS' ) { gbins.quad( MAT.glassDark, a, d, c, b ); continue; }
				bins.quad( m, a, d, c, b );
				if ( far || band === 'belt' ) continue;
				// inside: headliner and pillar trims, a couple of centimetres in
				// per-vertex offset (a function of the vertex alone, so neighbouring quads stay welded)
				const inw = ( p ) => [ p[ 0 ] - Math.sign( p[ 0 ] ) * Math.min( Math.abs( p[ 0 ] ), 0.03 ), p[ 1 ] - 0.022, p[ 2 ] ];
				ibins.quad( band === 'roof' || band === 'rail' ? MAT.headliner : MAT[ G.innerMat || 'plastic' ], inw( a ), inw( b ), inw( c ), inw( d ) );
			}
		}
		bins.emit( kit, 0.7 );
		gbins.emit( glass, 0.9 );
		if ( ! far ) kit.with( 'near', () => ibins.emit( kit, 0.7 ) );
		this.ghRing = { ring, S, Npts, rreg };
	}
}

// ray probe against built geometry: returns { point: [x,y,z], normal: [x,y,z] } or null
export function makeProbe( geos ) {
	const meshes = geos.filter( Boolean ).map( g => new THREE.Mesh( g, new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } ) ) );
	const rc = new THREE.Raycaster();
	const o = new THREE.Vector3(), d = new THREE.Vector3();
	return ( origin, dir ) => {
		o.set( ...origin ); d.set( ...dir ).normalize();
		rc.set( o, d ); rc.far = 20;
		const hits = rc.intersectObjects( meshes, false );
		if ( ! hits.length ) return null;
		const h = hits[ 0 ];
		const n = h.face.normal.clone();
		if ( n.dot( d ) > 0 ) n.negate();
		return { point: h.point.toArray(), normal: n.toArray() };
	};
}
