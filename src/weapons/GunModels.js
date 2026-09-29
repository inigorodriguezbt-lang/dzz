// Procedural weapon models: a parametric gun generator (AR / AK / pistols / revolvers / SMGs / shotguns / bolt
// actions / battle rifles / bullpups / LMGs / bows), magazines, ammo boxes, attachments, melee weapons and
// throwables. Every model is assembled from bevelled boxes, lathed and extruded profiles, merged per material.
//
// Gun frame: +x towards the muzzle, +y up, +z = the gun's right side (ejection port), bore axis on y = 0,
// x = 0 at the trigger. Moving parts (slide, bolt, pump, cylinder, barrels, lever, trigger, hammer, mag…) are
// separate groups with their pivot at the group origin so the view model can animate them.
//
// Item models (ItemModels.js convention): lying on the ground, origin at the centre of the bottom face, long axis +x.
// The first-person view builds its own upright copy with unfogged materials: buildGunView( def ).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerModelBuilder } from '../render/ItemModels.js';
import { patchMaterial } from '../render/Materials.js';
import { getItem } from '../game/items/ItemDB.js';

const PI = Math.PI;
const V3 = ( x = 0, y = 0, z = 0 ) => new THREE.Vector3( x, y, z );

// ---- materials ------------------------------------------------------------------------------------------------

const MAT = {
	blk: { color: 0x222326, metalness: 0.62, roughness: 0.46, wear: 1 }, // parkerised steel
	blued: { color: 0x1d2024, metalness: 0.88, roughness: 0.3, wear: 1 },
	alu: { color: 0x27292c, metalness: 0.5, roughness: 0.5, wear: 1 }, // anodised aluminium
	poly: { color: 0x1a1a1c, metalness: 0.0, roughness: 0.74, grip: 1 },
	polyS: { color: 0x1c1c1e, metalness: 0.0, roughness: 0.62 },
	tan: { color: 0x9a8461, metalness: 0.0, roughness: 0.7, grip: 1 },
	tanM: { color: 0x8c7856, metalness: 0.35, roughness: 0.55, wear: 1 }, // FDE cerakote metal
	od: { color: 0x4b5137, metalness: 0.0, roughness: 0.72, grip: 1 },
	green: { color: 0x3d4631, metalness: 0.0, roughness: 0.66 },
	gray: { color: 0x3a3d40, metalness: 0.05, roughness: 0.66, grip: 1 },
	wood: { color: 0x8a5130, metalness: 0.0, roughness: 0.52, wood: 1 },
	walnut: { color: 0x5a321b, metalness: 0.0, roughness: 0.45, wood: 1 },
	lam: { color: 0x7a3219, metalness: 0.0, roughness: 0.48, wood: 1 },
	koa: { color: 0x9a5a2a, metalness: 0.0, roughness: 0.42, wood: 1 },
	steel: { color: 0xa7abb0, metalness: 1.0, roughness: 0.3, wear: 1 },
	chrome: { color: 0xd2d5d9, metalness: 1.0, roughness: 0.16 },
	blade: { color: 0xc3c7cb, metalness: 1.0, roughness: 0.22, wear: 1 },
	darkblade: { color: 0x3b3e42, metalness: 0.8, roughness: 0.4, wear: 1 },
	rust: { color: 0x6a4a36, metalness: 0.5, roughness: 0.75, wear: 1 },
	brass: { color: 0xcfa24c, metalness: 1.0, roughness: 0.3 },
	copper: { color: 0xc07a4e, metalness: 1.0, roughness: 0.34 },
	lead: { color: 0x6c6e72, metalness: 0.7, roughness: 0.5 },
	rubber: { color: 0x121213, metalness: 0.0, roughness: 0.92 },
	orange: { color: 0xe0561c, metalness: 0.0, roughness: 0.5 },
	red: { color: 0xa21d17, metalness: 0.0, roughness: 0.48 },
	green2: { color: 0x2c6a2e, metalness: 0.0, roughness: 0.5 },
	plum: { color: 0x6a3426, metalness: 0.0, roughness: 0.62 },
	bakelite: { color: 0x5b2615, metalness: 0.0, roughness: 0.4 },
	smoke: { color: 0x3a3630, metalness: 0.0, roughness: 0.25, transparent: true, opacity: 0.82 },
	card: { color: 0xc9b58c, metalness: 0.0, roughness: 0.9 },
	string: { color: 0x2a2a2a, metalness: 0.0, roughness: 0.85 },
	cloth: { color: 0x2d2a26, metalness: 0.0, roughness: 0.95 },
	white: { color: 0xe9e6de, metalness: 0.0, roughness: 0.5 },
	aluBright: { color: 0x9aa1a8, metalness: 1.0, roughness: 0.34 },
	glassG: { color: 0x2e6a3a, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.72 },
	lens: { color: 0x10263a, metalness: 0.6, roughness: 0.06, transparent: true, opacity: 0.35, lens: 1 },
	lensDark: { color: 0x0a1822, metalness: 0.9, roughness: 0.05, lens: 1 },
	glow: { color: 0x111111, emissive: 0x5cff5c, emissiveIntensity: 0.6, metalness: 0, roughness: 0.4 },
	glowO: { color: 0x111111, emissive: 0xff8a2a, emissiveIntensity: 0.6, metalness: 0, roughness: 0.4 },
	fiber: { color: 0x331100, emissive: 0xff5a20, emissiveIntensity: 1.2, metalness: 0, roughness: 0.3 },
	rag: { color: 0xb8a58a, metalness: 0.0, roughness: 0.95 },
	fuel: { color: 0x9a6a20, metalness: 0.0, roughness: 0.1, transparent: true, opacity: 0.8 },
};

let TEX = null;
function textures() {
	if ( TEX ) return TEX;
	TEX = {};
	if ( typeof document === 'undefined' ) return TEX;
	const mk = ( w, h, fn, srgb = false, rep = [ 1, 1 ] ) => {
		const c = document.createElement( 'canvas' ); c.width = w; c.height = h;
		fn( c.getContext( '2d' ), w, h );
		const t = new THREE.CanvasTexture( c );
		t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.repeat.set( rep[ 0 ], rep[ 1 ] );
		t.anisotropy = 4;
		return t;
	};
	let seed = 7;
	const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	// roughness wear: fine speckle + soft blotches (lighter = rougher)
	TEX.wear = mk( 256, 256, ( g, w, h ) => {
		g.fillStyle = '#b8b8b8'; g.fillRect( 0, 0, w, h );
		for ( let i = 0; i < 90; i ++ ) { const r = 6 + rnd() * 26; const v = 150 + rnd() * 90 | 0; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.beginPath(); g.arc( rnd() * w, rnd() * h, r, 0, 7 ); g.fill(); }
		const d = g.getImageData( 0, 0, w, h );
		for ( let i = 0; i < d.data.length; i += 4 ) { const n = ( rnd() - 0.5 ) * 60; d.data[ i ] = d.data[ i + 1 ] = d.data[ i + 2 ] = Math.max( 0, Math.min( 255, d.data[ i ] + n ) ); }
		g.putImageData( d, 0, 0 );
		// scratches: smoother (darker) streaks
		g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 1;
		for ( let i = 0; i < 70; i ++ ) { const x = rnd() * w, y = rnd() * h, a = rnd() * 6.28, l = 8 + rnd() * 40; g.beginPath(); g.moveTo( x, y ); g.lineTo( x + Math.cos( a ) * l, y + Math.sin( a ) * l ); g.stroke(); }
	}, false, [ 6, 6 ] );
	// polymer stipple bump
	TEX.stipple = mk( 128, 128, ( g, w, h ) => {
		g.fillStyle = '#808080'; g.fillRect( 0, 0, w, h );
		for ( let i = 0; i < 2600; i ++ ) { const v = rnd() < 0.5 ? 40 : 210; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect( rnd() * w, rnd() * h, 1.5, 1.5 ); }
	}, false, [ 40, 40 ] );
	// wood grain (albedo modulation)
	TEX.wood = mk( 512, 128, ( g, w, h ) => {
		g.fillStyle = '#d8d0c8'; g.fillRect( 0, 0, w, h );
		for ( let y = 0; y < h; y ++ ) {
			const band = Math.sin( y * 0.35 + Math.sin( y * 0.05 ) * 4 ) * 0.5 + 0.5;
			for ( let x = 0; x < w; x += 4 ) {
				const wob = Math.sin( x * 0.012 + y * 0.09 ) * 0.5 + Math.sin( x * 0.031 - y * 0.2 ) * 0.25;
				const v = 150 + ( band * 0.6 + wob * 0.4 ) * 70 + ( rnd() - 0.5 ) * 12 | 0;
				g.fillStyle = `rgb(${v},${v * 0.93 | 0},${v * 0.86 | 0})`; g.fillRect( x, y, 4, 1 );
			}
		}
		g.strokeStyle = 'rgba(60,35,20,0.35)';
		for ( let i = 0; i < 26; i ++ ) { const y0 = rnd() * h; g.lineWidth = 0.6 + rnd() * 1.4; g.beginPath(); g.moveTo( 0, y0 ); for ( let x = 0; x <= w; x += 16 ) g.lineTo( x, y0 + Math.sin( x * 0.02 + i ) * 3 + Math.sin( x * 0.07 ) * 1.2 ); g.stroke(); }
	}, true, [ 3, 14 ] );
	return TEX;
}

const MATS = {};
// mode: 'world' (fogged, cloud-shadowed, cast shadows) | 'view' (first-person: no fog, lit by the view scene)
export function weaponMaterials( mode = 'world' ) {
	if ( MATS[ mode ] ) return MATS[ mode ];
	const T = textures();
	const out = {};
	for ( const k in MAT ) {
		const d = MAT[ k ];
		const m = new THREE.MeshStandardMaterial( {
			color: d.color, metalness: d.metalness, roughness: d.roughness, transparent: !! d.transparent, opacity: d.opacity ?? 1,
			emissive: d.emissive ?? 0x000000, emissiveIntensity: d.emissiveIntensity ?? 1,
		} );
		if ( d.wear && T.wear ) m.roughnessMap = T.wear;
		if ( d.grip && T.stipple ) { m.bumpMap = T.stipple; m.bumpScale = 0.6; }
		if ( d.wood && T.wood ) { m.map = T.wood; m.color.multiplyScalar( 1.25 ); }
		if ( d.transparent ) { m.depthWrite = ! d.lens; }
		m.name = 'wpn_' + k;
		if ( mode === 'view' ) {
			m.defines = { NO_ATMOS_FOG: '' };
			patchMaterial( m, 'wpn-view', null, { noCloudShadow: true } );
		} else patchMaterial( m, 'wpn' );
		out[ k ] = m;
	}
	MATS[ mode ] = out;
	return out;
}

// ---- geometry toolkit -----------------------------------------------------------------------------------------

function prep( g ) {
	if ( g.index ) g = g.toNonIndexed();
	for ( const k of Object.keys( g.attributes ) ) if ( ! [ 'position', 'normal', 'uv' ].includes( k ) ) g.deleteAttribute( k );
	if ( ! g.attributes.uv ) g.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( g.attributes.position.count * 2 ), 2 ) );
	if ( ! g.attributes.normal ) g.computeVertexNormals();
	g.clearGroups();
	return g;
}

