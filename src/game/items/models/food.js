// Food and drink models: printed cans and tins, bottles (lathe profiles), cartons, jars, snack bags and bars,
// cup noodles, printed boxes, Hawaiian fruit, plate lunches, meat and fish.
// Packaging prints come from pack.js (front / facts / back panels, barcodes, net contents from the def's weight).
import * as THREE from 'three';
import { M, MAT, G, PI, add, group, ground, labelTex, gradientTex, canvasTex, css, shade, hashStr, facet } from './lib.js';
import { packInfo, wrapTex, panelTex, stripTex, boxAtlas, boxUV, ridged, crown, pillow, tinWall, roundRectPlate } from './pack.js';

const flatLabel = ( spec, o = {} ) => M( 0xffffff, { map: labelTex( spec ), rough: o.rough ?? 0.6, metal: o.metal ?? 0 } );
const printed = ( map, o = {} ) => M( 0xffffff, { map, rough: o.rough ?? 0.55, metal: o.metal ?? 0, side: o.side } );
// an open cylinder band (a label) between y0 and y1, its seam at the back
const band = ( r, y0, y1, seg = 28, ts = 0, tl = PI * 2 ) => new THREE.CylinderGeometry( r, r, y1 - y0, seg, 1, true, ts, tl ).translate( 0, ( y0 + y1 ) / 2, 0 );
// a front label arc of `frac` of the circumference, centred towards the icon camera (u = 0.1 of a turn)
const arcBand = ( r, y0, y1, frac, seg = 20 ) => band( r, y0, y1, seg, 0.1 * PI * 2 - frac * PI, frac * PI * 2 );

// the ring pull of an easy-open lid: the teardrop ring, its rivet and the score line round the rim
function ringPull( g, x, y, z, s, tin, yaw = 0 ) {
	const ring = new THREE.TorusGeometry( 0.0075 * s, 0.0016 * s, 4, 14 ).scale( 1.25, 1, 1 ).rotateX( PI / 2 );
	const k = group();
	add( k, ring, tin, [ 0.006 * s, 0.0012, 0 ] );
	add( k, G.box( 0.008 * s, 0.0008, 0.006 * s ), tin, [ - 0.004 * s, 0.0006, 0 ] );
	add( k, G.cyl( 0.0022 * s, 0.0025 * s, 0.0012, 8 ), tin, [ - 0.006 * s, 0, 0 ] );
	k.position.set( x, y, z ); k.rotation.y = yaw;
	g.add( k );
}

