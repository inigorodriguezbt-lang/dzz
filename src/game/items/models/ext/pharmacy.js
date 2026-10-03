// Model builders for the pharmacy items (docs/ITEMS_PLAN.md "pharmacy"). register( reg ) is called once by
// render/ItemModels.js with registerModelBuilder. Real-world sizes in metres, origin at the centre of the bottom, long
// axis along +x (lib.js conventions). Most medicine reuses the medical and food builders (pill bottles, blisters,
// tubes, bottles, jars, sachets, kits); these are the shapes that are new: dispensers (a pump, a trigger sprayer, an
// eye dropper, an inhaler), instruments (a thermometer, a blood pressure cuff, a stethoscope, an AED, trauma shears),
// a crutch, an arm sling, a used bandage, cotton balls, the mortar and pestle, and the Hawaiian herbs: roots (ʻōlena,
// ʻawa, ʻuhaloa), noni, kukui nuts, pōpolo berries, māmaki and aloe leaves, poultices in a ti leaf, a ti-leaf wrap.
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, labelTex, canvasTex, facet } from '../lib.js';

// ---- small helpers ------------------------------------------------------------------------------------------------

function rng( seed ) {
	let s = ( seed >>> 0 ) || 7;
	return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ( s >>> 0 ) / 4294967296; };
}
const labelMat = ( spec, o = {} ) => M( 0xffffff, { map: labelTex( { w: 512, h: 256, style: 'band', ...spec } ), rough: o.rough ?? 0.5, metal: o.metal ?? 0 } );

// a leaf lying in the xz plane along +x from its stem (length L, width W), bent by fn( x, z ) -> y; UVs 0..1
function leafGeo( L, W, bend = null, seg = 10, serrate = 0 ) {
	const s = new THREE.Shape();
	const N = 14;
	s.moveTo( 0, 0 );
	for ( let i = 1; i <= N; i ++ ) { const t = i / N, w = Math.sin( Math.pow( t, 0.8 ) * PI ) * W / 2 * ( 1 + ( serrate && i % 2 ? serrate : 0 ) ); s.lineTo( t * L, w ); }
	for ( let i = N - 1; i >= 1; i -- ) { const t = i / N, w = Math.sin( Math.pow( t, 0.8 ) * PI ) * W / 2 * ( 1 + ( serrate && i % 2 ? serrate : 0 ) ); s.lineTo( t * L, - w ); }
	s.lineTo( 0, 0 );
	const geo = new THREE.ShapeGeometry( s, seg );
	geo.rotateX( - PI / 2 );
	geo.computeBoundingBox();
	const bb = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), z = p.getZ( i );
		uv.setXY( i, ( x - bb.min.x ) / ( bb.max.x - bb.min.x || 1 ), ( z - bb.min.z ) / ( bb.max.z - bb.min.z || 1 ) );
		if ( bend ) p.setY( i, bend( x, z ) );
	}
	geo.computeVertexNormals();
	return geo;
}

// a leaf's surface: the blade colour, a midrib and side veins (vein colour), a lighter edge
function leafTex( color, vein, key = '' ) {
	return canvasTex( `pharm:leaf:${color}:${vein}:${key}`, 256, 128, ( ctx, W, H ) => {
		const c = '#' + color.toString( 16 ).padStart( 6, '0' ), v = '#' + vein.toString( 16 ).padStart( 6, '0' );
		ctx.fillStyle = c; ctx.fillRect( 0, 0, W, H );
		const r = rng( color );
		for ( let i = 0; i < 300; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; ctx.fillRect( r() * W, r() * H, 3, 2 ); }
		ctx.strokeStyle = v; ctx.lineWidth = 4;
		ctx.beginPath(); ctx.moveTo( 0, H / 2 ); ctx.lineTo( W, H / 2 ); ctx.stroke();
		ctx.lineWidth = 2;
		for ( let i = 1; i < 9; i ++ ) {
			const x = i / 9 * W;
			ctx.beginPath(); ctx.moveTo( x, H / 2 ); ctx.quadraticCurveTo( x + W * 0.06, H * 0.3, x + W * 0.1, H * 0.05 ); ctx.stroke();
			ctx.beginPath(); ctx.moveTo( x, H / 2 ); ctx.quadraticCurveTo( x + W * 0.06, H * 0.7, x + W * 0.1, H * 0.95 ); ctx.stroke();
		}
	} );
}
const leafMat = ( color, vein, key ) => M( 0xffffff, { map: leafTex( color, vein, key ), rough: 0.55, side: THREE.DoubleSide } );

// a used bandage's cloth: off-white weave, rust-brown stains
function stainTex() {
	return canvasTex( 'pharm:stain', 256, 128, ( ctx, W, H ) => {
		ctx.fillStyle = '#e2d8c4'; ctx.fillRect( 0, 0, W, H );
		ctx.strokeStyle = 'rgba(120,100,80,0.18)'; ctx.lineWidth = 1;
		for ( let x = 0; x < W; x += 4 ) { ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x, H ); ctx.stroke(); }
		for ( let y = 0; y < H; y += 4 ) { ctx.beginPath(); ctx.moveTo( 0, y ); ctx.lineTo( W, y ); ctx.stroke(); }
		const r = rng( 77 );
		for ( let i = 0; i < 9; i ++ ) {
			const x = r() * W, y = r() * H, s = 12 + r() * 30;
			const gr = ctx.createRadialGradient( x, y, 0, x, y, s );
			gr.addColorStop( 0, 'rgba(110,30,20,0.85)' ); gr.addColorStop( 0.6, 'rgba(140,60,35,0.55)' ); gr.addColorStop( 1, 'rgba(150,90,50,0)' );
			ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse( x, y, s * 1.4, s, r() * PI, 0, PI * 2 ); ctx.fill();
		}
		for ( let i = 0; i < 400; i ++ ) { ctx.fillStyle = 'rgba(90,70,40,0.08)'; ctx.fillRect( r() * W, r() * H, 2, 2 ); }
	}, { repeat: true } );
}