// rounded polygon outline: pts = [ [ x, y, cornerRadius? ], ... ]
export function shape( pts, holes = [] ) {
	const s = new THREE.Shape();
	outline( s, pts );
	for ( const h of holes ) { const p = new THREE.Path(); outline( p, h ); s.holes.push( p ); }
	return s;
}
function outline( s, pts ) {
	const n = pts.length;
	for ( let i = 0; i < n; i ++ ) {
		const [ x, y, r = 0 ] = pts[ i ];
		if ( ! r ) { if ( i === 0 ) s.moveTo( x, y ); else s.lineTo( x, y ); continue; }
		const [ px, py ] = pts[ ( i - 1 + n ) % n ], [ nx, ny ] = pts[ ( i + 1 ) % n ];
		const d1 = Math.hypot( px - x, py - y ) || 1, d2 = Math.hypot( nx - x, ny - y ) || 1;
		const r1 = Math.min( r, d1 * 0.5 ), r2 = Math.min( r, d2 * 0.5 );
		const ax = x + ( px - x ) / d1 * r1, ay = y + ( py - y ) / d1 * r1;
		const bx = x + ( nx - x ) / d2 * r2, by = y + ( ny - y ) / d2 * r2;
		if ( i === 0 ) s.moveTo( ax, ay ); else s.lineTo( ax, ay );
		s.quadraticCurveTo( x, y, bx, by );
	}
	s.closePath?.();
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// A bag of geometries per material; `sub( name, pivot )` makes a separately animated child.
export class Parts {
	constructor() { this.geo = {}; this.subs = {}; this.pivot = V3(); this.tris = 0; }
	put( mat, g, pos, rot, scl ) {
		if ( pos || rot || scl ) {
			_p.set( ...( pos || [ 0, 0, 0 ] ) ); _e.set( ...( rot || [ 0, 0, 0 ] ) ); _q.setFromEuler( _e ); _s.set( ...( scl || [ 1, 1, 1 ] ) );
			g.applyMatrix4( _m.compose( _p, _q, _s ) );
		}
		g = prep( g );
		( this.geo[ mat ] ||= [] ).push( g );
		return this;
	}
	// axis-aligned box by extents, bevel radius r
	box( mat, x0, x1, y0, y1, z0, z1, r = 0.002, rot = null ) {
		const sx = Math.abs( x1 - x0 ), sy = Math.abs( y1 - y0 ), sz = Math.abs( z1 - z0 );
		const g = r > 0 ? new RoundedBoxGeometry( sx, sy, sz, 1, Math.min( r, sx / 2.01, sy / 2.01, sz / 2.01 ) ) : new THREE.BoxGeometry( sx, sy, sz );
		if ( rot ) g.rotateX( rot[ 0 ] ).rotateY( rot[ 1 ] ).rotateZ( rot[ 2 ] );
		return this.put( mat, g, [ ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 ] );
	}
	// centred box, optional rotation (radians, xyz)
	boxC( mat, cx, cy, cz, sx, sy, sz, r = 0.002, rot = null ) {
		const g = r > 0 ? new RoundedBoxGeometry( sx, sy, sz, 1, Math.min( r, sx / 2.01, sy / 2.01, sz / 2.01 ) ) : new THREE.BoxGeometry( sx, sy, sz );
		return this.put( mat, g, [ cx, cy, cz ], rot );
	}
	// cylinder along +x from x0 (radius r0) to x1 (radius r1)
	cyl( mat, x0, x1, r0, y = 0, z = 0, seg = 14, r1 = r0, rotX = 0 ) {
		const g = new THREE.CylinderGeometry( r1, r0, Math.abs( x1 - x0 ), seg, 1 );
		g.rotateY( rotX ); g.rotateZ( - PI / 2 );
		return this.put( mat, g, [ ( x0 + x1 ) / 2, y, z ] );
	}
	// vertical cylinder
	cylY( mat, x, y0, y1, r0, z = 0, seg = 12, r1 = r0 ) {
		const g = new THREE.CylinderGeometry( r1, r0, Math.abs( y1 - y0 ), seg, 1 );
		return this.put( mat, g, [ x, ( y0 + y1 ) / 2, z ] );
	}
	// cylinder across the gun (along z)
	cylZ( mat, x, y, z0, z1, r0, seg = 12, r1 = r0 ) {
		const g = new THREE.CylinderGeometry( r1, r0, Math.abs( z1 - z0 ), seg, 1 );
		g.rotateX( PI / 2 );
		return this.put( mat, g, [ x, y, ( z0 + z1 ) / 2 ] );
	}
	// generic cylinder between two points
	rod( mat, a, b, r0, seg = 10, r1 = r0 ) {
		const A = V3( ...a ), B = V3( ...b ), d = B.clone().sub( A ), L = d.length();
		const g = new THREE.CylinderGeometry( r1, r0, L, seg, 1 );
		_q.setFromUnitVectors( V3( 0, 1, 0 ), d.normalize() );
		const mid = A.add( B ).multiplyScalar( 0.5 );
		g.applyMatrix4( _m.compose( mid, _q, _s.set( 1, 1, 1 ) ) );
		return this.put( mat, g );
	}
	sphere( mat, x, y, z, r, seg = 10, scl = null ) {
		return this.put( mat, new THREE.SphereGeometry( r, seg, Math.max( 4, seg * 0.6 | 0 ) ), [ x, y, z ], null, scl );
	}
	// lathe around +x: prof = [ [ x, r ], ... ] (x increasing)
	lathe( mat, prof, y = 0, z = 0, seg = 16, phase = 0 ) {
		const pts = prof.map( ( [ x, r ] ) => new THREE.Vector2( Math.max( r, 1e-4 ), x ) );
		const g = new THREE.LatheGeometry( pts, seg, phase );
		g.rotateZ( - PI / 2 ); // lathe axis y -> +x; points (r, x) map to (x, r)
		// rotateZ(-90) maps +y to +x and x to -y: the profile ends up correct because it's rotationally symmetric
		return this.put( mat, g, [ 0, y, z ] );
	}
	// side profile (x, y) extruded between z0 and z1
	ext( mat, pts, z0, z1, bevel = 0.0018, holes = [], curveSeg = 3 ) {
		const s = shape( pts, holes );
		const depth = Math.max( 1e-4, Math.abs( z1 - z0 ) - 2 * bevel );
		let g = new THREE.ExtrudeGeometry( s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: - bevel, bevelSegments: 1, curveSegments: curveSeg } );
		g.translate( 0, 0, Math.min( z0, z1 ) + bevel );
		g = toCreasedNormals( g, 0.7 );
		return this.put( mat, g );
	}
	// symmetric side profile: thickness 2 * hz around z = zc
	extS( mat, pts, hz, bevel = 0.0018, zc = 0, holes = [], curveSeg = 3 ) { return this.ext( mat, pts, zc - hz, zc + hz, bevel, holes, curveSeg ); }
	// top-view profile (x, z) extruded between y0 and y1
	extTop( mat, pts, y0, y1, bevel = 0.0015, curveSeg = 3 ) {
		const s = shape( pts.map( ( [ x, z, r ] ) => [ x, - z, r ] ) );
		const depth = Math.max( 1e-4, Math.abs( y1 - y0 ) - 2 * bevel );
		let g = new THREE.ExtrudeGeometry( s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: - bevel, bevelSegments: 1, curveSegments: curveSeg } );
		g.rotateX( - PI / 2 ); // extrusion (z) -> +y, shape y -> -z (we negated z above)
		g.translate( 0, Math.min( y0, y1 ) + bevel, 0 );
		g = toCreasedNormals( g, 0.7 );
		return this.put( mat, g );
	}
	// front-view profile (z, y) extruded along x between x0 and x1
	extFront( mat, pts, x0, x1, bevel = 0.0015, curveSeg = 3 ) {
		const s = shape( pts );
		const depth = Math.max( 1e-4, Math.abs( x1 - x0 ) - 2 * bevel );
		let g = new THREE.ExtrudeGeometry( s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: - bevel, bevelSegments: 1, curveSegments: curveSeg } );
		g.rotateY( - PI / 2 ); // extrusion +z -> -x, shape x -> +z
		g.translate( Math.max( x0, x1 ) - bevel, 0, 0 );
		g = toCreasedNormals( g, 0.7 );
		return this.put( mat, g );
	}
	torusX( mat, x, y, z, R, r, seg = 12 ) {
		const g = new THREE.TorusGeometry( R, r, 6, seg ); g.rotateY( PI / 2 );
		return this.put( mat, g, [ x, y, z ] );
	}
	// Picatinny rail on top at height y (teeth above y), from x0 to x1, half width hw
	rail( mat, x0, x1, y, hw = 0.0105, dir = 'top' ) {
		const n = Math.max( 1, Math.floor( ( x1 - x0 ) / 0.01 ) );
		if ( dir === 'top' ) {
			this.box( mat, x0, x1, y - 0.006, y, - hw, hw, 0.001 );
			for ( let i = 0; i < n; i ++ ) { const x = x0 + 0.0025 + i * 0.01; if ( x + 0.0055 > x1 ) break; this.box( mat, x, x + 0.0055, y, y + 0.0038, - hw * 0.98, hw * 0.98, 0 ); }
		} else if ( dir === 'bottom' ) {
			this.box( mat, x0, x1, y, y + 0.006, - hw, hw, 0.001 );
			for ( let i = 0; i < n; i ++ ) { const x = x0 + 0.0025 + i * 0.01; if ( x + 0.0055 > x1 ) break; this.box( mat, x, x + 0.0055, y - 0.0038, y, - hw * 0.98, hw * 0.98, 0 ); }
		} else {
			const s = dir === 'right' ? 1 : - 1; // side rail at z = y (the `y` argument is the z plane)
			this.box( mat, x0, x1, - hw, hw, y - s * 0.006, y, 0.001 );
			for ( let i = 0; i < n; i ++ ) { const x = x0 + 0.0025 + i * 0.01; if ( x + 0.0055 > x1 ) break; this.box( mat, x, x + 0.0055, - hw * 0.98, hw * 0.98, y, y + s * 0.0038, 0 ); }
		}
		return this;
	}
	sub( name, x = 0, y = 0, z = 0 ) {
		const p = new Parts(); p.pivot.set( x, y, z ); p.name = name;
		this.subs[ name ] = p;
		return p;
	}
	// geometry per material (merged) — cached by the caller and shared between material modes
	bake() {
		const out = { geo: {}, subs: {}, pivot: this.pivot.clone(), name: this.name };
		for ( const k in this.geo ) {
			const g = mergeGeometries( this.geo[ k ], false );
			g.computeBoundingBox(); g.computeBoundingSphere();
			out.geo[ k ] = g;
		}
		for ( const k in this.subs ) out.subs[ k ] = this.subs[ k ].bake();
		return out;
	}
}

// Object3D from a baked part tree. Sub-part geometry is in the parent frame; its group sits at the pivot.
export function instantiate( baked, mats, shadows = false ) {
	const g = new THREE.Group();
	g.name = baked.name || '';
	for ( const k in baked.geo ) {
		const mesh = new THREE.Mesh( baked.geo[ k ], mats[ k ] || mats.blk );
		mesh.castShadow = shadows && ! mats[ k ]?.transparent; mesh.receiveShadow = shadows;
		if ( baked.pivot.lengthSq() > 0 ) mesh.position.copy( baked.pivot ).negate();
		g.add( mesh );
	}
	g.userData.parts = {};
	for ( const k in baked.subs ) {
		const sb = baked.subs[ k ];
		const child = instantiate( sb, mats, shadows );
		// child meshes are in the parent frame: the group sits at the pivot, meshes offset back by the pivot
		child.position.copy( sb.pivot ).sub( baked.pivot );
		child.userData.rest = child.position.clone();
		g.add( child );
		g.userData.parts[ k ] = child;
		Object.assign( g.userData.parts, child.userData.parts );
	}
	return g;
}

export function countTris( obj ) {
	let n = 0;
	obj.traverse( o => { if ( o.isMesh ) n += ( o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count ) / 3; } );
	return n;
}

// ---- magazines ----------------------------------------------------------------------------------------------------
// Mag frame: top centre at the origin (where it seats in the magwell), body down -y, front +x.

// a curved band profile: centreline bends forward by `bend` over length L, depth d0 at the top and d1 at the bottom
function bandProfile( L, d0, d1, bend, pw = 1.6, n = 8, rBottom = 0.004 ) {
	const front = [], back = [];
	for ( let i = 0; i <= n; i ++ ) {
		const s = i / n;
		const cx = bend * Math.pow( s, pw ), cy = - L * s;
		const dx = bend * pw * Math.pow( Math.max( s, 1e-3 ), pw - 1 ), dy = - L;
		const l = Math.hypot( dx, dy );
		const nx = - dy / l, ny = dx / l; // forward normal
		const d = ( d0 + ( d1 - d0 ) * s ) / 2;
		front.push( [ cx + nx * d, cy + ny * d, i === n ? rBottom : 0 ] );
		back.push( [ cx - nx * d, cy - ny * d, i === n ? rBottom : 0 ] );
	}
	return [ ...front, ...back.reverse() ];
}

const MAG_SHAPES = {
	pistol: { L: 0.118, d: 0.031, w: 0.021, bend: 0, mat: 'blk', base: 'poly' },
	stanag: { L: 0.188, d: 0.062, w: 0.0225, bend: 0.014, pw: 2.2, mat: 'alu', base: 'blk' },
	stanag60: { L: 0.215, d: 0.064, w: 0.046, bend: 0.01, pw: 2, mat: 'poly', base: 'poly' },
	mini14: { L: 0.125, d: 0.058, w: 0.022, bend: 0.01, mat: 'blued', base: 'blued' },
	ak74: { L: 0.215, d: 0.068, d1: 0.074, w: 0.027, bend: 0.075, pw: 1.45, mat: 'plum', base: 'plum', ribs: 1 },
	akm: { L: 0.225, d: 0.07, d1: 0.076, w: 0.028, bend: 0.085, pw: 1.45, mat: 'blued', base: 'blued', ribs: 1 },
	g36: { L: 0.2, d: 0.066, w: 0.025, bend: 0.032, pw: 1.6, mat: 'smoke', base: 'poly', studs: 1 },
	aug: { L: 0.2, d: 0.064, w: 0.025, bend: 0.024, pw: 1.8, mat: 'smoke', base: 'poly' },
	fal: { L: 0.168, d: 0.078, w: 0.027, bend: 0.006, mat: 'blk', base: 'blk' },
	m14: { L: 0.152, d: 0.075, w: 0.026, bend: 0.004, mat: 'blk', base: 'blk' },
	svd: { L: 0.125, d: 0.088, w: 0.03, bend: 0.02, mat: 'blk', base: 'blk', ribs: 1 },
	m82: { L: 0.12, d: 0.112, w: 0.038, bend: 0, mat: 'blk', base: 'blk' },
	cz527: { L: 0.05, d: 0.058, w: 0.022, bend: 0, mat: 'blk', base: 'blk' },
	saiga: { L: 0.2, d: 0.098, w: 0.034, bend: 0.05, pw: 1.5, mat: 'poly', base: 'poly' },
	smg_curved: { L: 0.2, d: 0.034, w: 0.021, bend: 0.036, pw: 1.7, mat: 'blk', base: 'blk' },
	smg: { L: 0.2, d: 0.032, w: 0.021, bend: 0, mat: 'blk', base: 'blk' },
};
// per magazine id tweaks
const MAG_ID = {
	mag_1911: { d: 0.029, w: 0.016, L: 0.108 }, mag_deagle: { d: 0.041, w: 0.022, L: 0.13 }, mag_makarov: { d: 0.028, w: 0.017, L: 0.092 },
	mag_ruger22: { d: 0.024, w: 0.013, L: 0.12 }, mag_m9: { L: 0.122 }, mag_p226: { L: 0.12 }, mag_glock17: { base: 'poly', mat: 'poly' },
	mag_uzi: { L: 0.245, d: 0.034 }, mag_mp7: { L: 0.18, d: 0.024, w: 0.018, mat: 'poly', base: 'poly' }, mag_vector: { L: 0.2, d: 0.034, w: 0.024, mat: 'poly', base: 'poly' },
	mag_mac10: { L: 0.24, d: 0.036, w: 0.024 }, mag_ump45: { L: 0.2, d: 0.041, w: 0.024, mat: 'poly', base: 'poly', bend: 0.006 },
};

