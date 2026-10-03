// Model builders for the arms items that aren't weapons (docs/ITEMS_PLAN.md "arms"): the cleaning rod, the parts kits,
// the slingshot and its shot, the horns, the can tripwire (and its placed look, ext/arms/kinds.js reads ARMS.look),
// the arm guards, the welder's mask, the chainmail glove, the whetstone and barbed wire. The melee weapons, the gun
// fittings and the thrown things are drawn by the weapons module (ext/arms/parts.js). register( reg ) is called once
// by render/ItemModels.js.
// Conventions (render/ItemModels.js): metres, origin at the centre of the bottom, long axis along +x. Parts are built
// with centred geometry and set on the ground at the end with ground().
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, labelTex, canvasTex, css } from '../lib.js';
import { ARMS } from '../../ext/arms/kinds.js';
import { TRIP } from '../../ext/arms/logic.js';

const B = ( w, h, d ) => new THREE.BoxGeometry( w, h, d );
const C = ( rt, rb, h, seg = 16, open = false ) => new THREE.CylinderGeometry( rt, rb, h, seg, 1, open );
const tube = ( pts, r, seg = 24, rs = 6 ) => new THREE.TubeGeometry( new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( ...p ) ) ), seg, r, rs, false );

const steel = () => M( 0xa3a8ae, { rough: 0.32, metal: 0.9 } );
const brass = () => M( 0xc8a24a, { rough: 0.3, metal: 0.9 } );
const tin = () => M( 0xb9bec4, { rough: 0.35, metal: 0.85 } );
const rust = () => M( 0x7a5236, { rough: 0.7, metal: 0.4 } );
const plastic = ( c, rough = 0.45 ) => M( c, { rough } );
const rubber = ( c = 0x18181a ) => M( c, { rough: 0.85 } );
const wood = ( c = 0x8a6440 ) => M( c, { rough: 0.8 } );
const tape = () => M( 0x8d9197, { rough: 0.5, metal: 0.2 } );
const flat = ( spec, o = {} ) => M( 0xffffff, { map: labelTex( spec ), rough: o.rough ?? 0.55, metal: o.metal ?? 0 } );

// ---- printed and woven surfaces -----------------------------------------------------------------------------------------

// chain mail: rows of interlocking rings
function mailTex() {
	return canvasTex( 'arms:mail', 128, 128, ( ctx, W, H ) => {
		ctx.fillStyle = '#4a4e53'; ctx.fillRect( 0, 0, W, H );
		const s = 8;
		for ( let y = - s; y < H + s; y += s * 0.75 ) for ( let x = - s; x < W + s; x += s ) {
			const ox = ( Math.round( y / ( s * 0.75 ) ) % 2 ) * s * 0.5;
			ctx.strokeStyle = '#c9ced4'; ctx.lineWidth = 2.2;
			ctx.beginPath(); ctx.arc( x + ox, y, s * 0.42, 0, PI * 2 ); ctx.stroke();
			ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
			ctx.beginPath(); ctx.arc( x + ox, y, s * 0.42, PI * 1.1, PI * 1.6 ); ctx.stroke();
		}
	}, { repeat: true } );
}

// a magazine's glossy cover rolled up: blocks of colour, a masthead, cover lines
function magTex( key, bg, fg, text ) {
	return canvasTex( 'arms:mag:' + key, 256, 128, ( ctx, W, H ) => {
		ctx.fillStyle = css( bg ); ctx.fillRect( 0, 0, W, H );
		ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect( W * 0.08, H * 0.38, W * 0.38, H * 0.5 );
		ctx.fillStyle = css( fg ); ctx.font = '900 34px Arial'; ctx.textBaseline = 'top'; ctx.fillText( text, W * 0.06, H * 0.06 );
		ctx.fillStyle = '#222'; ctx.font = 'bold 12px Arial';
		for ( let i = 0; i < 4; i ++ ) ctx.fillText( [ 'TOP 10', 'NEW!', 'HOW TO', 'ISSUE 42' ][ i ], W * 0.52, H * ( 0.42 + i * 0.13 ) );
		ctx.fillStyle = '#e8c23a'; ctx.beginPath(); ctx.arc( W * 0.8, H * 0.25, 14, 0, PI * 2 ); ctx.fill();
	}, { repeat: true } );
}

