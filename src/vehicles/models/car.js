// Road vehicle assembly: the lofted shell (shell.js), the details placed on it with ray probes (lamps,
// grille, bumpers, plates, mirrors, handles, panel gaps, wipers, well liners), the cabin (dashboard with
// lit gauges, seats, console, steering column) and the wheels.
import * as THREE from 'three';
import { Kit, MAT, mat, lerp, sideExtrude } from '../kit.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATLAS } from '../materials.js';
import { Shell, makeProbe } from './shell.js';
import { wheelKit, farWheelKit, steeringKit, seat, bench } from './parts.js';

const V3 = THREE.Vector3;
const UP = new V3( 0, 1, 0 );

// basis for a part sitting on a surface: local -z along the outward normal, local y as close to up as it gets
export function surfFrame( point, n, up = UP ) {
	const z = new V3( ...n ).negate().normalize();
	const u = up.clone ? up.clone() : new V3( ...up );
	if ( Math.abs( u.dot( z ) ) > 0.95 ) u.set( 0, 0, - 1 );
	const y = u.addScaledVector( z, - u.dot( z ) ).normalize();
	const x = new V3().crossVectors( y, z );
	return new THREE.Matrix4().makeBasis( x, y, z ).setPosition( ...point );
}
const local = ( M, t ) => {
	const L = new THREE.Matrix4().compose( new V3( ...( t.p || [ 0, 0, 0 ] ) ), new THREE.Quaternion().setFromEuler( new THREE.Euler( ...( t.r || [ 0, 0, 0 ] ) ) ), new V3( ...( Array.isArray( t.s ) ? t.s : [ t.s ?? 1, t.s ?? 1, t.s ?? 1 ] ) ) );
	return M.clone().multiply( L );
};

export class CarBuilder {
	constructor( P ) {
		this.P = P;
		this.shell = new Shell( P );
		this.k = new Kit();
		this.glass = new Kit();
		this.fk = new Kit(); // far
	}

	build() {
		const P = this.P, sh = this.shell, k = this.k;
		sh.lowerBody( k, false );
		sh.greenhouse( k, this.glass, false );
		sh.lowerBody( this.fk, true );
		const fg = new Kit();
		sh.greenhouse( this.fk, fg, true );
		for ( const p of fg.parts ) this.fk.parts.push( p );
		// probes against the shell (before the details go on)
		const body = k.build();
		const gl = this.glass.parts.length ? this.glass.build() : null;
		this.probe = makeProbe( [ body, gl ] );
		this.probeBody = makeProbe( [ body ] );
		this.meta = { doors: [], lamps: {} };
		const before = k.parts.length;
		this.wellLiners();
		this.lamps();
		this.grille();
		this.bumpers();
		this.plates();
		this.mirrors();
		this.doorsAndGaps();
		this.wipers();
		this.misc();
		if ( P.extra ) P.extra( this );
		// the details that matter from afar go into the far model too
		for ( let i = before; i < k.parts.length; i ++ ) if ( k.parts[ i ].tag !== 'near' && k.parts[ i ].far ) this.fk.parts.push( k.parts[ i ] );
		k.with( 'near', () => this.interior() );
		body.dispose();
		return this;
	}

	// mark parts added by fn as also belonging to the far model
	far( fn ) { const n = this.k.parts.length; fn(); for ( let i = n; i < this.k.parts.length; i ++ ) this.k.parts[ i ].far = true; }

	hitFront( x, y ) { return this.probeBody( [ x, y, - ( this.P.front + 1 ) ], [ 0, 0, 1 ] ); }
	hitRear( x, y ) { return this.probeBody( [ x, y, - ( this.P.rear - 1 ) ], [ 0, 0, - 1 ] ); }
	hitSide( f, y, side = 1 ) { return this.probeBody( [ side * ( this.P.W / 2 + 1 ), y, - f ], [ - side, 0, 0 ] ); }
	hitTop( x, f ) { return this.probeBody( [ x, 4, - f ], [ 0, - 1, 0 ] ); }

	// ---- wheel wells: dark liners over each tyre ----
	wellLiners() {
		const P = this.P, sh = this.shell, k = this.k;
		const R = sh.archR - 0.012, cy = sh.cy;
		for ( const a of sh.axles ) {
			const yb = sh.fYB( a );
			const dy = cy - yb;
			if ( dy >= R ) continue;
			const phi0 = Math.asin( Math.max( - 1, - dy / R ) );
			for ( const side of [ - 1, 1 ] ) {
				const x0 = sh.xWell, x1 = sh.frame( a ).hwb - 0.02;
				k.grid( ( u, v ) => {
					const ph = phi0 + ( Math.PI - 2 * phi0 ) * v;
					return [ side * lerp( x0, x1, u ), cy + R * Math.sin( ph ), - ( a + R * Math.cos( ph ) ) ];
				}, 2, 12, MAT.under );
				// inner wall of the well
				k.grid( ( u, v ) => {
					const ph = phi0 + ( Math.PI - 2 * phi0 ) * v;
					return [ side * x0, lerp( yb, cy + R * Math.sin( ph ), u ), - ( a + R * Math.cos( ph ) ) ];
				}, 1, 12, MAT.under );
			}
		}
	}