export function magParts( def, P = new Parts() ) {
	const spec = def.model || {};
	const shp = spec.shape || 'stanag';
	if ( shp === 'drum' ) {
		// AKM drum: feed tower + round drum
		P.box( 'blk', - 0.034, 0.034, - 0.07, 0.0, - 0.013, 0.013, 0.003 );
		P.cylZ( 'blk', 0.035, - 0.14, - 0.036, 0.036, 0.082, 28 );
		P.cylZ( 'poly', 0.035, - 0.14, - 0.04, 0.04, 0.03, 16 );
		P.cylZ( 'blk', 0.035, - 0.14, - 0.041, 0.041, 0.012, 12 );
		for ( let i = 0; i < 6; i ++ ) { const a = i / 6 * PI * 2; P.box( 'blk', 0.035 + Math.cos( a ) * 0.075 - 0.004, 0.035 + Math.cos( a ) * 0.075 + 0.004, - 0.14 + Math.sin( a ) * 0.075 - 0.004, - 0.14 + Math.sin( a ) * 0.075 + 0.004, - 0.038, 0.038, 0.002 ); }
		topRound( P, 0.0, 0.004, '7.62x39' );
		return P;
	}
	if ( shp === 'box' || shp === 'box_pkm' ) {
		const pk = shp === 'box_pkm';
		const [ sx, sy, sz ] = pk ? [ 0.13, 0.135, 0.078 ] : [ 0.135, 0.12, 0.085 ];
		P.box( 'od', - sx / 2, sx / 2, - sy, - 0.01, - sz / 2, sz / 2, 0.006 );
		P.box( pk ? 'od' : 'od', - sx / 2 - 0.002, sx / 2 + 0.002, - 0.022, - 0.006, - sz / 2 - 0.002, sz / 2 + 0.002, 0.004 ); // lid
		if ( pk ) { P.box( 'blk', - 0.03, 0.03, - 0.006, 0.0, - 0.005, 0.005, 0.002 ); P.cylZ( 'blk', 0, - 0.05, sz / 2, sz / 2 + 0.004, 0.012, 8 ); }
		else { P.box( 'rubber', - sx / 2 + 0.01, sx / 2 - 0.01, - sy * 0.6, - sy * 0.4, sz / 2, sz / 2 + 0.003, 0.002 ); }
		// belt stub: links + rounds leading up into the feed tray
		for ( let i = 0; i < 4; i ++ ) {
			const x = - 0.03 + i * 0.0105;
			P.cylZ( 'brass', x, 0.004, - 0.024, 0.02, 0.0046, 8 );
			P.cylZ( 'copper', x, 0.004, 0.02, 0.028, 0.0046, 8, 0.0015 );
			P.box( 'blk', x - 0.004, x + 0.004, - 0.003, 0.009, - 0.02, 0.012, 0 );
		}
		return P;
	}
	const S = { ...MAG_SHAPES[ shp ] || MAG_SHAPES.stanag, ...( MAG_ID[ def.id ] || {} ) };
	const L = S.L, d = S.d, w = S.w;
	const prof = bandProfile( L, d, S.d1 ?? d, S.bend || 0, S.pw || 1.6, S.bend ? 8 : 1, 0.004 );
	P.extS( S.mat, prof, w / 2, 0.0022 );
	if ( S.ribs ) {
		const inner = bandProfile( L * 0.86, d * 0.72, ( S.d1 ?? d ) * 0.72, ( S.bend || 0 ) * 0.86, S.pw || 1.6, 6, 0.004 ).map( ( [ x, y, r ] ) => [ x, y - L * 0.06, r ] );
		P.extS( S.mat, inner, w / 2 + 0.0012, 0.001 );
	}
	if ( S.studs ) for ( const s of [ - 1, 1 ] ) P.cylZ( 'poly', - d * 0.3, - 0.03, s * w / 2, s * ( w / 2 + 0.004 ), 0.005, 8 );
	// base plate at the end of the curve
	const bx = S.bend || 0, by = - L;
	const ang = S.bend ? Math.atan2( ( S.bend * ( S.pw || 1.6 ) ), L ) : 0;
	P.boxC( S.base, bx, by - 0.004, 0, ( S.d1 ?? d ) + 0.006, 0.009, w + 0.004, 0.003, [ 0, 0, ang ] );
	// feed lips + the top round
	P.box( S.mat === 'smoke' ? 'poly' : S.mat, - d / 2, d / 2 * 0.6, - 0.012, 0.0, - w / 2 - 0.0005, w / 2 + 0.0005, 0.0015 );
	topRound( P, - d * 0.1, 0.004, def.magazine?.caliber, Math.min( d * 0.8, 0.07 ) );
	return P;
}

// a cartridge lying along +x with its base at x
export function cartridge( P, x, y, z, cal, len = null, dir = 1 ) {
	const C = CAL[ cal ] || CAL[ '5.56' ];
	const l = len ?? C.len;
	const case_ = l * C.caseF, r = C.r;
	if ( cal === '12ga' ) {
		P.cyl( 'brass', x, x + dir * 0.012, r * 1.04, y, z, 10 );
		P.cyl( 'red', x + dir * 0.012, x + dir * l, r, y, z, 10 );
		return P;
	}
	P.cyl( 'brass', x, x + dir * case_, r, y, z, 8, r * C.neck );
	P.cyl( C.tip || 'copper', x + dir * case_, x + dir * l, r * C.neck * 0.95, y, z, 8, r * 0.25 );
	return P;
}
const CAL = {
	'9mm': { len: 0.029, r: 0.0049, caseF: 0.66, neck: 0.98 }, '.45acp': { len: 0.032, r: 0.006, caseF: 0.7, neck: 0.98 },
	'.357': { len: 0.04, r: 0.0048, caseF: 0.8, neck: 0.98, tip: 'lead' }, '.44mag': { len: 0.041, r: 0.0057, caseF: 0.78, neck: 0.98, tip: 'lead' },
	'.50ae': { len: 0.041, r: 0.0069, caseF: 0.73, neck: 0.98 }, '.22lr': { len: 0.025, r: 0.0029, caseF: 0.62, neck: 0.98, tip: 'lead' },
	'9x18': { len: 0.025, r: 0.0049, caseF: 0.7, neck: 0.98 }, '5.56': { len: 0.057, r: 0.0048, caseF: 0.78, neck: 0.64 },
	'5.45': { len: 0.057, r: 0.005, caseF: 0.7, neck: 0.62 }, '7.62x39': { len: 0.056, r: 0.0056, caseF: 0.7, neck: 0.72 },
	'.308': { len: 0.071, r: 0.006, caseF: 0.72, neck: 0.72 }, '7.62x54r': { len: 0.077, r: 0.0062, caseF: 0.7, neck: 0.7 },
	'.50bmg': { len: 0.138, r: 0.0102, caseF: 0.72, neck: 0.62 }, '12ga': { len: 0.07, r: 0.0105, caseF: 1, neck: 1 },
	'.30-30': { len: 0.064, r: 0.0053, caseF: 0.8, neck: 0.72, tip: 'lead' }, '4.6x30': { len: 0.038, r: 0.0041, caseF: 0.78, neck: 0.62 },
	flare: { len: 0.07, r: 0.0105, caseF: 1, neck: 1 },
};
export const CALIBERS = CAL;

function topRound( P, x, y, cal, len = null ) {
	const C = CAL[ cal ] || CAL[ '5.56' ];
	const l = Math.min( len ?? C.len, C.len );
	cartridge( P, x - l * 0.45, y + C.r * 0.2, 0, cal, l );
}

// ---- gun archetypes --------------------------------------------------------------------------------------------------
// Each returns { P, info }. info: sockets and hand grips in the gun frame.
//   sightH: iron sight line height; rearX: rear aperture x; eyeBack: eye distance behind the rear sight
//   muzzle / eject / light: [ x, y, z ]; mag: { p, rake }; optic: [ x, y ] (rail top where optics sit)
//   grips: { R: { p, a, n, r, trig }, L: { ... } } — p grip centre, a knuckle line (pinky -> index), n back-of-hand dir
//   hideWithOptic: part names folded / removed when an optic is mounted

const grip = ( p, a, n, r = 0.016, extra = {} ) => ( { p: V3( ...p ), a: V3( ...a ).normalize(), n: V3( ...n ).normalize(), r, ...extra } );

// pistol grip profile raked back: top front (tx, ty), length h, rake angle (rad), depth dTop/dBot
function pistolGrip( P, mat, tx, ty, h, rake, dTop, dBot, hz, bevel = 0.004, finger = 0 ) {
	const sx = Math.sin( rake ), cy = Math.cos( rake );
	const bx = tx - sx * h, by = ty - cy * h;
	const pts = [
		[ tx, ty ], [ tx - dTop, ty ],
		[ bx - dBot - 0.004, by + 0.004, 0.012 ], [ bx - 0.002, by - 0.002, 0.01 ],
	];
	if ( finger ) {
		for ( let i = 3; i >= 1; i -- ) { const t = i / 4; pts.push( [ tx - sx * h * t + ( i % 2 ? 0.0 : 0.003 ), ty - cy * h * t, 0.008 ] ); }
	}
	P.extS( mat, pts, hz, bevel, 0, [], 4 );
	return { p: V3( tx - dTop * 0.5 - sx * h * 0.45, ty - cy * h * 0.45, 0 ), a: V3( sx, cy, 0 ), bottom: V3( bx - dBot / 2, by, 0 ) };
}

function triggerGuard( P, mat, x0, x1, y0, depth, hz = 0.005 ) {
	P.extS( mat, [ [ x0, y0 ], [ x1, y0 ], [ x1, y0 - depth, 0.008 ], [ x0 + 0.004, y0 - depth, 0.006 ] ], hz, 0.0012,
		0, [ [ [ x0 + 0.005, y0 - 0.002 ], [ x1 - 0.005, y0 - 0.002 ], [ x1 - 0.005, y0 - depth + 0.005, 0.006 ], [ x0 + 0.008, y0 - depth + 0.005, 0.004 ] ] ] );
}

function trigger( P, x, y, len = 0.02 ) {
	const t = P.sub( 'trigger', x, y, 0 );
	t.extS( 'blk', [ [ x - 0.003, y ], [ x + 0.004, y ], [ x + 0.001, y - len * 0.6, 0.006 ], [ x - 0.004, y - len, 0.002 ], [ x - 0.006, y - len * 0.95 ], [ x - 0.002, y - len * 0.55, 0.006 ] ], 0.003, 0.0008 );
	return t;
}

