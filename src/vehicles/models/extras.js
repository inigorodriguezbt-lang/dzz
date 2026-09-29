// Type-specific add-ons for the road vehicles, called from a model's `extra( builder )`:
// police lightbar and push bar, roof rails, fender flares, rock rails, spare wheel, spoiler, pickup bed
// walls, bus doors and signs, a Humvee turret ring, liveries laid on the body as surface patches.
import * as THREE from 'three';
import { MAT, mat, lerp } from '../kit.js';
import { ATLAS } from '../materials.js';
import { wheelKit } from './parts.js';
import { pchipRoof } from './car.js';

// roof bar with red / blue lenses (emissive channels 6 / 7), clear takedown lamps and alley lights
export function lightbar( b, o = {} ) {
	const k = b.k, P = b.P;
	const f = o.f ?? ( P.gh.roof[ 0 ] + P.gh.roof[ 1 ] ) / 2 + 0.15;
	const hit = b.hitTop( 0, f );
	if ( ! hit ) return;
	const y = hit.point[ 1 ], z = hit.point[ 2 ];
	const w = o.w ?? 1.22;
	b.far( () => {
		// feet and base
		for ( const s of [ - 1, 1 ] ) k.box( 0.08, 0.05, 0.2, MAT.darksteel, { p: [ s * w * 0.4, y + 0.02, z ] }, 0.01 );
		k.box( w, 0.035, 0.28, mat( 'gloss', { c: 0x0c0c0e } ), { p: [ 0, y + 0.06, z ] }, 0.015 );
		// lens segments: red on the driver side, blue on the passenger side, clear in the middle
		const seg = 6;
		for ( let i = 0; i < seg; i ++ ) {
			const x = ( i - ( seg - 1 ) / 2 ) * w / seg;
			const m = i < 2 ? MAT.red : i >= seg - 2 ? MAT.blue : mat( 'head', { c: 0xf2f4ff } );
			k.box( w / seg - 0.01, 0.065, 0.26, m, { p: [ x, y + 0.11, z ] }, 0.018 );
		}
		k.box( w + 0.01, 0.012, 0.29, mat( 'gloss', { c: 0x0c0c0e } ), { p: [ 0, y + 0.148, z ] }, 0.005 );
	} );
}

// steel push bumper in front of the grille
export function pushBar( b, o = {} ) {
	const k = b.k;
	const hit = b.hitFront( 0, o.y ?? 0.55 );
	if ( ! hit ) return;
	const z = hit.point[ 2 ] - ( o.gap ?? 0.12 );
	const m = mat( 'darksteel', { c: 0x151516, r: 0.5 } );
	const w = o.w ?? 0.9, y0 = o.y0 ?? 0.3, y1 = o.y1 ?? 0.82;
	b.far( () => {
		for ( const s of [ - 1, 1 ] ) {
			k.box( 0.07, y1 - y0, 0.06, m, { p: [ s * w / 2, ( y0 + y1 ) / 2, z ] }, 0.015 );
			k.box( 0.06, 0.06, 0.2, m, { p: [ s * w / 2, y0 + 0.12, z + 0.1 ] }, 0.01 );
		}
		for ( const y of [ y0 + 0.08, ( y0 + y1 ) / 2 + 0.05, y1 - 0.03 ] ) k.box( w + 0.07, 0.06, 0.06, m, { p: [ 0, y, z ] }, 0.015 );
		k.box( w * 0.7, 0.03, 0.04, MAT.rubber, { p: [ 0, ( y0 + y1 ) / 2 + 0.05, z - 0.035 ] }, 0.01 );
	} );
}