// noni skin: pale yellow-green with the brown "eyes" of its seed pockets
function noniTex() {
	return canvasTex( 'pharm:noni', 256, 128, ( ctx, W, H ) => {
		const gr = ctx.createLinearGradient( 0, 0, 0, H );
		gr.addColorStop( 0, '#e8e4b0' ); gr.addColorStop( 0.5, '#d8dc9a' ); gr.addColorStop( 1, '#c8cc80' );
		ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, H );
		const r = rng( 31 );
		for ( let j = 0; j < 7; j ++ ) for ( let i = 0; i < 14; i ++ ) {
			const x = ( i + ( j % 2 ) * 0.5 ) / 14 * W + ( r() - 0.5 ) * 4, y = ( j + 0.5 ) / 7 * H + ( r() - 0.5 ) * 4;
			ctx.strokeStyle = 'rgba(150,140,80,0.6)'; ctx.lineWidth = 1.5;
			ctx.beginPath(); for ( let k = 0; k < 6; k ++ ) { const a = k / 6 * PI * 2; ctx.lineTo( x + Math.cos( a ) * 8.5, y + Math.sin( a ) * 8.5 ); } ctx.closePath(); ctx.stroke();
			ctx.fillStyle = r() < 0.3 ? '#4a3a1a' : '#7a6a2a'; ctx.beginPath(); ctx.arc( x, y, 1.8 + r() * 1.2, 0, PI * 2 ); ctx.fill();
		}
	} );
}

// the AED's lid: a red heart with a white bolt, and the letters
function aedTex() {
	return canvasTex( 'pharm:aed', 256, 256, ( ctx, W, H ) => {
		ctx.fillStyle = '#f2f2ee'; ctx.fillRect( 0, 0, W, H );
		ctx.fillStyle = '#2a8a3a'; ctx.fillRect( 0, H * 0.78, W, H * 0.22 );
		ctx.save(); ctx.translate( W * 0.5, H * 0.38 );
		ctx.fillStyle = '#d0202a';
		ctx.beginPath(); ctx.moveTo( 0, 60 ); ctx.bezierCurveTo( - 95, 0, - 70, - 75, 0, - 35 ); ctx.bezierCurveTo( 70, - 75, 95, 0, 0, 60 ); ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.beginPath(); ctx.moveTo( 8, - 40 ); ctx.lineTo( - 22, 6 ); ctx.lineTo( - 2, 6 ); ctx.lineTo( - 12, 45 ); ctx.lineTo( 22, - 4 ); ctx.lineTo( 2, - 4 ); ctx.closePath(); ctx.fill();
		ctx.restore();
		ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText( 'AED', W * 0.5, H * 0.89 );
	} );
}

// a pressure gauge's face
function gaugeTex() {
	return canvasTex( 'pharm:gauge', 128, 128, ( ctx, W, H ) => {
		ctx.fillStyle = '#f4f4f0'; ctx.fillRect( 0, 0, W, H );
		ctx.translate( W / 2, H / 2 );
		ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
		for ( let i = 0; i <= 30; i ++ ) { const a = - PI * 0.75 + i / 30 * PI * 1.5, r0 = i % 5 ? 48 : 42; ctx.beginPath(); ctx.moveTo( Math.sin( a ) * r0, - Math.cos( a ) * r0 ); ctx.lineTo( Math.sin( a ) * 56, - Math.cos( a ) * 56 ); ctx.stroke(); }
		ctx.strokeStyle = '#c0202a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo( 0, 0 ); ctx.lineTo( Math.sin( 0.6 ) * 46, - Math.cos( 0.6 ) * 46 ); ctx.stroke();
		ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc( 0, 0, 5, 0, PI * 2 ); ctx.fill();
	} );
}

// a thermometer's little LCD
function lcdTex() {
	return canvasTex( 'pharm:lcd', 128, 64, ( ctx, W, H ) => {
		ctx.fillStyle = '#9aa88a'; ctx.fillRect( 0, 0, W, H );
		ctx.fillStyle = '#1a2018'; ctx.font = 'bold 40px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText( '37.0', W * 0.48, H * 0.55 );
	} );
}

// a ribbon of cloth lying on the ground along a wavy line: length L, width W
function ribbon( L, W, amp = 0.006, seed = 1 ) {
	const geo = new THREE.PlaneGeometry( L, W, 24, 2 ).rotateX( - PI / 2 );
	const p = geo.attributes.position, r = rng( seed );
	const ph = r() * 6;
	for ( let i = 0; i < p.count; i ++ ) {
		const x = p.getX( i ), z = p.getZ( i );
		p.setY( i, amp + Math.sin( x / L * 9 + ph ) * amp + Math.cos( z / W * 3 + x * 30 ) * amp * 0.4 );
		p.setZ( i, z + Math.sin( x / L * 5 + ph ) * W * 0.6 );
	}
	geo.computeVertexNormals();
	return geo;
}

