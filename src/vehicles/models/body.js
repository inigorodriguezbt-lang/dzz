// Parametric road-vehicle bodies. A body is a side profile extruded across the width (hood, trunk,
// fenders, bumpers, sills), shaped in plan and section (rounded corners, tumblehome, crowned panels),
// with separately built door panels in the cabin well, a greenhouse of pillars, roof and glass, and the
// details that sell it: lamps, grille, mirrors, handles, plates, trim, wipers and the interior.
//
// Vehicle frame: x right, y up (0 = ground at rest), z back; f = -z is "forward". Axles at P.axleF / P.axleR.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, MAT, mat, sideExtrude, roundedOutline, smooth, lerp } from '../kit.js';
import { ATLAS } from '../materials.js';

// ---- the profile ------------------------------------------------------------------------------------

// closed outline [ f, y ]: P.top runs front-bottom -> over the top -> rear-bottom; the bottom line with
// the wheel arches is generated.
export function outlineOf( P ) {
	const top = roundedOutline( P.top, 5 ).slice();
	// roundedOutline treats the list as closed; the first and last points are sharp in our lists
	const pts = top;
	const yb = P.bottomY;
	const arch = ( cf, forward ) => {
		const cy = P.wheelR + ( P.archLift || 0 ), r = P.archR;
		const h = cy - yb;
		const out = [];
		if ( h >= r ) return out;
		const b = Math.asin( Math.min( 1, h / r ) );
		// from the rear intersection over the top to the front one (or reversed)
		const a0 = Math.PI + b, a1 = - b;
		const N = 14;
		for ( let k = 0; k <= N; k ++ ) {
			const t = forward ? k / N : 1 - k / N;
			const a = a0 + ( a1 - a0 ) * t;
			out.push( [ cf + Math.cos( a ) * r, cy + Math.sin( a ) * r ] );
		}
		return out;
	};
	// bottom line from the rear to the front (the polygon continues after the last top point, rear
	// bottom): each arch runs from its rear foot (angle pi + b) over the top to its front foot (-b)
	const bottom = [];
	for ( const ax of P.axles || [ P.axleR, P.axleF ] ) for ( const p of arch( ax, true ) ) bottom.push( p );
	return pts.concat( bottom );
}

// horizontal extent of the outline at height y: [ minF, maxF ]
export function spanAt( outline, y ) {
	let lo = Infinity, hi = - Infinity;
	for ( let i = 0; i < outline.length; i ++ ) {
		const a = outline[ i ], b = outline[ ( i + 1 ) % outline.length ];
		if ( ( a[ 1 ] - y ) * ( b[ 1 ] - y ) > 0 || a[ 1 ] === b[ 1 ] ) continue;
		const t = ( y - a[ 1 ] ) / ( b[ 1 ] - a[ 1 ] );
		const f = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t;
		lo = Math.min( lo, f ); hi = Math.max( hi, f );
	}
	return [ lo, hi ];
}

// highest outline point above f (the body's top surface), searching segments
export function topAt( outline, f ) {
	let best = - Infinity;
	for ( let i = 0; i < outline.length; i ++ ) {
		const a = outline[ i ], b = outline[ ( i + 1 ) % outline.length ];
		if ( ( a[ 0 ] - f ) * ( b[ 0 ] - f ) > 0 || a[ 0 ] === b[ 0 ] ) continue;
		const t = ( f - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] );
		best = Math.max( best, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t );
	}
	return best;
}

// body half-width at (f, y): plan rounding at the ends, tumblehome above the shoulder, tuck under
export function sideX( P, f, y ) {
	const hw = P.W / 2;
	let s = 1;
	const [ lf, pf ] = P.planF, [ lr, pr ] = P.planR;
	const tf = smooth( P.front - lf, P.front, f ); s *= 1 - pf * tf * tf;
	const tr = smooth( P.rear + lr, P.rear, f ); s *= 1 - pr * tr * tr;
	s *= 1 - P.tumble * smooth( P.shoulder, P.beltTop, y );
	s *= 1 - ( P.tuck ?? 0.035 ) * smooth( P.bottomY + 0.22, P.bottomY, y );
	// a gentle barrel to the sides so the reflections flow
	s *= 1 - 0.012 * Math.pow( ( y - P.shoulder ) / 0.5, 2 );
	return hw * s;
}

// split the side-facing triangles so the section deformation reads smoothly
function subdivideSides( g, levels ) {
	let pos = Array.from( g.attributes.position.array );
	for ( let l = 0; l < levels; l ++ ) {
		const out = [];
		for ( let i = 0; i < pos.length; i += 9 ) {
			const a = pos.slice( i, i + 3 ), b = pos.slice( i + 3, i + 6 ), c = pos.slice( i + 6, i + 9 );
			const ux = b[ 0 ] - a[ 0 ], uy = b[ 1 ] - a[ 1 ], uz = b[ 2 ] - a[ 2 ];
			const vx = c[ 0 ] - a[ 0 ], vy = c[ 1 ] - a[ 1 ], vz = c[ 2 ] - a[ 2 ];
			const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
			const nl = Math.hypot( nx, ny, nz ) || 1;
			const area = nl * 0.5;
			if ( Math.abs( nx / nl ) < 0.8 || area < 0.004 ) { out.push( ...a, ...b, ...c ); continue; }
			const ab = mid( a, b ), bc = mid( b, c ), ca = mid( c, a );
			out.push( ...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca );
		}
		pos = out;
	}
	const n = new THREE.BufferGeometry();
	n.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	return n;
}
const mid = ( a, b ) => [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 ];