export function spotLamp( b, side = - 1 ) {
	const P = b.P, k = b.k;
	const f = P.gh.belt[ 0 ] - 0.12;
	const hit = b.hitSide( f, P.gh.y[ 0 ][ 1 ] - 0.45, side );
	if ( ! hit ) return;
	const [ x, y, z ] = hit.point;
	k.rod( [ x, y - 0.1, z ], [ x + side * 0.05, y + 0.02, z ], 0.012, MAT.chrome, 8 );
	k.cyl( 0.06, 0.07, 0.12, MAT.chrome, { p: [ x + side * 0.07, y + 0.05, z - 0.02 ], r: [ Math.PI / 2, 0, 0 ] }, 16 );
	k.cyl( 0.055, 0.055, 0.01, MAT.head, { p: [ x + side * 0.07, y + 0.05, z - 0.085 ], r: [ Math.PI / 2, 0, 0 ] }, 16 );
}

// side rails along the roof edges with cross bars
export function roofRails( b, o = {} ) {
	const k = b.k, P = b.P, G = P.gh;
	const f0 = o.f0 ?? G.roof[ 0 ] - 0.25, f1 = o.f1 ?? G.roof[ 1 ] + 0.15;
	const x = o.x ?? 0.52;
	b.far( () => {
		for ( const s of [ - 1, 1 ] ) {
			const pts = [];
			for ( let i = 0; i <= 6; i ++ ) { const f = lerp( f0, f1, i / 6 ); const h = b.hitTop( s * x, f ); if ( h ) pts.push( [ h.point[ 0 ], h.point[ 1 ] + 0.045, h.point[ 2 ] ] ); }
			for ( let i = 0; i < pts.length - 1; i ++ ) k.beam( pts[ i ], pts[ i + 1 ], 0.035, 0.03, o.mat ? MAT[ o.mat ] : mat( 'alu', { c: 0x2a2b2d, r: 0.5, m: 0.6 } ), [ 0, 1, 0 ], 0.01 );
			for ( const p of [ pts[ 0 ], pts[ pts.length - 1 ] ] ) if ( p ) k.box( 0.05, 0.05, 0.08, MAT.trim, { p: [ p[ 0 ], p[ 1 ] - 0.025, p[ 2 ] ] }, 0.012 );
		}
		if ( o.bars ) for ( const f of o.bars ) {
			const h = b.hitTop( 0, f );
			if ( h ) k.box( x * 2 + 0.04, 0.025, 0.04, mat( 'alu', { c: 0x2a2b2d, r: 0.5, m: 0.6 } ), { p: [ 0, h.point[ 1 ] + 0.07, h.point[ 2 ] ] }, 0.01 );
		}
	} );
}

// black plastic flares around the wheel arches
export function flares( b, o = {} ) {
	const k = b.k, sh = b.shell;
	const R = sh.archR, cy = sh.cy;
	const wid = o.width ?? 0.08, out = o.out ?? 0.05;
	b.far( () => {
		for ( const a of sh.axles ) {
			const yb = sh.fYB( a );
			const dy = cy - yb;
			const phi0 = Math.asin( Math.max( - 1, Math.min( 1, - dy / ( R + wid ) ) ) ) - 0.05;
			for ( const side of [ - 1, 1 ] ) {
				const xs = sh.frame( a ).hw;
				// outer face, top face, underside
				k.grid( ( u, v ) => {
					const ph = phi0 + ( Math.PI - 2 * phi0 ) * u;
					const r = R + v * wid;
					return [ side * ( xs + out * ( 1 - v * 0.6 ) ), cy + r * Math.sin( ph ), - ( a + r * Math.cos( ph ) ) ];
				}, 16, 1, MAT[ o.mat || 'trim' ] );
				k.grid( ( u, v ) => {
					const ph = phi0 + ( Math.PI - 2 * phi0 ) * u;
					return [ side * lerp( xs - 0.02, xs + out, v ), cy + R * Math.sin( ph ), - ( a + R * Math.cos( ph ) ) ];
				}, 16, 1, MAT[ o.mat || 'trim' ] );
			}
		}
	} );
}