	// ---- surface patches: lamps, grilles and badges that follow the body's curvature ----

	// sample the body over a rounded rectangle seen from one side and lay a skin over it, `off` above the paint.
	// face: 'front' | 'rear' | 'right' | 'left' | 'top'; (cx, cy) centre in that view (x or f across, y or f up)
	// opts: { round (0 rectangle .. 1 ellipse), slant (rad), nu, nv, uv: [u0,v0,u1,v1] atlas rect, mirror }
	patch( face, cx, cy, w, h, off, m, opts = {} ) {
		const nu = opts.nu ?? 10, nv = opts.nv ?? 5, rnd = opts.round ?? 0.25, sl = opts.slant ?? 0;
		const cs = Math.cos( sl ), sn = Math.sin( sl );
		const grid = [];
		for ( let j = 0; j <= nv; j ++ ) {
			const row = [];
			for ( let i = 0; i <= nu; i ++ ) {
				const a = i / nu * 2 - 1, b = j / nv * 2 - 1;
				// square -> rounded rectangle / ellipse
				const x = a * lerp( 1, Math.sqrt( 1 - b * b / 2 ), rnd ), y = b * lerp( 1, Math.sqrt( 1 - a * a / 2 ), rnd );
				let u = x * w / 2, v = y * h / 2;
				[ u, v ] = [ u * cs - v * sn, u * sn + v * cs ];
				const hit = this.faceHit( face, cx + u, cy + v );
				row.push( hit ? { p: new V3( ...hit.point ).addScaledVector( new V3( ...hit.normal ), off ), uv: [ i / nu, j / nv ] } : null );
			}
			grid.push( row );
		}
		const pos = [], uvs = [];
		const U = opts.uv;
		const mapUV = ( t ) => U ? [ U[ 0 ] + ( U[ 2 ] - U[ 0 ] ) * ( opts.mirror ? 1 - t[ 0 ] : t[ 0 ] ), U[ 1 ] + ( U[ 3 ] - U[ 1 ] ) * t[ 1 ] ] : t;
		for ( let j = 0; j < nv; j ++ ) for ( let i = 0; i < nu; i ++ ) {
			const a = grid[ j ][ i ], b = grid[ j ][ i + 1 ], c = grid[ j + 1 ][ i + 1 ], d = grid[ j + 1 ][ i ];
			if ( ! a || ! b || ! c || ! d ) continue;
			for ( const q of [ a, b, c, a, c, d ] ) { pos.push( ...q.p.toArray() ); uvs.push( ...mapUV( q.uv ) ); }
		}
		if ( ! pos.length ) return null;
		let g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
		g.computeVertexNormals();
		// face the winding outwards (the hit normal side)
		const n0 = new V3( ...this.faceDir( face ) ).negate();
		const e1 = new V3( pos[ 3 ] - pos[ 0 ], pos[ 4 ] - pos[ 1 ], pos[ 5 ] - pos[ 2 ] ), e2 = new V3( pos[ 6 ] - pos[ 0 ], pos[ 7 ] - pos[ 1 ], pos[ 8 ] - pos[ 2 ] );
		if ( e1.cross( e2 ).dot( n0 ) < 0 ) {
			const P = g.attributes.position.array, T = g.attributes.uv.array;
			for ( let t = 0; t < P.length; t += 9 ) for ( let q = 0; q < 3; q ++ ) { const x = P[ t + 3 + q ]; P[ t + 3 + q ] = P[ t + 6 + q ]; P[ t + 6 + q ] = x; }
			for ( let t = 0; t < T.length; t += 6 ) for ( let q = 0; q < 2; q ++ ) { const x = T[ t + 2 + q ]; T[ t + 2 + q ] = T[ t + 4 + q ]; T[ t + 4 + q ] = x; }
			g.computeVertexNormals();
		}
		return this.k.add( g, U ? Object.assign( {}, m, { uv: [ 0, 0, 1, 1 ] } ) : m );
	}

	faceDir( face ) { return { front: [ 0, 0, 1 ], rear: [ 0, 0, - 1 ], right: [ - 1, 0, 0 ], left: [ 1, 0, 0 ], top: [ 0, - 1, 0 ] }[ face ]; }
	faceHit( face, a, b ) {
		const P = this.P;
		if ( face === 'front' ) return this.hitFront( a, b );
		if ( face === 'rear' ) return this.hitRear( a, b );
		if ( face === 'right' ) return this.hitSide( a, b, 1 );
		if ( face === 'left' ) return this.hitSide( a, b, - 1 );
		return this.hitTop( a, b );
	}