// ---- the builder -------------------------------------------------------------------------------------

export function buildBody( P ) {
	const k = new Kit();
	const glass = new Kit();
	const outline = outlineOf( P );
	P.outline = outline;
	const hw = P.W / 2;
	P.beltTop = P.beltTop ?? P.gh.beltY + 0.04;

	// 1. lower body
	let g = sideExtrude( outline, hw, { bevel: P.bevel ?? 0.05, segs: 3, steps: P.steps ?? 12, curve: 4 } );
	g = subdivideSides( g, 3 );
	const p = g.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i ), f = - z;
		const s = sideX( P, f, y ) / hw;
		let yy = y;
		const u = x / hw;
		yy += ( P.crown ?? 0.03 ) * ( 1 - u * u ) * smooth( P.shoulder, P.shoulder + 0.12, y );
		p.setXYZ( i, x * s, yy, z );
	}
	g.computeVertexNormals();
	g = toCreasedNormals( g, 0.62 );
	addPerTriangle( k, g, ( c, n ) => {
		const f = - c[ 2 ];
		if ( n[ 1 ] < - 0.55 ) return MAT.under;
		for ( const af of [ P.axleF, P.axleR ] ) {
			const d = Math.hypot( f - af, c[ 1 ] - P.wheelR - ( P.archLift || 0 ) );
			if ( d < P.archR + 0.035 && Math.abs( n[ 0 ] ) < 0.7 ) return MAT.trim;
		}
		if ( P.cladY && c[ 1 ] < P.cladY && Math.abs( n[ 0 ] ) > 0.3 ) return MAT.trim;
		if ( P.bumperTrim && c[ 1 ] < P.bumperTrim && ( f > P.front - 0.25 || f < P.rear + 0.25 ) ) return MAT.trim;
		if ( n[ 1 ] > 0.8 && c[ 1 ] < P.floorY + 0.06 && f < P.cabinF && f > P.cabinR ) return MAT.carpet;
		return MAT.paint;
	} );

	// 2. doors and well walls in the cabin section
	if ( P.doors !== false ) doorPanels( k, P );
	for ( const q of P.quarters || [] ) for ( const side of [ - 1, 1 ] ) sidePanel( k, P, side, q[ 1 ], q[ 0 ], q[ 2 ] ?? P.floorY - 0.04, q[ 3 ] ?? P.beltTop, MAT.paint, 0, 5, 5 );
	for ( const w of P.wells || [] ) wellWalls( k, P, w );

	// 3. greenhouse
	if ( P.gh && ! P.gh.none ) greenhouse( k, glass, P );

	// 4. details
	details( k, glass, P );
	if ( P.extra ) P.extra( k, glass, P );

	// 5. interior (near LOD only)
	k.with( 'near', () => interior( k, P ) );
	return { kit: k, glass };
}

// per-triangle material from its centroid and normal
export function addPerTriangle( k, g, fn ) {
	const pos = g.attributes.position.array, nrm = g.attributes.normal.array;
	const n = pos.length / 9;
	// group triangles by material object to reuse Kit.add
	const groups = new Map();
	for ( let t = 0; t < n; t ++ ) {
		const i = t * 9;
		const c = [ ( pos[ i ] + pos[ i + 3 ] + pos[ i + 6 ] ) / 3, ( pos[ i + 1 ] + pos[ i + 4 ] + pos[ i + 7 ] ) / 3, ( pos[ i + 2 ] + pos[ i + 5 ] + pos[ i + 8 ] ) / 3 ];
		const nn = [ ( nrm[ i ] + nrm[ i + 3 ] + nrm[ i + 6 ] ) / 3, ( nrm[ i + 1 ] + nrm[ i + 4 ] + nrm[ i + 7 ] ) / 3, ( nrm[ i + 2 ] + nrm[ i + 5 ] + nrm[ i + 8 ] ) / 3 ];
		const m = fn( c, nn );
		let a = groups.get( m );
		if ( ! a ) { a = { p: [], n: [] }; groups.set( m, a ); }
		for ( let j = 0; j < 9; j ++ ) { a.p.push( pos[ i + j ] ); a.n.push( nrm[ i + j ] ); }
	}
	for ( const [ m, a ] of groups ) {
		const gg = new THREE.BufferGeometry();
		gg.setAttribute( 'position', new THREE.Float32BufferAttribute( a.p, 3 ) );
		gg.setAttribute( 'normal', new THREE.Float32BufferAttribute( a.n, 3 ) );
		k.add( gg, m );
	}
}

// a surface on the body side between f0..f1 and y0..y1, offset outward by `off`
export function sidePanel( k, P, side, f0, f1, y0, y1, m, off = 0, nu = 8, nv = 5, topFn = null ) {
	return k.grid( ( u, v ) => {
		const f = lerp( f0, f1, u );
		const yt = topFn ? topFn( f ) : y1;
		const y = lerp( y0, yt, v );
		return [ side * ( sideX( P, f, y ) + off ), y, - f ];
	}, nu, nv, m );
}