export function register( reg ) {
	// ================= dispensers =================

	// a pump bottle (hand sanitizer): a flattened clear body, the gel, a pump head with its nozzle
	reg( 'pharm_pump', ( s ) => {
		const g = group(), r = 0.034, h = 0.13, sq = 0.62;
		const body = G.cyl( r, r * 0.96, h, 22 ); body.scale( 1, 1, sq );
		add( g, body, MAT.glass( s.body ?? 0xe8f2f6, 0.3 ) );
		const liq = G.cyl( r * 0.9, r * 0.87, h * 0.82, 18 ); liq.scale( 1, 1, sq );
		add( g, liq, M( s.liquid ?? 0x9ad0e8, { rough: 0.1, transparent: true, opacity: 0.55 } ), [ 0, 0.003, 0 ] );
		const lab = G.cyl( r * 1.012, r * 1.012, h * 0.48, 26, true ); lab.scale( 1, 1, sq );
		add( g, lab, labelMat( s.label || { text: '' } ), [ 0, h * 0.2, 0 ] );
		const head = M( s.head ?? 0x2a8ad6, { rough: 0.4 } );
		add( g, G.cyl( 0.014, 0.016, 0.014, 16 ), head, [ 0, h, 0 ] );
		add( g, G.cyl( 0.0045, 0.0045, 0.022, 10 ), MAT.white(), [ 0, h + 0.014, 0 ] );
		add( g, G.rbox( 0.05, 0.014, 0.018, 0.005 ), head, [ 0.012, h + 0.034, 0 ] );
		add( g, G.cylX( 0.003, 0.012, 8 ), head, [ 0.042, h + 0.042, 0 ] );
		return g;
	} );

	// a trigger sprayer (vinegar): a clear shouldered bottle, the dip tube, the trigger head
	reg( 'pharm_trigger', ( s ) => {
		const g = group(), R = 0.038, H = 0.17, sq = 0.7;
		const prof = [ [ 0, 0 ], [ R * 0.95, 0 ], [ R, 0.006 ], [ R, H * 0.72 ], [ R * 0.55, H * 0.88 ], [ R * 0.38, H * 0.92 ], [ R * 0.38, H ], [ 0, H ] ];
		const body = G.lathe( prof, 20 ); body.scale( 1, 1, sq );
		add( g, body, MAT.glass( s.body ?? 0xf2f2ee, 0.32 ) );
		const liq = G.lathe( [ [ 0, 0.003 ], [ R * 0.9, 0.003 ], [ R * 0.9, H * 0.6 ], [ 0, H * 0.6 ] ], 16 ); liq.scale( 1, 1, sq );
		add( g, liq, M( s.liquid ?? 0xf0e4b8, { rough: 0.1, transparent: true, opacity: 0.5 } ) );
		add( g, G.cyl( 0.002, 0.002, H * 0.95, 6 ), MAT.white(), [ R * 0.3, 0.004, 0 ] );
		const lab = G.cyl( R * 1.012, R * 1.012, H * 0.42, 26, true ); lab.scale( 1, 1, sq );
		add( g, lab, labelMat( s.label || { text: '' } ), [ 0, H * 0.14, 0 ] );
		const head = M( s.head ?? 0xc0282a, { rough: 0.45 } );
		add( g, G.cyl( R * 0.46, R * 0.46, 0.016, 16 ), head, [ 0, H - 0.004, 0 ] );
		add( g, G.rbox( 0.07, 0.034, 0.03, 0.008 ), head, [ 0.014, H + 0.01, 0 ] );
		add( g, G.box( 0.02, 0.012, 0.016 ), MAT.blackPlastic(), [ 0.052, H + 0.02, 0 ] );
		const trig = G.rbox( 0.012, 0.05, 0.018, 0.004 ); trig.translate( 0, - 0.05, 0 );
		add( g, trig, head, [ 0.04, H + 0.012, 0 ], [ 0, 0, 0.35 ] );
		return g;
	} );

	// a small eye-drop bottle: a soft white body, the label, a pointed nozzle under a tall cap
	reg( 'pharm_dropper', ( s ) => {
		const g = group(), r = 0.013, h = 0.05;
		add( g, G.lathe( [ [ 0, 0 ], [ r * 0.95, 0 ], [ r, 0.003 ], [ r, h ], [ r * 0.6, h + 0.007 ], [ 0, h + 0.008 ] ], 16 ), M( s.color ?? 0xf2f2f2, { rough: 0.35 } ) );
		add( g, G.cyl( r * 1.01, r * 1.01, h * 0.62, 18, true ), labelMat( s.label || { text: '' } ), [ 0, h * 0.18, 0 ] );
		add( g, G.lathe( [ [ 0, 0 ], [ r * 0.66, 0 ], [ r * 0.6, 0.014 ], [ r * 0.25, 0.026 ], [ 0, 0.027 ] ], 14 ), M( s.cap ?? 0x2a8ad6, { rough: 0.4 } ), [ 0, h + 0.004, 0 ] );
		return g;
	} );

	// a metered-dose inhaler: the L-shaped holder, the canister in the top, the mouthpiece cap
	reg( 'pharm_inhaler', ( s ) => {
		const g = group(), c = M( s.color ?? 0x2a6ad6, { rough: 0.4 } );
		add( g, G.rbox( 0.034, 0.072, 0.026, 0.008 ), c );
		add( g, G.rbox( 0.03, 0.022, 0.026, 0.006 ), c, [ 0.026, 0, 0 ] );
		add( g, G.rbox( 0.012, 0.02, 0.024, 0.004 ), M( s.cap ?? 0x8a9aa8, { rough: 0.45 } ), [ 0.045, 0.001, 0 ] );
		add( g, G.cyl( 0.0105, 0.0105, 0.022, 16 ), M( 0xc8ccd0, { rough: 0.25, metal: 0.9 } ), [ - 0.002, 0.07, 0 ] );
		add( g, G.box( 0.002, 0.03, 0.016 ), M( 0xf2f2f2, { rough: 0.5 } ), [ - 0.0172, 0.03, 0 ] );
		return g;
	} );

	// ================= dressings and swabs =================

	// a used bandage: a loose roll and a stained tail lying crumpled
	reg( 'pharm_usedbandage', () => {
		const g = group(), m = M( 0xffffff, { map: stainTex(), rough: 0.95, side: THREE.DoubleSide } );
		add( g, G.cylZ( 0.018, 0.06, 16 ), m, [ - 0.07, 0.018, 0 ] );
		add( g, ribbon( 0.2, 0.058, 0.004, 3 ), m, [ 0.03, 0, 0.005 ] );
		return g;
	} );

	// cotton balls in a clear bag with a printed strip (tinder: greasy ones in a zip bag)
	reg( 'pharm_cotton', ( s ) => {
		const g = group(), r = rng( s.tinder ? 5 : 9 );
		const [ w, h, d ] = s.tinder ? [ 0.09, 0.035, 0.07 ] : [ 0.12, 0.05, 0.09 ];
		add( g, G.rbox( w, h, d, h * 0.45, 3 ), MAT.glass( 0xf4f6f8, 0.25 ) );
		const ball = M( s.tinder ? 0xe2d48a : 0xfbfbf8, { rough: 1 } );
		const n = s.tinder ? 7 : 12;
		for ( let i = 0; i < n; i ++ ) {
			const x = ( r() - 0.5 ) * ( w - 0.026 ), z = ( r() - 0.5 ) * ( d - 0.026 ), sr = 0.011 + r() * 0.004;
			add( g, G.sph( sr, 10, 8 ), ball, [ x, sr * 0.9 + ( i % 3 ) * 0.006, z ], null, [ 1, 0.85, 1 ] );
		}
		if ( s.tinder ) add( g, G.box( w * 0.98, 0.004, 0.006 ), M( 0xd0282a, { rough: 0.4 } ), [ 0, h * 0.5, d / 2 - 0.004 ] );
		else add( g, G.box( w * 0.8, 0.002, d * 0.35 ), M( 0xffffff, { map: labelTex( { text: 'COTTON BALLS', sub: '100% cotton · 100 ct', bg: 0xffffff, fg: 0x2a5ab8, band: 0x2a5ab8, style: 'plain', size: 0.24 } ), rough: 0.6 } ), [ 0, h, 0 ] );
		return g;
	} );

	// trauma shears: angled blunt-tipped blades and bright plastic loops
	reg( 'pharm_shears', ( s ) => {
		const g = group(), steel = M( 0x9aa0a6, { rough: 0.3, metal: 0.9 } ), pl = M( s.color ?? 0x2a7ad6, { rough: 0.45 } );
		const blade = G.rbox( 0.085, 0.003, 0.013, 0.0012, 1 );
		add( g, blade, steel, [ 0.045, 0.004, 0.004 ], [ 0, 0.06, 0 ] );
		add( g, blade, steel, [ 0.045, 0.007, - 0.004 ], [ 0, - 0.06, 0 ] );
		add( g, G.sph( 0.0045, 8, 6 ), steel, [ 0.088, 0.006, 0.0 ] );
		add( g, G.cyl( 0.005, 0.005, 0.012, 10 ), steel, [ 0, 0.002, 0 ] );
		for ( const sgn of [ 1, - 1 ] ) {
			add( g, G.rbox( 0.05, 0.008, 0.012, 0.003, 1 ), pl, [ - 0.03, 0.002, sgn * 0.012 ], [ 0, sgn * 0.28, 0 ] );
			const loop = G.torus( 0.017, 0.0045, 6, 16 ).rotateX( PI / 2 ); loop.scale( 1.3, 1, 1 );
			add( g, loop, pl, [ - 0.075, 0.006, sgn * 0.026 ] );
		}
		return g;
	} );

	// a triangular arm sling folded flat, its strap looped over it
	reg( 'pharm_sling', ( s ) => {
		const g = group(), c = s.color ?? 0x2a4a8a;
		const sh = new THREE.Shape(); sh.moveTo( - 0.09, - 0.06 ); sh.lineTo( 0.09, - 0.06 ); sh.lineTo( - 0.03, 0.065 ); sh.closePath();
		const geo = new THREE.ExtrudeGeometry( sh, { depth: 0.018, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.005, bevelSegments: 2 } ).rotateX( - PI / 2 );
		add( g, geo, M( c, { rough: 0.95 } ), [ 0, 0.005, 0 ] );
		const strap = M( 0x1a1a1a, { rough: 0.8 } );
		add( g, G.tube( [ [ - 0.1, 0.006, 0.04 ], [ - 0.02, 0.03, 0.02 ], [ 0.07, 0.03, - 0.01 ], [ 0.13, 0.006, - 0.03 ] ], 0.0035, 16, 4 ), strap );
		add( g, G.box( 0.018, 0.006, 0.026 ), M( 0x3a3a3a, { rough: 0.4, metal: 0.4 } ), [ 0.03, 0.028, 0.008 ] );
		return g;
	} );

	// ================= the crutch =================

	// an aluminium underarm crutch lying on its side (two rails to one adjustable leg, a grip, a pad, a rubber
	// foot), or a forked stick with a rag-padded crosspiece
	reg( 'pharm_crutch', ( s ) => {
		const g = group();
		if ( s.improvised ) {
			const wood = M( 0x7a5a36, { rough: 0.85 } ), rag = M( 0xd8cfc0, { rough: 0.95 } ), f = group();
			add( f, G.tube( [ [ - 0.62, 0.016, 0 ], [ - 0.2, 0.016, 0.004 ], [ 0.2, 0.016, - 0.003 ], [ 0.46, 0.016, 0 ] ], 0.016, 16, 8 ), wood );
			add( f, G.tube( [ [ 0.42, 0.014, 0 ], [ 0.52, 0.014, 0.05 ], [ 0.56, 0.014, 0.07 ] ], 0.011, 8, 6 ), wood );
			add( f, G.cylZ( 0.016, 0.3, 8 ), wood, [ 0.57, 0.028, 0 ] );
			add( f, G.cylZ( 0.032, 0.22, 12 ), rag, [ 0.57, 0.028, 0 ] );
			for ( const z of [ - 0.08, - 0.025, 0.03, 0.085 ] ) add( f, G.torus( 0.033, 0.004, 4, 12 ), M( 0xb8ae9a, { rough: 0.95 } ), [ 0.57, 0.028, z ] );
			add( f, G.cylX( 0.021, 0.1, 10 ), rag, [ 0.12, 0.021, 0 ] );
			// propped on its padded crosspiece, so the T shows from the side too
			f.rotation.x = 0.5;
			g.add( f );
			return ground( g );
		}
		const alu = M( 0xb8bec6, { rough: 0.3, metal: 0.85 } ), foam = M( 0x4a4e54, { rough: 0.9 } ), rub = MAT.rubber();
		const y = 0.026, f = group();
		for ( const sgn of [ 1, - 1 ] ) add( f, G.tube( [ [ 0.56, y, sgn * 0.045 ], [ 0.3, y, sgn * 0.042 ], [ 0.02, y, sgn * 0.03 ], [ - 0.14, y, sgn * 0.008 ] ], 0.0095, 16, 8 ), alu );
		add( f, G.cylX( 0.012, 0.48, 12 ), alu, [ - 0.38, y, 0 ] );
		for ( let i = 0; i < 6; i ++ ) add( f, G.cyl( 0.003, 0.003, 0.001, 8 ), MAT.darkMetal(), [ - 0.22 - i * 0.035, y + 0.0115, 0 ] );
		add( f, G.cylX( 0.016, 0.05, 12 ), rub, [ - 0.63, y, 0 ] );
		add( f, G.rbox( 0.05, 0.05, 0.13, 0.018, 3 ), foam, [ 0.585, 0.001, 0 ] );
		add( f, G.cylZ( 0.013, 0.08, 12 ), foam, [ 0.14, y, 0 ] );
		add( f, G.cylZ( 0.004, 0.1, 6 ), alu, [ 0.14, y, 0 ] );
		// it rests tipped on the edge of its pad and grip, the frame at an angle (flat, the side-on icon was one line)
		f.rotation.x = 0.6;
		g.add( f );
		return ground( g );
	} );

	// ================= instruments =================

	// a digital stick thermometer: white body, LCD, button, steel tip
	reg( 'pharm_thermometer', () => {
		const g = group();
		const body = G.capsX( 0.008, 0.12, 12, 4 ); body.scale( 1, 0.7, 1 );
		add( g, body, M( 0xf4f4f0, { rough: 0.35 } ), [ 0, 0.0056, 0 ] );
		add( g, G.cylX( 0.0042, 0.03, 10, 0.0025 ), M( 0xc8ccd0, { rough: 0.25, metal: 0.9 } ), [ 0.07, 0.0056, 0 ] );
		add( g, G.box( 0.03, 0.002, 0.009 ), M( 0xffffff, { map: lcdTex(), rough: 0.3 } ), [ - 0.025, 0.0105, 0 ] );
		add( g, G.cyl( 0.003, 0.003, 0.002, 10 ), M( 0x2a8ad6, { rough: 0.4 } ), [ - 0.048, 0.0105, 0 ] );
		return g;
	} );

	// a blood pressure cuff: the folded cuff, the gauge on it, the bulb and the tubes
	reg( 'pharm_bpcuff', ( s ) => {
		const g = group(), cuff = M( s.color ?? 0x1a2a4a, { rough: 0.9 } ), black = MAT.rubber();
		add( g, G.rbox( 0.2, 0.026, 0.13, 0.008, 2 ), cuff );
		add( g, G.box( 0.06, 0.002, 0.12 ), M( 0x8a8a8a, { rough: 0.95 } ), [ 0.065, 0.026, 0 ] );
		add( g, G.cyl( 0.034, 0.034, 0.014, 22 ), M( 0x2a2a2a, { rough: 0.35, metal: 0.5 } ), [ - 0.03, 0.026, 0.0 ] );
		add( g, G.cyl( 0.03, 0.03, 0.002, 22 ), M( 0xffffff, { map: gaugeTex(), rough: 0.3 } ), [ - 0.03, 0.04, 0 ] );
		add( g, G.cyl( 0.03, 0.03, 0.004, 22 ), MAT.glass( 0xffffff, 0.2 ), [ - 0.03, 0.041, 0 ] );
		const bulb = G.sph( 0.022, 14, 10 ); bulb.scale( 1.45, 1, 1 );
		add( g, bulb, black, [ 0.06, 0.022, 0.1 ] );
		add( g, G.cylX( 0.006, 0.03, 8 ), M( 0xc8ccd0, { rough: 0.3, metal: 0.9 } ), [ 0.1, 0.022, 0.1 ] );
		add( g, G.tube( [ [ 0.03, 0.022, 0.1 ], [ - 0.02, 0.01, 0.1 ], [ - 0.07, 0.006, 0.08 ], [ - 0.1, 0.015, 0.04 ] ], 0.0035, 16, 5 ), black );
		return g;
	} );

	// a stethoscope lying flat: the chest piece, the tube to a Y, the steel ear tubes and the tips
	reg( 'pharm_stethoscope', ( s ) => {
		const g = group(), tube = M( s.color ?? 0x1a3a6a, { rough: 0.5 } ), steel = M( 0xc8ccd0, { rough: 0.2, metal: 0.95 } );
		const r = 0.0055, y = r;
		add( g, G.cyl( 0.026, 0.026, 0.013, 22 ), steel, [ 0.15, 0, 0.0 ] );
		add( g, G.cyl( 0.024, 0.024, 0.002, 20 ), M( 0x2a2a2a, { rough: 0.6 } ), [ 0.15, 0.013, 0 ] );
		add( g, G.cylX( 0.004, 0.022, 8 ), steel, [ 0.123, 0.006, 0 ] );
		add( g, G.tube( [ [ 0.112, y, 0 ], [ 0.07, y, 0.04 ], [ 0.02, y, 0.05 ], [ - 0.02, y, 0.02 ], [ - 0.03, y, 0 ] ], r, 20, 6 ), tube );
		for ( const sgn of [ 1, - 1 ] ) {
			add( g, G.tube( [ [ - 0.03, y, 0 ], [ - 0.06, y, sgn * 0.02 ], [ - 0.085, y, sgn * 0.03 ] ], r, 10, 6 ), tube );
			add( g, G.tube( [ [ - 0.085, 0.003, sgn * 0.03 ], [ - 0.13, 0.003, sgn * 0.045 ], [ - 0.16, 0.003, sgn * 0.03 ], [ - 0.17, 0.003, sgn * 0.012 ] ], 0.0022, 12, 5 ), steel );
			add( g, G.sph( 0.006, 10, 8 ), MAT.rubber(), [ - 0.172, 0.005, sgn * 0.01 ] );
		}
		add( g, G.sph( 0.006, 10, 8 ), tube, [ - 0.03, y, 0 ] );
		return g;
	} );

	// an AED: the case, the printed lid, the carry handle, the pads' pocket
	reg( 'pharm_aed', ( s ) => {
		const g = group(), w = 0.28, h = 0.09, d = 0.22;
		add( g, G.rbox( w, h * 0.55, d, 0.014, 2 ), M( s.color ?? 0x2a2a2a, { rough: 0.5 } ) );
		add( g, G.rbox( w, h * 0.5, d, 0.014, 2 ), M( 0xf2c21a, { rough: 0.45 } ), [ 0, h * 0.5, 0 ] );
		add( g, G.box( w * 0.62, 0.002, d * 0.72 ), M( 0xffffff, { map: aedTex(), rough: 0.4 } ), [ - w * 0.08, h, 0 ] );
		add( g, G.torus( 0.035, 0.008, 6, 14, PI ), MAT.blackPlastic(), [ w * 0.36, h, 0 ], [ 0, PI / 2, 0 ] );
		add( g, G.rbox( 0.012, h * 0.4, d * 0.6, 0.004 ), M( 0x1a1a1a, { rough: 0.6 } ), [ w / 2, h * 0.1, 0 ] );
		return g;
	} );

	// ================= herbs and the mortar =================

	// a mortar (a turned granite bowl, or a hand-pecked basalt one) with its pestle resting in it
	reg( 'pharm_mortar', ( s ) => {
		const g = group();
		const stone = s.stone ? M( 0x4a4846, { rough: 0.95 } ) : M( 0x8a8884, { rough: 0.7 } );
		const pts = [ [ 0, 0 ], [ 0.05, 0 ], [ 0.058, 0.012 ], [ 0.064, 0.048 ], [ 0.06, 0.064 ], [ 0.048, 0.064 ], [ 0.044, 0.04 ], [ 0.03, 0.024 ], [ 0, 0.02 ] ];
		let bowl = G.lathe( s.stone ? pts.map( ( [ a, b ], i ) => [ a * ( i % 2 ? 1.04 : 0.97 ), b ] ) : pts, s.stone ? 9 : 26 );
		if ( s.stone ) { bowl.scale( 1.1, 0.9, 1 ); bowl = facet( bowl ); }
		add( g, bowl, stone );
		add( g, G.cyl( 0.038, 0.03, 0.004, 16 ), M( s.stone ? 0x6a5a30 : 0xc89a3a, { rough: 0.9 } ), [ 0, 0.024, 0 ] );
		const pestle = s.stone ? facet( new THREE.CapsuleGeometry( 0.016, 0.1, 3, 7 ) ) : new THREE.CapsuleGeometry( 0.014, 0.1, 6, 14 );
		add( g, pestle, stone, [ 0.03, 0.07, 0 ], [ 0, 0, - 0.75 ] );
		return g;
	} );

	// roots: ʻōlena (knobby orange-brown fingers, a bright cut end), ʻawa (a grey-brown stump with rootlets),
	// ʻuhaloa (thin woody roots tied with a sprig)
	reg( 'pharm_root', ( s ) => {
		const g = group(), r = rng( s.kind === 'awa' ? 3 : s.kind === 'uhaloa' ? 5 : 7 );
		if ( s.kind === 'awa' ) {
			// a knobby stump, its cut face pale and woody, thick rootlets
			const skin = M( 0x6a5a40, { rough: 0.95 } );
			let core = new THREE.IcosahedronGeometry( 0.045, 1 );
			const p = core.attributes.position;
			for ( let i = 0; i < p.count; i ++ ) { const k = 0.82 + r() * 0.3; p.setXYZ( i, p.getX( i ) * k * 1.35, p.getY( i ) * k * 0.7, p.getZ( i ) * k ); }
			core = facet( core );
			add( g, core, skin, [ 0, 0.032, 0 ] );
			const face = M( 0xffffff, { map: canvasTex( 'pharm:awacut', 128, 128, ( ctx, W, H ) => {
				ctx.fillStyle = '#d8c890'; ctx.fillRect( 0, 0, W, H );
				ctx.strokeStyle = 'rgba(120,100,50,0.6)'; ctx.lineWidth = 2;
				for ( let i = 0; i < 16; i ++ ) { const a = i / 16 * PI * 2; ctx.beginPath(); ctx.moveTo( W / 2, H / 2 ); ctx.lineTo( W / 2 + Math.cos( a ) * W * 0.48, H / 2 + Math.sin( a ) * H * 0.48 ); ctx.stroke(); }
				for ( const rr of [ 0.18, 0.32, 0.45 ] ) { ctx.beginPath(); ctx.arc( W / 2, H / 2, rr * W, 0, PI * 2 ); ctx.stroke(); }
			} ), rough: 0.85 } );
			add( g, G.cyl( 0.03, 0.03, 0.003, 14 ), face, [ - 0.056, 0.034, 0 ], [ 0, 0, PI / 2 ], [ 0.75, 1, 1 ] );
			const fine = M( 0x7a6a4a, { rough: 0.95 } );
			for ( let i = 0; i < 7; i ++ ) {
				const a = - 0.9 + i / 6 * 1.8 + ( r() - 0.5 ) * 0.3, L = 0.05 + r() * 0.05, z0 = ( r() - 0.5 ) * 0.04;
				const sx = Math.cos( a ), sz = Math.sin( a );
				add( g, G.tube( [ [ 0.03 * sx + 0.02, 0.022, z0 + sz * 0.02 ], [ ( 0.05 + L * 0.5 ) * sx + 0.02, 0.012, z0 + sz * ( 0.03 + L * 0.5 ) ], [ ( 0.05 + L ) * sx + 0.02, 0.005, z0 + sz * ( 0.035 + L ) ] ], 0.005 - i * 0.0003, 8, 5 ), fine );
			}
			return ground( g );
		}
		if ( s.kind === 'uhaloa' ) {
			const wood = M( 0xa88a5a, { rough: 0.9 } );
			for ( let i = 0; i < 4; i ++ ) {
				const z = ( i - 1.5 ) * 0.008;
				add( g, G.tube( [ [ - 0.07, 0.005, z ], [ 0, 0.005 + r() * 0.003, z + ( r() - 0.5 ) * 0.01 ], [ 0.06, 0.004, z + ( r() - 0.5 ) * 0.02 ], [ 0.09, 0.003, z * 1.6 ] ], 0.0035 - i * 0.0003, 10, 5 ), wood );
			}
			add( g, G.torus( 0.016, 0.0025, 4, 12 ).rotateY( PI / 2 ), M( 0xc8b07a, { rough: 0.9 } ), [ - 0.04, 0.008, 0 ] );
			const leaf = leafMat( 0x7a8a6a, 0x9aaa8a, 'uh' );
			for ( let i = 0; i < 5; i ++ ) add( g, leafGeo( 0.022, 0.014, ( x ) => x * 0.15 ), leaf, [ - 0.075, 0.008 + i * 0.002, ( i - 2 ) * 0.008 ], [ 0, PI - 0.4 + i * 0.2, 0 ] );
			return ground( g );
		}
		// ʻōlena
		const skin = M( 0xa86a32, { rough: 0.85 } ), cut = M( 0xf09018, { rough: 0.6 } );
		const knob = G.sph( 0.016, 12, 9 ); knob.scale( 1.4, 0.8, 1 );
		add( g, knob, skin, [ 0, 0.013, 0 ] );
		const fingers = [ [ 0.035, 0.02, 0.4 ], [ 0.03, - 0.018, - 0.5 ], [ - 0.032, 0.012, 2.7 ], [ 0.02, 0.026, 1.2 ] ];
		for ( const [ x, z, a ] of fingers ) {
			const f = G.capsX( 0.008, 0.045, 10, 3 );
			add( g, f, skin, [ x * 0.6, 0.01, z * 0.6 ], [ 0, a, 0 ] );
			// growth rings
			for ( let k = 0; k < 2; k ++ ) add( g, G.torus( 0.0085, 0.0012, 4, 10 ).rotateY( PI / 2 ), M( 0x7a4a22, { rough: 0.9 } ), [ x * 0.6 + Math.cos( a ) * ( 0.008 + k * 0.01 ), 0.01, z * 0.6 - Math.sin( a ) * ( 0.008 + k * 0.01 ) ], [ 0, a, 0 ] );
		}
		add( g, G.cyl( 0.0078, 0.0078, 0.002, 10 ), cut, [ 0.035 * 0.6 + Math.cos( 0.4 ) * 0.022, 0.01, 0.02 * 0.6 - Math.sin( 0.4 ) * 0.022 ], [ 0, 0.4, PI / 2 ] );
		return ground( g );
	} );

	// noni: a lumpy pale fruit covered in seed "eyes", a short stem
	reg( 'pharm_noni', () => {
		const g = group(), r = rng( 11 );
		const geo = G.sph( 0.032, 20, 14 );
		const p = geo.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) {
			const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
			const bump = 1 + 0.05 * Math.sin( x * 260 ) * Math.sin( y * 230 ) * Math.sin( z * 250 ) + ( r() - 0.5 ) * 0.02;
			p.setXYZ( i, x * 1.35 * bump, y * bump, z * bump );
		}
		geo.computeVertexNormals();
		add( g, geo, M( 0xffffff, { map: noniTex(), rough: 0.55 } ), [ 0, 0.032, 0 ] );
		add( g, G.cylX( 0.004, 0.014, 6 ), M( 0x5a6a2a, { rough: 0.8 } ), [ 0.048, 0.034, 0 ] );
		return g;
	} );

	// kukui nuts: a small pile of round, wrinkled dark shells
	reg( 'pharm_nuts', () => {
		const g = group(), r = rng( 21 ), shell = M( 0x3a2a1e, { rough: 0.75 } );
		const spots = [ [ 0, 0, 0 ], [ 0.028, 0, 0.006 ], [ - 0.026, 0, 0.01 ], [ 0.004, 0, 0.027 ], [ 0.006, 0, - 0.026 ], [ 0.004, 0.022, 0.004 ] ];
		for ( const [ x, y, z ] of spots ) {
			const geo = G.sph( 0.014, 12, 9 );
			const p = geo.attributes.position;
			for ( let i = 0; i < p.count; i ++ ) { const k = 1 + 0.06 * Math.sin( p.getX( i ) * 900 + p.getZ( i ) * 700 ) * Math.cos( p.getY( i ) * 800 ); p.setXYZ( i, p.getX( i ) * k, p.getY( i ) * k * 0.88, p.getZ( i ) * k ); }
			geo.computeVertexNormals();
			add( g, geo, shell, [ x, 0.012 + y, z ], [ r() * PI, r() * PI, 0 ] );
		}
		return ground( g );
	} );

	// pōpolo: a sprig with a few leaves and small clusters of glossy black berries (a green one or two)
	reg( 'pharm_berries', () => {
		const g = group(), r = rng( 41 );
		const stem = M( 0x4a6a2a, { rough: 0.7 } ), black = M( 0x15121a, { rough: 0.22 } ), green = M( 0x6a8a3a, { rough: 0.4 } );
		add( g, G.tube( [ [ - 0.07, 0.004, 0 ], [ - 0.02, 0.006, 0.006 ], [ 0.03, 0.006, - 0.004 ], [ 0.07, 0.005, 0.004 ] ], 0.0018, 12, 4 ), stem );
		const leaf = leafMat( 0x3a6a2a, 0x5a8a3a, 'pp' );
		for ( const [ x, a ] of [ [ - 0.045, 1.0 ], [ 0.0, - 1.1 ], [ 0.04, 0.9 ] ] ) add( g, leafGeo( 0.05, 0.026, ( xx ) => 0.004 + xx * 0.08 ), leaf, [ x, 0.002, 0 ], [ 0, a, 0 ] );
		for ( const [ cx, cz ] of [ [ - 0.02, - 0.018 ], [ 0.02, 0.016 ], [ 0.06, - 0.012 ] ] ) {
			for ( let i = 0; i < 6; i ++ ) {
				const a = i / 6 * PI * 2 + r(), rr = 0.006 + r() * 0.003;
				add( g, G.sph( 0.0045, 8, 6 ), r() < 0.12 ? green : black, [ cx + Math.cos( a ) * rr, 0.0045 + ( i % 2 ) * 0.003, cz + Math.sin( a ) * rr ] );
			}
		}
		return g;
	} );

	// leaves: a tied bunch of māmaki (serrated, pale veins), or one thick aloe leaf with teeth and a cut base
	reg( 'pharm_leaves', ( s ) => {
		const g = group();
		if ( s.kind === 'aloe' ) {
			// two thick leaves cut from the plant, fanned from their cut bases (one alone is a sliver seen side on)
			const skin = M( 0xffffff, { map: canvasTex( 'pharm:aloe', 128, 64, ( ctx, W, H ) => {
				ctx.fillStyle = '#3e5e30'; ctx.fillRect( 0, 0, W, H );
				const rr = rng( 51 );
				for ( let i = 0; i < 45; i ++ ) { ctx.fillStyle = 'rgba(200,220,170,0.4)'; ctx.beginPath(); ctx.ellipse( rr() * W, rr() * H, 2.5, 1.2, 0, 0, PI * 2 ); ctx.fill(); }
			} ), rough: 0.45 } );
			const tooth = M( 0xc8b07a, { rough: 0.6 } ), cutM = M( 0xc8dcaa, { rough: 0.3 } );
			const leaf = ( len, w, yaw, z0 ) => {
				const lg = group();
				const geo = new THREE.CylinderGeometry( 0.003, w, len, 12, 6 ).rotateZ( - PI / 2 );
				geo.scale( 1, 0.5, 1 );
				const p = geo.attributes.position;
				for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ); p.setY( i, p.getY( i ) + Math.pow( ( x + len / 2 ) / len, 2 ) * 0.02 ); }
				geo.computeVertexNormals();
				add( lg, geo, skin, [ len / 2, 0.013, 0 ] );
				for ( let i = 0; i < 9; i ++ ) {
					const x = 0.02 + i * ( len - 0.04 ) / 9, ww = w * ( 1 - x / len ) + 0.003;
					for ( const sgn of [ 1, - 1 ] ) add( lg, G.cone( 0.0026, 0.008, 5 ), tooth, [ x, 0.013, sgn * ww ], [ sgn * PI / 2, 0, 0 ] );
				}
				add( lg, G.cyl( w - 0.001, w - 0.001, 0.002, 12 ), cutM, [ 0, 0.013, 0 ], [ 0, 0, PI / 2 ], [ 0.5, 1, 1 ] );
				lg.position.set( - 0.11, 0, z0 ); lg.rotation.y = yaw;
				g.add( lg );
			};
			leaf( 0.24, 0.03, 0.22, - 0.016 );
			leaf( 0.19, 0.025, - 0.36, 0.016 );
			return ground( g );
		}
		const leaf = leafMat( 0x3e6a32, 0xa8b880, 'mk' );
		for ( let i = 0; i < 5; i ++ ) {
			const a = ( i - 2 ) * 0.3;
			add( g, leafGeo( 0.09, 0.05, ( x, z ) => 0.003 + i * 0.0025 + Math.abs( z ) * 0.15, 10, 0.06 ), leaf, [ - 0.03, 0, 0 ], [ 0, a, 0 ] );
		}
		const stem = M( 0x8a4a3a, { rough: 0.7 } );
		for ( let i = 0; i < 5; i ++ ) add( g, G.cylX( 0.0016, 0.035, 5 ), stem, [ - 0.048, 0.004, ( i - 2 ) * 0.003 ], [ 0, ( i - 2 ) * 0.1, 0 ] );
		add( g, G.torus( 0.006, 0.0022, 4, 10 ).rotateY( PI / 2 ), M( 0x5a8a3a, { rough: 0.7 } ), [ - 0.05, 0.005, 0 ] );
		return g;
	} );

	// a poultice: a paste mound in an opened ti leaf, a strip folded over and tied
	reg( 'pharm_poultice', ( s ) => {
		const g = group(), leaf = leafMat( 0x3a7a2a, 0x6aa04a, 'ti' );
		// (broad enough that the icon looks down on the paste rather than along the leaf)
		add( g, leafGeo( 0.16, 0.09, ( x, z ) => 0.002 + Math.abs( z ) * 0.25 ), leaf, [ - 0.08, 0, 0 ] );
		const mound = G.sph( 0.026, 14, 8, 0, PI * 2, 0, PI / 2 ); mound.scale( 1.4, 0.55, 1 );
		add( g, mound, M( s.paste ?? 0xe0901a, { rough: 0.85 } ), [ 0, 0.006, 0 ] );
		add( g, leafGeo( 0.11, 0.05, ( x, z ) => 0.012 + Math.sin( ( x + 0.02 ) * 18 ) * 0.008 + Math.abs( z ) * 0.12 ), leaf, [ - 0.015, 0.004, - 0.004 ], [ 0, 0.25, 0 ] );
		add( g, G.torus( 0.03, 0.0016, 4, 18 ).rotateY( PI / 2 ), M( 0xb8a070, { rough: 0.9 } ), [ 0.015, 0.012, 0 ], null, [ 1, 0.5, 1.1 ] );
		return g;
	} );

	// a ti-leaf wrap: leaves rolled into a bandage, a loose end, a fibre tie
	// (a fat roll and a short loose end at an angle: it reads as a rolled bandage, not a flat leaf, from any side)
	reg( 'pharm_wrap', () => {
		const g = group(), leaf = leafMat( 0x3a7a2a, 0x6aa04a, 'ti' );
		const roll = M( 0xffffff, { map: leafTex( 0x3a7a2a, 0x6aa04a, 'ti' ), rough: 0.55 } );
		add( g, G.cylZ( 0.027, 0.075, 16 ), roll, [ - 0.03, 0.027, 0 ] );
		add( g, G.cylZ( 0.011, 0.077, 10 ), M( 0x2a5a1a, { rough: 0.6 } ), [ - 0.03, 0.027, 0 ] );
		add( g, leafGeo( 0.1, 0.06, ( x ) => 0.002 + x * 0.02 ), leaf, [ - 0.012, 0, 0.01 ], [ 0, - 0.45, 0 ] );
		for ( const z of [ - 0.022, 0.022 ] ) add( g, G.torus( 0.0275, 0.0022, 4, 16 ), M( 0xb8a070, { rough: 0.9 } ), [ - 0.03, 0.027, z ] );
		return g;
	} );
}
