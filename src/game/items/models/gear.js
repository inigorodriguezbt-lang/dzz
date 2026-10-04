// Medical supplies, tools, vehicle parts, materials and odds and ends.
// Printed packaging (pill bottle labels, aerosol wraps, kit patches) comes from pack.js.
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, fabric, labelTex, labelUV, canvasTex, worldTex, shade, css, facet, hashStr, glyph } from './lib.js';
import { packInfo, wrapTex, panelTex, boxAtlas, boxUV, ridged, tubeTex, tubeUV, rrect, text as ptext, barcode, rng, screenMat, holdUpright } from './pack.js';

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
		return holdUpright( g, h, r, { view: [ 0.13, - 0.12, - 0.3 ] } );
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
			add( g, G.capsX( 0.0042, 0.013, 6, 2 ), pill, [ x, 0.0055, z ] );
			add( g, G.capsX( 0.0058, 0.016, 8, 2 ).scale( 1, 0.95, 1 ), dome, [ x, 0.0058, z ] );
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
			// two zip sliders with short cord pulls lying along the zip
			for ( const x of [ - w * 0.2, w * 0.3 ] ) { add( g, G.box( 0.012, 0.004, 0.008 ), MAT.darkMetal(), [ x, h * 0.62, d * 0.49 ] ); add( g, G.box( 0.018, 0.003, 0.004 ), MAT.rubber(), [ x + 0.014, h * 0.62 + 0.001, d * 0.49 ] ); }
			// MOLLE webbing across the back (as many rows as the flat of the back has room for), two straps down the front
			const web = fabric( shade( c, - 0.2 ), 'weave', shade( c, - 0.32 ), { rep: 6, rough: 0.95 } );
			const rr = h * 0.38, rows = Math.floor( ( h - rr * 1.6 ) / 0.022 );
			for ( let i = 0; i < rows; i ++ ) add( g, G.box( w * 0.86, 0.014, 0.0025 ), web, [ 0, rr * 0.8 + i * 0.022, - d / 2 - 0.0004 ] );
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
		add( g, G.box( 0.012, 0.0026, r * 2.9 ), M( shade( spec.bg ?? 0xffffff, - 0.06 ), { rough: 0.5 } ), [ - L * 0.06 - bodyL / 2 - 0.004, r - 0.0013, 0 ] );
		for ( let i = 0; i < 9; i ++ ) add( g, G.box( 0.0008, 0.003, r * 2.85 ), M( shade( spec.bg ?? 0xffffff, - 0.25 ) ), [ - L * 0.06 - bodyL / 2 - 0.0095 + i * 0.0012, r - 0.0015, 0 ] );
		// the shoulder, the neck and the knurled cap
		add( g, G.cylX( r * 0.98, 0.006, 18, r * 0.5 ), M( spec.bg ?? 0xffffff, { rough: 0.35 } ), [ - L * 0.06 + bodyL / 2 + 0.003, r, 0 ] );
		const cap = ridged( r * 0.62, L * 0.12, 14, 0.06 ).rotateZ( - PI / 2 );
		add( g, cap, M( s.cap ?? 0x2a2a2a, { rough: 0.45 } ), [ - L * 0.06 + bodyL / 2 + 0.006, r, 0 ] );
		return ground( g, false );
	} );

	reg( 'ivbag', ( s, def ) => {
		if ( s.style === 'bladder' ) return bladder( s );
		const g = group(), W = 0.13, Ln = 0.2, c = s.color ?? 0x9a1a1a;
		// the bag lies flat: welded rim, the fluid pillow inside it, the printed scale, the hanger tab and two ports
		const bag = G.rbox( Ln * 0.9, 0.022, W * 0.88, 0.011, 3 );
		add( g, bag, M( c, { rough: 0.12, transparent: true, opacity: 0.8 } ), [ 0, 0.001, 0 ] );
		const film = M( 0xe8eef0, { rough: 0.2, transparent: true, opacity: 0.55 } );
		add( g, G.rbox( Ln, 0.0018, W, 0.006, 1 ), film );
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
		add( g, G.box( 0.02, 0.0016, 0.03 ), film, [ - Ln / 2 - 0.008, 0, 0 ] );
		add( g, new THREE.TorusGeometry( 0.006, 0.0012, 4, 12 ).rotateX( PI / 2 ), MAT.white(), [ - Ln / 2 - 0.008, 0.0012, 0 ] );
		for ( const z of [ - 0.018, 0.018 ] ) {
			add( g, G.cylX( 0.003, 0.03, 8 ), M( 0xf2f2ee, { rough: 0.4 } ), [ Ln / 2 + 0.012, 0.004, z ] );
			add( g, G.cylX( 0.0042, 0.008, 10 ), M( z < 0 ? 0x2a6ad6 : 0xf2f2ee, { rough: 0.45 } ), [ Ln / 2 + 0.03, 0.004, z ] );
		}
		if ( s.tube !== false ) add( g, G.tube( [ [ Ln / 2 + 0.03, 0.004, 0.018 ], [ Ln / 2 + 0.07, 0.003, 0.04 ], [ Ln / 2 + 0.05, 0.003, 0.08 ], [ Ln / 2 - 0.02, 0.003, 0.085 ] ], 0.0022, 16, 5 ), film );
		return g;
	} );

	// a hydration reservoir lying flat: the tinted bag with water in it, the wide screw cap and its handle bar, the
	// hose out of the bottom with the bite valve, printed fill marks
	function bladder( s ) {
		const g = group(), c = s.color ?? 0x3a8ad6, Ln = 0.32, W = 0.18;
		const bag = organicPillow( Ln, W, 0.035 );
		add( g, bag, M( c, { rough: 0.12, transparent: true, opacity: 0.55 } ) );
		add( g, organicPillow( Ln * 0.9, W * 0.86, 0.028 ), M( 0xbfe0f0, { rough: 0.05, transparent: true, opacity: 0.35 } ), [ 0.01, 0.002, 0 ] );
		add( g, G.box( Ln * 0.98, 0.003, 0.014 ), M( shade( c, - 0.2 ), { rough: 0.4 } ), [ 0, 0.001, W / 2 - 0.006 ] );
		const marks = canvasTex( 'bladder-marks', 256, 64, ( ctx, Wd, H ) => {
			ctx.clearRect( 0, 0, Wd, H ); ctx.fillStyle = '#e8f4fa'; ctx.fillRect( 0, 0, Wd, H );
			ctx.fillStyle = '#1a3a5a'; for ( let i = 1; i <= 4; i ++ ) { const x = Wd * ( 0.1 + i * 0.18 ); ctx.fillRect( x, H * 0.2, 2, H * 0.4 ); ptext( ctx, `${( i * 0.5 ).toFixed( 1 )} L`, x, H * 0.78, 40, 13, { color: '#1a3a5a' } ); }
			ptext( ctx, 'MAUKA · 2 L', Wd * 0.12, H * 0.4, 50, 12, { weight: '900', color: '#1a3a5a' } );
		} );
		add( g, G.box( Ln * 0.5, 0.0006, 0.035 ), printed( marks, { rough: 0.5 } ), [ 0.02, 0.0365, 0.03 ] );
		// the wide cap at one end, the slide bar at the other
		add( g, ridged( 0.032, 0.012, 20, 0.04 ), M( 0x1e1f22, { rough: 0.5 } ), [ - Ln * 0.3, 0.026, 0 ] );
		add( g, G.box( 0.012, 0.012, W * 0.9 ), M( 0x1e1f22, { rough: 0.5 } ), [ Ln / 2 - 0.006, 0.006, 0 ] );
		add( g, G.tube( [ [ - Ln / 2 + 0.02, 0.01, - W * 0.35 ], [ - Ln / 2 - 0.04, 0.008, - W * 0.4 ], [ - Ln / 2 - 0.05, 0.006, - W * 0.1 ], [ - Ln / 2 - 0.02, 0.006, W * 0.25 ], [ - Ln / 2 + 0.06, 0.006, W * 0.42 ] ], 0.005, 30, 6 ), MAT.glass( 0xd8eef8, 0.55 ) );
		add( g, G.cylX( 0.007, 0.03, 10, 0.006 ), M( 0x1e1f22, { rough: 0.6 } ), [ - Ln / 2 + 0.075, 0.006, W * 0.42 ] );
		return ground( g );
	}
	// a soft flat bag: rounded corners, puffed in the middle
	function organicPillow( L, W, T ) {
		const geo = G.rbox( L, T, W, T * 0.48, 3 );
		const p = geo.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ) / ( L / 2 ), z = p.getZ( i ) / ( W / 2 ), k = Math.max( 0.15, 1 - Math.pow( Math.max( Math.abs( x ), Math.abs( z ) ), 6 ) ); p.setY( i, p.getY( i ) * k ); }
		geo.computeVertexNormals();
		return geo;
	}

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
		return holdUpright( g, h, r );
	} );

	// ================= tools =================
	// a lathe profile turned about x instead of y: pts [ radius, x ]
	const latheX = ( pts, seg = 20 ) => G.lathe( pts, seg ).rotateZ( - PI / 2 );
	// diamond knurling (grips, bezels, wheels)
	const knurl = ( c, rep = 6 ) => {
		const t = canvasTex( 'knurl:' + c, 64, 64, ( ctx, W ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, W );
			ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
			for ( let i = - W; i < W * 2; i += 8 ) { ctx.beginPath(); ctx.moveTo( i, 0 ); ctx.lineTo( i + W, W ); ctx.stroke(); ctx.beginPath(); ctx.moveTo( i, W ); ctx.lineTo( i + W, 0 ); ctx.stroke(); }
			ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
			for ( let i = - W; i < W * 2; i += 8 ) { ctx.beginPath(); ctx.moveTo( i + 2, 0 ); ctx.lineTo( i + 2 + W, W ); ctx.stroke(); }
		}, { repeat: true } ).clone();
		t.repeat.set( rep, rep * 0.6 ); t.needsUpdate = true;
		return t;
	};
	// a little printed screen / face
	const screenTex = ( key, w, h, draw ) => canvasTex( 'screen:' + key, w, h, draw );

	reg( 'flashlight', ( s ) => {
		const g = group(), L = s.len ?? 0.2, c = s.color ?? 0x1c1c1e;
		const alu = M( c, { rough: 0.38, metal: 0.75 } );
		const x0 = - L / 2;
		// tail cap, body tube, the flared head and its crenellated bezel
		add( g, latheX( [ [ 0, x0 ], [ 0.0095, x0 ], [ 0.0128, x0 + 0.003 ], [ 0.0132, x0 + 0.022 ], [ 0.0122, x0 + 0.024 ], [ 0.0122, x0 + L * 0.68 ], [ 0.0132, x0 + L * 0.7 ], [ 0.0188, x0 + L * 0.84 ], [ 0.0198, x0 + L * 0.86 ], [ 0.0198, x0 + L * 0.985 ], [ 0.0185, x0 + L ], [ 0.0168, x0 + L ], [ 0.0166, x0 + L * 0.99 ] ], 24 ), alu, [ 0, 0.02, 0 ] );
		add( g, G.cylX( 0.0124, L * 0.36, 24 ), M( 0xffffff, { map: knurl( c, 8 ), rough: 0.5, metal: 0.7 } ), [ x0 + L * 0.36, 0.02, 0 ] );
		for ( let i = 0; i < 3; i ++ ) add( g, G.cylX( 0.0134, 0.0018, 24 ), alu, [ x0 + L * ( 0.07 + i * 0.022 ), 0.02, 0 ] );
		// lens over the faceted reflector and the LED
		add( g, latheX( [ [ 0.0166, x0 + L * 0.99 ], [ 0.012, x0 + L * 0.95 ], [ 0.004, x0 + L * 0.92 ], [ 0, x0 + L * 0.92 ] ], 18 ), M( 0xe8ecf0, { rough: 0.08, metal: 1 } ), [ 0, 0.02, 0 ] );
		add( g, G.cylX( 0.0028, 0.002, 10 ), M( 0xfff8e0, { rough: 0.2, emissive: 0xfff2d0, emissiveIntensity: s.on ? 2 : 0.15 } ), [ x0 + L * 0.925, 0.02, 0 ] );
		add( g, G.cylX( 0.0166, 0.0012, 24 ), MAT.glass( 0xe8f4ff, 0.22 ), [ x0 + L * 0.99, 0.02, 0 ] );
		// the tail switch, the pocket clip, a lanyard ring
		add( g, G.dome( 0.006, 12, 5 ).rotateZ( PI / 2 ), MAT.rubber(), [ x0, 0.02, 0 ] );
		add( g, G.box( L * 0.38, 0.0012, 0.006 ), M( 0x2a2c30, { rough: 0.3, metal: 0.9 } ), [ x0 + L * 0.27, 0.0335, 0 ] );
		add( g, G.box( 0.006, 0.006, 0.006 ), M( 0x2a2c30, { rough: 0.3, metal: 0.9 } ), [ x0 + L * 0.07, 0.0305, 0 ] );
		add( g, new THREE.TorusGeometry( 0.006, 0.0012, 4, 12 ), M( 0x9ea3aa, { rough: 0.3, metal: 0.9 } ), [ x0 - 0.004, 0.012, 0 ], [ 0, PI / 2, 0 ] );
		return ground( g );
	} );

	reg( 'headlamp', ( s ) => {
		const g = group(), body = M( s.body ?? 0xd8d020, { rough: 0.4 } ), blk = MAT.blackPlastic();
		// the elastic strap, flattened into an oval loop, with its woven print
		const strapTex = canvasTex( 'headlamp-strap:' + ( s.color ?? 0x2a2a2a ), 256, 32, ( ctx, W, H ) => {
			ctx.fillStyle = css( s.color ?? 0x2a2a2a ); ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = 'rgba(255,255,255,0.08)'; for ( let x = 0; x < W; x += 3 ) ctx.fillRect( x, 0, 1, H );
			ctx.fillStyle = css( s.body ?? 0xd8d020 ); ctx.fillRect( 0, H * 0.42, W, H * 0.16 );
			for ( const x of [ W * 0.25, W * 0.75 ] ) ptext( ctx, 'MAKA', x, H * 0.5, W * 0.2, H * 0.55, { weight: '900', color: '#e8e8e2' } );
		}, { repeat: true } ).clone();
		strapTex.repeat.set( 2, 1 ); strapTex.needsUpdate = true;
		const strap = new THREE.CylinderGeometry( 0.075, 0.075, 0.026, 40, 1, true ).scale( 1.15, 1, 0.8 );
		add( g, strap, M( 0xffffff, { map: strapTex, rough: 0.9 } ), [ 0, 0.013, 0 ] );
		add( g, new THREE.CylinderGeometry( 0.0745, 0.0745, 0.026, 40, 1, true ).scale( 1.15, 1, 0.8 ), M( shade( s.color ?? 0x2a2a2a, - 0.2 ), { rough: 0.95, side: THREE.BackSide } ), [ 0, 0.013, 0 ] );
		add( g, G.rbox( 0.014, 0.022, 0.03, 0.004 ), blk, [ - 0.088, 0.002, 0 ] );
		// the lamp: housing on its tilt bracket, a big round lens, the button on top
		const lamp = group();
		add( lamp, G.rbox( 0.026, 0.034, 0.05, 0.009, 2 ), body, [ 0, 0, 0 ] );
		add( lamp, G.cylX( 0.0135, 0.008, 22 ), blk, [ 0.016, 0.017, - 0.006 ] );
		add( lamp, latheX( [ [ 0.0118, 0.019 ], [ 0.006, 0.014 ], [ 0, 0.013 ] ], 18 ), M( 0xe8ecf0, { rough: 0.08, metal: 1 } ), [ 0, 0.017, - 0.006 ] );
		add( lamp, G.cylX( 0.0118, 0.001, 22 ), MAT.glass( 0xf0f8ff, 0.25 ), [ 0.0198, 0.017, - 0.006 ] );
		add( lamp, G.cylX( 0.0045, 0.006, 12 ), M( 0xd02a2a, { rough: 0.5 } ), [ 0.014, 0.017, 0.016 ] );
		add( lamp, G.rbox( 0.012, 0.004, 0.016, 0.0018 ), blk, [ 0.0, 0.034, 0.004 ] );
		lamp.position.set( 0.084, 0, 0 );
		g.add( lamp );
		return ground( g );
	} );

	reg( 'lantern', ( s ) => {
		const g = group(), c = s.color ?? 0x2a5a3a;
		if ( s.style === 'kerosene' ) {
			const brass = M( 0xc8a24a, { rough: 0.3, metal: 0.9 } ), tin = M( c, { rough: 0.45, metal: 0.6 } );
			add( g, G.lathe( [ [ 0, 0 ], [ 0.06, 0 ], [ 0.068, 0.02 ], [ 0.062, 0.045 ], [ 0.03, 0.055 ] ], 22 ), tin );
			add( g, G.lathe( [ [ 0.022, 0.055 ], [ 0.04, 0.08 ], [ 0.045, 0.13 ], [ 0.036, 0.165 ], [ 0.022, 0.175 ] ], 22 ), MAT.glass( 0xfff2d0, 0.28 ) );
			add( g, G.cyl( 0.003, 0.003, 0.02, 6 ), M( 0x2a2016, { emissive: 0xff8a2a, emissiveIntensity: s.lit ? 2 : 0 } ), [ 0, 0.06, 0 ] );
			for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2 + PI / 4; add( g, G.tube( [ [ Math.cos( a ) * 0.045, 0.05, Math.sin( a ) * 0.045 ], [ Math.cos( a ) * 0.052, 0.11, Math.sin( a ) * 0.052 ], [ Math.cos( a ) * 0.03, 0.18, Math.sin( a ) * 0.03 ] ], 0.002, 8, 4 ), tin ); }
			add( g, G.lathe( [ [ 0.01, 0.175 ], [ 0.04, 0.18 ], [ 0.03, 0.205 ], [ 0.012, 0.21 ] ], 18 ), tin );
			add( g, new THREE.TorusGeometry( 0.05, 0.0022, 4, 18, PI ), MAT.metal(), [ 0, 0.2, 0 ] );
			add( g, G.cylZ( 0.006, 0.012, 10 ), brass, [ 0.04, 0.035, 0.04 ] );
			return g;
		}
		// an LED camping lantern: the ribbed battery base, a frosted globe round the LED column, the cap, the bail
		const shell = M( c, { rough: 0.45 } ), blk = M( 0x1e1f22, { rough: 0.6 } );
		add( g, G.lathe( [ [ 0, 0.002 ], [ 0.055, 0 ], [ 0.062, 0.006 ], [ 0.064, 0.04 ], [ 0.058, 0.05 ], [ 0.05, 0.052 ] ], 26 ), shell );
		add( g, ridged( 0.0655, 0.012, 26, 0.04 ), blk, [ 0, 0.012, 0 ] );
		add( g, G.lathe( [ [ 0.046, 0.052 ], [ 0.05, 0.065 ], [ 0.05, 0.135 ], [ 0.046, 0.148 ] ], 26 ), M( 0xf6f2e6, { rough: 0.3, transparent: true, opacity: 0.6, emissive: 0xfff0c8, emissiveIntensity: s.lit ? 1.5 : 0.08 } ) );
		add( g, G.cyl( 0.012, 0.012, 0.09, 12 ), M( 0xf0eee4, { rough: 0.4, emissive: 0xfff0c0, emissiveIntensity: s.lit ? 2 : 0.05 } ), [ 0, 0.054, 0 ] );
		for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2 + PI / 4; add( g, G.cyl( 0.004, 0.004, 0.098, 6 ), shell, [ Math.cos( a ) * 0.05, 0.05, Math.sin( a ) * 0.05 ] ); }
		add( g, G.lathe( [ [ 0.045, 0.146 ], [ 0.058, 0.15 ], [ 0.056, 0.168 ], [ 0.04, 0.178 ], [ 0.02, 0.18 ], [ 0, 0.18 ] ], 26 ), shell );
		add( g, G.cyl( 0.012, 0.012, 0.004, 14 ), M( 0xd8d020, { rough: 0.4 } ), [ 0, 0.18, 0 ] );
		add( g, G.tube( [ [ - 0.045, 0.165, 0 ], [ - 0.04, 0.22, 0 ], [ 0, 0.235, 0 ], [ 0.04, 0.22, 0 ], [ 0.045, 0.165, 0 ] ], 0.0028, 20, 6 ), blk );
		for ( const x of [ - 0.047, 0.047 ] ) add( g, G.cylX( 0.005, 0.006, 10 ), blk, [ x, 0.165, 0 ] );
		add( g, G.rbox( 0.016, 0.01, 0.006, 0.002 ), blk, [ 0, 0.025, 0.064 ] );
		return g;
	} );

	reg( 'lighter', ( s ) => {
		const g = group();
		if ( s.style === 'zippo' ) {
			// the brushed steel case, its lid seam and the hinge barrel down one side
			const brushed = canvasTex( 'brushed', 128, 128, ( ctx, W ) => {
				ctx.fillStyle = '#c8ccd2'; ctx.fillRect( 0, 0, W, W );
				const r = rng( 3 );
				for ( let i = 0; i < 120; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.03)'; ctx.fillRect( 0, r() * W, W, 1 ); }
			}, { repeat: true } );
			const steel = M( 0xffffff, { map: brushed, rough: 0.42, metal: 1 } );
			add( g, G.rbox( 0.038, 0.037, 0.013, 0.0035, 2 ), steel );
			add( g, G.rbox( 0.038, 0.019, 0.013, 0.0035, 2 ), steel, [ 0, 0.0375, 0 ] );
			add( g, G.box( 0.0384, 0.0005, 0.0132 ), M( 0x2a2c30, { metal: 0.8, rough: 0.4 } ), [ 0, 0.037, 0 ] );
			add( g, G.cyl( 0.0016, 0.0016, 0.022, 8 ), steel, [ 0.0195, 0.026, - 0.0055 ] );
			// an engraved emblem
			add( g, G.cylZ( 0.006, 0.0004, 16 ), M( 0x9a9ea4, { rough: 0.45, metal: 0.9 } ), [ 0, 0.02, 0.0067 ] );
		} else {
			// a disposable: the translucent body (fuel showing), the metal hood, the spark wheel and the fork
			const c = s.color ?? 0xd02a6a;
			const body = new THREE.CylinderGeometry( 0.0125, 0.0125, 0.068, 22 ).scale( 1, 1, 0.52 ).translate( 0, 0.034, 0 );
			add( g, body, M( c, { rough: 0.18, transparent: true, opacity: 0.88 } ) );
			add( g, new THREE.CylinderGeometry( 0.0108, 0.0108, 0.048, 18 ).scale( 1, 1, 0.48 ).translate( 0, 0.024, 0 ), M( shade( c, - 0.25 ), { rough: 0.2 } ), [ 0, 0.002, 0 ] );
			add( g, G.box( 0.0245, 0.003, 0.0126 ), M( shade( c, - 0.2 ), { rough: 0.4 } ), [ 0, 0.067, 0 ] );
			add( g, G.box( 0.022, 0.013, 0.0108 ), M( 0xc8ccd0, { rough: 0.3, metal: 0.9 } ), [ 0.0005, 0.069, 0 ] );
			for ( let i = 0; i < 3; i ++ ) add( g, G.cylZ( 0.0012, 0.0112, 6 ), M( 0x1a1a1a ), [ - 0.006 + i * 0.006, 0.078, 0 ] );
			add( g, ridged( 0.0048, 0.0085, 12, 0.12 ).rotateX( PI / 2 ), M( 0x8a8e94, { rough: 0.4, metal: 0.9 } ), [ 0.004, 0.0825, 0.0042 ] );
			add( g, G.rbox( 0.012, 0.005, 0.0095, 0.0015 ), M( 0x1a1a1a, { rough: 0.5 } ), [ - 0.0055, 0.0805, 0 ] );
		}
		// lying down on its side
		const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
		inner.rotation.z = - PI / 2; g.add( inner );
		return ground( g );
	} );

	reg( 'canopener', () => {
		const g = group(), steel = M( 0xc0c4ca, { rough: 0.25, metal: 0.95 } ), grip = M( 0x1e1f22, { rough: 0.55 } );
		// two moulded handles, slightly splayed
		for ( const z of [ - 1, 1 ] ) {
			const h = new THREE.CapsuleGeometry( 0.008, 0.11, 4, 10 ).rotateZ( PI / 2 ).scale( 1, 0.75, 1 );
			add( g, h, grip, [ - 0.035, 0.007, z * 0.012 ], [ 0, z * 0.07, 0 ] );
			add( g, G.box( 0.04, 0.006, 0.01 ), steel, [ 0.04, 0.008, z * 0.008 ] );
		}
		// the cutting wheel, the drive gear, and the butterfly key on top
		add( g, G.cyl( 0.011, 0.011, 0.0025, 20 ), steel, [ 0.06, 0.012, 0.004 ] );
		add( g, ridged( 0.009, 0.004, 14, 0.15 ), steel, [ 0.06, 0.004, - 0.006 ] );
		add( g, G.cyl( 0.004, 0.004, 0.012, 10 ), steel, [ 0.06, 0.014, 0 ] );
		const key = new THREE.Shape();
		key.moveTo( - 0.022, - 0.006 ); key.quadraticCurveTo( - 0.03, 0, - 0.022, 0.006 ); key.lineTo( 0.022, 0.006 ); key.quadraticCurveTo( 0.03, 0, 0.022, - 0.006 ); key.closePath();
		add( g, new THREE.ExtrudeGeometry( key, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 6 } ).rotateX( - PI / 2 ), grip, [ 0.06, 0.02, 0 ], [ 0, 0.5, 0 ] );
		return ground( g );
	} );

	reg( 'compass', ( s ) => {
		// an orienteering compass: the clear baseplate with its rulers, the turning bezel, the capsule and the needle
		const g = group(), c = s.color ?? 0x3a4a2a;
		const plate = screenTex( 'compass-plate', 256, 384, ( ctx, W, H ) => {
			ctx.clearRect( 0, 0, W, H ); ctx.fillStyle = 'rgba(230,240,240,0.35)'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#c0282a'; ctx.beginPath(); ctx.moveTo( W / 2, 10 ); ctx.lineTo( W / 2 + 14, 70 ); ctx.lineTo( W / 2 - 14, 70 ); ctx.fill();
			ctx.fillRect( W / 2 - 2, 70, 4, 60 );
			ctx.fillStyle = '#111';
			for ( let i = 0; i < 40; i ++ ) ctx.fillRect( 6, 20 + i * 8.5, i % 5 ? 8 : 16, 1.5 );
			for ( let i = 0; i < 4; i ++ ) ptext( ctx, String( i + 1 ), 34, 20 + i * 85 + 42, 20, 14, { color: '#111' } );
			ptext( ctx, 'MAKANI · ORIENTEER', W / 2, H - 22, W * 0.7, 16, { color: '#111' } );
		} );
		add( g, G.rbox( 0.06, 0.003, 0.11, 0.008, 2 ), M( 0xffffff, { map: plate, rough: 0.05, transparent: true, opacity: 0.85 } ), [ 0, 0, 0.01 ] );
		const face = screenTex( 'compass-face2', 256, 256, ( ctx, W ) => {
			ctx.fillStyle = '#e8e4d4'; ctx.fillRect( 0, 0, W, W );
			ctx.fillStyle = css( c ); ctx.beginPath(); ctx.arc( W / 2, W / 2, W / 2, 0, PI * 2 ); ctx.fill();
			ctx.fillStyle = '#f4f2ea'; ctx.beginPath(); ctx.arc( W / 2, W / 2, W * 0.36, 0, PI * 2 ); ctx.fill();
			ctx.strokeStyle = '#f2f2ea'; ctx.lineWidth = 2;
			for ( let i = 0; i < 72; i ++ ) { const a = i / 72 * PI * 2, r0 = i % 2 ? W * 0.44 : W * 0.41; ctx.beginPath(); ctx.moveTo( W / 2 + Math.sin( a ) * r0, W / 2 - Math.cos( a ) * r0 ); ctx.lineTo( W / 2 + Math.sin( a ) * W * 0.48, W / 2 - Math.cos( a ) * W * 0.48 ); ctx.stroke(); }
			[ 'N', 'E', 'S', 'W' ].forEach( ( l, i ) => { const a = i * PI / 2; ptext( ctx, l, W / 2 + Math.sin( a ) * W * 0.29, W / 2 - Math.cos( a ) * W * 0.29, 30, 26, { weight: '900', color: i ? '#222' : '#c0282a' } ); } );
			ctx.strokeStyle = 'rgba(192,40,42,0.7)'; ctx.lineWidth = 2;
			for ( let k = - 2; k <= 2; k ++ ) { ctx.beginPath(); ctx.moveTo( W / 2 + k * 18, W * 0.2 ); ctx.lineTo( W / 2 + k * 18, W * 0.8 ); ctx.stroke(); }
			ctx.fillStyle = '#c0282a'; ctx.beginPath(); ctx.moveTo( W / 2, W * 0.18 ); ctx.lineTo( W / 2 + 10, W / 2 ); ctx.lineTo( W / 2 - 10, W / 2 ); ctx.fill();
			ctx.fillStyle = '#f2f2ea'; ctx.beginPath(); ctx.moveTo( W / 2, W * 0.82 ); ctx.lineTo( W / 2 + 10, W / 2 ); ctx.lineTo( W / 2 - 10, W / 2 ); ctx.fill();
			ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc( W / 2, W / 2, 5, 0, PI * 2 ); ctx.fill();
		} );
		add( g, ridged( 0.025, 0.007, 30, 0.05 ), M( c, { rough: 0.5 } ), [ 0, 0.003, - 0.012 ] );
		add( g, new THREE.CircleGeometry( 0.0248, 30 ).rotateX( - PI / 2 ), M( 0xffffff, { map: face, rough: 0.4 } ), [ 0, 0.0101, - 0.012 ] );
		add( g, G.dome( 0.02, 18, 4 ).scale( 1, 0.12, 1 ), MAT.glass( 0xffffff, 0.18 ), [ 0, 0.0102, - 0.012 ] );
		add( g, new THREE.TorusGeometry( 0.006, 0.0014, 4, 12 ), M( 0x1a1a1a ), [ 0, 0.0015, 0.069 ], [ PI / 2, 0, 0 ] );
		add( g, G.tube( [ [ 0, 0.0015, 0.075 ], [ 0.01, 0.0015, 0.1 ], [ - 0.01, 0.0015, 0.13 ], [ 0.02, 0.0015, 0.15 ] ], 0.0015, 14, 4 ), M( 0xd02a2a, { rough: 0.8 } ) );
		ground( g );
		// held out flat on the palm, its face up to the eye, the plate's arrow pointing away
		g.userData.hold = { p: [ 0, 0.003, 0.03 ], a: [ 0, 0, - 1 ], f: [ 0, 1, 0 ], r: 0.012 };
		g.userData.view = { at: [ 0.07, - 0.1, - 0.29 ], axis: [ 0, 0.45, - 1 ], front: [ 0, 1, 0.45 ] };
		return g;
	} );

	reg( 'map', () => {
		const g = group();
		const t = canvasTex( 'map-hawaii2', 768, 384, ( ctx, W, H ) => {
			const sea = ctx.createLinearGradient( 0, 0, W, H ); sea.addColorStop( 0, '#a9d3e4' ); sea.addColorStop( 1, '#8cc0d8' );
			ctx.fillStyle = sea; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = 'rgba(40,80,110,0.25)'; ctx.lineWidth = 1;
			for ( let x = 0; x < W; x += 48 ) { ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.lineTo( x, H ); ctx.stroke(); }
			for ( let y = 0; y < H; y += 48 ) { ctx.beginPath(); ctx.moveTo( 0, y ); ctx.lineTo( W, y ); ctx.stroke(); }
			// the chain, roughly: Niʻihau, Kauaʻi, Oʻahu, Molokaʻi, Lānaʻi, Maui, Kahoʻolawe, Hawaiʻi
			const isl = [ [ 50, 90, 14, 20, 'NIʻIHAU' ], [ 115, 75, 40, 34, 'KAUAʻI' ], [ 285, 140, 48, 34, 'OʻAHU' ], [ 400, 160, 50, 12, 'MOLOKAʻI' ], [ 410, 198, 17, 13, '' ], [ 492, 196, 50, 32, 'MAUI' ], [ 470, 236, 14, 9, '' ], [ 640, 300, 92, 82, 'HAWAIʻI' ] ];
			const r = rng( 21 );
			for ( const [ x, y, rx, ry, name ] of isl ) {
				for ( const [ k, col ] of [ [ 1.12, '#f0e6c0' ], [ 1, '#9cc47a' ], [ 0.7, '#7aac5c' ], [ 0.42, '#c8b27a' ], [ 0.2, '#a08860' ] ] ) {
					ctx.fillStyle = col; ctx.beginPath();
					for ( let i = 0; i < 24; i ++ ) { const a = i / 24 * PI * 2, w = 1 + Math.sin( a * 3 + x ) * 0.12 + ( r() - 0.5 ) * 0.06; ctx.lineTo( x + Math.cos( a ) * rx * k * w, y + Math.sin( a ) * ry * k * w ); }
					ctx.fill();
				}
				if ( name ) ptext( ctx, name, x, y + ry + 16, 140, 13, { weight: 'bold', color: '#23374a' } );
			}
			// roads and towns
			ctx.strokeStyle = '#c03a2a'; ctx.lineWidth = 2.5;
			ctx.beginPath(); ctx.ellipse( 285, 140, 36, 22, 0.1, 0, PI * 2 ); ctx.stroke();
			ctx.beginPath(); ctx.ellipse( 640, 300, 70, 62, 0, 0, PI * 2 ); ctx.stroke();
			ctx.fillStyle = '#222'; for ( const [ x, y ] of [ [ 300, 158 ], [ 262, 128 ], [ 600, 262 ], [ 700, 330 ], [ 500, 190 ] ] ) { ctx.beginPath(); ctx.arc( x, y, 3.5, 0, PI * 2 ); ctx.fill(); }
			// the title panel, the legend and the compass rose
			ctx.fillStyle = '#f6f0dc'; ctx.fillRect( 16, H - 104, 220, 88 ); ctx.strokeStyle = '#23374a'; ctx.lineWidth = 2; ctx.strokeRect( 16, H - 104, 220, 88 );
			ptext( ctx, 'HAWAIʻI', 126, H - 80, 200, 30, { weight: '900', family: 'Georgia, serif', color: '#23374a' } );
			ptext( ctx, 'ROAD & RECREATION MAP', 126, H - 52, 200, 13, { color: '#23374a' } );
			ctx.fillStyle = '#c03a2a'; ctx.fillRect( 34, H - 36, 40, 4 ); ptext( ctx, 'Highway', 110, H - 34, 80, 11, { color: '#222' } );
			ctx.save(); ctx.translate( W - 50, 50 ); ctx.fillStyle = '#23374a'; ctx.beginPath(); ctx.moveTo( 0, - 30 ); ctx.lineTo( 8, 0 ); ctx.lineTo( 0, 30 ); ctx.lineTo( - 8, 0 ); ctx.fill(); ptext( ctx, 'N', 0, - 40, 20, 14, { weight: '900', color: '#23374a' } ); ctx.restore();
		} );
		// a folded map: accordion panels, the creases catching the light
		const W = 0.26, D = 0.14, n = 4, pos = [], uv = [], idx = [];
		for ( let i = 0; i <= n * 6; i ++ ) {
			const f = i / ( n * 6 ), x = ( f - 0.5 ) * W, k = ( i % 6 ) / 6;
			const y = 0.004 + Math.abs( Math.sin( f * n * PI ) ) * 0.006 + ( i % 6 === 0 ? 0 : 0.0006 ) * Math.sin( k * PI );
			for ( let j = 0; j <= 1; j ++ ) { pos.push( x, y, ( j - 0.5 ) * D ); uv.push( f, 1 - j ); }
		}
		for ( let i = 0; i < n * 6; i ++ ) { const a = i * 2; idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 ); }
		const sheet = new THREE.BufferGeometry();
		sheet.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) ); sheet.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
		sheet.setIndex( idx ); sheet.computeVertexNormals();
		add( g, sheet, M( 0xffffff, { map: t, rough: 0.85, side: THREE.DoubleSide } ) );
		add( g, G.box( W, 0.004, D ), M( 0xece4cc, { rough: 0.95 } ) );
		return g;
	} );

	reg( 'binoculars', ( s ) => {
		// roof-prism binoculars: two armoured barrels on a centre hinge, the focus wheel, twist-up eyecups, coated lenses
		const g = group(), c = s.color ?? 0x2a2a2a;
		const armour = M( 0xffffff, { map: knurl( c, 3 ), rough: 0.85 } ), body = M( c, { rough: 0.6 } );
		for ( const z of [ - 0.034, 0.034 ] ) {
			add( g, latheX( [ [ 0.024, - 0.06 ], [ 0.026, - 0.045 ], [ 0.026, 0.03 ], [ 0.03, 0.05 ], [ 0.031, 0.068 ], [ 0.028, 0.07 ] ], 22 ), body, [ 0, 0.031, z ] );
			add( g, G.cylX( 0.0262, 0.06, 22 ), armour, [ - 0.01, 0.031, z ] );
			add( g, G.cylX( 0.026, 0.002, 22 ), M( 0x0a0e10, { rough: 0.1 } ), [ 0.069, 0.031, z ] );
			add( g, G.dome( 0.024, 20, 6 ).scale( 1, 0.25, 1 ).rotateZ( - PI / 2 ), M( 0x2a6a5a, { rough: 0.03, metal: 0.6 } ), [ 0.069, 0.031, z ] );
			// eyecups
			add( g, latheX( [ [ 0.016, - 0.085 ], [ 0.019, - 0.083 ], [ 0.019, - 0.063 ], [ 0.022, - 0.058 ] ], 18 ), MAT.rubber(), [ 0, 0.031, z * 0.9 ] );
			add( g, G.cylX( 0.012, 0.002, 16 ), M( 0x1a3a4a, { rough: 0.05, metal: 0.6 } ), [ - 0.084, 0.031, z * 0.9 ] );
		}
		// the hinge bridges and the focus wheel
		for ( const x of [ - 0.035, 0.035 ] ) add( g, G.box( 0.02, 0.014, 0.05 ), body, [ x, 0.04, 0 ] );
		add( g, ridged( 0.011, 0.024, 18, 0.12 ).rotateZ( PI / 2 ).rotateY( PI / 2 ), M( 0x1a1a1a, { rough: 0.6 } ), [ - 0.035, 0.05, - 0.012 ] );
		for ( const z of [ - 0.06, 0.06 ] ) add( g, new THREE.TorusGeometry( 0.005, 0.0015, 4, 10 ), MAT.darkMetal(), [ - 0.04, 0.045, z ] );
		return ground( g );
	} );

	reg( 'watch', ( s ) => {
		// a watch lying face up: the case and bezel, the straps out each side, the buckle; digital or analogue
		const g = group(), c = s.color ?? 0x2a2a2a, strapC = s.strap ?? 0x1a1a1a;
		const strap = M( strapC, { rough: 0.7 } );
		for ( const sx of [ - 1, 1 ] ) {
			// out of the lugs, down over a curve to the table, then flat
			const pts = [ [ sx * 0.02, 0.011, 0 ], [ sx * 0.034, 0.009, 0 ], [ sx * 0.044, 0.004, 0 ], [ sx * 0.052, 0.0022, 0 ], [ sx * 0.075, 0.0022, 0 ], [ sx * 0.095, 0.0022, 0 ] ];
			add( g, G.tube( pts, 0.0024, 14, 4 ).scale( 1, 1, 8.6 ), strap );
			for ( let i = 0; i < ( sx > 0 ? 4 : 0 ); i ++ ) add( g, G.cyl( 0.0011, 0.0011, 0.0055, 6 ), M( 0x050505 ), [ 0.058 + i * 0.009, 0.002, 0 ] );
		}
		add( g, G.rbox( 0.008, 0.005, 0.024, 0.0015 ), M( 0x9ea3aa, { rough: 0.3, metal: 0.9 } ), [ - 0.093, 0.0, 0 ] );
		add( g, ( s.digital ? G.rbox( 0.046, 0.014, 0.046, 0.01, 3 ) : G.cyl( 0.021, 0.021, 0.012, 32 ) ), M( c, { rough: 0.4, metal: s.metal ?? 0.3 } ), [ 0, 0.003, 0 ] );
		const face = s.digital
			? screenTex( 'watch-lcd', 128, 128, ( ctx, W ) => {
				ctx.fillStyle = '#9aa88a'; ctx.fillRect( 0, 0, W, W );
				ptext( ctx, '10:42', W / 2, W * 0.52, W * 0.84, W * 0.34, { weight: '900', family: 'monospace', color: '#1a221a' } );
				ptext( ctx, 'TU 6-14', W / 2, W * 0.24, W * 0.6, W * 0.14, { family: 'monospace', color: '#1a221a' } );
				ctx.fillStyle = '#1a221a'; for ( let i = 0; i < 6; i ++ ) ctx.fillRect( W * 0.2 + i * W * 0.1, W * 0.78, W * 0.07, W * 0.06 );
			} )
			: screenTex( 'watch-dial:' + ( s.face ?? 0x10181a ), 128, 128, ( ctx, W ) => {
				ctx.fillStyle = css( s.face ?? 0x10181a ); ctx.fillRect( 0, 0, W, W );
				ctx.fillStyle = '#e8e8e2';
				for ( let i = 0; i < 12; i ++ ) { ctx.save(); ctx.translate( W / 2, W / 2 ); ctx.rotate( i / 12 * PI * 2 ); ctx.fillRect( - 2, - W * 0.46, 4, i % 3 ? W * 0.07 : W * 0.12 ); ctx.restore(); }
				ctx.lineCap = 'round'; ctx.strokeStyle = '#e8e8e2';
				ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo( W / 2, W / 2 ); ctx.lineTo( W / 2 + W * 0.22, W / 2 - W * 0.12 ); ctx.stroke();
				ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo( W / 2, W / 2 ); ctx.lineTo( W / 2 - W * 0.08, W / 2 - W * 0.36 ); ctx.stroke();
				ctx.strokeStyle = '#d8402a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo( W / 2, W / 2 + W * 0.1 ); ctx.lineTo( W / 2 + W * 0.3, W / 2 + W * 0.25 ); ctx.stroke();
			} );
		// the bezel on the case, the face on top of the case inside it, the crystal over the face
		const fr = s.digital ? 0.0155 : 0.0175;
		add( g, ( s.digital ? G.rbox( 0.044, 0.003, 0.044, 0.009, 2 ) : new THREE.TorusGeometry( 0.0195, 0.0022, 6, 32 ).rotateX( PI / 2 ).translate( 0, 0.0015, 0 ) ), M( s.digital ? 0x3a3c40 : 0xb8bcc2, { rough: 0.3, metal: s.digital ? 0.2 : 0.9 } ), [ 0, 0.0165, 0 ] );
		const fy = s.digital ? 0.0196 : 0.0172;
		add( g, ( s.digital ? G.rbox( fr * 2, 0.0008, fr * 2, 0.003, 1 ) : G.cyl( fr, fr, 0.0008, 32 ) ), screenMat( face, s.digital ? 0.15 : 0.05, 0.25 ), [ 0, fy, 0 ] );
		add( g, ( s.digital ? G.box( fr * 2, 0.0005, fr * 2 ) : G.cyl( fr, fr, 0.0005, 32 ) ), MAT.glass( 0xffffff, 0.12 ), [ 0, fy + 0.0009, 0 ] );
		for ( const [ x, z ] of s.digital ? [ [ 0.012, 0.024 ], [ - 0.012, 0.024 ], [ 0.012, - 0.024 ], [ - 0.012, - 0.024 ] ] : [ [ 0, 0.023 ] ] ) add( g, G.cyl( 0.0022, 0.0022, 0.004, 8 ), MAT.metal(), [ x, 0.01, z ], [ PI / 2, 0, 0 ] );
		g.userData.iconDir = [ 0.35, 1, 0.75 ];
		return ground( g );
	} );

	reg( 'gps', ( s ) => {
		// a handheld GPS: rubberised body, a map on the screen, the d-pad and keys, the stubby antenna
		const g = group(), c = s.color ?? 0x2a2a2a;
		const body = M( c, { rough: 0.6 } ), grip = M( 0xffffff, { map: knurl( 0x1a1a1a, 2 ), rough: 0.9 } );
		add( g, G.rbox( 0.115, 0.026, 0.058, 0.012, 3 ), body );
		add( g, G.rbox( 0.112, 0.012, 0.061, 0.005, 1 ), grip, [ 0, 0.004, 0 ] );
		const screen = screenTex( 'gps-map', 192, 160, ( ctx, W, H ) => {
			ctx.fillStyle = '#e8eadc'; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#a8d4e8'; ctx.beginPath(); ctx.moveTo( 0, H * 0.7 ); ctx.quadraticCurveTo( W * 0.4, H * 0.55, W, H * 0.8 ); ctx.lineTo( W, H ); ctx.lineTo( 0, H ); ctx.fill();
			ctx.strokeStyle = '#c8b090'; ctx.lineWidth = 1;
			for ( let i = 0; i < 6; i ++ ) { ctx.beginPath(); ctx.ellipse( W * 0.6, H * 0.35, 20 + i * 14, 12 + i * 9, 0.3, 0, PI * 2 ); ctx.stroke(); }
			ctx.strokeStyle = '#d0402a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo( W * 0.1, H * 0.2 ); ctx.lineTo( W * 0.35, H * 0.4 ); ctx.lineTo( W * 0.5, H * 0.38 ); ctx.lineTo( W * 0.62, H * 0.55 ); ctx.stroke();
			ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo( W * 0.62, H * 0.5 ); ctx.lineTo( W * 0.66, H * 0.62 ); ctx.lineTo( W * 0.58, H * 0.62 ); ctx.fill();
			ctx.fillStyle = 'rgba(20,40,60,0.85)'; ctx.fillRect( 0, 0, W, H * 0.16 );
			ptext( ctx, '19°43′N 155°05′W', W / 2, H * 0.08, W * 0.9, H * 0.1, { family: 'monospace', color: '#e8f0f0' } );
		} );
		add( g, G.rbox( 0.058, 0.0014, 0.048, 0.003, 1 ), M( 0x1a1a1a, { rough: 0.3 } ), [ 0.02, 0.0255, 0 ] );
		add( g, G.box( 0.052, 0.0008, 0.042 ), screenMat( screen, 0.35 ), [ 0.02, 0.0268, 0 ] );
		add( g, G.cyl( 0.009, 0.009, 0.002, 16 ), M( 0x3a3c40, { rough: 0.4 } ), [ - 0.03, 0.026, 0 ] );
		for ( const [ x, z ] of [ [ - 0.047, - 0.016 ], [ - 0.047, 0.016 ], [ - 0.013, - 0.022 ], [ - 0.013, 0.022 ] ] ) add( g, G.rbox( 0.008, 0.0025, 0.008, 0.002 ), M( 0x4a4d52, { rough: 0.4 } ), [ x, 0.026, z ] );
		add( g, G.capsX( 0.0065, 0.035, 10 ), body, [ 0.072, 0.013, 0.016 ] );
		add( g, new THREE.TorusGeometry( 0.004, 0.0012, 4, 10 ), MAT.darkMetal(), [ - 0.06, 0.013, - 0.02 ], [ 0, PI / 2, 0 ] );
		return g;
	} );

	reg( 'rod', ( s ) => {
		const g = group(), L = s.len ?? 1.9, y = 0.013;
		if ( s.improvised ) {
			// a bamboo pole with its nodes, the line wound on a crosspiece at the butt and run up to the tip
			const cane = M( 0xc8b070, { rough: 0.6 } ), node = M( 0x9a8448, { rough: 0.7 } );
			add( g, G.cylX( 0.012, L, 10, 0.005 ), cane, [ 0, y, 0 ] );
			for ( let i = 1; i < 7; i ++ ) { const t = i / 7, r = 0.012 + ( 0.005 - 0.012 ) * t; add( g, G.cylX( r * 1.15, 0.008, 10 ), node, [ - L / 2 + t * L, y, 0 ] ); }
			add( g, G.cylZ( 0.004, 0.08, 6 ), M( 0x6a4a2e, { rough: 0.9 } ), [ - L * 0.38, y, 0 ] );
			add( g, G.cylZ( 0.007, 0.05, 10 ), M( 0x5aa86a, { rough: 0.6 } ), [ - L * 0.38, y, 0 ] );
			add( g, G.cylX( 0.0006, L * 0.86, 3 ), M( 0x7ac88a, { rough: 0.5 } ), [ L * 0.05, y + 0.008, 0 ] );
			return g;
		}
		const blank = M( s.color ?? 0x2a3a5a, { rough: 0.25, metal: 0.35 } ), eva = M( s.grip ?? 0x2a2a2a, { rough: 0.9 } ), chrome = M( 0xc8ccd2, { rough: 0.2, metal: 1 } );
		// the blank, tapering to the tip; split grip, reel seat, hook keeper
		add( g, G.cylX( 0.0062, L * 0.8, 10, 0.0014 ), blank, [ L * 0.1, y, 0 ] );
		add( g, G.cylX( 0.0125, L * 0.14, 14, 0.011 ), eva, [ - L * 0.41, y, 0 ] );
		add( g, G.cylX( 0.011, L * 0.06, 14, 0.0095 ), eva, [ - L * 0.235, y, 0 ] );
		add( g, G.cylX( 0.0125, 0.02, 14 ), MAT.blackPlastic(), [ - L * 0.485, y, 0 ] );
		add( g, G.cylX( 0.0105, L * 0.06, 14 ), M( 0x2a2c30, { rough: 0.3, metal: 0.7 } ), [ - L * 0.305, y, 0 ] );
		add( g, G.cylX( 0.0112, 0.012, 14 ), chrome, [ - L * 0.27, y, 0 ] );
		// the guides along the side the reel hangs, shrinking towards the tip
		for ( let i = 0; i < 7; i ++ ) {
			const t = i / 6, x = - L * 0.17 + t * L * 0.66, rr = 0.012 * ( 1 - t * 0.65 );
			add( g, G.box( 0.004, 0.0012, rr * 1.4 ), chrome, [ x, y, - rr * 0.7 - 0.004 ] );
			add( g, new THREE.TorusGeometry( rr * 0.6, 0.0012, 4, 12 ).rotateY( PI / 2 ), chrome, [ x, y, - rr * 1.4 - 0.006 ] );
		}
		add( g, new THREE.TorusGeometry( 0.0022, 0.0007, 3, 8 ).rotateY( PI / 2 ), chrome, [ L / 2, y, 0 ] );
		// a spinning reel, lying on its side next to the seat: stem, body, spool with line, bail, the crank
		const reel = group(), body = M( 0x2a2c30, { rough: 0.35, metal: 0.5 } );
		add( reel, G.box( 0.05, 0.003, 0.012 ), body, [ 0, 0, 0 ] );
		add( reel, G.box( 0.008, 0.003, 0.04 ), body, [ 0, 0, - 0.02 ] );
		add( reel, G.rbox( 0.045, 0.034, 0.036, 0.012, 2 ).translate( 0, - 0.017, 0 ), body, [ - 0.005, 0, - 0.055 ], [ PI / 2, 0, 0 ] );
		add( reel, G.cylX( 0.022, 0.028, 22 ), M( 0xd8dce0, { rough: 0.25, metal: 0.9 } ), [ 0.035, 0, - 0.055 ] );
		add( reel, G.cylX( 0.018, 0.022, 22 ), M( s.line ?? 0x5ac8a8, { rough: 0.5 } ), [ 0.035, 0, - 0.055 ] );
		add( reel, new THREE.TorusGeometry( 0.024, 0.0014, 4, 18, PI ).rotateY( PI / 2 ), chrome, [ 0.05, 0, - 0.055 ] );
		add( reel, G.box( 0.004, 0.035, 0.004 ), chrome, [ - 0.01, 0.0, - 0.055 ] );
		add( reel, G.cyl( 0.005, 0.005, 0.012, 10 ), M( 0x1a1a1a, { rough: 0.6 } ), [ - 0.01, 0.017, - 0.055 ] );
		reel.position.set( - L * 0.305, y, - 0.004 ); reel.rotation.x = - PI / 2;
		g.add( reel );
		return ground( g );
	} );

	reg( 'toolbox', ( s ) => {
		const g = group(), [ w, h, d ] = s.size || [ 0.42, 0.18, 0.2 ];
		const c = s.color ?? 0xc0282a, tackle = s.style === 'tackle';
		const shell = tackle ? M( c, { rough: 0.45 } ) : M( c, { rough: 0.38, metal: 0.55 } ), blk = M( 0x1a1a1c, { rough: 0.5 } ), steel = MAT.metal();
		// the box, the lid above the seam with its rolled edge and stamped ribs
		add( g, G.rbox( w, h * 0.66, d, 0.006, 2 ), shell );
		add( g, G.rbox( w * 1.006, h * 0.05, d * 1.006, 0.004, 1 ), M( shade( c, - 0.3 ), { rough: 0.4, metal: tackle ? 0 : 0.5 } ), [ 0, h * 0.64, 0 ] );
		add( g, G.rbox( w * 0.998, h * 0.32, d * 0.998, 0.012, 2 ), shell, [ 0, h * 0.68, 0 ] );
		for ( const x of [ - w * 0.42, w * 0.42 ] ) add( g, G.rbox( w * 0.04, 0.004, d * 0.8, 0.002, 1 ), shell, [ x, h - 0.001, 0 ] );
		// the folding handle laid flat in its recess, its hinge blocks
		for ( const x of [ - w * 0.2, w * 0.2 ] ) add( g, G.rbox( 0.024, 0.012, 0.03, 0.003 ), blk, [ x, h - 0.004, 0 ] );
		add( g, G.tube( [ [ - w * 0.2, h + 0.004, 0 ], [ - w * 0.16, h + 0.008, 0.035 ], [ w * 0.16, h + 0.008, 0.035 ], [ w * 0.2, h + 0.004, 0 ] ], 0.007, 16, 8 ), blk );
		// latches on the front, the hinge pins at the back, a maker's plate
		for ( const x of [ - w * 0.36, w * 0.36 ] ) {
			add( g, G.rbox( 0.03, 0.04, 0.008, 0.003 ), steel, [ x, h * 0.52, d / 2 ] );
			add( g, G.box( 0.02, 0.006, 0.006 ), steel, [ x, h * 0.66, d / 2 + 0.004 ] );
		}
		add( g, G.cylX( 0.004, w * 0.86, 8 ), steel, [ 0, h * 0.66, - d / 2 - 0.002 ] );
		const plate = canvasTex( 'toolbox-plate:' + ( tackle ? 't' : 's' ), 256, 64, ( ctx, W, H ) => {
			ctx.fillStyle = tackle ? '#f2f2ee' : '#c8ccd2'; rrect( ctx, 0, 0, W, H, 8 ); ctx.fill();
			ptext( ctx, tackle ? 'MAKAI · TACKLE' : 'KAPENA', W / 2, H * 0.42, W * 0.86, H * 0.5, { weight: '900', color: tackle ? '#2a5a3a' : '#1a1a1a' } );
			ptext( ctx, tackle ? '3-TRAY · WATERPROOF' : 'HEAVY DUTY STEEL', W / 2, H * 0.8, W * 0.7, H * 0.2, { color: '#333' } );
		} );
		add( g, G.box( w * 0.32, h * 0.12, 0.0015 ), printed( plate, { rough: 0.35, metal: tackle ? 0 : 0.6 } ), [ 0, h * 0.24, d / 2 + 0.0004 ] );
		return g;
	} );

	reg( 'lockpick', () => {
		// a zip wallet lying open: the picks and tension wrenches in their elastic loops
		const g = group(), leather = M( 0x2a2220, { rough: 0.75 } ), lining = M( 0x3a2a24, { rough: 0.9 } ), steel = M( 0xc8ccd2, { rough: 0.25, metal: 1 } ), handle = M( 0x1a1a1a, { rough: 0.55 } );
		add( g, G.rbox( 0.13, 0.004, 0.085, 0.006, 1 ), leather );
		add( g, G.box( 0.124, 0.0008, 0.079 ), lining, [ 0, 0.004, 0 ] );
		add( g, G.box( 0.13, 0.0012, 0.003 ), M( 0x8a8e94, { rough: 0.4, metal: 0.8 } ), [ 0, 0.0035, - 0.0425 ] );
		add( g, G.box( 0.11, 0.003, 0.012 ), M( 0x1a1a1a, { rough: 0.9 } ), [ - 0.005, 0.005, 0.0 ] );
		const tips = [ 'hook', 'rake', 'diamond', 'ball', 'hook', 'wrench' ];
		tips.forEach( ( k, i ) => {
			const z = - 0.03 + i * 0.012, t = group();
			add( t, G.box( 0.085, 0.0007, 0.0022 ), steel, [ 0.0, 0, 0 ] );
			add( t, G.rbox( 0.04, 0.0025, 0.005, 0.001 ), handle, [ - 0.03, 0, 0 ] );
			// the business end
			if ( k === 'hook' ) add( t, G.box( 0.0022, 0.0007, 0.005 ), steel, [ 0.042, 0, 0.0018 ] );
			if ( k === 'rake' ) for ( let j = 0; j < 3; j ++ ) add( t, G.box( 0.003, 0.0007, 0.0042 ), steel, [ 0.03 + j * 0.005, 0, 0.0014 ], [ 0, 0.6, 0 ] );
			if ( k === 'diamond' ) add( t, G.box( 0.004, 0.0007, 0.004 ), steel, [ 0.041, 0, 0.0012 ], [ 0, PI / 4, 0 ] );
			if ( k === 'ball' ) add( t, G.cyl( 0.0026, 0.0026, 0.0007, 8 ), steel, [ 0.043, 0, 0 ] );
			if ( k === 'wrench' ) add( t, G.box( 0.0022, 0.0007, 0.012 ), steel, [ 0.042, 0, 0.005 ] );
			t.position.set( 0.0, 0.0055, z ); t.rotation.y = ( i - 2.5 ) * 0.02;
			g.add( t );
		} );
		return g;
	} );

	reg( 'radio', ( s ) => {
		const g = group(), c = s.color ?? 0x1a1a1a;
		const grille = ( key, holes ) => canvasTex( 'grille:' + key, 128, 128, ( ctx, W ) => {
			ctx.fillStyle = '#1e1f22'; ctx.fillRect( 0, 0, W, W ); ctx.fillStyle = '#060606';
			if ( holes ) for ( let y = 6; y < W; y += 10 ) for ( let x = 6 + ( ( y / 10 ) % 2 ) * 5; x < W; x += 10 ) { ctx.beginPath(); ctx.arc( x, y, 3, 0, PI * 2 ); ctx.fill(); }
			else for ( let y = 8; y < W; y += 12 ) { rrect( ctx, 10, y, W - 20, 5, 2.5 ); ctx.fill(); }
		} );
		if ( s.style === 'portable' ) {
			// an emergency radio: speaker grille, the tuning dial, the solar cell on top, the crank folded on the side
			const shell = M( c, { rough: 0.45 } ), blk = M( 0x1e1f22, { rough: 0.6 } );
			add( g, G.rbox( 0.2, 0.12, 0.068, 0.016, 3 ), shell );
			add( g, G.rbox( 0.204, 0.035, 0.072, 0.008, 2 ), blk, [ 0, 0, 0 ] );
			add( g, G.box( 0.078, 0.07, 0.002 ), printed( grille( 'radio', true ), { rough: 0.7 } ), [ - 0.05, 0.05, 0.0345 ] );
			const dial = canvasTex( 'radio-dial', 256, 96, ( ctx, W, H ) => {
				ctx.fillStyle = '#e8d8a8'; ctx.fillRect( 0, 0, W, H );
				ctx.fillStyle = '#222';
				for ( let i = 0; i <= 40; i ++ ) ctx.fillRect( 14 + i * 5.7, i % 5 ? H * 0.32 : H * 0.22, 1.5, i % 5 ? H * 0.12 : H * 0.22 );
				[ 'FM', '88', '92', '96', '100', '104', '108' ].forEach( ( t, i ) => ptext( ctx, t, 6 + i * 38, H * 0.12, 30, 13, { color: '#222' } ) );
				[ 'AM', '53', '70', '90', '110', '140', '170' ].forEach( ( t, i ) => ptext( ctx, t, 6 + i * 38, H * 0.78, 30, 13, { color: '#a02a1a' } ) );
				ctx.fillStyle = '#d0281a'; ctx.fillRect( W * 0.56, 4, 2.5, H - 8 );
			} );
			add( g, G.box( 0.07, 0.03, 0.002 ), screenMat( dial, 0.25 ), [ 0.045, 0.074, 0.0345 ] );
			add( g, ridged( 0.012, 0.012, 16, 0.08 ).rotateX( PI / 2 ), blk, [ 0.06, 0.035, 0.034 ] );
			add( g, ridged( 0.008, 0.01, 12, 0.08 ).rotateX( PI / 2 ), blk, [ 0.03, 0.035, 0.034 ] );
			add( g, G.box( 0.09, 0.0015, 0.05 ), M( 0xffffff, { map: solarCells(), rough: 0.18, metal: 0.4 } ), [ - 0.03, 0.12, 0 ] );
			add( g, G.tube( [ [ - 0.085, 0.112, 0 ], [ - 0.08, 0.14, 0 ], [ 0.08, 0.14, 0 ], [ 0.085, 0.112, 0 ] ], 0.006, 16, 6 ), blk );
			add( g, G.cylX( 0.003, 0.17, 8, 0.002 ), M( 0xc8ccd2, { rough: 0.2, metal: 1 } ), [ 0.02, 0.126, - 0.026 ] );
			add( g, G.box( 0.008, 0.07, 0.012 ), blk, [ 0.104, 0.06, 0.0 ] );
			add( g, G.cylZ( 0.006, 0.02, 10 ), M( 0xf2c21a, { rough: 0.5 } ), [ 0.11, 0.095, 0.014 ] );
			return g;
		}
		// a walkie-talkie lying on its back: grille, the little display and keys, the PTT, the rubber antenna, the knob
		const shell = M( c, { rough: 0.55 } ), blk = M( 0x111214, { rough: 0.6 } );
		const W = 0.12, T = 0.035, D = 0.058;
		add( g, G.rbox( W, T, D, 0.01, 3 ), shell );
		add( g, G.box( 0.042, 0.002, 0.044 ), printed( grille( 'walkie', false ), { rough: 0.7 } ), [ - 0.028, T, 0 ] );
		const lcd = canvasTex( 'walkie-lcd', 128, 64, ( ctx, Wd, H ) => {
			ctx.fillStyle = '#a8c890'; ctx.fillRect( 0, 0, Wd, H );
			ptext( ctx, 'CH 09', Wd * 0.4, H * 0.55, Wd * 0.6, H * 0.5, { weight: '900', family: 'monospace', color: '#16241a' } );
			ctx.fillStyle = '#16241a'; for ( let i = 0; i < 4; i ++ ) ctx.fillRect( Wd * 0.78 + i * 6, H * ( 0.7 - i * 0.12 ), 4, H * ( 0.1 + i * 0.12 ) );
		} );
		add( g, G.box( 0.026, 0.0012, 0.034 ), screenMat( lcd, 0.3 ), [ 0.016, T, 0 ] );
		for ( let i = 0; i < 2; i ++ ) for ( let j = 0; j < 3; j ++ ) add( g, G.rbox( 0.007, 0.003, 0.009, 0.0015 ), M( 0x3a3c40, { rough: 0.5 } ), [ 0.038 + i * 0.01, T - 0.001, - 0.013 + j * 0.013 ] );
		add( g, G.rbox( 0.03, 0.012, 0.004, 0.002 ), blk, [ 0.005, T * 0.5, D / 2 + 0.001 ] );
		add( g, G.box( 0.05, 0.004, 0.034 ), M( 0x2a2c30, { rough: 0.4, metal: 0.4 } ), [ - 0.01, - 0.002, 0 ] );
		const ant = latheX( [ [ 0.0058, 0 ], [ 0.0055, 0.01 ], [ 0.0048, 0.05 ], [ 0.0035, 0.08 ], [ 0.0035, 0.084 ], [ 0, 0.086 ] ], 10 );
		add( g, ant, MAT.rubber(), [ W / 2 - 0.004, T * 0.5, - 0.012 ] );
		add( g, ridged( 0.0065, 0.012, 12, 0.1 ).rotateZ( - PI / 2 ), blk, [ W / 2 - 0.003, T * 0.5, 0.014 ] );
		return ground( g );
	} );
	function solarCells() {
		return canvasTex( 'solar-cells', 128, 96, ( ctx, W, H ) => {
			ctx.fillStyle = '#c8ccd2'; ctx.fillRect( 0, 0, W, H );
			for ( let i = 0; i < 4; i ++ ) for ( let j = 0; j < 3; j ++ ) { ctx.fillStyle = '#16244a'; ctx.fillRect( i * W / 4 + 2, j * H / 3 + 2, W / 4 - 4, H / 3 - 4 ); ctx.fillStyle = 'rgba(200,210,230,0.5)'; ctx.fillRect( i * W / 4 + W / 8, j * H / 3 + 2, 1, H / 3 - 4 ); }
		} );
	}

	reg( 'sewing', () => {
		// a round sewing tin, its lid off beside it: spools of thread, a pincushion, needles, a pair of scissors
		const g = group(), tinC = 0x2a5a8a;
		const tin = M( tinC, { rough: 0.3, metal: 0.65 } );
		add( g, G.lathe( [ [ 0, 0.002 ], [ 0.05, 0 ], [ 0.052, 0.004 ], [ 0.052, 0.03 ], [ 0.05, 0.031 ], [ 0.048, 0.006 ], [ 0, 0.006 ] ], 28 ), tin );
		const spool = ( x, z, c, tall ) => {
			const h = tall ? 0.03 : 0.018;
			add( g, G.cyl( 0.009, 0.009, 0.002, 12 ), M( 0xe8d8b0, { rough: 0.7 } ), [ x, 0.006, z ] );
			add( g, G.cyl( 0.0075, 0.0075, h - 0.004, 14 ), M( c, { rough: 0.7 } ), [ x, 0.008, z ] );
			add( g, G.cyl( 0.009, 0.009, 0.002, 12 ), M( 0xe8d8b0, { rough: 0.7 } ), [ x, 0.004 + h, z ] );
		};
		spool( - 0.022, - 0.018, 0xd02a2a, true ); spool( 0.0, - 0.028, 0xf2f2f2, false ); spool( 0.022, - 0.016, 0x1a1a1a, true ); spool( - 0.028, 0.012, 0x2a6ad6, false ); spool( 0.026, 0.016, 0xf2c21a, false );
		add( g, G.sph( 0.014, 12, 8 ).scale( 1, 0.75, 1 ), M( 0xd02a2a, { rough: 0.8 } ), [ 0.0, 0.016, 0.012 ] );
		for ( let i = 0; i < 5; i ++ ) { const a = i * 1.3; add( g, G.cyl( 0.0006, 0.0006, 0.012, 4 ), MAT.metal(), [ Math.cos( a ) * 0.006, 0.026, 0.012 + Math.sin( a ) * 0.006 ], [ Math.sin( a ) * 0.4, 0, Math.cos( a ) * 0.4 ] ); add( g, G.sph( 0.0015, 6, 4 ), M( [ 0xf2f2f2, 0xf2c21a, 0x2a8a3a ][ i % 3 ], { rough: 0.3 } ), [ Math.cos( a ) * 0.008, 0.031, 0.012 + Math.sin( a ) * 0.008 ] ); }
		// the lid, leaning on its edge behind, printed
		const lidTex = canvasTex( 'sewing-lid', 256, 256, ( ctx, W ) => {
			ctx.fillStyle = css( tinC ); ctx.fillRect( 0, 0, W, W );
			ctx.strokeStyle = '#e8d8a8'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc( W / 2, W / 2, W * 0.44, 0, PI * 2 ); ctx.stroke();
			ptext( ctx, 'SEWING', W / 2, W * 0.42, W * 0.7, W * 0.16, { weight: '900', family: 'Georgia, serif', color: '#f2e8c8' } );
			ptext( ctx, 'NOTIONS · NEEDLES · THREAD', W / 2, W * 0.58, W * 0.7, W * 0.06, { color: '#f2e8c8' } );
			for ( let i = 0; i < 10; i ++ ) { const a = i / 10 * PI * 2; glyphFlower( ctx, W / 2 + Math.cos( a ) * W * 0.34, W / 2 + Math.sin( a ) * W * 0.34, 10 ); }
		} );
		const lid = group();
		add( lid, G.cyl( 0.053, 0.053, 0.012, 28, true ), tin );
		add( lid, new THREE.CircleGeometry( 0.053, 28 ).rotateX( PI / 2 ), printed( lidTex, { rough: 0.3, metal: 0.5 } ), [ 0, 0.0, 0 ] );
		add( lid, new THREE.CircleGeometry( 0.053, 28 ).rotateX( - PI / 2 ), tin, [ 0, 0.012, 0 ] );
		lid.rotation.set( 0, 0, 0 ); lid.position.set( 0.0, 0.0, 0.0 );
		const lidHolder = group(); lidHolder.add( lid ); lid.rotation.x = PI; lid.position.y = 0.012;
		lidHolder.position.set( 0.075, 0, - 0.04 ); lidHolder.rotation.set( 0, 0, 0 );
		g.add( lidHolder );
		// scissors on top
		const sc = group(), st = M( 0xc8ccd2, { rough: 0.2, metal: 1 } );
		for ( const k of [ - 1, 1 ] ) { add( sc, G.box( 0.05, 0.0015, 0.004 ), st, [ 0.025, k * 0.0008, 0 ], [ 0, k * 0.12, 0 ] ); add( sc, new THREE.TorusGeometry( 0.007, 0.0016, 4, 12 ).rotateX( PI / 2 ), M( 0x1a1a1a ), [ - 0.008, k * 0.0008, k * 0.006 ] ); }
		sc.position.set( 0.06, 0.016, 0.05 ); sc.rotation.y = 0.8;
		g.add( sc );
		return ground( g );
	} );
	function glyphFlower( ctx, x, y, s ) { ctx.fillStyle = '#f2e8c8'; for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; ctx.beginPath(); ctx.arc( x + Math.cos( a ) * s * 0.5, y + Math.sin( a ) * s * 0.5, s * 0.4, 0, PI * 2 ); ctx.fill(); } }

	reg( 'pot', ( s ) => {
		// a stainless saucepan with its lid: rolled rim, riveted handle with the hanging hole, the lid knob and vent
		const g = group(), r = s.r ?? 0.1, h = s.h ?? 0.11;
		const brushed = canvasTex( 'brushed-round', 128, 128, ( ctx, W ) => {
			ctx.fillStyle = '#b8bcc2'; ctx.fillRect( 0, 0, W, W );
			const rr = rng( 9 ); for ( let i = 0; i < 160; i ++ ) { ctx.fillStyle = rr() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; ctx.fillRect( rr() * W, 0, 1, W ); }
		}, { repeat: true } );
		const m = M( s.color ?? 0xffffff, { map: brushed, rough: 0.3, metal: 0.9 } ), inside = M( 0x8a8e94, { rough: 0.35, metal: 0.9 } );
		add( g, G.lathe( [ [ 0, 0.002 ], [ r * 0.92, 0 ], [ r * 0.99, h * 0.04 ], [ r, h * 0.12 ], [ r, h * 0.96 ], [ r * 1.03, h ], [ r * 1.015, h * 1.012 ] ], 30 ), m );
		add( g, G.lathe( [ [ r * 1.0, h * 0.98 ], [ r * 0.97, h * 0.95 ], [ r * 0.97, h * 0.1 ], [ r * 0.9, h * 0.06 ], [ 0, h * 0.06 ] ], 30 ), inside );
		// the lid, sitting a little proud
		add( g, G.lathe( [ [ r * 1.02, h * 0.99 ], [ r * 1.0, h * 1.03 ], [ r * 0.75, h * 1.09 ], [ r * 0.2, h * 1.13 ], [ 0, h * 1.135 ] ], 30 ), m );
		add( g, G.cyl( 0.014, 0.018, 0.016, 14 ), MAT.blackPlastic(), [ 0, h * 1.13, 0 ] );
		add( g, G.cyl( 0.02, 0.02, 0.006, 14 ), MAT.blackPlastic(), [ 0, h * 1.13 + 0.016, 0 ] );
		add( g, G.cyl( 0.003, 0.003, 0.002, 8 ), M( 0x1a1a1a ), [ r * 0.5, h * 1.1, 0.0 ] );
		// the handle: steel strap riveted on, the black grip, the hanging hole
		add( g, G.box( 0.05, 0.006, 0.022 ), m, [ r + 0.02, h * 0.82, 0 ], [ 0, 0, 0.2 ] );
		for ( const z of [ - 0.006, 0.006 ] ) add( g, G.sph( 0.003, 8, 6 ), m, [ r - 0.001, h * 0.8, z ] );
		const grip = new THREE.CapsuleGeometry( 0.011, 0.12, 4, 12 ).rotateZ( PI / 2 ).scale( 1, 0.7, 1 );
		add( g, grip, MAT.blackPlastic(), [ r + 0.105, h * 0.86, 0 ], [ 0, 0, 0.12 ] );
		add( g, new THREE.TorusGeometry( 0.006, 0.002, 4, 12 ).rotateX( PI / 2 ), M( 0x2a2a2a ), [ r + 0.165, h * 0.875, 0 ] );
		return g;
	} );

	reg( 'canteen', ( s ) => {
		// a 1-qt GI canteen lying on its broad side: the flask with its shoulders, the screw cap on its keeper strap, the
		// insulated cover with the snap flaps (or bare aluminium)
		const g = group(), c = s.color ?? 0x5a6a3a;
		const W = 0.14, H = 0.17, T = 0.07;
		const shape = new THREE.Shape();
		shape.moveTo( - W / 2 + 0.02, 0 ); shape.lineTo( W / 2 - 0.02, 0 ); shape.quadraticCurveTo( W / 2, 0, W / 2, 0.02 );
		shape.lineTo( W / 2, H * 0.72 ); shape.quadraticCurveTo( W / 2, H * 0.84, W * 0.18, H * 0.9 ); shape.lineTo( - W * 0.18, H * 0.9 ); shape.quadraticCurveTo( - W / 2, H * 0.84, - W / 2, H * 0.72 );
		shape.lineTo( - W / 2, 0.02 ); shape.quadraticCurveTo( - W / 2, 0, - W / 2 + 0.02, 0 );
		const bev = T * 0.42;
		const body = new THREE.ExtrudeGeometry( shape, { depth: T - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.9, bevelSegments: 4, curveSegments: 6 } );
		body.translate( 0, 0, bev );
		const flask = s.bare ? M( 0xb8bcc2, { rough: 0.32, metal: 0.9 } ) : M( shade( c, - 0.45 ), { rough: 0.5 } );
		const inner = group();
		add( inner, body, flask );
		add( inner, G.cyl( 0.017, 0.017, 0.014, 16 ), flask, [ 0, H * 0.9 - 0.004, T / 2 ] );
		add( inner, ridged( 0.022, 0.024, 18, 0.06 ), M( 0x1e1f22, { rough: 0.55 } ), [ 0, H * 0.9 + 0.006, T / 2 ] );
		add( inner, G.tube( [ [ 0.014, H * 0.92, T / 2 + 0.012 ], [ 0.03, H * 0.9, T / 2 + 0.02 ], [ 0.045, H * 0.82, T / 2 + 0.03 ], [ 0.04, H * 0.76, T / 2 + 0.035 ] ], 0.0022, 12, 4 ), M( 0x1e1f22, { rough: 0.6 } ) );
		if ( ! s.bare ) {
			// the cover: fabric over the lower body, a seam round it, two flaps with snaps over the shoulders
			const cover = M( c, { rough: 0.96 } );
			const cs = new THREE.Shape();
			cs.moveTo( - W / 2 - 0.004, H * 0.66 ); cs.lineTo( - W / 2 - 0.004, 0.016 ); cs.quadraticCurveTo( - W / 2 - 0.004, - 0.004, - W / 2 + 0.016, - 0.004 ); cs.lineTo( W / 2 - 0.016, - 0.004 ); cs.quadraticCurveTo( W / 2 + 0.004, - 0.004, W / 2 + 0.004, 0.016 ); cs.lineTo( W / 2 + 0.004, H * 0.66 ); cs.lineTo( - W / 2 - 0.004, H * 0.66 );
			const cg = new THREE.ExtrudeGeometry( cs, { depth: T - bev * 1.6, bevelEnabled: true, bevelThickness: bev * 0.92, bevelSize: bev * 0.92, bevelSegments: 3, curveSegments: 4 } ).translate( 0, 0, bev * 0.8 );
			add( inner, cg, cover );
			for ( const sx of [ - 1, 1 ] ) {
				add( inner, G.rbox( 0.05, 0.05, 0.006, 0.01, 2 ), cover, [ sx * 0.04, H * 0.62, T + 0.002 ], [ 0, 0, sx * 0.25 ] );
				add( inner, G.cylZ( 0.0055, 0.003, 12 ), M( 0x4a4a3a, { rough: 0.4, metal: 0.6 } ), [ sx * 0.045, H * 0.66, T + 0.006 ] );
			}
			add( inner, G.box( W * 0.9, 0.003, 0.003 ), M( shade( c, - 0.3 ), { rough: 0.9 } ), [ 0, H * 0.3, T + 0.0005 ] );
		}
		// standing, the cover's snaps towards the front; the belt hooks on the back
		inner.position.z = - T / 2;
		for ( const x of [ - 0.03, 0.03 ] ) add( inner, G.box( 0.012, 0.03, 0.004 ), M( 0x3a3a34, { rough: 0.4, metal: 0.6 } ), [ x, H * 0.5, - 0.002 ] );
		g.add( inner );
		return ground( g );
	} );

	reg( 'jerrycan', ( s ) => {
		const g = group(), small = s.small, c = s.color ?? ( small ? 0xc02a2a : 0x3f5a2a );
		if ( small ) {
			// a plastic gas can: moulded body and handle, the yellow flex spout and the vent, the warning decal
			const [ w, h, d ] = [ 0.3, 0.24, 0.16 ];
			const m = M( c, { rough: 0.42 } ), yel = M( 0xf2c21a, { rough: 0.45 } );
			add( g, G.rbox( w, h, d, 0.03, 3 ), m );
			add( g, G.tube( [ [ - w * 0.4, h - 0.01, 0 ], [ - w * 0.36, h + 0.05, 0 ], [ w * 0.05, h + 0.06, 0 ], [ w * 0.12, h - 0.01, 0 ] ], 0.014, 18, 8 ), m );
			add( g, G.cyl( 0.022, 0.024, 0.02, 16 ), m, [ w * 0.32, h - 0.004, 0 ] );
			add( g, ridged( 0.026, 0.018, 16, 0.06 ), yel, [ w * 0.32, h + 0.012, 0 ] );
			add( g, G.tube( [ [ w * 0.32, h + 0.03, 0 ], [ w * 0.36, h + 0.07, 0 ], [ w * 0.46, h + 0.08, 0 ], [ w * 0.55, h + 0.05, 0 ] ], 0.009, 14, 8 ), yel );
			add( g, G.cyl( 0.008, 0.008, 0.012, 10 ), yel, [ - w * 0.42, h - 0.004, d * 0.25 ] );
			const decal = { bg: 0xf2c21a, fg: 0x1a1a1a, band: 0x1a1a1a, text: 'GASOLINE', sub: 'DANGER · FLAMMABLE · 2 GAL', style: 'band', size: 0.28, brand: false };
			add( g, G.box( w * 0.62, h * 0.42, 0.0015 ), printed( panelTex( decal, packInfo( decal, null, 'chem' ), w * 0.62, h * 0.42, 'front', { max: 384 } ), { rough: 0.6 } ), [ - w * 0.02, h * 0.22, d / 2 + 0.0004 ] );
			for ( let i = 0; i < 3; i ++ ) add( g, G.rbox( w * 0.85, 0.008, 0.004, 0.003 ), m, [ 0, h * ( 0.08 + i * 0.3 ) * 0.25, d / 2 + 0.001 ] );
			return g;
		}
		// the NATO jerry can: three handles, the X pressings, the weld seam round the middle, the spout and its lever
		const [ w, h, d ] = [ 0.345, 0.47, 0.165 ];
		const paint = M( c, { rough: 0.62, metal: 0.35 } ), steel = M( shade( c, - 0.2 ), { rough: 0.5, metal: 0.5 } );
		add( g, G.rbox( w, h * 0.88, d, 0.02, 2 ), paint );
		add( g, G.rbox( w * 1.012, h * 0.88 * 1.005, 0.008, 0.004, 1 ), steel, [ 0, - h * 0.002, 0 ] );
		for ( const z of [ - 1, 1 ] ) {
			// a raised rim round each face and the X in it
			const fz = z * ( d / 2 + 0.002 );
			for ( const [ x0, y0, ww, hh ] of [ [ 0, h * 0.06, w * 0.86, 0.012 ], [ 0, h * 0.8, w * 0.86, 0.012 ] ] ) add( g, G.rbox( ww, hh, 0.006, 0.003 ), paint, [ x0, y0, fz ] );
			for ( const x of [ - w * 0.43, w * 0.43 ] ) add( g, G.rbox( 0.012, h * 0.74, 0.006, 0.003 ), paint, [ x, h * 0.065, fz ] );
			const diag = Math.hypot( w * 0.82, h * 0.72 ), ang = Math.atan2( h * 0.72, w * 0.82 );
			for ( const a of [ ang, - ang ] ) add( g, G.rbox( diag, 0.022, 0.008, 0.004 ).translate( 0, - 0.011, 0 ), paint, [ 0, h * 0.44, fz ], [ 0, 0, a ] );
		}
		// handles: three bars across the top on their stems
		for ( let i = 0; i < 3; i ++ ) {
			const x = - 0.07 + i * 0.07;
			add( g, G.cylZ( 0.009, d * 0.6, 10 ), paint, [ x, h * 0.95, 0 ] );
			for ( const z of [ - d * 0.28, d * 0.28 ] ) add( g, G.box( 0.016, h * 0.08, 0.012 ), paint, [ x, h * 0.88, z ] );
		}
		// the spout with its bayonet cap and cam lever, raked forward
		add( g, G.cyl( 0.026, 0.028, 0.04, 16 ), steel, [ w * 0.33, h * 0.86, 0 ], [ 0, 0, - 0.5 ] );
		add( g, G.cyl( 0.03, 0.03, 0.014, 16 ), paint, [ w * 0.35, h * 0.9, 0 ], [ 0, 0, - 0.5 ] );
		add( g, G.box( 0.06, 0.01, 0.014 ), steel, [ w * 0.3, h * 0.93, 0.03 ], [ 0, 0, - 0.2 ] );
		add( g, G.cylZ( 0.006, 0.07, 8 ), steel, [ w * 0.27, h * 0.9, 0 ] );
		return g;
	} );

	reg( 'battery', ( s, def ) => {
		const g = group();
		if ( s.style === '9v' ) {
			const spec = { bg: 0x141414, fg: 0xd8a830, band: 0xd8a830, text: 'MANA 9V', sub: 'ALKALINE', style: 'band', size: 0.32, brand: false };
			const geo = G.rbox( 0.048, 0.017, 0.026, 0.002, 1 );
			const { tex, rects } = boxAtlas( spec, packInfo( spec, def, 'chem' ), 0.048, 0.017, 0.026, 'y', { max: 256 } );
			add( g, boxUV( geo, rects ), printed( tex, { rough: 0.35, metal: 0.3 } ) );
			add( g, G.cylX( 0.0035, 0.004, 6 ), MAT.metal(), [ 0.026, 0.0085, - 0.0065 ] );
			add( g, G.cylX( 0.0032, 0.004, 14 ), MAT.metal(), [ 0.026, 0.0085, 0.0065 ] );
			return g;
		}
		// AA cells: printed sleeves, the gold band at the positive end, the nub
		const spec = { bg: s.color ?? 0x1c1c1c, fg: s.color2 ?? 0xd8a020, band: s.color2 ?? 0xd8a020, text: 'MANA AA', sub: 'ALKALINE · 1.5 V', style: 'plain', size: 0.4, brand: false };
		const sleeve = tubeUV( G.cylX( 0.0072, 0.05, 20 ) );
		const tex = tubeTex( spec, packInfo( spec, def, 'chem' ), 0.05, 2 * PI * 0.0072, { back: false, max: 256 } );
		for ( const [ z, roll ] of [ [ - 0.0076, 0.4 ], [ 0.0076, - 0.3 ] ] ) {
			add( g, sleeve, printed( tex, { rough: 0.3, metal: 0.45 } ), [ 0, 0.0072, z ], [ roll, 0, 0 ] );
			add( g, G.cylX( 0.0073, 0.012, 20 ), M( s.color2 ?? 0xd8a020, { rough: 0.3, metal: 0.7 } ), [ 0.019, 0.0072, z ] );
			add( g, G.cylX( 0.0026, 0.0018, 10 ), MAT.metal(), [ 0.0259, 0.0072, z ] );
			add( g, G.cylX( 0.0068, 0.0008, 16 ), MAT.metal(), [ - 0.0252, 0.0072, z ] );
		}
		return g;
	} );

	reg( 'carbattery', ( s, def ) => {
		// a lead-acid battery: the case with its ribbed lid, the row of vent caps, the charge eye, lead posts under their
		// red and black boots, the strap handle and the printed front
		const g = group(), [ w, h, d ] = [ 0.27, 0.19, 0.17 ];
		const casing = M( 0x1c1c1e, { rough: 0.55 } ), lid = M( 0x2a2a2e, { rough: 0.5 } );
		add( g, G.rbox( w, h * 0.92, d, 0.006, 2 ), casing );
		add( g, G.rbox( w * 1.01, h * 0.1, d * 1.01, 0.006, 2 ), lid, [ 0, h * 0.9, 0 ] );
		for ( let i = 0; i < 6; i ++ ) add( g, G.cyl( 0.009, 0.009, 0.006, 12 ), M( 0x3a3a40, { rough: 0.5 } ), [ - 0.09 + i * 0.036, h, - 0.03 ] );
		add( g, G.cyl( 0.008, 0.008, 0.002, 12 ), M( 0x2aa84a, { rough: 0.2, emissive: 0x1a6a2a, emissiveIntensity: 0.4 } ), [ 0.0, h + 0.001, 0.04 ] );
		for ( const [ x, c ] of [ [ 0.1, 0xc02a2a ], [ - 0.1, 0x1a1a1a ] ] ) {
			add( g, G.cyl( 0.009, 0.011, 0.022, 12 ), M( 0x8a8e90, { rough: 0.45, metal: 0.7 } ), [ x, h, 0.05 ] );
			add( g, G.lathe( [ [ 0.018, 0 ], [ 0.016, 0.02 ], [ 0.008, 0.032 ], [ 0, 0.034 ] ], 14 ), M( c, { rough: 0.45 } ), [ x, h, 0.05 ] );
		}
		add( g, G.box( 0.13, 0.004, 0.024 ), M( 0x141414, { rough: 0.8 } ), [ 0, h + 0.003, - 0.06 ] );
		const spec = { bg: 0x1a1a1a, fg: 0xf2c230, band: 0xf2c230, accent: 0xc02a2a, text: 'MAX POWER', sub: '12V · 650 CCA · GROUP 24', style: 'band', glyph: 'bolt', glyphColor: 0xf2c230, size: 0.26, brand: 'Island Pro' };
		add( g, G.box( w * 0.86, h * 0.62, 0.001 ), printed( panelTex( spec, packInfo( spec, def, 'chem' ), w * 0.86, h * 0.62, 'front', { max: 512 } ), { rough: 0.5 } ), [ 0, h * 0.12, d / 2 + 0.0008 ] );
		return g;
	} );

	reg( 'tire', ( s ) => {
		const g = group(), R = s.r ?? 0.32, W = s.w ?? 0.2;
		const tread = canvasTex( 'tread2', 512, 128, ( ctx, Wd, H ) => {
			ctx.fillStyle = '#1e1e20'; ctx.fillRect( 0, 0, Wd, H );
			ctx.fillStyle = '#0a0a0b';
			for ( let x = 0; x < Wd; x += 32 ) {
				ctx.fillRect( x, 0, 8, H * 0.32 ); ctx.fillRect( x + 16, H * 0.68, 8, H * 0.32 );
				ctx.beginPath(); ctx.moveTo( x + 8, H * 0.3 ); ctx.lineTo( x + 20, H * 0.45 ); ctx.lineTo( x + 16, H * 0.5 ); ctx.lineTo( x + 4, H * 0.35 ); ctx.fill();
				ctx.beginPath(); ctx.moveTo( x + 24, H * 0.7 ); ctx.lineTo( x + 12, H * 0.55 ); ctx.lineTo( x + 16, H * 0.5 ); ctx.lineTo( x + 28, H * 0.65 ); ctx.fill();
			}
			ctx.fillRect( 0, H * 0.48, Wd, 3 );
		}, { repeat: true } );
		const tt = tread.clone(); tt.repeat.set( 8, 1 ); tt.needsUpdate = true;
		const rubber = M( 0xffffff, { map: tt, rough: 0.92 } ), wall = M( 0x1e1e20, { rough: 0.85 } );
		const tor = G.torus( R - W * 0.32, W * 0.4, 12, 36 ); tor.scale( 1, 1, W / ( W * 0.8 ) * 0.62 );
		add( g, tor, rubber, [ 0, W / 2, 0 ], [ PI / 2, 0, 0 ] );
		// the sidewall lettering
		const side = canvasTex( 'tire-wall', 512, 512, ( ctx, Wd ) => {
			ctx.clearRect( 0, 0, Wd, Wd ); ctx.fillStyle = '#1e1e20'; ctx.fillRect( 0, 0, Wd, Wd );
			const c = Wd / 2;
			const arc = ( str, rr, a0, size ) => { ctx.save(); ctx.translate( c, c ); ctx.font = `bold ${size}px Arial`; ctx.fillStyle = '#5a5a5e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const step = size * 0.62 / rr; let a = a0 - step * ( str.length - 1 ) / 2; for ( const ch of str ) { ctx.save(); ctx.rotate( a ); ctx.translate( 0, - rr ); ctx.fillText( ch, 0, 0 ); ctx.restore(); a += step; } ctx.restore(); };
			arc( 'ALL TERRAIN · KAI-TRAK', Wd * 0.43, 0, 26 );
			arc( 'LT265/70R17  M+S', Wd * 0.43, PI, 22 );
		} );
		add( g, new THREE.RingGeometry( R * 0.6, R - W * 0.06, 40, 1 ).rotateX( - PI / 2 ), M( 0xffffff, { map: side, rough: 0.85 } ), [ 0, W * 0.905, 0 ] );
		add( g, G.cyl( R * 0.6, R * 0.6, W * 0.8, 28, true ), wall, [ 0, W * 0.1, 0 ] );
		// the alloy: the rim lip, five spokes, the hub, lug nuts and the valve stem
		const alloy = M( s.rim ?? 0xa8acb2, { rough: 0.28, metal: 0.9 } );
		add( g, G.lathe( [ [ R * 0.6, W * 0.12 ], [ R * 0.62, W * 0.86 ], [ R * 0.6, W * 0.9 ], [ R * 0.56, W * 0.88 ], [ R * 0.56, W * 0.84 ] ], 30 ), alloy );
		add( g, G.cyl( R * 0.56, R * 0.56, 0.004, 28 ), M( 0x2a2c30, { rough: 0.6, metal: 0.4 } ), [ 0, W * 0.6, 0 ] );
		for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; add( g, G.rbox( R * 0.42, 0.022, 0.05, 0.008, 1 ).translate( R * 0.21, 0, 0 ), alloy, [ 0, W * 0.8, 0 ], [ 0, - a, 0 ] ); }
		add( g, G.cyl( R * 0.16, R * 0.17, 0.04, 20 ), alloy, [ 0, W * 0.77, 0 ] );
		add( g, G.cyl( R * 0.08, R * 0.08, 0.006, 16 ), M( 0x1a1a1a, { rough: 0.3, metal: 0.5 } ), [ 0, W * 0.81, 0 ] );
		for ( let i = 0; i < 5; i ++ ) { const a = ( i + 0.5 ) / 5 * PI * 2; add( g, G.cyl( 0.011, 0.011, 0.016, 6 ), M( 0xd8dce0, { rough: 0.2, metal: 1 } ), [ Math.cos( a ) * R * 0.12, W * 0.81, Math.sin( a ) * R * 0.12 ] ); }
		add( g, G.cyl( 0.004, 0.005, 0.025, 8 ), MAT.rubber(), [ R * 0.55, W * 0.82, 0.02 ], [ 0.4, 0, 0 ] );
		return g;
	} );

	reg( 'rope', ( s ) => {
		// a coiled hank: twisted strands, held by wraps round the neck of the coil, the whipped end trailing
		const g = group(), c = s.color ?? 0xc8b07a;
		const twist = canvasTex( 'rope-twist:' + c, 64, 64, ( ctx, W ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, W );
			for ( let i = - 2; i < 6; i ++ ) { const gr = ctx.createLinearGradient( 0, 0, W / 3, W / 3 ); gr.addColorStop( 0, css( shade( c, - 0.35 ) ) ); gr.addColorStop( 0.5, css( shade( c, 0.15 ) ) ); gr.addColorStop( 1, css( shade( c, - 0.35 ) ) ); ctx.save(); ctx.translate( i * W / 3, 0 ); ctx.transform( 1, 0, 0.7, 1, 0, 0 ); ctx.fillStyle = gr; ctx.fillRect( 0, 0, W / 3, W ); ctx.restore(); }
		}, { repeat: true } ).clone();
		twist.repeat.set( 60, 1 ); twist.needsUpdate = true;
		const m = M( 0xffffff, { map: twist, rough: 0.9 } );
		const R = s.r ?? 0.1;
		for ( let i = 0; i < 6; i ++ ) add( g, G.torus( R - ( i % 3 ) * 0.006, 0.0085, 6, 30 ), m, [ ( i % 2 ) * 0.004, 0.009 + Math.floor( i / 2 ) * 0.0145 + ( i % 2 ) * 0.004, ( i % 3 ) * 0.003 ], [ PI / 2, 0, i * 0.5 ] );
		const wrapM = M( shade( c, - 0.1 ), { rough: 0.9 } );
		for ( let k = 0; k < 4; k ++ ) add( g, G.cylX( 0.03, 0.0085, 14 ).scale( 1, 1.05, 0.9 ), wrapM, [ R - 0.004 + k * 0.0078 - 0.012, 0.03, 0 ] );
		add( g, G.tube( [ [ R + 0.01, 0.03, 0 ], [ R + 0.05, 0.012, 0.03 ], [ R + 0.09, 0.009, 0.01 ], [ R + 0.12, 0.009, - 0.02 ] ], 0.0085, 16, 7 ), m );
		add( g, G.cylX( 0.0092, 0.016, 10 ), M( 0x1a1a1a, { rough: 0.5 } ), [ R + 0.122, 0.009, - 0.022 ], [ 0, 0.6, 0 ] );
		return g;
	} );

	reg( 'stuffsack', ( s ) => { // tent / sleeping bag / tarp roll
		const g = group(), L = s.len ?? 0.5, r = s.r ?? 0.1, c = s.color ?? 0x2a6a3a;
		const nylon = fabric( c, 'weave', shade( c, - 0.08 ), { rep: 10, rough: 0.6 } );
		// the sack: soft-ended, slightly pinched where the straps bite
		const sack = G.capsX( r, L, 22, 6 );
		const p = sack.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), k = 1 - 0.06 * Math.exp( - Math.pow( ( Math.abs( x ) - L * 0.28 ) / 0.02, 2 ) ) + 0.012 * Math.sin( x * 40 ); p.setY( i, p.getY( i ) * k ); p.setZ( i, p.getZ( i ) * k ); }
		sack.computeVertexNormals();
		add( g, sack, nylon, [ 0, r, 0 ] );
		const web = M( s.color2 ?? 0x1a1a1a, { rough: 0.85 } );
		if ( s.straps !== false ) for ( const x of [ - L * 0.28, L * 0.28 ] ) {
			add( g, G.cylX( r * 0.955, 0.024, 22, r * 0.955, true ), web, [ x, r, 0 ] );
			add( g, G.rbox( 0.03, 0.012, 0.03, 0.004 ), M( 0x111111, { rough: 0.5 } ), [ x, r * 1.92, 0 ] );
		}
		// the drawcord, its lock and toggle at one end
		add( g, G.cylX( 0.0025, 0.06, 6 ), M( 0x1a1a1a ), [ L / 2 + 0.02, r, 0.01 ], [ 0, 0.3, 0 ] );
		add( g, G.rbox( 0.012, 0.016, 0.01, 0.004 ), M( 0x1a1a1a, { rough: 0.5 } ), [ L / 2 + 0.03, r - 0.008, 0.02 ] );
		// the maker's tag
		const tag = canvasTex( 'sack-tag:' + c, 128, 64, ( ctx, W, H ) => {
			ctx.fillStyle = '#f2f0e8'; rrect( ctx, 0, 0, W, H, 8 ); ctx.fill();
			ptext( ctx, 'KOA', W * 0.5, H * 0.38, W * 0.8, H * 0.42, { weight: '900', color: css( c ) } );
			ptext( ctx, 'OUTDOORS', W * 0.5, H * 0.75, W * 0.8, H * 0.2, { color: '#333' } );
		} );
		add( g, new THREE.CylinderGeometry( r * 1.005, r * 1.005, 0.06, 16, 1, true, PI * 0.25, PI * 0.35 ).rotateZ( - PI / 2 ), printed( tag, { rough: 0.7 } ), [ 0, r, 0 ] );
		if ( s.poles ) {
			add( g, G.capsX( 0.022, L * 0.9, 12, 3 ), M( 0x1e1f22, { rough: 0.7 } ), [ 0, r * 2 + 0.018, - 0.01 ] );
			for ( let i = 0; i < 3; i ++ ) add( g, G.cylX( 0.0035, 0.004, 8 ), M( 0x8a8e94, { metal: 0.8, rough: 0.3 } ), [ - L * 0.43, r * 2 + 0.018 + ( i - 1 ) * 0.008, - 0.01 + ( i % 2 ) * 0.008 ] );
		}
		return g;
	} );

	reg( 'flare', ( s, def ) => {
		// a road fusee: waxed red tube printed with its warnings, the striker cap, the wooden plug and spike
		const g = group(), L = s.len ?? 0.3, r = 0.016;
		const spec = { bg: s.color ?? 0xc0202a, fg: 0xf2f2f2, band: 0xf2c21a, accent: 0x1a1a1a, text: 'FUSEE', sub: 'BURNS 15 MIN · KEEP DRY', style: 'band', size: 0.42, brand: false };
		const tube = tubeUV( G.cylX( r, L * 0.82, 20 ) );
		add( g, tube, printed( tubeTex( spec, packInfo( spec, def, 'chem' ), L * 0.82, 2 * PI * r, { max: 384 } ), { rough: 0.7 } ), [ - L * 0.04, r, 0 ] );
		add( g, G.cylX( r * 1.08, L * 0.13, 20 ), M( 0x1a1a1a, { rough: 0.5 } ), [ L * 0.43, r, 0 ] );
		add( g, G.cylX( r * 1.1, 0.004, 20 ), M( 0x2a2a2a, { rough: 0.5 } ), [ L * 0.37, r, 0 ] );
		add( g, G.cylX( r * 0.9, 0.012, 14 ), M( 0xc8a070, { rough: 0.85 } ), [ - L * 0.455, r, 0 ] );
		add( g, G.cone( 0.004, 0.035, 6 ).rotateZ( PI / 2 ), MAT.metal(), [ - L * 0.465, r, 0 ] );
		return ground( g );
	} );

	reg( 'chemlight', ( s ) => {
		// a lightstick: the flexible tube with its inner glass vial, the printed band, the hook cap
		const g = group(), c = s.color ?? 0x5aff6a;
		add( g, G.capsX( 0.0078, 0.15, 14, 4 ), M( c, { rough: 0.15, transparent: true, opacity: 0.75, emissive: c, emissiveIntensity: s.lit ? 2 : 0.25 } ), [ 0, 0.0078, 0 ] );
		add( g, G.capsX( 0.0032, 0.11, 8, 3 ), M( shade( c, 0.5 ), { rough: 0.1, emissive: c, emissiveIntensity: s.lit ? 3 : 0.35 } ), [ 0.006, 0.0078, 0 ] );
		const band = canvasTex( 'chem-band', 128, 32, ( ctx, W, H ) => { ctx.fillStyle = '#f2f2ee'; ctx.fillRect( 0, 0, W, H ); ptext( ctx, 'LIGHTSTICK · 12 HR', W / 2, H / 2, W * 0.9, H * 0.6, { color: '#111' } ); } );
		add( g, tubeUV( G.cylX( 0.0081, 0.03, 14 ) ), printed( band, { rough: 0.6 } ), [ - 0.02, 0.0078, 0 ] );
		add( g, G.cylX( 0.0095, 0.014, 14 ), M( 0x1a1a1a, { rough: 0.5 } ), [ - 0.074, 0.0078, 0 ] );
		add( g, new THREE.TorusGeometry( 0.0065, 0.0016, 4, 12 ), M( 0x1a1a1a ), [ - 0.088, 0.0078, 0 ], [ 0, PI / 2, 0 ] );
		return ground( g );
	} );

	reg( 'whistle', ( s ) => {
		// a pea whistle: the round chamber with its window, the mouthpiece, the ring and a short lanyard
		const g = group(), m = M( s.color ?? 0xf2a020, { rough: 0.32 } );
		add( g, G.lathe( [ [ 0, - 0.012 ], [ 0.011, - 0.0115 ], [ 0.0125, - 0.009 ], [ 0.0125, 0.009 ], [ 0.011, 0.0115 ], [ 0, 0.012 ] ], 22 ).rotateX( PI / 2 ), m, [ 0, 0.0125, 0 ] );
		add( g, G.rbox( 0.04, 0.012, 0.022, 0.004, 2 ), m, [ 0.022, 0.0005, 0 ] );
		add( g, G.box( 0.012, 0.003, 0.016 ), M( 0x1a1a1a, { rough: 0.6 } ), [ 0.005, 0.0235, 0 ] );
		add( g, G.box( 0.004, 0.006, 0.014 ), M( 0x1a1a1a ), [ 0.042, 0.005, 0 ] );
		add( g, new THREE.TorusGeometry( 0.006, 0.0018, 5, 12 ), MAT.metal(), [ - 0.016, 0.012, 0 ] );
		add( g, G.tube( [ [ - 0.022, 0.012, 0 ], [ - 0.04, 0.003, 0.02 ], [ - 0.06, 0.003, 0.0 ], [ - 0.075, 0.003, - 0.02 ] ], 0.002, 14, 4 ), M( 0x2a5ad0, { rough: 0.8 } ) );
		return ground( g );
	} );

	reg( 'nvg', () => {
		// a bi-ocular night-vision goggle: one big objective in front, the housing, two eyepieces with their cups,
		// the IR window and the switch, the battery cap on the side
		const g = group(), od = M( 0x2a2e26, { rough: 0.62 } ), blk = M( 0x161616, { rough: 0.7 } );
		add( g, G.rbox( 0.1, 0.06, 0.11, 0.018, 3 ), od, [ - 0.01, 0, 0 ] );
		add( g, latheX( [ [ 0.024, 0.0 ], [ 0.026, 0.01 ], [ 0.026, 0.05 ], [ 0.03, 0.055 ], [ 0.028, 0.06 ] ], 22 ), od, [ 0.04, 0.03, 0 ] );
		add( g, G.cylX( 0.0262, 0.035, 22 ), M( 0xffffff, { map: knurl( 0x2a2e26, 3 ), rough: 0.8 } ), [ 0.065, 0.03, 0 ] );
		add( g, G.dome( 0.025, 18, 6 ).scale( 1, 0.22, 1 ).rotateZ( - PI / 2 ), M( 0x2a5a3a, { rough: 0.03, metal: 0.6 } ), [ 0.1, 0.03, 0 ] );
		for ( const z of [ - 0.032, 0.032 ] ) {
			add( g, G.cylX( 0.014, 0.025, 16 ), od, [ - 0.07, 0.032, z ] );
			add( g, latheX( [ [ 0.014, 0 ], [ 0.019, - 0.005 ], [ 0.022, - 0.02 ], [ 0.017, - 0.022 ] ], 16 ), blk, [ - 0.08, 0.032, z ] );
		}
		add( g, G.cylX( 0.006, 0.006, 12 ), M( 0x3a2a2a, { rough: 0.1, metal: 0.4 } ), [ 0.04, 0.05, 0.035 ] );
		add( g, ridged( 0.009, 0.01, 10, 0.1 ), blk, [ 0.0, 0.06, - 0.03 ] );
		add( g, ridged( 0.012, 0.022, 14, 0.06 ).rotateX( PI / 2 ), blk, [ - 0.02, 0.03, 0.064 ] );
		return ground( g );
	} );

	reg( 'rangefinder', () => {
		const g = group(), body = M( 0x3a3f33, { rough: 0.65 } ), blk = M( 0x161616, { rough: 0.6 } );
		add( g, G.rbox( 0.115, 0.075, 0.042, 0.016, 3 ), body );
		add( g, G.rbox( 0.06, 0.077, 0.043, 0.01, 2 ), M( 0xffffff, { map: knurl( 0x2a2e26, 2 ), rough: 0.85 } ), [ - 0.02, - 0.001, 0 ] );
		// the receiving objective and the laser emitter side by side, the eyepiece behind
		add( g, G.cylX( 0.018, 0.012, 20 ), blk, [ 0.062, 0.042, 0 ] );
		add( g, G.dome( 0.016, 18, 5 ).scale( 1, 0.2, 1 ).rotateZ( - PI / 2 ), M( 0x2a3a6a, { rough: 0.03, metal: 0.6 } ), [ 0.068, 0.042, 0 ] );
		add( g, G.cylX( 0.006, 0.006, 12 ), M( 0x5a1a1a, { rough: 0.05, metal: 0.6 } ), [ 0.06, 0.016, 0 ] );
		add( g, latheX( [ [ 0.012, 0 ], [ 0.016, - 0.006 ], [ 0.016, - 0.016 ] ], 16 ), MAT.rubber(), [ - 0.057, 0.042, 0 ] );
		add( g, G.cylX( 0.008, 0.001, 12 ), M( 0x1a3a4a, { rough: 0.05, metal: 0.6 } ), [ - 0.073, 0.042, 0 ] );
		for ( const x of [ 0.0, 0.025 ] ) add( g, G.cyl( 0.0055, 0.0055, 0.004, 12 ), M( x ? 0x8a8e94 : 0xc02a2a, { rough: 0.4 } ), [ x, 0.075, 0 ] );
		const lab = canvasTex( 'rf-label', 128, 32, ( ctx, W, H ) => { ctx.fillStyle = '#3a3f33'; ctx.fillRect( 0, 0, W, H ); ptext( ctx, 'MAKANI 800', W / 2, H / 2, W * 0.9, H * 0.6, { weight: '900', color: '#d8d8c8' } ); } );
		add( g, G.box( 0.045, 0.011, 0.0008 ), printed( lab, { rough: 0.6 } ), [ 0.03, 0.03, 0.0212 ] );
		return g;
	} );

	reg( 'multitool', () => {
		// a closed multitool: two machined handles, the tool backs nested in the channels, the pivot screws
		const g = group(), ss = M( 0xb8bcc2, { rough: 0.22, metal: 1 } ), dark = M( 0x6a6e74, { rough: 0.35, metal: 0.9 } );
		for ( const z of [ - 0.0085, 0.0085 ] ) {
			add( g, G.rbox( 0.105, 0.016, 0.009, 0.003, 2 ), ss, [ 0, 0, z ] );
			add( g, G.box( 0.08, 0.0012, 0.004 ), dark, [ - 0.006, 0.0162, z ] );
		}
		for ( let i = 0; i < 4; i ++ ) add( g, G.box( 0.07 - i * 0.008, 0.0006, 0.0028 ), M( 0x9ea3aa, { rough: 0.3, metal: 0.95 } ), [ - 0.005, 0.0164, - 0.003 + i * 0.002 ] );
		for ( const x of [ - 0.044, 0.044 ] ) for ( const z of [ - 0.0085, 0.0085 ] ) {
			add( g, G.cylZ( 0.0035, 0.0094, 14 ), ss, [ x, 0.008, z ] );
			add( g, G.cylZ( 0.0015, 0.0098, 6 ), M( 0x1a1a1a ), [ x, 0.008, z ] );
		}
		add( g, G.box( 0.012, 0.012, 0.009 ), dark, [ 0.054, 0.002, 0 ] );
		add( g, new THREE.TorusGeometry( 0.004, 0.0012, 4, 10 ), ss, [ - 0.056, 0.008, 0 ], [ 0, PI / 2, 0 ] );
		return ground( g );
	} );

	reg( 'stove', ( s, def ) => {
		// a canister stove: the printed gas canister, the brass valve with its wire key, the burner head and three
		// serrated pot supports folded out
		const g = group(), r = 0.054;
		const spec = { bg: 0x2a6ad6, fg: 0xffffff, band: 0xf2c21a, accent: 0x1a1a1a, text: 'ISOBUTANE', sub: 'Propane mix · 230 g', style: 'band', glyph: 'sun', glyphColor: 0xf2c21a, size: 0.28, brand: 'Island Pro' };
		add( g, G.lathe( [ [ 0, 0.004 ], [ r * 0.8, 0 ], [ r, 0.012 ] ], 24 ), MAT.tin() );
		add( g, band( r, 0.012, 0.075, 26 ), printed( wrapTex( spec, packInfo( spec, def, 'chem' ), 2 * PI * r, 0.063, { max: 512 } ), { rough: 0.35, metal: 0.4 } ) );
		add( g, G.lathe( [ [ r, 0.075 ], [ r * 0.92, 0.088 ], [ r * 0.55, 0.098 ], [ r * 0.3, 0.1 ], [ r * 0.3, 0.104 ], [ 0, 0.104 ] ], 24 ), MAT.tin() );
		const brass = M( 0xc8a24a, { rough: 0.3, metal: 0.9 } ), steel = M( 0xa8acb2, { rough: 0.3, metal: 0.9 } );
		add( g, G.cyl( 0.014, 0.016, 0.022, 14 ), brass, [ 0, 0.104, 0 ] );
		add( g, G.tube( [ [ 0.012, 0.115, 0 ], [ 0.03, 0.112, 0.01 ], [ 0.045, 0.108, 0.0 ], [ 0.03, 0.112, - 0.01 ], [ 0.012, 0.115, 0 ] ], 0.0016, 16, 4 ), steel );
		add( g, G.cyl( 0.006, 0.006, 0.02, 10 ), steel, [ 0, 0.126, 0 ] );
		add( g, ridged( 0.02, 0.012, 12, 0.12 ), steel, [ 0, 0.142, 0 ] );
		for ( let i = 0; i < 3; i ++ ) {
			const a = i / 3 * PI * 2 + 0.3;
			const arm = group();
			add( arm, G.box( 0.05, 0.003, 0.004 ), steel, [ 0.025, 0, 0 ] );
			for ( let k = 0; k < 4; k ++ ) add( arm, G.box( 0.003, 0.004, 0.004 ), steel, [ 0.018 + k * 0.009, 0.002, 0 ] );
			arm.position.set( Math.cos( a ) * 0.012, 0.15, Math.sin( a ) * 0.012 ); arm.rotation.y = - a;
			g.add( arm );
		}
		return g;
	} );

	reg( 'phone', ( s ) => {
		// a smartphone face up: the lock screen (time, a beach wallpaper), the glass, the camera punch, the side keys
		const g = group(), c = s.color ?? 0x1a1a1e;
		add( g, G.rbox( 0.15, 0.0085, 0.072, 0.0085, 3 ), M( c, { rough: 0.3, metal: 0.6 } ) );
		const screen = screenTex( 'phone-lock' + ( s.cracked ? '-cracked' : '' ), 256, 128, ( ctx, W, H ) => {
			const sky = ctx.createLinearGradient( 0, 0, W, 0 ); sky.addColorStop( 0, '#f2a05a' ); sky.addColorStop( 0.55, '#d8607a' ); sky.addColorStop( 1, '#3a3a7a' );
			ctx.fillStyle = sky; ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = '#1a2a4a'; ctx.fillRect( 0, 0, W * 0.32, H );
			ctx.fillStyle = '#f6e0a0'; ctx.beginPath(); ctx.arc( W * 0.45, H * 0.6, 14, 0, PI * 2 ); ctx.fill();
			// the time reads along the phone's length (it lies with its top towards +x)
			ctx.save(); ctx.translate( W * 0.7, H / 2 ); ctx.rotate( PI / 2 );
			ptext( ctx, '10:42', 0, 0, H * 0.8, H * 0.32, { weight: 'bold', color: '#ffffff' } );
			ptext( ctx, 'Tuesday 14 June', 0, H * 0.25, H * 0.8, H * 0.09, { color: '#ffffff' } );
			ctx.restore();
			ctx.fillStyle = 'rgba(255,255,255,0.8)'; rrect( ctx, W * 0.04, H * 0.38, 4, H * 0.24, 2 ); ctx.fill();
			if ( s.cracked ) {
				ctx.strokeStyle = 'rgba(230,240,255,0.85)'; ctx.lineWidth = 1.2;
				const r = rng( 5 ), ox = W * 0.62, oy = H * 0.35;
				for ( let i = 0; i < 9; i ++ ) { ctx.beginPath(); ctx.moveTo( ox, oy ); let x = ox, y = oy; const a = r() * PI * 2; for ( let k = 0; k < 5; k ++ ) { x += Math.cos( a + ( r() - 0.5 ) * 0.8 ) * 18; y += Math.sin( a + ( r() - 0.5 ) * 0.8 ) * 18; ctx.lineTo( x, y ); } ctx.stroke(); }
				ctx.beginPath(); ctx.arc( ox, oy, 8, 0, PI * 2 ); ctx.stroke();
			}
		} );
		add( g, G.rbox( 0.143, 0.0008, 0.066, 0.0035, 1 ), screenMat( screen, s.cracked ? 0.12 : 0.3, 0.06 ), [ 0, 0.0083, 0 ] );
		add( g, G.cyl( 0.002, 0.002, 0.0006, 10 ), M( 0x050505, { rough: 0.1 } ), [ 0.064, 0.0091, 0 ] );
		for ( const [ x, w ] of [ [ 0.03, 0.022 ], [ 0.0, 0.012 ] ] ) add( g, G.rbox( w, 0.003, 0.0015, 0.0007 ), M( c, { rough: 0.3, metal: 0.6 } ), [ x, 0.003, 0.036 ] );
		return g;
	} );

	reg( 'laptop', () => {
		// a laptop open at about 110°: the keyboard deck and trackpad, the lid with a desktop on its screen
		const g = group(), alu = M( 0x8a8e94, { rough: 0.35, metal: 0.8 } );
		const W = 0.32, D = 0.22, T = 0.012;
		add( g, G.rbox( W, T, D, 0.005, 2 ), alu );
		const keys = canvasTex( 'laptop-keys', 512, 256, ( ctx, Wd, H ) => {
			ctx.fillStyle = '#7a7e84'; ctx.fillRect( 0, 0, Wd, H );
			ctx.fillStyle = '#1e1f22'; ctx.fillRect( Wd * 0.04, H * 0.04, Wd * 0.92, H * 0.52 );
			ctx.fillStyle = '#2e3034';
			const rows = 6, kw = Wd * 0.92 / 15;
			for ( let rI = 0; rI < rows; rI ++ ) for ( let k = 0; k < 15; k ++ ) { if ( rI === 5 && k > 4 && k < 10 ) continue; rrect( ctx, Wd * 0.04 + k * kw + 2, H * 0.05 + rI * H * 0.086, kw - 4, H * 0.07, 3 ); ctx.fill(); }
			rrect( ctx, Wd * 0.04 + 5 * kw + 2, H * 0.05 + 5 * H * 0.086, kw * 5 - 4, H * 0.07, 3 ); ctx.fill();
			ctx.fillStyle = '#868a90'; rrect( ctx, Wd * 0.33, H * 0.62, Wd * 0.34, H * 0.32, 8 ); ctx.fill();
		} );
		add( g, G.box( W * 0.96, 0.0006, D * 0.92 ), printed( keys, { rough: 0.5, metal: 0.3 } ), [ 0, T, 0.004 ] );
		const desk = screenTex( 'laptop-desk', 512, 320, ( ctx, Wd, H ) => {
			const sea = ctx.createLinearGradient( 0, 0, 0, H ); sea.addColorStop( 0, '#4a9ad8' ); sea.addColorStop( 0.6, '#2a6a9a' ); sea.addColorStop( 1, '#1a3a5a' );
			ctx.fillStyle = sea; ctx.fillRect( 0, 0, Wd, H );
			ctx.fillStyle = '#2a4a2a'; ctx.beginPath(); ctx.moveTo( 0, H * 0.7 ); ctx.quadraticCurveTo( Wd * 0.3, H * 0.45, Wd * 0.6, H * 0.68 ); ctx.lineTo( 0, H * 0.75 ); ctx.fill();
			ctx.fillStyle = 'rgba(245,245,240,0.95)'; rrect( ctx, Wd * 0.3, H * 0.15, Wd * 0.55, H * 0.5, 6 ); ctx.fill();
			ctx.fillStyle = '#d8dce2'; ctx.fillRect( Wd * 0.3, H * 0.15, Wd * 0.55, H * 0.07 );
			ctx.fillStyle = '#8a8e94'; for ( let i = 0; i < 6; i ++ ) ctx.fillRect( Wd * 0.33, H * 0.27 + i * H * 0.05, Wd * ( 0.3 + ( i % 3 ) * 0.07 ), 4 );
			ctx.fillStyle = 'rgba(20,20,24,0.8)'; ctx.fillRect( 0, H * 0.93, Wd, H * 0.07 );
			for ( let i = 0; i < 6; i ++ ) { ctx.fillStyle = [ '#d8402a', '#f2c21a', '#2aa84a', '#2a6ad6', '#e8e8e8', '#a04ad8' ][ i ]; rrect( ctx, Wd * 0.38 + i * 22, H * 0.94, 14, 14, 3 ); ctx.fill(); }
		} );
		const lid = group();
		add( lid, G.rbox( W, 0.007, D, 0.005, 2 ).translate( 0, 0, - D / 2 ), alu, [ 0, 0, 0 ] );
		add( lid, G.box( W * 0.9, 0.0008, D * 0.84 ).translate( 0, 0, - D / 2 ), M( 0x0a0a0c, { rough: 0.1 } ), [ 0, 0.0072, - 0.0 ] );
		add( lid, G.box( W * 0.86, 0.0006, D * 0.76 ).translate( 0, 0, - D / 2 ), screenMat( desk, 0.45, 0.08 ), [ 0, 0.0076, - D * 0.0 ] );
		// hinged at the back edge, opened to about 110°: the screen faces forward
		lid.position.set( 0, T, - D / 2 + 0.004 ); lid.rotation.x = PI - 1.95;
		g.add( lid );
		return ground( g );
	} );

	reg( 'book', ( s ) => {
		const g = group(), [ w, t, d ] = s.size || [ 0.22, 0.03, 0.15 ];
		const c = s.color ?? 0x2a4a6a, fg = s.fg ?? 0xf2e6c8;
		const thin = t < 0.012; // comics and magazines: soft covers flush with the pages
		const art = canvasTex( 'book-cover2:' + JSON.stringify( s ), 384, Math.round( 384 * d / w ), ( ctx, W, H ) => {
			const r = rng( hashStr( s.title || '' ) ), fgc = css( fg ), bgc = css( c );
			ctx.fillStyle = bgc; ctx.fillRect( 0, 0, W, H );
			// cloth / card grain and a soft vignette
			for ( let i = 0; i < 1400; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'; ctx.fillRect( r() * W, r() * H, 2, 1 ); }
			const vg = ctx.createRadialGradient( W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.75 ); vg.addColorStop( 0, 'rgba(0,0,0,0)' ); vg.addColorStop( 1, 'rgba(0,0,0,0.28)' );
			ctx.fillStyle = vg; ctx.fillRect( 0, 0, W, H );
			if ( thin ) {
				// a comic: the masthead, a starburst, the price box, the issue
				ptext( ctx, s.title || '', W * 0.5, H * 0.16, W * 0.92, H * 0.2, { weight: '900', family: '"Arial Black", Arial, sans-serif', color: fgc, outline: '#111', outlineW: 0.12 } );
				ctx.fillStyle = css( shade( c, 0.35 ) ); ctx.beginPath();
				for ( let i = 0; i < 24; i ++ ) { const a = i / 24 * PI * 2, rr = i % 2 ? H * 0.22 : H * 0.34; ctx.lineTo( W * 0.5 + Math.cos( a ) * rr, H * 0.6 + Math.sin( a ) * rr ); }
				ctx.fill();
				if ( s.glyph ) glyph( ctx, s.glyph, W * 0.5, H * 0.6, H * 0.4, fgc, bgc );
				ctx.fillStyle = '#ffffff'; ctx.fillRect( W * 0.04, H * 0.82, W * 0.16, H * 0.14 ); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.strokeRect( W * 0.04, H * 0.82, W * 0.16, H * 0.14 );
				ptext( ctx, s.sub || '#1', W * 0.12, H * 0.865, W * 0.14, H * 0.06, { weight: '900', color: '#111' } );
				ptext( ctx, '$3.99', W * 0.12, H * 0.925, W * 0.14, H * 0.045, { color: '#111' } );
				return;
			}
			// a hardback / paperback: the title panel, the device, the author, the publisher's mark
			ctx.strokeStyle = fgc; ctx.lineWidth = 2; ctx.strokeRect( W * 0.045, H * 0.05, W * 0.91, H * 0.9 );
			ctx.fillStyle = fgc; ctx.fillRect( W * 0.045, H * 0.1, W * 0.91, H * 0.27 );
			ptext( ctx, s.title || '', W * 0.5, H * 0.21, W * 0.84, H * 0.13, { weight: '900', family: '"Arial Black", Arial, sans-serif', color: bgc } );
			if ( s.sub ) ptext( ctx, s.sub, W * 0.5, H * 0.32, W * 0.78, H * 0.055, { weight: 'bold', family: 'Georgia, "Times New Roman", serif', italic: true, color: bgc } );
			if ( s.glyph ) {
				ctx.strokeStyle = fgc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc( W * 0.5, H * 0.6, H * 0.17, 0, PI * 2 ); ctx.stroke();
				glyph( ctx, s.glyph, W * 0.5, H * 0.6, H * 0.26, fgc, bgc );
			}
			const authors = [ 'K. KAHANANUI', 'L. M. AKANA', 'D. FERREIRA', 'J. NAKAMURA', 'P. KEALOHA', 'R. SILVA' ];
			ptext( ctx, authors[ Math.floor( r() * authors.length ) ], W * 0.5, H * 0.86, W * 0.6, H * 0.055, { weight: 'bold', color: fgc } );
		} );
		const cover = M( 0xffffff, { map: art, rough: thin ? 0.4 : 0.7 } );
		const coverC = M( c, { rough: thin ? 0.4 : 0.7 } );
		const pages = canvasTex( 'book-pages', 64, 64, ( ctx, W ) => { ctx.fillStyle = '#efe8d6'; ctx.fillRect( 0, 0, W, W ); ctx.fillStyle = 'rgba(120,100,70,0.18)'; for ( let y = 0; y < W; y += 2 ) ctx.fillRect( 0, y, W, 1 ); }, { repeat: true } );
		const ct = thin ? t * 0.12 : Math.min( 0.003, t * 0.12 ), ov = thin ? 0 : 0.003;
		add( g, G.box( w - ov * 2 - 0.004, t - ct * 2, d - ov * 2 ), M( 0xffffff, { map: pages, rough: 0.95 } ), [ 0.002, ct, 0 ] );
		const top = G.box( w, ct, d ); labelUV( top, 'y', 1 );
		add( g, top, cover, [ 0, t - ct, 0 ] );
		add( g, G.box( w, ct, d ), coverC );
		// the spine, rounded on a hardback, with the title along it
		const spineTex = canvasTex( 'book-spine:' + ( s.title || '' ) + c, 512, 64, ( ctx, W, H ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
			ptext( ctx, s.title || '', W * 0.45, H * 0.52, W * 0.7, H * 0.6, { weight: '900', color: css( fg ) } );
			ctx.fillStyle = css( fg ); ctx.fillRect( W * 0.9, H * 0.3, H * 0.4, H * 0.4 );
		} );
		if ( thin ) add( g, G.box( 0.002, t, d ), coverC, [ - w / 2 + 0.001, 0, 0 ] );
		else {
			const sp = new THREE.CylinderGeometry( t / 2, t / 2, d, 12, 1, true, PI, PI ).rotateX( PI / 2 );
			// u runs round the half cylinder, v along d: turn the texture so the title runs along the spine
			const uv = sp.attributes.uv; for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getY( i ), 1 - uv.getX( i ) );
			add( g, sp, M( 0xffffff, { map: spineTex, rough: 0.7 } ), [ - w / 2 + t * 0.2, t / 2, 0 ], [ 0, 0, 0 ], [ 0.5, 1, 1 ] );
		}
		return g;
	} );

	reg( 'keys', ( s ) => {
		// a split ring with a car key (rubber head, cut blade), a brass house key and the remote fob
		const g = group(), steel = M( 0xc0c4ca, { rough: 0.25, metal: 0.95 } ), brass = M( 0xd4a64a, { rough: 0.3, metal: 0.9 } );
		add( g, new THREE.TorusGeometry( 0.014, 0.0016, 5, 20 ).rotateX( PI / 2 ), steel, [ 0, 0.0016, 0 ] );
		const keyShape = ( len ) => {
			const k = new THREE.Shape();
			k.moveTo( 0, - 0.0045 ); k.lineTo( len, - 0.0045 ); k.lineTo( len + 0.004, 0 ); k.lineTo( len, 0.0045 );
			for ( let i = 0; i < 6; i ++ ) { const x = len - 0.004 - i * len / 7; k.lineTo( x, 0.0045 ); k.lineTo( x - len / 14, 0.0045 - 0.0015 * ( 1 + ( i * 7 ) % 3 ) ); }
			k.lineTo( 0, 0.0045 ); k.closePath();
			return new THREE.ExtrudeGeometry( k, { depth: 0.0018, bevelEnabled: false } ).rotateX( - PI / 2 );
		};
		const n = s.n ?? 2;
		// the house key: a round bow with a hole, the cut blade
		const bow = new THREE.Shape(); bow.absarc( 0, 0, 0.011, 0, PI * 2 ); const hole = new THREE.Path(); hole.absarc( - 0.005, 0, 0.003, 0, PI * 2, true ); bow.holes.push( hole );
		const house = group();
		add( house, new THREE.ExtrudeGeometry( bow, { depth: 0.002, bevelEnabled: false, curveSegments: 10 } ).rotateX( - PI / 2 ), brass );
		add( house, keyShape( 0.038 ), brass, [ 0.009, 0, 0 ] );
		house.position.set( 0.022, 0.0004, - 0.006 ); house.rotation.y = 0.35;
		g.add( house );
		if ( n > 1 ) {
			const car = group();
			add( car, G.rbox( 0.026, 0.008, 0.02, 0.006, 2 ), MAT.blackPlastic(), [ 0, 0, 0 ] );
			add( car, keyShape( 0.04 ), steel, [ 0.012, 0.003, 0 ] );
			car.position.set( 0.03, 0, 0.022 ); car.rotation.y = - 0.4;
			g.add( car );
		}
		if ( s.fob ) {
			const fob = group();
			add( fob, G.rbox( 0.05, 0.013, 0.03, 0.009, 3 ), M( s.fob, { rough: 0.45 } ) );
			const btn = canvasTex( 'fob-buttons', 128, 64, ( ctx, W, H ) => {
				ctx.fillStyle = '#2a2c30'; ctx.fillRect( 0, 0, W, H );
				for ( let i = 0; i < 3; i ++ ) { ctx.fillStyle = i === 2 ? '#a02a2a' : '#444'; rrect( ctx, 8 + i * 40, 10, 32, 44, 10 ); ctx.fill(); }
				ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 3; ctx.strokeRect( 18, 30, 12, 12 ); ctx.beginPath(); ctx.arc( 24, 30, 5, PI, 0 ); ctx.stroke();
				ctx.strokeRect( 58, 30, 12, 12 ); ctx.beginPath(); ctx.arc( 70, 30, 5, PI, PI * 1.6 ); ctx.stroke();
				ptext( ctx, '!', 104, 33, 20, 22, { weight: '900', color: '#f2f2f2' } );
			} );
			add( fob, G.box( 0.034, 0.0006, 0.018 ), printed( btn, { rough: 0.6 } ), [ 0.003, 0.0132, 0 ] );
			add( fob, new THREE.TorusGeometry( 0.004, 0.0014, 4, 10 ).rotateX( PI / 2 ), steel, [ - 0.027, 0.006, 0 ] );
			fob.position.set( - 0.04, 0, 0.01 ); fob.rotation.y = 0.25;
			g.add( fob );
		}
		return ground( g );
	} );

	reg( 'cash', () => {
		// a folded stack of twenties held by a paper band
		const g = group();
		const bill = canvasTex( 'bill2', 384, 160, ( ctx, W, H ) => {
			ctx.fillStyle = '#d4dcc4'; ctx.fillRect( 0, 0, W, H );
			ctx.strokeStyle = '#4a6a4a'; ctx.lineWidth = 1;
			for ( let i = 0; i < 70; i ++ ) { ctx.beginPath(); ctx.ellipse( W / 2, H / 2, 40 + i * 2.2, 20 + i * 1.2, 0, 0, PI * 2 ); ctx.globalAlpha = 0.12; ctx.stroke(); }
			ctx.globalAlpha = 1;
			ctx.strokeStyle = '#2a4a32'; ctx.lineWidth = 5; ctx.strokeRect( 7, 7, W - 14, H - 14 );
			ctx.fillStyle = '#c8d2b4'; ctx.beginPath(); ctx.ellipse( W * 0.5, H * 0.5, 38, 50, 0, 0, PI * 2 ); ctx.fill();
			ctx.fillStyle = '#3a5a3e'; ctx.beginPath(); ctx.ellipse( W * 0.5, H * 0.44, 15, 19, 0, 0, PI * 2 ); ctx.fill(); ctx.beginPath(); ctx.ellipse( W * 0.5, H * 0.72, 26, 18, 0, PI, 0 ); ctx.fill();
			ptext( ctx, '20', 38, 36, 50, 34, { weight: '900', family: 'Georgia, serif', color: '#2a4a32' } );
			ptext( ctx, '20', W - 38, H - 34, 50, 34, { weight: '900', family: 'Georgia, serif', color: '#2a4a32' } );
			ptext( ctx, 'TWENTY DOLLARS', W / 2, H - 22, W * 0.4, 14, { weight: 'bold', family: 'Georgia, serif', color: '#2a4a32' } );
			ptext( ctx, 'LEGAL TENDER', W / 2, 22, W * 0.4, 12, { weight: 'bold', family: 'Georgia, serif', color: '#2a4a32' } );
			ctx.fillStyle = '#5a7a5a'; ctx.beginPath(); ctx.arc( W * 0.2, H * 0.55, 14, 0, PI * 2 ); ctx.fill();
		} );
		const m = M( 0xffffff, { map: bill, rough: 0.9 } );
		for ( let i = 0; i < 6; i ++ ) add( g, G.box( 0.156, 0.0012, 0.066 ), m, [ ( i % 3 - 1 ) * 0.0015, i * 0.0012, ( i % 2 ) * 0.001 ], [ 0, ( i - 2.5 ) * 0.025, 0 ] );
		add( g, G.box( 0.024, 0.0095, 0.068 ), M( 0xd8c08a, { rough: 0.85 } ), [ 0.004, - 0.0005, 0 ] );
		return ground( g );
	} );

	reg( 'jewelry', ( s ) => {
		const g = group(), gold = s.silver ? M( 0xdadde2, { rough: 0.15, metal: 1 } ) : M( 0xe0b050, { rough: 0.18, metal: 1 } );
		if ( s.style === 'ring' ) {
			// the band, a four-claw setting and a cut stone
			add( g, G.torus( 0.0095, 0.0018, 10, 36 ).scale( 1, 1, 1.4 ), gold, [ 0, 0.0115, 0 ] );
			const gem = new THREE.OctahedronGeometry( 0.0042, 0 ).scale( 1, 0.8, 1 );
			add( g, facet( gem ), M( s.gem ?? 0xeaf6ff, { rough: 0.02, metal: 0.3 } ), [ 0, 0.0245, 0 ] );
			for ( let i = 0; i < 4; i ++ ) { const a = i / 4 * PI * 2 + PI / 4; add( g, G.cyl( 0.0006, 0.0008, 0.005, 5 ), gold, [ Math.cos( a ) * 0.0032, 0.021, Math.sin( a ) * 0.0032 ] ); }
			add( g, G.cyl( 0.0034, 0.002, 0.0032, 12 ), gold, [ 0, 0.0195, 0 ] );
			return g;
		}
		// a fine chain (its links in the texture) with a carved fishhook pendant
		const links = canvasTex( 'chain-links', 64, 16, ( ctx, W, H ) => {
			ctx.fillStyle = '#6a4a1a'; ctx.fillRect( 0, 0, W, H );
			for ( let x = 0; x < W; x += 16 ) { ctx.fillStyle = '#f2d080'; rrect( ctx, x + 1, 3, 13, 10, 5 ); ctx.fill(); ctx.fillStyle = '#8a6a2a'; ctx.fillRect( x + 4, 7, 7, 2 ); }
		}, { repeat: true } ).clone();
		links.repeat.set( 60, 1 ); links.needsUpdate = true;
		const ch = G.torus( 0.065, 0.0016, 4, 64 ); ch.scale( 1, 1.25, 1 );
		add( g, ch, M( 0xffffff, { map: links, rough: 0.25, metal: 0.9 } ), [ 0, 0.0016, 0 ], [ PI / 2, 0, 0 ] );
		const hook = new THREE.Shape();
		hook.moveTo( 0, 0.012 ); hook.quadraticCurveTo( 0.012, 0.01, 0.01, - 0.004 ); hook.quadraticCurveTo( 0.006, - 0.016, - 0.006, - 0.012 ); hook.lineTo( - 0.009, - 0.006 ); hook.lineTo( - 0.004, - 0.008 );
		hook.quadraticCurveTo( 0.004, - 0.008, 0.005, - 0.002 ); hook.quadraticCurveTo( 0.006, 0.006, - 0.002, 0.008 ); hook.closePath();
		add( g, new THREE.ExtrudeGeometry( hook, { depth: 0.003, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 2, curveSegments: 8 } ).rotateX( - PI / 2 ), s.pendant ? M( s.pendant, { rough: 0.2, metal: 0.1 } ) : gold, [ 0, 0.0008, 0.094 ] );
		return g;
	} );

	reg( 'ukulele', () => {
		// a koa soprano: the figure-eight body, its soundhole and rosette, the bridge, the fretted neck and the
		// headstock with four tuners, strung
		const g = group();
		const grain = canvasTex( 'koa-grain', 256, 128, ( ctx, W, H ) => {
			ctx.fillStyle = '#b0703a'; ctx.fillRect( 0, 0, W, H );
			const r = rng( 13 );
			for ( let i = 0; i < 70; i ++ ) { ctx.strokeStyle = r() < 0.5 ? 'rgba(90,40,10,0.25)' : 'rgba(255,210,150,0.18)'; ctx.lineWidth = 1 + r() * 3; ctx.beginPath(); const y = r() * H; ctx.moveTo( 0, y ); for ( let x = 0; x <= W; x += 32 ) ctx.lineTo( x, y + Math.sin( x * 0.03 + i ) * 6 ); ctx.stroke(); }
		}, { repeat: true } );
		const koa = M( 0xffffff, { map: grain, rough: 0.28 } ), dark = M( 0x2a1a10, { rough: 0.45 } ), fret = M( 0xd8dce0, { rough: 0.2, metal: 1 } );
		const outline = new THREE.Shape(), pts = [];
		for ( let i = 0; i <= 48; i ++ ) {
			const a = i / 48 * PI * 2, x = Math.cos( a ), z = Math.sin( a );
			// a waist between the upper and lower bouts
			const bout = x < 0 ? 0.09 : 0.075, waist = 1 - 0.22 * Math.exp( - Math.pow( ( x + 0.05 ) * 3.2, 2 ) );
			pts.push( new THREE.Vector2( x * 0.12 - 0.02, z * bout * waist ) );
		}
		outline.setFromPoints( pts );
		const body = new THREE.ExtrudeGeometry( outline, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 4 } ).rotateX( - PI / 2 );
		const uvs = body.attributes.uv, bp = body.attributes.position; for ( let i = 0; i < uvs.count; i ++ ) uvs.setXY( i, bp.getX( i ) * 3 + 0.5, bp.getZ( i ) * 3 + 0.5 );
		add( g, body, koa, [ - 0.08, 0.004, 0 ] );
		add( g, G.cyl( 0.024, 0.024, 0.0008, 24 ), M( 0x0a0604, { rough: 0.9 } ), [ - 0.04, 0.0585, 0 ] );
		add( g, G.torus( 0.028, 0.0018, 4, 28 ).rotateX( PI / 2 ), M( 0xe8dcc0, { rough: 0.4 } ), [ - 0.04, 0.0585, 0 ] );
		add( g, G.rbox( 0.012, 0.006, 0.06, 0.002 ), dark, [ - 0.155, 0.058, 0 ] );
		add( g, G.box( 0.27, 0.016, 0.034 ), M( 0x8a5a2a, { rough: 0.4 } ), [ 0.12, 0.043, 0 ] );
		add( g, G.box( 0.21, 0.004, 0.036 ), dark, [ 0.1, 0.059, 0 ] );
		for ( let i = 0; i < 12; i ++ ) add( g, G.box( 0.0012, 0.0012, 0.035 ), fret, [ 0.205 - 0.21 * ( 1 - Math.pow( 2, - i / 12 ) ) * 1.6, 0.063, 0 ] );
		add( g, G.box( 0.004, 0.003, 0.036 ), M( 0xf2ead8, { rough: 0.4 } ), [ 0.207, 0.0625, 0 ] );
		add( g, G.rbox( 0.075, 0.014, 0.052, 0.006 ), dark, [ 0.29, 0.042, 0 ], [ 0, 0, 0.12 ] );
		for ( const [ x, z ] of [ [ 0.27, - 0.018 ], [ 0.305, - 0.018 ], [ 0.27, 0.018 ], [ 0.305, 0.018 ] ] ) { add( g, G.cyl( 0.0035, 0.0035, 0.012, 8 ), fret, [ x, 0.055, z ] ); add( g, G.rbox( 0.012, 0.004, 0.018, 0.0015 ), M( 0xf2ead8, { rough: 0.3 } ), [ x, 0.04, z + Math.sign( z ) * 0.032 ], [ PI / 2, 0, 0 ] ); }
		for ( let i = 0; i < 4; i ++ ) add( g, G.cylX( 0.00045, 0.37, 3 ), M( 0xf2f0e8, { rough: 0.3 } ), [ 0.03, 0.0635, - 0.0105 + i * 0.007 ] );
		return ground( g );
	} );

	reg( 'duck', ( s ) => {
		// a rubber duck: the plump body with its tail flick, the head, the flat beak, wing bumps and glossy eyes
		const g = group(), y = M( s.color ?? 0xf6d21a, { rough: 0.32 } );
		const body = G.sph( 0.045, 22, 16 ); const p = body.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), yy = p.getY( i ); const flick = x < - 0.02 && yy > 0 ? ( - x - 0.02 ) * 0.9 : 0; p.setXYZ( i, x * 1.25, yy * 0.78 + flick, p.getZ( i ) ); }
		body.computeVertexNormals();
		add( g, body, y, [ 0, 0.035, 0 ] );
		add( g, G.sph( 0.03, 20, 14 ), y, [ 0.03, 0.083, 0 ] );
		const beak = G.sph( 0.016, 14, 8 ).scale( 1.25, 0.42, 1.05 );
		add( g, beak, M( 0xf2741a, { rough: 0.3 } ), [ 0.058, 0.077, 0 ] );
		for ( const z of [ - 1, 1 ] ) {
			add( g, G.sph( 0.022, 14, 8 ).scale( 1.4, 0.55, 0.45 ), y, [ - 0.006, 0.045, z * 0.04 ], [ 0, 0, 0.25 ] );
			add( g, G.sph( 0.0055, 10, 8 ), M( 0x111111, { rough: 0.08 } ), [ 0.05, 0.093, z * 0.017 ] );
			add( g, G.sph( 0.0016, 6, 4 ), MAT.white(), [ 0.054, 0.096, z * 0.019 ] );
		}
		return g;
	} );

	reg( 'trash', ( s ) => {
		// a crumpled printed wrapper
		const g = group();
		const geo = G.sph( 0.05, 9, 7 );
		const p = geo.attributes.position;
		// jitter by position (not index) so the sphere's duplicated seam vertices move together and it stays closed
		for ( let i = 0; i < p.count; i ++ ) { const k = 0.7 + ( ( Math.sin( p.getX( i ) * 131 + p.getY( i ) * 71 + p.getZ( i ) * 37 ) * 43758.5 ) % 1 + 1 ) % 1 * 0.5; p.setXYZ( i, p.getX( i ) * k, p.getY( i ) * k * 0.8, p.getZ( i ) * k ); }
		const print = canvasTex( 'trash-print', 128, 64, ( ctx, W, H ) => { ctx.fillStyle = css( s.color ?? 0xd8d4c8 ); ctx.fillRect( 0, 0, W, H ); ctx.fillStyle = 'rgba(180,40,30,0.6)'; ctx.fillRect( 0, H * 0.3, W, H * 0.2 ); ptext( ctx, 'ʻONO', W * 0.3, H * 0.4, W * 0.4, H * 0.2, { weight: '900', color: '#fff' } ); smallPrint3( ctx, W, H ); } );
		add( g, facet( geo ), M( 0xffffff, { map: print, rough: 0.85 } ), [ 0, 0.035, 0 ] );
		return g;
	} );
	function smallPrint3( ctx, W, H ) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; for ( let y = H * 0.6; y < H; y += 5 ) ctx.fillRect( 6, y, W * 0.7, 1.5 ); }

	// ================= materials =================
	const barkTex = ( c ) => canvasTex( 'bark:' + c, 64, 128, ( ctx, W, H ) => {
		ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, H );
		const r = rng( c & 0xffff );
		for ( let i = 0; i < 90; i ++ ) { ctx.fillStyle = r() < 0.6 ? `rgba(0,0,0,${0.1 + r() * 0.2})` : `rgba(255,240,210,${0.06 + r() * 0.1})`; ctx.fillRect( r() * W, r() * H, 1 + r() * 2, 6 + r() * 30 ); }
		for ( let i = 0; i < 4; i ++ ) { ctx.fillStyle = 'rgba(30,18,8,0.45)'; ctx.beginPath(); ctx.ellipse( r() * W, r() * H, 3, 5, 0, 0, PI * 2 ); ctx.fill(); }
	}, { repeat: true } );
	const endGrain = ( c ) => canvasTex( 'endgrain:' + c, 64, 64, ( ctx, W ) => {
		ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, W );
		ctx.strokeStyle = 'rgba(110,70,30,0.35)'; ctx.lineWidth = 1.2;
		for ( let r = 3; r < W / 2; r += 3.5 ) { ctx.beginPath(); ctx.arc( W / 2 + 1, W / 2 - 1, r, 0, PI * 2 ); ctx.stroke(); }
		ctx.strokeStyle = 'rgba(80,50,20,0.4)'; ctx.beginPath(); ctx.moveTo( W / 2, W / 2 ); ctx.lineTo( W * 0.9, W * 0.2 ); ctx.stroke();
		ctx.fillStyle = 'rgba(60,35,15,0.9)'; ctx.beginPath(); ctx.arc( W / 2, W / 2, W / 2, 0, PI * 2 ); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(60,35,15,0.9)'; ctx.stroke();
	} );
	// a stick: tapered, a little crooked, its cut ends pale
	function stick( g, L, r, bark, pos, yaw, seed ) {
		const rr = rng( seed ), pts = [];
		for ( let i = 0; i <= 4; i ++ ) pts.push( new THREE.Vector3( ( i / 4 - 0.5 ) * L, ( rr() - 0.5 ) * r * 1.2, ( rr() - 0.5 ) * r * 1.6 ) );
		const curve = new THREE.CatmullRomCurve3( pts );
		const geo = new THREE.TubeGeometry( curve, 10, r, 7, false );
		const p = geo.attributes.position;
		// taper towards +x
		for ( let i = 0; i < p.count; i ++ ) { const t = ( p.getX( i ) + L / 2 ) / L, c = curve.getPoint( Math.min( 1, Math.max( 0, t ) ) ), k = 1 - t * 0.25; p.setY( i, c.y + ( p.getY( i ) - c.y ) * k ); p.setZ( i, c.z + ( p.getZ( i ) - c.z ) * k ); }
		geo.computeVertexNormals();
		const m = add( g, geo, bark, pos, [ 0, yaw, 0 ] );
		const ends = M( 0xffffff, { map: endGrain( 0xc8a070 ), rough: 0.9 } );
		for ( const [ t, k ] of [ [ 0, 1 ], [ 1, 0.75 ] ] ) {
			const c = curve.getPoint( t ), tg = curve.getTangent( t );
			const cap = new THREE.CircleGeometry( r * k * 0.98, 8 ).lookAt( tg.clone().multiplyScalar( t ? 1 : - 1 ) );
			add( g, cap, ends, [ pos[ 0 ] + c.x * Math.cos( yaw ) + c.z * Math.sin( yaw ), pos[ 1 ] + c.y, pos[ 2 ] - c.x * Math.sin( yaw ) + c.z * Math.cos( yaw ) ], [ 0, yaw, 0 ] );
		}
		return m;
	}
	reg( 'stick', ( s ) => {
		const g = group(), L = s.len ?? 0.6, r = s.r ?? 0.014, n = s.n ?? 1;
		const bark = M( 0xffffff, { map: barkTex( s.color ?? 0x6a4a2e ), rough: 0.95 } );
		for ( let i = 0; i < n; i ++ ) {
			stick( g, L * ( 1 - i * 0.08 ), r * ( 1 - i * 0.1 ), bark, [ i * 0.02, r + ( i % 2 ) * r * 1.6, ( i - ( n - 1 ) / 2 ) * r * 2.2 ], ( i - 1 ) * 0.08, 17 + i * 31 );
			if ( i === 0 ) add( g, G.cylX( r * 0.45, L * 0.16, 5, r * 0.25 ), bark, [ L * 0.1, r * 1.3, r * 1.5 ], [ 0, - 0.6, 0.15 ] );
		}
		if ( s.rag ) {
			// a torch head: strips of rag wound tight, soaked dark, the top charred
			const rag = fabric( s.rag, 'canvas', shade( s.rag, - 0.25 ), { rep: 1.5, rough: 0.95 } );
			for ( let k = 0; k < 4; k ++ ) add( g, G.cylX( r * ( 2.2 + ( k % 2 ) * 0.3 ), 0.026, 12 ), rag, [ L * 0.38 + k * 0.02, r * 1.05, 0 ], [ k * 0.25, 0, ( k - 1.5 ) * 0.06 ] );
			add( g, G.cylX( r * 2.1, 0.012, 12 ), M( 0x1a1410, { rough: 0.95 } ), [ L * 0.47, r * 1.05, 0 ] );
		}
		return ground( g );
	} );
	reg( 'plank', ( s ) => {
		const g = group(), L = s.len ?? 1.2, n = s.n ?? 1;
		const t = worldTex( s.old ? 'oldplanks_d' : 'planks_d', 0.5, 0.2 );
		const m = M( 0xffffff, { map: t, rough: 0.85, key: s.old ? 'oldplank' : 'plank' } );
		const ends = M( 0xffffff, { map: endGrain( 0xc8a070 ), rough: 0.9 } );
		for ( let i = 0; i < n; i ++ ) {
			const pos = [ i * 0.03, i * 0.026, i * 0.01 ], yaw = i * 0.05;
			add( g, G.rbox( L, 0.025, 0.14, 0.003, 1 ), m, pos, [ 0, yaw, 0 ] );
			for ( const sx of [ - 1, 1 ] ) add( g, G.box( 0.0008, 0.024, 0.138 ), ends, [ pos[ 0 ] + sx * ( L / 2 + 0.0004 ) * Math.cos( yaw ), pos[ 1 ] + 0.0005, pos[ 2 ] - sx * ( L / 2 ) * Math.sin( yaw ) ], [ 0, yaw, 0 ] );
			// a couple of old nails
			if ( i === n - 1 ) for ( const x of [ - L * 0.4, L * 0.38 ] ) add( g, G.cyl( 0.003, 0.003, 0.001, 8 ), M( 0x5a4a3a, { rough: 0.5, metal: 0.7 } ), [ pos[ 0 ] + x, pos[ 1 ] + 0.025, pos[ 2 ] + 0.03 ] );
		}
		return g;
	} );
	reg( 'firewood', () => {
		// three split rounds: bark outside, pale split faces, rings on the cut ends
		const g = group(), bark = M( 0xffffff, { map: barkTex( 0x5a4028 ), rough: 0.95 } ), split = M( 0xc8a070, { rough: 0.9 } );
		const ends = M( 0xffffff, { map: endGrain( 0xc8a070 ), rough: 0.9 } );
		const log = ( x, y, z, r, a0, a1, roll ) => {
			const sub = group();
			add( sub, new THREE.CylinderGeometry( r, r, 0.4, 14, 1, true, a0, a1 - a0 ).rotateZ( PI / 2 ), bark );
			for ( const a of [ a0, a1 ] ) add( sub, G.box( 0.4, 0.001, r ).translate( 0, 0, r / 2 ), split, [ 0, 0, 0 ], [ - ( a ) + PI / 2, 0, 0 ] );
			for ( const sx of [ - 1, 1 ] ) add( sub, new THREE.CircleGeometry( r * 0.995, 14, a0 - PI / 2, a1 - a0 ).rotateY( sx * PI / 2 ), ends, [ sx * 0.2, 0, 0 ], [ 0, 0, 0 ] );
			sub.position.set( x, y, z ); sub.rotation.x = roll;
			g.add( sub );
		};
		log( 0, 0.05, - 0.052, 0.05, 0, PI * 2, 0 );
		log( 0.01, 0.05, 0.052, 0.05, 0.3, PI * 1.7, 0.6 );
		log( 0.02, 0.13, 0, 0.048, 0, PI * 2, 0 );
		return ground( g );
	} );
	reg( 'scrap', () => {
		// a torn piece of rusty corrugated sheet, a bent length of rebar and a stray bolt
		const g = group(), rust = M( 0xffffff, { map: worldTex( 'rust_d', 0.4, 0.4 ), rough: 0.75, metal: 0.55, key: 'scrap', side: THREE.DoubleSide } );
		const sheet = new THREE.PlaneGeometry( 0.24, 0.16, 16, 4 ).rotateX( - PI / 2 );
		const p = sheet.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), z = p.getZ( i ); p.setY( i, Math.sin( x * 110 ) * 0.006 + Math.max( 0, x - 0.05 ) * 0.35 + Math.max( 0, z ) * 0.08 ); }
		sheet.computeVertexNormals();
		add( g, sheet, rust, [ 0, 0.008, 0 ], [ 0, 0.3, 0 ] );
		add( g, G.tube( [ [ - 0.14, 0.008, - 0.06 ], [ - 0.04, 0.008, - 0.07 ], [ 0.03, 0.02, - 0.04 ], [ 0.09, 0.05, - 0.02 ] ], 0.006, 16, 6 ), M( 0x6a3a22, { rough: 0.8, metal: 0.5 } ) );
		add( g, G.cyl( 0.007, 0.007, 0.006, 6 ), MAT.darkMetal(), [ - 0.07, 0, 0.07 ] );
		add( g, G.cyl( 0.004, 0.004, 0.035, 8 ), MAT.darkMetal(), [ - 0.07, 0.004, 0.07 ], [ PI / 2, 0, 0.4 ] );
		return ground( g );
	} );
	reg( 'wire', ( s ) => {
		// a hank of copper wire, its turns not quite even, one end sprung loose
		const g = group(), m = M( s.color ?? 0xb87333, { rough: 0.28, metal: 0.95 } );
		for ( let i = 0; i < 12; i ++ ) add( g, G.torus( 0.068 + ( i % 4 ) * 0.0025, 0.0018, 3, 28 ), m, [ ( i % 3 ) * 0.003, 0.002 + i * 0.0018, ( i % 2 ) * 0.003 ], [ PI / 2 + ( i % 3 - 1 ) * 0.03, 0, i * 0.4 ] );
		for ( const a of [ 0, PI * 0.66, PI * 1.33 ] ) add( g, G.torus( 0.006, 0.0012, 4, 10 ), m, [ Math.cos( a ) * 0.07, 0.012, Math.sin( a ) * 0.07 ], [ 0, - a, 0 ] );
		add( g, G.tube( [ [ 0.07, 0.022, 0 ], [ 0.1, 0.02, 0.02 ], [ 0.12, 0.004, 0.06 ], [ 0.1, 0.002, 0.1 ] ], 0.0018, 16, 4 ), m );
		return g;
	} );
	reg( 'pipe', ( s ) => {
		// galvanised pipe: threads cut at both ends, a coupling on one, the bore dark
		const g = group(), L = s.len ?? 0.7, r = 0.022;
		const galv = M( s.color ?? 0x7a7e84, { rough: 0.5, metal: 0.8 } );
		add( g, G.cylX( r, L * 0.92, 18 ), galv, [ 0, r, 0 ] );
		for ( const sx of [ - 1, 1 ] ) add( g, ridged( r * 0.98, L * 0.04, 18, 0.05 ).rotateZ( PI / 2 ), M( 0x9ea3aa, { rough: 0.35, metal: 0.9 } ), [ sx * L * 0.48, r, 0 ] );
		add( g, ridged( r * 1.25, 0.04, 8, 0.03 ).rotateZ( - PI / 2 ), galv, [ L / 2 - 0.035, r, 0 ] );
		for ( const sx of [ - 1, 1 ] ) add( g, new THREE.CircleGeometry( r * 0.78, 16 ).rotateY( sx * PI / 2 ), M( 0x141414, { rough: 0.9 } ), [ sx * ( L / 2 + ( sx > 0 ? 0.006 : 0.0 ) ) - sx * 0.001, r, 0 ] );
		return ground( g );
	} );
	reg( 'folded', ( s ) => { // tarp, cloth, rags
		const g = group(), [ w, h, d ] = s.size || [ 0.3, 0.05, 0.22 ], c = s.color ?? 0x2a5aa8;
		const m = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: s.rep ?? 2 } ) : s.grommets ? fabric( c, 'weave', shade( c, - 0.12 ), { rep: 8, rough: 0.6 } ) : M( c, { rough: s.rough ?? 0.8 } );
		if ( s.style === 'rags' ) {
			// torn strips of old cloth in a loose heap, a frayed edge or two, a stain
			const cloth = M( 0xffffff, { map: canvasTex( 'rags:' + c, 128, 128, ( ctx, W ) => {
				ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, W );
				const r = rng( 3 ); for ( let i = 0; i < 1800; i ++ ) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'; ctx.fillRect( r() * W, r() * W, 2, 1 ); }
				ctx.fillStyle = 'rgba(120,90,50,0.25)'; ctx.beginPath(); ctx.ellipse( W * 0.6, W * 0.4, 18, 12, 0.4, 0, PI * 2 ); ctx.fill();
				ctx.strokeStyle = 'rgba(60,40,20,0.3)'; ctx.lineWidth = 1; for ( let y = 0; y < W; y += 4 ) { ctx.beginPath(); ctx.moveTo( 0, y ); ctx.lineTo( 3 + r() * 4, y ); ctx.stroke(); }
			}, { repeat: true } ), rough: 0.95, side: THREE.DoubleSide } );
			for ( let i = 0; i < 4; i ++ ) {
				const sheet = new THREE.PlaneGeometry( w * ( 0.9 - i * 0.12 ), d * ( 0.5 + ( i % 2 ) * 0.25 ), 8, 5 ).rotateX( - PI / 2 );
				const p = sheet.attributes.position, rr = rng( 11 + i );
				for ( let k = 0; k < p.count; k ++ ) p.setY( k, 0.004 + Math.abs( Math.sin( p.getX( k ) * 60 + i ) * Math.cos( p.getZ( k ) * 50 ) ) * 0.012 + rr() * 0.003 );
				sheet.computeVertexNormals();
				add( g, sheet, cloth, [ ( i - 1.5 ) * 0.012, i * 0.005, ( i % 2 - 0.5 ) * 0.02 ], [ 0, i * 0.9 + 0.3, 0 ] );
			}
			return ground( g );
		}
		// the folded layers, each a little off the one below, their folded edges rounded
		const n = Math.max( 2, Math.round( h / 0.012 ) ), lh = h / n;
		for ( let i = 0; i < n; i ++ ) add( g, G.rbox( w * ( 1 - ( i % 2 ) * 0.015 ), lh * 1.02, d * ( 1 - ( i % 3 ) * 0.01 ), lh * 0.5, 2 ), m, [ ( i % 2 ) * 0.004 - 0.002, i * lh, ( i % 3 - 1 ) * 0.003 ], [ 0, ( i % 2 - 0.5 ) * 0.02, 0 ] );
		if ( s.grommets ) {
			for ( const x of [ - w * 0.4, w * 0.4 ] ) add( g, G.torus( 0.008, 0.0022, 6, 14 ), MAT.metal(), [ x, h + 0.0005, d * 0.4 ], [ PI / 2, 0, 0 ] );
			add( g, G.box( w * 1.002, 0.003, 0.014 ), M( shade( c, - 0.2 ), { rough: 0.6 } ), [ 0, h - 0.0005, d / 2 - 0.006 ] );
		}
		return g;
	} );
	reg( 'hide', ( s ) => {
		// a scraped hide: the stretched outline with its legs, hair on top, a curled leather edge
		const g = group(), c = s.color ?? 0x6a4a30;
		const fur = canvasTex( 'fur:' + c, 128, 128, ( ctx, W ) => {
			ctx.fillStyle = css( c ); ctx.fillRect( 0, 0, W, W );
			const r = rng( 3 );
			for ( let i = 0; i < 1400; i ++ ) { const x = r() * W, y = r() * W; ctx.strokeStyle = r() < 0.5 ? css( shade( c, - 0.3 ) ) : css( shade( c, 0.2 ) ); ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo( x, y ); ctx.lineTo( x + 2 + r() * 3, y + 4 + r() * 4 ); ctx.stroke(); }
			ctx.globalAlpha = 1;
		}, { repeat: true } );
		const shape = new THREE.Shape(), pts = [];
		for ( let i = 0; i < 40; i ++ ) {
			const a = i / 40 * PI * 2;
			const legs = Math.pow( Math.max( 0, Math.cos( 2 * ( a - PI / 4 ) ) ), 6 ) * 0.45;
			const k = 1 + legs + 0.06 * Math.sin( a * 7 ) - ( Math.abs( Math.cos( a ) ) > 0.97 ? 0.1 : 0 );
			pts.push( new THREE.Vector2( Math.cos( a ) * 0.24 * k, Math.sin( a ) * 0.17 * k ) );
		}
		shape.setFromPoints( pts );
		const geo = new THREE.ExtrudeGeometry( shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 2 } ).rotateX( - PI / 2 );
		const p = geo.attributes.position, uv = geo.attributes.uv;
		for ( let i = 0; i < p.count; i ++ ) { const x = p.getX( i ), z = p.getZ( i ); p.setY( i, p.getY( i ) + 0.012 * Math.max( 0, Math.hypot( x / 0.24, z / 0.17 ) - 0.75 ) * 2 + 0.004 * Math.sin( x * 30 ) ); uv.setXY( i, x * 4, z * 4 ); }
		geo.computeVertexNormals();
		add( g, geo, M( 0xffffff, { map: fur, rough: 0.95 } ) );
		return ground( g );
	} );
	reg( 'stone', ( s ) => {
		const g = group(), r = s.r ?? 0.06;
		// a few water-worn basalt stones: rounded, pitted, their tops lighter where they dried
		const tex = gradTex();
		for ( const [ x, z, k, seed ] of [ [ 0, 0, 1, 1 ], [ r * 1.3, r * 0.5, 0.65, 2 ], [ - r * 0.6, r * 1.1, 0.5, 3 ] ] ) {
			const geo = new THREE.IcosahedronGeometry( r * k, 2 );
			const p = geo.attributes.position, rr = rng( seed * 77 );
			const bumps = [ 0, 1, 2 ].map( () => new THREE.Vector3( rr() - 0.5, rr() - 0.5, rr() - 0.5 ).normalize() );
			for ( let i = 0; i < p.count; i ++ ) {
				const v = new THREE.Vector3( p.getX( i ), p.getY( i ), p.getZ( i ) ), n = v.clone().normalize();
				let f = 1; for ( const b of bumps ) f += 0.12 * n.dot( b ); f += 0.03 * Math.sin( v.x * 300 + v.z * 200 );
				p.setXYZ( i, v.x * f * 1.15, v.y * f * 0.62, v.z * f );
			}
			geo.computeVertexNormals();
			add( g, geo, M( s.color ?? 0x4a4644, { map: tex, rough: 0.9 } ), [ x, 0, z ], [ 0, seed, 0 ] );
		}
		return ground( g );
	} );
	// pits and grains over white, multiplied by the stone's own colour; lighter on top where it dried
	function gradTex() {
		return canvasTex( 'stone-grain', 64, 64, ( ctx, W ) => {
			const gr = ctx.createLinearGradient( 0, 0, 0, W ); gr.addColorStop( 0, '#ffffff' ); gr.addColorStop( 1, '#a8a8a8' );
			ctx.fillStyle = gr; ctx.fillRect( 0, 0, W, W );
			const r = rng( 5 ); for ( let i = 0; i < 320; i ++ ) { ctx.fillStyle = r() < 0.7 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)'; ctx.fillRect( r() * W, r() * W, 1 + r(), 1 + r() ); }
		} );
	}
	reg( 'feathers', () => {
		// a few long flight feathers: the quill, the barbed vane, banded
		const g = group();
		const vane = ( c1, c2, key ) => canvasTex( 'feather:' + key, 128, 32, ( ctx, W, H ) => {
			ctx.clearRect( 0, 0, W, H );
			for ( let x = 0; x < W; x += 2 ) { ctx.strokeStyle = ( Math.floor( x / 16 ) % 2 ) ? css( c1 ) : css( c2 ); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo( x, H / 2 ); ctx.lineTo( x + 10, 0 ); ctx.moveTo( x, H / 2 ); ctx.lineTo( x + 10, H ); ctx.stroke(); }
			ctx.fillStyle = '#f2ead8'; ctx.fillRect( 0, H / 2 - 1, W, 2 );
		} );
		const looks = [ [ 0xe8e0d0, 0xb8a890, 'w' ], [ 0x3a3028, 0x7a6a58, 'd' ] ];
		for ( let i = 0; i < 4; i ++ ) {
			const [ c1, c2, k ] = looks[ i % 2 ];
			const shape = new THREE.Shape();
			shape.moveTo( - 0.09, 0 ); shape.quadraticCurveTo( - 0.02, 0.024, 0.09, 0.006 ); shape.lineTo( 0.095, 0 ); shape.lineTo( 0.09, - 0.005 ); shape.quadraticCurveTo( - 0.02, - 0.018, - 0.09, 0 );
			const geo = new THREE.ShapeGeometry( shape, 6 ).rotateX( - PI / 2 );
			const uv = geo.attributes.uv, p = geo.attributes.position;
			for ( let j = 0; j < uv.count; j ++ ) uv.setXY( j, ( p.getX( j ) + 0.09 ) / 0.185, 0.5 - p.getZ( j ) / 0.05 );
			add( g, geo, M( 0xffffff, { map: vane( c1, c2, k ), rough: 0.9, side: THREE.DoubleSide, transparent: false } ), [ 0.02, 0.003 + i * 0.002, ( i - 1.5 ) * 0.022 ], [ 0, ( i - 1.5 ) * 0.22, 0 ] );
			add( g, G.cylX( 0.0013, 0.21, 4, 0.0006 ), M( 0xf2ead8, { rough: 0.5 } ), [ 0.0, 0.004 + i * 0.002, ( i - 1.5 ) * 0.022 ], [ 0, ( i - 1.5 ) * 0.22, 0 ] );
		}
		return ground( g );
	} );
	reg( 'bone', () => {
		// a long bone: the shaft with a slight bow, knobbed ends (two condyles at one, the round head at the other)
		const g = group(), m = M( 0xe8dcc0, { rough: 0.65 } );
		add( g, latheX( [ [ 0.012, - 0.09 ], [ 0.0105, - 0.05 ], [ 0.0095, 0 ], [ 0.0105, 0.05 ], [ 0.013, 0.09 ] ], 12 ), m, [ 0, 0.018, 0 ], [ 0, 0, 0.03 ] );
		for ( const z of [ - 0.011, 0.011 ] ) add( g, G.sph( 0.016, 12, 8 ).scale( 1, 0.95, 0.9 ), m, [ 0.1, 0.017, z ] );
		add( g, G.sph( 0.018, 12, 8 ), m, [ - 0.1, 0.019, 0.006 ] );
		add( g, G.sph( 0.011, 10, 6 ), m, [ - 0.095, 0.012, - 0.014 ] );
		return ground( g );
	} );
	reg( 'lei', ( s ) => {
		const g = group(), style = s.style || ( s.colors ? ( lumOf( s.colors[ 0 ] ) > 0.5 ? 'shell' : 'nut' ) : 'flower' );
		const cols = s.colors || [ 0xf2f2ee, 0xf5c542, 0xe8607a ];
		const N = style === 'flower' ? 24 : style === 'shell' ? 40 : 22;
		const ring = ( i ) => { const a = i / N * PI * 2; return [ Math.cos( a ) * 0.13, Math.sin( a ) * 0.1, a ]; };
		if ( style === 'flower' ) {
			// plumeria: five overlapping petals, a yellow throat
			const petal = new THREE.CircleGeometry( 0.011, 8 ).scale( 1.6, 0.8, 1 ).translate( 0.012, 0, 0 ).rotateX( - PI / 2 );
			for ( let i = 0; i < N; i ++ ) {
				const [ x, z, a ] = ring( i ), c = cols[ i % cols.length ];
				for ( let k = 0; k < 5; k ++ ) add( g, petal, M( c, { rough: 0.7, side: THREE.DoubleSide } ), [ x, 0.012 + k * 0.0005, z ], [ 0.3 * Math.sin( k ), a + k / 5 * PI * 2, 0.25 ] );
				add( g, G.sph( 0.005, 6, 4 ), M( 0xf5c542, { rough: 0.6 } ), [ x, 0.012, z ] );
			}
		} else {
			// shells or polished nuts on a cord
			add( g, G.torus( 0.115, 0.0012, 3, 48 ).scale( 1.13, 0.87, 1 ), M( 0x3a2a1a, { rough: 0.8 } ), [ 0, 0.006, 0 ], [ PI / 2, 0, 0 ] );
			for ( let i = 0; i < N; i ++ ) {
				const [ x, z, a ] = ring( i ), c = cols[ i % cols.length ];
				if ( style === 'shell' ) add( g, G.cyl( 0.006, 0.006, 0.0035, 10 ), M( c, { rough: 0.45 } ), [ x, 0.004, z ], [ PI / 2, - a, 0 ] );
				else add( g, G.sph( 0.013, 10, 6 ).scale( 1.1, 0.85, 0.95 ), M( c, { rough: 0.12, metal: 0.1 } ), [ x, 0.011, z ], [ 0, - a, 0 ] );
			}
		}
		return ground( g );
	} );
	reg( 'tiki', () => {
		// a carved koʻa: the brow, the wide eyes, the grimacing mouth, carved bands; on its back
		const g = group(), grain = canvasTex( 'tiki-wood', 128, 128, ( ctx, W ) => {
			ctx.fillStyle = '#6a4428'; ctx.fillRect( 0, 0, W, W );
			const r = rng( 8 ); for ( let i = 0; i < 40; i ++ ) { ctx.strokeStyle = r() < 0.5 ? 'rgba(30,15,5,0.3)' : 'rgba(200,150,100,0.15)'; ctx.lineWidth = 1 + r() * 2; const x = r() * W; ctx.beginPath(); ctx.moveTo( x, 0 ); ctx.bezierCurveTo( x + 6, W * 0.3, x - 6, W * 0.6, x + 3, W ); ctx.stroke(); }
		}, { repeat: true } );
		const m = M( 0xffffff, { map: grain, rough: 0.8 } ), d = M( 0x2a1a0e, { rough: 0.9 } );
		add( g, G.lathe( [ [ 0, 0 ], [ 0.055, 0 ], [ 0.058, 0.03 ], [ 0.05, 0.06 ], [ 0.056, 0.1 ], [ 0.052, 0.13 ], [ 0.06, 0.16 ], [ 0.058, 0.25 ], [ 0.05, 0.28 ], [ 0.03, 0.3 ], [ 0, 0.3 ] ], 14 ), m );
		add( g, G.rbox( 0.11, 0.024, 0.04, 0.008 ), m, [ 0, 0.225, 0.032 ] );
		for ( const x of [ - 0.024, 0.024 ] ) { add( g, G.sph( 0.017, 10, 8 ).scale( 1, 1, 0.5 ), m, [ x, 0.205, 0.05 ] ); add( g, G.sph( 0.009, 8, 6 ).scale( 1, 1, 0.5 ), d, [ x, 0.205, 0.057 ] ); }
		add( g, G.cone( 0.012, 0.03, 6 ).scale( 1, 1, 0.6 ), m, [ 0, 0.16, 0.055 ] );
		add( g, G.rbox( 0.07, 0.03, 0.02, 0.008 ), d, [ 0, 0.118, 0.045 ] );
		for ( let i = 0; i < 5; i ++ ) add( g, G.box( 0.007, 0.012, 0.006 ), M( 0xd8c8a8, { rough: 0.6 } ), [ - 0.024 + i * 0.012, 0.128, 0.056 ] );
		for ( const y of [ 0.04, 0.075 ] ) add( g, G.torus( 0.054, 0.004, 4, 16 ).rotateX( PI / 2 ), d, [ 0, y, 0 ] );
		const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
		inner.rotation.z = - PI / 2; g.add( inner );
		return ground( g );
	} );
	reg( 'surfboard', ( s ) => {
		const g = group(), L = s.len ?? 2.1;
		// the outline, the rocker (nose lifted), the stringer, the deck pad, three fins and the leash plug
		const shape = new THREE.Shape(), pts = 24;
		const half = ( t ) => 0.27 * Math.pow( Math.sin( t * PI ), 0.55 ) * ( t > 0.82 ? 1 - ( t - 0.82 ) * 1.4 : 1 ) * ( t < 0.08 ? 0.85 + t * 1.8 : 1 );
		for ( let i = 0; i <= pts; i ++ ) { const t = i / pts; i ? shape.lineTo( ( t - 0.5 ) * L, half( t ) ) : shape.moveTo( ( t - 0.5 ) * L, half( t ) ); }
		for ( let i = pts; i >= 0; i -- ) { const t = i / pts; shape.lineTo( ( t - 0.5 ) * L, - half( t ) ); }
		const geo = new THREE.ExtrudeGeometry( shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.016, bevelSegments: 3, curveSegments: 4 } );
		geo.rotateX( - PI / 2 );
		const p = geo.attributes.position;
		const rocker = ( x ) => { const t = x / L + 0.5; return 0.12 * Math.pow( Math.max( 0, t - 0.7 ) / 0.3, 2 ) + 0.03 * Math.pow( Math.max( 0, 0.15 - t ) / 0.15, 2 ); };
		for ( let i = 0; i < p.count; i ++ ) p.setY( i, p.getY( i ) + rocker( p.getX( i ) ) );
		geo.computeVertexNormals();
		const deck = canvasTex( 'surf-deck:' + ( s.color ?? 0xf2ede0 ) + ( s.stripe ?? 0x2a8ad6 ), 512, 128, ( ctx, W, H ) => {
			ctx.fillStyle = css( s.color ?? 0xf2ede0 ); ctx.fillRect( 0, 0, W, H );
			ctx.fillStyle = css( shade( s.color ?? 0xf2ede0, - 0.15 ) ); ctx.fillRect( 0, H / 2 - 1, W, 2 );
			ctx.fillStyle = css( s.stripe ?? 0x2a8ad6 ); ctx.fillRect( W * 0.2, H * 0.32, W * 0.6, 3 ); ctx.fillRect( W * 0.2, H * 0.66, W * 0.6, 3 );
			ptext( ctx, 'NALU SHAPES', W * 0.62, H * 0.5, W * 0.2, H * 0.12, { weight: '900', family: 'Georgia, serif', italic: true, color: css( s.stripe ?? 0x2a8ad6 ) } );
			ctx.fillStyle = '#2a2a2c'; rrect( ctx, W * 0.03, H * 0.18, W * 0.12, H * 0.64, 14 ); ctx.fill();
			ctx.strokeStyle = '#3e3e42'; ctx.lineWidth = 2; for ( let y = H * 0.24; y < H * 0.8; y += 6 ) { ctx.beginPath(); ctx.moveTo( W * 0.035, y ); ctx.lineTo( W * 0.145, y ); ctx.stroke(); }
		} );
		const uv = geo.attributes.uv; for ( let i = 0; i < p.count; i ++ ) uv.setXY( i, p.getX( i ) / L + 0.5, 0.5 - p.getZ( i ) / 0.58 );
		add( g, geo, M( 0xffffff, { map: deck, rough: 0.22 } ), [ 0, 0.015, 0 ] );
		for ( const [ z, a ] of [ [ - 0.12, 0.08 ], [ 0, 0 ], [ 0.12, - 0.08 ] ] ) add( g, G.cone( 0.05, 0.1, 3 ).scale( 1, 1, 0.08 ).rotateZ( PI ), M( 0x1a1a1a, { rough: 0.35 } ), [ - L * 0.42 + Math.abs( z ) * 0.3, 0.015, z ], [ 0, a, 0 ] );
		add( g, G.cyl( 0.008, 0.008, 0.003, 10 ), MAT.darkMetal(), [ - L * 0.47, 0.072, 0 ] );
		return ground( g );
	} );
	reg( 'bundle', ( s ) => { // campfire kit: sticks tied with a rag, a twist of tinder
		const g = group(), bark = M( 0xffffff, { map: barkTex( 0x6a4a2e ), rough: 0.95 } );
		for ( let i = 0; i < 6; i ++ ) stick( g, 0.45, 0.014 + ( i % 3 ) * 0.002, bark, [ 0, 0.015 + ( i >= 3 ? 0.026 : 0 ), ( i % 3 - 1 ) * 0.03 + ( i >= 3 ? 0.015 : 0 ) ], ( i - 2.5 ) * 0.04, 91 + i * 13 );
		const rag = fabric( s.rag ?? 0xd8cfc0, 'canvas', shade( s.rag ?? 0xd8cfc0, - 0.2 ), { rep: 1, rough: 0.95 } );
		for ( const x of [ - 0.12, 0.12 ] ) add( g, G.cylX( 0.05, 0.03, 12 ).scale( 1, 1, 1.05 ), rag, [ x, 0.048, 0.012 ] );
		// a twist of dry grass for tinder, tucked under the ties
		for ( let i = 0; i < 9; i ++ ) add( g, G.cylX( 0.0018, 0.16, 4 ), M( i % 2 ? 0xc8b07a : 0xa89058, { rough: 1 } ), [ 0.0, 0.074 + ( i % 3 ) * 0.003, ( i - 4 ) * 0.004 ], [ 0, ( i - 4 ) * 0.04, ( i % 3 - 1 ) * 0.05 ] );
		return ground( g );
	} );
	reg( 'paper', () => {
		// a folded newspaper: the front page up, the fold rounded along one edge
		const g = group();
		const t = canvasTex( 'newspaper2', 384, 256, ( ctx, W, H ) => {
			ctx.fillStyle = '#ece6d4'; ctx.fillRect( 0, 0, W, H );
			ptext( ctx, 'THE ISLAND TRIBUNE', W / 2, 26, W * 0.9, 30, { weight: '900', family: 'Georgia, "Times New Roman", serif', color: '#1a1a1a' } );
			ctx.fillStyle = '#1a1a1a'; ctx.fillRect( 12, 44, W - 24, 2 ); ctx.fillRect( 12, 62, W - 24, 1 );
			ptext( ctx, 'HONOLULU · TUESDAY · 50¢', W / 2, 53, W * 0.6, 10, { color: '#333' } );
			ptext( ctx, 'OUTBREAK SPREADS TO OUTER ISLANDS', W / 2, 84, W * 0.92, 24, { weight: '900', family: 'Georgia, serif', color: '#1a1a1a' } );
			ctx.fillStyle = '#8a8a86'; ctx.fillRect( 14, 104, W * 0.48, H * 0.42 );
			ctx.fillStyle = '#6a6a66'; ctx.beginPath(); ctx.moveTo( 14, 104 + H * 0.42 ); ctx.lineTo( 80, 150 ); ctx.lineTo( 130, 180 ); ctx.lineTo( 14 + W * 0.48, 140 ); ctx.lineTo( 14 + W * 0.48, 104 + H * 0.42 ); ctx.fill();
			const r = rng( 4 );
			ctx.fillStyle = '#4a4a46';
			for ( let c = 0; c < 2; c ++ ) for ( let y = 108; y < H - 10; y += 6 ) ctx.fillRect( W * 0.54 + c * W * 0.23, y, W * 0.2 * ( 0.75 + r() * 0.25 ), 2.5 );
			for ( let y = 104 + H * 0.45; y < H - 10; y += 6 ) ctx.fillRect( 14, y, W * 0.48 * ( 0.8 + r() * 0.2 ), 2.5 );
		} );
		const m = M( 0xffffff, { map: t, rough: 0.92 } ), blank = M( 0xe2dcca, { rough: 0.95 } );
		add( g, G.box( 0.3, 0.004, 0.2 ), blank );
		const top = G.box( 0.3, 0.0015, 0.2 ); labelUV( top, 'y', 1 );
		add( g, top, m, [ 0, 0.0045, 0 ] );
		add( g, new THREE.CylinderGeometry( 0.003, 0.003, 0.2, 8, 1, true, PI, PI ).rotateX( PI / 2 ), blank, [ - 0.15, 0.003, 0 ] );
		return g;
	} );
	reg( 'sparkplug', () => {
		// the terminal nut, the ribbed white insulator, the hex, the thread and the bent ground electrode
		const g = group(), y = 0.011, steel = M( 0xb8bcc2, { rough: 0.28, metal: 0.95 } );
		add( g, latheX( [ [ 0, - 0.072 ], [ 0.003, - 0.072 ], [ 0.0035, - 0.066 ], [ 0.003, - 0.064 ], [ 0.0045, - 0.06 ], [ 0.0058, - 0.055 ], [ 0.0058, - 0.05 ], [ 0.0068, - 0.046 ], [ 0.0058, - 0.042 ], [ 0.0068, - 0.038 ], [ 0.0058, - 0.034 ], [ 0.0068, - 0.03 ], [ 0.0058, - 0.026 ], [ 0.0075, - 0.012 ], [ 0.0075, - 0.008 ] ], 16 ), M( 0xf2f0ea, { rough: 0.25 } ), [ 0, y, 0 ] );
		add( g, G.cylX( 0.0105, 0.012, 6 ), steel, [ - 0.002, y, 0 ] );
		add( g, G.cylX( 0.0085, 0.004, 16 ), steel, [ 0.006, y, 0 ] );
		add( g, ridged( 0.007, 0.022, 14, 0.12 ).rotateZ( - PI / 2 ), steel, [ 0.008, y, 0 ] );
		add( g, G.cylX( 0.0012, 0.004, 6 ), M( 0x8a8e94, { metal: 0.9, rough: 0.3 } ), [ 0.032, y, 0 ] );
		add( g, G.box( 0.004, 0.0015, 0.003 ), steel, [ 0.033, y + 0.005, 0 ] );
		add( g, G.box( 0.0015, 0.0055, 0.003 ), steel, [ 0.035, y + 0.0015, 0 ] );
		return ground( g );
	} );
	reg( 'propane', ( s, def ) => {
		// a 1 lb camping cylinder: the domed shoulders, the printed wrap, the valve in its collar
		const g = group(), c = s.color ?? 0x2a6ad6, r = 0.055;
		const paint = M( c, { rough: 0.3, metal: 0.45 } );
		add( g, G.lathe( [ [ 0, 0.006 ], [ r * 0.8, 0 ], [ r * 0.98, 0.008 ], [ r, 0.016 ] ], 26 ), paint );
		const spec = { bg: c, fg: 0xffffff, band: 0xf2f2ee, accent: 0xd02a2a, text: 'PROPANE', sub: 'Camping fuel · 16.4 oz', style: 'band', glyph: 'sun', glyphColor: 0xf2c21a, size: 0.3, brand: 'Island Pro' };
		add( g, band( r, 0.016, 0.155, 26 ), printed( wrapTex( spec, packInfo( spec, def, 'chem' ), 2 * PI * r, 0.139, { max: 512 } ), { rough: 0.3, metal: 0.4 } ) );
		add( g, G.lathe( [ [ r, 0.155 ], [ r * 0.92, 0.18 ], [ r * 0.62, 0.198 ], [ r * 0.3, 0.205 ], [ 0, 0.206 ] ], 26 ), paint );
		add( g, G.lathe( [ [ 0.02, 0.2 ], [ 0.024, 0.205 ], [ 0.024, 0.222 ], [ 0.02, 0.224 ] ], 18 ), paint );
		add( g, G.cyl( 0.011, 0.012, 0.022, 14 ), MAT.metal(), [ 0, 0.204, 0 ] );
		add( g, ridged( 0.008, 0.01, 10, 0.08 ), M( 0xc8a24a, { rough: 0.3, metal: 0.9 } ), [ 0, 0.224, 0 ] );
		return g;
	} );

	// ---- a generic assembly from primitives: parts: [ [ shape, dims, colour, pos?, rot?, { rough, metal } ] ]
	// shape: box [w,h,d] | rbox [w,h,d,r] | cyl [r,h] | cylX [r,len] | sph [r] | torus [R,r]
	reg( 'parts', ( s, def ) => {
		// a few parts items have a proper model by `kind`; the primitive list stays the fallback
		if ( s.kind && PART_KINDS[ s.kind ] ) return PART_KINDS[ s.kind ]( s, def );
		const g = group();
		for ( const [ shape, d, c, p, r, o ] of s.parts || [] ) {
			const geo = shape === 'box' ? G.box( ...d ) : shape === 'rbox' ? G.rbox( ...d ) : shape === 'cyl' ? G.cyl( d[ 0 ], d[ 2 ] ?? d[ 0 ], d[ 1 ], 14 )
				: shape === 'cylX' ? G.cylX( d[ 0 ], d[ 1 ], 12 ) : shape === 'cylZ' ? G.cylZ( d[ 0 ], d[ 1 ], 12 ) : shape === 'sph' ? G.sph( d[ 0 ], 12, 8 ) : G.torus( d[ 0 ], d[ 1 ], 5, 16 );
			add( g, geo, M( c, { rough: o?.rough ?? 0.6, metal: o?.metal ?? 0, emissive: o?.emissive } ), p, r );
		}
		return s.ground === false ? g : ground( g );
	} );
	const PART_KINDS = {
		// a windlass tourniquet: the band in a loose loop, the clip, the windlass rod, the red tip, the time strap
		tourniquet() {
			const g = group(), blk = M( 0x1a1a1a, { rough: 0.85 } ), red = M( 0xc0282a, { rough: 0.6 } );
			const web = fabric( 0x1a1a1a, 'weave', 0x262626, { rep: 10, rough: 0.9 } );
			const loop = new THREE.CylinderGeometry( 0.05, 0.05, 0.038, 30, 1, true ).scale( 1.3, 1, 0.8 );
			add( g, loop, web, [ 0, 0.019, 0 ] );
			add( g, new THREE.CylinderGeometry( 0.0495, 0.0495, 0.038, 30, 1, true ).scale( 1.3, 1, 0.8 ), M( 0x141414, { rough: 0.9, side: THREE.BackSide } ), [ 0, 0.019, 0 ] );
			add( g, G.rbox( 0.11, 0.008, 0.038, 0.003 ), web, [ 0.08, 0.004, 0.0 ], [ 0, 0.25, 0 ] );
			add( g, G.rbox( 0.022, 0.012, 0.045, 0.004 ), M( 0x2a2a2c, { rough: 0.5 } ), [ 0.03, 0.036, 0.0 ] );
			add( g, G.rbox( 0.11, 0.012, 0.012, 0.005 ), blk, [ - 0.01, 0.046, 0 ], [ 0, 0.4, 0 ] );
			add( g, G.rbox( 0.024, 0.003, 0.036, 0.001 ), red, [ 0.14, 0.005, 0.04 ], [ 0, 0.25, 0 ] );
			const strap = canvasTex( 'tq-time', 128, 32, ( ctx, W, H ) => { ctx.fillStyle = '#e8e8e2'; ctx.fillRect( 0, 0, W, H ); ptext( ctx, 'TIME: ____', W / 2, H / 2, W * 0.86, H * 0.55, { weight: 'bold', color: '#111' } ); } );
			add( g, G.box( 0.045, 0.0012, 0.03 ), printed( strap, { rough: 0.8 } ), [ - 0.04, 0.0385, 0.0 ], [ 0, - 0.3, 0 ] );
			return ground( g );
		},
		// a panel saw: the toothed blade, the closed wooden handle with its hand hole and brass screws
		handsaw() {
			const g = group(), steel = M( 0xc0c4ca, { rough: 0.28, metal: 0.95 } );
			const blade = new THREE.Shape();
			blade.moveTo( - 0.13, - 0.055 ); blade.lineTo( 0.3, - 0.025 );
			blade.lineTo( 0.3, 0.012 );
			for ( let i = 0; i < 70; i ++ ) { const x = 0.3 - i * 0.0062; blade.lineTo( x - 0.0031, 0.012 + 0.0045 * ( 1 - i / 140 ) ); blade.lineTo( x - 0.0062, 0.012 * ( 1 - i / 70 ) + 0.055 * ( i / 70 ) ); }
			blade.lineTo( - 0.13, 0.055 ); blade.closePath();
			const bg = new THREE.ShapeGeometry( blade, 1 ).rotateX( - PI / 2 );
			const buv = bg.attributes.uv, bp = bg.attributes.position; for ( let i = 0; i < buv.count; i ++ ) buv.setXY( i, ( bp.getX( i ) + 0.13 ) / 0.43, 0.5 - bp.getZ( i ) / 0.12 );
			const etch = canvasTex( 'saw-etch', 512, 128, ( ctx, W, H ) => { ctx.fillStyle = '#c0c4ca'; ctx.fillRect( 0, 0, W, H ); ptext( ctx, 'KAPENA', W * 0.4, H * 0.5, W * 0.3, H * 0.18, { weight: '900', color: 'rgba(40,40,44,0.6)' } ); ptext( ctx, '20 IN · 8 TPI', W * 0.4, H * 0.66, W * 0.3, H * 0.08, { color: 'rgba(40,40,44,0.6)' } ); } );
			add( g, bg, M( 0xffffff, { map: etch, rough: 0.28, metal: 0.95, side: THREE.DoubleSide } ), [ 0, 0.012, 0 ] );
			const handle = new THREE.Shape();
			handle.moveTo( 0, - 0.06 ); handle.quadraticCurveTo( - 0.07, - 0.07, - 0.11, - 0.04 ); handle.quadraticCurveTo( - 0.13, 0.02, - 0.09, 0.07 ); handle.quadraticCurveTo( - 0.03, 0.08, 0, 0.06 ); handle.closePath();
			const hole = new THREE.Path(); hole.moveTo( - 0.03, - 0.035 ); hole.quadraticCurveTo( - 0.08, - 0.04, - 0.085, 0.0 ); hole.quadraticCurveTo( - 0.08, 0.04, - 0.035, 0.035 ); hole.closePath(); handle.holes.push( hole );
			add( g, new THREE.ExtrudeGeometry( handle, { depth: 0.022, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 6 } ).rotateX( - PI / 2 ), M( 0x9a5a2a, { rough: 0.45 } ), [ - 0.11, 0.004, 0 ] );
			for ( const [ x, z ] of [ [ - 0.12, - 0.03 ], [ - 0.12, 0.03 ], [ - 0.155, 0.0 ] ] ) add( g, G.cyl( 0.005, 0.005, 0.03, 10 ), M( 0xc8a24a, { rough: 0.3, metal: 0.9 } ), [ x, 0.002, z ] );
			return ground( g );
		},
		// a folding solar charger: three panels opened flat, the pocket with its USB lead
		solar() {
			const g = group(), cloth = fabric( 0x2a3a2a, 'weave', 0x1e2a1e, { rep: 8, rough: 0.9 } );
			const cells = M( 0xffffff, { map: solarCells(), rough: 0.15, metal: 0.45 } );
			for ( let i = 0; i < 3; i ++ ) {
				const x = ( i - 1 ) * 0.125;
				add( g, G.rbox( 0.12, 0.006, 0.17, 0.004, 1 ), cloth, [ x, 0, 0 ] );
				add( g, G.box( 0.1, 0.0012, 0.15 ), cells, [ x, 0.006, 0 ] );
			}
			add( g, G.rbox( 0.1, 0.012, 0.06, 0.004 ), cloth, [ 0.25, 0, 0.03 ] );
			add( g, G.tube( [ [ 0.26, 0.01, 0.06 ], [ 0.29, 0.006, 0.09 ], [ 0.27, 0.003, 0.12 ], [ 0.22, 0.003, 0.12 ] ], 0.0025, 14, 5 ), MAT.blackPlastic() );
			add( g, G.box( 0.014, 0.006, 0.01 ), M( 0x8a8e94, { rough: 0.3, metal: 0.8 } ), [ 0.212, 0.0, 0.12 ] );
			return ground( g );
		},
	};
}

export { css };