	// ---- lamps ----
	lamps() {
		const P = this.P, L = P.lamps || {};
		const k = this.k;
		if ( L.head ) for ( const side of [ - 1, 1 ] ) this.far( () => this.lamp( 'front', L.head, side, 'head' ) );
		if ( L.tail ) for ( const side of [ - 1, 1 ] ) this.far( () => this.lamp( 'rear', L.tail, side, 'tail' ) );
		// third brake light at the top of the rear window
		if ( L.third && P.gh ) {
			const f = P.gh.roof[ 1 ] + 0.05;
			const y = pchipRoof( P, f ) - 0.045;
			k.box( 0.3, 0.028, 0.03, MAT.tail, { p: [ 0, y, - f ] }, 0.008 );
		}
		// side repeaters on the front fenders
		if ( L.repeater !== false && L.head ) for ( const side of [ - 1, 1 ] ) {
			const f = P.axleF + ( this.shell.archR ) + 0.1;
			const y = this.shell.frame( f ).sh + 0.01;
			this.patch( side > 0 ? 'right' : 'left', f, y, 0.06, 0.022, 0.003, side < 0 ? MAT.indL : MAT.indR, { round: 0.8, nu: 3, nv: 1 } );
		}
	}

	// one lamp on the front or rear face: black surround, lens, and its inner detail (projectors, reverse and indicator sections)
	lamp( face, D, side, kind ) {
		const k = this.k;
		const cx = side * D.x, cy = D.y, w = D.w, h = D.h;
		const outer = side * ( face === 'front' ? 1 : - 1 ); // +1 when the lamp's outer end is the viewer's local +x direction
		const slant = ( D.slant ?? 0 ) * side;
		const style = D.style || 'rect';
		const lens = kind === 'head' ? MAT.head : MAT.tail;
		const meta = ( this.meta.lamps[ kind ] ||= [] );
		const c = this.faceHit( face, cx, cy );
		if ( c ) meta.push( c.point );
		if ( style === 'round' || style === 'twin_round' ) {
			const cs = style === 'twin_round' ? [ - w / 4, w / 4 ] : [ 0 ];
			const r0 = ( style === 'twin_round' ? Math.min( h, w / 2 - 0.02 ) : h ) / 2;
			for ( const dx of cs ) {
				const x = cx + dx * side;
				this.patch( face, x, cy, r0 * 2 + 0.05, r0 * 2 + 0.05, 0.004, D.bezel === 'paint' ? MAT.paint : MAT.chrome, { round: 1, nu: 16, nv: 8 } );
				// (a chrome reflector round the bulb, drawn in the decal atlas)
				this.patch( face, x, cy, r0 * 2, r0 * 2, 0.009, lens, { round: 1, nu: 16, nv: 8, uv: kind === 'head' ? ATLAS.headRound : undefined } );
			}
			if ( kind === 'head' && D.ind !== false ) this.patch( face, cx + side * ( w / 2 + 0.07 ), cy - h * 0.15, 0.08, 0.04, 0.006, side < 0 ? MAT.indL : MAT.indR, { round: 0.5, nu: 4, nv: 2 } );
			if ( kind === 'tail' && D.rev !== false ) this.patch( face, cx - side * ( w / 2 + 0.06 ), cy, 0.07, 0.07, 0.006, MAT.reverse, { round: 1, nu: 6, nv: 3 } );
			return;
		}
		const rnd = D.round ?? 0.35;
		this.patch( face, cx, cy, w + 0.025, h + 0.025, 0.004, MAT.gloss, { round: rnd, slant } );
		// the lens: a detailed lamp unit from the decal atlas (reflectors, projector, LED strip; red bars at the back),
		// its outer end outwards on both sides
		const U = kind === 'head' ? ATLAS.headlamp : h > w * 1.3 ? ATLAS.tailV : ATLAS.tailH;
		this.patch( face, cx, cy, w, h, 0.008, lens, { round: rnd, slant, nu: 12, nv: 4, uv: U, mirror: side < 0 } );
		if ( kind === 'head' ) {
			if ( D.ind !== false ) this.patch( face, cx + side * w * 0.4, cy - h * 0.05, w * 0.12, h * 0.5, 0.011, side < 0 ? MAT.indL : MAT.indR, { round: 0.3, nu: 3, nv: 2, slant } );
		} else {
			if ( D.rev !== false ) this.patch( face, cx - side * w * 0.26, cy - h * 0.12, w * 0.32, h * 0.42, 0.011, MAT.reverse, { round: 0.3, nu: 3, nv: 2 } );
			if ( D.ind !== false ) this.patch( face, cx + side * w * 0.26, cy + h * 0.2, w * 0.3, h * 0.3, 0.011, side < 0 ? MAT.indL : MAT.indR, { round: 0.3, nu: 3, nv: 2 } );
		}
		void outer;
	}

