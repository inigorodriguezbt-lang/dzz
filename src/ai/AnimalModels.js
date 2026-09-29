// Procedural animals: each species is lofted from elliptical rings along spines (torso, neck, head, legs,
// tail, ears, horns, fins, flippers) into one skinned mesh with a small skeleton, so an animal is one draw
// call and its gait is a handful of bone rotations. Coats are vertex colours shaded by a fur / feather /
// skin shader (noise, deer spots, shark stripes, turtle scutes) that goes through patchMaterial.
//
// Frame: the animal faces -z, +y up, origin on the ground under the middle of the body; metres.
import * as THREE from 'three';
import { patchMaterial } from '../render/Materials.js';

const TAU = Math.PI * 2;
const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const col = ( h ) => new THREE.Color( h );

// ---- geometry accumulation ---------------------------------------------------------------------------------

// smooth a ring list: Catmull-Rom through the centres, radii eased, skin weights blended across bone changes
function subdivide( R, sub ) {
	const out = [];
	const n = R.length;
	const cr = ( a, b, c, d, t ) => {
		const t2 = t * t, t3 = t2 * t;
		return b.clone().multiplyScalar( 2 ).add( c.clone().sub( a ).multiplyScalar( t ) )
			.add( a.clone().multiplyScalar( 2 ).sub( b.clone().multiplyScalar( 5 ) ).add( c.clone().multiplyScalar( 4 ) ).sub( d ).multiplyScalar( t2 ) )
			.add( b.clone().multiplyScalar( 3 ).sub( a ).sub( c.clone().multiplyScalar( 3 ) ).add( d ).multiplyScalar( t3 ) ).multiplyScalar( 0.5 );
	};
	const lerp = ( a, b, t ) => a + ( b - a ) * t;
	for ( let i = 0; i < n - 1; i ++ ) {
		const r0 = R[ i ], r1 = R[ i + 1 ];
		const pa = R[ Math.max( 0, i - 1 ) ].p, pd = R[ Math.min( n - 1, i + 2 ) ].p;
		for ( let k = 0; k <= sub; k ++ ) {
			if ( k === 0 && i > 0 ) continue;
			const t = k / ( sub + 1 );
			if ( k === 0 ) { out.push( r0 ); continue; }
			const e = t * t * ( 3 - 2 * t );
			const same = r0.a === r1.a && ( r0.b ?? r0.a ) === ( r1.b ?? r1.a );
			out.push( {
				p: cr( pa, r0.p, r1.p, pd, t ), rx: lerp( r0.rx, r1.rx, e ), ry: lerp( r0.ry, r1.ry, e ), ryb: lerp( r0.ryb ?? r0.ry, r1.ryb ?? r1.ry, e ),
				c: t < 0.5 ? r0.c : r1.c, cfn: t < 0.5 ? r0.cfn : r1.cfn,
				a: same ? r0.a : ( ( r0.w || 0 ) > 0.5 ? ( r0.b ?? r0.a ) : r0.a ), b: same ? ( r0.b ?? r0.a ) : ( ( r1.w || 0 ) > 0.5 ? ( r1.b ?? r1.a ) : r1.a ),
				w: same ? lerp( r0.w || 0, r1.w || 0, t ) : t,
			} );
		}
	}
	out.push( R[ n - 1 ] );
	return out;
}