// tube rails along the sills
export function rockRails( b, o = {} ) {
	const k = b.k, P = b.P;
	const f0 = P.axleF - P.archR - 0.05, f1 = ( P.axleR ) + P.archR + 0.05;
	const y = o.y ?? P.body.bottom[ 3 ]?.[ 1 ] ?? 0.4;
	for ( const s of [ - 1, 1 ] ) {
		const x = s * ( P.W / 2 - 0.05 );
		k.beam( [ x, y + 0.04, - f0 ], [ x, y + 0.04, - f1 ], 0.07, 0.07, mat( 'darksteel', { c: 0x141414 } ), [ 0, 1, 0 ], 0.02 );
	}
}

// the spare wheel on the tailgate (or on a carrier)
export function spareWheel( b, o = {} ) {
	const P = b.P, k = b.k;
	const hit = b.hitRear( 0, o.y ?? 1.0 );
	if ( ! hit ) return;
	const W = P.wheel || {};
	const g = wheelKit( P.wheelR, P.wheelW, W.style || 'steel', { ...W, brakes: false } ).build();
	b.far( () => {
		k.addBuilt( g, { p: [ 0, o.y ?? 1.0, hit.point[ 2 ] + P.wheelW / 2 + 0.06 ], r: [ 0, - Math.PI / 2, 0 ] } );
		k.box( 0.2, 0.2, 0.08, MAT.darksteel, { p: [ 0, o.y ?? 1.0, hit.point[ 2 ] + 0.03 ] }, 0.02 );
	} );
	if ( o.cover ) k.cyl( P.wheelR + 0.01, P.wheelR + 0.01, 0.02, MAT.canvas, { p: [ 0, o.y ?? 1.0, hit.point[ 2 ] + P.wheelW + 0.07 ], r: [ Math.PI / 2, 0, 0 ] }, 28 );
	g.dispose();
}

export function spoiler( b, o = {} ) {
	const k = b.k, P = b.P;
	const f = o.f ?? P.rear + 0.18;
	const h = b.hitTop( 0, f );
	if ( ! h ) return;
	const y = h.point[ 1 ], z = h.point[ 2 ], w = o.w ?? 1.4;
	b.far( () => {
		for ( const s of [ - 1, 1 ] ) k.box( 0.04, o.h ?? 0.14, 0.1, MAT[ o.mat || 'paint' ], { p: [ s * w * 0.36, y + ( o.h ?? 0.14 ) / 2, z ], r: [ 0.2, 0, 0 ] }, 0.012 );
		k.box( w, 0.025, 0.24, MAT[ o.mat || 'paint' ], { p: [ 0, y + ( o.h ?? 0.14 ), z + 0.02 ], r: [ - 0.1, 0, 0 ] }, 0.012 );
	} );
}

// vertical wall across a well (cab back, bed front); f position, from the floor to the edge
export function wellWall( b, f, o = {} ) {
	const k = b.k, sh = b.shell;
	const S = sh.frame( f );
	const w = S.xE - S.re - 0.01;
	const y0 = o.y0 ?? ( sh.P.wells?.[ o.well ?? 0 ]?.floor ?? 0.4 ), y1 = o.y1 ?? S.ye;
	k.box( w * 2, y1 - y0, o.t ?? 0.05, MAT[ o.mat || 'paint' ], { p: [ 0, ( y0 + y1 ) / 2, - f ] }, 0.01 );
}

// text / livery decals on the side panels
export function sideDecal( b, f, y, w, h, uv, o = {} ) {
	for ( const side of [ - 1, 1 ] ) {
		// both sides read front-to-back correctly: the right side mirrors the atlas
		b.patch( side > 0 ? 'right' : 'left', f, y, w, h, o.off ?? 0.006, mat( o.mat || 'white', { uv, r: o.r ?? 0.4 } ), { round: o.round ?? 0, nu: o.nu ?? 8, nv: o.nv ?? 2, uv, mirror: side < 0 ? ! o.flip : !! o.flip } );
	}
}