// ---- AR-15 family ----
function arRifle( o ) {
	const P = new Parts();
	const v = o.v || 'm4';
	const barrelL = { m4: 0.368, m16: 0.508, '416': 0.368, civ: 0.406 }[ v ];
	const bEnd = 0.12 + barrelL;
	const hgEnd = { m4: 0.3, m16: 0.43, '416': 0.37, civ: 0.405 }[ v ];
	const furn = v === 'civ' ? 'poly' : 'poly';
	// upper receiver
	P.box( 'alu', - 0.125, 0.12, - 0.018, 0.034, - 0.0145, 0.0145, 0.004 );
	P.box( 'alu', 0.1, 0.125, - 0.02, 0.03, - 0.016, 0.016, 0.004 ); // barrel nut shoulder
	P.rail( 'alu', - 0.122, 0.118, 0.041 );
	// ejection port / dust cover / brass deflector / forward assist
	P.box( 'blk', - 0.028, 0.048, - 0.004, 0.021, 0.013, 0.0165, 0.001 );
	P.box( 'alu', - 0.058, - 0.034, 0.0, 0.03, 0.012, 0.021, 0.003 );
	P.cyl( 'blk', - 0.108, - 0.07, 0.0075, 0.016, 0.019, 10, 0.006 );
	// lower receiver with the magwell
	P.extS( 'alu', [ [ - 0.128, - 0.017 ], [ 0.122, - 0.017 ], [ 0.122, - 0.03 ], [ 0.117, - 0.074 ], [ 0.114, - 0.08, 0.003 ], [ 0.05, - 0.08, 0.003 ], [ 0.046, - 0.05 ], [ - 0.045, - 0.05 ], [ - 0.105, - 0.045 ], [ - 0.128, - 0.032, 0.008 ] ], 0.0148, 0.002 );
	P.box( 'alu', 0.048, 0.118, - 0.08, - 0.06, - 0.0165, 0.0165, 0.002 ); // flared magwell
	triggerGuard( P, 'alu', - 0.038, 0.05, - 0.048, 0.03 );
	trigger( P, 0.0, - 0.05 );
	// controls: selector, mag release, bolt catch, takedown pins
	P.box( 'blk', - 0.07, - 0.05, - 0.03, - 0.024, - 0.018, - 0.0145, 0.001 );
	P.cylZ( 'blk', - 0.06, - 0.027, - 0.019, - 0.0145, 0.005, 8 );
	P.cylZ( 'blk', 0.04, - 0.035, 0.0145, 0.019, 0.005, 8 );
	P.box( 'blk', 0.024, 0.044, - 0.034, - 0.02, - 0.018, - 0.0145, 0.001 );
	P.cylZ( 'steel', 0.105, - 0.024, - 0.0155, 0.0155, 0.0022, 6 );
	P.cylZ( 'steel', - 0.108, - 0.024, - 0.0155, 0.0155, 0.0022, 6 );
	// pistol grip
	const g = pistolGrip( P, furn, - 0.036, - 0.046, 0.1, 0.36, 0.036, 0.032, 0.0135, 0.004, 1 );
	// buffer tube + stock
	P.cyl( 'alu', - 0.135, - 0.125, 0.0175, 0.004, 0, 14 );
	if ( v === 'm16' ) {
		P.extS( 'poly', [ [ - 0.128, 0.022 ], [ - 0.43, 0.024, 0.004 ], [ - 0.435, - 0.088, 0.006 ], [ - 0.4, - 0.09 ], [ - 0.2, - 0.045 ], [ - 0.128, - 0.034, 0.006 ] ], 0.018, 0.004 );
		P.box( 'rubber', - 0.447, - 0.432, - 0.09, 0.026, - 0.019, 0.019, 0.004 );
		P.box( 'blk', - 0.425, - 0.395, - 0.07, - 0.02, 0.0175, 0.0195, 0.002 ); // trapdoor
	} else {
		P.cyl( 'alu', - 0.34, - 0.13, 0.0152, 0.004, 0, 14 );
		P.cyl( 'alu', - 0.14, - 0.13, 0.019, 0.004, 0, 10 ); // castle nut
		const sm = v === 'civ' ? 'poly' : 'poly';
		P.extS( sm, [ [ - 0.24, 0.024, 0.004 ], [ - 0.355, 0.026, 0.004 ], [ - 0.362, - 0.072, 0.008 ], [ - 0.33, - 0.074, 0.004 ], [ - 0.262, - 0.024 ], [ - 0.24, - 0.014, 0.004 ] ], 0.0175, 0.004 );
		P.box( 'rubber', - 0.372, - 0.358, - 0.076, 0.028, - 0.0195, 0.0195, 0.004 );
		P.box( sm, - 0.25, - 0.24, - 0.03, - 0.012, - 0.012, 0.012, 0.002 ); // lever
	}
	// charging handle (animated with the bolt)
	const ch = P.sub( 'charge', - 0.13, 0.03, 0 );
	ch.box( 'alu', - 0.142, - 0.122, 0.024, 0.034, - 0.022, 0.022, 0.003 );
	ch.box( 'alu', - 0.126, - 0.06, 0.026, 0.033, - 0.006, 0.006, 0.001 );
	// bolt carrier face visible through the port
	const bolt = P.sub( 'bolt', 0.0, 0.008, 0.01 );
	bolt.box( 'steel', - 0.03, 0.045, 0.0, 0.017, 0.006, 0.0125, 0.001 );
	// barrel
	P.cyl( 'blued', 0.12, bEnd, 0.0095, 0, 0, 14, 0.0088 );
	// handguard
	if ( v === 'm4' || v === 'm16' ) {
		P.cyl( 'alu', 0.117, 0.13, 0.03, 0, 0, 18 ); // delta ring
		P.box( 'alu', 0.13, hgEnd, - 0.026, 0.026, - 0.026, 0.026, 0.009 );
		P.rail( 'alu', 0.132, hgEnd - 0.004, 0.035, 0.0105, 'top' );
		P.rail( 'alu', 0.132, hgEnd - 0.004, - 0.035, 0.0105, 'bottom' );
		P.rail( 'alu', 0.132, hgEnd - 0.004, 0.035, 0.0105, 'right' );
		P.rail( 'alu', 0.132, hgEnd - 0.004, - 0.035, 0.0105, 'left' );
		P.cyl( 'alu', hgEnd, hgEnd + 0.01, 0.024, 0, 0, 14 );
	} else if ( v === '416' ) {
		P.box( 'alu', 0.12, hgEnd, - 0.027, 0.027, - 0.027, 0.027, 0.01 );
		P.rail( 'alu', 0.122, hgEnd - 0.002, 0.041, 0.0105, 'top' );
		P.box( 'alu', 0.122, hgEnd - 0.002, 0.027, 0.035, - 0.011, 0.011, 0.001 );
		P.rail( 'alu', 0.126, hgEnd - 0.004, - 0.036, 0.0105, 'bottom' );
		P.rail( 'alu', 0.126, hgEnd - 0.004, 0.036, 0.0105, 'right' );
		P.rail( 'alu', 0.126, hgEnd - 0.004, - 0.036, 0.0105, 'left' );
	} else {
		P.cyl( 'alu', 0.12, hgEnd, 0.026, 0, 0, 8, 0.026, PI / 8 );
		P.rail( 'alu', 0.122, hgEnd - 0.002, 0.041, 0.0105, 'top' );
		P.box( 'alu', 0.122, hgEnd - 0.002, 0.022, 0.035, - 0.011, 0.011, 0.001 );
		for ( let i = 0; i < 6; i ++ ) for ( const s of [ - 1, 1 ] ) P.boxC( 'blk', 0.16 + i * 0.04, - 0.004, s * 0.0245, 0.024, 0.008, 0.004, 0.002, [ s * 0.0, 0, 0 ] );
	}
	// front sight: A-frame on the gas block (m4, m16) or folding sights (416, civ)
	const fsx = v === 'm16' ? 0.545 : v === 'm4' ? 0.34 : 0;
	const sightH = 0.066;
	if ( fsx ) {
		P.cyl( 'blk', fsx - 0.017, fsx + 0.017, 0.0135, 0, 0, 12 );
		P.extS( 'blk', [ [ fsx - 0.02, - 0.004 ], [ fsx + 0.02, - 0.004 ], [ fsx + 0.012, 0.03 ], [ fsx + 0.009, 0.047 ], [ fsx - 0.009, 0.047 ], [ fsx - 0.014, 0.03 ] ], 0.0085, 0.0015 );
		for ( const s of [ - 1, 1 ] ) P.box( 'blk', fsx - 0.009, fsx + 0.009, 0.045, 0.07, s * 0.0055, s * 0.0095, 0.0012 );
		P.box( 'blk', fsx - 0.0022, fsx + 0.0022, 0.045, sightH, - 0.0014, 0.0014, 0 );
		P.box( 'blk', fsx - 0.006, fsx + 0.012, - 0.03, - 0.012, - 0.004, 0.004, 0.001 ); // bayonet lug
	} else {
		const f = P.sub( 'buisF', hgEnd - 0.02, 0.045, 0 );
		const x = hgEnd - 0.02;
		f.box( 'blk', x - 0.012, x + 0.012, 0.045, 0.052, - 0.011, 0.011, 0.001 );
		for ( const s of [ - 1, 1 ] ) f.box( 'blk', x - 0.005, x + 0.005, 0.05, 0.072, s * 0.005, s * 0.009, 0.0012 );
		f.box( 'blk', x - 0.0022, x + 0.0022, 0.05, sightH, - 0.0014, 0.0014, 0 );
	}
	// muzzle: A2 birdcage
	P.lathe( 'blk', [ [ bEnd - 0.002, 0.0 ], [ bEnd - 0.002, 0.0105 ], [ bEnd + 0.045, 0.0112 ], [ bEnd + 0.052, 0.0105 ], [ bEnd + 0.052, 0.0 ] ], 0, 0, 14 );
	for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2 + 0.4; P.boxC( 'rubber', bEnd + 0.027, Math.sin( a ) * 0.0105, Math.cos( a ) * 0.0105, 0.028, 0.004, 0.004, 0.001, [ a, 0, 0 ] ); }
	// rear sight: folding BUIS or the M16 carry handle
	const rearX = - 0.1;
	if ( v === 'm16' ) {
		const c = P.sub( 'carry', 0, 0.045, 0 );
		c.extS( 'alu', [ [ - 0.118, 0.045 ], [ 0.05, 0.045 ], [ 0.05, 0.058, 0.006 ], [ 0.03, 0.098, 0.01 ], [ - 0.078, 0.098, 0.004 ], [ - 0.084, 0.08 ], [ - 0.118, 0.08, 0.004 ] ], 0.0105, 0.0025,
			0, [ [ [ - 0.07, 0.055 ], [ 0.02, 0.055 ], [ 0.02, 0.085, 0.01 ], [ - 0.07, 0.085, 0.005 ] ] ] );
		c.box( 'blk', - 0.106, - 0.094, 0.06, 0.074, - 0.009, 0.009, 0.0015 );
		c.torusX( 'blk', - 0.1, sightH, 0, 0.0032, 0.0014, 10 );
		c.cylZ( 'blk', - 0.09, 0.07, 0.0105, 0.016, 0.006, 10 ); // windage knob
	} else {
		const r = P.sub( 'buisR', rearX, 0.045, 0 );
		r.box( 'blk', rearX - 0.014, rearX + 0.012, 0.045, 0.053, - 0.011, 0.011, 0.001 );
		r.box( 'blk', rearX - 0.002, rearX + 0.002, 0.052, 0.061, - 0.008, 0.008, 0.001 );
		for ( const s of [ - 1, 1 ] ) r.box( 'blk', rearX - 0.004, rearX + 0.004, 0.052, 0.074, s * 0.0065, s * 0.0105, 0.0012 );
		r.torusX( 'blk', rearX, sightH, 0, 0.0034, 0.0015, 10 );
	}
	const hideWithOptic = v === 'm16' ? [ 'carry' ] : [ 'buisR', 'buisF' ];
	return {
		P, info: {
			sightH, rearX, eyeBack: 0.085, muzzle: [ bEnd + 0.052, 0, 0 ], eject: [ 0.01, 0.01, 0.018 ],
			mag: { p: [ 0.083, - 0.022, 0 ], rake: 0 }, magSide: v ? null : null,
			optic: [ - 0.03, 0.0448 ], light: [ hgEnd - 0.05, 0.0, 0.044 ], hideWithOptic,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ 0.0, - 0.058, 0 ] } ),
				L: grip( [ Math.min( 0.23, hgEnd - 0.07 ), - 0.004, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.03 ),
			},
			stock: - 0.37, len: bEnd + 0.052 + 0.37, charge: 'charge', bolt: 'bolt', boltTravel: 0.075,
		},
	};
}

