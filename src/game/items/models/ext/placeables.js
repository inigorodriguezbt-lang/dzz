// Models for the placeables core items (register( reg ), called once by render/ItemModels.js) and the shapes
// things take once placed (placedModel( name, spec ): a set snare, an open spring trap, a pitched tent, a laid-out
// sleeping bag, a tarp rain catcher, a buried stash's mound, nailed planks, a catch in a snare).
// Item models follow ItemModels' convention: metres, origin at the centre of the bottom, long axis along +x.
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, canvasTex, worldTex, facet, shade } from '../lib.js';
import { compact } from '../../placeables/merge.js';

const wire = () => M( 0x9a9ea4, { rough: 0.35, metal: 0.9 } );
const steel = () => M( 0x4a4c50, { rough: 0.45, metal: 0.85 } );
const rust = () => M( 0x6a4a38, { rough: 0.7, metal: 0.5 } );
const stick = () => M( 0x6a4e34, { rough: 0.95 } );

function clockFace() {
	return canvasTex( 'pl:clockface', 128, 128, ( ctx, w, h ) => {
		ctx.fillStyle = '#f4f0e4'; ctx.fillRect( 0, 0, w, h );
		ctx.translate( w / 2, h / 2 );
		ctx.fillStyle = '#1a1a1a';
		for ( let i = 0; i < 12; i ++ ) {
			const a = i / 12 * PI * 2;
			ctx.save(); ctx.rotate( a ); ctx.fillRect( - 2, - 58, 4, i % 3 ? 7 : 12 ); ctx.restore();
		}
		ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText( '12', 0, - 38 ); ctx.fillText( '6', 0, 40 ); ctx.fillText( '3', 40, 0 ); ctx.fillText( '9', - 40, 0 );
		// hands at twenty past seven, and the red alarm hand
		const hand = ( a, len, wd, c ) => { ctx.save(); ctx.rotate( a ); ctx.fillStyle = c; ctx.fillRect( - wd / 2, - len, wd, len + 6 ); ctx.restore(); };
		hand( ( 7 + 20 / 60 ) / 12 * PI * 2, 30, 5, '#1a1a1a' ); hand( 20 / 60 * PI * 2, 44, 3.5, '#1a1a1a' ); hand( 6.5 / 12 * PI * 2, 36, 2, '#c8302a' );
		ctx.beginPath(); ctx.arc( 0, 0, 4, 0, PI * 2 ); ctx.fill();
	} );
}