// the Humvee's roof turret ring and hatch
export function turretRing( b, o = {} ) {
	const k = b.k;
	const h = b.hitTop( 0, o.f ?? - 0.3 );
	if ( ! h ) return;
	const y = h.point[ 1 ], z = h.point[ 2 ];
	const m = MAT.paint;
	b.far( () => {
		k.cyl( 0.52, 0.55, 0.14, m, { p: [ 0, y + 0.06, z ] }, 24, true );
		k.torus( 0.53, 0.035, m, { p: [ 0, y + 0.13, z ], r: [ Math.PI / 2, 0, 0 ] }, 6, 28 );
		// gun shield plates
		for ( const a of [ - 0.5, 0, 0.5 ] ) k.box( 0.55, 0.45, 0.03, m, { p: [ Math.sin( a ) * 0.58, y + 0.4, z - Math.cos( a ) * 0.58 ], r: [ 0, - a, 0 ] }, 0.01 );
	} );
}

// the bus: front passenger doors (right side), destination sign, mirrors on long arms, the livery
export function busDetails( b ) {
	const k = b.k, P = b.P;
	// destination sign across the top of the windshield
	const f = P.front - 0.05;
	const hd = b.hitFront( 0, P.H - 0.33 );
	if ( hd ) b.patch( 'front', 0, P.H - 0.33, 1.7, 0.26, 0.012, mat( 'gauge', { c: 0xffc040, uv: ATLAS.dest } ), { round: 0, nu: 6, nv: 2, uv: ATLAS.dest, mirror: true } );
	// passenger doors: two glass leaves with black frames on the right side, behind the front axle's front edge
	const df = P.axleF + 0.6 + 0.62;
	for ( const dz of [ - 0.3, 0.3 ] ) {
		const fz = df + dz;
		const h = b.hitSide( fz, 1.2, 1 );
		if ( ! h ) continue;
		const x = h.point[ 0 ] + 0.012;
		k.box( 0.03, 2.3, 0.6, MAT.gloss, { p: [ x, 1.52, - fz ] }, 0.01 );
		k.box( 0.035, 1.9, 0.48, MAT.glassDark, { p: [ x + 0.003, 1.62, - fz ] }, 0.005 );
	}
	// mirrors on arms at the front corners
	for ( const s of [ - 1, 1 ] ) {
		const h = b.hitFront( s * ( P.W / 2 - 0.1 ), 2.2 );
		if ( ! h ) continue;
		const [ x, y, z ] = h.point;
		k.beam( [ x, y, z ], [ x + s * 0.25, y + 0.05, z - 0.35 ], 0.03, 0.03, MAT.trim );
		k.box( 0.22, 0.38, 0.08, MAT.trim, { p: [ x + s * 0.3, y - 0.1, z - 0.4 ] }, 0.03 );
		k.box( 0.18, 0.34, 0.01, MAT.chrome, { p: [ x + s * 0.3, y - 0.1, z - 0.36 ] } );
	}
	// livery: stripes along the lower sides and the logo
	sideDecal( b, 0.4, 0.72, 9.6, 0.34, ATLAS.stripes, { nu: 30, nv: 2 } );
	sideDecal( b, - 2.6, 1.12, 1.4, 0.4, ATLAS.thebus, { nu: 6, nv: 2 } );
	void f;
}

// a flat panel on a roof (hard top, cargo cover): from f0 to f1, width w
export function canvasCover( b, f0, f1, y, w, o = {} ) {
	const k = b.k;
	const m = MAT[ o.mat || 'canvas' ];
	k.grid( ( u, v ) => {
		const x = ( u * 2 - 1 ) * w;
		return [ x, y + ( o.crown ?? 0.05 ) * ( 1 - ( u * 2 - 1 ) ** 2 ), - lerp( f0, f1, v ) ];
	}, 6, 6, m );
	for ( const s of [ - 1, 1 ] ) k.grid( ( u, v ) => [ s * w, lerp( y, o.y0 ?? y - 0.4, v ), - lerp( f0, f1, u ) ], 6, 1, m );
	k.grid( ( u, v ) => [ ( u * 2 - 1 ) * w, lerp( y + ( o.crown ?? 0.05 ) * ( 1 - ( u * 2 - 1 ) ** 2 ), o.y0 ?? y - 0.4, v ), - f1 ], 6, 1, m );
}

export { pchipRoof };