function doorPanels( k, P ) {
	const G = P.gh;
	const y0 = P.floorY - 0.04, y1 = P.beltTop;
	const doors = P.doorF; // list of [ f0, f1 ] per door, front to rear
	for ( const side of [ - 1, 1 ] ) {
		for ( let d = 0; d < doors.length; d ++ ) {
			const [ fa, fb ] = doors[ d ];
			const paintSlot = P.doorPaint ? MAT[ P.doorPaint ] : MAT.paint;
			sidePanel( k, P, side, fb + 0.004, fa - 0.004, y0, y1, paintSlot, 0, 10, 6 );
			// the inner door card
			k.with( 'near', () => {
				sidePanel( k, P, side, fb, fa, y0 + 0.1, y1 - 0.02, MAT.plastic, - 0.075, 3, 2 );
				// armrest
				const fm = ( fa + fb ) / 2;
				k.box( 0.07, 0.05, ( fa - fb ) * 0.55, MAT.plastic, { p: [ side * ( sideX( P, fm, 0.6 ) - 0.1 ), P.floorY + 0.36, - fm ] }, 0.015 );
			} );
			// the top of the door: a sill between the outer skin and the card
			k.grid( ( u, v ) => {
				const f = lerp( fb, fa, u );
				const x = sideX( P, f, y1 ) - v * 0.075;
				return [ side * x, y1 - v * 0.012, - f ];
			}, 6, 1, MAT.trim );
			// handle
			const hf = fa - 0.18 - ( d === 0 ? 0.08 : 0 );
			const hy = P.handleY ?? ( y1 - 0.12 );
			k.box( 0.03, 0.035, 0.16, P.handleMat ? MAT[ P.handleMat ] : MAT.paint, { p: [ side * ( sideX( P, hf, hy ) + 0.012 ), hy, - hf ] }, 0.012 );
		}
		// seam shadows between the doors and at the ends
		for ( const [ fa ] of doors ) sidePanel( k, P, side, fa - 0.005, fa + 0.005, y0, y1, MAT.trim, - 0.004, 1, 3 );
		const fr = doors[ doors.length - 1 ][ 1 ];
		sidePanel( k, P, side, fr - 0.005, fr + 0.005, y0, y1, MAT.trim, - 0.004, 1, 3 );
	}
}

// open-top well walls (pickup bed, humvee cargo, jeep tub): outer skin, inner skin and a cap rail
function wellWalls( k, P, w ) {
	const { f0, f1, y0, y1, thick = 0.06, cap = 'paint', inner = 'paint' } = w;
	for ( const side of [ - 1, 1 ] ) {
		sidePanel( k, P, side, f1, f0, y0, y1, MAT.paint, 0, 10, 4 );
		sidePanel( k, P, side, f1, f0, y0, y1, MAT[ inner ], - thick, 4, 2 );
		k.grid( ( u, v ) => { const f = lerp( f1, f0, u ); return [ side * ( sideX( P, f, y1 ) - v * thick ), y1 + 0.005, - f ]; }, 8, 1, MAT[ cap ] );
	}
	if ( w.front ) {
		// front wall of the well (behind the cab)
		const f = f0;
		k.grid( ( u, v ) => [ lerp( - 1, 1, u ) * ( sideX( P, f, lerp( y0, y1, v ) ) - thick ), lerp( y0, y1, v ), - f ], 4, 2, MAT[ inner ] );
	}
}

// ---- greenhouse ----------------------------------------------------------------------------------