class Builder {
	constructor() { this.pos = []; this.col = []; this.si = []; this.sw = []; this.idx = []; this.bones = []; }
	bone( name, parent, p ) { this.bones.push( { name, parent: parent == null ? - 1 : this.bi( parent ), p: p.clone() } ); return this.bones.length - 1; }
	bi( name ) { return typeof name === 'number' ? name : this.bones.findIndex( b => b.name === name ); }
	vert( p, c, a, b = a, w = 0 ) {
		this.pos.push( p.x, p.y, p.z );
		this.col.push( c.r, c.g, c.b );
		this.si.push( this.bi( a ), this.bi( b ), 0, 0 );
		this.sw.push( 1 - w, w, 0, 0 );
		return this.pos.length / 3 - 1;
	}
	// rings along a spine. rings: [ { p: Vector3, rx, ry, ryb? (below), c: Color, a: bone, b?: bone, w?: 0..1 } ]
	// o: { seg, up: Vector3, cap0, cap1, flat (0..1 flattens the underside) }
	loft( rings, o = {} ) {
		if ( o.sub !== 0 && rings.length > 2 ) rings = subdivide( rings, o.sub ?? 2 );
		const seg = ( o.seg || 10 ) + ( o.sub === 0 ? 0 : 2 ), up = o.up || V( 0, 1, 0 );
		const t = new THREE.Vector3(), s = new THREE.Vector3(), u = new THREE.Vector3(), q = new THREE.Vector3();
		const start = this.pos.length / 3;
		for ( let i = 0; i < rings.length; i ++ ) {
			const R = rings[ i ];
			const a = rings[ Math.max( 0, i - 1 ) ].p, b = rings[ Math.min( rings.length - 1, i + 1 ) ].p;
			t.subVectors( b, a ).normalize();
			s.crossVectors( up, t );
			if ( s.lengthSq() < 1e-6 ) s.set( 1, 0, 0 );
			s.normalize();
			u.crossVectors( t, s ).normalize();
			for ( let k = 0; k < seg; k ++ ) {
				const ang = k / seg * TAU;
				const cs = Math.cos( ang ), sn = Math.sin( ang );
				const ry = sn < 0 ? ( R.ryb ?? R.ry ) : R.ry;
				q.copy( R.p ).addScaledVector( s, cs * R.rx ).addScaledVector( u, sn * ry );
				this.vert( q, R.cfn ? R.cfn( sn, cs ) : R.c, R.a, R.b ?? R.a, R.w || 0 );
			}
		}
		for ( let i = 0; i < rings.length - 1; i ++ ) {
			for ( let k = 0; k < seg; k ++ ) {
				const a = start + i * seg + k, b = start + i * seg + ( k + 1 ) % seg;
				const c = a + seg, d = b + seg;
				this.idx.push( a, c, b, b, c, d );
			}
		}
		// end caps: a fan to the centre
		const cap = ( i, flip ) => {
			const R = rings[ i ];
			const cI = this.vert( R.p, R.c, R.a, R.b ?? R.a, R.w || 0 );
			for ( let k = 0; k < seg; k ++ ) {
				const a = start + i * seg + k, b = start + i * seg + ( k + 1 ) % seg;
				if ( flip ) this.idx.push( cI, b, a ); else this.idx.push( cI, a, b );
			}
		};
		if ( o.cap0 !== false ) cap( 0, false );
		if ( o.cap1 !== false ) cap( rings.length - 1, true );
	}
	// a tapered cone from a to b (horns, tusks, beaks, toes)
	cone( a, b, r0, r1, c, bone, seg = 6, up = null ) {
		const m = a.clone().lerp( b, 0.5 );
		this.loft( [ { p: a, rx: r0, ry: r0, c, a: bone }, { p: m, rx: ( r0 + r1 ) / 2, ry: ( r0 + r1 ) / 2, c, a: bone }, { p: b, rx: Math.max( 0.001, r1 ), ry: Math.max( 0.001, r1 ), c, a: bone } ], { seg, up: up || ( Math.abs( b.y - a.y ) > 0.9 * a.distanceTo( b ) ? V( 0, 0, 1 ) : V( 0, 1, 0 ) ) } );
	}
	// a curved horn / antler tine through points
	curve( pts, r0, r1, c, bone, seg = 6 ) {
		const n = pts.length;
		this.loft( pts.map( ( p, i ) => ( { p, rx: r0 + ( r1 - r0 ) * i / ( n - 1 ), ry: r0 + ( r1 - r0 ) * i / ( n - 1 ), c, a: bone } ) ), { seg, up: V( 1, 0, 0 ) } );
	}
	// a flat blade (fins, flippers, wings, ears): outline in the plane of (side, fwd) from base b
	blade( base, dirA, dirB, len, width, thick, c, bone, taper = 0.2, bone2 = null ) {
		const rings = [];
		for ( let i = 0; i <= 4; i ++ ) {
			const f = i / 4;
			const w = width * ( 0.55 + 0.45 * Math.sin( Math.PI * Math.min( 1, f * 1.3 + 0.1 ) ) ) * ( 1 - f * ( 1 - taper ) ) * ( i === 4 ? 0.3 : 1 );
			rings.push( { p: base.clone().addScaledVector( dirA, len * f ), rx: w, ry: thick * ( 1 - f * 0.6 ), c, a: bone, b: bone2 ?? bone, w: bone2 ? f : 0 } );
		}
		this.loft( rings, { seg: 8, up: dirB } );
	}
	build() {
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'color', new THREE.Float32BufferAttribute( this.col, 3 ) );
		g.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( this.si, 4 ) );
		g.setAttribute( 'skinWeight', new THREE.Float32BufferAttribute( this.sw, 4 ) );
		g.setIndex( this.idx );
		g.computeVertexNormals();
		g.computeBoundingSphere();
		return g;
	}
}

// ---- quadrupeds -------------------------------------------------------------------------------------------------