// a small animal lying on its side (a snare's catch), head towards +x
function carcass( kind ) {
	const g = group(), side = group();
	if ( kind === 'chicken' ) {
		// a feral rooster: rust and gold body, a dark green tail fan, red comb, yellow legs
		const body = G.sph( 0.085, 14, 10 ); body.scale( 1.3, 0.85, 0.9 );
		add( side, body, M( 0x8a3a16, { rough: 0.85 } ), [ 0, 0, 0 ] );
		const neck = G.sph( 0.045, 10, 8 ); neck.scale( 1.2, 1, 0.9 );
		add( side, neck, M( 0xc88a2a, { rough: 0.8 } ), [ 0.1, 0.03, 0 ] );
		add( side, G.sph( 0.03, 10, 8 ), M( 0xb05a1a, { rough: 0.8 } ), [ 0.15, 0.04, 0 ] );
		add( side, G.box( 0.035, 0.022, 0.006 ), M( 0xc0201a, { rough: 0.6 } ), [ 0.155, 0.072, 0 ] );
		add( side, G.cone( 0.008, 0.02, 6 ).rotateZ( - PI / 2 ), M( 0xd8b040, { rough: 0.5 } ), [ 0.185, 0.035, 0 ] );
		const tail = M( 0x16261e, { rough: 0.4 } );
		for ( let i = 0; i < 5; i ++ ) add( side, G.box( 0.16, 0.012, 0.03 ), tail, [ - 0.15, 0.03 + i * 0.012, 0 ], [ 0, 0, 0.5 + i * 0.18 ] );
		for ( const z of [ - 0.03, 0.03 ] ) add( side, G.cylX( 0.005, 0.1, 5 ), M( 0xd8b040, { rough: 0.6 } ), [ 0.02, - 0.08, z ], [ 0, 0, - 1.2 ] );
	} else {
		const rat = kind === 'rat', s = rat ? 0.55 : 1;
		const fur = M( rat ? 0x5a5450 : 0x6e6250, { rough: 0.95 } ), pale = M( rat ? 0x7a726c : 0x8a7e66, { rough: 0.95 } );
		const body = G.capsX( 0.04 * s, 0.3 * s, 10 ); body.scale( 1, 0.85, 1 );
		add( side, body, fur );
		add( side, G.cone( 0.033 * s, 0.09 * s, 8 ).rotateZ( - PI / 2 ), pale, [ 0.18 * s, 0, 0 ] );
		add( side, G.sph( 0.008 * s, 6, 4 ), M( 0x1a1a1a ), [ 0.225 * s, 0, 0 ] );
		for ( const z of [ - 0.018, 0.018 ] ) add( side, G.sph( rat ? 0.012 : 0.009, 6, 4 ), M( rat ? 0xc89a90 : 0x5a4e3e, { rough: 0.8 } ), [ 0.155 * s, 0.028 * s, z * s ] );
		// legs out to the side, stiff
		for ( const [ x, z ] of [ [ 0.09, - 0.025 ], [ 0.09, 0.025 ], [ - 0.08, - 0.025 ], [ - 0.08, 0.025 ] ] ) add( side, G.cyl( 0.007 * s, 0.006 * s, 0.06 * s, 5 ), fur, [ x * s, - 0.075 * s, z * s ] );
		if ( rat ) add( side, G.cylX( 0.003, 0.17, 5, 0.0015 ), M( 0xc89a90, { rough: 0.6 } ), [ - 0.17, - 0.005, 0 ], [ 0, 0, 0.2 ] );
		else add( side, G.cone( 0.028, 0.26, 8 ).rotateZ( PI / 2 ), fur, [ - 0.28, 0, 0 ] );
	}
	// on its side: legs out sideways, the body resting on the ground
	side.rotation.x = PI / 2;
	g.add( side );
	return ground( g, false );
}

// the steel jaws of a spring trap: open (flat round the pan) or sprung (an upright arch)
function jaws( open ) {
	const g = group(), R = 0.075;
	add( g, G.box( 0.42, 0.012, 0.03 ), steel() );
	for ( const s of [ - 1, 1 ] ) {
		// the flat V springs at either end
		add( g, G.box( 0.13, 0.008, 0.026 ), steel(), [ s * 0.16, 0.022, 0 ], [ 0, 0, s * 0.12 ] );
		add( g, G.box( 0.02, 0.03, 0.04 ), steel(), [ s * R, 0.015, 0 ] );
		const jaw = G.torus( R, 0.0055, 5, 18, PI );
		// open: each bow lies flat to one side; sprung: both stand up and meet over the pan
		if ( open ) add( g, jaw, steel(), [ 0, 0.016, 0 ], [ s * PI / 2, 0, 0 ] );
		else add( g, jaw, steel(), [ 0, 0.012, s * 0.004 ], [ 0, 0, 0 ] );
	}
	add( g, G.cyl( 0.032, 0.032, 0.004, 14 ), rust(), [ 0, 0.012, 0 ] );
	add( g, G.box( 0.05, 0.004, 0.01 ), steel(), [ - 0.03, 0.016, 0 ], [ 0, 0.3, 0 ] );
	// a chain to a stake
	for ( let i = 0; i < 4; i ++ ) add( g, G.torus( 0.012, 0.0028, 4, 8 ), steel(), [ 0.23 + i * 0.02, 0.006, 0.01 * ( i % 2 ) ], [ PI / 2, i % 2 ? PI / 2 : 0, 0 ] );
	add( g, G.torus( 0.025, 0.004, 4, 12 ), steel(), [ 0.32, 0.004, 0 ], [ PI / 2, 0, 0 ] );
	return ground( g, false );
}

