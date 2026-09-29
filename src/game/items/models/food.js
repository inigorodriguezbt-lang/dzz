// Food and drink models: printed cans and tins, bottles (lathe profiles), cartons, jars, snack bags and bars,
// cup noodles, printed boxes, Hawaiian fruit, plate lunches, meat and fish.
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, labelTex, labelUV, gradientTex, canvasTex, css, shade, hashStr, facet } from './lib.js';

// a wrap-around label texture repeated `rep` times around a can
const wraps = new Map();
function wrapLabel( spec, rep = 2, w = 384, h = 256 ) {
	const key = JSON.stringify( spec ) + rep + w + h;
	let t = wraps.get( key );
	if ( t ) return t;
	t = labelTex( { w, h, ...spec } ).clone();
	t.wrapS = THREE.RepeatWrapping;
	t.repeat.set( rep, 1 );
	t.needsUpdate = true;
	wraps.set( key, t );
	return t;
}
const labelMat = ( spec, rep, w, h, o = {} ) => M( 0xffffff, { map: wrapLabel( spec || { text: '?' }, rep, w, h ), rough: o.rough ?? 0.5, metal: o.metal ?? 0.1 } );
const flatLabel = ( spec, o = {} ) => M( 0xffffff, { map: labelTex( spec ), rough: o.rough ?? 0.6, metal: o.metal ?? 0 } );