// s: { L (hip to shoulder), legH (ground to belly), rx, ry (girth), ryb, hump, neck: { len, rise, r }, head: { len, drop, r, rs (snout) },
//      legR, hindAngle, tail: { len, r, droop }, ears: { len, w, up }, colours: { coat, belly, dark, hoof, nose, horn } }
function quadruped( s, B ) {
	const L = s.L, hipZ = L * 0.5, chestZ = - L * 0.5;
	const by = s.legH + s.ryb;
	const C = s.colours;
	const coat = col( C.coat ), belly = col( C.belly ?? C.coat ), dark = col( C.dark ?? C.coat ), hoof = col( C.hoof ?? 0x1a1612 );
	const nose = col( C.nose ?? C.dark ?? C.coat ), horn = col( C.horn ?? 0x6a5a48 ), leg = col( C.leg ?? C.coat );
	B.bone( 'root', null, V( 0, 0, 0 ) );
	B.bone( 'body', 'root', V( 0, by, hipZ * 0.4 ) );
	B.bone( 'chest', 'body', V( 0, by, chestZ * 0.35 ) );
	const neckBase = V( 0, by + s.ry * 0.35 + ( s.hump || 0 ), chestZ - L * 0.06 );
	const headBase = neckBase.clone().add( V( 0, s.neck.rise, - s.neck.len ) );
	B.bone( 'neck', 'chest', neckBase );
	B.bone( 'head', 'neck', headBase );
	B.bone( 'tail', 'body', V( 0, by + s.ry * 0.45, hipZ + L * 0.14 ) );
	// the coat: lighter belly, darker back line
	const shade = ( base ) => ( sn ) => {
		const c = base.clone();
		if ( sn < - 0.55 ) c.lerp( belly, Math.min( 1, ( - sn - 0.55 ) * 3 ) );
		else if ( sn > 0.85 ) c.lerp( dark, ( sn - 0.85 ) * 4 );
		return c;
	};
	// torso rings (rump -> shoulders), the back line may rise to a hump at the shoulders
	const hump = s.hump || 0;
	const T = [
		[ hipZ + L * 0.2, 0.35, 0.4, 0.02, 'body' ], [ hipZ + L * 0.12, 0.72, 0.78, 0.01, 'body' ], [ hipZ, 0.92, 0.95, 0, 'body' ],
		[ L * 0.22, 1, 1, hump * 0.2, 'body' ], [ 0, 1.03, 1.02, hump * 0.4, 'body' ], [ - L * 0.22, 1, 1, hump * 0.7, 'chest' ],
		[ chestZ, 0.96, 1.02, hump, 'chest' ], [ chestZ - L * 0.1, 0.72, 0.8, hump * 0.9, 'chest' ],
	];
	B.loft( T.map( ( [ z, kx, ky, dy, bone ] ) => ( { p: V( 0, by + dy, z ), rx: s.rx * kx, ry: s.ry * ky, ryb: s.ryb * ky, cfn: shade( coat ), c: coat, a: bone } ) ), { seg: 14 } );
	// neck
	const nr = s.neck.r;
	const NR = [ 0, 0.33, 0.66, 1 ].map( f => ( {
		p: neckBase.clone().lerp( headBase, f ).add( V( 0, - s.ry * 0.1 * ( 1 - f ), 0 ) ), rx: nr * ( 1.25 - f * 0.35 ) * ( f === 0 ? 1.2 : 1 ), ry: nr * ( 1.5 - f * 0.45 ),
		cfn: shade( coat ), c: coat, a: 'neck', b: 'head', w: f > 0.7 ? ( f - 0.7 ) / 0.3 : 0,
	} ) );
	B.loft( NR, { seg: 12 } );
	// head: skull -> snout, tilted down
	const H = s.head, hr = H.r, snout = H.rs;
	const dirH = V( 0, - Math.sin( H.drop ), - Math.cos( H.drop ) );
	const hp = ( f ) => headBase.clone().addScaledVector( dirH, H.len * f );
	B.loft( [
		{ p: hp( - 0.12 ), rx: hr * 0.7, ry: hr * 0.75, c: coat, a: 'head' },
		{ p: hp( 0.1 ), rx: hr, ry: hr * 1.02, c: coat, a: 'head' },
		{ p: hp( 0.4 ), rx: hr * 0.85, ry: hr * 0.82, c: coat, a: 'head' },
		{ p: hp( 0.75 ), rx: snout * 1.05, ry: snout * 1.1, c: coat, a: 'head' },
		{ p: hp( 0.97 ), rx: snout * 0.95, ry: snout, c: nose, a: 'head' },
		{ p: hp( 1.02 ), rx: snout * 0.7, ry: snout * 0.72, c: nose, a: 'head' },
	], { seg: 12 } );
	// eyes: dark beads on the sides of the skull
	for ( const sx of [ - 1, 1 ] ) {
		const e = hp( 0.3 ).add( V( sx * hr * 0.82, hr * 0.35, 0 ) );
		B.cone( e.clone().add( V( - sx * 0.01, 0, 0 ) ), e.clone().add( V( sx * 0.012, 0, 0 ) ), hr * 0.16, hr * 0.12, col( 0x0a0806 ), 'head', 6 );
	}
	// ears
	if ( s.ears ) {
		for ( const sx of [ - 1, 1 ] ) {
			const base = hp( 0.02 ).add( V( sx * hr * 0.6, hr * 0.7, 0 ) );
			const d = V( sx * ( 1 - s.ears.up ), s.ears.up, 0.25 ).normalize();
			B.blade( base, d, V( 0, 0, 1 ), s.ears.len, s.ears.w, 0.012, s.ears.c != null ? col( s.ears.c ) : coat, 'head', 0.25 );
		}
	}
	// legs: front (shoulder, elbow, fetlock) and hind (hip, hock, fetlock)
	const lr = s.legR;
	const legX = s.rx * 0.62;
	for ( const [ side, sx ] of [ [ 'L', - 1 ], [ 'R', 1 ] ] ) {
		// front
		const sh = V( sx * legX, by - s.ry * 0.15 + hump * 0.6, chestZ + L * 0.04 );
		const el = V( sx * legX, s.legH * 0.62, chestZ + L * 0.07 );
		const fe = V( sx * legX, s.legH * 0.12, chestZ + L * 0.05 );
		const gr = V( sx * legX, 0, chestZ + L * 0.03 );
		const u = B.bone( 'F' + side + '1', 'chest', sh ), l = B.bone( 'F' + side + '2', u, el ), f = B.bone( 'F' + side + '3', l, fe );
		B.loft( [
			{ p: sh.clone().add( V( 0, s.ry * 0.45, 0 ) ), rx: lr * 2.2, ry: lr * 2.4, c: coat, a: u },
			{ p: sh.clone().lerp( el, 0.45 ), rx: lr * 1.55, ry: lr * 1.75, c: coat, a: u },
			{ p: el, rx: lr * 1.0, ry: lr * 1.05, c: leg, a: u, b: l, w: 0.5 },
			{ p: el.clone().lerp( fe, 0.5 ), rx: lr * 0.74, ry: lr * 0.78, c: leg, a: l },
			{ p: fe, rx: lr * 0.76, ry: lr * 0.8, c: leg, a: l, b: f, w: 0.5 },
			{ p: gr.clone().add( V( 0, 0.035, - 0.01 ) ), rx: lr * 0.85, ry: lr * 0.95, c: hoof, a: f },
			{ p: gr.clone().add( V( 0, 0.004, - 0.02 ) ), rx: lr * 0.9, ry: lr * 1.05, c: hoof, a: f },
		], { seg: 8 } );
		// hind: the thigh runs forward-down, the shank back to the hock, the cannon straight down
		const hp0 = V( sx * legX, by - s.ry * 0.05, hipZ - L * 0.02 );
		const kn = V( sx * legX, s.legH * 0.78, hipZ - L * 0.1 );
		const hk = V( sx * legX, s.legH * 0.42, hipZ + L * 0.06 * s.hindAngle );
		const hf = V( sx * legX, s.legH * 0.12, hipZ + L * 0.02 );
		const hg = V( sx * legX, 0, hipZ );
		const hu = B.bone( 'H' + side + '1', 'body', hp0 ), hl = B.bone( 'H' + side + '2', hu, hk ), hft = B.bone( 'H' + side + '3', hl, hf );
		B.loft( [
			{ p: hp0.clone().add( V( 0, s.ry * 0.45, 0.02 ) ), rx: lr * 2.4, ry: lr * 2.9, c: coat, a: hu },
			{ p: kn, rx: lr * 1.6, ry: lr * 2.0, c: coat, a: hu },
			{ p: kn.clone().lerp( hk, 0.6 ), rx: lr * 1.05, ry: lr * 1.2, c: leg, a: hu, b: hl, w: 0.6 },
			{ p: hk, rx: lr * 0.8, ry: lr * 0.95, c: leg, a: hl },
			{ p: hk.clone().lerp( hf, 0.5 ), rx: lr * 0.7, ry: lr * 0.76, c: leg, a: hl },
			{ p: hf, rx: lr * 0.72, ry: lr * 0.76, c: leg, a: hl, b: hft, w: 0.5 },
			{ p: hg.clone().add( V( 0, 0.035, - 0.01 ) ), rx: lr * 0.85, ry: lr * 0.95, c: hoof, a: hft },
			{ p: hg.clone().add( V( 0, 0.004, - 0.02 ) ), rx: lr * 0.9, ry: lr * 1.05, c: hoof, a: hft },
		], { seg: 8 } );
	}
	// tail
	if ( s.tail ) {
		const t0 = V( 0, by + s.ry * 0.45, hipZ + L * 0.17 );
		const pts = [];
		for ( let i = 0; i <= 4; i ++ ) {
			const f = i / 4;
			pts.push( { p: t0.clone().add( V( 0, - s.tail.len * f * s.tail.droop, s.tail.len * f * ( 1 - s.tail.droop * 0.6 ) ) ), rx: s.tail.r * ( 1 - f * 0.6 ) * ( i === 4 && s.tail.tuft ? 2.2 : 1 ), ry: s.tail.r * ( 1 - f * 0.6 ) * ( i === 4 && s.tail.tuft ? 2.2 : 1 ), c: i >= 3 && s.tail.tuft ? dark : coat, a: 'tail' } );
		}
		B.loft( pts, { seg: 6 } );
	}
	return { by, hp, hr, headBase, dirH, L, coat, dark, horn, nose };
}