// the paper blowout's stripes
function stripeTex() {
	return canvasTex( 'arms:partystripe', 128, 32, ( ctx, W, H ) => {
		for ( let i = 0; i < 8; i ++ ) { ctx.fillStyle = [ '#d8282a', '#f2c230', '#2a7ad8', '#f2c230' ][ i % 4 ]; ctx.fillRect( i * W / 8, 0, W / 8, H ); }
		ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect( 0, H * 0.2, W, H * 0.15 );
	}, { repeat: true } );
}

// ---- pieces shared by the tripwire kit and its placed look ------------------------------------------------------------------

// an empty tin can, open at the top, a scrap of faded label; on its side (lying) or hanging from a loop
function can( g, x, y, z, lying = false, rot = 0 ) {
	const c = group();
	add( c, C( 0.033, 0.033, 0.1, 16, true ), tin(), [ 0, 0.05, 0 ] );
	add( c, C( 0.0332, 0.0332, 0.045, 16, true ), M( 0xb88a4a, { rough: 0.8 } ), [ 0, 0.05, 0 ] );
	add( c, C( 0.033, 0.033, 0.002, 16 ), tin(), [ 0, 0.001, 0 ] );
	add( c, new THREE.TorusGeometry( 0.033, 0.0018, 4, 16 ).rotateX( PI / 2 ), tin(), [ 0, 0.1, 0 ] );
	c.position.set( x, y, z );
	if ( lying ) c.rotation.set( PI / 2, rot, 0 ); else c.rotation.y = rot;
	g.add( c );
	return c;
}

// the air horn: an aerosol can with a flared red trumpet on top
function airHorn( g, x, y, z, s = 1 ) {
	const h = group();
	add( h, C( 0.03, 0.03, 0.12, 18, true ), flat( { bg: 0xf2f2ee, fg: 0xc8201a, text: 'AIR HORN', sub: 'MARINE · SPORT · 120 dB', style: 'band', band: 0xc8201a, subColor: 0xf2f2ee, w: 384, h: 256 }, { metal: 0.3, rough: 0.35 } ), [ 0, 0.06, 0 ] );
	add( h, C( 0.03, 0.03, 0.003, 18 ), tin(), [ 0, 0.0015, 0 ] );
	add( h, G.lathe( [ [ 0.03, 0.12 ], [ 0.018, 0.135 ], [ 0.012, 0.14 ] ], 16 ), tin() );
	add( h, C( 0.016, 0.014, 0.022, 14 ), plastic( 0xd02a22 ), [ 0, 0.152, 0 ] );
	const trumpet = G.lathe( [ [ 0.006, 0 ], [ 0.008, 0.03 ], [ 0.016, 0.06 ], [ 0.034, 0.082 ], [ 0.036, 0.084 ] ], 18 );
	add( h, trumpet, M( 0xd02a22, { rough: 0.4, side: THREE.DoubleSide } ), [ 0.006, 0.16, 0 ], [ 0, 0, - PI / 2 + 0.05 ] );
	add( h, C( 0.008, 0.008, 0.012, 10 ), plastic( 0x1a1a1a ), [ - 0.004, 0.17, 0 ] );
	h.position.set( x, y, z ); h.scale.setScalar( s );
	g.add( h );
	return h;
}