export function registerFoodModels( reg ) {
	// ---- round cans: { r, h, label, style: 'food'|'soda'|'squat', tab, rep } ----
	reg( 'can', ( s ) => {
		const r = s.r ?? 0.037, h = s.h ?? 0.11, g = group();
		const tin = s.metal ? M( s.metal, { rough: 0.3, metal: 0.9 } ) : MAT.tin();
		const lab = labelMat( s.label, s.rep ?? 2, 384, 256, { rough: 0.4, metal: s.style === 'soda' ? 0.5 : 0.1 } );
		if ( s.style === 'soda' ) {
			add( g, G.lathe( [ [ 0, 0.006 ], [ r * 0.72, 0 ], [ r * 0.92, 0.003 ], [ r, h * 0.08 ] ], 22 ), tin );
			add( g, G.cyl( r, r, h * 0.8, 22, true ), lab, [ 0, h * 0.08, 0 ] );
			add( g, G.lathe( [ [ r, h * 0.88 ], [ r * 0.82, h * 0.97 ], [ r * 0.8, h ], [ r * 0.74, h * 0.985 ], [ 0, h * 0.985 ] ], 22 ), tin );
			add( g, G.torus( r * 0.18, 0.0018, 4, 12 ), tin, [ r * 0.3, h * 0.99, 0 ], [ PI / 2, 0, 0 ] );
			return g;
		}
		add( g, G.cyl( r * 0.985, r * 0.985, h * 0.05, 22 ), tin );
		add( g, G.cyl( r, r, h * 0.88, 22, true ), lab, [ 0, h * 0.06, 0 ] );
		add( g, G.cyl( r * 0.985, r * 0.985, h * 0.06, 22 ), tin, [ 0, h * 0.94, 0 ] );
		add( g, G.torus( r * 0.97, 0.0022, 4, 24 ), tin, [ 0, h, 0 ], [ PI / 2, 0, 0 ] );
		for ( let k = 1; k <= 2; k ++ ) add( g, G.torus( r * ( 0.3 + k * 0.2 ), 0.0012, 3, 20 ), tin, [ 0, h + 0.0005, 0 ], [ PI / 2, 0, 0 ] );
		if ( s.tab !== false ) add( g, G.torus( r * 0.22, 0.0022, 4, 12 ), tin, [ r * 0.35, h + 0.002, 0 ], [ PI / 2, 0, 0 ] );
		return g;
	} );

	// ---- rectangular tins (Spam, corned beef, sardines): { size: [x, y, z], label, taper, key } ----
	reg( 'tin', ( s ) => {
		const [ w, h, d ] = s.size || [ 0.095, 0.075, 0.055 ], g = group();
		const tin = MAT.tin();
		const taper = s.taper ?? 1;
		if ( h < 0.45 * Math.min( w, d ) ) {
			// flat tins (sardines) carry the print on the lid
			const geo = G.rbox( w, h, d, h * 0.3, 2 );
			labelUV( geo, 'y', 0.85 );
			add( g, geo, M( 0xffffff, { map: labelTex( { split: 0.85, h: 256, ...( s.label || {} ) } ), rough: 0.4, metal: 0.25 } ) );
			add( g, G.torus( Math.min( w, d ) * 0.12, 0.002, 4, 12 ), tin, [ w * 0.36, h + 0.001, 0 ], [ PI / 2, 0, 0 ] );
			return g;
		}
		// one full label per side (the texture repeats four times around), sized to the face so the print is not squashed
		const faceH = h * 0.84, aspect = Math.max( 1, Math.min( 3, w / faceH ) );
		const lab = labelMat( s.label, 4, Math.round( 256 * aspect / 16 ) * 16, 256, { rough: 0.45, metal: 0.15 } );
		add( g, G.rbox( w * 0.99, h * 0.08, d * 0.99, 0.006 ), tin );
		add( g, G.rectWrap( w, faceH, d, taper ), lab, [ 0, h * 0.08, 0 ] );
		add( g, G.rbox( w * taper * 0.99, h * 0.08, d * taper * 0.99, 0.006 ), tin, [ 0, h * 0.92, 0 ] );
		if ( s.key ) add( g, G.box( w * 0.5, 0.003, 0.006 ), tin, [ - w * 0.1, h * 0.3, d / 2 + 0.003 ] );
		else add( g, G.torus( Math.min( w, d ) * 0.14, 0.002, 4, 12 ), tin, [ w * 0.3, h + 0.001, 0 ], [ PI / 2, 0, 0 ] ); // pull tab
		return g;
	} );

	// ---- bottles: { style, h, r, glass, clear, liquid, fill, cap, label, labelY, labelH, squash } ----
	const PROFILES = {
		water: [ [ 0, 0 ], [ 0.85, 0 ], [ 1, 0.04 ], [ 1, 0.5 ], [ 0.93, 0.54 ], [ 1, 0.58 ], [ 1, 0.7 ], [ 0.75, 0.82 ], [ 0.4, 0.9 ], [ 0.38, 0.94 ] ],
		soda: [ [ 0, 0 ], [ 0.7, 0.01 ], [ 1, 0.06 ], [ 1, 0.62 ], [ 0.8, 0.76 ], [ 0.42, 0.88 ], [ 0.38, 0.94 ] ],
		beer: [ [ 0, 0 ], [ 0.95, 0 ], [ 1, 0.03 ], [ 1, 0.56 ], [ 0.92, 0.63 ], [ 0.46, 0.75 ], [ 0.36, 0.8 ], [ 0.36, 0.96 ], [ 0.42, 0.98 ] ],
		wine: [ [ 0, 0 ], [ 1, 0 ], [ 1, 0.62 ], [ 0.7, 0.72 ], [ 0.34, 0.78 ], [ 0.3, 0.95 ], [ 0.34, 0.97 ] ],
		liquor: [ [ 0, 0 ], [ 1, 0 ], [ 1, 0.66 ], [ 0.9, 0.72 ], [ 0.36, 0.78 ], [ 0.33, 0.95 ] ],
		jug: [ [ 0, 0 ], [ 0.96, 0 ], [ 1, 0.03 ], [ 1, 0.72 ], [ 0.6, 0.86 ], [ 0.3, 0.9 ], [ 0.3, 0.96 ] ],
		sports: [ [ 0, 0 ], [ 0.95, 0 ], [ 1, 0.05 ], [ 0.86, 0.35 ], [ 1, 0.55 ], [ 1, 0.72 ], [ 0.56, 0.86 ], [ 0.5, 0.92 ] ],
		milk: [ [ 0, 0 ], [ 1, 0 ], [ 1, 0.74 ], [ 0.55, 0.86 ], [ 0.4, 0.92 ] ],
		syrup: [ [ 0, 0 ], [ 1, 0 ], [ 1, 0.6 ], [ 0.5, 0.75 ], [ 0.3, 0.8 ], [ 0.3, 0.92 ] ],
	};
	reg( 'bottle', ( s ) => {
		const H = s.h ?? 0.24, R = s.r ?? 0.034, g = group();
		const prof = ( PROFILES[ s.style ] || PROFILES.water ).map( ( [ a, b ] ) => [ a * R, b * H ] );
		const top = prof[ prof.length - 1 ][ 1 ];
		const shell = s.clear ? M( s.glass ?? 0xd8eef5, { rough: 0.05, transparent: true, opacity: s.opacity ?? 0.3, metal: 0.1 } )
			: M( s.glass ?? 0x5a3515, { rough: 0.08, metal: 0.25 } );
		const bottle = G.lathe( prof.concat( [ [ 0, top ] ] ), 18 );
		if ( s.squash ) bottle.scale( 1, 1, s.squash );
		add( g, bottle, shell );
		// liquid visible through clear plastic / glass
		if ( s.clear && s.liquid != null && ( s.fill ?? 0.8 ) > 0 ) {
			const fillY = top * ( s.fill ?? 0.8 );
			const inner = [];
			for ( const [ a, b ] of prof ) { if ( b >= fillY ) break; inner.push( [ a * 0.9, Math.max( 0.002, b ) ] ); }
			const last = inner[ inner.length - 1 ];
			if ( last ) {
				inner.push( [ last[ 0 ], fillY ], [ 0, fillY ] );
				const lg = G.lathe( inner, 16 );
				if ( s.squash ) lg.scale( 1, 1, s.squash );
				const lm = s.liquidClear ? M( s.liquid, { rough: 0.1, transparent: true, opacity: 0.45 } ) : M( s.liquid, { rough: 0.15 } );
				add( g, lg, lm );
			}
		}
		// cap
		const capR = prof[ prof.length - 1 ][ 0 ] * 1.08;
		if ( s.cap !== null ) add( g, G.cyl( capR, capR, H * ( s.capH ?? 0.06 ), 14 ), M( s.cap ?? 0x2266cc, { rough: s.capMetal ? 0.3 : 0.5, metal: s.capMetal ? 0.8 : 0 } ), [ 0, top - 0.002, 0 ] );
		// label band
		if ( s.label ) {
			const y0 = H * ( s.labelY ?? 0.18 ), lh = H * ( s.labelH ?? 0.3 );
			// radius at the band (bottles are straight there)
			const lg = G.cyl( R * 1.006, R * 1.006, lh, 20, true );
			if ( s.squash ) lg.scale( 1, 1, s.squash );
			add( g, lg, labelMat( s.label, s.labelRep ?? 1, 512, 256, { rough: 0.5 } ), [ 0, y0, 0 ] );
		}
		if ( s.style === 'jug' ) add( g, G.torus( H * 0.1, R * 0.12, 6, 12, PI ), shell, [ R * 0.7, H * 0.72, 0 ], [ 0, 0, - PI / 2 - 0.3 ] );
		return g;
	} );

	// ---- gable-top cartons and juice boxes: { size, label, gable } ----
	reg( 'carton', ( s ) => {
		const [ w, h, d ] = s.size || [ 0.07, 0.2, 0.07 ], g = group();
		const lab = labelMat( s.label, 2, 384, 384, { rough: 0.7 } );
		const bodyH = s.gable === false ? h : h * 0.82;
		add( g, G.rectWrap( w, bodyH, d ), lab );
		const white = M( s.label?.bg ?? 0xf2f2ee, { rough: 0.75 } );
		if ( s.gable === false ) {
			add( g, G.box( w, 0.002, d ), white, [ 0, bodyH, 0 ] );
			// straw
			add( g, G.cyl( 0.0025, 0.0025, 0.06, 6 ), M( 0xf0d060 ), [ w * 0.25, bodyH, 0 ], [ 0, 0, - 0.3 ] );
		} else {
			add( g, G.box( w, 0.001, d ), white, [ 0, bodyH - 0.0005, 0 ] );
			add( g, G.prismX( d, h * 0.14, w ), white, [ 0, bodyH, 0 ] );
			add( g, G.box( w, h * 0.05, 0.004 ), white, [ 0, bodyH + h * 0.12, 0 ] );
			add( g, G.cyl( 0.009, 0.009, 0.01, 10 ), M( s.cap ?? 0x2a6fd6 ), [ w * 0.22, bodyH + h * 0.06, d * 0.2 ], [ 0.6, 0, 0 ] );
		}
		return g;
	} );

	// ---- jars: { r, h, content, lid, label, clear } ----
	reg( 'jar', ( s ) => {
		const r = s.r ?? 0.045, h = s.h ?? 0.12, g = group();
		const content = M( s.content ?? 0xa0673a, { rough: 0.6 } );
		if ( s.clear ) {
			add( g, G.cyl( r * 0.93, r * 0.93, h * 0.84, 18 ), content, [ 0, 0.003, 0 ] );
			add( g, G.cyl( r, r, h * 0.88, 18 ), MAT.glass(), [ 0, 0, 0 ] );
		} else add( g, G.cyl( r, r, h * 0.88, 18 ), M( s.body ?? s.content ?? 0xdddddd, { rough: 0.4 } ) );
		add( g, G.cyl( r * 1.02, r * 1.02, h * 0.12, 18 ), M( s.lid ?? 0xcc2222, { rough: 0.35, metal: s.lidMetal ? 0.8 : 0 } ), [ 0, h * 0.88, 0 ] );
		if ( s.label ) add( g, G.cyl( r * 1.008, r * 1.008, h * 0.5, 20, true ), labelMat( s.label, 2, 384, 256 ), [ 0, h * 0.18, 0 ] );
		return g;
	} );

	// ---- snack bags / rice sacks: { size, label, flat, crimp } ----
	reg( 'bag', ( s ) => {
		const [ w, h, d ] = s.size || [ 0.2, 0.28, 0.07 ], g = group();
		const flat = !! s.flat;
		const geo = G.rbox( w, h, d, ( flat ? h : d ) * 0.45, 3 );
		labelUV( geo, flat ? 'y' : 'z', 0.85 );
		const spec = { split: 0.85, ...( s.label || { text: '?' } ) };
		add( g, geo, M( 0xffffff, { map: labelTex( spec ), rough: s.matte ? 0.9 : 0.35, metal: s.matte ? 0 : 0.35 } ) );
		if ( s.crimp !== false ) {
			const cm = M( s.label?.band ?? s.label?.bg ?? 0x999999, { rough: 0.4, metal: 0.3 } );
			if ( flat ) { add( g, G.box( 0.012, h * 0.3, d * 0.96 ), cm, [ w / 2 - 0.004, h * 0.35, 0 ] ); add( g, G.box( 0.012, h * 0.3, d * 0.96 ), cm, [ - w / 2 + 0.004, h * 0.35, 0 ] ); }
			else { add( g, G.box( w * 0.97, 0.014, d * 0.3 ), cm, [ 0, h - 0.008, 0 ] ); add( g, G.box( w * 0.97, 0.012, d * 0.35 ), cm, [ 0, 0, 0 ] ); }
		}
		return g;
	} );

	// ---- wrapped bars (granola, candy, MRE pouch): { size, label } ----
	reg( 'bar', ( s ) => {
		const [ w, h, d ] = s.size || [ 0.13, 0.014, 0.035 ], g = group();
		const geo = G.rbox( w * 0.9, h, d, h * 0.45, 2 );
		labelUV( geo, 'y', 0.85 );
		add( g, geo, M( 0xffffff, { map: labelTex( { split: 0.85, h: 128, ...( s.label || {} ) } ), rough: s.matte ? 0.85 : 0.35, metal: s.matte ? 0 : 0.4 } ) );
		const cm = M( s.label?.bg ?? 0x999999, { rough: 0.4, metal: s.matte ? 0 : 0.35 } );
		add( g, G.box( w * 0.06, h * 0.25, d * 0.95 ), cm, [ w * 0.47, h * 0.35, 0 ] );
		add( g, G.box( w * 0.06, h * 0.25, d * 0.95 ), cm, [ - w * 0.47, h * 0.35, 0 ] );
		return g;
	} );

	// ---- cup noodles: { r, h, label } ----
	reg( 'cup', ( s ) => {
		const r = s.r ?? 0.047, h = s.h ?? 0.1, g = group();
		add( g, G.cyl( r, r * 0.72, h, 20, true ), labelMat( s.label, 2, 384, 256, { rough: 0.8 } ) );
		add( g, G.cyl( r * 0.72, r * 0.72, 0.003, 18 ), M( 0xeeeeee ) );
		add( g, G.cyl( r * 1.03, r * 1.03, 0.004, 20 ), M( 0xe0e0e0, { rough: 0.3, metal: 0.8 } ), [ 0, h, 0 ] );
		add( g, G.box( 0.03, 0.001, 0.025 ), M( 0xe0e0e0, { rough: 0.3, metal: 0.8 } ), [ r * 1.1, h + 0.002, 0 ] );
		return g;
	} );

	// ---- printed boxes (cereal, crackers, MRE case, matches…): { size, label, labelAxis, color, round } ----
	reg( 'box', ( s ) => {
		const [ w, h, d ] = s.size || [ 0.2, 0.1, 0.12 ], g = group();
		if ( s.label ) {
			const geo = s.round ? G.rbox( w, h, d, s.round, 2 ) : G.box( w, h, d );
			labelUV( geo, s.labelAxis || 'z', 0.8 );
			add( g, geo, M( 0xffffff, { map: labelTex( { split: 0.8, ...s.label } ), rough: s.rough ?? 0.75, metal: s.metal ?? 0 } ) );
		} else add( g, G.rbox( w, h, d, s.round ?? 0.004 ), M( s.color ?? 0x8a8f96, { rough: s.rough ?? 0.7, metal: s.metal ?? 0 } ) );
		return g;
	} );

	// ---- fruit & produce: { kind, cooked } ----
	const cookedTint = ( c, cooked ) => cooked ? shade( c, - 0.45 ) : c;
	reg( 'fruit', ( s ) => {
		const g = group(), k = s.kind || 'mango', ck = !! s.cooked;
		switch ( k ) {
			case 'pineapple': {
				const skin = canvasTex( 'pineapple-skin', 128, 128, ( ctx, W, H ) => {
					ctx.fillStyle = '#b8862a'; ctx.fillRect( 0, 0, W, H );
					for ( let y = 0; y < 8; y ++ ) for ( let x = 0; x < 8; x ++ ) {
						const cx = ( x + ( y % 2 ) * 0.5 ) * W / 8, cy = ( y + 0.5 ) * H / 8;
						ctx.fillStyle = y % 3 === 0 ? '#8f6a1f' : '#c99a34';
						ctx.beginPath(); ctx.moveTo( cx, cy - 7 ); ctx.lineTo( cx + 8, cy ); ctx.lineTo( cx, cy + 7 ); ctx.lineTo( cx - 8, cy ); ctx.closePath(); ctx.fill();
						ctx.fillStyle = '#5e4a18'; ctx.fillRect( cx - 1, cy - 1, 2, 2 );
					}
				}, { repeat: true } );
				const inner = group();
				const body = G.sph( 0.062, 14, 10 ); body.scale( 1, 1.55, 1 ); body.translate( 0, 0.096, 0 );
				add( inner, body, M( 0xffffff, { map: skin, rough: 0.75 } ) );
				const leaf = M( 0x4d7f3a, { rough: 0.6, side: THREE.DoubleSide } );
				for ( let i = 0; i < 14; i ++ ) {
					const a = i / 14 * PI * 2 + ( i % 2 ) * 0.2, tilt = 0.25 + ( i % 3 ) * 0.2, len = 0.09 + ( i % 4 ) * 0.02;
					const lg = G.cone( 0.012, len, 3 ); lg.scale( 1, 1, 0.3 );
					add( inner, lg, leaf, [ Math.cos( a ) * 0.008, 0.18, Math.sin( a ) * 0.008 ], [ Math.sin( a ) * tilt, 0, - Math.cos( a ) * tilt ] );
				}
				// lie it down, long axis along +x
				inner.rotation.z = - PI / 2;
				g.add( inner );
				ground( g );
				break;
			}
			case 'coconut': {
				const geo = facet( G.sph( 0.085, 7, 9 ).scale( 1.18, 0.95, 1 ).translate( 0, 0.08, 0 ) );
				add( g, geo, M( ck ? 0x6b4a2a : 0x6f8a3a, { rough: 0.85, map: gradientTex( [ [ 0, 0x97a74e ], [ 0.6, 0x6d8537 ], [ 1, 0x5b5a2c ] ], 300, '#3a3a1a', 3 ) } ) );
				add( g, G.cone( 0.018, 0.02, 6 ), M( 0x5a4a2a ), [ 0.09, 0.08, 0 ], [ 0, 0, - PI / 2 ] );
				break;
			}
			case 'coconut_open': {
				const shell = M( 0x5b3c22, { rough: 0.95 } ), meat = M( 0xf4f1e8, { rough: 0.6 } );
				for ( const [ x, ry ] of [ [ - 0.05, 0 ], [ 0.06, 0.8 ] ] ) {
					add( g, G.sph( 0.055, 12, 6, 0, PI * 2, PI / 2, PI / 2 ), shell, [ x, 0.055, 0 ], [ 0, ry, 0 ] );
					add( g, G.cyl( 0.05, 0.05, 0.002, 14 ), meat, [ x, 0.054, 0 ] );
				}
				break;
			}
			case 'banana': case 'banana_bunch': {
				const n = k === 'banana' ? 1 : 5;
				const peel = M( ck ? 0x4a3a20 : 0xf1cf3b, { rough: 0.55 } ), tip = M( 0x4a3a22 );
				for ( let i = 0; i < n; i ++ ) {
					const off = ( i - ( n - 1 ) / 2 ) * 0.03, lift = Math.abs( i - ( n - 1 ) / 2 ) * 0.008;
					const pts = [ [ - 0.09, 0.05, off * 0.4 ], [ - 0.03, 0.022, off * 0.8 ], [ 0.04, 0.02, off ], [ 0.09, 0.05, off * 1.1 ] ].map( p => [ p[ 0 ], p[ 1 ] + lift, p[ 2 ] ] );
					add( g, G.tube( pts, 0.017, 10, 6 ), peel );
					add( g, G.sph( 0.008, 6, 4 ), tip, pts[ 3 ] );
				}
				if ( n > 1 ) add( g, G.cylX( 0.012, 0.05, 6 ), M( 0x6b5a2a ), [ - 0.11, 0.055, 0 ] );
				break;
			}
			case 'mango': {
				const geo = G.sph( 0.05, 14, 10 ); geo.scale( 1.35, 0.9, 1 ); geo.translate( 0, 0.045, 0 );
				add( g, geo, M( 0xffffff, { rough: 0.5, map: gradientTex( ck ? [ [ 0, 0x7a4a20 ], [ 1, 0x4a3010 ] ] : [ [ 0, 0xd64a2a ], [ 0.45, 0xf0a030 ], [ 1, 0x7ea83a ] ], 60, '#553311', 5 ) } ) );
				break;
			}
			case 'papaya': {
				const geo = G.lathe( [ [ 0, 0 ], [ 0.035, 0.005 ], [ 0.055, 0.03 ], [ 0.052, 0.08 ], [ 0.04, 0.12 ], [ 0.02, 0.14 ], [ 0, 0.145 ] ], 14 );
				geo.rotateZ( - PI / 2 ); geo.translate( - 0.07, 0.052, 0 );
				add( g, geo, M( 0xffffff, { rough: 0.5, map: gradientTex( ck ? [ [ 0, 0x6a4420 ], [ 1, 0x3a2410 ] ] : [ [ 0, 0x7fa83a ], [ 0.5, 0xe8a332 ], [ 1, 0xf09a2e ] ], 40, '#336622', 7 ) } ) );
				break;
			}
			case 'guava': case 'lilikoi': case 'lime': case 'orange': case 'tomato': case 'lychee': case 'mountain_apple': case 'avocado': case 'onion': {
				const P = {
					guava: [ 0.034, 1, [ [ 0, 0xdfe06a ], [ 1, 0x9cc24a ] ], 0.9 ], lilikoi: [ 0.034, 1.05, [ [ 0, 0xf2c83a ], [ 1, 0xc9a02a ] ], 0.8 ],
					lime: [ 0.028, 1.1, [ [ 0, 0x7cc243 ], [ 1, 0x4a9a2a ] ], 0.5 ], orange: [ 0.04, 0.95, [ [ 0, 0xf29a2a ], [ 1, 0xe07a1a ] ], 0.6 ],
					tomato: [ 0.036, 0.8, [ [ 0, 0xe0402a ], [ 1, 0xb82a1a ] ], 0.3 ], lychee: [ 0.018, 1.1, [ [ 0, 0xd8404a ], [ 1, 0x9a2a2a ] ], 0.9 ],
					mountain_apple: [ 0.032, 1.25, [ [ 0, 0xe0304a ], [ 1, 0xf2a0b0 ] ], 0.3 ], avocado: [ 0.042, 1.4, [ [ 0, 0x3a5a22 ], [ 1, 0x24381a ] ], 0.7 ],
					onion: [ 0.042, 0.9, [ [ 0, 0xe8d8a0 ], [ 1, 0xf6efd8 ] ], 0.4 ],
				}[ k ];
				const [ r, sy, stops, rough ] = P;
				const mat = M( 0xffffff, { rough, map: gradientTex( ck ? [ [ 0, 0x5a3a1a ], [ 1, 0x3a2410 ] ] : stops, 80, '#3a2a10', hashStr( k ) ) } );
				const one = ( x, z, sc = 1 ) => { const geo = G.sph( r * sc, 12, 9 ); geo.scale( 1, sy, 1 ); add( g, geo, mat, [ x, r * sy * sc, z ] ); };
				if ( k === 'lychee' ) { one( 0, 0 ); one( 0.03, 0.01 ); one( 0.012, 0.03 ); one( - 0.02, 0.022 ); }
				else one( 0, 0 );
				if ( k === 'tomato' ) glyphStar( g, r, sy );
				if ( k === 'onion' ) add( g, G.cone( 0.01, 0.03, 6 ), M( 0xc8b070 ), [ 0, r * sy * 2 - 0.004, 0 ] );
				break;
			}
			case 'breadfruit': {
				const skin = canvasTex( 'breadfruit-skin', 128, 128, ( ctx, W, H ) => {
					ctx.fillStyle = '#7da03a'; ctx.fillRect( 0, 0, W, H );
					ctx.strokeStyle = '#5a7a28'; ctx.lineWidth = 2;
					for ( let y = 0; y < 10; y ++ ) for ( let x = 0; x < 10; x ++ ) { ctx.beginPath(); ctx.arc( ( x + ( y % 2 ) * 0.5 ) * W / 10, ( y + 0.5 ) * H / 10, 5, 0, PI * 2 ); ctx.stroke(); }
				}, { repeat: true } );
				const geo = G.sph( 0.08, 14, 10 ); geo.scale( 1.1, 0.95, 1 ); geo.translate( 0, 0.076, 0 );
				add( g, geo, M( ck ? 0x6a4a2a : 0xffffff, { map: ck ? null : skin, rough: 0.7 } ) );
				break;
			}
			case 'taro': case 'sweet_potato': {
				const taro = k === 'taro';
				const geo = taro ? G.lathe( [ [ 0, 0 ], [ 0.03, 0.004 ], [ 0.045, 0.04 ], [ 0.04, 0.09 ], [ 0.02, 0.12 ], [ 0.012, 0.13 ] ], 12 )
					: G.lathe( [ [ 0, 0 ], [ 0.018, 0.01 ], [ 0.035, 0.05 ], [ 0.034, 0.1 ], [ 0.015, 0.15 ], [ 0, 0.16 ] ], 12 );
				geo.rotateZ( - PI / 2 ); geo.translate( taro ? - 0.065 : - 0.08, taro ? 0.043 : 0.034, 0 );
				const c = taro ? [ [ 0, 0x6a4a36 ], [ 0.5, 0x7a5a44 ], [ 1, 0x5a3a2a ] ] : [ [ 0, 0x7a3a5a ], [ 1, 0x5a2a44 ] ];
				add( g, geo, M( 0xffffff, { rough: 0.95, map: gradientTex( ck ? [ [ 0, 0x4a2a14 ], [ 1, 0x2a180a ] ] : c, 400, '#2a1a10', taro ? 11 : 12 ) } ) );
				break;
			}
			case 'egg': {
				const geo = G.lathe( [ [ 0, 0 ], [ 0.015, 0.004 ], [ 0.021, 0.02 ], [ 0.018, 0.04 ], [ 0.01, 0.052 ], [ 0, 0.056 ] ], 12 );
				geo.rotateZ( - PI / 2 ); geo.translate( - 0.028, 0.021, 0 );
				add( g, geo, M( s.color ?? 0xd9b48a, { rough: 0.6 } ) );
				break;
			}
			default: {
				const geo = G.sph( 0.04, 12, 9 ); geo.translate( 0, 0.04, 0 );
				add( g, geo, M( cookedTint( s.color ?? 0x88aa44, ck ) ) );
			}
		}
		if ( s.stem !== false && [ 'mango', 'guava', 'avocado', 'mountain_apple', 'papaya' ].includes( k ) ) {
			g.updateMatrixWorld( true );
			const bb = new THREE.Box3().setFromObject( g );
			add( g, G.cyl( 0.003, 0.004, 0.012, 5 ), M( 0x4a3a1a ), k === 'papaya' ? [ bb.max.x - 0.003, bb.getCenter( new THREE.Vector3() ).y, 0 ] : [ 0, bb.max.y - 0.003, 0 ], k === 'papaya' ? [ 0, 0, - PI / 2 ] : null );
		}
		return g;
	} );
	function glyphStar( g, r, sy ) {
		const m = M( 0x3a7a2a );
		for ( let i = 0; i < 5; i ++ ) { const a = i / 5 * PI * 2; add( g, G.box( 0.022, 0.003, 0.005 ), m, [ Math.cos( a ) * 0.008, r * sy * 2 - 0.002, Math.sin( a ) * 0.008 ], [ 0, - a, 0 ] ); }
	}

	// ---- prepared dishes: { kind } ----
	reg( 'dish', ( s ) => {
		const g = group();
		switch ( s.kind ) {
			case 'musubi': {
				add( g, G.rbox( 0.095, 0.03, 0.05, 0.006 ), M( 0xf6f3ea, { rough: 0.95 } ) );
				add( g, G.rbox( 0.092, 0.014, 0.048, 0.003 ), M( 0xd9826f, { rough: 0.6 } ), [ 0, 0.03, 0 ] );
				add( g, G.rbox( 0.095, 0.02, 0.052, 0.004 ), M( 0xf6f3ea, { rough: 0.95 } ), [ 0, 0.044, 0 ] );
				add( g, G.box( 0.03, 0.068, 0.056 ), M( 0x1c2a1a, { rough: 0.7 } ), [ 0, - 0.002, 0 ] );
				add( g, G.rbox( 0.104, 0.07, 0.06, 0.008 ), MAT.glass( 0xffffff, 0.18 ) );
				break;
			}
			case 'plate': {
				const foam = M( 0xf4f4f0, { rough: 0.95 } );
				add( g, G.rbox( 0.23, 0.035, 0.2, 0.012 ), foam );
				add( g, G.rbox( 0.232, 0.028, 0.202, 0.012 ), foam, [ 0, 0.036, 0 ] );
				add( g, G.box( 0.05, 0.02, 0.012 ), foam, [ 0, 0.028, 0.1 ] );
				if ( s.sticker ) add( g, G.cyl( 0.025, 0.025, 0.001, 16 ), flatLabel( { bg: 0xf5c542, fg: 0x7a2a10, text: s.sticker, style: 'plain', size: 0.4 } ), [ 0.05, 0.064, 0.03 ] );
				break;
			}
			case 'bowl': {
				const bowl = M( s.bowl ?? 0x222222, { rough: 0.4 } );
				add( g, G.lathe( [ [ 0, 0 ], [ 0.06, 0 ], [ 0.075, 0.045 ], [ 0.073, 0.047 ], [ 0.058, 0.004 ], [ 0, 0.004 ] ], 18 ), bowl );
				const fill = M( s.fill ?? 0xc0283a, { rough: 0.35 } );
				for ( let i = 0; i < 12; i ++ ) { const a = i * 2.39, rr = 0.012 + ( i % 4 ) * 0.012; add( g, G.box( 0.018, 0.016, 0.018 ), fill, [ Math.cos( a ) * rr, 0.03 + ( i % 3 ) * 0.004, Math.sin( a ) * rr ], [ i, i * 2, 0 ] ); }
				if ( s.kind2 === 'rice' || s.rice ) add( g, G.dome( 0.066, 14, 6 ).scale( 1, 0.35, 1 ), M( 0xf6f3ea, { rough: 0.95 } ), [ 0, 0.03, 0 ] );
				for ( let i = 0; i < 8; i ++ ) add( g, G.box( 0.006, 0.004, 0.006 ), M( 0x5aa83a ), [ Math.cos( i ) * 0.03, 0.05, Math.sin( i * 1.7 ) * 0.03 ] );
				add( g, G.lathe( [ [ 0, 0.05 ], [ 0.074, 0.048 ], [ 0.076, 0.044 ] ], 18 ), MAT.glass( 0xffffff, 0.2 ) );
				break;
			}
			case 'noodle_bowl': {
				add( g, G.lathe( [ [ 0, 0 ], [ 0.05, 0 ], [ 0.085, 0.06 ], [ 0.082, 0.062 ], [ 0.048, 0.004 ], [ 0, 0.004 ] ], 18 ), M( 0xf2efe6, { rough: 0.3 } ) );
				add( g, G.cyl( 0.078, 0.078, 0.002, 18 ), M( 0xd8b070, { rough: 0.2 } ), [ 0, 0.05, 0 ] );
				add( g, G.cyl( 0.025, 0.025, 0.004, 14 ), M( 0xf2d2d2 ), [ 0.02, 0.052, 0.01 ] );
				break;
			}
			case 'malasada': {
				const tex = canvasTex( 'sugar', 64, 64, ( ctx, W, H ) => { ctx.fillStyle = '#d99a4a'; ctx.fillRect( 0, 0, W, H ); ctx.fillStyle = '#fff8ee'; for ( let i = 0; i < 700; i ++ ) ctx.fillRect( Math.random() * W, Math.random() * H, 1.5, 1.5 ); }, { repeat: true } );
				const geo = G.sph( 0.045, 14, 10 ); geo.scale( 1, 0.72, 1 ); geo.translate( 0, 0.032, 0 );
				add( g, geo, M( 0xffffff, { map: tex, rough: 0.9 } ) );
				break;
			}
			case 'bread': {
				add( g, G.lathe( [ [ 0, 0 ], [ 0.1, 0 ], [ 0.11, 0.03 ], [ 0.1, 0.032 ], [ 0, 0.032 ] ], 20 ), M( 0xcfcfd4, { rough: 0.3, metal: 0.9 } ) );
				const top = G.sph( 0.1, 18, 8, 0, PI * 2, 0, PI / 2 ); top.scale( 1, 0.55, 1 );
				add( g, top, M( 0xffffff, { map: gradientTex( [ [ 0, 0x9a5a22 ], [ 0.6, 0xc47a34 ], [ 1, 0xe0b070 ] ], 40, '#6a3a12', 21 ), rough: 0.7 } ), [ 0, 0.028, 0 ] );
				add( g, G.cyl( 0.112, 0.112, 0.085, 20, true ), MAT.glass( 0xffffff, 0.12 ), [ 0, 0, 0 ] );
				break;
			}
			case 'manapua': {
				const geo = G.sph( 0.045, 14, 10 ); geo.scale( 1, 0.75, 1 ); geo.translate( 0, 0.034, 0 );
				add( g, geo, M( 0xf6f1e4, { rough: 0.9 } ) );
				add( g, G.cyl( 0.006, 0.006, 0.001, 10 ), M( 0xd02a2a ), [ 0, 0.067, 0 ] );
				add( g, G.cyl( 0.045, 0.045, 0.002, 16 ), M( 0xf0e6c8, { rough: 1 } ) );
				break;
			}
			case 'mochi': {
				add( g, G.box( 0.16, 0.012, 0.12 ), M( 0xcfcfd4, { rough: 0.3, metal: 0.9 } ) );
				for ( let i = 0; i < 6; i ++ ) add( g, G.rbox( 0.045, 0.028, 0.05, 0.004 ), M( 0xe0a64a, { rough: 0.7 } ), [ - 0.05 + ( i % 3 ) * 0.05, 0.012, - 0.027 + Math.floor( i / 3 ) * 0.054 ] );
				break;
			}
			case 'rice': {
				add( g, G.lathe( [ [ 0, 0 ], [ 0.04, 0 ], [ 0.06, 0.05 ], [ 0.058, 0.052 ], [ 0.038, 0.004 ], [ 0, 0.004 ] ], 18 ), M( 0x2a4a8a, { rough: 0.3 } ) );
				add( g, G.dome( 0.052, 14, 6 ).scale( 1, 0.6, 1 ), M( 0xf6f3ea, { rough: 0.95 } ), [ 0, 0.045, 0 ] );
				break;
			}
			case 'loco_moco': {
				const foam = M( 0xf4f4f0, { rough: 0.95 } );
				add( g, G.rbox( 0.23, 0.035, 0.2, 0.012 ), foam );
				add( g, G.dome( 0.05, 12, 5 ).scale( 1, 0.5, 1 ), M( 0xf6f3ea, { rough: 0.95 } ), [ - 0.04, 0.035, 0 ] );
				add( g, G.cyl( 0.045, 0.045, 0.02, 16 ), M( 0x4a2a16, { rough: 0.8 } ), [ - 0.04, 0.05, 0 ] );
				add( g, G.cyl( 0.035, 0.035, 0.008, 16 ), M( 0xfaf8f0, { rough: 0.5 } ), [ - 0.04, 0.07, 0 ] );
				add( g, G.dome( 0.014, 10, 5 ), M( 0xf5b52a, { rough: 0.3 } ), [ - 0.04, 0.077, 0 ] );
				add( g, G.dome( 0.045, 12, 5 ).scale( 1, 0.4, 1 ), M( 0xe8e0c0 ), [ 0.06, 0.035, 0.03 ] );
				break;
			}
			default: add( g, G.rbox( 0.1, 0.04, 0.08, 0.01 ), M( s.color ?? 0xccaa77 ) );
		}
		return g;
	} );

	// ---- meat: { kind: 'steak'|'chunk'|'chicken'|'ribs', color, cooked, fat } ----
	const marble = ( c, cooked ) => canvasTex( `marble:${c}:${cooked}`, 128, 128, ( ctx, W, H ) => {
		// cooked meat browns whatever it started as
		ctx.fillStyle = css( cooked ? 0x6e3f1f : c ); ctx.fillRect( 0, 0, W, H );
		ctx.strokeStyle = cooked ? 'rgba(40,20,5,0.7)' : 'rgba(255,235,225,0.55)'; ctx.lineWidth = cooked ? 5 : 2;
		for ( let i = 0; i < ( cooked ? 5 : 14 ); i ++ ) {
			ctx.beginPath();
			if ( cooked ) { ctx.moveTo( 0, i * 26 + 10 ); ctx.lineTo( W, i * 26 - 20 ); } else { let x = Math.random() * W, y = Math.random() * H; ctx.moveTo( x, y ); for ( let k = 0; k < 5; k ++ ) { x += ( Math.random() - 0.5 ) * 30; y += ( Math.random() - 0.5 ) * 30; ctx.lineTo( x, y ); } }
			ctx.stroke();
		}
	}, { repeat: true } );
	reg( 'meat', ( s ) => {
		const g = group(), c = s.color ?? 0xa8323a, ck = !! s.cooked;
		const flesh = M( 0xffffff, { map: marble( c, ck ), rough: ck ? 0.75 : 0.35 } );
		const fat = M( ck ? 0x8a5a2a : ( s.fat ?? 0xf1e0d0 ), { rough: 0.5 } );
		switch ( s.kind ) {
			case 'chicken': {
				const body = G.sph( 0.075, 14, 10 ); body.scale( 1.25, 0.75, 1 ); body.translate( 0, 0.056, 0 );
				add( g, body, M( ck ? 0xb06a2a : 0xf0c8b0, { rough: ck ? 0.45 : 0.55 } ) );
				for ( const z of [ - 0.04, 0.04 ] ) {
					add( g, G.capsX( 0.022, 0.08 ), M( ck ? 0xa05a22 : 0xeec0a8, { rough: 0.5 } ), [ 0.08, 0.035, z ], [ 0, z > 0 ? - 0.3 : 0.3, 0.2 ] );
					add( g, G.cylX( 0.006, 0.03, 6 ), fat, [ 0.125, 0.045, z * 1.3 ] );
				}
				break;
			}
			case 'chunk': {
				const geo = G.sph( 0.07, 9, 7 ); geo.scale( 1.3, 0.7, 1 );
				const p = geo.attributes.position;
				for ( let i = 0; i < p.count; i ++ ) { const k = 1 + Math.sin( p.getX( i ) * 60 + p.getZ( i ) * 40 ) * 0.08; p.setXYZ( i, p.getX( i ) * k, p.getY( i ), p.getZ( i ) * k ); }
				geo.computeVertexNormals(); geo.translate( 0, 0.048, 0 );
				add( g, geo, flesh );
				add( g, G.rbox( 0.15, 0.02, 0.03, 0.008 ), fat, [ 0, 0.06, 0.05 ], [ 0, 0.1, 0 ] );
				break;
			}
			case 'ribs': {
				add( g, G.rbox( 0.2, 0.03, 0.1, 0.012 ), flesh );
				for ( let i = 0; i < 5; i ++ ) add( g, G.cylZ( 0.006, 0.12, 6 ), fat, [ - 0.08 + i * 0.04, 0.02, 0 ] );
				break;
			}
			default: { // steak
				const geo = G.sph( 0.07, 12, 6 ); geo.scale( 1.3, 0.25, 1 ); geo.translate( 0, 0.017, 0 );
				add( g, geo, flesh );
				const rim = G.torus( 0.075, 0.009, 5, 18, PI * 0.9 ); rim.scale( 1.3, 1, 1 ); rim.rotateX( PI / 2 );
				add( g, rim, fat, [ 0, 0.017, 0 ] );
			}
		}
		// butcher paper under raw cuts
		if ( ! ck && s.paper !== false && s.kind !== 'chicken' ) { add( g, G.box( 0.22, 0.002, 0.17 ), M( 0xf2ece0, { rough: 1 } ), [ 0, - 0.002, 0 ] ); ground( g, false ); }
		return g;
	} );

	// ---- fish: { len, color (back), belly, kind: 'fish'|'shark'|'octopus'|'fillet', cooked, stripe } ----
	reg( 'fish', ( s ) => {
		const g = group(), L = s.len ?? 0.35, ck = !! s.cooked;
		if ( s.kind === 'octopus' ) {
			const m = M( ck ? 0x8a3a2a : 0xb0584a, { rough: 0.45 } );
			const head = G.sph( 0.06, 12, 9 ); head.scale( 1.2, 0.8, 1 ); head.translate( - 0.06, 0.05, 0 );
			add( g, head, m );
			for ( let i = 0; i < 8; i ++ ) {
				const a = ( i / 8 - 0.5 ) * 2.4;
				const pts = [ [ - 0.02, 0.02, 0 ], [ 0.05, 0.012, Math.sin( a ) * 0.04 ], [ 0.12, 0.012, Math.sin( a ) * 0.09 + Math.cos( i ) * 0.02 ], [ 0.18, 0.015, Math.sin( a ) * 0.12 + Math.sin( i * 3 ) * 0.03 ] ];
				add( g, G.tube( pts, 0.012 - i * 0.0004, 8, 5 ), m );
			}
			return g;
		}
		if ( s.kind === 'fillet' ) {
			const geo = G.sph( L * 0.5, 12, 6 ); geo.scale( 1, 0.12, 0.35 ); geo.translate( 0, L * 0.06, 0 );
			add( g, geo, M( ck ? 0xb0773a : ( s.color ?? 0xd06a6a ), { rough: ck ? 0.7 : 0.3 } ) );
			return g;
		}
		const back = ck ? 0x7a4a22 : ( s.color ?? 0x3a6a9a ), belly = ck ? 0xb07a3a : ( s.belly ?? 0xe8eef0 );
		const R = L * ( s.kind === 'shark' ? 0.11 : ( s.deep ?? 0.16 ) );
		const prof = [ [ 0, 0 ], [ R * 0.45, L * 0.06 ], [ R * 0.85, L * 0.2 ], [ R, L * 0.38 ], [ R * 0.8, L * 0.6 ], [ R * 0.4, L * 0.8 ], [ R * 0.18, L * 0.88 ] ];
		const half = ( ps, mat ) => {
			const geo = G.lathe( prof, 8, ps, PI );
			geo.scale( 1, 1, 0.55 ); // flattened sides
			geo.rotateZ( - PI / 2 ); // lathe axis -> +x; lathe +x half -> belly
			add( g, geo, mat, [ - L * 0.44, R, 0 ] );
		};
		const backM = M( back, { rough: ck ? 0.8 : 0.3, metal: ck ? 0 : 0.25 } ), bellyM = M( belly, { rough: ck ? 0.8 : 0.3, metal: ck ? 0 : 0.3 } );
		half( 0, bellyM ); half( PI, backM );
		// tail
		const tail = G.cone( R * 0.9, L * 0.2, 4 ); tail.scale( 1, 1, 0.12 ); tail.rotateZ( PI / 2 );
		add( g, tail, backM, [ L * 0.52, R, 0 ] );
		// dorsal fin
		const fin = G.cone( L * 0.07, R * ( s.kind === 'shark' ? 1.2 : 0.8 ), 3 ); fin.scale( 1.6, 1, 0.15 );
		add( g, fin, backM, [ - L * 0.02, R * 1.75, 0 ], [ 0, 0, - 0.3 ] );
		// eye
		add( g, G.sph( R * 0.13, 6, 4 ), M( 0x111111, { rough: 0.1 } ), [ - L * 0.35, R * 1.1, R * 0.36 ] );
		if ( s.stripe && ! ck ) add( g, G.box( L * 0.5, R * 0.14, 0.001 ), M( s.stripe ), [ - L * 0.05, R * 1.05, R * 0.52 ] );
		return g;
	} );
}