// ---- species ---------------------------------------------------------------------------------------------------

const SPECIES = {
	boar( B, o ) {
		const q = quadruped( {
			L: 0.72, legH: 0.34, rx: 0.2, ry: 0.23, ryb: 0.22, hump: 0.06,
			neck: { len: 0.14, rise: - 0.04, r: 0.17 }, head: { len: 0.42, drop: 0.42, r: 0.13, rs: 0.055 },
			legR: 0.032, hindAngle: 0.6, tail: { len: 0.22, r: 0.018, droop: 0.9, tuft: true }, ears: { len: 0.11, w: 0.045, up: 0.7 },
			colours: { coat: o.coat ?? 0x2c241e, belly: 0x3a3028, dark: 0x16120e, nose: 0x5a4640, leg: 0x241e18, hoof: 0x121010 },
		}, B );
		// tusks
		for ( const sx of [ - 1, 1 ] ) {
			const a = q.hp( 0.82 ).add( V( sx * 0.045, - 0.03, 0 ) );
			B.curve( [ a, a.clone().add( V( sx * 0.02, 0.02, - 0.03 ) ), a.clone().add( V( sx * 0.028, 0.055, - 0.035 ) ) ], 0.012, 0.003, col( 0xe8dcc0 ), 'head' );
		}
		// a bristly crest along the spine
		B.loft( [ 0.3, 0.1, - 0.1, - 0.3, - 0.45 ].map( ( z, i ) => ( { p: V( 0, q.by + 0.21 + ( i > 1 ? 0.04 : 0 ), z ), rx: 0.02, ry: 0.035, c: col( 0x120e0c ), a: i > 2 ? 'chest' : 'body' } ) ), { seg: 6 } );
		return { fur: 1.1, size: 0.9 };
	},
	goat( B, o ) {
		const q = quadruped( {
			L: 0.62, legH: 0.42, rx: 0.15, ry: 0.19, ryb: 0.2, hump: 0.02,
			neck: { len: 0.2, rise: 0.2, r: 0.07 }, head: { len: 0.26, drop: 0.7, r: 0.075, rs: 0.04 },
			legR: 0.022, hindAngle: 1, tail: { len: 0.1, r: 0.02, droop: - 0.4 }, ears: { len: 0.12, w: 0.035, up: 0.1 },
			colours: { coat: o.coat ?? 0x6a4a30, belly: o.belly ?? 0x8a6a4a, dark: 0x2a1e14, nose: 0x3a2e28, leg: o.leg ?? 0x4a3424, hoof: 0x201a14 },
		}, B );
		// horns sweeping back, a beard
		for ( const sx of [ - 1, 1 ] ) {
			const a = q.hp( 0.05 ).add( V( sx * 0.035, 0.07, 0 ) );
			B.curve( [ a, a.clone().add( V( sx * 0.02, 0.08, 0.04 ) ), a.clone().add( V( sx * 0.04, 0.12, 0.13 ) ), a.clone().add( V( sx * 0.05, 0.08, 0.22 ) ) ], 0.018, 0.004, col( 0x5a4a38 ), 'head' );
		}
		const bd = q.hp( 0.7 ).add( V( 0, - 0.05, 0 ) );
		B.cone( bd, bd.clone().add( V( 0, - 0.09, 0.03 ) ), 0.018, 0.004, col( 0x2a2018 ), 'head', 5 );
		return { fur: 1, size: 0.7 };
	},
	deer( B, o ) {
		const q = quadruped( {
			L: 0.78, legH: 0.62, rx: 0.15, ry: 0.19, ryb: 0.19, hump: 0,
			neck: { len: 0.28, rise: 0.28, r: 0.07 }, head: { len: 0.3, drop: 0.55, r: 0.075, rs: 0.035 },
			legR: 0.022, hindAngle: 1.2, tail: { len: 0.18, r: 0.03, droop: 0.7 }, ears: { len: 0.14, w: 0.05, up: 0.55 },
			colours: { coat: 0xa2622e, belly: 0xefe6d8, dark: 0x3a2412, nose: 0x1a1412, leg: 0x8a5a30, hoof: 0x1a1612 },
		}, B );
		if ( o.male ) {
			// axis stag: long lyre-shaped antlers with a brow tine
			for ( const sx of [ - 1, 1 ] ) {
				const a = q.hp( 0.02 ).add( V( sx * 0.04, 0.07, 0 ) );
				const b = a.clone().add( V( sx * 0.06, 0.18, 0.08 ) ), c = a.clone().add( V( sx * 0.1, 0.38, 0.06 ) ), d = a.clone().add( V( sx * 0.07, 0.56, - 0.04 ) );
				B.curve( [ a, b, c, d ], 0.016, 0.005, col( 0x7a6448 ), 'head' );
				B.curve( [ a.clone().add( V( 0, 0.05, 0.01 ) ), a.clone().add( V( sx * 0.02, 0.1, - 0.08 ) ), a.clone().add( V( sx * 0.02, 0.16, - 0.14 ) ) ], 0.011, 0.004, col( 0x7a6448 ), 'head' );
				B.curve( [ c, c.clone().add( V( - sx * 0.02, 0.08, - 0.06 ) ) ], 0.009, 0.003, col( 0x7a6448 ), 'head' );
			}
		}
		return { fur: 0.7, spots: 1, size: 0.9 };
	},
	cow( B, o ) {
		const q = quadruped( {
			L: 1.25, legH: 0.62, rx: 0.34, ry: 0.36, ryb: 0.4, hump: 0.02,
			neck: { len: 0.22, rise: 0.02, r: 0.2 }, head: { len: 0.5, drop: 0.85, r: 0.15, rs: 0.1 },
			legR: 0.045, hindAngle: 0.8, tail: { len: 0.8, r: 0.03, droop: 0.97, tuft: true }, ears: { len: 0.14, w: 0.06, up: - 0.1 },
			colours: o.hereford ? { coat: 0x7a3a1c, belly: 0x8a4a2a, dark: 0x5a2a14, nose: 0xc8a8a0, leg: 0x6a3218, hoof: 0x201a14 }
				: { coat: 0x1a1816, belly: 0x242220, dark: 0x0e0d0c, nose: 0x2a2624, leg: 0x161412, hoof: 0x0e0c0a },
		}, B );
		if ( o.hereford ) {
			// the white face
			B.loft( [ 0.05, 0.4, 0.8, 1.0 ].map( f => ( { p: q.hp( f ).add( V( 0, 0.02, 0 ) ), rx: ( f < 0.5 ? 0.14 : 0.1 ) * 1.02, ry: ( f < 0.5 ? 0.14 : 0.1 ) * 1.03, c: col( 0xe8e2d6 ), a: 'head' } ) ), { seg: 12 } );
		}
		for ( const sx of [ - 1, 1 ] ) {
			const a = q.hp( 0.02 ).add( V( sx * 0.12, 0.08, 0 ) );
			B.curve( [ a, a.clone().add( V( sx * 0.08, 0.03, - 0.02 ) ), a.clone().add( V( sx * 0.11, 0.09, - 0.05 ) ) ], 0.022, 0.006, col( 0xd8ccb0 ), 'head' );
		}
		return { fur: 0.5, size: 1.6 };
	},
	chicken( B, o ) { return bird( B, o, false ); },
	nene( B, o ) { return bird( B, o, true ); },
	shark( B, o ) {
		const len = o.len || 3.2;
		const back = col( 0x55626c ), bellyC = col( 0xe4e6e2 );
		// spine bones along the body, head first
		const Z = [ - 0.5, - 0.25, 0, 0.22, 0.45 ].map( f => f * len );
		B.bone( 'root', null, V( 0, 0, 0 ) );
		B.bone( 'b0', 'root', V( 0, 0, Z[ 0 ] ) );
		for ( let i = 1; i < 5; i ++ ) B.bone( 'b' + i, 'b' + ( i - 1 ), V( 0, 0, Z[ i ] ) );
		const boneAt = ( z ) => {
			for ( let i = 0; i < 4; i ++ ) if ( z <= Z[ i + 1 ] ) return [ 'b' + i, 'b' + ( i + 1 ), ( z - Z[ i ] ) / ( Z[ i + 1 ] - Z[ i ] ) ];
			return [ 'b4', 'b4', 0 ];
		};
		const shade = ( sn ) => sn < - 0.15 ? bellyC : back;
		const prof = [ [ - 0.5, 0.02, 0.02 ], [ - 0.47, 0.07, 0.06 ], [ - 0.4, 0.11, 0.1 ], [ - 0.25, 0.15, 0.15 ], [ - 0.05, 0.16, 0.16 ], [ 0.15, 0.12, 0.12 ], [ 0.3, 0.07, 0.07 ], [ 0.42, 0.035, 0.04 ], [ 0.46, 0.03, 0.035 ] ];
		B.loft( prof.map( ( [ f, rx, ry ] ) => { const [ a, b, w ] = boneAt( f * len ); return { p: V( 0, 0, f * len ), rx: rx * len * 0.55, ry: ry * len * 0.5, ryb: ry * len * 0.42, cfn: shade, c: back, a, b, w }; } ), { seg: 14 } );
		// fins: dorsal, second dorsal, pectorals, caudal (big upper lobe)
		const fin = ( base, dir, l, w, bone ) => B.blade( base, dir.normalize(), V( 0, 0, 1 ), l, w, 0.012 * len, back, bone, 0.15 );
		fin( V( 0, 0.075 * len, - 0.05 * len ), V( 0, 1, 0.55 ), 0.16 * len, 0.08 * len, 'b2' );
		fin( V( 0, 0.035 * len, 0.3 * len ), V( 0, 1, 0.5 ), 0.05 * len, 0.025 * len, 'b3' );
		for ( const sx of [ - 1, 1 ] ) {
			const p = V( sx * 0.07 * len, - 0.04 * len, - 0.22 * len );
			B.blade( p, V( sx, - 0.45, 0.45 ).normalize(), V( 0, 1, 0 ), 0.18 * len, 0.06 * len, 0.01 * len, back, 'b1', 0.2 );
		}
		B.blade( V( 0, 0.01 * len, 0.44 * len ), V( 0, 1, 0.75 ).normalize(), V( 1, 0, 0 ), 0.2 * len, 0.05 * len, 0.01 * len, back, 'b4', 0.2 );
		B.blade( V( 0, - 0.01 * len, 0.44 * len ), V( 0, - 1, 0.55 ).normalize(), V( 1, 0, 0 ), 0.1 * len, 0.035 * len, 0.01 * len, back, 'b4', 0.25 );
		// eyes and gill slits are dark marks
		for ( const sx of [ - 1, 1 ] ) {
			const e = V( sx * 0.052 * len, 0.02 * len, - 0.42 * len );
			B.cone( e, e.clone().add( V( sx * 0.006, 0, 0 ) ), 0.012 * len * 0.6, 0.008 * len * 0.6, col( 0x050505 ), 'b0' );
		}
		return { fur: 0, stripes: 1, size: 1.5, water: true };
	},
	turtle( B, o ) {
		const shell = col( 0x57512c ), skin = col( 0x6a6a4a ), plast = col( 0xd8cc98 );
		B.bone( 'root', null, V( 0, 0, 0 ) );
		B.bone( 'body', 'root', V( 0, 0.14, 0 ) );
		B.bone( 'head', 'body', V( 0, 0.15, - 0.42 ) );
		const shade = ( sn ) => sn < - 0.7 ? plast : shell;
		const prof = [ [ 0.45, 0.04, 0.03, 0.01 ], [ 0.38, 0.2, 0.12, 0.04 ], [ 0.2, 0.36, 0.19, 0.06 ], [ 0, 0.4, 0.21, 0.065 ], [ - 0.2, 0.37, 0.19, 0.06 ], [ - 0.35, 0.26, 0.13, 0.045 ], [ - 0.42, 0.12, 0.06, 0.03 ] ];
		B.loft( prof.map( ( [ z, rx, ry, ryb ] ) => ( { p: V( 0, 0.14, z ), rx, ry, ryb, cfn: shade, c: shell, a: 'body' } ) ), { seg: 16 } );
		// head and neck
		B.loft( [ [ - 0.36, 0.06 ], [ - 0.45, 0.065 ], [ - 0.53, 0.06 ], [ - 0.58, 0.04 ] ].map( ( [ z, r ] ) => ( { p: V( 0, 0.15 + ( - 0.36 - z ) * 0.3, z ), rx: r, ry: r * 0.85, c: skin, a: 'head' } ) ), { seg: 10 } );
		for ( const sx of [ - 1, 1 ] ) {
			const e = V( sx * 0.045, 0.19, - 0.5 );
			B.cone( e, e.clone().add( V( sx * 0.008, 0, 0 ) ), 0.012, 0.008, col( 0x080806 ), 'head' );
		}
		// flippers: long front, short rear
		for ( const [ side, sx ] of [ [ 'L', - 1 ], [ 'R', 1 ] ] ) {
			B.bone( 'F' + side, 'body', V( sx * 0.3, 0.12, - 0.25 ) );
			B.blade( V( sx * 0.28, 0.12, - 0.25 ), V( sx, - 0.08, 0.3 ).normalize(), V( 0, 1, 0 ), 0.46, 0.09, 0.02, skin, 'F' + side, 0.25 );
			B.bone( 'H' + side, 'body', V( sx * 0.22, 0.11, 0.33 ) );
			B.blade( V( sx * 0.2, 0.11, 0.33 ), V( sx * 0.7, - 0.08, 0.7 ).normalize(), V( 0, 1, 0 ), 0.2, 0.07, 0.015, skin, 'H' + side, 0.4 );
		}
		return { fur: 0, scutes: 1, size: 0.8 };
	},
};

