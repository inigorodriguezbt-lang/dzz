// Medical supplies, tools, vehicle parts, materials and odds and ends.
// Printed packaging (pill bottle labels, aerosol wraps, kit patches) comes from pack.js.
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, fabric, labelTex, labelUV, canvasTex, worldTex, shade, css, facet, hashStr } from './lib.js';
import { packInfo, wrapTex, panelTex, boxAtlas, boxUV, ridged, tubeTex, tubeUV, rrect, text as ptext, barcode, rng } from './pack.js';

const flatLabel = ( spec, o = {} ) => M( 0xffffff, { map: labelTex( spec ), rough: o.rough ?? 0.6, metal: o.metal ?? 0 } );
const printed = ( map, o = {} ) => M( 0xffffff, { map, rough: o.rough ?? 0.55, metal: o.metal ?? 0, side: o.side } );
const band = ( r, y0, y1, seg = 24, ts = 0, tl = PI * 2 ) => new THREE.CylinderGeometry( r, r, y1 - y0, seg, 1, true, ts, tl ).translate( 0, ( y0 + y1 ) / 2, 0 );
const lumOf = ( c ) => { const k = new THREE.Color( c ); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; };

// the spiral of a rolled bandage / tape seen end on
function rollEnd( key, c1, c2, core ) {
	return canvasTex( 'roll-end:' + key, 128, 128, ( ctx, W ) => {
		ctx.fillStyle = css( c1 ); ctx.fillRect( 0, 0, W, W );
		ctx.strokeStyle = css( c2 ); ctx.lineWidth = 1.4;
		ctx.beginPath();
		for ( let a = 0; a < PI * 2 * 14; a += 0.1 ) { const r = W * 0.22 + a / ( PI * 2 ) * W * 0.02; ctx.lineTo( W / 2 + Math.cos( a ) * r, W / 2 + Math.sin( a ) * r ); }
		ctx.stroke();
		ctx.fillStyle = css( core ); ctx.beginPath(); ctx.arc( W / 2, W / 2, W * 0.22, 0, PI * 2 ); ctx.fill();
	} );
}

// a tube's body lying along x from x0 to x1: round at the shoulder, pressed flat (width k × r) at the crimped end
function tubeBody( r, len, flatW = 1.45, n = 14, m = 18 ) {
	const pos = [], idx = [];
	for ( let i = 0; i <= n; i ++ ) {
		const t = i / n, k = Math.pow( t, 1.6 );
		const ry = r * ( 1 - k * 0.93 ), rz = r * ( 1 + k * ( flatW - 1 ) );
		for ( let j = 0; j <= m; j ++ ) { const a = j / m * PI * 2; pos.push( - len / 2 + t * len, Math.cos( a ) * ry, Math.sin( a ) * rz ); }
	}
	for ( let i = 0; i < n; i ++ ) for ( let j = 0; j < m; j ++ ) { const a = i * ( m + 1 ) + j, b = a + m + 1; idx.push( a, a + 1, b, a + 1, b + 1, b ); }
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( pos.length / 3 * 2 ), 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;
}