function greenhouse( k, glass, P ) {
	const G = P.gh;
	const yb = G.beltY, yr = G.roofY;
	const wAt = ( y ) => lerp( G.wBelt, G.wRoof, ( y - yb ) / ( yr - yb ) );
	const fA = ( y ) => lerp( G.ws[ 0 ], G.ws[ 1 ], ( y - yb ) / ( yr - yb ) );
	const fE = ( y ) => lerp( G.sideEnd[ 0 ], G.sideEnd[ 1 ], ( y - yb ) / ( yr - yb ) );
	const fRw = ( y ) => lerp( G.rw[ 0 ], G.rw[ 1 ], ( y - yb ) / ( yr - yb ) );
	const pil = G.pillar ?? 0.075;
	const pillarMat = G.pillarMat ? MAT[ G.pillarMat ] : MAT.paint;
	const bMat = G.bMat ? MAT[ G.bMat ] : MAT.gloss;
	const bulge = G.wsBulge ?? 0.05;

	// windshield (curved in plan)
	glass.grid( ( u, v ) => {
		const y = lerp( yb + 0.01, yr - 0.015, v );
		const x = ( u * 2 - 1 ) * ( wAt( y ) - pil * 0.6 );
		const f = fA( y ) - 0.015 + bulge * ( 1 - Math.pow( u * 2 - 1, 2 ) ) - bulge;
		return [ x, y, - f ];
	}, 10, 4, MAT.glassDark );
	// rear window
	if ( G.rw ) {
		glass.grid( ( u, v ) => {
			const y = lerp( yb + 0.02, yr - 0.02, v );
			const x = ( u * 2 - 1 ) * ( wAt( y ) - ( G.rwInset ?? 0.12 ) );
			const f = fRw( y ) + 0.01 - bulge * 0.6 * ( 1 - Math.pow( u * 2 - 1, 2 ) ) + bulge * 0.6;
			return [ x, y, - f ];
		}, 8, 3, MAT.glassDark );
	}
	// side glass (one pane per side; the pillars sit over it)
	for ( const side of [ - 1, 1 ] ) {
		const pts = [];
		const N = 6;
		for ( let i = 0; i <= N; i ++ ) { const y = lerp( yb + 0.005, yr - 0.03, i / N ); pts.push( [ side * ( wAt( y ) - 0.006 ), y, - fA( y ) ] ); }
		for ( let i = N; i >= 0; i -- ) { const y = lerp( yb + 0.005, yr - 0.03, i / N ); pts.push( [ side * ( wAt( y ) - 0.006 ), y, - fE( y ) ] ); }
		// fan from the centroid (the outline is convex enough)
		const c = [ 0, 0, 0 ];
		for ( const q of pts ) { c[ 0 ] += q[ 0 ] / pts.length; c[ 1 ] += q[ 1 ] / pts.length; c[ 2 ] += q[ 2 ] / pts.length; }
		const tri = [];
		for ( let i = 0; i < pts.length; i ++ ) tri.push( c, pts[ i ], pts[ ( i + 1 ) % pts.length ] );
		const gg = new THREE.BufferGeometry();
		gg.setAttribute( 'position', new THREE.Float32BufferAttribute( tri.flat(), 3 ) );
		gg.computeVertexNormals();
		glass.add( gg, MAT.glassDark );
	}
	// roof: a crowned slab
	const rf = G.ws[ 1 ] + 0.01, rr = G.rw ? G.rw[ 1 ] - 0.01 : G.sideEnd[ 1 ] - 0.02;
	const crown = G.crown ?? 0.035;
	const roofY = ( u, f ) => yr + crown * ( 1 - u * u ) - 0.012 * Math.pow( Math.abs( ( f - ( rf + rr ) / 2 ) / ( ( rf - rr ) / 2 ) ), 6 );
	k.grid( ( u, v ) => { const f = lerp( rf, rr, v ); const uu = u * 2 - 1; return [ uu * ( G.wRoof + 0.01 ), roofY( uu, f ), - f ]; }, 10, 8, G.roofMat ? MAT[ G.roofMat ] : MAT.paint );
	// roof edges (drip rails) and the front / rear lips
	for ( const side of [ - 1, 1 ] ) {
		k.grid( ( u, v ) => { const f = lerp( rf, rr, u ); return [ side * ( G.wRoof + 0.012 - v * 0.004 ), roofY( 1, f ) - v * 0.07, - f ]; }, 8, 1, G.roofMat ? MAT[ G.roofMat ] : MAT.paint );
	}
	k.grid( ( u, v ) => { const uu = u * 2 - 1; return [ uu * ( G.wRoof + 0.01 ), roofY( uu, rf ) - v * 0.05, - ( rf + v * 0.01 ) ]; }, 8, 1, MAT.paint );
	k.grid( ( u, v ) => { const uu = u * 2 - 1; return [ uu * ( G.wRoof + 0.01 ), roofY( uu, rr ) - v * 0.05, - ( rr - v * 0.01 ) ]; }, 8, 1, MAT.paint );
	// headliner
	k.with( 'near', () => k.grid( ( u, v ) => { const f = lerp( rf - 0.02, rr + 0.02, v ); const uu = u * 2 - 1; return [ uu * ( G.wRoof - 0.02 ), roofY( uu, f ) - 0.055, - f ]; }, 6, 6, MAT.headliner ) );

	// pillars
	for ( const side of [ - 1, 1 ] ) {
		// A
		k.beam( [ side * ( wAt( yb ) - 0.012 ), yb, - fA( yb ) + 0.01 ], [ side * ( wAt( yr ) - 0.012 ), yr - 0.01, - fA( yr ) + 0.01 ], pil, 0.05, pillarMat, [ side, 0.2, 0 ], 0.012 );
		// B (and more)
		for ( const q of G.posts || [] ) {
			k.beam( [ side * ( wAt( yb ) + 0.002 ), yb, - q[ 0 ] ], [ side * ( wAt( yr ) + 0.002 ), yr - 0.01, - q[ 1 ] ], q[ 2 ] ?? 0.09, 0.03, bMat, [ side, 0, 0 ], 0.008 );
		}
		// C: panel from the end of the side glass to the rear window (or a closing post)
		const e0 = G.sideEnd[ 0 ], e1 = G.sideEnd[ 1 ];
		if ( G.rw ) {
			const inset = G.rwInset ?? 0.12;
			k.poly( [
				[ side * ( wAt( yb ) + 0.002 ), yb, - ( e0 + 0.02 ) ],
				[ side * ( wAt( yr ) + 0.004 ), yr, - ( e1 + 0.02 ) ],
				[ side * ( wAt( yr ) - inset + 0.02 ), yr, - ( G.rw[ 1 ] ) ],
				[ side * ( wAt( yb ) - inset + 0.02 ), yb, - ( G.rw[ 0 ] ) ],
			], G.cMat ? MAT[ G.cMat ] : pillarMat, true );
			// fill between the side glass end and the rear pillar edge along the body side
			k.poly( [
				[ side * ( wAt( yb ) + 0.003 ), yb, - ( e0 + 0.02 ) ],
				[ side * ( wAt( yb ) + 0.003 ), yb, - ( G.rw[ 0 ] ) ],
				[ side * ( wAt( yr ) + 0.003 ), yr, - ( G.rw[ 1 ] ) ],
				[ side * ( wAt( yr ) + 0.003 ), yr, - ( e1 + 0.02 ) ],
			], G.cMat ? MAT[ G.cMat ] : pillarMat, true );
		} else {
			k.beam( [ side * ( wAt( yb ) - 0.01 ), yb, - e0 ], [ side * ( wAt( yr ) - 0.01 ), yr - 0.01, - e1 ], pil * 1.4, 0.05, pillarMat, [ side, 0, 0 ], 0.012 );
		}
		// window seal along the top of the side glass
		k.beam( [ side * ( wAt( yr - 0.03 ) + 0.002 ), yr - 0.03, - fA( yr - 0.03 ) ], [ side * ( wAt( yr - 0.03 ) + 0.002 ), yr - 0.03, - fE( yr - 0.03 ) ], 0.018, 0.012, MAT.trim );
		// belt moulding
		k.beam( [ side * ( wAt( yb ) + 0.004 ), yb + 0.008, - fA( yb ) ], [ side * ( wAt( yb ) + 0.004 ), yb + 0.008, - fE( yb ) ], 0.02, 0.016, G.beltMat ? MAT[ G.beltMat ] : MAT.trim );
		// ledge between the body side and the glass at the belt
		k.grid( ( u, v ) => {
			const f = lerp( fE( yb ), fA( yb ), u );
			const xb = sideX( P, f, P.beltTop ), xg = wAt( yb );
			return [ side * lerp( xg, xb, v ), lerp( yb + 0.004, P.beltTop, v ), - f ];
		}, 8, 1, MAT.paint );
	}
	// the cowl: a strip between the hood and the windshield, and wipers
	k.grid( ( u, v ) => { const uu = u * 2 - 1; const y = yb + 0.004; return [ uu * ( wAt( y ) + 0.01 ), y, - ( fA( y ) + 0.005 + v * ( G.cowl ?? 0.12 ) ) ]; }, 6, 1, MAT.trim );
	for ( const s of [ - 0.32, 0.18 ] ) k.beam( [ s * G.wBelt * 1.6 - 0.1, yb + 0.03, - ( fA( yb + 0.03 ) + 0.05 ) ], [ s * G.wBelt * 1.6 + 0.38, yb + 0.07, - ( fA( yb + 0.07 ) + 0.02 ) ], 0.012, 0.02, MAT.trim );
	P._gh = { wAt, fA, fE, fRw };
}