export function registerFoodModels( reg ) {
	// ---- round cans: { r, h, label, style: 'food'|'soda', tab, metal, cap (a plastic overcap) } ----
	reg( 'can', ( s, def ) => {
		const r = s.r ?? 0.037, h = s.h ?? 0.11, g = group(), seg = 28;
		const soda = s.style === 'soda';
		const tin = s.metal ? M( s.metal, { rough: 0.3, metal: 0.9 } ) : soda ? M( 0xd6d9dd, { rough: 0.22, metal: 1 } ) : MAT.tin();
		const info = packInfo( s.label || {}, def, soda ? 'drink' : null );
		if ( soda ) {
			// a drawn aluminium can: the domed base on its stand ring, the necked shoulder, the rolled rim, the lid
			const y1 = h * 0.86;
			add( g, G.lathe( [ [ 0, 0.008 ], [ r * 0.5, 0.0065 ], [ r * 0.7, 0.002 ], [ r * 0.78, 0 ], [ r * 0.86, 0.0012 ], [ r * 0.95, 0.005 ], [ r, 0.011 ] ], seg ), tin );
			add( g, band( r, 0.011, y1, seg ), printed( wrapTex( s.label || { text: '?' }, info, 2 * PI * r, y1 - 0.011 ), { rough: 0.3, metal: 0.55 } ) );
			add( g, G.lathe( [ [ r, y1 ], [ r * 0.985, h * 0.885 ], [ r * 0.93, h * 0.925 ], [ r * 0.86, h * 0.958 ], [ r * 0.825, h * 0.976 ], [ r * 0.835, h * 0.99 ], [ r * 0.83, h ], [ r * 0.8, h * 0.998 ], [ r * 0.785, h * 0.982 ], [ r * 0.76, h * 0.978 ], [ 0, h * 0.978 ] ], seg ), tin );
			// the stay-on tab over its scored opening
			add( g, new THREE.TorusGeometry( r * 0.24, 0.0007, 3, 16 ).scale( 1, 1.35, 1 ).rotateX( PI / 2 ), M( 0x9a9ea4, { rough: 0.4, metal: 0.9 } ), [ r * 0.42, h * 0.979, 0 ] );
			const tab = new THREE.Shape();
			tab.absarc( 0, 0, 0.0055, PI * 0.5, PI * 1.5, false ); tab.lineTo( 0.016, - 0.0055 ); tab.absarc( 0.016, 0, 0.0055, - PI * 0.5, PI * 0.5, false ); tab.lineTo( 0, 0.0055 );
			const hole = new THREE.Path(); hole.absarc( - 0.0005, 0, 0.0034, 0, PI * 2, true ); tab.holes.push( hole );
			add( g, new THREE.ExtrudeGeometry( tab, { depth: 0.0007, bevelEnabled: false, curveSegments: 5 } ).rotateX( - PI / 2 ), M( 0xc4c8cc, { rough: 0.25, metal: 1 } ), [ - r * 0.32, h * 0.981, 0 ] );
			add( g, G.cyl( 0.0022, 0.0022, 0.0012, 8 ), tin, [ 0, h * 0.979, 0 ] );
			return g;
		}
		// a three-piece food can: double seams top and bottom, a paper label, a countersunk lid with its rings
		const sh = Math.min( 0.007, h * 0.12 );
		add( g, G.lathe( [ [ 0, 0.0035 ], [ r * 0.9, 0.003 ], [ r * 0.95, 0.001 ], [ r * 0.98, 0 ], [ r * 1.014, 0.0012 ], [ r * 1.02, sh * 0.6 ], [ r * 1.008, sh * 0.9 ], [ r * 0.996, sh ] ], seg ), tin );
		add( g, band( r * 1.002, sh, h - sh, seg ), printed( wrapTex( s.label || { text: '?' }, info, 2 * PI * r, h - sh * 2 ), { rough: 0.5 } ) );
		const top = [ [ r * 0.996, h - sh ], [ r * 1.008, h - sh * 0.9 ], [ r * 1.02, h - sh * 0.45 ], [ r * 1.016, h - 0.0002 ], [ r * 0.985, h + 0.0006 ], [ r * 0.955, h ], [ r * 0.94, h - 0.0025 ] ];
		for ( const [ a, b ] of [ [ 0.9, 0.84 ], [ 0.72, 0.66 ], [ 0.5, 0.44 ] ] ) top.push( [ r * a, h - 0.0035 ], [ r * ( a + b ) / 2, h - 0.0023 ], [ r * b, h - 0.0035 ] );
		top.push( [ 0, h - 0.0035 ] );
		add( g, G.lathe( top, seg ), tin );
		if ( s.cap != null ) {
			// a clear-ish plastic overcap (coffee, nuts)
			add( g, G.lathe( [ [ r * 1.035, h - 0.006 ], [ r * 1.04, h + 0.004 ], [ r * 1.0, h + 0.0085 ], [ 0, h + 0.0085 ] ], seg ), M( s.cap, { rough: 0.35 } ) );
		} else if ( s.tab !== false ) {
			add( g, new THREE.TorusGeometry( r * 0.86, 0.0006, 3, 24 ).rotateX( PI / 2 ), M( 0x9ea2a8, { rough: 0.35, metal: 0.9 } ), [ 0, h - 0.0022, 0 ] );
			ringPull( g, r * 0.62, h - 0.0034, 0, Math.min( 1.2, r / 0.037 ), tin, PI );
		}
		return g;
	} );

	// ---- rectangular tins (luncheon meat, corned beef, sardines): { size: [x, y, z], label, taper, key } ----
	reg( 'tin', ( s, def ) => {
		const [ w, h, d ] = s.size || [ 0.095, 0.075, 0.055 ], g = group();
		const tin = MAT.tin(), rim = M( 0xb4b8be, { rough: 0.3, metal: 0.95 } );
		const info = packInfo( s.label || {}, def );
		const taper = s.taper ?? 1;
		if ( h < 0.45 * Math.min( w, d ) ) {
			// flat tins (sardines): a drawn body with a printed lid and a ring pull at one end
			const cr = Math.min( w, d ) * 0.32;
			add( g, roundRectPlate( w, d, cr, h * 0.85 ), tin );
			add( g, roundRectPlate( w * 1.012, d * 1.012, cr * 1.01, 0.002 ), rim, [ 0, h * 0.85, 0 ] );
			const lid = roundRectPlate( w * 0.94, d * 0.92, cr * 0.9, 0.0008 );
			add( g, lid, printed( panelTex( s.label || {}, info, w * 0.94, d * 0.92, 'front' ), { rough: 0.35, metal: 0.35 } ), [ 0, h * 0.85 + 0.0015, 0 ] );
			ringPull( g, w * 0.37, h * 0.85 + 0.0023, 0, 1, tin, 0 );
			return g;
		}
		// a drawn tin with a rolled seam top and bottom, its label round all four sides
		const cr = Math.min( w, d ) * 0.2, sh = Math.min( 0.006, h * 0.08 );
		add( g, roundRectPlate( w * 1.01, d * 1.01, cr, sh ), rim );
		const wall = tinWall( w, h - sh * 2, d, cr, taper, 4 );
		const f = wall.faces;
		const tex = stripTex( s.label || { text: '?' }, info, wall.len, h - sh * 2, [
			{ kind: 'facts', u0: f.px[ 0 ], u1: f.px[ 1 ] }, { kind: 'back', u0: f.nz[ 0 ], u1: f.nz[ 1 ] }, { kind: 'side', u0: f.nx[ 0 ], u1: f.nx[ 1 ] }, { kind: 'front', u0: f.pz[ 0 ], u1: f.pz[ 1 ] } ] );
		add( g, wall.geo, printed( tex, { rough: 0.4, metal: 0.25 } ), [ 0, sh, 0 ] );
		const tw = w * taper, td = d * taper;
		add( g, roundRectPlate( tw * 1.012, td * 1.012, cr * taper, sh ), rim, [ 0, h - sh, 0 ] );
		add( g, roundRectPlate( tw * 0.9, td * 0.86, cr * 0.8, 0.0012 ), tin, [ 0, h - 0.0004, 0 ] );
		if ( s.key ) {
			// the key-opened tin: a scored strip round the top, the key soldered to one end
			const kk = 1 + ( taper - 1 ) * ( h * 0.72 - sh ) / ( h - sh * 2 );
			add( g, roundRectPlate( w * kk * 1.01, d * kk * 1.01, cr * kk, 0.003 ), rim, [ 0, h * 0.72, 0 ] );
			add( g, G.cylX( 0.0016, w * 0.55, 6 ), tin, [ 0, h + 0.0022, - d * 0.15 ] );
			add( g, new THREE.TorusGeometry( 0.006, 0.0015, 4, 10 ), tin, [ w * 0.3 + 0.007, h + 0.0022, - d * 0.15 ], [ PI / 2, 0, 0 ] );
		} else ringPull( g, tw * 0.3, h + 0.0008, 0, 1.1, tin, 0 );
		return g;
	} );

	// ---- bottles: { style, h, r, glass, clear, liquid, fill, cap, capMetal, capH, label, labelY, labelH, squash, mat } ----
	// profiles: [ radius, height ] fractions of r and h, bottom to the lip
	const PROFILES = {
		water: [ [ 0, 0.01 ], [ 0.7, 0 ], [ 0.95, 0.012 ], [ 1, 0.05 ], [ 1, 0.24 ], [ 0.95, 0.265 ], [ 1, 0.29 ], [ 1, 0.5 ], [ 0.94, 0.525 ], [ 1, 0.55 ], [ 1, 0.68 ], [ 0.92, 0.75 ], [ 0.7, 0.82 ], [ 0.46, 0.875 ], [ 0.4, 0.895 ], [ 0.4, 0.935 ], [ 0.46, 0.94 ], [ 0.38, 0.945 ] ],
		soda: [ [ 0, 0.02 ], [ 0.4, 0.004 ], [ 0.6, 0 ], [ 0.8, 0.02 ], [ 1, 0.07 ], [ 1, 0.6 ], [ 0.94, 0.68 ], [ 0.7, 0.78 ], [ 0.46, 0.87 ], [ 0.4, 0.9 ], [ 0.4, 0.935 ], [ 0.46, 0.94 ], [ 0.38, 0.945 ] ],
		beer: [ [ 0, 0.012 ], [ 0.88, 0 ], [ 0.98, 0.015 ], [ 1, 0.04 ], [ 1, 0.54 ], [ 0.97, 0.6 ], [ 0.86, 0.66 ], [ 0.6, 0.73 ], [ 0.42, 0.79 ], [ 0.37, 0.85 ], [ 0.36, 0.95 ], [ 0.42, 0.96 ], [ 0.42, 0.985 ], [ 0.36, 0.99 ] ],
		wine: [ [ 0, 0.03 ], [ 0.6, 0.01 ], [ 0.95, 0 ], [ 1, 0.02 ], [ 1, 0.6 ], [ 0.94, 0.68 ], [ 0.66, 0.75 ], [ 0.38, 0.8 ], [ 0.31, 0.86 ], [ 0.3, 0.96 ], [ 0.35, 0.965 ], [ 0.35, 0.99 ], [ 0.29, 0.995 ] ],
		liquor: [ [ 0, 0.015 ], [ 0.9, 0 ], [ 1, 0.02 ], [ 1, 0.65 ], [ 0.97, 0.69 ], [ 0.75, 0.73 ], [ 0.42, 0.765 ], [ 0.35, 0.8 ], [ 0.34, 0.94 ], [ 0.39, 0.945 ], [ 0.39, 0.97 ], [ 0.32, 0.975 ] ],
		jug: [ [ 0, 0.01 ], [ 0.9, 0 ], [ 1, 0.03 ], [ 1, 0.7 ], [ 0.9, 0.78 ], [ 0.6, 0.85 ], [ 0.32, 0.88 ], [ 0.3, 0.9 ], [ 0.3, 0.955 ], [ 0.34, 0.96 ], [ 0.27, 0.965 ] ],
		sports: [ [ 0, 0.01 ], [ 0.8, 0 ], [ 0.97, 0.02 ], [ 1, 0.07 ], [ 0.92, 0.25 ], [ 0.86, 0.36 ], [ 0.94, 0.47 ], [ 1, 0.56 ], [ 1, 0.7 ], [ 0.86, 0.79 ], [ 0.6, 0.86 ], [ 0.52, 0.89 ], [ 0.52, 0.93 ] ],
		milk: [ [ 0, 0.01 ], [ 0.9, 0 ], [ 1, 0.03 ], [ 1, 0.74 ], [ 0.75, 0.83 ], [ 0.44, 0.9 ], [ 0.4, 0.94 ] ],
		syrup: [ [ 0, 0.012 ], [ 0.9, 0 ], [ 1, 0.025 ], [ 1, 0.6 ], [ 0.92, 0.67 ], [ 0.62, 0.74 ], [ 0.38, 0.79 ], [ 0.31, 0.83 ], [ 0.3, 0.92 ] ],
	};
	const GLASS = new Set( [ 'beer', 'wine', 'liquor' ] );
	reg( 'bottle', ( s, def ) => {
		const H = s.h ?? 0.24, R = s.r ?? 0.034, g = group(), style = s.style || 'water', seg = 22;
		const prof = ( PROFILES[ style ] || PROFILES.water ).map( ( [ a, b ] ) => [ a * R, b * H ] );
		const top = prof[ prof.length - 1 ][ 1 ], neckR = prof[ prof.length - 1 ][ 0 ];
		const glassy = s.mat ? s.mat === 'glass' : GLASS.has( style ) || ( style === 'syrup' && ! s.clear && lum3( s.glass ) < 0.35 );
		const sq = ( geo ) => { if ( s.squash ) geo.scale( 1, 1, s.squash ); return geo; };
		const info = packInfo( s.label || {}, def );
		// the shell: clear plastic / glass shows what is inside; tinted glass too (darker); opaque plastic doesn't
		let shell;
		if ( s.clear ) shell = M( s.glass ?? 0xd8eef5, { rough: 0.04, transparent: true, opacity: s.opacity ?? ( glassy ? 0.38 : 0.3 ), metal: 0.1 } );
		else if ( glassy ) shell = M( s.glass ?? 0x5a3515, { rough: 0.05, transparent: true, opacity: 0.86, metal: 0.15 } );
		else shell = M( s.glass ?? 0xeeeeea, { rough: 0.32, metal: 0.02 } );
		add( g, sq( G.lathe( prof.concat( [ [ 0, top ] ] ), seg ) ), shell );
		// what is inside: the liquid up to its fill line (tinted glass always looks full, dark)
		const fillK = s.clear ? ( s.liquid != null ? s.fill ?? 0.8 : 0 ) : glassy ? s.fill ?? 0.82 : 0;
		if ( fillK > 0 ) {
			const fillY = top * fillK, inner = [ [ 0, 0.004 ] ];
			for ( const [ a, b ] of prof ) { if ( b >= fillY ) break; if ( b > 0.003 ) inner.push( [ a * 0.9, b ] ); }
			const last = inner[ inner.length - 1 ];
			const lr = profR( prof, fillY ) * 0.9;
			inner.push( [ lr, fillY ], [ 0, fillY ] );
			if ( last ) {
				const lc = s.clear ? s.liquid : shade( s.glass ?? 0x5a3515, - 0.55 );
				const lm = s.clear && s.liquidClear ? M( lc, { rough: 0.08, transparent: true, opacity: 0.5 } ) : M( lc, { rough: 0.12 } );
				add( g, sq( G.lathe( inner, 16 ) ), lm );
			}
		}
		// the closure
		const capC = s.cap ?? 0x2266cc, capH = H * ( s.capH ?? 0.06 );
		if ( s.cap !== null ) {
			if ( style === 'beer' && s.capMetal ) add( g, crown( neckR * 1.12, 0.004, 21 ), M( capC, { rough: 0.3, metal: 0.85 } ), [ 0, top - 0.002, 0 ] );
			else if ( ( style === 'wine' || style === 'liquor' ) && s.capMetal ) {
				// a foil capsule down the neck
				add( g, G.lathe( [ [ neckR * 1.04, top - H * 0.13 ], [ neckR * 1.06, top - H * 0.02 ], [ neckR * 0.9, top + 0.002 ], [ 0, top + 0.002 ] ], 18 ), M( capC, { rough: 0.25, metal: 0.8 } ) );
			} else if ( style === 'sports' ) {
				add( g, ridged( neckR * 1.15, capH * 0.6, 14, 0.05 ), M( capC, { rough: 0.4 } ), [ 0, top - 0.002, 0 ] );
				add( g, G.cyl( neckR * 0.55, neckR * 0.7, capH * 0.55, 14 ), M( capC, { rough: 0.35 } ), [ 0, top - 0.002 + capH * 0.6, 0 ] );
			} else {
				add( g, ridged( neckR * 1.12, capH, 16, 0.045 ), M( capC, { rough: s.capMetal ? 0.28 : 0.45, metal: s.capMetal ? 0.85 : 0 } ), [ 0, top - capH * 0.35, 0 ] );
			}
		}
		// the label: a full wrap on plastic, a front label (and a neck band on beer and wine) on glass
		if ( s.label ) {
			const y0 = H * ( s.labelY ?? 0.18 ), lh = H * ( s.labelH ?? 0.3 ), lr = profR( prof, y0 + lh / 2 ) * 1.006;
			if ( glassy ) {
				const frac = s.labelArc ?? 0.42;
				add( g, sq( arcBand( lr, y0, y0 + lh, frac ) ), printed( panelTex( s.label, info, lr * PI * 2 * frac, lh, 'front' ), { rough: 0.6 } ) );
				// a smaller back label
				add( g, sq( band( lr, y0 + lh * 0.12, y0 + lh * 0.82, 10, 0.1 * PI * 2 + PI - PI * 0.22, PI * 0.44 ) ), printed( panelTex( s.label, info, lr * PI * 0.44, lh * 0.7, 'back' ), { rough: 0.6 } ) );
				if ( style === 'beer' || style === 'wine' ) {
					const ny = top - H * ( style === 'beer' ? 0.2 : 0.22 ), nr = profR( prof, ny + H * 0.03 ) * 1.02;
					add( g, band( nr, ny, ny + H * 0.06, 16 ), M( s.label.band ?? s.label.bg ?? 0xd8b84a, { rough: 0.35, metal: style === 'wine' ? 0.6 : 0.1 } ) );
				}
			} else add( g, sq( band( lr, y0, y0 + lh, 28 ) ), printed( wrapTex( s.label, info, 2 * PI * lr, lh ), { rough: 0.45 } ) );
		}
		if ( style === 'jug' ) {
			// the moulded handle, hollow behind
			add( g, G.tube( [ [ R * 0.5, H * 0.86, 0 ], [ R * 0.95, H * 0.84, 0 ], [ R * 1.1, H * 0.68, 0 ], [ R * 0.98, H * 0.52, 0 ] ], R * 0.11, 12, 6 ), shell );
		}
		return g;
	} );
	const lum3 = ( c ) => { if ( c == null ) return 1; const k = new THREE.Color( c ); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; };
	// the profile's radius at a height
	function profR( prof, y ) {
		for ( let i = 1; i < prof.length; i ++ ) if ( prof[ i ][ 1 ] >= y ) { const [ a0, b0 ] = prof[ i - 1 ], [ a1, b1 ] = prof[ i ]; return a0 + ( a1 - a0 ) * ( ( y - b0 ) / Math.max( 1e-6, b1 - b0 ) ); }
		return prof[ prof.length - 1 ][ 0 ];
	}

	// ---- gable-top cartons and juice boxes: { size, label, gable, cap } ----
	reg( 'carton', ( s, def ) => {
		const [ w, h, d ] = s.size || [ 0.07, 0.2, 0.07 ], g = group();
		const info = packInfo( { ...( s.label || {} ), pack: 'carton' }, def );
		info.deposit = false;
		const spec = s.label || { text: '?' };
		const board = M( spec.bg ?? 0xf2f2ee, { rough: 0.7 } );
		if ( s.gable === false ) {
			// a juice box: printed all round, the straw in its wrapper on the back, the foil spot on top
			const geo = G.rbox( w, h, d, 0.0025, 1 );
			const { tex, rects } = boxAtlas( spec, info, w, h, d, 'z', { max: 512 } );
			add( g, boxUV( geo, rects ), printed( tex, { rough: 0.6 } ) );
			add( g, G.cyl( 0.0035, 0.0035, 0.0008, 10 ), M( 0xd8dce0, { rough: 0.3, metal: 0.8 } ), [ w * 0.25, h, 0 ] );
			add( g, G.box( 0.007, h * 0.8, 0.004 ), MAT.glass( 0xffffff, 0.35 ), [ w * 0.15, h * 0.08, - d / 2 - 0.002 ], [ 0, 0, 0.12 ] );
			add( g, G.cyl( 0.0022, 0.0022, h * 0.76, 6 ), M( spec.band ?? 0xf0d060, { rough: 0.4 } ), [ w * 0.15, h * 0.1, - d / 2 - 0.002 ], [ 0, 0, 0.12 ] );
			return g;
		}
		// the gable top: the printed body, two roof panels, the sealed fin, a screw spout
		const bodyH = h * 0.8;
		const geo = G.box( w, bodyH, d );
		const { tex, rects } = boxAtlas( spec, info, w, bodyH, d, 'z', { max: 768 } );
		add( g, boxUV( geo, rects ), printed( tex, { rough: 0.62 } ) );
		const roofH = h * 0.14, slope = Math.hypot( d / 2, roofH ), ang = Math.atan2( roofH, d / 2 );
		for ( const sz of [ - 1, 1 ] ) add( g, G.box( w * 0.998, 0.0015, slope ).translate( 0, 0, - slope / 2 ), board, [ 0, bodyH, sz * d / 2 ], [ sz * ang, sz > 0 ? 0 : PI, 0 ] );
		// the gable ends: triangles
		const tri = new THREE.Shape( [ new THREE.Vector2( - d / 2, 0 ), new THREE.Vector2( d / 2, 0 ), new THREE.Vector2( 0, roofH ) ] );
		for ( const sx of [ - 1, 1 ] ) add( g, new THREE.ShapeGeometry( tri ).rotateY( sx * PI / 2 ), M( shade( spec.bg ?? 0xf2f2ee, - 0.08 ), { rough: 0.7, side: THREE.DoubleSide } ), [ sx * w * 0.47, bodyH, 0 ] );
		add( g, G.box( w * 0.99, h * 0.06, 0.004 ), board, [ 0, bodyH + roofH - 0.002, 0 ] );
		add( g, ridged( 0.011, 0.012, 12, 0.06 ), M( s.cap ?? 0x2a6fd6, { rough: 0.4 } ), [ w * 0.12, bodyH + roofH * 0.42, d * 0.22 ], [ ang, 0, 0 ] );
		return g;
	} );

	// ---- jars: { r, h, content, lid, lidMetal, label, clear, body } ----
	reg( 'jar', ( s, def ) => {
		const r = s.r ?? 0.045, h = s.h ?? 0.12, g = group(), seg = 24;
		const info = packInfo( s.label || {}, def );
		const lidH = h * 0.13, bodyTop = h - lidH * 0.85;
		const prof = [ [ 0, 0.004 ], [ r * 0.85, 0 ], [ r * 0.98, h * 0.03 ], [ r, h * 0.08 ], [ r, h * 0.72 ], [ r * 0.95, h * 0.79 ], [ r * 0.86, h * 0.83 ], [ r * 0.85, bodyTop + 0.002 ] ];
		if ( s.clear ) {
			add( g, G.lathe( prof.concat( [ [ 0, bodyTop + 0.002 ] ] ), seg ), MAT.glass( 0xe8f2f2, 0.28 ) );
			add( g, G.lathe( [ [ 0, 0.004 ], [ r * 0.88, 0.004 ], [ r * 0.94, h * 0.08 ], [ r * 0.94, h * 0.7 ], [ r * 0.9, h * 0.74 ], [ 0, h * 0.745 ] ], 18 ), M( s.content ?? 0xa0673a, { rough: 0.55 } ) );
		} else add( g, G.lathe( prof.concat( [ [ 0, bodyTop + 0.002 ] ] ), seg ), M( s.body ?? s.content ?? 0xdddddd, { rough: 0.35 } ) );
		// the lid: knurled plastic or a smooth metal cap with a rolled edge, its top printed
		const lidM = M( s.lid ?? 0xcc2222, { rough: s.lidMetal ? 0.28 : 0.4, metal: s.lidMetal ? 0.85 : 0 } );
		if ( s.lidMetal ) add( g, G.lathe( [ [ r * 0.86, bodyTop - lidH * 0.1 ], [ r * 0.9, bodyTop - lidH * 0.1 ], [ r * 0.91, bodyTop + lidH * 0.8 ], [ r * 0.88, bodyTop + lidH ], [ 0, bodyTop + lidH ] ], seg ), lidM );
		else if ( s.clear ) add( g, ridged( r * 0.9, lidH, 24, 0.035 ), lidM, [ 0, bodyTop - lidH * 0.1, 0 ] );
		// a tub's snap-on lid, its lip over the rim
		else add( g, G.lathe( [ [ r * 0.95, bodyTop - lidH * 0.2 ], [ r * 1.0, bodyTop - lidH * 0.1 ], [ r * 1.0, bodyTop + lidH * 0.55 ], [ r * 0.96, bodyTop + lidH * 0.7 ], [ r * 0.9, bodyTop + lidH * 0.72 ], [ r * 0.86, bodyTop + lidH * 0.9 ], [ 0, bodyTop + lidH * 0.9 ] ], seg ), lidM );
		if ( s.label ) {
			add( g, new THREE.CircleGeometry( r * 0.72, 22 ).rotateX( - PI / 2 ), printed( panelTex( { ...s.label, sub: '', glyph: null, style: 'plain', bg: s.lid ?? s.label.bg, band: s.lid ?? s.label.band }, info, r * 1.44, r * 1.44, 'top', { max: 256 } ), { rough: 0.4, metal: s.lidMetal ? 0.6 : 0 } ), [ 0, bodyTop + lidH * ( s.lidMetal ? 1 : 0.9 ) + 0.0004, 0 ] );
			add( g, band( r * 1.006, h * 0.12, h * 0.68, 28 ), printed( wrapTex( s.label, info, 2 * PI * r, h * 0.56 ), { rough: 0.6 } ) );
		}
		return g;
	} );

	// ---- snack bags / rice sacks: { size, label, flat, crimp, matte } ----
	reg( 'bag', ( s, def ) => {
		const [ w, h, d ] = s.size || [ 0.2, 0.28, 0.07 ], g = group();
		const flat = !! s.flat, spec = s.label || { text: '?' };
		// lying flat: the bag's "height" runs along z, its thickness is y
		const bw = w, bh = flat ? d : h, bd = flat ? h : d;
		const info = packInfo( spec, def );
		const crimp = s.crimp === false ? 0.025 : 0.075;
		const { tex, rects } = boxAtlas( spec, info, bw, bh, bd, 'z', { max: 768, inset: [ 0.07, crimp + 0.015 ] } );
		const geo = pillow( bw, bh, bd, rects, { crimp, pow: s.crimp === false ? 0.3 : 0.5, seed: hashStr( spec.text || '' ) } );
		const mat = printed( tex, { rough: s.matte ? 0.85 : 0.3, metal: s.matte ? 0 : 0.35, side: THREE.DoubleSide } );
		const m = add( g, geo, mat );
		if ( s.crimp !== false ) {
			// the heat-sealed ends: pleated strips
			const cm = M( shade( spec.band ?? spec.bg ?? 0x999999, 0.05 ), { rough: 0.35, metal: s.matte ? 0 : 0.4 } );
			for ( const y of [ 0, bh * ( 1 - crimp * 0.9 ) ] ) add( g, G.box( bw * 0.995, bh * crimp * 0.9, 0.0024 ), cm, [ 0, y, 0 ] );
			for ( let i = 0; i < 2; i ++ ) for ( let k = 0; k < 14; k ++ ) add( g, G.box( 0.0012, bh * crimp * 0.8, 0.003 ), M( shade( spec.band ?? spec.bg ?? 0x999999, - 0.25 ), { rough: 0.5 } ), [ ( k / 13 - 0.5 ) * bw * 0.94, i ? bh * ( 1 - crimp * 0.85 ) : bh * 0.005, 0 ] );
		}
		if ( flat ) {
			const inner = group(); while ( g.children.length ) inner.add( g.children[ 0 ] );
			inner.rotation.x = - PI / 2; inner.position.z = bh / 2;
			g.add( inner );
			return ground( g );
		}
		void m;
		return g;
	} );

	// ---- wrapped bars (granola, candy, MRE pouch): { size, label, matte } ----
	reg( 'bar', ( s, def ) => {
		const [ w, h, d ] = s.size || [ 0.13, 0.014, 0.035 ], g = group();
		const spec = s.label || { text: '?' }, info = packInfo( spec, def );
		const { tex, rects } = boxAtlas( spec, info, w, d, h, 'z', { max: 512, inset: [ 0.07, 0.05 ] } );
		const geo = pillow( w, d, h, rects, { ends: 'x', crimp: 0.06, pow: 0.35, nx: 14, ny: 6, seed: hashStr( spec.text || '' ) } );
		const inner = group();
		add( inner, geo, printed( tex, { rough: s.matte ? 0.85 : 0.28, metal: s.matte ? 0 : 0.45, side: THREE.DoubleSide } ) );
		// the crimped ends
		const cm = M( shade( spec.bg ?? 0x999999, - 0.1 ), { rough: 0.4, metal: s.matte ? 0 : 0.35 } );
		for ( const sx of [ - 1, 1 ] ) {
			add( inner, G.box( w * 0.05, d * 0.995, 0.0018 ), cm, [ sx * w * 0.475, 0, 0 ] );
			for ( let k = 0; k < 8; k ++ ) add( inner, G.box( 0.001, d * 0.95, 0.0024 ), M( shade( spec.bg ?? 0x999999, - 0.35 ) ), [ sx * w * ( 0.46 + ( k % 4 ) * 0.008 ), d * 0.02, 0 ], [ 0, 0, 0 ] );
		}
		inner.rotation.x = - PI / 2; inner.position.z = d / 2;
		g.add( inner );
		return ground( g );
	} );

	// ---- cup noodles: { r, h, label } ----
	reg( 'cup', ( s, def ) => {
		const r = s.r ?? 0.047, h = s.h ?? 0.1, g = group();
		const spec = s.label || { text: '?' }, info = packInfo( spec, def );
		// the foam cup tapers to its foot; the print wraps it, the foil lid carries the brand
		const cup = new THREE.CylinderGeometry( r, r * 0.72, h * 0.94, 28, 1, true ).translate( 0, h * 0.47, 0 );
		add( g, cup, printed( wrapTex( spec, info, PI * ( r + r * 0.72 ), h * 0.94 ), { rough: 0.75 } ) );
		add( g, G.lathe( [ [ 0, 0.004 ], [ r * 0.7, 0.004 ], [ r * 0.72, 0 ] ], 20 ), M( 0xf2f0ea, { rough: 0.9 } ) );
		add( g, G.lathe( [ [ r * 0.99, h * 0.94 ], [ r * 1.05, h * 0.95 ], [ r * 1.05, h * 0.985 ], [ r * 1.0, h * 0.99 ] ], 28 ), M( 0xf6f4ee, { rough: 0.8 } ) );
		const foil = M( 0xffffff, { map: panelTex( { ...spec, style: 'plain', sub: spec.sub, glyph: null }, info, r * 2, r * 2, 'front', { max: 256 } ), rough: 0.3, metal: 0.55 } );
		add( g, new THREE.CircleGeometry( r * 1.05, 28 ).rotateX( - PI / 2 ), foil, [ 0, h * 0.992, 0 ] );
		add( g, G.box( 0.024, 0.0006, 0.02 ), M( 0xd8dce0, { rough: 0.3, metal: 0.8 } ), [ r * 1.12, h * 0.99, 0 ], [ 0, 0, - 0.12 ] );
		return g;
	} );

	// ---- printed boxes (cereal, crackers, MRE case, matches…): { size, label, labelAxis, color, round } ----
	reg( 'box', ( s, def ) => {
		const [ w, h, d ] = s.size || [ 0.2, 0.1, 0.12 ], g = group();
		if ( s.label ) {
			const info = packInfo( s.label, def );
			const axis = s.labelAxis === 'y' ? 'y' : 'z';
			const geo = G.rbox( w, h, d, s.round ?? Math.min( 0.0016, Math.min( w, h, d ) * 0.06 ), 1 );
			const { tex, rects } = boxAtlas( s.label, info, w, h, d, axis, { max: Math.max( w, h, d ) > 0.15 ? 1024 : 512 } );
			add( g, boxUV( geo, rects ), printed( tex, { rough: s.rough ?? 0.7, metal: s.metal ?? 0 } ) );
		} else add( g, G.rbox( w, h, d, s.round ?? 0.004 ), M( s.color ?? 0x8a8f96, { rough: s.rough ?? 0.7, metal: s.metal ?? 0 } ) );
		return g;
	} );

	// ---- fruit & produce: { kind, cooked } ----
	const cookedTint = ( c, cooked ) => cooked ? shade( c, - 0.45 ) : c;
	reg( 'fruit', ( s ) => {
		const g = group(), k = s.kind || 'mango', ck = !! s.cooked;
		switch ( k ) {
			case 'pineapple': {
				// diamond scales: dark crevices, golden eyes shading to green at the edge, a dark spike in each
				const skin = canvasTex( 'pineapple-skin2', 256, 256, ( ctx, W, H ) => {
					ctx.fillStyle = '#3e3312'; ctx.fillRect( 0, 0, W, H );
					const nx = 12, ny = 11, dw = W / nx, dh = H / ny;
					for ( let y = - 1; y <= ny; y ++ ) for ( let x = - 1; x <= nx; x ++ ) {
						const cx = ( x + ( y & 1 ) * 0.5 ) * dw, cy = ( y + 0.5 ) * dh;
						const gr = ctx.createRadialGradient( cx, cy - dh * 0.15, 1, cx, cy, dw * 0.55 );
						gr.addColorStop( 0, '#e8b848' ); gr.addColorStop( 0.6, '#c08a2a' ); gr.addColorStop( 1, '#6a7a2a' );
						ctx.fillStyle = gr;
						ctx.beginPath(); ctx.moveTo( cx, cy - dh * 0.47 ); ctx.lineTo( cx + dw * 0.46, cy ); ctx.lineTo( cx, cy + dh * 0.47 ); ctx.lineTo( cx - dw * 0.46, cy ); ctx.closePath(); ctx.fill();
						ctx.fillStyle = '#2a200a'; ctx.beginPath(); ctx.arc( cx, cy + dh * 0.12, 1.8, 0, PI * 2 ); ctx.fill();
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
				for ( let i = 0; i < 6; i ++ ) add( g, G.rbox( 0.045, 0.028, 0.05, 0.004, 1 ), M( 0xe0a64a, { rough: 0.7 } ), [ - 0.05 + ( i % 3 ) * 0.05, 0.012, - 0.027 + Math.floor( i / 3 ) * 0.054 ] );
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