	// ---- grille and intakes ----
	grille() {
		const P = this.P, Gr = P.grille;
		if ( ! Gr ) return;
		const k = this.k;
		const gm = mat( 'trim', { uv: ATLAS.grille } );
		this.far( () => {
			if ( Gr.frame === 'chrome' || Gr.frame === 'paint' ) this.patch( 'front', 0, Gr.y, Gr.w + 0.024, Gr.h + 0.024, 0.004, Gr.frame === 'chrome' ? MAT.chrome : MAT.paint, { round: Gr.round ?? 0.2 } );
			if ( Gr.style === 'slots' ) {
				const n = Gr.slots ?? 7;
				for ( let i = 0; i < n; i ++ ) this.patch( 'front', ( i - ( n - 1 ) / 2 ) * Gr.w / n, Gr.y, Gr.w / n * 0.52, Gr.h * 0.85, 0.006, MAT.gloss, { round: 0.6, nu: 2, nv: 4 } );
			} else {
				this.patch( 'front', 0, Gr.y, Gr.w, Gr.h, 0.008, gm, { round: Gr.round ?? 0.2, uv: ATLAS.grille, nu: 8, nv: 3 } );
				if ( Gr.style === 'bars' ) {
					const n = Gr.bars ?? 3;
					for ( let i = 0; i < n; i ++ ) this.patch( 'front', 0, Gr.y + ( i - ( n - 1 ) / 2 ) * Gr.h / n, Gr.w * 0.96, Gr.h / ( n * 2.6 ), 0.012, Gr.frame === 'chrome' ? MAT.chrome : MAT.gloss, { round: 0.2, nu: 8, nv: 1 } );
				}
			}
			if ( Gr.badge ) this.patch( 'front', 0, Gr.y, 0.07, 0.045, 0.014, mat( 'chrome', { c: 0xb8bcc2 } ), { round: 1, nu: 8, nv: 4 } );
		} );
		if ( Gr.lower ) {
			const Lw = Gr.lower;
			this.patch( 'front', 0, Lw.y, Lw.w + 0.03, Lw.h + 0.03, 0.004, MAT.gloss, { round: 0.4 } );
			this.patch( 'front', 0, Lw.y, Lw.w, Lw.h, 0.007, gm, { round: 0.4, uv: ATLAS.grille } );
		}
		// fog lamps in the bumper corners
		if ( Gr.fog ) for ( const side of [ - 1, 1 ] ) {
			this.patch( 'front', side * Gr.fog.x, Gr.fog.y, 0.12, 0.08, 0.004, MAT.gloss, { round: 0.6 } );
			this.patch( 'front', side * Gr.fog.x, Gr.fog.y, 0.07, 0.05, 0.008, MAT.head, { round: 1, nu: 8, nv: 4 } );
		}
	}

	// ---- separate bumpers (older cars, trucks) ----
	bumpers() {
		const P = this.P, B = P.bumpers;
		if ( ! B ) return;
		const k = this.k;
		for ( const end of [ 'front', 'rear' ] ) {
			const D = B[ end ];
			if ( ! D ) continue;
			const hit = end === 'front' ? this.hitFront( 0, D.y ) : this.hitRear( 0, D.y );
			if ( ! hit ) continue;
			const dir = end === 'front' ? - 1 : 1;
			const z = hit.point[ 2 ] + dir * ( D.gap ?? 0.02 ) + dir * D.d / 2;
			const m = MAT[ D.mat || 'chrome' ];
			const w = D.w ?? P.W - 0.08;
			this.far( () => {
				k.box( w, D.h, D.d, m, { p: [ 0, D.y, z ] }, Math.min( 0.035, D.h * 0.3 ) );
				// wrap-around ends
				if ( D.wrap !== false ) for ( const s of [ - 1, 1 ] ) k.box( D.d, D.h, 0.3, m, { p: [ s * ( w / 2 - D.d / 2 ), D.y, z - dir * 0.13 ], r: [ 0, s * dir * 0.25, 0 ] }, Math.min( 0.035, D.h * 0.3 ) );
				if ( D.step ) k.box( w * 0.9, 0.03, 0.14, mat( 'trim', { uv: ATLAS.tread } ), { p: [ 0, D.y + D.h / 2 + 0.012, z + dir * 0.02 ] }, 0.01 );
			} );
			if ( D.guard ) k.box( w * 0.6, D.h * 0.5, 0.02, MAT.rubber, { p: [ 0, D.y, z + dir * ( D.d / 2 + 0.005 ) ] }, 0.008 );
		}
	}

	plates() {
		const P = this.P, pl = P.plates || {};
		const pm = mat( 'white', { uv: ATLAS.plate, r: 0.35, m: 0.2 } );
		for ( const [ face, y ] of [ [ 'front', pl.front ], [ 'rear', pl.rear ] ] ) {
			if ( y == null ) continue;
			const bh = this.bumperHit( face, y );
			if ( bh ) {
				const M = surfFrame( bh.point, bh.normal );
				this.far( () => {
					this.k.box( 0.33, 0.17, 0.012, MAT.trim, local( M, { p: [ 0, 0, - 0.002 ] } ), 0.01 );
					this.k.quad( ...quadIn( M, 0.305, 0.152, - 0.0095 ), pm );
				} );
				continue;
			}
			this.far( () => {
				this.patch( face, 0, y, 0.33, 0.17, 0.004, MAT.trim, { round: 0.1, nu: 4, nv: 2 } );
				this.patch( face, 0, y, 0.305, 0.152, 0.009, pm, { round: 0, nu: 4, nv: 2, uv: ATLAS.plate, mirror: face === 'front' } );
			} );
		}
	}