// ---- details -------------------------------------------------------------------------------------

function details( k, glass, P ) {
	const L = P.lamps || {};
	const hw = P.W / 2;
	const outline = P.outline;
	// headlights
	if ( L.head ) {
		const { y, x, w, h, round } = L.head;
		for ( const side of [ - 1, 1 ] ) {
			const [ , fmax ] = spanAt( outline, y );
			const f = fmax - ( L.head.inset ?? 0.05 );
			const yaw = side * ( L.head.wrap ?? 0.35 );
			if ( round ) {
				k.cyl( w / 2, w / 2, 0.08, MAT.chrome, { p: [ side * x, y, - f ], r: [ Math.PI / 2, 0, 0 ] }, 20 );
				k.cyl( w / 2 - 0.015, w / 2 - 0.015, 0.02, MAT.head, { p: [ side * x, y, - f - 0.035 ], r: [ Math.PI / 2, 0, 0 ] }, 20 );
			} else {
				k.box( w, h, 0.16, MAT.gloss, { p: [ side * x, y, - f + 0.045 ], r: [ 0, yaw, 0 ] }, 0.03 );
				k.box( w * 0.96, h * 0.86, 0.1, MAT.head, { p: [ side * x, y, - f + 0.012 ], r: [ 0, yaw, 0 ] }, 0.03 );
				// projector detail
				k.cyl( h * 0.3, h * 0.3, 0.02, MAT.chrome, { p: [ side * ( x - side * w * 0.2 ), y, - f - 0.035 ], r: [ Math.PI / 2, 0, 0 ] }, 12 );
			}
		}
	}
	// tail lamps
	if ( L.tail ) {
		const { y, x, w, h } = L.tail;
		for ( const side of [ - 1, 1 ] ) {
			const [ fmin ] = spanAt( outline, y );
			const f = fmin + ( L.tail.inset ?? 0.05 );
			const yaw = - side * ( L.tail.wrap ?? 0.3 );
			if ( L.tail.vertical ) {
				k.box( w, h, 0.1, MAT.tail, { p: [ side * x, y, - f ], r: [ 0, yaw, 0 ] }, 0.02 );
				k.box( w * 0.8, h * 0.22, 0.104, MAT.reverse, { p: [ side * x, y - h * 0.3, - f ], r: [ 0, yaw, 0 ] }, 0.01 );
			} else {
				k.box( w, h, 0.12, MAT.tail, { p: [ side * x, y, - f ], r: [ 0, yaw, 0 ] }, 0.025 );
				k.box( w * 0.3, h * 0.6, 0.124, MAT.reverse, { p: [ side * ( x - side * w * 0.3 ), y, - f ], r: [ 0, yaw, 0 ] }, 0.01 );
			}
			// indicators
			k.box( 0.08, 0.04, 0.05, side < 0 ? MAT.indL : MAT.indR, { p: [ side * ( x + side * w * 0.1 ), y - h * 0.5 - 0.035, - f ], r: [ 0, yaw, 0 ] }, 0.01 );
		}
	}
	// front indicators
	if ( L.head && L.frontInd !== false ) for ( const side of [ - 1, 1 ] ) {
		const y = L.head.y - L.head.h * 0.5 - 0.05;
		const [ , fmax ] = spanAt( outline, y );
		k.box( 0.12, 0.035, 0.04, side < 0 ? MAT.indL : MAT.indR, { p: [ side * ( L.head.x + 0.02 ), y, - ( fmax - 0.02 ) ] }, 0.01 );
	}
	// grille
	if ( P.grille ) {
		const { y, w, h, chrome } = P.grille;
		const [ , fmax ] = spanAt( outline, y );
		k.box( w, h, 0.06, mat( 'trim', { uv: ATLAS.grille } ), { p: [ 0, y, - ( fmax - 0.025 ) ] }, 0.02 );
		if ( chrome ) k.box( w + 0.03, 0.025, 0.07, MAT.chrome, { p: [ 0, y + h / 2, - ( fmax - 0.02 ) ] }, 0.01 );
		// lower intake
		if ( P.grille.lower ) {
			const ly = P.grille.lower.y;
			const [ , fm2 ] = spanAt( outline, ly );
			k.box( P.grille.lower.w, P.grille.lower.h, 0.06, mat( 'trim', { uv: ATLAS.grille } ), { p: [ 0, ly, - ( fm2 - 0.02 ) ] }, 0.02 );
		}
	}
	// plates
	if ( P.plates !== false ) {
		const fy = P.plateY?.[ 0 ] ?? 0.45, ry = P.plateY?.[ 1 ] ?? 0.6;
		const [ , ff ] = spanAt( outline, fy );
		const [ rf ] = spanAt( outline, ry );
		const pm = mat( 'white', { uv: ATLAS.plate, r: 0.35, m: 0.2 } );
		k.quad( [ - 0.155, fy - 0.075, - ( ff + 0.006 ) ], [ 0.155, fy - 0.075, - ( ff + 0.006 ) ], [ 0.155, fy + 0.075, - ( ff + 0.006 ) ], [ - 0.155, fy + 0.075, - ( ff + 0.006 ) ], pm );
		k.quad( [ 0.155, ry - 0.075, - ( rf - 0.006 ) ], [ - 0.155, ry - 0.075, - ( rf - 0.006 ) ], [ - 0.155, ry + 0.075, - ( rf - 0.006 ) ], [ 0.155, ry + 0.075, - ( rf - 0.006 ) ], pm );
	}
	// mirrors
	if ( P.gh && ! P.gh.none && P.mirrors !== false ) {
		const G = P.gh;
		const f = G.ws[ 0 ] - 0.1, y = G.beltY + 0.1;
		for ( const side of [ - 1, 1 ] ) {
			const x = sideX( P, f, P.beltTop ) + 0.1;
			k.beam( [ side * ( x - 0.12 ), y - 0.02, - f ], [ side * ( x - 0.02 ), y, - f - 0.04 ], 0.04, 0.03, MAT.trim );
			k.box( 0.2, 0.13, 0.08, P.mirrorMat ? MAT[ P.mirrorMat ] : MAT.paint, { p: [ side * ( x + 0.04 ), y + 0.02, - f - 0.03 ], r: [ 0, side * 0.12, 0 ] }, 0.035 );
			k.box( 0.17, 0.1, 0.01, MAT.chrome, { p: [ side * ( x + 0.045 ), y + 0.02, - f + 0.015 ], r: [ 0, side * 0.12, 0 ] } );
		}
	}
	// exhaust
	if ( P.exhaust !== false ) {
		const [ rf ] = spanAt( outline, P.bottomY + 0.08 );
		k.cyl( 0.035, 0.035, 0.18, MAT.chrome, { p: [ ( P.exhaustX ?? 0.55 ) * hw, P.bottomY + 0.02, - ( rf - 0.02 ) ], r: [ Math.PI / 2, 0, 0 ] }, 10, true );
	}
	// mud flaps / side skirts / antenna
	if ( P.antenna ) k.rod( [ - hw * 0.5, topAt( outline, P.antenna ) , - P.antenna ], [ - hw * 0.5, topAt( outline, P.antenna ) + 0.5, - P.antenna - 0.08 ], 0.004, MAT.trim, 4 );
}