export function registerGearModels( reg ) {
	// ================= medical =================
	reg( 'roll', ( s, def ) => { // bandage / gauze / tape / ace bandage
		const g = group(), r = s.r ?? 0.03, w = s.w ?? 0.07, c = s.color ?? 0xf4f2ec;
		const side = s.print ? fabric( c, s.print, s.color2 ?? 0xd8d0c0, { rep: 2 } ) : s.tape ? M( 0xffffff, { map: tapeTex( c ), rough: 0.35, metal: 0.5 } ) : fabric( c, 'weave', shade( c, - 0.06 ), { rep: 4, rough: 0.95 } );
		const inner = s.inner ?? ( s.tape ? 0x8a6a4a : 0xffffff );
		add( g, G.cylZ( r, w, 28 ), side, [ 0, r, 0 ] );
		// the ends: the spiral of the layers round the core
		const endM = M( 0xffffff, { map: rollEnd( c + ':' + inner + ( s.tape ? 't' : '' ), shade( c, s.tape ? - 0.25 : - 0.04 ), shade( c, s.tape ? - 0.45 : - 0.16 ), s.tape ? 0x9a7a52 : inner ), rough: 0.9 } );
		for ( const z of [ - 1, 1 ] ) add( g, new THREE.CircleGeometry( r * 0.999, 28 ).rotateY( z > 0 ? 0 : PI ), endM, [ 0, r, z * ( w / 2 + 0.0003 ) ] );
		if ( s.tape ) add( g, G.cylZ( r * 0.44, w * 1.01, 18 ), M( 0x9a7a52, { rough: 0.9, side: THREE.DoubleSide } ), [ 0, r, 0 ] );
		else add( g, G.cylZ( r * 0.22, w * 1.004, 12 ), M( 0x2a2a2a, { rough: 0.9 } ), [ 0, r, 0 ] );
		// the loose end, lying out flat
		if ( s.tail || s.tape ) {
			const tail = new THREE.PlaneGeometry( 0.09, w * 0.98, 6, 1 ).rotateX( - PI / 2 );
			const p = tail.attributes.position;
			for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ) + 0.045; p.setY( i, 0.0012 + Math.max( 0, 0.012 - x * 0.4 ) * ( x < 0.02 ? 1 : 0.3 ) ); }
			tail.computeVertexNormals();
			add( g, tail, s.tape ? M( 0xffffff, { map: tapeTex( c ), rough: 0.35, metal: 0.5, side: THREE.DoubleSide } ) : M( c, { rough: 0.95, side: THREE.DoubleSide } ), [ r * 0.5 + 0.045, 0, 0 ] );
		}
		if ( s.wrap ) {
			const spec = { bg: 0xffffff, fg: s.wrap, band: s.wrap, text: s.text || 'STERILE', sub: 'Gauze roll · 3 in', style: 'band', glyph: 'cross', glyphColor: 0xc0282a, size: 0.26 };
			add( g, G.cylZ( r * 1.012, w * 0.56, 28 ), printed( panelTex( spec, packInfo( spec, def, 'med' ), w * 0.56, PI * 2 * r, 'front', { max: 384 } ), { rough: 0.5 } ), [ 0, r, 0 ] );
		}
		if ( s.print === 'weave' ) for ( const z of [ - 0.012, 0.012 ] ) add( g, G.box( 0.012, 0.004, 0.01 ), MAT.metal(), [ r * 0.75, r * 1.62, z ], [ 0, 0, - 0.9 ] );
		return g;
	} );
	function tapeTex( c ) {
		return canvasTex( 'tape:' + c, 128, 64, ( ctx, W, H ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
			for ( let x = 0; x < W; x += 3 ) { ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x, H ); ctx.stroke(); }
			for ( let y = 0; y < H; y += 4 ) { ctx.beginPath(); ctx.moveTo( 0, y ); ctx.lineTo( W, y ); ctx.stroke(); }
		}, { repeat: true } );
	}

	reg( 'pillbottle', ( s, def ) => {
		const g = group(), r = s.r ?? 0.02, h = s.h ?? 0.07, c = s.color ?? 0xd8782a;
		// amber / tinted PET shows the pills; a white or cream bottle doesn't
		const see = lumOf( c ) < 0.75 && ! s.opaque;
		const body = see ? M( c, { rough: 0.15, transparent: true, opacity: 0.72, metal: 0.05 } ) : M( c, { rough: 0.3 } );
		const bh = h * 0.8;
		add( g, G.lathe( [ [ 0, 0.002 ], [ r * 0.9, 0 ], [ r, r * 0.12 ], [ r, bh * 0.94 ], [ r * 0.92, bh ], [ r * 0.9, bh + h * 0.03 ] ], 22 ), body );
		if ( see ) add( g, G.cyl( r * 0.88, r * 0.88, bh * 0.62, 16 ), M( s.pills ?? 0xf2efe4, { rough: 0.6 } ), [ 0, 0.002, 0 ] );
		// the child-proof cap: knurled skirt, flat top with the "push down & turn" arrows
		const capC = s.cap ?? 0xf2f2f2;
		add( g, ridged( r * 1.07, h * 0.2, 22, 0.035 ), M( capC, { rough: 0.45 } ), [ 0, bh - h * 0.02, 0 ] );
		add( g, new THREE.CircleGeometry( r * 0.86, 20 ).rotateX( - PI / 2 ), printed( capTex( capC ), { rough: 0.45 } ), [ 0, bh + h * 0.181, 0 ] );
		if ( s.label ) {
			const spec = { style: 'plain', ...s.label };
			add( g, band( r * 1.008, h * 0.12, h * 0.62, 28 ), printed( wrapTex( spec, packInfo( spec, def, 'med' ), 2 * PI * r, h * 0.5, { max: 512 } ), { rough: 0.55 } ) );
		}
		return g;
	} );
	function capTex( c ) {
		return canvasTex( 'cap:' + c, 128, 128, ( ctx, W ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, W );
			const ink = lumOf( c ) > 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)';
			ctx.strokeStyle = ink; ctx.lineWidth = 3;
			ctx.beginPath(); ctx.arc( W / 2, W / 2, W * 0.36, - 0.4, PI * 0.9 ); ctx.stroke();
			ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo( W / 2 + Math.cos( PI * 0.9 ) * W * 0.36 - 8, W / 2 + Math.sin( PI * 0.9 ) * W * 0.36 ); ctx.lineTo( W / 2 + Math.cos( PI * 0.9 ) * W * 0.36 + 6, W / 2 + Math.sin( PI * 0.9 ) * W * 0.36 - 9 ); ctx.lineTo( W / 2 + Math.cos( PI * 0.9 ) * W * 0.36 + 8, W / 2 + Math.sin( PI * 0.9 ) * W * 0.36 + 8 ); ctx.fill();
			ptext( ctx, 'PUSH DOWN', W / 2, W * 0.42, W * 0.6, W * 0.11, { color: ink } );
			ptext( ctx, '& TURN', W / 2, W * 0.58, W * 0.5, W * 0.11, { color: ink } );
		} );
	}

	reg( 'blister', ( s, def ) => {
		const g = group(), [ w, d ] = s.size || [ 0.1, 0.05 ];
		const name = s.text || 'TABLETS';
		const foil = canvasTex( 'blister-foil:' + name, 256, 128, ( ctx, W, H ) => {
			ctx.fillStyle = '#d8dce2'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = 'rgba(20,60,140,0.8)';
			for ( let y = 0; y < 4; y ++ ) for ( let x = 0; x < 3; x ++ ) ptext( ctx, name, ( x + 0.5 + ( y % 2 ) * 0.3 ) * W / 3, ( y + 0.5 ) * H / 4, W / 3.4, H / 9, { color: 'rgba(20,60,140,0.85)' } );
		} );
		add( g, G.box( w, 0.0012, d ), M( 0xffffff, { map: foil, rough: 0.3, metal: 0.8 } ) );
		const pill = M( s.pills ?? 0xf2f2f2, { rough: 0.4 } ), dome = MAT.glass( 0xffffff, 0.32 );
		const nx = s.nx ?? 5, nz = s.nz ?? 2;
		for ( let i = 0; i < nx; i ++ ) for ( let j = 0; j < nz; j ++ ) {
			const x = ( i - ( nx - 1 ) / 2 ) * w / nx, z = ( j - ( nz - 1 ) / 2 ) * d / nz;
			// one pocket already pushed through and empty
			if ( i === nx - 1 && j === 0 ) { add( g, G.cyl( 0.0062, 0.0062, 0.0004, 10 ), M( 0x9aa0a8, { rough: 0.6, metal: 0.6 } ), [ x, 0.0012, z ] ); continue; }
			add( g, G.capsX( 0.0042, 0.013, 8, 3 ), pill, [ x, 0.0055, z ] );
			add( g, G.capsX( 0.0058, 0.016, 10, 3 ).scale( 1, 0.95, 1 ), dome, [ x, 0.0058, z ] );
		}
		if ( s.box ) {
			const spec = { bg: s.box, fg: 0xffffff, band: shade( s.box, - 0.3 ), text: s.text || '', sub: '24 tablets · Non-drowsy', style: 'band', glyph: 'pill', glyphColor: 0xffffff, size: 0.26 };
			const geo = G.rbox( w * 1.05, 0.022, d * 1.15, 0.0012, 1 );
			const { tex, rects } = boxAtlas( spec, packInfo( spec, def, 'med' ), w * 1.05, 0.022, d * 1.15, 'y', { max: 512 } );
			add( g, boxUV( geo, rects ), printed( tex, { rough: 0.6 } ), [ 0.006, 0, d * 1.25 ], [ 0, 0.06, 0 ] );
		}
		return ground( g, false );
	} );

	reg( 'syringe', ( s, def ) => {
		const g = group();
		if ( s.style === 'autoinjector' || s.style === 'epipen' ) {
			const epi = s.style === 'epipen', c = s.color ?? ( epi ? 0xf2c230 : 0x3a6a3a ), r = 0.0105, L = 0.15;
			const spec = epi ? { bg: 0xf2c230, fg: 0x1a1a1a, band: 0x2a6ad6, text: s.text || 'EPINEPHRINE', sub: 'Auto-injector 0.3 mg', style: 'band', size: 0.32, brand: 'Kōkua Health' }
				: { bg: c, fg: 0xf2f2ea, band: 0xf2f2ea, text: s.text || 'MORPHINE', sub: 'Auto-injector · 10 mg', style: 'military', size: 0.32 };
			const body = tubeUV( G.cylX( r, L * 0.62, 20 ) );
			add( g, body, printed( tubeTex( spec, packInfo( spec, def, 'med' ), L * 0.62, 2 * PI * r, { back: false } ), { rough: 0.45 } ), [ - 0.01, r, 0 ] );
			// the safety cap (blue on the pen), the orange needle end with its window
			add( g, G.capsX( r * 1.02, L * 0.24, 16, 4 ), M( epi ? 0x2a6ad6 : 0x6a7a5a, { rough: 0.4 } ), [ - 0.01 - L * 0.39, r, 0 ] );
			add( g, G.cylX( r * 1.01, 0.03, 16, r * 0.85 ), M( s.tip ?? 0xe8602a, { rough: 0.4 } ), [ 0.052, r, 0 ] );
			add( g, G.cylX( r * 0.86, 0.006, 16 ), M( shade( s.tip ?? 0xe8602a, - 0.2 ), { rough: 0.4 } ), [ 0.07, r, 0 ] );
			add( g, G.box( 0.012, 0.004, 0.0002 ), MAT.glass( 0x6a5a2a, 0.6 ), [ 0.02, r * 1.3, r * 0.94 ] );
			return g;
		}
		// a disposable syringe: printed barrel, the rubber-tipped plunger, the flange, the capped needle
		const R = 0.0062, L = 0.07, y = 0.0075;
		const grad = canvasTex( 'syringe-grad', 256, 32, ( ctx, W, H ) => {
			ctx.clearRect( 0, 0, W, H ); ctx.fillStyle = 'rgba(255,255,255,0.0)'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#111';
			for ( let i = 0; i <= 30; i ++ ) { const x = 12 + i * ( W - 24 ) / 30; ctx.fillRect( x, 4, 1.5, i % 5 ? 7 : 12 ); if ( i % 10 === 0 ) ptext( ctx, String( i / 10 ), x, 23, 20, 9, { color: '#111' } ); }
		} );
		add( g, G.cylX( R, L, 16 ), MAT.glass( 0xf0f8ff, 0.38 ), [ 0, y, 0 ] );
		add( g, new THREE.CylinderGeometry( R * 1.01, R * 1.01, L * 0.9, 16, 1, true, - PI * 0.2, PI * 0.6 ).rotateZ( - PI / 2 ), M( 0xffffff, { map: grad, rough: 0.3, transparent: true, opacity: 0.9 } ), [ 0, y, 0 ] );
		add( g, G.cylX( R * 0.86, 0.04, 14 ), M( s.color ?? 0xe8d040, { rough: 0.15, transparent: true, opacity: 0.75 } ), [ 0.012, y, 0 ] );
		add( g, G.cylX( R * 0.9, 0.005, 14 ), MAT.rubber(), [ - 0.009, y, 0 ] );
		add( g, G.box( 0.045, R * 1.3, 0.0016 ), MAT.white(), [ - 0.04, y, 0 ] );
		add( g, G.box( 0.045, 0.0016, R * 1.3 ), MAT.white(), [ - 0.04, y + R * 0.65 - 0.0008, 0 ] );
		add( g, G.cylX( 0.0085, 0.0025, 16 ), MAT.white(), [ - 0.064, y, 0 ] );
		add( g, G.box( 0.003, 0.004, 0.026 ), MAT.white(), [ - L / 2 - 0.0005, y - 0.002, 0 ] );
		add( g, G.cylX( 0.0026, 0.008, 10, 0.0018 ), MAT.white(), [ L / 2 + 0.004, y, 0 ] );
		add( g, G.cylX( 0.0028, 0.026, 10, 0.0022 ), M( s.cap ?? 0xf28a2a, { rough: 0.45 } ), [ L / 2 + 0.019, y, 0 ] );
		return ground( g, false );
	} );

	reg( 'kit', ( s, def ) => {
		const g = group(), [ w, h, d ] = s.size || [ 0.22, 0.08, 0.15 ];
		const c = s.color ?? 0xd02a2a, style = s.style || 'box';
		if ( style === 'pouch' ) {
			// a soft pouch: rounded body, a zip round the top edge with two pulls, webbing straps across, a patch
			const nylon = fabric( c, 'canvas', shade( c, - 0.1 ), { rep: 3, rough: 0.92 } );
			add( g, G.rbox( w, h, d, h * 0.38, 3 ), nylon );
			add( g, G.box( w * 0.96, 0.004, d * 0.98 ), M( shade( c, - 0.35 ), { rough: 0.85 } ), [ 0, h * 0.62, 0 ] );
			const zip = M( 0x1a1a1a, { rough: 0.45, metal: 0.4 } );
			add( g, G.box( w * 0.92, 0.003, 0.005 ), zip, [ 0, h * 0.62 + 0.002, d * 0.49 ] );
			for ( const x of [ - w * 0.2, w * 0.3 ] ) { add( g, G.box( 0.012, 0.004, 0.008 ), MAT.darkMetal(), [ x, h * 0.62, d * 0.5 + 0.003 ] ); add( g, G.box( 0.006, 0.022, 0.003 ), MAT.rubber(), [ x, h * 0.62 - 0.022, d * 0.5 + 0.006 ] ); }
			const web = fabric( shade( c, - 0.2 ), 'weave', shade( c, - 0.32 ), { rep: 6, rough: 0.95 } );
			for ( let i = 0; i < 3; i ++ ) add( g, G.box( w * 1.004, 0.016, 0.0025 ), web, [ 0, h * 0.14 + i * 0.022, - d / 2 - 0.0005 ] );
			for ( const x of [ - w * 0.32, w * 0.32 ] ) add( g, G.box( 0.022, h * 0.75, 0.003 ), web, [ x, h * 0.1, d / 2 + 0.0008 ] );
			if ( s.cross !== null ) {
				const patch = canvasTex( 'kit-patch:' + c + ':' + ( s.cross ?? 0xffffff ), 128, 128, ( ctx, W ) => {
					ctx.fillStyle = css( shade( c, - 0.15 ) ); rrect( ctx, 2, 2, W - 4, W - 4, 14 ); ctx.fill();
					ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.setLineDash( [ 4, 3 ] ); ctx.lineWidth = 2; rrect( ctx, 7, 7, W - 14, W - 14, 10 ); ctx.stroke(); ctx.setLineDash( [] );
					ctx.fillStyle = css( s.cross ?? 0xffffff ); ctx.fillRect( W * 0.39, W * 0.18, W * 0.22, W * 0.64 ); ctx.fillRect( W * 0.18, W * 0.39, W * 0.64, W * 0.22 );
				} );
				const ps = Math.min( w, d ) * 0.42;
				add( g, G.box( ps, 0.002, ps ), printed( patch, { rough: 0.9 } ), [ - w * 0.05, h - 0.0008, 0 ] );
			}
			if ( s.label ) {
				const spec = { style: 'plain', ...s.label };
				add( g, G.box( w * 0.5, 0.002, d * 0.2 ), printed( panelTex( spec, packInfo( { ...spec, brand: false }, def, 'med' ), w * 0.5, d * 0.2, 'front', { max: 256 } ), { rough: 0.85 } ), [ w * 0.12, h - 0.0005, - d * 0.3 ] );
			}
			return g;
		}
		// a hard case: shell halves split by the seam, the handle, two latches, the hinge, the printed lid
		const shell = M( c, { rough: 0.32, metal: style === 'tin' ? 0.7 : 0 } ), dark = M( shade( c, - 0.35 ), { rough: 0.4 } );
		add( g, G.rbox( w, h * 0.6, d, 0.008, 2 ), shell );
		add( g, G.rbox( w * 1.006, h * 0.08, d * 1.006, 0.006, 1 ), dark, [ 0, h * 0.56, 0 ] );
		add( g, G.rbox( w * 0.99, h * 0.38, d * 0.99, 0.012, 2 ), shell, [ 0, h * 0.62, 0 ] );
		for ( let i = 0; i < 2; i ++ ) add( g, G.rbox( w * 0.82 - i * w * 0.08, 0.003, d * 0.8 - i * d * 0.08, 0.004, 1 ), shell, [ 0, h + i * 0.002 - 0.001, 0 ] );
		add( g, G.tube( [ [ - 0.045, h * 0.62, d / 2 ], [ - 0.04, h * 0.62, d / 2 + 0.022 ], [ 0.04, h * 0.62, d / 2 + 0.022 ], [ 0.045, h * 0.62, d / 2 ] ], 0.0065, 14, 8 ), MAT.blackPlastic() );
		for ( const x of [ - w * 0.32, w * 0.32 ] ) { add( g, G.rbox( 0.026, 0.03, 0.009, 0.003 ), M( 0x2a2a2c, { rough: 0.45 } ), [ x, h * 0.44, d / 2 ] ); add( g, G.box( 0.016, 0.004, 0.004 ), MAT.metal(), [ x, h * 0.66, d / 2 + 0.003 ] ); }
		add( g, G.cylX( 0.005, w * 0.8, 10 ), dark, [ 0, h * 0.6, - d / 2 ] );
		if ( s.cross !== null ) {
			const cs = Math.min( w, d );
			const cross = M( s.cross ?? 0xffffff, { rough: 0.4 } );
			add( g, G.box( cs * 0.42, 0.0025, cs * 0.13 ), cross, [ 0, h + 0.003, 0 ] );
			add( g, G.box( cs * 0.13, 0.0025, cs * 0.42 ), cross, [ 0, h + 0.003, 0 ] );
		}
		if ( s.label ) {
			const spec = { style: 'plain', ...s.label };
			add( g, G.box( w * 0.62, 0.0015, d * 0.22 ), printed( panelTex( spec, packInfo( { ...spec, brand: false }, def, 'med' ), w * 0.62, d * 0.22, 'front', { max: 256 } ), { rough: 0.5 } ), [ 0, h + 0.003, - d * 0.33 ] );
		}
		return g;
	} );

	reg( 'tube', ( s, def ) => {
		const g = group(), L = s.len ?? 0.15, r = s.r ?? 0.018;
		const spec = { style: 'band', ...( s.label || { bg: s.color ?? 0xffffff, text: '' } ) };
		const bodyL = L * 0.8;
		// pressed flat at the crimp end (towards -x), round at the shoulder
		const body = tubeUV( tubeBody( r, bodyL, 1.5 ).rotateY( PI ) );
		add( g, body, printed( tubeTex( spec, packInfo( spec, def, def?.cat === 'medical' ? 'med' : 'chem' ), bodyL, 2 * PI * r, { x0: 0.05, x1: 0.92 } ), { rough: 0.35, metal: 0.15 } ), [ - L * 0.06, r, 0 ] );
		// the crimp, its serrated seal
		add( g, G.box( 0.012, 0.0026, r * 2.9 ), M( shade( spec.bg ?? 0xffffff, - 0.06 ), { rough: 0.5 } ), [ - L * 0.06 - bodyL / 2 - 0.004, r * 0.07, 0 ] );
		for ( let i = 0; i < 9; i ++ ) add( g, G.box( 0.0008, 0.003, r * 2.85 ), M( shade( spec.bg ?? 0xffffff, - 0.25 ) ), [ - L * 0.06 - bodyL / 2 - 0.0095 + i * 0.0012, r * 0.07, 0 ] );
		// the shoulder, the neck and the knurled cap
		add( g, G.cylX( r * 0.98, 0.006, 18, r * 0.5 ), M( spec.bg ?? 0xffffff, { rough: 0.35 } ), [ - L * 0.06 + bodyL / 2 + 0.003, r, 0 ] );
		const cap = ridged( r * 0.62, L * 0.12, 14, 0.06 ).rotateZ( - PI / 2 );
		add( g, cap, M( s.cap ?? 0x2a2a2a, { rough: 0.45 } ), [ - L * 0.06 + bodyL / 2 + 0.006, r, 0 ] );
		return ground( g, false );
	} );

	reg( 'ivbag', ( s, def ) => {
		const g = group(), W = 0.13, Ln = 0.2, c = s.color ?? 0x9a1a1a;
		// the bag lies flat: welded rim, the fluid pillow inside it, the printed scale, the hanger tab and two ports
		const bag = G.rbox( Ln * 0.9, 0.022, W * 0.88, 0.011, 3 );
		add( g, bag, M( c, { rough: 0.12, transparent: true, opacity: 0.8 } ), [ 0, 0.001, 0 ] );
		add( g, G.rbox( Ln, 0.0018, W, 0.006, 1 ), M( 0xe8eef0, { rough: 0.2, transparent: true, opacity: 0.55 } ) );
		const label = canvasTex( 'ivbag:' + ( s.text || '' ) + c, 256, 192, ( ctx, Wd, H ) => {
			ctx.fillStyle = '#fbfbf6'; ctx.fillRect( 0, 0, Wd, H );
			ctx.fillStyle = css( shade( c, - 0.2 ) ); ctx.fillRect( 0, 0, Wd, H * 0.24 );
			ptext( ctx, s.text || 'BLOOD', Wd / 2, H * 0.12, Wd * 0.86, H * 0.16, { weight: '900', color: '#ffffff' } );
			ptext( ctx, def?.id === 'blood_bag' ? 'CPDA-1 · 450 mL' : '1000 mL · Sterile · Non-pyrogenic', Wd / 2, H * 0.33, Wd * 0.9, H * 0.07, { color: '#222' } );
			ctx.fillStyle = '#222';
			for ( let i = 0; i <= 10; i ++ ) { ctx.fillRect( Wd * 0.08, H * 0.42 + i * H * 0.05, i % 5 ? Wd * 0.05 : Wd * 0.1, 2 ); }
			barcode( ctx, Wd * 0.3, H * 0.62, Wd * 0.62, H * 0.3, hashStr( s.text || 'iv' ) );
		} );
		add( g, G.box( Ln * 0.5, 0.0006, W * 0.62 ), printed( label, { rough: 0.6 } ), [ - Ln * 0.04, 0.0235, 0 ] );
		add( g, G.box( 0.02, 0.0016, 0.03 ), M( 0xe8eef0, { rough: 0.3, transparent: true, opacity: 0.6 } ), [ - Ln / 2 - 0.008, 0, 0 ] );
		add( g, new THREE.TorusGeometry( 0.006, 0.0012, 4, 12 ).rotateX( PI / 2 ), MAT.white(), [ - Ln / 2 - 0.008, 0.0012, 0 ] );
		for ( const z of [ - 0.018, 0.018 ] ) {
			add( g, G.cylX( 0.003, 0.03, 8 ), M( 0xf2f2ee, { rough: 0.4 } ), [ Ln / 2 + 0.012, 0.004, z ] );
			add( g, G.cylX( 0.0042, 0.008, 10 ), M( z < 0 ? 0x2a6ad6 : 0xf2f2ee, { rough: 0.45 } ), [ Ln / 2 + 0.03, 0.004, z ] );
		}
		if ( s.tube !== false ) add( g, G.tube( [ [ Ln / 2 + 0.03, 0.004, 0.018 ], [ Ln / 2 + 0.07, 0.003, 0.04 ], [ Ln / 2 + 0.05, 0.003, 0.08 ], [ Ln / 2 - 0.02, 0.003, 0.085 ] ], 0.0022, 16, 5 ), MAT.glass( 0xffffff, 0.55 ) );
		return g;
	} );

	reg( 'splint', ( s ) => {
		const g = group();
		if ( s.improvised ) {
			// two straight branches lashed with strips of cloth
			const bark = M( 0x6a4a2e, { rough: 0.95 } ), cut = M( 0xc8a070, { rough: 0.9 } ), cloth = fabric( 0xd8cfc0, 'canvas', 0xb8b0a0, { rep: 2 } );
			for ( const z of [ - 0.03, 0.03 ] ) {
				add( g, G.cylX( 0.011, 0.42, 7, 0.009 ), bark, [ 0, 0.011, z ], [ 0, z * 0.3, 0 ] );
				for ( const x of [ - 0.21, 0.21 ] ) add( g, G.cylX( 0.0105, 0.002, 7 ), cut, [ x, 0.011, z ] );
			}
			for ( const x of [ - 0.13, 0.0, 0.13 ] ) add( g, G.cylX( 0.034, 0.03, 10 ).scale( 1, 0.55, 1 ), cloth, [ x, 0.012, 0 ] );
			return ground( g );
		}
		// a SAM-type splint stored rolled: foam-clad aluminium in a loose spiral, the end standing free
		const c = s.color ?? 0xf28a2a, foam = M( c, { rough: 0.85 } ), blue = M( 0x2a5ab0, { rough: 0.85 } );
		const turns = 2.6, w = 0.11, pts = [];
		for ( let i = 0; i <= 60; i ++ ) { const t = i / 60, a = t * turns * PI * 2, rr = 0.022 + t * 0.03; pts.push( [ Math.sin( a ) * rr, 0.052 + Math.cos( a ) * rr - t * 0.0, 0 ] ); }
		const curve = new THREE.CatmullRomCurve3( pts.map( p => new THREE.Vector3( p[ 0 ], p[ 1 ], p[ 2 ] ) ) );
		// a ribbon along the spiral, w wide in z
		const N = 90, pos = [], idx = [], nor = [];
		for ( let i = 0; i <= N; i ++ ) {
			const p = curve.getPoint( i / N ), tg = curve.getTangent( i / N );
			const n = new THREE.Vector3( - tg.y, tg.x, 0 ).normalize();
			pos.push( p.x, p.y, - w / 2, p.x, p.y, w / 2 ); nor.push( n.x, n.y, 0, n.x, n.y, 0 );
		}
		for ( let i = 0; i < N; i ++ ) { const a = i * 2; idx.push( a, a + 2, a + 1, a + 1, a + 2, a + 3 ); }
		const rib = new THREE.BufferGeometry();
		rib.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) ); rib.setAttribute( 'normal', new THREE.Float32BufferAttribute( nor, 3 ) );
		rib.setAttribute( 'uv', new THREE.Float32BufferAttribute( new Float32Array( pos.length / 3 * 2 ), 2 ) );
		rib.setIndex( idx );
		add( g, rib, M( c, { rough: 0.85, side: THREE.FrontSide } ) );
		const rib2 = rib.clone(); const p2 = rib2.attributes.position, n2 = rib2.attributes.normal;
		for ( let i = 0; i < p2.count; i ++ ) { p2.setXYZ( i, p2.getX( i ) - n2.getX( i ) * 0.003, p2.getY( i ) - n2.getY( i ) * 0.003, p2.getZ( i ) ); n2.setXYZ( i, - n2.getX( i ), - n2.getY( i ), 0 ); }
		rib2.setIndex( idx.slice().reverse() );
		add( g, rib2, blue );
		// the edges
		for ( const z of [ - w / 2, w / 2 ] ) add( g, new THREE.TubeGeometry( curve, 60, 0.0016, 4, false ), M( 0x9aa0a8, { rough: 0.4, metal: 0.7 } ), [ 0, 0, z ] );
		void foam;
		return ground( g );
	} );

	reg( 'spray', ( s, def ) => {
		const g = group(), r = s.r ?? 0.026, h = s.h ?? 0.17, seg = 26;
		const tin = MAT.tin();
		const spec = { style: 'band', ...( s.label || { bg: s.color ?? 0xffffff } ) };
		// the aerosol: a domed base, the printed body, the shoulder dome, the valve cup and the actuator
		const bodyTop = h * 0.74;
		add( g, G.lathe( [ [ 0, 0.008 ], [ r * 0.75, 0.004 ], [ r * 0.86, 0 ], [ r * 0.96, 0.002 ], [ r, 0.008 ] ], seg ), tin );
		add( g, band( r, 0.008, bodyTop, seg ), printed( wrapTex( spec, packInfo( spec, def, def?.cat === 'medical' ? 'med' : 'chem' ), 2 * PI * r, bodyTop - 0.008 ), { rough: 0.32, metal: 0.45 } ) );
		add( g, G.lathe( [ [ r, bodyTop ], [ r * 0.98, bodyTop + h * 0.03 ], [ r * 0.82, bodyTop + h * 0.075 ], [ r * 0.5, bodyTop + h * 0.105 ], [ r * 0.38, bodyTop + h * 0.11 ], [ r * 0.4, bodyTop + h * 0.125 ], [ r * 0.3, bodyTop + h * 0.125 ], [ 0, bodyTop + h * 0.12 ] ], seg ), tin );
		add( g, G.cyl( r * 0.16, r * 0.18, h * 0.04, 12 ), MAT.white(), [ 0, bodyTop + h * 0.12, 0 ] );
		add( g, G.cylZ( r * 0.05, r * 0.2, 6 ), MAT.blackPlastic(), [ 0, bodyTop + h * 0.145, r * 0.12 ] );
		// the overcap (clear on some)
		const capC = s.cap ?? 0xf2f2f2;
		const cap = G.lathe( [ [ r * 0.96, bodyTop - h * 0.005 ], [ r * 0.98, bodyTop + h * 0.12 ], [ r * 0.9, bodyTop + h * 0.2 ], [ r * 0.8, bodyTop + h * 0.215 ], [ 0, bodyTop + h * 0.215 ] ], seg );
		add( g, cap, s.clearCap ? M( capC, { rough: 0.1, transparent: true, opacity: 0.45 } ) : M( capC, { rough: 0.35 } ) );
		return g;
	} );

	// ================= tools =================
	reg( 'flashlight', ( s ) => {
		const g = group(), L = s.len ?? 0.2, m = M( s.color ?? 0x1c1c1e, { rough: 0.35, metal: 0.7 } );
		add( g, G.cylX( 0.014, L * 0.7, 14 ), m, [ - L * 0.1, 0.02, 0 ] );
		add( g, G.cylX( 0.02, L * 0.25, 16, 0.0145 ), m, [ L * 0.37, 0.02, 0 ] );
		add( g, G.cylX( 0.017, 0.004, 16 ), M( 0xfff6d8, { rough: 0.05, emissive: s.on ? 0xfff6d8 : 0x000000, metal: 0.3 } ), [ L * 0.5, 0.02, 0 ] );
		add( g, G.box( 0.012, 0.004, 0.008 ), M( 0x8a1a1a ), [ 0, 0.035, 0 ] );
		for ( let i = 0; i < 5; i ++ ) add( g, G.cylX( 0.0145, 0.004, 14 ), M( 0x333336, { rough: 0.8 } ), [ - L * 0.3 + i * 0.01, 0.02, 0 ] );
		return ground( g );
	} );
	reg( 'headlamp', ( s ) => {
		const g = group();
		const band = G.torus( 0.08, 0.012, 3, 24 ); band.scale( 1, 1, 0.3 ); band.rotateX( PI / 2 );
		add( g, band, M( s.color ?? 0x2a2a2a, { rough: 0.9 } ), [ 0, 0.004, 0 ] );
		add( g, G.rbox( 0.03, 0.035, 0.05, 0.008 ), M( s.body ?? 0xd8d020, { rough: 0.4 } ), [ 0.085, 0.0, 0 ] );
		add( g, G.cylX( 0.012, 0.004, 14 ), M( 0xfff6d8, { rough: 0.05, metal: 0.3 } ), [ 0.1, 0.018, 0 ] );
		return ground( g );
	} );
	reg( 'lantern', ( s ) => {
		const g = group(), c = s.color ?? 0x2a5a3a;
		const m = M( c, { rough: 0.4, metal: s.style === 'kerosene' ? 0.6 : 0 } );
		add( g, G.cyl( 0.06, 0.065, 0.05, 16 ), m );
		add( g, G.cyl( 0.045, 0.045, 0.1, 16 ), MAT.glass( 0xfff2d0, 0.35 ), [ 0, 0.05, 0 ] );
		add( g, G.cyl( 0.012, 0.012, 0.05, 8 ), M( 0xfff0c0, { emissive: 0x000000 } ), [ 0, 0.07, 0 ] );
		for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2; add( g, G.cyl( 0.003, 0.003, 0.1, 5 ), m, [ Math.cos( a ) * 0.048, 0.05, Math.sin( a ) * 0.048 ] ); }
		add( g, G.cyl( 0.03, 0.055, 0.035, 16 ), m, [ 0, 0.15, 0 ] );
		add( g, G.torus( 0.04, 0.003, 4, 14, PI ), MAT.metal(), [ 0, 0.185, 0 ] );
		return g;
	} );
	reg( 'lighter', ( s ) => {
		const g = group();
		if ( s.style === 'zippo' ) {
			add( g, G.rbox( 0.038, 0.055, 0.013, 0.004 ), M( 0xc8ccd0, { rough: 0.2, metal: 1 } ) );
			add( g, G.box( 0.038, 0.001, 0.0135 ), MAT.darkMetal(), [ 0, 0.038, 0 ] );
		} else {
			add( g, G.rbox( 0.025, 0.07, 0.013, 0.006 ), M( s.color ?? 0xd02a6a, { rough: 0.3 } ) );
			add( g, G.box( 0.022, 0.012, 0.01 ), MAT.metal(), [ 0, 0.07, 0 ] );
			add( g, G.cylZ( 0.005, 0.008, 10 ), MAT.darkMetal(), [ 0.004, 0.08, 0 ] );
			add( g, G.box( 0.01, 0.006, 0.009 ), MAT.blackPlastic(), [ - 0.007, 0.072, 0 ] );
		}
		// lying down on its side
		const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
		inner.rotation.z = - PI / 2; g.add( inner );
		return ground( g );
	} );
	reg( 'canopener', () => {
		const g = group(), steel = MAT.metal();
		for ( const z of [ - 0.008, 0.008 ] ) add( g, G.rbox( 0.15, 0.008, 0.012, 0.003 ), M( 0x2a2a2a, { rough: 0.6 } ), [ - 0.03, 0, z ], [ 0, z * 8, 0 ] );
		add( g, G.cylZ( 0.017, 0.03, 16 ), steel, [ 0.06, 0.017, 0 ] );
		add( g, G.box( 0.03, 0.015, 0.012 ), steel, [ 0.035, 0.007, 0 ] );
		add( g, G.rbox( 0.012, 0.035, 0.04, 0.004 ), M( 0x2a2a2a ), [ 0.08, 0.003, 0 ] );
		return g;
	} );
	reg( 'compass', ( s ) => {
		const g = group();
		add( g, G.cyl( 0.03, 0.03, 0.014, 20 ), M( s.color ?? 0x3a4a2a, { rough: 0.5, metal: 0.3 } ) );
		const face = canvasTex( 'compass-face', 128, 128, ( ctx, W, H ) => {
			ctx.fillStyle = '#f2efe4'; ctx.beginPath(); ctx.arc( W / 2, H / 2, W / 2, 0, PI * 2 ); ctx.fill();
			ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
			for ( let i = 0; i < 36; i ++ ) { const a = i / 36 * PI * 2; const r0 = i % 9 === 0 ? 40 : 50; ctx.beginPath(); ctx.moveTo( W / 2 + Math.cos( a ) * r0, H / 2 + Math.sin( a ) * r0 ); ctx.lineTo( W / 2 + Math.cos( a ) * 58, H / 2 + Math.sin( a ) * 58 ); ctx.stroke(); }
			ctx.fillStyle = '#222'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			ctx.fillText( 'N', W / 2, 24 ); ctx.fillText( 'S', W / 2, H - 24 ); ctx.fillText( 'E', W - 24, H / 2 ); ctx.fillText( 'W', 24, H / 2 );
			ctx.fillStyle = '#c0282a'; ctx.beginPath(); ctx.moveTo( W / 2, 30 ); ctx.lineTo( W / 2 + 7, H / 2 ); ctx.lineTo( W / 2 - 7, H / 2 ); ctx.fill();
			ctx.fillStyle = '#444'; ctx.beginPath(); ctx.moveTo( W / 2, H - 30 ); ctx.lineTo( W / 2 + 7, H / 2 ); ctx.lineTo( W / 2 - 7, H / 2 ); ctx.fill();
		} );
		add( g, G.cyl( 0.026, 0.026, 0.001, 20 ), M( 0xffffff, { map: face, rough: 0.5 } ), [ 0, 0.0141, 0 ] );
		add( g, G.dome( 0.026, 16, 4 ).scale( 1, 0.15, 1 ), MAT.glass( 0xffffff, 0.2 ), [ 0, 0.014, 0 ] );
		add( g, G.torus( 0.008, 0.002, 4, 10 ), MAT.metal(), [ 0.034, 0.007, 0 ], [ PI / 2, 0, 0 ] );
		return g;
	} );
	reg( 'map', () => {
		const g = group();
		const t = canvasTex( 'map-hawaii', 512, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#9fc9dc'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
			for ( let x = 0; x < W; x += 32 ) { ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x, H ); ctx.stroke(); }
			for ( let y = 0; y < H; y += 32 ) { ctx.beginPath(); ctx.moveTo( 0, y ); ctx.lineTo( W, y ); ctx.stroke(); }
			// the chain, roughly: Niʻihau, Kauaʻi, Oʻahu, Molokaʻi, Lānaʻi, Maui, Kahoʻolawe, Hawaiʻi
			const isl = [ [ 40, 60, 10, 14 ], [ 80, 50, 28, 24 ], [ 190, 95, 34, 24 ], [ 270, 110, 34, 9 ], [ 275, 135, 12, 10 ], [ 330, 135, 34, 22 ], [ 315, 160, 10, 7 ], [ 430, 200, 62, 58 ] ];
			for ( const [ x, y, rx, ry ] of isl ) {
				ctx.fillStyle = '#e8dcb0'; ctx.beginPath(); ctx.ellipse( x, y, rx + 2, ry + 2, 0.3, 0, PI * 2 ); ctx.fill();
				ctx.fillStyle = '#7fae5c'; ctx.beginPath(); ctx.ellipse( x, y, rx, ry, 0.3, 0, PI * 2 ); ctx.fill();
				ctx.fillStyle = '#5a8a44'; ctx.beginPath(); ctx.ellipse( x + 3, y - 2, rx * 0.5, ry * 0.5, 0.3, 0, PI * 2 ); ctx.fill();
			}
			ctx.fillStyle = '#b03030'; ctx.fillRect( 180, 98, 4, 4 );
			ctx.fillStyle = '#23374a'; ctx.font = 'bold 22px serif'; ctx.fillText( 'HAWAIʻI', 20, 240 );
			ctx.strokeStyle = '#c33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo( 200, 100 ); ctx.lineTo( 330, 135 ); ctx.stroke();
		} );
		add( g, G.box( 0.24, 0.012, 0.13 ), M( 0xffffff, { map: t, rough: 0.9 } ) );
		for ( let i = 1; i < 4; i ++ ) add( g, G.box( 0.001, 0.002, 0.13 ), M( 0xd8d0b8 ), [ - 0.12 + i * 0.06, 0.012, 0 ] );
		return g;
	} );
	reg( 'binoculars', ( s ) => {
		const g = group(), m = M( s.color ?? 0x2a2a2a, { rough: 0.7 } );
		for ( const z of [ - 0.035, 0.035 ] ) {
			add( g, G.cylX( 0.028, 0.12, 14 ), m, [ 0, 0.028, z ] );
			add( g, G.cylX( 0.031, 0.02, 14 ), MAT.darkMetal(), [ 0.065, 0.028, z ] );
			add( g, G.cylX( 0.026, 0.003, 14 ), M( 0x2a4a6a, { rough: 0.05, metal: 0.8 } ), [ 0.076, 0.028, z ] );
			add( g, G.cylX( 0.015, 0.03, 10 ), MAT.rubber(), [ - 0.07, 0.028, z ] );
		}
		add( g, G.box( 0.05, 0.02, 0.05 ), m, [ - 0.01, 0.03, 0 ] );
		add( g, G.cylZ( 0.01, 0.03, 10 ), MAT.metal(), [ - 0.04, 0.045, 0 ] );
		return g;
	} );
	reg( 'watch', ( s ) => {
		const g = group();
		const strap = G.torus( 0.03, 0.004, 3, 20 ); strap.scale( 1, 1.25, 4 );
		add( g, strap, M( s.strap ?? 0x1a1a1a, { rough: 0.7 } ), [ 0, 0.038, 0 ], [ 0, PI / 2, 0 ] );
		add( g, G.cyl( 0.02, 0.02, 0.012, 20 ), M( s.color ?? 0x2a2a2a, { rough: 0.4, metal: s.metal ?? 0.5 } ), [ 0.035, 0.03, 0 ], [ 0, 0, PI / 2 ] );
		add( g, G.cyl( 0.017, 0.017, 0.002, 18 ), M( s.face ?? 0x10181a, { rough: 0.1, emissive: s.digital ? 0x0a2a1a : 0 } ), [ 0.041, 0.03, 0 ], [ 0, 0, PI / 2 ] );
		return ground( g );
	} );
	reg( 'gps', ( s ) => {
		const g = group();
		add( g, G.rbox( 0.11, 0.028, 0.055, 0.01 ), M( s.color ?? 0x2a2a2a, { rough: 0.6 } ) );
		add( g, G.box( 0.045, 0.002, 0.042 ), M( 0x7a9a6a, { rough: 0.1, emissive: 0x2a3a22 } ), [ 0.02, 0.028, 0 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, G.cyl( 0.004, 0.004, 0.002, 8 ), M( 0x555555 ), [ - 0.025, 0.028, - 0.015 + i * 0.01 ] );
		add( g, G.cylX( 0.006, 0.035, 8 ), M( s.color ?? 0x2a2a2a ), [ 0.07, 0.014, 0.015 ] );
		return g;
	} );
	reg( 'rod', ( s ) => {
		const g = group(), L = s.len ?? 1.9;
		add( g, G.cylX( 0.006, L * 0.82, 8, 0.0015 ), M( s.color ?? 0x2a3a5a, { rough: 0.3, metal: 0.3 } ), [ L * 0.09, 0.013, 0 ] );
		add( g, G.cylX( 0.012, L * 0.18, 10 ), M( s.grip ?? 0x2a2a2a, { rough: 0.9 } ), [ - L * 0.41, 0.013, 0 ] );
		add( g, G.cylZ( 0.024, 0.02, 14 ), MAT.metal(), [ - L * 0.32, 0.03, 0 ] );
		add( g, G.cylZ( 0.012, 0.024, 10 ), M( 0xd8d0b0 ), [ - L * 0.32, 0.03, 0 ] );
		for ( let i = 1; i < 6; i ++ ) add( g, G.torus( 0.005, 0.0012, 3, 8 ), MAT.metal(), [ - L * 0.2 + i * L * 0.12, 0.02, 0 ], [ 0, PI / 2, 0 ] );
		if ( s.improvised ) { add( g, G.cylX( 0.012, L * 0.8, 6, 0.006 ), MAT.wood(), [ 0, 0.012, 0 ] ); }
		return g;
	} );
	reg( 'toolbox', ( s ) => {
		const g = group(), [ w, h, d ] = s.size || [ 0.42, 0.18, 0.2 ];
		const m = M( s.color ?? 0xc0282a, { rough: 0.35, metal: 0.6 } );
		add( g, G.rbox( w, h, d, 0.008 ), m );
		add( g, G.box( w * 1.005, 0.006, d * 1.005 ), M( shade( s.color ?? 0xc0282a, - 0.3 ), { metal: 0.6, rough: 0.4 } ), [ 0, h * 0.72, 0 ] );
		add( g, G.torus( 0.06, 0.008, 5, 14, PI ), M( 0x1a1a1a, { rough: 0.5 } ), [ 0, h, 0 ] );
		for ( const x of [ - w * 0.35, w * 0.35 ] ) add( g, G.box( 0.03, 0.03, 0.012 ), MAT.metal(), [ x, h * 0.65, d / 2 ] );
		return g;
	} );
	reg( 'lockpick', () => {
		const g = group();
		add( g, G.rbox( 0.11, 0.008, 0.05, 0.004 ), M( 0x2a2a2a, { rough: 0.8 } ) );
		for ( let i = 0; i < 4; i ++ ) add( g, G.box( 0.09, 0.002, 0.003 ), MAT.metal(), [ 0.005, 0.009, - 0.015 + i * 0.01 ], [ 0, ( i - 1.5 ) * 0.05, 0 ] );
		return g;
	} );
	reg( 'radio', ( s ) => {
		const g = group();
		if ( s.style === 'portable' ) {
			add( g, G.rbox( 0.22, 0.13, 0.07, 0.015 ), M( s.color ?? 0x2a2a2a, { rough: 0.5 } ) );
			add( g, G.cylZ( 0.04, 0.004, 18 ), M( 0x1a1a1a, { rough: 0.9 } ), [ - 0.05, 0.065, 0.035 ] );
			add( g, G.box( 0.07, 0.03, 0.002 ), M( 0xd8c080, { emissive: 0x3a2a10 } ), [ 0.05, 0.085, 0.036 ] );
			add( g, G.cylX( 0.003, 0.3, 6 ), MAT.metal(), [ 0.1, 0.135, - 0.02 ], [ 0, 0, 0.4 ] );
			add( g, G.torus( 0.08, 0.006, 4, 14, PI ), M( 0x1a1a1a ), [ 0, 0.13, 0 ] );
			return g;
		}
		add( g, G.rbox( 0.06, 0.12, 0.035, 0.008 ), M( s.color ?? 0x1a1a1a, { rough: 0.6 } ) );
		add( g, G.cyl( 0.005, 0.004, 0.09, 8 ), MAT.rubber(), [ 0.018, 0.12, 0 ] );
		add( g, G.cyl( 0.007, 0.007, 0.012, 10 ), MAT.darkMetal(), [ - 0.015, 0.12, 0 ] );
		add( g, G.box( 0.04, 0.035, 0.002 ), M( 0x333333 ), [ 0, 0.04, 0.018 ] );
		add( g, G.box( 0.035, 0.015, 0.002 ), M( 0x9ab88a, { emissive: 0x1a2a14 } ), [ 0, 0.085, 0.018 ] );
		const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
		inner.rotation.set( 0, 0, - PI / 2 ); g.add( inner );
		return ground( g );
	} );
	reg( 'sewing', () => {
		const g = group();
		add( g, G.cyl( 0.05, 0.05, 0.03, 20 ), M( 0x2a5a8a, { rough: 0.3, metal: 0.7 } ) );
		add( g, G.cyl( 0.052, 0.052, 0.012, 20 ), M( 0x3a6a9a, { rough: 0.3, metal: 0.7 } ), [ 0, 0.028, 0 ] );
		for ( const [ x, c ] of [ [ - 0.02, 0xd02a2a ], [ 0.012, 0xf2f2f2 ], [ 0.03, 0x2a2a2a ] ] ) add( g, G.cyl( 0.008, 0.008, 0.012, 10 ), M( c ), [ x, 0.04, 0.01 ] );
		return g;
	} );
	reg( 'pot', ( s ) => {
		const g = group(), r = s.r ?? 0.1, h = s.h ?? 0.11;
		const m = M( s.color ?? 0xa8acb2, { rough: 0.35, metal: 0.9 } );
		add( g, G.lathe( [ [ 0, 0 ], [ r * 0.97, 0 ], [ r, h * 0.05 ], [ r, h ], [ r * 0.96, h ], [ r * 0.96, h * 0.06 ], [ 0, h * 0.06 ] ], 22 ), m );
		add( g, G.cyl( r * 1.02, r * 1.02, 0.006, 22 ), m, [ 0, h, 0 ] );
		add( g, G.cyl( 0.012, 0.015, 0.018, 10 ), MAT.blackPlastic(), [ 0, h + 0.006, 0 ] );
		add( g, G.cylX( 0.012, 0.13, 8 ), MAT.blackPlastic(), [ r + 0.06, h * 0.8, 0 ] );
		return g;
	} );
	reg( 'canteen', ( s ) => {
		const g = group();
		const body = G.cylZ( 0.085, 0.07, 22 ); body.scale( 0.95, 1.05, 1 ); body.translate( 0, 0.09, 0 );
		const cover = M( s.color ?? 0x5a6a3a, { rough: 0.95 } );
		add( g, body, s.bare ? M( 0xa8acb2, { rough: 0.3, metal: 0.9 } ) : cover );
		add( g, G.cyl( 0.017, 0.017, 0.025, 12 ), M( 0x2a2a2a, { rough: 0.6 } ), [ 0, 0.18, 0 ] );
		add( g, G.box( 0.05, 0.03, 0.075 ), cover, [ - 0.05, 0.13, 0 ], [ 0, 0, 0.3 ] );
		// on its side
		const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
		inner.rotation.x = PI / 2; g.add( inner );
		return ground( g );
	} );
	reg( 'jerrycan', ( s ) => {
		const g = group(), small = s.small, c = s.color ?? ( small ? 0xc02a2a : 0x3f5a2a );
		const [ w, h, d ] = small ? [ 0.3, 0.26, 0.16 ] : [ 0.36, 0.47, 0.17 ];
		const m = M( c, { rough: small ? 0.4 : 0.55, metal: small ? 0 : 0.5 } );
		add( g, G.rbox( w, h * 0.88, d, 0.02 ), m );
		if ( ! small ) {
			// the X pressings
			for ( const z of [ - 1, 1 ] ) for ( const a of [ 0.7, - 0.7 ] ) add( g, G.box( 0.34, 0.025, 0.008 ), m, [ 0, h * 0.44, z * d / 2 ], [ 0, 0, a ] );
			for ( let i = 0; i < 3; i ++ ) add( g, G.box( 0.04, 0.05, 0.02 ), m, [ - 0.07 + i * 0.07, h * 0.9, 0 ] );
			add( g, G.box( 0.2, 0.012, 0.02 ), m, [ 0, h * 0.94, 0 ] );
			add( g, G.cyl( 0.025, 0.025, 0.04, 12 ), m, [ w * 0.35, h * 0.86, 0 ], [ 0, 0, - 0.5 ] );
		} else {
			add( g, G.torus( 0.07, 0.013, 5, 12, PI ), m, [ - 0.03, h * 0.88, 0 ] );
			add( g, G.cyl( 0.012, 0.018, 0.12, 10 ), M( 0x1a1a1a, { rough: 0.6 } ), [ w * 0.45, h * 0.9, 0 ], [ 0, 0, - 0.9 ] );
		}
		return g;
	} );
	reg( 'battery', ( s ) => {
		const g = group();
		if ( s.style === '9v' ) {
			add( g, G.rbox( 0.048, 0.017, 0.026, 0.003 ), M( 0x2a2a2a, { rough: 0.4 } ) );
			for ( const z of [ - 0.006, 0.006 ] ) add( g, G.cylX( 0.003, 0.006, 8 ), MAT.metal(), [ 0.026, 0.009, z ] );
			return g;
		}
		for ( const z of [ - 0.0075, 0.0075 ] ) {
			add( g, G.cylX( 0.007, 0.042, 12 ), M( s.color ?? 0x1c1c1c, { rough: 0.3, metal: 0.4 } ), [ - 0.004, 0.007, z ] );
			add( g, G.cylX( 0.0071, 0.012, 12 ), M( s.color2 ?? 0xd8a020, { rough: 0.3, metal: 0.6 } ), [ 0.021, 0.007, z ] );
			add( g, G.cylX( 0.0025, 0.002, 8 ), MAT.metal(), [ 0.028, 0.007, z ] );
		}
		return g;
	} );
	reg( 'carbattery', () => {
		const g = group();
		add( g, G.rbox( 0.27, 0.19, 0.17, 0.008 ), M( 0x1c1c1e, { rough: 0.5 } ) );
		add( g, G.box( 0.272, 0.02, 0.172 ), M( 0x2a2a2e, { rough: 0.5 } ), [ 0, 0.19, 0 ] );
		add( g, G.cyl( 0.01, 0.011, 0.02, 10 ), M( 0xc02a2a, { rough: 0.4, metal: 0.4 } ), [ 0.1, 0.205, 0.05 ] );
		add( g, G.cyl( 0.01, 0.011, 0.02, 10 ), MAT.darkMetal(), [ - 0.1, 0.205, 0.05 ] );
		add( g, G.box( 0.16, 0.08, 0.001 ), flatLabel( { bg: 0x1a1a1a, fg: 0xf2c230, text: 'MAX POWER', sub: '12V 650CCA', style: 'plain', band: 0xf2c230 } ), [ 0, 0.06, 0.0855 ] );
		add( g, G.torus( 0.05, 0.005, 4, 12, PI ), MAT.blackPlastic(), [ 0, 0.21, 0 ] );
		return g;
	} );
	reg( 'tire', ( s ) => {
		const g = group(), R = s.r ?? 0.32, W = s.w ?? 0.2;
		const tread = canvasTex( 'tread', 256, 64, ( ctx, Wd, H ) => {
			ctx.fillStyle = '#1a1a1a'; ctx.fillRect( 0, 0, Wd, H );
			ctx.fillStyle = '#0a0a0a';
			for ( let x = 0; x < Wd; x += 16 ) { ctx.fillRect( x, 4, 6, 24 ); ctx.fillRect( x + 8, 36, 6, 24 ); }
		}, { repeat: true } );
		const tt = tread.clone(); tt.repeat.set( 6, 1 ); tt.needsUpdate = true;
		const rubber = M( 0xffffff, { map: tt, rough: 0.92 } );
		const tor = G.torus( R - W * 0.35, W * 0.42, 10, 28 ); tor.scale( 1, 1, W / ( W * 0.84 ) * 0.6 );
		add( g, tor, rubber, [ 0, W / 2, 0 ], [ PI / 2, 0, 0 ] );
		add( g, G.cyl( R * 0.62, R * 0.62, W * 0.7, 20 ), M( s.rim ?? 0x9a9ea4, { rough: 0.3, metal: 0.9 } ), [ 0, W * 0.15, 0 ] );
		add( g, G.cyl( R * 0.15, R * 0.15, W * 0.75, 12 ), MAT.darkMetal(), [ 0, W * 0.12, 0 ] );
		for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; add( g, G.cyl( 0.012, 0.012, 0.01, 8 ), MAT.metal(), [ Math.cos( a ) * R * 0.25, W * 0.87, Math.sin( a ) * R * 0.25 ] ); }
		return g;
	} );
	reg( 'rope', ( s ) => {
		const g = group(), c = s.color ?? 0xc8b07a;
		const m = fabric( c, 'stripes', shade( c, - 0.25 ), { rep: 12, rough: 0.95 } );
		const R = s.r ?? 0.1;
		for ( let i = 0; i < 4; i ++ ) add( g, G.torus( R - i * 0.004, 0.009, 6, 26 ), m, [ ( i % 2 ) * 0.004, 0.009 + i * 0.013, 0 ], [ PI / 2, 0, i * 0.4 ] );
		add( g, G.tube( [ [ R, 0.02, 0 ], [ R + 0.04, 0.01, 0.03 ], [ R + 0.08, 0.009, 0.01 ] ], 0.009, 8, 6 ), m );
		return g;
	} );
	reg( 'stuffsack', ( s ) => { // tent / sleeping bag / tarp roll
		const g = group(), L = s.len ?? 0.5, r = s.r ?? 0.1;
		const m = M( s.color ?? 0x2a6a3a, { rough: 0.8 } );
		add( g, G.capsX( r, L, 14 ).scale( 1, 1, 1 ), m, [ 0, r, 0 ] );
		if ( s.straps !== false ) for ( const x of [ - L * 0.28, L * 0.28 ] ) add( g, G.cylX( r * 1.03, 0.025, 14 ), M( s.color2 ?? 0x1a1a1a, { rough: 0.8 } ), [ x, r, 0 ] );
		if ( s.drawcord ) add( g, G.cylX( 0.008, 0.04, 6 ), M( 0x1a1a1a ), [ L / 2 + 0.01, r, 0 ] );
		if ( s.poles ) add( g, G.cylX( 0.018, L * 0.9, 8 ), M( 0x5a5a5a, { rough: 0.3, metal: 0.8 } ), [ 0, r * 2 + 0.015, 0 ] );
		return g;
	} );
	reg( 'flare', ( s ) => {
		const g = group(), L = s.len ?? 0.3;
		add( g, G.cylX( 0.016, L, 12 ), M( s.color ?? 0xc0202a, { rough: 0.6 } ), [ 0, 0.016, 0 ] );
		add( g, G.cylX( 0.018, 0.05, 12 ), M( 0x1a1a1a, { rough: 0.5 } ), [ L / 2 - 0.01, 0.016, 0 ] );
		add( g, G.cylX( 0.0162, 0.08, 12 ), flatLabel( { bg: 0xf2f2f2, fg: 0xc0202a, text: 'FUSEE', style: 'plain', size: 0.5 } ), [ - L * 0.1, 0.016, 0 ] );
		return g;
	} );
	reg( 'chemlight', ( s ) => {
		const g = group(), c = s.color ?? 0x5aff6a;
		add( g, G.capsX( 0.008, 0.15, 8 ), M( c, { rough: 0.2, emissive: s.lit ? c : shade( c, - 0.6 ), emissiveIntensity: s.lit ? 2 : 0.4 } ), [ 0, 0.008, 0 ] );
		add( g, G.cylX( 0.0095, 0.012, 8 ), M( 0x1a1a1a ), [ - 0.07, 0.009, 0 ] );
		add( g, G.torus( 0.006, 0.0015, 3, 8 ), M( 0x1a1a1a ), [ - 0.083, 0.009, 0 ], [ 0, PI / 2, 0 ] );
		return g;
	} );
	reg( 'whistle', ( s ) => {
		const g = group(), m = M( s.color ?? 0xf2a020, { rough: 0.35 } );
		add( g, G.cylZ( 0.012, 0.022, 14 ), m, [ 0, 0.012, 0 ] );
		add( g, G.box( 0.04, 0.012, 0.018 ), m, [ 0.022, 0.006, 0 ] );
		add( g, G.torus( 0.008, 0.002, 4, 10 ), M( 0x2a2a2a ), [ - 0.014, 0.012, 0 ], [ 0, 0, 0 ] );
		return g;
	} );
	reg( 'nvg', () => {
		const g = group(), m = M( 0x2a2e26, { rough: 0.6 } );
		add( g, G.rbox( 0.08, 0.05, 0.1, 0.01 ), m, [ - 0.02, 0, 0 ] );
		for ( const z of [ - 0.03, 0.03 ] ) { add( g, G.cylX( 0.02, 0.07, 12 ), m, [ 0.05, 0.03, z ] ); add( g, G.cylX( 0.017, 0.003, 12 ), M( 0x1a3a2a, { rough: 0.05, metal: 0.8 } ), [ 0.086, 0.03, z ] ); }
		add( g, G.box( 0.03, 0.02, 0.03 ), MAT.darkMetal(), [ - 0.06, 0.04, 0 ] );
		return g;
	} );
	reg( 'rangefinder', () => {
		const g = group();
		add( g, G.rbox( 0.12, 0.07, 0.045, 0.01 ), M( 0x3a3f33, { rough: 0.6 } ) );
		add( g, G.cylX( 0.017, 0.02, 12 ), MAT.darkMetal(), [ 0.065, 0.04, 0 ] );
		add( g, G.cylX( 0.014, 0.003, 12 ), M( 0x2a3a6a, { rough: 0.05, metal: 0.8 } ), [ 0.076, 0.04, 0 ] );
		add( g, G.cylX( 0.012, 0.02, 10 ), MAT.rubber(), [ - 0.065, 0.04, 0 ] );
		return g;
	} );
	reg( 'multitool', () => {
		const g = group();
		add( g, G.rbox( 0.1, 0.014, 0.028, 0.004 ), M( 0xb8bcc2, { rough: 0.25, metal: 1 } ) );
		add( g, G.box( 0.05, 0.003, 0.012 ), M( 0xd8dce0, { rough: 0.2, metal: 1 } ), [ 0.065, 0.006, 0 ], [ 0, 0.2, 0 ] );
		add( g, G.box( 0.09, 0.002, 0.006 ), MAT.darkMetal(), [ 0, 0.014, 0 ] );
		return g;
	} );
	reg( 'stove', () => {
		const g = group();
		add( g, G.cyl( 0.05, 0.055, 0.1, 16 ), M( 0x2a6ad6, { rough: 0.4, metal: 0.5 } ) );
		add( g, G.cyl( 0.03, 0.035, 0.03, 12 ), MAT.metal(), [ 0, 0.1, 0 ] );
		add( g, G.cyl( 0.025, 0.025, 0.006, 16 ), MAT.darkMetal(), [ 0, 0.13, 0 ] );
		for ( let i = 0; i < 3; i ++ ) { const a = i / 3 * PI * 2; add( g, G.box( 0.06, 0.004, 0.008 ), MAT.metal(), [ Math.cos( a ) * 0.035, 0.135, Math.sin( a ) * 0.035 ], [ 0, - a, 0 ] ); }
		return g;
	} );
	reg( 'phone', ( s ) => {
		const g = group();
		add( g, G.rbox( 0.15, 0.009, 0.072, 0.008 ), M( s.color ?? 0x1a1a1e, { rough: 0.3, metal: 0.5 } ) );
		add( g, G.box( 0.14, 0.001, 0.064 ), M( 0x05070a, { rough: 0.05, metal: 0.2 } ), [ 0, 0.009, 0 ] );
		if ( s.cracked ) add( g, G.box( 0.1, 0.0015, 0.002 ), M( 0x8a9aa8 ), [ 0.01, 0.009, 0.01 ], [ 0, 0.6, 0 ] );
		return g;
	} );
	reg( 'laptop', () => {
		const g = group();
		add( g, G.rbox( 0.33, 0.02, 0.23, 0.006 ), M( 0x8a8e94, { rough: 0.35, metal: 0.8 } ) );
		add( g, G.box( 0.29, 0.001, 0.12 ), M( 0x1a1a1a ), [ 0, 0.02, - 0.03 ] );
		return g;
	} );
	reg( 'book', ( s ) => {
		const g = group(), [ w, t, d ] = s.size || [ 0.22, 0.03, 0.15 ];
		const cover = s.title ? M( 0xffffff, { map: labelTex( { bg: s.color ?? 0x2a4a6a, fg: s.fg ?? 0xf2e6c8, text: s.title, sub: s.sub || '', style: s.style || 'plain', glyph: s.glyph, w: 512, h: 384, size: 0.16, split: 1, textY: 0.3 } ), rough: 0.8 } ) : M( s.color ?? 0x2a4a6a, { rough: 0.8 } );
		const geo = G.box( w, t, d );
		labelUV( geo, 'y', 1 );
		add( g, G.box( w * 0.97, t * 0.88, d * 0.96 ), MAT.paper(), [ 0.004, t * 0.06, 0 ] );
		add( g, G.box( w, t * 0.08, d ), cover, [ 0, t * 0.92, 0 ] );
		add( g, G.box( w, t * 0.08, d ), M( s.color ?? 0x2a4a6a, { rough: 0.8 } ) );
		add( g, G.box( 0.006, t, d ), M( s.color ?? 0x2a4a6a, { rough: 0.8 } ), [ - w / 2, 0, 0 ] );
		return g;
	} );
	reg( 'keys', ( s ) => {
		const g = group();
		add( g, G.torus( 0.014, 0.0018, 4, 14 ), MAT.metal(), [ 0, 0.002, 0 ], [ PI / 2, 0, 0 ] );
		for ( let i = 0; i < ( s.n ?? 2 ); i ++ ) {
			const a = i * 0.7;
			add( g, G.box( 0.05, 0.002, 0.012 ), M( i ? 0xd4a64a : 0xb8bcc2, { rough: 0.3, metal: 0.9 } ), [ 0.035 * Math.cos( a ), 0.002, 0.035 * Math.sin( a ) ], [ 0, - a, 0 ] );
		}
		if ( s.fob ) add( g, G.rbox( 0.055, 0.014, 0.03, 0.008 ), M( s.fob, { rough: 0.5 } ), [ - 0.03, 0, 0.01 ] );
		return g;
	} );
	reg( 'cash', () => {
		const g = group();
		const bill = canvasTex( 'bill', 256, 110, ( ctx, W, H ) => {
			ctx.fillStyle = '#c9d6b8'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = '#3a5a3a'; ctx.lineWidth = 4; ctx.strokeRect( 6, 6, W - 12, H - 12 );
			ctx.fillStyle = '#3a5a3a'; ctx.beginPath(); ctx.ellipse( W / 2, H / 2, 28, 34, 0, 0, PI * 2 ); ctx.fill();
			ctx.font = 'bold 30px serif'; ctx.fillText( '20', 16, 38 ); ctx.fillText( '20', W - 50, H - 16 );
		} );
		for ( let i = 0; i < 3; i ++ ) add( g, G.box( 0.156, 0.002, 0.066 ), M( 0xffffff, { map: bill, rough: 0.9 } ), [ i * 0.004, i * 0.002, i * 0.003 ], [ 0, i * 0.08, 0 ] );
		add( g, G.box( 0.02, 0.009, 0.068 ), M( 0xd8c8a0 ), [ 0.005, 0, 0 ] );
		return g;
	} );
	reg( 'jewelry', ( s ) => {
		const g = group(), gold = s.silver ? M( 0xdadde2, { rough: 0.15, metal: 1 } ) : MAT.gold();
		if ( s.style === 'ring' ) {
			add( g, G.torus( 0.01, 0.0022, 6, 18 ), gold, [ 0, 0.0022, 0 ], [ PI / 2, 0, 0 ] );
			add( g, G.sph( 0.004, 8, 6 ), M( s.gem ?? 0xdff4ff, { rough: 0.05, metal: 0.2 } ), [ 0.011, 0.004, 0 ] );
		} else {
			const ch = G.torus( 0.06, 0.0018, 4, 32 ); ch.scale( 1, 1.3, 1 );
			add( g, ch, gold, [ 0, 0.002, 0 ], [ PI / 2, 0, 0 ] );
			add( g, G.cyl( 0.014, 0.014, 0.004, 14 ), s.pendant ? M( s.pendant, { rough: 0.2 } ) : gold, [ 0, 0, 0.078 ] );
		}
		return g;
	} );
	reg( 'ukulele', () => {
		const g = group(), wood = M( 0xb0763a, { rough: 0.35 } ), dark = M( 0x3a2414, { rough: 0.5 } );
		const body = G.lathe( [ [ 0, 0 ], [ 0.08, 0 ], [ 0.08, 0.06 ], [ 0, 0.06 ] ], 20 ); body.scale( 1, 1, 1 );
		add( g, G.cyl( 0.085, 0.085, 0.06, 20 ).scale( 1.05, 1, 0.9 ), wood, [ - 0.12, 0, 0 ] );
		add( g, G.cyl( 0.07, 0.07, 0.06, 20 ).scale( 1, 1, 0.85 ), wood, [ 0.0, 0, 0 ] );
		body.dispose();
		add( g, G.cyl( 0.022, 0.022, 0.001, 16 ), dark, [ - 0.04, 0.06, 0 ] );
		add( g, G.box( 0.3, 0.018, 0.035 ), dark, [ 0.2, 0.05, 0 ] );
		add( g, G.box( 0.07, 0.018, 0.05 ), wood, [ 0.37, 0.05, 0 ] );
		add( g, G.box( 0.02, 0.012, 0.05 ), dark, [ - 0.13, 0.06, 0 ] );
		for ( let i = 0; i < 4; i ++ ) add( g, G.box( 0.5, 0.001, 0.001 ), MAT.white(), [ 0.12, 0.068, - 0.012 + i * 0.008 ] );
		return g;
	} );
	reg( 'duck', ( s ) => {
		const g = group(), y = M( s.color ?? 0xf6d21a, { rough: 0.3 } );
		const body = G.sph( 0.045, 14, 10 ); body.scale( 1.25, 0.8, 1 );
		add( g, body, y, [ 0, 0.036, 0 ] );
		add( g, G.sph( 0.028, 12, 8 ), y, [ 0.03, 0.08, 0 ] );
		add( g, G.cone( 0.012, 0.025, 8 ).scale( 1, 1, 0.6 ), M( 0xf2801a, { rough: 0.3 } ), [ 0.055, 0.078, 0 ], [ 0, 0, - PI / 2 ] );
		for ( const z of [ - 0.015, 0.015 ] ) add( g, G.sph( 0.004, 6, 4 ), M( 0x111111 ), [ 0.05, 0.09, z ] );
		add( g, G.cone( 0.012, 0.02, 6 ), y, [ - 0.06, 0.05, 0 ], [ 0, 0, 1.2 ] );
		return g;
	} );
	reg( 'trash', ( s ) => {
		const g = group();
		const geo = G.sph( 0.05, 7, 5 );
		const p = geo.attributes.position;
		// jitter by position (not index) so the sphere's duplicated seam vertices move together and it stays closed
		for ( let i = 0; i < p.count; i ++ ) { const k = 0.7 + ( ( Math.sin( p.getX( i ) * 131 + p.getY( i ) * 71 + p.getZ( i ) * 37 ) * 43758.5 ) % 1 + 1 ) % 1 * 0.5; p.setXYZ( i, p.getX( i ) * k, p.getY( i ) * k * 0.8, p.getZ( i ) * k ); }
		add( g, facet( geo ), M( s.color ?? 0xd8d4c8, { rough: 0.9 } ), [ 0, 0.035, 0 ] );
		return g;
	} );

	// ================= materials =================
	reg( 'stick', ( s ) => {
		const g = group(), L = s.len ?? 0.6, r = s.r ?? 0.014, n = s.n ?? 1;
		const bark = M( s.color ?? 0x6a4a2e, { rough: 0.95 } );
		for ( let i = 0; i < n; i ++ ) {
			add( g, G.cylX( r, L * ( 1 - i * 0.08 ), 7, r * 0.8 ), bark, [ i * 0.02, r + ( i % 2 ) * r * 1.6, ( i - ( n - 1 ) / 2 ) * r * 2.1 ], [ 0, ( i - 1 ) * 0.08, 0 ] );
			if ( i === 0 ) add( g, G.cylX( r * 0.5, L * 0.18, 5 ), bark, [ L * 0.1, r * 1.3, r * 1.4 ], [ 0, - 0.6, 0 ] );
		}
		if ( s.rag ) add( g, G.cylX( r * 2.4, 0.08, 10 ), M( s.rag, { rough: 0.95 } ), [ L * 0.4, r * 2.2, 0 ] );
		return g;
	} );
	reg( 'plank', ( s ) => {
		const g = group(), L = s.len ?? 1.2, n = s.n ?? 1;
		const t = worldTex( s.old ? 'oldplanks_d' : 'planks_d', 0.5, 0.2 );
		const m = M( 0xffffff, { map: t, rough: 0.85, key: s.old ? 'oldplank' : 'plank' } );
		for ( let i = 0; i < n; i ++ ) add( g, G.box( L, 0.025, 0.14 ), m, [ i * 0.03, i * 0.026, i * 0.01 ], [ 0, i * 0.05, 0 ] );
		return g;
	} );
	reg( 'firewood', () => {
		const g = group(), bark = M( 0x5a4028, { rough: 0.95 } ), cut = M( 0xc8a070, { rough: 0.9 } );
		for ( const [ x, y, z ] of [ [ 0, 0.05, - 0.05 ], [ 0, 0.05, 0.05 ], [ 0.02, 0.13, 0 ] ] ) {
			add( g, G.cylX( 0.05, 0.4, 8 ), bark, [ x, y, z ] );
			for ( const e of [ - 0.2, 0.2 ] ) add( g, G.cylX( 0.048, 0.002, 8 ), cut, [ x + e, y, z ] );
		}
		return g;
	} );
	reg( 'scrap', () => {
		const g = group(), m = M( 0xffffff, { map: worldTex( 'rust_d', 0.4, 0.4 ), rough: 0.7, metal: 0.6, key: 'scrap' } );
		add( g, G.box( 0.22, 0.004, 0.14 ), m, [ 0, 0.01, 0 ], [ 0.1, 0.3, 0.05 ] );
		add( g, G.box( 0.16, 0.004, 0.1 ), m, [ 0.04, 0.03, 0.02 ], [ - 0.3, - 0.4, 0.2 ] );
		add( g, G.box( 0.12, 0.02, 0.02 ), MAT.darkMetal(), [ - 0.05, 0.03, - 0.03 ], [ 0, 0.8, 0 ] );
		return ground( g );
	} );
	reg( 'wire', ( s ) => {
		const g = group(), m = M( s.color ?? 0xb87333, { rough: 0.3, metal: 0.95 } );
		for ( let i = 0; i < 5; i ++ ) add( g, G.torus( 0.07 + i * 0.003, 0.002, 3, 24 ), m, [ ( i % 2 ) * 0.004, 0.003 + i * 0.003, 0 ], [ PI / 2 + i * 0.05, 0, 0 ] );
		return g;
	} );
	reg( 'pipe', ( s ) => {
		const g = group(), L = s.len ?? 0.7;
		add( g, G.cylX( 0.022, L, 12 ), M( s.color ?? 0x7a7e84, { rough: 0.45, metal: 0.85 } ), [ 0, 0.022, 0 ] );
		add( g, G.cylX( 0.016, L + 0.002, 12 ), M( 0x1a1a1a ), [ 0, 0.022, 0 ] );
		return g;
	} );
	reg( 'folded', ( s ) => { // tarp, cloth, hide
		const g = group(), [ w, h, d ] = s.size || [ 0.3, 0.05, 0.22 ];
		const m = s.print ? fabric( s.color ?? 0x2a5aa8, s.print, s.color2 ?? 0xffffff, { rep: s.rep ?? 2 } ) : M( s.color ?? 0x2a5aa8, { rough: s.rough ?? 0.6 } );
		add( g, G.rbox( w, h, d, h * 0.3 ), m );
		for ( let i = 1; i < 3; i ++ ) add( g, G.box( w * 1.004, 0.002, 0.004 ), M( shade( s.color ?? 0x2a5aa8, - 0.3 ) ), [ 0, h * i / 3, d / 2 ] );
		if ( s.grommets ) for ( const x of [ - w * 0.4, w * 0.4 ] ) add( g, G.torus( 0.008, 0.002, 4, 10 ), MAT.metal(), [ x, h, d * 0.4 ], [ PI / 2, 0, 0 ] );
		return g;
	} );
	reg( 'hide', ( s ) => {
		const g = group();
		const geo = new THREE.CircleGeometry( 0.25, 14 );
		const p = geo.attributes.position;
		for ( let i = 1; i < p.count; i ++ ) { const a = Math.atan2( p.getY( i ), p.getX( i ) ); const k = 1 + 0.25 * Math.sin( a * 4 ) + 0.1 * Math.sin( a * 7 ); p.setXY( i, p.getX( i ) * k * 1.3, p.getY( i ) * k ); }
		geo.rotateX( - PI / 2 ); geo.translate( 0, 0.012, 0 );
		add( g, geo, M( s.color ?? 0x6a4a30, { rough: 0.95, side: THREE.DoubleSide } ) );
		add( g, G.rbox( 0.3, 0.012, 0.2, 0.005 ), M( s.color ?? 0x6a4a30, { rough: 0.95 } ) );
		return g;
	} );
	reg( 'stone', ( s ) => {
		const g = group(), r = s.r ?? 0.06;
		const geo = new THREE.IcosahedronGeometry( r, 1 );
		const p = geo.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const k = 0.8 + ( ( Math.sin( p.getX( i ) * 91 + p.getY( i ) * 57 + p.getZ( i ) * 33 ) * 43758.5 ) % 1 + 1 ) % 1 * 0.3; p.setXYZ( i, p.getX( i ) * k * 1.2, p.getY( i ) * k * 0.7, p.getZ( i ) * k ); }
		add( g, facet( geo ), M( s.color ?? 0x4a4644, { rough: 0.95 } ) );
		return ground( g );
	} );
	reg( 'feathers', () => {
		const g = group(), m = M( 0xe8e0d0, { rough: 0.9, side: THREE.DoubleSide } ), d = M( 0x3a3028, { rough: 0.9, side: THREE.DoubleSide } );
		for ( let i = 0; i < 4; i ++ ) {
			const f = new THREE.CircleGeometry( 0.06, 10 ); f.scale( 1.6, 0.35, 1 ); f.rotateX( - PI / 2 );
			add( g, f, i % 2 ? d : m, [ 0, 0.003 + i * 0.002, ( i - 1.5 ) * 0.02 ], [ 0, ( i - 1.5 ) * 0.25, 0 ] );
			add( g, G.cylX( 0.0015, 0.2, 4 ), MAT.white(), [ 0, 0.004 + i * 0.002, ( i - 1.5 ) * 0.02 ], [ 0, ( i - 1.5 ) * 0.25, 0 ] );
		}
		return g;
	} );
	reg( 'bone', () => {
		const g = group(), m = M( 0xe8e0c8, { rough: 0.7 } );
		add( g, G.cylX( 0.012, 0.2, 8 ), m, [ 0, 0.018, 0 ] );
		for ( const x of [ - 0.1, 0.1 ] ) for ( const z of [ - 0.01, 0.01 ] ) add( g, G.sph( 0.017, 8, 6 ), m, [ x, 0.017, z ] );
		return g;
	} );
	reg( 'lei', ( s ) => {
		const g = group();
		const cols = s.colors || [ 0xf2f2ee, 0xf5c542, 0xe8607a ];
		for ( let i = 0; i < 26; i ++ ) {
			const a = i / 26 * PI * 2;
			add( g, G.sph( 0.018, 6, 4 ).scale( 1, 0.6, 1 ), M( cols[ i % cols.length ], { rough: 0.7 } ), [ Math.cos( a ) * 0.13, 0.012, Math.sin( a ) * 0.1 ] );
		}
		return g;
	} );
	reg( 'tiki', () => {
		const g = group(), m = M( 0x6a4428, { rough: 0.85 } ), d = M( 0x2a1a0e, { rough: 0.9 } );
		add( g, G.cyl( 0.05, 0.055, 0.28, 10 ), m );
		add( g, G.box( 0.09, 0.03, 0.06 ), m, [ 0, 0.2, 0.03 ] );
		for ( const x of [ - 0.02, 0.02 ] ) add( g, G.sph( 0.01, 6, 4 ), d, [ x, 0.22, 0.055 ] );
		add( g, G.box( 0.05, 0.015, 0.02 ), d, [ 0, 0.16, 0.05 ] );
		const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
		inner.rotation.z = - PI / 2; g.add( inner );
		return ground( g );
	} );
	reg( 'surfboard', ( s ) => {
		const g = group(), L = s.len ?? 2.1;
		const shape = new THREE.Shape();
		const pts = 18;
		for ( let i = 0; i <= pts; i ++ ) { const t = i / pts, x = ( t - 0.5 ) * L, w = 0.27 * Math.pow( Math.sin( t * PI ), 0.6 ) * ( t > 0.8 ? 1 - ( t - 0.8 ) * 1.5 : 1 ); if ( i === 0 ) shape.moveTo( x, w ); else shape.lineTo( x, w ); }
		for ( let i = pts; i >= 0; i -- ) { const t = i / pts, x = ( t - 0.5 ) * L, w = 0.27 * Math.pow( Math.sin( t * PI ), 0.6 ) * ( t > 0.8 ? 1 - ( t - 0.8 ) * 1.5 : 1 ); shape.lineTo( x, - w ); }
		const geo = new THREE.ExtrudeGeometry( shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 4 } );
		geo.rotateX( - PI / 2 );
		add( g, geo, M( s.color ?? 0xf2ede0, { rough: 0.25 } ), [ 0, 0.012, 0 ] );
		add( g, G.box( L * 0.9, 0.001, 0.02 ), M( s.stripe ?? 0x2a8ad6 ), [ 0, 0.075, 0 ] );
		for ( const z of [ - 0.06, 0, 0.06 ] ) add( g, G.box( 0.1, 0.06, 0.006 ), M( 0x1a1a1a ), [ - L * 0.42, - 0.03, z ] );
		return ground( g );
	} );
	reg( 'bundle', ( s ) => { // campfire kit: sticks tied with a rag
		const g = group(), bark = M( 0x6a4a2e, { rough: 0.95 } );
		for ( let i = 0; i < 6; i ++ ) add( g, G.cylX( 0.015, 0.45, 6 ), bark, [ 0, 0.015 + ( i >= 3 ? 0.026 : 0 ), ( i % 3 - 1 ) * 0.03 + ( i >= 3 ? 0.015 : 0 ) ], [ 0, ( i - 2.5 ) * 0.04, 0 ] );
		for ( const x of [ - 0.12, 0.12 ] ) add( g, G.cylX( 0.048, 0.03, 10 ), M( s.rag ?? 0xd8cfc0, { rough: 0.95 } ), [ x, 0.048, 0.012 ] );
		return g;
	} );
	reg( 'paper', () => {
		const g = group();
		const t = canvasTex( 'newspaper', 256, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#e8e2d2'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#222'; ctx.font = 'bold 28px serif'; ctx.fillText( 'ISLAND NEWS', 18, 34 );
			ctx.font = 'bold 16px serif'; ctx.fillText( 'OUTBREAK SPREADS', 18, 62 );
			ctx.fillStyle = '#555'; for ( let y = 76; y < H - 10; y += 7 ) for ( let c = 0; c < 3; c ++ ) ctx.fillRect( 14 + c * 80, y, 70, 3 );
			ctx.fillStyle = '#888'; ctx.fillRect( 94, 80, 70, 60 );
		} );
		add( g, G.box( 0.3, 0.01, 0.2 ), M( 0xffffff, { map: t, rough: 0.95 } ) );
		return g;
	} );
	reg( 'sparkplug', () => {
		const g = group();
		add( g, G.cylX( 0.009, 0.05, 10 ), MAT.white(), [ - 0.03, 0.011, 0 ] );
		add( g, G.cylX( 0.011, 0.016, 6 ), MAT.metal(), [ 0.0, 0.011, 0 ] );
		add( g, G.cylX( 0.007, 0.025, 10 ), MAT.metal(), [ 0.02, 0.011, 0 ] );
		add( g, G.cylX( 0.003, 0.012, 6 ), MAT.darkMetal(), [ - 0.06, 0.011, 0 ] );
		return g;
	} );
	reg( 'propane', ( s ) => {
		const g = group();
		add( g, G.cyl( 0.055, 0.055, 0.16, 16 ), M( s.color ?? 0x2a6ad6, { rough: 0.35, metal: 0.5 } ) );
		add( g, G.lathe( [ [ 0.055, 0.16 ], [ 0.03, 0.2 ], [ 0.015, 0.21 ] ], 16 ), M( s.color ?? 0x2a6ad6, { rough: 0.35, metal: 0.5 } ) );
		add( g, G.cyl( 0.012, 0.012, 0.03, 10 ), MAT.metal(), [ 0, 0.205, 0 ] );
		return g;
	} );

	// ---- a generic assembly from primitives: parts: [ [ shape, dims, colour, pos?, rot?, { rough, metal } ] ]
	// shape: box [w,h,d] | rbox [w,h,d,r] | cyl [r,h] | cylX [r,len] | sph [r] | torus [R,r]
	reg( 'parts', ( s ) => {
		const g = group();
		for ( const [ shape, d, c, p, r, o ] of s.parts || [] ) {
			const geo = shape === 'box' ? G.box( ...d ) : shape === 'rbox' ? G.rbox( ...d ) : shape === 'cyl' ? G.cyl( d[ 0 ], d[ 2 ] ?? d[ 0 ], d[ 1 ], 14 )
				: shape === 'cylX' ? G.cylX( d[ 0 ], d[ 1 ], 12 ) : shape === 'cylZ' ? G.cylZ( d[ 0 ], d[ 1 ], 12 ) : shape === 'sph' ? G.sph( d[ 0 ], 12, 8 ) : G.torus( d[ 0 ], d[ 1 ], 5, 16 );
			add( g, geo, M( c, { rough: o?.rough ?? 0.6, metal: o?.metal ?? 0, emissive: o?.emissive } ), p, r );
		}
		return s.ground === false ? g : ground( g );
	} );
}

export { css };