// ---- Kalashnikov family (+ Saiga-12) ----
function akRifle( o ) {
	const P = new Parts();
	const v = o.v || 'm';
	const is74 = v === '74', saiga = v === 'saiga';
	const furn = is74 ? 'poly' : saiga ? 'poly' : 'lam';
	const bEnd = saiga ? 0.54 : 0.535;
	const br = saiga ? 0.0125 : 0.0088;
	// receiver
	P.box( 'blued', - 0.17, 0.115, - 0.046, 0.012, - 0.0135, 0.0135, 0.003 );
	P.box( 'blued', 0.07, 0.125, - 0.035, 0.018, - 0.0145, 0.0145, 0.003 ); // trunnion
	// dust cover: rounded top
	P.extFront( 'blued', [ [ - 0.0135, 0.008 ], [ 0.0135, 0.008 ], [ 0.0135, 0.02, 0.006 ], [ 0.0, 0.027, 0.01 ], [ - 0.0135, 0.02, 0.006 ] ], - 0.168, 0.075, 0.001 );
	P.box( 'blued', - 0.176, - 0.162, 0.006, 0.03, - 0.004, 0.004, 0.002 ); // cover latch button
	P.box( 'blk', - 0.03, 0.06, - 0.008, 0.014, 0.012, 0.0145, 0.001 ); // ejection port
	// safety lever on the right
	P.box( 'blued', - 0.13, 0.03, - 0.01, - 0.002, 0.0138, 0.0158, 0.001, [ 0, 0, 0.06 ] );
	// charging handle (bolt carrier)
	const bolt = P.sub( 'bolt', 0.06, 0.004, 0.015 );
	bolt.box( 'steel', - 0.02, 0.07, - 0.004, 0.012, 0.012, 0.016, 0.001 );
	bolt.cylZ( 'blued', 0.065, 0.004, 0.014, 0.036, 0.004, 8 );
	bolt.sphere( 'blued', 0.065, 0.004, 0.037, 0.0055, 8 );
	// rear sight block + leaf
	const sightH = saiga ? 0.04 : 0.043;
	P.box( 'blued', 0.115, 0.165, 0.0, 0.028, - 0.012, 0.012, 0.003 );
	P.box( 'blued', 0.118, 0.16, 0.026, 0.032, - 0.009, 0.009, 0.001 );
	P.box( 'blued', 0.128, 0.134, 0.028, sightH + 0.004, - 0.0085, 0.0085, 0.0008 );
	P.box( 'rubber', 0.1265, 0.1355, sightH - 0.002, sightH + 0.0042, - 0.0012, 0.0012, 0 ); // notch
	// gas tube + upper handguard
	P.cyl( 'blued', 0.16, 0.405, 0.0095, 0.028, 0, 12 );
	P.extFront( furn, [ [ - 0.016, 0.014 ], [ 0.016, 0.014 ], [ 0.017, 0.03, 0.008 ], [ 0, 0.043, 0.012 ], [ - 0.017, 0.03, 0.008 ] ], 0.168, 0.33, 0.003 );
	// lower handguard with the grooves
	P.box( furn, 0.13, 0.36, - 0.034, 0.012, - 0.026, 0.026, 0.012 );
	for ( const s of [ - 1, 1 ] ) P.box( furn === 'lam' ? 'walnut' : 'rubber', 0.16, 0.33, - 0.02, - 0.012, s * 0.0255, s * 0.027, 0.002 );
	P.box( 'blued', 0.125, 0.135, - 0.036, 0.016, - 0.022, 0.022, 0.002 ); // retainer
	P.box( 'blued', 0.36, 0.372, - 0.033, 0.015, - 0.02, 0.02, 0.003 );
	// barrel, gas block, front sight
	P.cyl( 'blued', 0.12, bEnd, br, 0, 0, 14 );
	if ( ! saiga ) {
		P.box( 'blued', 0.39, 0.42, - 0.012, 0.04, - 0.012, 0.012, 0.004 );
		P.box( 'blued', 0.485, 0.51, - 0.013, 0.02, - 0.011, 0.011, 0.004 );
		P.cyl( 'blued', 0.487, 0.508, 0.0125, 0.03, 0, 10 );
		for ( const s of [ - 1, 1 ] ) P.box( 'blued', 0.488, 0.507, 0.02, sightH + 0.012, s * 0.0065, s * 0.0105, 0.002 );
		P.box( 'blued', 0.4955, 0.4995, 0.02, sightH, - 0.0013, 0.0013, 0 );
	} else {
		P.box( 'blued', 0.39, 0.42, - 0.015, 0.035, - 0.013, 0.013, 0.004 );
		P.box( 'blued', 0.52, 0.53, 0.0, sightH, - 0.0015, 0.0015, 0 );
		P.cyl( 'blued', 0.4, 0.5, 0.009, 0.026, 0, 10 );
	}
	// muzzle device
	if ( is74 ) {
		P.lathe( 'blued', [ [ bEnd, 0 ], [ bEnd, 0.011 ], [ bEnd + 0.012, 0.0125 ], [ bEnd + 0.08, 0.0125 ], [ bEnd + 0.083, 0.01 ], [ bEnd + 0.083, 0 ] ], 0, 0, 16 );
		for ( let i = 0; i < 2; i ++ ) P.boxC( 'rubber', bEnd + 0.045 + i * 0.02, 0, 0, 0.008, 0.012, 0.0265, 0.001 );
	} else if ( ! saiga ) {
		P.lathe( 'blued', [ [ bEnd, 0 ], [ bEnd, 0.0105 ], [ bEnd + 0.036, 0.0105 ], [ bEnd + 0.038, 0.009 ], [ bEnd + 0.038, 0 ] ], 0, 0, 12 );
		P.boxC( 'rubber', bEnd + 0.028, 0.009, 0, 0.012, 0.004, 0.012, 0.001, [ 0, 0, 0.5 ] );
	} else P.lathe( 'blued', [ [ bEnd, 0 ], [ bEnd, 0.0145 ], [ bEnd + 0.03, 0.0145 ], [ bEnd + 0.03, 0 ] ], 0, 0, 14 );
	// trigger group, grip, stock
	triggerGuard( P, 'blued', - 0.028, 0.058, - 0.045, 0.032 );
	trigger( P, 0.005, - 0.047 );
	const g = pistolGrip( P, is74 || saiga ? 'poly' : 'bakelite', - 0.032, - 0.045, 0.098, 0.4, 0.034, 0.03, 0.0135, 0.004, 0 );
	P.box( 'blued', 0.056, 0.068, - 0.06, - 0.045, - 0.006, 0.006, 0.001 ); // mag release
	if ( is74 || saiga ) {
		// AK-74M side-folding polymer stock
		P.extS( 'poly', [ [ - 0.168, 0.004 ], [ - 0.43, - 0.024, 0.004 ], [ - 0.435, - 0.14, 0.008 ], [ - 0.408, - 0.145, 0.004 ], [ - 0.3, - 0.076 ], [ - 0.168, - 0.046, 0.004 ] ], 0.0165, 0.004,
			0, [ [ [ - 0.31, - 0.02 ], [ - 0.39, - 0.033 ], [ - 0.39, - 0.09, 0.01 ], [ - 0.34, - 0.07 ] ] ] );
		P.box( 'rubber', - 0.445, - 0.43, - 0.146, - 0.02, - 0.018, 0.018, 0.004 );
	} else {
		P.extS( 'lam', [ [ - 0.168, 0.006 ], [ - 0.43, - 0.03, 0.004 ], [ - 0.436, - 0.142, 0.006 ], [ - 0.4, - 0.146, 0.004 ], [ - 0.24, - 0.085 ], [ - 0.168, - 0.046, 0.006 ] ], 0.0175, 0.005 );
		P.box( 'blued', - 0.446, - 0.432, - 0.146, - 0.026, - 0.019, 0.019, 0.003 ); // butt plate
	}
	// optic side mount (shown with an optic)
	const m = P.sub( 'mount', - 0.03, 0.045, 0 );
	m.box( 'blued', - 0.08, 0.03, - 0.02, 0.0, - 0.022, - 0.0135, 0.002 );
	m.box( 'blued', - 0.08, 0.03, 0.0, 0.032, - 0.022, - 0.008, 0.003 );
	m.box( 'blued', - 0.08, 0.03, 0.032, 0.042, - 0.012, 0.012, 0.002 );
	m.rail( 'blued', - 0.078, 0.028, 0.048, 0.0105 );
	return {
		P, info: {
			sightH, rearX: 0.131, eyeBack: 0.2, muzzle: [ bEnd + ( is74 ? 0.083 : saiga ? 0.03 : 0.038 ), 0, 0 ], eject: [ 0.02, 0.006, 0.016 ],
			mag: { p: [ 0.078, - 0.042, 0 ], rake: 0 }, optic: [ - 0.03, 0.0518 ], opticParts: [ 'mount' ], light: [ 0.3, - 0.01, 0.03 ],
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.016, { trig: [ 0.005, - 0.055, 0 ] } ),
				L: grip( [ 0.25, - 0.012, 0 ], [ 1, 0.08, 0 ], [ 0, - 0.75, - 0.66 ], 0.028 ),
			},
			stock: - 0.44, len: bEnd + 0.44 + 0.08, bolt: 'bolt', boltTravel: 0.09, chargeSide: 1,
		},
	};
}

// ---- pistols ----
function pistol( o ) {
	const P = new Parts();
	const v = o.v || 'glock';
	const S = {
		glock: { xr: - 0.07, xf: 0.113, top: 0.021, bot: - 0.009, hz: 0.0125, sb: 0.003, slide: 'blk', frame: 'poly', grip: 'poly', rake: 0.38, gh: 0.1, gd: 0.036, hammer: 0 },
		m9: { xr: - 0.078, xf: 0.12, top: 0.019, bot: - 0.009, hz: 0.0122, sb: 0.004, slide: 'blk', frame: 'alu', grip: 'poly', rake: 0.3, gh: 0.1, gd: 0.036, hammer: 1, open: 1 },
		'1911': { xr: - 0.082, xf: 0.128, top: 0.018, bot: - 0.008, hz: 0.0112, sb: 0.002, slide: 'blued', frame: 'blued', grip: 'walnut', rake: 0.32, gh: 0.098, gd: 0.032, hammer: 1, beaver: 1 },
		p226: { xr: - 0.074, xf: 0.114, top: 0.021, bot: - 0.009, hz: 0.0125, sb: 0.006, slide: 'blk', frame: 'alu', grip: 'poly', rake: 0.3, gh: 0.1, gd: 0.037, hammer: 1 },
		deagle: { xr: - 0.095, xf: 0.032, top: 0.028, bot: - 0.01, hz: 0.0165, sb: 0.004, slide: 'steel', frame: 'steel', grip: 'rubber', rake: 0.3, gh: 0.108, gd: 0.044, hammer: 1, deagle: 1 },
		makarov: { xr: - 0.062, xf: 0.097, top: 0.018, bot: - 0.008, hz: 0.0112, sb: 0.007, slide: 'blued', frame: 'blued', grip: 'bakelite', rake: 0.3, gh: 0.088, gd: 0.032, hammer: 1 },
		ruger: { xr: - 0.075, xf: 0.04, top: 0.02, bot: - 0.006, hz: 0.012, sb: 0.004, slide: 'blk', frame: 'blk', grip: 'poly', rake: 0.55, gh: 0.1, gd: 0.036, hammer: 0, ruger: 1 },
	}[ v ];
	const { xr, xf, top, bot, hz } = S;
	const sightH = top + 0.006;
	const slide = P.sub( 'slide', 0, 0, 0 );
	if ( S.ruger ) {
		// tubular receiver + bull barrel, the bolt is the "slide"
		P.cyl( 'blk', xr, 0.045, 0.0125, 0.008, 0, 16 );
		P.cyl( 'blk', 0.045, 0.165, 0.0112, 0.004, 0, 16 );
		P.box( 'blk', xr, 0.165, - 0.006, 0.006, - 0.009, 0.009, 0.002 );
		slide.box( 'steel', xr - 0.006, xr + 0.004, 0.004, 0.018, - 0.013, 0.013, 0.002 );
		P.box( 'blk', xr + 0.004, xr + 0.016, 0.018, sightH + 0.002, - 0.007, 0.007, 0.001 );
		P.box( 'blk', 0.152, 0.16, 0.012, sightH, - 0.0014, 0.0014, 0.0005 );
		P.box( 'blk', xr + 0.01, 0.05, - 0.024, - 0.004, - 0.011, 0.011, 0.003 );
	} else if ( S.deagle ) {
		// fixed triangular barrel with a top rail, slide at the back
		P.extFront( S.frame, [ [ - 0.012, - 0.012 ], [ 0.012, - 0.012 ], [ 0.012, 0.012, 0.003 ], [ 0.006, 0.03, 0.002 ], [ - 0.006, 0.03, 0.002 ], [ - 0.012, 0.012, 0.003 ] ], 0.028, 0.17, 0.0015 );
		P.box( 'blk', 0.03, 0.168, 0.03, 0.034, - 0.0045, 0.0045, 0.0008 );
		P.cyl( 'blk', 0.168, 0.172, 0.005, 0.0, 0, 10 );
		slide.box( S.slide, xr, xf, bot, top, - hz, hz, S.sb );
		for ( let i = 0; i < 7; i ++ ) slide.box( 'blk', xr + 0.006 + i * 0.005, xr + 0.008 + i * 0.005, bot + 0.006, top - 0.004, - hz - 0.0005, hz + 0.0005, 0 );
		slide.box( 'blk', xr + 0.002, xr + 0.014, top, top + 0.008, - 0.006, 0.006, 0.001 );
		P.box( 'blk', 0.158, 0.164, 0.03, 0.04, - 0.0014, 0.0014, 0.0005 );
		P.box( S.frame, xr + 0.01, 0.12, - 0.03, - 0.01, - 0.013, 0.013, 0.004 );
	} else {
		// slide
		if ( S.open ) {
			// M9 open-top slide: side walls with the barrel exposed
			slide.box( S.slide, xr, 0.005, bot, top, - hz, hz, S.sb );
			slide.box( S.slide, 0.005, xf, bot, top - 0.006, - hz, hz, S.sb );
			slide.box( S.slide, xf - 0.022, xf, bot, top, - hz, hz, S.sb );
			slide.cyl( 'steel', 0.0, xf - 0.02, 0.0072, 0.004, 0, 12 );
			slide.box( 'blk', xr + 0.008, xr + 0.02, top - 0.004, top + 0.001, - hz - 0.001, hz + 0.001, 0.001 ); // decocker
		} else {
			slide.box( S.slide, xr, xf, bot, top, - hz, hz, S.sb );
			slide.box( 'blk', - 0.02, 0.03, top - 0.012, top + 0.0006, 0.004, hz + 0.0006, 0.001 ); // ejection port
		}
		for ( let i = 0; i < 6; i ++ ) for ( const s of [ - 1, 1 ] ) slide.box( 'blk', xr + 0.004 + i * 0.0045, xr + 0.006 + i * 0.0045, bot + 0.005, top - 0.004, s * hz - 0.0006, s * hz + 0.0006, 0 );
		slide.box( 'blk', xr + 0.001, xr + 0.011, top - 0.001, sightH + 0.001, - 0.0065, 0.0065, 0.001 ); // rear sight
		slide.box( 'blk', xf - 0.013, xf - 0.006, top - 0.001, sightH, - 0.0016, 0.0016, 0.0006 ); // front sight
		slide.box( 'glowO', xf - 0.0105, xf - 0.0085, sightH - 0.0035, sightH - 0.0015, - 0.0017, 0.0017, 0 );
		for ( const s of [ - 1, 1 ] ) slide.box( 'glow', xr + 0.0035, xr + 0.0055, sightH - 0.0035, sightH - 0.0015, s * 0.0038 - 0.001, s * 0.0038 + 0.001, 0 );
		P.cyl( 'blk', xf - 0.004, xf + 0.001, 0.0062, 0.0, 0, 10 ); // barrel crown
		// frame with the dust cover rail
		P.box( S.frame, xr + 0.006, xf - 0.012, - 0.026, bot + 0.002, - hz + 0.0008, hz - 0.0008, 0.003 );
		if ( v !== '1911' && v !== 'makarov' ) P.box( S.frame, 0.035, xf - 0.014, - 0.032, - 0.024, - 0.01, 0.01, 0.001 );
		if ( v === '1911' ) { P.cylZ( 'blued', xf - 0.006, - 0.003, - 0.0105, 0.0105, 0.0085, 12 ); P.box( 'blued', - 0.02, 0.01, - 0.02, - 0.012, - 0.0125, - 0.011, 0.001 ); }
	}
	triggerGuard( P, S.frame === 'poly' ? 'poly' : S.frame, - 0.022, S.deagle ? 0.045 : 0.034, - 0.022, S.deagle ? 0.032 : 0.027, 0.0045 );
	trigger( P, 0.0, - 0.022, 0.017 );
	const gtx = - 0.024, gty = - 0.018;
	const g = pistolGrip( P, S.frame === 'poly' ? 'poly' : S.frame, gtx, gty, S.gh, S.rake, S.gd, S.gd * 0.96, hz - 0.001, 0.004, v === 'glock' ? 1 : 0 );
	if ( S.grip !== S.frame ) {
		// grip panels
		const sx = Math.sin( S.rake ), cy = Math.cos( S.rake );
		const panel = [ [ gtx - 0.005 - sx * 0.01, gty - cy * 0.01 ], [ gtx - S.gd + 0.004 - sx * 0.01, gty - cy * 0.01 ], [ gtx - S.gd + 0.004 - sx * ( S.gh - 0.008 ), gty - cy * ( S.gh - 0.008 ), 0.006 ], [ gtx - 0.005 - sx * ( S.gh - 0.008 ), gty - cy * ( S.gh - 0.008 ), 0.006 ] ];
		for ( const s of [ - 1, 1 ] ) P.ext( S.grip, panel, s * ( hz - 0.002 ), s * ( hz + 0.0018 ), 0.0012 );
	}
	if ( S.beaver ) P.extS( S.frame, [ [ xr + 0.004, - 0.01 ], [ xr - 0.018, - 0.022, 0.008 ], [ xr - 0.01, - 0.03 ], [ xr + 0.012, - 0.026 ] ], hz - 0.002, 0.002 );
	if ( S.hammer ) {
		const h = P.sub( 'hammer', xr + 0.004, - 0.004, 0 );
		h.extS( 'blued', [ [ xr + 0.006, - 0.008 ], [ xr + 0.006, 0.006 ], [ xr - 0.006, 0.016, 0.004 ], [ xr - 0.012, 0.012 ], [ xr - 0.004, 0.0 ], [ xr - 0.002, - 0.01 ] ], 0.0035, 0.001 );
	}
	return {
		P, info: {
			sightH, rearX: S.ruger ? xr + 0.01 : xr + 0.006, eyeBack: 0.34, muzzle: [ S.deagle ? 0.172 : S.ruger ? 0.166 : xf + 0.002, 0, 0 ], eject: [ 0.0, top - 0.004, 0.012 ],
			mag: { p: [ gtx - S.gd * 0.5 + 0.002, gty + 0.002, 0 ], rake: - S.rake }, light: v === 'glock' || v === 'm9' || v === 'p226' ? [ 0.075, - 0.034, 0 ] : null, lightDown: 1,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.017, { trig: [ 0.0, - 0.03, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.012 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.026, { support: 1 } ),
			},
			stock: 0, len: xf - xr + 0.1, slide: 'slide', slideTravel: S.ruger ? 0.025 : 0.034,
		},
	};
}