// ---- interior ---------------------------------------------------------------------------------------

function interior( k, P ) {
	const I = P.interior || {};
	const G = P.gh;
	if ( ! G || G.none || I.none ) return;
	const yb = G.beltY;
	const cowl = G.ws[ 0 ];
	const iw = sideX( P, cowl - 0.4, yb ) - 0.08;
	const dx = P.driverX ?? - 0.37;
	const seatMat = MAT[ I.seat || 'seat' ];
	const dashF = cowl - ( I.dashDepth ?? 0.5 );
	// dashboard: a profile across the cabin
	const dashTop = yb + ( I.dashRise ?? 0.03 );
	const prof = [
		[ cowl + 0.08, yb - 0.02 ], [ cowl - 0.1, dashTop + 0.01 ], [ dashF + 0.12, dashTop ], [ dashF, dashTop - 0.05 ],
		[ dashF - 0.02, yb - 0.2 ], [ dashF + 0.12, P.floorY + 0.25 ], [ cowl, P.floorY + 0.2 ], [ cowl + 0.08, P.floorY + 0.2 ],
	];
	const dg = sideExtrude( prof, iw, { bevel: 0.02, segs: 2, steps: 1 } );
	k.add( toCreasedNormals( dg, 0.6 ), MAT.dash );
	// instrument binnacle
	k.box( 0.42, 0.1, 0.2, MAT.dash, { p: [ dx, dashTop + 0.03, - ( dashF + 0.1 ) ], r: [ 0.15, 0, 0 ] }, 0.04 );
	// gauges (face the driver)
	const gf = dashF + 0.13, gy = dashTop - 0.035;
	k.quad( [ dx - 0.17, gy - 0.055, - gf ], [ dx + 0.17, gy - 0.055, - gf ], [ dx + 0.17, gy + 0.055, - gf - 0.02 ], [ dx - 0.17, gy + 0.055, - gf - 0.02 ], mat( 'gauge', { uv: ATLAS.gauges } ) );
	// centre stack with a screen and vents
	k.box( 0.26, 0.26, 0.1, MAT.dash, { p: [ 0, yb - 0.12, - ( dashF + 0.02 ) ], r: [ - 0.2, 0, 0 ] }, 0.02 );
	k.box( 0.2, 0.12, 0.012, MAT.gloss, { p: [ 0, yb - 0.08, - ( dashF - 0.03 ) ], r: [ - 0.2, 0, 0 ] }, 0.004 );
	for ( const s of [ - 1, 1 ] ) k.box( 0.12, 0.04, 0.02, mat( 'trim', { uv: ATLAS.vents } ), { p: [ s * 0.52 * iw, dashTop - 0.06, - ( dashF - 0.01 ) ] }, 0.008 );
	// console between the seats
	const seatF = P.seatF ?? ( cowl - 0.95 );
	k.box( 0.2, 0.2, 0.7, MAT.dash, { p: [ 0, P.floorY + 0.1, - ( seatF + 0.15 ) ] }, 0.03 );
	if ( ! I.noShifter ) {
		k.rod( [ 0, P.floorY + 0.2, - ( seatF + 0.35 ) ], [ 0, P.floorY + 0.32, - ( seatF + 0.38 ) ], 0.01, MAT.chrome, 6 );
		k.sphere( 0.028, MAT.gloss, { p: [ 0, P.floorY + 0.33, - ( seatF + 0.38 ) ] }, 10, 8 );
	}
	// steering column (the wheel itself is its own mesh)
	const sw = P.steer = P.steer || { x: dx, y: yb - 0.02, f: dashF - 0.18, tilt: 0.42, r: 0.19 };
	k.rod( [ sw.x, sw.y - 0.06, - ( dashF + 0.1 ) ], [ sw.x, sw.y - 0.02, - ( sw.f + 0.06 ) ], 0.035, MAT.dash, 10 );
	// pedals
	for ( const px of [ - 0.08, 0.08 ] ) k.box( 0.06, 0.09, 0.02, MAT.rubber, { p: [ dx + px, P.floorY + 0.12, - ( cowl - 0.12 ) ], r: [ - 0.5, 0, 0 ] } );
	// front seats
	const hipY = P.hipY ?? ( P.floorY + 0.22 );
	const seats = P.seatRows ?? [ { f: seatF, xs: [ dx, - dx ] } ];
	for ( const row of seats ) {
		for ( const sx of row.xs ) seat( k, sx, hipY + ( row.dy || 0 ), row.f, seatMat, row.bench ? null : 0.5, row.noHead );
		if ( row.bench ) bench( k, row.bench, hipY + ( row.dy || 0 ), row.f, seatMat );
	}
	// rear shelf (sedan) / cargo floor
	if ( I.shelf ) k.box( iw * 2, 0.02, I.shelf[ 1 ], MAT.carpet, { p: [ 0, I.shelf[ 2 ], - I.shelf[ 0 ] ] } );
	// interior mirror and sun visors
	k.box( 0.22, 0.06, 0.03, MAT.trim, { p: [ 0, G.roofY - 0.12, - ( G.ws[ 1 ] - 0.1 ) ] }, 0.015 );
	for ( const s of [ - 1, 1 ] ) k.box( 0.36, 0.015, 0.16, MAT.headliner, { p: [ s * 0.34, G.roofY - 0.07, - ( G.ws[ 1 ] - 0.1 ) ], r: [ 0.1, 0, 0 ] }, 0.005 );
}