	// the front face of a separate bumper when the plate sits on it
	bumperHit( end, y ) {
		const D = this.P.bumpers?.[ end ];
		if ( ! D || Math.abs( y - D.y ) > D.h / 2 ) return null;
		const hit = end === 'front' ? this.hitFront( 0, D.y ) : this.hitRear( 0, D.y );
		if ( ! hit ) return null;
		const dir = end === 'front' ? - 1 : 1;
		const z = hit.point[ 2 ] + dir * ( ( D.gap ?? 0.02 ) + D.d );
		return { point: [ 0, y, z ], normal: [ 0, 0, dir ] };
	}

	mirrors() {
		const P = this.P, Mi = P.mirror;
		if ( ! Mi ) return;
		const k = this.k;
		for ( const side of [ - 1, 1 ] ) {
			const hit = this.hitSide( Mi.f, Mi.y, side );
			if ( ! hit ) continue;
			const [ x, y, z ] = hit.point;
			const big = Mi.big ?? 1;
			const hm = MAT[ Mi.mat || 'paint' ];
			this.far( () => {
				k.beam( [ x - side * 0.02, y, z ], [ x + side * 0.1 * big, y + 0.02, z + 0.02 ], 0.035, 0.03, MAT.trim, [ 0, 1, 0 ], 0.01 );
				k.box( 0.2 * big, 0.12 * big * ( Mi.tall ?? 1 ), 0.085, hm, { p: [ x + side * 0.17 * big, y + 0.035, z + 0.02 ], r: [ 0, - side * 0.12, 0 ] }, 0.035 );
				k.box( 0.17 * big, 0.095 * big * ( Mi.tall ?? 1 ), 0.01, MAT.chrome, { p: [ x + side * 0.17 * big, y + 0.035, z + 0.064 ], r: [ 0, - side * 0.12, 0 ] } );
			} );
		}
	}

	// dark panel gaps, handles, the fuel filler
	doorsAndGaps() {
		const P = this.P, sh = this.shell, k = this.k;
		const gapM = mat( 'gloss', { c: 0x040405, r: 0.6 } );
		const vline = ( f, y0, y1, side ) => {
			const pts = [];
			for ( let i = 0; i <= 8; i ++ ) { const h = this.hitSide( f, lerp( y0, y1, i / 8 ), side ); if ( h ) pts.push( h ); }
			this.strip( pts, [ 0, 0, 1 ], 0.0045, gapM );
		};
		const hline = ( fa, fb, y, side ) => {
			const pts = [];
			const n = Math.max( 2, Math.round( Math.abs( fa - fb ) / 0.1 ) );
			for ( let i = 0; i <= n; i ++ ) { const h = this.hitSide( lerp( fa, fb, i / n ), y, side ); if ( h ) pts.push( h ); }
			this.strip( pts, [ 0, 1, 0 ], 0.0045, gapM );
		};
		for ( const side of [ - 1, 1 ] ) {
			for ( const [ fa, fb ] of P.doors || [] ) {
				const S = sh.frame( fa );
				const y0 = Math.max( sh.fYB( fa ), sh.archY( fa ) ) + 0.07, y1 = S.ye - 0.012;
				vline( fa, y0, y1, side );
				const Sb = sh.frame( fb );
				vline( fb, Math.max( sh.fYB( fb ), sh.archY( fb ) ) + 0.07, Sb.ye - 0.012, side );
				hline( fa, fb, Math.max( sh.fYB( fa ), sh.fYB( fb ) ) + 0.07, side );
				// handle
				const hf = fb + ( P.handleOff ?? 0.2 );
				const hy = P.handleY ?? ( S.ye - 0.11 );
				const hh = this.hitSide( hf, hy, side );
				if ( hh ) {
					const M = surfFrame( hh.point, hh.normal );
					k.box( 0.16, 0.028, 0.03, MAT[ P.handleMat || 'paint' ], local( M, { p: [ 0, 0, - 0.008 ] } ), 0.012 );
					k.box( 0.12, 0.045, 0.01, gapM, local( M, { p: [ 0, - 0.004, 0.002 ] } ), 0.01 );
				}
				this.meta.doors.push( { f: ( fa + fb ) / 2, side } );
			}
			// sliding door track / extra side lines
			for ( const L of P.sideLines || [] ) hline( L[ 0 ], L[ 1 ], L[ 2 ], side );
		}
		// hood and deck lid gaps across the top, and along their sides
		const topLine = ( f, x0, x1 ) => {
			const pts = [];
			for ( let i = 0; i <= 10; i ++ ) { const h = this.hitTop( lerp( x0, x1, i / 10 ), f ); if ( h ) pts.push( h ); }
			this.strip( pts, [ 0, 0, 1 ], 0.0045, gapM );
		};
		const lenLine = ( x, f0, f1 ) => {
			const pts = [];
			const n = Math.max( 2, Math.round( Math.abs( f0 - f1 ) / 0.08 ) );
			for ( let i = 0; i <= n; i ++ ) { const h = this.hitTop( x, lerp( f0, f1, i / n ) ); if ( h ) pts.push( h ); }
			this.strip( pts, [ 1, 0, 0 ], 0.0045, gapM );
		};
		for ( const key of [ 'hood', 'deck' ] ) {
			const H = P[ key ];
			if ( ! H ) continue;
			const [ fa, fb, hx ] = H;
			const xw = hx ?? sh.frame( ( fa + fb ) / 2 ).xE - 0.12;
			if ( fb != null ) topLine( key === 'hood' ? fb : fa, - xw, xw );
			for ( const s of [ - 1, 1 ] ) lenLine( s * xw, fa, fb );
		}
		// fuel filler door on the rear quarter
		if ( P.fuel ) {
			const hf = this.hitSide( P.fuel.f, P.fuel.y, P.fuel.side ?? 1 );
			if ( hf ) {
				const M = surfFrame( hf.point, hf.normal );
				k.cyl( 0.075, 0.075, 0.006, MAT.paint, local( M, { p: [ 0, 0, - 0.002 ], r: [ Math.PI / 2, 0, 0 ] } ), 20 );
				k.torus( 0.076, 0.003, gapM, local( M, { p: [ 0, 0, - 0.001 ] } ), 4, 24 );
				this.meta.fuel = hf.point;
			}
		}
	}