// a low, lumpy heap of earth: a squashed half sphere with a little noise in it
function lump( r, h, seed ) {
	const geo = G.sph( r, 18, 7, 0, PI * 2, 0, PI / 2 ); geo.scale( 1, h / r, 0.82 );
	const p = geo.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), z = p.getZ( i ), k = 1 + Math.sin( x * 19 + z * 13 + seed ) * 0.05 + Math.sin( x * 41 - z * 29 + seed * 3 ) * 0.03;
		p.setXYZ( i, x * k, p.getY( i ) * k, z * k );
	}
	geo.computeVertexNormals();
	return geo;
}

// the inside of a dug hole seen from above: earth going dark towards the bottom
function pitTex( sand ) {
	return canvasTex( 'pl:pit' + ( sand ? 's' : '' ), 64, 64, ( ctx, w, h ) => {
		const gr = ctx.createRadialGradient( w / 2, h / 2, 2, w / 2, h / 2, w / 2 );
		gr.addColorStop( 0, '#060504' ); gr.addColorStop( 0.55, sand ? '#2a2216' : '#1c140d' ); gr.addColorStop( 0.85, sand ? '#5a4a32' : '#3a2c1e' ); gr.addColorStop( 1, sand ? '#7a6646' : '#4a3a28' );
		ctx.fillStyle = gr; ctx.fillRect( 0, 0, w, h );
	} );
}

let plankMat = null;
export function plankMaterial() {
	// weathered lumber, a shade darker than a fresh plank
	return plankMat || ( plankMat = M( 0xb09878, { map: worldTex( 'planks_d', 0.5, 0.2 ), rough: 0.85, key: 'pl-plank' } ) );
}