// chickens (feral red junglefowl on Kaua'i) and nene
function bird( B, o, goose ) {
	const s = goose ? 1.45 : 1;
	const rooster = ! goose && o.male;
	const C = goose ? { body: 0x8a7a64, wing: 0x6a5a48, neck: 0x1a1612, head: 0x141210, cheek: 0xd8c8a0, leg: 0x141210, bill: 0x141210, tail: 0x2a2420 }
		: rooster ? { body: 0x7a2e14, wing: 0x8a3a16, neck: 0xc8641e, head: 0xb04a1a, cheek: 0xc01818, leg: 0x7a7a60, bill: 0xb89a60, tail: 0x12201a }
			: { body: 0x7a5a38, wing: 0x6a4a2c, neck: 0x9a7040, head: 0x8a6a40, cheek: 0xb03020, leg: 0x7a7a60, bill: 0xb89a60, tail: 0x4a3420 };
	const legH = 0.17 * s * ( goose ? 0.85 : 1 ), by = legH + 0.12 * s;
	B.bone( 'root', null, V( 0, 0, 0 ) );
	B.bone( 'body', 'root', V( 0, by, 0 ) );
	const nb = V( 0, by + 0.07 * s, - 0.1 * s );
	const hb = nb.clone().add( V( 0, ( goose ? 0.2 : 0.14 ) * s, - ( goose ? 0.06 : 0.04 ) * s ) );
	B.bone( 'neck', 'body', nb );
	B.bone( 'head', 'neck', hb );
	B.bone( 'tail', 'body', V( 0, by + 0.04 * s, 0.13 * s ) );
	const body = col( C.body );
	const el = goose ? 1.25 : 1;
	B.loft( [ [ 0.17, 0.03, 0.03 ], [ 0.13, 0.08, 0.075 ], [ 0.05, 0.11, 0.105 ], [ - 0.04, 0.11, 0.11 ], [ - 0.11, 0.085, 0.09 ], [ - 0.15, 0.04, 0.05 ] ].map( ( [ z, rx, ry ] ) => ( { p: V( 0, by + ( z < 0 ? - z * 0.2 * s : 0 ), z * s * el ), rx: rx * s, ry: ry * s, c: body, a: 'body' } ) ), { seg: 12 } );
	// neck (the nene's is furrowed dark and buff), head, bill
	const neckC = col( C.neck );
	B.loft( [ 0, 0.35, 0.7, 1 ].map( f => ( { p: nb.clone().lerp( hb, f ), rx: ( goose ? 0.04 - f * 0.016 : 0.05 - f * 0.018 ) * s, ry: ( goose ? 0.045 - f * 0.018 : 0.055 - f * 0.02 ) * s, c: goose && f > 0.2 && f < 0.8 ? col( 0xb8aa88 ) : neckC, a: 'neck', b: 'head', w: f > 0.7 ? 1 : 0 } ) ), { seg: 10 } );
	const headC = col( C.head );
	B.loft( [ [ 0.03, 0.028 ], [ 0.0, 0.04 ], [ - 0.035, 0.036 ], [ - 0.055, 0.02 ] ].map( ( [ z, r ] ) => ( { p: hb.clone().add( V( 0, 0.01 * s, z * s ) ), rx: r * s * 0.9, ry: r * s, c: headC, a: 'head' } ) ), { seg: 10 } );
	const bill = hb.clone().add( V( 0, 0.005 * s, - 0.05 * s ) );
	B.cone( bill, bill.clone().add( V( 0, - 0.01 * s, - ( goose ? 0.055 : 0.035 ) * s ) ), 0.016 * s, 0.003 * s, col( C.bill ), 'head', 6 );
	for ( const sx of [ - 1, 1 ] ) {
		const e = hb.clone().add( V( sx * 0.03 * s, 0.018 * s, - 0.012 * s ) );
		B.cone( e, e.clone().add( V( sx * 0.005 * s, 0, 0 ) ), 0.007 * s, 0.005 * s, col( 0x080604 ), 'head', 5 );
		if ( goose ) B.blade( hb.clone().add( V( sx * 0.03 * s, 0, 0.0 ) ), V( 0, - 1, 0.3 ).normalize(), V( sx, 0, 0 ), 0.04 * s, 0.02 * s, 0.004, col( C.cheek ), 'head', 0.7 );
	}
	if ( ! goose ) {
		// comb and wattles
		const comb = hb.clone().add( V( 0, 0.04 * s, 0.0 ) );
		B.blade( comb.clone().add( V( 0, 0, 0.02 ) ), V( 0, 0.2, - 1 ).normalize(), V( 0, 1, 0 ), rooster ? 0.06 : 0.035, rooster ? 0.025 : 0.012, 0.004, col( 0xc01818 ), 'head', 0.6 );
		B.blade( hb.clone().add( V( 0, - 0.03 * s, - 0.03 * s ) ), V( 0, - 1, 0.1 ).normalize(), V( 1, 0, 0 ), rooster ? 0.04 : 0.02, 0.012, 0.004, col( 0xc01818 ), 'head', 0.7 );
	}
	// wings folded on the flanks
	for ( const [ side, sx ] of [ [ 'L', - 1 ], [ 'R', 1 ] ] ) {
		B.bone( 'W' + side, 'body', V( sx * 0.09 * s, by + 0.04 * s, - 0.06 * s ) );
		B.blade( V( sx * 0.1 * s, by + 0.03 * s, - 0.06 * s ), V( sx * 0.08, - 0.12, 1 ).normalize(), V( sx, 0.15, 0 ).normalize(), 0.19 * s * ( goose ? 1.25 : 1 ), 0.06 * s, 0.018 * s, col( C.wing ), 'W' + side, 0.3 );
	}
	// tail: a rooster's sickle feathers arch high, the hen's and goose's are short
	const tailC = col( C.tail );
	const t0 = V( 0, by + 0.04 * s, 0.14 * s );
	if ( rooster ) {
		for ( const sx of [ - 0.02, 0, 0.02 ] ) B.curve( [ t0.clone().add( V( sx, 0, 0 ) ), t0.clone().add( V( sx * 2, 0.16, 0.06 ) ), t0.clone().add( V( sx * 3, 0.2, 0.18 ) ), t0.clone().add( V( sx * 3, 0.1, 0.28 ) ) ], 0.02, 0.006, tailC, 'tail', 6 );
	} else B.blade( t0, V( 0, goose ? 0.2 : 0.8, 1 ).normalize(), V( 0, 1, 0 ), ( goose ? 0.1 : 0.12 ) * s, 0.05 * s, 0.01 * s, tailC, 'tail', 0.5 );
	// legs
	const legC = col( C.leg );
	for ( const [ side, sx ] of [ [ 'L', - 1 ], [ 'R', 1 ] ] ) {
		const hip = V( sx * 0.045 * s, by - 0.05 * s, 0.01 * s );
		const knee = V( sx * 0.045 * s, legH * 0.95, 0.025 * s );
		const ank = V( sx * 0.045 * s, 0.015, 0.0 );
		const u = B.bone( 'L' + side + '1', 'body', hip ), l = B.bone( 'L' + side + '2', u, knee );
		B.loft( [ { p: hip, rx: 0.035 * s, ry: 0.04 * s, c: body, a: u }, { p: knee, rx: 0.02 * s, ry: 0.022 * s, c: goose ? legC : body, a: u, b: l, w: 0.5 } ], { seg: 6 } );
		B.cone( knee, ank, 0.009 * s, 0.007 * s, legC, l, 5 );
		// toes
		for ( const a of [ - 0.5, 0, 0.5 ] ) B.cone( ank, ank.clone().add( V( Math.sin( a ) * 0.045 * s, - 0.01, - Math.cos( a ) * 0.045 * s ) ), 0.006 * s, 0.003 * s, legC, l, 4 );
		B.cone( ank, ank.clone().add( V( 0, - 0.01, 0.025 * s ) ), 0.005 * s, 0.003 * s, legC, l, 4 );
	}
	return { fur: 0.6, feathers: 1, size: goose ? 0.5 : 0.3, bird: true, by };
}