	// a thin strip along points on the surface (panel gaps): width w across `across` projected on the surface
	strip( hits, across, w, m ) {
		if ( hits.length < 2 ) return;
		const k = this.k;
		const pos = [];
		const A = new V3( ...across );
		const P = hits.map( h => {
			const n = new V3( ...h.normal );
			const p = new V3( ...h.point ).addScaledVector( n, 0.0015 );
			const a = A.clone().addScaledVector( n, - A.dot( n ) ).normalize().multiplyScalar( w / 2 );
			return [ p.clone().sub( a ), p.clone().add( a ) ];
		} );
		for ( let i = 0; i < P.length - 1; i ++ ) {
			const [ a, b ] = P[ i ], [ c, d ] = P[ i + 1 ];
			if ( a.distanceTo( c ) > 0.3 ) continue;
			pos.push( ...a.toArray(), ...c.toArray(), ...d.toArray(), ...a.toArray(), ...d.toArray(), ...b.toArray() );
		}
		if ( ! pos.length ) return;
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.computeVertexNormals();
		k.add( g, m );
	}

	wipers() {
		const P = this.P, G = P.gh;
		if ( ! G || P.noWipers ) return;
		const f = G.belt[ 0 ] + 0.02;
		// the windshield's slope: z gained per metre of rise
		const yb = this.shell.topY( 0, G.belt[ 0 ] ), yr = pchipRoof( P, G.roof[ 0 ] );
		const slope = ( G.belt[ 0 ] - G.roof[ 0 ] ) / Math.max( 0.2, yr - yb );
		for ( const x of P.wiperX || [ - 0.36, 0.16 ] ) {
			const h = this.probe( [ x, 4, - f ], [ 0, - 1, 0 ] );
			if ( ! h ) continue;
			const y = h.point[ 1 ] + 0.015, z = h.point[ 2 ];
			const len = P.wiperLen ?? 0.5, rise = 0.05;
			this.k.cyl( 0.018, 0.018, 0.03, MAT.trim, { p: [ x, y, z ] }, 8 );
			this.k.beam( [ x, y + 0.012, z ], [ x + len, y + rise, z + rise * slope ], 0.012, 0.014, MAT.trim );
			this.k.beam( [ x + 0.05, y + 0.02, z + 0.012 * slope ], [ x + len + 0.02, y + rise + 0.008, z + ( rise + 0.008 ) * slope ], 0.008, 0.02, MAT.rubber );
		}
	}

	misc() {
		const P = this.P, k = this.k;
		// exhaust tip
		if ( P.exhaust !== false ) {
			const x = ( P.exhaustX ?? 0.55 ) * P.W / 2;
			const y = P.body.bottom ? this.shell.fYB( P.rear + 0.3 ) + 0.02 : 0.25;
			const h = this.hitRear( x, y + 0.04 );
			const z = h ? h.point[ 2 ] - 0.02 : - P.rear;
			k.cyl( 0.035, 0.035, 0.22, MAT.chrome, { p: [ x, y, z ], r: [ Math.PI / 2, 0, 0 ] }, 12, true );
			k.cyl( 0.03, 0.03, 0.2, MAT.gloss, { p: [ x, y, z - 0.005 ], r: [ Math.PI / 2, 0, 0 ] }, 10 );
		}
		if ( P.antenna ) {
			const h = this.hitTop( P.antenna[ 0 ], P.antenna[ 1 ] );
			if ( h ) k.rod( h.point, [ h.point[ 0 ], h.point[ 1 ] + 0.55, h.point[ 2 ] + 0.1 ], 0.003, MAT.trim, 4 );
		}
	}

