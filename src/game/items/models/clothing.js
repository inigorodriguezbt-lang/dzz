// Clothing and bags: folded shirts and pants (with printed fabrics), shoes in pairs, hats and helmets,
// masks, eyewear, vests and plate carriers, gloves, belts and backpacks.
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, fabric, shade } from './lib.js';

export function registerClothingModels( reg ) {
	// ---- folded tops: { style: tee|aloha|tank|hoodie|jacket|coat|dress|suit|wetsuit, color, color2, print, color3, rep } ----
	reg( 'shirt', ( s ) => {
		const g = group(), c = s.color ?? 0x888888;
		const cloth = fabric( c, s.print, s.color2 ?? 0xffffff, { rep: s.rep ?? 1.4, color3: s.color3, rough: s.rough } );
		const plainTrim = M( s.trim ?? shade( c, - 0.25 ), { rough: 0.9 } );
		const style = s.style || 'tee';
		const thick = { tee: 0.035, aloha: 0.035, tank: 0.025, hoodie: 0.06, jacket: 0.065, coat: 0.075, dress: 0.04, suit: 0.09, wetsuit: 0.05, polo: 0.035 }[ style ] ?? 0.04;
		const W = style === 'suit' ? 0.36 : 0.32, D = style === 'suit' ? 0.28 : 0.25;
		add( g, G.rbox( W, thick, D, Math.min( 0.012, thick * 0.4 ), 2 ), cloth );
		// sleeves folded behind show as ridges on both sides
		if ( style !== 'tank' ) for ( const z of [ - 1, 1 ] ) add( g, G.rbox( W * 0.86, thick * 0.35, 0.03, 0.006 ), cloth, [ 0, thick * 0.9, z * ( D / 2 - 0.02 ) ] );
		// collar at the top edge (+x is the neck side)
		if ( style === 'tee' || style === 'polo' || style === 'dress' ) add( g, G.torus( 0.05, 0.007, 5, 16, PI ), plainTrim, [ W / 2 - 0.02, thick + 0.002, 0 ], [ PI / 2, 0, PI / 2 ] );
		if ( style === 'aloha' || style === 'polo' || style === 'jacket' || style === 'coat' || style === 'suit' ) {
			const collar = style === 'aloha' ? cloth : plainTrim;
			add( g, G.box( 0.06, 0.008, 0.07 ), collar, [ W / 2 - 0.035, thick + 0.002, - 0.04 ], [ 0, 0.5, 0 ] );
			add( g, G.box( 0.06, 0.008, 0.07 ), collar, [ W / 2 - 0.035, thick + 0.002, 0.04 ], [ 0, - 0.5, 0 ] );
		}
		// buttons / zipper down the middle
		if ( style === 'aloha' || style === 'polo' ) for ( let i = 0; i < ( style === 'polo' ? 2 : 5 ); i ++ ) add( g, G.cyl( 0.005, 0.005, 0.002, 8 ), M( s.button ?? 0xf0e8d0, { rough: 0.4 } ), [ W / 2 - 0.08 - i * 0.05, thick, 0 ] );
		if ( style === 'jacket' || style === 'coat' || style === 'hoodie' || style === 'wetsuit' ) add( g, G.box( W * 0.85, 0.003, 0.006 ), M( s.zip ?? 0x2a2a2a, { rough: 0.4, metal: 0.6 } ), [ - 0.01, thick, 0 ] );
		if ( style === 'hoodie' ) {
			const hood = G.sph( 0.08, 12, 6, 0, PI * 2, 0, PI / 2 ); hood.scale( 0.8, 0.35, 1.1 );
			add( g, hood, cloth, [ W / 2 - 0.06, thick * 0.8, 0 ] );
			add( g, G.box( 0.1, 0.004, 0.2 ), plainTrim, [ - 0.02, thick, 0 ] ); // kangaroo pocket
		}
		if ( style === 'tank' ) for ( const z of [ - 0.06, 0.06 ] ) add( g, G.box( 0.05, 0.004, 0.025 ), cloth, [ W / 2 + 0.01, thick * 0.6, z ] );
		if ( style === 'coat' || style === 'jacket' || style === 'suit' ) for ( const z of [ - 0.07, 0.07 ] ) add( g, G.box( 0.07, 0.004, 0.06 ), plainTrim, [ - W * 0.2, thick + 0.001, z ] );
		if ( s.stripes ) for ( const x of [ - 0.06, 0.06 ] ) add( g, G.box( 0.018, 0.003, D * 0.98 ), M( s.stripes, { rough: 0.3, metal: 0.3, emissive: s.stripes, emissiveIntensity: 0.15 } ), [ x, thick + 0.001, 0 ] );
		if ( s.badge ) add( g, G.cyl( 0.018, 0.018, 0.003, 10 ), M( s.badge, { rough: 0.3, metal: 0.9 } ), [ W / 2 - 0.08, thick, - 0.06 ] );
		if ( s.patch ) add( g, G.box( 0.05, 0.003, 0.035 ), M( s.patch, { rough: 0.8 } ), [ W / 2 - 0.08, thick, 0.07 ] );
		if ( style === 'suit' ) add( g, G.dome( 0.07, 12, 5 ).scale( 1, 0.5, 1 ), M( s.color2 ?? 0x333333, { rough: 0.2, transparent: true, opacity: 0.55 } ), [ W / 2 - 0.07, thick, 0 ] );
		return g;
	} );

	// ---- folded pants: { style: long|shorts, color, print, color2, cargo, belt } ----
	reg( 'pants', ( s ) => {
		const g = group(), c = s.color ?? 0x3a4a6a;
		const cloth = fabric( c, s.print, s.color2 ?? 0xffffff, { rep: s.rep ?? 1.3, color3: s.color3 } );
		const short = s.style === 'shorts';
		const L = short ? 0.26 : 0.36, W = 0.22, T = short ? 0.035 : 0.05;
		add( g, G.rbox( L, T, W, 0.012, 2 ), cloth );
		// the fold between the legs
		add( g, G.box( L * 0.8, 0.003, 0.004 ), M( shade( c, - 0.35 ) ), [ - 0.02, T + 0.0005, 0 ] );
		// waistband and belt loops at +x
		add( g, G.rbox( 0.035, T + 0.006, W + 0.004, 0.006 ), M( s.band ?? shade( c, - 0.15 ), { rough: 0.9 } ), [ L / 2 - 0.018, 0, 0 ] );
		if ( s.drawstring ) for ( const z of [ - 0.015, 0.015 ] ) add( g, G.box( 0.07, 0.004, 0.005 ), M( 0xf0f0f0 ), [ L / 2 - 0.05, T + 0.004, z ], [ 0, z * 20, 0 ] );
		if ( s.cargo ) for ( const z of [ - 0.055, 0.055 ] ) add( g, G.rbox( 0.08, 0.012, 0.07, 0.004 ), cloth, [ - 0.02, T - 0.004, z ] );
		if ( s.stripes ) add( g, G.box( L * 0.9, 0.003, 0.012 ), M( s.stripes, { rough: 0.3, emissive: s.stripes, emissiveIntensity: 0.15 } ), [ - 0.02, T + 0.001, W * 0.4 ] );
		if ( s.button !== false && ! short ) add( g, G.cyl( 0.006, 0.006, 0.003, 8 ), M( 0xb89a50, { rough: 0.3, metal: 0.9 } ), [ L / 2 - 0.018, T + 0.006, 0 ] );
		return g;
	} );

	// ---- a pair of shoes: { style: slippers|sneakers|boots|combat|rain|reef|work|dress|tabi|fins, color, color2, sole } ----
	reg( 'shoes', ( s ) => {
		const g = group(), style = s.style || 'sneakers';
		const upper = M( s.color ?? 0xdddddd, { rough: style === 'rain' ? 0.25 : style === 'dress' ? 0.3 : 0.8 } );
		const sole = M( s.sole ?? ( style === 'slippers' ? 0x2a2a2a : 0xeeeeee ), { rough: 0.9 } );
		const acc = M( s.color2 ?? shade( s.color ?? 0xdddddd, - 0.3 ), { rough: 0.7 } );
		const one = ( z, flip ) => {
			const L = style === 'fins' ? 0.5 : 0.27;
			if ( style === 'fins' ) {
				add( g, G.rbox( L, 0.012, 0.11, 0.005 ), M( s.color ?? 0x2a7ad6, { rough: 0.4 } ), [ 0.1, 0, z ] );
				add( g, G.rbox( 0.15, 0.05, 0.1, 0.02 ), M( s.color2 ?? 0x222222, { rough: 0.7 } ), [ - 0.05, 0.008, z ] );
				return;
			}
			const s0 = G.rbox( L, style === 'slippers' ? 0.018 : 0.025, 0.095, 0.02, 2 );
			add( g, s0, sole, [ 0, 0, z ] );
			if ( style === 'slippers' ) {
				// the thong: a toe post and two straps
				add( g, G.cyl( 0.004, 0.004, 0.02, 6 ), acc, [ 0.07, 0.018, z ] );
				for ( const k of [ - 1, 1 ] ) add( g, G.cylX( 0.005, 0.11, 6 ), acc, [ 0.03, 0.026, z + k * 0.025 ], [ 0, - k * 0.45 * ( flip ? - 1 : 1 ) * 0, k * 0.3 ] );
				add( g, G.box( 0.2, 0.003, 0.085 ), M( s.color ?? 0x3a7ad6, { rough: 0.8 } ), [ - 0.02, 0.018, z ] );
				return;
			}
			const tall = { boots: 0.14, combat: 0.18, rain: 0.3, work: 0.15, tabi: 0.12, firefighter: 0.3 }[ style ] || 0;
			const uH = style === 'reef' ? 0.05 : style === 'dress' ? 0.06 : 0.075;
			// the upper: half an ellipsoid standing on the sole (the origin stays at the bottom of the sole)
			const base = 0.02, rx = 0.126, rz = style === 'dress' ? 0.043 : 0.046, x0 = 0.01;
			add( g, G.dome( 0.07, 14, 7 ).scale( rx / 0.07, uH / 0.07, rz / 0.07 ), upper, [ x0, base, z ] );
			// the top of the upper at x (for laces and trims that sit on it)
			const topAt = ( x ) => base + uH * Math.sqrt( Math.max( 0, 1 - ( ( x - x0 ) / rx ) ** 2 ) );
			const side = flip ? - 1 : 1; // the outer side of this shoe
			if ( tall ) {
				// the shaft leans back a little and a heel counter joins it to the foot
				add( g, G.cyl( 0.046, 0.052, tall, 14 ), upper, [ - 0.075, base, z ], [ 0, 0, 0.1 ] );
				add( g, G.rbox( 0.1, 0.075, rz * 1.9, 0.02, 2 ), upper, [ - 0.065, base - 0.002, z ] );
				if ( style !== 'rain' && style !== 'firefighter' && style !== 'tabi' ) add( g, G.cyl( 0.05, 0.05, 0.018, 14, true ), acc, [ - 0.075 - Math.sin( 0.1 ) * tall, base + tall * Math.cos( 0.1 ) - 0.018, z ], [ 0, 0, 0.1 ] ); // collar
			}
			if ( style === 'sneakers' || style === 'combat' || style === 'boots' || style === 'work' ) {
				// laces across the top, a toe cap, a stripe along the sole
				const lace = M( s.laces ?? ( style === 'sneakers' ? 0xf5f5f5 : 0x2a2420 ) );
				for ( let i = 0; i < 4; i ++ ) { const x = 0.05 - i * 0.02; add( g, G.box( 0.006, 0.004, rz * 0.9 ), lace, [ x, topAt( x ) - 0.0015, z ], [ 0, 0, - 0.35 ] ); }
				add( g, G.dome( 0.05, 12, 5 ).scale( 0.8, 0.9, rz / 0.05 * 0.98 ), style === 'sneakers' ? sole : acc, [ 0.085, base, z ] );
				add( g, G.box( L * 0.9, 0.007, 0.003 ), acc, [ 0, 0.008, z + side * 0.0485 ] );
				if ( style === 'sneakers' ) add( g, G.box( 0.07, 0.01, 0.003 ), acc, [ 0, base + 0.012, z + side * rz * 0.97 ], [ 0, 0, 0.3 ] ); // side flash
			}
			if ( style === 'rain' || style === 'firefighter' ) add( g, G.torus( 0.048, 0.005, 5, 18 ), acc, [ - 0.075 - Math.sin( 0.1 ) * tall, base + tall * Math.cos( 0.1 ), z ], [ PI / 2, 0, 0.1 ] );
			if ( style === 'reef' ) add( g, G.box( 0.12, 0.004, rz * 1.6 ), acc, [ 0.02, topAt( 0.02 ) - 0.012, z ] );
		};
		one( - 0.06, false ); one( 0.06, true );
		return g;
	} );

	// ---- hats & helmets: { style, color, color2, visor } ----
	reg( 'hat', ( s ) => {
		const g = group(), style = s.style || 'cap', c = s.color ?? 0x3a5a8a;
		const mat = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: 1 } ) : M( c, { rough: /helmet|hardhat/.test( style ) ? 0.35 : 0.85, metal: s.metal ?? 0 } );
		const acc = M( s.color2 ?? shade( c, - 0.3 ), { rough: 0.6 } );
		switch ( style ) {
			case 'cap': case 'police_cap': {
				add( g, G.dome( 0.095, 16, 7 ).scale( 1, 0.75, 1 ), mat );
				const brim = G.cyl( 0.075, 0.075, 0.005, 16, false ); brim.scale( 1, 1, 0.9 );
				add( g, brim, acc, [ 0.095, 0.004, 0 ], [ 0, 0, 0.15 ] );
				add( g, G.cyl( 0.009, 0.009, 0.006, 8 ), acc, [ 0, 0.07, 0 ] );
				if ( style === 'police_cap' ) add( g, G.box( 0.004, 0.025, 0.02 ), MAT.gold(), [ 0.093, 0.035, 0 ], [ 0, 0, - 0.3 ] );
				if ( s.logo ) add( g, G.box( 0.004, 0.025, 0.04 ), M( s.logo ), [ 0.09, 0.03, 0 ], [ 0, 0, - 0.35 ] );
				break;
			}
			case 'bucket': case 'boonie': {
				add( g, G.cyl( 0.08, 0.095, 0.075, 16 ), mat, [ 0, 0.02, 0 ] );
				add( g, G.cyl( style === 'boonie' ? 0.15 : 0.13, 0.1, 0.03, 18, true ), mat, [ 0, 0, 0 ] );
				add( g, G.cyl( 0.097, 0.097, 0.012, 16, true ), acc, [ 0, 0.022, 0 ] );
				break;
			}
			case 'straw': case 'paniolo': {
				const straw = fabric( c ?? 0xd8b56a, 'weave', shade( c, 0.15 ), { color3: shade( c, - 0.15 ), rep: 3, rough: 0.9 } );
				add( g, G.cyl( 0.17, 0.17, 0.006, 22 ).scale( 1, 1, style === 'paniolo' ? 0.9 : 1 ), straw );
				add( g, G.cyl( 0.075, 0.09, 0.09, 18 ), straw, [ 0, 0.004, 0 ] );
				add( g, G.cyl( 0.092, 0.092, 0.018, 18, true ), M( s.color2 ?? 0x2a2a2a, { rough: 0.8 } ), [ 0, 0.008, 0 ] ); // hatband
				if ( style === 'paniolo' ) add( g, G.torus( 0.06, 0.009, 5, 14 ), M( 0xe8403a ), [ 0, 0.02, 0 ], [ PI / 2, 0, 0 ] );
				break;
			}
			case 'beanie': {
				add( g, G.dome( 0.09, 14, 7 ).scale( 1, 0.9, 1 ), s.print ? mat : fabric( c, 'knit', shade( c, - 0.2 ), { rep: 3 } ) );
				add( g, G.cyl( 0.093, 0.093, 0.035, 16, true ), acc );
				if ( s.pom ) add( g, G.sph( 0.022, 8, 6 ), acc, [ 0, 0.085, 0 ] );
				break;
			}
			case 'visor': {
				// headband open at the back, a curved bill over the forehead (+x)
				add( g, G.torus( 0.08, 0.012, 5, 18, PI * 1.3 ), mat, [ 0, 0.012, 0 ], [ PI / 2, 0, - PI * 0.65 ] );
				const bill = new THREE.CylinderGeometry( 0.09, 0.09, 0.005, 16, 1, false, 0, PI ).scale( 0.9, 1, 1.05 );
				add( g, bill, acc, [ 0.02, 0.004, 0 ], [ 0, 0, 0.12 ] );
				break;
			}
			case 'hardhat': {
				add( g, G.dome( 0.11, 16, 8 ).scale( 1.1, 0.9, 0.95 ), mat, [ 0, 0.012, 0 ] );
				add( g, G.cyl( 0.13, 0.13, 0.012, 18 ).scale( 1.1, 1, 1 ), mat );
				add( g, G.box( 0.2, 0.02, 0.02 ), mat, [ 0, 0.1, 0 ] );
				break;
			}
			case 'helmet_moto': {
				add( g, G.sph( 0.14, 18, 12 ).scale( 1.05, 0.95, 0.95 ), mat, [ 0, 0.12, 0 ] );
				const visor = G.sph( 0.143, 14, 8, - PI * 0.35, PI * 0.7, PI * 0.33, PI * 0.28 );
				visor.rotateY( PI / 2 );
				add( g, visor, M( s.visor ?? 0x1a1a22, { rough: 0.05, metal: 0.6 } ), [ 0, 0.12, 0 ], null, [ 1.06, 0.96, 0.96 ] );
				add( g, G.cyl( 0.12, 0.13, 0.03, 16, true ), MAT.rubber(), [ 0, 0.005, 0 ] );
				if ( s.stripe ) add( g, G.torus( 0.141, 0.006, 4, 24, PI ), M( s.stripe ), [ 0, 0.12, 0 ], [ 0, 0, PI / 2 ] );
				break;
			}
			case 'helmet_mil': {
				const shell = G.sph( 0.13, 16, 9, 0, PI * 2, 0, PI * 0.55 ); shell.scale( 1.08, 0.95, 1 );
				add( g, shell, s.print ? mat : M( c, { rough: 0.85 } ), [ 0, 0.01, 0 ] );
				add( g, G.box( 0.03, 0.04, 0.05 ), MAT.darkMetal(), [ 0.13, 0.07, 0 ], [ 0, 0, - 0.4 ] ); // NVG mount
				for ( const z of [ - 0.1, 0.1 ] ) add( g, G.box( 0.1, 0.012, 0.004 ), MAT.blackPlastic(), [ 0, 0.07, z * 1.05 ] ); // rails
				add( g, G.torus( 0.105, 0.005, 4, 20, PI ), M( 0x3a3a2a ), [ 0, 0.01, 0 ], [ - PI / 2, 0, PI / 2 ] ); // strap
				break;
			}
			case 'helmet_riot': {
				add( g, G.sph( 0.14, 16, 10, 0, PI * 2, 0, PI * 0.6 ).scale( 1.05, 1, 1 ), mat, [ 0, 0.02, 0 ] );
				const shield = G.sph( 0.16, 14, 6, - PI * 0.4, PI * 0.8, PI * 0.3, PI * 0.42 ); shield.rotateY( PI / 2 );
				add( g, shield, MAT.glass( 0xd8e8f0, 0.35 ), [ 0.01, 0.02, 0 ] );
				add( g, G.box( 0.018, 0.012, 0.2 ), MAT.blackPlastic(), [ 0.118, 0.13, 0 ], [ 0, 0, - 0.5 ] ); // visor hinge, flush with the shell
				break;
			}
			case 'helmet_fire': {
				add( g, G.dome( 0.12, 16, 8 ).scale( 1, 1, 0.95 ), mat, [ 0, 0.02, 0 ] );
				const brim = G.cyl( 0.16, 0.18, 0.02, 20 ); brim.scale( 1.3, 1, 1 ); brim.translate( - 0.05, 0, 0 );
				add( g, brim, mat );
				add( g, G.box( 0.012, 0.09, 0.075 ), M( s.color2 ?? 0x2a2a2a, { rough: 0.5 } ), [ 0.11, 0.07, 0 ], [ 0, 0, - 0.35 ] ); // front shield
				add( g, G.box( 0.14, 0.02, 0.018 ), mat, [ 0, 0.13, 0 ] );
				break;
			}
			default: add( g, G.dome( 0.09, 14, 7 ), mat );
		}
		return ground( g );
	} );

	// ---- face: { style: bandana|surgical|gas|balaclava|respirator|n95, color, print } ----
	reg( 'mask', ( s ) => {
		const g = group(), c = s.color ?? 0xb02a2a;
		switch ( s.style ) {
			case 'bandana': {
				const t = G.prismX( 0.2, 0.012, 0.3 ); // a folded triangle lying flat
				add( g, G.rbox( 0.24, 0.012, 0.18, 0.004 ), fabric( c, s.print ?? 'paisley', s.color2 ?? 0xffffff, { rep: 1.2 } ) );
				t.dispose();
				add( g, G.box( 0.12, 0.004, 0.03 ), M( shade( c, - 0.2 ) ), [ 0.12, 0.004, 0.06 ], [ 0, 0.5, 0 ] );
				break;
			}
			case 'surgical': case 'n95': {
				const n95 = s.style === 'n95';
				const body = n95 ? G.dome( 0.06, 12, 6 ).scale( 1.1, 0.7, 1 ) : G.rbox( 0.17, 0.012, 0.09, 0.005 );
				add( g, body, M( c ?? 0x8ab8e0, { rough: 0.95 } ) );
				for ( const x of [ - 1, 1 ] ) add( g, G.torus( 0.035, 0.0015, 3, 14 ), M( 0xf5f5f5 ), [ x * ( n95 ? 0.07 : 0.1 ), 0.003, 0 ], [ PI / 2, 0, 0 ] );
				if ( ! n95 ) for ( let i = 0; i < 3; i ++ ) add( g, G.box( 0.168, 0.002, 0.003 ), M( shade( c, - 0.15 ) ), [ 0, 0.012, - 0.025 + i * 0.025 ] );
				break;
			}
			case 'gas': case 'respirator': {
				const rubber = M( c ?? 0x2a2a2a, { rough: 0.8 } );
				const face = G.sph( 0.09, 14, 9, 0, PI * 2, 0, PI / 2 ); face.scale( 1.1, 0.6, 0.9 );
				add( g, face, rubber );
				if ( s.style === 'gas' ) {
					for ( const z of [ - 0.035, 0.035 ] ) add( g, G.cyl( 0.024, 0.024, 0.01, 14 ), MAT.glass( 0x9ab8c0, 0.5 ), [ 0.02, 0.05, z ] );
					add( g, G.cyl( 0.035, 0.035, 0.045, 14 ), M( 0x5a5a4a, { rough: 0.5, metal: 0.5 } ), [ - 0.02, 0.035, 0 ], [ 0, 0, PI / 2 + 0.4 ] );
				} else for ( const z of [ - 0.05, 0.05 ] ) add( g, G.cyl( 0.028, 0.028, 0.02, 12 ), M( 0xd06a2a ), [ - 0.02, 0.03, z ], [ PI / 2, 0, 0 ] );
				add( g, G.torus( 0.08, 0.005, 4, 20, PI ), rubber, [ 0.02, 0.01, 0 ], [ PI / 2, 0, - PI / 2 ] );
				break;
			}
			default: { // balaclava / neck gaiter
				add( g, G.rbox( 0.24, 0.03, 0.17, 0.01 ), fabric( c ?? 0x1a1a1a, 'knit', shade( c ?? 0x1a1a1a, 0.15 ), { rep: 3 } ) );
				add( g, G.rbox( 0.08, 0.004, 0.04, 0.002 ), M( 0x080808 ), [ 0.05, 0.03, 0 ] );
			}
		}
		return ground( g );
	} );

	// ---- eyewear: { style: sun|aviator|ski|swim|dive|safety, color (frame), lens } ----
	reg( 'glasses', ( s ) => {
		const g = group(), frame = M( s.color ?? 0x1a1a1a, { rough: 0.3, metal: s.style === 'aviator' ? 0.9 : 0.1 } );
		const lens = M( s.lens ?? 0x1a1a22, { rough: 0.05, metal: 0.7, transparent: s.style === 'safety' || s.style === 'swim', opacity: 0.45 } );
		switch ( s.style ) {
			case 'ski': {
				// lying face up: a wide mirrored lens in a soft frame, the elastic strap looped behind
				add( g, G.rbox( 0.19, 0.028, 0.095, 0.02, 2 ), frame );
				add( g, G.rbox( 0.176, 0.008, 0.08, 0.018, 2 ), M( s.lens ?? 0xe08a2a, { rough: 0.08, metal: 0.85 } ), [ 0, 0.024, 0.002 ] );
				add( g, G.box( 0.03, 0.01, 0.012 ), frame, [ 0, 0.026, 0.044 ] ); // nose notch
				add( g, G.torus( 0.098, 0.006, 4, 24, PI ), M( s.strap ?? 0x2a2a2a, { rough: 0.9 } ), [ 0, 0.01, - 0.02 ], [ - PI / 2, 0, 0 ], [ 1, 0.9, 1 ] );
				break;
			}
			case 'dive': {
				const dive = true;
				const l = G.cyl( 0.045, 0.045, 0.04, 16 ); l.scale( dive ? 1.3 : 1.9, 1, 1 ); l.rotateZ( PI / 2 );
				add( g, l, dive ? MAT.glass( 0xd8eef5, 0.35 ) : M( s.lens ?? 0xe08a2a, { rough: 0.05, metal: 0.8 } ), [ 0, 0.045, 0 ] );
				add( g, G.torus( 0.07, 0.009, 5, 22, PI ), dive ? M( 0x1a1a1a, { rough: 0.6 } ) : frame, [ - 0.02, 0.045, 0 ], [ 0, PI / 2, 0 ], [ 1, 1, 1 ] );
				add( g, G.torus( 0.08, 0.006, 4, 22, PI ), M( s.strap ?? 0x2a2a2a ), [ - 0.02, 0.01, 0 ], [ PI / 2, 0, PI / 2 ] );
				if ( dive ) add( g, G.cyl( 0.009, 0.009, 0.35, 8 ), M( 0x2a8ad6, { rough: 0.5 } ), [ - 0.02, 0.01, 0.06 ], [ 0, 0, PI / 2 - 0.2 ] ); // snorkel
				break;
			}
			case 'swim': {
				for ( const z of [ - 0.022, 0.022 ] ) { add( g, G.sph( 0.02, 10, 6, 0, PI * 2, 0, PI / 2 ), lens, [ 0, 0, z ], [ 0, 0, - PI / 2 ] ); }
				add( g, G.torus( 0.06, 0.003, 3, 18, PI * 1.6 ), M( s.strap ?? 0x2a6ad6 ), [ - 0.06, 0.004, 0 ], [ PI / 2, 0, 0 ] );
				break;
			}
			default: {
				const av = s.style === 'aviator';
				for ( const z of [ - 0.034, 0.034 ] ) {
					const lg = G.cyl( 0.025, 0.025, 0.004, 16 ); lg.scale( 1, 1, av ? 1.2 : 1.15 ); lg.rotateZ( PI / 2 );
					add( g, lg, lens, [ 0.07, 0.028, z ] );
					if ( ! av ) add( g, G.torus( 0.025, 0.003, 4, 16 ), frame, [ 0.07, 0.028, z ], [ 0, PI / 2, 0 ], [ 1, 1, 1.15 ] );
				}
				add( g, G.box( 0.004, 0.004, 0.022 ), frame, [ 0.07, 0.04, 0 ] );
				for ( const z of [ - 0.065, 0.065 ] ) add( g, G.box( 0.14, 0.004, 0.003 ), frame, [ 0.0, 0.034, z ], [ 0, 0, 0.08 ] );
			}
		}
		return ground( g );
	} );

	// ---- vests: { style: plate|rig|hunting|fishing|hivis|life|press, color, color2, print } ----
	reg( 'vest', ( s ) => {
		const g = group(), c = s.color ?? 0x3a3f2a, style = s.style || 'plate';
		const mat = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: 1.2 } ) : M( c, { rough: 0.85 } );
		const acc = M( s.color2 ?? shade( c, - 0.3 ), { rough: 0.8 } );
		const T = style === 'plate' ? 0.07 : style === 'life' ? 0.08 : style === 'rig' ? 0.05 : 0.035;
		add( g, G.rbox( 0.36, T, 0.3, 0.015 ), mat );
		if ( style === 'plate' || style === 'rig' ) {
			// magazine pouches across the front
			for ( let i = 0; i < 3; i ++ ) add( g, G.rbox( 0.07, 0.035, 0.085, 0.006, 1 ), mat, [ - 0.02, T, - 0.09 + i * 0.09 ] );
			for ( let i = 0; i < 6; i ++ ) add( g, G.box( 0.008, 0.004, 0.28 ), acc, [ 0.1 - i * 0.025, T + ( i < 3 ? 0.035 : 0 ), 0 ] ); // MOLLE
			if ( s.patch ) add( g, G.box( 0.05, 0.003, 0.14 ), M( s.patch, { rough: 0.6 } ), [ 0.13, T, 0 ] );
		}
		if ( style === 'hunting' || style === 'fishing' ) {
			const n = style === 'fishing' ? 6 : 2;
			for ( let i = 0; i < n; i ++ ) add( g, G.rbox( 0.06, 0.012, 0.06, 0.004, 1 ), acc, [ 0.08 - Math.floor( i / 2 ) * 0.08, T, i % 2 ? 0.08 : - 0.08 ] );
		}
		if ( style === 'hivis' || s.stripes ) for ( const x of [ - 0.07, 0.05 ] ) add( g, G.box( 0.025, 0.003, 0.3 ), M( 0xd8d8d8, { rough: 0.2, metal: 0.6, emissive: 0x666666, emissiveIntensity: 0.3 } ), [ x, T, 0 ] );
		if ( style === 'life' ) for ( const z of [ - 0.08, 0.08 ] ) add( g, G.box( 0.3, 0.008, 0.02 ), M( 0x1a1a1a ), [ 0, T, z ] );
		// shoulder straps (+x is the top)
		for ( const z of [ - 0.09, 0.09 ] ) add( g, G.rbox( 0.08, T * 0.6, 0.05, 0.006, 1 ), mat, [ 0.2, 0, z ] );
		if ( s.text ) add( g, G.box( 0.05, 0.002, 0.16 ), M( 0xffffff, { map: null } ), [ - 0.12, T, 0 ] );
		return g;
	} );

	// ---- a pair of gloves: { color, style: work|tactical|latex|fingerless|fire|dive } ----
	reg( 'gloves', ( s ) => {
		const g = group(), m = M( s.color ?? 0x8a6a3a, { rough: s.style === 'latex' ? 0.4 : 0.85 } );
		const cuff = M( s.color2 ?? shade( s.color ?? 0x8a6a3a, - 0.25 ), { rough: 0.8 } );
		for ( const [ z, flip ] of [ [ - 0.055, 1 ], [ 0.055, - 1 ] ] ) {
			add( g, G.rbox( 0.1, 0.022, 0.085, 0.008, 1 ), m, [ 0, 0, z ] );
			const fl = s.style === 'fingerless' ? 0.025 : 0.07;
			for ( let i = 0; i < 4; i ++ ) add( g, G.capsX( 0.009, fl, 6, 2 ), m, [ 0.05 + fl / 2, 0.011, z - 0.03 + i * 0.02 ] );
			add( g, G.capsX( 0.01, 0.06, 6, 2 ), m, [ 0.02, 0.011, z + flip * 0.05 ], [ 0, flip * 0.7, 0 ] );
			add( g, G.rbox( 0.05, 0.026, 0.09, 0.008, 1 ), cuff, [ - 0.07, 0, z ] );
		}
		return g;
	} );

	// ---- belts: { color, holster, pouches, tools } ----
	reg( 'belt', ( s ) => {
		const g = group(), m = M( s.color ?? 0x3a2616, { rough: 0.6 } );
		const loop = G.torus( 0.13, 0.017, 4, 28 ); loop.scale( 1, 0.62, 0.35 ); loop.rotateX( PI / 2 );
		add( g, loop, m, [ 0, 0.006, 0 ] );
		add( g, G.box( 0.012, 0.04, 0.05 ), M( s.buckle ?? 0xb8b8b8, { rough: 0.25, metal: 0.95 } ), [ 0.13, 0, 0 ] );
		if ( s.holster ) add( g, G.rbox( 0.06, 0.035, 0.14, 0.01 ), MAT.blackPlastic(), [ - 0.08, 0.004, 0.02 ], [ 0, 0.4, 0 ] );
		if ( s.pouches ) for ( let i = 0; i < s.pouches; i ++ ) { const a = 0.4 + i * 0.7; add( g, G.rbox( 0.05, 0.035, 0.04, 0.006 ), M( s.color2 ?? 0x2a2a22, { rough: 0.8 } ), [ Math.cos( a ) * 0.12, 0.004, Math.sin( a ) * 0.075 ], [ 0, - a, 0 ] ); }
		if ( s.tools ) { add( g, G.box( 0.1, 0.012, 0.012 ), MAT.metal(), [ - 0.05, 0.03, - 0.07 ], [ 0, 0.3, 0 ] ); add( g, G.cylX( 0.008, 0.16, 6 ), M( 0xe0a020 ), [ 0.02, 0.03, 0.07 ], [ 0, - 0.2, 0 ] ); }
		return g;
	} );

	// ---- backpacks & bags: { style, color, color2, print } ----
	reg( 'backpack', ( s ) => {
		const g = group(), c = s.color ?? 0x2a4a6a, style = s.style || 'school';
		const mat = s.print ? fabric( c, s.print, s.color2 ?? 0xffffff, { rep: 1.2 } ) : M( c, { rough: style === 'dry' ? 0.35 : 0.85 } );
		const acc = M( s.color2 ?? shade( c, - 0.3 ), { rough: 0.8 } );
		const zip = M( 0x1a1a1a, { rough: 0.4, metal: 0.5 } );
		switch ( style ) {
			case 'duffel': {
				add( g, G.capsX( 0.14, 0.62, 14 ), mat, [ 0, 0.14, 0 ] );
				add( g, G.box( 0.46, 0.004, 0.008 ), zip, [ 0, 0.28, 0 ] );
				for ( const x of [ - 0.08, 0.08 ] ) add( g, G.torus( 0.05, 0.008, 4, 12, PI ), acc, [ x, 0.275, 0 ], [ 0, PI / 2, 0 ] );
				for ( const x of [ - 0.2, 0.2 ] ) add( g, G.cylX( 0.142, 0.03, 14 ), acc, [ x, 0.14, 0 ] );
				break;
			}
			case 'dry': {
				add( g, G.cylX( 0.1, 0.34, 16 ), mat, [ 0, 0.1, 0 ] );
				add( g, G.cylX( 0.1, 0.08, 16, 0.02 ), mat, [ 0.21, 0.1, 0 ] );
				add( g, G.box( 0.04, 0.02, 0.14 ), acc, [ 0.26, 0.1, 0 ] );
				add( g, G.cylX( 0.102, 0.02, 16 ), M( 0x1a1a1a ), [ - 0.12, 0.1, 0 ] );
				break;
			}
			case 'fanny': {
				add( g, G.capsX( 0.055, 0.25, 12 ).scale( 1, 1, 0.6 ), mat, [ 0, 0.055, 0 ] );
				add( g, G.box( 0.2, 0.003, 0.004 ), zip, [ 0, 0.11, 0.01 ] );
				add( g, G.torus( 0.18, 0.008, 3, 24, PI ), acc, [ 0, 0.005, - 0.02 ], [ PI / 2, 0, PI ] );
				add( g, G.box( 0.03, 0.012, 0.04 ), MAT.blackPlastic(), [ 0, 0.005, - 0.2 ] );
				break;
			}
			case 'cooler': {
				add( g, G.rbox( 0.36, 0.26, 0.24, 0.03 ), mat );
				add( g, G.rbox( 0.37, 0.04, 0.25, 0.02 ), acc, [ 0, 0.25, 0 ] );
				add( g, G.box( 0.3, 0.004, 0.004 ), zip, [ 0, 0.26, 0.125 ] );
				add( g, G.torus( 0.16, 0.01, 4, 16, PI ), acc, [ 0, 0.29, 0 ], [ 0, 0, 0 ] );
				add( g, G.box( 0.2, 0.08, 0.004 ), M( 0xffffff, { rough: 0.5 } ), [ 0, 0.1, 0.121 ] );
				break;
			}
			case 'improvised': {
				// a tarp gathered into a lumpy sack, tied off with rope that doubles as the shoulder strap
				const sack = G.sph( 0.2, 14, 10 );
				const P = sack.attributes.position;
				for ( let i = 0; i < P.count; i ++ ) {
					const x = P.getX( i ), y = P.getY( i ), z = P.getZ( i );
					const k = 1 + Math.sin( x * 31 + z * 17 ) * 0.06 + Math.sin( y * 23 - x * 13 ) * 0.05;
					P.setXYZ( i, x * k * 1.15, y * k * ( y > 0 ? 0.75 : 0.55 ), z * k * 0.8 );
				}
				sack.computeVertexNormals();
				add( g, sack, mat, [ 0, 0.11, 0 ] );
				add( g, G.cone( 0.07, 0.12, 10 ), mat, [ 0.2, 0.08, 0 ], [ 0, 0, - PI / 2 ] ); // the gathered neck
				const rope = M( s.color2 ?? 0xc8b07a, { rough: 0.95 } );
				add( g, G.torus( 0.045, 0.01, 5, 14 ), rope, [ 0.215, 0.08, 0 ], [ 0, PI / 2, 0 ] );
				add( g, G.torus( 0.2, 0.009, 4, 20, PI * 1.1 ), rope, [ 0.02, 0.1, 0 ], [ PI / 2, 0, 0.1 ] );
				return ground( g );
			}
			case 'tote': {
				add( g, G.cyl( 0.2 * Math.SQRT1_2 * 1.1, 0.2 * Math.SQRT1_2, 0.3, 4, false ).rotateY( PI / 4 ).scale( 1.6, 1, 0.5 ), mat );
				for ( const z of [ - 0.05, 0.05 ] ) add( g, G.torus( 0.08, 0.008, 4, 14, PI ), acc, [ 0, 0.3, z ] );
				break;
			}
			default: { // school | hiking | rucksack | assault | improvised | medic
				const big = style === 'hiking' ? 1.2 : style === 'rucksack' ? 1.3 : style === 'assault' ? 0.95 : style === 'improvised' ? 0.9 : 1;
				const H = 0.44 * big, W = 0.3 * big, D = 0.18 * big;
				add( g, G.rbox( W, H, D, 0.05 * big ), mat );
				add( g, G.rbox( W * 0.75, H * 0.4, D * 0.35, 0.03 ), mat, [ 0, H * 0.08, D * 0.55 ] ); // front pocket
				add( g, G.box( W * 0.6, 0.004, 0.004 ), zip, [ 0, H * 0.46, D * 0.72 ] );
				add( g, G.dome( W * 0.5, 12, 5 ).scale( 1, 0.45, D / W * 1.1 ), acc, [ 0, H - 0.02, 0.005 ] ); // lid
				for ( const x of [ - W * 0.28, W * 0.28 ] ) add( g, G.rbox( 0.05, H * 0.8, 0.02, 0.008, 1 ), M( 0x1c1c1c, { rough: 0.8 } ), [ x, H * 0.08, - D / 2 - 0.008 ] ); // straps
				add( g, G.torus( 0.035, 0.007, 4, 12, PI ), M( 0x1c1c1c ), [ 0, H + 0.005, - D * 0.2 ], [ 0, 0, 0 ] ); // grab handle
				if ( style === 'hiking' || style === 'rucksack' ) {
					for ( const x of [ - W / 2 - 0.02, W / 2 + 0.02 ] ) add( g, G.rbox( 0.05, H * 0.35, D * 0.6, 0.01, 1 ), acc, [ x, H * 0.05, 0 ] );
					add( g, G.cylX( 0.06 * big, W * 1.05, 12 ), M( s.roll ?? 0x3a6a3a, { rough: 0.8 } ), [ 0, 0.06 * big, D * 0.55 ] ); // bedroll
				}
				if ( style === 'rucksack' || style === 'assault' ) for ( let i = 0; i < 4; i ++ ) add( g, G.box( W * 0.7, 0.008, 0.006 ), acc, [ 0, H * ( 0.55 + i * 0.08 ), D * 0.5 ] );
				if ( style === 'medic' ) add( g, G.box( 0.08, 0.08, 0.004 ), M( 0xd02a2a ), [ 0, H * 0.72, D * 0.5 ] );
				// it stands upright, front pocket towards +z, so the pocket, lid and side pockets read at a glance
				return ground( g );
			}
		}
		return g;
	} );
}