export function register( reg ) {
	reg( 'pl_alarm_clock', ( s ) => {
		const g = group(), c = s.color ?? 0xc8302a;
		const body = M( c, { rough: 0.3, metal: 0.55 } ), chrome = MAT.metal();
		add( g, G.cylZ( 0.055, 0.04, 22 ), body, [ 0, 0.075, 0 ] );
		add( g, G.torus( 0.052, 0.005, 6, 26 ), chrome, [ 0, 0.075, 0.021 ] );
		const face = new THREE.Mesh( new THREE.CircleGeometry( 0.048, 26 ), M( 0xffffff, { map: clockFace(), rough: 0.4 } ) );
		face.position.set( 0, 0.075, 0.0205 ); face.castShadow = false; face.receiveShadow = true;
		g.add( face );
		add( g, new THREE.CircleGeometry( 0.049, 22 ), MAT.glass( 0xffffff, 0.15 ), [ 0, 0.075, 0.024 ] );
		for ( const sx of [ - 1, 1 ] ) {
			add( g, G.dome( 0.028, 12, 6 ), chrome, [ sx * 0.033, 0.122, 0 ], [ 0, 0, - sx * 0.55 ] );
			add( g, G.cyl( 0.005, 0.004, 0.025, 6 ), chrome, [ sx * 0.036, 0, 0 ], [ 0, 0, sx * 0.25 ] );
		}
		add( g, G.cyl( 0.004, 0.004, 0.03, 6 ), chrome, [ 0, 0.128, 0 ] );
		add( g, G.box( 0.012, 0.008, 0.008 ), chrome, [ 0, 0.158, 0 ] );
		add( g, G.torus( 0.022, 0.003, 4, 12, PI ), chrome, [ 0, 0.142, - 0.01 ] );
		// winding keys on the back
		for ( const x of [ - 0.018, 0.018 ] ) add( g, G.box( 0.014, 0.012, 0.004 ), chrome, [ x, 0.07, - 0.026 ] );
		return g;
	} );

	reg( 'pl_snare', () => {
		const g = group();
		const loop = G.torus( 0.045, 0.0018, 4, 22 ); loop.rotateX( PI / 2 ); loop.scale( 1, 1, 0.8 );
		add( g, loop, wire(), [ 0.03, 0.004, 0 ] );
		const coil = G.torus( 0.03, 0.0018, 4, 18 ); coil.rotateX( PI / 2 );
		for ( let i = 0; i < 3; i ++ ) add( g, coil, wire(), [ - 0.04, 0.004 + i * 0.003, 0.004 * i ] );
		add( g, G.cylX( 0.009, 0.2, 6 ), stick(), [ 0, 0.012, 0.05 ], [ 0, 0.15, 0 ] );
		return ground( g );
	} );

	reg( 'pl_spring_trap', () => jaws( false ) );

	reg( 'pl_barrel', ( s ) => {
		const g = group(), c = s.color ?? 0x2a5aa8;
		const shell = M( c, { rough: 0.45, side: THREE.DoubleSide } );
		// an open-topped plastic drum: outer wall, rim, inner wall down to the floor
		add( g, G.lathe( [ [ 0, 0 ], [ 0.27, 0 ], [ 0.29, 0.03 ], [ 0.29, 0.84 ], [ 0.282, 0.88 ], [ 0.262, 0.88 ], [ 0.262, 0.05 ], [ 0, 0.05 ] ], 28 ), shell );
		for ( const y of [ 0.3, 0.58 ] ) add( g, G.torus( 0.292, 0.012, 5, 28 ).rotateX( PI / 2 ), shell, [ 0, y, 0 ] );
		// a mesh screen over the top keeps the mosquitoes and leaves out
		add( g, G.cyl( 0.262, 0.262, 0.002, 24 ), M( 0x2a2a2a, { rough: 0.9, transparent: true, opacity: 0.35 } ), [ 0, 0.862, 0 ] );
		add( g, G.cylX( 0.02, 0.05, 8 ), MAT.metal(), [ 0.29, 0.08, 0 ] );
		add( g, G.box( 0.012, 0.04, 0.012 ), MAT.metal(), [ 0.31, 0.08, 0 ] );
		return g;
	} );

	reg( 'pl_tote', ( s ) => {
		const g = group(), c = s.color ?? 0x3a4a5a, lid = s.lid ?? 0x2a6ad6;
		add( g, G.rectWrap( 0.56, 0.3, 0.38, 1.07 ), M( c, { rough: 0.45, side: THREE.DoubleSide } ) );
		add( g, G.box( 0.56, 0.01, 0.38 ), M( c, { rough: 0.45 } ) );
		add( g, G.rbox( 0.62, 0.035, 0.43, 0.01 ), M( lid, { rough: 0.4 } ), [ 0, 0.3, 0 ] );
		for ( const x of [ - 0.2, 0.2 ] ) add( g, G.box( 0.1, 0.014, 0.44 ), M( lid, { rough: 0.4 } ), [ x, 0.335, 0 ] );
		for ( const sx of [ - 1, 1 ] ) add( g, G.box( 0.02, 0.025, 0.12 ), M( 0x1a1a1a, { rough: 0.6 } ), [ sx * 0.3, 0.25, 0 ] );
		return g;
	} );

	reg( 'pl_candle', ( s ) => {
		const g = group(), wax = M( s.color ?? 0xf2ead8, { rough: 0.6 } );
		add( g, G.lathe( [ [ 0, 0 ], [ 0.026, 0 ], [ 0.026, 0.09 ], [ 0.022, 0.098 ], [ 0.012, 0.094 ], [ 0, 0.095 ] ], 18 ), wax );
		add( g, G.cyl( 0.0015, 0.0015, 0.012, 5 ), M( 0x1a1a1a ), [ 0, 0.094, 0 ] );
		// a drip down the side
		add( g, G.capsX( 0.004, 0.03, 5 ).rotateZ( PI / 2 ), wax, [ 0.025, 0.075, 0.004 ] );
		return g;
	} );

	reg( 'pl_tiki_torch', () => {
		const g = group(), bamboo = M( 0xc8a868, { rough: 0.7 } ), node = M( 0x9a7a44, { rough: 0.8 } );
		add( g, G.cylX( 0.02, 1.3, 10 ), bamboo, [ - 0.08, 0.04, 0 ] );
		for ( let x = - 0.68; x < 0.5; x += 0.28 ) add( g, G.cylX( 0.023, 0.018, 10 ), node, [ x, 0.04, 0 ] );
		// the woven cup at the top holding the oil canister and its wick
		add( g, G.cylX( 0.045, 0.16, 12, 0.03 ), M( 0x8a6a3a, { rough: 0.95 } ), [ 0.62, 0.045, 0 ] );
		add( g, G.cylX( 0.034, 0.1, 12 ), MAT.darkMetal(), [ 0.7, 0.045, 0 ] );
		add( g, G.cylX( 0.006, 0.04, 6 ), M( 0xe8dcc0, { rough: 0.9 } ), [ 0.77, 0.045, 0 ] );
		return ground( g );
	} );
}