	// ---- the cabin ----
	interior() {
		const P = this.P, I = P.interior || {}, sh = this.shell, k = this.k;
		if ( ! P.gh || I.none ) return;
		const cowl = P.gh.belt[ 0 ];
		const Sd = sh.frame( cowl - 0.35 );
		const well = ( P.wells || [] )[ 0 ];
		const floor = well ? well.floor : 0.3;
		const iw = Sd.xE - Sd.re - ( well?.wall ?? 0.075 ) - 0.005;
		const dx = P.driver?.x ?? - 0.37;
		const dashF = cowl - ( I.dashDepth ?? 0.55 );
		const cowlY = sh.topY( 0, cowl );
		const dashTop = I.dashTop ?? ( Sd.ye + 0.04 );
		const dashMat = MAT[ I.dash || 'dash' ];
		// dashboard: a profile swept across the cabin, its top tucked under the windshield
		const prof = [
			[ cowl + 0.06, cowlY - 0.03 ], [ cowl - 0.12, dashTop + 0.02 ], [ dashF + 0.14, dashTop ], [ dashF, dashTop - 0.06 ],
			[ dashF - 0.02, dashTop - 0.22 ], [ dashF + 0.12, floor + 0.3 ], [ cowl - 0.1, floor + 0.2 ], [ cowl + 0.06, floor + 0.2 ],
		];
		k.add( toCreasedNormals( sideExtrude( prof, iw, { bevel: 0.02, segs: 2, steps: 1 } ), 0.6 ), dashMat );
		// instrument binnacle and the gauges facing the driver
		const gy = dashTop - 0.03, gf = dashF + 0.1;
		k.box( 0.44, 0.1, 0.22, dashMat, { p: [ dx, dashTop + 0.025, - ( dashF + 0.12 ) ], r: [ 0.12, 0, 0 ] }, 0.045 );
		k.quad( [ dx + 0.17, gy - 0.055, - gf ], [ dx - 0.17, gy - 0.055, - gf ], [ dx - 0.17, gy + 0.055, - gf - 0.025 ], [ dx + 0.17, gy + 0.055, - gf - 0.025 ], mat( 'gauge', { uv: ATLAS.gauges } ) );
		// centre stack: screen, vents, controls
		k.box( 0.28, 0.3, 0.1, dashMat, { p: [ 0, dashTop - 0.17, - ( dashF + 0.03 ) ], r: [ - 0.18, 0, 0 ] }, 0.02 );
		k.box( 0.2, 0.11, 0.012, mat( 'gloss', { c: 0x0a0c10, e: 8 } ), { p: [ 0, dashTop - 0.1, - ( dashF - 0.025 ) ], r: [ - 0.18, 0, 0 ] }, 0.004 );
		for ( const s of [ - 1, 1 ] ) k.box( 0.1, 0.04, 0.02, mat( 'trim', { uv: ATLAS.vents } ), { p: [ s * 0.07, dashTop - 0.02, - ( dashF - 0.005 ) ] }, 0.006 );
		for ( const s of [ - 1, 1 ] ) k.box( 0.11, 0.05, 0.02, mat( 'trim', { uv: ATLAS.vents } ), { p: [ s * ( iw - 0.12 ), dashTop - 0.05, - ( dashF + 0.005 ) ] }, 0.008 );
		for ( let i = 0; i < 3; i ++ ) k.cyl( 0.018, 0.018, 0.02, MAT.chrome, { p: [ ( i - 1 ) * 0.06, dashTop - 0.24, - ( dashF + 0.01 ) ], r: [ Math.PI / 2 - 0.18, 0, 0 ] }, 10 );
		// glovebox lid line
		k.box( 0.36, 0.004, 0.01, MAT.gloss, { p: [ - dx, dashTop - 0.2, - ( dashF - 0.03 ) ] } );
		// console between the front seats
		const seatF = P.driver?.f ?? ( cowl - 1.0 );
		if ( ! I.noConsole ) {
			k.box( 0.22, 0.22, 0.75, dashMat, { p: [ 0, floor + 0.11, - ( seatF + 0.12 ) ] }, 0.035 );
			k.box( 0.2, 0.02, 0.3, mat( 'seat', {} ), { p: [ 0, floor + 0.23, - ( seatF - 0.08 ) ] }, 0.01 );
			if ( ! I.noShifter ) {
				k.rod( [ 0, floor + 0.22, - ( seatF + 0.36 ) ], [ 0, floor + 0.33, - ( seatF + 0.4 ) ], 0.01, MAT.chrome, 6 );
				k.sphere( 0.03, MAT.gloss, { p: [ 0, floor + 0.34, - ( seatF + 0.4 ) ] }, 10, 8 );
			}
		}
		// steering column (the wheel itself is its own mesh)
		const S = P.steer = P.steer || {};
		S.x ??= dx; S.tilt ??= 0.42; S.r ??= 0.19;
		S.f ??= dashF - 0.2;
		S.y ??= dashTop - 0.06;
		k.rod( [ S.x, S.y - 0.09, - ( dashF + 0.12 ) ], [ S.x, S.y - 0.015, - ( S.f + 0.05 ) ], 0.04, dashMat, 12 );
		// pedals
		for ( const px of [ - 0.1, 0.02, 0.12 ] ) k.box( 0.06, 0.09, 0.02, MAT.rubber, { p: [ dx + px, floor + 0.13, - ( cowl - 0.12 ) ], r: [ - 0.5, 0, 0 ] } );
		// seats
		const hipY = P.driver?.hipY ?? ( floor + 0.22 );
		const sm = MAT[ I.seat || 'seat' ];
		for ( const row of P.seatRows || [ { f: seatF, xs: [ dx, - dx ] } ] ) {
			for ( const sx of row.xs || [] ) seat( k, sx, hipY + ( row.dy || 0 ), row.f, sm, row.w ?? 0.5, { noHead: row.noHead } );
			if ( row.bench ) bench( k, row.bench, hipY + ( row.dy || 0 ), row.f, sm, 0, { heads: row.heads } );
		}
		// parcel shelf / cargo floor
		if ( I.shelf ) k.box( I.shelf[ 2 ] * 2, 0.02, I.shelf[ 1 ], MAT.carpet, { p: [ 0, I.shelf[ 3 ], - I.shelf[ 0 ] ] } );
		// armrests on the door cards
		for ( const [ fa, fb ] of P.doors || [] ) for ( const s of [ - 1, 1 ] ) {
			const fm = ( fa + fb ) / 2;
			const F = sh.frame( fm );
			const xw = F.xE - F.re - ( well?.wall ?? 0.075 );
			k.box( 0.08, 0.05, ( fa - fb ) * 0.5, MAT.plastic, { p: [ s * ( xw - 0.035 ), floor + 0.42, - fm ] }, 0.015 );
			k.box( 0.02, 0.03, 0.1, MAT.chrome, { p: [ s * ( xw - 0.012 ), F.ye - 0.12, - ( fa - 0.25 ) ] }, 0.006 );
		}
		// interior mirror and sun visors
		const G = P.gh;
		const ry = pchipRoof( P, G.roof[ 0 ] - 0.1 );
		k.box( 0.24, 0.065, 0.03, MAT.trim, { p: [ 0, ry - 0.13, - ( G.roof[ 0 ] - 0.12 ) ], r: [ 0.15, 0, 0 ] }, 0.015 );
		k.rod( [ 0, ry - 0.03, - ( G.roof[ 0 ] - 0.1 ) ], [ 0, ry - 0.1, - ( G.roof[ 0 ] - 0.11 ) ], 0.008, MAT.trim, 6 );
		for ( const s of [ - 1, 1 ] ) k.box( 0.36, 0.015, 0.16, MAT.headliner, { p: [ s * 0.35, ry - 0.06, - ( G.roof[ 0 ] - 0.12 ) ], r: [ 0.12, 0, 0 ] }, 0.005 );
	}