// the placed tripwire: two stakes 2.6 m apart (local x), the wire between them, cans hanging from it (or lying where they
// fell once tripped), an air horn strapped to a stake when one is rigged
function tripLook( p ) {
	const g = group(), L = TRIP.len, set = p.preview || p.data?.set !== false;
	const stakeM = wood( 0x7a5a3a ), wire = steel();
	for ( const s of [ - 1, 1 ] ) {
		add( g, B( 0.028, 0.36, 0.028 ), stakeM, [ s * L / 2, 0.13, 0 ], [ 0.05 * s, 0, 0.04 * s ] );
		add( g, new THREE.ConeGeometry( 0.02, 0.06, 4 ).rotateX( PI ), stakeM, [ s * L / 2, - 0.06, 0 ] );
	}
	const n = 5, sag = 0.03, hy = 0.13;
	if ( set ) {
		const pts = [];
		for ( let i = 0; i <= 12; i ++ ) { const t = i / 12; pts.push( [ ( t - 0.5 ) * L, hy - Math.sin( t * PI ) * sag, 0 ] ); }
		add( g, tube( pts, 0.0015, 24, 4 ), wire );
		for ( let i = 0; i < n; i ++ ) {
			const t = ( i + 1 ) / ( n + 1 ), x = ( t - 0.5 ) * L, y = hy - Math.sin( t * PI ) * sag;
			add( g, tube( [ [ x, y, 0 ], [ x + 0.004, y - 0.02, 0.003 ], [ x, y - 0.035, 0 ] ], 0.0012, 6, 3 ), wire );
			const c = can( g, x, y - 0.135, 0, false, i * 1.3 );
			c.rotation.z = ( i % 2 ? 0.08 : - 0.06 );
		}
	} else {
		const pts = [];
		for ( let i = 0; i <= 12; i ++ ) { const t = i / 12; pts.push( [ ( t - 0.5 ) * L, 0.012 + ( t < 0.08 || t > 0.92 ? 0.1 : 0 ), Math.sin( t * PI * 2 ) * 0.08 ] ); }
		add( g, tube( pts, 0.0015, 24, 4 ), wire );
		for ( let i = 0; i < n; i ++ ) can( g, ( ( i + 1 ) / ( n + 1 ) - 0.5 ) * L + ( i % 2 ? 0.08 : - 0.1 ), 0.033, ( i % 2 ? 0.12 : - 0.1 ), true, i * 1.9 );
	}
	if ( p.data?.horn || p.stack?.data?.horn ) {
		airHorn( g, L / 2 + 0.05, 0.02, 0.06, 0.9 );
		add( g, B( 0.012, 0.02, 0.07 ), tape(), [ L / 2 + 0.02, 0.08, 0.03 ] );
	}
	return g;
}