export function seat( k, x, hipY, f, m, width = 0.5, noHead = false ) {
	// cushion, backrest, headrest (leaning back ~ 16 degrees)
	k.box( width, 0.12, 0.5, m, { p: [ x, hipY - 0.04, - ( f + 0.08 ) ], r: [ 0.08, 0, 0 ] }, 0.05 );
	k.box( width * 0.96, 0.66, 0.13, m, { p: [ x, hipY + 0.3, - ( f - 0.2 ) ], r: [ - 0.28, 0, 0 ] }, 0.06 );
	for ( const s of [ - 1, 1 ] ) k.box( 0.06, 0.5, 0.16, m, { p: [ x + s * width * 0.46, hipY + 0.22, - ( f - 0.19 ) ], r: [ - 0.28, 0, 0 ] }, 0.03 );
	if ( ! noHead ) {
		k.box( 0.26, 0.18, 0.1, m, { p: [ x, hipY + 0.72, - ( f - 0.33 ) ], r: [ - 0.2, 0, 0 ] }, 0.045 );
		for ( const s of [ - 0.07, 0.07 ] ) k.rod( [ x + s, hipY + 0.6, - ( f - 0.31 ) ], [ x + s, hipY + 0.66, - ( f - 0.33 ) ], 0.006, MAT.chrome, 4 );
	}
	k.box( width * 0.8, 0.08, 0.4, MAT.darksteel, { p: [ x, hipY - 0.14, - ( f + 0.06 ) ] } );
}

export function bench( k, w, hipY, f, m ) {
	k.box( w, 0.14, 0.48, m, { p: [ 0, hipY - 0.03, - ( f + 0.08 ) ], r: [ 0.08, 0, 0 ] }, 0.05 );
	k.box( w, 0.6, 0.14, m, { p: [ 0, hipY + 0.28, - ( f - 0.2 ) ], r: [ - 0.25, 0, 0 ] }, 0.06 );
}

// ---- wheels ------------------------------------------------------------------------------------------