// ---- placed shapes ----------------------------------------------------------------------------------------------------

// placedModel( name, spec ) -> Object3D, origin on the ground. names: snare { set, catch }, jaw { open, blood },
// tent { color }, bedroll { color }, tarp { color }, mound, hole, planks { w, n }. Each shape is built once per spec,
// merged per material (placeables/merge.js: a few draw calls each) and cloned (the clones share its geometry:
// nothing to dispose when a placed thing changes or goes).
const placedCache = new Map();
export function placedModel( name, s = {} ) {
	const key = name + JSON.stringify( s, ( k, v ) => typeof v === 'number' ? Math.round( v * 100 ) / 100 : v );
	let t = placedCache.get( key );
	if ( ! t ) { t = compact( buildPlaced( name, s ) ); placedCache.set( key, t ); }
	return t.clone();
}

function buildPlaced( name, s ) {
	const g = group();
	switch ( name ) {
		case 'snare': {
			// a stake, the wire running out from it, the noose standing open over a run
			add( g, G.cyl( 0.012, 0.016, 0.34, 6 ), stick(), [ - 0.16, 0, 0 ], [ 0, 0, 0.1 ] );
			add( g, G.tube( [ [ - 0.15, 0.3, 0 ], [ - 0.06, 0.24, 0 ], [ 0.02, 0.16, 0 ] ], 0.0016, 10, 4 ), wire() );
			if ( s.catch ) {
				add( g, G.torus( 0.03, 0.0018, 4, 14 ), wire(), [ 0.04, 0.05, 0 ], [ PI / 2, 0, 0 ] );
				const c = carcass( s.catch ); c.position.set( 0.12, 0, 0.02 ); c.rotation.y = 0.4; g.add( c );
			} else if ( s.set === false ) {
				add( g, G.torus( 0.045, 0.0018, 4, 18 ), wire(), [ 0.02, 0.006, 0 ], [ PI / 2, 0, 0 ] );
			} else {
				add( g, G.torus( 0.07, 0.0018, 4, 22 ), wire(), [ 0.04, 0.09, 0 ], [ 0, PI / 2, 0 ] );
				// a forked trigger stick holding it up
				add( g, G.cyl( 0.005, 0.006, 0.08, 5 ), stick(), [ 0.04, 0, 0.0 ], [ 0.15, 0, 0 ] );
			}
			return g;
		}
		case 'jaw': {
			const j = jaws( !! s.open ); g.add( j );
			if ( s.blood ) add( g, new THREE.CircleGeometry( 0.12, 12 ).rotateX( - PI / 2 ), M( 0x4a0a08, { rough: 0.3 } ), [ 0, 0.003, 0 ] );
			return g;
		}
		case 'tent': {
			const c = s.color ?? 0x2a7a4a;
			const fly = M( c, { rough: 0.75, side: THREE.DoubleSide } );
			const dome = G.dome( 1, 22, 9 ); dome.scale( 1.08, 1.1, 0.78 );
			add( g, dome, fly );
			// the door: a darker zipped panel on the front (+z)
			const door = new THREE.Mesh( new THREE.CircleGeometry( 0.42, 16, 0, PI ), M( 0x1a1e1a, { rough: 0.9 } ) );
			door.position.set( 0, 0.02, 0.775 ); door.rotation.x = - 0.12; door.receiveShadow = true;
			g.add( door );
			// crossed poles over the fly, a floor, stakes and guy lines
			const pole = M( 0x2a2a2a, { rough: 0.4, metal: 0.6 } );
			for ( const a of [ PI / 4, - PI / 4 ] ) {
				// along the diagonal the fly is an ellipse 0.89 m out and 1.1 m up: the pole follows it just outside
				const m = add( g, G.torus( 1, 0.008, 4, 28, PI ), pole );
				m.rotation.y = a; m.scale.set( 0.905, 1.11, 1 );
			}
			add( g, G.box( 2.2, 0.02, 1.6 ), M( 0x1a1a1a, { rough: 0.9 } ) );
			for ( const [ x, z ] of [ [ 1.4, 1.0 ], [ - 1.4, 1.0 ], [ 1.4, - 1.0 ], [ - 1.4, - 1.0 ] ] ) {
				add( g, G.cyl( 0.006, 0.004, 0.12, 4 ), MAT.metal(), [ x, 0, z ] );
				add( g, G.tube( [ [ x, 0.1, z ], [ x * 0.62, 0.55, z * 0.55 ] ], 0.002, 2, 3 ), M( 0xd8d0b0, { rough: 0.8 } ) );
			}
			return g;
		}
		case 'bedroll': {
			// a mummy bag laid out: lofted, tapering to the feet (-x), quilted across, the hood and its dark opening at
			// the head (+x) with a pillow in it, the top corner turned back on its lining, a zip down one side
			const c = s.color ?? 0x2a4a8a, shell = M( c, { rough: 0.85 } ), seam = M( shade( c, - 0.35 ), { rough: 0.9 } );
			const R = 0.36, L = 2.1, lift = R * 0.06, loft = R * 0.36;
			const halfW = ( x ) => R * ( 0.66 + 0.34 * Math.min( 1, Math.max( 0, ( x + L / 2 ) / L ) ) ** 0.7 );
			const top = ( x, z ) => { const w = halfW( x ); return lift + loft * Math.sqrt( Math.max( 0, 1 - ( z / w ) ** 2 ) ); };
			const body = new THREE.CapsuleGeometry( R, L - R * 2, 6, 20, 10 ).rotateZ( PI / 2 );
			const P = body.attributes.position;
			for ( let i = 0; i < P.count; i ++ ) {
				const x = P.getX( i ), y = P.getY( i ), z = P.getZ( i );
				P.setXYZ( i, x, lift + ( y > 0 ? y * loft / R : y * 0.06 ), z * halfW( x ) / R );
			}
			body.computeVertexNormals();
			add( g, body, shell );
			// baffles: low ridges over the top from side to side
			for ( let x = - 0.82; x < 0.5; x += 0.22 ) {
				const w = halfW( x ) * 0.97, pts = [];
				for ( let k = 0; k <= 8; k ++ ) { const a = k / 8 * PI, z = Math.cos( a ) * w; pts.push( [ x, top( x, z ) + 0.002, z ] ); }
				add( g, G.tube( pts, 0.008, 10, 4 ), seam );
			}
			// the zip down the right side, from the hood to the knees
			const zip = [];
			for ( let x = - 0.3; x <= 0.62; x += 0.12 ) zip.push( [ x, top( x, halfW( x ) * 0.72 ) + 0.002, halfW( x ) * 0.72 ] );
			add( g, G.tube( zip, 0.006, 10, 4 ), M( 0x15161a, { rough: 0.5 } ) );
			// the top corner turned back by the zip: a triangle of lining showing
			const fold = new THREE.Shape();
			// (in the shape's plane +y becomes -z once laid flat: the flap reaches from the zip towards the middle,
			// tilted up with the bag's top)
			fold.moveTo( 0, 0 ); fold.lineTo( - 0.34, 0 ); fold.lineTo( 0, 0.2 ); fold.closePath();
			const fx = 0.62, fz = halfW( fx ) * 0.72;
			add( g, new THREE.ShapeGeometry( fold ).rotateX( - PI / 2 ), M( 0xc8a24a, { rough: 0.9 } ), [ fx, top( fx, fz ) + 0.01, fz ], [ 0.21, 0, 0 ] );
			// the hood: a drawcord rim round a dark opening, a pillow inside
			const hx = L / 2 - R * 0.62;
			const open = G.sph( R * 0.56, 16, 8 ); open.scale( 0.8, 0.22, 1.05 );
			add( g, open, M( 0x121317, { rough: 1 } ), [ hx, lift + loft * 0.86, 0 ] );
			const rim = G.torus( R * 0.56, 0.028, 6, 22 ); rim.rotateX( PI / 2 ); rim.scale( 0.8, 1, 1.05 );
			add( g, rim, shell, [ hx, lift + loft * 0.98, 0 ] );
			add( g, G.rbox( 0.16, 0.07, 0.3, 0.03 ), M( 0xd8d4c8, { rough: 0.95 } ), [ hx + 0.03, lift + loft * 0.84, 0 ] );
			return g;
		}
		case 'tarp': {
			// four stakes, the tarp tied between them sagging to the middle, where the rain pools
			const c = s.color ?? 0x2a5aa8, H = 0.8, S = 0.75;
			for ( const [ x, z ] of [ [ S, S ], [ - S, S ], [ S, - S ], [ - S, - S ] ] ) add( g, G.cyl( 0.016, 0.02, H + 0.05, 5 ), stick(), [ x, 0, z ] );
			const geo = new THREE.PlaneGeometry( S * 2, S * 2, 10, 10 ).rotateX( - PI / 2 );
			const p = geo.attributes.position;
			for ( let i = 0; i < p.count; i ++ ) {
				const u = p.getX( i ) / S, v = p.getZ( i ) / S;
				p.setY( i, H - 0.42 * ( 1 - u * u ) * ( 1 - v * v ) );
			}
			geo.computeVertexNormals();
			add( g, geo, M( c, { rough: 0.55, side: THREE.DoubleSide } ) );
			return g;
		}
		case 'hole': {
			// a dug hole: a pit going dark towards the bottom (the ground can't be cut, so the depth is painted), a
			// broken rim of spoil round it and the heap thrown to one side
			const soil = M( s.sand ? 0x8a7450 : 0x4a3a28, { rough: 1 } );
			add( g, new THREE.CircleGeometry( 0.34, 22 ).rotateX( - PI / 2 ), M( 0xffffff, { map: pitTex( !! s.sand ), rough: 1 } ), [ 0, 0.012, 0 ] );
			for ( let i = 0; i < 12; i ++ ) {
				const a = i / 12 * PI * 2 + Math.sin( i * 2.7 ) * 0.18, r = 0.4 + Math.sin( i * 1.9 ) * 0.03;
				add( g, lump( 0.1 + 0.025 * Math.sin( i * 3.1 ), 0.04 + 0.012 * Math.cos( i * 2.3 ), i + 5 ), soil, [ Math.cos( a ) * r, - 0.01, Math.sin( a ) * r ], [ 0, - a, 0 ] );
			}
			add( g, lump( 0.28, 0.13, 3 ), soil, [ 0.72, - 0.01, 0.14 ] );
			return g;
		}
		case 'mound': {
			// fresh earth heaped over it, darker than the ground round it, a few stones turned up
			add( g, lump( 0.5, 0.2, 1 ), M( s.sand ? 0x8a7450 : 0x4a3a28, { rough: 1 } ), [ 0, - 0.03, 0 ] );
			for ( const [ x, z, r ] of [ [ 0.2, 0.1, 0.045 ], [ - 0.25, - 0.12, 0.035 ], [ 0.05, - 0.25, 0.03 ] ] ) add( g, facet( G.sph( r, 5, 4 ) ), M( 0x5a5650, { rough: 0.95 } ), [ x, 0.07, z ] );
			return g;
		}
		case 'planks': {
			// planks across a doorway, local x along the door, nailed at both ends
			const w = s.w ?? 1, n = s.n ?? 1, mat = plankMaterial(), nail = MAT.darkMetal();
			const H = [ 0.55, 1.45, 1.0, 1.85 ];
			for ( let i = 0; i < n; i ++ ) {
				const tilt = [ 0.08, - 0.06, 0.22, - 0.03 ][ i % 4 ];
				const m = add( g, G.box( w + 0.32, 0.15, 0.028 ).translate( 0, - 0.075, 0 ), mat, [ 0, H[ i % 4 ], 0 ], [ 0, 0, tilt ] );
				for ( const e of [ - 1, 1 ] ) {
					const nx = e * ( w / 2 + 0.08 );
					add( g, G.cyl( 0.008, 0.008, 0.006, 6 ).rotateX( PI / 2 ), nail, [ nx * Math.cos( tilt ), H[ i % 4 ] + nx * Math.sin( tilt ), 0.017 ] );
				}
				void m;
			}
			return g;
		}
	}
	return g;
}