// ---- revolvers ----
function revolver( o ) {
	const P = new Parts();
	const big = o.v === '44';
	const mat = big ? 'steel' : 'blued';
	const bl = big ? 0.155 : 0.1;
	const cx0 = - 0.034, cx1 = 0.01, cy = - 0.0135, cr = big ? 0.0205 : 0.0195;
	// frame
	P.box( mat, cx1, cx1 + 0.012, - 0.035, 0.013, - 0.012, 0.012, 0.003 );
	P.box( mat, cx0 - 0.012, cx1 + 0.002, 0.006, 0.016, - 0.011, 0.011, 0.003 ); // top strap
	P.box( mat, cx0 - 0.02, cx0 - 0.002, - 0.036, 0.016, - 0.0125, 0.0125, 0.004 ); // recoil shield
	P.box( mat, cx0 - 0.004, cx1 + 0.004, - 0.042, - 0.034, - 0.011, 0.011, 0.002 );
	// barrel, rib, full underlug
	P.cyl( mat, cx1 + 0.01, cx1 + 0.012 + bl, 0.0098, 0, 0, 14 );
	P.box( mat, cx1 + 0.01, cx1 + 0.012 + bl, 0.004, 0.0125, - 0.004, 0.004, 0.0015 );
	P.box( mat, cx1 + 0.01, cx1 + 0.012 + bl, - 0.026, - 0.004, - 0.0075, 0.0075, 0.004 );
	P.extS( mat, [ [ cx1 + bl, 0.0125 ], [ cx1 + bl + 0.01, 0.0125 ], [ cx1 + bl + 0.01, 0.02, 0.002 ], [ cx1 + bl - 0.01, 0.0135 ] ], 0.0016, 0.0005 ); // front ramp
	P.box( 'fiber', cx1 + bl + 0.0045, cx1 + bl + 0.0085, 0.0175, 0.0198, - 0.0017, 0.0017, 0 );
	P.box( 'blk', cx0 - 0.012, cx0 - 0.004, 0.015, 0.0205, - 0.0055, 0.0055, 0.001 ); // rear notch
	// crane + cylinder (swing out to the left)
	const crane = P.sub( 'crane', cx1, - 0.032, - 0.006 );
	crane.box( mat, cx1 - 0.002, cx1 + 0.008, - 0.036, - 0.018, - 0.009, 0.004, 0.002 );
	crane.cyl( 'steel', cx1, cx1 + bl * 0.9, 0.0032, - 0.021, 0, 8 ); // ejector rod
	const cyl = crane.sub( 'cyl', 0, cy, 0 );
	cyl.cyl( mat, cx0, cx1, cr, cy, 0, 20 );
	cyl.cyl( mat, cx0 - 0.002, cx0, cr * 0.85, cy, 0, 16 );
	for ( let i = 0; i < 6; i ++ ) {
		const a = i / 6 * PI * 2 + PI / 6;
		cyl.boxC( 'rubber', ( cx0 + cx1 ) / 2 + 0.002, cy + Math.sin( a ) * cr, Math.cos( a ) * cr, 0.028, 0.0045, 0.0045, 0.0018, [ a, 0, 0 ] );
		const b = i / 6 * PI * 2;
		cyl.cyl( 'rubber', cx1 - 0.0004, cx1 + 0.0004, 0.0045, cy + Math.sin( b ) * cr * 0.62, Math.cos( b ) * cr * 0.62, 8 );
	}
	// hammer, trigger, guard, grip
	const h = P.sub( 'hammer', cx0 - 0.016, 0.002, 0 );
	h.extS( mat, [ [ cx0 - 0.012, - 0.006 ], [ cx0 - 0.012, 0.012 ], [ cx0 - 0.03, 0.022, 0.004 ], [ cx0 - 0.034, 0.016 ], [ cx0 - 0.022, 0.004 ], [ cx0 - 0.02, - 0.01 ] ], 0.0035, 0.0012 );
	triggerGuard( P, mat, - 0.025, 0.012, - 0.036, 0.024, 0.004 );
	trigger( P, - 0.008, - 0.038, 0.016 );
	const g = pistolGrip( P, 'walnut', - 0.036, - 0.034, 0.092, 0.26, 0.03, 0.036, 0.0165, 0.006, 0 );
	P.extS( mat, [ [ - 0.036, - 0.028 ], [ - 0.068, - 0.022 ], [ - 0.068, - 0.036 ], [ - 0.036, - 0.04 ] ], 0.011, 0.002 );
	return {
		P, info: {
			sightH: 0.0195, rearX: cx0 - 0.008, eyeBack: 0.36, muzzle: [ cx1 + 0.012 + bl, 0, 0 ], eject: null,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.018, { trig: [ - 0.008, - 0.045, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.013 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.027, { support: 1 } ),
			},
			cylAxis: [ 0, cy, 0 ], cylR: cr, stock: 0, len: bl + 0.15, crane: 'crane', cyl: 'cyl', hammer: 'hammer',
		},
	};
}

function flareGun() {
	const P = new Parts();
	const b = P.sub( 'barrels', 0.0, - 0.018, 0 );
	b.cyl( 'orange', - 0.005, 0.13, 0.0175, 0.004, 0, 16 );
	b.cyl( 'orange', 0.125, 0.135, 0.02, 0.004, 0, 16 );
	b.box( 'orange', 0.0, 0.1, - 0.016, - 0.006, - 0.008, 0.008, 0.003 );
	P.box( 'orange', - 0.055, 0.005, - 0.02, 0.022, - 0.013, 0.013, 0.005 );
	const h = P.sub( 'hammer', - 0.05, 0.015, 0 );
	h.box( 'blk', - 0.062, - 0.048, 0.012, 0.03, - 0.004, 0.004, 0.002 );
	triggerGuard( P, 'orange', - 0.03, 0.02, - 0.018, 0.026, 0.005 );
	trigger( P, - 0.012, - 0.02, 0.016 );
	const g = pistolGrip( P, 'orange', - 0.028, - 0.016, 0.092, 0.35, 0.032, 0.036, 0.0145, 0.005, 1 );
	return {
		P, info: {
			sightH: 0.026, rearX: - 0.05, eyeBack: 0.3, muzzle: [ 0.135, 0.004, 0 ], eject: null,
			grips: {
				R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.1, 0.2, 1 ], 0.017, { trig: [ - 0.012, - 0.026, 0 ] } ),
				L: grip( [ g.p.x + 0.012, g.p.y - 0.012, - 0.013 ], [ g.a.x, g.a.y, 0 ], [ - 0.35, - 0.15, - 1 ], 0.026, { support: 1 } ),
			},
			stock: 0, len: 0.25, barrels: 'barrels', breakAxis: 'z', breakAngle: - 0.7,
		},
	};
}