// a wheel centred at the origin, axle along x, the outer face towards +x
export function wheelKit( R, W, style = 'alloy', opts = {} ) {
	const k = new Kit();
	const rimR = opts.rimR ?? R * 0.64;
	const hw = W / 2;
	// tyre: lathe around the axle (lathe axis = y, rotated to x)
	const sh = Math.min( 0.035, W * 0.18 ); // shoulder radius
	const prof = [
		[ rimR * 0.98, - hw * 0.86 ], [ rimR + 0.02, - hw * 0.98 ], [ ( rimR + R ) / 2, - hw * 1.02 ], [ R - sh, - hw * 0.98 ], [ R - sh * 0.3, - hw + sh * 0.6 ],
		[ R, - hw + sh ], [ R, hw - sh ], [ R - sh * 0.3, hw - sh * 0.6 ], [ R - sh, hw * 0.98 ], [ ( rimR + R ) / 2, hw * 1.02 ], [ rimR + 0.02, hw * 0.98 ], [ rimR * 0.98, hw * 0.86 ],
	];
	const tyreRot = { r: [ 0, 0, - Math.PI / 2 ] };
	const lg = new THREE.LatheGeometry( prof.map( p => new THREE.Vector2( p[ 0 ], p[ 1 ] ) ), 32 );
	k.add( toCreasedNormals( lg, 0.9 ), opts.tread ? mat( 'tread', { uv: ATLAS.tread } ) : MAT.rubber, tyreRot );
	// rim barrel (seen through the spokes)
	k.cyl( rimR * 0.97, rimR * 0.97, W * 0.82, style === 'steel' ? ( opts.paintRim ? MAT.paint : MAT.steel ) : MAT.darksteel, { r: [ 0, 0, Math.PI / 2 ] }, 24, true );
	const face = hw * 0.62;
	const rm = style === 'chrome' ? MAT.chrome : style === 'black' ? mat( 'darksteel', { c: 0x1a1a1a, r: 0.35 } ) : style === 'steel' ? ( opts.paintRim ? MAT.paint : mat( 'steel', { c: 0x9a9da0 } ) ) : MAT.alu;
	// lip
	k.torus( rimR * 0.98, 0.012, rm, { p: [ face + 0.01, 0, 0 ], r: [ 0, Math.PI / 2, 0 ] }, 6, 32 );
	if ( style === 'steel' ) {
		// dished steel disc with holes suggested by darker pads
		k.lathe( [ [ 0.01, face - 0.05 ], [ rimR * 0.35, face - 0.03 ], [ rimR * 0.55, face - 0.01 ], [ rimR * 0.97, face ] ], rm, { r: [ 0, 0, - Math.PI / 2 ] }, 24 );
		for ( let i = 0; i < 6; i ++ ) {
			const a = i / 6 * Math.PI * 2;
			k.cyl( rimR * 0.1, rimR * 0.1, 0.01, MAT.gloss, { p: [ face - 0.015, Math.cos( a ) * rimR * 0.62, Math.sin( a ) * rimR * 0.62 ], r: [ 0, 0, Math.PI / 2 ] }, 10 );
		}
		k.cyl( rimR * 0.28, rimR * 0.3, 0.06, MAT.darksteel, { p: [ face - 0.02, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 14 );
	} else {
		const n = opts.spokes ?? 5;
		for ( let i = 0; i < n; i ++ ) {
			const a = i / n * Math.PI * 2;
			for ( const off of opts.split ? [ - 0.1, 0.1 ] : [ 0 ] ) {
				const aa = a + off;
				k.beam( [ face - 0.01, Math.cos( aa ) * rimR * 0.2, Math.sin( aa ) * rimR * 0.2 ], [ face - 0.035, Math.cos( aa ) * rimR * 0.95, Math.sin( aa ) * rimR * 0.95 ], 0.03, opts.split ? 0.03 : 0.055, rm, [ 1, 0, 0 ], 0.01 );
			}
		}
		k.cyl( rimR * 0.24, rimR * 0.26, 0.05, rm, { p: [ face - 0.005, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 16 );
		k.cyl( rimR * 0.09, rimR * 0.09, 0.02, MAT.gloss, { p: [ face + 0.02, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 12 );
	}
	// brake disc and caliper
	if ( opts.brakes !== false ) {
		k.cyl( rimR * 0.78, rimR * 0.78, 0.025, mat( 'steel', { c: 0x6c6c6c, r: 0.4 } ), { p: [ face - 0.09, 0, 0 ], r: [ 0, 0, Math.PI / 2 ] }, 24 );
		k.box( 0.05, rimR * 0.5, 0.1, opts.caliper ? mat( 'gloss', { c: opts.caliper } ) : MAT.darksteel, { p: [ face - 0.07, rimR * 0.55, - rimR * 0.3 ], r: [ 0.5, 0, 0 ] }, 0.015 );
	}
	return k;
}

// the steering wheel, centred at the origin in its own plane (x right, y up, facing -z)
export function steeringKit( r = 0.19, style = 'car' ) {
	const k = new Kit();
	const m = style === 'wood' ? MAT.wood : MAT.gloss;
	k.torus( r, 0.018, m, null, 8, 32 );
	const spokes = style === 'bus' ? [ 0, Math.PI ] : [ - Math.PI / 2, 0.15, Math.PI - 0.15 ];
	for ( const a of spokes ) k.beam( [ 0, 0, 0 ], [ Math.cos( a ) * r, Math.sin( a ) * r, 0 ], 0.04, 0.015, MAT.gloss );
	k.cyl( 0.06, 0.07, 0.05, MAT.trim, { r: [ Math.PI / 2, 0, 0 ] }, 14 );
	return k;
}