export function register( reg ) {
	// ---- a cleaning rod: jointed sections, a T-handle, a bronze bore brush, two patches beside it ----
	reg( 'arms_rod', () => {
		const g = group(), y = 0.012;
		add( g, G.cylX( 0.0034, 0.5, 8 ), brass(), [ 0, y, 0 ] );
		for ( const x of [ - 0.085, 0.085 ] ) add( g, G.cylX( 0.0047, 0.014, 10 ), brass(), [ x, y, 0 ] );
		add( g, G.cylX( 0.0075, 0.03, 12 ), plastic( 0x1a1a1c ), [ - 0.265, y, 0 ] );
		add( g, G.cylZ( 0.0085, 0.085, 12 ), plastic( 0x1a1a1c ), [ - 0.284, y, 0 ] );
		add( g, G.cylX( 0.0068, 0.036, 12 ), M( 0x9a6a38, { rough: 0.95 } ), [ 0.269, y, 0 ] );
		for ( let i = 0; i < 8; i ++ ) add( g, G.cylX( 0.0073, 0.0016, 12 ), M( 0x7a5226, { rough: 1 } ), [ 0.254 + i * 0.0042, y, 0 ] );
		add( g, new THREE.ConeGeometry( 0.0035, 0.01, 8 ).rotateZ( - PI / 2 ), brass(), [ 0.292, y, 0 ] );
		for ( const [ x, z, r ] of [ [ 0.05, 0.05, 0.3 ], [ 0.1, 0.055, - 0.4 ] ] ) add( g, B( 0.045, 0.0012, 0.045 ), M( 0xf0ece0, { rough: 0.95 } ), [ x, 0.0006, z ], [ 0, r, 0 ] );
		return ground( g );
	} );

	// ---- a parts kit: a small hard case, its lid's label saying which guns ----
	reg( 'arms_partskit', ( s ) => {
		const g = group(), cls = s.cls || 'rifle';
		const C3 = { pistol: [ 0x1c1c1e, 0xf2c21a ], rifle: [ 0x48502e, 0xf2f2ee ], shotgun: [ 0x5a1a16, 0xf2e6c8 ] }[ cls ] || [ 0x333333, 0xffffff ];
		const w = 0.13, h = 0.036, d = 0.09;
		add( g, G.rbox( w, h, d, 0.006 ), plastic( C3[ 0 ], 0.5 ) );
		add( g, B( w * 1.004, 0.004, d * 1.004 ), plastic( C3[ 0 ] === 0x1c1c1e ? 0x2c2c30 : C3[ 0 ], 0.4 ), [ 0, h * 0.62, 0 ] );
		for ( const x of [ - w * 0.32, w * 0.32 ] ) add( g, B( 0.016, 0.014, 0.006 ), MAT.metal(), [ x, h * 0.55, d / 2 + 0.002 ] );
		add( g, new THREE.PlaneGeometry( w * 0.8, d * 0.62 ).rotateX( - PI / 2 ), flat( { bg: C3[ 1 ], fg: C3[ 0 ] === 0x48502e ? 0x2a3018 : 0x1a1a1a, text: cls.toUpperCase(), sub: 'PARTS KIT · springs · pins', style: 'band', band: C3[ 0 ], subColor: C3[ 1 ], size: 0.34 } ), [ 0, h + 0.0008, 0 ] );
		return g;
	} );

	// ---- a slingshot: a black steel fork with a grip, amber tubing to a leather pouch ----
	reg( 'arms_slingshot', () => {
		// lying flat: the grip back along -x, the fork opening forward, the bands slack beyond it to the pouch
		const g = group(), y = 0.013, fm = M( 0x26282b, { rough: 0.4, metal: 0.7 } );
		add( g, G.cylX( 0.0125, 0.1, 12 ), rubber( 0x1a1a1a ), [ - 0.06, y, 0 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, G.cylX( 0.0136, 0.006, 12 ), rubber( 0x2c2c2c ), [ - 0.095 + i * 0.022, y, 0 ] );
		add( g, G.sph( 0.011, 10, 8 ), fm, [ - 0.01, y, 0 ] );
		for ( const s of [ - 1, 1 ] ) {
			add( g, tube( [ [ - 0.01, y, 0 ], [ 0.02, y, s * 0.026 ], [ 0.05, y, s * 0.042 ], [ 0.095, y, s * 0.046 ] ], 0.0055, 12, 6 ), fm );
			add( g, G.sph( 0.0075, 10, 8 ), fm, [ 0.097, y, s * 0.046 ] );
			add( g, tube( [ [ 0.098, y, s * 0.046 ], [ 0.13, y - 0.004, s * 0.034 ], [ 0.165, y - 0.006, s * 0.018 ], [ 0.19, y - 0.007, s * 0.011 ] ], 0.0036, 12, 6 ), M( 0xd88a2a, { rough: 0.4 } ) );
		}
		add( g, G.rbox( 0.03, 0.004, 0.03, 0.002 ).translate( 0, - 0.002, 0 ), M( 0x7a4a28, { rough: 0.85 } ), [ 0.2, y - 0.007, 0 ] );
		return ground( g );
	} );

	// ---- steel shot: a small labelled box and a few loose balls ----
	reg( 'arms_shot', () => {
		const g = group();
		add( g, G.box( 0.07, 0.03, 0.05 ), flat( { bg: 0x1a1a1a, fg: 0xf2c21a, text: 'STEEL SHOT', sub: '3/8 in · 50 ct', style: 'band', band: 0xf2c21a, subColor: 0x1a1a1a, size: 0.3 } ) );
		for ( const [ x, z ] of [ [ 0.05, 0.02 ], [ 0.058, 0.0 ], [ 0.047, - 0.016 ], [ 0.066, 0.016 ], [ 0.04, 0.034 ] ] ) add( g, G.sph( 0.0048, 10, 8 ), M( 0xc4c8ce, { rough: 0.15, metal: 1 } ), [ x, 0.0048, z ] );
		return g;
	} );

	// ---- an air horn ----
	reg( 'arms_airhorn', () => { const g = group(); airHorn( g, 0, 0, 0 ); return ground( g ); } );

	// ---- a party horn: a mouthpiece, foil fringe, the paper blowout rolled into its coil ----
	reg( 'arms_partyhorn', () => {
		const g = group(), y = 0.006;
		const pts = [];
		for ( let i = 0; i <= 60; i ++ ) { const t = i / 60, a = t * PI * 4.4, r = 0.034 * ( 1 - t * 0.78 ); pts.push( [ 0.04 + Math.cos( a ) * r, y, Math.sin( a ) * r - 0.0 ] ); }
		pts.unshift( [ 0.0, y, 0.0 ] );
		const coil = tube( pts, 0.0062, 90, 8 ); coil.scale( 1, 0.55, 1 );
		const tex = stripeTex().clone(); tex.repeat.set( 12, 1 ); tex.needsUpdate = true;
		add( g, coil, M( 0xffffff, { map: tex, rough: 0.6 } ), [ 0, 0.003, 0 ] );
		add( g, G.cylX( 0.0055, 0.04, 10, 0.0045 ), plastic( 0xf2f2ee, 0.35 ), [ - 0.022, y, 0 ] );
		for ( let i = 0; i < 6; i ++ ) add( g, B( 0.022, 0.0008, 0.0035 ), M( i % 2 ? 0xf2c230 : 0xd8282a, { rough: 0.25, metal: 0.6 } ), [ - 0.0, y + 0.004, ( i - 2.5 ) * 0.0045 ], [ 0, ( i - 2.5 ) * 0.25, 0 ] );
		return ground( g );
	} );

	// ---- the can tripwire, rolled up: a coil of wire with its cans and two stakes ----
	reg( 'arms_tripkit', ( s, def ) => {
		const g = group();
		const coil = new THREE.TorusGeometry( 0.06, 0.004, 5, 24 ).rotateX( PI / 2 );
		for ( let i = 0; i < 3; i ++ ) add( g, coil.clone(), steel(), [ 0, 0.004 + i * 0.006, 0 ], [ 0, i * 0.4, 0 ] );
		can( g, 0.1, 0.033, 0.04, true, 0.5 );
		can( g, 0.1, 0.033, - 0.045, true, - 0.3 );
		can( g, - 0.1, 0.033, 0.03, true, 2.6 );
		can( g, - 0.07, 0.033, - 0.07, true, 1.9 );
		for ( const z of [ 0.09, 0.115 ] ) add( g, B( 0.3, 0.022, 0.022 ), wood( 0x7a5a3a ), [ 0, 0.011, z ] );
		void def;
		return ground( g );
	} );

	// ---- arm guards: two magazines rolled round the forearm and taped, or a pair of kevlar sleeves ----
	reg( 'arms_guards', ( s ) => {
		const g = group();
		if ( s.kind === 'kevlar' ) {
			for ( const z of [ - 0.045, 0.045 ] ) {
				const sl = C( 0.034, 0.042, 0.3, 18, true ).rotateZ( - PI / 2 ); sl.scale( 1, 0.42, 1 );
				add( g, sl, M( 0x1d1e20, { rough: 0.95, side: THREE.DoubleSide } ), [ 0, 0.018, z ] );
				add( g, G.cylX( 0.044, 0.02, 18 ).scale( 1, 0.42, 1 ), M( 0x2a2b2e, { rough: 0.9 } ), [ - 0.15, 0.018, z ] );
				add( g, B( 0.04, 0.002, 0.02 ), M( 0xe8c23a, { rough: 0.6 } ), [ 0.05, 0.036, z ] );
			}
			return ground( g );
		}
		const covers = [ [ 'a', 0xd8302a, 0xffffff, 'SURF' ], [ 'b', 0x2a6ad8, 0xf2c230, 'WHEELS' ] ];
		[ - 0.05, 0.05 ].forEach( ( z, i ) => {
			const [ key, bg, fg, text ] = covers[ i ];
			const t = magTex( key, bg, fg, text ).clone(); t.repeat.set( 1.6, 1 ); t.needsUpdate = true;
			const roll = C( 0.042, 0.042, 0.22, 20, true ).rotateZ( - PI / 2 );
			add( g, roll, M( 0xffffff, { map: t, rough: 0.35, side: THREE.DoubleSide } ), [ 0, 0.042, z ] );
			for ( const x of [ - 0.07, 0.07 ] ) add( g, G.cylX( 0.0436, 0.03, 20 ), tape(), [ x, 0.042, z ] );
		} );
		return ground( g );
	} );

	// ---- a welder's mask: a dark shell round the face, the dark lens in its window, the headgear inside ----
	reg( 'arms_welder', () => {
		const g = group();
		const shellM = M( 0x2a3326, { rough: 0.55, side: THREE.DoubleSide } );
		const shell = G.sph( 0.13, 22, 14, - PI * 0.62, PI * 1.24, 0, PI * 0.72 ); shell.scale( 1, 1.3, 0.92 ); shell.rotateY( PI / 2 );
		add( g, shell, shellM, [ 0, 0.0, 0 ] );
		const lower = new THREE.CylinderGeometry( 0.13, 0.12, 0.09, 22, 1, true, - PI * 0.62, PI * 1.24 ); lower.scale( 1, 1, 0.92 ); lower.rotateY( PI / 2 );
		add( g, lower, shellM, [ 0, - 0.045, 0 ] );
		add( g, B( 0.018, 0.068, 0.13 ), M( 0x1c2018, { rough: 0.5 } ), [ 0.123, 0.03, 0 ] );
		add( g, B( 0.006, 0.05, 0.105 ), M( 0x14302a, { rough: 0.05, metal: 0.6 } ), [ 0.133, 0.03, 0 ] );
		const band = new THREE.TorusGeometry( 0.085, 0.006, 4, 24 ).rotateX( PI / 2 ); band.scale( 1, 1, 0.85 );
		add( g, band, plastic( 0x1a1a1a ), [ - 0.005, 0.05, 0 ] );
		for ( const z of [ - 0.12, 0.12 ] ) add( g, G.cylZ( 0.016, 0.012, 14 ), plastic( 0x1a1a1a ), [ 0, 0.02, z ] );
		const root = group(); root.add( g );
		g.rotation.z = 0.08;
		return ground( root );
	} );

	// ---- a butcher's chainmail glove: mail over the hand and fingers, a white strap at the cuff ----
	reg( 'arms_mailglove', () => {
		const g = group();
		const tex = mailTex().clone(); tex.repeat.set( 3, 3 ); tex.needsUpdate = true;
		const mail = M( 0xffffff, { map: tex, rough: 0.35, metal: 0.85 } );
		add( g, G.rbox( 0.09, 0.024, 0.082, 0.01 ).translate( 0, - 0.012, 0 ), mail, [ 0, 0.013, 0 ] );
		[ [ 0.068, - 0.028 ], [ 0.08, - 0.009 ], [ 0.076, 0.01 ], [ 0.06, 0.028 ] ].forEach( ( [ len, z ], i ) => add( g, G.capsX( 0.0095, len, 8, 3 ), mail, [ 0.045 + len / 2 - 0.006, 0.011, z ], [ 0, ( i - 1.5 ) * 0.05, 0 ] ) );
		add( g, G.capsX( 0.011, 0.065, 8, 3 ), mail, [ 0.012, 0.011, - 0.052 ], [ 0, 0.75, 0 ] );
		const cuff = G.cylX( 0.04, 0.06, 18 ); cuff.scale( 1, 0.42, 1 );
		add( g, cuff, mail, [ - 0.075, 0.017, 0 ] );
		add( g, G.cylX( 0.0415, 0.016, 18 ).scale( 1, 0.43, 1 ), M( 0xf2f2ee, { rough: 0.8 } ), [ - 0.09, 0.017, 0 ] );
		add( g, B( 0.012, 0.004, 0.012 ), steel(), [ - 0.09, 0.035, 0.0 ] );
		return ground( g );
	} );

	// ---- a whetstone: a two-grit bench stone on a rubber base ----
	reg( 'arms_whetstone', () => {
		const g = group();
		add( g, G.rbox( 0.17, 0.012, 0.06, 0.004 ), rubber( 0x202224 ) );
		add( g, G.box( 0.15, 0.012, 0.05 ), M( 0x8a8f94, { rough: 0.95 } ), [ 0, 0.01, 0 ] );
		add( g, G.box( 0.15, 0.012, 0.05 ), M( 0xb86a3a, { rough: 1 } ), [ 0, 0.022, 0 ] );
		return g;
	} );

	// ---- barbed wire: a coil of two twisted strands, barbs every hand's width ----
	reg( 'arms_barbwire', () => {
		const g = group(), R = 0.11, turns = 3, n = 120, pts = [], pts2 = [];
		for ( let i = 0; i <= n; i ++ ) {
			const t = i / n, a = t * turns * PI * 2, r = R + Math.sin( t * PI * 7 ) * 0.008, y = 0.01 + t * 0.02;
			pts.push( [ Math.cos( a ) * r, y, Math.sin( a ) * r ] );
			pts2.push( [ Math.cos( a ) * ( r + 0.003 * Math.cos( i ) ), y + 0.003 * Math.sin( i ), Math.sin( a ) * ( r + 0.003 * Math.cos( i ) ) ] );
		}
		const wm = M( 0x8f949a, { rough: 0.5, metal: 0.8 } );
		add( g, tube( pts, 0.0018, 130, 5 ), wm );
		add( g, tube( pts2, 0.0015, 130, 3 ), wm );
		for ( let i = 0; i < 30; i ++ ) {
			const t = ( i + 0.5 ) / 30, a = t * turns * PI * 2, r = R, y = 0.01 + t * 0.02, x = Math.cos( a ) * r, z = Math.sin( a ) * r;
			for ( const s of [ - 1, 1 ] ) add( g, tube( [ [ x, y, z ], [ x + s * 0.008, y + 0.008, z + 0.006 ] ], 0.0011, 2, 3 ), wm );
		}
		return ground( g );
	} );

	// the placed tripwire (ext/arms/kinds.js)
	ARMS.look.arms_tripwire = ( p ) => tripLook( p );
}