// ---- SMGs ----
function smg( o ) {
	const P = new Parts();
	const v = o.arch;
	let info;
	if ( v === 'mp5' ) {
		P.extFront( 'blk', [ [ - 0.016, - 0.03 ], [ 0.016, - 0.03 ], [ 0.016, 0.018, 0.006 ], [ 0.0, 0.03, 0.014 ], [ - 0.016, 0.018, 0.006 ] ], - 0.125, 0.125, 0.002 );
		P.cyl( 'blk', 0.12, 0.215, 0.0115, 0.02, 0, 12 );
		P.cyl( 'blk', 0.12, 0.2, 0.0105, 0.0, 0, 12 );
		P.box( 'blk', 0.192, 0.21, 0.02, 0.038, - 0.009, 0.009, 0.002 );
		P.torusX( 'blk', 0.201, 0.049, 0, 0.0105, 0.002, 14 );
		P.box( 'blk', 0.199, 0.203, 0.036, 0.047, - 0.0013, 0.0013, 0 );
		P.cyl( 'blk', 0.2, 0.235, 0.0078, 0.0, 0, 12 );
		for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2; P.boxC( 'blk', 0.225, Math.sin( a ) * 0.0085, Math.cos( a ) * 0.0085, 0.02, 0.004, 0.004, 0.001, [ a, 0, 0 ] ); }
		// slim handguard
		P.extS( 'poly', [ [ 0.075, 0.008 ], [ 0.19, 0.006, 0.006 ], [ 0.19, - 0.022, 0.008 ], [ 0.08, - 0.036, 0.008 ] ], 0.021, 0.004 );
		// magwell, trigger group housing with grip
		P.box( 'blk', 0.018, 0.068, - 0.05, - 0.026, - 0.0145, 0.0145, 0.002 );
		P.extS( 'poly', [ [ - 0.115, - 0.028 ], [ 0.018, - 0.028 ], [ 0.014, - 0.045 ], [ - 0.075, - 0.047 ], [ - 0.115, - 0.04 ] ], 0.0145, 0.003 );
		triggerGuard( P, 'poly', - 0.03, 0.016, - 0.044, 0.03, 0.006 );
		trigger( P, - 0.008, - 0.046, 0.016 );
		const g = pistolGrip( P, 'poly', - 0.036, - 0.044, 0.095, 0.3, 0.034, 0.032, 0.0145, 0.004, 1 );
		// charging handle on the cocking tube
		const ch = P.sub( 'charge', 0.17, 0.02, - 0.012 );
		ch.box( 'blk', 0.164, 0.176, 0.016, 0.026, - 0.034, - 0.01, 0.002 );
		// drum rear sight
		P.box( 'blk', - 0.12, - 0.09, 0.024, 0.034, - 0.011, 0.011, 0.002 );
		P.cylZ( 'blk', - 0.105, 0.041, - 0.012, 0.012, 0.011, 16 );
		// A3 retractable stock
		for ( const s of [ - 1, 1 ] ) P.cyl( 'blk', - 0.32, - 0.12, 0.0042, - 0.004, s * 0.014, 8 );
		P.extFront( 'blk', [ [ - 0.018, - 0.075 ], [ 0.018, - 0.075 ], [ 0.02, 0.02, 0.006 ], [ - 0.02, 0.02, 0.006 ] ], - 0.332, - 0.318, 0.002 );
		P.box( 'rubber', - 0.343, - 0.33, - 0.077, 0.022, - 0.02, 0.02, 0.004 );
		P.box( 'blk', - 0.13, - 0.118, - 0.03, 0.025, - 0.017, 0.017, 0.002 );
		// claw mount (with an optic)
		const m = P.sub( 'mount', 0, 0.03, 0 );
		m.box( 'blk', - 0.06, 0.06, 0.028, 0.036, - 0.012, 0.012, 0.002 );
		for ( const x of [ - 0.05, 0.05 ] ) m.box( 'blk', x - 0.006, x + 0.006, 0.012, 0.036, - 0.018, 0.018, 0.002 );
		m.rail( 'blk', - 0.058, 0.058, 0.042, 0.0105 );
		info = { sightH: 0.049, rearX: - 0.105, eyeBack: 0.08, muzzle: [ 0.236, 0, 0 ], eject: [ 0.03, 0.012, 0.017 ], mag: { p: [ 0.043, - 0.03, 0 ], rake: 0 },
			optic: [ 0.0, 0.0458 ], opticParts: [ 'mount' ], light: [ 0.16, - 0.012, 0.024 ],
			grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ - 0.008, - 0.055, 0 ] } ), L: grip( [ 0.14, - 0.014, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.025 ) },
			stock: - 0.343, len: 0.58, charge: 'charge', chargeTravel: 0.05, boltTravel: 0.05 };
	} else if ( v === 'uzi' ) {
		P.box( 'blk', - 0.13, 0.16, - 0.024, 0.034, - 0.019, 0.019, 0.004 );
		for ( let i = 0; i < 9; i ++ ) P.box( 'blk', - 0.1 + i * 0.024, - 0.092 + i * 0.024, 0.033, 0.037, - 0.017, 0.017, 0.001 );
		P.cyl( 'blk', 0.16, 0.176, 0.018, 0.0, 0, 16 );
		P.cyl( 'blk', 0.176, 0.215, 0.0085, 0.0, 0, 12 );
		P.box( 'blk', 0.14, 0.158, 0.034, 0.042, - 0.012, 0.012, 0.002 );
		for ( const s of [ - 1, 1 ] ) P.box( 'blk', 0.144, 0.154, 0.04, 0.062, s * 0.005, s * 0.008, 0.001 );
		P.box( 'blk', 0.1475, 0.1505, 0.04, 0.058, - 0.0013, 0.0013, 0 );
		P.box( 'blk', - 0.118, - 0.1, 0.034, 0.042, - 0.012, 0.012, 0.002 );
		P.box( 'blk', - 0.112, - 0.106, 0.04, 0.062, - 0.007, 0.007, 0.001 );
		const ch = P.sub( 'charge', 0.09, 0.038, 0 );
		ch.box( 'blk', 0.082, 0.098, 0.034, 0.047, - 0.006, 0.006, 0.003 );
		const g = pistolGrip( P, 'poly', 0.012, - 0.022, 0.1, 0.12, 0.044, 0.044, 0.0155, 0.004, 0 );
		P.box( 'blk', - 0.036, - 0.024, - 0.075, - 0.03, - 0.01, 0.01, 0.002 ); // grip safety
		triggerGuard( P, 'blk', 0.012, 0.075, - 0.024, 0.036, 0.005 );
		trigger( P, 0.03, - 0.026, 0.018 );
		for ( const s of [ - 1, 1 ] ) P.box( 'blk', - 0.36, - 0.13, - 0.008, 0.002, s * 0.013, s * 0.017, 0.002 );
		P.box( 'blk', - 0.372, - 0.356, - 0.07, 0.02, - 0.02, 0.02, 0.004 );
		info = { sightH: 0.058, rearX: - 0.109, eyeBack: 0.08, muzzle: [ 0.215, 0, 0 ], eject: [ 0.04, 0.02, 0.02 ], mag: { p: [ g.p.x + 0.0, - 0.02, 0 ], rake: - 0.12 },
			grips: { R: grip( [ g.p.x - 0.002, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.02, { trig: [ 0.03, - 0.035, 0 ] } ), L: grip( [ 0.13, - 0.022, 0 ], [ 1, 0, 0 ], [ 0, - 0.75, - 0.66 ], 0.024 ) },
			stock: - 0.372, len: 0.59, charge: 'charge', chargeTravel: 0.06, magInGrip: 1 };
	} else if ( v === 'mp7' ) {
		P.extS( 'poly', [ [ - 0.13, 0.034 ], [ 0.085, 0.034, 0.006 ], [ 0.105, 0.012, 0.01 ], [ 0.1, - 0.028, 0.008 ], [ 0.03, - 0.03 ], [ - 0.02, - 0.028 ], [ - 0.13, - 0.024, 0.008 ] ], 0.0175, 0.004 );
		P.rail( 'blk', - 0.125, 0.085, 0.041, 0.0105 );
		P.cyl( 'blk', 0.1, 0.148, 0.0068, 0.0, 0, 12 );
		P.cyl( 'blk', 0.132, 0.152, 0.0085, 0.0, 0, 12 );
		const g = pistolGrip( P, 'poly', - 0.022, - 0.026, 0.1, 0.26, 0.036, 0.034, 0.015, 0.004, 1 );
		triggerGuard( P, 'poly', - 0.02, 0.04, - 0.026, 0.03, 0.006 );
		trigger( P, 0.0, - 0.028, 0.017 );
		P.box( 'poly', 0.062, 0.084, - 0.09, - 0.028, - 0.012, 0.012, 0.005 ); // foregrip
		for ( const s of [ - 1, 1 ] ) P.cyl( 'blk', - 0.175, - 0.13, 0.004, 0.0, s * 0.012, 8 );
		P.box( 'poly', - 0.185, - 0.172, - 0.035, 0.028, - 0.02, 0.02, 0.004 );
		const r = P.sub( 'buisR', - 0.1, 0.045, 0 );
		r.box( 'blk', - 0.11, - 0.09, 0.045, 0.052, - 0.01, 0.01, 0.001 );
		for ( const s of [ - 1, 1 ] ) r.box( 'blk', - 0.104, - 0.096, 0.05, 0.068, s * 0.0055, s * 0.0095, 0.0012 );
		r.torusX( 'blk', - 0.1, 0.061, 0, 0.0032, 0.0014, 10 );
		const f = P.sub( 'buisF', 0.075, 0.045, 0 );
		f.box( 'blk', 0.068, 0.082, 0.045, 0.052, - 0.01, 0.01, 0.001 );
		f.box( 'blk', 0.073, 0.077, 0.05, 0.061, - 0.0013, 0.0013, 0 );
		const ch = P.sub( 'charge', - 0.13, 0.03, 0 );
		ch.box( 'blk', - 0.14, - 0.128, 0.026, 0.034, - 0.02, 0.02, 0.002 );
		info = { sightH: 0.061, rearX: - 0.1, eyeBack: 0.08, muzzle: [ 0.152, 0, 0 ], eject: [ 0.02, 0.02, 0.018 ], mag: { p: [ g.p.x + 0.002, - 0.022, 0 ], rake: - 0.26 },
			optic: [ - 0.02, 0.0448 ], light: [ 0.06, 0.0, 0.022 ], hideWithOptic: [ 'buisR', 'buisF' ],
			grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ 0.0, - 0.036, 0 ] } ), L: grip( [ 0.073, - 0.06, 0 ], [ 0.05, 1, 0 ], [ - 0.2, 0, - 1 ], 0.013, { vert: 1 } ) },
			stock: - 0.185, len: 0.4, charge: 'charge', chargeTravel: 0.04, magInGrip: 1 };
	} else if ( v === 'vector' ) {
		P.box( 'tan', - 0.12, 0.12, 0.012, 0.042, - 0.017, 0.017, 0.004 );
		P.rail( 'blk', - 0.12, 0.115, 0.048, 0.0105 );
		P.extS( 'tan', [ [ - 0.12, 0.014 ], [ 0.124, 0.014 ], [ 0.124, - 0.01 ], [ 0.11, - 0.03 ], [ 0.1, - 0.1, 0.008 ], [ 0.04, - 0.105, 0.006 ], [ 0.036, - 0.03 ], [ - 0.07, - 0.024 ], [ - 0.12, 0.0, 0.01 ] ], 0.02, 0.005 );
		P.cyl( 'blk', 0.12, 0.2, 0.0075, 0.0, 0, 12 );
		P.cyl( 'tan', 0.12, 0.165, 0.014, 0.0, 0, 10 );
		const g = pistolGrip( P, 'tan', - 0.012, - 0.026, 0.098, 0.22, 0.034, 0.032, 0.015, 0.004, 1 );
		triggerGuard( P, 'tan', - 0.012, 0.038, - 0.026, 0.03, 0.006 );
		trigger( P, 0.008, - 0.028, 0.017 );
		P.cyl( 'blk', - 0.3, - 0.12, 0.013, 0.02, 0, 12 );
		P.extS( 'tan', [ [ - 0.24, 0.036 ], [ - 0.31, 0.04, 0.006 ], [ - 0.315, - 0.06, 0.008 ], [ - 0.29, - 0.06 ], [ - 0.25, 0.0 ] ], 0.017, 0.004 );
		const r = P.sub( 'buisR', - 0.1, 0.052, 0 );
		r.box( 'blk', - 0.11, - 0.09, 0.052, 0.059, - 0.01, 0.01, 0.001 );
		for ( const s of [ - 1, 1 ] ) r.box( 'blk', - 0.104, - 0.096, 0.058, 0.08, s * 0.0055, s * 0.0095, 0.0012 );
		r.torusX( 'blk', - 0.1, 0.07, 0, 0.0032, 0.0014, 10 );
		const f = P.sub( 'buisF', 0.1, 0.052, 0 );
		f.box( 'blk', 0.093, 0.107, 0.052, 0.059, - 0.01, 0.01, 0.001 );
		f.box( 'blk', 0.098, 0.102, 0.058, 0.07, - 0.0013, 0.0013, 0 );
		const ch = P.sub( 'charge', 0.06, 0.03, - 0.02 );
		ch.box( 'blk', 0.055, 0.068, 0.024, 0.034, - 0.032, - 0.017, 0.002 );
		info = { sightH: 0.07, rearX: - 0.1, eyeBack: 0.08, muzzle: [ 0.2, 0, 0 ], eject: [ 0.02, 0.03, 0.02 ], mag: { p: [ 0.068, - 0.03, 0 ], rake: 0 },
			optic: [ - 0.01, 0.0518 ], light: [ 0.1, 0.0, 0.024 ], hideWithOptic: [ 'buisR', 'buisF' ],
			grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ 0.008, - 0.036, 0 ] } ), L: grip( [ 0.14, - 0.004, 0 ], [ 1, 0, 0 ], [ 0, - 0.75, - 0.66 ], 0.018 ) },
			stock: - 0.315, len: 0.52, charge: 'charge', chargeTravel: 0.05 };
	} else if ( v === 'mac10' ) {
		P.box( 'blk', - 0.09, 0.11, - 0.026, 0.036, - 0.022, 0.022, 0.003 );
		P.cyl( 'blk', 0.11, 0.145, 0.0095, 0.0, 0, 12 );
		for ( let i = 0; i < 5; i ++ ) P.cyl( 'blk', 0.114 + i * 0.006, 0.117 + i * 0.006, 0.0105, 0, 0, 12 );
		P.box( 'blk', - 0.085, - 0.068, 0.036, 0.052, - 0.012, 0.012, 0.002 );
		P.torusX( 'blk', - 0.076, 0.048, 0, 0.0035, 0.0014, 10 );
		P.box( 'blk', 0.094, 0.102, 0.036, 0.048, - 0.0016, 0.0016, 0 );
		P.box( 'blk', 0.088, 0.108, 0.036, 0.05, 0.004, 0.009, 0.001 ); P.box( 'blk', 0.088, 0.108, 0.036, 0.05, - 0.009, - 0.004, 0.001 );
		const ch = P.sub( 'charge', 0.05, 0.04, 0 );
		ch.cylY( 'blk', 0.05, 0.036, 0.05, 0.006, 0, 10 );
		const g = pistolGrip( P, 'blk', 0.012, - 0.024, 0.1, 0.1, 0.038, 0.038, 0.017, 0.004, 0 );
		triggerGuard( P, 'blk', 0.012, 0.07, - 0.026, 0.03, 0.005 );
		trigger( P, 0.03, - 0.028, 0.016 );
		P.cylZ( 'blk', 0.1, - 0.028, - 0.012, 0.012, 0.009, 10 );
		for ( const s of [ - 1, 1 ] ) P.cyl( 'blk', - 0.13, - 0.09, 0.004, - 0.01, s * 0.018, 8 );
		P.box( 'blk', - 0.14, - 0.13, - 0.03, 0.01, - 0.022, 0.022, 0.002 );
		info = { sightH: 0.048, rearX: - 0.076, eyeBack: 0.2, muzzle: [ 0.145, 0, 0 ], eject: [ 0.03, 0.025, 0.024 ], mag: { p: [ g.p.x + 0.002, - 0.02, 0 ], rake: - 0.1 },
			grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ 0.03, - 0.034, 0 ] } ), L: grip( [ 0.1, - 0.03, 0 ], [ 1, 0, 0 ], [ 0, - 0.75, - 0.66 ], 0.02 ) },
			stock: - 0.14, len: 0.3, charge: 'charge', chargeTravel: 0.07, magInGrip: 1 };
	} else {
		// UMP45
		P.box( 'poly', - 0.14, 0.16, - 0.03, 0.034, - 0.02, 0.02, 0.006 );
		P.rail( 'blk', - 0.13, 0.1, 0.041, 0.0105 );
		P.cyl( 'blk', 0.16, 0.195, 0.0085, 0.0, 0, 12 );
		P.box( 'blk', 0.04, 0.085, - 0.042, - 0.026, - 0.016, 0.016, 0.002 );
		const g = pistolGrip( P, 'poly', - 0.03, - 0.028, 0.098, 0.3, 0.036, 0.034, 0.016, 0.004, 1 );
		P.extS( 'poly', [ [ - 0.03, - 0.028 ], [ 0.04, - 0.028 ], [ 0.036, - 0.06, 0.008 ], [ - 0.015, - 0.064 ] ], 0.007, 0.002, 0, [ [ [ - 0.012, - 0.034 ], [ 0.028, - 0.034 ], [ 0.026, - 0.054, 0.006 ], [ - 0.01, - 0.056 ] ] ] );
		trigger( P, - 0.002, - 0.03, 0.017 );
		P.extS( 'poly', [ [ - 0.14, 0.025 ], [ - 0.38, 0.02, 0.008 ], [ - 0.385, - 0.078, 0.01 ], [ - 0.355, - 0.08 ], [ - 0.14, - 0.02 ] ], 0.014, 0.004,
			0, [ [ [ - 0.17, 0.012 ], [ - 0.345, 0.008 ], [ - 0.345, - 0.055, 0.008 ], [ - 0.2, - 0.012 ] ] ] );
		P.box( 'rubber', - 0.395, - 0.383, - 0.082, 0.024, - 0.016, 0.016, 0.003 );
		const r = P.sub( 'buisR', - 0.11, 0.045, 0 );
		r.box( 'blk', - 0.12, - 0.1, 0.045, 0.052, - 0.01, 0.01, 0.001 );
		for ( const s of [ - 1, 1 ] ) r.box( 'blk', - 0.114, - 0.106, 0.05, 0.07, s * 0.0055, s * 0.0095, 0.0012 );
		r.torusX( 'blk', - 0.11, 0.062, 0, 0.0032, 0.0014, 10 );
		const f = P.sub( 'buisF', 0.09, 0.045, 0 );
		f.box( 'blk', 0.083, 0.097, 0.045, 0.052, - 0.01, 0.01, 0.001 );
		f.box( 'blk', 0.088, 0.092, 0.05, 0.062, - 0.0013, 0.0013, 0 );
		const ch = P.sub( 'charge', 0.13, 0.02, - 0.02 );
		ch.box( 'blk', 0.125, 0.138, 0.012, 0.024, - 0.034, - 0.018, 0.002 );
		info = { sightH: 0.062, rearX: - 0.11, eyeBack: 0.08, muzzle: [ 0.195, 0, 0 ], eject: [ 0.02, 0.015, 0.02 ], mag: { p: [ 0.062, - 0.03, 0 ], rake: 0 },
			optic: [ - 0.02, 0.0448 ], light: [ 0.12, 0.0, 0.026 ], hideWithOptic: [ 'buisR', 'buisF' ],
			grips: { R: grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.018, { trig: [ - 0.002, - 0.04, 0 ] } ), L: grip( [ 0.125, - 0.012, 0 ], [ 1, 0.1, 0 ], [ 0, - 0.75, - 0.66 ], 0.026 ) },
			stock: - 0.395, len: 0.6, charge: 'charge', chargeTravel: 0.05 };
	}
	return { P, info };
}