	// ---- output ----
	result() {
		const P = this.P;
		const W = P.wheel || {};
		const wheelGeo = wheelKit( P.wheelR, P.wheelW, W.style || 'alloy', W ).build();
		const farWheel = farWheelKit( P.wheelR, P.wheelW, W.style || 'alloy' ).build();
		const axles = P.axles || [ P.axleR, P.axleF ];
		const front = Math.max( ...axles ), rearMost = Math.min( ...axles );
		const wheels = [];
		for ( const af of axles ) for ( const side of [ - 1, 1 ] ) {
			const x = side * ( P.track / 2 ) + ( W.dually && af === rearMost ? 0 : 0 );
			wheels.push( { x, y: P.wheelR, z: - af, R: P.wheelR, W: P.wheelW, side, steer: af === front ? 1 : 0, front: af === front, driven: true } );
		}
		for ( const w of wheels ) this.fk.addBuilt( farWheel, { p: [ w.x, w.y, w.z ], s: [ w.side, 1, 1 ] } );
		const near = this.k.build();
		const far = this.fk.build();
		const glass = this.glass.parts.length ? this.glass.build() : null;
		const steering = P.steer ? steeringKit( P.steer.r, P.steerStyle || 'car' ).build() : null;
		near.computeBoundingBox();
		const bounds = near.boundingBox.clone();
		bounds.min.y = 0;
		return { P, near, far, glass, wheelGeo, wheels, steering, bounds, parts: this.parts || [], meta: this.meta };
	}
}

// roof edge height at f (from the greenhouse keys)
export function pchipRoof( P, f ) {
	const keys = typeof P.gh.y === 'number' ? [ [ 0, P.gh.y ] ] : P.gh.y;
	// nearest-key linear interpolation is enough for placing small parts
	const s = keys.slice().sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
	if ( f <= s[ 0 ][ 0 ] ) return s[ 0 ][ 1 ];
	for ( let i = 0; i < s.length - 1; i ++ ) if ( f <= s[ i + 1 ][ 0 ] ) return lerp( s[ i ][ 1 ], s[ i + 1 ][ 1 ], ( f - s[ i ][ 0 ] ) / ( s[ i + 1 ][ 0 ] - s[ i ][ 0 ] ) );
	return s[ s.length - 1 ][ 1 ];
}

// corners of a w x h quad centred in a surface frame at local depth z (facing out along -z), readable from outside
export function quadIn( M, w, h, z, flip = false ) {
	const c = ( x, y ) => new V3( x, y, z ).applyMatrix4( M ).toArray();
	const s = flip ? - 1 : 1;
	// local x runs to the part's right seen from inside; from outside the reader's right is -x
	return [ c( s * w / 2, - h / 2 ), c( - s * w / 2, - h / 2 ), c( - s * w / 2, h / 2 ), c( s * w / 2, h / 2 ) ];
}

export function buildCar( P ) { return new CarBuilder( P ).build().result(); }