// ---- the shared shader --------------------------------------------------------------------------------------------

function animalMaterial( k ) {
	const m = new THREE.MeshStandardMaterial( { vertexColors: true, roughness: k.water ? 0.45 : k.scutes ? 0.55 : 0.88, metalness: 0 } );
	const u = { uFur: { value: k.fur || 0 }, uSpots: { value: k.spots || 0 }, uStripes: { value: k.stripes || 0 }, uScutes: { value: k.scutes || 0 }, uSeed: { value: Math.random() * 50 }, uTint: { value: new THREE.Color( 1, 1, 1 ) } };
	m.userData.u = u;
	patchMaterial( m, 'animal', ( shader ) => {
		Object.assign( shader.uniforms, u );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nvarying vec3 vObjA;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvObjA = position;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', `#include <common>
				varying vec3 vObjA;
				uniform float uFur, uSpots, uStripes, uScutes, uSeed; uniform vec3 uTint;
				float ah3( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
				float an3( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
					return mix( mix( mix( ah3( i ), ah3( i + vec3( 1, 0, 0 ) ), f.x ), mix( ah3( i + vec3( 0, 1, 0 ) ), ah3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
						mix( mix( ah3( i + vec3( 0, 0, 1 ) ), ah3( i + vec3( 1, 0, 1 ) ), f.x ), mix( ah3( i + vec3( 0, 1, 1 ) ), ah3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }` )
			.replace( '#include <color_fragment>', `#include <color_fragment>
				vec3 ap = vObjA + uSeed;
				// fur / feathers: fine streaks and blotches
				float fn = an3( ap * vec3( 90.0, 30.0, 90.0 ) ) * 0.6 + an3( ap * 9.0 ) * 0.4;
				diffuseColor.rgb *= mix( 1.0, 0.72 + 0.56 * fn, uFur );
				// axis deer: white spots in rows on the flanks and back
				vec2 sg = vec2( vObjA.z * 26.0, vObjA.y * 24.0 );
				vec2 sf = fract( sg + vec2( 0.5 * floor( sg.y ), 0.0 ) ) - 0.5;
				float sp = smoothstep( 0.2, 0.14, length( sf ) ) * step( 0.35, an3( vec3( floor( sg ), uSeed ) ) );
				float flank = smoothstep( 0.66, 0.74, vObjA.y ) * ( 1.0 - smoothstep( 0.93, 0.98, vObjA.y ) ) * step( abs( vObjA.z ), 0.45 );
				diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.93, 0.9, 0.84 ), sp * flank * uSpots );
				// tiger shark: faint dark bars on the back
				float bar = smoothstep( 0.55, 0.8, sin( vObjA.z * 9.0 + an3( ap * 4.0 ) * 3.0 ) ) * step( 0.0, vObjA.y );
				diffuseColor.rgb *= 1.0 - bar * 0.35 * uStripes;
				// turtle shell: scutes with dark seams and radiating streaks
				vec2 sc = vObjA.xz * vec2( 5.5, 4.5 );
				vec2 cell = fract( sc ) - 0.5;
				float seam = smoothstep( 0.42, 0.5, max( abs( cell.x ), abs( cell.y ) ) );
				float ray = an3( vec3( atan( cell.y, cell.x ) * 3.0, length( cell ) * 6.0, floor( sc.x ) + floor( sc.y ) * 7.0 ) );
				float top = step( 0.16, vObjA.y ) * uScutes;
				diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * ( 0.8 + ray * 0.5 ) * vec3( 1.1, 0.95, 0.7 ), top * 0.8 );
				diffuseColor.rgb *= 1.0 - seam * 0.6 * top;
				diffuseColor.rgb *= uTint;` );
	} );
	return m;
}

// ---- cache and instances --------------------------------------------------------------------------------------------

const cache = new Map();

// variant keys: 'boar', 'goat:0', 'deer:m', 'cow:h', 'chicken:m', 'nene', 'shark', 'turtle'
export function animalTemplate( species, o = {} ) {
	const key = species + ( o.male ? ':m' : '' ) + ( o.hereford ? ':h' : '' ) + ( o.coat ? ':' + o.coat : '' );
	let t = cache.get( key );
	if ( t ) return t;
	const B = new Builder();
	const k = SPECIES[ species ]( B, o );
	const geo = B.build();
	t = { key, species, geo, bones: B.bones, k, bound: geo.boundingSphere.clone() };
	cache.set( key, t );
	return t;
}

// a skinned mesh with its own skeleton and material; bones by name in .bone
export function animalInstance( t ) {
	const bones = t.bones.map( b => { const o = new THREE.Bone(); o.name = b.name; return o; } );
	t.bones.forEach( ( b, i ) => {
		const o = bones[ i ];
		if ( b.parent >= 0 ) { bones[ b.parent ].add( o ); o.position.copy( b.p ).sub( t.bones[ b.parent ].p ); }
		else o.position.copy( b.p );
	} );
	const mat = animalMaterial( t.k );
	const mesh = new THREE.SkinnedMesh( t.geo, mat );
	mesh.add( bones[ 0 ] );
	mesh.updateMatrixWorld( true );
	mesh.bind( new THREE.Skeleton( bones ) );
	mesh.castShadow = true; mesh.receiveShadow = true;
	mesh.frustumCulled = true;
	mesh.boundingSphere = t.bound.clone();
	mesh.boundingSphere.radius += 0.6;
	const bone = {};
	for ( const b of bones ) { bone[ b.name ] = b; b.userData.rest = b.quaternion.clone(); }
	return { mesh, bone, mat, t };
}

export const SPECIES_LIST = Object.keys( SPECIES );