// ---- shotguns ----
function pumpShotgun( o ) {
	const P = new Parts();
	const v = o.v || '870';
	const spas = o.arch === 'spas';
	const furn = v === '870' ? 'walnut' : 'poly';
	const bEnd = spas ? 0.5 : 0.59;
	P.box( spas ? 'blk' : 'blued', - 0.078, 0.12, - 0.036, 0.024, - 0.0165, 0.0165, 0.004 );
	P.box( 'blk', 0.0, 0.07, - 0.012, 0.016, 0.014, 0.0172, 0.001 ); // ejection port
	P.box( 'blk', - 0.02, 0.08, - 0.0375, - 0.034, - 0.011, 0.011, 0.001 ); // loading port
	P.cyl( 'blued', 0.12, bEnd, 0.0118, 0, 0, 16 );
	P.cyl( 'blued', bEnd - 0.004, bEnd, 0.0125, 0, 0, 16 );
	if ( v === '870' ) { P.box( 'blued', 0.12, bEnd - 0.004, 0.011, 0.016, - 0.004, 0.004, 0.001 ); for ( let i = 0; i < 18; i ++ ) P.box( 'blued', 0.14 + i * 0.025, 0.143 + i * 0.025, 0.0115, 0.0155, - 0.0035, 0.0035, 0 ); }
	P.sphere( 'white', bEnd - 0.012, 0.0185, 0, 0.0022, 8 );
	P.cyl( 'blued', 0.12, bEnd - 0.1, 0.011, - 0.028, 0, 12 );
	P.cyl( 'blued', bEnd - 0.1, bEnd - 0.085, 0.0122, - 0.028, 0, 12 );
	P.box( 'blued', bEnd - 0.1, bEnd - 0.085, - 0.03, 0.0, - 0.009, 0.009, 0.002 );
	if ( spas ) {
		// perforated heat shield + ghost ring
		P.box( 'blk', 0.12, 0.43, - 0.004, 0.022, - 0.016, 0.016, 0.006 );
		for ( let i = 0; i < 9; i ++ ) for ( const s of [ - 1, 1 ] ) P.cylZ( 'rubber', 0.14 + i * 0.032, 0.01, s * 0.0155, s * 0.0168, 0.0045, 8 );
		P.box( 'blk', - 0.05, - 0.03, 0.024, 0.04, - 0.012, 0.012, 0.002 );
		P.torusX( 'blk', - 0.04, 0.04, 0, 0.0045, 0.0018, 10 );
		P.box( 'blk', 0.4, 0.412, 0.022, 0.04, - 0.0014, 0.0014, 0 );
	}
	const sightH = spas ? 0.04 : 0.0205;
	// pump
	const pump = P.sub( 'pump', 0.26, - 0.028, 0 );
	const px0 = spas ? 0.2 : 0.19, px1 = spas ? 0.37 : 0.33;
	pump.box( furn, px0, px1, - 0.05, - 0.008, - 0.021, 0.021, 0.012 );
	for ( let i = 0; i < 7; i ++ ) pump.box( spas ? 'poly' : 'walnut', px0 + 0.012 + i * 0.018, px0 + 0.018 + i * 0.018, - 0.047, - 0.012, - 0.0225, 0.0225, 0.002 );
	for ( const s of [ - 1, 1 ] ) pump.box( 'blued', px0 - 0.12, px0 + 0.01, - 0.03, - 0.024, s * 0.0135, s * 0.0155, 0.0005 );
	triggerGuard( P, spas ? 'blk' : 'blued', - 0.045, 0.025, - 0.035, 0.028, 0.005 );
	trigger( P, - 0.02, - 0.037, 0.017 );
	let gR;
	if ( spas ) {
		const g = pistolGrip( P, 'poly', - 0.05, - 0.034, 0.095, 0.3, 0.034, 0.032, 0.015, 0.004, 1 );
		gR = grip( [ g.p.x, g.p.y, 0 ], [ g.a.x, g.a.y, 0 ], [ 0.05, 0.15, 1 ], 0.017, { trig: [ - 0.02, - 0.045, 0 ] } );
		// folding stock (extended)
		for ( const s of [ - 1, 1 ] ) P.box( 'blk', - 0.38, - 0.078, - 0.01, 0.0, s * 0.012, s * 0.016, 0.002 );
		P.box( 'blk', - 0.39, - 0.37, - 0.1, 0.012, - 0.018, 0.018, 0.004 );
		P.box( 'blk', - 0.33, - 0.31, - 0.085, 0.0, - 0.004, 0.004, 0.002, [ 0, 0, 0.3 ] );
	} else {
		P.extS( furn, [ [ - 0.078, 0.014 ], [ - 0.43, - 0.012, 0.004 ], [ - 0.435, - 0.138, 0.008 ], [ - 0.4, - 0.14 ], [ - 0.16, - 0.068 ], [ - 0.12, - 0.07, 0.02 ], [ - 0.078, - 0.036, 0.006 ] ], 0.0175, 0.005 );
		P.box( 'rubber', - 0.448, - 0.432, - 0.142, - 0.008, - 0.02, 0.02, 0.005 );
		gR = grip( [ - 0.11, - 0.042, 0 ], [ 0.62, 0.78, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.02, - 0.045, 0 ] } );
	}
	if ( v === '500' ) P.box( 'blk', - 0.06, - 0.045, 0.024, 0.03, - 0.005, 0.005, 0.002 ); // top safety
	return {
		P, info: {
			sightH, rearX: spas ? - 0.04 : - 0.07, eyeBack: 0.13, muzzle: [ bEnd, 0, 0 ], eject: [ 0.035, 0.004, 0.018 ], shellPort: [ 0.03, - 0.04, 0 ],
			optic: spas ? null : [ - 0.02, 0.03 ], opticParts: spas ? null : [ 'mount' ], light: spas ? null : [ 0.3, - 0.03, 0.024 ],
			grips: { R: gR, L: grip( [ 0.265, - 0.03, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.024 ) },
			stock: spas ? - 0.39 : - 0.448, len: bEnd + 0.45, pump: 'pump', pumpTravel: 0.085,
		},
		mount: ! spas,
	};
}

function doubleBarrel( o ) {
	const P = new Parts();
	const sawed = o.v === 'sawed';
	const bEnd = sawed ? 0.36 : 0.78;
	P.box( 'steel', - 0.045, 0.07, - 0.03, 0.017, - 0.0225, 0.0225, 0.005 );
	const tl = P.sub( 'toplever', - 0.03, 0.017, 0 );
	tl.box( 'blued', - 0.05, - 0.015, 0.015, 0.021, - 0.004, 0.018, 0.003 );
	for ( const s of [ - 1, 1 ] ) {
		const h = P.sub( s > 0 ? 'hammerR' : 'hammerL', - 0.035, 0.012, s * 0.012 );
		h.extS( 'blued', [ [ - 0.03, 0.005 ], [ - 0.02, 0.012 ], [ - 0.03, 0.032, 0.004 ], [ - 0.038, 0.028 ], [ - 0.034, 0.012 ] ], 0.003, 0.001, s * 0.013 );
	}
	const b = P.sub( 'barrels', 0.07, - 0.022, 0 );
	for ( const s of [ - 1, 1 ] ) { b.cyl( 'blued', 0.068, bEnd, 0.0122, 0, s * 0.0115, 16, 0.0112 ); }
	b.box( 'blued', 0.068, bEnd, 0.009, 0.0145, - 0.005, 0.005, 0.002 );
	b.box( 'blued', 0.068, bEnd, - 0.014, - 0.006, - 0.008, 0.008, 0.002 );
	b.sphere( 'brass', bEnd - 0.01, 0.017, 0, 0.0022, 8 );
	b.box( 'walnut', 0.1, sawed ? 0.24 : 0.33, - 0.032, - 0.01, - 0.02, 0.02, 0.01 );
	const sh = b.sub( 'shells', 0.068, 0, 0 );
	for ( const s of [ - 1, 1 ] ) sh.cyl( 'brass', 0.066, 0.07, 0.0118, 0, s * 0.0115, 12 );
	triggerGuard( P, 'blued', - 0.035, 0.04, - 0.029, 0.026, 0.005 );
	trigger( P, - 0.012, - 0.03, 0.017 );
	let gR;
	if ( sawed ) {
		P.extS( 'walnut', [ [ - 0.045, 0.012 ], [ - 0.07, 0.006 ], [ - 0.15, - 0.07, 0.012 ], [ - 0.13, - 0.095, 0.012 ], [ - 0.1, - 0.085 ], [ - 0.045, - 0.03, 0.006 ] ], 0.0165, 0.005 );
		gR = grip( [ - 0.095, - 0.05, 0 ], [ 0.62, 0.78, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.012, - 0.038, 0 ] } );
	} else {
		P.extS( 'walnut', [ [ - 0.045, 0.012 ], [ - 0.42, - 0.018, 0.004 ], [ - 0.425, - 0.13, 0.008 ], [ - 0.39, - 0.132 ], [ - 0.14, - 0.058 ], [ - 0.045, - 0.03, 0.006 ] ], 0.0175, 0.005 );
		P.box( 'rubber', - 0.437, - 0.422, - 0.134, - 0.014, - 0.019, 0.019, 0.004 );
		gR = grip( [ - 0.105, - 0.036, 0 ], [ 0.62, 0.78, 0 ], [ 0.05, 0.15, 1 ], 0.019, { trig: [ - 0.012, - 0.038, 0 ] } );
	}
	return {
		P, info: {
			sightH: 0.0185, rearX: - 0.02, eyeBack: 0.13, muzzle: [ bEnd, 0, 0.0115 ], muzzle2: [ bEnd, 0, - 0.0115 ], eject: null,
			grips: { R: gR, L: grip( [ sawed ? 0.19 : 0.23, - 0.025, 0 ], [ 1, 0.05, 0 ], [ 0, - 0.75, - 0.66 ], 0.026 ) },
			stock: sawed ? 0 : - 0.437, len: bEnd + ( sawed ? 0.15 : 0.44 ), barrels: 'barrels', breakAxis: 'z', breakAngle: - 0.62,
		},
	};
}
